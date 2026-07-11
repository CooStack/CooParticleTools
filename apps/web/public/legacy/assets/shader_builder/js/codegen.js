import { GRAPH_INPUT_ID, GRAPH_OUTPUT_ID } from "./store.js";
import { parseVec } from "./utils.js";
import { MC_COMPAT } from "./constants.js";

function safeName(name, fallback) {
    const n = String(name || "").replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    if (!n) return fallback;
    if (/^[0-9]/.test(n)) return `_${n}`;
    return n;
}

function safeResourceSegment(name, fallback = "generated") {
    const n = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    return n || fallback;
}

function safeConstName(name, fallback) {
    return safeName(name, fallback).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function pascalName(name, fallback) {
    const base = safeName(name, fallback);
    const words = base.split("_").filter(Boolean);
    const out = words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join("");
    if (!out) return fallback;
    if (/^[0-9]/.test(out)) return `_${out}`;
    return out;
}

function uniqueName(base, used) {
    let name = base;
    let index = 2;
    while (used.has(name)) {
        name = `${base}_${index}`;
        index += 1;
    }
    used.add(name);
    return name;
}

function ktString(value) {
    return JSON.stringify(String(value ?? ""));
}

function kotlinScalar(value, type) {
    if (type === "int") {
        const n = Number(value);
        return Number.isFinite(n) ? String(Math.round(n)) : "0";
    }
    if (type === "bool") {
        const t = String(value).trim().toLowerCase();
        return ["1", "true", "yes", "on"].includes(t) ? "true" : "false";
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return "0f";
    const text = String(n);
    return text.includes(".") ? `${text}f` : `${text}.0f`;
}

function kotlinDouble(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0.0";
    const text = String(n);
    return text.includes(".") ? text : `${text}.0`;
}

function sanitizeUniformExpr(raw, fallback = "") {
    const expr = String(raw || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n+/g, " ")
        .trim();
    return expr || fallback;
}

function buildProgramSetter(param, target = "program") {
    const name = String(param?.name || "uParam");
    const type = String(param?.type || "float").toLowerCase();
    const value = param?.value ?? "";
    const useUniformExpr = String(param?.valueSource || "value").toLowerCase() === "uniform";
    const valueExpr = useUniformExpr
        ? sanitizeUniformExpr(param?.valueExpr, "")
        : "";

    if (type === "int") {
        const rhs = valueExpr || kotlinScalar(value, "int");
        return `${target}.setInt(${ktString(name)}, ${rhs})`;
    }
    if (type === "bool") {
        const rhs = valueExpr || kotlinScalar(value, "bool");
        return `${target}.setBoolean(${ktString(name)}, ${rhs})`;
    }

    if (type === "vec2") {
        if (valueExpr) {
            return `${target}.setFloat2(${ktString(name)}, ${valueExpr})`;
        }
        const vec = parseVec(String(value), 2) || [0, 0];
        return `${target}.setFloat2(${ktString(name)}, org.joml.Vector2f(${kotlinScalar(vec[0], "float")}, ${kotlinScalar(vec[1], "float")}))`;
    }

    if (type === "vec3") {
        if (valueExpr) {
            return `${target}.setFloat3(${ktString(name)}, ${valueExpr})`;
        }
        const vec = parseVec(String(value), 3) || [1, 1, 1];
        return `${target}.setFloat3(${ktString(name)}, org.joml.Vector3f(${kotlinScalar(vec[0], "float")}, ${kotlinScalar(vec[1], "float")}, ${kotlinScalar(vec[2], "float")}))`;
    }

    if (type === "texture") {
        const sampler = Number.parseInt(String(value || 0), 10);
        const safeSampler = Number.isFinite(sampler) ? sampler : 0;
        if (param?.sourceType === "connection" && param?.connection) {
            return `${target}.setInt(${ktString(name)}, ${safeSampler}) // texture <- ${param.connection}`;
        }
        if (param?.sourceType === "upload" && param?.textureId) {
            return `${target}.setInt(${ktString(name)}, ${safeSampler}) // texture <- uploaded:${param.textureId}`;
        }
        return `${target}.setInt(${ktString(name)}, ${safeSampler})`;
    }

    if (valueExpr) {
        return `${target}.setFloat(${ktString(name)}, ${valueExpr})`;
    }
    return `${target}.setFloat(${ktString(name)}, ${kotlinScalar(value, "float")})`;
}

function buildPostParamValue(param) {
    const type = String(param?.type || "float").toLowerCase();
    const value = param?.value ?? "";
    if (type === "int") {
        return `PostEffectParamValue.IntValue(${kotlinScalar(value, "int")})`;
    }
    if (type === "bool") {
        return `PostEffectParamValue.BoolValue(${kotlinScalar(value, "bool")})`;
    }
    if (type === "vec2") {
        const vec = parseVec(String(value), 2) || [0, 0];
        return `PostEffectParamValue.Vec2Value(${kotlinScalar(vec[0], "float")}, ${kotlinScalar(vec[1], "float")})`;
    }
    if (type === "vec3") {
        const vec = parseVec(String(value), 3) || [0, 0, 0];
        return `PostEffectParamValue.Vec3Value(${kotlinDouble(vec[0])}, ${kotlinDouble(vec[1])}, ${kotlinDouble(vec[2])})`;
    }
    return `PostEffectParamValue.FloatValue(${kotlinScalar(value, "float")})`;
}

function buildPostUniformLine(param, indent = "            ") {
    const name = String(param?.name || "uParam");
    return `${indent}uniform(${ktString(name)}) { it.params[${ktString(name)}] ?: ${buildPostParamValue(param)} }`;
}

function parseSamplerSlot(raw, fallback = 0) {
    const slot = Number.parseInt(String(raw ?? fallback), 10);
    if (!Number.isFinite(slot)) return fallback;
    return Math.max(0, Math.min(31, slot));
}

function postSamplerSlot(_param, samplerIndex = 0) {
    const slot = Number(samplerIndex);
    if (!Number.isFinite(slot)) return 0;
    return Math.max(0, Math.min(31, Math.round(slot)));
}

function sanitizeResourceFileName(name, fallback = "texture.png") {
    const raw = String(name || "").trim().replaceAll("\\", "/");
    const last = raw.split("/").filter(Boolean).pop() || fallback;
    const safe = last.replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!safe) return fallback;
    if (safe.includes(".")) return safe;
    return `${safe}.png`;
}

function buildUploadedTextureResourcePath(textureName) {
    const file = sanitizeResourceFileName(textureName, "texture.png");
    return `core/textures/${file}`;
}

function resourceExpr(path) {
    return `ResourceLocation.fromNamespaceAndPath(CooParticlesConstants.MOD_ID, ${ktString(path)})`;
}

function shaderExpr(path) {
    return resourceExpr(path);
}

function isTextureParam(param) {
    return String(param?.type || "").toLowerCase() === "texture";
}

function isTextureUploadParam(param) {
    if (!param || typeof param !== "object") return false;
    return isTextureParam(param)
        && String(param.sourceType || "value").toLowerCase() === "upload";
}

function nodeType(node) {
    const type = String(node?.type || "simple").trim().toLowerCase();
    if (type === "texture") return "texture";
    if (type === "pingpong") return "pingpong";
    return "simple";
}

function getTextureParams(params = []) {
    return (Array.isArray(params) ? params : []).filter(isTextureParam);
}

function getUniformParams(params = []) {
    return (Array.isArray(params) ? params : []).filter((param) => !isTextureParam(param));
}

function buildTextureLookup(state) {
    const map = new Map();
    for (const tex of state?.textures || []) {
        const id = String(tex?.id || "").trim();
        if (!id || map.has(id)) continue;
        map.set(id, tex);
    }
    return map;
}

function collectModelTextureBindings(state) {
    const params = Array.isArray(state?.model?.shader?.params) ? state.model.shader.params : [];
    const textureById = buildTextureLookup(state);
    const textureDefs = [];
    const bindings = [];
    const missing = [];
    const textureVarById = new Map();
    const textureChannelById = new Map();
    const usedVarNames = new Set();

    const allocTextureVar = (seed, fallback) => {
        const base = `modelTex_${safeName(seed, fallback)}`;
        return uniqueName(base, usedVarNames);
    };

    for (let i = 0; i < params.length; i += 1) {
        const param = params[i] || {};
        if (!isTextureUploadParam(param)) continue;

        const textureId = String(param.textureId || "").trim();
        if (!textureId) continue;

        const tex = textureById.get(textureId);
        if (!tex) {
            missing.push({
                paramName: String(param.name || `uTex${i + 1}`),
                textureId
            });
            continue;
        }

        let textureVarName = textureVarById.get(textureId);
        if (!textureVarName) {
            textureVarName = allocTextureVar(tex.name || textureId, `texture_${textureDefs.length + 1}`);
            textureVarById.set(textureId, textureVarName);
            textureChannelById.set(textureId, textureDefs.length);
            textureDefs.push({
                textureId,
                textureVarName,
                textureName: String(tex.name || textureId),
                resourcePath: buildUploadedTextureResourcePath(tex.name || textureId),
                channel: textureDefs.length
            });
        }

        bindings.push({
            paramName: String(param.name || `uTex${i + 1}`),
            samplerSlot: Number(textureChannelById.get(textureId) || 0),
            textureVarName,
            textureId
        });
    }

    return { textureDefs, bindings, missing };
}

function createTargetHeader() {
    const lines = [];
    lines.push(`// Target: Minecraft ${MC_COMPAT.mcVersion} (${MC_COMPAT.openGL}, ${MC_COMPAT.glsl})`);
    lines.push(`// Axis: ${MC_COMPAT.axis}`);
    lines.push("// Generated for CooParticlesAPI renderer v2.");
    lines.push("");
    return lines;
}

function projectSeed(state) {
    return safeResourceSegment(state?.projectName || "shader_workbench", "shader_workbench");
}

function generatedClassName(state, suffix) {
    return `${pascalName(state?.projectName || "ShaderWorkbench", "ShaderWorkbench")}${suffix}`;
}

function numberValue(value, fallback = 0, min = -Infinity, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function intValue(value, fallback = 0, min = -Infinity, max = Infinity) {
    return Math.round(numberValue(value, fallback, min, max));
}

function colorValues(raw) {
    const parts = String(raw || "").split(",").map((part) => Number(part.trim()));
    return [0, 1, 2, 3].map((index) => {
        const fallback = index === 3 ? 1 : 1;
        const n = parts[index];
        return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
    });
}

function modelBuilderSteps(state) {
    const builder = state?.model?.builder;
    return Array.isArray(builder?.steps) ? builder.steps : [];
}

function modelBuilderEnabled(state) {
    const builder = state?.model?.builder;
    return !!builder?.enabled && modelBuilderSteps(state).length > 0;
}

function shapeVarName(index) {
    return `shape${index + 1}`;
}

function colorVarName(index) {
    return `shape${index + 1}Color`;
}

function vector3Expr(x, y, z) {
    return `Vector3f(${kotlinScalar(x, "float")}, ${kotlinScalar(y, "float")}, ${kotlinScalar(z, "float")})`;
}

function pushBoxShapeLines(lines, step, varName, colorName) {
    const hx = numberValue(step.width, 1, 0.001, 1000) / 2;
    const hy = numberValue(step.height, 1, 0.001, 1000) / 2;
    const hz = numberValue(step.depth, 1, 0.001, 1000) / 2;
    const faces = [
        [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
        [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
        [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
        [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
        [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
        [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]
    ];
    for (const face of faces) {
        lines.push(`        ${varName}.addQuad(`);
        lines.push(`            ${vector3Expr(...face[0])},`);
        lines.push(`            ${vector3Expr(...face[1])},`);
        lines.push(`            ${vector3Expr(...face[2])},`);
        lines.push(`            ${vector3Expr(...face[3])},`);
        lines.push(`            ${colorName}`);
        lines.push("        )");
    }
}

function pushShapeGeometryLines(lines, step, index) {
    const kind = String(step?.kind || "box").toLowerCase();
    const varName = shapeVarName(index);
    const colorName = colorVarName(index);
    const [r, g, b, a] = colorValues(step?.color);
    lines.push(`        val ${colorName} = Vector4f(${kotlinScalar(r, "float")}, ${kotlinScalar(g, "float")}, ${kotlinScalar(b, "float")}, ${kotlinScalar(a, "float")})`);
    lines.push(`        val ${varName} = RenderVertexBuilder.create().color(${colorName})`);
    if (kind === "plane") {
        lines.push(`        ${varName}.addPlane(${kotlinScalar(numberValue(step.width, 1, 0.001, 1000), "float")}, ${kotlinScalar(numberValue(step.height, 1, 0.001, 1000), "float")}, 0f, ${colorName})`);
    } else if (kind === "sphere") {
        lines.push(`        ${varName}.addSphere(${kotlinScalar(numberValue(step.radius, 1, 0.001, 1000), "float")}, ${intValue(step.latSegments, 12, 2, 128)}, ${intValue(step.lonSegments, 24, 3, 256)}, ${colorName})`);
    } else if (kind === "disc") {
        lines.push(`        ${varName}.addDisc(${kotlinScalar(numberValue(step.radius, 1, 0.001, 1000), "float")}, ${intValue(step.segments, 32, 3, 256)}, 0f, ${colorName})`);
    } else if (kind === "ring") {
        const inner = numberValue(step.innerRadius, 0.55, 0, 1000);
        const outer = Math.max(inner + 0.001, numberValue(step.outerRadius, 1, 0.001, 1000));
        lines.push(`        ${varName}.addRing(${kotlinScalar(inner, "float")}, ${kotlinScalar(outer, "float")}, ${intValue(step.segments, 32, 3, 256)}, 0f, ${colorName})`);
    } else {
        pushBoxShapeLines(lines, step, varName, colorName);
    }

    const sx = numberValue(step.scaleX, 1, -1000, 1000);
    const sy = numberValue(step.scaleY, 1, -1000, 1000);
    const sz = numberValue(step.scaleZ, 1, -1000, 1000);
    if (Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001 || Math.abs(sz - 1) > 0.0001) {
        lines.push(`        ${varName}.scale(${kotlinScalar(sx, "float")}, ${kotlinScalar(sy, "float")}, ${kotlinScalar(sz, "float")})`);
    }
    for (const axis of ["X", "Y", "Z"]) {
        const degrees = numberValue(step[`rot${axis}`], 0, -3600, 3600);
        if (Math.abs(degrees) <= 0.0001) continue;
        const radians = degrees * Math.PI / 180;
        lines.push(`        ${varName}.rotate${axis}(${kotlinScalar(radians, "float")})`);
    }
    const x = numberValue(step.x, 0, -1000, 1000);
    const y = numberValue(step.y, 0, -1000, 1000);
    const z = numberValue(step.z, 0, -1000, 1000);
    if (Math.abs(x) > 0.0001 || Math.abs(y) > 0.0001 || Math.abs(z) > 0.0001) {
        lines.push(`        ${varName}.translate(${kotlinScalar(x, "float")}, ${kotlinScalar(y, "float")}, ${kotlinScalar(z, "float")})`);
    }
    lines.push(`        builder.addVertices(${varName}.create())`);
}

function pushModelBuilderVertexHelper(lines, state, functionName = "buildModelVertexes", visibility = "private ") {
    const steps = modelBuilderSteps(state);
    lines.push(`    ${visibility}fun ${functionName}(): List<VertexData> {`);
    lines.push("        val builder = RenderVertexBuilder.create()");
    if (!steps.length) {
        lines.push("        val fallback = RenderVertexBuilder.create().addPlane(1f, 1f)");
        lines.push("        builder.addVertices(fallback.create())");
    } else {
        steps.forEach((step, index) => pushShapeGeometryLines(lines, step, index));
    }
    lines.push("        return builder.createVertexData()");
    lines.push("    }");
}

function buildModelVertexHelpers(lines, state) {
    if (modelBuilderEnabled(state)) {
        pushModelBuilderVertexHelper(lines, state);
        return;
    }
    lines.push("    private fun buildFallbackRingVertexes(radiusOuter: Float, radiusInner: Float, z: Float): List<VertexData> {");
    lines.push("        val p1 = Vector3f(-radiusOuter, 0f, z)");
    lines.push("        val p2 = Vector3f(radiusOuter, 0f, z)");
    lines.push("        val p3 = Vector3f(radiusOuter, 0f, -z)");
    lines.push("        val p4 = Vector3f(-radiusOuter, 0f, -z)");
    lines.push("        val p5 = Vector3f(-radiusInner, 0f, z)");
    lines.push("        val p6 = Vector3f(radiusInner, 0f, z)");
    lines.push("        val p7 = Vector3f(radiusInner, 0f, -z)");
    lines.push("        val p8 = Vector3f(-radiusInner, 0f, -z)");
    lines.push("        val res = ArrayList<VertexData>()");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p1, p2, p6, p5))");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p2, p3, p7, p6))");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p3, p4, p8, p7))");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p4, p1, p5, p8))");
    lines.push("        return res");
    lines.push("    }");
    lines.push("");
    lines.push("    private fun buildModelVertexes(primitive: String): List<VertexData> = when (primitive) {");
    lines.push("        \"sphere\" -> ShaderUtil.genBall(5f, 64, 64)");
    lines.push("        \"box\" -> ShaderUtil.genBox()");
    lines.push("        \"plane\" -> ShaderUtil.genSquareUV(");
    lines.push("            Vector3f(-5f, 0f, 5f),");
    lines.push("            Vector3f(5f, 0f, 5f),");
    lines.push("            Vector3f(5f, 0f, -5f),");
    lines.push("            Vector3f(-5f, 0f, -5f)");
    lines.push("        )");
    lines.push("        \"torus\" -> buildFallbackRingVertexes(5.0f, 2.6f, 1.2f)");
    lines.push("        \"torusKnot\" -> buildFallbackRingVertexes(4.6f, 2.1f, 0.9f)");
    lines.push("        else -> ShaderUtil.genBall(5f, 64, 64)");
    lines.push("    }");
}

export function generateModelKotlin(state) {
    const primitive = String(state?.model?.primitive || "sphere");
    const useModelBuilder = modelBuilderEnabled(state);
    const modelVertexPath = String(state?.model?.shader?.vertexPath || "core/vertex/point.vsh");
    const modelFragmentPath = String(state?.model?.shader?.fragmentPath || "core/fragment/color.fsh");
    const modelParams = Array.isArray(state?.model?.shader?.params) ? state.model.shader.params : [];
    const modelTextureInfo = collectModelTextureBindings(state);
    const uploadedTextureParamKey = new Set(
        modelTextureInfo.bindings.map((b) => `${b.paramName}:${b.textureId}`)
    );
    const className = generatedClassName(state, "ModelRenderer");
    const managedId = `shader_builder/${projectSeed(state)}/model`;
    const lines = createTargetHeader();

    lines.push("// Required imports:");
    lines.push("// import cn.coostack.cooparticlesapi.CooParticlesConstants");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.RenderEntity");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.backend.RenderFrameStage");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.runtime.*");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.AdvancedShaderProgramBuilder");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.api.CooShaderProgram");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.data.CooVertexFormat");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.data.VertexData");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.texture.IdentifierTexture");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.texture.SimpleTextures");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.utils.ShaderUtil");
    if (useModelBuilder) lines.push("// import cn.coostack.cooparticlesapi.renderer.utils.RenderVertexBuilder");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.vertex.DynamicVertexBuffer");
    lines.push("// import net.minecraft.resources.ResourceLocation");
    lines.push("// import org.joml.Matrix4f");
    lines.push("// import org.joml.Vector3f");
    if (useModelBuilder) lines.push("// import org.joml.Vector4f");
    lines.push("// import org.lwjgl.opengl.GL33");
    lines.push("");
    lines.push(`class ${className}<T : RenderEntity> : WorldPassRenderEntityRenderer<T> {`);
    lines.push("    override fun initialize(instance: RenderEntityInstance<T>) {");
    lines.push("        ensureProgram()");
    lines.push("        ensureBuffer()");
    if (modelTextureInfo.textureDefs.length) lines.push("        ensureTextures()");
    lines.push("    }");
    lines.push("");
    lines.push("    override fun describeFeatures(entity: T): RenderEntityFeatureSet {");
    lines.push("        return RenderEntityFeatureSet(");
    lines.push("            stages = setOf(RenderFrameStage.WORLD_PASS),");
    lines.push("            requestedSceneTargets = emptySet(),");
    lines.push("            effectTypes = emptySet(),");
    lines.push("            localRendererEnabled = true,");
    lines.push("            effectGraphEnabled = false");
    lines.push("        )");
    lines.push("    }");
    lines.push("");
    lines.push("    override fun createVisualProfile(entity: T): RenderEntityVisualProfile {");
    lines.push("        return RenderEntityVisualProfile(");
    lines.push("            compositeMode = CompositeMode.ALPHA,");
    lines.push("            needsSceneColorCopy = false,");
    lines.push("            needsSceneDepth = false,");
    lines.push("            renderPriority = 180");
    lines.push("        )");
    lines.push("    }");
    lines.push("");
    lines.push("    override fun renderLocal(input: LocalRenderInput<T>) {");
    lines.push("        val program = ensureProgram()");
    lines.push("        val buffer = ensureBuffer()");
    if (modelTextureInfo.textureDefs.length) lines.push("        val textures = ensureTextures()");
    lines.push("        val entity = input.instance.entity");
    lines.push(useModelBuilder
        ? "        val vertices = buildModelVertexes()"
        : `        val vertices = buildModelVertexes(${ktString(primitive)})`);
    lines.push("        program.useOnContext {");
    lines.push("            setMatrix4(\"projMat\", input.projMatrix)");
    lines.push("            setMatrix4(\"viewMat\", input.viewMatrix)");
    lines.push("            setMatrix4(\"transMat\", Matrix4f(input.modelMatrix))");
    lines.push("            setFloat(\"time\", entity.getTime(input.tickDelta))");
    for (const param of modelParams) {
        if (isTextureUploadParam(param) && uploadedTextureParamKey.has(`${String(param?.name || "uParam")}:${String(param?.textureId || "")}`)) {
            continue;
        }
        lines.push(`            ${buildProgramSetter(param, "this")}`);
    }
    if (modelTextureInfo.bindings.length) {
        for (const binding of modelTextureInfo.bindings) {
            lines.push(`            setInt(${ktString(binding.paramName)}, ${binding.samplerSlot})`);
        }
    }
    lines.push("            buffer.drawMode = GL33.GL_TRIANGLES");
    lines.push("            buffer.setVertexes(vertices, CooVertexFormat.POINT_TEXTURE_UV_FORMAT)");
    if (modelTextureInfo.textureDefs.length) {
        lines.push("            textures.drawWith(Runnable {");
        lines.push("                buffer.draw()");
        lines.push("            })");
    } else {
        lines.push("            buffer.draw()");
    }
    lines.push("        }");
    lines.push("    }");
    lines.push("");
    lines.push("    companion object {");
    lines.push("        private var program: CooShaderProgram? = null");
    lines.push("        private var buffer: DynamicVertexBuffer? = null");
    if (modelTextureInfo.textureDefs.length) lines.push("        private var textures: SimpleTextures? = null");
    lines.push("");
    lines.push("        private fun ensureProgram(): CooShaderProgram {");
    lines.push("            val current = program");
    lines.push("            if (current != null) {");
    lines.push("                if (current.program == 0) current.init()");
    lines.push("                return current");
    lines.push("            }");
    lines.push("            return AdvancedShaderProgramBuilder()");
    lines.push(`                .vertex(${ktString(modelVertexPath)})`);
    lines.push(`                .fragment(${ktString(modelFragmentPath)})`);
    lines.push(`                .managedId(${ktString(managedId)})`);
    lines.push("                .build()");
    lines.push("                .also {");
    lines.push("                    it.init()");
    lines.push("                    program = it");
    lines.push("                }");
    lines.push("        }");
    lines.push("");
    lines.push("        private fun ensureBuffer(): DynamicVertexBuffer {");
    lines.push("            return buffer ?: DynamicVertexBuffer().also {");
    lines.push("                it.init()");
    lines.push("                buffer = it");
    lines.push("            }");
    lines.push("        }");
    if (modelTextureInfo.textureDefs.length) {
        lines.push("");
        lines.push("        private fun ensureTextures(): SimpleTextures {");
        lines.push("            val current = textures");
        lines.push("            if (current != null) return current");
        lines.push("            return SimpleTextures().also { target ->");
        for (const tex of modelTextureInfo.textureDefs) {
            lines.push("                target.addTexture(");
            lines.push("                    IdentifierTexture(");
            lines.push(`                        ${resourceExpr(tex.resourcePath)}`);
            lines.push("                    )");
            lines.push(`                ) // channel ${Number(tex.channel || 0)} -> ${tex.textureName}`);
        }
        lines.push("                target.init()");
        lines.push("                textures = target");
        lines.push("            }");
        lines.push("        }");
    }
    lines.push("");
    buildModelVertexHelpers(lines, state);
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("// Notes:");
    lines.push("// 1) This is a renderer-v2 skeleton. Register it through ClientRenderEntityRegistry for your concrete RenderEntity type.");
    lines.push("// 2) Texture uniforms are fixed to the SimpleTextures channel order: first addTexture -> sampler 0, second -> sampler 1.");
    lines.push("// 3) IdentifierTexture receives ResourceLocation path without the leading textures/ prefix.");
    lines.push("// 4) The generated vertex buffer uses POINT_TEXTURE_UV_FORMAT: layout(location=0) vec3 pos, layout(location=1) vec2 uv.");
    if (modelTextureInfo.missing.length) {
        lines.push("// 5) Missing uploaded model textures:");
        for (const miss of modelTextureInfo.missing) {
            lines.push(`//    - ${miss.paramName}: uploaded:${miss.textureId}`);
        }
    }

    return lines.join("\n");
}

