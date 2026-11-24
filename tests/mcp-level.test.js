// Tests for level tool checks (js/mcp/level.js) that run against a stand-in level editor.
const test = require('node:test');
const assert = require('node:assert/strict');

const mcp = require('../js/mcp/core.js');

globalThis.window = globalThis;
globalThis.GSuiteMCP = mcp;
for (const file of ['app.js', 'level.js']) require('../js/mcp/' + file);

const text = result => result.content[0].text;

// A gmap of two member levels side by side, with an NPC in each.
function installEditor() {
    globalThis.LevelEditor = class {};
    const level = {
        width: 128, height: 64, layers: [{}], tilesetName: 'pics1.png', tilesetImage: { complete: true }, _mcpTileset: 'pics1.png',
        objects: [{ id: 'npc_a', type: 'npc', x: 5, y: 5, properties: {} }, { id: 'npc_b', type: 'npc', x: 70, y: 5, properties: {} }],
        setTile() { throw new Error('nothing should be written'); },
    };
    const entry = { name: 'world.gmap', level, gmapGrid: [['"a.nw"', '"b.nw"']], gmapLevels: { 'a.nw': {}, 'b.nw': {} } };
    const le = Object.assign(new LevelEditor(), { objectImages: {}, levels: [entry], currentLevelIndex: 0, level, pushUndo() {}, switchLevel() {} });
    window._editor = le;
}

test('a pattern with an empty row is refused', async () => {
    installEditor();
    const result = await mcp.call('level_fill_rect', { x: 0, y: 0, width: 4, height: 4, pattern: [[5], []] });
    assert.equal(result.isError, true);
    assert.match(text(result), /pattern is empty/);
});

test('an object of another member level is reported with the member it is in', async () => {
    installEditor();
    const get = await mcp.call('level_get_object', { level: 'a.nw', id: 'npc_b' });
    assert.equal(get.isError, true);
    assert.match(text(get), /not in a\.nw.*it is in b\.nw/);
    const del = await mcp.call('level_delete_objects', { level: 'a.nw', ids: ['npc_b'] });
    assert.equal(del.isError, true);
    assert.match(text(del), /it is in b\.nw/);
    assert.equal(window._editor.level.objects.length, 2);
});
