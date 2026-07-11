import { escapeHtml } from "./utils.js";

const GLSL_KEYWORDS = new Set([
    "attribute", "const", "uniform", "varying", "in", "out", "inout", "break", "continue", "do", "for", "while", "if", "else",
    "true", "false", "lowp", "mediump", "highp", "precision", "invariant", "discard", "return", "struct"
]);

const GLSL_TYPES = new Set([
    "void", "bool", "int", "uint", "float", "double", "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4", "bvec2", "bvec3", "bvec4",
    "mat2", "mat3", "mat4", "sampler2D", "samplerCube"
]);

const GLSL_BUILTINS = new Set([
    "gl_Position", "gl_FragColor", "gl_FragCoord", "gl_PointSize", "gl_PointCoord",
    "gl_FrontFacing", "gl_VertexID", "gl_InstanceID", "gl_FragDepth", "gl_FragData",
    "position", "normal", "uv", "modelMatrix", "viewMatrix", "projectionMatrix", "modelViewMatrix", "normalMatrix",
    "radians", "degrees", "sin", "cos", "tan", "asin", "acos", "atan",
    "sinh", "cosh", "tanh", "pow", "exp", "log", "exp2", "log2", "sqrt", "inversesqrt",
    "abs", "sign", "floor", "ceil", "trunc", "round", "fract", "mod", "min", "max", "clamp",
    "mix", "step", "smoothstep",
    "length", "distance", "dot", "cross", "normalize", "faceforward", "reflect", "refract",
    "matrixCompMult", "outerProduct", "transpose", "determinant", "inverse",
    "lessThan", "lessThanEqual", "greaterThan", "greaterThanEqual", "equal", "notEqual", "any", "all", "not",
    "dFdx", "dFdy", "fwidth",
    "texture", "texture2D", "textureCube", "textureProj", "textureLod", "textureGrad", "texelFetch",
    "textureSize", "textureOffset", "textureLodOffset", "textureGradOffset", "texelFetchOffset",
    "modf", "isnan", "isinf", "floatBitsToInt", "floatBitsToUint", "intBitsToFloat", "uintBitsToFloat"
]);
const COMMON_UNIFORM_NAMES = new Set([
    "uTime", "tickDelta", "partialTicks", "uResolution", "uMouse"
]);

const TOKEN_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|#[^\n]*|\b\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const EDITOR_REGISTRY = new Set();
let portalHost = null;
const CONTROL_FLOW_NAMES = new Set(["if", "for", "while", "switch", "else", "do"]);
const GLSL_DECL_QUALIFIERS = new Set([
    "const", "in", "out", "inout", "uniform", "varying", "attribute",
    "highp", "mediump", "lowp", "flat", "smooth", "noperspective", "centroid",
    "readonly", "writeonly", "coherent", "volatile", "restrict", "precise", "layout"
]);

function classifyToken(token) {
    if (!token) return "tok-id";
    if (token.startsWith("//") || token.startsWith("/*")) return "tok-comment";
    if (token.startsWith("#")) return "tok-pre";
    if (token.startsWith("\"") || token.startsWith("'")) return "tok-string";
    if (/^\d/.test(token)) return "tok-num";
    if (GLSL_TYPES.has(token)) return "tok-type";
    if (GLSL_KEYWORDS.has(token)) return "tok-key";
    if (GLSL_BUILTINS.has(token) || token.startsWith("gl_")) return "tok-builtin";
    return "tok-id";
}

function isIdentifierToken(token) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(token || ""));
}

function collectForLoopInitDeclarations(cleanText) {
    const out = [];
    for (const match of String(cleanText || "").matchAll(/\bfor\s*\(([^;{}]*)\s*;[^)]*\)/g)) {
        const init = String(match[1] || "").trim();
        if (!init) continue;
        const vars = parseVariableNamesFromStatement(`${init};`);
        const start = Number(match.index || 0);
        for (const name of vars) {
            out.push({ name, start });
        }
    }
    return out;
}

function getBraceDepthAt(cleanText, index) {
    const text = String(cleanText || "");
    const end = Math.max(0, Math.min(Number(index) || 0, text.length));
    let depth = 0;
    for (let i = 0; i < end; i += 1) {
        const ch = text[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth = Math.max(0, depth - 1);
    }
    return depth;
}

function collectKnownIdentifiers(source) {
    const text = String(source || "");
    const clean = stripCommentStringLike(text);
    const known = new Set([
        ...GLSL_KEYWORDS,
        ...GLSL_TYPES,
        ...GLSL_BUILTINS,
        ...COMMON_UNIFORM_NAMES,
        "main"
    ]);

    const functionScopes = [];
    const braceStack = [];
    let braceDepth = 0;
    for (let i = 0; i < clean.length; i += 1) {
        const ch = clean[i];
        if (ch === "{") {
            const head = parseFunctionHeaderBefore(clean, i);
            const entry = {
                start: i,
                end: clean.length,
                depthBefore: braceDepth,
                isFunction: !!head,
                name: head?.name || "",
                params: head?.params || []
            };
            braceStack.push(entry);
            if (entry.isFunction) {
                functionScopes.push(entry);
                if (entry.name) known.add(entry.name);
                for (const p of entry.params || []) known.add(p);
            }
            braceDepth += 1;
        } else if (ch === "}") {
            braceDepth = Math.max(0, braceDepth - 1);
            const entry = braceStack.pop();
            if (entry?.isFunction) entry.end = i;
        }
    }

    let stmtStart = 0;
    let parenDepth = 0;
    for (let i = 0; i < clean.length; i += 1) {
        const ch = clean[i];
        if (ch === "(") parenDepth += 1;
        else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
        else if (ch === ";" && parenDepth === 0) {
            const stmt = clean.slice(stmtStart, i + 1);
            const vars = parseVariableNamesFromStatement(stmt);
            for (const name of vars) known.add(name);
            const fn = parseFunctionPrototypeFromStatement(stmt);
            if (fn?.name) {
                known.add(fn.name);
                for (const p of fn.params || []) known.add(p);
            }
            stmtStart = i + 1;
        }
    }

    for (const decl of collectForLoopInitDeclarations(clean)) {
        if (decl?.name) known.add(decl.name);
    }

    return known;
}

function isUnknownIdentifierToken(token, index, text, knownSet) {
    const id = String(token || "");
    if (!isIdentifierToken(id)) return false;
    if (knownSet?.has(id)) return false;
    if (GLSL_KEYWORDS.has(id) || GLSL_TYPES.has(id) || GLSL_BUILTINS.has(id)) return false;
    if (id.startsWith("gl_")) return false;

    let prev = index - 1;
    while (prev >= 0 && /\s/.test(text[prev])) prev -= 1;
    if (prev >= 0 && text[prev] === ".") return false;
    if (/^[xyzwrgba]{1,4}$/.test(id)) return false;
    if (isDeclarationContext(text, index)) return false;
    if (isInsideLayoutQualifier(text, index)) return false;
    if (nextNonWhitespaceChar(text, index + id.length) === "(") return false;
    if (isInPreprocessorLine(text, index)) return false;

    return true;
}

function nextNonWhitespaceChar(text, from) {
    const s = String(text || "");
    let i = Math.max(0, Number(from) || 0);
    while (i < s.length && /\s/.test(s[i])) i += 1;
    return s[i] || "";
}

function previousIdentifierBefore(text, index) {
    const s = String(text || "");
    let i = Math.max(0, Number(index) || 0) - 1;
    while (i >= 0 && /\s/.test(s[i])) i -= 1;
    if (i < 0) return "";
    let end = i + 1;
    while (i >= 0 && /[A-Za-z0-9_]/.test(s[i])) i -= 1;
    const start = i + 1;
    const id = s.slice(start, end);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) ? id : "";
}

function isDeclarationContext(text, index) {
    const prevId = previousIdentifierBefore(text, index);
    if (!prevId) return false;
    return GLSL_TYPES.has(prevId) || GLSL_DECL_QUALIFIERS.has(prevId) || prevId === "struct";
}

