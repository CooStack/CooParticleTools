const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const JS_LINT_KEYWORDS = new Set([
    "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return",
    "let", "const", "var", "function", "class", "new", "this", "typeof", "instanceof",
    "try", "catch", "finally", "throw", "extends", "super", "import", "from", "export", "as",
    "true", "false", "null", "undefined", "in", "of", "await", "async"
]);

const JS_RESERVED_CALL_NAMES = new Set([
    "if", "for", "while", "switch", "catch", "function", "typeof", "return", "new", "class"
]);

const DO_TICK_API_CALLS = new Set([
    "setVar", "getVar", "hasVar",
    "addVar", "subVar", "mulVar", "divVar",
    "incVar", "decVar", "clampVar",
    "rand", "randInt", "clamp",
    "min", "max", "abs", "floor", "ceil", "round", "trunc",
    "pow", "sqrt", "sin", "cos", "tan", "log", "exp", "sign"
]);

const DO_TICK_GLOBALS = new Set([
    "Math",
    "PI",
    "tick",
    ...DO_TICK_API_CALLS,
]);

function stripJsForLint(raw) {
    const src = String(raw || "");
    return src.replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        (m) => " ".repeat(m.length)
    );
}

function collectJsDeclaredNames(raw) {
    const src = stripJsForLint(raw);
    const names = new Set();
    const push = (value) => {
        const name = String(value || "").trim();
        if (IDENT_RE.test(name)) names.add(name);
    };
    for (const m of src.matchAll(/\b(?:let|const|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\bfunction(?:\s+[A-Za-z_$][A-Za-z0-9_$]*)?\s*\(([^)]*)\)/g)) {
        const params = String(m[1] || "").split(",");
        for (const rawParam of params) {
            const head = String(rawParam || "").split("=")[0];
            push(head.trim());
        }
    }
    for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g)) {
        push(m[1]);
    }
    for (const m of src.matchAll(/\(\s*([^)]*?)\s*\)\s*=>/g)) {
        const params = String(m[1] || "").split(",");
        for (const rawParam of params) {
            const head = String(rawParam || "").split("=")[0];
            push(head.trim());
        }
    }
    return names;
}

function findFirstUnknownJsIdentifier(raw, allowedNames = new Set()) {
    const src = stripJsForLint(raw);
    const local = collectJsDeclaredNames(src);
    for (const m of src.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)) {
        const name = String(m[0] || "");
        if (!name) continue;
        if (JS_LINT_KEYWORDS.has(name)) continue;
        if (DO_TICK_GLOBALS.has(name)) continue;
        if (allowedNames.has(name)) continue;
        if (local.has(name)) continue;
        const idx = Number(m.index) || 0;
        const prev = idx > 0 ? src[idx - 1] : "";
        if (prev === ".") continue;
        let j = idx + name.length;
        while (j < src.length && /\s/.test(src[j])) j += 1;
        if (src[j] === ":") continue;
        return name;
    }
    return "";
}

