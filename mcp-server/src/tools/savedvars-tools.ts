import { z } from 'zod';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';
import { validateSavedVarsPath, validatePath, PathValidationError } from '../services/path-validator.js';

// ===== SCHEMAS =====

const AnalyzeSavedVariablesSchema = z.object({
  addon_name: z
    .string()
    .optional()
    .describe('Addon name (e.g., "LibHistoire") to find in default SavedVariables location'),
  file_path: z
    .string()
    .optional()
    .describe('Full path to a .lua SavedVariables file'),
});

const ParseAddonErrorLogSchema = z.object({
  error_text: z
    .string()
    .optional()
    .describe('Raw ESO Lua error text to parse'),
  log_path: z
    .string()
    .optional()
    .describe('Path to an error log file'),
});

// ===== HELPER FUNCTIONS =====

function getDefaultSavedVarsPath(addonName: string): string {
  return join(
    homedir(),
    'Documents',
    'Elder Scrolls Online',
    'live',
    'SavedVariables',
    `${addonName}.lua`
  );
}

function extractTopLevelKeys(content: string): string[] {
  const keys: string[] = [];
  // Match top-level table assignments like: MyAddon_SavedVariables = or ["key"] =
  const topLevelPattern = /^(\w+)\s*=/gm;
  let match: RegExpExecArray | null;
  while ((match = topLevelPattern.exec(content)) !== null) {
    // Only include if the assignment is truly at line start (no leading whitespace means top-level)
    const lineStart = content.lastIndexOf('\n', match.index) + 1;
    const prefix = content.substring(lineStart, match.index);
    if (prefix.trim() === '') {
      keys.push(match[1]);
    }
  }
  return [...new Set(keys)];
}

