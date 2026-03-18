/**
 * Import all 600+ sets from LibSets + sets.json into the SQLite database.
 * Also imports zone/wayshrine data and populates set_locations with zone names.
 * Run with: npx tsx scripts/import-all-sets.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const DB_PATH = join(PROJECT_ROOT, 'data', 'eso_sets.db');
const SETS_JSON = join(PROJECT_ROOT, 'data', 'json', 'sets.json');
const LIBSETS_DATA = join(PROJECT_ROOT, 'addon_Libs', 'LibSets', 'Data', 'LibSets_Data_Sets.lua');
const LIBSETS_ZONES = join(PROJECT_ROOT, 'addon_Libs', 'LibSets', 'Data', 'LibSets_Data_Zones.lua');
const DLC_JSON = join(PROJECT_ROOT, 'data', 'json', 'dlc_info.json');

// Map LibSets set type constants to our types
const SET_TYPE_MAP: Record<string, string> = {
  'LIBSETS_SETTYPE_OVERLAND': 'Overland',
  'LIBSETS_SETTYPE_DUNGEON': 'Dungeon',
  'LIBSETS_SETTYPE_TRIAL': 'Trial',
  'LIBSETS_SETTYPE_ARENA': 'Arena',
  'LIBSETS_SETTYPE_CRAFTED': 'Crafted',
  'LIBSETS_SETTYPE_MONSTER': 'Monster',
  'LIBSETS_SETTYPE_MYTHIC': 'Mythic',
  'LIBSETS_SETTYPE_CYRODIIL': 'PvP',
  'LIBSETS_SETTYPE_CYRODIIL_MONSTER': 'PvP',
  'LIBSETS_SETTYPE_BATTLEGROUND': 'PvP',
  'LIBSETS_SETTYPE_IMPERIALCITY': 'PvP',
  'LIBSETS_SETTYPE_IMPERIALCITY_MONSTER': 'PvP',
  'LIBSETS_SETTYPE_CLASS': 'Overland',
  'LIBSETS_SETTYPE_SPECIAL': 'Overland',
  'LIBSETS_SETTYPE_DAILYRANDOMDUNGEONANDICREWARD': 'Dungeon',
};

// Map LibSets DLC constants to names and IDs
// Matches LibSets_Constants_All.lua possibleDlcIds exactly (including NO_DLC entries)
const DLC_MAP: Record<string, { id: number; name: string }> = {
  'DLC_BASE_GAME':                  { id: 0,  name: 'Base Game' },
  'DLC_IMPERIAL_CITY':              { id: 1,  name: 'Imperial City' },
  'DLC_ORSINIUM':                   { id: 2,  name: 'Orsinium' },
  'DLC_THIEVES_GUILD':              { id: 3,  name: 'Thieves Guild' },
  'DLC_DARK_BROTHERHOOD':           { id: 4,  name: 'Dark Brotherhood' },
  'DLC_SHADOWS_OF_THE_HIST':        { id: 5,  name: 'Shadows of the Hist' },
  'DLC_MORROWIND':                  { id: 6,  name: 'Morrowind' },
  'DLC_HORNS_OF_THE_REACH':         { id: 7,  name: 'Horns of the Reach' },
  'DLC_CLOCKWORK_CITY':             { id: 8,  name: 'Clockwork City' },
  'DLC_DRAGON_BONES':               { id: 9,  name: 'Dragon Bones' },
  'DLC_SUMMERSET':                  { id: 10, name: 'Summerset' },
  'DLC_WOLFHUNTER':                 { id: 11, name: 'Wolfhunter' },
  'DLC_MURKMIRE':                   { id: 12, name: 'Murkmire' },
  'DLC_WRATHSTONE':                 { id: 13, name: 'Wrathstone' },
  'DLC_ELSWEYR':                    { id: 14, name: 'Elsweyr' },
  'DLC_SCALEBREAKER':               { id: 15, name: 'Scalebreaker' },
  'DLC_DRAGONHOLD':                 { id: 16, name: 'Dragonhold' },
  'DLC_HARROWSTORM':                { id: 17, name: 'Harrowstorm' },
  'DLC_GREYMOOR':                   { id: 18, name: 'Greymoor' },
  'DLC_STONETHORN':                 { id: 19, name: 'Stonethorn' },
  'DLC_MARKARTH':                   { id: 20, name: 'Markarth' },
  'DLC_FLAMES_OF_AMBITION':         { id: 21, name: 'Flames of Ambition' },
  'DLC_BLACKWOOD':                  { id: 22, name: 'Blackwood' },
  'DLC_WAKING_FLAME':               { id: 23, name: 'Waking Flame' },
  'DLC_DEADLANDS':                  { id: 24, name: 'Deadlands' },
  'DLC_ASCENDING_TIDE':             { id: 25, name: 'Ascending Tide' },
  'DLC_HIGH_ISLE':                  { id: 26, name: 'High Isle' },
  'DLC_LOST_DEPTHS':                { id: 27, name: 'Lost Depths' },
  'DLC_FIRESONG':                   { id: 28, name: 'Firesong' },
  'DLC_SCRIBES_OF_FATE':            { id: 29, name: 'Scribes of Fate' },
  'DLC_NECROM':                     { id: 30, name: 'Necrom' },
  // IDs 31-40: from LibSets_Constants_All.lua possibleDlcIds (includes NO_DLC patch entries)
  'NO_DLC_UPDATE39':                { id: 31, name: 'Update 39' },
  'NO_DLC_SECRET_OF_THE_TELVANNI':  { id: 32, name: 'Update 40: Secret of the Telvanni' },
  'DLC_SCIONS_OF_ITHELIA':          { id: 33, name: 'Scions of Ithelia' },
  'DLC_GOLD_ROAD':                  { id: 34, name: 'Gold Road' },
  'NO_DLC_UPDATE43':                { id: 35, name: 'Update 43' },
  'NO_DLC_UPDATE44':                { id: 36, name: 'Update 44' },
  'DLC_FALLEN_BANNERS':             { id: 37, name: 'Fallen Banners' },
  'DLC_SEASONS_OF_THE_WORMCULT1':   { id: 38, name: 'Seasons of the Wormcult Part 1' },
  'DLC_FEAST_OF_SHADOWS':           { id: 39, name: 'Feast of Shadows' },
  'DLC_SEASONS_OF_THE_WORMCULT2':   { id: 40, name: 'Seasons of the Wormcult Part 2' },
};

// Map drop mechanic constants to human-readable names
// From LibSets_ConstantsLibraryInternal.lua
const DROP_MECHANIC_MAP: Record<string, string> = {
  'LIBSETS_DROP_MECHANIC_MAIL_PVP_REWARDS_FOR_THE_WORTHY': 'Rewards for the Worthy',
  'LIBSETS_DROP_MECHANIC_CITY_CYRODIIL_BRUMA': 'Cyrodiil Bruma Quartermaster',
  'LIBSETS_DROP_MECHANIC_CITY_CYRODIIL_CROPSFORD': 'Cyrodiil Cropsford Quartermaster',
  'LIBSETS_DROP_MECHANIC_CITY_CYRODIIL_VLASTARUS': 'Cyrodiil Vlastarus Quartermaster',
  'LIBSETS_DROP_MECHANIC_ARENA_STAGE_CHEST': 'Arena Stage Chest',
  'LIBSETS_DROP_MECHANIC_MONSTER_NAME': 'Named Boss',
  'LIBSETS_DROP_MECHANIC_OVERLAND_BOSS_DELVE': 'Delve Boss',
  'LIBSETS_DROP_MECHANIC_OVERLAND_WORLDBOSS': 'World Boss',
  'LIBSETS_DROP_MECHANIC_OVERLAND_BOSS_PUBLIC_DUNGEON': 'Public Dungeon Boss',
  'LIBSETS_DROP_MECHANIC_OVERLAND_CHEST': 'Overland Chest',
  'LIBSETS_DROP_MECHANIC_BATTLEGROUND_REWARD': 'Battleground Reward',
  'LIBSETS_DROP_MECHANIC_MAIL_DAILY_RANDOM_DUNGEON_REWARD': 'Daily Random Dungeon Reward',
  'LIBSETS_DROP_MECHANIC_IMPERIAL_CITY_VAULTS': 'Imperial City Vaults',
  'LIBSETS_DROP_MECHANIC_LEVEL_UP_REWARD': 'Level Up Reward',
  'LIBSETS_DROP_MECHANIC_ANTIQUITIES': 'Antiquities',
  'LIBSETS_DROP_MECHANIC_BATTLEGROUND_VENDOR': 'Battleground Vendor',
  'LIBSETS_DROP_MECHANIC_TELVAR_EQUIPMENT_LOCKBOX_MERCHANT': 'Tel Var Merchant',
  'LIBSETS_DROP_MECHANIC_AP_ELITE_GEAR_LOCKBOX_MERCHANT': 'Alliance Points Elite Gear Merchant',
  'LIBSETS_DROP_MECHANIC_REWARD_BY_NPC': 'NPC Reward',
  'LIBSETS_DROP_MECHANIC_OVERLAND_OBLIVION_PORTAL_FINAL_CHEST': 'Oblivion Portal Final Chest',
  'LIBSETS_DROP_MECHANIC_DOLMEN_HARROWSTORM_MAGICAL_ANOMALIES': 'Dolmen/Harrowstorm/Anomaly',
  'LIBSETS_DROP_MECHANIC_DUNGEON_CHEST': 'Dungeon Chest',
  'LIBSETS_DROP_MECHANIC_DAILY_QUEST_REWARD_COFFER': 'Daily Quest Reward Coffer',
  'LIBSETS_DROP_MECHANIC_FISHING_HOLE': 'Fishing',
  'LIBSETS_DROP_MECHANIC_OVERLAND_LOOT': 'Overland Loot',
  'LIBSETS_DROP_MECHANIC_TRIAL_BOSS': 'Trial Boss',
  'LIBSETS_DROP_MECHANIC_MOB_TYPE': 'Specific Mob Type',
  'LIBSETS_DROP_MECHANIC_GROUP_DUNGEON_BOSS': 'Dungeon Boss',
  'LIBSETS_DROP_MECHANIC_CRAFTED': 'Crafted',
  'LIBSETS_DROP_MECHANIC_PUBLIC_DUNGEON_CHEST': 'Public Dungeon Chest',
  'LIBSETS_DROP_MECHANIC_HARVEST_NODES': 'Harvest Nodes',
  'LIBSETS_DROP_MECHANIC_IMPERIAL_CITY_TREASURE_TROVE_SCAMP': 'Imperial City Treasure Scamp',
  'LIBSETS_DROP_MECHANIC_CITY_CYRODIIL_CHEYDINHAL': 'Cyrodiil Cheydinhal',
  'LIBSETS_DROP_MECHANIC_CITY_CYRODIIL_CHORROL_WEYNON_PRIORY': 'Cyrodiil Weynon Priory',
  'LIBSETS_DROP_MECHANIC_CITY_CYRODIIL_CHEYDINHAL_CHORROL_WEYNON_PRIORY': 'Cyrodiil Cheydinhal/Weynon Priory',
  'LIBSETS_DROP_MECHANIC_CYRODIIL_BOARD_MISSIONS': 'Cyrodiil Board Missions',
  'LIBSETS_DROP_MECHANIC_ENDLESS_ARCHIVE': 'Infinite Archive',
  'LIBSETS_DROP_MECHANIC_GOLDEN_PURSUIT': 'Golden Pursuit',
};

// Zone names map: zoneId -> name (extracted from LibSets comments and set_item_collections)
// These are the known zone names from LibSets_Data_Zones.lua comments and category mappings
const ZONE_NAMES: Record<number, string> = {
  // Overland zones (from set_item_collections_zone_mapping comments)
  3: 'Glenumbra',
  19: 'Stormhaven',
  20: 'Rivenspire',
  41: 'Stonefalls',
  57: 'Deshaan',
  58: 'Malabal Tor',
  92: 'Bangkorai',
  101: 'Eastmarch',
  103: 'The Rift',
  104: "Alik'r Desert",
  108: 'Greenshade',
  117: 'Shadowfen',
  181: 'Cyrodiil',
  280: 'Bleakrock Isle',
  281: 'Bal Foyen',
  347: 'Coldharbour',
  381: 'Auridon',
  382: "Reaper's March",
  383: 'Grahtwood',
  534: 'Stros M\'Kai',
  535: 'Betnikh',
  537: 'Khenarthi\'s Roost',
  584: 'Imperial City',
  635: 'Dragonstar Arena',
  636: 'Hel Ra Citadel',
  638: 'Aetherian Archive',
  639: 'Sanctum Ophidia',
  677: 'Maelstrom Arena',
  684: 'Wrothgar',
  725: 'Maw of Lorkhaj',
  726: 'Murkmire',
  816: "Hew's Bane",
  823: 'Gold Coast',
  849: 'Vvardenfell',
  888: 'Craglorn',
  980: 'Clockwork City',
  981: 'Brass Fortress',
  1011: 'Summerset',
  1027: 'Artaeum',
  1082: 'Blackrose Prison',
  1086: 'Northern Elsweyr',
  1133: 'Southern Elsweyr',
  1160: 'Western Skyrim',
  1161: 'Blackreach: Greymoor Caverns',
  1196: "Kyne's Aegis",
  1207: 'The Reach',
  1208: 'Blackreach: Arkthzand Cavern',
  1227: 'Vateshran Hollows',
  1261: 'Blackwood',
  1282: 'Fargrave',
  1283: 'The Shambles',
  1286: 'The Deadlands',
  1318: 'High Isle',
  1383: 'Galen',
  1413: 'Apocrypha',
  1414: 'Telvanni Peninsula',
  1436: 'Infinite Archive',
  1443: 'Gold Road',
  1502: 'Solstice',
  // Dungeons (from LIBSETS_TABLEKEY_DUNGEON_ZONE_MAPPING comments)
  11: 'Vaults of Madness',
  22: 'Volenfell',
  31: "Selene's Web",
  38: 'Blackheart Haven',
  63: 'Darkshade Caverns I',
  64: 'Blessed Crucible',
  126: 'Elden Hollow I',
  130: 'Crypt of Hearts I',
  131: 'Tempest Island',
  144: 'Spindleclutch I',
  146: 'Wayrest Sewers I',
  148: 'Arx Corinium',
  176: 'City of Ash I',
  283: 'Fungal Grotto I',
  380: 'The Banished Cells I',
  449: 'Direfrost Keep',
  678: 'Imperial City Prison',
  681: 'City of Ash II',
  688: 'White-Gold Tower',
  843: 'Ruins of Mazzatun',
  848: 'Cradle of Shadows',
  930: 'Darkshade Caverns II',
  931: 'Elden Hollow II',
  932: 'Crypt of Hearts II',
  933: 'Wayrest Sewers II',
  934: 'Fungal Grotto II',
  935: 'The Banished Cells II',
  936: 'Spindleclutch II',
  973: 'Bloodroot Forge',
  974: 'Falkreath Hold',
  975: 'Halls of Fabrication',
  1000: 'Asylum Sanctorium',
  1009: 'Fang Lair',
  1010: 'Scalecaller Peak',
  1051: 'Cloudrest',
  1052: 'Moon Hunter Keep',
  1055: 'March of Sacrifices',
  1080: 'Frostvault',
  1081: 'Depths of Malatar',
  1121: 'Sunspire',
  1122: 'Moongrave Fane',
  1123: 'Lair of Maarselok',
  1152: 'Icereach',
  1153: 'Unhallowed Grave',
  1197: 'Stone Garden',
  1201: 'Castle Thorn',
  1228: 'Black Drake Villa',
  1229: 'The Cauldron',
  1267: 'Red Petal Bastion',
  1268: 'The Dread Cellar',
  1301: 'Coral Aerie',
  1302: "Shipwright's Regret",
  1344: 'Dreadsail Reef',
  1360: 'Earthen Root Enclave',
  1361: 'Graven Deep',
  1389: 'Bal Sunnar',
  1390: "Scrivener's Hall",
  1427: "Sanity's Edge",
  1470: 'Oathsworn Pit',
  1471: 'Bedlam Veil',
  1478: 'Lucent Citadel',
  1496: 'Exiled Redoubt',
  1497: 'Lep Seclusa',
  1548: 'Ossein Cage',
  1551: 'Naj-Caldeesh',
  1552: 'Black Gem Foundry',
  // Public Dungeons (from LIBSETS_TABLEKEY_PUBLICDUNGEON_ZONE_MAPPING comments)
  124: 'Root Sunder Ruins',
  134: "Sanguine's Demesne",
  137: "Rulanyil's Fall",
  138: 'Crimson Cove',
  142: 'Bonesnap Ruins',
  162: 'Obsidian Scar',
  169: "Razak's Wheel",
  216: "Crow's Wood",
  284: "Bad Man's Hallows",
  306: 'Forgotten Crypts',
  308: 'Lost City of the Na-Totambu',
  339: 'Hall of the Dead',
  341: "The Lion's Den",
  486: 'Toothmaul Gully',
  487: 'The Vile Manse',
  557: 'Village of the Lost',
  705: 'Rkindaleft',
  706: 'Old Orsinium',
  918: 'Nchuleftingth',
  919: 'Forgotten Wastes',
  1020: 'Karnwasten',
  1021: 'Sunhold',
  1089: 'Rimmen Necropolis',
  1090: 'Orcrest',
  1186: 'Labyrinthian',
  1187: 'Nchuthnkarst',
  1259: "Zenithar's Abbey",
  1260: 'The Silent Halls',
  1310: 'Atoll of Immolation',
  1337: 'Spire of the Crimson Coin',
  1338: 'Ghost Haven Bay',
  1415: 'Gorne',
  1416: 'The Underweave',
  1466: 'Leftwheal Trading Post',
  1467: 'Silorn',
  1530: 'Calindvale Gardens',
  // Additional zones found in set data
  0: 'Unknown',
  98: 'Cyrodiil (Battlegrounds)',
  99: 'Cyrodiil (IC Sewers)',
  208: 'Craglorn (Crafting)',
  267: 'Craglorn (Crafting)',
  467: 'Eyevea',
  643: 'Imperial City (Districts)',
  694: 'March of Sacrifices (Overland)',
  1224: 'Markarth (Antiquities)',
  1263: 'Rockgrove',
  1334: 'High Isle (Antiquities)',
  1511: 'Solstice (Antiquities)',
  1512: 'Solstice (Antiquities)',
  1513: 'Solstice (Antiquities)',
};

interface SetJsonEntry {
  set_id: number;
  name_en: string;
  name_de?: string;
  name_fr?: string;
  set_type: string;
  dlc_id: number;
  dlc_name: string;
  is_veteran: boolean;
  traits_needed: number | null;
  zone_ids: number[];
  wayshrines: number[];
}

interface LibSetData {
  setId: number;
  setType: string;
  dlcConst: string;
  veteran: boolean;
  traitsNeeded?: number;
  zoneIds: number[];
  wayshrines: number[];
  dropMechanics: string[];
}

interface DungeonZoneData {
  zoneId: number;
  parentZoneId: number;
  zoneName: string;
  isTrial?: boolean;
  isDungeon?: boolean;
  wayshrineId?: number;
}

interface WayshrineData {
  nodeId: number;
  zoneId: number;
}

/**
 * Parse LibSets Lua data to extract set information.
 * Uses brace-matching to correctly handle nested tables.
 */