export function generateModelBuilderKotlin(state) {
    const functionName = `build${pascalName(state?.projectName || "ShaderWorkbench", "ShaderWorkbench")}ModelVertexes`;
    const lines = createTargetHeader();
    lines.push("// Required imports:");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.shader.data.VertexData");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.utils.RenderVertexBuilder");
    lines.push("// import org.joml.Vector3f");
    lines.push("// import org.joml.Vector4f");
    lines.push("");
    pushModelBuilderVertexHelper(lines, state, functionName, "");
    return lines.join("\n");
}

function buildNodeMaps(nodes) {
    const byId = new Map();
    nodes.forEach((node) => {
        const id = String(node?.id || "");
        if (id) byId.set(id, node);
    });
    return byId;
}

function incomingLinkMap(links) {
    const map = new Map();
    for (const link of links || []) {
        const toNode = String(link?.toNode || "");
        if (!toNode) continue;
        const toSlot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
        map.set(`${toNode}:${toSlot}`, link);
    }
    return map;
}

function hasOutputToGraphOutput(node, links) {
    const id = String(node?.id || "");
    return (links || []).some((link) => String(link?.fromNode || "") === id && String(link?.toNode || "") === GRAPH_OUTPUT_ID);
}

function firstSamplerParam(node) {
    return getTextureParams(node?.params || [])[0] || { name: "scene", value: "0" };
}

