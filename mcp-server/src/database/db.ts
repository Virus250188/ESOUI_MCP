import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  ESOSet,
  SetBonus,
  SetLocation,
  SetEquipmentType,
  SetSummary,
  SetDetails,
  Wayshrine,
} from '../types/sets.js';
import type {
  BuildTemplate,
  CharacterContext,
  CharacterClass,
  CharacterRole,
  ResourceType,
} from '../types/builds.js';
import type {
  APIFunction,
  APIEvent,
  APIConstant,
  UIControl,
} from '../types/api-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '../../../');

/** Safe JSON parse - returns undefined on failure instead of throwing */
function safeJsonParse(value: string | null | undefined): any {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

/** Sanitize a query string for FTS5 MATCH - escape special syntax characters */
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators and wrap in double quotes for literal matching
  const cleaned = query.replace(/['"(){}^*:]/g, ' ').trim();
  if (!cleaned) return '""';
  return `"${cleaned}"`;
}
const DB_PATH = join(PROJECT_ROOT, 'data', 'eso_sets.db');
const SCHEMA_PATH = join(PROJECT_ROOT, 'mcp-server', 'src', 'database', 'schema.sql');

export class ESO_Database {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initialize();
  }

  private initialize(): void {
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    this.db.exec(schema);
  }

  // ===== SET QUERIES =====

  searchSets(params: {
    query?: string;
    set_type?: string | string[];
    dlc_id?: number;
    armor_weight?: string;
    limit?: number;
    traits_needed?: number;
  }): SetSummary[] {
    let sql = `
      SELECT
        s.set_id,
        s.name_en as name,
        s.set_type,
        s.dlc_name,
        s.traits_needed,
        s.is_veteran,
        s.description as short_description
      FROM sets s
      WHERE 1=1
    `;
    const params_values: any[] = [];

    if (params.query) {
      sql += ` AND s.set_id IN (
        SELECT rowid FROM sets_fts WHERE sets_fts MATCH ?
      )`;
      params_values.push(sanitizeFtsQuery(params.query));
    }

    if (params.set_type) {
      if (Array.isArray(params.set_type)) {
        sql += ` AND s.set_type IN (${params.set_type.map(() => '?').join(',')})`;
        params_values.push(...params.set_type);
      } else {
        sql += ` AND s.set_type = ?`;
        params_values.push(params.set_type);
      }
    }

    if (params.dlc_id !== undefined) {
      sql += ` AND s.dlc_id = ?`;
      params_values.push(params.dlc_id);
    }

    if (params.traits_needed !== undefined) {
      sql += ` AND s.traits_needed = ?`;
      params_values.push(params.traits_needed);
    }

    if (params.armor_weight) {
      sql += ` AND EXISTS (
        SELECT 1 FROM set_equipment_types et
        WHERE et.set_id = s.set_id AND et.armor_weight = ?
      )`;
      params_values.push(params.armor_weight);
    }

    sql += ` ORDER BY s.set_id`;

    if (params.limit) {
      sql += ` LIMIT ?`;
      params_values.push(params.limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params_values) as SetSummary[];
  }

  getSetById(set_id: number): ESOSet | undefined {
    const stmt = this.db.prepare(`SELECT * FROM sets WHERE set_id = ?`);
    return stmt.get(set_id) as ESOSet | undefined;
  }

  getSetByName(name: string): ESOSet | undefined {
    const stmt = this.db.prepare(`SELECT * FROM sets WHERE name_en = ? OR name_de = ? OR name_fr = ?`);
    return stmt.get(name, name, name) as ESOSet | undefined;
  }

  getSetDetails(set_id: number): SetDetails | null {
    const set = this.getSetById(set_id);
    if (!set) return null;

    const bonuses = this.getSetBonuses(set_id);
    const locations = this.getSetLocations(set_id);
    const equipment_types = this.getSetEquipmentTypes(set_id);

    const wayshrines: Wayshrine[] = [];
    for (const loc of locations) {
      if (loc.wayshrine_node_id) {
        const ws = this.getWayshrine(loc.wayshrine_node_id);
        if (ws) wayshrines.push(ws);
      }
    }

    return {
      set,
      bonuses,
      locations,
      equipment_types,
      wayshrines: wayshrines.length > 0 ? wayshrines : undefined,
    };
  }

  getSetBonuses(set_id: number): SetBonus[] {
    const stmt = this.db.prepare(`SELECT * FROM set_bonuses WHERE set_id = ? ORDER BY pieces_required`);
    return stmt.all(set_id) as SetBonus[];
  }

  getSetLocations(set_id: number): SetLocation[] {
    const stmt = this.db.prepare(`SELECT * FROM set_locations WHERE set_id = ?`);
    return stmt.all(set_id) as SetLocation[];
  }

  getSetEquipmentTypes(set_id: number): SetEquipmentType[] {
    const stmt = this.db.prepare(`SELECT * FROM set_equipment_types WHERE set_id = ?`);
    return stmt.all(set_id) as SetEquipmentType[];
  }

  getWayshrine(wayshrine_node_id: number): Wayshrine | undefined {
    const stmt = this.db.prepare(`SELECT * FROM wayshrines WHERE wayshrine_node_id = ?`);
    return stmt.get(wayshrine_node_id) as Wayshrine | undefined;
  }

  getSetsByCategory(category: string): SetSummary[] {
    const categories: Record<string, any> = {
      beginner_friendly: { set_type: 'Crafted', dlc_id: 0 },
      endgame_dps: { set_type: ['Trial', 'Arena'] },
      pvp_meta: { set_type: 'PvP' },
      crafted_6_trait: { set_type: 'Crafted', traits_needed: 6 },
      crafted_9_trait: { set_type: 'Crafted', traits_needed: 9 },
      monster_sets: { set_type: 'Monster' },
      mythic_items: { set_type: 'Mythic' },
    };

    const filter = categories[category];
    if (!filter) return [];
    return this.searchSets(filter);
  }

  // ===== BUILD TEMPLATES =====

  getBuildTemplates(params: {
    class?: CharacterClass;
    role?: CharacterRole;
    resource?: ResourceType;
  }): BuildTemplate[] {
    let sql = `SELECT * FROM build_templates WHERE 1=1`;
    const params_values: any[] = [];

    if (params.class) {
      sql += ` AND class = ?`;
      params_values.push(params.class);
    }
    if (params.role) {
      sql += ` AND role = ?`;
      params_values.push(params.role);
    }
    if (params.resource) {
      sql += ` AND resource = ?`;
      params_values.push(params.resource);
    }

    sql += ` ORDER BY priority DESC LIMIT 10`;
    const stmt = this.db.prepare(sql);
    return stmt.all(...params_values) as BuildTemplate[];
  }

  // ===== CHARACTER CONTEXT =====

  saveCharacterContext(context: CharacterContext): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO character_contexts (
        context_id, class, level, role, build_goal,
        dlc_owned, crafting_traits, current_sets, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
      context.context_id,
      context.class,
      context.level,
      context.role || null,
      context.build_goal || null,
      context.dlc_owned ? JSON.stringify(context.dlc_owned) : null,
      context.crafting_traits ? JSON.stringify(context.crafting_traits) : null,
      context.current_sets ? JSON.stringify(context.current_sets) : null
    );
  }

  getCharacterContext(context_id: string): CharacterContext | undefined {
    const stmt = this.db.prepare(`SELECT * FROM character_contexts WHERE context_id = ?`);
    const row = stmt.get(context_id) as any;
    if (!row) return undefined;

    return {
      ...row,
      dlc_owned: safeJsonParse(row.dlc_owned),
      crafting_traits: safeJsonParse(row.crafting_traits),
      current_sets: safeJsonParse(row.current_sets),
    };
  }

  // ===== CHARACTER IMPORT =====

  importCharacterFromGame(charData: {
    character_name: string;
    account_name: string;
    class?: string;
    level?: number;
    race?: string;
    alliance?: string;
    attributes?: any;
    stats?: any;
    champion_points?: any;
    skills?: any;
    mundus_stone?: string;
    equipped_gear?: any;
    equipped_sets?: Array<{
      set_name: string;
      slot_category: string;
      pieces_equipped: number;
    }>;
  }): string {
    const context_id = `${charData.account_name}_${charData.character_name}`;

    const gameData = JSON.stringify({
      attributes: charData.attributes,
      stats: charData.stats,
      championPoints: charData.champion_points,
      skills: charData.skills,
      mundusStone: charData.mundus_stone,
      equippedGear: charData.equipped_gear,
    });

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO character_contexts (
        context_id, character_name, account_name, class, level, race, alliance,
        imported_from_game, game_data, last_synced, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    // Wrap in transaction to prevent data loss on crash
    const importTransaction = this.db.transaction(() => {
      stmt.run(
        context_id,
        charData.character_name,
        charData.account_name,
        charData.class || null,
        charData.level || null,
        charData.race || null,
        charData.alliance || null,
        gameData
      );

      const deleteStmt = this.db.prepare(`DELETE FROM equipped_sets WHERE context_id = ?`);
      deleteStmt.run(context_id);

      if (charData.equipped_sets && charData.equipped_sets.length > 0) {
        const insertSetStmt = this.db.prepare(`
          INSERT INTO equipped_sets (context_id, set_name, slot_category, pieces_equipped, set_id)
          VALUES (?, ?, ?, ?, (SELECT set_id FROM sets WHERE name_en = ? OR name_de = ? LIMIT 1))
        `);

        for (const equippedSet of charData.equipped_sets) {
          insertSetStmt.run(
            context_id,
            equippedSet.set_name,
            equippedSet.slot_category,
            equippedSet.pieces_equipped,
            equippedSet.set_name,
            equippedSet.set_name
          );
        }
      }
    });
    importTransaction();

    return context_id;
  }

  listImportedCharacters(): Array<{
    context_id: string;
    character_name: string;
    account_name: string;
    class?: string;
    level?: number;
    last_synced?: string;
    equipped_sets_count: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        c.context_id, c.character_name, c.account_name,
        c.class, c.level, c.race, c.alliance, c.last_synced,
        COUNT(e.id) as equipped_sets_count
      FROM character_contexts c
      LEFT JOIN equipped_sets e ON c.context_id = e.context_id
      WHERE c.imported_from_game = 1
      GROUP BY c.context_id
      ORDER BY c.last_synced DESC
    `);
    return stmt.all() as any[];
  }

  getCharacterWithSets(context_id: string): {
    character: CharacterContext;
    equipped_sets: Array<{
      set_name: string;
      set_id?: number;
      slot_category: string;
      pieces_equipped: number;
    }>;
  } | null {
    const charStmt = this.db.prepare(`SELECT * FROM character_contexts WHERE context_id = ?`);
    const character = charStmt.get(context_id) as any;
    if (!character) return null;

    const setsStmt = this.db.prepare(`
      SELECT set_name, set_id, slot_category, pieces_equipped
      FROM equipped_sets WHERE context_id = ?
    `);
    const equipped_sets = setsStmt.all(context_id) as any[];

    return {
      character: {
        ...character,
        dlc_owned: safeJsonParse(character.dlc_owned),
        crafting_traits: safeJsonParse(character.crafting_traits),
        current_sets: safeJsonParse(character.current_sets),
      },
      equipped_sets,
    };
  }

  findCharacterByName(characterName: string): string | null {
    const stmt = this.db.prepare(`
      SELECT context_id FROM character_contexts WHERE character_name LIKE ? LIMIT 1
    `);
    const result = stmt.get(`%${characterName}%`) as any;
    return result ? result.context_id : null;
  }

  // ===== API REFERENCE QUERIES =====

  searchApiFunctions(params: {
    query?: string;
    category?: string;
    namespace?: string;
    limit?: number;
  }): APIFunction[] {
    let sql = `SELECT * FROM api_functions WHERE 1=1`;
    const values: any[] = [];

    if (params.query) {
      // Try FTS first, fall back to LIKE
      sql = `
        SELECT af.* FROM api_functions af
        WHERE af.id IN (
          SELECT rowid FROM api_functions_fts WHERE api_functions_fts MATCH ?
        )
      `;
      values.push(sanitizeFtsQuery(params.query));

      if (params.category) {
        sql += ` AND af.category = ?`;
        values.push(params.category);
      }
      if (params.namespace) {
        sql += ` AND af.namespace = ?`;
        values.push(params.namespace);
      }
    } else {
      if (params.category) {
        sql += ` AND category = ?`;
        values.push(params.category);
      }
      if (params.namespace) {
        sql += ` AND namespace = ?`;
        values.push(params.namespace);
      }
    }

    // Prioritize official docs over UESP, non-deprecated over deprecated
    sql += ` ORDER BY is_deprecated ASC, CASE source_type WHEN 'official' THEN 0 WHEN 'uesp_lua' THEN 1 ELSE 2 END, name LIMIT ?`;
    values.push(params.limit || 50);

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...values) as APIFunction[];
    } catch {
      // FTS query failed, fall back to LIKE search
      if (params.query) {
        const safeQuery = params.query.replace(/[%_]/g, '');
        let fallbackSql = `SELECT * FROM api_functions WHERE name LIKE ?`;
        const fallbackValues: any[] = [`%${safeQuery}%`];
        if (params.category) {
          fallbackSql += ` AND category = ?`;
          fallbackValues.push(params.category);
        }
        if (params.namespace) {
          fallbackSql += ` AND namespace = ?`;
          fallbackValues.push(params.namespace);
        }
        fallbackSql += ` ORDER BY name LIMIT ?`;
        fallbackValues.push(params.limit || 50);
        const stmt = this.db.prepare(fallbackSql);
        return stmt.all(...fallbackValues) as APIFunction[];
      }
      return [];
    }
  }

  getFunctionByName(name: string): APIFunction | undefined {
    // Prefer official docs over UESP, non-deprecated over deprecated
    const stmt = this.db.prepare(`SELECT * FROM api_functions WHERE name = ? ORDER BY is_deprecated ASC, CASE source_type WHEN 'official' THEN 0 WHEN 'uesp_lua' THEN 1 ELSE 2 END LIMIT 1`);
    return stmt.get(name) as APIFunction | undefined;
  }

  getRelatedFunctions(name: string, limit: number = 10): APIFunction[] {
    // Find functions with similar prefix
    const prefix = name.replace(/[A-Z][a-z]+$/, '');
    if (prefix.length < 3) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM api_functions WHERE name LIKE ? AND name != ? ORDER BY name LIMIT ?
    `);
    return stmt.all(`${prefix}%`, name, limit) as APIFunction[];
  }

  searchEvents(params: {
    query?: string;
    category?: string;
    limit?: number;
  }): APIEvent[] {
    let sql = `SELECT * FROM api_events WHERE 1=1`;
    const values: any[] = [];

    if (params.query) {
      sql = `
        SELECT ae.* FROM api_events ae
        WHERE ae.id IN (
          SELECT rowid FROM api_events_fts WHERE api_events_fts MATCH ?
        )
      `;
      values.push(sanitizeFtsQuery(params.query));

      if (params.category) {
        sql += ` AND ae.category = ?`;
        values.push(params.category);
      }
    } else {
      if (params.category) {
        sql += ` AND category = ?`;
        values.push(params.category);
      }
    }

    sql += ` ORDER BY name LIMIT ?`;
    values.push(params.limit || 50);

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...values) as APIEvent[];
    } catch {
      if (params.query) {
        const safeQuery = params.query.replace(/[%_]/g, '');
        let fallbackSql = `SELECT * FROM api_events WHERE name LIKE ?`;
        const fallbackValues: any[] = [`%${safeQuery}%`];
        if (params.category) {
          fallbackSql += ` AND category = ?`;
          fallbackValues.push(params.category);
        }
        fallbackSql += ` ORDER BY name LIMIT ?`;
        fallbackValues.push(params.limit || 50);
        const stmt = this.db.prepare(fallbackSql);
        return stmt.all(...fallbackValues) as APIEvent[];
      }
      return [];
    }
  }

  getEventByName(name: string): APIEvent | undefined {
    const stmt = this.db.prepare(`SELECT * FROM api_events WHERE name = ?`);
    return stmt.get(name) as APIEvent | undefined;
  }

  searchConstants(params: {
    query?: string;
    group_name?: string;
    limit?: number;
  }): APIConstant[] {
    let sql = `SELECT * FROM api_constants WHERE 1=1`;
    const values: any[] = [];

    if (params.query) {
      sql += ` AND name LIKE ?`;
      values.push(`%${params.query}%`);
    }
    if (params.group_name) {
      sql += ` AND group_name = ?`;
      values.push(params.group_name);
    }

    sql += ` ORDER BY group_name, name LIMIT ?`;
    values.push(params.limit || 100);

    const stmt = this.db.prepare(sql);
    return stmt.all(...values) as APIConstant[];
  }

  getConstantGroups(): Array<{ group_name: string; count: number }> {
    const stmt = this.db.prepare(`
      SELECT group_name, COUNT(*) as count FROM api_constants
      WHERE group_name IS NOT NULL
      GROUP BY group_name ORDER BY group_name
    `);
    return stmt.all() as any[];
  }

  getUiControlInfo(controlType: string): UIControl | undefined {
    const stmt = this.db.prepare(`SELECT * FROM ui_controls WHERE control_type = ?`);
    return stmt.get(controlType) as UIControl | undefined;
  }

  listUiControls(): UIControl[] {
    const stmt = this.db.prepare(`SELECT * FROM ui_controls ORDER BY control_type`);
    return stmt.all() as UIControl[];
  }

  // ===== IMPORT METADATA =====

  getImportMetadata(key: string): string | null {
    const stmt = this.db.prepare(`SELECT value FROM import_metadata WHERE key = ?`);
    const result = stmt.get(key) as any;
    return result ? result.value : null;
  }

  setImportMetadata(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO import_metadata (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(key, value);
  }

  // ===== BULK INSERT HELPERS =====

  insertApiFunction(func: Omit<APIFunction, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO api_functions (name, namespace, category, signature, parameters, return_values, description, source_file, is_protected, api_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      func.name, func.namespace || null, func.category || null,
      func.signature || null, func.parameters || null, func.return_values || null,
      func.description || null, func.source_file || null,
      func.is_protected ? 1 : 0, func.api_version || null
    );
  }

  insertApiEvent(event: Omit<APIEvent, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO api_events (name, category, parameters, description, source_file, api_version)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.name, event.category || null, event.parameters || null,
      event.description || null, event.source_file || null, event.api_version || null
    );
  }

  insertApiConstant(constant: Omit<APIConstant, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO api_constants (name, group_name, value, value_type, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      constant.name, constant.group_name || null, constant.value || null,
      constant.value_type || null, constant.description || null
    );
  }

  insertUiControl(control: Omit<UIControl, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ui_controls (control_type, methods, properties, events, parent_type, xml_element, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      control.control_type, control.methods || null, control.properties || null,
      control.events || null, control.parent_type || null,
      control.xml_element || null, control.description || null
    );
  }

  getApiFunctionCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM api_functions`);
    return (stmt.get() as any).count;
  }

  getApiEventCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM api_events`);
    return (stmt.get() as any).count;
  }

  getApiConstantCount(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM api_constants`);
    return (stmt.get() as any).count;
  }

  // Transaction wrapper for bulk operations
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ===== ZONES =====

  searchZones(params: {
    query?: string;
    zone_type?: string;
    limit?: number;
  }): any[] {
    let sql = `SELECT * FROM zones WHERE 1=1`;
    const values: any[] = [];

    if (params.query) {
      sql += ` AND (name_en LIKE ? OR name_de LIKE ?)`;
      values.push(`%${params.query}%`, `%${params.query}%`);
    }
    if (params.zone_type) {
      sql += ` AND zone_type = ?`;
      values.push(params.zone_type);
    }

    sql += ` ORDER BY name_en LIMIT ?`;
    values.push(params.limit || 50);

    const stmt = this.db.prepare(sql);
    return stmt.all(...values);
  }

  getZoneSets(zoneId: number): SetSummary[] {
    const stmt = this.db.prepare(`
      SELECT s.set_id, s.name_en as name, s.set_type, s.dlc_name,
             s.traits_needed, s.is_veteran, s.description as short_description
      FROM sets s
      JOIN set_locations sl ON s.set_id = sl.set_id
      WHERE sl.zone_id = ?
    `);
    return stmt.all(zoneId) as SetSummary[];
  }

  // ===== UTILITY =====

  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const db = new ESO_Database();