function parseLibSetsData(content: string): Map<number, LibSetData> {
  const sets = new Map<number, LibSetData>();

  // Find the start of set data entries (first [number]={)
  const dataStart = content.search(/\[\d+\]=\{/);
  if (dataStart === -1) return sets;

  const data = content.substring(dataStart);

  // Find each set entry using brace matching
  const entryRegex = /\[(\d+)\]=\{/g;
  let match;

  while ((match = entryRegex.exec(data)) !== null) {
    const setId = parseInt(match[1], 10);
    const braceStart = match.index + match[0].length - 1; // position of opening {

    // Find matching closing brace
    let depth = 0;
    let bodyEnd = -1;
    for (let i = braceStart; i < data.length; i++) {
      if (data[i] === '{') depth++;
      else if (data[i] === '}') {
        depth--;
        if (depth === 0) { bodyEnd = i; break; }
      }
    }
    if (bodyEnd === -1) continue;

    const setBody = data.substring(braceStart + 1, bodyEnd);

    // Extract setType
    const typeMatch = setBody.match(/setType=(LIBSETS_SETTYPE_\w+)/);
    const setType = typeMatch ? typeMatch[1] : 'LIBSETS_SETTYPE_OVERLAND';

    // Extract DLC (match both DLC_ and NO_DLC_ prefixes)
    const dlcMatch = setBody.match(/dlcId=((?:NO_)?DLC_\w+)/);
    const dlcConst = dlcMatch ? dlcMatch[1] : 'DLC_BASE_GAME';

    // Extract veteran (can be true/false or a table)
    const vetMatch = setBody.match(/veteran=(true|false)/);
    const veteran = vetMatch ? vetMatch[1] === 'true' : false;

    // Extract traitsNeeded
    const traitsMatch = setBody.match(/traitsNeeded=(\d+)/);
    const traitsNeeded = traitsMatch ? parseInt(traitsMatch[1], 10) : undefined;

    // Extract zoneIds
    const zoneIds: number[] = [];
    const zonesMatch = setBody.match(/zoneIds=\{([^}]*)\}/);
    if (zonesMatch) {
      const zoneNums = zonesMatch[1].match(/\d+/g);
      if (zoneNums) {
        for (const z of zoneNums) {
          const zid = parseInt(z, 10);
          if (!zoneIds.includes(zid)) zoneIds.push(zid);
        }
      }
    }

    // Extract wayshrines
    const wayshrines: number[] = [];
    const wsMatch = setBody.match(/wayshrines=\{([^}]*)\}/);
    if (wsMatch) {
      const wsNums = wsMatch[1].match(/-?\d+/g);
      if (wsNums) {
        for (const w of wsNums) {
          const wid = parseInt(w, 10);
          if (wid > 0 && !wayshrines.includes(wid)) wayshrines.push(wid);
        }
      }
    }

    // Extract dropMechanics
    const dropMechanics: string[] = [];
    const dmMatch = setBody.match(/dropMechanic=\{([^}]*)\}/);
    if (dmMatch) {
      const dmNames = dmMatch[1].match(/LIBSETS_DROP_MECHANIC_\w+/g);
      if (dmNames) {
        for (const dm of dmNames) {
          if (!dropMechanics.includes(dm)) dropMechanics.push(dm);
        }
      }
    }

    sets.set(setId, { setId, setType, dlcConst, veteran, traitsNeeded, zoneIds, wayshrines, dropMechanics });
  }

  return sets;
}

