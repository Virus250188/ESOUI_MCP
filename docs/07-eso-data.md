# ESO Game Data Tools

The ESO Data module provides 5 tools for searching game world data including zones, skills, patch notes, combined API documentation search, and ESO UI source code browsing.

---

## search_zones

**Description:** Search ESO zones by name and type, including associated gear sets that drop in each zone. Each zone result is enriched with the list of equipment sets available from that zone.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search term for zone names |
| zone_type | string | No | Filter by zone type. One of: `"Overland"`, `"Dungeon"`, `"Trial"`, `"Arena"`, `"PvP"`, `"Housing"` |

**Example Usage:**

```json
{
  "tool": "search_zones",
  "arguments": {
    "query": "Deshaan"
  }
}
```

**Example Usage -- Filter by type:**

```json
{
  "tool": "search_zones",
  "arguments": {
    "query": "Lair",
    "zone_type": "Dungeon"
  }
}
```

**Example Response:**

```json
{
  "total": 1,
  "zones": [
    {
      "zone_id": 57,
      "name": "Deshaan",
      "zone_type": "Overland",
      "dlc_name": "Base Game",
      "sets": [
        { "set_id": 301, "name": "Mother's Sorrow", "set_type": "Overland", "is_veteran": false },
        { "set_id": 99, "name": "Night Mother's Gaze", "set_type": "Overland", "is_veteran": false },
        { "set_id": 160, "name": "Plague Doctor", "set_type": "Overland", "is_veteran": false }
      ],
      "sets_count": 3
    }
  ]
}
```

**Tips:**

- This is the best tool for answering "what sets can I farm in zone X?"
- Combine with `get_set_details` to drill into specific sets found in a zone.
- Dungeon zones typically drop a light, medium, and heavy set each.
- Overland zones drop three sets obtainable from world bosses, dolmens, delves, and treasure chests.

---

## search_skills

**Description:** Search for ESO skill information. Note that skill data (names, morphs, costs, descriptions) is NOT available in the local database -- it can only be extracted from the ESO game client. This tool provides links to external skill resources and relevant API function references.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search term for skill names |
| class | string | No | Character class to filter by (e.g., `"Dragonknight"`, `"Sorcerer"`) |
| skill_line | string | No | Skill line to filter by (e.g., `"Ardent Flame"`, `"Two Handed"`) |

**Example Usage:**

```json
{
  "tool": "search_skills",
  "arguments": {
    "query": "flame",
    "class": "Dragonknight"
  }
}
```

**Example Response:**

```json
{
  "message": "Skill data is not yet available in the local database. Here are resources for looking up skills:",
  "resources": {
    "uesp_skill_browser": "http://esoitem.uesp.net/viewSkills.php",
    "uesp_skill_calculator": "https://en.uesp.net/wiki/Special:EsoSkills",
    "esoui_wiki": "https://wiki.esoui.com/Skill_functions"
  },
  "api_functions_for_skills": {
    "get_name": "GetAbilityName(abilityId) - Returns the name of an ability by its ID",
    "get_description": "GetAbilityDescription(abilityId) - Returns ability description text",
    "get_icon": "GetAbilityIcon(abilityId) - Returns the icon texture path",
    "get_cost": "GetAbilityCost(abilityId) - Returns cost, mechanic, and cost mechanic",
    "get_range": "GetAbilityRange(abilityId) - Returns max range",
    "get_duration": "GetAbilityDuration(abilityId) - Returns duration in ms",
    "is_passive": "IsAbilityPassive(abilityId) - Returns boolean",
    "get_skill_line": "GetSkillLineInfo(skillType, skillLineIndex) - Returns skill line info",
    "get_ability_by_index": "GetSkillAbilityInfo(skillType, skillLineIndex, abilityIndex) - Returns ability info"
  },
  "search_query": "flame",
  "class_skill_lines": {
    "class": "Dragonknight",
    "skill_lines": ["Ardent Flame", "Draconic Power", "Earthen Heart"]
  },
  "all_skill_line_categories": {
    "class_skills": {
      "Dragonknight": ["Ardent Flame", "Draconic Power", "Earthen Heart"],
      "Sorcerer": ["Storm Calling", "Dark Magic", "Daedric Summoning"]
    },
    "weapon_skills": ["Two Handed", "One Hand and Shield", "Dual Wield", "Bow", "Destruction Staff", "Restoration Staff"],
    "guild_skills": ["Fighters Guild", "Mages Guild", "Undaunted", "Psijic Order", "Dark Brotherhood", "Thieves Guild"],
    "other": ["Assault (PvP)", "Support (PvP)", "Soul Magic", "Werewolf", "Vampire", "Scribing"]
  }
}
```

