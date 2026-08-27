import {
    MC_COMPAT,
    STORAGE_KEYS
} from "./constants.js?v=20260824_1";
import {
    countTextureParams,
    createDefaultPostNode,
    createDefaultState,
    createDefaultModelBuilderStep,
    createParamTemplate,
    createStore,
    dedupeShaderParams,
    ensurePostInputSamplerParam,
    ensureSelectedNode,
    findPostNode,
    GRAPH_INPUT_ID,
    GRAPH_OUTPUT_ID,
    getPostInputTextureMinCount,
    isTextureParam,
    MODEL_BUILDER_KINDS,
    normalizeNodePathTemplate,
    removeNodeAndLinks,
    resolveNodeFragmentPath,
} from "./store.js";
import { GraphEditor } from "./graph.js";
import { initSettingsSystem } from "./settings.js?v=20260824_1";
import { initHotkeysSystem } from "./hotkeys.js";
import { generateModelBuilderKotlin, generateModelKotlin, generatePostKotlin } from "./codegen.js";
import {
    exportProjectJson,
    exportSettingsJson,
    importProjectFromFile,
    importSettingsFromFile,
    normalizeProjectPayload
} from "./io.js";
import {
    debounce,
    deepClone,
    downloadText,
    escapeHtml,
    loadJson,
    sanitizeProjectName,
    saveJson,
    shouldIgnoreHotkeysForTarget,
    uid
} from "./utils.js";
import {
    BASE_GLSL_COMPLETIONS,
    buildUniformCompletions,
    mergeCompletionGroups,
    ShaderCodeEditor
} from "./editors.js";
import { InlineCodeEditor as JsExprInlineEditor } from "../../composition_builder/js/code_editor.js?v=20260220_5";

function $(id) {
    return document.getElementById(id);
}

const els = {
    btnPageModel: $("btnPageModel"),
    btnPagePost: $("btnPagePost"),
    btnBackToPost: $("btnBackToPost"),
    btnUndo: $("btnUndo"),
    btnRedo: $("btnRedo"),
    btnExportAll: $("btnExportAll"),
    btnAddPass: $("btnAddPass"),
    btnGenerate: $("btnGenerate"),
    btnGenTargetModel: $("btnGenTargetModel"),
    btnGenTargetPost: $("btnGenTargetPost"),
    btnGenTargetAll: $("btnGenTargetAll"),
    btnSettings: $("btnSettings"),
    btnFullscreen: $("btnFullscreen"),
    btnResetCamera: $("btnResetCamera"),
    btnExportProject: $("btnExportProject"),
    btnImportProject: $("btnImportProject"),
    fileProject: $("fileProject"),
    btnResetProject: $("btnResetProject"),
    inpProjectName: $("inpProjectName"),

    selPrimitive: $("selPrimitive"),
    btnUploadModel: $("btnUploadModel"),
    fileModel: $("fileModel"),
    modelFileName: $("modelFileName"),
    chkEnablePost: $("chkEnablePost"),
    chkUseModelBuilder: $("chkUseModelBuilder"),
    selModelBuilderShape: $("selModelBuilderShape"),
    btnAddModelShape: $("btnAddModelShape"),
    btnClearModelShapes: $("btnClearModelShapes"),
    modelBuilderList: $("modelBuilderList"),
    modelBuilderKotlinOut: $("modelBuilderKotlinOut"),
    btnCopyModelBuilderKotlin: $("btnCopyModelBuilderKotlin"),
    btnDownloadModelBuilderKotlin: $("btnDownloadModelBuilderKotlin"),

    btnUploadTexture: $("btnUploadTexture"),
    fileTexture: $("fileTexture"),
    textureList: $("textureList"),

    btnAutoLayout: $("btnAutoLayout"),
    btnClearLinks: $("btnClearLinks"),
    postGraphCard: $("postGraphCard"),
    graphCanvasWrap: $("graphCanvasWrap"),
    graphLines: $("graphLines"),
    graphCanvas: $("graphCanvas"),
    resizerLeft: document.querySelector(".resizer-left"),
    resizerRight: document.querySelector(".resizer-right"),
    layout: document.querySelector(".layout"),
    panelLeft: document.querySelector(".panel.left"),
    panelRight: document.querySelector(".panel.right"),

    statusShader: $("statusShader"),
    statusPipeline: $("statusPipeline"),
    statusCompat: $("statusCompat"),
    statusControls: $("statusControls"),
    threeHost: $("threeHost"),
    viewer: document.querySelector(".viewer"),
    viewerHud: document.querySelector(".viewer-hud"),

    inpModelVertexPath: $("inpModelVertexPath"),
    inpModelFragmentPath: $("inpModelFragmentPath"),
    btnUploadModelVertex: $("btnUploadModelVertex"),
    btnUploadModelFragment: $("btnUploadModelFragment"),
    fileModelVertex: $("fileModelVertex"),
    fileModelFragment: $("fileModelFragment"),
    txtModelVertex: $("txtModelVertex"),
    txtModelFragment: $("txtModelFragment"),
    btnAddModelParam: $("btnAddModelParam"),
    modelParamList: $("modelParamList"),
    btnApplyModelShader: $("btnApplyModelShader"),
    btnExportModelVertex: $("btnExportModelVertex"),
    btnExportModelFragment: $("btnExportModelFragment"),

    nodeEditorEmpty: $("nodeEditorEmpty"),
    nodeEditor: $("nodeEditor"),
    inpNodeName: $("inpNodeName"),
    selNodeType: $("selNodeType"),
    inpNodeFragmentPath: $("inpNodeFragmentPath"),
    btnUploadNodeFragment: $("btnUploadNodeFragment"),
    fileNodeFragment: $("fileNodeFragment"),
    txtNodeFragment: $("txtNodeFragment"),
    btnAddNodeParam: $("btnAddNodeParam"),
    nodeParamList: $("nodeParamList"),
    inpNodeInputs: $("inpNodeInputs"),
    inpNodeOutputs: $("inpNodeOutputs"),
    nodeOutputHint: $("nodeOutputHint"),
    inpNodeTextureUnit: $("inpNodeTextureUnit"),
    selNodeFilter: $("selNodeFilter"),
    inpNodeIterations: $("inpNodeIterations"),
    chkNodeMipmap: $("chkNodeMipmap"),
    btnApplyNodeShader: $("btnApplyNodeShader"),
    btnExportNodeFragment: $("btnExportNodeFragment"),
    btnDuplicateNode: $("btnDuplicateNode"),
    btnDeleteNode: $("btnDeleteNode"),
    nodeTextureHint: $("nodeTextureHint"),
    nodeShaderSection: $("nodeShaderSection"),
    nodeShaderActions: $("nodeShaderActions"),
    nodeTypePickerModal: $("nodeTypePickerModal"),
    nodeTypePickerMask: $("nodeTypePickerMask"),
    nodeTypePicker: $("nodeTypePicker"),
    nodeTypeSearch: $("nodeTypeSearch"),
    btnCloseNodeTypePicker: $("btnCloseNodeTypePicker"),
    btnCancelNodeTypePicker: $("btnCancelNodeTypePicker"),

    kotlinBody: $("kotlinBody"),
    kotlinModelBlock: $("kotlinModelBlock"),
    kotlinPostBlock: $("kotlinPostBlock"),
    btnToggleKotlin: $("btnToggleKotlin"),
    modelKotlinOut: $("modelKotlinOut"),
    postKotlinOut: $("postKotlinOut"),
    btnCopyModelKotlin: $("btnCopyModelKotlin"),
    btnDownloadModelKotlin: $("btnDownloadModelKotlin"),
    btnCopyPostKotlin: $("btnCopyPostKotlin"),
    btnDownloadPostKotlin: $("btnDownloadPostKotlin"),

    settingsModal: $("settingsModal"),
    settingsMask: $("settingsMask"),
    btnCloseSettings: $("btnCloseSettings"),
    btnOpenHotkeys: $("btnOpenHotkeys"),
    btnExportSettings: $("btnExportSettings"),
    btnImportSettings: $("btnImportSettings"),
    fileSettings: $("fileSettings"),
    themeSelect: $("themeSelect"),
    inpParamStep: $("inpParamStep"),
    inpCameraFov: $("inpCameraFov"),
    selPreviewControls: $("selPreviewControls"),
    chkAxes: $("chkAxes"),
    chkGrid: $("chkGrid"),
    chkHelpersIndependent: $("chkHelpersIndependent"),
    chkRealtimeCompile: $("chkRealtimeCompile"),
    chkRealtimeCode: $("chkRealtimeCode"),

    hotkeyModal: $("hotkeyModal"),
    hotkeyMask: $("hotkeyMask"),
    hotkeyList: $("hotkeyList"),
    hotkeyHint: $("hotkeyHint"),
    hotkeySearch: $("hotkeySearch"),
    btnCloseHotkeys: $("btnCloseHotkeys"),
    btnCloseHotkeys2: $("btnCloseHotkeys2"),
    btnResetHotkeys: $("btnResetHotkeys")
};

function setInputValue(el, value) {
    if (!el) return;
    const text = String(value ?? "");
    if (document.activeElement === el) return;
    if (el.value !== text) el.value = text;
}

function setChecked(el, value) {
    if (!el) return;
    el.checked = !!value;
}

function fileNameFromPath(path, fallback) {
    const raw = String(path || "").trim();
    if (!raw) return fallback;
    const parts = raw.split("/");
    const name = parts[parts.length - 1] || fallback;
    return name;
}

function normalizeResourcePath(path, fallback) {
    const raw = String(path || "").trim().replaceAll("\\", "/");
    const cleaned = raw
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => part.replace(/[^a-zA-Z0-9_.-]/g, "_"))
        .join("/");
    return cleaned || fallback;
}

function ensureExt(path, ext) {
    const p = String(path || "");
    if (!p) return ext.startsWith(".") ? `file${ext}` : `file.${ext}`;
    if (p.includes(".")) return p;
    return ext.startsWith(".") ? `${p}${ext}` : `${p}.${ext}`;
}

const GLSL300_ES_VERSION = "#version 300 es";

function collectVec4FragmentOutputs(source) {
    const text = String(source || "");
    const re = /^\s*(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm;
    const out = [];
    let match = re.exec(text);
    while (match) {
        const rawLoc = match[1];
        out.push({
            name: String(match[2] || "").trim(),
            location: rawLoc === undefined ? null : Math.max(0, Math.round(Number(rawLoc) || 0))
        });
        match = re.exec(text);
    }
    return out;
}

function pickPrimaryVec4FragmentOutput(outputs = []) {
    const list = Array.isArray(outputs) ? outputs : [];
    for (const item of list) {
        if (!item?.name) continue;
        if (item.location === 0) return item.name;
    }
    return String(list[0]?.name || "").trim();
}

function normalizeShaderForGlsl300Es(source, { stage = "fragment" } = {}) {
    const shaderStage = String(stage || "fragment").toLowerCase();
    let code = String(source || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n");

    code = code.replace(/^\s*#version[^\n]*(?:\n|$)/gm, "");

    if (shaderStage === "vertex") {
        code = code.replace(/\battribute\b/g, "in");
        code = code.replace(/\bvarying\b/g, "out");
        code = code.replace(/\btexture2D\s*\(/g, "texture(");
        code = code.replace(/\btextureCube\s*\(/g, "texture(");
    } else {
        code = code.replace(/\bvarying\b/g, "in");
        code = code.replace(/\btexture2D\s*\(/g, "texture(");
        code = code.replace(/\btextureCube\s*\(/g, "texture(");

        if (/\bgl_FragColor\b/.test(code)) {
            const outputs = collectVec4FragmentOutputs(code);
            let outputName = pickPrimaryVec4FragmentOutput(outputs);
            if (!outputName) {
                outputName = "FragColor";
                code = `out vec4 ${outputName};\n${code}`;
            }
            code = code.replace(/\bgl_FragColor\b/g, outputName);
        }
    }

    const hasFloatPrecision = /^\s*precision\s+\w+\s+float\s*;/m.test(code);
    const hasIntPrecision = /^\s*precision\s+\w+\s+int\s*;/m.test(code);
    const preamble = [GLSL300_ES_VERSION];
    if (!hasFloatPrecision) preamble.push("precision highp float;");
    if (!hasIntPrecision) preamble.push("precision highp int;");

    code = code.replace(/^\s*\n+/g, "");
    return `${preamble.join("\n")}\n${code}`.trimEnd();
}

function resolveNodePathByInput(inputPath, nodeName) {
    const raw = String(inputPath || "").trim();
    const fallbackTemplate = "core/post/{name}.fsh";

    if (!raw) {
        const template = fallbackTemplate;
        return {
            fragmentPathTemplate: template,
            fragmentPath: resolveNodeFragmentPath(nodeName, template)
        };
    }

    if (raw.includes("{name}")) {
        const template = normalizeNodePathTemplate(raw, fallbackTemplate);
        return {
            fragmentPathTemplate: template,
            fragmentPath: resolveNodeFragmentPath(nodeName, template)
        };
    }

    return {
        fragmentPathTemplate: "",
        fragmentPath: ensureExt(normalizeResourcePath(raw, resolveNodeFragmentPath(nodeName, fallbackTemplate)), ".fsh")
    };
}

function normalizeNodeNumber(value, fallback = 1, min = 1, max = 8) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

const NODE_TYPE_SIMPLE = "simple";
const NODE_TYPE_PINGPONG = "pingpong";
const NODE_TYPE_TEXTURE = "texture";
const NODE_TYPE_DEFAULTS = Object.freeze({
    [NODE_TYPE_SIMPLE]: Object.freeze({
        inputs: 1,
        outputs: 1,
        textureUnit: 1,
        filter: "GL33.GL_LINEAR",
        iterations: 1,
        useMipmap: false
    }),
    [NODE_TYPE_PINGPONG]: Object.freeze({
        inputs: 1,
        outputs: 1,
        textureUnit: 1,
        filter: "GL33.GL_LINEAR",
        iterations: 4,
        useMipmap: false
    }),
    [NODE_TYPE_TEXTURE]: Object.freeze({
        inputs: 0,
        outputs: 1,
        textureUnit: 1,
        filter: "GL33.GL_LINEAR",
        iterations: 1,
        useMipmap: false
    })
});

const NODE_TYPE_CHOICES = Object.freeze([
    Object.freeze({
        type: NODE_TYPE_SIMPLE,
        title: "simple",
        desc: "标准后处理卡片，可编写片元着色并使用多个参数。",
        hint: "适合常规颜色处理、模糊、调色等。"
    }),
    Object.freeze({
        type: NODE_TYPE_PINGPONG,
        title: "pingpong",
        desc: "支持迭代次数的后处理卡片，适合多次反馈运算。",
        hint: "适合反馈模糊、扩散、累积型效果。"
    }),
    Object.freeze({
        type: NODE_TYPE_TEXTURE,
        title: "texture",
        desc: "纯纹理输出卡片，不执行片元着色处理。",
        hint: "仅保留 1 个纹理参数，常用于直接输入纹理。"
    })
]);

function normalizePostNodeType(type) {
    const t = String(type || NODE_TYPE_SIMPLE).trim().toLowerCase();
    if (t === NODE_TYPE_PINGPONG) return NODE_TYPE_PINGPONG;
    if (t === NODE_TYPE_TEXTURE) return NODE_TYPE_TEXTURE;
    return NODE_TYPE_SIMPLE;
}

function minInputCountByNodeType(type) {
    return normalizePostNodeType(type) === NODE_TYPE_TEXTURE ? 0 : 1;
}

function sanitizeTextureNameForKotlin(name, fallback = "texture") {
    const raw = String(name || "").trim();
    const base = raw.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    let out = base || fallback;
    if (/^[0-9]/.test(out)) out = `_${out}`;
    return out.slice(0, 64) || fallback;
}

const GLSL_UNIFORM_TYPE_MAP = Object.freeze({
    float: "float",
    int: "int",
    bool: "bool",
    vec2: "vec2",
    vec3: "vec3",
    texture: "sampler2D"
});
const GLSL_TO_PARAM_TYPE_MAP = Object.freeze({
    float: "float",
    int: "int",
    bool: "bool",
    vec2: "vec2",
    vec3: "vec3",
    sampler2D: "texture",
    samplerCube: "texture"
});
const AUTO_SYNC_EXCLUDED_UNIFORM_NAMES = new Set([
    "tDiffuse",
    "tex"
]);

function isValidGlslIdentifier(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || "").trim());
}

function glslUniformTypeForParam(type) {
    const t = String(type || "float").toLowerCase();
    return GLSL_UNIFORM_TYPE_MAP[t] || "float";
}

function collectUniformDeclsFromParams(params = []) {
    const list = [];
    const used = new Set();
    for (const p of params || []) {
        const name = String(p?.name || "").trim();
        if (!isValidGlslIdentifier(name) || used.has(name)) continue;
        used.add(name);
        const glslType = glslUniformTypeForParam(p?.type);
        list.push({
            name,
            decl: `uniform ${glslType} ${name};`
        });
    }
    return list;
}

function findUniformInsertIndex(lines) {
    let idx = 0;
    while (idx < lines.length) {
        const t = String(lines[idx] || "").trim();
        if (!t) {
            idx += 1;
            continue;
        }
        if (t.startsWith("#version") || /^precision\b/i.test(t) || t.startsWith("//")) {
            idx += 1;
            continue;
        }
        break;
    }
    while (idx < lines.length) {
        const t = String(lines[idx] || "").trim();
        if (!t || /^uniform\b/i.test(t)) {
            idx += 1;
            continue;
        }
        break;
    }
    return idx;
}

function stripShaderCommentsPreserveLines(source) {
    let text = String(source || "");
    text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    text = text.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    return text;
}

function extractUniformDecl(line) {
    const body = String(line || "").replace(/\/\/.*$/g, "").trim();
    // Match declarations like:
    // uniform vec3 CameraPos;
    // uniform highp vec3 CameraPos;
    // uniform sampler2D tex;
    const m = /^uniform\s+(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]+\])?\s*;\s*$/.exec(body);
    if (!m) return null;
    const typeTokens = String(m[1] || "").trim().split(/\s+/).filter(Boolean);
    if (!typeTokens.length) return null;
    return {
        name: String(m[2] || ""),
        glslType: String(typeTokens[typeTokens.length - 1] || ""),
        isArray: !!m[3]
    };
}

function extractUniformDeclName(line) {
    return extractUniformDecl(line)?.name || "";
}

function paramTypeForGlslUniform(glslType) {
    return GLSL_TO_PARAM_TYPE_MAP[String(glslType || "").trim()] || "";
}

function defaultValueForParamType(type) {
    const t = String(type || "float").toLowerCase();
    if (t === "int") return "0";
    if (t === "bool") return "false";
    if (t === "vec2") return "0,0";
    if (t === "vec3") return "1,1,1";
    if (t === "texture") return "0";
    return "1.0";
}

function collectUniformDeclsFromSource(source) {
    const clean = stripShaderCommentsPreserveLines(source);
    const lines = clean.split(/\r?\n/);
    const list = [];
    const seen = new Set();

    for (const line of lines) {
        const decl = extractUniformDecl(line);
        if (!decl || decl.isArray) continue;
        const name = String(decl.name || "").trim();
        if (!isValidGlslIdentifier(name) || seen.has(name)) continue;
        if (AUTO_SYNC_EXCLUDED_UNIFORM_NAMES.has(name)) continue;
        const type = paramTypeForGlslUniform(decl.glslType);
        if (!type) continue;
        seen.add(name);
        list.push({ name, type });
    }

    return list;
}

function extractFragmentOutputDecl(line) {
    const body = String(line || "").replace(/\/\/.*$/g, "").trim();
    if (!body) return null;

    let layoutSpec = "";
    let typeExpr = "";
    let name = "";
    let isArray = false;

    let m = /^layout\s*\(\s*([^)]+)\s*\)\s*out\s+(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]+\])?\s*;\s*$/i.exec(body);
    if (m) {
        layoutSpec = String(m[1] || "");
        typeExpr = String(m[2] || "");
        name = String(m[3] || "");
        isArray = !!m[4];
    } else {
        m = /^out\s+(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]+\])?\s*;\s*$/i.exec(body);
        if (!m) return null;
        typeExpr = String(m[1] || "");
        name = String(m[2] || "");
        isArray = !!m[3];
    }

    if (isArray || !isValidGlslIdentifier(name)) return null;
    const typeTokens = typeExpr.split(/\s+/).filter(Boolean);
    const glslType = String(typeTokens[typeTokens.length - 1] || "").trim().toLowerCase();
    if (glslType !== "vec4") return null;

    let location = null;
    if (layoutSpec) {
        const loc = /\blocation\s*=\s*(\d+)/i.exec(layoutSpec);
        if (loc) {
            const n = Number(loc[1]);
            if (Number.isFinite(n)) location = Math.max(0, Math.round(n));
        }
    }

    return { name, location };
}

