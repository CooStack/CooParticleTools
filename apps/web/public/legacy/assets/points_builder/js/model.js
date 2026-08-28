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

export const BUILDER_REFERENCE_KIND = "builder_reference";
export const EFFECT_RING_KIND = "effect_ring";

let fallbackIdSequence = 0;


const NUMERIC_VARIABLE_TYPES = new Set(["Int", "Long", "Float", "Double", "Number", "scalar"]);
const VECTOR_VARIABLE_TYPES = new Set(["Vec3", "RelativeLocation", "vector"]);

function normalizeVariableIdentifier(raw) {
    const text = String(raw || "").trim().replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, "");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text)) return "";
    return text;
}

function normalizeVariableVector(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const x = Number(value.x ?? value[0]);
    const y = Number(value.y ?? value[1]);
    const z = Number(value.z ?? value[2]);
    return {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        z: Number.isFinite(z) ? z : 0
    };
}

function collectVariableEntries(raw) {
    const entries = [];
    const add = (name, type, value, explicitType = true) => entries.push({ name, type, value, explicitType });
    const visit = (source, defaultType = "Double") => {
        if (Array.isArray(source)) {
            for (const item of source) {
                if (!item || typeof item !== "object") continue;
                const name = item.name ?? item.key ?? item.id;
                const explicitType = item.type !== undefined || item.valueType !== undefined;
                const type = item.type ?? item.valueType ?? defaultType;
                const value = item.value ?? item.initial ?? item.defaultValue ?? item.default ?? item.expr;
                add(name, type, value, explicitType);
            }
            return;
        }
        if (!source || typeof source !== "object") return;
        if (source.scalar && typeof source.scalar === "object" && !Array.isArray(source.scalar)) {
            for (const [name, value] of Object.entries(source.scalar)) add(name, "Double", value);
        }
        if (source.vector && typeof source.vector === "object" && !Array.isArray(source.vector)) {
            for (const [name, value] of Object.entries(source.vector)) add(name, "Vec3", value);
        }
        const scopedKeys = ["items", "globals", "locals", "variables", "constants"];
        for (const key of scopedKeys) {
            const nested = source[key];
            if (Array.isArray(nested)) visit(nested, defaultType);
            else if (nested && typeof nested === "object") visit(nested, defaultType);
        }
        const hasKnownShape = ["scalar", "vector", ...scopedKeys].some((key) => Object.prototype.hasOwnProperty.call(source, key));
        if (!hasKnownShape) {
            for (const [name, value] of Object.entries(source)) add(name, defaultType, value, false);
        }
    };
    visit(raw);
    return entries;
}

export function normalizePointsBuilderVariables(raw) {
    const scalar = {};
    const vector = {};
    for (const entry of collectVariableEntries(raw)) {
        const name = normalizeVariableIdentifier(entry.name);
        if (!name) continue;
        const type = String(entry.type || "Double").trim();
        const value = entry.value;
        if (VECTOR_VARIABLE_TYPES.has(type) || !entry.explicitType && value && typeof value === "object") {
            vector[name] = normalizeVariableVector(value);
            continue;
        }
        if (!NUMERIC_VARIABLE_TYPES.has(type)) continue;
        const number = Number(value);
        if (Number.isFinite(number)) scalar[name] = number;
    }
    return { scalar, vector };
}

function escapeInstanceVariableName(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderInstanceReplacement(value) {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const text = String(value ?? "").trim();
    if (!text) return "0";
    if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(text)) return text;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(text)) return text;
    return `(${text})`;
}

