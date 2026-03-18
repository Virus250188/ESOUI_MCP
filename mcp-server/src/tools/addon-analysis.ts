import { z } from 'zod';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';
import { validateAddonPath, validateManifestPath, PathValidationError } from '../services/path-validator.js';

// ===== SCHEMAS =====

const AnalyzeAddonCodeSchema = z.object({
  addon_path: z.string().describe('Path to the addon directory containing .lua files'),
});

const ValidateAddonManifestSchema = z.object({
  manifest_path: z
    .string()
    .optional()
    .describe('Path to the addon manifest .txt file'),
  manifest_content: z
    .string()
    .optional()
    .describe('Raw manifest content to validate'),
});

// ===== HELPER TYPES =====

interface CodeIssue {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface ManifestField {
  key: string;
  value: string;
}

// ===== HELPER FUNCTIONS =====

function collectLuaFiles(dirPath: string): string[] {
  const luaFiles: string[] = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Recurse into subdirectories but skip common non-code dirs
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          luaFiles.push(...collectLuaFiles(fullPath));
        }
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.lua') {
        luaFiles.push(fullPath);
      }
    }
  } catch {
    // Directory not readable, skip
  }

  return luaFiles;
}

function analyzeGlobalPollution(
  content: string,
  fileName: string
): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('--') || trimmed.length === 0) continue;

    // Skip lines inside functions/blocks (rough heuristic: check indentation)
    // A top-level assignment has no leading whitespace
    if (line.length > 0 && line[0] !== ' ' && line[0] !== '\t') {
      // Check for assignments that aren't local declarations, function defs, or control structures
      const assignMatch = trimmed.match(/^(\w+)\s*=/);
      if (assignMatch) {
        const varName = assignMatch[1];
        // Ignore common patterns that are intentional globals
        if (
          !trimmed.startsWith('local ') &&
          !trimmed.startsWith('function ') &&
          varName !== 'function' &&
          varName !== 'if' &&
          varName !== 'for' &&
          varName !== 'while' &&
          varName !== 'return' &&
          varName !== 'end' &&
          varName !== 'else' &&
          varName !== 'elseif' &&
          // Allow single well-named addon namespace globals (PascalCase with module-like names)
          // but flag simple lowercase names
          /^[a-z]/.test(varName)
        ) {
          issues.push({
            file: fileName,
            line: i + 1,
            message: `Potential global variable pollution: "${varName}" assigned without "local" keyword`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return issues;
}

function analyzeEventHandlers(
  content: string,
  fileName: string
): { issues: CodeIssue[]; warnings: string[] } {
  const issues: CodeIssue[] = [];
  const warnings: string[] = [];
  const lines = content.split('\n');

  // Check for RegisterForEvent without matching UnregisterForEvent
  const registerCalls: string[] = [];
  const unregisterCalls: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match both string literals and variable names as first argument
    const registerMatch = line.match(
      /EVENT_MANAGER:RegisterForEvent\s*\(\s*(?:["']([^"']+)["']|(\w+))\s*,/
    );
    if (registerMatch) {
      registerCalls.push(registerMatch[1] || registerMatch[2]);
    }
    const unregisterMatch = line.match(
      /EVENT_MANAGER:UnregisterForEvent\s*\(\s*(?:["']([^"']+)["']|(\w+))\s*,/
    );
    if (unregisterMatch) {
      unregisterCalls.push(unregisterMatch[1] || unregisterMatch[2]);
    }
  }

  for (const eventName of registerCalls) {
    if (!unregisterCalls.includes(eventName)) {
      warnings.push(
        `Event "${eventName}" in ${fileName} is registered but never unregistered. Consider unregistering when the event is no longer needed (e.g., after EVENT_ADD_ON_LOADED fires).`
      );
    }
  }

  return { issues, warnings };
}

function analyzePerformance(
  content: string,
  fileName: string
): { issues: CodeIssue[]; suggestions: string[] } {
  const issues: CodeIssue[] = [];
  const suggestions: string[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for OnUpdate without throttle
    if (
      trimmed.includes(':SetHandler') &&
      trimmed.includes('"OnUpdate"') &&
      !content.includes('GetFrameTimeMilliseconds') &&
      !content.includes('GetGameTimeMilliseconds')
    ) {
      issues.push({
        file: fileName,
        line: i + 1,
        message:
          'OnUpdate handler without time-based throttle. This fires every frame (~60+ times/sec) and can cause performance issues.',
        severity: 'warning',
      });
    }

    // Check for zo_callLater without cleanup reference
    if (trimmed.includes('zo_callLater') && !trimmed.includes('local')) {
      suggestions.push(
        `${fileName}:${i + 1}: zo_callLater used without storing the ID. Store the return value to cancel it later if needed, or use EVENT_MANAGER:RegisterForUpdate with a named key for easier cleanup.`
      );
    }

    // Check for string concatenation in loops
    if (
      (trimmed.includes('for ') || trimmed.includes('while ')) &&
      content
        .substring(
          content.indexOf(trimmed),
          content.indexOf(trimmed) + 500
        )
        .includes('..')
    ) {
      suggestions.push(
        `${fileName}:${i + 1}: Potential heavy string concatenation in a loop. Consider using table.concat() for better performance.`
      );
    }
  }

  // Check for repeated GetControl calls that could be cached
  const getControlCount = (content.match(/GetControl\(/g) || []).length;
  if (getControlCount > 10) {
    suggestions.push(
      `${fileName}: ${getControlCount} GetControl() calls found. Consider caching control references in local variables for better performance.`
    );
  }

  return { issues, suggestions };
}

function detectDependencies(content: string): string[] {
  const deps = new Set<string>();

  const knownLibs: Record<string, RegExp> = {
    LibAddonMenu: /LibAddonMenu2?|LAM2?/,
    LibAsync: /LibAsync/,
    LibStub: /LibStub/,
    LibCustomMenu: /LibCustomMenu/,
    LibDialog: /LibDialog/,
    LibMediaProvider: /LibMediaProvider/,
    LibMapPing: /LibMapPing/,
    LibGPS: /LibGPS/,
    LibHistoire: /LibHistoire/,
    LibChatMessage: /LibChatMessage/,
    LibSlashCommander: /LibSlashCommander/,
    LibFeedback: /LibFeedback/,
    LibSavedVars: /LibSavedVars/,
    LibDebugLogger: /LibDebugLogger/,
    LibSetDetection: /LibSetDetection/,
    LibScrollableMenu: /LibScrollableMenu/,
    LibCustomTitles: /LibCustomTitles/,
    WritWorthy: /WritWorthy/,
    LibPrice: /LibPrice/,
    LibTextFilter: /LibTextFilter/,
  };

  for (const [name, pattern] of Object.entries(knownLibs)) {
    if (pattern.test(content)) {
      deps.add(name);
    }
  }

  return [...deps];
}

function detectApiCalls(content: string): string[] {
  const apiCalls = new Set<string>();

  // Match ESO API function patterns: Get*, Set*, Is*, Has*, Do*, Can*, etc.
  const apiPattern =
    /\b((?:Get|Set|Is|Has|Do|Can|Create|Destroy|Play|Stop|Show|Hide|Add|Remove|Toggle|Request|Accept|Decline|Cancel|Reset|Update|Apply|Clear|Select|Deselect|Enable|Disable|Register|Unregister|Start|End|Open|Close|Acquire|Release|Assign|Submit|Complete|Abandon|ZO_)\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = apiPattern.exec(content)) !== null) {
    apiCalls.add(match[1]);
    if (apiCalls.size >= 100) break; // Cap to avoid huge lists
  }

  return [...apiCalls].sort();
}

function parseManifestContent(
  content: string
): { fields: ManifestField[]; listedFiles: string[] } {
  const fields: ManifestField[] = [];
  const listedFiles: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Directive lines: ## Key: Value
    const directiveMatch = trimmed.match(/^##\s+(\w+):\s*(.+)/);
    if (directiveMatch) {
      fields.push({ key: directiveMatch[1], value: directiveMatch[2].trim() });
      continue;
    }

    // Skip comments and empty lines
    if (trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.length === 0) {
      continue;
    }

    // File references (.lua, .xml)
    if (
      trimmed.endsWith('.lua') ||
      trimmed.endsWith('.xml') ||
      trimmed.endsWith('.txt')
    ) {
      listedFiles.push(trimmed);
    }
  }

  return { fields, listedFiles };
}

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'analyze_addon_code',
    description:
      'Analyze an ESO addon directory for code quality issues: global pollution, unregistered events, deprecated patterns, dependencies, API calls, and performance concerns. REQUIREMENTS: Access to the addon directory (typically Documents/Elder Scrolls Online/live/AddOns/AddonName/ or a development directory). The path must point to a folder containing .lua files.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_path: {
          type: 'string',
          description: 'Path to the addon directory containing .lua files',
        },
      },
      required: ['addon_path'],
    },
  },
  {
    name: 'validate_addon_manifest',
    description:
      'Validate an ESO addon manifest (.txt file) for correct format, required fields, valid API version, and verify that listed files exist on disk. REQUIREMENTS: Access to the addon directory. If manifest_path is given, the file and its parent directory must be accessible. Alternatively, pass raw manifest_content directly.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        manifest_path: {
          type: 'string',
          description: 'Path to the addon manifest .txt file',
        },
        manifest_content: {
          type: 'string',
          description: 'Raw manifest file content to validate directly',
        },
      },
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'analyze_addon_code': {
      const params = AnalyzeAddonCodeSchema.parse(args);

      // Validate path to prevent directory traversal
      try {
        validateAddonPath(params.addon_path);
      } catch (e) {
        if (e instanceof PathValidationError) return errorResult(e.message);
        throw e;
      }

      if (!existsSync(params.addon_path)) {
        return errorResult(
          JSON.stringify(
            {
              error: 'Addon directory not found',
              path: params.addon_path,
            },
            null,
            2
          )
        );
      }

      const luaFiles = collectLuaFiles(params.addon_path);
      if (luaFiles.length === 0) {
        return errorResult(
          JSON.stringify(
            {
              error: 'No .lua files found in the addon directory',
              path: params.addon_path,
              help: 'Make sure the path points to a valid ESO addon directory.',
            },
            null,
            2
          )
        );
      }

      const allIssues: CodeIssue[] = [];
      const allWarnings: string[] = [];
      const allSuggestions: string[] = [];
      const allDeps = new Set<string>();
      const allApiCalls = new Set<string>();

      for (const filePath of luaFiles) {
        let content: string;
        try {
          content = readFileSync(filePath, 'utf-8');
        } catch {
          allWarnings.push(`Could not read file: ${filePath}`);
          continue;
        }

        // Relative name for cleaner output
        const relName = filePath.replace(params.addon_path, '').replace(/^[\\/]/, '');

        // Global pollution analysis
        const globalIssues = analyzeGlobalPollution(content, relName);
        allIssues.push(...globalIssues);

        // Event handler analysis
        const eventResult = analyzeEventHandlers(content, relName);
        allIssues.push(...eventResult.issues);
        allWarnings.push(...eventResult.warnings);

        // Performance analysis
        const perfResult = analyzePerformance(content, relName);
        allIssues.push(...perfResult.issues);
        allSuggestions.push(...perfResult.suggestions);

        // Dependency detection
        const deps = detectDependencies(content);
        for (const d of deps) allDeps.add(d);

        // API call detection
        const apiCalls = detectApiCalls(content);
        for (const c of apiCalls) allApiCalls.add(c);

        // Check for deprecated patterns
        if (content.includes('d(') && !content.includes('local d =')) {
          allWarnings.push(
            `${relName}: Uses d() debug output. Make sure to remove or gate debug calls behind a flag for release builds.`
          );
        }
        if (content.includes('GetAddOnInfo') && !content.includes('GetAddOnManager')) {
          allSuggestions.push(
            `${relName}: GetAddOnInfo() usage detected. In newer API versions, prefer GetAddOnManager():GetAddOnInfo().`
          );
        }
      }

      return jsonResult({
        files_analyzed: luaFiles.length,
        issues: allIssues,
        warnings: allWarnings,
        suggestions: allSuggestions,
        dependencies_used: [...allDeps],
        api_calls_found: [...allApiCalls],
      });
    }

    case 'validate_addon_manifest': {
      const params = ValidateAddonManifestSchema.parse(args);

      if (!params.manifest_path && !params.manifest_content) {
        return errorResult(
          'Please provide either manifest_path or manifest_content to validate.'
        );
      }

      let content: string;
      let manifestDir: string | null = null;

      if (params.manifest_path) {
        // Validate path to prevent path traversal
        try {
          validateManifestPath(params.manifest_path);
        } catch (e) {
          if (e instanceof PathValidationError) return errorResult(e.message);
          throw e;
        }
        if (!existsSync(params.manifest_path)) {
          return errorResult(
            JSON.stringify(
              {
                error: 'Manifest file not found',
                path: params.manifest_path,
              },
              null,
              2
            )
          );
        }
        try {
          content = readFileSync(params.manifest_path, 'utf-8');
          manifestDir = params.manifest_path.replace(/[\\/][^\\/]+$/, '');
        } catch (error) {
          return errorResult(
            JSON.stringify(
              {
                error: 'Failed to read manifest file',
                message: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            )
          );
        }
      } else {
        content = params.manifest_content!;
      }

      const { fields, listedFiles } = parseManifestContent(content);

      const errors: string[] = [];
      const warnings: string[] = [];
      const parsedFields: Record<string, string> = {};

      // Build parsed fields map
      for (const field of fields) {
        parsedFields[field.key] = field.value;
      }

      // Check required fields
      if (!parsedFields['Title']) {
        errors.push('Missing required field: ## Title');
      }

      if (!parsedFields['APIVersion']) {
        errors.push(
          'Missing required field: ## APIVersion. This must be set to the current ESO API version (e.g., 101049).'
        );
      } else {
        const apiVersion = parsedFields['APIVersion'].trim();
        const apiVersionNum = parseInt(apiVersion, 10);
        if (isNaN(apiVersionNum)) {
          errors.push(
            `Invalid APIVersion format: "${apiVersion}". Must be a numeric value like 101049.`
          );
        } else if (apiVersionNum < 100000 || apiVersionNum > 999999) {
          warnings.push(
            `APIVersion ${apiVersion} looks unusual. Expected a 6-digit number like 101049. Verify this matches the current live API version.`
          );
        }
      }

      // Validate DependsOn format
      if (parsedFields['DependsOn']) {
        const deps = parsedFields['DependsOn']
          .split(/\s+/)
          .filter((d) => d.length > 0);
        for (const dep of deps) {
          // Valid: AddonName or AddonName>=version
          if (!/^[\w.\-]+(?:>=[\d.]+)?$/.test(dep)) {
            errors.push(
              `Invalid DependsOn format: "${dep}". Expected format: "AddonName" or "AddonName>=minVersion".`
            );
          }
        }
      }

      // Validate OptionalDependsOn format
      if (parsedFields['OptionalDependsOn']) {
        const deps = parsedFields['OptionalDependsOn']
          .split(/\s+/)
          .filter((d) => d.length > 0);
        for (const dep of deps) {
          if (!/^[\w.\-]+(?:>=[\d.]+)?$/.test(dep)) {
            warnings.push(
              `Unusual OptionalDependsOn format: "${dep}". Expected format: "AddonName" or "AddonName>=minVersion".`
            );
          }
        }
      }

      // Check for common optional but recommended fields
      if (!parsedFields['Author']) {
        warnings.push('Missing optional field: ## Author. Recommended for addon identification.');
      }
      if (!parsedFields['Version']) {
        warnings.push(
          'Missing optional field: ## Version. Recommended for tracking addon updates.'
        );
      }
      if (!parsedFields['Description']) {
        warnings.push(
          'Missing optional field: ## Description. Recommended for ESOUI listing.'
        );
      }

      // Check listed files exist on disk (only if we have a manifest_path)
      const missingFiles: string[] = [];
      if (manifestDir) {
        for (const listedFile of listedFiles) {
          // Normalize path separators
          const normalizedFile = listedFile.replace(/\//g, '\\').replace(/\\\\/g, '\\');
          const fullFilePath = join(manifestDir, normalizedFile);
          if (!existsSync(fullFilePath)) {
            missingFiles.push(listedFile);
          }
        }
        if (missingFiles.length > 0) {
          errors.push(
            `Listed files not found on disk: ${missingFiles.join(', ')}. These files are referenced in the manifest but don't exist in the addon directory.`
          );
        }
      }

      // Check for no files listed at all
      if (listedFiles.length === 0) {
        warnings.push(
          'No .lua or .xml files listed in the manifest. The addon will not load any code.'
        );
      }

      const valid = errors.length === 0;

      return jsonResult({
        valid,
        errors,
        warnings,
        listed_files: listedFiles,
        missing_files: missingFiles,
        parsed_fields: parsedFields,
      });
    }

    default:
      return errorResult(`Unknown addon analysis tool: ${name}`);
  }
}

export const addonAnalysisModule: ToolModule = { definitions, handler };
