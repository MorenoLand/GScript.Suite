# Functions Reference

Complete reference of GraalScript2 functions and variables.

> **Machine-Readable Database**: See `definitions.json` in this folder for the complete function database in JSON format, containing all documented GS2 functions, variables, and their parameters.

## Function Index

### Image Display Functions (Client-side)

| Function | Parameters | Description |
|----------|------------|-------------|
| `showimg` | index, imageFile, x, y | Creates a visual element (index >= 200 is private, < 200 is public) |
| `findimg` | int | Returns TShowImg object at index, creates if not exists |
| `hideimg` | int | Hides image at index |
| `hideimgs` | start, end | Hides images from start to end index |
| `changeimgvis` | index, layer | Changes image layer/visibility |
| `changeimgcolors` | index, r, g, b, a | Tints image with color and transparency |
| `changeimgzoom` | index, float | Sets image zoom factor |
| `changeimgmode` | index, mode | Sets drawing mode (0=add, 1=transparent, 2=subtract, 3=daynight) |
| `changeimgpart` | index, x, y, w, h | Sets image portion to display |
| `showimg2` | index, image, x, y, layer | Creates image with layer |
| `showtext` | index, x, y, font, style, text | Displays text |
| `showtext2` | index, x, y, layer, font, style, text | Displays text with layer |
| `showani` | index, x, y, dir, ani | Displays animation |
| `showani2` | index, x, y, layer, dir, ani | Displays animation with layer |
| `showpoly` | index, coords | Displays polygon |
| `showpoly2` | index, coords | Displays 3D polygon |

### NPC/Player Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `setimg` | imageFile | Sets NPC's main graphic |
| `setimgpart` | imageFile, x, y, w, h | Sets NPC's graphic to portion of image |
| `setshape` | type, w, h | Enables rectangular blocking (type=1, w/h in pixels) |
| `setshape2` | w, h, tiles | Tile-based blocking with tile types array |
| `showcharacter` | none | Makes NPC display as character |
| `setcharani` | ani, param | Sets NPC animation |
| `setcoloreffect` | r, g, b, a | Sets NPC color/alpha effect (0-1) |
| `setzoomeffect` | float | Zooms/shrinks NPC |
| `move` | dx, dy, time, options | Moves NPC smoothly |
| `warpto` | level, x, y | Warps NPC to level/position |

### Player Control Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `freezeplayer` | time | Freezes player for duration (seconds) |
| `freezeplayer2` | none | Freezes player until unfreezeplayer() |
| `unfreezeplayer` | none | Unfreezes player |
| `setplayerdir` | dir | Sets player direction (0=up, 1=left, 2=down, 3=right) |
| `setplayerprop` | varname, value | Sets player property |
| `setani` | ani, param | Sets player animation |
| `setbody` | filename | Sets player body image |
| `sethead` | filename | Sets player head image |
| `setsword` | filename, power | Sets player sword |
| `setshield` | filename, power | Sets player shield |
| `setgender` | gender | Sets player gender |
| `setlevel2` | level, x, y | Warps player to level/coordinates |
| `serverwarp` | servername | Warps to another server |
| `seturllevel` | url | Warps to level via URL (deprecated) |
| `say` | int | Makes player say something |
| `say2` | text | Displays text over player |

### Combat Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `hurt` | damage | Deals damage to NPC |
| `hitplayer` | playerid, damage, x, y | Hits player with damage |
| `hitnpc` | npcid, damage, x, y | Hits NPC with damage |
| `shoot` | x, y, z, angle, zangle, speed, ani, param | Shoots projectile |
| `shootarrow` | dir | Shoots arrow |
| `shootfireball` | dir | Shoots fireball |
| `shootfireblast` | dir | Shoots fireblast |
| `shootnuke` | dir | Shoots nuke |
| `shootball` | none | Shoots ball |
| `spyfire` | length, power | Shoots horse fire |

### Item Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `lay` | itemname | Lays item on ground |
| `take` | itemname | Takes item from ground |
| `take2` | id | Takes item by ID |
| `carryobject` | object | Makes player carry object |
| `throwcarry` | none | Throws carried object |
| `takehorse` | id | Takes horse by ID |
| `takeplayercarry` | none | Removes player's carried object |
| `takeplayerhorse` | none | Removes player's horse |

