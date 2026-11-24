# Advanced GS2 Features

## GS2 Constraints

GS2 is a legacy/proprietary language. Do NOT assume patterns from JavaScript, Python, Lua, or other languages work.

| Constraint          | Detail                                 |
| ------------------- | -------------------------------------- |
| Reserved props      | `this.name`, `this.id` - never assign to these |
| No object literals  | `{key: val}` syntax doesn't work       |
| Dynamic vars        | Use `this.(@varname)` or `this.("string")` |
| getstringkeys scope | Requires object in scope               |

## Dynamic Variable Access

### Syntax

```gs2
// Dynamic variable access using @ operator
temp.key = "myvar";
this.(@temp.key) = "value";  // Equivalent to: this.myvar = "value"

// Static string access
this.("statickey") = "value";  // Equivalent to: this.statickey = "value"

// Reading dynamic variables
temp.val = this.(@temp.key);
```

### Practical Examples

```gs2
// Setting player-specific data
temp.accountVar = "player_" @ player.account @ "_score";
this.(@temp.accountVar) = 100;

// Iterating through numbered variables
for (temp.i = 0; temp.i < 10; temp.i++) {
    this.(@"slot_" @ temp.i) = "item" @ temp.i;
}

// Conditional variable names
temp.prefix = player.guild;
this.(@temp.prefix @ "_buff") = true;
```

## getstringkeys

Returns an array of key suffixes matching a given prefix. Works on both client and server side. Use it to discover dynamic/unknown keys.

### Return Value

Returns an array of **suffixes** (the part AFTER the prefix).

Example: If prefix is `"client.marker_dungeon"` and key is `client.marker_dungeon_normal_123`, returns `{"_normal_123"}`.

### Prefix Scopes

Use the prefix matching where the data lives:

| Prefix | Scope | Use Case |
|--------|-------|----------|
| `client.` | Client-writable flags | Map markers, GUI positions, loadouts, hotkeys |
| `clientr.` | Server-writable/client-readable | Inventory items, stats, buff data |
| `this.` / `thiso.` | NPC/object vars | Object-specific dynamic data |

### Scope Rules

**Server-side**: Accessing another player's keys requires `with (player)` block.

**Client-side**: `player` is already in scope.

### Examples

```gs2
// Server side: find player's stale flags
temp.pl = findplayer2("Name");
with (temp.pl) {
    temp.keys = getstringkeys("client.marker_dungeon");
    for (temp.key : temp.keys) {
        client.(@"marker_dungeon" @ temp.key) = null;  // Clear it
    }
}

// Client side: player already in scope
temp.keys = getstringkeys("client.marker_" @ this.island);

// Server side: reading server-written player data
with (temp.pl) {
    temp.items = getstringkeys("clientr.mud_item");
    for (temp.item : temp.items) {
        echo("Item: " @ temp.item @ " = " @ clientr.(@"mud_item" @ temp.item));
    }
}
```

### Common Use Cases

- Cleaning up stale dynamic flags
- Iterating inventory items
- Discovering loadout slots
- Finding unknown timestamped keys

## Client-Server Communication

### triggerclient

Sends event from server to specific client:

```gs2
// Server-side
triggerclient("gui", weaponname, action, params...);

// Example
triggerclient("gui", "InventorySystem", "refreshUI", player.account);
```

### triggerserver

Sends event from client to server:

```gs2
// Client-side
triggerserver("gui", weaponname, action, params...);

// Example
triggerserver("gui", "InventorySystem", "useItem", temp.itemId);
```

### Flag Communication

| Prefix | Write Access | Read Access |
|--------|--------------|-------------|
| `client.` | Both sides | Both sides |
| `clientr.` | Server only | Client reads |
| `server.` | Server only | Server only |
| `serverr.` | Server writes | Client reads |

## Class System

### join()

Imports a class into the current script:

```gs2
// Server-side
join("systemfunctions_serverside");
join("baddyskills");
join("projectile_aoe");

// Client-side
join("systemfunctions");
join("system_spells");
join("no_pk_areas");
```

### isinclass()

Check if an object has joined a class:

```gs2
if (isinclass("DoorClass")) {
    // Object has DoorClass functionality
}

if (player.isinclass("health_functions")) {
    // Player has health_functions class
}
```

### leave()

Remove a previously joined class:

```gs2
leave("DoorClass");
```

## Object Scopes

| Scope | Description |
|-------|-------------|
| `this.` | Current NPC/weapon object |
| `thiso.` | Original object when called from another scope |
| `player.` | Triggering player (found with `findplayer2()`) |
| `temp.` | Function-local temporary |
| `level.` | Level object (found with `findlevel()`) |

