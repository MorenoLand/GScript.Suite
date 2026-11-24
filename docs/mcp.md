# GSuite MCP server

GSuite has a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. With it, an AI agent (Claude Code, Claude Desktop, Cursor, or any other MCP client) can drive the running app: build levels and whole gmaps, write NPC scripts, create animations and particle effects, and look at the results as images. Every edit shows up live in the GSuite window.

The server is part of the desktop app. The browser build has no server, because a web page cannot listen for connections or reach files on disk.

## Connecting an agent

Start GSuite. The **MCP** button in the title bar shows the server's state (green: running) and opens a dialog with the address and ready-to-copy configuration.

**Claude Code**

```bash
claude mcp add --transport http gsuite http://127.0.0.1:47848/mcp
```

**Clients that connect over HTTP** use the address `http://127.0.0.1:47848/mcp` (Streamable HTTP transport).

**Clients that start a command** (Claude Desktop, Cursor and others) run the GSuite executable as a stdio bridge. It forwards to the running app, and starts the app first if it is not open:

```json
{
  "mcpServers": {
    "gsuite": { "command": "/path/to/GSuite", "args": ["--mcp-stdio"] }
  }
}
```

The dialog shows this snippet with the real path of your executable.

Then ask for what you want, for example: *"Build a small island world in ~/Documents/isle: a village with three houses, a forest in the north, a lake, and a guide NPC who greets the player."* The server also offers the prompts `build_world`, `create_npc` and `create_animation`.

## What an agent can do

| Area | Tools |
|---|---|
| App | `app_get_state`, `app_get_guide`, `app_open_tool`, `app_switch_tab`, `app_close_tab`, `app_open_file`, `app_screenshot`, `app_list_bundled_files`, `app_view_image`, `app_dialogs`, `app_get_settings`, `app_update_settings`, `app_get_custom_css`, `app_set_custom_css`, `app_check_for_update`, `app_eval_js` |
| Files and workspace | `fs_list_directory`, `fs_read_file`, `fs_write_file`, `fs_make_directory`, `fs_copy_file`, `fs_move_file`, `fs_delete_file`, `fs_search_text`, `workspace_set_directory`, `workspace_find_files` |
| Levels | `level_new`, `level_open`, `level_open_text`, `level_get_info`, `level_get_text`, `level_save`, `level_save_all`, `level_close`, `level_activate`, `level_undo` |
| Tiles | `level_get_tiles`, `level_set_tiles`, `level_fill_rect`, `level_copy_region`, `level_get_tile_info`, `level_get_walkability`, `level_view_tileset`, `level_set_tileset`, `level_list_tilesets`, `level_add_tileset`, `level_remove_tileset`, `level_get_tiledefs`, `level_set_tiledefs`, `level_set_layers`, `level_list_tile_objects`, `level_place_tile_object`, `level_create_tile_object`, `level_delete_tile_object`, `level_export_tile_objects`, `level_import_tile_objects` |
| Objects | `level_list_objects`, `level_get_object`, `level_add_npc`, `level_add_link`, `level_add_sign`, `level_add_chest`, `level_add_baddy`, `level_update_object`, `level_delete_objects`, `npc_library_list`, `level_export_npc` |
| Seeing and checking levels | `level_screenshot`, `level_export_image`, `level_check` |
| Gmaps and worlds | `gmap_new`, `gmap_from_levels`, `gmap_set_terrain`, `world_generate`, `world_terrain_legend` |
| Play mode | `play_start`, `play_move`, `play_get_state`, `play_stop` |
| Animations | `gani_new`, `gani_open`, `gani_open_text`, `gani_get_info`, `gani_get_text`, `gani_set_text`, `gani_save`, `gani_close`, `gani_undo`, `gani_set_properties`, `gani_list_sprites`, `gani_set_sprites`, `gani_delete_sprites`, `gani_get_frames`, `gani_set_frames`, `gani_delete_frames`, `gani_set_view` |
| Movies (cutscene animations) | `gani_set_mode`, `gani_get_movie`, `gani_set_movie`, `gani_set_movie_keys`, `gani_render_movie` |
| Seeing and exporting animations | `gani_render`, `gani_render_sheet`, `gani_export_gif`, `gani_export_video` |
| Particles | `particle_render`, `particle_get_state`, `particle_set_code`, `particle_load_preset`, `particle_export` |
| Shapes and scripts | `setshape_generate`, `setshape_parse`, `setshape_get`, `setshape_setimgpart`, `script_format`, `script_check` |
| GraalScript reference | `script_reference`, `script_examples_search` |
| Live servers (with the Remote Control bridge on) | `remote_status`, `remote_call`, `remote_upload`, `remote_download`, and every `rc_*` tool Remote Control offers |