**Tips:**

- This tool is most useful for its API function references -- use the skill-related API functions to query skill data from within your addon.
- The external links (UESP Skill Browser, Skill Calculator) are the best resources for human-readable skill data.
- When filtering by `class`, the response includes the class's three skill lines.
- All seven classes are supported: Dragonknight, Sorcerer, Nightblade, Templar, Warden, Necromancer, Arcanist.

**Limitation:** Full skill data is not in the local database. This tool provides reference links and API function guidance instead.

---

## get_patch_notes_summary

**Description:** Get information about the currently loaded API version, database statistics, and links to official patch notes and changelogs. Use this to verify what data is loaded and check if updates are needed after an ESO patch.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| api_version | string | No | Specific API version to look up (e.g., `"101048"`) |

**Example Usage -- Check current data:**

```json
{
  "tool": "get_patch_notes_summary",
  "arguments": {}
}
```

**Example Usage -- Query specific version:**

```json
{
  "tool": "get_patch_notes_summary",
  "arguments": {
    "api_version": "101049"
  }
}
```

**Example Response:**

```json
{
  "current_data": {
    "api_version": "101048",
    "sets_import_date": "2025-05-10T14:30:00Z",
    "sets_source": "LibSets",
    "api_docs_import_date": "2025-05-10T14:35:00Z",
    "api_docs_source": "GitHub esoui/esoui"
  },
  "database_stats": {
    "api_functions": 6842,
    "api_events": 1025,
    "api_constants": 12543
  },
  "resources": {
    "uesp_changelog": "https://esoapi.uesp.net/current/changelog.txt",
    "uesp_api_docs": "https://esoapi.uesp.net/",
    "official_forums": "https://forums.elderscrollsonline.com/en/categories/patch-notes",
    "esoui_wiki_api": "https://wiki.esoui.com/API"
  },
  "notes": [
    "The UESP changelog contains detailed API changes between versions.",
    "Check the official ESO forums for full patch notes including gameplay changes.",
    "API version changes may deprecate or rename functions - always verify after updates."
  ]
}
```

**Tips:**

- Run this after an ESO patch to check if the MCP server data is still current.
- If `api_version` does not match the latest ESO patch, run `update_database` to refresh.
- The `database_stats` section shows how much data is loaded -- useful for verifying imports completed successfully.
- The external links point to the most authoritative sources for ESO API changes.

---

## fetch_api_docs

**Description:** Combined search across ALL ESO API types -- functions, events, AND constants in one query. This is the **recommended first search** tool when you are not sure whether something is a function, event, or constant. Returns top results from each category.

More convenient than calling `search_api_functions`, `search_events`, and `search_constants` separately.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search term across functions, events, and constants |

**Example Usage:**

```json
{
  "tool": "fetch_api_docs",
  "arguments": {
    "query": "inventory"
  }
}
```

**Example Response:**

```json
{
  "query": "inventory",
  "total_results": 35,
  "functions": [
    {
      "name": "GetBagSize",
      "namespace": null,
      "category": "inventory",
      "signature": "GetBagSize(bagId)",
      "parameters": "[{\"name\":\"bagId\",\"type\":\"Bag\"}]",
      "return_values": "[{\"name\":\"size\",\"type\":\"integer\"}]",
      "description": "Returns the number of slots in a bag.",
      "is_protected": false
    }
  ],
  "events": [
    {
      "name": "EVENT_INVENTORY_SINGLE_SLOT_UPDATE",
      "category": "inventory",
      "parameters": "[{\"name\":\"bagId\",\"type\":\"Bag\"},{\"name\":\"slotIndex\",\"type\":\"integer\"}]",
      "description": "Fired when a single inventory slot changes."
    }
  ],
  "constants": [
    {
      "name": "BAG_BACKPACK",
      "group_name": "Bag",
      "value": "1",
      "description": null
    }
  ],
  "online_resources": {
    "uesp_api": "https://esoapi.uesp.net/",
    "esoui_wiki": "https://wiki.esoui.com/API",
    "esoui_wiki_events": "https://wiki.esoui.com/Events",
    "esoui_wiki_constants": "https://wiki.esoui.com/Constants"
  }
}
```

**Tips:**

