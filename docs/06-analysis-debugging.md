# Analysis & Debugging Tools

The Analysis and Debugging module provides 4 tools for analyzing ESO addon code quality, validating manifest files, inspecting SavedVariables data, and parsing Lua error logs with fix suggestions.

These tools help addon developers find bugs, performance issues, and best-practice violations before they become problems in production.

---

## analyze_savedvariables

**Description:** Analyze an ESO SavedVariables `.lua` file for structure, size, potential issues, and data overview. Useful for understanding what data an addon is storing, detecting bloated files that slow down game loading, and inspecting the data schema.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_name | string | No | Addon name (e.g., `"LibHistoire"`) to find in default SavedVariables location |
| file_path | string | No | Full path to a `.lua` SavedVariables file |

Provide either `addon_name` or `file_path`. At least one is required.

When `addon_name` is provided, the tool looks for the file at the default path: `Documents/Elder Scrolls Online/live/SavedVariables/<addon_name>.lua`.

**Example Usage -- By addon name:**

```json
{
  "tool": "analyze_savedvariables",
  "arguments": {
    "addon_name": "LibHistoire"
  }
}
```

**Example Usage -- By file path:**

```json
{
  "tool": "analyze_savedvariables",
  "arguments": {
    "file_path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\SavedVariables\\MyAddon.lua"
  }
}
```

**Example Response:**

```json
{
  "file_path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\SavedVariables\\LibHistoire.lua",
  "size_bytes": 2458624,
  "size_readable": "2.34 MB",
  "top_level_tables": ["LibHistoire_SavedVariables"],
  "entry_count": 8432,
  "nesting_depth": 7,
  "structure": {
    "LibHistoire_SavedVariables": ["Default", "@PlayerAccount", "NA Megaserver"]
  },
  "potential_issues": [
    "File is 2.34 MB. Large SavedVariables files can cause long load times and increased memory usage. Consider pruning old data."
  ]
}
```

**Potential issues detected:**

| Condition | Severity | Message |
|-----------|----------|---------|
| File > 1 MB | Warning | Large file can cause long load times |
| File > 10 MB | Critical | Significantly impacts game load times |
| Nesting depth > 10 | Warning | Deep nesting causes serialization performance issues |
| Entry count > 10,000 | Warning | High entry count -- consider if all data needs to persist |
| Mixed account-wide and character storage | Info | Both `ZO_SavedVars:NewAccountWide` and `ZO_SavedVars:New` detected |

**Tips:**

- Use this tool to diagnose slow ESO load times caused by bloated SavedVariables.
- The `structure` field shows the first level of keys under each top-level table, giving you a quick overview of the data schema.
- Common culprits for large SavedVariables: guild history addons, combat log addons, and price tracking addons.
- The addon must have been loaded in-game at least once and ESO must be closed for the SavedVariables file to exist on disk.

**Requirements:**

- Filesystem access to the ESO Documents folder.
- ESO must be closed (SavedVariables are written on exit).

---

## parse_addon_error_log

**Description:** Parse ESO addon Lua errors and provide diagnosis with fix suggestions. Supports the standard ESO error format (`user:/AddOns/AddonName/File.lua:123: error message`) and generic Lua errors. Can process multiple errors at once.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| error_text | string | No | Raw ESO Lua error text to parse (can contain multiple errors separated by newlines) |
| log_path | string | No | Path to an error log file to read and parse |

Provide either `error_text` or `log_path`. At least one is required.

**Example Usage -- Parse error text:**

```json
{
  "tool": "parse_addon_error_log",
  "arguments": {
    "error_text": "user:/AddOns/MyAddon/MyAddon.lua:42: attempt to index a nil value (global 'MyAddon')\nuser:/AddOns/MyAddon/Settings.lua:15: attempt to call a nil value (global 'LibAddonMenu2')"
  }
}
```

**Example Usage -- Parse log file:**

```json
{
  "tool": "parse_addon_error_log",
  "arguments": {
    "log_path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\Logs\\errors.txt"
  }
}
```

**Example Response:**

```json
{
  "total_errors": 2,
  "error_type_summary": {
    "nil_index": 1,
    "nil_call": 1
  },
  "errors": [
    {
      "type": "nil_index",
      "message": "attempt to index a nil value (global 'MyAddon')",
      "file": "MyAddon/MyAddon.lua",
      "line": 42,
      "suggestion": "A variable is nil when you try to access a field/method on it. Check that the variable is initialized properly, the dependency addon is loaded, and that you are not accessing it before EVENT_ADD_ON_LOADED fires."
    },
    {
      "type": "nil_call",
      "message": "attempt to call a nil value (global 'LibAddonMenu2')",
      "file": "MyAddon/Settings.lua",
      "line": 15,
      "suggestion": "A function you're trying to call doesn't exist. Check for typos, verify the API version matches your code, and ensure library dependencies are loaded. The function may have been renamed or removed in a recent API update."
    }
  ]
}
```

**Error types recognized:**

| Type | Pattern | Common Cause |
|------|---------|--------------|
| `nil_index` | `attempt to index a nil value` | Variable not initialized, dependency not loaded |
| `nil_call` | `attempt to call a nil value` | Function missing, typo, or API changed |
| `nil_arithmetic` | `attempt to perform arithmetic on a nil value` | Missing nil check before math |
| `bad_argument` | `bad argument` | Wrong parameter type passed to function |
| `protected_function` | `Protected function` | Calling a restricted function from addon code |
| `stack_overflow` | `stack overflow` | Infinite recursion |
| `nil_concatenation` | `attempt to concatenate` | Nil value in string concatenation |
| `nil_table_index` | `table index is nil` | Using nil as a table key |
| `out_of_memory` | `out of memory` | Memory leak or excessive data storage |

