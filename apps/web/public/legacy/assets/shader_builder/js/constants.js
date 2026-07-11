export const STORAGE_KEYS = {
    project: "sb_project_v1",
    settings: "sb_settings_v1",
    hotkeys: "sb_hotkeys_v1",
    theme: "sb_theme_v1"
};

export const MC_COMPAT = {
    mcVersion: "1.21.1",
    openGL: "OpenGL ES 3.0 / WebGL2",
    glsl: "#version 300 es",
    axis: "X+ 东, Y+ 上, Z+ 南"
};

export const THEMES = [
    { id: "dark-1", label: "夜岚" },
    { id: "dark-2", label: "深潮" },
    { id: "dark-3", label: "焰砂" },
    { id: "light-1", label: "雾蓝" },
    { id: "light-2", label: "杏露" },
    { id: "light-3", label: "薄荷" }
];

export const DEFAULT_MODEL_VERTEX = `
// 目标: MC 1.21.1 (${MC_COMPAT.glsl})
// 内置输入: pos / normal / uv
// 传递到片元: vUv / vNormal / vWorldPos
#version 300 es
precision highp float;
precision highp int;
layout (location = 0) in vec3 pos;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec2 uv;

uniform mat4 projMat;
uniform mat4 transMat;
uniform mat4 viewMat;

out vec2 vUv;
out vec3 vNormal;
out vec3 vWorldPos;

void main() {
    vec4 worldPos = transMat * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(transMat) * normal);
    vUv = uv;
    gl_Position = projMat * viewMat * worldPos;
}
`.trim();

export const DEFAULT_MODEL_FRAGMENT = `
// 目标: MC 1.21.1 (${MC_COMPAT.glsl})
// 可用插值变量: vUv / vNormal / vWorldPos
#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorldPos;
out vec4 FragColor;
uniform vec3 color;

void main() {
    vec3 n = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.35, 0.9, 0.25));
    float ndl = max(dot(n, lightDir), 0.0);
    vec3 base = color * (0.35 + 0.65 * ndl);
    FragColor = vec4(base, 1.0);
}
`.trim();

export const DEFAULT_POST_VERTEX = `
// 目标: MC 1.21.1 (${MC_COMPAT.glsl})
#version 300 es
precision highp float;
precision highp int;
layout (location = 0) in vec3 pos;
layout (location = 1) in vec2 aUv;
out vec2 screen_uv;
out vec2 vUv;

void main() {
    gl_Position = vec4(pos.xy, 0.0, 1.0);
    screen_uv = aUv;
    vUv = aUv;
}
`.trim();

export const DEFAULT_POST_FRAGMENT = `
// 目标: MC 1.21.1 (${MC_COMPAT.glsl})
#version 300 es
precision highp float;
precision highp int;
in vec2 screen_uv;
uniform sampler2D tDiffuse;
out vec4 FragColor;

void main() {
    FragColor = texture(tDiffuse, screen_uv);
}
`.trim();

export const PRIMITIVES = ["sphere", "box", "torus", "torusKnot", "plane"];

export const HOTKEY_ACTIONS = [
    { id: "addPass", title: "添加后处理卡片", desc: "默认 A" },
    { id: "generateKotlin", title: "生成 Kotlin", desc: "默认 K" },
    { id: "toggleSettings", title: "打开/关闭设置", desc: "默认 H" },
    { id: "toggleFullscreen", title: "预览全屏开关", desc: "默认 F" },
    { id: "resetCamera", title: "重置镜头", desc: "默认 Shift+R" },
    { id: "exportProject", title: "导出项目", desc: "默认 Ctrl/Cmd+S" },
    { id: "importProject", title: "导入项目", desc: "默认 Ctrl/Cmd+O" },
    { id: "deleteSelectedNode", title: "删除选中后处理节点", desc: "默认 Delete / Backspace" }
];

export const DEFAULT_HOTKEYS = {
    version: 1,
    actions: {
        addPass: "KeyA",
        generateKotlin: "KeyK",
        toggleSettings: "KeyH",
        toggleFullscreen: "KeyF",
        resetCamera: "Shift+KeyR",
        exportProject: "Mod+KeyS",
        importProject: "Mod+KeyO",
        deleteSelectedNode: "Delete"
    }
};

export const DEFAULT_SETTINGS = {
    theme: "dark-1",
    paramStep: 0.1,
    cameraFov: 60,
    showAxes: true,
    showGrid: true,
    helpersIndependentRender: true,
    previewControlMode: "default",
    realtimeCompile: true,
    realtimeCode: true
};

function createLocalId(prefix = "id") {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createDefaultModelParams() {
    return [
        {
            id: createLocalId("param"),
            name: "color",
            type: "vec3",
            value: "0.24,0.74,1.0",
            valueSource: "value",
            valueExpr: "uTime",
            sourceType: "value",
            textureId: "",
            connection: ""
        }
    ];
}

export function createDefaultPostParams() {
    return [];
}