function isInPreprocessorLine(text, index) {
    const s = String(text || "");
    const i = Math.max(0, Number(index) || 0);
    const lineStart = Math.max(0, s.lastIndexOf("\n", i - 1) + 1);
    const head = s.slice(lineStart, i).trimStart();
    return head.startsWith("#");
}

function isInsideLayoutQualifier(text, index) {
    const s = String(text || "");
    const at = Math.max(0, Math.min(Number(index) || 0, s.length));
    const before = s.slice(0, at);
    const layoutIdx = before.lastIndexOf("layout");
    if (layoutIdx < 0) return false;

    const scopeStart = Math.max(
        before.lastIndexOf(";"),
        before.lastIndexOf("{"),
        before.lastIndexOf("}"),
        before.lastIndexOf("\n")
    );
    if (layoutIdx < scopeStart) return false;

    const openIdx = s.indexOf("(", layoutIdx + "layout".length);
    if (openIdx < 0 || openIdx >= at) return false;

    let depth = 0;
    for (let i = openIdx; i < at; i += 1) {
        const ch = s[i];
        if (ch === "(") depth += 1;
        else if (ch === ")" && depth > 0) depth -= 1;
    }
    return depth > 0;
}

function highlightGLSLRange(source, start = 0, end = undefined, knownSet = null) {
    const text = String(source || "");
    const from = Math.max(0, Math.min(Number(start) || 0, text.length));
    const to = Math.max(from, Math.min(end === undefined ? text.length : (Number(end) || 0), text.length));
    const known = knownSet || collectKnownIdentifiers(text);
    const segment = text.slice(from, to);
    let out = "";
    let last = 0;

    for (const match of segment.matchAll(TOKEN_RE)) {
        const token = match[0] || "";
        const idx = match.index || 0;
        const fullIdx = from + idx;
        let cls = classifyToken(token);
        if (cls === "tok-id" && isUnknownIdentifierToken(token, fullIdx, text, known)) {
            cls = "tok-unknown";
        }
        out += escapeHtml(segment.slice(last, idx));
        out += `<span class="${cls}">${escapeHtml(token)}</span>`;
        last = idx + token.length;
    }

    out += escapeHtml(segment.slice(last));
    return out;
}

function highlightGLSL(source) {
    const text = String(source || "");
    let out = highlightGLSLRange(text);

    // Ensure the last empty line has height.
    if (text.endsWith("\n")) out += "\n";
    return out;
}

function highlightGLSLWithEditorState(source, selectionStart = 0, selectionEnd = 0, focused = false) {
    const text = String(source || "");
    const knownSet = collectKnownIdentifiers(text);
    const rawStart = Math.max(0, Math.min(Number(selectionStart) || 0, text.length));
    const rawEnd = Math.max(0, Math.min(Number(selectionEnd) || 0, text.length));
    const start = Math.min(rawStart, rawEnd);
    const end = Math.max(rawStart, rawEnd);
    let out = "";

    if (!focused) {
        out = highlightGLSLRange(text, 0, text.length, knownSet);
    } else if (start === end) {
        out += highlightGLSLRange(text, 0, start, knownSet);
        out += `<span class="editor-caret-proxy" aria-hidden="true"></span>`;
        out += highlightGLSLRange(text, start, text.length, knownSet);
    } else {
        out += highlightGLSLRange(text, 0, start, knownSet);
        out += `<span class="editor-selection-proxy">`;
        out += highlightGLSLRange(text, start, end, knownSet);
        out += `</span>`;
        out += highlightGLSLRange(text, end, text.length, knownSet);
    }

    if (text.endsWith("\n")) out += "\n";
    return out;
}

function toCompletionObjects(items) {
    const arr = Array.isArray(items) ? items : [];
    return arr
        .map((it) => {
            if (!it) return null;
            if (typeof it === "string") {
                return { label: it, insertText: it, detail: "", priority: 100 };
            }
            const label = String(it.label || "").trim();
            if (!label) return null;
            const p = Number(it.priority);
            return {
                label,
                insertText: String(it.insertText || label),
                detail: String(it.detail || ""),
                priority: Number.isFinite(p) ? p : 100
            };
        })
        .filter(Boolean);
}

function dedupeCompletions(items) {
    const map = new Map();
    for (const item of items) {
        if (!item || !item.label) continue;
        const key = String(item.label);
        const prev = map.get(key);
        if (!prev) {
            map.set(key, item);
            continue;
        }
        const prevP = Number(prev.priority) || 0;
        const nextP = Number(item.priority) || 0;
        if (nextP > prevP) map.set(key, item);
    }
    return Array.from(map.values());
}

export const BASE_GLSL_COMPLETIONS = dedupeCompletions(toCompletionObjects([
    { label: "#version 300 es", insertText: "#version 300 es\n", detail: "GLSL ES 3.00 target", priority: 100 },
    { label: "precision highp float;", insertText: "precision highp float;\n", detail: "Precision declaration", priority: 100 },
    { label: "precision highp int;", insertText: "precision highp int;\n", detail: "Precision declaration", priority: 100 },
    { label: "uniform float uTime;", insertText: "uniform float uTime;\n", detail: "Time uniform", priority: 100 },
    { label: "uniform vec3 CameraPos;", insertText: "uniform vec3 CameraPos;\n", detail: "Camera position uniform", priority: 100 },
    { label: "uniform vec3 uColor;", insertText: "uniform vec3 uColor;\n", detail: "Color uniform", priority: 100 },
    { label: "uniform sampler2D uTexture0;", insertText: "uniform sampler2D uTexture0;\n", detail: "Texture uniform", priority: 100 },
    { label: "uTime", insertText: "uTime", detail: "Common uniform symbol", priority: 210 },
    { label: "CameraPos", insertText: "CameraPos", detail: "Common uniform symbol", priority: 210 },
    { label: "tickDelta", insertText: "tickDelta", detail: "Common uniform symbol", priority: 210 },
    { label: "partialTicks", insertText: "partialTicks", detail: "Common uniform symbol", priority: 210 },
    { label: "uResolution", insertText: "uResolution", detail: "Common uniform symbol", priority: 210 },
    { label: "uMouse", insertText: "uMouse", detail: "Common uniform symbol", priority: 210 },
    { label: "out vec2 vUv;", insertText: "out vec2 vUv;\n", detail: "Vertex->fragment varying", priority: 100 },
    { label: "in vec2 vUv;", insertText: "in vec2 vUv;\n", detail: "Fragment input varying", priority: 100 },
    { label: "out vec3 vNormal;", insertText: "out vec3 vNormal;\n", detail: "Vertex->fragment varying", priority: 100 },
    { label: "in vec3 vNormal;", insertText: "in vec3 vNormal;\n", detail: "Fragment input varying", priority: 100 },
    { label: "out vec4 FragColor;", insertText: "out vec4 FragColor;\n", detail: "Fragment output", priority: 100 },
    { label: "gl_Position", insertText: "gl_Position", detail: "Built-in vertex output", priority: 100 },
    { label: "gl_FragColor", insertText: "gl_FragColor", detail: "Legacy fragment output", priority: 60 },
    { label: "texture", insertText: "texture", detail: "Texture sampling", priority: 100 },
    { label: "texture2D", insertText: "texture2D", detail: "Legacy texture sampling", priority: 60 },
    { label: "normalize", insertText: "normalize", detail: "Vector normalize", priority: 100 },
    { label: "mix", insertText: "mix", detail: "Linear interpolation", priority: 100 },
    { label: "dot", insertText: "dot", detail: "Dot product", priority: 100 },
    { label: "sin", insertText: "sin", detail: "Trigonometric", priority: 100 },
    { label: "mat4", insertText: "mat4", detail: "Matrix type", priority: 100 },
    { label: "vec2", insertText: "vec2", detail: "Vector type", priority: 100 },
    { label: "vec3", insertText: "vec3", detail: "Vector type", priority: 100 },
    { label: "vec4", insertText: "vec4", detail: "Vector type", priority: 100 }
]));

