import { isNumericLiteral, safeNum } from "./utils.js";

const ID_SEED = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 12);

const LINK_SET = new Set(["and", "or"]);
const CMP_SET = new Set(["==", "!=", ">", ">=", "<", "<=", "calc_eq"]);
const COND_LEFT_BASE = new Set(["age", "maxAge", "life", "sign", "respawnCount", "tick", "var"]);
const COND_RIGHT_BASE = new Set(["number", "var", "age", "maxAge", "life", "sign", "respawnCount", "tick"]);
const REASON_SET = new Set(["AGE", "COLLISION", "OUT_OF_RANGE", "MANUAL", "UNKNOWN"]);
const ACTION_OP_SET = new Set(["set", "add", "sub", "mul", "div", "inc", "dec"]);
const ACTION_VALUE_TYPE_SET = new Set(["number", "var", "age", "maxAge", "life", "sign", "respawnCount", "tick"]);
const CALC_MATH_OP_SET = new Set(["+", "-", "*", "/", "%"]);
const CALC_VALUE_MODE_SET = new Set(["box", "expr"]);
const CALC_RESULT_MODE_SET = new Set(["fixed", "calc"]);
const CALC_RESULT_CMP_SET = new Set(["==", "!=", ">", ">=", "<", "<="]);
const CALC_TERM_TYPE_SET = new Set(["number", "var", "age", "maxAge", "life", "sign", "respawnCount", "tick"]);
const EXPR_TOKEN_RE = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[()+\-*/%])\s*/y;
const EXPR_COMPILE_CACHE = new Map();
const BOOL_EXPR_SAFE_RE = /^[0-9A-Za-z_+\-*/%().<>=!&|?: \t\r\n]+$/;
const BOOL_EXPR_BLOCK_RE = /\b(?:new|function|=>|while|for|if|return|class|import|export|this|window|globalThis|constructor|prototype)\b/;
const BOOL_EXPR_FN_CACHE = new Map();

function isIdent(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || "").trim());
}

function toReasonToken(raw) {
    const s = String(raw || "").trim();
    if (!s) return "AGE";
    if (REASON_SET.has(s)) return s;
    if (s.startsWith("RemoveReason.")) {
        const sub = s.slice("RemoveReason.".length).trim();
        if (REASON_SET.has(sub)) return sub;
    }
    return "AGE";
}

function normalizeLink(raw) {
    const s = String(raw || "").trim().toLowerCase();
    return LINK_SET.has(s) ? s : "and";
}

function normalizeCmp(raw) {
    const s = String(raw || "").trim();
    return CMP_SET.has(s) ? s : ">=";
}

function normalizeNumValue(raw, fallback = 0, opts = {}) {
    let n = safeNum(raw, fallback);
    if (opts.int) n = Math.trunc(n);
    if (typeof opts.min === "number") n = Math.max(opts.min, n);
    if (typeof opts.max === "number") n = Math.min(opts.max, n);
    return n;
}

function normalizeCalcMathOp(raw) {
    const s = String(raw || "").trim();
    return CALC_MATH_OP_SET.has(s) ? s : "-";
}

function normalizeCalcValueMode(raw) {
    const s = String(raw || "").trim();
    return CALC_VALUE_MODE_SET.has(s) ? s : "box";
}

function normalizeCalcResultMode(raw) {
    const s = String(raw || "").trim();
    return CALC_RESULT_MODE_SET.has(s) ? s : "fixed";
}

function normalizeCalcResultCmp(raw) {
    const s = String(raw || "").trim();
    return CALC_RESULT_CMP_SET.has(s) ? s : "==";
}

function normalizeTokenAlias(raw) {
    const s = String(raw || "").trim();
    if (s === "life") return "maxAge";
    return s;
}

function exprFromToken(type, value) {
    const t = normalizeTokenAlias(type);
    if (t === "number") {
        const n = Number(value);
        return Number.isFinite(n) ? String(n) : "0";
    }
    if (t === "var") return isIdent(value) ? String(value).trim() : "0";
    if (t === "age" || t === "maxAge" || t === "sign" || t === "respawnCount" || t === "tick") return t;
    return "0";
}

function normalizeCalcExpr(raw, fallback = "0") {
    const s = String(raw ?? "").trim();
    if (s) return s;
    return String(fallback || "0");
}

function buildCalcCompareExpr(cfg) {
    const left = `((${cfg.calcLeftExpr}) ${cfg.calcMathOp} (${cfg.calcRightExpr}))`;
    let right = cfg.calcExpectExpr;
    if (cfg.calcResultMode === "calc") {
        right = `((${cfg.calcExpectLeftExpr}) ${cfg.calcExpectMathOp} (${cfg.calcExpectRightExpr}))`;
    }
    return `${left} ${cfg.calcResultCmp} (${right})`;
}

function normalizeCalcTermType(raw) {
    const s = normalizeTokenAlias(raw);
    return CALC_TERM_TYPE_SET.has(s) ? s : "number";
}

function inferCalcTermFromExpr(rawExpr, fallback = { type: "number", value: 0 }) {
    const s = normalizeTokenAlias(rawExpr);
    if (!s) return { type: normalizeCalcTermType(fallback.type), value: fallback.value };
    if (isNumericLiteral(s)) return { type: "number", value: Number(s) };
    if (s === "age" || s === "maxAge" || s === "sign" || s === "respawnCount" || s === "tick") {
        return { type: s, value: 0 };
    }
    if (isIdent(s)) return { type: "var", value: s };
    return { type: normalizeCalcTermType(fallback.type), value: fallback.value };
}

