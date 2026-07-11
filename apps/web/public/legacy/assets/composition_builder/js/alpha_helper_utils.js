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