function collectFragmentOutputDeclsFromSource(source) {
    const clean = stripShaderCommentsPreserveLines(source);
    const lines = clean.split(/\r?\n/);
    const list = [];
    const seen = new Set();

    for (const line of lines) {
        const decl = extractFragmentOutputDecl(line);
        if (!decl) continue;
        const key = String(decl.name || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        list.push({
            name: key,
            location: Number.isFinite(Number(decl.location)) ? Math.max(0, Math.round(Number(decl.location))) : null
        });
    }

    return list;
}

function areFragmentOutputListsEquivalent(a = [], b = []) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
        const x = left[i] || {};
        const y = right[i] || {};
        if (String(x.name || "") !== String(y.name || "")) return false;
        const lx = Number.isFinite(Number(x.location)) ? Math.round(Number(x.location)) : -1;
        const ly = Number.isFinite(Number(y.location)) ? Math.round(Number(y.location)) : -1;
        if (lx !== ly) return false;
    }
    return true;
}

function syncNodeOutputsFromShaderSource(node) {
    if (!node || typeof node !== "object") return false;
    const nodeType = normalizePostNodeType(node.type);

    let nextDecls = [];
    let nextOutputs = 1;
    if (nodeType === NODE_TYPE_TEXTURE) {
        nextDecls = [{ name: "TextureOut", location: 0 }];
        nextOutputs = 1;
    } else {
        nextDecls = collectFragmentOutputDeclsFromSource(node.fragmentSource);
        nextOutputs = Math.max(1, Math.min(8, nextDecls.length || 1));
    }

    let changed = false;
    if (normalizeNodeNumber(node.outputs, 1, 1, 8) !== nextOutputs) {
        node.outputs = nextOutputs;
        changed = true;
    }

    const prevDecls = Array.isArray(node.__fragmentOutputs) ? node.__fragmentOutputs : [];
    if (!areFragmentOutputListsEquivalent(prevDecls, nextDecls)) {
        node.__fragmentOutputs = nextDecls;
        changed = true;
    }

    return changed;
}

function hasIncompleteUniformDeclaration(source) {
    const clean = stripShaderCommentsPreserveLines(source);
    for (const line of clean.split(/\r?\n/)) {
        const trimmed = String(line || "").trim();
        if (!trimmed) continue;
        if (!/^uniform\b/.test(trimmed)) continue;
        if (!/;\s*$/.test(trimmed)) return true;
    }
    return false;
}

function buildParamFromUniformDecl(decl, prev = null) {
    const base = Object.assign(createParamTemplate(), prev || {});
    const type = String(decl?.type || "float").toLowerCase();
    base.name = String(decl?.name || "").trim();
    base.type = type;
    base.value = String(base.value ?? "");

    if (type === "texture") {
        base.sourceType = String(base.sourceType || "value");
        base.valueSource = "value";
        base.valueExpr = "";
        if (!base.value.trim()) base.value = "0";
    } else {
        base.sourceType = "value";
        base.textureId = "";
        base.connection = "";
        base.valueSource = String(base.valueSource || "value").toLowerCase() === "uniform" ? "uniform" : "value";
        if (!base.value.trim()) base.value = defaultValueForParamType(type);
        if (base.valueSource === "uniform" && !String(base.valueExpr || "").trim()) {
            base.valueExpr = defaultUniformExprByType(type);
        } else {
            base.valueExpr = String(base.valueExpr || "");
        }
    }

    return base;
}

function syncParamsFromUniformSource(params = [], source = "") {
    const decls = collectUniformDeclsFromSource(source);
    if (!decls.length && (params || []).length && hasIncompleteUniformDeclaration(source)) {
        return dedupeShaderParams(Array.isArray(params) ? params : []);
    }
    const prevByName = new Map();
    for (const p of dedupeShaderParams(params || [])) {
        const name = String(p?.name || "").trim();
        if (!name || prevByName.has(name)) continue;
        prevByName.set(name, p);
    }
    return dedupeShaderParams(decls.map((decl) => buildParamFromUniformDecl(decl, prevByName.get(decl.name))));
}

function normalizeTextureParamSlots(params = []) {
    const list = Array.isArray(params) ? params : [];
    const textureIndexes = [];
    for (let i = 0; i < list.length; i += 1) {
        const p = list[i] || {};
        if (String(p?.type || "").toLowerCase() !== "texture") continue;
        if (String(p?.sourceType || "value").toLowerCase() === "upload") continue;
        textureIndexes.push(i);
    }
    if (textureIndexes.length <= 1) return list;

    const slotValues = textureIndexes.map((idx) => String(list[idx]?.value ?? "").trim());
    const likelyDefault = slotValues.every((raw) => !raw || raw === "0");
    if (!likelyDefault) return list;

    for (let slot = 0; slot < textureIndexes.length; slot += 1) {
        const idx = textureIndexes[slot];
        const param = list[idx];
        if (!param) continue;
        param.value = String(slot);
        if (String(param?.sourceType || "value").toLowerCase() === "connection"
            && !String(param?.connection || "").trim()) {
            param.connection = String(slot);
        }
    }
    return list;
}

function areParamListsEquivalent(a = [], b = []) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
        const x = left[i] || {};
        const y = right[i] || {};
        if (String(x.id || "") !== String(y.id || "")) return false;
        if (String(x.name || "") !== String(y.name || "")) return false;
        if (String(x.type || "") !== String(y.type || "")) return false;
        if (String(x.value ?? "") !== String(y.value ?? "")) return false;
        if (String(x.valueSource || "value") !== String(y.valueSource || "value")) return false;
        if (String(x.valueExpr || "") !== String(y.valueExpr || "")) return false;
        if (String(x.sourceType || "value") !== String(y.sourceType || "value")) return false;
        if (String(x.textureId || "") !== String(y.textureId || "")) return false;
        if (String(x.connection || "") !== String(y.connection || "")) return false;
    }
    return true;
}

function syncModelParamsFromShaderSource(draft) {
    if (!draft?.model?.shader) return false;
    const shader = draft.model.shader;
    const prev = Array.isArray(shader.params) ? shader.params : [];
    const next = syncParamsFromUniformSource(prev, shader.fragmentSource);
    if (areParamListsEquivalent(prev, next)) return false;
    shader.params = next;
    return true;
}

function normalizeTextureNodeUploadParams(params = []) {
    const list = (Array.isArray(params) ? params : []).filter((p) => isTextureParam(p));
    const base = Object.assign(createParamTemplate(), list[0] || {});
    base.type = "texture";
    base.sourceType = "upload";
    base.connection = "";
    base.valueSource = "value";
    base.valueExpr = "";
    base.textureId = String(base.textureId || "");
    if (!String(base.value ?? "").trim()) base.value = "0";
    return [base];
}

function enforceTextureNodeUploadOnly(node) {
    if (!node || normalizePostNodeType(node.type) !== NODE_TYPE_TEXTURE) return false;
    let changed = false;
    if (Number(node.inputs) !== 0) {
        node.inputs = 0;
        changed = true;
    }
    if (normalizeNodeNumber(node.outputs, 1, 1, 8) !== 1) {
        node.outputs = 1;
        changed = true;
    }
    const prev = Array.isArray(node.params) ? node.params : [];
    const next = normalizeTextureNodeUploadParams(prev);
    if (!areParamListsEquivalent(prev, next)) {
        node.params = next;
        changed = true;
    }
    return changed;
}

function syncNodeParamsFromShaderSource(node) {
    if (!node) return false;
    const prev = Array.isArray(node.params) ? node.params : [];
    const nodeType = normalizePostNodeType(node.type);
    const minInputs = minInputCountByNodeType(nodeType);
    const normalizedInputs = nodeType === NODE_TYPE_TEXTURE
        ? 0
        : normalizeNodeNumber(node.inputs, minInputs, minInputs, 8);
    const inputChanged = Number(node.inputs) !== normalizedInputs;
    if (inputChanged) node.inputs = normalizedInputs;
    const next = nodeType === NODE_TYPE_TEXTURE
        ? normalizeTextureNodeUploadParams(prev)
        : ensurePostInputSamplerParam(
            syncParamsFromUniformSource(prev, node.fragmentSource),
            getPostInputTextureMinCount(node.inputs)
        );
    normalizeTextureParamSlots(next);

    let changed = inputChanged;
    if (!areParamListsEquivalent(prev, next)) {
        node.params = next;
        changed = true;
    }
    if (syncNodeOutputsFromShaderSource(node)) changed = true;
    return changed;
}

function syncUniformDeclarationsInSource(source, params = [], managedNames = []) {
    const text = String(source || "");
    const desired = collectUniformDeclsFromParams(params);
    const desiredByName = new Map(desired.map((it) => [it.name, it.decl]));
    const managed = new Set((managedNames || []).map((n) => String(n || "").trim()).filter(Boolean));
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    const removeIdx = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = String(lines[i] || "");
        const name = extractUniformDeclName(line);
        if (!name) continue;
        const wanted = desiredByName.get(name);
        if (!wanted) {
            if (managed.has(name)) removeIdx.push(i);
            continue;
        }
        if (seen.has(name)) {
            removeIdx.push(i);
            continue;
        }
        seen.add(name);
        if (line.trim() !== wanted) lines[i] = wanted;
    }

    for (let i = removeIdx.length - 1; i >= 0; i -= 1) {
        lines.splice(removeIdx[i], 1);
    }

    const missing = desired.filter((it) => !seen.has(it.name)).map((it) => it.decl);
    if (missing.length) {
        const insertAt = findUniformInsertIndex(lines);
        lines.splice(insertAt, 0, ...missing);
    }

    return {
        source: lines.join("\n"),
        managedNames: desired.map((it) => it.name)
    };
}

function syncModelShaderUniformDecls(draft, extraManagedNames = []) {
    if (!draft?.model?.shader) return;
    const shader = draft.model.shader;
    shader.params = dedupeShaderParams(shader.params || []);
    const prevManaged = Array.isArray(shader.__autoUniformNames) ? shader.__autoUniformNames : [];
    const mergedManaged = Array.from(new Set([
        ...prevManaged,
        ...(extraManagedNames || [])
    ].map((n) => String(n || "").trim()).filter(Boolean)));
    const synced = syncUniformDeclarationsInSource(shader.fragmentSource, shader.params || [], mergedManaged);
    shader.fragmentSource = synced.source;
    shader.__autoUniformNames = synced.managedNames;
}

function syncNodeShaderUniformDecls(node, extraManagedNames = []) {
    if (!node) return;
    node.params = dedupeShaderParams(node.params || []);
    const textureParamNames = new Set(
        (Array.isArray(node.params) ? node.params : [])
            .filter((p) => String(p?.type || "").toLowerCase() === "texture")
            .map((p) => String(p?.name || "").trim())
            .filter(Boolean)
    );
    const primaryTextureName = Array.from(textureParamNames)[0] || "";
    if (primaryTextureName) {
        for (const alias of ["tDiffuse", "tex", "samp"]) {
            if (textureParamNames.has(alias) || alias === primaryTextureName) continue;
            node.fragmentSource = applyParamRenameInShaderSource(
                node.fragmentSource,
                alias,
                primaryTextureName,
                "texture"
            );
        }
    }
    const legacyTextureAliases = ["tDiffuse", "tex", "samp"].filter((name) => !textureParamNames.has(name));
    const prevManaged = Array.isArray(node.__autoUniformNames) ? node.__autoUniformNames : [];
    const mergedManaged = Array.from(new Set([
        ...prevManaged,
        ...(extraManagedNames || []),
        ...legacyTextureAliases
    ].map((n) => String(n || "").trim()).filter(Boolean)));
    const synced = syncUniformDeclarationsInSource(node.fragmentSource, node.params || [], mergedManaged);
    node.fragmentSource = synced.source;
    node.__autoUniformNames = synced.managedNames;
}

function formatNodeOutputHint(node) {
    const nodeType = normalizePostNodeType(node?.type);
    if (nodeType === NODE_TYPE_TEXTURE) {
        return "texture 节点固定输出: location 0 -> TextureOut";
    }

    const outputs = Array.isArray(node?.__fragmentOutputs) ? node.__fragmentOutputs : [];
    if (!outputs.length) return "未检测到 out vec4 声明，默认输出槽数量为 1";

    return outputs.map((item, idx) => {
        const slot = Number.isFinite(Number(item?.location)) ? Math.round(Number(item.location)) : idx;
        const name = String(item?.name || `FragColor${idx}`);
        return `location ${slot}: ${name}`;
    }).join(" | ");
}

