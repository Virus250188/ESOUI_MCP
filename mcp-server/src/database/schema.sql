-- ESO Addon Development Assistant Database Schema
-- SQLite database for sets, builds, API reference, and more

-- ===== EXISTING: Sets & Builds =====

-- Sets main table
CREATE TABLE IF NOT EXISTS sets (
  set_id INTEGER PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_de TEXT,
  name_fr TEXT,
  name_es TEXT,
  set_type TEXT NOT NULL,  -- 'Overland', 'Dungeon', 'Trial', 'Arena', 'Crafted', 'Monster', 'Mythic', 'PvP'
  dlc_id INTEGER DEFAULT 0,
  dlc_name TEXT,
  is_veteran BOOLEAN DEFAULT 0,
  traits_needed INTEGER,  -- for crafted sets (3, 6, 9 traits)
  is_multi_trial BOOLEAN DEFAULT 0,
  is_jewelry BOOLEAN DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_set_type ON sets(set_type);
CREATE INDEX IF NOT EXISTS idx_dlc ON sets(dlc_id);
CREATE INDEX IF NOT EXISTS idx_crafted ON sets(traits_needed) WHERE traits_needed IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_veteran ON sets(is_veteran);

CREATE VIRTUAL TABLE IF NOT EXISTS sets_fts USING fts5(
  name_en,
  name_de,
  name_fr,
  description,
  content=sets,
  content_rowid=set_id
);

CREATE TRIGGER IF NOT EXISTS sets_ai AFTER INSERT ON sets BEGIN
  INSERT INTO sets_fts(rowid, name_en, name_de, name_fr, description)
  VALUES (new.set_id, new.name_en, new.name_de, new.name_fr, new.description);
END;

CREATE TRIGGER IF NOT EXISTS sets_ad AFTER DELETE ON sets BEGIN
  DELETE FROM sets_fts WHERE rowid = old.set_id;
END;

CREATE TRIGGER IF NOT EXISTS sets_au AFTER UPDATE ON sets BEGIN
  UPDATE sets_fts
  SET name_en = new.name_en,
      name_de = new.name_de,
      name_fr = new.name_fr,
      description = new.description
  WHERE rowid = new.set_id;
END;

-- Set bonuses
CREATE TABLE IF NOT EXISTS set_bonuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL,
  pieces_required INTEGER NOT NULL,
  bonus_type TEXT,
  stat_type TEXT,
  stat_value INTEGER,
  description TEXT,
  FOREIGN KEY(set_id) REFERENCES sets(set_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bonus_set ON set_bonuses(set_id);
CREATE INDEX IF NOT EXISTS idx_bonus_pieces ON set_bonuses(pieces_required);

-- Set locations
CREATE TABLE IF NOT EXISTS set_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL,
  zone_id INTEGER,
  zone_name_en TEXT,
  zone_name_de TEXT,
  zone_name_fr TEXT,
  drop_mechanic TEXT,
  drop_mechanic_detail TEXT,
  wayshrine_node_id INTEGER,
  FOREIGN KEY(set_id) REFERENCES sets(set_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_location_set ON set_locations(set_id);
CREATE INDEX IF NOT EXISTS idx_location_zone ON set_locations(zone_id);

-- Equipment types
CREATE TABLE IF NOT EXISTS set_equipment_types (
  set_id INTEGER NOT NULL,
  equip_type INTEGER NOT NULL,
  armor_weight TEXT,
  slot_name TEXT,
  PRIMARY KEY(set_id, equip_type),
  FOREIGN KEY(set_id) REFERENCES sets(set_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_equip_armor ON set_equipment_types(armor_weight) WHERE armor_weight IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equip_slot ON set_equipment_types(slot_name);

-- Wayshrines
CREATE TABLE IF NOT EXISTS wayshrines (
  wayshrine_node_id INTEGER PRIMARY KEY,
  zone_id INTEGER,
  zone_name_en TEXT,
  zone_name_de TEXT,
  wayshrine_name_en TEXT,
  wayshrine_name_de TEXT,
  map_id INTEGER,
  alliance TEXT
);

CREATE INDEX IF NOT EXISTS idx_wayshrine_zone ON wayshrines(zone_id);

-- Build templates
CREATE TABLE IF NOT EXISTS build_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class TEXT NOT NULL,
  role TEXT NOT NULL,
  resource TEXT NOT NULL,
  set_1_id INTEGER,
  set_2_id INTEGER,
  monster_set_id INTEGER,
  mythic_id INTEGER,
  priority INTEGER DEFAULT 1,
  patch_version TEXT,
  notes TEXT,
  FOREIGN KEY(set_1_id) REFERENCES sets(set_id),
  FOREIGN KEY(set_2_id) REFERENCES sets(set_id),
  FOREIGN KEY(monster_set_id) REFERENCES sets(set_id),
  FOREIGN KEY(mythic_id) REFERENCES sets(set_id)
);

CREATE INDEX IF NOT EXISTS idx_build_class_role ON build_templates(class, role, resource);
CREATE INDEX IF NOT EXISTS idx_build_priority ON build_templates(priority DESC);

-- Character contexts
CREATE TABLE IF NOT EXISTS character_contexts (
  context_id TEXT PRIMARY KEY,
  character_name TEXT,
  account_name TEXT,
  class TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  race TEXT,
  alliance TEXT,
  role TEXT,
  build_goal TEXT,
  dlc_owned TEXT,
  crafting_traits TEXT,
  current_sets TEXT,
  game_data TEXT,
  imported_from_game BOOLEAN DEFAULT 0,
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_context_class ON character_contexts(class);
CREATE INDEX IF NOT EXISTS idx_context_character_name ON character_contexts(character_name);
CREATE INDEX IF NOT EXISTS idx_context_imported ON character_contexts(imported_from_game);

-- Equipped sets
CREATE TABLE IF NOT EXISTS equipped_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_id TEXT NOT NULL,
  set_name TEXT NOT NULL,
  set_id INTEGER,
  slot_category TEXT NOT NULL,
  pieces_equipped INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(context_id) REFERENCES character_contexts(context_id) ON DELETE CASCADE,
  FOREIGN KEY(set_id) REFERENCES sets(set_id)
);

CREATE INDEX IF NOT EXISTS idx_equipped_context ON equipped_sets(context_id);
CREATE INDEX IF NOT EXISTS idx_equipped_set ON equipped_sets(set_id);

-- DLC information
CREATE TABLE IF NOT EXISTS dlc_info (
  dlc_id INTEGER PRIMARY KEY,
  dlc_name TEXT NOT NULL UNIQUE,
  dlc_type TEXT,
  release_date TEXT,
  description TEXT
);

INSERT OR IGNORE INTO dlc_info (dlc_id, dlc_name, dlc_type, description)
VALUES (0, 'Base Game', 'Base Game', 'Elder Scrolls Online base game content');

-- ===== NEW: API Reference Tables =====

-- API Functions (29,857+ entries from UESP)
CREATE TABLE IF NOT EXISTS api_functions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  namespace TEXT,
  category TEXT,
  signature TEXT,
  parameters TEXT,       -- JSON array
  return_values TEXT,    -- JSON array
  description TEXT,
  source_file TEXT,
  is_protected BOOLEAN DEFAULT 0,
  api_version TEXT,
  is_deprecated BOOLEAN DEFAULT 0,
  source_type TEXT              -- 'official', 'uesp_lua', 'deprecated_alias'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_func_name ON api_functions(name);
CREATE INDEX IF NOT EXISTS idx_api_func_namespace ON api_functions(namespace);
CREATE INDEX IF NOT EXISTS idx_api_func_category ON api_functions(category);

CREATE VIRTUAL TABLE IF NOT EXISTS api_functions_fts USING fts5(
  name, namespace, category, description, signature,
  content=api_functions, content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS api_func_ai AFTER INSERT ON api_functions BEGIN
  INSERT INTO api_functions_fts(rowid, name, namespace, category, description, signature)
  VALUES (new.id, new.name, new.namespace, new.category, new.description, new.signature);
END;

CREATE TRIGGER IF NOT EXISTS api_func_ad AFTER DELETE ON api_functions BEGIN
  DELETE FROM api_functions_fts WHERE rowid = old.id;
END;

-- ESO Events
CREATE TABLE IF NOT EXISTS api_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  parameters TEXT,       -- JSON array
  description TEXT,
  source_file TEXT,
  api_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_event_name ON api_events(name);
CREATE INDEX IF NOT EXISTS idx_api_event_category ON api_events(category);

CREATE VIRTUAL TABLE IF NOT EXISTS api_events_fts USING fts5(
  name, category, description,
  content=api_events, content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS api_event_ai AFTER INSERT ON api_events BEGIN
  INSERT INTO api_events_fts(rowid, name, category, description)
  VALUES (new.id, new.name, new.category, new.description);
END;

CREATE TRIGGER IF NOT EXISTS api_event_ad AFTER DELETE ON api_events BEGIN
  DELETE FROM api_events_fts WHERE rowid = old.id;
END;

-- Constants and Enums
CREATE TABLE IF NOT EXISTS api_constants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_name TEXT,
  value TEXT,
  value_type TEXT,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_constants_group ON api_constants(group_name);
CREATE INDEX IF NOT EXISTS idx_constants_name ON api_constants(name);

-- UI Control Types
CREATE TABLE IF NOT EXISTS ui_controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  control_type TEXT NOT NULL UNIQUE,
  methods TEXT,          -- JSON array
  properties TEXT,       -- JSON array
  events TEXT,           -- JSON array
  parent_type TEXT,
  xml_element TEXT,
  description TEXT
);

-- Import Metadata (tracks what data has been imported and when)
CREATE TABLE IF NOT EXISTS import_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Zones (from LibSets)
CREATE TABLE IF NOT EXISTS zones (
  zone_id INTEGER PRIMARY KEY,
  name_en TEXT,
  name_de TEXT,
  name_fr TEXT,
  zone_type TEXT,        -- 'Overland', 'Dungeon', 'Trial', 'Arena', 'PvP', 'Housing'
  dlc_id INTEGER DEFAULT 0,
  dlc_name TEXT,
  parent_zone_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_zone_type ON zones(zone_type);
CREATE INDEX IF NOT EXISTS idx_zone_dlc ON zones(dlc_id);
