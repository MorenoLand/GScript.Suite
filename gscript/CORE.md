# GS2 Documentation Core Reference

## CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE RESPONDING

You are assisting in documenting GraalScript 2 (GS2) functions. There are two outputs:
1. **GraalScript_Reference.md** (`docs/GraalScript_Reference.md`) — A comprehensive offline reference for AI to read and write GS2
2. **API entries** (api.gscript.dev) — Individual function documentation entries with a specific 5-field format

This document covers BOTH workflows.

---

## ⚠️ CRITICAL GS2 SYNTAX RULES (AI Gets These Wrong Constantly)

Before documenting ANY function or writing ANY example, internalize these rules:

### 1. String Concatenation: `@` NOT `+`
```gs2
// WRONG
echo("Hello " + player.nick);
// CORRECT
echo("Hello " @ player.nick);
```

### 2. Variable Prefixes Are MANDATORY
Every variable MUST have a prefix. There are NO bare variables in GS2.
```gs2
temp.counter = 0;     // Local to function, dies when function ends
this.health = 100;    // Object property, persists on the NPC/weapon object
player.rupees = 50;   // The player who triggered the current event
client.settings = 1;  // Player account variable, synced client↔server, saved
clientr.level = 5;    // Player account variable, server-write only, client reads
server.warActive = 1; // Global server variable, all NPCs/players can read
serverr.count = 42;   // Global server variable, server-write, all clients read
```

### 3. `sqrt()` is CLIENTSIDE ONLY
```gs2
// This WORKS clientside:
temp.dist = sqrt(dx*dx + dy*dy);
// This FAILS serverside. Use distance-squared comparisons instead:
temp.distSq = dx*dx + dy*dy;
// Or approximate: pow(x, 0.5) — but this can also be unreliable serverside
// BEST: use Math.sqrt() which is a clientside static object
// SERVERSIDE: just compare distance-squared values
```

### 4. Array Initialization Quirks
```gs2
// WRONG — can't index into an empty {} array
temp.arr = {};
arr[0] = "hello";  // This does NOT work reliably

// CORRECT — Option A: use .add()
temp.arr = {};
arr.add("hello");
arr.add("world");

// CORRECT — Option B: pre-size with new[size]
temp.arr = new[2];
arr[0] = "hello";
arr[1] = "world";

// CORRECT — Option C: inline initialization
temp.arr = {"hello", "world"};
```

### 5. `//#CLIENTSIDE` Directive
Code before `//#CLIENTSIDE` runs on the server. Code after it runs on the client.
```gs2
// Server-side code here
function onCreated() {
  this.chat = "I am server-side";
}

//#CLIENTSIDE
// Client-side code here
function onCreated() {
  // This runs on the player's computer
}
```

### 6. Events Are Named Functions
Events are `on` + EventName as function names. They are called automatically by the engine.
```gs2
function onPlayerTouchsMe() { }      // Player touches this NPC
function onPlayerEnters() { }        // Player enters the level
function onTimeout() { }             // Timer expires
function onActionServerside(cmd) { } // Client triggers server
function onActionClientside(cmd) { } // Server triggers client
```

### 7. Property Assignment, NOT Setters
```gs2
// WRONG
this.setVisible(true);
this.setText("hello");
// CORRECT
this.visible = true;
this.text = "hello";
// Also valid for NPCs (no this. prefix needed in NPC context):
visible = true;
chat = "hello";
```

### 8. `trigger()` vs `triggerserver()` vs `triggeraction()` — Three Different Things
```gs2
// trigger() — calls a function on THIS object by event name (sync, same script)
this.trigger("update");  // Invokes onEventupdate() on this object

// triggerserver() — CLIENT sends to SERVER weapon/NPC
triggerserver("weapon", this.name, "buyItem", "sword");

// triggeraction() — tile-based action trigger, fires onAction{EventName}()
triggeraction(player.x, player.y, "ChestOpen", "data");
```

### 9. Comments
```gs2
// Single line comment
/* Multi-line
   comment */
```

---

## Source File Hierarchy (In Order of Authority)

When determining how a function works, consult these files **in this order**:

### Tier 1: Authoritative In-Game Function Lists (MOST ACCURATE)
These files are dumps from `listscriptfunctions` in the actual Graal client. They show what's ACTUALLY exposed to the scripting engine, with accurate parameter counts and return types.

