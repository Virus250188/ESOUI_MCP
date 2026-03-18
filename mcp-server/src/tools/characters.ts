import { z } from 'zod';
import { db } from '../database/db.js';
import { SavedVarsParser } from '../services/savedvars-parser.js';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';
import { validatePath, PathValidationError } from '../services/path-validator.js';

// ===== SCHEMAS =====

const ImportCharacterFromGameSchema = z.object({
  saved_vars_path: z
    .string()
    .optional()
    .describe('Custom path to SavedVariables folder (optional, uses default if not provided)'),
});

const ListMyCharactersSchema = z.object({});

const SyncCharacterSchema = z.object({
  character_name: z.string().describe('Name of the character to sync from game'),
  saved_vars_path: z.string().optional().describe('Custom SavedVariables path (optional)'),
});

const GetCharacterDetailsSchema = z.object({
  character_name: z.string().describe('Name of the character'),
});

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'import_character_from_game',
    description: 'Import all characters from ESO SavedVariables. REQUIREMENTS: 1) The ESOBuildTracker addon must be installed in ESO, 2) The user must have logged in with their characters at least once, 3) ESO must be closed (SavedVariables are written on exit), 4) Access to the ESO Documents folder must be granted. Default path: Documents/Elder Scrolls Online/live/SavedVariables/',
    inputSchema: {
      type: 'object' as const,
      properties: {
        saved_vars_path: {
          type: 'string',
          description: 'Custom SavedVariables path (optional, uses default Documents/Elder Scrolls Online/live/SavedVariables)',
        },
      },
    },
  },
  {
    name: 'list_my_characters',
    description: 'List all previously imported ESO characters with their basic info and equipped sets count. Requires: Characters must have been imported first using import_character_from_game.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'sync_character',
    description: 'Re-sync a specific character from ESO SavedVariables to update their equipped sets and info. REQUIREMENTS: Same as import_character_from_game - ESOBuildTracker addon must be installed, user must have logged in recently, and ESO must be closed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        character_name: { type: 'string', description: 'Name of the character to sync' },
        saved_vars_path: { type: 'string', description: 'Custom SavedVariables path (optional)' },
      },
      required: ['character_name'],
    },
  },
  {
    name: 'get_character_details',
    description: 'Get detailed information about a specific imported character including all equipped sets. Requires: Character must have been imported first using import_character_from_game.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        character_name: { type: 'string', description: 'Name of the character' },
      },
      required: ['character_name'],
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'import_character_from_game': {
      const params = ImportCharacterFromGameSchema.parse(args);
      if (params.saved_vars_path) {
        try { validatePath(params.saved_vars_path); } catch (e) {
          if (e instanceof PathValidationError) return errorResult(e.message);
          throw e;
        }
      }
      const parser = new SavedVarsParser(params.saved_vars_path);

      if (!parser.pathExists()) {
        return errorResult(JSON.stringify({
          error: 'SavedVariables path not found',
          path: parser.getPath(),
          help: 'Make sure ESOBuildTracker addon is installed and you have logged in with your characters.',
        }, null, 2));
      }

      try {
        const characters = parser.parseESOBuildTracker();

        if (characters.length === 0) {
          return jsonResult({
            message: 'No characters found in ESOBuildTrackerData.lua',
            help: 'Make sure you have: 1) Installed ESOBuildTracker addon, 2) Activated it in ESO, 3) Logged in with your characters, 4) Closed ESO to save data.',
            path_checked: parser.getPath(),
          });
        }

        const importedIds = [];
        for (const char of characters) {
          const contextId = db.importCharacterFromGame({
            character_name: char.characterName,
            account_name: char.accountName,
            class: char.class,
            level: char.level,
            race: char.race,
            alliance: char.alliance,
            attributes: char.attributes,
            stats: char.stats,
            champion_points: char.championPoints,
            skills: char.skills,
            mundus_stone: char.mundusStone,
            equipped_gear: char.equippedGear,
            equipped_sets: char.equippedSets?.map((s) => ({
              set_name: s.setName,
              slot_category: s.slotCategory,
              pieces_equipped: s.piecesEquipped,
            })),
          });
          importedIds.push(contextId);
        }

        return jsonResult({
          success: true,
          imported_count: characters.length,
          characters: characters.map((c) => ({
            name: c.characterName,
            class: c.class,
            level: c.level,
            equipped_sets_count: c.equippedSets?.length || 0,
          })),
        });
      } catch (error) {
        return errorResult(JSON.stringify({
          error: 'Failed to parse SavedVariables',
          message: error instanceof Error ? error.message : String(error),
        }, null, 2));
      }
    }

    case 'list_my_characters': {
      const characters = db.listImportedCharacters();
      return jsonResult({ total: characters.length, characters });
    }

    case 'sync_character': {
      const params = SyncCharacterSchema.parse(args);
      if (params.saved_vars_path) {
        try { validatePath(params.saved_vars_path); } catch (e) {
          if (e instanceof PathValidationError) return errorResult(e.message);
          throw e;
        }
      }
      const parser = new SavedVarsParser(params.saved_vars_path);

      try {
        const characters = parser.parseESOBuildTracker();
        const targetChar = characters.find(
          (c) => c.characterName.toLowerCase() === params.character_name.toLowerCase()
        );

        if (!targetChar) {
          return errorResult(JSON.stringify({
            error: 'Character not found',
            available_characters: characters.map((c) => c.characterName),
          }, null, 2));
        }

        const contextId = db.importCharacterFromGame({
          character_name: targetChar.characterName,
          account_name: targetChar.accountName,
          class: targetChar.class,
          level: targetChar.level,
          race: targetChar.race,
          alliance: targetChar.alliance,
          equipped_sets: targetChar.equippedSets?.map((s) => ({
            set_name: s.setName,
            slot_category: s.slotCategory,
            pieces_equipped: s.piecesEquipped,
          })),
        });

        return jsonResult({
          success: true,
          character_name: targetChar.characterName,
          context_id: contextId,
          equipped_sets_count: targetChar.equippedSets?.length || 0,
        });
      } catch (error) {
        return errorResult(JSON.stringify({
          error: 'Failed to sync character',
          message: error instanceof Error ? error.message : String(error),
        }, null, 2));
      }
    }

    case 'get_character_details': {
      const params = GetCharacterDetailsSchema.parse(args);
      const contextId = db.findCharacterByName(params.character_name);

      if (!contextId) {
        return errorResult(JSON.stringify({
          error: 'Character not found',
          help: 'Use list_my_characters to see all available characters.',
        }, null, 2));
      }

      const charData = db.getCharacterWithSets(contextId);
      if (!charData) {
        return errorResult(JSON.stringify({ error: 'Character data not found' }, null, 2));
      }

      return jsonResult(charData);
    }

    default:
      return errorResult(`Unknown character tool: ${name}`);
  }
}

export const charactersModule: ToolModule = { definitions, handler };