**Tips:**

- You can paste multiple errors at once -- separate them with newlines.
- The `suggestion` field gives actionable advice for each error type.
- The `error_type_summary` helps identify systemic issues (e.g., many `nil_index` errors may indicate a missing dependency).
- ESO error format: `user:/AddOns/<AddonName>/<File>.lua:<Line>: <message>`.

---

## analyze_addon_code

**Description:** Analyze an ESO addon directory for code quality issues including global variable pollution, unregistered events, deprecated patterns, performance concerns, library dependencies, and API call detection.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_path | string | Yes | Path to the addon directory containing `.lua` files |

**Example Usage:**

```json
{
  "tool": "analyze_addon_code",
  "arguments": {
    "addon_path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\AddOns\\MyAddon"
  }
}
```

**Example Response:**

```json
{
  "files_analyzed": 4,
  "issues": [
    {
      "file": "MyAddon.lua",
      "line": 15,
      "message": "Potential global variable pollution: \"helper\" assigned without \"local\" keyword",
      "severity": "warning"
    },
    {
      "file": "UI.lua",
      "line": 88,
      "message": "OnUpdate handler without time-based throttle. This fires every frame (~60+ times/sec) and can cause performance issues.",
      "severity": "warning"
    }
  ],
  "warnings": [
    "Event \"MyAddon\" in MyAddon.lua is registered but never unregistered. Consider unregistering when the event is no longer needed.",
    "MyAddon.lua: Uses d() debug output. Make sure to remove or gate debug calls behind a flag for release builds."
  ],
  "suggestions": [
    "UI.lua:22: zo_callLater used without storing the ID. Store the return value to cancel it later if needed.",
    "UI.lua: 15 GetControl() calls found. Consider caching control references in local variables for better performance."
  ],
  "dependencies_used": ["LibAddonMenu", "LibDebugLogger"],
  "api_calls_found": [
    "GetItemLink", "GetItemLinkName", "GetBagSize",
    "SetHidden", "SetText", "GetControl"
  ]
}
```

**Analysis categories:**

| Category | What it checks |
|----------|---------------|
| **Global pollution** | Top-level assignments without `local` keyword (lowercase variable names) |
| **Event handling** | `RegisterForEvent` without matching `UnregisterForEvent` |
| **Performance** | `OnUpdate` without throttle, `zo_callLater` without cleanup, string concatenation in loops, excessive `GetControl()` calls |
| **Dependencies** | Detects usage of 20+ known ESO libraries (LibAddonMenu, LibAsync, LibCustomMenu, etc.) |
| **API calls** | Lists all ESO API functions used (Get*, Set*, Is*, Has*, ZO_*, etc.) |
| **Deprecated patterns** | `d()` debug output left in code, old `GetAddOnInfo()` usage |

**Tips:**

- Run this before publishing to catch common mistakes.
- The `dependencies_used` list helps you verify your manifest `## DependsOn` is complete.
- Fix all `severity: "error"` issues. Address warnings for better code quality.
- `api_calls_found` can be cross-referenced with `search_api_functions` to verify all API calls are valid for the current API version.

**Requirements:**

- Filesystem access to the addon directory.
- The path must point to a directory containing `.lua` files.

---

## validate_addon_manifest

**Description:** Validate an ESO addon manifest (`.txt` file) for correct format, required fields, valid API version, and verify that listed files exist on disk. Can validate from either a file path or raw content.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| manifest_path | string | No | Path to the addon manifest `.txt` file |
| manifest_content | string | No | Raw manifest content to validate directly |

Provide either `manifest_path` or `manifest_content`. At least one is required.

When `manifest_path` is provided, the tool also verifies that all listed `.lua` and `.xml` files exist on disk.

**Example Usage -- Validate file:**

```json
{
  "tool": "validate_addon_manifest",
  "arguments": {
    "manifest_path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\AddOns\\MyAddon\\MyAddon.txt"
  }
}
```

**Example Usage -- Validate content:**

```json
{
  "tool": "validate_addon_manifest",
  "arguments": {
    "manifest_content": "## Title: My Addon\n## APIVersion: 101048\n## Author: MyName\n\nMyAddon.lua\nSettings.lua"
  }
}
```

**Example Response:**

```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    "Missing optional field: ## Version. Recommended for tracking addon updates.",
    "Missing optional field: ## Description. Recommended for ESOUI listing."
  ],
  "listed_files": ["MyAddon.lua", "Settings.lua"],
  "missing_files": [],
  "parsed_fields": {
    "Title": "My Addon",
    "APIVersion": "101048",
    "Author": "MyName"
  }
}
```

**Validation checks:**

| Check | Severity | Description |
|-------|----------|-------------|
| `## Title` present | Error | Required field |
| `## APIVersion` present and valid | Error | Must be a 6-digit number (e.g., `101048`) |
| `## DependsOn` format | Error | Must follow `AddonName` or `AddonName>=version` format |
| `## OptionalDependsOn` format | Warning | Same format as DependsOn |
| `## Author` present | Warning | Recommended |
| `## Version` present | Warning | Recommended |
| `## Description` present | Warning | Recommended |
| Listed files exist | Error | Verifies `.lua` and `.xml` files exist on disk (only with `manifest_path`) |
| Files listed at all | Warning | Warns if no code files are referenced |

**Tips:**

- Use `manifest_content` to validate a manifest before writing it to disk.
- Use `manifest_path` for a complete validation that includes file existence checks.
- The `parsed_fields` output shows how ESO will interpret your manifest.
- Common errors: missing `## Title`, invalid `APIVersion` format, referencing files that do not exist.
