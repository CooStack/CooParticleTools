import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createKindDefs } from "../../points_builder/js/kinds.js?v=20260820_2";
import { createBuilderTools } from "../../points_builder/js/builder.js";
import {
    COMPOSITION_CARD_SECTION_KEYS as CARD_SECTION_KEYS,
    COMPOSITION_CONTROLLER_ACTION_TYPES as CONTROLLER_ACTION_TYPES,
    COMPOSITION_DISPLAY_ACTION_TYPES as DISPLAY_ACTION_TYPES,
    COMPOSITION_GLOBAL_VALUE_TYPES as GLOBAL_VAR_TYPES,
    DEFAULT_COMPOSITION_EFFECT_CLASS as DEFAULT_EFFECT_CLASS,
    DEFAULT_COMPOSITION_HOTKEYS as DEFAULT_HOTKEYS,
    cloneCompositionValue as deepClone,
    createCompositionCard as createDefaultCard,
    createCompositionCardSectionCollapse as createDefaultCardSectionCollapse,
    createCompositionId as uid,
    createCompositionProject as createDefaultState,
    createEmbeddedPointsBuilderState as createDefaultBuilderState,
    normalizeCompositionAnimate as normalizeAnimate,
    normalizeCompositionCard as normalizeCard,
    normalizeCompositionCardSectionCollapse as normalizeCardSectionCollapse,
    normalizeCompositionControllerAction as normalizeControllerAction,
    getCompositionControllerVariableNameError,
    normalizeCompositionControllerVariableName,
    COMPOSITION_LAMBDA_RESERVED_NAMES,
    normalizeCompositionDisplayAction as normalizeDisplayAction,
    normalizeCompositionGlobalConstant as normalizeGlobalConst,
    normalizeCompositionGlobalVariable as normalizeGlobalVar,
    normalizeCompositionNestedLevel as normalizeShapeNestedLevel,
    normalizeCompositionPackageName as normalizeKotlinPackageName,
    normalizeCompositionProject as normalizeStateShape,
    normalizeCompositionShapeNode as normalizeShapeTreeNode,
    normalizeEmbeddedPointsBuilderState as normalizeBuilderState,
    isCompositionLeafParticleType,
    isCompositionShapeType,
    isCompositionCardUsingCParticle,
    compositionShapeNodeHasParticleLeaf,
    findCompositionNestedShapePaths
} from "./model.js?v=20260826_8";
import {
    applyCompositionPreferences,
    extractCompositionPreferences,
    extractCompositionProjectState,
    loadCompositionStateFromStorage,
    saveCompositionPreferencesToStorage,
    saveCompositionStateToStorage
} from "./preferences.js?v=20260729_3";
import { loadLatestAutoStatePayload } from "../../points_builder/js/io.js?v=20260826_1";
import {
    getCompositionKotlinTarget,
    normalizeCompositionMapping
} from "./kotlin_mapping.js?v=20260720_1";
import { createExpressionRuntime } from "./expression_runtime.js?v=20260729_3";
import { APP_THEME_KEY, watchAppTheme, writeAppTheme } from "../../shared/js/app-theme.js?v=20260824_1";
import { createAdaptiveGrid } from "../../shared/js/adaptive-grid.js?v=20260825_14";
import { InlineCodeEditor, mergeCompletionGroups } from "./code_editor.js?v=20260725_1";
import {
    normalizeAlphaHelperConfig,
    normalizeCParticleAlphaConfig,
    ALPHA_HELPER_TYPES,
    ALPHA_HELPER_RUN_MODES
} from "./alpha_helper_utils.js?v=20260729_1";
import {
    isVectorLiteralType,
    normalizeVectorCtor,
    formatVectorLiteral,
    parseCtorInLiteral,
    vectorToHex01,
    hexToVector01,
    formatNumberCompact
} from "./vector_value_utils.js?v=20260720_1";
import {
    normalizeScaleHelperConfig,
    SCALE_HELPER_TYPES,
    SCALE_HELPER_RUN_MODES
} from "./scale_helper_utils.js";
import {
    ANGLE_OFFSET_EASE_OPTIONS,
    normalizeAngleUnit,
    normalizeAngleOffsetEaseName,
    normalizeAngleOffsetFieldName,
    normalizeAngleOffsetEaseParamFieldName,
    normalizeAngleOffsetEaseSpecialParams,
    getAngleOffsetEaseParamMeta,
    hasAngleOffsetEaseSpecialParams,
    formatAngleValue
} from "./angle_offset_utils.js";
import { installPreviewRuntimeMethods } from "./preview_runtime_mixin.js?v=20260825_3";
import { installKotlinCodegenMethods } from "./kotlin_codegen_mixin.js?v=20260826_10";
import { compositionVectorApiTypeDeclaration } from "./composition_vector_expression.js?v=20260729_3";
import { installCodeOutputMethods } from "./code_output_mixin.js";
import { installExpressionEditorMethods } from "./expression_editor_mixin.js?v=20260729_3";
import { installCodeCompileMethods } from "./code_compile_mixin.js?v=20260826_1";
import { installTargetPresetMethods } from "./target_preset_mixin.js?v=20260727_1";
import { installCompositionPresetMethods } from "./composition_preset_mixin.js?v=20260729_4";
import {
    handleCompositionHistoryShortcut,
    isCompositionTextEditingTarget
} from "./history_hotkeys.js?v=20260725_1";
import {
    loadAllParticleData,
    ensureParticleAtlas,
    getParticleDataByName,
    getParticleEffectNames,
    calcTextureFrame,
    setBasePath
} from "../../particles/particle_data_loader.js";
import { createPreviewDistanceTool } from "../../src/js/shared/preview-distance-tool.js";
import { normalizeWorkbenchTheme } from "./theme.js";
import { putCompositionReferenceSnapshot } from "../../shared/js/composition-reference-storage.js?v=20260825_1";

const U = globalThis.Utils;
if (!U) throw new Error("Utils 未加载：请先加载 points_builder/utils.js");

const EXPORTED_SIG_KEY = "cb_export_sig_v1";
const CPB_PREFIX = "cpb_";
const CPB_STATE_KEY = `${CPB_PREFIX}pb_state_v1`;
const CPB_PROJECT_KEY = `${CPB_PREFIX}pb_project_name_v1`;
const CPB_RETURN_CARD_KEY = `${CPB_PREFIX}return_card_v1`;
const CPB_RETURN_TARGET_KEY = `${CPB_PREFIX}return_target_v1`;
const CPB_COMP_CONTEXT_KEY = `${CPB_PREFIX}pb_comp_context_v1`;
// Isolate persisted reference data when the sampling contract or Composition changes.
const COMPOSITION_REFERENCE_BUILD_VERSION = "20260825_22";
const COMPOSITION_REFERENCE_STORAGE_PREFIX = "composition-reference-v3:";

function compositionReferenceStateRevision(state) {
    let source = "";
    try {
        source = JSON.stringify(state || {});
    } catch {
        source = String(Date.now());
    }
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index++) {
        hash = Math.imul((hash ^ source.charCodeAt(index)) >>> 0, 0x01000193) >>> 0;
    }
    return `${hash.toString(16).padStart(8, "0")}:${source.length}`;
}

function compositionReferenceNodeId(cardId, path = []) {
    const id = String(cardId || "").trim();
    const normalizedPath = Array.isArray(path) ? path.map((value) => Math.max(0, Math.trunc(Number(value) || 0))) : [];
    return normalizedPath.length ? `${id}::shape:${normalizedPath.join(".")}` : id;
}

function compositionReferenceSnapshotHasPoints(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    const sourcePointTotal = Math.max(0, Math.trunc(Number(snapshot.sourcePointTotal) || 0));
    if (sourcePointTotal > 0) return true;
    return Array.isArray(snapshot.groups)
        && snapshot.groups.some((group) => Math.max(0, Math.trunc(Number(group?.pointCount) || 0)) > 0);
}

function buildCompositionReferenceTree(card, path = [], parentId = null, depth = 0, out = [], rootCardId = "") {
    if (!card || typeof card !== "object") return out;
    const cardId = rootCardId || String(card.id || "").trim();
    const nodePath = Array.isArray(path) ? path.slice() : [];
    const id = compositionReferenceNodeId(cardId, nodePath);
    out.push({
        id,
        parentId,
        depth,
        path: nodePath,
        name: String(nodePath.length ? (card.name || `子节点 ${nodePath[nodePath.length - 1] + 1}`) : (card.name || "卡片")),
        dataType: String(card.type || card.dataType || "single"),
        isRoot: nodePath.length === 0
    });
    const children = Array.isArray(card.children) ? card.children : (Array.isArray(card.shapeChildren) ? card.shapeChildren : []);
    children.forEach((child, index) => buildCompositionReferenceTree(
        child,
        nodePath.concat(index),
        id,
        depth + 1,
        out,
        cardId
    ));
    return out;
}

const HOTKEY_ACTION_DEFS = [
    { id: "addCard", title: "添加卡片", desc: "默认 W" },
    { id: "switchEditor", title: "切换到编辑页", desc: "默认 E" },
    { id: "switchCode", title: "切换到代码页", desc: "默认 C" },
    { id: "toggleSettings", title: "打开/关闭设置", desc: "默认 H" },
    { id: "toggleHotkeys", title: "打开/关闭快捷键", desc: "默认 Shift+H" },
    { id: "generateCode", title: "重新生成代码", desc: "默认 K" },
    { id: "copyCode", title: "复制 Kotlin", desc: "默认 Ctrl/Cmd+Shift+C" },
    { id: "toggleRealtime", title: "切换实时生成代码", desc: "默认 R" },
    { id: "openBuilderEditor", title: "编辑当前 Builder", desc: "默认 B" },
    { id: "openMeasureTool", title: "打开预览测距", desc: "默认 M" },
    { id: "deleteCard", title: "删除选中卡片", desc: "默认 Backspace/Delete" },
    { id: "fullscreen", title: "预览全屏", desc: "默认 F" },
    { id: "undo", title: "撤销", desc: "默认 Ctrl/Cmd+Z" },
    { id: "redo", title: "重做", desc: "默认 Ctrl/Cmd+Shift+Z" }
];

const EFFECT_CLASS_OPTIONS = [
    "ControlableEndRodEffect",
    "ControlableEnchantmentEffect",
    "ControlableCloudEffect",
    "ControlableFallingDustEffect",
    "ControlableSplashEffect",
    "ControlableFlashEffect",
    "ControlableFireworkEffect"
];

const CONTROLLER_VAR_TYPES = [
    "Boolean",
    "Int",
    "Float",
    "Double",
    "Long",
    "String"
];

const PARTICLE_INIT_TARGET_OPTIONS = [
    "color",
    "size",
    "particleAlpha",
    "currentAge",
    "textureSheet"
];
const CPARTICLE_INIT_TARGET_OPTIONS = [
    "color",
    "size",
    "alpha",
    "age",
    "maxAge",
    "alphaCurve",
    "scaleCurve",
    "colorCurve"
];

const CPARTICLE_RENDER_LAYER_OPTIONS = [
    "OPAQUE",
    "TRANSLUCENT",
    "ADDITION_BLEND",
    "ADDITION_BLEND_NOT_HDR",
    "ADDITION_BLEND_NOT_HDR_NO_DEPTH_WRITE",
    "ADDITION_BLEND_TRANSLUCENT",
    "ADDITION_BLEND_TRANSLUCENT_NOT_HDR",
    "ADDITION_BLEND_TRANSLUCENT_NOT_HDR_NO_DEPTH_WRITE",
    "ADDITION_BLEND_TRANSLUCENT_NO_DEPTH_WRITE"
];

const KOTLIN_IDENTIFIER_KEYWORDS = new Set([
    "as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface", "is",
    "null", "object", "package", "return", "super", "this", "throw", "true", "try", "typealias", "typeof",
    "val", "var", "when", "while"
]);

function isKotlinIdentifier(name) {
    const id = String(name || "").trim();
    if (!id) return false;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return false;
    return !KOTLIN_IDENTIFIER_KEYWORDS.has(id);
}

function normalizeKotlinSymbolName(name, fallback = "value") {
    let id = sanitizeKotlinIdentifier(name, fallback);
    if (!id) id = fallback;
    if (KOTLIN_IDENTIFIER_KEYWORDS.has(id)) id = `_${id}`;
    return id;
}


function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function int(v) {
    return Math.trunc(num(v));
}

function clamp(v, min, max) {
    let lo = Number(min);
    let hi = Number(max);
    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi)) hi = lo;
    if (hi < lo) hi = lo;
    return Math.min(Math.max(Number(v) || 0, lo), hi);
}

function esc(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function relExpr(x, y, z) {
    return `RelativeLocation(${formatKotlinDoubleLiteral(num(x))}, ${formatKotlinDoubleLiteral(num(y))}, ${formatKotlinDoubleLiteral(num(z))})`;
}

function isPlainNumericLiteralText(raw) {
    return /^-?(?:\d+\.?\d*|\.\d+)(?:[fFdDlL])?$/.test(String(raw || "").trim());
}

function normalizeKotlinDoubleLiteralText(raw) {
    let core = String(raw || "").trim();
    if (!core) return "0.0";
    core = core.replace(/[fFdDlL]$/g, "");
    if (!core) return "0.0";
    if (!core.includes(".") && !/[eE]/.test(core)) return `${core}.0`;
    if (core.endsWith(".")) return `${core}0`;
    return core;
}

function normalizeKotlinFloatLiteralText(raw) {
    const core = normalizeKotlinDoubleLiteralText(raw);
    return `${core}F`;
}

function formatKotlinDoubleLiteral(v) {
    const raw = formatNumberCompact(num(v));
    return normalizeKotlinDoubleLiteralText(raw);
}

function srgbToLinear01(v) {
    const c = clamp(num(v), 0, 1);
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

function sanitizeKotlinIdentifier(name, fallback = "value") {
    const raw = String(name || "").trim();
    const rep = raw.replace(/[^A-Za-z0-9_]/g, "_");
    if (!rep) return fallback;
    if (/^[0-9]/.test(rep)) return `_${rep}`;
    return rep;
}

function sanitizeKotlinClassName(name) {
    const id = sanitizeKotlinIdentifier(name, "NewComposition");
    return /^[A-Z]/.test(id) ? id : id.charAt(0).toUpperCase() + id.slice(1);
}

function normalizeHotkey(hk) {
    if (!hk || typeof hk !== "string") return "";
    const parts = hk.split("+").map((it) => it.trim()).filter(Boolean);
    const hasMod = parts.includes("Mod");
    const hasShift = parts.includes("Shift");
    const hasAlt = parts.includes("Alt");
    const main = parts.find((p) => p !== "Mod" && p !== "Shift" && p !== "Alt") || "";
    const out = [];
    if (hasMod) out.push("Mod");
    if (hasShift) out.push("Shift");
    if (hasAlt) out.push("Alt");
    if (main) out.push(main);
    return out.join("+");
}

function eventToHotkey(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("Mod");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    const code = String(e.code || "");
    const isModifier = code === "ShiftLeft" || code === "ShiftRight"
        || code === "ControlLeft" || code === "ControlRight"
        || code === "MetaLeft" || code === "MetaRight"
        || code === "AltLeft" || code === "AltRight";
    if (code && !isModifier) parts.push(code);
    return normalizeHotkey(parts.join("+"));
}

function hotkeyToHuman(hk) {
    const norm = normalizeHotkey(hk);
    if (!norm) return "";
    return norm.split("+").map((p) => {
        if (p === "Mod") return "Ctrl/Cmd";
        if (p === "Shift") return "Shift";
        if (p === "Alt") return "Alt";
        if (p.startsWith("Key")) return p.slice(3).toUpperCase();
        if (p.startsWith("Digit")) return p.slice(5);
        if (p === "Escape") return "Esc";
        if (p === "Backspace") return "Backspace";
        if (p === "Delete") return "Delete";
        if (p.startsWith("Arrow")) return p.replace("Arrow", "");
        if (p === "Space") return "Space";
        return p;
    }).join("+");
}

function hotkeyMatchEvent(e, hk) {
    return eventToHotkey(e) === normalizeHotkey(hk);
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

const JS_LINT_KEYWORDS = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return",
    "let", "const", "var", "function", "class", "new", "this", "typeof", "instanceof",
    "try", "catch", "finally", "throw", "extends", "super", "import", "from", "export", "as",
    "true", "false", "null", "undefined", "in", "of", "await", "async"
]);

const JS_LINT_GLOBALS = new Set([
    "Math", "Random", "Number", "String", "Boolean", "Object", "Array", "Date", "JSON", "console",
    "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN",
    "PI", "age", "tick", "tickCount", "index", "axis",
    "rotateToPoint", "rotateAsAxis", "rotateToWithAngle", "addSingle", "addMultiple", "addPreTickAction",
    "setAlpha", "setColor", "setSize", "teleportTo",
    "playCParticleAlphaTransition", "CParticleCurve",
    "setReversedScaleOnCompositionStatus", "particle",
    "thisAt", "status",
    "color", "size", "alpha", "particleColor", "particleSize", "particleAlpha", "currentAge", "lifetime", "lifeTime", "maxAge", "textureSheet",
    "RelativeLocation", "Vec3", "Vec3d", "Vector3f"
]);

const CONTROLLER_SCOPE_RESERVED = new Set([
    "color", "particleColor", "size", "particleSize", "alpha", "particleAlpha",
    "age", "currentAge", "lifetime", "lifeTime", "maxAge", "textureSheet",
    "tick", "tickCount", "index", "status", "particle", "thisAt"
]);
function stripJsForLint(raw) {
    const src = String(raw || "");
    return src.replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (m) => " ".repeat(m.length)
    );
}

function collectJsDeclaredNames(raw) {
    const src = stripJsForLint(raw);
    const names = new Set();
    const push = (value) => {
        const name = String(value || "").trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name);
    };
    for (const m of src.matchAll(/\b(?:let|const|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\bfunction(?:\s+[A-Za-z_$][A-Za-z0-9_$]*)?\s*\(([^)]*)\)/g)) {
        const params = String(m[1] || "").split(",");
        for (const rawParam of params) {
            const head = String(rawParam || "").split("=")[0];
            push(head.trim());
        }
    }
    for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\(\s*([^)]*?)\s*\)\s*=>/g)) {
        const params = String(m[1] || "").split(",");
        for (const rawParam of params) {
            const head = String(rawParam || "").split("=")[0];
            push(head.trim());
        }
    }
    return names;
}

function findFirstUnknownJsIdentifier(raw, allowedNames = new Set()) {
    const src = stripJsForLint(raw);
    const local = collectJsDeclaredNames(src);
    for (const m of src.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)) {
        const name = String(m[0] || "");
        if (!name) continue;
        if (JS_LINT_KEYWORDS.has(name)) continue;
        if (JS_LINT_GLOBALS.has(name)) continue;
        if (allowedNames.has(name)) continue;
        if (local.has(name)) continue;
        const idx = Number(m.index) || 0;
        const prev = idx > 0 ? src[idx - 1] : "";
        if (prev === ".") continue;
        let j = idx + name.length;
        while (j < src.length && /\s/.test(src[j])) j += 1;
        if (src[j] === ":") continue;
        return name;
    }
    return "";
}

function safeNumberLiteral(value, kotlinType) {
    const t = String(kotlinType || "").trim().toLowerCase();
    const raw = String(value ?? "").trim();
    const toIntText = (n) => String(n < 0 ? Math.ceil(n) : Math.floor(n));
    if (!raw) {
        return defaultLiteralForKotlinType(kotlinType);
    }
    if (t === "boolean") {
        if (/^true$/i.test(raw)) return "true";
        if (/^false$/i.test(raw)) return "false";
        return raw;
    }
    if (t === "string") {
        return raw || "\"\"";
    }
    if (!isPlainNumericLiteralText(raw)) {
        return raw;
    }
    const cleaned = raw.replace(/[fFdDlL]/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
        return defaultLiteralForKotlinType(kotlinType);
    }
    if (t === "int" || t === "short" || t === "byte") {
        return toIntText(n);
    }
    if (t === "long") {
        return `${toIntText(n)}L`;
    }
    if (t === "float") {
        return normalizeKotlinFloatLiteralText(cleaned);
    }
    if (t === "double") {
        return normalizeKotlinDoubleLiteralText(cleaned);
    }
    return raw;
}

function normalizeBuilderTarget(targetRaw) {
    const target = String(targetRaw || "").trim();
    if (/^tree_node:/.test(target)) return target;
    if (target === "shape") return target;
    return "root";
}

function getBuilderTargetShapePath(targetRaw) {
    const target = normalizeBuilderTarget(targetRaw);
    if (!target.startsWith("tree_node:")) return [];
    try {
        const path = JSON.parse(target.slice("tree_node:".length));
        return Array.isArray(path) ? path.map((value) => Math.max(0, Math.trunc(Number(value) || 0))) : [];
    } catch {
        return [];
    }
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
            z: to.r.z * x + to.u.z * y + to.f.z * z
        };
    }
    return points;
}

const BUILDER_EXPR_TAG = "__pbExprNum";
let builderNumericContextProvider = () => ({});

function stripNumericSuffix(raw) {
    return String(raw || "").replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
}

function isNumericLiteralText(raw) {
    const s = String(raw || "").trim();
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?[fFdDlL]?$/.test(s);
}

function makeExprNumber(expr, value, forceInt = false) {
    const v = Number(value);
    const n = Number.isFinite(v) ? (forceInt ? Math.trunc(v) : v) : 0;
    return {
        [BUILDER_EXPR_TAG]: true,
        expr: String(expr || "").trim(),
        value: n,
        valueOf() {
            return this.value;
        },
        toString() {
            return this.expr || String(this.value);
        }
    };
}

function isExprNumber(v) {
    return !!(v && typeof v === "object" && v[BUILDER_EXPR_TAG]);
}

function extractExprText(v) {
    if (isExprNumber(v)) return String(v.expr || "").trim();
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (isNumericLiteralText(s)) return "";
    return s;
}

function evaluateExprWithMap(rawExpr, vars = {}) {
    const expr = stripNumericSuffix(String(rawExpr || "").trim());
    if (!expr) return 0;
    if (isNumericLiteralText(expr)) {
        const n = Number(expr.replace(/[fFdDlL]/g, ""));
        return Number.isFinite(n) ? n : 0;
    }
    const keys = Object.keys(vars || {});
    const vals = keys.map((k) => Number(vars[k]) || 0);
    try {
        const fn = new Function(...keys, "PI", "Math", `return (${expr});`);
        const out = fn(...vals, Math.PI, Math);
        return Number.isFinite(Number(out)) ? Number(out) : 0;
    } catch {
        return 0;
    }
}

function getBuilderNumericContextMap() {
    try {
        const map = builderNumericContextProvider?.() || {};
        if (map && typeof map === "object") return map;
    } catch {
    }
    return {};
}

function builderNum(v) {
    if (isExprNumber(v)) return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim();
    if (!s) return 0;
    if (isNumericLiteralText(s)) {
        const n = Number(s.replace(/[fFdDlL]/g, ""));
        return Number.isFinite(n) ? n : 0;
    }
    const val = evaluateExprWithMap(s, getBuilderNumericContextMap());
    return makeExprNumber(s, val, false);
}

function builderInt(v) {
    if (isExprNumber(v)) return makeExprNumber(v.expr, v.value, true);
    if (typeof v === "number") return Math.trunc(Number.isFinite(v) ? v : 0);
    const s = String(v ?? "").trim();
    if (!s) return 0;
    if (isNumericLiteralText(s)) {
        const n = Number(s.replace(/[fFdDlL]/g, ""));
        return Math.trunc(Number.isFinite(n) ? n : 0);
    }
    const val = evaluateExprWithMap(s, getBuilderNumericContextMap());
    return makeExprNumber(s, val, true);
}

function builderFmt(v) {
    const expr = extractExprText(v);
    if (expr) return expr;
    const n = Number(v);
    return formatKotlinDoubleLiteral(Number.isFinite(n) ? n : 0);
}

function builderRelExpr(x, y, z) {
    return `RelativeLocation(${builderFmt(builderNum(x))}, ${builderFmt(builderNum(y))}, ${builderFmt(builderNum(z))})`;
}

const builderU = Object.assign({}, U, {
    fmt: (v) => builderFmt(v),
    angleToKotlinRadExpr: (value, unit) => {
        const expr = extractExprText(value);
        if (expr) {
            if (U.normalizeAngleUnit(unit) === "rad") return `(${expr})`;
            return `(${expr})/180*PI`;
        }
        return U.angleToKotlinRadExpr(Number(value) || 0, unit);
    }
});

const KIND = createKindDefs({ U: builderU, num: builderNum, int: builderInt, relExpr: builderRelExpr, rotatePointsToPointUpright });
let builderEvalState = { root: { id: "root", kind: "ROOT", children: [] } };
const builderTools = createBuilderTools({
    KIND,
    U: builderU,
    getState: () => builderEvalState,
    getKotlinEndMode: () => "builder",
    rotatePointsToPointUpright
});
const { evalBuilderWithMeta, emitKotlin: emitPointsBuilderKotlin } = builderTools;

class CompositionBuilderApp {
    constructor() {
        this.state = loadCompositionStateFromStorage(localStorage);
        this.selectedCardIds = new Set();
        this.focusedCardId = this.state.cards[0]?.id || null;
        if (this.focusedCardId) this.selectedCardIds.add(this.focusedCardId);
        this.selectionAnchorCardId = this.focusedCardId;

        this.undoStack = [];
        this.redoStack = [];
        this.armedHistorySnapshot = null;

        this.currentKotlin = "";
        this.saveTimer = 0;
        this.referenceSamplerMode = (() => {
            try {
                return new URLSearchParams(globalThis.location?.search || "").get("referenceSampler") === "1";
            } catch {
                return false;
            }
        })();
        this.toastTimer = 0;
        this.pendingImeMutate = null;
        this.pendingImeMutateTimer = 0;
        this.activeImeCompositionCount = 0;
        this.pendingExpressionRefreshes = new Map();

        this.scene = null;
        this.camera = null;
        this.renderer = null;        this.grid = null;        this.adaptiveGrid = null;
        this.pointsMesh = null;
        this.pointsGeom = null;
        this.pointsMat = null;

        this.previewPoints = [];
        this.previewBasePoints = [];
        this.previewOwners = [];
        this.previewReferenceOwners = [];
        this.previewBirthOffsets = [];
        this.previewOwnerLocalIndex = [];
        this.previewOwnerPointCount = [];
        this.previewAnchorBase = [];
        this.previewLocalBase = [];
        this.previewAnchorRef = [];
        this.previewLocalRef = [];
        this.previewLevelBases = [];
        this.previewLevelRefs = [];
        this.previewLevelPaths = [];
        this.previewLevelOffsetRefs = [];
        this.previewLevelMetas = [];
        this.previewUseLocalOps = [];
        this.previewRootOffsetIndex = [];
        this.previewRootVirtualIndex = [];
        this.previewRootVirtualTotal = 0;
        this.previewVisibleMask = [];
        this.previewInteractionVisibleMask = null;
        this.previewSizeFactors = [];
        this.previewAlphaFactors = [];
        this.previewGpuParticlePathEnabled = false;
        this.previewGpuActivePointCount = 0;
        this.previewGpuConfiguredPointCount = 0;
        this.previewGpuElapsedTick = 0;
        this.previewGpuParticleFallbackReason = "";
        this.previewGpuTransformsDynamic = false;
        this.previewGpuTransformAppliedTick = -1;
        this.previewGpuVisibilityDynamic = false;
        this.previewGpuVisibilityAppliedTick = -1;
        this.previewGpuVisibilityTick = 0;
        this.previewGpuVisibilityMaskProxy = null;
        this.previewGpuUnlockTicks = [];
        this.previewGpuTransformStartTicks = null;
        this.previewGpuAttributeUsage = null;
        this.previewGpuHasLifecycleData = false;
        this.previewGpuSharedTransformEnabled = false;
        this.previewGpuSharedTransformPointIndex = -1;
        this.previewGpuSharedTransform = { x: 0, y: 0, z: 0, w: 0 };
        this.previewGpuSharedScale = 1;
        this.previewSceneDirty = true;
        this.cardColorCache = new Map();
        this.previewAnimStart = performance.now();
        this.previewPerfLastTs = 0;
        this.previewPaused = false;
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
        this.lastPointsStatusText = "";
        this.lastFpsStatusText = "";
        this.previewFpsFrames = 0;
        this.previewFpsLastTs = 0;
        this.previewCycleCache = null;
        this.previewExprCountCache = new Map();
        this.previewExprPrefixCache = new Map();
        this.previewExprFnCache = new Map();
        this.previewCondFnCache = new Map();
        this.previewNumericFnCache = new Map();
        this.previewControllerFnCache = new Map();
        this.controllerScopeProto = null;
        this.controllerParticleProto = null;
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        this.lastExportedStateSig = this.readExportedSignature();
        this.previewDistanceTool = null;

        this.selectState = null;
        this.selectPointerId = null;
        this.previewPickVector = new THREE.Vector3();

        this.hotkeyCaptureActionId = null;
        this.builderModalCardId = null;
        this.builderModalTarget = "root";
        this.bezierToolTarget = { scope: "project", cardId: "", treePath: "", kind: "scale" };
        this.confirmResolver = null;
        this.confirmKeydownHandler = null;

        this.exprSuggest = {
            el: null,
            activeInput: null,
            items: [],
            filtered: [],
            token: "",
            range: null,
            active: 0
        };
        this.codeEditors = new Map();
        this.pendingCodeApplyOpts = new Map();
        this.editorWorkspaceView = "cards";
        this.initCompositionPresetState();

        this.exprRuntime = createExpressionRuntime({
            U,
            getState: () => this.state,
            sanitizeIdentifier: (raw, fallback = "") => sanitizeKotlinIdentifier(raw, fallback)
        });
        builderNumericContextProvider = () => this.getBuilderNumericContextMap();
    }

    init() {
        this.bindDom();
        const startupCParticleConflict = this.resolveLoadedCParticleConflicts();
        this.initExpressionSuggest();
        this.consumeBuilderReturnState();
        this.initThree();
        this.applySettingsToDom();
        this.refreshPauseButtonUi();
        this.initLayoutSplitters();
        this.switchPage("editor");
        this.renderProjectSection();
        this.renderCards();
        this.setEditorWorkspaceView(this.editorWorkspaceView);
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.writeBuilderCompositionContext();
        this.bindEvents();
        setTimeout(() => this.startCompositionReferenceSamplerFromQuery(), 0);
        if (startupCParticleConflict) {
            this.showCParticleConflict("GPU 粒子配置需要处理", startupCParticleConflict);
        }
        this._particleDataFns = { calcTextureFrame, getParticleDataByName, ensureParticleAtlas };
        setBasePath("./");
        loadAllParticleData({ lazyAtlases: true }).then(() => {
            this.renderCards();
            if (typeof this.clearPreviewRenderCache === "function") {
                this.clearPreviewRenderCache("particle-data-loaded");
            }
            this.syncTextureUniforms();
        });
    }

    bindDom() {
        this.dom = {
            pageEditor: document.getElementById("pageEditor"),
            pageCode: document.getElementById("pageCode"),
            btnPageEditor: document.getElementById("btnPageEditor"),
            btnPageCode: document.getElementById("btnPageCode"),
            btnCollapseAllCardSections: document.getElementById("btnCollapseAllCardSections"),
            btnExpandAllCardSections: document.getElementById("btnExpandAllCardSections"),
            btnSettings: document.getElementById("btnSettings"),
            btnHotkeys: document.getElementById("btnHotkeys"),
            chkRealtimeCode: document.getElementById("chkRealtimeCode"),
            btnGenerateCode2: document.getElementById("btnGenerateCode2"),
            btnCopyCode2: document.getElementById("btnCopyCode2"),
            btnDownloadCode: document.getElementById("btnDownloadCode"),
            btnPausePreview: document.getElementById("btnPausePreview"),
            btnReplayPreview: document.getElementById("btnReplayPreview"),
            btnCompileExpr: document.getElementById("btnCompileExpr"),
            btnProjectEditorTab: document.getElementById("btnProjectEditorTab"),
            btnCardEditorTab: document.getElementById("btnCardEditorTab"),
            activeCardTabLabel: document.getElementById("activeCardTabLabel"),
            projectSection: document.getElementById("projectSection"),
            projectCardsResizer: document.getElementById("projectCardsResizer"),
            compositionSideWorkbench: document.querySelector(".composition-side-workbench"),
            compositionLayersRoot: document.getElementById("compositionLayersRoot"),
            cardsRoot: document.getElementById("cardsRoot"),
            leftPanel: document.querySelector(".panel.left"),
            editorResizer: document.getElementById("editorResizer"),
            pageEditorWrap: document.getElementById("pageEditor"),
            viewerWrap: document.getElementById("viewerWrap"),
            threeHost: document.getElementById("threeHost"),
            selectBox: document.getElementById("selectBox"),
            statusPoints: document.getElementById("statusPoints"),
            statusSelection: document.getElementById("statusSelection"),
            statusFps: document.getElementById("statusFps"),
            statusGpu: document.getElementById("statusGpu"),
            statusCache: document.getElementById("statusCache"),
            btnJumpPreviewEnd: document.getElementById("btnJumpPreviewEnd"),
            btnResetCamera: document.getElementById("btnResetCamera"),
            btnFullscreen: document.getElementById("btnFullscreen"),
            kotlinOut: document.getElementById("kotlinOut"),
            settingsMask: document.getElementById("settingsMask"),
            settingsModal: document.getElementById("settingsModal"),
            btnCloseSettings: document.getElementById("btnCloseSettings"),
            inpParamStep: document.getElementById("inpParamStep"),
            inpPointSize: document.getElementById("inpPointSize"),
            chkPreviewRenderCache: document.getElementById("chkPreviewRenderCache"),
            inpPreviewCacheWorkers: document.getElementById("inpPreviewCacheWorkers"),
            themeSelect: document.getElementById("themeSelect"),
            chkAxes: document.getElementById("chkAxes"),
            chkGrid: document.getElementById("chkGrid"),
            chkPreviewFocusSingleCard: document.getElementById("chkPreviewFocusSingleCard"),
            chkRealtimeCode2: document.getElementById("chkRealtimeCode2"),
            chkGlobalCParticle: document.getElementById("chkGlobalCParticle"),
            btnOpenHotkeys: document.getElementById("btnOpenHotkeys"),
            btnExportSettings: document.getElementById("btnExportSettings"),
            btnImportSettings: document.getElementById("btnImportSettings"),
            fileSettings: document.getElementById("fileSettings"),
            hkMask: document.getElementById("hkMask"),
            hkModal: document.getElementById("hkModal"),
            hkSearch: document.getElementById("hkSearch"),
            hkHint: document.getElementById("hkHint"),
            hkList: document.getElementById("hkList"),
            btnCloseHotkeys: document.getElementById("btnCloseHotkeys"),
            btnCloseHotkeys2: document.getElementById("btnCloseHotkeys2"),
            btnHotkeysReset: document.getElementById("btnHotkeysReset"),
            cardPresetMask: document.getElementById("cardPresetMask"),
            cardPresetModal: document.getElementById("cardPresetModal"),
            cardPresetContext: document.getElementById("cardPresetContext"),
            cardPresetSearch: document.getElementById("cardPresetSearch"),
            cardPresetList: document.getElementById("cardPresetList"),
            cardPresetStatus: document.getElementById("cardPresetStatus"),
            btnCloseCardPreset: document.getElementById("btnCloseCardPreset"),
            btnCloseCardPreset2: document.getElementById("btnCloseCardPreset2"),
            nodePresetMask: document.getElementById("nodePresetMask"),
            nodePresetModal: document.getElementById("nodePresetModal"),
            nodePresetContext: document.getElementById("nodePresetContext"),
            nodePresetSearch: document.getElementById("nodePresetSearch"),
            nodePresetList: document.getElementById("nodePresetList"),
            nodePresetStatus: document.getElementById("nodePresetStatus"),
            btnCloseNodePreset: document.getElementById("btnCloseNodePreset"),
            btnCloseNodePreset2: document.getElementById("btnCloseNodePreset2"),
            builderMask: document.getElementById("builderMask"),
            builderModal: document.getElementById("builderModal"),
            builderFrame: document.getElementById("builderFrame"),
            btnReloadBuilderFrame: document.getElementById("btnReloadBuilderFrame"),
            btnPullBuilderState: document.getElementById("btnPullBuilderState"),
            btnPullBuilderState2: document.getElementById("btnPullBuilderState2"),
            btnCloseBuilderModal: document.getElementById("btnCloseBuilderModal"),
            btnCloseBuilderModal2: document.getElementById("btnCloseBuilderModal2"),
            bezierMask: document.getElementById("bezierMask"),
            bezierModal: document.getElementById("bezierModal"),
            bezierFrame: document.getElementById("bezierFrame"),
            btnCloseBezierModal: document.getElementById("btnCloseBezierModal"),
            btnCloseBezierModal2: document.getElementById("btnCloseBezierModal2"),
            btnApplyBezierModal: document.getElementById("btnApplyBezierModal"),
            confirmMask: document.getElementById("confirmMask"),
            confirmModal: document.getElementById("confirmModal"),
            confirmTitle: document.getElementById("confirmTitle"),
            confirmMessage: document.getElementById("confirmMessage"),
            btnCloseConfirmModal: document.getElementById("btnCloseConfirmModal"),
            btnCancelConfirmModal: document.getElementById("btnCancelConfirmModal"),
            btnOkConfirmModal: document.getElementById("btnOkConfirmModal")
        };
    }
    bindEvents() {
        const d = this.dom;
        d.btnPageEditor.addEventListener("click", () => this.switchPage("editor"));
        d.btnPageCode.addEventListener("click", () => this.switchPage("code"));
        d.btnCollapseAllCardSections?.addEventListener("click", () => {
            this.setAllCardsFolded(true);
            this.setAllCardsSectionsCollapsed(true);
            this.renderCards();
            this.scheduleSave();
        });
        d.btnExpandAllCardSections?.addEventListener("click", () => {
            this.setAllCardsFolded(false);
            this.setAllCardsSectionsCollapsed(false);
            this.renderCards();
            this.scheduleSave();
        });
        d.btnSettings.addEventListener("click", () => this.showSettings());
        d.btnHotkeys.addEventListener("click", () => this.showHotkeys());
        if (d.chkRealtimeCode) d.chkRealtimeCode.addEventListener("change", () => this.setRealtimeCode(d.chkRealtimeCode.checked));
        d.btnGenerateCode2.addEventListener("click", () => this.generateCodeAndRender(true));
        d.btnCopyCode2.addEventListener("click", () => this.copyCode());
        d.btnDownloadCode.addEventListener("click", () => this.downloadCode());
        if (d.btnPausePreview) d.btnPausePreview.addEventListener("click", () => this.togglePreviewPause());
        if (d.btnReplayPreview) d.btnReplayPreview.addEventListener("click", () => this.replayPreview());
        d.btnProjectEditorTab?.addEventListener("click", () => this.setEditorWorkspaceView("project"));
        d.btnCardEditorTab?.addEventListener("click", () => this.setEditorWorkspaceView("cards"));
        d.btnProjectEditorTab?.addEventListener("keydown", (e) => this.onEditorWorkspaceTabKeydown(e));
        d.btnCardEditorTab?.addEventListener("keydown", (e) => this.onEditorWorkspaceTabKeydown(e));

        d.projectSection.addEventListener("click", (e) => this.onProjectClick(e));
        d.projectSection.addEventListener("input", (e) => this.onProjectInput(e));
        d.projectSection.addEventListener("change", (e) => this.onProjectChange(e));
        d.projectSection.addEventListener("compositionstart", (e) => this.onEditableCompositionStart(e), true);
        d.projectSection.addEventListener("compositionend", (e) => this.onEditableCompositionEnd(e), true);
        d.projectSection.addEventListener("focusout", (e) => this.onCodeEditorFocusOut(e), true);

        d.compositionLayersRoot?.addEventListener("click", (e) => this.onCardClick(e));
        d.compositionLayersRoot?.addEventListener("input", (e) => this.onCardInput(e));
        d.compositionLayersRoot?.addEventListener("change", (e) => this.onCardChange(e));
        for (const root of [d.cardsRoot].filter(Boolean)) {
            root.addEventListener("click", (e) => this.onCardClick(e));
            root.addEventListener("input", (e) => this.onCardInput(e));
            root.addEventListener("change", (e) => this.onCardChange(e));
            root.addEventListener("compositionstart", (e) => this.onEditableCompositionStart(e), true);
            root.addEventListener("compositionend", (e) => this.onEditableCompositionEnd(e), true);
            root.addEventListener("focusin", (e) => this.onCardFocusIn(e), true);
            root.addEventListener("focusout", (e) => this.onControllerVariableFocusOut(e), true);
            root.addEventListener("focusout", (e) => this.onCodeEditorFocusOut(e), true);
        }
        if (d.btnCompileExpr) d.btnCompileExpr.addEventListener("click", () => this.compileAllCodeEditorSources({ force: true, showToast: true }));
        if (d.btnJumpPreviewEnd) d.btnJumpPreviewEnd.addEventListener("click", () => this.jumpPreviewToPreFade());

        d.settingsMask.addEventListener("click", () => this.hideSettings());
        d.btnCloseSettings.addEventListener("click", () => this.hideSettings());
        d.inpParamStep.addEventListener("input", () => {
            this.state.settings.paramStep = Math.max(0.000001, num(d.inpParamStep.value));
            this.scheduleSave();
        });
        d.inpPointSize.addEventListener("input", () => {
            this.state.settings.pointSize = Math.max(0.001, num(d.inpPointSize.value));
            if (this.pointsMat) this.pointsMat.size = this.state.settings.pointSize;
            this.scheduleSave();
        });
        d.chkPreviewRenderCache?.addEventListener("change", () => {
            this.state.settings.previewRenderCacheEnabled = d.chkPreviewRenderCache.checked !== false;
            if (this.state.settings.previewRenderCacheEnabled) {
                if (this.previewRenderCache) this.previewRenderCache.disabled = false;
                if (this.previewRenderCacheWorkerPool?.disabled) this.previewRenderCacheWorkerPool = null;
                if (typeof this.clearPreviewRenderCache === "function") this.clearPreviewRenderCache("cache-enabled");
            } else {
                if (typeof this.clearPreviewRenderCache === "function") this.clearPreviewRenderCache("cache-disabled");
                if (typeof this.disposePreviewRenderCacheWorkerPool === "function") {
                    this.disposePreviewRenderCacheWorkerPool("cache-disabled", { disable: true });
                }
            }
            if (typeof this.updatePreviewCacheStatus === "function") this.updatePreviewCacheStatus();
            this.scheduleSave();
        });
        d.inpPreviewCacheWorkers?.addEventListener("input", () => {
            this.state.settings.previewCacheWorkerCount = clamp(int(d.inpPreviewCacheWorkers.value || 0), 0, 16);
            if (typeof this.disposePreviewRenderCacheWorkerPool === "function") {
                this.disposePreviewRenderCacheWorkerPool("worker-count-change", { disable: false });
            }
            if (typeof this.updatePreviewCacheStatus === "function") this.updatePreviewCacheStatus();
            this.scheduleSave();
        });
        d.themeSelect.addEventListener("change", () => {
            // 先写入全局主题，applyTheme() 再从统一状态读取。
            writeAppTheme(normalizeWorkbenchTheme(d.themeSelect.value));
            this.applyTheme();
            this.scheduleSave();
        });
        // 其他工具或外壳修改主题时，当前页面同步更新。
        watchAppTheme(() => this.applyTheme());
        d.chkAxes.addEventListener("change", () => {
            this.state.settings.showAxes = !!d.chkAxes.checked;
            if (this.axes) this.axes.visible = this.state.settings.showAxes;
            this.previewSceneDirty = true;
            this.scheduleSave();
        });
        d.chkGrid.addEventListener("change", () => {
            this.state.settings.showGrid = !!d.chkGrid.checked;
            if (this.grid) this.grid.visible = this.state.settings.showGrid;
            this.previewSceneDirty = true;
            this.scheduleSave();
        });
        d.chkPreviewFocusSingleCard.addEventListener("change", () => {
            this.state.settings.previewFocusSingleCard = !!d.chkPreviewFocusSingleCard.checked;
            this.updateSelectionStatus();
            this.scheduleSave();
        });
        d.chkRealtimeCode2.addEventListener("change", () => this.setRealtimeCode(d.chkRealtimeCode2.checked));
        d.btnOpenHotkeys?.addEventListener("click", () => {
            this.hideSettings();
            this.showHotkeys();
        });
        d.btnExportSettings?.addEventListener("click", () => this.exportSettings());
        d.btnImportSettings?.addEventListener("click", () => d.fileSettings?.click());
        d.fileSettings?.addEventListener("change", () => this.importSettingsFromFile());

        d.hkMask?.addEventListener("click", () => this.hideHotkeys());
        d.hkSearch?.addEventListener("input", () => this.renderHotkeysList());
        d.hkList?.addEventListener("click", (e) => this.onHotkeyListClick(e));
        d.btnCloseHotkeys?.addEventListener("click", () => this.hideHotkeys());
        d.btnCloseHotkeys2?.addEventListener("click", () => this.hideHotkeys());
        d.btnHotkeysReset?.addEventListener("click", () => this.resetHotkeys());

        d.cardPresetMask?.addEventListener("click", () => this.hideCardPresetModal());
        d.btnCloseCardPreset?.addEventListener("click", () => this.hideCardPresetModal());
        d.btnCloseCardPreset2?.addEventListener("click", () => this.hideCardPresetModal());
        d.nodePresetMask?.addEventListener("click", () => this.hideNodePresetModal());
        d.btnCloseNodePreset?.addEventListener("click", () => this.hideNodePresetModal());
        d.btnCloseNodePreset2?.addEventListener("click", () => this.hideNodePresetModal());
        this.bindCompositionPresetEvents();

        d.builderMask.addEventListener("click", () => this.hideBuilderModal());
        d.btnCloseBuilderModal.addEventListener("click", () => this.hideBuilderModal());
        d.btnCloseBuilderModal2.addEventListener("click", () => this.hideBuilderModal());
        d.btnReloadBuilderFrame.addEventListener("click", () => this.reloadBuilderFrame());
        d.btnPullBuilderState.addEventListener("click", () => this.pullBuilderStateAndClose());
        d.btnPullBuilderState2.addEventListener("click", () => this.pullBuilderStateAndClose());
        d.bezierMask?.addEventListener("click", () => this.closeBezierTool());
        d.btnCloseBezierModal?.addEventListener("click", () => this.closeBezierTool());
        d.btnCloseBezierModal2?.addEventListener("click", () => this.closeBezierTool());
        d.btnApplyBezierModal?.addEventListener("click", () => this.applyBezierToolAndClose());
        d.confirmMask?.addEventListener("click", () => this.resolveThemeConfirm(false));
        d.btnCloseConfirmModal?.addEventListener("click", () => this.resolveThemeConfirm(false));
        d.btnCancelConfirmModal?.addEventListener("click", () => this.resolveThemeConfirm(false));
        d.btnOkConfirmModal?.addEventListener("click", () => this.resolveThemeConfirm(true));

        document.addEventListener("focusin", (e) => this.onExprFocusIn(e), true);
        document.addEventListener("input", (e) => this.onExprInput(e), true);
        document.addEventListener("keydown", (e) => this.onExprKeydown(e), true);
        document.addEventListener("mousedown", (e) => this.onExprMouseDown(e), true);

        document.addEventListener("focusin", (e) => {
            const el = e.target;
            if (!el) return;
            const tag = String(el.tagName || "").toUpperCase();
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                if ((el.dataset?.varField === "name" && el.dataset?.varIdx !== undefined)
                    || (el.dataset?.constField === "name" && el.dataset?.constIdx !== undefined)) {
                    el.dataset.prevSymbolName = String(el.value || "");
                }
                if (!this.armedHistorySnapshot) this.armedHistorySnapshot = deepClone(this.state);
            }
        }, true);

        window.addEventListener("keydown", (e) => this.onKeydown(e), true);
        window.addEventListener("resize", () => this.onResize());
        window.addEventListener("blur", () => this.autoPausePreviewByPageState());
        window.addEventListener("focus", () => this.autoResumePreviewByPageState());
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") this.autoPausePreviewByPageState();
            if (document.visibilityState === "visible") this.autoResumePreviewByPageState();
        });
        document.addEventListener("fullscreenchange", () => this.syncFullscreenUi());
        window.addEventListener("message", (e) => {
            if (e?.data?.type === "cpb-builder-return") {
                void this.consumeBuilderReturnState({ closeModal: true, pushHistory: true });
            }
        });
        window.addEventListener("storage", (e) => {
            if (e?.key === CPB_RETURN_CARD_KEY) this.consumeBuilderReturnState();
        });
    }

    initThree() {
        const host = this.dom.threeHost;
        const width = Math.max(2, host.clientWidth || 2);
        const height = Math.max(2, host.clientHeight || 2);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1017);
        this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 1000000);
        this.camera.position.set(16, 11, 16);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x0b1017, 1);
        host.innerHTML = "";
        host.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.8;
        this.controls.panSpeed = 0.8;
        this.controls.zoomSpeed = 0.95;
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN
        };
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        this.controls.addEventListener("change", () => {
            this.previewSceneDirty = true;
        });

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dir = new THREE.DirectionalLight(0xffffff, 0.7);
        dir.position.set(6, 8, 10);
        this.scene.add(dir);

        this.axes = new THREE.AxesHelper(6);
        this.scene.add(this.axes);
        this.adaptiveGrid = createAdaptiveGrid({
            scene: this.scene,
            camera: this.camera,
            controls: this.controls,
            renderer: this.renderer,
            color: getComputedStyle(document.body).getPropertyValue("--grid-color").trim() || "#617d9b",
            visible: true,
            plane: "XZ",
            offset: -0.001,
        });
        this.grid = this.adaptiveGrid?.mesh || null;

        this.pointsGeom = new THREE.BufferGeometry();
        this.pointsMat = new THREE.PointsMaterial({
            size: this.state.settings.pointSize,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            depthWrite: false
        });
        this.pointsMat.defaultAttributeValues = {
            ...(this.pointsMat.defaultAttributeValues || {}),
            aGpuMeta: [0, 0, 0, 0],
            aGpuFadeIn: [0, 0, 0, 0],
            aGpuFadeOut: [0, 0, 0, 0],
            aGpuTransform: [0, 0, 0, 0],
            aGpuTransformVector: [0, 0, 0],
            aGpuScale: [1],
            aGpuLifecycle: [0, -100],
            aGpuAlphaCurve: [1, 1, -2, -2],
            aGpuScaleCurve: [1, 1, -2, -2],
            aGpuColorCurve: [1, 1]
        };
        this.pointsMat.onBeforeCompile = (shader) => {
            const gpuTransformGroupLimit = 24;
            shader.uniforms.uAtlas = { value: null };
            shader.uniforms.uFrameCount = { value: 0 };
            shader.uniforms.uUseTexture = { value: 0 };
            shader.uniforms.uGpuPreviewEnabled = { value: this.previewGpuParticlePathEnabled === true ? 1 : 0 };
            shader.uniforms.uGpuPreviewTick = { value: this.previewGpuElapsedTick || 0 };
            shader.uniforms.uGpuPreviewPlayTicks = { value: 1 };
            shader.uniforms.uGpuPreviewCycleTicks = { value: 1 };
            shader.uniforms.uGpuPreviewGlobalAlpha = { value: 1 };
            shader.uniforms.uGpuPreviewHasLifecycle = { value: 0 };
            shader.uniforms.uGpuPreviewHasColorCurve = { value: 0 };
            shader.uniforms.uGpuPreviewUseSharedTransform = { value: 0 };
            shader.uniforms.uGpuPreviewSharedTransform = { value: new THREE.Vector4() };
            shader.uniforms.uGpuPreviewSharedScale = { value: 1 };
            shader.uniforms.uGpuPreviewGroupCount = { value: 0 };
            shader.uniforms.uGpuPreviewGroupTransforms = {
                value: Array.from({ length: gpuTransformGroupLimit }, () => new THREE.Vector4())
            };
            shader.uniforms.uGpuPreviewGroupScales = {
                value: new Float32Array(gpuTransformGroupLimit).fill(1)
            };
            shader.uniforms.uGpuPreviewGlobalTransform = { value: new THREE.Matrix4() };
            this._pointsShaderRef = shader;
            // Particle metadata may finish loading before Three.js compiles this material.
            // Re-sync now that the shader uniforms are available so the first preview frame
            // can bind the atlas without requiring a later editor interaction.
            this.syncTextureUniforms?.();
            const groupTransformSelectors = [];
            const groupScaleSelectors = [];
            const gpuAlphaTransitionLines = [
                "    if (aGpuFadeOut.x > 0.0 && previewCycleAge >= uGpuPreviewPlayTicks) {",
                "      float progress = clamp((previewCycleAge - uGpuPreviewPlayTicks) / aGpuFadeOut.x, 0.0, 1.0);",
                "      previewAlpha *= mix(aGpuFadeOut.y, aGpuFadeOut.z, progress);",
                "    } else if (aGpuFadeIn.x > 0.0) {",
                "      float progress = clamp(previewAge / aGpuFadeIn.x, 0.0, 1.0);",
                "      previewAlpha *= mix(aGpuFadeIn.y, aGpuFadeIn.z, progress);",
                "    }"
            ];
            for (let i = 0; i < gpuTransformGroupLimit; i++) {
                const groupUpperBound = (i + 1.5).toFixed(1);
                groupTransformSelectors.push(
                    `  if (uGpuPreviewGroupCount > ${i} && groupIndex < ${groupUpperBound}) return uGpuPreviewGroupTransforms[${i}];`
                );
                groupScaleSelectors.push(
                    `  if (uGpuPreviewGroupCount > ${i} && groupIndex < ${groupUpperBound}) return uGpuPreviewGroupScales[${i}];`
                );
            }
            shader.vertexShader = [
                "attribute float aSize;",
                "attribute float aAlpha;",
                "attribute vec4 aGpuMeta;",
                "attribute vec4 aGpuFadeIn;",
                "attribute vec4 aGpuFadeOut;",
                "attribute vec4 aGpuTransform;",
                "attribute vec3 aGpuTransformVector;",
                "attribute float aGpuScale;",
                "attribute vec2 aGpuLifecycle;",
                "attribute vec4 aGpuAlphaCurve;",
                "attribute vec4 aGpuScaleCurve;",
                "attribute vec2 aGpuColorCurve;",
                "uniform int uGpuPreviewEnabled;",
                "uniform float uGpuPreviewTick;",
                "uniform float uGpuPreviewPlayTicks;",
                "uniform float uGpuPreviewCycleTicks;",
                "uniform float uGpuPreviewGlobalAlpha;",
                "uniform int uGpuPreviewHasLifecycle;",
                "uniform int uGpuPreviewHasColorCurve;",
                "uniform int uGpuPreviewUseSharedTransform;",
                "uniform vec4 uGpuPreviewSharedTransform;",
                "uniform float uGpuPreviewSharedScale;",
                `uniform int uGpuPreviewGroupCount;`,
                `uniform vec4 uGpuPreviewGroupTransforms[${gpuTransformGroupLimit}];`,
                `uniform float uGpuPreviewGroupScales[${gpuTransformGroupLimit}];`,
                "uniform mat4 uGpuPreviewGlobalTransform;",
                "varying float vAlpha;",
                "varying float vFrameIndex;",
                "varying vec3 vGpuColorScale;",
                "vec3 rotateGpuVector(vec3 value, vec3 axis, float angle) {",
                "  float axisLength = length(axis);",
                "  if (axisLength < 0.0001) return value;",
                "  vec3 unitAxis = axis / axisLength;",
                "  float c = cos(angle);",
                "  float s = sin(angle);",
                "  return value * c + cross(unitAxis, value) * s + unitAxis * dot(unitAxis, value) * (1.0 - c);",
                "}",
                "vec4 resolveGpuGroupTransform(float groupIndex, vec4 fallbackValue) {",
                "  if (groupIndex < 0.5) return fallbackValue;",
                ...groupTransformSelectors,
                "  return fallbackValue;",
                "}",
                "float resolveGpuGroupScale(float groupIndex, float fallbackValue) {",
                "  if (groupIndex < 0.5) return fallbackValue;",
                ...groupScaleSelectors,
                "  return fallbackValue;",
                "}",
                "float sampleGpuScalarCurve(vec4 curve, float progress) {",
                "  float t = clamp(progress, 0.0, 1.0);",
                "  if (curve.z < -1.5) return 1.0;",
                "  if (curve.z < -0.5) return mix(curve.x, curve.y, t);",
                "  float fadeIn = clamp(curve.z, 0.0, 1.0);",
                "  float fadeOut = clamp(curve.w, fadeIn, 1.0);",
                "  if (t <= fadeIn) return fadeIn > 0.000001 ? curve.x * t / fadeIn : curve.x;",
                "  if (t <= fadeOut) return curve.x;",
                "  return fadeOut < 0.999999 ? curve.x * (1.0 - (t - fadeOut) / (1.0 - fadeOut)) : curve.x;",
                "}",
                "float linearToSrgbGpuChannel(float value) {",
                "  float c = clamp(value, 0.0, 1.0);",
                "  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 0.4166667) - 0.055;",
                "}",
                "vec3 linearToSrgbGpu(vec3 value) {",
                "  return vec3(linearToSrgbGpuChannel(value.r), linearToSrgbGpuChannel(value.g), linearToSrgbGpuChannel(value.b));",
                "}",
                "float srgbToLinearGpuChannel(float value) {",
                "  float c = clamp(value, 0.0, 1.0);",
                "  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);",
                "}",
                "vec3 srgbToLinearGpu(vec3 value) {",
                "  return vec3(srgbToLinearGpuChannel(value.r), srgbToLinearGpuChannel(value.g), srgbToLinearGpuChannel(value.b));",
                "}",
                "vec3 decodeGpuColorCurve(float packed) {",
                "  float value = floor(clamp(packed, 0.0, 1.0) * 16777215.0 + 0.5);",
                "  float red = floor(value / 65536.0);",
                "  value -= red * 65536.0;",
                "  float green = floor(value / 256.0);",
                "  float blue = value - green * 256.0;",
                "  return vec3(red, green, blue) / 255.0;",
                "}",
                ""
            ].join("\n") + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                /gl_PointSize\s*=\s*size\s*;/g,
                [
                    "float previewAlpha = clamp(aAlpha, 0.0, 1.0);",
                    "if (uGpuPreviewEnabled == 1) previewAlpha *= clamp(uGpuPreviewGlobalAlpha, 0.0, 1.0);",
                    "float previewSizeScale = 1.0;",
                    "vGpuColorScale = vec3(1.0);",
                    "float previewFrameIndex = aGpuMeta.z;",
                    "if (uGpuPreviewEnabled == 1 && abs(aGpuMeta.x) > 0.5) {",
                    "  float previewCycleAge = mod(uGpuPreviewTick, max(uGpuPreviewCycleTicks, 1.0));",
                    "  float previewBirthTick = max(aGpuMeta.y, 0.0);",
                    "  if (aGpuMeta.x < 0.0 || previewCycleAge < previewBirthTick) {",
                    "    previewAlpha = 0.0;",
                    "  } else {",
                    "    float previewAge = mod(max(previewCycleAge - previewBirthTick, 0.0), max(uGpuPreviewCycleTicks, 1.0));",
                    "    float lifecycleLifetime = max(abs(aGpuLifecycle.y), 1.0);",
                    "    float lifecycleAge = aGpuLifecycle.x;",
                    "    if (aGpuLifecycle.y > 0.0 && uGpuPreviewHasLifecycle == 1) {",
                    "      lifecycleAge = clamp(aGpuLifecycle.x + previewAge, 0.0, lifecycleLifetime);",
                    "    }",
                    "    float lifecycleProgress = clamp(lifecycleAge / lifecycleLifetime, 0.0, 1.0);",
                    "    previewAlpha *= sampleGpuScalarCurve(aGpuAlphaCurve, lifecycleProgress);",
                    "    previewSizeScale = sampleGpuScalarCurve(aGpuScaleCurve, lifecycleProgress);",
                    "    if (uGpuPreviewHasColorCurve == 1) {",
                    "      vec3 gpuColorCurve = mix(",
                    "        decodeGpuColorCurve(aGpuColorCurve.x),",
                    "        decodeGpuColorCurve(aGpuColorCurve.y),",
                    "        lifecycleProgress",
                    "      );",
                    "      vec3 gpuBaseColor = clamp(color, 0.0, 1.0);",
                    "      vec3 gpuCurvedColor = srgbToLinearGpu(linearToSrgbGpu(gpuBaseColor) * gpuColorCurve);",
                    "      vGpuColorScale = gpuCurvedColor / max(gpuBaseColor, vec3(0.000001));",
                    "    }",
                    ...gpuAlphaTransitionLines,
                    "    if (aGpuMeta.w > 0.5 && aGpuFadeIn.w > 0.5) {",
                    "      float randomValue = fract(sin(aGpuFadeIn.w + floor(uGpuPreviewTick) * 12.9898) * 43758.5453);",
                    "      previewFrameIndex = aGpuMeta.z + floor(randomValue * aGpuMeta.w);",
                    "    } else if (aGpuMeta.w > 0.5) {",
                    "      float textureProgress = clamp(lifecycleAge / lifecycleLifetime, 0.0, 1.0);",
                    "      previewFrameIndex = aGpuMeta.z + min(aGpuMeta.w - 1.0, floor(textureProgress * aGpuMeta.w));",
                    "    }",
                    "  }",
                    "}",
                    "gl_PointSize = previewAlpha > 0.0001 ? size * max(aSize * previewSizeScale, 0.05) : 0.0;",
                    "vAlpha = previewAlpha;",
                    "vFrameIndex = previewFrameIndex;"
                ].join("\n    ")
            );
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                [
                    "#include <begin_vertex>",
                    "if (uGpuPreviewEnabled == 1 && aGpuMeta.x > 0.5) {",
                    "  float gpuTransformGroup = aGpuFadeOut.w;",
                    "  if (gpuTransformGroup < -0.5) {",
                    "    transformed = aGpuTransformVector;",
                    "  } else {",
                    "    vec4 gpuTransform = uGpuPreviewUseSharedTransform == 1",
                    "      ? uGpuPreviewSharedTransform",
                    "      : resolveGpuGroupTransform(gpuTransformGroup, aGpuTransform);",
                    "    float gpuScale = uGpuPreviewUseSharedTransform == 1",
                    "      ? uGpuPreviewSharedScale",
                    "      : resolveGpuGroupScale(gpuTransformGroup, aGpuScale);",
                    "    vec3 gpuAnchor = transformed - aGpuTransformVector;",
                    "    vec3 transformedGpuLocal = aGpuTransformVector * max(gpuScale, 0.0001);",
                    "    if (abs(gpuTransform.w) > 0.000001) {",
                    "      transformedGpuLocal = rotateGpuVector(transformedGpuLocal, gpuTransform.xyz, gpuTransform.w);",
                    "    }",
                    "    vec3 transformedGpuAnchor = (uGpuPreviewGlobalTransform * vec4(gpuAnchor, 1.0)).xyz;",
                    "    transformed = transformedGpuAnchor + transformedGpuLocal;",
                    "  }",
                    "}"
                ].join("\n    ")
            );
            shader.fragmentShader = [
                "uniform sampler2D uAtlas;",
                "uniform int uFrameCount;",
                "uniform int uUseTexture;",
                "varying float vAlpha;",
                "varying float vFrameIndex;",
                "varying vec3 vGpuColorScale;",
                ""
            ].join("\n") + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                /vec4\s+diffuseColor\s*=\s*vec4\(\s*diffuse\s*,\s*opacity\s*\)\s*;/g,
                [
                    "if (vAlpha <= 0.0001) discard;",
                    "vec4 diffuseColor;",
                    "if (uUseTexture == 1 && uFrameCount > 0) {",
                    "  float fc = float(uFrameCount);",
                    "  float fi = clamp(floor(vFrameIndex + 0.5), 0.0, fc - 1.0);",
                    "  vec2 uv = gl_PointCoord;",
                    "  float pad = 0.5 / (fc * 64.0);",
                    "  uv.x = (fi + clamp(uv.x, 0.01, 0.99)) / fc;",
                    "  uv.x = clamp(uv.x, fi / fc + pad, (fi + 1.0) / fc - pad);",
                    "  vec4 texel = texture2D(uAtlas, uv);",
                    "  if (texel.a < 0.02) discard;",
                    "  vec3 texColor = clamp(texel.rgb / max(texel.a, 0.0001), 0.0, 1.0);",
                    "  diffuseColor = vec4(diffuse * vGpuColorScale * texColor, opacity * clamp(vAlpha, 0.0, 1.0) * texel.a);",
                    "} else {",
                    "  diffuseColor = vec4( diffuse * vGpuColorScale, opacity * clamp(vAlpha, 0.0, 1.0) );",
                    "}"
                ].join("\n")
            );
            this.syncPreviewGpuParticleUniforms?.();
        };
        this.pointsMat.customProgramCacheKey = () => "cb_points_size_alpha_tex_gpu_v18";
        this.pointsMesh = new THREE.Points(this.pointsGeom, this.pointsMat);
        this.pointsMesh.frustumCulled = false;
        this.scene.add(this.pointsMesh);

        this.applyTheme();
        this.axes.visible = this.state.settings.showAxes;
        this.grid.visible = this.state.settings.showGrid;

        this.bindPreviewSelectionEvents();
        this.previewDistanceTool = createPreviewDistanceTool({
            title: "Composition 测距",
            canvas: this.renderer.domElement,
            showToast: (message, type) => this.showToast(message, type),
            resolvePointFromEvent: (ev) => this.resolvePreviewDistancePointFromEvent(ev),
            projectPointToClient: (point) => this.worldToClient(point),
            attachContextMenu: true,
            isBlocked: () => !!this.selectState
        });

        const animate = () => {
            requestAnimationFrame(animate);
            const frameNow = performance.now();
            const controlsChanged = this.controls.update();
            if (this.adaptiveGrid) this.adaptiveGrid.update();
            if (controlsChanged) this.previewSceneDirty = true;
            if (!this.previewPaused) this.updatePreviewAnimation();
            this.updatePreviewFps(frameNow);
            const hasPreviewPoints = !!this.previewBasePoints?.length;
            const hasRenderablePreview = hasPreviewPoints
                && (this.previewGpuParticlePathEnabled !== true || this.previewGpuActivePointCount > 0);
            const previewAnimating = !this.previewPaused && hasRenderablePreview;
            if (!this.previewBuildInProgress && (previewAnimating || this.previewSceneDirty || controlsChanged)) {
                this.renderer.render(this.scene, this.camera);
                this.previewSceneDirty = false;
            }
        };
        animate();
    }

    bindPreviewSelectionEvents() {
        const canvas = this.renderer?.domElement;
        if (!canvas) return;
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        canvas.addEventListener("pointerdown", (e) => this.onPreviewPointerDown(e), true);
        canvas.addEventListener("pointermove", (e) => this.onPreviewPointerMove(e), true);
        canvas.addEventListener("pointerup", (e) => this.onPreviewPointerUp(e), true);
        canvas.addEventListener("pointercancel", (e) => this.onPreviewPointerCancel(e), true);
    }

    applySettingsToDom() {
        const s = this.state.settings;
        this.dom.inpParamStep.value = String(s.paramStep);
        this.dom.inpPointSize.value = String(s.pointSize);
        if (this.dom.chkPreviewRenderCache) this.dom.chkPreviewRenderCache.checked = s.previewRenderCacheEnabled !== false;
        if (this.dom.inpPreviewCacheWorkers) this.dom.inpPreviewCacheWorkers.value = String(s.previewCacheWorkerCount || 0);
        this.dom.themeSelect.value = s.theme;
        this.dom.chkAxes.checked = !!s.showAxes;
        this.dom.chkGrid.checked = !!s.showGrid;
        this.dom.chkPreviewFocusSingleCard.checked = !!s.previewFocusSingleCard;
        if (this.dom.chkRealtimeCode) this.dom.chkRealtimeCode.checked = !!s.realtimeCode;
        this.dom.chkRealtimeCode2.checked = !!s.realtimeCode;
        this.state.settings.leftPanelTab = "cards";
        this.applySplitSizesFromSettings();
        this.applyTheme();
    }

    applyTheme() {
        /*
         * 全局主题优先于项目文件中的旧值。主题属于当前设备偏好，不属于 Composition；
         * 按项目保存会导致各工具外观不一致。旧项目仍可通过后备逻辑初始化全局主题。
         */
        let stored = "";
        try {
            stored = window.localStorage.getItem(APP_THEME_KEY) || "";
        } catch {
            stored = "";
        }
        const theme = normalizeWorkbenchTheme(stored || this.state.settings.theme);
        this.state.settings.theme = theme;
        if (!stored) writeAppTheme(theme);
        document.body.setAttribute("data-theme", theme);
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: "coo-legacy-theme", theme }, window.location.origin);
            }
        } catch {
            // 跨域父页面无法接收该提示，直接忽略。
        }
        if (this.dom?.themeSelect && this.dom.themeSelect.value !== theme) this.dom.themeSelect.value = theme;
        const styles = getComputedStyle(document.body);
        const gridColor = styles.getPropertyValue("--grid-color").trim() || "#617d9b";
        const previewSceneColor = styles.getPropertyValue("--wb-preview-scene").trim() || "#0b1017";

        if (this.scene) this.scene.background = new THREE.Color(previewSceneColor);
        if (this.renderer) this.renderer.setClearColor(previewSceneColor, 1);

        if (this.adaptiveGrid) this.adaptiveGrid.setColor(gridColor);
        if (this.grid) this.grid.visible = this.state.settings.showGrid;
        if (this.axes) this.axes.visible = this.state.settings.showAxes;
        this.rebuildPreview();
    }

    switchPage(page) {
        const isCode = page === "code";
        this.dom.pageEditor.classList.toggle("hidden", isCode);
        this.dom.pageCode.classList.toggle("hidden", !isCode);
        this.dom.btnPageEditor.classList.toggle("primary", !isCode);
        this.dom.btnPageCode.classList.toggle("primary", isCode);
        if (!isCode) this.onResize();
    }

    setEditorWorkspaceView(view) {
        const showProject = view === "project";
        this.editorWorkspaceView = showProject ? "project" : "cards";
        this.dom.projectSection?.classList.toggle("hidden", !showProject);
        this.dom.cardsRoot?.classList.toggle("hidden", showProject);
        this.dom.btnProjectEditorTab?.classList.toggle("active", showProject);
        this.dom.btnCardEditorTab?.classList.toggle("active", !showProject);
        this.dom.btnProjectEditorTab?.setAttribute("aria-selected", String(showProject));
        this.dom.btnCardEditorTab?.setAttribute("aria-selected", String(!showProject));
        this.dom.btnProjectEditorTab?.setAttribute("tabindex", showProject ? "0" : "-1");
        this.dom.btnCardEditorTab?.setAttribute("tabindex", showProject ? "-1" : "0");
        this.dom.projectSection?.setAttribute("aria-hidden", String(!showProject));
        this.dom.cardsRoot?.setAttribute("aria-hidden", String(showProject));
        requestAnimationFrame(() => this.onResize());
    }

    onEditorWorkspaceTabKeydown(event) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextView = event.key === "ArrowLeft" || event.key === "Home" ? "project" : "cards";
        this.setEditorWorkspaceView(nextView);
        const target = nextView === "project" ? this.dom.btnProjectEditorTab : this.dom.btnCardEditorTab;
        target?.focus();
    }

    showSettings() {
        this.dom.settingsModal.classList.remove("hidden");
        this.dom.settingsMask.classList.remove("hidden");
    }

    hideSettings() {
        this.dom.settingsModal.classList.add("hidden");
        this.dom.settingsMask.classList.add("hidden");
    }

    showHotkeys() {
        this.dom.hkSearch.value = "";
        this.renderHotkeysList();
        this.dom.hkModal.classList.remove("hidden");
        this.dom.hkMask.classList.remove("hidden");
        this.dom.hkSearch.focus();
    }

    hideHotkeys() {
        this.hotkeyCaptureActionId = "";
        if (this.dom?.hkHint) {
            this.dom.hkHint.textContent = "点击“设置”后按下按键（Esc 取消，Backspace 清空）。";
        }
        this.dom.hkModal.classList.add("hidden");
        this.dom.hkMask.classList.add("hidden");
    }

    showCardPresetModal(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (this.dom.cardPresetContext) {
            this.dom.cardPresetContext.textContent = `当前卡片：${card.name || "未命名卡片"}`;
        }
        this.dom.cardPresetModal?.classList.remove("hidden");
        this.dom.cardPresetMask?.classList.remove("hidden");
        this.dom.btnCloseCardPreset?.focus();
    }

    hideCardPresetModal() {
        this.dom.cardPresetModal?.classList.add("hidden");
        this.dom.cardPresetMask?.classList.add("hidden");
    }

    showNodePresetModal(cardId, rawTreePath) {
        const card = this.getCardById(cardId);
        if (!card) return;
        let treePath = [];
        try {
            const parsed = JSON.parse(rawTreePath || "[]");
            if (Array.isArray(parsed)) treePath = parsed;
        } catch (_error) {
            return;
        }
        const node = this.getShapeNodeByPath(card, treePath);
        if (!node) return;
        if (this.dom.nodePresetContext) {
            this.dom.nodePresetContext.textContent = `当前子节点：${node.name || "未命名子节点"}`;
        }
        this.dom.nodePresetModal?.classList.remove("hidden");
        this.dom.nodePresetMask?.classList.remove("hidden");
        this.dom.btnCloseNodePreset?.focus();
    }

    hideNodePresetModal() {
        this.dom.nodePresetModal?.classList.add("hidden");
        this.dom.nodePresetMask?.classList.add("hidden");
    }

    askThemeConfirm(options = {}) {
        const d = this.dom;
        const config = options && typeof options === "object"
            ? options
            : { title: options, message: arguments[1] };
        const title = String(config.title || "请确认");
        const message = String(config.message || "确认执行该操作？");
        const okText = String(config.okText || "确定");
        const cancelText = String(config.cancelText || "取消");
        const danger = !!config.danger;

        if (typeof this.confirmResolver === "function") {
            this.resolveThemeConfirm(false);
        }

        d.confirmTitle.textContent = title;
        d.confirmMessage.textContent = message;
        if (d.btnCancelConfirmModal) d.btnCancelConfirmModal.textContent = cancelText;
        if (d.btnOkConfirmModal) {
            d.btnOkConfirmModal.textContent = okText;
            d.btnOkConfirmModal.classList.toggle("danger", danger);
            d.btnOkConfirmModal.classList.toggle("primary", !danger);
        }
        d.confirmModal.classList.remove("hidden");
        d.confirmMask.classList.remove("hidden");

        if (this.confirmKeydownHandler) {
            document.removeEventListener("keydown", this.confirmKeydownHandler, true);
            this.confirmKeydownHandler = null;
        }
        this.confirmKeydownHandler = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                this.resolveThemeConfirm(false);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                this.resolveThemeConfirm(true);
            }
        };
        document.addEventListener("keydown", this.confirmKeydownHandler, true);

        requestAnimationFrame(() => {
            try {
                d.btnOkConfirmModal.focus();
            } catch {
            }
        });

        return new Promise((resolve) => {
            this.confirmResolver = resolve;
        });
    }

    showThemeConfirm(title, message) {
        return this.askThemeConfirm({ title, message });
    }

    resolveThemeConfirm(accepted) {
        const resolve = this.confirmResolver;
        this.confirmResolver = null;
        if (this.confirmKeydownHandler) {
            document.removeEventListener("keydown", this.confirmKeydownHandler, true);
            this.confirmKeydownHandler = null;
        }
        this.dom?.confirmModal?.classList.add("hidden");
        this.dom?.confirmMask?.classList.add("hidden");
        if (typeof resolve === "function") resolve(!!accepted);
    }

    renderHotkeysList() {
        const q = String(this.dom.hkSearch.value || "").trim().toLowerCase();
        const section = document.createElement("div");
        section.className = "hk-section";
        section.innerHTML = `<div class="hk-section-title">动作快捷键</div>`;

        for (const def of HOTKEY_ACTION_DEFS) {
            const key = this.state.hotkeys.actions[def.id] || "";
            const hay = `${def.title} ${def.desc} ${hotkeyToHuman(key)}`.toLowerCase();
            if (q && !hay.includes(q)) continue;
            const row = document.createElement("div");
            row.className = "hk-row";
            row.innerHTML = `
                <div class="hk-name">
                    <div class="t">${esc(def.title)}</div>
                    <div class="d">${esc(def.desc)}</div>
                </div>
                <div class="hk-key ${key ? "" : "empty"}">${esc(hotkeyToHuman(key) || "未设置")}</div>
                <div class="preview-actions">
                    <button class="btn small primary" data-act="set-hk" data-hk-id="${def.id}">设置</button>
                    <button class="btn small" data-act="clear-hk" data-hk-id="${def.id}">清空</button>
                </div>
            `;
            section.appendChild(row);
        }
        this.dom.hkList.innerHTML = "";
        this.dom.hkList.appendChild(section);
    }

    onHotkeyListClick(e) {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const id = btn.dataset.hkId;
        if (!id) return;
        if (act === "set-hk") {
            this.hotkeyCaptureActionId = id;
            const def = HOTKEY_ACTION_DEFS.find((it) => it.id === id);
            this.dom.hkHint.textContent = `正在设置：${def ? def.title : id}（Esc 取消，Backspace 清空）`;
            return;
        }
        if (act === "clear-hk") {
            this.pushHistory();
            this.state.hotkeys.actions[id] = "";
            this.renderHotkeysList();
            this.scheduleSave();
        }
    }

    resetHotkeys() {
        if (!confirm("确定恢复默认快捷键？")) return;
        this.pushHistory();
        this.state.hotkeys = deepClone(DEFAULT_HOTKEYS);
        this.renderHotkeysList();
        this.scheduleSave();
        this.showToast("已恢复默认快捷键", "success");
    }

    setRealtimeCode(v) {
        this.state.settings.realtimeCode = !!v;
        if (this.dom.chkRealtimeCode) this.dom.chkRealtimeCode.checked = !!v;
        this.dom.chkRealtimeCode2.checked = !!v;
        if (v) this.generateCodeAndRender(true);
        this.scheduleSave();
    }

    readExportedSignature() {
        try {
            return String(localStorage.getItem(EXPORTED_SIG_KEY) || "");
        } catch {
            return "";
        }
    }

    writeExportedSignature(sig) {
        const next = String(sig || "");
        this.lastExportedStateSig = next;
        try {
            if (!next) localStorage.removeItem(EXPORTED_SIG_KEY);
            else localStorage.setItem(EXPORTED_SIG_KEY, next);
        } catch {
        }
    }

    captureUserPreferences(stateLike = null) {
        return extractCompositionPreferences(stateLike || this.state || {});
    }

    applyUserPreferences(stateLike, prefLike = null) {
        return applyCompositionPreferences(
            stateLike || {},
            prefLike || this.captureUserPreferences()
        );
    }

    extractProjectState(stateLike = null) {
        return extractCompositionProjectState(stateLike || this.state || {});
    }

    computeStateSignature(stateLike = null) {
        const target = this.extractProjectState(stateLike || this.state);
        try {
            return JSON.stringify(target || {});
        } catch {
            return String(Date.now());
        }
    }

    isProjectDirtyForExport() {
        const cur = this.computeStateSignature(this.state);
        return !this.lastExportedStateSig || this.lastExportedStateSig !== cur;
    }

    refreshPauseButtonUi() {
        if (!this.dom?.btnPausePreview) return;
        this.dom.btnPausePreview.textContent = this.previewPaused ? "继续" : "暂停";
        this.dom.btnPausePreview.classList.toggle("primary", !!this.previewPaused);
    }

    setPreviewPaused(paused, opts = {}) {
        const wasPaused = !!this.previewPaused;
        this.previewPaused = !!paused;
        if (!this.previewPaused) {
            if (!wasPaused || opts.restartTimeline === true) {
                this.previewAnimStart = performance.now();
            }
            this.previewPerfLastTs = 0;
        }
        this.refreshPauseButtonUi();
    }

    togglePreviewPause() {
        if (this.previewPaused) {
            this.previewAutoPaused = false;
            this.previewWasPlayingBeforeAutoPause = false;
            this.setPreviewPaused(false);
            return;
        }
        this.setPreviewPaused(true, { keepTimeline: true });
    }

    autoPausePreviewByPageState() {
        if (this.previewPaused) return;
        this.previewWasPlayingBeforeAutoPause = true;
        this.previewAutoPaused = true;
        this.setPreviewPaused(true, { keepTimeline: true });
    }

    autoResumePreviewByPageState() {
        if (!this.previewAutoPaused) return;
        if (this.previewWasPlayingBeforeAutoPause) {
            this.previewAutoPaused = false;
            this.previewWasPlayingBeforeAutoPause = false;
            this.setPreviewPaused(false);
            return;
        }
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
    }

    async handleNewProjectClick() {
        const dirty = this.isProjectDirtyForExport();
        if (dirty) {
            const discard = await this.askThemeConfirm({
                title: "新建合成项目",
                message: "新建项目会替换当前合成内容，确定继续吗？",
                okText: "继续新建",
                cancelText: "继续编辑",
                danger: true
            });
            if (!discard) return;
        }

        this.pushHistory();
        const prefs = this.captureUserPreferences(this.state);
        this.state = this.applyUserPreferences(createDefaultState(), prefs);
        this.state.projectName = "NewComposition";
        this.state.globalVars = [];
        this.state.globalConsts = [];
        if (!Array.isArray(this.state.cards) || !this.state.cards.length) {
            this.state.cards = [createDefaultCard(0)];
        }
        const firstCard = this.state.cards[0];
        if (firstCard) {
            firstCard.particleInit = [];
            firstCard.controllerVars = [];
            firstCard.controllerActions = [];
            firstCard.controllerInitScript = "";
            firstCard.controllerTickScript = "";
        }
        this.state = normalizeStateShape(this.state);
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.undoStack = [];
        this.redoStack = [];
        this.armedHistorySnapshot = null;
        this.focusedCardId = this.state.cards[0]?.id || null;
        this.selectedCardIds = new Set(this.focusedCardId ? [this.focusedCardId] : []);
        this.writeExportedSignature("");
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
        this.setPreviewPaused(false, { restartTimeline: true });
        this.applySettingsToDom();
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.scheduleSave();
        this.showToast("已新建合成项目", "success");
    }

    async onProjectClick(e) {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const idx = int(btn.dataset.idx);
        if (act === "open-project-bezier-tool") {
            this.openBezierTool("project");
            return;
        }
        if (act === "copy-project-bezier-params") {
            await this.copyScaleBezierParams("project");
            return;
        }
        if (act === "paste-project-bezier-params") {
            await this.pasteScaleBezierParams("project");
            return;
        }
        if (act === "apply-project-axis-manual") {
            this.pushHistory();
            this.state.compositionAxisExpr = formatVectorLiteral(
                this.state.compositionAxisManualCtor,
                this.state.compositionAxisManualX,
                this.state.compositionAxisManualY,
                this.state.compositionAxisManualZ
            );
            this.state.compositionAxisPreset = "";
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: true });
            return;
        }
        if (act === "apply-display-manual-to") {
            const item = this.state.displayActions[idx];
            if (!item) return;
            this.pushHistory();
            item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
            item.toPreset = "";
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: true });
            return;
        }
        this.pushHistory();
        switch (act) {
            case "add-global-var":
                this.state.globalVars.push(normalizeGlobalVar({ name: "value" + (this.state.globalVars.length + 1), type: "Double", value: "0.0", codec: true, mutable: true }));
                break;
            case "remove-global-var":
                if (idx >= 0 && idx < this.state.globalVars.length) this.state.globalVars.splice(idx, 1);
                break;
            case "add-global-const":
                this.state.globalConsts.push(normalizeGlobalConst({ name: "const" + (this.state.globalConsts.length + 1), type: "Int", value: "0" }));
                break;
            case "remove-global-const":
                if (idx >= 0 && idx < this.state.globalConsts.length) this.state.globalConsts.splice(idx, 1);
                break;
            case "add-comp-animate":
                this.state.compositionAnimates.push(normalizeAnimate({ count: 1, condition: "" }));
                break;
            case "remove-comp-animate":
                if (idx >= 0 && idx < this.state.compositionAnimates.length) this.state.compositionAnimates.splice(idx, 1);
                break;
            case "add-display-action":
                this.state.displayActions.push(normalizeDisplayAction({}));
                break;
            case "remove-display-action":
                if (idx >= 0 && idx < this.state.displayActions.length) this.state.displayActions.splice(idx, 1);
                break;
            default:
                return;
        }
        const rebuildPreview = act === "add-comp-animate" || act === "remove-comp-animate";
        this.afterStructureMutate({ rerenderProject: true, rerenderCards: false, rebuildPreview });
    }

    onProjectInput(e) {
        const t = e.target;
        if (!t) return;
        if (t.dataset.pf) {
            const pf = String(t.dataset.pf || "");
            this.applyProjectFieldInput(pf, t);
            if (pf === "useCParticle") return;
            const rebuildPreview = pf === "disabledInterval" || pf === "previewPlayTicks" || pf === "compositionType";
            this.afterValueMutate({ rebuildPreview });
            return;
        }
        if (t.dataset.projectScaleField) {
            this.applyProjectScaleField(t.dataset.projectScaleField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: ["type", "runMode"].includes(t.dataset.projectScaleField) });
            return;
        }
        if (t.dataset.projectAlphaField) {
            this.applyProjectAlphaField(t.dataset.projectAlphaField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: ["type", "runMode"].includes(t.dataset.projectAlphaField) });
            return;
        }
        if (t.dataset.axisField) {
            this.applyProjectAxisField(t.dataset.axisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.axisField);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: rerender });
            return;
        }
        if (t.dataset.varVecIdx !== undefined) {
            const item = this.state.globalVars[int(t.dataset.varVecIdx)];
            if (!item) return;
            this.updateGlobalVarVectorValue(item, t.dataset.varVecAxis, t.value);
            this.syncGlobalVarInlineInputs(t.dataset.varVecIdx, item);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false });
            return;
        }
        if (t.dataset.varColorIdx !== undefined) {
            const item = this.state.globalVars[int(t.dataset.varColorIdx)];
            if (!item) return;
            this.updateGlobalVarColorValue(item, t.value);
            this.syncGlobalVarInlineInputs(t.dataset.varColorIdx, item);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false });
            return;
        }
        if (t.dataset.varIdx !== undefined) {
            const item = this.state.globalVars[int(t.dataset.varIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.varField, t);
            if (t.dataset.varField === "type") {
                this.ensureGlobalVarValueShape(item);
            }
            const field = String(t.dataset.varField || "");
            const rebuildPreview = ["name", "type", "value"].includes(field);
            this.afterValueMutate({ rebuildPreview, rerenderCards: field === "name" || field === "type" });
            return;
        }
        if (t.dataset.constIdx !== undefined) {
            const item = this.state.globalConsts[int(t.dataset.constIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.constField, t);
            if (t.dataset.constField === "type") {
                this.ensureGlobalConstValueShape(item);
            }
            const field = String(t.dataset.constField || "");
            const rebuildPreview = ["name", "type", "value"].includes(field);
            this.afterValueMutate({ rebuildPreview, rerenderCards: field === "name" || field === "type" });
            return;
        }
        if (t.dataset.compAnimateIdx !== undefined) {
            const item = this.state.compositionAnimates[int(t.dataset.compAnimateIdx)];
            if (!item) return;
            this.applyAnimateField(item, t.dataset.compAnimateField, t);
            // 生长条件直接决定 Sequenced GPU 的解锁 tick，必须重建元数据。
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }
        if (t.dataset.displayIdx !== undefined) {
            const item = this.state.displayActions[int(t.dataset.displayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.displayField, t);
            if (this.queueCodeEditorRefresh(t, { rebuildPreview: true })) return;
            if (["type", "angleMode", "toPreset"].includes(t.dataset.displayField)) {
                this.afterStructureMutate({ rerenderProject: true, rerenderCards: false, rebuildPreview: true });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
        }
    }

    onProjectChange(e) {
        if (this.armedHistorySnapshot) {
            this.pushHistory(this.armedHistorySnapshot);
            this.armedHistorySnapshot = null;
        }
        const t = e.target;
        if (!t) return;
        if (this.flushCodeEditorRefresh(t)) return;
        if (this.flushDeferredExpressionRefresh(t, { forceImmediate: true })) return;
        if (this.commitGlobalSymbolNameOnBlur(t)) return;
        if (t.dataset.projectScaleField) {
            // 兼容只对 <select> 派发 "change" 的环境。
            this.applyProjectScaleField(t.dataset.projectScaleField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: ["type", "runMode"].includes(t.dataset.projectScaleField) });
            return;
        }
        if (t.dataset.projectAlphaField) {
            // 兼容只对 <select> 派发 "change" 的环境。
            this.applyProjectAlphaField(t.dataset.projectAlphaField, t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: ["type", "runMode"].includes(t.dataset.projectAlphaField) });
            return;
        }
        if (t.dataset.axisField) {
            this.applyProjectAxisField(t.dataset.axisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.axisField);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: rerender });
            return;
        }
        if (t.dataset.pf === "compositionType") {
            this.applyProjectFieldInput("compositionType", t);
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: true });
            return;
        }
        if (t.matches("select,input[type='checkbox']")) {
            // 兼容只派发 "change"、不派发 "input" 的控件。
            this.onProjectInput(e);
            this.renderProjectSection();
        }
    }

    applyProjectFieldInput(field, target) {
        if (field === "projectName") {
            this.state.projectName = String(target.value || "");
            return;
        }
        if (field === "packageName") {
            this.state.packageName = normalizeKotlinPackageName(target.value, "cn.coostack.compositions");
            if (target && document.activeElement !== target) target.value = this.state.packageName;
            return;
        }
        if (field === "mapping") {
            this.state.mapping = normalizeCompositionMapping(target.value);
            return;
        }
        if (field === "enableRemoveStatusOverride") {
            this.state.enableRemoveStatusOverride = target?.checked === true;
            return;
        }
        if (field === "compositionType") {
            this.state.compositionType = target.value === "sequenced" ? "sequenced" : "particle";
            return;
        }
        if (field === "useCParticle") {
            this.setGlobalCParticleMode(target?.checked === true);
            return;
        }
        if (field === "disabledInterval") {
            this.state.disabledInterval = Math.max(0, int(target.value || 0));
            return;
        }
        if (field === "previewPlayTicks") {
            this.state.previewPlayTicks = Math.max(1, int(target.value || 70));
        }
    }

    showCParticleConflict(title, message) {
        if (typeof this.showThemeConfirm === "function") {
            this.showThemeConfirm(title, message);
        } else {
            this.showToast(message, "error");
        }
    }

    resolveLoadedCParticleConflicts() {
        return "";
    }

    setGlobalCParticleMode(enabled) {
        const nextEnabled = enabled === true;
        if (this.state.useCParticle === nextEnabled) return false;
        this.state.useCParticle = nextEnabled;
        this.state = normalizeStateShape(this.state);
        this.afterStructureMutate({ rerenderProject: true, rerenderCards: true, rebuildPreview: true });
        return true;
    }

    setCardCParticleMode(card, enabled) {
        if (!card) return false;
        const nextEnabled = enabled === true;
        if (!isCompositionShapeType(card.dataType)) {
            card.particleBackend = nextEnabled ? "cparticle" : "single";
            card.globalCParticleAuto = false;
            return true;
        }
        card.useCParticle = nextEnabled;
        return true;
    }

    findDuplicateGlobalSymbolName(name, scopeKind = "", scopeIndex = -1) {
        const pick = String(name || "").trim();
        if (!pick) return null;
        for (let i = 0; i < this.state.globalVars.length; i++) {
            if (scopeKind === "var" && i === scopeIndex) continue;
            if (String(this.state.globalVars[i]?.name || "").trim() === pick) {
                return { kind: "var", index: i };
            }
        }
        for (let i = 0; i < this.state.globalConsts.length; i++) {
            if (scopeKind === "const" && i === scopeIndex) continue;
            if (String(this.state.globalConsts[i]?.name || "").trim() === pick) {
                return { kind: "const", index: i };
            }
        }
        return null;
    }

    makeUniqueGlobalSymbolName(baseName, scopeKind = "", scopeIndex = -1) {
        const seed = normalizeKotlinSymbolName(baseName, scopeKind === "const" ? "constant" : "value");
        let out = seed;
        let i = 2;
        while (this.findDuplicateGlobalSymbolName(out, scopeKind, scopeIndex)) {
            out = String(seed) + "_" + String(i);
            i += 1;
            if (i > 999) break;
        }
        return out;
    }

    commitGlobalSymbolNameOnBlur(target) {
        const isVar = target?.dataset?.varField === "name" && target?.dataset?.varIdx !== undefined;
        const isConst = target?.dataset?.constField === "name" && target?.dataset?.constIdx !== undefined;
        if (!isVar && !isConst) return false;

        const kind = isVar ? "var" : "const";
        const index = int(isVar ? target.dataset.varIdx : target.dataset.constIdx);
        const list = isVar ? this.state.globalVars : this.state.globalConsts;
        const item = list[index];
        if (!item) return false;

        const fallback = kind === "const" ? "constant" : "value";
        const before = String(target.dataset.prevSymbolName || item.name || "");
        const beforeNorm = normalizeKotlinSymbolName(before, fallback);
        const raw = String(item.name || target.value || "");
        const normalized = normalizeKotlinSymbolName(raw, fallback);

        const duplicate = this.findDuplicateGlobalSymbolName(normalized, kind, index);
        if (duplicate) {
            const restore = this.findDuplicateGlobalSymbolName(beforeNorm, kind, index)
                ? this.makeUniqueGlobalSymbolName(beforeNorm, kind, index)
                : beforeNorm;
            item.name = restore;
            target.value = restore;
            target.dataset.prevSymbolName = restore;
            this.showToast(`名称“${normalized}”已存在，已拒绝重复命名`, "error");
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false, rerenderCards: true });
            return true;
        }

        if (normalized !== raw || !isKotlinIdentifier(raw)) {
            item.name = normalized;
            target.value = normalized;
            target.dataset.prevSymbolName = normalized;
            this.showToast("变量名已自动改为 Kotlin 合法标识符", "info");
            this.afterValueMutate({ rebuildPreview: true, rerenderProject: false, rerenderCards: true });
            return true;
        }

        target.dataset.prevSymbolName = normalized;
        return false;
    }

    syncProjectAxisManualFromExpr() {
        const expr = String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        this.state.compositionAxisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, this.state.compositionAxisManualCtor || "RelativeLocation"));
        this.state.compositionAxisManualX = num(vec.x);
        this.state.compositionAxisManualY = num(vec.y);
        this.state.compositionAxisManualZ = num(vec.z);
    }

    applyProjectAxisField(field, target) {
        if (field === "axisPreset") {
            this.state.compositionAxisPreset = String(target.value || "");
            if (this.state.compositionAxisPreset) {
                this.state.compositionAxisExpr = this.state.compositionAxisPreset;
                this.syncProjectAxisManualFromExpr();
            }
            return;
        }
        if (field === "axisExpr") {
            this.state.compositionAxisExpr = String(target.value || "");
            this.state.compositionAxisPreset = "";
            this.syncProjectAxisManualFromExpr();
            return;
        }
        if (field === "axisManualCtor") {
            this.state.compositionAxisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            this.state.compositionAxisExpr = formatVectorLiteral(
                this.state.compositionAxisManualCtor,
                this.state.compositionAxisManualX,
                this.state.compositionAxisManualY,
                this.state.compositionAxisManualZ
            );
            this.state.compositionAxisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") this.state.compositionAxisManualX = num(target.value);
            else if (field === "axisManualY") this.state.compositionAxisManualY = num(target.value);
            else this.state.compositionAxisManualZ = num(target.value);
            this.state.compositionAxisExpr = formatVectorLiteral(
                this.state.compositionAxisManualCtor,
                this.state.compositionAxisManualX,
                this.state.compositionAxisManualY,
                this.state.compositionAxisManualZ
            );
            this.state.compositionAxisPreset = "";
        }
    }

    applyProjectScaleField(field, target) {
        const scale = Object.assign({}, normalizeScaleHelperConfig(this.state.projectScale, { type: "none" }));
        this.state.projectScale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "runMode") {
            const next = String(target.value || "auto");
            scale.runMode = SCALE_HELPER_RUN_MODES.includes(next) ? next : "auto";
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    applyProjectAlphaField(field, target) {
        const alpha = Object.assign({}, normalizeAlphaHelperConfig(this.state.projectAlpha, { type: "none" }));
        this.state.projectAlpha = alpha;
        if (field === "type") {
            const next = String(target.value || "none");
            alpha.type = ALPHA_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "runMode") {
            const next = String(target.value || "auto");
            alpha.runMode = ALPHA_HELPER_RUN_MODES.includes(next) ? next : "auto";
            return;
        }
        if (field === "startMax") {
            alpha.startMax = !!target.checked;
            return;
        }
        if (field === "decreaseOnDisable") {
            alpha.decreaseOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            alpha.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (field === "min" || field === "max") {
            alpha[field] = num(target.value);
        }
    }

    syncCardShapeAxisManualFromExpr(card) {
        if (!card) return;
        const expr = String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        card.shapeAxisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, card.shapeAxisManualCtor || "RelativeLocation"));
        card.shapeAxisManualX = num(vec.x);
        card.shapeAxisManualY = num(vec.y);
        card.shapeAxisManualZ = num(vec.z);
    }

    applyCardShapeAxisField(card, field, target) {
        if (!card) return;
        if (field === "axisPreset") {
            card.shapeAxisPreset = String(target.value || "");
            if (card.shapeAxisPreset) {
                card.shapeAxisExpr = card.shapeAxisPreset;
                this.syncCardShapeAxisManualFromExpr(card);
            }
            return;
        }
        if (field === "axisExpr") {
            card.shapeAxisExpr = String(target.value || "");
            card.shapeAxisPreset = "";
            this.syncCardShapeAxisManualFromExpr(card);
            return;
        }
        if (field === "axisManualCtor") {
            card.shapeAxisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            card.shapeAxisExpr = formatVectorLiteral(
                card.shapeAxisManualCtor,
                card.shapeAxisManualX,
                card.shapeAxisManualY,
                card.shapeAxisManualZ
            );
            card.shapeAxisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") card.shapeAxisManualX = num(target.value);
            else if (field === "axisManualY") card.shapeAxisManualY = num(target.value);
            else card.shapeAxisManualZ = num(target.value);
            card.shapeAxisExpr = formatVectorLiteral(
                card.shapeAxisManualCtor,
                card.shapeAxisManualX,
                card.shapeAxisManualY,
                card.shapeAxisManualZ
            );
            card.shapeAxisPreset = "";
        }
    }

    syncNodeAxisManualFromExpr(node) {
        if (!node) return;
        const expr = String(node.axisExpr || node.axisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        node.axisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, node.axisManualCtor || "RelativeLocation"));
        node.axisManualX = num(vec.x);
        node.axisManualY = num(vec.y);
        node.axisManualZ = num(vec.z);
    }

    applyNodeAxisField(node, field, target) {
        if (!node) return;
        if (field === "axisPreset") {
            node.axisPreset = String(target.value || "");
            if (node.axisPreset) {
                node.axisExpr = node.axisPreset;
                this.syncNodeAxisManualFromExpr(node);
            }
            return;
        }
        if (field === "axisExpr") {
            node.axisExpr = String(target.value || "");
            node.axisPreset = "";
            this.syncNodeAxisManualFromExpr(node);
            return;
        }
        if (field === "axisManualCtor") {
            node.axisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            node.axisExpr = formatVectorLiteral(
                node.axisManualCtor,
                node.axisManualX,
                node.axisManualY,
                node.axisManualZ
            );
            node.axisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") node.axisManualX = num(target.value);
            else if (field === "axisManualY") node.axisManualY = num(target.value);
            else node.axisManualZ = num(target.value);
            node.axisExpr = formatVectorLiteral(
                node.axisManualCtor,
                node.axisManualX,
                node.axisManualY,
                node.axisManualZ
            );
            node.axisPreset = "";
        }
    }

    applyCardScaleField(card, field, target) {
        if (!card) return;
        const scale = Object.assign({}, normalizeScaleHelperConfig(card.shapeScale, { type: "none" }));
        scale.runMode = "auto";
        card.shapeScale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "runMode") {
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    applyNodeScaleField(node, field, target) {
        if (!node) return;
        const scale = Object.assign({}, normalizeScaleHelperConfig(node.scale, { type: "none" }));
        scale.runMode = "auto";
        node.scale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "runMode") {
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    getShapeNodeByPath(card, path) {
        if (!card || !Array.isArray(card.shapeChildren)) return null;
        let children = card.shapeChildren;
        let node = null;
        for (let i = 0; i < path.length; i++) {
            const idx = path[i];
            if (!children || idx < 0 || idx >= children.length) return null;
            node = children[idx];
            children = node.children;
        }
        return node;
    }

    isTreeNodeCParticleEnabled(card, path = []) {
        let enabled = isCompositionCardUsingCParticle(card);
        const parts = Array.isArray(path) ? path : [];
        for (let depth = 1; depth <= parts.length; depth++) {
            const node = this.getShapeNodeByPath(card, parts.slice(0, depth));
            if (node && isCompositionShapeType(node.type) && node.useCParticle === true) enabled = true;
        }
        return enabled;
    }

    getCurrentViewNode(card) {
        if (!card || !card.viewPath || !card.viewPath.length) return null;
        return this.getShapeNodeByPath(card, card.viewPath);
    }

    getViewParentNode(card) {
        if (!card || !card.viewPath || card.viewPath.length <= 1) return null;
        return this.getShapeNodeByPath(card, card.viewPath.slice(0, -1));
    }

    addChildToNode(node) {
        if (!node || isCompositionLeafParticleType(node.type)) return;
        if (!Array.isArray(node.children)) node.children = [];
        node.children.push(normalizeShapeTreeNode({}, node.children.length));
    }

    addChildToCard(card) {
        if (!card) return;
        if (!Array.isArray(card.shapeChildren)) card.shapeChildren = [];
        card.shapeChildren.push(normalizeShapeTreeNode({}, card.shapeChildren.length));
    }

    removeChildFromCard(card, idx) {
        if (!card || !Array.isArray(card.shapeChildren)) return;
        if (idx >= 0 && idx < card.shapeChildren.length) {
            card.shapeChildren.splice(idx, 1);
        }
    }

    removeChildFromNode(node, idx) {
        if (!node || !Array.isArray(node.children)) return;
        if (idx >= 0 && idx < node.children.length) {
            node.children.splice(idx, 1);
        }
    }

    buildBreadcrumb(card) {
        if (!card || !card.viewPath || !card.viewPath.length) return [];
        const crumbs = [{ label: card.name || "卡片", path: [] }];
        let children = card.shapeChildren;
        for (let i = 0; i < card.viewPath.length; i++) {
            const idx = card.viewPath[i];
            if (!children || idx < 0 || idx >= children.length) break;
            const node = children[idx];
            crumbs.push({ label: node.name || `子节点 ${idx + 1}`, path: card.viewPath.slice(0, i + 1) });
            children = node.children;
        }
        return crumbs;
    }

    drillIntoChild(card, childIdx) {
        if (!card) return;
        if (!Array.isArray(card.viewPath)) card.viewPath = [];
        card.viewPath.push(childIdx);
    }

    navigateBreadcrumb(card, path) {
        if (!card) return;
        card.viewPath = Array.isArray(path) ? path.slice() : [];
    }

    getCurrentChildrenList(card) {
        if (!card) return [];
        if (!card.viewPath || !card.viewPath.length) {
            return card.shapeChildren || [];
        }
        const node = this.getCurrentViewNode(card);
        return node ? (node.children || []) : [];
    }

    syncNestedLevelAxisManualFromExpr(level) {
        if (!level) return;
        const expr = String(level.axisExpr || level.axisPreset || "RelativeLocation.yAxis()");
        const vec = this.exprRuntime.parseVecLikeValue(expr);
        level.axisManualCtor = normalizeVectorCtor(parseCtorInLiteral(expr, level.axisManualCtor || "RelativeLocation"));
        level.axisManualX = num(vec.x);
        level.axisManualY = num(vec.y);
        level.axisManualZ = num(vec.z);
    }

    applyNestedLevelAxisField(level, field, target) {
        if (!level) return;
        if (field === "axisPreset") {
            level.axisPreset = String(target.value || "");
            if (level.axisPreset) {
                level.axisExpr = level.axisPreset;
                this.syncNestedLevelAxisManualFromExpr(level);
            }
            return;
        }
        if (field === "axisExpr") {
            level.axisExpr = String(target.value || "");
            level.axisPreset = "";
            this.syncNestedLevelAxisManualFromExpr(level);
            return;
        }
        if (field === "axisManualCtor") {
            level.axisManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            level.axisExpr = formatVectorLiteral(level.axisManualCtor, level.axisManualX, level.axisManualY, level.axisManualZ);
            level.axisPreset = "";
            return;
        }
        if (field === "axisManualX" || field === "axisManualY" || field === "axisManualZ") {
            if (field === "axisManualX") level.axisManualX = num(target.value);
            else if (field === "axisManualY") level.axisManualY = num(target.value);
            else level.axisManualZ = num(target.value);
            level.axisExpr = formatVectorLiteral(level.axisManualCtor, level.axisManualX, level.axisManualY, level.axisManualZ);
            level.axisPreset = "";
        }
    }

    applyNestedLevelScaleField(level, field, target) {
        if (!level) return;
        const scale = Object.assign({}, normalizeScaleHelperConfig(level.scale, { type: "none" }));
        scale.runMode = "auto";
        level.scale = scale;
        if (field === "type") {
            const next = String(target.value || "none");
            scale.type = SCALE_HELPER_TYPES.includes(next) ? next : "none";
            return;
        }
        if (field === "runMode") {
            return;
        }
        if (field === "reversedOnDisable") {
            scale.reversedOnDisable = !!target.checked;
            return;
        }
        if (field === "tick") {
            scale.tick = Math.max(1, int(target.value || 1));
            return;
        }
        if (["min", "max", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"].includes(field)) {
            scale[field] = num(target.value);
        }
    }

    async onCardClick(e) {
        const btn = e.target.closest("button[data-act]");
        if (btn) {
            const act = btn.dataset.act;
            const cardId = btn.dataset.cardId || null;
            const idx = int(btn.dataset.idx);
            const levelIdx = int(btn.dataset.shapeLevelIdx);
            if (act === "add-card") {
                this.addCard();
                return;
            }
            if (act === "select-card") {
                this.selectCardById(cardId, e.ctrlKey || e.metaKey, e.shiftKey);
                this.setEditorWorkspaceView("cards");
                return;
            }
            if (act === "open-card-preset") {
                this.showCardPresetModal(cardId);
                return;
            }
            if (act === "open-node-preset") {
                this.showNodePresetModal(cardId, btn.dataset.treePath || "[]");
                return;
            }
            if (act === "toggle-fold") {
                this.toggleCardFold(cardId);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "toggle-section-fold") {
                this.toggleCardSectionFold(cardId, btn.dataset.sectionKey || "");
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "drill-into-child") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const childIdx = int(btn.dataset.childIdx);
                this.drillIntoChild(card, childIdx);
                this.renderCards();
                return;
            }
            if (act === "navigate-breadcrumb") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const path = JSON.parse(btn.dataset.breadcrumbPath || "[]");
                this.navigateBreadcrumb(card, path);
                this.renderCards();
                return;
            }
            if (act === "add-parallel-child") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                if (!card.viewPath || !card.viewPath.length) {
                    this.addChildToCard(card);
                } else {
                    const node = this.getCurrentViewNode(card);
                    if (node) this.addChildToNode(node);
                }
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "remove-child") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                const childIdx = int(btn.dataset.childIdx);
                if (!card.viewPath || !card.viewPath.length) {
                    this.removeChildFromCard(card, childIdx);
                } else {
                    const node = this.getCurrentViewNode(card);
                    if (node) this.removeChildFromNode(node, childIdx);
                }
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "move-child-up" || act === "move-child-down") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                const childIdx = int(btn.dataset.childIdx);
                const list = (!card.viewPath || !card.viewPath.length) ? card.shapeChildren : (this.getCurrentViewNode(card)?.children || []);
                const swapIdx = act === "move-child-up" ? childIdx - 1 : childIdx + 1;
                if (swapIdx >= 0 && swapIdx < list.length) {
                    [list[childIdx], list[swapIdx]] = [list[swapIdx], list[childIdx]];
                }
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "rename-child") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const childIdx = int(btn.dataset.childIdx);
                const list = (!card.viewPath || !card.viewPath.length) ? card.shapeChildren : (this.getCurrentViewNode(card)?.children || []);
                const child = list[childIdx];
                if (!child) return;
                const newName = prompt("输入子节点名称:", child.name || "");
                if (newName !== null && newName.trim()) {
                    this.pushHistory();
                    child.name = newName.trim();
                    this.afterValueMutate({ rerenderCards: true });
                }
                return;
            }
            if (act === "collapse-all-sections") {
                this.setCardAllSectionsCollapsed(cardId, true);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "expand-all-sections") {
                this.setCardAllSectionsCollapsed(cardId, false);
                this.renderCards();
                this.scheduleSave();
                return;
            }
            if (act === "apply-card-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                card.rotateToExpr = formatVectorLiteral(card.rotateToManualCtor, card.rotateToManualX, card.rotateToManualY, card.rotateToManualZ);
                card.rotateToPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-axis-manual") {
                const card = this.getCardById(cardId);
                if (!card) return;
                this.pushHistory();
                card.shapeAxisExpr = formatVectorLiteral(card.shapeAxisManualCtor, card.shapeAxisManualX, card.shapeAxisManualY, card.shapeAxisManualZ);
                card.shapeAxisPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-shape-display-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const item = card.shapeDisplayActions[int(btn.dataset.shapeDisplayIdx)];
                if (!item) return;
                this.pushHistory();
                item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
                item.toPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-node-axis-manual") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                if (!node) return;
                this.pushHistory();
                node.axisExpr = formatVectorLiteral(node.axisManualCtor, node.axisManualX, node.axisManualY, node.axisManualZ);
                node.axisPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "apply-node-display-manual-to") {
                const card = this.getCardById(cardId);
                if (!card) return;
                const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                if (!node) return;
                const item = (node.displayActions || [])[int(btn.dataset.nodeDisplayIdx)];
                if (!item) return;
                this.pushHistory();
                item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
                item.toPreset = "";
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                return;
            }
            if (act === "open-card-bezier-tool") {
                this.openBezierTool("card", cardId);
                return;
            }
            if (act === "copy-card-bezier-params") {
                await this.copyScaleBezierParams("card", cardId);
                return;
            }
            if (act === "paste-card-bezier-params") {
                await this.pasteScaleBezierParams("card", cardId);
                return;
            }
            if (act === "open-node-bezier-tool") {
                const treePath = btn.dataset.treePath || "[]";
                this.openBezierTool("tree_node", cardId, treePath);
                return;
            }
            if (act === "copy-node-bezier-params") {
                const treePath = btn.dataset.treePath || "[]";
                await this.copyScaleBezierParams("tree_node", cardId, treePath);
                return;
            }
            if (act === "paste-node-bezier-params") {
                const treePath = btn.dataset.treePath || "[]";
                await this.pasteScaleBezierParams("tree_node", cardId, treePath);
                return;
            }
            if (act === "open-card-angle-bezier-tool") {
                this.openBezierTool("card", cardId, "", "angle_ease");
                return;
            }
            if (act === "open-node-angle-bezier-tool") {
                const treePath = btn.dataset.treePath || "[]";
                this.openBezierTool("tree_node", cardId, treePath, "angle_ease");
                return;
            }
            const skipHistory = act === "open-builder-editor"
                || act === "open-shape-builder-editor"
                || act === "open-node-builder-editor"
                || act === "import-builder-json"
                || act === "import-node-builder-json"
                || act === "export-builder-json"
                || act === "export-node-builder-json"
                || act === "shape-tree-drill-into"
                || act === "shape-tree-navigate-breadcrumb";
            if (act === "delete-card") {
                const card = this.getCardById(cardId);
                const cardName = String(card?.name || "该卡片").trim() || "该卡片";
                const accepted = await this.askThemeConfirm({
                    title: "删除卡片",
                    message: `确定删除“${cardName}”吗？此操作可通过撤销恢复。`,
                    okText: "删除",
                    cancelText: "取消",
                    danger: true
                });
                if (!accepted) return;
            }
            if (!skipHistory) this.pushHistory();
            switch (act) {
                case "delete-card":
                    this.deleteCardById(cardId);
                    break;
                case "duplicate-card":
                    this.duplicateCardById(cardId);
                    break;
                case "move-card-up":
                    this.moveCard(cardId, -1);
                    break;
                case "move-card-down":
                    this.moveCard(cardId, 1);
                    break;
                case "add-pinit":
                    this.addParticleInit(cardId);
                    break;
                case "remove-pinit":
                    this.removeParticleInit(cardId, idx);
                    break;
                case "add-cvar":
                    this.addControllerVar(cardId);
                    break;
                case "remove-cvar":
                    this.removeControllerVar(cardId, idx);
                    break;
                case "add-caction": {
                    const card = this.getCardById(cardId);
                    if (card) card.controllerActions.push(normalizeControllerAction({ type: "tick_js", script: "" }));
                    break;
                }
                case "remove-caction": {
                    const card = this.getCardById(cardId);
                    if (card && idx >= 0 && idx < card.controllerActions.length) card.controllerActions.splice(idx, 1);
                    break;
                }
                case "add-growth-animate":
                    this.addCardAnimate(cardId, "growthAnimates");
                    break;
                case "remove-growth-animate":
                    this.removeCardAnimate(cardId, "growthAnimates", idx);
                    break;
                case "add-shape-display-action": {
                    const card = this.getCardById(cardId);
                    if (card) card.shapeDisplayActions.push(normalizeDisplayAction({}));
                    break;
                }
                case "remove-shape-display-action": {
                    const card = this.getCardById(cardId);
                    if (card && idx >= 0 && idx < card.shapeDisplayActions.length) card.shapeDisplayActions.splice(idx, 1);
                    break;
                }
                case "add-node-display-action": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node) node.displayActions.push(normalizeDisplayAction({}));
                    break;
                }
                case "remove-node-display-action": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node && idx >= 0 && idx < node.displayActions.length) node.displayActions.splice(idx, 1);
                    break;
                }
                case "add-node-growth-animate": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node) {
                        if (!Array.isArray(node.growthAnimates)) node.growthAnimates = [];
                        node.growthAnimates.push(normalizeAnimate({ count: 1, condition: "" }));
                    }
                    break;
                }
                case "remove-node-growth-animate": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node && Array.isArray(node.growthAnimates) && idx >= 0 && idx < node.growthAnimates.length) node.growthAnimates.splice(idx, 1);
                    break;
                }
                case "add-node-pinit": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node) {
                        if (!Array.isArray(node.particleInit)) node.particleInit = [];
                        node.particleInit.push({ id: uid(), target: "size", expr: "", exprPreset: "", codegenExpr: "", codegenExprPreset: "" });
                    }
                    break;
                }
                case "remove-node-pinit": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node && idx >= 0 && idx < node.particleInit.length) node.particleInit.splice(idx, 1);
                    break;
                }
                case "add-node-cvar": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node) {
                        if (!Array.isArray(node.controllerVars)) node.controllerVars = [];
                        node.controllerVars.push({
                            id: uid(),
                            name: this.nextControllerVariableName(card, node, node.controllerVars.length),
                            type: "Boolean",
                            expr: "true"
                        });
                    }
                    break;
                }
                case "remove-node-cvar": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node && idx >= 0 && idx < node.controllerVars.length) node.controllerVars.splice(idx, 1);
                    break;
                }
                case "add-node-caction": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node) {
                        if (!Array.isArray(node.controllerActions)) node.controllerActions = [];
                        node.controllerActions.push(normalizeControllerAction({ type: "tick_js", script: "" }));
                    }
                    break;
                }
                case "remove-node-caction": {
                    const card = this.getCardById(cardId);
                    const treePath = btn.dataset.treePath ? JSON.parse(btn.dataset.treePath) : null;
                    const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
                    if (node && idx >= 0 && idx < node.controllerActions.length) node.controllerActions.splice(idx, 1);
                    break;
                }
                case "add-seq-animate":
                    this.addCardAnimate(cardId, "sequencedAnimates");
                    break;
                case "remove-seq-animate":
                    this.removeCardAnimate(cardId, "sequencedAnimates", idx);
                    break;
                case "open-builder-editor":
                    this.openBuilderEditor(cardId);
                    return;
                case "import-builder-json":
                    this.importBuilderJson(cardId);
                    return;
                case "export-builder-json":
                    this.exportBuilderJson(cardId);
                    return;
                case "clear-builder":
                    this.clearBuilder(cardId);
                    break;
                case "open-node-builder-editor": {
                    const treePath = btn.dataset.treePath || "[]";
                    this.openBuilderEditor(cardId, `tree_node:${treePath}`);
                    return;
                }
                case "import-node-builder-json": {
                    const treePath = btn.dataset.treePath || "[]";
                    this.importBuilderJson(cardId, `tree_node:${treePath}`);
                    return;
                }
                case "export-node-builder-json": {
                    const treePath = btn.dataset.treePath || "[]";
                    this.exportBuilderJson(cardId, `tree_node:${treePath}`);
                    return;
                }
                case "clear-node-builder": {
                    const treePath = btn.dataset.treePath || "[]";
                    this.clearBuilder(cardId, `tree_node:${treePath}`);
                    break;
                }
                case "shape-tree-add-parallel": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const parentPath = JSON.parse(btn.dataset.treePath || "[]");
                    if (parentPath.length === 0) {
                        this.addChildToCard(card);
                    } else {
                        const pNode = this.getShapeNodeByPath(card, parentPath);
                        if (pNode) this.addChildToNode(pNode);
                    }
                    break;
                }
                case "shape-tree-remove-child": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const parentPath = JSON.parse(btn.dataset.treePath || "[]");
                    const childIdx = int(btn.dataset.childIdx);
                    if (parentPath.length === 0) {
                        this.removeChildFromCard(card, childIdx);
                    } else {
                        const pNode = this.getShapeNodeByPath(card, parentPath);
                        if (pNode) this.removeChildFromNode(pNode, childIdx);
                    }
                    // 删除子节点后修正越界的 viewPath。
                    if (card.viewPath && card.viewPath.length > parentPath.length) {
                        const vpIdx = card.viewPath[parentPath.length];
                        if (vpIdx === childIdx) card.viewPath = [...parentPath];
                        else if (vpIdx > childIdx) card.viewPath[parentPath.length]--;
                    }
                    break;
                }
                case "shape-tree-drill-into": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const childIdx = int(btn.dataset.childIdx);
                    card.viewPath = [...(card.viewPath || []), childIdx];
                    // 仅切换编辑器视图，不改变 Composition 数据。
                    // 不要落入 afterStructureMutate，否则会重建所有 PointsBuilder 并重播预览。
                    this.renderCards();
                    this.scheduleSave();
                    return;
                }
                case "shape-tree-navigate-breadcrumb": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const depth = int(btn.dataset.depth);
                    if (depth < 0) card.viewPath = [];
                    else card.viewPath = (card.viewPath || []).slice(0, depth + 1);
                    // 面包屑导航同样只是视图状态变化，不需要重新计算预览。
                    this.renderCards();
                    this.scheduleSave();
                    return;
                }
                case "shape-tree-move-child-up": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const pp = JSON.parse(btn.dataset.treePath || "[]");
                    const ci = int(btn.dataset.childIdx);
                    const nodes = pp.length === 0 ? card.shapeChildren : (this.getShapeNodeByPath(card, pp) || {}).children;
                    if (nodes && ci > 0) { [nodes[ci - 1], nodes[ci]] = [nodes[ci], nodes[ci - 1]]; }
                    break;
                }
                case "shape-tree-move-child-down": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const pp = JSON.parse(btn.dataset.treePath || "[]");
                    const ci = int(btn.dataset.childIdx);
                    const nodes = pp.length === 0 ? card.shapeChildren : (this.getShapeNodeByPath(card, pp) || {}).children;
                    if (nodes && ci < nodes.length - 1) { [nodes[ci], nodes[ci + 1]] = [nodes[ci + 1], nodes[ci]]; }
                    break;
                }
                case "shape-tree-rename-child": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const tp = JSON.parse(btn.dataset.treePath || "[]");
                    const node = this.getShapeNodeByPath(card, tp);
                    if (node) { node.name = btn.dataset.newName || node.name; }
                    break;
                }
                case "apply-tree-node-axis-manual": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    if (node) this.syncNodeAxisManualFromExpr(node);
                    break;
                }
                case "add-tree-node-display-action": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    if (node) {
                        if (!node.displayActions) node.displayActions = [];
                        node.displayActions.push(normalizeDisplayAction({}));
                    }
                    break;
                }
                case "remove-tree-node-display-action": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    const dIdx = int(btn.dataset.treeNodeDisplayIdx ?? btn.dataset.idx);
                    if (node && node.displayActions) node.displayActions.splice(dIdx, 1);
                    break;
                }
                case "apply-tree-node-display-manual-to": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    const dIdx = int(btn.dataset.treeNodeDisplayIdx ?? btn.dataset.idx);
                    if (node && node.displayActions && node.displayActions[dIdx]) {
                        const a = node.displayActions[dIdx];
                        a.toExpr = `${a.toManualCtor || "Vec3"}(${a.toManualX ?? 0}, ${a.toManualY ?? 0}, ${a.toManualZ ?? 0})`;
                    }
                    break;
                }
                case "add-tree-node-pinit": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    if (node) {
                        if (!Array.isArray(node.particleInit)) node.particleInit = [];
                        node.particleInit.push({ id: uid(), target: "size", expr: "", exprPreset: "", codegenExpr: "", codegenExprPreset: "" });
                    }
                    break;
                }
                case "remove-tree-node-pinit": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    const pIdx = int(btn.dataset.idx);
                    if (node && Array.isArray(node.particleInit)) node.particleInit.splice(pIdx, 1);
                    break;
                }
                case "add-tree-node-growth-animate": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const treePath = JSON.parse(btn.dataset.treePath || "[]");
                    const node = this.getShapeNodeByPath(card, treePath);
                    if (node && node.type === "sequenced_shape") {
                        if (!Array.isArray(node.growthAnimates)) node.growthAnimates = [];
                        node.growthAnimates.push(normalizeAnimate({ count: 1, condition: "" }));
                    }
                    break;
                }
                case "remove-tree-node-growth-animate": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const treePath = JSON.parse(btn.dataset.treePath || "[]");
                    const node = this.getShapeNodeByPath(card, treePath);
                    if (node && Array.isArray(node.growthAnimates) && idx >= 0 && idx < node.growthAnimates.length) {
                        node.growthAnimates.splice(idx, 1);
                    }
                    break;
                }
                case "add-tree-node-cvar": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    if (node) {
                        if (!Array.isArray(node.controllerVars)) node.controllerVars = [];
                        node.controllerVars.push({
                            id: uid(),
                            name: this.nextControllerVariableName(card, node, node.controllerVars.length),
                            type: "Double",
                            expr: "0.0"
                        });
                    }
                    break;
                }
                case "remove-tree-node-cvar": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    const cvIdx = int(btn.dataset.idx);
                    if (node && Array.isArray(node.controllerVars)) node.controllerVars.splice(cvIdx, 1);
                    break;
                }
                case "add-tree-node-caction": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    if (node) {
                        if (!Array.isArray(node.controllerActions)) node.controllerActions = [];
                        node.controllerActions.push(normalizeControllerAction({}));
                    }
                    break;
                }
                case "remove-tree-node-caction": {
                    const card = this.getCardById(cardId);
                    if (!card) return;
                    const node = this.getCurrentViewNode(card);
                    const caIdx = int(btn.dataset.idx);
                    if (node && Array.isArray(node.controllerActions)) node.controllerActions.splice(caIdx, 1);
                    break;
                }
                default:
                    return;
            }
            const card = this.getCardById(cardId);
            this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
            return;
        }

        const head = e.target.closest(".card-head[data-card-id]");
        if (head) {
            const targetNode = e.target;
            if (targetNode instanceof Element && targetNode.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], .editor-shell-monaco, .editor-monaco-host, .monaco-editor, .suggest-widget, .monaco-hover, .monaco-menu-container")) {
                return;
            }
            this.selectCardById(head.dataset.cardId, e.ctrlKey || e.metaKey, e.shiftKey);
        }
    }

    onCardInput(e) {
        const t = e.target;
        if (!t) return;
        const cardId = t.dataset.cardId;
        if (!cardId) return;
        const card = this.getCardById(cardId);
        if (!card) return;

        if (t.dataset.layerPreviewField) {
            const field = String(t.dataset.layerPreviewField || "");
            if (field === "visible") {
                card.previewVisible = !!t.checked;
            } else if (field === "solo") {
                const enabled = !!t.checked;
                for (const item of this.state.cards) {
                    item.previewSolo = enabled && item.id === card.id;
                }
            } else {
                return;
            }
            this.renderCards();
            this.updateSelectionStatus();
            this.scheduleSave();
            this.configurePreviewGpuParticlePath?.();
            if (this.previewPaused && this.renderer) {
                this.updatePreviewAnimation();
                this.renderer.render(this.scene, this.camera);
            }
            return;
        }

        if (t.dataset.cardCparticleFade) {
            this.applyCParticleFadeField(card, t.dataset.cardCparticleFade, t.dataset.cardCparticleFadeField, t);
            this.afterValueMutate({
                rebuildPreview: true,
                rerenderCards: t.dataset.cardCparticleFadeField === "enabled"
            });
            return;
        }

        if (t.dataset.cardField) {
            const cardField = String(t.dataset.cardField || "");
            if (cardField.startsWith("angleOffset")) {
                this.applyAngleOffsetField(card, cardField, t);
                const rerender = this.isAngleOffsetStructureField(cardField);
                if (rerender) {
                    this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                } else {
                    this.afterValueMutate({ rebuildPreview: true });
                }
                return;
            }
            if (cardField === "useCParticle") {
                const requested = t.type === "checkbox" ? t.checked === true : false;
                if (!this.setCardCParticleMode(card, requested)) {
                    t.checked = false;
                    card.useCParticle = false;
                }
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            this.applyObjectField(card, t.dataset.cardField, t);
            if (cardField === "name") {
                this.updateSelectionStatus();
                this.afterValueMutate({ rebuildPreview: false, rerenderCards: false, rerenderProject: false });
                return;
            }
            if (t.dataset.cardField === "rotateToPreset") {
                card.rotateToExpr = card.rotateToPreset || card.rotateToExpr;
                const vec = this.exprRuntime.parseVecLikeValue(card.rotateToExpr || "");
                card.rotateToManualCtor = normalizeVectorCtor(parseCtorInLiteral(card.rotateToExpr || "", card.rotateToManualCtor || "RelativeLocation"));
                card.rotateToManualX = num(vec.x);
                card.rotateToManualY = num(vec.y);
                card.rotateToManualZ = num(vec.z);
            }
            if (t.dataset.cardField === "rotateToExpr") {
                const vec = this.exprRuntime.parseVecLikeValue(card.rotateToExpr || "");
                card.rotateToManualCtor = normalizeVectorCtor(parseCtorInLiteral(card.rotateToExpr || "", card.rotateToManualCtor || "RelativeLocation"));
                card.rotateToManualX = num(vec.x);
                card.rotateToManualY = num(vec.y);
                card.rotateToManualZ = num(vec.z);
                card.rotateToPreset = "";
            }
            if (t.dataset.cardField === "rotateToManualCtor") {
                card.rotateToManualCtor = normalizeVectorCtor(card.rotateToManualCtor || "RelativeLocation");
                card.rotateToExpr = formatVectorLiteral(card.rotateToManualCtor, card.rotateToManualX, card.rotateToManualY, card.rotateToManualZ);
                card.rotateToPreset = "";
            }
            if (["rotateToManualX", "rotateToManualY", "rotateToManualZ"].includes(t.dataset.cardField)) {
                card.rotateToExpr = formatVectorLiteral(card.rotateToManualCtor, card.rotateToManualX, card.rotateToManualY, card.rotateToManualZ);
                card.rotateToPreset = "";
            }
            if (t.dataset.cardField === "rotateAnglePreset") {
                card.rotateAnglePreset = String(card.rotateAnglePreset || "");
                card.rotateAngleExpr = card.rotateAnglePreset;
            }
            if (t.dataset.cardField === "dataType") {
                if (isShape && this.state.useCParticle === true) {
                    card.useCParticle = true;
                    card.globalCParticleAuto = true;
                }
                if (isShape && (!card.shapeChildren || !card.shapeChildren.length)) {
                    card.shapeChildren = [normalizeShapeTreeNode({ type: "single" }, 0)];
                }
                if (!isShape) {
                    card.useCParticle = false;
                    if (this.state.useCParticle === true) {
                        card.particleBackend = "cparticle";
                        card.globalCParticleAuto = true;
                    }
                    card.shapeChildren = [];
                    card.viewPath = [];
                }
            }
            if (["bindMode", "dataType", "useCParticle", "rotateAngleMode", "rotateToPreset", "rotateToManualCtor"].includes(t.dataset.cardField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeAxisField) {
            this.applyCardShapeAxisField(card, t.dataset.cardShapeAxisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.cardShapeAxisField);
            this.afterValueMutate({ rerenderCards: rerender, rebuildPreview: true });
            return;
        }

        if (t.dataset.treeNodeField) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            const field = String(t.dataset.treeNodeField || "");
            if (field === "name") {
                node.name = String(t.value || "");
                this.updateSelectionStatus();
                this.afterValueMutate({ rebuildPreview: false, rerenderCards: true, rerenderProject: false });
                return;
            }
            if (field === "type") {
                const requestedType = ["single", "particle_shape", "sequenced_shape"].includes(String(t.value || ""))
                    ? String(t.value)
                    : "single";
                node.type = requestedType;
                if (isCompositionLeafParticleType(node.type)) {
                    node.children = [];
                    node.growthAnimates = [];
                } else if (!node.children || !node.children.length) {
                    node.children = [normalizeShapeTreeNode({ type: "single" }, 0)];
                }
                if (node.type !== "sequenced_shape") node.growthAnimates = [];
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "bindMode") {
                node.bindMode = t.value === "builder" ? "builder" : "point";
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "pointX" || field === "pointY" || field === "pointZ") {
                if (field === "pointX") node.point.x = num(t.value);
                if (field === "pointY") node.point.y = num(t.value);
                if (field === "pointZ") node.point.z = num(t.value);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "effectClass") {
                node.effectClass = String(t.value || DEFAULT_EFFECT_CLASS);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "useTexture") {
                node.useTexture = !!t.checked;
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "useCParticle") {
                node.useCParticle = isCompositionShapeType(node.type) && t.checked === true;
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
                return;
            }
            if (field === "cparticleRenderLayer") {
                node.cparticleRenderLayer = CPARTICLE_RENDER_LAYER_OPTIONS.includes(String(t.value || ""))
                    ? String(t.value)
                    : "ADDITION_BLEND_TRANSLUCENT";
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "randomAgePreTick") {
                node.randomAgePreTick = !!t.checked;
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
        }

        if (t.dataset.treeNodeCparticleFade) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            this.applyCParticleFadeField(node, t.dataset.treeNodeCparticleFade, t.dataset.treeNodeCparticleFadeField, t);
            this.afterValueMutate({
                rebuildPreview: true,
                rerenderCards: t.dataset.treeNodeCparticleFadeField === "enabled"
            });
            return;
        }

        if (t.dataset.treeNodeAxisField) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            this.applyNodeAxisField(node, t.dataset.treeNodeAxisField, t);
            const rerender = ["axisPreset", "axisManualCtor"].includes(t.dataset.treeNodeAxisField);
            this.afterValueMutate({ rerenderCards: rerender, rebuildPreview: true });
            return;
        }

        if (t.dataset.treeNodeAngleField) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            const field = normalizeAngleOffsetFieldName(t.dataset.treeNodeAngleField);
            this.applyAngleOffsetField(node, field, t);
            if (this.isAngleOffsetStructureField(field)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
            return;
        }

        if (t.dataset.treeNodeScaleField) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            this.applyNodeScaleField(node, t.dataset.treeNodeScaleField, t);
            this.afterValueMutate({ rerenderCards: t.dataset.treeNodeScaleField === "type", rebuildPreview: true });
            return;
        }

        if (t.dataset.treeNodeDisplayIdx !== undefined) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            const item = node.displayActions[int(t.dataset.treeNodeDisplayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.treeNodeDisplayField, t);
            if (this.queueCodeEditorRefresh(t, { rebuildPreview: true })) return;
            if (["type", "angleMode", "toPreset"].includes(t.dataset.treeNodeDisplayField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
            return;
        }

        if (t.dataset.treeNodeCvarIdx !== undefined) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : this.getCurrentViewNode(card);
            if (!node || !Array.isArray(node.controllerVars)) return;
            const item = node.controllerVars[int(t.dataset.treeNodeCvarIdx)];
            if (!item) return;
            const field = t.dataset.treeNodeCvarField;
            if (field === "type") item.type = t.value;
            else if (field === "name") item.name = t.value;
            else if (field === "expr") item.expr = t.value;
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.treeNodeCactIdx !== undefined) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : this.getCurrentViewNode(card);
            if (!node || !Array.isArray(node.controllerActions)) return;
            const item = node.controllerActions[int(t.dataset.treeNodeCactIdx)];
            if (!item) return;
            const field = t.dataset.treeNodeCactField;
            if (field === "type") item.type = t.value;
            else if (field === "script") item.script = t.value;
            if (this.queueCodeEditorRefresh(t, { rebuildPreview: true })) return;
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.treeNodePinitColorIdx !== undefined) {
            const treePathRaw = String(t.dataset.treePath || "[]");
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : this.getCurrentViewNode(card);
            if (!node || !Array.isArray(node.particleInit)) return;
            const item = node.particleInit[int(t.dataset.treeNodePinitColorIdx)];
            if (!item) return;
            this.updateParticleInitColorValue(item, t.value);
            this.syncTreeNodeParticleInitInlineInputs(card.id, treePathRaw, t.dataset.treeNodePinitColorIdx, item);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.treeNodePinitIdx !== undefined) {
            const treePathRaw = String(t.dataset.treePath || "[]");
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : this.getCurrentViewNode(card);
            if (!node || !Array.isArray(node.particleInit)) return;
            const item = node.particleInit[int(t.dataset.treeNodePinitIdx)];
            if (!item) return;
            const field = String(t.dataset.treeNodePinitField || "");
            if (field === "target") {
                item.target = String(t.value || "size");
                item.expr = "";
                item.exprPreset = "";
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else if (field === "exprPreset") {
                const prevPreset = String(item.exprPreset || "").trim();
                item.exprPreset = String(t.value || "");
                if (item.exprPreset) item.expr = item.exprPreset;
                else if (prevPreset) item.expr = this.getParticleInitDefaultExprByTarget(item.target);
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else if (field === "expr") {
                item.expr = String(t.value || "");
                item.exprPreset = this.resolveParticleInitPresetExpr(item.expr, item.target);
                this.syncTreeNodeParticleInitInlineInputs(card.id, treePathRaw, t.dataset.treeNodePinitIdx, item);
                this.afterValueMutate({ rebuildPreview: true });
            } else if (field === "codegenExprPreset") {
                const prevPreset = String(item.codegenExprPreset || "").trim();
                item.codegenExprPreset = String(t.value || "");
                if (item.codegenExprPreset) item.codegenExpr = item.codegenExprPreset;
                else if (prevPreset && !String(item.codegenExpr || "").trim()) item.codegenExpr = "";
                this.afterValueMutate({ rebuildPreview: false, rerenderCards: true });
            } else if (field === "codegenExpr") {
                item.codegenExpr = String(t.value || "");
                item.codegenExprPreset = this.resolveParticleInitCodegenPresetExpr(item.codegenExpr, item.target);
                this.afterValueMutate({ rebuildPreview: false });
            }
            return;
        }

        if (t.dataset.cardScaleField) {
            this.applyCardScaleField(card, t.dataset.cardScaleField, t);
            this.afterValueMutate({ rerenderCards: t.dataset.cardScaleField === "type", rebuildPreview: true });
            return;
        }

        if (t.dataset.cardShapeDisplayIdx !== undefined) {
            const item = card.shapeDisplayActions[int(t.dataset.cardShapeDisplayIdx)];
            if (!item) return;
            this.applyDisplayActionField(item, t.dataset.cardShapeDisplayField, t);
            if (this.queueCodeEditorRefresh(t, { rebuildPreview: true })) return;
            if (["type", "angleMode", "toPreset"].includes(t.dataset.cardShapeDisplayField)) {
                this.afterStructureMutate({ rerenderCards: true, rebuildPreview: true, rerenderProject: false });
            } else {
                this.afterValueMutate({ rebuildPreview: true });
            }
            return;
        }

        if (t.dataset.cardPointField) {
            this.applyObjectField(card.point, t.dataset.cardPointField, t);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.pinitColorIdx !== undefined) {
            const item = card.particleInit[int(t.dataset.pinitColorIdx)];
            if (!item) return;
            this.updateParticleInitColorValue(item, t.value);
            this.syncParticleInitInlineInputs(card.id, t.dataset.pinitColorIdx, item);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.pinitIdx !== undefined) {
            const item = card.particleInit[int(t.dataset.pinitIdx)];
            if (!item) return;
            const field = String(t.dataset.pinitField || "");
            if (field === "target") {
                const prevTarget = String(item.target || "");
                const prevDefault = this.getParticleInitDefaultExprByTarget(prevTarget);
                const hadPreset = !!String(item.exprPreset || "").trim();
                item.target = String(t.value || "size");
                let nextExpr = String(item.expr || "").trim();
                if (!hadPreset) {
                    if (!nextExpr || nextExpr === prevDefault) {
                        nextExpr = this.getParticleInitDefaultExprByTarget(item.target);
                    }
                }
                let nextPreset = this.resolveParticleInitPresetExpr(nextExpr, item.target);
                if (hadPreset && !nextPreset) {
                    nextExpr = this.getParticleInitDefaultExprByTarget(item.target);
                    nextPreset = this.resolveParticleInitPresetExpr(nextExpr, item.target);
                }
                item.expr = nextExpr;
                item.exprPreset = nextPreset;
                this.afterValueMutate({ rebuildPreview: true, rerenderCards: true });
                return;
            }
            if (field === "exprPreset") {
                const prevPreset = String(item.exprPreset || "").trim();
                item.exprPreset = String(t.value || "");
                if (item.exprPreset) item.expr = item.exprPreset;
                else if (prevPreset) {
                    item.expr = this.getParticleInitDefaultExprByTarget(item.target);
                } else if (!String(item.expr || "").trim()) {
                    item.expr = this.getParticleInitDefaultExprByTarget(item.target);
                }
                this.afterValueMutate({ rebuildPreview: true, rerenderCards: true });
                return;
            }
            if (field === "expr") {
                item.expr = String(t.value || "");
                item.exprPreset = this.resolveParticleInitPresetExpr(item.expr, item.target);
                this.syncParticleInitInlineInputs(card.id, t.dataset.pinitIdx, item);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "codegenExprPreset") {
                const prevPreset = String(item.codegenExprPreset || "").trim();
                item.codegenExprPreset = String(t.value || "");
                if (item.codegenExprPreset) item.codegenExpr = item.codegenExprPreset;
                else if (prevPreset && !String(item.codegenExpr || "").trim()) item.codegenExpr = "";
                this.afterValueMutate({ rebuildPreview: false, rerenderCards: true });
                return;
            }
            if (field === "codegenExpr") {
                item.codegenExpr = String(t.value || "");
                item.codegenExprPreset = this.resolveParticleInitCodegenPresetExpr(item.codegenExpr, item.target);
                this.afterValueMutate({ rebuildPreview: false });
                return;
            }
            this.applyObjectField(item, field, t);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.cvarIdx !== undefined) {
            const item = card.controllerVars[int(t.dataset.cvarIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.cvarField, t);
            this.afterValueMutate({ rebuildPreview: false });
            return;
        }

        if (t.dataset.cactIdx !== undefined) {
            const item = card.controllerActions[int(t.dataset.cactIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.cactField, t);
            if (this.queueCodeEditorRefresh(t, { rebuildPreview: true, rerenderCards: t.dataset.cactField === "type" })) return;
            this.afterValueMutate({ rebuildPreview: true, rerenderCards: t.dataset.cactField === "type" });
            return;
        }

        if (t.dataset.nodePinitIdx !== undefined) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            const item = node.particleInit[int(t.dataset.nodePinitIdx)];
            if (!item) return;
            const field = String(t.dataset.nodePinitField || "");
            if (field === "target") {
                const prevTarget = String(item.target || "");
                const prevDefault = this.getParticleInitDefaultExprByTarget(prevTarget);
                const hadPreset = !!String(item.exprPreset || "").trim();
                item.target = String(t.value || "size");
                let nextExpr = String(item.expr || "").trim();
                if (!hadPreset) {
                    if (!nextExpr || nextExpr === prevDefault) {
                        nextExpr = this.getParticleInitDefaultExprByTarget(item.target);
                    }
                }
                let nextPreset = this.resolveParticleInitPresetExpr(nextExpr, item.target);
                if (hadPreset && !nextPreset) {
                    nextExpr = this.getParticleInitDefaultExprByTarget(item.target);
                    nextPreset = this.resolveParticleInitPresetExpr(nextExpr, item.target);
                }
                item.expr = nextExpr;
                item.exprPreset = nextPreset;
                this.afterValueMutate({ rebuildPreview: true, rerenderCards: true });
                return;
            }
            if (field === "exprPreset") {
                const prevPreset = String(item.exprPreset || "").trim();
                item.exprPreset = String(t.value || "");
                if (item.exprPreset) item.expr = item.exprPreset;
                else if (prevPreset) {
                    item.expr = this.getParticleInitDefaultExprByTarget(item.target);
                } else if (!String(item.expr || "").trim()) {
                    item.expr = this.getParticleInitDefaultExprByTarget(item.target);
                }
                this.afterValueMutate({ rebuildPreview: true, rerenderCards: true });
                return;
            }
            if (field === "expr") {
                item.expr = String(t.value || "");
                item.exprPreset = this.resolveParticleInitPresetExpr(item.expr, item.target);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (field === "codegenExprPreset") {
                const prevPreset = String(item.codegenExprPreset || "").trim();
                item.codegenExprPreset = String(t.value || "");
                if (item.codegenExprPreset) item.codegenExpr = item.codegenExprPreset;
                else if (prevPreset && !String(item.codegenExpr || "").trim()) item.codegenExpr = "";
                this.afterValueMutate({ rebuildPreview: false, rerenderCards: true });
                return;
            }
            if (field === "codegenExpr") {
                item.codegenExpr = String(t.value || "");
                item.codegenExprPreset = this.resolveParticleInitCodegenPresetExpr(item.codegenExpr, item.target);
                this.afterValueMutate({ rebuildPreview: false });
                return;
            }
            this.applyObjectField(item, field, t);
            this.afterValueMutate({ rebuildPreview: true });
            return;
        }

        if (t.dataset.nodeCvarIdx !== undefined) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            const item = node.controllerVars[int(t.dataset.nodeCvarIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.nodeCvarField, t);
            this.afterValueMutate({ rebuildPreview: false });
            return;
        }

        if (t.dataset.nodeCactIdx !== undefined) {
            const treePath = t.dataset.treePath ? JSON.parse(t.dataset.treePath) : null;
            const node = treePath ? this.getShapeNodeByPath(card, treePath) : null;
            if (!node) return;
            const item = node.controllerActions[int(t.dataset.nodeCactIdx)];
            if (!item) return;
            this.applyObjectField(item, t.dataset.nodeCactField, t);
            if (this.queueCodeEditorRefresh(t, { rebuildPreview: true, rerenderCards: t.dataset.nodeCactField === "type" })) return;
            this.afterValueMutate({ rebuildPreview: true, rerenderCards: t.dataset.nodeCactField === "type" });
            return;
        }

        if (t.dataset.cardAnimateIdx !== undefined) {
            const idx = int(t.dataset.cardAnimateIdx);
            const key = t.dataset.cardAnimateType;
            if (!key) return;
            if (String(key).startsWith("nodeGrowth:") || String(key).startsWith("treeNodeGrowth:")) {
                const prefix = String(key).startsWith("nodeGrowth:") ? "nodeGrowth:" : "treeNodeGrowth:";
                const treePath = JSON.parse(String(key).slice(prefix.length) || "[]");
                const node = this.getShapeNodeByPath(card, treePath);
                if (!node || node.type !== "sequenced_shape" || !Array.isArray(node.growthAnimates)) return;
                const item = node.growthAnimates[idx];
                if (!item) return;
                this.applyAnimateField(item, t.dataset.cardAnimateField, t);
                this.afterValueMutate({ rebuildPreview: true });
                return;
            }
            if (!["growthAnimates", "sequencedAnimates"].includes(key)) return;
            const item = card[key] && card[key][idx];
            if (!item) return;
            this.applyAnimateField(item, t.dataset.cardAnimateField, t);
            this.afterValueMutate({ rebuildPreview: true });
        }
    }

    onCardChange(e) {
        if (this.armedHistorySnapshot) {
            this.pushHistory(this.armedHistorySnapshot);
            this.armedHistorySnapshot = null;
        }
        const t = e?.target;
        if (!t || !t.matches) return;
        if (this.flushCodeEditorRefresh(t)) return;
        if (this.flushDeferredExpressionRefresh(t, { forceImmediate: true })) return;
        if (!t.matches("select,input[type='checkbox']")) return;
        // 兼容部分只派发 "change" 的卡片控件，尤其是 <select>。
        this.onCardInput(e);
    }

    onCardFocusIn(e) {
        const target = e?.target;
        if (!target || !target.closest) return;
        const cardEl = target.closest(".card[data-card-id]");
        const focusCardId = String(cardEl?.dataset?.cardId || "");
        if (focusCardId) {
            const activeCard = this.getCardById(focusCardId);
            if (activeCard && this.focusedCardId !== focusCardId) {
                this.focusedCardId = focusCardId;
                this.selectedCardIds = new Set([focusCardId]);
                this.renderCards();
                this.updateSelectionStatus();
            }
        }
        const subgroup = target.closest(".subgroup.collapsed[data-card-id][data-section-key]");
        if (!subgroup) return;
        const cardId = String(subgroup.dataset.cardId || "");
        const sectionKey = String(subgroup.dataset.sectionKey || "");
        const card = this.getCardById(cardId);
        if (!card) return;
        this.setCardSectionCollapsed(card, sectionKey, false);
        this.renderCards();
        this.scheduleSave();
    }

    applyObjectField(obj, field, target) {
        if (!obj || !field) return;
        if (target.type === "checkbox") {
            obj[field] = !!target.checked;
            return;
        }
        if (target.type === "number") {
            obj[field] = num(target.value);
            return;
        }
        obj[field] = String(target.value ?? "");
    }

    applyCParticleFadeField(targetObj, phaseRaw, fieldRaw, target) {
        if (!targetObj) return;
        const phase = phaseRaw === "fadeOut" ? "fadeOut" : "fadeIn";
        const field = String(fieldRaw || "");
        const config = normalizeCParticleAlphaConfig(targetObj.cparticleAlpha);
        targetObj.cparticleAlpha = config;
        if (field === "enabled") {
            config[phase].enabled = !!target.checked;
        } else if (field === "durationTicks") {
            config[phase].durationTicks = Math.max(1, int(target.value || 1));
        } else if (field === "fromAlpha" || field === "toAlpha") {
            config[phase][field] = clamp(num(target.value), 0, 1);
        }
    }

    applyAngleOffsetField(targetObj, rawField, target) {
        if (!targetObj) return;
        const field = normalizeAngleOffsetFieldName(rawField);
        if (!field) return;
        const paramField = normalizeAngleOffsetEaseParamFieldName(field);
        if (field === "angleOffsetEnabled" || field === "angleOffsetReverseOnDisable") {
            targetObj[field] = !!target.checked;
            return;
        }
        if (field === "angleOffsetCount" || field === "angleOffsetGlowTick") {
            targetObj[field] = Math.max(1, int(target.value || 1));
            return;
        }
        if (field === "angleOffsetEase") {
            targetObj[field] = normalizeAngleOffsetEaseName(target.value || "outCubic");
            Object.assign(targetObj, normalizeAngleOffsetEaseSpecialParams(targetObj));
            return;
        }
        if (paramField) {
            targetObj[paramField] = target.value;
            Object.assign(targetObj, normalizeAngleOffsetEaseSpecialParams(targetObj));
            return;
        }
        if (field === "angleOffsetAngleMode") {
            targetObj[field] = target.value === "expr" ? "expr" : "numeric";
            return;
        }
        if (field === "angleOffsetAngleValue") {
            targetObj[field] = num(target.value);
            return;
        }
        if (field === "angleOffsetAngleUnit") {
            targetObj[field] = normalizeAngleUnit(target.value);
            return;
        }
        if (field === "angleOffsetAngleExpr") {
            targetObj[field] = String(target.value || "");
            return;
        }
        if (field === "angleOffsetAnglePreset") {
            targetObj[field] = String(target.value || "");
            targetObj.angleOffsetAngleExpr = targetObj[field];
        }
    }

    isAngleOffsetStructureField(rawField) {
        const field = normalizeAngleOffsetFieldName(rawField);
        return field === "angleOffsetEnabled"
            || field === "angleOffsetEase"
            || field === "angleOffsetAngleMode"
            || field === "angleOffsetAnglePreset";
    }

    applyAnimateField(item, field, target) {
        if (!item) return;
        if (field === "count") {
            item.count = Math.max(1, int(target.value || 1));
            return;
        }
        if (field === "condition") item.condition = String(target.value || "");
    }

    applyDisplayActionField(item, field, target) {
        if (!item) return;
        if (field === "type") {
            item.type = DISPLAY_ACTION_TYPES.some((it) => it.id === target.value) ? target.value : "rotateToWithAngle";
            if (!item.toExpr) item.toExpr = "RelativeLocation.yAxis()";
            if (!item.toPreset) item.toPreset = "RelativeLocation.yAxis()";
            if (!item.angleExpr) item.angleExpr = "speed / 180 * PI";
            if (!item.angleExprPreset) item.angleExprPreset = item.angleExpr;
            return;
        }
        if (field === "toPreset") {
            item.toPreset = String(target.value || "");
            item.toExpr = item.toPreset || item.toExpr;
            const vec = this.exprRuntime.parseVecLikeValue(item.toExpr || "");
            item.toManualCtor = normalizeVectorCtor(parseCtorInLiteral(item.toExpr || "", item.toManualCtor || "RelativeLocation"));
            item.toManualX = num(vec.x);
            item.toManualY = num(vec.y);
            item.toManualZ = num(vec.z);
            return;
        }
        if (field === "toExpr") {
            item.toExpr = String(target.value || "");
            item.toPreset = "";
            const vec = this.exprRuntime.parseVecLikeValue(item.toExpr || "");
            item.toManualCtor = normalizeVectorCtor(parseCtorInLiteral(item.toExpr || "", item.toManualCtor || "RelativeLocation"));
            item.toManualX = num(vec.x);
            item.toManualY = num(vec.y);
            item.toManualZ = num(vec.z);
            return;
        }
        if (field === "toManualCtor") {
            item.toManualCtor = normalizeVectorCtor(target.value || "RelativeLocation");
            item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
            item.toPreset = "";
            return;
        }
        if (field === "toManualX" || field === "toManualY" || field === "toManualZ") {
            item[field] = num(target.value);
            item.toExpr = formatVectorLiteral(item.toManualCtor, item.toManualX, item.toManualY, item.toManualZ);
            item.toPreset = "";
            return;
        }
        if (field === "angleMode") {
            item.angleMode = target.value === "expr" ? "expr" : "numeric";
            return;
        }
        if (field === "angleValue") {
            item.angleValue = num(target.value);
            return;
        }
        if (field === "angleUnit") {
            item.angleUnit = normalizeAngleUnit(target.value);
            return;
        }
        if (field === "angleExpr") {
            item.angleExpr = String(target.value || "");
            return;
        }
        if (field === "angleExprPreset") {
            item.angleExprPreset = String(target.value || "");
            item.angleExpr = item.angleExprPreset;
            return;
        }
        if (field === "expression") {
            item.expression = String(target.value || "");
        }
    }

    countBuilderNodes(nodes) {
        const list = Array.isArray(nodes) ? nodes : [];
        let count = 0;
        const walk = (arr) => {
            for (const n of arr) {
                if (!n) continue;
                count += 1;
                if (Array.isArray(n.children) && n.children.length) walk(n.children);
            }
        };
        walk(list);
        return count;
    }

    evaluateBuilderPoints(builderState) {
        const old = builderEvalState;
        try {
            builderEvalState = normalizeBuilderState(builderState);
            const nodes = builderEvalState?.root?.children || [];
            return evalBuilderWithMeta(nodes, this.resolveCompositionAxisDirection());
        } catch (e) {
            console.warn("evaluateBuilderPoints failed:", e);
            return { points: [], segments: new Map() };
        } finally {
            builderEvalState = old;
        }
    }

    getCardById(cardId) {
        if (!cardId) return null;
        return this.state.cards.find((c) => c.id === cardId) || null;
    }

    getCardIndexById(cardId) {
        return this.state.cards.findIndex((c) => c.id === cardId);
    }

    ensureSelectionValid() {
        const ids = new Set(this.state.cards.map((c) => c.id));
        const next = new Set();
        for (const id of this.selectedCardIds) {
            if (ids.has(id)) next.add(id);
        }
        this.selectedCardIds = next;
        if (!this.focusedCardId || !ids.has(this.focusedCardId)) {
            this.focusedCardId = this.state.cards[0]?.id || null;
        }
        if (!this.selectedCardIds.size && this.focusedCardId) {
            this.selectedCardIds.add(this.focusedCardId);
        }
        if (!this.selectionAnchorCardId || !ids.has(this.selectionAnchorCardId)) {
            this.selectionAnchorCardId = this.focusedCardId || this.state.cards[0]?.id || null;
        }
    }

    getFocusedCard() {
        return this.getCardById(this.focusedCardId);
    }

    selectCardById(cardId, append = false, range = false) {
        const card = this.getCardById(cardId);
        if (!card) return;
        const previousIds = new Set(this.selectedCardIds);
        const previousFocusedCardId = this.focusedCardId;
        if (range) {
            const anchorId = this.selectionAnchorCardId || this.focusedCardId || card.id;
            const anchorIndex = this.getCardIndexById(anchorId);
            const targetIndex = this.getCardIndexById(card.id);
            if (anchorIndex >= 0 && targetIndex >= 0) {
                if (!append) this.selectedCardIds.clear();
                const start = Math.min(anchorIndex, targetIndex);
                const end = Math.max(anchorIndex, targetIndex);
                for (let i = start; i <= end; i++) {
                    const item = this.state.cards[i];
                    if (item?.id) this.selectedCardIds.add(item.id);
                }
                this.focusedCardId = card.id;
                this.ensureSelectionValid();
                if (this.hasSelectionStateChanged(previousIds, previousFocusedCardId)) this.renderCards();
                else this.updateSelectionStatus();
                return;
            }
        }
        if (!append) this.selectedCardIds.clear();
        if (append && this.selectedCardIds.has(card.id) && this.selectedCardIds.size > 1) {
            this.selectedCardIds.delete(card.id);
        } else {
            this.selectedCardIds.add(card.id);
            this.focusedCardId = card.id;
            this.selectionAnchorCardId = card.id;
        }
        this.ensureSelectionValid();
        if (this.hasSelectionStateChanged(previousIds, previousFocusedCardId)) this.renderCards();
        else this.updateSelectionStatus();
    }

    selectCards(cardIds, append = false) {
        const previousIds = new Set(this.selectedCardIds);
        const previousFocusedCardId = this.focusedCardId;
        if (!append) this.selectedCardIds.clear();
        const ordered = [];
        for (const c of this.state.cards) {
            if (cardIds.includes(c.id)) ordered.push(c.id);
        }
        for (const id of ordered) this.selectedCardIds.add(id);
        if (ordered.length) {
            this.focusedCardId = ordered[0];
            if (!append || !this.selectionAnchorCardId) this.selectionAnchorCardId = ordered[0];
        }
        this.ensureSelectionValid();
        if (this.hasSelectionStateChanged(previousIds, previousFocusedCardId)) this.renderCards();
        else this.updateSelectionStatus();
    }

    hasSelectionStateChanged(previousIds, previousFocusedCardId) {
        if (previousFocusedCardId !== this.focusedCardId) return true;
        if (!(previousIds instanceof Set) || previousIds.size !== this.selectedCardIds.size) return true;
        for (const id of previousIds) {
            if (!this.selectedCardIds.has(id)) return true;
        }
        return false;
    }

    updateSelectionStatus() {
        const selected = this.state.cards.filter((c) => this.selectedCardIds.has(c.id));
        if (!selected.length) {
            this.dom.statusSelection.textContent = "选中卡片: 无";
            return;
        }
        const names = selected.slice(0, 3).map((c) => c.name || "未命名");
        const tail = selected.length > 3 ? ` +${selected.length - 3}` : "";
        const isolatedCardId = typeof this.getPreviewIsolatedCardId === "function" ? this.getPreviewIsolatedCardId() : null;
        const isolatedCard = isolatedCardId && typeof this.getCardById === "function" ? this.getCardById(isolatedCardId) : null;
        const focusTail = isolatedCard ? `（当前只显示 ${isolatedCard.name || "未命名"} 卡片）` : "";
        this.dom.statusSelection.textContent = `选中卡片: ${names.join(", ")}${tail}${focusTail}`;
    }
    updatePreviewFps(now = performance.now()) {
        if (!this.dom?.statusFps) return;
        const ts = Number(now);
        if (!Number.isFinite(ts)) return;
        if (!(this.previewFpsLastTs > 0)) {
            this.previewFpsLastTs = ts;
            this.previewFpsFrames = 0;
            return;
        }
        this.previewFpsFrames += 1;
        const dt = ts - this.previewFpsLastTs;
        if (dt < 400) return;
        const fps = dt > 0 ? (this.previewFpsFrames * 1000 / dt) : 0;
        this.previewFpsFrames = 0;
        this.previewFpsLastTs = ts;
        const text = `FPS: ${fps >= 100 ? fps.toFixed(0) : fps.toFixed(1)}`;
        if (this.lastFpsStatusText !== text) {
            this.lastFpsStatusText = text;
            this.dom.statusFps.textContent = text;
        }
        if (typeof this.updatePreviewCacheStatus === "function") {
            this.updatePreviewCacheStatus();
        }
    }

    addCard() {
        this.pushHistory();
        const card = createDefaultCard(this.state.cards.length);
        this.state.cards.push(card);
        this.focusedCardId = card.id;
        this.selectedCardIds = new Set([card.id]);
        this.selectionAnchorCardId = card.id;
        this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
        this.setEditorWorkspaceView("cards");
    }

    deleteSelectedCards() {
        if (!this.selectedCardIds.size) return;
        this.pushHistory();
        this.state.cards = this.state.cards.filter((c) => !this.selectedCardIds.has(c.id));
        if (!this.state.cards.length) this.state.cards.push(createDefaultCard(0));
        this.focusedCardId = this.state.cards[0].id;
        this.selectedCardIds = new Set([this.focusedCardId]);
        this.selectionAnchorCardId = this.focusedCardId;
        this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
    }

    deleteCardById(cardId) {
        const idx = this.getCardIndexById(cardId);
        if (idx < 0) return;
        this.state.cards.splice(idx, 1);
        if (!this.state.cards.length) this.state.cards.push(createDefaultCard(0));
        const fallback = this.state.cards[Math.max(0, idx - 1)] || this.state.cards[0];
        this.focusedCardId = fallback?.id || null;
        this.selectedCardIds = new Set(this.focusedCardId ? [this.focusedCardId] : []);
        this.selectionAnchorCardId = this.focusedCardId;
    }

    duplicateCardById(cardId) {
        const idx = this.getCardIndexById(cardId);
        if (idx < 0) return;
        const source = this.state.cards[idx];
        const cloned = normalizeCard(deepClone(source), idx + 1);
        cloned.id = uid();
        cloned.name = `${source.name || "卡片"} 副本`;
        cloned.particleInit = cloned.particleInit.map((it) => ({ ...it, id: uid() }));
        cloned.controllerVars = cloned.controllerVars.map((it) => ({ ...it, id: uid() }));
        cloned.controllerActions = cloned.controllerActions.map((it) => ({ ...it, id: uid() }));
        cloned.growthAnimates = cloned.growthAnimates.map((it) => ({ ...it, id: uid() }));
        cloned.sequencedAnimates = cloned.sequencedAnimates.map((it) => ({ ...it, id: uid() }));
        cloned.shapeDisplayActions = (cloned.shapeDisplayActions || []).map((it) => ({ ...it, id: uid() }));
        const reIdTreeNodes = (nodes) => {
            return (nodes || []).map((n, i) => {
                const c = normalizeShapeTreeNode(n, i);
                c.id = uid();
                c.displayActions = (c.displayActions || []).map((it) => ({ ...it, id: uid() }));
                c.growthAnimates = (c.growthAnimates || []).map((it) => ({ ...it, id: uid() }));
                c.particleInit = (c.particleInit || []).map((it) => ({ ...it, id: uid() }));
                c.controllerVars = (c.controllerVars || []).map((it) => ({ ...it, id: uid() }));
                c.controllerActions = (c.controllerActions || []).map((it) => ({ ...it, id: uid() }));
                c.children = reIdTreeNodes(c.children);
                return c;
            });
        };
        cloned.shapeChildren = reIdTreeNodes(cloned.shapeChildren);
        cloned.viewPath = [];
        this.state.cards.splice(idx + 1, 0, cloned);
        this.focusedCardId = cloned.id;
        this.selectedCardIds = new Set([cloned.id]);
        this.selectionAnchorCardId = cloned.id;
    }

    moveCard(cardId, dir) {
        const idx = this.getCardIndexById(cardId);
        if (idx < 0) return;
        const target = clamp(idx + int(dir), 0, this.state.cards.length - 1);
        if (target === idx) return;
        const [card] = this.state.cards.splice(idx, 1);
        this.state.cards.splice(target, 0, card);
    }

    toggleCardFold(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        card.folded = !card.folded;
    }

    setCardFolded(cardId, folded) {
        const card = this.getCardById(cardId);
        if (!card) return;
        card.folded = !!folded;
    }

    setAllCardsFolded(folded) {
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            if (!card || !card.id) continue;
            this.setCardFolded(card.id, folded);
        }
    }

    isCardSectionCollapsed(card, sectionKey) {
        if (!card || !sectionKey) return false;
        const key = String(sectionKey || "");
        if (!CARD_SECTION_KEYS.includes(key)) return false;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        return !!card.sectionCollapse[key];
    }

    setCardSectionCollapsed(card, sectionKey, collapsed) {
        if (!card || !sectionKey) return;
        const key = String(sectionKey || "");
        if (!CARD_SECTION_KEYS.includes(key)) return;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        card.sectionCollapse[key] = !!collapsed;
    }

    toggleCardSectionFold(cardId, sectionKey) {
        const card = this.getCardById(cardId);
        if (!card) return;
        this.setCardSectionCollapsed(card, sectionKey, !this.isCardSectionCollapsed(card, sectionKey));
    }

    setCardAllSectionsCollapsed(cardId, collapsed) {
        const card = this.getCardById(cardId);
        if (!card) return;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        for (const key of CARD_SECTION_KEYS) card.sectionCollapse[key] = !!collapsed;
    }

    setAllCardsSectionsCollapsed(collapsed) {
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            if (!card || !card.id) continue;
            this.setCardAllSectionsCollapsed(card.id, collapsed);
        }
    }

    isCardAllSectionsCollapsed(card) {
        if (!card) return false;
        card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
        return CARD_SECTION_KEYS.every((key) => !!card.sectionCollapse[key]);
    }

    addParticleInit(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        const target = "size";
        card.particleInit.push({
            id: uid(),
            target,
            expr: this.getParticleInitDefaultExprByTarget(target),
            exprPreset: "",
            codegenExpr: "",
            codegenExprPreset: ""
        });
    }

    removeParticleInit(cardId, idx) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (idx >= 0 && idx < card.particleInit.length) card.particleInit.splice(idx, 1);
    }

    addControllerVar(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (!Array.isArray(card.controllerVars)) card.controllerVars = [];
        card.controllerVars.push({
            id: uid(),
            name: this.nextControllerVariableName(card, null, card.controllerVars.length),
            type: "Boolean",
            expr: "true"
        });
    }

    removeControllerVar(cardId, idx) {
        const card = this.getCardById(cardId);
        if (!card) return;
        if (idx >= 0 && idx < card.controllerVars.length) card.controllerVars.splice(idx, 1);
    }

    getControllerVariableReservedNames() {
        const names = new Set(COMPOSITION_LAMBDA_RESERVED_NAMES);
        for (const item of [...(this.state?.globalVars || []), ...(this.state?.globalConsts || [])]) {
            const name = String(item?.name || "").trim();
            if (name) names.add(name);
        }
        return names;
    }

    nextControllerVariableName(card, node, index = 0) {
        const list = node ? node.controllerVars : card?.controllerVars;
        const existingNames = new Set((Array.isArray(list) ? list : []).map((item) => String(item?.name || "").trim()).filter(Boolean));
        return normalizeCompositionControllerVariableName("", {
            reservedNames: this.getControllerVariableReservedNames(),
            existingNames,
            fallbackName: `temp${Math.max(1, int(index) + 1)}`
        });
    }

    normalizeControllerVariableNameForScope(card, node, item, index = 0) {
        if (!item) return "";
        const list = node ? node.controllerVars : card?.controllerVars;
        const existingNames = new Set((Array.isArray(list) ? list : [])
            .filter((candidate) => candidate && candidate !== item)
            .map((candidate) => String(candidate.name || "").trim())
            .filter(Boolean));
        const reservedNames = this.getControllerVariableReservedNames();
        const error = getCompositionControllerVariableNameError(item.name, { reservedNames, existingNames });
        if (!error) return "";
        item.name = normalizeCompositionControllerVariableName(item.name, {
            reservedNames,
            existingNames,
            fallbackName: `temp${Math.max(1, int(index) + 1)}`
        });
        return error;
    }

    onControllerVariableFocusOut(event) {
        const target = event?.target;
        if (!(target instanceof HTMLInputElement)) return;
        const field = String(target.dataset.cvarField || target.dataset.treeNodeCvarField || "");
        if (field !== "name") return;
        const cardId = String(target.dataset.cardId || "");
        const card = this.getCardById(cardId);
        if (!card) return;
        const treePathRaw = String(target.dataset.treePath || "").trim();
        let node = null;
        if (treePathRaw) {
            try {
                node = this.getShapeNodeByPath(card, JSON.parse(treePathRaw));
            } catch {
                return;
            }
        }
        const list = node ? node.controllerVars : card.controllerVars;
        const index = int(target.dataset.treeNodeCvarIdx ?? target.dataset.cvarIdx);
        const item = Array.isArray(list) ? list[index] : null;
        if (!item) return;
        const error = this.normalizeControllerVariableNameForScope(card, node, item, index);
        if (error) {
            target.value = item.name;
            this.showToast(`${error}，已改为 ${item.name}`, "warning");
            this.afterStructureMutate({ rerenderCards: true, rebuildPreview: false, rerenderProject: false });
        }
    }

    addCardAnimate(cardId, key) {
        const card = this.getCardById(cardId);
        if (!card || !Array.isArray(card[key])) return;
        card[key].push(normalizeAnimate({ count: 1, condition: "" }));
    }

    removeCardAnimate(cardId, key, idx) {
        const card = this.getCardById(cardId);
        if (!card || !Array.isArray(card[key])) return;
        if (idx >= 0 && idx < card[key].length) card[key].splice(idx, 1);
    }

    clearBuilder(cardId, target = "root") {
        const card = this.getCardById(cardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        if (/^tree_node:/.test(normalizedTarget)) {
            const treePath = JSON.parse(normalizedTarget.split("tree_node:")[1] || "[]");
            const node = this.getShapeNodeByPath(card, treePath);
            if (!node) return;
            node.bindMode = "builder";
            node.builderState = createDefaultBuilderState();
            return;
        }
        if (normalizedTarget === "shape") {
            card.shapeBuilderState = createDefaultBuilderState();
            card.shapeBindMode = "builder";
            return;
        }
        card.builderState = createDefaultBuilderState();
        card.builderKotlinOverride = "";
    }

    pushHistory(snapshot = null) {
        const snap = normalizeStateShape(snapshot ? deepClone(snapshot) : deepClone(this.state));
        const snapJson = JSON.stringify(snap);
        const lastJson = this.undoStack.length ? JSON.stringify(this.undoStack[this.undoStack.length - 1]) : "";
        if (snapJson === lastJson) return;
        this.undoStack.push(snap);
        if (this.undoStack.length > 120) this.undoStack.shift();
        this.redoStack.length = 0;
    }

    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(deepClone(this.state));
        const prev = this.undoStack.pop();
        this.state = normalizeStateShape(prev);
        this.applySettingsToDom();
        this.ensureSelectionValid();
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.scheduleSave();
    }

    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(deepClone(this.state));
        const next = this.redoStack.pop();
        this.state = normalizeStateShape(next);
        this.applySettingsToDom();
        this.ensureSelectionValid();
        this.renderProjectSection();
        this.renderCards();
        this.rebuildPreview();
        this.generateCodeAndRender(true);
        this.scheduleSave();
    }

    afterStructureMutate(opts = {}) {
        if (this.isImeCompositionActive()) {
            this.queuePendingImeMutate("structure", opts);
            return;
        }
        this.state = normalizeStateShape(this.state);
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.ensureSelectionValid();
        const rerenderProject = opts.rerenderProject !== false;
        const rerenderCards = opts.rerenderCards !== false;
        const rebuildPreview = opts.rebuildPreview !== false;
        const focusState = this.captureEditableFocusState();
        if (rerenderProject) this.renderProjectSection();
        if (rerenderCards) this.renderCards();
        if (rebuildPreview) this.rebuildPreview();
        else if (typeof this.clearPreviewRenderCache === "function") this.clearPreviewRenderCache("structure-mutate");
        this.generateCodeAndRender(this.state.settings.realtimeCode);
        this.writeBuilderCompositionContext();
        this.restoreEditableFocusState(focusState, { rerenderProject, rerenderCards });
        this.scheduleSave();
        if (this.previewPaused && this.renderer) {
            this.updatePreviewAnimation();
            this.renderer.render(this.scene, this.camera);
        }
    }

    afterValueMutate(opts = {}) {
        if (this.isImeCompositionActive()) {
            this.queuePendingImeMutate("value", opts);
            return;
        }
        if (opts.forceImmediate !== true && this.shouldDeferFocusedExpressionMutation()) {
            this.queueDeferredExpressionRefresh(document.activeElement, opts);
            return;
        }
        if (this.exprRuntime?.invalidateCache) this.exprRuntime.invalidateCache();
        this.ensureSelectionValid();
        const rerenderProject = !!opts.rerenderProject;
        const rerenderCards = !!opts.rerenderCards;
        const focusState = this.captureEditableFocusState();
        if (rerenderProject) this.renderProjectSection();
        if (rerenderCards) this.renderCards();
        if (opts.rebuildPreview !== false) this.rebuildPreview();
        else if (typeof this.clearPreviewRenderCache === "function") this.clearPreviewRenderCache("value-mutate");
        this.generateCodeAndRender(this.state.settings.realtimeCode);
        this.writeBuilderCompositionContext();
        this.restoreEditableFocusState(focusState, { rerenderProject, rerenderCards });
        this.scheduleSave();
        if (this.previewPaused && this.renderer) {
            this.updatePreviewAnimation();
            this.renderer.render(this.scene, this.camera);
        }
    }

    isDeferredExpressionTarget(target) {
        if (!target) return false;
        if (target.dataset?.codeEditor) return false;
        return target.matches?.("input.expr-input, textarea.expr-input") === true;
    }

    onCodeEditorFocusOut(event) {
        const target = event?.target;
        if (!target) return;
        if (target instanceof HTMLTextAreaElement && this.flushCodeEditorRefresh?.(target)) return;
        this.flushDeferredExpressionRefresh(target, { forceImmediate: true });
    }

    shouldDeferFocusedExpressionMutation() {
        if (typeof document === "undefined") return false;
        return this.isDeferredExpressionTarget(document.activeElement);
    }

    queueDeferredExpressionRefresh(target, opts = {}) {
        if (!this.isDeferredExpressionTarget(target)) return false;
        if (!(this.pendingExpressionRefreshes instanceof Map)) this.pendingExpressionRefreshes = new Map();
        const next = { ...opts };
        delete next.forceImmediate;
        const previous = this.pendingExpressionRefreshes.get(target) || null;
        this.pendingExpressionRefreshes.set(target, this.mergeMutateOptions(previous, next));
        return true;
    }

    flushDeferredExpressionRefresh(target, opts = {}) {
        if (!(this.pendingExpressionRefreshes instanceof Map)) return false;
        const pending = this.pendingExpressionRefreshes.get(target);
        if (!pending) return false;
        this.pendingExpressionRefreshes.delete(target);
        this.afterValueMutate({ ...pending, ...opts, forceImmediate: true });
        return true;
    }

    flushAllDeferredExpressionRefreshes(opts = {}) {
        if (!(this.pendingExpressionRefreshes instanceof Map) || !this.pendingExpressionRefreshes.size) return false;
        let merged = null;
        for (const pending of this.pendingExpressionRefreshes.values()) {
            merged = this.mergeMutateOptions(merged, pending || {});
        }
        this.pendingExpressionRefreshes.clear();
        this.afterValueMutate({ ...merged, ...opts, forceImmediate: true });
        return true;
    }

    onEditableCompositionStart(e) {
        const target = e?.target;
        if (!(target instanceof HTMLElement)) return;
        target.dataset.imeComposing = "1";
        this.activeImeCompositionCount += 1;
        if (this.pendingImeMutateTimer) {
            clearTimeout(this.pendingImeMutateTimer);
            this.pendingImeMutateTimer = 0;
        }
    }

    onEditableCompositionEnd(e) {
        const target = e?.target;
        if (target instanceof HTMLElement) {
            delete target.dataset.imeComposing;
        }
        this.activeImeCompositionCount = Math.max(0, this.activeImeCompositionCount - 1);
        if (this.pendingImeMutateTimer) clearTimeout(this.pendingImeMutateTimer);
        this.pendingImeMutateTimer = setTimeout(() => {
            this.pendingImeMutateTimer = 0;
            this.flushPendingImeMutate();
        }, 0);
    }

    isImeCompositionActive() {
        if (this.activeImeCompositionCount > 0) return true;
        return !!document.querySelector("[data-ime-composing='1']");
    }

    queuePendingImeMutate(kind, opts = {}) {
        const normalizedKind = kind === "structure" ? "structure" : "value";
        const pending = this.pendingImeMutate;
        if (!pending) {
            this.pendingImeMutate = { kind: normalizedKind, opts: Object.assign({}, opts) };
            return;
        }
        const mergedKind = pending.kind === "structure" || normalizedKind === "structure" ? "structure" : "value";
        this.pendingImeMutate = {
            kind: mergedKind,
            opts: this.mergeMutateOptions(pending.opts, opts)
        };
    }

    flushPendingImeMutate() {
        if (this.isImeCompositionActive()) return;
        const pending = this.pendingImeMutate;
        this.pendingImeMutate = null;
        if (!pending) return;
        if (pending.kind === "structure") {
            this.afterStructureMutate(pending.opts || {});
            return;
        }
        this.afterValueMutate(pending.opts || {});
    }

    captureEditableFocusState() {
        return {
            project: this.captureEditableFocus(this.dom?.projectSection),
            cards: this.captureEditableFocus(this.dom?.cardsRoot)
        };
    }

    captureEditableFocus(root) {
        const active = document.activeElement;
        if (!(root instanceof Element) || !(active instanceof HTMLElement) || !root.contains(active)) return null;
        const tag = String(active.tagName || "").toLowerCase();
        const role = String(active.getAttribute?.("role") || "");
        const isEditable = tag === "input" || tag === "textarea" || tag === "select" || active.isContentEditable || role === "textbox" || role === "combobox";
        if (!isEditable) return null;
        const dataset = {};
        for (const [key, value] of Object.entries(active.dataset || {})) {
            if (value !== undefined && value !== null && String(value) !== "") dataset[key] = String(value);
        }
        return {
            id: active.id ? String(active.id) : "",
            tag,
            type: String(active.getAttribute?.("type") || ""),
            role,
            dataset,
            selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
            selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
            selectionDirection: typeof active.selectionDirection === "string" ? active.selectionDirection : null
        };
    }

    restoreEditableFocusState(state, opts = {}) {
        if (opts.rerenderProject) this.restoreEditableFocus(this.dom?.projectSection, state?.project);
        if (opts.rerenderCards) this.restoreEditableFocus(this.dom?.cardsRoot, state?.cards);
    }

    restoreEditableFocus(root, snapshot) {
        if (!(root instanceof Element) || !snapshot) return;
        const selector = this.buildEditableFocusSelector(snapshot);
        if (!selector) return;
        const next = root.querySelector(selector);
        if (!(next instanceof HTMLElement)) return;
        try {
            next.focus({ preventScroll: true });
        } catch {
            try {
                next.focus();
            } catch {
                return;
            }
        }
        if (typeof next.setSelectionRange !== "function") return;
        if (typeof snapshot.selectionStart !== "number" || typeof snapshot.selectionEnd !== "number") return;
        const valueLength = String(next.value || "").length;
        const start = Math.max(0, Math.min(snapshot.selectionStart, valueLength));
        const end = Math.max(start, Math.min(snapshot.selectionEnd, valueLength));
        try {
            next.setSelectionRange(start, end, snapshot.selectionDirection || "none");
        } catch {
        }
    }

    buildEditableFocusSelector(snapshot) {
        if (!snapshot) return "";
        if (snapshot.id) return `#${this.escapeCssSelector(snapshot.id)}`;
        const tag = snapshot.tag || "input";
        const parts = [tag];
        if (snapshot.type) parts.push(`[type="${this.escapeCssSelector(snapshot.type)}"]`);
        if (snapshot.role) parts.push(`[role="${this.escapeCssSelector(snapshot.role)}"]`);
        const datasetEntries = Object.entries(snapshot.dataset || {}).sort(([a], [b]) => a.localeCompare(b));
        for (const [key, value] of datasetEntries) {
            const attr = `data-${String(key).replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
            parts.push(`[${attr}="${this.escapeCssSelector(value)}"]`);
        }
        return parts.join("");
    }

    escapeCssSelector(value) {
        const raw = String(value || "");
        if (globalThis.CSS && typeof globalThis.CSS.escape === "function") return globalThis.CSS.escape(raw);
        return raw.replace(/([#.;,:+*~'"!^$\[\]()=>|/@ ])/g, "\\$1");
    }

    mergeMutateOptions(base = null, next = {}) {
        const out = Object.assign({}, base || {});
        for (const [k, v] of Object.entries(next || {})) {
            if (typeof v === "boolean") out[k] = (out[k] === true) || v;
            else out[k] = v;
        }
        return out;
    }

    scheduleSave() {
        if (this.referenceSamplerMode) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveStateNow(), 220);
    }

    saveStateNow() {
        try {
            if (this.referenceSamplerMode) {
                // The hidden sampler shares localStorage with the editor, but it
                // must never persist its temporary Composition runtime state.
                this.writeBuilderCompositionContext();
                return;
            }
            saveCompositionStateToStorage(localStorage, this.state);
            this.writeBuilderCompositionContext();
        } catch (e) {
            console.warn("save state failed:", e);
        }
    }

    savePreferencesNow() {
        if (this.referenceSamplerMode) return;
        try {
            saveCompositionPreferencesToStorage(localStorage, this.state);
        } catch (e) {
            console.warn("save preferences failed:", e);
        }
    }

    isBuilderContextNumericType(typeName = "") {
        return ["Int", "Long", "Float", "Double"].includes(String(typeName || "").trim());
    }

    isBuilderContextVectorType(typeName = "") {
        return ["Vec3", "RelativeLocation", "Vector3f"].includes(String(typeName || "").trim());
    }

    normalizeBuilderContextSymbolEntry(item, extra = {}) {
        const name = String(item?.name || "").trim();
        const type = String(item?.type || "").trim();
        const value = String(item?.value ?? item?.expr ?? "").trim();
        const ref = String(extra?.ref || name).trim() || name;
        return {
            name,
            type,
            value,
            ref,
            scope: String(extra?.scope || "").trim(),
            path: Array.isArray(extra?.path) ? extra.path.slice() : []
        };
    }

    collectBuilderScopedLocalVars(card, target = "root") {
        const out = [];
        const pushList = (list, scope, path = []) => {
            if (!Array.isArray(list)) return;
            for (const item of list) {
                const entry = this.normalizeBuilderContextSymbolEntry(item, {
                    scope,
                    path,
                    ref: String(item?.name || "").trim()
                });
                if (!entry.name) continue;
                out.push(entry);
            }
        };
        if (!card) return out;
        pushList(card.controllerVars, "card", []);
        const normalizedTarget = normalizeBuilderTarget(target);
        if (!/^tree_node:/.test(normalizedTarget)) return out;
        try {
            const treePath = JSON.parse(normalizedTarget.slice("tree_node:".length));
            if (!Array.isArray(treePath) || !treePath.length) return out;
            for (let depth = 0; depth < treePath.length; depth++) {
                const node = this.getShapeNodeByPath(card, treePath.slice(0, depth + 1));
                if (!node) break;
                pushList(node.controllerVars, "tree_node", treePath.slice(0, depth + 1));
            }
        } catch {
        }
        return out;
    }

    writeBuilderCompositionContext(card = null, target = "root", options = {}) {
        try {
            const projectName = String(this.state.projectName || "NewComposition");
            const projectClass = sanitizeKotlinClassName(projectName || "NewComposition");
            const compositionRevision = compositionReferenceStateRevision(this.state);
            let previous = null;
            try {
                const rawPrevious = localStorage.getItem(CPB_COMP_CONTEXT_KEY);
                if (rawPrevious) previous = JSON.parse(rawPrevious);
            } catch {
                previous = null;
            }
            const contextCard = card || this.getCardById?.(previous?.cardId) || null;
            const contextTarget = card
                ? normalizeBuilderTarget(target)
                : normalizeBuilderTarget(previous?.target || target);
            const globalVars = (this.state.globalVars || []).map((it) => this.normalizeBuilderContextSymbolEntry(it, {
                scope: "global",
                ref: `this@${projectClass}.${String(it?.name || "").trim()}`
            })).filter((it) => !!it.name);
            const globalConsts = (this.state.globalConsts || []).map((it) => this.normalizeBuilderContextSymbolEntry(it, {
                scope: "global_const",
                ref: String(it?.name || "").trim()
            })).filter((it) => !!it.name);
            const localVars = this.collectBuilderScopedLocalVars(contextCard, contextTarget);
            const compositionCards = (this.state.cards || []).map((item) => ({
                id: String(item?.id || ""),
                name: String(item?.name || ""),
                dataType: String(item?.dataType || "single"),
                shapeChildren: Array.isArray(item?.shapeChildren)
                    ? item.shapeChildren.map((node) => this.serializeCompositionReferenceShapeNode(node))
                    : []
            }));
            const hasReferenceOverride = Object.prototype.hasOwnProperty.call(options || {}, "compositionReferenceOverride");
            const previousReference = previous?.compositionReference && typeof previous.compositionReference === "object"
                ? previous.compositionReference
                : null;
            const sameReferenceTarget = !!previousReference
                && String(previous?.cardId || "") === String(contextCard?.id || "")
                && normalizeBuilderTarget(previous?.target || "root") === contextTarget
                && String(previous?.compositionReferenceRevision || "") === compositionRevision
                && String(previousReference.currentCardId || contextCard?.id || "") === String(contextCard?.id || "")
                && normalizeBuilderTarget(previousReference.currentTarget || contextTarget) === contextTarget;
            const preservePendingReference = hasReferenceOverride
                && !options.compositionReferenceOverride
                && previous?.compositionReferenceStatus === "pending"
                && sameReferenceTarget
                && String(previousReference?.compositionRevision || previous?.compositionReferenceRevision || "") === compositionRevision;
            const compositionReference = hasReferenceOverride
                ? (preservePendingReference ? previousReference : (options.compositionReferenceOverride || null))
                : (sameReferenceTarget ? previousReference : null);
            const compositionReferenceStatus = hasReferenceOverride
                ? String(options.compositionReferenceStatus || (compositionReference ? "ready" : "unavailable"))
                : (sameReferenceTarget
                    ? String(previous?.compositionReferenceStatus || (compositionReference ? "ready" : "unavailable"))
                    : "pending");
            const contextPayload = {
                source: "composition_builder",
                ts: Date.now(),
                projectName,
                projectClass,
                cardId: String(contextCard?.id || previous?.cardId || "").trim(),
                target: contextTarget,
                globalVars,
                globalConsts,
                localVars,
                numericMap: this.getBuilderNumericContextMap(),
                compositionState: {
                    projectName,
                    cards: compositionCards,
                    revision: compositionRevision
                },
                compositionReferenceRevision: compositionRevision,
                compositionReference,
                compositionReferenceStatus
            };
            try {
                localStorage.setItem(CPB_COMP_CONTEXT_KEY, JSON.stringify(contextPayload));
            } catch (error) {
                try {
                    localStorage.removeItem(CPB_COMP_CONTEXT_KEY);
                } catch {
                }
                if (compositionReference) {
                    try {
                        localStorage.setItem(CPB_COMP_CONTEXT_KEY, JSON.stringify({
                            ...contextPayload,
                            compositionReference: null,
                            compositionReferenceStatus: "storage_limit"
                        }));
                    } catch {
                    }
                }
                console.warn("write builder composition context failed:", error);
            }
        } catch {
        }
    }

    serializeCompositionReferenceShapeNode(node) {
        if (!node || typeof node !== "object") return null;
        return {
            id: String(node.id || ""),
            name: String(node.name || ""),
            type: String(node.type || "single"),
            children: Array.isArray(node.children)
                ? node.children.map((child) => this.serializeCompositionReferenceShapeNode(child)).filter(Boolean)
                : []
        };
    }

    invalidateBuilderCompositionReferenceSnapshot() {
        let previous = null;
        try {
            const raw = localStorage.getItem(CPB_COMP_CONTEXT_KEY);
            previous = raw ? JSON.parse(raw) : null;
        } catch {
            previous = null;
        }
        const contextCard = this.getCardById?.(this.builderModalCardId || this.focusedCardId)
            || this.getCardById?.(previous?.cardId)
            || null;
        const contextTarget = normalizeBuilderTarget(this.builderModalTarget || previous?.target || "root");
        this.writeBuilderCompositionContext(contextCard, contextTarget, {
            compositionReferenceOverride: null,
            compositionReferenceStatus: "pending"
        });
    }

    scheduleBuilderCompositionReferenceSnapshot(card = null, target = null) {
        if (typeof this.builderCompositionReferenceResolve === "function") {
            this.builderCompositionReferenceResolve(null);
            this.builderCompositionReferenceResolve = null;
        }
        if (this.builderCompositionReferenceHandle) {
            try {
                clearTimeout(this.builderCompositionReferenceHandle);
            } catch {
            }
        }
        this.builderCompositionReferenceRequestId = Number(this.builderCompositionReferenceRequestId || 0) + 1;
        const requestId = this.builderCompositionReferenceRequestId;
        let previousContext = null;
        try {
            const raw = localStorage.getItem(CPB_COMP_CONTEXT_KEY);
            previousContext = raw ? JSON.parse(raw) : null;
        } catch {
            previousContext = null;
        }
        const contextCard = card
            || this.getCardById?.(this.builderModalCardId || this.focusedCardId)
            || this.getCardById?.(previousContext?.cardId)
            || null;
        const contextTarget = normalizeBuilderTarget(target || this.builderModalTarget || previousContext?.target || "root");
        const compositionRevision = compositionReferenceStateRevision(this.state);
        const storageKey = `${COMPOSITION_REFERENCE_STORAGE_PREFIX}${String(this.state.projectName || "NewComposition")}:${compositionRevision}:${String(contextCard?.id || "")}:${normalizeBuilderTarget(contextTarget)}`;
        const contextStillOwned = () => {
            try {
                const raw = localStorage.getItem(CPB_COMP_CONTEXT_KEY);
                const current = raw ? JSON.parse(raw) : null;
                return String(current?.cardId || "") === String(contextCard?.id || "")
                    && normalizeBuilderTarget(current?.target || "root") === contextTarget
                    && String(current?.compositionReferenceRevision || "") === compositionRevision;
            } catch {
                return false;
            }
        };
        const run = async () => {
            this.builderCompositionReferenceHandle = 0;
            if (requestId !== this.builderCompositionReferenceRequestId) return;
            // Preview geometry is built during idle time. Do not sample against the
            // empty arrays exposed during that rebuild; wait without blocking the
            // Composition render loop, then capture the ready preview state.
            const waitStartedAt = performance.now();
            while (requestId === this.builderCompositionReferenceRequestId
                && (this.previewBuildInProgress === true
                    || this.previewBuildQueued === true
                    || !Array.isArray(this.previewBasePoints)
                    || !this.previewBasePoints.length)
                && performance.now() - waitStartedAt < 5000) {
                await new Promise((resolve) => setTimeout(resolve, 16));
            }
            if (requestId !== this.builderCompositionReferenceRequestId) return;
            let pendingProgress = null;
            let progressWritePromise = null;
            let lastPersistedProgressFrameCount = 0;
            const progressCheckpointStride = 32;
            const writeProgressSnapshot = async (progress) => {
                if (requestId !== this.builderCompositionReferenceRequestId || !progress) return;
                try {
                    const totalTicks = Math.max(1, Math.trunc(Number(progress.totalTicks) || 1));
                    const availableFrameCount = progress.gpu?.enabled === true
                        ? Math.max(0, Math.trunc(Number(progress.gpu.timeline?.length) || 0))
                        : (Array.isArray(progress.frames) ? progress.frames.length : 0);
                    const frameCount = Math.max(totalTicks, availableFrameCount);
                    await putCompositionReferenceSnapshot(storageKey, {
                        version: progress.version,
                        encoding: progress.encoding,
                        frameTicks: progress.frameTicks,
                        owners: progress.owners,
                        visibleMasks: progress.visibleMasks,
                        colors: progress.colors,
                        sizes: progress.sizes,
                        alphas: progress.alphas,
                        currentAnchorRefs: progress.currentAnchorRefs,
                        currentSourcePoints: progress.currentSourcePoints,
                        groups: progress.groups,
                        frames: progress.frames,
                        currentCardId: progress.currentCardId,
                        currentTarget: progress.currentTarget,
                        currentOwnerId: progress.currentOwnerId,
                        compositionRevision,
                        sourcePointTotal: progress.sourcePointTotal,
                        sampled: progress.sampled,
                        frameSampled: progress.frameSampled,
                        totalTicks: progress.totalTicks,
                        gpu: progress.gpu,
                        frameCount,
                        availableFrameCount,
                        referenceVersion: COMPOSITION_REFERENCE_BUILD_VERSION,
                        complete: false
                    });
                    const metadata = {
                        ...progress,
                        gpu: progress.gpu?.enabled === true
                            ? {
                                enabled: true,
                                version: progress.gpu.version || 1,
                                pointCount: progress.gpu.pointCount || 0,
                                timelineCount: availableFrameCount
                            }
                            : null,
                        storage: "indexeddb",
                        storageKey,
                        frameCount,
                        availableFrameCount,
                        frames: [],
                        visibleMasks: [],
                        colors: [],
                        sizes: [],
                        alphas: [],
                        referenceVersion: COMPOSITION_REFERENCE_BUILD_VERSION,
                        compositionRevision,
                        complete: false
                    };
                    if (contextStillOwned()) {
                        this.writeBuilderCompositionContext(contextCard, contextTarget, {
                            compositionReferenceOverride: metadata,
                            compositionReferenceStatus: "pending"
                        });
                    }
                } catch (error) {
                    console.warn("write partial builder composition reference snapshot failed:", error);
                }
            };
            const drainProgressWrites = async () => {
                while (pendingProgress && requestId === this.builderCompositionReferenceRequestId) {
                    const progress = pendingProgress;
                    pendingProgress = null;
                    await writeProgressSnapshot(progress);
                }
                progressWritePromise = null;
            };
            const persistProgress = (progress) => {
                if (requestId !== this.builderCompositionReferenceRequestId || !progress) return;
                const frameCount = progress.gpu?.enabled === true
                    ? Math.max(0, Math.trunc(Number(progress.gpu.timeline?.length) || 0))
                    : (Array.isArray(progress.frames) ? progress.frames.length : 0);
                const totalTicks = Math.max(1, Math.trunc(Number(progress.totalTicks) || 1));
                const isFirst = frameCount <= 1;
                const isComplete = frameCount >= totalTicks;
                if (!isFirst && !isComplete && frameCount - lastPersistedProgressFrameCount < progressCheckpointStride) return;
                lastPersistedProgressFrameCount = frameCount;
                pendingProgress = progress;
                if (!progressWritePromise) {
                    progressWritePromise = drainProgressWrites();
                }
            };
            const snapshot = await Promise.resolve(this.buildBuilderCompositionReferenceSnapshot?.(
                contextCard?.id || "",
                contextTarget,
                requestId,
                { onProgress: persistProgress }
            ) || null);
            if (requestId !== this.builderCompositionReferenceRequestId) return;
            if (!snapshot) {
                if (contextStillOwned()) {
                    this.writeBuilderCompositionContext(contextCard, contextTarget, {
                        compositionReferenceOverride: null,
                        compositionReferenceStatus: "unavailable"
                    });
                }
                return;
            }
            // Worker sampling publishes partial checkpoints asynchronously. Drain
            // the last checkpoint before writing the complete snapshot so an older
            // IndexedDB transaction cannot finish after the final one and roll the
            // PointsBuilder back to a partial timeline.
            while (progressWritePromise && requestId === this.builderCompositionReferenceRequestId) {
                await progressWritePromise;
            }
            if (requestId !== this.builderCompositionReferenceRequestId) return;
            try {
                await putCompositionReferenceSnapshot(storageKey, {
                    version: snapshot.version,
                    encoding: snapshot.encoding,
                    frames: snapshot.frames,
                    visibleMasks: snapshot.visibleMasks,
                    colors: snapshot.colors,
                    sizes: snapshot.sizes,
                    alphas: snapshot.alphas,
                    frameTicks: snapshot.frameTicks,
                    owners: snapshot.owners,
                    currentAnchorRefs: snapshot.currentAnchorRefs,
                    currentSourcePoints: snapshot.currentSourcePoints,
                    groups: snapshot.groups,
                    currentCardId: snapshot.currentCardId,
                    currentTarget: snapshot.currentTarget,
                    currentOwnerId: snapshot.currentOwnerId,
                    sourcePointTotal: snapshot.sourcePointTotal,
                    sampled: snapshot.sampled,
                    frameSampled: snapshot.frameSampled,
                    totalTicks: snapshot.totalTicks,
                    gpu: snapshot.gpu,
                    frameCount: Math.max(
                        snapshot.gpu?.enabled === true
                            ? Math.trunc(Number(snapshot.gpu.timeline?.length) || 0)
                            : snapshot.frames.length,
                        Math.max(1, Math.trunc(Number(snapshot.totalTicks) || 1))
                    ),
                    referenceVersion: COMPOSITION_REFERENCE_BUILD_VERSION,
                    compositionRevision,
                    complete: true
                });
                const metadata = {
                    ...snapshot,
                    gpu: snapshot.gpu?.enabled === true
                        ? {
                            enabled: true,
                            version: snapshot.gpu.version || 1,
                            pointCount: snapshot.gpu.pointCount || 0,
                            timelineCount: Math.max(0, Math.trunc(Number(snapshot.gpu.timeline?.length) || 0))
                        }
                        : null,
                    storage: "indexeddb",
                    storageKey,
                    frameCount: Math.max(
                        snapshot.frames.length,
                        Math.max(1, Math.trunc(Number(snapshot.totalTicks) || 1))
                    ),
                    availableFrameCount: snapshot.gpu?.enabled === true
                        ? Math.max(0, Math.trunc(Number(snapshot.gpu.timeline?.length) || 0))
                        : snapshot.frames.length,
                    frames: [],
                    visibleMasks: [],
                    colors: [],
                    sizes: [],
                    alphas: [],
                    referenceVersion: COMPOSITION_REFERENCE_BUILD_VERSION,
                    compositionRevision,
                    complete: true
                };
                if (contextStillOwned()) {
                    this.writeBuilderCompositionContext(contextCard, contextTarget, {
                        compositionReferenceOverride: metadata,
                        compositionReferenceStatus: "ready"
                    });
                }
            } catch (error) {
                console.warn("write builder composition reference snapshot failed:", error);
                if (contextStillOwned()) {
                    this.writeBuilderCompositionContext(contextCard, contextTarget, {
                        compositionReferenceOverride: null,
                        compositionReferenceStatus: "storage_unavailable"
                    });
                }
            }
        };
        const generation = new Promise((resolve) => {
            this.builderCompositionReferenceResolve = resolve;
            const invoke = () => Promise.resolve().then(run).catch((error) => {
                if (requestId === this.builderCompositionReferenceRequestId) {
                    console.warn("build builder composition reference snapshot failed:", error);
                    if (contextStillOwned()) {
                        this.writeBuilderCompositionContext(contextCard, contextTarget, {
                            compositionReferenceOverride: null,
                            compositionReferenceStatus: "unavailable"
                        });
                    }
                }
                return null;
            }).then(resolve);
            // requestIdleCallback is throttled indefinitely in a background
            // CompositionBuilder tab. A short timer keeps entry lazy while
            // allowing the Worker sampler to start when PointsBuilder is open.
            this.builderCompositionReferenceHandle = setTimeout(invoke, 40);
        });
        this.builderCompositionReferencePromise = generation;
        generation.finally(() => {
            if (this.builderCompositionReferencePromise === generation) {
                this.builderCompositionReferencePromise = null;
                this.builderCompositionReferenceResolve = null;
            }
        });
        return generation;
    }

    getBuilderCompositionReferenceCurrentSourceRefs(owners = [], currentCardId = "", currentTarget = "root") {
        const list = Array.isArray(owners) ? owners : [];
        const currentId = String(currentCardId || "");
        const currentTargetPath = getBuilderTargetShapePath(currentTarget);
        const currentTargetPathKey = currentTargetPath.join(".");
        const anchorRefs = Array.isArray(this.previewAnchorRef) ? this.previewAnchorRef : [];
        const levelRefs = Array.isArray(this.previewLevelRefs) ? this.previewLevelRefs : [];
        const levelPaths = Array.isArray(this.previewLevelPaths) ? this.previewLevelPaths : [];
        return list.map((owner, pointIndex) => {
            const ownerId = String(owner || "");
            const currentCardOwner = ownerId === currentId || ownerId.startsWith(`${currentId}::shape:`);
            if (!currentCardOwner) return -1;
            if (!currentTargetPath.length) {
                return Math.max(0, Math.trunc(Number(anchorRefs[pointIndex]) || 0));
            }
            const refs = Array.isArray(levelRefs[pointIndex]) ? levelRefs[pointIndex] : [];
            const paths = Array.isArray(levelPaths[pointIndex]) ? levelPaths[pointIndex] : [];
            for (let levelIndex = 0; levelIndex < paths.length; levelIndex++) {
                const path = Array.isArray(paths[levelIndex]) ? paths[levelIndex] : [];
                if (path.join(".") !== currentTargetPathKey) continue;
                const ref = Number(refs[levelIndex]);
                return Number.isFinite(ref) ? Math.max(0, Math.trunc(ref)) : -1;
            }
            return -1;
        });
    }

    async sampleBuilderCompositionReferenceFramesWithWorker({
        cycleCfg,
        frameCount,
        frameTicks = [],
        totalTicks = 1,
        totalCount,
        owners,
        groups,
        currentCardId,
        currentTarget,
        currentSourceRefs,
        currentSourcePoints,
        sourcePointTotal,
        progressChunkSize,
        requestId,
        onProgress
    } = {}) {
        if (typeof Worker !== "function" || typeof this.makePreviewRenderWorkerSnapshot !== "function") return null;
        const count = Math.max(0, Math.trunc(Number(totalCount) || 0));
        const total = Math.max(1, Math.trunc(Number(frameCount) || 0));
        const ticks = Array.isArray(frameTicks) && frameTicks.length === total
            ? frameTicks.map((tick) => Math.max(0, Math.trunc(Number(tick) || 0)))
            : Array.from({ length: total }, (_, index) => index);
        const timelineTicks = Math.max(1, Math.trunc(Number(totalTicks) || total));
        if (!count || !total) return null;
        let snapshot = null;
        try {
            snapshot = this.makePreviewRenderWorkerSnapshot(count, cycleCfg);
        } catch {
            snapshot = null;
        }
        if (!snapshot?.snapshotSignature) return null;
        snapshot.previewReferenceAllCards = true;
        // Large Composition snapshots are expensive to clone into multiple
        // workers. One worker avoids duplicating the full point graph while
        // keeping the renderer responsive during long reference cycles.
        const workerCount = count >= 5000
            ? 1
            : Math.max(1, Math.min(2, Math.max(1, Math.trunc(Number(globalThis.navigator?.hardwareConcurrency || 2) - 1))));
        const workerUrl = new URL("./preview_render_cache_worker.js?v=20260826_1", import.meta.url);
        const workers = [];
        const frames = new Array(total);
        const colors = new Array(total);
        const sizes = new Array(total);
        const alphas = new Array(total);
        const visibleMasks = new Array(total);
        const pending = new Map();
        let nextFrame = 0;
        let completed = 0;
        let ready = 0;
        let settled = false;
        let startupTimeout = 0;
        const dispose = () => {
            if (startupTimeout) {
                clearTimeout(startupTimeout);
                startupTimeout = 0;
            }
            for (const worker of workers) {
                try {
                    worker.onmessage = null;
                    worker.onerror = null;
                    worker.terminate();
                } catch {
                }
            }
            workers.length = 0;
            pending.clear();
        };
        const contiguousCount = () => {
            let length = 0;
            while (length < total && frames[length]) length += 1;
            return length;
        };
        const publishProgress = () => {
            if (typeof onProgress !== "function") return;
            const countReady = contiguousCount();
            if (!countReady || (countReady !== 1 && countReady < total && countReady % Math.max(1, progressChunkSize) !== 0)) return;
            onProgress({
                version: 3,
                encoding: "float32-typed-array",
                frameTicks: ticks.slice(0, countReady),
                owners: owners.map((owner) => String(owner || "")),
                visibleMasks: visibleMasks.slice(0, countReady),
                colors: colors.slice(0, countReady),
                sizes: sizes.slice(0, countReady),
                alphas: alphas.slice(0, countReady),
                currentAnchorRefs: currentSourceRefs,
                currentSourcePoints: currentSourcePoints?.length ? currentSourcePoints : null,
                groups: groups.filter((group) => group.pointCount > 0),
                frames: frames.slice(0, countReady),
                currentCardId: String(currentCardId || ""),
                currentTarget: normalizeBuilderTarget(currentTarget),
                currentOwnerId: compositionReferenceNodeId(String(currentCardId || ""), getBuilderTargetShapePath(currentTarget)),
                sourcePointTotal,
                sampled: sourcePointTotal > count,
                frameSampled: total < timelineTicks,
                totalTicks: timelineTicks
            });
        };
        return new Promise((resolve) => {
            const finish = (result) => {
                if (settled) return;
                settled = true;
                dispose();
                resolve(result);
            };
            const fail = (reason = "unknown") => {
                console.warn("Composition reference Worker sampling failed:", reason);
                finish(null);
            };
            const dispatchNext = (worker) => {
                if (settled || (requestId && requestId !== this.builderCompositionReferenceRequestId)) return fail("request-cancelled");
                if (nextFrame >= total) return;
                const index = nextFrame++;
                const id = `composition-reference:${Date.now().toString(36)}:${index}`;
                pending.set(id, index);
                try {
                    worker.postMessage({
                        type: "renderFrame",
                        id,
                        generation: 1,
                        snapshotSignature: snapshot.snapshotSignature,
                        cycleCfg,
                        totalCount: count,
                        frameTime: {
                            totalCount: count,
                            elapsedTick: ticks[index],
                            globalCycleAge: ticks[index],
                            cycleIndex: 0,
                            cycleCfg
                        }
                    });
                } catch {
                    fail("post-render-frame");
                }
            };
            const onMessage = (worker, event) => {
                const data = event?.data || {};
                if (data.type === "snapshotReady") {
                    ready += 1;
                    if (ready === workers.length) {
                        if (startupTimeout) {
                            clearTimeout(startupTimeout);
                            startupTimeout = 0;
                        }
                        for (const item of workers) dispatchNext(item);
                    }
                    return;
                }
                if (data.type === "snapshotError" || data.type === "renderFrameError") return fail(data.message || data.type);
                if (data.type !== "renderFrameReady") return;
                const index = pending.get(data.id);
                pending.delete(data.id);
                if (!Number.isFinite(index) || !data.frame) return fail("missing-frame");
                const positions = data.frame.positions;
                if (!(positions instanceof Float32Array) || positions.length !== count * 3) return fail("invalid-positions");
                frames[index] = Float32Array.from(positions);
                const colorFrame = data.frame.colors;
                colors[index] = colorFrame && typeof colorFrame.length === "number"
                    ? (colorFrame instanceof Uint8Array ? Uint8Array.from(colorFrame) : Float32Array.from(colorFrame))
                    : null;
                const sizeFrame = data.frame.sizes;
                sizes[index] = sizeFrame && typeof sizeFrame.length === "number"
                    ? Float32Array.from(sizeFrame)
                    : null;
                const alphaFrame = data.frame.alphas;
                alphas[index] = alphaFrame && typeof alphaFrame.length === "number"
                    ? (alphaFrame instanceof Uint8Array ? Uint8Array.from(alphaFrame) : Float32Array.from(alphaFrame))
                    : null;
                const mask = data.frame.visibleMask;
                visibleMasks[index] = mask instanceof Uint8Array
                    ? Uint8Array.from(mask)
                    : Uint8Array.from({ length: count }, (_, pointIndex) => mask?.[pointIndex] === false || mask?.[pointIndex] === 0 ? 0 : 1);
                completed += 1;
                publishProgress();
                if (completed >= total) return finish({ frames, colors, sizes, alphas, visibleMasks });
                dispatchNext(worker);
            };
            try {
                for (let index = 0; index < workerCount; index++) {
                    const worker = new Worker(workerUrl, {
                        type: "module",
                        name: `composition-reference-sampler-${index + 1}`
                    });
                    worker.onmessage = (event) => onMessage(worker, event);
                    worker.onerror = (event) => fail(event?.message || "worker-error");
                    workers.push(worker);
                }
                for (const worker of workers) {
                    worker.postMessage({ type: "setSnapshot", generation: 1, snapshot });
                }
                startupTimeout = setTimeout(() => fail("worker-start-timeout"), count >= 5000 ? 15000 : 5000);
            } catch {
                fail("worker-create-or-snapshot-post");
            }
        });
    }

    buildBuilderCompositionReferenceGpuSnapshot({
        frameTicks = [],
        cycleCfg = null,
        owners = [],
        groups = [],
        currentCardId = "",
        currentTarget = "root",
        currentSourceRefs = [],
        currentSourcePoints = [],
        sourcePointTotal = 0,
        totalTicks = 1
    } = {}) {
        if (!this.pointsGeom) return null;
        const basePoints = Array.isArray(this.previewBasePoints) ? this.previewBasePoints : [];
        if (!basePoints.length || !Array.isArray(frameTicks) || !frameTicks.length) return null;
        const livePointsGeom = this.pointsGeom;
        const referencePointsGeom = typeof livePointsGeom.clone === "function"
            ? livePointsGeom.clone()
            : null;
        if (!referencePointsGeom) return null;
        const originalReferenceAllCards = this.previewReferenceAllCards === true;
        const transientKeys = Object.keys(this).filter((key) => (
            key === "previewReferenceAllCards"
            || key === "previewVisibleMask"
            || key === "previewInteractionVisibleMask"
            || key === "previewSceneDirty"
            || key === "previewRuntimeGlobals"
            || key === "previewRuntimeAppliedTick"
            || key === "previewRuntimeCycleIndex"
            || key === "previewManualProjectScaleTick"
            || key.startsWith("previewGpu")
        ));
        const transientValues = new Map(transientKeys.map((key) => [key, this[key]]));
        const livePointsMesh = this.pointsMesh;
        const liveShaderRef = this._pointsShaderRef;
        const liveClearPreviewRenderCache = this.clearPreviewRenderCache;
        const liveDisposePreviewRenderCacheWorkerPool = this.disposePreviewRenderCacheWorkerPool;
        const liveSyncPreviewGpuParticleStatus = this.syncPreviewGpuParticleStatus;
        const livePreviewAnimStart = this.previewAnimStart;
        try {
            // Build the all-card metadata on a detached geometry. The reference
            // sampler must not reconfigure the live Composition geometry: doing so
            // changes its visibility mask and can make the next Composition page
            // render every point instead of the original preview state.
            this.pointsGeom = referencePointsGeom;
            this.pointsMesh = null;
            this._pointsShaderRef = null;
            this.clearPreviewRenderCache = () => {};
            this.disposePreviewRenderCacheWorkerPool = () => {};
            this.syncPreviewGpuParticleStatus = () => {};
            this.previewReferenceAllCards = true;
            this.configurePreviewGpuParticlePath?.();
            // All-card mode can reveal a CPU-only or otherwise incompatible
            // card that was hidden by the normal Composition preview.
            // Per-point transforms are updated in an attribute every tick; the
            // reference cache stores static attributes plus uniform timelines,
            // so those cases must use the CPU sampler instead of stale data.
            if (this.previewGpuParticlePathEnabled !== true
                || this.previewGpuPerPointTransformEnabled === true) return null;
            const positionAttr = this.pointsGeom.getAttribute?.("position");
            if (!positionAttr?.array || positionAttr.array.length !== basePoints.length * 3) return null;
            const attributeNames = [
                "position", "color", "aSize", "aAlpha", "aGpuMeta", "aGpuFadeIn",
                "aGpuFadeOut", "aGpuTransform", "aGpuTransformVector", "aGpuScale",
                "aGpuLifecycle", "aGpuAlphaCurve", "aGpuScaleCurve", "aGpuColorCurve"
            ];
            const attributes = {};
            for (const name of attributeNames) {
                const array = this.pointsGeom.getAttribute?.(name)?.array;
                if (array && typeof array.length === "number") {
                    attributes[name] = Float32Array.from(array);
                }
            }
            // Reuse the same lightweight global runtime progression as the live
            // Composition preview. This is where manual project helpers (such as
            // scaleHelper.doScale()) advance; skipping it leaves the GPU matrix
            // at the initial scale and collapses the reference into the origin.
            this.previewRuntimeGlobals = null;
            this.previewRuntimeAppliedTick = -1;
            this.previewRuntimeCycleIndex = -1;
            this.previewManualProjectScaleTick = 0;
            // GPU animation code derives the tick from `now - previewAnimStart`.
            // A detached sampler may not have a live animation clock; use a
            // deterministic epoch so nested Composition transforms still
            // advance at the requested tick instead of collapsing at Tick 0.
            const animationBase = Number(this.previewAnimStart);
            this.previewAnimStart = Number.isFinite(animationBase) ? animationBase : 0;
            const timeline = [];
            for (const tick of frameTicks) {
                const elapsedTick = Math.max(0, Number(tick) || 0);
                if (typeof this.updatePreviewGpuParticleAnimation === "function") {
                    const now = this.previewAnimStart + elapsedTick * 50;
                    this.updatePreviewGpuParticleAnimation(now);
                } else {
                    this.updatePreviewGpuParticleTransforms?.(elapsedTick, cycleCfg, { force: true });
                    this.updatePreviewGpuParticleVisibility?.(elapsedTick, { force: true });
                }
                const groupTransforms = Array.isArray(this.previewGpuTransformGroups)
                    ? this.previewGpuTransformGroups
                    : [];
                const sharedTransform = this.previewGpuSharedTransform || {};
                const globalElements = this.previewGpuGlobalTransform?.elements;
                const runtimeGlobals = this.previewRuntimeGlobals
                    || this.buildPreviewRuntimeGlobals?.(elapsedTick, elapsedTick, 0)
                    || {};
                const timelineGroups = groupTransforms.slice(0, 24).map((group) => ({
                    transform: [
                        Number(group?.transform?.x) || 0,
                        Number(group?.transform?.y) || 0,
                        Number(group?.transform?.z) || 0,
                        Number(group?.transform?.w) || 0
                    ],
                    scale: Math.max(0.0001, Number(group?.scale) || 1)
                }));
                timeline.push({
                    tick: elapsedTick,
                    globalAlpha: clamp(this.getProjectAlphaPreviewValue?.(runtimeGlobals, this.state?.projectAlpha) ?? 1, 0, 1),
                    hasLifecycle: this.previewGpuHasLifecycleData === true,
                    hasColorCurve: this.previewGpuAttributeUsage?.colorCurve === true,
                    useSharedTransform: this.previewGpuSharedTransformEnabled === true,
                    sharedTransform: [
                        Number(sharedTransform.x) || 0,
                        Number(sharedTransform.y) || 0,
                        Number(sharedTransform.z) || 0,
                        Number(sharedTransform.w) || 0
                    ],
                    sharedScale: Math.max(0.0001, Number(this.previewGpuSharedScale) || 1),
                    groupTransforms: timelineGroups.map((group) => group.transform),
                    groupScales: timelineGroups.map((group) => group.scale),
                    globalTransform: globalElements && globalElements.length >= 16
                        ? Array.from(globalElements, (value) => Number(value) || 0)
                        : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
                });
            }
            return {
                version: 3,
                encoding: "float32-typed-array",
                frameTicks: frameTicks.slice(),
                owners: owners.map((owner) => String(owner || "")),
                visibleMasks: [],
                currentAnchorRefs: currentSourceRefs,
                currentSourcePoints: currentSourcePoints.length ? currentSourcePoints : null,
                groups: groups.filter((group) => group.pointCount > 0),
                frames: [],
                currentCardId: String(currentCardId || ""),
                currentTarget: normalizeBuilderTarget(currentTarget),
                currentOwnerId: compositionReferenceNodeId(String(currentCardId || ""), getBuilderTargetShapePath(currentTarget)),
                sourcePointTotal,
                sampled: sourcePointTotal > basePoints.length,
                frameSampled: false,
                totalTicks: Math.max(1, Math.trunc(Number(totalTicks) || 1)),
                gpu: {
                    enabled: true,
                    version: 1,
                    pointCount: basePoints.length,
                    playTicks: Math.max(1, Math.trunc(Number(cycleCfg?.play) || 1)),
                    attributes,
                    timeline
                }
            };
        } finally {
            this.pointsGeom = livePointsGeom;
            this.pointsMesh = livePointsMesh;
            this._pointsShaderRef = liveShaderRef;
            this.clearPreviewRenderCache = liveClearPreviewRenderCache;
            this.disposePreviewRenderCacheWorkerPool = liveDisposePreviewRenderCacheWorkerPool;
            this.syncPreviewGpuParticleStatus = liveSyncPreviewGpuParticleStatus;
            this.previewAnimStart = livePreviewAnimStart;
            for (const [key, value] of transientValues) this[key] = value;
            this.previewReferenceAllCards = originalReferenceAllCards;
            referencePointsGeom.dispose?.();
        }
    }

    async buildBuilderCompositionReferenceSnapshot(currentCardId = "", currentTarget = "root", requestId = 0, options = {}) {
        const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        const previewOwners = Array.isArray(this.previewReferenceOwners) && this.previewReferenceOwners.length
            ? this.previewReferenceOwners
            : (Array.isArray(this.previewOwners) ? this.previewOwners : []);
        const basePoints = Array.isArray(this.previewBasePoints) ? this.previewBasePoints : [];
        if (!previewOwners.length || !basePoints.length) return null;
        const currentId = String(currentCardId || "");
        const owners = previewOwners.map((owner) => String(owner || ""));
        const currentSourceRefs = this.getBuilderCompositionReferenceCurrentSourceRefs(owners, currentId, currentTarget);
        const treeRows = [];
        cards.forEach((card, index) => {
            const cardId = String(card?.id || `card-${index}`);
            buildCompositionReferenceTree({
                id: cardId,
                name: String(card?.name || `卡片 ${index + 1}`),
                dataType: String(card?.dataType || "single"),
                children: Array.isArray(card?.shapeChildren) ? card.shapeChildren : []
            }, [], null, 0, treeRows);
        });
        const ownerCounts = new Map();
        for (const owner of owners) ownerCounts.set(String(owner || ""), (ownerCounts.get(String(owner || "")) || 0) + 1);
        const groups = treeRows.map((row) => ({
            ...row,
            pointCount: ownerCounts.get(row.id) || 0
        }));
        const cycleCfg = this.getPreviewCycleConfig?.() || null;
        const totalTicks = Math.max(1, Math.trunc(Number(cycleCfg?.total) || 1));
        let gpuReferenceEnabled = this.previewGpuParticlePathEnabled === true;
        const probeGeometry = typeof this.pointsGeom?.clone === "function" ? this.pointsGeom.clone() : null;
        const liveProbeGeometry = this.pointsGeom;
        const liveProbeMesh = this.pointsMesh;
        const liveProbeShader = this._pointsShaderRef;
        const probeKeys = Object.keys(this).filter((key) => key.startsWith("previewGpu") || key === "previewReferenceAllCards");
        const probeValues = new Map(probeKeys.map((key) => [key, this[key]]));
        if (probeGeometry) {
            try {
                this.pointsGeom = probeGeometry;
                this.pointsMesh = null;
                this._pointsShaderRef = null;
                this.previewReferenceAllCards = true;
                this.configurePreviewGpuParticlePath?.();
                gpuReferenceEnabled = this.canUsePreviewGpuParticlePath?.() === true
                    && this.previewGpuParticlePathEnabled === true
                    && this.previewGpuPerPointTransformEnabled !== true;
            } finally {
                this.pointsGeom = liveProbeGeometry;
                this.pointsMesh = liveProbeMesh;
                this._pointsShaderRef = liveProbeShader;
                for (const [key, value] of probeValues) this[key] = value;
                probeGeometry.dispose?.();
            }
        }
        const frameCount = gpuReferenceEnabled ? totalTicks : Math.min(15, totalTicks);
        const frameTicks = gpuReferenceEnabled
            ? Array.from({ length: frameCount }, (_, index) => index)
            : Array.from({ length: frameCount }, (_, index) => {
                if (frameCount <= 1 || totalTicks <= 1) return 0;
                return Math.round(index * (totalTicks - 1) / (frameCount - 1));
            });
        const frameSampled = frameCount < totalTicks;
        // Keep the editor responsive while a large reference cycle is sampled.
        // Progress is persisted in bounded chunks; the sampler yields every frame.
        const progressChunkSize = Math.max(8, Math.ceil(frameCount / 16));
        const sourcePointTotal = Math.max(basePoints.length, Number(this.previewSourcePointTotal) || 0);
        const originalCompositionType = this.state.compositionType;
        const originalReferenceAllCards = this.previewReferenceAllCards === true;
        const originalTypes = [];
        const sequencedNodes = [];
        const currentCard = cards.find((card) => String(card?.id || "") === String(currentCardId || ""));
        let currentSourcePoints = [];
        if (currentCard) {
            try {
                const built = this.evaluateBuilderPoints?.(
                    this.resolveCardBuilderState?.(currentCard, normalizeBuilderTarget(currentTarget))
                );
                currentSourcePoints = Array.isArray(built?.points)
                    ? built.points.map((point) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0, z: Number(point?.z) || 0 }))
                    : [];
            } catch {
                currentSourcePoints = [];
            }
        }
        // GPU particle compositions already have their complete lifecycle in
        // GPU metadata. Build the cache from that path before starting the
        // expensive CPU/Worker sampler.
        const gpuSnapshot = this.buildBuilderCompositionReferenceGpuSnapshot?.({
            frameTicks,
            cycleCfg,
            owners,
            groups,
            currentCardId: currentId,
            currentTarget,
            currentSourceRefs,
            currentSourcePoints,
            sourcePointTotal,
            totalTicks
        });
        if (gpuSnapshot?.gpu?.enabled === true
            && Array.isArray(gpuSnapshot.gpu.timeline)
            && gpuSnapshot.gpu.timeline.length === frameCount) {
            onProgress?.(gpuSnapshot);
            return gpuSnapshot;
        }
        const workerResult = await this.sampleBuilderCompositionReferenceFramesWithWorker?.({
            cycleCfg,
            frameCount,
            frameTicks,
            totalTicks,
            totalCount: basePoints.length,
            owners,
            groups,
            currentCardId: currentId,
            currentTarget,
            currentSourceRefs,
            currentSourcePoints,
            sourcePointTotal,
            progressChunkSize,
            requestId,
            onProgress
        });
        if (workerResult?.frames?.length === frameCount) {
            return {
                version: 3,
                encoding: "float32-typed-array",
                frameTicks,
                owners: owners.map((owner) => String(owner || "")),
                visibleMasks: workerResult.visibleMasks,
                colors: workerResult.colors,
                sizes: workerResult.sizes,
                alphas: workerResult.alphas,
                currentAnchorRefs: currentSourceRefs,
                currentSourcePoints: currentSourcePoints.length ? currentSourcePoints : null,
                groups: groups.filter((group) => group.pointCount > 0),
                frames: workerResult.frames,
                currentCardId: currentId,
                currentTarget: normalizeBuilderTarget(currentTarget),
                currentOwnerId: compositionReferenceNodeId(currentId, getBuilderTargetShapePath(currentTarget)),
                sourcePointTotal,
                sampled: sourcePointTotal > basePoints.length,
                frameSampled,
                totalTicks
            };
        }
        const collectSequenced = (node) => {
            if (!node || typeof node !== "object") return;
            originalTypes.push([node, node.type]);
            if (node.type === "sequenced_shape") sequencedNodes.push(node);
            for (const child of (Array.isArray(node.children) ? node.children : [])) collectSequenced(child);
        };
        const applyReferenceMode = () => {
            this.previewReferenceAllCards = true;
            for (const [card, originalType] of originalTypes) {
                if (cards.includes(card) && originalType === "sequenced_shape") card.dataType = "particle_shape";
            }
            for (const node of sequencedNodes) node.type = "particle_shape";
        };
        const restoreReferenceMode = () => {
            this.state.compositionType = originalCompositionType;
            this.previewReferenceAllCards = originalReferenceAllCards;
            for (const [node, type] of originalTypes) {
                if (cards.includes(node)) node.dataType = type;
                else node.type = type;
            }
        };
        const runtimeKeys = [
            "previewRuntimeGlobals",
            "previewRuntimeAppliedTick",
            "previewRuntimeCycleIndex",
            "previewCanResumeRuntimeState",
            "previewVisibleMask",
            "previewInteractionVisibleMask",
            "previewFrameCurrentAges",
            "previewFrameAutomaticAges",
            "previewFrameLifetimes",
            "previewPersistentCurrentAges",
            "previewPersistentLifetimes",
            "previewManualAgeFlags",
            "previewInitializedLifetimeFlags",
            "previewPersistentControllerStates",
            "previewFrameGroupRuntimeCache",
            "previewFrameAnchorCache",
            "previewFrameLocalCache",
            "previewFrameGroupVisualCache",
            "previewFrameGroupPointVisualCache",
            "previewCardVisualAgeDependentCache",
            "previewFrameShapeRuntimeLevelsCache",
            "previewFrameGrowthPlanCache",
            "previewManualProjectScaleTick",
            "previewRenderWorkerInitBaselineReady"
        ];
        const captureRuntime = () => {
            const state = {};
            for (const key of runtimeKeys) state[key] = this[key];
            return state;
        };
        const installRuntime = (state) => {
            if (!state) return;
            for (const key of runtimeKeys) this[key] = state[key];
        };
        const liveRuntime = captureRuntime();
        const sampledRuntime = { ...liveRuntime };
        for (const key of runtimeKeys) sampledRuntime[key] = undefined;
        sampledRuntime.previewRuntimeGlobals = null;
        sampledRuntime.previewRuntimeAppliedTick = -1;
        sampledRuntime.previewRuntimeCycleIndex = 0;
        sampledRuntime.previewCanResumeRuntimeState = false;
        sampledRuntime.previewManualProjectScaleTick = 0;
        try {
            // Reference mode shows the completed point layout. Sequenced growth is intentionally ignored.
            for (const card of cards) {
                originalTypes.push([card, card.dataType]);
                for (const child of (Array.isArray(card.shapeChildren) ? card.shapeChildren : [])) collectSequenced(child);
            }
            const frames = [];
            const colors = [];
            const sizes = [];
            const alphas = [];
            const visibleMasks = [];
            for (let frameIndex = 0; frameIndex < frameTicks.length; frameIndex++) {
                if (requestId && requestId !== this.builderCompositionReferenceRequestId) return null;
                if (frameIndex > 0) {
                    // Keep the fallback sampler off the continuous task queue. A
                    // full Composition cycle can contain hundreds of expensive
                    // frames, so let the editor and preview paint between ticks.
                    await new Promise((resolve) => setTimeout(resolve, 16));
                    if (requestId && requestId !== this.builderCompositionReferenceRequestId) return null;
                }
                const tick = frameTicks[frameIndex];
                installRuntime(sampledRuntime);
                applyReferenceMode();
                const frame = this.computePreviewFrame?.({
                    elapsedTick: tick,
                    globalCycleAge: tick,
                    cycleIndex: 0,
                    cycleCfg,
                    outputToGeometry: false
                });
                sampledRuntime.previewRuntimeGlobals = this.previewRuntimeGlobals;
                sampledRuntime.previewRuntimeAppliedTick = this.previewRuntimeAppliedTick;
                sampledRuntime.previewRuntimeCycleIndex = this.previewRuntimeCycleIndex;
                sampledRuntime.previewCanResumeRuntimeState = this.previewCanResumeRuntimeState;
                for (const key of runtimeKeys) sampledRuntime[key] = this[key];
                restoreReferenceMode();
                installRuntime(liveRuntime);
                const positions = Array.isArray(frame?.positions) || frame?.positions instanceof Float32Array
                    ? frame.positions
                    : null;
                frames.push(positions && positions.length === basePoints.length * 3
                    ? Float32Array.from(positions)
                    : null);
                const frameColors = frame?.colors;
                colors.push(frameColors && frameColors.length === basePoints.length * 3
                    ? Float32Array.from(frameColors)
                    : null);
                const frameSizes = frame?.sizes;
                sizes.push(frameSizes && frameSizes.length === basePoints.length
                    ? Float32Array.from(frameSizes)
                    : null);
                const frameAlphas = frame?.alphas;
                alphas.push(frameAlphas && frameAlphas.length === basePoints.length
                    ? Float32Array.from(frameAlphas)
                    : null);
                const visibleMask = frame?.visibleMask;
                if (visibleMask && visibleMask.length === basePoints.length) {
                    const mask = visibleMask instanceof Uint8Array
                        ? visibleMask
                        : Uint8Array.from(Array.from(visibleMask, (value) => value ? 1 : 0));
                    visibleMasks.push(mask);
                } else {
                    visibleMasks.push(null);
                }
                if (onProgress && (frames.length === 1 || (frames.length < frameCount && frames.length % progressChunkSize === 0))) {
                    onProgress({
                        version: 3,
                        encoding: "float32-typed-array",
                        frameTicks: frameTicks.slice(0, frames.length),
                        owners: owners.map((owner) => String(owner || "")),
                        visibleMasks: visibleMasks.slice(),
                        colors: colors.slice(),
                        sizes: sizes.slice(),
                        alphas: alphas.slice(),
                        currentAnchorRefs: currentSourceRefs,
                        currentSourcePoints: currentSourcePoints.length ? currentSourcePoints : null,
                        groups: groups.filter((group) => group.pointCount > 0),
                        frames: frames.slice(),
                        currentCardId: currentId,
                        currentTarget: normalizeBuilderTarget(currentTarget),
                        currentOwnerId: compositionReferenceNodeId(currentId, getBuilderTargetShapePath(currentTarget)),
                        sourcePointTotal: Math.max(basePoints.length, Number(this.previewSourcePointTotal) || 0),
                        sampled: Math.max(basePoints.length, Number(this.previewSourcePointTotal) || 0) > basePoints.length,
                        frameSampled: frameTicks.length < totalTicks,
                        totalTicks
                    });
                }
            }
            return {
                version: 3,
                encoding: "float32-typed-array",
                frameTicks,
                owners: owners.map((owner) => String(owner || "")),
                visibleMasks,
                colors,
                sizes,
                alphas,
                currentAnchorRefs: currentSourceRefs,
                currentSourcePoints: currentSourcePoints.length ? currentSourcePoints : null,
                groups: groups.filter((group) => group.pointCount > 0),
                frames,
                currentCardId: currentId,
                currentTarget: normalizeBuilderTarget(currentTarget),
                currentOwnerId: compositionReferenceNodeId(currentId, getBuilderTargetShapePath(currentTarget)),
                sourcePointTotal,
                sampled: sourcePointTotal > basePoints.length,
                frameSampled: frameTicks.length < totalTicks,
                totalTicks
            };
        } catch {
            return null;
        } finally {
            restoreReferenceMode();
            installRuntime(liveRuntime);
        }
    }

    buildBuilderCompositionReferenceFallbackSnapshot(currentCardId = "", currentTarget = "root") {
        const owners = Array.isArray(this.previewReferenceOwners) && this.previewReferenceOwners.length
            ? this.previewReferenceOwners
            : (Array.isArray(this.previewOwners) ? this.previewOwners : []);
        const basePoints = Array.isArray(this.previewBasePoints) ? this.previewBasePoints : [];
        if (!owners.length || !basePoints.length) return null;
        const currentId = String(currentCardId || "");
        const normalizedTarget = normalizeBuilderTarget(currentTarget);
        const currentCard = Array.isArray(this.state?.cards)
            ? this.state.cards.find((card) => String(card?.id || "") === currentId)
            : null;
        let currentSourcePoints = [];
        if (currentCard) {
            try {
                const built = this.evaluateBuilderPoints?.(
                    this.resolveCardBuilderState?.(currentCard, normalizedTarget)
                );
                currentSourcePoints = Array.isArray(built?.points)
                    ? built.points.map((point) => ({
                        x: Number(point?.x) || 0,
                        y: Number(point?.y) || 0,
                        z: Number(point?.z) || 0
                    }))
                    : [];
            } catch {
                currentSourcePoints = [];
            }
        }
        const originalCompositionType = this.state.compositionType;
        const originalReferenceAllCards = this.previewReferenceAllCards === true;
        const originalTypes = [];
        const sequencedNodes = [];
        const collectSequenced = (node) => {
            if (!node || typeof node !== "object") return;
            originalTypes.push([node, node.type]);
            if (node.type === "sequenced_shape") sequencedNodes.push(node);
            for (const child of (Array.isArray(node.children) ? node.children : [])) collectSequenced(child);
        };
        for (const card of (Array.isArray(this.state?.cards) ? this.state.cards : [])) {
            originalTypes.push([card, card.dataType]);
            for (const child of (Array.isArray(card.shapeChildren) ? card.shapeChildren : [])) collectSequenced(child);
        }
        const restoreReferenceMode = () => {
            this.state.compositionType = originalCompositionType;
            this.previewReferenceAllCards = originalReferenceAllCards;
            for (const [node, type] of originalTypes) {
                if (Array.isArray(this.state?.cards) && this.state.cards.includes(node)) node.dataType = type;
                else node.type = type;
            }
        };
        const runtimeKeys = [
            "previewRuntimeGlobals",
            "previewRuntimeAppliedTick",
            "previewRuntimeCycleIndex",
            "previewCanResumeRuntimeState",
            "previewVisibleMask",
            "previewInteractionVisibleMask",
            "previewFrameCurrentAges",
            "previewFrameAutomaticAges",
            "previewFrameLifetimes",
            "previewPersistentCurrentAges",
            "previewPersistentLifetimes",
            "previewManualAgeFlags",
            "previewInitializedLifetimeFlags",
            "previewPersistentControllerStates",
            "previewFrameGroupRuntimeCache",
            "previewFrameAnchorCache",
            "previewFrameLocalCache",
            "previewFrameGroupVisualCache",
            "previewFrameGroupPointVisualCache",
            "previewCardVisualAgeDependentCache",
            "previewFrameShapeRuntimeLevelsCache",
            "previewFrameGrowthPlanCache",
            "previewManualProjectScaleTick",
            "previewRenderWorkerInitBaselineReady"
        ];
        const captureRuntime = () => {
            const state = {};
            for (const key of runtimeKeys) state[key] = this[key];
            return state;
        };
        const installRuntime = (state) => {
            if (!state) return;
            for (const key of runtimeKeys) this[key] = state[key];
        };
        const liveRuntime = captureRuntime();
        const sampledRuntime = { ...liveRuntime };
        for (const key of runtimeKeys) sampledRuntime[key] = undefined;
        sampledRuntime.previewRuntimeGlobals = null;
        sampledRuntime.previewRuntimeAppliedTick = -1;
        sampledRuntime.previewRuntimeCycleIndex = 0;
        sampledRuntime.previewCanResumeRuntimeState = false;
        sampledRuntime.previewManualProjectScaleTick = 0;
        let typed = null;
        let fallbackColors = null;
        let fallbackSizes = null;
        let fallbackAlphas = null;
        let maskSource = null;
        try {
            this.previewReferenceAllCards = true;
            for (const [card, originalType] of originalTypes) {
                if (Array.isArray(this.state?.cards) && this.state.cards.includes(card) && originalType === "sequenced_shape") {
                    card.dataType = "particle_shape";
                }
            }
            for (const node of sequencedNodes) node.type = "particle_shape";
            installRuntime(sampledRuntime);
            const cycleCfg = this.getPreviewCycleConfig?.() || null;
            const frame = this.computePreviewFrame?.({
                elapsedTick: 0,
                globalCycleAge: 0,
                cycleIndex: 0,
                cycleCfg,
                outputToGeometry: false
            });
            const positions = Array.isArray(frame?.positions) || frame?.positions instanceof Float32Array
                ? frame.positions
                : null;
            typed = positions && positions.length === basePoints.length * 3
                ? Float32Array.from(positions)
                : new Float32Array(basePoints.length * 3);
            if (!positions || positions.length !== basePoints.length * 3) {
                for (let i = 0; i < basePoints.length; i++) {
                    typed[i * 3] = Number(basePoints[i]?.x) || 0;
                    typed[i * 3 + 1] = Number(basePoints[i]?.y) || 0;
                    typed[i * 3 + 2] = Number(basePoints[i]?.z) || 0;
                }
            }
            fallbackColors = frame?.colors && frame.colors.length === basePoints.length * 3
                ? Float32Array.from(frame.colors)
                : new Float32Array(basePoints.length * 3).fill(1);
            fallbackSizes = frame?.sizes && frame.sizes.length === basePoints.length
                ? Float32Array.from(frame.sizes)
                : new Float32Array(basePoints.length).fill(1);
            fallbackAlphas = frame?.alphas && frame.alphas.length === basePoints.length
                ? Float32Array.from(frame.alphas)
                : new Float32Array(basePoints.length).fill(1);
            maskSource = frame?.visibleMask || this.previewVisibleMask;
        } finally {
            restoreReferenceMode();
            installRuntime(liveRuntime);
        }
        if (!typed) return null;
        const encodeFloat32 = (value) => {
            if (!(value instanceof Float32Array)) return "";
            const bytes = new Uint8Array(value.buffer);
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
            }
            return btoa(binary);
        };
        const binary = encodeFloat32(typed);
        const mask = Uint8Array.from({ length: owners.length }, (_, index) => maskSource?.[index] === false ? 0 : 1);
        let maskBinary = "";
        for (let offset = 0; offset < mask.length; offset += 0x8000) {
            maskBinary += String.fromCharCode(...mask.subarray(offset, Math.min(mask.length, offset + 0x8000)));
        }
        const cards = Array.isArray(this.state?.cards) ? this.state.cards : [];
        const normalizedOwners = owners.map((owner) => String(owner || ""));
        const ownerCounts = new Map();
        for (const owner of normalizedOwners) ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
        const treeRows = [];
        cards.forEach((card, index) => buildCompositionReferenceTree({
            id: String(card?.id || `card-${index}`),
            name: String(card?.name || `卡片 ${index + 1}`),
            dataType: String(card?.dataType || "single"),
            children: Array.isArray(card?.shapeChildren) ? card.shapeChildren : []
        }, [], null, 0, treeRows));
        const groupRows = treeRows.map((row) => ({
            ...row,
            pointCount: ownerCounts.get(row.id) || 0
        })).filter((group) => group.pointCount > 0 || group.depth === 0);
        const cycleCfg = this.getPreviewCycleConfig?.() || null;
        const totalTicks = Math.max(1, Math.trunc(Number(cycleCfg?.total) || 1));
        return {
            version: 3,
            encoding: "float32-base64",
            frameTicks: [0],
            owners: normalizedOwners,
            visibleMasks: [btoa(maskBinary)],
            colors: fallbackColors ? [encodeFloat32(fallbackColors)] : [],
            sizes: fallbackSizes ? [encodeFloat32(fallbackSizes)] : [],
            alphas: fallbackAlphas ? [encodeFloat32(fallbackAlphas)] : [],
            currentAnchorRefs: this.getBuilderCompositionReferenceCurrentSourceRefs(normalizedOwners, currentId, normalizedTarget),
            currentSourcePoints: currentSourcePoints.length ? currentSourcePoints : null,
            groups: groupRows,
            frames: [btoa(binary)],
            currentCardId: currentId,
            currentTarget: normalizeBuilderTarget(currentTarget),
            currentOwnerId: compositionReferenceNodeId(currentId, getBuilderTargetShapePath(currentTarget)),
            sourcePointTotal: Math.max(owners.length, Number(this.previewSourcePointTotal) || 0),
            sampled: Math.max(owners.length, Number(this.previewSourcePointTotal) || 0) > owners.length,
            frameSampled: true,
            totalTicks
        };
    }

    async saveTextWithPicker({ filename, text, mime = "text/plain", description = "文件", extensions = [] }) {
        const content = String(text || "");
        try {
            const shellBridge = globalThis.cooParticlesShell || globalThis.parent?.cooParticlesShell;
            if (shellBridge?.saveTextFile) {
                const normalizedExtensions = (Array.isArray(extensions) ? extensions : [])
                    .map((item) => String(item || "").trim().replace(/^\./, ""))
                    .filter(Boolean);
                const result = await shellBridge.saveTextFile({
                    title: description || "Save File",
                    defaultPath: filename || "download.txt",
                    text: content,
                    filters: [{
                        name: description || "File",
                        extensions: normalizedExtensions.length ? normalizedExtensions : ["*"]
                    }],
                    addToRecent: /\.composition\.json$/i.test(String(filename || ""))
                });
                if (result?.ok || result?.canceled) {
                    return {
                        ok: !!result.ok,
                        canceled: !!result.canceled,
                        byPicker: true,
                        filePath: result.filePath || "",
                        error: result.message || ""
                    };
                }
                if (result?.message) console.warn("Electron save failed:", result.message);
            }
        } catch (e) {
            console.warn("Electron save bridge failed:", e);
        }
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename || "download.txt",
                    types: [{
                        description: description || "文件",
                        accept: { [mime]: Array.isArray(extensions) && extensions.length ? extensions : [".txt"] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
                return { ok: true, canceled: false, byPicker: true };
            } catch (e) {
                if (e && e.name === "AbortError") return { ok: false, canceled: true, byPicker: true };
                console.warn("showSaveFilePicker failed:", e);
            }
        }
        try {
            downloadText(filename, content, mime);
            return { ok: true, canceled: false, byPicker: false };
        } catch (e) {
            return { ok: false, canceled: false, error: e, byPicker: false };
        }
    }

    async exportSettings() {
        const out = {
            settings: deepClone(this.state.settings),
            hotkeys: deepClone(this.state.hotkeys),
            ts: Date.now()
        };
        const result = await this.saveTextWithPicker({
            filename: "composition_builder.settings.json",
            text: JSON.stringify(out, null, 2),
            mime: "application/json",
            description: "Composition Builder 设置",
            extensions: [".json"]
        });
        if (result.ok) this.showToast("设置已导出", "success");
        else if (result.canceled) this.showToast("已取消导出", "info");
        else this.showToast(`设置导出失败: ${result.error?.message || result.error || "未知错误"}`, "error");
    }

    async importSettingsFromFile() {
        const file = this.dom.fileSettings.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const obj = JSON.parse(text) || {};
            this.pushHistory();
            if (obj.settings && typeof obj.settings === "object") {
                this.state.settings = Object.assign({}, this.state.settings, obj.settings);
            } else if (!obj.hotkeys) {
                this.state.settings = Object.assign({}, this.state.settings, obj);
            }
            if (obj.hotkeys && obj.hotkeys.actions) {
                this.state.hotkeys.actions = Object.assign({}, this.state.hotkeys.actions, obj.hotkeys.actions);
            }
            this.state = normalizeStateShape(this.state);
            this.applySettingsToDom();
            this.renderProjectSection();
            this.renderCards();
            this.rebuildPreview();
            this.generateCodeAndRender(this.state.settings.realtimeCode);
            this.scheduleSave();
            this.showToast("设置已导入", "success");
        } catch (e) {
            this.showToast(`设置导入失败: ${e?.message || e}`, "error");
        } finally {
            this.dom.fileSettings.value = "";
        }
    }

    vectorCtorForVarType(typeName) {
        const type = String(typeName || "").trim();
        if (type === "Vec3") return "Vec3";
        if (type === "RelativeLocation") return "RelativeLocation";
        if (type === "Vector3f") return "Vector3f";
        return "RelativeLocation";
    }

    ensureGlobalVarValueShape(item) {
        if (!item) return;
        if (isVectorLiteralType(item.type)) {
            const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
            const ctor = this.vectorCtorForVarType(item.type);
            item.value = formatVectorLiteral(ctor, parsed.x, parsed.y, parsed.z);
            return;
        }
        item.value = safeNumberLiteral(item.value, item.type);
    }

    ensureGlobalConstValueShape(item) {
        if (!item) return;
        if (isVectorLiteralType(item.type)) {
            const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
            const ctor = this.vectorCtorForVarType(item.type);
            item.value = formatVectorLiteral(ctor, parsed.x, parsed.y, parsed.z);
            return;
        }
        item.value = safeNumberLiteral(item.value, item.type);
    }

    updateGlobalVarVectorValue(item, axis, value) {
        if (!item || !isVectorLiteralType(item.type)) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
        const next = {
            x: num(parsed.x),
            y: num(parsed.y),
            z: num(parsed.z)
        };
        if (axis === "x" || axis === "y" || axis === "z") next[axis] = num(value);
        const ctor = this.vectorCtorForVarType(item.type);
        item.value = formatVectorLiteral(ctor, next.x, next.y, next.z);
    }

    updateGlobalVarColorValue(item, hex) {
        if (!item || String(item.type || "").trim() !== "Vector3f") return;
        const c = hexToVector01(hex);
        item.value = formatVectorLiteral("Vector3f", c.x, c.y, c.z);
    }

    syncGlobalVarInlineInputs(varIdx, item) {
        const idx = int(varIdx);
        if (idx < 0 || !item || !this.dom?.projectSection) return;
        const root = this.dom.projectSection;
        const valueInput = root.querySelector(`input[data-var-idx="${idx}"][data-var-field="value"]`);
        if (valueInput && document.activeElement !== valueInput) {
            valueInput.value = String(item.value || "");
        }
        if (!isVectorLiteralType(item.type)) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.value || "");
        for (const axis of ["x", "y", "z"]) {
            const axisInput = root.querySelector(`input[data-var-vec-idx="${idx}"][data-var-vec-axis="${axis}"]`);
            if (axisInput && document.activeElement !== axisInput) {
                axisInput.value = formatNumberCompact(parsed[axis]);
            }
        }
        if (String(item.type || "").trim() === "Vector3f") {
            const colorInput = root.querySelector(`input[data-var-color-idx="${idx}"]`);
            if (colorInput && document.activeElement !== colorInput) {
                colorInput.value = vectorToHex01(parsed.x, parsed.y, parsed.z);
            }
        }
    }

    renderGlobalVarRow(v, i) {
        const mappingTarget = getCompositionKotlinTarget(this.state.mapping);
        const typeOptions = GLOBAL_VAR_TYPES
            .map((t) => `<option value="${esc(t)}" ${v.type === t ? "selected" : ""}>${esc(t === "Vec3" ? mappingTarget.vec3Type : t)}</option>`)
            .join("");

        const actionRow = `
            <div class="row-actions">
                <label class="chk"><input type="checkbox" data-var-idx="${i}" data-var-field="codec" ${v.codec ? "checked" : ""}/>Codec</label>
                <label class="chk"><input type="checkbox" data-var-idx="${i}" data-var-field="mutable" ${v.mutable ? "checked" : ""}/>var</label>
                <button class="btn small" data-act="remove-global-var" data-idx="${i}">删除</button>
            </div>
        `;

        if (!isVectorLiteralType(v.type)) {
            return `
                <div class="kv-row grid-var">
                    <div class="grid2">
                        <input class="input" data-var-idx="${i}" data-var-field="name" value="${esc(v.name)}" placeholder="变量名"/>
                        <select class="input" data-var-idx="${i}" data-var-field="type">${typeOptions}</select>
                    </div>
                    <input class="input expr-input" data-var-idx="${i}" data-var-field="value" value="${esc(v.value)}" placeholder="默认值"/>
                    ${actionRow}
                </div>
            `;
        }

        const parsed = this.exprRuntime.parseVecLikeValue(v.value || "");
        const ctor = this.vectorCtorForVarType(v.type);
        const ctorLabel = ctor === "Vec3" ? mappingTarget.vec3Type : ctor;
        const colorHex = vectorToHex01(parsed.x, parsed.y, parsed.z);
        const vectorInputs = `
            <div class="vector-inputs">
                <div class="vector-ctor-label">${esc(ctorLabel)}</div>
                <input class="input" type="number" step="${this.state.settings.paramStep}" data-var-vec-idx="${i}" data-var-vec-axis="x" value="${esc(formatNumberCompact(parsed.x))}" placeholder="x"/>
                <input class="input" type="number" step="${this.state.settings.paramStep}" data-var-vec-idx="${i}" data-var-vec-axis="y" value="${esc(formatNumberCompact(parsed.y))}" placeholder="y"/>
                <input class="input" type="number" step="${this.state.settings.paramStep}" data-var-vec-idx="${i}" data-var-vec-axis="z" value="${esc(formatNumberCompact(parsed.z))}" placeholder="z"/>
                ${String(v.type || "").trim() === "Vector3f"
                    ? `<input class="input vector-color" type="color" data-var-color-idx="${i}" value="${esc(colorHex)}" title="打开调色板"/>`
                    : `<div></div>`}
            </div>
        `;

        return `
            <div class="kv-row grid-var grid-var-vector">
                <div class="grid2">
                    <input class="input" data-var-idx="${i}" data-var-field="name" value="${esc(v.name)}" placeholder="变量名"/>
                    <select class="input" data-var-idx="${i}" data-var-field="type">${typeOptions}</select>
                </div>
                <input class="input mono expr-input" data-var-idx="${i}" data-var-field="value" value="${esc(v.value)}" placeholder="默认值"/>
                ${vectorInputs}
                ${actionRow}
            </div>
        `;
    }

    renderProjectSection() {
        const s = this.state;
        const seq = s.compositionType === "sequenced";
        const mappingTarget = getCompositionKotlinTarget(s.mapping);
        const typeOptions = GLOBAL_VAR_TYPES.map((t) => `<option value="${esc(t)}">${esc(t === "Vec3" ? mappingTarget.vec3Type : t)}</option>`).join("");
        const varRows = s.globalVars.map((v, i) => this.renderGlobalVarRow(v, i)).join("");
        const axisPresetOptions = this.getRelativeTargetPresetOptionsHtml(s.compositionAxisPreset || s.compositionAxisExpr);
        const constRows = s.globalConsts.map((v, i) => `
            <div class="kv-row grid-const">
                <input class="input" data-const-idx="${i}" data-const-field="name" value="${esc(v.name)}" placeholder="常量名"/>
                <select class="input" data-const-idx="${i}" data-const-field="type">${typeOptions.replace(`value="${esc(v.type)}"`, `value="${esc(v.type)}" selected`)}</select>
                <input class="input expr-input" data-const-idx="${i}" data-const-field="value" value="${esc(v.value)}" placeholder="值"/>
                <button class="btn small" data-act="remove-global-const" data-idx="${i}">删除</button>
            </div>
        `).join("");
        const compAnimRows = s.compositionAnimates.map((a, i) => `
            <div class="kv-row grid-animate">
                <input class="input" type="number" min="1" step="1" data-comp-animate-idx="${i}" data-comp-animate-field="count" value="${esc(String(a.count))}"/>
                <input class="input expr-input" data-comp-animate-idx="${i}" data-comp-animate-field="condition" value="${esc(a.condition)}" placeholder="条件表达式"/>
                <button class="btn small" data-act="remove-comp-animate" data-idx="${i}">删除</button>
            </div>
        `).join("");
        const displayRows = s.displayActions.map((a, i) => this.renderDisplayActionRow(a, i)).join("");

        this.dom.projectSection.innerHTML = `
            <div class="section-block">
                <div class="section-title">项目设置</div>
                <div class="grid2">
                    <label class="field">
                        <span>项目名称</span>
                        <input class="input" data-pf="projectName" value="${esc(s.projectName)}" placeholder="NewComposition"/>
                    </label>
                    <label class="field">
                        <span>类型</span>
                        <select class="input" data-pf="compositionType">
                            <option value="particle" ${s.compositionType === "particle" ? "selected" : ""}>ParticleComposition</option>
                            <option value="sequenced" ${s.compositionType === "sequenced" ? "selected" : ""}>SequencedParticleComposition</option>
                        </select>
                    </label>
                    <label class="field">
                        <span>包名</span>
                        <input class="input" data-pf="packageName" value="${esc(s.packageName || "cn.coostack.compositions")}" placeholder="cn.coostack.compositions"/>
                    </label>
                    <label class="field">
                        <span>映射</span>
                        <select class="input" data-pf="mapping">
                            <option value="yarn" ${s.mapping === "yarn" ? "selected" : ""}>Yarn (Fabric)</option>
                            <option value="mojmap" ${s.mapping === "mojmap" ? "selected" : ""}>Mojang / Mojmap</option>
                        </select>
                    </label>
                    <label class="field">
                        <span>消散延迟 (tick)</span>
                        <input class="input" type="number" min="0" step="1" data-pf="disabledInterval" value="${esc(String(s.disabledInterval))}"/>
                    </label>
                    <label class="field">
                        <span>播放时长 (tick, 不含消散)</span>
                        <input class="input" type="number" min="1" step="1" data-pf="previewPlayTicks" value="${esc(String(s.previewPlayTicks || 70))}"/>
                    </label>
                    <label class="field">
                        <span>是否开启移除状态设置</span>
                        <span class="chk"><input type="checkbox" data-pf="enableRemoveStatusOverride" ${s.enableRemoveStatusOverride === true ? "checked" : ""}/>开启</span>
                    </label>
                    <label class="field">
                        <span>GPU 粒子</span>
                        <span class="chk"><input id="chkGlobalCParticle" type="checkbox" data-pf="useCParticle" ${s.useCParticle === true ? "checked" : ""}/>全局使用 CParticle</span>
                    </label>
                </div>
                <div class="subgroup">
                    <div class="subgroup-title">生成前轴向</div>
                    <div class="grid2">
                        <label class="field">
                            <span>轴向预设</span>
                            <select class="input expr-input" data-axis-field="axisPreset">${axisPresetOptions}</select>
                        </label>
                        <label class="field">
                            <span>轴向输入</span>
                            <input class="input expr-input" data-axis-field="axisExpr" value="${esc(s.compositionAxisExpr || "")}" placeholder="axis 表达式"/>
                        </label>
                    </div>
                    <div class="grid5 vector-inputs">
                        <select class="input vector-ctor" data-axis-field="axisManualCtor">
                            ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${s.compositionAxisManualCtor === it ? "selected" : ""}>${it === "Vec3" ? mappingTarget.vec3Type : it}</option>`).join("")}
                        </select>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" data-axis-field="axisManualX" value="${esc(formatNumberCompact(s.compositionAxisManualX))}" placeholder="x"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" data-axis-field="axisManualY" value="${esc(formatNumberCompact(s.compositionAxisManualY))}" placeholder="y"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" data-axis-field="axisManualZ" value="${esc(formatNumberCompact(s.compositionAxisManualZ))}" placeholder="z"/>
                        <button class="btn small primary" data-act="apply-project-axis-manual">应用手动输入</button>
                    </div>
                </div>
                ${this.renderScaleHelperEditor({
                    scope: "project",
                    scale: s.projectScale
                })}
                ${this.renderAlphaHelperEditor({
                    alpha: s.projectAlpha
                })}
            </div>

            <div class="section-block">
                <div class="section-title">全局变量</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-global-var">添加变量</button>
                    <div class="mini-note">变量可在表达式中直接使用</div>
                </div>
                <div class="kv-list">${varRows}</div>
            </div>

            <div class="section-block">
                <div class="section-title">全局常量</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-global-const">添加常量</button>
                </div>
                <div class="kv-list">${constRows}</div>
            </div>

            ${seq ? `
            <div class="section-block">
                <div class="section-title">生长动画（SequencedParticleComposition）</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-comp-animate">添加生长动画</button>
                    <div class="mini-note">仅 SequencedParticleComposition 生效</div>
                </div>
                <div class="kv-list">${compAnimRows}</div>
            </div>` : ""}

            <div class="section-block">
                <div class="section-title">显示行为</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-display-action">添加显示动作</button>
                </div>
                <div class="kv-list">${displayRows}</div>
            </div>
        `;
        this.refreshCodeEditors();
    }

    renderDisplayActionRow(action, idx) {
        const a = normalizeDisplayAction(action);
        const typeOptions = DISPLAY_ACTION_TYPES.map((it) => `<option value="${it.id}" ${a.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`).join("");
        const presetOptions = this.getRelativeTargetPresetOptionsHtml(a.toPreset);
        const angleControl = this.renderAngleControl({
            scope: "display",
            idx,
            mode: a.angleMode,
            value: a.angleValue,
            unit: a.angleUnit,
            expr: a.angleExpr
        });

        let body = "";
        if (a.type === "rotateToPoint") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-display-idx="${idx}" data-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-display-idx="${idx}" data-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-display-idx="${idx}" data-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-display-manual-to" data-idx="${idx}">套用手动输入</button>
                </div>
            `;
        } else if (a.type === "rotateAsAxis") {
            body = `${angleControl}`;
        } else if (a.type === "rotateToWithAngle") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-display-idx="${idx}" data-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-display-idx="${idx}" data-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-display-idx="${idx}" data-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-display-manual-to" data-idx="${idx}">套用手动输入</button>
                </div>
                ${angleControl}
            `;
        } else {
            body = `
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="display expression" data-display-idx="${idx}" data-display-field="expression" placeholder="Supports rotateToPoint(...) / rotateAsAxis(...) / rotateToWithAngle(...)">${esc(a.expression || "")}</textarea>
                <div class="mini-note">表达式支持代码提示（Ctrl+Space），可使用 addSingle()/addMultiple(n)</div>
            `;
        }

        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-display-idx="${idx}" data-display-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-display-action" data-idx="${idx}">删除</button></div>
                </div>
                ${body}
            </div>
        `;
    }

    renderShapeDisplayActionRow(cardId, action, idx) {
        const a = normalizeDisplayAction(action);
        const typeOptions = DISPLAY_ACTION_TYPES.map((it) => `<option value="${it.id}" ${a.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`).join("");
        const presetOptions = this.getRelativeTargetPresetOptionsHtml(a.toPreset);
        const angleControl = this.renderAngleControl({
            scope: "shape_display",
            cardId,
            idx,
            mode: a.angleMode,
            value: a.angleValue,
            unit: a.angleUnit,
            expr: a.angleExpr
        });

        let body = "";
        if (a.type === "rotateToPoint") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-display-manual-to" data-card-id="${esc(cardId)}" data-shape-display-idx="${idx}">套用手动输入</button>
                </div>
            `;
        } else if (a.type === "rotateAsAxis") {
            body = `${angleControl}`;
        } else if (a.type === "rotateToWithAngle") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-display-manual-to" data-card-id="${esc(cardId)}" data-shape-display-idx="${idx}">套用手动输入</button>
                </div>
                ${angleControl}
            `;
        } else {
            body = `
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="shape display expression" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="expression" placeholder="Supports rotateToPoint(...) / rotateAsAxis(...) / rotateToWithAngle(...)">${esc(a.expression || "")}</textarea>
                <div class="mini-note">表达式支持代码提示（Ctrl+Space），可使用 addSingle()/addMultiple(n)</div>
            `;
        }

        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-shape-display-action" data-card-id="${esc(cardId)}" data-idx="${idx}">删除</button></div>
                </div>
                ${body}
            </div>
        `;
    }

    renderShapeChildDisplayActionRow(cardId, action, idx) {
        const a = normalizeDisplayAction(action);
        const typeOptions = DISPLAY_ACTION_TYPES.map((it) => `<option value="${it.id}" ${a.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`).join("");
        const presetOptions = this.getRelativeTargetPresetOptionsHtml(a.toPreset);
        const angleControl = this.renderAngleControl({
            scope: "shape_display",
            cardId,
            idx,
            mode: a.angleMode,
            value: a.angleValue,
            unit: a.angleUnit,
            expr: a.angleExpr
        })
            .replaceAll("data-card-shape-display-idx", "data-card-shape-child-display-idx")
            .replaceAll("data-card-shape-display-field", "data-card-shape-child-display-field");

        let body = "";
        if (a.type === "rotateToPoint") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-child-display-manual-to" data-card-id="${esc(cardId)}" data-shape-child-display-idx="${idx}">套用手动输入</button>
                </div>
            `;
        } else if (a.type === "rotateAsAxis") {
            body = `${angleControl}`;
        } else if (a.type === "rotateToWithAngle") {
            body = `
                <div class="grid2">
                    <label class="field">
                        <span>to 预设</span>
                        <select class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toPreset">${presetOptions}</select>
                    </label>
                    <label class="field">
                        <span>to 输入</span>
                        <input class="input expr-input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toExpr" value="${esc(a.toExpr)}" placeholder="to 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${a.toManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualX" value="${esc(formatNumberCompact(a.toManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualY" value="${esc(formatNumberCompact(a.toManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="toManualZ" value="${esc(formatNumberCompact(a.toManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-child-display-manual-to" data-card-id="${esc(cardId)}" data-shape-child-display-idx="${idx}">套用手动输入</button>
                </div>
                ${angleControl}
            `;
        } else {
            body = `
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="child shape display expression" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="expression" placeholder="Supports rotateToPoint(...) / rotateAsAxis(...) / rotateToWithAngle(...)">${esc(a.expression || "")}</textarea>
                <div class="mini-note">表达式支持代码提示（Ctrl+Space），可使用 addSingle()/addMultiple(n)</div>
            `;
        }

        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}" data-card-shape-child-display-idx="${idx}" data-card-shape-child-display-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-shape-child-display-action" data-card-id="${esc(cardId)}" data-idx="${idx}">删除</button></div>
                </div>
                ${body}
            </div>
        `;
    }

    renderShapeLevelDisplayActionRow(cardId, levelIdx, action, idx) {
        const cid = esc(cardId);
        let html = this.renderShapeDisplayActionRow(cardId, action, idx);
        html = html
            .replaceAll(`data-card-id="${cid}"`, `data-card-id="${cid}" data-shape-level-idx="${levelIdx}"`)
            .replaceAll("data-card-shape-display-idx", "data-shape-level-display-idx")
            .replaceAll("data-card-shape-display-field", "data-shape-level-display-field")
            .replaceAll("remove-shape-display-action", "remove-shape-level-display-action")
            .replaceAll("apply-shape-display-manual-to", "apply-shape-level-display-manual-to")
            .replaceAll("data-shape-display-idx", "data-shape-level-display-idx");
        return html;
    }

    renderTreeNodeDisplayActionRow(cardId, treePath, action, idx) {
        const cid = esc(cardId);
        const tp = esc(treePath);
        let html = this.renderShapeDisplayActionRow(cardId, action, idx);
        html = html
            .replaceAll(`data-card-id="${cid}"`, `data-card-id="${cid}" data-tree-path="${tp}"`)
            .replaceAll("data-card-shape-display-idx", "data-tree-node-display-idx")
            .replaceAll("data-card-shape-display-field", "data-tree-node-display-field")
            .replaceAll("remove-shape-display-action", "remove-tree-node-display-action")
            .replaceAll("apply-shape-display-manual-to", "apply-tree-node-display-manual-to")
            .replaceAll("data-shape-display-idx", "data-tree-node-display-idx");
        return html;
    }

    renderCParticleNodeSettings(target, opts = {}) {
        const treePath = Array.isArray(opts.treePath) ? opts.treePath : null;
        const cardId = String(opts.cardId || target?.id || "");
        const isRootCard = !treePath;
        const pathAttr = treePath ? ` data-tree-path="${esc(JSON.stringify(treePath))}"` : "";
        const type = String(target?.type || target?.dataType || "single");
        const isShape = isCompositionShapeType(type);
        const rootCard = isRootCard ? target : opts.card;
        const rootGpuEnabled = isCompositionCardUsingCParticle(rootCard);
        const isLeaf = isCompositionLeafParticleType(type);
        const parentPath = treePath ? treePath.slice(0, -1) : [];
        const inheritedGpuEnabled = isRootCard ? false : this.isTreeNodeCParticleEnabled(rootCard, parentPath);
        const ownGpuEnabled = isShape && target?.useCParticle === true;
        const enabled = isRootCard ? rootGpuEnabled : (inheritedGpuEnabled || ownGpuEnabled);
        const hasParticleLeaf = isShape && compositionShapeNodeHasParticleLeaf(target);
        if (isRootCard && isLeaf && !enabled) return "";
        if (!isRootCard && isLeaf && !enabled) return "";
        if (!isRootCard && isShape && !hasParticleLeaf) return "";
        const alpha = normalizeCParticleAlphaConfig(target?.cparticleAlpha);
        const renderFade = (phase, title) => {
            const fade = alpha[phase];
            const fadeDataAttrs = isRootCard
                ? `data-card-cparticle-fade="${phase}" data-card-cparticle-fade-field="FIELD"`
                : `${pathAttr} data-tree-node-cparticle-fade="${phase}" data-tree-node-cparticle-fade-field="FIELD"`;
            return `
                <div class="cparticle-fade-row">
                    <strong>${title}</strong>
                    <label class="chk compact"><input type="checkbox" data-card-id="${cardId}" ${fadeDataAttrs.replace("FIELD", "enabled")} ${fade.enabled ? "checked" : ""}/><span>启用</span></label>
                    <input class="input" title="时长 (tick)" aria-label="${title}时长" type="number" min="1" step="1" data-card-id="${cardId}" ${fadeDataAttrs.replace("FIELD", "durationTicks")} value="${esc(String(fade.durationTicks))}"/>
                    <input class="input" title="起始透明度" aria-label="${title}起始透明度" type="number" min="0" max="1" step="${this.state.settings.paramStep}" data-card-id="${cardId}" ${fadeDataAttrs.replace("FIELD", "fromAlpha")} value="${esc(formatNumberCompact(fade.fromAlpha))}"/>
                    <input class="input" title="结束透明度" aria-label="${title}结束透明度" type="number" min="0" max="1" step="${this.state.settings.paramStep}" data-card-id="${cardId}" ${fadeDataAttrs.replace("FIELD", "toAlpha")} value="${esc(formatNumberCompact(fade.toAlpha))}"/>
                </div>`;
        };
        const leafSettings = enabled && isLeaf ? `
            <div class="grid2">
                <label class="field"><span>CParticle RenderLayer</span><select class="input" data-card-id="${cardId}"${pathAttr} ${isRootCard ? "data-card-field" : "data-tree-node-field"}="cparticleRenderLayer">${CPARTICLE_RENDER_LAYER_OPTIONS.map((layer) => `<option value="${layer}" ${target?.cparticleRenderLayer === layer ? "selected" : ""}>${layer}</option>`).join("")}</select></label>
                <label class="chk"><input type="checkbox" data-card-id="${cardId}"${pathAttr} ${isRootCard ? "data-card-field" : "data-tree-node-field"}="randomAgePreTick" ${target?.randomAgePreTick === true ? "checked" : ""}/><span>每 Tick 随机动画帧</span></label>
            </div>` : "";
        const nestedShapeToggle = !isRootCard && isShape ? `
            <label class="chk" title="启用后，该 Composition 的粒子叶节点使用 GPU 粒子">
                <input type="checkbox" data-card-id="${cardId}"${pathAttr} data-tree-node-field="useCParticle" ${enabled ? "checked" : ""}${inheritedGpuEnabled ? " disabled" : ""}/>
                <span>使用 GPU 粒子${inheritedGpuEnabled ? "（继承父级）" : ""}</span>
            </label>` : "";
        const nestedFadeBox = !isRootCard && isShape && enabled && hasParticleLeaf
            ? `<div class="subgroup subgroup-tight cparticle-fade-box"><div class="subgroup-title">不透明度过渡</div><div class="cparticle-fade-grid"><div class="cparticle-fade-head"><span>阶段</span><span>状态</span><span>时长</span><span>起始</span><span>结束</span></div>${renderFade("fadeIn", "淡入")}${renderFade("fadeOut", "淡出")}</div></div>`
            : "";
        if (!isRootCard || isLeaf) return `<div class="mini-note">GPU 粒子配置</div>${nestedShapeToggle}${leafSettings}${nestedFadeBox}`;
        return `
            <div class="mini-note">GPU 粒子</div>
            <div class="grid2">
                <label class="chk" title="启用后，该卡片的全部粒子叶节点均使用 GPU 粒子">
                    <input type="checkbox" data-card-id="${cardId}" data-card-field="useCParticle" ${rootGpuEnabled ? "checked" : ""}/>
                    <span>使用 GPU 粒子</span>
                </label>
            </div>
            ${leafSettings}
            ${enabled && isShape && compositionShapeNodeHasParticleLeaf(target) ? `<div class="subgroup subgroup-tight cparticle-fade-box"><div class="subgroup-title">不透明度过渡</div><div class="cparticle-fade-grid"><div class="cparticle-fade-head"><span>阶段</span><span>状态</span><span>时长</span><span>起始</span><span>结束</span></div>${renderFade("fadeIn", "淡入")}${renderFade("fadeOut", "淡出")}</div></div>` : ""}`;
    }

    renderSingleGpuSettings(card) {
        return this.renderCParticleNodeSettings(card, { cardId: card?.id });
    }

    renderTreeNodeEditor(card, node, treePath, opts = {}) {
        if (!card || !node) return "";
        const cardId = card.id;
        const tp = esc(JSON.stringify(treePath));
        const nodeType = node.type || "single";
        const bindMode = node.bindMode === "builder" ? "builder" : "point";
        const builderStats = this.evaluateBuilderPoints(node.builderState);
        const builderNodeCount = this.countBuilderNodes(node.builderState?.root?.children || []);
        const builderPointCount = (builderStats.points || []).length;
        const effectHtml = this.getEffectOptionsHtml(node.effectClass || DEFAULT_EFFECT_CLASS);
        return this._renderTreeNodeEditorInner(card, node, treePath, tp, cardId, nodeType, bindMode, builderNodeCount, builderPointCount, effectHtml, opts);
    }

    _renderTreeNodeEditorInner(card, node, treePath, tp, cardId, nodeType, bindMode, builderNodeCount, builderPointCount, effectHtml, opts = {}) {
        const step = this.state.settings.paramStep;
        const gpuContext = this.isTreeNodeCParticleEnabled(card, treePath);
        const typeOptions = `
                <option value="single" ${nodeType === "single" ? "selected" : ""}>${gpuContext ? "CParticle" : "单粒子"}</option>
                <option value="particle_shape" ${nodeType === "particle_shape" ? "selected" : ""}>${gpuContext ? "GPU Composition" : "形状 Composition"}</option>
                <option value="sequenced_shape" ${nodeType === "sequenced_shape" ? "selected" : ""}>${gpuContext ? "GPU 序列 Composition" : "序列形状 Composition"}</option>`;
        const typeBlock = `
            <div class="grid2">
                <label class="field">
                    <span>子节点类型</span>
                    <select class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="type">
                        ${typeOptions}
                    </select>
                </label>
                <label class="field">
                    <span>名称</span>
                    <input class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="name" value="${esc(node.name || "")}" placeholder="子节点名称"/>
                </label>
            </div>`;
        const bindBlock = this._renderTreeNodeBindBlock(card, node, tp, cardId, bindMode, builderNodeCount, builderPointCount, step);
        const axisBlock = this._renderTreeNodeAxisBlock(node, tp, cardId, step);
        const displayBlock = this._renderTreeNodeDisplayBlock(cardId, node, tp);
        const angleOffsetBlock = this.renderAngleOffsetControl({
            scope: "tree_node", cardId, treePath: JSON.stringify(treePath),
            value: node, title: "相对角度偏移（可选）"
        });
        const scaleBlock = `
            <div class="mini-note">缩放助手（可选）</div>
            ${this.renderScaleHelperEditor({
                scope: "tree_node", cardId, treePath: JSON.stringify(treePath),
                scale: node.scale, helperName: "缩放助手", embedOnly: true
            })}`;
        if (isCompositionLeafParticleType(nodeType)) {
            return this._renderTreeNodeSingleView(card, node, tp, cardId, typeBlock, bindBlock, axisBlock, displayBlock, angleOffsetBlock, scaleBlock, effectHtml, treePath);
        }
        return this._renderTreeNodeShapeView(card, node, tp, cardId, typeBlock, bindBlock, axisBlock, displayBlock, angleOffsetBlock, scaleBlock, nodeType, treePath, opts);
    }

    _renderTreeNodeBindBlock(card, node, tp, cardId, bindMode, builderNodeCount, builderPointCount, step) {
        return `
            <div class="mini-note">子点来源</div>
            <div class="grid2">
                <label class="field">
                    <span>绑定选项</span>
                    <select class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="bindMode">
                        <option value="point" ${bindMode === "point" ? "selected" : ""}>手动点位</option>
                        <option value="builder" ${bindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                    </select>
                </label>
            </div>
            ${bindMode === "point" ? `
                <div class="grid3">
                    <label class="field"><span>X</span><input class="input" type="number" step="${step}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="pointX" value="${esc(formatNumberCompact(node.point.x))}"/></label>
                    <label class="field"><span>Y</span><input class="input" type="number" step="${step}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="pointY" value="${esc(formatNumberCompact(node.point.y))}"/></label>
                    <label class="field"><span>Z</span><input class="input" type="number" step="${step}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="pointZ" value="${esc(formatNumberCompact(node.point.z))}"/></label>
                </div>
            ` : `
                <div class="kv-list">
                    <div class="kv-row display-row">
                        <div class="builder-actions">
                            <button class="btn small primary" data-act="open-node-builder-editor" data-card-id="${cardId}" data-tree-path="${tp}">编辑 Builder</button>
                            <button class="btn small" data-act="import-node-builder-json" data-card-id="${cardId}" data-tree-path="${tp}">导入 JSON</button>
                            <button class="btn small" data-act="export-node-builder-json" data-card-id="${cardId}" data-tree-path="${tp}">导出 JSON</button>
                            <button class="btn small" data-act="clear-node-builder" data-card-id="${cardId}" data-tree-path="${tp}">清空</button>
                        </div>
                    </div>
                    <div class="kv-row display-row">
                        <div class="builder-meta">节点 ${builderNodeCount} / 预览点 ${builderPointCount}</div>
                    </div>
                </div>
            `}`;
    }

    _renderTreeNodeAxisBlock(node, tp, cardId, step) {
        return `
            <div class="mini-note">轴向</div>
            <div class="grid2">
                <label class="field">
                    <span>轴向预设</span>
                    <select class="input expr-input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-axis-field="axisPreset">${this.getRelativeTargetPresetOptionsHtml(node.axisPreset || node.axisExpr)}</select>
                </label>
                <label class="field">
                    <span>轴向输入</span>
                    <input class="input expr-input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-axis-field="axisExpr" value="${esc(node.axisExpr || "")}" placeholder="axis 表达式"/>
                </label>
            </div>
            <div class="grid5 vector-inputs">
                <select class="input vector-ctor" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-axis-field="axisManualCtor">
                    ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${node.axisManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                </select>
                <input class="input" type="number" step="${step}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-axis-field="axisManualX" value="${esc(formatNumberCompact(node.axisManualX))}" placeholder="x"/>
                <input class="input" type="number" step="${step}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-axis-field="axisManualY" value="${esc(formatNumberCompact(node.axisManualY))}" placeholder="y"/>
                <input class="input" type="number" step="${step}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-axis-field="axisManualZ" value="${esc(formatNumberCompact(node.axisManualZ))}" placeholder="z"/>
                <button class="btn small primary" data-act="apply-tree-node-axis-manual" data-card-id="${cardId}" data-tree-path="${tp}">套用手动输入</button>
            </div>`;
    }

    _renderTreeNodeDisplayBlock(cardId, node, tp) {
        return `
            <div class="mini-note">显示行为</div>
            <div class="list-tools">
                <button class="btn small primary" data-act="add-tree-node-display-action" data-card-id="${cardId}" data-tree-path="${tp}">添加显示动作</button>
            </div>
            <div class="kv-list">
                ${(node.displayActions || []).map((a, aIdx) => this.renderTreeNodeDisplayActionRow(cardId, tp, a, aIdx)).join("")}
            </div>`;
    }

    _renderTreeNodeSingleView(card, node, tp, cardId, typeBlock, bindBlock, axisBlock, displayBlock, angleOffsetBlock, scaleBlock, effectHtml, treePath) {
        const isGpuCParticle = this.isTreeNodeCParticleEnabled(card, treePath);
        const cparticleBlock = this.renderCParticleNodeSettings(node, { card, cardId, treePath });
        const controllerBlock = isGpuCParticle
            ? `<div class="mini-note">CParticle 不支持 preTick action；透明度、颜色和大小曲线由 GPU 生命周期数据处理。</div>`
            : `
                <div class="mini-note">控制器</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-tree-node-cvar" data-card-id="${cardId}" data-tree-path="${tp}">添加局部变量</button>
                    <button class="btn small primary" data-act="add-tree-node-caction" data-card-id="${cardId}" data-tree-path="${tp}">添加每帧动作</button>
                </div>
                <div class="kv-list">
                    ${(node.controllerVars || []).map((it, cIdx) => `
                        <div class="kv-row grid-var">
                            <input class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-cvar-idx="${cIdx}" data-tree-node-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                            <select class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-cvar-idx="${cIdx}" data-tree-node-cvar-field="type">
                                ${CONTROLLER_VAR_TYPES.map((t) => `<option value="${esc(t)}" ${it.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
                            </select>
                            <input class="input expr-input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-cvar-idx="${cIdx}" data-tree-node-cvar-field="expr" value="${esc(it.expr)}" placeholder="初始值"/>
                            <div></div><div></div>
                            <button class="btn small" data-act="remove-tree-node-cvar" data-card-id="${cardId}" data-tree-path="${tp}" data-idx="${cIdx}">删除</button>
                        </div>
                    `).join("")}
                </div>
                <div class="kv-list">
                    ${(node.controllerActions || []).map((a, aIdx) => this.renderTreeNodeControllerActionRow(cardId, tp, a, aIdx)).join("")}
                </div>`;
        return `
            ${typeBlock}
            <div class="grid2">
                <label class="field">
                    <span>效果类型</span>
                    <select class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="effectClass">${effectHtml}</select>
                </label>
                <label class="field">
                    <span>贴图预览</span>
                    <span class="chk"><input type="checkbox" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-field="useTexture" ${node.useTexture === false ? "" : "checked"}/>使用贴图</span>
                </label>
            </div>
            ${cparticleBlock}
            ${bindBlock}
            <div class="mini-note">粒子初始化</div>
            <div class="list-tools">
                <button class="btn small primary" data-act="add-tree-node-pinit" data-card-id="${cardId}" data-tree-path="${tp}">添加初始化</button>
            </div>
            <div class="kv-list">
                ${this.renderTreeNodeParticleInitRows(cardId, node, tp, treePath)}
            </div>
            ${controllerBlock}`;
    }

    _renderTreeNodeShapeView(card, node, tp, cardId, typeBlock, bindBlock, axisBlock, displayBlock, angleOffsetBlock, scaleBlock, nodeType, treePath, opts = {}) {
        const growthBlock = nodeType === "sequenced_shape"
            ? this.renderCardAnimates(
                card.id, `nodeGrowth:${JSON.stringify(treePath)}`,
                node.growthAnimates || [],
                "生长动画", "add-tree-node-growth-animate", "remove-tree-node-growth-animate",
                { embedOnly: true }
            ).replaceAll(`data-card-id="${card.id}"`, `data-card-id="${card.id}" data-tree-path="${tp}"`)
            : "";
        const controllerBlock = `
            <div class="subgroup" data-section-key="shape_controller">
                <div class="subgroup-title">Composition 局部变量</div>
                <div class="mini-note">名称须符合变量命名规则，且不能与 rel、order、shapeRel/shapeOrder、运行时变量或全局变量/常量重名。</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-tree-node-cvar" data-card-id="${cardId}" data-tree-path="${tp}">添加局部变量</button>
                    <button class="btn small primary" data-act="add-tree-node-caction" data-card-id="${cardId}" data-tree-path="${tp}">添加每帧动作</button>
                </div>
                <div class="kv-list">
                    ${(node.controllerVars || []).map((it, cIdx) => `
                        <div class="kv-row grid-var">
                            <input class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-cvar-idx="${cIdx}" data-tree-node-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                            <select class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-cvar-idx="${cIdx}" data-tree-node-cvar-field="type">
                                ${CONTROLLER_VAR_TYPES.map((type) => `<option value="${esc(type)}" ${it.type === type ? "selected" : ""}>${esc(type)}</option>`).join("")}
                            </select>
                            <input class="input mono expr-input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-cvar-idx="${cIdx}" data-tree-node-cvar-field="expr" value="${esc(it.expr)}" placeholder="初始值"/>
                            <div></div><div></div>
                            <button class="btn small" data-act="remove-tree-node-cvar" data-card-id="${cardId}" data-tree-path="${tp}" data-idx="${cIdx}">删除</button>
                        </div>
                    `).join("")}
                </div>
                <div class="kv-list">
                    ${(node.controllerActions || []).map((action, actionIdx) => this.renderTreeNodeControllerActionRow(cardId, tp, action, actionIdx)).join("")}
                </div>
            </div>`;
        const childrenList = opts.includeChildren === false ? "" : this._renderTreeNodeChildrenList(card, node, treePath, cardId);
        const cparticleBlock = this.renderCParticleNodeSettings(node, { card, cardId, treePath });
        return `
            ${typeBlock}
            ${bindBlock}
            ${cparticleBlock}
            ${axisBlock}
            ${displayBlock}
            ${angleOffsetBlock}
            ${scaleBlock}
            ${controllerBlock}
            ${growthBlock}
            ${opts.includeChildren === false ? "" : `<div class="mini-note">并列子节点</div>${childrenList}`}`;
    }

    renderTreeNodeParticleInitRows(cardId, node, tp, treePath = []) {
        const list = Array.isArray(node?.particleInit) ? node.particleInit : [];
        const card = this.getCardById(cardId);
        const useCParticle = this.isTreeNodeCParticleEnabled(card, treePath);
        return list.map((it, pIdx) => {
            const targetOptions = this.getParticleInitTargetOptionsHtml(it.target, useCParticle ? "cparticle" : "single");
            const codegenOnly = this.isParticleInitCodegenOnlyTarget(it.target);
            const presetSelected = codegenOnly
                ? (String(it.codegenExprPreset || "").trim() || this.resolveParticleInitCodegenPresetExpr(it.codegenExpr || "", it.target))
                : (String(it.exprPreset || "").trim() || this.resolveParticleInitPresetExpr(it.expr || "", it.target));
            const valuePresetOptions = codegenOnly
                ? this.getParticleInitCodegenValuePresetOptionsHtml(presetSelected, it.target)
                : this.getParticleInitValuePresetOptionsHtml(presetSelected, it.target);
            const manualVisible = !presetSelected;
            const manualPlaceholder = codegenOnly
                ? this.getParticleInitCodegenDefaultExprByTarget(it.target)
                : this.getParticleInitDefaultExprByTarget(it.target);
            const manualValue = codegenOnly ? String(it.codegenExpr || "") : String(it.expr || "");
            const isVectorTarget = !codegenOnly && this.isParticleInitVectorTarget(it.target);
            const parsedVector = this.exprRuntime.parseVecLikeValue((!codegenOnly ? it.expr : "") || manualPlaceholder);
            const colorHex = vectorToHex01(parsedVector.x, parsedVector.y, parsedVector.z);
            const valueClass = [
                "pinit-value",
                manualVisible ? "" : "preset-only",
                (manualVisible && isVectorTarget) ? "vector-manual" : ""
            ].filter(Boolean).join(" ");
            const colorPicker = (manualVisible && isVectorTarget)
                ? `<input class="input vector-color pinit-color" type="color" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-pinit-color-idx="${pIdx}" value="${esc(colorHex)}" title="打开调色板"/>`
                : "";
            const fieldPrefix = "data-tree-node-pinit-field";
            const codegenNote = codegenOnly ? '<div class="mini-note">仅代码生成，不影响预览</div>' : "";
            return `
                <div class="kv-row grid-pinit">
                    <select class="input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-pinit-idx="${pIdx}" data-tree-node-pinit-field="target">${targetOptions}</select>
                    <div class="${valueClass}">
                        ${codegenNote}
                        <select class="input expr-input" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-pinit-idx="${pIdx}" ${fieldPrefix}="${codegenOnly ? "codegenExprPreset" : "exprPreset"}">${valuePresetOptions}</select>
                        <input class="input expr-input mono ${manualVisible ? "" : "pinit-manual-hidden"}" data-card-id="${cardId}" data-tree-path="${tp}" data-tree-node-pinit-idx="${pIdx}" ${fieldPrefix}="${codegenOnly ? "codegenExpr" : "expr"}" value="${esc(manualValue)}" placeholder="${esc(manualPlaceholder)}"/>
                        ${colorPicker}
                    </div>
                    <button class="btn small" data-act="remove-tree-node-pinit" data-card-id="${cardId}" data-tree-path="${tp}" data-idx="${pIdx}">删除</button>
                </div>
            `;
        }).join("");
    }

    renderTreeNodeControllerActionRow(cardId, tp, action, idx) {
        const item = normalizeControllerAction(action);
        const typeOptions = CONTROLLER_ACTION_TYPES
            .map((it) => `<option value="${esc(it.id)}" ${item.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`)
            .join("");
        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}" data-tree-path="${tp}" data-tree-node-cact-idx="${idx}" data-tree-node-cact-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-tree-node-caction" data-card-id="${esc(cardId)}" data-tree-path="${tp}" data-idx="${idx}">删除</button></div>
                </div>
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="每帧动作 (JS)" data-card-id="${esc(cardId)}" data-tree-path="${tp}" data-tree-node-cact-idx="${idx}" data-tree-node-cact-field="script" placeholder="if (...) { ... }&#10;addSingle() / addMultiple(2)">${esc(item.script || "")}</textarea>
            </div>`;
    }

    _renderTreeNodeChildrenList(card, node, parentPath, cardId) {
        const children = node ? (node.children || []) : [];
        const tp = esc(JSON.stringify(parentPath));
        const rows = children.map((child, idx) => {
            const childPath = [...parentPath, idx];
            const typeName = this.getShapeNodeTypeLabel(card, child);
            return `
                <div class="child-row" data-card-id="${cardId}" data-tree-path="${esc(JSON.stringify(childPath))}">
                    <div class="child-row-main">
                        <span class="child-name">${esc(child.name || `子节点 ${idx + 1}`)}</span>
                        <span class="child-type badge">${typeName}</span>
                    </div>
                    <div class="child-row-actions">
                        <button class="btn small primary child-action child-enter" data-act="shape-tree-drill-into" data-card-id="${cardId}" data-child-idx="${idx}" title="进入子节点">进入</button>
                        <button class="btn small child-action child-preset" data-act="open-node-preset" data-card-id="${cardId}" data-tree-path="${esc(JSON.stringify(childPath))}">预设</button>
                        <button class="iconbtn child-action" data-act="shape-tree-move-child-up" data-card-id="${cardId}" data-tree-path="${tp}" data-child-idx="${idx}" title="上移" aria-label="上移">↑</button>
                        <button class="iconbtn child-action" data-act="shape-tree-move-child-down" data-card-id="${cardId}" data-tree-path="${tp}" data-child-idx="${idx}" title="下移" aria-label="下移">↓</button>
                        <button class="iconbtn child-action child-action-danger" data-act="shape-tree-remove-child" data-card-id="${cardId}" data-tree-path="${tp}" data-child-idx="${idx}" title="删除" aria-label="删除">×</button>
                    </div>
                </div>`;
        }).join("");
        return `
            <div class="children-list">
                ${rows || '<div class="mini-note">暂无子节点</div>'}
            </div>
            <div class="list-tools">
                <button class="btn small primary" data-act="shape-tree-add-parallel" data-card-id="${cardId}" data-tree-path="${tp}">添加并列子节点</button>
            </div>`;
    }

    renderScaleHelperEditor(opts = {}) {
        const scope = opts.scope === "card"
            ? "card"
            : (opts.scope === "tree_node" ? "tree_node" : "project");
        const cardId = String(opts.cardId || "");
        const levelIdx = Math.max(0, int(opts.levelIdx));
        const embedOnly = !!opts.embedOnly;
        const title = String(opts.title || "缩放助手（可选）");
        const helperName = String(opts.helperName || "缩放助手");
        const sectionKeyAttr = opts.sectionKey ? ` data-section-key="${esc(String(opts.sectionKey))}"` : "";
        const scale = normalizeScaleHelperConfig(opts.scale, { type: "none" });
        const isProjectScope = scope === "project";
        if (!isProjectScope) scale.runMode = "auto";
        const runMode = isProjectScope && scale.runMode === "manual" ? "manual" : "auto";
        const fieldAttr = scope === "project"
            ? "data-project-scale-field"
            : (scope === "card"
                ? "data-card-scale-field"
                : "data-tree-node-scale-field");
        const treePathRaw = opts.treePath;
        const treePath = treePathRaw == null ? null : this.parseBezierToolTreePath(treePathRaw);
        const treePathAttr = treePath ? ` data-tree-path='${esc(JSON.stringify(treePath))}'` : "";
        const cardAttr = scope === "project"
            ? ""
            : `data-card-id="${esc(cardId)}"${treePathAttr}`;
        const openBezierAct = scope === "project"
            ? "open-project-bezier-tool"
            : (scope === "tree_node"
                ? "open-node-bezier-tool"
                : "open-card-bezier-tool");
        const copyBezierAct = scope === "project"
            ? "copy-project-bezier-params"
            : (scope === "tree_node"
                ? "copy-node-bezier-params"
                : "copy-card-bezier-params");
        const pasteBezierAct = scope === "project"
            ? "paste-project-bezier-params"
            : (scope === "tree_node"
                ? "paste-node-bezier-params"
                : "paste-card-bezier-params");
        const typeSelect = `
            <label class="field">
                <span>${esc(helperName)}</span>
                <select class="input" ${cardAttr} ${fieldAttr}="type">
                    <option value="none" ${scale.type === "none" ? "selected" : ""}>不使用</option>
                    <option value="linear" ${scale.type === "linear" ? "selected" : ""}>loadScaleValue</option>
                    <option value="bezier" ${scale.type === "bezier" ? "selected" : ""}>loadScaleHelperBezierValue</option>
                </select>
            </label>
        `;
        const runModeSelect = isProjectScope ? `
            <label class="field">
                <span>运行模式</span>
                <select class="input" ${fieldAttr}="runMode">
                    <option value="auto" ${runMode === "auto" ? "selected" : ""}>自动（系统调用）</option>
                    <option value="manual" ${runMode === "manual" ? "selected" : ""}>手动（表达式调用）</option>
                </select>
            </label>
        ` : "";
        if (scale.type === "none") {
            const body = `
                <div class="${isProjectScope ? "grid3" : "grid2"}">
                    ${typeSelect}
                    ${runModeSelect}
                    <div class="mini-note">仅可添加一个缩放助手</div>
                </div>
            `;
            if (embedOnly) return body;
            return `
                <div class="subgroup"${sectionKeyAttr}>
                    <div class="subgroup-title">${esc(title)}</div>
                    ${body}
                </div>
            `;
        }
        const bezierRows = scale.type === "bezier" ? `
            <div class="grid2">
                <label class="field">
                    <span>起始曲线 RelativeLocation(x,y,z)</span>
                    <div class="grid3">
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c1x" value="${esc(formatNumberCompact(scale.c1x))}" placeholder="x"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c1y" value="${esc(formatNumberCompact(scale.c1y))}" placeholder="y"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c1z" value="${esc(formatNumberCompact(scale.c1z))}" placeholder="z"/>
                    </div>
                </label>
                <label class="field">
                    <span>结束曲线 RelativeLocation(x,y,z)</span>
                    <div class="grid3">
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c2x" value="${esc(formatNumberCompact(scale.c2x))}" placeholder="x"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c2y" value="${esc(formatNumberCompact(scale.c2y))}" placeholder="y"/>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="c2z" value="${esc(formatNumberCompact(scale.c2z))}" placeholder="z"/>
                    </div>
                </label>
            </div>
            <div class="list-tools">
                <button class="btn small" data-act="${copyBezierAct}" ${cardAttr}>复制参数</button>
                <button class="btn small" data-act="${pasteBezierAct}" ${cardAttr}>从剪贴板粘贴</button>
                <button class="btn small" data-act="${openBezierAct}" ${cardAttr}>打开 Bezier 工具</button>
            </div>
        ` : "";
        const body = `
            <div class="${isProjectScope ? "grid3" : "grid2"}">
                ${typeSelect}
                ${runModeSelect}
                <label class="chk">
                    <input type="checkbox" ${cardAttr} ${fieldAttr}="reversedOnDisable" ${scale.reversedOnDisable ? "checked" : ""}/>
                    <span>消散时回缩</span>
                </label>
            </div>
            ${isProjectScope && runMode === "manual" ? '<div class="mini-note">手动模式下不会自动调用缩放，请在项目 display 表达式中使用 scaleHelper.doScale() / scaleHelper.doScaleReversed()。</div>' : ""}
            <div class="grid3">
                <label class="field">
                    <span>起始缩放</span>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="min" value="${esc(formatNumberCompact(scale.min))}"/>
                </label>
                <label class="field">
                    <span>结束缩放</span>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" ${cardAttr} ${fieldAttr}="max" value="${esc(formatNumberCompact(scale.max))}"/>
                </label>
                <label class="field">
                    <span>缩放时长 (tick)</span>
                    <input class="input" type="number" min="1" step="1" ${cardAttr} ${fieldAttr}="tick" value="${esc(String(scale.tick))}"/>
                </label>
            </div>
            ${bezierRows}
        `;
        if (embedOnly) return body;
        return `
            <div class="subgroup"${sectionKeyAttr}>
                <div class="subgroup-title">${esc(title)}</div>
                ${body}
            </div>
        `;
    }

    renderAlphaHelperEditor(opts = {}) {
        const title = String(opts.title || "透明度助手（仅项目层）");
        const alpha = normalizeAlphaHelperConfig(opts.alpha, { type: "none" });
        const runMode = alpha.runMode === "manual" ? "manual" : "auto";
        const typeSelect = `
            <label class="field">
                <span>Alpha Helper</span>
                <select class="input" data-project-alpha-field="type">
                    <option value="none" ${alpha.type === "none" ? "selected" : ""}>不使用</option>
                    <option value="alpha" ${alpha.type === "alpha" ? "selected" : ""}>CompositionAlphaHelper</option>
                </select>
            </label>
        `;
        const runModeSelect = `
            <label class="field">
                <span>运行模式</span>
                <select class="input" data-project-alpha-field="runMode">
                    <option value="auto" ${runMode === "auto" ? "selected" : ""}>自动（系统调用）</option>
                    <option value="manual" ${runMode === "manual" ? "selected" : ""}>手动（表达式调用）</option>
                </select>
            </label>
        `;
        if (alpha.type === "none") {
            return `
                <div class="subgroup">
                    <div class="subgroup-title">${esc(title)}</div>
                    <div class="grid3">
                        ${typeSelect}
                        ${runModeSelect}
                        <div class="mini-note">只作用于最外层项目 Composition</div>
                    </div>
                </div>
            `;
        }
        return `
            <div class="subgroup">
                <div class="subgroup-title">${esc(title)}</div>
                <div class="grid3">
                    ${typeSelect}
                    ${runModeSelect}
                    <label class="chk">
                        <input type="checkbox" data-project-alpha-field="startMax" ${alpha.startMax ? "checked" : ""}/>
                        <span>最大开始</span>
                    </label>
                </div>
                <div class="grid3">
                    <label class="chk">
                        <input type="checkbox" data-project-alpha-field="decreaseOnDisable" ${alpha.decreaseOnDisable ? "checked" : ""}/>
                        <span>消散时变淡</span>
                    </label>
                </div>
                ${runMode === "manual"
                    ? '<div class="mini-note">手动模式下不会自动调用透明度助手，仅项目 display 表达式可使用 alphaHelper.increaseAlpha() / alphaHelper.decreaseAlpha() 等方法。</div>'
                    : `<div class="mini-note">自动模式会在启用时 increaseAlpha()，${alpha.decreaseOnDisable ? "消散时 decreaseAlpha()" : "消散时保持当前透明度"}。</div>`}
                <div class="grid3">
                    <label class="field">
                        <span>最小不透明度</span>
                        <input class="input" type="number" min="0" max="1" step="${this.state.settings.paramStep}" data-project-alpha-field="min" value="${esc(formatNumberCompact(alpha.min))}"/>
                    </label>
                    <label class="field">
                        <span>最大不透明度</span>
                        <input class="input" type="number" min="0" max="1" step="${this.state.settings.paramStep}" data-project-alpha-field="max" value="${esc(formatNumberCompact(alpha.max))}"/>
                    </label>
                    <label class="field">
                        <span>不透明时长 (tick)</span>
                        <input class="input" type="number" min="1" step="1" data-project-alpha-field="tick" value="${esc(String(alpha.tick))}"/>
                    </label>
                </div>
            </div>
        `;
    }

    renderAngleOffsetControl(opts = {}) {
        const scope = opts.scope === "card"
            ? "card"
            : "tree_node";
        const cardId = String(opts.cardId || "");
        const treePathRaw = opts.treePath;
        const treePath = treePathRaw == null ? null : this.parseBezierToolTreePath(treePathRaw);
        const value = opts.value && typeof opts.value === "object" ? opts.value : {};
        const title = String(opts.title || "相对角度偏移（可选）");
        const enabled = value.angleOffsetEnabled === true;
        const count = Math.max(1, int(value.angleOffsetCount || 1));
        const glowTick = Math.max(1, int(value.angleOffsetGlowTick || 20));
        const easeName = normalizeAngleOffsetEaseName(value.angleOffsetEase || "outCubic");
        const reverseOnDisable = value.angleOffsetReverseOnDisable === true;
        const angleMode = value.angleOffsetAngleMode === "expr" ? "expr" : "numeric";
        const angleValue = Number.isFinite(Number(value.angleOffsetAngleValue)) ? num(value.angleOffsetAngleValue) : 360;
        const angleUnit = normalizeAngleUnit(value.angleOffsetAngleUnit || "deg");
        const angleExpr = String(value.angleOffsetAngleExpr || value.angleOffsetAnglePreset || "PI * 2");
        const easeSpecialParams = normalizeAngleOffsetEaseSpecialParams(value);
        const easeParamMeta = getAngleOffsetEaseParamMeta(easeName);

        const treePathAttr = treePath ? ` data-tree-path='${esc(JSON.stringify(treePath))}'` : "";
        const fieldAttr = scope === "card"
            ? "data-card-field"
            : "data-tree-node-angle-field";
        const baseAttr = `data-card-id="${esc(cardId)}"${treePathAttr}`;
        const fieldName = (short, full) => (scope === "card" ? full : short);
        const bindAttr = (short, full) => `${baseAttr} ${fieldAttr}="${fieldName(short, full)}"`;
        const openBezierAct = scope === "card"
            ? "open-card-angle-bezier-tool"
            : "open-node-angle-bezier-tool";

        const easeOptions = ANGLE_OFFSET_EASE_OPTIONS
            .map((it) => `<option value="${esc(it.id)}" ${it.id === easeName ? "selected" : ""}>${esc(it.title)}</option>`)
            .join("");

        const angleInput = angleMode === "expr"
            ? `
                <div class="grid2">
                    <label class="field">
                        <span>总角度预设</span>
                        <select class="input expr-input" ${bindAttr("anglePreset", "angleOffsetAnglePreset")}>${this.getAngleExprPresetOptionsHtml(angleExpr)}</select>
                    </label>
                    <label class="field">
                        <span>总角度表达式</span>
                        <input class="input expr-input" ${bindAttr("angleExpr", "angleOffsetAngleExpr")} value="${esc(angleExpr)}" placeholder="PI * 2"/>
                    </label>
                </div>
            `
            : `
                <div class="grid2">
                    <label class="field">
                        <span>总角度</span>
                        <input class="input" type="number" step="${this.state.settings.paramStep}" ${bindAttr("angleValue", "angleOffsetAngleValue")} value="${esc(formatAngleValue(angleValue))}"/>
                    </label>
                    <label class="field">
                        <span>单位</span>
                        <select class="input" ${bindAttr("angleUnit", "angleOffsetAngleUnit")}>
                            <option value="deg" ${angleUnit === "deg" ? "selected" : ""}>度</option>
                            <option value="rad" ${angleUnit === "rad" ? "selected" : ""}>弧度</option>
                        </select>
                    </label>
                </div>
            `;

        const easeParamInput = hasAngleOffsetEaseSpecialParams(easeName)
            ? `
                <div class="mini-note">函数参数</div>
                <div class="${easeParamMeta.length <= 2 ? "grid2" : "grid3"}">
                    ${easeParamMeta.map((meta) => `
                        <label class="field">
                            <span title="${esc(meta.tip || "")}">${esc(meta.label)}</span>
                            <input class="input" type="number" step="${this.state.settings.paramStep}" ${bindAttr(meta.short, meta.field)} value="${esc(formatAngleValue(easeSpecialParams[meta.field]))}"/>
                        </label>
                    `).join("")}
                </div>
                ${easeName === "bezierEase"
                    ? `<div class="list-tools"><button class="btn small" data-act="${openBezierAct}" ${baseAttr}>打开 Bezier 工具</button></div>`
                    : ""}
            `
            : "";

        return `
            <div class="mini-note">${esc(title)}</div>
            <div class="grid3">
                <div class="field">
                    <span>启用</span>
                    <label class="chk">
                        <input type="checkbox" ${bindAttr("enabled", "angleOffsetEnabled")} ${enabled ? "checked" : ""}/>
                        <span>开启相对角度偏移</span>
                    </label>
                </div>
                <label class="field">
                    <span>偏移个数</span>
                    <input class="input" type="number" min="1" step="1" ${bindAttr("count", "angleOffsetCount")} value="${esc(String(count))}"/>
                </label>
                <label class="field">
                    <span>glowingTick</span>
                    <input class="input" type="number" min="1" step="1" ${bindAttr("glowTick", "angleOffsetGlowTick")} value="${esc(String(glowTick))}"/>
                </label>
            </div>
            <div class="grid3">
                <label class="field">
                    <span>缓动</span>
                    <select class="input" ${bindAttr("ease", "angleOffsetEase")}>${easeOptions}</select>
                </label>
                <div class="field">
                    <span>消散时反向收回</span>
                    <label class="chk">
                        <input type="checkbox" ${bindAttr("reverseOnDisable", "angleOffsetReverseOnDisable")} ${reverseOnDisable ? "checked" : ""}/>
                        <span>启用</span>
                    </label>
                </div>
                <label class="field">
                    <span>总角度模式</span>
                    <select class="input" ${bindAttr("angleMode", "angleOffsetAngleMode")}>
                        <option value="numeric" ${angleMode === "numeric" ? "selected" : ""}>角度输入</option>
                        <option value="expr" ${angleMode === "expr" ? "selected" : ""}>表达式</option>
                    </select>
                </label>
            </div>
            ${easeParamInput}
            ${angleInput}
        `;
    }

    renderAngleControl(opts = {}) {
        const scope = opts.scope === "card" ? "card" : (opts.scope === "shape_display" ? "shape_display" : "display");
        const idx = int(opts.idx);
        const mode = opts.mode === "expr" ? "expr" : "numeric";
        const value = Number.isFinite(Number(opts.value)) ? num(opts.value) : 0;
        const unit = normalizeAngleUnit(opts.unit);
        const expr = String(opts.expr || "");

        if (scope === "display") {
            return `
                <div class="angle-control">
                    <div class="grid2">
                    <select class="input" data-display-idx="${idx}" data-display-field="angleMode">
                            <option value="numeric" ${mode === "numeric" ? "selected" : ""}>角度输入</option>
                            <option value="expr" ${mode === "expr" ? "selected" : ""}>表达式</option>
                        </select>
                    ${mode === "expr"
                            ? `<div class="grid2">
                                <select class="input expr-input" data-display-idx="${idx}" data-display-field="angleExprPreset">${this.getAngleExprPresetOptionsHtml(expr)}</select>
                                <input class="input expr-input" data-display-idx="${idx}" data-display-field="angleExpr" value="${esc(expr)}" placeholder="angle 表达式"/>
                            </div>`
                            : `<div class="angle-control-main">
                                <input class="input angle-value" type="number" step="${this.state.settings.paramStep}" data-display-idx="${idx}" data-display-field="angleValue" value="${esc(formatAngleValue(value))}"/>
                                <select class="input angle-unit" data-display-idx="${idx}" data-display-field="angleUnit">
                                    <option value="deg" ${unit === "deg" ? "selected" : ""}>度</option>
                                    <option value="rad" ${unit === "rad" ? "selected" : ""}>弧度</option>
                                </select>
                            </div>`}
                    </div>
                </div>
            `;
        }

        if (scope === "shape_display") {
            return `
                <div class="angle-control">
                    <div class="grid2">
                        <select class="input" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleMode">
                            <option value="numeric" ${mode === "numeric" ? "selected" : ""}>角度输入</option>
                            <option value="expr" ${mode === "expr" ? "selected" : ""}>表达式</option>
                        </select>
                        ${mode === "expr"
                            ? `<div class="grid2">
                                <select class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleExprPreset">${this.getAngleExprPresetOptionsHtml(expr)}</select>
                                <input class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleExpr" value="${esc(expr)}" placeholder="angle 表达式"/>
                            </div>`
                            : `<div class="angle-control-main">
                                <input class="input angle-value" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleValue" value="${esc(formatAngleValue(value))}"/>
                                <select class="input angle-unit" data-card-id="${esc(opts.cardId || "")}" data-card-shape-display-idx="${idx}" data-card-shape-display-field="angleUnit">
                                    <option value="deg" ${unit === "deg" ? "selected" : ""}>度</option>
                                    <option value="rad" ${unit === "rad" ? "selected" : ""}>弧度</option>
                                </select>
                            </div>`}
                    </div>
                </div>
            `;
        }

        return `
            <div class="angle-control">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleMode">
                        <option value="numeric" ${mode === "numeric" ? "selected" : ""}>角度输入</option>
                        <option value="expr" ${mode === "expr" ? "selected" : ""}>表达式</option>
                    </select>
                    ${mode === "expr"
                        ? `<div class="grid2">
                            <select class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAnglePreset">${this.getAngleExprPresetOptionsHtml(expr)}</select>
                            <input class="input expr-input" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleExpr" value="${esc(expr)}" placeholder="angle 表达式"/>
                        </div>`
                        : `<div class="angle-control-main">
                            <input class="input angle-value" type="number" step="${this.state.settings.paramStep}" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleValue" value="${esc(formatAngleValue(value))}"/>
                            <select class="input angle-unit" data-card-id="${esc(opts.cardId || "")}" data-card-field="rotateAngleUnit">
                                <option value="deg" ${unit === "deg" ? "selected" : ""}>度</option>
                                <option value="rad" ${unit === "rad" ? "selected" : ""}>弧度</option>
                            </select>
                        </div>`}
                </div>
            </div>
        `;
    }

    getRelativeTargetPresetOptionsHtml(selectedExpr = "") {
        const presets = this.getRelativeTargetPresets();
        const pick = String(selectedExpr || "").trim();
        const hasPick = !!pick && presets.some((p) => p.expr === pick);
        const rows = [`<option value="" ${hasPick ? "" : "selected"}>选择预设或全局变量</option>`];
        for (const p of presets) {
            rows.push(`<option value="${esc(p.expr)}" ${p.expr === pick ? "selected" : ""}>${esc(p.label)}</option>`);
        }
        return rows.join("");
    }

    getRelativeTargetPresets() {
        const out = [
            { label: "RelativeLocation.yAxis()", expr: "RelativeLocation.yAxis()" },
            { label: "RelativeLocation(0,1,0)", expr: "RelativeLocation(0.0, 1.0, 0.0)" }
        ];
        for (const v of this.state.globalVars) {
            const name = String(v.name || "").trim();
            if (!name) continue;
            const type = String(v.type || "").trim();
            if (type === "Vec3") out.push({ label: `${name}.asRelative()`, expr: `${name}.asRelative()` });
            if (type === "Vector3f") out.push({ label: `${name}.asRelative()`, expr: `${name}.asRelative()` });
            if (type === "RelativeLocation") out.push({ label: `${name}`, expr: `${name}` });
        }
        return out;
    }

    getAngleExprPresetOptionsHtml(selectedExpr = "") {
        const selected = String(selectedExpr || "").trim();
        const presets = ["speed / 180 * PI", "PI / 180", "0.01", "0.05", "PI * 0.1"];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            const type = String(g.type || "").trim();
            if (!name) continue;
            if (["Int", "Long", "Float", "Double"].includes(type)) {
                presets.push(name);
                presets.push(`${name} / 180 * PI`);
            }
        }
        const uniq = Array.from(new Set(presets.filter(Boolean)));
        if (selected && !uniq.includes(selected)) uniq.unshift(selected);
        return uniq.map((expr) => `<option value="${esc(expr)}" ${expr === selected ? "selected" : ""}>${esc(expr)}</option>`).join("");
    }

    getParticleInitTargetOptionsHtml(selectedTarget = "") {
        const selected = String(selectedTarget || "").trim() || "size";
        const rows = [];
        if (!PARTICLE_INIT_TARGET_OPTIONS.includes(selected)) {
            rows.push({ value: selected, label: `${selected} (自定义)` });
        }
        for (const target of PARTICLE_INIT_TARGET_OPTIONS) {
            rows.push({ value: target, label: this.getParticleInitTargetLabel(target) });
        }
        return rows.map((row) => `<option value="${esc(row.value)}" ${row.value === selected ? "selected" : ""}>${esc(row.label)}</option>`).join("");
    }

    getParticleInitTargetLabel(targetRaw = "") {
        const target = String(targetRaw || "").trim();
        if (target === "size" || target === "particleSize") return `${target} (粒子大小)`;
        if (target === "particleAlpha" || target === "alpha") return `${target} (透明度)`;
        if (target === "currentAge" || target === "age") return `${target} (年龄)`;
        if (target === "textureSheet") return "textureSheet (贴图序号)";
        if (target === "color" || target === "particleColor") return `${target} (颜色 Vector3f)`;
        return target;
    }

    isParticleInitVectorTarget(targetRaw = "") {
        const target = String(targetRaw || "").trim().toLowerCase();
        return target === "color" || target === "particlecolor" || target === "particle.particlecolor";
    }

    getParticleInitDefaultExprByTarget(targetRaw = "") {
        const target = String(targetRaw || "").trim().toLowerCase();
        if (target === "size" || target === "particlesize" || target === "particle.particlesize") return "0.2";
        if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") return "1.0";
        if (target === "currentage" || target === "age") return "0";
        if (target === "texturesheet") return "0";
        if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") return "Vector3f(1F, 1F, 1F)";
        return "0";
    }

    getParticleInitValuePresetOptionsHtml(selectedExpr = "", targetRaw = "") {
        const selected = String(selectedExpr || "").trim();
        const useVector = this.isParticleInitVectorTarget(targetRaw);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const rows = [{ value: "", label: "手动输入常量" }];
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            const type = String(g?.type || "").trim();
            if (!name) continue;
            const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
            const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
            if (useVector && !isVector) continue;
            if (!useVector && !isNumeric) continue;
            rows.push({
                value: `this@${projectClass}.${name}`,
                label: `${name}（全局变量 ${type}）`
            });
        }
        if (!useVector) {
            for (const c of (this.state.globalConsts || [])) {
                const name = String(c?.name || "").trim();
                if (!name) continue;
                rows.push({ value: name, label: `${name}（全局常量）` });
            }
        }
        const uniq = [];
        const used = new Set();
        for (const it of rows) {
            const key = String(it.value || "");
            if (used.has(key)) continue;
            used.add(key);
            uniq.push(it);
        }
        if (selected && !used.has(selected)) {
            uniq.unshift({ value: selected, label: `${selected}（当前值）` });
        }
        return uniq.map((it) => {
            const val = String(it.value || "");
            const active = selected ? (val === selected) : (!val);
            return `<option value="${esc(val)}" ${active ? "selected" : ""}>${esc(it.label)}</option>`;
        }).join("");
    }

    resolveParticleInitPresetExpr(exprRaw = "", targetRaw = "") {
        const expr = String(exprRaw || "").trim();
        if (!expr) return "";
        const useVector = this.isParticleInitVectorTarget(targetRaw);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const classRef = expr.match(/^this@[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)$/);
        if (classRef) {
            const name = classRef[1];
            for (const g of (this.state.globalVars || [])) {
                if (String(g?.name || "").trim() !== name) continue;
                const type = String(g?.type || "").trim();
                const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
                const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
                if (useVector ? isVector : isNumeric) {
                    return `this@${projectClass}.${name}`;
                }
                return "";
            }
            return "";
        }
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            const type = String(g?.type || "").trim();
            const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
            const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
            if (useVector ? !isVector : !isNumeric) continue;
            const expected = `this@${projectClass}.${name}`;
            if (expr === expected) return expected;
        }
        if (useVector) return "";
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            if (expr === name) return expr;
        }
        return "";
    }

    updateParticleInitColorValue(item, hex) {
        if (!item || !this.isParticleInitVectorTarget(item.target)) return;
        const c = hexToVector01(hex);
        item.expr = formatVectorLiteral("Vector3f", c.x, c.y, c.z);
        item.exprPreset = "";
    }

    syncParticleInitInlineInputs(cardId, pinitIdx, item) {
        const idx = int(pinitIdx);
        if (idx < 0 || !item || !this.dom?.cardsRoot) return;
        if (!this.isParticleInitVectorTarget(item.target)) return;
        const root = this.dom.cardsRoot;
        const colorInput = root.querySelector(`input[data-card-id="${cardId}"][data-pinit-color-idx="${idx}"]`);
        if (!colorInput) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.expr || this.getParticleInitDefaultExprByTarget(item.target));
        if (document.activeElement !== colorInput) {
            colorInput.value = vectorToHex01(parsed.x, parsed.y, parsed.z);
        }
    }


    syncTreeNodeParticleInitInlineInputs(cardId, treePathRaw, pinitIdx, item) {
        const idx = int(pinitIdx);
        const rawPath = String(treePathRaw || "").trim();
        if (idx < 0 || !rawPath || !item || !this.dom?.cardsRoot) return;
        if (!this.isParticleInitVectorTarget(item.target)) return;
        const root = this.dom.cardsRoot;
        const matches = Array.from(root.querySelectorAll(`input[data-card-id=\"${cardId}\"][data-tree-node-pinit-color-idx=\"${idx}\"]`));
        const colorInput = matches.find((el) => String(el?.dataset?.treePath || "").trim() === rawPath) || null;
        if (!colorInput) return;
        const parsed = this.exprRuntime.parseVecLikeValue(item.expr || this.getParticleInitDefaultExprByTarget(item.target));
        if (document.activeElement !== colorInput) {
            colorInput.value = vectorToHex01(parsed.x, parsed.y, parsed.z);
        }
    }
    renderParticleInitRows(card) {
        const list = Array.isArray(card?.particleInit) ? card.particleInit : [];
        return list.map((it, pIdx) => {
            const useCParticle = isCompositionCardUsingCParticle(card);
            const targetOptions = this.getParticleInitTargetOptionsHtml(it.target, useCParticle ? "cparticle" : "single");
            const codegenOnly = this.isParticleInitCodegenOnlyTarget(it.target);
            const presetSelected = codegenOnly
                ? (String(it.codegenExprPreset || "").trim() || this.resolveParticleInitCodegenPresetExpr(it.codegenExpr || "", it.target))
                : (String(it.exprPreset || "").trim() || this.resolveParticleInitPresetExpr(it.expr || "", it.target));
            const valuePresetOptions = codegenOnly
                ? this.getParticleInitCodegenValuePresetOptionsHtml(presetSelected, it.target)
                : this.getParticleInitValuePresetOptionsHtml(presetSelected, it.target);
            const manualVisible = !presetSelected;
            const manualPlaceholder = codegenOnly
                ? this.getParticleInitCodegenDefaultExprByTarget(it.target)
                : this.getParticleInitDefaultExprByTarget(it.target);
            const manualValue = codegenOnly ? String(it.codegenExpr || "") : String(it.expr || "");
            const isVectorTarget = !codegenOnly && this.isParticleInitVectorTarget(it.target);
            const parsedVector = this.exprRuntime.parseVecLikeValue((!codegenOnly ? it.expr : "") || manualPlaceholder);
            const colorHex = vectorToHex01(parsedVector.x, parsedVector.y, parsedVector.z);
            const valueClass = [
                "pinit-value",
                manualVisible ? "" : "preset-only",
                (manualVisible && isVectorTarget) ? "vector-manual" : ""
            ].filter(Boolean).join(" ");
            const colorPicker = (manualVisible && isVectorTarget)
                ? `<input class="input vector-color pinit-color" type="color" data-card-id="${card.id}" data-pinit-color-idx="${pIdx}" value="${esc(colorHex)}" title="打开调色板"/>`
                : "";
            const codegenNote = codegenOnly ? '<div class="mini-note">仅代码生成，不影响预览</div>' : "";
            return `
                <div class="kv-row grid-pinit">
                    <select class="input" data-card-id="${card.id}" data-pinit-idx="${pIdx}" data-pinit-field="target">${targetOptions}</select>
                    <div class="${valueClass}">
                        ${codegenNote}
                        <select class="input expr-input" data-card-id="${card.id}" data-pinit-idx="${pIdx}" data-pinit-field="${codegenOnly ? "codegenExprPreset" : "exprPreset"}">${valuePresetOptions}</select>
                        <input class="input expr-input mono ${manualVisible ? "" : "pinit-manual-hidden"}" data-card-id="${card.id}" data-pinit-idx="${pIdx}" data-pinit-field="${codegenOnly ? "codegenExpr" : "expr"}" value="${esc(manualValue)}" placeholder="${esc(manualPlaceholder)}"/>
                        ${colorPicker}
                    </div>
                    <button class="btn small" data-act="remove-pinit" data-card-id="${card.id}" data-idx="${pIdx}">删除</button>
                </div>
            `;
        }).join("");
    }

    renderCards() {
        this.ensureSelectionValid();
        const activeCard = this.getFocusedCard() || this.state.cards[0] || null;
        const activeIdx = activeCard ? this.getCardIndexById(activeCard.id) : -1;
        if (this.dom.activeCardTabLabel) {
            this.dom.activeCardTabLabel.textContent = activeIdx >= 0 ? `卡片 ${activeIdx + 1}` : "无卡片";
        }
        if (this.dom.compositionLayersRoot) {
            this.dom.compositionLayersRoot.innerHTML = this.renderCompositionLayersHtml();
        }
        this.dom.cardsRoot.innerHTML = activeCard ? this.renderActiveCardWorkspaceHtml(activeCard, activeIdx) : `
            <section class="workbench-panel empty-card-editor">
                <div class="mini-note">暂无卡片，请添加一个合成层。</div>
            </section>
        `;
        this.decorateCardSubgroups();
        this.refreshCodeEditors();
        this.updateSelectionStatus();
    }

    renderCompositionLayersHtml() {
        return `
            <section class="workbench-panel composition-layers-panel">
                <div class="workbench-panel-title">
                    <span>合成层</span>
                    <div class="card-title-row-actions">
                        <span class="badge">${this.state.cards.length}</span>
                        <button class="btn small primary" data-act="add-card">添加</button>
                    </div>
                </div>
                <div class="layer-stack">
                    ${this.state.cards.map((card, idx) => this.renderLayerRowHtml(card, idx)).join("")}
                </div>
            </section>
        `;
    }

    renderLayerRowHtml(card, idx) {
        const selected = this.selectedCardIds.has(card.id);
        const focused = this.focusedCardId === card.id;
        const typeLabel = card.dataType === "particle_shape"
            ? "形状"
            : (card.dataType === "sequenced_shape" ? "序列形状" : (isCompositionCardUsingCParticle(card) ? "C粒子" : "单粒子"));
        const sourceLabel = card.bindMode === "point" ? "点位" : "Builder";
        const previewVisible = card.previewVisible !== false;
        const previewSolo = card.previewSolo === true;
        return `
            <div class="layer-row ${selected ? "selected" : ""} ${focused ? "focused" : ""}" data-card-id="${card.id}">
                <button class="layer-pick" data-act="select-card" data-card-id="${card.id}" title="选择图层">
                    <span class="layer-index">${idx + 1}</span>
                    <span class="layer-main">
                        <span class="layer-name">${esc(card.name || `卡片 ${idx + 1}`)}</span>
                        <span class="layer-meta">${typeLabel} / ${sourceLabel}</span>
                    </span>
                </button>
                <div class="layer-toggles">
                    <label class="chk layer-toggle" title="控制该合成层是否参与总预览">
                        <input type="checkbox" data-card-id="${card.id}" data-layer-preview-field="visible" ${previewVisible ? "checked" : ""}/>可见
                    </label>
                    <label class="chk layer-toggle" title="只预览该合成层，关闭后恢复原可见状态">
                        <input type="checkbox" data-card-id="${card.id}" data-layer-preview-field="solo" ${previewSolo ? "checked" : ""}/>独显
                    </label>
                </div>
                <div class="layer-actions">
                    <button class="iconbtn" data-act="move-card-up" data-card-id="${card.id}" title="上移">↑</button>
                    <button class="iconbtn" data-act="move-card-down" data-card-id="${card.id}" title="下移">↓</button>
                    <button class="iconbtn" data-act="duplicate-card" data-card-id="${card.id}" title="复制">⧉</button>
                    <button class="iconbtn" data-act="delete-card" data-card-id="${card.id}" title="删除">🗑</button>
                </div>
            </div>
        `;
    }

    renderActiveCardWorkspaceHtml(card, idx) {
        const selected = this.selectedCardIds.has(card.id);
        return `
            <section class="card composition-editor-card ${selected ? "selected" : ""}" data-card-id="${card.id}">
                <header class="card-head composition-editor-head" data-card-id="${card.id}">
                    <div class="card-head-left">
                        <input
                            class="input card-name-input"
                            data-card-id="${card.id}"
                            data-card-field="name"
                            value="${esc(card.name || `卡片 ${idx + 1}`)}"
                            placeholder="卡片备注 / 名称"
                            title="可编辑卡片备注名称"
                        />
                    </div>
                    <div class="card-head-preset">
                        <button class="btn small primary" data-act="open-card-preset" data-card-id="${card.id}">卡片预设</button>
                    </div>
                    <div class="card-head-actions">
                        <button class="btn small" data-act="collapse-all-sections" data-card-id="${card.id}" title="折叠全部分区">折叠属性</button>
                        <button class="btn small" data-act="expand-all-sections" data-card-id="${card.id}" title="展开全部分区">展开属性</button>
                    </div>
                </header>
                <div class="composition-editor-grid">
                    <section class="workbench-panel layer-settings-panel">
                        <div class="workbench-panel-title">图层属性</div>
                        ${this.renderCardBaseSection(card, idx)}
                        ${this.renderCardSourceSection(card)}
                    </section>
                    <section class="workbench-panel effect-stack-panel">
                        ${isCompositionLeafParticleType(card.dataType) ? this.renderSingleEffectStackPanel(card) : this.renderShapeStackPanel(card)}
                    </section>
                    <section class="workbench-panel inspector-panel">
                        ${isCompositionLeafParticleType(card.dataType) ? this.renderSingleInspectorPanel(card) : this.renderShapeInspectorPanel(card)}
                    </section>
                </div>
            </section>
        `;
    }

    renderCardBaseSection(card, idx) {
        return `
            <div class="subgroup" data-section-key="base">
                <div class="subgroup-title">基础</div>
                <div class="grid2">
                    <label class="field">
                        <span>绑定方式</span>
                        <select class="input" data-card-id="${card.id}" data-card-field="bindMode">
                            <option value="builder" ${card.bindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                            <option value="point" ${card.bindMode === "point" ? "selected" : ""}>手动点位</option>
                        </select>
                    </label>
                    <label class="field">
                        <span>点类型</span>
                        <select class="input" data-card-id="${card.id}" data-card-field="dataType">
                            ${this.getCardTypeOptionsHtml(card)}
                        </select>
                    </label>
                </div>
            </div>
        `;
    }

    getCardTypeOptionsHtml(card) {
        const gpu = this.state.useCParticle === true || card.useCParticle === true || card.particleBackend === "cparticle";
        return `
            <option value="single" ${card.dataType === "single" ? "selected" : ""}>${gpu ? "CParticle" : "单粒子"}</option>
            <option value="particle_shape" ${card.dataType === "particle_shape" ? "selected" : ""}>${gpu ? "GPU Composition" : "形状 Composition"}</option>
            <option value="sequenced_shape" ${card.dataType === "sequenced_shape" ? "selected" : ""}>${gpu ? "GPU 序列 Composition" : "序列形状 Composition"}</option>`;
    }

    renderCardSourceSection(card) {
        const builderStats = this.evaluateBuilderPoints(card.builderState);
        const builderNodeCount = this.countBuilderNodes(card.builderState?.root?.children || []);
        const builderPointCount = (builderStats.points || []).length;
        if (card.bindMode === "point") {
            return `
                <div class="subgroup" data-section-key="source">
                    <div class="subgroup-title">点位来源</div>
                    <div class="grid3">
                        <label class="field"><span>X</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="x" value="${esc(String(card.point.x))}"/></label>
                        <label class="field"><span>Y</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="y" value="${esc(String(card.point.y))}"/></label>
                        <label class="field"><span>Z</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="z" value="${esc(String(card.point.z))}"/></label>
                    </div>
                </div>
            `;
        }
        return `
            <div class="subgroup" data-section-key="source">
                <div class="subgroup-title">PointsBuilder 来源</div>
                <div class="kv-list">
                    <div class="kv-row display-row">
                        <div class="builder-actions">
                            <button class="btn small primary" data-act="open-builder-editor" data-card-id="${card.id}">编辑 Builder</button>
                            <button class="btn small" data-act="import-builder-json" data-card-id="${card.id}">导入 JSON</button>
                            <button class="btn small" data-act="export-builder-json" data-card-id="${card.id}">导出 JSON</button>
                            <button class="btn small" data-act="clear-builder" data-card-id="${card.id}">清空</button>
                        </div>
                    </div>
                    <div class="kv-row display-row">
                        <div class="builder-meta">节点 ${builderNodeCount} / 预览点 ${builderPointCount}</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderSingleEffectStackPanel(card) {
        const isGpuCParticle = isCompositionCardUsingCParticle(card);
        const controllerBlock = isGpuCParticle
            ? `<div class="mini-note">CParticle 不支持 preTick action；透明度、颜色和大小曲线由 GPU 生命周期数据处理。</div>`
            : `
                <div class="subgroup" data-section-key="single_controller_init">
                    <div class="subgroup-title">控制器</div>
                    <div class="list-tools">
                        <button class="btn small primary" data-act="add-cvar" data-card-id="${card.id}">添加局部变量</button>
                        <button class="btn small primary" data-act="add-caction" data-card-id="${card.id}">添加每帧动作</button>
                    </div>
                    <div class="kv-list">
                        ${card.controllerVars.map((it, cIdx) => `
                            <div class="kv-row grid-var">
                                <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                                <select class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="type">
                                    ${CONTROLLER_VAR_TYPES.map((tp) => `<option value="${esc(tp)}" ${it.type === tp ? "selected" : ""}>${esc(tp)}</option>`).join("")}
                                </select>
                                <input class="input expr-input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="expr" value="${esc(it.expr)}" placeholder="初始值"/>
                                <div></div><div></div>
                                <button class="btn small" data-act="remove-cvar" data-card-id="${card.id}" data-idx="${cIdx}">删除</button>
                            </div>
                        `).join("")}
                    </div>
                    <div class="kv-list">
                        ${(card.controllerActions || []).map((a, aIdx) => this.renderControllerActionRow(card.id, a, aIdx)).join("")}
                    </div>
                </div>`;
        return `
            <div class="workbench-panel-title">
                <span>效果栈</span>
                <span class="badge">${isGpuCParticle ? "C粒子" : "单粒子"}</span>
            </div>
            <div class="effect-stack-content">
                <div class="subgroup" data-section-key="single_particle_init">
                    <div class="subgroup-title">粒子初始化</div>
                    <div class="list-tools">
                        <button class="btn small primary" data-act="add-pinit" data-card-id="${card.id}">添加初始化</button>
                    </div>
                    <div class="kv-list">
                        ${this.renderParticleInitRows(card)}
                    </div>
                </div>
                ${controllerBlock}
            </div>
        `;
    }

    renderSingleInspectorPanel(card) {
        const effectOptions = this.getEffectOptionsHtml(card.singleEffectClass);
        return `
            <section class="card-editor-panel node-inspector-panel">
                <div class="card-editor-panel-title">
                    <span>粒子属性</span>
                    <span class="badge">${isCompositionCardUsingCParticle(card) ? "C粒子" : "单粒子"}</span>
                </div>
                <div class="node-inspector-body">
                    <div class="inspector-fields">
                        <label class="field">
                            <span>效果类型</span>
                            <select class="input" data-card-id="${card.id}" data-card-field="singleEffectClass">${effectOptions}</select>
                        </label>
                        <label class="field">
                            <span>贴图预览</span>
                            <span class="chk"><input type="checkbox" data-card-id="${card.id}" data-card-field="singleUseTexture" ${card.singleUseTexture === false ? "" : "checked"}/>使用贴图</span>
                        </label>
                    </div>
                    ${this.renderSingleGpuSettings(card)}
                </div>
            </section>
        `;
    }

    renderShapeStackPanel(card) {
        const showRootGrowth = card.dataType === "sequenced_shape"
            && (!Array.isArray(card.viewPath) || card.viewPath.length === 0);
        return `
            <div class="workbench-panel-title">
                <span>Composition 栈</span>
                <span class="badge">${card.dataType === "sequenced_shape" ? "序列形状" : "形状"}</span>
            </div>
            ${this.renderShapeTreePanel(card)}
            ${showRootGrowth
                ? `<div class="effect-stack-content">${this.renderCardAnimates(card.id, "growthAnimates", card.growthAnimates, "生长动画", "add-growth-animate", "remove-growth-animate", { sectionKey: "growth" })}</div>`
                : ""}
        `;
    }

    inferSectionKeyFromTitle(title, fallback = "base") {
        const text = String(title || "").trim();
        if (!text) return fallback;
        if (text === "基础") return "base";
        if (text === "点位来源" || text === "PointsBuilder 来源") return "source";
        if (text === "Point" || text === "PointsBuilder") return "source";
        if (text === "单粒子：粒子初始化") return "single_particle_init";
        if (text === "单粒子：控制器初始化") return "single_controller_init";
        if (text === "轴向" || text === "形状轴向") return "shape_axis";
        if (text === "显示行为" || text === "形状显示行为") return "shape_display";
        if (text === "Single: Particle Init") return "single_particle_init";
        if (text === "Single: Controller Init") return "single_controller_init";
        if (text === "Shape 点设置") return "shape_base";
        if (text === "子点类型参数") return "shape_child_params";
        if (text === "形状 Axis") return "shape_axis";
        if (text === "形状 Display 行为") return "shape_display";
        if (text.includes("缩放助手")) return "shape_scale";
        if (text.includes("生长动画")) return "growth";
        return fallback;
    }

    decorateCardSubgroups() {
        const cards = Array.from(this.dom.cardsRoot?.querySelectorAll?.(".card[data-card-id]") || []);
        for (const cardEl of cards) {
            const cardId = String(cardEl.dataset.cardId || "");
            const card = this.getCardById(cardId);
            if (!card) continue;
            card.sectionCollapse = normalizeCardSectionCollapse(card.sectionCollapse);
            const groups = cardEl.querySelectorAll(".card-body > .subgroup, .node-inspector-body > .subgroup, .layer-settings-panel > .subgroup, .effect-stack-content > .subgroup");
            let idx = 0;
            for (const group of groups) {
                group.dataset.cardId = cardId;
                let titleEl = group.querySelector(":scope > .subgroup-title");
                if (!titleEl) {
                    titleEl = Array.from(group.children).find((n) => n?.classList?.contains("subgroup-title")) || null;
                }
                if (!titleEl) continue;
                const fallback = CARD_SECTION_KEYS[Math.min(idx, CARD_SECTION_KEYS.length - 1)] || "base";
                let sectionKey = String(group.dataset.sectionKey || "").trim();
                if (!CARD_SECTION_KEYS.includes(sectionKey)) {
                    sectionKey = this.inferSectionKeyFromTitle(titleEl.textContent, fallback);
                }
                if (!CARD_SECTION_KEYS.includes(sectionKey)) sectionKey = fallback;
                group.dataset.sectionKey = sectionKey;
                const collapsed = this.isCardSectionCollapsed(card, sectionKey);
                group.classList.toggle("collapsed", collapsed);

                const bodyNodes = Array.from(group.children).filter((n) => n !== titleEl);
                const head = document.createElement("div");
                head.className = "subgroup-head";
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "iconbtn subgroup-toggle";
                toggle.dataset.act = "toggle-section-fold";
                toggle.dataset.cardId = cardId;
                toggle.dataset.sectionKey = sectionKey;
                toggle.textContent = collapsed ? "▸" : "▾";
                toggle.title = collapsed ? "展开" : "折叠";
                const titleWrap = document.createElement("div");
                titleWrap.className = "subgroup-title";
                titleWrap.textContent = String(titleEl.textContent || "");
                head.appendChild(toggle);
                head.appendChild(titleWrap);

                const body = document.createElement("div");
                body.className = "subgroup-body";
                for (const node of bodyNodes) body.appendChild(node);

                group.innerHTML = "";
                group.appendChild(head);
                group.appendChild(body);
                idx += 1;
            }
        }
    }

    renderCardHtml(card, idx) {
        const selected = this.selectedCardIds.has(card.id);
        const isGpuCParticle = isCompositionCardUsingCParticle(card);
        const fold = card.folded ? "▸" : "▾";
        const builderStats = this.evaluateBuilderPoints(card.builderState);
        const builderNodeCount = this.countBuilderNodes(card.builderState?.root?.children || []);
        const builderPointCount = (builderStats.points || []).length;
        const effectOptions = isCompositionLeafParticleType(card.dataType) ? this.getEffectOptionsHtml(card.singleEffectClass) : "";

        return `
            <section class="card ${selected ? "selected" : ""} ${card.folded ? "folded" : ""}" data-card-id="${card.id}">
                <header class="card-head" data-card-id="${card.id}">
                    <div class="card-head-left">
                        <button class="iconbtn" data-act="toggle-fold" data-card-id="${card.id}" title="折叠">${fold}</button>
                        <input
                            class="input card-name-input"
                            data-card-id="${card.id}"
                            data-card-field="name"
                            value="${esc(card.name || `\u5361\u7247 ${idx + 1}`)}"
                            placeholder="\u5361\u7247\u5907\u6ce8 / \u540d\u79f0"
                            title="\u53ef\u7f16\u8f91\u5361\u7247\u5907\u6ce8\u540d\u79f0"
                        />
                    </div>
                    <div class="card-head-actions">
                        <button class="btn small" data-act="collapse-all-sections" data-card-id="${card.id}" title="折叠全部分区">折叠所有</button>
                        <button class="btn small" data-act="expand-all-sections" data-card-id="${card.id}" title="展开全部分区">展开所有</button>
                        <button class="iconbtn" data-act="move-card-up" data-card-id="${card.id}" title="上移">↑</button>
                        <button class="iconbtn" data-act="move-card-down" data-card-id="${card.id}" title="下移">↓</button>
                        <button class="iconbtn" data-act="duplicate-card" data-card-id="${card.id}" title="复制">⧉</button>
                        <button class="iconbtn" data-act="delete-card" data-card-id="${card.id}" title="删除">🗑</button>
                    </div>
                </header>
                ${card.folded ? "" : `
                    <div class="card-body ${isCompositionLeafParticleType(card.dataType) ? "" : "card-body--shape"}">
                        <div class="subgroup" data-section-key="base">
                            <div class="subgroup-title">基础</div>
                            <div class="grid2">
                                <label class="field">
                                    <span>绑定方式</span>
                                    <select class="input" data-card-id="${card.id}" data-card-field="bindMode">
                                        <option value="builder" ${card.bindMode === "builder" ? "selected" : ""}>PointsBuilder</option>
                                        <option value="point" ${card.bindMode === "point" ? "selected" : ""}>手动点位</option>
                                    </select>
                                </label>
                                <label class="field">
                                    <span>点类型</span>
                                    <select class="input" data-card-id="${card.id}" data-card-field="dataType">
                                        ${this.getCardTypeOptionsHtml(card)}
                                    </select>
                                </label>
                                ${isCompositionLeafParticleType(card.dataType) ? `<label class="field">
                                    <span>效果类型</span>
                                    <select class="input" data-card-id="${card.id}" data-card-field="singleEffectClass">${effectOptions}</select>
                                </label>
                                <label class="field">
                                    <span>贴图预览</span>
                                    <span class="chk"><input type="checkbox" data-card-id="${card.id}" data-card-field="singleUseTexture" ${card.singleUseTexture === false ? "" : "checked"}/>使用贴图</span>
                                </label>
                                ` : ""}
                            </div>
                        </div>

                        ${card.bindMode === "point" ? `
                            <div class="subgroup" data-section-key="source">
                                <div class="subgroup-title">点位来源</div>
                                <div class="grid3">
                                    <label class="field"><span>X</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="x" value="${esc(String(card.point.x))}"/></label>
                                    <label class="field"><span>Y</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="y" value="${esc(String(card.point.y))}"/></label>
                                    <label class="field"><span>Z</span><input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${card.id}" data-card-point-field="z" value="${esc(String(card.point.z))}"/></label>
                                </div>
                            </div>
                        ` : `
                            <div class="subgroup" data-section-key="source">
                                <div class="subgroup-title">PointsBuilder</div>
                                <div class="kv-list">
                                    <div class="kv-row display-row">
                                        <div class="builder-actions">
                                            <button class="btn small primary" data-act="open-builder-editor" data-card-id="${card.id}">编辑 Builder</button>
                                            <button class="btn small" data-act="import-builder-json" data-card-id="${card.id}">导入 JSON</button>
                                            <button class="btn small" data-act="export-builder-json" data-card-id="${card.id}">导出 JSON</button>
                                            <button class="btn small" data-act="clear-builder" data-card-id="${card.id}">清空</button>
                                        </div>
                                    </div>
                                    <div class="kv-row display-row">
                                        <div class="builder-meta">节点 ${builderNodeCount} / 预览点 ${builderPointCount}</div>
                                    </div>
                                </div>
                            </div>
                        `}

                        ${isCompositionLeafParticleType(card.dataType) ? `
                            <div class="subgroup" data-section-key="single_particle_init">
                                <div class="subgroup-title">单粒子：粒子初始化</div>
                                <div class="list-tools">
                                    <button class="btn small primary" data-act="add-pinit" data-card-id="${card.id}">添加初始化</button>
                                </div>
                                <div class="kv-list">
                                    ${this.renderParticleInitRows(card)}
                                </div>
                            </div>

                            ${isGpuCParticle
                                ? `<div class="mini-note">CParticle 不支持 preTick action；透明度、颜色和大小曲线由 GPU 生命周期数据处理。</div>`
                                : `<div class="subgroup" data-section-key="single_controller_init">
                                    <div class="subgroup-title">单粒子：控制器初始化</div>
                                    <div class="list-tools">
                                        <button class="btn small primary" data-act="add-cvar" data-card-id="${card.id}">添加局部变量</button>
                                        <button class="btn small primary" data-act="add-caction" data-card-id="${card.id}">添加每帧动作</button>
                                    </div>
                                    <div class="kv-list">
                                        ${card.controllerVars.map((it, cIdx) => `
                                            <div class="kv-row grid-var">
                                                <input class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="name" value="${esc(it.name)}" placeholder="name"/>
                                                <select class="input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="type">
                                                    ${CONTROLLER_VAR_TYPES.map((tp) => `<option value="${esc(tp)}" ${it.type === tp ? "selected" : ""}>${esc(tp)}</option>`).join("")}
                                                </select>
                                                <input class="input expr-input" data-card-id="${card.id}" data-cvar-idx="${cIdx}" data-cvar-field="expr" value="${esc(it.expr)}" placeholder="初始值"/>
                                                <div></div><div></div>
                                                <button class="btn small" data-act="remove-cvar" data-card-id="${card.id}" data-idx="${cIdx}">删除</button>
                                            </div>
                                        `).join("")}
                                    </div>
                                    <div class="kv-list">
                                        ${(card.controllerActions || []).map((a, aIdx) => this.renderControllerActionRow(card.id, a, aIdx)).join("")}
                                    </div>
                                </div>`}
                        ` : `
                            ${this.renderShapeChildParamsSection(card)}
                        `}

                        ${card.dataType === "sequenced_shape"
                            ? this.renderCardAnimates(card.id, "growthAnimates", card.growthAnimates, "生长动画", "add-growth-animate", "remove-growth-animate", { sectionKey: "growth" })
                            : ""}
                    </div>
                `}
            </section>
        `;
    }

    renderShapeChildParamsSection(card) {
        if (!card) return "";
        return `
            <div class="subgroup subgroup-tight shape-workbench-shell" data-section-key="shape_child_params">
                <div class="subgroup-title">形状编辑</div>
                <div class="shape-workbench">
                    ${this.renderShapeTreePanel(card)}
                    ${this.renderShapeInspectorPanel(card)}
                </div>
            </div>
        `;
    }

    renderShapeTreePanel(card) {
        const viewPath = Array.isArray(card?.viewPath) ? card.viewPath : [];
        const breadcrumb = this._renderTreeBreadcrumb(card, viewPath);
        let body = "";
        if (viewPath.length === 0) {
            body = this._renderTreeRootChildrenList(card);
        } else {
            const node = this.getShapeNodeByPath(card, viewPath);
            if (!node) {
                body = `<div class="mini-note">节点不存在，请返回上级</div>`;
            } else if (isCompositionLeafParticleType(node.type || "single")) {
                const leafName = this.getShapeNodeTypeLabel(card, node);
                body = `<div class="mini-note">当前节点是${leafName}叶节点。切换为 Shape 后可继续添加子节点。</div>`;
            } else {
                body = this._renderTreeNodeChildrenList(card, node, viewPath, card.id);
            }
        }
        return `
            <section class="card-editor-panel shape-tree-panel">
                <div class="card-editor-panel-title">形状树</div>
                ${breadcrumb}
                <div class="shape-tree-content">${body}</div>
            </section>
        `;
    }

    renderShapeInspectorPanel(card) {
        const viewPath = Array.isArray(card?.viewPath) ? card.viewPath : [];
        let title = "根属性";
        let badge = "Root";
        let body = "";
        if (viewPath.length === 0) {
            body = this._renderTreeRootView(card, { includeChildren: false });
        } else {
            const node = this.getShapeNodeByPath(card, viewPath);
            if (!node) {
                title = "节点属性";
                badge = "Missing";
                body = `<div class="mini-note">节点不存在，请返回上级</div>`;
            } else {
                title = node.name ? `${node.name} 属性` : `子节点 ${viewPath[viewPath.length - 1] + 1} 属性`;
                badge = this.getShapeNodeTypeLabel(card, node);
                body = this.renderTreeNodeEditor(card, node, viewPath, { includeChildren: false });
            }
        }
        return `
            <section class="card-editor-panel node-inspector-panel">
                <div class="card-editor-panel-title">
                    <span>${esc(title)}</span>
                    <span class="badge">${esc(badge)}</span>
                </div>
                <div class="node-inspector-body">${body}</div>
            </section>
        `;
    }

    _renderTreeRootView(card, opts = {}) {
        const cardId = card.id;
        const cparticleBlock = this.renderCParticleNodeSettings(card, { cardId });
        const axisBlock = `
            <div class="subgroup" data-section-key="shape_axis">
                <div class="subgroup-title">轴向</div>
                <div class="grid2">
                    <label class="field">
                        <span>轴向预设</span>
                        <select class="input expr-input" data-card-id="${cardId}" data-card-shape-axis-field="axisPreset">${this.getRelativeTargetPresetOptionsHtml(card.shapeAxisPreset || card.shapeAxisExpr)}</select>
                    </label>
                    <label class="field">
                        <span>轴向输入</span>
                        <input class="input expr-input" data-card-id="${cardId}" data-card-shape-axis-field="axisExpr" value="${esc(card.shapeAxisExpr || "")}" placeholder="axis 表达式"/>
                    </label>
                </div>
                <div class="grid5 vector-inputs">
                    <select class="input vector-ctor" data-card-id="${cardId}" data-card-shape-axis-field="axisManualCtor">
                        ${["Vec3", "RelativeLocation", "Vector3f"].map((it) => `<option value="${it}" ${card.shapeAxisManualCtor === it ? "selected" : ""}>${it}</option>`).join("")}
                    </select>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${cardId}" data-card-shape-axis-field="axisManualX" value="${esc(formatNumberCompact(card.shapeAxisManualX))}" placeholder="x"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${cardId}" data-card-shape-axis-field="axisManualY" value="${esc(formatNumberCompact(card.shapeAxisManualY))}" placeholder="y"/>
                    <input class="input" type="number" step="${this.state.settings.paramStep}" data-card-id="${cardId}" data-card-shape-axis-field="axisManualZ" value="${esc(formatNumberCompact(card.shapeAxisManualZ))}" placeholder="z"/>
                    <button class="btn small primary" data-act="apply-shape-axis-manual" data-card-id="${cardId}">套用手动输入</button>
                </div>
            </div>`;
        const displayBlock = `
            <div class="subgroup" data-section-key="shape_display">
                <div class="subgroup-title">显示行为</div>
                <div class="list-tools">
                    <button class="btn small primary" data-act="add-shape-display-action" data-card-id="${cardId}">添加显示动作</button>
                </div>
                <div class="kv-list">
                    ${(card.shapeDisplayActions || []).map((a, aIdx) => this.renderShapeDisplayActionRow(cardId, a, aIdx)).join("")}
                </div>
                ${this.renderAngleOffsetControl({ scope: "card", cardId, value: card })}
            </div>`;
        const scaleBlock = this.renderScaleHelperEditor({
            scope: "card", cardId, scale: card.shapeScale,
            helperName: "缩放助手", sectionKey: "shape_scale"
        });
        const childrenList = opts.includeChildren === false ? "" : this._renderTreeRootChildrenList(card);
        return `${cparticleBlock}${axisBlock}${displayBlock}${scaleBlock}${childrenList}`;
    }

    _renderTreeBreadcrumb(card, viewPath) {
        if (!viewPath || viewPath.length === 0) {
            return `<div class="tree-breadcrumb"><span class="crumb active">根</span></div>`;
        }
        const crumbs = [`<button class="crumb clickable" data-act="shape-tree-navigate-breadcrumb" data-card-id="${card.id}" data-depth="-1">根</button>`];
        let currentNodes = card.shapeChildren || [];
        for (let i = 0; i < viewPath.length; i++) {
            const idx = viewPath[i];
            const node = currentNodes[idx];
            if (!node) break;
            const name = node.name || `子节点 ${idx + 1}`;
            if (i === viewPath.length - 1) {
                crumbs.push(`<span class="crumb active">${esc(name)}</span>`);
            } else {
                crumbs.push(`<button class="crumb clickable" data-act="shape-tree-navigate-breadcrumb" data-card-id="${card.id}" data-depth="${i}">${esc(name)}</button>`);
            }
            currentNodes = node.children || [];
        }
        return `<div class="tree-breadcrumb">${crumbs.join(' <span class="crumb-sep">&gt;</span> ')}</div>`;
    }

    getShapeNodeTypeLabel(card, node) {
        const type = String(node?.type || "single");
        if (type === "particle_shape") return "形状";
        if (type === "sequenced_shape") return "序列形状";
        return card?.useCParticle === true || type === "cparticle" ? "C粒子" : "单粒子";
    }

    _renderTreeRootChildrenList(card) {
        const children = card.shapeChildren || [];
        const cardId = card.id;
        const rows = children.map((child, idx) => {
            const typeName = this.getShapeNodeTypeLabel(card, child);
            return `
                <div class="child-row" data-card-id="${cardId}">
                    <div class="child-row-main">
                        <span class="child-name">${esc(child.name || `子节点 ${idx + 1}`)}</span>
                        <span class="child-type badge">${typeName}</span>
                    </div>
                    <div class="child-row-actions">
                        <button class="btn small primary child-action child-enter" data-act="shape-tree-drill-into" data-card-id="${cardId}" data-child-idx="${idx}" title="进入子节点">进入</button>
                        <button class="btn small child-action child-preset" data-act="open-node-preset" data-card-id="${cardId}" data-tree-path="${esc(JSON.stringify([idx]))}">预设</button>
                        <button class="iconbtn child-action" data-act="shape-tree-move-child-up" data-card-id="${cardId}" data-tree-path="[]" data-child-idx="${idx}" title="上移" aria-label="上移">↑</button>
                        <button class="iconbtn child-action" data-act="shape-tree-move-child-down" data-card-id="${cardId}" data-tree-path="[]" data-child-idx="${idx}" title="下移" aria-label="下移">↓</button>
                        <button class="iconbtn child-action child-action-danger" data-act="shape-tree-remove-child" data-card-id="${cardId}" data-tree-path="[]" data-child-idx="${idx}" title="删除" aria-label="删除">×</button>
                    </div>
                </div>`;
        }).join("");
        return `
            <div class="children-list">
                ${rows || '<div class="mini-note">暂无子节点，请添加并列子节点</div>'}
            </div>
            <div class="list-tools">
                <button class="btn small primary" data-act="shape-tree-add-parallel" data-card-id="${cardId}" data-tree-path="[]">添加并列子节点</button>
            </div>`;
    }

    renderControllerActionRow(cardId, action, idx, opts = {}) {
        const item = normalizeControllerAction(action);
        const typeOptions = CONTROLLER_ACTION_TYPES
            .map((it) => `<option value="${esc(it.id)}" ${item.type === it.id ? "selected" : ""}>${esc(it.title)}</option>`)
            .join("");
        const hasShapeLevel = Number.isFinite(Number(opts?.shapeLevelIdx));
        const shapeLevelIdx = hasShapeLevel ? Math.max(0, int(opts.shapeLevelIdx)) : 0;
        const shapeLevelAttr = hasShapeLevel ? ` data-shape-level-idx="${shapeLevelIdx}"` : "";
        return `
            <div class="kv-row display-row">
                <div class="grid2">
                    <select class="input" data-card-id="${esc(cardId)}"${shapeLevelAttr} data-cact-idx="${idx}" data-cact-field="type">${typeOptions}</select>
                    <div class="preview-actions"><button class="btn small" data-act="remove-caction" data-card-id="${esc(cardId)}" data-idx="${idx}">删除</button></div>
                </div>
                <textarea class="input script-area expr-input" data-code-editor="js" data-code-title="每帧动作 (JS)" data-card-id="${esc(cardId)}"${shapeLevelAttr} data-cact-idx="${idx}" data-cact-field="script" placeholder="if (...) { ... }&#10;addSingle() / addMultiple(2)">${esc(item.script || "")}</textarea>
            </div>
        `;
    }

    renderCardAnimates(cardId, key, list, label, addAct, removeAct, opts = {}) {
        const sectionKeyAttr = opts.sectionKey ? ` data-section-key="${esc(String(opts.sectionKey))}"` : "";
        const embedOnly = !!opts.embedOnly;
        const rows = (list || []).map((a, idx) => `
            <div class="kv-row grid-animate">
                <input class="input" type="number" min="1" step="1" data-card-id="${cardId}" data-card-animate-type="${key}" data-card-animate-idx="${idx}" data-card-animate-field="count" value="${esc(String(a.count))}"/>
                <input class="input expr-input" data-card-id="${cardId}" data-card-animate-type="${key}" data-card-animate-idx="${idx}" data-card-animate-field="condition" value="${esc(a.condition)}" placeholder="条件表达式"/>
                <button class="btn small" data-act="${removeAct}" data-card-id="${cardId}" data-idx="${idx}">删除</button>
            </div>
        `).join("");
        const body = `
            <div class="list-tools"><button class="btn small primary" data-act="${addAct}" data-card-id="${cardId}">添加</button></div>
            <div class="kv-list">${rows}</div>
        `;
        if (embedOnly) {
            return `
                <div class="mini-note">${esc(label)}</div>
                ${body}
            `;
        }
        return `
            <div class="subgroup"${sectionKeyAttr}>
                <div class="subgroup-title">${esc(label)}</div>
                ${body}
            </div>
        `;
    }

    getEffectOptionsHtml(selected) {
        const dynamicNames = getParticleEffectNames();
        const opts = Array.from(new Set([...EFFECT_CLASS_OPTIONS, ...dynamicNames, String(selected || "").trim()].filter(Boolean)));
        return opts.map((it) => {
            const pData = getParticleDataByName(it);
            const label = pData && pData.displayName ? `${it} (${pData.displayName})` : it;
            return `<option value="${esc(it)}" ${it === selected ? "selected" : ""}>${esc(label)}</option>`;
        }).join("");
    }

    rebuildPreview() {
        this.previewCycleCache = null;
        this.previewExprCountCache.clear();
        this.previewExprPrefixCache.clear();
        this.previewCondFnCache.clear();
        this.previewNumericFnCache.clear();
        this.previewControllerFnCache.clear();
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        const points = [];
        const owners = [];
        const referenceOwners = [];
        const birthOffsets = [];
        const ownerLocalIndex = [];
        const ownerPointCount = [];
        const anchorBases = [];
        const localBases = [];
        const anchorRefs = [];
        const localRefs = [];
        const levelBases = [];
        const levelRefs = [];
        const useLocalOpsList = [];
        const appendFlatPoints = (cardId, pointList) => {
            const src = Array.isArray(pointList) ? pointList : [];
            const len = Math.max(1, src.length);
            for (let idx = 0; idx < src.length; idx++) {
                const p = src[idx];
                const v = U.v(num(p?.x), num(p?.y), num(p?.z));
                points.push(v);
                owners.push(cardId);
                referenceOwners.push(cardId);
                birthOffsets.push(0);
                ownerLocalIndex.push(idx);
                ownerPointCount.push(len);
                anchorBases.push(v);
                localBases.push(U.v(0, 0, 0));
                anchorRefs.push(idx);
                localRefs.push(0);
                levelBases.push([]);
                levelRefs.push([]);
                useLocalOpsList.push(false);
            }
        };
        const appendShapePoints = (cardId, anchors, locals) => {
            const anchorList = Array.isArray(anchors) ? anchors : [];
            const localList = Array.isArray(locals) ? locals : [];
            if (!anchorList.length || !localList.length) return;
            const ownerTotal = anchorList.length * localList.length;
            let ownerIdx = 0;
            for (let ai = 0; ai < anchorList.length; ai++) {
                const a = U.v(num(anchorList[ai]?.x), num(anchorList[ai]?.y), num(anchorList[ai]?.z));
                for (let li = 0; li < localList.length; li++) {
                    const tuple = localList[li] || {};
                    const tupleSum = tuple.sum || tuple.local || tuple;
                    const l = U.v(num(tupleSum?.x), num(tupleSum?.y), num(tupleSum?.z));
                    const tupleLevels = Array.isArray(tuple.levels) ? tuple.levels : [];
                    points.push(U.v(a.x + l.x, a.y + l.y, a.z + l.z));
                    owners.push(cardId);
                    referenceOwners.push(compositionReferenceNodeId(cardId, Array.isArray(tuple.path) ? tuple.path : []));
                    birthOffsets.push(0);
                    ownerLocalIndex.push(ownerIdx++);
                    ownerPointCount.push(ownerTotal);
                    anchorBases.push(a);
                    localBases.push(l);
                    anchorRefs.push(ai);
                    localRefs.push(li);
                    levelBases.push(tupleLevels.map((it) => U.v(num(it?.vec?.x), num(it?.vec?.y), num(it?.vec?.z))));
                    levelRefs.push(tupleLevels.map((it) => int(it?.ref || 0)));
                    useLocalOpsList.push(true);
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
                    appendShapePoints(card.id, basePoints, locals);
                }
                continue;
            }

            if (basePoints.length) {
                appendFlatPoints(card.id, basePoints);
            }
        }
        this.previewBasePoints = points.map((p) => U.clone(p));
        this.previewPoints = points.map((p) => U.clone(p));
        this.previewOwners = owners;
        this.previewReferenceOwners = referenceOwners;
        this.previewBirthOffsets = birthOffsets;
        this.previewOwnerLocalIndex = ownerLocalIndex;
        this.previewOwnerPointCount = ownerPointCount;
        this.previewAnchorBase = anchorBases;
        this.previewLocalBase = localBases;
        this.previewAnchorRef = anchorRefs;
        this.previewLocalRef = localRefs;
        this.previewLevelBases = levelBases;
        this.previewLevelRefs = levelRefs;
        this.previewUseLocalOps = useLocalOpsList;
        if (!this.previewPaused) {
            this.previewAnimStart = performance.now();
        }
        this.updatePreviewGeometry(points, owners);
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
        const positions = this.pointsGeom.getAttribute("position").array;
        const colors = this.pointsGeom.getAttribute("color").array;
        const sizes = this.pointsGeom.getAttribute("aSize").array;
        const alphas = this.pointsGeom.getAttribute("aAlpha").array;
        this.previewVisibleMask = new Array(count).fill(true);
        this.previewSizeFactors = new Array(count).fill(1);
        this.previewAlphaFactors = new Array(count).fill(1);
        const visualCache = new Map();
        const linearColorCache = new Map();
        for (let i = 0; i < count; i++) {
            const p = points[i];
            positions[i * 3 + 0] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const owner = owners[i];
            let visual = visualCache.get(owner);
            if (!visual) {
                visual = this.resolveCardPreviewVisual(owner);
                visualCache.set(owner, visual);
            }
            let rgb = linearColorCache.get(owner);
            if (!rgb) {
                rgb = srgbRgbToLinearArray(visual.color);
                linearColorCache.set(owner, rgb);
            }
            colors[i * 3 + 0] = rgb[0];
            colors[i * 3 + 1] = rgb[1];
            colors[i * 3 + 2] = rgb[2];
            sizes[i] = Math.max(0.05, num(visual.size));
            alphas[i] = clamp(num(visual.alpha), 0, 1);
            this.previewSizeFactors[i] = Math.max(0.05, num(visual.size));
            this.previewAlphaFactors[i] = clamp(num(visual.alpha), 0, 1);
        }
        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        this.pointsGeom.computeBoundingSphere();
        if (this.pointsMat) this.pointsMat.size = this.state.settings.pointSize;
        const statusText = `点数: ${count}/${this.previewBasePoints.length || count}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
        this.updateSelectionStatus();
    }

    updatePreviewAnimation() {
        if (!this.pointsGeom || !this.previewBasePoints.length) return;
        const now = performance.now();
        const totalCount = this.previewBasePoints.length;
        const minInterval = totalCount >= 50000 ? 16 : 0;
        if (minInterval > 0 && (now - this.previewPerfLastTs) < minInterval) return;
        this.previewPerfLastTs = now;
        const elapsedTick = (now - this.previewAnimStart) / 50;
        const cycleCfg = this.previewCycleCache || (this.previewCycleCache = this.getPreviewCycleConfig());
        const cycleAppear = cycleCfg.appear;
        const cycleLive = cycleCfg.live;
        const cycleFade = cycleCfg.fade;
        const cycleTotal = cycleCfg.total;
        const globalCycleAge = ((elapsedTick % cycleTotal) + cycleTotal) % cycleTotal;
        const positions = this.pointsGeom.getAttribute("position")?.array;
        const colors = this.pointsGeom.getAttribute("color")?.array;
        const sizes = this.pointsGeom.getAttribute("aSize")?.array;
        const alphas = this.pointsGeom.getAttribute("aAlpha")?.array;
        if (!positions || !colors || !sizes || !alphas) return;
        const skipExprPerPoint = totalCount >= 50000;
        const runtimeActions = this.buildPreviewRuntimeActions(elapsedTick, this.state.displayActions || [], {
            skipExpression: skipExprPerPoint,
            scope: "display"
        });
        const globalAxis = this.resolveCompositionAxisDirection();
        const tickStep = Math.max(0, Math.floor(elapsedTick));
        if (!this.previewRuntimeGlobals || tickStep < this.previewRuntimeAppliedTick) {
            this.previewRuntimeGlobals = this.buildPreviewRuntimeGlobals(0, 0, 0);
            this.previewRuntimeAppliedTick = -1;
        }
        const frameRuntimeGlobals = this.previewRuntimeGlobals;
        for (let t = this.previewRuntimeAppliedTick + 1; t <= tickStep; t++) {
            this.applyExpressionGlobalsOnce(runtimeActions, t, t, frameRuntimeGlobals, globalAxis);
        }
        if (tickStep > this.previewRuntimeAppliedTick) this.previewRuntimeAppliedTick = tickStep;
        this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, globalCycleAge, globalCycleAge);
        const ownerCache = new Map();
        const anchorCache = new Map();
        const localCache = new Map();
        const ownerVisualCache = new Map();
        const ownerVisualAgeDependentCache = new Map();

        let visible = 0;
        for (let i = 0; i < this.previewBasePoints.length; i++) {
            const base = this.previewBasePoints[i];
            const owner = this.previewOwners[i];
            const localIndex = int(this.previewOwnerLocalIndex[i] || 0);
            const ownerCount = int(this.previewOwnerPointCount[i] || 1);
            const anchorBase = this.previewAnchorBase[i] || base;
            const localBase = this.previewLocalBase[i] || U.v(0, 0, 0);
            const anchorRef = int(this.previewAnchorRef[i] || 0);
            const localRef = int(this.previewLocalRef[i] || 0);
            const useLocalOps = !!this.previewUseLocalOps[i];
            const birthOffset = num(this.previewBirthOffsets[i] || 0);
            const birthKey = int(birthOffset * 1000);
            let byBirth = ownerCache.get(owner);
            if (!byBirth) {
                byBirth = new Map();
                ownerCache.set(owner, byBirth);
            }
            let cached = byBirth.get(birthKey);
            if (!cached) {
                const ageBase = ((elapsedTick - birthOffset) % cycleTotal + cycleTotal) % cycleTotal;
                // 消散计时保持为周期内 tick，避免第二轮淡出直接跳到最小缩放。
                let age = this.resolvePreviewAgeWithStatus(ageBase, globalCycleAge, cycleCfg, frameRuntimeGlobals);
                const card = this.getCardById(owner);
                let shapeRuntimeLevels = [];
                if (card) {
                    if (card.dataType !== "single") {
                        shapeRuntimeLevels = this.getShapeRuntimeLevelsForPreview(card, elapsedTick, skipExprPerPoint);
                        for (const lv of shapeRuntimeLevels) {
                            this.applyExpressionGlobalsOnce(lv.actions, elapsedTick, age, frameRuntimeGlobals, lv.axis || globalAxis);
                        }
                    }
                }
                let ageDependent = ownerVisualAgeDependentCache.get(owner);
                if (ageDependent === undefined) {
                    ageDependent = this.isCardVisualAgeDependent(card);
                    ownerVisualAgeDependentCache.set(owner, ageDependent);
                }
                let visual = ageDependent ? null : ownerVisualCache.get(owner);
                if (!visual) {
                    visual = this.resolveCardPreviewVisual(owner, {
                        runtimeVars: frameRuntimeGlobals,
                        elapsedTick,
                        ageTick: age,
                        pointIndex: 0
                    });
                    if (!ageDependent) ownerVisualCache.set(owner, visual);
                }
                this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, globalCycleAge, globalCycleAge);
                age = this.resolvePreviewAgeWithStatus(ageBase, globalCycleAge, cycleCfg, frameRuntimeGlobals);
                const globalCycleAgeNow = this.resolvePreviewAgeWithStatus(globalCycleAge, globalCycleAge, cycleCfg, frameRuntimeGlobals);
                const visibleLimit = this.evaluateGrowthVisibleLimit(
                    owner,
                    ownerCount,
                    age,
                    globalCycleAgeNow,
                    elapsedTick,
                    runtimeActions,
                    shapeRuntimeLevels,
                    cycleCfg,
                    frameRuntimeGlobals
                );
                cached = {
                    ownerCount,
                    age,
                    shapeRuntimeLevels,
                    cardRuntimeHasExpression: shapeRuntimeLevels.some((lv) => !!lv.hasExpression),
                    cardHasShapeOps: !!(card && card.dataType !== "single"),
                    visibleLimit,
                    visual
                };
                byBirth.set(birthKey, cached);
            }

            const isVisible = localIndex < clamp(int(cached.visibleLimit), 0, Math.max(1, ownerCount));
            this.previewVisibleMask[i] = !!isVisible;
            if (isVisible) visible++;

            let ownerAnchorCache = anchorCache.get(owner);
            if (!ownerAnchorCache) {
                ownerAnchorCache = new Map();
                anchorCache.set(owner, ownerAnchorCache);
            }
            let anchorsByBirth = ownerAnchorCache.get(birthKey);
            if (!anchorsByBirth) {
                anchorsByBirth = [];
                ownerAnchorCache.set(birthKey, anchorsByBirth);
            }
            let anchor = anchorsByBirth[anchorRef];
            if (!anchor) {
                const globalScale = this.resolveScaleFactor(this.state.projectScale, cached.age, cycleCfg);
                anchor = this.applyScaleFactorToPoint(anchorBase, globalScale);
                anchor = this.applyRuntimeActionsToPoint(anchor, runtimeActions, elapsedTick, cached.age, anchorRef, globalAxis, {
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
                const localCacheable = !cached.cardRuntimeHasExpression;
                let ownerLocalCache = localCache.get(owner);
                if (!ownerLocalCache) {
                    ownerLocalCache = new Map();
                    localCache.set(owner, ownerLocalCache);
                }
                let localsByBirth = ownerLocalCache.get(birthKey);
                if (!localsByBirth) {
                    localsByBirth = [];
                    ownerLocalCache.set(birthKey, localsByBirth);
                }
                if (localCacheable) local = localsByBirth[localRef];
                if (!local) {
                    const levelBaseList = Array.isArray(this.previewLevelBases[i]) && this.previewLevelBases[i].length
                        ? this.previewLevelBases[i]
                        : [localBase];
                    const levelRefList = Array.isArray(this.previewLevelRefs[i]) && this.previewLevelRefs[i].length
                        ? this.previewLevelRefs[i]
                        : [localRef];
                    const runtimeLevels = Array.isArray(cached.shapeRuntimeLevels) ? cached.shapeRuntimeLevels : [];
                    let localSum = U.v(0, 0, 0);
                    const transformedLevelRels = [];
                    const transformedLevelOrders = [];
                    for (let lvIdx = 0; lvIdx < levelBaseList.length; lvIdx++) {
                        const lvBase = levelBaseList[lvIdx] || U.v(0, 0, 0);
                        const lvPointRef = int(levelRefList[lvIdx] ?? localRef);
                        const lvRuntime = runtimeLevels[lvIdx] || null;
                        let lvPoint = U.clone(lvBase);
                        if (lvRuntime) {
                            const cardScale = this.resolveScaleFactor(lvRuntime.scale, cached.age, cycleCfg);
                            lvPoint = this.applyScaleFactorToPoint(lvPoint, cardScale);
                            if (lvRuntime.actions && lvRuntime.actions.length) {
                                const shapeScope = {
                                    rel: anchorBase,
                                    order: int(localIndex),
                                    // shapeRelN 需要使用当前 shape 已转换的点集做索引
                                    shapeRels: transformedLevelRels,
                                    shapeOrders: transformedLevelOrders
                                };
                                lvPoint = this.applyRuntimeActionsToPoint(
                                    lvPoint,
                                    lvRuntime.actions,
                                    elapsedTick,
                                    cached.age,
                                    lvPointRef,
                                    lvRuntime.axis || globalAxis,
                                    {
                                        skipExpression: skipExprPerPoint,
                                        runtimeVars: frameRuntimeGlobals,
                                        persistExpressionVars: false,
                                        shapeScope
                                    }
                                );
                            }
                        }
                        transformedLevelRels[lvIdx] = lvPoint;
                        transformedLevelOrders[lvIdx] = lvPointRef;
                        localSum.x += num(lvPoint.x);
                        localSum.y += num(lvPoint.y);
                        localSum.z += num(lvPoint.z);
                    }
                    local = localSum;
                    if (localCacheable) localsByBirth[localRef] = local;
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
            } else {
                pRef.x = px;
                pRef.y = py;
                pRef.z = pz;
            }

            let rgb = cached.visual.__linearColor;
            if (!rgb) {
                rgb = srgbRgbToLinearArray(cached.visual.color);
                cached.visual.__linearColor = rgb;
            }
            const visibleFactor = isVisible ? 1 : 0;
            colors[i * 3 + 0] = rgb[0] * visibleFactor;
            colors[i * 3 + 1] = rgb[1] * visibleFactor;
            colors[i * 3 + 2] = rgb[2] * visibleFactor;
            sizes[i] = Math.max(0.05, num(cached.visual.size)) * (isVisible ? 1 : 0.01);
            alphas[i] = clamp(num(cached.visual.alpha), 0, 1) * (isVisible ? 1 : 0);
        }

        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        const statusText = `点数: ${visible}/${this.previewBasePoints.length}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
    }

    getPreviewCycleConfig() {
        let appear = 16;
        const play = Math.max(1, int(this.state.previewPlayTicks || 70));
        const fade = Math.max(0, int(this.state.disabledInterval || 0));
        const maxOwner = Math.max(1, ...this.previewOwnerPointCount.map((x) => Math.max(1, int(x || 1))));
        const maxCards = Math.max(1, this.state.cards.length);
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

    evaluateGrowthVisibleLimit(ownerCardId, ownerCount, ageTick, globalCycleAge, elapsedTick, globalRuntimeActions = [], shapeRuntimeLevels = [], cycleCfg = null, runtimeVars = null) {
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const sequencedRoot = this.state.compositionType === "sequenced";
        let growthAge = num(ageTick);
        const runtimeScope = (runtimeVars && typeof runtimeVars === "object")
            ? runtimeVars
            : ((this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                ? this.previewRuntimeGlobals
                : null);

        const totalCards = Math.max(1, this.state.cards.length);
        const cardIndexRaw = this.getCardIndexById(ownerCardId);
        const cardIndex = cardIndexRaw >= 0 ? cardIndexRaw : 0;
        let rootVisibleCards = Number.POSITIVE_INFINITY;
        let hasRootGrowthSource = false;

        if (sequencedRoot && this.state.compositionAnimates.length) {
            const n = this.computeAnimateVisibleCount(this.state.compositionAnimates, globalCycleAge, elapsedTick, 0, runtimeScope);
            rootVisibleCards = Math.min(rootVisibleCards, n);
            hasRootGrowthSource = true;
        }
            const rootExprCount = this.computeExpressionVisibleCount(globalRuntimeActions, totalCards, growthAge, {
                scopeLevel: -1,
                allowOrder: this.state.compositionType === "sequenced",
                sequencedDepths: []
            });
            if (Number.isFinite(rootExprCount)) {
                rootVisibleCards = Math.min(rootVisibleCards, rootExprCount);
                hasRootGrowthSource = true;
            }
        if (sequencedRoot && !hasRootGrowthSource) return 0;
        if (Number.isFinite(rootVisibleCards)) {
            const cardLimit = clamp(int(rootVisibleCards), 0, totalCards);
            if (cardIndex >= cardLimit) return 0;
        }

        const card = this.getCardById(ownerCardId);
        if (!card) return ownerCount;
        let visibleLimit = Math.max(1, ownerCount);
        let hasLocalGrowthSource = false;
        const runtimeLevels = Array.isArray(shapeRuntimeLevels) ? shapeRuntimeLevels : [];
        const sequencedLevels = runtimeLevels.filter((lv) => !!lv?.sequenced);

        if (sequencedLevels.length) {
            for (const lv of sequencedLevels) {
                let levelLimit = Math.max(1, ownerCount);
                let hasLevelGrowthSource = false;
                if (Array.isArray(lv.growthAnimates) && lv.growthAnimates.length) {
                    const n = this.computeAnimateVisibleCount(lv.growthAnimates, growthAge, elapsedTick, 0, runtimeScope);
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
                // Sequenced 形状未配置任何几何生长来源时，初始可见数量应为 0。
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

    computeExpressionVisibleCount(actionsOrScript, ownerCount, ageTick, opts = {}) {
        const steps = Math.max(0, Math.floor(num(ageTick)));
        const scopeLevel = Math.max(-1, int(opts.scopeLevel ?? -1));
        const allowOrder = opts.allowOrder === true;
        const sequencedDepths = new Set(
            Array.isArray(opts.sequencedDepths)
                ? opts.sequencedDepths.map((it) => int(it))
                : []
        );
        const expressionActions = [];
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
            for (const act of (Array.isArray(actionsOrScript) ? actionsOrScript : [])) {
                if (act?.type === "expression" && String(act.expression || "").trim()) expressionActions.push(act);
            }
            sourceSignature = expressionActions.map((act) => String(act.expression || "").trim()).join("\n--\n");
        }
        if (!expressionActions.length) return Number.POSITIVE_INFINITY;
        const growthApiRe = /\baddSingle\s*\(|\baddMultiple\s*\(/;
        const hasGrowthApi = expressionActions.some((act) => growthApiRe.test(String(act.expression || "")));
        if (!hasGrowthApi) return Number.POSITIVE_INFINITY;
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
            prefix = { counts: [0], actions: prepared };
            if (this.previewExprPrefixCache.size > 256) this.previewExprPrefixCache.clear();
            this.previewExprPrefixCache.set(prefixKey, prefix);
        }
        const counts = Array.isArray(prefix.counts) ? prefix.counts : [0];
        let visible = Number(counts[counts.length - 1]) || 0;
        const actions = Array.isArray(prefix.actions) ? prefix.actions : [];
        for (let t = counts.length; t <= steps && visible < safeOwnerCount; t++) {
            for (const fn of actions) {
                const thisAt = (this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                    ? this.previewRuntimeGlobals
                    : {};
                const baseVars = this.getExpressionVars(t, t, 0, { includeVectors: true });
                const baseProto = Object.getPrototypeOf(baseVars) || {};
                const vars = Object.assign({}, baseProto, baseVars);
                if (thisAt && typeof thisAt === "object") {
                    for (const [k, v] of Object.entries(thisAt)) vars[k] = v;
                }
                vars.rel = U.v(0, 0, 0);
                if (allowOrder) vars.order = 0;
                for (let d = 0; d < scopeLevel; d++) {
                    vars[`shapeRel${d}`] = U.v(0, 0, 0);
                    if (sequencedDepths.has(d)) vars[`shapeOrder${d}`] = 0;
                }
                vars.thisAt = thisAt;
                const noop = () => {};
                const addSingle = () => {
                    visible += 1;
                };
                const addMultiple = (n) => {
                    visible += Math.max(1, int(n || 1));
                };
                vars.rotateToPoint = noop;
                try {
                    fn(vars, U.v(0, 0, 0), noop, noop, noop, addSingle, addMultiple, thisAt);
                } catch {
                }
                if (visible >= safeOwnerCount) break;
            }
            counts[t] = clamp(visible, 0, safeOwnerCount);
        }
        prefix.counts = counts;
        const result = Number.isFinite(counts[steps]) ? counts[steps] : clamp(visible, 0, safeOwnerCount);
        return result;
    }

    resolveScaleFactor(rawScaleCfg, ageTick, cycleCfg = null) {
        const cfg = normalizeScaleHelperConfig(rawScaleCfg, { type: "none" });
        if (cfg.type === "none") return 1;
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const age = num(ageTick);
        const fadeStart = cycle.play;
        const inFade = age >= fadeStart;
        const fadeAge = Math.max(0, age - fadeStart);
        const tickMax = Math.max(1, int(cfg.tick || 1));
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
        const tick = clamp(num(tickRaw), 0, tickMax);
        if (cfg.type === "bezier") {
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

    buildShapeLocalTuplesForPreview(card) {
        if (!card || card.dataType === "single") return [];
        const children = card.shapeChildren || [];
        if (!children.length) return [];
        let allTuples = [];
        for (let childIndex = 0; childIndex < children.length; childIndex++) {
            const child = children[childIndex];
            const childTuples = this._buildTreeNodeTuplesForPreview(child, U.v(0, 0, 0), [], [childIndex]);
            allTuples = allTuples.concat(childTuples);
        }
        return allTuples;
    }

    _buildTreeNodeTuplesForPreview(node, parentSum, parentLevels, nodePath = []) {
        if (!node) return [];
        const src = this.resolveShapeSourcePoints(node.bindMode, node.point, node.builderState);
        if (!src.length) return [];
        const nodeType = node.type || "single";
        if (nodeType === "single") {
            return src.map((p, si) => {
                const sv = U.v(num(p?.x), num(p?.y), num(p?.z));
                const levels = parentLevels.map((lv) => ({
                    vec: U.v(num(lv?.vec?.x), num(lv?.vec?.y), num(lv?.vec?.z)),
                    ref: int(lv?.ref || 0),
                    path: Array.isArray(lv?.path) ? lv.path.slice() : []
                }));
                levels.push({ vec: U.clone(sv), ref: si, path: nodePath.slice() });
                return {
                    sum: U.v(num(parentSum?.x) + sv.x, num(parentSum?.y) + sv.y, num(parentSum?.z) + sv.z),
                    levels,
                    path: nodePath.slice()
                };
            });
        }
        const nodeChildren = node.children || [];
        if (!nodeChildren.length) return [];
        let allTuples = [];
        for (let si = 0; si < src.length; si++) {
            const p = src[si];
            const sv = U.v(num(p?.x), num(p?.y), num(p?.z));
            const newSum = U.v(num(parentSum?.x) + sv.x, num(parentSum?.y) + sv.y, num(parentSum?.z) + sv.z);
            const newLevels = parentLevels.map((lv) => ({
                vec: U.v(num(lv?.vec?.x), num(lv?.vec?.y), num(lv?.vec?.z)),
                ref: int(lv?.ref || 0),
                path: Array.isArray(lv?.path) ? lv.path.slice() : []
            }));
            newLevels.push({ vec: U.clone(sv), ref: si, path: nodePath.slice() });
            for (let childIndex = 0; childIndex < nodeChildren.length; childIndex++) {
                const child = nodeChildren[childIndex];
                const childTuples = this._buildTreeNodeTuplesForPreview(child, newSum, newLevels, nodePath.concat(childIndex));
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
        // 沿首个子节点路径计算层级深度。
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
            cardId: card.id
        });
        levels.push({
            scopeLevel: 0,
            ancestorSequencedDepths: rootScope.sequencedDepths,
            sequenced: card.dataType === "sequenced_shape",
            growthAnimates: card.dataType === "sequenced_shape" ? (card.growthAnimates || []) : [],
            axis: this.resolveRelativeDirection(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"),
            scale: normalizeScaleHelperConfig(card.shapeScale, { type: "none" }),
            actions: rootActions,
            hasExpression: !!rootActions.__hasExpression
        });
        // 按深度优先收集树层级，预览沿首个子节点路径解析。
        this._collectTreeNodeRuntimeLevels(card, card.shapeChildren || [], levels, 1, elapsedTick, skipExpression);
        return levels;
    }

    _collectTreeNodeRuntimeLevels(card, children, levels, depth, elapsedTick, skipExpression) {
        if (!children || !children.length) return;
        // 预览使用每层首个子节点确定 Composition 行为。
        const node = children[0];
        if (!node || isCompositionLeafParticleType(node.type || "single")) return;
        const scope = this.getShapeScopeInfoByRuntimeLevel(card, depth);
        const actions = this.buildPreviewRuntimeActions(elapsedTick, node.displayActions || [], {
            skipExpression,
            scope: "shape_level_display",
            cardId: card.id
        });
        levels.push({
            scopeLevel: depth,
            ancestorSequencedDepths: scope.sequencedDepths,
            sequenced: node.type === "sequenced_shape",
            growthAnimates: node.type === "sequenced_shape" ? (node.growthAnimates || []) : [],
            axis: this.resolveRelativeDirection(node.axisExpr || node.axisPreset || "RelativeLocation.yAxis()"),
            scale: normalizeScaleHelperConfig(node.scale, { type: "none" }),
            actions,
            hasExpression: !!actions.__hasExpression
        });
        this._collectTreeNodeRuntimeLevels(card, node.children || [], levels, depth + 1, elapsedTick, skipExpression);
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
            set currentAge(v) { this._ctx.currentAge = int(v); },
            get textureSheet() { return this._ctx.textureSheet; },
            set textureSheet(v) { this._ctx.textureSheet = int(v); },
            get status() { return this._ctx.status; },
            set status(v) {
                const next = (v && typeof v === "object") ? v : { displayStatus: 1 };
                this._ctx.status = next;
                this._ctx.thisAt.status = next;
            },
            get tickCount() { return this._ctx.tickCount; },
            set tickCount(v) { this._ctx.tickCount = num(v); }
        };
        this.controllerParticleProto = {
            get particleColor() { return this._ctx.particleColor; },
            set particleColor(v) { this._ctx.setColor(v); },
            get particleSize() { return this._ctx.particleSize; },
            set particleSize(v) { this._ctx.setSize(v); },
            get particleAlpha() { return this._ctx.particleAlpha; },
            set particleAlpha(v) { this._ctx.setAlpha(v); },
            get currentAge() { return this._ctx.currentAge; },
            set currentAge(v) { this._ctx.currentAge = int(v); },
            get textureSheet() { return this._ctx.textureSheet; },
            set textureSheet(v) { this._ctx.textureSheet = int(v); }
        };
    }

    applyControllerScriptVisual(visual, scriptRaw, opts = {}) {
        const srcRaw = String(scriptRaw || "").trim();
        if (!visual || !srcRaw) return;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const runtimeCtx = Object.assign({}, runtimeVars || {});
        const thisAtVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : runtimeCtx;
        const statusRef = (thisAtVars.status && typeof thisAtVars.status === "object")
            ? thisAtVars.status
            : {};
        statusRef.displayStatus = int(statusRef.displayStatus || 1) === 2 ? 2 : 1;
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
        runtimeCtx.currentAge = num(runtimeCtx.currentAge || 0);
        runtimeCtx.textureSheet = num(runtimeCtx.textureSheet || 0);
        runtimeCtx.tickCount = num(elapsedTick);
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
        vars.age = num(baseVars.age);
        vars.tick = num(baseVars.tick);
        vars.tickCount = num(elapsedTick);
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
        let fn = this.previewControllerFnCache.get(src);
        if (fn === undefined) {
            try {
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
            } catch {
                fn = null;
            }
            if (this.previewControllerFnCache.size > 1024) this.previewControllerFnCache.clear();
            this.previewControllerFnCache.set(src, fn);
        }
        if (typeof fn === "function") {
            const noop = () => {};
            try {
                fn(vars, U.v(0, 0, 0), particle, noop, noop, noop, noop, noop, noop, thisAtVars);
            } catch {
            }
        }

        setColor(runtimeCtx.color);
        setSize(runtimeCtx.size);
        setAlpha(runtimeCtx.alpha);
        const statusOut = (runtimeCtx.status && typeof runtimeCtx.status === "object") ? runtimeCtx.status : statusRef;
        const hasManualStatusAssign = /(^|[;\n])\s*(?:thisAt\.)?status\.displayStatus\s*=(?!=)/.test(src);
        if (hasManualStatusAssign) statusOut.__manualDisplayStatus = true;
        else if (Object.prototype.hasOwnProperty.call(statusOut, "__manualDisplayStatus")) delete statusOut.__manualDisplayStatus;
        statusOut.displayStatus = int(statusOut.displayStatus || 1) === 2 ? 2 : 1;
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
    }

    resolveCardPreviewVisual(cardId, opts = {}) {
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const fallback = { color: [1, 1, 1], size: 0.2, alpha: 1 };
        const card = this.getCardById(cardId);
        if (!card) return fallback;
        const useSingleInit = card.dataType === "single"
            || (card.dataType !== "single" && this.getShapeLeafType(card) === "single");
        if (!useSingleInit) return fallback;
        const visual = { color: [...fallback.color], size: 0.2, alpha: 1 };
        for (const it of (card.particleInit || [])) {
            const target = String(it.target || "").trim().toLowerCase();
            const expr = String(it.expr || "").trim();
            if (!expr) continue;
            if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") {
                const vec = this.parseVecLikeValueWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex });
                visual.color = [clamp(num(vec.x), 0, 1), clamp(num(vec.y), 0, 1), clamp(num(vec.z), 0, 1)];
            }
            if (target === "size" || target === "particlesize" || target === "particle.particlesize") {
                visual.size = Math.max(0.05, num(this.evaluateNumericExpressionWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex })));
            }
            if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") {
                visual.alpha = clamp(num(this.evaluateNumericExpressionWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex })), 0, 1);
            }
        }
        for (const action of (card.controllerActions || [])) {
            this.applyControllerScriptVisual(visual, String(action?.script || ""), {
                runtimeVars,
                elapsedTick,
                ageTick,
                pointIndex
            });
        }
        return visual;
    }

    isScriptAgeDependent(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        return /\bage\b/.test(src);
    }

    isCardVisualAgeDependent(card) {
        if (!card) return false;
        for (const it of (card.particleInit || [])) {
            const target = String(it?.target || "").trim().toLowerCase();
            if (target !== "color" && target !== "particlecolor" && target !== "particle.particlecolor"
                && target !== "size" && target !== "particlesize" && target !== "particle.particlesize"
                && target !== "alpha" && target !== "particlealpha" && target !== "particle.particlealpha") {
                continue;
            }
            if (this.isScriptAgeDependent(String(it?.expr || ""))) return true;
        }
        for (const action of (card.controllerActions || [])) {
            if (this.isScriptAgeDependent(String(action?.script || ""))) return true;
        }
        return false;
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
        const out = [];
        let hasExpression = false;
        const source = Array.isArray(rawActions) ? rawActions : (this.state.displayActions || []);
        for (const action of source) {
            const a = normalizeDisplayAction(action);
            if (a.type === "rotateToPoint") {
                out.push({ type: a.type, to: this.resolveRelativeDirection(a.toExpr || a.toPreset) });
                continue;
            }
            if (a.type === "rotateAsAxis") {
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                const angle = ((anglePerTick * elapsedTick) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                out.push({ type: a.type, angle });
                continue;
            }
            if (a.type === "rotateToWithAngle") {
                const to = this.resolveRelativeDirection(a.toExpr || a.toPreset);
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                const angle = ((anglePerTick * elapsedTick) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                out.push({ type: a.type, to, angle });
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const srcRaw = String(a.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                let fn = null;
                if (src) {
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
                                `with(vars){ try { ${src}\n } catch(_e) {} }; return point;`
                            );
                        } catch {
                            fn = null;
                        }
                        if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                        this.previewExprFnCache.set(src, fn);
                    }
                    hasExpression = true;
                }
                out.push({ type: a.type, expression: src, expressionRaw: srcRaw, fn });
            }
        }
        out.__hasExpression = hasExpression;
        return out;
    }

    applyRuntimeActionsToPoint(point, runtimeActions, elapsedTick, ageTick, pointIndex, startAxis = null, opts = {}) {
        const list = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!list.length) return point;
        const skipExpression = !!opts.skipExpression;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const shapeScope = (opts.shapeScope && typeof opts.shapeScope === "object") ? opts.shapeScope : null;
        if (skipExpression && list.every((a) => a?.type === "expression")) return point;
        let p = U.clone(point);
        let axis = this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        for (const a of list) {
            if (a.type === "rotateToPoint") {
                const dir = this.parseJsVec(a.to);
                p = this.rotatePointToDirection(p, dir, axis);
                axis = U.clone(dir);
                continue;
            }
            if (a.type === "rotateAsAxis") {
                p = U.rotateAroundAxis(p, axis, a.angle);
                continue;
            }
            if (a.type === "rotateToWithAngle") {
                const dir = this.parseJsVec(a.to);
                p = this.rotatePointToDirection(p, dir, axis);
                p = U.rotateAroundAxis(p, dir, a.angle);
                axis = U.clone(dir);
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
        const rawStatus = (out.status && typeof out.status === "object") ? out.status : {};
        rawStatus.displayStatus = int(rawStatus.displayStatus || 1) === 2 ? 2 : 1;
        if (rawStatus.displayStatus !== 2 && Object.prototype.hasOwnProperty.call(rawStatus, "__dissolveStartTick")) {
            delete rawStatus.__dissolveStartTick;
        }
        out.status = rawStatus;
        return out;
    }

    ensurePreviewRuntimeStatus(runtimeVars, elapsedTick = 0) {
        if (!runtimeVars || typeof runtimeVars !== "object") {
            return { displayStatus: 1 };
        }
        const rawStatus = (runtimeVars.status && typeof runtimeVars.status === "object")
            ? runtimeVars.status
            : {};
        rawStatus.displayStatus = int(rawStatus.displayStatus || 1) === 2 ? 2 : 1;
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

    evaluateNumericExpressionWithRuntime(exprRaw, runtimeVars = null, opts = {}) {
        const srcRaw = String(exprRaw || "").trim();
        if (!srcRaw) return 0;
        const src = transpileKotlinThisQualifierToJs(srcRaw).replace(/\b(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : {};
        const thisAt = (opts.thisAtVars && typeof opts.thisAtVars === "object") ? opts.thisAtVars : localVars;
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
        const baseProto = Object.getPrototypeOf(baseVars) || {};
        const vars = Object.assign({}, baseProto, baseVars);
        if (localVars && typeof localVars === "object") {
            for (const [k, v] of Object.entries(localVars)) vars[k] = v;
        }
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
        if (typeof fn !== "function") return 0;
        try {
            const out = fn(vars, vars.thisAt);
            return Number.isFinite(Number(out)) ? Number(out) : 0;
        } catch {
            return 0;
        }
    }

    parseVecLikeValueWithRuntime(rawExpr, runtimeVars = null, opts = {}) {
        const srcRaw = String(rawExpr || "").trim();
        if (!srcRaw) return U.v(0, 0, 0);
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        if (src === "Vec3.ZERO") return U.v(0, 0, 0);
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
        const m = src.match(/(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (m) {
            return U.v(
                this.evaluateNumericExpressionWithRuntime(m[1], localVars, { elapsedTick, ageTick, pointIndex, thisAtVars }),
                this.evaluateNumericExpressionWithRuntime(m[2], localVars, { elapsedTick, ageTick, pointIndex, thisAtVars }),
                this.evaluateNumericExpressionWithRuntime(m[3], localVars, { elapsedTick, ageTick, pointIndex, thisAtVars })
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
                { runtimeVars, persistExpressionVars: true }
            );
            axis = res?.axis || axis;
        }
    }

    rotatePointToDirection(point, toDir, fromAxis = null) {
        const axis = (fromAxis && U.len(fromAxis) > 1e-6) ? U.norm(fromAxis) : this.resolveCompositionAxisDirection();
        const dir = this.parseJsVec(toDir);
        const dot = num(axis.x) * num(dir.x) + num(axis.y) * num(dir.y) + num(axis.z) * num(dir.z);
        if (dot >= 0.999999) return point;
        const points = [U.clone(point)];
        if (typeof U.rotatePointsToPoint === "function") {
            U.rotatePointsToPoint(points, dir, axis);
        } else {
            rotatePointsToPointUpright(points, dir, axis);
        }
        return points[0] || point;
    }

    applyExpressionActionToPoint(action, point, elapsedTick, ageTick, pointIndex, axisInput = null, opts = {}) {
        const srcRaw = String(action?.expressionRaw || action?.expression || "").trim();
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        const startAxis = this.parseJsVec(axisInput || this.resolveCompositionAxisDirection());
        if (!src) return { point, axis: startAxis };
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const thisAt = runtimeVars || {};
        const api = {
            point: U.clone(point),
            axis: U.clone(startAxis),
            rotateToPoint: (to) => {
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                api.axis = U.clone(dir);
            },
            rotateAsAxis: (angle) => {
                const accum = Math.max(0, num(elapsedTick));
                const rot = (((num(angle) * accum) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                api.point = U.rotateAroundAxis(api.point, api.axis, rot);
            },
            rotateToWithAngle: (to, angle) => {
                const accum = Math.max(0, num(elapsedTick));
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                const rot = (((num(angle) * accum) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                api.point = U.rotateAroundAxis(api.point, dir, rot);
                api.axis = U.clone(dir);
            },
            // 预览中 addSingle/addMultiple 不改变几何，仅保证表达式兼容
            addSingle: () => {},
            addMultiple: () => {}
        };
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
        const baseProto = Object.getPrototypeOf(baseVars) || {};
        const vars = Object.assign({}, baseProto, baseVars);
        if (runtimeVars && typeof runtimeVars === "object") {
            for (const [k, v] of Object.entries(runtimeVars)) vars[k] = v;
        }
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
        vars.rotateToPoint = api.rotateToPoint;
        vars.thisAt = thisAt;
        try {
            if (typeof action?.fn === "function") {
                action.fn(
                    vars,
                    api.point,
                    api.rotateToPoint,
                    api.rotateAsAxis,
                    api.rotateToWithAngle,
                    api.addSingle,
                    api.addMultiple,
                    thisAt
                );
            } else {
                const fn = new Function(
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
            return U.norm(U.v(v.x, v.y, v.z));
        }
        return this.resolveRelativeDirection(String(v));
    }

    evaluateNumericExpression(exprRaw, opts = {}) {
        return this.exprRuntime.evaluateNumericExpression(exprRaw, opts);
    }

    getExpressionVars(elapsedTick = 0, ageTick = 0, pointIndex = 0, opts = {}) {
        return this.exprRuntime.getExpressionVars(elapsedTick, ageTick, pointIndex, opts);
    }

    getBuilderNumericContextMap() {
        const map = {};
        const entries = [];
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            const type = String(g?.type || "").trim();
            if (!name) continue;
            if (!["Int", "Long", "Float", "Double"].includes(type)) continue;
            entries.push({ name, expr: String(g?.value || "0") });
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            entries.push({ name, expr: String(c?.value || "0") });
        }
        map.PI = Math.PI;
        for (let pass = 0; pass < 6; pass++) {
            let changed = false;
            for (const it of entries) {
                const v = evaluateExprWithMap(it.expr, map);
                if (!Number.isFinite(v)) continue;
                if (map[it.name] !== v) {
                    map[it.name] = v;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        delete map.PI;
        return map;
    }

    evaluateNumberLiteral(raw) {
        return this.exprRuntime.evaluateNumberLiteral(raw);
    }

    getCardColorRgb(cardId) {
        const key = String(cardId || "");
        if (this.cardColorCache.has(key)) return this.cardColorCache.get(key);
        const h = ((hashString(key) % 360) + 360) % 360 / 360;
        const c = new THREE.Color().setHSL(h, 0.76, 0.56);
        if (typeof c.convertLinearToSRGB === "function") c.convertLinearToSRGB();
        const out = [c.r, c.g, c.b];
        this.cardColorCache.set(key, out);
        return out;
    }

    getCardColorFactor(_cardId) {
        return 1;
    }

    onPreviewPointerDown(e) {
        if (this.previewDistanceTool?.isActive()) return;
        if (e.button !== 0) return;
        this.selectPointerId = e.pointerId;
        this.selectState = {
            x0: e.clientX,
            y0: e.clientY,
            x1: e.clientX,
            y1: e.clientY,
            moved: false,
            append: !!(e.ctrlKey || e.metaKey),
            hostRect: this.dom.viewerWrap?.getBoundingClientRect?.() || null
        };
        this.controls.enabled = false;
        this.hideSelectBox();
        try {
            this.renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
        }
    }

    onPreviewPointerMove(e) {
        if (this.previewDistanceTool?.isActive()) return;
        if (!this.selectState || this.selectPointerId !== e.pointerId) return;
        this.selectState.x1 = e.clientX;
        this.selectState.y1 = e.clientY;
        const dx = Math.abs(this.selectState.x1 - this.selectState.x0);
        const dy = Math.abs(this.selectState.y1 - this.selectState.y0);
        if (dx >= 3 || dy >= 3) this.selectState.moved = true;
        if (this.selectState.moved) {
            this.controls.enabled = false;
            this.applySelectBoxRect(this.getSelectionRectFromState(this.selectState), this.selectState.hostRect);
        }
    }

    onPreviewPointerUp(e) {
        if (!this.selectState || this.selectPointerId !== e.pointerId) return;
        const distanceToolActive = this.previewDistanceTool?.isActive();
        const sel = this.selectState;
        this.selectState = null;
        this.selectPointerId = null;
        try {
            this.renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
        }
        this.controls.enabled = true;

        if (distanceToolActive) {
            this.hideSelectBox();
            return;
        }

        if (sel.moved) {
            const rect = this.getSelectionRectFromState(sel);
            this.selectCardsByClientRect(rect, sel.append);
        } else {
            const picked = this.pickCardAtClientPoint(sel.x1, sel.y1);
            if (picked) this.selectCardById(picked, sel.append);
            else if (!sel.append) {
                this.selectCards([], false);
            }
        }
        this.hideSelectBox();
    }

    onPreviewPointerCancel(e) {
        if (!this.selectState || this.selectPointerId !== e.pointerId) return;
        this.selectState = null;
        this.selectPointerId = null;
        try {
            this.renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
        }
        this.controls.enabled = true;
        this.hideSelectBox();
    }

    getSelectionRectFromState(sel) {
        const x = Math.min(sel.x0, sel.x1);
        const y = Math.min(sel.y0, sel.y1);
        const w = Math.abs(sel.x1 - sel.x0);
        const h = Math.abs(sel.y1 - sel.y0);
        return { x, y, w, h };
    }

    applySelectBoxRect(clientRect, hostRect = null) {
        const resolvedHostRect = hostRect || this.dom.viewerWrap?.getBoundingClientRect?.();
        if (!resolvedHostRect) return;
        const x = clientRect.x - resolvedHostRect.left;
        const y = clientRect.y - resolvedHostRect.top;
        this.dom.selectBox.style.left = `${x}px`;
        this.dom.selectBox.style.top = `${y}px`;
        this.dom.selectBox.style.width = `${clientRect.w}px`;
        this.dom.selectBox.style.height = `${clientRect.h}px`;
        this.dom.selectBox.classList.remove("hidden");
    }

    hideSelectBox() {
        this.dom.selectBox.classList.add("hidden");
        this.dom.selectBox.style.width = "0px";
        this.dom.selectBox.style.height = "0px";
    }

    pickPreviewPointAtClientPoint(clientX, clientY, radiusPx = 11) {
        let best = null;
        let bestDist = Number.POSITIVE_INFINITY;
        const positions = this.getPreviewInteractionPositionArray?.();
        const visibleMask = this.getPreviewInteractionVisibleMask?.() || this.previewVisibleMask;
        const pointCount = positions ? Math.floor(positions.length / 3) : this.previewPoints.length;
        const canvas = this.renderer?.domElement;
        const rect = canvas?.getBoundingClientRect?.();
        const projector = this.previewPickVector || (this.previewPickVector = new THREE.Vector3());
        if (!rect || rect.width <= 0 || rect.height <= 0 || !this.camera) return null;
        for (let i = 0; i < pointCount; i++) {
            if (visibleMask && (visibleMask[i] === false || visibleMask[i] === 0)) continue;
            const point = positions ? null : this.previewPoints[i];
            const px = positions ? positions[i * 3] : point?.x;
            const py = positions ? positions[i * 3 + 1] : point?.y;
            const pz = positions ? positions[i * 3 + 2] : point?.z;
            if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;
            projector.set(px, py, pz).project(this.camera);
            if (!Number.isFinite(projector.x) || !Number.isFinite(projector.y) || !Number.isFinite(projector.z)) continue;
            const dx = rect.left + (projector.x * 0.5 + 0.5) * rect.width - clientX;
            const dy = rect.top + (-projector.y * 0.5 + 0.5) * rect.height - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 >= bestDist) continue;
            bestDist = d2;
            best = {
                ownerId: this.previewOwners[i] || null,
                point: {
                    x: num(px),
                    y: num(py),
                    z: num(pz)
                },
                index: i
            };
        }
        if (bestDist <= radiusPx * radiusPx) return best;
        return null;
    }

    pickPreviewGridPointAtClientPoint(clientX, clientY) {
        if (!this.camera || !this.renderer) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        const ndc = new THREE.Vector3(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -(((clientY - rect.top) / rect.height) * 2 - 1),
            0.5
        );
        const origin = this.camera.position.clone();
        const target = ndc.unproject(this.camera);
        const direction = target.sub(origin);
        if (Math.abs(direction.y) <= 1e-6) return null;
        const t = -origin.y / direction.y;
        if (!Number.isFinite(t) || t < 0) return null;
        return {
            x: origin.x + direction.x * t,
            y: 0,
            z: origin.z + direction.z * t,
            label: "grid:xz"
        };
    }

    resolvePreviewDistancePointFromEvent(ev) {
        if (!ev) return null;
        const picked = this.pickPreviewPointAtClientPoint(ev.clientX, ev.clientY);
        if (picked?.point) {
            return {
                point: picked.point,
                clientX: ev.clientX,
                clientY: ev.clientY,
                source: "preview_point"
            };
        }
        const gridPoint = this.pickPreviewGridPointAtClientPoint(ev.clientX, ev.clientY);
        if (!gridPoint) return null;
        return {
            point: gridPoint,
            clientX: ev.clientX,
            clientY: ev.clientY,
            source: "grid"
        };
    }

    pickCardAtClientPoint(clientX, clientY, radiusPx = 11) {
        const picked = this.pickPreviewPointAtClientPoint(clientX, clientY, radiusPx);
        return picked ? picked.ownerId : null;
    }

    selectCardsByClientRect(clientRect, append = false) {
        const ids = [];
        const x2 = clientRect.x + clientRect.w;
        const y2 = clientRect.y + clientRect.h;
        const positions = this.getPreviewInteractionPositionArray?.();
        const visibleMask = this.getPreviewInteractionVisibleMask?.() || this.previewVisibleMask;
        const pointCount = positions ? Math.floor(positions.length / 3) : this.previewPoints.length;
        const canvas = this.renderer?.domElement;
        const rect = canvas?.getBoundingClientRect?.();
        const projector = this.previewPickVector || (this.previewPickVector = new THREE.Vector3());
        if (!rect || rect.width <= 0 || rect.height <= 0 || !this.camera) {
            this.selectCards([], append);
            return;
        }
        for (let i = 0; i < pointCount; i++) {
            if (visibleMask && (visibleMask[i] === false || visibleMask[i] === 0)) continue;
            const point = positions ? null : this.previewPoints[i];
            const px = positions ? positions[i * 3] : point?.x;
            const py = positions ? positions[i * 3 + 1] : point?.y;
            const pz = positions ? positions[i * 3 + 2] : point?.z;
            if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;
            projector.set(px, py, pz).project(this.camera);
            if (!Number.isFinite(projector.x) || !Number.isFinite(projector.y) || !Number.isFinite(projector.z)) continue;
            const screenX = rect.left + (projector.x * 0.5 + 0.5) * rect.width;
            const screenY = rect.top + (-projector.y * 0.5 + 0.5) * rect.height;
            if (screenX >= clientRect.x && screenX <= x2 && screenY >= clientRect.y && screenY <= y2) {
                const id = this.previewOwners[i];
                if (id && !ids.includes(id)) ids.push(id);
            }
        }
        this.selectCards(ids, append);
    }

    worldToClient(p) {
        if (!this.camera || !this.renderer) return null;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
        return {
            x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-v.y * 0.5 + 0.5) * rect.height
        };
    }

    resetCamera() {
        if (!this.camera || !this.controls) return;
        this.camera.position.set(16, 11, 16);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    toggleFullscreen() {
        const host = this.dom.viewerWrap;
        if (!document.fullscreenElement) {
            host.requestFullscreen?.().catch(() => {});
        } else if (document.fullscreenElement === host) {
            document.exitFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    syncFullscreenUi() {
        const isFs = document.fullscreenElement === this.dom.viewerWrap;
        this.dom.btnFullscreen.textContent = isFs ? "退出全屏" : "预览全屏";
        this.onResize();
    }

    onResize() {
        this.applySplitSizesFromSettings();
        if (!this.renderer || !this.camera) return;
        const host = this.dom.threeHost;
        const width = Math.max(2, host.clientWidth || 2);
        const height = Math.max(2, host.clientHeight || 2);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.previewSceneDirty = true;
    }

    initLayoutSplitters() {
        if (this._splittersBound) return;
        this._splittersBound = true;
        this.applySplitSizesFromSettings();

        const resizer = this.dom.editorResizer;
        const pageEditor = this.dom.pageEditorWrap;
        const leftPanel = this.dom.leftPanel;
        if (resizer && pageEditor && leftPanel) {
            resizer.addEventListener("pointerdown", (ev) => {
                if ((window.innerWidth || 0) <= 1100) return;
                ev.preventDefault();
                const rect = pageEditor.getBoundingClientRect();
                const startX = ev.clientX;
                const startW = leftPanel.getBoundingClientRect().width;
                const minW = 280;
                const maxW = Math.max(minW, Math.min(460, rect.width - 320));
                try {
                    resizer.setPointerCapture(ev.pointerId);
                } catch {
                }
                const onMove = (e) => {
                    const dx = e.clientX - startX;
                    const w = clamp(startW + dx, minW, maxW);
                    leftPanel.style.flexBasis = `${w}px`;
                    leftPanel.style.width = `${w}px`;
                    this.state.settings.compositionLayerWidth = w;
                    this.onResize();
                };
                const onUp = (e) => {
                    try {
                        resizer.releasePointerCapture(e.pointerId);
                    } catch {
                    }
                    resizer.removeEventListener("pointermove", onMove);
                    resizer.removeEventListener("pointerup", onUp);
                    resizer.removeEventListener("pointercancel", onUp);
                    this.scheduleSave();
                };
                resizer.addEventListener("pointermove", onMove);
                resizer.addEventListener("pointerup", onUp);
                resizer.addEventListener("pointercancel", onUp);
            });
        }

        const verticalResizer = this.dom.projectCardsResizer;
        if (verticalResizer) {
            verticalResizer.style.display = "none";
        }

    }

    applySplitSizesFromSettings() {
        const vw = window.innerWidth || 1920;
        const leftPanel = this.dom.leftPanel;
        if (leftPanel) {
            if (vw <= 1100) {
                leftPanel.style.flexBasis = "";
                leftPanel.style.width = "";
            } else {
                const w = clamp(num(this.state.settings.compositionLayerWidth || 300), 260, 520);
                leftPanel.style.flexBasis = `${w}px`;
                leftPanel.style.width = `${w}px`;
            }
        }
        if (this.dom.compositionSideWorkbench) {
            const layerW = clamp(num(this.state.settings.compositionLayerWidth || 300), 260, 420);
            this.dom.compositionSideWorkbench.style.setProperty("--composition-layers-width", `${layerW}px`);
        }
    }

    replayPreview() {
        this.previewAnimStart = performance.now();
        this.previewPerfLastTs = 0;
        this.previewCycleCache = null;
        this.previewExprCountCache.clear();
        this.previewExprPrefixCache.clear();
        if (this.previewFoldSimpleActionCache && typeof this.previewFoldSimpleActionCache.clear === "function") {
            this.previewFoldSimpleActionCache.clear();
        }
        this.previewCondFnCache.clear();
        this.previewNumericFnCache.clear();
        this.previewControllerFnCache.clear();
        if (this.previewCardVisualAgeDependentCache && typeof this.previewCardVisualAgeDependentCache.clear === "function") {
            this.previewCardVisualAgeDependentCache.clear();
        }
        if (this.previewFrameShapeRuntimeLevelsCache && typeof this.previewFrameShapeRuntimeLevelsCache.clear === "function") {
            this.previewFrameShapeRuntimeLevelsCache.clear();
        }
        if (this.previewFrameGrowthPlanCache && typeof this.previewFrameGrowthPlanCache.clear === "function") {
            this.previewFrameGrowthPlanCache.clear();
        }
        if (Array.isArray(this.previewFrameGroupRuntimeCache)) this.previewFrameGroupRuntimeCache.fill(undefined);
        if (Array.isArray(this.previewFrameAnchorCache)) this.previewFrameAnchorCache.fill(undefined);
        if (Array.isArray(this.previewFrameLocalCache)) this.previewFrameLocalCache.fill(undefined);
        if (Array.isArray(this.previewFrameGroupVisualCache)) this.previewFrameGroupVisualCache.fill(undefined);
        if (Array.isArray(this.previewFrameGroupPointVisualCache)) this.previewFrameGroupPointVisualCache.fill(undefined);
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        this.previewAutoPaused = false;
        this.previewWasPlayingBeforeAutoPause = false;
        if (this.previewPaused) this.setPreviewPaused(false);
    }

    jumpPreviewToPreFade() {
        const cycle = this.previewCycleCache || (this.previewCycleCache = this.getPreviewCycleConfig());
        const nearFade = Math.max(0, num((cycle.play || (cycle.appear + cycle.live)) - 0.001));
        this.previewAnimStart = performance.now() - nearFade * 50;
        this.previewPerfLastTs = 0;
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        if (this.previewPaused) {
            this.updatePreviewAnimation();
            if (this.renderer) this.renderer.render(this.scene, this.camera);
        }
    }

    initExpressionSuggest() {
        const el = document.createElement("div");
        el.className = "expr-suggest hidden";
        document.body.appendChild(el);
        this.exprSuggest.el = el;
        el.addEventListener("mousedown", (e) => e.preventDefault());
        el.addEventListener("click", (e) => {
            const btn = e.target.closest(".expr-suggest-item");
            if (!btn) return;
            const idx = int(btn.dataset.idx);
            this.acceptExprSuggestion(idx);
        });
    }

    onExprFocusIn(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        this.exprSuggest.activeInput = input;
        this.openExprSuggest(input, false);
    }

    onExprInput(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        if (this.exprSuggest.activeInput !== input) this.exprSuggest.activeInput = input;
        this.openExprSuggest(input, false);
    }

    onExprKeydown(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        if (!this.exprSuggest.el) return;
        const isOpen = !this.exprSuggest.el.classList.contains("hidden");
        if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
            e.preventDefault();
            this.openExprSuggest(input, true);
            return;
        }
        if (!isOpen) return;
        if (e.code === "ArrowDown") {
            e.preventDefault();
            this.moveExprSuggest(1);
            return;
        }
        if (e.code === "ArrowUp") {
            e.preventDefault();
            this.moveExprSuggest(-1);
            return;
        }
        if (e.code === "Enter" || e.code === "Tab") {
            e.preventDefault();
            this.acceptExprSuggestion(this.exprSuggest.active);
            return;
        }
        if (e.code === "Escape") {
            e.preventDefault();
            this.closeExprSuggest();
        }
    }

    onExprMouseDown(e) {
        if (!this.exprSuggest.el) return;
        const t = e.target;
        if (t?.closest?.(".expr-suggest")) return;
        if (t?.closest?.(".expr-input") && this.isExprTextInput(t.closest(".expr-input"))) return;
        this.closeExprSuggest();
    }

    isExprTextInput(el) {
        const tag = String(el?.tagName || "").toUpperCase();
        if (el?.dataset?.codeEditor) return false;
        return tag === "INPUT" || tag === "TEXTAREA";
    }

    openExprSuggest(input, force = false) {
        if (!input) return;
        const info = this.getExprTokenAtCursor(input);
        if (!info) {
            this.closeExprSuggest();
            return;
        }
        const all = this.getExprCompletions();
        const token = String(info.token || "").trim();
        if (!force && !token) {
            this.closeExprSuggest();
            return;
        }
        const tokenLower = token.toLowerCase();
        const dotIdx = token.lastIndexOf(".");
        const ownerPrefixLower = dotIdx > 0 ? `${token.slice(0, dotIdx)}.`.toLowerCase() : "";
        const memberPrefixLower = dotIdx > 0 ? token.slice(dotIdx + 1).toLowerCase() : "";
        const filtered = all.filter((it) => {
            if (!token) return force;
            const valueLower = String(it || "").toLowerCase();
            if (dotIdx > 0) {
                if (!valueLower.startsWith(ownerPrefixLower)) return false;
                return !memberPrefixLower || valueLower.slice(ownerPrefixLower.length).startsWith(memberPrefixLower);
            }
            return valueLower.includes(tokenLower);
        }).slice(0, 18);
        if (!filtered.length) {
            this.closeExprSuggest();
            return;
        }
        this.exprSuggest.activeInput = input;
        this.exprSuggest.items = all;
        this.exprSuggest.filtered = filtered;
        this.exprSuggest.token = token;
        this.exprSuggest.range = { start: info.start, end: info.end };
        this.exprSuggest.active = 0;
        this.renderExprSuggest();
    }

    renderExprSuggest() {
        const s = this.exprSuggest;
        if (!s.el || !s.activeInput || !s.filtered.length) return this.closeExprSuggest();
        const html = s.filtered.map((it, i) => `
            <button type="button" class="expr-suggest-item ${i === s.active ? "active" : ""}" data-idx="${i}">
                <span>${esc(String(it || "").replace("$0", ""))}</span>
            </button>
        `).join("");
        s.el.innerHTML = html;
        s.el.classList.remove("hidden");
        const rect = s.activeInput.getBoundingClientRect();
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const width = Math.min(420, Math.max(220, rect.width));
        let left = rect.left;
        let top = rect.bottom + 6;
        if (left + width > vw - 10) left = vw - width - 10;
        const panelHeight = 240;
        if (top + panelHeight > vh - 8) top = Math.max(8, rect.top - panelHeight - 8);
        s.el.style.left = `${Math.round(left)}px`;
        s.el.style.top = `${Math.round(top)}px`;
        s.el.style.width = `${Math.round(width)}px`;
    }

    moveExprSuggest(delta) {
        const s = this.exprSuggest;
        if (!s.filtered.length) return;
        const n = s.filtered.length;
        s.active = (s.active + delta + n) % n;
        this.renderExprSuggest();
    }

    acceptExprSuggestion(index) {
        const s = this.exprSuggest;
        const input = s.activeInput;
        if (!input) return;
        const item = s.filtered[int(index)];
        if (!item) return;
        const cursor = int(input.selectionStart ?? 0);
        const live = this.getExprTokenAtCursor(input) || { token: "", start: cursor, end: cursor };
        const stale = s.range || { start: cursor, end: cursor };
        let range = { start: stale.start, end: stale.end };
        if (cursor >= int(live.start) && cursor <= int(live.end)) {
            range = { start: int(live.start), end: int(live.end) };
        }
        const text = String(input.value || "");
        const marker = "$0";
        const rawInsert = String(item);
        const markerIdx = rawInsert.indexOf(marker);
        const insert = markerIdx >= 0 ? rawInsert.replace(marker, "") : rawInsert;
        const next = text.slice(0, range.start) + insert + text.slice(range.end);
        const caret = markerIdx >= 0 ? (range.start + markerIdx) : (range.start + insert.length);
        input.value = next;
        try {
            input.focus?.();
            input.setSelectionRange?.(caret, caret);
        } catch {
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        this.closeExprSuggest();
    }

    closeExprSuggest() {
        const s = this.exprSuggest;
        if (!s.el) return;
        s.el.classList.add("hidden");
        s.el.innerHTML = "";
        s.filtered = [];
        s.range = null;
        s.token = "";
    }

    getExprTokenAtCursor(input) {
        const value = String(input.value || "");
        const pos = int(input.selectionStart ?? value.length);
        const left = value.slice(0, pos);
        const m = left.match(/[A-Za-z_][A-Za-z0-9_.()@]*$/);
        if (!m) return { token: "", start: pos, end: pos };
        const token = m[0];
        return { token, start: pos - token.length, end: pos };
    }

    getExprCompletions() {
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const mappingTarget = getCompositionKotlinTarget(this.state.mapping);
        const base = [
            "age",
            "tick",
            "tickCount",
            "PI",
            "status.displayStatus",
            `this@${projectClass}.status.displayStatus`,
            "rotateToPoint($0)",
            "rotateAsAxis($0)",
            "rotateToWithAngle($0, 0.05)",
            "addSingle()",
            "addMultiple($0)",
            "addPreTickAction { }",
            "setReversedScaleOnCompositionStatus($0)",
            "particle.particleAlpha",
            "particle.particleColor",
            "particle.particleSize",
            `${mappingTarget.vec3Type}($0)`,
            "RelativeLocation.yAxis()",
            "RelativeLocation($0)",
            "Vector3f($0)"
        ];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            if (!name) continue;
            base.push(name);
            base.push(`this@${projectClass}.${name}`);
            if (String(g.type || "") === "Vec3" || String(g.type || "") === "Vector3f") base.push(`${name}.asRelative()`);
        }
        for (const c of this.state.globalConsts) {
            const name = String(c.name || "").trim();
            if (name) base.push(name);
        }
        return Array.from(new Set(base));
    }

    hasManualProjectScaleHelper() {
        const projectScale = (this.state?.projectScale && typeof this.state.projectScale === "object")
            ? this.state.projectScale
            : null;
        if (!projectScale) return false;
        const type = String(projectScale.type || "none").trim();
        if (!type || type === "none") return false;
        return String(projectScale.runMode || "auto").trim() === "manual";
    }

    isControllerScriptEditor(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        return String(textarea.dataset.cactField || textarea.dataset.treeNodeCactField || "").trim() === "script";
    }

    isScaleHelperAllowedForCodeEditor(textarea) {
        if (!this.hasManualProjectScaleHelper()) return false;
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        if (this.isControllerScriptEditor(textarea)) return false;
        return textarea.dataset.displayField === "expression"
            || textarea.dataset.cardShapeDisplayField === "expression"
            || textarea.dataset.cardShapeChildDisplayField === "expression"
            || textarea.dataset.shapeLevelDisplayField === "expression";
    }

    getProjectScaleHelperCompletionSnippets(textarea = null) {
        if (!this.isScaleHelperAllowedForCodeEditor(textarea)) return [];
        return [
            "scaleHelper.doScale()",
            "scaleHelper.doScaleReversed()"
        ];
    }

    resolveCodeEditorControllerVars(cardId = "", treePathRaw = "") {
        const id = String(cardId || "").trim();
        if (!id) return [];
        const card = this.getCardById(id);
        if (!card) return [];
        const rawPath = String(treePathRaw || "").trim();
        if (rawPath) {
            try {
                const node = this.getShapeNodeByPath(card, JSON.parse(rawPath));
                if (node && Array.isArray(node.controllerVars)) return node.controllerVars;
            } catch (_) {
            }
        }
        return Array.isArray(card.controllerVars) ? card.controllerVars : [];
    }

    getCodeEditorScopeInfo(textarea) {
        const none = { allowRel: false, allowOrder: false, maxShapeDepth: -1, sequencedDepths: [] };
        if (!(textarea instanceof HTMLTextAreaElement)) return none;
        const cardId = String(textarea.dataset.cardId || "");
        if (!cardId) return none;
        const card = this.getCardById(cardId);
        if (!card) return none;
        if (this.isControllerScriptEditor(textarea)) {
            const levelFromRow = textarea.closest?.("[data-shape-level]")?.dataset?.shapeLevel;
            const rawLevel = textarea.dataset.shapeLevelIdx ?? levelFromRow;
            if (rawLevel !== undefined) {
                const levelIdx = Math.max(0, int(rawLevel));
                return this.getShapeScopeInfoByRuntimeLevel(card, levelIdx + 1);
            }
            return none;
        }
        // 作用域检测使用稳定的索引标记，避免预览或代码编辑器包装层误删 shapeRel*。
        if (
            textarea.dataset.shapeLevelIdx !== undefined
            || textarea.dataset.shapeLevelDisplayIdx !== undefined
            || textarea.dataset.shapeLevelDisplayField === "expression"
        ) {
            const levelFromRow = textarea.closest?.("[data-shape-level]")?.dataset?.shapeLevel;
            const idx = Math.max(1, int(textarea.dataset.shapeLevelIdx ?? levelFromRow ?? 1));
            return this.getShapeScopeInfoByRuntimeLevel(card, idx + 1);
        }
        if (textarea.dataset.cardShapeChildDisplayIdx !== undefined || textarea.dataset.cardShapeChildDisplayField === "expression") {
            return this.getShapeScopeInfoByRuntimeLevel(card, 1);
        }
        if (textarea.dataset.cardShapeDisplayIdx !== undefined || textarea.dataset.cardShapeDisplayField === "expression") {
            return this.getShapeScopeInfoByRuntimeLevel(card, 0);
        }
        return none;
    }

    getJsValidationAllowedIdentifiers(opts = {}) {
        const allowed = new Set();
        const allowGrowthApi = opts.allowGrowthApi !== false;
        for (const key of JS_LINT_GLOBALS) {
            if (!allowGrowthApi && (key === "addSingle" || key === "addMultiple")) continue;
            allowed.add(key);
        }
        const scope = (opts.scope && typeof opts.scope === "object") ? opts.scope : null;
        if (scope?.allowRel) allowed.add("rel");
        if (scope?.allowOrder) allowed.add("order");
        const scopeMaxShapeDepth = scope ? Number(scope.maxShapeDepth) : Number.NaN;
        const maxShapeDepth = Number.isFinite(scopeMaxShapeDepth)
            ? Math.max(-1, int(scopeMaxShapeDepth))
            : -1;
        const seqDepth = new Set(
            Array.isArray(scope?.sequencedDepths)
                ? scope.sequencedDepths.map((it) => int(it))
                : []
        );
        for (let i = 0; i <= maxShapeDepth; i++) {
            allowed.add(`shapeRel${i}`);
            if (seqDepth.has(i)) allowed.add(`shapeOrder${i}`);
        }
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        const cardId = String(opts.cardId || "").trim();
        const treePath = String(opts.treePath || "").trim();
        if (opts.allowScaleHelper === true && this.hasManualProjectScaleHelper()) {
            allowed.add("scaleHelper");
        }
        for (const v of this.resolveCodeEditorControllerVars(cardId, treePath)) {
            const name = String(v?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        return allowed;
    }

    validateJsExpressionSource(source, opts = {}) {
        const srcRaw = String(source || "").trim();
        if (!srcRaw) return { valid: true, message: "" };
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        try {
            new Function(
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
                `with(vars){ ${src}\n }; return point;`
            );
        } catch (e) {
            return { valid: false, message: `语法错误: ${String(e?.message || e || "invalid script")}` };
        }
        const allowed = this.getJsValidationAllowedIdentifiers(opts);
        const unknown = findFirstUnknownJsIdentifier(src, allowed);
        if (unknown) {
            return { valid: false, message: `未定义标识符: ${unknown}` };
        }
        return { valid: true, message: "" };
    }

    validateCodeEditorSource(textarea, source) {
        if (!(textarea instanceof HTMLTextAreaElement)) return { valid: true, message: "" };
        const isDisplayExpr = textarea.dataset.displayField === "expression";
        const isShapeDisplayExpr = textarea.dataset.cardShapeDisplayField === "expression";
        const isShapeChildDisplayExpr = textarea.dataset.cardShapeChildDisplayField === "expression";
        const isShapeLevelDisplayExpr = textarea.dataset.shapeLevelDisplayField === "expression";
        const isControllerScript = this.isControllerScriptEditor(textarea);
        if (!isDisplayExpr && !isShapeDisplayExpr && !isShapeChildDisplayExpr && !isShapeLevelDisplayExpr && !isControllerScript) {
            return { valid: true, message: "" };
        }
        const cardId = String(textarea.dataset.cardId || "");
        const treePath = String(textarea.dataset.treePath || "");
        const scope = this.getCodeEditorScopeInfo(textarea);
        const allowGrowthApi = this.isGrowthApiAllowedForCodeEditor(textarea);
        const allowScaleHelper = this.isScaleHelperAllowedForCodeEditor(textarea);
        const result = this.validateJsExpressionSource(source, { cardId, treePath, scope, allowGrowthApi, allowScaleHelper });
        if (result.valid) return result;
        return {
            valid: false,
            message: `表达式存在问题，此表达式不生效${result.message ? ` ${result.message}` : ""}`
        };
    }

    buildCodeEditorApiDts(textarea, completions = []) {
        const cardId = String(textarea?.dataset?.cardId || "");
        const treePath = String(textarea?.dataset?.treePath || "");
        const scope = this.getCodeEditorScopeInfo(textarea);
        const allowGrowthApi = this.isGrowthApiAllowedForCodeEditor(textarea);
        const allowScaleHelper = this.isScaleHelperAllowedForCodeEditor(textarea);
        const allowed = this.getJsValidationAllowedIdentifiers({ cardId, treePath, scope, allowGrowthApi, allowScaleHelper });
        const declared = new Map();
        const lines = [];
        const declareSymbol = (name, type = "any", mutable = false, opts = {}) => {
            const id = String(name || "").trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id)) return;
            const prev = declared.get(id);
            if (!prev) {
                declared.set(id, { type, mutable: mutable === true });
                return;
            }
            if (mutable === true && opts.keepReadonly !== true) prev.mutable = true;
            if ((prev.type === "any" || opts.preferType === true) && type && type !== "any") prev.type = type;
        };

        const statusType = `{
  displayStatus: number;
  isDisable(): boolean;
  disable(): void;
  isEnable(): boolean;
  enable(): void;
  [key: string]: any;
}`;
        const vectorEditorType = (rawType) => {
            const type = String(rawType || "").trim();
            if (type === "RelativeLocation") return "RelativeLocationValue";
            if (type === "Vector3f") return "Vector3fValue";
            if (type === "Vec3" || type === "Vec3d") return "Vec3Value";
            return "any";
        };
        lines.push(compositionVectorApiTypeDeclaration());
        lines.push("interface RelativeLocationValue extends CompositionVector<RelativeLocationValue> {}");
        lines.push("interface Vec3Value extends CompositionVector<Vec3Value> {}");
        lines.push("interface Vector3fValue extends CompositionVector<Vector3fValue> {}");
        declareSymbol("Math", "Math");
        declareSymbol("PI", "number");
        declareSymbol("age", "number", true);
        declareSymbol("tick", "number", true);
        declareSymbol("tickCount", "number", true);
        declareSymbol("index", "number", true);
        declareSymbol("rel", "RelativeLocationValue", true);
        declareSymbol("order", "any", true);
        declareSymbol("axis", "RelativeLocationValue", true);
        declareSymbol("thisAt", "any", true);
        declareSymbol("particle", "any", true);
        declareSymbol("status", statusType, false, { keepReadonly: true });

        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            declareSymbol(name, vectorEditorType(g?.type), g?.mutable !== false);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            declareSymbol(name, "any", false);
        }
        for (const v of this.resolveCodeEditorControllerVars(cardId, treePath)) {
            const name = String(v?.name || "").trim();
            if (!name) continue;
            declareSymbol(name, "any", true);
        }
        lines.push("declare function rotateToPoint(to: RelativeLocationValue): void;");
        lines.push("declare function rotateAsAxis(...args: any[]): any;");
        lines.push("declare function rotateToWithAngle(to: RelativeLocationValue, angle: number): void;");
        if (allowGrowthApi) {
            lines.push("declare function addSingle(...args: any[]): any;");
            lines.push("declare function addMultiple(...args: any[]): any;");
        }
        lines.push("declare function addPreTickAction(...args: any[]): any;");
        lines.push("declare function setReversedScaleOnCompositionStatus(...args: any[]): any;");
        if (allowScaleHelper) {
            lines.push("declare const scaleHelper: { doScale(...args: any[]): any; doScaleReversed(...args: any[]): any; };");
        }
        lines.push("declare function RelativeLocation(vector: CompositionVector<any>): RelativeLocationValue;");
        lines.push("declare function RelativeLocation(x: number, y: number, z: number): RelativeLocationValue;");
        lines.push("declare namespace RelativeLocation { function xAxis(): RelativeLocationValue; function yAxis(): RelativeLocationValue; function zAxis(): RelativeLocationValue; function zero(): RelativeLocationValue; }");
        lines.push(`declare function ${getCompositionKotlinTarget(this.state.mapping).vec3Type}(vector: CompositionVector<any>): Vec3Value;`);
        lines.push(`declare function ${getCompositionKotlinTarget(this.state.mapping).vec3Type}(x: number, y: number, z: number): Vec3Value;`);
        lines.push("declare function Vector3f(vector: CompositionVector<any>): Vector3fValue;");
        lines.push("declare function Vector3f(x: number, y: number, z: number): Vector3fValue;");

        for (const name of Array.from(allowed).sort((a, b) => a.localeCompare(b))) {
            declareSymbol(name, /^shapeRel\d+$/.test(name) ? "RelativeLocationValue" : "any", false);
        }
        for (const [name, meta] of declared.entries()) {
            lines.push(`declare ${meta.mutable ? "let" : "const"} ${name}: ${meta.type || "any"};`);
        }

        const reservedFn = new Set(["if", "for", "while", "switch", "catch", "new"]);
        const fnSet = new Set();
        const completionList = Array.isArray(completions) ? completions : [];
        for (const item of completionList) {
            const src = String(item?.insertText || item?.label || "").trim();
            const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(src);
            if (!m) continue;
            const fnName = String(m[1] || "");
            if (!fnName || reservedFn.has(fnName) || fnSet.has(fnName)) continue;
            fnSet.add(fnName);
            lines.push(`declare function ${fnName}(...args: any[]): any;`);
        }

        return `${lines.join("\n")}\n`;
    }

    buildCodeEditorLibs(textarea, completions = []) {
        return [
            {
                id: `composition-api-${String(textarea?.dataset?.codeTitle || "js")}`,
                name: "__composition_builder_api__.d.ts",
                content: this.buildCodeEditorApiDts(textarea, completions),
                enabled: true
            }
        ];
    }

    refreshCodeEditors() {
        const textareas = Array.from(document.querySelectorAll("textarea[data-code-editor]"));
        const alive = new Set(textareas);
        for (const [ta, editor] of this.codeEditors.entries()) {
            if (!alive.has(ta) || !document.body.contains(ta)) {
                try {
                    editor.dispose();
                } catch {
                }
                this.codeEditors.delete(ta);
                if (this.pendingCodeApplyOpts instanceof Map) this.pendingCodeApplyOpts.delete(ta);
            }
        }
        for (const ta of textareas) {
            const completions = this.getCodeEditorCompletions(ta);
            const libs = this.buildCodeEditorLibs(ta, completions);
            const title = String(ta.dataset.codeTitle || "代码编辑");
            const validate = (source) => this.validateCodeEditorSource(ta, source);
            const existing = this.codeEditors.get(ta);
            if (existing) {
                existing.setCompletions(completions);
                existing.setValidator(validate);
                existing.setLibs(libs);
                continue;
            }
            const editor = new InlineCodeEditor({
                textarea: ta,
                title,
                completions,
                autoSuggestMin: 1,
                validate,
                libs
            });
            this.codeEditors.set(ta, editor);
        }
    }

    getCodeEditorCompletions(textarea) {
        const isControllerScript = this.isControllerScriptEditor(textarea);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const mappingTarget = getCompositionKotlinTarget(this.state.mapping);
        const scopeInfo = this.getCodeEditorScopeInfo(textarea);
        const allowGrowthApi = this.isGrowthApiAllowedForCodeEditor(textarea);
        const base = isControllerScript
            ? [
                { label: "if (...) { ... }", insertText: "if ($0) {\\n    \\n}", detail: "条件分支", priority: 220 },
                { label: "addSingle()", insertText: "addSingle()", detail: "粒子生成 API", priority: 230 },
                { label: "addMultiple(n)", insertText: "addMultiple($0)", detail: "粒子生成 API", priority: 230 },
                { label: "color = Vector3f()", insertText: "color = Vector3f($0)", detail: "粒子颜色", priority: 255 },
                { label: "size = 0.2", insertText: "size = $0", detail: "粒子大小", priority: 255 },
                { label: "particleAlpha = 1.0", insertText: "particleAlpha = $0", detail: "粒子透明度", priority: 255 },
                { label: "currentAge = 0", insertText: "currentAge = $0", detail: "粒子年龄", priority: 250 },
                { label: "textureSheet = 0", insertText: "textureSheet = $0", detail: "贴图序号", priority: 250 },
                { label: "particle.particleColor = Vector3f()", insertText: "particle.particleColor = Vector3f($0)", detail: "粒子颜色", priority: 250 },
                { label: "particle.particleSize = 0.2", insertText: "particle.particleSize = $0", detail: "粒子大小", priority: 250 },
                { label: "particle.particleAlpha = 1.0", insertText: "particle.particleAlpha = $0", detail: "粒子透明度", priority: 250 },
                { label: "status.displayStatus = 2", insertText: "status.displayStatus = $0", detail: "Composition lifecycle", priority: 258 },
                { label: `this@${projectClass}.status.displayStatus`, insertText: `this@${projectClass}.status.displayStatus`, detail: "Composition lifecycle", priority: 257 },
                { label: "RelativeLocation(x, y, z)", insertText: "RelativeLocation($0)", detail: "向量构造", priority: 220 },
                { label: `${mappingTarget.vec3Type}(x, y, z)`, insertText: `${mappingTarget.vec3Type}($0)`, detail: "向量构造", priority: 220 },
                { label: "Vector3f(x, y, z)", insertText: "Vector3f($0)", detail: "向量构造", priority: 220 },
                { label: "PI", detail: "数学常量", priority: 210 },
                { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 180 },
                { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 180 },
                { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 180 },
                { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Random.nextInt(until)", insertText: "Random.nextInt($0)", detail: "随机整数 [0, until)", priority: 200 },
                { label: "Random.nextInt(from, until)", insertText: "Random.nextInt($0, )", detail: "随机整数 [from, until)", priority: 199 },
                { label: "Random.nextDouble(until)", insertText: "Random.nextDouble($0)", detail: "随机浮点 [0, until)", priority: 198 },
                { label: "Random.nextDouble(from, until)", insertText: "Random.nextDouble($0, )", detail: "随机浮点 [from, until)", priority: 197 },
                { label: "Random.nextFloat(until)", insertText: "Random.nextFloat($0)", detail: "随机浮点 [0, until)", priority: 196 },
                { label: "Random.nextBoolean()", insertText: "Random.nextBoolean()", detail: "随机布尔", priority: 195 }
            ]
            : [
                { label: "if (...) { ... }", insertText: "if ($0) {\\n    \\n}", detail: "条件分支", priority: 140 },
                { label: "rotateToPoint(to)", insertText: "rotateToPoint($0)", detail: "Display API", priority: 260 },
                { label: "rotateAsAxis(angle)", insertText: "rotateAsAxis($0)", detail: "Display API", priority: 260 },
                { label: "rotateToWithAngle(to, angle)", insertText: "rotateToWithAngle($0, 0.05)", detail: "Display API", priority: 260 },
                { label: "addSingle()", insertText: "addSingle()", detail: "粒子生成 API", priority: 260 },
                { label: "addMultiple(n)", insertText: "addMultiple($0)", detail: "粒子生成 API", priority: 260 },
                { label: "addPreTickAction(() => {})", insertText: "addPreTickAction(() => {\\n    $0\\n})", detail: "控制器 API", priority: 220 },
                { label: "RelativeLocation(x, y, z)", insertText: "RelativeLocation($0)", detail: "向量构造", priority: 225 },
                { label: `${mappingTarget.vec3Type}(x, y, z)`, insertText: `${mappingTarget.vec3Type}($0)`, detail: "向量构造", priority: 225 },
                { label: "Vector3f(x, y, z)", insertText: "Vector3f($0)", detail: "向量构造", priority: 225 },
                { label: "RelativeLocation.yAxis()", insertText: "RelativeLocation.yAxis()", detail: "轴向向量", priority: 225 },
                { label: "setReversedScaleOnCompositionStatus(comp)", insertText: "setReversedScaleOnCompositionStatus($0)", detail: "Scale API", priority: 215 },
                { label: "particle.particleAlpha", detail: "粒子属性", priority: 240 },
                { label: "particle.particleColor", detail: "粒子属性", priority: 240 },
                { label: "particle.particleSize", detail: "粒子属性", priority: 240 },
                { label: "age", detail: "当前 age", priority: 250 },
                { label: "tick", detail: "当前 tick", priority: 250 },
                { label: "index", detail: "点索引", priority: 250 },
                { label: "status.displayStatus", detail: "当前 Composition 状态", priority: 252 },
                { label: `this@${projectClass}.status.displayStatus`, insertText: `this@${projectClass}.status.displayStatus`, detail: "Composition state (qualified)", priority: 251 },
                { label: "PI", detail: "数学常量", priority: 230 },
                { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 180 },
                { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 180 },
                { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 180 },
                { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Random.nextInt(until)", insertText: "Random.nextInt($0)", detail: "随机整数 [0, until)", priority: 200 },
                { label: "Random.nextInt(from, until)", insertText: "Random.nextInt($0, )", detail: "随机整数 [from, until)", priority: 199 },
                { label: "Random.nextDouble(until)", insertText: "Random.nextDouble($0)", detail: "随机浮点 [0, until)", priority: 198 },
                { label: "Random.nextDouble(from, until)", insertText: "Random.nextDouble($0, )", detail: "随机浮点 [from, until)", priority: 197 },
                { label: "Random.nextFloat(until)", insertText: "Random.nextFloat($0)", detail: "随机浮点 [0, until)", priority: 196 },
                { label: "Random.nextBoolean()", insertText: "Random.nextBoolean()", detail: "随机布尔", priority: 195 }
            ];
        const scopeMaxDepthRaw = Number(scopeInfo.maxShapeDepth);
        const hasScopedShapeVars = scopeInfo.allowRel
            || scopeInfo.allowOrder
            || (Number.isFinite(scopeMaxDepthRaw) && int(scopeMaxDepthRaw) >= 0);
        if (hasScopedShapeVars) {
            if (scopeInfo.allowRel) {
                base.push({ label: "rel", detail: "当前层级的父级 rel", priority: 248 });
            }
            if (scopeInfo.allowOrder) {
                base.push({ label: "order", detail: "当前层级的父级 order（Sequenced）", priority: 248 });
            }
            const scopeMaxDepth = scopeMaxDepthRaw;
            const maxDepth = Number.isFinite(scopeMaxDepth)
                ? Math.max(-1, int(scopeMaxDepth))
                : -1;
            const seqDepth = new Set(
                Array.isArray(scopeInfo.sequencedDepths)
                    ? scopeInfo.sequencedDepths.map((it) => int(it))
                    : []
            );
            for (let d = 0; d <= maxDepth; d++) {
                base.push({ label: `shapeRel${d}`, detail: `shape 层 ${d} 的父级 rel`, priority: 246 - Math.min(d, 8) });
                if (seqDepth.has(d)) {
                    base.push({ label: `shapeOrder${d}`, detail: `shape 层 ${d} 的父级 order（Sequenced）`, priority: 245 - Math.min(d, 8) });
                }
            }
        }
        const isProjectDisplayExpr = !isControllerScript
            && String(textarea?.dataset?.displayField || "") === "expression"
            && !String(textarea?.dataset?.cardId || "").trim();
        if (isProjectDisplayExpr && this.hasManualProjectScaleHelper()) {
            base.push(
                {
                    label: "scaleHelper.doScale()",
                    insertText: "scaleHelper.doScale()",
                    detail: "项目缩放助手 API（手动模式）",
                    priority: 262
                },
                {
                    label: "scaleHelper.doScaleReversed()",
                    insertText: "scaleHelper.doScaleReversed()",
                    detail: "项目缩放助手 API（手动模式）",
                    priority: 262
                }
            );
        }
        if (!allowGrowthApi) {
            for (let i = base.length - 1; i >= 0; i--) {
                const raw = String(base[i]?.insertText || base[i]?.label || "");
                if (/^addSingle\s*\(/.test(raw) || /^addMultiple\s*\(/.test(raw)) {
                    base.splice(i, 1);
                }
            }
        }

        const vars = [];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            if (!name) continue;
            vars.push({ label: name, detail: "全局变量", priority: 210 });
            vars.push({
                label: `this@${projectClass}.${name}`,
                insertText: `this@${projectClass}.${name}`,
                detail: "全局变量（限定访问）",
                priority: 208
            });
            if (String(g.type || "").trim() === "Vec3" || String(g.type || "").trim() === "Vector3f") {
                vars.push({ label: `${name}.asRelative()`, detail: "Vec3/Vector3f -> Relative", priority: 205 });
            }
        }
        if (!isControllerScript) {
            for (const c of this.state.globalConsts) {
                const name = String(c.name || "").trim();
                if (!name) continue;
                vars.push({ label: name, detail: "全局常量", priority: 205 });
            }
        }

        const cardVars = [];
        const cardId = String(textarea.dataset.cardId || "");
        const treePath = String(textarea.dataset.treePath || "");
        for (const it of this.resolveCodeEditorControllerVars(cardId, treePath)) {
            const name = String(it.name || "").trim();
            if (!name) continue;
            cardVars.push({ label: name, detail: "控制器局部变量", priority: 245 });
        }
        return mergeCompletionGroups(base, vars, cardVars);
    }

    onKeydown(e) {
        if (this.hotkeyCaptureActionId) {
            e.preventDefault();
            e.stopPropagation();
            if (e.code === "Escape") {
                this.hotkeyCaptureActionId = null;
                this.dom.hkHint.textContent = "点击“设置”后按下按键（Esc 取消，Backspace 清空）。";
                return;
            }
            if (e.code === "Backspace" || e.code === "Delete") {
                this.state.hotkeys.actions[this.hotkeyCaptureActionId] = "";
                this.hotkeyCaptureActionId = null;
                this.renderHotkeysList();
                this.scheduleSave();
                this.dom.hkHint.textContent = "快捷键已清空。";
                return;
            }
            const hk = eventToHotkey(e);
            if (!hk) return;
            this.state.hotkeys.actions[this.hotkeyCaptureActionId] = hk;
            this.hotkeyCaptureActionId = null;
            this.renderHotkeysList();
            this.scheduleSave();
            this.dom.hkHint.textContent = `已设置为 ${hotkeyToHuman(hk)}`;
            return;
        }

        if (e.key === "Escape" && this.closeAnyModalWithEsc()) {
            e.preventDefault();
            return;
        }
        const h = this.state.hotkeys.actions || {};
        const hit = (id) => hotkeyMatchEvent(e, h[id] || "");
        const modalOpen = this.isModalOpen();
        if (handleCompositionHistoryShortcut(e, {
            modalOpen,
            textEditing: this.isTextEditingTarget(e.target),
            undoMatched: hit("undo"),
            redoMatched: hit("redo"),
            undo: () => this.undo(),
            redo: () => this.redo()
        })) return;
        if (this.isEditableTarget(e.target)) return;
        if (modalOpen) return;
        if (hit("switchEditor")) {
            e.preventDefault();
            this.switchPage("editor");
            return;
        }
        if (hit("switchCode")) {
            e.preventDefault();
            this.switchPage("code");
            return;
        }
        if (hit("toggleSettings")) {
            e.preventDefault();
            if (this.dom.settingsModal.classList.contains("hidden")) this.showSettings();
            else this.hideSettings();
            return;
        }
        if (hit("toggleHotkeys")) {
            e.preventDefault();
            if (this.dom.hkModal.classList.contains("hidden")) this.showHotkeys();
            else this.hideHotkeys();
            return;
        }
        if (hit("addCard")) {
            e.preventDefault();
            this.addCard();
            return;
        }
        if (hit("deleteCard")) {
            e.preventDefault();
            this.deleteSelectedCards();
            return;
        }
        if (hit("generateCode")) {
            e.preventDefault();
            this.generateCodeAndRender(true);
            return;
        }
        if (hit("copyCode")) {
            e.preventDefault();
            this.copyCode();
            return;
        }
        if (hit("toggleRealtime")) {
            e.preventDefault();
            this.setRealtimeCode(!this.state.settings.realtimeCode);
            return;
        }
        if (hit("fullscreen")) {
            e.preventDefault();
            this.toggleFullscreen();
            return;
        }
        if (hit("openMeasureTool")) {
            e.preventDefault();
            this.previewDistanceTool?.toggleMeasureMode();
            return;
        }
        if (hit("openBuilderEditor")) {
            e.preventDefault();
            const card = this.getFocusedCard() || this.state.cards[0];
            if (card) this.openBuilderEditor(card.id);
        }
    }

    closeAnyModalWithEsc() {
        if (!this.dom.nodePresetModal?.classList.contains("hidden")) {
            this.hideNodePresetModal();
            return true;
        }
        if (!this.dom.cardPresetModal?.classList.contains("hidden")) {
            this.hideCardPresetModal();
            return true;
        }
        if (!this.dom.builderModal.classList.contains("hidden")) {
            this.hideBuilderModal();
            return true;
        }
        if (!this.dom.hkModal.classList.contains("hidden")) {
            this.hideHotkeys();
            return true;
        }
        if (!this.dom.settingsModal.classList.contains("hidden")) {
            this.hideSettings();
            return true;
        }
        return false;
    }

    isModalOpen() {
        return !this.dom.cardPresetModal?.classList.contains("hidden")
            || !this.dom.nodePresetModal?.classList.contains("hidden")
            || !this.dom.settingsModal.classList.contains("hidden")
            || !this.dom.hkModal.classList.contains("hidden")
            || !this.dom.builderModal.classList.contains("hidden");
    }

    isEditableTarget(target) {
        const isEditableNode = (node) => {
            if (!(node instanceof Element) || typeof node.closest !== "function") return false;
            if (node.closest("input, textarea, select, [contenteditable='true']")) return true;
            if (node.closest("[role='textbox'], [role='combobox']")) return true;
            if (node.closest(".editor-shell-monaco, .editor-monaco-host, .monaco-editor")) return true;
            if (node.closest(".suggest-widget, .monaco-hover, .monaco-menu-container")) return true;
            return false;
        };
        if (isEditableNode(target)) return true;
        if (isEditableNode(document.activeElement)) return true;
        const focusedMonaco = document.querySelector(".editor-shell-monaco .monaco-editor.focused");
        return !!focusedMonaco;
    }

    isTextEditingTarget(target) {
        return isCompositionTextEditingTarget(target, document.activeElement, {
            ElementCtor: Element,
            hasFocusedMonaco: () => !!document.querySelector(".editor-shell-monaco .monaco-editor.focused")
        });
    }

    startCompositionReferenceSamplerFromQuery() {
        let params = null;
        try {
            params = new URLSearchParams(globalThis.location?.search || "");
        } catch {
            return;
        }
        if (params.get("referenceSampler") !== "1") return;
        const cardId = String(params.get("card") || "").trim();
        const card = this.getCardById(cardId);
        if (!card) {
            try { globalThis.frameElement?.remove?.(); } catch {}
            try { globalThis.close?.(); } catch {}
            return;
        }
        const target = normalizeBuilderTarget(params.get("target") || "root");
        this.builderModalCardId = card.id;
        this.builderModalTarget = target;
        const pending = this.scheduleBuilderCompositionReferenceSnapshot(card, target);
        pending?.finally?.(() => {
            try {
                const shell = globalThis.cooParticlesShell || globalThis.parent?.cooParticlesShell || globalThis.top?.cooParticlesShell;
                if (shell?.isElectron === true) {
                    void shell.closeWindow?.();
                } else {
                    try {
                        const frame = globalThis.frameElement;
                        const host = globalThis.parent;
                        frame?.remove?.();
                        if (host?.__cooCompositionReferenceSamplerFrame === frame) {
                            delete host.__cooCompositionReferenceSamplerFrame;
                        }
                    } catch {}
                    globalThis.close?.();
                }
            } catch {}
        });
    }

    openBuilderEditor(cardId, target = "root") {
        const card = this.getCardById(cardId || this.focusedCardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        const compositionRevision = compositionReferenceStateRevision(this.state);
        this.builderModalCardId = card.id;
        this.builderModalTarget = normalizedTarget;
        // 进入 PointsBuilder 不强制同步重建 Composition；在空闲任务中准备参考快照，完成后再切换页面。
        this.seedBuilderSandbox(card, normalizedTarget);
        this.saveStateNow();
        let contextSnapshot = null;
        let contextSnapshotStatus = "";
        try {
            const raw = localStorage.getItem(CPB_COMP_CONTEXT_KEY);
            const contextPayload = raw ? JSON.parse(raw) : null;
            contextSnapshot = contextPayload?.compositionReference || null;
            contextSnapshotStatus = String(contextPayload?.compositionReferenceStatus || "");
        } catch {
            contextSnapshot = null;
            contextSnapshotStatus = "";
        }
        const snapshotReady = !!contextSnapshot
            && String(contextSnapshot.referenceVersion || "") === COMPOSITION_REFERENCE_BUILD_VERSION
            && String(contextSnapshot.compositionRevision || "") === compositionRevision
            && contextSnapshot.complete !== false
            && contextSnapshotStatus === "ready"
            && ((Array.isArray(contextSnapshot.frames) && contextSnapshot.frames.length > 0)
                || (contextSnapshot.storage === "indexeddb" && String(contextSnapshot.storageKey || "").trim()))
            && String(contextSnapshot.currentCardId || "") === String(card.id || "")
            && normalizeBuilderTarget(contextSnapshot.currentTarget || "root") === normalizedTarget;
        const buildEditorHref = () => {
            const q = new URLSearchParams({
                card: card.id,
                return: "composition_builder.html",
                target: normalizedTarget,
                compositionRevision,
                t: String(Date.now())
            });
            try {
                const current = new URLSearchParams(globalThis.location?.search || "");
                for (const key of ["projectId", "projectType", "shellOpen", "shellNew"]) {
                    const value = current.get(key);
                    if (value) q.set(key, value);
                }
            } catch {
            }
            return `./composition_pointsbuilder.html?${q.toString()}`;
        };
        const navigate = () => {
            const href = buildEditorHref();
            // Let the host SPA change route. Navigating only this iframe leaves
            // Composition mounted and makes the editor appear as a second page.
            if (typeof window.__legacyNavigate === "function") {
                window.__legacyNavigate(href);
                return;
            }
            window.location.href = href;
        };
        if (snapshotReady) {
            navigate();
            return;
        }
        const samplerQuery = new URLSearchParams({
            referenceSampler: "1",
            card: card.id,
            target: normalizedTarget,
            t: String(Date.now())
        });
        try {
            const current = new URLSearchParams(globalThis.location?.search || "");
            for (const key of ["projectId", "projectType", "shellOpen", "shellNew"]) {
                const value = current.get(key);
                if (value) samplerQuery.set(key, value);
            }
        } catch {
        }
        const samplerHref = (() => {
            try {
                const url = new URL("./composition_builder.html", globalThis.location?.href || "");
                url.search = samplerQuery.toString();
                return url.href;
            } catch {
                return `./composition_builder.html?${samplerQuery.toString()}`;
            }
        })();
        const shell = globalThis.cooParticlesShell || globalThis.parent?.cooParticlesShell || globalThis.top?.cooParticlesShell;
        if (shell?.isElectron === true) {
            if (typeof window.open === "function") {
                window.open(`./composition_builder.html?${samplerQuery.toString()}`, "coo-particles-composition-reference-sampler");
            }
            navigate();
            return;
        }
        // Keep the editor in the SPA while a host-level hidden iframe owns the
        // sampler document. The host survives the route change, so the full
        // snapshot can finish without opening a visible second page.
        try {
            const host = globalThis.top && globalThis.top !== globalThis
                ? globalThis.top
                : globalThis.parent && globalThis.parent !== globalThis
                    ? globalThis.parent
                    : null;
            const hostDocument = host?.document;
            if (hostDocument?.body && typeof hostDocument.createElement === "function") {
                const previous = host.__cooCompositionReferenceSamplerFrame;
                if (previous?.isConnected) previous.remove();
                const frame = hostDocument.createElement("iframe");
                frame.src = samplerHref;
                frame.title = "";
                frame.setAttribute("aria-hidden", "true");
                frame.tabIndex = -1;
                frame.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
                host.__cooCompositionReferenceSamplerFrame = frame;
                hostDocument.body.appendChild(frame);
            }
        } catch {
        }
        navigate();
    }

    async consumeBuilderReturnState(options = {}) {
        let cardId = "";
        let target = "root";
        try {
            cardId = String(localStorage.getItem(CPB_RETURN_CARD_KEY) || "").trim();
            target = normalizeBuilderTarget(localStorage.getItem(CPB_RETURN_TARGET_KEY) || "root");
            if (!cardId) return;
            localStorage.removeItem(CPB_RETURN_CARD_KEY);
            localStorage.removeItem(CPB_RETURN_TARGET_KEY);
        } catch {
            return;
        }
        // The return payload is bound to the card that opened PointsBuilder.
        // Never fall back to the focused/first card: a stale or delayed return
        // must be ignored rather than applying card 2's model to card 3.
        const card = this.getCardById(cardId);
        const expectedRevision = compositionReferenceStateRevision(this.state);
        let state = null;
        if (card) {
            try {
                const latest = await loadLatestAutoStatePayload({
                    storageKey: CPB_STATE_KEY,
                    expectedContext: {
                        cardId: card.id,
                        target,
                        compositionRevision: expectedRevision
                    }
                });
                state = latest?.state ? normalizeBuilderState(latest.state) : null;
            } catch {
                state = null;
            }
            if (!state) state = this.readBuilderSandboxState(card.id, target, expectedRevision);
        }
        if (!card || !state) {
            if (options?.closeModal === true) this.hideBuilderModal();
            this.showToast("Builder 返回状态与当前卡片不匹配，已忽略", "error");
            return;
        }
        // Returning from PointsBuilder only transfers the edited point model.
        // Do not silently change a card that was using manual point semantics.
        if (options?.pushHistory === true) this.pushHistory();
        this.setCardBuilderState(card, target, state, { activateBinding: false });
        this.focusedCardId = card.id;
        this.selectedCardIds = new Set([card.id]);
        this.selectionAnchorCardId = card.id;
        if (this.renderer && this.pointsGeom) {
            this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
        } else {
            this.saveStateNow();
        }
        if (options?.closeModal === true) this.hideBuilderModal();
        let msg = "已返回 PointsBuilder 并加载根 Builder";
        if (target === "shape") msg = "已返回并加载 Shape Builder";
        if (/^tree_node:/.test(target)) {
            msg = "已返回并加载子节点 Builder";
        }
        this.showToast(msg, "success");
    }

    seedBuilderSandbox(card, target = "root") {
        try {
            const normalizedTarget = normalizeBuilderTarget(target);
            const builderState = this.resolveCardBuilderState(card, normalizedTarget);
            localStorage.setItem(CPB_STATE_KEY, JSON.stringify({
                state: normalizeBuilderState(builderState),
                context: {
                    cardId: String(card.id || ""),
                    target: normalizedTarget,
                    compositionRevision: compositionReferenceStateRevision(this.state)
                },
                ts: Date.now()
            }));
            localStorage.setItem(CPB_PROJECT_KEY, sanitizeFileBase(card.name || this.state.projectName || "Builder"));
            /*
             * 不在此处写入主题。该键现在属于应用级全局主题；若每次打开内嵌
             * PointsBuilder 都写入项目默认值，会覆盖用户选择并在下次启动时表现为重置。
             * 内嵌 Builder 会自行读取全局主题键。
             */
            let previous = null;
            try {
                const raw = localStorage.getItem(CPB_COMP_CONTEXT_KEY);
                previous = raw ? JSON.parse(raw) : null;
            } catch {
                previous = null;
            }
            const snapshot = previous?.compositionReference;
            const compositionRevision = compositionReferenceStateRevision(this.state);
            const snapshotMatchesTarget = !!snapshot
                && String(snapshot.referenceVersion || "") === COMPOSITION_REFERENCE_BUILD_VERSION
                && String(snapshot.compositionRevision || previous?.compositionReferenceRevision || "") === compositionRevision
                && String(snapshot.currentCardId || "") === String(card.id || "")
                && normalizeBuilderTarget(snapshot.currentTarget || "root") === normalizedTarget
                && compositionReferenceSnapshotHasPoints(snapshot)
                && ((Array.isArray(snapshot.frames) && snapshot.frames.length > 0)
                    || (snapshot.storage === "indexeddb" && String(snapshot.storageKey || "").trim()));
            // Publish a real static Tick 0 fallback before navigation. The full
            // sampler may finish later, but the editor must never open empty.
            const fallbackSnapshot = snapshotMatchesTarget
                ? snapshot
                : (() => {
                    const fallback = this.buildBuilderCompositionReferenceFallbackSnapshot?.(card.id, normalizedTarget);
                    return fallback
                        ? {
                            ...fallback,
                            referenceVersion: COMPOSITION_REFERENCE_BUILD_VERSION,
                            compositionRevision,
                            complete: true
                        }
                        : null;
                })();
            const hasSnapshot = previous?.compositionReferenceStatus === "ready" && snapshotMatchesTarget;
            this.writeBuilderCompositionContext(card, normalizedTarget, hasSnapshot ? {} : {
                compositionReferenceOverride: fallbackSnapshot,
                compositionReferenceStatus: "pending"
            });
        } catch (e) {
            console.warn("seed builder sandbox failed:", e);
        }
    }

    resolveCardBuilderState(card, target = "root") {
        if (!card) return createDefaultBuilderState();
        const normalizedTarget = normalizeBuilderTarget(target);
        if (/^tree_node:/.test(normalizedTarget)) {
            const treePath = JSON.parse(normalizedTarget.split("tree_node:")[1] || "[]");
            const node = this.getShapeNodeByPath(card, treePath);
            return normalizeBuilderState(node?.builderState);
        }
        if (normalizedTarget === "shape") return normalizeBuilderState(card.shapeBuilderState);
        return normalizeBuilderState(card.builderState);
    }

    setCardBuilderState(card, target = "root", state = null, options = {}) {
        if (!card) return;
        const next = normalizeBuilderState(state);
        const normalizedTarget = normalizeBuilderTarget(target);
        const activateBinding = options?.activateBinding !== false;
        if (/^tree_node:/.test(normalizedTarget)) {
            const treePath = JSON.parse(normalizedTarget.split("tree_node:")[1] || "[]");
            const node = this.getShapeNodeByPath(card, treePath);
            if (!node) return;
            if (activateBinding) node.bindMode = "builder";
            node.builderState = next;
            return;
        }
        if (normalizedTarget === "shape") {
            if (activateBinding) card.shapeBindMode = "builder";
            card.shapeBuilderState = next;
            return;
        }
        if (activateBinding) card.bindMode = "builder";
        card.builderState = next;
    }

    showBuilderModal() {
        this.dom.builderModal.classList.remove("hidden");
        this.dom.builderMask.classList.remove("hidden");
    }

    hideBuilderModal() {
        this.dom.builderModal.classList.add("hidden");
        this.dom.builderMask.classList.add("hidden");
        this.builderModalCardId = null;
        this.builderModalTarget = "root";
    }

    parseBezierToolTreePath(raw) {
        let value = raw;
        for (let i = 0; i < 3; i++) {
            if (Array.isArray(value)) return value;
            if (typeof value !== "string") break;
            const text = value.trim();
            if (!text) return [];
            try {
                value = JSON.parse(text);
            } catch {
                return [];
            }
        }
        return Array.isArray(value) ? value : [];
    }

    getBezierToolScaleConfig(scope = "project", cardId = "") {
        const adaptLegacyX = (cfg) => {
            const tick = Math.max(1, int(cfg.tick || 18));
            const x1 = num(cfg.c1x);
            const x2 = num(cfg.c2x);
            if (Math.abs(x1) <= 1 && Math.abs(x2) <= 1) {
                cfg.c1x = x1 * tick;
                cfg.c2x = x2 * tick;
            }
            cfg.tick = tick;
            cfg.c1x = clamp(num(cfg.c1x), 0, tick);
            cfg.c2x = clamp(num(cfg.c2x), 0, tick);
            return cfg;
        };
        if (scope === "card") {
            const card = this.getCardById(cardId);
            if (!card) return normalizeScaleHelperConfig({ type: "bezier" }, { type: "bezier" });
            return adaptLegacyX(normalizeScaleHelperConfig(card.shapeScale, { type: "bezier" }));
        }
        if (scope === "tree_node") {
            const card = this.getCardById(cardId);
            if (!card) return normalizeScaleHelperConfig({ type: "bezier" }, { type: "bezier" });
            const treePath = this.parseBezierToolTreePath(this.bezierToolTarget?.treePath || "[]");
            const node = this.getShapeNodeByPath(card, treePath);
            return adaptLegacyX(normalizeScaleHelperConfig(node?.scale, { type: "bezier" }));
        }
        return adaptLegacyX(normalizeScaleHelperConfig(this.state.projectScale, { type: "bezier" }));
    }

    getBezierToolAngleEaseConfig(scope = "card", cardId = "", treePathRaw = "") {
        let source = null;
        if (scope === "card") {
            source = this.getCardById(cardId);
        } else if (scope === "tree_node") {
            const card = this.getCardById(cardId);
            if (card) {
                const treePath = this.parseBezierToolTreePath(treePathRaw);
                source = this.getShapeNodeByPath(card, treePath);
            }
        }
        const params = normalizeAngleOffsetEaseSpecialParams(source || {});
        return {
            min: 0,
            max: 1,
            tick: 1,
            c1x: num(params.angleOffsetEaseBezierStartX),
            c1y: num(params.angleOffsetEaseBezierStartY),
            c1z: 0,
            c2x: num(params.angleOffsetEaseBezierEndX),
            c2y: num(params.angleOffsetEaseBezierEndY),
            c2z: 0
        };
    }

    getScaleBezierConfigForScope(scope = "project", cardId = "", treePathRaw = "") {
        if (scope === "card") {
            const card = this.getCardById(cardId);
            return card ? normalizeScaleHelperConfig(card.shapeScale, { type: "none" }) : null;
        }
        if (scope === "tree_node") {
            const card = this.getCardById(cardId);
            if (!card) return null;
            const treePath = this.parseBezierToolTreePath(treePathRaw || "[]");
            const node = this.getShapeNodeByPath(card, treePath);
            return node ? normalizeScaleHelperConfig(node.scale, { type: "none" }) : null;
        }
        return normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
    }

    normalizeScaleBezierClipboardParams(raw) {
        const cfg = normalizeScaleHelperConfig(Object.assign({ type: "bezier" }, raw || {}), { type: "bezier" });
        return {
            min: num(cfg.min),
            max: num(cfg.max),
            tick: Math.max(1, int(cfg.tick || 1)),
            c1x: num(cfg.c1x),
            c1y: num(cfg.c1y),
            c1z: num(cfg.c1z),
            c2x: num(cfg.c2x),
            c2y: num(cfg.c2y),
            c2z: num(cfg.c2z)
        };
    }

    buildScaleBezierClipboardText(scale) {
        return JSON.stringify({
            type: "composition-scale-bezier",
            version: 1,
            params: this.normalizeScaleBezierClipboardParams(scale)
        }, null, 2);
    }

    parseScaleBezierClipboardText(text) {
        const rawText = String(text || "").trim();
        if (!rawText) throw new Error("剪贴板为空");
        let parsed = null;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            throw new Error("剪贴板内容不是有效 JSON");
        }
        const keys = ["min", "max", "tick", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"];
        const candidates = [];
        if (parsed && typeof parsed === "object") {
            candidates.push(parsed);
            if (parsed.params && typeof parsed.params === "object") candidates.push(parsed.params);
            if (parsed.payload && typeof parsed.payload === "object") {
                candidates.push(parsed.payload);
                if (parsed.payload.params && typeof parsed.payload.params === "object") candidates.push(parsed.payload.params);
            }
        }
        const picked = candidates.find((it) => keys.some((key) => it[key] !== undefined));
        if (!picked) throw new Error("剪贴板内容缺少缩放贝塞尔参数");
        return this.normalizeScaleBezierClipboardParams(picked);
    }

    async writeClipboardText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const ta = document.createElement("textarea");
        ta.value = String(text || "");
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    }

    async readClipboardText(promptMessage = "请从剪贴板粘贴缩放贝塞尔参数 JSON：") {
        let clipboardError = null;
        if (navigator.clipboard?.readText) {
            try {
                return await navigator.clipboard.readText();
            } catch (e) {
                clipboardError = e;
            }
        }
        const manual = window.prompt(promptMessage, "");
        if (manual !== null) return manual;
        if (clipboardError) throw clipboardError;
        throw new Error("已取消粘贴");
    }

    getScaleBezierScopeLabel(scope = "project") {
        if (scope === "card") return "卡片缩放助手";
        if (scope === "tree_node") return "节点缩放助手";
        return "项目缩放助手";
    }

    async copyScaleBezierParams(scope = "project", cardId = "", treePathRaw = "") {
        try {
            const scale = this.getScaleBezierConfigForScope(scope, cardId, treePathRaw);
            if (!scale) throw new Error(`${this.getScaleBezierScopeLabel(scope)}不存在`);
            if (String(scale.type || "none") !== "bezier") {
                throw new Error(`${this.getScaleBezierScopeLabel(scope)}不是 Bezier 类型`);
            }
            await this.writeClipboardText(this.buildScaleBezierClipboardText(scale));
            this.showToast(`${this.getScaleBezierScopeLabel(scope)}参数已复制`, "success");
            return true;
        } catch (e) {
            this.showToast(`复制失败: ${e?.message || e}`, "error");
            return false;
        }
    }

    async pasteScaleBezierParams(scope = "project", cardId = "", treePathRaw = "") {
        try {
            const params = this.parseScaleBezierClipboardText(await this.readClipboardText());
            if (scope === "card") {
                const card = this.getCardById(cardId);
                if (!card) throw new Error("卡片不存在");
                this.pushHistory();
                const scale = Object.assign({}, normalizeScaleHelperConfig(card.shapeScale, { type: "none" }), params);
                scale.type = "bezier";
                scale.runMode = "auto";
                card.shapeScale = scale;
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                this.showToast("已粘贴到卡片缩放助手", "success");
                return true;
            }
            if (scope === "tree_node") {
                const card = this.getCardById(cardId);
                if (!card) throw new Error("卡片不存在");
                const treePath = this.parseBezierToolTreePath(treePathRaw || "[]");
                const node = this.getShapeNodeByPath(card, treePath);
                if (!node) throw new Error("节点不存在");
                this.pushHistory();
                const scale = Object.assign({}, normalizeScaleHelperConfig(node.scale, { type: "none" }), params);
                scale.type = "bezier";
                scale.runMode = "auto";
                node.scale = scale;
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                this.showToast("已粘贴到节点缩放助手", "success");
                return true;
            }
            this.pushHistory();
            const scale = Object.assign({}, normalizeScaleHelperConfig(this.state.projectScale, { type: "none" }), params);
            scale.type = "bezier";
            this.state.projectScale = scale;
            this.afterValueMutate({ rerenderProject: true, rebuildPreview: true });
            this.showToast("已粘贴到项目缩放助手", "success");
            return true;
        } catch (e) {
            this.showToast(`粘贴失败: ${e?.message || e}`, "error");
            return false;
        }
    }

    openBezierTool(scope = "project", cardId = "", treePathOrLevelIdx = "", kind = "scale") {
        const normScope = scope === "card"
            ? "card"
            : (scope === "tree_node" ? "tree_node" : "project");
        const normKind = kind === "angle_ease" ? "angle_ease" : "scale";
        this.bezierToolTarget = {
            scope: normScope,
            cardId: String(cardId || ""),
            treePath: normScope === "tree_node" ? String(treePathOrLevelIdx || "[]") : "",
            kind: normKind
        };
        const cfg = normKind === "angle_ease"
            ? this.getBezierToolAngleEaseConfig(this.bezierToolTarget.scope, this.bezierToolTarget.cardId, this.bezierToolTarget.treePath)
            : this.getBezierToolScaleConfig(this.bezierToolTarget.scope, this.bezierToolTarget.cardId);
        if (this.dom.bezierFrame) {
            const q = new URLSearchParams({
                theme: normalizeWorkbenchTheme(this.state.settings.theme),
                min: String(num(cfg.min)),
                max: String(num(cfg.max)),
                tick: String(Math.max(1, int(cfg.tick || 18))),
                mode: normKind,
                c1x: String(num(cfg.c1x)),
                c1y: String(num(cfg.c1y)),
                c1z: String(num(cfg.c1z)),
                c2x: String(num(cfg.c2x)),
                c2y: String(num(cfg.c2y)),
                c2z: String(num(cfg.c2z))
            });
            this.dom.bezierFrame.src = `./assets/composition_builder/bezier_tool.html?${q.toString()}&t=${Date.now()}`;
        }
        this.dom.bezierModal?.classList.remove("hidden");
        this.dom.bezierMask?.classList.remove("hidden");
    }

    closeBezierTool() {
        this.dom.bezierModal?.classList.add("hidden");
        this.dom.bezierMask?.classList.add("hidden");
    }

    applyBezierToolAndClose() {
        if (this.applyBezierTool()) {
            this.closeBezierTool();
        }
    }

    applyBezierTool() {
        const frame = this.dom.bezierFrame;
        if (!frame) return false;
        let data = null;
        try {
            if (typeof frame.contentWindow?.getBezierConfig === "function") {
                data = frame.contentWindow.getBezierConfig();
            }
        } catch {
            this.showToast("Bezier 工具未就绪", "error");
            return false;
        }
        if (!data || typeof data !== "object") {
            this.showToast("未读取到 Bezier 参数", "error");
            return false;
        }
        const tick = Math.max(1, int(data.tick || 18));
        const minValue = num(data.min);
        const maxValue = num(data.max);
        const c1xRaw = num(data.c1x);
        const c1y = num(data.c1y);
        const c1z = num(data.c1z);
        const c2xRaw = num(data.c2x);
        const c2y = num(data.c2y);
        const c2z = num(data.c2z);

        const target = this.bezierToolTarget || { scope: "project", cardId: "", treePath: "", kind: "scale" };
        const targetKind = target.kind === "angle_ease" ? "angle_ease" : "scale";
        const c1x = clamp(c1xRaw, 0, tick);
        const c2x = targetKind === "angle_ease"
            ? clamp(c2xRaw, -tick, 0)
            : clamp(c2xRaw, 0, tick);
        this.pushHistory();

        if (targetKind === "angle_ease") {
            const startX = tick > 0 ? c1x / tick : c1x;
            const endX = tick > 0 ? c2x / tick : c2x;
            if (target.scope === "card") {
                const card = this.getCardById(target.cardId);
                if (!card) {
                    this.showToast("卡片不存在", "error");
                    return false;
                }
                card.angleOffsetEase = "bezierEase";
                card.angleOffsetEaseBezierStartX = startX;
                card.angleOffsetEaseBezierStartY = c1y;
                card.angleOffsetEaseBezierEndX = endX;
                card.angleOffsetEaseBezierEndY = c2y;
                Object.assign(card, normalizeAngleOffsetEaseSpecialParams(card));
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                this.showToast("已应用到卡片相对角度缓动", "success");
                return true;
            }
            if (target.scope === "tree_node") {
                const card = this.getCardById(target.cardId);
                if (!card) {
                    this.showToast("卡片不存在", "error");
                    return false;
                }
                const treePath = this.parseBezierToolTreePath(target.treePath || "[]");
                const node = this.getShapeNodeByPath(card, treePath);
                if (!node) {
                    this.showToast("节点不存在", "error");
                    return false;
                }
                node.angleOffsetEase = "bezierEase";
                node.angleOffsetEaseBezierStartX = startX;
                node.angleOffsetEaseBezierStartY = c1y;
                node.angleOffsetEaseBezierEndX = endX;
                node.angleOffsetEaseBezierEndY = c2y;
                Object.assign(node, normalizeAngleOffsetEaseSpecialParams(node));
                this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
                this.showToast("已应用到节点相对角度缓动", "success");
                return true;
            }
            this.showToast("当前目标不支持相对角度 Bezier", "error");
            return false;
        }

        if (target.scope === "card") {
            const card = this.getCardById(target.cardId);
            if (!card) {
                this.showToast("卡片不存在", "error");
                return false;
            }
            card.shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "bezier" });
            card.shapeScale.type = "bezier";
            card.shapeScale.min = minValue;
            card.shapeScale.max = maxValue;
            card.shapeScale.tick = tick;
            card.shapeScale.c1x = c1x;
            card.shapeScale.c1y = c1y;
            card.shapeScale.c1z = c1z;
            card.shapeScale.c2x = c2x;
            card.shapeScale.c2y = c2y;
            card.shapeScale.c2z = c2z;
            this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
            this.showToast("已应用到卡片缩放助手", "success");
            return true;
        }
        if (target.scope === "tree_node") {
            const card = this.getCardById(target.cardId);
            if (!card) {
                this.showToast("卡片不存在", "error");
                return false;
            }
            const treePath = this.parseBezierToolTreePath(target.treePath || "[]");
            const node = this.getShapeNodeByPath(card, treePath);
            if (!node) {
                this.showToast("节点不存在", "error");
                return false;
            }
            node.scale = normalizeScaleHelperConfig(node.scale, { type: "bezier" });
            node.scale.type = "bezier";
            node.scale.min = minValue;
            node.scale.max = maxValue;
            node.scale.tick = tick;
            node.scale.c1x = c1x;
            node.scale.c1y = c1y;
            node.scale.c1z = c1z;
            node.scale.c2x = c2x;
            node.scale.c2y = c2y;
            node.scale.c2z = c2z;
            this.afterValueMutate({ rerenderCards: true, rebuildPreview: true });
            this.showToast("已应用到节点缩放助手", "success");
            return true;
        }
        this.state.projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "bezier" });
        this.state.projectScale.type = "bezier";
        this.state.projectScale.min = minValue;
        this.state.projectScale.max = maxValue;
        this.state.projectScale.tick = tick;
        this.state.projectScale.c1x = c1x;
        this.state.projectScale.c1y = c1y;
        this.state.projectScale.c1z = c1z;
        this.state.projectScale.c2x = c2x;
        this.state.projectScale.c2y = c2y;
        this.state.projectScale.c2z = c2z;
        this.afterValueMutate({ rerenderProject: true, rebuildPreview: true });
        this.showToast("已应用到项目缩放助手", "success");
        return true;
    }

    reloadBuilderFrame() {
        if (!this.builderModalCardId) return;
        const q = new URLSearchParams({
            card: String(this.builderModalCardId),
            target: normalizeBuilderTarget(this.builderModalTarget || "root"),
            compositionRevision: compositionReferenceStateRevision(this.state),
            t: String(Date.now())
        });
        this.dom.builderFrame.src = `./composition_pointsbuilder.html?${q.toString()}`;
    }

    pullBuilderStateAndClose() {
        void this.consumeBuilderReturnState({ closeModal: true, pushHistory: true });
    }

    readBuilderSandboxState(expectedCardId = "", expectedTarget = "root", expectedRevision = "") {
        try {
            const raw = localStorage.getItem(CPB_STATE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (expectedCardId) {
                const context = parsed?.context;
                if (String(context?.cardId || "") !== String(expectedCardId || "")
                    || normalizeBuilderTarget(context?.target || "root") !== normalizeBuilderTarget(expectedTarget || "root")) {
                    return null;
                }
                if (expectedRevision
                    && String(context?.compositionRevision || "") !== String(expectedRevision)) return null;
            }
            return normalizeBuilderState(parsed?.state || parsed);
        } catch (e) {
            console.warn("read builder state failed:", e);
            return null;
        }
    }

    importBuilderJson(cardId, target = "root") {
        const card = this.getCardById(cardId || this.focusedCardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        const targetLabel = /^tree_node:/.test(normalizedTarget)
            ? "子节点 Builder"
            : (normalizedTarget === "shape" ? "Shape Builder" : "Builder");
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const obj = JSON.parse(text);
                this.pushHistory();
                this.setCardBuilderState(card, normalizedTarget, obj?.state || obj);
                this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
                this.showToast(`${targetLabel} JSON 导入成功`, "success");
            } catch (e) {
                this.showToast(`${targetLabel} JSON 导入失败: ${e?.message || e}`, "error");
            }
        };
        input.click();
    }

    async exportBuilderJson(cardId, target = "root") {
        const card = this.getCardById(cardId || this.focusedCardId);
        if (!card) return;
        const normalizedTarget = normalizeBuilderTarget(target);
        const state = this.resolveCardBuilderState(card, normalizedTarget);
        const suffix = /^tree_node:/.test(normalizedTarget)
            ? "tree_node_builder"
            : (normalizedTarget === "shape" ? "shape_builder" : "builder");
        const targetLabel = /^tree_node:/.test(normalizedTarget)
            ? "子节点 Builder"
            : (normalizedTarget === "shape" ? "Shape Builder" : "Builder");
        const name = sanitizeFileBase(card.name || suffix) || suffix;
        const result = await this.saveTextWithPicker({
            filename: `${name}.${suffix}.pointsbuilder.json`,
            text: JSON.stringify(state, null, 2),
            mime: "application/json",
            description: "PointsBuilder JSON",
            extensions: [".json"]
        });
        if (result.ok) this.showToast(`${targetLabel} JSON 已导出`, "success");
        else if (result.canceled) this.showToast("已取消导出", "info");
        else this.showToast(`${targetLabel} JSON 导出失败: ${result.error?.message || result.error || "未知错误"}`, "error");
    }

    showToast(message, type = "info") {
        const msg = String(message || "").trim();
        if (!msg) return;
        let el = document.querySelector(".toast");
        if (!el) {
            el = document.createElement("div");
            el.className = "toast";
            document.body.appendChild(el);
        }
        clearTimeout(this.toastTimer);
        el.textContent = msg;
        el.classList.remove("success", "error", "info", "show");
        el.classList.add(type === "error" ? "error" : (type === "success" ? "success" : "info"));
        requestAnimationFrame(() => el.classList.add("show"));
        this.toastTimer = setTimeout(() => el.classList.remove("show"), 1850);
    }

    renderKotlin(text) {
        const raw = String(text || "");
        const highlighter = globalThis.CodeHighlighter?.highlightKotlin;
        if (typeof highlighter === "function") {
            this.dom.kotlinOut.innerHTML = highlighter(raw);
        } else {
            this.dom.kotlinOut.textContent = raw;
        }
    }

    generateCodeAndRender(force = false) {
        if (!force && !this.state.settings.realtimeCode) return;
        try {
            this.currentKotlin = this.generateKotlin();
            this.lastCodegenError = "";
            this.renderKotlin(this.currentKotlin);
            return true;
        } catch (error) {
            this.currentKotlin = "";
            this.lastCodegenError = String(error?.message || error || "代码生成失败");
            this.renderKotlin(`// 代码生成已阻止\n// ${this.lastCodegenError}`);
            return false;
        }
    }

    async copyCode() {
        if (!this.currentKotlin && this.generateCodeAndRender(true) === false) {
            this.showToast(this.lastCodegenError || "代码生成失败", "error");
            return;
        }
        const text = this.currentKotlin || "";
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
            }
            this.showToast("代码已复制", "success");
        } catch (e) {
            this.showToast(`复制失败: ${e?.message || e}`, "error");
        }
    }

    async downloadCode() {
        if (!this.currentKotlin && this.generateCodeAndRender(true) === false) {
            this.showToast(this.lastCodegenError || "代码生成失败", "error");
            return;
        }
        const cls = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const filename = `${sanitizeFileBase(cls) || "NewComposition"}.kt`;
        const result = await this.saveTextWithPicker({
            filename,
            text: this.currentKotlin || "",
            mime: "text/plain",
            description: "Kotlin 文件",
            extensions: [".kt"]
        });
        if (result.ok) this.showToast("代码已下载", "success");
        else if (result.canceled) this.showToast("已取消下载", "info");
        else this.showToast(`下载失败: ${result.error?.message || result.error || "未知错误"}`, "error");
    }

    generateKotlin() {
        const className = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const sequencedRoot = this.state.compositionType === "sequenced";
        const baseClass = sequencedRoot ? "AutoSequencedParticleComposition" : "AutoParticleComposition";
        const imports = [
            "import cn.coostack.cooparticlesapi.annotations.CodecField",
            "import cn.coostack.cooparticlesapi.annotations.CooAutoRegister",
            "import cn.coostack.cooparticlesapi.network.particle.composition.*",
            "import cn.coostack.cooparticlesapi.particles.ParticleDisplayer",
            "import cn.coostack.cooparticlesapi.particles.impl.*",
            "import cn.coostack.cooparticlesapi.utils.RelativeLocation",
            "import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder",
            "import net.minecraft.world.level.Level",
            "import net.minecraft.world.phys.Vec3",
            "import kotlin.math.PI",
            "import kotlin.random.Random",
            "import java.util.SortedMap",
            "import java.util.TreeMap",
            "import org.joml.Vector3f"
        ];

        const body = [];
        body.push("@CooAutoRegister");
        body.push(`class ${className}(position: Vec3, world: Level? = null) : ${baseClass}(position, world) {`);
        const fields = this.buildClassFields(className);
        if (fields) body.push(fields);
        const initBlock = this.buildInitBlock(className, sequencedRoot);
        if (initBlock) body.push(initBlock);
        body.push(this.buildParticlesMethod(className, sequencedRoot));
        body.push(this.buildOnDisplayMethod(className));
        body.push("}");

        return [...imports, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n");
    }

    buildClassFields(className) {
        const lines = [];
        const used = new Set();
        const uniqueName = (raw, fallback) => {
            let base = sanitizeKotlinIdentifier(raw, fallback);
            if (!base) base = fallback;
            let out = base;
            let i = 2;
            while (used.has(out)) out = `${base}${i++}`;
            used.add(out);
            return out;
        };

        for (const v of this.state.globalVars) {
            const name = uniqueName(v.name, "value");
            const type = String(v.type || "Double").trim() || "Double";
            const rawValue = String(v.value || "").trim();
            let value = rewriteClassQualifier(rawValue || defaultLiteralForKotlinType(type), className);
            if (/^(int|short|byte|long)$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = safeNumberLiteral(value, type);
            } else if (/^boolean$/i.test(type)) {
                value = safeNumberLiteral(value, type);
            } else if (/^float$/i.test(type)) {
                if (isPlainNumericLiteralText(value)) value = normalizeKotlinFloatLiteralText(value);
                else if (!/\.toFloat\(\)\s*$/.test(value)) value = `(${value}).toFloat()`;
            } else if (/^double$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = normalizeKotlinDoubleLiteralText(value);
            }
            if (v.codec) lines.push("    @CodecField");
            lines.push(`    ${v.mutable ? "var" : "val"} ${name}: ${type} = ${value}`);
            lines.push("");
        }
        for (const c of this.state.globalConsts) {
            const name = uniqueName(c.name, "constant");
            const type = String(c.type || "Int").trim() || "Int";
            const rawValue = String(c.value || "").trim();
            let value = rewriteClassQualifier(rawValue || defaultLiteralForKotlinType(type), className);
            if (/^(int|short|byte|long)$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = safeNumberLiteral(value, type);
            } else if (/^boolean$/i.test(type)) {
                value = safeNumberLiteral(value, type);
            } else if (/^float$/i.test(type)) {
                if (isPlainNumericLiteralText(value)) value = normalizeKotlinFloatLiteralText(value);
                else if (!/\.toFloat\(\)\s*$/.test(value)) value = `(${value}).toFloat()`;
            } else if (/^double$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = normalizeKotlinDoubleLiteralText(value);
            }
            lines.push(`    val ${name}: ${type} = ${value}`);
            lines.push("");
        }

        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            if (projectScale.type === "bezier") {
                lines.push(
                    `    private val scaleHelper = CompositionBezierScaleHelper(${Math.max(1, int(projectScale.tick))}, ${formatKotlinDoubleLiteral(projectScale.min)}, ${formatKotlinDoubleLiteral(projectScale.max)}, ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(projectScale.c1x)}, ${formatKotlinDoubleLiteral(projectScale.c1y)}, ${formatKotlinDoubleLiteral(projectScale.c1z)}), ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(projectScale.c2x)}, ${formatKotlinDoubleLiteral(projectScale.c2y)}, ${formatKotlinDoubleLiteral(projectScale.c2z)}))`
                );
            } else {
                lines.push(`    private val scaleHelper = CompositionScaleHelper(${formatKotlinDoubleLiteral(projectScale.min)}, ${formatKotlinDoubleLiteral(projectScale.max)}, ${Math.max(1, int(projectScale.tick))})`);
            }
            lines.push("");
        }

        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.join("\n");
    }

    buildInitBlock(className, sequencedRoot) {
        const lines = [];
        const axisExpr = rewriteClassQualifier(
            String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()"),
            className
        );
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            lines.push("        scaleHelper.loadControler(this)");
        }
        const disabled = Math.max(0, int(this.state.disabledInterval || 0));
        if (disabled > 0) lines.push(`        setDisabledInterval(${disabled})`);
        if (sequencedRoot && this.state.compositionAnimates.length) {
            const animates = this.state.compositionAnimates.map((a) => normalizeAnimate(a));
            if (animates.length) {
                const first = animates[0];
                lines.push(`        animate.addAnimate(${Math.max(1, int(first.count))}) { ${rewriteClassQualifier(first.condition || "true", className)} }`);
                for (let i = 1; i < animates.length; i++) {
                    const it = animates[i];
                    lines.push(`            .addAnimate(${Math.max(1, int(it.count))}) { ${rewriteClassQualifier(it.condition || "true", className)} }`);
                }
            }
        }
        if (!lines.length) return "";
        return ["    init {", ...lines, "    }"].join("\n");
    }

    buildParticlesMethod(className, sequencedRoot) {
        const lines = [];
        if (sequencedRoot) {
            lines.push("    override fun getParticleSequenced(): SortedMap<CompositionData, RelativeLocation> {");
            lines.push("        val result: SortedMap<CompositionData, RelativeLocation> = TreeMap()");
            lines.push("        var orderCounter = 0");
        } else {
            lines.push("    override fun getParticles(): Map<CompositionData, RelativeLocation> {");
            lines.push("        val result = LinkedHashMap<CompositionData, RelativeLocation>()");
        }

        for (let i = 0; i < this.state.cards.length; i++) {
            const card = this.state.cards[i];
            lines.push("");
            lines.push(this.emitCardPut(card, className, sequencedRoot, i));
        }

        lines.push("");
        lines.push("        return result");
        lines.push("    }");
        return lines.join("\n");
    }

    emitCardPut(card, className, sequencedRoot, cardIndex = 0) {
        if (card.bindMode === "point") return this.emitCardPutPoint(card, className, sequencedRoot);
        return this.emitCardPutAll(card, className, sequencedRoot);
    }

    emitCardPutAll(card, className, sequencedRoot) {
        const builderExpr = this.emitBuilderExpr(card);
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        result.putAll(",
            `${indentText(builderExpr, "            ")}`,
            "                .createWithCompositionData { rel ->",
            dataExpr,
            "                }",
            "        )"
        ].join("\n");
    }

    emitCardPutPoint(card, className, sequencedRoot) {
        const rel = relExpr(card.point?.x, card.point?.y, card.point?.z);
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        run {",
            `            val rel = ${rel}`,
            "            result[",
            dataExpr,
            "            ] = rel",
            "        }"
        ].join("\n");
    }

    emitBuilderExpr(card) {
        if (card.bindMode === "point") {
            return `PointsBuilder().addPoint(${relExpr(card.point.x, card.point.y, card.point.z)})`;
        }
        return this.emitBuilderExprFromState(card.builderState);
    }

    emitBuilderExprFromState(builderState) {
        const old = builderEvalState;
        try {
            builderEvalState = normalizeBuilderState(builderState);
            return emitPointsBuilderKotlin();
        } catch (e) {
            console.warn("emit builder kotlin failed:", e);
            return "PointsBuilder()";
        } finally {
            builderEvalState = old;
        }
    }

    emitCompositionDataExpr(card, className, sequencedRoot, indentBase = "                ") {
        const lines = [];
        let headIndent = indentBase;
        if (sequencedRoot) {
            lines.push(`${indentBase}run {`);
            lines.push(`${indentBase}    val order = orderCounter++`);
            headIndent = `${indentBase}    `;
            lines.push(`${headIndent}CompositionData().apply { order = order }`);
        } else {
            lines.push(`${headIndent}CompositionData()`);
        }
        lines.push(`${headIndent}    .setDisplayerSupplier {`);
        if (card.dataType === "single") {
            lines.push(`${headIndent}        ParticleDisplayer.withSingle(${sanitizeKotlinIdentifier(card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS)}(it))`);
        } else if (card.dataType === "particle_shape") {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "particle_shape"), `${headIndent}        `));
        } else {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "sequenced_shape"), `${headIndent}        `));
        }
        lines.push(`${headIndent}    }`);

        if (card.dataType === "single") {
            lines.push(this.buildSingleDataChain(card, className, `${headIndent}    `));
        }
        if (sequencedRoot) lines.push(`${indentBase}}`);
        return lines.join("\n");
    }

    buildSingleDataChain(card, className, indentBase = "                    ") {
        const lines = [];
        if (Array.isArray(card.particleInit) && card.particleInit.length) {
            lines.push(`${indentBase}.addParticleInstanceInit {`);
            for (const it of card.particleInit) {
                const target = sanitizeKotlinIdentifier(it.target || "size", "size");
                let expr = rewriteClassQualifier(String(it.expr || "").trim(), className);
                expr = normalizeParticleFloatAssignmentExpr(target, expr);
                if (!expr) continue;
                lines.push(`${indentBase}    ${target} = ${expr}`);
            }
            lines.push(`${indentBase}}`);
        }

        const hasTick = Array.isArray(card.controllerVars) && card.controllerVars.length;
        const actions = Array.isArray(card.controllerActions) ? card.controllerActions.map((it) => normalizeControllerAction(it)) : [];
        if (hasTick || actions.length) {
            lines.push(`${indentBase}.addParticleControlerInstanceInit {`);
            for (const v of (card.controllerVars || [])) {
                const vName = sanitizeKotlinIdentifier(v.name || "v", "v");
                const vType = sanitizeKotlinIdentifier(v.type || "Boolean", "Boolean");
                let expr = rewriteClassQualifier(String(v.expr || "").trim(), className);
                expr = rewriteControllerStatusQualifier(expr, className);
                if (!expr) expr = defaultLiteralForKotlinType(vType);
                lines.push(`${indentBase}    var ${vName}: ${vType} = ${expr}`);
            }
            for (const action of actions) {
                const script = rewriteClassQualifier(String(action.script || "").trim(), className);
                const patched = rewriteControllerStatusQualifier(script, className);
                if (!patched) continue;
                lines.push(`${indentBase}    addPreTickAction {`);
                lines.push(translateJsBlockToKotlin(patched, `${indentBase}        `));
                lines.push(`${indentBase}    }`);
            }
            lines.push(`${indentBase}}`);
        }
        return lines.join("\n");
    }

    createShapeDataLambdaContext(depth = 0, sequenced = false, parentCtx = null) {
        const d = Math.max(0, int(depth));
        return {
            depth: d,
            relName: `shapeRel${d}`,
            orderName: sequenced ? `shapeOrder${d}` : "",
            parent: parentCtx && typeof parentCtx === "object" ? parentCtx : null
        };
    }

    formatShapeDataLambdaParams(ctx) {
        if (!ctx) return "shapeRel0";
        if (ctx.orderName) return `${ctx.relName}, ${ctx.orderName}`;
        return ctx.relName;
    }

    emitShapeCompositionDataBase(ctx, indent = "            ") {
        if (ctx?.orderName) return `${indent}CompositionData().apply { order = ${ctx.orderName} }`;
        return `${indent}CompositionData()`;
    }

    buildShapeDisplayerExpr(card, className, type = "particle_shape") {
        const isSequenced = type === "sequenced_shape";
        const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const axisExpr = rewriteClassQualifier(String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const rootCtx = this.createShapeDataLambdaContext(0, isSequenced, null);
        const rootScopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, 0);
        const lines = [];
        lines.push("ParticleDisplayer.withComposition(");
        lines.push(`    ${cls}(it).apply {`);
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        this._emitScaleHelper(lines, scale, "        ");
        const children = card.shapeChildren || [];
        for (const child of children) {
            this._emitTreeNodeApplyBlock(lines, child, card, className, rootCtx, "        ");
        }
        lines.push(this.applyCardCompositionActions(card, className, "        ", isSequenced, rootScopeInfo));
        lines.push("    }");
        lines.push(")");
        return lines.join("\n");
    }

    _emitScaleHelper(lines, scale, indent) {
        if (scale.type === "bezier") {
            const tick = Math.max(1, int(scale.tick));
            const c1x = num(scale.c1x);
            const c1y = num(scale.c1y) - num(scale.min);
            const c1z = num(scale.c1z);
            const c2x = num(scale.c2x) - tick;
            const c2y = num(scale.c2y) - num(scale.max);
            const c2z = num(scale.c2z);
            lines.push(
                `${indent}loadScaleHelperBezierValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${tick}, ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(c1x)}, ${formatKotlinDoubleLiteral(c1y)}, ${formatKotlinDoubleLiteral(c1z)}), ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(c2x)}, ${formatKotlinDoubleLiteral(c2y)}, ${formatKotlinDoubleLiteral(c2z)}))`
            );
        } else if (scale.type === "linear") {
            lines.push(`${indent}loadScaleValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))})`);
        }
    }

    _emitTreeNodeApplyBlock(lines, node, card, className, parentCtx, indent) {
        if (!node) return;
        const nodeType = node.type || "single";
        const bindMode = node.bindMode === "builder" ? "builder" : "point";
        const pointExpr = relExpr(node.point?.x, node.point?.y, node.point?.z);
        const builderExpr = this.emitBuilderExprFromState(node.builderState);
        const isSequenced = nodeType === "sequenced_shape";
        const depth = parentCtx ? int(parentCtx.depth) + 1 : 1;
        const ctx = this.createShapeDataLambdaContext(depth, isSequenced, parentCtx);
        const dataLambdaHead = this.formatShapeDataLambdaParams(ctx);
        if (nodeType === "single") {
            this._emitTreeNodeSingleApply(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent);
        } else {
            this._emitTreeNodeShapeApply(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, isSequenced, depth);
        }
    }

    _emitTreeNodeSingleApply(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent) {
        const fx = sanitizeKotlinIdentifier(node.effectClass || card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS);
        if (bindMode === "builder") {
            lines.push(`${indent}applyBuilder(`);
            lines.push(indentText(builderExpr, `${indent}    `));
            lines.push(`${indent}) { ${dataLambdaHead} ->`);
        } else {
            lines.push(`${indent}applyPoint(${pointExpr}) { ${dataLambdaHead} ->`);
        }
        lines.push(this.emitShapeCompositionDataBase(ctx, `${indent}    `));
        lines.push(`${indent}        .setDisplayerSupplier {`);
        lines.push(`${indent}            ParticleDisplayer.withSingle(${fx}(it))`);
        lines.push(`${indent}        }`);
        const singleChain = this._buildTreeNodeSingleDataChain(node, card, className, `${indent}        `);
        if (singleChain) lines.push(singleChain);
        lines.push(`${indent}}`);
    }

    _emitTreeNodeShapeApply(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, isSequenced, depth) {
        const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const axisExpr = rewriteClassQualifier(String(node.axisExpr || node.axisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(node.scale, { type: "none" });
        if (bindMode === "builder") {
            lines.push(`${indent}applyBuilder(`);
            lines.push(indentText(builderExpr, `${indent}    `));
            lines.push(`${indent}) { ${dataLambdaHead} ->`);
        } else {
            lines.push(`${indent}applyPoint(${pointExpr}) { ${dataLambdaHead} ->`);
        }
        lines.push(this.emitShapeCompositionDataBase(ctx, `${indent}    `));
        lines.push(`${indent}        .setDisplayerSupplier {`);
        lines.push(`${indent}            ParticleDisplayer.withComposition(`);
        lines.push(`${indent}                ${cls}(it).apply {`);
        if (axisExpr) lines.push(`${indent}                    axis = ${axisExpr}`);
        this._emitScaleHelper(lines, scale, `${indent}                    `);
        const children = node.children || [];
        for (const child of children) {
            this._emitTreeNodeApplyBlock(lines, child, card, className, ctx, `${indent}                    `);
        }
        const pseudo = { id: card.id, shapeDisplayActions: node.displayActions || [], shapeScale: scale, growthAnimates: node.growthAnimates || [] };
        const scopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, depth);
        const actions = this.applyCardCompositionActions(pseudo, className, `${indent}                    `, isSequenced, scopeInfo);
        if (String(actions || "").trim()) lines.push(actions);
        lines.push(`${indent}                }`);
        lines.push(`${indent}            )`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}}`);
    }

    _buildTreeNodeSingleDataChain(node, card, className, indentBase) {
        const lines = [];
        const pinitList = Array.isArray(node.particleInit) ? node.particleInit : [];
        if (pinitList.length) {
            lines.push(`${indentBase}.addParticleInstanceInit {`);
            for (const it of pinitList) {
                const target = sanitizeKotlinIdentifier(it.target || "size", "size");
                const expr = rewriteClassQualifier(String(it.expr || "0.0"), className);
                lines.push(`${indentBase}    ${target} = ${expr}`);
            }
            lines.push(`${indentBase}}`);
        }
        const cvars = Array.isArray(node.controllerVars) ? node.controllerVars : [];
        const cactions = Array.isArray(node.controllerActions) ? node.controllerActions : [];
        if (cvars.length || cactions.length) {
            lines.push(`${indentBase}.addController {`);
            for (const v of cvars) {
                const vName = sanitizeKotlinIdentifier(v.name || "v", "v");
                const vType = v.type || "Double";
                const vExpr = rewriteClassQualifier(String(v.expr || "0.0"), className);
                lines.push(`${indentBase}    var ${vName}: ${vType} = ${vExpr}`);
            }
            for (const a of cactions) {
                const script = this.compileControllerActionScript(a, className, `${indentBase}    `);
                if (script) lines.push(script);
            }
            lines.push(`${indentBase}}`);
        }
        return lines.length ? lines.join("\n") : "";
    }

    applyCardCompositionActions(card, className, innerIndent = "        ", supportsAnimate = false, scopeInfo = null) {
        const lines = [];
        const displayActions = Array.isArray(card.shapeDisplayActions) && card.shapeDisplayActions.length
            ? card.shapeDisplayActions.map((a) => normalizeDisplayAction(a))
            : [];
        const shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const needReverseScale = shapeScale.type !== "none" && shapeScale.reversedOnDisable;
        for (let i = 0; i < displayActions.length; i++) {
            const act = displayActions[i];
            const toExpr = rewriteClassQualifier(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? rewriteClassQualifier(String(act.angleExpr || "0.0"), className)
                : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
            const blockLines = [];
            const usePreTickWrapper = act.type === "expression"
                || act.type === "rotateToWithAngle"
                || (act.type === "rotateAsAxis" && act.angleMode === "expr");
            if (act.type === "rotateToPoint") {
                blockLines.push(`${innerIndent}    rotateToPoint(${toExpr})`);
            } else if (act.type === "rotateAsAxis") {
                if (usePreTickWrapper) {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateAsAxis(${angleExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else {
                    blockLines.push(`${innerIndent}    rotateAsAxis(${angleExpr})`);
                }
            } else if (act.type === "rotateToWithAngle") {
                if (usePreTickWrapper) {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateToWithAngle(${toExpr}, ${angleExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else {
                    blockLines.push(`${innerIndent}    rotateToWithAngle(${toExpr}, ${angleExpr})`);
                }
            } else if (act.type === "expression") {
                const rawExpr = String(act.expression || "").trim();
                const check = this.validateJsExpressionSource(rawExpr, { cardId: card.id, scope: scopeInfo || undefined });
                const expr = rewriteClassQualifier(rawExpr, className);
                if (expr && check.valid) {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(translateJsBlockToKotlin(expr, `${innerIndent}        `));
                    blockLines.push(`${innerIndent}    }`);
                }
            }
            if (needReverseScale && i === displayActions.length - 1) {
                const cls = sanitizeKotlinClassName(className);
                blockLines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            }
            if (!blockLines.length) continue;
            lines.push(`${innerIndent}applyDisplayAction {`);
            lines.push(...blockLines);
            lines.push(`${innerIndent}}`);
        }
        if (needReverseScale && !displayActions.length) {
            const cls = sanitizeKotlinClassName(className);
            lines.push(`${innerIndent}applyDisplayAction {`);
            lines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            lines.push(`${innerIndent}}`);
        }
        if (supportsAnimate && card.growthAnimates?.length) {
            const arr = card.growthAnimates.map((a) => normalizeAnimate(a));
            if (arr.length) {
                lines.push(`${innerIndent}animate.addAnimate(${arr[0].count}) { ${rewriteClassQualifier(arr[0].condition, className)} }`);
                for (let i = 1; i < arr.length; i++) {
                    lines.push(`${innerIndent}    .addAnimate(${arr[i].count}) { ${rewriteClassQualifier(arr[i].condition, className)} }`);
                }
            }
        }
        return lines.join("\n");
    }

    buildOnDisplayMethod(className) {
        const actions = this.state.displayActions || [];
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        const hasProjectScale = projectScale.type !== "none";
        const needReverseScale = hasProjectScale && projectScale.reversedOnDisable;
        if (!actions.length && !hasProjectScale) {
            return [
                "    override fun onDisplay() {",
                "    }"
            ].join("\n");
        }
        const lines = [];
        lines.push("    override fun onDisplay() {");
        lines.push("        addPreTickAction {");
        if (hasProjectScale) {
            if (needReverseScale) {
                lines.push("            if (status.isEnable()) {");
                lines.push("                scaleHelper.doScale()");
                lines.push("            } else {");
                lines.push("                scaleHelper.doScaleReversed()");
                lines.push("            }");
            } else {
                lines.push("            scaleHelper.doScale()");
            }
        }
        for (const raw of actions) {
            const act = normalizeDisplayAction(raw);
            const toExpr = rewriteClassQualifier(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? rewriteClassQualifier(String(act.angleExpr || "0.0"), className)
                : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
            if (act.type === "rotateToPoint") {
                lines.push(`            rotateToPoint(${toExpr})`);
            } else if (act.type === "rotateAsAxis") {
                lines.push(`            rotateAsAxis(${angleExpr})`);
            } else if (act.type === "rotateToWithAngle") {
                lines.push(`            rotateToWithAngle(${toExpr}, ${angleExpr})`);
            } else if (act.type === "expression") {
                const rawExpr = String(act.expression || "").trim();
                const check = this.validateJsExpressionSource(rawExpr, { cardId: "" });
                const expr = rewriteClassQualifier(rawExpr, className);
                if (expr && check.valid) lines.push(translateJsBlockToKotlin(expr, "            "));
            }
        }
        lines.push("        }");
        lines.push("    }");
        return lines.join("\n");
    }
}

function indentText(text, indent = "    ") {
    const src = String(text || "");
    const lines = src.split(/\r?\n/);
    return lines.map((line) => `${indent}${line}`).join("\n");
}

function sanitizeFileBase(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    return raw.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60).trim();
}

function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([String(text || "")], { type: `${mime};charset=utf-8` });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "download.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 220);
}

function hashString(s) {
    let h = 2166136261;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function rewriteKotlinMathExpr(expr) {
    let out = String(expr || "");
    out = out.replace(/\bjava\.lang\.Math\./g, "kotlin.math.");
    out = out.replace(/\bStrictMath\./g, "kotlin.math.");
    out = out.replace(/\bMath\.PI\b/g, "kotlin.math.PI");
    out = out.replace(/\bMath\.E\b/g, "kotlin.math.E");
    out = out.replace(/\b(?:java\.lang\.|StrictMath\.)?Math\.random\s*\(\s*\)/g, "kotlin.random.Random.Default.nextDouble()");
    const fnMap = {
        abs: "abs",
        acos: "acos",
        asin: "asin",
        atan: "atan",
        atan2: "atan2",
        ceil: "ceil",
        cos: "cos",
        exp: "exp",
        floor: "floor",
        log: "ln",
        log10: "log10",
        max: "max",
        min: "min",
        pow: "pow",
        round: "round",
        signum: "sign",
        sin: "sin",
        sqrt: "sqrt",
        tan: "tan",
        trunc: "truncate"
    };
    for (const [src, dst] of Object.entries(fnMap)) {
        const re = new RegExp(`\\b(?:java\\.lang\\.|StrictMath\\.)?Math\\.${src}\\s*\\(`, "g");
        out = out.replace(re, `kotlin.math.${dst}(`);
    }
    return out;
}

function rewriteClassQualifier(expr, className) {
    const cls = sanitizeKotlinClassName(className || "TestComposition");
    const qualified = String(expr || "").replace(/this@[A-Za-z_][A-Za-z0-9_]*/g, `this@${cls}`);
    return rewriteKotlinMathExpr(qualified);
}

function rewriteControllerStatusQualifier(expr, className) {
    const cls = sanitizeKotlinClassName(className || "TestComposition");
    return String(expr || "").replace(/(^|[^A-Za-z0-9_@.])status\./g, `$1this@${cls}.status.`);
}

function transpileKotlinThisQualifierToJs(source) {
    return String(source || "").replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, "thisAt.");
}

function defaultLiteralForKotlinType(typeName) {
    const t = String(typeName || "").trim().toLowerCase();
    if (t === "string") return "\"\"";
    if (t === "boolean") return "false";
    if (t === "float") return "0F";
    if (t === "double") return "0.0";
    if (t === "long") return "0L";
    if (t === "int" || t === "short" || t === "byte") return "0";
    if (t === "vec3") return "Vec3.ZERO";
    if (t === "vector3f") return "Vector3f(0F,0F,0F)";
    if (t === "relativelocation") return "RelativeLocation(0.0, 0.0, 0.0)";
    return "0";
}

function isParticleFloatTargetName(rawTarget) {
    const t = String(rawTarget || "").trim().toLowerCase();
    return t === "size"
        || t === "particlesize"
        || t === "particle.particlesize"
        || t === "alpha"
        || t === "particlealpha"
        || t === "particle.particlealpha";
}

function normalizeParticleFloatAssignmentExpr(targetName, exprRaw) {
    const expr = String(exprRaw || "").trim();
    if (!expr) return expr;
    if (!isParticleFloatTargetName(targetName)) return expr;
    if (isPlainNumericLiteralText(expr)) return normalizeKotlinFloatLiteralText(expr);
    if (/\.toFloat\(\)\s*$/.test(expr)) return expr;
    return `(${expr}).toFloat()`;
}

function appendFloatSuffixInLine(line) {
    return String(line || "").replace(/(^|[^\w.])(-?\d+\.\d+)(?![fFdD\w])/g, (m, pfx, numStr) => `${pfx}${numStr}F`);
}

function normalizeVectorCtorNumericLiteral(rawArg, mode = "double") {
    const raw = String(rawArg || "").trim();
    if (!/^-?(?:\d+\.?\d*|\.\d+)(?:[fFdDlL])?$/.test(raw)) return raw;
    let core = raw;
    if (/[fFdDlL]$/.test(core)) core = core.slice(0, -1);
    if (!core) return raw;
    if (mode === "float") {
        if (!core.includes(".")) return `${core}F`;
        if (core.endsWith(".")) core = `${core}0`;
        return `${core}F`;
    }
    if (!core.includes(".")) return `${core}.0`;
    if (core.endsWith(".")) return `${core}0`;
    return core;
}

function rewriteVectorCtorNumericLiteralsInLine(line) {
    const src = String(line || "");
    const rewrite = (ctor, a, b, c) => {
        const mode = ctor === "Vector3f" ? "float" : "double";
        const x = normalizeVectorCtorNumericLiteral(a, mode);
        const y = normalizeVectorCtorNumericLiteral(b, mode);
        const z = normalizeVectorCtorNumericLiteral(c, mode);
        return `${ctor}(${x},${y},${z})`;
    };
    let out = src.replace(
        /\bVector3f\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
        (m, a, b, c) => rewrite("Vector3f", a, b, c)
    );
    out = out.replace(
        /\bVec3\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
        (m, a, b, c) => rewrite("Vec3", a, b, c)
    );
    out = out.replace(
        /\bVec3d\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
        (m, a, b, c) => rewrite("Vec3d", a, b, c)
    );
    out = out.replace(
        /\bRelativeLocation\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
        (m, a, b, c) => rewrite("RelativeLocation", a, b, c)
    );
    return out;
}

function rewriteParticleFloatAssignmentInLine(line) {
    const src = String(line || "");
    const m = src.match(/^(\s*(?:this\.)?(?:particle\.)?(?:particleAlpha|particleSize|alpha|size)\s*=\s*)(.+)$/);
    if (!m) return src;
    const lhs = m[1];
    let rhs = String(m[2] || "").trim();
    let tail = "";
    const commentIdx = rhs.indexOf("//");
    if (commentIdx >= 0) {
        tail = rhs.slice(commentIdx);
        rhs = rhs.slice(0, commentIdx).trim();
    }
    if (!rhs) return src;
    if (isPlainNumericLiteralText(rhs)) rhs = normalizeKotlinFloatLiteralText(rhs);
    else if (!/\.toFloat\(\)\s*$/.test(rhs)) rhs = `(${rhs}).toFloat()`;
    return `${lhs}${rhs}${tail ? ` ${tail}` : ""}`;
}

function translateJsBlockToKotlin(script, indent = "    ") {
    const raw = String(script || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return `${indent}// no-op`;

    const lines = raw.split("\n").map((line) => line.trimEnd().replace(/;+\s*$/g, ""));
    const out = [];
    for (let line of lines) {
        line = line.replaceAll("===", "==").replaceAll("!==", "!=");
        line = line.replace(/\blet\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "var $1");
        line = line.replace(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "val $1");
        line = line.replace(/\?\s*([^:]+)\s*:\s*(.+)$/g, (m, a, b) => `? ${a.trim()} : ${b.trim()}`);
        const ternary = line.match(/^(.*?)([A-Za-z0-9_.)\]]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/);
        if (ternary) {
            const left = ternary[1] || "";
            const cond = ternary[2] || "true";
            const yes = ternary[3] || "0";
            const no = ternary[4] || "0";
            line = `${left}if (${cond.trim()}) ${yes.trim()} else ${no.trim()}`;
        }
        line = appendFloatSuffixInLine(line);
        line = rewriteVectorCtorNumericLiteralsInLine(line);
        line = rewriteParticleFloatAssignmentInLine(line);
        out.push(`${indent}${line}`);
    }
    return out.join("\n");
}

function emitBuilderKotlinFromState(builderState) {
    const old = builderEvalState;
    try {
        builderEvalState = normalizeBuilderState(builderState);
        return emitPointsBuilderKotlin();
    } catch (e) {
        console.warn("emit builder kotlin failed:", e);
        return "PointsBuilder()";
    } finally {
        builderEvalState = old;
    }
}

installCodeOutputMethods(CompositionBuilderApp, {
    sanitizeKotlinClassName,
    sanitizeFileBase,
    relExpr,
    emitBuilderKotlinFromState
});

installExpressionEditorMethods(CompositionBuilderApp, {
    int,
    esc,
    normalizeAlphaHelperConfig,
    getCompositionKotlinTarget,
    sanitizeKotlinClassName,
    transpileKotlinThisQualifierToJs,
    findFirstUnknownJsIdentifier,
    JS_LINT_GLOBALS,
    InlineCodeEditor,
    mergeCompletionGroups,
    isCompositionLeafParticleType,
    isCompositionCardUsingCParticle
});

installCodeCompileMethods(CompositionBuilderApp, {
    int
});

installTargetPresetMethods(CompositionBuilderApp, {
    esc,
    sanitizeKotlinClassName,
    PARTICLE_INIT_TARGET_OPTIONS,
    CPARTICLE_INIT_TARGET_OPTIONS
});

installKotlinCodegenMethods(CompositionBuilderApp, {
    U,
    num,
    int,
    normalizeAnimate,
    normalizeControllerAction,
    normalizeDisplayAction,
    normalizeAlphaHelperConfig,
    normalizeCParticleAlphaConfig,
    normalizeScaleHelperConfig,
    normalizeShapeNestedLevel,
    sanitizeKotlinClassName,
    sanitizeKotlinIdentifier,
    defaultLiteralForKotlinType,
    rewriteClassQualifier,
    rewriteControllerStatusQualifier,
    normalizeKotlinFloatLiteralText,
    isPlainNumericLiteralText,
    normalizeKotlinDoubleLiteralText,
    formatKotlinDoubleLiteral,
    relExpr,
    indentText,
    normalizeAngleOffsetEaseName,
    normalizeAngleOffsetEaseSpecialParams,
    normalizeAngleUnit,
    translateJsBlockToKotlin,
    normalizeParticleFloatAssignmentExpr,
    getCompositionControllerVariableNameError,
    normalizeCompositionControllerVariableName,
    COMPOSITION_LAMBDA_RESERVED_NAMES,
    isCompositionShapeType,
    compositionShapeNodeHasParticleLeaf,
    findCompositionNestedShapePaths,
    DEFAULT_EFFECT_CLASS
});

installPreviewRuntimeMethods(CompositionBuilderApp, {
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
    normalizeShapeNestedLevel,
    ensureStatusHelperMethods,
    stripJsForLint,
    transpileKotlinThisQualifierToJs,
    rotatePointsToPointUpright,
    srgbRgbToLinearArray,
    CONTROLLER_SCOPE_RESERVED,
    normalizeAngleUnit,
    normalizeAngleOffsetEaseName,
    normalizeAngleOffsetEaseSpecialParams,
    textureEffectWhitelist: EFFECT_CLASS_OPTIONS,
    isCompositionLeafParticleType
});

installCompositionPresetMethods(CompositionBuilderApp, {
    esc,
    normalizeCard,
    normalizeShapeTreeNode,
    isCompositionShapeType,
    findCompositionNestedShapePaths
});

const app = new CompositionBuilderApp();
try {
    const perfDebug = new URLSearchParams(globalThis?.location?.search || "").has("__perfDebug");
    if (perfDebug) globalThis.__compositionBuilderApp = app;
} catch {
}
app.init();

window.addEventListener("coo-legacy-before-route-leave", () => {
    app.flushAllDeferredExpressionRefreshes();
    app.saveStateNow();
});

window.addEventListener("pagehide", () => {
    app.flushAllDeferredExpressionRefreshes();
    app.savePreferencesNow();
});

window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (event.origin && event.origin !== window.location.origin) return;
    const command = event.data?.type === "coo-shell-command" ? event.data.command : null;
    const commandType = String(command?.type || "");
    if (commandType === "new-project") {
        app.handleNewProjectClick();
    } else if (commandType === "export-kotlin") {
        app.downloadCode();
    }
});
