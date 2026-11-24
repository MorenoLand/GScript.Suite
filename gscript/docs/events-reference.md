# Events Reference

Events are functions that are automatically called by the game engine when certain conditions or actions occur.

## Core Events

### onCreated()

Called when the script/object is created or loaded.

```gs2
function onCreated() {
    // Initialize variables
    this.health = 100;
    this.maxHealth = 100;
}
```

**Scope**: Server and Client

### onDestroy()

Called when the script/object is destroyed or removed.

```gs2
function onDestroy() {
    // Cleanup
    hideimg(200);
}
```

**Scope**: Server and Client

### onRemoved()

Called when the NPC is removed from the level.

```gs2
function onRemoved() {
    // Cleanup when removed
}
```

**Scope**: Server and Client

## Player Events

### onPlayerEnters()

Called when a player enters the level.

```gs2
function onPlayerEnters() {
    chat = "Welcome " @ player.nick @ "!";
}
```

**Scope**: Server and Client

### onPlayerLeaves()

Called when a player leaves the level.

```gs2
function onPlayerLeaves() {
    // Player left
}
```

**Scope**: Server

### onPlayerTouchsMe()

Called when a player touches/collides with the NPC.

```gs2
function onPlayerTouchsMe() {
    if (player.rupees >= 50) {
        player.rupees -= 50;
        player.bombs += 1;
        chat = "Here's a bomb!";
    }
}
```

**Scope**: Server and Client

### onPlayerChats()

Called when a player sends a chat message.

```gs2
function onPlayerChats() {
    temp.msg = player.chat;
    if (temp.msg == "/heal") {
        player.hearts = player.maxhearts;
    }
}
```

**Scope**: Server and Client

### onPlayerDies()

Called when the player dies.

```gs2
function onPlayerDies() {
    // Handle player death
}
```

**Scope**: Client

### onPlayerHurt()

Called when the player takes damage.

```gs2
function onPlayerHurt() {
    // Player was hurt
}
```

**Scope**: Client

### onPlayerLogin()

Called when a player logs into the server.

```gs2
function onPlayerLogin(account, communityname) {
    echo("Player logged in: " @ account);
}
```

**Scope**: Client (RC)

### onPlayerLogout()

Called when a player logs out.

```gs2
function onPlayerLogout(account, communityname) {
    echo("Player logged out: " @ account);
}
```

**Scope**: Client (RC)

## Weapon Events

### onWeaponFired()

Called when the weapon key is pressed (D key).

```gs2
//#CLIENTSIDE
function onWeaponFired() {
    setani("grab", "");
    shootfireball(player.dir);
    freezeplayer(0.1);
    sleep(0.1);
    setani("idle", "");
}
```

**Scope**: Client only

## Input Events (Client-Side Only)

### onKeyPressed(keycode, key, scancode)

Called when a key is pressed.

```gs2
//#CLIENTSIDE
function onKeyPressed(keycode, key, scancode) {
    player.chat = "Pressed: " @ key;
}
```

### onKeyReleased(key, scancode)

Called when a key is released.

```gs2
//#CLIENTSIDE
function onKeyReleased(key, scancode) {
    if (key == "w") {
        player.chat = "Released W!";
    }
}
```

### onMouseDown(mousevalue)

Called when a mouse button is pressed.

```gs2
//#CLIENTSIDE
function onMouseDown(mousevalue) {
    if (mousevalue == "left") {
        player.chat = "Click at: " @ mousex @ ", " @ mousey;
    }
}
```

### onMouseUp(mousevalue)

Called when a mouse button is released.

```gs2
//#CLIENTSIDE
function onMouseUp(mousevalue) {
    if (mousevalue == "left") {
        player.chat = "Released left mouse!";
    }
}
```

## Timer Events

### onTimeout()

Called when the timer expires (set by setTimer()).

```gs2
function onCreated() {
    setTimer(1);
}

function onTimeout() {
    echo("Timer fired!");
    setTimer(1); // Continue loop
}
```

**Scope**: Server and Client

## Custom Events (via scheduleevent)

Custom events are defined using the pattern `onEventName`:

```gs2
function onCreated() {
    this.scheduleevent(5, "RegenerateHealth", 10);
}

function onRegenerateHealth(amount) {
    this.health = min(this.health + amount, this.maxhealth);
    this.scheduleevent(5, "RegenerateHealth", amount);
}
```

## Level Events

### onLevelLoaded()

Called when a level is loaded.

```gs2
function onLevelLoaded() {
    // Level was loaded
}
```

## Remote Control Events

### onRCChat(cmd, params)

Called when an RC command is received.

```gs2
function onRCChat(cmd, params) {
    if (cmd == "reset") {
        // Handle reset command
    }
}
```

**Scope**: Client

## NPC Events

### onWasHit(obj)

Called when the NPC is hit by a projectile.

```gs2
function onWasHit(obj) {
    // obj contains information about what hit us
    this.health -= 1;
}
```

## Trigger Events

Events triggered via trigger() or triggerclient()/triggerserver():

```gs2
// Server to client trigger
triggerclient("gui", "MyWeapon", "onCustomEvent", param1, param2);

// Client to server trigger
triggerserver("gui", "MyWeapon", "onServerEvent", data);

// Handle trigger
function onCustomEvent(param1, param2) {
    // Handle event
}
```

## Event Parameter Reference

### onKeyPressed Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| keycode | int | Numeric key code |
| key | string | Key name (e.g., "a", "space", "f1") |
| scancode | int | Hardware scan code |

### onMouseDown/onMouseUp Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| mousevalue | string | "left", "right", "middle", or "double" |

### onRCChat Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| cmd | string | Command name |
| params | string | Command parameters |

### onPlayerLogin Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| account | string | Account name |
| communityname | string | Display/community name |
