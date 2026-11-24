// GSuite MCP: tools for looking things up while writing GraalScript: the function
// definitions at api.gscript.dev and the scripting guides shipped in gscript/.
// The lookups themselves live in js/scriptreference.js, shared with the
// GScript Reference dialog.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;

    const reference = () => window.GScriptReference || fail('The GScript reference has not loaded.');

    async function documentList() {
        return (await reference().index().catch(error => fail(`The bundled GraalScript guides could not be read: ${error.message || error}`))).documents;
    }

    async function checkDocument(id) {
        const documents = await documentList();
        return documents.find(doc => doc.id === id) || fail(`No guide "${id}". Guides: ${documents.map(doc => doc.id).join(', ')}.`);
    }

    mcp.tool({
        name: 'script_reference',
        title: 'Look up GraalScript functions',
        description: 'Look up GraalScript functions, variables and events in the api.gscript.dev definitions (needs an internet connection): parameters in order, return type, whether it runs clientside or serverside, a description and usually an example. Matches names first, then descriptions. Use it to confirm a function\'s name and argument order before using it in a script; for explanations and longer examples search the guides with script_docs_search.',
        input: {
            query: S.string('Function name or keywords, e.g. "showimg", "setshape", "player chat"'),
            scope: S.enum(['clientside', 'serverside', 'global'], 'Only functions that run there'),
            limit: S.integer('Most entries to return', { default: 10, minimum: 1, maximum: 50 }),
        },
        required: ['query'],
        readOnly: true,
        openWorld: true,
    }, async ({ query, scope, limit }) => {
        const found = await reference().searchApi(query, { scope, limit }).catch(() => fail('api.gscript.dev could not be reached. The bundled guides work offline: use script_docs_search.'));
        return { source: 'api.gscript.dev', matches: found.total, functions: found.functions };
    });

    mcp.tool({
        name: 'script_docs_list',
        title: 'List the GraalScript guides',
        description: 'The GraalScript guides that ship with GSuite: a comprehensive GS1 and GS2 reference, short guides to the basics (variables, functions, logic, strings, timeouts, client and server), references for events, GUI controls, particles and more, the raw lists of script functions (kind "list"), and an export of the community wiki (kind "wiki"). `verified` marks the one document checked line by line by people (the GraalScript Reference); treat the others as helpful but unconfirmed, the lists and the wiki least of all. Also lists the folders of real scripts the user has set for script_examples_search. Give `doc` to get that guide\'s table of contents.',
        input: { doc: S.string('Guide id, to list its sections') },
        readOnly: true,
    }, async ({ doc }) => {
        if (doc) {
            const meta = await checkDocument(doc);
            return { doc: meta.id, title: meta.title, verified: !!meta.verified, sections: await reference().outline(meta.id) };
        }
        return {
            guides: (await documentList()).map(meta => ({ doc: meta.id, title: meta.title, about: meta.summary, kind: meta.kind, verified: !!meta.verified, size_kb: Math.round(meta.bytes / 1024) })),
            example_folders: reference().folders(),
        };
    });

    mcp.tool({
        name: 'script_docs_search',
        title: 'Search the GraalScript guides',
        description: 'Full-text search of the GraalScript guides that ship with GSuite (works offline). Returns the sections that contain every word of the query, with a snippet, the guide and the line; matches in the human-verified GraalScript Reference come first and are marked `verified`. Read a hit in full with script_docs_read. Search before writing a script: how an event is named, how strings are joined, how variables are prefixed and what runs on the client or the server are all covered, with examples.',
        input: {
            query: S.string('Words to look for, e.g. "onPlayerTouchsMe", "string concatenation", "setTimer timeout"'),
            doc: S.string('Only search this guide (an id from script_docs_list)'),
            verified_only: S.boolean('Only search the human-verified reference', { default: false }),
            limit: S.integer('Most sections to return', { default: 10, minimum: 1, maximum: 40 }),
        },
        required: ['query'],
        readOnly: true,
    }, async ({ query, doc, verified_only, limit }) => {
        if (doc) await checkDocument(doc);
        const hits = await reference().searchDocs(query, { doc, verifiedOnly: verified_only, limit }).catch(error => fail(`The guides could not be searched: ${error.message || error}`));
        if (!hits.length) return { matches: 0, note: 'No section contains every word. Try fewer or different words, or script_reference for a function name.' };
        return { matches: hits.length, sections: hits.map(hit => ({ doc: hit.doc, guide: hit.document, verified: hit.verified, kind: hit.kind, section: hit.section, line: hit.line, lines: hit.lines, snippet: hit.snippet })) };
    });

    mcp.tool({
        name: 'script_examples_search',
        title: 'Search real scripts for examples',
        description: 'Search script files on this computer for lines that hold every word of the query, to see how a function or an event is used in real code: in the reference folders the user has set in the GScript Reference dialog under "My folders" (typically a checkout of the GS2Taco repository, whose refs/ folder holds scripts from real servers), or in a folder you name. Nothing found this way is verified: use it for how things are put together, and confirm names and argument order with script_docs_search and script_reference. Read a hit in full with fs_read_file.',
        input: {
            query: S.string('Words that must all be on the line, e.g. "setshape2", "triggeraction serverside"'),
            folder: S.string('Absolute path of a folder to search instead of the saved reference folders'),
            limit: S.integer('Most lines to return', { default: 20, minimum: 1, maximum: 100 }),
        },
        required: ['query'],
        readOnly: true,
        openWorld: true,
    }, async ({ query, folder, limit }) => {
        if (folder) mcp.helpers.requireAbsolute(folder, 'folder');
        const where = folder ? [folder] : reference().folders();
        if (!where.length) fail('No reference folders are set. Pass folder, or the user adds some in the GScript Reference dialog (the book button) under "My folders". The bundled guides are searched with script_docs_search.');
        const matches = await reference().searchFolders(query, { folders: where, limit }).catch(error => fail(`The folders could not be searched: ${error.message || error}`));
        if (matches.failed.length && matches.failed.length === where.length) fail(`${where.length === 1 ? 'The folder' : 'None of the folders'} could be searched: ${matches.failed.map(item => `${item.folder} (${item.error})`).join('; ')}.`);
        return {
            searched: where, matches: matches.length, lines: matches.map(match => ({ path: match.path, line: match.line, text: match.text.trim().slice(0, 300) })),
            not_searched: matches.failed.length ? matches.failed : undefined,
            note: matches.length ? 'Unverified examples. Read around a hit with fs_read_file.' : 'No line holds every word. Try fewer words.',
        };
    });

    mcp.tool({
        name: 'script_docs_read',
        title: 'Read part of a GraalScript guide',
        description: 'Read a section of one of the GraalScript guides: by section heading (as returned by script_docs_search or script_docs_list), which includes its subsections, or from a line number. Long sections are returned in pieces; the result says where to continue.',
        input: {
            doc: S.string('Guide id, e.g. "graalscript-reference"'),
            section: S.string('Heading of the section to read (its full path or just its title)'),
            line: S.integer('Line to start reading from, instead of a section', { minimum: 1 }),
            max_lines: S.integer('Most lines to return', { default: 150, minimum: 10, maximum: 600 }),
        },
        required: ['doc'],
        readOnly: true,
    }, async ({ doc, section, line, max_lines }) => {
        await checkDocument(doc);
        return reference().readDocument(doc, { section, line, maxLines: max_lines }).catch(error => fail(`${error.message || error}. script_docs_list with doc: "${doc}" shows its sections.`));
    });
})();
