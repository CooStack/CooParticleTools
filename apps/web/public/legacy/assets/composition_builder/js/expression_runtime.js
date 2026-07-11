export function createExpressionRuntime(options = {}) {
    const U = options.U;
    const getState = typeof options.getState === "function" ? options.getState : (() => ({}));
    const sanitizeIdentifier = typeof options.sanitizeIdentifier === "function"
        ? options.sanitizeIdentifier
        : ((raw, fallback = "") => fallback || String(raw || "").trim());

    if (!U) throw new Error("createExpressionRuntime requires U");

    const vectorTypes = new Set(["Vec3", "RelativeLocation", "Vector3f"]);
    const numericTypes = new Set(["Int", "Long", "Float", "Double"]);
    const numericExprFnCache = new Map();
    const RESOLVE_STACK_LIMIT = 128;

    let staticCacheDirty = true;
    let staticCacheBuilding = false;
    let vectorVarMap = new Map();
    let buildingNoVecBase = null;

    const isFiniteNumber = (v) => Number.isFinite(Number(v));
    const toNum = (v, fb = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fb;
    };
    const runtimeRelativeLocation = (x = 0, y = 0, z = 0) => ({ x: toNum(x), y: toNum(y), z: toNum(z) });
    runtimeRelativeLocation.yAxis = () => ({ x: 0, y: 1, z: 0 });
    const runtimeVec3 = (x = 0, y = 0, z = 0) => {
        const vx = toNum(x);
        const vy = toNum(y);
        const vz = toNum(z);
        return {
            x: vx,
            y: vy,
            z: vz,
            asRelative: () => ({ x: vx, y: vy, z: vz })
        };
    };
    const runtimeVector3f = (x = 0, y = 0, z = 0) => ({ x: toNum(x), y: toNum(y), z: toNum(z) });
    const runtimeRandom = {
        nextInt(fromOrUntil, until) {
            if (until === undefined) {
                const u = Math.floor(toNum(fromOrUntil, 1));
                if (u <= 0) return 0;
                return Math.floor(Math.random() * u);
            }
            const f = Math.floor(toNum(fromOrUntil, 0));
            const u = Math.floor(toNum(until, 1));
            if (u <= f) return f;
            return f + Math.floor(Math.random() * (u - f));
        },
        nextDouble(fromOrUntil, until) {
            if (until === undefined) {
                const u = toNum(fromOrUntil, 1.0);
                if (u <= 0) return 0;
                return Math.random() * u;
            }
            const f = toNum(fromOrUntil, 0);
            const u = toNum(until, 1.0);
            if (u <= f) return f;
            return f + Math.random() * (u - f);
        },
        nextFloat(fromOrUntil, until) {
            return runtimeRandom.nextDouble(fromOrUntil, until);
        },
        nextBoolean() {
            return Math.random() < 0.5;
        },
        nextLong(fromOrUntil, until) {
            return runtimeRandom.nextInt(fromOrUntil, until);
        }
    };
    let baseVarsNoVector = Object.freeze({
        PI: Math.PI,
        RelativeLocation: runtimeRelativeLocation,
        Vec3: runtimeVec3,
        Vector3f: runtimeVector3f,
        Random: runtimeRandom
    });
    let baseVarsWithVector = Object.freeze({
        PI: Math.PI,
        RelativeLocation: runtimeRelativeLocation,
        Vec3: runtimeVec3,
        Vector3f: runtimeVector3f,
        Random: runtimeRandom
    });

    const toIdentifier = (rawName) => {
        const raw = String(rawName || "").trim();
        if (!raw) return "";
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(raw)) return raw;
        return sanitizeIdentifier(raw, "");
    };

    const readState = () => {
        const s = getState() || {};
        return {
            globalVars: Array.isArray(s.globalVars) ? s.globalVars : [],
            globalConsts: Array.isArray(s.globalConsts) ? s.globalConsts : []
        };
    };

    function evaluateNumberLiteral(raw) {
        const text = String(raw || "").trim();
        if (!text) return 0;
        const cleaned = text.replace(/[fFdDlL]/g, "");
        const n = Number(cleaned);
        if (Number.isFinite(n)) return n;
        try {
            const fn = new Function(`return (${cleaned});`);
            const v = fn();
            return Number.isFinite(Number(v)) ? Number(v) : 0;
        } catch {
            return 0;
        }
    }

    function invalidateCache() {
        staticCacheDirty = true;
    }

    function makeVectorProxy(vec, typeName = "") {
        const x = Number.isFinite(Number(vec?.x)) ? Number(vec.x) : 0;
        const y = Number.isFinite(Number(vec?.y)) ? Number(vec.y) : 0;
        const z = Number.isFinite(Number(vec?.z)) ? Number(vec.z) : 0;
        const out = { x, y, z };
        if (String(typeName || "").trim() === "Vec3") {
            out.asRelative = () => ({ x, y, z });
        }
        return Object.freeze(out);
    }

    function ensureStaticCache() {
        if (!staticCacheDirty) return;
        if (staticCacheBuilding) return;
        staticCacheBuilding = true;
        const state = readState();
        const noVec = {
            PI: Math.PI,
            RelativeLocation: runtimeRelativeLocation,
            Vec3: runtimeVec3,
            Vector3f: runtimeVector3f,
            Random: runtimeRandom
        };
        const vecMap = new Map();

        try {
            for (const g of state.globalVars) {
                const name = toIdentifier(g?.name);
                if (!name) continue;
                const t = String(g?.type || "").trim();
                if (numericTypes.has(t)) {
                    noVec[name] = evaluateNumberLiteral(g?.value || "0");
                    continue;
                }
                if (t === "Boolean") {
                    noVec[name] = /^true$/i.test(String(g?.value || ""));
                    continue;
                }
                if (vectorTypes.has(t)) {
                    vecMap.set(name, {
                        type: t,
                        value: String(g?.value || "")
                    });
                    continue;
                }
                noVec[name] = g?.value;
            }

            for (const c of state.globalConsts) {
                const name = toIdentifier(c?.name);
                if (!name) continue;
                noVec[name] = evaluateNumberLiteral(c?.value || "0");
            }

            vectorVarMap = vecMap;
            buildingNoVecBase = noVec;

            const resolvedVec = new Map();
            const IN_PROGRESS = Symbol("vec_in_progress");
            const resolveVectorVar = (name, visiting = new Set()) => {
                if (!name) return null;
                if (resolvedVec.has(name)) {
                    const cached = resolvedVec.get(name);
                    if (cached === IN_PROGRESS) return U.v(0, 0, 0);
                    return cached;
                }
                const hit = vectorVarMap.get(name);
                if (!hit) return null;
                if (visiting.has(name) || visiting.size > RESOLVE_STACK_LIMIT) return U.v(0, 0, 0);
                const next = new Set(visiting);
                next.add(name);
                resolvedVec.set(name, IN_PROGRESS);
                const vec = parseVecLikeValue(hit.value || "", {
                    includeVectors: false,
                    visiting: next,
                    skipEnsure: true,
                    depth: next.size
                });
                const outVec = vec || U.v(0, 0, 0);
                resolvedVec.set(name, outVec);
                return outVec;
            };

            const withVec = Object.assign({}, noVec);
            for (const [name, info] of vectorVarMap.entries()) {
                const vec = resolveVectorVar(name, new Set());
                if (!vec) continue;
                withVec[name] = makeVectorProxy(vec, info.type);
            }

            baseVarsNoVector = Object.freeze(noVec);
            baseVarsWithVector = Object.freeze(withVec);
            staticCacheDirty = false;
        } finally {
            buildingNoVecBase = null;
            staticCacheBuilding = false;
        }
    }

    function getExpressionVars(elapsedTick = 0, ageTick = 0, pointIndex = 0, opts = {}) {
        if (!staticCacheBuilding) ensureStaticCache();
        const includeVectors = opts.includeVectors === true;
        const base = staticCacheBuilding && buildingNoVecBase
            ? buildingNoVecBase
            : (includeVectors ? baseVarsWithVector : baseVarsNoVector);
        const vars = Object.create(base);
        const defineLocal = (name, value) => {
            try {
                Object.defineProperty(vars, name, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value
                });
            } catch {
                vars[name] = value;
            }
        };
        const tickValue = Number.isFinite(Number(elapsedTick)) ? Number(elapsedTick) : 0;
        defineLocal("age", Number.isFinite(Number(ageTick)) ? Number(ageTick) : 0);
        defineLocal("tick", tickValue);
        defineLocal("tickCount", tickValue);
        defineLocal("index", Number.isFinite(Number(pointIndex)) ? Number(pointIndex) : 0);
        return vars;
    }

    function getNumericExprFunction(expr) {
        if (numericExprFnCache.has(expr)) {
            return numericExprFnCache.get(expr) || null;
        }
        let fn = null;
        try {
            fn = new Function("vars", `with(vars){ return (${expr}); }`);
        } catch {
            fn = null;
        }
        if (numericExprFnCache.size > 2048) numericExprFnCache.clear();
        numericExprFnCache.set(expr, fn);
        return fn;
    }

    function evaluateNumericExpression(exprRaw, opts = {}) {
        const expr = String(exprRaw || "").trim().replace(/(\d+(?:\.\d+)?)[fFdDlL]\b/g, "$1");
        if (!expr) return 0;

        const elapsedTick = isFiniteNumber(opts.elapsedTick) ? Number(opts.elapsedTick) : 0;
        const ageTick = isFiniteNumber(opts.ageTick) ? Number(opts.ageTick) : 0;
        const pointIndex = isFiniteNumber(opts.pointIndex) ? Number(opts.pointIndex) : 0;
        const includeVectors = opts.includeVectors === true;
        const vars = getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors });
        const fn = getNumericExprFunction(expr);
        if (typeof fn !== "function") return 0;

        try {
            const value = fn(vars);
            return Number.isFinite(Number(value)) ? Number(value) : 0;
        } catch {
            return 0;
        }
    }

    function findVectorVarByName(name) {
        if (!staticCacheBuilding) ensureStaticCache();
        return vectorVarMap.get(name) || null;
    }

    function parseVecLikeValue(rawExpr, opts = {}) {
        if (!opts.skipEnsure && !staticCacheBuilding) ensureStaticCache();
        const s = String(rawExpr || "").trim();
        if (!s) return U.v(0, 0, 0);
        if (s === "Vec3.ZERO") return U.v(0, 0, 0);
        if (s === "RelativeLocation.yAxis()") return U.v(0, 1, 0);
        const depth = Number.isFinite(Number(opts.depth)) ? Number(opts.depth) : 0;
        if (depth > RESOLVE_STACK_LIMIT) return U.v(0, 0, 0);

        const elapsedTick = isFiniteNumber(opts.elapsedTick) ? Number(opts.elapsedTick) : 0;
        const ageTick = isFiniteNumber(opts.ageTick) ? Number(opts.ageTick) : 0;
        const pointIndex = isFiniteNumber(opts.pointIndex) ? Number(opts.pointIndex) : 0;
        const includeVectors = opts.includeVectors === true;
        const visiting = opts.visiting instanceof Set ? opts.visiting : new Set();

        if (s.endsWith(".asRelative()")) {
            const varName = s.slice(0, -".asRelative()".length).trim();
            return parseVecLikeValue(varName, {
                elapsedTick,
                ageTick,
                pointIndex,
                includeVectors,
                visiting,
                depth: depth + 1
            });
        }

        const idMatch = s.match(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
        if (idMatch) {
            const varName = idMatch[0];
            const target = findVectorVarByName(varName);
            if (target) {
                if (visiting.has(varName)) return U.v(0, 0, 0);
                const nextVisiting = new Set(visiting);
                nextVisiting.add(varName);
                return parseVecLikeValue(target.value || "", {
                    elapsedTick,
                    ageTick,
                    pointIndex,
                    includeVectors,
                    visiting: nextVisiting,
                    skipEnsure: true,
                    depth: depth + 1
                });
            }
        }

        const m = s.match(/(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (m) {
            return U.v(
                evaluateNumericExpression(m[1], { elapsedTick, ageTick, pointIndex, includeVectors: false }),
                evaluateNumericExpression(m[2], { elapsedTick, ageTick, pointIndex, includeVectors: false }),
                evaluateNumericExpression(m[3], { elapsedTick, ageTick, pointIndex, includeVectors: false })
            );
        }

        return U.v(0, 0, 0);
    }

    function resolveRelativeDirection(exprRaw, opts = {}) {
        const expr = String(exprRaw || "").trim();
        if (!expr) return U.v(0, 1, 0);
        const vec = parseVecLikeValue(expr, opts);
        return U.len(vec) > 1e-6 ? U.norm(vec) : U.v(0, 1, 0);
    }

    return {
        invalidateCache,
        evaluateNumberLiteral,
        getExpressionVars,
        evaluateNumericExpression,
        parseVecLikeValue,
        resolveRelativeDirection
    };
}