function escapeRegex(source) {
    return String(source || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceIdentifierToken(source, fromName, toName) {
    const text = String(source || "");
    const from = String(fromName || "").trim();
    const to = String(toName || "").trim();
    if (!from || !to || from === to) return { source: text, count: 0 };
    if (!isValidGlslIdentifier(from) || !isValidGlslIdentifier(to)) return { source: text, count: 0 };

    const re = new RegExp(`\\b${escapeRegex(from)}\\b`, "g");
    let count = 0;
    const next = text.replace(re, () => {
        count += 1;
        return to;
    });
    return { source: next, count };
}

function applyParamRenameInShaderSource(source, prevName, nextName, paramType = "float") {
    let nextSource = String(source || "");
    const direct = replaceIdentifierToken(nextSource, prevName, nextName);
    nextSource = direct.source;

    if (String(paramType || "").toLowerCase() === "texture" && direct.count === 0) {
        for (const alias of ["tDiffuse", "tex", "samp"]) {
            if (alias === prevName || alias === nextName) continue;
            const fallback = replaceIdentifierToken(nextSource, alias, nextName);
            nextSource = fallback.source;
            if (fallback.count > 0) break;
        }
    }

    return nextSource;
}

function cloneNodeParams(params = [], { regenerateIds = false } = {}) {
    const list = Array.isArray(params) ? params : [];
    return list.map((p) => {
        const out = Object.assign({}, p || {});
        if (regenerateIds) out.id = uid("param");
        return out;
    });
}

function captureNodeTypeSnapshot(node) {
    const nodeType = normalizePostNodeType(node?.type);
    const minInputs = minInputCountByNodeType(nodeType);
    return {
        fragmentSource: String(node?.fragmentSource || ""),
        params: cloneNodeParams(node?.params || []),
        inputs: nodeType === NODE_TYPE_TEXTURE
            ? 0
            : normalizeNodeNumber(node?.inputs, 1, minInputs, 8),
        outputs: normalizeNodeNumber(node?.outputs, 1, 1, 8),
        textureUnit: Math.max(0, Math.round(Number(node?.textureUnit || 1))),
        filter: String(node?.filter || "GL33.GL_LINEAR"),
        iterations: Math.max(1, Math.round(Number(node?.iterations || 1))),
        useMipmap: !!node?.useMipmap
    };
}

function applyNodeTypeSnapshot(node, snapshot, type) {
    const normalizedType = normalizePostNodeType(type);
    const base = NODE_TYPE_DEFAULTS[normalizedType] || NODE_TYPE_DEFAULTS[NODE_TYPE_SIMPLE];
    const src = snapshot && typeof snapshot === "object" ? snapshot : {};
    const minInputs = minInputCountByNodeType(normalizedType);

    node.inputs = normalizedType === NODE_TYPE_TEXTURE
        ? 0
        : normalizeNodeNumber(src.inputs, base.inputs, minInputs, 8);
    node.outputs = normalizeNodeNumber(src.outputs, base.outputs, 1, 8);
    node.textureUnit = Math.max(0, Math.round(Number(src.textureUnit ?? base.textureUnit)));
    node.filter = String(src.filter || base.filter);
    node.iterations = Math.max(1, Math.round(Number(src.iterations ?? base.iterations)));
    node.useMipmap = src.useMipmap != null ? !!src.useMipmap : !!base.useMipmap;

    if (typeof src.fragmentSource === "string") {
        node.fragmentSource = src.fragmentSource;
    }
    if (Array.isArray(src.params)) {
        node.params = cloneNodeParams(src.params);
    } else if (!Array.isArray(node.params)) {
        node.params = [];
    }
}

function switchPostNodeType(node, nextTypeRaw) {
    if (!node || typeof node !== "object") return false;
    const prevType = normalizePostNodeType(node.type);
    const nextType = normalizePostNodeType(nextTypeRaw);
    if (prevType === nextType) {
        node.type = prevType;
        return false;
    }

    const cache = node.typeStateCache && typeof node.typeStateCache === "object"
        ? node.typeStateCache
        : {};
    cache[prevType] = captureNodeTypeSnapshot(node);

    node.type = nextType;
    const restored = cache[nextType];
    if (restored && typeof restored === "object") {
        applyNodeTypeSnapshot(node, restored, nextType);
    } else {
        applyNodeTypeSnapshot(node, null, nextType);
    }
    syncNodeParamsFromShaderSource(node);
    syncNodeOutputsFromShaderSource(node);

    node.typeStateCache = cache;
    return true;
}

function makeDuplicatedNodeName(existingNodes = [], sourceName = "Pass") {
    const used = new Set((existingNodes || []).map((n) => String(n?.name || "").trim()).filter(Boolean));
    const base = String(sourceName || "Pass").trim() || "Pass";
    const copyBase = `${base}_copy`;
    if (!used.has(copyBase)) return copyBase;
    let idx = 2;
    while (used.has(`${copyBase}_${idx}`)) idx += 1;
    return `${copyBase}_${idx}`;
}

function duplicatePostNode(draft, nodeId) {
    const source = findPostNode(draft, nodeId);
    if (!source) return null;

    const copy = deepClone(source);
    copy.id = uid("pipe");
    copy.name = makeDuplicatedNodeName(draft?.post?.nodes || [], source.name || "Pass");
    copy.x = Math.round(Number(source.x || 0) + 48);
    copy.y = Math.round(Number(source.y || 0) + 48);
    copy.params = cloneNodeParams(copy.params || [], { regenerateIds: true });

    if (copy.typeStateCache && typeof copy.typeStateCache === "object") {
        const nextCache = {};
        for (const [k, v] of Object.entries(copy.typeStateCache)) {
            const key = normalizePostNodeType(k);
            if (v && typeof v === "object") {
                const snap = Object.assign({}, v);
                snap.params = cloneNodeParams(v.params || [], { regenerateIds: true });
                nextCache[key] = snap;
            }
        }
        copy.typeStateCache = nextCache;
    }

    if (copy.fragmentPathTemplate) {
        copy.fragmentPath = resolveNodeFragmentPath(copy.name, copy.fragmentPathTemplate);
    }
    syncNodeParamsFromShaderSource(copy);
    syncNodeShaderUniformDecls(copy);
    syncNodeOutputsFromShaderSource(copy);

    draft.post.nodes.push(copy);
    draft.selectedNodeId = copy.id;
    return copy;
}

const KOTLIN_KEYWORDS = new Set([
    "package", "import", "class", "object", "companion", "interface", "fun", "val", "var",
    "if", "else", "when", "for", "while", "do", "return", "override", "private", "protected",
    "public", "internal", "open", "abstract", "sealed", "data", "enum", "inline", "noinline",
    "crossinline", "suspend", "operator", "infix", "tailrec", "where", "is", "in", "as",
    "true", "false", "null", "this", "super", "by", "init", "try", "catch", "finally"
]);

const KOTLIN_TYPES = new Set([
    "Unit", "Any", "Nothing", "String", "Char", "Boolean", "Byte", "Short", "Int", "Long",
    "Float", "Double", "List", "MutableList", "Map", "MutableMap", "Set", "MutableSet", "Array"
]);

const KOTLIN_TOKEN_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?[fFlL]?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

function classifyKotlinToken(token) {
    if (!token) return "kt-id";
    if (token.startsWith("//") || token.startsWith("/*")) return "kt-comment";
    if (token.startsWith("\"") || token.startsWith("'")) return "kt-string";
    if (/^\d/.test(token)) return "kt-num";
    if (KOTLIN_TYPES.has(token)) return "kt-type";
    if (KOTLIN_KEYWORDS.has(token)) return "kt-key";
    if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) return "kt-type";
    return "kt-id";
}

function highlightKotlin(source) {
    const text = String(source || "");
    let out = "";
    let last = 0;
    for (const match of text.matchAll(KOTLIN_TOKEN_RE)) {
        const token = match[0] || "";
        const idx = match.index || 0;
        out += escapeHtml(text.slice(last, idx));
        out += `<span class="${classifyKotlinToken(token)}">${escapeHtml(token)}</span>`;
        last = idx + token.length;
    }
    out += escapeHtml(text.slice(last));
    if (text.endsWith("\n")) out += "\n";
    return out;
}

function createToastHost() {
    const host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
    return host;
}

const toastHost = createToastHost();

function showToast(message, type = "ok", duration = 2200) {
    const item = document.createElement("div");
    item.className = `toast ${type === "err" ? "err" : "ok"}`;
    item.textContent = String(message || "");
    toastHost.appendChild(item);
    setTimeout(() => {
        item.remove();
    }, duration);
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
        reader.readAsDataURL(file);
    });
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function sanitizeTextureResourceFileName(name, fallback = "texture.png") {
    const raw = String(name || "").trim().replaceAll("\\", "/");
    const last = raw.split("/").filter(Boolean).pop() || fallback;
    const safe = last.replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!safe) return fallback;
    if (safe.includes(".")) return safe;
    return `${safe}.png`;
}

function textureResourcePathFromName(name) {
    const file = sanitizeTextureResourceFileName(name, "texture.png");
    return `core/textures/${file}`;
}

function decodeDataUrlPayload(dataUrl) {
    const raw = String(dataUrl || "");
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(raw);
    if (!match) return null;
    const mime = String(match[1] || "application/octet-stream").toLowerCase();
    const isBase64 = !!match[2];
    const payload = String(match[3] || "");

    try {
        if (isBase64) {
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return { mime, bytes };
        }
        const text = decodeURIComponent(payload.replaceAll("+", "%20"));
        return { mime, bytes: new TextEncoder().encode(text) };
    } catch {
        return null;
    }
}

function createLink(fromNode, fromSlot, toNode, toSlot) {
    const from = String(fromNode || "");
    const to = String(toNode || "");
    const nextFromSlot = from === GRAPH_INPUT_ID
        ? 0
        : Math.max(0, Math.round(Number(fromSlot || 0)));
    const nextToSlot = to === GRAPH_OUTPUT_ID
        ? 0
        : Math.max(0, Math.round(Number(toSlot || 0)));
    return {
        id: uid("link"),
        fromNode: from,
        fromSlot: nextFromSlot,
        toNode: to,
        toSlot: nextToSlot
    };
}

function linkEquals(a, b) {
    return String(a.fromNode) === String(b.fromNode)
        && Number(a.fromSlot || 0) === Number(b.fromSlot || 0)
        && String(a.toNode) === String(b.toNode)
        && Number(a.toSlot || 0) === Number(b.toSlot || 0);
}

function pushUniqueLink(list, link) {
    if (list.some((it) => linkEquals(it, link))) return;
    list.push(link);
}

function wouldCreateCycle(state, fromNode, toNode) {
    if (!fromNode || !toNode) return false;
    if (fromNode === GRAPH_INPUT_ID || toNode === GRAPH_OUTPUT_ID) return false;
    if (fromNode === toNode) return true;

    const links = Array.isArray(state?.post?.links) ? state.post.links : [];
    const adjacency = new Map();

    for (const link of links) {
        const from = String(link?.fromNode || "");
        const to = String(link?.toNode || "");
        if (!from || !to) continue;
        if (from === GRAPH_OUTPUT_ID || to === GRAPH_INPUT_ID) continue;
        if (!adjacency.has(from)) adjacency.set(from, []);
        adjacency.get(from).push(to);
    }

    const stack = [toNode];
    const visited = new Set();

    while (stack.length) {
        const cur = stack.pop();
        if (!cur || visited.has(cur)) continue;
        visited.add(cur);
        if (cur === fromNode) return true;
        for (const next of adjacency.get(cur) || []) {
            if (!visited.has(next)) stack.push(next);
        }
    }

    return false;
}

function createStateFromStorage() {
    const saved = loadJson(STORAGE_KEYS.project, null);
    return normalizeProjectPayload(saved);
}

const store = createStore(createStateFromStorage());

let lastShaderStatus = "着色器：就绪";
let lastPipelineStatus = "后处理链：0 个卡片";

function setStatus(partial = {}) {
    if (partial.shader) lastShaderStatus = partial.shader;
    if (partial.pipeline) lastPipelineStatus = partial.pipeline;
    if (els.statusShader) els.statusShader.textContent = lastShaderStatus;
    if (els.statusPipeline) els.statusPipeline.textContent = lastPipelineStatus;
}

function createRendererFallback() {
    return {
        isFallbackRenderer: true,
        setPrimitive() {},
        applySettings() {},
        resize() {},
        resetCamera() {},
        toggleFullscreen() {},
        syncFromState() {},
        async loadModelFile() {
            throw new Error("渲染预览未就绪，暂时无法导入模型。");
        }
    };
}

if (els.statusCompat) {
    els.statusCompat.textContent = `MC ${MC_COMPAT.mcVersion}: ${MC_COMPAT.openGL} / ${MC_COMPAT.glsl} | 坐标轴：${MC_COMPAT.axis}`;
}

let renderer = createRendererFallback();

const graphEditor = new GraphEditor({
    wrapEl: els.graphCanvasWrap,
    canvasEl: els.graphCanvas,
    linesEl: els.graphLines,
    store,
    callbacks: {
        onSelectNode(nodeId) {
            store.patch((draft) => {
                draft.selectedNodeId = nodeId;
            }, { reason: "node-select" });
        },
        onOpenNodeEditor(nodeId) {
            store.patch((draft) => {
                draft.selectedNodeId = nodeId;
            }, { reason: "node-open-editor" });
            applyWorkspacePage("card");
        },
        onPatchNode(nodeId, mutator, meta = {}) {
            if (typeof mutator !== "function") return;
            store.patch((draft) => {
                const node = findPostNode(draft, nodeId);
                if (!node) return;
                const prevType = normalizePostNodeType(node.type);
                const prevParamMeta = new Map();
                for (let i = 0; i < (node.params || []).length; i += 1) {
                    const param = node.params[i] || {};
                    const key = String(param.id || `idx:${i}`);
                    if (prevParamMeta.has(key)) continue;
                    prevParamMeta.set(key, {
                        name: String(param.name || "").trim(),
                        type: String(param.type || "").toLowerCase()
                    });
                }
                mutator(node, draft);
                for (let i = 0; i < (node.params || []).length; i += 1) {
                    const param = node.params[i] || {};
                    const key = String(param.id || `idx:${i}`);
                    const prev = prevParamMeta.get(key);
                    if (!prev) continue;
                    const nextName = String(param.name || "").trim();
                    if (!prev.name || !nextName || prev.name === nextName) continue;
                    node.fragmentSource = applyParamRenameInShaderSource(
                        node.fragmentSource,
                        prev.name,
                        nextName,
                        String(param.type || prev.type).toLowerCase()
                    );
                }
                const nextType = normalizePostNodeType(node.type);
                if (nextType !== prevType) {
                    switchPostNodeType(node, nextType);
                }
                if (nextType === NODE_TYPE_TEXTURE) {
                    enforceTextureNodeUploadOnly(node);
                } else {
                    const minTextureCount = getPostInputTextureMinCount(node.inputs);
                    node.params = ensurePostInputSamplerParam(node.params, minTextureCount);
                }
                syncNodeOutputsFromShaderSource(node);
                syncNodeShaderUniformDecls(node);
            }, Object.assign({
                reason: "node-inline-edit",
                forceCompile: true,
                forceKotlin: true
            }, meta || {}));
        },
        onDuplicateNode(nodeId) {
            duplicateNodeByIds([nodeId]);
        },
        onAddNode() {
            addPostNode({ askType: true });
        },
        onDeleteNode(nodeId) {
            store.patch((draft) => {
                removeNodeAndLinks(draft, nodeId);
                ensureSelectedNode(draft);
            }, { reason: "node-delete", forceCompile: true, forceKotlin: true });
            showToast("已删除后处理卡片", "ok");
        },
        onDeleteNodes(nodeIds = []) {
            const ids = Array.from(new Set((nodeIds || []).map((id) => String(id || "")).filter(Boolean)));
            if (!ids.length) return;
            store.patch((draft) => {
                for (const id of ids) {
                    removeNodeAndLinks(draft, id);
                }
                ensureSelectedNode(draft);
            }, { reason: "node-delete-many", forceCompile: true, forceKotlin: true });
            showToast(`已删除 ${ids.length} 个卡片`, "ok");
        },
        onMoveNode(nodeId, x, y) {
            store.patch((draft) => {
                const node = findPostNode(draft, nodeId);
                if (!node) return;
                node.x = Math.round(x);
                node.y = Math.round(y);
            }, { reason: "node-move", forceKotlin: true });
        },
        onMoveNodes(moves = []) {
            const list = Array.isArray(moves) ? moves : [];
            if (!list.length) return;
            store.patch((draft) => {
                for (const item of list) {
                    const node = findPostNode(draft, String(item?.id || ""));
                    if (!node) continue;
                    node.x = Math.round(Number(item?.x || node.x || 0));
                    node.y = Math.round(Number(item?.y || node.y || 0));
                }
            }, { reason: "node-move-many", forceKotlin: true });
        },
        onMoveSystemNodes(moves = []) {
            const list = Array.isArray(moves) ? moves : [];
            if (!list.length) return;
            store.patch((draft) => {
                if (!draft.post || typeof draft.post !== "object") draft.post = {};
                if (!draft.post.systemNodePositions || typeof draft.post.systemNodePositions !== "object") {
                    draft.post.systemNodePositions = {};
                }
                if (!draft.post.systemNodeUserMoved || typeof draft.post.systemNodeUserMoved !== "object") {
                    draft.post.systemNodeUserMoved = {};
                }
                for (const item of list) {
                    const id = String(item?.id || "");
                    if (id !== GRAPH_INPUT_ID && id !== GRAPH_OUTPUT_ID) continue;
                    const x = Number(item?.x);
                    const y = Number(item?.y);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        draft.post.systemNodePositions[id] = { x, y };
                    }
                    draft.post.systemNodeUserMoved[id] = !!item?.userMoved;
                }
            }, { reason: "system-node-move", skipHistory: true, silentUI: true });
        },
        onCreateLink(link) {
            const state = store.getState();
            const fromNode = String(link?.fromNode || "");
            const toNode = String(link?.toNode || "");
            const fromSlot = Number(link?.fromSlot || 0);
            const toSlot = Number(link?.toSlot || 0);

            if (!fromNode || !toNode) return;
            if (toNode === GRAPH_INPUT_ID) {
                showToast("输入系统节点不能作为连接终点", "err");
                return;
            }
            if (fromNode === GRAPH_OUTPUT_ID) {
                showToast("输出系统节点不能作为连接起点", "err");
                return;
            }
            if (fromNode === toNode) {
                showToast("不支持自连接", "err");
                return;
            }
            if (wouldCreateCycle(state, fromNode, toNode)) {
                showToast("该连接会形成环，已阻止", "err");
                return;
            }

            store.patch((draft) => {
                draft.post.links = (draft.post.links || []).filter((l) => {
                    const sameTarget = String(l.toNode) === toNode && Number(l.toSlot || 0) === toSlot;
                    return !sameTarget;
                });
                pushUniqueLink(draft.post.links, createLink(fromNode, fromSlot, toNode, toSlot));
            }, { reason: "link-create", forceCompile: true, forceKotlin: true });
        },
        onDeleteLink(linkId, opts = {}) {
            store.patch((draft) => {
                draft.post.links = (draft.post.links || []).filter((l) => l.id !== linkId);
            }, { reason: "link-delete", forceCompile: true, forceKotlin: true });
            if (!opts?.silent) showToast("连线已删除", "ok");
        },
        onDeleteLinks(linkIds = []) {
            const ids = new Set((linkIds || []).map((id) => String(id || "")).filter(Boolean));
            if (!ids.size) return;
            store.patch((draft) => {
                draft.post.links = (draft.post.links || []).filter((l) => !ids.has(String(l?.id || "")));
            }, { reason: "link-delete-many", forceCompile: true, forceKotlin: true });
            showToast(`已删除 ${ids.size} 条连线`, "ok");
        }
    }
});

