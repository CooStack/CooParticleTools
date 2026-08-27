import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveAdaptiveGridLod, resolveAdaptiveGridStep } from '../src/modules/preview/adaptive-grid.js';

const previewSource = readFileSync(
  new URL('../src/modules/preview/three-points-preview.js', import.meta.url),
  'utf8'
);
const legacyAdaptiveGridSource = readFileSync(
  new URL('../public/legacy/assets/shared/js/adaptive-grid.js', import.meta.url),
  'utf8'
);
const canvasSource = readFileSync(
  new URL('../src/components/PreviewCanvas.vue', import.meta.url),
  'utf8'
);
const generatorSource = readFileSync(
  new URL('../src/pages/GeneratorPage.vue', import.meta.url),
  'utf8'
);
const sharedConsumerSources = [
  '../src/components/PointsBuilderWorkspace.vue',
  '../src/components/CompositionPreviewWorkspace.vue',
  '../src/components/CompositionPreviewPanel.vue'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));
const shaderPreviewSource = readFileSync(
  new URL('../src/components/ShaderPreviewPanel.vue', import.meta.url),
  'utf8'
);
const GRID_TEST_FOV = 55;
const GRID_TEST_VIEWPORT_HEIGHT = 240;
const GRID_TEST_PIXEL_SPACING = 48;