export function buildUniformCompletions(params) {
    const out = [];
    const list = Array.isArray(params) ? params : [];

    const mapType = (raw) => {
        const t = String(raw || "float").toLowerCase();
        if (t === "int") return "int";
        if (t === "bool") return "bool";
        if (t === "vec2") return "vec2";
        if (t === "vec3") return "vec3";
        if (t === "texture") return "sampler2D";
        return "float";
    };

    for (const param of list) {
        const name = String(param?.name || "").trim();
        if (!name) continue;
        const type = mapType(param?.type);
        out.push({
            label: `uniform ${type} ${name};`,
            insertText: `uniform ${type} ${name};\n`,
            detail: "全局变量声明",
            priority: 210
        });
        out.push({
            label: name,
            insertText: name,
            detail: `全局变量 (${type})`,
            priority: 240
        });
    }

    return dedupeCompletions(out);
}

function defaultTokenRange(text, caret) {
    let start = caret;
    while (start > 0 && /[A-Za-z0-9_#]/.test(text[start - 1])) start -= 1;
    let end = caret;
    while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
    return { start, end, token: text.slice(start, caret) };
}

function isCaretInCommentContext(source, caret) {
    const text = String(source || "");
    const end = Math.max(0, Math.min(Number(caret) || 0, text.length));

    let mode = "code";
    let quote = "";

    for (let i = 0; i < end; i += 1) {
        const ch = text[i];
        const next = text[i + 1] || "";

        if (mode === "line-comment") {
            if (ch === "\n") mode = "code";
            continue;
        }
        if (mode === "block-comment") {
            if (ch === "*" && next === "/") {
                mode = "code";
                i += 1;
            }
            continue;
        }
        if (mode === "string") {
            if (ch === "\\") {
                i += 1;
                continue;
            }
            if (ch === quote) {
                mode = "code";
                quote = "";
            }
            continue;
        }

        if (ch === "\"" || ch === "'") {
            mode = "string";
            quote = ch;
            continue;
        }
        if (ch === "/" && next === "/") {
            mode = "line-comment";
            i += 1;
            continue;
        }
        if (ch === "/" && next === "*") {
            mode = "block-comment";
            i += 1;
        }
    }

    return mode === "line-comment" || mode === "block-comment";
}

function ensurePortalHost() {
    if (portalHost) return portalHost;
    const host = document.createElement("div");
    host.className = "editor-portal-host";
    document.body.appendChild(host);
    portalHost = host;
    return host;
}

function updatePortalActiveState() {
    if (!portalHost) return;
    const anyMax = Array.from(EDITOR_REGISTRY).some((it) => it.maximized);
    portalHost.classList.toggle("active", anyMax);
}

function splitSuggestionLabel(label, token) {
    const full = String(label || "");
    const key = String(token || "");
    if (!key) {
        return {
            before: "",
            match: "",
            after: full
        };
    }

    const lf = full.toLowerCase();
    const lk = key.toLowerCase();
    const idx = lf.indexOf(lk);
    if (idx < 0) {
        return {
            before: "",
            match: "",
            after: full
        };
    }

    return {
        before: full.slice(0, idx),
        match: full.slice(idx, idx + key.length),
        after: full.slice(idx + key.length)
    };
}

function fuzzyMatchScore(label, keyword) {
    const s = String(label || "").toLowerCase();
    const k = String(keyword || "").toLowerCase();
    if (!k) return { ok: true, score: 0, startsWith: 0, index: 0 };

    const direct = s.indexOf(k);
    if (direct >= 0) {
        const startsWith = direct === 0 ? 1 : 0;
        const score = 1200 - direct * 12 - (s.length - k.length);
        return { ok: true, score, startsWith, index: direct };
    }

    let si = 0;
    let lastPos = -1;
    let gaps = 0;
    for (let ki = 0; ki < k.length; ki += 1) {
        const ch = k[ki];
        const pos = s.indexOf(ch, si);
        if (pos < 0) return { ok: false, score: -1, startsWith: 0, index: 9999 };
        if (lastPos >= 0) gaps += Math.max(0, pos - lastPos - 1);
        lastPos = pos;
        si = pos + 1;
    }

    const startsWith = s.startsWith(k[0] || "") ? 1 : 0;
    const score = 700 - gaps * 8 - (s.length - k.length);
    return { ok: true, score, startsWith, index: lastPos >= 0 ? lastPos : 9999 };
}

function measureCaretViewportPosition(textarea) {
    const start = textarea.selectionStart || 0;
    const value = textarea.value || "";
    const textBefore = value.slice(0, start);
    const style = window.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();

    const mirror = document.createElement("div");
    mirror.style.position = "fixed";
    mirror.style.left = `${rect.left}px`;
    mirror.style.top = `${rect.top}px`;
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.height = `${textarea.clientHeight}px`;
    mirror.style.overflow = "auto";
    mirror.style.whiteSpace = "pre";
    mirror.style.wordWrap = "normal";
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.boxSizing = style.boxSizing;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.font = style.font;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.textTransform = style.textTransform;
    mirror.style.tabSize = style.tabSize;

    const textNode = document.createTextNode(textBefore);
    const marker = document.createElement("span");
    marker.textContent = "|";

    mirror.appendChild(textNode);
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;

    const mr = marker.getBoundingClientRect();
    const out = {
        x: mr.left,
        y: mr.top,
        h: mr.height || Number.parseFloat(style.lineHeight || "16") || 16
    };

    mirror.remove();
    return out;
}

function stripCommentStringLike(source) {
    const text = String(source || "");
    const chars = Array.from(text);
    for (const match of text.matchAll(TOKEN_RE)) {
        const token = match[0] || "";
        const idx = match.index || 0;
        if (!token) continue;
        if (!(token.startsWith("//") || token.startsWith("/*") || token.startsWith("#") || token.startsWith("\"") || token.startsWith("'"))) {
            continue;
        }
        for (let i = idx; i < idx + token.length && i < chars.length; i += 1) {
            chars[i] = " ";
        }
    }
    return chars.join("");
}

function splitTopLevel(text, delimiter = ",") {
    const out = [];
    let start = 0;
    let p = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === "(") p += 1;
        else if (ch === ")" && p > 0) p -= 1;
        else if (ch === "[") b += 1;
        else if (ch === "]" && b > 0) b -= 1;
        else if (ch === "{") c += 1;
        else if (ch === "}" && c > 0) c -= 1;
        else if (ch === delimiter && p === 0 && b === 0 && c === 0) {
            out.push(text.slice(start, i));
            start = i + 1;
        }
    }
    out.push(text.slice(start));
    return out;
}

function leftSideOfAssignment(text) {
    const s = String(text || "");
    let p = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === "(") p += 1;
        else if (ch === ")" && p > 0) p -= 1;
        else if (ch === "[") b += 1;
        else if (ch === "]" && b > 0) b -= 1;
        else if (ch === "{") c += 1;
        else if (ch === "}" && c > 0) c -= 1;
        else if (ch === "=" && p === 0 && b === 0 && c === 0) {
            return s.slice(0, i);
        }
    }
    return s;
}