function extractSamplerUniformNames(source) {
    const names = [];
    const code = String(source || "");
    const re = /\buniform\s+sampler[A-Za-z0-9_]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]+\])?\s*;/g;
    let match = re.exec(code);
    while (match) {
        names.push(match[1]);
        match = re.exec(code);
    }
    return names;
}

function defaultPostSamplerName(index = 0) {
    return index <= 0 ? "samp" : `samp${index + 1}`;
}

function samplerNameForNode(node, param, index = 0) {
    const declared = extractSamplerUniformNames(node?.fragmentSource || "");
    const fallback = declared[index] || defaultPostSamplerName(index);
    const raw = String(param?.name || "").trim();
    if (!raw || raw === "uParam" || raw === defaultPostSamplerName(index)) {
        return fallback;
    }
    return raw;
}

function createPostPlan(state) {
    const nodes = Array.isArray(state?.post?.nodes) ? state.post.nodes : [];
    const links = Array.isArray(state?.post?.links) ? state.post.links : [];
    const textureById = buildTextureLookup(state);
    const nodeById = buildNodeMaps(nodes);
    const incoming = incomingLinkMap(links);
    const usedVarNames = new Set();
    const usedPassNames = new Set();
    const passPlans = [];
    const firstPassVarByNode = new Map();
    const lastPassVarByNode = new Map();
    const linkLines = [];
    const customTextureBindings = [];
    const notes = [];

    for (const node of nodes) {
        if (nodeType(node) === "texture") continue;
        const passCount = nodeType(node) === "pingpong"
            ? Math.max(1, Math.min(16, Math.round(Number(node.iterations || 1))))
            : 1;
        const nodeBaseName = safeName(node.name || "pass", "pass");
        const samplerParams = getTextureParams(node.params || []);
        let previousVar = "";

        for (let iteration = 0; iteration < passCount; iteration += 1) {
            const passName = uniqueName(
                passCount > 1 ? `${safeResourceSegment(nodeBaseName)}_${iteration + 1}` : safeResourceSegment(nodeBaseName),
                usedPassNames
            );
            const varName = uniqueName(`pass_${safeName(passName, "pass")}`, usedVarNames);
            if (iteration === 0) firstPassVarByNode.set(node.id, varName);
            if (iteration === passCount - 1) lastPassVarByNode.set(node.id, varName);

            const inputLines = [];
            if (iteration === 0) {
                samplerParams.forEach((param, samplerIndex) => {
                    const samplerName = samplerNameForNode(node, param, samplerIndex);
                    const slot = postSamplerSlot(param, samplerIndex);
                    const link = incoming.get(`${node.id}:${samplerIndex}`);
                    if (!link || String(link.fromNode || "") === GRAPH_INPUT_ID) {
                        inputLines.push(`            inputSceneColor(${ktString(samplerName)}, textureSlot = ${slot})`);
                        return;
                    }

                    const sourceNode = nodeById.get(String(link.fromNode || ""));
                    if (sourceNode && nodeType(sourceNode) === "texture") {
                        inputLines.push(`            inputCustomTexture(${ktString(samplerName)}, textureSlot = ${slot})`);
                        const texParam = firstSamplerParam(sourceNode);
                        const textureId = String(texParam?.textureId || "").trim();
                        const tex = textureById.get(textureId);
                        if (tex) {
                            customTextureBindings.push({
                                samplerName,
                                resourcePath: buildUploadedTextureResourcePath(tex.name || textureId),
                                textureName: String(tex.name || textureId),
                                sourceNodeName: String(sourceNode.name || "texture")
                            });
                        } else {
                            notes.push(`Missing uploaded texture for post texture node ${String(sourceNode.name || sourceNode.id || "texture")} -> sampler ${samplerName}.`);
                        }
                        return;
                    }

                    if (sourceNode) {
                        return;
                    }

                    inputLines.push(`            inputSceneColor(${ktString(samplerName)}, optional = true, textureSlot = ${slot})`);
                    notes.push(`Sampler ${samplerName} on ${String(node.name || node.id)} had an unresolved graph link; generated optional scene color fallback.`);
                });
            } else {
                const sampler = firstSamplerParam(node);
                const samplerName = samplerNameForNode(node, sampler, 0);
                const slot = postSamplerSlot(sampler, 0);
                linkLines.push(`        ${previousVar}.asInputTo(${varName}, ${ktString(samplerName)}, textureSlot = ${slot})`);
            }

            const outputFinal = iteration === passCount - 1 && hasOutputToGraphOutput(node, links);
            passPlans.push({
                node,
                passName,
                varName,
                fragmentPath: String(node.fragmentPath || "core/post/pass.fsh"),
                inputLines,
                outputFinal
            });
            previousVar = varName;
        }

        if (passCount > 1) {
            notes.push(`${String(node.name || node.id)} was a pingpong node; generated ${passCount} explicit PostEffect passes because renderer v2 uses pass graph topology instead of PingPongShaderPipe.`);
        }
    }

    for (const link of links) {
        const fromNode = String(link?.fromNode || "");
        const toNode = String(link?.toNode || "");
        if (!fromNode || !toNode || fromNode === GRAPH_INPUT_ID || toNode === GRAPH_OUTPUT_ID) continue;
        const source = nodeById.get(fromNode);
        const target = nodeById.get(toNode);
        if (!source || !target || nodeType(source) === "texture" || nodeType(target) === "texture") continue;
        const targetSampler = getTextureParams(target.params || [])[Math.max(0, Math.round(Number(link?.toSlot || 0)))] || firstSamplerParam(target);
        const toSlot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
        const samplerName = samplerNameForNode(target, targetSampler, toSlot);
        const slot = postSamplerSlot(targetSampler, toSlot);
        const fromVar = lastPassVarByNode.get(fromNode);
        const toVar = firstPassVarByNode.get(toNode);
        if (fromVar && toVar) {
            linkLines.push(`        ${fromVar}.asInputTo(${toVar}, ${ktString(samplerName)}, textureSlot = ${slot})`);
        }
    }

    for (const link of links) {
        const fromNode = String(link?.fromNode || "");
        const toNode = String(link?.toNode || "");
        const source = nodeById.get(fromNode);
        if (toNode === GRAPH_OUTPUT_ID && source && nodeType(source) === "texture") {
            notes.push(`Texture node ${String(source.name || source.id)} is linked directly to output. Renderer v2 post chains need a shader pass to draw a custom texture to the final screen.`);
        }
    }

    return { passPlans, linkLines, customTextureBindings, notes };
}

