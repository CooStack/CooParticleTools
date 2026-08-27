import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GRAPH_INPUT_ID, GRAPH_OUTPUT_ID } from "./store.js";
import { boolFromString, parseVec } from "./utils.js";

const DYNAMIC_UNIFORM_NAMES = new Set(["uTime", "CameraPos"]);
const PREVIEW_CONTROL_MODE_DEFAULT = "default";
const PREVIEW_CONTROL_MODE_TOUCH = "touch";
const TOUCH_WHEEL_ROTATE_FACTOR = 0.2;

function createPrimitiveGeometry(type) {
    switch (type) {
        case "box":
            return new THREE.BoxGeometry(7, 7, 7, 20, 20, 20);
        case "torus":
            return new THREE.TorusGeometry(4, 1.2, 28, 96);
        case "torusKnot":
            return new THREE.TorusKnotGeometry(3.2, 1.1, 140, 18);
        case "plane":
            return new THREE.PlaneGeometry(10, 10, 100, 100);
        case "sphere":
        default:
            return new THREE.SphereGeometry(5, 80, 80);
    }
}

function modelBuilderNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function modelBuilderInt(value, fallback = 0, min = -Infinity, max = Infinity) {
    return Math.round(modelBuilderNumber(value, fallback, min, max));
}

function modelBuilderColor(step) {
    const parts = String(step?.color || "").split(",").map((part) => Number(part.trim()));
    const r = Number.isFinite(parts[0]) ? parts[0] : 1;
    const g = Number.isFinite(parts[1]) ? parts[1] : 1;
    const b = Number.isFinite(parts[2]) ? parts[2] : 1;
    const a = Number.isFinite(parts[3]) ? parts[3] : 1;
    return {
        color: new THREE.Color(
            Math.max(0, Math.min(1, r)),
            Math.max(0, Math.min(1, g)),
            Math.max(0, Math.min(1, b))
        ),
        alpha: Math.max(0, Math.min(1, a))
    };
}

function createModelBuilderGeometry(step) {
    const kind = String(step?.kind || "box").toLowerCase();
    if (kind === "plane") {
        return new THREE.PlaneGeometry(
            modelBuilderNumber(step.width, 1, 0.001, 1000),
            modelBuilderNumber(step.height, 1, 0.001, 1000),
            1,
            1
        );
    }
    if (kind === "sphere") {
        return new THREE.SphereGeometry(
            modelBuilderNumber(step.radius, 1, 0.001, 1000),
            modelBuilderInt(step.lonSegments, 24, 3, 256),
            modelBuilderInt(step.latSegments, 12, 2, 128)
        );
    }
    if (kind === "disc") {
        const geometry = new THREE.CircleGeometry(
            modelBuilderNumber(step.radius, 1, 0.001, 1000),
            modelBuilderInt(step.segments, 32, 3, 256)
        );
        geometry.rotateX(Math.PI / 2);
        return geometry;
    }
    if (kind === "ring") {
        const inner = modelBuilderNumber(step.innerRadius, 0.55, 0, 1000);
        const outer = Math.max(inner + 0.001, modelBuilderNumber(step.outerRadius, 1, 0.001, 1000));
        const geometry = new THREE.RingGeometry(inner, outer, modelBuilderInt(step.segments, 32, 3, 256));
        geometry.rotateX(Math.PI / 2);
        return geometry;
    }
    return new THREE.BoxGeometry(
        modelBuilderNumber(step.width, 1, 0.001, 1000),
        modelBuilderNumber(step.height, 1, 0.001, 1000),
        modelBuilderNumber(step.depth, 1, 0.001, 1000),
        1,
        1,
        1
    );
}

function createModelBuilderObject(builderState) {
    const group = new THREE.Group();
    const steps = Array.isArray(builderState?.steps) ? builderState.steps : [];
    const sourceSteps = steps.length ? steps : [{ kind: "box", width: 1, height: 1, depth: 1, color: "1,1,1,1" }];

    for (const step of sourceSteps) {
        const geometry = createModelBuilderGeometry(step);
        const colorInfo = modelBuilderColor(step);
        const material = new THREE.MeshStandardMaterial({
            color: colorInfo.color,
            roughness: 0.38,
            metalness: 0,
            transparent: colorInfo.alpha < 0.999,
            opacity: colorInfo.alpha,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            modelBuilderNumber(step.x, 0, -1000, 1000),
            modelBuilderNumber(step.y, 0, -1000, 1000),
            modelBuilderNumber(step.z, 0, -1000, 1000)
        );
        mesh.rotation.set(
            THREE.MathUtils.degToRad(modelBuilderNumber(step.rotX, 0, -3600, 3600)),
            THREE.MathUtils.degToRad(modelBuilderNumber(step.rotY, 0, -3600, 3600)),
            THREE.MathUtils.degToRad(modelBuilderNumber(step.rotZ, 0, -3600, 3600))
        );
        mesh.scale.set(
            modelBuilderNumber(step.scaleX, 1, -1000, 1000),
            modelBuilderNumber(step.scaleY, 1, -1000, 1000),
            modelBuilderNumber(step.scaleZ, 1, -1000, 1000)
        );
        group.add(mesh);
    }
    return group;
}

function normalizeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizePreviewControlMode(mode) {
    const v = String(mode || PREVIEW_CONTROL_MODE_DEFAULT).toLowerCase();
    return v === PREVIEW_CONTROL_MODE_TOUCH ? PREVIEW_CONTROL_MODE_TOUCH : PREVIEW_CONTROL_MODE_DEFAULT;
}

function parseSamplerSlot(value, fallback = 0) {
    const n = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(n)) return Math.max(0, Math.round(Number(fallback) || 0));
    return Math.max(0, n);
}

function createWhiteTexture() {
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
}