| File | Contents |
|------|----------|
| `docs/scriptfunctions_client.md` | **ALL client-side functions + full object tree** — This is the single most important file. Contains every function, variable, property, and event for every object type, organized by class hierarchy. |
| `docs/scriptfunctions.txt` | Server-side function list + full object tree (overlaps with client but includes server-only things) |

**These files contain the COMPLETE object hierarchy tree.** In `scriptfunctions.txt` the indentation shows inheritance; in `scriptfunctions_client.md` the depth of the headings and the index show it. The tree looks like this:
```
TGraalVar:                           ← Base class for everything
  ...
  TServerPlayer (TGaniObject):       ← TServerPlayer inherits from TGaniObject
    ap - integer
    hearts - float
    ...
    TPlayer (TServerPlayer):         ← TPlayer inherits from TServerPlayer (client-side player)
      ...
      TServerNPC (TServerPlayer):    ← TServerNPC inherits from TServerPlayer
        image - string
        move(float, float, float, int)
        ...
        TServerWeapon (TServerNPC):  ← Weapons are NPCs
```

### Tier 2: FourPlay Reverse-Engineered Source (C++ Implementation)
These show the actual C++ source code mapping.

| File | Contents |
|------|----------|
| `D:\Backups\git\Preagonal-fresh\FourPlay\quattroplay\src\TInitStatics.cpp` | The actual function registration arrays |

**FourPlay source structure:**
- `gsfunctions_funcDefs[37]` — 37 global server-side functions
- `gsfunctions_client_funcDefs[0x86]` — 134 global client-side functions
- Individual class `.cpp` files contain `TPropertyFuncDef` arrays

```cpp
typedef struct TPropertyFuncDef{
    const char* propertyName;  // Function name as exposed to GS2
    bool        alreadyEncoded;
    char        returnType;    // 'v'=void, 'i'=int, 'd'=double, 's'=string, 'b'=bool, 'o'=object
    const char* params;        // "s"=string, "i"=int, "d"=double, "b"=bool, "o"=object, "X"=varargs
    void*       functionPtr;
    const char* functionName;  // C++ function name
    bool        test7;         // TRUE = HIDDEN from listscriptfunctions
} TPropertyFuncDef;
```

### Tier 3: Ghidra Pseudo-Code (Deep Implementation Details)
| Location | Contents |
|----------|----------|
| `ghidra/[ClassName]/` | Decompiled pseudo-code for each class — use when you need to understand HOW a function works internally |

### Tier 4: Real Server Code (FOR EXAMPLES)
**ALWAYS pull examples from these. NEVER write placeholder code.**

| Location | Server |
|----------|--------|
| `refs/Delteria/` | Delteria (class/, npcscript/, weapon/) |
| `refs/Era Legacy [09-27-24]/` | Era Legacy |
| `refs/Era Legacy/` | Era Legacy (older) |
| `refs/Testbed [09-04-22]/` | Testbed |
| `refs/Testbed [06-04-2026] (Scripts only)/` | Testbed (scripts only) |
| `refs/Tropical/` | Tropical |
| `refs/UN Backup (11.11.2024)/` | UN |
| `refs/Worlds iPhone [10-17-25]/` | Worlds iPhone |
| `refs/Zone iPhone/` | Zone iPhone |
| `refs/Zodiac/` | Zodiac |
| `refs/Unholy Nation/` | Unholy Nation |

**How to find examples:**
```bash
# Search for real usage of a function
grep -rn "functionname(" "G:/Development/Graal/GS2/refs/" --include="*.txt"
```

### Tier 5: Other Reference Files
| File | Contents |
|------|----------|
| `docs/graal_wiki_dump.xml` | Wiki dump with parent class names and tree structure |
| `backup/FourPlay_Findings.md` | Notes about hidden functions and structure |
| `api_definitions.json` | OLD API definitions — use for JSON format reference ONLY, data is outdated |

---

## Determining Scope (Client vs Server vs Global)

This is critical. Use these rules:

### Global (both client and server)
- Functions in `gsfunctions` (server) AND `gsfunctions_client` (client) arrays
- Basic math: `max`, `min`, `int`, `abs`, `random`, `sin`, `cos`, `arctan`, `degtorad`, `radtodeg`
- String functions: `strlen`, `strcmp`, `strequals`, `lowercase`, `uppercase`, `contains`
- File operations: `fileexists`, `filesize`, `savelines`, `loadlines`, `savestring`, `loadstring`
- Player finding: `findplayer`, `findplayer2`, `findplayerbyid`, `findnearestplayer`
- TGraalVar methods: `join`, `leave`, `isinclass`, `scheduleevent`, `settimer`, `catchevent`