function getInstanceOverrideValues(snapshot, nodeOrOverrides) {
    const isStatic = nodeOrOverrides?.params?.instanceMode !== "construct";
    const raw = isStatic && snapshot?.staticOverrides && typeof snapshot.staticOverrides === "object"
        ? snapshot.staticOverrides
        : nodeOrOverrides?.params?.overrides || nodeOrOverrides?.overrides || nodeOrOverrides || {};
    const defaults = snapshot?.variables?.inputs && typeof snapshot.variables.inputs === "object"
        ? snapshot.variables.inputs
        : {};
    const scalar = { ...(defaults.scalar || {}), ...(raw.scalar || {}) };
    const vector = { ...(defaults.vector || {}), ...(raw.vector || {}) };
    for (const [name, mode] of Object.entries(raw.modes?.scalar || {})) {
        const ref = String(raw.refs?.scalar?.[name] || "").trim();
        if (mode === "reference" && ref) scalar[name] = ref;
    }
    for (const [name, mode] of Object.entries(raw.modes?.vector || {})) {
        const ref = String(raw.refs?.vector?.[name] || "").trim();
        if (mode === "reference" && ref) vector[name] = { x: `${ref}.x`, y: `${ref}.y`, z: `${ref}.z` };
    }
    return { scalar, vector };
}

