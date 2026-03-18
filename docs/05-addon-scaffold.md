# Addon Scaffolding & Upload Tools

The Addon Scaffold module provides 4 tools for generating ESO addon project files from scratch and validating addons for ESOUI upload. These tools handle manifest creation, full boilerplate generation, individual file creation, and upload readiness validation.

---

## create_addon_manifest

**Description:** Generate a valid ESO addon `.txt` manifest file with proper formatting. The manifest is the entry point for ESO addons -- it tells the game which files to load, what dependencies are required, and provides metadata for the addon manager.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_name | string | Yes | The addon folder/file name (letters, numbers, underscores only; PascalCase recommended) |
| title | string | Yes | Display title shown in the addon manager (supports color codes like `\|cFFFFFF`) |
| author | string | Yes | Author name |
| version | string | No | Addon version string (default: `"1.0.0"`) |
| description | string | No | Short description of what the addon does |
| dependencies | string[] | No | List of required addon dependencies (e.g., `["LibAddonMenu-2.0>=41"]`) |
| saved_variables | string[] | No | List of SavedVariables names to declare |
| is_library | boolean | No | Whether this addon is a library (adds `## IsLibrary: true`) |
| api_version | string | No | ESO API version number (default: `"101048"`) |

**Example Usage:**

```json
{
  "tool": "create_addon_manifest",
  "arguments": {
    "addon_name": "CombatTracker",
    "title": "Combat Tracker",
    "author": "MyName",
    "version": "2.1.0",
    "description": "Real-time combat damage and healing tracker",
    "dependencies": ["LibAddonMenu-2.0>=41"],
    "saved_variables": ["CombatTrackerSavedVariables"],
    "api_version": "101048"
  }
}
```

**Example Response:**

```json
{
  "filename": "CombatTracker.txt",
  "content": "## Title: |cFFFFFFCombat Tracker|r\n## Author: MyName\n## Version: 2.1.0\n## APIVersion: 101048\n## SavedVariables: CombatTrackerSavedVariables\n## DependsOn: LibAddonMenu-2.0>=41\n## Description: Real-time combat damage and healing tracker\n## OptionalDependsOn: LibAddonMenu-2.0\n\nCombatTracker.lua"
}
```

**Generated manifest:**

```
## Title: |cFFFFFFCombat Tracker|r
## Author: MyName
## Version: 2.1.0
## APIVersion: 101048
## SavedVariables: CombatTrackerSavedVariables
## DependsOn: LibAddonMenu-2.0>=41
## Description: Real-time combat damage and healing tracker
## OptionalDependsOn: LibAddonMenu-2.0

CombatTracker.lua
```

**Tips:**

- The manifest filename MUST match the addon folder name exactly (e.g., `CombatTracker/CombatTracker.txt`).
- The title supports ESO color codes: `|cRRGGBB` starts a color, `|r` resets to default.
- Always specify version requirements in dependencies with `>=` (e.g., `LibAddonMenu-2.0>=41`).
- Maximum 2 API versions allowed in `## APIVersion`.
- The main `.lua` file is automatically listed at the end of the manifest.

---

## create_addon_boilerplate

**Description:** Generate a complete ESO addon file set with manifest, Lua code, and optional features. This is the fastest way to start a new addon project -- it generates all the files you need in one call.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_name | string | Yes | The addon folder/file name (letters, numbers, underscores only; PascalCase recommended) |
| author | string | Yes | Author name |
| description | string | No | Short description of what the addon does |
| features | string[] | Yes | List of features to include. Options: `"settings_panel"`, `"slash_command"`, `"saved_variables"`, `"keybindings"`, `"xml_ui"` |

**Example Usage:**

```json
{
  "tool": "create_addon_boilerplate",
  "arguments": {
    "addon_name": "CombatTracker",
    "author": "MyName",
    "description": "Track combat damage and healing in real-time",
    "features": ["settings_panel", "slash_command", "saved_variables", "xml_ui"]
  }
}
```

**Example Response:**

```json
{
  "files": [
    {
      "path": "CombatTracker/CombatTracker.txt",
      "content": "## Title: |cFFFFFFCombatTracker|r\n## Author: MyName\n..."
    },
    {
      "path": "CombatTracker/CombatTracker.lua",
      "content": "-- CombatTracker\n-- Track combat damage and healing in real-time\n-- Author: MyName\n..."
    },
    {
      "path": "CombatTracker/CombatTracker.xml",
      "content": "<GuiXml>\n    <Controls>\n        <TopLevelControl name=\"CombatTrackerWindow\" ...\n..."
    }
  ]
}
```

**Feature descriptions:**

| Feature | What it generates |
|---------|-------------------|
| `settings_panel` | LibAddonMenu-2.0 settings panel with an example checkbox. Adds `LibAddonMenu-2.0` to dependencies and creates SavedVariables. |
| `slash_command` | Slash command handler (`/addonname`) with help subcommand. |
| `saved_variables` | `ZO_SavedVars:NewAccountWide()` initialization with defaults table. |
| `keybindings` | `Bindings.xml` file with a toggle keybind. |
| `xml_ui` | XML UI window with backdrop, title, and close button. |

**Tips:**

- The generated code includes a proper `EVENT_ADD_ON_LOADED` handler that checks the addon name and unregisters itself.
- `settings_panel` automatically includes `saved_variables` support.
- All generated files are properly referenced in the manifest.
- The output gives you file paths -- create the folder structure and write each file to disk.

---

## create_addon_file

