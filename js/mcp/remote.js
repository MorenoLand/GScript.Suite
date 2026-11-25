// GSuite MCP: the bridge to Remote Control (RC), the Graal server administration client.
//
// Remote Control has an MCP server of its own. When the bridge is turned on in
// GSuite's MCP settings, the Go server (mcp/remotecontrol.go) lists RC's rc_* tools
// next to GSuite's and forwards calls to them, so they are not defined here. This
// file adds the tools that join the two worlds: sending what was built in GSuite to
// a server, and fetching what is on a server to work on it here.
//
// Remote Control stays in charge of what is allowed. Its options decide which tools
// exist, and it asks the person at the screen before anything is changed.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;
    const h = mcp.helpers;

    // A call may wait on a question Remote Control is asking its user, which has no time limit.
    const WAIT_MS = 16 * 60 * 1000;
    const DISABLED = -32001;
    const DECLINED = -32002;
    const OUT_OF_SCOPE = -32003;
    const UNAVAILABLE = -32602;
    const MAX_DOWNLOADS = 200;
    // Remote Control returns at most this much of a file in one answer.
    const MAX_READ_BYTES = 8 * 1024 * 1024;
    // The boxes in Remote Control's Options > MCP, as they are labelled there.
    const PERMISSIONS = {
        read: '"Allow read-only tools"',
        write: '"Allow file and script writes"',
        server: '"Allow server and game mutations"',
    };
    const STAGING_PREFIX = 'gsuite-upload-';
    const STAGING_MARKER = '.gsuite-upload';

    // An answer Remote Control gave as a JSON-RPC error, such as the user declining.
    class RemoteError extends mcp.ToolError {
        constructor(tool, code, message) {
            super(explain(tool, code, message));
            this.code = code;
        }
    }

    function explain(tool, code, message) {
        if (code === DISABLED) return `${tool}: ${message}. Only the user can turn it on: "Enable local MCP integration" in Remote Control under Options > MCP.`;
        if (code === DECLINED) return `The request was declined in Remote Control (${tool}: ${message}). Nothing was changed. Do not repeat it or try another way round: tell the user and ask what they want.`;
        if (code === OUT_OF_SCOPE) return `${tool}: ${message}. Remote Control only lets agents work on the server named in its MCP options.`;
        // The same code is used for bad arguments; only the scope message is about permissions.
        if (code === UNAVAILABLE && /unavailable or disabled by MCP scope/i.test(message)) return `${tool}: ${message}. The tool exists only while its permission is ticked in Remote Control under Options > MCP, which only the user can do; remote_status lists the tools that are available.`;
        return `${tool}: ${message}`;
    }

    // Runs one of Remote Control's tools. Returns { raw, text, value }: the MCP result, its
    // text and, when that text is JSON, the value. A failure the tool reports is thrown.
    async function rc(tool, args) {
        const answer = JSON.parse(await h.invoke('McpRemoteCall', tool, JSON.stringify(args || {})));
        if (answer.error) throw new RemoteError(tool, answer.error.code, answer.error.message);
        const raw = answer.result || {};
        const text = (raw.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
        if (raw.isError) fail(`${tool}: ${text || 'Remote Control reported a failure'}`);
        let value;
        try { value = JSON.parse(text); } catch (error) { value = undefined; }
        return { raw, text, value };
    }

    // The bridge's state, after asking Remote Control for its tools again.
    async function bridge() {
        const status = await h.invoke('McpRemoteStatus', true);
        if (!status.enabled) fail('The Remote Control bridge is turned off. Only the user can turn it on: in GSuite, the MCP button in the title bar, under Remote Control.');
        if (!status.connected) fail(`Remote Control cannot be reached: ${status.error || 'it did not answer'}.`);
        return status;
    }

    function need(status, tool, permission) {
        if (!status.tools.includes(tool)) fail(`Remote Control does not offer ${tool}. The user has to tick ${PERMISSIONS[permission]} in Remote Control under Options > MCP.`);
    }

    // The server session to work on. It is always named in the calls that follow: the session
    // selected in Remote Control's window can change under an agent's feet.
    async function pickServer(server) {
        const connections = (await rc('rc_list_connections')).value || [];
        if (!connections.length) fail('Remote Control is not connected to a server. The user connects in Remote Control (or rc_connect_server, when the Login permission is ticked).');
        if (server) {
            const match = connections.find(name => name.toLowerCase() === server.toLowerCase());
            return match || fail(`Remote Control is not connected to "${server}". Connected: ${connections.join(', ')}.`);
        }
        if (connections.length > 1) fail(`Remote Control is connected to several servers: ${connections.join(', ')}. Say which one with server.`);
        return connections[0];
    }

    // A server folder name is only used as a place to write when it stays inside the server's file tree.
    const unsafeFolder = value => { const name = h.path.normalize(value).replace(/^\/+/, ''); return /^[A-Za-z]:/.test(name) || name.split('/').some(part => part === '.' || part === '..'); };

    const folderName = value => h.path.normalize(value).replace(/^\/+|\/+$/g, '') + '/';

    function wildcard(pattern) {
        return new RegExp('^' + pattern.split('').map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('') + '$', 'i');
    }

    // The server folders the account may write to, each with the file-name pattern of its right.
    async function writableFolders(server) {
        const listed = (await rc('rc_list_files', { server })).value || {};
        return (listed.folders || []).filter(entry => entry.writable && !unsafeFolder(String(entry.folder))).map(entry => {
            const pattern = h.path.normalize(entry.pattern || entry.folder + '*');
            const slash = pattern.lastIndexOf('/');
            return { folder: folderName(entry.folder), names: slash >= 0 ? pattern.slice(slash + 1) || '*' : '*' };
        });
    }

    // Picks the server folder a file belongs in: the one given, or the writable folder whose
    // pattern matches the name. Two that match equally well is a question for the caller.
    // Folder names are compared without regard to case and returned as the server spells them.
    function destination(name, folders, wanted) {
        const writable = () => folders.map(entry => entry.folder + entry.names).join(', ') || 'nothing';
        if (wanted) {
            const folder = folderName(wanted).toLowerCase();
            const match = folders.find(entry => entry.folder.toLowerCase() === folder && wildcard(entry.names).test(name));
            return match ? match.folder : fail(`The account may not write ${name} to ${folderName(wanted)}. Writable: ${writable()}.`);
        }
        const matches = folders.filter(entry => wildcard(entry.names).test(name));
        if (!matches.length) fail(`No folder the account may write to takes ${name}. Writable: ${writable()}.`);
        const literal = entry => entry.names.replace(/[*?]/g, '').length;
        const best = Math.max(...matches.map(literal));
        const chosen = [...new Set(matches.filter(entry => literal(entry) === best).map(entry => entry.folder))];
        if (chosen.length > 1) fail(`${name} could go to ${chosen.join(' or ')}. Say which with folder.`);
        return chosen[0];
    }

    // The level files a gmap is made of. The level editor's own reader is used when it is
    // loaded: it also knows the names of a gmap that only says GENERATED.
    function gmapMembers(text) {
        if (typeof LevelEditor !== 'undefined' && typeof LevelEditor.prototype.parseGmap === 'function') {
            try {
                const names = LevelEditor.prototype.parseGmap.call(LevelEditor.prototype, text).grid.flat().filter(Boolean);
                if (names.length) return [...new Set(names)];
            } catch (error) { console.warn('[mcp] gmap members', error); }
        }
        const lines = text.split(/\r?\n/);
        const start = lines.findIndex(line => line.trim() === 'LEVELNAMES');
        if (start < 0) return [];
        const names = [];
        for (let i = start + 1; i < lines.length && lines[i].trim() !== 'LEVELNAMESEND'; i++) {
            for (const item of lines[i].split(',')) {
                const name = item.trim().replace(/^"|"$/g, '');
                if (name) names.push(name);
            }
        }
        return [...new Set(names)];
    }

    // The local files to send: those given, plus the member levels of any gmap among them.
    async function collect(paths, includeMembers, notes) {
        const found = new Map();
        const add = async (target, why) => {
            h.requireAbsolute(target, 'files');
            const info = await h.files.stat(target);
            if (!info.exists || info.isDir) fail(`No such file: ${target}${why ? ` (${why})` : ''}. Save it first (level_save, gani_save).`);
            const key = info.name.toLowerCase();
            const other = found.get(key);
            if (other && h.path.normalize(other.path) !== h.path.normalize(info.path)) fail(`Two files are named ${info.name}: ${other.path} and ${info.path}. A server folder holds one of each name.`);
            found.set(key, { path: info.path, name: info.name, size: info.size });
        };
        for (const target of paths) {
            await add(target);
            if (includeMembers && h.path.ext(target) === 'gmap') {
                const members = gmapMembers(await h.files.readText(target));
                if (!members.length) notes.push(`${h.path.base(target)} does not list its levels, so none were added: name them in files.`);
                for (const member of members) await add(h.path.join(h.path.dir(target), member), `a level of ${h.path.base(target)}`);
            }
        }
        return [...found.values()];
    }

    // Copies the files into a folder Remote Control may read, laid out the way rc_import expects.
    async function stage(root, planned) {
        const folder = h.path.join(root, STAGING_PREFIX + Date.now().toString(36));
        try {
            await h.files.write(h.path.join(folder, STAGING_MARKER), 'Files GSuite is handing to Remote Control. Safe to delete.\n');
            for (const file of planned) {
                const target = h.path.join(folder, 'files', file.to);
                if (unsafeFolder(file.to) || !target.startsWith(h.path.join(folder, 'files') + '/')) fail(`${file.to} would be staged outside the staging folder.`);
                await h.files.makeDir(h.path.dir(target));
                await h.files.copy(file.path, target);
            }
        } catch (error) {
            await unstage(folder);
            throw error;
        }
        return folder;
    }

    const unstage = folder => h.invoke('RemoveUploadStaging', folder).catch(error => console.warn('[mcp] could not remove', folder, error));

    const sameBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

    // Says for each planned file whether the server lacks it ('new'), has other content
    // ('changed') or has the same bytes ('unchanged'), and under which name the server has it.
    // Remote Control's own dry run does not look at the server, so this does.
    async function compare(server, planned, canRead) {
        const listings = new Map();
        for (const file of planned) {
            if (!listings.has(file.folder)) {
                const listed = (await rc('rc_list_files', { folder: file.folder, server })).value || {};
                listings.set(file.folder, new Map((listed.files || []).filter(entry => !entry.directory).map(entry => [String(entry.name).toLowerCase(), entry])));
            }
            const existing = listings.get(file.folder).get(file.name.toLowerCase());
            if (!existing) { file.state = 'new'; continue; }
            // An upload replaces the file the server has, under the name the server has it.
            file.to = file.folder + existing.name;
            if (existing.size !== file.size) { file.state = 'changed'; file.message = `the server's copy is ${existing.size} bytes`; continue; }
            if (!canRead || file.size > MAX_READ_BYTES) { file.state = 'changed'; file.message = 'same size as the server\'s copy; the contents were not compared'; continue; }
            const answer = (await rc('rc_read_file', { path: file.to, encoding: 'base64', server })).value || {};
            file.state = typeof answer.base64 === 'string' && sameBytes(h.base64ToBytes(answer.base64), await h.files.readBytes(file.path)) ? 'unchanged' : 'changed';
        }
        return planned;
    }

    mcp.tool({
        name: 'remote_status',
        title: 'Check the Remote Control bridge',
        description: 'Report whether GSuite can reach Remote Control (RC), the Graal server administration client, and what RC lets an agent do: the rc_* tools available right now, the servers RC is connected to, and whether RC asks its user before changes. Call this before any work on a live server. With tool, also returns that rc_* tool\'s description and argument schema. The rc_* tools are RC\'s own and act on a real, running game server; everything else in GSuite works on local files only.',
        input: { tool: S.string('Name of an rc_* tool to describe, e.g. "rc_write_file"') },
        readOnly: true,
        openWorld: true,
    }, async ({ tool }) => {
        const status = await h.invoke('McpRemoteStatus', true);
        const report = { enabled: status.enabled, connected: status.connected, tools: status.tools };
        if (!status.enabled) return { ...report, message: 'The bridge is turned off. Only the user can turn it on: in GSuite, the MCP button in the title bar, under Remote Control.' };
        if (!status.connected) return { ...report, message: `Remote Control cannot be reached: ${status.error || 'it did not answer'}.` };
        if (tool) {
            const definition = await h.invoke('McpRemoteTool', tool);
            if (!definition) fail(`Remote Control offers no tool named "${tool}" right now. Available: ${status.tools.join(', ') || 'none'}.`);
            report.tool = JSON.parse(definition);
        }
        if (status.tools.includes('rc_status')) report.remote_control = (await rc('rc_status')).value;
        if (status.tools.includes('rc_list_connections')) report.servers = (await rc('rc_list_connections')).value;
        const asks = report.remote_control && report.remote_control.approvals === false
            ? 'Approvals are OFF in Remote Control: nothing asks its user, and every change takes effect at once. Confirm each change with the user yourself before you make it.'
            : 'Remote Control asks its user before a change, except script types they set to always allow; a call waits for that answer.';
        report.message = `Every rc_* tool acts on a live server. Name the server in each call and read before you write. ${asks} Read the guide "remote-control" (app_get_guide) first.`;
        return report;
    });

    mcp.tool({
        name: 'remote_call',
        title: 'Call a Remote Control tool',
        description: 'Run one of Remote Control\'s rc_* tools by name, for clients that do not show them in their own tool list (RC\'s tools appear and disappear as its user ticks permissions). remote_status lists the names and, given one, describes its arguments. The answer is RC\'s, unchanged. A change waits until RC\'s user allows it, which can take minutes; if they decline, do not try again another way.',
        input: {
            tool: S.string('Name of the Remote Control tool, e.g. "rc_list_files"'),
            arguments: S.object({}, [], 'The tool\'s arguments'),
        },
        required: ['tool'],
        destructive: true,
        openWorld: true,
        timeoutMs: WAIT_MS,
    }, async ({ tool, arguments: args }) => {
        if (!/^rc_[a-z0-9_]+$/.test(tool)) fail(`"${tool}" is not a Remote Control tool: their names start with rc_. remote_status lists them.`);
        await bridge();
        return mcp.raw((await rc(tool, args)).raw);
    });

    mcp.tool({
        name: 'remote_upload',
        title: 'Send files to a live server',
        description: 'Send local files (levels, gmaps, images, ganis, sounds) to a game server through Remote Control, then ask the server to reload the levels that changed. A .gmap brings its member levels with it. Each file goes to the server folder whose pattern matches its name, unless folder says otherwise. Files the server already has with the same bytes are left out. Run it with dry_run first: that reports per file where it would go and whether it is new, changed or unchanged, without sending or asking anyone. For the real run Remote Control asks its user once for the files and once more for the reload, and keeps a backup of every file it replaces (rc_backups, rc_restore_backup). This sends files from disk, not unsaved edits: save first (level_save), and run level_check before sending levels.',
        input: {
            files: S.array(S.string('Absolute path'), 'Absolute paths of the local files to send'),
            server: S.string('Server to send to, as named by remote_status. Needed when Remote Control is connected to more than one.'),
            folder: S.string('Server folder for every file, e.g. "levels/". Omit to let each file go to the folder whose pattern matches its name.'),
            include_members: S.boolean('Also send the member levels of each .gmap, from the same local folder', { default: true }),
            update_levels: S.boolean('Afterwards ask the server to reload the levels that were sent (rc_update_levels)', { default: true }),
            dry_run: S.boolean('Only report what would be sent. Nothing is sent and nobody is asked.', { default: false }),
        },
        required: ['files'],
        destructive: true,
        openWorld: true,
        timeoutMs: WAIT_MS,
    }, async ({ files: paths, server, folder, include_members, update_levels, dry_run }) => {
        if (!paths.length) fail('Give at least one file.');
        const status = await bridge();
        need(status, 'rc_list_files', 'read');
        need(status, 'rc_import', 'write');
        const notes = [];
        const local = await collect(paths, include_members, notes);
        server = await pickServer(server);

        const session = (await rc('rc_session_info', { server })).value || {};
        if (session.authenticated === false) fail(`Remote Control is not logged in to ${server}.`);
        const limit = session.maxUploadFileSize || 0;
        const folders = await writableFolders(server);
        const planned = local.map(file => {
            if (limit > 0 && file.size > limit) fail(`${file.name} is ${file.size} bytes; ${server} accepts files up to ${limit} bytes.`);
            const to = destination(file.name, folders, folder);
            return { ...file, folder: to, to: to + file.name };
        });
        await compare(server, planned, status.tools.includes('rc_read_file'));
        const describe = file => ({ file: file.path, to: file.to, bytes: file.size, outcome: file.state, message: file.message });
        const pending = planned.filter(file => file.state !== 'unchanged');
        if (dry_run) {
            return {
                server, dry_run: true, would_send: pending.length, files: planned.map(describe), notes,
                next: pending.length ? 'Call again without dry_run to send. Remote Control then asks its user to allow it.' : 'The server already has these files.',
            };
        }
        if (!pending.length) return { server, sent: 0, files: planned.map(describe), notes, message: 'The server already has these files; nothing was sent.' };

        const roots = ((await rc('rc_status')).value || {}).localRoots || [];
        if (!roots.length) fail('Remote Control allows agents no local folder (its option "MCP file roots" is empty), so files cannot be handed to it. The user sets that in Remote Control under Options > MCP.');
        const staging = await stage(roots[0], pending);
        try {
            const sent = (await rc('rc_import', { localFolder: staging, changedOnly: false, kinds: ['file'], server, timeoutSeconds: 120 })).value || {};
            const results = new Map((sent.items || []).map(item => [String(item.item).toLowerCase(), item]));
            const done = planned.map(file => {
                if (file.state === 'unchanged') return describe(file);
                // A file Remote Control could not read from the staging folder is reported under its path there.
                const item = results.get(file.to.toLowerCase()) || results.get('files/' + file.to.toLowerCase()) || {};
                return { file: file.path, to: file.to, bytes: file.size, outcome: item.outcome || 'unknown', message: item.message || undefined, backup: item.backup || undefined };
            });
            const changed = done.filter(file => file.outcome === 'created' || file.outcome === 'replaced');
            const failed = done.filter(file => file.outcome === 'failed' || file.outcome === 'unknown');
            const result = { server, ok: sent.ok !== false && !failed.length, sent: changed.length, failed: failed.length, files: done, notes };

            const levels = changed.filter(file => /\.(nw|graal|zelda)$/i.test(file.to)).map(file => h.path.base(file.to));
            if (levels.length && update_levels) {
                if (!status.tools.includes('rc_update_levels')) {
                    notes.push(`The levels were sent but the server was not asked to reload them: rc_update_levels needs ${PERMISSIONS.server} ticked in Remote Control. Players see the old levels until the server reloads them.`);
                } else {
                    try {
                        await rc('rc_update_levels', { levels, server });
                        result.reloaded = levels;
                    } catch (error) {
                        if (!(error instanceof mcp.ToolError)) throw error;
                        notes.push(error.code === DECLINED
                            ? 'The files were sent, but reloading the levels was declined in Remote Control. Do not ask again: tell the user the levels are on the server and still need a reload.'
                            : `The files were sent but the levels were not reloaded: ${error.message}`);
                    }
                }
            }
            if (failed.length) notes.push('Some files were not sent; the others were. The server can refuse a file without saying so: confirm with rc_list_files.');
            if (changed.some(file => file.backup)) notes.push('Replaced files were backed up by Remote Control: rc_backups lists them, rc_restore_backup puts one back.');
            return result;
        } finally {
            await unstage(staging);
        }
    });

    mcp.tool({
        name: 'remote_download',
        title: 'Fetch files from a live server',
        description: 'Copy files from a game server to a local folder through Remote Control, to work on them in GSuite: name them, or give a server folder and a name filter. Nothing on the server changes. Existing local files are kept unless overwrite is true. With open, downloaded levels and gmaps are opened in the level editor (a gmap needs its member levels in the same folder, so fetch those too).',
        input: {
            to: S.string('Absolute path of the local folder to save into; it is created if missing'),
            files: S.array(S.string('Server path'), 'Server paths to fetch, e.g. ["levels/start.nw"]'),
            folder: S.string('Server folder to fetch from, e.g. "levels/"; used with query'),
            query: S.string('Name filter for folder: * and ? wildcards, e.g. "world_*.nw"'),
            server: S.string('Server to fetch from, as named by remote_status. Needed when Remote Control is connected to more than one.'),
            overwrite: S.boolean('Replace local files that already exist', { default: false }),
            open: S.boolean('Open the downloaded levels and gmaps in the level editor', { default: false }),
        },
        required: ['to'],
        openWorld: true,
        timeoutMs: WAIT_MS,
    }, async ({ to, files: wanted, folder, query, server, overwrite, open }) => {
        h.requireAbsolute(to, 'to');
        if (!(wanted && wanted.length) && !folder) fail('Say what to fetch: files, or a folder with a query.');
        if (folder && !query) fail('Give a query with folder, e.g. "*.nw", so a whole server folder is not copied by accident.');
        const status = await bridge();
        need(status, 'rc_read_file', 'read');
        server = await pickServer(server);

        const listedSizes = new Map();
        const targets = (wanted || []).map(value => h.path.normalize(value).replace(/^\/+/, ''));
        for (const target of targets) if (!target.includes('/') || target.endsWith('/')) fail(`"${target}" is not a server path: give folder/name, e.g. "levels/start.nw".`);
        if (folder) {
            need(status, 'rc_list_files', 'read');
            const listed = (await rc('rc_list_files', { folder: folderName(folder), query, server })).value || {};
            for (const file of listed.files || []) {
                if (file.directory) continue;
                const path = file.path || folderName(folder) + file.name;
                targets.push(path);
                if (Number.isFinite(file.size)) listedSizes.set(path, file.size);
            }
        }
        const unique = [...new Set(targets)];
        if (!unique.length) fail(`Nothing on ${server} matches ${folder ? folderName(folder) + query : 'the given files'}.`);
        if (unique.length > MAX_DOWNLOADS) fail(`That is ${unique.length} files; fetch at most ${MAX_DOWNLOADS} at a time by narrowing the query.`);
        // Everything lands in one local folder, so two server files of the same name cannot both be fetched.
        const byName = new Map();
        for (const target of unique) {
            const name = h.path.base(target).toLowerCase();
            if (byName.has(name)) fail(`${byName.get(name)} and ${target} would both be saved as ${h.path.base(target)}. Fetch them into different folders.`);
            byName.set(name, target);
        }

        const done = [];
        for (const target of unique) {
            const local = h.path.join(to, h.path.base(target));
            if (!overwrite && (await h.files.stat(local)).exists) { done.push({ from: target, file: local, outcome: 'kept', message: 'A local file of this name exists; pass overwrite: true to replace it.' }); continue; }
            try {
                const answer = (await rc('rc_read_file', { path: target, encoding: 'base64', server })).value || {};
                if (typeof answer.base64 !== 'string') fail(`rc_read_file: no content came back for ${target}`);
                const bytes = h.base64ToBytes(answer.base64);
                // The size in the answer, else the one in the listing. An answer cut off at Remote Control's limit is
                // short of the listing whatever size it states itself.
                const listed = listedSizes.get(target);
                const size = listed !== undefined && bytes.length >= MAX_READ_BYTES && bytes.length < listed ? listed : Number.isFinite(answer.size) ? answer.size : listed;
                if (size !== undefined && bytes.length !== size) fail(`rc_read_file: only ${bytes.length} of ${size} bytes of ${target} came back (Remote Control returns at most ${MAX_READ_BYTES} bytes per answer). Nothing was saved.`);
                await h.files.write(local, bytes);
                done.push({ from: target, file: local, bytes: bytes.length, outcome: 'saved' });
            } catch (error) {
                if (!(error instanceof mcp.ToolError) || error.code === DECLINED) throw error;
                done.push({ from: target, outcome: 'failed', message: error.message });
            }
        }
        const result = { server, folder: h.path.normalize(to), saved: done.filter(file => file.outcome === 'saved').length, files: done };
        if (open) {
            // Only what was just fetched is opened: a local file that was kept is not the server's version.
            result.opened = [];
            const saved = done.filter(file => file.outcome === 'saved');
            const gmaps = saved.filter(file => h.path.ext(file.file) === 'gmap');
            // A gmap opens its members itself; only levels that belong to none are opened on their own.
            const members = new Set();
            for (const gmap of gmaps) for (const name of gmapMembers(await h.files.readText(gmap.file))) members.add(name.toLowerCase());
            const levels = saved.filter(file => /^(nw|graal|zelda)$/.test(h.path.ext(file.file)) && !members.has(h.path.base(file.file).toLowerCase()));
            for (const file of [...gmaps, ...levels]) {
                const answer = await mcp.call('level_open', { path: file.file });
                if (answer.isError) { result.opened.push({ file: file.file, error: answer.content[0].text }); continue; }
                const parsed = JSON.parse(answer.content[0].text);
                if (parsed.already_open) result.opened.push({ ...parsed.opened, already_open: true, note: 'This file was already open, and the editor still shows what it had before the download. Close it (level_close) and open it again to work on the downloaded version.' });
                else result.opened.push(parsed.opened);
            }
        }
        return result;
    });

    mcp.helpers.remote = { rc, bridge, pickServer, writableFolders, destination, compare, gmapMembers, wildcard, RemoteError };
})();
