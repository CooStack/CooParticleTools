import { normalizePointsBuilderState } from "../../points_builder/js/model.js?v=20260827_2";
import {
    normalizeAlphaHelperConfig,
    normalizeCParticleAlphaConfig
} from "./alpha_helper_utils.js?v=20260729_1";
import {
    formatVectorLiteral,
    isVectorLiteralType,
    normalizeVectorCtor,
    parseCtorInLiteral
} from "./vector_value_utils.js?v=20260720_1";
import { normalizeScaleHelperConfig } from "./scale_helper_utils.js";
import { normalizeCompositionMapping } from "./kotlin_mapping.js?v=20260720_1";
import {
    normalizeAngleOffsetEaseName,
    normalizeAngleOffsetEaseSpecialParams,
    normalizeAngleUnit
} from "./angle_offset_utils.js";
import { normalizeWorkbenchTheme } from "./theme.js";

export const COMPOSITION_STORAGE_KEY = "cb_state_v1";

export const DEFAULT_COMPOSITION_HOTKEYS = {
    version: 1,
    actions: {
        addCard: "KeyW",
        switchEditor: "KeyE",
        switchCode: "KeyC",
        toggleSettings: "KeyH",
        toggleHotkeys: "Shift+KeyH",
        generateCode: "KeyK",
        copyCode: "Mod+Shift+KeyC",
        toggleRealtime: "KeyR",
        openBuilderEditor: "KeyB",
        openMeasureTool: "KeyM",
        deleteCard: "Backspace",
        fullscreen: "KeyF",
        undo: "Mod+KeyZ",
        redo: "Mod+Shift+KeyZ"
    }
};

export const COMPOSITION_GLOBAL_VALUE_TYPES = [
    "Int",
    "Long",
    "Float",
    "Double",
    "Boolean",
    "String",
    "Vec3",
    "RelativeLocation",
    "Vector3f"
];

export const DEFAULT_COMPOSITION_EFFECT_CLASS = "ControlableEndRodEffect";

export const COMPOSITION_CONTROLLER_ACTION_TYPES = [
    { id: "tick_js", title: "每帧动作 (JS)" }
];

export const COMPOSITION_DISPLAY_ACTION_TYPES = [
    { id: "rotateToPoint", title: "rotateToPoint(dir)" },
    { id: "rotateAsAxis", title: "rotateAsAxis(angle)" },
    { id: "rotateToWithAngle", title: "rotateToWithAngle(to, angle)" },
    { id: "expression", title: "表达式" }
];

export const COMPOSITION_CARD_SECTION_KEYS = [
    "base",
    "source",
    "single_particle_init",
    "single_controller_init",
    "shape_base",
    "shape_child_params",
    "shape_axis",
    "shape_display",
    "shape_scale",
    "shape_controller",
    "growth"
];

export const COMPOSITION_LAMBDA_RESERVED_NAMES = new Set([
    "rel", "order", "axis", "thisAt", "status", "particle",
    "age", "tick", "tickCount", "index", "currentAge", "lifetime", "lifeTime", "maxAge", "textureSheet",
    "color", "particleColor", "size", "particleSize", "alpha", "particleAlpha",
    "pos", "velocity", "valid", "scaleHelper", "alphaHelper",
    "Math", "Random", "Number", "String", "Boolean", "Object", "Array", "Date", "JSON",
    "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN", "PI",
    "rotateToPoint", "rotateAsAxis", "rotateToWithAngle", "addSingle", "addMultiple", "addPreTickAction",
    "setAlpha", "setColor", "setSize", "teleportTo", "setReversedScaleOnCompositionStatus",
    "RelativeLocation", "Vec3", "Vec3d", "Vector3f"
]);

const COMPOSITION_KOTLIN_KEYWORDS = new Set([
    "as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface",
    "is", "null", "object", "package", "return", "super", "this", "throw", "true", "try", "typealias",
    "typeof", "val", "var", "when", "while", "by", "catch", "constructor", "delegate", "dynamic", "field",
    "file", "finally", "get", "import", "init", "param", "property", "receiver", "set", "setparam", "where",
    "actual", "abstract", "annotation", "companion", "const", "crossinline", "data", "enum", "expect", "external",
    "final", "infix", "inline", "inner", "internal", "lateinit", "noinline", "open", "operator", "out", "override",
    "private", "protected", "public", "reified", "sealed", "suspend", "tailrec", "vararg"
]);

const COMPOSITION_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function getCompositionControllerVariableNameError(rawName, options = {}) {
    const name = String(rawName || "").trim();
    if (!name) return "变量名不能为空";
    if (!COMPOSITION_IDENTIFIER_RE.test(name)) return "必须以字母或下划线开头，只能包含字母、数字或下划线";
    if (COMPOSITION_KOTLIN_KEYWORDS.has(name)) return `不能使用 Kotlin 关键字 ${name}`;
    if (COMPOSITION_LAMBDA_RESERVED_NAMES.has(name) || /^shape(?:Rel|Order)\d+$/.test(name)) {
        return `不能使用运行时保留名 ${name}`;
    }
    const reserved = options.reservedNames instanceof Set ? options.reservedNames : new Set();
    if (reserved.has(name)) return `不能与全局变量或常量 ${name} 重名`;
    const existing = options.existingNames instanceof Set ? options.existingNames : new Set();
    if (existing.has(name)) return `同一作用域内不能重复使用 ${name}`;
    return "";
}

