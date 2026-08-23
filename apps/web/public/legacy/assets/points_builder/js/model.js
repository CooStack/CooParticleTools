const OFFSET_KINDS = new Set([
    "add_builder",
    "add_with",
    "add_circle",
    "add_discrete_circle_xz",
    "add_half_circle",
    "add_radian_center",
    "add_radian",
    "add_ball",
    "add_ball_surface",
    "add_ball_solid",
    "add_ball_volume",
    "add_cube_surface",
    "add_polygon",
    "add_polygon_in_circle",
    "add_round_shape",
    "add_fourier_series"
]);

let fallbackIdSequence = 0;

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function getStateSource(source) {
    if (Array.isArray(source)) return { root: { children: source } };
    if (!source || typeof source !== "object") return {};
    if (source.root && typeof source.root === "object") return source;
    if (source.state && source.state.root && typeof source.state.root === "object") return source.state;
    if (Array.isArray(source.children)) {
        const state = { ...source, root: { children: source.children } };
        delete state.children;
        return state;
    }
    if (Array.isArray(source.nodes)) {
        const state = { ...source, root: { children: source.nodes } };
        delete state.nodes;
        return state;
    }
    return source;
}

function getIdFactory(options) {
    return typeof options?.idFactory === "function"
        ? options.idFactory
        : createPointsBuilderId;
}

function makeUniqueId(usedIds, options) {
    const idFactory = getIdFactory(options);
    for (let attempt = 0; attempt < 1024; attempt++) {
        const candidate = String(idFactory() || "").trim();
        if (!candidate || usedIds.has(candidate)) continue;
        usedIds.add(candidate);
        return candidate;
    }

    let candidate = "";
    do {
        fallbackIdSequence += 1;
        candidate = `pb_${Date.now().toString(36)}_${fallbackIdSequence.toString(36)}`;
    } while (usedIds.has(candidate));
    usedIds.add(candidate);
    return candidate;
}

function normalizeLegacyVecParams(params, prefix, objectKey = null) {
    if (!params || typeof params !== "object") return;
    const px = `${prefix}x`;
    const py = `${prefix}y`;
    const pz = `${prefix}z`;
    if (params[px] !== undefined || params[py] !== undefined || params[pz] !== undefined) return;
    const raw = params[objectKey || prefix];
    if (!raw) return;

    if (Array.isArray(raw)) {
        if (raw[0] !== undefined) params[px] = raw[0];
        if (raw[1] !== undefined) params[py] = raw[1];
        if (raw[2] !== undefined) params[pz] = raw[2];
        return;
    }
    if (typeof raw === "object") {
        if (raw.x !== undefined) params[px] = raw.x;
        if (raw.y !== undefined) params[py] = raw.y;
        if (raw.z !== undefined) params[pz] = raw.z;
    }
}

