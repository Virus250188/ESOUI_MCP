# Character Import & Management Tools

The Character module provides 4 tools for importing ESO characters from the game client's SavedVariables, listing imported characters, syncing character data, and viewing detailed character information including equipped sets.

These tools rely on the **ESOBuildTracker** addon being installed in ESO. The addon saves character data (class, level, race, equipped gear, sets, attributes, stats) to a SavedVariables file that this MCP server can read.

---

## Prerequisites

Before using these tools, you must:

1. **Install the ESOBuildTracker addon** in ESO.
2. **Log in** to the game with each character you want to import (at least once).
3. **Close ESO** before importing -- SavedVariables are only written to disk when ESO exits or during a loading screen.
4. The MCP server must have **filesystem access** to the ESO Documents folder (default: `Documents/Elder Scrolls Online/live/SavedVariables/`).

---

## import_character_from_game

**Description:** Import all characters from ESO SavedVariables. Reads the `ESOBuildTrackerData.lua` file from the SavedVariables folder and imports every character found into the local database.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| saved_vars_path | string | No | Custom path to SavedVariables folder. Defaults to `Documents/Elder Scrolls Online/live/SavedVariables/` |

**Example Usage -- Default path:**

```json
{
  "tool": "import_character_from_game",
  "arguments": {}
}
```

**Example Usage -- Custom path:**

```json
{
  "tool": "import_character_from_game",
  "arguments": {
    "saved_vars_path": "D:/Games/ESO/live/SavedVariables"
  }
}
```

**Example Response:**

```json
{
  "success": true,
  "imported_count": 3,
  "characters": [
    { "name": "Khajiit Has Wares", "class": "Nightblade", "level": 50, "equipped_sets_count": 3 },
    { "name": "Flame Warden", "class": "Dragonknight", "level": 50, "equipped_sets_count": 2 },
    { "name": "Holy Light", "class": "Templar", "level": 32, "equipped_sets_count": 1 }
  ]
}
```

**Error Response (path not found):**

```json
{
  "error": "SavedVariables path not found",
  "path": "C:\\Users\\Player\\Documents\\Elder Scrolls Online\\live\\SavedVariables",
  "help": "Make sure ESOBuildTracker addon is installed and you have logged in with your characters."
}
```

**Tips:**

- Run this once after closing ESO to pull in all your characters.
- If no characters are found, verify: (1) ESOBuildTracker is installed and activated, (2) you have logged in with your characters, (3) ESO is fully closed.
- Re-running this will update existing characters with fresh data.

**Requirements:**

- ESOBuildTracker addon installed and activated in ESO.
- Characters must have been logged in at least once with the addon active.
- ESO must be closed (SavedVariables are written on exit).
- Filesystem access to the ESO Documents folder.

---

## list_my_characters

**Description:** List all previously imported ESO characters with their basic info and equipped sets count. Characters must have been imported first using `import_character_from_game`.

**Parameters:**

This tool takes no parameters.

**Example Usage:**

```json
{
  "tool": "list_my_characters",
  "arguments": {}
}
```

**Example Response:**

```json
{
  "total": 3,
  "characters": [
    {
      "context_id": "char_khajiit_has_wares",
      "character_name": "Khajiit Has Wares",
      "class": "Nightblade",
      "level": 50,
      "race": "Khajiit",
      "alliance": "Aldmeri Dominion",
      "equipped_sets_count": 3,
      "last_synced": "2025-05-15T10:30:00Z"
    },
    {
      "context_id": "char_flame_warden",
      "character_name": "Flame Warden",
      "class": "Dragonknight",
      "level": 50,
      "race": "Nord",
      "alliance": "Ebonheart Pact",
      "equipped_sets_count": 2,
      "last_synced": "2025-05-15T10:30:00Z"
    }
  ]
}
```

**Tips:**

- Use this to quickly see which characters are available in the database.
- If the list is empty, run `import_character_from_game` first.
- The `context_id` can be used with other tools that reference character contexts.

---

## sync_character

**Description:** Re-sync a specific character from ESO SavedVariables to update their equipped sets and info. Use this to refresh a single character's data without re-importing all characters.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| character_name | string | Yes | Name of the character to sync (case-insensitive) |
| saved_vars_path | string | No | Custom SavedVariables path (optional, uses default if not provided) |

**Example Usage:**

```json
{
  "tool": "sync_character",
  "arguments": {
    "character_name": "Khajiit Has Wares"
  }
}
```

**Example Response:**

```json
{
  "success": true,
  "character_name": "Khajiit Has Wares",
  "context_id": "char_khajiit_has_wares",
  "equipped_sets_count": 3
}
```

**Error Response (character not found):**

```json
{
  "error": "Character not found",
  "available_characters": ["Khajiit Has Wares", "Flame Warden", "Holy Light"]
}
```

**Tips:**

- Use this after re-logging a character to pick up gear changes.
- The character name match is case-insensitive.
- If the character is not found, check the `available_characters` list in the error response.

**Requirements:**

- Same as `import_character_from_game` -- ESOBuildTracker addon, recent login, ESO closed.

---

## get_character_details

**Description:** Get detailed information about a specific imported character including all equipped sets, gear, attributes, stats, and more. The character must have been imported first using `import_character_from_game`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| character_name | string | Yes | Name of the character |

**Example Usage:**

```json
{
  "tool": "get_character_details",
  "arguments": {
    "character_name": "Flame Warden"
  }
}
```

**Example Response:**

```json
{
  "character": {
    "character_name": "Flame Warden",
    "account_name": "@PlayerAccount",
    "class": "Dragonknight",
    "level": 50,
    "race": "Nord",
    "alliance": "Ebonheart Pact",
    "attributes": {
      "health": 20000,
      "magicka": 10000,
      "stamina": 30000
    },
    "champion_points": 1200,
    "mundus_stone": "The Shadow"
  },
  "equipped_sets": [
    {
      "set_name": "Ebon Armory",
      "slot_category": "body",
      "pieces_equipped": 5
    },
    {
      "set_name": "Torug's Pact",
      "slot_category": "weapons",
      "pieces_equipped": 3
    }
  ]
}
```

**Tips:**

- Use this before `recommend_builds` to understand the character's current setup.
- The equipped sets data shows what the character was wearing when last synced.
- If the character is not found, use `list_my_characters` to see available characters.
- Combine with `compare_sets` to evaluate whether current sets are optimal.
