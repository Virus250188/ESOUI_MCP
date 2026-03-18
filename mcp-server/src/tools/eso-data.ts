import { z } from 'zod';
import { db } from '../database/db.js';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';

// ===== SCHEMAS =====

const SearchZonesSchema = z.object({
  query: z.string().describe('Search term for zone names'),
  zone_type: z
    .enum(['Overland', 'Dungeon', 'Trial', 'Arena', 'PvP', 'Housing'])
    .optional()
    .describe('Filter by zone type'),
});

const SearchSkillsSchema = z.object({
  query: z.string().describe('Search term for skill names'),
  class: z
    .string()
    .optional()
    .describe('Character class to filter by (e.g., "Dragonknight", "Sorcerer")'),
  skill_line: z
    .string()
    .optional()
    .describe('Skill line to filter by (e.g., "Ardent Flame", "Two Handed")'),
});

const GetPatchNotesSchema = z.object({
  api_version: z
    .string()
    .optional()
    .describe('Specific API version to look up (e.g., "101048")'),
});

const FetchApiDocsSchema = z.object({
  query: z.string().describe('Search term across functions, events, and constants'),
});

const FetchEsoUiSourceSchema = z.object({
  file_path: z
    .string()
    .optional()
    .describe('Specific source file path to construct a URL for (e.g., "ingame/map/worldmap.lua")'),
  search_query: z
    .string()
    .optional()
    .describe('Search term to help find relevant source files'),
});

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'search_zones',
    description:
      'Search ESO zones by name and type, including associated gear sets that drop in each zone.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term for zone names',
        },
        zone_type: {
          type: 'string',
          enum: ['Overland', 'Dungeon', 'Trial', 'Arena', 'PvP', 'Housing'],
          description: 'Filter by zone type',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_skills',
    description:
      'Search for ESO skill information. LIMITATION: Skill data (names, morphs, costs, descriptions) is NOT in the local database - it can only be extracted from the ESO game client. This tool provides links to UESP skill browser and relevant API function references instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term for skill names',
        },
        class: {
          type: 'string',
          description: 'Character class to filter by',
        },
        skill_line: {
          type: 'string',
          description: 'Skill line to filter by',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_patch_notes_summary',
    description:
      'Get information about the currently loaded API version, available data, and links to official patch notes and changelogs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api_version: {
          type: 'string',
          description: 'Specific API version to look up',
        },
      },
    },
  },
  {
    name: 'fetch_api_docs',
    description:
      'RECOMMENDED FIRST SEARCH: Combined search across ALL ESO API types - functions, events, AND constants in one query. Use this when you are not sure whether something is a function, event, or constant. Returns top results from each category. More convenient than calling search_api_functions, search_events, and search_constants separately.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term across functions, events, and constants',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_esoui_source',
    description:
      'Get direct URLs to specific ESO UI source files on UESP or GitHub. Returns URLs and directory guides - does NOT fetch actual file content. Use this when you know WHICH file you need (e.g., "ingame/inventory/inventory.lua"). For searching by topic/keyword, use search_source_code instead. Also provides a directory structure guide of the ESO UI codebase.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description:
            'Specific source file path (e.g., "ingame/map/worldmap.lua") to get a direct link',
        },
        search_query: {
          type: 'string',
          description: 'Search term to help find relevant source files',
        },
      },
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'search_zones': {
      const params = SearchZonesSchema.parse(args);

      const zones = db.searchZones({
        query: params.query,
        zone_type: params.zone_type,
        limit: 25,
      });

      if (zones.length === 0) {
        return jsonResult({
          zones: [],
          message: `No zones found matching "${params.query}"${params.zone_type ? ` with type "${params.zone_type}"` : ''}.`,
          suggestion: 'Try a broader search term or remove the zone_type filter.',
        });
      }

      // Enrich each zone with its associated sets
      const zonesWithSets = zones.map((zone: any) => {
        const sets = db.getZoneSets(zone.zone_id);
        return {
          ...zone,
          sets: sets.map((s) => ({
            set_id: s.set_id,
            name: s.name,
            set_type: s.set_type,
            is_veteran: s.is_veteran,
          })),
          sets_count: sets.length,
        };
      });

      return jsonResult({
        total: zonesWithSets.length,
        zones: zonesWithSets,
      });
    }

    case 'search_skills': {
      const params = SearchSkillsSchema.parse(args);

      // Skill data is not yet in the local database - provide helpful guidance
      const classSkillLines: Record<string, string[]> = {
        Dragonknight: ['Ardent Flame', 'Draconic Power', 'Earthen Heart'],
        Sorcerer: ['Storm Calling', 'Dark Magic', 'Daedric Summoning'],
        Nightblade: ['Assassination', 'Shadow', 'Siphoning'],
        Templar: ["Aedric Spear", "Dawn's Wrath", 'Restoring Light'],
        Warden: ['Animal Companions', "Winter's Embrace", 'Green Balance'],
        Necromancer: ['Grave Lord', 'Bone Tyrant', 'Living Death'],
        Arcanist: ['Herald of the Tome', 'Apocryphal Soldier', 'Curative Runeforms'],
      };

      const weaponSkillLines = [
        'Two Handed',
        'One Hand and Shield',
        'Dual Wield',
        'Bow',
        'Destruction Staff',
        'Restoration Staff',
      ];

      const guildSkillLines = [
        'Fighters Guild',
        'Mages Guild',
        'Undaunted',
        'Psijic Order',
        'Dark Brotherhood',
        'Thieves Guild',
      ];

      const response: Record<string, unknown> = {
        message:
          'Skill data is not yet available in the local database. Here are resources for looking up skills:',
        resources: {
          uesp_skill_browser: 'http://esoitem.uesp.net/viewSkills.php',
          uesp_skill_calculator: 'https://en.uesp.net/wiki/Special:EsoSkills',
          esoui_wiki: 'https://wiki.esoui.com/Skill_functions',
        },
        api_functions_for_skills: {
          get_name: 'GetAbilityName(abilityId) - Returns the name of an ability by its ID',
          get_description:
            'GetAbilityDescription(abilityId) - Returns ability description text',
          get_icon: 'GetAbilityIcon(abilityId) - Returns the icon texture path',
          get_cost:
            'GetAbilityCost(abilityId) - Returns cost, mechanic, and cost mechanic',
          get_range: 'GetAbilityRange(abilityId) - Returns max range',
          get_duration: 'GetAbilityDuration(abilityId) - Returns duration in ms',
          is_passive: 'IsAbilityPassive(abilityId) - Returns boolean',
          get_skill_line:
            'GetSkillLineInfo(skillType, skillLineIndex) - Returns skill line info',
          get_ability_by_index:
            'GetSkillAbilityInfo(skillType, skillLineIndex, abilityIndex) - Returns ability info',
        },
        search_query: params.query,
      };

      if (params.class && classSkillLines[params.class]) {
        response.class_skill_lines = {
          class: params.class,
          skill_lines: classSkillLines[params.class],
        };
      }

      response.all_skill_line_categories = {
        class_skills: classSkillLines,
        weapon_skills: weaponSkillLines,
        guild_skills: guildSkillLines,
        other: [
          'Assault (PvP)',
          'Support (PvP)',
          'Soul Magic',
          'Werewolf',
          'Vampire',
          'Scribing',
        ],
      };

      return jsonResult(response);
    }

    case 'get_patch_notes_summary': {
      const params = GetPatchNotesSchema.parse(args);

      // Gather import metadata
      const apiVersion = db.getImportMetadata('api_version');
      const setsImportDate = db.getImportMetadata('sets_import_date');
      const setsSource = db.getImportMetadata('sets_source');
      const apiDocsImportDate = db.getImportMetadata('api_docs_import_date');
      const apiDocsSource = db.getImportMetadata('api_docs_source');

      // Get counts from the database
      let functionCount = 0;
      let eventCount = 0;
      let constantCount = 0;
      try {
        functionCount = db.getApiFunctionCount();
        eventCount = db.getApiEventCount();
        constantCount = db.getApiConstantCount();
      } catch {
        // Tables may not exist yet
      }

      const response: Record<string, unknown> = {
        current_data: {
          api_version: apiVersion || 'Not set',
          sets_import_date: setsImportDate || 'Not imported',
          sets_source: setsSource || 'Unknown',
          api_docs_import_date: apiDocsImportDate || 'Not imported',
          api_docs_source: apiDocsSource || 'Unknown',
        },
        database_stats: {
          api_functions: functionCount,
          api_events: eventCount,
          api_constants: constantCount,
        },
        resources: {
          uesp_changelog: 'https://esoapi.uesp.net/current/changelog.txt',
          uesp_api_docs: 'https://esoapi.uesp.net/',
          official_forums:
            'https://forums.elderscrollsonline.com/en/categories/patch-notes',
          esoui_wiki_api: 'https://wiki.esoui.com/API',
        },
        notes: [
          'The UESP changelog contains detailed API changes between versions.',
          'Check the official ESO forums for full patch notes including gameplay changes.',
          'API version changes may deprecate or rename functions - always verify after updates.',
        ],
      };

      if (params.api_version) {
        response.requested_version = params.api_version;
        if (apiVersion && params.api_version !== apiVersion) {
          response.version_note = `Requested version ${params.api_version} differs from currently loaded version ${apiVersion}. The local database reflects version ${apiVersion}.`;
        }
      }

      return jsonResult(response);
    }

    case 'fetch_api_docs': {
      const params = FetchApiDocsSchema.parse(args);

      // Search across all three categories
      let functions: any[] = [];
      let events: any[] = [];
      let constants: any[] = [];

      functions = db.searchApiFunctions({ query: params.query, limit: 15 });

      try {
        events = db.searchEvents({ query: params.query, limit: 10 });
      } catch {
        // Table may not exist
      }

      try {
        constants = db.searchConstants({ query: params.query, limit: 15 });
      } catch {
        // Table may not exist
      }

      const totalResults = functions.length + events.length + constants.length;

      if (totalResults === 0) {
        return jsonResult({
          message: `No API documentation found matching "${params.query}".`,
          suggestions: [
            'Try a broader search term (e.g., "inventory" instead of "GetBagItemInfo")',
            'Use partial names (e.g., "combat" matches EVENT_COMBAT_EVENT and GetCombatMechanicName)',
            'Check spelling - ESO API names use PascalCase (e.g., "GetUnitName" not "getunitname")',
          ],
          online_resources: {
            uesp_api: 'https://esoapi.uesp.net/',
            esoui_wiki: 'https://wiki.esoui.com/API',
            esoui_wiki_events: 'https://wiki.esoui.com/Events',
          },
        });
      }

      return jsonResult({
        query: params.query,
        total_results: totalResults,
        functions: functions.map((f) => ({
          name: f.name,
          namespace: f.namespace,
          category: f.category,
          signature: f.signature,
          parameters: f.parameters,
          return_values: f.return_values,
          description: f.description,
          is_protected: f.is_protected,
        })),
        events: events.map((e) => ({
          name: e.name,
          category: e.category,
          parameters: e.parameters,
          description: e.description,
        })),
        constants: constants.map((c) => ({
          name: c.name,
          group_name: c.group_name,
          value: c.value,
          description: c.description,
        })),
        online_resources: {
          uesp_api: 'https://esoapi.uesp.net/',
          esoui_wiki: 'https://wiki.esoui.com/API',
          esoui_wiki_events: 'https://wiki.esoui.com/Events',
          esoui_wiki_constants: 'https://wiki.esoui.com/Constants',
        },
      });
    }

    case 'fetch_esoui_source': {
      const params = FetchEsoUiSourceSchema.parse(args);

      const uesp_base = 'https://esoapi.uesp.net/current/src/';
      const github_base = 'https://github.com/esoui/esoui/tree/master';

      const keyDirectories = {
        'ingame/': 'Main in-game UI code (map, inventory, chat, combat, etc.)',
        'libraries/': 'ZOS shared UI libraries (ZO_SortFilterList, ZO_Tree, ZO_ScrollList, etc.)',
        'common/': 'Common utilities shared across UI systems (ZO_ColorDef, ZO_LinkHandler, etc.)',
        'pregame/': 'Character creation, login screen, server select UI',
        'pregameandingame/': 'Code shared between pregame and ingame (options, settings, etc.)',
        'publicallingame/': 'Public API wrappers and utilities accessible to addons',
        'internalingame/': 'Internal game systems not typically accessible to addons',
      };

      const response: Record<string, unknown> = {
        source_browsers: {
          uesp: {
            base_url: uesp_base,
            description:
              'UESP hosts the decompiled ESO UI source. Best for browsing and reference.',
          },
          github: {
            base_url: github_base,
            description:
              'Community-maintained GitHub mirror. Best for searching, diffing, and version history.',
          },
        },
        key_directories: keyDirectories,
        useful_files: {
          globals:
            'ingame/globals/ - Global constants and utility functions',
          keybindings:
            'ingame/keybindings/ - Keybinding definitions and handlers',
          inventory:
            'ingame/inventory/ - Inventory, bank, guild bank UI',
          map: 'ingame/map/ - World map, zone map, and minimap',
          chat: 'ingame/chat/ - Chat system and text formatting',
          combat:
            'ingame/combat/ - Combat text, buff tracker, death recap',
          crafting:
            'ingame/crafting/ - All crafting station UIs',
          tooltip:
            'ingame/tooltip/ - Tooltip creation and formatting',
          unitframes:
            'ingame/unitframes/ - Health/magicka/stamina bars',
          guild: 'ingame/guild/ - Guild management UI',
          trading:
            'ingame/tradinghouse/ - Guild trader / trading house UI',
          zo_templates:
            'libraries/zo_templates/ - Reusable UI templates',
          zo_sortfilterlist:
            'libraries/zo_sortfilterlist/ - The sorted/filtered list base class used everywhere',
        },
        tips: [
          'ESO UI source is written in Lua and XML. Lua files contain logic, XML files define layouts.',
          'Most addon-accessible functions are in the ingame/ directory.',
          'The libraries/ directory contains reusable base classes you can inherit from in addons.',
          'Search for EVENT_MANAGER:RegisterForEvent to see how ZOS handles events internally.',
          'ZO_ prefix indicates ZeniMax Online utility functions/classes available to addons.',
        ],
      };

      if (params.file_path) {
        // Normalize the path: remove leading slashes, normalize separators
        const normalizedPath = params.file_path
          .replace(/\\/g, '/')
          .replace(/^\//, '');

        response.direct_links = {
          uesp: `${uesp_base}${normalizedPath}`,
          github: `${github_base}/${normalizedPath}`,
        };
        response.requested_file = normalizedPath;
      }

      if (params.search_query) {
        response.search_suggestions = {
          github_search: `https://github.com/search?q=repo%3Aesoui%2Fesoui+${encodeURIComponent(params.search_query)}&type=code`,
          tip: `Search the GitHub mirror for "${params.search_query}" to find relevant source files.`,
        };

        // Also try to find related API functions in our database
        try {
          const relatedFunctions = db.searchApiFunctions({
            query: params.search_query,
            limit: 10,
          });
          if (relatedFunctions.length > 0) {
            response.related_api_functions = relatedFunctions.map((f) => ({
              name: f.name,
              source_file: f.source_file,
              category: f.category,
            }));
          }
        } catch {
          // Database may not have the data
        }
      }

      return jsonResult(response);
    }

    default:
      return errorResult(`Unknown eso-data tool: ${name}`);
  }
}

export const esoDataModule: ToolModule = { definitions, handler };
