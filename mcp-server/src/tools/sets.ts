import { z } from 'zod';
import { db } from '../database/db.js';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';
import type { CharacterClass, CharacterRole, ResourceType } from '../types/builds.js';

// ===== SCHEMAS =====

const SearchSetsSchema = z.object({
  query: z.string().optional().describe('Search term for set names or descriptions'),
  set_type: z
    .enum(['Overland', 'Dungeon', 'Trial', 'Arena', 'Crafted', 'Monster', 'Mythic', 'PvP'])
    .optional()
    .describe('Filter by set type'),
  dlc_id: z.number().optional().describe('Filter by DLC ID (0 for base game)'),
  armor_weight: z
    .enum(['Light', 'Medium', 'Heavy'])
    .optional()
    .describe('Filter by armor weight'),
  limit: z.number().default(20).describe('Maximum number of results to return'),
});

const GetSetDetailsSchema = z.object({
  set_id: z.number().optional().describe('The set ID to retrieve'),
  set_name: z.string().optional().describe('The set name to retrieve'),
});

const UpdateCharacterContextSchema = z.object({
  context_id: z.string().describe('Unique ID for this character context (use UUID or username)'),
  class: z
    .enum(['Dragonknight', 'Sorcerer', 'Nightblade', 'Templar', 'Warden', 'Necromancer', 'Arcanist'])
    .describe('Character class'),
  level: z.number().min(1).max(50).default(50).describe('Character level'),
  role: z.enum(['DPS', 'Tank', 'Healer', 'PvP']).optional().describe('Desired role for the build'),
  build_goal: z.string().optional().describe('User-provided description of build goals'),
  dlc_owned: z.array(z.string()).optional().describe('List of owned DLCs'),
  crafting_traits: z
    .object({
      blacksmithing: z.number().min(0).max(9).optional(),
      clothier: z.number().min(0).max(9).optional(),
      woodworking: z.number().min(0).max(9).optional(),
    })
    .optional()
    .describe('Number of researched traits for crafting'),
  current_sets: z.array(z.string()).optional().describe('Currently equipped set names'),
});

const RecommendBuildsSchema = z.object({
  class: z
    .enum(['Dragonknight', 'Sorcerer', 'Nightblade', 'Templar', 'Warden', 'Necromancer', 'Arcanist'])
    .describe('Character class'),
  role: z.enum(['DPS', 'Tank', 'Healer', 'PvP']).describe('Desired role'),
  resource: z.enum(['Magicka', 'Stamina', 'Hybrid']).optional().describe('Primary resource type'),
  level: z.number().min(1).max(50).optional().describe('Character level'),
  dlc_owned: z.array(z.string()).optional().describe('List of owned DLCs'),
  include_trial_sets: z.boolean().default(false).describe('Include trial sets in recommendations'),
  max_crafting_traits: z.number().min(0).max(9).default(9).describe('Maximum crafting traits'),
});

const CompareSetsSchema = z.object({
  set_ids: z
    .array(z.number())
    .min(2)
    .max(4)
    .describe('Array of set IDs to compare (2-4 sets)'),
});

const GetFarmingGuideSchema = z.object({
  set_id: z.number().optional().describe('The set ID to get farming guide for'),
  set_name: z.string().optional().describe('The set name to get farming guide for'),
});