async function bootRenderer() {
    try {
        const mod = await import("./renderer.js?v=20260313_4");
        const RendererCtor = mod?.ShaderWorkbenchRenderer;
        if (typeof RendererCtor !== "function") {
            throw new Error("渲染模块缺少 ShaderWorkbenchRenderer");
        }

        renderer = new RendererCtor({
            hostEl: els.threeHost,
            onStatus: (partial) => setStatus(partial)
        });

        const state = store.getState();
        renderer.setPrimitive(state.model?.primitive || "sphere");
        renderer.applySettings(state.settings || {});
        renderer.syncFromState(state);
    } catch (err) {
        console.error("renderer boot failed", err);
        setStatus({
            shader: "着色器：渲染器不可用",
            pipeline: "后处理链：预览已禁用"
        });
        showToast("Three.js 加载失败，已切换到仅编辑模式。", "err", 4200);
    }
}

const modelVertexEditor = new ShaderCodeEditor({
    textarea: els.txtModelVertex,
    title: "模型顶点 GLSL",
    onChange(value) {
        store.patch((draft) => {
            draft.model.shader.vertexSource = value;
        }, { reason: "model-vertex-source", silentUI: true, forceKotlin: true });
    }
});

const modelFragmentEditor = new ShaderCodeEditor({
    textarea: els.txtModelFragment,
    title: "模型片元 GLSL",
    onChange(value) {
        store.patch((draft) => {
            draft.model.shader.fragmentSource = value;
            syncModelParamsFromShaderSource(draft);
        }, { reason: "model-fragment-source", silentUI: true, forceKotlin: true });
    }
});

const nodeFragmentEditor = new ShaderCodeEditor({
    textarea: els.txtNodeFragment,
    title: "后处理片元 GLSL",
    onChange(value) {
        store.patch((draft) => {
            const node = findPostNode(draft, draft.selectedNodeId);
            if (!node) return;
            node.fragmentSource = value;
            syncNodeParamsFromShaderSource(node);
        }, { reason: "node-fragment-source", silentUI: true, forceKotlin: true });
    }
});

let hotkeySystem = null;
let hasCustomModelLoaded = false;
let modelKotlinCache = "";
let postKotlinCache = "";
let kotlinCollapsed = true;
let syncRendererDebounced = () => syncRendererNow();
const PAGE_STORAGE_KEY = "sb_workspace_page_v1";
const CARD_PREVIEW_POS_KEY = "sb_card_preview_pos_v1";
const KOTLIN_TARGET_STORAGE_KEY = "sb_kotlin_target_v1";
let workspacePage = normalizeWorkspacePage(localStorage.getItem(PAGE_STORAGE_KEY), { allowCard: false });
let cardPreviewPos = loadJson(CARD_PREVIEW_POS_KEY, null);
let kotlinGenerateTarget = normalizeKotlinGenerateTarget(localStorage.getItem(KOTLIN_TARGET_STORAGE_KEY) || "all");
let nodeTypePickerState = {
    open: false,
    defaultType: NODE_TYPE_SIMPLE,
    lastFocusEl: null,
    onPick: null,
    list: []
};

function normalizeCardPreviewPos(raw) {
    if (!raw || typeof raw !== "object") return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
}

cardPreviewPos = normalizeCardPreviewPos(cardPreviewPos);

function normalizeWorkspacePage(page, { allowCard = true } = {}) {
    const p = String(page || "").toLowerCase();
    if (p === "post" || p === "model") return p;
    if (p === "card") return allowCard ? "card" : "post";
    return "model";
}

function isFloatingPreviewPage(page = workspacePage) {
    return page === "card" || page === "post";
}

function normalizeKotlinGenerateTarget(target) {
    const t = String(target || "").toLowerCase();
    if (t === "model" || t === "post" || t === "all") return t;
    return "all";
}

function suggestKotlinTargetByWorkspace(page = workspacePage) {
    if (page === "model") return "model";
    if (page === "post" || page === "card") return "post";
    return normalizeKotlinGenerateTarget(kotlinGenerateTarget);
}

function applyKotlinGenerateTarget(target, { save = true } = {}) {
    kotlinGenerateTarget = normalizeKotlinGenerateTarget(target);
    const btnMap = {
        model: els.btnGenTargetModel,
        post: els.btnGenTargetPost,
        all: els.btnGenTargetAll
    };
    for (const [key, btn] of Object.entries(btnMap)) {
        if (!(btn instanceof HTMLElement)) continue;
        const active = key === kotlinGenerateTarget;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (els.kotlinModelBlock) {
        const showModel = kotlinGenerateTarget === "all" || kotlinGenerateTarget === "model";
        els.kotlinModelBlock.classList.toggle("hidden", !showModel);
    }
    if (els.kotlinPostBlock) {
        const showPost = kotlinGenerateTarget === "all" || kotlinGenerateTarget === "post";
        els.kotlinPostBlock.classList.toggle("hidden", !showPost);
    }
    if (save) localStorage.setItem(KOTLIN_TARGET_STORAGE_KEY, kotlinGenerateTarget);
}

function refreshResizableCards() {
    const cards = [
        $("modelShaderCard"),
        $("nodeEditorCard"),
        $("kotlinCard"),
        $("postGraphCard")
    ].filter((el) => el instanceof HTMLElement && !el.classList.contains("hidden"));

    for (const el of cards) el.classList.remove("card-resizable");
    const visible = cards.filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
    });
    if (visible.length <= 1) return;
    for (const el of visible) el.classList.add("card-resizable");
}

function clampCardPreviewPos(pos) {
    if (!pos || !els.viewer) return null;
    const rect = els.viewer.getBoundingClientRect();
    const w = Math.max(180, Math.round(rect.width || 420));
    const h = Math.max(120, Math.round(rect.height || 240));
    const pad = 8;
    const x = Math.max(pad, Math.min(Math.round(pos.x), Math.max(pad, window.innerWidth - w - pad)));
    const y = Math.max(pad, Math.min(Math.round(pos.y), Math.max(pad, window.innerHeight - h - pad)));
    return { x, y };
}

function applyCardPreviewPosition() {
    if (!els.viewer) return;

    if (!isFloatingPreviewPage(workspacePage)) {
        els.viewer.style.removeProperty("left");
        els.viewer.style.removeProperty("top");
        els.viewer.style.removeProperty("right");
        els.viewer.style.removeProperty("bottom");
        return;
    }

    const safe = clampCardPreviewPos(cardPreviewPos);
    if (!safe) {
        els.viewer.style.removeProperty("left");
        els.viewer.style.removeProperty("top");
        els.viewer.style.removeProperty("right");
        els.viewer.style.removeProperty("bottom");
        return;
    }

    cardPreviewPos = safe;
    els.viewer.style.left = `${safe.x}px`;
    els.viewer.style.top = `${safe.y}px`;
    els.viewer.style.right = "auto";
    els.viewer.style.bottom = "auto";
}

function applyWorkspacePage(page, { save = true } = {}) {
    workspacePage = normalizeWorkspacePage(page, { allowCard: true });
    document.body.setAttribute("data-workspace-page", workspacePage);
    if (save) {
        const persistedPage = workspacePage === "card" ? "post" : workspacePage;
        localStorage.setItem(PAGE_STORAGE_KEY, persistedPage);
    }

    if (workspacePage === "post" || workspacePage === "card") {
        const state = store.getState();
        if (!findPostNode(state, state.selectedNodeId) && (state.post?.nodes || []).length) {
            store.patch((draft) => {
                ensureSelectedNode(draft);
            }, { reason: "node-select-fallback", skipHistory: true });
        }
    }

    if (els.btnPageModel) {
        els.btnPageModel.classList.toggle("active", workspacePage === "model");
    }
    if (els.btnPagePost) {
        els.btnPagePost.classList.toggle("active", workspacePage === "post" || workspacePage === "card");
    }
    if (els.btnBackToPost) {
        els.btnBackToPost.classList.toggle("hidden", workspacePage !== "card");
    }

    if (els.btnAddPass) {
        els.btnAddPass.disabled = workspacePage !== "post";
    }

    const workspaceTarget = suggestKotlinTargetByWorkspace(workspacePage);
    if (workspaceTarget !== kotlinGenerateTarget) {
        applyKotlinGenerateTarget(workspaceTarget);
    }

    applyCardPreviewPosition();
    refreshResizableCards();
    graphEditor.render();
    requestAnimationFrame(() => graphEditor.render());
}

const settingsSystem = initSettingsSystem({
    store,
    els,
    onOpenHotkeys: () => {
        hotkeySystem?.open();
    },
    onSettingsApplied: (settings) => {
        renderer.applySettings(settings);
        refreshKotlin(false);
        requestRendererSync({ force: false });
    }
});

function toggleSettings() {
    if (isNodeTypePickerOpen()) {
        closeNodeTypePicker({ pickType: null });
    }
    const hidden = !!els.settingsModal?.classList.contains("hidden");
    if (hidden) settingsSystem.show();
    else settingsSystem.hide();
}

function refreshUndoRedoButtons() {
    if (els.btnUndo) els.btnUndo.disabled = !store.canUndo();
    if (els.btnRedo) els.btnRedo.disabled = !store.canRedo();
}

function performUndo() {
    const ok = store.undo({
        reason: "undo",
        forceCompile: true,
        forceCompileNow: true,
        forceKotlin: true
    });
    if (!ok) return false;
    showToast("已撤回", "ok", 1200);
    return true;
}

function performRedo() {
    const ok = store.redo({
        reason: "redo",
        forceCompile: true,
        forceCompileNow: true,
        forceKotlin: true
    });
    if (!ok) return false;
    showToast("已重做", "ok", 1200);
    return true;
}

function isNodeTypePickerOpen() {
    return !!(els.nodeTypePickerModal && !els.nodeTypePickerModal.classList.contains("hidden"));
}

function buildNodeTypePickerList(filterText = "") {
    const f = String(filterText || "").trim().toLowerCase();
    const scored = [];
    for (let i = 0; i < NODE_TYPE_CHOICES.length; i += 1) {
        const item = NODE_TYPE_CHOICES[i];
        const typeText = String(item.type || "").toLowerCase();
        const titleText = String(item.title || "").toLowerCase();
        const descText = String(item.desc || "").toLowerCase();
        const hintText = String(item.hint || "").toLowerCase();
        if (!f) {
            scored.push({ item, group: 0, score: 0, order: i });
            continue;
        }
        const titleIdx = titleText.indexOf(f);
        const typeIdx = typeText.indexOf(f);
        const direct = [titleIdx, typeIdx].filter((v) => v >= 0);
        if (direct.length) {
            scored.push({
                item,
                group: 0,
                score: Math.min(...direct),
                order: i
            });
            continue;
        }
        const descIdx = descText.indexOf(f);
        const hintIdx = hintText.indexOf(f);
        const secondary = [descIdx, hintIdx].filter((v) => v >= 0);
        if (secondary.length) {
            scored.push({
                item,
                group: 1,
                score: Math.min(...secondary),
                order: i
            });
        }
    }
    scored.sort((a, b) => (a.group - b.group) || (a.score - b.score) || (a.order - b.order));
    return scored.map((it) => it.item);
}

function renderNodeTypePicker(filterText = "") {
    if (!(els.nodeTypePicker instanceof HTMLElement)) return;
    const list = buildNodeTypePickerList(filterText);
    nodeTypePickerState.list = list.map((item) => normalizePostNodeType(item.type));
    const defaultType = normalizePostNodeType(nodeTypePickerState.defaultType || NODE_TYPE_SIMPLE);
    els.nodeTypePicker.innerHTML = "";

    if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "node-type-empty";
        empty.textContent = "没有匹配类型，请修改搜索关键词。";
        els.nodeTypePicker.appendChild(empty);
        return;
    }

    for (const item of list) {
        const type = normalizePostNodeType(item.type);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pickitem node-type-item";
        if (type === defaultType) btn.classList.add("active");
        btn.dataset.type = type;
        btn.innerHTML = [
            `<div class="t">${escapeHtml(item.title || type)}</div>`,
            `<div class="d">${escapeHtml(item.desc || "")}</div>`,
            `<div class="node-type-meta">${escapeHtml(item.hint || "")}</div>`
        ].join("");
        btn.addEventListener("click", () => {
            closeNodeTypePicker({ pickType: type });
        });
        els.nodeTypePicker.appendChild(btn);
    }
}

function closeNodeTypePicker({ pickType = null, emit = true } = {}) {
    const onPick = nodeTypePickerState.onPick;
    const lastFocusEl = nodeTypePickerState.lastFocusEl;

    nodeTypePickerState.open = false;
    nodeTypePickerState.onPick = null;
    nodeTypePickerState.list = [];

    if (els.nodeTypePickerModal) els.nodeTypePickerModal.classList.add("hidden");
    if (els.nodeTypePickerMask) els.nodeTypePickerMask.classList.add("hidden");
    if (els.nodeTypeSearch) els.nodeTypeSearch.value = "";
    if (els.nodeTypePicker) els.nodeTypePicker.innerHTML = "";

    if (emit && typeof onPick === "function") {
        onPick(pickType ? normalizePostNodeType(pickType) : null);
    }

    if (lastFocusEl instanceof HTMLElement) {
        try {
            lastFocusEl.focus({ preventScroll: true });
        } catch {
            lastFocusEl.focus();
        }
    }
}

function openNodeTypePicker({ defaultType = NODE_TYPE_SIMPLE, onPick = null } = {}) {
    if (!(els.nodeTypePickerModal instanceof HTMLElement)
        || !(els.nodeTypePickerMask instanceof HTMLElement)
        || !(els.nodeTypePicker instanceof HTMLElement)) {
        if (typeof onPick === "function") onPick(normalizePostNodeType(defaultType));
        return;
    }
    closeNodeTypePicker({ emit: false });
    nodeTypePickerState.open = true;
    nodeTypePickerState.defaultType = normalizePostNodeType(defaultType);
    nodeTypePickerState.lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nodeTypePickerState.onPick = typeof onPick === "function" ? onPick : null;
    els.nodeTypePickerModal.classList.remove("hidden");
    els.nodeTypePickerMask.classList.remove("hidden");
    if (els.nodeTypeSearch) els.nodeTypeSearch.value = "";
    renderNodeTypePicker("");
    if (els.nodeTypeSearch instanceof HTMLElement) els.nodeTypeSearch.focus();
}

function addPostNode({ presetType = null, askType = true } = {}) {
    let targetType = normalizePostNodeType(presetType || NODE_TYPE_SIMPLE);
    if (askType && !presetType) {
        const state = store.getState();
        const selectedNode = findPostNode(state, state.selectedNodeId);
        openNodeTypePicker({
            defaultType: normalizePostNodeType(selectedNode?.type || targetType),
            onPick: (picked) => {
                if (!picked) return;
                addPostNode({ presetType: picked, askType: false });
            }
        });
        return;
    }

    store.patch((draft) => {
        const node = createDefaultPostNode((draft.post.nodes || []).length);
        const selected = findPostNode(draft, draft.selectedNodeId);

        if (selected) {
            node.x = Number(selected.x || 220) + 230;
            node.y = Number(selected.y || 80);
        }

        if (targetType !== NODE_TYPE_SIMPLE) {
            switchPostNodeType(node, targetType);
        } else {
            syncNodeParamsFromShaderSource(node);
        }

        if (targetType === NODE_TYPE_TEXTURE) {
            enforceTextureNodeUploadOnly(node);
        }
        syncNodeShaderUniformDecls(node);

        draft.post.nodes.push(node);
        draft.selectedNodeId = node.id;
    }, { reason: "node-add", forceCompile: true, forceKotlin: true });
}

function duplicateNodeByIds(nodeIds = []) {
    const ids = Array.from(new Set((nodeIds || []).map((id) => String(id || "")).filter(Boolean)))
        .filter((id) => id !== GRAPH_INPUT_ID && id !== GRAPH_OUTPUT_ID);
    if (!ids.length) return 0;

    let createdCount = 0;
    let lastCreatedId = "";
    store.patch((draft) => {
        for (const id of ids) {
            const created = duplicatePostNode(draft, id);
            if (!created) continue;
            createdCount += 1;
            lastCreatedId = created.id;
        }
        if (lastCreatedId) draft.selectedNodeId = lastCreatedId;
        ensureSelectedNode(draft);
    }, { reason: "node-duplicate", forceCompile: true, forceKotlin: true });

    if (createdCount > 0) {
        if (lastCreatedId && graphEditor && typeof graphEditor.selectSingleNode === "function") {
            graphEditor.selectSingleNode(lastCreatedId, { primary: true });
        }
        showToast(`已复制 ${createdCount} 个卡片`, "ok");
    }
    return createdCount;
}

