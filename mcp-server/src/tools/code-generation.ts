import { z } from 'zod';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';
import { db } from '../database/db.js';

// ===== SCHEMAS =====

const GenerateEventHandlerSchema = z.object({
  event_name: z.string().describe('The ESO event name (e.g., EVENT_PLAYER_ACTIVATED)'),
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid Lua identifier').describe('The addon name to use for event registration'),
  handler_name: z.string().optional().describe('Custom handler function name'),
  namespace: z.string().optional().describe('Namespace table to attach the handler to'),
  filter_param: z
    .object({
      unit_tag: z.string().optional().describe('Unit tag to filter events for (e.g., "player")'),
    })
    .optional()
    .describe('Event filter parameters'),
});

const GenerateSettingsPanelSchema = z.object({
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid Lua identifier (letters, numbers, underscores)').describe('The addon name'),
  panel_name: z.string().optional().describe('Display name for the settings panel'),
  settings: z
    .array(
      z.object({
        type: z
          .enum(['checkbox', 'slider', 'editbox', 'dropdown', 'colorpicker', 'header', 'description'])
          .describe('The type of settings control'),
        name: z.string().describe('Display name for the setting'),
        tooltip: z.string().optional().describe('Tooltip text shown on hover'),
        default_value: z.any().describe('Default value for the setting'),
        min: z.number().optional().describe('Minimum value (for slider)'),
        max: z.number().optional().describe('Maximum value (for slider)'),
        step: z.number().optional().describe('Step value (for slider)'),
        choices: z.array(z.string()).optional().describe('List of choices (for dropdown)'),
      })
    )
    .describe('Array of setting definitions'),
});

const GenerateSlashCommandSchema = z.object({
  command: z.string().describe('The slash command string (e.g., "/myaddon")'),
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid Lua identifier (letters, numbers, underscores)').describe('The addon name'),
  subcommands: z
    .array(
      z.object({
        name: z.string().describe('Subcommand name'),
        description: z.string().describe('Description of what this subcommand does'),
        handler_hint: z.string().describe('Hint for the handler code (function name or inline code)'),
      })
    )
    .optional()
    .describe('Optional subcommands for the slash command'),
});

const GenerateUiXmlSchema = z.object({
  element_type: z
    .enum(['toplevelcontrol', 'button', 'label', 'editbox', 'scrolllist', 'dialog', 'tooltip', 'backdrop'])
    .describe('Type of UI element to generate'),
  name: z.string().describe('Name for the XML control'),
  dimensions: z
    .object({
      width: z.number().describe('Width in pixels'),
      height: z.number().describe('Height in pixels'),
    })
    .optional()
    .describe('Control dimensions'),
  anchors: z
    .array(
      z.object({
        point: z.string().describe('Anchor point (e.g., CENTER, TOPLEFT)'),
        relativeTo: z.string().optional().describe('Relative control name'),
        relativePoint: z.string().optional().describe('Relative point on the other control'),
        offsetX: z.number().optional().describe('X offset in pixels'),
        offsetY: z.number().optional().describe('Y offset in pixels'),
      })
    )
    .optional()
    .describe('Anchor definitions for positioning'),
  handlers: z.array(z.string()).optional().describe('List of event handler names (e.g., OnMouseDown, OnClicked)'),
});

const GenerateSavedVariablesCodeSchema = z.object({
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid Lua identifier (letters, numbers, underscores)').describe('The addon name'),
  defaults: z.record(z.any()).describe('Default values for saved variables'),
  account_wide: z.boolean().optional().describe('Whether saved vars are account-wide (default: false)'),
  namespace: z.string().optional().describe('Namespace table for the addon'),
});

// ===== HELPERS =====

function eventNameToHandlerName(eventName: string): string {
  // Convert EVENT_PLAYER_ACTIVATED -> OnPlayerActivated
  const parts = eventName.replace(/^EVENT_/, '').split('_');
  const camelParts = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  return 'On' + camelParts.join('');
}