/**
 * Parse wayshrine-to-zone mapping from LibSets_Data_Zones.lua
 * Format: setDataPreloaded[LIBSETS_TABLEKEY_WAYSHRINENODEID2ZONEID] = {[1]=3,[2]=3,...}
 */
function parseWayshrineToZone(content: string): Map<number, number> {
  const map = new Map<number, number>();
  const tableMatch = content.match(/WAYSHRINENODEID2ZONEID\]\s*=\s*\{([^}]+)\}/);
  if (!tableMatch) return map;

  const entries = tableMatch[1].match(/\[(\d+)\]=(\d+)/g);
  if (!entries) return map;

  for (const entry of entries) {
    const m = entry.match(/\[(\d+)\]=(\d+)/);
    if (m) {
      map.set(parseInt(m[1], 10), parseInt(m[2], 10));
    }
  }
  return map;
}

/**
 * Parse dungeon zone data (zone -> parentZone + name from comments)
 */
function parseDungeonZones(content: string): Map<number, DungeonZoneData> {
  const zones = new Map<number, DungeonZoneData>();

  // Match dungeon entries like: [638]={parentZoneId=888,isTrial=true},   --Aetherian Archive
  const regex = /\[(\d+)\]=\{parentZoneId=(\d+)([^}]*)\}[^-]*--\s*(.+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const zoneId = parseInt(match[1], 10);
    const parentZoneId = parseInt(match[2], 10);
    const extra = match[3];
    const zoneName = match[4].trim();

    const isTrial = extra.includes('isTrial=true');
    const wayshrineMatch = extra.match(/wayshrine=(\d+)/);
    const wayshrineId = wayshrineMatch ? parseInt(wayshrineMatch[1], 10) : undefined;

    zones.set(zoneId, {
      zoneId,
      parentZoneId,
      zoneName,
      isTrial,
      isDungeon: !isTrial,
      wayshrineId,
    });
  }

  return zones;
}

