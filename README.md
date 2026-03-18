# ESO Addon Development Assistant - MCP Server

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for **Elder Scrolls Online addon development**. Provides AI assistants with 39 tools covering the entire ESO addon development workflow — from API reference lookup to code generation, debugging, and ESOUI upload preparation.

Works with **Claude Desktop, ChatGPT, Cursor, Windsurf, VS Code (Copilot), Cline, Continue**, and any other MCP-compatible AI client.

## Features

### 39 Tools in 10 Modules

| Module | Tools | Description |
|--------|-------|-------------|
| **API Reference** | 6 | Search 8,659 API functions, 1,025 events, 497K constants, UI controls |
| **Set Database** | 7 | Search 705 equipment sets with bonuses, locations, drop mechanics |
| **Character Import** | 4 | Import characters from ESO SavedVariables |
| **Code Generation** | 5 | Generate event handlers, settings panels, slash commands, UI XML, SavedVariables |
| **Addon Scaffolding** | 4 | Create manifests, boilerplate, single files, upload preparation |
| **Analysis & Debug** | 4 | Analyze SavedVariables, parse error logs, review addon code, validate manifests |
| **ESO Data** | 5 | Search zones, skills reference, patch notes, combined API docs, source code browser |
| **ESOUI Rules** | 3 | Official addon rules/restrictions, localization code, hook patterns |
| **Self-Update** | 1 | Update database from UESP, GitHub, eso-hub.com after ESO patches |

### Database

| Data | Count | Source |
|------|-------|--------|
| API Functions | 8,659 | Official ESOUIDocumentation.txt (GitHub) + UESP |
| Events | 1,025 (586 with typed parameters) | Official docs + UESP |
| Constants & Enums | 497,405 | UESP |
| Equipment Sets | 705 | LibSets (API 101048) |
| Set Bonus Descriptions | 2,361 (704 sets) | eso-hub.com |
| Zones | 175 | LibSets |
| Wayshrines | 567 | LibSets |
| Set Drop Locations | 1,318 (100% with zone names + drop mechanics) | LibSets |
| UI Control Types | 13 | Built-in definitions |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An MCP-compatible AI client (Claude Desktop, Cursor, etc.)

### Installation

```bash
git clone https://github.com/Virus250188/ESOUI_MCP.git
cd ESOUI_MCP/mcp-server
npm install
npm run build
```

### First Run — Automatic Data Import

On first start, the server automatically downloads ESO API data from UESP (~30 seconds):

```bash
npm start
```

Then import the full set database:

```bash
cd ..
npx tsx scripts/import-all-sets.ts    # Import 705 sets from LibSets
npx tsx scripts/import-api-docs.ts     # Import official API docs from GitHub
npx tsx scripts/scrape-set-bonuses.ts  # Scrape set bonus descriptions (requires Playwright)
```

### Connect to Your AI Client

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eso-addon-dev": {
      "command": "node",
      "args": ["C:/path/to/ESOUI_MCP/mcp-server/dist/index.js"]
    }
  }
}
```

#### Cursor / VS Code / Other MCP Clients

Configure the MCP server command: `node /path/to/ESOUI_MCP/mcp-server/dist/index.js`

## Tool Overview

### API Reference
- `search_api_functions` — Search 8,659 ESO API functions with typed signatures
- `get_function_details` — Full details: params, returns, related functions
- `search_events` — Search 1,025 events with parameter definitions
- `search_constants` — Search 497K constants/enums by name or group
- `get_ui_control_info` — UI control types with methods, properties, events
- `search_source_code` — ESO UI source code search guidance

### Code Generation
- `generate_event_handler` — Correct EVENT_MANAGER registration with typed parameters from DB
- `generate_settings_panel` — Complete LibAddonMenu-2.0 settings panel
- `generate_slash_command` — Slash commands with subcommand routing
- `generate_ui_xml` — ESO XML for 8 element types (TopLevelControl, Button, Label, etc.)
- `generate_savedvariables_code` — ZO_SavedVars with defaults and helpers

### Addon Development
- `create_addon_boilerplate` — Complete addon file set (manifest + Lua + settings + XML + keybindings)
- `prepare_addon_upload` — Validate against 12 ESOUI upload rules (manifest, ZIP, hidden files, etc.)
- `get_addon_rules` — Official ESOUI rules: restrictions, best practices, performance, localization, hooking
- `generate_localization` — SafeAddString or separate language files (EN/DE/FR)
- `generate_hook_code` — ZO_PreHook, SecurePostHook, function overrides

### Analysis & Debugging
- `analyze_addon_code` — Detect global pollution, missing unregister, performance issues
- `validate_addon_manifest` — Check manifest format, APIVersion, dependencies
- `parse_addon_error_log` — Diagnose ESO Lua errors with fix suggestions
- `analyze_savedvariables` — File structure, size, nesting depth, issues

### Self-Update
- `update_database` — Refresh data after ESO patches from UESP, GitHub, eso-hub.com

## Updating After ESO Patches

```
AI: "There's a new ESO update. Can you update the database?"

