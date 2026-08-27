import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ADAPTIVE_GRID_BASE_STEP, resolveAdaptiveGridLod } from './adaptive-grid.js';
import {
  getMergedParticleAtlas,
  loadAllParticleTextures,
  resolveParticleFrameIndex
} from './particle-textures.js';

const PREVIEW_SPRITE_SCALE = 1.6;
const MAX_RENDERED_SPRITES = 65536;
const DEFAULT_INTERPOLATION_MS = 50;
const INFINITE_GRID_PLANE_SIZE = 1000000;

const pointVertexShader = `
attribute vec3 prevPosition;
attribute vec3 pointColor;
attribute float pointAlpha;
attribute vec2 pointScale;
attribute float pointFrame;
attribute float pointRoll;
uniform float uViewportHeight;
uniform float uLerpAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vFrame;
varying float vRoll;
varying vec2 vPointScale;

void main() {
  vColor = pointColor;
  vAlpha = pointAlpha;
  vFrame = pointFrame;
  vRoll = pointRoll;
  vPointScale = pointScale;
  vec3 renderPosition = mix(prevPosition, position, clamp(uLerpAlpha, 0.0, 1.0));
  vec4 mvPosition = modelViewMatrix * vec4(renderPosition, 1.0);
  float depth = max(0.001, -mvPosition.z);
  float spriteExtent = length(pointScale);
  gl_PointSize = clamp(spriteExtent * projectionMatrix[1][1] * uViewportHeight * 0.5 / depth, 1.0, 512.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const pointFragmentShader = `
varying vec3 vColor;
varying float vAlpha;
varying float vFrame;
varying float vRoll;
varying vec2 vPointScale;
uniform sampler2D uAtlas;
uniform int uFrameCount;
uniform int uUseTexture;
uniform int uPremultiplyRgbByAlpha;

vec2 rotateUv(vec2 uv, float angle) {
  vec2 centered = uv - vec2(0.5);
  float s = sin(angle);
  float c = cos(angle);
  return vec2(centered.x * c - centered.y * s, centered.x * s + centered.y * c) + vec2(0.5);
}

float particleMask(vec2 coord) {
  float r = length(coord - vec2(0.5));
  return 1.0 - smoothstep(0.34, 0.5, r);
}

void main() {
  vec2 localUv = rotateUv(gl_PointCoord, vRoll) - vec2(0.5);
  float spriteExtent = length(vPointScale);
  localUv *= spriteExtent / max(vPointScale, vec2(0.0001));
  vec2 uv = localUv + vec2(0.5);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
  if (uUseTexture == 1 && uFrameCount > 0) {
    float fc = float(uFrameCount);
    float fi = clamp(floor(vFrame + 0.5), 0.0, fc - 1.0);
    float pad = 0.5 / (fc * 64.0);
    uv.x = (fi + clamp(uv.x, 0.01, 0.99)) / fc;
    uv.x = clamp(uv.x, fi / fc + pad, (fi + 1.0) / fc - pad);
    vec4 texel = texture2D(uAtlas, uv);
    if (texel.a <= 0.01 || vAlpha <= 0.01) discard;
    float intensity = clamp(vAlpha * texel.a, 0.0, 1.0);
    vec3 color = vColor * texel.rgb * (0.22 + intensity * 0.78);
    if (uPremultiplyRgbByAlpha == 1) color *= intensity;
    gl_FragColor = vec4(color, intensity);
    return;
  }
  float mask = particleMask(uv);
  if (mask <= 0.01 || vAlpha <= 0.01) discard;
  float intensity = clamp(vAlpha * mask, 0.0, 1.0);
  vec3 color = vColor * (0.22 + intensity * 0.78);
  if (uPremultiplyRgbByAlpha == 1) color *= intensity;
  gl_FragColor = vec4(color, intensity);
}
`;

const planeVertexShader = `
attribute vec3 instanceColor;
attribute float instanceAlpha;
attribute float instanceFrame;
varying vec3 vColor;
varying float vAlpha;
varying float vFrame;
varying vec2 vUv;

