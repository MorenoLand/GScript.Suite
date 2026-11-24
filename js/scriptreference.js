// GScript Reference: looks up GraalScript functions at api.gscript.dev and searches
// the GraalScript guides shipped in gscript/ (copied from the GS2Taco repository by
// js/sync-gscript-docs.js). The dialog (GScriptReference.open) is for people; the
// MCP script_reference and script_docs_* tools use the same functions.
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GScriptReference = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const API_URL = 'https://api.gscript.dev';
    const DOCS_BASE = 'gscript/';
    const BLOCK_LINES = 40;
    // The kinds of document (index.json), in the order their matches are listed: the
    // reference people verified, then the guides, then the raw lists and the wiki export.
    const KIND_RANK = { verified: 0, core: 1, basics: 1, guide: 1, list: 2, wiki: 2 };
    const FOLDERS_KEY = 'gscriptReferenceFolders';

    let fetchText = url => root.fetch(url).then(response => response.ok ? response.text() : Promise.reject(new Error(`${url}: HTTP ${response.status}`)));
    let indexPromise = null;
    let apiPromise = null;
    const documents = new Map();

    // Replaces how files and the API are fetched (tests read from disk).
    function setFetcher(fetcher) {
        fetchText = fetcher;
        indexPromise = null;
        apiPromise = null;
        documents.clear();
    }

    const words = query => String(query || '').toLowerCase().split(/\s+/).filter(Boolean);

    // Splits markdown into its sections. Each section is the text under one heading, up to the
    // next heading of any level; `path` names it with its parent headings.
    function parseSections(text) {
        const lines = text.split('\n');
        const sections = [];
        const parents = [];
        let fenced = false;
        let current = { level: 0, title: '', path: '', start: 0 };
        const close = end => {
            current.end = end;
            current.body = lines.slice(current.start, end).join('\n');
            current.search = current.body.toLowerCase();
            if (current.level || current.body.trim()) sections.push(current);
        };
        lines.forEach((line, index) => {
            if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
            const heading = fenced ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
            if (!heading) return;
            close(index);
            const level = heading[1].length;
            while (parents.length && parents[parents.length - 1].level >= level) parents.pop();
            const title = heading[2];
            current = { level, title, path: [...parents.map(parent => parent.title), title].join(' > '), start: index };
            parents.push({ level, title });
        });
        close(lines.length);
        // A long text without headings (a list of functions, one per line) is cut into blocks,
        // so that a search points at the right place in it instead of at the whole file.
        if (sections.length === 1 && !sections[0].level && lines.length > 2 * BLOCK_LINES) {
            sections.length = 0;
            for (let start = 0; start < lines.length; start += BLOCK_LINES) {
                current = { level: 0, title: '', path: `lines ${start + 1}-${Math.min(lines.length, start + BLOCK_LINES)}`, start };
                close(Math.min(lines.length, start + BLOCK_LINES));
            }
        }
        return { lines, sections };
    }

    function snippetFor(section, terms) {
        const body = section.body.split('\n');
        // The first line of a section is its heading, shown elsewhere; a block of a list has no heading.
        let at = body.findIndex((line, index) => (index > 0 || !section.level) && terms.some(term => line.toLowerCase().includes(term)));
        if (at < 0) at = Math.min(1, body.length - 1);
        return body.slice(at, at + 3).join('\n').trim().slice(0, 320);
    }

    // Ranks the sections of one parsed document against a query. Every word has to appear.
    function searchSections(parsed, query) {
        const terms = words(query);
        if (!terms.length) return [];
        const results = [];
        for (const section of parsed.sections) {
            const title = section.title.toLowerCase();
            let score = 0;
            for (const term of terms) {
                const inTitle = title.includes(term);
                let count = 0;
                for (let from = section.search.indexOf(term); from >= 0 && count < 6; from = section.search.indexOf(term, from + term.length)) count++;
                if (!inTitle && !count) { score = 0; break; }
                score += (inTitle ? 8 : 0) + count;
            }
            if (score) results.push({ section, score, snippet: snippetFor(section, terms) });
        }
        return results.sort((a, b) => b.score - a.score);
    }

    function index() {
        if (!indexPromise) indexPromise = fetchText(DOCS_BASE + 'index.json').then(text => JSON.parse(text)).catch(error => { indexPromise = null; throw error; });
        return indexPromise;
    }

    async function loadDocument(id) {
        const meta = (await index()).documents.find(doc => doc.id === id);
        if (!meta) throw new Error(`No GraalScript document "${id}"`);
        if (!documents.has(id)) documents.set(id, fetchText(DOCS_BASE + meta.file).then(text => ({ meta, ...parseSections(text) })).catch(error => { documents.delete(id); throw error; }));
        return documents.get(id);
    }

    // Searches the shipped guides; matches in the human-verified reference come first.
    // options: { doc, verifiedOnly, limit }.
    async function searchDocs(query, options = {}) {
        const all = (await index()).documents.filter(doc => (!options.doc || doc.id === options.doc) && (!options.verifiedOnly || doc.verified));
        const found = [];
        for (const meta of all) {
            const parsed = await loadDocument(meta.id);
            for (const hit of searchSections(parsed, query)) {
                found.push({ doc: meta.id, document: meta.title, verified: !!meta.verified, kind: meta.kind || 'guide', section: hit.section.path || meta.title, line: hit.section.start + 1, lines: hit.section.end - hit.section.start, snippet: hit.snippet, score: hit.score });
            }
        }
        const rank = hit => hit.verified ? 0 : KIND_RANK[hit.kind] ?? 1;
        return found.sort((a, b) => (rank(a) - rank(b)) || (b.score - a.score)).slice(0, options.limit || 20);
    }

    // Folders on this computer that are searched as well, for examples: a checkout of
    // GS2Taco with its refs/ of real scripts, or a server's own scripts. Desktop app only.
    function folders() {
        try {
            const saved = JSON.parse(root.localStorage?.getItem(FOLDERS_KEY) || '[]');
            return Array.isArray(saved) ? saved.filter(folder => typeof folder === 'string' && folder.trim()) : [];
        } catch (error) { return []; }
    }

    function setFolders(list) {
        const cleaned = [...new Set((list || []).map(folder => String(folder).trim()).filter(Boolean))];
        root.localStorage?.setItem(FOLDERS_KEY, JSON.stringify(cleaned));
        return cleaned;
    }

    // Searches files under the given folders (default: the saved ones) for lines that hold
    // every word of the query. options: { folders, extensions, limit }.
    async function searchFolders(query, options = {}) {
        const terms = words(query);
        const where = options.folders && options.folders.length ? options.folders : folders();
        if (!terms.length || !where.length) return [];
        const bridge = root.__GSUITE__;
        if (!bridge) throw new Error('Folders can only be searched in the desktop app');
        const limit = options.limit || 20;
        const found = [];
        // A folder that has been moved or unplugged must not hide what the others hold.
        found.failed = [];
        for (const folder of where) {
            let matches;
            try {
                matches = await bridge.core.invoke('SearchWords', [folder, terms, options.extensions || [], limit - found.length]);
            } catch (error) {
                found.failed.push({ folder, error: String(error.message || error) });
                continue;
            }
            for (const match of matches || []) found.push({ folder, path: match.path, line: match.line, text: match.text });
            if (found.length >= limit) break;
        }
        return found;
    }

    // Reads part of a guide: the section whose heading matches `section` (with its subsections),
    // or `maxLines` lines from `line`.
    async function readDocument(id, options = {}) {
        const parsed = await loadDocument(id);
        const maxLines = options.maxLines || 200;
        let start = Math.max(0, (options.line || 1) - 1), end = parsed.lines.length, heading = '';
        const block = /^lines (\d+)-\d+$/.exec(String(options.section || ''));
        if (block) {
            // A part of a text without headings is named by its lines.
            start = Math.max(0, Number(block[1]) - 1);
        } else if (options.section) {
            const wanted = String(options.section).toLowerCase();
            const sections = parsed.sections.filter(section => section.level);
            const match = sections.find(section => section.path.toLowerCase() === wanted || section.title.toLowerCase() === wanted)
                || sections.find(section => section.title.toLowerCase().includes(wanted) || section.path.toLowerCase().includes(wanted));
            if (!match) throw new Error(`"${parsed.meta.title}" has no section matching "${options.section}"`);
            const next = sections.find(section => section.start > match.start && section.level <= match.level);
            start = match.start;
            end = next ? next.start : parsed.lines.length;
            heading = match.path;
        }
        const stop = Math.min(end, start + maxLines);
        return {
            doc: id, document: parsed.meta.title, verified: !!parsed.meta.verified, section: heading,
            from_line: start + 1, to_line: stop, total_lines: parsed.lines.length,
            more: stop < end ? `The section continues to line ${end}; read on with line: ${stop + 1}.` : undefined,
            text: parsed.lines.slice(start, stop).join('\n'),
        };
    }

    async function outline(id) {
        const parsed = await loadDocument(id);
        return parsed.sections.filter(section => section.level && section.level <= 3).map(section => ({ section: section.path, line: section.start + 1 }));
    }

    function apiDefinitions() {
        if (!apiPromise) {
            apiPromise = fetchText(API_URL).then(text => Object.entries(JSON.parse(text)).map(([key, entry]) => ({
                name: entry.name || key, params: entry.params || [], returns: entry.returns || '', scope: entry.scope || '', description: entry.description || '', example: entry.example || '',
            }))).catch(error => { apiPromise = null; throw error; });
        }
        return apiPromise;
    }

    // Looks functions up in the api.gscript.dev definitions. options: { scope, limit }.
    async function searchApi(query, options = {}) {
        const wanted = String(query || '').trim().toLowerCase();
        const terms = words(wanted);
        const rank = entry => {
            const name = entry.name.toLowerCase();
            if (name === wanted) return 0;
            if (name.startsWith(wanted)) return 1;
            if (name.includes(wanted)) return 2;
            const text = name + ' ' + entry.description.toLowerCase();
            return terms.length && terms.every(term => text.includes(term)) ? 3 : -1;
        };
        const matches = (await apiDefinitions())
            .filter(entry => !options.scope || entry.scope === options.scope)
            .map(entry => ({ entry, rank: rank(entry) }))
            .filter(item => item.rank >= 0)
            .sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
        return { total: matches.length, functions: matches.slice(0, options.limit || 20).map(item => item.entry) };
    }

    // ---- The dialog --------------------------------------------------------------------------

    const BUTTON = 'background:#3a3a3a;color:#ddd;border:1px solid #0a0a0a;border-top:1px solid #555;border-left:1px solid #555;padding:4px 12px;cursor:pointer;font-family:chevyray,monospace;font-size:12px;';
    const INPUT = 'background:#1a1a1a;color:#ddd;border:1px solid #3a3a3a;padding:5px 8px;font-family:chevyray,monospace;font-size:12px;box-sizing:border-box;';
    const BOOK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
    // The look of the title bar's own buttons, which the stylesheet gives them by id.
    const TITLEBAR_BUTTON = '--wails-draggable:no-drag;-webkit-app-region:no-drag;app-region:no-drag;background:none;border:none;border-right:1px solid #2a2a2a;color:#9a9a9e;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:0 12px;height:32px;font-family:chevyray,monospace;font-size:12px;';
    const SOURCES = [['all', 'Everything'], ['api', 'Functions'], ['verified', 'Verified reference'], ['docs', 'All guides'], ['folders', 'My folders']];
    let dialog = null;
    let source = 'all';
    let searchTimer = null;
    let searchRun = 0;

    const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const part = name => dialog.querySelector(`[data-ref="${name}"]`);

    function showFunction(entry) {
        part('detail').innerHTML = `
            <div style="font-size:14px;color:#9cdcfe;user-select:text;">${escapeHTML(entry.name)}(${escapeHTML(entry.params.join(', '))})</div>
            <div style="margin-top:4px;color:#aaa;">${entry.returns ? `returns ${escapeHTML(entry.returns)}` : ''}${entry.returns && entry.scope ? ' · ' : ''}${escapeHTML(entry.scope)}</div>
            <div style="margin-top:10px;white-space:pre-wrap;user-select:text;line-height:1.5;">${escapeHTML(entry.description)}</div>
            ${entry.example ? `<div style="margin-top:12px;color:#aaa;">Example</div><pre style="margin:4px 0 0;padding:8px;background:#141414;border:1px solid #333;white-space:pre-wrap;user-select:text;font-family:monospace;font-size:12px;">${escapeHTML(entry.example)}</pre>` : ''}
            <div style="margin-top:14px;color:#777;">From api.gscript.dev</div>`;
    }

    async function showSection(hit) {
        const detail = part('detail');
        detail.innerHTML = '<div style="color:#888;">Loading...</div>';
        const loading = detail.firstElementChild;
        const read = await readDocument(hit.doc, { line: hit.line, maxLines: Math.max(hit.lines, 1) + 80 }).catch(error => ({ text: String(error.message || error) }));
        // Another result may be picked before this section has been read: write only if the pane still shows this one.
        if (!loading.isConnected) return;
        detail.innerHTML = `
            <div style="font-size:13px;color:#dcdcaa;user-select:text;">${escapeHTML(hit.section)}</div>
            <div style="margin-top:4px;color:${hit.verified ? '#56d364' : '#aaa'};">${escapeHTML(hit.document)}${hit.verified ? ' · human-verified' : ' · not verified'}</div>
            <pre style="margin:10px 0 0;white-space:pre-wrap;user-select:text;font-family:monospace;font-size:12px;line-height:1.45;">${escapeHTML(read.text)}</pre>`;
        detail.scrollTop = 0;
    }

    function resultRow(label, sub, color, onPick) {
        const row = document.createElement('div');
        row.style.cssText = 'padding:6px 10px;cursor:pointer;border-bottom:1px solid #1c1c1c;';
        row.innerHTML = `<div style="color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(label)}</div><div style="color:#888;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(sub)}</div>`;
        row.onmouseenter = () => { row.style.background = '#333'; };
        row.onmouseleave = () => { row.style.background = ''; };
        row.onclick = onPick;
        return row;
    }

    function showFile(match) {
        const detail = part('detail');
        detail.innerHTML = `
            <div style="font-size:13px;color:#ce9178;user-select:text;word-break:break-all;">${escapeHTML(match.path)}</div>
            <div style="margin-top:4px;color:#aaa;">line ${match.line} · from your own folders, not verified</div>
            <pre data-ref="file" style="margin:10px 0 0;white-space:pre-wrap;user-select:text;font-family:monospace;font-size:12px;line-height:1.45;">Loading...</pre>`;
        // Another result may be picked before this file has been read: write only into the view made for it.
        const shown = detail.querySelector('[data-ref="file"]');
        root.__GSUITE__.fs.readTextFile(match.path).then(text => {
            const lines = text.split('\n'), from = Math.max(0, match.line - 15);
            if (shown.isConnected) shown.textContent = lines.slice(from, match.line + 45).map((line, index) => `${String(from + index + 1).padStart(5)}  ${line}`).join('\n');
        }).catch(error => { if (shown.isConnected) shown.textContent = String(error.message || error); });
        detail.scrollTop = 0;
    }

    // The folders searched under "My folders": one per line, saved on this computer.
    function showFolderSettings() {
        part('detail').innerHTML = `
            <div style="font-size:13px;color:#dcdcaa;">My folders</div>
            <div style="margin-top:6px;color:#aaa;line-height:1.5;">Folders on this computer to search for examples, one per line: a checkout of <span style="user-select:text;">github.com/MorenoLand/GScript.GS2Taco</span> (its refs/ folder holds scripts from real servers), or your own server's scripts. Nothing in them is verified.</div>
            <textarea data-ref="folders" spellcheck="false" style="${INPUT}width:100%;height:110px;margin-top:8px;resize:vertical;font-family:monospace;">${escapeHTML(folders().join('\n'))}</textarea>
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center;"><button data-ref="saveFolders" style="${BUTTON}">Save</button><span data-ref="foldersNote" style="color:#888;"></span></div>`;
        part('saveFolders').onclick = () => {
            const saved = setFolders(part('folders').value.split('\n'));
            part('foldersNote').textContent = saved.length ? `Saved ${saved.length} folder${saved.length === 1 ? '' : 's'}.` : 'No folders are searched.';
            runSearch();
        };
    }

    async function runFolderSearch(run, query, list) {
        const edit = () => { const row = document.createElement('div'); row.style.cssText = 'padding:8px 10px;color:#9cdcfe;cursor:pointer;border-bottom:1px solid #1c1c1c;'; row.textContent = 'Choose folders...'; row.onclick = showFolderSettings; return row; };
        if (!root.__GSUITE__) { list.innerHTML = '<div style="padding:10px;color:#777;">Folders on your computer can be searched in the desktop app.</div>'; return; }
        if (!folders().length) { list.innerHTML = ''; list.appendChild(edit()); showFolderSettings(); return; }
        if (!query) { list.innerHTML = ''; list.appendChild(edit()); return; }
        list.innerHTML = '<div style="padding:10px;color:#888;">Searching...</div>';
        const matches = await searchFolders(query, { limit: 60 }).catch(error => ({ error: String(error.message || error) }));
        if (run !== searchRun) return;
        list.innerHTML = '';
        list.appendChild(edit());
        if (matches.error) { list.insertAdjacentHTML('beforeend', `<div style="padding:10px;color:#ff7b72;">${escapeHTML(matches.error)}</div>`); return; }
        for (const failed of matches.failed || []) list.insertAdjacentHTML('beforeend', `<div style="padding:6px 10px;color:#ff7b72;font-size:11px;">${escapeHTML(failed.folder)}: ${escapeHTML(failed.error)}</div>`);
        if (!matches.length) { list.insertAdjacentHTML('beforeend', '<div style="padding:10px;color:#777;">Nothing found.</div>'); return; }
        for (const match of matches) list.appendChild(resultRow(match.text.trim(), `${match.path.replace(/\\/g, '/').split('/').slice(-2).join('/')}:${match.line}`, '#ce9178', () => showFile(match)));
    }

    async function runSearch() {
        const run = ++searchRun;
        const query = part('query').value.trim();
        const list = part('results');
        if (source === 'folders') return runFolderSearch(run, query, list);
        if (!query) { list.innerHTML = '<div style="padding:10px;color:#777;">Type a function name or a topic: showimg, timeout, setshape2, string functions, ...</div>'; return; }
        list.innerHTML = '<div style="padding:10px;color:#888;">Searching...</div>';
        const wantFunctions = source === 'all' || source === 'api', wantDocs = source !== 'api';
        const [functions, sections] = await Promise.all([
            wantFunctions ? searchApi(query, { limit: 30 }).catch(error => ({ error: String(error.message || error), functions: [] })) : { functions: [] },
            wantDocs ? searchDocs(query, { verifiedOnly: source === 'verified', limit: 40 }).catch(() => []) : [],
        ]);
        if (run !== searchRun) return;
        list.innerHTML = '';
        let shown = 0;
        const heading = text => { const el = document.createElement('div'); el.style.cssText = 'padding:5px 10px;background:#202020;color:#aaa;font-size:11px;position:sticky;top:0;'; el.textContent = text; list.appendChild(el); };
        if (wantFunctions) {
            heading(functions.error ? 'Functions: api.gscript.dev could not be reached' : `Functions (api.gscript.dev): ${functions.total || 0}`);
            for (const entry of functions.functions) { shown++; list.appendChild(resultRow(`${entry.name}(${entry.params.join(', ')})`, entry.scope || '', '#9cdcfe', () => showFunction(entry))); }
        }
        if (wantDocs) {
            heading(`Guides: ${sections.length}${sections.length === 40 ? '+' : ''} sections`);
            for (const hit of sections) { shown++; list.appendChild(resultRow(hit.section.split(' > ').slice(-2).join(' > '), `${hit.document}${hit.verified ? ' · verified' : ''}`, hit.verified ? '#56d364' : '#dcdcaa', () => showSection(hit))); }
        }
        if (!shown) list.insertAdjacentHTML('beforeend', '<div style="padding:10px;color:#777;">Nothing found.</div>');
        else if (functions.functions[0] && functions.functions[0].name.toLowerCase() === query.toLowerCase()) showFunction(functions.functions[0]);
        else if (!wantFunctions && sections[0]) showSection(sections[0]);
    }

    function close() {
        if (dialog) dialog.style.display = 'none';
    }

    // Opens the reference dialog, optionally with a search already filled in.
    function open(query) {
        if (!dialog) {
            dialog = document.createElement('div');
            dialog.id = 'gscriptReferenceDialog';
            dialog.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9500;pointer-events:none;';
            dialog.innerHTML = `
<div data-ref="box" class="dialog-content" style="pointer-events:all;background:#252525;border:1px solid #3a3a3a;width:min(900px,94vw);height:min(600px,88vh);display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.8);font-family:chevyray,monospace;font-size:12px;color:#ddd;">
  <div data-ref="bar" class="dialog-titlebar" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#2a2a2a;border-bottom:1px solid #111;cursor:move;">
    <span style="flex:1;font-size:13px;display:flex;align-items:center;gap:6px;">${BOOK}GScript Reference</span>
    <button data-ref="close" style="${BUTTON}padding:2px 8px;">✕</button>
  </div>
  <div style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid #111;align-items:center;">
    <input data-ref="query" type="text" placeholder="Search functions and guides" style="${INPUT}flex:1 1 auto;min-width:120px;width:auto;">
    <div data-ref="sources" style="display:flex;flex:0 0 auto;">${SOURCES.map(([value, label]) => `<button data-source="${value}" style="${BUTTON}">${label}</button>`).join('')}</div>
  </div>
  <div style="flex:1;min-height:0;display:flex;">
    <div data-ref="results" style="width:300px;flex:0 0 300px;overflow-y:auto;border-right:1px solid #111;background:#1c1c1c;"></div>
    <div data-ref="detail" style="flex:1;min-width:0;overflow:auto;padding:12px 14px;"><div style="color:#777;line-height:1.6;">Look up GraalScript functions and read the scripting guides.<br>Functions come from api.gscript.dev. The guides ship with GSuite; the GraalScript Reference among them is human-verified, the others are not.</div></div>
  </div>
</div>`;
            document.body.appendChild(dialog);
            dialog._closeModal = close;
            part('close').onclick = close;
            part('query').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 200); };
            const markSource = () => part('sources').querySelectorAll('button').forEach(button => { button.style.background = button.dataset.source === source ? '#4169a8' : '#3a3a3a'; });
            part('sources').querySelectorAll('button').forEach(button => { button.onclick = () => { source = button.dataset.source; markSource(); runSearch(); }; });
            markSource();
            dialog.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') close(); });
            const box = part('box'), bar = part('bar');
            let dragging = false, dx = 0, dy = 0;
            bar.addEventListener('mousedown', event => { if (event.target.tagName === 'BUTTON') return; const rect = box.getBoundingClientRect(); dragging = true; dx = event.clientX - rect.left; dy = event.clientY - rect.top; event.preventDefault(); });
            document.addEventListener('mousemove', event => { if (!dragging) return; box.style.position = 'fixed'; box.style.margin = '0'; box.style.left = (event.clientX - dx) + 'px'; box.style.top = (event.clientY - dy) + 'px'; });
            document.addEventListener('mouseup', () => { dragging = false; });
        }
        dialog.style.display = 'flex';
        if (query !== undefined) part('query').value = query;
        part('query').focus();
        runSearch();
    }

    // Adds the button that opens the dialog: in the desktop title bar, and next to the other
    // tool buttons of each editor toolbar in the browser build.
    function installButtons() {
        const about = document.getElementById('tbAboutBtn');
        if (about && !document.getElementById('tbReferenceBtn')) {
            const button = document.createElement('button');
            button.id = 'tbReferenceBtn';
            button.title = 'GScript Reference';
            button.style.cssText = TITLEBAR_BUTTON;
            button.innerHTML = BOOK;
            button.onmouseenter = () => { button.style.background = '#3a3a3e'; button.style.color = '#e0e0e0'; };
            button.onmouseleave = () => { button.style.background = 'none'; button.style.color = '#9a9a9e'; };
            button.onclick = () => open();
            about.parentElement.insertBefore(button, about);
        }
        for (const beautify of document.querySelectorAll('[id$="btnBeautify"]')) {
            if (beautify.id === 'tbBeautifyBtn' || beautify.parentElement.querySelector('[data-gscript-reference]')) continue;
            const button = document.createElement('button');
            button.dataset.gscriptReference = '1';
            button.title = 'GScript Reference';
            button.className = beautify.className;
            button.style.cssText = beautify.style.cssText;
            button.innerHTML = BOOK;
            button.onclick = () => open();
            beautify.insertAdjacentElement('afterend', button);
        }
    }

    if (root.document) {
        const install = () => { try { installButtons(); } catch (error) { root.console.warn('[gscript reference]', error); } };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', install);
        else install();
        root.document.addEventListener('editorvisible', install);
    }

    return { open, close, searchApi, searchDocs, searchFolders, folders, setFolders, readDocument, outline, index, parseSections, searchSections, setFetcher, API_URL };
});
