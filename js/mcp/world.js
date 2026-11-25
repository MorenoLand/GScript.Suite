// GSuite MCP: tools that work on whole worlds: creating gmaps, heightmap terrain,
// generating levels from a terrain map (the Level Generator), the workspace
// folder, and walking through levels in play mode.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;
    const h = mcp.helpers;
    const lv = h.level;

    const MAX_GMAP_LEVELS = 100;

    // The Level Generator's terrain kinds, with the map colour it reads each from
    // and the character that stands for it in a text map.
    const TERRAINS = [
        { name: 'grass', char: '.', color: [24, 140, 24], note: 'open ground' },
        { name: 'trees', char: 'T', color: [181, 239, 189], note: 'forest' },
        { name: 'water', char: '~', color: [0, 0, 255], note: 'sea, lakes and rivers' },
        { name: 'mountains', char: 'M', color: [128, 0, 0], note: 'raised cliffs' },
        { name: 'flowers', char: 'f', color: [255, 0, 0], note: 'flower patches' },
        { name: 'sand', char: 's', color: [150, 110, 0], note: 'sand' },
        { name: 'sand_stones', char: 'o', color: [113, 82, 0], note: 'sand with small stones' },
        { name: 'big_sand_stone', char: 'O', color: [83, 61, 0], note: 'sand with a big stone' },
        { name: 'swamp', char: '%', color: [0, 106, 0], note: 'swamp' },
        { name: 'bushes', char: 'b', color: [0, 66, 0], note: 'bushes' },
        { name: 'puddle', char: 'p', color: [0, 255, 255], note: 'puddles' },
        { name: 'puddle_stone', char: 'P', color: [0, 179, 179], note: 'puddle with a stone' },
    ];
    const terrainByChar = new Map(TERRAINS.map(terrain => [terrain.char, terrain]));
    const terrainByName = new Map(TERRAINS.map(terrain => [terrain.name, terrain]));
    const LEGEND = TERRAINS.map(terrain => `"${terrain.char}" ${terrain.name}`).join(', ');

    function levelLetters(column, columns) {
        let letters = String.fromCharCode(97 + column % 26);
        if (columns > 26) letters = String.fromCharCode(97 + Math.floor(column / 26) % 26) + letters;
        return letters;
    }

    // The coordinate part of a level name as the Gmap Generator writes it (x, y and the centre count from 1).
    function generatorCoords(x, y, centreX, centreY, lettered) {
        if (lettered) {
            const letters = value => String.fromCharCode(97 + Math.floor((value - 1) / 26)) + String.fromCharCode(97 + (value - 1) % 26);
            return `${letters(x)}-${letters(y)}`;
        }
        // Numbers count outwards from the centre in both directions, without a sign.
        const part = (value, centre) => String(value >= centre ? value - centre : centre - value - 1).padStart(2, '0');
        return `${part(x, centreX)}-${part(y, centreY)}`;
    }

    // Names for the member levels of a new gmap, row by row.
    function memberNames(prefix, columns, rows, naming, centreX = 1, centreY = 1) {
        const stem = /[_-]$/.test(prefix) ? prefix : prefix + '_';
        const pad = (value, count) => String(value).padStart(count > 99 ? 3 : count > 9 ? 2 : 1, '0');
        const names = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
            if (naming === 'generator_numbered' || naming === 'generator_lettered') return `${prefix}_${generatorCoords(column + 1, row + 1, centreX, centreY, naming === 'generator_lettered')}.nw`;
            return naming === 'numbered' ? `${stem}${pad(column, 10)}-${pad(row, 10)}.nw` : `${stem}${levelLetters(column, columns)}${pad(row + 1, rows)}.nw`;
        }));
        // Counting outwards from a centre gives the levels on either side of it the same number.
        const seen = new Map();
        names.forEach((line, row) => line.forEach((name, column) => {
            if (seen.has(name)) fail(`With centre ${centreX},${centreY} the levels at column ${seen.get(name)[0] + 1}, row ${seen.get(name)[1] + 1} and column ${column + 1}, row ${row + 1} would both be named ${name}: numbers count outwards from the centre without a sign. Use centre 1,1, or another naming.`);
            seen.set(name, [column, row]);
        }));
        return names;
    }

    function gmapText(names, tileset) {
        const lines = ['GRMAP001', `WIDTH ${names[0].length}`, `HEIGHT ${names.length}`];
        if (tileset) lines.push(`TILESET ${tileset}`);
        lines.push('LEVELNAMES', ...names.map(row => row.map(name => `"${name}"`).join(',')), 'LEVELNAMESEND');
        return lines.join('\n') + '\n';
    }

    // Edge links make neighbouring levels reachable on servers that do not load the gmap.
    function edgeLinks(names, column, row) {
        const links = [];
        const add = (name, x, y, width, height, nextX, nextY) => links.push({ nextLevel: name, x, y, width, height, nextX, nextY });
        if (column > 0) add(names[row][column - 1], 0, 0, 1, 64, '61', 'playery');
        if (column + 1 < names[row].length) add(names[row][column + 1], 63, 0, 1, 64, '0', 'playery');
        if (row > 0) add(names[row - 1][column], 0, 0, 64, 1, 'playerx', '61');
        if (row + 1 < names.length) add(names[row + 1][column], 0, 63, 64, 1, 'playerx', '0');
        return links;
    }

    // The .nw text of one new member level: filled with a tile, or a copy of a template level.
    function memberText(tiles, links, tileset, template) {
        const level = template ? Level.loadFromNW(template) : new Level(lv.LEVEL_SIZE, lv.LEVEL_SIZE);
        if (!template) level.layers[0].tiles = tiles;
        for (const link of links) {
            const obj = new LevelObject(link.x, link.y, 'link');
            obj.properties = { nextLevel: link.nextLevel, width: link.width, height: link.height, nextX: link.nextX, nextY: link.nextY, nextLayer: 0, layerIndex: 0 };
            level.addObject(obj);
        }
        if (tileset) level.tilesetName = tileset;
        return level.saveToNW();
    }

    // Opens a gmap built in memory: its text plus the .nw text of every member.
    async function openGmap(le, name, text, levels, folder) {
        const target = folder ? h.path.join(folder, name) : null;
        const before = le.levels.length;
        await le.openGmapText(text, name, levels, target);
        if (le.levels.length === before) fail('The gmap could not be built.');
        lv.syncTabs(le);
        const entry = le.levels[le.levels.length - 1];
        entry.modified = true;
        const t = await lv.open(le.levels.length - 1);
        lv.redraw(le);
        return t;
    }

    async function saveNew(t, folder) {
        if (!folder) return { saved: false, note: 'The gmap is open but not on disk yet. Save it with level_save and a path ending in .gmap.' };
        const result = mcp.helpers.unwrap(await mcp.call('level_save', { level: t.entry.name, path: h.path.join(folder, t.entry.name) }));
        return { saved: true, result: JSON.parse(result.value.content[0].text) };
    }

    // Fails when a file the save would write already exists, unless overwrite is set.
    async function refuseExisting(folder, files, overwrite) {
        if (!folder || overwrite) return;
        const existing = [];
        for (const file of files) {
            if ((await h.files.stat(h.path.join(folder, file))).exists) existing.push(file);
        }
        if (existing.length) fail(`These files already exist in ${folder}: ${existing.join(', ')}. Choose another name or folder, or pass overwrite: true to replace them.`);
    }

    // The file names saving a gmap writes: the .gmap and each member level, with the extension the save adds.
    function gmapFiles(stem, names) {
        return [stem + '.gmap', ...names.flat().map(name => { const file = lv.cleanName(name); return /\.(nw|graal|zelda)$/i.test(file) ? file : file + '.nw'; })];
    }

    async function overview(t, maxSize) {
        const shot = await mcp.call('level_screenshot', { level: t.entry.name, max_size: maxSize });
        return shot.isError ? null : shot.content.find(part => part.type === 'image');
    }

    const NEW_GMAP_INPUT = {
        name: S.string('Name of the world, e.g. "myworld". It names the .gmap file and prefixes the member levels (myworld_a1.nw, myworld_b1.nw, ...).'),
        columns: S.integer('How many levels wide', { minimum: 1, maximum: 26 }),
        rows: S.integer('How many levels tall', { minimum: 1, maximum: 26 }),
        folder: S.string('Absolute path of a folder to save the gmap and its levels into right away. Omit to keep it unsaved in the editor.'),
        overwrite: S.boolean('Replace files that already exist in folder. By default the tool fails and lists them.', { default: false }),
        naming: S.enum(['letters', 'numbered', 'generator_numbered', 'generator_lettered'], 'Member level names: "letters" gives name_a1.nw, name_b1.nw (column letter, row number); "numbered" gives name_00-00.nw, name_01-00.nw (two-digit column, then row). The other two are the Gmap Generator\'s schemes: "generator_lettered" gives name_aa-aa.nw, name_ab-aa.nw (two letters each for column and row), "generator_numbered" numbers outwards from center_x, center_y (the same as "numbered" when the centre is 1,1)', { default: 'letters' }),
        center_x: S.integer('For generator_numbered: the column numbered 00, counted from 1', { default: 1, minimum: 1 }),
        center_y: S.integer('For generator_numbered: the row numbered 00, counted from 1', { default: 1, minimum: 1 }),
        edge_links: S.boolean('Also add links along level edges, for servers that do not load the gmap itself', { default: false }),
    };

    function checkGmapSize(le, name, columns, rows) {
        if (columns * rows > MAX_GMAP_LEVELS) fail(`A gmap of ${columns}x${rows} is ${columns * rows} levels; this tool creates up to ${MAX_GMAP_LEVELS}. Build larger worlds as several gmaps.`);
        const stem = h.path.stem(name).replace(/[^A-Za-z0-9_-]/g, '');
        if (!stem) fail('name must contain letters or digits.');
        lv.uniqueName(le, stem + '.gmap');
        return stem;
    }

    mcp.tool({
        name: 'gmap_new',
        title: 'Create a gmap',
        description: 'Create a gmap: a grid of 64x64 levels that join seamlessly into one big world. It opens in the level editor as a single large level, so every level_* tool works across it (coordinates are in tiles from the map\'s top-left corner; pass a member level name as `level` to work in that level\'s own 0-63 coordinates). Levels start filled with one tile, or as copies of a template level you prepared (its tiles, layers and objects). To start from generated terrain instead, use world_generate. With folder, existing files of the same names are refused unless overwrite is set.',
        input: {
            ...NEW_GMAP_INPUT,
            fill_tile: S.integer(`Tile index every level is filled with. ${lv.GRASS_TILE} is grass.`, { default: lv.GRASS_TILE, minimum: 0, maximum: 4095 }),
            tileset: S.string('Tileset image for the whole map; defaults to pics1.png, or to the template\'s tileset'),
            template: S.string('Absolute path of a .nw level that every member level starts as a copy of, instead of fill_tile'),
        },
        required: ['name', 'columns', 'rows'],
        openWorld: true,
    }, async ({ name, columns, rows, folder, overwrite, naming, center_x, center_y, edge_links, fill_tile, tileset, template }) => {
        const le = await lv.editor();
        const stem = checkGmapSize(le, name, columns, rows);
        if (folder) h.requireAbsolute(folder, 'folder');
        let templateText = '';
        if (template) {
            h.requireAbsolute(template, 'template');
            const info = await h.files.stat(template);
            if (!info.exists || info.isDir) fail(`No such file: ${template}`);
            templateText = await h.files.readText(template);
            if (!/^GLEVNW01/.test(templateText)) fail(`${h.path.base(template)} is not a .nw level: it does not start with GLEVNW01.`);
            tileset = tileset || Level.loadFromNW(templateText).tilesetName;
        }
        tileset = tileset || 'pics1.png';
        const names = memberNames(stem, columns, rows, naming, center_x, center_y);
        await refuseExisting(folder, gmapFiles(stem, names), overwrite);
        const levels = {};
        names.forEach((line, row) => line.forEach((member, column) => {
            levels[member] = memberText(new Array(lv.LEVEL_SIZE * lv.LEVEL_SIZE).fill(fill_tile), edge_links ? edgeLinks(names, column, row) : [], tileset, templateText);
        }));
        const t = await openGmap(le, stem + '.gmap', gmapText(names, tileset === 'pics1.png' ? '' : tileset), levels, folder);
        const saved = await saveNew(t, folder);
        return { created: lv.describeLevel(t), ...saved };
    });

    mcp.tool({
        name: 'gmap_from_levels',
        title: 'Assemble a gmap from levels',
        description: 'Create a gmap from existing level files by laying them out on a grid. The levels are read from the folder; the .gmap file is written there and opened. Every row must have the same number of names. An existing .gmap file of that name is refused unless overwrite is set.',
        input: {
            name: S.string('Name of the gmap, e.g. "overworld"'),
            folder: S.string('Absolute path of the folder holding the level files'),
            levels: S.array(S.array(S.string()), 'Grid of level file names: an array of rows, top to bottom, each an array of names left to right'),
            overwrite: S.boolean('Replace the .gmap file if it already exists. By default the tool fails.', { default: false }),
        },
        required: ['name', 'folder', 'levels'],
        openWorld: true,
    }, async ({ name, folder, levels, overwrite }) => {
        const le = await lv.editor();
        h.requireAbsolute(folder, 'folder');
        const stem = h.path.stem(name).replace(/[^A-Za-z0-9_-]/g, '');
        if (!stem) fail('name must contain letters or digits.');
        lv.uniqueName(le, stem + '.gmap');
        if (!levels.length || levels.some(row => row.length !== levels[0].length || !row.length)) fail('levels must be a grid: at least one row, every row the same length.');
        const missing = [];
        for (const member of levels.flat()) {
            const info = await h.files.stat(h.path.join(folder, member));
            if (!info.exists) missing.push(member);
        }
        if (missing.length) fail(`These levels are not in ${folder}: ${missing.join(', ')}.`);
        await refuseExisting(folder, [stem + '.gmap'], overwrite);
        const target = h.path.join(folder, stem + '.gmap');
        await h.files.write(target, gmapText(levels, ''));
        return mcp.helpers.unwrap(await mcp.call('level_open', { path: target }));
    });

    mcp.tool({
        name: 'gmap_set_terrain',
        title: 'Give a gmap heightmap terrain',
        description: 'Turn on, generate or shape heightmap terrain for a gmap: hills and valleys drawn with the terrain tileset (picso.png), as on newer Graal servers. Painted tiles on layer 0 are replaced by the terrain surface in the editor view; layers 1 and 2 and all objects stay. Two ways to work, which combine: generate heights from a seed (seed, map_height, chaos ...), or place them yourself. `controls` set the height at the corners where levels meet (a grid of columns+1 by rows+1 points; the land between is interpolated), which is how to put a valley, a plateau or a basin for a lake where you want it. `spots` then adjust single points inside levels, every 8 tiles. Giving only controls, spots, shift or clear_spots keeps the generated map as it is. The result lists the corner heights. level_undo takes the heights back but not the switch to the terrain tileset (level_set_tileset does that).',
        input: {
            level: S.string('The gmap; defaults to the active level'),
            seed: S.integer('Random seed for the heights', { minimum: 0 }),
            map_height: S.number('Height range of the hills, in tiles. 0 makes flat terrain.', { minimum: 0, maximum: 64 }),
            chaos: S.number('Roughness between levels, 0-1', { minimum: 0, maximum: 1 }),
            level_height: S.number('Height variation inside each level; 0 derives it from map_height', { minimum: 0, maximum: 64 }),
            level_chaos: S.number('Roughness inside each level, 0-1', { minimum: 0, maximum: 1 }),
            base_height: S.number('Height everything starts from'),
            flat_borders: S.boolean('Keep the outer border of the map level'),
            regenerate: S.enum(['map', 'levels', 'none'], '"map" draws new corner heights from the seed (discarding controls set by hand); "levels" keeps the corner heights and redraws the detail inside levels; "none" changes no heights. Defaults to "map" when a generation setting is given or the gmap has no terrain yet, otherwise "none".'),
            controls: S.array(S.object({
                x: S.integer('Corner column, 0 to the number of level columns', { minimum: 0 }),
                y: S.integer('Corner row, 0 to the number of level rows', { minimum: 0 }),
                height: S.number('Height in tiles'),
            }, ['x', 'y', 'height']), 'Corner heights to set by hand'),
            spots: S.array(S.object({
                x: S.integer('World tile column, a multiple of 8', { minimum: 0 }),
                y: S.integer('World tile row, a multiple of 8', { minimum: 0 }),
                height: S.number('Height in tiles'),
            }, ['x', 'y', 'height']), 'Heights of single points inside levels, to set by hand'),
            clear_spots: S.boolean('Discard every spot set by hand, before any given in this call'),
            shift: S.number('Raise (positive) or lower (negative) the whole terrain by this many tiles'),
        },
    }, async ({ level, seed, map_height, chaos, level_height, level_chaos, base_height, flat_borders, regenerate, controls, spots, clear_spots, shift }) => {
        const t = await lv.open(level);
        const { entry, le } = t;
        if (!entry.gmapGrid) fail(`${entry.name} is a single level; heightmap terrain belongs to gmaps.`);
        if (!window.GraalTerrain?.TerrainMap) fail('The terrain module is not loaded.');
        const terrain = entry.terrain || window.GraalTerrain.TerrainMap.parse(entry.gmapText);
        if (!terrain) fail(`${entry.name} could not be read as a terrain map.`);
        const first = !terrain.hasTerrainData;
        const settings = [seed, map_height, chaos, level_height, level_chaos, base_height, flat_borders].some(value => value !== undefined);
        regenerate = regenerate || (first || settings ? 'map' : 'none');
        // A gmap without terrain has no corner heights to keep: the first pass always draws them.
        if (first && regenerate === 'levels') regenerate = 'map';
        // Everything is checked before anything changes.
        (controls || []).forEach((control, index) => {
            if (control.x > terrain.width || control.y > terrain.height) fail(`controls[${index}] is at corner ${control.x},${control.y}; ${entry.name} has corners 0-${terrain.width} across and 0-${terrain.height} down.`);
        });
        (spots || []).forEach((spot, index) => {
            if (spot.x % 8 || spot.y % 8) fail(`spots[${index}] is at ${spot.x},${spot.y}; spots sit on every 8th tile (0, 8, 16, ...).`);
            if (spot.x > terrain.width * 64 || spot.y > terrain.height * 64) fail(`spots[${index}] at ${spot.x},${spot.y} is outside ${entry.name}, which is ${terrain.width * 64}x${terrain.height * 64} tiles.`);
        });
        if (first && regenerate === 'none') fail(`${entry.name} has no terrain yet. Generate it first (regenerate: "map", the default), then shape it.`);
        le.pushUndo();
        if (first || settings) {
            terrain.setSettings({
                mapSeed: seed ?? (first ? 1 : undefined),
                mapHeight: map_height ?? (first ? 4 : undefined),
                mapChaos: chaos ?? (first ? 0.6 : undefined),
                levelHeight: level_height,
                levelChaos: level_chaos ?? (first ? 0.6 : undefined),
                baseHeight: base_height,
                evenBorders: flat_borders,
            });
        }
        if (regenerate !== 'none') terrain.regenerate(regenerate === 'map');
        if (clear_spots) terrain.clearOverrides();
        for (const control of controls || []) terrain.setMapControl(control.x, control.y, control.height);
        for (const spot of spots || []) terrain.setHeightSpot(spot.x, spot.y, spot.height);
        if (shift) terrain.shiftAll(shift);
        entry.terrain = terrain;
        entry.gmapText = terrain.saveText();
        entry.terrainApplied = terrain.hasTerrainData;
        t.level.tilesetType = 5;
        if (first && (!t.level.tilesetName || t.level.tilesetName === 'pics1.png')) t.level.tilesetName = 'picso.png';
        const warning = await lv.ensureTileset(le, t.level);
        le.invalidateTerrainCache();
        le.updateTilesetDisplay();
        lv.commit(t);
        const round = value => Math.round(value * 100) / 100;
        const corners = Array.from({ length: terrain.height + 1 }, (_, row) => Array.from({ length: terrain.width + 1 }, (_, column) => round(terrain.heightMap[row * (terrain.width + 1) + column])));
        return {
            gmap: entry.name, tileset: t.level.tilesetName, warning: warning || undefined,
            terrain: { seed: terrain.mapSeed, map_height: terrain.mapHeight, chaos: terrain.mapChaos, level_height: terrain.levelHeight, level_chaos: terrain.levelChaos, base_height: terrain.baseHeight, lowest: round(terrain.minimumHeight), highest: round(terrain.maximumHeight) },
            corner_heights: corners,
            hand_set_spots: terrain.overrides.length ? `${terrain.overrides.length} level(s) have spots set by hand` : undefined,
        };
    });

    // ---- World generation from a terrain map ---------------------------------------------

    function paintShape(cells, width, height, shape, index) {
        const terrain = terrainByName.get(shape.terrain) || fail(`shapes[${index}].terrain "${shape.terrain}" is not a terrain. Terrains: ${TERRAINS.map(item => item.name).join(', ')}.`);
        if (shape.x >= width || shape.y >= height || shape.x + shape.width <= 0 || shape.y + shape.height <= 0) fail(`shapes[${index}] at ${shape.x},${shape.y} (${shape.width}x${shape.height}) lies outside the world, which is ${width}x${height} tiles.`);
        const kind = shape.shape || 'rect';
        const x0 = Math.max(0, shape.x), y0 = Math.max(0, shape.y), x1 = Math.min(width, shape.x + shape.width), y1 = Math.min(height, shape.y + shape.height);
        const cx = shape.x + shape.width / 2, cy = shape.y + shape.height / 2, rx = shape.width / 2, ry = shape.height / 2;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            if (kind === 'ellipse' && ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) continue;
            cells[y * width + x] = terrain;
        }
    }

    // Reads the terrain map arguments into one terrain per tile.
    function terrainCells(width, height, base, map, scale, shapes) {
        const baseTerrain = terrainByName.get(base) || fail(`base "${base}" is not a terrain. Terrains: ${TERRAINS.map(item => item.name).join(', ')}.`);
        const cells = new Array(width * height).fill(baseTerrain);
        if (map) {
            const expectedRows = height / scale, expectedColumns = width / scale;
            if (map.length !== expectedRows) fail(`map has ${map.length} rows; a ${width}x${height}-tile world at scale ${scale} needs ${expectedRows} rows of ${expectedColumns} characters.`);
            map.forEach((line, row) => {
                if (line.length !== expectedColumns) fail(`map row ${row} has ${line.length} characters; it needs ${expectedColumns}.`);
                for (let column = 0; column < line.length; column++) {
                    if (line[column] === NO_TERRAIN) continue;
                    const terrain = terrainByChar.get(line[column]) || fail(`map row ${row} has an unknown character "${line[column]}". Legend: ${LEGEND}.`);
                    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) cells[(row * scale + dy) * width + column * scale + dx] = terrain;
                }
            });
        }
        (shapes || []).forEach((shape, index) => paintShape(cells, width, height, shape, index));
        return cells;
    }

    async function levelGenerator() {
        return h.waitFor(() => (typeof LevelGenEditor !== 'undefined' ? LevelGenEditor : null), 10000, 'the Level Generator to load');
    }

    // Shows the map in the Level Generator tab when it is small enough for that tool.
    function showInLevelGenerator(generator, width, height, pixels) {
        const instance = generator._instance;
        if (!instance || width > 128 || height > 128) return false;
        instance._remember();
        instance.width = width;
        instance.height = height;
        instance.pixels = pixels.slice();
        instance._q('widthInput').value = width;
        instance._q('heightInput').value = height;
        instance.bitmapDirty = true;
        instance._render();
        instance._saveSessionNow(true);
        return true;
    }

    // Stands in a map row for a pixel that is no terrain colour: the base terrain stays there.
    const NO_TERRAIN = '\u0000';

    // Reads a terrain map picture into rows of map characters, one per pixel: a file, the
    // sample that ships with the app, or the map painted in the Level Generator tab.
    async function mapPicture(generator, source) {
        let width, height, colours;
        if (source === 'tab') {
            const tab = generator._instance;
            if (!tab || !tab.pixels) fail('The Level Generator tab has no map yet. Open it with app_open_tool, or give a picture file.');
            width = tab.width;
            height = tab.height;
            colours = tab.pixels.map(colour => (String(colour).match(/\d+/g) || []).slice(0, 3).map(Number));
        } else {
            let url, revoke = false;
            if (source === 'example') url = 'images/levelgen.png';
            else {
                h.requireAbsolute(source, 'map_image');
                if (!['png', 'gif'].includes(h.path.ext(source))) fail(`A terrain map picture is a .png or .gif, got "${h.path.base(source)}".`);
                const info = await h.files.stat(source);
                if (!info.exists || info.isDir) fail(`No such file: ${source}`);
                url = URL.createObjectURL(new Blob([await h.files.readBytes(source)]));
                revoke = true;
            }
            const image = await new Promise(done => { const img = new Image(); img.onload = () => done(img); img.onerror = () => done(null); img.src = url; });
            if (revoke) URL.revokeObjectURL(url);
            if (!image) fail(`${source === 'example' ? 'The example map' : h.path.base(source)} could not be read as a picture.`);
            width = image.width;
            height = image.height;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(image, 0, 0);
            const data = ctx.getImageData(0, 0, width, height).data;
            colours = Array.from({ length: width * height }, (_, index) => [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]]);
        }
        // The generator takes a colour for a terrain when the three channels differ by less than 32 in total.
        const terrainFor = colour => TERRAINS.find(terrain => Math.abs(colour[0] - terrain.color[0]) + Math.abs(colour[1] - terrain.color[1]) + Math.abs(colour[2] - terrain.color[2]) < 32);
        let unmatched = 0;
        const rows = [];
        for (let y = 0; y < height; y++) {
            let row = '';
            for (let x = 0; x < width; x++) {
                const terrain = terrainFor(colours[y * width + x] || []);
                if (!terrain) unmatched++;
                row += terrain ? terrain.char : NO_TERRAIN;
            }
            rows.push(row);
        }
        return { width, height, rows, unmatched };
    }

    mcp.tool({
        name: 'world_generate',
        title: 'Generate a world from a terrain map',
        description: 'Build a whole overworld with the Level Generator: you describe the land as a terrain map and it paints real tiles with proper shorelines, cliffs, forest edges and scattered detail, split into 64x64 levels joined by a gmap. '
            + 'Describe the map with `map` (rows of characters), `shapes` (rectangles and ellipses painted over it), or both. '
            + `Map characters: ${LEGEND}. `
            + 'Each character covers scale x scale tiles, so a world of C x R levels needs R*64/scale rows of C*64/scale characters (scale 4: 16 characters per level). '
            + 'Water, mountains and trees form in blocks about 6 tiles wide, so draw them at least that large; thin strokes vanish. '
            + 'Lakes and mountains come out ringed by cliffs that block walking, as in the classic overworld: check with level_get_walkability, and open a way in with tile objects (the Platform and Bridge pieces) where the player should get through. '
            + 'The result opens as a gmap ready for towns, NPCs and links (level_place_tile_object, level_add_npc, ...). Returns an overview picture. With folder, existing files of the same names are refused unless overwrite is set.',
        input: {
            ...NEW_GMAP_INPUT,
            base: S.string('Terrain everything starts as', { default: 'grass' }),
            map: S.array(S.string(), 'Rows of the terrain map, top to bottom'),
            scale: S.integer('Tiles covered by each map character (1, 2, 4 or 8)', { default: 4, minimum: 1, maximum: 8 }),
            shapes: S.array(S.object({
                terrain: S.string('Terrain name: grass, trees, water, mountains, flowers, sand, sand_stones, big_sand_stone, swamp, bushes, puddle, puddle_stone'),
                shape: S.enum(['rect', 'ellipse'], 'Shape to paint', { default: 'rect' }),
                x: S.integer('Left tile column, from the world\'s left edge'),
                y: S.integer('Top tile row, from the world\'s top edge'),
                width: S.integer('Width in tiles', { minimum: 1 }),
                height: S.integer('Height in tiles', { minimum: 1 }),
            }, ['terrain', 'x', 'y', 'width', 'height']), 'Shapes painted over the map, in order'),
            map_image: S.string('Instead of map: a terrain map picture, as the Level Generator loads and saves them. An absolute path of a .png or .gif whose pixels use the terrain colours (world_terrain_legend), "example" for the sample that ships with the app, or "tab" for the map painted in the Level Generator tab. Each pixel covers scale x scale tiles; shapes are painted over it'),
            save_map_image: S.string('Also write the terrain map that was used as a picture (one pixel per tile) to this absolute path (.png), to keep it, edit it in a paint program and generate from it again with map_image and scale 1. (The Level Generator tab itself only loads pictures up to 128 pixels a side.)'),
            preview: S.boolean('Return an overview picture of the result', { default: true }),
        },
        required: ['name', 'columns', 'rows'],
        openWorld: true,
        timeoutMs: 300000,
    }, async ({ name, columns, rows, folder, overwrite, naming, center_x, center_y, edge_links, base, map, scale, shapes, map_image, save_map_image, preview }) => {
        const le = await lv.editor();
        const stem = checkGmapSize(le, name, columns, rows);
        if (folder) h.requireAbsolute(folder, 'folder');
        if (![1, 2, 4, 8].includes(scale)) fail('scale must be 1, 2, 4 or 8.');
        if (save_map_image) {
            h.requireAbsolute(save_map_image, 'save_map_image');
            if (h.path.ext(save_map_image) !== 'png') fail(`save_map_image must end in .png, got "${h.path.base(save_map_image)}".`);
        }
        const width = columns * lv.LEVEL_SIZE, height = rows * lv.LEVEL_SIZE;
        const names = memberNames(stem, columns, rows, naming, center_x, center_y);
        await refuseExisting(folder, gmapFiles(stem, names), overwrite);
        const generator = await levelGenerator();
        let unmatched = 0;
        if (map_image) {
            if (map) fail('Give map or map_image, not both. Shapes can be painted over either.');
            const picture = await mapPicture(generator, map_image);
            if (picture.width * scale !== width || picture.height * scale !== height) {
                fail(`The terrain picture is ${picture.width}x${picture.height} pixels, which at scale ${scale} makes a world of ${picture.width * scale}x${picture.height * scale} tiles; ${columns}x${rows} levels need ${width}x${height} tiles (${width / scale}x${height / scale} pixels). Change columns, rows or scale to fit.`);
            }
            map = picture.rows;
            unmatched = picture.unmatched;
        }
        const cells = terrainCells(width, height, base, map, scale, shapes);
        const pixels = cells.map(terrain => `rgb(${terrain.color.join(',')})`);
        if (save_map_image) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            pixels.forEach((color, index) => { ctx.fillStyle = color; ctx.fillRect(index % width, Math.floor(index / width), 1, 1); });
            await h.savePng(canvas, save_map_image);
        }
        // The generator emits Graal tile ids; the editor stores tileset positions.
        const boards = generator.prototype._paintTerrain.call({ width, height, pixels });
        const toIndex = id => (((id >> 4) % 32) * 128) + (id & 15) + 16 * Math.floor((id >> 4) / 32);
        const levels = {};
        names.forEach((line, row) => line.forEach((member, column) => {
            levels[member] = memberText(boards[row * columns + column].map(toIndex), edge_links ? edgeLinks(names, column, row) : [], 'pics1.png');
        }));
        const t = await openGmap(le, stem + '.gmap', gmapText(names, ''), levels, folder);
        const saved = await saveNew(t, folder);
        const shown = showInLevelGenerator(generator, width, height, pixels);
        const counts = {};
        for (const terrain of cells) counts[terrain.name] = (counts[terrain.name] || 0) + 1;
        const summary = {
            created: lv.describeLevel(t), ...saved,
            terrain_share: Object.fromEntries(Object.entries(counts).map(([terrain, count]) => [terrain, `${Math.round(count / cells.length * 100)}%`])),
            level_generator_tab: shown ? 'The terrain map is also loaded in the Level Generator tab.' : undefined,
            map_image_saved: save_map_image ? h.path.normalize(save_map_image) : undefined,
            unmatched_pixels: unmatched ? `${unmatched} pixels of the picture are not one of the twelve terrain colours (world_terrain_legend) and became ${base}` : undefined,
        };
        const picture = preview ? await overview(t, 1024) : null;
        return mcp.result(summary, picture);
    });

    mcp.tool({
        name: 'world_terrain_legend',
        title: 'Terrain map legend',
        description: 'The terrain kinds world_generate understands, with the map character and the Level Generator colour for each.',
        readOnly: true,
    }, async () => TERRAINS.map(terrain => ({ terrain: terrain.name, character: terrain.char, color: `rgb(${terrain.color.join(',')})`, makes: terrain.note })));

    // ---- Workspace folder ---------------------------------------------------------------------

    mcp.tool({
        name: 'workspace_set_directory',
        title: 'Set the workspace folder',
        description: 'Point GSuite at a folder of game files (its "working directory"). GSuite scans it, with subfolders, for images, ganis, sounds and levels, so NPC images, custom tilesets, animations and linked levels resolve by file name. Set it to the folder you are building a world in.',
        input: { path: S.string('Absolute path of the folder') },
        required: ['path'],
        idempotent: true,
        openWorld: true,
        timeoutMs: 300000,
    }, async ({ path: target }) => {
        const le = await lv.editor();
        h.desktop();
        h.requireAbsolute(target, 'path');
        const info = await h.files.stat(target);
        if (!info.exists || !info.isDir) fail(`${target} is not a folder. Create it with fs_make_directory first.`);
        await le.loadWorkspaceFromDisk(info.path);
        await h.waitFor(() => !window._workspaceScanUnlisten, 240000, 'the workspace scan to finish');
        const found = await h.invoke('SearchWorkspace', '', 100000);
        const kinds = { images: 0, ganis: 0, levels: 0 };
        for (const file of found) {
            const ext = h.path.ext(file);
            if (ext === 'gani') kinds.ganis++;
            else if (['nw', 'gmap', 'graal', 'zelda'].includes(ext)) kinds.levels++;
            else kinds.images++;
        }
        return { workspace: info.path, files: { ...kinds, sounds: le.fileCache.sounds.size } };
    });

    mcp.tool({
        name: 'workspace_find_files',
        title: 'Find files in the workspace',
        description: 'Search the workspace folder by file name (images, ganis, levels and gmaps; case-insensitive substring match). Use it to find the exact name of an image for an NPC, a tileset, or a level to link to.',
        input: {
            query: S.string('Part of the file name; empty lists everything', { default: '' }),
            kind: S.enum(['any', 'image', 'gani', 'level'], 'Only return this kind of file', { default: 'any' }),
            limit: S.integer('Most results to return', { default: 100, minimum: 1, maximum: 2000 }),
        },
        readOnly: true,
    }, async ({ query, kind, limit }) => {
        h.desktop();
        const workspace = window._wailsLastDir || (await h.system()).workspaceDir;
        if (!workspace) fail('No workspace folder is set. Use workspace_set_directory.');
        const isKind = file => {
            const ext = h.path.ext(file);
            if (kind === 'gani') return ext === 'gani';
            if (kind === 'level') return ['nw', 'gmap', 'graal', 'zelda'].includes(ext);
            if (kind === 'image') return ['png', 'gif', 'jpg', 'jpeg', 'webp', 'bmp', 'mng'].includes(ext);
            return true;
        };
        const all = (await h.invoke('SearchWorkspace', query, 100000)).filter(isKind);
        return { workspace, matches: all.length, files: all.slice(0, limit).map(file => ({ name: h.path.base(file), path: file })) };
    });

    // ---- Play mode ----------------------------------------------------------------------------

    const DIRECTIONS = { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' };
    const DIRECTION_NAMES = ['up', 'left', 'down', 'right'];
    const PLAY_STEP = 0.05;

    // The centre of the player's body on the ground, in pixels. The editor tests walls and links
    // against a box of just under 2x2 tiles around this point.
    function bodyCentre(le) {
        const player = le._player, tw = le.level.tileWidth || 16;
        return { x: player.x + (player._ganiOX ?? 0) + (player._imgW ?? 32) / 2, y: player.y + (player._ganiOY ?? 0) + (player._imgH ?? 48) - tw };
    }

    const round2 = value => Math.round(value * 100) / 100;
    const typeName = type => (typeof TILE_TYPES !== 'undefined' && TILE_TYPES.NAMES[type]) || 'normal';
    // What stops a walking player in play mode: blocking tiles, and throw-through ones (only thrown things pass those).
    const blocksWalking = type => type === 22 || type === 20;

    // Tile types under the player's body: its centre and the four corners.
    function typesUnder(le) {
        const tw = le.level.tileWidth || 16, centre = bodyCentre(le);
        const reach = (le._colHW ?? 15);
        return [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => le._getTileType(centre.x + dx * reach, centre.y + dy * reach));
    }

    function playState(le) {
        const player = le._player;
        const entry = le.levels[le.currentLevelIndex];
        const tw = le.level.tileWidth || 16;
        const centre = bodyCentre(le);
        const under = typesUnder(le);
        const state = {
            playing: true,
            level: entry?.name,
            body: { x: round2(centre.x / tw - 1), y: round2(centre.y / tw - 1), width: 2, height: 2 },
            position: { x: round2(player.x / tw), y: round2(player.y / tw) },
            facing: DIRECTION_NAMES[player.dir] || 'down',
            animation: player.gani,
            standing_on: typeName(under[0]),
        };
        // A sign, or what an NPC says when touched, is shown three lines at a time.
        const sign = le._activePlaySign;
        if (sign) state.sign = { showing: sign.lines.slice(sign.page, sign.page + 3), page: sign.page / 3 + 1, pages: Math.ceil(sign.lines.length / 3), text: sign.lines.join('\n'), note: 'The player cannot walk while this is open: play_move with action "next" turns the page or closes it.' };
        if (player._carrying) state.carrying = player._carrying;
        if (player._hidden) state.hidden_under = player._hiddenType || true;
        if (le._playNoclip) state.noclip = true;
        if (player.nick && player.nickTimer > 0) state.nick = player.nick;
        if (le._playerChat && le._playerChatTimer > 0) state.chat = le._playerChat;
        if (under.some(blocksWalking)) {
            if (le._playNoclip) state.inside_wall = 'The body overlaps a blocking tile, which noclip allows. Walk to free ground before turning noclip off.';
            else state.stuck = 'The body overlaps a blocking tile, so the player cannot move. Start where a 2x2 block of tiles is free (level_get_walkability).';
        }
        if (entry?.gmapGrid) {
            const cellX = Math.floor(centre.x / tw / lv.LEVEL_SIZE), cellY = Math.floor(centre.y / tw / lv.LEVEL_SIZE);
            const member = lv.cleanName(entry.gmapGrid[cellY]?.[cellX]);
            if (member) state.member = { name: member, body: { x: round2(centre.x / tw - 1 - cellX * lv.LEVEL_SIZE), y: round2(centre.y / tw - 1 - cellY * lv.LEVEL_SIZE) } };
        }
        return state;
    }

    // What lies just beyond the player's body in a direction, for explaining why a walk stopped.
    function obstacleAhead(le, direction) {
        const tw = le.level.tileWidth || 16, centre = bodyCentre(le);
        const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
        const found = [];
        for (const side of [-0.9, 0, 0.9]) {
            const x = centre.x + step[0] * tw * 1.2 + step[1] * side * tw, y = centre.y + step[1] * tw * 1.2 + step[0] * side * tw;
            const tile = [Math.floor(x / tw), Math.floor(y / tw)];
            const type = le._getTileType(x, y);
            if (blocksWalking(type) && !found.some(item => item.tile[0] === tile[0] && item.tile[1] === tile[1])) found.push({ tile, type: typeName(type) });
        }
        return found;
    }

    function requirePlaying(le) {
        if (!le._playMode || !le._player) fail('Play mode is not running. Start it with play_start.');
    }

    mcp.tool({
        name: 'play_start',
        title: 'Start play mode',
        description: 'Enter the level editor\'s play mode: a player character you can walk around the level to test it: collisions, water, signs and links. The player\'s body covers 2x2 tiles; x,y is the top-left tile of that block, which must be free of walls. Move with play_move, look with level_screenshot (the player is drawn in it), stop with play_stop. Links work between levels that are open in the editor, including into a member of an open gmap. Play mode emulates movement and the tiles; it does not run NPC scripts. Stop play mode before editing a different level.',
        input: {
            level: lv.LEVEL_ARG,
            x: S.number('Left tile column of the player\'s 2x2 body; defaults to the middle of the level', { minimum: 0 }),
            y: S.number('Top tile row of the player\'s 2x2 body', { minimum: 0 }),
        },
    }, async ({ level, x, y }) => {
        const t = await lv.open(level);
        const le = t.le;
        const tab = lv.tabFor(t.entry);
        if (tab) window.tabManager.switchTo(tab.id);
        x = x ?? t.width / 2;
        y = y ?? t.height / 2;
        if (x + 2 > t.width || y + 2 > t.height) fail(`Start position ${x},${y} leaves no room for the player's 2x2 body inside ${lv.label(t)}.`);
        if (le._playMode) le.exitPlayMode();
        le.enterPlayMode();
        const tw = le.level.tileWidth || 16;
        try {
            // Two passes: the first draws the player once so the editor measures its sprite, the second places its body.
            for (let pass = 0; pass < 2; pass++) {
                const centre = bodyCentre(le);
                le._player.x += (t.ox + x + 1) * tw - centre.x;
                le._player.y += (t.oy + y + 1) * tw - centre.y;
                le._updatePlayer(0);
                le.render();
            }
            return playState(le);
        } catch (error) {
            le.exitPlayMode();
            throw error;
        }
    });

    mcp.tool({
        name: 'play_move',
        title: 'Walk in play mode',
        description: 'Walk the player a number of tiles in a direction and report where it ends up. `body` is the 2x2 block of tiles the player occupies (what touches walls, water and links); `position` is the player\'s x,y as scripts and link targets use it, which is half a tile left of and one tile above that block. When the walk stops short, `blocked_by` lists what is in the way; a 2-tile-wide gap is only passable when the body lines up with it exactly. Walking onto a link warps to its target level if that is open. Actions: "sword" swings, "grab" grabs or reads.',
        input: {
            direction: S.enum(['up', 'down', 'left', 'right'], 'Direction to walk'),
            tiles: S.number('How far to try to walk, in tiles', { default: 1, minimum: 0, maximum: 64 }),
            action: S.enum(['sword', 'grab', 'lift', 'throw', 'hide', 'next'], 'An action instead of, or after, walking. sword: swing (cuts bushes). grab: read the sign or grab what is ahead. lift: pick up the bush, vase, stone or sign ahead. throw: throw what is carried. hide: duck under a carried bush or stone, or come out. next: turn the page of the sign being read, or close it'),
            say: S.string('Type this into the chat: the text shows above the player. "setnick Name" names the player and "showname" shows the name'),
            noclip: S.boolean('Turn walking through walls on or off (for looking around; links still work). It stays until changed or play mode ends'),
        },
    }, async ({ direction, tiles, action, say, noclip }) => {
        const le = await lv.editor();
        requirePlaying(le);
        const before = playState(le);
        const notes = [];
        if (noclip !== undefined) le._playNoclip = noclip;
        // With a sign open any key only turns its page, so walking waits until it is closed.
        const reading = !!le._activePlaySign;
        if (direction && reading) notes.push('A sign is open, so the player did not walk. Turn its pages and close it with action "next" first.');
        if (direction && !reading) {
            const key = DIRECTIONS[direction];
            // A sign that was just closed may be walked into again; only a held key must not reopen it.
            le._player._signReopenLock = false;
            const tw = le.level.tileWidth || 16;
            const start = bodyCentre(le), startLevel = le.currentLevelIndex;
            // Water and swamp slow the player down, so walk by distance rather than by time, and
            // stop when the player has not moved for a few steps (a wall) or was warped by a link.
            const maxSteps = Math.ceil(tiles * tw / (le._player.speed * PLAY_STEP)) * 4 + 8;
            let still = 0;
            le._playKeys[key] = true;
            for (let step = 0; step < maxSteps && le._playMode && le.currentLevelIndex === startLevel && still < 4; step++) {
                const before = bodyCentre(le);
                const walked = Math.abs(before.x - start.x) + Math.abs(before.y - start.y);
                if (walked >= tiles * tw - 0.5) break;
                const moved = () => { const now = bodyCentre(le); return Math.abs(now.x - before.x) + Math.abs(now.y - before.y) >= 0.01; };
                let dt = Math.min(PLAY_STEP, Math.max(0.005, (tiles * tw - walked) / le._player.speed));
                le._updatePlayer(dt);
                // A step that would end inside a wall is not taken at all: come up to the wall in smaller ones,
                // as the game does at its own frame rate, so the player ends up touching what stopped it.
                while (!moved() && dt > 0.004 && le._playMode && le.currentLevelIndex === startLevel && !le._activePlaySign) { dt /= 2; le._updatePlayer(dt); }
                still = moved() ? 0 : still + 1;
                if (le._activePlaySign) break;
            }
            le._playKeys[key] = false;
        }
        let acted;
        if (action && le._playMode) {
            const player = le._player;
            const settle = steps => { for (let i = 0; i < steps && le._playMode; i++) le._updatePlayer(PLAY_STEP); };
            // While a sign is open the game takes every key as "next page".
            if (le._activePlaySign && action !== 'next') acted = 'nothing: a sign is open. Close it with action "next" first';
            else if (action === 'sword' && player._carrying) acted = `nothing: the player is carrying a ${player._carrying}, and the sword key would throw it. Use action "throw"`;
            else if (action === 'sword') { le._playKeys[' '] = true; le._updatePlayer(PLAY_STEP); le._playKeys[' '] = false; settle(4); acted = 'swung the sword'; }
            else if (action === 'grab') { le._tryGrab(); settle(4); acted = le._activePlaySign ? 'grabbed and is reading a sign' : 'grabbed'; }
            else if (action === 'next') {
                acted = le._activePlaySign ? 'turned the page' : 'no sign is open';
                if (le._activePlaySign) {
                    le._advancePlaySign();
                    if (!le._activePlaySign) acted = 'closed the sign';
                }
            } else if (action === 'lift') {
                if (player._carrying) acted = `already carrying a ${player._carrying}`;
                else if (!le._getSettings().objectPickup) acted = 'picking things up is turned off in the level editor settings (app_update_settings, editor.objectPickup)';
                else if (le._tryLiftPlayObject()) { settle(5); acted = `lifted a ${player._carrying}`; }
                else acted = 'nothing to lift: stand right in front of a bush, vase, stone or sign (a 2x2 tile object of the classic tileset) and face it';
            } else if (action === 'throw') {
                if (!player._carrying) acted = 'nothing is being carried';
                else {
                    const carried = player._carrying;
                    settle(5);
                    le._throwPlayObject();
                    for (let i = 0; i < 16 && le._playThrownObjects && le._playThrownObjects.length; i++) le._updatePlayer(PLAY_STEP);
                    acted = player._carrying ? 'could not throw yet' : `threw the ${carried}`;
                }
            } else if (action === 'hide') {
                const ok = le._tryHide();
                acted = player._hidden ? `hiding under the ${player._hiddenType}` : ok ? 'came out of hiding' : 'nothing to hide under: carry a bush or a stone first';
            }
        }
        if (say !== undefined && le._playMode) {
            if (!le._chatInput) fail('The play-mode chat is not available.');
            le._chatInput.value = say;
            le._submitPlayChat();
        }
        if (!le._playMode) return { playing: false, note: 'Play mode ended.' };
        le.render();
        const after = playState(le);
        if (acted) after.action = acted;
        if (notes.length) after.note = notes.join(' ');
        const jumped = Math.abs(after.body.x - before.body.x) + Math.abs(after.body.y - before.body.y) > (tiles || 0) + 3;
        if (after.level !== before.level || (direction && jumped)) {
            // A link was taken: to another level, or to another place in the same gmap.
            after.warped_from = before.member ? before.member.name : before.level;
        } else {
            after.moved = { x: round2(after.body.x - before.body.x), y: round2(after.body.y - before.body.y) };
            const distance = Math.abs(after.moved.x) + Math.abs(after.moved.y);
            if (direction && !reading && after.sign) after.note = 'The player touched a sign (or an NPC that says something) and is reading it.';
            else if (direction && !reading && tiles > 0 && distance < tiles - 0.3) {
                after.blocked = true;
                after.blocked_by = obstacleAhead(le, direction);
                if (!after.blocked_by.length && !after.stuck && !after.note) after.note = 'No blocking tile is directly ahead; an NPC or the level edge may be stopping the player.';
            }
        }
        return after;
    });

    mcp.tool({
        name: 'play_get_state',
        title: 'Play mode state',
        description: 'Where the player is in play mode: level, tile position, facing, animation, the kind of tile underfoot, the text of a sign or NPC message being read, what the player carries, and its name or chat when shown.',
        readOnly: true,
    }, async () => {
        const le = await lv.editor();
        return le._playMode && le._player ? playState(le) : { playing: false };
    });

    mcp.tool({
        name: 'play_stop',
        title: 'Stop play mode',
        description: 'Leave play mode and return to editing.',
        idempotent: true,
    }, async () => {
        const le = await lv.editor();
        if (le._playMode) le.exitPlayMode();
        if (le.level?.tilesetImage) le.render();
        return { playing: false };
    });
})();