function numericValue(value, options) {
    if (typeof options?.toNumber === "function") return options.toNumber(value);
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeNodeParams(node, options) {
    if (!node || typeof node !== "object" || !node.kind) return;
    if (!node.params || typeof node.params !== "object" || Array.isArray(node.params)) node.params = {};
    if (node.kind === "with_builder") node.kind = "add_builder";
    if (OFFSET_KINDS.has(node.kind)) {
        if (node.params.ox === undefined) node.params.ox = 0;
        if (node.params.oy === undefined) node.params.oy = 0;
        if (node.params.oz === undefined) node.params.oz = 0;
    }
    if (node.kind === "add_with" && node.params.previewBeforeOffsetEnabled === undefined) {
        node.params.previewBeforeOffsetEnabled = false;
    }

    const params = node.params;
    switch (node.kind) {
        case "add_bezier":
            normalizeLegacyVecParams(params, "p1");
            normalizeLegacyVecParams(params, "p2");
            normalizeLegacyVecParams(params, "p3");
            if (params.count === undefined && params.counts !== undefined) params.count = params.counts;
            break;
        case "add_bezier_4":
            normalizeLegacyVecParams(params, "s", "start");
            normalizeLegacyVecParams(params, "e", "end");
            normalizeLegacyVecParams(params, "sh", "startHandle");
            normalizeLegacyVecParams(params, "eh", "endHandle");
            if (params.sx === undefined && params.p1x !== undefined) params.sx = params.p1x;
            if (params.sy === undefined && params.p1y !== undefined) params.sy = params.p1y;
            if (params.sz === undefined && params.p1z !== undefined) params.sz = params.p1z;
            if (params.ex === undefined && params.p4x !== undefined) params.ex = params.p4x;
            if (params.ey === undefined && params.p4y !== undefined) params.ey = params.p4y;
            if (params.ez === undefined && params.p4z !== undefined) params.ez = params.p4z;
            if (params.shx === undefined && params.p1x !== undefined && params.p2x !== undefined) {
                params.shx = numericValue(params.p2x, options) - numericValue(params.p1x, options);
            }
            if (params.shy === undefined && params.p1y !== undefined && params.p2y !== undefined) {
                params.shy = numericValue(params.p2y, options) - numericValue(params.p1y, options);
            }
            if (params.shz === undefined && params.p1z !== undefined && params.p2z !== undefined) {
                params.shz = numericValue(params.p2z, options) - numericValue(params.p1z, options);
            }
            if (params.ehx === undefined && params.p4x !== undefined && params.p3x !== undefined) {
                params.ehx = numericValue(params.p3x, options) - numericValue(params.p4x, options);
            }
            if (params.ehy === undefined && params.p4y !== undefined && params.p3y !== undefined) {
                params.ehy = numericValue(params.p3y, options) - numericValue(params.p4y, options);
            }
            if (params.ehz === undefined && params.p4z !== undefined && params.p3z !== undefined) {
                params.ehz = numericValue(params.p3z, options) - numericValue(params.p4z, options);
            }
            if (params.count === undefined && params.counts !== undefined) params.count = params.counts;
            break;
        case "add_bezier_curve":
            normalizeLegacyVecParams(params, "e", "target");
            normalizeLegacyVecParams(params, "sh", "startHandle");
            normalizeLegacyVecParams(params, "eh", "endHandle");
            if (params.ex === undefined && params.tx !== undefined) params.ex = params.tx;
            if (params.ey === undefined && params.ty !== undefined) params.ey = params.ty;
            if (params.ez === undefined && params.tz !== undefined) params.ez = params.tz;
            if (params.ex === undefined && params.target && typeof params.target === "object") params.ex = params.target.x ?? params.target[0];
            if (params.ey === undefined && params.target && typeof params.target === "object") params.ey = params.target.y ?? params.target[1];
            if (params.ez === undefined && params.target && typeof params.target === "object") params.ez = params.target.z ?? params.target[2];
            if (params.shx === undefined && params.startHandle && typeof params.startHandle === "object") params.shx = params.startHandle.x ?? params.startHandle[0];
            if (params.shy === undefined && params.startHandle && typeof params.startHandle === "object") params.shy = params.startHandle.y ?? params.startHandle[1];
            if (params.shz === undefined && params.startHandle && typeof params.startHandle === "object") params.shz = params.startHandle.z ?? params.startHandle[2];
            if (params.ehx === undefined && params.endHandle && typeof params.endHandle === "object") params.ehx = params.endHandle.x ?? params.endHandle[0];
            if (params.ehy === undefined && params.endHandle && typeof params.endHandle === "object") params.ehy = params.endHandle.y ?? params.endHandle[1];
            if (params.ehz === undefined && params.endHandle && typeof params.endHandle === "object") params.ehz = params.endHandle.z ?? params.endHandle[2];
            break;
        case "add_polygon":
            if (params.count === undefined && params.edgeCount !== undefined) params.count = params.edgeCount;
            if (params.sideCount === undefined && params.n !== undefined) params.sideCount = params.n;
            break;
        case "add_polygon_in_circle":
            if (params.edgeCount === undefined && params.count !== undefined) params.edgeCount = params.count;
            if (params.n === undefined && params.sideCount !== undefined) params.n = params.sideCount;
            break;
        case "add_ball":
            if (params.countPow === undefined && params.count !== undefined) params.countPow = params.count;
            break;
        case "add_ball_surface":
        case "add_ball_solid":
        case "add_ball_volume":
            if (params.count === undefined) params.count = 600;
            break;
        case "add_cube_surface": {
            const hasDimensions = params.width !== undefined || params.height !== undefined || params.depth !== undefined;
            if (params.sizeMode !== "uniform" && params.sizeMode !== "dimensions") {
                params.sizeMode = hasDimensions ? "dimensions" : "uniform";
            }
            if (params.size === undefined) params.size = 2;
            if (params.width === undefined) params.width = params.size;
            if (params.height === undefined) params.height = params.size;
            if (params.depth === undefined) params.depth = params.size;
            if (params.count === undefined) params.count = 600;
            break;
        }
        case "add_round_shape":
            if (params.preCircleCount === undefined && params.circleCount !== undefined) params.preCircleCount = params.circleCount;
            if (params.minCircleCount === undefined && params.minCount !== undefined) params.minCircleCount = params.minCount;
            if (params.maxCircleCount === undefined && params.maxCount !== undefined) params.maxCircleCount = params.maxCount;
            break;
        case "add_lightning_points":
        case "add_lightning_nodes":
        case "add_lightning_nodes_attenuation":
            normalizeLegacyVecParams(params, "s", "start");
            normalizeLegacyVecParams(params, "e", "end");
            if (params.useStart === undefined && (params.start || params.sx !== undefined || params.sy !== undefined || params.sz !== undefined)) {
                params.useStart = true;
            }
            if (params.useOffsetRange === undefined && params.offsetRange !== undefined) {
                params.useOffsetRange = true;
            }
            break;
        default:
            break;
    }
}

function normalizeFourierTerms(node) {
    if (node.kind !== "add_fourier_series") return;
    if (!Array.isArray(node.terms)) node.terms = [];
    const terms = node.terms.filter((term) => term && typeof term === "object");
    node.terms.splice(0, node.terms.length, ...terms);
    for (const term of node.terms) {
        if (term.r === undefined) term.r = 1;
        if (term.w === undefined) term.w = 1;
        if (term.startAngle === undefined) term.startAngle = 0;
        if (!term.startAngleUnit) term.startAngleUnit = "deg";
        if (term.collapsed === undefined) term.collapsed = false;
        if (term.bodyHeight === undefined) term.bodyHeight = null;
    }
}

function normalizeNodeDeep(node, options) {
    if (!node || typeof node !== "object") return;
    if (node.kind !== "ROOT") {
        normalizeNodeParams(node, options);
        node.children = Array.isArray(node.children) ? node.children : [];
        node.terms = Array.isArray(node.terms) ? node.terms : [];
        normalizeFourierTerms(node);
    } else if (!Array.isArray(node.children)) {
        node.children = [];
    }
    for (const child of node.children || []) normalizeNodeDeep(child, options);
}

export function createPointsBuilderId() {
    return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
}

export function createPointsBuilderNode(kind = "add_point", init = {}, options = {}) {
    const source = init && typeof init === "object" ? cloneJson(init) : {};
    const defaults = options.defaultParams && typeof options.defaultParams === "object"
        ? cloneJson(options.defaultParams)
        : {};
    const sourceParams = source.params && typeof source.params === "object" && !Array.isArray(source.params)
        ? source.params
        : null;
    const params = options.mergeDefaultParams === false && sourceParams
        ? sourceParams
        : { ...defaults, ...(sourceParams || {}) };
    const generatedId = source.id ? String(source.id) : makeUniqueId(new Set(), options);
    const node = {
        id: generatedId,
        kind: String(kind || source.kind || "add_point"),
        folded: source.folded === undefined ? false : !!source.folded,
        collapsed: source.collapsed === undefined ? false : source.collapsed,
        bodyHeight: source.bodyHeight ?? null,
        subWidth: source.subWidth ?? null,
        subHeight: source.subHeight ?? null,
        params,
        children: Array.isArray(source.children) ? source.children : [],
        terms: Array.isArray(source.terms) ? source.terms : [],
        ...source,
        params
    };
    node.id = String(node.id || generatedId);
    node.kind = String(node.kind || kind || "add_point");
    node.folded = !!node.folded;
    node.params = node.params && typeof node.params === "object" && !Array.isArray(node.params) ? node.params : params;
    node.children = Array.isArray(node.children) ? node.children : [];
    node.terms = Array.isArray(node.terms) ? node.terms : [];
    return node;
}

export function collectPointsBuilderIds(target) {
    const ids = new Set();
    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        const id = String(node.id || "").trim();
        if (id) ids.add(id);
        for (const term of Array.isArray(node.terms) ? node.terms : []) {
            if (!term || typeof term !== "object") continue;
            const termId = String(term.id || "").trim();
            if (termId) ids.add(termId);
        }
        for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
    };
    if (Array.isArray(target)) {
        for (const node of target) visit(node);
    } else {
        visit(target);
    }
    return ids;
}

