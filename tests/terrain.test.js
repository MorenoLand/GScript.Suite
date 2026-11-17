// Tests for the terrain map (js/terrain.js): run with `node --test tests`.
const test = require('node:test');
const assert = require('node:assert/strict');
const {TerrainMap} = require('../js/terrain.js');

const gmap = `GRMAP001
WIDTH 2
HEIGHT 2
GENSEED 7
GENBASE 0
GENHEIGHT 3
GENCHAOS 0.6
LEVHEIGHT 0
LEVCHAOS 0.6
LEVELNAMES
a.nw,b.nw
c.nw,d.nw
LEVELNAMESEND
`;

test('a terrain map parses and generates every member', () => {
    const terrain = TerrainMap.parse(gmap);
    assert.ok(terrain);
    assert.equal(terrain.width, 2);
    assert.equal(terrain.height, 2);
    assert.equal(terrain.heightMap.length, 9);
    assert.equal(terrain.randomSeeds.length, 4);
    assert.equal(terrain.levels.length, 4);
    assert.equal(terrain.memberNames[0], 'a.nw');
    assert.equal(terrain.memberNames[3], 'd.nw');
    assert.ok(Number.isFinite(terrain.minimumHeight));
    assert.ok(Number.isFinite(terrain.maximumHeight));
});

test('generation is deterministic', () => {
    const first = TerrainMap.parse(gmap);
    const second = TerrainMap.parse(gmap);
    assert.deepEqual(first.heightMap, second.heightMap);
    assert.deepEqual(first.randomSeeds, second.randomSeeds);
    assert.deepEqual(first.levels[0], second.levels[0]);
});

test('shared member seams are equal', () => {
    const terrain = TerrainMap.parse(gmap);
    for (let tile = 0; tile <= 64; tile++) {
        assert.equal(terrain.sampleLevel(0, 0, 64, tile), terrain.sampleLevel(1, 0, 0, tile));
        assert.equal(terrain.sampleLevel(0, 0, tile, 64), terrain.sampleLevel(0, 1, tile, 0));
    }
});

test('a height spot on a member edge updates both members', () => {
    const terrain = TerrainMap.parse(gmap);
    const before = terrain.sampleLevel(0, 0, 64, 8);
    assert.equal(terrain.setHeightSpot(64, 8, before + 2), true);
    assert.equal(terrain.sampleLevel(0, 0, 64, 8), before + 2);
    assert.equal(terrain.sampleLevel(1, 0, 0, 8), before + 2);
    assert.match(terrain.saveText(), /HEIGHTS a\.nw 8 8/);
    assert.match(terrain.saveText(), /HEIGHTS b\.nw 8 8/);
});

test('height overrides survive a save and reload', () => {
    const terrain = TerrainMap.parse(gmap);
    terrain.setHeightSpot(8, 8, 4.5);
    const saved = terrain.saveText();
    const reloaded = TerrainMap.parse(saved);
    assert.equal(reloaded.overrides.length, 1);
    assert.equal(reloaded.sampleLevel(0, 0, 8, 8), 4.5);
    assert.equal(reloaded.sampleLevel(0, 0, 0, 0), terrain.sampleLevel(0, 0, 0, 0));
});

test('map controls change the generated surface', () => {
    const terrain = TerrainMap.parse(gmap);
    const before = terrain.sampleGlobalInterpolated(0, 0);
    assert.equal(terrain.setMapControl(0, 0, before + 3), true);
    assert.equal(terrain.sampleGlobal(0, 0), before + 3);
});

test('a save keeps unrelated gmap lines', () => {
    const terrain = TerrainMap.parse(gmap.replace('LEVELNAMES', 'BOGUS keep-me\nLEVELNAMES'));
    terrain.regenerate(true);
    assert.match(terrain.saveText(), /BOGUS keep-me/);
});

test('raising and lowering moves the whole terrain', () => {
    const terrain = TerrainMap.parse(gmap);
    const before = terrain.sampleGlobal(0, 0);
    assert.equal(terrain.shiftAll(2), true);
    assert.equal(terrain.sampleGlobal(0, 0), before + 2);
    assert.equal(terrain.shiftAll(-2), true);
    assert.equal(terrain.sampleGlobal(0, 0), before);
});

test('a gmap without terrain can be enabled later', () => {
    const plain = TerrainMap.parse('GRMAP001\nWIDTH 1\nHEIGHT 1\nLEVELNAMES\na.nw\nLEVELNAMESEND\n');
    assert.ok(plain);
    assert.equal(plain.hasTerrainData, false);
    assert.equal(plain.levels.length, 0);
    plain.regenerate(true);
    assert.equal(plain.levels.length, 1);
    assert.equal(plain.heightMap.length, 4);
    assert.equal(plain.randomSeeds.length, 1);
});

test('saveText writes the generation settings and height sections', () => {
    const terrain = TerrainMap.parse(gmap);
    terrain.regenerate(true);
    const text = terrain.saveText();
    for (const line of ['GENSEED 7', 'GENBASE 0', 'GENHEIGHT 3', 'GENCHAOS 0.6', 'LEVCHAOS 0.6', 'HEIGHTMAP', 'HEIGHTMAPEND', 'RANDOMSEEDS', 'RANDOMSEEDSEND']) assert.match(text, new RegExp('^' + line + '$', 'm'));
    assert.equal(TerrainMap.parse(text).heightMap.length, 9);
});
