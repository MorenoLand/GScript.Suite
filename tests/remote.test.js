// Tests for the Remote Control bridge tools (js/mcp/remote.js), against a stand-in for the
// desktop app and for Remote Control. Nothing here talks to a real Remote Control.
const test = require('node:test');
const assert = require('node:assert/strict');

const mcp = require('../js/mcp/core.js');
globalThis.window = globalThis;
globalThis.GSuiteMCP = mcp;
require('../js/mcp/app.js');
require('../js/mcp/remote.js');

const encoder = new TextEncoder();
const bytes = value => typeof value === 'string' ? encoder.encode(value) : value;
const base64 = value => Buffer.from(value).toString('base64');
const json = result => JSON.parse(result.content[0].text);
const failure = result => { assert.equal(result.isError, true, JSON.stringify(result)); return result.content[0].text; };

// The local disk: path -> bytes, plus the folders that were made.
let disk, folders, removed, unreadable;
// Remote Control and the server behind it.
let remote;

function reset() {
    disk = new Map();
    folders = new Set();
    removed = [];
    unreadable = '';
    remote = {
        enabled: true,
        connected: true,
        error: '',
        tools: ['rc_status', 'rc_list_connections', 'rc_session_info', 'rc_list_files', 'rc_read_file', 'rc_import', 'rc_update_levels'],
        connections: ['alpha'],
        roots: ['/rc/mcp-files'],
        limit: 0,
        declines: false,
        rights: [
            { folder: 'levels/', pattern: 'levels/*.nw', rights: 'rw', writable: true },
            { folder: 'levels/', pattern: 'levels/*.gmap', rights: 'rw', writable: true },
            { folder: 'images/', pattern: 'images/*.png', rights: 'rw', writable: true },
            { folder: 'config/', pattern: 'config/*.txt', rights: 'r', writable: false },
        ],
        files: new Map([['levels/isle_b.nw', bytes('old b')]]),
        calls: [],
    };
}

const textResult = (value, isError) => ({ result: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError: !!isError } });

// Lets a test answer one tool its own way.
let remoteCallHook = () => null;

