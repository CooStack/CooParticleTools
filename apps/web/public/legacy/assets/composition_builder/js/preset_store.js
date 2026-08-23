export const COMPOSITION_PRESET_SCHEMA_VERSION = 1;
export const COMPOSITION_PRESET_KIND = "coo-composition-preset";
export const COMPOSITION_PRESET_CATEGORIES = Object.freeze(["cards", "nodes", "shared"]);
export const COMPOSITION_PRESET_SECTIONS = Object.freeze(["position", "particle", "properties"]);

const DATA_TYPES = new Set(["single", "cparticle", "particle_shape", "sequenced_shape"]);
const PARTICLE_BACKENDS = new Set(["single", "cparticle"]);
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
const SOURCE_KINDS = new Set(["card", "node"]);
const CONTROLLER_ACTION_TYPES = new Set(["tick_js"]);
const CONTROLLER_VARIABLE_TYPES = new Set([
    "Int", "Long", "Float", "Double", "Boolean", "String", "Vec3", "RelativeLocation", "Vector3f"
]);
const DISPLAY_ACTION_TYPES = new Set(["rotateToPoint", "rotateAsAxis", "rotateToWithAngle", "expression"]);
const SCALE_TYPES = new Set(["none", "linear", "bezier"]);
const SCALE_RUN_MODES = new Set(["auto", "manual"]);
const ANGLE_OFFSET_EASE_TYPES = new Set([
    "linear", "outCubic", "inOutSine", "outExpo", "inCubic", "inOutCubic",
    "outQuad", "outBack", "outElastic", "outBounce", "bezierEase"
]);
const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const INVALID_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_PRESET_NAME_LENGTH = 80;
const MAX_PRESET_DESCRIPTION_LENGTH = 240;
const MAX_PRESET_DEPTH = 16;
const MAX_TREE_PATH_LENGTH = 64;
const isCParticleOwnerType = (type) => type === "particle_shape" || type === "sequenced_shape";

const AXIS_FIELDS = Object.freeze([
    "preset", "expr", "manualCtor", "manualX", "manualY", "manualZ"
]);
const ANGLE_OFFSET_FIELDS = Object.freeze([
    "angleOffsetEnabled",
    "angleOffsetCount",
    "angleOffsetGlowTick",
    "angleOffsetEase",
    "angleOffsetEaseOvershoot",
    "angleOffsetEasePeriod",
    "angleOffsetEaseDecay",
    "angleOffsetEaseShift",
    "angleOffsetEaseN1",
    "angleOffsetEaseD1",
    "angleOffsetEaseBezierStartX",
    "angleOffsetEaseBezierStartY",
    "angleOffsetEaseBezierEndX",
    "angleOffsetEaseBezierEndY",
    "angleOffsetReverseOnDisable",
    "angleOffsetAngleMode",
    "angleOffsetAngleValue",
    "angleOffsetAngleUnit",
    "angleOffsetAngleExpr",
    "angleOffsetAnglePreset"
]);
const SINGLE_DISPLAY_FIELDS = Object.freeze([
    "rotateToWithAngle",
    "rotateToUsePreset",
    "rotateToPreset",
    "rotateToExpr",
    "rotateToManualCtor",
    "rotateToManualX",
    "rotateToManualY",
    "rotateToManualZ",
    "rotateAngleMode",
    "rotateAngleValue",
    "rotateAngleUnit",
    "rotateAnglePreset",
    "rotateAngleExpr"
]);
const PARTICLE_INIT_FIELDS = Object.freeze([
    "target", "expr", "exprPreset", "codegenExpr", "codegenExprPreset"
]);
const CONTROLLER_VARIABLE_FIELDS = Object.freeze(["name", "type", "expr"]);
const CONTROLLER_ACTION_FIELDS = Object.freeze(["type", "script"]);
const DISPLAY_ACTION_FIELDS = Object.freeze([
    "type",
    "toUsePreset",
    "toPreset",
    "toExpr",
    "toManualCtor",
    "toManualX",
    "toManualY",
    "toManualZ",
    "angleMode",
    "angleValue",
    "angleUnit",
    "angleExpr",
    "angleExprPreset",
    "expression"
]);
const ANIMATE_FIELDS = Object.freeze(["count", "condition"]);
const SCALE_FIELDS = Object.freeze([
    "type", "runMode", "min", "max", "tick",
    "c1x", "c1y", "c1z", "c2x", "c2y", "c2z", "reversedOnDisable"
]);
const SCALE_NUMBER_FIELDS = Object.freeze([
    "min", "max", "tick", "c1x", "c1y", "c1z", "c2x", "c2y", "c2z"
]);
const ANGLE_OFFSET_NUMBER_FIELDS = Object.freeze([
    "angleOffsetEaseOvershoot",
    "angleOffsetEasePeriod",
    "angleOffsetEaseDecay",
    "angleOffsetEaseShift",
    "angleOffsetEaseN1",
    "angleOffsetEaseD1",
    "angleOffsetEaseBezierStartX",
    "angleOffsetEaseBezierStartY",
    "angleOffsetEaseBezierEndX",
    "angleOffsetEaseBezierEndY",
    "angleOffsetAngleValue"
]);

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, path) {
    if (!isPlainObject(value)) throw new Error(`${path} 必须是对象。`);
}

function assertAllowedKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new Error(`${path}.${key} 不是受支持的字段。`);
    }
}

function assertJsonSafe(value, path = "preset", depth = 0, budget = { count: 0 }) {
    budget.count += 1;
    if (budget.count > 50000) throw new Error("预设内容过大。");
    if (depth > 40) throw new Error(`${path} 嵌套过深。`);
    if (value == null || typeof value === "boolean") return;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`${path} 包含非有限数字。`);
        return;
    }
    if (typeof value === "string") {
        if (value.length > 100000) throw new Error(`${path} 字符串过长。`);
        return;
    }
    if (Array.isArray(value)) {
        if (value.length > 5000) throw new Error(`${path} 数组过长。`);
        value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`, depth + 1, budget));
        return;
    }
    assertPlainObject(value, path);
    for (const [key, item] of Object.entries(value)) {
        if (DANGEROUS_KEYS.has(key)) throw new Error(`${path} 包含危险字段 ${key}。`);
        if (key.length > 128) throw new Error(`${path} 包含过长字段名。`);
        assertJsonSafe(item, `${path}.${key}`, depth + 1, budget);
    }
}

function copyFields(source, fields) {
    const out = {};
    for (const field of fields) {
        if (source?.[field] !== undefined) out[field] = cloneJson(source[field]);
    }
    return out;
}

function copyListFields(value, fields) {
    return Array.isArray(value) ? value.map((item) => copyFields(item, fields)) : [];
}

function assignFields(target, source, fields) {
    for (const field of fields) {
        if (source?.[field] !== undefined) target[field] = cloneJson(source[field]);
    }
}

export function normalizePresetCategory(rawCategory) {
    const raw = String(rawCategory || "");
    const category = raw.trim();
    if (!category || raw !== category || category.length > MAX_PRESET_NAME_LENGTH) {
        throw new Error("预设目录名称无效。");
    }
    if (category === "." || category === ".." || INVALID_NAME_CHARS.test(category)) {
        throw new Error("预设目录名称包含非法字符。");
    }
    if (/[. ]$/.test(category) || WINDOWS_RESERVED_NAMES.test(category)) {
        throw new Error("预设目录不能使用保留文件名，也不能以句点或空格结尾。");
    }
    return COMPOSITION_PRESET_CATEGORIES.find((item) => item.toLowerCase() === category.toLowerCase()) || category;
}

export function normalizePresetName(rawName) {
    let name = String(rawName || "").trim();
    if (/\.json$/i.test(name)) name = name.slice(0, -5).trim();
    if (!name) throw new Error("请输入预设名称。");
    if (name.length > MAX_PRESET_NAME_LENGTH) throw new Error(`预设名称不能超过 ${MAX_PRESET_NAME_LENGTH} 个字符。`);
    if (name === "." || name === ".." || INVALID_NAME_CHARS.test(name)) {
        throw new Error("预设名称包含非法字符。");
    }
    if (/[. ]$/.test(name) || WINDOWS_RESERVED_NAMES.test(name)) {
        throw new Error("预设名称不能使用保留文件名，也不能以句点或空格结尾。");
    }
    return name;
}

export function normalizePresetDescription(rawDescription) {
    const description = String(rawDescription || "").trim();
    if (description.length > MAX_PRESET_DESCRIPTION_LENGTH) {
        throw new Error(`预设描述不能超过 ${MAX_PRESET_DESCRIPTION_LENGTH} 个字符。`);
    }
    return description;
}

export function presetFileName(rawName) {
    return `${normalizePresetName(rawName)}.json`;
}

export function normalizePresetTreePath(rawPath) {
    if (!Array.isArray(rawPath) || rawPath.length > MAX_TREE_PATH_LENGTH) {
        throw new Error("treePath 必须是长度不超过 64 的数组。");
    }
    return rawPath.map((item) => {
        if (!Number.isSafeInteger(item) || item < 0) throw new Error("treePath 只能包含非负整数。");
        return item;
    });
}

export function isPresetCategoryAccessible(targetKind, category) {
    const kind = String(targetKind || "");
    normalizePresetCategory(category);
    return SOURCE_KINDS.has(kind);
}

function readTargetType(target, targetKind) {
    return String(targetKind === "card" ? target?.dataType : target?.type) || "single";
}

function readTargetChildren(target, targetKind) {
    const children = targetKind === "card" ? target?.shapeChildren : target?.children;
    return Array.isArray(children) ? children : [];
}

function isLeafParticleType(type) {
    return type === "single" || type === "cparticle";
}

function captureAxis(target, targetKind) {
    const prefix = targetKind === "card" ? "shapeAxis" : "axis";
    return {
        preset: String(target?.[`${prefix}Preset`] || "RelativeLocation.yAxis()"),
        expr: String(target?.[`${prefix}Expr`] || "RelativeLocation.yAxis()"),
        manualCtor: String(target?.[`${prefix}ManualCtor`] || "RelativeLocation"),
        manualX: Number(target?.[`${prefix}ManualX`] || 0),
        manualY: Number(target?.[`${prefix}ManualY`] ?? 1),
        manualZ: Number(target?.[`${prefix}ManualZ`] || 0)
    };
}

function captureCanonicalTarget(target, targetKind, depth = 0) {
    if (depth > MAX_PRESET_DEPTH) throw new Error("子节点嵌套超过预设支持的最大深度。");
    const dataType = readTargetType(target, targetKind);
    if (!DATA_TYPES.has(dataType)) throw new Error(`不支持的粒子类型：${dataType}`);
    const effectClass = targetKind === "card" ? target?.singleEffectClass : target?.effectClass;
    const useTexture = targetKind === "card" ? target?.singleUseTexture : target?.useTexture;
    const displayActions = targetKind === "card" ? target?.shapeDisplayActions : target?.displayActions;
    const scale = targetKind === "card" ? target?.shapeScale : target?.scale;
    const position = {
        bindMode: target?.bindMode === "point" ? "point" : "builder",
        point: {
            x: Number(target?.point?.x || 0),
            y: Number(target?.point?.y || 0),
            z: Number(target?.point?.z || 0)
        },
        builderState: cloneJson(target?.builderState || {})
    };
    if (targetKind === "card") position.builderKotlinOverride = String(target?.builderKotlinOverride || "");

    return {
        sections: {
            position,
            particle: {
                dataType,
                particleBackend: targetKind === "card" && dataType === "single" && target?.particleBackend === "cparticle"
                    ? "cparticle"
                    : "single",
                effectClass: String(effectClass || ""),
                useTexture: useTexture !== false,
                useCParticle: targetKind === "card"
                    && isCParticleOwnerType(dataType)
                    && target?.useCParticle === true,
                cparticleRenderLayer: CPARTICLE_RENDER_LAYERS.has(String(target?.cparticleRenderLayer || ""))
                    ? String(target.cparticleRenderLayer)
                    : "ADDITION_BLEND_TRANSLUCENT",
                randomAgePreTick: target?.randomAgePreTick === true,
                cparticleAlpha: cloneJson(target?.cparticleAlpha || {}),
                axis: captureAxis(target, targetKind),
                children: readTargetChildren(target, targetKind)
                    .map((child) => captureCanonicalTarget(child, "node", depth + 1))
            },
            properties: {
                particleInit: copyListFields(target?.particleInit, PARTICLE_INIT_FIELDS),
                controllerVars: copyListFields(target?.controllerVars, CONTROLLER_VARIABLE_FIELDS),
                controllerActions: copyListFields(target?.controllerActions, CONTROLLER_ACTION_FIELDS),
                displayActions: copyListFields(displayActions, DISPLAY_ACTION_FIELDS),
                scale: copyFields(scale, SCALE_FIELDS),
                growthAnimates: copyListFields(target?.growthAnimates, ANIMATE_FIELDS),
                angleOffset: copyFields(target, ANGLE_OFFSET_FIELDS),
                ...(targetKind === "card" ? {
                    sequencedAnimates: copyListFields(target?.sequencedAnimates, ANIMATE_FIELDS),
                    singleDisplay: copyFields(target, SINGLE_DISPLAY_FIELDS)
                } : {})
            }
        }
    };
}

export function createCompositionPreset({ name, description = "", sourceKind, target, cardId = "", treePath = [], now = Date.now() } = {}) {
    const normalizedName = normalizePresetName(name);
    const kind = String(sourceKind || "");
    if (!SOURCE_KINDS.has(kind)) throw new Error("预设来源必须是 card 或 node。");
    assertPlainObject(target, "target");
    const preset = {
        schemaVersion: COMPOSITION_PRESET_SCHEMA_VERSION,
        kind: COMPOSITION_PRESET_KIND,
        name: normalizedName,
        description: normalizePresetDescription(description),
        sourceKind: kind,
        createdAt: new Date(now).toISOString(),
        sourceContext: {
            cardId: String(cardId || ""),
            treePath: normalizePresetTreePath(kind === "node" ? treePath : [])
        },
        ...captureCanonicalTarget(target, kind)
    };
    return validateCompositionPreset(preset);
}

function validatePosition(position, path) {
    assertPlainObject(position, path);
    assertAllowedKeys(position, new Set(["bindMode", "point", "builderState", "builderKotlinOverride"]), path);
    if (!["builder", "point"].includes(position.bindMode)) throw new Error(`${path}.bindMode 无效。`);
    assertPlainObject(position.point, `${path}.point`);
    assertAllowedKeys(position.point, new Set(["x", "y", "z"]), `${path}.point`);
    for (const axis of ["x", "y", "z"]) {
        if (!Number.isFinite(position.point[axis])) throw new Error(`${path}.point.${axis} 必须是有限数字。`);
    }
    assertPlainObject(position.builderState, `${path}.builderState`);
    if (position.builderKotlinOverride !== undefined && typeof position.builderKotlinOverride !== "string") {
        throw new Error(`${path}.builderKotlinOverride 必须是字符串。`);
    }
}

function validateAxis(axis, path) {
    assertPlainObject(axis, path);
    assertAllowedKeys(axis, new Set(AXIS_FIELDS), path);
    for (const field of ["preset", "expr", "manualCtor"]) {
        if (typeof axis[field] !== "string") throw new Error(`${path}.${field} 必须是字符串。`);
    }
    for (const field of ["manualX", "manualY", "manualZ"]) {
        if (!Number.isFinite(axis[field])) throw new Error(`${path}.${field} 必须是有限数字。`);
    }
}

function validateStringFields(value, fields, path) {
    for (const field of fields) {
        if (typeof value[field] !== "string") throw new Error(`${path}.${field} 必须是字符串。`);
    }
}

function validateObjectList(value, path, validator) {
    if (!Array.isArray(value) || value.length > 5000) throw new Error(`${path} 必须是数组。`);
    value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        assertPlainObject(item, itemPath);
        validator(item, itemPath);
    });
}

function validateParticleInitList(value, path) {
    validateObjectList(value, path, (item, itemPath) => {
        assertAllowedKeys(item, new Set(PARTICLE_INIT_FIELDS), itemPath);
        validateStringFields(item, PARTICLE_INIT_FIELDS, itemPath);
    });
}

function validateControllerVariableList(value, path) {
    validateObjectList(value, path, (item, itemPath) => {
        assertAllowedKeys(item, new Set(CONTROLLER_VARIABLE_FIELDS), itemPath);
        validateStringFields(item, CONTROLLER_VARIABLE_FIELDS, itemPath);
        if (!CONTROLLER_VARIABLE_TYPES.has(item.type)) throw new Error(`${itemPath}.type 无效。`);
    });
}

function validateControllerActionList(value, path) {
    validateObjectList(value, path, (item, itemPath) => {
        assertAllowedKeys(item, new Set(CONTROLLER_ACTION_FIELDS), itemPath);
        validateStringFields(item, CONTROLLER_ACTION_FIELDS, itemPath);
        if (!CONTROLLER_ACTION_TYPES.has(item.type)) throw new Error(`${itemPath}.type 无效。`);
    });
}

function validateDisplayActionList(value, path) {
    validateObjectList(value, path, (item, itemPath) => {
        assertAllowedKeys(item, new Set(DISPLAY_ACTION_FIELDS), itemPath);
        if (!DISPLAY_ACTION_TYPES.has(item.type)) throw new Error(`${itemPath}.type 无效。`);
        if (typeof item.toUsePreset !== "boolean") throw new Error(`${itemPath}.toUsePreset 必须是布尔值。`);
        validateStringFields(item, [
            "toPreset", "toExpr", "toManualCtor", "angleMode", "angleUnit",
            "angleExpr", "angleExprPreset", "expression"
        ], itemPath);
        for (const field of ["toManualX", "toManualY", "toManualZ", "angleValue"]) {
            if (!Number.isFinite(item[field])) throw new Error(`${itemPath}.${field} 必须是有限数字。`);
        }
        if (!["numeric", "expr"].includes(item.angleMode)) throw new Error(`${itemPath}.angleMode 无效。`);
        if (!["deg", "rad"].includes(item.angleUnit)) throw new Error(`${itemPath}.angleUnit 无效。`);
    });
}

function validateAnimateList(value, path) {
    validateObjectList(value, path, (item, itemPath) => {
        assertAllowedKeys(item, new Set(ANIMATE_FIELDS), itemPath);
        if (!Number.isSafeInteger(item.count) || item.count < 1) throw new Error(`${itemPath}.count 必须是正整数。`);
        if (typeof item.condition !== "string") throw new Error(`${itemPath}.condition 必须是字符串。`);
    });
}

function validateScale(scale, path) {
    assertPlainObject(scale, path);
    assertAllowedKeys(scale, new Set(SCALE_FIELDS), path);
    if (!SCALE_TYPES.has(scale.type)) throw new Error(`${path}.type 无效。`);
    if (!SCALE_RUN_MODES.has(scale.runMode)) throw new Error(`${path}.runMode 无效。`);
    for (const field of SCALE_NUMBER_FIELDS) {
        if (!Number.isFinite(scale[field])) throw new Error(`${path}.${field} 必须是有限数字。`);
    }
    if (!Number.isSafeInteger(scale.tick) || scale.tick < 1) throw new Error(`${path}.tick 必须是正整数。`);
    if (typeof scale.reversedOnDisable !== "boolean") throw new Error(`${path}.reversedOnDisable 必须是布尔值。`);
}

function validateAngleOffset(value, path) {
    assertPlainObject(value, path);
    assertAllowedKeys(value, new Set(ANGLE_OFFSET_FIELDS), path);
    for (const field of ["angleOffsetEnabled", "angleOffsetReverseOnDisable"]) {
        if (typeof value[field] !== "boolean") throw new Error(`${path}.${field} 必须是布尔值。`);
    }
    for (const field of ["angleOffsetCount", "angleOffsetGlowTick"]) {
        if (!Number.isSafeInteger(value[field]) || value[field] < 1) throw new Error(`${path}.${field} 必须是正整数。`);
    }
    for (const field of ANGLE_OFFSET_NUMBER_FIELDS) {
        if (!Number.isFinite(value[field])) throw new Error(`${path}.${field} 必须是有限数字。`);
    }
    validateStringFields(value, [
        "angleOffsetEase", "angleOffsetAngleMode", "angleOffsetAngleUnit",
        "angleOffsetAngleExpr", "angleOffsetAnglePreset"
    ], path);
    if (!ANGLE_OFFSET_EASE_TYPES.has(value.angleOffsetEase)) throw new Error(`${path}.angleOffsetEase 无效。`);
    if (!["numeric", "expr"].includes(value.angleOffsetAngleMode)) throw new Error(`${path}.angleOffsetAngleMode 无效。`);
    if (!["deg", "rad"].includes(value.angleOffsetAngleUnit)) throw new Error(`${path}.angleOffsetAngleUnit 无效。`);
}

function validateSingleDisplay(value, path) {
    assertPlainObject(value, path);
    assertAllowedKeys(value, new Set(SINGLE_DISPLAY_FIELDS), path);
    for (const field of ["rotateToWithAngle", "rotateToUsePreset"]) {
        if (typeof value[field] !== "boolean") throw new Error(`${path}.${field} 必须是布尔值。`);
    }
    validateStringFields(value, [
        "rotateToPreset", "rotateToExpr", "rotateToManualCtor", "rotateAngleMode",
        "rotateAngleUnit", "rotateAnglePreset", "rotateAngleExpr"
    ], path);
    for (const field of ["rotateToManualX", "rotateToManualY", "rotateToManualZ", "rotateAngleValue"]) {
        if (!Number.isFinite(value[field])) throw new Error(`${path}.${field} 必须是有限数字。`);
    }
    if (!["numeric", "expr"].includes(value.rotateAngleMode)) throw new Error(`${path}.rotateAngleMode 无效。`);
    if (!["deg", "rad"].includes(value.rotateAngleUnit)) throw new Error(`${path}.rotateAngleUnit 无效。`);
}

function validateProperties(properties, path) {
    assertPlainObject(properties, path);
    assertAllowedKeys(properties, new Set([
        "particleInit", "controllerVars", "controllerActions", "displayActions", "scale",
        "growthAnimates", "sequencedAnimates", "angleOffset", "singleDisplay"
    ]), path);
    validateParticleInitList(properties.particleInit, `${path}.particleInit`);
    validateControllerVariableList(properties.controllerVars, `${path}.controllerVars`);
    validateControllerActionList(properties.controllerActions, `${path}.controllerActions`);
    validateDisplayActionList(properties.displayActions, `${path}.displayActions`);
    validateAnimateList(properties.growthAnimates, `${path}.growthAnimates`);
    if (properties.sequencedAnimates !== undefined) {
        validateAnimateList(properties.sequencedAnimates, `${path}.sequencedAnimates`);
    }
    validateScale(properties.scale, `${path}.scale`);
    validateAngleOffset(properties.angleOffset, `${path}.angleOffset`);
    if (properties.singleDisplay !== undefined) {
        validateSingleDisplay(properties.singleDisplay, `${path}.singleDisplay`);
    }
}

function validateCanonicalTarget(value, path, depth) {
    if (depth > MAX_PRESET_DEPTH) throw new Error(`${path} 嵌套过深。`);
    assertPlainObject(value, path);
    assertAllowedKeys(value, new Set(["sections"]), path);
    assertPlainObject(value.sections, `${path}.sections`);
    assertAllowedKeys(value.sections, new Set(COMPOSITION_PRESET_SECTIONS), `${path}.sections`);
    for (const section of COMPOSITION_PRESET_SECTIONS) {
        if (!isPlainObject(value.sections[section])) throw new Error(`${path}.sections.${section} 缺失。`);
    }
    validatePosition(value.sections.position, `${path}.sections.position`);
    const particle = value.sections.particle;
    assertAllowedKeys(particle, new Set(["dataType", "particleBackend", "effectClass", "useTexture", "useCParticle", "cparticleRenderLayer", "randomAgePreTick", "randomInitialAge", "cparticleAlpha", "axis", "children"]), `${path}.sections.particle`);
    if (!DATA_TYPES.has(particle.dataType)) throw new Error(`${path}.sections.particle.dataType 无效。`);
    if (particle.particleBackend !== undefined && !PARTICLE_BACKENDS.has(particle.particleBackend)) {
        throw new Error(`${path}.sections.particle.particleBackend 无效。`);
    }
    if (typeof particle.effectClass !== "string" || particle.effectClass.length > 256) {
        throw new Error(`${path}.sections.particle.effectClass 无效。`);
    }
    if (typeof particle.useTexture !== "boolean") throw new Error(`${path}.sections.particle.useTexture 必须是布尔值。`);
    if (particle.useCParticle !== undefined && typeof particle.useCParticle !== "boolean") {
        throw new Error(`${path}.sections.particle.useCParticle 必须是布尔值。`);
    }
    if (particle.cparticleRenderLayer !== undefined && !CPARTICLE_RENDER_LAYERS.has(particle.cparticleRenderLayer)) {
        throw new Error(`${path}.sections.particle.cparticleRenderLayer 无效。`);
    }
    if (particle.randomAgePreTick !== undefined && typeof particle.randomAgePreTick !== "boolean") {
        throw new Error(`${path}.sections.particle.randomAgePreTick 必须是布尔值。`);
    }
    if (particle.randomInitialAge !== undefined && typeof particle.randomInitialAge !== "boolean") {
        throw new Error(`${path}.sections.particle.randomInitialAge 必须是布尔值。`);
    }
    if (particle.cparticleAlpha !== undefined) {
        assertPlainObject(particle.cparticleAlpha, `${path}.sections.particle.cparticleAlpha`);
        assertAllowedKeys(particle.cparticleAlpha, new Set(["fadeIn", "fadeOut"]), `${path}.sections.particle.cparticleAlpha`);
        for (const phase of ["fadeIn", "fadeOut"]) {
            if (particle.cparticleAlpha[phase] === undefined) continue;
            const fade = particle.cparticleAlpha[phase];
            assertPlainObject(fade, `${path}.sections.particle.cparticleAlpha.${phase}`);
            assertAllowedKeys(fade, new Set(["enabled", "durationTicks", "fromAlpha", "toAlpha"]), `${path}.sections.particle.cparticleAlpha.${phase}`);
            if (fade.enabled !== undefined && typeof fade.enabled !== "boolean") {
                throw new Error(`${path}.sections.particle.cparticleAlpha.${phase}.enabled 必须是布尔值。`);
            }
            for (const field of ["durationTicks", "fromAlpha", "toAlpha"]) {
                if (fade[field] !== undefined && !Number.isFinite(Number(fade[field]))) {
                    throw new Error(`${path}.sections.particle.cparticleAlpha.${phase}.${field} 必须是数字。`);
                }
            }
        }
    }
    validateAxis(particle.axis, `${path}.sections.particle.axis`);
    if (!Array.isArray(particle.children) || particle.children.length > 512) {
        throw new Error(`${path}.sections.particle.children 无效。`);
    }
    if (isLeafParticleType(particle.dataType) && particle.children.length) {
        throw new Error(`${path}.sections.particle.children 与 ${particle.dataType} 类型不兼容。`);
    }
    particle.children.forEach((child, index) => validateCanonicalTarget(child, `${path}.sections.particle.children[${index}]`, depth + 1));
    validateProperties(value.sections.properties, `${path}.sections.properties`);
}

export function validateCompositionPreset(rawPreset, options = {}) {
    let preset = rawPreset;
    if (typeof preset === "string") {
        try {
            preset = JSON.parse(preset);
        } catch (error) {
            throw new Error(`预设 JSON 无法解析：${error?.message || error}`);
        }
    }
    assertJsonSafe(preset);
    assertPlainObject(preset, "preset");
    assertAllowedKeys(preset, new Set([
        "schemaVersion", "kind", "name", "description", "sourceKind", "createdAt", "sourceContext", "sections"
    ]), "preset");
    if (preset.schemaVersion !== COMPOSITION_PRESET_SCHEMA_VERSION) {
        throw new Error(`不支持的预设 schemaVersion：${String(preset.schemaVersion)}`);
    }
    if (preset.kind !== COMPOSITION_PRESET_KIND) throw new Error("不是 Composition Builder 预设文件。");
    const name = normalizePresetName(preset.name);
    if (typeof preset.name !== "string" || preset.name !== name) throw new Error("预设 name 必须是规范文件名。");
    if (preset.description !== undefined) {
        const description = normalizePresetDescription(preset.description);
        if (typeof preset.description !== "string" || preset.description !== description) {
            throw new Error("预设 description 无效。");
        }
    }
    if (!SOURCE_KINDS.has(preset.sourceKind)) throw new Error("预设 sourceKind 无效。");
    if (typeof preset.createdAt !== "string" || !Number.isFinite(Date.parse(preset.createdAt))) {
        throw new Error("预设 createdAt 无效。");
    }
    assertPlainObject(preset.sourceContext, "preset.sourceContext");
    assertAllowedKeys(preset.sourceContext, new Set(["cardId", "treePath"]), "preset.sourceContext");
    if (typeof preset.sourceContext.cardId !== "string" || preset.sourceContext.cardId.length > 256) {
        throw new Error("预设 cardId 无效。");
    }
    normalizePresetTreePath(preset.sourceContext.treePath);
    validateCanonicalTarget({ sections: preset.sections }, "preset", 0);
    if (options.category) normalizePresetCategory(options.category);
    const normalized = cloneJson(preset);
    normalized.name = name;
    normalized.description = normalizePresetDescription(normalized.description);
    normalized.sourceContext.treePath = normalizePresetTreePath(normalized.sourceContext.treePath);
    return normalized;
}

function normalizeSelectedSections(rawSections) {
    const selected = new Set();
    if (Array.isArray(rawSections) || rawSections instanceof Set) {
        for (const section of rawSections) if (COMPOSITION_PRESET_SECTIONS.includes(section)) selected.add(section);
    } else if (isPlainObject(rawSections)) {
        for (const section of COMPOSITION_PRESET_SECTIONS) if (rawSections[section]) selected.add(section);
    }
    if (!selected.size) throw new Error("请至少勾选一项应用内容。");
    return selected;
}

function applyAxis(target, axis, targetKind) {
    const prefix = targetKind === "card" ? "shapeAxis" : "axis";
    for (const field of AXIS_FIELDS) target[`${prefix}${field[0].toUpperCase()}${field.slice(1)}`] = cloneJson(axis[field]);
}

function applyCanonicalTarget(target, canonical, targetKind, selected, depth = 0) {
    if (depth > MAX_PRESET_DEPTH) throw new Error("应用的子节点嵌套过深。");
    const next = isPlainObject(target) ? cloneJson(target) : {};
    const { position, particle, properties } = canonical.sections;

    if (selected.has("position")) {
        next.bindMode = position.bindMode;
        next.point = cloneJson(position.point);
        next.builderState = cloneJson(position.builderState);
        if (targetKind === "card" && position.builderKotlinOverride !== undefined) {
            next.builderKotlinOverride = position.builderKotlinOverride;
        }
    }

    if (selected.has("particle")) {
        const legacyCParticle = particle.dataType === "cparticle";
        if (targetKind === "card") {
            next.dataType = legacyCParticle ? "single" : particle.dataType;
            next.particleBackend = next.dataType === "single"
                ? (legacyCParticle || particle.particleBackend === "cparticle" ? "cparticle" : "single")
                : "single";
            next.globalCParticleAuto = false;
            next.singleEffectClass = particle.effectClass;
            next.singleUseTexture = particle.useTexture;
            next.useCParticle = isCParticleOwnerType(next.dataType) && particle.useCParticle === true;
            next.cparticleRenderLayer = particle.cparticleRenderLayer || "ADDITION_BLEND_TRANSLUCENT";
            next.randomAgePreTick = particle.randomAgePreTick === true;
            next.cparticleAlpha = cloneJson(particle.cparticleAlpha || {});
        } else {
            next.type = legacyCParticle ? "single" : particle.dataType;
            next.effectClass = particle.effectClass;
            next.useTexture = particle.useTexture;
            next.useCParticle = false;
            next.cparticleRenderLayer = particle.cparticleRenderLayer || "ADDITION_BLEND_TRANSLUCENT";
            next.randomAgePreTick = particle.randomAgePreTick === true;
            next.cparticleAlpha = cloneJson(particle.cparticleAlpha || {});
        }
        delete next.randomInitialAge;
        applyAxis(next, particle.axis, targetKind);
    }

    if (selected.has("properties")) {
        next.particleInit = cloneJson(properties.particleInit);
        next.controllerVars = cloneJson(properties.controllerVars);
        next.controllerActions = cloneJson(properties.controllerActions);
        next.growthAnimates = cloneJson(properties.growthAnimates);
        assignFields(next, properties.angleOffset, ANGLE_OFFSET_FIELDS);
        if (targetKind === "card") {
            next.shapeDisplayActions = cloneJson(properties.displayActions);
            next.shapeScale = cloneJson(properties.scale);
            if (properties.sequencedAnimates !== undefined) {
                next.sequencedAnimates = cloneJson(properties.sequencedAnimates);
            }
            if (properties.singleDisplay !== undefined) {
                assignFields(next, properties.singleDisplay, SINGLE_DISPLAY_FIELDS);
            }
        } else {
            next.displayActions = cloneJson(properties.displayActions);
            next.scale = cloneJson(properties.scale);
        }
    }

    const key = targetKind === "card" ? "shapeChildren" : "children";
    const existingChildren = Array.isArray(next[key]) ? next[key] : [];
    const presetChildren = particle.children;
    const childCount = selected.has("particle") ? presetChildren.length : Math.min(existingChildren.length, presetChildren.length);
    const children = selected.has("particle") ? [] : existingChildren.map(cloneJson);
    for (let index = 0; index < childCount; index += 1) {
        const child = applyCanonicalTarget(existingChildren[index] || {}, presetChildren[index], "node", selected, depth + 1);
        if (selected.has("particle")) children.push(child);
        else children[index] = child;
    }
    next[key] = children;
    if (targetKind === "card") {
        next.useCParticle = isCParticleOwnerType(next.dataType) && next.useCParticle === true;
    } else {
        next.useCParticle = false;
    }
    return next;
}

export function applyCompositionPreset(target, rawPreset, selectedSections, targetKind) {
    const kind = String(targetKind || "");
    if (!SOURCE_KINDS.has(kind)) throw new Error("应用目标必须是 card 或 node。");
    assertPlainObject(target, "target");
    const preset = validateCompositionPreset(rawPreset);
    const selected = normalizeSelectedSections(selectedSections);
    return applyCanonicalTarget(target, { sections: preset.sections }, kind, selected);
}

function normalizeProjectContext({ projectFilePath, projectId, projectType } = {}) {
    return {
        projectFilePath: String(projectFilePath || "").trim(),
        projectId: String(projectId || "").trim(),
        projectType: String(projectType || "").trim()
    };
}

function requireBridgeMethod(bridge, method) {
    if (!bridge || typeof bridge[method] !== "function") throw new Error("当前环境不支持全局预设文件操作。");
    return bridge[method].bind(bridge);
}

function unwrapBridgeResult(result, action) {
    if (result?.ok) return result;
    const error = new Error(result?.message || `${action}失败。`);
    if (result?.exists) error.code = "PRESET_EXISTS";
    if (result?.notFound) error.code = "PRESET_NOT_FOUND";
    throw error;
}

export function createCompositionPresetStorage({ bridge, projectFilePath, projectId, projectType } = {}) {
    const projectContext = normalizeProjectContext({ projectFilePath, projectId, projectType });
    return {
        async listDirectories() {
            const call = requireBridgeMethod(bridge, "listProjectPresetFolders");
            const result = unwrapBridgeResult(await call(projectContext), "读取预设目录");
            return Array.isArray(result.items)
                ? result.items.map((item) => ({
                    name: normalizePresetCategory(item.name),
                    builtin: item.builtin === true,
                    count: Number.isSafeInteger(item.count) ? item.count : 0
                }))
                : [];
        },
        async createDirectory(rawCategory) {
            const category = normalizePresetCategory(rawCategory);
            const call = requireBridgeMethod(bridge, "createProjectPresetFolder");
            return unwrapBridgeResult(await call({ ...projectContext, category }), "创建预设目录");
        },
        async removeDirectory(rawCategory) {
            const category = normalizePresetCategory(rawCategory);
            const call = requireBridgeMethod(bridge, "deleteProjectPresetFolder");
            return unwrapBridgeResult(await call({ ...projectContext, category }), "删除预设目录");
        },
        async list(rawCategory, options = {}) {
            const category = normalizePresetCategory(rawCategory);
            const call = requireBridgeMethod(bridge, "listProjectPresets");
            const sourceKind = SOURCE_KINDS.has(options.sourceKind) ? options.sourceKind : "";
            const result = unwrapBridgeResult(await call({ ...projectContext, category, sourceKind }), "读取预设列表");
            return Array.isArray(result.items) ? result.items.map((item) => ({ ...item })) : [];
        },
        async load(rawCategory, rawName) {
            const category = normalizePresetCategory(rawCategory);
            const name = normalizePresetName(rawName);
            const fileName = presetFileName(name);
            const call = requireBridgeMethod(bridge, "readProjectPreset");
            const result = unwrapBridgeResult(await call({ ...projectContext, category, fileName }), "加载预设");
            const preset = validateCompositionPreset(result.text, { category });
            if (preset.name !== name) throw new Error("预设 name 与文件名不一致。");
            return preset;
        },
        async save(rawCategory, rawPreset, options = {}) {
            const category = normalizePresetCategory(rawCategory);
            const preset = validateCompositionPreset(rawPreset, { category });
            const call = requireBridgeMethod(bridge, "writeProjectPreset");
            const result = await call({
                ...projectContext,
                category,
                fileName: presetFileName(preset.name),
                text: JSON.stringify(preset, null, 2),
                overwrite: options.overwrite === true
            });
            return unwrapBridgeResult(result, "保存预设");
        },
        async remove(rawCategory, rawName) {
            const category = normalizePresetCategory(rawCategory);
            const call = requireBridgeMethod(bridge, "deleteProjectPreset");
            const result = await call({ ...projectContext, category, fileName: presetFileName(rawName) });
            return unwrapBridgeResult(result, "删除预设");
        },
        async move(rawSourceCategory, rawName, rawTargetCategory, options = {}) {
            const sourceCategory = normalizePresetCategory(rawSourceCategory);
            const targetCategory = normalizePresetCategory(rawTargetCategory);
            const sourceName = normalizePresetName(rawName);
            const targetName = normalizePresetName(options.name || sourceName);
            const payload = {
                ...projectContext,
                sourceCategory,
                sourceFileName: presetFileName(sourceName),
                targetCategory,
                targetFileName: presetFileName(targetName)
            };
            if (Object.prototype.hasOwnProperty.call(options, "description")) {
                payload.description = normalizePresetDescription(options.description);
            }
            const call = requireBridgeMethod(bridge, "moveProjectPreset");
            const result = await call(payload);
            return unwrapBridgeResult(result, "更新预设");
        }
    };
}