const GetSetByCategorySchema = z.object({
  category: z
    .enum([
      'beginner_friendly',
      'endgame_dps',
      'pvp_meta',
      'crafted_6_trait',
      'crafted_9_trait',
      'monster_sets',
      'mythic_items',
    ])
    .describe('Predefined category to browse'),
});

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'search_sets',
    description: 'Search for ESO equipment sets by name, type, DLC, or armor weight. Returns a list of sets matching the criteria.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term for set names or descriptions' },
        set_type: {
          type: 'string',
          enum: ['Overland', 'Dungeon', 'Trial', 'Arena', 'Crafted', 'Monster', 'Mythic', 'PvP'],
          description: 'Filter by set type',
        },
        dlc_id: { type: 'number', description: 'Filter by DLC ID (0 for base game)' },
        armor_weight: {
          type: 'string',
          enum: ['Light', 'Medium', 'Heavy'],
          description: 'Filter by armor weight',
        },
        limit: { type: 'number', default: 20, description: 'Maximum number of results' },
      },
    },
  },
  {
    name: 'get_set_details',
    description: 'Get details about a specific ESO set including bonus descriptions (2pc/3pc/4pc/5pc), locations, drop mechanics, and zone info. Covers 669+ sets with bonus text. LIMITATION: Equipment type/armor weight data is not fully populated for all sets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        set_id: { type: 'number', description: 'The set ID to retrieve' },
        set_name: { type: 'string', description: 'The set name to retrieve' },
      },
    },
  },
  {
    name: 'update_character_context',
    description: 'Store or update character information for personalized build recommendations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        context_id: { type: 'string', description: 'Unique ID for this character (use username or UUID)' },
        class: {
          type: 'string',
          enum: ['Dragonknight', 'Sorcerer', 'Nightblade', 'Templar', 'Warden', 'Necromancer', 'Arcanist'],
          description: 'Character class',
        },
        level: { type: 'number', minimum: 1, maximum: 50, description: 'Character level' },
        role: { type: 'string', enum: ['DPS', 'Tank', 'Healer', 'PvP'], description: 'Desired role' },
        build_goal: { type: 'string', description: 'Description of build goals' },
        dlc_owned: { type: 'array', items: { type: 'string' }, description: 'List of owned DLCs' },
        crafting_traits: {
          type: 'object',
          properties: {
            blacksmithing: { type: 'number', minimum: 0, maximum: 9 },
            clothier: { type: 'number', minimum: 0, maximum: 9 },
            woodworking: { type: 'number', minimum: 0, maximum: 9 },
          },
          description: 'Number of researched traits',
        },
        current_sets: { type: 'array', items: { type: 'string' }, description: 'Currently equipped sets' },
      },
      required: ['context_id', 'class'],
    },
  },
  {
    name: 'recommend_builds',
    description: 'Get build recommendations based on class, role, and other preferences. LIMITATION: Currently uses simple template matching with a small number of pre-defined builds. Results may be limited for some class/role combinations. For comprehensive build advice, combine with search_sets and compare_sets.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        class: {
          type: 'string',
          enum: ['Dragonknight', 'Sorcerer', 'Nightblade', 'Templar', 'Warden', 'Necromancer', 'Arcanist'],
        },
        role: { type: 'string', enum: ['DPS', 'Tank', 'Healer', 'PvP'] },
        resource: { type: 'string', enum: ['Magicka', 'Stamina', 'Hybrid'], description: 'Primary resource' },
        level: { type: 'number' },
        dlc_owned: { type: 'array', items: { type: 'string' } },
        include_trial_sets: { type: 'boolean', default: false },
        max_crafting_traits: { type: 'number', minimum: 0, maximum: 9, default: 9 },
      },
      required: ['class', 'role'],
    },
  },
  {
    name: 'compare_sets',
    description: 'Compare 2-4 equipment sets side-by-side, showing bonuses, farming difficulty, and accessibility.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        set_ids: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 4,
          description: 'Array of set IDs to compare',
        },
      },
      required: ['set_ids'],
    },
  },
  {
    name: 'get_farming_guide',
    description: 'Get detailed farming guide for a specific set including locations, wayshrines, requirements, and efficiency tips.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        set_id: { type: 'number', description: 'The set ID' },
        set_name: { type: 'string', description: 'The set name' },
      },
    },
  },
  {
    name: 'get_set_by_category',
    description: 'Browse sets by predefined categories like beginner-friendly, endgame DPS, PvP meta, etc.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['beginner_friendly', 'endgame_dps', 'pvp_meta', 'crafted_6_trait', 'crafted_9_trait', 'monster_sets', 'mythic_items'],
        },
      },
      required: ['category'],
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'search_sets': {
      const params = SearchSetsSchema.parse(args);
      const results = db.searchSets(params);
      return jsonResult(results);
    }

    case 'get_set_details': {
      const params = GetSetDetailsSchema.parse(args);
      let setDetails = null;

      if (params.set_id) {
        setDetails = db.getSetDetails(params.set_id);
      } else if (params.set_name) {
        const set = db.getSetByName(params.set_name);
        if (set) {
          setDetails = db.getSetDetails(set.set_id);
        }
      }

      if (!setDetails) {
        return errorResult('Set not found');
      }
      return jsonResult(setDetails);
    }

    case 'update_character_context': {
      const params = UpdateCharacterContextSchema.parse(args);
      db.saveCharacterContext(params);
      return jsonResult({ success: true, context_id: params.context_id });
    }

    case 'recommend_builds': {
      const params = RecommendBuildsSchema.parse(args);
      const templates = db.getBuildTemplates({
        class: params.class as CharacterClass,
        role: params.role as CharacterRole,
        resource: params.resource as ResourceType,
      });

      return jsonResult({
        message: 'Build recommendations based on templates',
        templates,
        note: 'This is using simple template matching. Full recommendation engine coming soon.',
      });
    }

    case 'compare_sets': {
      const params = CompareSetsSchema.parse(args);
      const comparisons = params.set_ids.map((id) => db.getSetDetails(id));
      return jsonResult({ sets: comparisons });
    }

    case 'get_farming_guide': {
      const params = GetFarmingGuideSchema.parse(args);
      let setId: number | undefined;

      if (params.set_id) {
        setId = params.set_id;
      } else if (params.set_name) {
        const set = db.getSetByName(params.set_name);
        setId = set?.set_id;
      }

      if (!setId) {
        return errorResult('Set not found');
      }

      const details = db.getSetDetails(setId);
      if (!details) {
        return errorResult('Set not found');
      }

      const farmingGuide = {
        set: details.set,
        locations: details.locations,
        wayshrines: details.wayshrines || [],
        requirements: {
          dlc: details.set.dlc_name !== 'Base Game' ? details.set.dlc_name : undefined,
          veteran_mode: details.set.is_veteran,
          group_content: ['Dungeon', 'Trial', 'Arena'].includes(details.set.set_type),
          traits_needed: details.set.traits_needed,
        },
        drop_mechanics: details.locations.map((l) => l.drop_mechanic || 'Unknown'),
        efficiency_tips: [
          details.set.set_type === 'Crafted'
            ? 'This is a crafted set. Find a crafting station or ask a guild member to craft it for you.'
            : 'Farm this by running the associated content repeatedly.',
          details.set.is_veteran
            ? 'Veteran mode required for best rewards.'
            : 'Available in normal mode.',
        ],
      };

      return jsonResult(farmingGuide);
    }

    case 'get_set_by_category': {
      const params = GetSetByCategorySchema.parse(args);
      const results = db.getSetsByCategory(params.category);
      return jsonResult(results);
    }

    default:
      return errorResult(`Unknown set tool: ${name}`);
  }
}

export const setsModule: ToolModule = { definitions, handler };