function remoteCall(tool, args) {
    remote.calls.push({ tool, args });
    const hooked = remoteCallHook(tool, args);
    if (hooked) return hooked;
    if (!remote.tools.includes(tool)) return { error: { code: -32602, message: 'Tool unavailable or disabled by MCP scope' } };
    switch (tool) {
        case 'rc_status': return textResult({ bridge: 'connected', server: remote.connections[0] || '', localRoots: remote.roots, approvals: true });
        case 'rc_list_connections': return textResult(remote.connections);
        case 'rc_session_info': return textResult({ server: args.server, authenticated: true, maxUploadFileSize: remote.limit });
        case 'rc_list_files': {
            if (!args.folder) return textResult({ folders: remote.rights });
            const pattern = new RegExp('^' + String(args.query || '*').replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$', 'i');
            const files = [...remote.files.keys()].filter(path => path.startsWith(args.folder) && pattern.test(path.slice(args.folder.length)))
                .map(path => ({ name: path.slice(args.folder.length), path, size: remote.files.get(path).length }));
            return textResult({ folder: args.folder, count: files.length, files });
        }
        case 'rc_read_file': {
            const content = remote.files.get(args.path);
            if (!content) return textResult(`There is no file ${args.path} on ${args.server}.`, true);
            return textResult({ path: args.path, size: content.length, encoding: 'base64', base64: base64(content) });
        }
        case 'rc_import': {
            const prefix = args.localFolder + '/files/';
            const items = [];
            const staged = [...disk.keys()].filter(path => path.startsWith(prefix));
            const changes = staged.filter(path => !remote.files.has(path.slice(prefix.length)) || base64(remote.files.get(path.slice(prefix.length))) !== base64(disk.get(path)));
            if (!args.dryRun && changes.length && remote.declines) return { error: { code: -32002, message: 'Mutation denied by user' } };
            for (const path of staged) {
                const item = path.slice(prefix.length);
                const existing = remote.files.get(item);
                const same = existing && base64(existing) === base64(disk.get(path));
                if (args.dryRun) items.push({ item, outcome: 'would-send', message: `new, ${disk.get(path).length} bytes` });
                else if (same) items.push({ item, outcome: 'unchanged', message: 'The server has the same bytes.' });
                else {
                    remote.files.set(item, disk.get(path));
                    items.push(existing ? { item, outcome: 'replaced', backup: `alpha/1-file-${item}` } : { item, outcome: 'created' });
                }
            }
            return textResult({ ok: true, items });
        }
        case 'rc_update_levels': return textResult({ ok: true, message: `${args.levels.length} level(s) were sent to be reloaded.` });
        default: return textResult('ok');
    }
}

const stat = path => {
    const name = path.split('/').pop();
    if (disk.has(path)) return { name, path, exists: true, isDir: false, size: disk.get(path).length };
    if (folders.has(path)) return { name, path, exists: true, isDir: true, size: 0 };
    return { name, path, exists: false, isDir: false, size: 0 };
};

globalThis.__GSUITE__ = {
    core: {
        async invoke(method, args) {
            switch (method) {
                case 'GetSystemInfo': return { os: 'linux', pathSeparator: '/' };
                case 'StatPath': return stat(args[0]);
                case 'MakeDir': folders.add(args[0]); return null;
                case 'CopyFile':
                    if (args[0] === unreadable) throw new Error('permission denied');
                    disk.set(args[1], disk.get(args[0]));
                    return null;
                case 'RemoveUploadStaging':
                    removed.push(args[0]);
                    for (const path of [...disk.keys()]) if (path.startsWith(args[0] + '/')) disk.delete(path);
                    return null;
                case 'McpRemoteStatus': return { enabled: remote.enabled, connected: remote.enabled && remote.connected, tools: remote.enabled && remote.connected ? remote.tools : [], error: remote.error };
                case 'McpRemoteTool': return remote.tools.includes(args[0]) ? JSON.stringify({ name: args[0], description: 'Fake', inputSchema: { type: 'object' } }) : '';
                case 'McpRemoteCall': return JSON.stringify(remoteCall(args[0], JSON.parse(args[1])));
                default: throw new Error(`unexpected call ${method}`);
            }
        },
    },
    fs: {
        readTextFile: async path => Buffer.from(disk.get(path)).toString('utf8'),
        readFile: async path => disk.get(path),
        writeTextFile: async (path, text) => { disk.set(path, bytes(text)); },
        writeFile: async (path, content) => { disk.set(path, content); },
    },
};

function world() {
    disk.set('/work/isle.gmap', bytes('GRMAP001\nWIDTH 2\nHEIGHT 1\nLEVELNAMES\n"isle_a.nw","isle_b.nw"\nLEVELNAMESEND\n'));
    disk.set('/work/isle_a.nw', bytes('GLEVNW01\nlevel a'));
    disk.set('/work/isle_b.nw', bytes('GLEVNW01\nlevel b'));
    disk.set('/work/hut.png', bytes('png'));
}

const calls = tool => remote.calls.filter(call => call.tool === tool);
const staged = () => [...disk.keys()].filter(path => path.includes('gsuite-upload-'));

test('remote_status says why there is nothing to work with', async () => {
    reset();
    remote.enabled = false;
    assert.match(json(await mcp.call('remote_status', {})).message, /turned off. Only the user can turn it on/);
    remote.enabled = true;
    remote.connected = false;
    remote.error = 'no running Remote Control answered: start Remote Control and turn MCP on under Options > MCP';
    const down = json(await mcp.call('remote_status', {}));
    assert.equal(down.connected, false);
    assert.match(down.message, /cannot be reached: no running Remote Control answered/);
    assert.equal(remote.calls.length, 0, 'nothing is asked of a Remote Control that is not there');
});

test('remote_status reports what Remote Control allows and describes a tool', async () => {
    reset();
    const status = json(await mcp.call('remote_status', { tool: 'rc_import' }));
    assert.deepEqual(status.servers, ['alpha']);
    assert.equal(status.remote_control.approvals, true);
    assert.match(status.message, /asks its user before a change/);
    assert.equal(status.tool.name, 'rc_import');
    assert.ok(status.tools.includes('rc_update_levels'));
    assert.match(failure(await mcp.call('remote_status', { tool: 'rc_command' })), /offers no tool named "rc_command" right now/);
    // With approvals switched off in Remote Control nothing stands between a call and the server.
    remoteCallHook = tool => tool === 'rc_status' ? textResult({ bridge: 'connected', localRoots: remote.roots, approvals: false }) : null;
    try {
        assert.match(json(await mcp.call('remote_status', {})).message, /Approvals are OFF in Remote Control.*Confirm each change with the user yourself/);
    } finally {
        remoteCallHook = () => null;
    }
});

test('a dry run compares with the server itself and sends nothing', async () => {
    reset();
    world();
    remote.files.set('levels/Isle_A.nw', bytes('GLEVNW01\nlevel a'));
    const plan = json(await mcp.call('remote_upload', { files: ['/work/isle.gmap', '/work/hut.png'], dry_run: true }));
    assert.equal(plan.server, 'alpha');
    assert.equal(plan.would_send, 3);
    // Remote Control's own dry run would call every file new; the comparison is made here.
    assert.deepEqual(plan.files.map(file => [file.to, file.outcome]), [
        ['levels/isle.gmap', 'new'], ['levels/Isle_A.nw', 'unchanged'], ['levels/isle_b.nw', 'changed'], ['images/hut.png', 'new'],
    ]);
    assert.match(plan.files[2].message, /the server's copy is 5 bytes/);
    assert.equal(remote.files.size, 2, 'nothing reached the server');
    assert.equal(calls('rc_import').length, 0, 'a dry run hands nothing to Remote Control');
    assert.equal(calls('rc_update_levels').length, 0);
    assert.deepEqual(staged(), []);
    assert.equal(removed.length, 0);
});

test('an upload sends one batch, names the server, and reloads the levels that changed', async () => {
    reset();
    world();
    remote.files.set('levels/Isle_A.nw', bytes('GLEVNW01\nlevel a'));
    const sent = json(await mcp.call('remote_upload', { files: ['/work/isle.gmap', '/work/hut.png'] }));
    assert.equal(sent.ok, true);
    assert.equal(sent.sent, 3);
    assert.deepEqual(sent.reloaded, ['isle_b.nw']);
    assert.equal(Buffer.from(remote.files.get('levels/isle_b.nw')).toString(), 'GLEVNW01\nlevel b');
    assert.deepEqual(sent.files.map(file => [file.to, file.outcome]), [
        ['levels/isle.gmap', 'created'], ['levels/Isle_A.nw', 'unchanged'], ['levels/isle_b.nw', 'replaced'], ['images/hut.png', 'created'],
    ]);
    assert.ok(sent.files[2].backup);
    assert.ok(sent.notes.some(note => /rc_restore_backup/.test(note)));
    // One question for the files: a single import, holding only what differs from the server.
    assert.equal(calls('rc_import').length, 1);
    assert.equal(calls('rc_import')[0].args.dryRun, undefined);
    assert.deepEqual(calls('rc_import')[0].args.kinds, ['file']);
    for (const call of remote.calls.filter(call => !['rc_status', 'rc_list_connections'].includes(call.tool))) assert.equal(call.args.server, 'alpha', `${call.tool} must name the server`);
    assert.equal(removed.length, 1);
    assert.match(removed[0], /^\/rc\/mcp-files\/gsuite-upload-/);
    assert.deepEqual(staged(), []);

    // Sending the same files again changes nothing and asks nobody.
    remote.calls = [];
    const again = json(await mcp.call('remote_upload', { files: ['/work/isle.gmap', '/work/hut.png'] }));
    assert.equal(again.sent, 0);
    assert.equal(calls('rc_import').length, 0);
    assert.equal(calls('rc_update_levels').length, 0);
});

test('a staging folder is not left behind when a file cannot be copied into it', async () => {
    reset();
    world();
    unreadable = '/work/isle_b.nw';
    const originalError = console.error;
    console.error = () => {};
    try {
        failure(await mcp.call('remote_upload', { files: ['/work/isle_a.nw', '/work/isle_b.nw'] }));
    } finally {
        console.error = originalError;
    }
    assert.equal(removed.length, 1);
    assert.deepEqual(staged(), []);
    assert.equal(calls('rc_import').length, 0);
});

test('declining the reload leaves the files sent and says so', async () => {
    reset();
    world();
    const original = remoteCallHook;
    remoteCallHook = tool => tool === 'rc_update_levels' ? { error: { code: -32002, message: 'Mutation denied by user' } } : null;
    try {
        const sent = json(await mcp.call('remote_upload', { files: ['/work/isle_a.nw'] }));
        assert.equal(sent.sent, 1);
        assert.equal(sent.reloaded, undefined);
        assert.ok(sent.notes.some(note => /reloading the levels was declined.*Do not ask again/.test(note)));
    } finally {
        remoteCallHook = original;
    }
});

test('a declined upload stops there and cleans up', async () => {
    reset();
    world();
    remote.declines = true;
    const message = failure(await mcp.call('remote_upload', { files: ['/work/isle_a.nw'] }));
    assert.match(message, /declined in Remote Control/);
    assert.match(message, /Do not repeat it or try another way round/);
    assert.equal(remote.files.has('levels/isle_a.nw'), false);
    assert.equal(calls('rc_update_levels').length, 0);
    assert.deepEqual(staged(), []);
});

test('levels are sent even when the server cannot be asked to reload them', async () => {
    reset();
    world();
    remote.tools = remote.tools.filter(tool => tool !== 'rc_update_levels');
    const sent = json(await mcp.call('remote_upload', { files: ['/work/isle_a.nw'] }));
    assert.equal(sent.sent, 1);
    assert.equal(sent.reloaded, undefined);
    assert.ok(sent.notes.some(note => /needs "Allow server and game mutations" ticked/.test(note)));
});

test('an upload is refused before anything is staged when it cannot be right', async () => {
    reset();
    world();
    const upload = args => mcp.call('remote_upload', args);
    disk.delete('/work/isle_b.nw');
    assert.match(failure(await upload({ files: ['/work/isle.gmap'] })), /No such file: \/work\/isle_b\.nw \(a level of isle\.gmap\)/);
    assert.equal(json(await upload({ files: ['/work/isle.gmap'], include_members: false, dry_run: true })).would_send, 1);
    world();

    disk.set('/work/notes.txt', bytes('x'));
    assert.match(failure(await upload({ files: ['/work/notes.txt'] })), /No folder the account may write to takes notes\.txt\. Writable: levels\/\*\.nw/);
    assert.match(failure(await upload({ files: ['/work/hut.png'], folder: 'levels' })), /may not write hut\.png to levels\//);
    // A folder is found whatever its case, and written the way the server spells it.
    assert.equal(json(await upload({ files: ['/work/isle_a.nw'], folder: 'LEVELS', dry_run: true })).files[0].to, 'levels/isle_a.nw');

    remote.rights.push({ folder: 'world/', pattern: 'world/*.nw', rights: 'rw', writable: true });
    assert.match(failure(await upload({ files: ['/work/isle_a.nw'] })), /could go to levels\/ or world\/\. Say which with folder/);
    assert.equal(json(await upload({ files: ['/work/isle_a.nw'], folder: 'world/', dry_run: true })).files[0].to, 'world/isle_a.nw');

    remote.limit = 4;
    assert.match(failure(await upload({ files: ['/work/hut.png', '/work/isle_a.nw'], folder: 'levels/' })), /may not write hut\.png/);
    assert.match(failure(await upload({ files: ['/work/isle_a.nw'], folder: 'world/' })), /alpha accepts files up to 4 bytes/);
    remote.limit = 0;

    remote.connections = ['alpha', 'beta'];
    assert.match(failure(await upload({ files: ['/work/hut.png'] })), /connected to several servers: alpha, beta\. Say which one with server/);
    assert.match(failure(await upload({ files: ['/work/hut.png'], server: 'gamma' })), /not connected to "gamma"/);
    assert.equal(json(await upload({ files: ['/work/hut.png'], server: 'BETA', dry_run: true })).server, 'beta');

    assert.match(failure(await upload({ files: ['relative.nw'] })), /must be an absolute path/);
    remote.tools = remote.tools.filter(tool => tool !== 'rc_import');
    assert.match(failure(await upload({ files: ['/work/hut.png'], server: 'alpha' })), /does not offer rc_import\. The user has to tick "Allow file and script writes"/);
    assert.deepEqual(staged(), []);
});

test('remote_download saves server files locally and opens the levels', async () => {
    reset();
    remote.files.set('levels/isle.gmap', bytes('GRMAP001\nWIDTH 1\nHEIGHT 1\nLEVELNAMES\n"isle_b.nw"\nLEVELNAMESEND\n'));
    remote.files.set('levels/cave.nw', bytes('GLEVNW01\ncave'));
    remote.files.set('levels/binary.nw', new Uint8Array([0, 255, 10, 13]));
    const opened = [];
    mcp.tool({ name: 'level_open', description: 'Stand-in for the level editor', input: { path: mcp.S.string('Path') } }, async ({ path }) => {
        opened.push(path);
        return { opened: { name: path.split('/').pop() }, already_open: path === '/dl/binary.nw' };
    });

    disk.set('/dl/cave.nw', bytes('mine'));
    const result = json(await mcp.call('remote_download', { to: '/dl', folder: 'levels', query: '*', files: ['levels/missing.nw'], open: true }));
    assert.equal(result.saved, 3);
    assert.deepEqual(result.files.map(file => [file.from, file.outcome]), [
        ['levels/missing.nw', 'failed'], ['levels/isle_b.nw', 'saved'], ['levels/isle.gmap', 'saved'], ['levels/cave.nw', 'kept'], ['levels/binary.nw', 'saved'],
    ]);
    assert.equal(Buffer.from(disk.get('/dl/cave.nw')).toString(), 'mine', 'a local file is not replaced unless asked');
    assert.deepEqual([...disk.get('/dl/binary.nw')], [0, 255, 10, 13], 'bytes arrive unchanged');
    // The gmap opens its own levels; the others are opened one by one. A local file that was kept is not the server's, so it is not opened.
    assert.deepEqual(opened, ['/dl/isle.gmap', '/dl/binary.nw']);
    assert.equal(result.opened[0].already_open, undefined);
    assert.equal(result.opened[1].already_open, true);
    assert.match(result.opened[1].note, /still shows what it had before the download/);
    assert.equal(calls('rc_read_file').every(call => call.args.encoding === 'base64' && call.args.server === 'alpha'), true);

    const replaced = json(await mcp.call('remote_download', { to: '/dl', files: ['levels/cave.nw'], overwrite: true }));
    assert.equal(replaced.files[0].outcome, 'saved');
    assert.equal(Buffer.from(disk.get('/dl/cave.nw')).toString(), 'GLEVNW01\ncave');

    remote.files.set('world/cave.nw', bytes('other cave'));
    assert.match(failure(await mcp.call('remote_download', { to: '/dl', files: ['levels/cave.nw', 'world/cave.nw'], overwrite: true })), /levels\/cave\.nw and world\/cave\.nw would both be saved as cave\.nw/);
    assert.match(failure(await mcp.call('remote_download', { to: '/dl', folder: 'levels/' })), /Give a query with folder/);
    assert.match(failure(await mcp.call('remote_download', { to: '/dl' })), /Say what to fetch/);
    assert.match(failure(await mcp.call('remote_download', { to: '/dl', files: ['start.nw'] })), /is not a server path/);
    assert.match(failure(await mcp.call('remote_download', { to: '/dl', folder: 'levels/', query: 'nothing*' })), /Nothing on alpha matches levels\/nothing\*/);
});

test('remote_call passes a Remote Control tool through and explains its refusals', async () => {
    reset();
    const listed = await mcp.call('remote_call', { tool: 'rc_list_connections' });
    assert.deepEqual(listed, { content: [{ type: 'text', text: '["alpha"]' }], isError: false });
    assert.match(failure(await mcp.call('remote_call', { tool: 'level_save' })), /is not a Remote Control tool/);
    assert.match(failure(await mcp.call('remote_call', { tool: 'rc_command', arguments: { command: '/shutdown' } })), /rc_command: Tool unavailable or disabled by MCP scope\. The tool exists only while its permission is ticked/);
    const missing = await mcp.call('remote_call', { tool: 'rc_read_file', arguments: { path: 'levels/none.nw', server: 'alpha' } });
    assert.match(failure(missing), /rc_read_file: There is no file levels\/none\.nw on alpha/);
    remoteCallHook = () => ({ error: { code: -32001, message: 'MCP integration is disabled in RC Options' } });
    try {
        assert.match(failure(await mcp.call('remote_call', { tool: 'rc_list_connections' })), /disabled in RC Options\. Only the user can turn it on: "Enable local MCP integration"/);
    } finally {
        remoteCallHook = () => null;
    }
    remote.enabled = false;
    assert.match(failure(await mcp.call('remote_call', { tool: 'rc_list_connections' })), /bridge is turned off/);
});

test('server folders that leave the file tree are never a destination', async () => {
    reset();
    world();
    remote.rights.push(
        { folder: '../../../Documents/', pattern: '../../../Documents/*.png', rights: 'rw', writable: true },
        { folder: 'a/../../b/', pattern: 'a/../../b/*.png', rights: 'rw', writable: true },
        { folder: 'C:/Users/', pattern: 'C:/Users/*.png', rights: 'rw', writable: true },
        { folder: './maps/', pattern: './maps/*.png', rights: 'rw', writable: true },
        // A leading slash is only how some servers write a folder of their own tree.
        { folder: '/heads/', pattern: '/heads/*.png', rights: 'rw', writable: true },
    );
    const folders = await mcp.helpers.remote.writableFolders('alpha');
    assert.deepEqual(folders.map(entry => entry.folder), ['levels/', 'levels/', 'images/', 'heads/']);
    assert.match(failure(await mcp.call('remote_upload', { files: ['/work/hut.png'], folder: '../../../Documents/', server: 'alpha' })), /may not write/);
    assert.deepEqual(staged(), []);
});

test('remote_download refuses a truncated answer and writes nothing for it', async () => {
    reset();
    remote.files.set('levels/cave.nw', bytes('GLEVNW01\ncave'));
    remote.files.set('levels/whole.nw', bytes('whole'));
    remote.files.set('levels/short.nw', bytes('short'));
    remoteCallHook = (tool, args) => {
        if (tool !== 'rc_read_file') return null;
        if (args.path === 'levels/cave.nw') return textResult({ path: args.path, size: 13, encoding: 'base64', base64: base64(bytes('GLEV')) });
        // No size in the answer: the listing's size is used.
        if (args.path === 'levels/short.nw') return textResult({ path: args.path, encoding: 'base64', base64: base64(bytes('sh')) });
        return null;
    };
    try {
        const result = json(await mcp.call('remote_download', { to: '/dl', folder: 'levels/', query: '*.nw' }));
        const byFrom = Object.fromEntries(result.files.map(file => [file.from, file]));
        assert.equal(byFrom['levels/cave.nw'].outcome, 'failed');
        assert.match(byFrom['levels/cave.nw'].message, /only 4 of 13 bytes/);
        assert.equal(byFrom['levels/short.nw'].outcome, 'failed');
        assert.match(byFrom['levels/short.nw'].message, /only 2 of 5 bytes/);
        assert.equal(byFrom['levels/whole.nw'].outcome, 'saved');
        assert.equal(result.saved, 2, 'whole.nw and the server\'s isle_b.nw');
        assert.equal(disk.has('/dl/cave.nw'), false);
        assert.equal(disk.has('/dl/short.nw'), false);
    } finally {
        remoteCallHook = () => null;
    }
});