- Start here when you do not know whether your search target is a function, event, or constant.
- Returns up to 15 functions, 10 events, and 15 constants per query.
- If results are too broad, switch to the specific tools (`search_api_functions`, `search_events`, `search_constants`) for more control.
- PascalCase partial matches work well (e.g., `"Combat"` finds both `GetCombatMechanicName` and `EVENT_COMBAT_EVENT`).

---

## fetch_esoui_source

**Description:** Get direct URLs to specific ESO UI source files on UESP or GitHub. Use this when you know **which file** you need (e.g., `"ingame/inventory/inventory.lua"`). For searching by topic/keyword, use `search_source_code` instead. Also provides a directory structure guide of the ESO UI codebase.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file_path | string | No | Specific source file path to get a direct link (e.g., `"ingame/map/worldmap.lua"`) |
| search_query | string | No | Search term to help find relevant source files |

Both parameters are optional. If neither is provided, the tool returns the full directory structure guide.

**Example Usage -- Get direct link:**

```json
{
  "tool": "fetch_esoui_source",
  "arguments": {
    "file_path": "ingame/inventory/inventory.lua"
  }
}
```

**Example Usage -- Search by topic:**

```json
{
  "tool": "fetch_esoui_source",
  "arguments": {
    "search_query": "crafting station"
  }
}
```

**Example Response (with file_path):**

```json
{
  "source_browsers": {
    "uesp": {
      "base_url": "https://esoapi.uesp.net/current/src/",
      "description": "UESP hosts the decompiled ESO UI source."
    },
    "github": {
      "base_url": "https://github.com/esoui/esoui/tree/master",
      "description": "Community-maintained GitHub mirror."
    }
  },
  "key_directories": {
    "ingame/": "Main in-game UI code (map, inventory, chat, combat, etc.)",
    "libraries/": "ZOS shared UI libraries (ZO_SortFilterList, ZO_Tree, ZO_ScrollList, etc.)",
    "common/": "Common utilities (ZO_ColorDef, ZO_LinkHandler, etc.)",
    "pregame/": "Character creation, login screen, server select",
    "pregameandingame/": "Code shared between pregame and ingame",
    "publicallingame/": "Public API wrappers accessible to addons",
    "internalingame/": "Internal game systems not typically accessible to addons"
  },
  "direct_links": {
    "uesp": "https://esoapi.uesp.net/current/src/ingame/inventory/inventory.lua",
    "github": "https://github.com/esoui/esoui/tree/master/ingame/inventory/inventory.lua"
  },
  "requested_file": "ingame/inventory/inventory.lua",
  "useful_files": {
    "inventory": "ingame/inventory/ - Inventory, bank, guild bank UI",
    "map": "ingame/map/ - World map, zone map, and minimap",
    "combat": "ingame/combat/ - Combat text, buff tracker, death recap",
    "crafting": "ingame/crafting/ - All crafting station UIs",
    "tooltip": "ingame/tooltip/ - Tooltip creation and formatting"
  },
  "tips": [
    "ESO UI source is written in Lua and XML. Lua files contain logic, XML files define layouts.",
    "Most addon-accessible functions are in the ingame/ directory.",
    "The libraries/ directory contains reusable base classes you can inherit from in addons.",
    "Search for EVENT_MANAGER:RegisterForEvent to see how ZOS handles events internally.",
    "ZO_ prefix indicates ZeniMax Online utility functions/classes available to addons."
  ]
}
```

**Key directories reference:**

| Directory | Contents |
|-----------|----------|
| `ingame/` | Main in-game UI: map, inventory, chat, combat, crafting, guild, trading, etc. |
| `libraries/` | ZOS shared libraries: `ZO_SortFilterList`, `ZO_Tree`, `ZO_ScrollList`, `ZO_Object` |
| `common/` | Common utilities: `ZO_ColorDef`, `ZO_LinkHandler`, `ZO_StringUtils` |
| `pregame/` | Character creation, login screen, server selection |
| `pregameandingame/` | Shared code: options, settings, currency formatting |
| `publicallingame/` | Public API wrappers accessible to addons |
| `internalingame/` | Internal game systems (not accessible to addons) |

**Tips:**

- Use `file_path` when you know the exact file (e.g., from a `source_file` field returned by `get_function_details`).
- Use `search_query` when you know the feature area but not the exact file.
- When `search_query` is provided, the tool also searches the local API database for related functions and shows their source files.
- The UESP source browser is best for reading full files. GitHub is better for searching across all files.
