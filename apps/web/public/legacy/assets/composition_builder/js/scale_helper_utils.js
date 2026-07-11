export const SCALE_HELPER_TYPES = ["none", "linear", "bezier"];
export const SCALE_HELPER_RUN_MODES = ["auto", "manual"];

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function toInt(v) {
    return Math.trunc(toNum(v));
}

export function normalizeScaleHelperConfig(raw, defaults = {}) {
    const base = Object.assign({
        type: "none",
        runMode: "auto",
        min: 0.01,
        max: 1.0,
        tick: 18,
        c1x: 0.17106,
        c1y: 0.49026,
        c1z: 0.0,
        c2x: -0.771523,
        c2y: -0.116883,
        c2z: 0.0,
        reversedOnDisable: false
    }, defaults || {});
    const x = Object.assign({}, base, raw || {});
    x.type = SCALE_HELPER_TYPES.includes(String(x.type || "").trim()) ? String(x.type || "").trim() : String(base.type);
    x.runMode = SCALE_HELPER_RUN_MODES.includes(String(x.runMode || "").trim()) ? String(x.runMode || "").trim() : "auto";
    x.min = toNum(x.min);
    x.max = toNum(x.max);
    x.tick = Math.max(1, toInt(x.tick || 18));
    x.c1x = toNum(x.c1x);
    x.c1y = toNum(x.c1y);
    x.c1z = toNum(x.c1z);
    x.c2x = toNum(x.c2x);
    x.c2y = toNum(x.c2y);
    x.c2z = toNum(x.c2z);
    x.reversedOnDisable = !!x.reversedOnDisable;
    return x;
}
