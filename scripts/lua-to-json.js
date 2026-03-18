#!/usr/bin/env node

/**
 * Lua to JSON converter for LibSets data
 * Converts ESO addon Lua data files to JSON format
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '..');
const ADDON_LIBS = join(PROJECT_ROOT, 'addon_Libs', 'LibSets');
const OUTPUT_DIR = join(PROJECT_ROOT, 'data', 'json');

// DLC ID to name mapping from LibSets_Constants_All.lua
const DLC_NAMES = {
  0: 'Base Game',
  1: 'Imperial City',
  2: 'Orsinium',
  3: 'Thieves Guild',
  4: 'Dark Brotherhood',
  5: 'Shadows of the Hist',
  6: 'Morrowind',
  7: 'Horns of the Reach',
  8: 'Clockwork City',
  9: 'Dragon Bones',
  10: 'Summerset',
  11: 'Wolfhunter',
  12: 'Murkmire',
  13: 'Wrathstone',
  14: 'Elsweyr',
  15: 'Scalebreaker',
  16: 'Dragonhold',
  17: 'Harrowstorm',
  18: 'Greymoor',
  19: 'Stonethorn',
  20: 'Markarth',
  21: 'Flames of Ambition',
  22: 'Blackwood',
  23: 'Waking Flame',
  24: 'Deadlands',
  25: 'Ascending Tide',
  26: 'High Isle',
  27: 'Lost Depths',
  28: 'Firesong',
  29: 'Scribes of Fate',
  30: 'Necrom',
  31: 'Update 39',
  32: 'Secrets of the Telvanni',
  33: 'Scions of Ithelia',
  34: 'Gold Road',
  35: 'Update 43',
  36: 'Update 44',
  37: 'Fallen Banners',
  38: 'Seasons of the Wormcult 1',
  39: 'Feast of Shadows',
  40: 'Seasons of the Wormcult 2',
};

// Set type constants
const SET_TYPES = {
  1: 'Crafted',
  2: 'Arena',
  3: 'Dungeon',
  4: 'Trial',
  5: 'Overland',
  6: 'PvP',
  7: 'Monster',
  8: 'Mythic',
  9: 'Cyrodiil',
};

/**
 * Parse a simple Lua table into JavaScript object
 * Handles basic Lua table syntax: {key = value, [number] = {...}}
 */