function collectJsCallCallees(raw) {
    const src = stripJsForLint(raw);
    const out = [];
    const re = /([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?)\s*\(/g;
    for (const m of src.matchAll(re)) {
        const callee = String(m[1] || "").trim();
        if (!callee) continue;
        const idx = Number(m.index) || 0;
        const head = src.slice(Math.max(0, idx - 32), idx).trimEnd();
        if (/\bfunction\s*$/.test(head)) continue;
        if (/\bnew\s*$/.test(head)) continue;
        out.push(callee);
    }
    return out;
}

function findFirstDisallowedFunctionCall(raw, allowedCalls = new Set(), localNames = new Set()) {
    const calls = collectJsCallCallees(raw);
    for (const callee of calls) {
        if (!callee) continue;
        if (callee.includes(".")) {
            if (/^Math\.[A-Za-z_$][A-Za-z0-9_$]*$/.test(callee)) continue;
            return callee;
        }
        if (JS_RESERVED_CALL_NAMES.has(callee)) continue;
        if (allowedCalls.has(callee)) continue;
        if (localNames.has(callee)) continue;
        return callee;
    }
    return "";
}

function resolveEmitterVarNames(raw) {
    if (Array.isArray(raw)) {
        const out = [];
        const seen = new Set();
        for (const it of raw) {
            const name = String(it || "").trim();
            if (!IDENT_RE.test(name)) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            out.push(name);
        }
        return out;
    }
    const vars = Array.isArray(raw?.emitterVars) ? raw.emitterVars : [];
    const out = [];
    const seen = new Set();
    for (const it of vars) {
        const name = String(it?.name || "").trim();
        if (!IDENT_RE.test(name)) continue;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(name);
    }
    return out;
}

function toFiniteNumber(v, fallback = 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    return Number(fallback) || 0;
}

export function normalizeDoTickExpression(raw) {
    return String(raw || "").replace(/\r\n/g, "\n").trim();
}

export function getDoTickAllowedIdentifiers(rawBehaviorOrVars) {
    const allowed = new Set();
    for (const key of DO_TICK_GLOBALS) allowed.add(key);
    for (const name of resolveEmitterVarNames(rawBehaviorOrVars)) allowed.add(name);
    return allowed;
}

export function validateDoTickExpressionSource(rawSource, rawBehaviorOrVars) {
    const source = normalizeDoTickExpression(rawSource);
    if (!source) return { valid: true, message: "" };

    try {
        new Function("scope", `with (scope) {\n${source}\n}`);
    } catch (e) {
        return { valid: false, message: `语法错误: ${String(e?.message || e || "invalid script")}` };
    }

    const allowed = getDoTickAllowedIdentifiers(rawBehaviorOrVars);
    const unknown = findFirstUnknownJsIdentifier(source, allowed);
    if (unknown) {
        return { valid: false, message: `未定义标识符: ${unknown}` };
    }

    const localNames = collectJsDeclaredNames(source);
    const badCall = findFirstDisallowedFunctionCall(source, DO_TICK_API_CALLS, localNames);
    if (badCall) {
        return { valid: false, message: `不允许调用该函数: ${badCall}` };
    }

    return { valid: true, message: "" };
}

export function compileDoTickExpressionSource(rawSource, rawBehaviorOrVars) {
    const source = normalizeDoTickExpression(rawSource);
    const check = validateDoTickExpressionSource(source, rawBehaviorOrVars);
    if (!check.valid) {
        return {
            ok: false,
            source,
            fn: null,
            message: String(check.message || "doTick compile failed"),
        };
    }
    if (!source) {
        return {
            ok: true,
            source: "",
            fn: null,
            message: "",
        };
    }
    try {
        const fn = new Function("scope", `with (scope) {\n${source}\n}`);
        return {
            ok: true,
            source,
            fn,
            message: "",
        };
    } catch (e) {
        return {
            ok: false,
            source,
            fn: null,
            message: `编译失败: ${String(e?.message || e || "compile failed")}`,
        };
    }
}

export function createDoTickRuntimeScope(varsStore, tickValue = 0) {
    const vars = (varsStore && typeof varsStore === "object") ? varsStore : {};
    const scope = Object.create(null);

    const readVar = (name, fallback = 0) => {
        const key = String(name || "").trim();
        if (!IDENT_RE.test(key)) return toFiniteNumber(fallback, 0);
        if (!Object.prototype.hasOwnProperty.call(vars, key)) return toFiniteNumber(fallback, 0);
        return toFiniteNumber(vars[key], fallback);
    };

    const writeVar = (name, value) => {
        const key = String(name || "").trim();
        if (!IDENT_RE.test(key)) return 0;
        if (!Object.prototype.hasOwnProperty.call(vars, key)) return 0;
        const next = toFiniteNumber(value, 0);
        vars[key] = next;
        return next;
    };

    const randomFloat = (min = 0, max = 1) => {
        const a = toFiniteNumber(min, 0);
        const b = toFiniteNumber(max, 1);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return Math.random() * (hi - lo) + lo;
    };

    const randomInt = (min = 0, max = 1) => {
        const lo = Math.trunc(Math.min(toFiniteNumber(min, 0), toFiniteNumber(max, 1)));
        const hi = Math.trunc(Math.max(toFiniteNumber(min, 0), toFiniteNumber(max, 1)));
        if (hi <= lo) return lo;
        return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    };

    const clampNumber = (value, min, max) => {
        const n = toFiniteNumber(value, 0);
        const lo = toFiniteNumber(min, n);
        const hi = toFiniteNumber(max, n);
        if (hi < lo) return Math.min(Math.max(n, hi), lo);
        return Math.min(Math.max(n, lo), hi);
    };

    Object.assign(scope, {
        Math,
        PI: Math.PI,
        tick: toFiniteNumber(tickValue, 0),

        setVar: (name, value) => writeVar(name, value),
        getVar: (name, fallback = 0) => readVar(name, fallback),
        hasVar: (name) => {
            const key = String(name || "").trim();
            return IDENT_RE.test(key) && Object.prototype.hasOwnProperty.call(vars, key);
        },

        addVar: (name, value) => writeVar(name, readVar(name, 0) + toFiniteNumber(value, 0)),
        subVar: (name, value) => writeVar(name, readVar(name, 0) - toFiniteNumber(value, 0)),
        mulVar: (name, value) => writeVar(name, readVar(name, 0) * toFiniteNumber(value, 0)),
        divVar: (name, value) => {
            const rhs = toFiniteNumber(value, 0);
            if (Math.abs(rhs) < 1e-12) return readVar(name, 0);
            return writeVar(name, readVar(name, 0) / rhs);
        },
        incVar: (name) => writeVar(name, readVar(name, 0) + 1),
        decVar: (name) => writeVar(name, readVar(name, 0) - 1),
        clampVar: (name, min, max) => writeVar(name, clampNumber(readVar(name, 0), min, max)),

        rand: (min, max) => {
            if (max === undefined) return randomFloat(0, min);
            return randomFloat(min, max);
        },
        randInt: (min, max) => {
            if (max === undefined) return randomInt(0, min);
            return randomInt(min, max);
        },

        clamp: clampNumber,
        min: Math.min,
        max: Math.max,
        abs: Math.abs,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        trunc: Math.trunc,
        pow: Math.pow,
        sqrt: Math.sqrt,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        log: Math.log,
        exp: Math.exp,
        sign: Math.sign,
    });

    for (const key of Object.keys(vars)) {
        if (!IDENT_RE.test(key)) continue;
        if (Object.prototype.hasOwnProperty.call(scope, key)) continue;
        Object.defineProperty(scope, key, {
            enumerable: true,
            configurable: true,
            get() {
                return readVar(key, 0);
            },
            set(value) {
                writeVar(key, value);
            },
        });
    }

    return scope;
}

export function buildDoTickCompletions(rawBehaviorOrVars) {
    const varNames = resolveEmitterVarNames(rawBehaviorOrVars);
    const base = [
        { label: "if (...) { ... }", insertText: "if ($0) {\n    \n}", detail: "条件分支", priority: 240 },
        { label: "setVar(name, value)", insertText: "setVar(\"$0\", 0)", detail: "设置变量", priority: 260 },
        { label: "addVar(name, value)", insertText: "addVar(\"$0\", 1)", detail: "变量加法", priority: 255 },
        { label: "subVar(name, value)", insertText: "subVar(\"$0\", 1)", detail: "变量减法", priority: 255 },
        { label: "mulVar(name, value)", insertText: "mulVar(\"$0\", 1)", detail: "变量乘法", priority: 250 },
        { label: "divVar(name, value)", insertText: "divVar(\"$0\", 1)", detail: "变量除法", priority: 250 },
        { label: "incVar(name)", insertText: "incVar(\"$0\")", detail: "变量自增", priority: 245 },
        { label: "decVar(name)", insertText: "decVar(\"$0\")", detail: "变量自减", priority: 245 },
        { label: "clampVar(name, min, max)", insertText: "clampVar(\"$0\", 0, 1)", detail: "变量限幅", priority: 235 },
        { label: "getVar(name, fallback)", insertText: "getVar(\"$0\", 0)", detail: "读取变量", priority: 225 },
        { label: "rand(min, max)", insertText: "rand($0, 1)", detail: "随机浮点", priority: 220 },
        { label: "randInt(min, max)", insertText: "randInt($0, 10)", detail: "随机整数", priority: 220 },
        { label: "tick", detail: "当前 tick", priority: 260 },
        { label: "PI", detail: "圆周率", priority: 220 },
        { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 200 },
        { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 200 },
        { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 200 },
        { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 190 },
        { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 190 },
        { label: "const value = 0", insertText: "const $0 = 0", detail: "常量", priority: 170 },
        { label: "let value = 0", insertText: "let $0 = 0", detail: "变量", priority: 170 },
        { label: "function helper() { }", insertText: "function $0() {\\n    \\n}", detail: "函数", priority: 160 },
    ];

    for (const name of varNames) {
        base.push({ label: name, insertText: name, detail: "发射器变量", priority: 280 });
        base.push({ label: `setVar(\"${name}\", value)`, insertText: `setVar(\"${name}\", $0)`, detail: "设置变量", priority: 275 });
        base.push({ label: `addVar(\"${name}\", value)`, insertText: `addVar(\"${name}\", $0)`, detail: "变量加法", priority: 270 });
    }

    return base;
}

function replaceTernaryInline(line) {
    const src = String(line || "");
    const protectedLine = src.replace(/\?\s*([^:]+)\s*:\s*(.+)$/g, (m, a, b) => `? ${String(a || "").trim()} : ${String(b || "").trim()}`);
    const ternary = protectedLine.match(/^(.*?)([A-Za-z0-9_.)\]]+)\s*\?\s*([^:]+)\s*:\s*(.+)$/);
    if (!ternary) return protectedLine;
    const left = ternary[1] || "";
    const cond = ternary[2] || "true";
    const yes = ternary[3] || "0";
    const no = ternary[4] || "0";
    return `${left}if (${String(cond).trim()}) ${String(yes).trim()} else ${String(no).trim()}`;
}

