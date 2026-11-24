// GSuite MCP: tools for looking things up while writing GraalScript: function definitions
// at api.gscript.dev and scripts in folders the user has set. The lookups live in
// js/scriptreference.js, shared with the GScript Reference dialog.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    const { S, fail } = mcp;

    const reference = () => window.GScriptReference || fail('The GScript reference has not loaded.');

    mcp.tool({
        name: 'script_reference',
        title: 'Look up GraalScript functions',
        description: 'Look up GraalScript functions, variables and events in the api.gscript.dev definitions (needs an internet connection): parameters in order, return type, whether it runs clientside or serverside, a description and usually an example. Matches names first, then descriptions. Use it to confirm a function\'s name and argument order before using it in a script.',
        input: {
            query: S.string('Function name or keywords, e.g. "showimg", "setshape", "player chat"'),
            scope: S.enum(['clientside', 'serverside', 'global'], 'Only functions that run there'),
            limit: S.integer('Most entries to return', { default: 10, minimum: 1, maximum: 50 }),
        },
        required: ['query'],
        readOnly: true,
        openWorld: true,
    }, async ({ query, scope, limit }) => {
        const found = await reference().searchApi(query, { scope, limit }).catch(() => fail('api.gscript.dev could not be reached.'));
        return { source: 'api.gscript.dev', matches: found.total, functions: found.functions };
    });

    mcp.tool({
        name: 'script_examples_search',
        title: 'Search real scripts for examples',
        description: 'Search script files on this computer for lines that hold every word of the query, to see how a function or an event is used in real code: in the reference folders the user has set in the GScript Reference dialog under "My folders" (typically a checkout of a script repository whose refs/ folder holds scripts from real servers), or in a folder you name. Nothing found this way is verified: use it for how things are put together, and confirm names and argument order with script_reference. Read a hit in full with fs_read_file.',
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
        if (!where.length) fail('No reference folders are set. Pass folder, or add some in the GScript Reference dialog under "My folders".');
        const matches = await reference().searchFolders(query, { folders: where, limit }).catch(error => fail(`The folders could not be searched: ${error.message || error}`));
        if (matches.failed.length && matches.failed.length === where.length) fail(`${where.length === 1 ? 'The folder' : 'None of the folders'} could be searched: ${matches.failed.map(item => `${item.folder} (${item.error})`).join('; ')}.`);
        return {
            searched: where, matches: matches.length, lines: matches.map(match => ({ path: match.path, line: match.line, text: match.text.trim().slice(0, 300) })),
            not_searched: matches.failed.length ? matches.failed : undefined,
            note: matches.length ? 'Unverified examples. Read around a hit with fs_read_file.' : 'No line holds every word. Try fewer words.',
        };
    });
})();
