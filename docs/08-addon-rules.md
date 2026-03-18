# ESOUI Rules & Guidelines Tools

The Addon Rules module provides 3 tools for accessing official ESO addon development rules, generating localization code, and generating function hook code. These tools encode community best practices from the ESOUI forums and wiki.

---

## get_addon_rules

**Description:** Get official ESO addon development rules, restrictions, and best practices from ESOUI guidelines. Covers 9 topic areas with detailed rules. Essential reference for addon development compliance.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| topic | string | No | Specific topic to get rules for (default: `"all"` for complete guidelines). One of: `"restrictions"`, `"best_practices"`, `"performance"`, `"localization"`, `"hooking"`, `"savedvariables"`, `"events"`, `"libraries"`, `"upload"`, `"all"` |

**Example Usage -- Get all rules:**

```json
{
  "tool": "get_addon_rules",
  "arguments": {}
}
```

**Example Usage -- Get specific topic:**

```json
{
  "tool": "get_addon_rules",
  "arguments": {
    "topic": "restrictions"
  }
}
```

**Example Response (specific topic):**

```json
{
  "topic": "restrictions",
  "title": "What ESO Addons MUST NOT Do (Official ESOUI Rules)",
  "rules": [
    "MUST NOT automate gameplay actions (auto-combat, auto-loot, auto-dodge)",
    "MUST NOT provide advantages in PvP that non-addon users do not have",
    "MUST NOT interact with the game memory or client files directly",
    "MUST NOT call Protected functions from addon code (these are blocked by the game)",
    "MUST NOT use /script to execute commands that bypass addon restrictions",
    "MUST NOT collect or transmit user data without clear disclosure",
    "MUST NOT include executable files (.exe, .dmg) without source code and VirusTotal verification",
    "MUST NOT create libraries solely for one addon - libraries must be reusable across multiple addons",
    "MUST NOT name libraries \"Lib<YourAddon>\" or \"Lib<YourDeveloperName>\" - name them by functionality",
    "MUST NOT pollute the global _G table with common variable names (use local or a namespace table)",
    "MUST NOT use profanity or abbreviated swear words in addon names",
    "Manifest (.txt) filename MUST match the addon folder name exactly",
    "MUST check addonName parameter in EVENT_ADD_ON_LOADED callback before initializing",
    "MUST list maximum 2 API versions in ## APIVersion"
  ],
  "source": "ESOUI Official Guidelines (esoui.com/forums/showthread.php?t=9867)"
}
```

**Available topics:**

| Topic | Description |
|-------|-------------|
| `restrictions` | What addons MUST NOT do (official rules) |
| `best_practices` | General addon development best practices |
| `performance` | Performance optimization guidelines |
| `localization` | Multi-language support guidelines |
| `hooking` | Function hooking best practices (ZO_PreHook, SecurePostHook) |
| `savedvariables` | SavedVariables usage rules and patterns |
| `events` | Event registration and handling rules |
| `libraries` | Library usage and dependency guidelines |
| `upload` | ESOUI upload and distribution rules |
| `all` | Complete guidelines covering all topics |

**Tips:**

- Start with `"restrictions"` to understand what you absolutely must not do.
- The `"all"` option returns every section -- useful as a comprehensive reference document.
- The response includes essential links to the ESOUI forums, wiki, and Getting Started guide.
- Review `"upload"` before publishing an addon to ESOUI to avoid rejection.
- The `"hooking"` topic is critical reading before using `ZO_PreHook` or `SecurePostHook`.

**Key restrictions to always remember:**

1. Never automate gameplay actions.
2. Never provide PvP advantages.
3. Always check `addonName` in `EVENT_ADD_ON_LOADED`.
4. Never pollute the global namespace with common variable names.
5. Manifest filename must match the folder name.

---

## generate_localization

**Description:** Generate ESO addon localization code using `SafeAddString` or separate localization files. Supports multiple languages (English, German, French). Follows the ESOUI best practice of reusing existing game strings via `GetString(SI_...)` where possible.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| addon_name | string | Yes | Your addon name (must be a valid Lua identifier) |
| strings | array | Yes | Array of string definitions to localize |
| method | string | No | Localization method: `"safe_add_string"` (inline, default) or `"localization_file"` (separate files) |