### Object Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `destroy` | none | Removes and deletes object |
| `sleep` | time | Suspends script execution (seconds) |
| `join` | classname | Joins/inherits from class |
| `leave` | classname | Leaves class |
| `isinclass` | classname | Checks if object has joined class |
| `trigger` | eventname, params... | Invokes event on object |
| `scheduleevent` | delay, eventname, params... | Schedules event for later |
| `setTimer` | seconds | Schedules onTimeout event |
| `callnpc` | id, params... | Calls NPC script by index |

### Finding Objects

| Function | Parameters | Description |
|----------|------------|-------------|
| `findplayer` | account | Finds player by account name |
| `findplayer2` | name | Finds player by account or community name |
| `findplayerbyid` | id | Finds player by ID |
| `findplayerbycommunityname` | name | Finds player by community name |
| `findnpc` | name | Finds NPC by name |
| `findnpcbyid` | id | Finds NPC by ID |
| `findweapon` | name | Finds weapon by name |
| `findlevel` | name | Finds level by name |
| `findobject` | name | Finds object by name |
| `findareaplayers` | x, y, w, h | Returns players in rectangle |
| `findnearestplayer` | x, y | Returns nearest player to position |

### String Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `strlen` | string | Returns string length |
| `strpos` | string, substring | Returns position of substring (-1 if not found) |
| `strequals` | str1, str2 | Compares strings (boolean) |
| `strcmp` | str1, str2 | Compares strings (integer) |
| `contains` | str, substr | Checks if string contains substring |
| `escape` | none | Escapes string for SQL (add backslashes) |
| `escapestring` | str | Escapes string for MySQL |
| `escapestring2` | str | Escapes string for SQLite |
| `starts` | text | Checks if string starts with text |
| `trim` | none | Removes leading/trailing whitespace |
| `wraptext` | width, delim, text | Wraps text to width |
| `checksum` | str | Calculates CRC32 checksum |
| `md5` | str | Calculates MD5 hash |
| `base64encode` | str | Encodes to base64 |
| `base64decode` | str | Decodes from base64 |
| `randomstring` | length | Generates random alphanumeric string |

### String Methods

| Method | Description |
|--------|-------------|
| `.length()` | Returns length |
| `.upper()` | Converts to uppercase |
| `.lower()` | Converts to lowercase |
| `.substring(start, end)` | Extracts portion |
| `.pos(substring)` | Finds position of substring |
| `.tokenize(delimiter)` | Splits into array |
| `.starts(prefix)` | Checks if starts with prefix |
| `.trim()` | Removes whitespace |
| `.escape()` | Escapes for SQL |

### Math Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `abs` | float | Absolute value |
| `floor` | float | Rounds down |
| `ceil` | float | Rounds up |
| `round` | float | Rounds to nearest |
| `int` | value | Converts to integer (truncates) |
| `sin` | float | Sine (radians) |
| `cos` | float | Cosine (radians) |
| `tan` | float | Tangent (radians) |
| `arcsin` | float | Arc sine |
| `arccos` | float | Arc cosine |
| `arctan` | float | Arc tangent |
| `sqrt` | float | Square root |
| `pow` | base, exp | Power |
| `log` | base, value | Logarithm |
| `min` | a, b | Smaller of two |
| `max` | a, b | Larger of two |
| `random` | min, max | Random float in range |
| `vecx` | dir | X component of direction |
| `vecy` | dir | Y component of direction |
| `getangle` | dx, dy | Angle from delta |
| `degtorad` | deg | Degrees to radians |
| `radtodeg` | rad | Radians to degrees |

### Array Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `arraylen` | array | Returns array length |
| `addstring` | array, string | Adds string to array (deprecated) |
| `deletestring` | array, index | Deletes element at index |
| `insertstring` | array, index, string | Inserts at index |
| `removestring` | array, string | Removes by value |
| `replacestring` | array, index, string | Replaces at index |
| `getstringkeys` | prefix | Returns keys matching prefix |

### Array Methods

| Method | Description |
|--------|-------------|
| `.size()` | Returns length |
| `.add(obj)` | Adds element |
| `.remove(obj)` | Removes element |
| `.index(obj)` | Finds index of element |
| `.clear()` | Clears array |
| `.sortascending()` | Sorts ascending |
| `.sortdescending()` | Sorts descending |

### Pathfinding Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `findpathinarray` | grid, walkable, blocking, stop, nostop, startY, startX, maxLength | Finds a path through a 2D array grid. The start coordinates are passed as row/column (`y`, then `x`). The returned path is an array of nodes shaped like `{y, x}`. |