function luaValueToString(value: any, indent: number = 1): string {
  const pad = '    '.repeat(indent);
  const innerPad = '    '.repeat(indent + 1);

  if (value === null || value === undefined) {
    return 'nil';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '{}';
    const items = value.map((v) => `${innerPad}${luaValueToString(v, indent + 1)},`);
    return `{\n${items.join('\n')}\n${pad}}`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const items = entries.map(([k, v]) => {
      const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : `["${k}"]`;
      return `${innerPad}${key} = ${luaValueToString(v, indent + 1)},`;
    });
    return `{\n${items.join('\n')}\n${pad}}`;
  }
  return String(value);
}

function settingNameToKey(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toLowerCase());
}

function getEventParams(eventName: string): string | null {
  try {
    const event = db.getEventByName(eventName);
    if (event && event.parameters) {
      return event.parameters;
    }
  } catch {
    // DB not available or event not found
  }
  return null;
}

function parseEventParams(paramsJson: string | null): Array<{ name: string; type?: string }> {
  if (!paramsJson) return [];
  try {
    const parsed = JSON.parse(paramsJson);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid JSON
  }
  return [];
}

// ===== GENERATORS =====

function generateEventHandlerCode(params: {
  event_name: string;
  addon_name: string;
  handler_name?: string;
  namespace?: string;
  filter_param?: { unit_tag?: string };
}): string {
  const handlerName = params.handler_name || eventNameToHandlerName(params.event_name);
  const ns = params.namespace;

  // Try to look up event parameters from the database
  const eventParamsJson = getEventParams(params.event_name);
  const eventParams = parseEventParams(eventParamsJson);

  // Build parameter list for the handler function
  let paramList = 'eventCode';
  let paramComment = '';
  if (eventParams.length > 0) {
    const paramNames = eventParams.map((p) => p.name);
    paramList = 'eventCode, ' + paramNames.join(', ');
    const paramDescriptions = eventParams.map((p) => {
      const typeStr = p.type ? ` (${p.type})` : '';
      return `--   ${p.name}${typeStr}`;
    });
    paramComment = `\n-- Parameters:\n--   eventCode (number)\n${paramDescriptions.join('\n')}`;
  }

  const lines: string[] = [];

  lines.push(`-- Event handler for ${params.event_name}`);
  if (paramComment) {
    lines.push(paramComment);
  }

  if (ns) {
    lines.push(`function ${ns}.${handlerName}(${paramList})`);
    lines.push(`    -- Handle ${params.event_name}`);
    lines.push('end');
    lines.push('');
    lines.push(`EVENT_MANAGER:RegisterForEvent("${params.addon_name}", ${params.event_name}, ${ns}.${handlerName})`);
  } else {
    lines.push(`local function ${handlerName}(${paramList})`);
    lines.push(`    -- Handle ${params.event_name}`);
    lines.push('end');
    lines.push('');
    lines.push(`EVENT_MANAGER:RegisterForEvent("${params.addon_name}", ${params.event_name}, ${handlerName})`);
  }

  // Add filter if specified
  if (params.filter_param?.unit_tag) {
    lines.push(
      `EVENT_MANAGER:AddFilterForEvent("${params.addon_name}", ${params.event_name}, REGISTER_FILTER_UNIT_TAG, "${params.filter_param.unit_tag}")`
    );
  }

  return lines.join('\n');
}

