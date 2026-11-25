// Tests for the existing-file check of the gmap tools (js/mcp/world.js), against a stand-in for the desktop app.
const test = require('node:test');
const assert = require('node:assert/strict');

const mcp = require('../js/mcp/core.js');
globalThis.window = globalThis;
globalThis.GSuiteMCP = mcp;
require('../js/mcp/app.js');
require('../js/mcp/level.js');
require('../js/mcp/world.js');

const failure = result => { assert.equal(result.isError, true, JSON.stringify(result)); return result.content[0].text; };

let disk;
globalThis.LevelEditor = class {};
globalThis._editor = Object.assign(new LevelEditor(), { objectImages: {}, levels: [] });
globalThis.__GSUITE__ = {
    core: {
        async invoke(method, args) {
            if (method === 'GetSystemInfo') return { os: 'linux', pathSeparator: '/' };
            if (method === 'StatPath') return { name: args[0].split('/').pop(), path: args[0], exists: disk.has(args[0]), isDir: false, size: 0 };
            if (method === 'MakeDir') return null;
            throw new Error('unexpected ' + method);
        },
    },
    fs: { async readTextFile(target) { return disk.get(target); }, async writeTextFile(target, text) { disk.set(target, text); } },
};

test('gmap_new and world_generate refuse existing files in folder', async () => {
    disk = new Map([['/game/overworld.gmap', 'old'], ['/game/overworld_a1.nw', 'old']]);
    for (const [tool, args] of [['gmap_new', {}], ['world_generate', { map: ['.'] }]]) {
        const message = failure(await mcp.call(tool, { name: 'overworld', columns: 2, rows: 1, folder: '/game', ...args }));
        assert.match(message, /overworld\.gmap, overworld_a1\.nw\./);
        assert.doesNotMatch(message, /overworld_b1/);
    }
    assert.equal(disk.get('/game/overworld.gmap'), 'old');
});

test('gmap_from_levels refuses an existing .gmap unless overwrite is set', async () => {
    disk = new Map([['/game/world.gmap', 'old'], ['/game/a.nw', 'level']]);
    const args = { name: 'world', folder: '/game', levels: [['a.nw']] };
    assert.match(failure(await mcp.call('gmap_from_levels', args)), /world\.gmap/);
    assert.equal(disk.get('/game/world.gmap'), 'old');
    await mcp.call('gmap_from_levels', { ...args, overwrite: true });
    assert.match(disk.get('/game/world.gmap'), /^GRMAP001/);
});