function duplicateSelectedNode() {
    const ids = [];
    if (graphEditor?.selectedNodeIds instanceof Set) {
        for (const id of graphEditor.selectedNodeIds) {
            const s = String(id || "");
            if (!s || s === GRAPH_INPUT_ID || s === GRAPH_OUTPUT_ID) continue;
            ids.push(s);
        }
    }
    if (!ids.length) {
        const state = store.getState();
        const selected = String(state?.selectedNodeId || "");
        if (selected && selected !== GRAPH_INPUT_ID && selected !== GRAPH_OUTPUT_ID) ids.push(selected);
    }
    if (!ids.length) {
        showToast("请先选择要复制的卡片", "warn");
        return 0;
    }
    return duplicateNodeByIds(ids);
}

function deleteSelectedNode() {
    if (graphEditor && typeof graphEditor.hasAnySelection === "function" && graphEditor.hasAnySelection()) {
        graphEditor.deleteSelection();
        return;
    }
    const state = store.getState();
    const nodeId = state.selectedNodeId;
    if (!nodeId) return;
    store.patch((draft) => {
        removeNodeAndLinks(draft, nodeId);
        ensureSelectedNode(draft);
    }, { reason: "node-delete", forceCompile: true, forceKotlin: true });
}

function nextCustomParamSerial(params = [], { excludePostInputSampler = false, excludeTextureParams = false } = {}) {
    const excludeTextures = !!(excludePostInputSampler || excludeTextureParams);
    let count = 0;
    for (const p of params || []) {
        if (excludeTextures && isTextureParam(p)) continue;
        count += 1;
    }
    return count + 1;
}

const MODEL_BUILDER_LABELS = Object.freeze({
    box: "立方体",
    plane: "平面",
    sphere: "球体",
    disc: "圆盘",
    ring: "圆环"
});

function normalizeModelBuilderKind(kind) {
    const k = String(kind || "").trim().toLowerCase();
    return MODEL_BUILDER_KINDS.includes(k) ? k : "box";
}

function ensureDraftModelBuilder(draft) {
    if (!draft.model || typeof draft.model !== "object") draft.model = {};
    if (!draft.model.builder || typeof draft.model.builder !== "object") {
        draft.model.builder = { enabled: false, steps: [] };
    }
    if (!Array.isArray(draft.model.builder.steps)) draft.model.builder.steps = [];
    return draft.model.builder;
}

function modelBuilderStepFields(kind) {
    const k = normalizeModelBuilderKind(kind);
    if (k === "plane") return [
        ["width", "宽"],
        ["height", "高"]
    ];
    if (k === "sphere") return [
        ["radius", "半径"],
        ["latSegments", "纬线"],
        ["lonSegments", "经线"]
    ];
    if (k === "disc") return [
        ["radius", "半径"],
        ["segments", "细分"]
    ];
    if (k === "ring") return [
        ["innerRadius", "内半径"],
        ["outerRadius", "外半径"],
        ["segments", "细分"]
    ];
    return [
        ["width", "宽"],
        ["height", "高"],
        ["depth", "深"]
    ];
}

function patchModelBuilderStep(stepId, mutator, meta = {}) {
    const id = String(stepId || "");
    if (!id || typeof mutator !== "function") return;
    store.patch((draft) => {
        const builder = ensureDraftModelBuilder(draft);
        const step = builder.steps.find((item) => String(item?.id || "") === id);
        if (!step) return;
        mutator(step, builder, draft);
    }, Object.assign({
        reason: "model-builder-step",
        forceCompile: true,
        forceKotlin: true
    }, meta || {}));
}

function createModelBuilderNumberField(step, key, labelText) {
    const field = document.createElement("label");
    field.className = "model-builder-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.className = "input";
    input.type = "number";
    input.step = key.toLowerCase().includes("segment") ? "1" : "0.05";
    input.value = String(step?.[key] ?? "");
    input.addEventListener("change", () => {
        patchModelBuilderStep(step.id, (target) => {
            target[key] = Number(input.value);
        });
    });
    field.appendChild(label);
    field.appendChild(input);
    return field;
}

function createModelBuilderTextField(step, key, labelText, placeholder = "") {
    const field = document.createElement("label");
    field.className = "model-builder-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.className = "input";
    input.value = String(step?.[key] ?? "");
    input.placeholder = placeholder;
    input.addEventListener("change", () => {
        patchModelBuilderStep(step.id, (target) => {
            target[key] = String(input.value || "").trim();
        });
    });
    field.appendChild(label);
    field.appendChild(input);
    return field;
}

function renderModelBuilder(state) {
    const builder = state?.model?.builder || { enabled: false, steps: [] };
    const steps = Array.isArray(builder.steps) ? builder.steps : [];
    setChecked(els.chkUseModelBuilder, !!builder.enabled);

    if (els.modelBuilderKotlinOut) {
        els.modelBuilderKotlinOut.innerHTML = highlightKotlin(generateModelBuilderKotlin(state));
    }
    if (!els.modelBuilderList) return;
    els.modelBuilderList.innerHTML = "";

    if (!steps.length) {
        const empty = document.createElement("div");
        empty.className = "model-builder-empty";
        empty.textContent = "还没有形体。选择类型后点击“添加形体”。";
        els.modelBuilderList.appendChild(empty);
        return;
    }

    for (const step of steps) {
        const item = document.createElement("div");
        item.className = "model-builder-item";

        const head = document.createElement("div");
        head.className = "model-builder-row head";
        const inpName = document.createElement("input");
        inpName.className = "input";
        inpName.value = String(step.name || "");
        inpName.placeholder = "shape name";
        inpName.addEventListener("change", () => {
            patchModelBuilderStep(step.id, (target) => {
                target.name = String(inpName.value || "").trim() || target.name;
            }, { forceCompile: false });
        });

        const selKind = document.createElement("select");
        selKind.className = "input";
        for (const kind of MODEL_BUILDER_KINDS) {
            const opt = document.createElement("option");
            opt.value = kind;
            opt.textContent = MODEL_BUILDER_LABELS[kind] || kind;
            if (kind === normalizeModelBuilderKind(step.kind)) opt.selected = true;
            selKind.appendChild(opt);
        }
        selKind.addEventListener("change", () => {
            patchModelBuilderStep(step.id, (target) => {
                target.kind = normalizeModelBuilderKind(selKind.value);
            });
        });

        const btnDelete = document.createElement("button");
        btnDelete.type = "button";
        btnDelete.className = "btn small danger";
        btnDelete.textContent = "删除";
        btnDelete.addEventListener("click", () => {
            store.patch((draft) => {
                const builderDraft = ensureDraftModelBuilder(draft);
                builderDraft.steps = builderDraft.steps.filter((item) => String(item?.id || "") !== String(step.id));
            }, { reason: "model-builder-delete", forceCompile: true, forceKotlin: true });
        });

        head.appendChild(inpName);
        head.appendChild(selKind);
        head.appendChild(btnDelete);
        item.appendChild(head);

        const shapeRow = document.createElement("div");
        shapeRow.className = "model-builder-row";
        for (const [key, label] of modelBuilderStepFields(step.kind)) {
            shapeRow.appendChild(createModelBuilderNumberField(step, key, label));
        }
        item.appendChild(shapeRow);

        const positionRow = document.createElement("div");
        positionRow.className = "model-builder-row";
        positionRow.appendChild(createModelBuilderNumberField(step, "x", "X"));
        positionRow.appendChild(createModelBuilderNumberField(step, "y", "Y"));
        positionRow.appendChild(createModelBuilderNumberField(step, "z", "Z"));
        item.appendChild(positionRow);

        const rotationRow = document.createElement("div");
        rotationRow.className = "model-builder-row";
        rotationRow.appendChild(createModelBuilderNumberField(step, "rotX", "旋转 X"));
        rotationRow.appendChild(createModelBuilderNumberField(step, "rotY", "旋转 Y"));
        rotationRow.appendChild(createModelBuilderNumberField(step, "rotZ", "旋转 Z"));
        item.appendChild(rotationRow);

        const scaleRow = document.createElement("div");
        scaleRow.className = "model-builder-row";
        scaleRow.appendChild(createModelBuilderNumberField(step, "scaleX", "缩放 X"));
        scaleRow.appendChild(createModelBuilderNumberField(step, "scaleY", "缩放 Y"));
        scaleRow.appendChild(createModelBuilderNumberField(step, "scaleZ", "缩放 Z"));
        item.appendChild(scaleRow);

        const colorRow = document.createElement("div");
        colorRow.className = "model-builder-row";
        colorRow.appendChild(createModelBuilderTextField(step, "color", "颜色 RGBA", "1,1,1,1"));
        item.appendChild(colorRow);

        els.modelBuilderList.appendChild(item);
    }
}

function refreshEditorCompletions(state) {
    const modelUniforms = buildUniformCompletions(state?.model?.shader?.params || []);
    const node = findPostNode(state, state.selectedNodeId);
    const nodeUniforms = buildUniformCompletions(node?.params || []);

    const modelCompletions = mergeCompletionGroups(BASE_GLSL_COMPLETIONS, modelUniforms, [
        { label: "vUv", insertText: "vUv", detail: "全局变量：插值 UV", priority: 220 },
        { label: "vNormal", insertText: "vNormal", detail: "全局变量：插值法线", priority: 220 },
        { label: "vWorldPos", insertText: "vWorldPos", detail: "全局变量：插值世界坐标", priority: 220 },
        { label: "position", insertText: "position", detail: "全局变量：顶点属性", priority: 220 },
        { label: "normal", insertText: "normal", detail: "全局变量：顶点属性", priority: 220 },
        { label: "uv", insertText: "uv", detail: "全局变量：顶点属性", priority: 220 }
    ]);

    const postCompletions = mergeCompletionGroups(BASE_GLSL_COMPLETIONS, nodeUniforms, [
        { label: "tDiffuse", insertText: "tDiffuse", detail: "全局变量：后处理输入纹理", priority: 220 },
        { label: "vUv", insertText: "vUv", detail: "全局变量：插值 UV", priority: 220 }
    ]);

    modelVertexEditor.setCompletions(modelCompletions);
    modelFragmentEditor.setCompletions(modelCompletions);
    nodeFragmentEditor.setCompletions(postCompletions);
}

function renderTextureList(state) {
    const host = els.textureList;
    if (!host) return;
    host.innerHTML = "";

    const textures = Array.isArray(state?.textures) ? state.textures : [];
    if (!textures.length) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.style.padding = "10px";
        empty.textContent = "暂无纹理，可上传 PNG/JPG 后在参数中引用。";
        host.appendChild(empty);
        return;
    }

    for (const tex of textures) {
        const row = document.createElement("div");
        row.className = "list-item";

        const meta = document.createElement("div");
        meta.className = "meta";

        const inpName = document.createElement("input");
        inpName.className = "input";
        inpName.value = sanitizeTextureNameForKotlin(tex.name || `texture_${tex.id}`);
        inpName.placeholder = "纹理名称 (Kotlin 标识符)";
        inpName.addEventListener("change", () => {
            const nextName = sanitizeTextureNameForKotlin(inpName.value, `texture_${tex.id}`);
            inpName.value = nextName;
            store.patch((draft) => {
                const target = (draft.textures || []).find((t) => t.id === tex.id);
                if (!target) return;
                target.name = nextName;
            }, { reason: "texture-rename", forceKotlin: true });
        });

        const idHint = document.createElement("div");
        idHint.className = "hint";
        idHint.textContent = `编号: ${tex.id}`;

        meta.appendChild(inpName);
        meta.appendChild(idHint);

        const actions = document.createElement("div");
        actions.className = "field-inline";

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn small danger";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            store.patch((draft) => {
                draft.textures = (draft.textures || []).filter((t) => t.id !== tex.id);
                const clearRef = (params) => {
                    for (const p of params || []) {
                        if (p?.type === "texture" && p?.textureId === tex.id) p.textureId = "";
                    }
                };
                clearRef(draft.model?.shader?.params);
                for (const n of draft.post?.nodes || []) clearRef(n.params);
            }, { reason: "texture-delete", forceCompile: true, forceKotlin: true });
        });

        actions.appendChild(btnDel);
        row.appendChild(meta);
        row.appendChild(actions);
        host.appendChild(row);
    }
}