function normalizeCalcTerm(rawType, rawValue, fallback = { type: "number", value: 0 }) {
    const fb = fallback || { type: "number", value: 0 };
    const type = normalizeCalcTermType(rawType || fb.type);
    if (type === "number") {
        const v = rawValue !== undefined ? rawValue : fb.value;
        return { type, value: normalizeNumValue(v, 0) };
    }
    if (type === "var") {
        const v = String(rawValue ?? fb.value ?? "").trim();
        return { type, value: isIdent(v) ? v : "" };
    }
    return { type, value: 0 };
}

function calcTermToExpr(type, value) {
    const t = normalizeCalcTermType(type);
    if (t === "number") {
        const n = Number(value);
        return Number.isFinite(n) ? String(n) : "0";
    }
    if (t === "var") return isIdent(value) ? String(value).trim() : "0";
    if (t === "age" || t === "maxAge" || t === "sign" || t === "respawnCount" || t === "tick") return t;
    return "0";
}

function parseLeftToken(raw, allowReason = false) {
    const s = String(raw || "").trim();
    if (COND_LEFT_BASE.has(s)) return { left: normalizeTokenAlias(s), leftVar: "" };
    if (allowReason && s === "reason") return { left: "reason", leftVar: "" };
    if (allowReason && (REASON_SET.has(s) || s.startsWith("RemoveReason."))) {
        return { left: "reason", leftVar: "" };
    }
    if (isIdent(s)) return { left: "var", leftVar: s };
    return { left: "age", leftVar: "" };
}

function parseRightToken(raw, allowReason = false) {
    const s = String(raw || "").trim();
    if (!s) return { right: "number", rightValue: 0 };
    if (isNumericLiteral(s)) return { right: "number", rightValue: Number(s) };
    if (allowReason && s === "reason") return { right: "reason", rightValue: "AGE" };
    if (allowReason && (REASON_SET.has(s) || s.startsWith("RemoveReason."))) {
        return { right: "reason", rightValue: toReasonToken(s) };
    }
    if (COND_RIGHT_BASE.has(s)) return { right: normalizeTokenAlias(s), rightValue: 0 };
    if (isIdent(s)) return { right: "var", rightValue: s };
    return { right: "number", rightValue: 0 };
}

export function createConditionRule(seed = {}, opts = {}) {
    return normalizeConditionRule({
        id: seed.id || ID_SEED(),
        link: seed.link ?? "and",
        left: seed.left ?? "age",
        leftVar: seed.leftVar ?? "",
        op: seed.op ?? ">=",
        right: seed.right ?? "number",
        rightValue: seed.rightValue ?? 0,
        calcLeftExpr: seed.calcLeftExpr ?? "",
        calcMathOp: seed.calcMathOp ?? "-",
        calcRightExpr: seed.calcRightExpr ?? "",
        calcValueMode: seed.calcValueMode ?? "box",
        calcBooleanExpr: seed.calcBooleanExpr ?? "",
        calcExpectExpr: seed.calcExpectExpr ?? "0",
        calcResultMode: seed.calcResultMode ?? "fixed",
        calcResultCmp: seed.calcResultCmp ?? "==",
        calcExpectLeftExpr: seed.calcExpectLeftExpr ?? "",
        calcExpectMathOp: seed.calcExpectMathOp ?? "+",
        calcExpectRightExpr: seed.calcExpectRightExpr ?? "",
        calcLeftTermType: seed.calcLeftTermType ?? "age",
        calcLeftTermValue: seed.calcLeftTermValue ?? 0,
        calcRightTermType: seed.calcRightTermType ?? "number",
        calcRightTermValue: seed.calcRightTermValue ?? 0,
        calcFixedTermType: seed.calcFixedTermType ?? "number",
        calcFixedTermValue: seed.calcFixedTermValue ?? 0,
        calcExpectLeftTermType: seed.calcExpectLeftTermType ?? "number",
        calcExpectLeftTermValue: seed.calcExpectLeftTermValue ?? 0,
        calcExpectRightTermType: seed.calcExpectRightTermType ?? "number",
        calcExpectRightTermValue: seed.calcExpectRightTermValue ?? 0,
    }, opts);
}

export function parseLegacyConditionExpr(expr, opts = {}) {
    const allowReason = !!opts.allowReason;
    const raw = String(expr || "").trim();
    if (!raw) return [];
    const segs = raw.split(/(\&\&|\|\|)/).map((x) => x.trim()).filter(Boolean);
    const rows = [];
    let link = "and";
    for (const seg of segs) {
        if (seg === "&&") {
            link = "and";
            continue;
        }
        if (seg === "||") {
            link = "or";
            continue;
        }
        const m = seg.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (!m) continue;
        const leftTok = parseLeftToken(m[1], allowReason);
        const rightTok = parseRightToken(m[3], allowReason);
        const row = createConditionRule({
            link: rows.length ? link : "and",
            left: leftTok.left,
            leftVar: leftTok.leftVar,
            op: m[2],
            right: rightTok.right,
            rightValue: rightTok.rightValue,
        }, opts);
        rows.push(row);
    }
    return rows;
}