### Server-Side Only
- Object manipulation: `npc.x`, `npc.y`, `npc.hearts`, `npc.destroy()`, etc.
- Level operations: `level.putbomb`, `level.putexplosion`, `level.shoot`
- Player data writes: `player.hearts`, `player.rupees`, `player.gralats`
- SQL: `requestsql`, `requestsql2`
- Server globals: `server.*`, `serverr.*`
- `onPlayerEnters`, `onPlayerChats`, `onPlayerTouchsMe`, `onWasHit` events
- `onActionServerside` handler

### Client-Side Only
- Movement control: `disabledefmovement`, `enabledefmovement`, `freezeplayer`
- Input: `keydown`, `keydown2`, `getkeycode`, `keyname`, `mousex`, `mousey`
- Visual: `showimg`, `hideimg`, `findimg`, `showtext`, `seteffect`, `seteffectmode`
- Audio: `play`, `play2`, `playlooped`, `stopsound`, `stopmusic`
- GUI: `new GuiWindowCtrl`, all GuiControl methods
- Coordinate conversion: `screenx`, `screeny`, `worldx`, `worldy`
- Collision (clientside): `onwall`, `onwall2`, `onwater`
- Screenshots: `makescreenshot2`, `makescreenshotgame`, `makescreenshotfull`
- `onActionClientside` handler
- All `$pref::` variables

### Hidden Functions (test7=true in FourPlay)
Still callable, just not shown in `listscriptfunctions`. These include:
- `disabledefmovement`, `enabledefmovement`, `disablemap`, `enablemap`
- `disablepause`, `enablepause`, `disableselectweapons`, `enableselectweapons`
- `disableweapons`, `enableweapons`, `noplayerkilling`
- `attachplayertoobj`, `detachplayer`, `freezeplayer`
- `hideplayer`, `hidesword`, `callweapon`
- `loadclass`, `loadmap`, `lay2`
- `makescreenshot2`, `keyname2`
- `rungarbagecollector`, `destroy` (TStaticVar)
- `openvideoplayer`, `stopvideoplayer`, `isvideoplayeropen`

### Privileged Functions (Login-Server / Adventure Only)
These ONLY work on login servers or specially authorized scripts. They have the `Adventure_` or `TClient_` prefix in the C++ source. Do NOT document these as generally available:
- `requesturl`, `requesthttp` — HTTP requests (disabled ~2008 for non-login servers)
- `adventure_fileexists`, `adventure_getfilecontent` — Direct filesystem access
- `adventure_setframetick`, `adventure_getframetick` — Frame rate control
- All `tclient_*` functions — Internal client protocol functions
- `adventure_setnickname`, `adventure_setaccountname` — Login system manipulation

---

## Complete Object Hierarchy (CRITICAL for Parent Class Names)

This is the authoritative class tree from `scriptfunctions_client.md`. Everything inherits from `TGraalVar`.

### Core Object Types

```
TGraalVar (base class for EVERYTHING)
├── .join(str)                    Join a class
├── .leave(str)                   Leave a class
├── .isinclass(str)               Check class membership
├── .catchevent(obj, event, func) Listen for events on another object
├── .ignoreevent(str, str)        Stop listening for specific event
├── .ignoreevents(str)            Stop listening for all events from object
├── .trigger(str, params...)      Invoke event on this object
├── .scheduleevent(float, str, params...)  Delayed event
├── .settimer(float)              Set timer (triggers onTimeout)
├── .cancelevents(str)            Cancel scheduled events by name
├── .loadlines(str)               Load file as array
├── .savelines(str, int)          Save array to file
├── .loadstring(str)              Load file as string
├── .savestring(str, int)         Save string to file
├── .loadvars(str)                Load varname=value pairs from file
├── .savevars(str, int)           Save subvars as varname=value to file
├── .loadxml(str) / .loadxmlfromstring(str)
├── .savexml(str, int) / .savexmltostring()
├── .loadjson(str) / .loadjsonfromstring(str)
├── .savejson(str, int, int) / .savejsontostring(int)
├── .loadini(str)                 Load INI file
├── .loadfolder(str, int)         Load folder contents
├── .clearvars()                  Clear all dynamic variables
├── .clearemptyvars()             Remove empty subvariables
├── .copyfrom(obj)                Copy variables from another object
├── .objecttype()                 Returns type string
├── .getvarnames()                Get all subvariable names
├── .getdynamicvarnames()         Get dynamic (non-built-in) var names
├── .getfunctions()               Get all function names
├── .hasfunction(str)             Check if function exists
├── .sortascending() / .sortdescending()
├── .sortbyvalue(str, str, bool)
├── .addarray(obj) / .insertarray(int, obj)
├── .addarraymember(str) / .getarraymember(str)
├── .subarray2(int, int, int, int)
└── .name, .timeout, .joinedclasses, .maxlooplimit, .ispaused
```

