const TAU = Math.PI * 2;

export const ANGLE_OFFSET_EASE_OPTIONS = [
    { id: "linear", title: "Eases.linear" },
    { id: "outCubic", title: "Eases.outCubic" },
    { id: "inOutSine", title: "Eases.inOutSine" },
    { id: "outExpo", title: "Eases.outExpo" },
    { id: "inCubic", title: "Eases.inCubic" },
    { id: "inOutCubic", title: "Eases.inOutCubic" },
    { id: "outQuad", title: "Eases.outQuad" },
    { id: "outBack", title: "Eases.outBack" },
    { id: "outElastic", title: "Eases.outElastic" },
    { id: "outBounce", title: "Eases.outBounce" },
    { id: "bezierEase", title: "Eases.bezierEase" }
];

export const ANGLE_OFFSET_EASE_DEFAULT_PARAMS = Object.freeze({
    angleOffsetEaseOvershoot: 1.70158,
    angleOffsetEasePeriod: TAU / 3,
    angleOffsetEaseDecay: 10,
    angleOffsetEaseShift: 0.75,
    angleOffsetEaseN1: 7.5625,
    angleOffsetEaseD1: 2.75,
    angleOffsetEaseBezierStartX: 0.17106,
    angleOffsetEaseBezierStartY: 0.49026,
    angleOffsetEaseBezierEndX: -0.771523,
    angleOffsetEaseBezierEndY: -0.116883
});

export const ANGLE_OFFSET_EASE_PARAM_META = Object.freeze({
    outBack: Object.freeze([
        {
            field: "angleOffsetEaseOvershoot",
            short: "overshoot",
            label: "超冲强度 (overshoot)",
            tip: "变高：超过终点后回拉更明显；变低：更接近直接到位。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseOvershoot
        }
    ]),
    outElastic: Object.freeze([
        {
            field: "angleOffsetEasePeriod",
            short: "period",
            label: "弹性周期 (period)",
            tip: "变高：波峰间隔更大更慢；变低：波峰更密更快。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEasePeriod
        },
        {
            field: "angleOffsetEaseDecay",
            short: "decay",
            label: "衰减强度 (decay)",
            tip: "变高：更快停稳；变低：震荡持续更久。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseDecay
        },
        {
            field: "angleOffsetEaseShift",
            short: "shift",
            label: "相位偏移 (shift)",
            tip: "变高：首次波峰更靠后；变低：首次波峰更靠前。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseShift
        }
    ]),
    outBounce: Object.freeze([
        {
            field: "angleOffsetEaseN1",
            short: "n1",
            label: "反弹力度 (n1)",
            tip: "变高：反弹更高更硬；变低：反弹更柔和。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseN1
        },
        {
            field: "angleOffsetEaseD1",
            short: "d1",
            label: "反弹分段 (d1)",
            tip: "变高：每段更长更缓；变低：反弹节奏更紧。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseD1
        }
    ]),
    bezierEase: Object.freeze([
        {
            field: "angleOffsetEaseBezierStartX",
            short: "bezierStartX",
            label: "起点手柄 X (startX)",
            tip: "变高：前段推进更晚更缓；变低：前段推进更早更快。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseBezierStartX
        },
        {
            field: "angleOffsetEaseBezierStartY",
            short: "bezierStartY",
            label: "起点手柄 Y (startY)",
            tip: "变高：前段抬升更快；变低：前段更贴近起点。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseBezierStartY
        },
        {
            field: "angleOffsetEaseBezierEndX",
            short: "bezierEndX",
            label: "终点手柄 X (endX)",
            tip: "变高：后段更靠后贴近终点；变低：后段更早开始收束。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseBezierEndX
        },
        {
            field: "angleOffsetEaseBezierEndY",
            short: "bezierEndY",
            label: "终点手柄 Y (endY)",
            tip: "变高：后段更容易上冲；变低：后段更易提前贴近终点。",
            defaultValue: ANGLE_OFFSET_EASE_DEFAULT_PARAMS.angleOffsetEaseBezierEndY
        }
    ])
});

const ANGLE_OFFSET_EASE_PARAM_ALIAS = Object.freeze({
    angleOffsetEaseOvershoot: ["overshoot"],
    angleOffsetEasePeriod: ["period"],
    angleOffsetEaseDecay: ["decay"],
    angleOffsetEaseShift: ["shift"],
    angleOffsetEaseN1: ["n1"],
    angleOffsetEaseD1: ["d1"],
    angleOffsetEaseBezierStartX: ["bezierStartX", "startX", "c1x"],
    angleOffsetEaseBezierStartY: ["bezierStartY", "startY", "c1y"],
    angleOffsetEaseBezierEndX: ["bezierEndX", "endX", "c2x"],
    angleOffsetEaseBezierEndY: ["bezierEndY", "endY", "c2y"]
});

