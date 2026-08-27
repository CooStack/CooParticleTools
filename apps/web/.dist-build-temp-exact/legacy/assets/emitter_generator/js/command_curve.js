import { fmtD } from "./utils.js";

const CURVE_KINDS = new Set(["constant", "linear", "keyframe"]);
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
}

export function normalizeCurveValue(value, fallback = 0) {
    const raw = String(value ?? "").trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    if (IDENT_RE.test(raw)) return raw;
    return fallback;
}

function normalizeKeyframes(rawFrames, fallback = 0) {
    const list = Array.isArray(rawFrames) ? rawFrames : [];
    const out = [];
    for (const frame of list) {
        const t = Number(frame?.time);
        if (!Number.isFinite(t)) continue;
        out.push({
            time: clamp01(t),
            value: normalizeCurveValue(frame?.value, fallback),
        });
    }
    out.sort((a, b) => a.time - b.time);
    if (!out.length) return [{ time: 0.0, value: fallback }];

    // Merge duplicate frame times, keeping the last one.
    const merged = [];
    for (const item of out) {
        const last = merged[merged.length - 1];
        if (last && Math.abs(last.time - item.time) < 1e-9) {
            last.value = item.value;
            continue;
        }
        merged.push(item);
    }
    return merged;
}

export function createFloatCurve(kind = "constant", fallback = 0) {
    return normalizeFloatCurve({ kind, value: fallback }, fallback);
}

export function normalizeFloatCurve(raw, fallback = 0) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        const v = normalizeCurveValue(raw, fallback);
        return {
            kind: "constant",
            value: v,
            from: v,
            to: v,
            keyframes: [{ time: 0.0, value: v }],
        };
    }

    const kindRaw = String(raw.kind ?? raw.type ?? "constant").trim().toLowerCase();
    const kind = CURVE_KINDS.has(kindRaw) ? kindRaw : "constant";
    const value = normalizeCurveValue(raw.value, fallback);
    const from = normalizeCurveValue(raw.from, fallback);
    const to = normalizeCurveValue(raw.to, fallback);
    const keyframes = normalizeKeyframes(raw.keyframes, fallback);

    return { kind, value, from, to, keyframes };
}

export function curveToKotlin(rawCurve, fallback = 0) {
    const curve = normalizeFloatCurve(rawCurve, fallback);
    if (curve.kind === "linear") {
        return `LinearFloatCurve(${fmtD(curve.from)}, ${fmtD(curve.to)})`;
    }
    if (curve.kind === "keyframe") {
        const frames = (curve.keyframes || [])
            .map((it) => `FloatKeyframe(${fmtD(it.time)}, ${fmtD(it.value)})`)
            .join(", ");
        return `KeyframeFloatCurve(listOf(${frames || `FloatKeyframe(0.0, ${fmtD(fallback)})`}))`;
    }
    return `ConstantFloatCurve(${fmtD(curve.value)})`;
}

function evalNumericValue(value, fallback, evaluator) {
    if (typeof evaluator === "function") {
        const out = evaluator(value, fallback);
        const n = Number(out);
        return Number.isFinite(n) ? n : fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function sampleFloatCurve(rawCurve, t, evaluator = null, fallback = 0) {
    const curve = normalizeFloatCurve(rawCurve, fallback);
    const tt = clamp01(t);

    if (curve.kind === "constant") {
        return evalNumericValue(curve.value, fallback, evaluator);
    }

    if (curve.kind === "linear") {
        const a = evalNumericValue(curve.from, fallback, evaluator);
        const b = evalNumericValue(curve.to, fallback, evaluator);
        return a + (b - a) * tt;
    }

    const frames = Array.isArray(curve.keyframes) ? curve.keyframes : [];
    if (!frames.length) return fallback;
    if (frames.length === 1) {
        return evalNumericValue(frames[0].value, fallback, evaluator);
    }
    if (tt <= frames[0].time) {
        return evalNumericValue(frames[0].value, fallback, evaluator);
    }
    if (tt >= frames[frames.length - 1].time) {
        return evalNumericValue(frames[frames.length - 1].value, fallback, evaluator);
    }

    for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1];
        const next = frames[i];
        if (tt <= next.time) {
            const denom = Math.max(1e-9, next.time - prev.time);
            const alpha = (tt - prev.time) / denom;
            const a = evalNumericValue(prev.value, fallback, evaluator);
            const b = evalNumericValue(next.value, fallback, evaluator);
            return a + (b - a) * alpha;
        }
    }
    return evalNumericValue(frames[frames.length - 1].value, fallback, evaluator);
}

