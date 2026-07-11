const TAU = Math.PI * 2;

const DEFAULT_EASE_PARAMS = Object.freeze({
    outBack: Object.freeze({ overshoot: 1.70158 }),
    outElastic: Object.freeze({ period: TAU / 3, decay: 10, shift: 0.75 }),
    outBounce: Object.freeze({ n1: 7.5625, d1: 2.75 }),
    bezierEase: Object.freeze({ startX: 0.17106, startY: 0.49026, endX: -0.771523, endY: -0.116883 })
});

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
}

function pickFinite(...values) {
    for (const it of values) {
        const n = Number(it);
        if (Number.isFinite(n)) return n;
    }
    return NaN;
}

function pickParam(rawParams, legacyOptions, key, fallback) {
    const n = pickFinite(
        rawParams?.[key],
        legacyOptions?.[key],
        legacyOptions?.[`angleOffsetEase${key.charAt(0).toUpperCase()}${key.slice(1)}`],
        fallback
    );
    return Number.isFinite(n) ? n : fallback;
}

function normalizeEaseParams(name, rawParams, legacyOptions) {
    const key = String(name || "").trim();
    if (key === "outBack") {
        return {
            overshoot: pickParam(rawParams, legacyOptions, "overshoot", DEFAULT_EASE_PARAMS.outBack.overshoot)
        };
    }
    if (key === "outElastic") {
        return {
            period: pickParam(rawParams, legacyOptions, "period", DEFAULT_EASE_PARAMS.outElastic.period),
            decay: pickParam(rawParams, legacyOptions, "decay", DEFAULT_EASE_PARAMS.outElastic.decay),
            shift: pickParam(rawParams, legacyOptions, "shift", DEFAULT_EASE_PARAMS.outElastic.shift)
        };
    }
    if (key === "outBounce") {
        return {
            n1: pickParam(rawParams, legacyOptions, "n1", DEFAULT_EASE_PARAMS.outBounce.n1),
            d1: pickParam(rawParams, legacyOptions, "d1", DEFAULT_EASE_PARAMS.outBounce.d1)
        };
    }
    if (key === "bezierEase") {
        return {
            startX: pickParam(rawParams, legacyOptions, "startX", DEFAULT_EASE_PARAMS.bezierEase.startX),
            startY: pickParam(rawParams, legacyOptions, "startY", DEFAULT_EASE_PARAMS.bezierEase.startY),
            endX: pickParam(rawParams, legacyOptions, "endX", DEFAULT_EASE_PARAMS.bezierEase.endX),
            endY: pickParam(rawParams, legacyOptions, "endY", DEFAULT_EASE_PARAMS.bezierEase.endY)
        };
    }
    return {};
}

function outBounce(t, params = {}) {
    const x = clamp01(t);
    const n1 = pickFinite(params.n1, DEFAULT_EASE_PARAMS.outBounce.n1);
    const d1 = pickFinite(params.d1, DEFAULT_EASE_PARAMS.outBounce.d1);
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) {
        const p = x - 1.5 / d1;
        return n1 * p * p + 0.75;
    }
    if (x < 2.5 / d1) {
        const p = x - 2.25 / d1;
        return n1 * p * p + 0.9375;
    }
    const p = x - 2.625 / d1;
    return n1 * p * p + 0.984375;
}

function cubic(a, b, c, d, t) {
    const inv = 1 - t;
    return inv * inv * inv * a + 3 * inv * inv * t * b + 3 * inv * t * t * c + t * t * t * d;
}

function solveBezierEaseY(x, startX, startY, endX, endY) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const p1x = startX;
    const p1y = startY;
    const p2x = 1 + endX;
    const p2y = 1 + endY;
    let lo = 0;
    let hi = 1;
    let mid = 0.5;
    for (let i = 0; i < 28; i += 1) {
        mid = (lo + hi) * 0.5;
        const bx = cubic(0, p1x, p2x, 1, mid);
        if (bx < x) lo = mid;
        else hi = mid;
    }
    return cubic(0, p1y, p2y, 1, mid);
}

