// GSuite MCP: the tool registry and its bridge to the Go server.
//
// MCP clients connect to the server in mcp/ (Go), which relays every tool call,
// resource read and prompt request to this page as an "mcp:request" event.
// Tools are registered with GSuiteMCP.tool(...) and run here, next to the
// editors they drive; the answer goes back through AppService.McpResolve.
// See docs/mcp.md for the overview and js/mcp/*.js for the tools.
(function (root) {
    'use strict';

    // An error whose message is meant for the calling agent. Any other exception
    // is reported too, but a ToolError marks an expected, explained failure.
    class ToolError extends Error {}

    const tools = new Map();
    const resources = new Map();
    const prompts = new Map();
    const activity = [];
    const ACTIVITY_LIMIT = 200;
    // How long a tool may run unless it sets timeoutMs; the Go server gives up at about the same time.
    const DEFAULT_TIMEOUT_MS = 110000;
    // How much longer the queue waits for a tool that ran out of time before moving on.
    const GRACE_MS = 20000;
    const EXPIRED = Symbol('expired');
    // Requests the server has given up on, so they are not run once they reach the front of the queue.
    const cancelled = new Set();
    const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let instructions = '';
    let registerTimer = null;
    let connected = false;
    let connecting = null;
    let queue = Promise.resolve();

    // Schema builders. The description may be left out for array items: S.integer({ minimum: 0 }).
    const scalar = type => (description, extra) => (typeof description === 'object' && description ? { type, ...description } : { type, description, ...extra });
    const S = {
        string: scalar('string'),
        integer: scalar('integer'),
        number: scalar('number'),
        boolean: scalar('boolean'),
        enum: (values, description, extra) => ({ type: 'string', enum: values, description, ...extra }),
        array: (items, description, extra) => ({ type: 'array', items, description, ...extra }),
        // An object with named properties accepts only those; one without any is free-form.
        object: (properties, required, description, extra) => ({ type: 'object', properties, required: required || [], additionalProperties: Object.keys(properties).length === 0, description, ...extra }),
    };

    function typeName(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (Number.isInteger(value)) return 'integer';
        return typeof value;
    }

    // Checks value against a JSON Schema subset (type, enum, minimum, maximum,
    // required, properties, items) and returns [value, error]. Agents often send
    // numbers and booleans as strings, so those are converted rather than refused.
    function validate(schema, value, path) {
        if (!schema || !schema.type) return [value, null];
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        let failure = null;
        for (const type of types) {
            const [converted, error] = validateAs(type, schema, value, path);
            if (!error) return [converted, null];
            failure = failure || error;
        }
        return [value, failure];
    }

    function validateAs(type, schema, value, path) {
        if (type === 'integer' || type === 'number') {
            if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) value = Number(value);
            if (typeof value !== 'number' || !Number.isFinite(value)) return [value, `${path} must be ${type === 'integer' ? 'an integer' : 'a number'}, got ${typeName(value)}`];
            if (type === 'integer' && !Number.isInteger(value)) return [value, `${path} must be a whole number, got ${value}`];
            if (schema.minimum !== undefined && value < schema.minimum) return [value, `${path} must be at least ${schema.minimum}, got ${value}`];
            if (schema.maximum !== undefined && value > schema.maximum) return [value, `${path} must be at most ${schema.maximum}, got ${value}`];
        } else if (type === 'boolean') {
            if (value === 'true') value = true;
            if (value === 'false') value = false;
            if (typeof value !== 'boolean') return [value, `${path} must be true or false, got ${typeName(value)}`];
        } else if (type === 'string') {
            if (typeof value === 'number' || typeof value === 'boolean') value = String(value);
            if (typeof value !== 'string') return [value, `${path} must be a string, got ${typeName(value)}`];
        } else if (type === 'array') {
            if (!Array.isArray(value)) return [value, `${path} must be an array, got ${typeName(value)}`];
            if (schema.items) {
                value = value.slice();
                for (let i = 0; i < value.length; i++) {
                    const [item, error] = validate(schema.items, value[i], `${path}[${i}]`);
                    if (error) return [value, error];
                    value[i] = item;
                }
            }
        } else if (type === 'object') {
            if (typeName(value) !== 'object') return [value, `${path} must be an object, got ${typeName(value)}`];
            if (schema.properties) return validateObject(schema, value, path);
        } else if (type === 'null') {
            if (value !== null) return [value, `${path} must be null`];
        }
        if (schema.enum && !schema.enum.includes(value)) return [value, `${path} must be one of ${schema.enum.map(v => JSON.stringify(v)).join(', ')}; got ${JSON.stringify(value)}`];
        return [value, null];
    }

    function validateObject(schema, value, path) {
        const result = {};
        const prefix = path ? path + '.' : '';
        for (const key of Object.keys(value)) {
            if (value[key] === undefined || value[key] === null) continue;
            // Own properties only: "constructor" or "toString" must not match what every object inherits.
            const property = Object.prototype.hasOwnProperty.call(schema.properties, key) ? schema.properties[key] : undefined;
            if (key === '__proto__') return [value, `Unknown argument "${prefix}${key}"`];
            if (!property) {
                if (schema.additionalProperties === false) return [value, `Unknown argument "${prefix}${key}". Valid arguments: ${Object.keys(schema.properties).join(', ') || '(none)'}`];
                result[key] = value[key];
                continue;
            }
            const [converted, error] = validate(property, value[key], prefix + key);
            if (error) return [value, error];
            result[key] = converted;
        }
        for (const key of schema.required || []) {
            if (result[key] === undefined) return [value, `Missing required argument "${prefix}${key}"${schema.properties[key]?.description ? ` (${schema.properties[key].description})` : ''}`];
        }
        for (const [key, property] of Object.entries(schema.properties)) {
            if (result[key] === undefined && property.default !== undefined) result[key] = property.default;
        }
        return [result, null];
    }

    function inputSchema(def) {
        return { type: 'object', properties: def.input || {}, required: def.required || [], additionalProperties: false };
    }

    // Registers a tool. def: { name, title, description, input (schema properties),
    // required, readOnly, destructive, idempotent, openWorld, timeoutMs }.
    // handler(args) returns a string, any JSON value, or GSuiteMCP.result(...).
    function tool(def, handler) {
        if (!def || !/^[a-z][a-z0-9_]*$/.test(def.name || '')) throw new Error(`Invalid MCP tool name: ${def && def.name}`);
        if (typeof handler !== 'function') throw new Error(`MCP tool ${def.name} needs a handler`);
        tools.set(def.name, { def, handler, schema: inputSchema(def) });
        scheduleRegister();
    }

    // Registers a readable resource. def: { uri, name, title, description, mimeType }.
    // read() returns the text.
    function resource(def, read) {
        resources.set(def.uri, { def, read });
        scheduleRegister();
    }

    // Registers a prompt. def: { name, title, description, arguments: [{name, description, required}] }.
    // get(args) returns the prompt text.
    function prompt(def, get) {
        prompts.set(def.name, { def, get });
        scheduleRegister();
    }

    function setInstructions(text) {
        instructions = text;
        scheduleRegister();
    }

    function manifest() {
        const timeouts = {};
        const toolList = [];
        for (const { def, schema } of tools.values()) {
            if (def.timeoutMs) timeouts[def.name] = def.timeoutMs;
            toolList.push({
                name: def.name,
                title: def.title || def.name,
                description: def.description,
                inputSchema: schema,
                annotations: {
                    title: def.title || def.name,
                    readOnlyHint: !!def.readOnly,
                    destructiveHint: def.readOnly ? false : !!def.destructive,
                    idempotentHint: def.readOnly ? true : !!def.idempotent,
                    openWorldHint: !!def.openWorld,
                },
            });
        }
        return {
            instructions,
            tools: toolList,
            resources: [...resources.values()].map(entry => ({ mimeType: 'text/markdown', ...entry.def })),
            resourceTemplates: [],
            prompts: [...prompts.values()].map(entry => entry.def),
            timeouts,
        };
    }

    function textPart(text) {
        return { type: 'text', text: String(text) };
    }

    // An image content part from a data URL or bare base64.
    function image(data, mimeType) {
        const match = /^data:([^;,]+);base64,(.*)$/s.exec(data);
        return { type: 'image', data: match ? match[2] : data, mimeType: match ? match[1] : (mimeType || 'image/png') };
    }

    // Builds a result with several parts: strings and JSON values become text, image() parts pass through.
    function result(...parts) {
        const content = parts.filter(part => part !== undefined && part !== null).map(part => {
            if (typeof part === 'string') return textPart(part);
            if (part && (part.type === 'image' || part.type === 'text')) return part;
            return textPart(JSON.stringify(part));
        });
        return { __mcpResult: true, value: { content } };
    }

    // Passes on a complete MCP tool result that came from elsewhere (Remote Control), as it is.
    function raw(value) {
        return { __mcpResult: true, value };
    }

    function toToolResult(value) {
        if (value && value.__mcpResult) return value.value;
        if (value === undefined || value === null) return { content: [textPart('OK')] };
        if (typeof value === 'string') return { content: [textPart(value)] };
        return { content: [textPart(JSON.stringify(value))] };
    }

    function fail(message) {
        throw new ToolError(message);
    }

    function describeError(error) {
        if (error instanceof ToolError) return error.message;
        const message = error && error.message ? error.message : String(error);
        return `Internal error in GSuite: ${message}`;
    }

    function record(entry) {
        activity.push(entry);
        if (activity.length > ACTIVITY_LIMIT) activity.shift();
        if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
            root.dispatchEvent(new root.CustomEvent('gsuite-mcp-activity', { detail: entry }));
        }
    }

    // Stops waiting for a handler that does not finish in time, so one stuck tool cannot hold up
    // the queue for good. The handler cannot be stopped, though, and the next tool must not start
    // editing while it is still at work: the queue is held a little longer for it to finish.
    async function withTimeout(promise, ms, name) {
        const work = Promise.resolve(promise);
        let timer;
        const expired = new Promise(resolve => { timer = setTimeout(() => resolve(EXPIRED), ms); });
        const outcome = await Promise.race([work, expired]).finally(() => clearTimeout(timer));
        if (outcome !== EXPIRED) return outcome;
        const settled = await Promise.race([work.then(() => true, () => true), new Promise(resolve => setTimeout(() => resolve(false), Math.min(GRACE_MS, ms)))]);
        throw new ToolError(`${name} did not finish within ${Math.round(ms / 1000)} seconds${settled ? '; it has finished since, so check the result before repeating it' : ' and may still be running. The app may be waiting on a dialog: check app_dialogs'}.`);
    }

    // Runs a tool by name and always resolves to an MCP tool result.
    async function call(name, args) {
        const entry = tools.get(name);
        if (!entry) return { isError: true, content: [textPart(`Unknown tool: ${name}`)] };
        const started = Date.now();
        const log = { tool: name, time: started, ok: true, ms: 0, error: '' };
        if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
            root.dispatchEvent(new root.CustomEvent('gsuite-mcp-activity', { detail: { tool: name, time: started, running: true } }));
        }
        try {
            if (args !== undefined && args !== null && typeName(args) !== 'object') throw new ToolError(`The tool arguments must be an object, got ${typeName(args)}`);
            const [input, error] = validateObject(entry.schema, args || {}, '');
            if (error) throw new ToolError(error);
            const answer = toToolResult(await withTimeout(entry.handler(input), entry.def.timeoutMs || DEFAULT_TIMEOUT_MS, name));
            if (answer.isError) {
                log.ok = false;
                log.error = (answer.content || []).map(part => part.text || '').join(' ').slice(0, 300);
            }
            return answer;
        } catch (error) {
            log.ok = false;
            log.error = describeError(error);
            if (!(error instanceof ToolError) && root.console) root.console.error(`[mcp] ${name} failed`, error);
            return { isError: true, content: [textPart(log.error)] };
        } finally {
            log.ms = Date.now() - started;
            record(log);
        }
    }

    async function handle(method, params) {
        if (method === 'tools/call') return { result: await call(params.name, params.arguments) };
        if (method === 'resources/read') {
            const entry = resources.get(params.uri);
            if (!entry) return { error: { code: -32002, message: `Resource not found: ${params.uri}` } };
            const text = await entry.read();
            return { result: { contents: [{ uri: params.uri, mimeType: entry.def.mimeType || 'text/markdown', text }] } };
        }
        if (method === 'prompts/get') {
            const entry = prompts.get(params.name);
            if (!entry) return { error: { code: -32602, message: `Unknown prompt: ${params.name}` } };
            const text = await entry.get(params.arguments || {});
            return { result: { description: entry.def.description, messages: [{ role: 'user', content: textPart(text) }] } };
        }
        return { error: { code: -32601, message: `Method not found: ${method}` } };
    }

    // Requests run one at a time: handlers await between steps, and two edits
    // interleaving on the same editor state would corrupt it.
    function onRequest(request) {
        if (!request || request.client !== clientId) return;
        queue = queue.then(async () => {
            // The caller may have stopped waiting while this sat in the queue; running it now would
            // change things behind the back of an agent that was told the call failed.
            if (cancelled.delete(request.id) || (request.deadline && Date.now() > request.deadline)) return;
            let answer;
            try {
                answer = await handle(request.method, JSON.parse(request.params || '{}'));
            } catch (error) {
                answer = { error: { code: -32603, message: describeError(error) } };
            }
            try {
                await root.__GSUITE__.core.invoke('McpResolve', [request.id, JSON.stringify(answer)]);
            } catch (error) {
                if (root.console) root.console.error('[mcp] could not deliver an answer', error);
            }
        });
    }

    function scheduleRegister() {
        if (!connected) return;
        clearTimeout(registerTimer);
        registerTimer = setTimeout(register, 50);
    }

    async function register() {
        try {
            await root.__GSUITE__.core.invoke('McpRegister', [clientId, JSON.stringify(manifest())]);
        } catch (error) {
            if (root.console) root.console.error('[mcp] could not register tools', error);
        }
    }

    // Connects to the Go server. Only the desktop app has one; in a plain browser
    // the registry still works through GSuiteMCP.call for testing.
    // Calls made while one is under way share it, and a failed one takes its listeners off again, so that no event is
    // ever handled twice.
    function connect() {
        const bridge = root.__GSUITE__;
        if (connected || !bridge) return Promise.resolve(false);
        if (!connecting) connecting = listenAndRegister(bridge).finally(() => { connecting = null; });
        return connecting;
    }

    async function listenAndRegister(bridge) {
        const listening = [];
        const listen = async (name, handler) => { listening.push(await bridge.event.listen(name, handler)); };
        try {
            await listen('mcp:request', event => onRequest(event.payload));
            await listen('mcp:cancel', event => {
                cancelled.add(event.payload.id);
                if (cancelled.size > 500) cancelled.delete(cancelled.values().next().value);
            });
            // Calls the Go server forwards to Remote Control never reach this page; it reports them so they show here too.
            await listen('mcp:activity', event => {
                const entry = event.payload || {};
                if (!entry.running) { record({ tool: entry.tool, time: entry.time, ok: !!entry.ok, ms: entry.ms || 0, error: entry.error || '' }); return; }
                if (typeof root.dispatchEvent === 'function') root.dispatchEvent(new root.CustomEvent('gsuite-mcp-activity', { detail: { tool: entry.tool, time: entry.time, running: true } }));
            });
            await listen('mcp:status', event => {
                if (typeof root.dispatchEvent === 'function') root.dispatchEvent(new root.CustomEvent('gsuite-mcp-status', { detail: event.payload }));
            });
        } catch (error) {
            for (const stop of listening) if (typeof stop === 'function') stop();
            throw error;
        }
        connected = true;
        await register();
        return true;
    }

    const api = {
        ToolError, S, tool, resource, prompt, setInstructions, manifest, call, handle, connect,
        result, raw, image, fail, validate,
        get activity() { return activity.slice(); },
        get toolNames() { return [...tools.keys()]; },
        status: () => root.__GSUITE__ ? root.__GSUITE__.core.invoke('McpStatus', []) : Promise.resolve(null),
        configure: (enabled, port, token) => root.__GSUITE__.core.invoke('McpConfigure', [!!enabled, Number(port) || 0, String(token || '')]),
        configureRemote: (enabled, command) => root.__GSUITE__.core.invoke('McpConfigureRemoteControl', [!!enabled, String(command || '')]),
        remoteStatus: refresh => root.__GSUITE__.core.invoke('McpRemoteStatus', [!!refresh]),
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GSuiteMCP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