### Inheritance Tree (Key Branches)

```
TGraalVar
├── TLevelObject (things that exist in a level)
│   ├── TBaddy                    — Baddy/enemy (dir, mode, power, type)
│   ├── TExplosion                — Explosion (dir, power, time)
│   ├── TServerBomb               — Bomb (power, time)
│   ├── TServerChest              — Chest (isopen, item)
│   ├── TServerSign               — Sign (text)
│   ├── TShowImg                  — Showimg object (alpha, rotation, emitter, etc.)
│   └── TGaniObject               — Animated game object
│       ├── TProjectile           — Projectile (angle, speed, params)
│       ├── TServerHorse          — Horse (bombpower, bombs, type)
│       └── TServerPlayer         — PLAYER / NPC base
│           ├── .account          — Account name (read only)
│           ├── .hearts           — Health
│           ├── .rupees/.gralats  — Currency
│           ├── .nick             — Display name
│           ├── .guild            — Guild name
│           ├── .chat             — Chat text
│           ├── .x, .y            — Position
│           ├── .swordpower/.shieldpower/.glovepower
│           ├── .headimg/.bodyimg
│           ├── .isadmin          — Is admin (read only)
│           │
│           ├── TPlayer           — CLIENT-SIDE player
│           │   ├── .ap, .hearts, .hp
│           │   ├── .hurt, .hurtdx, .hurtdy, .hurtpower
│           │   ├── .online, .paused, .reading, .swimming, .onhorse
│           │   ├── .defaultwalkspeed
│           │   ├── .findweapon(str)
│           │   ├── .getnohit(str)    — Check if player can be hurt
│           │   ├── .showemoticon(str) / .hideemoticon()
│           │   ├── .hidesign() / .scrollsign(int)
│           │   └── .weapon, .weapons (read only)
│           │
│           └── TServerNPC        — SERVER-SIDE NPC
│               ├── .image        — NPC image filename
│               ├── .isblocking   — Blocks movement
│               ├── .visible      — Is visible
│               ├── .width, .height
│               ├── .peltwithstone, .peltwithbush, etc.
│               ├── .save         — Built-in save array (values 0-220)
│               ├── .move(dx, dy, time, options)
│               ├── .setimg(str) / .setimgpart(...)
│               ├── .showcharacter()
│               ├── .setcharani(str, str)
│               ├── .setshape(type, w, h) / .setshape2(w, h, tiles)
│               ├── .showimg(...) / .showimg2(...) / .hideimg(int)
│               ├── .showtext(...) / .showtext2(...)
│               ├── .showani(...) / .showani2(...)
│               ├── .showpoly(...) / .showpoly2(...)
│               ├── .changeimgcolors(...) / .changeimgvis(...) / .changeimgzoom(...)
│               ├── .carryobject(str) / .throwcarry()
│               ├── .lay(str) / .take(str) / .take2(int)
│               ├── .drawoverplayer() / .drawunderplayer() / .drawaslight()
│               ├── .blockagain() / .dontblock()
│               ├── .canbecarried() / .cannotbecarried()
│               ├── .canbepushed() / .cannotbepushed()
│               ├── .canbepulled() / .cannotbepulled()
│               ├── .destroy() / .hide() / .show()
│               ├── .shootarrow(int) / .shootfireball(int) / .shootnuke(int)
│               ├── .shootfireblast(int) / .shootball()
│               ├── .hurt(int) / .message(str)
│               ├── .takehorse(int)
│               └── TServerWeapon  — Weapons ARE NPCs (.isweapon = true)
│
├── TServerLevel                  — LEVEL object
│   ├── .width, .height
│   ├── .isnopkzone, .issparringzone, .compsdead
│   ├── .tilemap, .tilelayercount
│   ├── .putbomb(power, x, y)
│   ├── .putbomb2(power, x, y, image)
│   ├── .putexplosion(power, x, y)
│   ├── .putexplosion2(power1, power2, x, y)
│   ├── .puthorse(image, x, y)
│   ├── .shoot(x, y, z, angle, zangle, strength, ani, aniparams)
│   ├── .findareanpcs(x, y, w, h)
│   ├── .testnpc(x, y) / .testsign(x, y) / .testitem(x, y)
│   ├── .testbomb(x, y) / .testexplo(x, y) / .testhorse(x, y)
│   ├── .tiletype(x, y)
│   ├── .hitcompu(id, power, x, y)
│   ├── .removebomb(int) / .removeexplo(int) / .removehorse(int) / .removeitem(int)
│   ├── .reflectarrow(int) / .removearrow(int)
│   └── .removecompus()
│
├── GuiControl (ALL GUI controls inherit from this)
│   ├── Properties: x, y, width, height, visible, profile, mode, etc.
│   ├── Methods: addcontrol, destroy, show, hide, resize, etc.
│   ├── Events: onAction, onKeyDown, onMouseDown, onMouseUp, etc.
│   │
│   ├── GuiWindowCtrl            — Window with title bar
│   ├── GuiButtonCtrl            — Push button
│   ├── GuiTextCtrl              — Static text label
│   ├── GuiTextEditCtrl          — Single-line text input
│   ├── GuiMLTextCtrl            — Multi-line rich text
│   │   └── GuiMLTextEditCtrl    — Multi-line editable text
│   ├── GuiScrollCtrl            — Scrollable container
│   ├── GuiTextListCtrl          — Sortable text list with rows
│   ├── GuiTreeViewCtrl          — Tree view with nodes
│   ├── GuiShowImgCtrl           — Image/sprite display
│   ├── GuiDrawingPanel          — Pixel drawing canvas
│   ├── GuiCheckBoxCtrl          — Checkbox
│   │   └── GuiRadioCtrl         — Radio button
│   ├── GuiSliderCtrl            — Slider
│   ├── GuiProgressCtrl          — Progress bar
│   ├── GuiBitmapCtrl            — Bitmap image
│   ├── GuiPopUpMenuCtrl         — Dropdown menu
│   ├── GuiContextMenuCtrl       — Right-click context menu
│   ├── GuiTabCtrl               — Tab strip
│   ├── GuiFrameSetCtrl          — Resizable frame panels
│   ├── GuiFlash                 — Flash content embed
│   ├── GuiBitmapButtonCtrl      — Bitmap-based button
│   ├── GuiPopUpEditCtrl         — Editable dropdown
│   └── etc.
│
├── GuiControlProfile            — Font/color/style profiles for GUI controls
│
├── TSocket                      — TCP/UDP socket
│   ├── .connect(host, port) / .bind(port, isUdp) / .close()
│   ├── .send(data) / .sendudp(data, ip, port)
│   ├── .isconnected / .data / .error / .packagedelimiter
│   ├── SSL: .enablessl, .sslcertfile, .sslkeyfile, .sslcipherlist
│   ├── Events: onConnect, onConnectFailed, onClose, onReceiveData, etc.
│   └── TRTMPClient              — RTMP streaming client
│
├── TDrawingPanel                — Pixel-level drawing canvas
│   ├── .drawimage(x, y, image) / .drawline(x1,y1,x2,y2,width)
│   ├── .drawtext(x, y, text) / .drawcurve(...)
│   ├── .clearall() / .clearrectangle(x,y,w,h)
│   ├── .filterrectangle(x,y,w,h,filter) / .maskimage(...)
│   ├── .saveimage(filename) / .saveimage2(filename, bitdepth)
│   └── .saveimagetostring(filename) / .saveimagetostring2(filename, bitdepth)
│
├── THTTPRequest                 — HTTP request object
│   ├── Properties: .url, .data, .fulldata, .returncode, .contenttype
│   └── Event: onReceiveData()
│
├── TParticleEmitter             — Particle system
│   ├── Properties: .delaymin, .delaymax, .maxparticles, .nrofparticles
│   ├── .particle (object): .lifetime, .image, .alpha, .red, .green, .blue
│   ├── .addlocalmodifier(...) / .addglobalmodifier(...) / .addemitmodifier(...)
│   └── .emit() / .removeparticles() / .removemodifiers()
│
├── TGraalAni                    — GANI animation object
│   ├── .continuous, .loop, .movie, .singledirection
│   ├── .addsprite(int) / .getsprite(int)
│   └── .addstep() / .insertstep(int)
│
├── TUpdatePackage               — Game update package
│   ├── .downloadcomplete, .downloadedsize, .totalsize
│   └── .update() / .reinstall() / .uninstall()
│
├── MovieClip                    — Flash/ActionScript compatibility layer
│   (Full ActionScript API: gotoAndPlay, attachMovie, etc.)
│
└── TStaticVar (special subclasses — "static" objects)
    ├── Array                    — Array.push(), .splice(), .unshift(), .length
    ├── Math                     — Math.sqrt(), Math.atan2(), Math.sin(), Math.PI
    ├── Key                      — Key.isdown(), Key.isaccessible(), Key constants
    ├── Date                     — Date object
    ├── Color                    — Color object
    ├── Sound                    — Sound object
    ├── String                   — String object
    └── MRandomGenerator         — .randfloat(), .randint(), .seed
```

