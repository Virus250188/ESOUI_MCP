# ESO MCP Server - Documentation Overview

The ESO MCP (Model Context Protocol) Server provides **39 tools** across **10 modules** for Elder Scrolls Online addon development. It powers AI assistants with deep knowledge of the ESO API, equipment sets, code generation, and addon best practices.

---

## Quick Start

1. **Install the MCP server** following the README instructions.
2. **Connect your AI client** (Claude Desktop, Cursor, etc.) to the MCP server.
3. **Start asking questions** -- the AI will use the tools automatically.

**Common first actions:**

- Search the API: _"How do I get a player's inventory items?"_ -- uses `fetch_api_docs`
- Find a set: _"What sets drop in Deshaan?"_ -- uses `search_zones`
- Create an addon: _"Create a new addon called DPSTracker with settings and slash commands"_ -- uses `create_addon_boilerplate`
- Debug an error: _"Parse this ESO error: user:/AddOns/MyAddon/Main.lua:42: attempt to index a nil value"_ -- uses `parse_addon_error_log`
- Check rules: _"What are the restrictions for ESO addons?"_ -- uses `get_addon_rules`

---

## Documentation Index

| # | Document | Module | Tools | Description |
|---|----------|--------|-------|-------------|
| 00 | [Overview](00-overview.md) | -- | -- | This file. Hub page with navigation and quick-start guide. |
| 01 | [API Reference](01-api-reference.md) | api-reference | 6 | Search ESO API functions, events, constants, UI controls, and source code |
| 02 | [Set Database](02-set-database.md) | sets | 7 | Search sets, get details, compare, farm guides, build recommendations |
| 03 | [Character Import](03-character-import.md) | characters | 4 | Import characters from game, list, sync, and view details |
| 04 | [Code Generation](04-code-generation.md) | code-generation | 5 | Generate event handlers, settings panels, slash commands, UI XML, SavedVars |
| 05 | [Addon Scaffold](05-addon-scaffold.md) | addon-scaffold | 4 | Create manifests, boilerplate projects, files, and validate for upload |
| 06 | [Analysis & Debugging](06-analysis-debugging.md) | addon-analysis + savedvars-tools | 4 | Analyze code quality, validate manifests, inspect SavedVars, parse errors |
| 07 | [ESO Game Data](07-eso-data.md) | eso-data | 5 | Search zones, skills, patch notes, combined API search, source browsing |
| 08 | [Addon Rules](08-addon-rules.md) | addon-rules | 3 | ESOUI rules & guidelines, localization, and hook code generation |
| 09 | [Self-Update](09-updater.md) | updater | 1 | Update database with fresh data from multiple sources |

---

## Complete Tool Reference (39 Tools)

### API Reference Tools (6) -- [Full Docs](01-api-reference.md)

| Tool | Description |
|------|-------------|
| `search_api_functions` | Search ESO API functions by name, category, or namespace |
| `get_function_details` | Get full details for a specific function (signature, params, return values) |
| `search_events` | Search ESO events by name or category with typed parameters |
| `search_constants` | Search ESO constants and enums, or list all constant groups |
| `get_ui_control_info` | Get UI control type methods, properties, events, or list all types |
| `search_source_code` | Get search URLs for ESO UI source code on UESP and GitHub |

### Set Database & Build Tools (7) -- [Full Docs](02-set-database.md)

| Tool | Description |
|------|-------------|
| `search_sets` | Search equipment sets by name, type, DLC, or armor weight |
| `get_set_details` | Get full set details including bonus descriptions and locations |
| `update_character_context` | Store character info for personalized build recommendations |
| `recommend_builds` | Get build recommendations based on class, role, and preferences |
| `compare_sets` | Compare 2-4 sets side-by-side |
| `get_farming_guide` | Get detailed farming guide with locations and requirements |
| `get_set_by_category` | Browse sets by curated categories (beginner, endgame, PvP, etc.) |

### Character Import Tools (4) -- [Full Docs](03-character-import.md)

| Tool | Description |
|------|-------------|
| `import_character_from_game` | Import all characters from ESO SavedVariables |
| `list_my_characters` | List all previously imported characters |
| `sync_character` | Re-sync a specific character to update gear data |
| `get_character_details` | Get detailed character info including equipped sets |

### Code Generation Tools (5) -- [Full Docs](04-code-generation.md)

| Tool | Description |
|------|-------------|
| `generate_event_handler` | Generate Lua event handler code with correct parameter signatures |
| `generate_settings_panel` | Generate LibAddonMenu-2.0 settings panel code |
| `generate_slash_command` | Generate slash command code with subcommand routing |
| `generate_ui_xml` | Generate ESO UI XML for 8 control types |
| `generate_savedvariables_code` | Generate SavedVariables initialization with helpers |

### Addon Scaffolding & Upload Tools (4) -- [Full Docs](05-addon-scaffold.md)

| Tool | Description |
|------|-------------|
| `create_addon_manifest` | Generate a valid `.txt` manifest file |
| `create_addon_boilerplate` | Generate a complete addon project with selected features |
| `create_addon_file` | Generate a single file using templates |
| `prepare_addon_upload` | Validate addon directory for ESOUI upload readiness (12 rules) |

