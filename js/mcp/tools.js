// GSuite MCP: tools for the suite's smaller tools: ParticleEmu (GS2 particle
// effects), the Setshape2 editor, the code beautifier and script checker, and
// the app's appearance and settings.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;
    const h = mcp.helpers;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) { resolve(); return; }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Could not load ${src}`));
            document.head.appendChild(script);
        });
    }

    // ---- ParticleEmu ---------------------------------------------------------------------------

    const PARTICLE_ASSETS = 'images/particleemu/';

    async function particleEngine() {
        if (!window.GraalParticleEmu) await loadScript('js/particleengine.js');
        return h.waitFor(() => window.GraalParticleEmu, 10000, 'the particle engine to load');
    }

    const particleTabReady = () => window.ParticleEmuRuntime && document.getElementById('viewport') && typeof ParticleEmuEditor !== 'undefined' && ParticleEmuEditor._content?.isConnected && document.getElementById('codeInput');

    async function particleTab() {
        if (!particleTabReady() || !window.tabManager.getTabsByType('particleemu').length) window.injectParticleEmu();
        await h.waitFor(particleTabReady, 15000, 'the ParticleEmu tab to open');
        // The tab restores its last session as it mounts; let that finish before touching the code.
        await h.sleep(150);
        return window.ParticleEmuRuntime;
    }

    function currentParticleCode(code) {
        if (code !== undefined) return code;
        if (!particleTabReady()) fail('Give the particle script in `code`, or open the ParticleEmu tab first (particle_set_code).');
        return window.ParticleEmuRuntime.getParticleCode();
    }

    function summarizeParticleConfig(config) {
        const emitters = config.emitters && config.emitters.length ? config.emitters : [config];
        return emitters.map(emitter => ({
            particle_types: (emitter.particles || []).length,
            images: [...new Set((emitter.particles || []).map(particle => particle.image).filter(Boolean))],
            delay: [emitter.delaymin, emitter.delaymax],
            particles_per_emission: emitter.nrofparticles,
            max_particles: emitter.maxparticles,
            emits_automatically: emitter.emitautomatically !== false,
            modifiers: (emitter.modifiers || []).length,
        }));
    }

    const STAGE = 1280;

    // Simulates a particle script at a fixed time step on a large stage filled with the background
    // colour (additive particles need something to add to), with the emitter at its centre.
    // Calls onFrame(index, time, stage, liveParticles) after each step.
    async function simulateParticles(code, seconds, fps, background, onFrame) {
        const engine = await particleEngine();
        if (!/emitter/i.test(code)) fail('No particle emitter was found in the script. A particle script sets up `emitter` on an image, e.g. `with (findimg(200)) { with (emitter) { ... with (particles[0]) { image = "g4_particle_spark.png"; ... } } }`. See the guide "particles", or start from particle_load_preset.');
        const config = engine.parseGS2ParticleCode(code);
        const stage = document.createElement('canvas');
        stage.width = stage.height = STAGE;
        const ctx = stage.getContext('2d', { alpha: true, willReadFrequently: true });
        const system = new engine.ParticleSystem(stage, ctx, { assetBaseUrl: PARTICLE_ASSETS });
        system.playSoundFile = () => {};
        config.x = 0;
        config.y = 0;
        await system.createEmitter(config);
        const wanted = new Set();
        for (const emitter of summarizeParticleConfig(config)) for (const name of emitter.images) wanted.add(name);
        const missing = [...wanted].filter(name => !system.imageCache[name]);
        const steps = Math.max(1, Math.round(seconds * fps)), step = 1 / fps;
        for (let index = 0; index < steps; index++) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, STAGE, STAGE);
            system.emitters.forEach(emitter => emitter.update(step, (index + 1) * step));
            ctx.save();
            ctx.translate(STAGE / 2, STAGE / 2);
            system.draw(ctx);
            ctx.restore();
            onFrame(index, (index + 1) * step, stage, system.emitters.reduce((total, emitter) => total + emitter.activeParticles.length, 0));
        }
        return { config, missing };
    }

    // The rectangle of the stage that differs from the background, or null when nothing was drawn.
    function drawnBounds(stage, background) {
        const data = stage.getContext('2d').getImageData(0, 0, STAGE, STAGE).data;
        const red = parseInt(background.slice(1, 3), 16), green = parseInt(background.slice(3, 5), 16), blue = parseInt(background.slice(5, 7), 16);
        let left = STAGE, top = STAGE, right = -1, bottom = -1;
        for (let y = 0, offset = 0; y < STAGE; y++) for (let x = 0; x < STAGE; x++, offset += 4) {
            if (Math.abs(data[offset] - red) + Math.abs(data[offset + 1] - green) + Math.abs(data[offset + 2] - blue) <= 12) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
        return right < left ? null : { left, top, right, bottom };
    }

    // Grows the union of bounds into a padded square inside the stage, so every frame shares one view.
    function viewFor(boundsList, minimum) {
        const found = boundsList.filter(Boolean);
        if (!found.length) return { x: (STAGE - minimum) / 2, y: (STAGE - minimum) / 2, size: minimum };
        const left = Math.min(...found.map(b => b.left)), top = Math.min(...found.map(b => b.top));
        const right = Math.max(...found.map(b => b.right)), bottom = Math.max(...found.map(b => b.bottom));
        const size = Math.min(STAGE, Math.max(minimum, right - left + 33, bottom - top + 33));
        const x = Math.max(0, Math.min(STAGE - size, Math.round((left + right) / 2 - size / 2)));
        const y = Math.max(0, Math.min(STAGE - size, Math.round((top + bottom) / 2 - size / 2)));
        return { x, y, size };
    }

    const copyOf = stage => { const copy = document.createElement('canvas'); copy.width = copy.height = STAGE; copy.getContext('2d').drawImage(stage, 0, 0); return copy; };

    function parseColor(value, name) {
        if (value === 'transparent') return null;
        if (!/^#[0-9a-f]{6}$/i.test(value)) fail(`${name} must be "transparent" or a colour like "#101820".`);
        return value;
    }

    mcp.tool({
        name: 'particle_render',
        title: 'Render a particle effect',
        description: 'Run a GS2 particle script off-screen and show how it looks over time: several snapshots side by side, each labelled with its time and the number of live particles, framed around wherever the particles are. Use it to see a particle effect you are writing without touching the editor. Without `code` it renders the script in the ParticleEmu tab. Bundled particle images include g4_particle_spark.png, g4_particle_smoke.png, g4_particle_halo.png, g4_particle_ring.png, g4_particle_leaf.png, g4_particle_bubble.png, smoke.png, fire.gif, light2.png, light4.png.',
        input: {
            code: S.string('The particle script (GS2). Defaults to the script in the ParticleEmu tab.'),
            seconds: S.number('How long to simulate', { default: 3, minimum: 0.1, maximum: 30 }),
            snapshots: S.integer('How many snapshots to show, spread over the time', { default: 4, minimum: 1, maximum: 8 }),
            size: S.integer('Width and height of each snapshot in pixels', { default: 320, minimum: 64, maximum: 640 }),
            background: S.string('A colour such as "#101820"', { default: '#101820' }),
        },
        readOnly: true,
        timeoutMs: 180000,
    }, async ({ code, seconds, snapshots, size, background }) => {
        code = currentParticleCode(code);
        const fill = parseColor(background, 'background') || '#101820';
        const fps = 30, steps = Math.max(1, Math.round(seconds * fps));
        const marks = Array.from({ length: snapshots }, (_, index) => Math.max(0, Math.round((index + 1) * steps / snapshots) - 1));
        const shots = [];
        let peak = 0;
        const { config, missing } = await simulateParticles(code, seconds, fps, fill, (index, time, stage, live) => {
            peak = Math.max(peak, live);
            if (marks.includes(index)) shots.push({ time, live, canvas: copyOf(stage) });
        });
        const view = viewFor(shots.map(shot => drawnBounds(shot.canvas, fill)), 96);
        const header = 18;
        const sheet = document.createElement('canvas');
        sheet.width = shots.length * (size + 2);
        sheet.height = size + header;
        const out = sheet.getContext('2d');
        out.fillStyle = '#1b1b1b';
        out.fillRect(0, 0, sheet.width, sheet.height);
        out.font = '11px monospace';
        out.textBaseline = 'middle';
        out.imageSmoothingEnabled = view.size > size;
        shots.forEach((shot, column) => {
            const x = column * (size + 2);
            out.drawImage(shot.canvas, view.x, view.y, view.size, view.size, x, header, size, size);
            out.fillStyle = '#fff';
            out.fillText(`t=${shot.time.toFixed(2)}s  ${shot.live} particles`, x + 4, header / 2);
        });
        const meta = {
            emitters: summarizeParticleConfig(config),
            snapshots: shots.map(shot => ({ time: Math.round(shot.time * 100) / 100, particles: shot.live })),
            peak_particles: peak,
            view: { note: 'pixels relative to the emitter position', x: view.x - STAGE / 2, y: view.y - STAGE / 2, width: view.size, height: view.size },
            missing_images: missing.length ? missing : undefined,
        };
        if (!peak) meta.note = 'No particle was ever alive. Check that the emitter emits automatically (emitautomatically = true) and that delaymin/delaymax are short enough for the time simulated.';
        return mcp.result(meta, h.imagePart(sheet));
    });

    mcp.tool({
        name: 'particle_get_state',
        title: 'Get the ParticleEmu state',
        description: 'The particle script currently in the ParticleEmu tab, its editor mode, and the names of the built-in presets. Opens the tab if needed.',
        readOnly: true,
    }, async () => {
        const runtime = await particleTab();
        return {
            code: runtime.getParticleCode(),
            playing: document.getElementById('btnPlayPause')?.textContent.trim() === 'Pause',
            visual_editor: document.querySelector('.particleemu-tab-content')?.classList.contains('visual-mode') || false,
            presets: [...(document.getElementById('presetSelect')?.options || [])].map(option => option.value),
        };
    });

    mcp.tool({
        name: 'particle_set_code',
        title: 'Load a particle script into ParticleEmu',
        description: 'Put a GS2 particle script into the ParticleEmu tab and run it, so the user sees the effect live. To look at the effect yourself use particle_render.',
        input: { code: S.string('The particle script (GS2)') },
        required: ['code'],
    }, async ({ code }) => {
        const engine = await particleEngine();
        const config = engine.parseGS2ParticleCode(code);
        const runtime = await particleTab();
        runtime.setEditorMode('raw');
        runtime.setParticleCode(code.replace(/\r\n/g, '\n'));
        runtime.stopParticles();
        runtime.togglePlayPause();
        runtime.saveSession();
        return { loaded: true, emitters: summarizeParticleConfig(config) };
    });

    mcp.tool({
        name: 'particle_load_preset',
        title: 'Load a ParticleEmu preset',
        description: 'Load one of ParticleEmu\'s built-in effects (Default Smoke, Soft Light Stream, Glow Burst, Magic Ring) into the tab and return its script: a working starting point for a new effect.',
        input: { preset: S.string('Preset name') },
        required: ['preset'],
    }, async ({ preset }) => {
        const runtime = await particleTab();
        const select = document.getElementById('presetSelect');
        const names = [...(select?.options || [])].map(option => option.value);
        const match = names.find(name => name.toLowerCase() === preset.toLowerCase());
        if (!match) fail(`No preset "${preset}". Presets: ${names.join(', ')}.`);
        select.value = match;
        runtime.loadEditorPreset();
        return { preset: match, code: runtime.getParticleCode() };
    });

    // How many bytes of frames an export may hold while it is recorded, and again while it is laid out.
    const PARTICLE_BUDGET = 200e6;

    // The box of pixels that are not transparent, or null when the picture is empty.
    function alphaBounds(image) {
        const { data, width, height } = image;
        let left = width, top = height, right = -1, bottom = -1;
        for (let y = 0, offset = 3; y < height; y++) for (let x = 0; x < width; x++, offset += 4) {
            if (data[offset] <= 8) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
        return right < left ? null : { left, top, right, bottom };
    }

    // Runs a particle script once on a transparent stage of the given size, emitter in the
    // middle, and keeps of every frame only the part that has something in it.
    async function recordParticles(code, seconds, fps, width, height) {
        const engine = await particleEngine();
        if (!/emitter/i.test(code)) fail('No particle emitter was found in the script. A particle script sets up `emitter` on an image, e.g. `with (findimg(200)) { with (emitter) { ... } }`.');
        const config = engine.parseGS2ParticleCode(code);
        if (!config) fail('The script could not be read as a particle emitter.');
        const stage = document.createElement('canvas');
        stage.width = width;
        stage.height = height;
        const ctx = stage.getContext('2d', { alpha: true, willReadFrequently: true });
        const system = new engine.ParticleSystem(stage, ctx, { assetBaseUrl: PARTICLE_ASSETS });
        system.playSoundFile = () => {};
        config.x = 0;
        config.y = 0;
        await system.createEmitter(config);
        const wanted = new Set();
        for (const emitter of summarizeParticleConfig(config)) for (const name of emitter.images) wanted.add(name);
        const missing = [...wanted].filter(name => !system.imageCache[name]);
        const steps = Math.max(1, Math.round(seconds * fps)), step = 1 / fps;
        const shots = [];
        let peak = 0, held = 0;
        for (let index = 0; index < steps; index++) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, width, height);
            system.emitters.forEach(emitter => emitter.update(step, (index + 1) * step));
            ctx.save();
            ctx.translate(width / 2, height / 2);
            system.draw(ctx);
            ctx.restore();
            peak = Math.max(peak, system.emitters.reduce((total, emitter) => total + emitter.activeParticles.length, 0));
            const bounds = alphaBounds(ctx.getImageData(0, 0, width, height));
            shots.push(bounds ? { bounds, image: ctx.getImageData(bounds.left, bounds.top, bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1) } : null);
            // Every frame stays in memory until the file is written, and once more when it is laid out.
            if (bounds) held += shots[index].image.data.length;
            if (held > PARTICLE_BUDGET) fail(`After ${index + 1} of ${steps} frames the effect already fills ${Math.round(held / 1e6)} MB; lower seconds, fps or the size.`);
        }
        return { shots, missing, peak };
    }

    // Lays the recorded frames out on pictures of one size: the given box of the stage, over a background colour if any.
    function composeParticles(shots, box, background) {
        const canvas = document.createElement('canvas');
        canvas.width = box.width;
        canvas.height = box.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const piece = document.createElement('canvas');
        return shots.map(shot => {
            ctx.clearRect(0, 0, box.width, box.height);
            if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, box.width, box.height); }
            if (shot) {
                piece.width = shot.image.width;
                piece.height = shot.image.height;
                piece.getContext('2d').putImageData(shot.image, 0, 0);
                ctx.drawImage(piece, shot.bounds.left - box.x, shot.bounds.top - box.y);
            }
            return ctx.getImageData(0, 0, box.width, box.height);
        });
    }

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function pngChunk(type, data) {
        const out = new Uint8Array(12 + data.length);
        const view = new DataView(out.buffer);
        view.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
        out.set(data, 8);
        view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
        return out;
    }

    async function zlib(bytes) {
        return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    }

    // An animated PNG: every frame whole, with full transparency, looping for ever.
    async function encodeApng(width, height, frames, delayMs) {
        const header = new Uint8Array(13);
        const headerView = new DataView(header.buffer);
        headerView.setUint32(0, width);
        headerView.setUint32(4, height);
        header.set([8, 6, 0, 0, 0], 8);
        const control = new Uint8Array(8);
        new DataView(control.buffer).setUint32(0, frames.length);
        const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('acTL', control)];
        let sequence = 0;
        for (let index = 0; index < frames.length; index++) {
            const frameControl = new Uint8Array(26);
            const view = new DataView(frameControl.buffer);
            view.setUint32(0, sequence++);
            view.setUint32(4, width);
            view.setUint32(8, height);
            view.setUint16(20, delayMs);
            view.setUint16(22, 1000);
            parts.push(pngChunk('fcTL', frameControl));
            // Each row of pixels is preceded by a byte that says it is stored as it is.
            const row = width * 4, raw = new Uint8Array((row + 1) * height), pixels = frames[index].data;
            for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
            const packed = await zlib(raw);
            if (index === 0) parts.push(pngChunk('IDAT', packed));
            else {
                const data = new Uint8Array(4 + packed.length);
                new DataView(data.buffer).setUint32(0, sequence++);
                data.set(packed, 4);
                parts.push(pngChunk('fdAT', data));
            }
        }
        parts.push(pngChunk('IEND', new Uint8Array(0)));
        const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const part of parts) { out.set(part, offset); offset += part.length; }
        return out;
    }

    const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

    // Plays the frames onto a canvas at their real speed while the browser records it.
    async function recordWebm(width, height, frames, fps) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
        const type = WEBM_TYPES.find(candidate => MediaRecorder.isTypeSupported(candidate));
        const recorder = new MediaRecorder(stream, { mimeType: type });
        const chunks = [];
        recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
        const stopped = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = event => reject(new Error(event.error?.message || 'the recorder failed'));
        });
        recorder.start();
        for (const frame of frames) {
            ctx.putImageData(frame, 0, 0);
            if (track.requestFrame) track.requestFrame();
            await h.sleep(1000 / fps);
        }
        recorder.stop();
        await stopped.catch(error => fail(`The WebM could not be recorded: ${error.message}. Use .gif or .png.`));
        const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
        if (!bytes.length) fail('The recorder produced no video. Use .gif or .png.');
        return bytes;
    }

    mcp.tool({
        name: 'particle_export',
        title: 'Export a particle effect',
        description: 'Render a particle script to an animation file, with the options of ParticleEmu\'s Export dialog. The extension of the path picks the format: .gif (works everywhere; a pixel is either there or not), .png (an animated PNG, which keeps soft, see-through edges and is the one to use for an effect over other art) or .webm (video, recorded in real time, no transparency). The effect is drawn with its emitter in the middle of a stage of width x height pixels; with crop, the file is trimmed to where particles actually went. Formats other than GIF depend on the window GSuite runs in, and the tool says so when one is missing.',
        input: {
            path: S.string('Absolute path of the file to write: .gif, .png (animated) or .webm'),
            code: S.string('The particle script (GS2). Defaults to the script in the ParticleEmu tab.'),
            seconds: S.number('Length of the animation', { default: 3, minimum: 0.1, maximum: 20 }),
            fps: S.integer('Frames per second', { default: 30, minimum: 5, maximum: 60 }),
            width: S.integer('Width of the stage in pixels', { default: 800, minimum: 32, maximum: 3840 }),
            height: S.integer('Height of the stage in pixels', { default: 600, minimum: 32, maximum: 2160 }),
            background: S.string('"transparent", "canvas" (the colour behind the effect in ParticleEmu) or a colour such as "#101820"', { default: 'transparent' }),
            crop: S.boolean('Trim to where the particles are, with a small margin, instead of keeping the whole stage', { default: true }),
        },
        required: ['path'],
        destructive: true,
        idempotent: true,
        openWorld: true,
        timeoutMs: 300000,
    }, async ({ path: target, code, seconds, fps, width, height, background, crop }) => {
        h.requireAbsolute(target, 'path');
        const format = { gif: 'gif', png: 'apng', webm: 'webm' }[h.path.ext(target)] || fail(`The export is a .gif, a .png (animated) or a .webm; got "${h.path.base(target)}".`);
        if (format === 'gif' && typeof _buildGIF !== 'function') fail('The GIF encoder is part of the gani editor, which has not finished loading. Try again in a moment.');
        if (format === 'apng' && typeof CompressionStream === 'undefined') fail('Animated PNG export needs CompressionStream, which the window GSuite is running in does not provide. Use .gif.');
        if (format === 'webm' && (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream || !WEBM_TYPES.some(type => MediaRecorder.isTypeSupported(type)))) fail('The window GSuite is running in cannot record WebM video. Use .gif or .png.');
        const count = Math.max(1, Math.round(seconds * fps));
        // Every frame is held in memory until the file is written.
        if (!crop && count * width * height * 4 > PARTICLE_BUDGET) fail(`${count} frames of ${width}x${height} is too much to hold in memory; turn crop on, or lower seconds, fps or the size.`);
        code = currentParticleCode(code);
        const fill = background === 'canvas' ? (localStorage.getItem('gsuiteParticleViewportBgColor') || '#006400') : parseColor(background, 'background');
        const { shots, missing, peak } = await recordParticles(code, seconds, fps, width, height);
        let box = { x: 0, y: 0, width, height };
        const seen = shots.filter(Boolean).map(shot => shot.bounds);
        if (crop && seen.length) {
            const left = Math.max(0, Math.min(...seen.map(b => b.left)) - 8), top = Math.max(0, Math.min(...seen.map(b => b.top)) - 8);
            const right = Math.min(width - 1, Math.max(...seen.map(b => b.right)) + 8), bottom = Math.min(height - 1, Math.max(...seen.map(b => b.bottom)) + 8);
            box = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
        }
        if (count * box.width * box.height * 4 > PARTICLE_BUDGET) fail(`${count} frames of ${box.width}x${box.height} is too much to hold in memory; lower seconds, fps or the size.`);
        const frames = composeParticles(shots, box, fill);
        let bytes;
        if (format === 'gif') {
            const yieldBefore = window._exportYield;
            window._exportYield = () => Promise.resolve();
            try { bytes = await _buildGIF(box.width, box.height, frames.map(imageData => ({ imageData, delayMs: Math.round(1000 / fps) })), true, null); } finally { window._exportYield = yieldBefore; }
            if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
        } else if (format === 'apng') bytes = await encodeApng(box.width, box.height, frames, Math.round(1000 / fps));
        else bytes = await recordWebm(box.width, box.height, frames, fps);
        await h.files.write(target, bytes);
        return {
            path: h.path.normalize(target), format, frames: frames.length, size: `${box.width}x${box.height}`, bytes: bytes.length,
            cropped_to: crop && seen.length ? { note: 'pixels relative to the emitter', x: box.x - width / 2, y: box.y - height / 2, width: box.width, height: box.height } : undefined,
            note: peak ? undefined : 'No particle was ever alive, so the file is empty. Check that the emitter emits automatically and that its delays are short enough for the time simulated.',
            missing_images: missing.length ? missing : undefined,
        };
    });

    // ---- Setshape2 -----------------------------------------------------------------------------

    const SHAPE_TYPES = { 0: 'nonblock', 2: 'hurt', 3: 'chair', 4: 'bed_upper', 5: 'bed_lower', 6: 'swamp', 7: 'lava_swamp', 8: 'shallow_water', 11: 'water', 12: 'lava', 20: 'throw_through', 21: 'jumping', 22: 'blocking' };
    const SHAPE_IDS = Object.fromEntries(Object.entries(SHAPE_TYPES).map(([id, name]) => [name, Number(id)]));
    const SHAPE_LEGEND = Object.entries(SHAPE_TYPES).map(([id, name]) => `${id} ${name}`).join(', ');

    function shapeCode(width, height, tiles, style, indent) {
        const pad = ' '.repeat(indent * 2);
        let out = style === 'gs1' ? `${pad}setshape2 ${width},${height},{\n` : `${pad}setshape2(${width},${height},{\n`;
        for (let row = 0; row < height; row++) out += `${pad}  ${tiles.slice(row * width, row * width + width).map(value => String(value).padEnd(2, ' ') + ',').join('')}\n`;
        return out + (style === 'gs1' ? `${pad}};` : `${pad}});`);
    }

    function parseShape(code) {
        const match = /setshape2\s*\(?\s*["']?(\d+)["']?\s*,\s*(\d+)\s*,\s*\{([\s\S]*?)\}/.exec(code);
        if (!match) fail('No setshape2 statement found. It looks like `setshape2(2,2,{22,22,22,22});` (GS2) or `setshape2 2,2,{22,22,22,22};` (GS1).');
        const width = Number(match[1]), height = Number(match[2]);
        const values = (match[3].match(/\d+/g) || []).map(Number);
        if (values.length !== width * height) fail(`The setshape2 statement says ${width}x${height} (${width * height} tiles) but lists ${values.length}.`);
        return { width, height, tiles: values };
    }

    async function shapeEditor() {
        return h.waitFor(() => window.__setshapeEditorInstance, 10000, 'the Setshape2 editor to load (open its tab with app_open_tool)');
    }

    // Puts a shape into the Setshape2 editor's grid, top-left aligned, as one undo step. Showing it
    // is a courtesy to the user: the tools' answers do not depend on the editor being there.
    function showShape(width, height, tiles) {
        const editor = window.__setshapeEditorInstance;
        if (!editor) return;
        editor._pushHistory();
        editor._resizeGrid(Math.max(editor.gridWidth, width), Math.max(editor.gridHeight, height));
        editor.tileMap.fill(0);
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) editor.tileMap[column + row * editor.gridWidth] = tiles[row * width + column];
        editor._render();
    }

    mcp.tool({
        name: 'setshape_generate',
        title: 'Generate setshape2 code',
        description: 'Build a setshape2 statement, which gives an NPC a custom collision shape tile by tile. Describe the shape as rows of tile types, by id or name. Types: ' + SHAPE_LEGEND + '. The shape is also loaded into the Setshape2 editor tab.',
        input: {
            rows: S.array(S.array({ type: ['integer', 'string'] }), 'The shape as rows (top to bottom) of tile types, e.g. [[22,22],[0,0]] or [["blocking","blocking"],["nonblock","nonblock"]]'),
            style: S.enum(['gs2', 'gs1'], 'Script dialect of the output', { default: 'gs2' }),
            indent: S.integer('Indent levels (two spaces each)', { default: 0, minimum: 0, maximum: 8 }),
        },
        required: ['rows'],
    }, async ({ rows, style, indent }) => {
        const height = rows.length, width = Math.max(0, ...rows.map(row => row.length));
        if (!width || !height) fail('rows is empty.');
        if (width > 64 || height > 64) fail('A shape can be at most 64x64 tiles.');
        const tiles = [];
        const short = rows.findIndex(row => row.length !== width);
        if (short >= 0) fail(`rows[${short}] has ${rows[short].length} tiles and the widest row has ${width}; every row needs the same number (use 0 for tiles that do not block).`);
        rows.forEach((row, rowIndex) => {
            for (let column = 0; column < width; column++) {
                const value = row[column];
                const id = typeof value === 'string' ? SHAPE_IDS[value.toLowerCase()] : value;
                if (id === undefined || SHAPE_TYPES[id] === undefined) fail(`rows[${rowIndex}][${column}] is "${value}", which is not a tile type. Types: ${SHAPE_LEGEND}.`);
                tiles.push(id);
            }
        });
        showShape(width, height, tiles);
        return { width, height, code: shapeCode(width, height, tiles, style, indent) };
    });

    mcp.tool({
        name: 'setshape_parse',
        title: 'Read setshape2 code',
        description: 'Parse a setshape2 statement (GS1 or GS2) into its size and rows of tile types, and load it into the Setshape2 editor tab.',
        input: { code: S.string('Script text containing a setshape2 statement') },
        required: ['code'],
    }, async ({ code }) => {
        const { width, height, tiles } = parseShape(code);
        showShape(width, height, tiles);
        return { width, height, rows: Array.from({ length: height }, (_, row) => tiles.slice(row * width, row * width + width)), types: SHAPE_TYPES };
    });

    mcp.tool({
        name: 'setshape_get',
        title: 'Get the Setshape2 editor\'s shape',
        description: 'The shape currently painted in the Setshape2 editor tab, as rows of tile types and as setshape2 code.',
        input: { style: S.enum(['gs2', 'gs1'], 'Script dialect of the output', { default: 'gs2' }) },
        readOnly: true,
    }, async ({ style }) => {
        const editor = await shapeEditor();
        let width = 0, height = 0;
        for (let row = 0; row < editor.gridHeight; row++) for (let column = 0; column < editor.gridWidth; column++) {
            if (editor.tileMap[column + row * editor.gridWidth] > 0) { width = Math.max(width, column + 1); height = Math.max(height, row + 1); }
        }
        if (!width) return { empty: true, note: 'Nothing is painted in the Setshape2 editor.' };
        const tiles = [];
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) tiles.push(editor.tileMap[column + row * editor.gridWidth]);
        return { width, height, rows: Array.from({ length: height }, (_, row) => tiles.slice(row * width, row * width + width)), code: shapeCode(width, height, tiles, style, 0), image: editor.currentImageFile?.name || undefined };
    });

    mcp.tool({
        name: 'setshape_setimgpart',
        title: 'Generate setimgpart code',
        description: 'Build a setimgpart statement, which makes an NPC show only a rectangle of its image (one sprite out of a sheet).',
        input: {
            image: S.string('Image file name'),
            x: S.integer('Left edge of the rectangle in pixels', { minimum: 0 }),
            y: S.integer('Top edge in pixels', { minimum: 0 }),
            width: S.integer('Width in pixels', { minimum: 1 }),
            height: S.integer('Height in pixels', { minimum: 1 }),
            style: S.enum(['gs2', 'gs1'], 'Script dialect of the output', { default: 'gs2' }),
        },
        required: ['image', 'x', 'y', 'width', 'height'],
        readOnly: true,
    }, async ({ image, x, y, width, height, style }) => {
        if (/["\\\r\n]/.test(image)) fail('The image name cannot contain a double quote, a backslash or a line break.');
        return { code: style === 'gs1' ? `setimgpart ${image},${x},${y},${width},${height};` : `setimgpart("${image}", ${x}, ${y}, ${width}, ${height});` };
    });

    // ---- Scripts -------------------------------------------------------------------------------

    mcp.tool({
        name: 'script_format',
        title: 'Format GraalScript',
        description: 'Run GraalScript through the suite\'s Code Beautifier: re-indent it, and optionally strip comments and blank lines. Returns the formatted code. Re-indenting lays the code out afresh, which also drops blank lines.',
        input: {
            code: S.string('The script'),
            beautify: S.boolean('Re-indent and lay out the code', { default: true }),
            strip_comments: S.boolean('Remove comments (//#CLIENTSIDE and other directives are kept)', { default: false }),
            strip_blank_lines: S.boolean('Remove blank lines and trailing spaces', { default: false }),
            indent: S.enum(['2', '4', 'tab'], 'Indent width', { default: '2' }),
        },
        required: ['code'],
        readOnly: true,
    }, async ({ code, beautify, strip_comments, strip_blank_lines, indent }) => {
        const tool = await h.waitFor(() => window.BeautifyTool, 10000, 'the Code Beautifier to load');
        if (strip_comments) code = tool._stripComments(code);
        if (strip_blank_lines) code = code.split('\n').filter(line => line.trim() !== '').map(line => line.trimEnd()).join('\n');
        if (beautify) {
            await Promise.resolve(tool._ensureBeautifyLib()).catch(() => null);
            let formatted = null;
            if (typeof window.js_beautify === 'function') {
                try {
                    formatted = tool._compactSimpleLiterals(window.js_beautify(code, { indent_size: indent === 'tab' ? 1 : Number(indent), indent_char: indent === 'tab' ? '\t' : ' ', wrap_line_length: 0, brace_style: 'collapse', preserve_newlines: false, max_preserve_newlines: 0 }));
                } catch (error) { formatted = null; }
            }
            code = formatted ?? tool._simpleBeautify(code, indent);
        }
        return code;
    });

    mcp.tool({
        name: 'script_check',
        title: 'Check GraalScript syntax',
        description: 'Check a script for structural mistakes with the editor\'s linter: unclosed comments, strings and brackets, `if`/`while`/`for`/`function` without parentheses, misplaced `else`, and statements that look like they are missing a semicolon. It does not check names or logic. An empty list means nothing was found.',
        input: { code: S.string('The script') },
        required: ['code'],
        readOnly: true,
    }, async ({ code }) => {
        await mcp.helpers.level.editor();
        const markers = LevelEditor.prototype._gsLint.call(null, code) || [];
        return { problems: markers.map(marker => ({ line: marker.startLineNumber, column: marker.startColumn, severity: marker.severity >= 8 ? 'error' : 'warning', message: marker.message })) };
    });

    // ---- Bundled files and images -------------------------------------------------------------

    const BUNDLED = { images: 'images', particle_images: 'images/particleemu', ganis: 'ganis', levels: 'levels', sounds: 'sounds', npcs: 'objects' };

    mcp.tool({
        name: 'app_list_bundled_files',
        title: 'List files bundled with GSuite',
        description: 'The files that ship inside GSuite and resolve by name without a workspace: images (sprites.png, heads, bodies, swords, shields, door.png, tilesets, ...), particle images, the classic player animations, example levels, sounds and NPC templates. Use it to find an image name for an NPC or a gani sprite; look at one with app_view_image.',
        input: {
            kind: S.enum(Object.keys(BUNDLED), 'Which files to list'),
            query: S.string('Only names containing this text', { default: '' }),
        },
        required: ['kind'],
        readOnly: true,
    }, async ({ kind, query }) => {
        const names = await h.invoke('ListBundled', BUNDLED[kind]).catch(error => fail(`Could not list bundled ${kind}: ${error.message || error}`));
        const matches = names.filter(name => name !== 'index.json' && name.toLowerCase().includes(query.toLowerCase()));
        return { kind, count: matches.length, files: matches };
    });

    function loadImageElement(url) {
        return new Promise(resolve => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    async function findImage(name) {
        const fromBytes = async target => {
            const bytes = await h.files.readBytes(target);
            const url = URL.createObjectURL(new Blob([bytes]));
            const image = await loadImageElement(url);
            URL.revokeObjectURL(url);
            return image;
        };
        if (h.path.isAbsolute(name)) {
            const info = await h.files.stat(name);
            if (!info.exists || info.isDir) fail(`No such file: ${name}`);
            return await fromBytes(name) || fail(`${name} could not be read as an image.`);
        }
        for (const folder of ['images/', 'images/particleemu/']) {
            const image = await loadImageElement(folder + name);
            if (image) return image;
        }
        if (window.__GSUITE__) {
            const found = await h.invoke('ResolvePath', name.toLowerCase()).catch(() => '');
            if (found) return await fromBytes(found) || fail(`${name} could not be read as an image.`);
        }
        fail(`No image named "${name}" is bundled with GSuite or in the workspace folder. app_list_bundled_files and workspace_find_files list what there is.`);
    }

    mcp.tool({
        name: 'app_view_image',
        title: 'Look at an image file',
        description: 'Show an image: one bundled with GSuite (sprites.png, head19.png, body.png, door.png, ...), one in the workspace folder, or any image by absolute path. Pixel coordinates are printed along the edges with grid lines every `grid` pixels, so you can read off the rectangles to use for gani sprites and setimgpart. Give a region to zoom in on part of a large sheet.',
        input: {
            image: S.string('Image file name, or an absolute path'),
            x: S.integer('Left edge of the region to show, in pixels', { default: 0, minimum: 0 }),
            y: S.integer('Top edge of the region, in pixels', { default: 0, minimum: 0 }),
            width: S.integer('Width of the region in pixels; defaults to the rest of the image', { minimum: 1 }),
            height: S.integer('Height of the region in pixels; defaults to the rest of the image', { minimum: 1 }),
            grid: S.integer('Spacing of the grid lines in pixels', { default: 16, minimum: 4, maximum: 256 }),
            scale: S.integer('Enlargement factor; chosen to fit when omitted', { minimum: 1, maximum: 8 }),
        },
        required: ['image'],
        readOnly: true,
        openWorld: true,
    }, async ({ image: name, x, y, width, height, grid, scale }) => {
        const image = await findImage(name);
        if (x >= image.width || y >= image.height) fail(`${name} is ${image.width}x${image.height} pixels; the region starts outside it.`);
        width = Math.min(width ?? image.width - x, image.width - x);
        height = Math.min(height ?? image.height - y, image.height - y);
        scale = scale || Math.max(1, Math.min(8, Math.floor(960 / Math.max(width, height))));
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
        const step = [1, 2, 4, 8, 16].find(count => count * grid * scale >= 30) || 16;
        const framed = h.withGrid(canvas, { x: x / grid, y: y / grid, width: width / grid, height: height / grid, pixelsPerTile: grid * scale, step, labelScale: grid });
        return mcp.result({ image: name, size: `${image.width}x${image.height}`, showing: { x, y, width, height }, scale, grid_every_pixels: grid * step }, h.imagePart(framed));
    });

    // ---- Appearance and settings --------------------------------------------------------------

    const colorSchemes = () => [...new Set([...document.querySelectorAll('.color-scheme-item[data-scheme]')].map(item => item.dataset.scheme))];

    mcp.tool({
        name: 'app_get_settings',
        title: 'Get app settings',
        description: 'The app\'s appearance and editor settings: colour scheme, whether a custom CSS theme is applied, editor fonts and scale, play-mode options, key bindings, the play-mode player\'s look, and the MCP server status.',
        readOnly: true,
    }, async () => {
        const le = await mcp.helpers.level.editor();
        const css = localStorage.getItem('gsuite_customCSS') || '';
        return {
            color_scheme: localStorage.getItem('editorColorScheme') || 'default',
            color_schemes: colorSchemes(),
            custom_css: css ? { applied: true, characters: css.length } : { applied: false },
            editor: le._getSettings(),
            keybinds: le._getKeybinds(),
            player: le._playerSettings || JSON.parse(localStorage.getItem('graal_playerSettings') || 'null') || le._defaultPlayerSettings(),
            gani_editor: ganiSettings(),
            gani_keybinds: typeof keybinds !== 'undefined' ? { ...keybinds } : undefined,
            mcp: await mcp.status().catch(() => null),
        };
    });

    // The gani editor's Settings dialog: where each setting is stored and how it is put into effect.
    // The editor's own functions (window.ganiSettings) apply and store a value in one go.
    const GANI_SETTINGS = {
        font: { key: 'editorFont', type: 'string', fallback: 'chevyray', apply: 'applyFont' },
        font_size: { key: 'editorFontSize', type: 'number', fallback: 12, allowed: [8, 10, 12, 14, 16, 18, 20], apply: 'applyFontSize' },
        font_style: { key: 'editorFontStyle', type: 'string', fallback: 'normal', allowed: ['normal', 'italic', 'bold', 'bold italic'], apply: 'applyFontStyle' },
        ui_scale: { key: 'editorUIScale', type: 'number', fallback: 1, minimum: 0.5, maximum: 2, apply: 'applyUIScale' },
        swap_keys: { key: 'editorSwapKeys', type: 'boolean', fallback: false },
        pixel_rendering: { key: 'editorPixelRendering', type: 'boolean', fallback: true, apply: 'applyPixelRendering' },
        auto_save: { key: 'editorAutoSave', type: 'boolean', fallback: true },
        show_grid: { key: 'editorShowGrid', type: 'boolean', fallback: true, apply: 'applyShowGrid' },
        show_gani_guides: { key: 'editorShowGaniGuides', type: 'boolean', fallback: true, apply: 'applyShowGaniGuides' },
        gif_animations: { key: 'editorGifAnimations', type: 'boolean', fallback: true, apply: 'applyGifAnimations' },
        light_effects: { key: 'editorLightEffects', type: 'boolean', fallback: true, apply: 'applyLightEffects' },
        show_placeholders: { key: 'editorShowPlaceholders', type: 'boolean', fallback: true },
        timeline_previews: { key: 'editorTimelinePreviews', type: 'boolean', fallback: true, apply: 'applyTimelinePreviews' },
        selection_border_color: { key: 'editorSelectionBorderColor', type: 'string', fallback: '#00ff00', pattern: /^#[0-9a-f]{6}$/i, apply: 'applySelectionBorderColor' },
        selection_border_thickness: { key: 'editorSelectionBorderThickness', type: 'number', whole: true, fallback: 2, minimum: 1, maximum: 10, apply: 'applySelectionBorderThickness' },
        selection_border_opacity: { key: 'editorSelectionBorderOpacity', type: 'number', whole: true, fallback: 100, minimum: 0, maximum: 100, apply: 'applySelectionBorderOpacity' },
    };

    function ganiSettings() {
        const out = {};
        for (const [name, setting] of Object.entries(GANI_SETTINGS)) {
            const stored = localStorage.getItem(setting.key);
            if (setting.type === 'boolean') out[name] = stored === null ? setting.fallback : stored === 'true';
            else if (setting.type === 'number') out[name] = stored === null || !Number.isFinite(Number(stored)) ? setting.fallback : Number(stored);
            else out[name] = stored || setting.fallback;
        }
        return out;
    }

    function checkGaniSettings(changes) {
        const unknown = Object.keys(changes).filter(name => !Object.hasOwn(GANI_SETTINGS, name));
        if (unknown.length) fail(`Unknown gani editor setting ${unknown.join(', ')}. Settings: ${Object.keys(GANI_SETTINGS).join(', ')}.`);
        for (const [name, value] of Object.entries(changes)) {
            const setting = GANI_SETTINGS[name];
            if (typeof value !== setting.type) fail(`gani_editor.${name} must be a ${setting.type}.`);
            if (setting.allowed && !setting.allowed.includes(value)) fail(`gani_editor.${name} must be one of ${setting.allowed.join(', ')}.`);
            if (setting.minimum !== undefined && (value < setting.minimum || value > setting.maximum)) fail(`gani_editor.${name} must be from ${setting.minimum} to ${setting.maximum}.`);
            if (setting.whole && !Number.isInteger(value)) fail(`gani_editor.${name} must be a whole number.`);
            if (setting.pattern && !setting.pattern.test(value)) fail(`gani_editor.${name} must be a colour like "#00ff00".`);
        }
    }

    function updateGaniSettings(changes) {
        const applier = window.ganiSettings || {};
        for (const [name, value] of Object.entries(changes)) {
            const setting = GANI_SETTINGS[name];
            localStorage.setItem(setting.key, String(value));
            try {
                if (setting.apply && typeof applier[setting.apply] === 'function') applier[setting.apply](value, true);
                if (name === 'swap_keys' && typeof updateSwapKeysUI === 'function') { keysSwapped = value; updateSwapKeysUI(); }
                // The timeline is laid out again on an animation frame, which does not come while the window is hidden.
                if (name === 'timeline_previews' && typeof drawTimeline === 'function') { resizeCanvas(); drawTimeline(); }
            } catch (error) { console.warn('[mcp] gani setting', name, error); }
        }
        // The size of the text depends on the scale, which is worked out when the scale is applied.
        if (('font_size' in changes || 'ui_scale' in changes) && typeof applier.applyUIScale === 'function') {
            try { applier.applyUIScale(Number(localStorage.getItem('editorUIScale') || 1), true); } catch (error) { console.warn('[mcp] gani setting ui_scale', error); }
        }
        if (typeof redraw === 'function') redraw();
    }

    // Bindings are matched without regard to case, so "Ctrl+S" and "ctrl+s" are the same key.
    const sameKey = (a, b) => a === b || (a.trim() && a.trim().toLowerCase() === b.trim().toLowerCase());

    function checkGaniKeybinds(changes) {
        if (typeof keybinds === 'undefined' || typeof saveKeybinds !== 'function') fail('The gani editor has not finished loading. Try again in a moment.');
        const unknown = Object.keys(changes).filter(action => !Object.hasOwn(DEFAULT_KEYBINDS, action));
        if (unknown.length) fail(`Unknown gani editor action ${unknown.join(', ')}. Actions: ${Object.keys(DEFAULT_KEYBINDS).join(', ')}.`);
        for (const [action, binding] of Object.entries(changes)) {
            if (typeof binding !== 'string') fail(`gani_keybinds.${action} must be a key such as "F5", "ctrl+s" or " " (space); an empty string restores "${DEFAULT_KEYBINDS[action]}".`);
        }
        const next = { ...keybinds };
        for (const [action, binding] of Object.entries(changes)) next[action] = binding === '' ? DEFAULT_KEYBINDS[action] : binding;
        const clashes = Object.keys(changes).flatMap(action => Object.keys(next).filter(other => other !== action && sameKey(next[other], next[action]) && !sameKey(keybinds[other], keybinds[action])).map(other => `${action} and ${other} (${next[action]})`));
        if (clashes.length) fail(`That would give two gani editor actions the same key: ${clashes.join('; ')}. Change one of them in the same call.`);
        return next;
    }

    function updateGaniKeybinds(next) {
        for (const [action, binding] of Object.entries(next)) keybinds[action] = binding;
        saveKeybinds();
    }

    mcp.tool({
        name: 'app_update_settings',
        title: 'Change app settings',
        description: 'Change the colour scheme, editor settings, key bindings, or the play-mode player. Only the fields you give change. editor fields: uiFont, uiFontSize, uiFontStyle, uiScale, voidColor, nickFontSize, chatFontSize, playFlowers, objectPickup. player fields: nick, HEAD, BODY, SWORD, SHIELD, ATTR1, colors.',
        input: {
            color_scheme: S.string('Built-in colour scheme (see app_get_settings for the list). Choosing one removes a custom CSS theme.'),
            editor: S.object({}, [], 'Editor settings to change'),
            player: S.object({}, [], 'Play-mode player settings to change'),
            keybinds: S.object({}, [], 'Key bindings to change, by action name as listed in app_get_settings, e.g. {"playMode": "F5", "save": "ctrl+s"}'),
            gani_editor: S.object({}, [], 'Settings of the gani editor to change, by the names app_get_settings lists under gani_editor: fonts and ui_scale, pixel_rendering, show_grid, show_gani_guides, show_placeholders, timeline_previews, swap_keys, the selection border, and so on'),
            gani_keybinds: S.object({}, [], 'Key bindings of the gani editor to change, by action as listed in app_get_settings under gani_keybinds, e.g. {"play": "F5"}; modifiers are written ctrl+, shift+, alt+'),
        },
    }, async ({ color_scheme, editor, player, keybinds: levelKeybinds, gani_editor, gani_keybinds }) => {
        const le = await mcp.helpers.level.editor();
        // Everything is checked before anything changes.
        let levelKeys = null;
        if (color_scheme !== undefined && !colorSchemes().includes(color_scheme)) fail(`Unknown colour scheme "${color_scheme}". Schemes: ${colorSchemes().join(', ')}.`);
        if (editor) {
            const current = le._getSettings();
            const unknown = Object.keys(editor).filter(key => !Object.hasOwn(current, key));
            if (unknown.length) fail(`Unknown editor setting ${unknown.join(', ')}. Settings: ${Object.keys(current).join(', ')}.`);
            const wrong = Object.keys(editor).filter(key => typeof editor[key] !== typeof current[key]);
            if (wrong.length) fail(`${wrong.map(key => `${key} must be a ${typeof current[key]} (it is ${JSON.stringify(current[key])} now)`).join('; ')}.`);
        }
        if (levelKeybinds) {
            const current = le._getKeybinds();
            const unknown = Object.keys(levelKeybinds).filter(key => !Object.hasOwn(current, key));
            if (unknown.length) fail(`Unknown key binding ${unknown.join(', ')}. Actions: ${Object.keys(current).join(', ')}.`);
            for (const [action, binding] of Object.entries(levelKeybinds)) {
                if (typeof binding !== 'string') fail(`keybinds.${action} must be a key such as "F5", "ctrl+s" or " " (space); an empty string restores "${_DEFAULT_KB[action]}".`);
            }
            levelKeys = { ...current };
            for (const [action, binding] of Object.entries(levelKeybinds)) levelKeys[action] = binding === '' ? _DEFAULT_KB[action] : binding;
            // Editing keys may share a binding with play-mode keys (e is both erase and grab), so only report a clash a change introduces.
            const clashes = Object.keys(levelKeybinds).flatMap(action => Object.keys(levelKeys).filter(other => other !== action && levelKeys[other] === levelKeys[action] && current[other] !== current[action]).map(other => `${action} and ${other} (${levelKeys[action]})`));
            if (clashes.length) fail(`That would give two actions the same key: ${clashes.join('; ')}. Change one of them in the same call.`);
        }
        if (player) {
            const defaults = le._defaultPlayerSettings();
            const unknown = Object.keys(player).filter(key => !Object.hasOwn(defaults, key));
            if (unknown.length) fail(`Unknown player setting ${unknown.join(', ')}. Settings: ${Object.keys(defaults).join(', ')}.`);
            const kind = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
            const wrong = Object.keys(player).filter(key => kind(player[key]) !== kind(defaults[key]));
            if (wrong.length) fail(`${wrong.map(key => `${key} must be a ${kind(defaults[key])} (it is ${JSON.stringify(defaults[key])} by default)`).join('; ')}.`);
        }
        if (gani_editor) checkGaniSettings(gani_editor);
        const ganiKeys = gani_keybinds ? checkGaniKeybinds(gani_keybinds) : null;

        if (gani_editor) updateGaniSettings(gani_editor);
        if (ganiKeys) updateGaniKeybinds(ganiKeys);
        if (color_scheme !== undefined) {
            localStorage.removeItem('gsuite_customCSS');
            window.refreshCustomCSSLayer('');
            le.applyColorScheme(color_scheme);
        }
        if (editor) {
            const current = le._getSettings();
            const next = { ...current, ...editor };
            le._saveSettings(next);
            le._applyUISettings(next);
        }
        if (player) {
            const next = { ...(le._playerSettings || JSON.parse(localStorage.getItem('graal_playerSettings') || 'null') || le._defaultPlayerSettings()), ...player };
            le._playerSettings = next;
            localStorage.setItem('graal_playerSettings', JSON.stringify(next));
        }
        if (levelKeys) {
            le._saveKeybinds(levelKeys);
            le._updateToolButtonTooltips();
        }
        if (le.level?.tilesetImage) le.render();
        return {
            color_scheme: localStorage.getItem('editorColorScheme') || 'default', editor: le._getSettings(), player: le._playerSettings || undefined, keybinds: levelKeybinds ? le._getKeybinds() : undefined,
            gani_editor: gani_editor ? ganiSettings() : undefined, gani_keybinds: gani_keybinds ? { ...keybinds } : undefined,
        };
    });

    async function exampleTheme() {
        const response = await fetch('example-theme.css', { cache: 'no-store' }).catch(() => null);
        if (!response || !response.ok) fail('The example theme that ships with the app could not be read.');
        return response.text();
    }

    mcp.tool({
        name: 'app_get_custom_css',
        title: 'Read the custom CSS theme',
        description: 'The CSS text of the custom theme that is applied (empty when none is), or, with example, of the example theme that ships with the app: a complete, commented theme showing the variables and selectors a theme can set, and the place to start a theme of your own from.',
        input: { example: S.boolean('Return the example theme instead of the one applied', { default: false }) },
        readOnly: true,
    }, async ({ example }) => {
        const css = example ? await exampleTheme() : localStorage.getItem('gsuite_customCSS') || '';
        return { source: example ? 'example-theme.css' : 'applied theme', applied: example ? undefined : !!css, characters: css.length, css };
    });

    mcp.tool({
        name: 'app_set_custom_css',
        title: 'Apply a custom CSS theme',
        description: 'Apply a custom CSS theme to the whole suite, as the Custom CSS dialog does: your own CSS, or the example theme that ships with the app (example: true). An empty css removes the custom theme. app_get_custom_css reads the theme in use and the example.',
        input: {
            css: S.string('The CSS text; empty to remove the custom theme'),
            example: S.boolean('Apply the example theme that ships with the app', { default: false }),
        },
        idempotent: true,
    }, async ({ css, example }) => {
        const le = await mcp.helpers.level.editor();
        if (example && css) fail('Give css or example, not both.');
        if (!example && css === undefined) fail('Give the css to apply (empty to remove the theme), or example: true.');
        if (example) css = await exampleTheme();
        if (css.trim()) {
            localStorage.setItem('gsuite_customCSS', css);
            window.refreshCustomCSSLayer(css);
        } else {
            localStorage.removeItem('gsuite_customCSS');
            window.refreshCustomCSSLayer('');
            le.applyColorScheme(localStorage.getItem('editorColorScheme') || 'default');
        }
        window.refreshUtilityToolTheme?.();
        // A theme can set the colour behind animations, which the gani editor keeps a copy of.
        try { window.ganiSyncCanvasBackground?.(); } catch (error) { console.warn('[mcp] gani canvas colour', error); }
        return { applied: !!css.trim(), characters: css.length, source: example ? 'example-theme.css' : undefined };
    });

    mcp.tool({
        name: 'app_check_for_update',
        title: 'Check for an update',
        description: 'Ask the update server whether a newer GSuite has been released. It only reports: installing an update restarts the app and is left to the person at the screen (the Check for Updates button).',
        readOnly: true,
        openWorld: true,
        timeoutMs: 60000,
    }, async () => {
        const bridge = h.desktop();
        const current = (await h.system()).version;
        try {
            const update = await bridge.updater.check();
            return { current_version: current, update_available: !!update.available, latest_version: update.available ? update.version : current };
        } catch (error) {
            return { current_version: current, update_available: false, could_not_check: String(error?.message || error) };
        }
    });
})();