function generateSettingsPanelCode(params: {
  addon_name: string;
  panel_name?: string;
  settings: Array<{
    type: string;
    name: string;
    tooltip?: string;
    default_value?: any;
    min?: number;
    max?: number;
    step?: number;
    choices?: string[];
  }>;
}): string {
  const panelName = params.panel_name || params.addon_name;
  const lines: string[] = [];

  lines.push(`-- ${params.addon_name} Settings Panel (LibAddonMenu-2.0)`);
  lines.push('');
  lines.push('local LAM = LibAddonMenu2');
  lines.push('');

  // Build defaults table from settings
  lines.push('local defaults = {');
  for (const setting of params.settings) {
    if (setting.type === 'header' || setting.type === 'description') continue;
    const key = settingNameToKey(setting.name);
    lines.push(`    ${key} = ${luaValueToString(setting.default_value)},`);
  }
  lines.push('}');
  lines.push('');

  // Panel data
  lines.push('local panelData = {');
  lines.push('    type = "panel",');
  lines.push(`    name = "${panelName}",`);
  lines.push(`    displayName = "|cFFFFFF${panelName}|r",`);
  lines.push(`    author = "",`);
  lines.push(`    version = "1.0.0",`);
  lines.push(`    registerForRefresh = true,`);
  lines.push(`    registerForDefaults = true,`);
  lines.push('}');
  lines.push('');

  // Options data
  lines.push('local optionsData = {');
  for (const setting of params.settings) {
    const key = settingNameToKey(setting.name);

    lines.push('    {');
    lines.push(`        type = "${setting.type}",`);

    switch (setting.type) {
      case 'header':
        lines.push(`        name = "${setting.name}",`);
        break;

      case 'description':
        lines.push(`        text = "${setting.name}",`);
        break;

      case 'checkbox':
        lines.push(`        name = "${setting.name}",`);
        if (setting.tooltip) {
          lines.push(`        tooltip = "${setting.tooltip}",`);
        }
        lines.push(`        getFunc = function() return ${params.addon_name}.savedVariables.${key} end,`);
        lines.push(`        setFunc = function(value) ${params.addon_name}.savedVariables.${key} = value end,`);
        lines.push(`        default = defaults.${key},`);
        break;

      case 'slider':
        lines.push(`        name = "${setting.name}",`);
        if (setting.tooltip) {
          lines.push(`        tooltip = "${setting.tooltip}",`);
        }
        lines.push(`        min = ${setting.min ?? 0},`);
        lines.push(`        max = ${setting.max ?? 100},`);
        lines.push(`        step = ${setting.step ?? 1},`);
        lines.push(`        getFunc = function() return ${params.addon_name}.savedVariables.${key} end,`);
        lines.push(`        setFunc = function(value) ${params.addon_name}.savedVariables.${key} = value end,`);
        lines.push(`        default = defaults.${key},`);
        break;

      case 'editbox':
        lines.push(`        name = "${setting.name}",`);
        if (setting.tooltip) {
          lines.push(`        tooltip = "${setting.tooltip}",`);
        }
        lines.push(`        getFunc = function() return ${params.addon_name}.savedVariables.${key} end,`);
        lines.push(`        setFunc = function(text) ${params.addon_name}.savedVariables.${key} = text end,`);
        lines.push(`        default = defaults.${key},`);
        break;

      case 'dropdown':
        lines.push(`        name = "${setting.name}",`);
        if (setting.tooltip) {
          lines.push(`        tooltip = "${setting.tooltip}",`);
        }
        if (setting.choices && setting.choices.length > 0) {
          const choiceStr = setting.choices.map((c) => `"${c}"`).join(', ');
          lines.push(`        choices = { ${choiceStr} },`);
        }
        lines.push(`        getFunc = function() return ${params.addon_name}.savedVariables.${key} end,`);
        lines.push(`        setFunc = function(value) ${params.addon_name}.savedVariables.${key} = value end,`);
        lines.push(`        default = defaults.${key},`);
        break;

      case 'colorpicker':
        lines.push(`        name = "${setting.name}",`);
        if (setting.tooltip) {
          lines.push(`        tooltip = "${setting.tooltip}",`);
        }
        lines.push(
          `        getFunc = function() return unpack(${params.addon_name}.savedVariables.${key}) end,`
        );
        lines.push(
          `        setFunc = function(r, g, b, a) ${params.addon_name}.savedVariables.${key} = {r, g, b, a} end,`
        );
        lines.push(`        default = unpack(defaults.${key}),`);
        break;
    }

    lines.push('    },');
  }
  lines.push('}');
  lines.push('');

  lines.push(`LAM:RegisterAddonPanel("${params.addon_name}Options", panelData)`);
  lines.push(`LAM:RegisterOptionControls("${params.addon_name}Options", optionsData)`);

  return lines.join('\n');
}