function parseLuaTable(luaContent, startPos = 0) {
  const result = {};
  let pos = startPos;
  const len = luaContent.length;
  let currentKey = null;
  let bracketDepth = 0;

  while (pos < len) {
    const char = luaContent[pos];

    // Skip whitespace and comments
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      pos++;
      continue;
    }
    if (luaContent.slice(pos, pos + 2) === '--') {
      // Skip comment line
      while (pos < len && luaContent[pos] !== '\n') pos++;
      pos++;
      continue;
    }

    // Handle array-style keys: [123]
    if (char === '[' && luaContent[pos + 1] !== '[') {
      const endBracket = luaContent.indexOf(']', pos);
      if (endBracket === -1) break;
      currentKey = luaContent.slice(pos + 1, endBracket).trim();
      pos = endBracket + 1;
      // Skip past '=' sign
      while (pos < len && (luaContent[pos] === ' ' || luaContent[pos] === '=' || luaContent[pos] === '\t')) pos++;
      continue;
    }

    // Handle string keys: key = value
    if (/[a-zA-Z_]/.test(char)) {
      const match = luaContent.slice(pos).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
      if (match) {
        currentKey = match[1];
        pos += match[0].length;
        // Skip whitespace after '='
        while (pos < len && (luaContent[pos] === ' ' || luaContent[pos] === '\t')) pos++;
        continue;
      }
    }

    // Handle nested tables: {...}
    if (char === '{') {
      const tableStart = pos;
      bracketDepth = 1;
      pos++;
      while (pos < len && bracketDepth > 0) {
        if (luaContent[pos] === '{') bracketDepth++;
        if (luaContent[pos] === '}') bracketDepth--;
        pos++;
      }
      const tableContent = luaContent.slice(tableStart + 1, pos - 1);
      const nestedTable = parseLuaTable(tableContent);
      if (currentKey !== null) {
        result[currentKey] = nestedTable;
        currentKey = null;
      }
      continue;
    }

    // Handle boolean values
    if (luaContent.slice(pos, pos + 4) === 'true') {
      if (currentKey !== null) {
        result[currentKey] = true;
        currentKey = null;
      }
      pos += 4;
      continue;
    }
    if (luaContent.slice(pos, pos + 5) === 'false') {
      if (currentKey !== null) {
        result[currentKey] = false;
        currentKey = null;
      }
      pos += 5;
      continue;
    }

    // Handle numbers
    if (/[-0-9]/.test(char)) {
      const match = luaContent.slice(pos).match(/^-?\d+(\.\d+)?/);
      if (match) {
        const value = match[0].includes('.') ? parseFloat(match[0]) : parseInt(match[0], 10);
        if (currentKey !== null) {
          result[currentKey] = value;
          currentKey = null;
        }
        pos += match[0].length;
        continue;
      }
    }

    // Handle quoted strings
    if (char === '"' || char === "'") {
      const quote = char;
      let strEnd = pos + 1;
      while (strEnd < len) {
        if (luaContent[strEnd] === quote && luaContent[strEnd - 1] !== '\\') break;
        strEnd++;
      }
      const strValue = luaContent.slice(pos + 1, strEnd);
      if (currentKey !== null) {
        result[currentKey] = strValue;
        currentKey = null;
      }
      pos = strEnd + 1;
      continue;
    }

    // Handle constants (like DLC_BASE_GAME, LIBSETS_SETTYPE_DUNGEON)
    if (/[A-Z_]/.test(char)) {
      const match = luaContent.slice(pos).match(/^[A-Z_][A-Z0-9_]*/);
      if (match) {
        const constant = match[0];
        // Try to resolve known constants
        let value = constant;
        if (constant.startsWith('DLC_')) {
          // DLC constants: we'll resolve these later
          value = constant;
        } else if (constant.startsWith('LIBSETS_SETTYPE_')) {
          value = constant;
        } else if (constant === 'nil') {
          value = null;
        }
        if (currentKey !== null) {
          result[currentKey] = value;
          currentKey = null;
        }
        pos += match[0].length;
        continue;
      }
    }

    // Skip commas and closing braces
    if (char === ',' || char === '}') {
      pos++;
      continue;
    }

    // Unknown character, skip
    pos++;
  }

  return result;
}

/**
 * Extract setDataPreloaded table from LibSets_Data_Sets.lua
 */
function parseSetsData() {
  console.log('Parsing LibSets_Data_Sets.lua...');
  const filePath = join(ADDON_LIBS, 'Data', 'LibSets_Data_Sets.lua');
  const content = readFileSync(filePath, 'utf-8');

  // Find the main setDataPreloaded assignments
  const setsMatch = content.match(/setDataPreloaded\[LIBSETS_TABLEKEY_SETS\]\s*=\s*\{([\s\S]*?)\n\}/m);
  if (!setsMatch) {
    console.error('Could not find sets data in LibSets_Data_Sets.lua');
    return {};
  }

  const setsTableContent = setsMatch[1];
  const setsData = parseLuaTable(setsTableContent);

  // Resolve DLC and setType constants
  const resolvedSets = {};
  for (const [setId, setData] of Object.entries(setsData)) {
    const resolved = { ...setData };

    // Resolve dlcId
    if (typeof resolved.dlcId === 'string' && resolved.dlcId.startsWith('DLC_')) {
      const dlcName = resolved.dlcId.replace('DLC_', '').replace(/_/g, ' ');
      const dlcId = Object.entries(DLC_NAMES).find(([_, name]) =>
        name.toLowerCase() === dlcName.toLowerCase()
      )?.[0] || 0;
      resolved.dlcId = parseInt(dlcId, 10);
      resolved.dlcName = DLC_NAMES[resolved.dlcId] || 'Unknown';
    } else {
      resolved.dlcId = resolved.dlcId || 0;
      resolved.dlcName = DLC_NAMES[resolved.dlcId] || 'Unknown';
    }

    // Resolve setType
    if (typeof resolved.setType === 'string' && resolved.setType.startsWith('LIBSETS_SETTYPE_')) {
      const typeMatch = resolved.setType.match(/LIBSETS_SETTYPE_(\w+)/);
      if (typeMatch) {
        const typeName = typeMatch[1].charAt(0).toUpperCase() +
          typeMatch[1].slice(1).toLowerCase().replace(/_/g, ' ');
        resolved.setType = typeName;
      }
    }

    // Convert veteran from table to boolean if needed
    if (typeof resolved.veteran === 'object') {
      resolved.veteran = Object.values(resolved.veteran).some(v => v === true);
    } else {
      resolved.veteran = resolved.veteran || false;
    }

    resolvedSets[setId] = resolved;
  }

  console.log(`Parsed ${Object.keys(resolvedSets).length} sets`);
  return resolvedSets;
}