function distanceForRawGridStep(rawStep) {
  return rawStep * GRID_TEST_VIEWPORT_HEIGHT
    / (2 * Math.tan(GRID_TEST_FOV * Math.PI / 360) * GRID_TEST_PIXEL_SPACING);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function localGridAlpha({ coordinate, fineStep, lodBlend, baseDensity }) {
  const densityLevel = Math.max(0, Math.min(20, Math.floor(Math.log2(Math.max(baseDensity / 0.45, 1)))));
  const densityScale = 2 ** densityLevel;
  const localFineStep = fineStep * densityScale;
  const localCoarseStep = localFineStep * 2;
  const localDensity = baseDensity / densityScale;
  const cameraBlend = densityLevel < 0.5 ? lodBlend : 0;
  const fineToCoarse = Math.max(smoothstep(0.45, 0.9, localDensity), cameraBlend);
  const isLine = (step) => Math.abs(coordinate / step - Math.round(coordinate / step)) < 1e-9 ? 1 : 0;
  return Math.max(isLine(localFineStep) * (1 - fineToCoarse), isLine(localCoarseStep));
}

function functionSource(name, nextName) {
  const start = previewSource.indexOf(`  function ${name}(`);
  const end = previewSource.indexOf(`  function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? previewSource.slice(start, end) : '';
}

test('preview render loop follows every animation frame callback', () => {
  const render = functionSource('render', 'resize');
  const activeRender = render.slice(render.indexOf('const interpolationChanged'));

  assert.match(activeRender, /renderer\.render\(scene, camera\)/);
  assert.match(activeRender, /frameId = requestAnimationFrame\(render\)/);
  assert.doesNotMatch(activeRender, /\breturn\b|setTimeout|1000\s*\/\s*60/);
});

test('particle updates never move the preview camera automatically', () => {
  const updatePoints = functionSource('updatePoints', 'updateBufferPoints');
  const updateBufferPoints = functionSource('updateBufferPoints', 'updateBillboardPoints');

  assert.ok(updatePoints);
  assert.ok(updateBufferPoints);
  assert.doesNotMatch(updatePoints, /resetCamera|alignCameraToPoints/);
  assert.doesNotMatch(updateBufferPoints, /resetCamera|alignCameraToPoints/);
});

test('face-camera billboard shader keeps separate X/Y scale attributes', () => {
  assert.match(previewSource, /attribute vec2 pointScale/);
  assert.match(previewSource, /float spriteExtent = length\(pointScale\)/);
  assert.match(previewSource, /localUv \*= spriteExtent \/ max\(vPointScale, vec2\(0\.0001\)\)/);
  assert.match(previewSource, /geometry\.setAttribute\('pointScale', scales\)/);
  assert.doesNotMatch(previewSource, /sizeArray\[index\] = resolvePointWorldSize/);
});

test('particle preview applies the configured texture sheet blend state', () => {
  assert.match(previewSource, /function resolveTextureSheet\(points\)/);
  assert.match(previewSource, /function applyTextureSheet\(material, textureSheet\)/);
  assert.match(previewSource, /\.startsWith\('ADDITION_BLEND'/);
  assert.match(previewSource, /material\.blending = THREE\.CustomBlending/);
  assert.match(previewSource, /material\.blendDst = bounded \? THREE\.OneMinusSrcColorFactor : THREE\.OneFactor/);
  assert.match(previewSource, /material\.needsUpdate = true/);
});

test('free particle rotation uses the API XYZ Euler order', () => {
  const resolveQuaternion = functionSource('resolveParticleQuaternion', 'resolveAxisBillboardQuaternion');

  assert.match(resolveQuaternion, /new THREE\.Euler\([^\n]+, 'XYZ'\)/);
  assert.doesNotMatch(resolveQuaternion, /'YXZ'/);
});

test('reset uses a fixed pose while alignment frames current particles', () => {
  const resetCamera = functionSource('resetCamera', 'alignCameraToPoints');
  const alignCameraToPoints = functionSource('alignCameraToPoints', 'getCameraFocusBounds');

  assert.match(resetCamera, /camera\.position\.set\(2\.4, 1\.8, 2\.4\)/);
  assert.match(resetCamera, /controls\.target\.set\(0, 0, 0\)/);
  assert.doesNotMatch(resetCamera, /getCameraFocusBounds/);
  assert.match(alignCameraToPoints, /getCameraFocusBounds\(\)/);
  assert.match(alignCameraToPoints, /camera\.position\.copy\(center\)/);
});

test('preview grid adapts its world step to camera distance', () => {
  const closeStep = resolveAdaptiveGridStep({ distance: 2, fov: 55, viewportHeight: 240 });
  const farStep = resolveAdaptiveGridStep({ distance: 20, fov: 55, viewportHeight: 240 });

  assert.ok(closeStep > 0);
  assert.ok(farStep > closeStep);
  assert.ok(Math.abs(Math.log2(closeStep) - Math.round(Math.log2(closeStep))) < 1e-9);
  assert.ok(Math.abs(Math.log2(farStep) - Math.round(Math.log2(farStep))) < 1e-9);
});

test('preview grid transitions from fine cells to coarse cells', () => {
  const near = resolveAdaptiveGridLod({ distance: 2, fov: 55, viewportHeight: 240 });
  const transition = resolveAdaptiveGridLod({ distance: 30, fov: 55, viewportHeight: 240 });
  const far = resolveAdaptiveGridLod({ distance: 20, fov: 55, viewportHeight: 240 });

  assert.ok(near.coarseStep > near.fineStep);
  assert.ok(far.coarseStep > far.fineStep);
  assert.ok(near.blend >= 0 && near.blend <= 1);
  assert.ok(transition.blend > 0 && transition.blend < 1);
  assert.ok(far.blend >= 0 && far.blend <= 1);
  assert.ok(far.fineStep >= near.fineStep);
});

test('preview grid coarse levels are nested subsets of their fine levels', () => {
  for (const rawStep of [0.001, 0.0078125, 0.015624, 0.015625, 0.03, 0.07, 0.15, 0.3, 0.7, 1.5, 2.5, 4, 7, 15, 30, 70, 65536, 100000, 1000000]) {
    const lod = resolveAdaptiveGridLod({
      distance: distanceForRawGridStep(rawStep),
      fov: GRID_TEST_FOV,
      viewportHeight: GRID_TEST_VIEWPORT_HEIGHT
    });
    const ratio = lod.coarseStep / lod.fineStep;
    assert.equal(ratio, 2, `raw step ${rawStep} produced non-nested ratio ${ratio}`);
  }
});

test('preview grid hands off every supported power-of-two boundary without an LOD jump', () => {
  for (let exponent = -6; exponent <= 16; exponent += 1) {
    const boundary = 2 ** exponent;
    const below = resolveAdaptiveGridLod({
      distance: distanceForRawGridStep(boundary * 0.999),
      fov: GRID_TEST_FOV,
      viewportHeight: GRID_TEST_VIEWPORT_HEIGHT
    });
    const above = resolveAdaptiveGridLod({
      distance: distanceForRawGridStep(boundary * 1.001),
      fov: GRID_TEST_FOV,
      viewportHeight: GRID_TEST_VIEWPORT_HEIGHT
    });

    assert.equal(below.coarseStep, above.fineStep, `boundary 2^${exponent} did not preserve shared lines`);
    assert.ok(below.blend > 0.95, `boundary 2^${exponent} did not finish fading intermediate lines`);
    assert.ok(above.blend < 0.05, `boundary 2^${exponent} did not restart from the preserved grid`);
  }
});

test('preview grid preserves near and horizon line alpha across an LOD boundary', () => {
  for (const baseDensity of [0.2, 0.8, 2, 20, 200]) {
    for (const coordinate of [0.5, 1, 1.5, 2, 2.5, 6, 10, 16, 32, 64, 128, 256]) {
      const before = localGridAlpha({ coordinate, fineStep: 0.5, lodBlend: 1, baseDensity });
      const after = localGridAlpha({ coordinate, fineStep: 1, lodBlend: 0, baseDensity: baseDensity / 2 });
      assert.ok(Math.abs(before - after) < 1e-9, `density ${baseDensity}, coordinate ${coordinate}: ${before} -> ${after}`);
    }
  }
});

test('preview grid keeps shared lines while fading only intermediate lines', () => {
  assert.match(previewSource, /float gridLine\(vec2 coordinate, vec2 derivative\)/);
  assert.match(previewSource, /vec2 worldDerivative = fwidth\(worldPosition\.xz\)/);
  assert.match(previewSource, /worldDerivative \/ max\(localFineStep, 0\.0001\)/);
  assert.match(previewSource, /float densityLevel = clamp\(floor\(log2\(max\(baseDensity \/ 0\.45, 1\.0\)\)\), 0\.0, 20\.0\)/);
  assert.match(previewSource, /float localFineStep = uFineStep \* densityScale/);
  assert.match(previewSource, /float localCoarseStep = localFineStep \* 2\.0/);
  assert.match(previewSource, /float fineAlpha = fineLine \* \(1\.0 - fineToCoarse\) \* 0\.92/);
  assert.match(previewSource, /float coarseAlpha = coarseLine \* 0\.92/);
  assert.match(previewSource, /gl_FragColor = vec4\(uGridColor, alpha\)/);
  assert.doesNotMatch(previewSource, /uMinorColor|uMajorColor|uNextStep|uFarStep|coarseToNext|nextToFar|handoffMajorAlpha|coarseWeight|coarseLine \* fineToCoarse/);
  assert.match(legacyAdaptiveGridSource, /const coarseStep = fineStep \* 2/);
  assert.match(legacyAdaptiveGridSource, /float gridLine\(vec2 coordinate, vec2 derivative\)/);
  assert.match(legacyAdaptiveGridSource, /vec2 coordinateDerivative = fwidth\(coordinate\)/);
  assert.match(legacyAdaptiveGridSource, /coordinateDerivative \/ max\(localFineStep, 0\.0001\)/);
  assert.match(legacyAdaptiveGridSource, /float localFineStep = uFineStep \* densityScale/);
  assert.match(legacyAdaptiveGridSource, /float localCoarseStep = localFineStep \* 2\.0/);
  assert.match(legacyAdaptiveGridSource, /float fineAlpha = fineLine \* \(1\.0 - fineToCoarse\) \* 0\.98/);
  assert.match(legacyAdaptiveGridSource, /float coarseAlpha = coarseLine \* 0\.98/);
  assert.doesNotMatch(legacyAdaptiveGridSource, /uNextStep|uFarStep|coarseToNext|nextToFar/);
  assert.doesNotMatch(previewSource, /fwidth\(worldPosition\.xz \/|fwidth\(coordinate \/|fwidth\(local/);
  assert.doesNotMatch(legacyAdaptiveGridSource, /fwidth\(coordinate \/|fwidth\(local/);
});

test('emitter preview uses PointsBuilder-equivalent native canvas sampling', () => {
  assert.match(previewSource, /new THREE\.WebGLRenderer\(\{ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' \}\)/);
  assert.match(previewSource, /renderer\.setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 2\)\)/);
  assert.match(previewSource, /const width = canvas\.clientWidth \|\| host\.clientWidth \|\| 420/);
  assert.match(previewSource, /const height = canvas\.clientHeight \|\| host\.clientHeight \|\| 280/);
  assert.match(previewSource, /const renderWidth = Math\.max\(1, Math\.round\(width\)\)/);
  assert.match(previewSource, /const renderHeight = Math\.max\(1, Math\.round\(height\)\)/);
  assert.match(previewSource, /uGridColor/);
  assert.match(previewSource, /new MutationObserver\(\(\) => gridMaterial\.uniforms\.uGridColor\.value\.set\(resolveGridColor\(host\)\)\)/);
  assert.match(previewSource, /themeObserver\?\.disconnect\(\)/);
  assert.doesNotMatch(previewSource, /uMinorColor/);
  assert.doesNotMatch(previewSource, /uMajorColor/);
});

test('preview updates the shared grid every render from the camera distance', () => {
  assert.match(previewSource, /function updateAdaptiveGrid\(\)/);
  assert.match(previewSource, /const cameraDistance = camera\.position\.distanceTo\(controls\.target\)/);
  assert.match(previewSource, /uniform float uFineStep/);
  assert.match(previewSource, /uniform float uLodBlend/);
  assert.match(previewSource, /gridMaterial\.uniforms\.uFineStep\.value = lod\.fineStep/);
  assert.doesNotMatch(previewSource, /uniform float uCoarseStep|gridMaterial\.uniforms\.uCoarseStep/);
  assert.match(previewSource, /gridMaterial\.uniforms\.uPlaneOrigin\.value\.set\(controls\.target\.x/);
  assert.match(previewSource, /gridMaterial\.uniforms\.uInvProjection\.value\.copy\(camera\.projectionMatrix\)/);
  assert.match(previewSource, /new THREE\.PlaneGeometry\(2, 2\)/);
  assert.match(previewSource, /updateAdaptiveGrid\(\);/);
});

test('legacy adaptive grid keeps each plane anchored in world coordinates', () => {
  assert.match(legacyAdaptiveGridSource, /uPlaneOrigin\.value\.set\(0, 0, 0\)/);
  assert.match(legacyAdaptiveGridSource, /uPlaneOrigin\.value\.z = planeOffset/);
  assert.match(legacyAdaptiveGridSource, /uPlaneOrigin\.value\.x = planeOffset/);
  assert.match(legacyAdaptiveGridSource, /uPlaneOrigin\.value\.y = planeOffset/);
  assert.doesNotMatch(legacyAdaptiveGridSource, /uPlaneOrigin\.value\.copy\(target\)/);
  assert.match(legacyAdaptiveGridSource, /uCenter\.value\.copy\(target\)/);
});

test('generator exposes an explicit align camera action', () => {
  assert.match(canvasSource, /function alignCameraToPoints\(\)/);
  assert.match(canvasSource, /threePreview\.value\?\.alignCameraToPoints\(\)/);
  assert.match(canvasSource, /defineExpose\(\{ resetCamera, alignCameraToPoints, toggleFullscreen \}\)/);
  assert.match(generatorSource, /@click="previewCanvasRef\?\.alignCameraToPoints\(\)"[^>]*>对齐画面<\/button>/);
});

test('shared preview consumers retain an explicit align camera action', () => {
  sharedConsumerSources.forEach((source) => {
    assert.match(source, />对齐画面<\/button>/);
    assert.match(source, /\.alignCameraToPoints(?:\?\.)?\(/);
  });
  assert.match(shaderPreviewSource, /function alignCameraToPoints\(\)/);
  assert.match(shaderPreviewSource, /defineExpose\(\{ resetCamera, alignCameraToPoints, toggleFullscreen \}\)/);
});