`findpathinarray` expects the grid to be indexed as `grid[y][x]`. A common wall grid for character-sized NPC movement uses `onwall2(x + 0.5, y + 1, 2, 2)` and marks blocking tiles as `1`.

```gs2
function getLevelGrid() {
  temp.grid = new[this.level.height - 1];

  for (temp.y = 0; temp.y < this.level.height - 1; temp.y++) {
    temp.row = new[this.level.width - 1];
    for (temp.x = 0; temp.x < this.level.width - 1; temp.x++) {
      temp.row[temp.x] = onwall2(temp.x + 0.5, temp.y + 1, 2, 2) ? 1 : 0;
    }
    temp.grid[temp.y] = temp.row;
  }

  return temp.grid;
}

function findPath(cx, cy, tx, ty) {
  temp.grid = getLevelGrid();
  temp.grid[ty][tx] = 2;

  temp.path = findpathinarray(
    temp.grid,
    {0, 2, 3},
    {1},
    {2},
    NULL,
    cy,
    cx,
    this.level.width * this.level.height
  );

  if (temp.path != NULL && temp.path.size() > 0) {
    temp.path.delete(0);
  }

  return temp.path;
}

function followPath() {
  temp.next = this.path[this.pathindex];
  temp.nextY = int(temp.next[0]);
  temp.nextX = int(temp.next[1]);
}
```

### File Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `fileexists` | path | Checks if file exists |
| `filesize` | path | Returns file size |
| `deletefile` | path | Deletes file |
| `getfilemodtime` | path | Returns modification time (unix) |
| `loadlines` | path | Loads file as array of lines |
| `loadstring` | path | Loads file content |
| `savelines` | path, mode | Saves array to file (0=overwrite, 1=append) |
| `savestring` | path, mode | Saves string to file |
| `savelog` | message | Logs to F2 window |
| `savelog2` | filename, message | Logs to file in logs/ folder |

### Sound Functions (Client-side)

| Function | Parameters | Description |
|----------|------------|-------------|
| `play` | soundFile | Plays sound at player position |
| `play2` | sound, x, y, volume | Plays sound at position |
| `playlooped` | soundFile | Plays sound in loop |
| `playlooped2` | sound, x, y, volume | Loops sound at position |
| `stopmusic` | none | Stops all music |
| `stopsound` | soundFile | Stops specific sound |
| `stopsounds` | includeLooped | Stops all sounds |
| `ismusicplaying` | none | Checks if music playing |
| `issoundplaying` | soundFile | Checks if sound playing |
| `musiclen` | none | Returns music length |
| `musicpos` | none | Returns music position |

### Weapon Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `addweapon` | weaponName | Adds weapon to player |
| `removeweapon` | weaponName | Removes weapon from player |
| `hasweapon` | weaponName | Checks if player has weapon |
| `callweapon` | index, params... | Calls weapon by index (deprecated) |

### Level Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `putnpc2` | x, y, script | Creates NPC at position |
| `putexplosion2` | power, range, x, y | Creates explosion |
| `tiletype` | x, y | Returns tile type at position |
| `testplayer` | x, y | Tests for player at position |
| `noplayerkilling` | none | Disables player killing |

### Trigger Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `triggerclient` | type, name, action, params... | Triggers client event |
| `triggerserver` | type, name, action, params... | Triggers server event |

### Dialog Functions (Client-side)

| Function | Parameters | Description |
|----------|------------|-------------|
| `pushDialog` | control | Pushes control as modal dialog |
| `popDialog` | none | Pops top dialog |
| `popAllDialogs` | none | Pops all dialogs |

### Feature Control (Client-side)

| Function | Parameters | Description |
|----------|------------|-------------|
| `enablefeatures` | flags | Enables client features |
| `disableselectweapons` | none | Disables weapon select |
| `enableselectweapons` | none | Enables weapon select |

### Database Functions (Server-side)

| Function | Parameters | Description |
|----------|------------|-------------|
| `dbQuery` | sql | Executes SQL query |
| `executeQuery` | sql | Executes SQL query |
| `dbLastError` | none | Returns last SQL error |
| `requestsql` | sql, expectResult | Async SQL query |
| `requestsql2` | db, sql, expectResult | Async SQL to specific database |