export function applyPointsBuilderInstanceOverrides(nodes, snapshot, nodeOrOverrides) {
    const replacements = getInstanceOverrideValues(snapshot, nodeOrOverrides);
    const replaceString = (value) => {
        let result = String(value ?? "");
        for (const [name, replacement] of Object.entries(replacements.vector)) {
            const escaped = escapeInstanceVariableName(name);
            result = result.replace(
                new RegExp(`(^|[^A-Za-z0-9_$])${escaped}\\s*\\.\\s*([xyz])(?![A-Za-z0-9_$])`, "g"),
                (match, prefix, component) => `${prefix}${renderInstanceReplacement(replacement?.[component])}`
            );
        }
        for (const [name, replacement] of Object.entries(replacements.scalar)) {
            const escaped = escapeInstanceVariableName(name);
            result = result.replace(
                new RegExp(`(^|[^A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, "g"),
                (match, prefix) => `${prefix}${renderInstanceReplacement(replacement)}`
            );
        }
        return result;
    };
    const visitValue = (value) => {
        if (typeof value === "string") return replaceString(value);
        if (Array.isArray(value)) return value.map(visitValue);
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visitValue(child)]));
    };
    const visitNode = (node) => {
        if (!node || typeof node !== "object") return node;
        const next = { ...node };
        if (node.params && typeof node.params === "object") next.params = visitValue(node.params);
        if (Array.isArray(node.terms)) next.terms = node.terms.map(visitValue);
        if (Array.isArray(node.children)) next.children = node.children.map(visitNode);
        return next;
    };
    return (Array.isArray(nodes) ? nodes : []).map(visitNode);
}

export function buildPointsBuilderVariableCompletions(raw) {
    const variables = normalizePointsBuilderVariables(raw);
    const numeric = Object.keys(variables.scalar).map((name) => ({
        value: name,
        type: "Double",
        label: `${name}（本地数值）`,
        numeric: true
    }));
    for (const name of Object.keys(variables.vector)) {
        numeric.push(
            { value: `${name}.x`, type: "Double", label: `${name}.x（本地数值）`, numeric: true },
            { value: `${name}.y`, type: "Double", label: `${name}.y（本地数值）`, numeric: true },
            { value: `${name}.z`, type: "Double", label: `${name}.z（本地数值）`, numeric: true }
        );
    }
    return {
        numeric,
        vectors: Object.keys(variables.vector).map((name) => ({
            name,
            ref: name,
            type: "Vec3",
            label: `${name}（本地 Vec3）`
        }))
    };
}

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

const REFERENCE_GUIDE_AXES = new Set(["X", "Y", "Z"]);
const REFERENCE_GUIDE_MODES = new Set(["segment", "line"]);

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback = 1) {
    const number = finiteNumber(value, fallback);
    return number > 0 ? number : fallback;
}

function normalizeReferenceGuideOrigin(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
        x: finiteNumber(source.x, 0),
        y: finiteNumber(source.y, 0),
        z: finiteNumber(source.z, 0)
    };
}

export function createPointsBuilderReferenceGuide(init = {}, options = {}) {
    const idFactory = getIdFactory(options);
    const axis = REFERENCE_GUIDE_AXES.has(String(init.axis || "").toUpperCase())
        ? String(init.axis).toUpperCase()
        : "X";
    const mode = REFERENCE_GUIDE_MODES.has(String(init.mode || ""))
        ? String(init.mode)
        : "segment";
    let start = finiteNumber(init.start, -2);
    let end = finiteNumber(init.end, 2);
    if (start > end) [start, end] = [end, start];
    const divisionCount = Math.max(1, Math.min(64, Math.trunc(finiteNumber(init.divisionCount, 1))));
    return {
        id: String(init.id || idFactory() || createPointsBuilderId()),
        name: String(init.name || `${axis} 轴参考线`),
        axis,
        mode,
        origin: normalizeReferenceGuideOrigin(init.origin),
        start,
        end,
        visible: init.visible !== false,
        locked: init.locked === true,
        snapEnabled: init.snapEnabled !== false,
        snapEndpoints: init.snapEndpoints !== false,
        divisionCount,
        step: positiveNumber(init.step, 1)
    };
}

export function normalizePointsBuilderReferenceGuides(raw, options = {}) {
    if (!Array.isArray(raw)) return [];
    const usedIds = new Set();
    return raw.map((item) => {
        const guide = createPointsBuilderReferenceGuide(item, options);
        if (!guide.id || usedIds.has(guide.id)) guide.id = makeUniqueId(usedIds, options);
        else usedIds.add(guide.id);
        return guide;
    });
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
    if (node.kind === BUILDER_REFERENCE_KIND) {
        params.snapshotId = String(params.snapshotId || "").trim();
        params.parameterId = String(params.parameterId || (node.id ? `pb_instance_${node.id}` : "")).trim();
        params.instanceMode = params.instanceMode === "construct" ? "construct" : "static";
        params.instanceBindingMode = ["registered", "indexed", "linked"].includes(params.instanceBindingMode)
            ? params.instanceBindingMode
            : "registered";
        for (const key of ["ox", "oy", "oz", "scale", "rotationDeg", "rotationAxisX", "rotationAxisY", "rotationAxisZ"]) {
            if (params[key] === undefined) params[key] = key === "rotationAxisY" || key === "scale" ? 1 : 0;
        }
        if (!params.overrides || typeof params.overrides !== "object") params.overrides = {};
    }
    if (node.kind === EFFECT_RING_KIND) {
        params.snapshotIds = Array.isArray(params.snapshotIds)
            ? params.snapshotIds.map((id) => String(id || "").trim()).filter(Boolean)
            : [];
        if (params.count === undefined) params.count = 12;
        if (params.radius === undefined) params.radius = 3;
        for (const key of ["startDeg", "originX", "originY", "originZ", "axisX", "axisY", "axisZ", "offsetX", "offsetY", "offsetZ"]) {
            if (params[key] === undefined) params[key] = key === "axisZ" ? 1 : 0;
        }
        if (params.faceCenter === undefined) params.faceCenter = true;
        if (params.reverse === undefined) params.reverse = false;
    }
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
        case "add_bezier_curve_multi":
        case "apply_bezier_distribution":
            if (!Array.isArray(params.nodes)) params.nodes = [];
            params.nodes = params.nodes.map((node) => ({
                x: node?.x ?? node?.point?.x ?? 0,
                y: node?.y ?? node?.point?.y ?? 0,
                z: node?.z ?? node?.point?.z ?? 0,
                shx: node?.shx ?? node?.startHandle?.x ?? 0,
                shy: node?.shy ?? node?.startHandle?.y ?? 0,
                shz: node?.shz ?? node?.startHandle?.z ?? 0,
                ehx: node?.ehx ?? node?.endHandle?.x ?? 0,
                ehy: node?.ehy ?? node?.endHandle?.y ?? 0,
                ehz: node?.ehz ?? node?.endHandle?.z ?? 0
            }));
            if (params.count === undefined) params.count = 16;
            break;
        case "add_bezier_circle_preset":
            if (params.count === undefined) params.count = 96;
            if (!Array.isArray(params.nodes)) params.nodes = [];
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
        if (node.kind === BUILDER_REFERENCE_KIND || node.kind === EFFECT_RING_KIND) node.children = [];
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

function ensureUniqueBuilderReferenceParameterIds(target) {
    const used = new Set();
    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (node.kind === BUILDER_REFERENCE_KIND) {
            const params = node.params || (node.params = {});
            const base = String(params.parameterId || `pb_instance_${node.id || "instance"}`)
                .trim()
                .replace(/[^A-Za-z0-9_]/g, "_") || `pb_instance_${node.id || "instance"}`;
            let candidate = base;
            let suffix = 2;
            while (used.has(candidate)) candidate = `${base}_${suffix++}`;
            params.parameterId = candidate;
            used.add(candidate);
        }
        for (const child of Array.isArray(node.children) ? node.children : []) visit(child);
    };
    if (Array.isArray(target)) {
        for (const node of target) visit(node);
    } else {
        visit(target);
    }
}

export function reassignPointsBuilderIds(target, usedIds = new Set(), options = {}) {
    const seen = usedIds instanceof Set ? usedIds : new Set();
    let changed = 0;
    const visit = (node) => {
        if (!node || typeof node !== "object") return;
        node.id = makeUniqueId(seen, options);
        if (node.kind === BUILDER_REFERENCE_KIND) {
            if (!node.params || typeof node.params !== "object") node.params = {};
            node.params.parameterId = `pb_instance_${node.id}`;
        }
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
    ensureUniqueBuilderReferenceParameterIds(node);
    return node;
}

export function normalizePointsBuilderNodeTree(target, options = {}) {
    if (Array.isArray(target)) {
        for (const node of target) normalizeNodeDeep(node, options);
    } else {
        normalizeNodeDeep(target, options);
    }
    ensureUniquePointsBuilderIds(target, options);
    ensureUniqueBuilderReferenceParameterIds(target);
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
    if (Object.prototype.hasOwnProperty.call(state, "builderSnapshots")) {
        const sourceSnapshots = state.builderSnapshots && typeof state.builderSnapshots === "object" ? state.builderSnapshots : {};
        const normalizedSnapshots = {};
        for (const [key, raw] of Object.entries(sourceSnapshots)) {
            if (!raw || typeof raw !== "object") continue;
            const id = String(raw.id || key || "").trim();
            if (!id) continue;
            normalizedSnapshots[id] = {
                id,
                sourcePresetId: String(raw.sourcePresetId || raw.presetId || "").trim(),
                sourcePresetRevision: String(raw.sourcePresetRevision || raw.revision || "").trim(),
                name: String(raw.name || "未命名实例").trim() || "未命名实例",
                origin: normalizeVariableVector(raw.origin),
                variables: raw.variables && typeof raw.variables === "object" ? cloneJson(raw.variables) : null,
                staticOverrides: raw.staticOverrides && typeof raw.staticOverrides === "object" ? cloneJson(raw.staticOverrides) : null,
                privateConstants: raw.privateConstants && typeof raw.privateConstants === "object" ? cloneJson(raw.privateConstants) : {},
                children: Array.isArray(raw.children) ? cloneJson(raw.children) : [],
                revision: Math.max(1, Math.trunc(Number(raw.revision) || 1)),
                createdAt: Number(raw.createdAt) || Date.now(),
                updatedAt: Number(raw.updatedAt) || Date.now()
            };
        }
        state.builderSnapshots = normalizedSnapshots;
    }
    if (Object.prototype.hasOwnProperty.call(state, "builderPresetMappings")) {
        const mappings = state.builderPresetMappings && typeof state.builderPresetMappings === "object"
            ? state.builderPresetMappings
            : {};
        state.builderPresetMappings = Object.fromEntries(Object.entries(mappings)
            .map(([presetId, snapshotId]) => [String(presetId || "").trim(), String(snapshotId || "").trim()])
            .filter(([presetId, snapshotId]) => presetId && snapshotId));
    }
    normalizePointsBuilderNodeTree(state.root, options);
    state.guides = normalizePointsBuilderReferenceGuides(state.guides, options);

    if (Object.prototype.hasOwnProperty.call(state, "presets") && typeof options.normalizePresets === "function") {
        state.presets = options.normalizePresets(state.presets);
    }
    if (Object.prototype.hasOwnProperty.call(state, "variables") && typeof options.normalizeVariables === "function") {
        state.variables = options.normalizeVariables(state.variables);
    }
    return state;
}