function createTypeSelect(current) {
    const sel = document.createElement("select");
    sel.className = "input";
    const options = ["float", "int", "bool", "vec2", "vec3", "texture"];
    for (const t of options) {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (t === current) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

function createSourceSelect(current) {
    const sel = document.createElement("select");
    sel.className = "input";
    const options = [
        { value: "value", label: "数值" },
        { value: "upload", label: "上传纹理" },
        { value: "connection", label: "纹理连接" }
    ];
    for (const item of options) {
        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.label;
        if (item.value === current) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

function createValueSourceSelect(current) {
    const sel = document.createElement("select");
    sel.className = "input";
    const options = [
        { value: "value", label: "常量" },
        { value: "uniform", label: "变量" }
    ];
    for (const item of options) {
        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.label;
        if (item.value === current) opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}

const UNIFORM_EXPR_OPTIONS_BY_TYPE = Object.freeze({
    float: ["uTime", "tickDelta", "partialTicks"],
    int: ["Math.round(tickDelta)", "Math.round(partialTicks)", "0"],
    bool: ["true", "false"],
    vec2: ["uResolution", "uMouse", "org.joml.Vector2f(uTime, uTime)"],
    vec3: ["CameraPos", "org.joml.Vector3f(1f, 1f, 1f)"]
});

function uniformExprOptionsByType(type) {
    const t = String(type || "float").toLowerCase();
    const base = UNIFORM_EXPR_OPTIONS_BY_TYPE[t] || UNIFORM_EXPR_OPTIONS_BY_TYPE.float;
    return Array.from(new Set(base.map((it) => String(it || "").trim()).filter(Boolean)));
}

function defaultUniformExprByType(type) {
    const list = uniformExprOptionsByType(type);
    return list[0] || "uTime";
}

function populateUniformExprSelect(selectEl, type, currentValue = "") {
    if (!(selectEl instanceof HTMLSelectElement)) return;
    const current = String(currentValue || "").trim();
    const options = uniformExprOptionsByType(type);
    if (current && !options.includes(current)) options.unshift(current);
    selectEl.innerHTML = "";
    for (const expr of options) {
        const opt = document.createElement("option");
        opt.value = expr;
        opt.textContent = expr;
        if (expr === current) opt.selected = true;
        selectEl.appendChild(opt);
    }
    if (!selectEl.value && options.length) selectEl.value = options[0];
}

function renderParamList({
    container,
    params,
    textures,
    step,
    onPatch,
    onDelete,
    lockParamPredicate = null,
    forceTextureUploadOnly = false,
    forceTextureConnectionOnly = false
}) {
    if (!container) return;
    container.innerHTML = "";

    const normalizeParamType = (raw) => String(raw || "float").toLowerCase();
    const placeholderForType = (type) => {
        const t = normalizeParamType(type);
        if (t === "vec3") return "x,y,z";
        if (t === "vec2") return "x,y";
        if (t === "bool") return "true/false";
        if (t === "texture") return "采样槽位";
        return `步长 ${step}`;
    };

    for (let i = 0; i < params.length; i++) {
        const p = params[i] || {};
        const type = normalizeParamType(p.type);
        const isTextureType = type === "texture";
        const textureUploadOnly = isTextureType && !!forceTextureUploadOnly;
        const textureConnectionOnly = isTextureType && !textureUploadOnly && !!forceTextureConnectionOnly;
        const lockDeleteAndType = typeof lockParamPredicate === "function" ? !!lockParamPredicate(p, i) : false;

        const item = document.createElement("div");
        item.className = "param-item";

        const rowMain = document.createElement("div");
        rowMain.className = "param-row";

        const inpName = document.createElement("input");
        inpName.className = "input";
        inpName.placeholder = "参数名";
        inpName.value = String(p.name || "");

        const selType = createTypeSelect(type);

        const btnDelete = document.createElement("button");
        btnDelete.type = "button";
        btnDelete.className = "btn small danger";
        btnDelete.textContent = "删";
        if (lockDeleteAndType) {
            btnDelete.disabled = true;
            btnDelete.title = "至少要保留输入数量对应的 texture 参数";
        }

        if (lockDeleteAndType) selType.disabled = true;

        rowMain.appendChild(inpName);
        rowMain.appendChild(selType);

        if (isTextureType) {
            rowMain.style.gridTemplateColumns = "1fr 1fr auto";
            rowMain.appendChild(btnDelete);
            if (textureUploadOnly) rowMain.classList.add("hidden");
            item.appendChild(rowMain);

            const rowTex = document.createElement("div");
            rowTex.className = "param-row";
            rowTex.style.gridTemplateColumns = (textureUploadOnly || textureConnectionOnly) ? "1fr" : "1fr 2fr";

            const selSource = createSourceSelect(
                textureUploadOnly
                    ? "upload"
                    : (textureConnectionOnly ? "connection" : String(p.sourceType || "value"))
            );
            if (textureUploadOnly || textureConnectionOnly) {
                selSource.disabled = true;
                selSource.classList.add("hidden");
            }
            const sourceInputHost = document.createElement("div");
            sourceInputHost.style.display = "grid";
            sourceInputHost.style.gridTemplateColumns = "1fr";

            const inpSlot = document.createElement("input");
            inpSlot.className = "input";
            inpSlot.placeholder = textureConnectionOnly ? "input slot N" : "采样槽位";
            if (textureConnectionOnly) inpSlot.title = "输入卡片输入的端口号（input slot N）";
            inpSlot.value = String(p.value ?? "0");

            const selTexture = document.createElement("select");
            selTexture.className = "input";
            const noneOpt = document.createElement("option");
            noneOpt.value = "";
            noneOpt.textContent = "选择纹理";
            selTexture.appendChild(noneOpt);
            for (const tex of textures) {
                const opt = document.createElement("option");
                opt.value = tex.id;
                opt.textContent = `${tex.name} (${tex.id})`;
                if (tex.id === p.textureId) opt.selected = true;
                selTexture.appendChild(opt);
            }

            const inpConn = document.createElement("input");
            inpConn.className = "input";
            inpConn.placeholder = "连接来源，例如 bloom:0";
            inpConn.value = String(p.connection || "");

            const updateTextureVis = () => {
                const sourceType = textureUploadOnly
                    ? "upload"
                    : (textureConnectionOnly ? "connection" : String(selSource.value || "value"));
                const showSlot = textureConnectionOnly ? true : sourceType === "value";
                inpSlot.classList.toggle("hidden", !showSlot);
                selTexture.classList.toggle("hidden", sourceType !== "upload");
                inpConn.classList.toggle("hidden", textureConnectionOnly || sourceType !== "connection");
            };
            updateTextureVis();

            sourceInputHost.appendChild(inpSlot);
            sourceInputHost.appendChild(selTexture);
            sourceInputHost.appendChild(inpConn);
            rowTex.appendChild(selSource);
            rowTex.appendChild(sourceInputHost);
            item.appendChild(rowTex);

            selSource.addEventListener("change", () => {
                updateTextureVis();
                onPatch(i, (param) => {
                    const sourceType = textureUploadOnly
                        ? "upload"
                        : (textureConnectionOnly ? "connection" : String(selSource.value || "value"));
                    param.sourceType = sourceType;
                    if (sourceType === "value") {
                        param.textureId = "";
                        param.connection = "";
                    } else if (sourceType === "upload") {
                        param.connection = "";
                    } else if (sourceType === "connection") {
                        param.textureId = "";
                        if (textureConnectionOnly) param.connection = "";
                    }
                });
            });

            inpSlot.addEventListener("change", () => {
                onPatch(i, (param) => {
                    const next = String(inpSlot.value || "").trim();
                    param.value = next || "0";
                });
            });

            selTexture.addEventListener("change", () => {
                onPatch(i, (param) => {
                    if (textureUploadOnly) {
                        param.sourceType = "upload";
                        param.connection = "";
                        param.valueSource = "value";
                        param.valueExpr = "";
                    }
                    param.textureId = selTexture.value;
                });
            });

            inpConn.addEventListener("change", () => {
                onPatch(i, (param) => {
                    param.connection = inpConn.value.trim();
                });
            });
        } else {
            const inpValue = document.createElement("input");
            inpValue.className = "input";
            inpValue.value = String(p.value ?? "");
            inpValue.placeholder = placeholderForType(type);

            rowMain.appendChild(inpValue);
            rowMain.appendChild(btnDelete);
            item.appendChild(rowMain);

            const rowValueSource = document.createElement("div");
            rowValueSource.className = "param-row";
            rowValueSource.style.gridTemplateColumns = "1fr 2fr";

            const selValueSource = createValueSourceSelect(String(p.valueSource || "value"));
            const selExpr = document.createElement("select");
            selExpr.className = "input";
            populateUniformExprSelect(selExpr, type, String(p.valueExpr || defaultUniformExprByType(type)));

            const updateMode = () => {
                const currentType = normalizeParamType(selType.value);
                const useExpr = currentType !== "texture" && selValueSource.value === "uniform";
                rowMain.style.gridTemplateColumns = useExpr ? "1fr 1fr auto" : "1fr 1fr 1fr auto";
                rowValueSource.style.gridTemplateColumns = useExpr ? "1fr 2fr" : "1fr";
                inpValue.classList.toggle("hidden", useExpr);
                selExpr.classList.toggle("hidden", !useExpr);
                selExpr.disabled = !useExpr;
                inpValue.disabled = useExpr;
                if (useExpr && !String(selExpr.value || "").trim()) {
                    populateUniformExprSelect(selExpr, currentType, defaultUniformExprByType(currentType));
                }
            };
            updateMode();

            rowValueSource.appendChild(selValueSource);
            rowValueSource.appendChild(selExpr);
            item.appendChild(rowValueSource);

            selValueSource.addEventListener("change", () => {
                updateMode();
                onPatch(i, (param) => {
                    param.valueSource = selValueSource.value;
                    if (param.valueSource === "uniform" && !String(param.valueExpr || "").trim()) {
                        param.valueExpr = String(selExpr.value || defaultUniformExprByType(param.type));
                    }
                });
            });

            selExpr.addEventListener("change", () => {
                onPatch(i, (param) => {
                    param.valueSource = "uniform";
                    param.valueExpr = String(selExpr.value || "").trim();
                });
            });

            inpValue.addEventListener("change", () => {
                onPatch(i, (param) => {
                    const next = String(inpValue.value || "").trim();
                    param.value = next;
                });
            });
        }

        if (!textureUploadOnly) {
            inpName.addEventListener("change", () => {
                onPatch(i, (param) => {
                    param.name = inpName.value.trim();
                });
            });
        }

        if (!lockDeleteAndType && !textureUploadOnly) {
            selType.addEventListener("change", () => {
                onPatch(i, (param) => {
                    const nextType = normalizeParamType(selType.value);
                    param.type = nextType;
                    if (nextType !== "texture") {
                        param.sourceType = "value";
                        param.textureId = "";
                        param.connection = "";
                        param.valueSource = param.valueSource || "value";
                        if (param.valueSource === "uniform" && !String(param.valueExpr || "").trim()) {
                            param.valueExpr = defaultUniformExprByType(nextType);
                        } else {
                            param.valueExpr = String(param.valueExpr || "");
                        }
                    } else {
                        param.sourceType = forceTextureUploadOnly
                            ? "upload"
                            : (forceTextureConnectionOnly ? "connection" : (param.sourceType || "value"));
                        param.valueSource = "value";
                        param.valueExpr = "";
                        if (forceTextureConnectionOnly) {
                            param.textureId = "";
                            param.connection = "";
                        }
                        if (!String(param.value || "").trim()) param.value = "0";
                    }
                });
            });

            btnDelete.addEventListener("click", () => onDelete(i));
        }

        container.appendChild(item);
    }
}

function renderModelParamList(state) {
    renderParamList({
        container: els.modelParamList,
        params: state.model?.shader?.params || [],
        textures: state.textures || [],
        step: state.settings?.paramStep || 0.1,
        onPatch(index, mutator) {
            store.patch((draft) => {
                const oldNames = (draft.model?.shader?.params || []).map((it) => String(it?.name || "").trim());
                const p = draft.model?.shader?.params?.[index];
                if (!p) return;
                const prevName = String(p.name || "").trim();
                const prevType = String(p.type || "").toLowerCase();
                mutator(p);
                const nextName = String(p.name || "").trim();
                if (prevName && nextName && prevName !== nextName) {
                    draft.model.shader.fragmentSource = applyParamRenameInShaderSource(
                        draft.model.shader.fragmentSource,
                        prevName,
                        nextName,
                        String(p.type || prevType).toLowerCase()
                    );
                }
                syncModelShaderUniformDecls(draft, oldNames);
            }, { reason: "model-param-change", forceCompile: true, forceKotlin: true });
        },
        onDelete(index) {
            store.patch((draft) => {
                const oldNames = (draft.model?.shader?.params || []).map((it) => String(it?.name || "").trim());
                draft.model.shader.params.splice(index, 1);
                syncModelShaderUniformDecls(draft, oldNames);
            }, { reason: "model-param-delete", forceCompile: true, forceKotlin: true });
        }
    });
}

function renderNodeParamList(state, node) {
    const nodeParams = node?.params || [];
    const minTextureCount = getPostInputTextureMinCount(node?.inputs);
    const textureCount = countTextureParams(nodeParams);
    const isTextureNode = normalizePostNodeType(node?.type) === NODE_TYPE_TEXTURE;

    renderParamList({
        container: els.nodeParamList,
        params: nodeParams,
        textures: state.textures || [],
        step: state.settings?.paramStep || 0.1,
        forceTextureUploadOnly: isTextureNode,
        forceTextureConnectionOnly: !isTextureNode,
        lockParamPredicate: (param) => isTextureParam(param) && textureCount <= minTextureCount,
        onPatch(index, mutator) {
            store.patch((draft) => {
                const n = findPostNode(draft, draft.selectedNodeId);
                if (!n || !Array.isArray(n.params)) return;
                const oldNames = n.params.map((it) => String(it?.name || "").trim());
                const p = n.params[index];
                if (!p) return;
                const prevName = String(p.name || "").trim();
                const prevType = String(p.type || "").toLowerCase();
                mutator(p);
                const nextName = String(p.name || "").trim();
                if (prevName && nextName && prevName !== nextName) {
                    n.fragmentSource = applyParamRenameInShaderSource(
                        n.fragmentSource,
                        prevName,
                        nextName,
                        String(p.type || prevType).toLowerCase()
                    );
                }
                if (normalizePostNodeType(n.type) === NODE_TYPE_TEXTURE) {
                    enforceTextureNodeUploadOnly(n);
                } else {
                    n.params = ensurePostInputSamplerParam(n.params, getPostInputTextureMinCount(n.inputs));
                }
                syncNodeShaderUniformDecls(n, oldNames);
            }, { reason: "node-param-change", forceCompile: true, forceKotlin: true });
        },
        onDelete(index) {
            store.patch((draft) => {
                const n = findPostNode(draft, draft.selectedNodeId);
                if (!n) return;
                const oldNames = (n.params || []).map((it) => String(it?.name || "").trim());
                n.params.splice(index, 1);
                if (normalizePostNodeType(n.type) === NODE_TYPE_TEXTURE) {
                    enforceTextureNodeUploadOnly(n);
                } else {
                    n.params = ensurePostInputSamplerParam(n.params, getPostInputTextureMinCount(n.inputs));
                }
                syncNodeShaderUniformDecls(n, oldNames);
            }, { reason: "node-param-delete", forceCompile: true, forceKotlin: true });
        }
    });
}

function refreshNodeEditorPanel(state) {
    const node = findPostNode(state, state.selectedNodeId);

    if (!node) {
        if (els.nodeEditorEmpty) {
            els.nodeEditorEmpty.innerHTML = "";

            const info = document.createElement("div");
            info.textContent = "当前没有可编辑的后处理卡片，请先在左侧添加一个卡片。";

            const quickAdd = document.createElement("button");
            quickAdd.type = "button";
            quickAdd.className = "btn small";
            quickAdd.style.marginTop = "8px";
            quickAdd.textContent = "创建后处理卡片";
            quickAdd.addEventListener("click", () => addPostNode({ askType: true }));

            els.nodeEditorEmpty.appendChild(info);
            els.nodeEditorEmpty.appendChild(quickAdd);
        }
        els.nodeEditorEmpty?.classList.remove("hidden");
        els.nodeEditor?.classList.add("hidden");
        els.nodeTextureHint?.classList.add("hidden");
        if (els.btnDuplicateNode) {
            els.btnDuplicateNode.disabled = true;
            els.btnDuplicateNode.title = "";
        }
        nodeFragmentEditor.setValue("", { silent: true });
        return;
    }

    if (els.nodeEditorEmpty && !els.nodeEditorEmpty.dataset.defaultText) {
        els.nodeEditorEmpty.dataset.defaultText = "在左侧后处理图中选择一个卡片进行编辑。";
    }
    if (els.nodeEditorEmpty?.dataset.defaultText) {
        els.nodeEditorEmpty.textContent = els.nodeEditorEmpty.dataset.defaultText;
    }

    els.nodeEditorEmpty?.classList.add("hidden");
    els.nodeEditor?.classList.remove("hidden");

    const nodeType = normalizePostNodeType(node.type);
    const minInputs = minInputCountByNodeType(nodeType);
    const isTextureNode = nodeType === NODE_TYPE_TEXTURE;
    const isPingPongNode = nodeType === NODE_TYPE_PINGPONG;
    const toggleControlFieldHidden = (controlEl, hidden) => {
        if (!(controlEl instanceof HTMLElement)) return;
        const field = controlEl.closest(".field, .chk");
        if (field) field.classList.toggle("hidden", !!hidden);
    };

    if (els.nodeShaderSection) {
        els.nodeShaderSection.classList.toggle("hidden", isTextureNode);
    }
    if (els.nodeTextureHint) {
        els.nodeTextureHint.classList.toggle("hidden", !isTextureNode);
    }
    if (els.inpNodeFragmentPath) {
        els.inpNodeFragmentPath.disabled = isTextureNode;
    }
    if (els.btnUploadNodeFragment) {
        els.btnUploadNodeFragment.disabled = isTextureNode;
    }
    if (els.btnApplyNodeShader) {
        els.btnApplyNodeShader.disabled = isTextureNode;
    }
    if (els.btnExportNodeFragment) {
        els.btnExportNodeFragment.disabled = isTextureNode;
    }
    if (els.btnAddNodeParam) {
        els.btnAddNodeParam.disabled = isTextureNode;
        els.btnAddNodeParam.classList.toggle("hidden", isTextureNode);
        els.btnAddNodeParam.title = isTextureNode
            ? "texture 节点固定为纹理输入参数"
            : "";
    }
    if (els.btnDuplicateNode) {
        els.btnDuplicateNode.disabled = false;
        els.btnDuplicateNode.title = "";
    }

    setInputValue(els.inpNodeName, node.name || "");
    setInputValue(els.inpNodeFragmentPath, node.fragmentPath || "");
    setInputValue(els.inpNodeInputs, normalizeNodeNumber(node.inputs, isTextureNode ? 0 : 1, minInputs, 8));
    setInputValue(els.inpNodeOutputs, normalizeNodeNumber(node.outputs, 1, 1, 8));
    setInputValue(els.inpNodeTextureUnit, Number(node.textureUnit || 1));
    setInputValue(els.inpNodeIterations, Number(node.iterations || 1));

    if (els.inpNodeInputs) {
        els.inpNodeInputs.min = String(minInputs);
        els.inpNodeInputs.disabled = isTextureNode;
    }
    if (els.inpNodeOutputs) {
        els.inpNodeOutputs.min = "1";
        els.inpNodeOutputs.readOnly = true;
        els.inpNodeOutputs.disabled = true;
        els.inpNodeOutputs.title = formatNodeOutputHint(node);
    }
    if (els.nodeOutputHint) {
        els.nodeOutputHint.textContent = formatNodeOutputHint(node);
    }
    if (els.inpNodeIterations) {
        els.inpNodeIterations.disabled = !isPingPongNode;
        els.inpNodeIterations.title = isPingPongNode ? "PingPong 迭代次数" : "仅 pingpong 类型可编辑";
    }
    if (els.inpNodeTextureUnit) {
        els.inpNodeTextureUnit.disabled = isTextureNode;
    }
    toggleControlFieldHidden(els.inpNodeInputs, isTextureNode);
    toggleControlFieldHidden(els.inpNodeOutputs, isTextureNode);
    toggleControlFieldHidden(els.inpNodeTextureUnit, isTextureNode);
    toggleControlFieldHidden(els.selNodeFilter, isTextureNode);
    toggleControlFieldHidden(els.inpNodeIterations, isTextureNode);
    toggleControlFieldHidden(els.chkNodeMipmap, isTextureNode);

    if (els.selNodeType && els.selNodeType.value !== String(node.type || "simple")) {
        els.selNodeType.value = String(node.type || "simple");
    }
    if (els.selNodeFilter && els.selNodeFilter.value !== String(node.filter || "GL33.GL_LINEAR")) {
        els.selNodeFilter.value = String(node.filter || "GL33.GL_LINEAR");
    }
    if (els.selNodeFilter) {
        els.selNodeFilter.disabled = isTextureNode;
    }
    setChecked(els.chkNodeMipmap, !!node.useMipmap);

    nodeFragmentEditor.setValue(String(node.fragmentSource || ""), { silent: true });

    renderNodeParamList(state, node);
}

function refreshModelEditorPanel(state) {
    setInputValue(els.inpModelVertexPath, state.model?.shader?.vertexPath || "");
    setInputValue(els.inpModelFragmentPath, state.model?.shader?.fragmentPath || "");
    modelVertexEditor.setValue(String(state.model?.shader?.vertexSource || ""), { silent: true });
    modelFragmentEditor.setValue(String(state.model?.shader?.fragmentSource || ""), { silent: true });
    renderModelParamList(state);
    renderModelBuilder(state);
}

function refreshTopPanel(state) {
    setInputValue(els.inpProjectName, state.projectName || "shader-workbench");
    if (els.selPrimitive && els.selPrimitive.value !== String(state.model?.primitive || "sphere")) {
        els.selPrimitive.value = String(state.model?.primitive || "sphere");
    }
    setChecked(els.chkEnablePost, !!state.model?.enablePost);

    if (els.modelFileName) {
        if (hasCustomModelLoaded && state.model?.uploadedModelName) {
            els.modelFileName.textContent = `当前模型：${state.model.uploadedModelName}`;
        } else if (state.model?.uploadedModelName) {
            els.modelFileName.textContent = `模型记录：${state.model.uploadedModelName}（刷新后需重新上传）`;
        } else {
            els.modelFileName.textContent = "当前模型：默认球体";
        }
    }
    if (els.statusControls) {
        const mode = String(state.settings?.previewControlMode || "default").toLowerCase();
        els.statusControls.textContent = mode === "touch"
            ? "操作：滚轮旋转 / 左键上下远近 / 右键平移 / 方向键平移"
            : "操作：中键旋转 / 右键平移 / 滚轮缩放 / 方向键平移";
    }
}

function refreshKotlin(force, target = "all") {
    const state = store.getState();
    if (!force && !state.settings?.realtimeCode) return;
    const safeTarget = normalizeKotlinGenerateTarget(target);
    if (safeTarget === "all" || safeTarget === "model") {
        modelKotlinCache = generateModelKotlin(state);
        if (els.modelKotlinOut) els.modelKotlinOut.innerHTML = highlightKotlin(modelKotlinCache);
    }
    if (safeTarget === "all" || safeTarget === "post") {
        postKotlinCache = generatePostKotlin(state);
        if (els.postKotlinOut) els.postKotlinOut.innerHTML = highlightKotlin(postKotlinCache);
    }
}

function applyKotlinCollapsedState() {
    if (els.kotlinBody) els.kotlinBody.classList.toggle("hidden", kotlinCollapsed);
    if (els.btnToggleKotlin) els.btnToggleKotlin.textContent = kotlinCollapsed ? "显示" : "隐藏";
}

function generateKotlinNow(target = kotlinGenerateTarget) {
    const safeTarget = normalizeKotlinGenerateTarget(target);
    refreshKotlin(true, safeTarget);
    if (safeTarget === "model") {
        showToast("模型 Kotlin 已重新生成", "ok");
    } else if (safeTarget === "post") {
        showToast("后处理 Kotlin 已重新生成", "ok");
    } else {
        showToast("模型 + 后处理 Kotlin 已重新生成", "ok");
    }
}

function syncRendererNow() {
    try {
        renderer.syncFromState(store.getState());
    } catch (err) {
        console.error(err);
        setStatus({ shader: "着色器：编译错误" });
        showToast(`渲染更新失败: ${err?.message || err}`, "err", 3400);
    }
}

syncRendererDebounced = debounce(syncRendererNow, 120);

function requestRendererSync({ force = false, now = false } = {}) {
    const state = store.getState();
    if (!force && !state.settings?.realtimeCompile) return;
    if (now || force) {
        syncRendererNow();
    } else {
        syncRendererDebounced();
    }
}

function syncAllPostNodesFromShaderSource(draft) {
    let changed = false;
    for (const node of draft?.post?.nodes || []) {
        if (syncNodeParamsFromShaderSource(node)) changed = true;
    }
    return changed;
}

const saveProjectDebounced = debounce(() => {
    const payload = normalizeProjectPayload(store.getState());
    saveJson(STORAGE_KEYS.project, payload);
}, 180);

function applyStateToUI(state, meta = {}) {
    refreshTopPanel(state);

    if (!meta.silentUI) {
        refreshModelEditorPanel(state);
        refreshNodeEditorPanel(state);
        refreshEditorCompletions(state);
        renderTextureList(state);
        graphEditor.render();
    } else if (meta.reason === "model-fragment-source") {
        renderModelParamList(state);
        refreshEditorCompletions(state);
    } else if (meta.reason === "node-fragment-source") {
        const node = findPostNode(state, state.selectedNodeId);
        renderNodeParamList(state, node);
        setInputValue(els.inpNodeOutputs, normalizeNodeNumber(node?.outputs, 1, 1, 8));
        if (els.inpNodeOutputs) els.inpNodeOutputs.title = formatNodeOutputHint(node);
        if (els.nodeOutputHint) els.nodeOutputHint.textContent = formatNodeOutputHint(node);
        refreshEditorCompletions(state);
        graphEditor.render();
    }

    refreshKotlin(!!meta.forceKotlin);
    refreshUndoRedoButtons();
}

store.subscribe((state, meta = {}) => {
    applyStateToUI(state, meta);
    saveProjectDebounced();
    requestRendererSync({ force: !!meta.forceCompile, now: !!meta.forceCompileNow });
});

function bindProjectEvents() {
    els.btnExportAll?.addEventListener("click", async () => {
        try {
            await exportAllBundle();
            showToast("一键导出完成", "ok");
        } catch (err) {
            console.error(err);
            showToast(`一键导出失败: ${err?.message || err}`, "err");
        }
    });

    els.inpProjectName?.addEventListener("change", () => {
        const value = sanitizeProjectName(els.inpProjectName.value);
        store.patch((draft) => {
            draft.projectName = value;
        }, { reason: "project-name" });
    });

    els.btnExportProject?.addEventListener("click", () => {
        exportProjectJson(store.getState());
    });

    els.btnImportProject?.addEventListener("click", () => {
        els.fileProject?.click();
    });

    els.fileProject?.addEventListener("change", async () => {
        const file = els.fileProject.files?.[0];
        els.fileProject.value = "";
        if (!file) return;
        try {
            const payload = await importProjectFromFile(file);
            hasCustomModelLoaded = false;
            renderer.setPrimitive(payload.model?.primitive || "sphere");
            store.reset(payload, { reason: "project-import", forceCompile: true, forceCompileNow: true, forceKotlin: true, clearHistory: true });
            store.patch((draft) => {
                syncAllPostNodesFromShaderSource(draft);
            }, { reason: "project-import-node-sync", skipHistory: true, forceCompile: true, forceCompileNow: true, forceKotlin: true });
            settingsSystem.applySettings(payload.settings || {});
            showToast("项目已导入", "ok");
        } catch (err) {
            console.error(err);
            showToast(`导入失败: ${err?.message || err}`, "err", 3400);
        }
    });

    els.btnResetProject?.addEventListener("click", () => {
        const ok = confirm("确认重置当前项目？未导出的改动会丢失。");
        if (!ok) return;
        const next = createDefaultState();
        hasCustomModelLoaded = false;
        renderer.setPrimitive(next.model.primitive);
        store.reset(next, { reason: "project-reset", forceCompile: true, forceCompileNow: true, forceKotlin: true, clearHistory: true });
        store.patch((draft) => {
            syncAllPostNodesFromShaderSource(draft);
        }, { reason: "project-reset-node-sync", skipHistory: true, forceCompile: true, forceCompileNow: true, forceKotlin: true });
        settingsSystem.applySettings(next.settings || {});
        showToast("已重置项目", "ok");
    });
}

function bindModelEvents() {
    els.selPrimitive?.addEventListener("change", () => {
        const primitive = String(els.selPrimitive.value || "sphere");
        hasCustomModelLoaded = false;
        renderer.setPrimitive(primitive);
        store.patch((draft) => {
            draft.model.primitive = primitive;
            draft.model.uploadedModelName = "";
        }, { reason: "model-primitive", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.chkEnablePost?.addEventListener("change", () => {
        const enabled = !!els.chkEnablePost.checked;
        store.patch((draft) => {
            draft.model.enablePost = enabled;
        }, { reason: "model-enable-post", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.chkUseModelBuilder?.addEventListener("change", () => {
        const enabled = !!els.chkUseModelBuilder.checked;
        store.patch((draft) => {
            const builder = ensureDraftModelBuilder(draft);
            builder.enabled = enabled;
            if (enabled && !builder.steps.length) {
                builder.steps.push(createDefaultModelBuilderStep(0, els.selModelBuilderShape?.value || "box"));
            }
        }, { reason: "model-builder-toggle", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.btnAddModelShape?.addEventListener("click", () => {
        store.patch((draft) => {
            const builder = ensureDraftModelBuilder(draft);
            const kind = normalizeModelBuilderKind(els.selModelBuilderShape?.value || "box");
            builder.steps.push(createDefaultModelBuilderStep(builder.steps.length, kind));
            builder.enabled = true;
        }, { reason: "model-builder-add", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.btnClearModelShapes?.addEventListener("click", () => {
        store.patch((draft) => {
            const builder = ensureDraftModelBuilder(draft);
            builder.steps = [];
            builder.enabled = false;
        }, { reason: "model-builder-clear", forceCompile: true, forceCompileNow: true, forceKotlin: true });
    });

    els.btnCopyModelBuilderKotlin?.addEventListener("click", async () => {
        const text = generateModelBuilderKotlin(store.getState());
        if (els.modelBuilderKotlinOut) els.modelBuilderKotlinOut.innerHTML = highlightKotlin(text);
        try {
            await navigator.clipboard.writeText(text);
            showToast("建模 Kotlin 已复制", "ok");
        } catch {
            showToast("复制失败，请手动复制", "err");
        }
    });

    els.btnDownloadModelBuilderKotlin?.addEventListener("click", () => {
        const state = store.getState();
        const text = generateModelBuilderKotlin(state);
        if (els.modelBuilderKotlinOut) els.modelBuilderKotlinOut.innerHTML = highlightKotlin(text);
        downloadText(`${sanitizeProjectName(state.projectName || "shader-workbench")}_model_builder.kt.txt`, text);
    });

    els.btnUploadModel?.addEventListener("click", () => {
        els.fileModel?.click();
    });

    els.fileModel?.addEventListener("change", async () => {
        const file = els.fileModel.files?.[0];
        els.fileModel.value = "";
        if (!file) return;
        try {
            const name = await renderer.loadModelFile(file);
            hasCustomModelLoaded = true;
            store.patch((draft) => {
                draft.model.uploadedModelName = name;
            }, { reason: "model-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
            showToast(`模型已加载 ${name}`, "ok");
        } catch (err) {
            console.error(err);
            showToast(`模型加载失败: ${err?.message || err}`, "err", 3500);
        }
    });

    els.inpModelVertexPath?.addEventListener("change", () => {
        store.patch((draft) => {
            draft.model.shader.vertexPath = String(els.inpModelVertexPath.value || "").trim();
        }, { reason: "model-vertex-path", forceKotlin: true });
    });

    els.inpModelFragmentPath?.addEventListener("change", () => {
        store.patch((draft) => {
            draft.model.shader.fragmentPath = String(els.inpModelFragmentPath.value || "").trim();
        }, { reason: "model-fragment-path", forceKotlin: true });
    });

    els.btnUploadModelVertex?.addEventListener("click", () => {
        els.fileModelVertex?.click();
    });

    els.btnUploadModelFragment?.addEventListener("click", () => {
        els.fileModelFragment?.click();
    });

    els.fileModelVertex?.addEventListener("change", async () => {
        const file = els.fileModelVertex.files?.[0];
        els.fileModelVertex.value = "";
        if (!file) return;
        const source = await file.text();
        const guessedPath = file.name.endsWith(".vsh") ? file.name : `${file.name}.vsh`;
        store.patch((draft) => {
            draft.model.shader.vertexSource = source;
            if (!draft.model.shader.vertexPath) draft.model.shader.vertexPath = guessedPath;
        }, { reason: "model-vertex-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
        showToast("顶点着色器已导入", "ok");
    });

    els.fileModelFragment?.addEventListener("change", async () => {
        const file = els.fileModelFragment.files?.[0];
        els.fileModelFragment.value = "";
        if (!file) return;
        const source = await file.text();
        const guessedPath = file.name.endsWith(".fsh") ? file.name : `${file.name}.fsh`;
        store.patch((draft) => {
            draft.model.shader.fragmentSource = source;
            if (!draft.model.shader.fragmentPath) draft.model.shader.fragmentPath = guessedPath;
            syncModelParamsFromShaderSource(draft);
        }, { reason: "model-fragment-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
        showToast("片元着色器已导入", "ok");
    });

    els.btnAddModelParam?.addEventListener("click", () => {
        store.patch((draft) => {
            const p = createParamTemplate();
            p.name = `uParam${(draft.model.shader.params.length || 0) + 1}`;
            draft.model.shader.params.push(p);
            syncModelShaderUniformDecls(draft);
        }, { reason: "model-param-add", forceCompile: true, forceKotlin: true });
    });

    els.btnApplyModelShader?.addEventListener("click", () => {
        store.patch((draft) => {
            syncModelShaderUniformDecls(draft);
        }, { reason: "model-uniform-sync", skipHistory: true, forceCompile: true, forceKotlin: true });
        requestRendererSync({ force: true, now: true });
        showToast("模型着色器已应用", "ok");
    });

    els.btnExportModelVertex?.addEventListener("click", () => {
        const state = store.getState();
        const name = fileNameFromPath(state.model.shader.vertexPath, "model.vsh");
        downloadText(name, normalizeShaderForGlsl300Es(state.model.shader.vertexSource, { stage: "vertex" }));
    });

    els.btnExportModelFragment?.addEventListener("click", () => {
        const state = store.getState();
        const name = fileNameFromPath(state.model.shader.fragmentPath, "model.fsh");
        downloadText(name, normalizeShaderForGlsl300Es(state.model.shader.fragmentSource, { stage: "fragment" }));
    });
}

function bindTextureEvents() {
    els.btnUploadTexture?.addEventListener("click", () => {
        els.fileTexture?.click();
    });

    els.fileTexture?.addEventListener("change", async () => {
        const file = els.fileTexture.files?.[0];
        els.fileTexture.value = "";
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataURL(file);
            store.patch((draft) => {
                const textureId = uid("tex");
                draft.textures.push({
                    id: textureId,
                    name: sanitizeTextureNameForKotlin(file.name, `texture_${textureId}`),
                    dataUrl
                });
            }, { reason: "texture-upload", forceCompile: true, forceKotlin: true });
            showToast(`纹理已导入 ${file.name}`, "ok");
        } catch (err) {
            console.error(err);
            showToast(`纹理导入失败: ${err?.message || err}`, "err");
        }
    });
}

function bindNodeTypePickerEvents() {
    const closePicker = () => closeNodeTypePicker({ pickType: null });
    const pickFirst = () => {
        const firstType = nodeTypePickerState.list?.[0];
        if (!firstType) return;
        closeNodeTypePicker({ pickType: firstType });
    };

    els.btnCloseNodeTypePicker?.addEventListener("click", closePicker);
    els.btnCancelNodeTypePicker?.addEventListener("click", closePicker);
    els.nodeTypePickerMask?.addEventListener("click", closePicker);

    els.nodeTypeSearch?.addEventListener("input", () => {
        renderNodeTypePicker(els.nodeTypeSearch.value);
    });

    els.nodeTypeSearch?.addEventListener("keydown", (ev) => {
        if (ev.code === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            closePicker();
            return;
        }
        if (ev.code === "Enter") {
            ev.preventDefault();
            ev.stopPropagation();
            pickFirst();
        }
    });

    els.nodeTypePickerModal?.addEventListener("keydown", (ev) => {
        if (ev.code === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            closePicker();
            return;
        }
        if (ev.code === "Enter" && document.activeElement !== els.nodeTypeSearch) {
            ev.preventDefault();
            ev.stopPropagation();
            pickFirst();
        }
    });
}

function bindNodeEvents() {
    const patchSelectedNode = (mutator, meta = {}) => {
        store.patch((draft) => {
            const node = findPostNode(draft, draft.selectedNodeId);
            if (!node) return;
            mutator(node, draft);
        }, meta);
    };

    els.inpNodeName?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            const prevName = String(node.name || "");
            const nextName = String(els.inpNodeName.value || "").trim() || prevName || "Pass";
            node.name = nextName;
            if (node.fragmentPathTemplate) {
                node.fragmentPath = resolveNodeFragmentPath(nextName, node.fragmentPathTemplate);
            }
        }, { reason: "node-name", forceKotlin: true });
    });

    els.selNodeType?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            switchPostNodeType(node, String(els.selNodeType.value || NODE_TYPE_SIMPLE));
            node.params = ensurePostInputSamplerParam(node.params, getPostInputTextureMinCount(node.inputs));
            syncNodeParamsFromShaderSource(node);
            syncNodeShaderUniformDecls(node);
        }, { reason: "node-type", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeFragmentPath?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            const resolved = resolveNodePathByInput(els.inpNodeFragmentPath.value, node.name || "Pass");
            node.fragmentPathTemplate = resolved.fragmentPathTemplate;
            node.fragmentPath = resolved.fragmentPath;
        }, { reason: "node-fragment-path", forceKotlin: true });
    });

    els.inpNodeInputs?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            const minInputs = minInputCountByNodeType(node.type);
            node.inputs = normalizeNodeNumber(els.inpNodeInputs.value, minInputs, minInputs, 8);
            node.params = ensurePostInputSamplerParam(node.params, getPostInputTextureMinCount(node.inputs));
            syncNodeOutputsFromShaderSource(node);
            syncNodeShaderUniformDecls(node);
        }, { reason: "node-inputs", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeTextureUnit?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.textureUnit = Math.max(0, Number(els.inpNodeTextureUnit.value || 0));
        }, { reason: "node-tex-unit", forceCompile: true, forceKotlin: true });
    });

    els.selNodeFilter?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.filter = String(els.selNodeFilter.value || "GL33.GL_LINEAR");
        }, { reason: "node-filter", forceCompile: true, forceKotlin: true });
    });

    els.inpNodeIterations?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.iterations = Math.max(1, Math.round(Number(els.inpNodeIterations.value || 1)));
        }, { reason: "node-iterations", forceCompile: true, forceKotlin: true });
    });

    els.chkNodeMipmap?.addEventListener("change", () => {
        patchSelectedNode((node) => {
            node.useMipmap = !!els.chkNodeMipmap.checked;
        }, { reason: "node-mipmap", forceCompile: true, forceKotlin: true });
    });

    els.btnUploadNodeFragment?.addEventListener("click", () => {
        els.fileNodeFragment?.click();
    });

    els.fileNodeFragment?.addEventListener("change", async () => {
        const file = els.fileNodeFragment.files?.[0];
        els.fileNodeFragment.value = "";
        if (!file) return;
        const text = await file.text();
        patchSelectedNode((node) => {
            node.fragmentSource = text;
            if (!node.fragmentPath) {
                const resolved = resolveNodePathByInput(file.name, node.name || "Pass");
                node.fragmentPathTemplate = resolved.fragmentPathTemplate;
                node.fragmentPath = resolved.fragmentPath;
            }
            syncNodeParamsFromShaderSource(node);
        }, { reason: "node-fragment-upload", forceCompile: true, forceCompileNow: true, forceKotlin: true });
        showToast("卡片片元已导入", "ok");
    });

    els.btnAddNodeParam?.addEventListener("click", () => {
        patchSelectedNode((node) => {
            if (normalizePostNodeType(node.type) === NODE_TYPE_TEXTURE) {
                showToast("texture 卡片不支持新增普通参数", "warn");
                return;
            }
            const p = createParamTemplate();
            p.name = `uParam${nextCustomParamSerial(node.params, { excludePostInputSampler: true })}`;
            node.params.push(p);
            syncNodeShaderUniformDecls(node);
        }, { reason: "node-param-add", forceCompile: true, forceKotlin: true });
    });

    els.btnApplyNodeShader?.addEventListener("click", () => {
        const state = store.getState();
        const selected = findPostNode(state, state.selectedNodeId);
        if (!selected) return;
        if (normalizePostNodeType(selected.type) === NODE_TYPE_TEXTURE) {
            showToast("texture 卡片不使用片元着色器。", "warn");
            return;
        }
        patchSelectedNode((node) => {
            syncNodeParamsFromShaderSource(node);
            syncNodeShaderUniformDecls(node);
        }, { reason: "node-uniform-sync", skipHistory: true, forceCompile: true, forceKotlin: true });
        requestRendererSync({ force: true, now: true });
        showToast("后处理卡片已应用", "ok");
    });

    els.btnExportNodeFragment?.addEventListener("click", () => {
        const state = store.getState();
        const node = findPostNode(state, state.selectedNodeId);
        if (!node) return;
        const name = fileNameFromPath(node.fragmentPath, `${node.name || "post"}.fsh`);
        downloadText(name, normalizeShaderForGlsl300Es(node.fragmentSource, { stage: "fragment" }));
    });

    els.btnDeleteNode?.addEventListener("click", () => {
        deleteSelectedNode();
    });
    els.btnDuplicateNode?.addEventListener("click", () => {
        duplicateSelectedNode();
    });
}

function bindPipelineEvents() {
    els.btnAddPass?.addEventListener("click", () => {
        addPostNode({ askType: true });
    });

    els.btnAutoLayout?.addEventListener("click", () => {
        graphEditor.autoLayout();
        showToast("已自动布局", "ok");
    });

    els.btnClearLinks?.addEventListener("click", () => {
        store.patch((draft) => {
            draft.post.links = [];
        }, { reason: "clear-links", forceCompile: true, forceKotlin: true });
        showToast("已清空连线", "ok");
    });

}

function bindKotlinEvents() {
    const copyText = async (text, okText) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(okText, "ok");
        } catch {
            showToast("复制失败，请手动复制", "err");
        }
    };

    applyKotlinCollapsedState();
    applyKotlinGenerateTarget(kotlinGenerateTarget, { save: false });

    els.btnGenTargetModel?.addEventListener("click", () => applyKotlinGenerateTarget("model"));
    els.btnGenTargetPost?.addEventListener("click", () => applyKotlinGenerateTarget("post"));
    els.btnGenTargetAll?.addEventListener("click", () => applyKotlinGenerateTarget("all"));

    els.btnGenerate?.addEventListener("click", () => {
        generateKotlinNow(kotlinGenerateTarget);
    });

    els.btnCopyModelKotlin?.addEventListener("click", () => {
        const text = generateModelKotlin(store.getState());
        modelKotlinCache = text;
        if (els.modelKotlinOut) els.modelKotlinOut.innerHTML = highlightKotlin(text);
        copyText(text, "模型 Kotlin 已复制");
    });

    els.btnCopyPostKotlin?.addEventListener("click", () => {
        const text = generatePostKotlin(store.getState());
        postKotlinCache = text;
        if (els.postKotlinOut) els.postKotlinOut.innerHTML = highlightKotlin(text);
        copyText(text, "后处理 Kotlin 已复制");
    });

    els.btnDownloadModelKotlin?.addEventListener("click", () => {
        const state = store.getState();
        const text = generateModelKotlin(state);
        modelKotlinCache = text;
        if (els.modelKotlinOut) els.modelKotlinOut.innerHTML = highlightKotlin(text);
        const file = `${sanitizeProjectName(state.projectName || "shader-workbench")}_model_kotlin.txt`;
        downloadText(file, text);
    });

    els.btnDownloadPostKotlin?.addEventListener("click", () => {
        const state = store.getState();
        const text = generatePostKotlin(state);
        postKotlinCache = text;
        if (els.postKotlinOut) els.postKotlinOut.innerHTML = highlightKotlin(text);
        const file = `${sanitizeProjectName(state.projectName || "shader-workbench")}_post_kotlin.txt`;
        downloadText(file, text);
    });

    els.btnToggleKotlin?.addEventListener("click", () => {
        kotlinCollapsed = !kotlinCollapsed;
        applyKotlinCollapsedState();
    });
}

function bindPreviewEvents() {
    els.btnFullscreen?.addEventListener("click", () => {
        renderer.toggleFullscreen();
    });

    els.btnResetCamera?.addEventListener("click", () => {
        renderer.resetCamera();
    });
}

function bindCardPreviewDrag() {
    if (!els.viewer || !els.viewerHud) return;

    let dragState = null;

    const beginDrag = (ev) => {
        if (!(ev instanceof PointerEvent)) return;
        if (ev.button !== 0) return;
        if (!isFloatingPreviewPage(workspacePage)) return;
        const target = ev.target;
        if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a")) return;

        const rect = els.viewer.getBoundingClientRect();
        const initial = clampCardPreviewPos(cardPreviewPos) || {
            x: Math.round(rect.left),
            y: Math.round(rect.top)
        };

        cardPreviewPos = initial;
        els.viewer.style.left = `${initial.x}px`;
        els.viewer.style.top = `${initial.y}px`;
        els.viewer.style.right = "auto";
        els.viewer.style.bottom = "auto";

        dragState = {
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top
        };
        document.body.classList.add("card-preview-dragging");
        ev.preventDefault();
    };

    const onMove = (ev) => {
        if (!dragState || !isFloatingPreviewPage(workspacePage)) return;
        const next = clampCardPreviewPos({
            x: ev.clientX - dragState.offsetX,
            y: ev.clientY - dragState.offsetY
        });
        if (!next) return;
        cardPreviewPos = next;
        els.viewer.style.left = `${next.x}px`;
        els.viewer.style.top = `${next.y}px`;
        els.viewer.style.right = "auto";
        els.viewer.style.bottom = "auto";
    };

    const endDrag = () => {
        if (!dragState) return;
        dragState = null;
        document.body.classList.remove("card-preview-dragging");
        if (cardPreviewPos) saveJson(CARD_PREVIEW_POS_KEY, cardPreviewPos);
    };

    els.viewerHud.addEventListener("pointerdown", beginDrag);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", () => {
        if (!isFloatingPreviewPage(workspacePage)) return;
        const next = clampCardPreviewPos(cardPreviewPos);
        if (!next) return;
        cardPreviewPos = next;
        applyCardPreviewPosition();
        saveJson(CARD_PREVIEW_POS_KEY, cardPreviewPos);
    });
}

function bindSettingsImportExport() {
    settingsSystem.exportSettingsButton?.addEventListener("click", () => {
        exportSettingsJson(store.getState().settings, hotkeySystem?.getHotkeys() || null);
    });

    settingsSystem.importSettingsButton?.addEventListener("click", () => {
        settingsSystem.importSettingsFileInput?.click();
    });

    settingsSystem.importSettingsFileInput?.addEventListener("change", async () => {
        const file = settingsSystem.importSettingsFileInput.files?.[0];
        settingsSystem.importSettingsFileInput.value = "";
        if (!file) return;
        try {
            const payload = await importSettingsFromFile(file);
            if (payload.settings) settingsSystem.applySettings(payload.settings);
            if (payload.hotkeys) hotkeySystem?.applyHotkeys(payload.hotkeys);
            showToast("设置已导入", "ok");
        } catch (err) {
            console.error(err);
            showToast(`设置导入失败: ${err?.message || err}`, "err", 3400);
        }
    });
}

async function exportAllBundle() {
    const JSZipCtor = globalThis.JSZip;
    if (!JSZipCtor) {
        showToast("JSZip 未加载，无法一键导出", "err");
        return;
    }

    const state = store.getState();
    const zip = new JSZipCtor();

    const modelVertexPath = ensureExt(
        normalizeResourcePath(state.model?.shader?.vertexPath, "core/vertex/model.vsh"),
        ".vsh"
    );
    const modelFragmentPath = ensureExt(
        normalizeResourcePath(state.model?.shader?.fragmentPath, "core/fragment/model.fsh"),
        ".fsh"
    );
    zip.file(modelVertexPath, normalizeShaderForGlsl300Es(state.model?.shader?.vertexSource, { stage: "vertex" }));
    zip.file(modelFragmentPath, normalizeShaderForGlsl300Es(state.model?.shader?.fragmentSource, { stage: "fragment" }));

    for (const node of state.post?.nodes || []) {
        const safeName = String(node.name || "post").replace(/[^a-zA-Z0-9_.-]/g, "_");
        const fPath = ensureExt(
            normalizeResourcePath(node.fragmentPath, `core/post/${safeName}.fsh`),
            ".fsh"
        );
        zip.file(fPath, normalizeShaderForGlsl300Es(node.fragmentSource, { stage: "fragment" }));
    }

    const exportedTextures = [];
    for (const tex of state.textures || []) {
        const dataUrl = String(tex?.dataUrl || "");
        if (!dataUrl) continue;
        const decoded = decodeDataUrlPayload(dataUrl);
        if (!decoded?.bytes?.length) continue;
        const texPath = ensureExt(
            normalizeResourcePath(textureResourcePathFromName(tex?.name), `core/textures/${String(tex?.id || "texture")}.png`),
            ".png"
        );
        zip.file(texPath, decoded.bytes);
        exportedTextures.push({
            id: String(tex?.id || ""),
            name: String(tex?.name || ""),
            path: texPath,
            mime: decoded.mime
        });
    }

    const modelText = generateModelKotlin(state);
    const postText = generatePostKotlin(state);
    modelKotlinCache = modelText;
    postKotlinCache = postText;
    zip.file("kotlin/model_kotlin.txt", modelText);
    zip.file("kotlin/post_kotlin.txt", postText);
    zip.file("kotlin/combined_kotlin.txt", `${modelText}\n\n${postText}`);

    const manifest = {
        projectName: state.projectName || "shader-workbench",
        exportedAt: new Date().toISOString(),
        modelVertexPath,
        modelFragmentPath,
        postNodes: (state.post?.nodes || []).map((n) => ({
            name: n.name,
            fragmentPath: n.fragmentPath
        })),
        textures: exportedTextures
    };
    zip.file("export_manifest.json", JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    const zipName = `${sanitizeProjectName(state.projectName || "shader-workbench")}_bundle.zip`;
    downloadBlob(zipName, blob);
}

function bindLayoutResizers() {
    const layout = els.layout;
    const leftPanel = els.panelLeft;
    const rightPanel = els.panelRight;
    const rzLeft = els.resizerLeft;
    const rzRight = els.resizerRight;
    if (!layout || !leftPanel || !rightPanel || !rzLeft || !rzRight) return;

    const minLeft = 280;
    const maxLeft = 680;
    const minRight = 320;
    const maxRight = 820;

    const startDrag = (side, ev) => {
        if (!(ev instanceof PointerEvent)) return;
        if (ev.button !== 0) return;
        const startX = ev.clientX;
        const startLeft = leftPanel.getBoundingClientRect().width;
        const startRight = rightPanel.getBoundingClientRect().width;

        const move = (mv) => {
            const dx = mv.clientX - startX;
            if (side === "left") {
                const next = Math.max(minLeft, Math.min(maxLeft, startLeft + dx));
                layout.style.setProperty("--sb-left-w", `${Math.round(next)}px`);
            } else {
                const next = Math.max(minRight, Math.min(maxRight, startRight - dx));
                layout.style.setProperty("--sb-right-w", `${Math.round(next)}px`);
            }
            renderer.resize();
            graphEditor.render();
        };

        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            document.body.classList.remove("is-resizing");
        };

        document.body.classList.add("is-resizing");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
        ev.preventDefault();
    };

    rzLeft.addEventListener("pointerdown", (ev) => startDrag("left", ev));
    rzRight.addEventListener("pointerdown", (ev) => startDrag("right", ev));
}

function bindTopActions() {
    bindLayoutResizers();
    els.btnUndo?.addEventListener("click", () => performUndo());
    els.btnRedo?.addEventListener("click", () => performRedo());
    els.btnPageModel?.addEventListener("click", () => applyWorkspacePage("model"));
    els.btnPagePost?.addEventListener("click", () => {
        if (workspacePage === "card") return;
        applyWorkspacePage("post");
    });
    els.btnBackToPost?.addEventListener("click", () => applyWorkspacePage("post"));
    document.addEventListener("keydown", (ev) => {
        if (ev.defaultPrevented) return;
        const isMod = ev.ctrlKey || ev.metaKey;
        const editing = shouldIgnoreHotkeysForTarget(ev.target);
        const settingsOpen = !!(els.settingsModal && !els.settingsModal.classList.contains("hidden"));
        const hotkeyOpen = !!(els.hotkeyModal && !els.hotkeyModal.classList.contains("hidden"));
        const typePickerOpen = isNodeTypePickerOpen();
        if (typePickerOpen && ev.code === "Escape") {
            ev.preventDefault();
            closeNodeTypePicker({ pickType: null });
            return;
        }
        const anyModalOpen = settingsOpen || hotkeyOpen || typePickerOpen;
        if (isMod && !editing && !anyModalOpen && !ev.altKey) {
            const undoKey = ev.code === "KeyZ" && !ev.shiftKey;
            const redoKey = ev.code === "KeyY" || (ev.code === "KeyZ" && ev.shiftKey);
            if (undoKey) {
                ev.preventDefault();
                performUndo();
                return;
            }
            if (redoKey) {
                ev.preventDefault();
                performRedo();
                return;
            }
            if (ev.code === "KeyD" && !ev.shiftKey) {
                ev.preventDefault();
                duplicateSelectedNode();
                return;
            }
        }

        if (!anyModalOpen && !editing && !isMod && !ev.altKey && !ev.repeat && (ev.code === "Delete" || ev.code === "Backspace")) {
            ev.preventDefault();
            deleteSelectedNode();
            return;
        }

    });
    bindProjectEvents();
    bindModelEvents();
    bindTextureEvents();
    bindNodeTypePickerEvents();
    bindNodeEvents();
    bindPipelineEvents();
    bindKotlinEvents();
    bindPreviewEvents();
    bindCardPreviewDrag();
    bindSettingsImportExport();
}

window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (event.origin && event.origin !== window.location.origin) return;
    const command = event.data?.type === "coo-shell-command" ? event.data.command : null;
    const commandType = String(command?.type || "");
    if (commandType === "save-project" || commandType === "save-as-project") {
        exportProjectJson(store.getState());
    } else if (commandType === "export-kotlin") {
        const state = store.getState();
        generateKotlinNow(kotlinGenerateTarget);
        if (kotlinGenerateTarget === "model") {
            downloadText(`${sanitizeProjectName(state.projectName || "shader-workbench")}_model_kotlin.txt`, modelKotlinCache);
        } else if (kotlinGenerateTarget === "post") {
            downloadText(`${sanitizeProjectName(state.projectName || "shader-workbench")}_post_kotlin.txt`, postKotlinCache);
        } else {
            downloadText(
                `${sanitizeProjectName(state.projectName || "shader-workbench")}_kotlin.txt`,
                `${modelKotlinCache}\n\n${postKotlinCache}`
            );
        }
    }
});