### Output Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `echo` | message | Outputs to RC (server) or F2 (client) |
| `trace` | message | Same as echo |
| `message` | text | Displays text over NPC |
| `toall` | message | Sends message to all |

## Curated API Examples

This section only includes functions whose API entries have complete enough examples to explain the behavior confidently. Short one-line stubs and unclear examples are intentionally left in the index only.

### Image Display Details

#### showimg(index, imageFile, x, y)

Creates a `TShowImg` image at world coordinates. On client-side scripts, indices `>= 200` are local to the current client. Indices below `200` are public and can be visible to other players.

`showimg()` returns or creates a show image object, and the same object can be adjusted later through `findimg(index)`.

```gs2
//#CLIENTSIDE
function onCreated() {
    showimg(200, "fire.gif", player.x + 0.5, player.y - 1.5);

    with (findimg(200)) {
        x = player.x + 0.5;
        y = player.y - 1.5;
        red = random(0, 0.3);
        layer = 1;
    }
}
```

Common properties set inside `with (findimg(index))` include `x`, `y`, `red`, `green`, `blue`, `alpha`, `zoom`, `rotation`, `layer`, `image`, and `text`.

#### changeimgmode(index, mode)

Sets how a show image blends with the level. Known modes from the API are `0` additive, `1` transparent, `2` subtractive, and `3` day/night.

```gs2
//#CLIENTSIDE
function onCreated() {
    showimg(200, "glow.png", this.x, this.y);
    changeimgmode(200, 1); // transparent
}
```

#### changeimgpart(index, x, y, width, height)

Crops the displayed region of a show image, useful for spritesheets, bars, and large item icons. Calling `showimg()` again for the same index resets the image to the full graphic.

```gs2
//#CLIENTSIDE
function onCreated() {
    showimg(200, "spritesheet.png", this.x, this.y);
    changeimgpart(200, 5, 12, 32, 32);
}
```

### NPC Shape and Visual Effects

#### setshape2(width, height, tileTypes)

Creates a tile-based shape for an NPC. The width and height are in tiles, and `tileTypes` must contain `width * height` entries.

Common tile type values:

| Value | Meaning |
|-------|---------|
| `0` | Nonblocking |
| `3` | Chair |
| `11` | Water |
| `12` | Lava |
| `20` | Throw-through/fence |
| `21` | Jumping stone |
| `22` | Blocking tile |

```gs2
function onCreated() {
    // Create a 2x2 chair.
    setshape2(2, 2, {3, 3, 3, 3});

    // Create a 2x2 blocking shape.
    setshape2(2, 2, {22, 22, 22, 22});

    // Shapes can also be built from arrays.
    temp.tiles = {22, 22, 0, 0};
    setshape2(2, 2, temp.tiles);
}
```

#### setcoloreffect(red, green, blue, alpha)

Tints an NPC and controls its transparency. Values are floats from `0` to `1`, with `1, 1, 1, 1` as the normal full-color, fully visible state.

```gs2
//#CLIENTSIDE
function onCreated() {
    setcoloreffect(1, 0.5, 0.2, 0.6); // orange, partly transparent
    seteffectmode(1); // transparent blend instead of additive
}
```

#### drawaslight()

Draws the NPC above the day/night overlay but below the status bar. This is useful for lights, fire, glows, and similar effects.

```gs2
//#CLIENTSIDE
function onCreated() {
    setimg("light2.png");
    drawaslight();
    dontblock();
    setcoloreffect(1, 1, 0, 0.5);
}
```

### Finding and Calling Objects

#### findnpc(name)

Finds a server-side NPC object by name. Use it to read public object variables or call functions on database/control NPCs.

```gs2
function onCreated() {
    temp.database = findnpc("PlayerDatabase");
    this.player_data = temp.database.player_data;

    findnpc("BossSpawner").onSpawnBoss();

    with (findnpc("Turret")) {
        x = 30;
        y = 40;
    }
}
```

#### findnpcbyid(id)

Finds a server-side NPC by numeric ID. Check for `null` before using the result if the ID may not exist.

```gs2
function onCreated() {
    temp.target = findnpcbyid(100);
    if (temp.target == null) {
        player.chat = "NPC not found";
        return;
    }

    player.chat = "Found NPC at " @ temp.target.x @ ", " @ temp.target.y;
    temp.target.chat = "Hello";
}
```

#### triggeraction(x, y, actionName, params...)

