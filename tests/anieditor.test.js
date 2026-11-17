// Tests for the GANI editor (js/anieditor.js): run with `node --test tests`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const ganiDir = path.join(root, 'ganis');

function fakeElement() {
    return new Proxy(function () {}, {
        get(target, property) {
            if (property === 'width' || property === 'height') return 800;
            if (property === 'style') return {};
            if (property === 'classList') return {add() {}, remove() {}, toggle() {}, contains() { return false; }};
            if (property === 'dataset') return {};
            if (property === Symbol.toPrimitive) return () => '';
            return fakeElement();
        },
        set() { return true; },
        apply() { return fakeElement(); },
        construct() { return fakeElement(); }
    });
}

function loadEditor() {
    const code = fs.readFileSync(path.join(root, 'js', 'anieditor.js'), 'utf8');
    const sandbox = {
        console,
        window: null,
        document: fakeElement(),
        localStorage: {getItem() { return null; }, setItem() {}, removeItem() {}},
        performance: {now() { return 0; }},
        requestAnimationFrame() { return 0; },
        cancelAnimationFrame() {},
        setTimeout() { return 0; },
        clearTimeout() {},
        setInterval() { return 0; },
        clearInterval() {},
        addEventListener() {},
        removeEventListener() {},
        Image: function () { return fakeElement(); },
        Audio: function () { return fakeElement(); },
        URL: {createObjectURL() { return ''; }, revokeObjectURL() {}},
        navigator: {userAgent: ''},
        location: {href: ''}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

const emu = loadEditor();
const readGani = name => fs.readFileSync(path.join(ganiDir, name), 'utf8');
const ganiFiles = () => fs.readdirSync(ganiDir).filter(name => name.endsWith('.gani'));

test('every bundled gani parses and round-trips its structure', () => {
    for (const name of ganiFiles()) {
        const text = readGani(name);
        const first = emu.parseGani(text);
        const second = emu.parseGani(emu.saveGani(first));
        const pieces = gani => gani.frames.reduce((sum, frame) => sum + frame.pieces.reduce((count, dir) => count + dir.length, 0), 0);
        assert.equal(second.sprites.size, first.sprites.size, name + ': sprites');
        assert.equal(second.frames.length, first.frames.length, name + ': frames');
        assert.equal(pieces(second), pieces(first), name + ': pieces');
        assert.equal(second.singleDir, first.singleDir, name + ': single direction');
        assert.equal(second.looped, first.looped, name + ': loop');
        assert.equal(second.continous, first.continous, name + ': continuous');
        assert.equal(second.isMovieMode, first.isMovieMode, name + ': movie mode');
        assert.equal(second.frameCount, first.frameCount, name + ': frame count');
    }
});

test('SINGLEDIRECTION survives a save', () => {
    for (const name of ganiFiles()) {
        const text = readGani(name);
        if (!/^SINGLEDIRECTION\s*$/m.test(text)) continue;
        assert.match(emu.saveGani(emu.parseGani(text)), /^SINGLEDIRECTION$/m, name);
    }
});

test('six-field SPRITE lines are accepted', () => {
    const ani = emu.parseGani('GANI0001\nSPRITE 1 BODY 0 0 16 16\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nANIEND\n');
    assert.equal(ani.sprites.size, 1);
    assert.equal(ani.sprites.get(1).comment, '');
});

test('PLAYSOUND without coordinates uses the client defaults', () => {
    const ani = emu.parseGani('GANI0001\nSPRITE 1 BODY 0 0 16 16\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nPLAYSOUND a.wav\nANIEND\n');
    const sound = ani.frames[0].sounds[0];
    assert.equal(sound.fileName, 'a.wav');
    assert.equal(sound.xoffset, 1.5 * 16);
    assert.equal(sound.yoffset, 2 * 16);
});

test('a frame sound keeps its WAIT tick through a save', () => {
    const text = 'GANI0001\nSPRITE 1 BODY 0 0 16 16\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nWAIT 1\nPLAYSOUND a.wav\nANIEND\n';
    const ani = emu.parseGani(text);
    assert.equal(ani.frames[0].duration, 100);
    assert.equal(ani.frames[0].sounds[0].tag, 2);
    const output = emu.saveGani(ani);
    const waitIndex = output.indexOf('WAIT 1');
    const soundIndex = output.indexOf('PLAYSOUND a.wav');
    assert.ok(waitIndex >= 0 && waitIndex < soundIndex, output);
    assert.equal(emu.parseGani(output).frames[0].sounds[0].tag, 2);
});

test('ZOOMEFFECT, STRETCHXEFFECT and STRETCHYEFFECT stay independent', () => {
    const text = 'GANI0001\nSPRITE 1 BODY 0 0 16 16\nZOOMEFFECT 1 2\nSTRETCHXEFFECT 1 1.5\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nANIEND\n';
    const ani = emu.parseGani(text);
    const sprite = ani.sprites.get(1);
    assert.equal(sprite._zoom, 2);
    assert.equal(sprite.xscale, 1.5);
    const output = emu.saveGani(ani);
    assert.match(output, /^ZOOMEFFECT\s+1 2$/m);
    assert.match(output, /^STRETCHXEFFECT\s+1 1\.5$/m);
});

test('manual flags survive a save', () => {
    const text = 'GANI0001\nSPRITE 1 BODY 0 0 16 16\nLAYER 4\nANTIALIAS\nROTATEPROJECTILE\nFRAMES 42\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nANIEND\n';
    const output = emu.saveGani(emu.parseGani(text));
    assert.match(output, /^LAYER 4$/m);
    assert.match(output, /^ANTIALIAS$/m);
    assert.match(output, /^ROTATEPROJECTILE$/m);
    assert.match(output, /^FRAMES 42$/m);
});

test('space-separated triples are read as separate pieces', () => {
    const ani = emu.parseGani('GANI0001\nSPRITE 1 BODY 0 0 16 16\nSPRITE 2 HEAD 0 0 16 16\nANI\n 1 0 0 2 16 0\n 1 0 0\n 1 0 0\n 1 0 0\nANIEND\n');
    assert.equal(ani.frames[0].pieces[0].length, 2);
    assert.equal(ani.frames[0].pieces[0][1].spriteIndex, 2);
});

test('named pieces resolve to a sprite index on load and save', () => {
    const ani = emu.parseGani('GANI0001\nSPRITE 5 foo.png 0 0 16 16\nANI\n foo.png 0 0\n 5 0 0\n 5 0 0\n 5 0 0\nANIEND\n');
    assert.equal(ani.frames[0].pieces[0][0].spriteIndex, 5);
    const output = emu.saveGani(ani);
    assert.match(output, /^ 5 0 0$/m);
});

test('ATTR and PARAM image types are internal types', () => {
    const ani = emu.parseGani('GANI0001\nSPRITE 1 ATTR20 0 0 16 16\nSPRITE 2 PARAM12 0 0 16 16\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nANIEND\n');
    assert.equal(ani.sprites.get(1).type, 'ATTR20');
    assert.equal(ani.sprites.get(2).type, 'PARAM12');
});

test('movie text and font are saved raw', () => {
    const ani = emu.parseGani(readGani('tutorial_touch.gani'));
    const output = emu.saveGani(ani);
    assert.match(output, /text=Touch to get information/);
    assert.match(output, /font=Tempus Sans ITC/);
    assert.doesNotMatch(output, /\+/);
});

test('movie state follows the client evaluation rules', () => {
    const ani = emu.parseGani(readGani('tutorial_touch.gani'));
    const sprite = ani.movieItems[0];
    const text = ani.movieItems[1];
    assert.equal(sprite.getInterpolatedFrame(-1).visible, false);
    const atTen = sprite.getInterpolatedFrame(10);
    assert.equal(atTen.visible, true);
    assert.equal(atTen.layer, 2);
    assert.equal(atTen.dx, 16);
    assert.equal(atTen.dy, -27);
    const textState = text.getInterpolatedFrame(10);
    assert.equal(textState.text, 'Touch to get information');
    assert.equal(textState.font, 'Tempus Sans ITC');
    assert.equal(textState.color, 'FFE080');
    assert.equal(textState.textZoom, 1);
    assert.equal(textState.centered, true);
});

test('a key uses the first line for a repeated name', () => {
    const state = emu.parseMovieFrameState('dx=1,dx=2,text=a b,visible=1');
    assert.equal(state.dx, 1);
    assert.equal(state.text, 'a b');
    assert.equal(state.visible, true);
});

test('movie values with commas survive a save', () => {
    const ani = emu.parseGani('GANI0002\nFRAMES 10\nMOVIE\n  ACTOR TEXT t\n    FRAME 0 visible=true,text="Hello, world",color=FFFFFF\n  ACTOREND\nMOVIEEND\n');
    const output = emu.saveGani(ani);
    assert.match(output, /text="Hello, world"/);
    const again = emu.parseGani(output);
    assert.equal(again.movieItems[0].getInterpolatedFrame(0).text, 'Hello, world');
});

test('movie sub-ganis advance on their own WAIT clock', () => {
    const sub = emu.parseGani('GANI0001\nSPRITE 1 BODY 0 0 16 16\nANI\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nWAIT 1\n 1 0 0\n 1 0 0\n 1 0 0\n 1 0 0\nANIEND\n');
    const movie = emu.parseGani('GANI0002\nFRAMES 20\nMOVIE\n  ACTOR CHAR a\n    FRAME 0 visible=true,ani=walk,dx=0,dy=0\n  ACTOREND\nMOVIEEND\n');
    const item = movie.movieItems[0];
    const state = item.getInterpolatedFrame(0);
    assert.equal(emu.getMovieSubFrame(item, sub, state, 0), 0);
    assert.equal(emu.getMovieSubFrame(item, sub, state, 1), 0);
    assert.equal(emu.getMovieSubFrame(item, sub, state, 2), 1);
});

test('movie sound tracks are shown only on their first key frame', () => {
    const ani = emu.parseGani('GANI0002\nFRAMES 10\nMOVIE\n  ACTOR SOUND s\n    FRAME 3 file=a.wav\n  ACTOREND\nMOVIEEND\n');
    const state = ani.movieItems[0].getInterpolatedFrame(3);
    assert.equal(state.soundShown, true);
    assert.equal(state.soundFile, 'a.wav');
    assert.equal(ani.movieItems[0].getInterpolatedFrame(4).soundShown, false);
});

test('text style keys set by the editor are saved', () => {
    const ani = emu.parseGani('GANI0002\nFRAMES 10\nMOVIE\n  ACTOR TEXT t\n    FRAME 0 visible=true,text=t\n  ACTOREND\nMOVIEEND\n');
    ani.movieItems[0].setFrame(0, {font: 'Arial', color: 'FF0000', zoom: 2, bold: true, italic: false, centered: true, wordwrap: false, shaded: false});
    const output = emu.saveGani(ani);
    assert.match(output, /font=Arial/);
    assert.match(output, /color=FF0000/);
    assert.match(output, /zoom=2/);
    assert.match(output, /bold=true/);
    assert.match(output, /italic=false/);
    assert.match(output, /centered=true/);
    assert.match(output, /wordwrap=false/);
    assert.match(output, /shaded=false/);
});

test('layer keys are mapped like the client', () => {
    const ani = emu.parseGani('GANI0002\nFRAMES 10\nMOVIE\n  ACTOR CHAR a\n    FRAME 0 visible=true,layer=0\n    FRAME 2 layer=3\n    FRAME 5 layer=9\n  ACTOREND\nMOVIEEND\n');
    const item = ani.movieItems[0];
    assert.equal(item.getInterpolatedFrame(0).layer, -1);
    assert.equal(item.getInterpolatedFrame(2).layer, 2);
    assert.equal(item.getInterpolatedFrame(5).layer, 2);
});
