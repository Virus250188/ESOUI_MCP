import { z } from 'zod';
import type { ToolModule, ToolResult } from '../types/tool-types.js';
import { jsonResult, errorResult } from '../types/tool-types.js';

// ===== SCHEMAS =====

const GetAddonRulesSchema = z.object({
  topic: z.enum([
    'restrictions',
    'best_practices',
    'performance',
    'localization',
    'hooking',
    'savedvariables',
    'events',
    'libraries',
    'upload',
    'capabilities',
    'lua_version',
    'console_addons',
    'dev_tools',
    'community',
    'all',
  ]).optional().default('all').describe('Specific topic to get rules for, or "all" for complete guidelines'),
});

const GenerateLocalizationSchema = z.object({
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Addon name must be a valid Lua identifier').describe('Your addon name'),
  strings: z.array(z.object({
    key: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'String key must be uppercase with underscores (e.g., SI_MY_ADDON_TITLE)').describe('String constant key (e.g., SI_MY_ADDON_TITLE)'),
    en: z.string().describe('English text'),
    de: z.string().optional().describe('German translation'),
    fr: z.string().optional().describe('French translation'),
  })).describe('Strings to localize'),
  method: z.enum(['safe_add_string', 'localization_file']).optional().default('safe_add_string')
    .describe('Localization method: safe_add_string (inline) or localization_file (separate files)'),
});

const GenerateHookCodeSchema = z.object({
  hook_type: z.enum(['pre_hook', 'post_hook', 'secure_post_hook', 'override']).describe('Type of hook to generate'),
  target_object: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]*$/, 'Must be a valid Lua identifier').optional().describe('Object/table to hook (e.g., "ZO_InventorySlot", "SCENE_MANAGER")'),
  target_function: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid Lua identifier').describe('Function name to hook (e.g., "UpdateSlot", "Show")'),
  addon_name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Addon name must be a valid Lua identifier').describe('Your addon name'),
  description: z.string().optional().describe('What the hook should do'),
});

// ===== TOOL DEFINITIONS =====

const definitions = [
  {
    name: 'get_addon_rules',
    description:
      'Get official ESO addon development rules, restrictions, and best practices from ESOUI guidelines. Topics: restrictions (what addons MUST NOT do), best_practices, performance, localization, hooking, savedvariables, events, libraries, upload, capabilities (what addons CAN do), lua_version (Lua 5.1 specifics), console_addons, dev_tools, community. Essential reference for addon development compliance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          enum: ['restrictions', 'best_practices', 'performance', 'localization', 'hooking', 'savedvariables', 'events', 'libraries', 'upload', 'capabilities', 'lua_version', 'console_addons', 'dev_tools', 'community', 'all'],
          description: 'Specific topic or "all" for complete guidelines',
        },
      },
    },
  },
  {
    name: 'generate_localization',
    description:
      'Generate ESO addon localization code using SafeAddString or separate localization files. Supports multiple languages (en, de, fr). Follows ESOUI best practice of reusing existing game strings via GetString(SI_...) where possible.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        addon_name: { type: 'string', description: 'Your addon name' },
        strings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'String constant key (e.g., MY_ADDON_TITLE)' },
              en: { type: 'string', description: 'English text' },
              de: { type: 'string', description: 'German translation' },
              fr: { type: 'string', description: 'French translation' },
            },
            required: ['key', 'en'],
          },
          description: 'Strings to localize',
        },
        method: {
          type: 'string',
          enum: ['safe_add_string', 'localization_file'],
          description: 'Localization method',
        },
      },
      required: ['addon_name', 'strings'],
    },
  },
  {
    name: 'generate_hook_code',
    description:
      'Generate ESO addon hook code (ZO_PreHook, SecurePostHook, or function override). Follows ESOUI best practice: hook the class function, not the instance, and as far up the inheritance chain as possible. Includes safety checks and proper unhooking patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hook_type: {
          type: 'string',
          enum: ['pre_hook', 'post_hook', 'secure_post_hook', 'override'],
          description: 'Type of hook',
        },
        target_object: { type: 'string', description: 'Object/table to hook (e.g., "ZO_InventorySlot")' },
        target_function: { type: 'string', description: 'Function name to hook' },
        addon_name: { type: 'string', description: 'Your addon name' },
        description: { type: 'string', description: 'What the hook should do' },
      },
      required: ['hook_type', 'target_function', 'addon_name'],
    },
  },
];