const PREVIEW_POST_VERTEX_GLSL1 = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`.trim();

const PREVIEW_POST_VERTEX_GLSL3 = `
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`.trim();

function adaptTextureSizeMathForPreview(source) {
    let code = String(source || "");
    // GLSL 3.30 textureSize(sampler2D, lod) returns ivec2.
    // Cast to vec2 in common texel-size math to avoid int/float mismatch.
    code = code.replace(
        /(\b(?:\d+(?:\.\d+)?|\.\d+)\b)\s*\/\s*textureSize\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^)]+?)\s*\)/g,
        "$1 / vec2(textureSize($2, $3))"
    );
    code = code.replace(
        /(\bvec2\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*)textureSize\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^)]+?)\s*\)/g,
        "$1vec2(textureSize($2, $3))"
    );
    return code;
}

function collectSamplerUniformNames(source) {
    const text = String(source || "")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, "");
    const names = [];
    const seen = new Set();
    const re = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler2D\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]+\])?\s*;/g;
    let match = re.exec(text);
    while (match) {
        const name = String(match[1] || "").trim();
        if (name && !seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
        match = re.exec(text);
    }
    return names;
}

function escapeRegexLiteral(source) {
    return String(source || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAndCollectVec4FragmentOutputs(source) {
    let code = String(source || "");
    const outputs = [];
    const seen = new Set();
    const addOutput = (name, location = null) => {
        const key = String(name || "").trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const hasLocation = location !== null && location !== undefined && Number.isFinite(Number(location));
        outputs.push({
            name: key,
            location: hasLocation ? Math.max(0, Math.round(Number(location))) : null
        });
    };

    code = code.replace(
        /^\s*(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*(?:\/\/.*)?$/gm,
        (_, location, name) => {
            addOutput(name, location);
            return "";
        }
    );

    return { code, outputs };
}

function resolvePrimaryFragmentOutput(outputs = [], preferredOutputSlot = null) {
    const list = Array.isArray(outputs) ? outputs : [];
    const preferredSlot = Number(preferredOutputSlot);
    if (Number.isFinite(preferredSlot)) {
        const normalizedSlot = Math.max(0, Math.round(preferredSlot));
        for (const output of list) {
            const rawLocation = output?.location;
            const hasLocation = rawLocation !== null && rawLocation !== undefined && Number.isFinite(Number(rawLocation));
            if (!hasLocation) continue;
            if (Math.max(0, Math.round(Number(rawLocation))) !== normalizedSlot) continue;
            const name = String(output?.name || "").trim();
            if (name) return name;
        }
        if (normalizedSlot < list.length) {
            const name = String(list[normalizedSlot]?.name || "").trim();
            if (name) return name;
        }
    }
    for (const output of list) {
        const rawLocation = output?.location;
        const hasLocation = rawLocation !== null && rawLocation !== undefined && Number.isFinite(Number(rawLocation));
        if (!hasLocation) continue;
        if (Math.max(0, Math.round(Number(rawLocation))) !== 0) continue;
        const name = String(output?.name || "").trim();
        if (name) return name;
    }
    return String(list[0]?.name || "").trim();
}

function injectGlobalDeclsAfterPreamble(source, declarations = []) {
    const decls = (Array.isArray(declarations) ? declarations : [])
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    if (!decls.length) return String(source || "");

    const lines = String(source || "").split("\n");
    let insertAt = 0;
    while (insertAt < lines.length) {
        const trimmed = String(lines[insertAt] || "").trim();
        if (!trimmed || /^#/.test(trimmed) || /^precision\b/.test(trimmed)) {
            insertAt += 1;
            continue;
        }
        break;
    }
    lines.splice(insertAt, 0, ...decls);
    return lines.join("\n");
}

function adaptFragmentOutputsForSingleTarget(source, outputs = [], {
    useGlsl3 = false,
    preferredOutputSlot = 0
} = {}) {
    let code = String(source || "");
    const list = Array.isArray(outputs) ? outputs : [];
    const primaryOutput = resolvePrimaryFragmentOutput(list, preferredOutputSlot);
    const declsToInject = [];
    const previewPrimaryOut = "sbFragColor";

    if (useGlsl3) {
        let glsl3Primary = String(primaryOutput || "").trim();
        if (!glsl3Primary && /\bgl_FragColor\b/.test(code)) {
            glsl3Primary = "gl_FragColor";
        }

        if (glsl3Primary && glsl3Primary !== previewPrimaryOut && glsl3Primary !== "gl_FragColor") {
            code = code.replace(new RegExp(`\\b${escapeRegexLiteral(glsl3Primary)}\\b`, "g"), previewPrimaryOut);
        }
        code = code.replace(/\bgl_FragColor\b/g, previewPrimaryOut);
        declsToInject.push(`layout(location = 0) out vec4 ${previewPrimaryOut};`);

        for (const output of list) {
            const name = String(output?.name || "").trim();
            if (!name || name === "gl_FragColor" || name === glsl3Primary || name === previewPrimaryOut) continue;
            declsToInject.push(`vec4 ${name};`);
        }
    } else {
        for (const output of list) {
            const name = String(output?.name || "").trim();
            if (!name || name === "gl_FragColor") continue;
            if (name === primaryOutput) {
                code = code.replace(new RegExp(`\\b${escapeRegexLiteral(name)}\\b`, "g"), "gl_FragColor");
                continue;
            }
            declsToInject.push(`vec4 ${name};`);
        }

        if (!list.length && /\bout\s+vec4\s+/.test(code) === false && /\bgl_FragColor\b/.test(code) === false) {
            return code;
        }
    }

    if (declsToInject.length) {
        code = injectGlobalDeclsAfterPreamble(code, declsToInject);
    }

    return code;
}

function adaptPostFragmentForPreview(source, {
    useGlsl3 = false,
    preferredOutputSlot = 0
} = {}) {
    let code = String(source || "");
    code = code.replace(/\r\n/g, "\n");
    // Convert common MC fragment styles into a stable preview form.
    code = code.replace(/^\s*#version[^\n]*\n?/gm, "");
    const postOutputs = stripAndCollectVec4FragmentOutputs(code);
    code = postOutputs.code;

    if (useGlsl3) {
        code = code.replace(/^\s*(in|out)\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*(in|out)\s+vec2\s+vUv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+vUv\s*;\s*$/gm, "");
    } else {
        // ShaderPass GLSL1 preview compatibility path.
        code = code.replace(/^\s*(in|out)\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*(in|out)\s+vec2\s+vUv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+screen_uv\s*;\s*$/gm, "");
        code = code.replace(/^\s*varying\s+vec2\s+vUv\s*;\s*$/gm, "");
    }

    code = code.replace(/\bscreen_uv\b/g, "vUv");

    // ShaderMaterial(GLSL3) already injects its own fragment output.
    // Preview path only has one render target: keep location=0/first output as color.
    code = adaptFragmentOutputsForSingleTarget(code, postOutputs.outputs, { useGlsl3, preferredOutputSlot });

    if (useGlsl3) {
        code = code.replace(/\btexture2D\s*\(/g, "texture(");
    } else {
        code = code.replace(/\btexture\s*\(/g, "texture2D(");
    }
    code = adaptTextureSizeMathForPreview(code);

    if (useGlsl3) {
        if (!/\bin\b[^\n;]*\bvUv\b[^\n;]*;/.test(code)) {
            code = `in vec2 vUv;\n${code}`;
        }
    } else if (!/\bvarying\b[^\n;]*\bvUv\b[^\n;]*;/.test(code)) {
        code = `varying vec2 vUv;\n${code}`;
    }

    return code;
}

function adaptModelVertexForPreview(source, { useGlsl3 = false } = {}) {
    let code = String(source || "");
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/^\s*#version[^\n]*\n?/gm, "");
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*in\s+[A-Za-z0-9_]+\s+(pos|position|normal|uv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*(attribute|in)\s+[A-Za-z0-9_]+\s+(pos|position|normal|uv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*layout\s*\(\s*location\s*=\s*\d+\s*\)\s*in\s+[A-Za-z0-9_]+\s+(aPos|aNormal|aUv)\s*;\s*$/gm, "");
    code = code.replace(/^\s*(attribute|in)\s+[A-Za-z0-9_]+\s+(aPos|aNormal|aUv)\s*;\s*$/gm, "");
    if (useGlsl3) {
        code = code.replace(/^\s*varying\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, "out $1 $2;");
        code = code.replace(/\battribute\b/g, "in");
    } else {
        code = code.replace(/^\s*out\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, "varying $1 $2;");
    }
    code = code.replace(/\bpos\b/g, "position");
    code = code.replace(/\baPos\b/g, "position");
    code = code.replace(/\baNormal\b/g, "normal");
    code = code.replace(/\baUv\b/g, "uv");
    return code;
}

function adaptModelFragmentForPreview(source, { useGlsl3 = false } = {}) {
    let code = String(source || "");
    code = code.replace(/\r\n/g, "\n");
    code = code.replace(/^\s*#version[^\n]*\n?/gm, "");
    const modelOutputs = stripAndCollectVec4FragmentOutputs(code);
    code = modelOutputs.code;
    if (useGlsl3) {
        code = code.replace(/^\s*varying\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, "in $1 $2;");
    } else {
        code = code.replace(/^\s*in\s+([A-Za-z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;\s*$/gm, "varying $1 $2;");
    }
    code = adaptFragmentOutputsForSingleTarget(code, modelOutputs.outputs, { useGlsl3 });
    if (useGlsl3) {
        code = code.replace(/\btexture2D\s*\(/g, "texture(");
    } else {
        code = code.replace(/\btexture\s*\(/g, "texture2D(");
    }
    code = adaptTextureSizeMathForPreview(code);
    return code;
}

function resolveChain(state) {
    const links = Array.isArray(state?.post?.links) ? state.post.links : [];
    const nodeMap = new Map((state?.post?.nodes || []).map((n) => [String(n.id || ""), n]));
    const adjacency = new Map();
    const reverse = new Map();
    const indegree = new Map();
    for (const nodeId of nodeMap.keys()) {
        indegree.set(nodeId, 0);
        reverse.set(nodeId, []);
    }
    reverse.set(GRAPH_OUTPUT_ID, []);

    for (const link of links) {
        const fromNode = String(link?.fromNode || "");
        const toNode = String(link?.toNode || "");
        if (!fromNode || !toNode) continue;

        if (!adjacency.has(fromNode)) adjacency.set(fromNode, []);
        adjacency.get(fromNode).push(link);

        if (!reverse.has(toNode)) reverse.set(toNode, []);
        reverse.get(toNode).push(link);

        if (nodeMap.has(toNode) && fromNode !== GRAPH_INPUT_ID) {
            indegree.set(toNode, (indegree.get(toNode) || 0) + 1);
        }
    }

    for (const arr of adjacency.values()) {
        arr.sort((a, b) => Number(a.fromSlot || 0) - Number(b.fromSlot || 0));
    }

    // Reachable post nodes from input and whether output is reachable from input chain.
    const reachable = new Set();
    let hasOutputConnection = false;
    const bfs = [GRAPH_INPUT_ID];

    // Source-style nodes (e.g. texture node) may have zero inputs and should be
    // considered reachable even without links from system input.
    for (const [nodeId, node] of nodeMap.entries()) {
        const inputCount = Number(node?.inputs ?? 1);
        if (Number.isFinite(inputCount) && inputCount <= 0 && !reachable.has(nodeId)) {
            reachable.add(nodeId);
            bfs.push(nodeId);
        }
    }

    for (let i = 0; i < bfs.length; i++) {
        const cur = bfs[i];
        for (const edge of adjacency.get(cur) || []) {
            const toNode = String(edge.toNode || "");
            if (!toNode) continue;
            if (toNode === GRAPH_OUTPUT_ID) {
                hasOutputConnection = true;
                continue;
            }
            if (!nodeMap.has(toNode) || reachable.has(toNode)) continue;
            reachable.add(toNode);
            bfs.push(toNode);
        }
    }

    // Keep only nodes that can eventually reach Output.
    const canReachOutput = new Set();
    const bfsBack = [GRAPH_OUTPUT_ID];
    for (let i = 0; i < bfsBack.length; i += 1) {
        const cur = bfsBack[i];
        for (const edge of reverse.get(cur) || []) {
            const fromNode = String(edge.fromNode || "");
            if (!nodeMap.has(fromNode) || canReachOutput.has(fromNode)) continue;
            canReachOutput.add(fromNode);
            bfsBack.push(fromNode);
        }
    }

    const active = new Set([...reachable].filter((id) => canReachOutput.has(id)));
    if (!active.size) {
        return {
            chain: [],
            hasOutputConnection
        };
    }

    for (const nodeId of active) {
        let n = 0;
        for (const edge of reverse.get(nodeId) || []) {
            const fromNode = String(edge.fromNode || "");
            if (fromNode === GRAPH_INPUT_ID || active.has(fromNode)) n += 1;
        }
        indegree.set(nodeId, n);
    }

    const queue = [];
    for (const nodeId of active) {
        if ((indegree.get(nodeId) || 0) === 0) queue.push(nodeId);
    }

    const order = [];
    while (queue.length) {
        const cur = queue.shift();
        if (!cur) continue;
        order.push(cur);
        for (const edge of adjacency.get(cur) || []) {
            const toNode = String(edge.toNode || "");
            if (!active.has(toNode)) continue;
            const next = (indegree.get(toNode) || 0) - 1;
            indegree.set(toNode, next);
            if (next === 0) queue.push(toNode);
        }
    }

    // Fallback for cyclic graphs: append unprocessed active nodes.
    if (order.length < active.size) {
        for (const nodeId of active) {
            if (!order.includes(nodeId)) order.push(nodeId);
        }
    }

    return {
        chain: order.map((id) => nodeMap.get(id)).filter(Boolean),
        hasOutputConnection
    };
}

export class ShaderWorkbenchRenderer {
    constructor({ hostEl, onStatus = () => {} }) {
        this.hostEl = hostEl;
        this.onStatus = onStatus;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1017);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 2000);
        this.camera.position.set(12, 9, 12);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setSize(10, 10, false);
        this.syncThemeFromDom();

        this.hostEl.appendChild(this.renderer.domElement);
        this.renderer.domElement.addEventListener("contextmenu", (ev) => ev.preventDefault());
        this.renderer.domElement.tabIndex = 0;
        this.renderer.domElement.setAttribute("aria-label", "Shader preview canvas");

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 0, 0);

        this.previewControlMode = PREVIEW_CONTROL_MODE_DEFAULT;
        this.applyPreviewControlMode(PREVIEW_CONTROL_MODE_DEFAULT);

        this.worldRoot = new THREE.Group();
        this.helperRoot = new THREE.Group();
        this.scene.add(this.worldRoot);
        this.scene.add(this.helperRoot);

        this.axesHelper = new THREE.AxesHelper(8);
        this.gridHelper = new THREE.GridHelper(40, 40, 0x405060, 0x263341);
        this.helperRoot.add(this.axesHelper);
        this.helperRoot.add(this.gridHelper);

        this.worldRoot.add(new THREE.HemisphereLight(0xb3d4ff, 0x0f141d, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 1.15);
        dir.position.set(4, 9, 5);
        this.worldRoot.add(dir);

        this.modelRoot = new THREE.Group();
        this.worldRoot.add(this.modelRoot);

        this.clock = new THREE.Clock();
        this.time = 0;

        this.fallbackTexture = createWhiteTexture();
        this.textureCache = new Map();
        this.worldDepthMaterial = new THREE.MeshDepthMaterial();
        this.worldDepthMaterial.depthTest = true;
        this.worldDepthMaterial.depthWrite = true;
        this.worldDepthMaterial.colorWrite = false;
        this.copySize = new THREE.Vector2();
        this.nodeOutputCopyScene = new THREE.Scene();
        this.nodeOutputCopyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.nodeOutputCopyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tInput: { value: null }
            },
            vertexShader: PREVIEW_POST_VERTEX_GLSL1,
            fragmentShader: "varying vec2 vUv;\nuniform sampler2D tInput;\nvoid main(){ gl_FragColor = texture2D(tInput, vUv); }",
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        this.nodeOutputCopyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.nodeOutputCopyMaterial);
        this.nodeOutputCopyQuad.frustumCulled = false;
        this.nodeOutputCopyScene.add(this.nodeOutputCopyQuad);

        this.modelObject = null;
        this.modelMaterial = null;
        this.modelGeometryMode = "";
        this.modelGeometrySignature = "";
        this.composer = null;
        this.renderPass = null;
        this.passStates = [];
        this.useComposer = false;
        this.noOutputPreview = false;
        this.systemInputTexture = null;
        this.nodeOutputTextures = new Map();
        this.nodeOutputRenderTargets = new Map();
        this.nodeGroupInputTextures = new Map();
        this.helpersIndependentRender = true;

        this.keyPanState = {
            left: false,
            right: false,
            up: false,
            down: false
        };
        this.panMove = new THREE.Vector3();
        this.panRight = new THREE.Vector3();
        this.panUp = new THREE.Vector3();
        this.onCanvasPointerdown = () => {
            try {
                this.renderer.domElement.focus({ preventScroll: true });
            } catch {
                this.renderer.domElement.focus();
            }
        };
        this.onCanvasKeydown = (ev) => {
            if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
            let handled = true;
            if (ev.code === "ArrowLeft") this.keyPanState.left = true;
            else if (ev.code === "ArrowRight") this.keyPanState.right = true;
            else if (ev.code === "ArrowUp") this.keyPanState.up = true;
            else if (ev.code === "ArrowDown") this.keyPanState.down = true;
            else handled = false;

            if (handled) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        };
        this.onCanvasKeyup = (ev) => {
            let handled = true;
            if (ev.code === "ArrowLeft") this.keyPanState.left = false;
            else if (ev.code === "ArrowRight") this.keyPanState.right = false;
            else if (ev.code === "ArrowUp") this.keyPanState.up = false;
            else if (ev.code === "ArrowDown") this.keyPanState.down = false;
            else handled = false;

            if (handled) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        };
        this.onCanvasBlur = () => this.clearPanKeys();
        this.onWindowBlur = () => this.clearPanKeys();
        this.onCanvasWheel = (ev) => {
            if (this.previewControlMode !== PREVIEW_CONTROL_MODE_TOUCH) return;
            if (ev.ctrlKey || ev.metaKey) return;

            ev.preventDefault();
            ev.stopImmediatePropagation();

            try {
                this.renderer.domElement.focus({ preventScroll: true });
            } catch {
                this.renderer.domElement.focus();
            }

            let dx = Number(ev.deltaX) || 0;
            let dy = Number(ev.deltaY) || 0;
            if (ev.deltaMode === 1) {
                dx *= 16;
                dy *= 16;
            } else if (ev.deltaMode === 2) {
                const h = Math.max(1, this.renderer.domElement.clientHeight || 1);
                dx *= h;
                dy *= h;
            }

            const h = Math.max(1, this.renderer.domElement.clientHeight || 1);
            const rotateUnit = (2 * Math.PI / h) * (Number(this.controls.rotateSpeed) || 1) * TOUCH_WHEEL_ROTATE_FACTOR;
            if (Math.abs(dy) > 0.0001) this.controls._rotateUp(dy * rotateUnit);
            if (Math.abs(dx) > 0.0001) this.controls._rotateLeft(dx * rotateUnit);
            this.controls.update();
        };
        this.wheelListenerOptions = { passive: false, capture: true };
        this.renderer.domElement.addEventListener("pointerdown", this.onCanvasPointerdown);
        this.renderer.domElement.addEventListener("keydown", this.onCanvasKeydown);
        this.renderer.domElement.addEventListener("keyup", this.onCanvasKeyup);
        this.renderer.domElement.addEventListener("wheel", this.onCanvasWheel, this.wheelListenerOptions);
        this.renderer.domElement.addEventListener("blur", this.onCanvasBlur);
        window.addEventListener("blur", this.onWindowBlur);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.hostEl);

        this.setPrimitive("sphere");
        this.resize();

        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    getPreviewSceneColor() {
        if (!document?.body) return "#0b1017";
        return getComputedStyle(document.body).getPropertyValue("--wb-preview-scene").trim() || "#0b1017";
    }

    syncThemeFromDom() {
        const previewSceneColor = this.getPreviewSceneColor();
        this.scene.background = new THREE.Color(previewSceneColor);
        this.renderer.setClearColor(previewSceneColor, 1);
    }

    dispose() {
        this.resizeObserver.disconnect();
        this.renderer.domElement.removeEventListener("pointerdown", this.onCanvasPointerdown);
        this.renderer.domElement.removeEventListener("keydown", this.onCanvasKeydown);
        this.renderer.domElement.removeEventListener("keyup", this.onCanvasKeyup);
        this.renderer.domElement.removeEventListener("wheel", this.onCanvasWheel, this.wheelListenerOptions);
        this.renderer.domElement.removeEventListener("blur", this.onCanvasBlur);
        window.removeEventListener("blur", this.onWindowBlur);
        this.controls.dispose();
        this.renderer.dispose();
        this.fallbackTexture.dispose();
        this.worldDepthMaterial.dispose();
        this.disposeNodeOutputCache();
        this.nodeOutputCopyMaterial?.dispose?.();
        this.nodeOutputCopyQuad?.geometry?.dispose?.();
        for (const item of this.textureCache.values()) {
            item.texture?.dispose();
        }
        this.textureCache.clear();
    }

    resize() {
        const rect = this.hostEl.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
        this.composer?.setSize(w, h);
    }

    resetCamera() {
        this.camera.position.set(12, 9, 12);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.hostEl.requestFullscreen?.();
            return;
        }
        document.exitFullscreen?.();
    }

    applyPreviewControlMode(mode) {
        const finalMode = normalizePreviewControlMode(mode);
        this.previewControlMode = finalMode;
        this.controls.mouseButtons.LEFT = finalMode === PREVIEW_CONTROL_MODE_TOUCH
            ? THREE.MOUSE.DOLLY
            : null;
        this.controls.mouseButtons.MIDDLE = finalMode === PREVIEW_CONTROL_MODE_TOUCH
            ? null
            : THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    }

    applySettings(settings) {
        this.syncThemeFromDom();
        this.axesHelper.visible = !!settings?.showAxes;
        this.gridHelper.visible = !!settings?.showGrid;
        this.helpersIndependentRender = !!settings?.helpersIndependentRender;
        this.applyPreviewControlMode(settings?.previewControlMode);
        const fov = normalizeNumber(settings?.cameraFov, 60);
        if (Math.abs(this.camera.fov - fov) > 0.0001) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
    }

    setPrimitive(primitive) {
        const kind = String(primitive || "sphere");
        const geometry = createPrimitiveGeometry(kind);
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
                color: 0x88ccff,
                roughness: 0.3,
                metalness: 0.0,
                side: THREE.DoubleSide
            })
        );
        this.modelGeometryMode = "primitive";
        this.modelGeometrySignature = `primitive:${kind}`;
        this.replaceModel(mesh);
    }

    setModelBuilder(builderState) {
        const signature = `builder:${JSON.stringify(Array.isArray(builderState?.steps) ? builderState.steps : [])}`;
        if (this.modelGeometryMode === "builder" && this.modelGeometrySignature === signature) return;
        this.modelGeometryMode = "builder";
        this.modelGeometrySignature = signature;
        this.replaceModel(createModelBuilderObject(builderState));
    }

    syncModelGeometryFromState(modelState) {
        const builder = modelState?.builder;
        const builderEnabled = !!builder?.enabled && Array.isArray(builder.steps) && builder.steps.length > 0;
        if (builderEnabled) {
            this.setModelBuilder(builder);
            return;
        }
        if (this.modelGeometryMode === "builder") {
            this.setPrimitive(modelState?.primitive || "sphere");
        }
    }

    replaceModel(object3d) {
        if (this.modelObject) {
            this.modelRoot.remove(this.modelObject);
            this.disposeModel(this.modelObject);
        }
        this.modelObject = object3d;
        this.modelRoot.add(object3d);
        this.centerAndScaleModel(object3d);
        if (this.modelMaterial) this.applyMaterialToModel(this.modelMaterial);
    }

    disposeModel(object) {
        object.traverse?.((child) => {
            if (child.isMesh) {
                child.geometry?.dispose?.();
                const mat = child.material;
                const disposeMaterial = (m) => {
                    if (!m || m === this.modelMaterial) return;
                    m.dispose?.();
                };
                if (Array.isArray(mat)) mat.forEach(disposeMaterial);
                else disposeMaterial(mat);
            }
        });
    }

    centerAndScaleModel(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const maxEdge = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 10 / maxEdge;
        object.scale.setScalar(scale);

        const box2 = new THREE.Box3().setFromObject(object);
        const center = box2.getCenter(new THREE.Vector3());
        object.position.sub(center);
    }

    applyMaterialToModel(material) {
        if (!this.modelObject) return;
        this.modelObject.traverse((child) => {
            if (!child.isMesh) return;
            const current = child.material;
            const disposePrevious = (m) => {
                if (!m || m === material || m === this.modelMaterial) return;
                m.dispose?.();
            };
            if (Array.isArray(current)) current.forEach(disposePrevious);
            else disposePrevious(current);
            child.material = material;
        });
    }

    async loadModelFile(file) {
        const name = String(file?.name || "");
        const ext = name.split(".").pop()?.toLowerCase() || "";

        if (ext === "obj") {
            const text = await file.text();
            const loader = new OBJLoader();
            const obj = loader.parse(text);
            this.replaceModel(obj);
            this.modelGeometryMode = "upload";
            this.modelGeometrySignature = `upload:${name}`;
            return name;
        }

        if (ext === "glb" || ext === "gltf") {
            const buf = await file.arrayBuffer();
            const loader = new GLTFLoader();
            const scene = await new Promise((resolve, reject) => {
                loader.parse(buf, "", (gltf) => resolve(gltf.scene), (err) => reject(err));
            });
            this.replaceModel(scene);
            this.modelGeometryMode = "upload";
            this.modelGeometrySignature = `upload:${name}`;
            return name;
        }

        throw new Error("暂不支持该模型格式，请使用 .glb .gltf .obj");
    }

    rebuildTextureCache(textures) {
        const incoming = new Map((textures || []).map((t) => [t.id, t]));

        for (const id of Array.from(this.textureCache.keys())) {
            if (!incoming.has(id)) {
                const old = this.textureCache.get(id);
                old?.texture?.dispose?.();
                this.textureCache.delete(id);
            }
        }

        const loader = new THREE.TextureLoader();
        for (const texDef of incoming.values()) {
            const existing = this.textureCache.get(texDef.id);
            if (existing && existing.source === texDef.dataUrl) continue;

            const texture = loader.load(texDef.dataUrl || "", () => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.colorSpace = THREE.SRGBColorSpace;
            });
            this.textureCache.set(texDef.id, {
                source: texDef.dataUrl,
                texture
            });
        }
    }

    paramToUniform(param) {
        const type = String(param?.type || "float").toLowerCase();
        const value = param?.value ?? "";
        const useExpr = String(param?.valueSource || "value").toLowerCase() === "uniform";
        const expr = String(param?.valueExpr || "").trim();

        // Built-in dynamic uniform expression for preview.
        if (type === "vec3" && useExpr && expr === "CameraPos") {
            return { value: this.camera.position };
        }

        if (type === "int") return { value: Math.round(normalizeNumber(value, 0)) };
        if (type === "bool") return { value: boolFromString(value, false) };
        if (type === "vec2") {
            const vec = parseVec(String(value), 2) || [0, 0];
            return { value: new THREE.Vector2(vec[0], vec[1]) };
        }
        if (type === "vec3") {
            const vec = parseVec(String(value), 3) || [1, 1, 1];
            return { value: new THREE.Vector3(vec[0], vec[1], vec[2]) };
        }
        if (type === "texture") {
            let tex = this.fallbackTexture;
            if (param?.sourceType === "upload" && param?.textureId) {
                tex = this.textureCache.get(param.textureId)?.texture || this.fallbackTexture;
            }
            // connection 类型目前作为构建信息保留，预览阶段回落到上传纹理或白图。
            return { value: tex };
        }
        return { value: normalizeNumber(value, 0) };
    }

    buildUniformMap(params, includeTime = true) {
        const uniforms = {};
        if (includeTime) uniforms.uTime = { value: this.time };
        for (const param of params || []) {
            const name = String(param?.name || "").trim();
            if (!name) continue;
            if (DYNAMIC_UNIFORM_NAMES.has(name)) continue;
            uniforms[name] = this.paramToUniform(param);
        }
        if (!uniforms.CameraPos) uniforms.CameraPos = { value: this.camera.position };
        return uniforms;
    }

    makeNodeOutputKey(nodeId, slot = 0) {
        const id = String(nodeId || "").trim();
        if (!id) return "";
        return `${id}#${Math.max(0, Math.round(Number(slot || 0)))}`;
    }

    resolveNodeOutputTexture(binding, fallbackTexture = null) {
        if (!binding || binding.kind !== "nodeOutput") return fallbackTexture || null;
        const nodeId = String(binding.nodeId || "").trim();
        if (!nodeId) return fallbackTexture || null;
        const slot = Math.max(0, Math.round(Number(binding.slot || 0)));
        const key = this.makeNodeOutputKey(nodeId, slot);
        if (key && this.nodeOutputTextures.has(key)) return this.nodeOutputTextures.get(key) || null;
        if (slot === 0 && this.nodeOutputTextures.has(nodeId)) return this.nodeOutputTextures.get(nodeId) || null;
        return fallbackTexture || null;
    }

    sanitizeSampleTexture(texture, writeTexture, fallbacks = []) {
        if (!texture) return null;
        if (!writeTexture || texture !== writeTexture) return texture;
        for (const item of fallbacks || []) {
            if (item && item !== writeTexture) return item;
        }
        return null;
    }

    getNodeOutputRenderTarget(key, sourceTexture) {
        if (!key || !sourceTexture || !this.renderer) return null;
        const drawingSize = this.renderer.getDrawingBufferSize(this.copySize);
        const width = Math.max(1, Math.round(Number(drawingSize.x || 1)));
        const height = Math.max(1, Math.round(Number(drawingSize.y || 1)));
        const sourceFormat = sourceTexture.format || THREE.RGBAFormat;
        const sourceType = sourceTexture.type || THREE.UnsignedByteType;

        let target = this.nodeOutputRenderTargets.get(key) || null;
        const needsRecreate = !target
            || target.width !== width
            || target.height !== height
            || target.texture?.format !== sourceFormat
            || target.texture?.type !== sourceType;
        if (needsRecreate) {
            if (target) target.dispose();
            target = new THREE.WebGLRenderTarget(width, height, {
                minFilter: sourceTexture.minFilter || THREE.LinearFilter,
                magFilter: sourceTexture.magFilter || THREE.LinearFilter,
                format: sourceFormat,
                type: sourceType,
                depthBuffer: false,
                stencilBuffer: false
            });
            if ("colorSpace" in target.texture && "colorSpace" in sourceTexture) {
                target.texture.colorSpace = sourceTexture.colorSpace;
            }
            this.nodeOutputRenderTargets.set(key, target);
        }
        return target;
    }

    cacheNodeOutputTexture(renderer, nodeId, slot, sourceTexture) {
        const id = String(nodeId || "").trim();
        if (!id || !renderer || !sourceTexture) return;
        const normalizedSlot = Math.max(0, Math.round(Number(slot || 0)));
        const key = this.makeNodeOutputKey(id, normalizedSlot);
        if (!key) return;
        const target = this.getNodeOutputRenderTarget(key, sourceTexture);
        if (!target || !this.nodeOutputCopyMaterial || !this.nodeOutputCopyScene || !this.nodeOutputCopyCamera) return;

        const prevTarget = renderer.getRenderTarget();
        const prevAutoClear = renderer.autoClear;
        this.nodeOutputCopyMaterial.uniforms.tInput.value = sourceTexture;
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
        renderer.render(this.nodeOutputCopyScene, this.nodeOutputCopyCamera);
        renderer.setRenderTarget(prevTarget);
        renderer.autoClear = prevAutoClear;

        this.nodeOutputTextures.set(key, target.texture);
        if (normalizedSlot === 0) this.nodeOutputTextures.set(id, target.texture);
    }

    disposeNodeOutputCache() {
        for (const target of this.nodeOutputRenderTargets.values()) {
            target?.dispose?.();
        }
        this.nodeOutputRenderTargets.clear();
        this.nodeOutputTextures.clear();
        this.nodeGroupInputTextures.clear();
    }

    applyModelShader(modelState) {
        if (!modelState?.shader) return;
        const shader = modelState.shader;
        const useGlsl3 = !!this.renderer?.capabilities?.isWebGL2;

        const uniforms = this.buildUniformMap(shader.params || [], true);
        if (!uniforms.uColor) uniforms.uColor = { value: new THREE.Vector3(0.3, 0.8, 1.0) };
        if (!uniforms.uWaveAmp) uniforms.uWaveAmp = { value: 0.15 };
        if (!uniforms.projMat) uniforms.projMat = { value: new THREE.Matrix4() };
        if (!uniforms.viewMat) uniforms.viewMat = { value: new THREE.Matrix4() };
        if (!uniforms.transMat) uniforms.transMat = { value: new THREE.Matrix4() };

        const previewVertex = adaptModelVertexForPreview(shader.vertexSource, { useGlsl3 });
        const previewFragment = adaptModelFragmentForPreview(shader.fragmentSource, { useGlsl3 });

        const materialOptions = {
            vertexShader: previewVertex,
            fragmentShader: previewFragment,
            uniforms,
            side: THREE.DoubleSide,
            transparent: true
        };
        if (useGlsl3) materialOptions.glslVersion = THREE.GLSL3;

        const material = new THREE.ShaderMaterial(materialOptions);

        this.modelMaterial = material;
        this.applyMaterialToModel(material);
        this.onStatus({ shader: "着色器：模型已更新" });
    }

    createShaderPassFromNode(node, incomingLinks = [], runtime = {}) {
        if (String(node?.type || "").toLowerCase() === "texture") {
            return this.createTextureNodePass(node, incomingLinks, runtime);
        }

        const useGlsl3 = !!this.renderer?.capabilities?.isWebGL2;
        const outputSlot = Math.max(0, Math.round(Number(runtime?.outputSlot || 0)));
        const renderGroupKey = String(runtime?.renderGroupKey || "");
        const fragmentSource = adaptPostFragmentForPreview(node?.fragmentSource || "", {
            useGlsl3,
            preferredOutputSlot: outputSlot
        });
        const uniforms = this.buildUniformMap(node.params || [], true);

        const incomingBySlot = new Map();
        for (const link of incomingLinks || []) {
            const slot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
            if (!incomingBySlot.has(slot)) incomingBySlot.set(slot, link);
        }
        const mapLinkToBinding = (link) => {
            if (!link || typeof link !== "object") return null;
            const fromNode = String(link?.fromNode || "");
            if (!fromNode) return null;
            if (fromNode === GRAPH_INPUT_ID) return { kind: "graphInput" };
            return {
                kind: "nodeOutput",
                nodeId: fromNode,
                slot: Math.max(0, Math.round(Number(link?.fromSlot || 0)))
            };
        };

        const samplerUniformNames = collectSamplerUniformNames(node?.fragmentSource || "");
        const uploadedTextureUniforms = new Set();
        const inputSamplerUniforms = [];
        const inputBindings = new Map();
        const takenInputSlots = new Set();
        const addInputSampler = (name) => {
            const n = String(name || "").trim();
            if (!n) return;
            if (uploadedTextureUniforms.has(n)) return;
            if (!inputSamplerUniforms.includes(n)) inputSamplerUniforms.push(n);
        };
        const reserveSlot = (slot, { allowAutoBump = false } = {}) => {
            let next = Math.max(0, Math.round(Number(slot || 0)));
            if (allowAutoBump) {
                while (takenInputSlots.has(next)) next += 1;
            }
            takenInputSlots.add(next);
            return next;
        };

        let nextFallbackSlot = 0;
        for (const param of node?.params || []) {
            if (String(param?.type || "").toLowerCase() !== "texture") continue;
            const uniformName = String(param?.name || "").trim();
            if (!uniformName) continue;
            const sourceType = String(param?.sourceType || "value").toLowerCase();
            if (sourceType === "upload") {
                uploadedTextureUniforms.add(uniformName);
                continue;
            }

            addInputSampler(uniformName);
            let binding = null;
            if (sourceType === "value") {
                const rawValue = String(param?.value ?? "").trim();
                const rawConnection = String(param?.connection || "").trim();
                const autoDefault = (!rawValue || rawValue === "0") && !rawConnection;
                let slot = parseSamplerSlot(param?.value, nextFallbackSlot);
                slot = reserveSlot(slot, { allowAutoBump: autoDefault });
                nextFallbackSlot = Math.max(nextFallbackSlot, slot + 1);
                binding = mapLinkToBinding(incomingBySlot.get(slot));
            } else if (sourceType === "connection") {
                // "connection" may be stored either in param.connection (legacy text field)
                // or directly in param.value as input slot index (current simplified UI).
                const rawConn = String(param?.connection || "").trim();
                const rawSlot = /^\d+$/.test(rawConn)
                    ? rawConn
                    : String(param?.value ?? "").trim();
                const autoDefault = (!rawSlot || rawSlot === "0") && !rawConn;
                let slot = parseSamplerSlot(rawSlot, nextFallbackSlot);
                slot = reserveSlot(slot, { allowAutoBump: autoDefault });
                nextFallbackSlot = Math.max(nextFallbackSlot, slot + 1);
                binding = mapLinkToBinding(incomingBySlot.get(slot));
            }
            inputBindings.set(uniformName, binding || { kind: "readBuffer" });
        }

        for (const uniformName of samplerUniformNames) {
            addInputSampler(uniformName);
        }
        for (const uniformName of inputSamplerUniforms) {
            if (!uniforms[uniformName]) uniforms[uniformName] = { value: null };
            if (inputBindings.has(uniformName)) continue;
            let aliasSlot = uniformName === "tDiffuse" || uniformName === "tex" || uniformName === "samp"
                ? 0
                : nextFallbackSlot++;
            aliasSlot = reserveSlot(aliasSlot, { allowAutoBump: true });
            const binding = mapLinkToBinding(incomingBySlot.get(aliasSlot));
            inputBindings.set(uniformName, binding || { kind: "readBuffer" });
        }

        const shaderMaterialOptions = {
            uniforms,
            vertexShader: useGlsl3 ? PREVIEW_POST_VERTEX_GLSL3 : PREVIEW_POST_VERTEX_GLSL1,
            fragmentShader: fragmentSource
        };
        if (useGlsl3) shaderMaterialOptions.glslVersion = THREE.GLSL3;
        const shaderMaterial = new THREE.ShaderMaterial(shaderMaterialOptions);
        const pass = new ShaderPass(shaderMaterial);
        pass.textureID = "__sb_no_input__";

        const inputUniformTargets = inputSamplerUniforms.filter((name) => !!pass.uniforms?.[name]);
        pass.__inputUniformTargets = inputUniformTargets;
        pass.__inputUniformBindings = Object.fromEntries(
            inputUniformTargets.map((name) => [name, inputBindings.get(name) || { kind: "readBuffer" }])
        );
        pass.__renderGroupKey = renderGroupKey;
        pass.__outputSlot = outputSlot;

        const nodeId = String(node?.id || "");
        const originalRender = pass.render.bind(pass);
        pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
            const runtimeReadTexture = readBuffer?.texture || null;
            if (!this.systemInputTexture && runtimeReadTexture) {
                this.systemInputTexture = runtimeReadTexture;
            }

            let readTexture = runtimeReadTexture;
            const groupKey = String(pass.__renderGroupKey || "");
            if (groupKey) {
                if (!this.nodeGroupInputTextures.has(groupKey) && runtimeReadTexture) {
                    this.nodeGroupInputTextures.set(groupKey, runtimeReadTexture);
                }
                readTexture = this.nodeGroupInputTextures.get(groupKey) || runtimeReadTexture;
            }
            const writeTexture = writeBuffer?.texture || null;

            for (const uniformName of pass.__inputUniformTargets || []) {
                if (!pass.uniforms?.[uniformName]) continue;
                const binding = pass.__inputUniformBindings?.[uniformName] || { kind: "readBuffer" };
                let tex = readTexture;
                if (binding?.kind === "graphInput") {
                    tex = this.systemInputTexture || readTexture;
                } else if (binding?.kind === "nodeOutput") {
                    tex = this.resolveNodeOutputTexture(binding, readTexture);
                }
                tex = this.sanitizeSampleTexture(tex, writeTexture, [
                    readTexture,
                    runtimeReadTexture,
                    this.systemInputTexture,
                    this.fallbackTexture
                ]);
                if (!tex) continue;
                pass.uniforms[uniformName].value = tex;
            }

            const result = originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
            if (nodeId && writeBuffer?.texture) {
                this.cacheNodeOutputTexture(renderer, nodeId, pass.__outputSlot || 0, writeBuffer.texture);
            }
            return result;
        };

        return pass;
    }

    createTextureNodePass(node, incomingLinks = [], runtime = {}) {
        const useGlsl3 = !!this.renderer?.capabilities?.isWebGL2;
        const outputSlot = Math.max(0, Math.round(Number(runtime?.outputSlot || 0)));
        const renderGroupKey = String(runtime?.renderGroupKey || "");
        const textureParam = (node?.params || []).find((param) => String(param?.type || "").toLowerCase() === "texture");
        const sourceType = String(textureParam?.sourceType || "value").toLowerCase();
        const tDiffuseUniform = textureParam && sourceType === "upload"
            ? this.paramToUniform(textureParam)
            : { value: null };
        const shaderMaterialOptions = {
            uniforms: {
                tDiffuse: tDiffuseUniform
            },
            vertexShader: useGlsl3 ? PREVIEW_POST_VERTEX_GLSL3 : PREVIEW_POST_VERTEX_GLSL1,
            fragmentShader: useGlsl3
                ? `in vec2 vUv;\nuniform sampler2D tDiffuse;\nlayout(location = 0) out vec4 sbFragColor;\nvoid main(){ sbFragColor = texture(tDiffuse, vUv); }`
                : `varying vec2 vUv;\nuniform sampler2D tDiffuse;\nvoid main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`
        };
        if (useGlsl3) shaderMaterialOptions.glslVersion = THREE.GLSL3;
        const shaderMaterial = new THREE.ShaderMaterial(shaderMaterialOptions);
        const pass = new ShaderPass(shaderMaterial);
        pass.textureID = "__sb_no_input__";

        const incomingBySlot = new Map();
        for (const link of incomingLinks || []) {
            const slot = Math.max(0, Math.round(Number(link?.toSlot || 0)));
            if (!incomingBySlot.has(slot)) incomingBySlot.set(slot, link);
        }
        const mapLinkToBinding = (link) => {
            if (!link || typeof link !== "object") return null;
            const fromNode = String(link?.fromNode || "");
            if (!fromNode) return null;
            if (fromNode === GRAPH_INPUT_ID) return { kind: "graphInput" };
            return {
                kind: "nodeOutput",
                nodeId: fromNode,
                slot: Math.max(0, Math.round(Number(link?.fromSlot || 0)))
            };
        };
        const slot = parseSamplerSlot(textureParam?.value, 0);
        const runtimeBinding = sourceType === "upload"
            ? { kind: "upload" }
            : (mapLinkToBinding(incomingBySlot.get(slot)) || { kind: "readBuffer" });
        pass.__renderGroupKey = renderGroupKey;
        pass.__outputSlot = outputSlot;

        const nodeId = String(node?.id || "");
        const originalRender = pass.render.bind(pass);
        pass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
            const runtimeReadTexture = readBuffer?.texture || null;
            if (!this.systemInputTexture && runtimeReadTexture) {
                this.systemInputTexture = runtimeReadTexture;
            }

            let readTexture = runtimeReadTexture;
            const groupKey = String(pass.__renderGroupKey || "");
            if (groupKey) {
                if (!this.nodeGroupInputTextures.has(groupKey) && runtimeReadTexture) {
                    this.nodeGroupInputTextures.set(groupKey, runtimeReadTexture);
                }
                readTexture = this.nodeGroupInputTextures.get(groupKey) || runtimeReadTexture;
            }
            const writeTexture = writeBuffer?.texture || null;

            if (sourceType !== "upload" && pass.uniforms?.tDiffuse) {
                let tex = readTexture;
                if (runtimeBinding?.kind === "graphInput") {
                    tex = this.systemInputTexture || readTexture;
                } else if (runtimeBinding?.kind === "nodeOutput") {
                    tex = this.resolveNodeOutputTexture(runtimeBinding, readTexture);
                }
                tex = this.sanitizeSampleTexture(tex, writeTexture, [
                    readTexture,
                    runtimeReadTexture,
                    this.systemInputTexture,
                    this.fallbackTexture
                ]);
                if (tex) pass.uniforms.tDiffuse.value = tex;
            }

            const result = originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
            if (nodeId && writeBuffer?.texture) {
                this.cacheNodeOutputTexture(renderer, nodeId, pass.__outputSlot || 0, writeBuffer.texture);
            }
            return result;
        };

        return pass;
    }

    applyPostPipeline(state) {
        const enabled = !!state?.model?.enablePost;
        const graphResolved = resolveChain(state);
        const chain = graphResolved.chain;
        const chainNodeIds = new Set(chain.map((n) => String(n?.id || "")).filter(Boolean));
        const incomingLinksByNode = new Map();
        const outgoingSlotsByNode = new Map();
        for (const link of state?.post?.links || []) {
            const toNode = String(link?.toNode || "");
            if (!toNode || !chainNodeIds.has(toNode)) continue;
            const fromNode = String(link?.fromNode || "");
            if (!fromNode) continue;
            if (fromNode !== GRAPH_INPUT_ID && !chainNodeIds.has(fromNode)) continue;
            if (!incomingLinksByNode.has(toNode)) incomingLinksByNode.set(toNode, []);
            incomingLinksByNode.get(toNode).push(link);
        }
        for (const link of state?.post?.links || []) {
            const fromNode = String(link?.fromNode || "");
            if (!fromNode || !chainNodeIds.has(fromNode)) continue;
            const toNode = String(link?.toNode || "");
            if (!toNode) continue;
            const toActive = toNode === GRAPH_OUTPUT_ID || chainNodeIds.has(toNode);
            if (!toActive) continue;
            if (!outgoingSlotsByNode.has(fromNode)) outgoingSlotsByNode.set(fromNode, new Set());
            outgoingSlotsByNode.get(fromNode).add(Math.max(0, Math.round(Number(link?.fromSlot || 0))));
        }
        for (const links of incomingLinksByNode.values()) {
            links.sort((a, b) => Number(a?.toSlot || 0) - Number(b?.toSlot || 0));
        }

        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        this.passStates = [];
        this.noOutputPreview = false;
        this.systemInputTexture = null;
        this.disposeNodeOutputCache();

        if (!enabled) {
            this.useComposer = false;
            this.onStatus({ pipeline: "后处理链：0 个卡片" });
            return;
        }

        if (!graphResolved.hasOutputConnection) {
            this.useComposer = false;
            this.noOutputPreview = true;
            this.onStatus({ pipeline: "后处理链：无输出（输出节点未连接）" });
            return;
        }

        if (!chain.length) {
            this.useComposer = false;
            this.onStatus({ pipeline: "后处理链：0 个卡片" });
            return;
        }

        for (const node of chain) {
            const repeat = node.type === "pingpong" ? Math.max(1, Math.round(normalizeNumber(node.iterations, 1))) : 1;
            const nodeId = String(node?.id || "");
            const incomingLinks = incomingLinksByNode.get(nodeId) || [];
            const outputSlots = outgoingSlotsByNode.has(nodeId)
                ? Array.from(outgoingSlotsByNode.get(nodeId) || []).sort((a, b) => a - b)
                : [0];
            if (!outputSlots.length) outputSlots.push(0);
            for (let i = 0; i < repeat; i++) {
                const renderGroupKey = `${nodeId}@${i}`;
                for (const outputSlot of outputSlots) {
                    const pass = this.createShaderPassFromNode(node, incomingLinks, {
                        outputSlot,
                        renderGroupKey
                    });
                    this.composer.addPass(pass);
                    this.passStates.push({ nodeId: node.id, outputSlot, pass });
                }
            }
        }

        this.useComposer = this.passStates.length > 0;
        this.onStatus({ pipeline: `后处理链：${this.passStates.length} 个卡片` });
    }

    syncFromState(state) {
        this.rebuildTextureCache(state?.textures || []);
        this.applySettings(state?.settings || {});
        this.syncModelGeometryFromState(state?.model || {});
        this.applyModelShader(state?.model || {});
        this.applyPostPipeline(state || {});
    }

    clearPanKeys() {
        this.keyPanState.left = false;
        this.keyPanState.right = false;
        this.keyPanState.up = false;
        this.keyPanState.down = false;
    }

    applyKeyboardPan(deltaSeconds = 0) {
        const x = (this.keyPanState.right ? 1 : 0) - (this.keyPanState.left ? 1 : 0);
        const y = (this.keyPanState.up ? 1 : 0) - (this.keyPanState.down ? 1 : 0);
        if (!x && !y) return;

        const delta = Math.max(0, Number(deltaSeconds) || 0);
        if (delta <= 0) return;

        const distance = this.camera.position.distanceTo(this.controls.target);
        const speed = Math.max(0.5, distance * 1.6);
        const step = speed * delta;
        const len = Math.hypot(x, y) || 1;

        this.panMove.set(0, 0, 0);
        this.panRight.setFromMatrixColumn(this.camera.matrix, 0).normalize();
        this.panUp.setFromMatrixColumn(this.camera.matrix, 1).normalize();
        this.panMove.addScaledVector(this.panRight, (x / len) * step);
        this.panMove.addScaledVector(this.panUp, (y / len) * step);

        this.camera.position.add(this.panMove);
        this.controls.target.add(this.panMove);
    }

    hasVisibleHelpers() {
        return !!(this.axesHelper.visible || this.gridHelper.visible);
    }

    renderMainFrame() {
        if (this.useComposer && this.composer) {
            this.systemInputTexture = null;
            this.nodeOutputTextures.clear();
            this.nodeGroupInputTextures.clear();
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    renderWorldDepthPrepass() {
        const prevAutoClear = this.renderer.autoClear;
        const prevBackground = this.scene.background;
        const prevOverrideMaterial = this.scene.overrideMaterial;

        this.renderer.autoClear = false;
        this.scene.background = null;
        this.scene.overrideMaterial = this.worldDepthMaterial;
        try {
            this.renderer.clearDepth();
            this.renderer.render(this.scene, this.camera);
        } finally {
            this.scene.overrideMaterial = prevOverrideMaterial;
            this.scene.background = prevBackground;
            this.renderer.autoClear = prevAutoClear;
        }
    }

    renderHelperOverlay() {
        if (!this.hasVisibleHelpers()) return;
        const prevWorldVisible = this.worldRoot.visible;
        const prevAutoClear = this.renderer.autoClear;
        const prevBackground = this.scene.background;
        this.worldRoot.visible = false;
        this.renderer.autoClear = false;
        this.scene.background = null;
        try {
            this.renderer.render(this.scene, this.camera);
        } finally {
            this.scene.background = prevBackground;
            this.renderer.autoClear = prevAutoClear;
            this.worldRoot.visible = prevWorldVisible;
        }
    }

    updateDynamicUniforms(deltaSeconds = 0) {
        this.time += Math.max(0, Number(deltaSeconds) || 0);

        const modelUniforms = this.modelMaterial?.uniforms;
        if (modelUniforms?.uTime) {
            modelUniforms.uTime.value = this.time;
        }
        if (modelUniforms?.CameraPos?.value?.copy) {
            modelUniforms.CameraPos.value.copy(this.camera.position);
        } else if (modelUniforms?.CameraPos) {
            modelUniforms.CameraPos.value = this.camera.position;
        }
        if (modelUniforms?.projMat?.value?.copy) {
            modelUniforms.projMat.value.copy(this.camera.projectionMatrix);
        }
        if (modelUniforms?.viewMat?.value?.copy) {
            modelUniforms.viewMat.value.copy(this.camera.matrixWorldInverse);
        }
        if (modelUniforms?.transMat?.value?.copy) {
            if (this.modelObject) {
                this.modelObject.updateMatrixWorld(true);
                modelUniforms.transMat.value.copy(this.modelObject.matrixWorld);
            } else {
                modelUniforms.transMat.value.identity();
            }
        }

        for (const ps of this.passStates) {
            const uni = ps.pass?.uniforms;
            if (uni?.uTime) uni.uTime.value = this.time;
            if (uni?.CameraPos?.value?.copy) {
                uni.CameraPos.value.copy(this.camera.position);
            } else if (uni?.CameraPos) {
                uni.CameraPos.value = this.camera.position;
            }
            const primary = String(ps.pass?.textureID || "tDiffuse");
            const primaryValue = uni?.[primary]?.value;
            if (Array.isArray(ps.pass?.__inputUniformAliases) && primaryValue) {
                for (const alias of ps.pass.__inputUniformAliases) {
                    if (!uni?.[alias]) continue;
                    uni[alias].value = primaryValue;
                }
            }
        }
    }

    loop() {
        requestAnimationFrame(this.loop);
        this.controls.update();
        const delta = this.clock.getDelta();
        this.applyKeyboardPan(delta);
        this.updateDynamicUniforms(delta);

        if (this.noOutputPreview) {
            this.renderer.setRenderTarget(null);
            this.renderer.setClearColor(this.getPreviewSceneColor(), 1);
            this.renderer.clear(true, true, true);
            if (this.helpersIndependentRender) {
                this.renderHelperOverlay();
            }
            return;
        }

        if (this.helpersIndependentRender && this.hasVisibleHelpers()) {
            const prevHelpersVisible = this.helperRoot.visible;
            this.helperRoot.visible = false;
            try {
                this.renderMainFrame();
                if (this.useComposer && this.composer) {
                    // Rebuild default framebuffer depth with world only, keep current color.
                    this.renderWorldDepthPrepass();
                }
            } finally {
                this.helperRoot.visible = prevHelpersVisible;
            }
            this.renderHelperOverlay();
        } else {
            this.renderMainFrame();
        }
    }
}
