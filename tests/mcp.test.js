// Tests for the MCP tool registry (js/mcp/core.js) and the tool definitions (js/mcp/*.js): run with `node --test tests` (npm test).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mcp = require('../js/mcp/core.js');
const { S } = mcp;

// The tool files are browser scripts that register with window.GSuiteMCP when loaded.
// Their handlers need the app; loading them here checks the definitions themselves.
globalThis.window = globalThis;
globalThis.GSuiteMCP = mcp;
for (const file of ['app.js', 'level.js', 'world.js', 'check.js', 'gani.js', 'tools.js', 'scripts.js', 'remote.js', 'guide.js']) require('../js/mcp/' + file);

const text = result => result.content[0].text;

test('a handler result becomes text content', async () => {
    mcp.tool({ name: 'test_echo', description: 'Echo', input: { value: S.string('Anything') } }, async ({ value }) => value === undefined ? undefined : { value });
    assert.deepEqual(await mcp.call('test_echo', { value: 'hi' }), { content: [{ type: 'text', text: '{"value":"hi"}' }] });
    assert.equal(text(await mcp.call('test_echo', {})), 'OK');
});

test('images and several parts go through result()', async () => {
    mcp.tool({ name: 'test_image', description: 'Image' }, async () => mcp.result({ width: 1 }, mcp.image('data:image/png;base64,QUJD'), 'done'));
    const result = await mcp.call('test_image', {});
    assert.deepEqual(result.content, [{ type: 'text', text: '{"width":1}' }, { type: 'image', data: 'QUJD', mimeType: 'image/png' }, { type: 'text', text: 'done' }]);
});

test('arguments are checked against the schema before the handler runs', async () => {
    let calls = 0;
    mcp.tool({
        name: 'test_args',
        description: 'Arguments',
        input: { x: S.integer('Column', { minimum: 0, maximum: 63 }), mode: S.enum(['a', 'b'], 'Mode', { default: 'a' }), flag: S.boolean('Flag'), rows: S.array(S.array({ type: ['integer', 'null'] }), 'Rows') },
        required: ['x'],
    }, async args => { calls++; return args; });

    const missing = await mcp.call('test_args', {});
    assert.equal(missing.isError, true);
    assert.match(text(missing), /Missing required argument "x" \(Column\)/);

    assert.match(text(await mcp.call('test_args', { x: 64 })), /x must be at most 63, got 64/);
    assert.match(text(await mcp.call('test_args', { x: 1.5 })), /x must be a whole number/);
    assert.match(text(await mcp.call('test_args', { x: 1, mode: 'c' })), /mode must be one of "a", "b"/);
    assert.match(text(await mcp.call('test_args', { x: 1, nope: true })), /Unknown argument "nope". Valid arguments: x, mode, flag, rows/);
    assert.match(text(await mcp.call('test_args', { x: 1, rows: [[1, 'two']] })), /rows\[0\]\[1\] must be/);
    assert.equal(calls, 0);

    // A level given by index arrives as a number where a name is expected.
    mcp.tool({ name: 'test_name', description: 'Name', input: { level: S.string('Level name or index') } }, async args => args);
    assert.deepEqual(JSON.parse(text(await mcp.call('test_name', { level: 2 }))), { level: '2' });

    // Clients often send numbers and booleans as strings; defaults fill in what is left out.
    const ok = await mcp.call('test_args', { x: '12', flag: 'true', rows: [[1, null]] });
    assert.deepEqual(JSON.parse(text(ok)), { x: 12, flag: true, rows: [[1, null]], mode: 'a' });
    assert.equal(calls, 1);
});