## with() Blocks

Execute code in context of another object:

```gs2
// Modify another player
with (findplayer2("TargetName")) {
    hearts -= 1;
    chat = "I was hit!";
}

// Modify an NPC
with (findnpc("BossNPC")) {
    x = 30;
    y = 40;
    chat = "I moved!";
}

// Access player flags on server
temp.pl = findplayer2("Name");
with (temp.pl) {
    temp.keys = getstringkeys("client.someprefix");
}
```

## Finding Objects

```gs2
// Find player by account or community name
temp.pl = findplayer("account");
temp.pl = findplayer2("name");  // Also works with community names
temp.pl = findplayerbyid(123);
temp.pl = findplayerbycommunityname("DisplayName");

// Find NPCs
temp.npc = findnpc("NPCName");
temp.npc = findnpcbyid(456);

// Find weapons
temp.weapon = findweapon("WeaponName");

// Find levels
temp.lvl = findlevel("levelname.nw");
```

## Event System

### scheduleevent()

Schedule a custom event to fire after a delay:

```gs2
// Schedule event
this.scheduleevent(delay, "EventName", params...);

// Handle event
function onEventName(params...) {
    // Handle event
}
```

### trigger()

Invoke an event immediately (non-blocking):

```gs2
this.trigger("onCustomEvent", param1, param2);
```

### triggeraction()

Trigger an `onAction...` handler on NPCs at a specific level position. The action name is appended to `onAction`, so `"OpenDoor"` calls `onActionOpenDoor()`.

```gs2
function onPlayerTouchsMe() {
    triggeraction(this.x + 0.5, this.y + 0.5, "OpenDoor", player.account);
}

function onActionOpenDoor(account) {
    this.last_opened_by = account;
    this.open = true;
}
```

Use `triggeraction()` for position-based level interactions. Use `trigger()` when you already have the object reference and want to call an event on that object directly.

## SQL Requests

`requestsql()` and `requestsql2()` run server-side SQL asynchronously and return a request object. When reading rows, call `waitfor(request, "onReceiveData", timeout)` before inspecting the result.

### requestsql()

Runs against the default database:

```gs2
function findPlayerRow(account) {
    temp.safeAccount = account.escape();
    temp.request = requestsql(
        "SELECT * FROM players WHERE account = '" @ temp.safeAccount @ "'",
        true
    );

    waitfor(temp.request, "onReceiveData", 60);
    return temp.request.rows;
}
```

### requestsql2()

Runs against a named database:

```gs2
function findScore(account) {
    temp.safeAccount = account.escape();
    temp.request = requestsql2(
        "secondary_db",
        "SELECT score FROM stats WHERE account = '" @ temp.safeAccount @ "'",
        true
    );

    waitfor(temp.request, "onReceiveData", 60);
    return temp.request.rows;
}
```

### SQL Safety Notes

- Use `.escape()` before placing string values into SQL.
- Pass `true` when you expect rows back.
- Pass `false` for writes where you do not need returned rows.
- Read `request.rows`, `request.error`, `request.lastinsertid`, and `request.completed` from the returned request object after the receive event.

## Array Operations

```gs2
// Create array
temp.arr = {1, 2, 3};

// Add element
temp.arr.add(4);

// Remove element by value
temp.arr.remove(2);

// Delete by index
deletestring(temp.arr, 0);

// Get size
temp.size = temp.arr.size();
temp.size = arraylen(temp.arr);

// Find index
temp.idx = temp.arr.index("value");

// Clear
temp.arr.clear();

// Sort
temp.arr.sortascending();
temp.arr.sortdescending();
```

## String Operations

```gs2
// Concatenation
temp.str = "Hello" @ "World";  // "HelloWorld"
temp.str = "Hello" SPC "World"; // "Hello World"

// Methods
temp.len = "Hello".length();
temp.upper = "hello".upper();
temp.lower = "HELLO".lower();
temp.sub = "Hello".substring(0, 3);  // "Hel"
temp.pos = "Hello".pos("ll");  // 2

// Tokenize
temp.tokens = "a,b,c".tokenize(",");  // {"a", "b", "c"}

// Trim whitespace
temp.clean = "  text  ".trim();

// Check starts with
if (temp.str.starts("prefix")) { }

// Escape for SQL
temp.safe = player.account.escape();
```

## Reserved Properties

Never assign to these properties directly:

- `this.name` - Object name
- `this.id` - Object ID

These are read-only and managed by the engine.
