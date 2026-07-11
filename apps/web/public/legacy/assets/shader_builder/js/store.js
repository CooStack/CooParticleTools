import {
    DEFAULT_MODEL_FRAGMENT,
    DEFAULT_MODEL_VERTEX,
    DEFAULT_POST_FRAGMENT,
    DEFAULT_POST_VERTEX,
    DEFAULT_SETTINGS,
    createDefaultModelParams,
    createDefaultPostParams
} from "./constants.js";
import { deepClone, uid } from "./utils.js";

export const GRAPH_INPUT_ID = "__input__";
export const GRAPH_OUTPUT_ID = "__output__";
export const POST_INPUT_SAMPLER_NAME = "samp";
export const MODEL_BUILDER_DEFAULT_KIND = "box";
export const MODEL_BUILDER_KINDS = ["plane", "box", "sphere", "disc", "ring"];

export function getPostInputTextureMinCount(rawInputs = 1) {
    const n = Number(rawInputs);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(8, Math.round(n)));
}

export function sanitizeNodeNameForPath(name) {
    const raw = String(name || "").trim();
    const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return safe || "pass";
}

export function normalizeNodePathTemplate(template, fallback = "core/post/{name}.fsh") {
    const raw = String(template || "").trim().replaceAll("\\", "/");
    const source = raw || fallback;
    const parts = source.split("/").map((part) => {
        const p = String(part || "").trim();
        if (!p) return "";
        const tokenized = p.replaceAll("{name}", "__NODE_NAME__");
        return tokenized.replace(/[^a-zA-Z0-9_.\-]/g, "_").replaceAll("__NODE_NAME__", "{name}");
    }).filter(Boolean);
    const joined = parts.join("/");
    return joined || fallback;
}

export function resolveNodeFragmentPath(name, template = "core/post/{name}.fsh") {
    const safeName = sanitizeNodeNameForPath(name);
    let tmpl = normalizeNodePathTemplate(template);
    if (!tmpl.includes("{name}")) {
        tmpl = `${tmpl.replace(/\.fsh$/i, "").replace(/\/+$/g, "")}/{name}.fsh`;
    }
    let path = tmpl.replaceAll("{name}", safeName);
    if (!/\.fsh$/i.test(path)) path += ".fsh";
    return path;
}

export function createDefaultPostNode(index = 0) {
    const name = `Pass_${index + 1}`;
    const fragmentPathTemplate = "core/post/{name}.fsh";
    return {
        id: uid("pipe"),
        name,
        type: "simple",
        x: 220 + index * 220,
        y: 80 + (index % 3) * 110,
        vertexSource: DEFAULT_POST_VERTEX,
        fragmentSource: DEFAULT_POST_FRAGMENT,
        vertexPath: "pipe/vertexes/screen.vsh",
        fragmentPathTemplate,
        fragmentPath: resolveNodeFragmentPath(name, fragmentPathTemplate),
        params: ensurePostInputSamplerParam(createDefaultPostParams(), 1),
        inputs: 1,
        outputs: 1,
        textureUnit: 1,
        filter: "GL33.GL_LINEAR",
        iterations: 4,
        useMipmap: false
    };
}

export function createDefaultState() {
    const firstNode = createDefaultPostNode(0);
    return {
        version: 1,
        projectName: "shader-workbench",
        settings: deepClone(DEFAULT_SETTINGS),
        model: {
            primitive: "sphere",
            uploadedModelName: "",
            enablePost: true,
            builder: {
                enabled: false,
                steps: []
            },
            shader: {
                vertexPath: "core/vertex/point.vsh",
                fragmentPath: "core/fragment/color.fsh",
                vertexSource: DEFAULT_MODEL_VERTEX,
                fragmentSource: DEFAULT_MODEL_FRAGMENT,
                params: createDefaultModelParams()
            }
        },
        textures: [],
        post: {
            nodes: [firstNode],
            links: [
                { id: uid("link"), fromNode: GRAPH_INPUT_ID, fromSlot: 0, toNode: firstNode.id, toSlot: 0 },
                { id: uid("link"), fromNode: firstNode.id, fromSlot: 0, toNode: GRAPH_OUTPUT_ID, toSlot: 0 }
            ],
            systemNodePositions: {
                [GRAPH_INPUT_ID]: null,
                [GRAPH_OUTPUT_ID]: null
            },
            systemNodeUserMoved: {
                [GRAPH_INPUT_ID]: false,
                [GRAPH_OUTPUT_ID]: false
            }
        },
        selectedNodeId: firstNode.id
    };
}

