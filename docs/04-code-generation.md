# Code Generation Tools

The Code Generation module provides 5 tools for generating production-ready ESO addon Lua and XML code. These tools produce code snippets for event handlers, LibAddonMenu-2.0 settings panels, slash commands, UI XML layouts, and SavedVariables initialization.

All generated code follows ESO addon development best practices and uses correct API patterns.

---

## generate_event_handler

**Description:** Generate Lua code for registering and handling an ESO event, with proper parameter signatures looked up from the API database. Supports event filters like unit tags.

When the event is found in the database, the handler function will include the correct typed parameter names. If the event is not found, a generic `eventCode, ...` signature is used.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| event_name | string | Yes | The ESO event name (e.g., `"EVENT_PLAYER_ACTIVATED"`) |
| addon_name | string | Yes | The addon name to use for event registration (must be a valid Lua identifier) |
| handler_name | string | No | Custom handler function name (auto-generated from event name if omitted) |
| namespace | string | No | Namespace table to attach the handler to (e.g., `"MyAddon"`) |
| filter_param | object | No | Event filter parameters: `{ unit_tag?: string }` |

**Example Usage -- Basic:**

```json
{
  "tool": "generate_event_handler",
  "arguments": {
    "event_name": "EVENT_PLAYER_ACTIVATED",
    "addon_name": "MyAddon"
  }
}
```

**Example Usage -- With namespace and filter:**

```json
{
  "tool": "generate_event_handler",
  "arguments": {
    "event_name": "EVENT_COMBAT_EVENT",
    "addon_name": "CombatTracker",
    "namespace": "CombatTracker",
    "filter_param": { "unit_tag": "player" }
  }
}
```

**Example Response:**

```json
{
  "code": "-- Event handler for EVENT_PLAYER_ACTIVATED\nlocal function OnPlayerActivated(eventCode)\n    -- Handle EVENT_PLAYER_ACTIVATED\nend\n\nEVENT_MANAGER:RegisterForEvent(\"MyAddon\", EVENT_PLAYER_ACTIVATED, OnPlayerActivated)",
  "event_found_in_db": true,
  "event_info": { "category": "player", "api_version": "101048" },
  "note": "Event parameter signature was sourced from the API database."
}
```

**Generated code (formatted):**

```lua
-- Event handler for EVENT_PLAYER_ACTIVATED
local function OnPlayerActivated(eventCode)
    -- Handle EVENT_PLAYER_ACTIVATED
end

EVENT_MANAGER:RegisterForEvent("MyAddon", EVENT_PLAYER_ACTIVATED, OnPlayerActivated)
```

**With filter:**

```lua
-- Event handler for EVENT_COMBAT_EVENT
function CombatTracker.OnCombatEvent(eventCode, result, isError, abilityName, ...)
    -- Handle EVENT_COMBAT_EVENT
end

EVENT_MANAGER:RegisterForEvent("CombatTracker", EVENT_COMBAT_EVENT, CombatTracker.OnCombatEvent)
EVENT_MANAGER:AddFilterForEvent("CombatTracker", EVENT_COMBAT_EVENT, REGISTER_FILTER_UNIT_TAG, "player")
```

**Tips:**

- If the event is in the database, parameter names and types are automatically included as comments.
- The `namespace` parameter attaches the handler to a table (e.g., `MyAddon.OnPlayerActivated`) instead of making it a local function.
- Use `filter_param.unit_tag` to filter events for only the player (avoids unnecessary callback invocations).
- Handler names are auto-generated from event names: `EVENT_PLAYER_ACTIVATED` becomes `OnPlayerActivated`.

---

## generate_settings_panel

**Description:** Generate a complete LibAddonMenu-2.0 settings panel with checkboxes, sliders, dropdowns, editboxes, colorpickers, headers, and descriptions. Returns Lua code ready to use.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_name | string | Yes | The addon name (must be a valid Lua identifier) |
| panel_name | string | No | Display name for the settings panel (defaults to addon name) |
| settings | array | Yes | Array of setting definitions (see below) |

**Setting object properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| type | string | Yes | One of: `"checkbox"`, `"slider"`, `"editbox"`, `"dropdown"`, `"colorpicker"`, `"header"`, `"description"` |
| name | string | Yes | Display name for the setting |
| tooltip | string | No | Tooltip text shown on hover |
| default_value | any | Yes | Default value for the setting |
| min | number | No | Minimum value (for slider) |
| max | number | No | Maximum value (for slider) |
| step | number | No | Step value (for slider) |
| choices | string[] | No | List of choices (for dropdown) |

**Example Usage:**

```json
{
  "tool": "generate_settings_panel",
  "arguments": {
    "addon_name": "MyAddon",
    "panel_name": "My Addon Settings",
    "settings": [
      { "type": "header", "name": "General", "default_value": null },
      { "type": "checkbox", "name": "Enable Notifications", "tooltip": "Show notification popups", "default_value": true },
      { "type": "slider", "name": "Opacity", "tooltip": "Window opacity", "default_value": 80, "min": 0, "max": 100, "step": 5 },
      { "type": "dropdown", "name": "Theme", "default_value": "Dark", "choices": ["Dark", "Light", "Classic"] },
      { "type": "colorpicker", "name": "Highlight Color", "default_value": [1, 0.5, 0, 1] }
    ]
  }
}
```