test('nested objects are strict, and arguments have to be an object', async () => {
    mcp.tool({
        name: 'test_nested',
        description: 'Nested',
        input: { item: S.object({ sprite: S.integer('Sprite') }, ['sprite'], 'An item'), free: S.object({}, [], 'Anything'), ids: S.array(S.integer({ minimum: 0 }), 'Ids') },
    }, async args => args);
    assert.match(text(await mcp.call('test_nested', { item: { sprite: 1, sideways: 2 } })), /Unknown argument "item.sideways". Valid arguments: sprite/);
    assert.match(text(await mcp.call('test_nested', { item: {} })), /Missing required argument "item.sprite"/);
    assert.deepEqual(JSON.parse(text(await mcp.call('test_nested', { free: { anything: 'goes' } }))), { free: { anything: 'goes' } });
    assert.match(text(await mcp.call('test_nested', { ids: [1, -2] })), /ids\[1\] must be at least 0/);
    assert.match(text(await mcp.call('test_nested', { constructor: 1 })), /Unknown argument "constructor"/);
    assert.match(text(await mcp.call('test_nested', 'not an object')), /arguments must be an object, got string/);
    assert.match(text(await mcp.call('test_nested', [1])), /arguments must be an object, got array/);
});

test('a failing handler becomes an error result, not an exception', async () => {
    mcp.tool({ name: 'test_fail', description: 'Fails' }, async () => mcp.fail('No level is open.'));
    mcp.tool({ name: 'test_crash', description: 'Crashes' }, async () => { throw new TypeError('x is undefined'); });
    const originalError = console.error;
    console.error = () => {};
    try {
        assert.deepEqual(await mcp.call('test_fail', {}), { isError: true, content: [{ type: 'text', text: 'No level is open.' }] });
        assert.match(text(await mcp.call('test_crash', {})), /Internal error in GSuite: x is undefined/);
        assert.match(text(await mcp.call('no_such_tool', {})), /Unknown tool: no_such_tool/);
    } finally {
        console.error = originalError;
    }
    const last = mcp.activity.at(-1);
    assert.equal(last.tool, 'test_crash');
    assert.equal(last.ok, false);
});

test('a handler that never finishes is abandoned after its timeout', async () => {
    mcp.tool({ name: 'test_stuck', description: 'Never finishes', timeoutMs: 30 }, () => new Promise(() => {}));
    const result = await mcp.call('test_stuck', {});
    assert.equal(result.isError, true);
    assert.match(text(result), /test_stuck did not finish within .* may still be running/);
    // One that is merely late is waited for, so the next tool does not start while it is still editing.
    let finished = false;
    mcp.tool({ name: 'test_late', description: 'Finishes late', timeoutMs: 30 }, () => new Promise(resolve => setTimeout(() => { finished = true; resolve('done'); }, 45)));
    const late = await mcp.call('test_late', {});
    assert.equal(finished, true);
    assert.match(text(late), /it has finished since/);
});

test('requests are answered in MCP shapes', async () => {
    mcp.resource({ uri: 'test://doc', name: 'doc' }, () => 'body');
    mcp.prompt({ name: 'test_prompt', description: 'A prompt', arguments: [{ name: 'who' }] }, args => `Hello ${args.who}`);
    assert.deepEqual(await mcp.handle('resources/read', { uri: 'test://doc' }), { result: { contents: [{ uri: 'test://doc', mimeType: 'text/markdown', text: 'body' }] } });
    assert.equal((await mcp.handle('resources/read', { uri: 'test://none' })).error.code, -32002);
    assert.deepEqual((await mcp.handle('prompts/get', { name: 'test_prompt', arguments: { who: 'you' } })).result.messages, [{ role: 'user', content: { type: 'text', text: 'Hello you' } }]);
    assert.equal((await mcp.handle('prompts/get', { name: 'none' })).error.code, -32602);
    assert.equal((await mcp.handle('tools/call', { name: 'test_echo', arguments: { value: 'x' } })).result.content[0].text, '{"value":"x"}');
    assert.equal((await mcp.handle('no/such', {})).error.code, -32601);
});