function translateFunctionKeyword(line) {
    let out = String(line || "");
    out = out.replace(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g, "fun $1(");
    out = out.replace(/\bfunction\s*\(/g, "fun(");
    return out;
}

function splitKotlinLikeStatements(rawText) {
    const text = String(rawText || "");
    const out = [];
    let buf = "";
    let quote = "";
    let escaped = false;

    const flush = () => {
        const line = String(buf || "").trim();
        if (line) out.push(line);
        buf = "";
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            buf += ch;
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === quote) quote = "";
            continue;
        }

        if (ch === "\"" || ch === "'" || ch === "`") {
            quote = ch;
            buf += ch;
            continue;
        }

        if (ch === "{") {
            buf += ch;
            flush();
            continue;
        }
        if (ch === "}") {
            flush();
            out.push("}");
            continue;
        }
        if (ch === ";" || ch === "\n") {
            flush();
            continue;
        }
        buf += ch;
    }
    flush();
    return out;
}

function normalizeKotlinLikeSpacing(line) {
    let out = String(line || "").trim();
    if (!out) return out;
    out = out.replaceAll("===", "==").replaceAll("!==", "!=");
    out = out.replace(/\b(if|for|while|when|catch)\(/g, "$1 (");
    out = out.replace(/\)\s*\{/g, ") {");
    out = out.replace(/\}\s*else\b/g, "} else");
    out = out.replace(/,\s*/g, ", ");
    out = out.replace(/\bfun\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g, "fun $1(");
    out = out.replace(/\s+$/g, "");
    return out;
}