const ANGLE_OFFSET_EASE_PARAM_FIELDS = Object.freeze(
    Object.values(ANGLE_OFFSET_EASE_PARAM_META)
        .flat()
        .map((it) => it.field)
);

const ANGLE_OFFSET_EASE_PARAM_FIELD_SET = new Set(ANGLE_OFFSET_EASE_PARAM_FIELDS);

function normalizeFiniteNumber(raw, fallback) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeEaseParamValue(field, raw) {
    const fallback = ANGLE_OFFSET_EASE_DEFAULT_PARAMS[field];
    return normalizeFiniteNumber(raw, fallback);
}

function pickRawParamValue(rawObj, field) {
    if (!rawObj || typeof rawObj !== "object") return undefined;
    if (rawObj[field] !== undefined) return rawObj[field];
    const aliases = ANGLE_OFFSET_EASE_PARAM_ALIAS[field] || [];
    for (const alias of aliases) {
        if (rawObj[alias] !== undefined) return rawObj[alias];
    }
    return undefined;
}

export function normalizeAngleUnit(unit) {
    return unit === "rad" ? "rad" : "deg";
}

export function normalizeAngleOffsetEaseName(raw) {
    const name = String(raw || "").trim();
    if (!name) return "outCubic";
    return ANGLE_OFFSET_EASE_OPTIONS.some((it) => it.id === name) ? name : "outCubic";
}

export function getAngleOffsetEaseParamMeta(easeName) {
    const key = normalizeAngleOffsetEaseName(easeName);
    return ANGLE_OFFSET_EASE_PARAM_META[key] || [];
}

export function hasAngleOffsetEaseSpecialParams(easeName) {
    return getAngleOffsetEaseParamMeta(easeName).length > 0;
}

export function normalizeAngleOffsetEaseSpecialParams(raw) {
    const out = {};
    for (const field of ANGLE_OFFSET_EASE_PARAM_FIELDS) {
        out[field] = normalizeEaseParamValue(field, pickRawParamValue(raw, field));
    }
    return out;
}

export function getAngleOffsetEaseSpecialParamsFor(raw, easeName) {
    const params = normalizeAngleOffsetEaseSpecialParams(raw);
    const out = {};
    for (const meta of getAngleOffsetEaseParamMeta(easeName)) {
        out[meta.field] = params[meta.field];
    }
    return out;
}

export function normalizeAngleOffsetEaseParamFieldName(rawField) {
    const key = String(rawField || "").trim();
    if (!key) return "";
    if (ANGLE_OFFSET_EASE_PARAM_FIELD_SET.has(key)) return key;
    for (const field of ANGLE_OFFSET_EASE_PARAM_FIELDS) {
        const aliases = ANGLE_OFFSET_EASE_PARAM_ALIAS[field] || [];
        if (aliases.includes(key)) return field;
    }
    return "";
}

export function normalizeAngleOffsetFieldName(rawField) {
    const key = String(rawField || "").trim();
    if (!key) return "";
    const map = {
        enabled: "angleOffsetEnabled",
        count: "angleOffsetCount",
        glowTick: "angleOffsetGlowTick",
        ease: "angleOffsetEase",
        reverseOnDisable: "angleOffsetReverseOnDisable",
        angleMode: "angleOffsetAngleMode",
        angleValue: "angleOffsetAngleValue",
        angleUnit: "angleOffsetAngleUnit",
        angleExpr: "angleOffsetAngleExpr",
        anglePreset: "angleOffsetAnglePreset",
        overshoot: "angleOffsetEaseOvershoot",
        period: "angleOffsetEasePeriod",
        decay: "angleOffsetEaseDecay",
        shift: "angleOffsetEaseShift",
        n1: "angleOffsetEaseN1",
        d1: "angleOffsetEaseD1",
        bezierStartX: "angleOffsetEaseBezierStartX",
        startX: "angleOffsetEaseBezierStartX",
        c1x: "angleOffsetEaseBezierStartX",
        bezierStartY: "angleOffsetEaseBezierStartY",
        startY: "angleOffsetEaseBezierStartY",
        c1y: "angleOffsetEaseBezierStartY",
        bezierEndX: "angleOffsetEaseBezierEndX",
        endX: "angleOffsetEaseBezierEndX",
        c2x: "angleOffsetEaseBezierEndX",
        bezierEndY: "angleOffsetEaseBezierEndY",
        endY: "angleOffsetEaseBezierEndY",
        c2y: "angleOffsetEaseBezierEndY"
    };
    return map[key] || key;
}

export function formatAngleValue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) < 1e-9) return "0";
    return `${Number(n.toFixed(6))}`;
}
