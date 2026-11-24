// Tests for the GScript reference (js/scriptreference.js) over the guides shipped in gscript/: run with `node --test tests` (npm test).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reference = require('../js/scriptreference.js');

const root = path.join(__dirname, '..');
const API_FIXTURE = JSON.stringify({
    showimg: { name: 'showimg', type: 'function', params: ['index', 'image', 'x', 'y'], returns: 'void', scope: 'clientside', description: 'Creates an image at the given position.', example: 'showimg(200, "fire.gif", player.x, player.y);' },
    showimg2: { name: 'showimg2', type: 'function', params: ['index', 'image', 'x', 'y', 'z'], returns: 'void', scope: 'clientside', description: 'Like showimg with a height.' },
    findimg: { name: 'findimg', type: 'function', params: ['int'], returns: 'object', scope: 'clientside', description: 'Retrieves the image shown with showimg at an index.' },
    savelog: { name: 'savelog', type: 'function', params: ['file', 'text'], returns: 'void', scope: 'serverside', description: 'Appends a line to a log file.' },
});

// Guides are read from the repository; the function definitions from a fixture instead of the network.
reference.setFetcher(async url => url === reference.API_URL ? API_FIXTURE : fs.readFileSync(path.join(root, url), 'utf8'));

test('markdown is split into sections named by their headings', () => {
    const parsed = reference.parseSections(['intro', '# Guide', 'top', '## Timers', 'setTimer(1);', '```', '# not a heading', '```', '### Details', 'more', '## Strings', 'a @ b'].join('\n'));
    assert.deepEqual(parsed.sections.map(section => section.path), ['', 'Guide', 'Guide > Timers', 'Guide > Timers > Details', 'Guide > Strings']);
    const timers = parsed.sections[2];
    assert.equal(timers.start, 3);
    assert.match(timers.body, /# not a heading/, 'a # inside a code fence stays in its section');
});

test('section search needs every word and prefers headings', () => {
    const parsed = reference.parseSections('# A\n## Timers\nsetTimer starts a timeout\n## Strings\nstrings mention timeout once\n## Other\nnothing here');
    const hits = reference.searchSections(parsed, 'timeout');
    assert.deepEqual(hits.map(hit => hit.section.title), ['Timers', 'Strings']);
    assert.deepEqual(reference.searchSections(parsed, 'timeout strings').map(hit => hit.section.title), ['Strings']);
    assert.deepEqual(reference.searchSections(parsed, ''), []);
    assert.match(hits[0].snippet, /setTimer/);
});

test('the shipped index lists the guides and marks only the reference as verified', async () => {
    const index = await reference.index();
    assert.ok(index.documents.length >= 10);
    assert.deepEqual(index.documents.filter(doc => doc.verified).map(doc => doc.file), ['docs/GraalScript_Reference.md']);
    for (const doc of index.documents) assert.ok(fs.existsSync(path.join(root, 'gscript', doc.file)), `${doc.file} is listed but missing`);
});

test('the guides can be searched, with the verified reference first', async () => {
    const hits = await reference.searchDocs('showcharacter', { limit: 10 });
    assert.ok(hits.length > 0);
    assert.equal(hits[0].verified, true);
    assert.equal(hits[0].doc, 'graalscript-reference');
    const onlyVerified = await reference.searchDocs('timeout', { verifiedOnly: true, limit: 50 });
    assert.ok(onlyVerified.length > 0 && onlyVerified.every(hit => hit.verified));
    assert.deepEqual(await reference.searchDocs('zzzznotaword'), []);
});

test('lists without headings are searched in blocks, after the guides', async () => {
    const lines = Array.from({ length: 130 }, (_, index) => index === 97 ? 'TServerPlayer.addweapon(str)' : `filler ${index}`);
    const parsed = reference.parseSections(lines.join('\n'));
    assert.deepEqual(parsed.sections.map(section => section.path), ['lines 1-40', 'lines 41-80', 'lines 81-120', 'lines 121-130']);
    const hits = reference.searchSections(parsed, 'addweapon');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].section.start, 80);
    assert.match(hits[0].snippet, /TServerPlayer\.addweapon/);
    // A hit in such a text is read by the lines that name it, and its first line counts like any other.
    assert.match(reference.searchSections(reference.parseSections(['needle here', ...lines].join('\n')), 'needle')[0].snippet, /needle here/);
    const list = (await reference.index()).documents.find(doc => doc.kind === 'list');
    const hit = (await reference.searchDocs('player', { doc: list.id, limit: 1 }))[0];
    assert.match(hit.section, /^lines \d+-\d+$/);
    const read = await reference.readDocument(list.id, { section: hit.section, maxLines: 40 });
    assert.equal(read.from_line, hit.line);
    // The wiki's numbered lists must not turn into headings of their own.
    assert.equal(fs.readFileSync(path.join(root, 'gscript', 'docs', 'graal_wiki.md'), 'utf8').split('\n').filter(line => /^# /.test(line)).length, 1);

    const index = await reference.index();
    assert.deepEqual([...new Set(index.documents.map(doc => doc.kind))].sort(), ['basics', 'core', 'guide', 'list', 'verified', 'wiki']);
    assert.equal(fs.readFileSync(path.join(root, 'gscript', 'docs', 'graal_wiki.md'), 'utf8').includes('<contributor>'), false, 'the wiki export is shipped as text, without its XML metadata');
    // A word that the lists and the wiki are full of still shows the verified reference and the guides first.
    const hits2 = await reference.searchDocs('setshape', { limit: 40 });
    const order = hits2.map(hit => hit.verified ? 0 : hit.kind === 'list' || hit.kind === 'wiki' ? 2 : 1);
    assert.deepEqual(order, order.slice().sort((a, b) => a - b));
    assert.ok(order.includes(0));
});

test('the user\'s own folders are searched line by line', async () => {
    const calls = [];
    globalThis.localStorage = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = value; } };
    globalThis.__GSUITE__ = { core: { invoke: async (method, args) => { calls.push([method, ...args]); return [{ path: '/refs/a.gs2', line: 3, text: 'setshape2(2, 2, {22, 22, 22, 22});' }]; } } };
    try {
        assert.deepEqual(reference.folders(), []);
        assert.deepEqual(reference.setFolders([' /refs ', '', '/refs']), ['/refs']);
        const found = await reference.searchFolders('setshape2 22');
        assert.deepEqual(found.map(match => match.path), ['/refs/a.gs2']);
        assert.equal(calls[0][0], 'SearchWords');
        assert.equal(calls[0][1], '/refs');
        assert.deepEqual(calls[0][2], ['setshape2', '22'], 'the backend is asked for lines that hold every word');
        // A folder that cannot be read is reported, and the others are still searched.
        reference.setFolders(['/gone', '/refs']);
        globalThis.__GSUITE__.core.invoke = async (method, args) => { if (args[0] === '/gone') throw new Error('/gone is not a folder'); return [{ path: '/refs/a.gs2', line: 3, text: 'setshape2(2, 2, {22, 22, 22, 22});' }]; };
        const partial = await reference.searchFolders('setshape2');
        assert.deepEqual(partial.map(match => match.path), ['/refs/a.gs2']);
        assert.deepEqual(partial.failed, [{ folder: '/gone', error: '/gone is not a folder' }]);
    } finally {
        delete globalThis.__GSUITE__;
        delete globalThis.localStorage;
    }
});