export function normalizeConditionRule(raw, opts = {}) {
    const allowReason = !!opts.allowReason;
    const out = {
        id: String(raw?.id || ID_SEED()),
        link: normalizeLink(raw?.link),
        left: "age",
        leftVar: "",
        op: normalizeCmp(raw?.op),
        right: "number",
        rightValue: 0,
    };

    const leftSet = allowReason
        ? new Set([...COND_LEFT_BASE, "reason"])
        : COND_LEFT_BASE;
    const rightSet = allowReason
        ? new Set([...COND_RIGHT_BASE, "reason"])
        : COND_RIGHT_BASE;

    const left = String(raw?.left || "").trim();
    if (leftSet.has(left)) out.left = normalizeTokenAlias(left);
    if (out.left === "var") {
        const lv = String(raw?.leftVar || "").trim();
        out.leftVar = isIdent(lv) ? lv : "";
    } else {
        out.leftVar = "";
    }

    const right = String(raw?.right || "").trim();
    if (rightSet.has(right)) out.right = normalizeTokenAlias(right);
    if (out.right === "number") {
        out.rightValue = normalizeNumValue(raw?.rightValue, 0);
    } else if (out.right === "var") {
        const rv = String(raw?.rightValue || "").trim();
        out.rightValue = isIdent(rv) ? rv : "";
    } else if (out.right === "reason") {
        out.rightValue = toReasonToken(raw?.rightValue);
    } else {
        out.rightValue = 0;
    }

    if ((out.left === "reason" || out.right === "reason") && !["==", "!="].includes(out.op)) {
        out.op = "==";
    }
    const hasCalcPayload = !!raw && typeof raw === "object" && (
        raw.calcValueMode !== undefined
        || raw.calcBooleanExpr !== undefined
        || raw.calcLeftExpr !== undefined
        || raw.calcRightExpr !== undefined
        || raw.calcExpectExpr !== undefined
        || raw.calcExpectLeftExpr !== undefined
        || raw.calcExpectRightExpr !== undefined
        || raw.calcLeftTermType !== undefined
        || raw.calcRightTermType !== undefined
        || raw.calcFixedTermType !== undefined
        || raw.calcExpectLeftTermType !== undefined
        || raw.calcExpectRightTermType !== undefined
    );
    if (out.op === "==" && out.left !== "reason" && out.right !== "reason" && hasCalcPayload) {
        out.op = "calc_eq";
    }

    const legacyLeftExpr = exprFromToken(out.left === "var" ? "var" : out.left, out.left === "var" ? out.leftVar : out.left);
    const legacyRightExpr = exprFromToken(out.right, out.rightValue);
    out.calcValueMode = normalizeCalcValueMode(raw?.calcValueMode);
    out.calcMathOp = normalizeCalcMathOp(raw?.calcMathOp);
    out.calcExpectMathOp = normalizeCalcMathOp(raw?.calcExpectMathOp);
    out.calcResultMode = normalizeCalcResultMode(raw?.calcResultMode);
    out.calcResultCmp = normalizeCalcResultCmp(raw?.calcResultCmp);

    const leftTermFallback = inferCalcTermFromExpr(raw?.calcLeftExpr, { type: out.left === "var" ? "var" : out.left, value: out.leftVar || 0 });
    const rightTermFallback = inferCalcTermFromExpr(raw?.calcRightExpr, inferCalcTermFromExpr(legacyRightExpr));
    const fixedTermFallback = inferCalcTermFromExpr(raw?.calcExpectExpr, { type: "number", value: 0 });
    const expectLeftFallback = inferCalcTermFromExpr(raw?.calcExpectLeftExpr, inferCalcTermFromExpr(legacyRightExpr));
    const expectRightFallback = inferCalcTermFromExpr(raw?.calcExpectRightExpr, { type: "number", value: 0 });

    const leftTerm = normalizeCalcTerm(raw?.calcLeftTermType, raw?.calcLeftTermValue, leftTermFallback);
    const rightTerm = normalizeCalcTerm(raw?.calcRightTermType, raw?.calcRightTermValue, rightTermFallback);
    const fixedTerm = normalizeCalcTerm(raw?.calcFixedTermType, raw?.calcFixedTermValue, fixedTermFallback);
    const expectLeftTerm = normalizeCalcTerm(raw?.calcExpectLeftTermType, raw?.calcExpectLeftTermValue, expectLeftFallback);
    const expectRightTerm = normalizeCalcTerm(raw?.calcExpectRightTermType, raw?.calcExpectRightTermValue, expectRightFallback);

    out.calcLeftTermType = leftTerm.type;
    out.calcLeftTermValue = leftTerm.value;
    out.calcRightTermType = rightTerm.type;
    out.calcRightTermValue = rightTerm.value;
    out.calcFixedTermType = fixedTerm.type;
    out.calcFixedTermValue = fixedTerm.value;
    out.calcExpectLeftTermType = expectLeftTerm.type;
    out.calcExpectLeftTermValue = expectLeftTerm.value;
    out.calcExpectRightTermType = expectRightTerm.type;
    out.calcExpectRightTermValue = expectRightTerm.value;

    if (out.calcValueMode === "box") {
        out.calcLeftExpr = calcTermToExpr(out.calcLeftTermType, out.calcLeftTermValue);
        out.calcRightExpr = calcTermToExpr(out.calcRightTermType, out.calcRightTermValue);
        out.calcExpectExpr = calcTermToExpr(out.calcFixedTermType, out.calcFixedTermValue);
        out.calcExpectLeftExpr = calcTermToExpr(out.calcExpectLeftTermType, out.calcExpectLeftTermValue);
        out.calcExpectRightExpr = calcTermToExpr(out.calcExpectRightTermType, out.calcExpectRightTermValue);
    } else {
        out.calcLeftExpr = normalizeCalcExpr(raw?.calcLeftExpr, calcTermToExpr(leftTerm.type, leftTerm.value));
        out.calcRightExpr = normalizeCalcExpr(raw?.calcRightExpr, calcTermToExpr(rightTerm.type, rightTerm.value));
        out.calcExpectExpr = normalizeCalcExpr(raw?.calcExpectExpr, calcTermToExpr(fixedTerm.type, fixedTerm.value));
        out.calcExpectLeftExpr = normalizeCalcExpr(raw?.calcExpectLeftExpr, calcTermToExpr(expectLeftTerm.type, expectLeftTerm.value));
        out.calcExpectRightExpr = normalizeCalcExpr(raw?.calcExpectRightExpr, calcTermToExpr(expectRightTerm.type, expectRightTerm.value));
    }
    out.calcBooleanExpr = normalizeCalcExpr(raw?.calcBooleanExpr, buildCalcCompareExpr(out));

    return out;
}

