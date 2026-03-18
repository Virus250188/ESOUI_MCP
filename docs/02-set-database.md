# Set Database & Build Tools

The Set Database module provides 7 tools for searching ESO equipment sets, getting detailed set information with bonus descriptions, comparing sets, getting farming guides, browsing sets by category, and receiving build recommendations.

The local database contains 669+ sets with bonus text, drop locations, zone associations, wayshrine data, and crafting requirements.

---

## search_sets

**Description:** Search for ESO equipment sets by name, type, DLC, or armor weight. Returns a list of matching sets with basic information.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | No | Search term for set names or descriptions |
| set_type | string | No | Filter by set type. One of: `"Overland"`, `"Dungeon"`, `"Trial"`, `"Arena"`, `"Crafted"`, `"Monster"`, `"Mythic"`, `"PvP"` |
| dlc_id | number | No | Filter by DLC ID (`0` for base game) |
| armor_weight | string | No | Filter by armor weight. One of: `"Light"`, `"Medium"`, `"Heavy"` |
| limit | number | No | Maximum number of results to return (default: 20) |

**Example Usage:**

```json
{
  "tool": "search_sets",
  "arguments": {
    "query": "Mother's Sorrow",
    "limit": 5
  }
}
```

**Example Usage -- Filter by type:**

```json
{
  "tool": "search_sets",
  "arguments": {
    "set_type": "Crafted",
    "limit": 10
  }
}
```

**Example Response:**

```json
{
  "count": 1,
  "sets": [
    {
      "set_id": 301,
      "name": "Mother's Sorrow",
      "set_type": "Overland",
      "dlc_name": "Base Game",
      "zone_name": "Deshaan",
      "max_equip_count": 5,
      "is_veteran": false
    }
  ]
}
```

**Tips:**

- Omit all parameters to browse sets freely.
- Combine filters for precise results (e.g., `set_type: "Crafted"` + `query: "law"`).
- Use `dlc_id: 0` to find base-game sets accessible to all players.

---

## get_set_details

**Description:** Get full details about a specific ESO set including all bonus descriptions (2-piece, 3-piece, 4-piece, 5-piece), drop locations, zone info, and drop mechanics. Covers 669+ sets with bonus text.

**Limitation:** Equipment type and armor weight data is not fully populated for all sets.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| set_id | number | No | The numeric set ID to retrieve |
| set_name | string | No | The set name to retrieve (must be close to exact) |

Provide either `set_id` or `set_name`. At least one is required.

**Example Usage:**

```json
{
  "tool": "get_set_details",
  "arguments": {
    "set_name": "Mother's Sorrow"
  }
}
```

**Example Response:**

```json
{
  "set": {
    "set_id": 301,
    "name": "Mother's Sorrow",
    "set_type": "Overland",
    "dlc_name": "Base Game",
    "max_equip_count": 5,
    "is_veteran": false,
    "traits_needed": null
  },
  "bonuses": [
    { "num_equipped": 2, "description": "Adds 1096 Maximum Magicka" },
    { "num_equipped": 3, "description": "Adds 657 Critical Chance" },
    { "num_equipped": 4, "description": "Adds 657 Critical Chance" },
    { "num_equipped": 5, "description": "Adds 2191 Critical Chance" }
  ],
  "locations": [
    { "zone_name": "Deshaan", "drop_mechanic": "Overland (World, Dolmen, Treasure Chest, etc.)" }
  ],
  "wayshrines": []
}
```

**Tips:**

- If you know the set ID, use `set_id` for the fastest lookup.
- `set_name` performs a name-based lookup -- spelling must be close to exact.
- The `bonuses` array shows what each piece count activates.
- `traits_needed` is populated for crafted sets (e.g., 6 or 9 traits required).

---

## update_character_context