export function isPostInputSamplerParam(param) {
    return isTextureParam(param);
}

export function isTextureParam(param) {
    const type = String(param?.type || "").trim().toLowerCase();
    return type === "texture";
}

export function countTextureParams(params = []) {
    let count = 0;
    for (const p of params || []) {
        if (isTextureParam(p)) count += 1;
    }
    return count;
}

function defaultPostTextureParamName(index = 0) {
    if (index <= 0) return POST_INPUT_SAMPLER_NAME;
    return `${POST_INPUT_SAMPLER_NAME}${index + 1}`;
}

function normalizeFiniteNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function normalizeFiniteInt(value, fallback = 0, min = -Infinity, max = Infinity) {
    return Math.round(normalizeFiniteNumber(value, fallback, min, max));
}

function normalizeModelBuilderKind(kind) {
    const k = String(kind || "").trim().toLowerCase();
    return MODEL_BUILDER_KINDS.includes(k) ? k : MODEL_BUILDER_DEFAULT_KIND;
}

function normalizeBuilderColor(value) {
    const raw = String(value || "").trim();
    const parts = raw.split(",").map((part) => Number(part.trim()));
    const fallback = [1, 1, 1, 1];
    const out = fallback.map((v, index) => {
        const n = parts[index];
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : v;
    });
    return out.join(",");
}

export function createDefaultModelBuilderStep(index = 0, kind = MODEL_BUILDER_DEFAULT_KIND) {
    const normalizedKind = normalizeModelBuilderKind(kind);
    return {
        id: uid("shape"),
        name: `${normalizedKind}_${index + 1}`,
        kind: normalizedKind,
        width: 1,
        height: 1,
        depth: 1,
        radius: 1,
        innerRadius: 0.55,
        outerRadius: 1,
        segments: 32,
        latSegments: 12,
        lonSegments: 24,
        x: 0,
        y: 0,
        z: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        color: "1,1,1,1"
    };
}

export function normalizeModelBuilderStep(step, index = 0) {
    const base = createDefaultModelBuilderStep(index, step?.kind);
    const merged = Object.assign({}, base, step || {});
    const kind = normalizeModelBuilderKind(merged.kind);
    return {
        id: String(merged.id || base.id),
        name: String(merged.name || `${kind}_${index + 1}`).trim() || `${kind}_${index + 1}`,
        kind,
        width: normalizeFiniteNumber(merged.width, base.width, 0.001, 1000),
        height: normalizeFiniteNumber(merged.height, base.height, 0.001, 1000),
        depth: normalizeFiniteNumber(merged.depth, base.depth, 0.001, 1000),
        radius: normalizeFiniteNumber(merged.radius, base.radius, 0.001, 1000),
        innerRadius: normalizeFiniteNumber(merged.innerRadius, base.innerRadius, 0, 1000),
        outerRadius: normalizeFiniteNumber(merged.outerRadius, base.outerRadius, 0.001, 1000),
        segments: normalizeFiniteInt(merged.segments, base.segments, 3, 256),
        latSegments: normalizeFiniteInt(merged.latSegments, base.latSegments, 2, 128),
        lonSegments: normalizeFiniteInt(merged.lonSegments, base.lonSegments, 3, 256),
        x: normalizeFiniteNumber(merged.x, base.x, -1000, 1000),
        y: normalizeFiniteNumber(merged.y, base.y, -1000, 1000),
        z: normalizeFiniteNumber(merged.z, base.z, -1000, 1000),
        rotX: normalizeFiniteNumber(merged.rotX, base.rotX, -3600, 3600),
        rotY: normalizeFiniteNumber(merged.rotY, base.rotY, -3600, 3600),
        rotZ: normalizeFiniteNumber(merged.rotZ, base.rotZ, -3600, 3600),
        scaleX: normalizeFiniteNumber(merged.scaleX, base.scaleX, -1000, 1000),
        scaleY: normalizeFiniteNumber(merged.scaleY, base.scaleY, -1000, 1000),
        scaleZ: normalizeFiniteNumber(merged.scaleZ, base.scaleZ, -1000, 1000),
        color: normalizeBuilderColor(merged.color)
    };
}

export function normalizeModelBuilderState(state) {
    if (!state || typeof state !== "object") return;
    if (!state.model || typeof state.model !== "object") state.model = {};
    const raw = state.model.builder && typeof state.model.builder === "object"
        ? state.model.builder
        : {};
    const steps = Array.isArray(raw.steps)
        ? raw.steps.map((step, index) => normalizeModelBuilderStep(step, index))
        : [];
    state.model.builder = {
        enabled: !!raw.enabled,
        steps
    };
}