test('the manifest describes tools the way MCP clients expect', () => {
    mcp.tool({ name: 'test_slow', title: 'Slow', description: 'Slow', readOnly: true, timeoutMs: 5000 }, async () => 'ok');
    const manifest = mcp.manifest();
    const slow = manifest.tools.find(tool => tool.name === 'test_slow');
    assert.deepEqual(slow.inputSchema, { type: 'object', properties: {}, required: [], additionalProperties: false });
    assert.deepEqual(slow.annotations, { title: 'Slow', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.equal(manifest.timeouts.test_slow, 5000);
    assert.ok(manifest.instructions.length > 0);
    assert.throws(() => mcp.tool({ name: 'Bad Name', description: 'x' }, async () => {}), /Invalid MCP tool name/);
});

const appTools = () => mcp.manifest().tools.filter(tool => !tool.name.startsWith('test_'));

test('every tool is well-formed', () => {
    const tools = appTools();
    assert.ok(tools.length > 80, `expected the full tool set, got ${tools.length}`);
    const prefixes = /^(app|fs|workspace|level|npc_library|gmap|world|play|gani|particle|setshape|script|remote)_/;
    for (const tool of tools) {
        assert.match(tool.name, prefixes, `${tool.name} needs a known prefix`);
        assert.ok(tool.title && tool.title !== tool.name, `${tool.name} needs a title`);
        assert.ok(tool.description.length >= 30, `${tool.name} needs a description an agent can act on`);
        for (const key of tool.inputSchema.required) assert.ok(tool.inputSchema.properties[key], `${tool.name} requires "${key}", which it does not define`);
        for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
            assert.ok(schema.description, `${tool.name}.${key} needs a description`);
            assert.ok(schema.type, `${tool.name}.${key} needs a type`);
        }
    }
});

test('every tool is listed in docs/mcp.md', () => {
    const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'mcp.md'), 'utf8');
    const missing = appTools().map(tool => tool.name).filter(name => !docs.includes('`' + name + '`'));
    assert.deepEqual(missing, []);
});

