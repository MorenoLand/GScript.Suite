// GSuite MCP: connects the tool registry to the app once every tool file has loaded.
(function () {
    'use strict';
    window.GSuiteMCP.connect().catch(error => console.error('[mcp] could not connect', error));
})();