**Example Response:**

```json
{
  "code": "-- MyAddon Settings Panel (LibAddonMenu-2.0)\n\nlocal LAM = LibAddonMenu2\n\nlocal defaults = {\n    enableNotifications = true,\n    opacity = 80,\n    theme = \"Dark\",\n    highlightColor = {1, 0.5, 0, 1},\n}\n\n...",
  "requires": ["LibAddonMenu-2.0"]
}
```

**Tips:**

- The `requires` field reminds you to add `LibAddonMenu-2.0>=41` to `## DependsOn` in your addon manifest.
- Setting keys are auto-generated from display names (e.g., `"Enable Notifications"` becomes `enableNotifications`).
- `header` and `description` types create visual separators and are not stored as settings.
- The generated code assumes `addon_name.savedVariables` is already initialized via `ZO_SavedVars`.

**Requirements:**

- LibAddonMenu-2.0 must be installed as a dependency in ESO.

---

## generate_slash_command

**Description:** Generate Lua code for registering a slash command with optional subcommand routing, help text, and argument parsing.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| command | string | Yes | The slash command string (e.g., `"/myaddon"`) |
| addon_name | string | Yes | The addon name (must be a valid Lua identifier) |
| subcommands | array | No | Optional array of subcommand definitions |

**Subcommand object properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| name | string | Yes | Subcommand name |
| description | string | Yes | Description of what this subcommand does |
| handler_hint | string | Yes | Hint for the handler code (function name or inline code) |

**Example Usage -- Simple command:**

```json
{
  "tool": "generate_slash_command",
  "arguments": {
    "command": "/myaddon",
    "addon_name": "MyAddon"
  }
}
```

**Example Usage -- With subcommands:**

```json
{
  "tool": "generate_slash_command",
  "arguments": {
    "command": "/tracker",
    "addon_name": "CombatTracker",
    "subcommands": [
      { "name": "start", "description": "Start tracking combat", "handler_hint": "CombatTracker:StartTracking()" },
      { "name": "stop", "description": "Stop tracking combat", "handler_hint": "CombatTracker:StopTracking()" },
      { "name": "report", "description": "Show combat report", "handler_hint": "CombatTracker:ShowReport()" }
    ]
  }
}
```

**Generated code (with subcommands):**

```lua
-- Slash command registration for CombatTracker

SLASH_COMMANDS["/tracker"] = function(args)
    local command, rest = zo_strsplit(" ", args)
    command = (command or ""):lower()

    if command == "start" then
        -- Start tracking combat
        CombatTracker:StartTracking()
    elseif command == "stop" then
        -- Stop tracking combat
        CombatTracker:StopTracking()
    elseif command == "report" then
        -- Show combat report
        CombatTracker:ShowReport()
    elseif command == "help" or command == "" then
        d("[CombatTracker] Available commands:")
        d("  /tracker start - Start tracking combat")
        d("  /tracker stop - Stop tracking combat")
        d("  /tracker report - Show combat report")
        d("  /tracker help - Show this help")
    else
        d("[CombatTracker] Unknown command: " .. command .. ". Use /tracker help.")
    end
end
```

**Tips:**

- The `/` prefix is added automatically if you omit it from the command string.
- With subcommands, an automatic `help` subcommand is included that lists all available subcommands.
- The `handler_hint` is inserted directly as code -- it can be a function call or inline Lua.
- Without subcommands, a simple command handler with argument parsing is generated.

---

## generate_ui_xml

**Description:** Generate valid ESO UI XML for various control types. Supports 8 element types with configurable dimensions, anchors, and event handlers.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| element_type | string | Yes | One of: `"toplevelcontrol"`, `"button"`, `"label"`, `"editbox"`, `"scrolllist"`, `"dialog"`, `"tooltip"`, `"backdrop"` |
| name | string | Yes | Name for the XML control |
| dimensions | object | No | `{ width: number, height: number }` (defaults to 400x300) |
| anchors | array | No | Array of anchor definitions (defaults to `[{ point: "CENTER" }]`) |
| handlers | string[] | No | List of event handler names (e.g., `"OnMouseDown"`, `"OnClicked"`) |

**Anchor object properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| point | string | Yes | Anchor point (e.g., `"CENTER"`, `"TOPLEFT"`, `"BOTTOMRIGHT"`) |
| relativeTo | string | No | Relative control name |
| relativePoint | string | No | Relative point on the other control |
| offsetX | number | No | X offset in pixels |
| offsetY | number | No | Y offset in pixels |

**Example Usage:**