**Description:** Store or update character information for personalized build recommendations. This creates a character profile in the local database that can be referenced by other tools like `recommend_builds`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| context_id | string | Yes | Unique ID for this character context (use UUID or username) |
| class | string | Yes | Character class. One of: `"Dragonknight"`, `"Sorcerer"`, `"Nightblade"`, `"Templar"`, `"Warden"`, `"Necromancer"`, `"Arcanist"` |
| level | number | No | Character level, 1-50 (default: 50) |
| role | string | No | Desired role. One of: `"DPS"`, `"Tank"`, `"Healer"`, `"PvP"` |
| build_goal | string | No | User-provided description of build goals |
| dlc_owned | string[] | No | List of owned DLCs |
| crafting_traits | object | No | Number of researched traits per craft: `{ blacksmithing?: 0-9, clothier?: 0-9, woodworking?: 0-9 }` |
| current_sets | string[] | No | Currently equipped set names |

**Example Usage:**

```json
{
  "tool": "update_character_context",
  "arguments": {
    "context_id": "player1-dk",
    "class": "Dragonknight",
    "level": 50,
    "role": "Tank",
    "build_goal": "Trials-ready tank build with self-sustain",
    "dlc_owned": ["Morrowind", "Summerset", "Elsweyr"],
    "crafting_traits": { "blacksmithing": 9, "clothier": 6, "woodworking": 9 },
    "current_sets": ["Ebon Armory", "Torug's Pact"]
  }
}
```

**Example Response:**

```json
{
  "success": true,
  "context_id": "player1-dk"
}
```

**Tips:**

- Choose a consistent `context_id` so you can update the same character over time.
- Setting `crafting_traits` helps `recommend_builds` suggest crafted sets you can actually make.
- The `current_sets` field lets recommendation tools avoid suggesting what you already have.

---

## recommend_builds

**Description:** Get build recommendations based on class, role, and other preferences.

**Limitation:** Currently uses simple template matching with a small number of pre-defined builds. Results may be limited for some class/role combinations. For comprehensive build advice, combine with `search_sets` and `compare_sets`.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| class | string | Yes | Character class. One of: `"Dragonknight"`, `"Sorcerer"`, `"Nightblade"`, `"Templar"`, `"Warden"`, `"Necromancer"`, `"Arcanist"` |
| role | string | Yes | Desired role. One of: `"DPS"`, `"Tank"`, `"Healer"`, `"PvP"` |
| resource | string | No | Primary resource type. One of: `"Magicka"`, `"Stamina"`, `"Hybrid"` |
| level | number | No | Character level (1-50) |
| dlc_owned | string[] | No | List of owned DLCs |
| include_trial_sets | boolean | No | Include trial sets in recommendations (default: false) |
| max_crafting_traits | number | No | Maximum crafting traits available, 0-9 (default: 9) |

**Example Usage:**

```json
{
  "tool": "recommend_builds",
  "arguments": {
    "class": "Sorcerer",
    "role": "DPS",
    "resource": "Magicka",
    "include_trial_sets": false,
    "max_crafting_traits": 6
  }
}
```

**Example Response:**

```json
{
  "message": "Build recommendations based on templates",
  "templates": [
    {
      "name": "Magicka Sorcerer DPS - Beginner",
      "sets": ["Mother's Sorrow", "Julianos"],
      "monster_set": "Ilambris",
      "mythic": null,
      "notes": "Easy to obtain, strong for all content."
    }
  ],
  "note": "This is using simple template matching. Full recommendation engine coming soon."
}
```

**Tips:**

- Set `include_trial_sets: false` if the player does not run trials.
- Use `max_crafting_traits` to exclude crafted sets the player cannot make yet.
- Combine this tool with `search_sets` and `compare_sets` for deeper analysis.

---

## compare_sets

**Description:** Compare 2 to 4 equipment sets side-by-side, showing bonuses, farming difficulty, and accessibility.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| set_ids | number[] | Yes | Array of set IDs to compare (minimum 2, maximum 4) |

**Example Usage:**

```json
{
  "tool": "compare_sets",
  "arguments": {
    "set_ids": [301, 79]
  }
}
```

**Example Response:**