function parseParamNames(paramText) {
    const out = [];
    const parts = splitTopLevel(String(paramText || ""), ",");
    for (const raw of parts) {
        const part = String(raw || "").trim();
        if (!part || part === "void") continue;
        const cleaned = part
            .replace(/\b(in|out|inout|const|highp|mediump|lowp|flat|smooth|noperspective|centroid|precise)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!cleaned) continue;
        const m = /([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?\s*$/.exec(cleaned);
        if (!m) continue;
        out.push(m[1]);
    }
    return out;
}

function parseFunctionHeaderBefore(cleanText, braceIndex) {
    const start = Math.max(0, braceIndex - 240);
    const prefix = cleanText.slice(start, braceIndex);
    const m = /([A-Za-z_][A-Za-z0-9_]*)\s*\(([^(){};]*)\)\s*$/.exec(prefix);
    if (!m) return null;
    const name = m[1];
    if (!name || CONTROL_FLOW_NAMES.has(name)) return null;
    const before = prefix.slice(0, m.index || 0).trim();
    if (!before) return null;
    const tail = before.split(/\s+/).pop() || "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tail)) return null;
    return { name, params: parseParamNames(m[2] || "") };
}

function parseFunctionPrototypeFromStatement(statement) {
    const s = String(statement || "").replace(/;\s*$/, "").trim();
    if (!s || s.startsWith("#")) return null;
    if (s.includes("{") || s.includes("}") || s.includes("=")) return null;
    const m = /^(?:layout\s*\([^)]*\)\s*)?(?:(?:[A-Za-z_][A-Za-z0-9_]*)\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^(){};]*)\)$/.exec(s);
    if (!m) return null;
    const name = m[1];
    if (!name || CONTROL_FLOW_NAMES.has(name)) return null;
    return { name, params: parseParamNames(m[2] || "") };
}

