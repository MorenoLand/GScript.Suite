// GSuite MCP: level_check, which audits a level or gmap for the mistakes that are
// easy to make when building a world without playing it: links that lead nowhere
// or cannot be reached, arrivals inside walls, missing images, broken scripts,
// unset tiles.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;
    const h = mcp.helpers;
    const lv = h.level;

    const SIZE = lv.LEVEL_SIZE;
    // Tile types a walking player cannot enter: blocking, and throw-through (only thrown things pass).
    const blocks = type => type === 22 || type === 20;
    const MAX_PROBLEMS = 60;
    const numeric = value => /^-?\d+(\.\d+)?$/.test(String(value).trim());
    const keepsCoordinate = value => /^player[xy]$/i.test(String(value).trim());

    // The collision type of every tile of a level, as the editor's play mode sees it.
    function typeGrid(le, level) {
        const width = level.width, height = level.height, tw = level.tileWidth || 16;
        const types = new Uint8Array(width * height);
        const saved = le.level;
        le.level = level;
        try {
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) types[y * width + x] = le._getTileType(x * tw + 8, y * tw + 8);
        } finally {
            le.level = saved;
        }
        return types;
    }

    // Where a player can be. A player takes up 2x2 tiles; a place is named by the top-left
    // tile of that block. Places joined by walking get the same region number (0 = not free).
    function walkRegions(types, width, height) {
        const free = (x, y) => x >= 0 && y >= 0 && x + 1 < width && y + 1 < height
            && !blocks(types[y * width + x]) && !blocks(types[y * width + x + 1])
            && !blocks(types[(y + 1) * width + x]) && !blocks(types[(y + 1) * width + x + 1]);
        const region = new Int32Array(width * height);
        const queue = new Int32Array(width * height);
        let count = 0;
        for (let start = 0; start < width * height; start++) {
            if (region[start] || !free(start % width, Math.floor(start / width))) continue;
            count++;
            let head = 0, tail = 0;
            queue[tail++] = start;
            region[start] = count;
            while (head < tail) {
                const at = queue[head++], x = at % width, y = Math.floor(at / width);
                for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                    if (!free(nx, ny) || region[ny * width + nx]) continue;
                    region[ny * width + nx] = count;
                    queue[tail++] = ny * width + nx;
                }
            }
        }
        return { region, at: (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? region[y * width + x] : 0) };
    }

    // The regions from which a player's body touches a rectangle of tiles.
    function regionsTouching(walk, x, y, width, height) {
        const found = new Set();
        for (let by = Math.floor(y) - 1; by <= Math.ceil(y + height) - 1; by++) {
            for (let bx = Math.floor(x) - 1; bx <= Math.ceil(x + width) - 1; bx++) {
                const id = walk.at(bx, by);
                if (id) found.add(id);
            }
        }
        return found;
    }

    // Finds the open level a link points at: a level tab, or a member of an open gmap.
    function openTarget(le, name) {
        const base = String(name || '').trim().replace(/\.(nw|graal|zelda)$/i, '').toLowerCase();
        const matches = other => lv.cleanName(other).replace(/\.(nw|graal|zelda)$/i, '').toLowerCase() === base;
        for (const { entry } of lv.levelEntries(le)) {
            if (!entry.gmapGrid && matches(entry.name)) return { entry, ox: 0, oy: 0 };
        }
        for (const { entry } of lv.levelEntries(le)) {
            for (const member of lv.members(entry)) {
                if (matches(member.name)) return { entry, ox: member.cellX * SIZE, oy: member.cellY * SIZE, member: member.name };
            }
        }
        return null;
    }

    async function fileKnown(le, entry, name) {
        if (!window.__GSUITE__) return true;
        const folder = lv.entryPath(entry) ? h.path.dir(lv.entryPath(entry)) : '';
        if (folder && (await h.files.stat(h.path.join(folder, name)).catch(() => ({}))).exists) return true;
        return !!(await h.invoke('ResolvePath', name.toLowerCase()).catch(() => ''));
    }

    let bundledImages = null;
    async function imageKnown(le, name) {
        if (!window.__GSUITE__) return true;
        if (!bundledImages) bundledImages = new Set((await h.invoke('ListBundled', 'images').catch(() => [])).map(file => file.toLowerCase()));
        const key = name.toLowerCase();
        return bundledImages.has(key) || le.fileCache?.images?.has(name) || !!(await h.invoke('ResolvePath', key).catch(() => ''));
    }

    mcp.tool({
        name: 'level_check',
        title: 'Check a level or gmap for problems',
        description: 'Audit a level or gmap and list what is wrong with it, each with where it is and how to fix it. It checks links (target level exists, target position is inside the level, the link can be touched, the player arrives on free ground and can walk on from there, a link leads back), tiles (unset tiles, tiles outside the tileset, missing gmap members), objects (NPC images that do not exist, script syntax errors, duplicates, objects cut by a gmap level border, chests pointing at a missing sign). '
            + 'Run it on every level and gmap before saving, and again after fixing: a world is not finished while it reports errors. It cannot judge how things look; use level_screenshot for that.',
        input: { level: lv.LEVEL_ARG },
        readOnly: true,
        timeoutMs: 180000,
    }, async ({ level }) => {
        const le = await lv.editor();
        const picked = lv.resolve(le, level);
        const t = picked.member ? lv.resolve(le, picked.index) : picked;
        const { entry } = t;
        const lvl = t.level, width = lvl.width, height = lvl.height;
        // The tileset image decides how tile indices map to collision types.
        await lv.ensureTileset(le, lvl);
        const problems = [];
        const isGmap = !!entry.gmapGrid;

        // Positions are reported the way the tools take them: inside the member level for a gmap.
        const where = (x, y) => {
            if (!isGmap) return { level: entry.name, x, y };
            const cellX = Math.max(0, Math.min(Math.floor(x / SIZE), entry.gmapGrid[0].length - 1)), cellY = Math.max(0, Math.min(Math.floor(y / SIZE), entry.gmapGrid.length - 1));
            return { level: lv.cleanName(entry.gmapGrid[cellY]?.[cellX]) || entry.name, x: x - cellX * SIZE, y: y - cellY * SIZE };
        };
        const report = (severity, kind, x, y, problem, fix) => problems.push({ severity, kind, ...where(x, y), problem, fix });

        // ---- Tiles ----
        const image = lvl.tilesetImage;
        const tileLimit = image && image.width ? Math.floor(image.width / 16) * Math.floor(image.height / 16) : 4096;
        let unset = 0, firstUnset = null, outside = 0, firstOutside = null;
        lvl.layers.forEach((layer, index) => {
            for (let i = 0; i < layer.tiles.length; i++) {
                const tile = layer.tiles[i];
                if (tile < 0) { if (index === 0) { unset++; firstUnset = firstUnset || [i % width, Math.floor(i / width)]; } continue; }
                if (tile >= tileLimit) { outside++; firstOutside = firstOutside || [i % width, Math.floor(i / width), tile]; }
            }
        });
        if (unset) report('warning', 'tiles', firstUnset[0], firstUnset[1], `${unset} tiles on layer 0 were never set; they are drawn and saved as tile 0.`, 'Fill them with level_fill_rect (grass is tile 4031) or paint what belongs there.');
        if (outside) report('error', 'tiles', firstOutside[0], firstOutside[1], `${outside} tiles use an index that is not in the tileset image ${lvl.tilesetName} (first: ${firstOutside[2]}); they draw as nothing.`, 'Repaint them with tiles that exist (level_view_tileset shows the tileset).');
        if (isGmap) {
            for (const member of lv.members(entry)) {
                if (!member.loaded) report('error', 'gmap', member.cellX * SIZE, member.cellY * SIZE, `Member level ${member.name} is not loaded: its file was not found, so this part of the map is empty and will not be saved.`, 'Put the level file next to the .gmap and reopen it, or rebuild the gmap with gmap_from_levels.');
            }
        }

        // ---- Objects ----
        const types = typeGrid(le, lvl);
        const walk = walkRegions(types, width, height);
        const signs = lvl.objects.filter(obj => obj.type === 'sign').length;
        const seen = new Map();
        const linkRegions = [];
        for (const obj of lvl.objects) {
            const p = obj.properties || {};
            const key = `${obj.type}|${obj.x}|${obj.y}|${JSON.stringify(p)}`;
            if (seen.has(key)) report('warning', 'duplicate', obj.x, obj.y, `Two identical ${obj.type} objects are on this tile.`, `Delete one with level_delete_objects (ids ${seen.get(key)} and ${obj.id}).`);
            seen.set(key, obj.id);
            if (obj.x < 0 || obj.y < 0 || obj.x >= width || obj.y >= height) report('error', obj.type, obj.x, obj.y, `This ${obj.type} is outside the level.`, 'Move it inside with level_update_object or delete it.');

            if (obj.type === 'npc') {
                if (p.image && !await imageKnown(le, p.image)) report('error', 'npc', obj.x, obj.y, `NPC image "${p.image}" is not bundled with GSuite and not in the workspace folder, so the NPC will be invisible.`, 'Use an image that exists (app_list_bundled_files, workspace_find_files) or copy the file into the world folder (fs_copy_file) and rescan with workspace_set_directory.');
                if (!p.image && !(p.code || '').trim()) report('warning', 'npc', obj.x, obj.y, 'This NPC has no image and no script, so it does nothing.', 'Give it a script or image with level_update_object, or delete it.');
                const errors = (LevelEditor.prototype._gsLint.call(null, p.code || '') || []).filter(marker => marker.severity >= 8);
                if (errors.length) report('error', 'script', obj.x, obj.y, `The NPC's script has ${errors.length} syntax error${errors.length > 1 ? 's' : ''}: line ${errors[0].startLineNumber}: ${errors[0].message}.`, `Fix the script (level_get_object id ${obj.id}, then level_update_object) and run script_check on it.`);
            } else if (obj.type === 'chest') {
                if ((p.signIndex || 0) >= Math.max(1, signs) && signs > 0) report('warning', 'chest', obj.x, obj.y, `This chest shows sign ${p.signIndex}, but the level has only ${signs} sign${signs > 1 ? 's' : ''} (numbered from 0).`, 'Set sign_index to an existing sign with level_update_object.');
            } else if (obj.type === 'sign') {
                if (!(p.text || '').trim()) report('warning', 'sign', obj.x, obj.y, 'This sign has no text.', 'Give it text with level_update_object or delete it.');
            } else if (obj.type === 'link') {
                const w = p.width || 1, hgt = p.height || 1;
                const target = String(p.nextLevel || '').trim();
                if (obj.x + w > width || obj.y + hgt > height) report('error', 'link', obj.x, obj.y, 'This link reaches past the edge of the level.', 'Shrink or move it with level_update_object.');
                if (isGmap && (Math.floor(obj.x / SIZE) !== Math.floor((obj.x + w - 1) / SIZE) || Math.floor(obj.y / SIZE) !== Math.floor((obj.y + hgt - 1) / SIZE))) report('warning', 'link', obj.x, obj.y, 'This link lies across the border between two member levels; it is saved into the level its top-left tile is in and reaches outside that level there.', 'Keep a link inside one 64x64 level.');
                const touching = regionsTouching(walk, obj.x, obj.y, w, hgt);
                linkRegions.push({ obj, touching });
                if (!touching.size) report('error', 'link', obj.x, obj.y, `This link to ${target || '(nothing)'} can never be touched: there is no free 2x2 space for the player on or beside it (it lies inside blocking tiles).`, 'Move it onto walkable ground, e.g. the row in front of the door (level_get_walkability shows where that is).');
                if (!target) { report('error', 'link', obj.x, obj.y, 'This link has no target level.', 'Set target_level with level_update_object or delete the link.'); continue; }
                if (/\.gmap$/i.test(target)) report('error', 'link', obj.x, obj.y, `This link targets the gmap file "${target}". The game warps to levels, not gmaps.`, 'Target the member level the player should arrive in, with coordinates inside that level (0-63).');
                if (/\s/.test(target)) report('warning', 'link', obj.x, obj.y, `The target level name "${target}" contains a space, which link lines in level files cannot carry reliably.`, 'Rename the level file without spaces.');
                for (const [axis, value] of [['target_x', p.nextX], ['target_y', p.nextY]]) {
                    if (keepsCoordinate(value)) continue;
                    if (!numeric(value)) report('error', 'link', obj.x, obj.y, `${axis} is "${value}", which is not a number, "playerx" or "playery".`, `Set ${axis} with level_update_object.`);
                    else if (Number(value) < -1 || Number(value) > SIZE - 1) report('error', 'link', obj.x, obj.y, `${axis} is ${value}, outside a level (0-63).${isGmap || openTarget(le, target)?.member ? ' Targets into a gmap are given inside the member level, not in world coordinates.' : ''}`, `Set ${axis} to a position inside ${target}.`);
                }
                const destination = openTarget(le, target);
                if (!destination) {
                    if (!/\.gmap$/i.test(target) && !await fileKnown(le, entry, target)) report('error', 'link', obj.x, obj.y, `The target level "${target}" does not exist: it is not open, not next to this level's file and not in the workspace folder.`, 'Create and save that level, or correct target_level.');
                    else report('info', 'link', obj.x, obj.y, `The target level "${target}" is not open, so the arrival point could not be checked.`, `Open it with level_open and run level_check again.`);
                    continue;
                }
                if (!numeric(p.nextX) || !numeric(p.nextY)) continue;
                if ([p.nextX, p.nextY].some(value => Number(value) < -1 || Number(value) > SIZE - 1)) continue;
                // A player at position (x, y) stands on the 2x2 tiles from (x + 0.5, y + 1).
                const dLevel = destination.entry.level;
                if (destination.entry !== entry) await lv.ensureTileset(le, dLevel);
                const dTypes = destination.entry === entry ? types : typeGrid(le, dLevel);
                const dWalk = destination.entry === entry ? walk : walkRegions(dTypes, dLevel.width, dLevel.height);
                const ax = destination.ox + Number(p.nextX) + 0.5, ay = destination.oy + Number(p.nextY) + 1;
                let blocked = false;
                for (let ty = Math.floor(ay); ty <= Math.ceil(ay + 2) - 1; ty++) for (let tx = Math.floor(ax); tx <= Math.ceil(ax + 2) - 1; tx++) {
                    if (tx < 0 || ty < 0 || tx >= dLevel.width || ty >= dLevel.height || blocks(dTypes[ty * dLevel.width + tx])) blocked = true;
                }
                const arriveName = destination.member || destination.entry.name;
                if (blocked) {
                    report('error', 'link', obj.x, obj.y, `The player arrives in ${arriveName} inside something solid: position ${p.nextX},${p.nextY} puts its 2x2 body on tiles ${ax - destination.ox},${ay - destination.oy}, which are blocked.`, `Pick a free 2x2 block next to the door there (level_get_walkability on ${arriveName}); for a block whose top-left tile is (c, r) the target is (c - 0.5, r - 1).`);
                    continue;
                }
                const here = lv.cleanName(entry.name).replace(/\.(nw|graal|zelda|gmap)$/i, '').toLowerCase();
                const leadsBack = other => {
                    const name = String(other.properties?.nextLevel || '').replace(/\.(nw|graal|zelda)$/i, '').toLowerCase();
                    return name === here || lv.members(entry).some(member => member.name.replace(/\.(nw|graal|zelda)$/i, '').toLowerCase() === name);
                };
                const inArrivalLevel = other => !destination.member || (other.x >= destination.ox && other.x < destination.ox + SIZE && other.y >= destination.oy && other.y < destination.oy + SIZE);
                const exits = dLevel.objects.filter(other => other.type === 'link' && other !== obj && inArrivalLevel(other));
                const onLink = exits.find(other => ax < other.x + (other.properties?.width || 1) + 0.01 && ax + 2 > other.x - 0.01 && ay < other.y + (other.properties?.height || 1) + 0.01 && ay + 2 > other.y - 0.01);
                if (onLink) report('warning', 'link', obj.x, obj.y, `The player arrives in ${arriveName} touching the link at ${onLink.x - destination.ox},${onLink.y - destination.oy} there, and may be warped straight on.`, 'Move the target a tile or two away from that link, further into the level.');
                if (destination.entry !== entry) {
                    const back = exits.filter(leadsBack);
                    if (!back.length) report('warning', 'link', obj.x, obj.y, `Nothing in ${arriveName} leads back here: a player who takes this link cannot return.`, `Add a link in ${arriveName} that targets ${where(obj.x, obj.y).level}.`);
                    else {
                        const arrivalRegion = dWalk.at(Math.round(ax), Math.round(ay)) || dWalk.at(Math.floor(ax), Math.floor(ay)) || dWalk.at(Math.ceil(ax), Math.ceil(ay));
                        const reachable = back.some(other => regionsTouching(dWalk, other.x, other.y, other.properties?.width || 1, other.properties?.height || 1).has(arrivalRegion));
                        if (!reachable) report('error', 'link', obj.x, obj.y, `After arriving in ${arriveName} the player cannot walk to the link that leads back: walls or furniture are in the way.`, `Clear a path at least 2 tiles wide between the arrival point and that link (level_get_walkability on ${arriveName}), or move one of them.`);
                    }
                }
            }
        }

        const order = { error: 0, warning: 1, info: 2 };
        problems.sort((a, b) => order[a.severity] - order[b.severity]);
        const count = severity => problems.filter(item => item.severity === severity).length;
        const result = {
            level: entry.name,
            kind: isGmap ? 'gmap' : 'level',
            checked: { tiles: width * height * lvl.layers.length, objects: lvl.objects.length, links: linkRegions.length },
            errors: count('error'),
            warnings: count('warning'),
            saved: !entry.modified && !!lv.entryPath(entry),
            problems: problems.slice(0, MAX_PROBLEMS),
        };
        if (problems.length > MAX_PROBLEMS) result.more_problems = problems.length - MAX_PROBLEMS;
        if (!result.errors && !result.warnings) result.verdict = 'No problems found. Check how it looks with level_screenshot, and walk the important routes in play mode.';
        else if (!result.errors) result.verdict = `No errors, ${result.warnings} warning${result.warnings === 1 ? '' : 's'}. Read each warning and fix it unless it is what you intend.`;
        else result.verdict = `${result.errors} error${result.errors === 1 ? '' : 's'} and ${result.warnings} warning${result.warnings === 1 ? '' : 's'}. Fix the errors, then run level_check again.`;
        return result;
    });
})();