test('a section can be read by heading or by line', async () => {
    const outline = await reference.outline('graalscript-reference');
    assert.ok(outline.length > 50);
    const section = await reference.readDocument('graalscript-reference', { section: outline[3].section.split(' > ').pop(), maxLines: 30 });
    assert.equal(section.verified, true);
    assert.ok(section.text.startsWith('#'));
    assert.ok(section.to_line - section.from_line < 30);
    const byLine = await reference.readDocument('graalscript-reference', { line: 100, maxLines: 5 });
    assert.equal(byLine.from_line, 100);
    assert.equal(byLine.text.split('\n').length, 5);
    await assert.rejects(reference.readDocument('graalscript-reference', { section: 'no such heading anywhere' }), /no section matching/);
    await assert.rejects(reference.readDocument('nope'), /No GraalScript document/);
});

test('functions are looked up by name, then by description', async () => {
    const exact = await reference.searchApi('showimg');
    assert.deepEqual(exact.functions.map(entry => entry.name), ['showimg', 'showimg2', 'findimg']);
    assert.deepEqual(exact.functions[0].params, ['index', 'image', 'x', 'y']);
    assert.deepEqual((await reference.searchApi('log file')).functions.map(entry => entry.name), ['savelog']);
    assert.deepEqual((await reference.searchApi('img', { scope: 'serverside' })).functions, []);
    assert.equal((await reference.searchApi('img', { limit: 1 })).total, 3);
});
