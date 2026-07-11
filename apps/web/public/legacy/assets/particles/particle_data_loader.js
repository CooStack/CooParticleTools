/**
 * Particle Data Loader
 * 自动从 assets/particles/data/ 加载粒子定义 JSON，
 * 并构建纹理 atlas（横条拼接）供预览着色器使用。
 *
 * 每个 JSON 格式:
 * {
 *   "name": "ControlableEndRodEffect",
 *   "displayName": "EndRod",
 *   "textures": ["assets/particles/end_rod/glitter_0.png", ...]
 * }
 */

const PARTICLE_DATA_INDEX_URL = "assets/particles/data/index.json";
const PARTICLE_DATA_BASE_URL = "assets/particles/data/";

/** @type {Map<string, ParticleDataEntry>} name -> entry */
const particleDataCache = new Map();
let loadPromise = null;
let loaded = false;
const onReadyCallbacks = [];

function createEntry(json) {
    const textures = Array.isArray(json.textures) ? json.textures : [];
    return {
        name: String(json.name || ""),
        displayName: String(json.displayName || json.name || ""),
        textures,
        frames: textures.length,
        atlas: null,
        atlasReady: false,
        atlasTexture: null,
        loadedFrames: 0,
        failedFrames: 0,
        textureLoadOk: textures.length > 0,
    };
}

function resolveBasePath() {
    // 根据当前页面路径推断 base
    const path = window.location.pathname;
    if (path.includes("/assets/")) {
        // 从子目录页面访问，需要回退
        const depth = path.split("/assets/")[1].split("/").length;
        return "../".repeat(depth);
    }
    return "";
}

let _basePath = null;
function getBasePath() {
    if (_basePath !== null) return _basePath;
    _basePath = resolveBasePath();
    return _basePath;
}

/**
 * 设置 base path（从页面入口调用）
 */
export function setBasePath(base) {
    _basePath = String(base || "");
}

/**
 * 构建纹理 atlas（横条拼接到 canvas）
 */
function buildAtlas(entry, onDone) {
    if (!entry.textures.length) {
        entry.atlas = null;
        entry.loadedFrames = 0;
        entry.failedFrames = 0;
        entry.textureLoadOk = false;
        entry.atlasReady = true;
        if (onDone) onDone(entry);
        return;
    }
    const FRAME_SIZE = 64;
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_SIZE * entry.frames;
    canvas.height = FRAME_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    let loadedCount = 0;
    let successCount = 0;
    let failCount = 0;
    const base = getBasePath();
    const tryFinalize = () => {
        if (loadedCount < entry.frames) return;
        entry.loadedFrames = successCount;
        entry.failedFrames = failCount;
        // If any frame is missing, fallback to non-texture rendering.
        entry.textureLoadOk = successCount > 0 && failCount === 0;
        entry.atlas = entry.textureLoadOk ? canvas : null;
        entry.atlasReady = true;
        if (onDone) onDone(entry);
    };

    for (let i = 0; i < entry.textures.length; i++) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            ctx.drawImage(img, i * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE);
            loadedCount++;
            successCount++;
            tryFinalize();
        };
        img.onerror = () => {
            loadedCount++;
            failCount++;
            tryFinalize();
        };
        img.src = base + entry.textures[i];
    }
}

/**
 * 加载所有粒子数据（从 index.json 发现）
 */
export async function loadAllParticleData() {
    if (loaded) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const base = getBasePath();
        try {
            const indexResp = await fetch(base + PARTICLE_DATA_INDEX_URL);
            if (!indexResp.ok) {
                console.warn("particle data index not found:", indexResp.status);
                loaded = true;
                return;
            }
            const fileList = await indexResp.json();
            if (!Array.isArray(fileList)) { loaded = true; return; }

            const promises = fileList.map(async (filename) => {
                try {
                    const resp = await fetch(base + PARTICLE_DATA_BASE_URL + filename);
                    if (!resp.ok) return null;
                    const json = await resp.json();
                    if (!json || !json.name) return null;
                    return json;
                } catch (e) {
                    console.warn("load particle data failed:", filename, e);
                    return null;
                }
            });

            const results = await Promise.all(promises);
            for (const json of results) {
                if (!json) continue;
                const entry = createEntry(json);
                particleDataCache.set(entry.name, entry);
                buildAtlas(entry, () => {
                    fireReadyCallbacks();
                });
            }
        } catch (e) {
            console.warn("loadAllParticleData error:", e);
        }
        loaded = true;
        fireReadyCallbacks();
    })();

    return loadPromise;
}

function fireReadyCallbacks() {
    for (const cb of onReadyCallbacks) {
        try { cb(); } catch (e) { console.warn("particle ready callback error:", e); }
    }
}

/**
 * 注册 atlas 就绪回调
 */
export function onParticleAtlasReady(cb) {
    if (typeof cb === "function") onReadyCallbacks.push(cb);
}

/**
 * 获取所有已加载的粒子数据列表
 */
export function getAllParticleData() {
    return Array.from(particleDataCache.values());
}

/**
 * 按 name 获取粒子数据
 */
export function getParticleDataByName(name) {
    return particleDataCache.get(String(name || "")) || null;
}

/**
 * 获取所有已加载的粒子效果类名列表
 */
export function getParticleEffectNames() {
    return Array.from(particleDataCache.keys());
}

/**
 * 判断是否已加载完成
 */
export function isParticleDataLoaded() {
    return loaded;
}

/**
 * 计算生命周期内的纹理帧索引
 * age: 当前年龄 (0 ~ lifetime)
 * lifetime: 总生命周期
 * frames: 纹理帧数
 * 返回: 帧索引 (0 ~ frames-1)，从 tex[0] 到 tex[frames-1]
 */
export function calcTextureFrame(age, lifetime, frames) {
    if (frames <= 1) return 0;
    const t = Math.max(0, Math.min(1, age / Math.max(1, lifetime)));
    return Math.min(frames - 1, Math.floor(t * frames));
}