```json
{
  "sets": [
    {
      "set": {
        "set_id": 301,
        "name": "Mother's Sorrow",
        "set_type": "Overland",
        "dlc_name": "Base Game"
      },
      "bonuses": [
        { "num_equipped": 2, "description": "Adds 1096 Maximum Magicka" },
        { "num_equipped": 5, "description": "Adds 2191 Critical Chance" }
      ],
      "locations": [{ "zone_name": "Deshaan" }]
    },
    {
      "set": {
        "set_id": 79,
        "name": "Law of Julianos",
        "set_type": "Crafted",
        "dlc_name": "Base Game",
        "traits_needed": 6
      },
      "bonuses": [
        { "num_equipped": 2, "description": "Adds 657 Critical Chance" },
        { "num_equipped": 5, "description": "Adds 300 Spell Damage" }
      ],
      "locations": [{ "zone_name": "Wrothgar" }]
    }
  ]
}
```

**Tips:**

- Use `search_sets` first to find the set IDs you want to compare.
- Comparing overland vs. crafted vs. dungeon sets helps players decide what to farm based on accessibility.
- Compare 3-4 sets when choosing between multiple options for the same gear slot category.

---

## get_farming_guide

**Description:** Get a detailed farming guide for a specific set including locations, wayshrines, requirements, and efficiency tips.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| set_id | number | No | The numeric set ID |
| set_name | string | No | The set name |

Provide either `set_id` or `set_name`. At least one is required.

**Example Usage:**

```json
{
  "tool": "get_farming_guide",
  "arguments": {
    "set_name": "Briarheart"
  }
}
```

**Example Response:**

```json
{
  "set": {
    "set_id": 357,
    "name": "Briarheart",
    "set_type": "Overland",
    "dlc_name": "Orsinium"
  },
  "locations": [
    { "zone_name": "Wrothgar", "drop_mechanic": "Overland (World, Dolmen, Treasure Chest, etc.)" }
  ],
  "wayshrines": [],
  "requirements": {
    "dlc": "Orsinium",
    "veteran_mode": false,
    "group_content": false,
    "traits_needed": null
  },
  "drop_mechanics": ["Overland (World, Dolmen, Treasure Chest, etc.)"],
  "efficiency_tips": [
    "Farm this by running the associated content repeatedly.",
    "Available in normal mode."
  ]
}
```

**Tips:**

- The `requirements` section tells you whether you need DLC, veteran mode, or a group.
- Crafted sets will show `traits_needed` and suggest finding a crafting station or guild crafter.
- Overland sets drop from world bosses, delve bosses, dolmens, treasure chests, and random enemies in the zone.

---

## get_set_by_category

**Description:** Browse sets by predefined curated categories such as beginner-friendly sets, endgame DPS sets, PvP meta sets, and more.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| category | string | Yes | Predefined category. One of: `"beginner_friendly"`, `"endgame_dps"`, `"pvp_meta"`, `"crafted_6_trait"`, `"crafted_9_trait"`, `"monster_sets"`, `"mythic_items"` |

**Example Usage:**

```json
{
  "tool": "get_set_by_category",
  "arguments": {
    "category": "beginner_friendly"
  }
}
```

**Example Response:**

```json
{
  "category": "beginner_friendly",
  "sets": [
    {
      "set_id": 301,
      "name": "Mother's Sorrow",
      "set_type": "Overland",
      "dlc_name": "Base Game"
    },
    {
      "set_id": 79,
      "name": "Law of Julianos",
      "set_type": "Crafted",
      "dlc_name": "Base Game"
    }
  ]
}
```

**Tips:**

- `beginner_friendly` -- sets easy to obtain that work well for new players.
- `endgame_dps` -- top-tier DPS sets for trials and veteran content.
- `pvp_meta` -- current PvP meta sets.
- `crafted_6_trait` and `crafted_9_trait` -- crafted sets filtered by trait requirement.
- `monster_sets` -- 2-piece sets from dungeon final bosses and Undaunted chests.
- `mythic_items` -- powerful 1-piece mythic items.