### Analysis & Debugging Tools (4) -- [Full Docs](06-analysis-debugging.md)

| Tool | Description |
|------|-------------|
| `analyze_savedvariables` | Analyze SavedVariables file for structure, size, and issues |
| `parse_addon_error_log` | Parse ESO Lua errors with diagnosis and fix suggestions |
| `analyze_addon_code` | Analyze addon code for quality issues, performance, and dependencies |
| `validate_addon_manifest` | Validate manifest format, fields, and file references |

### ESO Game Data Tools (5) -- [Full Docs](07-eso-data.md)

| Tool | Description |
|------|-------------|
| `search_zones` | Search zones by name and type, with associated sets |
| `search_skills` | Search skills (links to external resources -- data not in local DB) |
| `get_patch_notes_summary` | Get current API version info, stats, and patch note links |
| `fetch_api_docs` | Combined search across functions, events, AND constants (recommended first search) |
| `fetch_esoui_source` | Get direct URLs to ESO UI source files and directory guide |

### ESOUI Rules & Guidelines Tools (3) -- [Full Docs](08-addon-rules.md)

| Tool | Description |
|------|-------------|
| `get_addon_rules` | Get official addon rules, restrictions, and best practices (9 topics) |
| `generate_localization` | Generate localization code (SafeAddString or separate files) |
| `generate_hook_code` | Generate hook code (ZO_PreHook, SecurePostHook, override) |

### Self-Update Tool (1) -- [Full Docs](09-updater.md)

| Tool | Description |
|------|-------------|
| `update_database` | Update database from LibSets, eso-hub.com, GitHub, or UESP |

---

## Database Contents

The MCP server ships with a pre-populated SQLite database containing:

| Data Type | Count | Source |
|-----------|-------|--------|
| Equipment Sets | 669+ | LibSets addon |
| Set Bonuses | 2,800+ | eso-hub.com scraper |
| Zones | 142+ | LibSets addon |
| Set Locations | 1,200+ | LibSets addon |
| API Functions | 6,800+ | UESP + GitHub ESOUIDocumentation |
| API Events | 1,025+ | UESP + GitHub ESOUIDocumentation |
| Events with Parameters | 586 | GitHub ESOUIDocumentation |
| API Constants | 12,500+ | UESP |

---

## Common Workflows

### Building a New Addon

1. Check rules: `get_addon_rules({ topic: "restrictions" })`
2. Scaffold: `create_addon_boilerplate({ addon_name: "MyAddon", author: "Me", features: [...] })`
3. Search APIs: `fetch_api_docs({ query: "inventory" })`
4. Generate code: `generate_event_handler({ event_name: "EVENT_...", addon_name: "MyAddon" })`
5. Validate: `prepare_addon_upload({ addon_path: "..." })`

### Analyzing an Existing Addon

1. Analyze code: `analyze_addon_code({ addon_path: "..." })`
2. Validate manifest: `validate_addon_manifest({ manifest_path: "..." })`
3. Check SavedVars: `analyze_savedvariables({ addon_name: "AddonName" })`
4. Debug errors: `parse_addon_error_log({ error_text: "..." })`

### Finding Gear for a Character

1. Import characters: `import_character_from_game({})`
2. View current gear: `get_character_details({ character_name: "..." })`
3. Get recommendations: `recommend_builds({ class: "...", role: "..." })`
4. Compare options: `compare_sets({ set_ids: [...] })`
5. Get farming info: `get_farming_guide({ set_name: "..." })`

### Keeping Data Fresh After an ESO Patch

1. Check status: `update_database({ source: "status" })`
2. Update LibSets files manually, then: `update_database({ source: "sets" })`
3. Update API: `update_database({ source: "api_docs" })`
4. Update UESP: `update_database({ source: "api_uesp" })`
5. Scrape bonuses: `update_database({ source: "set_bonuses" })`

---

## Architecture

The MCP server is built with:

- **TypeScript** -- Server implementation
- **SQLite (better-sqlite3)** -- Local database for all game data
- **Zod** -- Input validation for all tool parameters
- **MCP Protocol** -- Standard Model Context Protocol for AI tool integration

Tool modules are located at: `mcp-server/src/tools/`

| File | Module |
|------|--------|
| `api-reference.ts` | API Reference (6 tools) |
| `sets.ts` | Set Database (7 tools) |
| `characters.ts` | Character Import (4 tools) |
| `code-generation.ts` | Code Generation (5 tools) |
| `addon-scaffold.ts` | Addon Scaffolding (4 tools) |
| `addon-analysis.ts` | Code Analysis (2 tools) |
| `savedvars-tools.ts` | SavedVars Analysis + Error Parsing (2 tools) |
| `eso-data.ts` | ESO Game Data (5 tools) |
| `addon-rules.ts` | Addon Rules & Guidelines (3 tools) |
| `updater.ts` | Self-Update (1 tool) |
