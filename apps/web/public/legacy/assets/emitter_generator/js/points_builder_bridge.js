import { createKindDefs } from "../../points_builder/js/kinds.js";
import { createBuilderTools } from "../../points_builder/js/builder.js";

const U = globalThis.Utils;
if (!U) {
    throw new Error("Utils not found: load assets/src/js/compat/install-legacy-globals.js before using points builder bridge");
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function int(v) {
    return Math.max(0, Math.trunc(num(v)));
}

function relExpr(x, y, z) {
    return `RelativeLocation(${U.fmt(num(x))}, ${U.fmt(num(y))}, ${U.fmt(num(z))})`;
}

function rotatePointsToPointUpright(points, toPoint, axis, upRef = U.v(0, 1, 0)) {
    if (!Array.isArray(points) || points.length === 0) return points;
    const fwd = U.norm(axis);
    const dir = U.norm(toPoint);
    if (U.len(fwd) <= 1e-6 || U.len(dir) <= 1e-6) return points;

    const buildBasis = (forward) => {
        const f = U.norm(forward);
        let r = U.cross(upRef, f);
        if (U.len(r) <= 1e-6) {
            const altUp = (Math.abs(upRef.y) > 0.9) ? U.v(1, 0, 0) : U.v(0, 1, 0);
            r = U.cross(altUp, f);
        }
        if (U.len(r) <= 1e-6) return null;
        r = U.norm(r);
        const u = U.norm(U.cross(f, r));
        return { r, u, f };
    };

    const from = buildBasis(fwd);
    const to = buildBasis(dir);
    if (!from || !to) return points;

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = U.dot(p, from.r);
        const y = U.dot(p, from.u);
        const z = U.dot(p, from.f);
        points[i] = {
            x: to.r.x * x + to.u.x * y + to.f.x * z,
            y: to.r.y * x + to.u.y * y + to.f.y * z,
            z: to.r.z * x + to.u.z * y + to.f.z * z,
        };
    }

    return points;
}

export function createDefaultBuilderState() {
    return {
        root: {
            id: "root",
            kind: "ROOT",
            children: [],
        },
    };
}

export function normalizeBuilderState(raw) {
    const base = createDefaultBuilderState();
    if (!raw || typeof raw !== "object") return base;

    if (raw.root && Array.isArray(raw.root.children)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw.root.children) } };
    }
    if (raw.state && raw.state.root && Array.isArray(raw.state.root.children)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw.state.root.children) } };
    }
    if (Array.isArray(raw.children)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw.children) } };
    }
    if (Array.isArray(raw)) {
        return { root: { id: "root", kind: "ROOT", children: deepClone(raw) } };
    }

    return base;
}

export function countBuilderNodes(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    let total = 0;
    const walk = (nodes) => {
        for (const node of nodes || []) {
            if (!node || typeof node !== "object") continue;
            total += 1;
            if (Array.isArray(node.children) && node.children.length) walk(node.children);
        }
    };
    walk(list);
    return total;
}

const builderU = Object.assign({}, U, {
    fmt: (v) => U.fmt(num(v)),
});

const KIND = createKindDefs({
    U: builderU,
    num,
    int,
    relExpr,
    rotatePointsToPointUpright,
});

let builderEvalState = createDefaultBuilderState();
const builderTools = createBuilderTools({
    KIND,
    U: builderU,
    getState: () => builderEvalState,
    getKotlinEndMode: () => "builder",
});

const { evalBuilderWithMeta, emitKotlin: emitPointsBuilderKotlin } = builderTools;

export function evaluateBuilderState(builderState) {
    const old = builderEvalState;
    try {
        builderEvalState = normalizeBuilderState(builderState);
        const nodes = builderEvalState?.root?.children || [];
        return evalBuilderWithMeta(nodes, builderU.v(0, 1, 0));
    } catch (err) {
        console.warn("evaluate builder state failed:", err);
        return { points: [], segments: new Map() };
    } finally {
        builderEvalState = old;
    }
}

export function emitBuilderKotlinFromState(builderState) {
    const old = builderEvalState;
    try {
        builderEvalState = normalizeBuilderState(builderState);
        return emitPointsBuilderKotlin() || "PointsBuilder()";
    } catch (err) {
        console.warn("emit builder kotlin failed:", err);
        return "PointsBuilder()";
    } finally {
        builderEvalState = old;
    }
}