Triggers an action event on NPCs at the given position. The action name is appended to `onAction`, so `triggeraction(x, y, "warpPlayer")` calls `onActionwarpPlayer()` on matching NPCs.

```gs2
function onPlayerTouchsMe() {
    triggeraction(this.x + 1, this.y + 1, "warpPlayer");
    triggeraction(this.x + 1, this.y + 1, "CreateInstance", this.instance_id);
}

function onActionCreateInstance(instanceId) {
    this.last_instance = instanceId;
}
```

### SQL Requests

#### requestsql(query, expectResult)

Runs a SQL query against the default database and returns a request object. When `expectResult` is `true`, wait for `onReceiveData` before reading `req.rows`.

```gs2
function loadPlayer(account) {
    temp.safeAccount = account.escape();
    temp.req = requestsql(
        "SELECT * FROM players WHERE account = '" @ temp.safeAccount @ "'",
        true
    );

    waitfor(temp.req, "onReceiveData", 60);
    echo(temp.req.rows);
}
```

#### requestsql2(database, query, expectResult)

Works like `requestsql()`, but targets a named database.

```gs2
function loadScore(account) {
    temp.safeAccount = account.escape();
    temp.req = requestsql2(
        "secondary_db",
        "SELECT score FROM stats WHERE account = '" @ temp.safeAccount @ "'",
        true
    );

    waitfor(temp.req, "onReceiveData", 60);
    echo(temp.req.rows);
}
```

Use `.escape()` on string values that are interpolated into SQL. Prefer `expectResult = false` for writes where no rows need to be read.

### Direction and Angle Helpers

#### getdir(dx, dy)

Returns the closest Graal direction (`0` up, `1` left, `2` down, `3` right) from a delta vector.

```gs2
function facePlayer() {
    temp.dx = player.x - this.x;
    temp.dy = player.y - this.y;
    this.dir = getdir(temp.dx, temp.dy);
}
```

#### getangle(dx, dy)

Returns the angle in radians for a delta vector. This is often used for projectile direction, rotation, or knockback.

```gs2
function aimAtTarget(target) {
    temp.dx = target.x - this.x;
    temp.dy = target.y - this.y;
    temp.angle = getangle(temp.dx, temp.dy);
}
```

#### vecx(dir) and vecy(dir)

Convert a Graal direction into X/Y movement components.

```gs2
function stepForward(distance) {
    this.x += vecx(this.dir) * distance;
    this.y += vecy(this.dir) * distance;
}
```

### Client Feature and HUD Helpers

#### enablefeatures(flags)

Controls built-in client features using a bitmask. Use `allfeatures` and subtract flags to disable only specific features.

```gs2
//#CLIENTSIDE
function onCreated() {
    enablefeatures(allfeatures - 0x100); // hide hearts over player heads
    enablefeatures(allfeatures - 1 - 2); // disable map and pause
    enablefeatures(1 + 2 + 4); // enable only map, pause, and weapon select
}
```

#### showstats(flags)

Controls the built-in status display. Use `allstats` and subtract flags to hide individual HUD pieces.

```gs2
//#CLIENTSIDE
function onCreated() {
    showstats(allstats);
    showstats(allstats - 0x20); // all except hearts
    showstats(0); // hide all stats
    showstats(0x4 + 0x8); // only rupees and bombs
}
```

Known `showstats()` flags from the API:

| Flag | Meaning |
|------|---------|
| `0x1` | ASD |
| `0x2` | Icons |
| `0x4` | Rupees count |
| `0x8` | Bombs count |
| `0x10` | Arrows count |
| `0x20` | Hearts |
| `0x40` | AP bar |
| `0x80` | MP bar |
| `0x100` | Minimap |
| `0x200` | Inventory |
| `0x400` | Player |

#### takeplayercarry() and takeplayerhorse()

Remove the object the player is carrying, or dismount the player from a horse/mount.

```gs2
//#CLIENTSIDE
function onPlayerEnters() {
    if (player.iscarrying) {
        takeplayercarry();
        player.chat = "You must drop that to proceed!";
    }

    if (player.level.name.starts("inside_")) {
        takeplayerhorse();
        player.chat = "Horses not allowed here!";
    }
}

```

## Pre-defined Variables

### Player Variables

