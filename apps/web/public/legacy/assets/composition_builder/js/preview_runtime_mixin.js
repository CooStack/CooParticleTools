import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.182.0/build/three.module.min.js";
import { computeAngleAnimatorAngle } from "./preview_angle_animator.js";

export function installPreviewRuntimeMethods(CompositionBuilderApp, deps = {}) {
    const {
        U,
        num,
        int,
        clamp,
        normalizeAnimate,
        normalizeControllerAction,
        normalizeDisplayAction,
        normalizeAlphaHelperConfig,
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
        textureEffectWhitelist
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installPreviewRuntimeMethods requires CompositionBuilderApp");
    }
    if (!U) throw new Error("installPreviewRuntimeMethods requires Utils dependency");

    const DEFAULT_TEXTURE_EFFECT_WHITELIST = [
        "ControlableEndRodEffect",
        "ControlableEnchantmentEffect",
        "ControlableCloudEffect",
        "ControlableFallingDustEffect",
        "ControlableSplashEffect",
        "ControlableFlashEffect",
        "ControlableFireworkEffect",
    ];
    const TEXTURE_EFFECT_NAME_SET = new Set(
        (Array.isArray(textureEffectWhitelist) && textureEffectWhitelist.length
            ? textureEffectWhitelist
            : DEFAULT_TEXTURE_EFFECT_WHITELIST
        ).map((it) => String(it || "").trim()).filter(Boolean)
    );
    const PREVIEW_GEOMETRY_POINT_LIMIT = 120000;
    const PREVIEW_RENDER_CACHE_MAX_FRAMES = 120;
    const PREVIEW_RENDER_CACHE_MAX_BYTES = 256 * 1024 * 1024;
    const PREVIEW_RENDER_CACHE_HARD_MAX_BYTES = 1024 * 1024 * 1024;
    const PREVIEW_RENDER_CACHE_POINT_LIMIT = PREVIEW_GEOMETRY_POINT_LIMIT;
    const PREVIEW_RENDER_CACHE_SUBFRAMES_PER_TICK = 4;
    const PREVIEW_RENDER_CACHE_WORKER_MIN_POINTS = 8000;
    const PREVIEW_RENDER_CACHE_WORKER_DEFAULT_MAX_WORKERS = 2;
    const PREVIEW_RENDER_CACHE_WORKER_USER_MAX_WORKERS = 16;
    const PREVIEW_RENDER_CACHE_WORKER_MAX_QUEUE = 8;
    const PREVIEW_RENDER_CACHE_WORKER_URL = "./preview_render_cache_worker.js?v=20260725_5";

    class PreviewRuntimeMixin {
    rebuildPreview() {
        this.clearPreviewRenderCache("rebuildPreview");
        this.previewCycleCache = null;
        this.previewExprCountCache.clear();
        this.previewExprPrefixCache.clear();
        this.previewCondFnCache.clear();
        this.previewNumericFnCache.clear();
        this.previewControllerFnCache.clear();
        if (this.previewFoldSimpleActionCache && typeof this.previewFoldSimpleActionCache.clear === "function") {
            this.previewFoldSimpleActionCache.clear();
        }
        if (this.previewVisualRuntimePlanCache && typeof this.previewVisualRuntimePlanCache.clear === "function") {
            this.previewVisualRuntimePlanCache.clear();
        }
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        this.compilePreviewScriptsFromState({ force: false });
        const points = [];
        const owners = [];
        const birthOffsets = [];
        const ownerLocalIndex = [];
        const ownerPointCount = [];
        const anchorBases = [];
        const localBases = [];
        const anchorRefs = [];
        const localRefs = [];
        const levelBases = [];
        const levelRefs = [];
        const levelOffsetRefs = [];
        const levelMetas = [];
        const useLocalOpsList = [];
        const rootOffsetIndexList = [];
        const rootVirtualIndexList = [];
        const leafTextureConfigs = [];
        const leafVisualSources = [];
        const getRootRepeatCount = (card) => {
            if (!card || card.dataType === "single") return 1;
            const cfg = this.resolvePreviewCardAngleOffsetConfig(card);
            return cfg ? Math.max(1, int(cfg.count || 1)) : 1;
        };
        const rootVirtualStarts = new Map();
        let rootVirtualTotal = 0;
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            const repeatCount = getRootRepeatCount(card);
            rootVirtualStarts.set(card.id, rootVirtualTotal);
            rootVirtualTotal += repeatCount;
        }
        if (rootVirtualTotal <= 0) rootVirtualTotal = Math.max(1, this.state.cards.length || 1);
        const appendFlatPoints = (card, pointList) => {
            const src = Array.isArray(pointList) ? pointList : [];
            const len = Math.max(1, src.length);
            const rootStart = int(rootVirtualStarts.get(card?.id) || 0);
            const cardTextureCfg = this.resolvePreviewTextureConfigForCard(card);
            const cardVisualSource = this.resolvePreviewVisualSource(card) || card;
            for (let idx = 0; idx < src.length; idx++) {
                const p = src[idx];
                const v = U.v(num(p?.x), num(p?.y), num(p?.z));
                points.push(v);
                owners.push(card.id);
                birthOffsets.push(0);
                ownerLocalIndex.push(idx);
                ownerPointCount.push(len);
                anchorBases.push(v);
                localBases.push(U.v(0, 0, 0));
                anchorRefs.push(idx);
                localRefs.push(0);
                levelBases.push([]);
                levelRefs.push([]);
                levelOffsetRefs.push([]);
                levelMetas.push([]);
                useLocalOpsList.push(false);
                rootOffsetIndexList.push(0);
                rootVirtualIndexList.push(rootStart);
                leafTextureConfigs.push(cardTextureCfg);
                leafVisualSources.push(cardVisualSource);
            }
        };
        const appendShapePoints = (card, anchors, locals) => {
            const anchorList = Array.isArray(anchors) ? anchors : [];
            const localList = Array.isArray(locals) ? locals : [];
            if (!anchorList.length || !localList.length) return;
            const rootOffsetCfg = this.resolvePreviewCardAngleOffsetConfig(card);
            const repeatCount = rootOffsetCfg ? Math.max(1, int(rootOffsetCfg.count || 1)) : 1;
            const rootStart = int(rootVirtualStarts.get(card?.id) || 0);
            const clonePointCount = Math.max(1, anchorList.length * localList.length);
            for (let ai = 0; ai < anchorList.length; ai++) {
                const a = U.v(num(anchorList[ai]?.x), num(anchorList[ai]?.y), num(anchorList[ai]?.z));
                for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
                    for (let li = 0; li < localList.length; li++) {
                        const tuple = localList[li] || {};
                        const tupleSum = tuple.sum || tuple.local || tuple;
                        const l = U.v(num(tupleSum?.x), num(tupleSum?.y), num(tupleSum?.z));
                        const tupleLevels = Array.isArray(tuple.levels) ? tuple.levels : [];
                        const tupleTextureCfg = tuple.textureCfg || this.resolvePreviewTextureConfigForCard(card);
                        const tupleVisualSource = tuple.visualSource || card;
                        points.push(U.v(a.x + l.x, a.y + l.y, a.z + l.z));
                        owners.push(card.id);
                        birthOffsets.push(0);
                        ownerLocalIndex.push(ai * localList.length + li);
                        ownerPointCount.push(clonePointCount);
                        anchorBases.push(a);
                        localBases.push(l);
                        anchorRefs.push(ai);
                        localRefs.push(li + repeatIndex * localList.length);
                        levelBases.push(tupleLevels.map((it) => U.v(num(it?.vec?.x), num(it?.vec?.y), num(it?.vec?.z))));
                        levelRefs.push(tupleLevels.map((it) => int(it?.ref || 0)));
                        levelOffsetRefs.push(tupleLevels.map((it) => int(it?.offsetIndex ?? 0)));
                        levelMetas.push(tupleLevels.map((it) => ({
                            node: it?.node || null,
                            sharedNode: it?.sharedNode || null,
                            sharedMode: String(it?.sharedMode || ""),
                            sharedOffsetIndex: int(it?.sharedOffsetIndex ?? 0),
                            depth: int(it?.depth || 0)
                        })));
                        useLocalOpsList.push(true);
                        rootOffsetIndexList.push(repeatIndex);
                        rootVirtualIndexList.push(rootStart + repeatIndex);
                        leafTextureConfigs.push(tupleTextureCfg);
                        leafVisualSources.push(tupleVisualSource);
                    }
                }
            }
        };
        for (const card of this.state.cards) {
            const basePoints = [];
            if (card.bindMode === "point") {
                basePoints.push(U.v(card.point.x, card.point.y, card.point.z));
            } else {
                const built = this.evaluateBuilderPoints(card.builderState);
                for (const p of (built.points || [])) {
                    basePoints.push(U.v(p.x, p.y, p.z));
                }
            }

            if (card.dataType !== "single" && basePoints.length) {
                const locals = this.buildShapeLocalTuplesForPreview(card);
                if (locals.length) {
                    appendShapePoints(card, basePoints, locals);
                }
                continue;
            }

            if (basePoints.length) {
                appendFlatPoints(card, basePoints);
            }
        }
        const sourcePointTotal = points.length;
        if (sourcePointTotal > PREVIEW_GEOMETRY_POINT_LIMIT) {
            const sampleIndices = [];
            const sampleCount = PREVIEW_GEOMETRY_POINT_LIMIT;
            for (let i = 0; i < sampleCount; i++) {
                sampleIndices.push(Math.min(sourcePointTotal - 1, Math.floor(i * sourcePointTotal / sampleCount)));
            }
            const sampleInPlace = (list) => {
                const sampled = new Array(sampleCount);
                for (let i = 0; i < sampleCount; i++) sampled[i] = list[sampleIndices[i]];
                list.length = sampleCount;
                for (let i = 0; i < sampleCount; i++) list[i] = sampled[i];
            };
            sampleInPlace(points);
            sampleInPlace(owners);
            sampleInPlace(birthOffsets);
            sampleInPlace(ownerLocalIndex);
            sampleInPlace(ownerPointCount);
            sampleInPlace(anchorBases);
            sampleInPlace(localBases);
            sampleInPlace(anchorRefs);
            sampleInPlace(localRefs);
            sampleInPlace(levelBases);
            sampleInPlace(levelRefs);
            sampleInPlace(levelOffsetRefs);
            sampleInPlace(levelMetas);
            sampleInPlace(useLocalOpsList);
            sampleInPlace(rootOffsetIndexList);
            sampleInPlace(rootVirtualIndexList);
            sampleInPlace(leafTextureConfigs);
            sampleInPlace(leafVisualSources);
        }
        this.previewSourcePointTotal = sourcePointTotal;
        this.previewBasePoints = points.map((p) => U.clone(p));
        this.previewPoints = points.map((p) => U.clone(p));
        this.previewOwners = owners;
        this.previewBirthOffsets = birthOffsets;
        this.previewOwnerLocalIndex = ownerLocalIndex;
        this.previewOwnerPointCount = ownerPointCount;
        this.previewAnchorBase = anchorBases;
        this.previewLocalBase = localBases;
        this.previewAnchorRef = anchorRefs;
        this.previewLocalRef = localRefs;
        this.previewLevelBases = levelBases;
        this.previewLevelRefs = levelRefs;
        this.previewLevelOffsetRefs = levelOffsetRefs;
        this.previewLevelMetas = levelMetas;
        this.previewUseLocalOps = useLocalOpsList;
        this.previewRootOffsetIndex = rootOffsetIndexList;
        this.previewRootVirtualIndex = rootVirtualIndexList;
        this.previewRootVirtualTotal = rootVirtualTotal;
        this.previewLeafTextureConfigs = leafTextureConfigs;
        this.previewLeafVisualSources = leafVisualSources;
        this.rebuildPreviewRuntimeIndex();
        this.previewAnimStart = performance.now();
        this.updatePreviewGeometry(points, owners);
    }

    rebuildPreviewRuntimeIndex() {
        const cards = Array.isArray(this.state.cards) ? this.state.cards : [];
        const cardById = new Map();
        const cardIndexById = new Map();
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (!card || !card.id) continue;
            cardById.set(card.id, card);
            cardIndexById.set(card.id, i);
        }
        this.previewCardById = cardById;
        this.previewCardIndexById = cardIndexById;
        this.previewCardVisualAgeDependentCache = new Map();

        const count = Math.max(0, int(this.previewBasePoints?.length || 0));
        const pointGroupIndex = new Int32Array(count);
        pointGroupIndex.fill(-1);
        const groupOwner = [];
        const groupOwnerCount = [];
        const groupBirthOffset = [];
        const groupRootVirtualIndex = [];
        const groupCard = [];
        const groupCardIndex = [];
        const groupByOwnerKey = new Map();

        for (let i = 0; i < count; i++) {
            const owner = this.previewOwners?.[i];
            let byKey = groupByOwnerKey.get(owner);
            if (!byKey) {
                byKey = new Map();
                groupByOwnerKey.set(owner, byKey);
            }
            const birthKey = int(num(this.previewBirthOffsets?.[i] || 0) * 1000);
            const birthOffset = birthKey / 1000;
            const rootVirtualIndex = int(
                this.previewRootVirtualIndex?.[i]
                ?? cardIndexById.get(owner)
                ?? 0
            );
            const key = `${birthKey}:${rootVirtualIndex}`;
            let groupId = byKey.get(key);
            if (groupId === undefined) {
                groupId = groupOwner.length;
                byKey.set(key, groupId);
                groupOwner.push(owner);
                groupOwnerCount.push(Math.max(1, int(this.previewOwnerPointCount?.[i] || 1)));
                groupBirthOffset.push(birthOffset);
                groupRootVirtualIndex.push(rootVirtualIndex);
                const card = cardById.get(owner) || null;
                groupCard.push(card);
                groupCardIndex.push(Number.isFinite(Number(cardIndexById.get(owner))) ? int(cardIndexById.get(owner)) : -1);
            }
            pointGroupIndex[i] = groupId;
        }

        this.previewPointGroupIndex = pointGroupIndex;
        this.previewGroupOwner = groupOwner;
        this.previewGroupOwnerCount = groupOwnerCount;
        this.previewGroupBirthOffset = groupBirthOffset;
        this.previewGroupRootVirtualIndex = groupRootVirtualIndex;
        this.previewGroupCard = groupCard;
        this.previewGroupCardIndex = groupCardIndex;

        const groupCount = groupOwner.length;
        this.previewFrameGroupRuntimeCache = new Array(groupCount);
        this.previewFrameAnchorCache = new Array(groupCount);
        this.previewFrameLocalCache = new Array(groupCount);
        this.previewFrameGroupVisualCache = new Array(groupCount);
        this.previewFrameGroupPointVisualCache = new Array(groupCount);
    }

    makePreviewDisplayActionCompileKey(scope = "display", cardId = "", scopeLevel = -1, actionIndex = 0) {
        const s = String(scope || "display");
        const cid = String(cardId || "");
        const lv = Number.isFinite(Number(scopeLevel)) ? int(scopeLevel) : -1;
        const idx = Math.max(0, int(actionIndex || 0));
        return `display|${s}|${cid}|${lv}|${idx}`;
    }

    makePreviewControllerScriptCompileKey(cardId = "", actionIndex = 0) {
        const cid = String(cardId || "");
        const idx = Math.max(0, int(actionIndex || 0));
        return `controller|${cid}|${idx}`;
    }

    ensurePreviewCompiledScriptStores() {
        if (!(this.previewCompiledScriptStateMap instanceof Map)) {
            this.previewCompiledScriptStateMap = new Map();
        }
    }

    getPreviewCompiledScriptState(key) {
        this.ensurePreviewCompiledScriptStores();
        return this.previewCompiledScriptStateMap.get(String(key || "")) || null;
    }

    markPreviewCompiledScriptFailure(key, sourceRaw, message = "compile failed") {
        const compileKey = String(key || "");
        if (!compileKey) return { ok: false, usedFallback: false, message: String(message || "") };
        this.ensurePreviewCompiledScriptStores();
        const src = transpileKotlinThisQualifierToJs(String(sourceRaw || "").trim());
        let state = this.previewCompiledScriptStateMap.get(compileKey);
        if (!state) {
            state = {
                compiledSource: "",
                fn: null,
                lastAttemptSource: "",
                lastAttemptOk: true,
                lastError: ""
            };
            this.previewCompiledScriptStateMap.set(compileKey, state);
        }
        state.lastAttemptSource = src;
        state.lastAttemptOk = false;
        state.lastError = String(message || "compile failed");
        const usedFallback = typeof state.fn === "function" && String(state.compiledSource || "") !== src;
        return { ok: false, usedFallback, message: state.lastError };
    }

    compilePreviewCompiledScriptInternal(key, sourceRaw, kind = "display_expression", opts = {}) {
        const compileKey = String(key || "");
        if (!compileKey) return { ok: false, usedFallback: false, message: "missing compile key" };
        const src = transpileKotlinThisQualifierToJs(String(sourceRaw || "").trim());
        const force = opts.force === true;
        this.ensurePreviewCompiledScriptStores();
        let state = this.previewCompiledScriptStateMap.get(compileKey);
        if (!state) {
            state = {
                compiledSource: "",
                fn: null,
                lastAttemptSource: "",
                lastAttemptOk: true,
                lastError: ""
            };
            this.previewCompiledScriptStateMap.set(compileKey, state);
        }
        if (!force && state.lastAttemptSource === src) {
            const usedFallback = !state.lastAttemptOk && typeof state.fn === "function" && String(state.compiledSource || "") !== src;
            return {
                ok: !!state.lastAttemptOk,
                usedFallback,
                fn: (String(state.compiledSource || "") === src && typeof state.fn === "function") ? state.fn : null,
                message: String(state.lastError || "")
            };
        }
        state.lastAttemptSource = src;
        if (!src) {
            state.lastAttemptOk = true;
            state.lastError = "";
            state.compiledSource = "";
            state.fn = null;
            return { ok: true, usedFallback: false, fn: null };
        }
        try {
            let fn = null;
            if (kind === "controller_script") {
                fn = new Function(
                    "vars",
                    "point",
                    "particle",
                    "rotateToPoint",
                    "rotateAsAxis",
                    "rotateToWithAngle",
                    "addSingle",
                    "addMultiple",
                    "addPreTickAction",
                    "thisAt",
                    `with(vars){ try { ${src}\n } catch(_e) {} }; return vars;`
                );
                if (this.previewControllerFnCache.size > 1024) this.previewControllerFnCache.clear();
                this.previewControllerFnCache.set(src, fn);
            } else {
                fn = new Function(
                    "vars",
                    "point",
                    "rotateToPoint",
                    "rotateAsAxis",
                    "rotateToWithAngle",
                    "addSingle",
                    "addMultiple",
                    "thisAt",
                    `with(vars){ try { ${src}\n } catch(_e) {} }; return point;`
                );
                if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                this.previewExprFnCache.set(src, fn);
            }
            state.lastAttemptOk = true;
            state.lastError = "";
            state.compiledSource = src;
            state.fn = fn;
            return { ok: true, usedFallback: false, fn };
        } catch (e) {
            state.lastAttemptOk = false;
            state.lastError = String(e?.message || e || "compile failed");
            const usedFallback = typeof state.fn === "function" && String(state.compiledSource || "") !== src;
            return { ok: false, usedFallback, fn: usedFallback ? state.fn : null, message: state.lastError };
        }
    }

    compilePreviewDisplayExpression(key, sourceRaw, opts = {}) {
        return this.compilePreviewCompiledScriptInternal(key, sourceRaw, "display_expression", opts);
    }

    compilePreviewControllerScript(key, sourceRaw, opts = {}) {
        return this.compilePreviewCompiledScriptInternal(key, sourceRaw, "controller_script", opts);
    }

    markPreviewDisplayExpressionCompileFailure(key, sourceRaw, message = "compile failed") {
        return this.markPreviewCompiledScriptFailure(key, sourceRaw, message);
    }

    markPreviewControllerCompileFailure(key, sourceRaw, message = "compile failed") {
        return this.markPreviewCompiledScriptFailure(key, sourceRaw, message);
    }

    getPreviewCompiledScriptFn(key, sourceRaw) {
        const state = this.getPreviewCompiledScriptState(key);
        if (!state) return null;
        const src = transpileKotlinThisQualifierToJs(String(sourceRaw || "").trim());
        if (String(state.compiledSource || "") === src && typeof state.fn === "function") {
            return state.fn;
        }
        if (state.lastAttemptOk === false && String(state.lastAttemptSource || "") === src && typeof state.fn === "function") {
            return state.fn;
        }
        return null;
    }

    compilePreviewScriptsFromState(opts = {}) {
        const force = opts.force === true;
        const summary = { total: 0, compiled: 0, failed: 0, fallback: 0 };
        const eatDisplayActions = (list, scope, cardId = "", scopeLevel = -1) => {
            const arr = Array.isArray(list) ? list : [];
            for (let i = 0; i < arr.length; i++) {
                const action = normalizeDisplayAction(arr[i]);
                if (action.type !== "expression") continue;
                const key = this.makePreviewDisplayActionCompileKey(scope, cardId, scopeLevel, i);
                const res = this.compilePreviewDisplayExpression(key, String(action.expression || ""), { force });
                summary.total += 1;
                if (res.ok) summary.compiled += 1;
                else if (res.usedFallback) summary.fallback += 1;
                else summary.failed += 1;
            }
        };
        const eatControllerActions = (sourceId, list) => {
            const id = String(sourceId || "").trim();
            if (!id) return;
            const arr = Array.isArray(list) ? list : [];
            for (let i = 0; i < arr.length; i++) {
                const key = this.makePreviewControllerScriptCompileKey(id, i);
                const res = this.compilePreviewControllerScript(key, String(arr[i]?.script || ""), { force });
                summary.total += 1;
                if (res.ok) summary.compiled += 1;
                else if (res.usedFallback) summary.fallback += 1;
                else summary.failed += 1;
            }
        };

        eatDisplayActions(this.state.displayActions || [], "display", "", -1);
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            if (!card || !card.id) continue;
            eatDisplayActions(card.shapeDisplayActions || [], "shape_display", card.id, 0);
            eatControllerActions(card.id, card.controllerActions || []);
            const eatTreeChildren = (children, depth) => {
                if (!Array.isArray(children)) return;
                for (const child of children) {
                    if (!child) continue;
                    eatDisplayActions(child.displayActions || [], "shape_level_display", card.id, depth);
                    eatControllerActions(child.id, child.controllerActions || []);
                    if (Array.isArray(child.children) && child.children.length) {
                        eatTreeChildren(child.children, depth + 1);
                    }
                }
            };
            eatTreeChildren(card.shapeChildren || [], 1);
        }
        return summary;
    }

    canReusePreviewRuntimeState(count, owners) {
        const safeCount = Math.max(0, int(count || 0));
        if (safeCount <= 0) return false;
        const prevOwners = Array.isArray(this.previewRuntimeStateOwners) ? this.previewRuntimeStateOwners : null;
        const prevOwnerLocalIndex = Array.isArray(this.previewRuntimeStateOwnerLocalIndex) ? this.previewRuntimeStateOwnerLocalIndex : null;
        const prevRootVirtualIndex = Array.isArray(this.previewRuntimeStateRootVirtualIndex) ? this.previewRuntimeStateRootVirtualIndex : null;
        const prevAnchorRef = Array.isArray(this.previewRuntimeStateAnchorRef) ? this.previewRuntimeStateAnchorRef : null;
        const prevLocalRef = Array.isArray(this.previewRuntimeStateLocalRef) ? this.previewRuntimeStateLocalRef : null;
        const prevBirthOffsets = Array.isArray(this.previewRuntimeStateBirthOffsets) ? this.previewRuntimeStateBirthOffsets : null;
        if (!prevOwners || !prevOwnerLocalIndex || !prevRootVirtualIndex || !prevAnchorRef || !prevLocalRef || !prevBirthOffsets) {
            return false;
        }
        if (prevOwners.length !== safeCount
            || prevOwnerLocalIndex.length !== safeCount
            || prevRootVirtualIndex.length !== safeCount
            || prevAnchorRef.length !== safeCount
            || prevLocalRef.length !== safeCount
            || prevBirthOffsets.length !== safeCount) {
            return false;
        }
        const ownerLocalIndex = Array.isArray(this.previewOwnerLocalIndex) ? this.previewOwnerLocalIndex : [];
        const rootVirtualIndex = Array.isArray(this.previewRootVirtualIndex) ? this.previewRootVirtualIndex : [];
        const anchorRef = Array.isArray(this.previewAnchorRef) ? this.previewAnchorRef : [];
        const localRef = Array.isArray(this.previewLocalRef) ? this.previewLocalRef : [];
        const birthOffsets = Array.isArray(this.previewBirthOffsets) ? this.previewBirthOffsets : [];
        if (ownerLocalIndex.length !== safeCount
            || rootVirtualIndex.length !== safeCount
            || anchorRef.length !== safeCount
            || localRef.length !== safeCount
            || birthOffsets.length !== safeCount) {
            return false;
        }
        for (let i = 0; i < safeCount; i++) {
            if (String(prevOwners[i] || "") !== String(owners?.[i] || "")) return false;
            if (int(prevOwnerLocalIndex[i] || 0) !== int(ownerLocalIndex[i] || 0)) return false;
            if (int(prevRootVirtualIndex[i] || 0) !== int(rootVirtualIndex[i] || 0)) return false;
            if (int(prevAnchorRef[i] || 0) !== int(anchorRef[i] || 0)) return false;
            if (int(prevLocalRef[i] || 0) !== int(localRef[i] || 0)) return false;
            if (int(num(prevBirthOffsets[i] || 0) * 1000) !== int(num(birthOffsets[i] || 0) * 1000)) return false;
        }
        return true;
    }

    snapshotPreviewRuntimeStateLayout(owners) {
        this.previewRuntimeStateOwners = Array.isArray(owners) ? owners.slice() : [];
        this.previewRuntimeStateOwnerLocalIndex = Array.isArray(this.previewOwnerLocalIndex) ? this.previewOwnerLocalIndex.slice() : [];
        this.previewRuntimeStateRootVirtualIndex = Array.isArray(this.previewRootVirtualIndex) ? this.previewRootVirtualIndex.slice() : [];
        this.previewRuntimeStateAnchorRef = Array.isArray(this.previewAnchorRef) ? this.previewAnchorRef.slice() : [];
        this.previewRuntimeStateLocalRef = Array.isArray(this.previewLocalRef) ? this.previewLocalRef.slice() : [];
        this.previewRuntimeStateBirthOffsets = Array.isArray(this.previewBirthOffsets) ? this.previewBirthOffsets.slice() : [];
    }

    updatePreviewGeometry(points, owners) {
        if (!this.pointsGeom) return;
        const count = points.length;
        const posAttr = this.pointsGeom.getAttribute("position");
        const colAttr = this.pointsGeom.getAttribute("color");
        const sizeAttr = this.pointsGeom.getAttribute("aSize");
        const alphaAttr = this.pointsGeom.getAttribute("aAlpha");
        if (!posAttr || posAttr.array.length !== count * 3) {
            this.pointsGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        if (!colAttr || colAttr.array.length !== count * 3) {
            this.pointsGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        if (!sizeAttr || sizeAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        if (!alphaAttr || alphaAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        const frameAttr = this.pointsGeom.getAttribute("aFrameIndex");
        if (!frameAttr || frameAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aFrameIndex", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        const positions = this.pointsGeom.getAttribute("position").array;
        const colors = this.pointsGeom.getAttribute("color").array;
        const sizes = this.pointsGeom.getAttribute("aSize").array;
        const alphas = this.pointsGeom.getAttribute("aAlpha").array;
        const initialProjectAlpha = this.resolveProjectAlphaPreviewInitialValue(this.state?.projectAlpha);
        this.previewVisibleMask = new Array(count).fill(true);
        this.previewInteractionVisibleMask = this.previewVisibleMask;
        this.previewSizeFactors = new Array(count).fill(1);
        this.previewAlphaFactors = new Array(count).fill(1);
        const visualCache = new Map();
        const linearColorCache = new Map();
        const pointVisualSources = Array.isArray(this.previewLeafVisualSources) ? this.previewLeafVisualSources : [];
        for (let i = 0; i < count; i++) {
            const p = points[i];
            positions[i * 3 + 0] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const owner = owners[i];
            const pointVisualSource = pointVisualSources[i] || null;
            const visualKey = pointVisualSource
                ? `${String(owner || "")}|${String(pointVisualSource.id || "__card__")}`
                : String(owner || "");
            let visual = visualCache.get(visualKey);
            if (!visual) {
                visual = this.resolveCardPreviewVisual(owner, { visualSource: pointVisualSource });
                visualCache.set(visualKey, visual);
            }
            let rgb = linearColorCache.get(visualKey);
            if (!rgb) {
                rgb = srgbRgbToLinearArray(visual.color);
                linearColorCache.set(visualKey, rgb);
            }
            colors[i * 3 + 0] = rgb[0];
            colors[i * 3 + 1] = rgb[1];
            colors[i * 3 + 2] = rgb[2];
            sizes[i] = Math.max(0.05, num(visual.size));
            const baseAlpha = clamp(num(visual.alpha), 0, 1);
            alphas[i] = clamp(baseAlpha * initialProjectAlpha, 0, 1);
            this.previewSizeFactors[i] = Math.max(0.05, num(visual.size));
            this.previewAlphaFactors[i] = alphas[i];
        }
        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        const frameIndices = this.pointsGeom.getAttribute("aFrameIndex")?.array;
        if (frameIndices) {
            frameIndices.fill(0);
            this.pointsGeom.attributes.aFrameIndex.needsUpdate = true;
        }
        const nextRuntimeStateSignature = this.makePreviewStructuralStateSignature();
        const canReuseRuntimeState = this.previewRuntimeStateSignature === nextRuntimeStateSignature
            && this.canReusePreviewRuntimeState(count, owners);
        const prevPersistentCurrentAges = this.previewPersistentCurrentAges;
        const prevPersistentLifetimes = this.previewPersistentLifetimes;
        const prevManualAgeFlags = this.previewManualAgeFlags;
        const prevInitializedLifetimeFlags = this.previewInitializedLifetimeFlags;
        const prevPersistentControllerStates = this.previewPersistentControllerStates;
        this.previewPersistentCurrentAges = (canReuseRuntimeState
            && prevPersistentCurrentAges instanceof Float32Array
            && prevPersistentCurrentAges.length === count)
            ? new Float32Array(prevPersistentCurrentAges)
            : new Float32Array(count);
        this.previewPersistentLifetimes = (canReuseRuntimeState
            && prevPersistentLifetimes instanceof Float32Array
            && prevPersistentLifetimes.length === count)
            ? new Float32Array(prevPersistentLifetimes)
            : new Float32Array(count).fill(100);
        this.previewManualAgeFlags = (canReuseRuntimeState
            && prevManualAgeFlags instanceof Uint8Array
            && prevManualAgeFlags.length === count)
            ? new Uint8Array(prevManualAgeFlags)
            : new Uint8Array(count);
        this.previewInitializedLifetimeFlags = (canReuseRuntimeState
            && prevInitializedLifetimeFlags instanceof Uint8Array
            && prevInitializedLifetimeFlags.length === count)
            ? new Uint8Array(prevInitializedLifetimeFlags)
            : new Uint8Array(count);
        this.previewPersistentControllerStates = (canReuseRuntimeState
            && Array.isArray(prevPersistentControllerStates)
            && prevPersistentControllerStates.length === count)
            ? prevPersistentControllerStates.slice()
            : new Array(count).fill(null);
        this.previewCanResumeRuntimeState = canReuseRuntimeState;
        this.previewRenderWorkerInitBaselineReady = canReuseRuntimeState
            && this.previewRenderWorkerInitBaselineReady === true;
        this.previewRuntimeStateSignature = nextRuntimeStateSignature;
        this.snapshotPreviewRuntimeStateLayout(owners);
        this.syncTextureUniforms();
        this.pointsGeom.computeBoundingSphere();
        if (this.pointsMat) this.pointsMat.size = this.state.settings.pointSize;
        const sourceCount = Math.max(count, int(this.previewSourcePointTotal || this.previewBasePoints.length || count));
        const statusText = `点数: ${count}/${sourceCount}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
        this.updateSelectionStatus();
    }

    makePreviewStructuralStateSignature() {
        const stripPreviewLayerState = (key, value) => {
            if (key === "previewVisible" || key === "previewSolo") return undefined;
            return value;
        };
        try {
            const target = typeof this.extractProjectState === "function"
                ? this.extractProjectState(this.state)
                : {
                    cards: this.state?.cards || [],
                    displayActions: this.state?.displayActions || [],
                    compositionType: this.state?.compositionType || "",
                    previewPlayTicks: this.state?.previewPlayTicks || 0,
                    disabledInterval: this.state?.disabledInterval || 0,
                    projectAlpha: this.state?.projectAlpha || null,
                    projectScale: this.state?.projectScale || null
                };
            return JSON.stringify(target || {}, stripPreviewLayerState);
        } catch {
            return `fallback:${Date.now()}`;
        }
    }

    makePreviewSettingsRenderSignature() {
        try {
            const settings = Object.assign({}, this.state?.settings || {});
            delete settings.previewFocusSingleCard;
            delete settings.previewRenderCacheEnabled;
            delete settings.previewCacheWorkerCount;
            return JSON.stringify(settings || {});
        } catch {
            return "";
        }
    }

    makePreviewLayerVisibilitySignature() {
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        const soloIds = cards
            .filter((card) => card && card.previewSolo === true)
            .map((card) => String(card.id || ""))
            .filter(Boolean);
        if (soloIds.length) return `solo:${soloIds.join(",")}`;
        return `visible:${cards
            .filter((card) => card && card.previewVisible !== false)
            .map((card) => String(card.id || ""))
            .filter(Boolean)
            .join(",")}`;
    }

    getPreviewRenderCacheMaxBytes(totalCount = null, cycleCfg = null) {
        const count = totalCount == null
            ? Math.max(0, int(this.previewBasePoints?.length || 0))
            : Math.max(0, int(totalCount || 0));
        const resolvedCycleCfg = cycleCfg || this.getPreviewCycleConfig?.() || {};
        const cycleTotal = Math.max(1, Math.ceil(num(resolvedCycleCfg?.total || 1)));
        const bytesPerFrame = Math.max(1, this.estimatePreviewFrameBytes(count));
        const oneFramePerTickBytes = bytesPerFrame * (cycleTotal + 1);
        const targetBytes = Math.max(PREVIEW_RENDER_CACHE_MAX_BYTES, oneFramePerTickBytes);
        return Math.max(1, Math.min(PREVIEW_RENDER_CACHE_HARD_MAX_BYTES, Math.ceil(targetBytes)));
    }

    getPreviewRenderCacheSubframesPerTick(totalCount = null, cycleCfg = null) {
        const count = totalCount == null
            ? Math.max(0, int(this.previewBasePoints?.length || 0))
            : Math.max(0, int(totalCount || 0));
        const resolvedCycleCfg = cycleCfg || this.getPreviewCycleConfig?.() || {};
        let subframes = count >= 100000 ? 2 : PREVIEW_RENDER_CACHE_SUBFRAMES_PER_TICK;
        const cycleTotal = Math.max(1, Math.ceil(num(resolvedCycleCfg?.total || 1)));
        const bytesPerFrame = Math.max(1, this.estimatePreviewFrameBytes(count));
        const maxBytes = this.getPreviewRenderCacheMaxBytes(count, resolvedCycleCfg);
        const maxFramesByBytes = Math.max(0, Math.floor(maxBytes / bytesPerFrame));
        while (subframes > 1 && (maxFramesByBytes <= 0 || (cycleTotal * subframes + 1) > maxFramesByBytes)) {
            subframes = Math.max(1, Math.floor(subframes / 2));
        }
        return subframes;
    }

    getPreviewRenderCacheMaxFrames(totalCount = null, cycleCfg = null) {
        const subframes = this.getPreviewRenderCacheSubframesPerTick(totalCount, cycleCfg);
        const resolvedCycleCfg = cycleCfg || this.getPreviewCycleConfig?.() || {};
        const count = totalCount == null
            ? Math.max(0, int(this.previewBasePoints?.length || 0))
            : Math.max(0, int(totalCount || 0));
        const cycleTotal = Math.max(1, Math.ceil(num(resolvedCycleCfg?.total || 1)));
        const cycleFrameCount = Math.max(1, cycleTotal * subframes + 1);
        const bytesPerFrame = Math.max(1, this.estimatePreviewFrameBytes(count));
        const maxBytes = this.getPreviewRenderCacheMaxBytes(count, resolvedCycleCfg);
        const maxFramesByBytes = Math.max(1, Math.floor(maxBytes / bytesPerFrame));
        return Math.max(1, Math.min(cycleFrameCount, maxFramesByBytes));
    }

    resolvePreviewFrameTimeContext(context = {}) {
        const cycleCfg = context.cycleCfg || this.getPreviewCycleConfig();
        const cycleTotal = Math.max(1e-6, num(cycleCfg?.total || 1));
        const rawElapsedTick = Number.isFinite(Number(context.elapsedTick))
            ? num(context.elapsedTick)
            : ((performance.now() - this.previewAnimStart) / 50);
        const rawGlobalCycleAge = Number.isFinite(Number(context.globalCycleAge))
            ? num(context.globalCycleAge)
            : ((rawElapsedTick % cycleTotal) + cycleTotal) % cycleTotal;
        const cycleIndex = Number.isFinite(Number(context.cycleIndex))
            ? int(context.cycleIndex)
            : (cycleTotal > 1e-6 ? Math.floor(rawElapsedTick / cycleTotal) : 0);
        const totalCount = Math.max(0, int(context.totalCount ?? this.previewBasePoints?.length ?? 0));
        const subframes = this.getPreviewRenderCacheSubframesPerTick(totalCount, cycleCfg);
        const cycleFrameCount = Math.max(1, Math.ceil(cycleTotal * subframes));
        const renderFrame = clamp(Math.floor(Math.max(0, rawGlobalCycleAge) * subframes + 1e-6), 0, cycleFrameCount - 1);
        const globalCycleAge = Math.min(Math.max(0, renderFrame / subframes), Math.max(0, cycleTotal - (1 / subframes)));
        const elapsedTick = cycleIndex * cycleTotal + globalCycleAge;
        return {
            elapsedTick,
            globalCycleAge,
            cycleIndex,
            tickStep: Math.max(0, Math.floor(globalCycleAge)),
            renderFrame,
            subframes,
            cycleFrameCount
        };
    }

    makePreviewRenderSignature() {
        const count = Math.max(0, int(this.previewBasePoints?.length || 0));
        const sourceCount = Math.max(0, int(this.previewSourcePointTotal || count));
        const nextSignature = [
            `generation:${int(this.previewRenderCacheGeneration || 0)}`,
            `count:${count}`,
            `source:${sourceCount}`,
            `rootTotal:${int(this.previewRootVirtualTotal || 0)}`
        ].join("||");
        this.previewRenderSignature = nextSignature;
        return this.previewRenderSignature;
    }

    makePreviewTextureCacheKey() {
        const offsets = this._mergedAtlasOffsets;
        if (!(offsets instanceof Map) || !offsets.size) return "none";
        return Array.from(offsets.entries())
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
            .map(([name, offset]) => `${String(name)}:${int(offset || 0)}`)
            .join(",");
    }

    isPreviewRenderCacheEnabled() {
        return this.state?.settings?.previewRenderCacheEnabled !== false;
    }

    makePreviewFrameCacheKey(context = {}) {
        if (!this.isPreviewRenderCacheEnabled()) return "";
        const totalCount = Math.max(0, int(context.totalCount ?? this.previewBasePoints?.length ?? 0));
        const cycleCfg = context.cycleCfg || this.getPreviewCycleConfig();
        const cache = this.ensurePreviewRenderCache(totalCount, { cycleCfg });
        if (!cache || cache.disabled) return "";
        const globalCycleAge = Number.isFinite(Number(context.globalCycleAge))
            ? num(context.globalCycleAge)
            : 0;
        const frameTime = this.resolvePreviewFrameTimeContext(Object.assign({}, context, { cycleCfg, globalCycleAge }));
        const tickStep = frameTime.tickStep;
        const cycleKey = [
            cycleCfg?.appear,
            cycleCfg?.live,
            cycleCfg?.fade,
            cycleCfg?.play,
            cycleCfg?.total
        ].map((v) => Math.round(num(v || 0) * 1000)).join(",");
        return [
            this.makePreviewRenderSignature(),
            `cycle:${cycleKey}`,
            `tick:${tickStep}`,
            `renderFrame:${frameTime.renderFrame}/${frameTime.subframes}`,
            `globalCycleAge:${Math.round(frameTime.globalCycleAge * 1000)}`,
            `layers:${this.makePreviewLayerVisibilitySignature()}`,
            `texture:${this.makePreviewTextureCacheKey()}`
        ].join("||");
    }

    ensurePreviewBoundedFrameCache(cacheProp, opts = {}) {
        const prop = String(cacheProp || "previewRenderCache");
        let cache = this[prop];
        if (!cache || !(cache.frames instanceof Map)) {
            cache = {
                frames: new Map(),
                bytes: 0,
                maxFrames: Math.max(1, int(opts.maxFrames || PREVIEW_RENDER_CACHE_MAX_FRAMES)),
                maxBytes: Math.max(1, int(opts.maxBytes || PREVIEW_RENDER_CACHE_MAX_BYTES)),
                pointLimit: Math.max(0, int(opts.pointLimit ?? PREVIEW_RENDER_CACHE_POINT_LIMIT)),
                disabled: false,
                hits: 0,
                misses: 0,
                stores: 0,
                evictions: 0,
                lastClearReason: "",
                completeSignature: ""
            };
            this[prop] = cache;
        }
        if (typeof cache.completeSignature !== "string") cache.completeSignature = "";
        cache.maxFrames = Math.max(1, int(opts.maxFrames || cache.maxFrames || PREVIEW_RENDER_CACHE_MAX_FRAMES));
        cache.maxBytes = Math.max(1, int(opts.maxBytes || cache.maxBytes || PREVIEW_RENDER_CACHE_MAX_BYTES));
        cache.pointLimit = Math.max(0, int(opts.pointLimit ?? cache.pointLimit ?? PREVIEW_RENDER_CACHE_POINT_LIMIT));
        const count = opts.pointCount == null ? null : Math.max(0, int(opts.pointCount || 0));
        const estimatedBytes = Number.isFinite(Number(opts.estimatedBytes))
            ? Math.max(0, int(opts.estimatedBytes || 0))
            : 0;
        const disabledBySetting = prop === "previewRenderCache" && !this.isPreviewRenderCacheEnabled();
        const tooLarge = disabledBySetting
            || (count != null && cache.pointLimit > 0 && count > cache.pointLimit)
            || (estimatedBytes > 0 && estimatedBytes > cache.maxBytes);
        cache.disabled = tooLarge;
        cache.disabledReason = disabledBySetting ? "setting" : (tooLarge ? "limit" : "");
        if (tooLarge && cache.frames.size) {
            cache.frames.clear();
            cache.bytes = 0;
            cache.completeSignature = "";
        } else if (!tooLarge) {
            while (cache.frames.size > cache.maxFrames || cache.bytes > cache.maxBytes) {
                const first = cache.frames.keys().next();
                if (!first || first.done) break;
                const evicted = cache.frames.get(first.value);
                cache.frames.delete(first.value);
                cache.bytes = Math.max(0, cache.bytes - int(evicted?.bytes || 0));
                cache.evictions += 1;
                cache.completeSignature = "";
            }
        }
        return cache;
    }

    clearPreviewBoundedFrameCache(cacheProp, reason = "") {
        const cache = this[String(cacheProp || "previewRenderCache")];
        if (cache && cache.frames instanceof Map) {
            cache.frames.clear();
            cache.bytes = 0;
            cache.hits = 0;
            cache.misses = 0;
            cache.stores = 0;
            cache.evictions = 0;
            cache.lastClearReason = String(reason || "");
            cache.completeSignature = "";
        }
    }

    getPreviewBoundedFrameCacheEntry(cacheProp, key, opts = {}) {
        if (!key) return null;
        const cache = this.ensurePreviewBoundedFrameCache(cacheProp, opts);
        if (!cache || cache.disabled) return null;
        const record = cache.frames.get(key);
        if (!record) {
            cache.misses += 1;
            return null;
        }
        cache.frames.delete(key);
        cache.frames.set(key, record);
        cache.hits += 1;
        return record.value;
    }

    storePreviewBoundedFrameCacheEntry(cacheProp, key, value, opts = {}) {
        if (!key || value == null) return false;
        const estimatedBytes = typeof opts.estimateBytes === "function"
            ? opts.estimateBytes(value)
            : (Number.isFinite(Number(opts.estimatedBytes)) ? int(opts.estimatedBytes || 0) : 0);
        const cache = this.ensurePreviewBoundedFrameCache(cacheProp, Object.assign({}, opts, { estimatedBytes }));
        if (!cache || cache.disabled) return false;
        const entry = typeof opts.clone === "function" ? opts.clone(value) : value;
        const bytes = typeof opts.estimateBytes === "function"
            ? opts.estimateBytes(entry)
            : (estimatedBytes || 0);
        if (bytes <= 0 || bytes > cache.maxBytes) return false;
        const old = cache.frames.get(key);
        const isNewKey = !old;
        if (old) {
            cache.bytes = Math.max(0, cache.bytes - int(old.bytes || 0));
            cache.frames.delete(key);
        }
        while (cache.frames.size >= cache.maxFrames || cache.bytes + bytes > cache.maxBytes) {
            const first = cache.frames.keys().next();
            if (!first || first.done) break;
            const evicted = cache.frames.get(first.value);
            cache.frames.delete(first.value);
            cache.bytes = Math.max(0, cache.bytes - int(evicted?.bytes || 0));
            cache.evictions += 1;
            cache.completeSignature = "";
        }
        if (cache.bytes + bytes > cache.maxBytes) return false;
        cache.frames.set(key, { value: entry, bytes });
        if (isNewKey) cache.completeSignature = "";
        cache.bytes += bytes;
        cache.stores += 1;
        return true;
    }

    ensurePreviewRenderCache(totalCount = null, context = {}) {
        const count = totalCount == null
            ? Math.max(0, int(this.previewBasePoints?.length || 0))
            : Math.max(0, int(totalCount || 0));
        const cycleCfg = context?.cycleCfg || context;
        const maxFrames = this.getPreviewRenderCacheMaxFrames(count, cycleCfg);
        const maxBytes = this.getPreviewRenderCacheMaxBytes(count, cycleCfg);
        const requiredFrames = Math.max(1, Math.ceil(num(cycleCfg?.total || this.getPreviewCycleConfig?.().total || 1))
            * this.getPreviewRenderCacheSubframesPerTick(count, cycleCfg) + 1);
        const estimatedBytes = this.estimatePreviewFrameBytes(count);
        return this.ensurePreviewBoundedFrameCache("previewRenderCache", {
            maxFrames,
            maxBytes,
            pointLimit: PREVIEW_RENDER_CACHE_POINT_LIMIT,
            pointCount: count,
            estimatedBytes,
            workingSetBytes: estimatedBytes * requiredFrames
        });
    }

    clearPreviewRenderCache(reason = "") {
        this.clearPreviewBoundedFrameCache("previewRenderCache", reason);
        this.previewRenderSignature = "";
        this.previewLastAppliedFrameKey = "";
        this.previewRenderCacheGeneration = int(this.previewRenderCacheGeneration || 0) + 1;
        this.clearPreviewRenderCacheWorkerQueue(reason);
        this.updatePreviewCacheStatus();
    }

    resetPreviewRuntimeCurrentAgeState(persistentCurrentAges, manualAgeFlags, totalCount = 0) {
        const count = Math.max(0, int(totalCount || 0));
        if (!(persistentCurrentAges instanceof Float32Array)
            || !(manualAgeFlags instanceof Uint8Array)
            || persistentCurrentAges.length !== count
            || manualAgeFlags.length !== count) {
            return;
        }
        if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== count) {
            this.rebuildPreviewRuntimeIndex();
        }
        const pointGroupIndex = this.previewPointGroupIndex;
        const pointVisualSources = Array.isArray(this.previewLeafVisualSources) ? this.previewLeafVisualSources : [];
        const groupOwner = Array.isArray(this.previewGroupOwner) ? this.previewGroupOwner : [];
        const groupCard = Array.isArray(this.previewGroupCard) ? this.previewGroupCard : [];
        const ownerIds = this.previewOwners;
        for (let i = 0; i < count; i++) {
            if (manualAgeFlags[i] !== 1) {
                persistentCurrentAges[i] = 0;
                continue;
            }
            const groupId = pointGroupIndex && i < pointGroupIndex.length ? pointGroupIndex[i] : -1;
            const owner = groupId >= 0 ? (groupOwner[groupId] || ownerIds?.[i]) : ownerIds?.[i];
            const ownerCardRef = groupId >= 0
                ? (groupCard[groupId] || this.getCardById(owner))
                : this.getCardById(owner);
            const pointVisualSource = pointVisualSources[i] || null;
            const dependency = ownerCardRef
                ? this.getCardPreviewVisualDependency(ownerCardRef, pointVisualSource ? { visualSource: pointVisualSource } : {})
                : null;
            if (dependency?.initPointDependentCurrentAge) continue;
            persistentCurrentAges[i] = 0;
            manualAgeFlags[i] = 0;
        }
    }

    getPreviewRenderCacheStatusText() {
        if (!this.isPreviewRenderCacheEnabled()) return "缓存: 关闭";
        const cache = this.previewRenderCache;
        if (!cache || !(cache.frames instanceof Map)) return "缓存: --";
        if (cache.disabled) return "缓存: 关闭";
        const frames = cache.frames.size;
        const maxFrames = Math.max(1, int(cache.maxFrames || PREVIEW_RENDER_CACHE_MAX_FRAMES));
        const hits = Math.max(0, int(cache.hits || 0));
        const misses = Math.max(0, int(cache.misses || 0));
        const lookups = hits + misses;
        const hitRate = lookups > 0 ? Math.round((hits * 100) / lookups) : 0;
        const workerText = this.getPreviewRenderCacheWorkerStatusText();
        return `缓存: ${frames}/${maxFrames} 命中 ${hitRate}%${workerText}`;
    }

    updatePreviewCacheStatus() {
        if (!this.dom?.statusCache) return;
        const text = this.getPreviewRenderCacheStatusText();
        if (this.lastPreviewCacheStatusText === text) return;
        this.lastPreviewCacheStatusText = text;
        this.dom.statusCache.textContent = text;
    }

    getPreviewRenderCacheWorkerStatusText() {
        const pool = this.previewRenderCacheWorkerPool;
        if (!pool || pool.disabled || !Array.isArray(pool.workers) || !pool.workers.length) return "";
        const pending = (pool.pending instanceof Map ? pool.pending.size : 0)
            + (Array.isArray(pool.queue) ? pool.queue.length : 0);
        const active = Math.max(0, int(pool.active || 0));
        if (pending || active) return ` 线程${pool.workers.length} 构建${pending + active}`;
        if (Math.max(0, int(pool.stores || 0)) > 0) return ` 线程${pool.workers.length}`;
        return "";
    }

    getPreviewRenderCacheWorkerCount() {
        const configured = clamp(
            int(this.state?.settings?.previewCacheWorkerCount || 0),
            0,
            PREVIEW_RENDER_CACHE_WORKER_USER_MAX_WORKERS
        );
        if (configured > 0) return configured;
        const hardware = Math.max(1, int((globalThis.navigator?.hardwareConcurrency || 2) - 1));
        return Math.max(1, Math.min(PREVIEW_RENDER_CACHE_WORKER_DEFAULT_MAX_WORKERS, hardware));
    }

    ensurePreviewRenderCacheWorkerPool(totalCount = 0) {
        if (!this.isPreviewRenderCacheEnabled()) return null;
        const count = Math.max(0, int(totalCount || 0));
        if (count < PREVIEW_RENDER_CACHE_WORKER_MIN_POINTS) return null;
        if (typeof Worker === "undefined") return null;
        const workerCount = this.getPreviewRenderCacheWorkerCount();
        let pool = this.previewRenderCacheWorkerPool;
        if (pool && !pool.disabled && Array.isArray(pool.workers) && pool.workers.length
            && int(pool.workerCount || pool.workers.length) !== workerCount) {
            this.disposePreviewRenderCacheWorkerPool("worker-count-change", { disable: false });
            pool = null;
        }
        if (pool && !pool.disabled && Array.isArray(pool.workers) && pool.workers.length) return pool;
        if (pool?.disabled) return null;
        pool = {
            workers: [],
            queue: [],
            pending: new Map(),
            buildKeys: new Set(),
            nextWorker: 0,
            active: 0,
            workerCount,
            maxQueue: Math.max(PREVIEW_RENDER_CACHE_WORKER_MAX_QUEUE, workerCount * 3),
            snapshotSignature: "",
            disabled: false,
            stores: 0,
            errors: 0,
            rejected: 0
        };
        try {
            const workerUrl = new URL(PREVIEW_RENDER_CACHE_WORKER_URL, import.meta.url);
            for (let i = 0; i < workerCount; i++) {
                const worker = new Worker(workerUrl, {
                    type: "module",
                    name: `composition-preview-cache-${i + 1}`
                });
                worker.onmessage = (event) => this.handlePreviewRenderCacheWorkerMessage(event);
                worker.onerror = () => {
                    pool.errors += 1;
                    this.disposePreviewRenderCacheWorkerPool("worker-error");
                    this.updatePreviewCacheStatus();
                };
                pool.workers.push(worker);
            }
        } catch {
            pool.disabled = true;
            pool.workers = [];
        }
        this.previewRenderCacheWorkerPool = pool;
        return pool.disabled || !pool.workers.length ? null : pool;
    }

    disposePreviewRenderCacheWorkerPool(reason = "", opts = {}) {
        const pool = this.previewRenderCacheWorkerPool;
        if (!pool) return;
        if (Array.isArray(pool.workers)) {
            for (const worker of pool.workers) {
                try {
                    worker.terminate();
                } catch {
                }
            }
        }
        pool.workers = [];
        pool.queue = [];
        if (pool.pending instanceof Map) pool.pending.clear();
        if (pool.buildKeys instanceof Set) pool.buildKeys.clear();
        pool.active = 0;
        pool.snapshotSignature = "";
        pool.disabled = opts.disable !== false;
        pool.lastDisposeReason = String(reason || "");
        if (opts.disable === false && this.previewRenderCacheWorkerPool === pool) {
            this.previewRenderCacheWorkerPool = null;
        }
    }

    clearPreviewRenderCacheWorkerQueue(reason = "") {
        this.previewRenderWorkerGeneration = int(this.previewRenderWorkerGeneration || 0) + 1;
        const pool = this.previewRenderCacheWorkerPool;
        if (!pool) return;
        pool.queue = [];
        if (pool.pending instanceof Map) pool.pending.clear();
        if (pool.buildKeys instanceof Set) pool.buildKeys.clear();
        pool.active = 0;
        pool.snapshotSignature = "";
        pool.lastClearReason = String(reason || "");
    }

    makePreviewRenderWorkerPlainClone(value) {
        const seen = new WeakMap();
        const clone = (raw) => {
            if (!raw || typeof raw !== "object") return raw;
            if (typeof raw === "function") return undefined;
            if (raw instanceof Float32Array) return new Float32Array(raw);
            if (raw instanceof Int32Array) return new Int32Array(raw);
            if (raw instanceof Uint8Array) return new Uint8Array(raw);
            if (raw instanceof Map) return Array.from(raw.entries()).map(([k, v]) => [k, clone(v)]);
            if (seen.has(raw)) return seen.get(raw);
            if (Array.isArray(raw)) {
                const out = new Array(raw.length);
                seen.set(raw, out);
                for (let i = 0; i < raw.length; i++) out[i] = clone(raw[i]);
                return out;
            }
            const out = {};
            seen.set(raw, out);
            for (const [key, child] of Object.entries(raw)) {
                if (typeof child === "function") continue;
                out[key] = clone(child);
            }
            return out;
        };
        return clone(value);
    }

    makePreviewRenderWorkerTextureSnapshot() {
        const framesByEffect = {};
        const { getParticleDataByName } = this._particleDataFns || {};
        const visitCfg = (cfg) => {
            const effectClass = String(cfg?.effectClass || "").trim();
            if (!effectClass || cfg?.useTexture === false) return;
            let frames = 0;
            try {
                const pData = typeof getParticleDataByName === "function" ? getParticleDataByName(effectClass) : null;
                frames = Math.max(0, int(pData?.frames || 0));
            } catch {
                frames = 0;
            }
            if (frames > 0) framesByEffect[effectClass] = frames;
        };
        for (const cfg of (Array.isArray(this.previewLeafTextureConfigs) ? this.previewLeafTextureConfigs : [])) {
            visitCfg(cfg);
        }
        for (const card of (Array.isArray(this.state?.cards) ? this.state.cards : [])) {
            visitCfg(this.resolvePreviewLeafTextureConfig(card));
        }
        const atlasOffsets = {};
        const offsets = this._mergedAtlasOffsets;
        if (offsets instanceof Map) {
            for (const [name, offset] of offsets.entries()) {
                atlasOffsets[String(name || "")] = Math.max(0, int(offset || 0));
            }
        }
        return { framesByEffect, atlasOffsets };
    }

    makePreviewRenderWorkerSnapshotSignature(totalCount = 0, cycleCfg = null) {
        const count = Math.max(0, int(totalCount || this.previewBasePoints?.length || 0));
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const cycleKey = [
            cycle?.appear,
            cycle?.live,
            cycle?.fade,
            cycle?.play,
            cycle?.total
        ].map((v) => Math.round(num(v || 0) * 1000)).join(",");
        return [
            this.makePreviewRenderSignature(),
            `cycle:${cycleKey}`,
            `layers:${this.makePreviewLayerVisibilitySignature()}`,
            `texture:${this.makePreviewTextureCacheKey()}`
        ].join("||");
    }

    hasPreviewRenderWorkerInitDependencies(totalCount = 0) {
        const count = Math.max(0, int(totalCount || 0));
        if (!count) return false;
        if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== count) {
            this.rebuildPreviewRuntimeIndex();
        }
        const pointGroupIndex = this.previewPointGroupIndex;
        const groupOwner = Array.isArray(this.previewGroupOwner) ? this.previewGroupOwner : [];
        const groupCard = Array.isArray(this.previewGroupCard) ? this.previewGroupCard : [];
        const ownerIds = Array.isArray(this.previewOwners) ? this.previewOwners : [];
        const pointVisualSources = Array.isArray(this.previewLeafVisualSources) ? this.previewLeafVisualSources : [];
        for (let i = 0; i < count; i++) {
            const groupId = pointGroupIndex && i < pointGroupIndex.length ? int(pointGroupIndex[i]) : -1;
            const owner = groupId >= 0 ? (groupOwner[groupId] || ownerIds[i]) : ownerIds[i];
            const ownerCard = groupId >= 0 ? (groupCard[groupId] || this.getCardById(owner)) : this.getCardById(owner);
            if (!ownerCard) continue;
            const pointVisualSource = pointVisualSources[i] || null;
            const dependency = this.getCardPreviewVisualDependency(ownerCard, pointVisualSource ? { visualSource: pointVisualSource } : {});
            if (dependency?.initPointDependentCurrentAge || dependency?.initPointDependentLifetime) return true;
        }
        return false;
    }

    makePreviewRenderWorkerInitBaseline(totalCount = 0, cycleCfg = null) {
        const count = Math.max(0, int(totalCount || 0));
        const hasInitDependencies = this.hasPreviewRenderWorkerInitDependencies(count);
        const sourceAges = this.previewPersistentCurrentAges;
        const sourceLifetimes = this.previewPersistentLifetimes;
        const sourceManualFlags = this.previewManualAgeFlags;
        const sourceLifetimeFlags = this.previewInitializedLifetimeFlags;
        const hasInitializedState = this.previewRenderWorkerInitBaselineReady === true
            && sourceAges instanceof Float32Array
            && sourceAges.length === count
            && sourceLifetimes instanceof Float32Array
            && sourceLifetimes.length === count
            && sourceManualFlags instanceof Uint8Array
            && sourceManualFlags.length === count
            && sourceLifetimeFlags instanceof Uint8Array
            && sourceLifetimeFlags.length === count;
        if (hasInitDependencies && !hasInitializedState) return null;
        const currentAges = hasInitializedState ? new Float32Array(sourceAges) : new Float32Array(count);
        const lifetimes = hasInitializedState ? new Float32Array(sourceLifetimes) : new Float32Array(count);
        if (!hasInitializedState) lifetimes.fill(100);
        const manualAgeFlags = hasInitializedState ? new Uint8Array(sourceManualFlags) : new Uint8Array(count);
        const initializedLifetimeFlags = hasInitializedState ? new Uint8Array(sourceLifetimeFlags) : new Uint8Array(count);
        const controllerStates = Array.isArray(this.previewPersistentControllerStates)
            ? this.clonePreviewControllerStates(this.previewPersistentControllerStates, count)
            : new Array(count).fill(null);
        const runtimeGlobals = this.buildPreviewRuntimeGlobals(0, 0, 0);
        this.syncPreviewStatusWithCycle(runtimeGlobals, cycleCfg || this.getPreviewCycleConfig(), 0, 0);
        for (let i = 0; i < count; i++) {
            if (!Number.isFinite(Number(lifetimes[i])) || lifetimes[i] < 1) lifetimes[i] = 100;
        }
        if (hasInitDependencies && hasInitializedState) {
            if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== count) {
                this.rebuildPreviewRuntimeIndex();
            }
            const pointGroupIndex = this.previewPointGroupIndex;
            const groupOwner = Array.isArray(this.previewGroupOwner) ? this.previewGroupOwner : [];
            const groupCard = Array.isArray(this.previewGroupCard) ? this.previewGroupCard : [];
            const ownerIds = Array.isArray(this.previewOwners) ? this.previewOwners : [];
            const ownerLocalIndex = Array.isArray(this.previewOwnerLocalIndex) ? this.previewOwnerLocalIndex : [];
            const pointVisualSources = Array.isArray(this.previewLeafVisualSources) ? this.previewLeafVisualSources : [];
            let mutatedBaseline = false;
            for (let i = 0; i < count; i++) {
                const groupId = pointGroupIndex && i < pointGroupIndex.length ? int(pointGroupIndex[i]) : -1;
                const owner = groupId >= 0 ? (groupOwner[groupId] || ownerIds[i]) : ownerIds[i];
                const ownerCard = groupId >= 0 ? (groupCard[groupId] || this.getCardById(owner)) : this.getCardById(owner);
                const pointVisualSource = pointVisualSources[i] || null;
                const dependency = ownerCard
                    ? this.getCardPreviewVisualDependency(ownerCard, pointVisualSource ? { visualSource: pointVisualSource } : {})
                    : null;
                if (!dependency?.initPointDependentCurrentAge) {
                    if (currentAges[i] !== 0 || manualAgeFlags[i] !== 0) mutatedBaseline = true;
                    currentAges[i] = 0;
                    manualAgeFlags[i] = 0;
                }
                if (!dependency?.initPointDependentLifetime) {
                    if (lifetimes[i] !== 100 || initializedLifetimeFlags[i] !== 0) mutatedBaseline = true;
                    lifetimes[i] = 100;
                    initializedLifetimeFlags[i] = 0;
                }
                if (!ownerCard) continue;
                const needsCurrentAge = dependency?.initPointDependentCurrentAge && manualAgeFlags[i] !== 1;
                const needsLifetime = dependency?.initPointDependentLifetime && initializedLifetimeFlags[i] !== 1;
                if (!needsCurrentAge && !needsLifetime) continue;
                const localIndex = Math.max(0, int(ownerLocalIndex[i] || 0));
                const visual = this.resolveCardPreviewVisual(owner, {
                    runtimeVars: runtimeGlobals,
                    elapsedTick: 0,
                    ageTick: 0,
                    currentAge: currentAges[i],
                    lifetime: lifetimes[i],
                    keepInitializedCurrentAge: manualAgeFlags[i] === 1,
                    keepInitializedLifetime: initializedLifetimeFlags[i] === 1,
                    controllerState: controllerStates[i],
                    pointIndex: localIndex,
                    visualSource: pointVisualSource
                });
                if (needsCurrentAge && visual?.__manualCurrentAge === true && Number.isFinite(Number(visual.__resolvedCurrentAge))) {
                    currentAges[i] = Math.max(0, num(visual.__resolvedCurrentAge));
                    manualAgeFlags[i] = 1;
                    mutatedBaseline = true;
                }
                if (needsLifetime && Number.isFinite(Number(visual?.__resolvedLifetime))) {
                    lifetimes[i] = Math.max(1, int(visual.__resolvedLifetime));
                    initializedLifetimeFlags[i] = 1;
                    mutatedBaseline = true;
                }
                if (visual?.__controllerState && typeof visual.__controllerState === "object") {
                    controllerStates[i] = this.clonePreviewControllerState(visual.__controllerState);
                    mutatedBaseline = true;
                }
            }
            if (mutatedBaseline) {
                sourceAges.set(currentAges);
                sourceLifetimes.set(lifetimes);
                sourceManualFlags.set(manualAgeFlags);
                sourceLifetimeFlags.set(initializedLifetimeFlags);
                if (Array.isArray(this.previewPersistentControllerStates)) {
                    this.previewPersistentControllerStates = this.clonePreviewControllerStates(controllerStates, count);
                }
            }
        }
        return {
            runtimeGlobals: this.makePreviewRenderWorkerPlainClone(runtimeGlobals),
            persistentCurrentAges: currentAges,
            persistentLifetimes: lifetimes,
            manualAgeFlags,
            initializedLifetimeFlags,
            persistentControllerStates: controllerStates
        };
    }

    makePreviewRenderWorkerSnapshot(totalCount = 0, cycleCfg = null) {
        const count = Math.max(0, int(totalCount || 0));
        if (!count) return null;
        if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== count) {
            this.rebuildPreviewRuntimeIndex();
        }
        const snapshotSignature = this.makePreviewRenderWorkerSnapshotSignature(count, cycleCfg);
        const texture = this.makePreviewRenderWorkerTextureSnapshot();
        const initBaseline = this.makePreviewRenderWorkerInitBaseline(count, cycleCfg);
        if (!initBaseline) return null;
        return {
            version: 1,
            snapshotSignature,
            renderSignature: this.previewRenderSignature || this.makePreviewRenderSignature(),
            generation: int(this.previewRenderWorkerGeneration || 0),
            totalCount: count,
            state: this.state,
            cycleCfg: cycleCfg || this.getPreviewCycleConfig(),
            previewBasePoints: this.previewBasePoints,
            previewOwners: this.previewOwners,
            previewBirthOffsets: this.previewBirthOffsets,
            previewOwnerLocalIndex: this.previewOwnerLocalIndex,
            previewOwnerPointCount: this.previewOwnerPointCount,
            previewAnchorBase: this.previewAnchorBase,
            previewLocalBase: this.previewLocalBase,
            previewAnchorRef: this.previewAnchorRef,
            previewLocalRef: this.previewLocalRef,
            previewLevelBases: this.previewLevelBases,
            previewLevelRefs: this.previewLevelRefs,
            previewLevelOffsetRefs: this.previewLevelOffsetRefs,
            previewLevelMetas: this.previewLevelMetas,
            previewUseLocalOps: this.previewUseLocalOps,
            previewRootOffsetIndex: this.previewRootOffsetIndex,
            previewRootVirtualIndex: this.previewRootVirtualIndex,
            previewRootVirtualTotal: this.previewRootVirtualTotal,
            previewLeafTextureConfigs: this.previewLeafTextureConfigs,
            previewLeafVisualSources: this.previewLeafVisualSources,
            previewPointGroupIndex: this.previewPointGroupIndex,
            previewGroupOwner: this.previewGroupOwner,
            previewGroupOwnerCount: this.previewGroupOwnerCount,
            previewGroupBirthOffset: this.previewGroupBirthOffset,
            previewGroupRootVirtualIndex: this.previewGroupRootVirtualIndex,
            previewGroupCard: this.previewGroupCard,
            previewGroupCardIndex: this.previewGroupCardIndex,
            textureFramesByEffect: texture.framesByEffect,
            atlasOffsets: texture.atlasOffsets,
            initBaseline
        };
    }

    ensurePreviewRenderWorkerSnapshot(pool, totalCount = 0, cycleCfg = null) {
        if (!pool || pool.disabled || !Array.isArray(pool.workers) || !pool.workers.length) return null;
        const count = Math.max(0, int(totalCount || 0));
        const snapshotSignature = this.makePreviewRenderWorkerSnapshotSignature(count, cycleCfg);
        if (pool.snapshotSignature === snapshotSignature) return { snapshotSignature };
        const snapshot = this.makePreviewRenderWorkerSnapshot(count, cycleCfg);
        if (!snapshot) return null;
        this.previewRenderWorkerGeneration = int(this.previewRenderWorkerGeneration || 0) + 1;
        snapshot.generation = int(this.previewRenderWorkerGeneration || 0);
        pool.snapshotSignature = snapshot.snapshotSignature;
        pool.queue = [];
        if (pool.pending instanceof Map) pool.pending.clear();
        if (pool.buildKeys instanceof Set) pool.buildKeys.clear();
        pool.active = 0;
        for (const worker of pool.workers) {
            try {
                worker.postMessage({
                    type: "setSnapshot",
                    generation: int(this.previewRenderWorkerGeneration || 0),
                    snapshot
                });
            } catch {
                pool.errors += 1;
            }
        }
        return snapshot;
    }

    makePreviewWorkerCacheFrame(frame) {
        const count = Math.max(0, int(frame?.pointCount || 0));
        if (!count || frame?.attributesWrittenToGeometry === true) return null;
        const positions = frame?.positions;
        const colors = frame?.colors;
        const sizes = frame?.sizes;
        const alphas = frame?.alphas;
        const frameIndices = frame?.frameIndices;
        if (!(positions instanceof Float32Array) || positions.length !== count * 3) return null;
        if (!(colors instanceof Float32Array) || colors.length !== count * 3) return null;
        if (!(sizes instanceof Float32Array) || sizes.length !== count) return null;
        if (!(alphas instanceof Float32Array) || alphas.length !== count) return null;
        if (!(frameIndices instanceof Float32Array) || frameIndices.length !== count) return null;
        const transfer = [
            positions.buffer,
            colors.buffer,
            sizes.buffer,
            alphas.buffer,
            frameIndices.buffer
        ];
        const visibleMask = frame.visibleMask instanceof Uint8Array
            ? frame.visibleMask
            : (Array.isArray(frame.visibleMask) ? frame.visibleMask.slice() : null);
        if (visibleMask instanceof Uint8Array) transfer.push(visibleMask.buffer);
        return {
            frame: {
                pointCount: count,
                visible: Math.max(0, int(frame?.visible || 0)),
                statusText: String(frame?.statusText || ""),
                elapsedTick: num(frame?.elapsedTick || 0),
                globalCycleAge: num(frame?.globalCycleAge || 0),
                cycleTick: Math.max(0, int(frame?.cycleTick || 0)),
                cycleIndex: int(frame?.cycleIndex || 0),
                positions,
                colors,
                sizes,
                alphas,
                frameIndices,
                visibleMask
            },
            transfer
        };
    }

    queuePreviewCachedFrameWorkerStore(key, frame, context = {}) {
        if (!this.isPreviewRenderCacheEnabled()) return false;
        if (!key || !frame) return false;
        const count = Math.max(0, int(frame.pointCount || 0));
        const pool = this.ensurePreviewRenderCacheWorkerPool(count);
        if (!pool || pool.disabled || !Array.isArray(pool.workers) || !pool.workers.length) return false;
        const pending = pool.pending instanceof Map ? pool.pending.size : 0;
        const queued = Array.isArray(pool.queue) ? pool.queue.length : 0;
        if (pending + queued >= Math.max(1, int(pool.maxQueue || PREVIEW_RENDER_CACHE_WORKER_MAX_QUEUE))) {
            pool.rejected += 1;
            return false;
        }
        const payload = this.makePreviewWorkerCacheFrame(frame);
        if (!payload) return false;
        const id = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
        pool.queue.push({
            id,
            key,
            generation: int(this.previewRenderWorkerGeneration || 0),
            cycleCfg: context?.cycleCfg || context,
            frame: payload.frame,
            transfer: payload.transfer
        });
        this.drainPreviewRenderCacheWorkerQueue();
        this.updatePreviewCacheStatus();
        return true;
    }

    hasPreviewCachedFrameKey(key) {
        if (!key) return false;
        const cache = this.previewRenderCache;
        return !!(cache && cache.frames instanceof Map && cache.frames.has(key));
    }

    queuePreviewRenderCacheBuilds(context = {}) {
        if (!this.isPreviewRenderCacheEnabled()) return false;
        const totalCount = Math.max(0, int(context.totalCount || this.previewBasePoints?.length || 0));
        if (!totalCount) return false;
        const cycleCfg = context.cycleCfg || this.getPreviewCycleConfig();
        const cache = this.ensurePreviewRenderCache(totalCount, { cycleCfg });
        if (!cache || cache.disabled) return false;
        const pool = this.ensurePreviewRenderCacheWorkerPool(totalCount);
        if (!pool || pool.disabled || !Array.isArray(pool.workers) || !pool.workers.length) return false;
        const snapshot = this.ensurePreviewRenderWorkerSnapshot(pool, totalCount, cycleCfg);
        if (!snapshot?.snapshotSignature) return false;
        if (!(pool.pending instanceof Map)) pool.pending = new Map();
        if (!(pool.buildKeys instanceof Set)) pool.buildKeys = new Set();
        const frameTime = context.frameTime || this.resolvePreviewFrameTimeContext({
            totalCount,
            cycleCfg,
            elapsedTick: context.elapsedTick,
            globalCycleAge: context.globalCycleAge,
            cycleIndex: context.cycleIndex
        });
        const cycleFrameCount = Math.max(1, int(frameTime.cycleFrameCount || 1));
        const subframes = Math.max(1, int(frameTime.subframes || this.getPreviewRenderCacheSubframesPerTick(totalCount, cycleCfg)));
        const targetFrameCount = Math.max(1, Math.min(cycleFrameCount, Math.max(1, int(cache.maxFrames || cycleFrameCount))));
        const cycleTotal = Math.max(1e-6, num(cycleCfg?.total || 1));
        const cycleIndex = Number.isFinite(Number(frameTime.cycleIndex)) ? int(frameTime.cycleIndex) : 0;
        const startFrame = clamp(int(frameTime.renderFrame || 0), 0, cycleFrameCount - 1);
        const coversFullCycle = targetFrameCount >= cycleFrameCount;
        const completionSignature = coversFullCycle
            ? [
                snapshot.snapshotSignature,
                `frames:${targetFrameCount}/${cycleFrameCount}`,
                `subframes:${subframes}`
            ].join("||")
            : "";
        if (completionSignature && cache.completeSignature === completionSignature) return false;
        const activeOrQueued = (pool.pending instanceof Map ? pool.pending.size : 0)
            + (Array.isArray(pool.queue) ? pool.queue.length : 0);
        let budget = Math.max(0, int(pool.maxQueue || PREVIEW_RENDER_CACHE_WORKER_MAX_QUEUE) - activeOrQueued);
        if (budget <= 0) return false;
        const skipKey = String(context.skipKey || "");
        let queuedAny = false;
        for (let offset = 0; offset < targetFrameCount && budget > 0; offset++) {
            const renderFrame = (startFrame + offset) % cycleFrameCount;
            const globalCycleAge = Math.min(
                Math.max(0, renderFrame / subframes),
                Math.max(0, cycleTotal - (1 / subframes))
            );
            const taskFrameTime = this.resolvePreviewFrameTimeContext({
                totalCount,
                cycleCfg,
                globalCycleAge,
                cycleIndex,
                elapsedTick: cycleIndex * cycleTotal + globalCycleAge
            });
            const key = this.makePreviewFrameCacheKey({
                totalCount,
                elapsedTick: taskFrameTime.elapsedTick,
                cycleCfg,
                globalCycleAge: taskFrameTime.globalCycleAge,
                cycleIndex: taskFrameTime.cycleIndex,
                tickStep: taskFrameTime.tickStep,
                renderFrame: taskFrameTime.renderFrame
            });
            if (!key || key === skipKey) continue;
            if (this.hasPreviewCachedFrameKey(key) || pool.buildKeys.has(key)) continue;
            const id = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
            pool.queue.push({
                type: "renderFrame",
                id,
                key,
                generation: int(this.previewRenderWorkerGeneration || 0),
                snapshotSignature: snapshot.snapshotSignature,
                cycleCfg,
                frameTime: taskFrameTime,
                totalCount
            });
            pool.buildKeys.add(key);
            budget -= 1;
            queuedAny = true;
        }
        if (queuedAny) {
            this.drainPreviewRenderCacheWorkerQueue();
            this.updatePreviewCacheStatus();
        } else if (completionSignature && activeOrQueued === 0 && (!pool.buildKeys || pool.buildKeys.size === 0)) {
            cache.completeSignature = completionSignature;
        }
        return queuedAny;
    }

    drainPreviewRenderCacheWorkerQueue() {
        const pool = this.previewRenderCacheWorkerPool;
        if (!pool || pool.disabled || !Array.isArray(pool.workers) || !pool.workers.length) return;
        if (!(pool.pending instanceof Map)) pool.pending = new Map();
        while (pool.queue.length && pool.active < pool.workers.length) {
            const task = pool.queue.shift();
            const worker = pool.workers[pool.nextWorker % pool.workers.length];
            pool.nextWorker = (pool.nextWorker + 1) % pool.workers.length;
            pool.pending.set(task.id, {
                type: task.type || "cacheFrame",
                key: task.key,
                generation: task.generation,
                cycleCfg: task.cycleCfg,
                snapshotSignature: task.snapshotSignature || ""
            });
            pool.active += 1;
            try {
                if (task.type === "renderFrame") {
                    worker.postMessage({
                        type: "renderFrame",
                        id: task.id,
                        key: task.key,
                        generation: task.generation,
                        snapshotSignature: task.snapshotSignature,
                        cycleCfg: task.cycleCfg,
                        frameTime: task.frameTime,
                        totalCount: task.totalCount
                    });
                } else {
                    worker.postMessage({
                        type: "cacheFrame",
                        id: task.id,
                        key: task.key,
                        generation: task.generation,
                        frame: task.frame
                    }, task.transfer);
                }
            } catch {
                pool.pending.delete(task.id);
                pool.active = Math.max(0, int(pool.active || 0) - 1);
                pool.errors += 1;
                if (task.type === "renderFrame") {
                    if (pool.buildKeys instanceof Set) pool.buildKeys.delete(task.key);
                } else {
                    this.storePreviewCachedFrame(task.key, task.frame, { cycleCfg: task.cycleCfg });
                }
            }
        }
    }

    handlePreviewRenderCacheWorkerMessage(event) {
        const data = event?.data || {};
        const pool = this.previewRenderCacheWorkerPool;
        if (!pool || !(pool.pending instanceof Map)) return;
        if (data.type === "snapshotReady") return;
        if (data.type === "snapshotError") {
            pool.errors += 1;
            const isCurrentSnapshot = int(data.generation || 0) === int(this.previewRenderWorkerGeneration || 0)
                && String(data.snapshotSignature || "") === String(pool.snapshotSignature || "");
            if (!isCurrentSnapshot) {
                this.updatePreviewCacheStatus();
                return;
            }
            if (String(data.snapshotSignature || "") === String(pool.snapshotSignature || "")) {
                pool.snapshotSignature = "";
            }
            pool.queue = [];
            if (pool.pending instanceof Map) pool.pending.clear();
            if (pool.buildKeys instanceof Set) pool.buildKeys.clear();
            pool.active = 0;
            this.updatePreviewCacheStatus();
            return;
        }
        const pending = pool.pending.get(data.id);
        if (pending) {
            pool.pending.delete(data.id);
            pool.active = Math.max(0, int(pool.active || 0) - 1);
        }
        if (pending?.type === "renderFrame" && pool.buildKeys instanceof Set) {
            pool.buildKeys.delete(data.key || pending.key);
        }
        if (data.type === "cacheFrameReady" && pending
            && int(data.generation || 0) === int(this.previewRenderWorkerGeneration || 0)
            && int(pending.generation || 0) === int(this.previewRenderWorkerGeneration || 0)) {
            if (this.storePreviewCachedFrameFromWorker(data.key || pending.key, data.frame, { cycleCfg: pending.cycleCfg })) {
                pool.stores += 1;
            }
        } else if (data.type === "renderFrameReady" && pending
            && int(data.generation || 0) === int(this.previewRenderWorkerGeneration || 0)
            && int(pending.generation || 0) === int(this.previewRenderWorkerGeneration || 0)
            && String(data.snapshotSignature || "") === String(pending.snapshotSignature || "")) {
            if (this.storePreviewCachedFrameFromWorkerComputed(data.key || pending.key, data.frame, { cycleCfg: pending.cycleCfg })) {
                pool.stores += 1;
            }
        } else if (data.type === "cacheFrameError") {
            pool.errors += 1;
        } else if (data.type === "renderFrameError") {
            pool.errors += 1;
        }
        this.drainPreviewRenderCacheWorkerQueue();
        this.updatePreviewCacheStatus();
    }

    storePreviewCachedFrameFromWorkerComputed(key, frame, context = {}) {
        return this.storePreviewCachedFrameFromWorker(key, frame, context);
    }

    storePreviewCachedFrameFromWorker(key, frame, context = {}) {
        const cycleCfg = context?.cycleCfg || context;
        const count = Math.max(0, int(frame?.pointCount || 0));
        const maxFrames = this.getPreviewRenderCacheMaxFrames(count, cycleCfg);
        const maxBytes = this.getPreviewRenderCacheMaxBytes(count, cycleCfg);
        const requiredFrames = Math.max(1, Math.ceil(num(cycleCfg?.total || this.getPreviewCycleConfig?.().total || 1))
            * this.getPreviewRenderCacheSubframesPerTick(count, cycleCfg) + 1);
        const estimatedBytes = this.estimatePreviewFrameBytes(count);
        return this.storePreviewBoundedFrameCacheEntry("previewRenderCache", key, frame, {
            maxFrames,
            maxBytes,
            pointLimit: PREVIEW_RENDER_CACHE_POINT_LIMIT,
            pointCount: count,
            workingSetBytes: estimatedBytes * requiredFrames,
            estimateBytes: (it) => this.estimatePreviewFrameBytes(it)
        });
    }

    getPreviewCachedFrame(key, context = {}) {
        const count = Math.max(0, int(this.previewBasePoints?.length || 0));
        const cycleCfg = context?.cycleCfg || context;
        const maxFrames = this.getPreviewRenderCacheMaxFrames(count, cycleCfg);
        const maxBytes = this.getPreviewRenderCacheMaxBytes(count, cycleCfg);
        const requiredFrames = Math.max(1, Math.ceil(num(cycleCfg?.total || this.getPreviewCycleConfig?.().total || 1))
            * this.getPreviewRenderCacheSubframesPerTick(count, cycleCfg) + 1);
        const estimatedBytes = this.estimatePreviewFrameBytes(count);
        return this.getPreviewBoundedFrameCacheEntry("previewRenderCache", key, {
            maxFrames,
            maxBytes,
            pointLimit: PREVIEW_RENDER_CACHE_POINT_LIMIT,
            pointCount: count,
            estimatedBytes,
            workingSetBytes: estimatedBytes * requiredFrames
        });
    }

    storePreviewCachedFrame(key, frame, context = {}) {
        const cycleCfg = context?.cycleCfg || context;
        const count = Math.max(0, int(frame?.pointCount || 0));
        const maxFrames = this.getPreviewRenderCacheMaxFrames(count, cycleCfg);
        const maxBytes = this.getPreviewRenderCacheMaxBytes(count, cycleCfg);
        const requiredFrames = Math.max(1, Math.ceil(num(cycleCfg?.total || this.getPreviewCycleConfig?.().total || 1))
            * this.getPreviewRenderCacheSubframesPerTick(count, cycleCfg) + 1);
        const estimatedBytes = this.estimatePreviewFrameBytes(count);
        return this.storePreviewBoundedFrameCacheEntry("previewRenderCache", key, frame, {
            maxFrames,
            maxBytes,
            pointLimit: PREVIEW_RENDER_CACHE_POINT_LIMIT,
            pointCount: count,
            workingSetBytes: estimatedBytes * requiredFrames,
            clone: (it) => this.clonePreviewCachedRenderFrame(it),
            estimateBytes: (it) => this.estimatePreviewFrameBytes(it)
        });
    }

    estimatePreviewFrameBytes(frameOrCount) {
        if (typeof frameOrCount === "number") {
            return Math.max(0, int(frameOrCount || 0)) * 25;
        }
        const frame = frameOrCount || {};
        let bytes = 0;
        const add = (arr) => {
            if (arr && Number.isFinite(Number(arr.byteLength))) bytes += int(arr.byteLength || 0);
        };
        add(frame.positions);
        add(frame.colors);
        add(frame.sizes);
        add(frame.alphas);
        add(frame.frameIndices);
        add(frame.visibleMask);
        add(frame.resolvedCurrentAges);
        add(frame.resolvedLifetimes);
        add(frame.manualAgeFlags);
        add(frame.initializedLifetimeFlags);
        if (Array.isArray(frame.persistentControllerStates)) {
            for (const state of frame.persistentControllerStates) {
                if (!state || typeof state !== "object") continue;
                try {
                    bytes += JSON.stringify(state).length * 2;
                } catch {
                    bytes += 64;
                }
            }
        }
        if (frame.runtimeGlobals && typeof frame.runtimeGlobals === "object") {
            try {
                bytes += JSON.stringify(frame.runtimeGlobals).length * 2;
            } catch {
                bytes += 256;
            }
        }
        return bytes;
    }

    clonePreviewCachedColorArray(raw, length) {
        const len = Math.max(0, int(length || 0));
        if (raw instanceof Uint8Array && raw.length === len) return new Uint8Array(raw);
        const out = new Uint8Array(len);
        if (!raw || !Number.isFinite(Number(raw.length))) return out;
        const n = Math.min(len, int(raw.length || 0));
        for (let i = 0; i < n; i++) {
            out[i] = clamp(Math.round(num(raw[i]) * 255), 0, 255);
        }
        return out;
    }

    clonePreviewCachedAlphaArray(raw, length) {
        const len = Math.max(0, int(length || 0));
        if (raw instanceof Uint8Array && raw.length === len) return new Uint8Array(raw);
        const out = new Uint8Array(len);
        if (!raw || !Number.isFinite(Number(raw.length))) return out;
        const n = Math.min(len, int(raw.length || 0));
        for (let i = 0; i < n; i++) {
            out[i] = clamp(Math.round(num(raw[i]) * 255), 0, 255);
        }
        return out;
    }

    clonePreviewCachedFrameIndexArray(raw, length) {
        const len = Math.max(0, int(length || 0));
        if (raw instanceof Uint16Array && raw.length === len) return new Uint16Array(raw);
        if (raw instanceof Uint32Array && raw.length === len) return new Uint32Array(raw);
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
        for (let i = 0; i < n; i++) {
            out[i] = Math.max(0, int(raw[i] || 0));
        }
        return out;
    }

    clonePreviewRuntimeGlobals(runtimeGlobals) {
        if (!runtimeGlobals || typeof runtimeGlobals !== "object") return null;
        const clonePlain = (value) => {
            if (!value || typeof value !== "object") return value;
            if (Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
                return U.v(num(value.x), num(value.y), num(value.z));
            }
            if (Array.isArray(value)) return value.map((it) => clonePlain(it));
            const out = {};
            for (const [key, child] of Object.entries(value)) {
                if (typeof child === "function") continue;
                out[key] = clonePlain(child);
            }
            return out;
        };
        const out = {};
        for (const [key, value] of Object.entries(runtimeGlobals)) {
            if (typeof value === "function") continue;
            out[key] = clonePlain(value);
        }
        out.status = ensureStatusHelperMethods(out.status && typeof out.status === "object" ? out.status : {});
        return out;
    }

    clonePreviewControllerState(state) {
        if (!state || typeof state !== "object") return null;
        if (typeof structuredClone === "function") {
            try {
                return structuredClone(state);
            } catch {
            }
        }
        try {
            return JSON.parse(JSON.stringify(state));
        } catch {
            return Object.assign({}, state);
        }
    }

    clonePreviewControllerStates(states, count) {
        const safeCount = Math.max(0, int(count || 0));
        const out = new Array(safeCount).fill(null);
        if (!Array.isArray(states)) return out;
        const n = Math.min(safeCount, states.length);
        for (let i = 0; i < n; i++) {
            out[i] = this.clonePreviewControllerState(states[i]);
        }
        return out;
    }

    clonePreviewFrame(frame) {
        const count = Math.max(0, int(frame?.pointCount ?? this.previewBasePoints?.length ?? 0));
        const copyFloat = (arr, len) => {
            if (arr instanceof Float32Array && arr.length === len) return new Float32Array(arr);
            const out = new Float32Array(len);
            if (arr && Number.isFinite(Number(arr.length))) {
                const n = Math.min(len, int(arr.length || 0));
                for (let i = 0; i < n; i++) out[i] = num(arr[i]);
            }
            return out;
        };
        const copyMask = (arr, len, defaultValue = 0) => {
            const out = new Uint8Array(len);
            if (!arr || !Number.isFinite(Number(arr.length))) {
                if (defaultValue) out.fill(defaultValue);
                return out;
            }
            const n = Math.min(len, int(arr.length || 0));
            for (let i = 0; i < n; i++) {
                out[i] = (arr[i] === false || arr[i] === 0) ? 0 : 1;
            }
            if (defaultValue && n < len) out.fill(defaultValue, n);
            return out;
        };
        return {
            pointCount: count,
            visible: Math.max(0, int(frame?.visible || 0)),
            statusText: String(frame?.statusText || ""),
            elapsedTick: num(frame?.elapsedTick || 0),
            globalCycleAge: num(frame?.globalCycleAge || 0),
            cycleTick: Math.max(0, int(frame?.cycleTick || 0)),
            cycleIndex: int(frame?.cycleIndex || 0),
            runtimeAppliedTick: int(frame?.runtimeAppliedTick ?? frame?.cycleTick ?? -1),
            runtimeGlobals: this.clonePreviewRuntimeGlobals(frame?.runtimeGlobals),
            positions: copyFloat(frame?.positions, count * 3),
            colors: copyFloat(frame?.colors, count * 3),
            sizes: copyFloat(frame?.sizes, count),
            alphas: copyFloat(frame?.alphas, count),
            frameIndices: copyFloat(frame?.frameIndices, count),
            visibleMask: copyMask(frame?.visibleMask, count, 1),
            resolvedCurrentAges: copyFloat(frame?.resolvedCurrentAges, count),
            resolvedLifetimes: copyFloat(frame?.resolvedLifetimes, count),
            manualAgeFlags: copyMask(frame?.manualAgeFlags, count, 0),
            initializedLifetimeFlags: copyMask(frame?.initializedLifetimeFlags, count, 0),
            persistentControllerStates: this.clonePreviewControllerStates(frame?.persistentControllerStates, count)
        };
    }

    clonePreviewCachedRenderFrame(frame) {
        const count = Math.max(0, int(frame?.pointCount ?? this.previewBasePoints?.length ?? 0));
        const copyFloat = (arr, len) => {
            if (arr instanceof Float32Array && arr.length === len) return new Float32Array(arr);
            const out = new Float32Array(len);
            if (arr && Number.isFinite(Number(arr.length))) {
                const n = Math.min(len, int(arr.length || 0));
                for (let i = 0; i < n; i++) out[i] = num(arr[i]);
            }
            return out;
        };
        const copyMask = (arr, len, defaultValue = 0) => {
            const out = new Uint8Array(len);
            if (!arr || !Number.isFinite(Number(arr.length))) {
                if (defaultValue) out.fill(defaultValue);
                return out;
            }
            const n = Math.min(len, int(arr.length || 0));
            for (let i = 0; i < n; i++) {
                out[i] = (arr[i] === false || arr[i] === 0) ? 0 : 1;
            }
            if (defaultValue && n < len) out.fill(defaultValue, n);
            return out;
        };
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
            positions: copyFloat(frame?.positions, count * 3),
            colors: this.clonePreviewCachedColorArray(frame?.colors, count * 3),
            sizes: copyFloat(frame?.sizes, count),
            alphas: this.clonePreviewCachedAlphaArray(frame?.alphas, count),
            frameIndices: this.clonePreviewCachedFrameIndexArray(frame?.frameIndices, count),
            visibleMask: copyMask(frame?.visibleMask, count, 1),
            resolvedCurrentAges: null,
            resolvedLifetimes: null,
            manualAgeFlags: null,
            initializedLifetimeFlags: null,
            persistentControllerStates: []
        };
    }

    getPreviewInteractionPositionArray() {
        const count = Math.max(0, int(this.previewBasePoints?.length || 0));
        const positions = this.pointsGeom?.getAttribute("position")?.array;
        return positions && positions.length === count * 3 ? positions : null;
    }

    getPreviewInteractionVisibleMask() {
        const count = Math.max(0, int(this.previewBasePoints?.length || 0));
        const active = this.previewInteractionVisibleMask;
        if (active && active.length === count) return active;
        const fallback = this.previewVisibleMask;
        return fallback && fallback.length === count ? fallback : null;
    }

    applyPreviewFrame(frame, context = {}) {
        if (!this.pointsGeom || !frame) return false;
        const totalCount = Math.max(0, int(frame.pointCount || 0));
        const posAttr = this.pointsGeom.getAttribute("position");
        const colAttr = this.pointsGeom.getAttribute("color");
        const sizeAttr = this.pointsGeom.getAttribute("aSize");
        const alphaAttr = this.pointsGeom.getAttribute("aAlpha");
        if (!posAttr || !colAttr || !sizeAttr || !alphaAttr) return false;
        if (posAttr.array.length !== totalCount * 3
            || colAttr.array.length !== totalCount * 3
            || sizeAttr.array.length !== totalCount
            || alphaAttr.array.length !== totalCount) {
            return false;
        }
        if (!frame.positions || frame.positions.length !== totalCount * 3
            || !frame.colors || frame.colors.length !== totalCount * 3
            || !frame.sizes || frame.sizes.length !== totalCount
            || !frame.alphas || frame.alphas.length !== totalCount) {
            return false;
        }
        this.previewInteractionVisibleMask = frame.visibleMask || null;
        const attributesAlreadyWritten = context.attributesAlreadyWritten === true;
        if (!attributesAlreadyWritten) {
            posAttr.array.set(frame.positions);
            if (frame.colors instanceof Uint8Array) {
                for (let i = 0; i < frame.colors.length; i++) colAttr.array[i] = frame.colors[i] / 255;
            } else {
                colAttr.array.set(frame.colors);
            }
            sizeAttr.array.set(frame.sizes);
            if (frame.alphas instanceof Uint8Array) {
                for (let i = 0; i < frame.alphas.length; i++) alphaAttr.array[i] = frame.alphas[i] / 255;
            } else {
                alphaAttr.array.set(frame.alphas);
            }
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
        const frameAttr = this.pointsGeom.getAttribute("aFrameIndex");
        if (frameAttr && frame.frameIndices && frame.frameIndices.length === totalCount) {
            if (!attributesAlreadyWritten || frameAttr.array !== frame.frameIndices) {
                frameAttr.array.set(frame.frameIndices);
            }
            frameAttr.needsUpdate = true;
        }
        const restoreRuntimeState = context.restoreRuntimeState !== false;
        if (restoreRuntimeState) {
            const points = Array.isArray(this.previewPoints) && this.previewPoints.length === totalCount
                ? this.previewPoints
                : new Array(totalCount);
            const visibleMask = new Array(totalCount);
            for (let i = 0; i < totalCount; i++) {
                const px = frame.positions[i * 3 + 0];
                const py = frame.positions[i * 3 + 1];
                const pz = frame.positions[i * 3 + 2];
                let p = points[i];
                if (!p) {
                    p = U.v(px, py, pz);
                    points[i] = p;
                } else {
                    p.x = px;
                    p.y = py;
                    p.z = pz;
                }
                visibleMask[i] = frame.visibleMask ? frame.visibleMask[i] !== 0 : true;
            }
            this.previewPoints = points;
            this.previewVisibleMask = visibleMask;
        }
        if (restoreRuntimeState) {
            this.previewFrameCurrentAges = frame.resolvedCurrentAges instanceof Float32Array
                ? new Float32Array(frame.resolvedCurrentAges)
                : new Float32Array(totalCount);
            this.previewFrameLifetimes = frame.resolvedLifetimes instanceof Float32Array
                ? new Float32Array(frame.resolvedLifetimes)
                : new Float32Array(totalCount).fill(100);
            this.previewManualAgeFlags = frame.manualAgeFlags instanceof Uint8Array
                ? new Uint8Array(frame.manualAgeFlags)
                : new Uint8Array(totalCount);
            this.previewInitializedLifetimeFlags = frame.initializedLifetimeFlags instanceof Uint8Array
                ? new Uint8Array(frame.initializedLifetimeFlags)
                : new Uint8Array(totalCount);
            this.previewPersistentCurrentAges = new Float32Array(this.previewFrameCurrentAges);
            this.previewPersistentLifetimes = new Float32Array(this.previewFrameLifetimes);
            this.previewPersistentControllerStates = this.clonePreviewControllerStates(frame.persistentControllerStates, totalCount);
        }
        if (restoreRuntimeState && frame.runtimeGlobals && typeof frame.runtimeGlobals === "object") {
            const runtimeAppliedTick = Number.isFinite(Number(context.runtimeAppliedTick))
                ? int(context.runtimeAppliedTick)
                : int(frame.runtimeAppliedTick ?? frame.cycleTick ?? -1);
            const runtimeCycleIndex = Number.isFinite(Number(context.cycleIndex))
                ? int(context.cycleIndex)
                : int(frame.cycleIndex ?? this.previewRuntimeCycleIndex ?? 0);
            this.previewRuntimeGlobals = this.clonePreviewRuntimeGlobals(frame.runtimeGlobals);
            this.previewRuntimeAppliedTick = runtimeAppliedTick;
            this.previewRuntimeCycleIndex = runtimeCycleIndex;
            this.previewCanResumeRuntimeState = true;
        }
        this.previewManualProjectScaleTick = num(frame.globalCycleAge || 0);
        if (restoreRuntimeState) this.syncTextureUniforms();
        if (frame.statusText && this.lastPointsStatusText !== frame.statusText) {
            this.lastPointsStatusText = frame.statusText;
            if (this.dom?.statusPoints) this.dom.statusPoints.textContent = frame.statusText;
        }
        return true;
    }

    updatePreviewAnimation() {
        if (!this.pointsGeom || !this.previewBasePoints.length) return;
        const now = performance.now();
        const totalCount = this.previewBasePoints.length;
        const minInterval = totalCount >= 50000 ? 16 : 0;
        if (minInterval > 0 && (now - this.previewPerfLastTs) < minInterval) return;
        this.previewPerfLastTs = now;
        const elapsedTick = (now - this.previewAnimStart) / 50;
        const cycleCfg = this.getPreviewCycleConfig();
        const cycleTotal = cycleCfg.total;
        const globalCycleAge = ((elapsedTick % cycleTotal) + cycleTotal) % cycleTotal;
        const cycleIndex = cycleTotal > 1e-6 ? Math.floor(elapsedTick / cycleTotal) : 0;
        const frameTime = this.resolvePreviewFrameTimeContext({
            totalCount,
            elapsedTick,
            cycleCfg,
            globalCycleAge,
            cycleIndex
        });
        const frameKey = this.makePreviewFrameCacheKey({
            totalCount,
            elapsedTick: frameTime.elapsedTick,
            cycleCfg,
            globalCycleAge: frameTime.globalCycleAge,
            cycleIndex: frameTime.cycleIndex,
            tickStep: frameTime.tickStep,
            renderFrame: frameTime.renderFrame
        });
        if (!frameKey) {
            this.previewLastAppliedFrameKey = "";
        } else if (frameKey === this.previewLastAppliedFrameKey) {
            return;
        }
        const cachedFrame = this.getPreviewCachedFrame(frameKey, { cycleCfg });
        const frameApplyContext = {
            cycleIndex: frameTime.cycleIndex,
            runtimeAppliedTick: frameTime.tickStep,
            restoreRuntimeState: true,
            attributesAlreadyWritten: false
        };
        this.queuePreviewRenderCacheBuilds({
            totalCount,
            cycleCfg,
            frameTime,
            skipKey: frameKey
        });
        if (cachedFrame && this.applyPreviewFrame(cachedFrame, {
            cycleIndex: frameTime.cycleIndex,
            runtimeAppliedTick: frameTime.tickStep,
            restoreRuntimeState: false
        })) {
            this.previewLastAppliedFrameKey = frameKey;
            return;
        }
        const frame = this.computePreviewFrame({
            now,
            totalCount,
            elapsedTick: frameTime.elapsedTick,
            cycleCfg,
            globalCycleAge: frameTime.globalCycleAge,
            cycleIndex: frameTime.cycleIndex,
            outputToGeometry: !frameKey
        });
        if (!frame) return;
        frameApplyContext.attributesAlreadyWritten = frame.attributesWrittenToGeometry === true;
        const applied = this.applyPreviewFrame(frame, frameApplyContext);
        if (frameKey && applied) {
            this.previewLastAppliedFrameKey = frameKey;
            this.storePreviewCachedFrame(frameKey, frame, { cycleCfg });
            this.queuePreviewRenderCacheBuilds({
                totalCount,
                cycleCfg,
                frameTime,
                skipKey: frameKey
            });
        }
    }

    computePreviewFrame(context = {}) {
        if (!this.pointsGeom || !this.previewBasePoints.length) return null;
        const now = Number.isFinite(Number(context.now)) ? num(context.now) : performance.now();
        const totalCount = Math.max(0, int(context.totalCount || this.previewBasePoints.length || 0));
        if (!totalCount) return null;
        const elapsedTick = Number.isFinite(Number(context.elapsedTick))
            ? num(context.elapsedTick)
            : (now - this.previewAnimStart) / 50;
        const cycleCfg = context.cycleCfg || this.getPreviewCycleConfig();
        const cycleAppear = cycleCfg.appear;
        const cycleLive = cycleCfg.live;
        const cycleFade = cycleCfg.fade;
        const cycleTotal = cycleCfg.total;
        const globalCycleAge = Number.isFinite(Number(context.globalCycleAge))
            ? num(context.globalCycleAge)
            : ((elapsedTick % cycleTotal) + cycleTotal) % cycleTotal;
        const cycleIndex = Number.isFinite(Number(context.cycleIndex))
            ? int(context.cycleIndex)
            : (cycleTotal > 1e-6 ? Math.floor(elapsedTick / cycleTotal) : 0);
        this.previewManualProjectScaleTick = globalCycleAge;
        const outputToGeometry = context.outputToGeometry === true;
        const posAttr = outputToGeometry ? this.pointsGeom.getAttribute("position") : null;
        const colAttr = outputToGeometry ? this.pointsGeom.getAttribute("color") : null;
        const sizeAttr = outputToGeometry ? this.pointsGeom.getAttribute("aSize") : null;
        const alphaAttr = outputToGeometry ? this.pointsGeom.getAttribute("aAlpha") : null;
        const frameAttr = outputToGeometry ? this.pointsGeom.getAttribute("aFrameIndex") : null;
        const attributesWrittenToGeometry = !!(outputToGeometry
            && posAttr?.array?.length === totalCount * 3
            && colAttr?.array?.length === totalCount * 3
            && sizeAttr?.array?.length === totalCount
            && alphaAttr?.array?.length === totalCount
            && frameAttr?.array?.length === totalCount);
        const positions = attributesWrittenToGeometry ? posAttr.array : new Float32Array(totalCount * 3);
        const colors = attributesWrittenToGeometry ? colAttr.array : new Float32Array(totalCount * 3);
        const sizes = attributesWrittenToGeometry ? sizeAttr.array : new Float32Array(totalCount);
        const alphas = attributesWrittenToGeometry ? alphaAttr.array : new Float32Array(totalCount);
        const frameIndices = attributesWrittenToGeometry ? frameAttr.array : new Float32Array(totalCount);
        this.previewVisibleMask = new Array(totalCount).fill(false);
        let resolvedCurrentAges = this.previewFrameCurrentAges;
        if (!(resolvedCurrentAges instanceof Float32Array) || resolvedCurrentAges.length !== totalCount) {
            resolvedCurrentAges = new Float32Array(totalCount);
            this.previewFrameCurrentAges = resolvedCurrentAges;
        } else {
            resolvedCurrentAges.fill(0);
        }
        let resolvedLifetimes = this.previewFrameLifetimes;
        if (!(resolvedLifetimes instanceof Float32Array) || resolvedLifetimes.length !== totalCount) {
            resolvedLifetimes = new Float32Array(totalCount);
            resolvedLifetimes.fill(100);
            this.previewFrameLifetimes = resolvedLifetimes;
        } else {
            resolvedLifetimes.fill(100);
        }
        let persistentCurrentAges = this.previewPersistentCurrentAges;
        if (!(persistentCurrentAges instanceof Float32Array) || persistentCurrentAges.length !== totalCount) {
            persistentCurrentAges = new Float32Array(totalCount);
            this.previewPersistentCurrentAges = persistentCurrentAges;
        }
        let persistentLifetimes = this.previewPersistentLifetimes;
        if (!(persistentLifetimes instanceof Float32Array) || persistentLifetimes.length !== totalCount) {
            persistentLifetimes = new Float32Array(totalCount);
            persistentLifetimes.fill(100);
            this.previewPersistentLifetimes = persistentLifetimes;
        }
        let manualAgeFlags = this.previewManualAgeFlags;
        if (!(manualAgeFlags instanceof Uint8Array) || manualAgeFlags.length !== totalCount) {
            manualAgeFlags = new Uint8Array(totalCount);
            this.previewManualAgeFlags = manualAgeFlags;
        }
        let initializedLifetimeFlags = this.previewInitializedLifetimeFlags;
        if (!(initializedLifetimeFlags instanceof Uint8Array) || initializedLifetimeFlags.length !== totalCount) {
            initializedLifetimeFlags = new Uint8Array(totalCount);
            this.previewInitializedLifetimeFlags = initializedLifetimeFlags;
        }
        let persistentControllerStates = this.previewPersistentControllerStates;
        if (!Array.isArray(persistentControllerStates) || persistentControllerStates.length !== totalCount) {
            persistentControllerStates = new Array(totalCount).fill(null);
            this.previewPersistentControllerStates = persistentControllerStates;
        }
        const skipExprPerPoint = totalCount >= 50000;
        const runtimeActions = this.buildPreviewRuntimeActions(globalCycleAge, this.state.displayActions || [], {
            skipExpression: skipExprPerPoint,
            scope: "display"
        });
        const projectAlphaCfg = normalizeAlphaHelperConfig(this.state?.projectAlpha, { type: "none" });
        const projectAlphaAuto = projectAlphaCfg.type !== "none"
            && String(projectAlphaCfg.runMode || "auto").trim() !== "manual";
        const globalAxis = this.resolveCompositionAxisDirection();
        const tickStep = Math.max(0, Math.floor(globalCycleAge));
        const shouldResetParticleInitState = this.previewCanResumeRuntimeState === false;
        const shouldResetPersistentRuntime = tickStep < this.previewRuntimeAppliedTick
            || this.previewRuntimeCycleIndex !== cycleIndex
            || this.previewCanResumeRuntimeState === false;
        if (!this.previewRuntimeGlobals || shouldResetPersistentRuntime) {
            this.previewRuntimeGlobals = this.buildPreviewRuntimeGlobals(0, 0, 0);
            this.previewRuntimeAppliedTick = -1;
            this.previewRuntimeCycleIndex = cycleIndex;
            persistentControllerStates.fill(null);
            if (shouldResetParticleInitState) {
                persistentCurrentAges.fill(0);
                manualAgeFlags.fill(0);
                persistentLifetimes.fill(100);
                initializedLifetimeFlags.fill(0);
            } else {
                this.resetPreviewRuntimeCurrentAgeState(persistentCurrentAges, manualAgeFlags, totalCount);
            }
        }
        this.previewCanResumeRuntimeState = true;
        const frameRuntimeGlobals = this.previewRuntimeGlobals;
        for (let t = this.previewRuntimeAppliedTick + 1; t <= tickStep; t++) {
            const tickStatus = this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, t, t);
            if (projectAlphaAuto) {
                const shouldDecrease = projectAlphaCfg.decreaseOnDisable === true
                    && !!(tickStatus && typeof tickStatus.isDisable === "function" && tickStatus.isDisable());
                this.advanceProjectAlphaPreviewState(frameRuntimeGlobals, projectAlphaCfg, shouldDecrease ? -1 : 1);
            }
            this.applyExpressionGlobalsOnce(runtimeActions, t, t, frameRuntimeGlobals, globalAxis);
        }
        if (tickStep > this.previewRuntimeAppliedTick) this.previewRuntimeAppliedTick = tickStep;
        this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, globalCycleAge, globalCycleAge);
        const projectAlphaFactor = this.getProjectAlphaPreviewValue(frameRuntimeGlobals, projectAlphaCfg);

        if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== totalCount) {
            this.rebuildPreviewRuntimeIndex();
        }
        if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== totalCount) {
            this.rebuildPreviewRuntimeIndex();
        }
        const pointGroupIndex = this.previewPointGroupIndex;
        const groupOwner = Array.isArray(this.previewGroupOwner) ? this.previewGroupOwner : [];
        const groupOwnerCount = Array.isArray(this.previewGroupOwnerCount) ? this.previewGroupOwnerCount : [];
        const groupBirthOffset = Array.isArray(this.previewGroupBirthOffset) ? this.previewGroupBirthOffset : [];
        const groupRootVirtualIndex = Array.isArray(this.previewGroupRootVirtualIndex) ? this.previewGroupRootVirtualIndex : [];
        const groupCard = Array.isArray(this.previewGroupCard) ? this.previewGroupCard : [];
        const groupCardIndex = Array.isArray(this.previewGroupCardIndex) ? this.previewGroupCardIndex : [];
        const groupCount = groupOwner.length;

        let groupRuntimeCache = this.previewFrameGroupRuntimeCache;
        if (!Array.isArray(groupRuntimeCache) || groupRuntimeCache.length !== groupCount) {
            groupRuntimeCache = new Array(groupCount);
            this.previewFrameGroupRuntimeCache = groupRuntimeCache;
        } else {
            groupRuntimeCache.fill(undefined);
        }
        let anchorCache = this.previewFrameAnchorCache;
        if (!Array.isArray(anchorCache) || anchorCache.length !== groupCount) {
            anchorCache = new Array(groupCount);
            this.previewFrameAnchorCache = anchorCache;
        } else {
            anchorCache.fill(undefined);
        }
        let localCache = this.previewFrameLocalCache;
        if (!Array.isArray(localCache) || localCache.length !== groupCount) {
            localCache = new Array(groupCount);
            this.previewFrameLocalCache = localCache;
        } else {
            localCache.fill(undefined);
        }
        let ownerVisualCache = this.previewFrameGroupVisualCache;
        if (!Array.isArray(ownerVisualCache) || ownerVisualCache.length !== groupCount) {
            ownerVisualCache = new Array(groupCount);
            this.previewFrameGroupVisualCache = ownerVisualCache;
        } else {
            ownerVisualCache.fill(undefined);
        }
        let pointVisualCache = this.previewFrameGroupPointVisualCache;
        if (!Array.isArray(pointVisualCache) || pointVisualCache.length !== groupCount) {
            pointVisualCache = new Array(groupCount);
            this.previewFrameGroupPointVisualCache = pointVisualCache;
        } else {
            pointVisualCache.fill(undefined);
        }
        const ownerVisualAgeDependentCache = (this.previewCardVisualAgeDependentCache instanceof Map)
            ? this.previewCardVisualAgeDependentCache
            : (this.previewCardVisualAgeDependentCache = new Map());
        const shapeRuntimeLevelsFrameCache = (this.previewFrameShapeRuntimeLevelsCache instanceof Map)
            ? this.previewFrameShapeRuntimeLevelsCache
            : (this.previewFrameShapeRuntimeLevelsCache = new Map());
        shapeRuntimeLevelsFrameCache.clear();
        const growthPlanFrameCache = (this.previewFrameGrowthPlanCache instanceof Map)
            ? this.previewFrameGrowthPlanCache
            : (this.previewFrameGrowthPlanCache = new Map());
        growthPlanFrameCache.clear();

        const ownerIds = this.previewOwners;
        const ownerLocalIndex = this.previewOwnerLocalIndex;
        const ownerPointCount = this.previewOwnerPointCount;
        const anchorBaseList = this.previewAnchorBase;
        const localBaseList = this.previewLocalBase;
        const anchorRefList = this.previewAnchorRef;
        const localRefList = this.previewLocalRef;
        const rootOffsetIndexList = this.previewRootOffsetIndex;
        const useLocalOpsList = this.previewUseLocalOps;
        const birthOffsetList = this.previewBirthOffsets;
        const basePoints = this.previewBasePoints;
        const levelBasesAll = this.previewLevelBases;
        const levelRefsAll = this.previewLevelRefs;
        const levelOffsetRefsAll = this.previewLevelOffsetRefs;
        const sequencedRoot = this.state.compositionType === "sequenced";
        const visiblePreviewCardIds = this.getPreviewVisibleCardIdSet();
        const rootVirtualTotal = Math.max(1, int(this.previewRootVirtualTotal || this.state.cards.length || 1));
        const rootGrowthPlan = sequencedRoot
            ? this.buildSequencedRootGrowthPlan(runtimeActions, rootVirtualTotal, globalCycleAge, elapsedTick, {
                runtimeVars: frameRuntimeGlobals,
                axis: globalAxis
            })
            : null;

        let visible = 0;
        const preserveFrameLifetimeAt = (index) => {
            const persistedLifetimeRaw = persistentLifetimes[index];
            const persistedLifetime = (Number.isFinite(Number(persistedLifetimeRaw)) && persistedLifetimeRaw >= 1)
                ? Math.max(1, int(persistedLifetimeRaw))
                : 100;
            resolvedLifetimes[index] = persistedLifetime;
            persistentLifetimes[index] = persistedLifetime;
            return persistedLifetime;
        };
        for (let i = 0; i < totalCount; i++) {
            const base = basePoints[i];
            const groupId = (pointGroupIndex && i < pointGroupIndex.length) ? int(pointGroupIndex[i]) : -1;
            const owner = groupId >= 0 ? (groupOwner[groupId] || ownerIds[i]) : ownerIds[i];
            if (visiblePreviewCardIds && !visiblePreviewCardIds.has(String(owner || ""))) {
                positions[i * 3 + 0] = base.x;
                positions[i * 3 + 1] = base.y;
                positions[i * 3 + 2] = base.z;
                sizes[i] = 0;
                alphas[i] = 0;
                this.previewVisibleMask[i] = false;
                manualAgeFlags[i] = 0;
                preserveFrameLifetimeAt(i);
                continue;
            }
            const localIndex = int(ownerLocalIndex[i] || 0);
            const ownerCountSafe = groupId >= 0
                ? Math.max(1, int(groupOwnerCount[groupId] || ownerPointCount[i] || 1))
                : Math.max(1, int(ownerPointCount[i] || 1));
            const anchorBase = anchorBaseList[i] || base;
            const localBase = localBaseList[i] || U.v(0, 0, 0);
            const anchorRef = int(anchorRefList[i] || 0);
            const localRef = int(localRefList[i] || 0);
            const rootOffsetIndex = int(rootOffsetIndexList?.[i] || 0);
            const rootVirtualIndex = groupId >= 0
                ? int(groupRootVirtualIndex[groupId] || 0)
                : int(this.previewRootVirtualIndex?.[i] || 0);
            const useLocalOps = !!useLocalOpsList[i];
            const birthOffset = groupId >= 0
                ? num(groupBirthOffset[groupId] || 0)
                : num(birthOffsetList[i] || 0);
            const disableRootSequencedGrowth = false;
            let rootDelayTick = sequencedRoot ? Math.max(0, rootVirtualIndex) : 0;
            if (rootGrowthPlan?.hasSource) {
                const unlockTick = Number(rootGrowthPlan.unlockTickByIndex?.[rootVirtualIndex]);
                if (Number.isFinite(unlockTick)) {
                    rootDelayTick = Math.max(0, num(unlockTick));
                } else {
                    rootDelayTick = Math.max(0, num(globalCycleAge) + 1);
                }
            }
            let cached = groupId >= 0 ? groupRuntimeCache[groupId] : null;
            if (!cached) {
                const ageBase = ((elapsedTick - birthOffset) % cycleTotal + cycleTotal) % cycleTotal;
                // Dissolve start tick is tracked in cycle-local time; mixing in
                // absolute elapsedTick makes second-cycle fade jump to the end.
                let globalAge = this.resolvePreviewAgeWithStatus(ageBase, globalCycleAge, cycleCfg, frameRuntimeGlobals);
                const runtimeElapsedTick = Math.max(0, num(globalAge) - rootDelayTick);                const runtimeAgeTick = runtimeElapsedTick;
                const card = groupId >= 0
                    ? (groupCard[groupId] || null)
                    : this.getCardById(owner);
                const cardIndex = groupId >= 0
                    ? int(groupCardIndex[groupId] ?? -1)
                    : this.getCardIndexById(owner);
                let shapeRuntimeLevels = [];
                const runtimeTickKey = int(Math.round(runtimeElapsedTick * 1000));
                if (card) {
                    if (card.dataType !== "single") {
                        const shapeCacheKey = `${card.id}|${runtimeTickKey}|${skipExprPerPoint ? 1 : 0}`;
                        let shapeRuntimePack = shapeRuntimeLevelsFrameCache.get(shapeCacheKey);
                        if (shapeRuntimePack && Array.isArray(shapeRuntimePack.levels)) {
                            shapeRuntimeLevels = shapeRuntimePack.levels;
                        } else {
                            shapeRuntimeLevels = this.getShapeRuntimeLevelsForPreview(card, runtimeElapsedTick, skipExprPerPoint);
                            shapeRuntimePack = {
                                levels: shapeRuntimeLevels,
                                hasExpression: shapeRuntimeLevels.some((lv) => !!lv.hasExpression),
                                globalsApplied: false
                            };
                            shapeRuntimeLevelsFrameCache.set(shapeCacheKey, shapeRuntimePack);
                        }
                        if (shapeRuntimePack.hasExpression || !shapeRuntimePack.globalsApplied) {
                            for (const lv of shapeRuntimeLevels) {
                                this.applyExpressionGlobalsOnce(
                                    lv.actions,
                                    runtimeElapsedTick,
                                    runtimeAgeTick,
                                    frameRuntimeGlobals,
                                    lv.axis || globalAxis
                                );
                            }
                            shapeRuntimePack.globalsApplied = true;
                        }
                    }
                }
                let visualDependency = ownerVisualAgeDependentCache.get(owner);
                if (visualDependency === undefined) {
                    visualDependency = this.getCardPreviewVisualDependency(card);
                    ownerVisualAgeDependentCache.set(owner, visualDependency);
                }
                this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, globalCycleAge, globalCycleAge);
                globalAge = this.resolvePreviewAgeWithStatus(ageBase, globalCycleAge, cycleCfg, frameRuntimeGlobals);
                const globalCycleAgeNow = this.resolvePreviewAgeWithStatus(globalCycleAge, globalCycleAge, cycleCfg, frameRuntimeGlobals);
                const growthAgeTick = Math.max(0, num(globalAge) - rootDelayTick);
                const canReuseGrowthPlan = !!card
                    && !runtimeActions.__hasExpression
                    && !shapeRuntimeLevels.some((lv) => !!lv.hasExpression);
                const growthPlanKey = canReuseGrowthPlan
                    ? [
                        card.id,
                        ownerCountSafe,
                        int(Math.round(growthAgeTick * 1000)),
                        runtimeTickKey,
                        sequencedRoot ? int(rootVirtualIndex) : 0,
                        int(Math.round(num(globalCycleAgeNow) * 1000))
                    ].join("|")
                    : "";
                let growthPlanCached = canReuseGrowthPlan ? growthPlanFrameCache.get(growthPlanKey) : null;
                let visibleLimit = 0;
                let localGrowthPlan = null;
                if (disableRootSequencedGrowth) {
                    visibleLimit = ownerCountSafe;
                    localGrowthPlan = {
                        visibleLimit: ownerCountSafe,
                        unlockTickByIndex: new Array(ownerCountSafe).fill(0)
                    };
                } else if (growthPlanCached && typeof growthPlanCached === "object") {
                    visibleLimit = int(growthPlanCached.visibleLimit || 0);
                    localGrowthPlan = growthPlanCached.localGrowthPlan || null;
                } else {
                    visibleLimit = this.evaluateGrowthVisibleLimit(
                        owner,
                        ownerCountSafe,
                        growthAgeTick,
                        globalCycleAgeNow,
                        runtimeElapsedTick,
                        runtimeActions,
                        shapeRuntimeLevels,
                        cycleCfg,
                        {
                            rootVirtualIndex,
                            rootVirtualTotal,
                            rootElapsedTick: elapsedTick,
                            rootPlan: rootGrowthPlan,
                            ownerCard: card,
                            ownerCardIndex: cardIndex
                        },
                        frameRuntimeGlobals
                    );
                    localGrowthPlan = this.buildLocalGrowthPlan(
                        card,
                        ownerCountSafe,
                        shapeRuntimeLevels,
                        growthAgeTick,
                        runtimeElapsedTick,
                        frameRuntimeGlobals
                    );
                    if (canReuseGrowthPlan) {
                        growthPlanFrameCache.set(growthPlanKey, {
                            visibleLimit,
                            localGrowthPlan
                        });
                    }
                }
                const localUnlockTickByIndex = Array.isArray(localGrowthPlan?.unlockTickByIndex)
                    ? localGrowthPlan.unlockTickByIndex
                    : [];
                cached = {
                    owner,
                    ownerCount: ownerCountSafe,
                    statusAge: globalAge,
                    age: growthAgeTick,
                    elapsedTick: runtimeElapsedTick,
                    shapeRuntimeLevels,
                    cardRuntimeHasExpression: shapeRuntimeLevels.some((lv) => !!lv.hasExpression),
                    cardRuntimeHasPointDependentExpression: shapeRuntimeLevels.some((lv) => !!lv.hasPointDependentExpression),
                    cardHasShapeOps: !!(card && card.dataType !== "single"),
                    cardVisualAgeDependent: !!visualDependency?.ageDependent,
                    cardVisualPointDependent: !!visualDependency?.pointDependent,
                    cardVisualFramePointDependent: !!visualDependency?.framePointDependent,
                    cardVisualInitPointDependentCurrentAge: !!visualDependency?.initPointDependentCurrentAge,
                    cardVisualInitPointDependentLifetime: !!visualDependency?.initPointDependentLifetime,
                    visibleLimit,
                    localUnlockTickByIndex
                };
                if (groupId >= 0) groupRuntimeCache[groupId] = cached;
            }

            const ownerCount = Math.max(1, int(cached.ownerCount || ownerCountSafe));
            const visibleLimit = clamp(int(cached.visibleLimit), 0, ownerCount);
            const isVisibleByGrowth = localIndex < visibleLimit;
            if (!isVisibleByGrowth) {
                this.previewVisibleMask[i] = false;
                positions[i * 3 + 0] = base.x;
                positions[i * 3 + 1] = base.y;
                positions[i * 3 + 2] = base.z;
                let hiddenRef = this.previewPoints[i];
                if (!hiddenRef) {
                    hiddenRef = U.v(base.x, base.y, base.z);
                    this.previewPoints[i] = hiddenRef;
                } else {
                    hiddenRef.x = base.x;
                    hiddenRef.y = base.y;
                    hiddenRef.z = base.z;
                }
                colors[i * 3 + 0] = 0;
                colors[i * 3 + 1] = 0;
                colors[i * 3 + 2] = 0;
                sizes[i] = 0.01;
                alphas[i] = 0;
                resolvedCurrentAges[i] = 0;
                persistentCurrentAges[i] = 0;
                manualAgeFlags[i] = 0;
                preserveFrameLifetimeAt(i);
                continue;
            }

            const localUnlockTick = Number(cached.localUnlockTickByIndex?.[localIndex]);
            const pointDelayTick = Number.isFinite(localUnlockTick) ? Math.max(0, num(localUnlockTick)) : 0;
            const pointElapsedTick = Math.max(0, num(cached.elapsedTick) - pointDelayTick);
            const pointAgeTick = Math.max(0, num(cached.age) - pointDelayTick);
            const localCacheRef = localRef;

            let anchorsByBirth = groupId >= 0 ? anchorCache[groupId] : null;
            if (!anchorsByBirth) {
                anchorsByBirth = [];
                if (groupId >= 0) anchorCache[groupId] = anchorsByBirth;
            }
            let anchor = anchorsByBirth[anchorRef];
            if (!anchor) {
                const globalScale = this.resolveScaleFactor(this.state.projectScale, cached.age, cycleCfg, {
                    scope: "project",
                    fadeAgeTick: cached.statusAge
                });
                anchor = this.applyScaleFactorToPoint(anchorBase, globalScale);
                anchor = this.applyRuntimeActionsToPoint(anchor, runtimeActions, globalCycleAge, cached.statusAge, anchorRef, globalAxis, {
                    skipExpression: skipExprPerPoint,
                    runtimeVars: frameRuntimeGlobals,
                    persistExpressionVars: false
                });
                anchorsByBirth[anchorRef] = anchor;
            }
            let px = anchor.x;
            let py = anchor.y;
            let pz = anchor.z;
            if (useLocalOps && cached.cardHasShapeOps) {
                let local = null;
                const levelMetaList = Array.isArray(this.previewLevelMetas?.[i]) && this.previewLevelMetas[i].length
                    ? this.previewLevelMetas[i]
                    : [];
                const ownerCard = this.getCardById(owner);
                const tupleHasPointDependentExpression = !!(ownerCard && levelMetaList.length && levelMetaList.some((meta) => {
                    const runtime = this.resolvePreviewTupleLevelRuntime(ownerCard, cached, meta, cached.elapsedTick, cached.age, skipExprPerPoint, frameRuntimeGlobals, globalAxis);
                    if (runtime?.hasPointDependentExpression) return true;
                    const sharedNode = meta?.sharedNode || null;
                    if (!sharedNode || sharedNode === meta?.node) return false;
                    const sharedRuntime = this.resolvePreviewTupleLevelRuntime(
                        ownerCard,
                        cached,
                        { node: sharedNode, depth: int(meta?.depth || 0) },
                        cached.elapsedTick,
                        cached.age,
                        skipExprPerPoint,
                        frameRuntimeGlobals,
                        globalAxis
                    );
                    return !!sharedRuntime?.hasPointDependentExpression;
                }));
                const localCacheable = !cached.cardRuntimeHasPointDependentExpression && !tupleHasPointDependentExpression;
                let localsByBirth = groupId >= 0 ? localCache[groupId] : null;
                if (!localsByBirth) {
                    localsByBirth = [];
                    if (groupId >= 0) localCache[groupId] = localsByBirth;
                }
                if (localCacheable) local = localsByBirth[localCacheRef];
                if (!local) {
                    const levelBaseList = Array.isArray(levelBasesAll[i]) && levelBasesAll[i].length
                        ? levelBasesAll[i]
                        : [localBase];
                    const levelRefList = Array.isArray(levelRefsAll[i]) && levelRefsAll[i].length
                        ? levelRefsAll[i]
                        : [localRef];
                    const levelOffsetRefList = Array.isArray(levelOffsetRefsAll?.[i]) && levelOffsetRefsAll[i].length
                        ? levelOffsetRefsAll[i]
                        : [];
                    const runtimeLevels = Array.isArray(cached.shapeRuntimeLevels) ? cached.shapeRuntimeLevels : [];
                    let localSum = U.v(0, 0, 0);
                    const transformedLevelRels = [];
                    const transformedLevelOrders = [];
                    let cascadeLevelRuntimes = [];
                    for (let lvIdx = 0; lvIdx < levelBaseList.length; lvIdx++) {
                        const activeCascadeLevelRuntimes = cascadeLevelRuntimes;
                        cascadeLevelRuntimes = [];
                        const lvBase = levelBaseList[lvIdx] || U.v(0, 0, 0);
                        const lvPointRef = int(levelRefList[lvIdx] ?? localRef);
                        const currentOffsetRef = int(levelOffsetRefList[lvIdx] ?? lvPointRef);
                        const lvMeta = levelMetaList[lvIdx] || null;
                        const sharedNode = lvMeta?.sharedNode || null;
                        const sharedMode = String(lvMeta?.sharedMode || "").trim();
                        const sharedOffsetRef = lvMeta && Number.isFinite(Number(lvMeta.sharedOffsetIndex))
                            ? int(lvMeta.sharedOffsetIndex)
                            : rootOffsetIndex;
                        const cardRootRuntime = lvIdx === 0 ? (runtimeLevels[0] || null) : null;
                        const sharedRuntime = (ownerCard && sharedNode)
                            ? this.resolvePreviewTupleLevelRuntime(
                                ownerCard,
                                cached,
                                { node: sharedNode, depth: int(lvMeta?.depth || 0) },
                                cached.elapsedTick,
                                cached.age,
                                skipExprPerPoint,
                                frameRuntimeGlobals,
                                globalAxis
                            )
                            : null;
                        const currentRuntime = (ownerCard && lvMeta?.node)
                            ? this.resolvePreviewTupleLevelRuntime(ownerCard, cached, lvMeta, cached.elapsedTick, cached.age, skipExprPerPoint, frameRuntimeGlobals, globalAxis)
                            : null;
                        const sharedNodeType = String(sharedNode?.type || "single");
                        const currentNodeType = String(lvMeta?.node?.type || "single");
                        let lvPoint = U.clone(lvBase);
                        const applyLevelRuntime = (runtime, offsetRef, opts = {}, actionPointRef = lvPointRef) => {
                            if (!runtime) return;
                            const mode = opts.mode === "angleOnly" ? "angleOnly" : "full";
                            const skipAngleOffset = opts.skipAngleOffset === true;
                            const runtimePointRef = Number.isFinite(Number(actionPointRef)) ? int(actionPointRef) : lvPointRef;
                            const lvActionElapsed = cached.elapsedTick;
                            const lvActionAge = cached.age;
                            const lvScaleAge = cached.age;
                            if (mode !== "angleOnly") {
                                const cardScale = this.resolveScaleFactor(runtime.scale, lvScaleAge, cycleCfg, {
                                    fadeAgeTick: cached.statusAge
                                });
                                lvPoint = this.applyScaleFactorToPoint(lvPoint, cardScale);
                            }
                            if (!skipAngleOffset && runtime.angleOffset) {
                                const offsetAngle = this.resolvePreviewAngleOffsetRotation(
                                    runtime.angleOffset,
                                    offsetRef,
                                    lvActionElapsed,
                                    lvActionAge,
                                    runtimePointRef,
                                    frameRuntimeGlobals,
                                    elapsedTick
                                );
                                if (Math.abs(offsetAngle) > 1e-9) {
                                    lvPoint = U.rotateAroundAxis(lvPoint, runtime.axis || globalAxis, offsetAngle);
                                }
                            }
                            if (mode !== "angleOnly" && runtime.actions && runtime.actions.length) {
                                const shapeScope = {
                                    rel: anchorBase,
                                    order: int(localIndex),
                                    shapeRels: transformedLevelRels,
                                    shapeOrders: transformedLevelOrders
                                };
                                lvPoint = this.applyRuntimeActionsToPoint(
                                    lvPoint,
                                    runtime.actions,
                                    lvActionElapsed,
                                    lvActionAge,
                                    runtimePointRef,
                                    runtime.axis || globalAxis,
                                    {
                                        skipExpression: skipExprPerPoint,
                                        runtimeVars: frameRuntimeGlobals,
                                        persistExpressionVars: false,
                                        shapeScope
                                    }
                                );
                            }
                        };
                        for (const desc of activeCascadeLevelRuntimes) {
                            applyLevelRuntime(desc.runtime, desc.offsetRef, {
                                mode: desc.mode,
                                skipAngleOffset: desc.skipAngleOffset
                            }, desc.pointRef);
                        }
                        if (cardRootRuntime) {
                            applyLevelRuntime(cardRootRuntime, rootOffsetIndex, { mode: "full" });
                        }
                        if (sharedRuntime) {
                            applyLevelRuntime(sharedRuntime, sharedOffsetRef, { mode: sharedMode || "full" });
                        }
                        const sharedTargetsCurrentNode = !!(sharedNode && lvMeta?.node && sharedNode === lvMeta.node);
                        const needCurrentRuntime = !!currentRuntime && !(sharedTargetsCurrentNode && (sharedMode || "full") === "full");
                        if (needCurrentRuntime) {
                            applyLevelRuntime(currentRuntime, currentOffsetRef, {
                                mode: "full",
                                skipAngleOffset: sharedTargetsCurrentNode && sharedMode === "angleOnly"
                            });
                        }
                        if (sharedRuntime && sharedNodeType !== "single") {
                            cascadeLevelRuntimes.push({
                                runtime: sharedRuntime,
                                offsetRef: sharedOffsetRef,
                                mode: sharedMode || "full",
                                skipAngleOffset: false,
                                pointRef: lvPointRef
                            });
                        }
                        if (needCurrentRuntime && currentNodeType !== "single") {
                            cascadeLevelRuntimes.push({
                                runtime: currentRuntime,
                                offsetRef: currentOffsetRef,
                                mode: "full",
                                skipAngleOffset: sharedTargetsCurrentNode && sharedMode === "angleOnly",
                                pointRef: lvPointRef
                            });
                        }
                        transformedLevelRels[lvIdx] = lvPoint;
                        transformedLevelOrders[lvIdx] = lvPointRef;
                        localSum.x += num(lvPoint.x);
                        localSum.y += num(lvPoint.y);
                        localSum.z += num(lvPoint.z);
                    }
                    local = localSum;
                    if (localCacheable) localsByBirth[localCacheRef] = local;
                }
                px = anchor.x + local.x;
                py = anchor.y + local.y;
                pz = anchor.z + local.z;
            }

            positions[i * 3 + 0] = px;
            positions[i * 3 + 1] = py;
            positions[i * 3 + 2] = pz;
            let pRef = this.previewPoints[i];
            if (!pRef) {
                pRef = U.v(px, py, pz);
                this.previewPoints[i] = pRef;
            } else {                pRef.x = px;
                pRef.y = py;
                pRef.z = pz;
            }

            const persistedCurrentAgeRaw = persistentCurrentAges[i];
            const persistedCurrentAge = Number.isFinite(Number(persistedCurrentAgeRaw))
                ? Math.max(0, num(persistedCurrentAgeRaw))
                : 0;
            const persistedLifetime = preserveFrameLifetimeAt(i);
            const persistedControllerState = (persistentControllerStates[i] && typeof persistentControllerStates[i] === "object")
                ? persistentControllerStates[i]
                : null;
            const pointVisualSources = Array.isArray(this.previewLeafVisualSources) ? this.previewLeafVisualSources : [];
            const pointVisualSource = pointVisualSources[i] || null;
            const ownerCardRef = groupId >= 0 ? (groupCard[groupId] || null) : this.getCardById(owner);
            const hasPerLeafVisualSource = !!pointVisualSource && pointVisualSource !== ownerCardRef;
            const sourceVisualDependency = ownerCardRef
                ? this.getCardPreviewVisualDependency(ownerCardRef, pointVisualSource ? { visualSource: pointVisualSource } : {})
                : null;
            const visualFramePointDependent = pointVisualSource
                ? !!sourceVisualDependency?.framePointDependent
                : !!cached.cardVisualFramePointDependent;
            const visualInitPointDependentCurrentAge = pointVisualSource
                ? !!sourceVisualDependency?.initPointDependentCurrentAge
                : !!cached.cardVisualInitPointDependentCurrentAge;
            const visualInitPointDependentLifetime = pointVisualSource
                ? !!sourceVisualDependency?.initPointDependentLifetime
                : !!cached.cardVisualInitPointDependentLifetime;
            const hadManualCurrentAge = manualAgeFlags[i] === 1;
            const hadInitializedLifetime = initializedLifetimeFlags[i] === 1;
            const needsInitCurrentAge = visualInitPointDependentCurrentAge && !hadManualCurrentAge;
            const needsInitLifetime = visualInitPointDependentLifetime && !hadInitializedLifetime;
            const needsPerPointVisual = !skipExprPerPoint && (
                visualFramePointDependent
                || needsInitCurrentAge
                || needsInitLifetime
            );
            const canShareLeafVisualBySource = hasPerLeafVisualSource && !needsPerPointVisual;
            let pointVisual = null;
            if (needsPerPointVisual || canShareLeafVisualBySource) {
                let groupVisualBucket = groupId >= 0 ? pointVisualCache[groupId] : null;
                if (!groupVisualBucket || typeof groupVisualBucket !== "object" || Array.isArray(groupVisualBucket)) {
                    groupVisualBucket = { byLocal: [], bySource: new Map() };
                    if (groupId >= 0) pointVisualCache[groupId] = groupVisualBucket;
                }
                if (needsPerPointVisual) {
                    const byLocal = Array.isArray(groupVisualBucket.byLocal) ? groupVisualBucket.byLocal : (groupVisualBucket.byLocal = []);
                    pointVisual = byLocal[localIndex];
                    if (!pointVisual) {
                        pointVisual = this.resolveCardPreviewVisual(owner, {
                            runtimeVars: frameRuntimeGlobals,
                            elapsedTick: pointElapsedTick,
                            ageTick: pointAgeTick,
                            currentAge: persistedCurrentAge,
                            lifetime: persistedLifetime,
                            keepInitializedCurrentAge: hadManualCurrentAge,
                            keepInitializedLifetime: hadInitializedLifetime,
                            controllerState: persistedControllerState,
                            pointIndex: localIndex,
                            visualSource: pointVisualSource
                        });
                        byLocal[localIndex] = pointVisual;
                    }
                } else {
                    const bySource = (groupVisualBucket.bySource instanceof Map)
                        ? groupVisualBucket.bySource
                        : (groupVisualBucket.bySource = new Map());
                    const sourceOwnerCard = ownerCardRef || this.getCardById(owner) || { id: owner };
                    const sourceCacheKey = this.makePreviewVisualSourceCacheKey(sourceOwnerCard, pointVisualSource);
                    pointVisual = bySource.get(sourceCacheKey) || null;
                    if (!pointVisual) {
                        pointVisual = this.resolveCardPreviewVisual(owner, {
                            runtimeVars: frameRuntimeGlobals,
                            elapsedTick: cached.elapsedTick,
                            ageTick: cached.age,
                            currentAge: persistedCurrentAge,
                            lifetime: persistedLifetime,
                            keepInitializedCurrentAge: hadManualCurrentAge,
                            keepInitializedLifetime: hadInitializedLifetime,
                            controllerState: persistedControllerState,
                            pointIndex: 0,
                            visualSource: pointVisualSource
                        });
                        bySource.set(sourceCacheKey, pointVisual);
                    }
                }
            } else {
                pointVisual = groupId >= 0 ? ownerVisualCache[groupId] : null;
                if (!pointVisual) {
                    pointVisual = this.resolveCardPreviewVisual(owner, {
                        runtimeVars: frameRuntimeGlobals,
                        elapsedTick: cached.elapsedTick,
                        ageTick: cached.age,
                        currentAge: persistedCurrentAge,
                        lifetime: persistedLifetime,
                        keepInitializedCurrentAge: hadManualCurrentAge,
                        keepInitializedLifetime: hadInitializedLifetime,
                        controllerState: persistedControllerState,
                        pointIndex: 0,
                        visualSource: pointVisualSource
                    });
                    if (groupId >= 0) ownerVisualCache[groupId] = pointVisual;
                }
            }
            if (pointVisual && pointVisual.__controllerState && typeof pointVisual.__controllerState === "object") {
                persistentControllerStates[i] = pointVisual.__controllerState;
            }

            const preserveInitializedCurrentAge = hadManualCurrentAge && visualInitPointDependentCurrentAge;
            let hasManualCurrentAge = pointVisual?.__manualCurrentAge === true;
            const resolvedCurrentAgeRaw = Number(pointVisual?.__resolvedCurrentAge);
            let resolvedCurrentAge;
            if (preserveInitializedCurrentAge) {
                resolvedCurrentAge = persistedCurrentAge;
                hasManualCurrentAge = true;
            } else if (hasManualCurrentAge && Number.isFinite(resolvedCurrentAgeRaw)) {
                resolvedCurrentAge = Math.max(0, resolvedCurrentAgeRaw);
            } else {
                resolvedCurrentAge = 0;
            }
            resolvedCurrentAges[i] = resolvedCurrentAge;
            persistentCurrentAges[i] = resolvedCurrentAge;
            manualAgeFlags[i] = hasManualCurrentAge ? 1 : 0;
            if (pointVisual?.__particleLifetimeInitialized === true
                || (hadInitializedLifetime && visualInitPointDependentLifetime)) {
                initializedLifetimeFlags[i] = 1;
            }
            const preserveInitializedLifetime = hadInitializedLifetime
                && (visualInitPointDependentLifetime || pointVisual?.__particleLifetimeInitialized === true);
            const resolvedLifetimeRaw = Number(pointVisual?.__resolvedLifetime);
            if (preserveInitializedLifetime) {
                resolvedLifetimes[i] = persistedLifetime;
                persistentLifetimes[i] = persistedLifetime;
            } else if (Number.isFinite(resolvedLifetimeRaw) && resolvedLifetimeRaw >= 1) {
                const nextLifetime = Math.max(1, int(resolvedLifetimeRaw));
                resolvedLifetimes[i] = nextLifetime;
                persistentLifetimes[i] = nextLifetime;
            } else {
                resolvedLifetimes[i] = persistedLifetime;
                persistentLifetimes[i] = persistedLifetime;
            }

            let rgb = pointVisual.__linearColor;
            if (!rgb) {
                rgb = srgbRgbToLinearArray(pointVisual.color);
                pointVisual.__linearColor = rgb;
            }
            colors[i * 3 + 0] = rgb[0];
            colors[i * 3 + 1] = rgb[1];
            colors[i * 3 + 2] = rgb[2];
            sizes[i] = Math.max(0.05, num(pointVisual.size));
            alphas[i] = clamp(clamp(num(pointVisual.alpha), 0, 1) * projectAlphaFactor, 0, 1);
            this.previewVisibleMask[i] = true;
            visible++;
        }

        this.updatePreviewFrameIndices(elapsedTick, cycleCfg, groupRuntimeCache, pointGroupIndex, totalCount, frameIndices);
        const statusText = `点数: ${visible}/${this.previewBasePoints.length}`;
        this.previewRenderWorkerInitBaselineReady = true;
        return {
            pointCount: totalCount,
            visible,
            statusText,
            elapsedTick,
            globalCycleAge,
            cycleTick: Math.max(0, Math.floor(globalCycleAge)),
            cycleIndex,
            runtimeAppliedTick: this.previewRuntimeAppliedTick,
            runtimeGlobals: frameRuntimeGlobals,
            attributesWrittenToGeometry,
            positions,
            colors,
            sizes,
            alphas,
            frameIndices,
            visibleMask: this.previewVisibleMask,
            resolvedCurrentAges,
            resolvedLifetimes,
            manualAgeFlags,
            initializedLifetimeFlags,
            persistentControllerStates
        };
    }

    isParticleTextureRenderable(pData) {
        if (!pData || !pData.atlasReady || !pData.atlas) return false;
        if (pData.textureLoadOk === false) return false;
        return true;
    }

    isTextureEffectAllowed(effectClass) {
        const name = String(effectClass || "").trim();
        if (!name) return false;
        if (TEXTURE_EFFECT_NAME_SET.has(name)) return true;
        try {
            const { getParticleDataByName } = this._particleDataFns || {};
            const pData = typeof getParticleDataByName === "function" ? getParticleDataByName(name) : null;
            if (Math.max(0, int(pData?.frames || 0)) > 0) return true;
        } catch {
        }
        return Math.max(0, int(this.previewTextureFramesByEffect?.[name] || 0)) > 0;
    }

    normalizePreviewTextureConfig(raw, fallback = null) {
        const base = (fallback && typeof fallback === "object")
            ? fallback
            : { effectClass: "", useTexture: false };
        const effectClass = String(raw?.effectClass ?? base.effectClass ?? "").trim();
        const useTexture = raw?.useTexture !== undefined
            ? raw.useTexture !== false
            : base.useTexture !== false;
        return { effectClass, useTexture };
    }

    resolvePreviewTextureConfigForCard(card) {
        return this.normalizePreviewTextureConfig({
            effectClass: String(card?.singleEffectClass || ""),
            useTexture: card?.singleUseTexture !== false
        });
    }

    resolvePreviewTextureConfigForShapeLeaf(node, card) {
        const cardCfg = this.resolvePreviewTextureConfigForCard(card);
        return this.normalizePreviewTextureConfig({
            effectClass: String(node?.effectClass || cardCfg.effectClass || ""),
            useTexture: node?.useTexture !== false
        }, cardCfg);
    }

    resolvePreviewLeafTextureConfig(card) {
        if (!card) return { effectClass: "", useTexture: false };
        if (String(card.dataType || "single") === "single") {
            return this.resolvePreviewTextureConfigForCard(card);
        }
        const leaf = this.resolvePreviewVisualSource(card);
        if (leaf && leaf !== card) {
            return this.resolvePreviewTextureConfigForShapeLeaf(leaf, card);
        }
        return this.resolvePreviewTextureConfigForCard(card);
    }

    collectPreviewVisualSources(card) {
        if (!card) return [];
        if (String(card.dataType || "single") === "single") return [card];
        const out = [];
        const seen = new Set();
        const push = (source) => {
            if (!source || typeof source !== "object") return;
            const key = String(source.id || "").trim();
            if (key) {
                if (seen.has(key)) return;
                seen.add(key);
            }
            out.push(source);
        };
        const walk = (children) => {
            if (!Array.isArray(children)) return;
            for (const child of children) {
                if (!child) continue;
                if (String(child.type || "single") === "single") {
                    push(child);
                    continue;
                }
                walk(child.children);
            }
        };
        walk(card.shapeChildren || []);
        if (!out.length) push(card);
        return out;
    }

    resolvePreviewVisualSource(card) {
        const sources = this.collectPreviewVisualSources(card);
        return sources[0] || card || null;
    }

    makePreviewVisualSourceCacheKey(card, visualSource = null) {
        const cardKey = String(card?.id || "").trim() || "__card__";
        const source = (visualSource && typeof visualSource === "object") ? visualSource : card;
        const sourceKey = String(source?.id || "").trim();
        if (!sourceKey || source === card) return `${cardKey}|__card__`;
        return `${cardKey}|${sourceKey}`;
    }

    updatePreviewFrameIndices(elapsedTick, cycleCfg, groupRuntimeCache, pointGroupIndex, totalCount, outputFrameIndices = null) {
        const frameAttr = outputFrameIndices ? null : this.pointsGeom?.getAttribute("aFrameIndex");
        if (!outputFrameIndices && !frameAttr) return;
        const frameIndices = outputFrameIndices || frameAttr.array;
        const { calcTextureFrame, getParticleDataByName } = this._particleDataFns || {};
        if (!calcTextureFrame || !getParticleDataByName) return;
        const resolvedCurrentAges = this.previewFrameCurrentAges;
        const resolvedLifetimes = this.previewFrameLifetimes;
        const manualAgeFlags = this.previewManualAgeFlags;
        const ownerIds = this.previewOwners;
        const cardById = this.previewCardById;
        const pointTextureCfgs = Array.isArray(this.previewLeafTextureConfigs) ? this.previewLeafTextureConfigs : [];
        const mergedOffsets = this._mergedAtlasOffsets;
        const textureConfigCache = new Map();
        const resolveTextureConfig = (owner) => {
            let cfg = textureConfigCache.get(owner);
            if (cfg !== undefined) return cfg;
            const card = cardById?.get(owner);
            cfg = this.resolvePreviewLeafTextureConfig(card);
            textureConfigCache.set(owner, cfg);
            return cfg;
        };
        const fallbackLifetime = Math.max(1, int(cycleCfg?.play || cycleCfg?.total || 1));
        for (let i = 0; i < totalCount; i++) {
            if (!this.previewVisibleMask[i]) { frameIndices[i] = 0; continue; }
            const groupId = (pointGroupIndex && i < pointGroupIndex.length) ? pointGroupIndex[i] : -1;
            const owner = groupId >= 0 ? (this.previewGroupOwner[groupId] || ownerIds[i]) : ownerIds[i];
            const textureCfg = pointTextureCfgs[i] || resolveTextureConfig(owner);
            if (!textureCfg?.useTexture || !textureCfg?.effectClass) { frameIndices[i] = 0; continue; }
            if (!this.isTextureEffectAllowed(textureCfg.effectClass)) { frameIndices[i] = 0; continue; }
            const pData = getParticleDataByName(textureCfg.effectClass);
            if (!this.isParticleTextureRenderable(pData)) { frameIndices[i] = 0; continue; }
            const cached = groupId >= 0 ? groupRuntimeCache[groupId] : null;
            const hasManualAge = !!(manualAgeFlags && manualAgeFlags[i] === 1);
            const resolvedAgeRaw = hasManualAge ? resolvedCurrentAges?.[i] : 0;
            const age = Number.isFinite(Number(resolvedAgeRaw))
                ? Math.max(0, num(resolvedAgeRaw))
                : 0;
            const perPointLifetime = (resolvedLifetimes && Number.isFinite(resolvedLifetimes[i]) && resolvedLifetimes[i] >= 1)
                ? resolvedLifetimes[i]
                : fallbackLifetime;
            const baseFrame = calcTextureFrame(age, perPointLifetime, pData.frames);
            const atlasOffset = (mergedOffsets && mergedOffsets.has(textureCfg.effectClass))
                ? mergedOffsets.get(textureCfg.effectClass)
                : 0;
            frameIndices[i] = baseFrame + atlasOffset;
        }
        if (frameAttr) frameAttr.needsUpdate = true;
    }

    syncTextureUniforms() {
        const shader = this._pointsShaderRef;
        if (!shader) return;
        const { getParticleDataByName } = this._particleDataFns || {};
        if (!getParticleDataByName) {
            shader.uniforms.uUseTexture.value = 0;
            return;
        }
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        const effectEntries = [];
        const seen = new Set();
        const pointTextureCfgs = Array.isArray(this.previewLeafTextureConfigs) ? this.previewLeafTextureConfigs : [];
        const pushTextureCfg = (cfg) => {
            if (!cfg?.useTexture || !cfg?.effectClass) return;
            if (!this.isTextureEffectAllowed(cfg.effectClass)) return;
            const pData = getParticleDataByName(cfg.effectClass);
            if (!this.isParticleTextureRenderable(pData)) return;
            if (seen.has(cfg.effectClass)) return;
            seen.add(cfg.effectClass);
            effectEntries.push({ effectClass: cfg.effectClass, pData });
        };
        if (pointTextureCfgs.length) {
            for (const cfg of pointTextureCfgs) {
                pushTextureCfg(cfg);
            }
        } else {
            for (const card of cards) {
                const cfg = this.resolvePreviewLeafTextureConfig(card);
                pushTextureCfg(cfg);
            }
        }
        if (!effectEntries.length) {
            shader.uniforms.uAtlas.value = null;
            shader.uniforms.uUseTexture.value = 0;
            shader.uniforms.uFrameCount.value = 0;
            this._mergedAtlasOffsets = null;
            return;
        }
        if (effectEntries.length === 1) {
            const { pData, effectClass } = effectEntries[0];
            if (!pData._threeTexture) {
                pData._threeTexture = new THREE.CanvasTexture(pData.atlas);
                pData._threeTexture.minFilter = THREE.NearestFilter;
                pData._threeTexture.magFilter = THREE.NearestFilter;
                pData._threeTexture.generateMipmaps = false;
            }
            shader.uniforms.uAtlas.value = pData._threeTexture;
            shader.uniforms.uFrameCount.value = pData.frames;
            shader.uniforms.uUseTexture.value = 1;
            const offsets = new Map();
            offsets.set(effectClass, 0);
            this._mergedAtlasOffsets = offsets;
            return;
        }
        const cacheKey = effectEntries.map((e) => e.effectClass).sort().join("|");
        if (this._mergedAtlasKey === cacheKey && this._mergedAtlasTexture && this._mergedAtlasOffsets) {
            shader.uniforms.uAtlas.value = this._mergedAtlasTexture;
            shader.uniforms.uFrameCount.value = this._mergedAtlasTotalFrames;
            shader.uniforms.uUseTexture.value = 1;
            return;
        }
        const FRAME_SIZE = 64;
        let totalFrames = 0;
        const offsets = new Map();
        for (const { effectClass, pData } of effectEntries) {
            offsets.set(effectClass, totalFrames);
            totalFrames += pData.frames;
        }
        const canvas = document.createElement("canvas");
        canvas.width = FRAME_SIZE * totalFrames;
        canvas.height = FRAME_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        for (const { effectClass, pData } of effectEntries) {
            const offset = offsets.get(effectClass);
            if (pData.atlas) {
                ctx.drawImage(pData.atlas, offset * FRAME_SIZE, 0);
            }
        }
        if (this._mergedAtlasTexture) {
            this._mergedAtlasTexture.dispose();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        this._mergedAtlasKey = cacheKey;
        this._mergedAtlasTexture = tex;
        this._mergedAtlasTotalFrames = totalFrames;
        this._mergedAtlasOffsets = offsets;
        shader.uniforms.uAtlas.value = tex;
        shader.uniforms.uFrameCount.value = totalFrames;
        shader.uniforms.uUseTexture.value = 1;
    }

    getPreviewCycleConfig() {
        let appear = 16;
        const play = Math.max(1, int(this.state.previewPlayTicks || 70));
        const fade = Math.max(0, int(this.state.disabledInterval || 0));
        let maxOwner = 1;
        const ownerCounts = Array.isArray(this.previewOwnerPointCount) ? this.previewOwnerPointCount : [];
        for (const x of ownerCounts) {
            maxOwner = Math.max(maxOwner, Math.max(1, int(x || 1)));
        }
        const maxCards = Math.max(1, int(this.previewRootVirtualTotal || this.state.cards.length));
        let hasExprGrowth = false;
        let maxGrowthTarget = 1;

        const estimateGrowthStepFromScript = (scriptRaw) => {
            const src = String(scriptRaw || "");
            if (!src) return 0;
            let step = (src.match(/addSingle\s*\(/g) || []).length;
            for (const m of src.matchAll(/addMultiple\s*\(\s*([^)]+)\s*\)/g)) {
                step += Math.max(1, int(this.evaluateNumericExpression(m[1] || "1")));
            }
            return Math.max(0, step);
        };

        const eatExprGrowth = (actions, targetCount = maxOwner) => {
            const list = Array.isArray(actions) ? actions : [];
            let step = 0;
            for (const raw of list) {
                const act = normalizeDisplayAction(raw);
                if (act.type !== "expression") continue;
                const src = String(act.expression || "");
                const singleHits = (src.match(/addSingle\s*\(/g) || []).length;
                if (singleHits) {
                    step += singleHits;
                    hasExprGrowth = true;
                }
                for (const m of src.matchAll(/addMultiple\s*\(\s*([^)]+)\s*\)/g)) {
                    step += Math.max(1, int(this.evaluateNumericExpression(m[1] || "1")));
                    hasExprGrowth = true;
                }
            }
            const safeTarget = Math.max(1, int(targetCount || 1));
            if (step > 0) {
                appear = Math.max(appear, Math.ceil(safeTarget / step));
                maxGrowthTarget = Math.max(maxGrowthTarget, safeTarget);
            }
        };

        eatExprGrowth(this.state.displayActions || [], maxCards);
        for (const card of this.state.cards) {
            if (card.dataType !== "single") {
                eatExprGrowth(card.shapeDisplayActions || [], maxOwner);
            }
        }
        if (hasExprGrowth) {
            appear = Math.max(appear, maxGrowthTarget);
        }
        appear = clamp(int(Math.max(1, appear)), 1, play);
        const live = Math.max(0, play - appear);
        const total = Math.max(1, play + fade);
        return { appear, live, fade, play, total };
    }

    evaluateGrowthVisibleLimit(ownerCardId, ownerCount, ageTick, globalCycleAge, elapsedTick, globalRuntimeActions = [], shapeRuntimeLevels = [], cycleCfg = null, rootCtx = null, runtimeVars = null) {
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const sequencedRoot = this.state.compositionType === "sequenced";
        let growthAge = num(ageTick);
        const rootGrowthAge = num(globalCycleAge);
        const rootInfo = (rootCtx && typeof rootCtx === "object") ? rootCtx : {};
        const runtimeScope = (runtimeVars && typeof runtimeVars === "object")
            ? runtimeVars
            : ((rootInfo.runtimeVars && typeof rootInfo.runtimeVars === "object")
                ? rootInfo.runtimeVars
                : ((this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                    ? this.previewRuntimeGlobals
                    : null));

        const totalCards = Math.max(1, int(rootInfo.rootVirtualTotal || this.previewRootVirtualTotal || this.state.cards.length));
        const cardIndexRaw = Number.isFinite(Number(rootInfo.ownerCardIndex))
            ? int(rootInfo.ownerCardIndex)
            : this.getCardIndexById(ownerCardId);
        const virtualIndex = Number.isFinite(Number(rootInfo.rootVirtualIndex))
            ? int(rootInfo.rootVirtualIndex)
            : (cardIndexRaw >= 0 ? cardIndexRaw : 0);
        const rootElapsedTick = Number.isFinite(Number(rootInfo.rootElapsedTick))
            ? num(rootInfo.rootElapsedTick)
            : num(elapsedTick);
        const rootPlan = (rootInfo.rootPlan && typeof rootInfo.rootPlan === "object")
            ? rootInfo.rootPlan
            : null;
        const bypassRootSequencedGrowthCardId = this.getPreviewRootSequencedGrowthBypassCardId();
        const disableRootSequencedGrowth = !!bypassRootSequencedGrowthCardId && String(ownerCardId || "") === String(bypassRootSequencedGrowthCardId);
        let rootVisibleCards = Number.POSITIVE_INFINITY;
        let hasRootGrowthSource = false;

        if (rootPlan) {
            hasRootGrowthSource = rootPlan.hasSource === true;
            rootVisibleCards = hasRootGrowthSource
                ? clamp(int(rootPlan.visibleCards || 0), 0, totalCards)
                : Number.POSITIVE_INFINITY;
        } else {
            if (sequencedRoot && !disableRootSequencedGrowth && this.state.compositionAnimates.length) {
                const n = this.computeAnimateVisibleCount(this.state.compositionAnimates, globalCycleAge, rootElapsedTick, 0, runtimeScope);
                rootVisibleCards = Math.min(rootVisibleCards, n);
                hasRootGrowthSource = true;
            }
            const rootExprCount = disableRootSequencedGrowth
                ? Number.POSITIVE_INFINITY
                : this.computeExpressionVisibleCount(globalRuntimeActions, totalCards, rootGrowthAge, {
                    scopeLevel: -1,
                    allowOrder: this.state.compositionType === "sequenced",
                    sequencedDepths: []
                });
            if (Number.isFinite(rootExprCount)) {
                rootVisibleCards = Math.min(rootVisibleCards, rootExprCount);
                hasRootGrowthSource = true;
            }
        }
        if (sequencedRoot && !disableRootSequencedGrowth && !hasRootGrowthSource) return 0;
        if (Number.isFinite(rootVisibleCards)) {
            const cardLimit = clamp(int(rootVisibleCards), 0, totalCards);
            if (virtualIndex >= cardLimit) return 0;
        }
        const card = rootInfo.ownerCard || this.getCardById(ownerCardId);
        const localLimit = this.evaluateLocalGrowthVisibleLimit(
            card,
            ownerCount,
            growthAge,
            elapsedTick,
            shapeRuntimeLevels,
            runtimeScope
        );
        if (!Number.isFinite(localLimit)) return Math.max(1, ownerCount);
        return clamp(int(localLimit), 0, Math.max(1, ownerCount));
    }

    evaluateLocalGrowthVisibleLimit(card, ownerCount, growthAge, elapsedTick, shapeRuntimeLevels = [], runtimeVars = null) {
        if (!card) return Math.max(1, ownerCount);
        let visibleLimit = Math.max(1, ownerCount);
        let hasLocalGrowthSource = false;
        const runtimeLevels = Array.isArray(shapeRuntimeLevels) ? shapeRuntimeLevels : [];
        const sequencedLevels = runtimeLevels.filter((lv) => !!lv?.sequenced);

        if (sequencedLevels.length) {
            for (const lv of sequencedLevels) {
                let levelLimit = Math.max(1, ownerCount);
                let hasLevelGrowthSource = false;
                if (Array.isArray(lv.growthAnimates) && lv.growthAnimates.length) {
                    const n = this.computeAnimateVisibleCount(lv.growthAnimates, growthAge, elapsedTick, 0, runtimeVars);
                    levelLimit = Math.min(levelLimit, n);
                    hasLevelGrowthSource = true;
                }
                const exprCount = this.computeExpressionVisibleCount(lv.actions, ownerCount, growthAge, {
                    scopeLevel: int(lv.scopeLevel || 0),
                    allowOrder: this.state.compositionType === "sequenced",
                    sequencedDepths: Array.isArray(lv.ancestorSequencedDepths) ? lv.ancestorSequencedDepths : []
                });
                if (Number.isFinite(exprCount)) {
                    levelLimit = Math.min(levelLimit, exprCount);
                    hasLevelGrowthSource = true;
                }
                if (!hasLevelGrowthSource) return 0;
                visibleLimit = Math.min(visibleLimit, levelLimit);
                hasLocalGrowthSource = true;
            }
        } else {
            const cardExprCount = this.computeExpressionVisibleCount(runtimeLevels[0]?.actions || [], ownerCount, growthAge, {
                scopeLevel: int(runtimeLevels[0]?.scopeLevel || 0),
                allowOrder: this.state.compositionType === "sequenced",
                sequencedDepths: Array.isArray(runtimeLevels[0]?.ancestorSequencedDepths) ? runtimeLevels[0].ancestorSequencedDepths : []
            });
            if (Number.isFinite(cardExprCount)) {
                visibleLimit = Math.min(visibleLimit, cardExprCount);
                hasLocalGrowthSource = true;
            }
            if (card.dataType === "sequenced_shape" && !hasLocalGrowthSource) return 0;
        }

        if (!Number.isFinite(visibleLimit)) return Math.max(1, ownerCount);
        return clamp(int(visibleLimit), 0, Math.max(1, ownerCount));
    }

    buildLocalGrowthPlan(card, ownerCount, shapeRuntimeLevels = [], ageTick = 0, elapsedTick = 0, runtimeVars = null) {
        const maxCount = Math.max(1, int(ownerCount || 1));
        const steps = Math.max(0, Math.floor(num(ageTick)));
        const unlockTickByIndex = new Array(maxCount).fill(Number.POSITIVE_INFINITY);
        let previousVisible = 0;

        for (let t = 0; t <= steps; t++) {
            let limit = this.evaluateLocalGrowthVisibleLimit(card, maxCount, t, t, shapeRuntimeLevels, runtimeVars);
            if (!Number.isFinite(limit)) limit = maxCount;
            let visible = clamp(int(limit), 0, maxCount);
            if (visible < previousVisible) visible = previousVisible;
            for (let idx = previousVisible; idx < visible; idx++) {
                unlockTickByIndex[idx] = t;
            }
            previousVisible = visible;
        }

        return {
            steps,
            visibleLimit: previousVisible,
            unlockTickByIndex
        };
    }

    getPreviewVisibleCardIdSet() {
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        const soloCards = cards.filter((card) => card && card.previewSolo === true);
        const source = soloCards.length ? soloCards : cards.filter((card) => card && card.previewVisible !== false);
        return new Set(source.map((card) => String(card.id || "")).filter(Boolean));
    }

    getPreviewIsolatedCardId() {
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        const soloCards = cards.filter((card) => card && card.previewSolo === true);
        return soloCards.length === 1 ? String(soloCards[0].id || "") || null : null;
    }

    getPreviewRootSequencedGrowthBypassCardId() {
        return null;
    }

    shouldDisablePreviewRootSequencedGrowth() {
        return false;
    }

    buildSequencedRootGrowthPlan(globalRuntimeActions, totalCards, globalCycleAge, elapsedTick, opts = null) {
        const maxCards = Math.max(1, int(totalCards || 1));
        const steps = Math.max(0, Math.floor(num(globalCycleAge)));
        const counts = new Array(steps + 1).fill(0);
        const unlockTickByIndex = new Array(maxCards).fill(Number.POSITIVE_INFINITY);
        let hasSource = false;
        let previousVisible = 0;
        const options = (opts && typeof opts === "object") ? opts : {};
        const baseRuntimeScope = (options.runtimeVars && typeof options.runtimeVars === "object")
            ? options.runtimeVars
            : ((this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                ? this.previewRuntimeGlobals
                : null);
        const replayGlobalVars = baseRuntimeScope ? this.buildPreviewRuntimeGlobals(0, 0, 0) : null;
        const replayStartAxis = options.axis || this.resolveCompositionAxisDirection();
        const hasReplayExpressions = !!(replayGlobalVars && Array.isArray(globalRuntimeActions)
            && globalRuntimeActions.some((act) => act?.type === "expression"));

        for (let t = 0; t <= steps; t++) {
            let visibleLimit = Number.POSITIVE_INFINITY;
            let hasTickSource = false;
            let tickRuntimeScope = baseRuntimeScope;
            if (hasReplayExpressions) {
                this.applyExpressionGlobalsOnce(globalRuntimeActions, t, t, replayGlobalVars, replayStartAxis);
                tickRuntimeScope = replayGlobalVars;
            }

            if (Array.isArray(this.state.compositionAnimates) && this.state.compositionAnimates.length) {
                const n = this.computeAnimateVisibleCount(this.state.compositionAnimates, t, t, 0, tickRuntimeScope);
                if (Number.isFinite(n)) {
                    visibleLimit = Math.min(visibleLimit, n);
                    hasTickSource = true;
                }
            }

            const exprCount = this.computeExpressionVisibleCount(globalRuntimeActions, maxCards, t, {
                scopeLevel: -1,
                allowOrder: this.state.compositionType === "sequenced",
                sequencedDepths: []
            });
            if (Number.isFinite(exprCount)) {
                visibleLimit = Math.min(visibleLimit, exprCount);
                hasTickSource = true;
            }

            let visible = hasTickSource ? clamp(int(visibleLimit), 0, maxCards) : 0;
            if (visible < previousVisible) visible = previousVisible;
            counts[t] = visible;
            if (hasTickSource) hasSource = true;
            for (let idx = previousVisible; idx < visible; idx++) {
                unlockTickByIndex[idx] = t;
            }
            previousVisible = visible;
        }

        return {
            hasSource,
            steps,
            counts,
            visibleCards: clamp(int(counts[steps] || 0), 0, maxCards),
            unlockTickByIndex
        };
    }

    computeExpressionVisibleCount(actionsOrScript, ownerCount, ageTick, opts = {}) {
        const steps = Math.max(0, Math.floor(num(ageTick)));
        const info = this.ensureExpressionVisiblePrefix(actionsOrScript, ownerCount, steps, opts);
        if (!info) return Number.POSITIVE_INFINITY;
        const result = Number(info.counts?.[steps]);
        if (Number.isFinite(result)) {
            return clamp(int(result), 0, info.safeOwnerCount);
        }
        return clamp(int(info.counts?.[info.counts.length - 1] || 0), 0, info.safeOwnerCount);
    }

    serializePreviewGrowthActions(actionsRaw = []) {
        const walk = (list) => {
            const src = Array.isArray(list) ? list : [];
            const parts = [];
            for (const act of src) {
                if (!act || typeof act !== "object") continue;
                if (act.type === "growth_add") {
                    parts.push(`a:${Math.max(1, int(act.count || 1))}`);
                    continue;
                }
                if (act.type === "conditional_growth") {
                    const cond = String(act.conditionExpr || "").trim();
                    const thenSig = walk(act.thenActions || []);
                    const elseSig = walk(act.elseActions || []);
                    parts.push(`c:${cond}?{${thenSig}}:{${elseSig}}`);
                }
            }
            return parts.join("|");
        };
        return walk(actionsRaw);
    }

    collectPreviewGrowthNativeActions(actionsRaw = []) {
        const src = Array.isArray(actionsRaw) ? actionsRaw : [];
        const out = [];
        for (const act of src) {
            if (!act || typeof act !== "object") continue;
            if (act.type === "growth_add") {
                out.push({
                    type: "growth_add",
                    count: Math.max(1, int(act.count || 1))
                });
                continue;
            }
            if (act.type === "conditional_native") {
                const thenActions = this.collectPreviewGrowthNativeActions(act.thenActions || []);
                const elseActions = this.collectPreviewGrowthNativeActions(act.elseActions || []);
                if (!thenActions.length && !elseActions.length) continue;
                const conditionExpr = String(act.conditionExpr || "").trim();
                const conditionFn = (typeof act.conditionFn === "function")
                    ? act.conditionFn
                    : this.getPreviewConditionFn(conditionExpr);
                out.push({
                    type: "conditional_growth",
                    conditionExpr,
                    conditionFn,
                    pointIndependent: act.pointIndependent === true,
                    compileKey: String(act.compileKey || ""),
                    thenActions,
                    elseActions
                });
            }
        }
        return out;
    }

    evaluatePreviewNativeGrowthDelta(actionsRaw = [], elapsedTick = 0, opts = {}) {
        const actions = Array.isArray(actionsRaw) ? actionsRaw : [];
        if (!actions.length) return 0;
        const scopeLevel = Math.max(-1, int(opts.scopeLevel ?? -1));
        const allowOrder = opts.allowOrder === true;
        const sequencedDepths = new Set(
            Array.isArray(opts.sequencedDepths)
                ? opts.sequencedDepths.map((it) => int(it))
                : []
        );
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : {};
        const ageTick = Number.isFinite(Number(opts.ageTick)) ? num(opts.ageTick) : num(elapsedTick);
        const pointIndex = int(opts.pointIndex || 0);
        let evalVars = null;
        const getEvalVars = () => {
            if (evalVars) return evalVars;
            const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
            vars.rel = U.v(0, 0, 0);
            if (allowOrder) vars.order = 0;
            for (let d = 0; d < scopeLevel; d++) {
                vars[`shapeRel${d}`] = U.v(0, 0, 0);
                if (sequencedDepths.has(d)) vars[`shapeOrder${d}`] = 0;
            }
            vars.thisAt = runtimeVars;
            evalVars = vars;
            return evalVars;
        };
        const walk = (list) => {
            const src = Array.isArray(list) ? list : [];
            let delta = 0;
            for (const act of src) {
                if (!act || typeof act !== "object") continue;
                if (act.type === "growth_add") {
                    delta += Math.max(1, int(act.count || 1));
                    continue;
                }
                if (act.type === "conditional_growth") {
                    const fn = (typeof act.conditionFn === "function")
                        ? act.conditionFn
                        : this.getPreviewConditionFn(act.conditionExpr);
                    let pass = false;
                    if (typeof fn === "function") {
                        try {
                            pass = !!fn(getEvalVars());
                        } catch {
                            pass = false;
                        }
                    }
                    const branch = pass
                        ? (Array.isArray(act.thenActions) ? act.thenActions : [])
                        : (Array.isArray(act.elseActions) ? act.elseActions : []);
                    delta += walk(branch);
                }
            }
            return delta;
        };
        return walk(actions);
    }

    ensureExpressionVisiblePrefix(actionsOrScript, ownerCount, steps, opts = {}) {
        const scopeLevel = Math.max(-1, int(opts.scopeLevel ?? -1));
        const allowOrder = opts.allowOrder === true;
        const sequencedDepthList = Array.isArray(opts.sequencedDepths)
            ? opts.sequencedDepths.map((it) => int(it))
            : [];
        const sequencedDepths = new Set(sequencedDepthList);
        const expressionActions = [];
        let nativeGrowthActions = [];
        let sourceSignature = "";
        if (typeof actionsOrScript === "string") {
            const src = String(actionsOrScript || "").trim();
            if (src) {
                expressionActions.push({
                    type: "expression",
                    expression: transpileKotlinThisQualifierToJs(src),
                    expressionRaw: src,
                    fn: null
                });
                sourceSignature = `s:${src}`;
            }
        } else {
            const actionList = Array.isArray(actionsOrScript) ? actionsOrScript : [];
            for (const act of actionList) {
                if (act?.type === "expression" && String(act.expression || "").trim()) expressionActions.push(act);
            }
            nativeGrowthActions = this.collectPreviewGrowthNativeActions(actionList);
            const exprSig = expressionActions.map((act) => String(act.expression || "").trim()).join("\n--\n");
            const nativeSig = this.serializePreviewGrowthActions(nativeGrowthActions);
            sourceSignature = `${exprSig}\n##native##\n${nativeSig}`;
        }
        const growthApiRe = /\baddSingle\s*\(|\baddMultiple\s*\(/;
        const hasExprGrowthApi = expressionActions.some((act) => growthApiRe.test(String(act.expression || "")));
        const hasNativeGrowth = nativeGrowthActions.length > 0;
        if (!hasExprGrowthApi && !hasNativeGrowth) return null;
        const safeOwnerCount = Math.max(1, int(ownerCount || 1));
        const scopeSig = `${scopeLevel}|${allowOrder ? 1 : 0}|${Array.from(sequencedDepths).sort((a, b) => a - b).join(",")}`;
        const prefixKey = `${safeOwnerCount}|${scopeSig}|${sourceSignature}`;
        let prefix = this.previewExprPrefixCache.get(prefixKey);
        if (!prefix) {
            const prepared = [];
            for (const act of expressionActions) {
                const srcRaw = String(act.expressionRaw || act.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                if (!src) continue;
                let fn = null;
                if (this.previewExprFnCache.has(src)) {
                    fn = this.previewExprFnCache.get(src) || null;
                } else {
                    try {
                        fn = new Function(
                            "vars",
                            "point",
                            "rotateToPoint",
                            "rotateAsAxis",
                            "rotateToWithAngle",
                            "addSingle",
                            "addMultiple",
                            "thisAt",
                            `with(vars){ ${src}\n }; return point;`
                        );
                    } catch {
                        fn = null;
                    }
                    if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                    this.previewExprFnCache.set(src, fn);
                }
                if (typeof fn === "function") prepared.push(fn);
            }
            prefix = { counts: [0], actions: prepared, nativeGrowthActions };
            if (this.previewExprPrefixCache.size > 256) this.previewExprPrefixCache.clear();
            this.previewExprPrefixCache.set(prefixKey, prefix);
        }
        const counts = Array.isArray(prefix.counts) ? prefix.counts : [0];
        let visible = Number(counts[counts.length - 1]) || 0;
        const actions = Array.isArray(prefix.actions) ? prefix.actions : [];
        const nativeActions = Array.isArray(prefix.nativeGrowthActions) ? prefix.nativeGrowthActions : [];
        for (let t = counts.length; t <= steps; t++) {
            if (visible < safeOwnerCount) {
                if (nativeActions.length) {
                    const thisAt = (this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                        ? this.previewRuntimeGlobals
                        : {};
                    visible += this.evaluatePreviewNativeGrowthDelta(nativeActions, t, {
                        scopeLevel,
                        allowOrder,
                        sequencedDepths: sequencedDepthList,
                        runtimeVars: thisAt,
                        pointIndex: 0,
                        ageTick: t
                    });
                }
                if (visible >= safeOwnerCount) {
                    counts[t] = safeOwnerCount;
                    continue;
                }
                for (const fn of actions) {
                    const thisAt = (this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                        ? this.previewRuntimeGlobals
                        : {};
                    const vars = this.createRuntimeExpressionScope(t, t, 0, thisAt, true);
                    vars.rel = U.v(0, 0, 0);
                    if (allowOrder) vars.order = 0;
                    for (let d = 0; d < scopeLevel; d++) {
                        vars[`shapeRel${d}`] = U.v(0, 0, 0);
                        if (sequencedDepths.has(d)) vars[`shapeOrder${d}`] = 0;
                    }
                    vars.thisAt = thisAt;
                    const noop = () => {};
                    const scaleHelperApi = { doScale: noop, doScaleReversed: noop };
                    const alphaHelperState = scopeLevel < 0
                        ? this.cloneProjectAlphaPreviewState(thisAt, this.state?.projectAlpha)
                        : null;
                    const alphaHelperApi = scopeLevel < 0
                        ? this.createProjectAlphaHelperApi(thisAt, this.state?.projectAlpha, {
                            mutating: false,
                            localState: alphaHelperState
                        })
                        : this.createProjectAlphaHelperApi(null, { type: "none" }, { mutating: false });
                    const addSingle = () => {
                        visible += 1;
                    };
                    const addMultiple = (n) => {
                        visible += Math.max(1, int(n || 1));
                    };
                    vars.rotateToPoint = noop;
                    vars.scaleHelper = scaleHelperApi;
                    vars.alphaHelper = alphaHelperApi;
                    try {
                        fn(vars, U.v(0, 0, 0), noop, noop, noop, addSingle, addMultiple, thisAt);
                    } catch {
                    }
                    if (visible >= safeOwnerCount) break;
                }
            }
            counts[t] = clamp(visible, 0, safeOwnerCount);
        }
        prefix.counts = counts;
        return {
            safeOwnerCount,
            counts
        };
    }

    resolveScaleFactor(rawScaleCfg, ageTick, cycleCfg = null, opts = {}) {
        const cfg = normalizeScaleHelperConfig(rawScaleCfg, { type: "none" });
        const scope = opts?.scope === "project" ? "project" : "local";
        if (scope !== "project") cfg.runMode = "auto";
        if (cfg.type === "none") return 1;
        const tickMax = Math.max(1, int(cfg.tick || 1));
        if (scope === "project" && cfg.runMode === "manual") {
            return this.evalScaleCurve(cfg, 0, tickMax);
        }
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const age = num(ageTick);
        const fadeAgeBase = Number.isFinite(Number(opts?.fadeAgeTick))
            ? num(opts.fadeAgeTick)
            : age;
        const fadeStart = cycle.play;
        const inFade = fadeAgeBase >= fadeStart;
        const fadeAge = Math.max(0, fadeAgeBase - fadeStart);
        const growTick = Math.min(tickMax, Math.max(0, age));
        let curveTick = growTick;
        if (cfg.reversedOnDisable && inFade) {
            const fadeSpan = Math.max(0, num(cycle.fade || 0));
            const fadeProgress = fadeSpan > 1e-6 ? clamp(fadeAge / fadeSpan, 0, 1) : 1;
            curveTick = tickMax * (1 - fadeProgress);
        }
        return this.evalScaleCurve(cfg, curveTick, tickMax);
    }

    evalScaleCurve(cfg, tickRaw, tickMaxRaw = 1) {
        const tickMax = Math.max(1, num(tickMaxRaw));
        const tick = clamp(num(tickRaw), 0, tickMax);        if (cfg.type === "bezier") {
            return this.evalScaleBezierValue(cfg, tick, tickMax);
        }
        const t = tick / tickMax;
        return num(cfg.min) + (num(cfg.max) - num(cfg.min)) * t;
    }

    evalScaleBezierValue(cfg, xTickRaw, tickMaxRaw) {
        const tickMax = Math.max(1, num(tickMaxRaw));
        const xTick = clamp(num(xTickRaw), 0, tickMax);
        const p0x = 0;
        const p0y = num(cfg.min);
        let p1xRaw = num(cfg.c1x);
        let p2xRaw = num(cfg.c2x);
        if (Math.abs(p1xRaw) <= 1 && Math.abs(p2xRaw) <= 1) {
            p1xRaw *= tickMax;
            p2xRaw *= tickMax;
        }
        const p1x = clamp(p1xRaw, 0, tickMax);
        const p1y = num(cfg.c1y);
        const p2x = clamp(p2xRaw, 0, tickMax);
        const p2y = num(cfg.c2y);
        const p3x = tickMax;
        const p3y = num(cfg.max);

        const cubic = (a, b, c, d, t) => {
            const inv = 1 - t;
            return inv * inv * inv * a + 3 * inv * inv * t * b + 3 * inv * t * t * c + t * t * t * d;
        };

        if (xTick <= 0) return p0y;
        if (xTick >= tickMax) return p3y;

        let lo = 0;
        let hi = 1;
        let mid = 0.5;
        for (let i = 0; i < 26; i++) {
            mid = (lo + hi) * 0.5;
            const x = cubic(p0x, p1x, p2x, p3x, mid);
            if (x < xTick) lo = mid;
            else hi = mid;
        }
        return cubic(p0y, p1y, p2y, p3y, mid);
    }

    applyScaleFactorToPoint(point, scaleFactor) {
        const s = num(scaleFactor);
        if (Math.abs(s - 1) <= 1e-9) return point;
        return U.v(point.x * s, point.y * s, point.z * s);
    }

    resolveProjectAlphaPreviewInitialValue(rawAlphaCfg) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        if (cfg.type === "none") return 1;
        return cfg.startMax ? num(cfg.max) : 1;
    }

    ensureProjectAlphaPreviewState(runtimeVars, rawAlphaCfg = null) {
        if (!runtimeVars || typeof runtimeVars !== "object") return null;
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        const stateKey = "__cpbProjectAlphaState";
        if (cfg.type === "none") {
            if (Object.prototype.hasOwnProperty.call(runtimeVars, stateKey)) {
                delete runtimeVars[stateKey];
            }
            return null;
        }
        const tickMax = Math.max(1, int(cfg.tick || 1));
        const minAlpha = num(cfg.min);
        const maxAlpha = num(cfg.max);
        let state = runtimeVars[stateKey];
        const needsInit = !state
            || typeof state !== "object"
            || int(state.tick) !== tickMax
            || num(state.min) !== minAlpha
            || num(state.max) !== maxAlpha
            || !!state.startMax !== !!cfg.startMax;
        if (needsInit) {
            state = {
                current: cfg.startMax ? tickMax : 0,
                alpha: cfg.startMax ? maxAlpha : 1,
                min: minAlpha,
                max: maxAlpha,
                tick: tickMax,
                startMax: !!cfg.startMax
            };
            runtimeVars[stateKey] = state;
            return state;
        }
        if (!Number.isFinite(Number(state.current))) {
            state.current = cfg.startMax ? tickMax : 0;
        }
        if (!Number.isFinite(Number(state.alpha))) {
            state.alpha = cfg.startMax ? maxAlpha : 1;
        }
        state.min = minAlpha;
        state.max = maxAlpha;
        state.tick = tickMax;
        state.startMax = !!cfg.startMax;
        return state;
    }

    cloneProjectAlphaPreviewState(runtimeVars, rawAlphaCfg = null) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        if (cfg.type === "none") return null;
        const state = this.ensureProjectAlphaPreviewState(runtimeVars, cfg);
        if (state && typeof state === "object") {
            return { ...state };
        }
        const tickMax = Math.max(1, int(cfg.tick || 1));
        return {
            current: cfg.startMax ? tickMax : 0,
            alpha: this.resolveProjectAlphaPreviewInitialValue(cfg),
            min: num(cfg.min),
            max: num(cfg.max),
            tick: tickMax,
            startMax: !!cfg.startMax
        };
    }

    syncProjectAlphaPreviewStateValue(state, rawAlphaCfg = null, currentRaw = 0) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        if (!state || typeof state !== "object" || cfg.type === "none") return 1;
        const tickMax = Math.max(1, int(cfg.tick || 1));
        const nextCurrent = clamp(int(currentRaw), 0, tickMax);
        state.current = nextCurrent;
        state.min = num(cfg.min);
        state.max = num(cfg.max);
        state.tick = tickMax;
        state.startMax = !!cfg.startMax;
        if (nextCurrent <= 0) {
            state.alpha = num(cfg.min);
            return state.alpha;
        }
        if (nextCurrent >= tickMax) {
            state.alpha = num(cfg.max);
            return state.alpha;
        }
        const progress = nextCurrent / tickMax;
        state.alpha = num(cfg.min) + (num(cfg.max) - num(cfg.min)) * progress;
        return state.alpha;
    }

    advanceProjectAlphaPreviewState(runtimeVars, rawAlphaCfg = null, delta = 0) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        const state = this.ensureProjectAlphaPreviewState(runtimeVars, cfg);
        if (!state || cfg.type === "none") return 1;
        const step = int(delta);
        if (step > 0) {
            if (int(state.current || 0) >= int(state.tick || 1)) return num(state.alpha);
            return this.syncProjectAlphaPreviewStateValue(state, cfg, int(state.current || 0) + 1);
        }
        if (step < 0) {
            if (int(state.current || 0) <= 0) return num(state.alpha);
            return this.syncProjectAlphaPreviewStateValue(state, cfg, int(state.current || 0) - 1);
        }
        return num(state.alpha);
    }

    toggleProjectAlphaPreviewState(runtimeVars, rawAlphaCfg = null, alphaRaw = 0) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        const state = this.ensureProjectAlphaPreviewState(runtimeVars, cfg);
        if (!state || cfg.type === "none") return 1;
        const targetAlpha = num(alphaRaw);
        const tickMax = Math.max(1, int(cfg.tick || 1));
        if (targetAlpha <= num(cfg.min)) {
            return this.syncProjectAlphaPreviewStateValue(state, cfg, 0);
        }
        if (targetAlpha >= num(cfg.max)) {
            return this.syncProjectAlphaPreviewStateValue(state, cfg, tickMax);
        }
        const step = Math.abs(num(cfg.max) - num(cfg.min)) / tickMax;
        if (step <= 1e-9) {
            return this.syncProjectAlphaPreviewStateValue(state, cfg, 0);
        }
        const point = targetAlpha - num(cfg.min);
        const tick = Math.round(point / step);
        return this.syncProjectAlphaPreviewStateValue(state, cfg, tick);
    }

    getProjectAlphaPreviewValue(runtimeVars, rawAlphaCfg = null) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        if (cfg.type === "none") return 1;
        const state = this.ensureProjectAlphaPreviewState(runtimeVars, cfg);
        if (!state) return this.resolveProjectAlphaPreviewInitialValue(cfg);
        return num(state.alpha);
    }

    createProjectAlphaHelperApi(runtimeVars, rawAlphaCfg = null, opts = {}) {
        const cfg = normalizeAlphaHelperConfig(rawAlphaCfg, { type: "none" });
        const localState = (opts.localState && typeof opts.localState === "object") ? opts.localState : null;
        const canMutate = opts.mutating === true || !!localState;
        const tickMax = Math.max(1, int(cfg.tick || 1));
        const readState = () => {
            if (localState) return localState;
            return this.ensureProjectAlphaPreviewState(runtimeVars, cfg);
        };
        const writeState = (current) => {
            const state = readState();
            if (!state) return null;
            this.syncProjectAlphaPreviewStateValue(state, cfg, current);
            return state;
        };
        const stepState = (delta) => {
            const state = readState();
            if (!state) return null;
            const current = int(state.current || 0);
            if (int(delta) > 0) {
                if (current >= tickMax) return state;
                return writeState(current + 1);
            }
            if (int(delta) < 0) {
                if (current <= 0) return state;
                return writeState(current - 1);
            }
            return state;
        };
        const toggleState = (alpha) => {
            const state = readState();
            if (!state) return null;
            const targetAlpha = num(alpha);
            if (targetAlpha <= num(cfg.min)) return writeState(0);
            if (targetAlpha >= num(cfg.max)) return writeState(tickMax);
            const step = Math.abs(num(cfg.max) - num(cfg.min)) / tickMax;
            if (step <= 1e-9) return writeState(0);
            const point = targetAlpha - num(cfg.min);
            return writeState(Math.round(point / step));
        };
        const noop = () => {};
        if (cfg.type === "none") {
            return {
                increaseAlpha: noop,
                decreaseAlpha: noop,
                resetAlphaMin: noop,
                resetAlphaMax: noop,
                toggleAlpha: noop,
                doAlphaTo: noop,
                over: () => false,
                isZero: () => true,
                getCurrentAlpha: () => 1
            };
        }
        return {
            increaseAlpha: () => {
                if (!canMutate) return;
                stepState(1);
            },
            decreaseAlpha: () => {
                if (!canMutate) return;
                stepState(-1);
            },
            resetAlphaMin: () => {
                if (!canMutate) return;
                writeState(0);
            },
            resetAlphaMax: () => {
                if (!canMutate) return;
                writeState(tickMax);
            },
            toggleAlpha: (alpha) => {
                if (!canMutate) return;
                toggleState(alpha);
            },
            doAlphaTo: (current) => {
                if (!canMutate) return;
                writeState(current);
            },
            over: () => {
                const state = readState();
                return !!state && int(state.current || 0) >= tickMax;
            },
            isZero: () => {
                const state = readState();
                return !state || int(state.current || 0) <= 0;
            },
            getCurrentAlpha: () => {
                const state = readState();
                return state ? num(state.alpha) : this.resolveProjectAlphaPreviewInitialValue(cfg);
            }
        };
    }

    getShapeLeafType(card) {
        return "single";
    }

    resolveShapeSourcePoints(bindMode, point, builderState) {
        if (bindMode === "builder") {
            const built = this.evaluateBuilderPoints(builderState);
            const pts = [];
            for (const p of (built?.points || [])) {
                pts.push(U.v(num(p?.x), num(p?.y), num(p?.z)));
            }
            return pts;
        }
        return [U.v(num(point?.x), num(point?.y), num(point?.z))];
    }

    combineLocalPointSets(base, extra) {
        const a = Array.isArray(base) ? base : [];
        const b = Array.isArray(extra) ? extra : [];
        if (!a.length || !b.length) return [];
        const out = [];
        for (const p of a) {
            for (const q of b) {
                out.push(U.v(num(p?.x) + num(q?.x), num(p?.y) + num(q?.y), num(p?.z) + num(q?.z)));
            }
        }
        return out;
    }

    resolvePreviewCardAngleOffsetConfig(card) {
        if (!card || card.dataType === "single") return null;
        return this.resolvePreviewAngleOffsetConfig(card);
    }

    clonePreviewTupleLevels(levelsBase = []) {
        return (Array.isArray(levelsBase) ? levelsBase : []).map((lv) => ({
            vec: U.v(num(lv?.vec?.x), num(lv?.vec?.y), num(lv?.vec?.z)),
            ref: int(lv?.ref || 0),
            offsetIndex: int(lv?.offsetIndex ?? 0),
            node: lv?.node || null,
            sharedNode: lv?.sharedNode || null,
            sharedMode: String(lv?.sharedMode || ""),
            sharedOffsetIndex: int(lv?.sharedOffsetIndex ?? 0),
            depth: int(lv?.depth || 0)
        }));
    }

    buildShapeLocalTuplesForPreview(card) {
        if (!card || card.dataType === "single") return [];
        const children = card.shapeChildren || [];
        if (!children.length) return [];
        return this._buildTreeChildrenTuplesForPreview(children, U.v(0, 0, 0), [], card);
    }

    _buildTreeChildrenTuplesForPreview(children, parentSum, parentLevels, rootCard = null) {
        const childList = Array.isArray(children) ? children : [];
        if (!childList.length) return [];
        let allTuples = [];
        for (const child of childList) {
            const childTuples = this._buildTreeNodeTuplesForPreview(child, parentSum, parentLevels, rootCard);
            allTuples = allTuples.concat(childTuples);
        }
        return allTuples;
    }

    _buildTreeNodeTuplesForPreview(node, parentSum, parentLevels, rootCard = null, opts = null) {
        if (!node) return [];
        const options = (opts && typeof opts === "object") ? opts : null;
        const sharedLevelNode = options?.sharedLevelNode || null;
        const sharedLevelMode = String(options?.sharedLevelMode || "").trim() || "angleOnly";
        const sharedLevelIndex = Number.isFinite(Number(options?.sharedLevelIndex)) ? int(options.sharedLevelIndex) : 0;
        const suppressOwnAngleOffset = options?.suppressOwnAngleOffset === true;
        const src = this.resolveShapeSourcePoints(node.bindMode, node.point, node.builderState);
        if (!src.length) return [];
        const nodeType = String(node.type || "single");
        const offsetCfg = suppressOwnAngleOffset ? null : this.resolvePreviewAngleOffsetConfig(node);
        const repeatCount = offsetCfg ? Math.max(1, int(offsetCfg.count || 1)) : 1;
        const leafTextureCfg = this.resolvePreviewTextureConfigForShapeLeaf(node, rootCard);
        const buildLevelEntry = (sv, ref, ownOffsetIndex, depth) => ({
            vec: U.clone(sv),
            ref: int(ref || 0),
            offsetIndex: int(ownOffsetIndex ?? 0),
            node,
            sharedNode: sharedLevelNode || (nodeType !== "single" ? node : null),
            sharedMode: sharedLevelNode ? sharedLevelMode : (nodeType !== "single" ? "full" : ""),
            sharedOffsetIndex: sharedLevelNode ? sharedLevelIndex : int(ownOffsetIndex ?? 0),
            depth: int(depth || 0)
        });
        const emitLeafTuples = (points, sumBase, levelsBase) => {
            const results = [];
            for (let si = 0; si < points.length; si++) {
                const p = points[si];
                const sv = U.v(num(p?.x), num(p?.y), num(p?.z));
                for (let ri = 0; ri < repeatCount; ri++) {
                    const levels = this.clonePreviewTupleLevels(levelsBase);
                    levels.push(buildLevelEntry(sv, si, ri, levelsBase.length + 1));
                    results.push({
                        sum: U.v(num(sumBase?.x) + sv.x, num(sumBase?.y) + sv.y, num(sumBase?.z) + sv.z),
                        levels,
                        textureCfg: leafTextureCfg,
                        visualSource: node
                    });
                }
            }
            return results;
        };
        if (nodeType === "single") {
            return emitLeafTuples(src, parentSum, parentLevels);
        }
        const nodeChildren = node.children || [];
        if (!nodeChildren.length) {
            return emitLeafTuples(src, parentSum, parentLevels);
        }
        let allTuples = [];
        for (let si = 0; si < src.length; si++) {
            const p = src[si];
            const sv = U.v(num(p?.x), num(p?.y), num(p?.z));
            const newSum = U.v(num(parentSum?.x) + sv.x, num(parentSum?.y) + sv.y, num(parentSum?.z) + sv.z);
            for (let ri = 0; ri < repeatCount; ri++) {
                const newLevels = this.clonePreviewTupleLevels(parentLevels);
                newLevels.push(buildLevelEntry(sv, si, ri, parentLevels.length + 1));
                const childTuples = this._buildTreeChildrenTuplesForPreview(nodeChildren, newSum, newLevels, rootCard);
                allTuples = allTuples.concat(childTuples);
            }
        }
        return allTuples;
    }

    buildShapeLocalPointsForPreview(card) {
        const tuples = this.buildShapeLocalTuplesForPreview(card);
        return tuples.map((it) => U.v(num(it?.sum?.x), num(it?.sum?.y), num(it?.sum?.z)));
    }

    getShapeCompositionTypeAtDepth(card, depth = 0) {
        if (!card) return "single";
        const d = Math.max(0, int(depth));
        if (d === 0) return String(card.dataType || "single");
        let nodes = card.shapeChildren || [];
        for (let i = 1; i <= d; i++) {
            if (!nodes.length) return "single";
            const node = nodes[0];
            if (i === d) return String(node.type || "single");
            nodes = node.children || [];
        }
        return "single";
    }

    getShapeScopeInfoByRuntimeLevel(card, runtimeLevel = 0) {
        const level = Math.max(0, int(runtimeLevel));
        const maxShapeDepth = Math.max(-1, level - 1);
        const sequencedDepths = [];
        for (let d = 0; d <= maxShapeDepth; d++) {
            if (this.getShapeCompositionTypeAtDepth(card, d) === "sequenced_shape") {
                sequencedDepths.push(d);
            }
        }
        return {
            allowRel: true,
            allowOrder: this.state.compositionType === "sequenced",
            maxShapeDepth,
            sequencedDepths
        };
    }

    getShapeRuntimeLevelsForPreview(card, elapsedTick, skipExpression = false) {
        if (!card || card.dataType === "single") return [];
        const levels = [];
        const rootScope = this.getShapeScopeInfoByRuntimeLevel(card, 0);
        const rootActions = this.buildPreviewRuntimeActions(elapsedTick, card.shapeDisplayActions || [], {
            skipExpression,
            scope: "shape_display",
            cardId: card.id,
            scopeLevel: 0
        });
        levels.push({
            scopeLevel: 0,
            ancestorSequencedDepths: rootScope.sequencedDepths,
            sequenced: card.dataType === "sequenced_shape",
            growthAnimates: card.dataType === "sequenced_shape" ? (card.growthAnimates || []) : [],
            axis: this.resolveRelativeDirection(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"),
            scale: normalizeScaleHelperConfig(card.shapeScale, { type: "none" }),
            angleOffset: this.resolvePreviewCardAngleOffsetConfig(card),
            actions: rootActions,
            hasExpression: !!rootActions.__hasExpression,
            hasPointDependentExpression: this.isPreviewActionsPointDependent(rootActions)
        });
        this._collectTreeNodeRuntimeLevels(card, card.shapeChildren || [], levels, 1, elapsedTick, skipExpression);
        return levels;
    }

    buildPreviewRuntimeLevelForNode(card, node, depth, elapsedTick, skipExpression) {
        if (!card || !node) return null;
        if (String(node.type || "single") === "single") return null;
        const scope = this.getShapeScopeInfoByRuntimeLevel(card, depth);
        const actions = this.buildPreviewRuntimeActions(elapsedTick, node.displayActions || [], {
            skipExpression,
            scope: "shape_level_display",
            cardId: card.id,
            scopeLevel: depth
        });
        const suppressOwnAngleOffset = false;
        return {
            scopeLevel: depth,
            ancestorSequencedDepths: scope.sequencedDepths,
            sequenced: node.type === "sequenced_shape",
            growthAnimates: node.type === "sequenced_shape" ? (node.growthAnimates || []) : [],
            axis: this.resolveRelativeDirection(node.axisExpr || node.axisPreset || "RelativeLocation.yAxis()"),
            scale: normalizeScaleHelperConfig(node.scale, { type: "none" }),
            angleOffset: suppressOwnAngleOffset ? null : this.resolvePreviewAngleOffsetConfig(node),
            actions,
            hasExpression: !!actions.__hasExpression,
            hasPointDependentExpression: this.isPreviewActionsPointDependent(actions)
        };
    }

    resolvePreviewTupleLevelRuntime(card, cached, levelMeta, elapsedTick, ageTick, skipExpression, runtimeVars, fallbackAxis) {
        if (!card || !levelMeta?.node) return null;
        if (!(cached.__tupleLevelRuntimeCache instanceof Map)) {
            cached.__tupleLevelRuntimeCache = new Map();
        }
        const depth = Math.max(1, int(levelMeta.depth || 0));
        const nodeId = String(levelMeta.node?.id || "").trim();
        const cacheKey = `${depth}:${nodeId || "no-id"}`;
        let runtime = cached.__tupleLevelRuntimeCache.get(cacheKey);
        if (runtime === undefined) {
            runtime = this.buildPreviewRuntimeLevelForNode(card, levelMeta.node, depth, elapsedTick, skipExpression) || null;
            cached.__tupleLevelRuntimeCache.set(cacheKey, runtime);
        }
        if (runtime && (runtime.hasExpression || !runtime.__globalsApplied)) {
            this.applyExpressionGlobalsOnce(runtime.actions, elapsedTick, ageTick, runtimeVars, runtime.axis || fallbackAxis);
            runtime.__globalsApplied = true;
        }
        return runtime;
    }

    _collectTreeNodeRuntimeLevels(card, children, levels, depth, elapsedTick, skipExpression) {
        if (!children || !children.length) return;
        const node = children[0];
        if (!node) return;
        if (String(node.type || "single") === "single") return;
        const runtimeLevel = this.buildPreviewRuntimeLevelForNode(card, node, depth, elapsedTick, skipExpression);
        if (runtimeLevel) levels.push(runtimeLevel);
        this._collectTreeNodeRuntimeLevels(card, node.children || [], levels, depth + 1, elapsedTick, skipExpression);
    }

    resolvePreviewAngleOffsetConfig(raw) {
        if (!raw || raw.angleOffsetEnabled !== true) return null;
        const rawType = String(raw.type || raw.dataType || "").trim();
        if (rawType === "single") return null;
        const count = Math.max(1, int(raw.angleOffsetCount || 1));
        if (count <= 1) return null;
        const easeSpecialParams = normalizeAngleOffsetEaseSpecialParams(raw);
        return {
            count,
            glowTick: Math.max(1, int(raw.angleOffsetGlowTick || 20)),
            easeName: normalizeAngleOffsetEaseName(raw.angleOffsetEase || "outCubic"),
            easeParams: {
                overshoot: easeSpecialParams.angleOffsetEaseOvershoot,
                period: easeSpecialParams.angleOffsetEasePeriod,
                decay: easeSpecialParams.angleOffsetEaseDecay,
                shift: easeSpecialParams.angleOffsetEaseShift,
                n1: easeSpecialParams.angleOffsetEaseN1,
                d1: easeSpecialParams.angleOffsetEaseD1,
                startX: easeSpecialParams.angleOffsetEaseBezierStartX,
                startY: easeSpecialParams.angleOffsetEaseBezierStartY,
                endX: easeSpecialParams.angleOffsetEaseBezierEndX,
                endY: easeSpecialParams.angleOffsetEaseBezierEndY
            },
            reverseOnDisable: raw.angleOffsetReverseOnDisable === true,
            angleMode: raw.angleOffsetAngleMode === "expr" ? "expr" : "numeric",
            angleValue: Number.isFinite(Number(raw.angleOffsetAngleValue)) ? num(raw.angleOffsetAngleValue) : 360,
            angleUnit: normalizeAngleUnit(raw.angleOffsetAngleUnit || "deg"),
            angleExpr: String(raw.angleOffsetAngleExpr || raw.angleOffsetAnglePreset || "PI * 2")
        };
    }

    resolvePreviewAngleOffsetTotalAngle(cfg, elapsedTick, ageTick, pointIndex, runtimeVars) {
        if (!cfg) return 0;
        if (cfg.angleMode === "expr") {
            return num(this.evaluateNumericExpressionWithRuntime(cfg.angleExpr || "PI * 2", runtimeVars, {
                elapsedTick,
                ageTick,
                pointIndex,
                thisAtVars: runtimeVars
            }));
        }
        return U.angleToRad(num(cfg.angleValue), normalizeAngleUnit(cfg.angleUnit));
    }

    resolvePreviewAngleOffsetRotation(cfg, repeatIndex, elapsedTick, ageTick, pointIndex, runtimeVars, statusElapsedTick = elapsedTick) {
        if (!cfg) return 0;
        const count = Math.max(1, int(cfg.count || 1));
        if (count <= 1) return 0;
        const index = clamp(int(repeatIndex || 0), 0, count - 1);
        const totalAngle = this.resolvePreviewAngleOffsetTotalAngle(cfg, elapsedTick, ageTick, pointIndex, runtimeVars);
        const targetAngle = totalAngle * index / count;
        const statusTick = Number.isFinite(Number(statusElapsedTick)) ? num(statusElapsedTick) : num(elapsedTick);
        return computeAngleAnimatorAngle({
            targetAngle,
            glowTick: Math.max(1, int(cfg.glowTick || 20)),
            easeName: normalizeAngleOffsetEaseName(cfg.easeName || "outCubic"),
            easeParams: cfg.easeParams || {},
            ageTick,
            elapsedTick,
            statusElapsedTick: statusTick,
            reverseOnDisable: cfg.reverseOnDisable === true,
            status: runtimeVars?.status || null
        });
    }

    isPreviewExpressionNonDeterministic(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        if (!src) return false;
        if (/\bRandom\b/.test(src)) return true;
        if (/\bMath\s*\.\s*random\s*\(/.test(src)) return true;
        return false;
    }

    isPreviewExpressionPointDependent(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        if (!src) return false;
        if (this.isPreviewExpressionNonDeterministic(src)) return true;
        if (/\b(?:index|order|rel|point)\b/.test(src)) return true;
        if (/\bshapeRel\d+\b/.test(src)) return true;
        if (/\bshapeOrder\d+\b/.test(src)) return true;
        return false;
    }

    doesPreviewExpressionReadVisualState(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        if (!src) return false;
        if (/\b(?:currentAge|lifetime|lifeTime|maxAge|textureSheet)\b/.test(src)) return true;
        if (/\bparticle\s*\.\s*(?:currentAge|lifetime|lifeTime|maxAge|textureSheet)\b/.test(src)) return true;
        return false;
    }

    isPreviewActionsPointDependent(actions = []) {
        for (const act of (Array.isArray(actions) ? actions : [])) {
            if (act?.type !== "expression") continue;
            const src = String(act.expressionRaw || act.expression || "").trim();
            if (!src) continue;
            if (this.isPreviewExpressionPointDependent(src)) return true;
        }
        return false;
    }

    extractLastAssignedExprInScript(scriptRaw, names = []) {
        const src = String(scriptRaw || "");
        if (!src || !Array.isArray(names) || !names.length) return "";
        let out = "";
        for (const rawName of names) {
            const name = String(rawName || "").trim();
            if (!name) continue;
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`(?:^|[;\\n])\\s*(?:let\\s+|var\\s+|const\\s+)?${escaped}\\s*=\\s*(?![=])([^;\\n]+)`, "g");
            let m = null;
            while ((m = re.exec(src)) !== null) {
                const expr = String(m[1] || "").trim();
                if (expr) out = expr;
            }
        }
        return out;
    }

    ensureControllerRuntimeProtos() {
        if (this.controllerScopeProto && this.controllerParticleProto) return;
        this.controllerScopeProto = {
            get color() { return this._ctx.color; },
            set color(v) { this._ctx.setColor(v); },
            get particleColor() { return this._ctx.particleColor; },
            set particleColor(v) { this._ctx.setColor(v); },
            get size() { return this._ctx.size; },
            set size(v) { this._ctx.setSize(v); },
            get particleSize() { return this._ctx.particleSize; },
            set particleSize(v) { this._ctx.setSize(v); },
            get alpha() { return this._ctx.alpha; },
            set alpha(v) { this._ctx.setAlpha(v); },
            get particleAlpha() { return this._ctx.particleAlpha; },
            set particleAlpha(v) { this._ctx.setAlpha(v); },
            get currentAge() { return this._ctx.currentAge; },
            set currentAge(v) {
                this._ctx.currentAge = int(v);
                this._ctx.__manualCurrentAge = true;
            },
            get lifetime() { return this._ctx.lifetime; },
            set lifetime(v) { this._ctx.lifetime = Math.max(1, int(v)); },
            get maxAge() { return this._ctx.lifetime; },
            set maxAge(v) { this._ctx.lifetime = Math.max(1, int(v)); },
            get textureSheet() { return this._ctx.textureSheet; },
            set textureSheet(v) { this._ctx.textureSheet = int(v); },
            get status() { return this._ctx.status; },
            set status(v) {
                const next = ensureStatusHelperMethods((v && typeof v === "object") ? v : { displayStatus: 1 });
                this._ctx.status = next;
                this._ctx.thisAt.status = next;
            }
        };
        this.controllerParticleProto = {
            get particleColor() { return this._ctx.particleColor; },
            set particleColor(v) { this._ctx.setColor(v); },
            get particleSize() { return this._ctx.particleSize; },
            set particleSize(v) { this._ctx.setSize(v); },
            get particleAlpha() { return this._ctx.particleAlpha; },
            set particleAlpha(v) { this._ctx.setAlpha(v); },
            get currentAge() { return this._ctx.currentAge; },
            set currentAge(v) {
                this._ctx.currentAge = int(v);
                this._ctx.__manualCurrentAge = true;
            },
            get lifetime() { return this._ctx.lifetime; },
            set lifetime(v) { this._ctx.lifetime = Math.max(1, int(v)); },
            get maxAge() { return this._ctx.lifetime; },
            set maxAge(v) { this._ctx.lifetime = Math.max(1, int(v)); },
            get textureSheet() { return this._ctx.textureSheet; },
            set textureSheet(v) { this._ctx.textureSheet = int(v); }
        };
    }

    applyControllerScriptVisual(visual, scriptRaw, opts = {}) {
        const srcRaw = String(scriptRaw || "").trim();
        if (!visual || !srcRaw) return;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const incomingControllerState = (opts.controllerState && typeof opts.controllerState === "object") ? opts.controllerState : null;
        const controllerVarNames = Array.isArray(opts.controllerVarNames) ? opts.controllerVarNames : [];
        const runtimeCtx = Object.assign({}, runtimeVars || {}, incomingControllerState || {});
        const thisAtVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : runtimeCtx;
        let statusRef = (thisAtVars.status && typeof thisAtVars.status === "object")
            ? thisAtVars.status
            : {};
        statusRef = ensureStatusHelperMethods(statusRef);
        thisAtVars.status = statusRef;
        runtimeCtx.status = statusRef;

        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const readVec = (expr) => this.parseVecLikeValueWithRuntime(expr, runtimeCtx, {
            elapsedTick,
            ageTick,
            pointIndex,
            thisAtVars
        });
        const toVec = (value, fallback = U.v(0, 0, 0)) => {
            if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
                return U.v(num(value.x), num(value.y), num(value.z));
            }
            if (typeof value === "string") {
                return readVec(value);
            }
            return fallback;
        };
        const setColor = (value) => {
            const vec = toVec(value, U.v(0, 0, 0));
            runtimeCtx.color = vec;
            runtimeCtx.particleColor = vec;
        };
        const setSize = (value) => {
            const v = Math.max(0.05, num(value));
            runtimeCtx.size = v;
            runtimeCtx.particleSize = v;
        };
        const setAlpha = (value) => {
            const v = clamp(num(value), 0, 1);
            runtimeCtx.alpha = v;
            runtimeCtx.particleAlpha = v;
        };

        setColor(U.v(
            clamp(num(visual.color?.[0]), 0, 1),
            clamp(num(visual.color?.[1]), 0, 1),
            clamp(num(visual.color?.[2]), 0, 1)
        ));
        setSize(visual.size);
        setAlpha(visual.alpha);
        const initialCurrentAge = Number.isFinite(Number(opts.currentAge))
            ? num(opts.currentAge)
            : 0;
        const initialLifetime = Number.isFinite(Number(opts.lifetime))
            ? Math.max(1, int(opts.lifetime))
            : (Number.isFinite(Number(visual.__resolvedLifetime))
                ? Math.max(1, int(visual.__resolvedLifetime))
                : 100);
        runtimeCtx.currentAge = Math.max(0, num(initialCurrentAge));
        runtimeCtx.__manualCurrentAge = false;
        runtimeCtx.lifetime = initialLifetime;
        runtimeCtx.textureSheet = num(runtimeCtx.textureSheet || 0);
        runtimeCtx.setColor = setColor;
        runtimeCtx.setSize = setSize;
        runtimeCtx.setAlpha = setAlpha;
        runtimeCtx.thisAt = thisAtVars;

        this.ensureControllerRuntimeProtos();
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
        const vars = Object.create(this.controllerScopeProto);
        vars._ctx = runtimeCtx;
        const baseProto = Object.getPrototypeOf(baseVars) || {};
        for (const [k, v] of Object.entries(baseProto)) {
            if (CONTROLLER_SCOPE_RESERVED.has(k)) continue;
            vars[k] = v;
        }
        for (const [k, v] of Object.entries(baseVars)) {
            if (CONTROLLER_SCOPE_RESERVED.has(k)) continue;
            vars[k] = v;
        }
        Object.defineProperty(vars, "age", {
            configurable: true,
            enumerable: true,
            get() { return num(runtimeCtx.currentAge); },
            set(v) {
                runtimeCtx.currentAge = int(v);
                runtimeCtx.__manualCurrentAge = true;
            }
        });
        Object.defineProperty(vars, "lifetime", {
            configurable: true,
            enumerable: true,
            get() { return num(runtimeCtx.lifetime); },
            set(v) { runtimeCtx.lifetime = Math.max(1, int(v)); }
        });
        Object.defineProperty(vars, "lifeTime", {
            configurable: true,
            enumerable: true,
            get() { return num(runtimeCtx.lifetime); },
            set(v) { runtimeCtx.lifetime = Math.max(1, int(v)); }
        });
        Object.defineProperty(vars, "maxAge", {
            configurable: true,
            enumerable: true,
            get() { return num(runtimeCtx.lifetime); },
            set(v) { runtimeCtx.lifetime = Math.max(1, int(v)); }
        });
        vars.tick = num(baseVars.tick);
        vars.index = int(baseVars.index);
        vars.thisAt = thisAtVars;
        for (const [k, v] of Object.entries(runtimeCtx)) {
            if (CONTROLLER_SCOPE_RESERVED.has(k)) continue;
            vars[k] = v;
        }
        const particle = Object.create(this.controllerParticleProto);
        particle._ctx = runtimeCtx;
        vars.particle = particle;

        const src = transpileKotlinThisQualifierToJs(srcRaw);
        const compileKey = String(opts.compileKey || "");
        const fn = compileKey
            ? this.getPreviewCompiledScriptFn(compileKey, src)
            : this.previewControllerFnCache.get(src);
        if (typeof fn === "function") {
            const noop = () => {};
            try {
                fn(vars, U.v(0, 0, 0), particle, noop, noop, noop, noop, noop, noop, thisAtVars);
            } catch {
            }
        }

        if (runtimeCtx.__manualCurrentAge !== true) {
            runtimeCtx.currentAge = Math.max(0, num(initialCurrentAge));
        }
        const nextControllerState = incomingControllerState ? { ...incomingControllerState } : {};
        for (const name of controllerVarNames) {
            if (!name) continue;
            nextControllerState[name] = vars[name];
        }
        visual.__controllerState = nextControllerState;

        setColor(runtimeCtx.color);
        setSize(runtimeCtx.size);
        setAlpha(runtimeCtx.alpha);
        let statusOut = (runtimeCtx.status && typeof runtimeCtx.status === "object") ? runtimeCtx.status : statusRef;
        const hasManualStatusAssign = /(^|[;\n])\s*(?:thisAt\.)?status\.(?:displayStatus\s*=(?!=)|disable\s*\(|enable\s*\()/.test(src);
        if (hasManualStatusAssign) statusOut.__manualDisplayStatus = true;
        else if (Object.prototype.hasOwnProperty.call(statusOut, "__manualDisplayStatus")) delete statusOut.__manualDisplayStatus;
        statusOut = ensureStatusHelperMethods(statusOut);
        if (statusOut.displayStatus !== 2 && Object.prototype.hasOwnProperty.call(statusOut, "__dissolveStartTick")) {
            delete statusOut.__dissolveStartTick;
        }
        runtimeCtx.status = statusOut;
        thisAtVars.status = statusOut;

        visual.color = [
            clamp(num(runtimeCtx.color?.x), 0, 1),
            clamp(num(runtimeCtx.color?.y), 0, 1),
            clamp(num(runtimeCtx.color?.z), 0, 1)
        ];
        visual.size = Math.max(0.05, num(runtimeCtx.size));
        visual.alpha = clamp(num(runtimeCtx.alpha), 0, 1);
        visual.__resolvedCurrentAge = Math.max(0, num(runtimeCtx.currentAge));
        visual.__manualCurrentAge = runtimeCtx.__manualCurrentAge === true;
        visual.__resolvedLifetime = Math.max(1, num(runtimeCtx.lifetime));
    }
    ensurePreviewVisualRuntimePlanCache() {
        if (!(this.previewVisualRuntimePlanCache instanceof Map)) {
            this.previewVisualRuntimePlanCache = new Map();
        }
        return this.previewVisualRuntimePlanCache;
    }

    normalizePreviewVisualInitTarget(rawTarget = "") {
        return String(rawTarget || "").trim().toLowerCase();
    }

    isPreviewVisualTimeDependent(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        if (!src) return false;
        if (/\b(?:age|tick|tickCount|currentAge|lifetime|lifeTime|maxAge|textureSheet)\b/.test(src)) return true;
        if (this.isPreviewExpressionNonDeterministic(src)) return true;
        return false;
    }

    getPreviewVisualRuntimePlan(card, opts = {}) {
        if (!card) return null;
        const visualSource = (opts.visualSource && typeof opts.visualSource === "object")
            ? opts.visualSource
            : this.resolvePreviewVisualSource(card);
        if (!visualSource) return null;
        const cache = this.ensurePreviewVisualRuntimePlanCache();
        const cacheKey = this.makePreviewVisualSourceCacheKey(card, visualSource);
        const cached = cache.get(cacheKey);
        if (cached && cached.visualSource === visualSource) return cached;
        const visualSourceId = String(visualSource.id || card.id || "").trim() || cacheKey;
        const particleInit = [];
        let ageDependent = false;
        let framePointDependent = false;
        let initPointDependentCurrentAge = false;
        let initPointDependentLifetime = false;
        let readsPointSpecificVisualState = false;
        for (const raw of (Array.isArray(visualSource.particleInit) ? visualSource.particleInit : [])) {
            const target = this.normalizePreviewVisualInitTarget(raw?.target || "");
            const exprRaw = String(raw?.expr || "").trim();
            if (!exprRaw) continue;
            const expr = transpileKotlinThisQualifierToJs(exprRaw).replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
            const exprPointDependent = this.isPreviewExpressionPointDependent(exprRaw);
            const exprReadsVisualState = this.doesPreviewExpressionReadVisualState(exprRaw);
            particleInit.push({ target, exprRaw, expr });
            if (target === "currentage" || target === "age" || target === "particle.currentage") {
                ageDependent = true;
                initPointDependentCurrentAge = true;
                continue;
            }
            if (target === "lifetime" || target === "particle.lifetime") {
                initPointDependentLifetime = true;
                if (this.isPreviewVisualTimeDependent(exprRaw)) ageDependent = true;
                continue;
            }
            if (this.isPreviewVisualTimeDependent(exprRaw)) ageDependent = true;
            if (exprPointDependent) framePointDependent = true;
            if (exprReadsVisualState) readsPointSpecificVisualState = true;
        }
        const controllerVars = Array.isArray(visualSource.controllerVars)
            ? visualSource.controllerVars.map((def) => ({ ...def, name: String(def?.name || "").trim(), exprRaw: String(def?.expr || "").trim() }))
            : [];
        for (const def of controllerVars) {
            if (!def.exprRaw) continue;
            if (this.isPreviewVisualTimeDependent(def.exprRaw)) ageDependent = true;
            if (this.isPreviewExpressionPointDependent(def.exprRaw)) {
                framePointDependent = true;
            }
            if (this.doesPreviewExpressionReadVisualState(def.exprRaw)) {
                readsPointSpecificVisualState = true;
            }
        }
        const controllerActions = [];
        for (let actionIdx = 0; actionIdx < (Array.isArray(visualSource.controllerActions) ? visualSource.controllerActions.length : 0); actionIdx++) {
            const action = visualSource.controllerActions[actionIdx];
            const scriptRaw = String(action?.script || "").trim();
            const compileKey = this.makePreviewControllerScriptCompileKey(visualSourceId, actionIdx);
            controllerActions.push({ action, scriptRaw, compileKey });
            if (!scriptRaw) continue;
            ageDependent = true;
            if (this.isPreviewExpressionPointDependent(scriptRaw)) {
                framePointDependent = true;
            }
            if (this.doesPreviewExpressionReadVisualState(scriptRaw)) {
                readsPointSpecificVisualState = true;
            }
        }
        const pointDependent = framePointDependent || ((initPointDependentCurrentAge || initPointDependentLifetime) && readsPointSpecificVisualState);
        const plan = {
            visualSource,
            visualSourceId,
            particleInit,
            controllerVars,
            controllerActions,
            dependency: {
                ageDependent,
                pointDependent,
                framePointDependent,
                initPointDependentCurrentAge,
                initPointDependentLifetime,
                readsPointSpecificVisualState
            }
        };
        cache.set(cacheKey, plan);
        return plan;
    }

    getCardPreviewVisualDependency(card, opts = {}) {
        const empty = {
            ageDependent: false,
            pointDependent: false,
            framePointDependent: false,
            initPointDependentCurrentAge: false,
            initPointDependentLifetime: false,
            readsPointSpecificVisualState: false
        };
        if (!card) return empty;
        const cache = (this.previewCardVisualAgeDependentCache instanceof Map)
            ? this.previewCardVisualAgeDependentCache
            : (this.previewCardVisualAgeDependentCache = new Map());
        const visualSource = (opts.visualSource && typeof opts.visualSource === "object") ? opts.visualSource : null;
        if (visualSource) {
            const cacheKey = this.makePreviewVisualSourceCacheKey(card, visualSource);
            const cached = cache.get(cacheKey);
            if (cached && typeof cached === "object") return cached;
            const plan = this.getPreviewVisualRuntimePlan(card, { visualSource });
            const dependency = (plan && plan.dependency && typeof plan.dependency === "object")
                ? plan.dependency
                : { ...empty };
            cache.set(cacheKey, dependency);
            return dependency;
        }
        const aggregateKey = `${String(card.id || "").trim() || "__card__"}|__aggregate__`;
        const cached = cache.get(aggregateKey);
        if (cached && typeof cached === "object") return cached;
        const dependency = { ...empty };
        const sources = this.collectPreviewVisualSources(card);
        for (const source of sources) {
            const part = this.getCardPreviewVisualDependency(card, { visualSource: source });
            dependency.ageDependent = dependency.ageDependent || !!part?.ageDependent;
            dependency.pointDependent = dependency.pointDependent || !!part?.pointDependent;
            dependency.framePointDependent = dependency.framePointDependent || !!part?.framePointDependent;
            dependency.initPointDependentCurrentAge = dependency.initPointDependentCurrentAge || !!part?.initPointDependentCurrentAge;
            dependency.initPointDependentLifetime = dependency.initPointDependentLifetime || !!part?.initPointDependentLifetime;
            dependency.readsPointSpecificVisualState = dependency.readsPointSpecificVisualState || !!part?.readsPointSpecificVisualState;
        }
        cache.set(aggregateKey, dependency);
        return dependency;
    }

    resolveCardPreviewVisual(cardId, opts = {}) {
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const keepInitializedCurrentAge = opts.keepInitializedCurrentAge === true;
        const keepInitializedLifetime = opts.keepInitializedLifetime === true;
        const fallback = { color: [1, 1, 1], size: 0.2, alpha: 1 };
        const card = this.getCardById(cardId);
        if (!card) return fallback;
        const requestedVisualSource = (opts.visualSource && typeof opts.visualSource === "object") ? opts.visualSource : null;
        const visualPlan = this.getPreviewVisualRuntimePlan(card, { visualSource: requestedVisualSource });
        const visualSource = visualPlan?.visualSource || requestedVisualSource || this.resolvePreviewVisualSource(card);
        if (!visualSource) return fallback;
        const visual = { color: [...fallback.color], size: 0.2, alpha: 1 };
        let resolvedCurrentAge = Number.isFinite(Number(opts.currentAge))
            ? Math.max(0, num(opts.currentAge))
            : 0;
        let manualCurrentAge = false;
        let particleLifetimeInitialized = false;
        const evalRuntimeVars = runtimeVars ? Object.create(runtimeVars) : {};
        evalRuntimeVars.currentAge = resolvedCurrentAge;
        evalRuntimeVars.lifetime = Number.isFinite(Number(opts.lifetime))
            ? Math.max(1, int(opts.lifetime))
            : (Number.isFinite(Number(runtimeVars?.lifetime))
                ? Math.max(1, int(runtimeVars.lifetime))
                : 100);
        evalRuntimeVars.lifeTime = evalRuntimeVars.lifetime;
        evalRuntimeVars.textureSheet = Number.isFinite(Number(runtimeVars?.textureSheet))
            ? int(runtimeVars.textureSheet)
            : 0;
        const evalThisAtVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : evalRuntimeVars;
        const evalScope = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, evalRuntimeVars, true);
        evalScope.thisAt = evalThisAtVars;
        const particleInitEntries = Array.isArray(visualPlan?.particleInit) ? visualPlan.particleInit : [];
        for (const it of particleInitEntries) {
            const target = it.target;
            const expr = String(it.expr || "").trim();
            if (!expr) continue;
            if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") {
                const vec = this.parseVecLikeValueWithRuntime(expr, evalRuntimeVars, { elapsedTick, ageTick, pointIndex, thisAtVars: evalThisAtVars, runtimeScope: evalScope });
                visual.color = [clamp(num(vec.x), 0, 1), clamp(num(vec.y), 0, 1), clamp(num(vec.z), 0, 1)];
            }
            if (target === "size" || target === "particlesize" || target === "particle.particlesize") {
                visual.size = Math.max(0.05, num(this.evaluateNumericExpressionWithRuntime(expr, evalRuntimeVars, { elapsedTick, ageTick, pointIndex, thisAtVars: evalThisAtVars, runtimeScope: evalScope })));
            }
            if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") {
                visual.alpha = clamp(num(this.evaluateNumericExpressionWithRuntime(expr, evalRuntimeVars, { elapsedTick, ageTick, pointIndex, thisAtVars: evalThisAtVars, runtimeScope: evalScope })), 0, 1);
            }
            if (target === "lifetime" || target === "particle.lifetime") {
                particleLifetimeInitialized = true;
                const nextLifetime = keepInitializedLifetime
                    ? Math.max(1, int(evalRuntimeVars.lifetime))
                    : Math.max(1, int(this.evaluateNumericExpressionWithRuntime(expr, evalRuntimeVars, { elapsedTick, ageTick, pointIndex, thisAtVars: evalThisAtVars, runtimeScope: evalScope })));
                visual.__resolvedLifetime = nextLifetime;
                evalRuntimeVars.lifetime = nextLifetime;
                evalRuntimeVars.lifeTime = nextLifetime;
            }
            if (target === "currentage" || target === "age" || target === "particle.currentage") {
                if (keepInitializedCurrentAge) {
                    resolvedCurrentAge = Math.max(0, num(resolvedCurrentAge));
                    manualCurrentAge = true;
                } else {
                    resolvedCurrentAge = Math.max(0, int(this.evaluateNumericExpressionWithRuntime(expr, evalRuntimeVars, { elapsedTick, ageTick, pointIndex, thisAtVars: evalThisAtVars, runtimeScope: evalScope })));
                    manualCurrentAge = true;
                }
                evalRuntimeVars.currentAge = resolvedCurrentAge;
            }
        }
        const controllerVarDefs = Array.isArray(visualPlan?.controllerVars) ? visualPlan.controllerVars : [];
        const controllerVarNames = [];
        let controllerState = (opts.controllerState && typeof opts.controllerState === "object")
            ? { ...opts.controllerState }
            : {};
        for (const def of controllerVarDefs) {
            const name = String(def?.name || "").trim();
            if (!name) continue;
            controllerVarNames.push(name);
            if (Object.prototype.hasOwnProperty.call(controllerState, name)) continue;
            controllerState[name] = this.resolvePreviewControllerVarInitialValue(def, runtimeVars, {
                elapsedTick,
                ageTick,
                pointIndex,
                thisAtVars: runtimeVars
            });
        }
        const controllerActions = Array.isArray(visualPlan?.controllerActions) ? visualPlan.controllerActions : [];
        for (let actionIdx = 0; actionIdx < controllerActions.length; actionIdx++) {
            const actionEntry = controllerActions[actionIdx] || {};
            this.applyControllerScriptVisual(visual, String(actionEntry.scriptRaw || ""), {
                runtimeVars,
                elapsedTick,
                ageTick,
                pointIndex,
                currentAge: resolvedCurrentAge,
                lifetime: visual.__resolvedLifetime,
                controllerState,
                controllerVarNames,
                compileKey: String(actionEntry.compileKey || "")
            });
            if (visual.__controllerState && typeof visual.__controllerState === "object") {
                controllerState = visual.__controllerState;
            }
            const nextCurrentAge = Number(visual.__resolvedCurrentAge);
            if (Number.isFinite(nextCurrentAge)) {
                resolvedCurrentAge = Math.max(0, nextCurrentAge);
            }
            if (visual.__manualCurrentAge === true) {
                manualCurrentAge = true;
            }
        }
        visual.__controllerState = controllerState;
        visual.__resolvedCurrentAge = resolvedCurrentAge;
        visual.__manualCurrentAge = manualCurrentAge;
        visual.__particleLifetimeInitialized = particleLifetimeInitialized;
        if (!visual.hasOwnProperty("__resolvedLifetime")) {
            visual.__resolvedLifetime = Math.max(1, num(evalRuntimeVars.lifetime));
        }
        return visual;
    }

    resolvePreviewControllerVarInitialValue(def, runtimeVars = null, opts = {}) {
        const type = String(def?.type || "Double").trim();
        const expr = String(def?.expr || "").trim();
        if (!expr) {
            if (type === "Boolean") return false;
            if (type === "String") return "";
            return 0;
        }
        const out = this.evaluateExpressionWithRuntime(expr, runtimeVars, opts);
        if (type === "Boolean") return !!out;
        if (type === "Int" || type === "Long") return int(out);
        if (type === "Float" || type === "Double") return num(out);
        if (type === "String") return out == null ? "" : String(out);
        return out;
    }

    isScriptAgeDependent(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        return /\b(?:age|currentAge|index|textureSheet|lifetime|maxAge)\b/.test(src);
    }

    isCardVisualAgeDependent(card) {
        return !!this.getCardPreviewVisualDependency(card)?.ageDependent;
    }

    computeAnimateVisibleCount(list, ageTick, tick, index, runtimeVars = null) {
        const arr = Array.isArray(list) ? list.map((it) => normalizeAnimate(it)) : [];
        if (!arr.length) return Number.POSITIVE_INFINITY;
        let count = 0;
        for (const it of arr) {
            if (!this.evaluateAnimateCondition(it.condition, ageTick, tick, index, runtimeVars)) continue;
            count += Math.max(1, int(it.count || 1));
        }
        return count;
    }

    evaluateAnimateCondition(exprRaw, ageTick, tick, index, runtimeVars = null) {
        const expr = String(exprRaw || "").trim();
        if (!expr) return true;
        const runtimeScope = (runtimeVars && typeof runtimeVars === "object")
            ? runtimeVars
            : ((this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                ? this.previewRuntimeGlobals
                : null);
        const vars = this.createRuntimeExpressionScope(tick, ageTick, index, runtimeScope, true);
        vars.thisAt = runtimeScope || vars;
        const fn = this.getPreviewConditionFn(expr);
        if (typeof fn !== "function") return false;
        try {
            return !!fn(vars);
        } catch {
            return false;
        }
    }

    buildPreviewRuntimeActions(elapsedTick, rawActions = null, opts = {}) {
        const skipExpression = !!opts.skipExpression;
        const cardId = String(opts.cardId || "");
        const scope = String(opts.scope || "display");
        const scopeLevel = Number.isFinite(Number(opts.scopeLevel))
            ? int(opts.scopeLevel)
            : (scope === "shape_display" ? 0 : (scope === "display" ? -1 : 1));
        const out = [];
        let hasExpression = false;
        let hasNonExpression = false;
        const source = Array.isArray(rawActions) ? rawActions : (this.state.displayActions || []);
        for (let actionIdx = 0; actionIdx < source.length; actionIdx++) {
            const action = source[actionIdx];
            const a = normalizeDisplayAction(action);
            if (a.type === "rotateToPoint") {
                out.push({ type: a.type, to: this.resolveRelativeDirection(a.toExpr || a.toPreset) });
                hasNonExpression = true;
                continue;
            }
            if (a.type === "rotateAsAxis") {
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                out.push({ type: a.type, anglePerTick });
                hasNonExpression = true;
                continue;
            }
            if (a.type === "rotateToWithAngle") {
                const to = this.resolveRelativeDirection(a.toExpr || a.toPreset);
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                out.push({ type: a.type, to, anglePerTick });
                hasNonExpression = true;
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const srcRaw = String(a.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                const compileKey = this.makePreviewDisplayActionCompileKey(scope, cardId, scopeLevel, actionIdx);
                const folded = this.tryFoldSimpleExpressionAction(srcRaw, elapsedTick, { compileKey });
                if (folded) {
                    if (folded.type === "conditional_native") {
                        out.push({
                            ...folded,
                            compileKey
                        });
                    } else if (folded.type === "folded_sequence" && Array.isArray(folded.actions) && folded.actions.length) {
                        for (const item of folded.actions) out.push(item);
                    } else {
                        out.push(folded);
                    }
                    hasNonExpression = true;
                    continue;
                }
                let fn = null;
                if (src) {
                    fn = this.getPreviewCompiledScriptFn(compileKey, src);
                    hasExpression = true;
                }
                out.push({ type: a.type, expression: src, expressionRaw: srcRaw, fn, compileKey });
            }
        }
        out.__hasExpression = hasExpression;
        out.__allExpression = out.length > 0 && !hasNonExpression;
        return out;
    }

    getPreviewConditionFn(exprRaw = "") {
        const expr = String(exprRaw || "").trim();
        if (!expr) return null;
        let fn = this.previewCondFnCache.get(expr);
        if (fn === undefined) {
            try {
                fn = new Function("vars", `with(vars){ return !!(${expr}\n); }`);
            } catch {
                fn = null;
            }
            if (this.previewCondFnCache.size > 1024) this.previewCondFnCache.clear();
            this.previewCondFnCache.set(expr, fn);
        }
        return (typeof fn === "function") ? fn : null;
    }

    splitTopLevelArgs(argsRaw) {
        const src = String(argsRaw || "");
        const out = [];
        let start = 0;
        let depthParen = 0;
        let depthBracket = 0;
        let depthBrace = 0;
        let inSingle = false;
        let inDouble = false;
        let escaped = false;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (inSingle) {
                if (ch === "'") inSingle = false;
                continue;
            }
            if (inDouble) {
                if (ch === "\"") inDouble = false;
                continue;
            }
            if (ch === "'") {
                inSingle = true;
                continue;
            }
            if (ch === "\"") {
                inDouble = true;
                continue;
            }
            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
            else if (ch === "[") depthBracket++;
            else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
            else if (ch === "{") depthBrace++;
            else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
            else if (ch === "," && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
                out.push(src.slice(start, i).trim());
                start = i + 1;
            }
        }
        out.push(src.slice(start).trim());
        return out.filter((x) => x.length > 0);
    }

    isFoldableStaticNumericExpr(exprRaw) {
        const src = String(exprRaw || "").trim().replace(/\bMath\.PI\b/g, "PI").replace(/\bMath\.E\b/g, "E");
        if (!src) return false;
        return /^[0-9eE+\-*/().\sPI]+$/.test(src);
    }

    splitTopLevelStatements(sourceRaw) {
        const src = String(sourceRaw || "");
        const out = [];
        let start = 0;
        let depthParen = 0;
        let depthBracket = 0;
        let depthBrace = 0;
        let inSingle = false;
        let inDouble = false;
        let escaped = false;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (inSingle) {
                if (ch === "'") inSingle = false;
                continue;
            }
            if (inDouble) {
                if (ch === "\"") inDouble = false;
                continue;
            }
            if (ch === "'") {
                inSingle = true;
                continue;
            }
            if (ch === "\"") {
                inDouble = true;
                continue;
            }
            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
            else if (ch === "[") depthBracket++;
            else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
            else if (ch === "{") depthBrace++;
            else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
            const atTop = depthParen === 0 && depthBracket === 0 && depthBrace === 0;
            const isLineBreak = ch === "\n" || ch === "\r";
            if (atTop && (ch === ";" || isLineBreak)) {
                const segment = src.slice(start, i).trim().replace(/;+$/g, "").trim();
                if (segment) out.push(segment);
                if (ch === "\r" && src[i + 1] === "\n") i += 1;
                start = i + 1;
            }
        }
        const tail = src.slice(start).trim().replace(/;+$/g, "").trim();
        if (tail) out.push(tail);
        return out;
    }

    foldStaticActionStatements(sourceRaw, elapsedTick = 0) {
        const dynamicTokenRe = /\b(?:tick|tickCount|age|index|order|rel|shapeRel\d*|shapeOrder\d*|thisAt|particle|status)\b/;
        const statements = this.splitTopLevelStatements(sourceRaw);
        if (!statements.length) return [];
        const list = [];
        for (const stmt of statements) {
            const folded = this.tryFoldSingleExpressionStatement(stmt, dynamicTokenRe, elapsedTick);
            if (!folded) return null;
            list.push(folded);
        }
        return this.compactFoldedStaticActions(list);
    }

    tryFoldSimpleConditionalExpression(cleanSource, elapsedTick = 0) {
        const src = String(cleanSource || "").trim();
        if (!src.startsWith("if")) return null;
        const m = src.match(/^if\s*\(\s*([\s\S]+?)\s*\)\s*\{([\s\S]*?)\}\s*(?:else\s*\{([\s\S]*?)\}\s*)?$/);
        if (!m) return null;
        const condExpr = String(m[1] || "").trim();
        if (!condExpr) return null;
        // Keep this fold only for condition expressions independent from per-point context.
        const pointDependentCondRe = /\b(?:age|index|rel|shapeRel\d*|order|shapeOrder\d*|particle)\b/;
        if (pointDependentCondRe.test(condExpr)) return null;
        const thenActions = this.foldStaticActionStatements(m[2], elapsedTick);
        if (!thenActions || !thenActions.length) return null;
        let elseActions = [];
        const elseRaw = String(m[3] || "").trim();
        if (elseRaw) {
            elseActions = this.foldStaticActionStatements(elseRaw, elapsedTick);
            if (!elseActions) return null;
        }
        const fn = this.getPreviewConditionFn(condExpr);
        if (typeof fn !== "function") return null;
        return {
            type: "conditional_native",
            conditionExpr: condExpr,
            conditionFn: fn,
            pointIndependent: true,
            thenActions,
            elseActions
        };
    }

    isSameFoldedDirection(a, b, eps = 1e-7) {
        const aExpr = typeof a === "string" ? String(a || "").trim() : "";
        const bExpr = typeof b === "string" ? String(b || "").trim() : "";
        if (aExpr || bExpr) return !!aExpr && aExpr === bExpr;
        if (!a || !b) return false;
        const ax = num(a.x);
        const ay = num(a.y);
        const az = num(a.z);
        const bx = num(b.x);
        const by = num(b.y);
        const bz = num(b.z);
        return Math.abs(ax - bx) <= eps
            && Math.abs(ay - by) <= eps
            && Math.abs(az - bz) <= eps;
    }

    compactFoldedStaticActions(actionsRaw) {
        const src = Array.isArray(actionsRaw) ? actionsRaw : [];
        if (!src.length) return [];
        const out = [];
        for (const item of src) {
            if (!item || typeof item !== "object") continue;
            const cur = item;
            const last = out.length ? out[out.length - 1] : null;
            if (last && last.type === "rotateAsAxis" && cur.type === "rotateAsAxis") {
                last.anglePerTick = num(last.anglePerTick) + num(cur.anglePerTick);
                continue;
            }
            if (last && last.type === "rotateToPoint" && cur.type === "rotateToPoint" && this.isSameFoldedDirection(last.toExpr || last.to, cur.toExpr || cur.to)) {
                continue;
            }
            if (last && last.type === "rotateToWithAngle" && cur.type === "rotateToWithAngle" && this.isSameFoldedDirection(last.toExpr || last.to, cur.toExpr || cur.to)) {
                last.anglePerTick = num(last.anglePerTick) + num(cur.anglePerTick);
                continue;
            }
            if (last && last.type === "growth_add" && cur.type === "growth_add") {
                last.count = Math.max(1, int(last.count || 1)) + Math.max(1, int(cur.count || 1));
                continue;
            }
            out.push({
                ...cur,
                to: (cur.to && typeof cur.to === "object")
                    ? { x: num(cur.to.x), y: num(cur.to.y), z: num(cur.to.z) }
                    : cur.to,
                toExpr: String(cur.toExpr || "").trim()
            });
        }
        return out;
    }

    tryParseFoldableStaticVecExpr(exprRaw, elapsedTick = 0) {
        const src = String(exprRaw || "").trim();
        if (!src) return null;
        if (src === "Vec3.ZERO" || src === "Vec3d.ZERO") return U.v(0, 0, 0);
        if (src === "RelativeLocation.yAxis()") return U.v(0, 1, 0);
        const m = src.match(/^(?:Vec3|Vec3d|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)(?:\s*\.asRelative\(\))?$/i);
        if (!m) return null;
        const xExpr = String(m[1] || "").trim();
        const yExpr = String(m[2] || "").trim();
        const zExpr = String(m[3] || "").trim();
        if (!this.isFoldableStaticNumericExpr(xExpr) || !this.isFoldableStaticNumericExpr(yExpr) || !this.isFoldableStaticNumericExpr(zExpr)) {
            return null;
        }
        const x = num(this.evaluateNumericExpression(xExpr, {
            elapsedTick: num(elapsedTick),
            ageTick: num(elapsedTick),
            pointIndex: 0,
            includeVectors: false
        }));
        const y = num(this.evaluateNumericExpression(yExpr, {
            elapsedTick: num(elapsedTick),
            ageTick: num(elapsedTick),
            pointIndex: 0,
            includeVectors: false
        }));
        const z = num(this.evaluateNumericExpression(zExpr, {
            elapsedTick: num(elapsedTick),
            ageTick: num(elapsedTick),
            pointIndex: 0,
            includeVectors: false
        }));
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return U.v(x, y, z);
    }

    tryFoldSingleExpressionStatement(stmtRaw, dynamicTokenRe, elapsedTick = 0) {
        const stmt = String(stmtRaw || "").trim();
        if (!stmt) return null;
        const mAddSingle = stmt.match(/^addSingle\s*\(\s*([\s\S]*?)\s*\)$/);
        if (mAddSingle) {
            const argExpr = String(mAddSingle[1] || "").trim();
            if (argExpr && dynamicTokenRe.test(argExpr)) return null;
            return { type: "growth_add", count: 1 };
        }
        const mAddMultiple = stmt.match(/^addMultiple\s*\(\s*([\s\S]*?)\s*\)$/);
        if (mAddMultiple) {
            const countExpr = String(mAddMultiple[1] || "").trim();
            if (!countExpr) return { type: "growth_add", count: 1 };
            if (dynamicTokenRe.test(countExpr) || !this.isFoldableStaticNumericExpr(countExpr)) return null;
            const count = Math.max(1, int(this.evaluateNumericExpression(countExpr, {
                elapsedTick: num(elapsedTick),
                ageTick: num(elapsedTick),
                pointIndex: 0,
                includeVectors: false
            })));
            return { type: "growth_add", count };
        }
        const mRotateAsAxis = stmt.match(/^rotateAsAxis\s*\(\s*([\s\S]+?)\s*\)$/);
        if (mRotateAsAxis) {
            const angleExpr = String(mRotateAsAxis[1] || "").trim();
            if (!angleExpr || dynamicTokenRe.test(angleExpr) || !this.isFoldableStaticNumericExpr(angleExpr)) return null;
            const anglePerTick = num(this.evaluateNumericExpression(angleExpr, {
                elapsedTick: num(elapsedTick),
                ageTick: num(elapsedTick),
                pointIndex: 0,
                includeVectors: false
            }));
            if (!Number.isFinite(anglePerTick)) return null;
            return { type: "rotateAsAxis", anglePerTick };
        }
        const mRotateToPoint = stmt.match(/^rotateToPoint\s*\(\s*([\s\S]+?)\s*\)$/);
        if (mRotateToPoint) {
            const toExpr = String(mRotateToPoint[1] || "").trim();
            if (!toExpr || dynamicTokenRe.test(toExpr)) return null;
            const toVec = this.tryParseFoldableStaticVecExpr(toExpr, elapsedTick);
            if (toVec) return { type: "rotateToPoint", to: this.parseJsVec(toVec) };
            return { type: "rotateToPoint", toExpr };
        }
        const mRotateToWithAngle = stmt.match(/^rotateToWithAngle\s*\(\s*([\s\S]+)\s*\)$/);
        if (mRotateToWithAngle) {
            const args = this.splitTopLevelArgs(mRotateToWithAngle[1]);
            if (args.length !== 2) return null;
            const toExpr = String(args[0] || "").trim();
            const angleExpr = String(args[1] || "").trim();
            if (!toExpr || !angleExpr || dynamicTokenRe.test(toExpr) || dynamicTokenRe.test(angleExpr)) return null;
            if (!this.isFoldableStaticNumericExpr(angleExpr)) return null;
            const anglePerTick = num(this.evaluateNumericExpression(angleExpr, {
                elapsedTick: num(elapsedTick),
                ageTick: num(elapsedTick),
                pointIndex: 0,
                includeVectors: false
            }));
            if (!Number.isFinite(anglePerTick)) return null;
            const toVec = this.tryParseFoldableStaticVecExpr(toExpr, elapsedTick);
            if (toVec) return { type: "rotateToWithAngle", to: this.parseJsVec(toVec), anglePerTick };
            return { type: "rotateToWithAngle", toExpr, anglePerTick };
        }
        return null;
    }

    tryFoldSimpleExpressionAction(srcRaw, elapsedTick = 0, opts = {}) {
        const src = String(transpileKotlinThisQualifierToJs(srcRaw || "")).trim();
        if (!src) return null;
        const clean = src.replace(/^\s*;+|;+\s*$/g, "").trim();
        if (!clean) return null;
        const cache = (this.previewFoldSimpleActionCache instanceof Map)
            ? this.previewFoldSimpleActionCache
            : (this.previewFoldSimpleActionCache = new Map());
        if (cache.has(clean)) return cache.get(clean);
        const conditional = this.tryFoldSimpleConditionalExpression(clean, elapsedTick, opts);
        if (conditional) {
            cache.set(clean, conditional);
            return conditional;
        }
        const dynamicTokenRe = /\b(?:tick|tickCount|age|index|order|rel|shapeRel\d*|shapeOrder\d*|thisAt|particle|status)\b/;
        const statements = this.splitTopLevelStatements(clean);
        if (statements.length > 1) {
            const list = [];
            for (const stmt of statements) {
                const folded = this.tryFoldSingleExpressionStatement(stmt, dynamicTokenRe, elapsedTick);
                if (!folded) {
                    cache.set(clean, null);
                    return null;
                }
                list.push(folded);
            }
            const compacted = this.compactFoldedStaticActions(list);
            if (!compacted.length) {
                cache.set(clean, null);
                return null;
            }
            const folded = compacted.length === 1 ? compacted[0] : { type: "folded_sequence", actions: compacted };
            cache.set(clean, folded);
            return folded;
        }
        const single = this.tryFoldSingleExpressionStatement(clean, dynamicTokenRe, elapsedTick);
        cache.set(clean, single || null);
        return single || null;
    }

    applyRuntimeActionsToPoint(point, runtimeActions, elapsedTick, ageTick, pointIndex, startAxis = null, opts = {}) {
        const list = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!list.length) return point;
        const skipExpression = !!opts.skipExpression;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const shapeScope = (opts.shapeScope && typeof opts.shapeScope === "object") ? opts.shapeScope : null;
        if (skipExpression && (list.__allExpression === true || list.every((a) => a?.type === "expression"))) return point;
        let p = U.clone(point);
        let axis = (startAxis && typeof startAxis === "object" && Number.isFinite(startAxis.x) && Number.isFinite(startAxis.y) && Number.isFinite(startAxis.z))
            ? startAxis
            : this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        const accum = Math.max(0, num(elapsedTick));
        const resolveNativeActionDirection = (nativeAction) => {
            if (!nativeAction || typeof nativeAction !== "object") return null;
            const direct = (nativeAction.to && typeof nativeAction.to === "object"
                && Number.isFinite(nativeAction.to.x)
                && Number.isFinite(nativeAction.to.y)
                && Number.isFinite(nativeAction.to.z))
                ? nativeAction.to
                : null;
            if (direct) return this.parseJsVec(direct);
            const directExpr = String(nativeAction.to || "").trim();
            if (directExpr) {
                const parsed = this.parseJsVec(directExpr);
                if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.z)) return parsed;
            }
            const expr = String(nativeAction.toExpr || "").trim();
            if (!expr) return null;
            const stamp = `${int(Math.round(num(elapsedTick) * 1000))}|${int(Math.round(num(ageTick) * 1000))}`;
            if (nativeAction.__cpbDirCacheStamp === stamp
                && nativeAction.__cpbDirCache
                && Number.isFinite(Number(nativeAction.__cpbDirCache.x))
                && Number.isFinite(Number(nativeAction.__cpbDirCache.y))
                && Number.isFinite(Number(nativeAction.__cpbDirCache.z))) {
                return nativeAction.__cpbDirCache;
            }
            const vec = this.parseVecLikeValueWithRuntime(expr, runtimeVars, {
                elapsedTick,
                ageTick,
                pointIndex,
                thisAtVars: runtimeVars
            });
            if (!vec || !Number.isFinite(Number(vec.x)) || !Number.isFinite(Number(vec.y)) || !Number.isFinite(Number(vec.z))) {
                return null;
            }
            const parsed = this.parseJsVec(vec);
            nativeAction.__cpbDirCacheStamp = stamp;
            nativeAction.__cpbDirCache = { x: num(parsed.x), y: num(parsed.y), z: num(parsed.z) };
            return nativeAction.__cpbDirCache;
        };
        const applyNativeAction = (nativeAction) => {
            if (!nativeAction || typeof nativeAction !== "object") return false;
            if (nativeAction.type === "growth_add") {
                return true;
            }
            if (nativeAction.type === "rotateToPoint") {
                const dir = resolveNativeActionDirection(nativeAction);
                if (!dir) return true;
                p = this.rotatePointToDirection(p, dir, axis);
                axis = U.clone(dir);
                return true;
            }
            if (nativeAction.type === "rotateAsAxis") {
                const perTick = num(nativeAction.anglePerTick ?? nativeAction.angle ?? 0);
                const angle = ((perTick * accum) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                p = this.rotateAroundUnitAxis(p, axis, angle);
                return true;
            }
            if (nativeAction.type === "rotateToWithAngle") {
                const dir = resolveNativeActionDirection(nativeAction);
                if (!dir) return true;
                p = this.rotatePointToDirection(p, dir, axis);
                const perTick = num(nativeAction.anglePerTick ?? nativeAction.angle ?? 0);
                const angle = ((perTick * accum) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                p = this.rotateAroundUnitAxis(p, dir, angle);
                axis = U.clone(dir);
                return true;
            }
            return false;
        };
        const evaluateConditionalNative = (condAction) => {
            if (!condAction || condAction.type !== "conditional_native") return false;
            const fn = (typeof condAction.conditionFn === "function")
                ? condAction.conditionFn
                : this.getPreviewConditionFn(condAction.conditionExpr);
            if (typeof fn !== "function") return false;
            if (condAction.pointIndependent === true && runtimeVars && typeof runtimeVars === "object") {
                const cacheKey = String(condAction.compileKey || condAction.conditionExpr || "");
                if (cacheKey) {
                    let condCache = runtimeVars.__cpbCondCache;
                    if (!condCache || typeof condCache !== "object") {
                        condCache = {};
                        runtimeVars.__cpbCondCache = condCache;
                    }
                    const stamp = int(num(elapsedTick) * 1000);
                    const hit = condCache[cacheKey];
                    if (hit && int(hit.stamp) === stamp) return !!hit.value;
                    const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
                    vars.thisAt = runtimeVars;
                    let value = false;
                    try {
                        value = !!fn(vars);
                    } catch {
                        value = false;
                    }
                    condCache[cacheKey] = { stamp, value };
                    return value;
                }
            }
            const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
            vars.thisAt = runtimeVars || {};
            if (shapeScope) {
                if (shapeScope.rel && Number.isFinite(shapeScope.rel.x) && Number.isFinite(shapeScope.rel.y) && Number.isFinite(shapeScope.rel.z)) {
                    vars.rel = shapeScope.rel;
                }
                if (Number.isFinite(Number(shapeScope.order))) vars.order = int(shapeScope.order);
                const rels = Array.isArray(shapeScope.shapeRels) ? shapeScope.shapeRels : [];
                const orders = Array.isArray(shapeScope.shapeOrders) ? shapeScope.shapeOrders : [];
                for (let i = 0; i < rels.length; i++) {
                    const rv = rels[i];
                    if (rv && Number.isFinite(rv.x) && Number.isFinite(rv.y) && Number.isFinite(rv.z)) vars[`shapeRel${i}`] = rv;
                    if (Number.isFinite(Number(orders[i]))) vars[`shapeOrder${i}`] = int(orders[i]);
                }
            }
            try {
                return !!fn(vars);
            } catch {
                return false;
            }
        };
        for (const a of list) {
            if (applyNativeAction(a)) continue;
            if (a.type === "conditional_native") {
                const pass = evaluateConditionalNative(a);
                const branch = pass
                    ? (Array.isArray(a.thenActions) ? a.thenActions : [])
                    : (Array.isArray(a.elseActions) ? a.elseActions : []);
                for (const ba of branch) {
                    applyNativeAction(ba);
                }
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const res = this.applyExpressionActionToPoint(a, p, elapsedTick, ageTick, pointIndex, axis, {
                    runtimeVars,
                    persistExpressionVars,
                    shapeScope
                });
                p = res.point;
                axis = res.axis;
            }
        }
        return p;
    }

    resolveActionAnglePerTick(action, elapsedTick = 0, ageTick = 0, pointIndex = 0) {
        if (!action) return 0;
        if (action.angleMode === "expr") {
            return num(this.evaluateNumericExpression(action.angleExpr || "0", { elapsedTick, ageTick, pointIndex }));
        }
        return U.angleToRad(num(action.angleValue), normalizeAngleUnit(action.angleUnit));
    }

    resolveCompositionAxisDirection() {
        const expr = String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()");
        return this.resolveRelativeDirection(expr);
    }

    resolveRelativeDirection(exprRaw) {
        return this.exprRuntime.resolveRelativeDirection(exprRaw);
    }

    parseVecLikeValue(rawExpr) {
        return this.exprRuntime.parseVecLikeValue(rawExpr);
    }

    buildPreviewRuntimeGlobals(elapsedTick = 0, ageTick = 0, pointIndex = 0) {
        const out = {};
        const assign = (nameRaw, value) => {
            const name = String(nameRaw || "").trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return;
            out[name] = value;
        };
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            const type = String(g?.type || "").trim();
            const expr = String(g?.value || "");
            if (type === "Vec3" || type === "RelativeLocation" || type === "Vector3f") {
                assign(name, this.parseVecLikeValue(expr));
                continue;
            }
            if (type === "Boolean") {
                assign(name, /^true$/i.test(expr.trim()));
                continue;
            }
            if (type === "Int" || type === "Long" || type === "Float" || type === "Double") {
                assign(name, this.evaluateNumericExpression(expr, { elapsedTick, ageTick, pointIndex, includeVectors: false }));
                continue;
            }
            assign(name, expr);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            const type = String(c?.type || "").trim();
            const expr = String(c?.value || "0");
            if (type === "Boolean") {
                assign(name, /^true$/i.test(expr.trim()));
            } else {
                assign(name, this.evaluateNumericExpression(expr, { elapsedTick, ageTick, pointIndex, includeVectors: false }));
            }
        }
        let rawStatus = (out.status && typeof out.status === "object") ? out.status : {};
        rawStatus = ensureStatusHelperMethods(rawStatus);
        if (rawStatus.displayStatus !== 2 && Object.prototype.hasOwnProperty.call(rawStatus, "__dissolveStartTick")) {
            delete rawStatus.__dissolveStartTick;
        }
        out.status = rawStatus;
        return out;
    }

    ensurePreviewRuntimeStatus(runtimeVars, elapsedTick = 0) {
        if (!runtimeVars || typeof runtimeVars !== "object") {
            return ensureStatusHelperMethods({ displayStatus: 1 });
        }
        let rawStatus = (runtimeVars.status && typeof runtimeVars.status === "object")
            ? runtimeVars.status
            : {};
        rawStatus = ensureStatusHelperMethods(rawStatus);
        if (rawStatus.displayStatus === 2) {
            if (!Number.isFinite(Number(rawStatus.__dissolveStartTick))) {
                rawStatus.__dissolveStartTick = num(elapsedTick);
            }
        } else if (Object.prototype.hasOwnProperty.call(rawStatus, "__dissolveStartTick")) {
            delete rawStatus.__dissolveStartTick;
        }
        runtimeVars.status = rawStatus;
        return rawStatus;
    }

    syncPreviewStatusWithCycle(runtimeVars, cycleCfg, cycleAge = 0, elapsedTick = 0) {
        const status = this.ensurePreviewRuntimeStatus(runtimeVars, elapsedTick);
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const autoStatus = num(cycleAge) >= num(cycle.play || 0) ? 2 : 1;
        if (!status.__manualDisplayStatus) {
            status.displayStatus = autoStatus;
        }
        status.displayStatus = int(status.displayStatus || 1) === 2 ? 2 : 1;
        if (status.displayStatus === 2) {
            if (!Number.isFinite(Number(status.__dissolveStartTick))) {
                status.__dissolveStartTick = num(elapsedTick);
            }
        } else if (Object.prototype.hasOwnProperty.call(status, "__dissolveStartTick")) {
            delete status.__dissolveStartTick;
        }
        runtimeVars.status = status;
        return status;
    }

    resolvePreviewAgeWithStatus(baseAge, elapsedTick, cycleCfg, runtimeVars) {
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const status = this.ensurePreviewRuntimeStatus(runtimeVars, elapsedTick);
        if (int(status.displayStatus || 1) !== 2) return num(baseAge);
        const startTick = Number.isFinite(Number(status.__dissolveStartTick))
            ? num(status.__dissolveStartTick)
            : num(elapsedTick);
        const dissolveAge = Math.max(0, num(elapsedTick) - startTick);
        return cycle.play + dissolveAge;
    }

    primeRuntimeExpressionScope(scopeVars = null, elapsedTick = 0, ageTick = 0, pointIndex = 0, runtimeVars = null, includeVectors = true) {
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: includeVectors === true });
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : null;
        if (!localVars) return baseVars;
        const baseProto = Object.getPrototypeOf(baseVars) || null;
        if (baseProto && Object.getPrototypeOf(localVars) !== baseProto) {
            try {
                Object.setPrototypeOf(localVars, baseProto);
            } catch {
            }
        }
        const vars = (scopeVars && typeof scopeVars === "object") ? scopeVars : Object.create(localVars);
        if (Object.getPrototypeOf(vars) !== localVars) {
            try {
                Object.setPrototypeOf(vars, localVars);
            } catch {
            }
        }
        const defineLocal = (key, value) => {
            try {
                vars[key] = value;
            } catch {
                try {
                    Object.defineProperty(vars, key, {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value
                    });
                } catch {
                }
            }
        };
        defineLocal("age", num(baseVars.age));
        defineLocal("tick", num(baseVars.tick));
        defineLocal("tickCount", num(baseVars.tickCount ?? baseVars.tick));
        defineLocal("index", int(baseVars.index));
        return vars;
    }

    createRuntimeExpressionScope(elapsedTick = 0, ageTick = 0, pointIndex = 0, runtimeVars = null, includeVectors = true) {
        return this.primeRuntimeExpressionScope(null, elapsedTick, ageTick, pointIndex, runtimeVars, includeVectors);
    }

    evaluateExpressionWithRuntime(exprRaw, runtimeVars = null, opts = {}) {
        const srcRaw = String(exprRaw || "").trim();
        if (!srcRaw) return null;
        const src = transpileKotlinThisQualifierToJs(srcRaw).replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : {};
        const thisAt = (opts.thisAtVars && typeof opts.thisAtVars === "object") ? opts.thisAtVars : localVars;
        const vars = (opts.runtimeScope && typeof opts.runtimeScope === "object")
            ? this.primeRuntimeExpressionScope(opts.runtimeScope, elapsedTick, ageTick, pointIndex, localVars, true)
            : this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, localVars, true);
        vars.thisAt = thisAt;
        let fn = this.previewNumericFnCache.get(src);
        if (fn === undefined) {
            try {
                fn = new Function("vars", "thisAt", `with(vars){ return (${src}\n); }`);
            } catch {
                fn = null;
            }
            if (this.previewNumericFnCache.size > 2048) this.previewNumericFnCache.clear();
            this.previewNumericFnCache.set(src, fn);
        }
        if (typeof fn !== "function") return null;
        try {
            return fn(vars, vars.thisAt);
        } catch {
            return null;
        }
    }

    evaluateNumericExpressionWithRuntime(exprRaw, runtimeVars = null, opts = {}) {
        const out = this.evaluateExpressionWithRuntime(exprRaw, runtimeVars, opts);
        return Number.isFinite(Number(out)) ? Number(out) : 0;
    }

    parseVecLikeValueWithRuntime(rawExpr, runtimeVars = null, opts = {}) {
        const srcRaw = String(rawExpr || "").trim();
        if (!srcRaw) return U.v(0, 0, 0);
        const src = transpileKotlinThisQualifierToJs(srcRaw).replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
        if (src === "Vec3.ZERO" || src === "Vec3d.ZERO") return U.v(0, 0, 0);
        if (src === "RelativeLocation.yAxis()") return U.v(0, 1, 0);
        if (src.endsWith(".asRelative()")) {
            return this.parseVecLikeValueWithRuntime(src.slice(0, -".asRelative()".length), runtimeVars, opts);
        }
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : null;
        const thisAtVars = (opts.thisAtVars && typeof opts.thisAtVars === "object")
            ? opts.thisAtVars
            : localVars;
        const runtimeScope = (opts.runtimeScope && typeof opts.runtimeScope === "object")
            ? this.primeRuntimeExpressionScope(opts.runtimeScope, elapsedTick, ageTick, pointIndex, localVars, true)
            : null;
        const resolveRuntimeVec = (scope, key) => {
            if (!scope || typeof scope !== "object" || !key) return null;
            let value;
            try {
                value = scope[key];
            } catch {
                value = undefined;
            }
            if (Array.isArray(value) && value.length >= 3) {
                const x = Number(value[0]);
                const y = Number(value[1]);
                const z = Number(value[2]);
                if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                    return U.v(x, y, z);
                }
            }
            if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
                return U.v(Number(value.x), Number(value.y), Number(value.z));
            }
            if (value && Number.isFinite(Number(value.r)) && Number.isFinite(Number(value.g)) && Number.isFinite(Number(value.b))) {
                return U.v(Number(value.r), Number(value.g), Number(value.b));
            }
            return null;
        };
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(src)) {
            const vec = resolveRuntimeVec(localVars, src);
            if (vec) return vec;
        }
        const thisAtMatch = src.match(/^thisAt\.([A-Za-z_$][A-Za-z0-9_$]*)$/);
        if (thisAtMatch) {
            const vec = resolveRuntimeVec(thisAtVars, thisAtMatch[1]);
            if (vec) return vec;
        }
        const m = src.match(/(?:Vec3|Vec3d|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (m) {
            const evalOpts = { elapsedTick, ageTick, pointIndex, thisAtVars, runtimeScope };
            return U.v(
                this.evaluateNumericExpressionWithRuntime(m[1], localVars, evalOpts),
                this.evaluateNumericExpressionWithRuntime(m[2], localVars, evalOpts),
                this.evaluateNumericExpressionWithRuntime(m[3], localVars, evalOpts)
            );
        }
        return this.parseVecLikeValue(srcRaw);
    }

    applyExpressionGlobalsOnce(runtimeActions, elapsedTick, ageTick, runtimeVars, startAxis = null) {
        const actions = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!actions.length || !runtimeVars || typeof runtimeVars !== "object") return;
        let axis = this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        for (const action of actions) {
            if (action?.type !== "expression") continue;
            const res = this.applyExpressionActionToPoint(
                action,
                U.v(0, 0, 0),
                elapsedTick,
                ageTick,
                0,
                axis,
                {
                    runtimeVars,
                    persistExpressionVars: true,
                    // Global pass is used to update state variables only; do not advance
                    // geometry rotation accumulators here, or replay can stutter/jitter.
                    accumulateRotation: false
                }
            );
            axis = res?.axis || axis;
        }
    }

    rotatePointToDirection(point, toDir, fromAxis = null) {
        const axis = this.parseJsVec(
            (fromAxis && U.len(fromAxis) > 1e-6)
                ? fromAxis
                : this.resolveCompositionAxisDirection()
        );
        const dir = this.parseJsVec(toDir);
        const dot = Math.max(-1, Math.min(1,
            num(axis.x) * num(dir.x) + num(axis.y) * num(dir.y) + num(axis.z) * num(dir.z)
        ));
        if (dot >= 0.999999) return point;

        let rotationAxis = U.cross(axis, dir);
        if (U.len(rotationAxis) <= 1e-9) {
            const reference = Math.abs(num(axis.x)) < 0.9 ? U.v(1, 0, 0) : U.v(0, 1, 0);
            rotationAxis = U.cross(axis, reference);
        }
        return this.rotateAroundUnitAxis(point, U.norm(rotationAxis), Math.acos(dot));
    }

    rotateAroundUnitAxis(point, axisUnit, angleRad) {
        const p = point || U.v(0, 0, 0);
        const a = axisUnit || U.v(0, 1, 0);
        const x = num(p.x);
        const y = num(p.y);
        const z = num(p.z);
        const u = num(a.x);
        const v = num(a.y);
        const w = num(a.z);
        const cosA = Math.cos(num(angleRad));
        const sinA = Math.sin(num(angleRad));
        const dot = u * x + v * y + w * z;
        return {
            x: u * dot * (1 - cosA) + x * cosA + (-w * y + v * z) * sinA,
            y: v * dot * (1 - cosA) + y * cosA + (w * x - u * z) * sinA,
            z: w * dot * (1 - cosA) + z * cosA + (-v * x + u * y) * sinA
        };
    }
    applyExpressionActionToPoint(action, point, elapsedTick, ageTick, pointIndex, axisInput = null, opts = {}) {
        const srcRaw = String(action?.expressionRaw || action?.expression || "").trim();
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        const startAxis = this.parseJsVec(axisInput || this.resolveCompositionAxisDirection());
        if (!src) return { point, axis: startAxis };
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const accumulateRotation = opts.accumulateRotation !== false;
        const thisAt = runtimeVars || {};
        const actionKeyBase = String(action?.compileKey || src || "").trim();
        const TAU = Math.PI * 2;
        const MAX_ACCUM_DT = 1.2;
        const toTau = (rad) => ((num(rad) % TAU) + TAU) % TAU;
        const resolveActionAccumAngle = (slot = "rot", anglePerTick = 0) => {
            const nowTick = Math.max(0, num(elapsedTick));
            const speed = num(anglePerTick);
            if (!accumulateRotation) return speed * nowTick;
            if (!runtimeVars || !actionKeyBase) return speed * nowTick;
            const key = `${actionKeyBase}|${slot}`;
            const accKey = `__cpbRotAccum__${key}`;
            const lastKey = `__cpbRotLast__${key}`;
            let accum = Number(runtimeVars[accKey]);
            let lastTick = Number(runtimeVars[lastKey]);
            if (!Number.isFinite(accum)) accum = 0;
            if (!Number.isFinite(lastTick)) {
                lastTick = nowTick;
            } else {
                let dt = nowTick - lastTick;
                if (dt < 0) {
                    dt = 0;
                    accum = 0;
                }
                if (dt > 0) {
                    accum += speed * Math.min(dt, MAX_ACCUM_DT);
                }
            }
            runtimeVars[accKey] = accum;
            runtimeVars[lastKey] = nowTick;
            return accum;
        };
        const api = {
            point: U.clone(point),
            axis: U.clone(startAxis),
            rotateToPoint: (to) => {
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                api.axis = U.clone(dir);
            },
            rotateAsAxis: (angle) => {
                const accumAngle = resolveActionAccumAngle("rotateAsAxis", angle);
                const rot = toTau(accumAngle);
                api.point = this.rotateAroundUnitAxis(api.point, api.axis, rot);
            },
            rotateToWithAngle: (to, angle) => {
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                const accumAngle = resolveActionAccumAngle("rotateToWithAngle", angle);
                const rot = toTau(accumAngle);
                api.point = this.rotateAroundUnitAxis(api.point, dir, rot);
                api.axis = U.clone(dir);
                vars.axis = U.clone(dir);
            },
            addSingle: () => {},
            addMultiple: () => {}
        };
        const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
        const shapeScope = (opts.shapeScope && typeof opts.shapeScope === "object") ? opts.shapeScope : null;
        const relPoint = (shapeScope && shapeScope.rel && typeof shapeScope.rel === "object"
            && Number.isFinite(Number(shapeScope.rel.x))
            && Number.isFinite(Number(shapeScope.rel.y))
            && Number.isFinite(Number(shapeScope.rel.z)))
            ? shapeScope.rel
            : U.v(num(point?.x), num(point?.y), num(point?.z));
        const orderValue = (shapeScope && Number.isFinite(Number(shapeScope.order)))
            ? int(shapeScope.order)
            : int(pointIndex || 0);
        vars.rel = relPoint;
        vars.order = orderValue;
        if (shapeScope) {
            const rels = Array.isArray(shapeScope.shapeRels) ? shapeScope.shapeRels : [];
            const orders = Array.isArray(shapeScope.shapeOrders) ? shapeScope.shapeOrders : [];
            for (let i = 0; i < rels.length; i++) {
                const rv = rels[i];
                if (rv && Number.isFinite(rv.x) && Number.isFinite(rv.y) && Number.isFinite(rv.z)) {
                    vars[`shapeRel${i}`] = rv;
                }
                if (Number.isFinite(Number(orders[i]))) {
                    vars[`shapeOrder${i}`] = int(orders[i]);
                }
            }
        }
        const projectScaleCfg = normalizeScaleHelperConfig(this.state?.projectScale, { type: "none" });
        const projectScaleManual = projectScaleCfg.type !== "none"
            && String(projectScaleCfg.runMode || "auto") === "manual";
        const projectAlphaCfg = normalizeAlphaHelperConfig(this.state?.projectAlpha, { type: "none" });
        const projectAlphaManual = projectAlphaCfg.type !== "none"
            && String(projectAlphaCfg.runMode || "auto") === "manual";
        const applyProjectScale = (reversed = false) => {
            if (!projectScaleManual) return;
            const tickMax = Math.max(1, int(projectScaleCfg.tick || 1));
            const nowTick = persistExpressionVars
                ? Math.max(0, num(elapsedTick))
                : (Number.isFinite(Number(this.previewManualProjectScaleTick))
                    ? Math.max(0, num(this.previewManualProjectScaleTick))
                    : Math.max(0, num(elapsedTick)));
            const baseFactor = this.evalScaleCurve(projectScaleCfg, 0, tickMax);
            let phaseTick = 0;
            if (runtimeVars && actionKeyBase) {
                const phaseKey = `__cpbProjectScalePhase__${actionKeyBase}`;
                const lastKey = `__cpbProjectScaleLast__${actionKeyBase}`;
                let phaseValue = Number(runtimeVars[phaseKey]);
                let lastValue = Number(runtimeVars[lastKey]);
                if (!Number.isFinite(phaseValue)) phaseValue = 0;
                if (!Number.isFinite(lastValue)) {
                    lastValue = nowTick;
                } else {
                    let dt = nowTick - lastValue;
                    if (dt < 0) {
                        dt = 0;
                        phaseValue = 0;
                    }
                    if (dt > 0) {
                        const clampedDt = Math.min(dt, MAX_ACCUM_DT);
                        phaseValue += reversed ? -clampedDt : clampedDt;
                    }
                }
                phaseTick = clamp(phaseValue, 0, tickMax);
                runtimeVars[phaseKey] = phaseTick;
                runtimeVars[lastKey] = nowTick;
            }
            const factor = this.evalScaleCurve(projectScaleCfg, phaseTick, tickMax);
            const applyFactor = Math.abs(baseFactor) > 1e-9 ? (factor / baseFactor) : factor;
            api.point = U.v(
                num(api.point?.x) * applyFactor,
                num(api.point?.y) * applyFactor,
                num(api.point?.z) * applyFactor
            );
        };
        const scaleHelperApi = {
            doScale: () => {
                applyProjectScale(false);
            },
            doScaleReversed: () => {
                applyProjectScale(true);
            }
        };
        const alphaHelperState = (!shapeScope && projectAlphaManual && !persistExpressionVars)
            ? this.cloneProjectAlphaPreviewState(runtimeVars, projectAlphaCfg)
            : null;
        const alphaHelperApi = (!shapeScope && projectAlphaManual)
            ? this.createProjectAlphaHelperApi(runtimeVars, projectAlphaCfg, {
                mutating: persistExpressionVars,
                localState: alphaHelperState
            })
            : this.createProjectAlphaHelperApi(null, { type: "none" }, { mutating: false });
        vars.rotateToPoint = api.rotateToPoint;
        vars.scaleHelper = scaleHelperApi;
        vars.alphaHelper = alphaHelperApi;
        vars.thisAt = thisAt;
        vars.axis = U.clone(api.axis);
        try {
            const fn = (typeof action?.fn === "function") ? action.fn : null;
            if (!fn) return { point, axis: startAxis };
            fn(
                vars,
                api.point,
                api.rotateToPoint,
                api.rotateAsAxis,
                api.rotateToWithAngle,
                api.addSingle,
                api.addMultiple,
                thisAt
            );
            if (Object.prototype.hasOwnProperty.call(vars, "axis")) {
                const axisValue = vars.axis;
                let parsedAxis = null;
                if (axisValue && typeof axisValue === "object"
                    && Number.isFinite(Number(axisValue.x))
                    && Number.isFinite(Number(axisValue.y))
                    && Number.isFinite(Number(axisValue.z))) {
                    parsedAxis = this.parseJsVec(axisValue);
                } else if (typeof axisValue === "string") {
                    const vec = this.parseVecLikeValueWithRuntime(axisValue, runtimeVars || vars, {
                        elapsedTick,
                        ageTick,
                        pointIndex,
                        thisAtVars: thisAt
                    });
                    if (vec && Number.isFinite(Number(vec.x)) && Number.isFinite(Number(vec.y)) && Number.isFinite(Number(vec.z))) {
                        parsedAxis = this.parseJsVec(vec);
                    }
                }
                if (parsedAxis && U.len(parsedAxis) > 1e-9) {
                    api.axis = U.clone(parsedAxis);
                    vars.axis = U.clone(parsedAxis);
                } else {
                    vars.axis = U.clone(api.axis);
                }
            }
            if (runtimeVars && persistExpressionVars) {
                for (const key of Object.keys(runtimeVars)) {
                    if (Object.prototype.hasOwnProperty.call(vars, key)) {
                        runtimeVars[key] = vars[key];
                    }
                }
            }
            return { point: api.point, axis: api.axis };
        } catch {
            return { point, axis: startAxis };
        }
    }

    parseJsVec(v) {
        if (!v) return U.v(0, 1, 0);
        if (typeof v === "object" && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
            const x = num(v.x);
            const y = num(v.y);
            const z = num(v.z);
            const lenSq = x * x + y * y + z * z;
            if (lenSq <= 1e-12) return U.v(0, 1, 0);
            if (Math.abs(lenSq - 1) <= 1e-6) return v;
            const inv = 1 / Math.sqrt(lenSq);
            return U.v(x * inv, y * inv, z * inv);
        }
        return this.resolveRelativeDirection(String(v));
    }

    evaluateNumericExpression(exprRaw, opts = {}) {
        return this.exprRuntime.evaluateNumericExpression(exprRaw, opts);
    }

    getExpressionVars(elapsedTick = 0, ageTick = 0, pointIndex = 0, opts = {}) {
        return this.exprRuntime.getExpressionVars(elapsedTick, ageTick, pointIndex, opts);
    }
}

for (const key of Object.getOwnPropertyNames(PreviewRuntimeMixin.prototype)) {
    if (key === "constructor") continue;
    CompositionBuilderApp.prototype[key] = PreviewRuntimeMixin.prototype[key];
}
}