export function createConditionFilter(seed = {}, opts = {}) {
    return normalizeConditionFilter({
        enabled: false,
        rules: [createConditionRule({}, opts)],
        ...seed,
    }, opts);
}

export function normalizeConditionFilter(raw, opts = {}) {
    const out = {
        enabled: false,
        rules: [],
    };
    const src = (raw && typeof raw === "object") ? raw : {};
    const allowReason = !!opts.allowReason;

    let rules = [];
    if (Array.isArray(src.rules)) {
        rules = src.rules.map((it) => normalizeConditionRule(it, opts));
    } else {
        const legacyExpr = String(src.expr || src.condition || "").trim();
        if (legacyExpr) rules = parseLegacyConditionExpr(legacyExpr, opts);
    }
    if (!rules.length) rules = [createConditionRule({}, opts)];

    out.enabled = !!src.enabled && rules.length > 0;
    out.rules = rules.map((it, idx) => {
        const row = normalizeConditionRule(it, opts);
        row.link = idx === 0 ? "and" : row.link;
        if (allowReason && row.left === "reason") {
            row.right = "reason";
            row.rightValue = toReasonToken(row.rightValue);
            if (!["==", "!="].includes(row.op)) row.op = "==";
        }
        return row;
    });
    return out;
}

function compileMathExpr(expr) {
    const key = String(expr || "").trim();
    if (!key) return null;
    if (EXPR_COMPILE_CACHE.has(key)) return EXPR_COMPILE_CACHE.get(key);

    const tokens = [];
    let idx = 0;
    while (idx < key.length) {
        EXPR_TOKEN_RE.lastIndex = idx;
        const m = EXPR_TOKEN_RE.exec(key);
        if (!m) {
            EXPR_COMPILE_CACHE.set(key, null);
            return null;
        }
        tokens.push(m[1]);
        idx = EXPR_TOKEN_RE.lastIndex;
    }

    const out = [];
    const ops = [];
    let prev = "start"; // start | value | op | (
    const prec = (op) => {
        if (op === "u-") return 3;
        if (op === "*" || op === "/" || op === "%") return 2;
        return 1;
    };
    const isOp = (op) => op === "+" || op === "-" || op === "*" || op === "/" || op === "%" || op === "u-";

    for (const tk of tokens) {
        if (isNumericLiteral(tk)) {
            out.push({ t: "n", v: Number(tk) });
            prev = "value";
            continue;
        }
        if (isIdent(tk)) {
            out.push({ t: "id", v: tk });
            prev = "value";
            continue;
        }
        if (tk === "(") {
            ops.push(tk);
            prev = "(";
            continue;
        }
        if (tk === ")") {
            let matched = false;
            while (ops.length) {
                const top = ops.pop();
                if (top === "(") {
                    matched = true;
                    break;
                }
                out.push({ t: "op", v: top });
            }
            if (!matched) {
                EXPR_COMPILE_CACHE.set(key, null);
                return null;
            }
            prev = "value";
            continue;
        }
        if (tk === "+" || tk === "-" || tk === "*" || tk === "/" || tk === "%") {
            let op = tk;
            if (op === "-" && (prev === "start" || prev === "op" || prev === "(")) op = "u-";
            while (ops.length) {
                const top = ops[ops.length - 1];
                if (!isOp(top)) break;
                const rightAssoc = op === "u-";
                if ((rightAssoc && prec(op) < prec(top)) || (!rightAssoc && prec(op) <= prec(top))) {
                    out.push({ t: "op", v: ops.pop() });
                    continue;
                }
                break;
            }
            ops.push(op);
            prev = "op";
            continue;
        }
        EXPR_COMPILE_CACHE.set(key, null);
        return null;
    }

    while (ops.length) {
        const top = ops.pop();
        if (top === "(" || top === ")") {
            EXPR_COMPILE_CACHE.set(key, null);
            return null;
        }
        out.push({ t: "op", v: top });
    }

    const compiled = { src: key, rpn: out };
    EXPR_COMPILE_CACHE.set(key, compiled);
    return compiled;
}