function generateSlashCommandCode(params: {
  command: string;
  addon_name: string;
  subcommands?: Array<{ name: string; description: string; handler_hint: string }>;
}): string {
  const cmd = params.command.startsWith('/') ? params.command : `/${params.command}`;
  const lines: string[] = [];

  lines.push(`-- Slash command registration for ${params.addon_name}`);
  lines.push('');

  if (params.subcommands && params.subcommands.length > 0) {
    lines.push(`SLASH_COMMANDS["${cmd}"] = function(args)`);
    lines.push('    local command, rest = zo_strsplit(" ", args)');
    lines.push('    command = (command or ""):lower()');
    lines.push('');

    for (let i = 0; i < params.subcommands.length; i++) {
      const sub = params.subcommands[i];
      const conditional = i === 0 ? 'if' : 'elseif';
      lines.push(`    ${conditional} command == "${sub.name}" then`);
      lines.push(`        -- ${sub.description}`);
      lines.push(`        ${sub.handler_hint}`);
    }

    lines.push('    elseif command == "help" or command == "" then');
    lines.push(`        d("[${params.addon_name}] Available commands:")`);
    for (const sub of params.subcommands) {
      lines.push(`        d("  ${cmd} ${sub.name} - ${sub.description}")`);
    }
    lines.push(`        d("  ${cmd} help - Show this help")`);
    lines.push('    else');
    lines.push(`        d("[${params.addon_name}] Unknown command: " .. command .. ". Use ${cmd} help.")`);
    lines.push('    end');
    lines.push('end');
  } else {
    lines.push(`SLASH_COMMANDS["${cmd}"] = function(args)`);
    lines.push(`    -- Handle ${cmd} command`);
    lines.push('    if not args or args == "" then');
    lines.push(`        d("[${params.addon_name}] Usage: ${cmd} <args>")`);
    lines.push('        return');
    lines.push('    end');
    lines.push('');
    lines.push(`    d("[${params.addon_name}] Command received: " .. args)`);
    lines.push('end');
  }

  return lines.join('\n');
}