test('tools that need nothing from the app answer here too', async () => {
    const legend = JSON.parse(text(await mcp.call('world_terrain_legend', {})));
    assert.ok(legend.some(entry => entry.terrain === 'water' && entry.character === '~'));
    assert.equal(new Set(legend.map(entry => entry.character)).size, legend.length, 'terrain characters must be distinct');

    assert.deepEqual(JSON.parse(text(await mcp.call('setshape_setimgpart', { image: 'a.png', x: 0, y: 16, width: 32, height: 32 }))), { code: 'setimgpart("a.png", 0, 16, 32, 32);' });
    assert.deepEqual(JSON.parse(text(await mcp.call('setshape_setimgpart', { image: 'a.png', x: 0, y: 16, width: 32, height: 32, style: 'gs1' }))), { code: 'setimgpart a.png,0,16,32,32;' });

    assert.match(text(await mcp.call('app_get_guide', { topic: 'overview' })), /^# GSuite and its MCP tools/);
    assert.match(text(await mcp.call('app_get_guide', { topic: 'nope' })), /topic must be one of/);
});

test('the instructions an agent is given cover linking and verification, and name real tools', async () => {
    const { instructions, tools } = mcp.manifest();
    assert.equal(instructions, text(await mcp.call('app_get_guide', { topic: 'rules' })));
    for (const topic of ['## Links between levels', '## Verify before you say it is done', '## Live servers (Remote Control)', 'level_check', 'level_screenshot', 'remote_status']) assert.ok(instructions.includes(topic), `instructions should mention ${topic}`);
    // Every tool the instructions and guides tell the agent to call has to exist (file names such as world_a1.nw and quoted values are not tools).
    const names = new Set(tools.map(tool => tool.name));
    const guides = await Promise.all(mcp.manifest().resources.filter(resource => resource.uri.startsWith('gsuite://guide/')).map(resource => mcp.handle('resources/read', { uri: resource.uri })));
    const mentioned = new Set();
    for (const body of [instructions, ...guides.map(guide => guide.result.contents[0].text)]) {
        for (const match of body.matchAll(/(?<!["'])\b(?:app|fs|workspace|level|npc_library|gmap|world|play|gani|particle|setshape|script|remote)_[a-z0-9_]+\b(?!\.\w)/g)) mentioned.add(match[0]);
    }
    const unknown = [...mentioned].filter(name => !names.has(name) && !/_$/.test(name));
    assert.deepEqual(unknown, []);
});

test('guides are offered as resources and prompts fill in their arguments', async () => {
    const manifest = mcp.manifest();
    for (const topic of ['rules', 'overview', 'world-building', 'tiles', 'level-format', 'gmap-format', 'gscript', 'gani-format', 'particles', 'remote-control']) {
        assert.ok(manifest.resources.some(resource => resource.uri === `gsuite://guide/${topic}`), `missing guide ${topic}`);
    }
    const guide = await mcp.handle('resources/read', { uri: 'gsuite://guide/level-format' });
    assert.match(guide.result.contents[0].text, /GLEVNW01/);
    const prompt = await mcp.handle('prompts/get', { name: 'build_world', arguments: { description: 'a pirate cove', folder: '/tmp/cove' } });
    assert.match(prompt.result.messages[0].content.text, /a pirate cove[\s\S]*\/tmp\/cove/);
});

test('setimgpart refuses an image name that would break the string literal', async () => {
    for (const image of ['a"b.png', 'a\\b.png', 'a\nb.png']) {
        const result = await mcp.call('setshape_setimgpart', { image, x: 0, y: 0, width: 16, height: 16 });
        assert.equal(result.isError, true);
        assert.match(text(result), /cannot contain/);
    }
});

test('app_update_settings checks key bindings and player settings before applying anything', async () => {
    const store = {};
    globalThis.localStorage = { getItem: key => key in store ? store[key] : null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; } };
    globalThis._DEFAULT_KB = { selectTool: 'q', eraseTool: 'e' };
    const defaults = { nick: 'unknown', colors: [null, null], ATTR1: '' };
    const saved = [];
    const editor = {
        _getSettings: () => ({ uiScale: 1 }), _saveSettings: next => saved.push(['settings', next]), _applyUISettings() {},
        _getKeybinds: () => ({ selectTool: 'q', eraseTool: 'e' }), _saveKeybinds: next => saved.push(['keybinds', next]), _updateToolButtonTooltips() {},
        _defaultPlayerSettings: () => ({ ...defaults }), _playerSettings: null,
    };
    const previous = mcp.helpers.level;
    mcp.helpers.level = { editor: async () => editor };
    try {
        for (const args of [{ keybinds: { selectTool: 5 } }, { player: { colors: 'red' } }, { player: { foo: 1 } }, { editor: { uiScale: 2 }, player: { nick: 3 } }]) {
            const result = await mcp.call('app_update_settings', args);
            assert.equal(result.isError, true, JSON.stringify(args));
        }
        assert.deepEqual(saved, []);
        assert.equal(store.graal_playerSettings, undefined);
        const ok = await mcp.call('app_update_settings', { keybinds: { selectTool: '' }, player: { nick: 'bob' } });
        assert.notEqual(ok.isError, true, text(ok));
        assert.deepEqual(saved, [['keybinds', { selectTool: 'q', eraseTool: 'e' }]]);
        assert.equal(JSON.parse(store.graal_playerSettings).nick, 'bob');
    } finally {
        mcp.helpers.level = previous;
    }
});

test('connect only counts as connected once the listeners are registered, and registers each of them once', async () => {
    let failAt = 1, calls = 0;
    const live = new Map();
    const listen = async name => {
        if (++calls === failAt) throw new Error('no events');
        live.set(name, (live.get(name) || 0) + 1);
        return () => live.set(name, live.get(name) - 1);
    };
    globalThis.__GSUITE__ = { event: { listen }, core: { invoke: async () => {} } };
    try {
        await assert.rejects(mcp.connect(), /no events/);
        // A failure part of the way through takes off the listeners that were already on.
        calls = 0; failAt = 3;
        await assert.rejects(mcp.connect(), /no events/);
        assert.deepEqual([...live.values()], [0, 0]);
        // Two calls at once share one attempt.
        calls = 0; failAt = 0;
        assert.deepEqual(await Promise.all([mcp.connect(), mcp.connect()]), [true, true]);
        assert.deepEqual(Object.fromEntries(live), { 'mcp:request': 1, 'mcp:cancel': 1, 'mcp:activity': 1, 'mcp:status': 1 });
        assert.equal(await mcp.connect(), false);
    } finally {
        delete globalThis.__GSUITE__;
    }
});