**Description:** Generate a single ESO addon file (Lua, XML, manifest `.txt`, or Bindings.xml) using optional templates. Use this when you need to add a specific file to an existing addon project.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file_type | string | Yes | Type of file. One of: `"lua"`, `"xml"`, `"txt"`, `"bindings"` |
| addon_name | string | Yes | The addon name (must be a valid Lua identifier) |
| template | string | No | Template to use. One of: `"main"`, `"settings"`, `"ui_window"`, `"event_handler"` |
| options | object | No | Additional options (e.g., `author`, `description`, `event_name`, `handler_name`, `title`, `version`, `dependencies`, `saved_variables`, `is_library`, `api_version`) |

**Template and file_type combinations:**

| file_type | template | Description |
|-----------|----------|-------------|
| `lua` | `main` (default) | Main addon Lua file with `EVENT_ADD_ON_LOADED` |
| `lua` | `settings` | LibAddonMenu-2.0 settings panel file |
| `lua` | `event_handler` | Simple event handler file |
| `xml` | `ui_window` | TopLevelControl window with backdrop and close button |
| `xml` | (default) | Basic TopLevelControl |
| `txt` | - | Addon manifest file |
| `bindings` | - | Keybinding definitions XML |

**Example Usage -- Settings file:**

```json
{
  "tool": "create_addon_file",
  "arguments": {
    "file_type": "lua",
    "addon_name": "CombatTracker",
    "template": "settings",
    "options": { "author": "MyName" }
  }
}
```

**Example Usage -- Event handler:**

```json
{
  "tool": "create_addon_file",
  "arguments": {
    "file_type": "lua",
    "addon_name": "CombatTracker",
    "template": "event_handler",
    "options": {
      "event_name": "EVENT_COMBAT_EVENT",
      "handler_name": "OnCombatEvent"
    }
  }
}
```

**Example Response:**

```json
{
  "filename": "CombatTrackerSettings.lua",
  "content": "-- CombatTracker Settings Panel\n-- Uses LibAddonMenu-2.0\n\nlocal addon = CombatTracker\n\nfunction addon:InitializeSettings()\n    local LAM = LibAddonMenu2\n..."
}
```

**Tips:**

- Use `create_addon_boilerplate` for new projects; use `create_addon_file` to add files to existing projects.
- Remember to add new files to the addon manifest.
- The `options` object varies by template -- check the combinations table above.

---

## prepare_addon_upload

**Description:** Validate an ESO addon directory for ESOUI upload readiness. Checks 12 rules covering manifest format, API version limits, dependency version checks, file references, hidden files, global variable pollution, SavedVariables server separation, and ZIP packaging rules. Based on official ESOUI upload guidelines.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_path | string | Yes | Path to the addon directory to validate (e.g., `C:\Users\...\AddOns\MyAddon`) |

**Example Usage:**

```json
{
  "tool": "prepare_addon_upload",
  "arguments": {
    "addon_path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\AddOns\\CombatTracker"
  }
}
```

**Example Response:**

```json
{
  "addon_name": "CombatTracker",
  "manifest_file": "CombatTracker.txt",
  "ready_for_upload": false,
  "errors": [
    "Remove these files/folders before uploading (ESOUI rule): .git, .vscode"
  ],
  "warnings": [
    "Dependency \"LibAddonMenu-2.0\" has no version check. Best practice: \"LibAddonMenu-2.0>=41\".",
    "Missing ## Description in manifest. ESOUI recommends a description.",
    "Potential global variable pollution: helper, config. Use \"local\" or a namespace table."
  ],
  "fixes": [
    "Change \"LibAddonMenu-2.0\" to \"LibAddonMenu-2.0>=41\" in ## DependsOn.",
    "Delete hidden files (.git, .vs, .idea, desktop.ini, __MACOSX, etc.) from the addon folder before creating the ZIP.",
    "Prefix variables with \"local\" or store them in a single global addon table."
  ],
  "zip_packaging_rules": [
    "The ZIP must contain a folder \"CombatTracker/\" at the root level.",
    "Inside: CombatTracker.txt + all .lua/.xml files.",
    "DO NOT use PowerShell Compress-Archive (creates backslashes that break Minion).",
    "Use 7-Zip, WinRAR, or the built-in Windows \"Send to > Compressed folder\" instead.",
    "ZIP path separators MUST be forward slashes (/) per ZIP spec.",
    "All directory entries must be explicitly included in the ZIP."
  ],
  "esoui_checklist": [
    "FAIL: 1 error(s) must be fixed",
    "INFO: 3 warning(s) to review",
    "Remember: Write a clear English description for ESOUI",
    "Remember: Credit original authors if you adapted code from other addons",
    "Remember: Use the Changelog tab for update notes, not the description"
  ],
  "files_found": 8,
  "lua_files": 3
}
```

**Validation rules checked:**

| # | Rule | Severity |
|---|------|----------|
| 1 | Manifest file must match folder name | Error |
| 2 | APIVersion present and max 2 versions | Error |
| 3 | Title field required | Error |
| 4 | DependsOn has version checks (`>=`) | Warning |
| 5 | Listed files exist on disk | Error |
| 6 | SavedVariables server separation (`GetWorldName`) | Warning |
| 7 | Author field present | Warning |
| 8 | Version field present | Warning |
| 9 | Description field present | Warning |
| 10 | No hidden/unwanted files (.git, .vs, desktop.ini, etc.) | Error |
| 11 | No global variable pollution (lowercase globals) | Warning |
| 12 | ZIP packaging guidance | Info |

**Tips:**

- Fix all **errors** before uploading. Warnings are recommendations but not blockers.
- The most common issue is hidden files (`.git`, `.vscode`) left in the addon directory.
- **Never** use PowerShell `Compress-Archive` for creating the ZIP -- it produces backslashes that break the Minion addon manager.
- Use 7-Zip, WinRAR, or Windows "Send to > Compressed folder" instead.
- The `fixes` array provides specific instructions for each issue found.

**Requirements:**

- Filesystem access to the addon directory.