/**
 * Extract set names from LibSets_Data_SetNames.lua
 */
function parseSetNames() {
  console.log('Parsing LibSets_Data_SetNames.lua...');
  const filePath = join(ADDON_LIBS, 'Data', 'LibSets_Data_SetNames.lua');
  const content = readFileSync(filePath, 'utf-8');

  // Find setDataPreloaded[LIBSETS_TABLEKEY_SETNAMES] = {...}
  const namesMatch = content.match(/setDataPreloaded\[LIBSETS_TABLEKEY_SETNAMES\]\s*=\s*\{([\s\S]*?)\n\}/m);
  if (!namesMatch) {
    console.error('Could not find set names data');
    return {};
  }

  const namesContent = namesMatch[1];
  const namesData = parseLuaTable(namesContent);

  console.log(`Parsed ${Object.keys(namesData).length} set names`);
  return namesData;
}

/**
 * Main conversion function
 */
function convertLuaToJson() {
  console.log('Starting Lua to JSON conversion...\n');

  // Parse sets data
  const setsData = parseSetsData();
  const setNames = parseSetNames();

  // Combine sets with names
  const combinedSets = {};
  for (const [setId, setData] of Object.entries(setsData)) {
    const names = setNames[setId] || {};
    combinedSets[setId] = {
      set_id: parseInt(setId, 10),
      name_en: names.en || `Set ${setId}`,
      name_de: names.de || null,
      name_fr: names.fr || null,
      name_es: names.es || null,
      set_type: setData.setType || 'Unknown',
      dlc_id: setData.dlcId || 0,
      dlc_name: setData.dlcName || 'Base Game',
      is_veteran: setData.veteran || false,
      traits_needed: setData.traitsNeeded || null,
      is_multi_trial: setData.multiTrial || false,
      is_jewelry: setData.isJewelry || false,
      wayshrines: setData.wayshrines || [],
      zone_ids: setData.zoneIds || [],
    };
  }

  // Write output
  const outputPath = join(OUTPUT_DIR, 'sets.json');
  writeFileSync(outputPath, JSON.stringify(combinedSets, null, 2), 'utf-8');
  console.log(`\nWrote ${Object.keys(combinedSets).length} sets to ${outputPath}`);

  // Also create DLC info JSON
  const dlcInfo = Object.entries(DLC_NAMES).map(([id, name]) => ({
    dlc_id: parseInt(id, 10),
    dlc_name: name,
    dlc_type: id === '0' ? 'Base Game' : parseInt(id) <= 5 ? 'DLC' : 'Chapter',
  }));
  const dlcPath = join(OUTPUT_DIR, 'dlc_info.json');
  writeFileSync(dlcPath, JSON.stringify(dlcInfo, null, 2), 'utf-8');
  console.log(`Wrote ${dlcInfo.length} DLCs to ${dlcPath}`);

  console.log('\nConversion complete!');
}

// Run the conversion
try {
  convertLuaToJson();
} catch (error) {
  console.error('Error during conversion:', error);
  process.exit(1);
}
