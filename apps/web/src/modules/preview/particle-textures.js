import * as THREE from 'three';

const FRAME_SIZE = 64;
const LEGACY_BASE_URL = `${normalizeBase(import.meta.env.BASE_URL || '/')}legacy/`;
const PARTICLE_DATA_INDEX_URL = `${LEGACY_BASE_URL}assets/particles/data/index.json`;
const PARTICLE_DATA_BASE_URL = `${LEGACY_BASE_URL}assets/particles/data/`;

const particleEntries = new Map();
const readyCallbacks = new Set();
const mergedAtlasCache = new Map();

let loadPromise = null;
let loaded = false;

function normalizeBase(value) {
  const text = String(value || '/').trim();
  if (!text || text === '/') return '/';
  return text.endsWith('/') ? text : `${text}/`;
}

function createEntry(json) {
  return {
    name: String(json?.name || ''),
    displayName: String(json?.displayName || json?.name || ''),
    textures: Array.isArray(json?.textures) ? json.textures.map((item) => String(item || '')) : [],
    frames: 0,
    atlas: null,
    atlasReady: false,
    textureLoadOk: false,
    threeTexture: null
  };
}

export function registerParticleTextureDefinition(definition) {
  const entry = createEntry(definition);
  if (!entry.name || !entry.textures.length) return null;
  particleEntries.set(entry.name, entry);
  buildAtlas(entry).then(() => {
    clearMergedAtlasCache();
    fireReadyCallbacks();
  });
  return entry;
}

export function loadAllParticleTextures(onReady) {
  if (typeof onReady === 'function') readyCallbacks.add(onReady);
  if (loaded) {
    fireReadyCallbacks();
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const indexResponse = await fetch(PARTICLE_DATA_INDEX_URL);
      if (!indexResponse.ok) {
        loaded = true;
        fireReadyCallbacks();
        return;
      }
      const files = await indexResponse.json();
      if (!Array.isArray(files)) {
        loaded = true;
        fireReadyCallbacks();
        return;
      }
      const definitions = await Promise.all(files.map(loadParticleDefinition));
      const entries = definitions.filter(Boolean).map(createEntry).filter((entry) => entry.name);
      entries.forEach((entry) => particleEntries.set(entry.name, entry));
      await Promise.all(entries.map(buildAtlas));
    } catch (error) {
      console.warn('load particle textures failed:', error);
    }
    loaded = true;
    clearMergedAtlasCache();
    fireReadyCallbacks();
  })();
  return loadPromise;
}

export function getParticleTextureEntry(effectClass) {
  return particleEntries.get(String(effectClass || '')) || null;
}

export function getMergedParticleAtlas(effectClasses) {
  const names = Array.from(new Set((effectClasses || []).map((item) => String(item || '').trim()).filter(Boolean))).sort();
  const entries = names
    .map((name) => ({ name, entry: getParticleTextureEntry(name) }))
    .filter(({ entry }) => isParticleTextureUsable(entry));
  if (!entries.length) return null;

  const key = entries.map(({ name, entry }) => `${name}:${entry.frames}`).join('|');
  const cached = mergedAtlasCache.get(key);
  if (cached) return cached;

  if (entries.length === 1) {
    const { name, entry } = entries[0];
    const texture = getEntryTexture(entry);
    if (!texture) return null;
    const offsets = new Map([[name, 0]]);
    const config = { texture, frameCount: entry.frames, offsets };
    mergedAtlasCache.set(key, config);
    return config;
  }

  let totalFrames = 0;
  const offsets = new Map();
  entries.forEach(({ name, entry }) => {
    offsets.set(name, totalFrames);
    totalFrames += entry.frames;
  });

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE * totalFrames;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  entries.forEach(({ name, entry }) => {
    const offset = offsets.get(name) || 0;
    ctx.drawImage(entry.atlas, offset * FRAME_SIZE, 0);
  });

  const texture = createThreeTexture(canvas);
  const config = { texture, frameCount: totalFrames, offsets };
  mergedAtlasCache.set(key, config);
  return config;
}

export function resolveParticleFrameIndex(point, atlasConfig) {
  const effectClass = String(point?.effectClass || '').trim();
  const entry = getParticleTextureEntry(effectClass);
  if (!atlasConfig || !effectClass || !isParticleTextureUsable(entry)) return 0;
  const baseFrame = calcTextureFrame(point?.age, point?.life, entry.frames);
  const offset = atlasConfig.offsets?.get(effectClass) || 0;
  return baseFrame + offset;
}

function isParticleTextureUsable(entry) {
  return Boolean(entry?.atlasReady && entry?.atlas && entry.textureLoadOk && entry.frames > 0);
}

async function loadParticleDefinition(filename) {
  try {
    const response = await fetch(`${PARTICLE_DATA_BASE_URL}${filename}`);
    if (!response.ok) return null;
    const json = await response.json();
    return json?.name ? json : null;
  } catch {
    return null;
  }
}

async function buildAtlas(entry) {
  if (!entry.textures.length) {
    entry.frames = 0;
    entry.atlas = null;
    entry.atlasReady = true;
    entry.textureLoadOk = false;
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE * entry.textures.length;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const results = await Promise.all(entry.textures.map((path) => loadImage(`${LEGACY_BASE_URL}${path}`)));
  let loadedFrames = 0;
  results.forEach((image, index) => {
    if (!image) return;
    loadedFrames += 1;
    ctx.drawImage(image, index * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE);
  });

  entry.frames = entry.textures.length;
  entry.atlas = loadedFrames > 0 ? canvas : null;
  entry.atlasReady = true;
  entry.textureLoadOk = loadedFrames > 0;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function getEntryTexture(entry) {
  if (!isParticleTextureUsable(entry)) return null;
  if (!entry.threeTexture) entry.threeTexture = createThreeTexture(entry.atlas);
  return entry.threeTexture;
}

function createThreeTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clearMergedAtlasCache() {
  mergedAtlasCache.forEach((config) => {
    if (config?.texture && !isEntryOwnedTexture(config.texture)) config.texture.dispose();
  });
  mergedAtlasCache.clear();
}

function isEntryOwnedTexture(texture) {
  for (const entry of particleEntries.values()) {
    if (entry.threeTexture === texture) return true;
  }
  return false;
}

function fireReadyCallbacks() {
  readyCallbacks.forEach((callback) => {
    try {
      callback();
    } catch (error) {
      console.warn('particle texture ready callback failed:', error);
    }
  });
}

function calcTextureFrame(age, lifetime, frames) {
  if (!(frames > 1)) return 0;
  const t = Math.max(0, Math.min(1, Number(age || 0) / Math.max(1, Number(lifetime || 1))));
  return Math.min(frames - 1, Math.floor(t * frames));
}
