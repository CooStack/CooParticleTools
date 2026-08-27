import "../../src/js/compat/legacy-utils.global.js";
import { createExpressionRuntime } from "./expression_runtime.js?v=20260729_3";
import { normalizeAlphaHelperConfig, normalizeCParticleAlphaConfig } from "./alpha_helper_utils.js?v=20260729_1";
import { normalizeScaleHelperConfig } from "./scale_helper_utils.js";
import {
    normalizeAngleUnit,
    normalizeAngleOffsetEaseName,
    normalizeAngleOffsetEaseSpecialParams
} from "./angle_offset_utils.js";
import { installPreviewRuntimeMethods } from "./preview_runtime_mixin.js?v=20260824_8";

const U = globalThis.Utils;

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function int(value) {
    return Math.trunc(num(value));
}

function clamp(value, min, max) {
    let lo = Number(min);
    let hi = Number(max);
    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi)) hi = lo;
    if (hi < lo) hi = lo;
    return Math.min(Math.max(Number(value) || 0, lo), hi);
}

function uid() {
    return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
}

function sanitizeIdentifier(raw, fallback = "") {
    const id = String(raw || "").trim().replace(/[^A-Za-z0-9_$]/g, "_");
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id)) return id;
    return fallback;
}

function normalizeAnimate(raw) {
    const x = Object.assign({}, raw || {});
    x.id = x.id || uid();
    x.count = Math.max(1, int(x.count || 1));
    x.condition = String(x.condition || "");
    return x;
}

function normalizeControllerAction(raw) {
    const x = Object.assign({}, raw || {});
    x.id = x.id || uid();
    x.type = String(x.type || "tick_js");
    x.script = String(x.script || "");
    return x;
}

function normalizeDisplayAction(raw) {
    const x = Object.assign({}, raw || {});
    x.id = x.id || uid();
    if (x.type === "rotateTo") x.type = "rotateToPoint";
    const allowed = new Set(["rotateToPoint", "rotateAsAxis", "rotateToWithAngle", "expression"]);
    x.type = allowed.has(String(x.type || "")) ? String(x.type) : "rotateToWithAngle";
    x.toUsePreset = x.toUsePreset === true;
    x.toPreset = String(x.toPreset || "RelativeLocation.yAxis()");
    x.toExpr = String(x.toExpr || x.toPreset || "RelativeLocation.yAxis()");
    x.angleMode = x.angleMode === "expr" ? "expr" : "numeric";
    x.angleValue = Number.isFinite(Number(x.angleValue)) ? num(x.angleValue) : 0.05;
    x.angleUnit = normalizeAngleUnit(x.angleUnit || "rad");
    x.angleExpr = String(x.angleExpr || "speed / 180 * PI");
    x.angleExprPreset = String(x.angleExprPreset || x.angleExpr || "speed / 180 * PI");
    x.expression = String(x.expression || "");
    return x;
}

function ensureStatusHelperMethods(rawStatus) {
    let status = (rawStatus && typeof rawStatus === "object") ? rawStatus : {};
    if (!Object.isExtensible(status)) status = Object.assign({}, status);
    const assign = (key, value) => {
        try {
            status[key] = value;
        } catch {
        }
    };
    assign("displayStatus", int(status.displayStatus || 1) === 2 ? 2 : 1);
    assign("isDisable", () => int(status.displayStatus || 1) === 2);
    assign("disable", () => {
        status.displayStatus = 2;
        status.__manualDisplayStatus = true;
    });
    assign("isEnable", () => int(status.displayStatus || 1) !== 2);
    assign("enable", () => {
        status.displayStatus = 1;
        status.__manualDisplayStatus = true;
    });
    return status;
}

function stripJsForLint(raw) {
    const src = String(raw || "");
    return src.replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (m) => " ".repeat(m.length)
    );
}

function transpileKotlinThisQualifierToJs(source) {
    return String(source || "").replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, "thisAt.");
}