function evalCompiledMathExpr(compiled, ctx = {}, vars = {}) {
    if (!compiled || !Array.isArray(compiled.rpn) || !compiled.rpn.length) return 0;
    const st = [];
    for (const tk of compiled.rpn) {
        if (tk.t === "n") {
            st.push(Number.isFinite(tk.v) ? tk.v : 0);
            continue;
        }
        if (tk.t === "id") {
            st.push(readNamedNumber(tk.v, ctx, vars, 0));
            continue;
        }
        if (tk.t !== "op") return 0;
        if (tk.v === "u-") {
            if (!st.length) return 0;
            const a = Number(st.pop());
            st.push(Number.isFinite(a) ? -a : 0);
            continue;
        }
        if (st.length < 2) return 0;
        const b = Number(st.pop());
        const a = Number(st.pop());
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
            st.push(0);
            continue;
        }
        if (tk.v === "+") st.push(a + b);
        else if (tk.v === "-") st.push(a - b);
        else if (tk.v === "*") st.push(a * b);
        else if (tk.v === "/") st.push(Math.abs(b) < 1e-12 ? 0 : a / b);
        else if (tk.v === "%") st.push(Math.abs(b) < 1e-12 ? 0 : a % b);
        else return 0;
    }
    if (st.length !== 1) return 0;
    const out = Number(st[0]);
    return Number.isFinite(out) ? out : 0;
}

function evalMathExpr(raw, ctx = {}, vars = {}, fallback = 0) {
    const expr = String(raw || "").trim();
    if (!expr) return fallback;
    const compiled = compileMathExpr(expr);
    if (compiled) return evalCompiledMathExpr(compiled, ctx, vars);
    return evalNumberLike(expr, fallback, ctx, vars);
}

function evalMathBinary(left, op, right) {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (op === "+") return a + b;
    if (op === "-") return a - b;
    if (op === "*") return a * b;
    if (op === "/") return Math.abs(b) < 1e-12 ? 0 : a / b;
    if (op === "%") return Math.abs(b) < 1e-12 ? 0 : a % b;
    return 0;
}

function compareCalcResult(lhs, cmp, rhs) {
    const ln = Number(lhs);
    const rn = Number(rhs);
    if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
    if (cmp === "==") return Math.abs(ln - rn) <= 1e-6;
    if (cmp === "!=") return Math.abs(ln - rn) > 1e-6;
    if (cmp === ">") return ln > rn;
    if (cmp === ">=") return ln >= rn;
    if (cmp === "<") return ln < rn;
    if (cmp === "<=") return ln <= rn;
    return false;
}

function compileBooleanExpr(expr) {
    const key = String(expr || "").trim();
    if (!key) return null;
    if (BOOL_EXPR_FN_CACHE.has(key)) return BOOL_EXPR_FN_CACHE.get(key);
    if (!BOOL_EXPR_SAFE_RE.test(key) || BOOL_EXPR_BLOCK_RE.test(key)) {
        BOOL_EXPR_FN_CACHE.set(key, null);
        return null;
    }
    try {
        const fn = new Function("scope", `with(scope){ return !!(${key}); }`);
        BOOL_EXPR_FN_CACHE.set(key, fn);
        return fn;
    } catch {
        BOOL_EXPR_FN_CACHE.set(key, null);
        return null;
    }
}

export function validateBooleanExpr(expr) {
    const key = String(expr || "").trim();
    if (!key) return { ok: false, error: "表达式为空" };
    if (!BOOL_EXPR_SAFE_RE.test(key) || BOOL_EXPR_BLOCK_RE.test(key)) {
        return { ok: false, error: "包含不支持的字符或关键字" };
    }
    const fn = compileBooleanExpr(key);
    if (!fn) return { ok: false, error: "语法错误" };
    return { ok: true, error: "" };
}

function evalBooleanExpr(expr, ctx = {}, vars = {}, fallback = false) {
    const key = String(expr || "").trim();
    if (!key) return !!fallback;
    const fn = compileBooleanExpr(key);
    if (!fn) return !!fallback;
    const scope = Object.create(null);
    if (ctx && typeof ctx === "object") {
        for (const [k, v] of Object.entries(ctx)) scope[k] = v;
    }
    if (vars && typeof vars === "object") {
        for (const [k, v] of Object.entries(vars)) scope[k] = v;
    }
    scope.Math = Math;
    scope.abs = Math.abs;
    try {
        return !!fn(scope);
    } catch {
        return !!fallback;
    }
}