export function normalizeCompositionControllerVariableName(rawName, options = {}) {
    const candidate = String(rawName || "").trim();
    if (!getCompositionControllerVariableNameError(candidate, options)) return candidate;
    const used = new Set([
        ...(options.reservedNames instanceof Set ? options.reservedNames : []),
        ...(options.existingNames instanceof Set ? options.existingNames : [])
    ]);
    const base = String(options.fallbackName || "temp").trim() || "temp";
    let index = 1;
    let next = base;
    while (getCompositionControllerVariableNameError(next, { reservedNames: used })) {
        next = `${base}${index++}`;
    }
    return next;
}

const COMPOSITION_DATA_TYPES = new Set(["single", "particle_shape", "sequenced_shape"]);
const CPARTICLE_RENDER_LAYERS = new Set([
    "OPAQUE",
    "TRANSLUCENT",
    "ADDITION_BLEND",
    "ADDITION_BLEND_NOT_HDR",
    "ADDITION_BLEND_NOT_HDR_NO_DEPTH_WRITE",
    "ADDITION_BLEND_TRANSLUCENT",
    "ADDITION_BLEND_TRANSLUCENT_NOT_HDR",
    "ADDITION_BLEND_TRANSLUCENT_NOT_HDR_NO_DEPTH_WRITE",
    "ADDITION_BLEND_TRANSLUCENT_NO_DEPTH_WRITE"
]);

export function isCompositionLeafParticleType(type) {
    return type === "single" || type === "cparticle";
}

export function isCompositionShapeType(type) {
    return type === "particle_shape" || type === "sequenced_shape";
}

export function compositionShapeNodeHasParticleLeaf(node) {
    if (!node || typeof node !== "object") return false;
    if (isCompositionLeafParticleType(node.type)) return true;
    const childLists = [node.children, node.shapeChildren];
    return childLists.some((children) => Array.isArray(children)
        && children.some((child) => compositionShapeNodeHasParticleLeaf(child)));
}

export function isCompositionCardUsingCParticle(card) {
    if (!card || typeof card !== "object") return false;
    const type = String(card.dataType || "single");
    if (isCompositionShapeType(type)) return card.useCParticle === true;
    return isCompositionLeafParticleType(type) && card.particleBackend === "cparticle";
}

export function findCompositionNestedShapePaths(card) {
    if (!card || !isCompositionShapeType(card.dataType) || !Array.isArray(card.shapeChildren)) return [];
    const paths = [];
    const walk = (nodes, parentPath) => {
        for (let index = 0; index < (Array.isArray(nodes) ? nodes.length : 0); index += 1) {
            const node = nodes[index];
            const path = [...parentPath, index];
            if (isCompositionShapeType(node?.type)) paths.push(path);
            walk(node?.children, path);
        }
    };
    walk(card.shapeChildren, []);
    return paths;
}

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function integerValue(value) {
    return Math.trunc(numberValue(value));
}

function clampNumber(value, min, max) {
    let lower = Number(min);
    let upper = Number(max);
    if (!Number.isFinite(lower)) lower = 0;
    if (!Number.isFinite(upper)) upper = lower;
    if (upper < lower) upper = lower;
    return Math.min(Math.max(Number(value) || 0, lower), upper);
}

function idFactory(options) {
    return typeof options?.idFactory === "function"
        ? options.idFactory
        : createCompositionId;
}

function ensureId(value, options) {
    return value || idFactory(options)();
}

function makeUniqueCompositionCardId(usedIds, options = {}) {
    const factory = idFactory(options);
    for (let attempt = 0; attempt < 1024; attempt += 1) {
        const candidate = String(factory() || "").trim();
        if (candidate && !usedIds.has(candidate)) {
            usedIds.add(candidate);
            return candidate;
        }
    }
    let candidate = `card_${Date.now().toString(36)}_${usedIds.size.toString(36)}`;
    while (usedIds.has(candidate)) {
        candidate = `card_${Date.now().toString(36)}_${(usedIds.size + 1).toString(36)}`;
    }
    usedIds.add(candidate);
    return candidate;
}

function normalizeDataType(value) {
    const type = String(value || "");
    return COMPOSITION_DATA_TYPES.has(type) ? type : "single";
}

function normalizeParticleBackend(value) {
    return String(value || "") === "cparticle" ? "cparticle" : "single";
}

function normalizeCParticleRenderLayer(value) {
    const layer = String(value || "");
    return CPARTICLE_RENDER_LAYERS.has(layer) ? layer : "ADDITION_BLEND_TRANSLUCENT";
}