function parseVariableNamesFromStatement(statement) {
    let s = String(statement || "").replace(/;\s*$/, "").trim();
    const braceAt = Math.max(s.lastIndexOf("{"), s.lastIndexOf("}"));
    if (braceAt >= 0) {
        s = s.slice(braceAt + 1).trim();
    }
    if (!s || s.startsWith("#")) return [];
    if (/^(return|break|continue|discard|precision)\b/.test(s)) return [];
    if (/^(for|if|while|switch)\b/.test(s)) return [];
    if (/^struct\b/.test(s)) return [];
    if (s.includes("->")) return [];

    const parts = splitTopLevel(s, ",").map((it) => String(it || "").trim()).filter(Boolean);
    if (!parts.length) return [];

    const firstLeft = leftSideOfAssignment(parts[0]).trim();
    if (!firstLeft) return [];
    const firstCandidate = firstLeft.replace(/^layout\s*\([^)]*\)\s*/, "").trim();
    if (!firstCandidate || firstCandidate.includes("(") || firstCandidate.includes(")")) return [];

    const firstDecl = /^(?:(?:[A-Za-z_][A-Za-z0-9_]*)\s+)+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?\s*$/.exec(firstCandidate);
    if (!firstDecl) return [];

    const out = [];
    const pushName = (name) => {
        const id = String(name || "").trim();
        if (!id) return;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return;
        if (GLSL_TYPES.has(id) || GLSL_KEYWORDS.has(id) || GLSL_DECL_QUALIFIERS.has(id)) return;
        out.push(id);
    };

    pushName(firstDecl[1]);

    for (let i = 1; i < parts.length; i += 1) {
        const left = leftSideOfAssignment(parts[i]).trim();
        if (!left) continue;
        if (left.includes("(") || left.includes(")")) continue;
        const idm = /([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?\s*$/.exec(left);
        if (!idm) continue;
        pushName(idm[1]);
    }

    return out;
}

function buildSemanticCompletions(source, caret) {
    const text = String(source || "");
    const index = Math.max(0, Math.min(Number(caret) || 0, text.length));
    const clean = stripCommentStringLike(text);
    const functionScopes = [];
    const braceStack = [];

    let braceDepth = 0;
    for (let i = 0; i < clean.length; i += 1) {
        const ch = clean[i];
        if (ch === "{") {
            const head = parseFunctionHeaderBefore(clean, i);
            const entry = {
                start: i,
                end: clean.length,
                depthBefore: braceDepth,
                isFunction: !!head,
                name: head?.name || "",
                params: head?.params || []
            };
            braceStack.push(entry);
            if (entry.isFunction) functionScopes.push(entry);
            braceDepth += 1;
        } else if (ch === "}") {
            braceDepth = Math.max(0, braceDepth - 1);
            const entry = braceStack.pop();
            if (entry?.isFunction) entry.end = i;
        }
    }

    const declarations = [];
    const prototypeFunctions = [];
    let stmtStart = 0;
    let parenDepth = 0;
    let currentDepth = 0;

    for (let i = 0; i < clean.length; i += 1) {
        const ch = clean[i];
        if (ch === "(") parenDepth += 1;
        else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
        else if (ch === "{") currentDepth += 1;
        else if (ch === "}") currentDepth = Math.max(0, currentDepth - 1);
        else if (ch === ";" && parenDepth === 0) {
            const stmt = clean.slice(stmtStart, i + 1);
            const vars = parseVariableNamesFromStatement(stmt);
            for (const name of vars) declarations.push({ name, start: stmtStart, depth: currentDepth });
            const fn = parseFunctionPrototypeFromStatement(stmt);
            if (fn) prototypeFunctions.push({ name: fn.name, params: fn.params, start: stmtStart, depth: currentDepth });
            stmtStart = i + 1;
        }
    }

    for (const decl of collectForLoopInitDeclarations(clean)) {
        if (!decl?.name) continue;
        declarations.push({
            name: decl.name,
            start: Number(decl.start || 0),
            depth: getBraceDepthAt(clean, Number(decl.start || 0))
        });
    }

    const currentFunction = functionScopes
        .filter((f) => f.start < index && index <= f.end)
        .sort((a, b) => a.start - b.start)
        .pop() || null;

    const out = [];
    const pushVar = (name, detail, priority) => {
        if (!name) return;
        out.push({ label: name, insertText: name, detail, priority });
    };
    const pushFn = (name, params, detail, priority) => {
        if (!name) return;
        const sig = Array.isArray(params) && params.length ? `${name}(${params.join(", ")})` : `${name}()`;
        out.push({ label: name, insertText: `${name}(`, detail: `${detail} ${sig}`, priority });
    };

    if (currentFunction) {
        for (const p of currentFunction.params || []) pushVar(p, "局部参数", 340);
    }

    for (const decl of declarations) {
        if (!decl?.name) continue;
        if (decl.start >= index) continue;
        if (currentFunction && decl.start > currentFunction.start && decl.start < currentFunction.end && decl.depth > currentFunction.depthBefore) {
            pushVar(decl.name, "局部变量", 320);
        } else if (decl.depth === 0) {
            pushVar(decl.name, "全局变量", 240);
        }
    }

    for (const fn of functionScopes) {
        if (!fn?.name) continue;
        if (fn.depthBefore !== 0) continue;
        if (fn.start >= index) continue;
        pushFn(fn.name, fn.params || [], "全局函数", 230);
    }

    for (const fn of prototypeFunctions) {
        if (!fn?.name) continue;
        if (fn.depth !== 0) continue;
        if (fn.start >= index) continue;
        pushFn(fn.name, fn.params || [], "全局函数", 228);
    }

    return dedupeCompletions(out);
}

export class ShaderCodeEditor {
    constructor(options = {}) {
        const {
            textarea,
            title = "Shader 编辑",
            onChange = () => {},
            completions = BASE_GLSL_COMPLETIONS,
            autoSuggestMin = 1
        } = options;

        if (!(textarea instanceof HTMLTextAreaElement)) {
            throw new Error("ShaderCodeEditor requires a textarea element");
        }

        this.textarea = textarea;
        this.title = title;
        this.onChange = onChange;
        this.autoSuggestMin = autoSuggestMin;
        this.completions = dedupeCompletions(toCompletionObjects(completions));
        this.filteredSuggest = [];
        this.suggestActive = -1;
        this.suggestRange = { start: 0, end: 0, token: "" };
        this.maximized = false;
        this.portalPlaceholder = null;
        this.portalParent = null;
        this.indentUnit = "    ";
        this.suggestSuspendUntil = 0;
        this.historyLimit = 240;
        this.localHistory = [];
        this.localHistoryIndex = -1;
        this.historyApplying = false;
        this.focused = false;

        this.buildDOM();
        this.bindEvents();
        this.renderHighlight();
        this.resetLocalHistory();
        EDITOR_REGISTRY.add(this);
    }

    buildDOM() {
        const field = this.textarea.closest(".field") || this.textarea.parentElement;

        this.shellEl = document.createElement("div");
        this.shellEl.className = "editor-shell";

        this.toolbarEl = document.createElement("div");
        this.toolbarEl.className = "editor-toolbar";

        const titleEl = document.createElement("div");
        titleEl.className = "editor-title";
        titleEl.textContent = this.title;

        const rightEl = document.createElement("div");
        rightEl.className = "editor-toolbar-right";

        const hintEl = document.createElement("div");
        hintEl.className = "editor-hint";
        hintEl.textContent = "Ctrl+/ 行注释 | Ctrl+Space 提示 | Ctrl+Shift+I 格式化";

        this.btnMaxEl = document.createElement("button");
        this.btnMaxEl.type = "button";
        this.btnMaxEl.className = "btn small";
        this.btnMaxEl.textContent = "放大";

        rightEl.appendChild(hintEl);
        rightEl.appendChild(this.btnMaxEl);

        this.toolbarEl.appendChild(titleEl);
        this.toolbarEl.appendChild(rightEl);

        this.bodyEl = document.createElement("div");
        this.bodyEl.className = "editor-body";

        this.highlightEl = document.createElement("pre");
        this.highlightEl.className = "editor-highlight";
        this.highlightEl.setAttribute("aria-hidden", "true");

        this.textarea.classList.add("editor-textarea");
        this.textarea.spellcheck = false;
        this.textarea.wrap = "off";

        this.suggestEl = document.createElement("div");
        this.suggestEl.className = "editor-suggest hidden";

        this.bodyEl.appendChild(this.highlightEl);
        this.bodyEl.appendChild(this.textarea);
        this.shellEl.appendChild(this.toolbarEl);
        this.shellEl.appendChild(this.bodyEl);
        this.shellEl.appendChild(this.suggestEl);

        if (field) {
            const labelSpan = field.querySelector(":scope > span");
            if (labelSpan) labelSpan.remove();
            field.classList.add("editor-field");
            field.appendChild(this.shellEl);
        }
    }

    bindEvents() {
        this.onInputHandler = () => {
            this.renderHighlight();
            this.syncScroll();
            this.onChange(this.textarea.value);
            if (!this.historyApplying) this.pushLocalHistorySnapshot();
            if (Date.now() < this.suggestSuspendUntil) {
                this.closeSuggest();
                return;
            }
            this.tryAutoSuggest();
        };

        this.onScrollHandler = () => {
            this.syncScroll();
        };

        this.onFocusHandler = () => {
            this.focused = true;
            this.renderHighlight();
            this.syncScroll();
        };

        this.onSelectionHandler = () => {
            if (document.activeElement !== this.textarea) return;
            this.focused = true;
            this.renderHighlight();
            this.syncScroll();
        };

        this.onKeydownHandler = (ev) => {
            const isMod = ev.ctrlKey || ev.metaKey;

            if (isMod && !ev.altKey && (ev.code === "KeyZ" || ev.code === "KeyY")) {
                const redo = ev.code === "KeyY" || (ev.code === "KeyZ" && ev.shiftKey);
                this.stepLocalHistory(redo ? 1 : -1);
                ev.preventDefault();
                ev.stopPropagation();
                this.suggestSuspendUntil = Date.now() + 360;
                this.closeSuggest();
                return;
            }

            if (isMod && !ev.altKey && ev.code === "KeyX" && (this.textarea.selectionStart === this.textarea.selectionEnd)) {
                ev.preventDefault();
                this.cutCurrentLine();
                return;
            }

            if (isMod && !ev.altKey && (ev.code === "Slash" || ev.code === "NumpadDivide")) {
                ev.preventDefault();
                this.toggleLineCommentAtSelection();
                return;
            }

            if (isMod && ev.shiftKey && ev.code === "KeyI") {
                ev.preventDefault();
                this.formatDocumentIndentation();
                return;
            }

            if (isMod && ev.code === "Space") {
                ev.preventDefault();
                this.openSuggest(true);
                return;
            }

            if (!isMod && !ev.altKey && ev.code === "Backspace" && this.textarea.selectionStart === this.textarea.selectionEnd) {
                if (this.backspaceOnIndentOnlyLine()) {
                    ev.preventDefault();
                    return;
                }
            }

            if (!isMod && !ev.altKey && ev.code === "Tab") {
                ev.preventDefault();
                if (!ev.shiftKey && this.jumpOutOfClosingDelimiter()) {
                    return;
                }
                this.insertIndentAtCaret(ev.shiftKey ? -1 : 1);
                return;
            }

            if (!isMod && !ev.altKey && ev.code === "Enter" && ev.shiftKey) {
                if (this.breakOutParenthesesLine()) {
                    ev.preventDefault();
                    return;
                }
            }

            if (!isMod && !ev.altKey && this.textarea.selectionStart === this.textarea.selectionEnd) {
                if (ev.key === "{") {
                    ev.preventDefault();
                    this.insertPair("{", "}");
                    return;
                }
                if (ev.key === "(") {
                    ev.preventDefault();
                    this.insertPair("(", ")");
                    return;
                }
            }

            if (!this.suggestEl.classList.contains("hidden")) {
                if (ev.code === "ArrowDown") {
                    ev.preventDefault();
                    this.moveSuggestActive(1);
                    return;
                }
                if (ev.code === "ArrowUp") {
                    ev.preventDefault();
                    this.moveSuggestActive(-1);
                    return;
                }
                if (ev.code === "Enter") {
                    ev.preventDefault();
                    this.commitActiveSuggest();
                    return;
                }
                if (ev.code === "Escape") {
                    ev.preventDefault();
                    this.closeSuggest();
                    return;
                }
            } else if (ev.code === "Enter") {
                ev.preventDefault();
                this.insertNewLineWithIndent();
                return;
            } else if (ev.code === "Escape" && this.maximized) {
                ev.preventDefault();
                this.toggleMaximize(false);
                return;
            }
        };

        this.onBlurHandler = () => {
            this.focused = false;
            this.renderHighlight();
            setTimeout(() => this.closeSuggest(), 120);
        };

        this.onClickSuggestHandler = (ev) => {
            const btn = ev.target instanceof HTMLElement ? ev.target.closest("button[data-idx]") : null;
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (!Number.isFinite(idx)) return;
            this.suggestActive = idx;
            this.commitActiveSuggest();
        };

        this.onBtnMaxHandler = () => {
            this.toggleMaximize(!this.maximized);
        };

        this.onBodyPointerDownHandler = (ev) => {
            if (ev.target === this.textarea) return;
            this.textarea.focus();
        };

        this.onBodyWheelHandler = (ev) => {
            if (!(ev instanceof WheelEvent)) return;
            const beforeTop = this.textarea.scrollTop;
            const beforeLeft = this.textarea.scrollLeft;

            if (Math.abs(ev.deltaY) > 0.01) this.textarea.scrollTop += ev.deltaY;
            if (Math.abs(ev.deltaX) > 0.01) this.textarea.scrollLeft += ev.deltaX;
            this.syncScroll();

            const changed = (this.textarea.scrollTop !== beforeTop) || (this.textarea.scrollLeft !== beforeLeft);
            if (changed) ev.preventDefault();
        };

        this.textarea.addEventListener("input", this.onInputHandler);
        this.textarea.addEventListener("scroll", this.onScrollHandler);
        this.textarea.addEventListener("focus", this.onFocusHandler);
        this.textarea.addEventListener("select", this.onSelectionHandler);
        this.textarea.addEventListener("keyup", this.onSelectionHandler);
        this.textarea.addEventListener("mouseup", this.onSelectionHandler);
        this.textarea.addEventListener("keydown", this.onKeydownHandler);
        this.textarea.addEventListener("blur", this.onBlurHandler);
        document.addEventListener("selectionchange", this.onSelectionHandler);
        this.suggestEl.addEventListener("mousedown", (ev) => ev.preventDefault());
        this.suggestEl.addEventListener("click", this.onClickSuggestHandler);
        this.btnMaxEl.addEventListener("click", this.onBtnMaxHandler);
        this.bodyEl.addEventListener("pointerdown", this.onBodyPointerDownHandler);
        this.bodyEl.addEventListener("wheel", this.onBodyWheelHandler, { passive: false });
    }

    dispose() {
        this.textarea.removeEventListener("input", this.onInputHandler);
        this.textarea.removeEventListener("scroll", this.onScrollHandler);
        this.textarea.removeEventListener("focus", this.onFocusHandler);
        this.textarea.removeEventListener("select", this.onSelectionHandler);
        this.textarea.removeEventListener("keyup", this.onSelectionHandler);
        this.textarea.removeEventListener("mouseup", this.onSelectionHandler);
        this.textarea.removeEventListener("keydown", this.onKeydownHandler);
        this.textarea.removeEventListener("blur", this.onBlurHandler);
        document.removeEventListener("selectionchange", this.onSelectionHandler);
        this.suggestEl.removeEventListener("click", this.onClickSuggestHandler);
        this.btnMaxEl.removeEventListener("click", this.onBtnMaxHandler);
        this.bodyEl.removeEventListener("pointerdown", this.onBodyPointerDownHandler);
        this.bodyEl.removeEventListener("wheel", this.onBodyWheelHandler);
        EDITOR_REGISTRY.delete(this);
        updatePortalActiveState();
    }

    setValue(value, opts = {}) {
        const next = String(value ?? "");
        if (this.textarea.value === next) return;
        this.textarea.value = next;
        this.renderHighlight();
        this.syncScroll();
        if (!opts.silent) this.onChange(this.textarea.value);
        this.resetLocalHistory();
    }

    getValue() {
        return this.textarea.value;
    }

    createLocalHistorySnapshot() {
        return {
            value: String(this.textarea.value || ""),
            start: Number(this.textarea.selectionStart || 0),
            end: Number(this.textarea.selectionEnd || 0)
        };
    }

    sameLocalHistorySnapshot(a, b) {
        if (!a || !b) return false;
        return a.value === b.value && a.start === b.start && a.end === b.end;
    }

    resetLocalHistory() {
        const snap = this.createLocalHistorySnapshot();
        this.localHistory = [snap];
        this.localHistoryIndex = 0;
    }

    pushLocalHistorySnapshot() {
        const snap = this.createLocalHistorySnapshot();
        const cur = this.localHistory[this.localHistoryIndex];
        if (this.sameLocalHistorySnapshot(cur, snap)) return;

        if (this.localHistoryIndex < this.localHistory.length - 1) {
            this.localHistory = this.localHistory.slice(0, this.localHistoryIndex + 1);
        }
        this.localHistory.push(snap);
        if (this.localHistory.length > this.historyLimit) {
            const overflow = this.localHistory.length - this.historyLimit;
            this.localHistory.splice(0, overflow);
            this.localHistoryIndex = Math.max(0, this.localHistoryIndex - overflow);
        }
        this.localHistoryIndex = this.localHistory.length - 1;
    }

    applyLocalHistorySnapshot(snap) {
        if (!snap) return false;
        this.historyApplying = true;
        this.textarea.value = String(snap.value || "");
        this.textarea.selectionStart = Number(snap.start || 0);
        this.textarea.selectionEnd = Number(snap.end || 0);
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        this.historyApplying = false;
        return true;
    }

    stepLocalHistory(delta = -1) {
        if (!Number.isFinite(delta) || delta === 0) return false;
        const next = this.localHistoryIndex + (delta > 0 ? 1 : -1);
        if (next < 0 || next >= this.localHistory.length) return false;
        this.localHistoryIndex = next;
        return this.applyLocalHistorySnapshot(this.localHistory[this.localHistoryIndex]);
    }

    setCompletions(items) {
        this.completions = dedupeCompletions(toCompletionObjects(items));
        if (!this.suggestEl.classList.contains("hidden")) this.openSuggest(true);
    }

    renderHighlight() {
        this.highlightEl.innerHTML = highlightGLSLWithEditorState(
            this.textarea.value,
            this.textarea.selectionStart,
            this.textarea.selectionEnd,
            this.focused || document.activeElement === this.textarea
        );
    }

    syncScroll() {
        this.highlightEl.scrollTop = this.textarea.scrollTop;
        this.highlightEl.scrollLeft = this.textarea.scrollLeft;
        this.positionSuggestNearCaret();
    }

    toggleMaximize(force) {
        const next = typeof force === "boolean" ? force : !this.maximized;
        if (next) {
            for (const other of EDITOR_REGISTRY) {
                if (other !== this && other.maximized) other.toggleMaximize(false);
            }
        }
        this.maximized = next;
        this.shellEl.classList.toggle("maximized", next);
        this.btnMaxEl.textContent = next ? "还原" : "放大";
        if (next) {
            this.portalParent = this.shellEl.parentNode;
            if (!this.portalPlaceholder) this.portalPlaceholder = document.createComment("editor-shell-placeholder");
            if (this.portalParent && this.portalPlaceholder.parentNode !== this.portalParent) {
                this.portalParent.insertBefore(this.portalPlaceholder, this.shellEl);
            }
            ensurePortalHost().appendChild(this.shellEl);
            document.body.classList.add("editor-max-open");
            updatePortalActiveState();
        } else {
            if (this.portalPlaceholder?.parentNode) {
                this.portalPlaceholder.parentNode.insertBefore(this.shellEl, this.portalPlaceholder);
                this.portalPlaceholder.remove();
                this.portalPlaceholder = null;
            }
            if (!Array.from(EDITOR_REGISTRY).some((it) => it.maximized)) {
                document.body.classList.remove("editor-max-open");
            }
            updatePortalActiveState();
        }
        this.syncScroll();
        this.textarea.focus();
    }

    currentTokenRange() {
        const text = this.textarea.value;
        const caret = this.textarea.selectionStart || 0;
        return defaultTokenRange(text, caret);
    }

    openSuggest(manual = false) {
        const caret = this.textarea.selectionStart || 0;
        if (isCaretInCommentContext(this.textarea.value, caret)) {
            this.closeSuggest();
            return;
        }

        const range = this.currentTokenRange();
        this.suggestRange = range;

        const keyword = String(range.token || "").toLowerCase();
        const semantic = buildSemanticCompletions(this.textarea.value, this.textarea.selectionStart || 0);
        let list = dedupeCompletions([...(semantic || []), ...(this.completions || [])]);

        if (keyword) {
            const scored = [];
            for (const item of list) {
                const la = String(item?.label || "");
                const fm = fuzzyMatchScore(la, keyword);
                if (!fm.ok) continue;
                scored.push({
                    item,
                    score: fm.score,
                    startsWith: fm.startsWith,
                    index: fm.index,
                    label: la.toLowerCase()
                });
            }
            scored.sort((a, b) => {
                const pa = Number(a.item?.priority) || 0;
                const pb = Number(b.item?.priority) || 0;
                if (pa !== pb) return pb - pa;
                if (a.startsWith !== b.startsWith) return b.startsWith - a.startsWith;
                if (a.score !== b.score) return b.score - a.score;
                if (a.index !== b.index) return a.index - b.index;
                return a.label.length - b.label.length;
            });
            list = scored.map((it) => it.item);
        } else if (!manual) {
            this.closeSuggest();
            return;
        } else {
            list = list.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
        }

        list = list.slice(0, 12);

        if (!list.length) {
            this.closeSuggest();
            return;
        }

        this.filteredSuggest = list;
        this.suggestActive = 0;
        this.renderSuggestList();
        this.suggestEl.classList.remove("hidden");
        this.positionSuggestNearCaret();
    }

    tryAutoSuggest() {
        if (isCaretInCommentContext(this.textarea.value, this.textarea.selectionStart || 0)) {
            this.closeSuggest();
            return;
        }
        const range = this.currentTokenRange();
        const token = String(range.token || "");
        if (token.length < this.autoSuggestMin) {
            this.closeSuggest();
            return;
        }
        this.openSuggest(false);
    }

    closeSuggest() {
        this.suggestEl.classList.add("hidden");
        this.suggestEl.innerHTML = "";
        this.suggestEl.style.removeProperty("left");
        this.suggestEl.style.removeProperty("top");
        this.filteredSuggest = [];
        this.suggestActive = -1;
    }

    moveSuggestActive(delta) {
        if (!this.filteredSuggest.length) return;
        const n = this.filteredSuggest.length;
        this.suggestActive = (this.suggestActive + delta + n) % n;
        this.renderSuggestList();
        this.positionSuggestNearCaret();
    }

    commitActiveSuggest() {
        if (!this.filteredSuggest.length) return;
        const idx = Math.max(0, Math.min(this.suggestActive, this.filteredSuggest.length - 1));
        const item = this.filteredSuggest[idx];
        const insertText = String(item?.insertText || item?.label || "");
        if (!insertText) return;

        const { start, end } = this.suggestRange;
        this.textarea.setRangeText(insertText, start, end, "end");
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
        this.textarea.focus();
    }

    execNativeUndoRedo(action = "undo") {
        this.textarea.focus();
        const cmd = action === "redo" ? "redo" : "undo";
        let handled = false;
        try {
            handled = !!document.execCommand?.(cmd);
        } catch {
            handled = false;
        }

        if (!handled) {
            return false;
        }
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        this.closeSuggest();
        return true;
    }

    toggleLineCommentAtSelection() {
        const text = String(this.textarea.value || "");
        const start = this.textarea.selectionStart || 0;
        const endRaw = this.textarea.selectionEnd || start;
        const hasSelection = endRaw !== start;
        const end = hasSelection && endRaw > start && text[endRaw - 1] === "\n" ? endRaw - 1 : endRaw;

        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const lineEndRaw = text.indexOf("\n", end);
        const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;

        const block = text.slice(lineStart, lineEnd);
        const lines = block.split("\n");
        const allCommented = lines.every((line) => /^[ \t]*\/\//.test(line));
        const mapped = lines.map((line) => {
            if (allCommented) {
                return line.replace(/^([ \t]*)\/\//, "$1");
            }
            return line.replace(/^([ \t]*)/, "$1//");
        });
        const nextBlock = mapped.join("\n");

        if (hasSelection) {
            this.textarea.setRangeText(nextBlock, lineStart, lineEnd, "select");
        } else {
            this.textarea.setRangeText(nextBlock, lineStart, lineEnd, "end");
            let nextCaret = start;
            const updated = String(this.textarea.value || "");
            const currentLineEnd = updated.indexOf("\n", lineStart);
            if (currentLineEnd < 0) {
                this.textarea.setRangeText("\n", updated.length, updated.length, "end");
                nextCaret = this.textarea.value.length;
            } else {
                nextCaret = currentLineEnd + 1;
            }
            this.textarea.selectionStart = nextCaret;
            this.textarea.selectionEnd = nextCaret;
        }

        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
    }

    insertIndentAtCaret(direction = 1) {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        const text = this.textarea.value;
        const unit = this.indentUnit;

        if (start === end) {
            if (direction >= 0) {
                this.textarea.setRangeText(unit, start, end, "end");
            } else {
                const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
                const before = text.slice(lineStart, start);
                if (before.endsWith(unit)) {
                    this.textarea.setRangeText("", start - unit.length, start, "end");
                } else {
                    const wsMatch = before.match(/[ \t]+$/);
                    const n = wsMatch ? Math.min(wsMatch[0].length, unit.length) : 0;
                    if (n > 0) this.textarea.setRangeText("", start - n, start, "end");
                }
            }
        } else {
            const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
            const lineEnd = text.indexOf("\n", end);
            const endIndex = lineEnd < 0 ? text.length : lineEnd;
            const block = text.slice(lineStart, endIndex);
            const lines = block.split("\n");
            const mapped = lines.map((line) => {
                if (direction >= 0) return `${unit}${line}`;
                if (line.startsWith(unit)) return line.slice(unit.length);
                return line.replace(/^[ \t]{1,4}/, "");
            }).join("\n");
            this.textarea.setRangeText(mapped, lineStart, endIndex, "select");
        }

        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
    }

    jumpOutOfClosingDelimiter() {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        if (start !== end) return false;
        const text = String(this.textarea.value || "");
        const ch = text[start] || "";
        if (!")]}>'\"`".includes(ch)) return false;
        this.textarea.selectionStart = start + 1;
        this.textarea.selectionEnd = start + 1;
        this.closeSuggest();
        return true;
    }

    insertPair(open, close) {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        if (start !== end) {
            const selected = this.textarea.value.slice(start, end);
            this.textarea.setRangeText(`${open}${selected}${close}`, start, end, "end");
            this.renderHighlight();
            this.syncScroll();
            this.onChange(this.textarea.value);
            if (!this.historyApplying) this.pushLocalHistorySnapshot();
            this.closeSuggest();
            return;
        }

        const text = this.textarea.value;
        const after = text[start] || "";
        const rest = text.slice(start);
        const nextNonWsMatch = rest.match(/\S/);
        const nextNonWs = nextNonWsMatch ? rest[nextNonWsMatch.index || 0] : "";
        if (nextNonWs === close) {
            this.textarea.setRangeText(open, start, end, "end");
            this.renderHighlight();
            this.syncScroll();
            this.onChange(this.textarea.value);
            if (!this.historyApplying) this.pushLocalHistorySnapshot();
            this.closeSuggest();
            return;
        }

        const shouldAutoClose = !after || /[\s)\]};>,.]/.test(after);
        if (!shouldAutoClose) {
            this.textarea.setRangeText(open, start, end, "end");
            this.renderHighlight();
            this.syncScroll();
            this.onChange(this.textarea.value);
            if (!this.historyApplying) this.pushLocalHistorySnapshot();
            this.closeSuggest();
            return;
        }

        if (after === close) {
            this.textarea.setRangeText(open, start, end, "end");
        } else {
            this.textarea.setRangeText(`${open}${close}`, start, end, "end");
            this.textarea.selectionStart = start + 1;
            this.textarea.selectionEnd = start + 1;
        }

        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
    }

    breakOutParenthesesLine() {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        if (start !== end) return false;
        const text = this.textarea.value;
        const before = text[start - 1] || "";
        const after = text[start] || "";
        if (before !== "(" || after !== ")") return false;

        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const linePrefix = text.slice(lineStart, start);
        const baseIndent = (linePrefix.match(/^[ \t]*/) || [""])[0];
        this.textarea.setRangeText(`)\n${baseIndent}`, start, start + 1, "end");
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
        return true;
    }

    backspaceOnIndentOnlyLine() {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        if (start !== end) return false;

        const text = this.textarea.value;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const lineEndRaw = text.indexOf("\n", start);
        const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
        const lineText = text.slice(lineStart, lineEnd);
        if (!/^[ \t]*$/.test(lineText)) return false;
        if (lineStart <= 0) return false;

        const removeFrom = lineStart - 1;
        const removeTo = lineEnd;
        this.textarea.setRangeText("", removeFrom, removeTo, "start");
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
        return true;
    }

    cutCurrentLine() {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        if (start !== end) return;

        const text = this.textarea.value;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        let lineEnd = text.indexOf("\n", start);
        if (lineEnd < 0) lineEnd = text.length;
        else lineEnd += 1;

        const lineText = text.slice(lineStart, lineEnd);
        if (!lineText) return;

        this.textarea.setRangeText("", lineStart, lineEnd, "start");
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(lineText).catch(() => {});
        }
    }

    pasteAsWholeLine(text) {
        const raw = String(text || "").replace(/\r\n/g, "\n");
        if (!raw) return;
        const start = this.textarea.selectionStart || 0;
        const lineStart = this.textarea.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const insertText = raw.endsWith("\n") ? raw : `${raw}\n`;
        this.textarea.setRangeText(insertText, lineStart, lineStart, "end");
        const caret = lineStart + insertText.length;
        this.textarea.selectionStart = caret;
        this.textarea.selectionEnd = caret;
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
    }

    insertNewLineWithIndent() {
        const start = this.textarea.selectionStart || 0;
        const end = this.textarea.selectionEnd || start;
        const text = this.textarea.value;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const linePrefix = text.slice(lineStart, start);
        const baseIndent = (linePrefix.match(/^[ \t]*/) || [""])[0];
        const trimmedPrefix = linePrefix.trimEnd();
        const after = text.slice(end);

        const opensBlock = /\{\s*$/.test(trimmedPrefix);
        const closesBlockAhead = /^\s*}/.test(after);
        const hasMeaningfulAfter = String(after || "").trim().length > 0;

        if (opensBlock) {
            if (closesBlockAhead) {
                const inserted = `\n${baseIndent}${this.indentUnit}\n${baseIndent}`;
                this.textarea.setRangeText(inserted, start, end, "end");
                const caret = start + 1 + baseIndent.length + this.indentUnit.length;
                this.textarea.selectionStart = caret;
                this.textarea.selectionEnd = caret;
            } else if (hasMeaningfulAfter) {
                const inserted = `\n${baseIndent}${this.indentUnit}`;
                this.textarea.setRangeText(inserted, start, end, "end");
            } else {
                const inserted = `\n${baseIndent}${this.indentUnit}\n${baseIndent}}`;
                this.textarea.setRangeText(inserted, start, end, "end");
                const caret = start + 1 + baseIndent.length + this.indentUnit.length;
                this.textarea.selectionStart = caret;
                this.textarea.selectionEnd = caret;
            }
        } else {
            this.textarea.setRangeText(`\n${baseIndent}`, start, end, "end");
        }

        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
    }

    formatDocumentIndentation() {
        const raw = String(this.textarea.value || "").replace(/\r\n/g, "\n");
        const oldCursor = this.textarea.selectionStart || 0;
        const oldLines = raw.split("\n");
        const cursorLine = raw.slice(0, oldCursor).split("\n").length - 1;
        const lineStart = raw.lastIndexOf("\n", Math.max(0, oldCursor - 1)) + 1;
        const cursorCol = oldCursor - lineStart;
        const oldLine = oldLines[cursorLine] || "";
        const oldIndent = (oldLine.match(/^[ \t]*/) || [""])[0].length;
        const logicalCol = Math.max(0, cursorCol - oldIndent);

        let depth = 0;
        const formattedLines = [];

        for (const line of oldLines) {
            const trimmed = line.trim();
            if (!trimmed) {
                formattedLines.push("");
                continue;
            }
            const cleanLine = stripCommentStringLike(line);
            const leadingCloseMatch = /^\s*(\}+)/.exec(cleanLine);
            const leadingCloseCount = leadingCloseMatch ? leadingCloseMatch[1].length : 0;
            if (leadingCloseCount > 0) {
                depth = Math.max(0, depth - leadingCloseCount);
            }
            const indent = this.indentUnit.repeat(depth);
            formattedLines.push(`${indent}${trimmed}`);
            const openCount = (cleanLine.match(/\{/g) || []).length;
            const closeCount = (cleanLine.match(/\}/g) || []).length;
            const trailingCloseCount = Math.max(0, closeCount - leadingCloseCount);
            depth = Math.max(0, depth + openCount - trailingCloseCount);
        }

        const formatted = formattedLines.join("\n");
        if (formatted === this.textarea.value) return;

        const prevLen = this.textarea.value.length;
        this.textarea.setRangeText(formatted, 0, prevLen, "end");

        const targetLine = Math.max(0, Math.min(cursorLine, formattedLines.length - 1));
        const newLine = formattedLines[targetLine] || "";
        const newIndent = (newLine.match(/^[ \t]*/) || [""])[0].length;
        const newCol = Math.min(newLine.length, newIndent + logicalCol);

        let newCursor = 0;
        for (let i = 0; i < targetLine; i += 1) {
            newCursor += (formattedLines[i] || "").length + 1;
        }
        newCursor += newCol;

        this.textarea.selectionStart = newCursor;
        this.textarea.selectionEnd = newCursor;
        this.renderHighlight();
        this.syncScroll();
        this.onChange(this.textarea.value);
        if (!this.historyApplying) this.pushLocalHistorySnapshot();
        this.closeSuggest();
    }

    positionSuggestNearCaret() {
        if (this.suggestEl.classList.contains("hidden")) return;
        if (!this.filteredSuggest.length) return;

        const shellRect = this.shellEl.getBoundingClientRect();
        const bodyRect = this.bodyEl.getBoundingClientRect();
        if (!shellRect.width || !shellRect.height || !bodyRect.width || !bodyRect.height) return;

        const caret = measureCaretViewportPosition(this.textarea);
        const pad = 8;
        const offsetX = 18;
        const offsetY = 4;

        const width = this.suggestEl.offsetWidth || 320;
        const height = this.suggestEl.offsetHeight || 200;

        const minLeft = bodyRect.left - shellRect.left + pad;
        const maxLeft = bodyRect.right - shellRect.left - pad - width;

        let left = caret.x - shellRect.left + offsetX;
        left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));

        const minTop = bodyRect.top - shellRect.top + pad;
        const maxTop = bodyRect.bottom - shellRect.top - pad - height;

        let top = caret.y - shellRect.top + (caret.h || 16) + offsetY;
        if (top > maxTop) {
            top = caret.y - shellRect.top - height - 4;
        }
        top = Math.max(minTop, Math.min(top, Math.max(minTop, maxTop)));

        this.suggestEl.style.left = `${Math.round(left)}px`;
        this.suggestEl.style.top = `${Math.round(top)}px`;
    }

    renderSuggestList() {
        const token = String(this.suggestRange.token || "");
        const activeItem = this.filteredSuggest[Math.max(0, this.suggestActive)] || null;

        const head = activeItem
            ? (() => {
                const parts = splitSuggestionLabel(activeItem.label, token);
                const inputToken = escapeHtml(token || "(空)");
                const full = `${escapeHtml(parts.before)}<span class="editor-suggest-match">${escapeHtml(parts.match)}</span><span class="editor-suggest-tail">${escapeHtml(parts.after)}</span>`;
                return `<div class="editor-suggest-head"><span class="editor-suggest-input">${inputToken}</span><span class="editor-suggest-sep">/</span><span class="editor-suggest-full">${full}</span></div>`;
            })()
            : "";

        const list = this.filteredSuggest
            .map((item, idx) => {
                const active = idx === this.suggestActive ? " active" : "";
                const parts = splitSuggestionLabel(item.label || "", token);
                const label = `${escapeHtml(parts.before)}<span class="editor-suggest-match">${escapeHtml(parts.match)}</span><span class="editor-suggest-tail">${escapeHtml(parts.after)}</span>`;
                const detail = escapeHtml(item.detail || "");
                return `<button type="button" class="editor-suggest-item${active}" data-idx="${idx}"><span class="editor-suggest-label">${label}</span><small>${detail}</small></button>`;
            })
            .join("");

        this.suggestEl.innerHTML = `${head}${list}`;
        const activeEl = this.suggestEl.querySelector(".editor-suggest-item.active");
        if (activeEl instanceof HTMLElement) activeEl.scrollIntoView({ block: "nearest" });
    }
}

export function mergeCompletionGroups(...groups) {
    const merged = [];
    for (const group of groups) {
        merged.push(...toCompletionObjects(group));
    }
    return dedupeCompletions(merged);
}