function uniqueBindings(bindings) {
    const seen = new Set();
    const out = [];
    for (const binding of bindings) {
        const key = `${binding.samplerName}:${binding.resourcePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(binding);
    }
    return out;
}

export function generatePostKotlin(state) {
    const typeName = `${safeConstName(state?.projectName || "shader_workbench", "SHADER_WORKBENCH")}_POST`;
    const objectName = generatedClassName(state, "PostEffects");
    const typePath = `shader_builder/${projectSeed(state)}/post`;
    const plan = createPostPlan(state);
    const bindings = uniqueBindings(plan.customTextureBindings);
    const needsSceneColorCopy = plan.passPlans.some((pass) => pass.inputLines.some((line) => line.includes("inputSceneColor(")));
    const lines = createTargetHeader();

    lines.push("// Required imports:");
    lines.push("// import cn.coostack.cooparticlesapi.CooParticlesConstants");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.backend.RenderBackendCapability");
    lines.push("// import cn.coostack.cooparticlesapi.renderer.post.*");
    lines.push("// import net.minecraft.resources.ResourceLocation");
    lines.push("");
    lines.push(`object ${objectName} {`);
    lines.push(`    val ${typeName}: PostEffectType = CooPostEffectTypes.register(`);
    lines.push(`        ${resourceExpr(typePath)}`);
    lines.push("    ) {");
    lines.push("        screenQuad()");
    lines.push("        require(RenderBackendCapability.FINAL_FRAME_POST)");
    if (needsSceneColorCopy) {
        lines.push("        require(RenderBackendCapability.SCENE_COLOR_COPY)");
    }
    lines.push("");

    if (!plan.passPlans.length) {
        lines.push("        // No post pass nodes are currently defined.");
    }

    for (const pass of plan.passPlans) {
        lines.push(`        val ${pass.varName} = pass(${ktString(pass.passName)}, ${shaderExpr(pass.fragmentPath)}) {`);
        if (pass.inputLines.length) {
            lines.push(...pass.inputLines);
        }
        if (pass.outputFinal) {
            lines.push("            outputToFinalScreen()");
        } else {
            lines.push("            outputToTemporary()");
        }
        for (const param of getUniformParams(pass.node.params || [])) {
            lines.push(buildPostUniformLine(param, "            "));
        }
        lines.push("        }");
        lines.push("");
    }

    for (const line of plan.linkLines) {
        lines.push(line);
    }
    if (plan.linkLines.length) lines.push("");
    lines.push("        outputToFinalScreen()");
    lines.push("    }");
    lines.push("");
    lines.push("    fun createInstance(");
    lines.push("        durationTicks: Int = 40");
    lines.push("    ): PostEffectInstance {");
    lines.push(`        return ${typeName}.create()`);
    lines.push("            .bindScreen()");
    lines.push("            .duration(durationTicks)");
    if (bindings.length) {
        lines.push("            .params {");
        for (const binding of bindings) {
            lines.push(`                resource(${ktString(binding.samplerName)}, ${resourceExpr(binding.resourcePath)}) // ${binding.textureName}`);
        }
        lines.push("            }");
    }
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("// Usage:");
    lines.push(`// CooPostEffects.client.add(${objectName}.createInstance())`);
    lines.push("// Server sync:");
    lines.push(`// CooPostEffects.server.spawn(serverLevel, ${objectName}.createInstance())`);
    lines.push("");
    lines.push("// Notes:");
    lines.push("// 1) Sampler uniforms are declared as pass inputs. The backend binds GL texture slots and calls program.setInt for you.");
    lines.push("// 2) Uploaded post textures use inputCustomTexture(name) and must be supplied by instance params.resource(name, ResourceLocation).");
    lines.push("// 3) inputSceneColor declares SCENE_COLOR_COPY. Add inputSceneDepth manually when the shader needs scene depth.");
    lines.push("// 4) Pass shader ResourceLocation paths map to assets/<modid>/shaders/<path>.");
    for (const note of plan.notes) {
        lines.push(`// - ${note}`);
    }

    return lines.join("\n");
}

export function generateKotlin(state) {
    return `${generateModelKotlin(state)}\n\n${generatePostKotlin(state)}`;
}