function countEntries(content: string): number {
  const matches = content.match(/\["/g);
  return matches ? matches.length : 0;
}

function detectNestingDepth(content: string): number {
  let maxDepth = 0;
  let currentDepth = 0;
  for (const char of content) {
    if (char === '{') {
      currentDepth++;
      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }
    } else if (char === '}') {
      currentDepth--;
    }
  }
  return maxDepth;
}

interface ParsedError {
  type: string;
  message: string;
  file: string | null;
  line: number | null;
  suggestion: string;
}

function parseEsoError(errorLine: string): ParsedError | null {
  // Pattern: user:/AddOns/AddonName/File.lua:123: error message
  const errorPattern = /(?:user:\/AddOns\/([^\s:]+\.lua)):(\d+):\s*(.+)/;
  const match = errorLine.match(errorPattern);

  if (!match) {
    // Try a more general pattern without the file path
    const generalPattern = /:\s*(\d+):\s*(.+)/;
    const generalMatch = errorLine.match(generalPattern);
    if (generalMatch) {
      const message = generalMatch[2].trim();
      return {
        type: classifyError(message),
        message,
        file: null,
        line: parseInt(generalMatch[1], 10),
        suggestion: getSuggestion(message),
      };
    }
    // If nothing matches, treat the whole thing as a message
    if (errorLine.trim().length > 0) {
      return {
        type: classifyError(errorLine),
        message: errorLine.trim(),
        file: null,
        line: null,
        suggestion: getSuggestion(errorLine),
      };
    }
    return null;
  }

  const file = match[1];
  const line = parseInt(match[2], 10);
  const message = match[3].trim();

  return {
    type: classifyError(message),
    message,
    file,
    line,
    suggestion: getSuggestion(message),
  };
}

function classifyError(message: string): string {
  if (message.includes('attempt to index a nil value')) return 'nil_index';
  if (message.includes('attempt to call a nil value')) return 'nil_call';
  if (message.includes('attempt to perform arithmetic on a nil value')) return 'nil_arithmetic';
  if (message.includes('bad argument')) return 'bad_argument';
  if (message.includes('Protected function')) return 'protected_function';
  if (message.includes('stack overflow')) return 'stack_overflow';
  if (message.includes('attempt to concatenate')) return 'nil_concatenation';
  if (message.includes('table index is nil')) return 'nil_table_index';
  if (message.includes('out of memory')) return 'out_of_memory';
  return 'unknown';
}

function getSuggestion(message: string): string {
  if (message.includes('attempt to index a nil value')) {
    return 'A variable is nil when you try to access a field/method on it. Check that the variable is initialized properly, the dependency addon is loaded, and that you are not accessing it before EVENT_ADD_ON_LOADED fires.';
  }
  if (message.includes('attempt to call a nil value')) {
    return "A function you're trying to call doesn't exist. Check for typos, verify the API version matches your code, and ensure library dependencies are loaded. The function may have been renamed or removed in a recent API update.";
  }
  if (message.includes('attempt to perform arithmetic on a nil value')) {
    return 'A variable used in an arithmetic operation is nil. Add a nil check before the calculation (e.g., "local val = myVar or 0") or ensure the variable is assigned before use.';
  }
  if (message.includes('bad argument')) {
    return 'A function received a wrong parameter type. Check the API documentation for the correct parameter types. Common causes: passing a string where a number is expected, or vice versa.';
  }
  if (message.includes('Protected function')) {
    return "You're trying to call a protected/restricted function from addon code. Protected functions (like those controlling game actions) can only be called by the game client, not by addons. Use the appropriate event callbacks or hooks instead.";
  }
  if (message.includes('stack overflow')) {
    return 'Infinite recursion detected. Check for circular function calls, recursive event handlers, or callbacks that trigger themselves.';
  }
  if (message.includes('attempt to concatenate')) {
    return 'Trying to concatenate a nil value with a string. Use tostring() or add a nil check before concatenation (e.g., (myVar or "")).';
  }
  if (message.includes('table index is nil')) {
    return 'Trying to use nil as a table key. Ensure the index variable has a valid value before using it to access or assign table entries.';
  }
  if (message.includes('out of memory')) {
    return 'The addon is consuming too much memory. Check for memory leaks: unbounded table growth, missing cleanup in event handlers, or saving excessive data in SavedVariables.';
  }
  return 'Review the error message and check the referenced line. Common causes include nil variables, wrong types, and missing dependencies.';
}

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'analyze_savedvariables',
    description:
      'Analyze an ESO SavedVariables .lua file for structure, size, potential issues, and data overview. REQUIREMENTS: Access to the ESO Documents folder (Documents/Elder Scrolls Online/live/SavedVariables/). The addon must have been loaded in-game at least once and ESO must be closed for SavedVariables to be written. Provide either an addon name or a full file path.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_name: {
          type: 'string',
          description:
            'Addon name (e.g., "LibHistoire") to find in default SavedVariables location',
        },
        file_path: {
          type: 'string',
          description: 'Full path to a .lua SavedVariables file',
        },
      },
    },
  },
  {
    name: 'parse_addon_error_log',
    description:
      'Parse ESO addon Lua errors and provide diagnosis with fix suggestions. Supports standard ESO error format (user:/AddOns/...) and generic Lua errors.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        error_text: {
          type: 'string',
          description: 'Raw ESO Lua error text to parse (can contain multiple errors separated by newlines)',
        },
        log_path: {
          type: 'string',
          description: 'Path to an error log file to read and parse',
        },
      },
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'analyze_savedvariables': {
      const params = AnalyzeSavedVariablesSchema.parse(args);

      if (!params.addon_name && !params.file_path) {
        return errorResult(
          'Please provide either addon_name or file_path to analyze a SavedVariables file.'
        );
      }

      let filePath = params.file_path || getDefaultSavedVarsPath(params.addon_name!);

      // Validate path to prevent path traversal (both file_path and addon_name-derived paths)
      try {
        filePath = validateSavedVarsPath(filePath);
      } catch (e) {
        if (e instanceof PathValidationError) return errorResult(e.message);
        throw e;
      }

      if (!existsSync(filePath)) {
        return errorResult(
          JSON.stringify(
            {
              error: 'SavedVariables file not found',
              path: filePath,
              help: params.addon_name
                ? `Make sure the addon "${params.addon_name}" is installed, has been loaded in-game at least once, and that ESO has been closed (SavedVariables are written on exit).`
                : 'Verify the file path is correct.',
            },
            null,
            2
          )
        );
      }

      try {
        const stats = statSync(filePath);
        const sizeBytes = stats.size;
        const content = readFileSync(filePath, 'utf-8');

        const topLevelKeys = extractTopLevelKeys(content);
        const entryCount = countEntries(content);
        const nestingDepth = detectNestingDepth(content);

        const potentialIssues: string[] = [];

        if (sizeBytes > 1024 * 1024) {
          potentialIssues.push(
            `File is ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB. Large SavedVariables files can cause long load times and increased memory usage. Consider pruning old data.`
          );
        }
        if (sizeBytes > 10 * 1024 * 1024) {
          potentialIssues.push(
            'File exceeds 10 MB. This will significantly impact game load times. The addon should implement data cleanup or rotation.'
          );
        }
        if (nestingDepth > 10) {
          potentialIssues.push(
            `Deeply nested tables detected (depth: ${nestingDepth}). This can cause performance issues during serialization/deserialization.`
          );
        }
        if (entryCount > 10000) {
          potentialIssues.push(
            `High entry count (~${entryCount} entries). Consider if all data needs to be persisted or if some can be computed at runtime.`
          );
        }
        if (content.includes('ZO_SavedVars:NewAccountWide') && content.includes('ZO_SavedVars:New')) {
          potentialIssues.push(
            'File uses both account-wide and character-specific saved variables. Verify the correct defaults are being used for each scope.'
          );
        }

        // Extract a structure overview (first level of each top-level table)
        const structure: Record<string, string[]> = {};
        for (const key of topLevelKeys) {
          const tablePattern = new RegExp(
            `${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*\\{([^}]{0,2000})`,
            's'
          );
          const tableMatch = content.match(tablePattern);
          if (tableMatch) {
            const subKeys: string[] = [];
            const subKeyPattern = /\["([^"]+)"\]/g;
            let subMatch: RegExpExecArray | null;
            const seen = new Set<string>();
            while ((subMatch = subKeyPattern.exec(tableMatch[1])) !== null) {
              if (!seen.has(subMatch[1])) {
                seen.add(subMatch[1]);
                subKeys.push(subMatch[1]);
              }
              if (subKeys.length >= 20) break;
            }
            structure[key] = subKeys;
          } else {
            structure[key] = [];
          }
        }

        return jsonResult({
          file_path: filePath,
          size_bytes: sizeBytes,
          size_readable:
            sizeBytes > 1024 * 1024
              ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
              : `${(sizeBytes / 1024).toFixed(2)} KB`,
          top_level_tables: topLevelKeys,
          entry_count: entryCount,
          nesting_depth: nestingDepth,
          structure,
          potential_issues: potentialIssues,
        });
      } catch (error) {
        return errorResult(
          JSON.stringify(
            {
              error: 'Failed to analyze SavedVariables file',
              message: error instanceof Error ? error.message : String(error),
              path: filePath,
            },
            null,
            2
          )
        );
      }
    }

    case 'parse_addon_error_log': {
      const params = ParseAddonErrorLogSchema.parse(args);

      if (!params.error_text && !params.log_path) {
        return errorResult(
          'Please provide either error_text or log_path to parse addon errors.'
        );
      }

      let rawText: string;

      if (params.log_path) {
        // Validate path to prevent path traversal
        try {
          validatePath(params.log_path, ['.lua', '.txt', '.log']);
        } catch (e) {
          if (e instanceof PathValidationError) return errorResult(e.message);
          throw e;
        }
        if (!existsSync(params.log_path)) {
          return errorResult(
            JSON.stringify(
              {
                error: 'Log file not found',
                path: params.log_path,
              },
              null,
              2
            )
          );
        }
        try {
          rawText = readFileSync(params.log_path, 'utf-8');
        } catch (error) {
          return errorResult(
            JSON.stringify(
              {
                error: 'Failed to read log file',
                message: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        }
      } else {
        rawText = params.error_text!;
      }

      // Split into individual error lines/blocks
      const lines = rawText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const errors: ParsedError[] = [];
      for (const line of lines) {
        const parsed = parseEsoError(line);
        if (parsed) {
          errors.push(parsed);
        }
      }

      if (errors.length === 0) {
        return jsonResult({
          errors: [],
          message:
            'No recognizable ESO error patterns found in the provided text. ESO errors typically look like: "user:/AddOns/AddonName/File.lua:123: error message"',
        });
      }

      // Group by type for summary
      const errorTypeCounts: Record<string, number> = {};
      for (const err of errors) {
        errorTypeCounts[err.type] = (errorTypeCounts[err.type] || 0) + 1;
      }

      return jsonResult({
        total_errors: errors.length,
        error_type_summary: errorTypeCounts,
        errors,
      });
    }

    default:
      return errorResult(`Unknown savedvars tool: ${name}`);
  }
}

export const savedVarsToolsModule: ToolModule = { definitions, handler };