window.addEventListener("coo-legacy-before-route-leave", () => {
    saveJson(STORAGE_KEYS.project, normalizeProjectPayload(store.getState()));
});

function handleHotkeyAction(actionId) {
    if (isNodeTypePickerOpen()) return;
    switch (actionId) {
        case "addPass":
            addPostNode();
            break;
        case "generateKotlin":
            generateKotlinNow(kotlinGenerateTarget);
            break;
        case "toggleSettings":
            toggleSettings();
            break;
        case "toggleFullscreen":
            renderer.toggleFullscreen();
            break;
        case "resetCamera":
            renderer.resetCamera();
            break;
        case "exportProject":
            exportProjectJson(store.getState());
            break;
        case "importProject":
            els.fileProject?.click();
            break;
        case "deleteSelectedNode":
            deleteSelectedNode();
            break;
        default:
            break;
    }
}

hotkeySystem = initHotkeysSystem({
    els,
    onAction: handleHotkeyAction,
    onCycleTheme: (dir) => settingsSystem.cycleTheme(dir),
    onModalStateChange: () => {}
});

function init() {
    bindTopActions();
    applyWorkspacePage(workspacePage, { save: false });
    store.patch((draft) => {
        syncAllPostNodesFromShaderSource(draft);
    }, { reason: "init-node-sync", skipHistory: true, silentUI: true, forceKotlin: true });

    const state = store.getState();
    hasCustomModelLoaded = false;

    renderer.setPrimitive(state.model?.primitive || "sphere");
    settingsSystem.applySettings(state.settings || {});

    applyStateToUI(state, { forceKotlin: true });
    requestRendererSync({ force: true, now: true });
    void bootRenderer();
}

init();