// ===== RULES DATA =====

const RULES: Record<string, { title: string; rules: string[] }> = {
  restrictions: {
    title: 'What ESO Addons MUST NOT Do (Official ESOUI Rules)',
    rules: [
      'MUST NOT automate gameplay actions (auto-combat, auto-loot, auto-dodge)',
      'MUST NOT provide advantages in PvP that non-addon users do not have',
      'MUST NOT interact with the game memory or client files directly',
      'MUST NOT call Protected functions from addon code (these are blocked by the game)',
      'MUST NOT use /script to execute commands that bypass addon restrictions',
      'MUST NOT collect or transmit user data without clear disclosure',
      'MUST NOT include executable files (.exe, .dmg) without source code and VirusTotal verification',
      'MUST NOT create libraries solely for one addon - libraries must be reusable across multiple addons',
      'MUST NOT name libraries "Lib<YourAddon>" or "Lib<YourDeveloperName>" - name them by functionality',
      'MUST NOT pollute the global _G table with common variable names (use local or a namespace table)',
      'MUST NOT use profanity or abbreviated swear words in addon names',
      'Manifest (.txt) filename MUST match the addon folder name exactly',
      'MUST check addonName parameter in EVENT_ADD_ON_LOADED callback before initializing',
      'MUST list maximum 2 API versions in ## APIVersion',
      'Cannot detect non-grouped players or read enemy/NPC positions',
      'Cannot alter textures/effects on characters, skills, weapons, armor, procs, pets, mounts, NPCs',
      'Cannot modify sounds of skills/weapons/armor/music (only UI sounds allowed)',
      'Cannot play custom sounds/videos/animations or include 3D objects',
      'Cannot include files beyond .lua, .xml, or .dds format',
      'Cannot load files outside live/AddOns or deeper than 3 subfolders',
      'Cannot change enemy frames or AOE ground rings',
      'Cannot draw 3D markers inside dungeons (only overland zones)',
      'Cannot change camera position beyond settings menu options',
      'Cannot hide pets/players/mounts/NPCs',
      'Cannot auto-move, jump, crouch, swim, block, or fight',
      'Cannot auto-cast skills or auto-use quickslot items (potions)',
      'Cannot auto-start interactions (companions, banks, scrying, scribing)',
      'Cannot send visible chat messages (only populate message box for user to send)',
      'Cannot exchange data with PC files or websites in real-time (SavedVars only on reload/zone change)',
      'LibGroupSocket/LibDataShare are FORBIDDEN as of 2024 - no cross-player data sharing',
      'Crown Store, scrying UI, Tribute game are completely off-limits',
    ],
  },
  best_practices: {
    title: 'ESO Addon Best Practices (From ESOUI Community)',
    rules: [
      'Define ONE global table for your addon: MyAddon = {}. Put all functions and data in it.',
      'In multi-file addons, start each file with: MyAddon = MyAddon or {}',
      'Always use "local" for variables unless intentionally global',
      'Unregister EVENT_ADD_ON_LOADED after your addon initializes',
      'Always disable other addons before testing yours to avoid interference',
      'Use /reloadui to test changes (or ReloadUI("ingame") in code)',
      'Manipulating manifest files while logged in may not work - logout and re-login after changes',
      'Delete shader_cache.cooked in live/ folder if custom .dds textures do not display',
      'Chat output (d()) does NOT work before EVENT_PLAYER_ACTIVATED - use LibDebugLogger instead',
      'When hooking classes, hook the CLASS function, not the instance - hook as far up the inheritance chain as possible',
      'Using : notation with simple tables {} is misleading - only use it with proper metatables/classes',
      'Credit original authors if you adapted code from other addons',
      'Use the Changelog tab for update notes on ESOUI, not the description field',
      'Lua code is compiled top-to-bottom: local variables must be defined before use in their scope',
      'Use GetString(SI_...) for existing game strings to avoid retranslation and stay consistent',
    ],
  },
  performance: {
    title: 'ESO Addon Performance Guidelines',
    rules: [
      'ESO uses Lua 5.1 - check lua.org/gems/sample.pdf for optimization benchmarks',
      'Use local references for frequently accessed globals: local GetGameTimeMilliseconds = GetGameTimeMilliseconds',
      'Avoid string concatenation in loops - use table.concat instead',
      'Throttle OnUpdate handlers - do not run expensive code every frame',
      'Use zo_callLater or zo_callHandlerAfterDelay for delayed execution instead of polling',
      'Clean up zo_callLater references to avoid memory leaks',
      'For console addons: create controls dynamically and use control pools (memory constraints)',
      'Avoid excessive GetControl() calls - cache control references locally',
      'Do not use pairs() on large tables in performance-critical code - use ipairs() or # operator',
      'Use EVENT_MANAGER:AddFilterForEvent to reduce event handler calls instead of filtering in code',
      'local access is ~30% faster than global - cache frequently used functions as locals',
      'Use zo_strformat/ZO_CachedStrFormat instead of string.format for localized strings',
      'ipairs() is fastest for sequential arrays, pairs() for hash tables',
    ],
  },
  localization: {
    title: 'ESO Addon Localization Guidelines',
    rules: [
      'Reuse existing game strings with GetString(SI_CONSTANTNAME) whenever possible',
      'Game string constants: github.com/esoui/esoui/blob/master/esoui/ingamelocalization/localizegeneratedstrings.lua',
      'For custom strings, use SafeAddString(SI_MY_ADDON_STRING, "text", version) method',
      'Alternatively, create separate localization files (en.lua, de.lua, fr.lua) loaded via manifest',
      'English descriptions are preferred for ESOUI uploads (translators acceptable)',
      'String IDs should be prefixed with your addon name: SI_MYADDON_SETTINGNAME',
      'Always provide English as fallback language',
      'Use ZO_CachedStrFormat for formatted strings to improve performance',
    ],
  },
  hooking: {
    title: 'ESO Addon Hooking Best Practices',
    rules: [
      'ZO_PreHook(object, "FunctionName", function) - runs BEFORE the original function. Return true to prevent original from running.',
      'SecurePostHook(object, "FunctionName", function) - runs AFTER the original function. Cannot prevent original.',
      'ALWAYS hook the CLASS function, not the object/instance function',
      'Hook as far up the inheritance chain as possible to maintain compatibility with other addons',
      'Hooking object instances breaks the metatable lookup chain and prevents later addon hooks from working',
      'ZOS uses metatables and : notation with self - understand this before hooking',
      'Pattern: ZO_Object:Subclass() for class creation, Initialize() for setup',
      'Shared base classes (e.g., ZO_LootHistory_Shared) provide common functions to Keyboard and Gamepad variants',
      'When in doubt, use SecurePostHook - it is safer than ZO_PreHook since it does not affect the original function execution',
    ],
  },
  savedvariables: {
    title: 'ESO SavedVariables Rules',
    rules: [
      'SavedVariables are ONLY written during UI reload or loading screens, NOT immediately',
      'Data persists in memory during the session - file changes while logged in are ignored and overwritten',
      'Use ZO_SavedVars wrapper: ZO_SavedVars:NewAccountWide(), ZO_SavedVars:New(), ZO_SavedVars:NewCharacterIdSettings()',
      'NewCharacterIdSettings is preferred over NewCharacterNameSettings (survives renames)',
      'For multi-server support, use GetWorldName() as namespace parameter to separate EU/NA/PTS data',
      'Declare SavedVariables in manifest: ## SavedVariables: MyAddonSavedVars',
      'Always provide a defaults table with ZO_SavedVars to handle missing/new settings',
      'Keep SavedVariables data minimal - do not store large datasets that can be regenerated',
      'Test with fresh SavedVariables (delete the .lua file) to ensure defaults work correctly',
    ],
  },
  events: {
    title: 'ESO Event Handling Rules',
    rules: [
      'Register events with: EVENT_MANAGER:RegisterForEvent("AddonName", EVENT_NAME, callback)',
      'The first parameter of every event callback is always eventCode (number)',
      'EVENT_ADD_ON_LOADED fires ONCE PER ENABLED ADDON - you MUST check addonName matches yours',
      'Unregister EVENT_ADD_ON_LOADED after handling: EVENT_MANAGER:UnregisterForEvent("AddonName", EVENT_ADD_ON_LOADED)',
      'Use EVENT_MANAGER:AddFilterForEvent to filter events server-side instead of checking in your callback',
      'Common filters: REGISTER_FILTER_UNIT_TAG, REGISTER_FILTER_COMBAT_RESULT, REGISTER_FILTER_SOURCE_COMBAT_UNIT_TYPE',
      'EVENT_PLAYER_ACTIVATED fires when the player is fully loaded - safe to use d() and chat output after this',
      'Multiple addons can register for the same event - do not assume exclusive access',
      'Unregister events you no longer need to improve performance',
      'Use EVENT_MANAGER:RegisterForUpdate("AddonName", intervalMs, callback) for periodic updates instead of OnUpdate',
    ],
  },
  libraries: {
    title: 'ESO Library Usage Guidelines',
    rules: [
      'LibAddonMenu-2.0: Standard for settings panels. Add to ## DependsOn: LibAddonMenu-2.0>=41',
      'LibDebugLogger: Structured logging that works before EVENT_PLAYER_ACTIVATED',
      'LibCustomMenu: Right-click context menus for inventory/chat',
      'LibScrollableMenu: Advanced nested menus with search and multiselection',
      'LibTutorial: Step-by-step tutorial system with UI pointer boxes',
      'LibHistoire: Cached guild history access',
      'LibMapPing: Map ping utilities (NOTE: LibGroupSocket is BANNED since 2024 - do NOT use it)',
      'Always specify minimum version in dependencies: LibName>=version',
      'Use ## OptionalDependsOn for libraries that enhance but are not required',
      'Do NOT bundle library source code in your addon - list them as dependencies so users install them separately',
      'Check if a library exists before creating your own - search esoui.com/downloads/cat35.html',
      'LibAsync: Asynchronous task processing to avoid frame drops',
      'LibGPS: GPS coordinate system for precise map positioning',
      'LibChatMessage: Formatted chat message output',
      'LibMediaProvider: Custom fonts, textures, and sounds registration',
      'LibSetDetection: Automatic equipment set detection on characters',
      'LibDialog: Custom dialog/popup creation',
    ],
  },
  upload: {
    title: 'ESOUI Upload & Distribution Rules',
    rules: [
      'Read ESOUI upload rules before submitting: esoui.com/forums/showthread.php?t=10790',
      'Remove hidden files from ZIP: .git, .vs, .vscode, .idea, __MACOSX, desktop.ini, Thumbs.db',
      'DO NOT use PowerShell Compress-Archive for ZIP creation - it uses backslashes that break Minion',
      'Use 7-Zip, WinRAR, or Windows "Send to > Compressed folder" instead',
      'ZIP must contain: AddonFolder/AddonName.txt + all .lua/.xml files',
      'ZIP path separators must be forward slashes (/) per ZIP specification',
      'First upload must be done via the ESOUI website - subsequent updates can use the API',
      'Provide a clear English description explaining what the addon does',
      'Executable files (.exe) require source code AND VirusTotal scan documentation',
      'For console addons, clearly mark them (e.g., "- CONSOLE" in the name)',
      'All PC addons on ESOUI automatically appear in Minion addon manager',
      'Use the Changelog tab for version notes, not the main description',
      'ESOUI changelog field OVERWRITES the entire history - always send the FULL changelog, not just current version changes',
      'ESOUI Update API: esoui.com/forums/showthread.php?t=6556 (for automated updates)',
      'When uploading via API, the "compatible" field must match ESOUI Game Version IDs (e.g., "101049" for 11.3.0 Season Zero)',
      'ESOUI Update API: POST https://api.esoui.com/addons/update with x-api-token header',
      'Use updatetest endpoint first: POST https://api.esoui.com/addons/updatetest',
      'GitHub Action available for automated publishing: esoui-addon-upload',
    ],
  },
  capabilities: {
    title: 'What Addons CAN Do (Allowed)',
    rules: [
      'Change/add/play UI sounds',
      'Add buttons, textures, labels, and other UI controls to the interface',
      'Draw 3D map pins/markers in overland zones (not inside dungeons)',
      'Show/hide existing UI elements',
      'Consume food/drink from inventory via API',
      'Add text to the bottom of tooltips',
      'Read player stats, equipped items, inventory data',
      'Track combat events, damage, healing numbers',
      'Manage guild data and trading history',
      'Create settings panels with LibAddonMenu-2.0',
      'Register keybindings via Bindings.xml',
      'Create slash commands via SLASH_COMMANDS table',
      'Read and write SavedVariables (data saved on UI reload or zone change)',
      'Hook into existing UI functions with ZO_PreHook/SecurePostHook',
      'Create custom windows, dialogs, and overlays',
      'Access map data, wayshrine info, zone information',
    ],
  },
  lua_version: {
    title: 'ESO Lua 5.1 Specifics & Gotchas',
    rules: [
      'ESO uses Lua 5.1 - NOT 5.2, 5.3, 5.4, or LuaJIT',
      'No bitwise operators - use bit.band(), bit.bor(), bit.bnot(), bit.bxor(), bit.lshift(), bit.rshift()',
      'No goto statement available',
      'No integer division operator (//) - use math.floor(a/b)',
      'String patterns only, NOT regex (no \\d, \\w etc - use %d, %w)',
      'The # operator only works reliably on arrays with no holes (nil gaps)',
      'No table.pack/table.unpack - use unpack() directly',
      'No math.maxinteger or math.mininteger',
      'No continue statement in loops - use if/else pattern instead',
      'pairs() for hash tables, ipairs() for sequential arrays (ipairs stops at first nil)',
      'String concatenation with .. operator (no string interpolation/template literals)',
      '1-based indexing everywhere (not 0-based like JavaScript/Python)',
      'Metatables and __index are fundamental to ESO OOP (ZO_Object:Subclass pattern)',
      'Use local everywhere - global access is ~30% slower',
      'table.getn is deprecated - use # instead',
    ],
  },
  console_addons: {
    title: 'Console Addon Development',
    rules: [
      'Console has stricter memory constraints than PC',
      'Create controls dynamically and use control pools instead of static XML',
      'Console-only addons must be categorized as "Outdated & Discontinued" on ESOUI',
      'Console addons must be clearly labeled with "- CONSOLE" in the name',
      'Use .addon manifest extension for console (instead of .txt)',
      'Must disable patches/dependent addon functionality for console-only addons',
      'PC addons need specific adaptation for console - test on both platforms',
      'Avoid excessive memory allocation in loops on console',
    ],
  },
  dev_tools: {
    title: 'Development & Debugging Tools',
    rules: [
      'merTorchbug: Advanced variable inspector, event watcher, script runner with control outlines',
      'ZGOO: Basic variable inspector - also works on consoles',
      'LibDebugLogger + DebugLogViewer: Structured logging that works BEFORE EVENT_PLAYER_ACTIVATED',
      'pChat/rChat: Chat capture that works before EVENT_PLAYER_ACTIVATED',
      'Circonian Control Outlines: Visualize UI control dimensions and anchors',
      'ESO Profiler: In-game performance measurement for addon functions',
      'sidTools: Addon isolation - disable all other addons for clean testing',
      '/script command: Test single-line Lua code snippets directly in chat',
      '/reloadui or ReloadUI("ingame"): Reload UI to apply addon changes without relogging',
      'Delete shader_cache.cooked in live/ folder after changing .dds textures',
      'Use d() for debug output in chat (only works after EVENT_PLAYER_ACTIVATED)',
      'ALWAYS disable other addons before testing yours to avoid interference',
    ],
  },
  community: {
    title: 'Community & Help Resources',
    rules: [
      'ESOUI General Authoring Discussion: esoui.com/forums/forumdisplay.php?f=174',
      'ESOUI Lua/XML Help forum: esoui.com/forums/forumdisplay.php?f=175',
      'ESO Addon Developer Discord/Gitter: gitter.im/esoui/esoui',
      'ESOUI Wiki (manually maintained): wiki.esoui.com',
      'UESP ESO API Browser: esoapi.uesp.net',
      'ESO Source Code on GitHub: github.com/esoui/esoui (live branch for current, pts for test server)',
    ],
  },
};

