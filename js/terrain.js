(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.GraalTerrain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const GRID_SIDE = 9;
    const FIELD_SIDE = 65;
    const ZERO_LIMIT = 0.0001;

    class TerrainRandom {
        constructor(seed = 0) { this.state = seed >>> 0; }
        next() { this.state = (Math.imul(this.state, 0x08088405) + 1) >>> 0; return this.state; }
        drand() { return this.next() / 4294967296; }
    }

    function roundFloor(value) { return Math.floor(value + ZERO_LIMIT); }

    function parseNumber(value, fallback = 0) {
        const number = Number(String(value).trim());
        return Number.isFinite(number) ? number : fallback;
    }

    function parseInteger(value, fallback = 0) {
        const number = parseInt(String(value).trim(), 10);
        return Number.isFinite(number) ? number : fallback;
    }

    function parseSeed(value) {
        const number = Number(String(value).trim());
        if (!Number.isFinite(number)) return 0;
        return number >>> 0;
    }

    function splitValues(line) {
        return String(line).replace(/\r/g, "").split(",").map(value => value.trim()).filter(value => value.length > 0);
    }

    function stripQuotes(value) {
        const text = String(value).trim();
        return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    }

    class TerrainMap {
        constructor() { this.clear(); }

        clear() {
            this.loaded = false;
            this.modified = false;
            this.hasTerrainData = false;
            this.width = 0;
            this.height = 0;
            this.generated = "";
            this.mapImage = "";
            this.minimapImage = "";
            this.tileMapLevel = "";
            this.tileMapBlocks = "";
            this.noAutomapping = false;
            this.mapSeed = 0;
            this.baseHeight = 0;
            this.evenBorders = false;
            this.mapHeight = 0;
            this.mapChaos = 0.6;
            this.levelHeight = 0;
            this.levelChaos = 0.6;
            this.heightMap = [];
            this.randomSeeds = [];
            this.overrides = [];
            this.horizontalBorders = [];
            this.verticalBorders = [];
            this.levels = [];
            this.memberNames = [];
            this.minimumHeight = 0;
            this.maximumHeight = 0;
            this.originalText = "";
            this.lineEnding = "\n";
            return this;
        }

        static parse(text) {
            const terrain = new TerrainMap();
            return terrain.load(text) ? terrain : null;
        }

        load(text) {
            this.clear();
            const source = String(text || "");
            this.originalText = source;
            this.lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
            const lines = source.replace(/\r\n/g, "\n").split("\n");
            if (!lines.length || lines[0].trim() !== "GRMAP001") return false;
            let readTerrainKeys = false;
            for (let index = 1; index < lines.length; index++) {
                const raw = lines[index];
                const line = raw.trim();
                if (!line) continue;
                const space = line.search(/[ \t]/);
                const key = space < 0 ? line : line.slice(0, space);
                const value = space < 0 ? "" : line.slice(space + 1).trim();
                if (key === "WIDTH") this.width = parseInteger(value);
                else if (key === "HEIGHT") this.height = parseInteger(value);
                else if (key === "GENERATED") this.generated = value;
                else if (key === "MAPIMG") this.mapImage = value;
                else if (key === "MINIMAPIMG") this.minimapImage = value;
                else if (key === "TILEMAP") { const parts = value.split(/\s+/).filter(Boolean); this.tileMapLevel = parts[0] || ""; this.tileMapBlocks = parts[1] || ""; }
                else if (key === "NOAUTOMAPPING") this.noAutomapping = value === "" ? true : value.toLowerCase() === "true";
                else if (key === "GENSEED") { this.mapSeed = parseSeed(value); readTerrainKeys = true; }
                else if (key === "GENBASE") { this.baseHeight = parseNumber(value); readTerrainKeys = true; }
                else if (key === "GENEVENBORDERS") { this.evenBorders = value.toLowerCase() === "true"; readTerrainKeys = true; }
                else if (key === "GENHEIGHT") { this.mapHeight = parseNumber(value); readTerrainKeys = true; }
                else if (key === "GENCHAOS") { this.mapChaos = parseNumber(value, 0.6); readTerrainKeys = true; }
                else if (key === "LEVHEIGHT") { this.levelHeight = parseNumber(value); readTerrainKeys = true; }
                else if (key === "LEVCHAOS") { this.levelChaos = parseNumber(value); readTerrainKeys = true; }
                else if (key === "HEIGHTMAP") {
                    readTerrainKeys = true;
                    this.heightMap = [];
                    while (++index < lines.length && lines[index].trim() !== "HEIGHTMAPEND") for (const item of splitValues(lines[index])) this.heightMap.push(parseNumber(item));
                } else if (key === "RANDOMSEEDS") {
                    readTerrainKeys = true;
                    this.randomSeeds = [];
                    while (++index < lines.length && lines[index].trim() !== "RANDOMSEEDSEND") for (const item of splitValues(lines[index])) this.randomSeeds.push(parseSeed(item));
                } else if (key === "LEVELNAMES") {
                    this.memberNames = [];
                    while (++index < lines.length && lines[index].trim() !== "LEVELNAMESEND") for (const item of splitValues(lines[index])) { const name = stripQuotes(item); if (name) this.memberNames.push(name); }
                } else if (key === "HEIGHTS") {
                    readTerrainKeys = true;
                    const parts = value.split(/\s+/).filter(Boolean);
                    if (!parts.length) throw new Error("invalid terrain override header");
                    if ((parts.length > 1 && parts[1] !== "8") || (parts.length > 2 && parts[2] !== "8")) throw new Error("invalid terrain override dimensions");
                    const samples = new Float64Array(GRID_SIDE * GRID_SIDE);
                    let row = 0;
                    while (++index < lines.length && lines[index].trim() !== "HEIGHTSEND") {
                        if (row >= GRID_SIDE) throw new Error("terrain override has too many rows");
                        const values = lines[index].replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
                        if (values.length < GRID_SIDE) throw new Error("terrain override row is incomplete");
                        for (let column = 0; column < GRID_SIDE; column++) samples[row * GRID_SIDE + column] = parseNumber(values[column]);
                        row++;
                    }
                    if (row !== GRID_SIDE) throw new Error("invalid terrain override");
                    this.overrides.push({ name: stripQuotes(parts[0]), samples });
                }
            }
            this.loaded = true;
            this.hasTerrainData = readTerrainKeys;
            this.ensureMemberNames();
            if (this.hasTerrainData) this.ensureTerrain();
            this.modified = false;
            return true;
        }

        ensureMemberNames() {
            if (!this.width || !this.height) return;
            const count = this.width * this.height;
            if (this.memberNames.length >= count) { this.memberNames.length = count; return; }
            while (this.memberNames.length < count) {
                const index = this.memberNames.length;
                const name = this.generated ? this.generatedLevelName(index % this.width, Math.floor(index / this.width)) : "";
                this.memberNames.push(name || `level_${index % this.width}_${Math.floor(index / this.width)}.nw`);
            }
        }

        generatedLevelName(levelX, levelY) {
            const generated = String(this.generated || "");
            const dot = generated.lastIndexOf(".");
            const base = dot >= 0 ? generated.slice(0, dot) : generated;
            const suffix = dot >= 0 ? generated.slice(dot) : "";
            const underscore = base.indexOf("_");
            if (underscore < 0) return "";
            const prefix = base.slice(0, underscore);
            const tens = Math.floor(levelX / 26);
            let letters = String.fromCharCode(97 + (levelX - tens * 26));
            if (this.width >= 26) letters = String.fromCharCode(97 + (tens % 26)) + letters;
            let number = String(levelY + 1);
            if (this.height >= 10 && number.length < 2) number = "0" + number;
            if (this.height >= 100 && number.length < 3) number = "0" + number;
            return `${prefix}_${letters}-${number}${suffix}`;
        }

        ensureTerrain() {
            if (!this.width || !this.height) return false;
            if (this.levelHeight === 0) this.levelHeight = this.mapHeight * Math.pow(this.mapChaos, Math.log2(Math.max(2, this.width)));
            if (this.levelChaos === 0) this.levelChaos = this.mapChaos;
            const controls = (this.width + 1) * (this.height + 1);
            const seeds = this.width * this.height;
            if (this.heightMap.length !== controls || this.randomSeeds.length !== seeds) this.generateMapTerrain();
            this.generateMapBorders();
            this.generateAllLevels();
            this.recalculateExtents();
            return true;
        }

        generateMapTerrain() {
            if (!this.width || !this.height) return;
            this.heightMap = new Array((this.width + 1) * (this.height + 1)).fill(this.baseHeight);
            const random = new TerrainRandom(this.mapSeed);
            const stride = this.width + 1;
            if (!this.evenBorders) {
                this.generateMidpoint(this.heightMap, stride, random, this.mapChaos, this.mapHeight, 0, this.width, 0, 0);
                this.generateMidpoint(this.heightMap, stride, random, this.mapChaos, this.mapHeight, this.height, this.width, this.height, 0);
                this.generateMidpoint(this.heightMap, stride, random, this.mapChaos, this.mapHeight, this.height, 0, 0, 0);
                this.generateMidpoint(this.heightMap, stride, random, this.mapChaos, this.mapHeight, this.height, this.width, 0, this.width);
            }
            this.generateQuadrant(this.heightMap, stride, random, this.mapChaos, this.mapHeight, this.height, this.width, 0, 0);
            for (let index = 0; index < this.heightMap.length; index++) this.heightMap[index] = roundFloor(this.heightMap[index]);
            this.randomSeeds = new Array(this.width * this.height).fill(0);
            for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) this.randomSeeds[y * this.width + x] = Math.floor(random.drand() * 2147483647) >>> 0;
            this.hasTerrainData = true;
            this.modified = true;
        }

        generateMidpoint(values, stride, random, chaosScale, chaos, bottom, right, top, left) {
            if (right - left <= 1 && bottom - top <= 1) return;
            const middleX = Math.trunc((right + left) / 2), middleY = Math.trunc((bottom + top) / 2);
            values[middleY * stride + middleX] = (values[top * stride + left] + values[bottom * stride + right]) / 2 + (random.drand() - 0.5) * 2 * chaos;
            this.generateMidpoint(values, stride, random, chaosScale, chaos * chaosScale, middleY, middleX, top, left);
            this.generateMidpoint(values, stride, random, chaosScale, chaos * chaosScale, bottom, right, middleY, middleX);
        }

        generateQuadrant(values, stride, random, chaosScale, chaos, bottom, right, top, left) {
            if (right - left <= 1 && bottom - top <= 1) return;
            const middleX = Math.trunc((left + right) / 2), middleY = Math.trunc((top + bottom) / 2);
            this.generateMidpoint(values, stride, random, chaosScale, chaos, middleY, right, middleY, left);
            this.generateMidpoint(values, stride, random, chaosScale, chaos * chaosScale, middleY, middleX, top, middleX);
            this.generateMidpoint(values, stride, random, chaosScale, chaos * chaosScale, bottom, middleX, middleY, middleX);
            this.generateQuadrant(values, stride, random, chaosScale, chaos * chaosScale, middleY, middleX, top, left);
            this.generateQuadrant(values, stride, random, chaosScale, chaos * chaosScale, middleY, right, top, middleX);
            this.generateQuadrant(values, stride, random, chaosScale, chaos * chaosScale, bottom, middleX, middleY, left);
            this.generateQuadrant(values, stride, random, chaosScale, chaos * chaosScale, bottom, right, middleY, middleX);
        }

        generateMapBorders() {
            const horizontalStride = this.width * 64 + 1;
            this.horizontalBorders = new Array(horizontalStride * (this.height + 1)).fill(0);
            this.verticalBorders = new Array((this.height * 64 + 1) * (this.width + 1)).fill(0);
            const random = new TerrainRandom(this.mapSeed);
            const control = (x, y) => this.heightMap[y * (this.width + 1) + x];
            for (let x = 0; x <= this.width; x++) for (let y = 0; y <= this.height; y++) {
                this.horizontalBorders[y * horizontalStride + x * 64] = control(x, y);
                this.verticalBorders[y * 64 * (this.width + 1) + x] = control(x, y);
            }
            for (let x = 0; x <= this.width; x++) for (let y = 0; y <= this.height; y++) {
                if (x < this.width) this.generateMidpoint(this.horizontalBorders, horizontalStride, random, this.levelChaos, this.levelHeight, y, (x + 1) * 64, y, x * 64);
                if (y < this.height) this.generateMidpoint(this.verticalBorders, this.width + 1, random, this.levelChaos, this.levelHeight, (y + 1) * 64, x, y * 64, x);
            }
        }

        generateAllLevels() {
            this.levels = new Array(this.width * this.height);
            for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.levels[y * this.width + x] = this.generateLevel(x, y);
        }

        generateLevel(levelX, levelY) {
            const values = new Array(FIELD_SIDE * FIELD_SIDE).fill(0);
            const horizontalStride = this.width * 64 + 1;
            for (let tile = 0; tile <= 64; tile++) {
                values[tile] = this.horizontalBorders[levelY * horizontalStride + levelX * 64 + tile];
                values[64 * FIELD_SIDE + tile] = this.horizontalBorders[(levelY + 1) * horizontalStride + levelX * 64 + tile];
                values[tile * FIELD_SIDE] = this.verticalBorders[(levelY * 64 + tile) * (this.width + 1) + levelX];
                values[tile * FIELD_SIDE + 64] = this.verticalBorders[(levelY * 64 + tile) * (this.width + 1) + levelX + 1];
            }
            const random = new TerrainRandom(this.randomSeeds[levelY * this.width + levelX] || 0);
            this.generateQuadrant(values, FIELD_SIDE, random, this.levelChaos, this.levelHeight * this.levelChaos, 64, 64, 0, 0);
            const name = this.memberNames[levelY * this.width + levelX];
            const override = this.overrides.find(item => item.name === name);
            if (override) this.applyOverrides(values, override.samples);
            return values;
        }

        applyOverrides(values, overrides) {
            for (let cellX = 0; cellX < 8; cellX++) for (let cellY = 0; cellY < 8; cellY++) {
                const c00 = overrides[cellY * GRID_SIDE + cellX], c01 = overrides[(cellY + 1) * GRID_SIDE + cellX];
                const c10 = overrides[cellY * GRID_SIDE + cellX + 1], c11 = overrides[(cellY + 1) * GRID_SIDE + cellX + 1];
                const originX = cellX * 8, originY = cellY * 8;
                const endX = (cellX + 1) * 8 - (cellX < 7 ? 1 : 0), endY = (cellY + 1) * 8 - (cellY < 7 ? 1 : 0);
                if (c00 === c01 && c00 === c10 && c00 === c11) {
                    for (let y = originY; y <= endY; y++) for (let x = originX; x <= endX; x++) values[y * FIELD_SIDE + x] = c00;
                    continue;
                }
                const r00 = c00 - values[originY * FIELD_SIDE + originX], r01 = c01 - values[(originY + 8) * FIELD_SIDE + originX];
                const r10 = c10 - values[originY * FIELD_SIDE + originX + 8], r11 = c11 - values[(originY + 8) * FIELD_SIDE + originX + 8];
                for (let y = originY; y <= endY; y++) {
                    const offsetY = y - originY, left = r00 + (r01 - r00) * offsetY / 8, right = r10 + (r11 - r10) * offsetY / 8;
                    for (let x = originX; x <= endX; x++) values[y * FIELD_SIDE + x] += left + (right - left) * (x - originX) / 8;
                }
            }
        }

        recalculateExtents() {
            let minimum = Number.POSITIVE_INFINITY, maximum = Number.NEGATIVE_INFINITY;
            for (const level of this.levels) for (const value of level) { if (value < minimum) minimum = value; if (value > maximum) maximum = value; }
            if (!this.levels.length) minimum = maximum = 0;
            this.minimumHeight = minimum;
            this.maximumHeight = maximum;
        }

        sampleLevel(levelX, levelY, sampleX, sampleY) {
            if (!this.loaded || levelX < 0 || levelY < 0 || levelX >= this.width || levelY >= this.height) return 0;
            return this.levels[levelY * this.width + levelX][Math.max(0, Math.min(64, sampleY)) * FIELD_SIDE + Math.max(0, Math.min(64, sampleX))] || 0;
        }

        sampleGlobal(x, y) {
            if (!this.loaded || !this.levels.length) return 0;
            const sampleX = Math.max(0, Math.min(this.width * 64, Math.trunc(x))), sampleY = Math.max(0, Math.min(this.height * 64, Math.trunc(y)));
            const levelX = Math.min(this.width - 1, Math.floor(sampleX / 64)), levelY = Math.min(this.height - 1, Math.floor(sampleY / 64));
            return this.sampleLevel(levelX, levelY, sampleX - levelX * 64, sampleY - levelY * 64);
        }

        sampleGlobalInterpolated(x, y) {
            if (!this.loaded || !this.levels.length) return 0;
            const sampleX = Math.max(0, Math.min(this.width * 64, x)), sampleY = Math.max(0, Math.min(this.height * 64, y));
            const x0 = Math.floor(sampleX), y0 = Math.floor(sampleY), x1 = Math.min(x0 + 1, this.width * 64), y1 = Math.min(y0 + 1, this.height * 64);
            const tx = sampleX - x0, ty = sampleY - y0;
            const top = this.sampleGlobal(x0, y0) + (this.sampleGlobal(x1, y0) - this.sampleGlobal(x0, y0)) * tx;
            const bottom = this.sampleGlobal(x0, y1) + (this.sampleGlobal(x1, y1) - this.sampleGlobal(x0, y1)) * tx;
            return top + (bottom - top) * ty;
        }

        memberPosition(name) {
            const target = String(name || "").replace(/\\/g, "/").toLowerCase().split("/").pop();
            for (let index = 0; index < this.memberNames.length; index++) {
                const candidate = String(this.memberNames[index]).replace(/\\/g, "/").toLowerCase().split("/").pop();
                if (candidate === target) return { x: index % this.width, y: Math.floor(index / this.width), index };
            }
            return null;
        }

        setMapControl(x, y, value) {
            if (!this.loaded || x < 0 || y < 0 || x > this.width || y > this.height) return false;
            const index = y * (this.width + 1) + x;
            const height = Number(value);
            if (!Number.isFinite(height) || this.heightMap[index] === height) return false;
            this.heightMap[index] = height;
            this.generateMapBorders();
            this.generateAllLevels();
            this.recalculateExtents();
            this.modified = true;
            return true;
        }

        setHeightSpot(x, y, value) {
            if (!this.loaded || x < 0 || y < 0 || x > this.width * 64 || y > this.height * 64 || x % 8 !== 0 || y % 8 !== 0) return false;
            const height = Number(value);
            if (!Number.isFinite(height)) return false;
            const memberXs = [], memberYs = [];
            const baseX = Math.floor(x / 64), baseY = Math.floor(y / 64);
            if (baseX < this.width) memberXs.push(baseX);
            if (x % 64 === 0 && baseX > 0) memberXs.push(baseX - 1);
            if (baseY < this.height) memberYs.push(baseY);
            if (y % 64 === 0 && baseY > 0) memberYs.push(baseY - 1);
            let changed = false;
            for (const memberX of memberXs) for (const memberY of memberYs) {
                const memberIndex = memberY * this.width + memberX;
                if (memberIndex >= this.memberNames.length) continue;
                let override = this.overrides.find(item => item.name === this.memberNames[memberIndex]);
                if (!override) {
                    const samples = new Float64Array(GRID_SIDE * GRID_SIDE);
                    for (let sampleY = 0; sampleY < GRID_SIDE; sampleY++) for (let sampleX = 0; sampleX < GRID_SIDE; sampleX++) samples[sampleY * GRID_SIDE + sampleX] = this.sampleLevel(memberX, memberY, sampleX * 8, sampleY * 8);
                    override = { name: this.memberNames[memberIndex], samples };
                    this.overrides.push(override);
                }
                const localX = Math.floor((x - memberX * 64) / 8), localY = Math.floor((y - memberY * 64) / 8);
                const sample = localY * GRID_SIDE + localX;
                if (override.samples[sample] === height) continue;
                override.samples[sample] = height;
                this.levels[memberIndex] = this.generateLevel(memberX, memberY);
                changed = true;
            }
            if (changed) { this.recalculateExtents(); this.modified = true; }
            return changed;
        }

        setSettings(settings = {}) {
            if (!this.loaded) return false;
            if (settings.mapSeed !== undefined) this.mapSeed = parseSeed(settings.mapSeed);
            if (settings.baseHeight !== undefined) this.baseHeight = parseNumber(settings.baseHeight);
            if (settings.evenBorders !== undefined) this.evenBorders = !!settings.evenBorders;
            if (settings.mapHeight !== undefined) this.mapHeight = parseNumber(settings.mapHeight);
            if (settings.mapChaos !== undefined) this.mapChaos = parseNumber(settings.mapChaos, 0.6);
            if (settings.levelHeight !== undefined) this.levelHeight = parseNumber(settings.levelHeight);
            if (settings.levelChaos !== undefined) this.levelChaos = parseNumber(settings.levelChaos, 0.6);
            this.hasTerrainData = true;
            this.modified = true;
            return true;
        }

        regenerate(generateMap = false) {
            if (!this.loaded || !this.width || !this.height) return false;
            if (this.levelHeight === 0) this.levelHeight = this.mapHeight * Math.pow(this.mapChaos, Math.log2(Math.max(2, this.width)));
            if (this.levelChaos === 0) this.levelChaos = this.mapChaos;
            if (generateMap) this.generateMapTerrain();
            this.generateMapBorders();
            this.generateAllLevels();
            this.recalculateExtents();
            this.modified = true;
            this.hasTerrainData = true;
            return true;
        }

        shiftAll(delta) {
            if (!this.loaded || !Number.isFinite(Number(delta)) || Number(delta) === 0) return false;
            const shift = Number(delta);
            for (let index = 0; index < this.heightMap.length; index++) this.heightMap[index] += shift;
            for (const override of this.overrides) for (let index = 0; index < override.samples.length; index++) override.samples[index] += shift;
            this.generateMapBorders();
            this.generateAllLevels();
            this.recalculateExtents();
            this.modified = true;
            return true;
        }

        clearOverrides() {
            if (!this.overrides.length) return false;
            this.overrides = [];
            this.generateAllLevels();
            this.recalculateExtents();
            this.modified = true;
            return true;
        }

        saveText() {
            if (!this.loaded) return this.originalText;
            if (!this.hasTerrainData && !this.modified) return this.originalText;
            const newline = this.lineEnding;
            const sourceLines = this.originalText.replace(/\r\n/g, "\n").split("\n");
            const kept = [];
            let section = null;
            for (const raw of sourceLines) {
                const clean = raw.trim();
                if (section) { if (clean === section + "END") section = null; continue; }
                if (clean === "HEIGHTMAP" || clean === "RANDOMSEEDS") { section = clean; continue; }
                if (clean === "HEIGHTS" || clean.startsWith("HEIGHTS ") || clean.startsWith("HEIGHTS\t")) { section = "HEIGHTS"; continue; }
                if (/^(GENSEED|GENBASE|GENEVENBORDERS|GENHEIGHT|GENCHAOS|LEVHEIGHT|LEVCHAOS)(\s|$)/.test(clean)) continue;
                kept.push(raw);
            }
            const headerIndex = kept.findIndex((line, index) => index > 0 && /^\s*HEIGHT(\s|$)/.test(line));
            const insert = [];
            insert.push(`GENSEED ${this.mapSeed}`);
            insert.push(`GENBASE ${this.formatNumber(this.baseHeight)}`);
            insert.push(`GENEVENBORDERS ${this.evenBorders ? "true" : "false"}`);
            insert.push(`GENHEIGHT ${this.formatNumber(this.mapHeight)}`);
            insert.push(`GENCHAOS ${this.formatNumber(this.mapChaos)}`);
            insert.push(`LEVHEIGHT ${this.formatNumber(this.levelHeight)}`);
            insert.push(`LEVCHAOS ${this.formatNumber(this.levelChaos)}`);
            if (headerIndex >= 0) kept.splice(headerIndex + 1, 0, ...insert); else kept.splice(1, 0, ...insert);
            while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
            const output = kept.slice();
            output.push("HEIGHTMAP");
            for (let y = 0; y <= this.height; y++) output.push(Array.from({ length: this.width + 1 }, (_, x) => this.formatNumber(this.heightMap[y * (this.width + 1) + x] || 0)).join(","));
            output.push("HEIGHTMAPEND");
            output.push("RANDOMSEEDS");
            for (let y = 0; y < this.height; y++) output.push(Array.from({ length: this.width }, (_, x) => String(this.randomSeeds[y * this.width + x] >>> 0)).join(","));
            output.push("RANDOMSEEDSEND");
            for (const override of this.overrides) {
                output.push("");
                output.push(`HEIGHTS ${override.name} 8 8`);
                for (let row = 0; row < GRID_SIDE; row++) output.push(Array.from({ length: GRID_SIDE }, (_, column) => this.formatNumber(override.samples[row * GRID_SIDE + column])).join(" "));
                output.push("HEIGHTSEND");
            }
            return output.join(newline) + newline;
        }

        formatNumber(value) {
            if (!Number.isFinite(value) || Math.abs(value) < ZERO_LIMIT) return "0";
            return String(value);
        }

        getCorners(levelX, levelY, tileX, tileY) {
            const field = this.levels[levelY * this.width + levelX];
            if (!field) return [0, 0, 0, 0];
            const index = tileY * FIELD_SIDE + tileX;
            return [field[index], field[index + 1], field[index + FIELD_SIDE], field[index + FIELD_SIDE + 1]];
        }
    }

    return { TerrainMap, TerrainRandom, GRID_SIDE, FIELD_SIDE };
});
