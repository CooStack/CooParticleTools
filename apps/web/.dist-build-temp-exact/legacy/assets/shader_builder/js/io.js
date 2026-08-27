import {
    createDefaultPostNode,
    createDefaultState,
    dedupeShaderParams,
    ensurePostInputSamplerParam,
    getPostInputTextureMinCount,
    normalizeNodePathTemplate,
    resolveNodeFragmentPath
} from "./store.js";
import { deepClone, downloadText, readFileAsText, sanitizeProjectName } from "./utils.js";

function normalizeParamObject(param, fallback = {}) {
    const merged = Object.assign({
        id: "",
        name: "uParam",
        type: "float",
        value: "1.0",
        valueSource: "value",
        valueExpr: "uTime",
        sourceType: "value",
        textureId: "",
        connection: ""
    }, fallback || {}, param || {});

    return {
        id: String(merged.id || ""),
        name: String(merged.name || "uParam"),
        type: String(merged.type || "float"),
        value: String(merged.value ?? ""),
        valueSource: String(merged.valueSource || "value"),
        valueExpr: String(merged.valueExpr || "uTime"),
        sourceType: String(merged.sourceType || "value"),
        textureId: String(merged.textureId || ""),
        connection: String(merged.connection || "")
    };
}

function sanitizeTextureNameForKotlin(name, fallback = "texture") {
    const raw = String(name || "").trim();
    const base = raw.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    let out = base || fallback;
    if (/^[0-9]/.test(out)) out = `_${out}`;
    return out.slice(0, 64) || fallback;
}

export function buildProjectPayload(state) {
    const payload = deepClone(state);
    payload.projectName = sanitizeProjectName(payload.projectName || "shader-workbench");
    payload.exportedAt = new Date().toISOString();
    payload.schema = "shader_builder_project_v1";
    return payload;
}

export function exportProjectJson(state) {
    const payload = buildProjectPayload(state);
    const text = JSON.stringify(payload, null, 2);
    const file = `${sanitizeProjectName(state.projectName || "shader-workbench")}.json`;
    downloadText(file, text);
}

export async function importProjectFromFile(file) {
    const text = await readFileAsText(file);
    const obj = JSON.parse(text);
    return normalizeProjectPayload(obj);
}

export function normalizeProjectPayload(payload) {
    const base = createDefaultState();
    if (!payload || typeof payload !== "object") return base;

    const out = deepClone(base);
    out.projectName = sanitizeProjectName(payload.projectName || base.projectName);

    if (payload.settings && typeof payload.settings === "object") {
        out.settings = Object.assign({}, base.settings, payload.settings);
    }

    if (payload.model && typeof payload.model === "object") {
        out.model = Object.assign({}, base.model, payload.model);
        out.model.shader = Object.assign({}, base.model.shader, payload.model.shader || {});
        out.model.shader.params = Array.isArray(payload.model?.shader?.params)
            ? dedupeShaderParams(payload.model.shader.params.map((p) => normalizeParamObject(p)))
            : deepClone(base.model.shader.params);
    }

    if (Array.isArray(payload.textures)) {
        out.textures = payload.textures.map((t) => ({
            id: String(t.id || ""),
            name: sanitizeTextureNameForKotlin(t.name, `texture_${String(t.id || "").trim() || "item"}`),
            dataUrl: String(t.dataUrl || "")
        })).filter((t) => t.id && t.dataUrl);
    }

    if (payload.post && typeof payload.post === "object") {
        out.post = Object.assign({}, base.post, payload.post);
        out.post.nodes = Array.isArray(payload.post.nodes)
            ? payload.post.nodes.map((n, i) => {
                const d = createDefaultPostNode(i);
                const merged = Object.assign({}, d, n || {});
                const nodeType = String(merged.type || "simple").trim().toLowerCase();
                if (nodeType === "texture") {
                    const list = Array.isArray(n?.params)
                        ? n.params.map((p) => normalizeParamObject(p)).filter((p) => String(p?.type || "").toLowerCase() === "texture")
                        : [];
                    const baseParam = normalizeParamObject(list[0] || {}, {
                        type: "texture",
                        sourceType: "upload",
                        valueSource: "value",
                        valueExpr: "",
                        value: "0",
                        textureId: "",
                        connection: ""
                    });
                    baseParam.type = "texture";
                    baseParam.sourceType = "upload";
                    baseParam.valueSource = "value";
                    baseParam.valueExpr = "";
                    baseParam.connection = "";
                    baseParam.textureId = String(baseParam.textureId || "");
                    if (!String(baseParam.value || "").trim()) baseParam.value = "0";
                    merged.inputs = 0;
                    merged.outputs = 1;
                    merged.params = [baseParam];
                } else {
                    const minTextureCount = getPostInputTextureMinCount(merged.inputs);
                    merged.params = Array.isArray(n?.params)
                        ? ensurePostInputSamplerParam(n.params.map((p) => normalizeParamObject(p)), minTextureCount)
                        : deepClone(d.params);
                }

                const hasTemplate = typeof n?.fragmentPathTemplate === "string" && n.fragmentPathTemplate.trim() !== "";
                const hasPath = typeof n?.fragmentPath === "string" && n.fragmentPath.trim() !== "";
                if (hasTemplate) {
                    merged.fragmentPathTemplate = normalizeNodePathTemplate(n.fragmentPathTemplate, "core/post/{name}.fsh");
                    merged.fragmentPath = resolveNodeFragmentPath(merged.name, merged.fragmentPathTemplate);
                } else if (hasPath) {
                    if (n.fragmentPath.includes("{name}")) {
                        merged.fragmentPathTemplate = normalizeNodePathTemplate(n.fragmentPath, "core/post/{name}.fsh");
                        merged.fragmentPath = resolveNodeFragmentPath(merged.name, merged.fragmentPathTemplate);
                    } else {
                        merged.fragmentPathTemplate = "";
                        merged.fragmentPath = String(n.fragmentPath).trim();
                    }
                } else {
                    merged.fragmentPathTemplate = d.fragmentPathTemplate;
                    merged.fragmentPath = resolveNodeFragmentPath(merged.name, merged.fragmentPathTemplate);
                }
                return merged;
            })
            : deepClone(base.post.nodes);
        out.post.links = Array.isArray(payload.post.links) ? payload.post.links : deepClone(base.post.links);
    }

    out.selectedNodeId = String(payload.selectedNodeId || out.post.nodes[0]?.id || "") || null;
    return out;
}

export function exportSettingsJson(settings, hotkeys) {
    const payload = {
        schema: "shader_builder_settings_v1",
        exportedAt: new Date().toISOString(),
        settings,
        hotkeys
    };
    downloadText("shader_builder_settings.json", JSON.stringify(payload, null, 2));
}

export async function importSettingsFromFile(file) {
    const text = await readFileAsText(file);
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") throw new Error("设置文件格式错误");
    return {
        settings: obj.settings && typeof obj.settings === "object" ? obj.settings : null,
        hotkeys: obj.hotkeys && typeof obj.hotkeys === "object" ? obj.hotkeys : null
    };
}
