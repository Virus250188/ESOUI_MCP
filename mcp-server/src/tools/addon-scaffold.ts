import { z } from 'zod';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';
import { validateAddonPath, PathValidationError } from '../services/path-validator.js';

// ===== SCHEMAS =====

const CreateAddonManifestSchema = z.object({
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid addon name (letters, numbers, underscores, no spaces)').describe('The addon folder/file name (PascalCase recommended)'),
  title: z.string().describe('Display title shown in the addon manager'),
  author: z.string().describe('Author name'),
  version: z.string().default('1.0.0').describe('Addon version string'),
  description: z.string().optional().describe('Short description of what the addon does'),
  dependencies: z.array(z.string()).optional().describe('List of required addon dependencies'),
  saved_variables: z.array(z.string()).optional().describe('List of SavedVariables names'),
  is_library: z.boolean().optional().describe('Whether this addon is a library'),
  api_version: z.string().default('101048').describe('ESO API version number'),
});

const CreateAddonBoilerplateSchema = z.object({
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid addon name (letters, numbers, underscores, no spaces)').describe('The addon folder/file name (PascalCase recommended)'),
  author: z.string().describe('Author name'),
  description: z.string().optional().describe('Short description of what the addon does'),
  features: z
    .array(z.enum(['settings_panel', 'slash_command', 'saved_variables', 'keybindings', 'xml_ui']))
    .describe('List of features to include in the boilerplate'),
});

const CreateAddonFileSchema = z.object({
  file_type: z.enum(['lua', 'xml', 'txt', 'bindings']).describe('Type of file to generate'),
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid addon name').describe('The addon name'),
  template: z
    .enum(['main', 'settings', 'ui_window', 'event_handler'])
    .optional()
    .describe('Template to use for file generation'),
  options: z.record(z.any()).optional().describe('Additional options for file generation'),
});

const PrepareAddonUploadSchema = z.object({
  addon_path: z.string().describe('Path to the addon directory to validate for ESOUI upload'),
});

// ===== GENERATORS =====

function generateManifestContent(params: {
  addon_name: string;
  title: string;
  author: string;
  version: string;
  description?: string;
  dependencies?: string[];
  saved_variables?: string[];
  is_library?: boolean;
  api_version: string;
  extra_files?: string[];
}): string {
  const lines: string[] = [];

  lines.push(`## Title: |cFFFFFF${params.title}|r`);
  lines.push(`## Author: ${params.author}`);
  lines.push(`## Version: ${params.version}`);
  lines.push(`## APIVersion: ${params.api_version}`);

  if (params.saved_variables && params.saved_variables.length > 0) {
    lines.push(`## SavedVariables: ${params.saved_variables.join(' ')}`);
  }

  if (params.dependencies && params.dependencies.length > 0) {
    lines.push(`## DependsOn: ${params.dependencies.join(' ')}`);
  }

  if (params.description) {
    lines.push(`## Description: ${params.description}`);
  }

  if (params.is_library) {
    lines.push(`## IsLibrary: true`);
  }

  lines.push(`## OptionalDependsOn: LibAddonMenu-2.0`);
  lines.push('');

  if (params.extra_files) {
    for (const file of params.extra_files) {
      lines.push(file);
    }
  }

  lines.push(`${params.addon_name}.lua`);

  return lines.join('\n');
}