function rotatePointsToPointUpright(points, toPoint, axis, upRef = U.v(0, 1, 0)) {
    if (!points || points.length === 0) return points;
    const fwd = U.norm(axis);
    const dir = U.norm(toPoint);
    if (U.len(fwd) <= 1e-6 || U.len(dir) <= 1e-6) return points;
    const buildBasis = (forward) => {
        const f = U.norm(forward);
        let r = U.cross(upRef, f);
        if (U.len(r) <= 1e-6) {
            const altUp = Math.abs(upRef.y) > 0.9 ? U.v(1, 0, 0) : U.v(0, 1, 0);
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
            z: to.r.z * x + to.u.z * y + to.f.z * z
        };
    }
    return points;
}

function srgbToLinear01(value) {
    const c = clamp(num(value), 0, 1);
    if (c <= 0.04045) return c / 12.92;
    return Math.pow((c + 0.055) / 1.055, 2.4);
}

function srgbRgbToLinearArray(rgb) {
    const src = Array.isArray(rgb) ? rgb : [1, 1, 1];
    return [
        srgbToLinear01(src[0]),
        srgbToLinear01(src[1]),
        srgbToLinear01(src[2])
    ];
}

const CONTROLLER_SCOPE_RESERVED = new Set([
    "color", "particleColor", "size", "particleSize", "alpha", "particleAlpha",
    "age", "currentAge", "lifetime", "lifeTime", "textureSheet",
    "tick", "tickCount", "index", "status", "particle", "thisAt"
]);

const TEXTURE_EFFECT_WHITELIST = [
    "ControlableEndRodEffect",
    "ControlableEnchantmentEffect",
    "ControlableCloudEffect",
    "ControlableFallingDustEffect",
    "ControlableSplashEffect",
    "ControlableFlashEffect",
    "ControlableFireworkEffect"
];

function copyFloatArray(raw, length) {
    const len = Math.max(0, int(length || 0));
    if (raw instanceof Float32Array && raw.length === len) return raw;
    const out = new Float32Array(len);
    if (raw && Number.isFinite(Number(raw.length))) {
        const n = Math.min(len, int(raw.length || 0));
        for (let i = 0; i < n; i++) out[i] = num(raw[i]);
    }
    return out;
}

function copyVisibleMask(raw, length) {
    const len = Math.max(0, int(length || 0));
    if (raw instanceof Uint8Array && raw.length === len) return raw;
    const out = new Uint8Array(len);
    if (!raw || !Number.isFinite(Number(raw.length))) {
        out.fill(1);
        return out;
    }
    const n = Math.min(len, int(raw.length || 0));
    for (let i = 0; i < n; i++) {
        out[i] = (raw[i] === false || raw[i] === 0) ? 0 : 1;
    }
    if (n < len) out.fill(1, n);
    return out;
}

function copyColorArray(raw, length) {
    const len = Math.max(0, int(length || 0));
    if (raw instanceof Uint8Array && raw.length === len) return raw;
    const out = new Uint8Array(len);
    if (!raw || !Number.isFinite(Number(raw.length))) return out;
    const n = Math.min(len, int(raw.length || 0));
    for (let i = 0; i < n; i++) out[i] = clamp(Math.round(num(raw[i]) * 255), 0, 255);
    return out;
}

function copyAlphaArray(raw, length) {
    const len = Math.max(0, int(length || 0));
    if (raw instanceof Uint8Array && raw.length === len) return raw;
    const out = new Uint8Array(len);
    if (!raw || !Number.isFinite(Number(raw.length))) return out;
    const n = Math.min(len, int(raw.length || 0));
    for (let i = 0; i < n; i++) out[i] = clamp(Math.round(num(raw[i]) * 255), 0, 255);
    return out;
}