function generateUiXmlCode(params: {
  element_type: string;
  name: string;
  dimensions?: { width: number; height: number };
  anchors?: Array<{
    point: string;
    relativeTo?: string;
    relativePoint?: string;
    offsetX?: number;
    offsetY?: number;
  }>;
  handlers?: string[];
}): string {
  const dim = params.dimensions || { width: 400, height: 300 };
  const anchors = params.anchors || [{ point: 'CENTER' }];

  function buildAnchorXml(anchor: {
    point: string;
    relativeTo?: string;
    relativePoint?: string;
    offsetX?: number;
    offsetY?: number;
  }): string {
    const attrs: string[] = [`point="${anchor.point}"`];
    if (anchor.relativeTo) attrs.push(`relativeTo="${anchor.relativeTo}"`);
    if (anchor.relativePoint) attrs.push(`relativePoint="${anchor.relativePoint}"`);
    if (anchor.offsetX !== undefined) attrs.push(`offsetX="${anchor.offsetX}"`);
    if (anchor.offsetY !== undefined) attrs.push(`offsetY="${anchor.offsetY}"`);
    return `<Anchor ${attrs.join(' ')} />`;
  }

  function buildHandlersXml(handlerList: string[], indent: string): string {
    return handlerList.map((h) => `${indent}<${h}>\n${indent}    -- Handle ${h}\n${indent}</${h}>`).join('\n');
  }

  const anchorLines = anchors.map((a) => '            ' + buildAnchorXml(a)).join('\n');

  switch (params.element_type) {
    case 'toplevelcontrol': {
      const handlersXml = params.handlers
        ? '\n\n' + buildHandlersXml(params.handlers, '            ')
        : '';
      return `<GuiXml>
    <Controls>
        <TopLevelControl name="${params.name}" hidden="true" movable="true" mouseEnabled="true" clampedToScreen="true">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}

            <Controls>
                <Backdrop name="$(parent)BG" inherits="ZO_DefaultBackdrop">
                    <AnchorFill />
                </Backdrop>

                <Label name="$(parent)Title" font="ZoFontWinH2" color="FFFFFF" horizontalAlignment="CENTER">
                    <Anchor point="TOP" offsetY="10" />
                    <Dimensions x="${dim.width - 20}" y="30" />
                </Label>

                <Button name="$(parent)CloseButton" inherits="ZO_CloseButton">
                    <Anchor point="TOPRIGHT" offsetX="-5" offsetY="5" />
                    <OnClicked>
                        ${params.name}:SetHidden(true)
                    </OnClicked>
                </Button>
            </Controls>${handlersXml}
        </TopLevelControl>
    </Controls>
</GuiXml>`;
    }

    case 'button': {
      const handlersXml = params.handlers
        ? '\n' + buildHandlersXml(params.handlers, '            ')
        : `\n            <OnClicked>\n                -- Handle button click\n            </OnClicked>`;
      return `<GuiXml>
    <Controls>
        <Button name="${params.name}" mouseEnabled="true">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}

            <Label name="$(parent)Label" font="ZoFontGameMedium" color="FFFFFF" horizontalAlignment="CENTER" verticalAlignment="CENTER" text="Button">
                <AnchorFill />
            </Label>
${handlersXml}
        </Button>
    </Controls>
</GuiXml>`;
    }

    case 'label': {
      return `<GuiXml>
    <Controls>
        <Label name="${params.name}" font="ZoFontGameMedium" color="FFFFFF" horizontalAlignment="LEFT" verticalAlignment="CENTER">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}
        </Label>
    </Controls>
</GuiXml>`;
    }

    case 'editbox': {
      return `<GuiXml>
    <Controls>
        <EditBox name="${params.name}" mouseEnabled="true" font="ZoFontGameMedium" editEnabled="true" maxInputChars="256">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}

            <Controls>
                <Backdrop name="$(parent)BG" inherits="ZO_EditBackdrop">
                    <AnchorFill />
                </Backdrop>
            </Controls>
        </EditBox>
    </Controls>
</GuiXml>`;
    }

    case 'scrolllist': {
      return `<GuiXml>
    <Controls>
        <Control name="${params.name}" mouseEnabled="true">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}

            <Controls>
                <Backdrop name="$(parent)BG" inherits="ZO_ThinBackdrop">
                    <AnchorFill />
                </Backdrop>

                <ScrollList name="$(parent)List" inherits="ZO_ScrollList">
                    <AnchorFill />
                </ScrollList>
            </Controls>
        </Control>
    </Controls>
</GuiXml>`;
    }

    case 'dialog': {
      return `<GuiXml>
    <Controls>
        <TopLevelControl name="${params.name}" hidden="true" mouseEnabled="true" clampedToScreen="true">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}

            <Controls>
                <Backdrop name="$(parent)BG" inherits="ZO_DefaultBackdrop">
                    <AnchorFill />
                </Backdrop>

                <Label name="$(parent)Title" font="ZoFontWinH2" color="FFFFFF" horizontalAlignment="CENTER">
                    <Anchor point="TOP" offsetY="15" />
                    <Dimensions x="${dim.width - 40}" y="30" />
                </Label>

                <Label name="$(parent)Body" font="ZoFontGameMedium" color="CCCCCC" horizontalAlignment="CENTER" wrapMode="TRUNCATE">
                    <Anchor point="TOP" relativeTo="$(parent)Title" relativePoint="BOTTOM" offsetY="10" />
                    <Dimensions x="${dim.width - 40}" y="${dim.height - 120}" />
                </Label>

                <Button name="$(parent)ConfirmButton" inherits="ZO_DefaultButton">
                    <Anchor point="BOTTOMRIGHT" relativeTo="$(parent)" relativePoint="BOTTOM" offsetX="-10" offsetY="-15" />
                    <Dimensions x="120" y="30" />
                    <OnClicked>
                        ${params.name}:SetHidden(true)
                    </OnClicked>
                </Button>

                <Button name="$(parent)CancelButton" inherits="ZO_DefaultButton">
                    <Anchor point="BOTTOMLEFT" relativeTo="$(parent)" relativePoint="BOTTOM" offsetX="10" offsetY="-15" />
                    <Dimensions x="120" y="30" />
                    <OnClicked>
                        ${params.name}:SetHidden(true)
                    </OnClicked>
                </Button>
            </Controls>
        </TopLevelControl>
    </Controls>
</GuiXml>`;
    }

    case 'tooltip': {
      return `<GuiXml>
    <Controls>
        <Tooltip name="${params.name}" inherits="ZO_ItemTooltip" hidden="true" mouseEnabled="false">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}
        </Tooltip>
    </Controls>
</GuiXml>`;
    }

    case 'backdrop': {
      return `<GuiXml>
    <Controls>
        <Backdrop name="${params.name}" inherits="ZO_DefaultBackdrop">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}
        </Backdrop>
    </Controls>
</GuiXml>`;
    }

    default:
      return `<GuiXml>
    <Controls>
        <Control name="${params.name}">
            <Dimensions x="${dim.width}" y="${dim.height}" />
${anchorLines}
        </Control>
    </Controls>
</GuiXml>`;
  }
}