function generateMainLua(params: {
  addon_name: string;
  author: string;
  description?: string;
  has_saved_variables: boolean;
  has_slash_command: boolean;
  has_settings_panel: boolean;
}): string {
  const lines: string[] = [];

  lines.push(`-- ${params.addon_name}`);
  if (params.description) {
    lines.push(`-- ${params.description}`);
  }
  lines.push(`-- Author: ${params.author}`);
  lines.push('');
  lines.push(`local ADDON_NAME = "${params.addon_name}"`);
  lines.push(`local ADDON_VERSION = 1`);
  lines.push('');
  lines.push(`${params.addon_name} = ${params.addon_name} or {}`);
  lines.push(`local addon = ${params.addon_name}`);
  lines.push('');

  if (params.has_saved_variables) {
    lines.push('-- Default saved variables');
    lines.push('local defaults = {');
    lines.push('    isEnabled = true,');
    lines.push('}');
    lines.push('');
  }

  // Initialization function
  lines.push('local function OnAddonLoaded(eventCode, addonName)');
  lines.push('    if addonName ~= ADDON_NAME then return end');
  lines.push('');
  lines.push('    -- Unregister the event since we only need it once');
  lines.push(`    EVENT_MANAGER:UnregisterForEvent(ADDON_NAME, EVENT_ADD_ON_LOADED)`);
  lines.push('');

  if (params.has_saved_variables) {
    lines.push(`    addon.savedVariables = ZO_SavedVars:NewAccountWide("${params.addon_name}SavedVariables", ADDON_VERSION, nil, defaults)`);
    lines.push('');
  }

  if (params.has_settings_panel) {
    lines.push('    -- Initialize settings panel');
    lines.push('    addon:InitializeSettings()');
    lines.push('');
  }

  if (params.has_slash_command) {
    lines.push(`    SLASH_COMMANDS["/${params.addon_name.toLowerCase()}"] = function(args)`);
    lines.push(`        addon:HandleSlashCommand(args)`);
    lines.push('    end');
    lines.push('');
  }

  lines.push(`    d("[${params.addon_name}] Loaded successfully.")`);
  lines.push('end');
  lines.push('');

  if (params.has_slash_command) {
    lines.push('function addon:HandleSlashCommand(args)');
    lines.push('    local command = args and args:lower() or ""');
    lines.push('');
    lines.push('    if command == "help" then');
    lines.push(`        d("[${params.addon_name}] Available commands:")`);
    lines.push(`        d("  /${params.addon_name.toLowerCase()} help - Show this help message")`);
    lines.push('    else');
    lines.push(`        d("[${params.addon_name}] Use /${params.addon_name.toLowerCase()} help for available commands.")`);
    lines.push('    end');
    lines.push('end');
    lines.push('');
  }

  if (params.has_settings_panel) {
    lines.push('function addon:InitializeSettings()');
    lines.push('    local LAM = LibAddonMenu2');
    lines.push('    if not LAM then return end');
    lines.push('');
    lines.push('    local panelData = {');
    lines.push('        type = "panel",');
    lines.push(`        name = "${params.addon_name}",`);
    lines.push(`        author = "${params.author}",`);
    lines.push(`        version = tostring(ADDON_VERSION),`);
    lines.push('    }');
    lines.push('');
    lines.push('    local optionsData = {');
    lines.push('        {');
    lines.push('            type = "checkbox",');
    lines.push('            name = "Enable Addon",');
    lines.push('            tooltip = "Enable or disable the addon",');
    lines.push('            getFunc = function() return addon.savedVariables.isEnabled end,');
    lines.push('            setFunc = function(value) addon.savedVariables.isEnabled = value end,');
    lines.push('            default = defaults.isEnabled,');
    lines.push('        },');
    lines.push('    }');
    lines.push('');
    lines.push(`    LAM:RegisterAddonPanel("${params.addon_name}Options", panelData)`);
    lines.push(`    LAM:RegisterOptionControls("${params.addon_name}Options", optionsData)`);
    lines.push('end');
    lines.push('');
  }

  lines.push(`EVENT_MANAGER:RegisterForEvent(ADDON_NAME, EVENT_ADD_ON_LOADED, OnAddonLoaded)`);

  return lines.join('\n');
}