function booleanExprToKotlin(expr, ctxMap = {}) {
    let out = String(expr || "").trim();
    if (!out) return "false";
    const check = validateBooleanExpr(out);
    if (!check.ok) return "false";
    out = out.replace(/!==/g, "!=").replace(/===/g, "==");
    out = out.replace(/\bMath\.abs\s*\(/g, "abs(");
    const mapKeys = ["age", "maxAge", "life", "sign", "respawnCount", "tick", "reason"];
    for (const key of mapKeys) {
        let target = String(ctxMap?.[key] || "").trim();
        if (!target && key === "life") target = String(ctxMap?.maxAge || "").trim();
        if (!target && key === "maxAge") target = String(ctxMap?.life || "").trim();
        if (!target || target === key) continue;
        const re = new RegExp(`\\b${key}\\b`, "g");
        out = out.replace(re, target);
    }
    return out;
}

function mathExprToKotlin(raw, ctxMap = {}, numFmt = defaultNumKotlin) {
    const expr = String(raw || "").trim();
    if (!expr) return numFmt(0);
    const compiled = compileMathExpr(expr);
    if (!compiled || !Array.isArray(compiled.rpn) || !compiled.rpn.length) {
        const n = Number(expr);
        if (Number.isFinite(n)) return numFmt(n);
        if (isIdent(expr)) {
            const tk = normalizeTokenAlias(expr);
            if (tk === "age" || tk === "maxAge" || tk === "sign" || tk === "respawnCount" || tk === "tick") {
                return `(${tokenToKotlin(tk, tk, ctxMap, numFmt)}).toDouble()`;
            }
            return `(${expr}).toDouble()`;
        }
        return numFmt(0);
    }

    const st = [];
    for (const tk of compiled.rpn) {
        if (tk.t === "n") {
            st.push(numFmt(tk.v));
            continue;
        }
        if (tk.t === "id") {
            const id = normalizeTokenAlias(tk.v || "");
            if (id === "age" || id === "maxAge" || id === "sign" || id === "respawnCount" || id === "tick") {
                st.push(`(${tokenToKotlin(id, id, ctxMap, numFmt)}).toDouble()`);
            } else if (isIdent(id)) {
                st.push(`(${id}).toDouble()`);
            } else {
                st.push(numFmt(0));
            }
            continue;
        }
        if (tk.t !== "op") return numFmt(0);
        if (tk.v === "u-") {
            if (!st.length) return numFmt(0);
            const a = st.pop();
            st.push(`(-(${a}))`);
            continue;
        }
        if (st.length < 2) return numFmt(0);
        const b = st.pop();
        const a = st.pop();
        st.push(`((${a}) ${tk.v} (${b}))`);
    }
    if (st.length !== 1) return numFmt(0);
    return st[0];
}

function detectValueType(raw) {
    const s = normalizeTokenAlias(raw);
    if (!s) return { valueType: "number", value: 0 };
    if (isNumericLiteral(s)) return { valueType: "number", value: Number(s) };
    if (ACTION_VALUE_TYPE_SET.has(s)) return { valueType: s, value: 0 };
    if (isIdent(s)) return { valueType: "var", value: s };
    return { valueType: "number", value: 0 };
}

export function createVarAction(seed = {}) {
    return normalizeVarAction({
        id: seed.id || ID_SEED(),
        varName: seed.varName || "",
        op: seed.op || "add",
        valueType: seed.valueType || "number",
        value: seed.value ?? 1,
    });
}

export function parseLegacyVarActionExpr(expr) {
    const raw = String(expr || "").trim();
    if (!raw) return null;
    let m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+\+|--)$/);
    if (m) {
        return normalizeVarAction({
            varName: m[1],
            op: m[2] === "++" ? "inc" : "dec",
            valueType: "number",
            value: 1,
        });
    }
    m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/);
    if (!m) return null;
    const opMap = {
        "=": "set",
        "+=": "add",
        "-=": "sub",
        "*=": "mul",
        "/=": "div",
    };
    const rhs = detectValueType(m[3]);
    return normalizeVarAction({
        varName: m[1],
        op: opMap[m[2]] || "set",
        valueType: rhs.valueType,
        value: rhs.value,
    });
}

export function normalizeVarAction(raw) {
    if (!raw || typeof raw !== "object") return createVarAction();
    const fromExpr = String(raw.expr || "").trim();
    if (fromExpr) {
        const parsed = parseLegacyVarActionExpr(fromExpr);
        if (parsed) {
            parsed.id = String(raw.id || parsed.id || ID_SEED());
            return parsed;
        }
    }
    const out = {
        id: String(raw.id || ID_SEED()),
        varName: isIdent(raw.varName) ? String(raw.varName).trim() : "",
        op: ACTION_OP_SET.has(raw.op) ? String(raw.op) : "set",
        valueType: ACTION_VALUE_TYPE_SET.has(normalizeTokenAlias(raw.valueType)) ? normalizeTokenAlias(raw.valueType) : "number",
        value: 0,
    };
    if (out.valueType === "number") {
        out.value = normalizeNumValue(raw.value, 0);
    } else if (out.valueType === "var") {
        out.value = isIdent(raw.value) ? String(raw.value).trim() : "";
    } else {
        out.value = 0;
    }
    return out;
}

export function normalizeVarActionList(list) {
    const src = Array.isArray(list) ? list : [];
    return src.map((it) => normalizeVarAction(it));
}

function readNamedNumber(name, ctx = {}, vars = {}, fallback = 0) {
    const rawKey = String(name || "").trim();
    if (!rawKey) return fallback;
    const key = normalizeTokenAlias(rawKey);
    const readOne = (obj, k) => {
        if (!obj || typeof obj !== "object") return null;
        if (!Object.prototype.hasOwnProperty.call(obj, k)) return null;
        const n = Number(obj[k]);
        return Number.isFinite(n) ? n : null;
    };
    const keys = [key];
    if (key === "maxAge") keys.push("life");
    if (rawKey === "life") keys.push("maxAge");
    for (const k of keys) {
        const c = readOne(ctx, k);
        if (c != null) return c;
        const v = readOne(vars, k);
        if (v != null) return v;
    }
    return fallback;
}

