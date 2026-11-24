# Server-side and Client-side

Understanding the difference between **Server-side** and **Client-side** code is fundamental to GS2 scripting.

## Server-side

Server-side code runs on the **server**. Anything that happens in server-side code can be seen or experienced by everyone in the game.

Characteristics:
- Affects all players
- Handles game logic and rules
- Modifies persistent data
- Controls NPCs and level elements
- Manages player accounts and stats

## Client-side

Client-side code runs on the **client**, which means it only affects the player whose screen the script is running on.

Characteristics:
- Only affects the local player
- Handles visuals and effects
- Processes user input
- Creates GUI interfaces
- Plays sounds and music

## The `//#CLIENTSIDE` Directive

In GraalScript2, all code is server-side by default. To make code client-side, you need to add the following line:

```gs2
//#CLIENTSIDE
```

Everything after this line will run on the client.

## Example: Combined Script

```gs2
// Server-side code (default)
function onCreated() {
    echo("Script loaded on server!");
    this.health = 100;
}

function onPlayerTouchsMe() {
    // This runs on the server
    // All players will see this NPC's chat
    chat = "Don't touch me!";
}

//#CLIENTSIDE
// Everything below is client-side

function onCreated() {
    player.chat = "Hello from Client-side!";
}

function onWeaponFired() {
    // Only this player will see this
    player.chat = "I fired my weapon!";
}
```

## Testing Your Weapon Script

To test server-side and client-side in action:

### Step 1: Create Client-side Code

Add the following code below your existing Hello World code:

```gs2
//#CLIENTSIDE
function onCreated() {
    player.chat = "Hello from Client-side!";
}
```

### Step 2: Save and Observe

When you save the script:
- **Server-side `echo()`** appears in RC chat (visible to admins)
- **Client-side `player.chat`** appears above your player (only you see it)

## When to Use Each

### Use Server-side For:
- Game rules and validation
- Player inventory and stats
- NPC behavior and AI
- Database operations
- Anything that affects multiple players

### Use Client-side For:
- Visual effects (particles, images)
- GUI windows and menus
- Sound and music
- Keyboard/mouse input
- Anything that only affects one player

## Communication Between Sides

Server and client can communicate using:

### Client Flags (`client.`)
```gs2
// Server-side
client.myVariable = "value";

// Client-side can read this
echo(client.myVariable);
```

### Clientr Flags (`clientr.`)
```gs2
// Server-side only can write
clientr.secureData = "secret";

// Client-side can read but not modify
echo(clientr.secureData);
```

### Serverr Flags (`serverr.`)
```gs2
// Server-side
serverr.globalEvent = "active";

// Client-side can read
if (serverr.globalEvent == "active") {
    // Do something
}
```

### Triggers
For more complex communication, use triggers to send custom events between server and client.

## Important Notes

- You can have both server-side and client-side code in the same script
- Always add `//#CLIENTSIDE` at the end of your server-side code
- Server-side code runs first when a script is loaded
- Never trust client-side data for game-critical operations
