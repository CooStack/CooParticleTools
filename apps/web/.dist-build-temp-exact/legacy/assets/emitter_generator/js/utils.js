import { clamp as sharedClamp, safeNum as sharedSafeNum } from "../../src/js/shared/number.js";
import { escapeHtml as sharedEscapeHtml } from "../../src/js/shared/string.js";
import { deepAssign as sharedDeepAssign, deepCopy as sharedDeepCopy } from "../../src/js/shared/object.js";

export const clamp = sharedClamp;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const safeNum = sharedSafeNum;

export function isNumericLiteral(v) {
    const s = String(v ?? "").trim();
    if (!s) return false;
    const n = Number(s);
    return Number.isFinite(n);
}

export function rewriteKotlinMathExpr(raw) {
    let out = String(raw ?? "").trim();
    if (!out) return "";
    out = out.replace(/\bjava\.lang\.Math\./g, "Math.");
    out = out.replace(/\bStrictMath\./g, "Math.");
    out = out.replace(/\bMath\.PI\b/g, "PI");
    out = out.replace(/\bMath\.E\b/g, "E");
    out = out.replace(/\b(?:java\.lang\.|StrictMath\.)?Math\.random\s*\(\s*\)/g, "Random.Default.nextDouble()");
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
        out = out.replace(re, `${dst}(`);
    }
    return out;
}

export function sanitizeKNumExpr(raw) {
    const s = rewriteKotlinMathExpr(raw);
    if (!s) return "";
    if (/[;`{}\r\n]/.test(s)) return "";
    return s;
}

export const fmtD = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) {
        const expr = sanitizeKNumExpr(n);
        return expr ? `(${expr}).toDouble()` : "0.0";
    }
    let s = (Math.round(num * 1000000) / 1000000).toString();
    if (!s.includes(".")) s += ".0";
    return s;
};

export const fmtB = (b) => (b ? "true" : "false");

export const kVec3 = (x, y, z) => `Vec3(${fmtD(x)}, ${fmtD(y)}, ${fmtD(z)})`;
export const kSupplierVec3 = (x, y, z) => ` { ${kVec3(x, y, z)} }`;

export const kTrailingLambda = (expr, fallback = "this.pos") => {
    const raw = (expr ?? "").trim();
    let s = raw.length ? raw : fallback;
    s = rewriteKotlinMathExpr(s.trim());
    if (s.startsWith("{") && s.endsWith("}")) {
        s = s.substring(1, s.length - 1).trim();
    }
    return `{${s}}`;
};

export function chain(lines) {
    if (!lines.length) return "";
    const head = lines[0];
    const tail = lines.slice(1).map(x => `    ${x}`);
    return [head, ...tail].join("\n");
}

export function indent(s, spaces) {
    const pad = " ".repeat(spaces);
    return s.split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
}

export const escapeHtml = sharedEscapeHtml;
export const deepCopy = sharedDeepCopy;
export const deepAssign = sharedDeepAssign;

export function countDecimalsFromString(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return 0;
    const parts = text.split("e-");
    if (parts.length === 2) {
        const exp = parseInt(parts[1], 10);
        if (Number.isFinite(exp)) return exp;
    }
    const dot = text.indexOf(".");
    if (dot < 0) return 0;
    return Math.max(0, text.length - dot - 1);
}