export function dedupeShaderParams(params = []) {
    const out = [];
    const seenNamed = new Set();
    for (const param of Array.isArray(params) ? params : []) {
        const copy = Object.assign({}, param || {});
        const name = String(copy.name || "").trim();
        if (name) {
            if (seenNamed.has(name)) continue;
            seenNamed.add(name);
            copy.name = name;
        }
        out.push(copy);
    }
    return out;
}

function normalizePostInputSamplerParam(param, textureIndex = 0) {
    const base = Object.assign(createParamTemplate(), param || {});
    const name = String(base.name || "").trim();
    base.name = name || defaultPostTextureParamName(textureIndex);
    base.type = "texture";
    base.valueSource = "value";
    base.valueExpr = "";
    // Post pass samplers are bound from graph input slots (input slot N).
    base.sourceType = "connection";
    base.connection = "";
    base.textureId = "";
    if (!String(base.value || "").trim()) base.value = "0";
    return base;
}

export function ensurePostInputSamplerParam(params = [], requiredCount = 1) {
    const minCount = getPostInputTextureMinCount(requiredCount);
    const list = dedupeShaderParams(Array.isArray(params) ? params.map((p) => Object.assign({}, p || {})) : []);
    const out = [];
    const textureNames = new Set();
    let textureIndex = 0;

    for (const p of list) {
        const copy = Object.assign({}, p || {});
        if (isTextureParam(copy)) {
            const normalized = normalizePostInputSamplerParam(copy, textureIndex);
            const textureName = String(normalized.name || "").trim();
            if (textureName && textureNames.has(textureName)) continue;
            if (textureName) textureNames.add(textureName);
            out.push(normalized);
            textureIndex += 1;
            continue;
        }
        out.push(copy);
    }

    while (textureIndex < minCount) {
        let normalized = normalizePostInputSamplerParam(null, textureIndex);
        while (textureNames.has(String(normalized.name || "").trim())) {
            textureIndex += 1;
            normalized = normalizePostInputSamplerParam(null, textureIndex);
        }
        textureNames.add(String(normalized.name || "").trim());
        out.push(normalized);
        textureIndex += 1;
    }

    return out;
}

function normalizePostGraphState(state) {
    if (!state || typeof state !== "object") return;
    normalizeModelBuilderState(state);
    if (!state.post || typeof state.post !== "object") state.post = {};
    if (!Array.isArray(state.post.nodes)) state.post.nodes = [];
    if (!Array.isArray(state.post.links)) state.post.links = [];
    if (!state.post.systemNodePositions || typeof state.post.systemNodePositions !== "object") {
        state.post.systemNodePositions = {};
    }
    if (!state.post.systemNodeUserMoved || typeof state.post.systemNodeUserMoved !== "object") {
        state.post.systemNodeUserMoved = {};
    }
    for (const id of [GRAPH_INPUT_ID, GRAPH_OUTPUT_ID]) {
        const raw = state.post.systemNodePositions[id];
        const x = Number(raw?.x);
        const y = Number(raw?.y);
        state.post.systemNodePositions[id] = Number.isFinite(x) && Number.isFinite(y)
            ? { x, y }
            : null;
        state.post.systemNodeUserMoved[id] = !!state.post.systemNodeUserMoved[id];
    }

    const nodes = state.post.nodes;
    for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const nodeType = String(node.type || "simple").trim().toLowerCase();
        const normalizedType = nodeType === "pingpong" ? "pingpong" : (nodeType === "texture" ? "texture" : "simple");
        node.type = normalizedType;
        if (normalizedType === "texture") {
            node.inputs = 0;
            node.outputs = 1;
            const textureOnly = Array.isArray(node.params)
                ? node.params.filter((p) => isTextureParam(p))
                : [];
            const base = Object.assign(createParamTemplate(), textureOnly[0] || {});
            base.type = "texture";
            base.sourceType = "upload";
            base.connection = "";
            base.valueSource = "value";
            base.valueExpr = "";
            base.textureId = String(base.textureId || "");
            if (!String(base.value ?? "").trim()) base.value = "0";
            node.params = [base];
            continue;
        }
        const inputCount = Math.max(1, Math.min(8, Math.round(Number(node.inputs || 1))));
        node.inputs = inputCount;
        node.outputs = Math.max(1, Math.min(8, Math.round(Number(node.outputs || 1))));
        const minTextureCount = getPostInputTextureMinCount(inputCount);
        node.params = ensurePostInputSamplerParam(node.params, minTextureCount);
    }
    const nodeIds = new Set(nodes.map((n) => String(n?.id || "")).filter(Boolean));
    const dedup = new Set();
    const links = [];

    for (const link of state.post.links) {
        const fromNode = String(link?.fromNode || "");
        const toNode = String(link?.toNode || "");
        if (!fromNode || !toNode) continue;

        const fromValid = fromNode === GRAPH_INPUT_ID || nodeIds.has(fromNode);
        const toValid = toNode === GRAPH_OUTPUT_ID || nodeIds.has(toNode);
        if (!fromValid || !toValid) continue;

        let fromSlot = Math.max(0, Math.round(Number(link?.fromSlot || 0)));
        let toSlot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
        if (fromNode === GRAPH_INPUT_ID) fromSlot = 0;
        if (toNode === GRAPH_OUTPUT_ID) toSlot = 0;
        const key = `${fromNode}:${fromSlot}->${toNode}:${toSlot}`;
        if (dedup.has(key)) continue;
        dedup.add(key);
        links.push({
            id: String(link?.id || uid("link")),
            fromNode,
            fromSlot,
            toNode,
            toSlot
        });
    }

    if (!nodes.length) {
        const hasDirect = links.some((l) => l.fromNode === GRAPH_INPUT_ID && l.toNode === GRAPH_OUTPUT_ID);
        state.post.links = hasDirect ? links : [{
            id: uid("link"),
            fromNode: GRAPH_INPUT_ID,
            fromSlot: 0,
            toNode: GRAPH_OUTPUT_ID,
            toSlot: 0
        }];
        state.selectedNodeId = null;
        return;
    }

    state.post.links = links;
}

