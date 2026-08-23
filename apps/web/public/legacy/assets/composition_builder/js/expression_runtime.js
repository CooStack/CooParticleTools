export function createExpressionRuntime(options = {}) {
    const U = options.U;
    const getState = typeof options.getState === "function" ? options.getState : (() => ({}));
    const sanitizeIdentifier = typeof options.sanitizeIdentifier === "function"
        ? options.sanitizeIdentifier
        : ((raw, fallback = "") => fallback || String(raw || "").trim());

    if (!U) throw new Error("createExpressionRuntime requires U");

    const vectorTypes = new Set(["Vec3", "Vec3d", "RelativeLocation", "Vector3f"]);
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
    const normalizeVectorType = (rawType) => {
        const type = String(rawType || "").trim();
        if (type === "Vec3d") return "Vec3";
        return vectorTypes.has(type) ? type : "RelativeLocation";
    };
    const readVectorComponents = (x = 0, y = 0, z = 0) => {
        if (x && typeof x === "object") {
            return [toNum(x.x), toNum(x.y), toNum(x.z)];
        }
        return [toNum(x), toNum(y), toNum(z)];
    };
    const createRuntimeVector = (valueOrX = 0, y = 0, z = 0, typeName = "RelativeLocation") => {
        const type = normalizeVectorType(typeName);
        const [x, vy, vz] = readVectorComponents(valueOrX, y, z);
        const out = { x, y: vy, z: vz };
        Object.defineProperty(out, "__compositionVectorType", {
            configurable: false,
            enumerable: false,
            writable: false,
            value: type
        });
        const vectorArg = (args) => {
            if (args.length === 1 && args[0] && typeof args[0] === "object") {
                return readVectorComponents(args[0]);
            }
            return readVectorComponents(args[0], args[1], args[2]);
        };
        const calculate = (args, operation) => {
            const [ox, oy, oz] = vectorArg(args);
            return createRuntimeVector(
                operation(out.x, ox),
                operation(out.y, oy),
                operation(out.z, oz),
                type
            );
        };
        Object.defineProperties(out, {
            clone: { enumerable: false, value: () => createRuntimeVector(out, 0, 0, type) },
            copy: { enumerable: false, value: () => createRuntimeVector(out, 0, 0, type) },
            add: { enumerable: false, value: (...args) => calculate(args, (left, right) => left + right) },
            remove: { enumerable: false, value: (...args) => calculate(args, (left, right) => left - right) },
            subtract: { enumerable: false, value: (...args) => calculate(args, (left, right) => left - right) },
            multiply: { enumerable: false, value: (value) => {
                if (value && typeof value === "object") return calculate([value], (left, right) => left * right);
                const scalar = toNum(value, 1);
                return createRuntimeVector(out.x * scalar, out.y * scalar, out.z * scalar, type);
            } },
            multiple: { enumerable: false, value: (value) => out.multiply(value) },
            mul: { enumerable: false, value: (value) => out.multiply(value) },
            multiplyClone: { enumerable: false, value: (value) => out.clone().multiply(value) },
            divide: { enumerable: false, value: (value) => {
                if (value && typeof value === "object") return calculate([value], (left, right) => left / right);
                const scalar = toNum(value, 1);
                return createRuntimeVector(out.x / scalar, out.y / scalar, out.z / scalar, type);
            } },
            div: { enumerable: false, value: (value) => out.divide(value) },
            normalize: { enumerable: false, value: () => {
                const length = Math.hypot(out.x, out.y, out.z);
                if (length <= 1e-6) {
                    return createRuntimeVector(type === "RelativeLocation" ? 1 : 0, 0, 0, type);
                }
                return createRuntimeVector(out.x / length, out.y / length, out.z / length, type);
            } },
            dot: { enumerable: false, value: (other) => {
                const [ox, oy, oz] = readVectorComponents(other);
                return out.x * ox + out.y * oy + out.z * oz;
            } },
            cross: { enumerable: false, value: (other) => {
                const [ox, oy, oz] = readVectorComponents(other);
                return createRuntimeVector(
                    out.y * oz - out.z * oy,
                    out.z * ox - out.x * oz,
                    out.x * oy - out.y * ox,
                    type
                );
            } },
            length: { enumerable: false, value: () => Math.hypot(out.x, out.y, out.z) },
            lengthSquared: { enumerable: false, value: () => out.x * out.x + out.y * out.y + out.z * out.z },
            distance: { enumerable: false, value: (other) => {
                const [ox, oy, oz] = readVectorComponents(other);
                return Math.hypot(out.x - ox, out.y - oy, out.z - oz);
            } },
            asRelative: { enumerable: false, value: () => createRuntimeVector(out, 0, 0, "RelativeLocation") },
            toVector: { enumerable: false, value: () => createRuntimeVector(out, 0, 0, "Vec3") },
            asVec3: { enumerable: false, value: () => createRuntimeVector(out, 0, 0, "Vec3") },
            toVector3f: { enumerable: false, value: () => createRuntimeVector(out, 0, 0, "Vector3f") }
        });
        return out;
    };
    function runtimeRelativeLocation(x = 0, y = 0, z = 0) {
        return createRuntimeVector(x, y, z, "RelativeLocation");
    }
    runtimeRelativeLocation.of = (start, end) => {
        if (end === undefined) return createRuntimeVector(start, 0, 0, "RelativeLocation");
        const [sx, sy, sz] = readVectorComponents(start);
        const [ex, ey, ez] = readVectorComponents(end);
        return createRuntimeVector(ex - sx, ey - sy, ez - sz, "RelativeLocation");
    };
    runtimeRelativeLocation.yAxis = () => createRuntimeVector(0, 1, 0, "RelativeLocation");
    runtimeRelativeLocation.xAxis = () => createRuntimeVector(1, 0, 0, "RelativeLocation");
    runtimeRelativeLocation.zAxis = () => createRuntimeVector(0, 0, 1, "RelativeLocation");
    runtimeRelativeLocation.zero = () => createRuntimeVector(0, 0, 0, "RelativeLocation");
    function runtimeVec3(x = 0, y = 0, z = 0) {
        return createRuntimeVector(x, y, z, "Vec3");
    }
    runtimeVec3.ZERO = createRuntimeVector(0, 0, 0, "Vec3");
    function runtimeVector3f(x = 0, y = 0, z = 0) {
        return createRuntimeVector(x, y, z, "Vector3f");
    }
    const randomSignedInt32 = () => Math.floor(Math.random() * 0x100000000) - 0x80000000;
    const runtimeRandom = {
        nextInt(fromOrUntil, until) {
            if (arguments.length === 0) return randomSignedInt32();
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
            if (arguments.length === 0) return randomSignedInt32();
            if (arguments.length === 1) return runtimeRandom.nextInt(fromOrUntil);
            return runtimeRandom.nextInt(fromOrUntil, until);
        }
    };
    let baseVarsNoVector = Object.freeze({
        PI: Math.PI,
        RelativeLocation: runtimeRelativeLocation,
        Vec3: runtimeVec3,
        Vec3d: runtimeVec3,
        Vector3f: runtimeVector3f,
        Random: runtimeRandom
    });
    let baseVarsWithVector = Object.freeze({
        PI: Math.PI,
        RelativeLocation: runtimeRelativeLocation,
        Vec3: runtimeVec3,
        Vec3d: runtimeVec3,
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
        return createRuntimeVector(vec, 0, 0, typeName);
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
            Vec3d: runtimeVec3,
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
                const t = String(c?.type || "").trim();
                if (numericTypes.has(t)) {
                    noVec[name] = evaluateNumberLiteral(c?.value || "0");
                    continue;
                }
                if (t === "Boolean") {
                    noVec[name] = /^true$/i.test(String(c?.value || ""));
                    continue;
                }
                if (vectorTypes.has(t)) {
                    vecMap.set(name, {
                        type: t,
                        value: String(c?.value || "")
                    });
                    continue;
                }
                noVec[name] = c?.value;
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
        const expr = String(exprRaw || "").trim().replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
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
        if (s === "Vec3.ZERO" || s === "Vec3d.ZERO") return U.v(0, 0, 0);
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

        const runtimeExpr = s.replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
        const runtimeFn = getNumericExprFunction(runtimeExpr);
        if (typeof runtimeFn === "function") {
            try {
                const vars = getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
                const value = runtimeFn(vars);
                if (value && typeof value === "object"
                    && Number.isFinite(Number(value.x))
                    && Number.isFinite(Number(value.y))
                    && Number.isFinite(Number(value.z))) {
                    return U.v(Number(value.x), Number(value.y), Number(value.z));
                }
            } catch {
            }
        }

        const m = s.match(/(?:Vec3|Vec3d|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
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
        createRuntimeVector,
        getExpressionVars,
        evaluateNumericExpression,
        parseVecLikeValue,
        resolveRelativeDirection
    };
}
