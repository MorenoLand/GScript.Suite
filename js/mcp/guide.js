// GSuite MCP: what an agent is told about the app: the server instructions, the
// guides (served as resources and through app_get_guide) and the prompts.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;

    // The server's instructions: MCP clients give this text to the agent as part of its system
    // prompt. It is also the guide "rules", for clients that do not pass instructions on.
    const RULES = `# Working in GSuite

GSuite is an editor suite for Graal Online game content, and you are driving the running app: every edit you make appears live in its window. You can build levels (.nw), gmaps (grids of levels forming one seamless world), NPC scripts (GraalScript), animations (.gani) and GS2 particle effects.

## Before you build
1. Call app_get_state to see what is open and where files live.
2. Read app_get_guide "world-building" before creating a world, and the format guide for whatever you are making ("gscript", "gani-format", "particles", "tiles").
3. Agree a folder for the work, create it, and make it the workspace (workspace_set_directory) so images and levels resolve by name.

## Conventions that never change
- Positions are in tiles (16 pixels), x right, y down. A level is 64x64 tiles.
- In a gmap, pass the gmap's name as \`level\` for world coordinates, or a member level's name for that level's own 0-63 coordinates.
- A tile index is row * 128 + column in the classic 128-column tileset image (in general: row * the tileset's columns + column). Never guess indices: use world_generate, the tile object library (level_list_tile_objects) or tiles you have read with level_get_tiles / level_view_tileset.
- A player takes up 2x2 tiles on the ground, half a tile right of and one tile below its position.
- File paths are absolute. Level file names are lowercase with no spaces.

## Tiles
- Build land with world_generate and structures with level_place_tile_object; it returns each footprint. Keep footprints from overlapping each other, water and cliffs, and keep a structure inside one 64x64 level of a gmap.
- After every batch of edits take a level_screenshot and look at it: wrong tiles, cut-off buildings and overlaps are only visible there. Zoom into each structure you placed. Fix what is wrong before going on; level_undo reverts a step.

## Links between levels
A link is a rectangle that warps the player. Get every one of these right:
- The target is a level file name. To arrive in a gmap, name the member level and give coordinates inside it (0-63), never the .gmap and never world coordinates.
- Put the link on ground the player can reach: for a door, the walkable row directly in front of it, 2 tiles wide (level_get_walkability shows it). Door tiles themselves are solid.
- target_x / target_y are the player's position. To arrive on the free 2x2 block whose top-left tile is (c, r), use (c - 0.5, r - 1). Arrive beside the link that leads back, not on it.
- Every link needs a way back: a door into a house needs a link out of that house that arrives in front of the door.
- The target level must exist: create it and save it into the same folder.

## NPCs and scripts
- Do not write GraalScript from memory. Confirm a function's name and argument order with script_reference (api.gscript.dev), and search the user's own script folders with script_examples_search. The guide "gscript" is the short version.
- In GS2, join strings with @ (never +) and give every variable its prefix (this., temp., player., client., server.). Event names are exact and case-sensitive (onPlayerTouchsMe).
- Run script_check on every script you write.
- An NPC's image must exist: app_list_bundled_files and workspace_find_files list what does; app_view_image shows one.

## Verify before you say it is done
- level_check on the gmap and on every separate level, until none reports an error. It finds unreachable and dangling links, arrivals inside walls, missing images, script errors and unset tiles.
- Walk the important routes in play mode (play_start, play_move): from the start point to each door, through it, and back out. Stop play mode before editing another level.
- Look at animations with gani_render_sheet and at particle effects with particle_render.
- Save with level_save (a gmap saves all its member levels) and gani_save, then confirm the files with fs_list_directory. Nothing is on disk until saved.

## Live servers (Remote Control)
Everything above works on local files. If the user turned on the Remote Control bridge there are also rc_* tools and remote_upload / remote_download, and those act on a real game server with players on it.
- Touch a server only when the user asked for that in this conversation. Being asked to build something is not being asked to upload it.
- Start with remote_status, read the guide "remote-control", and name the server in every call.
- Read before you write. Send only what you checked and saved locally, and run remote_upload with dry_run first.
- Remote Control normally asks its user before a change (remote_status says whether it does). If they decline, stop and ask what they want: no retrying, no other route. If it does not ask, get the user's go-ahead yourself first. Never change the bridge's or Remote Control's settings.

## Conduct
- Each call that edits tiles, objects, sprites or frames is one undo step (level_undo, gani_undo); settings, layers and tilesets are not undoable. No tool opens a dialog. If the app seems stuck, check app_dialogs.
- Prefer the dedicated tools; app_eval_js is a last resort.
- Report what you built, where the files are, and anything you could not verify.`;

    mcp.setInstructions(RULES);

    const GUIDES = {
        'rules': {
            title: 'Working in GSuite: the rules',
            summary: 'The operating rules for agents: conventions, linking, verification. Read first',
            text: RULES,
        },

        'remote-control': {
            title: 'Remote Control: working on a live server',
            summary: 'The rc_* tools and remote_upload: who decides what is allowed, sending a world to a server, fetching files, undoing',
            text: `# Remote Control: working on a live server

Remote Control (RC) is the administration client for Graal servers. When the user turns its bridge on in GSuite, this MCP server also offers RC's own tools, all named rc_*, and adds four that join the two: remote_status, remote_call, remote_upload and remote_download. Everything else in GSuite works on local files; these work on a running game server.

## Who decides
- RC's user decides, in RC's Options > MCP, which tools exist: "Allow read-only tools", "Allow file and script writes", "Allow server and game mutations", "Allow login and connection control", "Allow window and UI control", "Allow administrative actions", or "Full native RC control" for all of them. A tool whose box is unticked is not listed and answers "Tool unavailable or disabled by MCP scope". The list can change while you work.
- With "Require approval for mutations" on (the default) RC asks its user before a change, and the call waits for the answer for as long as that takes. Script types the user set to always allow are not asked about. "Mutation denied by user" means no: stop and ask the user what they want. Never rephrase, split or repeat a refused request.
- remote_status reports \`approvals\`. If it is false RC asks nothing and every change takes effect at once: get the user's go-ahead yourself before each one.
- RC can be limited to one server ("outside configured MCP server scope"), and can have MCP switched off altogether ("MCP integration is disabled in RC Options").
- You cannot change these settings and must not try, in RC or in GSuite.

## Before any call
1. remote_status: is the bridge connected, which rc_* tools exist, which servers RC is connected to, are approvals on. Give it a tool name to read that tool's arguments.
2. Name the server in every call (\`server\`). Without it RC uses whichever server is selected in its window, and its user can change that at any moment.
3. Read first: rc_session_info (logged in, upload size limit), rc_list_files without a folder (the folders this account may read and write, with their file patterns), rc_list_files with a folder (what is there now).

If your client does not show the rc_* tools in its own list, call them through remote_call.

## Sending a world you built
1. Finish it locally: level_check without errors, walked in play mode, saved with level_save.
2. remote_upload with dry_run: true. Give the .gmap (its member levels come with it) and the images and ganis the levels use. It compares each file with the server and reports where it would go and whether it is new, changed or unchanged. Nothing is sent and nobody is asked.
3. remote_upload again without dry_run. Only the new and changed files are sent. RC asks its user once for the files, and backs up every file it replaces.
4. The server is then asked to reload the levels that were sent (rc_update_levels, which needs "Allow server and game mutations"); RC asks its user about that separately. Until a level is reloaded, players see the old one. If the reload is declined the files are still on the server: say so, and do not ask again.
5. Confirm: rc_list_files shows the files and their sizes; rc_find_missing_files lists the images, ganis and sounds that levels use and the server lacks, with the folder each belongs in. A server can refuse an upload without saying so, so "sent" is not proof.

Each file goes to the writable folder whose pattern matches its name (levels/*.nw, images/*.png and so on), spelled the way rc_list_files spells it. When two folders fit, pass \`folder\`. A file the server already has under a differently-cased name is replaced under the server's name.

## Fetching files to work on here
remote_download copies server files into a local folder; nothing changes on the server. With open: true the levels open in the level editor. Edit and check them here, then remote_upload the ones you changed.

## Scripts on the server
Weapons, classes and database NPCs live in the server's NPC-Control (NC), not in level files: rc_list_scripts, rc_read_script and rc_write_script work on them, and need the NC connected (rc_nc_connect). Check a script with script_check here, and with rc_check_script if RC offers it, before writing it. rc_write_script accepts guarded edits (expected / replacement), so a small change does not mean resending the whole script.

## Undoing
- rc_backups lists what RC saved before each replace or delete; rc_restore_backup puts one back.
- A call that timed out or was cancelled may still be carried out if RC's user allows it later. Look (rc_list_files, rc_read_file) before repeating it.

## What not to do
- Do not try things out on a live server. Build and test in GSuite, then send the result.
- Do not send commands, messages, or changes to players, accounts or server options unless the user asked for exactly that.
- Do not replace or delete what you did not put there in this session unless the user said so.`,
        },

        'overview': {
            title: 'GSuite and its MCP tools',
            summary: 'What the app edits and how the tools are organised',
            text: `# GSuite and its MCP tools

GSuite edits the content of Graal Online style 2D games. These tools drive the running app, so the person at the screen sees every change as you make it.

## What you can build
- **Levels**: 64x64-tile maps (\`.nw\` text format; \`.graal\`/\`.zelda\` legacy binary). Layers of tiles from a tileset image, plus objects: NPCs (scripted objects), links (warps), signs, chests and baddies.
- **Gmaps**: a \`.gmap\` file lays levels out on a grid so they join into one seamless world. In the editor a gmap is one big level.
- **NPC scripts**: GraalScript (GS1 or GS2) stored in each NPC. See the guide "gscript" and confirm functions with script_reference.
- **Animations**: \`.gani\` files: sprites cut from images, placed per frame and per direction. A \`.gani\` can also be a **movie**: a cutscene with actors, texts, sprites and sounds placed on a timeline by keyframes.
- **Particle effects**: GS2 emitter scripts, previewed in ParticleEmu and exported as GIF, animated PNG or video.
- **Shapes**: setshape2 / setimgpart statements for NPC collision and sprite sheets.

## Tool groups
| Prefix | For |
|---|---|
| app_ | app state, tabs, guides, settings, theme, screenshots, bundled files, viewing images, running JavaScript |
| fs_, workspace_ | files on disk and the workspace folder GSuite resolves images and levels from |
| level_ | everything inside a level or gmap: tiles, tile objects, NPCs, links, signs, chests, baddies, layers, tilesets, screenshots, saving |
| gmap_, world_ | creating gmaps, heightmap terrain, generating a world from a terrain map |
| play_ | walking through a level in play mode to test it |
| npc_library_ | NPC templates shipped with the app |
| gani_ | animations and movies: sprites, frames, keyframes, pictures of them, GIF and video export |
| particle_ | particle effects: the script, pictures of it over time, export |
| setshape_, script_ | setshape2/setimgpart code, formatting, syntax check, the function reference (api.gscript.dev) and examples from the user's own script folders |
| remote_, rc_ | a live game server through Remote Control, only when the user turned that bridge on (guide "remote-control") |

## Conventions
- **Coordinates** are in tiles (1 tile = 16 pixels), x to the right, y down, from the top-left corner. A level is 64x64. NPC positions may use half tiles.
- **\`level\` argument**: a level name or index. For a gmap, pass the gmap name to use world coordinates (0 to columns*64), or a member level name to use that level's own 0-63 coordinates.
- **Tile index**: \`row * 128 + column\` in the tileset image (the classic tileset is 128 columns by 32 rows of 16px tiles; a narrower tileset uses its own column count). \`-1\` is empty. See the guide "tiles".
- **Nothing is on disk until you save.** level_save and gani_save write files; paths are absolute. app_get_state gives the home, documents and workspace folders.
- **Undo**: each tool call that edits tiles, objects, sprites or frames is one undo step (level_undo, gani_undo); every open level and animation has its own history.
- **See your work**: level_screenshot, gani_render_sheet, gani_render, gani_render_movie, particle_render and app_screenshot return images; level_export_image writes a picture of a level or gmap to a PNG file.
- **Learn from what ships with the app**: level_open with bundled opens finished example levels, gani_open with bundled the classic player animations, and npc_library_list the NPC templates.

## If something is not covered
app_eval_js runs JavaScript in the app with access to all editor state. Prefer the dedicated tools: they keep undo, redraw and unsaved-change tracking right.`,
        },

        'world-building': {
            title: 'Building a game world step by step',
            summary: 'A workflow from empty folder to a playable, saved world',
            text: `# Building a game world step by step

1. **Pick a folder.** app_get_state lists the home and documents folders. Create a folder for the world (fs_make_directory) and make it the workspace (workspace_set_directory) so images and linked levels resolve by name.

2. **Lay out the land.** world_generate turns a terrain map into a gmap of real levels: grass, forest, water with shorelines, mountains with cliffs, sand, swamp. Draw features at least 6 tiles wide. For a hand-built map start from gmap_new (flat grass) or level_new (one level).

3. **Look at it.** level_screenshot on the gmap shows every level at once with tile coordinates on the edges and yellow lines between levels. Zoom in by passing a member level name or a region.

4. **Add structures.** level_list_tile_objects lists ready-made pieces (Tree, House, Bush, Well, Bridge, fences, castle walls, ...). level_place_tile_object stamps them; it returns each footprint so you can keep paths clear. level_fill_rect repeats a small object over an area (paths, floors). For anything else, study existing tiles with level_get_tiles and level_view_tileset, then paint with level_set_tiles.

5. **Build interiors as their own levels.** level_new, fill with "Blackness", lay a floor ("HouseGround") and walls (the WallN/WallS/WallE/WallW and Corner objects of the "House Inside" group), add furniture.

6. **Connect levels.** level_add_link puts a warp rectangle: in front of the house door outside, pointing at the interior, and on the interior's doorway pointing back. Gmap members join automatically; links are only needed between separate levels.
   - A link has to lie on tiles the player can reach. Buildings block on their whole footprint, door tiles included, so the link goes on the first walkable row in front of the door. level_get_walkability shows that row; make the link 2 tiles wide.
   - To come back out into a gmap, target the member level by name with coordinates inside that level.
   - On the ground a player takes up a 2x2 block of tiles, half a tile right of and one tile below its position. target_x / target_y set the position: to arrive on the block whose top-left tile is (c, r), use (c - 0.5, r - 1). Choose a free block next to the link, not on it, or the player warps straight back.

7. **Bring it to life.** level_add_npc with a script (guide "gscript"), level_add_sign for readable signs, level_add_chest, level_add_baddy. npc_library_list has working examples.

8. **Check it.** level_check audits a level or gmap: links that cannot be reached or lead nowhere, arrivals inside walls, missing images, script errors, unset tiles. Run it on the gmap and on every separate level, and fix every error it reports.

9. **Test it.** play_start drops a player into the level; play_move walks and reports where the player ends up and what stopped it, so walls, water and links can be checked. level_screenshot shows the player. Links are followed when the target level is open in the editor. Stop play mode (play_stop) before editing a different level.

10. **Save.** level_save with a path the first time (a gmap is saved as its .gmap plus every member level in the same folder). level_save_all saves the rest. Animations: gani_save.

## Tips
- Screenshot after each batch of edits and compare with what you intended.
- Keep door positions in mind: the "House" object is 13x14 tiles with its door on the front wall, 4-6 tiles from its left edge. Check with level_get_walkability and a screenshot before placing the door's link.
- In a gmap, keep buildings and their door links inside one 64x64 level (clear of the yellow lines in the screenshot): each object is saved into the level its top-left tile is in.
- Lakes and mountains from world_generate are ringed by cliffs that block walking. That is how the classic overworld looks; add a way through only where the player should pass.
- Images for NPCs and animations: app_list_bundled_files lists what ships with GSuite (door.png, heads, bodies, sprites.png, ...), workspace_find_files what is in the world's folder, and app_view_image shows any of them with pixel coordinates.
- Everything a tile object covers replaces what was there, including grass under tree canopies; that is how the originals are drawn too.
- Server-side, an offline gmap is loaded with \`if (created) loadmap worldname;\` in an NPC, or by listing it in the server's gmap list.`,
        },

        'tiles': {
            title: 'Tiles, tilesets and layers',
            summary: 'Tile indices, the tileset image, tile objects, collision types',
            text: `# Tiles, tilesets and layers

## Tile index
Every tile is a 16x16 piece of the tileset image. The tools identify it by **tile index = row * columns + column**, counting columns and rows of tiles from the top-left of the image, where \`columns\` is how many tiles wide the image is. The classic tileset \`pics1.png\` is 2048x512 pixels: 128 columns by 32 rows, so the index is row * 128 + column, 0-4095. The terrain tilesets (\`picso.png\`) are 1024 pixels wide: 64 columns. \`-1\` means empty.

- level_view_tileset draws the tileset with a labelled grid so you can pick tiles by sight.
- level_get_tile_info translates indices and reports the collision type.
- In the default tileset, tile **4031** is plain grass.

## Graal tile ids
\`.nw\` files and scripts (\`tiles[x,y]\`) use the Graal tile id, which numbers the tileset in eight 16-column strips: \`id = floor(column / 16) * 512 + (column % 16) + row * 16\`. Back again: \`column = (id & 15) + 16 * floor((id >> 4) / 32)\`, \`row = (id >> 4) % 32\`. Grass is id 2047 (0x7FF). level_get_tile_info gives both numbers.

## Tile objects
Most scenery is built from groups of tiles. The editor ships a library (level_list_tile_objects): Standard (Tree, House, Bush, Sign, Stone, Well, Bridge, fences, platforms, ...), Castle, House Inside, Snow and Volcano. level_place_tile_object stamps one; level_fill_rect with \`tile_object\` repeats a small one over an area.

## Layers
A \`.nw\` level has layer 0 (the ground, always fully filled) and optional higher layers drawn on top of it; empty cells on higher layers are transparent. Gmaps always have layers 0-2. Painting tools take a \`layer\` argument and create layers as needed.

## Collision types
Each tile has a type used for movement: normal, blocking (walls), throw_through (blocks walking, but thrown things pass over it: fences, low walls), water, shallow_water, swamp, lava, chair, bed_upper / bed_lower, hurt, jumping. level_get_walkability maps them. The table depends on the level's tileset type (0 classic, 1 newer layout, 5 terrain).

## Other tilesets
level_set_tileset switches a level to another image: bundled \`picso.png\` (terrain gmaps), \`picso2-sky.png\`, \`zlttp_tiles_lightworld_day.png\`, or any image in the workspace folder. The tile objects library is drawn for \`pics1.png\`. level_list_tilesets shows the editor's list; level_add_tileset loads an image file into it.

## Tile definitions
A level can replace its tileset, or lay an image over part of it, with a tile definition. The kind a game server understands is a line in an NPC script: \`addtiledef("image.png", "levelprefix", 0);\` replaces the tileset for every level whose name starts with the prefix, and \`addtiledef2("image.png", "levelprefix", x, y);\` draws the image over the tileset at pixel x, y. Put it in an NPC with level_add_npc and the editor applies it at once. level_get_tiledefs lists what applies to a level. (level_set_tiledefs changes the editor's own list of definitions, which is not saved in the level file.)

## Your own tile objects
level_create_tile_object saves a rectangle of a level, or rows of tile indices you give, as a tile object; level_export_tile_objects and level_import_tile_objects carry such a library between projects.`,
        },

        'level-format': {
            title: 'The .nw level format',
            summary: 'Text format of a level file, line by line',
            text: `# The .nw level format

A level is a text file. Only write one by hand when the tools do not fit; level_get_text shows what the editor writes.

\`\`\`
GLEVNW01
BOARD 0 0 64 0 f/f/f/f/...            one row of tiles
BOARD 0 1 64 0 f/f/f/f/...
...
NPC door.png 30 20                    image (or -), x, y
if (playertouchsme) { hide; sleep 3; show; }
NPCEND
SIGN 20 24                            x, y
Welcome!
SIGNEND
LINK house.nw 16 21 2 1 30 40         target, x, y, width, height, target x, target y
CHEST 44 30 bluerupee 0               x, y, item, sign index
BADDY 50 40 2                         x, y, type, then three verse lines
attack verse
hurt verse
win verse
BADDYEND
TILESET pics1.png                     optional; a second number gives the tileset type
\`\`\`

- The first line must be \`GLEVNW01\`.
- **BOARD x y width layer data**: \`width\` tiles starting at column x of row y on \`layer\`, two characters per tile. Layer 0 has one BOARD line of 64 tiles for each of the 64 rows; higher layers list only the runs that have tiles.
- **Tile characters**: the Graal tile id (guide "tiles") written as two base-64 digits with the alphabet \`A-Z a-z 0-9 + /\`: first digit \`id >> 6\`, second \`id & 63\`. Grass (2047) is \`f/\`; tile id 0 is \`AA\`.
- **LINK** target coordinates may be the words \`playerx\` / \`playery\` to keep that coordinate (used for links along level edges).
- **NPC** x and y may be fractional. The script runs to \`NPCEND\`.
- Chest items: greenrupee, bluerupee, redrupee, goldrupee, bombs, darts, heart, fullheart, glove1, glove2, bow, bomb, superbomb, joltbomb, shield, mirrorshield, lizardshield, sword, battleaxe, goldensword, lizardsword, fireball, fireblast, nukeshot, spinattack.`,
        },

        'gmap-format': {
            title: 'Gmaps',
            summary: 'How levels join into a world, and the .gmap file',
            text: `# Gmaps

A gmap lays levels out on a grid; the game joins them into one continuous world with no loading between them. Each member is an ordinary 64x64 level file in the same folder as the \`.gmap\`.

\`\`\`
GRMAP001
WIDTH 2
HEIGHT 2
LEVELNAMES
"world_a1.nw","world_b1.nw"
"world_a2.nw","world_b2.nw"
LEVELNAMESEND
\`\`\`

- Rows of LEVELNAMES run top to bottom, names left to right.
- An optional \`TILESET name\` line sets the tileset for the whole map.
- Terrain maps add heightmap settings (GENSEED, GENHEIGHT, HEIGHTMAP, ...) that gmap_set_terrain manages.

## In GSuite
A gmap opens as one level of \`columns*64\` by \`rows*64\` tiles with three layers. Use the gmap's name as \`level\` for world coordinates, or a member's name for that level's own coordinates. level_save on a gmap writes the \`.gmap\` and every member level; an object belongs to the member level its top-left tile is in.

Create one with gmap_new (flat), world_generate (from a terrain map) or gmap_from_levels (from existing level files).`,
        },

        'gscript': {
            title: 'GraalScript for NPCs',
            summary: 'What NPC scripts need and how to look up the rest',
            text: `# GraalScript for NPCs

This primer covers what level NPCs need. Do not write GraalScript from memory:
- script_reference looks a function up at api.gscript.dev: its parameters in order, where it runs, an example.
- script_examples_search searches the user's own script folders for real uses.
- script_check finds structural mistakes (unclosed braces, missing parentheses) in a script before you place it.


## 1. Dialects and where code runs
- GS1 is legacy (pre-2004-2006), obsolete since Graal v4, runs on server and client, simple syntax. GS2 is current: client-server architecture, modern syntax.
- GS1 style in the reference: flag conditions and no-parentheses commands, e.g. \`if (created) { showcharacter; setcharprop #c, Hello there!; setani sit,; }\`. GS2 style: \`function onCreated() { ... }\` with parentheses and prefixes.
- Write each script wholly in GS2 (preferred) or wholly in GS1.
- Code can run on the client, the server, or both. \`//#CLIENTSIDE\` is the directive for client-only code (rule 5 of "Critical Syntax Rules"). Code without it is shown as server-side in the reference's server/client examples.
- Reference labels: \`showimg\`/\`findimg\`, \`play\`/\`playlooped\` are clientside; \`setlevel2\`, \`setshape\`, \`showcharacter\`, \`setimg\`, \`setimgpart\`, \`hide\`, \`show\`, \`move\` are NPC/player functions.

## 2. Rules that are easy to get wrong
- String concatenation: always \`@\`, never \`+\`. GS2 also has \`SPC\` (\`"hi" SPC player.account\`). GS1 concatenation uses \`#v(variable)\` / \`#s(string)\`, not \`@\`.
- Always use the appropriate variable prefix: \`this.\` (object state, on this NPC), \`temp.\` (only during function execution), \`player.\` (the player who triggered the event), \`client.\` (saved to player account, both sides), \`clientr.\` (server writes, client reads), \`server.\` (global server data), \`serverr.\` (server writes, clients read).
- Event function names must be exactly as shown (case-sensitive): \`onPlayerTouchsMe\` (sic).
- Arrays use curly braces \`{}\`; indexing uses \`[]\`. Comments \`//\` and \`/* */\`.
- Properties are assigned directly: \`this.chat = "x";\` (GS1 \`setcharprop #c,hi;\` becomes \`chat = "hi";\`; \`setcharprop #C0,blue;\` becomes \`this.colors[0] = "blue";\`).
- Use \`.visible = true/false\`, not \`setVisible()\`; \`.text\`, not \`setText()\`.
- Continuous behaviour: you must call \`setTimer()\` again inside \`onTimeout()\`.
- \`onAction()\` fires on ANY action; use specific events such as \`onActionLeftMouse()\`.
- \`setani("idle", "")\`: second parameter is for GANI parameters. GS1 \`setani idle,;\`.

## 3. Events for level NPCs
\`\`\`
onCreated()             // NPC created
onPlayerEnters()        // player enters level
onPlayerTouchsMe()      // player touches this NPC
onPlayerChats()         // player sends chat; text in player.chat
onTimeout()             // timer expired (set with setTimer(seconds))
onActionLeftMouse() / onActionRightMouse() / onActionDoubleMouse()  // mouse click on NPC
onWasHit()              // sword hit     onMovementFinished()  // NPC finished moving
onPlayerEndsReading()   // player finishes reading
onMyEvent(param1)       // fires after scheduleevent(delay, "MyEvent", param1)
onActionChestOpen()     // fires for triggeraction(x, y, "ChestOpen", params)
onActionServerside(cmd, pl, data) / onActionClientside(cmd, data)  // triggerserver / triggerclient
\`\`\`
- Actions: \`triggeraction(x, y, action, params...)\`; handler is \`onAction{ActionName}\`. Trigger: \`triggeraction(player.x, player.y, "ChestOpen", "");\`
- Client to server: \`triggerserver("weapon", this.name, "functionName", data);\`. Server to client: \`triggerclient("gui", name, "response", data);\`
- GS1 equivalents (flags in \`if (...)\`): \`created\`, \`playertouchsme\`, \`playerenters\`, \`playerchats\`, \`timeout\`, \`washit\`, \`wasshot\`, \`actionhurt\`, \`actionsword\`. The reference's flag list is in "Built-in Flags (for if statements)".
- Timers: \`setTimer(seconds)\`; \`scheduleevent(seconds, "Name", params...)\` invokes \`onName\`; \`cancelevents("Name")\` cancels them.

## 4. Commands (argument order)
- Image: \`setimg(filename)\`; \`setimgpart(filename, x, y, width, height)\`.
- Shape/blocking: \`setshape(type, width, height)\` (type 1 = rectangular); \`setshape2(width, height, {tiletypes..})\`. Tile types: 0 non-blocking, 22 blocking, 11 water, 12 lava, 20 throw-through, 21 jumping, 8 shallow water. Also \`dontblock()\`, \`blockagain()\`.
- Character: \`showcharacter()\`. Properties: \`this.nick\`, \`this.chat\`, \`this.head\` / \`this.headimg\`, \`this.body\` / \`this.bodyimg\`, \`this.shieldimg\`, \`this.sword\`, \`this.shield\`, \`this.colors[0..4]\` (e.g. \`"black"\`), \`this.dir\` (0 up, 1 left, 2 down, 3 right), \`setcharani("idle", "")\` (ganifile, params).
- Chat/messages: \`this.chat = "text";\`, \`message("text");\` (sets chat of the calling entity), \`player.chat\`, \`say2("text")\` (text as sign), \`echo("text")\` (log).
- Visibility: \`hide()\`, \`show()\`, \`destroy()\`; \`this.hidetoclients\`.
- Timers: \`setTimer(seconds)\`, \`scheduleevent(seconds, "event", params)\`, \`sleep(seconds)\`.
- Warp the player: \`setlevel2(filename, x, y)\`, e.g. \`setlevel2("levels/town.nw", 10.5, 20.3);\`. Warp an NPC: \`warpto(level, x, y)\`.
- Sounds (clientside): \`play(file)\`, \`play2(file, x, y, volume)\`, \`playlooped(file)\`, \`playlooped2(file, x, y, volume)\`, \`stopsound(file)\`.
- Images/effects (clientside): \`temp.img = showimg(index, filename, x, y);\` returns an object (\`.x .y .zoom .alpha .layer .partx .party .partw .parth\`); \`findimg(index)\`; \`hideimg(index)\`; \`hideimgs(first, last)\`; \`changeimgpart(index, x, y, w, h)\`. Index must be unique per image.
- Moving: \`move(dx, dy, time, options)\` (+4 blockcheck, +8 eventwhendone, +16 applydir), or set \`this.x\` / \`this.y\`.

## 5. Examples
Talking character (GS2):
\`\`\`
function onCreated() {
  showcharacter();
  this.nick = "Guard";
  this.bodyimg = "body2.png";
  setcharani("idle", "");
}
function onPlayerEnters() {
  this.chat = "Welcome " @ player.nick @ "!";
}
function onPlayerChats() {
  if (player.chat == "hello") {
    this.chat = "Hi there!";
  }
}
\`\`\`
Door that opens when touched (composed from hide()/show()/dontblock()/blockagain()/setTimer):
\`\`\`
function onPlayerTouchsMe() {
  this.dontblock();
  hide();
  setTimer(3);
}
function onTimeout() {
  show();
  this.blockagain();
}
\`\`\`
Animated object on a sprite sheet (from the reference's setimg/setimgpart and timer patterns):
\`\`\`
function onCreated() {
  this.frame = 0;
  setimg("sprite.png");
  setTimer(0.1);
}
function onTimeout() {
  this.frame = (this.frame + 1) % 4;
  setimgpart("sprite.png", this.frame * 32, 0, 32, 32);
  setTimer(0.1);
}
\`\`\`
Warp / pickup:
\`\`\`
function onPlayerTouchsMe() {
  setlevel2("levels/town.nw", 10.5, 20.3);
}
\`\`\`
Pickup (reference's own pattern; the reference says item logic varies by server):
\`\`\`
function onPlayerTouchsMe() {
  this.destroy();
}
\`\`\`
GS1 style (reference): \`if (created) { showcharacter; setcharprop #c, Hello there!; setani sit,; }\`

## 6. Do not
- Do not use \`+\` for strings; use \`@\`.
- Do not omit prefixes (\`this.\`, \`temp.\`, \`player.\`).
- Do not use \`setPosition()\`/\`setSize()\`, \`setVisible()\`, \`setText()\`; assign properties instead.
- Do not forget \`setTimer()\` inside \`onTimeout()\` for repeating behaviour.
- Do not use \`onAction()\` for clicks; use \`onActionLeftMouse()\` etc.
- Do not use deprecated \`setbody()\`, \`sethead()\`, \`setplayerdir()\`; use \`player.body\`/\`player.bodyimg\`, \`player.head\`/\`player.headimg\`, \`player.dir = n\`.
- Do not use \`sqrt()\` in server code (clientside only); \`putobject()\` does not exist; \`replaceText()\` is only for GUI controls.
- Do not call \`onCreated\` a trigger action; custom actions use \`onAction{Name}\`.
- Do not mistype event names (\`onPlayerTouchsMe\`, \`onTimeout\`); they are case-sensitive.

## In GSuite
- The level editor does not run scripts, but it reads a few statements to draw NPCs as they will look: showcharacter, setcharani, this.head / body / shield / colors / nick / dir, setimgpart, setshape / setshape2, setcoloreffect, setzoomeffect, and addtiledef / addtiledef2. Play mode shows say2 text from onPlayerTouchsMe when the NPC is touched.
- npc_library_list returns the NPC templates GSuite ships (written in GS1).
- Scripts from real servers are good examples of how things are done in practice. If a checkout of a script repository is on this machine, search its refs folder with script_examples_search to find real uses of a function; treat what you find as unverified.`,
        },

        'gani-format': {
            title: 'The .gani animation format',
            summary: 'Sprites, defaults, frames and sounds of an animation file',
            text: `# The .gani animation format

An animation defines **sprites** (rectangles of images) and **frames** that place sprites at pixel offsets, once per direction. gani_get_text on a bundled animation (gani_open with bundled: "walk.gani") is the best reference.

\`\`\`
GANI0001
SPRITE    0 SPRITES    0   0  24  12 shadow
SPRITE    1 HEAD       0  64  32  32 head down
SPRITE    2 BODY       0   0  32  32 body down
SPRITE    3 myfx.png   0   0  16  16 spark
DEFAULTSPRITES sprites.png
DEFAULTHEAD head19.png
DEFAULTBODY body.png
LOOP
CONTINUOUS
SETBACKTO idle
ANI
 0 12 34, 2 8 16, 1 8 0         up
 0 12 34, 2 8 16, 1 8 0         left
 0 12 34, 2 8 16, 1 8 0         down
 0 12 34, 2 8 16, 1 8 0         right
WAIT 1
PLAYSOUND step.wav 1.5 2

ANIEND
\`\`\`

- **SPRITE index source left top width height comment**: \`source\` is an image file name, or a slot (SPRITES, PICS, HEAD, BODY, SWORD, SHIELD, HORSE, ATTR1-30, PARAM1-30) that is filled from the player's or NPC's own images, with \`DEFAULT<SLOT> file\` as the fallback.
- Per-sprite effect lines follow the sprites: \`ROTATEEFFECT index radians\`, \`ZOOMEFFECT index factor\`, \`STRETCHXEFFECT\` / \`STRETCHYEFFECT index factor\`, \`COLOREFFECT index r g b a\` (0-1), \`EFFECTMODE index mode\`, \`ATTACHSPRITE parent child x y\` (\`ATTACHSPRITE2\` draws the child behind).
- **Settings**: \`LOOP\`, \`CONTINUOUS\`, \`SETBACKTO name\`, \`SINGLEDIRECTION\` (one line per frame instead of four), \`LAYER n\`.
- **ANI ... ANIEND**: each frame is four lines (up, left, down, right), each line a comma-separated list of \`sprite x y\` placements, drawn in order. Every line starts with a space, and no direction may be left empty.
- **WAIT n** after a frame holds it n extra ticks; a frame lasts 50 ms plus 50 ms per WAIT.
- **PLAYSOUND file x y** plays a sound at that point of the frame (x, y in tiles).
- **SCRIPT ... SCRIPTEND** attaches GraalScript.
- \`ANTIALIAS\` and \`ROTATEPROJECTILE\` are flags for the game client (gani_set_properties).
- A placement can name its sprite instead of numbering it (\`mysprite 4 4\`); gani_set_frames takes a name for \`sprite\` too.

## Movies
A file starting with \`GANI0002\` is a movie (a cutscene). Instead of frames of sprites it has a length in frames (\`FRAMES n\`, 50 ms each) and a \`MOVIE\` block of items, each with keyframes:

\`\`\`
MOVIE
  ACTOR CHAR Hero
    FRAME 0 visible=true,dx=-80,dy=0,layer=1,ani=walk,dir=3
    FRAME 40 dx=20,dy=0,ani=idle
  ACTOREND
  ACTOR TEXT Title
    FRAME 10 visible=true,dx=-40,dy=-60,text=Welcome,zoom=1.5
    FRAME 45 visible=false
  ACTOREND
MOVIEEND
\`\`\`

- Kinds: **CHAR** (a character playing another animation: ani, dir 0 up / 1 left / 2 down / 3 right, chat, head, body ...), **TEXT** (text, font, color, zoom, bold ...), **SPRITE** (one of this file's own sprites), **SOUND** (a sound file, played at its first key).
- A key holds only what changes at that frame. Position (dx, dy) and a text's zoom move gradually from one key to the next; everything else holds until a later key changes it. An item is invisible until a key sets visible=true.
- Tools: gani_new with movie: true, gani_set_movie (length and items), gani_set_movie_keys (keyframes), gani_get_movie (the structure, and what each item shows at a frame), gani_render_movie (pictures of chosen frames), gani_export_gif.

A standing character is about 32 pixels wide and 48 tall: shadow near (12, 34), body near (8, 16), head near (8, 0).

app_view_image shows an image with pixel coordinates (try "sprites.png", "head19.png", "body.png") so sprite rectangles can be read off it; app_list_bundled_files lists the images that ship with GSuite.`,
        },

        'particles': {
            title: 'GS2 particle effects',
            summary: 'Writing emitter scripts and previewing them',
            text: `# GS2 particle effects

A particle effect is an emitter on an image shown with showimg. particle_render shows any script as snapshots over time, particle_set_code runs it in the ParticleEmu tab for the user, and particle_load_preset returns working scripts to start from.

\`\`\`
//#CLIENTSIDE
function onCreated() {
  showimg(1, "block.png", player.x, player.y);
  with (findimg(1)) {
    layer = 1;
    x = player.x;
    y = player.y;
    emitter.delaymin = 0.1;                 // seconds between emissions
    emitter.delaymax = 0.3;
    emitter.emissionoffset = "{0, 0, 0}";   // offset from x, y, z
    emitter.nrofparticles = 1;              // particles per emission
    emitter.maxparticles = 50;
    emitter.particle.image = "sparkle.png";
    emitter.particle.lifetime = 2.0;        // seconds
    emitter.particle.mode = 0;              // 0 = add, 1 = transparent, 2 = subtract
    emitter.particle.alpha = 0.8;
    emitter.particle.zoom = 1.0;
    emitter.particle.red = 1.0;             // colours 0-1
    emitter.particle.green = 0.5;
    emitter.particle.blue = 0.0;
    emitter.particle.angle = 0;             // direction, 0 to 2*pi
    emitter.particle.zangle = 0;            // upward angle
    emitter.particle.speed = 2.0;
    emitter.particle.spin = 1.0;
    emitter.addlocalmodifier("range", 0, 2, "alpha", "replace", 1, 0);   // fade out over two seconds
  }
}
\`\`\`

- **Emitter**: attachposition, delaymin, delaymax, emissionoffset (a string "{x, y, z}"), firstinfront, nrofparticles, maxparticles.
- **emitter.particle**: image, lifetime, mode, alpha, zoom, red, green, blue, angle, zangle, speed, spin, stretchx, stretchy.
- **Modifiers** change a property over time: addlocalmodifier (over each particle's own life), addglobalmodifier (on the emitter's clock, for all particles) and addemitmodifier (once, when a particle is emitted). Arguments: type, timeStart, timeEnd, property, operation, valueStart, valueEnd. Types: "once", "range", "loop". Operations: "replace" (from valueStart to valueEnd), "add" (a random value between them), "multiply". Properties: x, y, z, alpha, red, green, blue, zoom, rotation, angle, zangle, speed, spin.
- ParticleEmu also reads the block form its visual editor writes, \`with (emitter) { ... with (particles[0]) { ... } }\`, which is what particle_load_preset returns.
- app_list_bundled_files with kind "particle_images" lists the particle images that ship with GSuite; images in the workspace folder work in the ParticleEmu tab too.
- particle_render shows the effect at several moments. particle_export writes it as a file: .gif, .png (animated, with soft see-through edges: the one to use over other art) or .webm.`,
        },
    };

    for (const [topic, guide] of Object.entries(GUIDES)) {
        mcp.resource({ uri: `gsuite://guide/${topic}`, name: `guide-${topic}`, title: guide.title, description: guide.summary, mimeType: 'text/markdown' }, () => guide.text);
    }

    mcp.tool({
        name: 'app_get_guide',
        title: 'Read a guide',
        description: 'Built-in guides for working with GSuite. Topics: ' + Object.entries(GUIDES).map(([topic, guide]) => `"${topic}" (${guide.summary})`).join('; ') + '. Read "rules" first (it is also this server\'s instructions), and "world-building" before creating a world.',
        input: { topic: S.enum(Object.keys(GUIDES), 'Which guide to read') },
        required: ['topic'],
        readOnly: true,
    }, async ({ topic }) => (GUIDES[topic] || fail(`No guide "${topic}".`)).text);

    mcp.prompt({
        name: 'build_world',
        title: 'Build a game world',
        description: 'Plan and build a complete world in GSuite from a description.',
        arguments: [
            { name: 'description', description: 'What the world should be like: setting, size, places, characters', required: true },
            { name: 'folder', description: 'Absolute path of the folder to create it in', required: false },
        ],
    }, args => `Build a game world in GSuite using its MCP tools.

The world: ${args.description || '(ask me what it should be like)'}
${args.folder ? `Create it in: ${args.folder}` : 'Ask me which folder to create it in, or propose one under the documents folder from app_get_state.'}

Work like this:
1. Call app_get_state, then read app_get_guide "rules" and "world-building".
2. Tell me your plan in a few lines: the size of the map, its regions, the places and characters in it.
3. Create the folder, set it as the workspace, and generate the land with world_generate.
4. Add buildings and scenery with tile objects, interiors as separate levels joined by links, then NPCs with scripts, signs, chests and baddies.
5. After each stage take a level_screenshot and check it against the plan; fix what looks wrong.
6. Run level_check on the gmap and every separate level and fix what it reports. Walk the important paths in play mode (play_start, play_move) to check they are passable and the links work.
7. Save everything (level_save for the gmap and each separate level), then summarise what you built and where the files are.`);

    mcp.prompt({
        name: 'create_npc',
        title: 'Write an NPC',
        description: 'Write a scripted NPC and place it in a level.',
        arguments: [
            { name: 'behaviour', description: 'What the NPC should look like and do', required: true },
            { name: 'level', description: 'Level to place it in; defaults to the active level', required: false },
        ],
    }, args => `Create an NPC in GSuite${args.level ? ` in the level ${args.level}` : ' in the active level'}.

What it should do: ${args.behaviour || '(ask me)'}

Read app_get_guide "gscript", then confirm what the behaviour needs with script_reference and search the user's script folders with script_examples_search. Write the script in GS2, run script_check on it, then place it with level_add_npc at a sensible spot (take a level_screenshot first to choose one). Show me the script and a screenshot of where it stands.`);

    mcp.prompt({
        name: 'create_animation',
        title: 'Create an animation',
        description: 'Create a .gani animation and check it visually.',
        arguments: [{ name: 'description', description: 'What the animation should show', required: true }],
    }, args => `Create a .gani animation in GSuite: ${args.description || '(ask me what it should show)'}

Read app_get_guide "gani-format". Open a bundled animation that is close to what is wanted (gani_open with no arguments lists them) and study it with gani_get_text and gani_render_sheet. Then build the new animation with gani_new, gani_set_sprites and gani_set_frames, render it with gani_render_sheet, and adjust offsets and timing until every direction reads well. Show me the final sheet and ask where to save it.`);
})();