export function createStore(initialState = createDefaultState()) {
    let state = deepClone(initialState);
    normalizePostGraphState(state);
    const listeners = new Set();
    const undoStack = [];
    const redoStack = [];
    const HISTORY_LIMIT = 120;

    function getState() {
        return state;
    }

    function setState(nextState, meta = {}) {
        normalizePostGraphState(nextState);
        state = nextState;
        for (const listener of listeners) {
            try {
                listener(state, meta);
            } catch (err) {
                console.error("store listener error", err);
            }
        }
    }

    function pushHistorySnapshot(snapshot) {
        undoStack.push(snapshot);
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }

    function commit(nextState, meta = {}) {
        if (meta.clearHistory) {
            undoStack.length = 0;
            redoStack.length = 0;
        }
        if (!meta.skipHistory) {
            pushHistorySnapshot(deepClone(state));
            redoStack.length = 0;
        }
        setState(nextState, meta);
    }

    function patch(mutator, meta = {}) {
        const draft = deepClone(state);
        mutator(draft);
        commit(draft, meta);
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function reset(nextInitial = createDefaultState(), meta = { reason: "reset" }) {
        commit(deepClone(nextInitial), meta);
    }

    function canUndo() {
        return undoStack.length > 0;
    }

    function canRedo() {
        return redoStack.length > 0;
    }

    function undo(meta = { reason: "undo" }) {
        if (!undoStack.length) return false;
        const prev = undoStack.pop();
        redoStack.push(deepClone(state));
        setState(prev, Object.assign({}, meta, { skipHistory: true }));
        return true;
    }

    function redo(meta = { reason: "redo" }) {
        if (!redoStack.length) return false;
        const next = redoStack.pop();
        undoStack.push(deepClone(state));
        setState(next, Object.assign({}, meta, { skipHistory: true }));
        return true;
    }

    function clearHistory() {
        undoStack.length = 0;
        redoStack.length = 0;
    }

    return {
        getState,
        setState,
        patch,
        subscribe,
        reset,
        canUndo,
        canRedo,
        undo,
        redo,
        clearHistory
    };
}

export function findPostNode(state, nodeId) {
    return state.post.nodes.find((n) => n.id === nodeId) || null;
}

export function removeNodeAndLinks(state, nodeId) {
    state.post.nodes = state.post.nodes.filter((n) => n.id !== nodeId);
    state.post.links = state.post.links.filter((l) => l.fromNode !== nodeId && l.toNode !== nodeId);
    if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
}

export function ensureSelectedNode(state) {
    if (state.selectedNodeId && state.post.nodes.some((n) => n.id === state.selectedNodeId)) return;
    state.selectedNodeId = state.post.nodes[0]?.id || null;
}

export function createParamTemplate() {
    return {
        id: uid("param"),
        name: "uParam",
        type: "float",
        value: "1.0",
        valueSource: "value",
        valueExpr: "uTime",
        sourceType: "value",
        textureId: "",
        connection: ""
    };
}