function main() {
  console.log('=== ESO Sets Import ===');
  console.log(`Database: ${DB_PATH}`);

  // Load sets.json (has names in EN/DE)
  const setsJson: SetJsonEntry[] = JSON.parse(readFileSync(SETS_JSON, 'utf-8'));
  console.log(`Loaded ${setsJson.length} sets from sets.json`);

  // Load LibSets data (has set types, DLC, zone info)
  const libSetsContent = readFileSync(LIBSETS_DATA, 'utf-8');
  const libSetsData = parseLibSetsData(libSetsContent);
  console.log(`Parsed ${libSetsData.size} sets from LibSets`);

  // Load zone data
  const zonesContent = readFileSync(LIBSETS_ZONES, 'utf-8');
  const wayshrineToZone = parseWayshrineToZone(zonesContent);
  console.log(`Parsed ${wayshrineToZone.size} wayshrine-to-zone mappings`);
  const dungeonZones = parseDungeonZones(zonesContent);
  console.log(`Parsed ${dungeonZones.size} dungeon/trial zone entries`);

  // Open database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Read and apply schema
  const schemaPath = join(PROJECT_ROOT, 'mcp-server', 'src', 'database', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Disable foreign keys for bulk import
  db.pragma('foreign_keys = OFF');

  // Clear existing sets data
  db.exec('DELETE FROM set_bonuses');
  db.exec('DELETE FROM set_locations');
  db.exec('DELETE FROM set_equipment_types');
  db.exec('DELETE FROM sets');

  // Clear zones and wayshrines
  db.exec('DELETE FROM zones');
  db.exec('DELETE FROM wayshrines');

  // Rebuild FTS
  try { db.exec("INSERT INTO sets_fts(sets_fts) VALUES('rebuild')"); } catch { /* ignore */ }

  // ============================================================
  // Phase 1: Import zones
  // ============================================================
  console.log('\n--- Importing zones ---');

  const insertZone = db.prepare(`
    INSERT OR REPLACE INTO zones (zone_id, name_en, zone_type, dlc_id, dlc_name, parent_zone_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let zoneCount = 0;

  const importZones = db.transaction(() => {
    // Import all known zones from ZONE_NAMES map
    for (const [zoneIdStr, zoneName] of Object.entries(ZONE_NAMES)) {
      const zoneId = parseInt(zoneIdStr, 10);
      const dungeonData = dungeonZones.get(zoneId);

      let zoneType = 'Overland';
      let parentZoneId: number | null = null;

      if (dungeonData) {
        parentZoneId = dungeonData.parentZoneId;
        if (dungeonData.isTrial) zoneType = 'Trial';
        else zoneType = 'Dungeon';
      } else if ([635, 677, 1082, 1227].includes(zoneId)) {
        zoneType = 'Arena';
      } else if ([181, 584].includes(zoneId)) {
        zoneType = 'PvP';
      }

      insertZone.run(zoneId, zoneName, zoneType, null, null, parentZoneId);
      zoneCount++;
    }

    // Also import any dungeon zones we know about from parseDungeonZones that might not be in ZONE_NAMES
    for (const [zoneId, data] of dungeonZones) {
      if (ZONE_NAMES[zoneId]) continue; // already imported
      insertZone.run(zoneId, data.zoneName, data.isTrial ? 'Trial' : 'Dungeon', null, null, data.parentZoneId);
      zoneCount++;
    }
  });
  importZones();
  console.log(`Imported ${zoneCount} zones`);

  // ============================================================
  // Phase 2: Import wayshrines
  // ============================================================
  console.log('\n--- Importing wayshrines ---');

  const insertWayshrine = db.prepare(`
    INSERT OR REPLACE INTO wayshrines (wayshrine_node_id, zone_id, zone_name_en)
    VALUES (?, ?, ?)
  `);

  let wsCount = 0;
  const importWayshrines = db.transaction(() => {
    for (const [nodeId, zoneId] of wayshrineToZone) {
      if (zoneId === 0) continue; // skip unmapped
      const zoneName = ZONE_NAMES[zoneId] || null;
      insertWayshrine.run(nodeId, zoneId, zoneName);
      wsCount++;
    }
  });
  importWayshrines();
  console.log(`Imported ${wsCount} wayshrines`);

  // ============================================================
  // Phase 3: Import sets
  // ============================================================
  console.log('\n--- Importing sets ---');

  const insertSet = db.prepare(`
    INSERT OR REPLACE INTO sets (set_id, name_en, name_de, name_fr, set_type, dlc_id, dlc_name, is_veteran, traits_needed, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLocation = db.prepare(`
    INSERT INTO set_locations (set_id, zone_id, zone_name_en, drop_mechanic, wayshrine_node_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  let importedCount = 0;
  let enrichedCount = 0;

  const insertAll = db.transaction(() => {
    for (const setJson of setsJson) {
      const libData = libSetsData.get(setJson.set_id);

      let setType = setJson.set_type;
      let dlcId = setJson.dlc_id;
      let dlcName = setJson.dlc_name;
      let isVeteran = setJson.is_veteran;
      let traitsNeeded = setJson.traits_needed;
      let dropMechanics: string[] = [];

      // Enrich with LibSets data
      if (libData) {
        enrichedCount++;

        // Set type from LibSets
        setType = SET_TYPE_MAP[libData.setType] || 'Overland';

        // DLC from LibSets
        const dlcInfo = DLC_MAP[libData.dlcConst];
        if (dlcInfo) {
          dlcId = dlcInfo.id;
          dlcName = dlcInfo.name;
        }

        // Veteran from LibSets
        isVeteran = libData.veteran;

        // Traits from LibSets
        if (libData.traitsNeeded !== undefined) {
          traitsNeeded = libData.traitsNeeded;
        }

        // Drop mechanics from LibSets
        dropMechanics = libData.dropMechanics;
      }

      // Fix "Unknown" types
      if (setType === 'Unknown') setType = 'Overland';

      insertSet.run(
        setJson.set_id,
        setJson.name_en,
        setJson.name_de || null,
        setJson.name_fr || null,
        setType,
        dlcId,
        dlcName,
        isVeteran ? 1 : 0,
        traitsNeeded,
        null // description
      );

      // Insert locations from LibSets zone data
      if (libData && libData.zoneIds.length > 0) {
        const uniqueZones = [...new Set(libData.zoneIds)];
        // Build the primary drop mechanic string from the unique mechanics
        const dropMechanicStr = dropMechanics
          .map(dm => DROP_MECHANIC_MAP[dm] || dm)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(', ') || null;

        for (let i = 0; i < uniqueZones.length; i++) {
          const wsId = libData.wayshrines[i] || null;
          const zoneName = ZONE_NAMES[uniqueZones[i]] || null;
          insertLocation.run(
            setJson.set_id,
            uniqueZones[i],
            zoneName,
            dropMechanicStr,
            wsId && wsId > 0 ? wsId : null
          );
        }
      }

      importedCount++;
    }

    // Also import sets from LibSets that aren't in sets.json
    for (const [setId, libData] of libSetsData) {
      if (setsJson.some(s => s.set_id === setId)) continue;

      const setType = SET_TYPE_MAP[libData.setType] || 'Overland';
      const dlcInfo = DLC_MAP[libData.dlcConst];

      insertSet.run(
        setId,
        `Set ${setId}`, // no name available
        null,
        null,
        setType,
        dlcInfo?.id || 0,
        dlcInfo?.name || 'Base Game',
        libData.veteran ? 1 : 0,
        libData.traitsNeeded || null,
        null
      );

      if (libData.zoneIds.length > 0) {
        const uniqueZones = [...new Set(libData.zoneIds)];
        const dropMechanicStr = libData.dropMechanics
          .map(dm => DROP_MECHANIC_MAP[dm] || dm)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(', ') || null;

        for (let i = 0; i < uniqueZones.length; i++) {
          const wsId = libData.wayshrines[i] || null;
          const zoneName = ZONE_NAMES[uniqueZones[i]] || null;
          insertLocation.run(setId, uniqueZones[i], zoneName, dropMechanicStr, wsId && wsId > 0 ? wsId : null);
        }
      }

      importedCount++;
    }
  });

  insertAll();

  // ============================================================
  // Phase 4: Update set_locations with zone names from zones table
  // ============================================================
  console.log('\n--- Updating set_locations with zone names ---');
  const updateResult = db.prepare(`
    UPDATE set_locations
    SET zone_name_en = (SELECT z.name_en FROM zones z WHERE z.zone_id = set_locations.zone_id)
    WHERE zone_name_en IS NULL AND zone_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM zones z WHERE z.zone_id = set_locations.zone_id)
  `).run();
  console.log(`Updated ${updateResult.changes} set_locations with zone names from zones table`);

  // ============================================================
  // Phase 5: Import set bonuses from LibSets numBonuses data
  // ============================================================
  // LibSets stores bonus descriptions at runtime from the game API, not in static files.
  // sets.json also does not contain bonus data.
  // We can at least populate the number of bonus lines per set from LibSets set data:
  // - Monster sets typically have 1pc + 2pc bonuses
  // - Overland/Dungeon sets have 2pc + 3pc + 4pc + 5pc bonuses
  // - Crafted sets have 2pc + 3pc + 4pc + 5pc bonuses
  // - Mythic sets have 1pc bonus
  // Since we don't have the actual bonus text, we'll skip set_bonuses for now
  // (bonus descriptions are only available in-game via GetSetBonusInfo API)
  console.log('\n--- Set bonuses ---');
  console.log('Note: Bonus descriptions are only available via the in-game API (GetSetBonusInfo).');
  console.log('Set bonus data is not available in LibSets static files or sets.json.');
  console.log('Skipping set_bonuses import (requires in-game data extraction).');

  // Rebuild FTS index
  try { db.exec("INSERT INTO sets_fts(sets_fts) VALUES('rebuild')"); } catch { /* ignore */ }

  // Count by type
  const typeCounts = db.prepare(`
    SELECT set_type, COUNT(*) as count FROM sets GROUP BY set_type ORDER BY count DESC
  `).all() as any[];

  // Count locations with zone names
  const locationStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN zone_name_en IS NOT NULL THEN 1 ELSE 0 END) as with_name,
      SUM(CASE WHEN drop_mechanic IS NOT NULL THEN 1 ELSE 0 END) as with_mechanic
    FROM set_locations
  `).get() as any;

  const zoneStats = db.prepare(`SELECT COUNT(*) as count FROM zones`).get() as any;
  const wsStats = db.prepare(`SELECT COUNT(*) as count FROM wayshrines`).get() as any;

  console.log(`\n=== Import Complete ===`);
  console.log(`Total sets imported: ${importedCount}`);
  console.log(`Enriched from LibSets: ${enrichedCount}`);
  console.log(`\nSets by type:`);
  for (const tc of typeCounts) {
    console.log(`  ${tc.set_type}: ${tc.count}`);
  }
  console.log(`\nZones: ${zoneStats.count}`);
  console.log(`Wayshrines: ${wsStats.count}`);
  console.log(`Set locations: ${locationStats.total} (${locationStats.with_name} with zone name, ${locationStats.with_mechanic} with drop mechanic)`);

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Mark import in metadata
  const setMeta = db.prepare(`INSERT OR REPLACE INTO import_metadata (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`);
  setMeta.run('sets_imported', 'true');
  setMeta.run('sets_count', String(importedCount));
  setMeta.run('sets_import_date', new Date().toISOString());
  setMeta.run('sets_source', 'LibSets API 101048 + sets.json');
  setMeta.run('zones_count', String(zoneStats.count));
  setMeta.run('wayshrines_count', String(wsStats.count));

  db.close();
  console.log('\nDone!');
}

main();