const EASES = {
    linear: (t) => clamp01(t),
    outCubic: (t) => {
        const x = clamp01(t);
        const inv = 1 - x;
        return 1 - inv * inv * inv;
    },
    inOutSine: (t) => {
        const x = clamp01(t);
        return (1 - Math.cos(Math.PI * x)) / 2;
    },
    outExpo: (t) => {
        const x = clamp01(t);
        if (x >= 1) return 1;
        return 1 - Math.pow(2, -10 * x);
    },
    inCubic: (t) => {
        const x = clamp01(t);
        return x * x * x;
    },
    inOutCubic: (t) => {
        const x = clamp01(t);
        if (x < 0.5) return 4 * x * x * x;
        return 1 - Math.pow(-2 * x + 2, 3) / 2;
    },
    outQuad: (t) => {
        const x = clamp01(t);
        return 1 - (1 - x) * (1 - x);
    },
    outBack: (t, params = {}) => {
        const x = clamp01(t);
        const overshoot = pickFinite(params.overshoot, DEFAULT_EASE_PARAMS.outBack.overshoot);
        const c3 = overshoot + 1;
        const p = x - 1;
        return 1 + c3 * p * p * p + overshoot * p * p;
    },
    outElastic: (t, params = {}) => {
        const x = clamp01(t);
        if (x === 0 || x === 1) return x;
        const period = pickFinite(params.period, DEFAULT_EASE_PARAMS.outElastic.period);
        const decay = pickFinite(params.decay, DEFAULT_EASE_PARAMS.outElastic.decay);
        const shift = pickFinite(params.shift, DEFAULT_EASE_PARAMS.outElastic.shift);
        return Math.pow(2, -decay * x) * Math.sin((x * 10 - shift) * period) + 1;
    },
    outBounce,
    bezierEase: (t, params = {}) => {
        const x = clamp01(t);
        const startX = pickFinite(params.startX, DEFAULT_EASE_PARAMS.bezierEase.startX);
        const startY = pickFinite(params.startY, DEFAULT_EASE_PARAMS.bezierEase.startY);
        const endX = pickFinite(params.endX, DEFAULT_EASE_PARAMS.bezierEase.endX);
        const endY = pickFinite(params.endY, DEFAULT_EASE_PARAMS.bezierEase.endY);
        return solveBezierEaseY(x, startX, startY, endX, endY);
    }
};

function resolveEase(name) {
    const key = String(name || "").trim();
    return EASES[key] || EASES.outCubic;
}

export function computeAngleAnimatorAngle(options = {}) {
    const targetAngle = Number(options.targetAngle);
    const target = Number.isFinite(targetAngle) ? targetAngle : 0;
    if (Math.abs(target) < 1e-12) return 0;

    const glowTickRaw = Number(options.glowTick);
    const glowTick = Number.isFinite(glowTickRaw) && glowTickRaw > 0 ? glowTickRaw : 1;
    const easeName = String(options.easeName || "").trim() || "outCubic";
    const ease = resolveEase(easeName);
    const easeParams = normalizeEaseParams(easeName, options.easeParams, options);

    const ageTickRaw = Number(options.ageTick);
    const ageTick = Number.isFinite(ageTickRaw) ? Math.max(0, ageTickRaw) : 0;
    const elapsedTickRaw = Number(options.elapsedTick);
    const elapsedTick = Number.isFinite(elapsedTickRaw) ? Math.max(0, elapsedTickRaw) : ageTick;
    const statusElapsedTickRaw = Number(options.statusElapsedTick);
    const statusElapsedTick = Number.isFinite(statusElapsedTickRaw) ? Math.max(0, statusElapsedTickRaw) : elapsedTick;

    const status = (options.status && typeof options.status === "object") ? options.status : null;
    const reverseOnDisable = options.reverseOnDisable === true;
    const isDisable = status ? Number(status.displayStatus) === 2 : false;
    const dissolveStart = status ? Number(status.__dissolveStartTick) : NaN;

    if (reverseOnDisable && isDisable && Number.isFinite(dissolveStart)) {
        const fadeTick = Math.max(0, statusElapsedTick - dissolveStart);
        const t = clamp01(fadeTick / glowTick);
        return target * ease(1 - t, easeParams);
    }

    const t = clamp01(ageTick / glowTick);
    return target * ease(t, easeParams);
}