export function ensureUniquePointsBuilderIds(target, options = {}) {
    const seen = new Set();
    let repaired = 0;
    const reserve = (item, fallback = "") => {
        if (!item || typeof item !== "object") return;
        const id = String(item.id || fallback || "").trim();
        if (id && !seen.has(id)) {
            item.id = id;
            seen.add(id);
            return;
        }
        item.id = makeUniqueId(seen, options);
        repaired += 1;
    };
    const visit = (node, isRoot = false) => {
        if (!node || typeof node !== "object") return;
        reserve(node, isRoot ? "root" : "");
        for (const term of Array.isArray(node.terms) ? node.terms : []) reserve(term);
        for (const child of Array.isArray(node.children) ? node.children : []) visit(child, false);
    };
    if (Array.isArray(target)) {
        for (const node of target) visit(node, false);
    } else {
        visit(target, target?.kind === "ROOT");
    }
    return repaired;
}

export function reassignPointsBuilderIds(target, usedIds = new Set(), options = {}) {
    const seen = usedIds instanceof Set ? usedIds : new Set();
    let changed = 0;
    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        node.id = makeUniqueId(seen, options);
        changed += 1;
        for (const term of Array.isArray(node.terms) ? node.terms : []) {
            if (!term || typeof term !== "object") continue;
            term.id = makeUniqueId(seen, options);
            changed += 1;
        }
        for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
    };
    if (Array.isArray(target)) {
        for (const node of target) visit(node);
    } else {
        visit(target);
    }
    return changed;
}