function generateXmlUi(addonName: string): string {
  return `<GuiXml>
    <Controls>
        <TopLevelControl name="${addonName}Window" hidden="true" movable="true" mouseEnabled="true" clampedToScreen="true">
            <Dimensions x="400" y="300" />
            <Anchor point="CENTER" />

            <Controls>
                <Backdrop name="$(parent)BG" inherits="ZO_DefaultBackdrop">
                    <AnchorFill />
                </Backdrop>

                <Label name="$(parent)Title" font="ZoFontWinH2" color="FFFFFF" horizontalAlignment="CENTER">
                    <Anchor point="TOP" offsetY="10" />
                    <Dimensions x="380" y="30" />
                </Label>

                <Button name="$(parent)CloseButton" inherits="ZO_CloseButton">
                    <Anchor point="TOPRIGHT" offsetX="-5" offsetY="5" />
                    <OnClicked>
                        ${addonName}Window:SetHidden(true)
                    </OnClicked>
                </Button>
            </Controls>
        </TopLevelControl>
    </Controls>
</GuiXml>`;
}

function generateBindingsXml(addonName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>

<Bindings>
    <Layer name="SI_KEYBINDINGS_LAYER_GENERAL">
        <Category name="${addonName}">
            <Action name="${addonName.toUpperCase()}_TOGGLE">
                <Down>
                    ${addonName}:OnToggleKeybind()
                </Down>
            </Action>
        </Category>
    </Layer>
</Bindings>`;
}

function generateSettingsLua(addonName: string, author: string): string {
  return `-- ${addonName} Settings Panel
-- Uses LibAddonMenu-2.0

local addon = ${addonName}

function addon:InitializeSettings()
    local LAM = LibAddonMenu2
    if not LAM then
        d("[${addonName}] LibAddonMenu-2.0 is required for the settings panel.")
        return
    end

    local panelData = {
        type = "panel",
        name = "${addonName}",
        author = "${author}",
        version = tostring(ADDON_VERSION or 1),
    }

    local optionsData = {
        {
            type = "header",
            name = "General Settings",
        },
        {
            type = "checkbox",
            name = "Enable Addon",
            tooltip = "Enable or disable the addon functionality",
            getFunc = function() return addon.savedVariables.isEnabled end,
            setFunc = function(value) addon.savedVariables.isEnabled = value end,
            default = true,
        },
        {
            type = "description",
            text = "Configure the addon settings below.",
        },
    }

    LAM:RegisterAddonPanel("${addonName}Options", panelData)
    LAM:RegisterOptionControls("${addonName}Options", optionsData)
end`;
}

function generateSingleFile(params: {
  file_type: string;
  addon_name: string;
  template?: string;
  options?: Record<string, any>;
}): { filename: string; content: string } {
  const { file_type, addon_name, template, options } = params;

  switch (file_type) {
    case 'lua': {
      if (template === 'settings') {
        return {
          filename: `${addon_name}Settings.lua`,
          content: generateSettingsLua(addon_name, options?.author || 'Unknown'),
        };
      }
      if (template === 'event_handler') {
        const eventName = options?.event_name || 'EVENT_PLAYER_ACTIVATED';
        const handlerName = options?.handler_name || 'OnPlayerActivated';
        const content = `-- ${addon_name} Event Handler
local ADDON_NAME = "${addon_name}"

local function ${handlerName}(eventCode, ...)
    -- Handle ${eventName}
end

EVENT_MANAGER:RegisterForEvent(ADDON_NAME, ${eventName}, ${handlerName})`;
        return {
          filename: `${addon_name}.lua`,
          content,
        };
      }
      // Default 'main' template
      return {
        filename: `${addon_name}.lua`,
        content: generateMainLua({
          addon_name,
          author: options?.author || 'Unknown',
          description: options?.description,
          has_saved_variables: false,
          has_slash_command: false,
          has_settings_panel: false,
        }),
      };
    }

    case 'xml': {
      if (template === 'ui_window') {
        return {
          filename: `${addon_name}.xml`,
          content: generateXmlUi(addon_name),
        };
      }
      // Default XML
      return {
        filename: `${addon_name}.xml`,
        content: `<GuiXml>
    <Controls>
        <TopLevelControl name="${addon_name}Window" hidden="true" movable="true" mouseEnabled="true">
            <Dimensions x="400" y="300" />
            <Anchor point="CENTER" />
        </TopLevelControl>
    </Controls>
</GuiXml>`,
      };
    }

    case 'txt': {
      return {
        filename: `${addon_name}.txt`,
        content: generateManifestContent({
          addon_name,
          title: options?.title || addon_name,
          author: options?.author || 'Unknown',
          version: options?.version || '1.0.0',
          description: options?.description,
          dependencies: options?.dependencies,
          saved_variables: options?.saved_variables,
          is_library: options?.is_library,
          api_version: options?.api_version || '101048',
        }),
      };
    }

    case 'bindings': {
      return {
        filename: 'Bindings.xml',
        content: generateBindingsXml(addon_name),
      };
    }

    default:
      return {
        filename: `${addon_name}.${file_type}`,
        content: `-- ${addon_name} (${file_type})`,
      };
  }
}

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'create_addon_manifest',
    description:
      'Generate a valid ESO addon .txt manifest file with proper formatting. Includes title, author, version, API version, dependencies, saved variables, and file listings.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_name: { type: 'string', description: 'The addon folder/file name (no spaces, PascalCase recommended)' },
        title: { type: 'string', description: 'Display title shown in the addon manager' },
        author: { type: 'string', description: 'Author name' },
        version: { type: 'string', default: '1.0.0', description: 'Addon version string' },
        description: { type: 'string', description: 'Short description of what the addon does' },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of required addon dependencies',
        },
        saved_variables: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of SavedVariables names',
        },
        is_library: { type: 'boolean', description: 'Whether this addon is a library' },
        api_version: { type: 'string', default: '101048', description: 'ESO API version number' },
      },
      required: ['addon_name', 'title', 'author'],
    },
  },
  {
    name: 'create_addon_boilerplate',
    description:
      'Generate a complete ESO addon file set with manifest, Lua code, and optional features like settings panels (LibAddonMenu-2.0), slash commands, SavedVariables, keybindings, and XML UI.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_name: { type: 'string', description: 'The addon folder/file name (no spaces, PascalCase recommended)' },
        author: { type: 'string', description: 'Author name' },
        description: { type: 'string', description: 'Short description of what the addon does' },
        features: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['settings_panel', 'slash_command', 'saved_variables', 'keybindings', 'xml_ui'],
          },
          description: 'List of features to include in the boilerplate',
        },
      },
      required: ['addon_name', 'author', 'features'],
    },
  },
  {
    name: 'create_addon_file',
    description:
      'Generate a single ESO addon file (Lua, XML, manifest .txt, or Bindings.xml) using optional templates like main, settings, ui_window, or event_handler.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_type: {
          type: 'string',
          enum: ['lua', 'xml', 'txt', 'bindings'],
          description: 'Type of file to generate',
        },
        addon_name: { type: 'string', description: 'The addon name' },
        template: {
          type: 'string',
          enum: ['main', 'settings', 'ui_window', 'event_handler'],
          description: 'Template to use for file generation',
        },
        options: {
          type: 'object',
          description: 'Additional options for file generation (e.g., author, description, event_name, handler_name)',
        },
      },
      required: ['file_type', 'addon_name'],
    },
  },
  {
    name: 'prepare_addon_upload',
    description:
      'Validate an ESO addon directory for ESOUI upload readiness. Checks 12 rules: manifest format, API version (max 2), dependency version checks (>=), file references, hidden files (.git/.vs/desktop.ini), global variable pollution, SavedVariables server separation, and ZIP packaging rules. Based on official ESOUI upload guidelines. REQUIREMENTS: Access to the addon directory on disk. Common issues caught: PowerShell ZIP backslashes, missing dependency versions, EU/NA settings overwrite.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_path: {
          type: 'string',
          description: 'Path to the addon directory to validate (e.g., C:\\Users\\...\\AddOns\\MyAddon)',
        },
      },
      required: ['addon_path'],
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'create_addon_manifest': {
      const params = CreateAddonManifestSchema.parse(args);
      const content = generateManifestContent({
        addon_name: params.addon_name,
        title: params.title,
        author: params.author,
        version: params.version,
        description: params.description,
        dependencies: params.dependencies,
        saved_variables: params.saved_variables,
        is_library: params.is_library,
        api_version: params.api_version,
      });

      return jsonResult({
        filename: `${params.addon_name}.txt`,
        content,
      });
    }

    case 'create_addon_boilerplate': {
      const params = CreateAddonBoilerplateSchema.parse(args);
      const files: Array<{ path: string; content: string }> = [];

      const hasSettings = params.features.includes('settings_panel');
      const hasSlash = params.features.includes('slash_command');
      const hasSavedVars = params.features.includes('saved_variables');
      const hasKeybindings = params.features.includes('keybindings');
      const hasXmlUi = params.features.includes('xml_ui');

      // Build dependencies list
      const dependencies: string[] = [];
      if (hasSettings) {
        dependencies.push('LibAddonMenu-2.0');
      }

      // Build saved variables list
      const savedVariables: string[] = [];
      if (hasSavedVars || hasSettings) {
        savedVariables.push(`${params.addon_name}SavedVariables`);
      }

      // Collect extra files for manifest
      const extraFiles: string[] = [];
      if (hasXmlUi) {
        extraFiles.push(`${params.addon_name}.xml`);
      }
      if (hasKeybindings) {
        extraFiles.push('Bindings.xml');
      }

      // 1. Generate manifest
      const manifestContent = generateManifestContent({
        addon_name: params.addon_name,
        title: params.addon_name,
        author: params.author,
        version: '1.0.0',
        description: params.description,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
        saved_variables: savedVariables.length > 0 ? savedVariables : undefined,
        api_version: '101048',
        extra_files: extraFiles,
      });
      files.push({ path: `${params.addon_name}/${params.addon_name}.txt`, content: manifestContent });

      // 2. Generate main Lua file
      const mainLua = generateMainLua({
        addon_name: params.addon_name,
        author: params.author,
        description: params.description,
        has_saved_variables: hasSavedVars || hasSettings,
        has_slash_command: hasSlash,
        has_settings_panel: hasSettings,
      });
      files.push({ path: `${params.addon_name}/${params.addon_name}.lua`, content: mainLua });

      // 3. Optional: XML UI file
      if (hasXmlUi) {
        const xmlContent = generateXmlUi(params.addon_name);
        files.push({ path: `${params.addon_name}/${params.addon_name}.xml`, content: xmlContent });
      }

      // 4. Optional: Bindings.xml
      if (hasKeybindings) {
        const bindingsContent = generateBindingsXml(params.addon_name);
        files.push({ path: `${params.addon_name}/Bindings.xml`, content: bindingsContent });
      }

      return jsonResult({ files });
    }

    case 'create_addon_file': {
      const params = CreateAddonFileSchema.parse(args);
      const result = generateSingleFile({
        file_type: params.file_type,
        addon_name: params.addon_name,
        template: params.template,
        options: params.options,
      });

      return jsonResult({
        filename: result.filename,
        content: result.content,
      });
    }

    case 'prepare_addon_upload': {
      const params = PrepareAddonUploadSchema.parse(args);

      try {
        validateAddonPath(params.addon_path);
      } catch (e) {
        if (e instanceof PathValidationError) return errorResult(e.message);
        throw e;
      }

      if (!existsSync(params.addon_path)) {
        return errorResult(`Addon directory not found: ${params.addon_path}`);
      }

      const addonFolder = basename(params.addon_path);
      const errors: string[] = [];
      const warnings: string[] = [];
      const fixes: string[] = [];

      // === RULE 1: Manifest file must match folder name ===
      const manifestPath = join(params.addon_path, `${addonFolder}.txt`);
      const addonManifestPath = join(params.addon_path, `${addonFolder}.addon`);
      let manifestContent = '';
      let manifestName = '';

      if (existsSync(manifestPath)) {
        manifestContent = readFileSync(manifestPath, 'utf-8');
        manifestName = `${addonFolder}.txt`;
      } else if (existsSync(addonManifestPath)) {
        manifestContent = readFileSync(addonManifestPath, 'utf-8');
        manifestName = `${addonFolder}.addon`;
      } else {
        errors.push(`CRITICAL: No manifest file found! Expected "${addonFolder}.txt" in the addon folder. The manifest filename MUST match the folder name exactly.`);
      }

      if (manifestContent) {
        // === RULE 2: APIVersion check (max 2 versions) ===
        const apiMatch = manifestContent.match(/^##\s*APIVersion:\s*(.+)/m);
        if (!apiMatch) {
          errors.push('Missing ## APIVersion in manifest. Required for addon to load.');
        } else {
          const versions = apiMatch[1].trim().split(/\s+/);
          if (versions.length > 2) {
            errors.push(`Too many API versions (${versions.length}). ESOUI allows maximum 2 API versions.`);
          }
          for (const v of versions) {
            const num = parseInt(v, 10);
            if (isNaN(num) || num < 100000) {
              errors.push(`Invalid APIVersion: "${v}". Must be a 6-digit number like 101048.`);
            }
          }
        }

        // === RULE 3: Title required ===
        if (!manifestContent.match(/^##\s*Title:/m)) {
          errors.push('Missing ## Title in manifest. Required for ESOUI upload.');
        }

        // === RULE 4: DependsOn version checks ===
        const dependsMatch = manifestContent.match(/^##\s*DependsOn:\s*(.+)/m);
        if (dependsMatch) {
          const deps = dependsMatch[1].trim().split(/\s+/);
          for (const dep of deps) {
            if (dep && !dep.includes('>=')) {
              warnings.push(`Dependency "${dep}" has no version check. Best practice: "${dep}>=<minVersion>" (e.g., "LibAddonMenu-2.0>=41").`);
              fixes.push(`Change "${dep}" to "${dep}>=1" (or the actual minimum version) in ## DependsOn.`);
            }
          }
        }

        // === RULE 5: Listed files exist ===
        const lines = manifestContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('##') || trimmed.startsWith(';') || trimmed.startsWith('--')) continue;
          if (trimmed.endsWith('.lua') || trimmed.endsWith('.xml')) {
            const filePath = join(params.addon_path, trimmed);
            if (!existsSync(filePath)) {
              errors.push(`Listed file not found: "${trimmed}". Remove from manifest or add the file.`);
            }
          }
        }

        // === RULE 6: SavedVariables server separation ===
        const svMatch = manifestContent.match(/^##\s*SavedVariables:\s*(.+)/m);
        if (svMatch) {
          // Check Lua files for ZO_SavedVars usage without GetWorldName
          const luaFiles = getAllFiles(params.addon_path, '.lua');
          let hasSavedVars = false;
          let hasServerSeparation = false;
          for (const f of luaFiles) {
            const content = readFileSync(f, 'utf-8');
            if (content.includes('ZO_SavedVars')) hasSavedVars = true;
            if (content.includes('GetWorldName') || content.includes('GetDisplayName')) hasServerSeparation = true;
          }
          if (hasSavedVars && !hasServerSeparation) {
            warnings.push('SavedVariables may not be separated by server. Use GetWorldName() in your ZO_SavedVars call to prevent EU/NA/PTS settings from overwriting each other.');
            fixes.push('Add GetWorldName() as the "namespace" parameter in ZO_SavedVars:New* calls.');
          }
        }

        // === RULE 7: Author field ===
        if (!manifestContent.match(/^##\s*Author:/m)) {
          warnings.push('Missing ## Author in manifest. Recommended for ESOUI upload.');
        }

        // === RULE 8: Version field ===
        if (!manifestContent.match(/^##\s*Version:/m)) {
          warnings.push('Missing ## Version in manifest. Recommended for ESOUI upload.');
        }

        // === RULE 9: Description ===
        if (!manifestContent.match(/^##\s*Description:/m)) {
          warnings.push('Missing ## Description in manifest. ESOUI recommends a description.');
        }
      }

      // === RULE 10: Hidden/unwanted files in addon directory ===
      const allFiles = getAllFilesRecursive(params.addon_path);
      const unwantedFiles: string[] = [];
      const unwantedPatterns = [
        '.git', '.vs', '.vscode', '.idea', '__MACOSX',
        'desktop.ini', 'Thumbs.db', '.DS_Store',
        'node_modules', '.gitignore', '.gitattributes',
        '~$',
      ];

      for (const f of allFiles) {
        const rel = f.substring(params.addon_path.length + 1);
        for (const pattern of unwantedPatterns) {
          if (rel.includes(pattern)) {
            unwantedFiles.push(rel);
            break;
          }
        }
      }

      if (unwantedFiles.length > 0) {
        errors.push(`Remove these files/folders before uploading (ESOUI rule): ${unwantedFiles.join(', ')}`);
        fixes.push('Delete hidden files (.git, .vs, .idea, desktop.ini, __MACOSX, etc.) from the addon folder before creating the ZIP.');
      }

      // === RULE 11: Global variable pollution check ===
      const luaFiles = getAllFiles(params.addon_path, '.lua');
      const globalVars: string[] = [];
      for (const f of luaFiles) {
        const content = readFileSync(f, 'utf-8');
        const fileLines = content.split('\n');
        for (const line of fileLines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('--') || trimmed.startsWith('local ') || !trimmed) continue;
          // Check for global assignments (lowercase start = likely accidental global)
          const globalMatch = trimmed.match(/^([a-z]\w*)\s*=/);
          if (globalMatch && !['if', 'else', 'elseif', 'end', 'for', 'while', 'repeat', 'return', 'function', 'do', 'then'].includes(globalMatch[1])) {
            if (!globalVars.includes(globalMatch[1])) globalVars.push(globalMatch[1]);
          }
        }
      }
      if (globalVars.length > 0) {
        warnings.push(`Potential global variable pollution: ${globalVars.slice(0, 10).join(', ')}${globalVars.length > 10 ? '...' : ''}. Use "local" or a namespace table.`);
        fixes.push('Prefix variables with "local" or store them in a single global addon table (e.g., MyAddon.myVar instead of myVar).');
      }

      // === RULE 12: ZIP structure guidance ===
      const zipInstructions = [
        `The ZIP must contain a folder "${addonFolder}/" at the root level.`,
        `Inside: ${manifestName || addonFolder + '.txt'} + all .lua/.xml files.`,
        'DO NOT use PowerShell Compress-Archive (creates backslashes that break Minion).',
        'Use 7-Zip, WinRAR, or the built-in Windows "Send to > Compressed folder" instead.',
        'ZIP path separators MUST be forward slashes (/) per ZIP spec.',
        'All directory entries must be explicitly included in the ZIP.',
      ];

      // === Summary ===
      const isReady = errors.length === 0;

      return jsonResult({
        addon_name: addonFolder,
        manifest_file: manifestName || 'NOT FOUND',
        ready_for_upload: isReady,
        errors,
        warnings,
        fixes,
        zip_packaging_rules: zipInstructions,
        esoui_checklist: [
          errors.length === 0 ? 'PASS: No critical errors' : `FAIL: ${errors.length} error(s) must be fixed`,
          warnings.length === 0 ? 'PASS: No warnings' : `INFO: ${warnings.length} warning(s) to review`,
          'Remember: Write a clear English description for ESOUI',
          'Remember: Credit original authors if you adapted code from other addons',
          'Remember: Use the Changelog tab for update notes, not the description',
        ],
        files_found: allFiles.length,
        lua_files: luaFiles.length,
      });
    }

    default:
      return errorResult(`Unknown addon scaffold tool: ${name}`);
  }
}

// Helper: get all files with a specific extension in a directory (non-recursive)
function getAllFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .map(f => join(dir, f));
}

// Helper: get all files recursively (with depth limit)
function getAllFilesRecursive(dir: string, depth: number = 0, maxDepth: number = 5): string[] {
  if (depth > maxDepth || !existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...getAllFilesRecursive(fullPath, depth + 1, maxDepth));
      } else {
        results.push(fullPath);
      }
    } catch { /* skip inaccessible files */ }
  }
  return results;
}

export const addonScaffoldModule: ToolModule = { definitions, handler };