| Variable | Type | Description |
|----------|------|-------------|
| `player.account` | string | Account name |
| `player.nick` | string | Display nickname |
| `player.communityname` | string | Community name |
| `player.x` | float | X position |
| `player.y` | float | Y position |
| `player.z` | float | Z position |
| `player.dir` | int | Direction (0-3) |
| `player.hearts` | float | Current health |
| `player.maxhearts` | float | Maximum health |
| `player.rupees` | int | Money |
| `player.bombs` | int | Bomb count |
| `player.arrows` | int | Arrow count |
| `player.level.name` | string | Current level name |
| `player.chat` | string | Player's chat message |
| `player.guild` | string | Guild name |
| `player.headimg` | string | Head image |
| `player.bodyimg` | string | Body image |
| `player.swordimg` | string | Sword image |
| `player.shieldimg` | string | Shield image |
| `player.ap` | int | AP (alignment points) |
| `player.mp` | float | MP (magic points) |
| `player.gralats` | int | Currency |
| `player.id` | int | Player ID |

### Level Variables

| Variable | Type | Description |
|----------|------|-------------|
| `level.name` | string | Level name |
| `level.npcs` | array | NPCs in level |
| `level.players` | array | Players in level |
| `level.width` | int | Level width (tiles) |
| `level.height` | int | Level height (tiles) |

### Input Variables (Client-side)

| Variable | Type | Description |
|----------|------|-------------|
| `mousex` | float | Mouse X (world coords) |
| `mousey` | float | Mouse Y (world coords) |
| `mousescreenx` | int | Mouse X (screen) |
| `mousescreeny` | int | Mouse Y (screen) |
| `leftmousebutton` | bool | Left button held |
| `rightmousebutton` | bool | Right button held |
| `middlemousebutton` | bool | Middle button held |
| `mousewheeldelta` | int | Scroll amount |

### System Variables

| Variable | Type | Description |
|----------|------|-------------|
| `timevar2` | float | Unix timestamp |
| `servername` | string | Server name |
| `allfeatures` | int | All feature flags |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `pi` | 3.14159... | Mathematical pi |
| `true` | 1 | Boolean true |
| `false` | 0 | Boolean false |
| `null` | | Null value |

## NPC Variables

| Variable | Type | Description |
|----------|------|-------------|
| `this.x` | float | NPC X position |
| `this.y` | float | NPC Y position |
| `this.z` | float | NPC Z position |
| `this.dir` | int | NPC direction |
| `this.hearts` | float | NPC health |
| `this.maxhearts` | float | NPC max health |
| `this.chat` | string | NPC chat bubble |
| `this.image` | string | NPC image |
| `this.name` | string | NPC name (read-only) |
| `this.id` | int | NPC ID (read-only) |
| `this.level` | object | Level object |

## Operators

### Arithmetic

| Operator | Description |
|----------|-------------|
| `+` | Addition |
| `-` | Subtraction |
| `*` | Multiplication |
| `/` | Division |
| `^` | Power/Exponent |
| `%` | Modulo (remainder) |

### Comparison

| Operator | Description |
|----------|-------------|
| `==` | Equals |
| `!=` | Not equals |
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |

### Logical

| Operator | Description |
|----------|-------------|
| `&&` | AND |
| `\|\|` | OR |
| `!` | NOT |

### Assignment

| Operator | Description |
|----------|-------------|
| `=` | Assign |
| `+=` | Add and assign |
| `-=` | Subtract and assign |
| `*=` | Multiply and assign |
| `/=` | Divide and assign |
| `++` | Increment by 1 |
| `--` | Decrement by 1 |

### String

| Operator | Description |
|----------|-------------|
| `@` | Concatenate (no space) |
| `SPC` | Concatenate with space |

### Range

| Operator | Description |
|----------|-------------|
| `in \|min,max\|` | Check if in range (inclusive) |

## Feature Flags (enablefeatures)

| Flag | Value | Description |
|------|-------|-------------|
| Map | 1 | M key |
| Pause | 2 | P key |
| Weapon Select | 4 | Q key |
| Ratings | 8 | R key |
| Drop Items | 0x10 | S+A |
| Switch Weapons | 0x20 | S+D |
| Tab | 0x40 | TAB key |
| Chat Display | 0x80 | Chat text |
| Hearts | 0x100 | Hearts over heads |
| Nicknames | 0x200 | Player nicknames |
| Right-click Profile | 0x800 | Profile on right-click |
| Emoticons | 0x1000 | Emoticons |
| F2 Output | 0x8000 | savelog/echo |