1. update_database({source: "api_docs"})     → Fresh API docs from GitHub
2. update_database({source: "set_bonuses"})   → Scrape new sets from eso-hub.com
3. update_database({source: "sets"})          → Re-import from LibSets (update addon first)
4. update_database({source: "status"})        → Verify what's loaded
```

## Security

- **Path validation** — All file access tools validate paths against allowed directories (ESO Documents folder only)
- **FTS injection prevention** — Search queries are sanitized before SQLite FTS5
- **Input validation** — All tool inputs validated with Zod schemas
- **No command injection** — Script paths are hardcoded, never from user input
- **Identifier validation** — Generated code uses regex-validated identifiers to prevent Lua injection
- **Graceful shutdown** — SIGINT/SIGTERM handlers ensure database integrity

## Data Sources

| Source | What | Updated |
|--------|------|---------|
| [UESP](https://esoapi.uesp.net/) | API functions, events, constants | Auto-import on first start |
| [GitHub esoui/esoui](https://github.com/esoui/esoui) | Official API documentation | `update_database({source: "api_docs"})` |
| [LibSets](https://www.esoui.com/downloads/info2241) | Set data, zones, wayshrines | `update_database({source: "sets"})` |
| [eso-hub.com](https://eso-hub.com/en/sets) | Set bonus descriptions | `update_database({source: "set_bonuses"})` |
| [ESOUI Forums](https://www.esoui.com/forums/showthread.php?t=9867) | Addon development rules | Built into `get_addon_rules` |

## Project Structure

```
ESOUI_MCP/
├── mcp-server/
│   ├── src/
│   │   ├── index.ts                 # MCP server router (39 tools, 10 modules)
│   │   ├── database/db.ts           # SQLite database layer
│   │   ├── database/schema.sql      # Database schema
│   │   ├── services/                # API importer, Lua parser, path validator
│   │   ├── tools/                   # 10 tool modules
│   │   └── types/                   # TypeScript type definitions
│   ├── package.json
│   └── tsconfig.json
├── data/
│   ├── eso_sets.db                  # SQLite database (generated)
│   └── api/ESOUIDocumentation.txt   # Official ESO API docs
├── scripts/
│   ├── import-all-sets.ts           # Import sets from LibSets
│   ├── import-api-docs.ts           # Import API docs from GitHub
│   └── scrape-set-bonuses.ts        # Scrape set bonuses from eso-hub.com
└── addon_Libs/                      # LibSets & LibSetDetection source data
```

## License

MIT

## Credits

- **[LibSets](https://www.esoui.com/downloads/info2241)** by Baertram — Set data, zones, wayshrines
- **[UESP](https://esoapi.uesp.net/)** — API function/event/constant data
- **[eso-hub.com](https://eso-hub.com/)** — Set bonus descriptions
- **[ESOUI Community](https://www.esoui.com/)** — Addon development guidelines and resources
- **[ZOS/Bethesda](https://www.elderscrollsonline.com/)** — Elder Scrolls Online