// ESO API Version to ESOUI Game Version mapping
// This maps the ## APIVersion number to the ESOUI upload compatibility versions
export const ESO_VERSION_MAP: Record<string, { gameVersion: string; name: string; current: boolean }> = {
  '101049': { gameVersion: '11.3.0', name: 'Season Zero', current: true },
  '101048': { gameVersion: '11.2.0', name: 'Seasons of the Worm Cult Pt2', current: false },
  '101047': { gameVersion: '11.1.0', name: 'Feast of Shadows', current: false },
  '101046': { gameVersion: '11.0.0', name: 'Seasons of the Worm Cult Pt1', current: false },
  '101045': { gameVersion: '10.3.5', name: 'Fallen Banners', current: false },
  '101044': { gameVersion: '10.2.0', name: 'Update 44', current: false },
  '101043': { gameVersion: '10.1.0', name: 'Update 43', current: false },
  '101042': { gameVersion: '10.0.0', name: 'Gold Road', current: false },
  '101041': { gameVersion: '9.3.0', name: 'Scions of Ithelia', current: false },
  '101040': { gameVersion: '9.2.5', name: 'Endless Archive', current: false },
  '101039': { gameVersion: '9.1.5', name: 'base-game patch', current: false },
  '101038': { gameVersion: '9.0.0', name: 'Necrom', current: false },
  '101037': { gameVersion: '8.3.5', name: 'Scribes of Fate', current: false },
};

