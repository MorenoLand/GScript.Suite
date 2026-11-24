// Tests for the Level Generator's terrain painter (js/levelgeneditor.js): run with `node --test tests`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The generator is a browser script: load it with just enough of a page for the class to be defined.
function loadGenerator() {
    const context = { window: {}, document: { getElementById() { return null; } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'levelgeneditor.js'), 'utf8'), context);
    return context.window.LevelGenEditor;
}

const COLOURS = { '.': 'rgb(24,140,24)', 'M': 'rgb(128,0,0)', '~': 'rgb(0,0,255)' };

// One 64x64 level of grass with a 36x36 square of the given terrain in it, as rows of tile ids.
function paintSquare(terrain) {
    const pixels = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) pixels.push(COLOURS[x >= 12 && x < 48 && y >= 12 && y < 48 ? terrain : '.']);
    const [level] = loadGenerator().prototype._paintTerrain.call({ width: 64, height: 64, pixels });
    return Array.from({ length: 64 }, (_, y) => level.slice(y * 64, y * 64 + 64));
}

// Number of places where row `first` is found with row `second` directly under it.
function stacked(rows, first, second) {
    let found = 0;
    for (let y = 0; y + 1 < rows.length; y++) {
        for (let x = 0; x + first.length <= 64; x++) {
            if (first.every((tile, i) => rows[y][x + i] === tile) && second.every((tile, i) => rows[y + 1][x + i] === tile)) found++;
        }
    }
    return found;
}

// Is tile `a` anywhere directly left of tile `b`?
function sideBySide(rows, a, b) {
    return rows.some(row => row.some((tile, x) => tile === a && row[x + 1] === b));
}

// The tiles below every occurrence of `top`, `count` of them, as a set of joined strings.
function below(rows, top, count) {
    const seen = new Set();
    for (let y = 0; y + count < 64; y++) {
        for (let x = 0; x < 64; x++) {
            if (rows[y][x] === top) seen.add(Array.from({ length: count }, (_, i) => rows[y + 1 + i][x].toString(16)).join(' '));
        }
    }
    return seen;
}

test('a lake\'s west and east shores keep their cliff columns in step', () => {
    const rows = paintSquare('~');
    // The same arrangement as in hand-made levels: 111 beside 112, and 121 beside 122.
    assert.ok(stacked(rows, [0x110, 0x111, 0x112, 0x107, 0x108, 0x109], [0x110, 0x121, 0x122, 0x117, 0x118, 0x119]) > 0, 'west shore');
    assert.ok(stacked(rows, [0x1cd, 0x1ce, 0x1cf, 0x232, 0x233, 0xd5], [0x1dd, 0x1de, 0x1df, 0x242, 0x243, 0xd5]) > 0, 'east shore');
    assert.equal(sideBySide(rows, 0x111, 0x122), false);
    assert.equal(sideBySide(rows, 0x121, 0x112), false);
    assert.equal(sideBySide(rows, 0x1cf, 0x242), false);
    assert.equal(sideBySide(rows, 0x1df, 0x232), false);
});

test('a lake\'s south shore has its cliff rows in order', () => {
    const rows = paintSquare('~');
    assert.deepEqual([...below(rows, 0x10e, 5)], ['11e 12e 98 be a8']);
    assert.deepEqual([...below(rows, 0x10f, 5)], ['11f 12f 99 bf a8']);
});

test('a mountain\'s west and east faces keep their columns in step', () => {
    const rows = paintSquare('M');
    assert.ok(stacked(rows, [0xac0, 0x8f, 0xd2, 0xd3, 0xd4, 0xd5], [0xac0, 0x8f, 0xe2, 0xe3, 0xe4, 0xd5]) > 0, 'west face');
    assert.ok(stacked(rows, [0x110, 0x111, 0x112, 0x113, 0x8f, 0x82], [0x110, 0x121, 0x122, 0x123, 0x8f, 0x82]) > 0, 'east face');
    assert.equal(sideBySide(rows, 0xd2, 0xe3), false);
    assert.equal(sideBySide(rows, 0xe2, 0xd3), false);
    assert.equal(sideBySide(rows, 0x111, 0x122), false);
    assert.equal(sideBySide(rows, 0x121, 0x112), false);
});