export function evalNumberLike(raw, fallback = 0, ctx = {}, vars = {}, opts = {}) {
    let n = fallback;
    if (typeof raw === "number") {
        n = raw;
    } else if (typeof raw === "string") {
        const s = raw.trim();
        if (!s) n = fallback;
        else if (isNumericLiteral(s)) n = Number(s);
        else if (isIdent(s)) n = readNamedNumber(s, ctx, vars, fallback);
        else n = fallback;
    } else {
        const v = Number(raw);
        if (Number.isFinite(v)) n = v;
    }
    if (!Number.isFinite(n)) n = fallback;
    if (opts.int) n = Math.trunc(n);
    if (typeof opts.min === "number") n = Math.max(opts.min, n);
    if (typeof opts.max === "number") n = Math.min(opts.max, n);
    return n;
}

function resolveToken(type, value, ctx = {}, vars = {}) {
    const t = normalizeTokenAlias(type);
    if (t === "number") return evalNumberLike(value, 0, ctx, vars);
    if (t === "var") return readNamedNumber(value, ctx, vars, 0);
    if (t === "age" || t === "maxAge" || t === "sign" || t === "respawnCount" || t === "tick") {
        return readNamedNumber(t, ctx, vars, 0);
    }
    if (t === "reason") return toReasonToken(value);
    return 0;
}

function resolveLeftToken(rule, ctx = {}, vars = {}) {
    if (!rule) return 0;
    if (rule.left === "var") return readNamedNumber(rule.leftVar, ctx, vars, 0);
    if (rule.left === "reason") return toReasonToken(ctx.reason);
    return resolveToken(rule.left, 0, ctx, vars);
}

function resolveRightToken(rule, ctx = {}, vars = {}) {
    if (!rule) return 0;
    if (rule.right === "var") return readNamedNumber(rule.rightValue, ctx, vars, 0);
    if (rule.right === "reason") return toReasonToken(rule.rightValue);
    if (rule.right === "number") return evalNumberLike(rule.rightValue, 0, ctx, vars);
    return resolveToken(rule.right, rule.rightValue, ctx, vars);
}

function compareValues(lhs, op, rhs) {
    if (op === "==" || op === "!=") {
        const out = lhs === rhs;
        return op === "==" ? out : !out;
    }
    const ln = Number(lhs);
    const rn = Number(rhs);
    if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
    if (op === ">") return ln > rn;
    if (op === ">=") return ln >= rn;
    if (op === "<") return ln < rn;
    if (op === "<=") return ln <= rn;
    return false;
}

export function evaluateCalcEqRule(rule, ctx = {}, vars = {}, fallbackLeft = 0, fallbackRight = 0) {
    const cfg = normalizeConditionRule(rule, { allowReason: true });
    if (cfg.calcValueMode === "expr") {
        return evalBooleanExpr(cfg.calcBooleanExpr, ctx, vars, false);
    }

    const fbL = Number.isFinite(Number(fallbackLeft)) ? Number(fallbackLeft) : 0;
    const fbR = Number.isFinite(Number(fallbackRight)) ? Number(fallbackRight) : 0;
    const a = evalMathExpr(cfg.calcLeftExpr, ctx, vars, fbL);
    const b = evalMathExpr(cfg.calcRightExpr, ctx, vars, fbR);
    const lhs = evalMathBinary(a, cfg.calcMathOp, b);
    let rhs = 0;
    if (cfg.calcResultMode === "calc") {
        const c1 = evalMathExpr(cfg.calcExpectLeftExpr, ctx, vars, fbR);
        const c2 = evalMathExpr(cfg.calcExpectRightExpr, ctx, vars, 0);
        rhs = evalMathBinary(c1, cfg.calcExpectMathOp, c2);
    } else {
        rhs = evalMathExpr(cfg.calcExpectExpr, ctx, vars, 0);
    }
    return compareCalcResult(lhs, cfg.calcResultCmp, rhs);
}

export function evaluateConditionFilter(filter, ctx = {}, vars = {}, opts = {}) {
    const allowReason = !!opts.allowReason;
    const cfg = (filter && typeof filter === "object" && Array.isArray(filter.rules))
        ? filter
        : normalizeConditionFilter(filter, { allowReason });
    if (!cfg.enabled) return true;
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    if (!rules.length) return true;
    let result = null;
    for (let i = 0; i < rules.length; i++) {
        const row = rules[i];
        const lhs = resolveLeftToken(row, ctx, vars);
        const rhs = resolveRightToken(row, ctx, vars);
        const useCalcCompare = (row.op === "calc_eq")
            || (row.op === "==" && row.left !== "reason" && row.right !== "reason");
        const ok = useCalcCompare
            ? evaluateCalcEqRule(row, ctx, vars, lhs, rhs)
            : compareValues(lhs, row.op, rhs);
        if (result == null) {
            result = ok;
        } else if (row.link === "or") {
            result = result || ok;
        } else {
            result = result && ok;
        }
    }
    return result == null ? true : !!result;
}

function resolveActionValue(action, ctx = {}, vars = {}) {
    if (!action) return 0;
    if (action.valueType === "number") return evalNumberLike(action.value, 0, ctx, vars);
    if (action.valueType === "var") return readNamedNumber(action.value, ctx, vars, 0);
    return resolveToken(action.valueType, action.value, ctx, vars);
}