function copyFrameIndexArray(raw, length) {
    const len = Math.max(0, int(length || 0));
    if (raw instanceof Uint16Array && raw.length === len) return raw;
    if (raw instanceof Uint32Array && raw.length === len) return raw;
    let maxValue = 0;
    if (raw && Number.isFinite(Number(raw.length))) {
        const n = Math.min(len, int(raw.length || 0));
        for (let i = 0; i < n; i++) {
            const v = Math.max(0, int(raw[i] || 0));
            if (v > maxValue) maxValue = v;
        }
    }
    const out = maxValue > 65535 ? new Uint32Array(len) : new Uint16Array(len);
    if (!raw || !Number.isFinite(Number(raw.length))) return out;
    const n = Math.min(len, int(raw.length || 0));
    for (let i = 0; i < n; i++) out[i] = Math.max(0, int(raw[i] || 0));
    return out;
}

function normalizeCachedFrame(frame) {
    const count = Math.max(0, int(frame?.pointCount || 0));
    return {
        pointCount: count,
        visible: Math.max(0, int(frame?.visible || 0)),
        statusText: String(frame?.statusText || ""),
        elapsedTick: num(frame?.elapsedTick || 0),
        globalCycleAge: num(frame?.globalCycleAge || 0),
        cycleTick: Math.max(0, int(frame?.cycleTick || 0)),
        cycleIndex: int(frame?.cycleIndex || 0),
        runtimeAppliedTick: -1,
        runtimeGlobals: null,
        positions: copyFloatArray(frame?.positions, count * 3),
        colors: copyColorArray(frame?.colors, count * 3),
        sizes: copyFloatArray(frame?.sizes, count),
        alphas: copyAlphaArray(frame?.alphas, count),
        frameIndices: copyFrameIndexArray(frame?.frameIndices, count),
        visibleMask: copyVisibleMask(frame?.visibleMask, count),
        resolvedCurrentAges: null,
        resolvedLifetimes: null,
        manualAgeFlags: null,
        initializedLifetimeFlags: null,
        persistentControllerStates: []
    };
}

class WorkerPreviewRuntime {
    constructor() {
        this.state = {};
        this.pointsGeom = {};
        this.previewPoints = [];
        this.previewBasePoints = [];
        this.previewOwners = [];
        this.previewBirthOffsets = [];
        this.previewOwnerLocalIndex = [];
        this.previewOwnerPointCount = [];
        this.previewAnchorBase = [];
        this.previewLocalBase = [];
        this.previewAnchorRef = [];
        this.previewLocalRef = [];
        this.previewLevelBases = [];
        this.previewLevelRefs = [];
        this.previewLevelOffsetRefs = [];
        this.previewLevelMetas = [];
        this.previewUseLocalOps = [];
        this.previewRootOffsetIndex = [];
        this.previewRootVirtualIndex = [];
        this.previewRootVirtualTotal = 0;
        this.previewLeafTextureConfigs = [];
        this.previewLeafVisualSources = [];
        this.previewPointGroupIndex = null;
        this.previewGroupOwner = [];
        this.previewGroupOwnerCount = [];
        this.previewGroupBirthOffset = [];
        this.previewGroupRootVirtualIndex = [];
        this.previewGroupCard = [];
        this.previewGroupCardIndex = [];
        this.previewVisibleMask = [];
        this.previewExprCountCache = new Map();
        this.previewExprPrefixCache = new Map();
        this.previewExprFnCache = new Map();
        this.previewCondFnCache = new Map();
        this.previewNumericFnCache = new Map();
        this.previewControllerFnCache = new Map();
        this.previewCompiledScriptStateMap = new Map();
        this.previewFoldSimpleActionCache = new Map();
        this.previewVisualRuntimePlanCache = new Map();
        this.previewCardVisualAgeDependentCache = new Map();
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        this.previewRuntimeCycleIndex = 0;
        this.previewCanResumeRuntimeState = true;
        this.previewManualProjectScaleTick = 0;
        this.previewTextureFramesByEffect = {};
        this.initBaseline = null;
        this.snapshotSignature = "";
        this.cycleCfg = null;
        this.exprRuntime = createExpressionRuntime({
            U,
            getState: () => this.state,
            sanitizeIdentifier
        });
        this._particleDataFns = {
            calcTextureFrame: (age, lifetime, frames) => {
                if (frames <= 1) return 0;
                const t = Math.max(0, Math.min(1, num(age) / Math.max(1, num(lifetime))));
                return Math.min(frames - 1, Math.floor(t * frames));
            },
            getParticleDataByName: (effectClass) => {
                const frames = Math.max(0, int(this.previewTextureFramesByEffect?.[String(effectClass || "")] || 0));
                return frames > 0 ? { atlasReady: true, atlas: true, textureLoadOk: true, frames } : null;
            }
        };
    }