Each tool describes itself and its arguments to the client; that description is the reference. A few things hold for all of them:

- **Agents can see their work.** `level_screenshot` renders a level, a region, one gmap member or a whole gmap, with tile coordinates along the edges. `gani_render_sheet` lays out every frame of an animation in every direction. `particle_render` shows a particle effect at several moments. `level_export_image` writes such a picture of a level or a whole world to a PNG file.
- **Coordinates are tiles** (16 pixels); a level is 64x64. In a gmap, pass the gmap's name to use world coordinates or a member level's name to use that level's own.
- **A tile index is `row * 128 + column`** in the classic 128-column tileset image (a narrower tileset uses its own column count). `level_view_tileset` draws the tileset with a grid to pick from; the tile object library (`level_list_tile_objects`) has trees, houses, furniture and more ready to stamp.
- **`gmap_new`, `gmap_from_levels` and `world_generate`** refuse to write over files that already exist in the target folder, and list them; `overwrite: true` replaces them.
- **`world_generate`** runs the Level Generator on a terrain map written as text and returns linked levels with shorelines, cliffs and forests. **`gmap_set_terrain`** gives a gmap heightmap terrain, generated from a seed or shaped by hand, corner by corner.
- **Edits are undoable** (one step per call that changes tiles, objects, sprites or frames) and stay in the editor until `level_save` / `gani_save` write them. Tools never open dialogs.
- **A call that outlives its caller is not run late.** When the server stops waiting for a tool (a timeout, or the client hanging up), it tells the page, which drops the call if it has not started; an agent that was told a call failed can retry it without the first attempt landing afterwards.
- **The server tells the agent how to work.** Its MCP `instructions` (which clients add to the agent's system prompt) are a set of rules: the conventions, how to place links so they work in both directions, and what to verify before calling a world finished. The same text is the guide `rules`.
- **`level_check`** backs those rules up. It audits a level or gmap for links that cannot be reached or lead nowhere, arrivals inside walls, links with no way back, missing NPC images, script syntax errors and unset tiles, and says how to fix each.
- **Guides** on the formats and the workflow are built in: `app_get_guide` (topics `rules`, `overview`, `world-building`, `tiles`, `level-format`, `gmap-format`, `gscript`, `gani-format`, `particles`, `remote-control`), also offered as MCP resources.
- **A GraalScript reference is built in.** `script_reference` looks functions up at [api.gscript.dev](https://api.gscript.dev). `script_examples_search` searches folders of real scripts on this computer once you name them under *My folders* in the GScript Reference dialog (the book button).
- **Movies.** A `.gani` can be a cutscene: actors, texts, sprites and sounds on a timeline. `gani_set_movie` and `gani_set_movie_keys` build one, `gani_get_movie` reads it, and `gani_render_movie` draws chosen frames side by side.
- **Exports.** Animations as GIF (`gani_export_gif`, movies included) or MP4 / WebM video (`gani_export_video`); particle effects as GIF, animated PNG or WebM (`particle_export`); levels and worlds as PNG (`level_export_image`). Video and animated PNG use what the app's window offers, and a tool says so when a format is not available there.
- **What ships with the app is reachable**: the example levels (`level_open` with `bundled`), the player animations (`gani_open`), NPC templates including the editor's Character (`npc_library_list`), the example theme (`app_get_custom_css`).
- **`app_eval_js`** runs JavaScript in the app for anything no tool covers.

### Coverage

The tools were checked against the app itself: every action a person can take in the level editor, the gani editor, the generators, ParticleEmu, the setshape2 editor, the beautifier and the app shell was listed from the code (about 480 of them) and matched to a tool, and the gaps that turned up were closed. What is left without a tool is left out on purpose:

- **Installing an update**, which restarts the app (`app_check_for_update` only reports whether there is one).
- **Registering file associations**, a change to the operating system.
- **Resetting the editor**, which wipes the person's settings and saved session.
- **The MCP server's own switches** (on/off, port, token, the Remote Control bridge), and everything in Remote Control's options.
- **Things that only change the view**: zoom, pan, panel layout, which tab or panel is shown beyond `app_switch_tab`, hover and selection highlights.
- **Features the app's own interface does not reach**: resizing a level to something other than 64x64 exists in the code, but its controls are not in the window and such a level does not survive being saved.

## Going live: the Remote Control bridge

Everything above works on local files. Remote Control (RC), the Graal server administration client, has an MCP server of its own for working on a running game server: files, scripts, players, commands. GSuite can offer RC's tools next to its own, so an agent that built a world offline can also put it on the server, through one connection.

Turn it on in two places:

1. In Remote Control, under **Options > MCP**: tick *Enable local MCP integration* and the boxes for what the agent may do (*Allow read-only tools*, *Allow file and script writes*, *Allow server and game mutations* and so on).
2. In GSuite, in the **MCP** dialog under **Remote Control**: tick *Offer Remote Control's tools*. GSuite finds the Remote Control that is running; set *Program* to the path of its executable if it does not.

The bridge is off by default. With it on:

- **Every `rc_*` tool of Remote Control is listed and callable through GSuite**, under the same name and with the same arguments and answers. GSuite starts `RemoteControl --mcp` and forwards to it; the list follows the permissions ticked in RC.
- **`remote_upload`** sends local files to the server in one batch: a `.gmap` brings its levels, each file goes to the server folder whose pattern matches its name, files the server already has are left out, and the server is asked to reload the levels that changed. `dry_run` compares with the server and shows what is new or changed without sending anything.
- **`remote_download`** fetches server files into a local folder and can open the levels in the editor.
- **`remote_status`** reports what RC allows right now and describes any `rc_*` tool; **`remote_call`** runs one by name, for clients that do not pick up tools that appear after they connected.

Remote Control stays in charge, and its options are the lock. (The switch in GSuite is a convenience: an agent that is allowed to run JavaScript in the app could flip it, so do not rely on it to keep an agent away from a server. Turn MCP off in Remote Control for that.) GSuite adds no permissions and stores no approvals: RC's options decide which tools exist, RC asks you before a change (unless you turned *Require approval for mutations* off there, or set a script type to always allow), limits agents to one server if you set that, and backs up what it replaces. An upload asks twice: once for the files and once to reload the levels. A request you decline comes back to the agent as declined, and the agent's instructions tell it to stop there. With approvals off, `remote_status` tells the agent so and to get your go-ahead itself. Calls that wait on your answer wait up to 15 minutes; one that is given up on is still carried out if you allow it afterwards, because RC cannot be told to cancel.

RC's dialogs and audit log do not say that a request came through GSuite, so GSuite keeps its own record: `remote-control.log` in its config folder has one line per forwarded call with the time, the tool, what it acted on (server, path, names; never contents) and the outcome. The calls also show under *Recent tool calls* in the MCP dialog.

`remote_upload` hands files to RC by copying them into a `gsuite-upload-...` folder inside the first folder RC lets agents use (its option `mcpfileroots`, by default RC's own `mcp-files` workspace), and removes that folder afterwards.

## Settings and security

The server listens on `127.0.0.1` only, so it is reachable from this computer and nowhere else. The `Host` header must be a loopback address, which stops DNS rebinding. Every request must send `Authorization: Bearer <token>`. GSuite generates a token on the first start and shows it in the MCP dialog; the stdio bridge reads the same token from the settings.

A connected agent can do what you can do in GSuite, including reading and writing files through the file tools and running JavaScript in the app. Only connect agents you trust, as with any MCP server.

In the MCP dialog you can turn the server off, change the port, and replace the token. Replacing it disconnects clients until they use the new one.

- Settings are stored in `mcp.json` in GSuite's config folder (`%AppData%\GSuite`, `~/Library/Application Support/GSuite`, `~/.config/GSuite`).
- If the port is taken, the server tries the nine ports above it; the dialog shows the address it ended up on, and the stdio bridge finds it by itself.
- Environment variables override the file: `GSUITE_MCP=0` or `1`, `GSUITE_MCP_PORT`, `GSUITE_MCP_TOKEN`.

## How it works

```
MCP client ── HTTP (or stdio bridge) ──▶ mcp/ (Go)  ── "mcp:request" event ──▶ js/mcp/core.js ──▶ tool handler ──▶ editors
                                          ◀────────── AppService.McpResolve ◀──────────────────────────┘
```

- **`mcp/`** (Go) is the server: the Streamable HTTP transport, the request checks, the stdio bridge and the settings. It does not know any tool. It answers `initialize` and the list requests from a manifest the page registers, and relays `tools/call`, `resources/read` and `prompts/get` to the page.
- **`mcp.go`** connects it to the app: it starts the server, and exposes `McpRegister`, `McpResolve`, `McpStatus` and `McpConfigure` to the page, along with a few file helpers the tools need.
- **`mcp/upstream.go`** and **`mcp/remotecontrol.go`** are the Remote Control bridge: a client for an MCP server run as a child process, which merges that server's tools into `tools/list` and forwards calls to them without going through the page. **`js/mcp/remote.js`** has the tools that combine the two (`remote_upload` and friends).
- **`js/mcp/core.js`** is the tool registry. It validates arguments against each tool's schema, runs handlers one at a time, and turns what they return (or throw) into MCP results.
- **`js/mcp/app.js`, `level.js`, `world.js`, `check.js`, `gani.js`, `tools.js`, `scripts.js`** hold the tools, next to the editors they drive. **`guide.js`** has the agent's instructions, the guides and the prompts, **`panel.js`** the title-bar button and dialog.

Tools run in the page because that is where the editors keep their state; a tool is ordinary JavaScript calling the same functions the UI calls.

Wails has an automation server of its own behind the `mcp` build tag, which drives any Wails app through the mouse, keyboard and DOM. GSuite's server is separate and always built in: it works in terms of levels, animations and scripts rather than clicks.

### Adding a tool

```js
mcp.tool({
    name: 'level_count_npcs',
    title: 'Count NPCs',
    description: 'How many NPCs a level has.',          // written for the agent: what it does and when to use it
    input: { level: S.string('Level name; defaults to the active level') },
    readOnly: true,
}, async ({ level }) => {
    const t = resolve(await editor(), level);
    return { level: t.entry.name, npcs: t.level.objects.filter(obj => obj.type === 'npc').length };
});
```

A handler returns a string, any JSON value, or `mcp.result(...)` to include images. To report a problem the agent can act on, call `fail('message')`; say what was wrong and what to do instead. Handlers must not open dialogs or wait on `requestAnimationFrame`: nobody may be at the screen, and animation frames stop while the window is hidden. Wrap an edit in the editor's own undo step and mark the document unsaved, as the existing tools do.

### Testing

- `go test -mod=mod ./mcp/` covers the server: protocol, request checks, the stdio bridge, settings, and the Remote Control bridge against a stand-in for `RemoteControl --mcp` (the tests never start the real one).
- `npm test` covers the registry and checks that every tool is well-formed and listed in this document.
- To try tools by hand without a desktop build, build with `-tags server` (Wails server mode) and open the app in a browser on port 9245; the MCP server works the same way there.

## Limits

- GSuite has to be running, and its window visible while it starts (the editors initialise on the first animation frame). After that the window can be in the background.
- Play mode moves a player and applies tile collisions and links; it does not run NPC scripts. `script_check` checks structure, not meaning.
- `script_reference` (api.gscript.dev) needs an internet connection; everything else works offline.
- The Remote Control bridge needs Remote Control running on the same computer, as the same user, with MCP turned on in its options. It answers one request at a time, so while it waits for you to allow a change, other `rc_*` calls wait too.
