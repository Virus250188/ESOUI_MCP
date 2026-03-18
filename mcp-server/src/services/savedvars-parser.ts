/**
 * Parser for ESO SavedVariables Lua files
 * Extracts character data and equipped sets from LibSetDetection
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface ESOCharacter {
  characterName: string;
  accountName: string;
  class?: string;
  level?: number;
  veteranRank?: number;
  race?: string;
  alliance?: string;
  equippedSets?: EquippedSet[];
  equippedGear?: EquippedGearPiece[];
  attributes?: CharacterAttributes;
  stats?: CharacterStats;
  championPoints?: ChampionPoints;
  skills?: CharacterSkills;
  mundusStone?: string;
}

export interface EquippedSet {
  setName: string;
  slotCategory: 'body' | 'front_bar' | 'back_bar';
  piecesEquipped: number;
}

export interface EquippedGearPiece {
  slot: string;
  name: string;
  setName: string;
  quality: number;
  trait: string;
  enchant: string;
}

export interface CharacterAttributes {
  magicka: number;
  health: number;
  stamina: number;
}

export interface CharacterStats {
  maxHealth: number;
  maxMagicka: number;
  maxStamina: number;
  spellDamage: number;
  weaponDamage: number;
  spellCrit: number;
  weaponCrit: number;
  spellPenetration: number;
  physicalPenetration: number;
  physicalResist: number;
  spellResist: number;
  healthRegen: number;
  magickaRegen: number;
  staminaRegen: number;
}

export interface ChampionPoints {
  totalCP: number;
  spentCP: number;
}

export interface CharacterSkills {
  frontBar: Skill[];
  backBar: Skill[];
}

export interface Skill {
  slot: number;
  abilityId: number;
  name: string;
}

export class SavedVarsParser {
  private savedVarsPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.savedVarsPath = customPath;
    } else {
      // Default ESO SavedVariables path
      const docsPath = join(homedir(), 'Documents');
      this.savedVarsPath = join(docsPath, 'Elder Scrolls Online', 'live', 'SavedVariables');
    }
  }

  /**
   * Check if SavedVariables directory exists
   */
  pathExists(): boolean {
    return existsSync(this.savedVarsPath);
  }

  /**
   * Get the SavedVariables path
   */
  getPath(): string {
    return this.savedVarsPath;
  }

  /**
   * Parse ESOBuildTracker.lua (our custom addon)
   */
  parseESOBuildTracker(): ESOCharacter[] {
    const filePath = join(this.savedVarsPath, 'ESOBuildTracker.lua');

    if (!existsSync(filePath)) {
      throw new Error(`ESOBuildTracker.lua not found at ${filePath}. Make sure ESOBuildTracker addon is installed and you've logged in with your characters.`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const characters: ESOCharacter[] = [];

    // Parse the Lua table structure
    // ESOBuildTrackerData = {
    //   ["@AccountName"] = {
    //     ["CharacterName"] = { ... }
    //   }
    // }

    // Extract account sections
    const accountRegex = /\["(@[^"]+)"\]\s*=\s*\{/g;
    let accountMatch;

    while ((accountMatch = accountRegex.exec(content)) !== null) {
      const accountName = accountMatch[1];
      const accountStartPos = accountMatch.index;

      // Extract the account block
      const accountBlock = this.extractBlock(content, accountStartPos);
      if (!accountBlock) continue;

      // Find character sections within this account block (first level only)
      const charRegex = /\["([^@$"]+)"\]\s*=\s*\{/g;
      let charMatch;

      while ((charMatch = charRegex.exec(accountBlock)) !== null) {
        const characterName = charMatch[1];

        // Skip if this looks like a nested property, not a character
        // Character names typically don't have lowercase property names like "stats", "skills", etc.
        const commonProperties = ['stats', 'attributes', 'skills', 'equippedGear', 'equippedSets',
                                  'championPoints', 'frontBar', 'backBar', 'mundusStone',
                                  'class', 'race', 'alliance', 'level', 'characterName', 'accountName'];
        if (commonProperties.includes(characterName)) continue;

        // Extract character data from account block
        const charBlockStart = charMatch.index;
        const charBlock = this.extractBlock(accountBlock, charBlockStart);

        if (charBlock) {
          // Parse character properties
          const classMatch = charBlock.match(/\["class"\]\s*=\s*"([^"]+)"/);
          const levelMatch = charBlock.match(/\["level"\]\s*=\s*(\d+)/);
          const raceMatch = charBlock.match(/\["race"\]\s*=\s*"([^"]+)"/);
          // Alliance can be string or number
          const allianceStringMatch = charBlock.match(/\["alliance"\]\s*=\s*"([^"]+)"/);
          const allianceNumberMatch = charBlock.match(/\["alliance"\]\s*=\s*(\d+)/);
          const allianceValue = allianceStringMatch ? allianceStringMatch[1] : (allianceNumberMatch ? this.getAllianceName(parseInt(allianceNumberMatch[1], 10)) : undefined);

          // Parse veteran rank
          const veteranRankMatch = charBlock.match(/\["veteranRank"\]\s*=\s*(\d+)/);

          // Parse mundus stone
          const mundusMatch = charBlock.match(/\["mundusStone"\]\s*=\s*"([^"]+)"/);

          // Parse attributes
          let attributes: CharacterAttributes | undefined;
          const attributesMatch = charBlock.match(/\["attributes"\]\s*=\s*\{([^}]+)\}/);
          if (attributesMatch) {
            const attrContent = attributesMatch[1];
            const magMatch = attrContent.match(/\["magicka"\]\s*=\s*(\d+)/);
            const healthMatch = attrContent.match(/\["health"\]\s*=\s*(\d+)/);
            const stamMatch = attrContent.match(/\["stamina"\]\s*=\s*(\d+)/);
            if (magMatch && healthMatch && stamMatch) {
              attributes = {
                magicka: parseInt(magMatch[1], 10),
                health: parseInt(healthMatch[1], 10),
                stamina: parseInt(stamMatch[1], 10),
              };
            }
          }

          // Parse stats
          let stats: CharacterStats | undefined;
          const statsMatch = charBlock.match(/\["stats"\]\s*=\s*\{([^}]+)\}/);
          if (statsMatch) {
            const statsContent = statsMatch[1];
            stats = {
              maxHealth: this.parseStatValue(statsContent, 'maxHealth'),
              maxMagicka: this.parseStatValue(statsContent, 'maxMagicka'),
              maxStamina: this.parseStatValue(statsContent, 'maxStamina'),
              spellDamage: this.parseStatValue(statsContent, 'spellDamage'),
              weaponDamage: this.parseStatValue(statsContent, 'weaponDamage'),
              spellCrit: this.parseStatValue(statsContent, 'spellCrit'),
              weaponCrit: this.parseStatValue(statsContent, 'weaponCrit'),
              spellPenetration: this.parseStatValue(statsContent, 'spellPenetration'),
              physicalPenetration: this.parseStatValue(statsContent, 'physicalPenetration'),
              physicalResist: this.parseStatValue(statsContent, 'physicalResist'),
              spellResist: this.parseStatValue(statsContent, 'spellResist'),
              healthRegen: this.parseStatValue(statsContent, 'healthRegen'),
              magickaRegen: this.parseStatValue(statsContent, 'magickaRegen'),
              staminaRegen: this.parseStatValue(statsContent, 'staminaRegen'),
            };
          }

          // Parse champion points
          let championPoints: ChampionPoints | undefined;
          const cpMatch = charBlock.match(/\["championPoints"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);
          if (cpMatch) {
            const cpContent = cpMatch[1];
            const totalCPMatch = cpContent.match(/\["totalCP"\]\s*=\s*(\d+)/);
            const spentCPMatch = cpContent.match(/\["spentCP"\]\s*=\s*(\d+)/);

            if (totalCPMatch) {
              championPoints = {
                totalCP: parseInt(totalCPMatch[1], 10),
                spentCP: spentCPMatch ? parseInt(spentCPMatch[1], 10) : 0,
              };
            }
          }

          // Parse skills
          let skills: CharacterSkills | undefined;
          const skillsMatch = charBlock.match(/\["skills"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);
          if (skillsMatch) {
            const skillsContent = skillsMatch[1];
            const frontBarMatch = skillsContent.match(/\["frontBar"\]\s*=\s*\{([^}]*)\}/);
            const backBarMatch = skillsContent.match(/\["backBar"\]\s*=\s*\{([^}]*)\}/);

            skills = {
              frontBar: [],
              backBar: [],
            };

            if (frontBarMatch) {
              skills.frontBar = this.parseSkillBar(frontBarMatch[1]);
            }
            if (backBarMatch) {
              skills.backBar = this.parseSkillBar(backBarMatch[1]);
            }
          }

          // Parse equipped gear (all items, including non-set)
          const equippedGear: EquippedGearPiece[] = [];
          const gearMatch = charBlock.match(/\["equippedGear"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);

          if (gearMatch) {
            const gearContent = gearMatch[1];
            // Parse each gear entry: { ["slot"] = "...", ["name"] = "...", ["setName"] = "...", ["quality"] = N, ["trait"] = "...", ["enchant"] = "..." }
            const gearEntryRegex = /\{[^}]*\["slot"\]\s*=\s*"([^"]+)"[^}]*\["name"\]\s*=\s*"([^"]+)"[^}]*\["setName"\]\s*=\s*"([^"]+)"[^}]*\["quality"\]\s*=\s*(\d+)[^}]*\["trait"\]\s*=\s*"([^"]+)"[^}]*\["enchant"\]\s*=\s*"([^"]+)"[^}]*\}/g;
            let gearItemMatch;

            while ((gearItemMatch = gearEntryRegex.exec(gearContent)) !== null) {
              equippedGear.push({
                slot: gearItemMatch[1],
                name: this.cleanGermanText(gearItemMatch[2]),
                setName: gearItemMatch[3],
                quality: parseInt(gearItemMatch[4], 10),
                trait: this.cleanGermanText(gearItemMatch[5]),
                enchant: this.cleanGermanText(gearItemMatch[6]),
              });
            }
          }

          // Parse equipped sets
          const equippedSets: EquippedSet[] = [];
          const setsMatch = charBlock.match(/\["equippedSets"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);

          if (setsMatch) {
            const setsContent = setsMatch[1];
            // Parse each set entry: { ["setName"] = "...", ["slotCategory"] = "...", ["piecesEquipped"] = N }
            const setEntryRegex = /\{[^}]*\["setName"\]\s*=\s*"([^"]+)"[^}]*\["slotCategory"\]\s*=\s*"([^"]+)"[^}]*\["piecesEquipped"\]\s*=\s*(\d+)[^}]*\}/g;
            let setMatch;

            while ((setMatch = setEntryRegex.exec(setsContent)) !== null) {
              equippedSets.push({
                setName: setMatch[1],
                slotCategory: setMatch[2] as any,
                piecesEquipped: parseInt(setMatch[3], 10),
              });
            }
          }

          characters.push({
            characterName,
            accountName,
            class: classMatch ? this.cleanGermanText(classMatch[1]) : undefined,
            level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
            veteranRank: veteranRankMatch ? parseInt(veteranRankMatch[1], 10) : undefined,
            race: raceMatch ? this.cleanGermanText(raceMatch[1]) : undefined,
            alliance: allianceValue,
            mundusStone: mundusMatch ? mundusMatch[1] : undefined,
            attributes,
            stats,
            championPoints,
            skills,
            equippedGear: equippedGear.length > 0 ? equippedGear : undefined,
            equippedSets: equippedSets.length > 0 ? equippedSets : undefined,
          });
        }
      }
    }

    return characters;
  }

  /**
   * Extract a Lua table block starting at a given position
   */
  private extractBlock(content: string, startPos: number): string | null {
    let depth = 0;
    let blockStart = -1;
    let blockEnd = -1;

    for (let i = startPos; i < content.length; i++) {
      const char = content[i];

      if (char === '{') {
        if (depth === 0) blockStart = i;
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          blockEnd = i;
          break;
        }
      }
    }

    if (blockStart !== -1 && blockEnd !== -1) {
      return content.slice(blockStart, blockEnd + 1);
    }

    return null;
  }

  /**
   * Parse LibSetDetection.lua to extract character data (Legacy - for reference)
   */
  parseLibSetDetection(): ESOCharacter[] {
    const filePath = join(this.savedVarsPath, 'LibSetDetection.lua');

    if (!existsSync(filePath)) {
      throw new Error(`LibSetDetection.lua not found at ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const characters: ESOCharacter[] = [];

    // Extract account name
    const accountMatch = content.match(/\["(@[^"]+)"\]/);
    const accountName = accountMatch ? accountMatch[1] : '@Unknown';

    // Find all character sections
    // Pattern: ["CharacterName"] = { ... }
    const characterRegex = /\["([^@$][^"]+)"\]\s*=\s*\{/g;
    let match;

    while ((match = characterRegex.exec(content)) !== null) {
      const characterName = match[1];

      // Skip special keys like $AccountWide
      if (characterName.startsWith('$')) continue;

      // Extract character data block
      const startPos = match.index;
      const charData = this.extractCharacterBlock(content, startPos);

      if (charData) {
        characters.push({
          characterName,
          accountName,
          ...charData,
        });
      }
    }

    return characters;
  }

  /**
   * Extract character data block from Lua content
   */
  private extractCharacterBlock(content: string, startPos: number): Partial<ESOCharacter> | null {
    // Find the matching closing brace for this character block
    let depth = 0;
    let inBlock = false;
    let blockStart = startPos;
    let blockEnd = startPos;

    for (let i = startPos; i < content.length; i++) {
      const char = content[i];

      if (char === '{') {
        depth++;
        if (depth === 1) {
          inBlock = true;
          blockStart = i;
        }
      } else if (char === '}') {
        depth--;
        if (depth === 0 && inBlock) {
          blockEnd = i;
          break;
        }
      }
    }

    if (!inBlock || blockEnd <= blockStart) return null;

    const blockContent = content.slice(blockStart, blockEnd + 1);

    // Parse equipped sets from the block
    const equippedSets = this.parseEquippedSets(blockContent);

    // Try to extract class, level, race (if available in SavedVars)
    const classMatch = blockContent.match(/\["class"\]\s*=\s*"([^"]+)"/);
    const levelMatch = blockContent.match(/\["level"\]\s*=\s*(\d+)/);
    const raceMatch = blockContent.match(/\["race"\]\s*=\s*"([^"]+)"/);
    const allianceMatch = blockContent.match(/\["alliance"\]\s*=\s*"([^"]+)"/);

    return {
      class: classMatch ? classMatch[1] : undefined,
      level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
      race: raceMatch ? raceMatch[1] : undefined,
      alliance: allianceMatch ? allianceMatch[1] : undefined,
      equippedSets,
    };
  }

  /**
   * Parse equipped sets from character block
   * LibSetDetection stores sets as:
   * ["sets"] = {
   *   ["body"] = { ["SetName"] = 5 },
   *   ["frontBar"] = { ["SetName"] = 2 }
   * }
   */
  private parseEquippedSets(blockContent: string): EquippedSet[] {
    const sets: EquippedSet[] = [];

    // Extract sets section
    const setsMatch = blockContent.match(/\["sets"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);
    if (!setsMatch) return sets;

    const setsContent = setsMatch[1];

    // Parse body sets
    const bodyMatch = setsContent.match(/\["body"\]\s*=\s*\{([^}]*)\}/);
    if (bodyMatch) {
      const bodySets = this.parseSetCategory(bodyMatch[1], 'body');
      sets.push(...bodySets);
    }

    // Parse front bar sets
    const frontBarMatch = setsContent.match(/\["frontBar"\]\s*=\s*\{([^}]*)\}/);
    if (frontBarMatch) {
      const frontBarSets = this.parseSetCategory(frontBarMatch[1], 'front_bar');
      sets.push(...frontBarSets);
    }

    // Parse back bar sets
    const backBarMatch = setsContent.match(/\["backBar"\]\s*=\s*\{([^}]*)\}/);
    if (backBarMatch) {
      const backBarSets = this.parseSetCategory(backBarMatch[1], 'back_bar');
      sets.push(...backBarSets);
    }

    return sets;
  }

  /**
   * Parse individual set category (body, frontBar, backBar)
   */
  private parseSetCategory(
    categoryContent: string,
    category: 'body' | 'front_bar' | 'back_bar'
  ): EquippedSet[] {
    const sets: EquippedSet[] = [];

    // Pattern: ["SetName"] = numberOfPieces
    const setRegex = /\["([^"]+)"\]\s*=\s*(\d+)/g;
    let match;

    while ((match = setRegex.exec(categoryContent)) !== null) {
      const setName = match[1];
      const pieces = parseInt(match[2], 10);

      sets.push({
        setName,
        slotCategory: category,
        piecesEquipped: pieces,
      });
    }

    return sets;
  }

  /**
   * Parse a single stat value from Lua content
   */
  private parseStatValue(content: string, statName: string): number {
    const regex = new RegExp(`\\["${statName}"\\]\\s*=\\s*(\\d+)`);
    const match = content.match(regex);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Parse skill bar (front or back)
   */
  private parseSkillBar(barContent: string): Skill[] {
    const skills: Skill[] = [];
    // Match skill entries: { ["slot"] = N, ["abilityId"] = N, ["name"] = "..." }
    const skillRegex = /\{[^}]*\["slot"\]\s*=\s*(\d+)[^}]*\["abilityId"\]\s*=\s*(\d+)[^}]*\["name"\]\s*=\s*"([^"]+)"[^}]*\}/g;
    let match;

    while ((match = skillRegex.exec(barContent)) !== null) {
      skills.push({
        slot: parseInt(match[1], 10),
        abilityId: parseInt(match[2], 10),
        name: match[3],
      });
    }

    return skills;
  }

  /**
   * Convert ESO alliance ID to name
   */
  private getAllianceName(allianceId: number): string {
    const allianceMap: { [key: number]: string } = {
      1: 'Aldmeri Dominion',
      2: 'Ebonheart Pact',
      3: 'Daggerfall Covenant',
    };
    return allianceMap[allianceId] || 'Unknown';
  }

  /**
   * Clean German text by removing gender markers (^f, ^p, etc.)
   */
  private cleanGermanText(text: string): string {
    // Remove gender markers like ^f (female), ^p (plural), ^m (male)
    // Also split on || to get the singular form
    return text.split('||')[0].replace(/\^[fpmn]/g, '').trim();
  }

  /**
   * List all available SavedVariables files
   */
  listAvailableAddons(): string[] {
    if (!existsSync(this.savedVarsPath)) {
      return [];
    }

    const files = readdirSync(this.savedVarsPath);
    return files.filter((f: string) => f.endsWith('.lua'));
  }
}
