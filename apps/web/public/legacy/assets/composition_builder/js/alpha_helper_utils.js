export const ALPHA_HELPER_TYPES = ["none", "alpha"];
export const ALPHA_HELPER_RUN_MODES = ["auto", "manual"];

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function toInt(v) {
    return Math.trunc(toNum(v));
}

export function normalizeAlphaHelperConfig(raw, defaults = {}) {
    const base = Object.assign({
        type: "none",
        runMode: "auto",
        min: 0.0,
        max: 1.0,
        tick: 20,
        startMax: false,
        decreaseOnDisable: false
    }, defaults || {});
    const x = Object.assign({}, base, raw || {});
    x.type = ALPHA_HELPER_TYPES.includes(String(x.type || "").trim()) ? String(x.type || "").trim() : String(base.type);
    x.runMode = ALPHA_HELPER_RUN_MODES.includes(String(x.runMode || "").trim()) ? String(x.runMode || "").trim() : "auto";
    x.min = toNum(x.min);
    x.max = toNum(x.max);
    if (x.min > x.max) {
        const tmp = x.min;
        x.min = x.max;
        x.max = tmp;
    }
    x.tick = Math.max(1, toInt(x.tick || 20));
    x.startMax = !!x.startMax;
    x.decreaseOnDisable = !!x.decreaseOnDisable;
    return x;
}

export function normalizeCParticleFadeConfig(raw, defaults = {}) {
    const base = Object.assign({
        enabled: false,
        durationTicks: 10,
        fromAlpha: 0,
        toAlpha: 1
    }, defaults || {});
    const value = Object.assign({}, base, raw || {});
    value.enabled = value.enabled === true;
    value.durationTicks = Math.max(1, toInt(value.durationTicks || base.durationTicks));
    value.fromAlpha = Math.min(1, Math.max(0, toNum(value.fromAlpha)));
    value.toAlpha = Math.min(1, Math.max(0, toNum(value.toAlpha)));
    return value;
}

export function normalizeCParticleAlphaConfig(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    return {
        fadeIn: normalizeCParticleFadeConfig(value.fadeIn, {
            fromAlpha: 0,
            toAlpha: 1
        }),
        fadeOut: normalizeCParticleFadeConfig(value.fadeOut, {
            fromAlpha: 1,
            toAlpha: 0
        })
    };
}
