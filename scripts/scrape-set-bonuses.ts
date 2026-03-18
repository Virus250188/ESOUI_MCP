/**
 * Scrape set bonus descriptions from eso-hub.com using Playwright.
 * Populates the set_bonuses table in the SQLite database.
 *
 * Run with: npx tsx scripts/scrape-set-bonuses.ts
 *
 * The eso-hub.com pages are Next.js rendered. The bonus text appears in the DOM
 * in a format like:
 *   (2 items) Adds 1096 Maximum Magicka(3 items) Adds 657 Critical Chance...
 * inside a tooltip-style card with class "text-center text-xs/5".
 *
 * We split on the "(N items)" pattern to extract individual bonuses.
 */

import Database from 'better-sqlite3';
import { chromium, type Browser, type Page } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const DB_PATH = join(PROJECT_ROOT, 'data', 'eso_sets.db');

// ---- Helpers ----

/** Convert a set name to a URL slug for eso-hub.com */
function nameToSlug(name: string): string {
  return name
    .normalize('NFD')                   // decompose accented chars (â -> a + combining accent)
    .replace(/[\u0300-\u036f]/g, '')    // remove combining diacritical marks
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, '')   // remove apostrophes (curly and straight)
    .replace(/[^a-z0-9\s-]/g, '')      // remove other special chars
    .replace(/\s+/g, '-')              // spaces -> hyphens
    .replace(/-+/g, '-')               // collapse multiple hyphens
    .replace(/^-|-$/g, '');            // trim leading/trailing hyphens
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse a bonus description to extract stat info.
 * Examples:
 *   "Adds 1096 Maximum Magicka"      -> stat bonus
 *   "Adds 129 Spell Damage"          -> stat bonus
 *   "When you deal damage, ..."      -> proc bonus
 *   "Gain Minor Slayer at all times" -> unique bonus
 */
function parseBonusDescription(desc: string): {
  bonus_type: string;
  stat_type: string | null;
  stat_value: number | null;
} {
  // Common stat bonus pattern: "Adds <number> <stat>"
  const addsMatch = desc.match(/^Adds\s+(\d[\d,]*)\s+(.+)$/i);
  if (addsMatch) {
    return {
      bonus_type: 'stat',
      stat_type: addsMatch[2].trim(),
      stat_value: parseInt(addsMatch[1].replace(/,/g, ''), 10),
    };
  }

  // Proc-style bonuses
  const procPatterns = [
    /^when\s+you/i, /^after\s+/i, /^dealing\s+/i, /^taking\s+/i,
    /^while\s+/i, /^upon\s+/i, /^applying\s+/i, /^activating\s+/i,
    /^casting\s+/i, /^blocking\s+/i, /^healing\s+/i, /^consuming\s+/i,
    /^completing\s+/i, /^your\s+.*(chance|proc|trigger)/i,
  ];
  for (const pattern of procPatterns) {
    if (pattern.test(desc)) {
      return { bonus_type: 'proc', stat_type: null, stat_value: null };
    }
  }

  // Gain Minor/Major buffs
  if (/^gain\s+/i.test(desc)) {
    return { bonus_type: 'unique', stat_type: null, stat_value: null };
  }

  // "Increases ... by N ..."
  const increaseMatch = desc.match(/(?:increase|reduce|restore)s?\s+.*?by\s+(\d[\d,]*)\s*(.*)/i);
  if (increaseMatch) {
    return {
      bonus_type: 'stat',
      stat_type: increaseMatch[2]?.trim() || null,
      stat_value: parseInt(increaseMatch[1].replace(/,/g, ''), 10),
    };
  }

  return { bonus_type: 'unique', stat_type: null, stat_value: null };
}

interface SetRow {
  set_id: number;
  name_en: string;
}

interface BonusData {
  pieces_required: number;
  description: string;
  bonus_type: string;
  stat_type: string | null;
  stat_value: number | null;
}

/**
 * Extract bonuses from the page.
 * The eso-hub.com page contains bonus text in format:
 *   (2 items) Adds 1096 Maximum Magicka(3 items) Adds 657 Critical Chance...
 * We find elements containing "(N items)" and split on that pattern.
 */