**String object properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| key | string | Yes | String constant key (must be uppercase with underscores, e.g., `"SI_MY_ADDON_TITLE"`) |
| en | string | Yes | English text (always required as fallback) |
| de | string | No | German translation |
| fr | string | No | French translation |

**Example Usage -- Inline method:**

```json
{
  "tool": "generate_localization",
  "arguments": {
    "addon_name": "CombatTracker",
    "strings": [
      { "key": "SI_COMBAT_TRACKER_TITLE", "en": "Combat Tracker", "de": "Kampf-Tracker", "fr": "Suivi de Combat" },
      { "key": "SI_COMBAT_TRACKER_ENABLE", "en": "Enable Tracking", "de": "Tracking aktivieren", "fr": "Activer le suivi" },
      { "key": "SI_COMBAT_TRACKER_RESET", "en": "Reset Data", "de": "Daten zurücksetzen" }
    ],
    "method": "safe_add_string"
  }
}
```

**Example Response (inline method):**

```json
{
  "code": "-- CombatTracker Localization\n-- Uses SafeAddString for inline localization\n\nZO_CreateStringId(\"SI_COMBAT_TRACKER_TITLE\", \"Combat Tracker\")\nZO_CreateStringId(\"SI_COMBAT_TRACKER_ENABLE\", \"Enable Tracking\")\nZO_CreateStringId(\"SI_COMBAT_TRACKER_RESET\", \"Reset Data\")\n\n-- Apply translations based on client language\nlocal lang = GetCVar(\"language.2\")\n\nif lang == \"de\" then\n    SafeAddString(SI_COMBAT_TRACKER_TITLE, \"Kampf-Tracker\", 1)\n    SafeAddString(SI_COMBAT_TRACKER_ENABLE, \"Tracking aktivieren\", 1)\n    SafeAddString(SI_COMBAT_TRACKER_RESET, \"Daten zurücksetzen\", 1)\nend\n\nif lang == \"fr\" then\n    SafeAddString(SI_COMBAT_TRACKER_TITLE, \"Suivi de Combat\", 1)\n    SafeAddString(SI_COMBAT_TRACKER_ENABLE, \"Activer le suivi\", 1)\nend",
  "usage": "-- Access: GetString(SI_COMBAT_TRACKER_TITLE)",
  "tip": "Use GetString(SI_...) for existing game strings to avoid retranslation."
}
```

**Example Usage -- Separate files:**

```json
{
  "tool": "generate_localization",
  "arguments": {
    "addon_name": "CombatTracker",
    "strings": [
      { "key": "SI_COMBAT_TRACKER_TITLE", "en": "Combat Tracker", "de": "Kampf-Tracker" }
    ],
    "method": "localization_file"
  }
}
```

**Example Response (separate files):**

```json
{
  "files": [
    {
      "filename": "lang/en.lua",
      "content": "-- CombatTracker Localization - English (Default)\n\nSafeAddString(SI_COMBAT_TRACKER_TITLE, \"Combat Tracker\", 1)\n"
    },
    {
      "filename": "lang/de.lua",
      "content": "-- CombatTracker Localization - Deutsch\n\nSafeAddString(SI_COMBAT_TRACKER_TITLE, \"Kampf-Tracker\", 1)\n"
    }
  ],
  "manifest_addition": "; Localization\nlang/en.lua\nlang/de.lua",
  "usage": "-- Access strings with: GetString(SI_COMBAT_TRACKER_TITLE)",
  "tip": "Load English first in manifest (as fallback), then other languages."
}
```

**Method comparison:**

| Method | Pros | Cons |
|--------|------|------|
| `safe_add_string` | Single file, simple setup | All languages in one file, harder for translators |
| `localization_file` | Clean separation, easy for translators to contribute | More files to manage, must update manifest |

**Tips:**

- Always provide English as the fallback language.
- String keys must follow the pattern `SI_MYADDON_KEYNAME` (uppercase with underscores).
- Before creating custom strings, check if ESO already has a game string you can reuse with `GetString(SI_...)`.
- The full list of game strings is at: `github.com/esoui/esoui/blob/master/esoui/ingamelocalization/localizegeneratedstrings.lua`.
- When using `localization_file` method, load English first in the manifest so it serves as the fallback.
- Use `ZO_CachedStrFormat` for formatted strings to improve performance.