```json
{
  "tool": "generate_ui_xml",
  "arguments": {
    "element_type": "toplevelcontrol",
    "name": "MyAddonWindow",
    "dimensions": { "width": 500, "height": 400 },
    "anchors": [{ "point": "CENTER" }]
  }
}
```

**Example Response (formatted):**

```xml
<GuiXml>
    <Controls>
        <TopLevelControl name="MyAddonWindow" hidden="true" movable="true"
                         mouseEnabled="true" clampedToScreen="true">
            <Dimensions x="500" y="400" />
            <Anchor point="CENTER" />
            <Controls>
                <Backdrop name="$(parent)BG" inherits="ZO_DefaultBackdrop">
                    <AnchorFill />
                </Backdrop>
                <Label name="$(parent)Title" font="ZoFontWinH2" color="FFFFFF"
                       horizontalAlignment="CENTER">
                    <Anchor point="TOP" offsetY="10" />
                    <Dimensions x="480" y="30" />
                </Label>
                <Button name="$(parent)CloseButton" inherits="ZO_CloseButton">
                    <Anchor point="TOPRIGHT" offsetX="-5" offsetY="5" />
                    <OnClicked>
                        MyAddonWindow:SetHidden(true)
                    </OnClicked>
                </Button>
            </Controls>
        </TopLevelControl>
    </Controls>
</GuiXml>
```

**Supported element types:**

| Type | Description |
|------|-------------|
| `toplevelcontrol` | Full window with backdrop, title label, and close button |
| `button` | Clickable button with label |
| `label` | Text label |
| `editbox` | Text input field with backdrop |
| `scrolllist` | Scrollable list container using `ZO_ScrollList` |
| `dialog` | Dialog window with title, body text, confirm and cancel buttons |
| `tooltip` | Tooltip inheriting `ZO_ItemTooltip` |
| `backdrop` | Background panel using `ZO_DefaultBackdrop` |

**Tips:**

- `toplevelcontrol` generates a complete draggable window suitable for most addon UIs.
- `dialog` generates a confirm/cancel dialog with title and body text.
- Use `$(parent)` in child control names to reference the parent -- this is standard ESO XML convention.
- Remember to include the `.xml` file in your addon manifest.

---

## generate_savedvariables_code

**Description:** Generate complete SavedVariables initialization code with defaults, get/set helpers, and reset-to-defaults functionality. Supports both character-specific and account-wide storage.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_name | string | Yes | The addon name (must be a valid Lua identifier) |
| defaults | object | Yes | Default values for saved variables as key-value pairs |
| account_wide | boolean | No | Whether saved vars are account-wide (default: `false` = character-specific) |
| namespace | string | No | Namespace table for the addon (defaults to addon_name) |

**Example Usage:**

```json
{
  "tool": "generate_savedvariables_code",
  "arguments": {
    "addon_name": "MyAddon",
    "defaults": {
      "isEnabled": true,
      "opacity": 80,
      "position": { "x": 100, "y": 200 },
      "trackedItems": []
    },
    "account_wide": true
  }
}
```

**Example Response:**

```json
{
  "code": "-- SavedVariables initialization for MyAddon\n\nMyAddon = MyAddon or {}\nlocal addon = MyAddon\n...",
  "saved_variables_name": "MyAddonSavedVariables",
  "storage_type": "account-wide"
}
```

**Generated code (formatted):**

```lua
-- SavedVariables initialization for MyAddon

MyAddon = MyAddon or {}
local addon = MyAddon

local ADDON_NAME = "MyAddon"
local ADDON_VERSION = 1

local defaults = {
    isEnabled = true,
    opacity = 80,
    position = {
        x = 100,
        y = 200,
    },
    trackedItems = {},
}

function addon:InitializeSavedVariables()
    self.savedVariables = ZO_SavedVars:NewAccountWide("MyAddonSavedVariables", ADDON_VERSION, nil, defaults)
end

function addon:GetSetting(key)
    if self.savedVariables then
        return self.savedVariables[key]
    end
    return defaults[key]
end

function addon:SetSetting(key, value)
    if self.savedVariables then
        self.savedVariables[key] = value
    end
end

function addon:ResetToDefaults()
    if self.savedVariables then
        for key, value in pairs(defaults) do
            self.savedVariables[key] = value
        end
    end
end

-- Call addon:InitializeSavedVariables() from your EVENT_ADD_ON_LOADED handler
-- Make sure "MyAddonSavedVariables" is listed in your addon manifest's ## SavedVariables
```

**Tips:**

- Remember to add `## SavedVariables: MyAddonSavedVariables` to your addon manifest.
- Call `addon:InitializeSavedVariables()` from your `EVENT_ADD_ON_LOADED` handler.
- Character-specific (`account_wide: false`) uses `ZO_SavedVars:NewCharacterIdSettings` -- each character has independent settings.
- Account-wide (`account_wide: true`) uses `ZO_SavedVars:NewAccountWide` -- settings are shared across all characters.
- The generated code includes `GetSetting`, `SetSetting`, and `ResetToDefaults` helper functions.
- Default values support nested tables, arrays, booleans, numbers, and strings.
