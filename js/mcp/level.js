// GSuite MCP: tools for the level editor (levels, tiles, layers, NPCs and other
// objects, tilesets, screenshots and saving). Gmaps open in the same editor as
// one merged level; js/mcp/world.js adds the tools that create them.
//
// Conventions shared by every tool here:
//   - A "tile index" is row * 128 + column in the 2048px-wide tileset image; -1 is empty.
//   - Positions and sizes are in tiles. Inside a gmap they are relative to the
//     level named by the `level` argument: the whole map, or one member level.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;
    const h = mcp.helpers;

    const TILES_PER_ROW = 128;
    const MAX_TILE = 4095;
    const GRASS_TILE = 4031;
    const LEVEL_SIZE = 64;
    const MAX_LAYERS = 8;
    const LEVEL_ARG = S.string('Level to act on: its name (a level tab, a gmap, or a member level of an open gmap) or its index from app_get_state. Defaults to the active level.');

    async function editor() {
        return h.waitFor(
            () => (window._editor && typeof LevelEditor !== 'undefined' && window._editor instanceof LevelEditor && window._editor.objectImages ? window._editor : null),
            15000, 'the level editor to load (the GSuite window must be visible while it starts)');
    }

    function loadImage(url) {
        return new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    const tilesetImages = new Map();
    // Resolves a tileset image by name: tilesets loaded in the editor, then the
    // workspace folder, then the images bundled with the app. Null if none has it.
    async function loadTileset(le, name) {
        const key = name.toLowerCase();
        if (tilesetImages.has(key)) return tilesetImages.get(key);
        let url = le._tilesetDataCache?.[name] || le.fileCache?.images?.get(name) || null;
        if (!url && window.__GSUITE__) {
            const found = await h.invoke('ResolvePath', key).catch(() => '');
            if (found) url = await le.loadImageFromPath(found, name).catch(() => null);
        }
        const image = (url && await loadImage(url)) || await loadImage('images/' + name);
        if (image) tilesetImages.set(key, image);
        return image;
    }

    // Gives the level the image for its tileset. Returns a warning when the image cannot be found.
    async function ensureTileset(le, level) {
        const name = level.tilesetName || 'pics1.png';
        if (level._mcpTileset === name && level.tilesetImage && level.tilesetImage.complete !== false) return null;
        // The image built from the level's tile definitions is the one to keep; a level that has
        // definitions and was not drawn with them yet (just opened, say) gets them applied here.
        if (level._tiledefImage && level._tiledefImage === level.tilesetImage) return null;
        if (!level._applyingTiledefs && tiledefsApply(le, level)) return (await applyTiledefs({ le, level })).warning || null;
        const image = await loadTileset(le, name);
        level._mcpTileset = name;
        if (image) {
            level.tilesetImage = image;
            return null;
        }
        if (!level.tilesetImage) level.tilesetImage = await loadTileset(le, 'pics1.png');
        return `Tileset image "${name}" was not found in the app or the workspace folder, so the level is drawn with another tileset. Set the workspace with workspace_set_directory or pick a tileset with level_set_tileset.`;
    }

    const entryPath = entry => entry.filePath || entry.fullPath || '';
    const cleanName = name => String(name || '').replace(/^"|"$/g, '');

    function levelEntries(le) {
        return le.levels.map((entry, index) => ({ entry, index })).filter(item => !item.entry.isGani);
    }

    function tabFor(entry) {
        return window.tabManager?._tabs.find(tab => tab.type === 'level' && tab.data?.level === entry.level) || null;
    }

    // Level tabs remember the index their level had when the tab was made; the tab
    // strip uses it to switch levels, so it has to follow when levels are closed.
    function syncTabs(le) {
        for (const tab of window.tabManager?._tabs || []) {
            if (tab.type !== 'level' || !tab.data?.level) continue;
            const index = le.levels.findIndex(entry => entry.level === tab.data.level);
            if (index >= 0) tab.data.index = index;
        }
    }

    function members(entry) {
        const list = [];
        (entry.gmapGrid || []).forEach((row, cellY) => row.forEach((raw, cellX) => {
            const name = cleanName(raw);
            if (name) list.push({ name, cellX, cellY, loaded: !!(entry.gmapLevels?.[name] !== undefined || entry.gmapObjects?.[name]) });
        }));
        return list;
    }

    // Finds the level a tool should act on. The result carries the offset and size
    // of the addressed area: all of a level or gmap, or one member level of a gmap.
    function resolve(le, ref) {
        const list = levelEntries(le);
        if (!list.length) fail('No level is open. Create one with level_new or gmap_new, or open one with level_open.');
        let found = null, member = null;
        if (ref === undefined || ref === null || ref === '') {
            found = list.find(item => item.index === le.currentLevelIndex) || list[list.length - 1];
        } else {
            const text = String(ref), lower = h.path.normalize(text).toLowerCase();
            if (/^\d+$/.test(text)) found = list.find(item => item.index === Number(text));
            found = found || list.find(item => item.entry.name.toLowerCase() === lower) || list.find(item => h.path.normalize(entryPath(item.entry)).toLowerCase() === lower);
            if (!found) {
                for (const item of list) {
                    member = members(item.entry).find(m => m.name.toLowerCase() === lower || h.path.stem(m.name).toLowerCase() === lower);
                    if (member) { found = item; break; }
                }
            }
            found = found || list.find(item => h.path.stem(item.entry.name).toLowerCase() === lower);
            if (!found) fail(`No open level matches "${ref}". Open levels: ${list.map(item => `${item.index}: ${item.entry.name}`).join(', ')}.`);
        }
        const level = found.entry.level;
        const target = { le, entry: found.entry, index: found.index, level, ox: 0, oy: 0, width: level.width, height: level.height, member: null };
        if (member) Object.assign(target, { ox: member.cellX * LEVEL_SIZE, oy: member.cellY * LEVEL_SIZE, width: LEVEL_SIZE, height: LEVEL_SIZE, member: member.name });
        return target;
    }

    const label = t => t.member ? `${t.member} (in ${t.entry.name})` : t.entry.name;

    // Makes the target the level the editor is showing, so undo, redraw and the
    // tab strip all refer to it, and makes sure its tileset image is loaded.
    async function activate(t) {
        const le = t.le;
        syncTabs(le);
        if (le.currentLevelIndex !== t.index || le.level !== t.level) {
            if (le._playMode) fail(`Play mode is running in ${le.levels[le.currentLevelIndex]?.name}. Stop it with play_stop before working on ${t.entry.name}.`);
            const tab = tabFor(t.entry);
            if (tab) window.tabManager.switchTo(tab.id);
            if (le.currentLevelIndex !== t.index || le.level !== t.level) le.switchLevel(t.index);
        }
        return ensureTileset(le, t.level);
    }

    async function open(ref) {
        const le = await editor();
        const t = resolve(le, ref);
        t.warning = await activate(t);
        return t;
    }

    function redraw(le) {
        le.invalidateLayerCache();
        if (le.level?.tilesetImage) le.render();
    }

    // Finishes an edit: marks the level unsaved, redraws and stores the session.
    function commit(t, changedObjects) {
        const le = t.le;
        t.entry.modified = true;
        const tab = tabFor(t.entry);
        if (tab) window.tabManager.markDirty(tab.id, true);
        if (changedObjects) {
            le.syncObjectSelection();
            le.refreshNPCList();
        }
        redraw(le);
        le.saveSessionDebounced();
    }

    function checkRegion(t, x, y, width, height) {
        if (x < 0 || y < 0 || x >= t.width || y >= t.height) fail(`Position x=${x} y=${y} is outside ${label(t)}, which is ${t.width}x${t.height} tiles (x 0-${t.width - 1}, y 0-${t.height - 1}).`);
        if (width < 1 || height < 1) fail('The region is empty: width and height must be at least 1.');
        if (x < 0 || y < 0 || x + width > t.width || y + height > t.height) {
            fail(`The region x=${x} y=${y} ${width}x${height} does not fit in ${label(t)}, which is ${t.width}x${t.height} tiles (x 0-${t.width - 1}, y 0-${t.height - 1}).`);
        }
    }

    function checkTile(tile, name) {
        if (!Number.isInteger(tile) || tile < -1 || tile > MAX_TILE) fail(`${name} must be a tile index from 0 to ${MAX_TILE}, or -1 for empty; got ${tile}.`);
        return tile;
    }

    // Returns the layer to edit, adding layers when a level format allows more. Call it
    // before pushUndo: an undo snapshot only restores the layers that existed when it was taken.
    function layerFor(t, layer) {
        const level = t.level;
        if (layer < level.layers.length) return layer;
        if (t.entry.gmapGrid) fail(`A gmap has layers 0-${level.layers.length - 1}; got ${layer}.`);
        if (level._sourceFormat === 'graal' || level._sourceFormat === 'zelda') fail(`${t.entry.name} is a .${level._sourceFormat} level, which only has layer 0.`);
        if (layer >= MAX_LAYERS) fail(`Levels have at most ${MAX_LAYERS} layers (0-${MAX_LAYERS - 1}); got ${layer}.`);
        while (level.layers.length <= layer) level.layers.push(level.createEmptyLayer());
        t.le.refreshLayerPanel();
        return layer;
    }

    // The tile a layer mostly consists of: its plain ground.
    function commonTile(t, layer) {
        const counts = new Map();
        const tiles = t.level.layers[layer].tiles, stride = t.level.width;
        let best = -1, bestCount = 0;
        for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
            const tile = tiles[(t.oy + y) * stride + t.ox + x];
            const count = (counts.get(tile) || 0) + 1;
            counts.set(tile, count);
            if (count > bestCount) { best = tile; bestCount = count; }
        }
        return best;
    }

    function tileObject(le, name, group) {
        const wanted = String(name).toLowerCase();
        const matches = [];
        for (const [groupName, objects] of Object.entries(le.tileObjects || {})) {
            if (group && groupName.toLowerCase() !== String(group).toLowerCase()) continue;
            for (const [objectName, object] of Object.entries(objects)) {
                if (objectName.toLowerCase() === wanted) matches.push({ group: groupName, name: objectName, object });
            }
        }
        if (!matches.length) fail(`No tile object named "${name}"${group ? ` in group "${group}"` : ''}. Call level_list_tile_objects for the names.`);
        return matches[0];
    }

    // Tiles in one row of a level's tileset image: 128 for the classic 2048px tilesets, 64 for the 1024px terrain ones.
    const tilesPerRow = level => Math.max(1, Math.floor((level?.tilesetImage?.width || TILES_PER_ROW * 16) / 16));

    function graalId(tile, columns = TILES_PER_ROW) {
        const column = tile % columns, row = Math.floor(tile / columns);
        return Math.floor(column / 16) * 512 + (column % 16) + row * 16;
    }

    function describeLevel(t) {
        const { entry, level, le } = t;
        const counts = {};
        for (const obj of level.objects) {
            if (t.member && !inTarget(t, obj)) continue;
            counts[obj.type] = (counts[obj.type] || 0) + 1;
        }
        const info = {
            name: t.member || entry.name,
            kind: t.member ? 'gmap member' : entry.gmapGrid ? 'gmap' : 'level',
            index: t.index,
            path: entryPath(entry),
            unsaved: !!entry.modified,
            active: le.currentLevelIndex === t.index,
            width: t.width,
            height: t.height,
            layers: level.layers.map((layer, index) => ({ layer: index, visible: layer.visible !== false, tiles: countTiles(t, index) })),
            tileset: level.tilesetName || 'pics1.png',
            tileset_type: level.tilesetType || 0,
            objects: counts,
        };
        if (t.member) info.gmap = { name: entry.name, offset_x: t.ox, offset_y: t.oy };
        else if (entry.gmapGrid) {
            info.gmap = {
                columns: Math.max(...entry.gmapGrid.map(row => row.length)),
                rows: entry.gmapGrid.length,
                members: entry.gmapGrid.map(row => row.map(cleanName)),
                missing_members: members(entry).filter(m => !m.loaded).map(m => m.name),
                terrain: !!(entry.terrain && entry.terrain.hasTerrainData),
            };
        } else info.format = level._sourceFormat || 'nw';
        return info;
    }

    function countTiles(t, layer) {
        const tiles = t.level.layers[layer].tiles, stride = t.level.width;
        let count = 0;
        for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (tiles[(t.oy + y) * stride + t.ox + x] >= 0) count++;
        return count;
    }

    const inTarget = (t, obj) => obj.x >= t.ox && obj.x < t.ox + t.width && obj.y >= t.oy && obj.y < t.oy + t.height;

    // ---- Opening, creating, saving ---------------------------------------------------------

    function addEntry(le, entry) {
        le.levels.push(entry);
        le.currentLevelIndex = le.levels.length - 1;
        le.level = entry.level;
        le.undoStack = [];
        le.redoStack = [];
        le.addLevelTab(le.currentLevelIndex);
        syncTabs(le);
        le.updateLevelTabs();
        le.updateUI();
        le.refreshNPCList();
        redraw(le);
        le.saveSessionDebounced();
    }

    function uniqueName(le, wanted) {
        const taken = new Set(le.levels.map(entry => entry.name.toLowerCase()));
        if (!taken.has(wanted.toLowerCase())) return wanted;
        fail(`A level named "${wanted}" is already open. Close it first, or choose another name.`);
    }

    mcp.tool({
        name: 'level_new',
        title: 'Create a level',
        description: 'Create a new 64x64 level in the level editor and make it the active level. It starts filled with grass unless fill_tile says otherwise. The level exists only in the editor until level_save writes it. For a multi-level world use gmap_new or world_generate.',
        input: {
            name: S.string('File name of the level, e.g. "town.nw". The extension picks the format: .nw (default, text, layers), .graal or .zelda (legacy binary).'),
            fill_tile: S.integer(`Tile index to fill layer 0 with. ${GRASS_TILE} is grass in the default tileset.`, { default: GRASS_TILE, minimum: -1, maximum: MAX_TILE }),
            tileset: S.string('Tileset image name', { default: 'pics1.png' }),
        },
        required: ['name'],
    }, async ({ name, fill_tile, tileset }) => {
        const le = await editor();
        if (!/\.(nw|graal|zelda)$/i.test(name)) name += '.nw';
        if (/[\s\\/]/.test(name)) fail(`"${name}" is not usable as a level file name: links cannot name a level with spaces or slashes in it. Use something like "${name.replace(/[\s\\/]+/g, '_').toLowerCase()}".`);
        uniqueName(le, name);
        const format = h.path.ext(name);
        const level = new Level(LEVEL_SIZE, LEVEL_SIZE);
        if (fill_tile >= 0) level.layers[0].tiles.fill(fill_tile);
        if (format !== 'nw') level._sourceFormat = format;
        level.tilesetName = tileset;
        const warning = await ensureTileset(le, level);
        const entry = { level, name, modified: true };
        addEntry(le, entry);
        return { created: describeLevel(resolve(le, name)), warning: warning || undefined, next: 'Paint with level_fill_rect, level_set_tiles or level_place_tile_object, add objects with level_add_npc and friends, look at it with level_screenshot, then level_save.' };
    });

    // The example levels that ship inside the app.
    async function bundledLevels() {
        const names = await fetch('levels/index.json').then(response => response.json()).catch(() => []);
        return (Array.isArray(names) ? names : names.files || []).filter(name => /\.(nw|graal|zelda)$/i.test(name));
    }

    async function openBundledLevel(le, wanted) {
        const names = await bundledLevels();
        const name = names.find(item => item.toLowerCase() === wanted.toLowerCase()) || names.find(item => h.path.stem(item).toLowerCase() === wanted.toLowerCase())
            || fail(`No example level "${wanted}" ships with the app. Example levels: ${names.join(', ') || 'none'}.`);
        // An example has no path on disk; one that is still open and untouched is shown rather than opened twice.
        const existing = levelEntries(le).find(item => item.entry.name === name && !entryPath(item.entry) && !item.entry.modified);
        if (existing) return { opened: describeLevel(await open(existing.index)), already_open: true };
        uniqueName(le, name);
        const response = await fetch('levels/' + name);
        if (!response.ok) fail(`The example level ${name} could not be read.`);
        const before = le.levels.length;
        if (/\.nw$/i.test(name)) {
            const text = await response.text();
            if (!/^GLEVNW01/.test(text)) fail(`${name} is not a .nw level.`);
            le.openFromText(text, name, null);
        } else le.openFromBuffer(await response.arrayBuffer(), name, null);
        if (le.levels.length === before) fail(`${name} could not be read.`);
        syncTabs(le);
        const t = await open(le.levels.length - 1);
        redraw(le);
        return { opened: describeLevel(t), warning: t.warning || undefined, note: 'This is a copy of an example that ships with the app: it has no file yet. Save it with level_save and a path to keep changes.' };
    }

    mcp.tool({
        name: 'level_open',
        title: 'Open a level or gmap',
        description: 'Open a level (.nw, .graal, .zelda) or a gmap (.gmap) from disk in the level editor. A gmap opens as one large level made of its member levels, which are read from the same folder. Opening a file that is already open just activates it. With `bundled`, opens one of the example levels that ship inside the app instead (finished levels to study: tile use, NPC scripts, links); with neither argument, lists those examples.',
        input: {
            path: S.string('Absolute path of the file'),
            bundled: S.string('Name of an example level that ships with the app, e.g. "onlinestartlocal.nw"'),
        },
        openWorld: true,
    }, async ({ path: target, bundled }) => {
        const le = await editor();
        if (target && bundled) fail('Give path or bundled, not both.');
        if (bundled) return openBundledLevel(le, bundled);
        if (!target) return { bundled: await bundledLevels(), note: 'Open one with level_open and bundled, or a file of your own with path.' };
        h.requireAbsolute(target, 'path');
        const normalized = h.path.normalize(target).toLowerCase();
        const existing = levelEntries(le).find(item => h.path.normalize(entryPath(item.entry)).toLowerCase() === normalized);
        if (existing) {
            const t = await open(existing.index);
            return { opened: describeLevel(t), already_open: true };
        }
        const info = await h.files.stat(target);
        if (!info.exists || info.isDir) fail(`No such file: ${target}`);
        const name = h.path.base(target), ext = h.path.ext(target), before = le.levels.length;
        if (ext === 'gmap') {
            const text = await h.files.readText(target);
            if (!/^GRMAP001/.test(text)) fail(`${name} is not a gmap: it does not start with GRMAP001.`);
            await le.openGmapText(text, name, null, target);
        } else if (ext === 'graal' || ext === 'zelda') {
            const bytes = await h.files.readBytes(target);
            le.openFromBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), name, target);
        } else if (ext === 'nw') {
            const text = await h.files.readText(target);
            if (!/^GLEVNW01/.test(text)) fail(`${name} is not a .nw level: it does not start with GLEVNW01.`);
            le.openFromText(text, name, target);
        } else fail(`The level editor opens .nw, .graal, .zelda and .gmap files, not .${ext}.`);
        if (le.levels.length === before) fail(`${name} could not be read as a ${ext} file.`);
        const entry = le.levels[le.levels.length - 1];
        entry.filePath = entry.fullPath = target;
        syncTabs(le);
        const t = await open(le.levels.length - 1);
        redraw(le);
        return { opened: describeLevel(t), warning: t.warning || undefined };
    });

    mcp.tool({
        name: 'level_open_text',
        title: 'Open a level from text',
        description: 'Open a .nw level given as text (GLEVNW01 format) without reading a file, e.g. a level you generated yourself. It opens unsaved; use level_save to write it.',
        input: { name: S.string('File name for the level, e.g. "cave.nw"'), text: S.string('The .nw level text, starting with GLEVNW01') },
        required: ['name', 'text'],
    }, async ({ name, text }) => {
        const le = await editor();
        if (!/\.nw$/i.test(name)) name += '.nw';
        uniqueName(le, name);
        if (!/^GLEVNW01/.test(text)) fail('The text is not a .nw level: it must start with the line GLEVNW01. See the guide "level-format".');
        le.openFromText(text.replace(/\r\n/g, '\n'), name, null);
        le.levels[le.levels.length - 1].modified = true;
        const t = await open(le.levels.length - 1);
        redraw(le);
        return { opened: describeLevel(t), warning: t.warning || undefined };
    });

    mcp.tool({
        name: 'level_get_info',
        title: 'Describe a level',
        description: 'Size, layers, tileset, object counts and save state of a level. For a gmap it also gives the grid of member level names; pass a member name as `level` to look at one member.',
        input: { level: LEVEL_ARG },
        readOnly: true,
    }, async ({ level }) => describeLevel(resolve(await editor(), level)));

    mcp.tool({
        name: 'level_get_text',
        title: 'Get a level as .nw text',
        description: 'The level serialized in the .nw text format (what level_save would write). For a gmap pass a member level name; with the gmap itself it returns the .gmap text.',
        input: { level: LEVEL_ARG },
        readOnly: true,
    }, async ({ level }) => {
        const le = await editor();
        const t = resolve(le, level);
        if (!t.entry.gmapGrid) return t.level.saveToNW();
        const serialized = le._serializeGmapEntry(t.entry);
        if (!t.member) return serialized.gmap;
        return serialized.gmapLevels[t.member] ?? fail(`${t.member} is a binary or missing member of ${t.entry.name}; it has no .nw text.`);
    });

    async function writeLevel(le, entry, target) {
        const ext = h.path.ext(target);
        if (entry.gmapGrid) {
            if (ext !== 'gmap') fail(`${entry.name} is a gmap; save it to a path ending in .gmap. Its member levels are written next to it.`);
            const serialized = le._serializeGmapEntry(entry);
            const dir = h.path.dir(target), written = [h.path.base(target)];
            await h.files.write(target, serialized.gmap);
            const fileFor = name => { const file = cleanName(serialized.gmapFiles?.[name] || name); return /\.(nw|graal|zelda)$/i.test(file) ? file : file + '.nw'; };
            for (const [name, text] of Object.entries(serialized.gmapLevels)) { await h.files.write(h.path.join(dir, fileFor(name)), text); written.push(fileFor(name)); }
            for (const [name, bytes] of Object.entries(serialized.gmapBuffers || {})) { await h.files.write(h.path.join(dir, fileFor(name)), bytes); written.push(fileFor(name)); }
            entry.gmapLevels = serialized.gmapLevels;
            entry.filePath = entry.fullPath = target;
            return written;
        }
        if (!['nw', 'graal', 'zelda'].includes(ext)) fail(`Save a level to a path ending in .nw, .graal or .zelda; got "${target}".`);
        await h.files.write(target, ext === 'nw' ? entry.level.saveToNW() : entry.level.saveToGraal(ext === 'zelda'));
        entry.filePath = entry.fullPath = target;
        return [h.path.base(target)];
    }

    mcp.tool({
        name: 'level_save',
        title: 'Save a level or gmap',
        description: 'Write a level to disk. Give a path the first time; later saves reuse it. Saving a gmap writes the .gmap file and every member level into the same folder. Returns the files written.',
        input: {
            level: LEVEL_ARG,
            path: S.string('Absolute path to save to (.nw, .graal, .zelda, or .gmap for a gmap). Omit to save where it was opened from or last saved.'),
        },
        idempotent: true,
        openWorld: true,
    }, async ({ level, path: target }) => {
        const le = await editor();
        const t = resolve(le, level);
        const entry = t.entry;
        target = target || entryPath(entry);
        if (!target) fail(`${entry.name} has never been saved. Pass an absolute path, e.g. "<folder>/${entry.name}". app_get_state lists the home, documents and workspace directories.`);
        h.requireAbsolute(target, 'path');
        const written = await writeLevel(le, entry, target).catch(error => fail(error instanceof mcp.ToolError ? error.message : `Could not save ${entry.name}: ${error.message || error}`));
        entry.name = h.path.base(target);
        entry.modified = false;
        const tab = tabFor(entry);
        if (tab) { window.tabManager.renameTab(tab.id, entry.name); window.tabManager.markDirty(tab.id, false); }
        le.updateLevelTabs();
        le.saveSessionDebounced();
        return { saved: entry.name, folder: h.path.dir(target), files: written };
    });

    mcp.tool({
        name: 'level_save_all',
        title: 'Save every unsaved level',
        description: 'Save every open level and gmap that has unsaved changes and already has a path. Levels that were never saved are reported so you can save them with level_save and a path.',
        idempotent: true,
        openWorld: true,
    }, async () => {
        const le = await editor();
        const saved = [], need_path = [];
        for (const { entry } of levelEntries(le)) {
            if (!entry.modified) continue;
            const target = entryPath(entry);
            if (!target) { need_path.push(entry.name); continue; }
            await writeLevel(le, entry, target);
            entry.modified = false;
            const tab = tabFor(entry);
            if (tab) window.tabManager.markDirty(tab.id, false);
            saved.push(entry.name);
        }
        le.updateLevelTabs();
        le.saveSessionDebounced();
        return { saved, need_path };
    });

    mcp.tool({
        name: 'level_close',
        title: 'Close a level',
        description: 'Close a level or gmap tab. Unsaved changes are only discarded when discard_changes is true.',
        input: { level: LEVEL_ARG, discard_changes: S.boolean('Close even with unsaved changes', { default: false }) },
        destructive: true,
    }, async ({ level, discard_changes }) => {
        const le = await editor();
        const t = resolve(le, level);
        if (t.entry.modified && !discard_changes) fail(`${t.entry.name} has unsaved changes. Save it with level_save, or pass discard_changes: true.`);
        closeEntry(le, t.entry);
        return { closed: t.entry.name, open_levels: levelEntries(le).map(item => item.entry.name) };
    });

    function closeEntry(le, entry) {
        const active = le.levels[le.currentLevelIndex];
        entry.modified = false;
        const tab = tabFor(entry);
        if (tab) { tab.dirty = false; window.tabManager._forceRemoveTab(tab.id); }
        const index = le.levels.indexOf(entry);
        if (index >= 0) le._removeLevelData(index);
        syncTabs(le);
        // Removing a level shifts the ones after it; put back the level that was being shown.
        const keep = active && active !== entry ? le.levels.indexOf(active) : -1;
        if (keep >= 0 && (le.currentLevelIndex !== keep || le.level !== active.level)) {
            const keepTab = tabFor(active);
            if (keepTab) window.tabManager.switchTo(keepTab.id);
            if (le.currentLevelIndex !== keep || le.level !== active.level) le.switchLevel(keep);
        }
    }
    mcp.helpers.level = { editor, resolve, open, activate, commit, describeLevel, addEntry, closeEntry, ensureTileset, loadTileset, levelEntries, tabFor, syncTabs, members, label, uniqueName, entryPath, cleanName, redraw, GRASS_TILE, LEVEL_SIZE, LEVEL_ARG };

    mcp.tool({
        name: 'level_activate',
        title: 'Show a level',
        description: 'Make a level the active one in the level editor and bring the level editor to the front.',
        input: { level: S.string('Level name or index from app_get_state') },
        required: ['level'],
        idempotent: true,
    }, async ({ level }) => {
        const t = await open(level);
        const tab = tabFor(t.entry);
        if (tab) window.tabManager.switchTo(tab.id);
        return { active: describeLevel(t), warning: t.warning || undefined };
    });

    mcp.tool({
        name: 'level_undo',
        title: 'Undo or redo in a level',
        description: 'Undo the last edit to a level, or redo it. Each tool call that edits tiles or objects is one undo step, and every open level has its own history (up to 50 steps). Adding a layer and changing the tileset are not undoable, and removing a layer clears the level\'s history.',
        input: {
            level: LEVEL_ARG,
            redo: S.boolean('Redo instead of undo', { default: false }),
            steps: S.integer('How many steps', { default: 1, minimum: 1, maximum: 50 }),
        },
    }, async ({ level, redo, steps }) => {
        const le = await editor();
        const target = await open(level);
        le._keepUndoForLevel();
        let done = 0;
        for (; done < steps; done++) {
            const stack = redo ? le.redoStack : le.undoStack;
            if (!stack.length) break;
            if (redo) le.redo(); else le.undo();
        }
        if (done) commit(resolve(le), true);
        return { level: target.entry.name, [redo ? 'redone' : 'undone']: done, undo_available: le.undoStack.length, redo_available: le.redoStack.length };
    });

    // ---- Tiles -------------------------------------------------------------------------------

    mcp.tool({
        name: 'level_get_tiles',
        title: 'Read tiles',
        description: 'Read a rectangle of tiles from one layer as rows of tile indices (-1 = empty). Omit the region to read the whole level. Use it to study how existing levels are built before painting your own.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Left tile column', { default: 0, minimum: 0 }),
            y: S.integer('Top tile row', { default: 0, minimum: 0 }),
            width: S.integer('Columns to read; defaults to the rest of the level', { minimum: 1 }),
            height: S.integer('Rows to read; defaults to the rest of the level', { minimum: 1 }),
            layer: S.integer('Layer to read', { default: 0, minimum: 0 }),
        },
        readOnly: true,
    }, async ({ level, x, y, width, height, layer }) => {
        const t = resolve(await editor(), level);
        width = width ?? t.width - x;
        height = height ?? t.height - y;
        checkRegion(t, x, y, width, height);
        if (layer >= t.level.layers.length) fail(`${label(t)} has layers 0-${t.level.layers.length - 1}; got ${layer}.`);
        const tiles = t.level.layers[layer].tiles, stride = t.level.width, rows = [];
        for (let row = 0; row < height; row++) {
            const start = (t.oy + y + row) * stride + t.ox + x;
            rows.push(tiles.slice(start, start + width));
        }
        return { level: label(t), layer, x, y, width, height, tiles: rows };
    });

    mcp.tool({
        name: 'level_set_tiles',
        title: 'Paint a block of tiles',
        description: 'Write a block of tiles into a layer. `tiles` is an array of rows, each an array of tile indices; the block\'s top-left corner goes at x,y. Use null to leave a cell unchanged and -1 to erase it. One call is one undo step, so paint a whole structure in one call.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Left tile column of the block', { minimum: 0 }),
            y: S.integer('Top tile row of the block', { minimum: 0 }),
            tiles: S.array(S.array({ type: ['integer', 'null'] }), 'Rows of tile indices'),
            layer: S.integer('Layer to paint. Layer 0 is the ground; higher layers draw on top and are created as needed (.nw only).', { default: 0, minimum: 0 }),
        },
        required: ['x', 'y', 'tiles'],
    }, async ({ level, x, y, tiles, layer }) => {
        const t = await open(level);
        const height = tiles.length, width = Math.max(0, ...tiles.map(row => row.length));
        checkRegion(t, x, y, width, height);
        tiles.forEach((row, rowIndex) => row.forEach((tile, column) => { if (tile !== null) checkTile(tile, `tiles[${rowIndex}][${column}]`); }));
        layer = layerFor(t, layer);
        t.le.pushUndo();
        let changed = 0;
        tiles.forEach((row, rowIndex) => row.forEach((tile, column) => {
            if (tile === null) return;
            t.level.setTile(layer, t.ox + x + column, t.oy + y + rowIndex, tile);
            changed++;
        }));
        commit(t);
        return { level: label(t), layer, x, y, width, height, tiles_written: changed };
    });

    mcp.tool({
        name: 'level_fill_rect',
        title: 'Fill a rectangle with tiles',
        description: 'Fill a rectangle of a layer with one tile, or tile it with a repeating pattern. The pattern can be given as rows of tile indices or as the name of a tile object (e.g. "HouseGround", "CastleFloor Red", "Blackness"), which is repeated to cover the area. Omit the region to fill the whole level.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Left tile column', { default: 0, minimum: 0 }),
            y: S.integer('Top tile row', { default: 0, minimum: 0 }),
            width: S.integer('Columns to fill; defaults to the rest of the level', { minimum: 1 }),
            height: S.integer('Rows to fill; defaults to the rest of the level', { minimum: 1 }),
            tile: S.integer('Single tile index to fill with (-1 erases)', { minimum: -1, maximum: MAX_TILE }),
            pattern: S.array(S.array(S.integer()), 'Rows of tile indices to repeat across the area'),
            tile_object: S.string('Name of a tile object to repeat across the area (see level_list_tile_objects)'),
            layer: S.integer('Layer to fill', { default: 0, minimum: 0 }),
        },
    }, async ({ level, x, y, width, height, tile, pattern, tile_object, layer }) => {
        const t = await open(level);
        width = width ?? t.width - x;
        height = height ?? t.height - y;
        checkRegion(t, x, y, width, height);
        if ([tile, pattern, tile_object].filter(value => value !== undefined).length !== 1) fail('Give exactly one of tile, pattern or tile_object.');
        const stamped = tile_object !== undefined;
        if (stamped) pattern = tileObject(t.le, tile_object).object.tiles;
        if (tile !== undefined) pattern = [[checkTile(tile, 'tile')]];
        if (!pattern.length || pattern.some(row => !row.length)) fail('The pattern is empty: every row needs at least one tile.');
        pattern.forEach((row, rowIndex) => row.forEach((value, column) => checkTile(value, `pattern[${rowIndex}][${column}]`)));
        layer = layerFor(t, layer);
        t.le.pushUndo();
        for (let row = 0; row < height; row++) {
            const source = pattern[row % pattern.length];
            for (let column = 0; column < width; column++) {
                const value = source[column % source.length];
                // An empty cell of a tile object means "leave what is there", as when it is placed.
                if (stamped && value < 0) continue;
                t.level.setTile(layer, t.ox + x + column, t.oy + y + row, value);
            }
        }
        commit(t);
        return { level: label(t), layer, x, y, width, height };
    });

    mcp.tool({
        name: 'level_copy_region',
        title: 'Copy part of a level',
        description: 'Copy a rectangle of tiles (all layers by default), optionally with the objects standing in it, to another position or another open level. Use it to reuse rooms, buildings and scenery from existing levels.',
        input: {
            from_level: S.string('Level to copy from; defaults to the active level'),
            x: S.integer('Left column of the source rectangle', { minimum: 0 }),
            y: S.integer('Top row of the source rectangle', { minimum: 0 }),
            width: S.integer('Columns to copy', { minimum: 1 }),
            height: S.integer('Rows to copy', { minimum: 1 }),
            to_level: S.string('Level to paste into; defaults to from_level'),
            to_x: S.integer('Left column of the destination', { minimum: 0 }),
            to_y: S.integer('Top row of the destination', { minimum: 0 }),
            layers: S.array(S.integer({ minimum: 0 }), 'Layers to copy; defaults to every layer of the source'),
            include_objects: S.boolean('Also copy NPCs, links, signs, chests and baddies in the rectangle', { default: false }),
            skip_empty: S.boolean('Leave destination tiles alone where the source is empty (-1). The ground layer (0) always behaves this way: it has no empty tiles.', { default: false }),
        },
        required: ['x', 'y', 'width', 'height', 'to_x', 'to_y'],
    }, async ({ from_level, x, y, width, height, to_level, to_x, to_y, layers, include_objects, skip_empty }) => {
        const le = await editor();
        const source = resolve(le, from_level);
        const t = await open(to_level ?? from_level);
        checkRegion(source, x, y, width, height);
        checkRegion(t, to_x, to_y, width, height);
        layers = layers || source.level.layers.map((_, index) => index);
        const copied = layers.map(layer => {
            if (layer >= source.level.layers.length) fail(`${label(source)} has no layer ${layer}.`);
            const rows = [];
            for (let row = 0; row < height; row++) {
                const line = [];
                for (let column = 0; column < width; column++) line.push(source.level.getTile(layer, source.ox + x + column, source.oy + y + row));
                rows.push(line);
            }
            return { layer, rows };
        });
        const objects = include_objects ? source.level.objects.filter(obj => obj.x >= source.ox + x && obj.x < source.ox + x + width && obj.y >= source.oy + y && obj.y < source.oy + y + height) : [];
        for (const { layer } of copied) layerFor(t, layer);
        le.pushUndo();
        for (const { layer, rows } of copied) {
            const destination = layer;
            rows.forEach((line, row) => line.forEach((tile, column) => {
                if (tile < 0 && (skip_empty || destination === 0)) return;
                t.level.setTile(destination, t.ox + to_x + column, t.oy + to_y + row, tile);
            }));
        }
        for (const obj of objects) {
            const clone = new LevelObject(obj.x - source.ox - x + t.ox + to_x, obj.y - source.oy - y + t.oy + to_y, obj.type);
            clone.properties = JSON.parse(JSON.stringify(obj.properties || {}));
            t.level.addObject(clone);
        }
        commit(t, objects.length > 0);
        return { from: label(source), to: label(t), width, height, layers, objects_copied: objects.length };
    });

    mcp.tool({
        name: 'level_list_tile_objects',
        title: 'List tile objects',
        description: 'The editor\'s library of ready-made tile arrangements ("tile objects"): trees, houses, bushes, stones, bridges, castle walls and doors, house interiors and furniture, snow and volcano scenery. Each has a name and a size in tiles. Place one with level_place_tile_object, or repeat a small one over an area with level_fill_rect. They are made for the default tileset (pics1.png).',
        input: {
            group: S.string('Only list this group (Standard, Castle, House Inside, Snow, Volcano, or a user group)'),
            include_tiles: S.boolean('Return each object with its rows of tile indices instead of just its name and size (give a group: the whole library is large)', { default: false }),
        },
        readOnly: true,
    }, async ({ group, include_tiles }) => {
        const le = await editor();
        const groups = {};
        for (const [groupName, objects] of Object.entries(le.tileObjects || {})) {
            if (group && groupName.toLowerCase() !== group.toLowerCase()) continue;
            const names = Object.entries(objects).map(([name, object]) => include_tiles
                ? { name, width: object.width, height: object.height, built_in: le._builtinKeys?.has(`${groupName}/${name}`) || undefined, tiles: object.tiles }
                : `${name} (${object.width}x${object.height})`);
            if (names.length || group) groups[groupName] = names;
        }
        if (group && !Object.keys(groups).length) fail(`No tile object group "${group}". Groups: ${Object.keys(le.tileObjects || {}).join(', ')}.`);
        return groups;
    });

    mcp.tool({
        name: 'level_place_tile_object',
        title: 'Place tile objects',
        description: 'Stamp tile objects from the library into a level, top-left corner at x,y. Give one object, or several placements at once in `placements` (one undo step). Returns the footprint of each so you can keep paths clear and place doors and links, and warns when a stamp lands on another stamp or on tiles that were not plain ground.',
        input: {
            level: LEVEL_ARG,
            name: S.string('Tile object name, e.g. "Tree", "House", "Bush"'),
            x: S.integer('Left tile column', { minimum: 0 }),
            y: S.integer('Top tile row', { minimum: 0 }),
            placements: S.array(S.object({ name: S.string('Tile object name'), x: S.integer('Left tile column', { minimum: 0 }), y: S.integer('Top tile row', { minimum: 0 }) }, ['name', 'x', 'y']), 'Several placements, drawn in order'),
            group: S.string('Group to look in when a name exists in more than one'),
            layer: S.integer('Layer to stamp into', { default: 0, minimum: 0 }),
        },
    }, async ({ level, name, x, y, placements, group, layer }) => {
        const t = await open(level);
        const list = placements ? placements.slice() : [];
        if (name !== undefined) {
            if (x === undefined || y === undefined) fail('Give x and y with name.');
            list.unshift({ name, x, y });
        }
        if (!list.length) fail('Give name, x and y, or a placements array.');
        const resolved = list.map(item => {
            const found = tileObject(t.le, item.name, group);
            const height = found.object.tiles.length, width = Math.max(...found.object.tiles.map(row => row.length));
            checkRegion(t, item.x, item.y, width, height);
            return { ...item, name: found.name, width, height, tiles: found.object.tiles };
        });
        layer = layerFor(t, layer);
        // What the stamps land on: tiles that were not plain ground before, and each other.
        const ground = commonTile(t, layer);
        const taken = new Map();
        t.le.pushUndo();
        for (const item of resolved) {
            item.covered = 0;
            item.overlaps = new Set();
            item.tiles.forEach((row, rowIndex) => row.forEach((tile, column) => {
                if (tile < 0) return;
                const tx = t.ox + item.x + column, ty = t.oy + item.y + rowIndex, key = ty * t.level.width + tx;
                if (taken.has(key)) item.overlaps.add(taken.get(key));
                else if (t.level.getTile(layer, tx, ty) !== ground) item.covered++;
                taken.set(key, `${item.name} at ${item.x},${item.y}`);
                t.level.setTile(layer, tx, ty, tile);
            }));
        }
        commit(t);
        const placed = resolved.map(item => {
            const out = { name: item.name, x: item.x, y: item.y, width: item.width, height: item.height };
            if (item.overlaps.size) out.overlaps = [...item.overlaps];
            if (item.covered) out.replaced_tiles = item.covered;
            return out;
        });
        const result = { level: label(t), layer, placed };
        if (placed.some(item => item.overlaps || item.replaced_tiles)) result.warning = '`overlaps` lists stamps of this call that share tiles; `replaced_tiles` counts tiles that were not plain ground before (water, cliffs, paths or something placed earlier). Look at a level_screenshot of the area and undo with level_undo if a stamp cut into something.';
        return result;
    });

    mcp.tool({
        name: 'level_create_tile_object',
        title: 'Save a tile object',
        description: 'Save a named tile object in the library, so it can be stamped again with level_place_tile_object (a building you designed, a piece of scenery): either a rectangle of a level (x, y, width, height), or rows of tile indices you give directly (tiles). It is kept with the user\'s own tile objects, next to the built-in ones.',
        input: {
            level: LEVEL_ARG,
            name: S.string('Name for the tile object'),
            x: S.integer('Left tile column', { minimum: 0 }),
            y: S.integer('Top tile row', { minimum: 0 }),
            width: S.integer('Columns', { minimum: 1, maximum: 64 }),
            height: S.integer('Rows', { minimum: 1, maximum: 64 }),
            tiles: S.array(S.array(S.integer({ minimum: -1, maximum: MAX_TILE })), 'Instead of a rectangle of a level: the rows of tile indices, top to bottom (-1 leaves a tile as it is when stamped)'),
            group: S.string('Group to file it under', { default: 'Default' }),
            layer: S.integer('Layer to take the tiles from', { default: 0, minimum: 0 }),
        },
        required: ['name'],
    }, async ({ level, name, x, y, width, height, tiles: rows, group, layer }) => {
        const le = await editor();
        name = checkLibraryName(name, 'name');
        group = checkLibraryName(group, 'group');
        if (le._builtinKeys?.has(`${group}/${name}`)) fail(`"${name}" in group "${group}" is a built-in tile object and cannot be replaced. Choose another name or group.`);
        let tiles;
        if (rows) {
            if ([x, y, width, height].some(value => value !== undefined)) fail('Give tiles, or a rectangle of a level (x, y, width, height), not both.');
            tiles = checkTileRows(rows, 'tiles');
            width = tiles[0].length;
            height = tiles.length;
        } else {
            if ([x, y, width, height].some(value => value === undefined)) fail('Give the rectangle to save (x, y, width, height), or tiles.');
            const t = resolve(le, level);
            checkRegion(t, x, y, width, height);
            if (layer >= t.level.layers.length) fail(`${label(t)} has layers 0-${t.level.layers.length - 1}; got ${layer}.`);
            tiles = [];
            for (let row = 0; row < height; row++) {
                const line = [];
                for (let column = 0; column < width; column++) line.push(t.level.getTile(layer, t.ox + x + column, t.oy + y + row));
                tiles.push(line);
            }
        }
        changeTileObjects(le, () => {
            le.tileObjects[group] = le.tileObjects[group] || {};
            le.tileObjects[group][name] = { tiles, width, height };
        });
        return { saved: name, group, width, height };
    });

    mcp.tool({
        name: 'level_delete_tile_object',
        title: 'Delete a saved tile object',
        description: 'Remove a tile object that was saved with level_create_tile_object (or by the user) from the library, for example one saved from the wrong region; or, with whole_group, a whole group of them. The built-in tile objects cannot be deleted. A group that becomes empty is removed too, except "Default", which always exists.',
        input: {
            name: S.string('Name of the tile object'),
            group: S.string('Group it is filed under', { default: 'Default' }),
            whole_group: S.boolean('Delete the group and every tile object in it, instead of one object', { default: false }),
        },
        destructive: true,
    }, async ({ name, group, whole_group }) => {
        const le = await editor();
        const objects = le.tileObjects[group];
        if (whole_group) {
            if (name) fail('Give name to delete one tile object, or whole_group to delete the group, not both.');
            if (!objects) fail(`There is no tile object group "${group}". Groups: ${Object.keys(le.tileObjects).join(', ')}.`);
            if (group === 'Default') fail('The group "Default" always exists; delete its tile objects one by one.');
            const builtIn = Object.keys(objects).filter(key => le._builtinKeys?.has(`${group}/${key}`));
            if (builtIn.length) fail(`"${group}" holds built-in tile objects (${builtIn.slice(0, 4).join(', ')}${builtIn.length > 4 ? ', ...' : ''}) and cannot be deleted.`);
            const removed = Object.keys(objects);
            changeTileObjects(le, () => { delete le.tileObjects[group]; });
            return { deleted_group: group, objects_removed: removed };
        }
        if (!name) fail('Give the name of the tile object to delete, or whole_group: true.');
        if (!objects || !objects[name]) fail(`There is no tile object "${name}" in group "${group}". level_list_tile_objects shows what exists.`);
        if (le._builtinKeys?.has(`${group}/${name}`)) fail(`"${name}" in group "${group}" is a built-in tile object and cannot be deleted.`);
        // The editor's own "new tile object" expects the Default group to be there.
        const emptied = Object.keys(objects).length === 1 && group !== 'Default';
        changeTileObjects(le, () => {
            delete le.tileObjects[group][name];
            if (emptied) delete le.tileObjects[group];
        });
        return { deleted: name, group, group_removed: emptied || undefined };
    });

    // The user's own tile objects, without the built-in ones: what the editor's Export writes.
    function userTileObjects(le) {
        const data = {};
        for (const [group, objects] of Object.entries(le.tileObjects || {})) {
            const own = Object.fromEntries(Object.entries(objects).filter(([name]) => !le._builtinKeys?.has(`${group}/${name}`)));
            if (Object.keys(own).length) data[group] = own;
        }
        return data;
    }

    function checkTileRows(rows, what) {
        if (!Array.isArray(rows) || !rows.length || !rows.every(row => Array.isArray(row) && row.length)) fail(`${what} must be rows of tile indices, at least one row with at least one tile.`);
        if (rows.length > LEVEL_SIZE || rows[0].length > LEVEL_SIZE) fail(`${what} is ${rows[0].length}x${rows.length}; a tile object is at most ${LEVEL_SIZE}x${LEVEL_SIZE}.`);
        if (rows.some(row => row.length !== rows[0].length)) fail(`${what} has rows of different lengths; every row must have ${rows[0].length} tiles like the first.`);
        if (rows.some(row => row.some(tile => !Number.isInteger(tile) || tile < -1 || tile > MAX_TILE))) fail(`${what} must hold tile indices from 0 to ${MAX_TILE}, or -1 for a tile left as it is.`);
        return rows.map(row => row.slice());
    }

    // Names end up in the editor's lists, which are built as HTML.
    function checkLibraryName(value, what) {
        const name = String(value).trim();
        if (!name) fail(`${what} must not be empty.`);
        if (/[<>&"'\\\r\n]/.test(name)) fail(`${what} "${name}" cannot be used: leave out < > & quotes and backslashes.`);
        return name;
    }

    // Changes the library and stores it; a change that cannot be stored is taken back.
    function changeTileObjects(le, change) {
        const before = JSON.stringify(le.tileObjects);
        try {
            change();
            le._saveTileObjects();
        } catch (error) {
            le.tileObjects = JSON.parse(before);
            le._fillTileObjectGroups?.();
            fail(`The tile object library could not be stored (${error.message || error}); the app's storage may be full. Nothing was changed.`);
        }
        le._fillTileObjectGroups?.();
    }

    mcp.tool({
        name: 'level_export_tile_objects',
        title: 'Export the tile object library',
        description: 'Write the user\'s own tile objects (not the built-in ones) to a JSON file, in the format of the level editor\'s Export button, to keep them with a project or carry them to another computer. Without a path the library is returned instead. level_import_tile_objects reads such a file.',
        input: { path: S.string('Absolute path of the .json file to write; omit to get the library in the result') },
        idempotent: true,
        openWorld: true,
    }, async ({ path: target }) => {
        const le = await editor();
        const data = userTileObjects(le);
        const count = Object.values(data).reduce((total, objects) => total + Object.keys(objects).length, 0);
        if (!target) return { groups: Object.keys(data).length, objects: count, library: data };
        h.requireAbsolute(target, 'path');
        if (h.path.ext(target) !== 'json') fail(`path must end in .json, got "${h.path.base(target)}".`);
        await h.files.write(target, JSON.stringify(data, null, 2));
        return { saved: h.path.normalize(target), groups: Object.keys(data).length, objects: count };
    });

    mcp.tool({
        name: 'level_import_tile_objects',
        title: 'Import tile objects',
        description: 'Add tile objects from a JSON file written by level_export_tile_objects or the level editor\'s Export button (groups of named objects, each with its rows of tile indices) to the library. Objects of the same group and name are replaced; everything else is kept. Built-in tile objects are never replaced.',
        input: {
            path: S.string('Absolute path of the .json file'),
            library: S.object({}, [], 'Instead of a file: the library itself, { "Group": { "Name": { "tiles": [[...], ...] } } }'),
        },
    }, async ({ path: target, library }) => {
        const le = await editor();
        if (!!target === !!library) fail('Give path or library, one of them.');
        if (target) {
            h.requireAbsolute(target, 'path');
            const info = await h.files.stat(target);
            if (!info.exists || info.isDir) fail(`No such file: ${target}`);
            try { library = JSON.parse(await h.files.readText(target)); } catch (error) { fail(`${h.path.base(target)} is not valid JSON: ${error.message}`); }
        }
        if (!library || typeof library !== 'object' || Array.isArray(library)) fail('A tile object library is an object of groups, each an object of named tile objects.');
        // Everything is checked before anything is added.
        const incoming = [], skipped = [];
        for (const [group, objects] of Object.entries(library)) {
            if (!objects || typeof objects !== 'object' || Array.isArray(objects)) fail(`Group "${group}" must be an object of named tile objects.`);
            checkLibraryName(group, 'A group name');
            for (const [name, object] of Object.entries(objects)) {
                checkLibraryName(name, `A tile object name in group "${group}"`);
                if (le._builtinKeys?.has(`${group}/${name}`)) { skipped.push(`${group}/${name}`); continue; }
                const tiles = checkTileRows(object && object.tiles, `"${name}" in group "${group}": tiles`);
                incoming.push({ group, name, tiles });
            }
        }
        if (!incoming.length) fail(`Nothing to import${skipped.length ? `: ${skipped.join(', ')} are built-in tile objects` : ': the library is empty'}.`);
        changeTileObjects(le, () => {
            for (const { group, name, tiles } of incoming) {
                le.tileObjects[group] = le.tileObjects[group] || {};
                le.tileObjects[group][name] = { tiles, width: tiles[0].length, height: tiles.length };
            }
        });
        return { imported: incoming.length, groups: [...new Set(incoming.map(item => item.group))], skipped_built_in: skipped.length ? skipped : undefined };
    });

    mcp.tool({
        name: 'level_get_tile_info',
        title: 'Look up tiles',
        description: 'For tile indices, give the position in the tileset image, the Graal tile id used by scripts (tiles[x,y]) and .nw files, and the collision type (normal, blocking, water, chair, bed, swamp, lava, ...). Give `tiles`, or a level position to inspect what is there on every layer.',
        input: {
            level: LEVEL_ARG,
            tiles: S.array(S.integer({ minimum: 0, maximum: MAX_TILE }), 'Tile indices to look up'),
            x: S.integer('Tile column of a level position to inspect', { minimum: 0 }),
            y: S.integer('Tile row of a level position to inspect', { minimum: 0 }),
        },
        readOnly: true,
    }, async ({ level, tiles, x, y }) => {
        const le = await editor();
        const describe = (tile, type, columns) => {
            const id = graalId(tile, columns);
            const kind = typeof TILE_TYPES !== 'undefined' ? TILE_TYPES.get(id, type) : 0;
            return { tile, column: tile % columns, row: Math.floor(tile / columns), graal_id: id, type: (typeof TILE_TYPES !== 'undefined' && TILE_TYPES.NAMES[kind]) || 'normal' };
        };
        if (tiles && (x !== undefined || y !== undefined)) fail('Give either tiles, or x and y, not both.');
        if (tiles) {
            const lvl = levelEntries(le).length ? resolve(le, level).level : null;
            return { tiles: tiles.map(tile => describe(tile, lvl?.tilesetType || 0, tilesPerRow(lvl))) };
        }
        if (x === undefined || y === undefined) fail('Give tiles, or x and y.');
        const t = resolve(le, level);
        checkRegion(t, x, y, 1, 1);
        const layers = t.level.layers.map((_, index) => {
            const tile = t.level.getTile(index, t.ox + x, t.oy + y);
            return tile < 0 ? { layer: index, tile: -1 } : { layer: index, ...describe(tile, t.level.tilesetType || 0, tilesPerRow(t.level)) };
        });
        const objects = t.level.objects.filter(obj => Math.floor(obj.x) === t.ox + x && Math.floor(obj.y) === t.oy + y).map(obj => describeObject(t, obj, false));
        return { level: label(t), x, y, layers, objects };
    });

    const WALK_CHARS = { 0: '.', 2: '!', 3: 'c', 4: 'B', 5: 'b', 6: 's', 7: 'S', 8: 'w', 9: 'o', 10: 'o', 11: '~', 12: 'L', 20: ':', 21: 'j', 22: '#' };
    const WALK_LEGEND = '. walkable, # blocking, : throw-through (blocks walking; thrown things pass over), ~ water, w shallow water, s swamp, S lava swamp, L lava, ! hurt, c chair, B/b bed, j jumping, o hole, N blocking NPC';

    mcp.tool({
        name: 'level_get_walkability',
        title: 'Map what can be walked on',
        description: 'A character map of a region showing where a player can walk: one character per tile (' + WALK_LEGEND + '). Use it to find the gap in a wall, the walkable tile in front of a door, or whether a path is open, before placing links and NPCs. Tile objects such as houses block on most of their footprint, including the door tiles themselves: put a door\'s link on the first walkable row in front of it.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Left tile column', { default: 0, minimum: 0 }),
            y: S.integer('Top tile row', { default: 0, minimum: 0 }),
            width: S.integer('Columns; defaults to the rest of the level', { minimum: 1 }),
            height: S.integer('Rows; defaults to the rest of the level', { minimum: 1 }),
        },
        readOnly: true,
    }, async ({ level, x, y, width, height }) => {
        const t = await open(level);
        const le = t.le;
        width = width ?? t.width - x;
        height = height ?? t.height - y;
        checkRegion(t, x, y, width, height);
        if (width * height > 128 * 128) fail(`That is ${width}x${height} tiles; ask for at most 128x128 at a time.`);
        const tw = t.level.tileWidth || 16;
        const blockers = new Set();
        for (const obj of t.level.objects) {
            if (obj.type !== 'npc' || !inTarget(t, obj)) continue;
            const shape = /setshape2?\b/i.test(obj.properties?.code || ''), image = obj.properties?.image;
            if (!shape && !image) continue;
            const w = Math.max(1, Math.round((obj._imgW || 32) / tw)), hgt = Math.max(1, Math.round((obj._imgH || 32) / tw));
            for (let dy = 0; dy < hgt; dy++) for (let dx = 0; dx < w; dx++) blockers.add(`${Math.floor(obj.x) + dx},${Math.floor(obj.y) + dy}`);
        }
        const rows = [];
        for (let row = 0; row < height; row++) {
            let line = '';
            for (let column = 0; column < width; column++) {
                const tx = t.ox + x + column, ty = t.oy + y + row;
                const type = le._getTileType(tx * tw + tw / 2, ty * tw + tw / 2);
                line += blockers.has(`${tx},${ty}`) && type !== 22 && type !== 20 ? 'N' : (WALK_CHARS[type] || '?');
            }
            rows.push(line);
        }
        return { level: label(t), x, y, width, height, legend: WALK_LEGEND, note: 'Row 0 of `rows` is tile row y; character 0 of each row is tile column x. A player takes up 2x2 tiles, so it needs a 2x2 walkable block to stand in and passages 2 tiles wide.', rows };
    });

    // ---- Layers and tilesets -------------------------------------------------------------

    mcp.tool({
        name: 'level_set_layers',
        title: 'Add, remove or hide layers',
        description: 'Manage the layers of a .nw level: add a layer on top, remove one of the upper layers, move a layer to another position in the stack (objects keep the layer number they had), or show/hide a layer in the editor. Layer 0 is the ground and cannot be removed; tiles on higher layers draw over it. Painting tools create layers on demand, so this is mostly for removing and hiding. Adding or removing a layer cannot be undone, and removing one clears the level\'s undo history.',
        input: {
            level: LEVEL_ARG,
            action: S.enum(['add', 'remove', 'show', 'hide', 'move'], 'What to do'),
            layer: S.integer('Layer to remove, show, hide or move', { minimum: 0 }),
            to: S.integer('For move: the position the layer ends up at; the layers in between shift by one', { minimum: 0 }),
        },
        required: ['action'],
    }, async ({ level, action, layer, to }) => {
        const t = await open(level);
        const le = t.le, layers = t.level.layers;
        let warning;
        if (action === 'add') {
            layerFor(t, layers.length);
        } else {
            if (layer === undefined || layer >= layers.length) fail(`Give a layer from 0 to ${layers.length - 1}.`);
            if (action === 'move') {
                if (t.level._sourceFormat) fail(`${label(t)} is a .${t.level._sourceFormat} level, which has a single layer.`);
                if (to === undefined || to >= layers.length || to === layer) fail(`Give to: a position from 0 to ${layers.length - 1} other than ${layer}.`);
                if ((layer === 0 || to === 0) && t.entry.terrain) fail('In a gmap with heightmap terrain the ground layer is drawn by the terrain and cannot be moved.');
                // A snapshot holds the tiles by position, not which layer was where.
                le._keepUndoForLevel();
                le.undoStack.length = 0;
                le.redoStack.length = 0;
                le.moveLayer(layer, to);
                if (layer === 0 || to === 0) warning = 'The ground layer changed. Empty tiles on layer 0 are drawn and saved as tile 0, so holes in the layer that is now the ground become solid.';
            } else if (action === 'remove') {
                if (t.entry.gmapGrid) fail('A gmap always has three layers.');
                if (layer === 0) fail('Layer 0 is the ground and cannot be removed. To clear it, fill it with level_fill_rect.');
                // Snapshots taken with the old layers cannot be restored any more.
                le._keepUndoForLevel();
                le.undoStack.length = 0;
                le.redoStack.length = 0;
                le.deleteLayer(layer);
            } else {
                layers[layer].visible = action === 'show';
                le.refreshLayerPanel();
                le.updateUI();
            }
        }
        if (action === 'show' || action === 'hide') redraw(le); else commit(t);
        return { level: label(t), layers: layers.map((entry, index) => ({ layer: index, visible: entry.visible !== false })), warning };
    });

    mcp.tool({
        name: 'level_set_tileset',
        title: 'Change the tileset',
        description: 'Set which tileset image a level (or a whole gmap) draws its tiles from, and the collision table used with it. Bundled tilesets: pics1.png (classic, default), picso.png (terrain gmaps), picso2-sky.png, zlttp_tiles_lightworld_day.png. Any tileset image in the workspace folder also works.',
        input: {
            level: LEVEL_ARG,
            tileset: S.string('Tileset image name, e.g. "pics1.png"'),
            tileset_type: S.integer('Collision table: 0 for classic tilesets, 1 for the newer layout, 5 for terrain tilesets', { minimum: 0, maximum: 5 }),
        },
        required: ['tileset'],
    }, async ({ level, tileset, tileset_type }) => {
        const t = await open(level);
        const image = await loadTileset(t.le, tileset);
        if (!image) fail(`Tileset image "${tileset}" was not found among the bundled tilesets or in the workspace folder.`);
        t.level.tilesetName = tileset;
        t.level.tilesetImage = image;
        t.level._mcpTileset = tileset;
        if (tileset_type !== undefined) t.level.tilesetType = tileset_type;
        t.le.updateTilesetDisplay();
        t.le.updateUI();
        commit(t);
        return { level: t.entry.name, tileset, tileset_type: t.level.tilesetType || 0, image_size: `${image.width}x${image.height}` };
    });

    const BUNDLED_TILESETS = ['pics1.png', 'picso.png', 'picso2-sky.png', 'zlttp_tiles_lightworld_day.png'];
    const TILESET_CACHE_KEY = 'levelEditor_tilesetCache';

    function tilesetCombo(le) {
        return le.$('tilesetsCombo') || fail('The tileset list is not available.');
    }

    function refreshTilesetList(le) {
        window.refreshCustomDropdown?.(tilesetCombo(le));
        le._refreshTilesetOrderList?.();
    }

    function storeTilesetCache(le) {
        try { localStorage.setItem(TILESET_CACHE_KEY, JSON.stringify(le._tilesetDataCache || {})); return true; } catch (error) { return false; }
    }

    mcp.tool({
        name: 'level_list_tilesets',
        title: 'List the tilesets',
        description: 'The tilesets in the level editor\'s tileset list: the ones that ship with the app, and the custom ones a person or level_add_tileset loaded and the editor remembers. Says which open levels use each. (level_set_tileset also takes any image found in the workspace folder, listed or not.)',
        readOnly: true,
    }, async () => {
        const le = await editor();
        const users = name => levelEntries(le).filter(item => (item.entry.level.tilesetName || 'pics1.png').toLowerCase() === name.toLowerCase()).map(item => item.entry.name);
        return {
            tilesets: [...tilesetCombo(le).options].map(option => option.value).map(name => ({
                name, kind: BUNDLED_TILESETS.includes(name) ? 'bundled' : le._tilesetDataCache?.[name] ? 'custom' : 'listed', used_by: users(name),
            })),
        };
    });

    mcp.tool({
        name: 'level_add_tileset',
        title: 'Load a tileset image into the list',
        description: 'Load a tileset image file into the level editor\'s tileset list, as the Load Tileset button does: the editor remembers the image under its file name, so levels can use it without the file being in the workspace folder. With use, the level also switches to it. (For a project, keeping tilesets in the workspace folder and using level_set_tileset is simpler and travels with the files.)',
        input: {
            path: S.string('Absolute path of the image file (.png or .gif)'),
            use: S.boolean('Also make it the tileset of a level', { default: false }),
            level: LEVEL_ARG,
        },
        required: ['path'],
        openWorld: true,
    }, async ({ path: target, use, level }) => {
        const le = await editor();
        h.requireAbsolute(target, 'path');
        const name = h.path.base(target), ext = h.path.ext(target);
        if (!['png', 'gif'].includes(ext)) fail(`A tileset is a .png or .gif image, got "${name}".`);
        // The name is written into the level file after TILESET, where a space would end it.
        if (!/^[\w.\-]+$/.test(name)) fail(`"${name}" cannot be used as a tileset name: use letters, digits, dots, dashes and underscores, without spaces. Rename the file.`);
        if (BUNDLED_TILESETS.includes(name.toLowerCase())) fail(`"${name}" is the name of a tileset that ships with the app. Rename the file.`);
        const info = await h.files.stat(target);
        if (!info.exists || info.isDir) fail(`No such file: ${target}`);
        // The level to switch is found before anything is added to the list.
        const t = use ? await open(level) : null;
        const url = `data:image/${ext};base64,${h.bytesToBase64(await h.files.readBytes(target))}`;
        const image = await loadImage(url);
        if (!image) fail(`${name} could not be read as an image.`);
        le._tilesetDataCache = le._tilesetDataCache || {};
        le._tilesetDataCache[name] = url;
        const persisted = storeTilesetCache(le);
        const combo = tilesetCombo(le);
        if (![...combo.options].some(option => option.value === name)) combo.add(new Option(name, name));
        refreshTilesetList(le);
        tilesetImages.set(name.toLowerCase(), image);
        const result = { name, image_size: `${image.width}x${image.height}`, remembered: persisted || 'only until the app closes: the image is too large for the editor\'s storage. Keep the file in the workspace folder instead.' };
        if (t) {
            t.level.tilesetName = name;
            t.level.tilesetImage = image;
            t.level._mcpTileset = name;
            combo.value = name;
            refreshTilesetList(le);
            t.le.updateTilesetDisplay();
            t.le.updateUI();
            commit(t);
            result.used_by = t.entry.name;
        }
        return result;
    });

    mcp.tool({
        name: 'level_remove_tileset',
        title: 'Remove a custom tileset from the list',
        description: 'Forget a custom tileset: take it out of the level editor\'s tileset list and out of the images the editor remembers. No file on disk is touched, and the tilesets that ship with the app stay. A tileset that an open level uses cannot be removed until that level uses another (level_set_tileset).',
        input: { name: S.string('Name of the tileset, as in level_list_tilesets') },
        required: ['name'],
        destructive: true,
    }, async ({ name }) => {
        const le = await editor();
        const combo = tilesetCombo(le);
        const option = [...combo.options].find(item => item.value.toLowerCase() === name.toLowerCase()) || fail(`There is no tileset "${name}" in the list. level_list_tilesets shows them.`);
        name = option.value;
        if (BUNDLED_TILESETS.includes(name)) fail(`${name} ships with the app and cannot be removed.`);
        const users = levelEntries(le).filter(item => (item.entry.level.tilesetName || '').toLowerCase() === name.toLowerCase()).map(item => item.entry.name);
        if (users.length) fail(`${name} is used by ${users.join(', ')}. Give ${users.length === 1 ? 'that level' : 'those levels'} another tileset first (level_set_tileset).`);
        if (le._tilesetDataCache) delete le._tilesetDataCache[name];
        const stored = storeTilesetCache(le);
        option.remove();
        refreshTilesetList(le);
        tilesetImages.delete(name.toLowerCase());
        return { removed: name, note: stored ? undefined : 'It is gone from the list, but the change could not be stored and it may be back when the app is started again.' };
    });

    // ---- Tile definitions ----------------------------------------------------------------

    // Whether any tile definition applies to the level: one the editor manages, or one in an NPC script.
    function tiledefsApply(le, level) {
        if ((level._tiledefs || []).some(entry => entry.visible !== false)) return true;
        const entry = le.levels.find(item => item.level === level);
        return !!entry && scriptTiledefs({ entry, level }).some(item => item.applies);
    }

    // Applies the level's tile definitions and waits for the image the editor builds from them.
    // The editor makes a definition that replaces the tileset the level's tileset; the level's
    // own one is remembered, so that it comes back when no such definition is left.
    async function applyTiledefs(t) {
        const level = t.level, le = t.le;
        const own = level._ownTileset ?? (level.tilesetName || 'pics1.png');
        level._applyingTiledefs = true;
        try {
            // The editor builds on the level's current image, so it starts from the level's own tileset.
            level.tilesetName = own;
            level._mcpTileset = null;
            delete level._tiledefImage;
            const missing = await ensureTileset(le, level);
            if (!tiledefsApply(le, level)) {
                delete level._ownTileset;
                le.updateTilesetDisplay();
                return { applied: false, warning: missing || undefined };
            }
            level._ownTileset = own;
            const before = level.tilesetImage;
            le.applyTiledefFromNPCs();
            const deadline = Date.now() + 3000;
            while (level.tilesetImage === before && Date.now() < deadline) await h.sleep(25);
            const applied = level.tilesetImage !== before;
            if (applied) {
                level._mcpTileset = level.tilesetName;
                level._tiledefImage = level.tilesetImage;
            }
            return { applied, warning: applied ? undefined : 'The image of a tile definition did not load: check that it exists in the workspace folder (workspace_find_files).' };
        } finally {
            delete level._applyingTiledefs;
        }
    }

    const tiledefResult = outcome => ({ tiledefs_applied: outcome.applied, tiledef_warning: outcome.warning });

    const describeTiledef = (entry, index) => ({ index, image: entry.img, prefix: entry.levelstart || '', kind: Number(entry.type) === 2 ? 'overlay' : 'tileset', x: entry.x || 0, y: entry.y || 0, visible: entry.visible !== false });

    function scriptTiledefs(t) {
        const levelName = t.entry.name.toLowerCase().replace(/\.nw$/i, '');
        const matches = prefix => ['this.level', 'this.level.name', 'this.gmap', 'this.gmap.name'].includes(prefix) || levelName.startsWith(prefix);
        const out = [];
        for (const obj of t.level.objects) {
            if (obj.type !== 'npc') continue;
            const parsed = parseNPCScript(obj.properties?.code || '');
            for (const entry of parsed.tiledefs || []) {
                const prefix = entry.levelstart.toLowerCase().replace(/\.nw$/i, '');
                out.push({ npc: obj.id, image: entry.img, prefix: entry.levelstart, kind: 'tileset', applies: matches(prefix) });
            }
            for (const entry of parsed.tiledefs2 || []) {
                const prefix = entry.levelstart.toLowerCase().replace(/\.nw$/i, '');
                out.push({ npc: obj.id, image: entry.img, prefix: entry.levelstart, kind: 'overlay', x: entry.x, y: entry.y, applies: !prefix || matches(prefix) });
            }
        }
        return out;
    }

    mcp.tool({
        name: 'level_get_tiledefs',
        title: 'List tile definitions',
        description: 'The tile definitions of a level: images that replace the tileset or are laid over part of it for this level. There are two kinds. "managed" ones are kept by the editor (its Tile Definitions dialog; level_set_tiledefs changes them) and exist in the editor only, not in the saved level. "from_scripts" ones come from addtiledef / addtiledef2 lines in the level\'s NPC scripts, are part of the level file, and are what a game server uses.',
        input: { level: LEVEL_ARG },
        readOnly: true,
    }, async ({ level }) => {
        const t = resolve(await editor(), level);
        return { level: label(t), tileset: t.level.tilesetName || 'pics1.png', managed: (t.level._tiledefs || []).map(describeTiledef), from_scripts: scriptTiledefs(t) };
    });

    mcp.tool({
        name: 'level_set_tiledefs',
        title: 'Change the managed tile definitions',
        description: 'Change the tile definitions the editor manages for a level (its Tile Definitions dialog): add one, change one, delete one, or replace or clear the whole list. A definition of kind "overlay" draws its image over the tileset at pixel position x, y; the list of definitions is kept in the editor only, not in the level file. A definition of kind "tileset" makes its image the level\'s tileset while it is in the list, which is saved with the level like any tileset. To make a definition part of the level, as a game server needs, put an addtiledef("image.png", "levelprefix", 0); or addtiledef2("image.png", "levelprefix", x, y); line in an NPC script instead (level_add_npc), which the editor applies the same way.',
        input: {
            level: LEVEL_ARG,
            action: S.enum(['add', 'update', 'delete', 'replace', 'clear'], 'What to do'),
            index: S.integer('For update and delete: which definition, as numbered by level_get_tiledefs', { minimum: 0 }),
            image: S.string('Image file name, found in the workspace folder or among the app\'s images'),
            kind: S.enum(['tileset', 'overlay'], 'Replace the tileset, or draw over part of it'),
            prefix: S.string('The level-name prefix column of the dialog (kept for reference; managed definitions always apply)'),
            x: S.integer('Overlay: pixels from the left of the tileset', { minimum: 0 }),
            y: S.integer('Overlay: pixels from the top of the tileset', { minimum: 0 }),
            visible: S.boolean('Whether the definition is applied'),
            tiledefs: S.array(S.object({
                image: S.string('Image file name'),
                kind: S.enum(['tileset', 'overlay'], 'Replace the tileset, or draw over part of it', { default: 'tileset' }),
                prefix: S.string('Level-name prefix'),
                x: S.integer('Overlay: pixels from the left', { minimum: 0 }),
                y: S.integer('Overlay: pixels from the top', { minimum: 0 }),
                visible: S.boolean('Whether it is applied', { default: true }),
            }, ['image']), 'For replace: the whole new list'),
        },
        required: ['action'],
    }, async ({ level, action, index, image, kind, prefix, x, y, visible, tiledefs }) => {
        const t = await open(level);
        const list = t.level._tiledefs = t.level._tiledefs || [];
        const build = (from, base = {}) => ({
            img: (from.image ?? base.img ?? '').trim(),
            levelstart: from.prefix ?? base.levelstart ?? '',
            type: (from.kind ?? (Number(base.type) === 2 ? 'overlay' : 'tileset')) === 'overlay' ? 2 : 0,
            x: from.x ?? base.x ?? 0,
            y: from.y ?? base.y ?? 0,
            visible: from.visible ?? base.visible ?? true,
        });
        if (action === 'add') {
            if (!image || !image.trim()) fail('Give the image of the definition to add.');
            list.push(build({ image, kind, prefix, x, y, visible }));
        } else if (action === 'update' || action === 'delete') {
            if (index === undefined || index >= list.length) fail(list.length ? `Give index from 0 to ${list.length - 1} (level_get_tiledefs lists them).` : `${label(t)} has no managed tile definitions.`);
            if (action === 'delete') list.splice(index, 1);
            else {
                const next = build({ image, kind, prefix, x, y, visible }, list[index]);
                if (!next.img) fail('The image must not be empty.');
                list[index] = next;
            }
        } else if (action === 'replace') {
            if (!tiledefs) fail('Give tiledefs: the new list.');
            if (tiledefs.some(entry => !entry.image.trim())) fail('Every definition needs an image.');
            list.splice(0, list.length, ...tiledefs.map(entry => build(entry)));
        } else list.length = 0;
        const tilesetBefore = t.level.tilesetName || 'pics1.png';
        const { warning } = await applyTiledefs(t);
        // A definition that replaces the tileset changes what the level file says, so the level counts as changed.
        if ((t.level.tilesetName || 'pics1.png') !== tilesetBefore) commit(t);
        else { t.le.saveSessionDebounced(); redraw(t.le); }
        return { level: label(t), tileset: t.level.tilesetName || 'pics1.png', managed: list.map(describeTiledef), kept_in: 'the editor only; the list is not written to the level file', warning };
    });

    mcp.tool({
        name: 'level_view_tileset',
        title: 'Look at the tileset',
        description: 'Render part of a level\'s tileset image with a labelled grid, so you can pick tiles by sight: tile index = row * columns + column, where columns is how many tiles wide the tileset image is (128 for the classic tilesets, 64 for the terrain ones; the result states it). The classic tileset is 128 columns by 32 rows; view it in pieces (default 32x32 tiles) to keep tiles large enough to recognise.',
        input: {
            level: LEVEL_ARG,
            column: S.integer('First tileset column to show', { default: 0, minimum: 0, maximum: 127 }),
            row: S.integer('First tileset row to show', { default: 0, minimum: 0 }),
            columns: S.integer('How many columns', { default: 32, minimum: 1, maximum: 128 }),
            rows: S.integer('How many rows', { default: 32, minimum: 1, maximum: 64 }),
            scale: S.integer('Pixels per tile pixel (2 doubles each tile to 32px)', { default: 2, minimum: 1, maximum: 4 }),
        },
        readOnly: true,
    }, async ({ level, column, row, columns, rows, scale }) => {
        const le = await editor();
        let image, name;
        if (levelEntries(le).length) {
            const t = resolve(le, level);
            await ensureTileset(le, t.level);
            image = t.level.tilesetImage;
            name = t.level.tilesetName;
        } else {
            image = await loadTileset(le, 'pics1.png');
            name = 'pics1.png';
        }
        const totalColumns = Math.floor(image.width / 16), totalRows = Math.floor(image.height / 16);
        columns = Math.min(columns, totalColumns - column);
        rows = Math.min(rows, totalRows - row);
        if (columns < 1 || rows < 1) fail(`${name} has ${totalColumns} columns and ${totalRows} rows of tiles.`);
        const tile = 16 * scale;
        const canvas = document.createElement('canvas');
        canvas.width = columns * tile;
        canvas.height = rows * tile;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, column * 16, row * 16, columns * 16, rows * 16, 0, 0, canvas.width, canvas.height);
        const framed = withGrid(canvas, { x: column, y: row, width: columns, height: rows, pixelsPerTile: tile, step: columns > 48 || rows > 48 ? 8 : columns > 16 || rows > 16 ? 4 : 1 });
        return mcp.result({ tileset: name, columns: totalColumns, rows: totalRows, showing: { column, row, columns, rows }, tile_index: `row * ${totalColumns} + column`, pixels_per_tile: tile }, h.imagePart(framed));
    });

    // ---- Objects ---------------------------------------------------------------------------

    function describeObject(t, obj, withScript) {
        const p = obj.properties || {};
        const out = { id: obj.id, type: obj.type, x: obj.x - t.ox, y: obj.y - t.oy };
        if (obj.type === 'npc') {
            out.image = p.image || '';
            const code = p.code || '';
            if (withScript) out.script = code;
            else { out.script_lines = code ? code.split('\n').length : 0; out.script_preview = code.split('\n').find(line => line.trim()) || ''; }
        } else if (obj.type === 'link') {
            Object.assign(out, { width: p.width || 1, height: p.height || 1, target_level: p.nextLevel || '', target_x: String(p.nextX ?? '0'), target_y: String(p.nextY ?? '0') });
        } else if (obj.type === 'sign') {
            out.text = p.text || '';
        } else if (obj.type === 'chest') {
            Object.assign(out, { item: p.itemName || 'greenrupee', sign_index: p.signIndex || 0 });
        } else if (obj.type === 'baddy') {
            Object.assign(out, { baddy_type: p.baddyType || 0, verses: p.verses || ['', '', ''] });
        }
        if (p.layerIndex) out.layer = p.layerIndex;
        if (obj.type === 'link' && p.nextLayer) out.target_layer = p.nextLayer;
        return out;
    }

    function findObject(t, id) {
        const obj = t.level.objects.find(obj => obj.id === id) || fail(`No object with id "${id}" in ${t.entry.name}. Call level_list_objects for the ids.`);
        if (t.member && !inTarget(t, obj)) {
            const home = members(t.entry).find(m => obj.x >= m.cellX * LEVEL_SIZE && obj.x < (m.cellX + 1) * LEVEL_SIZE && obj.y >= m.cellY * LEVEL_SIZE && obj.y < (m.cellY + 1) * LEVEL_SIZE);
            fail(`Object "${id}" is not in ${label(t)}${home ? `; it is in ${home.name}` : ''}. Pass that level, or the gmap, as level.`);
        }
        return obj;
    }

    // Drops what the editor cached from an NPC's old script and image.
    function resetNPC(obj) {
        for (const key of ['_ganiOX', '_ganiOY', '_imgW', '_imgH', '_shapeCache', '_imgpart', '_stretchx', '_stretchy', '_tightBounds', '_xOff', '_yOff']) delete obj[key];
    }

    function checkPosition(t, x, y) {
        if (x < 0 || y < 0 || x >= t.width || y >= t.height) fail(`Position ${x},${y} is outside ${label(t)}, which is ${t.width}x${t.height} tiles.`);
    }

    const OBJECT_LAYER = S.integer('Layer the object is on, as written in the .nw file (0 is the ground layer, the usual one). The editor keeps and saves it; .graal and .zelda files cannot hold it.', { default: 0, minimum: 0, maximum: MAX_LAYERS - 1 });

    function addObject(t, type, x, y, properties) {
        checkPosition(t, x, y);
        if ((properties.layerIndex || properties.nextLayer) && t.level._sourceFormat) fail(`${label(t)} is a .${t.level._sourceFormat} level, which cannot store an object's layer. Leave layer at 0, or use a .nw level.`);
        if (t.level._sourceFormat === 'zelda' && (type === 'npc' || type === 'chest')) fail('.zelda levels cannot hold NPCs or chests. Use a .nw level.');
        t.le.pushUndo();
        const obj = new LevelObject(t.ox + x, t.oy + y, type);
        obj.properties = properties;
        t.level.addObject(obj);
        commit(t, true);
        return describeObject(t, obj, false);
    }

    mcp.tool({
        name: 'level_list_objects',
        title: 'List objects in a level',
        description: 'List the NPCs, links, signs, chests and baddies in a level with their ids, positions and properties. NPC scripts are summarised unless include_scripts is true.',
        input: {
            level: LEVEL_ARG,
            type: S.enum(['npc', 'link', 'sign', 'chest', 'baddy'], 'Only list this type'),
            include_scripts: S.boolean('Include full NPC scripts', { default: false }),
        },
        readOnly: true,
    }, async ({ level, type, include_scripts }) => {
        const t = resolve(await editor(), level);
        const objects = t.level.objects.filter(obj => inTarget(t, obj) && (!type || obj.type === type)).map(obj => describeObject(t, obj, include_scripts));
        return { level: label(t), count: objects.length, objects };
    });

    mcp.tool({
        name: 'level_get_object',
        title: 'Get one object',
        description: 'Full details of one object, including an NPC\'s complete script.',
        input: { level: LEVEL_ARG, id: S.string('Object id from level_list_objects') },
        required: ['id'],
        readOnly: true,
    }, async ({ level, id }) => {
        const t = resolve(await editor(), level);
        return describeObject(t, findObject(t, id), true);
    });

    mcp.tool({
        name: 'level_add_npc',
        title: 'Add an NPC',
        description: 'Add an NPC (a scripted object) to a level. Give its image and GraalScript, or start from a template in the NPC library (npc_library_list). x and y are in tiles and may be fractional (0.5 steps). The guide "gscript" covers the script language.',
        input: {
            level: LEVEL_ARG,
            x: S.number('Tile column', { minimum: 0 }),
            y: S.number('Tile row', { minimum: 0 }),
            image: S.string('Image file shown for the NPC, e.g. "door.png". Empty for an invisible or showcharacter NPC.'),
            script: S.string('GraalScript source (GS1 or GS2)'),
            template: S.string('An NPC to start from: the name of a shipped template, e.g. "Door" or "Character" (npc_library_list), or the absolute path of a .npc file; image and script override its values'),
            layer: OBJECT_LAYER,
        },
        required: ['x', 'y'],
    }, async ({ level, x, y, image, script, template, layer }) => {
        const t = await open(level);
        let base = { image: '', code: '' };
        if (template) base = await npcTemplate(template);
        const added = addObject(t, 'npc', x, y, { image: image ?? base.image, code: (script ?? base.code).replace(/\r\n/g, '\n').replace(/\n+$/, ''), layerIndex: layer });
        if (/addtiledef/i.test(script ?? base.code)) Object.assign(added, tiledefResult(await applyTiledefs(t)));
        return added;
    });

    mcp.tool({
        name: 'level_add_link',
        title: 'Add a link (warp)',
        description: 'Add a link: a rectangle that warps the player to another level when touched. target_level is a level file name; to arrive in a gmap, name the member level and give coordinates inside that level (0-63), as the game expects. target_x / target_y are the position the player is given. On the ground a player takes up a 2x2 block of tiles that starts half a tile right of and one tile below its position, so to arrive on the block whose top-left tile is (c, r) use target (c - 0.5, r - 1), and make sure that block is walkable and not on the link itself (level_get_walkability). The keywords "playerx" and "playery" keep that coordinate, which is how edge links between neighbouring levels work. A link must lie on tiles the player can reach: for a door, the walkable row just in front of it, 2 tiles wide.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Left tile column of the link area', { minimum: 0 }),
            y: S.integer('Top tile row of the link area', { minimum: 0 }),
            width: S.integer('Width in tiles', { default: 2, minimum: 1, maximum: 64 }),
            height: S.integer('Height in tiles', { default: 1, minimum: 1, maximum: 64 }),
            target_level: S.string('File name of the level to warp to, e.g. "house1.nw"'),
            target_x: S.string('Destination tile column, or "playerx"', { default: '30' }),
            target_y: S.string('Destination tile row, or "playery"', { default: '30' }),
            layer: OBJECT_LAYER,
            target_layer: S.integer('Layer the player arrives on in the target level (0 unless the target uses layers for height)', { default: 0, minimum: 0, maximum: MAX_LAYERS - 1 }),
        },
        required: ['x', 'y', 'target_level'],
    }, async ({ level, x, y, width, height, target_level, target_x, target_y, layer, target_layer }) => {
        const t = await open(level);
        checkRegion(t, x, y, width, height);
        checkLinkTarget(target_level, target_x, target_y);
        return addObject(t, 'link', x, y, { nextLevel: target_level, width, height, nextX: String(target_x), nextY: String(target_y), nextLayer: target_layer, layerIndex: layer });
    });

    mcp.tool({
        name: 'level_add_sign',
        title: 'Add a sign',
        description: 'Add sign text at a tile: the player reads it by touching that tile from below. Place it on a sign tile (the "Sign" tile object is 2x2; put the sign text at its top-left tile). Lines are separated by newlines.',
        input: { level: LEVEL_ARG, x: S.integer('Tile column', { minimum: 0 }), y: S.integer('Tile row', { minimum: 0 }), text: S.string('The sign text'), layer: OBJECT_LAYER },
        required: ['x', 'y', 'text'],
    }, async ({ level, x, y, text, layer }) => {
        if (!text.trim()) fail('The sign text is empty.');
        return addObject(await open(level), 'sign', x, y, { text: text.replace(/\r\n/g, '\n'), layerIndex: layer });
    });

    function checkLinkTarget(targetLevel, targetX, targetY) {
        if (targetLevel !== undefined) {
            if (!targetLevel.trim()) fail('target_level is empty.');
            if (/\.gmap$/i.test(targetLevel)) fail(`A link targets a level, not a gmap: name the member level of ${targetLevel} to arrive in, with coordinates inside that level (0-63).`);
        }
        for (const [name, value, keyword] of [['target_x', targetX, 'playerx'], ['target_y', targetY, 'playery']]) {
            if (value === undefined || value.trim().toLowerCase() === keyword) continue;
            if (!/^-?\d+(\.\d+)?$/.test(value.trim())) fail(`${name} must be a number or "${keyword}", got "${value}".`);
            if (Number(value) < -1 || Number(value) > LEVEL_SIZE - 1) fail(`${name} is ${value}, outside a level (0-${LEVEL_SIZE - 1}). A target inside a gmap is given in the member level's own coordinates.`);
        }
    }

    mcp.tool({
        name: 'level_add_chest',
        title: 'Add a chest',
        description: 'Add a treasure chest holding an item. sign_index is the number of the sign (0-based, in level_list_objects order) shown when it is opened.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Tile column', { minimum: 0 }),
            y: S.integer('Tile row', { minimum: 0 }),
            item: S.string('Item inside the chest: greenrupee, bluerupee, redrupee, goldrupee, heart, fullheart, bombs, darts, bomb, superbomb, joltbomb, bow, sword, shield, glove1, glove2, battleaxe, goldensword, mirrorshield, lizardshield, lizardsword, fireball, fireblast, nukeshot, spinattack', { default: 'greenrupee' }),
            sign_index: S.integer('Index of the sign shown on opening', { default: 0, minimum: 0 }),
            layer: OBJECT_LAYER,
        },
        required: ['x', 'y'],
    }, async ({ level, x, y, item, sign_index, layer }) => {
        const t = await open(level);
        checkChestItem(item);
        return addObject(t, 'chest', x, y, { itemName: item, signIndex: sign_index, layerIndex: layer });
    });

    function checkChestItem(item) {
        if (!CHEST_ITEMS.includes(item)) fail(`Unknown chest item "${item}". Items: ${CHEST_ITEMS.join(', ')}.`);
    }

    mcp.tool({
        name: 'level_add_baddy',
        title: 'Add a baddy',
        description: 'Add a classic built-in enemy. baddy_type 0-9 selects the kind (0 grey soldier, 1 blue soldier, 2 red soldier, 3 shooting soldier, 4 swamp soldier, 5 frog, 6 octopus, 7 golden warrior, 8 lizardon, 9 dragon). verses are what it says when it attacks, is hurt, and hurts the player.',
        input: {
            level: LEVEL_ARG,
            x: S.integer('Tile column', { minimum: 0 }),
            y: S.integer('Tile row', { minimum: 0 }),
            baddy_type: S.integer('Kind of baddy', { default: 0, minimum: 0, maximum: 9 }),
            verses: S.array(S.string(), 'Up to three lines: attacking, hurt, hurting the player'),
            layer: OBJECT_LAYER,
        },
        required: ['x', 'y'],
    }, async ({ level, x, y, baddy_type, verses, layer }) => {
        if (verses && verses.length > 3) fail(`A baddy has three verses (attacking, hurt, hurting the player); got ${verses.length}.`);
        const lines = [0, 1, 2].map(index => (verses && verses[index]) || '');
        return addObject(await open(level), 'baddy', x, y, { baddyType: baddy_type, verses: lines, layerIndex: layer });
    });

    mcp.tool({
        name: 'level_update_object',
        title: 'Change an object',
        description: 'Move an object or change its properties. Only the fields you give are changed. Fields per type: npc (image, script), link (width, height, target_level, target_x, target_y, target_layer), sign (text), chest (item, sign_index), baddy (baddy_type, verses); every type also has layer.',
        input: {
            level: LEVEL_ARG,
            id: S.string('Object id from level_list_objects'),
            x: S.number('New tile column', { minimum: 0 }),
            y: S.number('New tile row', { minimum: 0 }),
            image: S.string('NPC image'),
            script: S.string('NPC script (replaces the whole script)'),
            text: S.string('Sign text'),
            width: S.integer('Link width', { minimum: 1, maximum: 64 }),
            height: S.integer('Link height', { minimum: 1, maximum: 64 }),
            target_level: S.string('Link target level'),
            target_x: S.string('Link target column'),
            target_y: S.string('Link target row'),
            item: S.string('Chest item'),
            sign_index: S.integer('Chest sign index', { minimum: 0 }),
            baddy_type: S.integer('Baddy kind', { minimum: 0, maximum: 9 }),
            verses: S.array(S.string(), 'Baddy verses'),
            layer: S.integer('Layer the object is on, as written in the .nw file', { minimum: 0, maximum: MAX_LAYERS - 1 }),
            target_layer: S.integer('Link: the layer the player arrives on', { minimum: 0, maximum: MAX_LAYERS - 1 }),
        },
        required: ['id'],
    }, async (args) => {
        const t = await open(args.level);
        const obj = findObject(t, args.id);
        const p = obj.properties = obj.properties || {};
        const allowed = [...({ npc: ['image', 'script'], link: ['width', 'height', 'target_level', 'target_x', 'target_y', 'target_layer'], sign: ['text'], chest: ['item', 'sign_index'], baddy: ['baddy_type', 'verses'] }[obj.type] || []), 'layer'];
        if ((args.layer || args.target_layer) && t.level._sourceFormat) fail(`${label(t)} is a .${t.level._sourceFormat} level, which cannot store an object's layer.`);
        const given = Object.keys(args).filter(key => !['level', 'id', 'x', 'y'].includes(key));
        const wrong = given.filter(key => !allowed.includes(key));
        if (wrong.length) fail(`A ${obj.type} has no ${wrong.join(', ')}. Its fields are: x, y, ${allowed.join(', ')}.`);
        if (args.item !== undefined) checkChestItem(args.item);
        if (!given.length && args.x === undefined && args.y === undefined) fail(`Nothing to change: give x, y or one of this ${obj.type}'s fields (${allowed.join(', ')}).`);
        if (obj.type === 'link') checkLinkTarget(args.target_level, args.target_x, args.target_y);
        if (args.text !== undefined && !args.text.trim()) fail('The sign text is empty; delete the sign with level_delete_objects instead.');
        if (args.verses && args.verses.length > 3) fail(`A baddy has three verses; got ${args.verses.length}.`);
        const x = args.x ?? obj.x - t.ox, y = args.y ?? obj.y - t.oy;
        checkPosition(t, x, y);
        t.le.pushUndo();
        const live = findObject(t, args.id);
        const q = live.properties;
        const codeBefore = q.code || '';
        live.x = t.ox + x;
        live.y = t.oy + y;
        if (args.image !== undefined) q.image = args.image;
        if (args.script !== undefined) q.code = args.script.replace(/\r\n/g, '\n').replace(/\n+$/, '');
        if (args.text !== undefined) q.text = args.text.replace(/\r\n/g, '\n');
        if (args.width !== undefined) q.width = args.width;
        if (args.height !== undefined) q.height = args.height;
        if (args.target_level !== undefined) q.nextLevel = args.target_level;
        if (args.target_x !== undefined) q.nextX = args.target_x;
        if (args.target_y !== undefined) q.nextY = args.target_y;
        if (args.item !== undefined) q.itemName = args.item;
        if (args.sign_index !== undefined) q.signIndex = args.sign_index;
        if (args.baddy_type !== undefined) q.baddyType = args.baddy_type;
        if (args.verses !== undefined) q.verses = [0, 1, 2].map(index => args.verses[index] || '');
        if (args.layer !== undefined) q.layerIndex = args.layer;
        if (args.target_layer !== undefined) q.nextLayer = args.target_layer;
        if (live.type === 'npc') resetNPC(live);
        commit(t, true);
        const described = describeObject(t, live, false);
        // A script that gains, changes or loses a tile definition changes what the level is drawn with.
        if (live.type === 'npc' && (/addtiledef/i.test(q.code || '') || /addtiledef/i.test(codeBefore))) Object.assign(described, tiledefResult(await applyTiledefs(t)));
        return described;
    });

    mcp.tool({
        name: 'level_delete_objects',
        title: 'Delete objects',
        description: 'Delete objects from a level: by id, or every object of a type, optionally limited to a rectangle. Give at least one of ids, type or a region.',
        input: {
            level: LEVEL_ARG,
            ids: S.array(S.string(), 'Ids of the objects to delete'),
            type: S.enum(['npc', 'link', 'sign', 'chest', 'baddy'], 'Delete objects of this type'),
            x: S.integer('Left column of a rectangle to clear', { minimum: 0 }),
            y: S.integer('Top row of the rectangle', { minimum: 0 }),
            width: S.integer('Width of the rectangle', { minimum: 1 }),
            height: S.integer('Height of the rectangle', { minimum: 1 }),
        },
        destructive: true,
    }, async ({ level, ids, type, x, y, width, height }) => {
        const t = await open(level);
        const region = x !== undefined || y !== undefined || width !== undefined || height !== undefined;
        if (!ids && !type && !region) fail('Give ids, a type, or a region (x, y, width, height). To delete everything in a level, pass the region covering it.');
        if (region) {
            if ([x, y, width, height].some(value => value === undefined)) fail('A region needs x, y, width and height.');
            checkRegion(t, x, y, width, height);
        }
        if (ids) ids.forEach(id => findObject(t, id));
        const doomed = t.level.objects.filter(obj => inTarget(t, obj)
            && (!ids || ids.includes(obj.id))
            && (!type || obj.type === type)
            && (!region || (obj.x >= t.ox + x && obj.x < t.ox + x + width && obj.y >= t.oy + y && obj.y < t.oy + y + height)));
        if (!doomed.length) return { level: label(t), deleted: 0 };
        t.le.pushUndo();
        const ids_deleted = doomed.map(obj => obj.id);
        t.level.objects = t.level.objects.filter(obj => !ids_deleted.includes(obj.id));
        commit(t, true);
        const result = { level: label(t), deleted: doomed.length, types: doomed.reduce((counts, obj) => { counts[obj.type] = (counts[obj.type] || 0) + 1; return counts; }, {}) };
        // An NPC that carried a tile definition takes it along.
        if (doomed.some(obj => obj.type === 'npc' && /addtiledef/i.test(obj.properties?.code || ''))) Object.assign(result, tiledefResult(await applyTiledefs(t)));
        return result;
    });

    let npcLibrary = null;
    // Reads a .npc file (NPC001: an IMAGE line and the script between SERVERCODE and SERVERCODEEND).
    function parseNpcFile(file, text) {
        if (!text.startsWith('NPC')) return null;
        const lines = text.replace(/\r\n/g, '\n').split('\n');
        const image = (lines.find(line => line.startsWith('IMAGE ')) || '').slice(6).trim();
        const start = lines.indexOf('SERVERCODE'), end = lines.indexOf('SERVERCODEEND');
        const code = start >= 0 ? lines.slice(start + 1, end > start ? end : undefined).join('\n').trim() : '';
        const comment = (/\/\/#COMMENTS (.*)/.exec(code) || [])[1] || '';
        return { name: h.path.base(file).replace(/\.npc$/i, ''), image, description: comment, code };
    }

    async function loadNPCLibrary() {
        if (npcLibrary) return npcLibrary;
        const names = await fetch('objects/index.json').then(response => response.json()).catch(() => []);
        const list = [];
        for (const file of Array.isArray(names) ? names : names.files || []) {
            const npc = parseNpcFile(file, await fetch('objects/' + file).then(response => response.ok ? response.text() : '').catch(() => ''));
            if (npc) list.push(npc);
        }
        // The level editor's own "Character" button places this one: a player-like figure drawn by showcharacter().
        if (typeof _CHARACTER_NPC_SCRIPT === 'string' && !list.some(item => item.name.toLowerCase() === 'character')) {
            list.push({ name: 'Character', image: '', description: 'A character that looks like a player (showcharacter), named Bob: change the nick, head, body and colours in its script', code: _CHARACTER_NPC_SCRIPT });
        }
        npcLibrary = list;
        return list;
    }

    // The .npc files of a folder on disk: a project's own library of objects.
    async function loadNPCFolder(folder) {
        h.requireAbsolute(folder, 'folder');
        const entries = await h.files.list(folder).catch(error => fail(`Could not read ${folder}: ${error.message || error}`));
        const list = [];
        for (const entry of entries) {
            if (entry.isDir || h.path.ext(entry.name) !== 'npc') continue;
            const npc = parseNpcFile(entry.name, await h.files.readText(entry.path));
            if (npc) list.push({ ...npc, path: h.path.normalize(entry.path) });
        }
        return list;
    }

    async function npcTemplate(name) {
        // A path names a .npc file on disk; anything else a template that ships with the app.
        if (h.path.isAbsolute(name)) {
            const info = await h.files.stat(name);
            if (!info.exists || info.isDir) fail(`No such .npc file: ${name}`);
            return parseNpcFile(name, await h.files.readText(name)) || fail(`${h.path.base(name)} is not a .npc file: it does not start with NPC001.`);
        }
        const list = await loadNPCLibrary();
        const found = list.find(item => item.name.toLowerCase() === String(name).toLowerCase());
        return found || fail(`No NPC template "${name}". Templates: ${list.map(item => item.name).join(', ') || 'none'}.`);
    }

    mcp.tool({
        name: 'npc_library_list',
        title: 'List NPC templates',
        description: 'The NPC templates that ship with GSuite (doors, lights, a talking person), each with its image and script; or, with folder, the .npc files of a folder on disk (a project\'s own object library, such as files written by level_export_npc). Use one with level_add_npc\'s `template` argument (a shipped template by name, a file by its path), or read the scripts as GraalScript examples.',
        input: {
            include_scripts: S.boolean('Include each template\'s script', { default: true }),
            folder: S.string('Absolute path of a folder of .npc files to list instead of the shipped templates'),
        },
        readOnly: true,
    }, async ({ include_scripts, folder }) => (folder ? await loadNPCFolder(folder) : await loadNPCLibrary()).map(item => ({ name: item.name, path: item.path, image: item.image, description: item.description, script: include_scripts ? item.code : undefined })));

    mcp.tool({
        name: 'level_export_npc',
        title: 'Save an NPC as a .npc file',
        description: 'Write one NPC of a level to a .npc file (its image and script), replacing a file already there, so it can be reused: level_add_npc takes the file\'s path as `template`, npc_library_list lists a folder of them, and the level editor loads such a folder as its object library.',
        input: {
            level: LEVEL_ARG,
            id: S.string('Object id of the NPC, from level_list_objects'),
            path: S.string('Absolute path of the .npc file to write'),
        },
        required: ['id', 'path'],
        destructive: true,
        idempotent: true,
        openWorld: true,
    }, async ({ level, id, path: target }) => {
        const t = resolve(await editor(), level);
        const obj = findObject(t, id);
        if (obj.type !== 'npc') fail(`Object ${id} is a ${obj.type}, not an NPC.`);
        h.requireAbsolute(target, 'path');
        if (h.path.ext(target) !== 'npc') fail(`path must end in .npc, got "${h.path.base(target)}".`);
        const image = obj.properties?.image || '', code = obj.properties?.code || '';
        // The layout the level editor's own "export NPC" writes.
        await h.files.write(target, `NPC001\n${image ? `IMAGE ${image}\n` : ''}SCRIPTINGLANGUAGE GScript\n\nSERVERCODE\n${code ? code + '\n' : ''}SERVERCODEEND\n`);
        return { saved: h.path.normalize(target), image, script_lines: code ? code.split('\n').length : 0 };
    });

    // ---- Screenshots -----------------------------------------------------------------------

    // Draws tile coordinates around an image so positions can be read off it.
    function withGrid(source, { x, y, width, height, pixelsPerTile, step, dividers, labelScale = 1 }) {
        const margin = labelScale > 1 ? 30 : 22;
        const canvas = document.createElement('canvas');
        canvas.width = source.width + margin;
        canvas.height = source.height + margin;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, margin, margin);
        ctx.font = '10px monospace';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 1;
        const firstColumn = Math.ceil(x / step) * step, firstRow = Math.ceil(y / step) * step;
        for (let column = firstColumn; column <= x + width; column += step) {
            const px = margin + Math.round((column - x) * pixelsPerTile) + 0.5;
            const major = dividers && column % dividers === 0;
            ctx.strokeStyle = major ? 'rgba(255,255,0,0.9)' : 'rgba(255,255,255,0.28)';
            ctx.beginPath(); ctx.moveTo(px, margin - 4); ctx.lineTo(px, canvas.height); ctx.stroke();
            if (column < x + width) { ctx.fillStyle = major ? '#ff0' : '#ddd'; ctx.textAlign = 'left'; ctx.fillText(String(column * labelScale), px + 2, margin / 2); }
        }
        for (let row = firstRow; row <= y + height; row += step) {
            const py = margin + Math.round((row - y) * pixelsPerTile) + 0.5;
            const major = dividers && row % dividers === 0;
            ctx.strokeStyle = major ? 'rgba(255,255,0,0.9)' : 'rgba(255,255,255,0.28)';
            ctx.beginPath(); ctx.moveTo(margin - 4, py); ctx.lineTo(canvas.width, py); ctx.stroke();
            if (row < y + height) { ctx.fillStyle = major ? '#ff0' : '#ddd'; ctx.textAlign = 'right'; ctx.fillText(String(row * labelScale), margin - 2, py + 7); }
        }
        return canvas;
    }
    mcp.helpers.withGrid = withGrid;

    // Renders part of the active level to a canvas of the given size, by pointing the
    // editor's own drawing code at a scratch canvas one level-sized chunk at a time.
    function renderRegion(le, region, pixelsPerTile, show) {
        const level = le.level, tw = level.tileWidth || 16;
        const output = document.createElement('canvas');
        output.width = Math.max(1, Math.round(region.width * pixelsPerTile));
        output.height = Math.max(1, Math.round(region.height * pixelsPerTile));
        const out = output.getContext('2d');
        const scale = pixelsPerTile / tw;
        out.imageSmoothingEnabled = scale < 1;
        out.imageSmoothingQuality = 'high';
        const chunkTiles = LEVEL_SIZE;
        const scratch = document.createElement('canvas');
        const saved = { ctx: le.ctx, canvas: le.canvas, panX: le.panX, panY: le.panY, zoom: le.zoom, selected: le.selectedObject, selectedSet: le.selectedObjects };
        const terrain = le._terrainForCurrentLevel();
        try {
            le.selectedObject = null;
            le.selectedObjects = new Set();
            le.zoom = 1;
            le._screenshotMode = true;
            le._ssOpts = show;
            for (let cy = region.y; cy < region.y + region.height; cy += chunkTiles) {
                for (let cx = region.x; cx < region.x + region.width; cx += chunkTiles) {
                    const w = Math.min(chunkTiles, region.x + region.width - cx), hgt = Math.min(chunkTiles, region.y + region.height - cy);
                    scratch.width = w * tw;
                    scratch.height = hgt * tw;
                    const ctx = scratch.getContext('2d');
                    ctx.imageSmoothingEnabled = false;
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, scratch.width, scratch.height);
                    le.ctx = ctx;
                    le.canvas = scratch;
                    le.panX = -cx * tw;
                    le.panY = -cy * tw;
                    ctx.save();
                    ctx.translate(le.panX, le.panY);
                    if (terrain && level.layers[0]?.visible !== false) le.drawTerrain(terrain);
                    for (let layer = terrain ? 1 : 0; layer < level.layers.length; layer++) {
                        if (show.layers ? show.layers.includes(layer) : level.layers[layer].visible !== false) le.drawLayer(layer);
                    }
                    le.drawObjects();
                    ctx.restore();
                    out.drawImage(scratch, 0, 0, scratch.width, scratch.height, (cx - region.x) * pixelsPerTile, (cy - region.y) * pixelsPerTile, w * pixelsPerTile, hgt * pixelsPerTile);
                }
            }
        } finally {
            le._screenshotMode = false;
            le._ssOpts = null;
            Object.assign(le, { ctx: saved.ctx, canvas: saved.canvas, panX: saved.panX, panY: saved.panY, zoom: saved.zoom, selectedObject: saved.selected, selectedObjects: saved.selectedSet });
        }
        return output;
    }

    const SCREENSHOT_INPUT = {
        level: LEVEL_ARG,
        x: S.integer('Left tile column of the area to capture', { default: 0, minimum: 0 }),
        y: S.integer('Top tile row of the area', { default: 0, minimum: 0 }),
        width: S.integer('Columns to capture; defaults to the rest of the level', { minimum: 1 }),
        height: S.integer('Rows to capture; defaults to the rest of the level', { minimum: 1 }),
        max_size: S.integer('Longest side of the image in pixels. Larger shows more detail on big maps.', { default: 1024, minimum: 128, maximum: 4096 }),
        grid: S.boolean('Draw the coordinate grid and labels', { default: true }),
        objects: S.boolean('Draw NPCs, signs, links, chests and baddies', { default: true }),
        show_npcs: S.boolean('Draw NPCs and baddies; defaults to objects'),
        show_characters: S.boolean('Draw NPCs that show a character (showcharacter) as one; needs show_npcs. Defaults to objects'),
        show_signs: S.boolean('Mark signs; defaults to objects. Turn off, with show_links, for a clean picture of the level'),
        show_links: S.boolean('Mark links; defaults to objects'),
        show_chests: S.boolean('Draw chests; defaults to objects'),
        layers: S.array(S.integer({ minimum: 0 }), 'Only draw these layers; defaults to the visible ones'),
    };

    // Renders a level, or part of one, to a canvas, with what is known about the picture.
    async function shoot({ level, x, y, width, height, max_size, grid, objects, layers, show_npcs, show_characters, show_signs, show_links, show_chests }) {
        const t = await open(level);
        const le = t.le;
        width = width ?? t.width - x;
        height = height ?? t.height - y;
        checkRegion(t, x, y, width, height);
        const missing = (layers || []).filter(index => index >= t.level.layers.length);
        if (missing.length) fail(`${label(t)} has layers 0-${t.level.layers.length - 1}; got ${missing.join(', ')}.`);
        const pixelsPerTile = Math.min(16, Math.floor(max_size / Math.max(width, height) * 100) / 100);
        const show = { ssNPCs: show_npcs ?? objects, ssChars: show_characters ?? objects, ssSigns: show_signs ?? objects, ssLinks: show_links ?? objects, ssChests: show_chests ?? objects, layers };
        const region = { x: t.ox + x, y: t.oy + y, width, height };
        renderRegion(le, region, pixelsPerTile, show);
        // The first pass asks for NPC images and animations; give them a moment, then draw for real.
        if (show.ssNPCs && t.level.objects.some(obj => obj.type === 'npc' && inTarget(t, obj))) await h.sleep(250);
        let canvas = renderRegion(le, region, pixelsPerTile, show);
        le.render();
        if (grid) {
            const spacing = [1, 2, 4, 8, 16, 32, 64].find(step => step * pixelsPerTile >= 28) || 64;
            canvas = withGrid(canvas, { x, y, width, height, pixelsPerTile, step: spacing, dividers: t.width > LEVEL_SIZE || t.height > LEVEL_SIZE ? LEVEL_SIZE : 0 });
        }
        const meta = { level: label(t), x, y, width, height, pixels_per_tile: pixelsPerTile, image: `${canvas.width}x${canvas.height}` };
        if (grid && t.entry.gmapGrid && !t.member) meta.note = 'Yellow lines separate member levels (64x64 tiles each). Pass a member name or a smaller region for detail.';
        if (t.warning) meta.warning = t.warning;
        return { meta, canvas };
    }

    mcp.tool({
        name: 'level_screenshot',
        title: 'Screenshot a level or gmap',
        description: 'Render a level as an image so you can see what you built: tiles on every layer plus NPCs, signs, links, chests and baddies. Works on a single level, a whole gmap (pass the gmap name: every member level in one picture, with yellow lines between levels), one gmap member (pass its name), or any rectangle of tiles for a closer look. Tile coordinates are printed along the top and left edges. NPC images load on first use, so a first shot may miss some; take it again if so. To keep the picture as a file, use level_export_image.',
        input: SCREENSHOT_INPUT,
        readOnly: true,
    }, async args => {
        const { meta, canvas } = await shoot(args);
        return mcp.result(meta, h.imagePart(canvas));
    });

    mcp.tool({
        name: 'level_export_image',
        title: 'Save a picture of a level or gmap',
        description: 'Write a picture of a level, a gmap or part of one to a PNG file, replacing a file already there: a map of the world for a minimap or an overview, a preview to keep beside the level files. Takes the same area and layer arguments as level_screenshot; the grid is off unless asked for. The picture is returned as well.',
        input: {
            ...SCREENSHOT_INPUT,
            path: S.string('Absolute path of the PNG file to write (.png)'),
            grid: S.boolean('Draw the coordinate grid and labels', { default: false }),
        },
        required: ['path'],
        destructive: true,
        idempotent: true,
        openWorld: true,
    }, async ({ path: target, ...args }) => {
        h.requireAbsolute(target, 'path');
        if (h.path.ext(target) !== 'png') fail(`path must end in .png, got "${h.path.base(target)}".`);
        const { meta, canvas } = await shoot(args);
        meta.saved = await h.savePng(canvas, target);
        return mcp.result(meta, h.imagePart(canvas));
    });
})();
