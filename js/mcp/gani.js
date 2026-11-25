// GSuite MCP: tools for the gani (animation) editor: opening and creating .gani
// files, editing sprites, frames and settings, and rendering frames so an agent
// can see the animation it is building.
//
// The gani editor keeps its state in globals of js/anieditor.js (animations,
// currentAnimation, currentFrame, ...); these tools read and assign them by name.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;
    const h = mcp.helpers;

    const DIRECTIONS = ['up', 'left', 'down', 'right'];
    const SOURCE_TYPES = /^(SPRITES|PICS|HEAD|BODY|SWORD|SHIELD|HORSE|ATTR([1-9]|[12][0-9]|30)|PARAM([1-9]|[12][0-9]|30))$/;
    const FALLBACK_IMAGES = { SHIELD: 'shield1.png', SWORD: 'sword1.png', HEAD: 'head19.png', BODY: 'body.png', HORSE: 'ride.png', PICS: 'pics1.png', SPRITES: 'sprites.png' };
    const GANI_ARG = S.string('Animation to act on: its file name or its index from app_get_state. Defaults to the active animation.');
    const TICK_MS = 50;
    const MOVIE_VIEW = S.object({ x: S.number('Left edge in the movie\'s pixels'), y: S.number('Top edge'), width: S.number('Width', { minimum: 8, maximum: 2000 }), height: S.number('Height', { minimum: 8, maximum: 2000 }) }, ['x', 'y', 'width', 'height'], 'The part of the scene to show, in the movie\'s pixels; defaults to a box around everything visible in the frames shown');

    async function ready() {
        await h.waitFor(() => typeof parseGani === 'function' && typeof addTab === 'function' && typeof animations !== 'undefined', 15000, 'the gani editor to load');
        // The editor restores its last session while starting; wait for that so it cannot replace what we open.
        const started = Date.now();
        while (typeof window.refreshCustomDropdown !== 'function' && Date.now() - started < 5000) await h.sleep(25);
    }

    function resolve(ref) {
        if (!animations.length) fail('No animation is open. Create one with gani_new or open one with gani_open.');
        if (ref === undefined || ref === null || ref === '') return currentAnimation || animations[animations.length - 1];
        const text = String(ref), lower = h.path.normalize(text).toLowerCase();
        const found = (/^\d+$/.test(text) && animations[Number(text)])
            || animations.find(ani => (ani.fileName || '').toLowerCase() === lower)
            || animations.find(ani => h.path.normalize(ani.fullPath || '').toLowerCase() === lower)
            || animations.find(ani => h.path.stem(ani.fileName || '').toLowerCase() === lower);
        return found || fail(`No open animation matches "${ref}". Open animations: ${animations.map((ani, index) => `${index}: ${ani.fileName}`).join(', ')}.`);
    }

    const tabFor = ani => window.tabManager?._tabs.find(tab => tab.type === 'gani' && tab.data?.ani === ani) || null;

    // Makes the animation the one the editor is showing; undo and the panels work on that one.
    function activate(ani) {
        if (currentAnimation === ani) return;
        const tab = tabFor(ani);
        if (tab) window.tabManager.switchTo(tab.id);
        if (currentAnimation !== ani) switchTab(animations.indexOf(ani));
    }

    function refresh() {
        _spriteCompositeCache.clear();
        for (const update of [updateSpritesList, updateFrameInfo, updateItemsCombo, updateAnimationSettings, updateDefaultsTable, redraw]) {
            try { update(); } catch (error) { console.warn('[mcp] gani refresh', error); }
        }
    }

    function markUnsaved(ani, unsaved) {
        ani.modified = unsaved;
        const tab = tabFor(ani);
        if (tab) window.tabManager.markDirty(tab.id, unsaved);
        saveSession(true);
    }

    // Runs an edit of the active animation as one undo step.
    function edit(ani, description, change) {
        activate(ani);
        const oldState = serializeAnimationState();
        let out;
        try {
            out = change();
        } catch (error) {
            // Nothing of a change that could not be finished is kept.
            restoreAnimationState(oldState);
            refresh();
            throw error;
        }
        if (currentFrame >= ani.frames.length) currentFrame = Math.max(0, ani.frames.length - 1);
        const newState = serializeAnimationState();
        addUndoCommand({ description, oldState, newState, undo: () => restoreAnimationState(oldState), redo: () => restoreAnimationState(newState) });
        refresh();
        markUnsaved(ani, true);
        return out;
    }

    // Lets the editor's drawing code, which reads the active animation, draw another one.
    function drawingAs(ani, frameIndex, draw) {
        const saved = { animation: currentAnimation, frame: currentFrame };
        currentAnimation = ani;
        if (frameIndex !== undefined) currentFrame = frameIndex;
        try { return draw(); } finally { currentAnimation = saved.animation; currentFrame = saved.frame; }
    }

    function imageNameOf(ani, sprite) {
        if (sprite.type === 'CUSTOM') return sprite.customImageName;
        return ani.getDefaultImageName(sprite.type) || FALLBACK_IMAGES[sprite.type] || '';
    }

    async function loadNamedImage(name) {
        const key = name.toLowerCase();
        if (imageLibrary.has(key)) return true;
        await Promise.resolve(loadImageFromUrl('images/' + name, key)).catch(() => null);
        if (imageLibrary.has(key)) return true;
        if (window.__GSUITE__) {
            const found = (typeof workspacePathIndex !== 'undefined' && workspacePathIndex.get(key)) || await h.invoke('ResolvePath', key).catch(() => '');
            if (found) await Promise.resolve(loadImageFromPath(found, name)).catch(() => null);
        }
        return imageLibrary.has(key);
    }

    // Loads every image the animation draws from and returns the names that could not be found.
    async function loadImages(ani) {
        const names = new Set();
        for (const sprite of ani.sprites.values()) {
            const name = imageNameOf(ani, sprite);
            if (name && !/^no-[a-z0-9_-]+\.png$/i.test(name)) names.add(name);
        }
        const missing = [];
        for (const name of names) if (!await loadNamedImage(name)) missing.push(name);
        _spriteCompositeCache.clear();
        return missing;
    }

    function directionIndex(ani, direction) {
        if (ani.singleDir) return 0;
        const index = DIRECTIONS.indexOf(direction);
        return index < 0 ? 2 : index;
    }

    function describeSprite(sprite) {
        const out = {
            index: sprite.index,
            source: sprite.type === 'CUSTOM' ? sprite.customImageName : sprite.type,
            x: sprite.left, y: sprite.top, width: sprite.width, height: sprite.height,
        };
        if (sprite.comment) out.comment = sprite.comment;
        if (sprite.rotation) out.rotation = sprite.rotation;
        if (sprite._zoom !== 1) out.zoom = sprite._zoom;
        if (sprite.xscale !== 1) out.stretch_x = sprite.xscale;
        if (sprite.yscale !== 1) out.stretch_y = sprite.yscale;
        if (sprite.colorEffectEnabled) out.color = [sprite.colorEffect.r, sprite.colorEffect.g, sprite.colorEffect.b, sprite.colorEffect.a];
        if (sprite.mode !== undefined) out.mode = sprite.mode;
        if (sprite.attachedSprites.length) out.attachments = sprite.attachedSprites.map((item, index) => ({ sprite: item.index, x: item.offset.x, y: item.offset.y, behind: index < sprite.m_drawIndex }));
        return out;
    }

    const describePiece = piece => ({ sprite: piece.spriteIndex === SPRITE_INDEX_STRING ? piece.spriteName : piece.spriteIndex, x: piece.xoffset, y: piece.yoffset });
    // A piece may name its sprite instead of numbering it; the name is looked up among the sprites' image names when drawn.
    const SPRITE_REF = { type: ['integer', 'string'], description: 'Sprite index; or a name, for a piece that refers to its sprite by name (kept as a name in the file)' };

    function describeFrame(ani, frame, index) {
        const out = { frame: index, duration_ms: frame.duration, pieces: {} };
        if (ani.singleDir) out.pieces.all = frame.pieces[0].map(describePiece);
        else DIRECTIONS.forEach((name, dir) => { out.pieces[name] = frame.pieces[dir].map(describePiece); });
        if (frame.sounds.length) out.sounds = frame.sounds.map(sound => ({ file: sound.fileName, x: sound.xoffset / 16, y: sound.yoffset / 16, tick: sound.tag }));
        return out;
    }

    function describe(ani) {
        const defaults = {};
        for (const [key, value] of ani.defaultImages) defaults[key] = value;
        const info = {
            name: ani.fileName,
            index: animations.indexOf(ani),
            path: h.path.isAbsolute(ani.fullPath) ? ani.fullPath : '',
            unsaved: !!ani.modified,
            active: ani === currentAnimation,
            mode: ani.isMovieMode ? 'movie' : 'animation',
            directions: ani.singleDir ? 1 : 4,
            loop: ani.looped,
            continuous: ani.continous,
            set_back_to: ani.nextAni || '',
            antialias: !!ani.antialias,
            rotate_projectile: !!ani.rotateProjectile,
            defaults,
            sprites: ani.sprites.size,
            frames: ani.frames.length,
            duration_ms: ani.frames.reduce((total, frame) => total + frame.duration, 0),
            has_script: !!ani.script,
        };
        if (ani.hasLayer) info.layer = ani.layer;
        if (ani.isMovieMode) info.movie = { length_frames: ani.frameCount, tracks: ani.movieItems.map(item => ({ name: item.name, kind: item.kind, keys: item.frames.size })) };
        return info;
    }

    function open(ani, name, fullPath) {
        if (animations.some(other => (other.fileName || '').toLowerCase() === name.toLowerCase())) fail(`An animation named "${name}" is already open. Close it first, or use another name.`);
        ani.fileName = name;
        if (fullPath) ani.fullPath = fullPath;
        addTab(ani, name);
        const tab = tabFor(ani);
        if (tab) window.tabManager.switchTo(tab.id); else window.switchToTab('gani');
        return ani;
    }

    function checkText(text) {
        if (/[\x00-\x08\x0e-\x1f]/.test(text.substring(0, 256))) fail('This is not a readable .gani file (it may be encrypted or binary).');
        // Older files leave out the GANI0001 header, so recognise the format by its content as well.
        if (!/^GANI0/.test(text.trimStart()) && !/^\s*(SPRITE\s|ANI\s*$|MOVIE\s*$)/m.test(text)) fail('This does not look like a .gani file: it has no GANI0001 header, SPRITE lines or ANI block. See the guide "gani-format".');
    }

    // ---- Opening, creating, saving ----------------------------------------------------------

    mcp.tool({
        name: 'gani_new',
        title: 'Create an animation',
        description: 'Create a new .gani animation and show it in the gani editor. It starts like the editor\'s own "New": the standard default images (sprites.png, head, body, sword, shield), a shadow sprite, and one frame. Then add sprites with gani_set_sprites and frames with gani_set_frames, or write the whole thing with gani_set_text. The quickest way to learn the format is to open a bundled animation (gani_open with bundled: "walk.gani") and read it with gani_get_text.',
        input: {
            name: S.string('File name, e.g. "wave.gani"'),
            single_direction: S.boolean('One set of pieces per frame instead of four directions (for effects and objects)', { default: false }),
            loop: S.boolean('Loop the animation', { default: false }),
            movie: S.boolean('Create a movie (a cutscene: a timeline with actors, texts, sprites and sounds placed by keyframes) instead of a sprite animation. Continue with gani_set_movie and gani_set_movie_keys', { default: false }),
            frames: S.integer('For a movie: its length in frames (ticks of 50 ms)', { default: 100, minimum: 1, maximum: 6000 }),
        },
        required: ['name'],
    }, async ({ name, single_direction, loop, movie, frames }) => {
        await ready();
        if (!/\.gani$/i.test(name)) name += '.gani';
        if (movie) {
            const ani = newAnimation();
            ani.isMovieMode = true;
            ani.looped = loop;
            ani.frameCount = frames;
            open(ani, name);
            drawingAs(ani, undefined, () => ensureMovieFrames(ani));
            markUnsaved(ani, true);
            refresh();
            return { created: describe(ani), next: 'Add actors, texts, sprites and sounds with gani_set_movie, place them with gani_set_movie_keys, and look at the result with gani_render_movie.' };
        }
        const ani = new Animation();
        for (const [key, value] of Object.entries({ SPRITES: 'sprites.png', PICS: 'pics1.png', HEAD: 'head19.png', BODY: 'body.png', SWORD: 'sword1.png', SHIELD: 'shield1.png' })) ani.setDefaultImage(key, value);
        const shadow = new AniSprite();
        Object.assign(shadow, { index: 0, type: 'SPRITES', left: 0, top: 0, width: 24, height: 12, comment: 'shadow' });
        shadow.updateBoundingBox();
        ani.addSprite(shadow);
        ani.singleDir = single_direction;
        ani.looped = loop;
        const frame = new Frame();
        for (let dir = 0; dir < (single_direction ? 1 : 4); dir++) {
            const piece = new FramePieceSprite();
            Object.assign(piece, { spriteIndex: 0, xoffset: 12, yoffset: dir % 2 === 0 ? 34 : 36 });
            frame.pieces[dir].push(piece);
        }
        ani.frames.push(frame);
        open(ani, name);
        markUnsaved(ani, true);
        return { created: describe(ani) };
    });

    mcp.tool({
        name: 'gani_open',
        title: 'Open an animation',
        description: 'Open a .gani file in the gani editor: from disk by absolute path, or one of the animations bundled with GSuite by name (idle.gani, walk.gani, sword.gani, sit.gani, ... the classic player animations, useful as references). Call with neither argument to list the bundled ones.',
        input: {
            path: S.string('Absolute path of a .gani file'),
            bundled: S.string('Name of a bundled animation, e.g. "walk.gani"'),
        },
        openWorld: true,
    }, async ({ path: target, bundled }) => {
        await ready();
        if (!target && !bundled) {
            const names = await fetch('ganis/index.json').then(response => response.json()).catch(() => []);
            return { bundled: Array.isArray(names) ? names : names.files || [] };
        }
        let text, name, fullPath = '';
        if (target) {
            h.requireAbsolute(target, 'path');
            const existing = animations.find(ani => h.path.normalize(ani.fullPath || '').toLowerCase() === h.path.normalize(target).toLowerCase());
            if (existing) { activate(existing); return { opened: describe(existing), already_open: true }; }
            const info = await h.files.stat(target);
            if (!info.exists || info.isDir) fail(`No such file: ${target}`);
            text = await h.files.readText(target);
            name = h.path.base(target);
            fullPath = target;
        } else {
            name = /\.gani$/i.test(bundled) ? bundled : bundled + '.gani';
            const response = await fetch('ganis/' + name);
            if (!response.ok) fail(`No bundled animation "${name}". Call gani_open with no arguments to list them.`);
            text = await response.text();
        }
        checkText(text);
        const ani = open(parseGani(text), name, fullPath);
        const missing = await loadImages(ani);
        refresh();
        return { opened: describe(ani), missing_images: missing.length ? missing : undefined };
    });

    mcp.tool({
        name: 'gani_open_text',
        title: 'Open an animation from text',
        description: 'Open an animation given as .gani text, e.g. one you wrote yourself. It opens unsaved; use gani_save to write it.',
        input: { name: S.string('File name, e.g. "explosion.gani"'), text: S.string('The .gani text, starting with GANI0001') },
        required: ['name', 'text'],
    }, async ({ name, text }) => {
        await ready();
        if (!/\.gani$/i.test(name)) name += '.gani';
        checkText(text);
        const ani = open(parseGani(text.replace(/\r\n/g, '\n')), name);
        markUnsaved(ani, true);
        const missing = await loadImages(ani);
        refresh();
        return { opened: describe(ani), missing_images: missing.length ? missing : undefined };
    });

    mcp.tool({
        name: 'gani_get_info',
        title: 'Describe an animation',
        description: 'Settings and size of an animation: directions, loop flags, default images, number of sprites and frames, total duration.',
        input: { gani: GANI_ARG },
        readOnly: true,
    }, async ({ gani }) => { await ready(); return describe(resolve(gani)); });

    mcp.tool({
        name: 'gani_get_text',
        title: 'Get an animation as .gani text',
        description: 'The animation in the .gani text format: every sprite definition, setting, frame and sound. This is the complete picture of an animation and the easiest thing to learn the format from.',
        input: { gani: GANI_ARG },
        readOnly: true,
    }, async ({ gani }) => { await ready(); return saveGani(resolve(gani)); });

    mcp.tool({
        name: 'gani_set_text',
        title: 'Replace an animation with .gani text',
        description: 'Replace the whole content of an open animation with new .gani text. Use it for edits the other tools do not cover (movie-mode tracks, effect lines) or to rewrite an animation in one go. Take the current text from gani_get_text, change it, and send it back. One undo step for sprites and frames.',
        input: { gani: GANI_ARG, text: S.string('The complete new .gani text, starting with GANI0001') },
        required: ['text'],
    }, async ({ gani, text }) => {
        await ready();
        const ani = resolve(gani);
        checkText(text);
        const parsed = parseGani(text.replace(/\r\n/g, '\n'));
        edit(ani, 'Replace animation', () => {
            for (const key of ['script', 'nextAni', 'looped', 'singleDir', 'continous', 'layer', 'hasLayer', 'antialias', 'rotateProjectile', 'sprites', 'frames', 'isMovieMode', 'frameCount', 'movieItems', 'defaultImages', 'nextSpriteIndex']) ani[key] = parsed[key];
            if (ani.singleDir) currentDir = 0;
        });
        const missing = await loadImages(ani);
        refresh();
        return { updated: describe(ani), missing_images: missing.length ? missing : undefined };
    });

    mcp.tool({
        name: 'gani_save',
        title: 'Save an animation',
        description: 'Write an animation to disk as a .gani file. Give a path the first time; later saves reuse it.',
        input: { gani: GANI_ARG, path: S.string('Absolute path ending in .gani. Omit to save where it was opened from or last saved.') },
        idempotent: true,
        openWorld: true,
    }, async ({ gani, path: target }) => {
        await ready();
        const ani = resolve(gani);
        target = target || (h.path.isAbsolute(ani.fullPath) ? ani.fullPath : '');
        if (!target) fail(`${ani.fileName} has never been saved. Pass an absolute path, e.g. "<folder>/${ani.fileName}".`);
        h.requireAbsolute(target, 'path');
        if (h.path.ext(target) !== 'gani') fail(`Save an animation to a path ending in .gani; got "${target}".`);
        await h.files.write(target, saveGani(ani)).catch(error => fail(`Could not save ${ani.fileName}: ${error.message || error}`));
        ani.fullPath = target;
        ani.fileName = h.path.base(target);
        const tab = tabFor(ani);
        if (tab) window.tabManager.renameTab(tab.id, ani.fileName);
        markUnsaved(ani, false);
        try { updateTabs(); updateGaniTitle(); } catch (error) { console.warn('[mcp] gani title', error); }
        return { saved: ani.fileName, path: target };
    });

    mcp.tool({
        name: 'gani_close',
        title: 'Close an animation',
        description: 'Close an animation tab. Unsaved changes are only discarded when discard_changes is true.',
        input: { gani: GANI_ARG, discard_changes: S.boolean('Close even with unsaved changes', { default: false }) },
        destructive: true,
    }, async ({ gani, discard_changes }) => {
        await ready();
        const ani = resolve(gani);
        if (ani.modified && !discard_changes) fail(`${ani.fileName} has unsaved changes. Save it with gani_save, or pass discard_changes: true.`);
        ani.modified = false;
        const tab = tabFor(ani);
        if (tab) { tab.dirty = false; window.tabManager._doRemove(tab.id); }
        else closeTab(animations.indexOf(ani));
        return { closed: ani.fileName, open_animations: animations.map(other => other.fileName) };
    });

    mcp.tool({
        name: 'gani_undo',
        title: 'Undo or redo in an animation',
        description: 'Undo the last edit to an animation\'s sprites or frames, or redo it. Changes to settings (gani_set_properties: loop, defaults, script, ...) are not part of the undo history.',
        input: { gani: GANI_ARG, redo: S.boolean('Redo instead of undo', { default: false }) },
    }, async ({ gani, redo: again }) => {
        await ready();
        const ani = resolve(gani);
        activate(ani);
        const before = saveGani(ani);
        // The editor's snapshots also hold these settings, which are not edits to undo.
        const settings = { layer: ani.layer, hasLayer: ani.hasLayer, antialias: ani.antialias, rotateProjectile: ani.rotateProjectile };
        if (again) redo(); else undo();
        Object.assign(ani, settings);
        refresh();
        const changed = saveGani(ani) !== before;
        if (changed) markUnsaved(ani, true);
        return { gani: ani.fileName, [again ? 'redone' : 'undone']: changed, frames: ani.frames.length, sprites: ani.sprites.size };
    });

    // ---- Settings, sprites, frames ----------------------------------------------------------

    mcp.tool({
        name: 'gani_set_properties',
        title: 'Change animation settings',
        description: 'Change an animation\'s settings; only the fields you give are changed. `defaults` sets default images by slot (HEAD, BODY, SWORD, SHIELD, SPRITES, PICS, HORSE, ATTR1-30, PARAM1-30): sprites whose source is that slot draw from the image, so a player animation shows whatever head or body the player has. Turning single_direction off copies each frame\'s pieces to all four directions; turning it on keeps the "up" pieces; either clears the animation\'s undo history. Settings are not covered by gani_undo.',
        input: {
            gani: GANI_ARG,
            loop: S.boolean('LOOP: restart when the last frame ends'),
            continuous: S.boolean('CONTINUOUS: do not restart when the same animation is set again'),
            single_direction: S.boolean('SINGLEDIRECTION: one set of pieces per frame instead of four'),
            set_back_to: S.string('SETBACKTO: animation to switch to when this one ends, e.g. "idle"; empty to clear'),
            layer: S.integer('LAYER the animation draws on'),
            antialias: S.boolean('ANTIALIAS: a flag for the game client, written into the file; the editor draws the same either way'),
            rotate_projectile: S.boolean('ROTATEPROJECTILE: a flag for the game client, written into the file; the editor draws the same either way'),
            defaults: S.object({}, [], 'Default images by slot, e.g. {"HEAD": "head3.png", "ATTR1": "hat1.png"}; an empty string removes one'),
            script: S.string('GraalScript run with the animation (the SCRIPT block); empty to remove'),
        },
    }, async ({ gani, loop, continuous, single_direction, set_back_to, layer, antialias, rotate_projectile, defaults, script }) => {
        await ready();
        const ani = resolve(gani);
        const badSlots = Object.keys(defaults || {}).filter(key => !SOURCE_TYPES.test(key.toUpperCase()));
        if (badSlots.length) fail(`${badSlots.join(', ')} is not a default image slot. Slots: SPRITES, PICS, HEAD, BODY, SWORD, SHIELD, HORSE, ATTR1-30, PARAM1-30.`);
        if (single_direction !== undefined && ani.isMovieMode) fail('A movie has no directions to change.');
        // Settings are not part of the editor's undo snapshots, so they are applied outside it.
        activate(ani);
        const converted = single_direction !== undefined && single_direction !== ani.singleDir;
        (() => {
            if (loop !== undefined) ani.looped = loop;
            if (continuous !== undefined) ani.continous = continuous;
            if (antialias !== undefined) ani.antialias = antialias;
            if (rotate_projectile !== undefined) ani.rotateProjectile = rotate_projectile;
            if (single_direction !== undefined && single_direction !== ani.singleDir) {
                // The file format cannot hold a frame with an empty direction, so going to four
                // directions gives each the pieces the single one had.
                for (const frame of ani.frames) {
                    for (let dir = 1; dir < 4; dir++) frame.pieces[dir] = single_direction ? [] : frame.pieces[0].map(piece => piece.duplicate());
                }
                ani.singleDir = single_direction;
                if (single_direction) currentDir = 0;
            }
            if (set_back_to !== undefined) ani.nextAni = set_back_to;
            if (layer !== undefined) { ani.layer = layer; ani.hasLayer = true; }
            if (script !== undefined) ani.script = script.replace(/\r\n/g, '\n');
            for (const [key, value] of Object.entries(defaults || {})) {
                if (value === '') ani.defaultImages.delete(key.toUpperCase());
                else ani.setDefaultImage(key, String(value));
            }
        })();
        if (converted) {
            // Earlier snapshots hold frames laid out for the other number of directions.
            ani.undoStack = [];
            ani.undoIndex = -1;
            try { updateHistoryMenu(); saveUndoStack(); } catch (error) { console.warn('[mcp] gani history', error); }
        }
        const missing = defaults ? await loadImages(ani) : [];
        refresh();
        markUnsaved(ani, true);
        return { updated: describe(ani), missing_images: missing.length ? missing : undefined };
    });

    mcp.tool({
        name: 'gani_list_sprites',
        title: 'List sprites',
        description: 'The sprite definitions of an animation: each is a rectangle of an image, identified by an index that frames refer to. `source` is either an image file name or a default slot (SPRITES, HEAD, BODY, SWORD, SHIELD, ...).',
        input: { gani: GANI_ARG },
        readOnly: true,
    }, async ({ gani }) => {
        await ready();
        const ani = resolve(gani);
        return { gani: ani.fileName, sprites: [...ani.sprites.values()].sort((a, b) => a.index - b.index).map(describeSprite) };
    });

    const SPRITE_FIELDS = {
        index: S.integer('Sprite index; an existing index is updated, a new one is created. Omit to use the next free index.', { minimum: 0 }),
        source: S.string('Image file name (e.g. "myfx.png"), or a default slot: SPRITES, PICS, HEAD, BODY, SWORD, SHIELD, HORSE, ATTR1-30, PARAM1-30'),
        x: S.integer('Left edge of the rectangle in the image, in pixels', { minimum: 0 }),
        y: S.integer('Top edge of the rectangle in the image, in pixels', { minimum: 0 }),
        width: S.integer('Width in pixels', { minimum: 1 }),
        height: S.integer('Height in pixels', { minimum: 1 }),
        comment: S.string('Name for the sprite, shown in the editor'),
        rotation: S.number('Rotation in degrees'),
        zoom: S.number('Uniform scale (1 = normal)'),
        stretch_x: S.number('Horizontal stretch (1 = normal, -1 mirrors)'),
        stretch_y: S.number('Vertical stretch (1 = normal, -1 flips)'),
        color: S.array(S.number({ minimum: 0, maximum: 255 }), 'Colour effect [red, green, blue, alpha], each 0-255; an empty array removes it'),
        mode: S.integer('Blend mode: 0 additive (light), 1 translucent, 2 subtract; omit for normal'),
        attachments: S.array(S.object({ sprite: S.integer('Index of the attached sprite'), x: S.number('Offset x'), y: S.number('Offset y'), behind: S.boolean('Draw behind this sprite', { default: false }) }, ['sprite', 'x', 'y']), 'Sprites drawn together with this one'),
    };

    mcp.tool({
        name: 'gani_set_sprites',
        title: 'Add or change sprites',
        description: 'Create sprite definitions or update existing ones (matched by index). A new sprite needs source, x, y, width and height; when updating, only the fields you give change. Returns the sprites it created or changed with their indices, which frames use to place them. An attachment is {"sprite": index, "x": offset, "y": offset, "behind": false}.',
        input: { gani: GANI_ARG, sprites: S.array(S.object(SPRITE_FIELDS, []), 'Sprites to create or update') },
        required: ['sprites'],
    }, async ({ gani, sprites }) => {
        await ready();
        const ani = resolve(gani);
        sprites.forEach((item, position) => {
            const existing = item.index !== undefined && ani.sprites.has(item.index);
            if (!existing) for (const key of ['source', 'x', 'y', 'width', 'height']) if (item[key] === undefined) fail(`sprites[${position}] is a new sprite and needs ${key}.`);
            if (item.color && item.color.length && item.color.length !== 4) fail(`sprites[${position}].color needs four numbers: red, green, blue, alpha.`);
        });
        const changed = edit(ani, 'Set sprites', () => sprites.map(item => {
            let sprite = item.index !== undefined ? ani.sprites.get(item.index) : null;
            if (!sprite) {
                sprite = new AniSprite();
                sprite.index = item.index ?? ani.nextSpriteIndex;
                ani.addSprite(sprite);
            }
            if (item.source !== undefined) {
                const slot = item.source.toUpperCase();
                if (SOURCE_TYPES.test(slot)) { sprite.type = slot; sprite.customImageName = ''; }
                else { sprite.type = 'CUSTOM'; sprite.customImageName = item.source; }
            }
            if (item.x !== undefined) sprite.left = item.x;
            if (item.y !== undefined) sprite.top = item.y;
            if (item.width !== undefined) sprite.width = item.width;
            if (item.height !== undefined) sprite.height = item.height;
            if (item.comment !== undefined) sprite.comment = item.comment;
            if (item.rotation !== undefined) sprite.rotation = item.rotation;
            if (item.zoom !== undefined) sprite._zoom = item.zoom;
            if (item.stretch_x !== undefined) sprite.xscale = item.stretch_x;
            if (item.stretch_y !== undefined) sprite.yscale = item.stretch_y;
            if (item.mode !== undefined) sprite.mode = item.mode;
            if (item.color !== undefined) {
                sprite.colorEffectEnabled = item.color.length === 4;
                if (sprite.colorEffectEnabled) sprite.colorEffect = { r: item.color[0], g: item.color[1], b: item.color[2], a: item.color[3] };
            }
            if (item.attachments !== undefined) {
                const ordered = [...item.attachments.filter(a => a.behind), ...item.attachments.filter(a => !a.behind)];
                sprite.attachedSprites = ordered.map(a => ({ index: a.sprite, offset: { x: a.x, y: a.y } }));
                sprite.m_drawIndex = item.attachments.filter(a => a.behind).length;
            }
            sprite.updateBoundingBox();
            return sprite.index;
        }));
        const missing = await loadImages(ani);
        refresh();
        return { gani: ani.fileName, sprites: changed.map(index => describeSprite(ani.sprites.get(index))), missing_images: missing.length ? missing : undefined };
    });

    mcp.tool({
        name: 'gani_delete_sprites',
        title: 'Delete sprites',
        description: 'Delete sprite definitions by index, along with every placement of them in the frames.',
        input: { gani: GANI_ARG, indices: S.array(S.integer({ minimum: 0 }), 'Indices of the sprites to delete') },
        required: ['indices'],
        destructive: true,
    }, async ({ gani, indices }) => {
        await ready();
        const ani = resolve(gani);
        const unknown = indices.filter(index => !ani.sprites.has(index));
        if (unknown.length) fail(`${ani.fileName} has no sprite ${unknown.join(', ')}. Call gani_list_sprites for the indices.`);
        // A piece that names its sprite counts as placed on the sprite the name resolves to.
        const spriteOf = piece => piece.spriteIndex === SPRITE_INDEX_STRING ? ani.getAniSprite(SPRITE_INDEX_STRING, piece.spriteName)?.index : piece.spriteIndex;
        // A direction left with nothing in it cannot be written to a .gani file.
        const emptied = [];
        ani.frames.forEach((frame, frameIndex) => {
            for (let dir = 0; dir < (ani.singleDir ? 1 : 4); dir++) {
                if (frame.pieces[dir].length && frame.pieces[dir].every(piece => indices.includes(spriteOf(piece)))) emptied.push(`frame ${frameIndex} ${ani.singleDir ? '' : DIRECTIONS[dir]}`.trim());
            }
        });
        if (emptied.length && !ani.isMovieMode) fail(`Deleting ${indices.length > 1 ? 'these sprites' : 'this sprite'} would leave nothing placed in ${emptied.slice(0, 6).join(', ')}${emptied.length > 6 ? ` and ${emptied.length - 6} more` : ''}. Put something else there with gani_set_frames first, or delete those frames.`);
        let removed = 0;
        edit(ani, 'Delete sprites', () => {
            for (const frame of ani.frames) frame.pieces = frame.pieces.map(list => list.filter(piece => { const gone = indices.includes(spriteOf(piece)); if (gone) removed++; return !gone; }));
            for (const index of indices) ani.sprites.delete(index);
            for (const sprite of ani.sprites.values()) sprite.attachedSprites = sprite.attachedSprites.filter(item => !indices.includes(item.index));
            if (typeof editingSprite !== 'undefined' && editingSprite && indices.includes(editingSprite.index)) editingSprite = null;
        });
        return { gani: ani.fileName, deleted: indices.length, placements_removed: removed, sprites: ani.sprites.size };
    });

    mcp.tool({
        name: 'gani_get_frames',
        title: 'Read frames',
        description: 'The frames of an animation: for each, its duration and the sprites placed in each direction (up, left, down, right; "all" for a single-direction animation) with their pixel offsets, plus any sounds.',
        input: {
            gani: GANI_ARG,
            from: S.integer('First frame to return (0-based)', { default: 0, minimum: 0 }),
            count: S.integer('How many frames', { default: 20, minimum: 1, maximum: 200 }),
        },
        readOnly: true,
    }, async ({ gani, from, count }) => {
        await ready();
        const ani = resolve(gani);
        if (from >= ani.frames.length) fail(`${ani.fileName} has frames 0-${ani.frames.length - 1}; got ${from}.`);
        return { gani: ani.fileName, total_frames: ani.frames.length, frames: ani.frames.slice(from, from + count).map((frame, offset) => describeFrame(ani, frame, from + offset)) };
    });

    const PIECES = S.array(S.object({ sprite: SPRITE_REF, x: S.number('Offset x in pixels'), y: S.number('Offset y in pixels') }, ['sprite', 'x', 'y']));
    const FRAME_FIELDS = {
        duration_ms: S.integer('How long the frame shows, in milliseconds; a multiple of 50 (one game tick)', { default: 50, minimum: 50 }),
        pieces: S.object({ all: PIECES, up: PIECES, left: PIECES, down: PIECES, right: PIECES }, [], 'Sprites placed in the frame, drawn in order (later ones on top). Give one list per direction (up, left, down, right), or `all` to use the same list for every direction.'),
        sounds: S.array(S.object({ file: S.string('Sound file, e.g. "sword.wav"'), x: S.number('Position x in tiles', { default: 1.5 }), y: S.number('Position y in tiles', { default: 2 }), tick: S.integer('Tick within the frame at which it plays (1 = start)', { default: 1, minimum: 1 }) }, ['file']), 'Sounds played during the frame'),
    };

    function buildFrame(ani, item, position) {
        const frame = new Frame();
        if (item.duration_ms % TICK_MS) fail(`frames[${position}].duration_ms is ${item.duration_ms}; a frame lasts a multiple of ${TICK_MS} ms (one game tick), e.g. ${Math.max(TICK_MS, Math.round(item.duration_ms / TICK_MS) * TICK_MS)}.`);
        frame.duration = item.duration_ms;
        const pieces = item.pieces || {};
        const directions = ani.singleDir ? 1 : 4;
        for (let dir = 0; dir < directions; dir++) {
            const list = pieces[DIRECTIONS[dir]] || pieces.all || [];
            frame.pieces[dir] = list.map(entry => {
                const piece = new FramePieceSprite();
                if (typeof entry.sprite === 'string') {
                    // The file format reads anything that starts like a number, and true and false, as an index.
                    const name = entry.sprite.trim();
                    if (!name || /\s|,/.test(name) || /^[-+]?\d/.test(name) || /^0x/i.test(name) || name === 'true' || name === 'false') fail(`frames[${position}] names the sprite "${entry.sprite}": a sprite name is one word that does not start with a digit.`);
                    if (!ani.getAniSprite(SPRITE_INDEX_STRING, name)) fail(`frames[${position}] names the sprite "${name}", but no sprite of ${ani.fileName} has that image name. A name refers to a sprite whose source is an image file of that name (gani_list_sprites); otherwise use the sprite's index.`);
                    Object.assign(piece, { spriteIndex: SPRITE_INDEX_STRING, spriteName: name, xoffset: Math.round(entry.x), yoffset: Math.round(entry.y) });
                    return piece;
                }
                if (!ani.sprites.has(entry.sprite)) fail(`frames[${position}] places sprite ${entry.sprite}, which is not defined. Define it with gani_set_sprites first; gani_list_sprites shows what exists.`);
                Object.assign(piece, { spriteIndex: entry.sprite, xoffset: Math.round(entry.x), yoffset: Math.round(entry.y) });
                return piece;
            });
            // The .gani format has no way to write an empty direction, so a frame needs something in each.
            if (!frame.pieces[dir].length) fail(`frames[${position}] has nothing placed for direction "${ani.singleDir ? 'all' : DIRECTIONS[dir]}". Every direction of every frame needs at least one sprite (the shadow, for instance); use pieces.all to give all four the same.`);
        }
        frame.sounds = (item.sounds || []).map(entry => {
            const sound = new FramePieceSound();
            Object.assign(sound, { fileName: entry.file, xoffset: entry.x * 16, yoffset: entry.y * 16, tag: entry.tick });
            return sound;
        });
        return frame;
    }

    mcp.tool({
        name: 'gani_set_frames',
        title: 'Write frames',
        description: 'Write frames into an animation, starting at frame `at`. mode "replace" overwrites frames from there (extending the animation if needed), "insert" adds them before frame `at`, "replace_all" makes them the animation\'s only frames. Offsets are in pixels from the animation\'s origin; a standing character usually has its shadow near (12, 34), body near (8, 16) and head near (8, 0). Example frame: {"duration_ms": 100, "pieces": {"all": [{"sprite": 0, "x": 12, "y": 34}, {"sprite": 1, "x": 8, "y": 0}]}}. Check the result with gani_render_sheet.',
        input: {
            gani: GANI_ARG,
            frames: S.array(S.object(FRAME_FIELDS, ['pieces']), 'The frames, in order'),
            at: S.integer('Frame index to start at; defaults to the end (append)', { minimum: 0 }),
            mode: S.enum(['replace', 'insert', 'replace_all'], 'How the frames are written', { default: 'replace' }),
        },
        required: ['frames'],
    }, async ({ gani, frames, at, mode }) => {
        await ready();
        const ani = resolve(gani);
        if (ani.isMovieMode) refuseMovie(ani, 'has no frames of sprites');
        if (!frames.length) fail('frames is empty.');
        if (at !== undefined && at > ani.frames.length) fail(`${ani.fileName} has ${ani.frames.length} frame${ani.frames.length === 1 ? '' : 's'}; \`at\` can be 0-${ani.frames.length} (${ani.frames.length} appends), got ${at}.`);
        at = mode === 'replace_all' ? 0 : at ?? ani.frames.length;
        const built = frames.map((item, position) => buildFrame(ani, item, position));
        edit(ani, 'Set frames', () => {
            if (mode === 'replace_all') ani.frames = built;
            else if (mode === 'insert') ani.frames.splice(at, 0, ...built);
            else ani.frames.splice(at, built.length, ...built);
        });
        return { gani: ani.fileName, wrote: built.length, at, total_frames: ani.frames.length, duration_ms: ani.frames.reduce((total, frame) => total + frame.duration, 0) };
    });

    mcp.tool({
        name: 'gani_delete_frames',
        title: 'Delete frames',
        description: 'Delete a run of frames. An animation keeps at least one frame.',
        input: { gani: GANI_ARG, from: S.integer('First frame to delete (0-based)', { minimum: 0 }), count: S.integer('How many frames', { default: 1, minimum: 1 }) },
        required: ['from'],
        destructive: true,
    }, async ({ gani, from, count }) => {
        await ready();
        const ani = resolve(gani);
        if (ani.isMovieMode) refuseMovie(ani, 'has no frames of sprites');
        if (from >= ani.frames.length) fail(`${ani.fileName} has frames 0-${ani.frames.length - 1}; got ${from}.`);
        count = Math.min(count, ani.frames.length - from);
        if (count >= ani.frames.length) fail('That would delete every frame; an animation needs at least one. Use gani_set_frames with mode "replace_all" to start over.');
        edit(ani, 'Delete frames', () => { ani.frames.splice(from, count); });
        return { gani: ani.fileName, deleted: count, total_frames: ani.frames.length };
    });

    // ---- Seeing the animation ---------------------------------------------------------------

    function parseBackground(background) {
        if (background === 'transparent') return null;
        // The colour behind the animation in the editor.
        if (background === 'canvas') return (typeof backgroundColor === 'string' && backgroundColor) || '#000000';
        if (!/^#[0-9a-f]{6}$/i.test(background)) fail('background must be "transparent", "canvas" or a colour like "#3c8c3c".');
        return background;
    }

    // Bounds that hold every frame of the given directions, so frames line up when compared.
    function boundsFor(ani, dirs) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const dir of dirs) {
            const b = _exportBounds(ani, dir, 1, 0);
            minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
            maxX = Math.max(maxX, b.minX + b.w); maxY = Math.max(maxY, b.minY + b.h);
        }
        return { minX, minY, width: Math.max(1, Math.ceil(maxX - minX)), height: Math.max(1, Math.ceil(maxY - minY)) };
    }

    function drawCell(ani, frameIndex, dir, bounds, scale, padding, background) {
        const canvas = document.createElement('canvas');
        canvas.width = bounds.width * scale + padding * 2;
        canvas.height = bounds.height * scale + padding * 2;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        drawingAs(ani, frameIndex, () => _renderExportFrame(ctx, ani.frames[frameIndex], dir, scale, padding, bounds.minX, bounds.minY, background));
        return canvas;
    }

    mcp.tool({
        name: 'gani_render',
        title: 'Render one frame',
        description: 'Draw one frame of an animation in one direction as an image, enlarged so details are clear. Use gani_render_sheet to see the whole animation at once.',
        input: {
            gani: GANI_ARG,
            frame: S.integer('Frame to draw (0-based)', { default: 0, minimum: 0 }),
            direction: S.enum(DIRECTIONS, 'Direction to draw (ignored for single-direction animations)', { default: 'down' }),
            scale: S.integer('Enlargement factor', { default: 4, minimum: 1, maximum: 8 }),
            background: S.string('"transparent" or a colour such as "#3c8c3c"', { default: '#3c8c3c' }),
        },
        readOnly: true,
    }, async ({ gani, frame, direction, scale, background }) => {
        await ready();
        const ani = resolve(gani);
        if (ani.isMovieMode) refuseMovie(ani, 'is not drawn frame by direction');
        if (frame >= ani.frames.length) fail(`${ani.fileName} has frames 0-${ani.frames.length - 1}; got ${frame}.`);
        const missing = await loadImages(ani);
        const dir = directionIndex(ani, direction);
        const canvas = drawCell(ani, frame, dir, boundsFor(ani, [dir]), scale, 8, parseBackground(background));
        return mcp.result({ gani: ani.fileName, frame, direction: ani.singleDir ? 'all' : DIRECTIONS[dir], duration_ms: ani.frames[frame].duration, image: `${canvas.width}x${canvas.height}`, missing_images: missing.length ? missing : undefined }, h.imagePart(canvas));
    });

    mcp.tool({
        name: 'gani_render_sheet',
        title: 'Render the animation as a sheet',
        description: 'See an animation play out: every frame drawn side by side, one row per direction (up, left, down, right), with frame numbers and durations along the top. Reading a row left to right is the animation in that direction. Long animations are spread over the frames you ask for.',
        input: {
            gani: GANI_ARG,
            direction: S.enum(['all', ...DIRECTIONS], 'Which direction rows to draw', { default: 'all' }),
            from: S.integer('First frame to show', { default: 0, minimum: 0 }),
            count: S.integer('How many frames to show', { default: 16, minimum: 1, maximum: 48 }),
            scale: S.integer('Enlargement factor; chosen automatically when omitted', { minimum: 1, maximum: 6 }),
            background: S.string('"transparent" or a colour such as "#3c8c3c"', { default: '#3c8c3c' }),
        },
        readOnly: true,
    }, async ({ gani, direction, from, count, scale, background }) => {
        await ready();
        const ani = resolve(gani);
        if (ani.isMovieMode) refuseMovie(ani, 'is not drawn frame by direction');
        if (from >= ani.frames.length) fail(`${ani.fileName} has frames 0-${ani.frames.length - 1}; got ${from}.`);
        const missing = await loadImages(ani);
        const dirs = ani.singleDir ? [0] : direction === 'all' ? [0, 1, 2, 3] : [DIRECTIONS.indexOf(direction)];
        const frameIndices = ani.frames.map((_, index) => index).slice(from, from + count);
        const bounds = boundsFor(ani, dirs);
        const padding = 4, headerHeight = 30, labelWidth = 46, gap = 2;
        scale = scale || Math.max(1, Math.min(4, Math.floor((1600 - labelWidth) / frameIndices.length / (bounds.width + 4)), Math.floor(1200 / dirs.length / (bounds.height + 4))));
        const cellWidth = bounds.width * scale + padding * 2, cellHeight = bounds.height * scale + padding * 2;
        const sheet = document.createElement('canvas');
        sheet.width = labelWidth + frameIndices.length * (cellWidth + gap);
        sheet.height = headerHeight + dirs.length * (cellHeight + gap);
        const ctx = sheet.getContext('2d');
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.font = '11px monospace';
        ctx.textBaseline = 'middle';
        const fill = parseBackground(background);
        frameIndices.forEach((frameIndex, column) => {
            const x = labelWidth + column * (cellWidth + gap);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(`#${frameIndex}`, x + cellWidth / 2, 9);
            ctx.fillStyle = '#9c9';
            ctx.fillText(`${ani.frames[frameIndex].duration}ms`, x + cellWidth / 2, 22);
            dirs.forEach((dir, row) => {
                const y = headerHeight + row * (cellHeight + gap);
                if (!fill) { ctx.fillStyle = '#333'; ctx.fillRect(x, y, cellWidth, cellHeight); }
                ctx.drawImage(drawCell(ani, frameIndex, dir, bounds, scale, padding, fill), x, y);
            });
        });
        dirs.forEach((dir, row) => {
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(ani.singleDir ? 'all' : DIRECTIONS[dir], 4, headerHeight + row * (cellHeight + gap) + cellHeight / 2);
        });
        const meta = {
            gani: ani.fileName, total_frames: ani.frames.length, showing_frames: `${frameIndices[0]}-${frameIndices[frameIndices.length - 1]}`,
            rows: dirs.map(dir => ani.singleDir ? 'all' : DIRECTIONS[dir]), scale, cell: `${cellWidth}x${cellHeight}`,
            loop: ani.looped, total_duration_ms: ani.frames.reduce((total, frame) => total + frame.duration, 0),
            missing_images: missing.length ? missing : undefined,
        };
        return mcp.result(meta, h.imagePart(sheet));
    });

    mcp.tool({
        name: 'gani_export_gif',
        title: 'Export an animated GIF',
        description: 'Render an animation in one direction to an animated GIF file on disk, as the editor\'s Export does, for sharing or previewing outside GSuite. A movie is exported too: the whole scene, or the stretch given by from / to / step (direction and crop do not apply to a movie).',
        input: {
            gani: GANI_ARG,
            path: S.string('Absolute path of the .gif to write'),
            direction: S.enum(DIRECTIONS, 'Direction to export', { default: 'down' }),
            scale: S.integer('Enlargement factor', { default: 2, minimum: 1, maximum: 8 }),
            background: S.string('"transparent", "canvas" (the editor\'s canvas colour) or a colour such as "#3c8c3c"', { default: 'transparent' }),
            loop: S.boolean('Make the GIF loop', { default: true }),
            padding: S.integer('Empty margin around the animation, in pixels of the output', { default: 4, minimum: 0, maximum: 64 }),
            crop: S.boolean('Trim the picture to the pixels that are ever drawn (plus the padding); it has an effect with a transparent background only. Turn off to keep the full box of every sprite, so that frames keep a fixed origin', { default: true }),
            from: S.integer('Movies: first frame to export', { default: 0, minimum: 0 }),
            to: S.integer('Movies: last frame to export; defaults to the end', { minimum: 0 }),
            step: S.integer('Movies: export every nth frame (the GIF plays at the same speed)', { default: 1, minimum: 1, maximum: 20 }),
            view: MOVIE_VIEW,
        },
        required: ['path'],
        destructive: true,
        idempotent: true,
        openWorld: true,
        timeoutMs: 300000,
    }, async ({ gani, path: target, direction, scale, background, loop, padding, crop, from, to, step, view }) => {
        await ready();
        const ani = resolve(gani);
        h.requireAbsolute(target, 'path');
        if (h.path.ext(target) !== 'gif') fail(`The export is a GIF; give a path ending in .gif, got "${target}".`);
        if (ani.isMovieMode) {
            // The editor's own export only sees a small box around the origin of a movie; this one follows the items.
            const last = Math.min(to ?? ani.frameCount - 1, ani.frameCount - 1);
            if (from > last) fail(`from (${from}) is beyond the last frame to export (${last}).`);
            const picked = [];
            for (let frame = from; frame <= last; frame += step) picked.push(frame);
            if (picked.length > 600) fail(`That is ${picked.length} frames; export at most 600 at a time (use step, or from and to).`);
            const assets = await loadMovieAssets(ani);
            const fill = parseBackground(background);
            const box = view || movieBounds(ani, picked);
            const shown = { x: box.x - padding / scale, y: box.y - padding / scale, width: box.width + 2 * padding / scale, height: box.height + 2 * padding / scale };
            if (shown.width * scale > 4000 || shown.height * scale > 4000) fail(`A frame of that export would be ${Math.round(shown.width * scale)}x${Math.round(shown.height * scale)} pixels. Lower scale or give a view around the part to export.`);
            if (picked.length * shown.width * scale * shown.height * scale * 4 > 400e6) fail('That export is too large to hold in memory: lower scale, export fewer frames (step, from, to) or give a smaller view.');
            const frames = picked.map(frame => {
                const cell = drawMovieCell(ani, frame, shown, scale, fill);
                return { imageData: cell.getContext('2d').getImageData(0, 0, cell.width, cell.height), delayMs: TICK_MS * step };
            });
            const yieldBefore = window._exportYield;
            window._exportYield = () => Promise.resolve();
            let bytes;
            try { bytes = await _buildGIF(frames[0].imageData.width, frames[0].imageData.height, frames, loop, null); } finally { window._exportYield = yieldBefore; }
            await h.files.write(target, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
            return {
                gani: ani.fileName, path: target, frames: picked.length, size: `${frames[0].imageData.width}x${frames[0].imageData.height}`, bytes: bytes.length,
                missing_images: assets.missingImages.length ? assets.missingImages : undefined, missing_actor_animations: assets.missingAnis.length ? assets.missingAnis : undefined,
            };
        }
        const missing = await loadImages(ani);
        const fill = parseBackground(background);
        // The exporter pauses on animation frames, which do not fire in a hidden window.
        const yieldBefore = window._exportYield;
        window._exportYield = () => Promise.resolve();
        const saved = { animation: currentAnimation, frame: currentFrame };
        let bytes, size;
        try {
            currentAnimation = ani;
            const rendered = await _renderExportFrames(ani, directionIndex(ani, direction), scale, padding, fill, crop, null);
            bytes = await _buildGIF(rendered.w, rendered.h, rendered.frames, loop, null);
            size = `${rendered.w}x${rendered.h}`;
        } finally {
            currentAnimation = saved.animation;
            currentFrame = saved.frame;
            window._exportYield = yieldBefore;
        }
        await h.files.write(target, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        return { gani: ani.fileName, path: target, frames: ani.frames.length, size, bytes: bytes.length, missing_images: missing.length ? missing : undefined };
    });

    mcp.tool({
        name: 'gani_export_video',
        title: 'Export a video of an animation',
        description: 'Render an animation in one direction to a video file, as the editor\'s Export does: .mp4 (H.264, with the frames\' sounds mixed in as an audio track when the sound files can be found) or .webm. The path\'s extension picks the format. Video has no transparency, so a transparent background comes out black: the editor\'s canvas colour is the default. Whether a format is available depends on the window GSuite runs in: MP4 needs WebCodecs and WebM needs MediaRecorder, and the tool says so when one is missing (gani_export_gif always works). A WebM is recorded in real time, so it takes as long as the animation lasts.',
        input: {
            gani: GANI_ARG,
            path: S.string('Absolute path of the .mp4 or .webm to write'),
            direction: S.enum(DIRECTIONS, 'Direction to export', { default: 'down' }),
            scale: S.integer('Enlargement factor', { default: 2, minimum: 1, maximum: 8 }),
            background: S.string('"canvas" (the editor\'s canvas colour), a colour such as "#3c8c3c", or "transparent" (black in a video)', { default: 'canvas' }),
            padding: S.integer('Empty margin around the animation, in pixels of the output', { default: 4, minimum: 0, maximum: 64 }),
        },
        required: ['path'],
        destructive: true,
        idempotent: true,
        openWorld: true,
        timeoutMs: 300000,
    }, async ({ gani, path: target, direction, scale, background, padding }) => {
        await ready();
        const ani = resolve(gani);
        h.requireAbsolute(target, 'path');
        const format = h.path.ext(target);
        if (format !== 'mp4' && format !== 'webm') fail(`A video is exported as .mp4 or .webm; got "${h.path.base(target)}". For a GIF use gani_export_gif.`);
        if (ani.isMovieMode) fail('Movie-mode animations are exported with gani_export_gif.');
        const duration = ani.frames.reduce((total, frame) => total + frame.duration, 0);
        if (format === 'mp4') {
            if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') fail('MP4 export needs WebCodecs (VideoEncoder), which the window GSuite is running in does not provide. Use .webm or gani_export_gif.');
        } else {
            if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) fail('WebM export needs MediaRecorder, which the window GSuite is running in does not provide. Use .mp4 or gani_export_gif.');
            if (!['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].some(type => MediaRecorder.isTypeSupported(type))) fail('The window GSuite is running in cannot record WebM video. Use .mp4 or gani_export_gif.');
            if (duration > 120000) fail(`A WebM is recorded in real time and this animation lasts ${Math.round(duration / 1000)} seconds; the limit is 120. Use .mp4 or gani_export_gif.`);
        }
        const missing = await loadImages(ani);
        const fill = parseBackground(background);
        const dir = directionIndex(ani, direction);
        // The exporters pause on animation frames, which do not fire in a hidden window, and
        // hand their result to a save dialog: both are replaced for the length of the call.
        const before = { yield: window._exportYield, save: window._animExportSave, animation: currentAnimation, frame: currentFrame };
        let captured = null;
        window._exportYield = () => Promise.resolve();
        window._animExportSave = async data => { captured = data; };
        try {
            currentAnimation = ani;
            if (format === 'mp4') await _exportMP4(ani, dir, scale, padding, fill, null);
            else {
                await _exportWebM(ani, dir, scale, padding, fill);
                // The recorder finishes a moment after the last frame.
                await h.waitFor(() => captured, 15000, 'the WebM recording to finish');
            }
        } catch (error) {
            if (error instanceof mcp.ToolError) throw error;
            fail(`The ${format.toUpperCase()} could not be made in the window GSuite is running in (${error.message || error}). Use ${format === 'mp4' ? '.webm' : '.mp4'} or gani_export_gif.`);
        } finally {
            currentAnimation = before.animation;
            currentFrame = before.frame;
            window._exportYield = before.yield;
            window._animExportSave = before.save;
        }
        if (!captured) fail(`The ${format.toUpperCase()} exporter produced nothing.`);
        const bytes = captured instanceof Uint8Array ? captured : new Uint8Array(await new Response(captured).arrayBuffer());
        await h.files.write(target, bytes);
        const sounds = ani.frames.some(frame => frame.sounds.length);
        return {
            gani: ani.fileName, path: h.path.normalize(target), format, frames: ani.frames.length, duration_ms: duration, bytes: bytes.length,
            audio: format === 'mp4' && sounds ? 'the frame sounds are mixed in when their files could be found and this window can encode AAC' : undefined,
            missing_images: missing.length ? missing : undefined,
        };
    });

    // ---- Movies (cutscenes) -----------------------------------------------------------------
    //
    // A movie is a .gani with a timeline instead of frames of sprites: items ("actors") of four
    // kinds, each with keyframes that say where it is and what it shows from that frame on.

    const MOVIE_KINDS = ['CHAR', 'TEXT', 'SPRITE', 'SOUND'];
    const MOVIE_TYPE = { CHAR: 'actor', TEXT: 'text', SPRITE: 'sprite', SOUND: 'sound' };
    const MOVIE_FLAGS = ['bold', 'italic', 'centered', 'rightaligned', 'underline', 'strikeout', 'wordwrap', 'shaded'];
    // Attributes the editor keeps on the key itself; every other one lives in the key's `attrs`.
    const MOVIE_TOP = new Set(['visible', 'dx', 'dy', 'layer', 'ani', 'dir', 'chat', 'text', 'head', 'body', 'playerlook', 'spriteIndex']);
    const MOVIE_IMAGES = ['head', 'body', 'sword', 'shield', 'horse'];
    const MOVIE_BOOLEAN = new Set(['visible', 'playerlook', ...MOVIE_FLAGS]);
    const MOVIE_INTEGER = new Set(['dx', 'dy', 'layer', 'dir', 'spriteIndex']);

    function newAnimation() {
        const ani = new Animation();
        for (const [key, value] of Object.entries({ SPRITES: 'sprites.png', PICS: 'pics1.png', HEAD: 'head19.png', BODY: 'body.png', SWORD: 'sword1.png', SHIELD: 'shield1.png' })) ani.setDefaultImage(key, value);
        const shadow = new AniSprite();
        Object.assign(shadow, { index: 0, type: 'SPRITES', left: 0, top: 0, width: 24, height: 12, comment: 'shadow' });
        shadow.updateBoundingBox();
        ani.addSprite(shadow);
        return ani;
    }

    function requireMovie(ani) {
        if (!ani.isMovieMode) fail(`${ani.fileName} is a sprite animation, not a movie. Create a movie with gani_new (movie: true), or switch this one with gani_set_mode.`);
    }

    function refuseMovie(ani, why) {
        fail(`${ani.fileName} is a movie and ${why}: its timeline is read with gani_get_movie, changed with gani_set_movie and gani_set_movie_keys, and drawn with gani_render_movie.`);
    }

    function movieItem(ani, ref) {
        const text = String(ref);
        const byId = /^\d+$/.test(text) ? ani.movieItems.find(item => item.id === Number(text)) : null;
        if (byId) return byId;
        const named = ani.movieItems.filter(item => item.name.toLowerCase() === text.toLowerCase());
        if (named.length === 1) return named[0];
        if (named.length > 1) fail(`${named.length} items are named "${ref}": use the id (${named.map(item => item.id).join(', ')}).`);
        return fail(`No movie item "${ref}". Items: ${ani.movieItems.map(item => `${item.id} ${item.name} (${item.kind})`).join(', ') || 'none'}.`);
    }

    const keyFrames = item => [...item.frames.keys()].map(Number).sort((a, b) => a - b);

    // A key as stored (two layouts exist: parsed from a file, or made in the editor) in one shape.
    function describeKey(item, frame) {
        const state = item.frames.get(frame) || {};
        const out = { frame };
        const extra = {};
        for (const name of [...Object.keys(state), ...Object.keys(state.attrs || {})]) {
            if (name === 'attrs' || name === 'name') continue;
            const value = name === 'sprite #' ? item.getKeyValue(state, 'sprite #') : item.getKeyValue(state, name);
            if (value === undefined || value === null) continue;
            const key = name === 'spriteIndex' || name === 'sprite #' ? 'sprite' : name;
            if (MOVIE_BOOLEAN.has(name)) out[key] = ganiTrue(value);
            else if (name === 'dir') out.dir = DIRECTIONS[ganiInt(value)] ?? ganiInt(value);
            else if (MOVIE_INTEGER.has(name) || name === 'sprite #') out[key] = ganiInt(value);
            else if (name === 'zoom') out[key] = ganiFloat(value);
            else if (MOVIE_TOP.has(name) || ['font', 'color', 'file', 'sword', 'shield', 'horse'].includes(name)) out[key] = String(value);
            else extra[name] = String(value);
        }
        if (Object.keys(extra).length) out.attrs = extra;
        return out;
    }

    function describeItem(ani, item, withKeys) {
        const frames = keyFrames(item);
        const out = { id: item.id, name: item.name, kind: item.kind, key_frames: frames };
        if (withKeys) out.keys = frames.map(frame => describeKey(item, frame));
        const beyond = frames.filter(frame => frame >= ani.frameCount);
        if (beyond.length) out.keys_beyond_the_end = beyond;
        return out;
    }

    // What an item shows at a frame, after the editor has worked out the keys before it.
    function itemAt(item, frame) {
        const state = item.getInterpolatedFrame(frame);
        if (!state) return null;
        const out = { id: item.id, name: item.name, kind: item.kind, visible: !!state.visible, dx: state.dx, dy: state.dy };
        if (item.kind === 'CHAR') Object.assign(out, { ani: state.ani, dir: DIRECTIONS[state.dir] || state.dir, chat: state.chat || undefined });
        else if (item.kind === 'TEXT') out.text = state.text;
        else if (item.kind === 'SPRITE') out.sprite = state.spriteIndex;
        else if (item.kind === 'SOUND') Object.assign(out, { file: state.soundFile || '', plays_now: !!state.soundShown });
        return out;
    }

    const movieDuration = ani => (ani.frameCount + (ani.looped ? 1 : 0)) * TICK_MS;

    mcp.tool({
        name: 'gani_set_mode',
        title: 'Switch between sprite animation and movie',
        description: 'Turn a sprite animation into a movie (a cutscene with a timeline of actors, texts, sprites and sounds placed by keyframes) or back, as the editor\'s Movie Mode button does. Switching throws away what the other mode held: going to a movie removes every sprite placed in the frames (the sprite definitions stay); going back removes the movie\'s items and leaves one empty frame. So confirm must be true when there is something to lose. Usually it is simpler to create the right kind with gani_new.',
        input: {
            gani: GANI_ARG,
            mode: S.enum(['movie', 'animation'], 'What the animation becomes'),
            frames: S.integer('For a movie: its length in frames (50 ms each). Defaults to the number of frames it has, at least 100', { minimum: 1, maximum: 6000 }),
            confirm: S.boolean('Go ahead although placed sprites or movie items are lost', { default: false }),
        },
        required: ['mode'],
        destructive: true,
    }, async ({ gani, mode, frames, confirm }) => {
        await ready();
        const ani = resolve(gani);
        const toMovie = mode === 'movie';
        if (toMovie === !!ani.isMovieMode) fail(`${ani.fileName} already is ${toMovie ? 'a movie' : 'a sprite animation'}.`);
        const placed = ani.frames.filter(frame => frame.pieces.some(list => list.length)).length;
        const lost = toMovie ? (placed ? `the sprites placed in ${placed} frame(s)` : '') : (ani.movieItems.length ? `${ani.movieItems.length} movie item(s) with their keyframes` : '');
        if (lost && !confirm) fail(`Switching ${ani.fileName} to ${toMovie ? 'a movie' : 'a sprite animation'} removes ${lost}. Pass confirm: true to go ahead (gani_undo brings them back).`);
        // Whether an animation has one direction or four is not part of an undo step, so it is settled first.
        if (toMovie && ani.singleDir) {
            for (const frame of ani.frames) for (let dir = 1; dir < 4; dir++) frame.pieces[dir] = frame.pieces[0].map(piece => piece.duplicate());
            ani.singleDir = false;
        }
        edit(ani, toMovie ? 'Switch to Movie Mode' : 'Switch to Sprite Mode', () => {
            ani.isMovieMode = toMovie;
            ani.singleDir = false;
            selectedPieces.clear();
            selectedMovieItem = null;
            if (toMovie) {
                ani.frameCount = frames || Math.max(100, ani.frames.length || 1);
                ensureMovieFrames(ani);
                for (const frame of ani.frames) frame.pieces = [[], [], [], []];
            } else {
                ani.movieItems = [];
                // The file format has no way to write a frame with nothing in it: start again from the shadow.
                const frame = new Frame();
                for (let dir = 0; dir < 4; dir++) {
                    const piece = new FramePieceSprite();
                    Object.assign(piece, { spriteIndex: ani.sprites.has(0) ? 0 : [...ani.sprites.keys()][0] ?? 0, xoffset: 12, yoffset: dir % 2 === 0 ? 34 : 36 });
                    frame.pieces[dir].push(piece);
                }
                ani.frames = [frame];
                ani.frameCount = 100;
                currentFrame = 0;
            }
        });
        try { drawTimeline(); } catch (error) { console.warn('[mcp] gani timeline', error); }
        return { changed: describe(ani), removed: lost || undefined };
    });

    mcp.tool({
        name: 'gani_get_movie',
        title: 'Read a movie',
        description: 'The structure of a movie: its length, and every item (actor, text, sprite, sound) with its keyframes and the attributes each key sets. A key only holds what changes at that frame; give `frame` to also get what each item shows at that moment, with the keys before it worked in (positions move in a straight line between keys, everything else holds until the next key).',
        input: {
            gani: GANI_ARG,
            item: S.string('Only this item: its id or its name'),
            frame: S.integer('Also report what each item shows at this frame', { minimum: 0 }),
        },
        readOnly: true,
    }, async ({ gani, item, frame }) => {
        await ready();
        const ani = resolve(gani);
        requireMovie(ani);
        if (frame !== undefined && frame >= ani.frameCount) fail(`${ani.fileName} has frames 0-${ani.frameCount - 1}; got ${frame}.`);
        const items = item !== undefined ? [movieItem(ani, item)] : ani.movieItems;
        return {
            gani: ani.fileName, frame_count: ani.frameCount, duration_ms: movieDuration(ani), loop: ani.looped, set_back_to: ani.nextAni || '',
            items: items.map(entry => ({ ...describeItem(ani, entry, true), at_frame: frame !== undefined ? drawingAs(ani, undefined, () => itemAt(entry, frame)) : undefined })),
        };
    });

    const MOVIE_KEY_FIELDS = {
        visible: S.boolean('Whether the item shows from this frame on. An item is invisible until a key says true'),
        dx: S.integer('Position x in pixels (0,0 is where the animation is placed). Moves in a straight line to the next key that sets a position. Give dy with it'),
        dy: S.integer('Position y in pixels'),
        layer: S.integer('Drawing order, 0-3 (higher is in front)', { minimum: 0, maximum: 3 }),
        ani: S.string('CHAR: the animation the actor plays, e.g. "idle", "walk", "sit", "sword"'),
        dir: S.enum(DIRECTIONS, 'CHAR: the direction the actor faces'),
        chat: S.string('CHAR: text shown above the actor; an empty string ends what an earlier key made it say'),
        playerlook: S.boolean('CHAR: look like the player watching (no head, body or other image is forced)'),
        head: S.string('CHAR: head image, e.g. "head3.png"'),
        body: S.string('CHAR: body image'),
        sword: S.string('CHAR: sword image'),
        shield: S.string('CHAR: shield image'),
        horse: S.string('CHAR: horse image'),
        text: S.string('TEXT: the text shown'),
        font: S.string('TEXT: font name, e.g. "Tempus Sans ITC"'),
        color: S.string('TEXT: colour as six hex digits, e.g. "FFFFFF"'),
        zoom: S.number('TEXT: size, 1 is 20 pixels high. Changes gradually to the next key that sets it', { minimum: 0.05, maximum: 50 }),
        bold: S.boolean('TEXT: bold'),
        italic: S.boolean('TEXT: italic'),
        centered: S.boolean('TEXT: centred on its position'),
        rightaligned: S.boolean('TEXT: right-aligned'),
        underline: S.boolean('TEXT: underlined'),
        strikeout: S.boolean('TEXT: struck out'),
        wordwrap: S.boolean('TEXT: wrap long text (on unless a key turns it off)'),
        shaded: S.boolean('TEXT: draw a shadow (on unless a key turns it off)'),
        sprite: S.integer('SPRITE: index of one of this animation\'s sprites (gani_list_sprites)', { minimum: 0 }),
        file: S.string('SOUND: the sound file, e.g. "sword.wav". A sound item plays once, at its first key'),
        attrs: S.object({}, [], 'Anything else, by name: attr1-attr30, param1-param30, color0-color4 for a CHAR, or names of your own; values are text'),
    };
    const MOVIE_KIND_FIELDS = {
        CHAR: ['ani', 'dir', 'chat', 'playerlook', 'head', 'body', 'sword', 'shield', 'horse'],
        TEXT: ['text', 'font', 'color', 'zoom', ...MOVIE_FLAGS],
        SPRITE: ['sprite'],
        SOUND: ['file'],
    };

    // Merges attributes into the item's key at a frame, the way the editor's panel does.
    function writeKey(ani, item, frame, patch, where) {
        const others = MOVIE_KINDS.filter(kind => kind !== item.kind).flatMap(kind => MOVIE_KIND_FIELDS[kind]).filter(name => !MOVIE_KIND_FIELDS[item.kind].includes(name));
        const wrong = Object.keys(patch).filter(name => others.includes(name));
        if (wrong.length) fail(`${where}: ${wrong.join(', ')} ${wrong.length === 1 ? 'does' : 'do'} not apply to ${item.name}, which is a ${item.kind}. A ${item.kind} key takes: visible, dx, dy, layer, ${MOVIE_KIND_FIELDS[item.kind].join(', ')}, attrs.`);
        if ((patch.dx === undefined) !== (patch.dy === undefined)) {
            const earlier = item.frames.get(frame);
            if (!earlier || earlier.dx === undefined || earlier.dy === undefined) fail(`${where}: give dx and dy together.`);
        }
        if (patch.sprite !== undefined && !ani.sprites.has(patch.sprite)) fail(`${where}: sprite ${patch.sprite} is not defined in ${ani.fileName}. Define it with gani_set_sprites.`);
        // The file format has no way to write an empty image name, so it would be gone when the file is opened again.
        for (const name of MOVIE_IMAGES) if (patch[name] === '') fail(`${where}: ${name} cannot be empty. Use playerlook, or leave ${name} out to keep what an earlier key set.`);
        for (const [name, text] of Object.entries(patch.attrs || {})) if (text === '' || /[\r\n]/.test(String(text))) fail(`${where}: attrs.${name} must be one line of text that is not empty.`);
        if (!Object.keys(patch).length && !item.frames.has(frame)) fail(`${where}: give at least one attribute for the key; a key that sets nothing is not kept in the file.`);
        for (const name of ['text', 'chat', 'ani', 'file', 'font']) if (typeof patch[name] === 'string' && /[\r\n]/.test(patch[name])) fail(`${where}: ${name} cannot hold a line break.`);
        if (patch.color !== undefined && !/^(#|0x)?[0-9a-f]{6}$/i.test(patch.color)) fail(`${where}: color must be six hex digits such as "FFFFFF", got "${patch.color}".`);
        const old = item.frames.get(frame) || {};
        const key = { ...old, attrs: { ...(old.attrs || {}) } };
        delete key.name;
        const set = (name, value) => {
            delete key.attrs[name];
            if (name === 'spriteIndex') delete key.attrs['sprite #'];
            if (MOVIE_TOP.has(name)) key[name] = value; else { delete key[name]; key.attrs[name] = String(value); }
        };
        for (const [name, value] of Object.entries(patch)) {
            if (name === 'attrs') { for (const [extra, text] of Object.entries(value)) set(extra.toLowerCase(), text); continue; }
            if (name === 'dir') set('dir', DIRECTIONS.indexOf(value));
            else if (name === 'sprite') set('spriteIndex', value);
            else if (name === 'color') set('color', value.replace(/^(#|0x)/i, '').toUpperCase());
            else set(name, value);
        }
        if (!Object.keys(key.attrs).length) delete key.attrs;
        item.frames.set(frame, key);
        // The item remembers the latest of these as what holds when no key says otherwise.
        if (key.text !== undefined) item.text = key.text;
        if (key.dir !== undefined) item.dir = key.dir;
        if (key.layer !== undefined) item.layer = key.layer;
        if (key.visible !== undefined) item.visible = key.visible;
    }

    // The key the editor gives a new item, so that it shows up and can be moved.
    function firstKey(ani, kind, given, where) {
        if (kind === 'SOUND' && !given.file) fail(`${where}: a SOUND item needs the file it plays, e.g. key: { file: "sword.wav" }.`);
        if (kind === 'SPRITE' && given.sprite === undefined) fail(`${where}: a SPRITE item needs the sprite it shows, e.g. key: { sprite: ${[...ani.sprites.keys()].sort((a, b) => a - b)[0] ?? 0} } (gani_list_sprites).`);
        const key = { visible: true, dx: kind === 'TEXT' ? 0 : -16, dy: kind === 'TEXT' ? -32 : -24, layer: 1 };
        if (kind === 'TEXT') Object.assign(key, { text: 'text', font: 'Tempus Sans ITC', color: 'FFFFFF', zoom: 1 });
        if (kind === 'CHAR') Object.assign(key, { ani: 'idle', dir: 'down' });
        return key;
    }

    mcp.tool({
        name: 'gani_set_movie',
        title: 'Change a movie\'s length and items',
        description: 'Change what a movie is made of, in one undo step: its length in frames, and its items. Items are of four kinds. CHAR is an actor: a character that plays another animation (idle, walk, sit ...) in a direction, can show chat text, and can be given its own head, body and other images. TEXT is a line of text. SPRITE shows one of this animation\'s own sprites (define them with gani_set_sprites). SOUND plays a sound file once. A new item gets a first key at `frame` that makes it visible at a default place; give `key` to say where and how instead, and add more keys with gani_set_movie_keys. gani_get_movie shows the result in numbers, gani_render_movie as pictures.',
        input: {
            gani: GANI_ARG,
            length: S.integer('New length of the movie in frames (50 ms each)', { minimum: 1, maximum: 6000 }),
            prune_keys: S.boolean('With length: delete keys that now lie beyond the end', { default: false }),
            add: S.array(S.object({
                kind: S.enum(MOVIE_KINDS, 'What the item is'),
                name: S.string('Name of the item (one line); defaults to Actor<id> or Text<id>'),
                frame: S.integer('Frame of its first key', { default: 0, minimum: 0 }),
                key: S.object(MOVIE_KEY_FIELDS, [], 'Attributes of the first key, over the defaults (visible, a place near the origin, and for a CHAR the idle animation facing down)'),
            }, ['kind']), 'Items to add'),
            change: S.array(S.object({
                item: S.string('The item: its id or its name'),
                name: S.string('New name'),
                kind: S.enum(MOVIE_KINDS, 'New kind; only for an item without keys'),
            }, ['item']), 'Items to rename or retype'),
            delete: S.array(S.string('Item id or name'), 'Items to delete, with their keys'),
        },
    }, async ({ gani, length, prune_keys, add, change, delete: remove }) => {
        await ready();
        const ani = resolve(gani);
        requireMovie(ani);
        if (length === undefined && !add && !change && !remove) fail('Nothing to change: give length, add, change or delete.');
        const end = length ?? ani.frameCount;
        // Everything is checked before anything changes.
        (add || []).forEach((entry, index) => {
            if (entry.frame >= end) fail(`add[${index}].frame is ${entry.frame}; the movie has frames 0-${end - 1}.`);
            if (entry.name !== undefined && (!entry.name.trim() || /[\r\n]/.test(entry.name))) fail(`add[${index}].name must be one line of text.`);
        });
        const changes = (change || []).map((entry, index) => {
            const target = movieItem(ani, entry.item);
            if (entry.name !== undefined && (!entry.name.trim() || /[\r\n]/.test(entry.name))) fail(`change[${index}].name must be one line of text.`);
            if (entry.kind && entry.kind !== target.kind && target.frames.size) fail(`${target.name} has keys made for a ${target.kind}; delete it and add a ${entry.kind} instead.`);
            return { target, entry };
        });
        const doomed = (remove || []).map(ref => movieItem(ani, ref));
        const added = [];
        let pruned = 0;
        edit(ani, 'Edit movie', () => {
            if (length !== undefined) {
                ani.frameCount = length;
                ensureMovieFrames(ani);
                if (prune_keys) for (const item of ani.movieItems) for (const frame of keyFrames(item)) if (frame >= length) { item.frames.delete(frame); pruned++; }
            }
            for (const { target, entry } of changes) {
                if (entry.name !== undefined) target.name = entry.name.trim();
                if (entry.kind) { target.kind = entry.kind; target.type = MOVIE_TYPE[entry.kind]; }
            }
            if (doomed.length) {
                ani.movieItems = ani.movieItems.filter(item => !doomed.includes(item));
                selectedMovieItem = null;
            }
            (add || []).forEach((entry, index) => {
                const id = ani.movieItems.reduce((highest, item) => Math.max(highest, item.id), -1) + 1;
                const item = new MovieItem(MOVIE_TYPE[entry.kind], id);
                item.kind = entry.kind;
                if (entry.name) item.name = entry.name.trim();
                writeKey(ani, item, entry.frame, { ...firstKey(ani, entry.kind, entry.key || {}, `add[${index}]`), ...(entry.key || {}) }, `add[${index}].key`);
                ani.movieItems.push(item);
                added.push(id);
            });
        });
        try { drawTimeline(); } catch (error) { console.warn('[mcp] gani timeline', error); }
        return {
            gani: ani.fileName, frame_count: ani.frameCount, duration_ms: movieDuration(ani), added: added.length ? added : undefined, deleted: doomed.length || undefined, keys_pruned: pruned || undefined,
            items: ani.movieItems.map(item => describeItem(ani, item, false)),
        };
    });

    mcp.tool({
        name: 'gani_set_movie_keys',
        title: 'Set or delete movie keyframes',
        description: 'Place a movie\'s items in time, in one undo step. Each entry of `keys` writes one key: an item, a frame, and the attributes that change there (they are merged into a key that already exists at that frame; `unset` removes attributes from it). What a key sets holds until a later key changes it, except position (dx, dy) and a text\'s zoom, which move gradually from one key to the next: to walk an actor, set dx, dy and ani "walk" at the start, and dx, dy and ani "idle" where it stops. An actor does not turn or start walking by itself. `delete` removes whole keys. Which attributes apply depends on the item\'s kind (the tool says when one does not).',
        input: {
            gani: GANI_ARG,
            keys: S.array(S.object({
                item: S.string('The item: its id or its name'),
                frame: S.integer('Frame of the key', { minimum: 0 }),
                ...MOVIE_KEY_FIELDS,
                unset: S.array(S.string('Attribute name'), 'Attributes to remove from this key, so the item keeps what an earlier key said'),
            }, ['item', 'frame']), 'Keys to write'),
            delete: S.array(S.object({ item: S.string('The item: its id or its name'), frames: S.array(S.integer({ minimum: 0 }), 'Frames whose keys to delete') }, ['item', 'frames']), 'Keys to delete'),
        },
    }, async ({ gani, keys, delete: remove }) => {
        await ready();
        const ani = resolve(gani);
        requireMovie(ani);
        if (!(keys && keys.length) && !(remove && remove.length)) fail('Give keys to write, or delete.');
        const writes = (keys || []).map((entry, index) => {
            const { item: ref, frame, unset, ...patch } = entry;
            if (frame >= ani.frameCount) fail(`keys[${index}].frame is ${frame}; ${ani.fileName} has frames 0-${ani.frameCount - 1} (gani_set_movie changes the length).`);
            return { item: movieItem(ani, ref), frame, unset: unset || [], patch, where: `keys[${index}]` };
        });
        const removals = (remove || []).map(entry => ({ item: movieItem(ani, entry.item), frames: entry.frames }));
        let deleted = 0;
        edit(ani, 'Set movie keys', () => {
            for (const { item, frames } of removals) for (const frame of frames) if (item.frames.delete(frame)) deleted++;
            for (const { item, frame, unset, patch, where } of writes) {
                writeKey(ani, item, frame, patch, where);
                const key = item.frames.get(frame);
                // A position is two numbers: the editor misreads a key that holds only one of them.
                const names = new Set(unset.map(name => name.toLowerCase()));
                if (names.has('dx') || names.has('dy')) { names.add('dx'); names.add('dy'); }
                for (const name of names) {
                    const stored = name === 'sprite' ? 'spriteIndex' : name;
                    delete key[stored];
                    if (key.attrs) { delete key.attrs[stored]; delete key.attrs[name === 'sprite' ? 'sprite #' : name]; }
                }
                if (key.attrs && !Object.keys(key.attrs).length) delete key.attrs;
                if (!Object.keys(key).length) item.frames.delete(frame);
            }
        });
        try { drawTimeline(); } catch (error) { console.warn('[mcp] gani timeline', error); }
        const touched = [...new Set([...writes.map(write => write.item), ...removals.map(entry => entry.item)])];
        const hidden = touched.filter(item => item.kind !== 'SOUND' && item.frames.size && !keyFrames(item).some(frame => ganiTrue(item.getKeyValue(item.frames.get(frame), 'visible'))));
        return {
            gani: ani.fileName, written: writes.length, deleted: deleted || undefined,
            items: touched.map(item => describeItem(ani, item, false)),
            warning: hidden.length ? `${hidden.map(item => item.name).join(', ')} never becomes visible: one of its keys has to set visible: true.` : undefined,
        };
    });

    // Loads what a movie draws with: the animations its actors play, and every image those and the keys name.
    async function loadMovieAssets(ani) {
        const missingImages = new Set(await loadImages(ani));
        const wanted = new Set();
        for (const item of ani.movieItems) {
            if (item.kind !== 'CHAR') continue;
            wanted.add(item.ani || 'idle');
            for (const key of item.frames.values()) if (key.ani) wanted.add(key.ani);
        }
        drawingAs(ani, undefined, () => { for (const name of wanted) getMovieActorGani({ ani: name }); });
        const deadline = Date.now() + 8000;
        while (movieGaniLoading.size && Date.now() < deadline) await h.sleep(25);
        const missingAnis = [];
        for (const name of wanted) {
            const sub = getMovieActorGaniKeys(name).map(key => movieGaniCache.get(key)).find(Boolean);
            if (!sub) { missingAnis.push(name); continue; }
            for (const image of await loadImages(sub)) missingImages.add(image);
        }
        for (const item of ani.movieItems) {
            for (const key of item.frames.values()) {
                const slots = [...MOVIE_IMAGES, ...Object.keys(key.attrs || {}).filter(name => /^(attr|param)([1-9]|[12][0-9]|30)$/.test(name))];
                for (const name of slots) {
                    const image = item.getKeyValue(key, name);
                    // attr and param slots can hold plain values as well as image names.
                    if (!image || (!MOVIE_IMAGES.includes(name) && !/\.(png|gif|mng|bmp|jpe?g)$/i.test(String(image)))) continue;
                    if (!await loadNamedImage(String(image))) missingImages.add(String(image));
                }
            }
        }
        if (document.fonts && document.fonts.load) await document.fonts.load('20px "Tempus Sans ITC"').catch(() => null);
        _spriteCompositeCache.clear();
        return { missingImages: [...missingImages], missingAnis };
    }

    // The box that holds everything visible in the given frames, in the movie's own pixels.
    function movieBounds(ani, frames) {
        return drawingAs(ani, undefined, () => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const frame of frames) {
                for (const item of ani.movieItems) {
                    if (item.kind === 'SOUND') continue;
                    const box = getMovieItemBounds(item, frame);
                    if (!box) continue;
                    minX = Math.min(minX, box.x); minY = Math.min(minY, box.y); maxX = Math.max(maxX, box.x + box.width); maxY = Math.max(maxY, box.y + box.height);
                    // What an actor says is drawn above it, outside its own box.
                    const state = item.kind === 'CHAR' ? item.getInterpolatedFrame(frame) : null;
                    if (state && state.chat) {
                        const label = getMovieLabelBounds({ text: state.chat, x: state.dx + 16, y: state.dy - 3, size: 20, baseline: 'bottom' });
                        minX = Math.min(minX, label.x); minY = Math.min(minY, label.y); maxX = Math.max(maxX, label.x + label.width); maxY = Math.max(maxY, label.y + label.height);
                    }
                }
            }
            if (!Number.isFinite(minX)) return { x: -32, y: -32, width: 64, height: 64 };
            return { x: Math.floor(minX) - 4, y: Math.floor(minY) - 4, width: Math.ceil(maxX - minX) + 8, height: Math.ceil(maxY - minY) + 8 };
        });
    }

    function drawMovieCell(ani, frame, view, scale, fill) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(view.width * scale));
        canvas.height = Math.max(1, Math.round(view.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.save();
        ctx.translate(-view.x * scale, -view.y * scale);
        ctx.scale(scale, scale);
        // As the editor's own export: no selection boxes, no name labels, no sounds played.
        const before = _isExportRender;
        try {
            _isExportRender = true;
            drawingAs(ani, Math.min(frame, ani.frames.length - 1), () => drawMovieFrame(ctx, frame));
        } finally {
            _isExportRender = before;
            ctx.restore();
        }
        return canvas;
    }


    function movieFrames(ani, frames, from, count, step) {
        if (frames && frames.length) {
            const bad = frames.filter(frame => frame >= ani.frameCount);
            if (bad.length) fail(`${ani.fileName} has frames 0-${ani.frameCount - 1}; got ${bad.join(', ')}.`);
            return frames;
        }
        if (from !== undefined || step !== undefined) {
            const first = from ?? 0;
            if (first >= ani.frameCount) fail(`${ani.fileName} has frames 0-${ani.frameCount - 1}; got ${first}.`);
            return Array.from({ length: count }, (_, index) => first + index * (step || 1)).filter(frame => frame < ani.frameCount);
        }
        // Spread over the whole movie, so one picture shows how it plays out.
        const shown = Math.min(count, ani.frameCount);
        return Array.from({ length: shown }, (_, index) => shown === 1 ? 0 : Math.round(index * (ani.frameCount - 1) / (shown - 1)));
    }

    mcp.tool({
        name: 'gani_render_movie',
        title: 'Render frames of a movie',
        description: 'See a movie: chosen frames drawn side by side, each labelled with its frame number and time, as the editor draws them (actors playing their animations, texts, sprites, chat). By default eight frames spread over the whole movie; give `frames` for exact ones, or from / count / step for a stretch. The result also lists what each item shows in each frame, so positions can be checked in numbers. Sounds are not drawn; gani_get_movie lists them.',
        input: {
            gani: GANI_ARG,
            frames: S.array(S.integer({ minimum: 0 }), 'The frames to draw'),
            from: S.integer('First frame of a stretch to draw', { minimum: 0 }),
            count: S.integer('How many frames to draw', { default: 8, minimum: 1, maximum: 48 }),
            step: S.integer('Frames between the ones drawn, with from', { minimum: 1 }),
            scale: S.number('Enlargement factor; chosen automatically when omitted', { minimum: 0.25, maximum: 6 }),
            background: S.string('"transparent", "canvas" or a colour such as "#3c8c3c"', { default: '#3c8c3c' }),
            view: MOVIE_VIEW,
        },
        readOnly: true,
        timeoutMs: 120000,
    }, async ({ gani, frames, from, count, step, scale, background, view }) => {
        await ready();
        const ani = resolve(gani);
        requireMovie(ani);
        const picked = movieFrames(ani, frames, from, count, step);
        if (picked.length > 48) fail(`That is ${picked.length} frames; at most 48 fit in one picture.`);
        const assets = await loadMovieAssets(ani);
        const fill = parseBackground(background);
        view = view || movieBounds(ani, picked);
        const columns = Math.min(picked.length, 8), rows = Math.ceil(picked.length / columns);
        scale = scale || Math.max(0.25, Math.min(4, Math.floor(Math.min(1600 / (columns * view.width), 1200 / (rows * view.height)) * 4) / 4)) || 1;
        if (columns * view.width * scale > 8000 || rows * view.height * scale > 8000) fail(`That picture would be ${Math.round(columns * view.width * scale)}x${Math.round(rows * view.height * scale)} pixels: the items are ${Math.round(view.width)}x${Math.round(view.height)} pixels apart. Draw fewer frames, lower scale, or give a view around the part to look at.`);
        const cells = picked.map(frame => drawMovieCell(ani, frame, view, scale, fill));
        const header = 16, gap = 4, cellWidth = cells[0].width, cellHeight = cells[0].height;
        const sheet = document.createElement('canvas');
        sheet.width = columns * (cellWidth + gap) + gap;
        sheet.height = rows * (cellHeight + header + gap) + gap;
        const ctx = sheet.getContext('2d');
        ctx.fillStyle = '#1b1b1b';
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.font = '11px monospace';
        ctx.textBaseline = 'middle';
        cells.forEach((cell, index) => {
            const x = gap + (index % columns) * (cellWidth + gap), y = gap + Math.floor(index / columns) * (cellHeight + header + gap);
            ctx.fillStyle = '#ddd';
            ctx.fillText(`#${picked[index]}  ${picked[index] * TICK_MS} ms`, x + 2, y + header / 2);
            ctx.drawImage(cell, x, y + header);
        });
        return mcp.result({
            gani: ani.fileName, frame_count: ani.frameCount, duration_ms: movieDuration(ani), scale, cell: `${cellWidth}x${cellHeight}`, view,
            frames: picked.map(frame => ({ frame, shows: drawingAs(ani, undefined, () => ani.movieItems.map(item => itemAt(item, frame)).filter(state => state && (state.visible || state.plays_now))) })),
            missing_images: assets.missingImages.length ? assets.missingImages : undefined,
            missing_actor_animations: assets.missingAnis.length ? assets.missingAnis : undefined,
        }, h.imagePart(sheet));
    });

    mcp.tool({
        name: 'gani_set_view',
        title: 'Control the gani editor view',
        description: 'Change what the gani editor is showing to the user: which animation, frame and direction, and whether the preview is playing. This does not change the animation.',
        input: {
            gani: GANI_ARG,
            frame: S.integer('Frame to show', { minimum: 0 }),
            direction: S.enum(DIRECTIONS, 'Direction to show'),
            playing: S.boolean('Start or stop the preview playback'),
        },
        idempotent: true,
    }, async ({ gani, frame, direction, playing }) => {
        await ready();
        const ani = resolve(gani);
        activate(ani);
        const tab = tabFor(ani);
        if (tab) window.tabManager.switchTo(tab.id);
        if (frame !== undefined && frame >= ani.frames.length) fail(`${ani.fileName} has frames 0-${ani.frames.length - 1}; got ${frame}.`);
        if (frame !== undefined) currentFrame = frame;
        if (direction !== undefined && !ani.singleDir) currentDir = DIRECTIONS.indexOf(direction);
        if (playing !== undefined && playing !== isPlaying) document.getElementById(isPlaying ? 'btnStop' : 'gani-btnPlay')?.click();
        refresh();
        return { gani: ani.fileName, frame: currentFrame, direction: ani.singleDir ? 'all' : DIRECTIONS[currentDir], playing: isPlaying };
    });
})();
