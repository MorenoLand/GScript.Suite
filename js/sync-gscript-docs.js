// Copies the GraalScript documentation that GSuite ships (the "GScript Reference"
// dialog and the MCP script_docs tools read it) from a checkout of
// https://github.com/MorenoLand/GScript.GS2Taco into gscript/, and writes
// gscript/index.json describing each document.
//
//   node js/sync-gscript-docs.js /path/to/GScript.GS2Taco
//
// What is copied is what Remote Control ships as its own GS2 reference: CORE.md,
// basics/ and docs/. The checkout's refs/ (scripts dumped from game servers) and
// ghidra/ (decompiler output) are large and stay out; people can point the GScript
// Reference at their own checkout to search those.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, 'docs', 'GraalScript_Reference.md'))) {
    console.error('Usage: node js/sync-gscript-docs.js /path/to/GScript.GS2Taco');
    process.exit(1);
}
const target = path.join(__dirname, '..', 'gscript');

// The one document whose content has been checked by people line by line.
const VERIFIED = 'docs/GraalScript_Reference.md';
// The wiki export is shipped as text: its pages' titles and wikitext, without the XML
// around them (revision ids, timestamps, contributor names).
const WIKI_DUMP = 'docs/graal_wiki_dump.xml';
const WIKI_TEXT = 'docs/graal_wiki.md';

// What kind of document a file is; searches list the kinds in this order.
function kindOf(file) {
    if (file === VERIFIED) return 'verified';
    if (file === 'CORE.md') return 'core';
    if (file.startsWith('basics/')) return 'basics';
    if (file === WIKI_TEXT) return 'wiki';
    return file.endsWith('.txt') ? 'list' : 'guide';
}

const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&');

// Turns a MediaWiki XML export into one markdown text: a heading per page, the page's
// wikitext under it, and the wiki's own == headings == as sub-headings.
function wikiToMarkdown(xml) {
    const out = ['# Graal Bible (wiki export)', '', 'Pages of the community wiki, as wikitext. Not verified: where it disagrees with the GraalScript Reference, trust the reference.', ''];
    for (const page of xml.matchAll(/<page>([\s\S]*?)<\/page>/g)) {
        const title = /<title>([^<]*)<\/title>/.exec(page[1]);
        const body = /<text[^>]*>([\s\S]*?)<\/text>/.exec(page[1]);
        if (!title || !body) continue;
        const text = unescapeXml(body[1]).replace(/\r\n/g, '\n').trim();
        if (!text || /^#redirect/i.test(text)) continue;
        out.push('## ' + unescapeXml(title[1]).trim(), '');
        for (const line of text.split('\n')) {
            const heading = /^(={2,6})\s*(.+?)\s*\1\s*$/.exec(line);
            // In wikitext a line starting with # is a numbered list item, which markdown would read as a heading.
            const item = /^#+[*:#]*\s*(.*)$/.exec(line);
            out.push(heading ? '#'.repeat(Math.min(6, heading[1].length + 1)) + ' ' + heading[2] : item ? '1. ' + item[1] : line);
        }
        out.push('');
    }
    return out.join('\n');
}

// The checkout's README describes each document in tables of `[name](path) | what it covers`.
function describedInReadme() {
    const described = new Map();
    const readme = fs.readFileSync(path.join(source, 'README.md'), 'utf8');
    for (const match of readme.matchAll(/^\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|\s*(.+?)\s*\|\s*$/gm)) described.set(match[1], match[2].replace(/`/g, ''));
    return described;
}

function titleOf(text, fallback) {
    const heading = /^#\s+(.+)$/m.exec(text);
    return heading ? heading[1].trim() : fallback;
}

const described = describedInReadme();
const listed = folder => fs.readdirSync(path.join(source, folder)).sort().map(name => `${folder}/${name}`);
const files = [VERIFIED, 'CORE.md', ...listed('basics').filter(file => file.endsWith('.md')), ...listed('docs').filter(file => /\.(md|txt|xml)$/.test(file))]
    .filter((file, index, all) => all.indexOf(file) === index && fs.existsSync(path.join(source, file)));

fs.rmSync(target, { recursive: true, force: true });
const documents = [];
for (const original of files) {
    let text = fs.readFileSync(path.join(source, original), 'utf8').replace(/\r\n/g, '\n');
    let file = original;
    if (original === WIKI_DUMP) { text = wikiToMarkdown(text); file = WIKI_TEXT; }
    else if (original.endsWith('.xml')) continue;
    const out = path.join(target, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    const name = path.basename(file).replace(/\.[a-z]+$/, '');
    documents.push({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        file,
        title: file.endsWith('.md') ? titleOf(text, name) : name,
        summary: described.get(original) || (file === WIKI_TEXT ? 'Pages of the Graal Bible community wiki, as wikitext' : file.endsWith('.txt') ? 'A list of script functions and variables, one per line' : ''),
        kind: kindOf(file),
        verified: file === VERIFIED,
        bytes: Buffer.byteLength(text),
    });
}
const ids = documents.map(doc => doc.id);
if (new Set(ids).size !== ids.length) throw new Error('Two documents share an id: ' + ids.filter((id, index) => ids.indexOf(id) !== index).join(', '));

let commit = '';
try { commit = execFileSync('git', ['-C', source, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (error) { /* not a git checkout */ }
fs.writeFileSync(path.join(target, 'index.json'), JSON.stringify({ source: 'https://github.com/MorenoLand/GScript.GS2Taco', commit, documents }, null, 2) + '\n');
console.log(`Copied ${documents.length} documents (${Math.round(documents.reduce((total, doc) => total + doc.bytes, 0) / 1024)} KB) from ${commit || source} into gscript/`);