export function normalizePointsBuilderNode(node, options = {}) {
    normalizeNodeDeep(node, options);
    ensureUniquePointsBuilderIds(node, options);
    return node;
}

export function normalizePointsBuilderNodeTree(target, options = {}) {
    if (Array.isArray(target)) {
        for (const node of target) normalizeNodeDeep(node, options);
    } else {
        normalizeNodeDeep(target, options);
    }
    ensureUniquePointsBuilderIds(target, options);
    return target;
}

export function createPointsBuilderState(init = {}, options = {}) {
    return normalizePointsBuilderState(init, options);
}

export function normalizePointsBuilderState(source, options = {}) {
    if (options.requireDirectRoot === true) {
        const hasDirectRoot = source
            && typeof source === "object"
            && !Array.isArray(source)
            && source.root
            && typeof source.root === "object";
        if (!hasDirectRoot) return null;
    }
    const state = cloneJson(getStateSource(source)) || {};
    const root = state.root && typeof state.root === "object" ? state.root : {};
    state.root = {
        ...root,
        id: String(root.id || "root"),
        kind: String(root.kind || "ROOT"),
        children: Array.isArray(root.children) ? root.children : []
    };
    normalizePointsBuilderNodeTree(state.root, options);

    if (Object.prototype.hasOwnProperty.call(state, "presets") && typeof options.normalizePresets === "function") {
        state.presets = options.normalizePresets(state.presets);
    }
    if (Object.prototype.hasOwnProperty.call(state, "variables") && typeof options.normalizeVariables === "function") {
        state.variables = options.normalizeVariables(state.variables);
    }
    return state;
}
