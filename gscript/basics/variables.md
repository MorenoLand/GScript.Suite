# Variables

Variables are containers for storing information. In GraalScript2, variables can store **numbers, text, objects, or lists**.

## What is a Variable?

A **variable** is like a box where you can store information.

```gs2
function onCreated() {
    val = "Rawrrr!";
    echo(val);
}
```

When you run this, the console will print: `Rawrrr!`

## Data Types in Variables

In GraalScript2, you don't need to declare what type a variable will be. You can store different types of values in the same variable:

```gs2
function onCreated() {
    // Integer
    val = 1;

    // Float (decimal number)
    val = 3.14;

    // String (text)
    val = "Meow :3";

    // Object reference
    val = player;

    // Array (list of values)
    val = {1, 2, 3};
}
```

## Arrays (Lists)

**Arrays** are lists that can store multiple values in a single variable. In GraalScript2, arrays use curly braces `{}`:

```gs2
function onCreated() {
    // Array of names
    temp.names = {"Ruan", "Fireenn", "Cody"};

    // Access individual items using [index] (starts at 0)
    echo(temp.names[0]); // Prints: Ruan
    echo(temp.names[1]); // Prints: Fireenn
    echo(temp.names[2]); // Prints: Cody
}
```

**Remember:** Array indexing starts at `0`, not `1`!

### Mixed Data Types

Arrays can store **any data type**:

```gs2
function onCreated() {
    // Mix numbers, text, and boolean values
    temp.someData = {100, "Ruan", true};

    echo(temp.someData[0]); // Prints: 100
    echo(temp.someData[1]); // Prints: Ruan
    echo(temp.someData[2]); // Prints: true
}
```

### Nested Arrays (Arrays Inside Arrays)

You can put arrays inside other arrays:

```gs2
function onCreated() {
    // Array of player data: [name, health]
    temp.playersHealth = {
        {"Ruan", 100},
        {"Hailey", 150}
    };

    // Access nested data
    echo(temp.playersHealth[0][0]); // Prints: Ruan
    echo(temp.playersHealth[0][1]); // Prints: 100
    echo(temp.playersHealth[1][0]); // Prints: Hailey
}
```

## Variable Prefixes

GraalScript2 uses prefixes to decide where the variable is stored and how long it exists.

### `this.` - Object Variable

Refers to the object the script is attached to. Persists as long as the object exists.

```gs2
this.health = 100; // Sets the health of the object
```

### `thiso.` - Original Object

Refers to the original object when called from another scope. Advanced usage.

### `temp.` - Temporary Variable

Exists only while the function runs, then disappears.

```gs2
function onCreated() {
    temp.randomNumber = random(1, 100);
    echo(temp.randomNumber); // Prints a random number between 1 and 100
}
// temp.randomNumber is gone after this function ends
```

### `player.` - Player Reference

Refers to the player object that triggered the function.

```gs2
echo(player.nick); // Prints the player's nickname
```

### `client.` - Client Flags

Stores data saved to the player's account. Can be read/written on both client-side and server-side.

```gs2
client.preferredColor = "blue"; // Saved to player's account
```

### `clientr.` - Client Read-Only

Read-only variable stored in the player's account. Can only be written on server-side.

```gs2
clientr.inventory_size = 20; // More secure, client can't modify
```

### `server.` - Server Flags (Hidden)

Stores global data shared by the entire server. Not visible to clients.

```gs2
server.eventActive = true; // Server-side only
```

### `serverr.` - Server Flags (Visible)

Another global data variable, but can be read by clients.

```gs2
serverr.globalTime = 120; // Clients can read this
```

## Prefix Summary Table

| Prefix | Scope | Persistence | Client Access |
|--------|-------|-------------|---------------|
| `this.` | Object | While object exists | Yes |
| `temp.` | Function | Function duration | Yes |
| `player.` | Player event | N/A | Yes |
| `client.` | Account | Permanent | Read/Write |
| `clientr.` | Account | Permanent | Read only |
| `server.` | Server | Permanent | No |
| `serverr.` | Server | Permanent | Read only |

## Quick Recap

- Use `temp.` for short-term values (inside functions)
- Use `this.` when storing values on the object (like an NPC or weapon)
- Use `player.`, `client.`, or `server.` when storing information about players or the whole server