// ===== HANDLER =====

async function handler(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case 'get_addon_rules': {
      const params = GetAddonRulesSchema.parse(args);

      if (params.topic === 'all') {
        return jsonResult({
          source: 'ESOUI Official Guidelines (esoui.com/forums/showthread.php?t=9867)',
          sections: Object.entries(RULES).map(([key, section]) => ({
            topic: key,
            title: section.title,
            rules: section.rules,
          })),
          essential_links: [
            { name: 'What addons MUST NOT do', url: 'https://www.esoui.com/forums/showthread.php?t=9865' },
            { name: 'Upload rules', url: 'https://www.esoui.com/forums/showthread.php?t=10790' },
            { name: 'Getting Started', url: 'https://wiki.esoui.com/Getting_Started' },
            { name: 'Manifest format', url: 'https://wiki.esoui.com/Addon_manifest_(.txt)_format' },
            { name: 'API Version history', url: 'https://wiki.esoui.com/APIVersion' },
            { name: 'ESO UI Source (GitHub)', url: 'https://github.com/esoui/esoui/tree/master' },
          ],
        });
      }

      const section = RULES[params.topic];
      if (!section) {
        return errorResult(`Unknown topic: ${params.topic}. Available: ${Object.keys(RULES).join(', ')}`);
      }

      return jsonResult({
        topic: params.topic,
        title: section.title,
        rules: section.rules,
        source: 'ESOUI Official Guidelines (esoui.com/forums/showthread.php?t=9867)',
      });
    }

    case 'generate_localization': {
      const params = GenerateLocalizationSchema.parse(args);

      if (params.method === 'localization_file') {
        // Generate separate language files
        const files: Array<{ filename: string; content: string }> = [];

        // English (always required)
        let enContent = `-- ${params.addon_name} Localization - English (Default)\n\n`;
        for (const s of params.strings) {
          enContent += `SafeAddString(${s.key}, "${s.en.replace(/"/g, '\\"')}", 1)\n`;
        }
        files.push({ filename: `lang/en.lua`, content: enContent });

        // German
        if (params.strings.some(s => s.de)) {
          let deContent = `-- ${params.addon_name} Localization - Deutsch\n\n`;
          for (const s of params.strings) {
            if (s.de) {
              deContent += `SafeAddString(${s.key}, "${s.de.replace(/"/g, '\\"')}", 1)\n`;
            }
          }
          files.push({ filename: `lang/de.lua`, content: deContent });
        }

        // French
        if (params.strings.some(s => s.fr)) {
          let frContent = `-- ${params.addon_name} Localization - Francais\n\n`;
          for (const s of params.strings) {
            if (s.fr) {
              frContent += `SafeAddString(${s.key}, "${s.fr.replace(/"/g, '\\"')}", 1)\n`;
            }
          }
          files.push({ filename: `lang/fr.lua`, content: frContent });
        }

        // Manifest additions
        const manifestLines = files.map(f => f.filename).join('\n');

        return jsonResult({
          files,
          manifest_addition: `; Localization\n${manifestLines}`,
          usage: `-- Access strings with: GetString(${params.strings[0]?.key || 'SI_MY_STRING'})`,
          tip: 'Load English first in manifest (as fallback), then other languages.',
        });
      }

      // Inline SafeAddString method
      let code = `-- ${params.addon_name} Localization\n`;
      code += `-- Uses SafeAddString for inline localization\n\n`;

      // Define string IDs
      for (const s of params.strings) {
        code += `ZO_CreateStringId("${s.key}", "${s.en.replace(/"/g, '\\"')}")\n`;
      }

      code += `\n-- Apply translations based on client language\n`;
      code += `local lang = GetCVar("language.2")\n\n`;

      // German translations
      if (params.strings.some(s => s.de)) {
        code += `if lang == "de" then\n`;
        for (const s of params.strings) {
          if (s.de) {
            code += `    SafeAddString(${s.key}, "${s.de.replace(/"/g, '\\"')}", 1)\n`;
          }
        }
        code += `end\n\n`;
      }

      // French translations
      if (params.strings.some(s => s.fr)) {
        code += `if lang == "fr" then\n`;
        for (const s of params.strings) {
          if (s.fr) {
            code += `    SafeAddString(${s.key}, "${s.fr.replace(/"/g, '\\"')}", 1)\n`;
          }
        }
        code += `end\n`;
      }

      return jsonResult({
        code,
        usage: `-- Access: GetString(${params.strings[0]?.key || 'SI_MY_STRING'})`,
        tip: 'Use GetString(SI_...) for existing game strings to avoid retranslation. Check: github.com/esoui/esoui/blob/master/esoui/ingamelocalization/localizegeneratedstrings.lua',
      });
    }

    case 'generate_hook_code': {
      const params = GenerateHookCodeSchema.parse(args);
      const target = params.target_object
        ? `${params.target_object}.${params.target_function}`
        : params.target_function;
      const desc = params.description || `Hook for ${params.addon_name}`;

      let code = '';

      switch (params.hook_type) {
        case 'pre_hook':
          code = `-- Pre-hook: ${desc}\n`;
          code += `-- Runs BEFORE the original function. Return true to PREVENT the original from executing.\n`;
          if (params.target_object) {
            code += `ZO_PreHook(${params.target_object}, "${params.target_function}", function(self, ...)\n`;
            code += `    -- Your code here (runs before ${target})\n`;
            code += `    -- Return true to block the original function\n`;
            code += `end)\n`;
          } else {
            code += `ZO_PreHook("${params.target_function}", function(...)\n`;
            code += `    -- Your code here (runs before ${params.target_function})\n`;
            code += `    -- Return true to block the original function\n`;
            code += `end)\n`;
          }
          break;

        case 'post_hook':
        case 'secure_post_hook':
          code = `-- SecurePostHook: ${desc}\n`;
          code += `-- Runs AFTER the original function. Cannot prevent the original from executing.\n`;
          code += `-- This is the SAFER option - preferred over ZO_PreHook.\n`;
          if (params.target_object) {
            code += `SecurePostHook(${params.target_object}, "${params.target_function}", function(self, ...)\n`;
            code += `    -- Your code here (runs after ${target})\n`;
            code += `end)\n`;
          } else {
            code += `SecurePostHook("${params.target_function}", function(...)\n`;
            code += `    -- Your code here (runs after ${params.target_function})\n`;
            code += `end)\n`;
          }
          break;

        case 'override':
          code = `-- Function Override: ${desc}\n`;
          code += `-- WARNING: Completely replaces the original function.\n`;
          code += `-- Other addons hooking this function will be affected!\n`;
          code += `-- Only use this if Pre/PostHook is not sufficient.\n\n`;
          if (params.target_object) {
            code += `local original_${params.target_function} = ${target}\n`;
            code += `${target} = function(self, ...)\n`;
            code += `    -- Your replacement code here\n`;
            code += `    \n`;
            code += `    -- Call original if needed:\n`;
            code += `    -- return original_${params.target_function}(self, ...)\n`;
            code += `end\n`;
          } else {
            code += `local original_${params.target_function} = ${params.target_function}\n`;
            code += `${params.target_function} = function(...)\n`;
            code += `    -- Your replacement code here\n`;
            code += `    \n`;
            code += `    -- Call original if needed:\n`;
            code += `    -- return original_${params.target_function}(...)\n`;
            code += `end\n`;
          }
          break;
      }

      return jsonResult({
        code,
        hook_type: params.hook_type,
        target,
        best_practices: [
          'ALWAYS hook the CLASS function, not the object instance',
          'Hook as far up the inheritance chain as possible',
          'Prefer SecurePostHook over ZO_PreHook when possible (safer)',
          'Avoid full overrides - they break other addon hooks',
          'Test with other popular addons enabled to check compatibility',
        ],
      });
    }

    default:
      return errorResult(`Unknown addon rules tool: ${name}`);
  }
}

export const addonRulesModule: ToolModule = { definitions, handler };
