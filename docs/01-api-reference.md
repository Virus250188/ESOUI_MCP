# API Reference Tools

The API Reference module provides 6 tools for searching and exploring the Elder Scrolls Online API, including functions, events, constants, UI controls, and source code navigation.

These tools query a local SQLite database populated with ESO API data from UESP and the official ESOUIDocumentation. The data includes typed function signatures, event parameters, constant values, and UI control information.

---

## search_api_functions

**Description:** Search ESO API functions by name, description, or signature. This tool searches **functions only** -- not events or constants. For events, use `search_events`. For a combined search across all API types, use `fetch_api_docs`.

Many ESO API functions have namespace prefixes like `ZO_`, `ZO_WorldMap_`, `ZO_Inventory_`. If your search returns no results, try a shorter substring (e.g., search `"NormalizedPoint"` instead of `"ZO_WorldMap_IsNormalizedPointInsideMapBounds"`).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search term for function names, descriptions, or signatures |
| category | string | No | Filter by API category (e.g., `"inventory"`, `"combat"`, `"ui"`) |
| namespace | string | No | Filter by namespace (e.g., `"SCENE_MANAGER"`, `"ZO_"`) |
| limit | number | No | Maximum number of results to return (default: 30) |

**Example Usage:**

```json
{
  "tool": "search_api_functions",
  "arguments": {
    "query": "GetItemLink",
    "category": "inventory",
    "limit": 10
  }
}
```

**Example Response:**

```json
{
  "count": 3,
  "functions": [
    {
      "name": "GetItemLink",
      "signature": "GetItemLink(bagId, slotIndex, linkStyle)",
      "category": "inventory",
      "namespace": null,
      "is_protected": false
    },
    {
      "name": "GetItemLinkItemId",
      "signature": "GetItemLinkItemId(itemLink)",
      "category": "inventory",
      "namespace": null,
      "is_protected": false
    },
    {
      "name": "GetItemLinkName",
      "signature": "GetItemLinkName(itemLink)",
      "category": "inventory",
      "namespace": null,
      "is_protected": false
    }
  ]
}
```

**Tips:**

- ESO API names use PascalCase (e.g., `GetItemLink`, not `getItemLink`).
- If you get no results, try a broader or shorter search term.
- Use the `namespace` filter to narrow results for ZOS utility classes (e.g., `"ZO_"` for ZeniMax Online utility functions).
- Protected functions (`is_protected: true`) cannot be called from addon code.

---

## get_function_details

**Description:** Get full details about a specific ESO API function including its signature, typed parameters, return values, description, source file, and related functions that share a similar prefix.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| function_name | string | Yes | The exact name of the API function to look up |

**Example Usage:**

```json
{
  "tool": "get_function_details",
  "arguments": {
    "function_name": "GetItemLink"
  }
}
```

**Example Response:**

```json
{
  "name": "GetItemLink",
  "namespace": null,
  "category": "inventory",
  "signature": "GetItemLink(bagId, slotIndex, linkStyle)",
  "parameters": [
    { "name": "bagId", "type": "Bag" },
    { "name": "slotIndex", "type": "integer" },
    { "name": "linkStyle", "type": "LinkStyle" }
  ],
  "return_values": [
    { "name": "link", "type": "string" }
  ],
  "description": "Returns the item link for the item at the given bag and slot.",
  "source_file": "inventory.lua",
  "is_protected": false,
  "api_version": "101048",
  "related_functions": [
    "GetItemLinkItemId",
    "GetItemLinkName",
    "GetItemLinkQuality",
    "GetItemLinkSetInfo"
  ]
}
```

**Tips:**

- The function name must be exact. If unsure of the spelling, use `search_api_functions` first.
- If the function is not found, the tool will suggest alternatives based on a fuzzy search.
- The `related_functions` list contains other functions with a matching prefix, which is useful for discovering related APIs.

---

## search_events

**Description:** Search ESO events by name or category. All ESO events start with the `EVENT_` prefix (e.g., `EVENT_ZONE_CHANGED`, `EVENT_COMBAT_EVENT`). This tool is separate from `search_api_functions`, which only searches functions.

Returns event names, categories, and typed parameter lists. 586 of 1025 events have full parameter definitions.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search term for event names or descriptions |
| category | string | No | Filter by event category |
| limit | number | No | Maximum number of results to return (default: 30) |

**Example Usage:**

```json
{
  "tool": "search_events",
  "arguments": {
    "query": "EVENT_INVENTORY",
    "limit": 5
  }
}
```

**Example Response:**

```json
{
  "count": 5,
  "events": [
    {
      "name": "EVENT_INVENTORY_SINGLE_SLOT_UPDATE",
      "category": "inventory",
      "parameters": [
        { "name": "bagId", "type": "Bag" },
        { "name": "slotIndex", "type": "integer" },
        { "name": "isNewItem", "type": "boolean" },
        { "name": "itemSoundCategory", "type": "ItemUISoundCategory" },
        { "name": "inventoryUpdateReason", "type": "InventoryUpdateReason" },
        { "name": "stackCountChange", "type": "integer" }
      ],
      "description": "Fired when a single inventory slot is updated."
    },
    {
      "name": "EVENT_INVENTORY_FULL_UPDATE",
      "category": "inventory",
      "parameters": [],
      "description": "Fired when the entire inventory is refreshed."
    }
  ]
}
```

**Tips:**

- Include the `EVENT_` prefix in your query for best results.
- You can also search by keyword (e.g., `"ZONE"`, `"COMBAT"`, `"GUILD"`).
- ESO events use `SCREAMING_SNAKE_CASE`.
- The first parameter of every event callback is always `eventCode` (a number), which is not included in the parameter list shown here.

---

## search_constants