function generateSavedVariablesCodeImpl(params: {
  addon_name: string;
  defaults: Record<string, any>;
  account_wide?: boolean;
  namespace?: string;
}): string {
  const ns = params.namespace || params.addon_name;
  const svName = `${params.addon_name}SavedVariables`;
  const lines: string[] = [];

  lines.push(`-- SavedVariables initialization for ${params.addon_name}`);
  lines.push('');
  lines.push(`${ns} = ${ns} or {}`);
  lines.push(`local addon = ${ns}`);
  lines.push('');
  lines.push('local ADDON_NAME = "' + params.addon_name + '"');
  lines.push('local ADDON_VERSION = 1');
  lines.push('');

  // Generate defaults table
  lines.push('local defaults = {');
  for (const [key, value] of Object.entries(params.defaults)) {
    lines.push(`    ${key} = ${luaValueToString(value)},`);
  }
  lines.push('}');
  lines.push('');

  // Generate initialization function
  lines.push('function addon:InitializeSavedVariables()');
  if (params.account_wide) {
    lines.push(
      `    self.savedVariables = ZO_SavedVars:NewAccountWide("${svName}", ADDON_VERSION, nil, defaults)`
    );
  } else {
    lines.push(
      `    self.savedVariables = ZO_SavedVars:NewCharacterIdSettings("${svName}", ADDON_VERSION, nil, defaults)`
    );
  }
  lines.push('end');
  lines.push('');

  // Generate helper to get a setting value
  lines.push('function addon:GetSetting(key)');
  lines.push('    if self.savedVariables then');
  lines.push('        return self.savedVariables[key]');
  lines.push('    end');
  lines.push('    return defaults[key]');
  lines.push('end');
  lines.push('');

  // Generate helper to set a setting value
  lines.push('function addon:SetSetting(key, value)');
  lines.push('    if self.savedVariables then');
  lines.push('        self.savedVariables[key] = value');
  lines.push('    end');
  lines.push('end');
  lines.push('');

  // Generate helper to reset to defaults
  lines.push('function addon:ResetToDefaults()');
  lines.push('    if self.savedVariables then');
  lines.push('        for key, value in pairs(defaults) do');
  lines.push('            self.savedVariables[key] = value');
  lines.push('        end');
  lines.push('    end');
  lines.push('end');
  lines.push('');

  // Remind user to call from EVENT_ADD_ON_LOADED
  lines.push('-- Call addon:InitializeSavedVariables() from your EVENT_ADD_ON_LOADED handler');
  lines.push(`-- Make sure "${svName}" is listed in your addon manifest's ## SavedVariables`);

  return lines.join('\n');
}

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'generate_event_handler',
    description:
      'Generate Lua code for registering and handling an ESO event, with proper parameter signatures looked up from the API database. Supports event filters like unit tags.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        event_name: { type: 'string', description: 'The ESO event name (e.g., EVENT_PLAYER_ACTIVATED)' },
        addon_name: { type: 'string', description: 'The addon name to use for event registration' },
        handler_name: { type: 'string', description: 'Custom handler function name' },
        namespace: { type: 'string', description: 'Namespace table to attach the handler to' },
        filter_param: {
          type: 'object',
          properties: {
            unit_tag: { type: 'string', description: 'Unit tag to filter for (e.g., "player")' },
          },
          description: 'Event filter parameters',
        },
      },
      required: ['event_name', 'addon_name'],
    },
  },
  {
    name: 'generate_settings_panel',
    description:
      'Generate a complete LibAddonMenu-2.0 settings panel with checkboxes, sliders, dropdowns, editboxes, colorpickers, headers, and descriptions. Returns the Lua code and required library dependencies. NOTE: The generated code requires LibAddonMenu-2.0 to be installed as a dependency in ESO. Add "LibAddonMenu-2.0>=41" to ## DependsOn in the addon manifest.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_name: { type: 'string', description: 'The addon name' },
        panel_name: { type: 'string', description: 'Display name for the settings panel' },
        settings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['checkbox', 'slider', 'editbox', 'dropdown', 'colorpicker', 'header', 'description'],
              },
              name: { type: 'string', description: 'Display name for the setting' },
              tooltip: { type: 'string', description: 'Tooltip text' },
              default_value: { description: 'Default value for the setting' },
              min: { type: 'number', description: 'Min value (slider)' },
              max: { type: 'number', description: 'Max value (slider)' },
              step: { type: 'number', description: 'Step value (slider)' },
              choices: { type: 'array', items: { type: 'string' }, description: 'Dropdown choices' },
            },
            required: ['type', 'name', 'default_value'],
          },
          description: 'Array of setting definitions',
        },
      },
      required: ['addon_name', 'settings'],
    },
  },
  {
    name: 'generate_slash_command',
    description:
      'Generate Lua code for registering a slash command with optional subcommand routing, help text, and argument parsing.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The slash command (e.g., "/myaddon")' },
        addon_name: { type: 'string', description: 'The addon name' },
        subcommands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Subcommand name' },
              description: { type: 'string', description: 'What this subcommand does' },
              handler_hint: { type: 'string', description: 'Handler code hint' },
            },
            required: ['name', 'description', 'handler_hint'],
          },
          description: 'Optional subcommands',
        },
      },
      required: ['command', 'addon_name'],
    },
  },
  {
    name: 'generate_ui_xml',
    description:
      'Generate valid ESO UI XML for various control types including TopLevelControl, Button, Label, EditBox, ScrollList, Dialog, Tooltip, and Backdrop with configurable dimensions, anchors, and handlers.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        element_type: {
          type: 'string',
          enum: ['toplevelcontrol', 'button', 'label', 'editbox', 'scrolllist', 'dialog', 'tooltip', 'backdrop'],
          description: 'Type of UI element',
        },
        name: { type: 'string', description: 'Name for the XML control' },
        dimensions: {
          type: 'object',
          properties: {
            width: { type: 'number', description: 'Width in pixels' },
            height: { type: 'number', description: 'Height in pixels' },
          },
          description: 'Control dimensions',
        },
        anchors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              point: { type: 'string', description: 'Anchor point (e.g., CENTER, TOPLEFT)' },
              relativeTo: { type: 'string', description: 'Relative control name' },
              relativePoint: { type: 'string', description: 'Relative point' },
              offsetX: { type: 'number', description: 'X offset' },
              offsetY: { type: 'number', description: 'Y offset' },
            },
            required: ['point'],
          },
          description: 'Anchor definitions',
        },
        handlers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Event handler names (e.g., OnMouseDown, OnClicked)',
        },
      },
      required: ['element_type', 'name'],
    },
  },
  {
    name: 'generate_savedvariables_code',
    description:
      'Generate complete SavedVariables initialization code with defaults, get/set helpers, and reset-to-defaults functionality. Supports both character-specific and account-wide storage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_name: { type: 'string', description: 'The addon name' },
        defaults: {
          type: 'object',
          description: 'Default values for saved variables as key-value pairs',
        },
        account_wide: {
          type: 'boolean',
          description: 'Whether saved vars are account-wide (default: false)',
        },
        namespace: { type: 'string', description: 'Namespace table for the addon' },
      },
      required: ['addon_name', 'defaults'],
    },
  },
];

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'generate_event_handler': {
      const params = GenerateEventHandlerSchema.parse(args);
      const code = generateEventHandlerCode({
        event_name: params.event_name,
        addon_name: params.addon_name,
        handler_name: params.handler_name,
        namespace: params.namespace,
        filter_param: params.filter_param,
      });

      // Check if the event was found in the DB
      let eventFound = false;
      let eventInfo: { category?: string; api_version?: string } | null = null;
      try {
        const event = db.getEventByName(params.event_name);
        if (event) {
          eventFound = true;
          eventInfo = { category: event.category ?? undefined, api_version: event.api_version ?? undefined };
        }
      } catch {
        // DB lookup failed silently
      }

      return jsonResult({
        code,
        event_found_in_db: eventFound,
        event_info: eventInfo,
        note: eventFound
          ? 'Event parameter signature was sourced from the API database.'
          : 'Event was not found in the API database. Parameter signature uses generic format. Verify the event name is correct.',
      });
    }

    case 'generate_settings_panel': {
      const params = GenerateSettingsPanelSchema.parse(args);
      const code = generateSettingsPanelCode({
        addon_name: params.addon_name,
        panel_name: params.panel_name,
        settings: params.settings,
      });

      return jsonResult({
        code,
        requires: ['LibAddonMenu-2.0'],
      });
    }

    case 'generate_slash_command': {
      const params = GenerateSlashCommandSchema.parse(args);
      const code = generateSlashCommandCode({
        command: params.command,
        addon_name: params.addon_name,
        subcommands: params.subcommands,
      });

      return jsonResult({ code });
    }

    case 'generate_ui_xml': {
      const params = GenerateUiXmlSchema.parse(args);
      const xml = generateUiXmlCode({
        element_type: params.element_type,
        name: params.name,
        dimensions: params.dimensions,
        anchors: params.anchors,
        handlers: params.handlers,
      });

      return jsonResult({ xml });
    }

    case 'generate_savedvariables_code': {
      const params = GenerateSavedVariablesCodeSchema.parse(args);
      const code = generateSavedVariablesCodeImpl({
        addon_name: params.addon_name,
        defaults: params.defaults,
        account_wide: params.account_wide,
        namespace: params.namespace,
      });

      return jsonResult({
        code,
        saved_variables_name: `${params.addon_name}SavedVariables`,
        storage_type: params.account_wide ? 'account-wide' : 'character-specific',
      });
    }

    default:
      return errorResult(`Unknown code generation tool: ${name}`);
  }
}

export const codeGenerationModule: ToolModule = { definitions, handler };