    getCardById(cardId) {
        const id = String(cardId || "");
        return (Array.isArray(this.state?.cards) ? this.state.cards : []).find((card) => card?.id === id) || null;
    }

    getCardIndexById(cardId) {
        const id = String(cardId || "");
        return (Array.isArray(this.state?.cards) ? this.state.cards : []).findIndex((card) => card?.id === id);
    }

    syncTextureUniforms() {
    }

    applySnapshot(snapshot = {}) {
        this.snapshotSignature = String(snapshot.snapshotSignature || "");
        this.state = snapshot.state || {};
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.compilePreviewScriptsFromState({ force: true });
        this.previewSourcePointTotal = Math.max(0, int(snapshot.totalCount || snapshot.previewBasePoints?.length || 0));
        this.previewBasePoints = Array.isArray(snapshot.previewBasePoints) ? snapshot.previewBasePoints : [];
        this.previewPoints = this.previewBasePoints.map((p) => U.v(num(p?.x), num(p?.y), num(p?.z)));
        this.previewOwners = Array.isArray(snapshot.previewOwners) ? snapshot.previewOwners : [];
        this.previewBirthOffsets = Array.isArray(snapshot.previewBirthOffsets) ? snapshot.previewBirthOffsets : [];
        this.previewOwnerLocalIndex = Array.isArray(snapshot.previewOwnerLocalIndex) ? snapshot.previewOwnerLocalIndex : [];
        this.previewOwnerPointCount = Array.isArray(snapshot.previewOwnerPointCount) ? snapshot.previewOwnerPointCount : [];
        this.previewAnchorBase = Array.isArray(snapshot.previewAnchorBase) ? snapshot.previewAnchorBase : [];
        this.previewLocalBase = Array.isArray(snapshot.previewLocalBase) ? snapshot.previewLocalBase : [];
        this.previewAnchorRef = Array.isArray(snapshot.previewAnchorRef) ? snapshot.previewAnchorRef : [];
        this.previewLocalRef = Array.isArray(snapshot.previewLocalRef) ? snapshot.previewLocalRef : [];
        this.previewLevelBases = Array.isArray(snapshot.previewLevelBases) ? snapshot.previewLevelBases : [];
        this.previewLevelRefs = Array.isArray(snapshot.previewLevelRefs) ? snapshot.previewLevelRefs : [];
        this.previewLevelOffsetRefs = Array.isArray(snapshot.previewLevelOffsetRefs) ? snapshot.previewLevelOffsetRefs : [];
        this.previewLevelMetas = Array.isArray(snapshot.previewLevelMetas) ? snapshot.previewLevelMetas : [];
        this.previewUseLocalOps = Array.isArray(snapshot.previewUseLocalOps) ? snapshot.previewUseLocalOps : [];
        this.previewRootOffsetIndex = Array.isArray(snapshot.previewRootOffsetIndex) ? snapshot.previewRootOffsetIndex : [];
        this.previewRootVirtualIndex = Array.isArray(snapshot.previewRootVirtualIndex) ? snapshot.previewRootVirtualIndex : [];
        this.previewRootVirtualTotal = Math.max(0, int(snapshot.previewRootVirtualTotal || 0));
        this.previewLeafTextureConfigs = Array.isArray(snapshot.previewLeafTextureConfigs) ? snapshot.previewLeafTextureConfigs : [];
        this.previewLeafVisualSources = Array.isArray(snapshot.previewLeafVisualSources) ? snapshot.previewLeafVisualSources : [];
        this.previewPointGroupIndex = snapshot.previewPointGroupIndex instanceof Int32Array
            ? snapshot.previewPointGroupIndex
            : new Int32Array(snapshot.previewPointGroupIndex || []);
        this.previewGroupOwner = Array.isArray(snapshot.previewGroupOwner) ? snapshot.previewGroupOwner : [];
        this.previewGroupOwnerCount = Array.isArray(snapshot.previewGroupOwnerCount) ? snapshot.previewGroupOwnerCount : [];
        this.previewGroupBirthOffset = Array.isArray(snapshot.previewGroupBirthOffset) ? snapshot.previewGroupBirthOffset : [];
        this.previewGroupRootVirtualIndex = Array.isArray(snapshot.previewGroupRootVirtualIndex) ? snapshot.previewGroupRootVirtualIndex : [];
        this.previewGroupCard = Array.isArray(snapshot.previewGroupCard) ? snapshot.previewGroupCard : [];
        this.previewGroupCardIndex = Array.isArray(snapshot.previewGroupCardIndex) ? snapshot.previewGroupCardIndex : [];
        this.previewTextureFramesByEffect = snapshot.textureFramesByEffect || {};
        this._mergedAtlasOffsets = new Map(Object.entries(snapshot.atlasOffsets || {}).map(([key, value]) => [key, int(value || 0)]));
        this.initBaseline = snapshot.initBaseline || null;
        this.cycleCfg = snapshot.cycleCfg || null;
        this.previewCardById = new Map();
        this.previewCardIndexById = new Map();
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (!card?.id) continue;
            this.previewCardById.set(card.id, card);
            this.previewCardIndexById.set(card.id, i);
        }
        this.previewFrameGroupRuntimeCache = new Array(this.previewGroupOwner.length);
        this.previewFrameAnchorCache = new Array(this.previewGroupOwner.length);
        this.previewFrameLocalCache = new Array(this.previewGroupOwner.length);
        this.previewFrameGroupVisualCache = new Array(this.previewGroupOwner.length);
        this.previewFrameGroupPointVisualCache = new Array(this.previewGroupOwner.length);
    }

    prepareFrameRuntime(frameTime = {}) {
        const count = Math.max(0, int(frameTime.totalCount || this.previewBasePoints.length || 0));
        const baseline = this.initBaseline || {};
        this.previewPoints = this.previewBasePoints.map((p) => U.v(num(p?.x), num(p?.y), num(p?.z)));
        this.previewVisibleMask = new Array(count).fill(false);
        this.previewFrameCurrentAges = new Float32Array(count);
        this.previewFrameLifetimes = new Float32Array(count);
        this.previewFrameLifetimes.fill(100);
        this.previewPersistentCurrentAges = baseline.persistentCurrentAges instanceof Float32Array
            ? new Float32Array(baseline.persistentCurrentAges)
            : new Float32Array(count);
        this.previewPersistentLifetimes = baseline.persistentLifetimes instanceof Float32Array
            ? new Float32Array(baseline.persistentLifetimes)
            : new Float32Array(count).fill(100);
        this.previewManualAgeFlags = baseline.manualAgeFlags instanceof Uint8Array
            ? new Uint8Array(baseline.manualAgeFlags)
            : new Uint8Array(count);
        this.previewInitializedLifetimeFlags = baseline.initializedLifetimeFlags instanceof Uint8Array
            ? new Uint8Array(baseline.initializedLifetimeFlags)
            : new Uint8Array(count);
        this.previewPersistentControllerStates = this.clonePreviewControllerStates(baseline.persistentControllerStates, count);
        this.previewRuntimeGlobals = this.clonePreviewRuntimeGlobals(baseline.runtimeGlobals)
            || this.buildPreviewRuntimeGlobals(0, 0, 0);
        this.previewRuntimeAppliedTick = -1;
        this.previewRuntimeCycleIndex = Number.isFinite(Number(frameTime.cycleIndex)) ? int(frameTime.cycleIndex) : 0;
        this.previewCanResumeRuntimeState = true;
        this.previewManualProjectScaleTick = num(frameTime.globalCycleAge || 0);
    }

    computeSnapshotFrame(frameTime = {}) {
        const totalCount = Math.max(0, int(frameTime.totalCount || this.previewBasePoints.length || 0));
        if (!totalCount) return null;
        this.prepareFrameRuntime(Object.assign({}, frameTime, { totalCount }));
        const frame = this.computePreviewFrame({
            now: 0,
            totalCount,
            elapsedTick: num(frameTime.elapsedTick || 0),
            cycleCfg: frameTime.cycleCfg || this.cycleCfg || null,
            globalCycleAge: num(frameTime.globalCycleAge || 0),
            cycleIndex: int(frameTime.cycleIndex || 0),
            outputToGeometry: false
        });
        return frame ? normalizeCachedFrame(frame) : null;
    }
}