---

## generate_hook_code

**Description:** Generate ESO addon hook code (`ZO_PreHook`, `SecurePostHook`, or function override). Follows the ESOUI best practice of hooking the class function (not the instance) and hooking as far up the inheritance chain as possible. Includes safety checks and proper patterns.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| hook_type | string | Yes | Type of hook. One of: `"pre_hook"`, `"post_hook"`, `"secure_post_hook"`, `"override"` |
| target_object | string | No | Object/table to hook (e.g., `"ZO_InventorySlot"`, `"SCENE_MANAGER"`). Must be a valid Lua identifier. |
| target_function | string | Yes | Function name to hook (e.g., `"UpdateSlot"`, `"Show"`). Must be a valid Lua identifier. |
| addon_name | string | Yes | Your addon name (must be a valid Lua identifier) |
| description | string | No | What the hook should do (added as a comment) |

**Example Usage -- SecurePostHook (recommended):**

```json
{
  "tool": "generate_hook_code",
  "arguments": {
    "hook_type": "secure_post_hook",
    "target_object": "ZO_InventorySlot",
    "target_function": "UpdateSlot",
    "addon_name": "InventoryHelper",
    "description": "Add custom icon overlay after slot updates"
  }
}
```

**Example Response:**

```json
{
  "code": "-- SecurePostHook: Add custom icon overlay after slot updates\n-- Runs AFTER the original function. Cannot prevent the original from executing.\n-- This is the SAFER option - preferred over ZO_PreHook.\nSecurePostHook(ZO_InventorySlot, \"UpdateSlot\", function(self, ...)\n    -- Your code here (runs after ZO_InventorySlot.UpdateSlot)\nend)\n",
  "hook_type": "secure_post_hook",
  "target": "ZO_InventorySlot.UpdateSlot",
  "best_practices": [
    "ALWAYS hook the CLASS function, not the object instance",
    "Hook as far up the inheritance chain as possible",
    "Prefer SecurePostHook over ZO_PreHook when possible (safer)",
    "Avoid full overrides - they break other addon hooks",
    "Test with other popular addons enabled to check compatibility"
  ]
}
```

**Hook types explained:**

### pre_hook (ZO_PreHook)

Runs **before** the original function. Can return `true` to **prevent** the original from executing.

```lua
-- Pre-hook: Intercept inventory updates
ZO_PreHook(ZO_InventorySlot, "UpdateSlot", function(self, ...)
    -- Your code here (runs before ZO_InventorySlot.UpdateSlot)
    -- Return true to block the original function
end)
```

### post_hook / secure_post_hook (SecurePostHook)

Runs **after** the original function. Cannot prevent the original from executing. **This is the safer and recommended option.**

```lua
-- SecurePostHook: Add overlay after slot update
SecurePostHook(ZO_InventorySlot, "UpdateSlot", function(self, ...)
    -- Your code here (runs after ZO_InventorySlot.UpdateSlot)
end)
```

### override

**Completely replaces** the original function. Other addons hooking this function will be affected. Only use this if Pre/PostHook is not sufficient.

```lua
-- WARNING: Completely replaces the original function.
local original_UpdateSlot = ZO_InventorySlot.UpdateSlot
ZO_InventorySlot.UpdateSlot = function(self, ...)
    -- Your replacement code here

    -- Call original if needed:
    -- return original_UpdateSlot(self, ...)
end
```

**Global function hooks:**

When `target_object` is omitted, the hook targets a global function:

```lua
-- Hook a global function
ZO_PreHook("GetItemLink", function(...)
    -- Your code here (runs before GetItemLink)
end)
```

**Tips:**

- **Always prefer SecurePostHook** over ZO_PreHook unless you need to block the original function.
- **Always hook the CLASS function**, not the object instance. Hooking instances breaks the metatable lookup chain and prevents later addon hooks from working.
- **Hook as far up the inheritance chain as possible.** For example, if a function is defined on `ZO_LootHistory_Shared` and inherited by `ZO_LootHistory_Keyboard`, hook the `Shared` class.
- **Avoid overrides** -- they are the most destructive option and will break other addons that hook the same function.
- **Test with popular addons** enabled to verify your hooks do not cause conflicts.
- ZOS uses metatables and `:` notation with `self` -- understand this before hooking.
