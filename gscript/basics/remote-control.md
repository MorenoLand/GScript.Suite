# Remote Control (RC)

The **Remote Control (RC)** is the primary tool for server administrators and developers. It provides access to server files, an internal admin-only chat, and multiple sections for managing scripts and server configuration.

## Main Features

### File Browser

The file browser allows administrators to view, edit, and manage the server's file structure. It is essential for organizing assets such as levels, images, sounds, and scripts.

### Script Sections

RC provides three main script types, each with different scopes and use cases:

#### DB NPCs

- Created directly in RC
- Often used to **store global data** or act as **shared script repositories**
- Accessible by multiple other scripts, making them a central reference point
- Think of DB NPCs as the "global storage" for both data and logic

#### Weapons

- Scripts that only run if a player has the weapon on their account
- Used for gameplay-specific features, player abilities, or items
- Scoped **per player**: if they don't own it, the script won't execute

**Special Case:** When a weapon contains **serverside code**, it can run even if no player owns the weapon. In this case, the script executes in **global scope**, behaving like a regular serverside script.

#### Class Scripts

- Designed to be **imported into other scripts or objects**
- Helps avoid code duplication and keeps codebases clean
- Players can also have class scripts attached to them for modular functionality

To use a class in another script:

```gs2
join("ClassName");
```

### Server Options

The **Server Options** panel configures core aspects of the server:
- Managing the administrator list
- Defining server-wide gameplay rules
- Miscellaneous global configurations

### Folder Configs

Determines how the server organizes its asset folders:
- `heads/` - Player heads
- `bodies/` - Player bodies
- `shields/` - Shields
- `levels/` - Maps

Proper folder configuration ensures that assets are loaded and referenced correctly.

### Server Flags

A storage area for **global variables** set on the server. Useful for persistent values that need to be accessed across multiple scripts.

Access server flags using the `server.` or `serverr.` prefix:

```gs2
// Server-side only
server.eventActive = true;

// Readable by clients
serverr.globalTime = 120;
```

### Player List

A live list of all players currently connected to the server. Admins can use this for monitoring activity, testing, or quick player management.

## RC Options

Allows customization of the RC client itself, such as adjusting interface preferences or visual settings.

## Summary

The Remote Control is the backbone of Graal server administration. It combines file access, script management, server configuration, and real-time monitoring into one central tool.

Understanding how each section works is essential for effective server development and maintenance.

## Alternative: RC3

An alternative tool, **RC3**, provides the same Remote Control functionality without requiring login through the game client.
