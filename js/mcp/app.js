// GSuite MCP: shared helpers, and the tools for the app shell (tabs, files on
// disk, the workspace, screenshots and a JavaScript escape hatch).
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Polls with timers rather than animation frames, which stop while the window is hidden.
    async function waitFor(check, timeoutMs, what) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const value = check();
            if (value) return value;
            if (Date.now() >= deadline) fail(`Timed out waiting for ${what}`);
            await sleep(25);
        }
    }

    function desktop() {
        return window.__GSUITE__ || fail('This needs the GSuite desktop app: the browser build cannot reach files on disk.');
    }

    function invoke(method, ...args) {
        return desktop().core.invoke(method, args);
    }

    let systemInfo = null;
    async function system() {
        if (!window.__GSUITE__) return { os: 'browser', pathSeparator: '/', homeDir: '', documentsDir: '', exeDir: '', workspaceDir: '', version: '' };
        const info = await invoke('GetSystemInfo');
        systemInfo = info;
        return info;
    }

    const path = {
        normalize: value => String(value || '').replace(/\\/g, '/'),
        base: value => path.normalize(value).replace(/\/+$/, '').split('/').pop(),
        dir: value => { const parts = path.normalize(value).replace(/\/+$/, '').split('/'); parts.pop(); return parts.join('/') || '/'; },
        ext: value => { const name = path.base(value); const dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''; },
        stem: value => { const name = path.base(value); const dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(0, dot) : name; },
        join: (...parts) => parts.filter(part => part !== '' && part != null).map((part, i) => i ? path.normalize(part).replace(/^\/+/, '') : path.normalize(part)).join('/').replace(/([^:/])\/{2,}/g, '$1/'),
        isAbsolute: value => /^([a-zA-Z]:[\\/]|[\\/])/.test(String(value || '')),
    };

    function requireAbsolute(value, name) {
        if (!path.isAbsolute(value)) fail(`${name} must be an absolute path, got "${value}". Call app_get_state for the home, documents and workspace directories.`);
        return value;
    }

    function bytesToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
    }

    function base64ToBytes(encoded) {
        let raw;
        try { raw = atob(String(encoded).replace(/^data:[^,]*,/, '').replace(/\s+/g, '')); } catch (error) { fail('content is not valid base64'); }
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    const files = {
        stat: target => invoke('StatPath', target),
        list: target => invoke('ListDir', target),
        makeDir: target => invoke('MakeDir', target),
        copy: (from, to) => invoke('CopyFile', from, to),
        readText: target => desktop().fs.readTextFile(target),
        readBytes: target => desktop().fs.readFile(target),
        async write(target, content) {
            await files.makeDir(path.dir(target));
            if (typeof content === 'string') await desktop().fs.writeTextFile(target, content);
            else await desktop().fs.writeFile(target, content);
        },
    };

    // Clients refuse very large images, so past this size a picture is sent as JPEG, and smaller if need be.
    const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

    function resized(canvas, scale, background) {
        const copy = document.createElement('canvas');
        copy.width = Math.max(1, Math.round(canvas.width * scale));
        copy.height = Math.max(1, Math.round(canvas.height * scale));
        const ctx = copy.getContext('2d');
        if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, copy.width, copy.height); }
        ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
        return copy;
    }

    // A canvas as an MCP image part: PNG when that is small enough, otherwise JPEG.
    function imagePart(canvas) {
        let url = canvas.toDataURL('image/png');
        let source = resized(canvas, 1, '#1b1b1b');
        for (let attempt = 0; url.length * 0.75 > MAX_IMAGE_BYTES && attempt < 8; attempt++) {
            url = source.toDataURL('image/jpeg', 0.85);
            source = resized(source, 0.8);
        }
        return mcp.image(url);
    }

    // A canvas as an MCP image part, scaled down so its longest side is at most maxSize.
    function canvasImage(canvas, maxSize) {
        if (!canvas || !canvas.width || !canvas.height) fail('There is nothing to capture: the canvas is empty.');
        const scale = Math.min(1, (maxSize || 1024) / Math.max(canvas.width, canvas.height));
        let source = canvas;
        if (scale < 1) {
            source = document.createElement('canvas');
            source.width = Math.max(1, Math.round(canvas.width * scale));
            source.height = Math.max(1, Math.round(canvas.height * scale));
            const ctx = source.getContext('2d');
            ctx.imageSmoothingEnabled = scale < 0.5;
            ctx.drawImage(canvas, 0, 0, source.width, source.height);
        }
        return { part: imagePart(source), width: source.width, height: source.height, scale };
    }

    // Writes a canvas to disk as a PNG.
    async function savePng(canvas, target) {
        await files.write(target, base64ToBytes(canvas.toDataURL('image/png')));
        return path.normalize(target);
    }

    function tabList() {
        const manager = window.tabManager;
        if (!manager) return [];
        const levels = window._editor?.levels || [];
        return manager._tabs.map(tab => ({
            id: tab.id, type: tab.type, name: tab.name, active: tab.id === manager._activeTabId,
            unsaved: !!manager._isTabDirty?.(tab) || levels.some(entry => entry.level === tab.data?.level && entry.modified),
        }));
    }

    function findTab(ref) {
        const manager = window.tabManager;
        const wanted = String(ref).toLowerCase();
        const tab = manager?._tabs.find(t => t.id === ref) || manager?._tabs.find(t => t.name.toLowerCase() === wanted) || manager?._tabs.find(t => t.type === wanted);
        return tab || fail(`No tab matches "${ref}". Open tabs: ${tabList().map(t => `${t.id} (${t.type}: ${t.name})`).join(', ') || 'none'}`);
    }

    const TOOL_TABS = {
        level: { type: 'level', title: 'Level Editor' },
        gani: { type: 'gani', title: 'Gani Editor' },
        particles: { type: 'particleemu', title: 'ParticleEmu', open: () => window.injectParticleEmu() },
        setshape: { type: 'setshape', title: 'Setshape2', open: () => SetshapeEditor.open() },
        beautify: { type: 'beautify', title: 'Code Beautify', open: () => BeautifyTool.open() },
        level_generator: { type: 'levelgen', title: 'Level Generator', open: () => LevelGenEditor.open() },
    };

    mcp.helpers = { sleep, waitFor, desktop, invoke, system, path, requireAbsolute, bytesToBase64, base64ToBytes, files, canvasImage, imagePart, savePng, tabList, findTab };

    mcp.tool({
        name: 'app_get_state',
        title: 'Get app state',
        description: 'Overview of the running GSuite app: version, platform, useful directories, the workspace folder, every open tab, and the open levels and animations. Call this first to orient yourself.',
        readOnly: true,
    }, async () => {
        const info = await system();
        const le = window._editor;
        const state = {
            version: info.version,
            platform: info.os,
            desktop: !!window.__GSUITE__,
            directories: { home: info.homeDir, documents: info.documentsDir, workspace: window._wailsLastDir || info.workspaceDir || '' },
            tabs: tabList(),
            levels: (le?.levels || []).filter(entry => !entry.isGani).map((entry, index) => ({
                index, name: entry.name, kind: entry.gmapGrid ? 'gmap' : 'level', path: entry.filePath || entry.fullPath || '', unsaved: !!entry.modified, active: index === le.currentLevelIndex,
                size: `${entry.level.width}x${entry.level.height}`,
            })),
            animations: (typeof animations !== 'undefined' ? animations : []).map((ani, index) => ({ index, name: ani.fileName || `animation ${index + 1}`, path: ani.fullPath || '', active: index === currentTabIndex })),
        };
        return state;
    });

    mcp.tool({
        name: 'app_open_tool',
        title: 'Open a tool tab',
        description: 'Bring one of the suite\'s tools to the front, opening its tab if needed. "level" and "gani" show that editor with one of its open tabs; to pick a particular level or animation use level_activate or gani_set_view.',
        input: { tool: S.enum(Object.keys(TOOL_TABS), 'Which tool to show') },
        required: ['tool'],
        idempotent: true,
    }, async ({ tool }) => {
        const target = TOOL_TABS[tool];
        const existing = window.tabManager.getTabsByType(target.type);
        const active = window.tabManager.getActiveTab();
        if (active && active.type === target.type) { /* already showing */ }
        else if (existing.length) window.tabManager.switchTo(existing[existing.length - 1].id);
        else if (target.open) target.open();
        else fail(`No ${target.title} tab is open. Create or open a ${tool === 'gani' ? 'gani (gani_new, gani_open)' : 'level (level_new, level_open)'} first.`);
        await waitFor(() => window.tabManager.getTabsByType(target.type).length, 10000, `the ${target.title} tab`);
        return { opened: target.title, tabs: tabList() };
    });

    mcp.tool({
        name: 'app_switch_tab',
        title: 'Switch tab',
        description: 'Activate an open tab by id, by name, or by type (level, gani, particleemu, setshape, beautify, levelgen).',
        input: { tab: S.string('Tab id (from app_get_state), tab name, or tab type') },
        required: ['tab'],
        idempotent: true,
    }, async ({ tab }) => {
        const target = findTab(tab);
        window.tabManager.switchTo(target.id);
        return { active: { id: target.id, type: target.type, name: target.name } };
    });

    mcp.tool({
        name: 'app_close_tab',
        title: 'Close tab',
        description: 'Close an open tab. A tab with unsaved changes is only closed when discard_changes is true; save it first otherwise.',
        input: {
            tab: S.string('Tab id (from app_get_state), tab name, or tab type'),
            discard_changes: S.boolean('Close even if the tab has unsaved changes', { default: false }),
        },
        required: ['tab'],
        destructive: true,
    }, async ({ tab, discard_changes }) => {
        const target = findTab(tab);
        const manager = window.tabManager;
        const unsaved = manager._isTabDirty?.(target) || window._editor?.levels.some(e => e.level === target.data?.level && e.modified);
        if (unsaved && !discard_changes) fail(`"${target.name}" has unsaved changes. Save it, or pass discard_changes: true.`);
        const entry = target.type === 'level' ? window._editor?.levels.find(e => e.level === target.data?.level) : null;
        if (entry) {
            // The level editor owns the level behind the tab, so it has to drop it too.
            mcp.helpers.level.closeEntry(window._editor, entry);
        } else {
            if (target.type === 'gani' && target.data?.ani) target.data.ani.modified = false;
            target.dirty = false;
            manager._doRemove(target.id);
        }
        return { closed: target.name, tabs: tabList() };
    });

    mcp.tool({
        name: 'app_open_file',
        title: 'Open a file',
        description: 'Open a file from disk in the editor that handles it: .nw, .graal and .zelda levels and .gmap maps open in the level editor, .gani animations in the gani editor. A gmap loads its member levels from the same folder.',
        input: { path: S.string('Absolute path of the file') },
        required: ['path'],
        openWorld: true,
    }, async ({ path: target }) => {
        requireAbsolute(target, 'path');
        const ext = path.ext(target);
        if (ext === 'gani') return mcp.call('gani_open', { path: target }).then(unwrap);
        if (['nw', 'graal', 'zelda', 'gmap'].includes(ext)) return mcp.call('level_open', { path: target }).then(unwrap);
        fail(`GSuite cannot open .${ext} files. Supported: .nw, .graal, .zelda, .gmap, .gani. Use fs_read_file to read other files.`);
    });

    // Passes a nested tool call's result through, turning its error back into a thrown one.
    function unwrap(toolResult) {
        if (toolResult.isError) fail(toolResult.content[0].text);
        return { __mcpResult: true, value: toolResult };
    }
    mcp.helpers.unwrap = unwrap;

    mcp.tool({
        name: 'app_screenshot',
        title: 'Screenshot the active editor',
        description: 'Capture what the active tab is showing (its main canvas) as an image. For a full level regardless of scroll position use level_screenshot; for an animation frame use gani_render.',
        input: { max_size: S.integer('Longest side of the returned image in pixels', { default: 1024, minimum: 64, maximum: 4096 }) },
        readOnly: true,
    }, async ({ max_size }) => {
        const tab = window.tabManager?.getActiveTab();
        if (!tab) fail('No tab is open.');
        if (tab.type === 'level') window._editor?.render();
        const root = window.tabManager._getRootElementForTab(tab);
        const visible = [...(root?.querySelectorAll('canvas') || [])].filter(c => c.width > 1 && c.height > 1 && c.offsetParent !== null);
        // The editing view, where a tab has one; otherwise whichever canvas takes up the most room on screen.
        const main = visible.find(c => c.id === 'level-mainCanvas' || c.id === 'gani-mainCanvas' || c.id === 'viewport');
        const canvas = main || visible.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
        if (!canvas) fail(`The ${tab.type} tab has no visible canvas to capture. The window may be minimized.`);
        const shot = canvasImage(canvas, max_size);
        return mcp.result({ tab: tab.name, type: tab.type, width: shot.width, height: shot.height }, shot.part);
    });

    function safeStringify(value) {
        // The objects on the path from the root to the value being written: one that appears on
        // its own path is a cycle, while one that merely appears twice is written twice.
        const path = [];
        const text = JSON.stringify(value, function (key, item) {
            if (typeof item === 'function') return `[function ${item.name || 'anonymous'}]`;
            if (typeof item === 'bigint') return item.toString();
            if (item instanceof Element) return `[${item.tagName.toLowerCase()}${item.id ? '#' + item.id : ''}]`;
            if (ArrayBuffer.isView(item)) return `[${item.constructor.name} of ${item.length}]`;
            if (item instanceof Map) item = { __map: [...item.entries()].slice(0, 200) };
            else if (item instanceof Set) item = { __set: [...item.values()].slice(0, 200) };
            if (item && typeof item === 'object') {
                while (path.length && path[path.length - 1] !== this) path.pop();
                if (path.includes(item)) return '[circular]';
                path.push(item);
            }
            return item;
        });
        return text === undefined ? 'undefined' : text;
    }

    mcp.tool({
        name: 'app_eval_js',
        title: 'Run JavaScript in the app',
        description: 'Escape hatch: run JavaScript inside the GSuite window and return its result, for anything the other tools do not cover. The code is the body of an async function, so use `return` and `await`. Globals include window._editor (level editor), animations / currentAnimation (gani editor), tabManager, GSuiteMCP, and the classes Level, LevelObject, Animation. Prefer the dedicated tools: they handle undo, redraw and unsaved-change tracking.',
        input: {
            code: S.string('Body of an async function. Example: return window._editor.levels.map(e => e.name);'),
            max_chars: S.integer('Truncate the serialized result to this many characters', { default: 20000, minimum: 100, maximum: 500000 }),
        },
        required: ['code'],
        destructive: true,
        openWorld: true,
        timeoutMs: 300000,
    }, async ({ code, max_chars }) => {
        let run;
        try {
            run = new (Object.getPrototypeOf(async function () {}).constructor)(code);
        } catch (error) {
            fail(`Syntax error: ${error.message}`);
        }
        let value;
        try {
            value = await run();
        } catch (error) {
            fail(`The code threw ${error && error.name ? error.name : 'an error'}: ${error && error.message ? error.message : error}${error && error.stack ? '\n' + String(error.stack).split('\n').slice(1, 4).join('\n') : ''}`);
        }
        const text = typeof value === 'string' ? value : safeStringify(value);
        return text.length > max_chars ? `${text.slice(0, max_chars)}\n… (truncated, ${text.length} characters in total)` : text;
    });

    mcp.tool({
        name: 'app_dialogs',
        title: 'List or dismiss dialogs',
        description: 'Report dialogs currently open in the app window, and optionally dismiss them. MCP tools never open dialogs themselves, but one the user left open (or an update prompt) can cover the editor.',
        input: { dismiss: S.boolean('Close the open dialogs, answering "No"/"Cancel" where they ask a question', { default: false }) },
    }, async ({ dismiss }) => {
        const open = [...document.querySelectorAll('.dialog-overlay, [id$="Dialog"], [data-lg$="Modal"], [data-ss2$="Modal"]')].filter(el => {
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null || (style.position === 'fixed' && style.display !== 'none');
        });
        const described = open.map(el => ({ id: el.id || el.dataset.lg || el.dataset.ss2 || el.className, text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160) }));
        if (dismiss) {
            for (const el of open) {
                if (el.id === 'sharedConfirmDialog') document.getElementById('sharedConfirmNo')?.click();
                else if (typeof el._closeModal === 'function') el._closeModal();
                else if (el.classList.contains('dialog-overlay') && !el.id) el.remove();
                else el.style.display = 'none';
            }
        }
        return { dialogs: described, dismissed: dismiss ? described.length : 0 };
    });

    // ---- Files on disk -------------------------------------------------------------------

    mcp.tool({
        name: 'fs_list_directory',
        title: 'List a directory',
        description: 'List the files and folders in a directory on disk, directories first.',
        input: { path: S.string('Absolute path of the directory') },
        required: ['path'],
        readOnly: true,
        openWorld: true,
    }, async ({ path: target }) => {
        requireAbsolute(target, 'path');
        const entries = await files.list(target).catch(error => fail(`Could not list ${target}: ${error.message || error}`));
        return { path: target, entries: entries.map(entry => entry.isDir ? { name: entry.name, type: 'directory' } : { name: entry.name, type: 'file', size: entry.size }) };
    });

    mcp.tool({
        name: 'fs_read_file',
        title: 'Read a file',
        description: 'Read a file from disk. Text files (levels, gmaps, ganis, scripts) come back as text; pass encoding "base64" for binary files such as images. To edit a level or animation, open it with level_open / gani_open instead.',
        input: {
            path: S.string('Absolute path of the file'),
            encoding: S.enum(['text', 'base64'], 'How to return the content', { default: 'text' }),
            max_bytes: S.integer('Refuse files larger than this', { default: 1048576, minimum: 1, maximum: 33554432 }),
        },
        required: ['path'],
        readOnly: true,
        openWorld: true,
    }, async ({ path: target, encoding, max_bytes }) => {
        requireAbsolute(target, 'path');
        const info = await files.stat(target);
        if (!info.exists) fail(`No such file: ${target}`);
        if (info.isDir) fail(`${target} is a directory. Use fs_list_directory.`);
        if (info.size > max_bytes) fail(`${target} is ${info.size} bytes, over max_bytes (${max_bytes}). Raise max_bytes to read it.`);
        if (encoding === 'base64') return { path: target, size: info.size, encoding: 'base64', content: bytesToBase64(await files.readBytes(target)) };
        const content = await files.readText(target);
        if (/[\x00-\x08\uFFFD]/.test(content.slice(0, 4096))) fail(`${target} is a binary file. Read it with encoding: "base64", or look at an image with app_view_image.`);
        return { path: target, size: info.size, content };
    });

    mcp.tool({
        name: 'fs_write_file',
        title: 'Write a file',
        description: 'Write a file to disk, creating parent folders and replacing any existing file. Use it for assets and loose files (scripts, images, server option files). Levels, gmaps and ganis you are editing should be saved with level_save / gani_save so the editor keeps track of them.',
        input: {
            path: S.string('Absolute path of the file'),
            content: S.string('Text content, or base64 when encoding is "base64"'),
            encoding: S.enum(['text', 'base64'], 'How content is encoded', { default: 'text' }),
        },
        required: ['path', 'content'],
        destructive: true,
        idempotent: true,
        openWorld: true,
    }, async ({ path: target, content, encoding }) => {
        requireAbsolute(target, 'path');
        const data = encoding === 'base64' ? base64ToBytes(content) : content;
        await files.write(target, data).catch(error => fail(`Could not write ${target}: ${error.message || error}`));
        const info = await files.stat(target);
        if (!info.exists) fail(`Writing ${target} did not produce a file.`);
        return { path: info.path, size: info.size };
    });

    mcp.tool({
        name: 'fs_search_text',
        title: 'Search text in files',
        description: 'Search the text files under a folder (and its subfolders) for a piece of text, case-insensitively, and return the matching lines with file and line number. Use it to find where something is used across a world\'s levels and scripts, or to find real examples of a function in a folder of scripts.',
        input: {
            path: S.string('Absolute path of the folder to search'),
            query: S.string('Text to look for'),
            extensions: S.array(S.string(), 'File extensions to search, without dots. Defaults to txt, nw, gmap, gani, gs, gs2, npc, md'),
            limit: S.integer('Most matching lines to return', { default: 40, minimum: 1, maximum: 500 }),
        },
        required: ['path', 'query'],
        readOnly: true,
        openWorld: true,
        timeoutMs: 180000,
    }, async ({ path: target, query, extensions, limit }) => {
        requireAbsolute(target, 'path');
        const matches = await invoke('SearchText', target, query, extensions || [], limit).catch(error => fail(`Could not search ${target}: ${error.message || error}`));
        return { path: target, query, matches: matches.length, limit_reached: matches.length >= limit, lines: matches.map(match => ({ file: match.path, line: match.line, text: match.text })) };
    });

    mcp.tool({
        name: 'fs_make_directory',
        title: 'Create a directory',
        description: 'Create a directory and any missing parents. Succeeds if it already exists.',
        input: { path: S.string('Absolute path of the directory') },
        required: ['path'],
        idempotent: true,
        openWorld: true,
    }, async ({ path: target }) => {
        requireAbsolute(target, 'path');
        await files.makeDir(target).catch(error => fail(`Could not create ${target}: ${error.message || error}`));
        return { path: target };
    });

    mcp.tool({
        name: 'fs_copy_file',
        title: 'Copy a file',
        description: 'Copy one file to a new path, creating parent folders and replacing any existing file. Useful for bringing images and sounds into a world folder.',
        input: { from: S.string('Absolute path of the file to copy'), to: S.string('Absolute path of the copy') },
        required: ['from', 'to'],
        destructive: true,
        idempotent: true,
        openWorld: true,
    }, async ({ from, to }) => {
        requireAbsolute(from, 'from');
        requireAbsolute(to, 'to');
        await files.makeDir(path.dir(to));
        await files.copy(from, to).catch(error => fail(`Could not copy ${from} to ${to}: ${error.message || error}`));
        return { path: to, size: (await files.stat(to)).size };
    });

    mcp.tool({
        name: 'fs_move_file',
        title: 'Move or rename a file',
        description: 'Move one file to a new path, or rename it, creating parent folders. An existing file at the new path is kept unless overwrite is true. Levels refer to each other and to images by file name: after renaming a level, update the links and gmaps that name it (fs_search_text finds them). Close a level in the editor before moving its file.',
        input: {
            from: S.string('Absolute path of the file'),
            to: S.string('Absolute path to move it to'),
            overwrite: S.boolean('Replace a file that is already at the new path', { default: false }),
        },
        required: ['from', 'to'],
        destructive: true,
        openWorld: true,
    }, async ({ from, to, overwrite }) => {
        requireAbsolute(from, 'from');
        requireAbsolute(to, 'to');
        await invoke('MoveFile', from, to, overwrite).catch(error => fail(`Could not move ${from} to ${to}: ${error.message || error}${/already exists/.test(String(error.message || error)) ? '. Pass overwrite: true to replace it.' : ''}`));
        return { path: path.normalize(to), size: (await files.stat(to)).size };
    });

    mcp.tool({
        name: 'fs_delete_file',
        title: 'Delete a file',
        description: 'Delete one file from disk, for example a level left over under an old name. The file does not go to a recycle bin and folders are never deleted. Only delete files you created in this session, or that the user asked you to remove. Close a level in the editor before deleting its file.',
        input: { path: S.string('Absolute path of the file to delete') },
        required: ['path'],
        destructive: true,
        openWorld: true,
    }, async ({ path: target }) => {
        requireAbsolute(target, 'path');
        const info = await files.stat(target);
        if (!info.exists) fail(`No such file: ${target}`);
        await invoke('DeleteFile', target).catch(error => fail(`Could not delete ${target}: ${error.message || error}`));
        return { deleted: path.normalize(target), size: info.size };
    });
})();