function parseVectorLiteralNumbers(rawExpression, fallback = { x: 0, y: 1, z: 0 }) {
    const text = String(rawExpression || "").trim();
    const base = {
        x: Number.isFinite(Number(fallback?.x)) ? numberValue(fallback.x) : 0,
        y: Number.isFinite(Number(fallback?.y)) ? numberValue(fallback.y) : 1,
        z: Number.isFinite(Number(fallback?.z)) ? numberValue(fallback.z) : 0
    };
    const match = text.match(/(?:Vec3|Vec3d|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
    if (!match) return base;
    const read = (raw, fallbackValue) => {
        const parsed = Number(String(raw || "").trim().replace(/[fFdDlL]/g, ""));
        return Number.isFinite(parsed) ? parsed : fallbackValue;
    };
    return {
        x: read(match[1], base.x),
        y: read(match[2], base.y),
        z: read(match[3], base.z)
    };
}

function normalizePoint(rawPoint) {
    const point = rawPoint && typeof rawPoint === "object" ? { ...rawPoint } : {};
    point.x = numberValue(point.x);
    point.y = numberValue(point.y);
    point.z = numberValue(point.z);
    return point;
}

function normalizeAxis(target, prefix) {
    const presetKey = `${prefix}Preset`;
    const expressionKey = `${prefix}Expr`;
    const constructorKey = `${prefix}ManualCtor`;
    const xKey = `${prefix}ManualX`;
    const yKey = `${prefix}ManualY`;
    const zKey = `${prefix}ManualZ`;
    const fallback = "RelativeLocation.yAxis()";
    target[presetKey] = String(target[presetKey] || fallback);
    target[expressionKey] = String(target[expressionKey] || target[presetKey] || fallback);
    target[constructorKey] = normalizeVectorCtor(
        target[constructorKey] || parseCtorInLiteral(target[expressionKey], "RelativeLocation")
    );
    target[xKey] = Number.isFinite(Number(target[xKey])) ? numberValue(target[xKey]) : 0;
    target[yKey] = Number.isFinite(Number(target[yKey])) ? numberValue(target[yKey]) : 1;
    target[zKey] = Number.isFinite(Number(target[zKey])) ? numberValue(target[zKey]) : 0;
}

function normalizeAngleOffset(target) {
    target.angleOffsetEnabled = target.angleOffsetEnabled === true;
    target.angleOffsetCount = Math.max(1, integerValue(target.angleOffsetCount || 1));
    target.angleOffsetGlowTick = Math.max(1, integerValue(target.angleOffsetGlowTick || 20));
    target.angleOffsetEase = normalizeAngleOffsetEaseName(target.angleOffsetEase || "outCubic");
    Object.assign(target, normalizeAngleOffsetEaseSpecialParams(target));
    target.angleOffsetReverseOnDisable = target.angleOffsetReverseOnDisable === true;
    target.angleOffsetAngleMode = target.angleOffsetAngleMode === "expr" ? "expr" : "numeric";
    target.angleOffsetAngleValue = Number.isFinite(Number(target.angleOffsetAngleValue))
        ? numberValue(target.angleOffsetAngleValue)
        : 360;
    target.angleOffsetAngleUnit = normalizeAngleUnit(target.angleOffsetAngleUnit || "deg");
    target.angleOffsetAngleExpr = String(target.angleOffsetAngleExpr || "PI * 2");
    target.angleOffsetAnglePreset = String(
        target.angleOffsetAnglePreset || target.angleOffsetAngleExpr || "PI * 2"
    );
}

function normalizeParticleInit(raw, options) {
    const item = raw && typeof raw === "object" ? { ...raw } : {};
    const expressionPreset = String(item.exprPreset || "");
    const codegenExpressionPreset = String(item.codegenExprPreset || "");
    item.id = ensureId(item.id, options);
    item.target = String(item.target || "size");
    item.expr = String(item.expr || expressionPreset || "");
    item.exprPreset = expressionPreset;
    item.codegenExpr = String(item.codegenExpr || codegenExpressionPreset || "");
    item.codegenExprPreset = codegenExpressionPreset;
    return item;
}

function normalizeControllerVariable(raw, options) {
    const item = raw && typeof raw === "object" ? { ...raw } : {};
    item.id = ensureId(item.id, options);
    const reservedNames = options?.controllerReservedNames instanceof Set
        ? options.controllerReservedNames
        : new Set();
    const existingNames = options?.controllerExistingNames instanceof Set
        ? options.controllerExistingNames
        : new Set();
    item.name = normalizeCompositionControllerVariableName(item.name, {
        reservedNames,
        existingNames,
        fallbackName: options?.controllerFallbackName || "temp"
    });
    item.type = String(item.type || "Boolean");
    item.expr = String(item.expr || "true");
    return item;
}

function normalizeControllerVariables(rawList, options = {}) {
    const reservedNames = new Set([
        ...COMPOSITION_LAMBDA_RESERVED_NAMES,
        ...(options.controllerReservedNames instanceof Set ? options.controllerReservedNames : [])
    ]);
    const usedNames = new Set(reservedNames);
    return Array.isArray(rawList)
        ? rawList.map((item, index) => {
            const normalized = normalizeControllerVariable(item, {
                ...options,
                controllerReservedNames: reservedNames,
                controllerExistingNames: usedNames,
                controllerFallbackName: `temp${index + 1}`
            });
            usedNames.add(normalized.name);
            return normalized;
        })
        : [];
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
    return `${normalizeKotlinDoubleLiteralText(raw)}F`;
}

function defaultLiteralForKotlinType(typeName) {
    const type = String(typeName || "").trim().toLowerCase();
    if (type === "string") return "\"\"";
    if (type === "boolean") return "false";
    if (type === "float") return "0F";
    if (type === "double") return "0.0";
    if (type === "long") return "0L";
    if (type === "int" || type === "short" || type === "byte") return "0";
    if (type === "vec3") return "Vec3.ZERO";
    if (type === "vec3d") return "Vec3d.ZERO";
    if (type === "vector3f") return "Vector3f(0F,0F,0F)";
    if (type === "relativelocation") return "RelativeLocation(0.0, 0.0, 0.0)";
    return "0";
}

function normalizeKotlinValue(value, kotlinType) {
    const type = String(kotlinType || "").trim().toLowerCase();
    const raw = String(value ?? "").trim();
    const toIntegerText = (number) => String(number < 0 ? Math.ceil(number) : Math.floor(number));
    if (!raw) return defaultLiteralForKotlinType(kotlinType);
    if (type === "boolean") {
        if (/^true$/i.test(raw)) return "true";
        if (/^false$/i.test(raw)) return "false";
        return raw;
    }
    if (type === "string") return raw || "\"\"";
    if (!isPlainNumericLiteralText(raw)) return raw;
    const cleaned = raw.replace(/[fFdDlL]/g, "");
    const number = Number(cleaned);
    if (!Number.isFinite(number)) return defaultLiteralForKotlinType(kotlinType);
    if (type === "int" || type === "short" || type === "byte") return toIntegerText(number);
    if (type === "long") return `${toIntegerText(number)}L`;
    if (type === "float") return normalizeKotlinFloatLiteralText(cleaned);
    if (type === "double") return normalizeKotlinDoubleLiteralText(cleaned);
    return raw;
}

function normalizeGlobalValue(raw, fallbackName, fallbackType, options, mutable) {
    const value = raw && typeof raw === "object" ? { ...raw } : {};
    value.id = ensureId(value.id, options);
    value.name = String(value.name || fallbackName);
    const type = String(value.type || fallbackType);
    value.type = COMPOSITION_GLOBAL_VALUE_TYPES.includes(type) ? type : fallbackType;
    value.value = String(value.value ?? defaultLiteralForKotlinType(value.type));
    if (isVectorLiteralType(value.type)) {
        const parsed = parseVectorLiteralNumbers(value.value, { x: 0, y: 0, z: 0 });
        value.value = formatVectorLiteral(value.type, parsed.x, parsed.y, parsed.z);
    } else {
        value.value = normalizeKotlinValue(value.value, value.type);
    }
    if (mutable) {
        value.codec = value.codec !== false;
        value.mutable = value.mutable !== false;
    }
    return value;
}

export function createCompositionId() {
    return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
}

export function cloneCompositionValue(value) {
    return cloneJson(value);
}

export function normalizeCompositionPackageName(raw, fallback = "cn.coostack.compositions") {
    let text = String(raw || "").trim();
    if (!text) text = fallback;
    text = text.replace(/^package\s+/i, "").replace(/;+\s*$/g, "").trim();
    return text || fallback;
}

export function createCompositionCardSectionCollapse() {
    return Object.fromEntries(COMPOSITION_CARD_SECTION_KEYS.map((key) => [key, false]));
}

export function normalizeCompositionCardSectionCollapse(raw) {
    const normalized = createCompositionCardSectionCollapse();
    if (!raw || typeof raw !== "object") return normalized;
    for (const key of COMPOSITION_CARD_SECTION_KEYS) {
        normalized[key] = raw[key] === true;
    }
    return normalized;
}

export function normalizeCompositionGlobalVariable(raw, options = {}) {
    return normalizeGlobalValue(raw, "value", "Double", options, true);
}

export function normalizeCompositionGlobalConstant(raw, options = {}) {
    return normalizeGlobalValue(raw, "constant", "Int", options, false);
}

export function normalizeCompositionAnimate(raw, options = {}) {
    const animate = raw && typeof raw === "object" ? { ...raw } : {};
    animate.id = ensureId(animate.id, options);
    animate.count = Math.max(1, integerValue(animate.count || 1));
    animate.condition = String(animate.condition || "");
    return animate;
}

export function normalizeCompositionControllerAction(raw, options = {}) {
    const action = raw && typeof raw === "object" ? { ...raw } : {};
    action.id = ensureId(action.id, options);
    action.type = COMPOSITION_CONTROLLER_ACTION_TYPES.some((item) => item.id === action.type)
        ? action.type
        : "tick_js";
    action.script = String(action.script || "");
    return action;
}

export function normalizeCompositionDisplayAction(raw, options = {}) {
    const action = raw && typeof raw === "object" ? { ...raw } : {};
    action.id = ensureId(action.id, options);
    if (action.type === "rotateTo") action.type = "rotateToPoint";
    action.type = COMPOSITION_DISPLAY_ACTION_TYPES.some((item) => item.id === action.type)
        ? action.type
        : "rotateToWithAngle";
    action.toUsePreset = action.toUsePreset === true;
    action.toPreset = String(action.toPreset || "RelativeLocation.yAxis()");
    action.toExpr = String(action.toExpr || action.toPreset || "RelativeLocation.yAxis()");
    action.toManualCtor = normalizeVectorCtor(
        action.toManualCtor || parseCtorInLiteral(action.toExpr, "RelativeLocation")
    );
    action.toManualX = Number.isFinite(Number(action.toManualX)) ? numberValue(action.toManualX) : 0;
    action.toManualY = Number.isFinite(Number(action.toManualY)) ? numberValue(action.toManualY) : 1;
    action.toManualZ = Number.isFinite(Number(action.toManualZ)) ? numberValue(action.toManualZ) : 0;
    action.angleMode = action.angleMode === "expr" ? "expr" : "numeric";
    action.angleValue = Number.isFinite(Number(action.angleValue)) ? numberValue(action.angleValue) : 0.05;
    action.angleUnit = normalizeAngleUnit(action.angleUnit || "rad");
    action.angleExpr = String(action.angleExpr || "speed / 180 * PI");
    action.angleExprPreset = String(action.angleExprPreset || action.angleExpr || "speed / 180 * PI");
    action.expression = String(action.expression || "");
    return action;
}

export function createEmbeddedPointsBuilderState(options = {}) {
    return normalizeEmbeddedPointsBuilderState({}, options);
}

export function normalizeEmbeddedPointsBuilderState(raw, options = {}) {
    return normalizePointsBuilderState(raw, {
        ...(options.pointsBuilder || {}),
        idFactory: options.pointsBuilderIdFactory || options.idFactory
    });
}

function normalizeShapeBase(raw, index, options) {
    const shape = raw && typeof raw === "object" ? { ...raw } : {};
    shape.id = ensureId(shape.id, options);
    shape.type = normalizeDataType(shape.type);
    shape.bindMode = shape.bindMode === "point" ? "point" : "builder";
    shape.point = normalizePoint(shape.point);
    shape.builderState = normalizeEmbeddedPointsBuilderState(shape.builderState, options);
    normalizeAxis(shape, "axis");
    shape.displayActions = Array.isArray(shape.displayActions)
        ? shape.displayActions.map((action) => normalizeCompositionDisplayAction(action, options))
        : [];
    normalizeAngleOffset(shape);
    shape.scale = normalizeScaleHelperConfig(shape.scale, { type: "none" });
    shape.scale.runMode = "auto";
    shape.growthAnimates = shape.type === "sequenced_shape" && Array.isArray(shape.growthAnimates)
        ? shape.growthAnimates.map((animate) => normalizeCompositionAnimate(animate, options))
        : [];
    return shape;
}

export function normalizeCompositionNestedLevel(raw, index = 0, options = {}) {
    const level = normalizeShapeBase(raw, index, options);
    level.collapsed = !!level.collapsed;
    level.effectClass = String(level.effectClass || DEFAULT_COMPOSITION_EFFECT_CLASS);
    level.useTexture = level.useTexture !== false;
    level.cparticleRenderLayer = normalizeCParticleRenderLayer(level.cparticleRenderLayer);
    level.name = String(level.name || `嵌套层${index + 2}`);
    return level;
}

export function createCompositionShapeNode(init = {}, index = 0, options = {}) {
    return normalizeCompositionShapeNode(init, index, options);
}

export function normalizeCompositionShapeNode(raw = {}, index = 0, options = {}) {
    const node = normalizeShapeBase(raw, index, options);
    node.name = String(node.name || `子节点 ${index + 1}`);
    node.effectClass = String(node.effectClass || DEFAULT_COMPOSITION_EFFECT_CLASS);
    node.useTexture = node.useTexture !== false;
    node.useCParticle = isCompositionShapeType(node.type) && node.useCParticle === true;
    node.cparticleRenderLayer = normalizeCParticleRenderLayer(node.cparticleRenderLayer);
    node.randomAgePreTick = node.randomAgePreTick === true;
    node.cparticleAlpha = normalizeCParticleAlphaConfig(node.cparticleAlpha);
    delete node.randomInitialAge;
    node.particleInit = Array.isArray(node.particleInit)
        ? node.particleInit.map((item) => normalizeParticleInit(item, options))
        : [];
    node.controllerVars = normalizeControllerVariables(node.controllerVars, options);
    node.controllerActions = Array.isArray(node.controllerActions)
        ? node.controllerActions.map((action) => normalizeCompositionControllerAction(action, options))
        : [];
    node.children = isCompositionLeafParticleType(node.type)
        ? []
        : (Array.isArray(node.children)
            ? node.children.map((child, childIndex) => normalizeCompositionShapeNode(child, childIndex, options))
            : []);
    return node;
}

export function createCompositionCard(index = 0, options = {}) {
    return normalizeCompositionCard({
        name: `卡片 ${index + 1}`,
        bindMode: "builder",
        point: { x: 0, y: 0, z: 0 },
        builderState: createEmbeddedPointsBuilderState(options),
        dataType: "single",
        particleBackend: "single",
        globalCParticleAuto: false,
        useCParticle: false,
        singleEffectClass: DEFAULT_COMPOSITION_EFFECT_CLASS,
        singleUseTexture: true,
        cparticleRenderLayer: "ADDITION_BLEND_TRANSLUCENT",
        randomAgePreTick: false,
        cparticleAlpha: normalizeCParticleAlphaConfig(),
        particleInit: [],
        controllerVars: [],
        controllerActions: [],
        controllerInitScript: "",
        controllerTickScript: "",
        rotateToWithAngle: false,
        rotateToUsePreset: false,
        rotateToPreset: "RelativeLocation.yAxis()",
        rotateToExpr: "RelativeLocation.yAxis()",
        rotateAngleMode: "numeric",
        rotateAngleValue: 0.05,
        rotateAngleUnit: "rad",
        rotateAnglePreset: "speed / 180 * PI",
        rotateAngleExpr: "speed / 180 * PI",
        angleOffsetEnabled: false,
        angleOffsetCount: 1,
        angleOffsetGlowTick: 20,
        angleOffsetEase: "outCubic",
        angleOffsetReverseOnDisable: false,
        angleOffsetAngleMode: "numeric",
        angleOffsetAngleValue: 360,
        angleOffsetAngleUnit: "deg",
        angleOffsetAnglePreset: "PI * 2",
        angleOffsetAngleExpr: "PI * 2",
        growthAnimates: [],
        sequencedAnimates: [],
        shapeAxisPreset: "RelativeLocation.yAxis()",
        shapeAxisExpr: "RelativeLocation.yAxis()",
        shapeAxisManualCtor: "RelativeLocation",
        shapeAxisManualX: 0,
        shapeAxisManualY: 1,
        shapeAxisManualZ: 0,
        shapeDisplayActions: [],
        shapeScale: { type: "none" },
        shapeChildren: [],
        sectionCollapse: createCompositionCardSectionCollapse()
    }, index, options);
}

export function normalizeCompositionCard(raw, index = 0, options = {}) {
    const card = raw && typeof raw === "object" ? { ...raw } : {};
    card.id = ensureId(card.id, options);
    card.name = String(card.name || `卡片 ${index + 1}`);
    card.folded = !!card.folded;
    card.previewVisible = card.previewVisible !== false;
    card.previewSolo = card.previewSolo === true;
    card.sectionCollapse = normalizeCompositionCardSectionCollapse(card.sectionCollapse);
    card.bindMode = card.bindMode === "point" ? "point" : "builder";
    card.point = normalizePoint(card.point);
    card.builderState = normalizeEmbeddedPointsBuilderState(card.builderState, options);
    card.builderKotlinOverride = String(card.builderKotlinOverride || "");
    const legacyCParticle = String(card.dataType || "") === "cparticle";
    card.dataType = normalizeDataType(card.dataType);
    card.particleBackend = card.dataType === "single"
        ? normalizeParticleBackend(legacyCParticle ? "cparticle" : card.particleBackend)
        : "single";
    card.globalCParticleAuto = card.globalCParticleAuto === true;
    card.useCParticle = isCompositionShapeType(card.dataType) && card.useCParticle === true;
    card.singleEffectClass = String(card.singleEffectClass || DEFAULT_COMPOSITION_EFFECT_CLASS);
    card.singleUseTexture = card.singleUseTexture !== false;
    card.cparticleRenderLayer = normalizeCParticleRenderLayer(card.cparticleRenderLayer);
    card.randomAgePreTick = card.randomAgePreTick === true;
    card.cparticleAlpha = normalizeCParticleAlphaConfig(card.cparticleAlpha);
    delete card.randomInitialAge;
    card.particleInit = Array.isArray(card.particleInit)
        ? card.particleInit.map((item) => normalizeParticleInit(item, options))
        : [];
    card.controllerVars = normalizeControllerVariables(card.controllerVars, options);
    card.controllerActions = Array.isArray(card.controllerActions)
        ? card.controllerActions.map((action) => normalizeCompositionControllerAction(action, options))
        : [];
    const legacyControllerScript = String(card.controllerTickScript || "").trim();
    if (!card.controllerActions.length && legacyControllerScript) {
        card.controllerActions.push(normalizeCompositionControllerAction({
            type: "tick_js",
            script: legacyControllerScript
        }, options));
    }
    card.controllerTickScript = "";
    card.controllerInitScript = "";
    card.rotateToWithAngle = !!card.rotateToWithAngle;
    card.rotateToUsePreset = card.rotateToUsePreset === true;
    card.rotateToPreset = String(card.rotateToPreset || "RelativeLocation.yAxis()");
    card.rotateToExpr = String(card.rotateToExpr || card.rotateToPreset || "RelativeLocation.yAxis()");
    card.rotateToManualCtor = normalizeVectorCtor(
        card.rotateToManualCtor || parseCtorInLiteral(card.rotateToExpr, "RelativeLocation")
    );
    card.rotateToManualX = Number.isFinite(Number(card.rotateToManualX)) ? numberValue(card.rotateToManualX) : 0;
    card.rotateToManualY = Number.isFinite(Number(card.rotateToManualY)) ? numberValue(card.rotateToManualY) : 1;
    card.rotateToManualZ = Number.isFinite(Number(card.rotateToManualZ)) ? numberValue(card.rotateToManualZ) : 0;
    card.rotateAngleMode = card.rotateAngleMode === "expr" ? "expr" : "numeric";
    card.rotateAngleValue = Number.isFinite(Number(card.rotateAngleValue)) ? numberValue(card.rotateAngleValue) : 0.05;
    card.rotateAngleUnit = normalizeAngleUnit(card.rotateAngleUnit || "rad");
    card.rotateAngleExpr = String(card.rotateAngleExpr || "speed / 180 * PI");
    card.rotateAnglePreset = String(card.rotateAnglePreset || card.rotateAngleExpr || "speed / 180 * PI");
    normalizeAngleOffset(card);
    card.growthAnimates = card.dataType === "sequenced_shape" && Array.isArray(card.growthAnimates)
        ? card.growthAnimates.map((animate) => normalizeCompositionAnimate(animate, options))
        : [];
    card.sequencedAnimates = Array.isArray(card.sequencedAnimates)
        ? card.sequencedAnimates.map((animate) => normalizeCompositionAnimate(animate, options))
        : [];
    normalizeAxis(card, "shapeAxis");
    card.shapeDisplayActions = Array.isArray(card.shapeDisplayActions)
        ? card.shapeDisplayActions.map((action) => normalizeCompositionDisplayAction(action, options))
        : [];
    card.shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
    card.shapeScale.runMode = "auto";
    card.shapeChildren = isCompositionLeafParticleType(card.dataType)
        ? []
        : Array.isArray(card.shapeChildren)
        ? card.shapeChildren.map((child, childIndex) => normalizeCompositionShapeNode(child, childIndex, options))
        : [];
    card.viewPath = Array.isArray(card.viewPath) ? card.viewPath.map(integerValue) : [];
    return card;
}

export function createCompositionProject(init = {}, options = {}) {
    return normalizeCompositionProject({
        projectName: "NewComposition",
        packageName: "cn.coostack.compositions",
        mapping: "yarn",
        enableRemoveStatusOverride: false,
        compositionType: "particle",
        previewPlayTicks: 70,
        disabledInterval: 0,
        compositionAxisPreset: "RelativeLocation.yAxis()",
        compositionAxisExpr: "RelativeLocation.yAxis()",
        compositionAxisManualCtor: "RelativeLocation",
        compositionAxisManualX: 0,
        compositionAxisManualY: 1,
        compositionAxisManualZ: 0,
        projectAlpha: {
            type: "none",
            runMode: "auto",
            min: 0,
            max: 1,
            tick: 20,
            startMax: false,
            decreaseOnDisable: false
        },
        projectScale: {
            type: "none",
            runMode: "auto",
            min: 0.01,
            max: 4,
            tick: 18,
            c1x: 0.17106,
            c1y: 0.49026,
            c1z: 0,
            c2x: -0.771523,
            c2y: -0.116883,
            c2z: 0,
            reversedOnDisable: false
        },
        globalVars: [],
        globalConsts: [],
        compositionAnimates: [],
        displayActions: [],
        cards: [createCompositionCard(0, options)],
        settings: {
            theme: "dark-1",
            paramStep: 0.1,
            pointSize: 0.5,
            previewRenderCacheEnabled: true,
            previewCacheWorkerCount: 0,
            showAxes: true,
            showGrid: false,
            realtimeCode: true,
            previewFocusSingleCard: false,
            leftPanelTab: "cards",
            leftPanelWidth: 900,
            compositionLayerWidth: 300,
            compositionLayersOpen: true,
            projectSectionHeight: 42
        },
        useCParticle: false,
        hotkeys: cloneJson(DEFAULT_COMPOSITION_HOTKEYS),
        ...cloneJson(init || {})
    }, options);
}

export function normalizeCompositionProject(raw, options = {}) {
    const project = cloneJson(raw && typeof raw === "object" ? raw : {}) || {};
    project.settings = project.settings && typeof project.settings === "object" ? project.settings : {};
    if (project.projectSettings && typeof project.projectSettings === "object") {
        delete project.projectSettings.autoSaveIntervalsMinutes;
        if (!Object.keys(project.projectSettings).length) delete project.projectSettings;
    } else {
        delete project.projectSettings;
    }
    delete project.settings.autoSaveIntervalsMinutes;
    project.hotkeys = project.hotkeys && typeof project.hotkeys === "object" ? project.hotkeys : {};
    project.hotkeys.actions = project.hotkeys.actions && typeof project.hotkeys.actions === "object"
        ? project.hotkeys.actions
        : {};
    project.hotkeys.version = DEFAULT_COMPOSITION_HOTKEYS.version;
    project.hotkeys.actions = {
        ...DEFAULT_COMPOSITION_HOTKEYS.actions,
        ...project.hotkeys.actions
    };
    project.globalVars = Array.isArray(project.globalVars) ? project.globalVars : [];
    project.globalConsts = Array.isArray(project.globalConsts) ? project.globalConsts : [];
    project.compositionAnimates = Array.isArray(project.compositionAnimates) ? project.compositionAnimates : [];
    project.displayActions = Array.isArray(project.displayActions) ? project.displayActions : [];
    project.cards = Array.isArray(project.cards) ? project.cards : [];
    project.projectName = String(project.projectName || "NewComposition");
    project.packageName = normalizeCompositionPackageName(project.packageName);
    project.mapping = normalizeCompositionMapping(project.mapping);
    project.enableRemoveStatusOverride = project.enableRemoveStatusOverride === true;
    project.useCParticle = project.useCParticle === true || project.globalUseCParticle === true;
    delete project.globalUseCParticle;
    project.compositionType = project.compositionType === "sequenced" ? "sequenced" : "particle";
    project.previewPlayTicks = Math.max(1, integerValue(project.previewPlayTicks || 70));
    project.disabledInterval = Math.max(0, integerValue(project.disabledInterval || 0));
    project.compositionAxisPreset = String(project.compositionAxisPreset || "RelativeLocation.yAxis()");
    project.compositionAxisExpr = String(
        project.compositionAxisExpr || project.compositionAxisPreset || "RelativeLocation.yAxis()"
    );
    project.compositionAxisManualCtor = normalizeVectorCtor(
        project.compositionAxisManualCtor || parseCtorInLiteral(project.compositionAxisExpr, "RelativeLocation")
    );
    const parsedAxis = parseVectorLiteralNumbers(project.compositionAxisExpr, { x: 0, y: 1, z: 0 });
    project.compositionAxisManualX = Number.isFinite(Number(project.compositionAxisManualX))
        ? numberValue(project.compositionAxisManualX)
        : parsedAxis.x;
    project.compositionAxisManualY = Number.isFinite(Number(project.compositionAxisManualY))
        ? numberValue(project.compositionAxisManualY)
        : parsedAxis.y;
    project.compositionAxisManualZ = Number.isFinite(Number(project.compositionAxisManualZ))
        ? numberValue(project.compositionAxisManualZ)
        : parsedAxis.z;
    project.settings.theme = normalizeWorkbenchTheme(project.settings.theme);
    project.settings.paramStep = Math.max(0.000001, numberValue(project.settings.paramStep || 0.1));
    project.settings.pointSize = Math.max(0.001, numberValue(project.settings.pointSize || 0.5));
    project.settings.previewRenderCacheEnabled = project.settings.previewRenderCacheEnabled !== false;
    project.settings.previewCacheWorkerCount = clampNumber(
        integerValue(project.settings.previewCacheWorkerCount || 0),
        0,
        16
    );
    project.settings.showAxes = project.settings.showAxes !== false;
    project.settings.showGrid = project.settings.showGrid === true;
    project.settings.realtimeCode = project.settings.realtimeCode !== false;
    project.settings.previewFocusSingleCard = false;
    project.settings.leftPanelTab = "cards";
    const rawLeftWidth = numberValue(project.settings.leftPanelWidth || 0);
    project.settings.leftPanelWidth = clampNumber(
        rawLeftWidth < 820 || rawLeftWidth > 960 ? 900 : rawLeftWidth,
        620,
        1400
    );
    project.settings.compositionLayerWidth = clampNumber(
        numberValue(project.settings.compositionLayerWidth || 300),
        260,
        420
    );
    project.settings.compositionLayersOpen = true;
    project.settings.projectSectionHeight = clampNumber(
        numberValue(project.settings.projectSectionHeight || 42),
        20,
        70
    );
    project.projectAlpha = normalizeAlphaHelperConfig(project.projectAlpha, { type: "none" });
    project.projectScale = normalizeScaleHelperConfig(project.projectScale, { type: "none" });
    project.globalVars = project.globalVars.map((value) => normalizeCompositionGlobalVariable(value, options));
    project.globalConsts = project.globalConsts.map((value) => normalizeCompositionGlobalConstant(value, options));
    const controllerReservedNames = new Set([
        ...COMPOSITION_LAMBDA_RESERVED_NAMES,
        ...project.globalVars.map((value) => String(value?.name || "").trim()).filter((name) => COMPOSITION_IDENTIFIER_RE.test(name)),
        ...project.globalConsts.map((value) => String(value?.name || "").trim()).filter((name) => COMPOSITION_IDENTIFIER_RE.test(name))
    ]);
    project.compositionAnimates = project.compositionAnimates.map(
        (animate) => normalizeCompositionAnimate(animate, options)
    );
    project.displayActions = project.displayActions.map(
        (action) => normalizeCompositionDisplayAction(action, options)
    );
    const usedCardIds = new Set();
    project.cards = project.cards.map((card, index) => {
        const normalized = normalizeCompositionCard(card, index, {
            ...options,
            controllerReservedNames
        });
        const cardId = String(normalized.id || "").trim();
        if (!cardId || usedCardIds.has(cardId)) {
            normalized.id = makeUniqueCompositionCardId(usedCardIds, options);
        } else {
            usedCardIds.add(cardId);
        }
        return normalized;
    });
    const hasDirectionVariable = project.globalVars.some(
        (value) => String(value?.name || "").trim() === "direction"
    );
    if (!hasDirectionVariable) {
        const migrateDirection = (action) => {
            if (String(action.toExpr || "").trim() !== "direction.asRelative()") return;
            action.toExpr = "RelativeLocation.yAxis()";
            action.toPreset = "RelativeLocation.yAxis()";
        };
        project.displayActions.forEach(migrateDirection);
        for (const card of project.cards) {
            if (String(card.rotateToExpr || "").trim() === "direction.asRelative()") {
                card.rotateToExpr = "RelativeLocation.yAxis()";
                card.rotateToPreset = "RelativeLocation.yAxis()";
            }
            card.shapeDisplayActions.forEach(migrateDirection);
        }
    }
    project.globalVars = project.globalVars.filter((value) => {
        const name = String(value?.name || "").trim();
        if (name !== "direction") return true;
        const type = String(value?.type || "").trim();
        const rawValue = String(value?.value || "").trim();
        if (type !== "Vec3" || rawValue !== "Vec3.ZERO") return true;
        return project.displayActions.some((action) => String(action?.toExpr || "").includes("direction"))
            || project.cards.some((card) => String(card?.rotateToExpr || "").includes("direction")
                || card.shapeDisplayActions.some((action) => String(action?.toExpr || "").includes("direction")));
    });
    if (!project.cards.length) project.cards.push(createCompositionCard(0, options));
    for (const card of project.cards) {
        const isShape = isCompositionShapeType(card.dataType);
        if (project.useCParticle && (isCompositionLeafParticleType(card.dataType) || isShape)) {
            const alreadyUsesCParticle = isCompositionLeafParticleType(card.dataType)
                ? card.particleBackend === "cparticle"
                : card.useCParticle === true;
            if (isCompositionLeafParticleType(card.dataType)) {
                card.particleBackend = "cparticle";
            } else {
                card.useCParticle = true;
            }
            if (!alreadyUsesCParticle) card.globalCParticleAuto = true;
        } else if (!project.useCParticle && card.globalCParticleAuto) {
            if (isCompositionLeafParticleType(card.dataType)) {
                card.particleBackend = "single";
            } else if (isShape) {
                card.useCParticle = false;
            }
            card.globalCParticleAuto = false;
        }
    }
    return project;
}