async function extractBonusesFromPage(page: Page): Promise<{ pieces: number; text: string }[]> {
  return await page.evaluate(() => {
    const results: { pieces: number; text: string }[] = [];
    const seen = new Set<string>();

    // Find all elements whose text content contains "(N items)"
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      // Skip container elements with lots of children (we want the most specific element)
      if (el.children.length > 10) continue;

      const text = el.textContent?.trim() || '';
      if (!text.includes('item)') && !text.includes('items)')) continue;
      if (text.length > 2000) continue; // skip huge containers

      // Split on the "(N items)" pattern to get individual bonuses
      // The text looks like: "(2 items) Adds 1096 Maximum Magicka(3 items) Adds 657 Critical Chance"
      const parts = text.split(/\((\d)\s*items?\)/i);

      // parts will be like: ["prefix...", "2", " Adds 1096 Maximum Magicka", "3", " Adds 657 ...", ...]
      // The number is at odd indices, the description follows at even indices
      for (let i = 1; i < parts.length; i += 2) {
        const pieces = parseInt(parts[i], 10);
        const desc = (parts[i + 1] || '').trim();

        if (pieces >= 1 && pieces <= 12 && desc.length > 3 && desc.length < 500) {
          // Clean up: remove trailing UI text and "(N items)" leftovers
          let cleanDesc = desc
            .replace(/\(\d\s*items?\).*$/i, '')
            .replace(/\s*Compare this armor set with other sets.*/i, '')
            .replace(/\s*Tooltips by ESO-Hub\.com.*/i, '')
            .replace(/\s*ESO-Hub\.com.*/i, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          if (cleanDesc.length > 3) {
            const key = `${pieces}:${cleanDesc}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({ pieces, text: cleanDesc });
            }
          }
        }
      }
    }

    // Keep only the entries from the most specific (smallest) element
    // to avoid duplicates from parent elements. We do this by keeping only
    // the set of results that appears first (the deepest match).
    // Actually, our dedup with `seen` handles this already -- but if we got
    // bonuses from multiple tooltip cards on the same page (e.g., related sets),
    // we only want the first set's bonuses. We'll keep all for now and let the
    // caller decide.

    return results;
  });
}

async function scrapeSetPage(page: Page, slug: string): Promise<BonusData[] | null> {
  const url = `https://eso-hub.com/en/sets/${slug}`;

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (!response || response.status() === 404) {
      return null;
    }

    // Wait for JS rendering - look for the tooltip card or give it time
    try {
      await page.waitForSelector('.watermark-bg, [class*="watermark"], [class*="set-info"]', { timeout: 8000 });
    } catch {
      // Fallback: just wait
      await sleep(2000);
    }

    const rawBonuses = await extractBonusesFromPage(page);

    if (rawBonuses.length === 0) {
      return null;
    }

    // The page may show multiple sets (the main set + related sets in recommendations).
    // We want only the FIRST set's bonuses - typically the ones that appear first.
    // For most standard sets these are: 2pc, 3pc, 4pc, 5pc.
    // For monster sets: 1pc, 2pc.
    // For mythic: 1pc.
    // We'll take bonuses that form a reasonable set (consecutive or matching expected pattern).
    // The simplest heuristic: take the first N bonuses that have increasing/consistent piece counts.

    // Group by pieces_required
    const firstOccurrence: BonusData[] = [];
    const seenPieces = new Set<number>();

    for (const b of rawBonuses) {
      if (seenPieces.has(b.pieces)) {
        // We've hit a duplicate piece count, which likely means we're into
        // the bonuses of a second set displayed on the page. Stop here.
        break;
      }
      seenPieces.add(b.pieces);

      const parsed = parseBonusDescription(b.text);
      firstOccurrence.push({
        pieces_required: b.pieces,
        description: b.text,
        bonus_type: parsed.bonus_type,
        stat_type: parsed.stat_type,
        stat_value: parsed.stat_value,
      });
    }

    return firstOccurrence.length > 0 ? firstOccurrence : null;
  } catch (err: any) {
    if (
      err.message?.includes('net::ERR_') ||
      err.message?.includes('Navigation timeout') ||
      err.message?.includes('Timeout') ||
      err.message?.includes('ERR_CONNECTION')
    ) {
      return null;
    }
    throw err;
  }
}

// ---- Main ----

async function main() {
  console.log('=== ESO Set Bonus Scraper ===');
  console.log(`Database: ${DB_PATH}\n`);

  // Open database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get all sets
  const sets = db.prepare('SELECT set_id, name_en FROM sets ORDER BY set_id').all() as SetRow[];
  console.log(`Found ${sets.length} sets in database.\n`);

  if (sets.length === 0) {
    console.log('No sets found in database. Run import-all-sets.ts first.');
    db.close();
    return;
  }

  // Prepare insert statement
  const insertBonus = db.prepare(`
    INSERT OR IGNORE INTO set_bonuses (set_id, pieces_required, bonus_type, stat_type, stat_value, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Check which sets already have bonuses (to support resume)
  const existingBonuses = new Set<number>();
  const existingRows = db.prepare('SELECT DISTINCT set_id FROM set_bonuses').all() as { set_id: number }[];
  for (const row of existingRows) {
    existingBonuses.add(row.set_id);
  }
  if (existingBonuses.size > 0) {
    console.log(`Resuming: ${existingBonuses.size} sets already have bonuses, skipping them.\n`);
  }

  // Filter to sets that need scraping
  const setsToScrape = sets.filter(s => !existingBonuses.has(s.set_id));
  console.log(`Sets to scrape: ${setsToScrape.length}\n`);

  if (setsToScrape.length === 0) {
    console.log('All sets already have bonuses. Nothing to do.');
    db.close();
    return;
  }

  // Launch browser ONCE
  console.log('Launching browser...');
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page: Page = await context.newPage();

  // ---- Phase 1: Test with Mother's Sorrow ----
  console.log("\n--- Phase 1: Testing with Mother's Sorrow ---");
  const testSlug = 'mothers-sorrow';

  const testBonuses = await scrapeSetPage(page, testSlug);
  if (testBonuses && testBonuses.length > 0) {
    console.log(`SUCCESS: Found ${testBonuses.length} bonuses for Mother's Sorrow:`);
    for (const b of testBonuses) {
      console.log(`  ${b.pieces_required}pc: ${b.description} [${b.bonus_type}${b.stat_type ? `, ${b.stat_type}=${b.stat_value}` : ''}]`);
    }
    console.log('');
  } else {
    console.log("FAILED: Could not extract bonuses for Mother's Sorrow.");
    console.log('Dumping page content sample for debugging...');

    const sample = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      const snippets: string[] = [];
      for (const el of els) {
        const t = el.textContent?.trim() || '';
        if (t.includes('items)') && t.length < 500) {
          snippets.push(`<${el.tagName} class="${el.className}"> ${t.substring(0, 200)}`);
        }
      }
      return snippets.slice(0, 10);
    });
    for (const s of sample) {
      console.log(`  ${s}`);
    }

    await browser.close();
    db.close();
    console.log('\nAborting: fix the selectors first.');
    return;
  }

  // ---- Phase 2: Scrape all sets ----
  console.log('--- Phase 2: Scraping all sets ---\n');

  let scraped = 0;
  let failed = 0;
  const totalToScrape = setsToScrape.length;
  const failedSets: { set_id: number; name: string; slug: string }[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < setsToScrape.length; i++) {
    const set = setsToScrape[i];
    const slug = nameToSlug(set.name_en);

    try {
      const bonuses = await scrapeSetPage(page, slug);

      if (bonuses && bonuses.length > 0) {
        // Insert bonuses into DB (commit after each set for resume support)
        const insertBatch = db.transaction((items: BonusData[]) => {
          for (const b of items) {
            insertBonus.run(
              set.set_id,
              b.pieces_required,
              b.bonus_type,
              b.stat_type,
              b.stat_value,
              b.description,
            );
          }
        });
        insertBatch(bonuses);
        scraped++;
      } else {
        failed++;
        failedSets.push({ set_id: set.set_id, name: set.name_en, slug });
      }
    } catch (err: any) {
      failed++;
      failedSets.push({ set_id: set.set_id, name: set.name_en, slug });
      console.error(`  ERROR scraping [${set.set_id}] ${set.name_en}: ${err.message}`);
    }

    // Progress report
    const total = i + 1;
    if (total % 25 === 0 || total === totalToScrape) {
      const pct = ((total / totalToScrape) * 100).toFixed(1);
      console.log(`  Progress: ${total}/${totalToScrape} (${pct}%) - Success: ${scraped}, Failed: ${failed}`);
    }

    // Polite delay between requests (600-1000ms)
    await sleep(600 + Math.random() * 400);

    // Longer pause every batch to avoid rate limiting
    if (total % BATCH_SIZE === 0 && total < totalToScrape) {
      console.log(`  ... pausing 5s after batch ${Math.floor(total / BATCH_SIZE)}...`);
      await sleep(5000);
    }
  }

  // ---- Phase 3: Retry failed sets with alternate slugs ----
  if (failedSets.length > 0 && failedSets.length < setsToScrape.length) {
    console.log(`\n--- Phase 3: Retrying ${failedSets.length} failed sets with alternate slugs ---\n`);

    const retryFailed: typeof failedSets = [];

    for (let i = 0; i < failedSets.length; i++) {
      const { set_id, name, slug: originalSlug } = failedSets[i];

      // Generate alternate slug patterns
      const altSlugs: string[] = [];

      // Remove leading "the-"
      if (originalSlug.startsWith('the-')) {
        altSlugs.push(originalSlug.replace(/^the-/, ''));
      }

      // Replace apostrophes with hyphens instead of removing
      const dashApostrophe = name.toLowerCase()
        .replace(/['\u2019\u2018]/g, '-')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (dashApostrophe !== originalSlug) {
        altSlugs.push(dashApostrophe);
      }

      // Try with "set" suffix removed (some set names include "Set" at the end)
      if (originalSlug.endsWith('-set')) {
        altSlugs.push(originalSlug.replace(/-set$/, ''));
      }

      let found = false;
      for (const altSlug of altSlugs) {
        try {
          const bonuses = await scrapeSetPage(page, altSlug);
          if (bonuses && bonuses.length > 0) {
            const insertBatch = db.transaction((items: BonusData[]) => {
              for (const b of items) {
                insertBonus.run(set_id, b.pieces_required, b.bonus_type, b.stat_type, b.stat_value, b.description);
              }
            });
            insertBatch(bonuses);
            scraped++;
            failed--;
            found = true;
            break;
          }
        } catch {
          // continue to next slug
        }
        await sleep(600);
      }

      if (!found) {
        retryFailed.push({ set_id, name, slug: originalSlug });
      }

      if ((i + 1) % 25 === 0) {
        console.log(`  Retried ${i + 1}/${failedSets.length}...`);
      }
    }

    if (retryFailed.length > 0) {
      console.log(`\nSets that could not be scraped (${retryFailed.length}):`);
      for (const s of retryFailed.slice(0, 50)) {
        console.log(`  - [${s.set_id}] ${s.name} (slug: ${s.slug})`);
      }
      if (retryFailed.length > 50) {
        console.log(`  ... and ${retryFailed.length - 50} more`);
      }
    }
  }

  // Close browser
  await browser.close();
  console.log('\nBrowser closed.');

  // Final stats
  const totalBonuses = (db.prepare('SELECT COUNT(*) as count FROM set_bonuses').get() as { count: number }).count;
  const setsWithBonuses = (db.prepare('SELECT COUNT(DISTINCT set_id) as count FROM set_bonuses').get() as { count: number }).count;

  console.log('\n=== Final Results ===');
  console.log(`Total sets in DB: ${sets.length}`);
  console.log(`Sets scraped this run: ${scraped}`);
  console.log(`Sets failed this run: ${failed}`);
  console.log(`Sets skipped (already had bonuses): ${existingBonuses.size}`);
  console.log(`Total sets with bonuses: ${setsWithBonuses}`);
  console.log(`Total bonus rows in DB: ${totalBonuses}`);

  // Update metadata
  const setMeta = db.prepare('INSERT OR REPLACE INTO import_metadata (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  setMeta.run('set_bonuses_scraped', 'true');
  setMeta.run('set_bonuses_count', String(totalBonuses));
  setMeta.run('set_bonuses_scrape_date', new Date().toISOString());
  setMeta.run('set_bonuses_source', 'eso-hub.com');
  setMeta.run('sets_with_bonuses_count', String(setsWithBonuses));

  db.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
