export const VECTOR_LITERAL_TYPES = ["Vec3", "RelativeLocation", "Vector3f"];

export function isVectorLiteralType(typeName) {
    return VECTOR_LITERAL_TYPES.includes(String(typeName || "").trim());
}

export function normalizeVectorCtor(rawCtor) {
    const ctor = String(rawCtor || "").trim();
    return VECTOR_LITERAL_TYPES.includes(ctor) ? ctor : "RelativeLocation";
}   

export function formatNumberCompact(value, digits = 6) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) < 1e-9) return "0";
    return n.toFixed(digits).replace(/0+$/g, "").replace(/\.$/, "");
}

export function formatVectorLiteral(ctorRaw, x, y, z) {
    const ctor = normalizeVectorCtor(ctorRaw);
    const nx = Number(x);
    const ny = Number(y);
    const nz = Number(z);
    if (ctor === "Vector3f") {
        return `Vector3f(${formatNumberCompact(nx)}f, ${formatNumberCompact(ny)}f, ${formatNumberCompact(nz)}f)`;
    }
    return `${ctor}(${formatNumberCompact(nx)}, ${formatNumberCompact(ny)}, ${formatNumberCompact(nz)})`;
}

export function parseCtorInLiteral(rawExpr, fallback = "RelativeLocation") {
    const text = String(rawExpr || "").trim();
    const m = text.match(/^(Vec3|RelativeLocation|Vector3f)\s*\(/i);
    if (!m) return normalizeVectorCtor(fallback);
    return normalizeVectorCtor(m[1]);
}

function clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function chanToHex(v) {
    return Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
}

export function vectorToHex01(x, y, z) {
    return `#${chanToHex(x)}${chanToHex(y)}${chanToHex(z)}`;
}

export function hexToVector01(hex) {
    const h = String(hex || "").trim();
    const m = h.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return { x: 1, y: 1, z: 1 };
    const v = m[1];
    return {
        x: parseInt(v.slice(0, 2), 16) / 255,
        y: parseInt(v.slice(2, 4), 16) / 255,
        z: parseInt(v.slice(4, 6), 16) / 255
    };
}

