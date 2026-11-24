// GSuite MCP: the title-bar indicator and the dialog for the MCP server's status
// and settings. Desktop app only: the browser build has no server to show.
(function () {
    'use strict';
    const mcp = window.GSuiteMCP;
    if (!window.__GSUITE__) return;

    const COLORS = { running: '#56d364', off: '#777', error: '#ff7b72', busy: '#ffa657' };
    // The same look as the Gmap Generator dialog, which also builds its own controls.
    const BUTTON = 'background:#3a3a3a;color:#ddd;border:1px solid #0a0a0a;border-top:1px solid #555;border-left:1px solid #555;padding:4px 14px;cursor:pointer;font-family:chevyray,monospace;font-size:12px;';
    const INPUT = 'background:#1a1a1a;color:#ddd;border:1px solid #3a3a3a;padding:4px 8px;font-family:chevyray,monospace;font-size:12px;box-sizing:border-box;';
    let status = null;
    let busy = 0;
    let button = null;
    let dialog = null;

    const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

    function dotColor() {
        if (!status) return COLORS.off;
        if (status.error) return COLORS.error;
        if (!status.running) return COLORS.off;
        return busy > 0 ? COLORS.busy : COLORS.running;
    }

    function describe() {
        if (!status) return 'MCP server';
        if (status.error) return `MCP server: ${status.error}`;
        if (!status.running) return 'MCP server: off';
        return `MCP server: ${status.url}${status.client ? ` (last client: ${status.client})` : ''}`;
    }

    function paintButton() {
        if (!button) return;
        button.title = describe();
        button.querySelector('span').style.background = dotColor();
    }

    function addButton() {
        const about = document.getElementById('tbAboutBtn');
        if (!about || button) return;
        button = document.createElement('button');
        button.id = 'tbMcpBtn';
        // The look of the title bar's own buttons, which the stylesheet gives them by id.
        button.style.cssText = '--wails-draggable:no-drag;-webkit-app-region:no-drag;app-region:no-drag;background:none;border:none;border-right:1px solid #2a2a2a;color:#9a9a9e;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:0 12px;height:32px;font-family:chevyray,monospace;font-size:12px;';
        button.onmouseenter = () => { button.style.background = '#3a3a3e'; button.style.color = '#e0e0e0'; };
        button.onmouseleave = () => { button.style.background = 'none'; button.style.color = '#9a9a9e'; };
        button.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#777;"></span>MCP';
        button.onclick = openDialog;
        about.parentElement.insertBefore(button, about);
        paintButton();
    }

    async function refresh() {
        status = await mcp.status().catch(() => null);
        paintButton();
        if (dialog) renderDialog();
    }

    function snippet(label, text) {
        return `<div style="margin-top:10px;color:#aaa;">${label}</div>
            <div style="display:flex;gap:6px;align-items:flex-start;margin-top:4px;">
                <pre style="flex:1;margin:0;padding:6px 8px;background:#1a1a1a;border:1px solid #3a3a3a;overflow-x:auto;font-family:monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;user-select:text;">${escapeHTML(text)}</pre>
                <button data-copy="${escapeHTML(text)}" style="${BUTTON}">Copy</button>
            </div>`;
    }

    function remoteState(rc) {
        if (!rc.enabled) return '<span style="color:#aaa;">Off</span>';
        if (rc.connected) return `<span style="color:${COLORS.running};">Connected</span> · ${(rc.tools || []).length} tools${rc.busy ? ' · waiting for Remote Control' : ''}`;
        if (rc.error) return `<span style="color:${COLORS.error};">${escapeHTML(rc.error)}</span>`;
        return '<span style="color:#aaa;">Not connected yet: it connects when an agent first asks</span>';
    }

    async function renderDialog() {
        // The dialog may have been closed while a caller was waiting on the server.
        if (!dialog) return;
        const body = dialog.querySelector('[data-mcp="body"]');
        const info = await mcp.helpers.system().catch(() => ({}));
        if (!dialog) return;
        const s = status || {};
        const state = s.error ? `<span style="color:${COLORS.error};">${escapeHTML(s.error)}</span>`
            : s.running ? `<span style="color:${COLORS.running};">Running</span> at <span style="user-select:text;">${escapeHTML(s.url)}</span>`
            : '<span style="color:#aaa;">Off</span>';
        const rc = s.remoteControl || {};
        const exe = info.exePath || 'GSuite';
        const stdio = JSON.stringify({ mcpServers: { gsuite: { command: exe, args: ['--mcp-stdio'] } } }, null, 2);
        body.innerHTML = `
            <div>${state}</div>
            <div style="margin-top:4px;color:#aaa;">${s.tools || 0} tools · ${s.client ? `last client: ${escapeHTML(s.client)}` : 'no agent has connected yet'}</div>
            <div style="margin-top:12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
                <label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" data-mcp="enabled" ${s.enabled ? 'checked' : ''}> Enabled</label>
                <label style="display:flex;gap:6px;align-items:center;">Port <input data-mcp="port" type="text" inputmode="numeric" value="${s.port || ''}" style="${INPUT}width:70px;"></label>
                <label style="display:flex;gap:6px;align-items:center;flex:1;min-width:180px;">Token <input data-mcp="token" type="text" value="${escapeHTML(s.token || '')}" placeholder="required" style="${INPUT}flex:1;min-width:0;"></label>
                <button data-mcp="apply" style="${BUTTON}">Apply</button>
            </div>
            <div style="margin-top:6px;color:#888;">The server only accepts connections from programs on this computer. Every client must send the token as a Bearer authorization header.</div>
            ${s.running ? snippet('Claude Code', `claude mcp add --transport http gsuite ${s.url} --header "Authorization: Bearer ${s.token}"`) : ''}
            ${s.running ? snippet('Clients that connect over HTTP', `${s.url}\nAuthorization: Bearer ${s.token}`) : ''}
            ${snippet('Clients that start a command (Claude Desktop, Cursor, ...)', stdio)}
            <div style="margin-top:14px;padding-top:10px;border-top:1px solid #2a2a2a;color:#c0c0c0;">Remote Control</div>
            <div style="margin-top:4px;color:#888;">Also gives agents the tools of Remote Control (rc_...), so what they build here can be sent to the game server Remote Control is connected to. Those tools act on the live server. Remote Control decides what is allowed and asks you before a change: see its Options &gt; MCP, which must be turned on there too.</div>
            <div style="margin-top:8px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
                <label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" data-mcp="rc-enabled" ${rc.enabled ? 'checked' : ''}> Offer Remote Control's tools</label>
                <label style="display:flex;gap:6px;align-items:center;flex:1;min-width:220px;">Program <input data-mcp="rc-command" type="text" value="${escapeHTML(rc.command || '')}" placeholder="${escapeHTML(rc.resolved || 'found automatically')}" style="${INPUT}flex:1;min-width:0;"></label>
                <button data-mcp="rc-apply" style="${BUTTON}">Apply</button>
            </div>
            <div data-mcp="rc-state" style="margin-top:6px;">${remoteState(rc)}</div>
            <div style="margin-top:12px;color:#aaa;">Recent tool calls</div>
            <div data-mcp="recent" style="margin-top:4px;background:#1a1a1a;border:1px solid #3a3a3a;max-height:140px;overflow-y:auto;font-family:monospace;font-size:11px;"></div>`;
        renderRecent();
        body.querySelector('[data-mcp="apply"]').onclick = async () => {
            const enabled = body.querySelector('[data-mcp="enabled"]').checked;
            const port = parseInt(body.querySelector('[data-mcp="port"]').value, 10) || 0;
            const token = body.querySelector('[data-mcp="token"]').value.trim();
            status = await mcp.configure(enabled, port, token).catch(error => ({ ...(status || {}), error: String(error.message || error) }));
            await refresh();
        };
        body.querySelector('[data-mcp="rc-apply"]').onclick = async () => {
            const enabled = body.querySelector('[data-mcp="rc-enabled"]').checked;
            const command = body.querySelector('[data-mcp="rc-command"]').value.trim();
            const state = body.querySelector('[data-mcp="rc-state"]');
            state.innerHTML = '<span style="color:#aaa;">Connecting...</span>';
            try {
                status = await mcp.configureRemote(enabled, command);
            } catch (error) {
                // Nothing was saved (a path that is not Remote Control, say): keep what was typed and say why.
                state.innerHTML = `<span style="color:${COLORS.error};">${escapeHTML(String(error.message || error))}</span>`;
                return;
            }
            // Asking for the tools is what starts the connection, so the result of Apply shows at once.
            if (enabled) status = { ...status, remoteControl: await mcp.remoteStatus(true).catch(() => status.remoteControl) };
            paintButton();
            renderDialog();
        };
        body.querySelectorAll('[data-copy]').forEach(copy => {
            copy.onclick = () => navigator.clipboard?.writeText(copy.dataset.copy).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200); });
        });
    }

    // The list of recent calls is redrawn on its own: tool calls arrive while the user may be typing in the form above it.
    function renderRecent() {
        const list = dialog?.querySelector('[data-mcp="recent"]');
        if (!list) return;
        const recent = mcp.activity.filter(entry => !entry.running).slice(-8).reverse();
        list.innerHTML = recent.length
            ? recent.map(entry => `<div style="padding:3px 8px;display:flex;gap:8px;" title="${escapeHTML(entry.error || '')}"><span style="color:${entry.ok ? COLORS.running : COLORS.error};">${entry.ok ? 'ok' : 'failed'}</span><span style="flex:1;">${escapeHTML(entry.tool)}</span><span style="color:#888;">${entry.ms} ms</span></div>`).join('')
            : '<div style="padding:6px 8px;color:#777;">None yet</div>';
    }

    const typing = () => !!dialog && dialog.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';

    function closeDialog() {
        dialog?.remove();
        dialog = null;
    }

    function openDialog() {
        if (dialog) { closeDialog(); return; }
        dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.id = 'mcpServerDialog';
        dialog.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10000;justify-content:center;align-items:center;';
        dialog.innerHTML = `
            <div class="dialog-content" style="border:2px solid #1a1a1a;width:560px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 4px 16px rgba(0,0,0,0.9);font-family:chevyray,monospace;font-size:12px;">
                <div class="dialog-titlebar" style="display:flex;align-items:center;padding:10px 14px;gap:8px;"><span style="flex:1;font-size:13px;color:#c0c0c0;user-select:none;">MCP Server</span></div>
                <div data-mcp="body" style="padding:14px;overflow-y:auto;line-height:1.5;"></div>
                <div style="border-top:1px solid #0a0a0a;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;color:#888;">
                    <span>Lets AI agents drive GSuite. See docs/mcp.md.</span><button data-mcp="close" style="${BUTTON}">Close</button>
                </div>
            </div>`;
        dialog._closeModal = closeDialog;
        dialog.onclick = event => { if (event.target === dialog) closeDialog(); };
        dialog.querySelector('[data-mcp="close"]').onclick = closeDialog;
        document.body.appendChild(dialog);
        refresh();
    }

    window.addEventListener('gsuite-mcp-status', event => { status = event.detail; paintButton(); if (dialog && !typing()) renderDialog(); });
    window.addEventListener('gsuite-mcp-activity', event => {
        busy += event.detail.running ? 1 : -1;
        if (busy < 0) busy = 0;
        paintButton();
        if (!event.detail.running) renderRecent();
    });

    mcp.panel = { open: openDialog, refresh };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { addButton(); refresh(); });
    else { addButton(); refresh(); }
})();