**Description:** Search ESO constants and enums. When called with no parameters, returns a list of all available constant groups with their counts. Otherwise, filters constants by name or group.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | No | Search term for constant names |
| group_name | string | No | Filter by constant group/enum name |
| limit | number | No | Maximum number of results to return (default: 50) |

**Example Usage -- List all groups:**

```json
{
  "tool": "search_constants",
  "arguments": {}
}
```

**Example Usage -- Search by name:**

```json
{
  "tool": "search_constants",
  "arguments": {
    "query": "ITEM_QUALITY",
    "limit": 10
  }
}
```

**Example Usage -- Get all constants in a group:**

```json
{
  "tool": "search_constants",
  "arguments": {
    "group_name": "ItemQuality"
  }
}
```

**Example Response:**

```json
{
  "count": 6,
  "constants": [
    { "name": "ITEM_QUALITY_TRASH", "group_name": "ItemQuality", "value": "0", "value_type": "number" },
    { "name": "ITEM_QUALITY_NORMAL", "group_name": "ItemQuality", "value": "1", "value_type": "number" },
    { "name": "ITEM_QUALITY_MAGIC", "group_name": "ItemQuality", "value": "2", "value_type": "number" },
    { "name": "ITEM_QUALITY_ARCANE", "group_name": "ItemQuality", "value": "3", "value_type": "number" },
    { "name": "ITEM_QUALITY_ARTIFACT", "group_name": "ItemQuality", "value": "4", "value_type": "number" },
    { "name": "ITEM_QUALITY_LEGENDARY", "group_name": "ItemQuality", "value": "5", "value_type": "number" }
  ]
}
```

**Tips:**

- Call with no parameters to discover available constant groups -- this is the best way to explore.
- ESO constants use `SCREAMING_SNAKE_CASE` (e.g., `ITEM_QUALITY_LEGENDARY`).
- Group names help you find related constants (e.g., all values of an enum).

---

## get_ui_control_info

**Description:** Get information about ESO UI control types. If a specific `control_type` is provided, returns its methods, properties, and events. If omitted, returns a list of all available UI control types.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| control_type | string | No | The UI control type to look up (e.g., `"CT_LABEL"`, `"CT_BUTTON"`). Omit to list all control types. |

**Example Usage -- List all controls:**

```json
{
  "tool": "get_ui_control_info",
  "arguments": {}
}
```

**Example Usage -- Get specific control:**

```json
{
  "tool": "get_ui_control_info",
  "arguments": {
    "control_type": "CT_LABEL"
  }
}
```

**Example Response (specific control):**

```json
{
  "control_type": "CT_LABEL",
  "methods": [
    { "name": "SetText", "signature": "SetText(text)", "description": "Set the label text" },
    { "name": "GetText", "signature": "GetText()", "description": "Get the current label text" },
    { "name": "SetFont", "signature": "SetFont(fontString)", "description": "Set the font" }
  ],
  "properties": [],
  "events": [],
  "parent_type": "CT_CONTROL",
  "xml_element": "Label",
  "description": "A text label control."
}
```

**Tips:**

- Start by listing all controls to see what is available.
- Control types follow the `CT_` prefix convention (e.g., `CT_LABEL`, `CT_BUTTON`, `CT_EDITBOX`).
- The `parent_type` field tells you the inheritance chain -- child controls inherit all methods from their parent.
- The `xml_element` field tells you the corresponding XML tag name for use in `.xml` UI files.

---

## search_source_code

**Description:** Search for ESO source code by topic or pattern. Returns constructed search URLs for the UESP source browser and the esoui GitHub mirror, plus directory structure tips. Use this when you need to find **how** something is implemented in the ESO UI source code. For browsing specific files by path, use `fetch_esoui_source` instead.

The ESO UI source code is not stored locally. This tool helps you find it online.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | What you are looking for in the ESO source code |
| file_pattern | string | No | Optional file pattern to narrow the search (e.g., `"inventory"`, `"crafting"`) |

**Example Usage:**

```json
{
  "tool": "search_source_code",
  "arguments": {
    "query": "ZO_SortFilterList",
    "file_pattern": "libraries"
  }
}
```

**Example Response:**

```json
{
  "message": "The ESO UI source code is not stored locally, but you can search it online.",
  "query": "ZO_SortFilterList",
  "file_pattern": "libraries",
  "resources": [
    {
      "name": "UESP ESO API Source Browser",
      "url": "https://esoapi.uesp.net/current/src/",
      "description": "Complete browseable source tree of all ESO UI Lua and XML files. Updated each patch."
    },
    {
      "name": "esoui GitHub Repository",
      "url": "https://github.com/esoui/esoui",
      "description": "Community-maintained mirror of the ESO UI source code on GitHub."
    }
  ],
  "search_links": [
    "UESP Source Browser - search within files matching \"libraries\": https://esoapi.uesp.net/current/src/",
    "GitHub - search for \"ZO_SortFilterList\" in path \"libraries\": https://github.com/esoui/esoui/search?q=ZO_SortFilterList+path%3Alibraries"
  ],
  "tips": [
    "ESO UI source is written in Lua and XML",
    "Ingame files are organized under /esoui/ingame/<feature>/",
    "Library/utility code lives under /esoui/libraries/",
    "Public Lua files are under /esoui/publicallingames/",
    "Use search_api_functions or search_events to find API definitions before diving into source"
  ]
}
```

**Tips:**

- Use this tool when you want to understand how ZOS implements a particular feature.
- Combine with `search_api_functions` to find the relevant API definitions first, then look at the source for implementation details.
- The ESO UI codebase is organized by feature under `/esoui/ingame/<feature>/` -- knowing the feature area helps narrow your search.
- The GitHub search link allows code search across all files, which is more powerful than the UESP browser for keyword searches.