export function applyVarAction(action, vars = {}, ctx = {}) {
    const a = normalizeVarAction(action);
    if (!isIdent(a.varName)) return false;
    const key = a.varName;
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return false;
    let cur = Number(vars[key]);
    if (!Number.isFinite(cur)) cur = 0;
    if (a.op === "inc") {
        vars[key] = cur + 1;
        return true;
    }
    if (a.op === "dec") {
        vars[key] = cur - 1;
        return true;
    }
    const rhs = Number(resolveActionValue(a, ctx, vars));
    const val = Number.isFinite(rhs) ? rhs : 0;
    if (a.op === "set") vars[key] = val;
    else if (a.op === "add") vars[key] = cur + val;
    else if (a.op === "sub") vars[key] = cur - val;
    else if (a.op === "mul") vars[key] = cur * val;
    else if (a.op === "div") vars[key] = Math.abs(val) < 1e-12 ? cur : cur / val;
    else return false;
    return true;
}

function defaultNumKotlin(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0.0";
    if (Math.trunc(n) === n) return `${n}.0`;
    return String(n);
}

function tokenToKotlin(type, value, ctxMap = {}, numFmt = defaultNumKotlin) {
    const t = normalizeTokenAlias(type);
    if (t === "number") return numFmt(value);
    if (t === "var") return isIdent(value) ? String(value).trim() : "0.0";
    if (t === "reason") return `RemoveReason.${toReasonToken(value)}`;
    if (t === "age" || t === "maxAge" || t === "sign" || t === "respawnCount" || t === "tick") {
        let mapped = ctxMap[t];
        if ((!mapped || !String(mapped).trim()) && t === "maxAge") mapped = ctxMap.life;
        if (mapped && String(mapped).trim()) return String(mapped).trim();
        return t;
    }
    return "0.0";
}

export function conditionFilterToKotlin(filter, ctxMap = {}, opts = {}) {
    const cfg = normalizeConditionFilter(filter, { allowReason: !!opts.allowReason });
    if (!cfg.enabled) return "";
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    if (!rules.length) return "";
    const numFmt = typeof opts.numFmt === "function" ? opts.numFmt : defaultNumKotlin;
    const parts = [];
    for (let i = 0; i < rules.length; i++) {
        const row = rules[i];
        let lhs = "";
        if (row.left === "var") {
            lhs = tokenToKotlin("var", row.leftVar, ctxMap, numFmt);
        } else if (row.left === "reason") {
            const reasonRef = String(ctxMap.reason || "").trim();
            lhs = reasonRef || "reason";
        } else {
            lhs = tokenToKotlin(row.left, row.left, ctxMap, numFmt);
        }
        const rhs = tokenToKotlin(row.right, row.rightValue, ctxMap, numFmt);
        const op = row.op;
        let cmp = "";
        const useCalcCompare = (op === "calc_eq")
            || (op === "==" && row.left !== "reason" && row.right !== "reason");
        if (useCalcCompare) {
            const cfg = normalizeConditionRule(row, { allowReason: !!opts.allowReason });
            if (cfg.calcValueMode === "expr") {
                cmp = `(${booleanExprToKotlin(cfg.calcBooleanExpr, ctxMap)})`;
            } else {
                const calcA = mathExprToKotlin(cfg.calcLeftExpr, ctxMap, numFmt);
                const calcB = mathExprToKotlin(cfg.calcRightExpr, ctxMap, numFmt);
                const mathOp = normalizeCalcMathOp(cfg.calcMathOp);
                const leftExpr = `(((${calcA}) ${mathOp} (${calcB})).toDouble())`;
                let rightExpr = "";
                if (cfg.calcResultMode === "calc") {
                    const c1 = mathExprToKotlin(cfg.calcExpectLeftExpr, ctxMap, numFmt);
                    const c2 = mathExprToKotlin(cfg.calcExpectRightExpr, ctxMap, numFmt);
                    const cOp = normalizeCalcMathOp(cfg.calcExpectMathOp);
                    rightExpr = `(((${c1}) ${cOp} (${c2})).toDouble())`;
                } else {
                    const calcC = mathExprToKotlin(cfg.calcExpectExpr, ctxMap, numFmt);
                    rightExpr = `((${calcC}).toDouble())`;
                }
                const resultCmp = normalizeCalcResultCmp(cfg.calcResultCmp);
                if (resultCmp === "==") cmp = `(abs((${leftExpr}) - (${rightExpr})) <= 1e-6)`;
                else if (resultCmp === "!=") cmp = `(abs((${leftExpr}) - (${rightExpr})) > 1e-6)`;
                else cmp = `((${leftExpr}) ${resultCmp} (${rightExpr}))`;
            }
        } else {
            cmp = `(${lhs} ${op} ${rhs})`;
        }
        if (i === 0) {
            parts.push(cmp);
        } else {
            parts.push((row.link === "or" ? "||" : "&&"));
            parts.push(cmp);
        }
    }
    return parts.join(" ");
}

export function varActionToKotlin(action, ctxMap = {}, opts = {}) {
    const a = normalizeVarAction(action);
    if (!isIdent(a.varName)) return "";
    if (a.op === "inc") return `${a.varName}++`;
    if (a.op === "dec") return `${a.varName}--`;
    const numFmt = typeof opts.numFmt === "function" ? opts.numFmt : defaultNumKotlin;
    const rhs = tokenToKotlin(a.valueType, a.value, ctxMap, numFmt);
    const opMap = {
        set: "=",
        add: "+=",
        sub: "-=",
        mul: "*=",
        div: "/=",
    };
    const sym = opMap[a.op] || "=";
    return `${a.varName} ${sym} ${rhs}`;
}
