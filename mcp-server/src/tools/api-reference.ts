import { z } from 'zod';
import { db } from '../database/db.js';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';

// ===== HELPER: Safe JSON parse =====

function safeJsonParse(value: string | undefined | null, fallback: unknown = null): unknown {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// ===== SCHEMAS =====

const SearchApiFunctionsSchema = z.object({
  query: z.string().describe('Search term for function names, descriptions, or signatures'),
  category: z.string().optional().describe('Filter by API category (e.g. "inventory", "combat", "ui")'),
  namespace: z.string().optional().describe('Filter by namespace (e.g. "SCENE_MANAGER", "ZO_")'),
  limit: z.number().default(30).describe('Maximum number of results to return'),
});

const GetFunctionDetailsSchema = z.object({
  function_name: z.string().describe('The exact name of the API function to look up'),
});

const SearchEventsSchema = z.object({
  query: z.string().describe('Search term for event names or descriptions'),
  category: z.string().optional().describe('Filter by event category'),
  limit: z.number().default(30).describe('Maximum number of results to return'),
});

const SearchConstantsSchema = z.object({
  query: z.string().optional().describe('Search term for constant names'),
  group_name: z.string().optional().describe('Filter by constant group/enum name'),
  limit: z.number().default(50).describe('Maximum number of results to return'),
});

const GetUiControlInfoSchema = z.object({
  control_type: z.string().optional().describe('The UI control type to look up (e.g. "CT_LABEL", "CT_BUTTON"). Omit to list all control types.'),
});

const SearchSourceCodeSchema = z.object({
  query: z.string().describe('What you are looking for in the ESO source code'),
  file_pattern: z.string().optional().describe('Optional file pattern to narrow the search (e.g. "inventory", "crafting")'),
});

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'search_api_functions',
    description:
      'Search ESO API FUNCTIONS ONLY (not events or constants!). For EVENT_* lookups, use search_events instead. For combined search across all types, use fetch_api_docs. NOTE: Many functions have namespace prefixes like ZO_, ZO_WorldMap_, ZO_Inventory_. If no results, try a shorter substring (e.g., search "NormalizedPoint" instead of "ZO_WorldMap_IsNormalizedPointInsideMapBounds"). Returns function signatures with typed parameters.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term for function names, descriptions, or signatures' },
        category: { type: 'string', description: 'Filter by API category (e.g. "inventory", "combat", "ui")' },
        namespace: { type: 'string', description: 'Filter by namespace (e.g. "SCENE_MANAGER", "ZO_")' },
        limit: { type: 'number', default: 30, description: 'Maximum number of results to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_function_details',
    description:
      'Get full details about a specific ESO API function including its signature, parameters, return values, description, and related functions with a similar prefix.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        function_name: { type: 'string', description: 'The exact name of the API function to look up' },
      },
      required: ['function_name'],
    },
  },
  {
    name: 'search_events',
    description:
      'Search ESO EVENTS by name or category (e.g., EVENT_ZONE_CHANGED, EVENT_COMBAT_EVENT). This is separate from search_api_functions which only searches functions. All ESO events start with EVENT_ prefix. Include the EVENT_ prefix in your query for best results, or use a keyword like "ZONE" or "COMBAT". Returns event names, categories, and typed parameter lists. 586 of 1025 events have full parameter definitions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term for event names or descriptions' },
        category: { type: 'string', description: 'Filter by event category' },
        limit: { type: 'number', default: 30, description: 'Maximum number of results to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_constants',
    description:
      'Search ESO constants and enums. If no query or group_name is provided, returns a list of all constant groups with their counts. Otherwise filters constants by name or group.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term for constant names' },
        group_name: { type: 'string', description: 'Filter by constant group/enum name' },
        limit: { type: 'number', default: 50, description: 'Maximum number of results to return' },
      },
    },
  },
  {
    name: 'get_ui_control_info',
    description:
      'Get information about ESO UI control types. If a specific control_type is given, returns its methods, properties, and events. If omitted, returns a list of all available UI control types.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        control_type: {
          type: 'string',
          description: 'The UI control type to look up (e.g. "CT_LABEL", "CT_BUTTON"). Omit to list all control types.',
        },
      },
    },
  },
  {
    name: 'search_source_code',
    description:
      'Search for ESO source code by topic or pattern. Returns constructed search URLs for UESP source browser and GitHub, plus directory structure tips. Use this when you need to find HOW something is implemented in the ESO UI source code. For browsing specific files, use fetch_esoui_source instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What you are looking for in the ESO source code' },
        file_pattern: {
          type: 'string',
          description: 'Optional file pattern to narrow the search (e.g. "inventory", "crafting")',
        },
      },
      required: ['query'],
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    // ──────────────────────────────────────────────
    // 1. search_api_functions
    // ──────────────────────────────────────────────
    case 'search_api_functions': {
      const params = SearchApiFunctionsSchema.parse(args);
      const results = db.searchApiFunctions({
        query: params.query,
        category: params.category,
        namespace: params.namespace,
        limit: params.limit,
      });

      if (results.length === 0) {
        return jsonResult({
          message: `No API functions found matching "${params.query}"`,
          suggestions: [
            'Try a broader search term',
            'Check spelling — ESO API names use PascalCase (e.g. "GetItemLink")',
            'Try searching by category or namespace instead',
          ],
        });
      }

      const mapped = results.map((fn: any) => ({
        name: fn.name,
        signature: fn.signature || fn.name,
        category: fn.category || undefined,
        namespace: fn.namespace || undefined,
        is_protected: fn.is_protected,
        is_deprecated: fn.is_deprecated ? true : undefined,
        source_type: fn.source_type || undefined,
      }));

      return jsonResult({
        count: mapped.length,
        functions: mapped,
      });
    }

    // ──────────────────────────────────────────────
    // 2. get_function_details
    // ──────────────────────────────────────────────
    case 'get_function_details': {
      const params = GetFunctionDetailsSchema.parse(args);
      const func = db.getFunctionByName(params.function_name);

      if (!func) {
        // Try a search to suggest alternatives
        const suggestions = db.searchApiFunctions({ query: params.function_name, limit: 5 });
        return errorResult(
          `Function "${params.function_name}" not found.` +
            (suggestions.length > 0
              ? ` Did you mean one of: ${suggestions.map((s) => s.name).join(', ')}?`
              : ' Try using search_api_functions to find the correct name.')
        );
      }

      const related = db.getRelatedFunctions(func.name, 10);

      const details: any = {
        name: func.name,
        namespace: func.namespace || undefined,
        category: func.category || undefined,
        signature: func.signature || undefined,
        parameters: safeJsonParse(func.parameters, []),
        return_values: safeJsonParse(func.return_values, []),
        description: func.description || undefined,
        source_file: func.source_file || undefined,
        is_protected: func.is_protected,
        is_deprecated: (func as any).is_deprecated ? true : undefined,
        source_type: (func as any).source_type || undefined,
        api_version: func.api_version || undefined,
        related_functions: related.length > 0 ? related.map((r) => r.name) : undefined,
      };
      if (details.is_deprecated) {
        details.deprecation_warning = 'This function is a deprecated compatibility alias. It may be removed in future API versions. Check for a current replacement.';
      }

      return jsonResult(details);
    }

    // ──────────────────────────────────────────────
    // 3. search_events
    // ──────────────────────────────────────────────
    case 'search_events': {
      const params = SearchEventsSchema.parse(args);
      const results = db.searchEvents({
        query: params.query,
        category: params.category,
        limit: params.limit,
      });

      if (results.length === 0) {
        return jsonResult({
          message: `No events found matching "${params.query}"`,
          suggestions: [
            'Try a broader search term',
            'ESO events use SCREAMING_SNAKE_CASE (e.g. "EVENT_INVENTORY_SINGLE_SLOT_UPDATE")',
            'Try searching by category',
          ],
        });
      }

      const mapped = results.map((evt) => ({
        name: evt.name,
        category: evt.category || undefined,
        parameters: safeJsonParse(evt.parameters, []),
        description: evt.description || undefined,
      }));

      return jsonResult({
        count: mapped.length,
        events: mapped,
      });
    }

    // ──────────────────────────────────────────────
    // 4. search_constants
    // ──────────────────────────────────────────────
    case 'search_constants': {
      const params = SearchConstantsSchema.parse(args);

      // If no query and no group_name provided, return list of all constant groups
      if (!params.query && !params.group_name) {
        const groups = db.getConstantGroups();

        if (groups.length === 0) {
          return jsonResult({
            message: 'No constant groups found in the database',
          });
        }

        return jsonResult({
          message: 'Available constant groups. Use group_name parameter to see constants in a specific group.',
          count: groups.length,
          groups,
        });
      }

      const results = db.searchConstants({
        query: params.query,
        group_name: params.group_name,
        limit: params.limit,
      });

      if (results.length === 0) {
        return jsonResult({
          message: `No constants found matching the given criteria`,
          suggestions: [
            'Try a broader search term',
            'ESO constants use SCREAMING_SNAKE_CASE (e.g. "ITEM_QUALITY_LEGENDARY")',
            'Use search_constants without parameters to see available groups',
          ],
        });
      }

      const mapped = results.map((c) => ({
        name: c.name,
        group_name: c.group_name || undefined,
        value: c.value || undefined,
        value_type: c.value_type || undefined,
        description: c.description || undefined,
      }));

      return jsonResult({
        count: mapped.length,
        constants: mapped,
      });
    }

    // ──────────────────────────────────────────────
    // 5. get_ui_control_info
    // ──────────────────────────────────────────────
    case 'get_ui_control_info': {
      const params = GetUiControlInfoSchema.parse(args);

      if (!params.control_type) {
        // List all available control types
        const controls = db.listUiControls();

        if (controls.length === 0) {
          return jsonResult({
            message: 'No UI controls found in the database',
          });
        }

        const controlList = controls.map((c) => ({
          control_type: c.control_type,
          parent_type: c.parent_type || undefined,
          xml_element: c.xml_element || undefined,
          description: c.description || undefined,
        }));

        return jsonResult({
          message: 'Available UI control types. Use control_type parameter to get full details.',
          count: controlList.length,
          controls: controlList,
        });
      }

      const control = db.getUiControlInfo(params.control_type);

      if (!control) {
        // List available controls as suggestions
        const allControls = db.listUiControls();
        const controlNames = allControls.map((c) => c.control_type);
        return errorResult(
          `UI control type "${params.control_type}" not found.` +
            (controlNames.length > 0
              ? ` Available types: ${controlNames.join(', ')}`
              : ' No UI controls are loaded in the database.')
        );
      }

      const parsed = {
        control_type: control.control_type,
        methods: safeJsonParse(control.methods, []),
        properties: safeJsonParse(control.properties, []),
        events: safeJsonParse(control.events, []),
        parent_type: control.parent_type || undefined,
        xml_element: control.xml_element || undefined,
        description: control.description || undefined,
      };

      return jsonResult(parsed);
    }

    // ──────────────────────────────────────────────
    // 6. search_source_code
    // ──────────────────────────────────────────────
    case 'search_source_code': {
      const params = SearchSourceCodeSchema.parse(args);

      const uespBaseUrl = 'https://esoapi.uesp.net/current/src/';
      const githubBaseUrl = 'https://github.com/esoui/esoui';

      const searchTips: string[] = [];

      if (params.file_pattern) {
        searchTips.push(
          `UESP Source Browser — search within files matching "${params.file_pattern}": ${uespBaseUrl}`,
          `GitHub — search for "${params.query}" in path "${params.file_pattern}": ${githubBaseUrl}/search?q=${encodeURIComponent(params.query)}+path%3A${encodeURIComponent(params.file_pattern)}`
        );
      } else {
        searchTips.push(
          `UESP Source Browser — browse all ESO UI source files: ${uespBaseUrl}`,
          `GitHub — search for "${params.query}": ${githubBaseUrl}/search?q=${encodeURIComponent(params.query)}`
        );
      }

      return jsonResult({
        message: `The ESO UI source code is not stored locally, but you can search it online.`,
        query: params.query,
        file_pattern: params.file_pattern || undefined,
        resources: [
          {
            name: 'UESP ESO API Source Browser',
            url: uespBaseUrl,
            description:
              'Complete browseable source tree of all ESO UI Lua and XML files. Updated each patch. Best for browsing file structure and reading full source files.',
          },
          {
            name: 'esoui GitHub Repository',
            url: githubBaseUrl,
            description:
              'Community-maintained mirror of the ESO UI source code on GitHub. Supports code search, blame, and history. Best for searching across all files.',
          },
        ],
        search_links: searchTips,
        tips: [
          'ESO UI source is written in Lua and XML',
          'Ingame files are organized under /esoui/ingame/<feature>/',
          'Library/utility code lives under /esoui/libraries/',
          'Public Lua files are under /esoui/publicallingames/',
          'Use search_api_functions or search_events to find API definitions before diving into source',
        ],
      });
    }

    default:
      return errorResult(`Unknown API reference tool: ${name}`);
  }
}

export const apiReferenceModule: ToolModule = { definitions, handler };