---

## Function Categories That Are Easy to Miss

When working on the reference document, ensure ALL of these categories are covered:

1. **Global server functions** (`gsfunctions`): 37 functions — math, strings, finding players, file ops
2. **Global client functions** (`gsfunctions_client`): 134 functions — input, rendering, audio, GUI
3. **TGraalVar base methods**: Available on ALL objects — join, trigger, scheduleevent, loadlines, savejson, catchevent, clearvars, getvarnames, hasfunction, etc.
4. **TServerNPC methods**: move, setimg, showcharacter, showimg, showtext, shootarrow, etc.
5. **TServerLevel methods**: putbomb, putexplosion, shoot, findareanpcs, tiletype, testnpc, etc.
6. **TPlayer methods** (client): findweapon, getnohit, showemoticon, hidesign, scrollsign
7. **GUI control methods**: Every GuiControl subclass has unique properties and methods
8. **TSocket methods**: connect, bind, send, sendudp, SSL properties
9. **TDrawingPanel methods**: drawimage, drawline, drawtext, filterrectangle, maskimage, saveimage
10. **TParticleEmitter methods**: emit, modifiers, particle properties
11. **Vector/Matrix math**: vectoradd, vectorsub, vectordist, vectorlen, vectorscale, matrixcreate, matrixmultiply, rotationadd, etc.
12. **Box/collision**: boxcontains, boxoverlaps, boxintersect, boxscale, castray
13. **JSON**: loadjson, loadjsonfromstring, savejson, savejsontostring, parsejson (deprecated)
14. **Encryption**: md5, sha256, checksum, base64encode/decode, aes_encrypt/decrypt, des_encrypt/decrypt, rc4_cipher, rsa_encrypt/decrypt/sign/verify
15. **UTF8**: convertlatintoutf8, convertutf8tolatin, isstringutf8, addutf8fontrange
16. **HTTP**: requesturl, requesthttp, urlencode, urldecode
17. **Audio**: play, play2, play3d, playlooped, playlooped2, stopsound, stopsounds, setmusicvolume, setsoundpitch, setsoundpitchbynote
18. **Screenshots**: makescreenshot2, makescreenshotgame, makescreenshotfull
19. **Image inspection**: getimgpixel, getimgwidth, getimgheight, isimgpixeltransparent
20. **Time**: getutctime, formattimestring, converttimetostring, convertstringtotime
21. **Tile system**: addtiledef, removetiledefs, gettileset, gettilesettype
22. **File download**: isdownloading, getdownloadprogress, fileupdate, fileupdateignore
23. **ActionScript/MovieClip**: Full Flash compatibility API
24. **3D/Scene objects**: GameShapeDTS, Camera, Sky, TerrainBlock, WaterBlock, fxSunLight (Graal3D)
25. **World/Terrain editors**: WorldEditor, TerrainEditor (Graal3D)