export function translateDoTickJsToKotlin(rawScript, indent = "    ") {
    const source = normalizeDoTickExpression(rawScript);
    if (!source) return `${indent}// no-op`;

    const transformed = source
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => String(line).trimEnd())
        .map((line) => line.replace(/;+\s*$/g, ""))
        .map((line) => line.replace(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "val $1"))
        .map((line) => line.replace(/\blet\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "var $1"))
        .map((line) => line.replace(/\bvar\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, "var $1"))
        .map((line) => translateFunctionKeyword(line))
        .map((line) => replaceTernaryInline(line))
        .join("\n");

    const statements = splitKotlinLikeStatements(transformed);
    if (!statements.length) return `${indent}// no-op`;

    const out = [];
    let depth = 0;
    for (const rawLine of statements) {
        const line = normalizeKotlinLikeSpacing(rawLine);
        if (!line) continue;
        if (line.startsWith("}")) depth = Math.max(0, depth - 1);
        if (
            (line.startsWith("else ") || line === "else" || line.startsWith("else if"))
            && out.length
            && String(out[out.length - 1] || "").trim() === "}"
        ) {
            out[out.length - 1] = `${out[out.length - 1]} ${line}`;
            if (line.endsWith("{")) depth += 1;
            continue;
        }
        out.push(`${indent}${"    ".repeat(depth)}${line}`);
        if (line.endsWith("{")) depth += 1;
    }

    return out.join("\n");
}