void main() {
  vColor = instanceColor;
  vAlpha = instanceAlpha;
  vFrame = instanceFrame;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const planeFragmentShader = `
varying vec3 vColor;
varying float vAlpha;
varying float vFrame;
varying vec2 vUv;
uniform sampler2D uAtlas;
uniform int uFrameCount;
uniform int uUseTexture;
uniform int uPremultiplyRgbByAlpha;

float particleMask(vec2 coord) {
  float r = length(coord - vec2(0.5));
  return 1.0 - smoothstep(0.34, 0.5, r);
}

void main() {
  vec2 uv = vUv;
  if (uUseTexture == 1 && uFrameCount > 0) {
    float fc = float(uFrameCount);
    float fi = clamp(floor(vFrame + 0.5), 0.0, fc - 1.0);
    float pad = 0.5 / (fc * 64.0);
    uv.x = (fi + clamp(uv.x, 0.01, 0.99)) / fc;
    uv.x = clamp(uv.x, fi / fc + pad, (fi + 1.0) / fc - pad);
    vec4 texel = texture2D(uAtlas, uv);
    if (texel.a <= 0.01 || vAlpha <= 0.01) discard;
    float intensity = clamp(vAlpha * texel.a, 0.0, 1.0);
    vec3 color = vColor * texel.rgb * (0.22 + intensity * 0.78);
    if (uPremultiplyRgbByAlpha == 1) color *= intensity;
    gl_FragColor = vec4(color, intensity);
    return;
  }
  float mask = particleMask(vUv);
  if (mask <= 0.01 || vAlpha <= 0.01) discard;
  float intensity = clamp(vAlpha * mask, 0.0, 1.0);
  vec3 color = vColor * (0.22 + intensity * 0.78);
  if (uPremultiplyRgbByAlpha == 1) color *= intensity;
  gl_FragColor = vec4(color, intensity);
}
`;

const infiniteGridVertexShader = `
varying vec2 vScreenUv;

void main() {
  vScreenUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const infiniteGridFragmentShader = `
uniform float uFineStep;
uniform float uLodBlend;
uniform vec2 uCenterXZ;
uniform mat4 uInvProjection;
uniform mat4 uInvView;
uniform vec3 uPlaneOrigin;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec3 uGridColor;
varying vec2 vScreenUv;

vec3 unproject(vec2 uv, float depth) {
  vec4 clipPosition = vec4(uv * 2.0 - 1.0, depth, 1.0);
  vec4 viewPosition = uInvProjection * clipPosition;
  viewPosition /= max(abs(viewPosition.w), 0.000001);
  return (uInvView * vec4(viewPosition.xyz, 1.0)).xyz;
}

float gridLine(vec2 coordinate, vec2 derivative) {
  vec2 distanceToLine = abs(fract(coordinate - 0.5) - 0.5);
  vec2 antiAlias = clamp(derivative * 1.5, vec2(0.0001), vec2(0.22));
  vec2 line = 1.0 - smoothstep(vec2(0.0), antiAlias, distanceToLine);
  float pixelCoverage = min(1.0, 0.5 / max(max(derivative.x, derivative.y), 0.0001));
  return max(line.x, line.y) * pixelCoverage;
}

void main() {
  vec3 rayStart = unproject(vScreenUv, -1.0);
  vec3 rayEnd = unproject(vScreenUv, 1.0);
  vec3 rayDirection = normalize(rayEnd - rayStart);
  float denominator = rayDirection.y;
  if (abs(denominator) < 0.00001) discard;
  float rayDistance = (uPlaneOrigin.y - rayStart.y) / denominator;
  if (rayDistance < 0.0) discard;
  vec3 worldPosition = rayStart + rayDirection * rayDistance;
  vec2 worldDerivative = fwidth(worldPosition.xz);
  float baseDensity = max(worldDerivative.x, worldDerivative.y) / max(uFineStep, 0.0001);
  float densityLevel = clamp(floor(log2(max(baseDensity / 0.45, 1.0))), 0.0, 20.0);
  float densityScale = exp2(densityLevel);
  float localFineStep = uFineStep * densityScale;
  float localCoarseStep = localFineStep * 2.0;
  float localDensity = baseDensity / densityScale;
  float cameraBlend = densityLevel < 0.5 ? uLodBlend : 0.0;
  float fineToCoarse = max(smoothstep(0.45, 0.9, localDensity), cameraBlend);
  float fineLine = gridLine(
    worldPosition.xz / max(localFineStep, 0.0001),
    worldDerivative / max(localFineStep, 0.0001)
  );
  float coarseLine = gridLine(
    worldPosition.xz / max(localCoarseStep, 0.0001),
    worldDerivative / max(localCoarseStep, 0.0001)
  );
  float distanceToCenter = distance(worldPosition.xz, uCenterXZ);
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distanceToCenter);
  float fineAlpha = fineLine * (1.0 - fineToCoarse) * 0.92;
  float coarseAlpha = coarseLine * 0.92;
  float alpha = max(fineAlpha, coarseAlpha) * fade;
  if (alpha <= 0.01) discard;
  gl_FragColor = vec4(uGridColor, alpha);
}
`;

function isTransparentColor(value) {
  if (!value) return true;
  const text = String(value).trim().toLowerCase();
  if (!text || text === 'transparent') return true;
  if (text.startsWith('rgba(')) {
    const match = text.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (match) {
      const alpha = Number(match[4]);
      return Number.isFinite(alpha) && alpha <= 0;
    }
  }
  return false;
}

function clamp01(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function parsePointColor(point) {
  if (point && Number.isFinite(Number(point.r)) && Number.isFinite(Number(point.g)) && Number.isFinite(Number(point.b))) {
    return {
      r: clamp01(point.r),
      g: clamp01(point.g),
      b: clamp01(point.b)
    };
  }
  const text = String(point?.color || '').trim();
  const hex = /^#?([0-9a-fA-F]{6})$/.exec(text);
  if (!hex) return { r: 0.13, g: 0.77, b: 0.37 };
  const value = Number.parseInt(hex[1], 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255
  };
}

function writePointColor(target, offset, point) {
  if (point && Number.isFinite(Number(point.r)) && Number.isFinite(Number(point.g)) && Number.isFinite(Number(point.b))) {
    target[offset] = clamp01(point.r);
    target[offset + 1] = clamp01(point.g);
    target[offset + 2] = clamp01(point.b);
    return;
  }
  const parsed = parsePointColor(point);
  target[offset] = parsed.r;
  target[offset + 1] = parsed.g;
  target[offset + 2] = parsed.b;
}

function degToRad(value) {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? numeric : 0) * Math.PI / 180;
}

function lerpNumber(start, end, alpha) {
  return start + (end - start) * alpha;
}

function resolvePointScale(point, fallback) {
  const fallbackSize = Math.max(0.01, Number(fallback) || 0.07);
  const sx = Number(point?.scaleX);
  const sy = Number(point?.scaleY);
  return new THREE.Vector3(
    (Number.isFinite(sx) && sx > 0 ? sx : fallbackSize) * PREVIEW_SPRITE_SCALE,
    (Number.isFinite(sy) && sy > 0 ? sy : fallbackSize) * PREVIEW_SPRITE_SCALE,
    1
  );
}

function writePointWorldScale(target, offset, point, fallback) {
  const fallbackSize = Math.max(0.01, Number(fallback) || 0.07);
  const sx = Number(point?.scaleX);
  const sy = Number(point?.scaleY);
  target[offset] = (Number.isFinite(sx) && sx > 0 ? sx : fallbackSize) * PREVIEW_SPRITE_SCALE;
  target[offset + 1] = (Number.isFinite(sy) && sy > 0 ? sy : fallbackSize) * PREVIEW_SPRITE_SCALE;
}

function resolveTextureSheet(points) {
  if (typeof points?.textureSheet === 'string') return points.textureSheet;
  let textureSheet = '';
  for (const point of points || []) {
    const next = String(point?.textureSheet || 'PARTICLE_SHEET_TRANSLUCENT');
    if (!textureSheet) textureSheet = next;
    else if (next !== textureSheet) return '';
  }
  return textureSheet;
}

function applyTextureSheet(material, textureSheet) {
  if (!material) return;
  const sheet = String(textureSheet || 'PARTICLE_SHEET_TRANSLUCENT');
  const noDepthWrite = sheet.endsWith('_NO_DEPTH_WRITE');
  const additive = sheet.startsWith('ADDITION_BLEND');
  const bounded = additive && sheet.includes('_NOT_HDR');
  const translucentAdditive = additive && sheet.includes('_TRANSLUCENT');

  material.depthWrite = noDepthWrite ? false : sheet !== 'CUSTOM';
  material.uniforms.uPremultiplyRgbByAlpha.value = bounded && translucentAdditive ? 1 : 0;

  if (sheet === 'PARTICLE_SHEET_OPAQUE' || sheet === 'PARTICLE_SHEET_LIT' || sheet === 'TERRAIN_SHEET') {
    material.blending = THREE.NoBlending;
  } else if (additive) {
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrc = bounded || !translucentAdditive ? THREE.OneFactor : THREE.SrcAlphaFactor;
    material.blendDst = bounded ? THREE.OneMinusSrcColorFactor : THREE.OneFactor;
    material.blendSrcAlpha = bounded ? THREE.ZeroFactor : material.blendSrc;
    material.blendDstAlpha = THREE.OneFactor;
  } else {
    material.blending = THREE.NormalBlending;
  }
  material.needsUpdate = true;
}

function createTextureUniforms() {
  return {
    uAtlas: { value: null },
    uFrameCount: { value: 0 },
    uUseTexture: { value: 0 },
    uPremultiplyRgbByAlpha: { value: 0 },
    uViewportHeight: { value: 1 },
    uLerpAlpha: { value: 1 }
  };
}

function normalizeAxis(raw, target) {
  target.set(Number(raw?.x || 0), Number(raw?.y || 1), Number(raw?.z || 0));
  if (target.lengthSq() < 1e-8) target.set(0, 1, 0);
  return target.normalize();
}

function captureBackground(host) {
  const style = getComputedStyle(host);
  host.dataset.previewBgImage = style.backgroundImage || '';
  host.dataset.previewBgColor = style.backgroundColor || '';
}

function applyFullscreenBackground(host) {
  const bgColor = host.dataset.previewBgColor || '';
  const bgImage = host.dataset.previewBgImage || '';
  host.style.background = '';
  host.style.backgroundColor = isTransparentColor(bgColor) ? '#020617' : bgColor;
  host.style.backgroundImage = bgImage && bgImage !== 'none' ? bgImage : '';
}

function restoreBackground(host) {
  host.style.background = '';
  host.style.backgroundColor = '';
  host.style.backgroundImage = '';
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function resolveGridColor(host) {
  const themeHost = host?.closest?.('[data-theme]') || document.body;
  const cssColor = getComputedStyle(themeHost).getPropertyValue('--grid-color').trim();
  if (cssColor) return cssColor;
  return themeHost?.getAttribute?.('data-theme') === 'light-1' ? '#6e7f8f' : '#617d9b';
}

function splitPreviewPoints(points, billboard, oriented) {
  billboard.length = 0;
  oriented.length = 0;
  points.forEach((point, index) => {
    if (index >= MAX_RENDERED_SPRITES) return;
    const mode = point?.billboardMode || 'face_camera';
    if (mode === 'none' || mode === 'axis_billboard') oriented.push(point);
    else billboard.push(point);
  });
}

export function createThreePointsPreview({ canvas, host, pointSize = 0.07, onFpsChange = null }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1000000);
  camera.position.set(2.4, 1.8, 2.4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.8;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 0.95;
  controls.mouseButtons = {
    LEFT: -1,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN
  };
  controls.target.set(0, 0, 0);
  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  const group = new THREE.Group();
  scene.add(group);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  const directional = new THREE.DirectionalLight(0xffffff, 0.9);
  directional.position.set(5, 8, 6);
  scene.add(ambient);
  scene.add(directional);

  const themeHost = host.closest?.('[data-theme]') || document.body;
  const gridMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: {
      uFineStep: { value: ADAPTIVE_GRID_BASE_STEP },
      uLodBlend: { value: 0 },
      uCenterXZ: { value: new THREE.Vector2() },
      uInvProjection: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
      uPlaneOrigin: { value: new THREE.Vector3(0, -0.01, 0) },
      uFadeStart: { value: 12 },
      uFadeEnd: { value: 64 },
      uGridColor: { value: new THREE.Color(resolveGridColor(host)) }
    },
    vertexShader: infiniteGridVertexShader,
    fragmentShader: infiniteGridFragmentShader
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gridMaterial);
  grid.frustumCulled = false;
  grid.renderOrder = -10;
  const axes = new THREE.AxesHelper(4);
  scene.add(grid);
  scene.add(axes);
  let gridStep = ADAPTIVE_GRID_BASE_STEP;
  const themeObserver = typeof MutationObserver === 'function'
    ? new MutationObserver(() => gridMaterial.uniforms.uGridColor.value.set(resolveGridColor(host)))
    : null;
  themeObserver?.observe(themeHost, { attributes: true, attributeFilter: ['data-theme'] });

  const matrix = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const rollQuaternion = new THREE.Quaternion();
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3();
  const zRollAxis = new THREE.Vector3(0, 0, 1);

  let billboardPoints = null;
  let billboardMaterial = null;
  let billboardCapacity = 0;
  let orientedMesh = null;
  let orientedCapacity = 0;
  let currentPoints = [];
  let currentBillboardPoints = [];
  let currentOrientedPoints = [];
  let currentBufferPoints = null;
  let hasDynamicOrientedBillboards = false;
  let textureConfig = null;
  let textureSignature = '';
  let textureSheet = '';
  let textureLoadStarted = false;
  let frameId = 0;
  let disposed = false;
  let currentPointSize = pointSize;
  let viewportHeight = 1;
  let fpsLastTs = 0;
  let fpsFrames = 0;
  let interpolationStart = 0;
  let interpolationDuration = DEFAULT_INTERPOLATION_MS;
  let interpolationAlpha = 1;

  function pushFps(now) {
    if (typeof onFpsChange !== 'function') return;
    const ts = Number(now);
    if (!Number.isFinite(ts)) return;
    if (!(fpsLastTs > 0)) {
      fpsLastTs = ts;
      fpsFrames = 0;
      return;
    }
    fpsFrames += 1;
    const dt = ts - fpsLastTs;
    if (dt < 400) return;
    const fps = dt > 0 ? (fpsFrames * 1000 / dt) : 0;
    fpsFrames = 0;
    fpsLastTs = ts;
    onFpsChange(fps);
  }

  function render(now = performance.now()) {
    if (disposed) return;
    const interpolationChanged = updateInterpolationUniforms(now);
    controls.update();
    updateAdaptiveGrid();
    if (orientedMesh && (hasDynamicOrientedBillboards || interpolationAlpha < 1 || interpolationChanged)) {
      applyOrientedParticleMatrices(false);
    }
    renderer.render(scene, camera);
    pushFps(now);
    frameId = requestAnimationFrame(render);
  }

  function resize() {
    if (disposed) return;
    const width = canvas.clientWidth || host.clientWidth || 420;
    const height = canvas.clientHeight || host.clientHeight || 280;
    const renderWidth = Math.max(1, Math.round(width));
    const renderHeight = Math.max(1, Math.round(height));
    renderer.setSize(renderWidth, renderHeight, false);
    viewportHeight = renderer.domElement.height || renderHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    applyViewportUniforms(billboardMaterial);
    applyViewportUniforms(orientedMesh?.material);
  }

  function updateAdaptiveGrid() {
    camera.updateMatrixWorld();
    gridMaterial.uniforms.uInvProjection.value.copy(camera.projectionMatrix).invert();
    gridMaterial.uniforms.uInvView.value.copy(camera.matrixWorld);
    const cameraDistance = camera.position.distanceTo(controls.target);
    const lod = resolveAdaptiveGridLod({
      distance: cameraDistance,
      fov: camera.fov,
      viewportHeight
    });
    if (Math.abs(lod.fineStep - gridStep) > Math.max(1e-6, lod.fineStep * 1e-6)) {
      gridMaterial.uniforms.uFineStep.value = lod.fineStep;
      gridStep = lod.fineStep;
    }
    gridMaterial.uniforms.uLodBlend.value = lod.blend;
    gridMaterial.uniforms.uCenterXZ.value.set(controls.target.x, controls.target.z);
    gridMaterial.uniforms.uPlaneOrigin.value.set(controls.target.x, -0.01, controls.target.z);
    const fadeEnd = Math.min(
      INFINITE_GRID_PLANE_SIZE * 0.35,
      Math.max(lod.coarseStep * 96, cameraDistance * 16)
    );
    gridMaterial.uniforms.uFadeStart.value = fadeEnd * 0.42;
    gridMaterial.uniforms.uFadeEnd.value = fadeEnd;
  }

  function clearObject(object) {
    if (!object) return;
    group.remove(object);
    object.geometry.dispose();
    object.material.dispose();
  }

  function clearBillboardPoints(disposeMaterial = false) {
    if (billboardPoints) {
      group.remove(billboardPoints);
      billboardPoints.geometry.dispose();
      billboardPoints = null;
      billboardCapacity = 0;
    }
    if (disposeMaterial && billboardMaterial) {
      billboardMaterial.dispose();
      billboardMaterial = null;
    }
  }

  function clearOrientedMesh() {
    clearObject(orientedMesh);
    orientedMesh = null;
    orientedCapacity = 0;
  }

  function clearPoints() {
    clearBillboardPoints(true);
    clearOrientedMesh();
    currentPoints = [];
    currentBillboardPoints = [];
    currentOrientedPoints = [];
    currentBufferPoints = null;
    hasDynamicOrientedBillboards = false;
  }

  function updatePoints(points = []) {
    if (points?.kind === 'preview-buffers') {
      updateBufferPoints(points);
      return;
    }
    currentBufferPoints = null;
    if (!points.length) {
      clearPoints();
      finishInterpolation();
      return;
    }

    currentPoints = points;
    requestTextureLoad(currentPoints);
    syncTextureUniforms();
    splitPreviewPoints(currentPoints, currentBillboardPoints, currentOrientedPoints);

    if (currentBillboardPoints.length) updateBillboardPoints();
    else clearBillboardPoints();
    if (currentOrientedPoints.length) {
      ensureOrientedMesh(currentOrientedPoints.length);
    } else {
      clearOrientedMesh();
    }
    restartInterpolation();
  }

  function updateBufferPoints(data) {
    const count = Math.max(0, Math.trunc(Number(data?.count || 0)));
    if (!count) {
      clearPoints();
      finishInterpolation();
      return;
    }

    currentPoints = data;
    currentBufferPoints = data;
    currentBillboardPoints.length = 0;
    currentOrientedPoints.length = 0;
    requestTextureLoad(data);
    syncTextureUniforms();
    updateBillboardBufferPoints(data, count);
    clearOrientedMesh();
    restartInterpolation();
  }

  function updateBillboardPoints() {
    const count = currentBillboardPoints.length;
    ensureBillboardPoints(count);
    const positions = billboardPoints.geometry.getAttribute('position');
    const prevPositions = billboardPoints.geometry.getAttribute('prevPosition');
    const colors = billboardPoints.geometry.getAttribute('pointColor');
    const alphas = billboardPoints.geometry.getAttribute('pointAlpha');
    const scales = billboardPoints.geometry.getAttribute('pointScale');
    const frames = billboardPoints.geometry.getAttribute('pointFrame');
    const rolls = billboardPoints.geometry.getAttribute('pointRoll');
    const positionArray = positions.array;
    const prevPositionArray = prevPositions.array;
    const colorArray = colors.array;
    const alphaArray = alphas.array;
    const scaleArray = scales.array;
    const frameArray = frames.array;
    const rollArray = rolls.array;

    currentBillboardPoints.forEach((point, index) => {
      const offset = index * 3;
      positionArray[offset] = Number(point?.x || 0);
      positionArray[offset + 1] = Number(point?.y || 0);
      positionArray[offset + 2] = Number(point?.z || 0);
      prevPositionArray[offset] = Number(point?.prevX ?? point?.x ?? 0);
      prevPositionArray[offset + 1] = Number(point?.prevY ?? point?.y ?? 0);
      prevPositionArray[offset + 2] = Number(point?.prevZ ?? point?.z ?? 0);
      writePointColor(colorArray, offset, point);
      alphaArray[index] = clamp01(point?.alpha, 1);
      writePointWorldScale(scaleArray, index * 2, point, currentPointSize);
      frameArray[index] = resolveParticleFrameIndex(point, textureConfig);
      rollArray[index] = degToRad(point?.roll);
    });
    billboardPoints.geometry.setDrawRange(0, count);
    positions.needsUpdate = true;
    prevPositions.needsUpdate = true;
    colors.needsUpdate = true;
    alphas.needsUpdate = true;
    scales.needsUpdate = true;
    frames.needsUpdate = true;
    rolls.needsUpdate = true;
  }

  function updateBillboardBufferPoints(data, count) {
    ensureBillboardPoints(count);
    const positions = billboardPoints.geometry.getAttribute('position');
    const prevPositions = billboardPoints.geometry.getAttribute('prevPosition');
    const colors = billboardPoints.geometry.getAttribute('pointColor');
    const alphas = billboardPoints.geometry.getAttribute('pointAlpha');
    const scales = billboardPoints.geometry.getAttribute('pointScale');
    const frames = billboardPoints.geometry.getAttribute('pointFrame');
    const rolls = billboardPoints.geometry.getAttribute('pointRoll');
    positions.array.set(data.positions.subarray(0, count * 3));
    if (data.prevPositions) {
      prevPositions.array.set(data.prevPositions.subarray(0, count * 3));
    } else {
      prevPositions.array.set(data.positions.subarray(0, count * 3));
    }
    colors.array.set(data.colors.subarray(0, count * 3));
    alphas.array.set(data.alphas.subarray(0, count));
    for (let index = 0; index < count; index += 1) {
      const fallback = Number(data.sizes?.[index] || currentPointSize);
      scales.setXY(index, Number(data.scaleXs?.[index] || fallback), Number(data.scaleYs?.[index] || fallback));
    }
    rolls.array.set(data.rolls.subarray(0, count));
    fillBufferFrames(frames.array, data, count);
    billboardPoints.geometry.setDrawRange(0, count);
    positions.needsUpdate = true;
    prevPositions.needsUpdate = true;
    colors.needsUpdate = true;
    alphas.needsUpdate = true;
    scales.needsUpdate = true;
    frames.needsUpdate = true;
    rolls.needsUpdate = true;
  }

  function ensureBillboardPoints(count) {
    if (billboardPoints && count <= billboardCapacity) return;
    clearBillboardPoints(false);
    billboardCapacity = Math.max(256, Math.ceil(count * 1.25));
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(billboardCapacity * 3), 3);
    const prevPositions = new THREE.BufferAttribute(new Float32Array(billboardCapacity * 3), 3);
    const colors = new THREE.BufferAttribute(new Float32Array(billboardCapacity * 3), 3);
    const alphas = new THREE.BufferAttribute(new Float32Array(billboardCapacity), 1);
    const scales = new THREE.BufferAttribute(new Float32Array(billboardCapacity * 2), 2);
    const frames = new THREE.BufferAttribute(new Float32Array(billboardCapacity), 1);
    const rolls = new THREE.BufferAttribute(new Float32Array(billboardCapacity), 1);
    positions.setUsage(THREE.DynamicDrawUsage);
    prevPositions.setUsage(THREE.DynamicDrawUsage);
    colors.setUsage(THREE.DynamicDrawUsage);
    alphas.setUsage(THREE.DynamicDrawUsage);
    scales.setUsage(THREE.DynamicDrawUsage);
    frames.setUsage(THREE.DynamicDrawUsage);
    rolls.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('prevPosition', prevPositions);
    geometry.setAttribute('pointColor', colors);
    geometry.setAttribute('pointAlpha', alphas);
    geometry.setAttribute('pointScale', scales);
    geometry.setAttribute('pointFrame', frames);
    geometry.setAttribute('pointRoll', rolls);
    geometry.setDrawRange(0, count);
    if (!billboardMaterial) {
      billboardMaterial = new THREE.ShaderMaterial({
        uniforms: createTextureUniforms(),
        vertexShader: pointVertexShader,
        fragmentShader: pointFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending
      });
      applyTextureSheet(billboardMaterial, textureSheet);
      applyViewportUniforms(billboardMaterial);
    }
    billboardPoints = new THREE.Points(geometry, billboardMaterial);
    billboardPoints.frustumCulled = false;
    syncTextureUniforms();
    group.add(billboardPoints);
  }

  function ensureOrientedMesh(count) {
    if (orientedMesh && count <= orientedCapacity) {
      orientedMesh.count = count;
      syncTextureUniforms();
      hasDynamicOrientedBillboards = currentOrientedPoints.some((point) => point?.billboardMode === 'axis_billboard');
      applyOrientedParticleMatrices(true);
      return;
    }
    clearOrientedMesh();
    orientedCapacity = Math.max(256, Math.ceil(count * 1.25));
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(orientedCapacity * 3), 3));
    geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(new Float32Array(orientedCapacity), 1));
    geometry.setAttribute('instanceFrame', new THREE.InstancedBufferAttribute(new Float32Array(orientedCapacity), 1));
    const material = new THREE.ShaderMaterial({
      uniforms: createTextureUniforms(),
      vertexShader: planeVertexShader,
      fragmentShader: planeFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending
    });
    applyTextureSheet(material, textureSheet);
    applyViewportUniforms(material);
    orientedMesh = new THREE.InstancedMesh(geometry, material, orientedCapacity);
    orientedMesh.count = count;
    orientedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(orientedMesh);
    syncTextureUniforms();
    hasDynamicOrientedBillboards = currentOrientedPoints.some((point) => point?.billboardMode === 'axis_billboard');
    applyOrientedParticleMatrices(true);
  }

  function applyOrientedParticleMatrices(updateColors) {
    if (!orientedMesh) return;
    const instanceColor = orientedMesh.geometry.getAttribute('instanceColor');
    const instanceAlpha = orientedMesh.geometry.getAttribute('instanceAlpha');
    const instanceFrame = orientedMesh.geometry.getAttribute('instanceFrame');
    currentOrientedPoints.forEach((point, index) => {
      const x = Number(point?.x || 0);
      const y = Number(point?.y || 0);
      const z = Number(point?.z || 0);
      const prevX = Number(point?.prevX ?? x);
      const prevY = Number(point?.prevY ?? y);
      const prevZ = Number(point?.prevZ ?? z);
      position.set(
        lerpNumber(prevX, x, interpolationAlpha),
        lerpNumber(prevY, y, interpolationAlpha),
        lerpNumber(prevZ, z, interpolationAlpha)
      );
      scale.copy(resolvePointScale(point, currentPointSize));
      resolveParticleQuaternion(point, quaternion);
      matrix.compose(position, quaternion, scale);
      orientedMesh.setMatrixAt(index, matrix);
      if (updateColors) {
        if (point && Number.isFinite(Number(point.r)) && Number.isFinite(Number(point.g)) && Number.isFinite(Number(point.b))) {
          instanceColor.setXYZ(index, clamp01(point.r), clamp01(point.g), clamp01(point.b));
        } else {
          const parsed = parsePointColor(point);
          instanceColor.setXYZ(index, parsed.r, parsed.g, parsed.b);
        }
        instanceAlpha.setX(index, clamp01(point?.alpha, 1));
        instanceFrame.setX(index, resolveParticleFrameIndex(point, textureConfig));
      }
    });
    orientedMesh.instanceMatrix.needsUpdate = true;
    if (updateColors) {
      instanceColor.needsUpdate = true;
      instanceAlpha.needsUpdate = true;
      instanceFrame.needsUpdate = true;
    }
  }

  function updateBillboardSizes() {
    if (!billboardPoints) return;
    if (currentBufferPoints) {
      updateBillboardBufferPoints(currentBufferPoints, currentBufferPoints.count || 0);
      return;
    }
    const attr = billboardPoints.geometry.getAttribute('pointScale');
    currentBillboardPoints.forEach((point, index) => {
      writePointWorldScale(attr.array, index * 2, point, currentPointSize);
    });
    attr.needsUpdate = true;
  }

  function updateBillboardFrames() {
    if (!billboardPoints) return;
    const attr = billboardPoints.geometry.getAttribute('pointFrame');
    if (currentBufferPoints) {
      fillBufferFrames(attr.array, currentBufferPoints, currentBufferPoints.count || 0);
      attr.needsUpdate = true;
      return;
    }
    currentBillboardPoints.forEach((point, index) => {
      attr.setX(index, resolveParticleFrameIndex(point, textureConfig));
    });
    attr.needsUpdate = true;
  }

  function requestTextureLoad(points) {
    if (textureLoadStarted || !resolveEffectSignature(points)) return;
    textureLoadStarted = true;
    loadAllParticleTextures(() => {
      if (disposed) return;
      syncTextureUniforms(true);
      updateBillboardFrames();
      applyOrientedParticleMatrices(true);
    });
  }

  function syncTextureUniforms(force = false) {
    const nextSignature = resolveEffectSignature(currentPoints);
    const nextTextureSheet = resolveTextureSheet(currentPoints);
    if (force || nextSignature !== textureSignature) {
      textureSignature = nextSignature;
      textureConfig = nextSignature ? getMergedParticleAtlas(nextSignature.split('|')) : null;
    }
    if (force || nextTextureSheet !== textureSheet) {
      textureSheet = nextTextureSheet;
      applyTextureSheet(billboardMaterial, textureSheet);
      applyTextureSheet(orientedMesh?.material, textureSheet);
    }
    applyTextureUniforms(billboardMaterial, textureConfig);
    applyTextureUniforms(orientedMesh?.material, textureConfig);
  }

  function fillBufferFrames(target, data, count) {
    const frameCount = Math.max(0, Math.trunc(Number(textureConfig?.frameCount || 0)));
    if (!frameCount) {
      target.fill(0, 0, count);
      return;
    }
    const offset = textureConfig?.offsets?.get(data.effectClass) || 0;
    const localFrameCount = Math.max(1, frameCount - offset);
    for (let index = 0; index < count; index += 1) {
      const progress = Math.max(0, Math.min(1, Number(data.lifeProgresses[index] || 0)));
      target[index] = offset + Math.min(localFrameCount - 1, Math.floor(progress * localFrameCount));
    }
  }

  function applyTextureUniforms(material, config) {
    if (!material?.uniforms) return;
    material.uniforms.uAtlas.value = config?.texture || null;
    material.uniforms.uFrameCount.value = config?.frameCount || 0;
    material.uniforms.uUseTexture.value = config?.texture ? 1 : 0;
    applyViewportUniforms(material);
    applyInterpolationUniforms(material, interpolationAlpha);
  }

  function applyViewportUniforms(material) {
    if (material?.uniforms?.uViewportHeight) {
      material.uniforms.uViewportHeight.value = viewportHeight;
    }
  }

  function applyInterpolationUniforms(material, alpha) {
    if (material?.uniforms?.uLerpAlpha) {
      material.uniforms.uLerpAlpha.value = alpha;
    }
  }

  function getInterpolationAlpha(now) {
    if (!(interpolationDuration > 0)) return 1;
    const elapsed = Math.max(0, Number(now) - interpolationStart);
    return Math.max(0, Math.min(1, elapsed / interpolationDuration));
  }

  function updateInterpolationUniforms(now) {
    const nextAlpha = getInterpolationAlpha(now);
    if (Math.abs(nextAlpha - interpolationAlpha) < 0.0001) return false;
    interpolationAlpha = nextAlpha;
    applyInterpolationUniforms(billboardMaterial, interpolationAlpha);
    applyInterpolationUniforms(orientedMesh?.material, interpolationAlpha);
    return true;
  }

  function restartInterpolation() {
    interpolationStart = performance.now();
    interpolationAlpha = interpolationDuration > 0 ? 0 : 1;
    applyInterpolationUniforms(billboardMaterial, interpolationAlpha);
    applyInterpolationUniforms(orientedMesh?.material, interpolationAlpha);
    if (orientedMesh) applyOrientedParticleMatrices(false);
  }

  function finishInterpolation() {
    interpolationStart = 0;
    interpolationAlpha = 1;
    applyInterpolationUniforms(billboardMaterial, interpolationAlpha);
    applyInterpolationUniforms(orientedMesh?.material, interpolationAlpha);
  }

  function resolveEffectSignature(points) {
    if (typeof points?.effectSignature === 'string') return points.effectSignature;
    let first = '';
    let names = null;
    for (const point of points) {
      const name = String(point?.effectClass || '').trim();
      if (!name) continue;
      if (!first) {
        first = name;
        continue;
      }
      if (name === first && !names) continue;
      if (!names) names = new Set([first]);
      names.add(name);
    }
    return names ? Array.from(names).sort().join('|') : first;
  }

  function resolveParticleQuaternion(point, target) {
    const mode = point?.billboardMode || 'face_camera';
    if (mode === 'none') {
      target.setFromEuler(new THREE.Euler(degToRad(point?.pitch), degToRad(point?.yaw), degToRad(point?.roll), 'XYZ'));
      return target;
    }
    if (mode === 'axis_billboard') {
      return resolveAxisBillboardQuaternion(point, target);
    }
    target.copy(camera.quaternion);
    rollQuaternion.setFromAxisAngle(zRollAxis, degToRad(point?.roll));
    target.multiply(rollQuaternion);
    return target;
  }

  function resolveAxisBillboardQuaternion(point, target) {
    normalizeAxis(point?.axis, yAxis);
    zAxis.copy(camera.position).sub(position);
    zAxis.addScaledVector(yAxis, -zAxis.dot(yAxis));
    if (zAxis.lengthSq() < 1e-8) zAxis.set(0, 0, 1);
    zAxis.normalize();
    xAxis.copy(yAxis).cross(zAxis);
    if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
    xAxis.normalize();
    yAxis.copy(zAxis).cross(xAxis).normalize();
    basis.makeBasis(xAxis, yAxis, zAxis);
    target.setFromRotationMatrix(basis);
    rollQuaternion.setFromAxisAngle(zRollAxis, degToRad(point?.roll));
    target.multiply(rollQuaternion);
    return target;
  }

  function resetCamera() {
    camera.position.set(2.4, 1.8, 2.4);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function alignCameraToPoints() {
    const box = getCameraFocusBounds();
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const sphereRadius = Math.max(0.12, size.length() * 0.5);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.01));
    const fitDistance = sphereRadius / Math.sin(Math.min(verticalFov, horizontalFov) / 2);
    const distance = Math.max(1.1, Math.min(12, fitDistance * 1.08));
    const viewDirection = new THREE.Vector3(1, 0.75, 1).normalize();
    camera.position.copy(center).addScaledVector(viewDirection, distance);
    controls.target.copy(center);
    controls.update();
  }

  function getCameraFocusBounds() {
    const primaryBounds = getParticleBounds((particle) => (
      particle.alpha > 0.08 && particle.lifeProgress < 0.55
    ));
    if (!primaryBounds.isEmpty()) return primaryBounds;

    const visibleBounds = getParticleBounds((particle) => particle.alpha > 0.03);
    if (!visibleBounds.isEmpty()) return visibleBounds;

    return getParticleBounds();
  }

  function getParticleBounds(filter = null) {
    if (currentBufferPoints?.count) {
      const bounds = new THREE.Box3();
      const count = currentBufferPoints.count;
      const positions = currentBufferPoints.positions;
      const sizes = currentBufferPoints.sizes;
      const alphas = currentBufferPoints.alphas;
      const lifeProgresses = currentBufferPoints.lifeProgresses;
      for (let index = 0; index < count; index += 1) {
        const alpha = clamp01(alphas?.[index], 1);
        const lifeProgress = clamp01(lifeProgresses?.[index], 0);
        if (typeof filter === 'function' && !filter({ alpha, lifeProgress })) continue;
        const offset = index * 3;
        const radius = Number(sizes?.[index] || currentPointSize || 0.07);
        const x = Number(positions[offset] || 0);
        const y = Number(positions[offset + 1] || 0);
        const z = Number(positions[offset + 2] || 0);
        bounds.expandByPoint(new THREE.Vector3(x - radius, y - radius, z - radius));
        bounds.expandByPoint(new THREE.Vector3(x + radius, y + radius, z + radius));
      }
      return bounds;
    }
    if (!currentPoints.length) return new THREE.Box3().setFromObject(group);
    const bounds = new THREE.Box3();
    currentPoints.forEach((point) => {
      const alpha = clamp01(point?.alpha, 1);
      const age = Number(point?.age);
      const life = Number(point?.life);
      const lifeProgress = Number.isFinite(age) && Number.isFinite(life) && life > 0
        ? clamp01(age / life, 0)
        : 0;
      if (typeof filter === 'function' && !filter({ alpha, lifeProgress })) return;
      const radius = Math.max(Number(point?.scaleX || 0), Number(point?.scaleY || 0), Number(point?.scaleZ || 0), currentPointSize || 0.07);
      bounds.expandByPoint(new THREE.Vector3(
        Number(point?.x || 0) - radius,
        Number(point?.y || 0) - radius,
        Number(point?.z || 0) - radius
      ));
      bounds.expandByPoint(new THREE.Vector3(
        Number(point?.x || 0) + radius,
        Number(point?.y || 0) + radius,
        Number(point?.z || 0) + radius
      ));
    });
    return bounds;
  }

  async function toggleFullscreen() {
    if (!host) return;
    try {
      if (!getFullscreenElement()) {
        captureBackground(host);
        const request = host.requestFullscreen || host.webkitRequestFullscreen;
        if (request) {
          await request.call(host);
          applyFullscreenBackground(host);
          resize();
        }
        return;
      }

      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        await exit.call(document);
        restoreBackground(host);
        resize();
      }
    } catch {
      restoreBackground(host);
      resize();
    }
  }

  function setGridVisible(value) {
    grid.visible = Boolean(value);
  }

  function setAxesVisible(value) {
    axes.visible = Boolean(value);
  }

  function setPointSize(value) {
    currentPointSize = Math.max(0.01, Number(value) || 0.07);
    updateBillboardSizes();
    applyOrientedParticleMatrices(false);
  }

  function setInterpolationDuration(value) {
    const numeric = Number(value);
    interpolationDuration = Number.isFinite(numeric) ? Math.max(0, numeric) : DEFAULT_INTERPOLATION_MS;
    if (interpolationDuration <= 0) {
      finishInterpolation();
      applyOrientedParticleMatrices(false);
    }
  }

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frameId);
    themeObserver?.disconnect();
    clearPoints();
    grid.geometry.dispose();
    grid.material.dispose();
    controls.dispose();
    renderer.dispose();
  }

  resize();
  render();

  return {
    resize,
    updatePoints,
    resetCamera,
    alignCameraToPoints,
    toggleFullscreen,
    setGridVisible,
    setAxesVisible,
    setPointSize,
    setInterpolationDuration,
    dispose
  };
}