---

## API Entry Format (For Individual Function Documentation)

When documenting a function for the API (api.gscript.dev), output these 5 fields:

### 1. Scope/Type
Format: `scope, type`
- **Scope**: `clientside` | `serverside` | `global`
- **Type**: `function` | `variable` | `event` | `object`
- Examples: `clientside, function` | `global, variable` | `clientside, event` | `serverside, object`
- **IMPORTANT**: Events (onTimeout, onPlayerEnters, onLogMessage, onFolderLog, etc.) must use type `event`, NOT `variable` or `function`

### 2. Description (MUST include parent class)
Format: `ParentClass.functionname(params) - Brief description.`
- Use the object hierarchy above to find the correct parent class
- KEEP IT SHORT — Discord popup character limits apply

### 3. Parameters
Use descriptive names, NOT raw types:
- ✅ `filename, x, y` ❌ `str, float, float`
- ✅ `player, message` ❌ `obj, str`

### 4. Return Type
One of: `void`, `string`, `bool`, `int`, `float`, `object`, `array`

### 5. Example
- Use real code from `refs/` folder when possible, or craft logical examples
- KEEP IT SHORT — just enough to show usage
- Examples MUST be logical and self-documenting — show the input, the function call, and what it returns/does
- Use inline comments to clarify what the output would be
- Show realistic variable values, not `param1`/`param2` placeholders
- ✅ Good:
  ```javascript
  temp.userInput = "  my name  ";
  temp.clean = temp.userInput.trim(); // Returns "my name"
  ```