installPreviewRuntimeMethods(WorkerPreviewRuntime, {
    U,
    num,
    int,
    clamp,
    normalizeAnimate,
    normalizeControllerAction,
    normalizeDisplayAction,
    normalizeAlphaHelperConfig,
    normalizeCParticleAlphaConfig,
    normalizeScaleHelperConfig,
    ensureStatusHelperMethods,
    stripJsForLint,
    transpileKotlinThisQualifierToJs,
    rotatePointsToPointUpright,
    srgbRgbToLinearArray,
    CONTROLLER_SCOPE_RESERVED,
    normalizeAngleUnit,
    normalizeAngleOffsetEaseName,
    normalizeAngleOffsetEaseSpecialParams,
    textureEffectWhitelist: TEXTURE_EFFECT_WHITELIST
});

const runtime = new WorkerPreviewRuntime();

self.onmessage = (event) => {
    const data = event?.data || {};
    if (data.type === "setSnapshot") {
        try {
            runtime.applySnapshot(data.snapshot || {});
            self.postMessage({
                type: "snapshotReady",
                generation: data.generation,
                snapshotSignature: runtime.snapshotSignature
            });
        } catch (error) {
            self.postMessage({
                type: "snapshotError",
                generation: data.generation,
                snapshotSignature: String(data.snapshot?.snapshotSignature || ""),
                message: String(error?.message || error || "snapshot failed")
            });
        }
        return;
    }
    if (data.type === "renderFrame") {
        try {
            if (String(data.snapshotSignature || "") !== runtime.snapshotSignature) {
                throw new Error("snapshot mismatch");
            }
            const frame = runtime.computeSnapshotFrame(Object.assign({}, data.frameTime || {}, {
                totalCount: data.totalCount,
                cycleCfg: data.cycleCfg || data.frameTime?.cycleCfg || runtime.cycleCfg || null
            }));
            if (!frame) throw new Error("empty frame");
            const transfer = [
                frame.positions.buffer,
                frame.colors.buffer,
                frame.sizes.buffer,
                frame.alphas.buffer,
                frame.frameIndices.buffer,
                frame.visibleMask.buffer
            ];
            self.postMessage({
                type: "renderFrameReady",
                id: data.id,
                key: data.key,
                generation: data.generation,
                snapshotSignature: data.snapshotSignature,
                frame
            }, transfer);
        } catch (error) {
            self.postMessage({
                type: "renderFrameError",
                id: data.id,
                key: data.key,
                generation: data.generation,
                snapshotSignature: data.snapshotSignature,
                message: String(error?.message || error || "render worker failed")
            });
        }
        return;
    }
    if (data.type !== "cacheFrame") return;
    try {
        const frame = normalizeCachedFrame(data.frame || {});
        const transfer = [
            frame.positions.buffer,
            frame.colors.buffer,
            frame.sizes.buffer,
            frame.alphas.buffer,
            frame.frameIndices.buffer,
            frame.visibleMask.buffer
        ];
        self.postMessage({
            type: "cacheFrameReady",
            id: data.id,
            key: data.key,
            generation: data.generation,
            frame
        }, transfer);
    } catch (error) {
        self.postMessage({
            type: "cacheFrameError",
            id: data.id,
            key: data.key,
            generation: data.generation,
            message: String(error?.message || error || "cache worker failed")
        });
    }
};