- ❌ Bad:
  ```javascript
  temp.line = temp.line.trim();
  ```

### Example Output
```
Scope/Type: clientside, function
Description: TServerNPC.showimg(index, filename, x, y) - Displays an image on screen, returns the image object.
Parameters: index, filename, x, y
Return Type: object
Example:
```javascript
temp.img = showimg(1, "coin.png", player.x, player.y);
temp.img.zoom = 2.0;
```
```

---

## GraalScript_Reference.md Guidelines

When updating the comprehensive reference document:

1. **Every function from `scriptfunctions_client.md` and `scriptfunctions.txt` should be documented**
2. **Use real examples from `refs/`** — search with grep for actual usage
3. **Organize by functional category** (crypto, HTTP, audio, GUI, etc.)
4. **Include the parent class** in function descriptions
5. **Note scope** (clientside/serverside/global) for each function
6. **Cross-reference** the FourPlay source class in a reference section
7. **Document hidden functions** — they still work, just aren't listed
8. **Mark privileged functions** clearly — they only work on login servers
9. **Include common pitfalls** — sqrt clientside only, array initialization, @ not +, etc.

---

## Common AI Mistakes to Avoid

1. **Using `+` for string concatenation** — GS2 uses `@`
2. **Forgetting variable prefixes** — Every variable needs `temp.`, `this.`, `player.`, etc.
3. **Using setter methods** — Use property assignment (`obj.visible = true` not `obj.setVisible(true)`)
4. **Assuming `sqrt()` works serverside** — It's clientside only
5. **Confusing trigger types** — `trigger()` (local event), `triggerserver()` (client→server), `triggeraction()` (tile-based)
6. **Using `{}` then index assignment** — Must use `.add()` or `new[size]` first
7. **Treating GS2 like JavaScript** — No try/catch, no arrow functions, no template literals, no `let`/`const`
8. **Forgetting `//#CLIENTSIDE`** — Code without it runs on the server
9. **Missing the `function` keyword** — GS2 requires `function onCreated() { }` not just `onCreated() { }`
10. **Wrong event names** — Events are `onPlayerTouchsMe` (with the 's'), `onPlayerEnters`, etc.
11. **Using `this.` for temp variables** — Use `temp.` for function-local variables
12. **Not checking refs/ for examples** — Always search real server code for usage patterns

---

## Quick Reference: File Locations

| Purpose | Location |
|---------|----------|
| **Authoritative function list (client)** | `docs/scriptfunctions_client.md` |
| **Authoritative function list (server)** | `docs/scriptfunctions.txt` |
| Wiki class tree | `docs/graal_wiki_dump.xml` |
| Pseudo-code dumps | `ghidra/[ClassName]/` |
| Real server examples | `refs/[ServerName]/` |
| FourPlay C++ source | `D:\Backups\git\Preagonal-fresh\FourPlay\quattroplay\src\` |
| Hidden function notes | `backup/FourPlay_Findings.md` |
| Old API definitions (format ref) | `api_definitions.json` |
| Comprehensive reference doc | `docs/GraalScript_Reference.md` |

---

## Current Status

- **api.gscript.dev** is a mix of human and AI work with inaccuracies and missing functions
- **GraalScript_Reference.md** is being expanded toward 1:1 coverage of every GS2 function
- **scriptfunctions_client.md** contains ~779 unique functions/properties/methods across all object types
- The reference doc should eventually cover ALL of them

---

**END OF CORE REFERENCE**
