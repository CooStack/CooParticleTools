import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createExpressionRuntime } from '../public/legacy/assets/composition_builder/js/expression_runtime.js';

const sourceUrl = new URL(
  '../public/legacy/assets/composition_builder/js/preview_runtime_mixin.js',
  import.meta.url
);
const source = readFileSync(sourceUrl, 'utf8');
const mainSource = readFileSync(
  new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url),
  'utf8'
);
const executableSource = source
  .replace(
    /^import\s+\*\s+as\s+THREE[^\n]*\n/,
    'const THREE = { BufferAttribute: class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } } };\n'
  )
  .replace(/^import\s+\{[\s\S]*?\}\s+from\s+"[^"]+";\r?\n/m, '')
  .replaceAll('import.meta.url', '"file:///preview_runtime_mixin.js"')
  .replace('export function installPreviewRuntimeMethods', 'function installPreviewRuntimeMethods');
const installPreviewRuntimeMethods = new Function(
  `${executableSource}\nreturn installPreviewRuntimeMethods;`
)();

class PreviewHarness {}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const int = (value) => Math.trunc(num(value));
const clamp = (value, min, max) => Math.min(Math.max(num(value), num(min)), num(max));
const U = {
  v: (x = 0, y = 0, z = 0) => ({ x: num(x), y: num(y), z: num(z) }),
  clone: (value) => ({ x: num(value?.x), y: num(value?.y), z: num(value?.z) }),
  len: (value) => Math.hypot(num(value?.x), num(value?.y), num(value?.z)),
  cross: (a, b) => ({
    x: num(a?.y) * num(b?.z) - num(a?.z) * num(b?.y),
    y: num(a?.z) * num(b?.x) - num(a?.x) * num(b?.z),
    z: num(a?.x) * num(b?.y) - num(a?.y) * num(b?.x)
  }),
  norm(value) {
    const length = this.len(value) || 1;
    return this.v(num(value?.x) / length, num(value?.y) / length, num(value?.z) / length);
  },
  angleToRad: (value) => num(value)
};

installPreviewRuntimeMethods(PreviewHarness, {
  U,
  num,
  int,
  clamp,
  normalizeAnimate: (value) => value,
  normalizeControllerAction: (value) => value,
  normalizeDisplayAction: (value) => value,
  normalizeAlphaHelperConfig: (value) => value || { type: 'none' },
  normalizeScaleHelperConfig: (value) => value || { type: 'none' },
  ensureStatusHelperMethods: (value) => value,
  stripJsForLint: (value) => String(value || ''),
  transpileKotlinThisQualifierToJs: (value) => String(value || ''),
  rotatePointsToPointUpright: (value) => value,
  srgbRgbToLinearArray: (value) => value,
  CONTROLLER_SCOPE_RESERVED: new Set(),
  normalizeAngleUnit: (value) => value,
  normalizeAngleOffsetEaseName: (value) => value,
  normalizeAngleOffsetEaseSpecialParams: (value) => value
});

function createHarness(pointCount) {
  const app = new PreviewHarness();
  app.state = {
    settings: {
      previewRenderCacheEnabled: true
    },
    cards: [
      {
        id: 'card-1',
        previewVisible: true,
        previewSolo: false
      }
    ]
  };
  app.previewBasePoints = { length: pointCount };
  app.previewSourcePointTotal = pointCount;
  app.previewRootVirtualTotal = 1;
  app.previewRenderCacheGeneration = 1;
  app._mergedAtlasOffsets = new Map();
  app.getPreviewCycleConfig = () => ({
    appear: 16,
    live: 54,
    fade: 0,
    play: 70,
    total: 70
  });
  return app;
}

function createVisualHarness(card, stateOverrides = {}) {
  const app = new PreviewHarness();
  app.state = {
    globalVars: [],
    globalConsts: [],
    projectScale: { type: 'none' },
    projectAlpha: { type: 'none' },
    displayActions: [],
    cards: [card],
    ...stateOverrides
  };
  app.previewNumericFnCache = new Map();
  app.previewExprFnCache = new Map();
  app.previewControllerFnCache = new Map();
  app.previewVisualRuntimePlanCache = new Map();
  app.previewCardVisualAgeDependentCache = new Map();
  app.getCardById = (id) => app.state.cards.find((entry) => entry.id === id);
  app.exprRuntime = createExpressionRuntime({
    U,
    getState: () => app.state,
    sanitizeIdentifier: (value) => value
  });
  return app;
}

function createGpuShapeCard(leafOverrides = {}, cardOverrides = {}) {
  const leaf = {
    id: 'gpu-particles-leaf',
    type: 'single',
    particleInit: [],
    controllerVars: [],
    controllerActions: [],
    ...leafOverrides
  };
  const card = {
    id: 'gpu-particles',
    dataType: 'particle_shape',
    useCParticle: true,
    shapeChildren: [leaf],
    ...cardOverrides
  };
  return { card, leaf };
}

function prepareGpuParticlePathHarness(card, leaf) {
  const app = createVisualHarness(card, {
    compositionType: 'particle',
    compositionAnimates: [],
    displayActions: [],
    projectScale: { type: 'none' }
  });
  const attributes = {
    aFrameIndex: { array: new Float32Array(1), needsUpdate: false }
  };
  app.pointsGeom = {
    getAttribute(name) {
      return attributes[name] || null;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };
  app.previewBasePoints = [U.v(1, 2, 3)];
  app.previewOwners = [card.id];
  app.previewBirthOffsets = [0];
  app.previewLeafTextureConfigs = [{
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    randomAgePreTick: true,
    useCParticle: true
  }];
  app.previewLeafVisualSources = [leaf];
  app.previewCardById = new Map([[card.id, card]]);
  return { app, attributes };
}

test('preview frame cache key is independent from camera movement', () => {
  const app = createHarness(65536);
  const cycleCfg = app.getPreviewCycleConfig();
  const context = {
    totalCount: 65536,
    elapsedTick: 10.5,
    globalCycleAge: 10.5,
    cycleIndex: 0,
    cycleCfg
  };

  app.camera = {
    position: { x: 16, y: 11, z: 16 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }
  };
  const firstKey = app.makePreviewFrameCacheKey(context);

  app.camera.position = { x: -30, y: 5, z: 2 };
  app.camera.quaternion = { x: 0.5, y: 0.25, z: 0.1, w: 0.8 };
  const movedKey = app.makePreviewFrameCacheKey(context);

  assert.equal(movedKey, firstKey);
  assert.ok(firstKey);
  assert.equal(firstKey.includes('camera:'), false);
});

test('preview cache keeps the intended 16384 and 65536 particle frame budgets', () => {
  const cycleCfg = createHarness(1).getPreviewCycleConfig();
  const small = createHarness(16384);
  const target = createHarness(65536);

  assert.equal(small.getPreviewRenderCacheSubframesPerTick(16384, cycleCfg), 4);
  assert.equal(small.getPreviewRenderCacheMaxFrames(16384, cycleCfg), 281);
  assert.equal(target.getPreviewRenderCacheSubframesPerTick(65536, cycleCfg), 2);
  assert.equal(target.getPreviewRenderCacheMaxFrames(65536, cycleCfg), 141);
});

test('preview frame computation stays camera-independent', () => {
  assert.equal(source.includes('frustum.containsPoint'), false);
  assert.equal(source.includes('new THREE.Frustum'), false);
});

test('cached frames expose current geometry and visibility to preview interactions', () => {
  const app = createHarness(2);
  const attributes = {
    position: { array: new Float32Array(6), needsUpdate: false },
    color: { array: new Float32Array(6), needsUpdate: false },
    aSize: { array: new Float32Array(2), needsUpdate: false },
    aAlpha: { array: new Float32Array(2), needsUpdate: false },
    aFrameIndex: { array: new Float32Array(2), needsUpdate: false }
  };
  app.pointsGeom = {
    getAttribute(name) {
      return attributes[name] || null;
    }
  };
  const visibleMask = new Uint8Array([1, 0]);
  const frame = {
    pointCount: 2,
    positions: new Float32Array([1, 2, 3, 4, 5, 6]),
    colors: new Uint8Array([255, 0, 0, 0, 255, 0]),
    sizes: new Float32Array([1, 2]),
    alphas: new Uint8Array([255, 128]),
    frameIndices: new Uint16Array([0, 1]),
    visibleMask
  };

  assert.equal(app.applyPreviewFrame(frame, { restoreRuntimeState: false }), true);
  assert.equal(app.getPreviewInteractionPositionArray(), attributes.position.array);
  assert.equal(app.getPreviewInteractionVisibleMask(), visibleMask);
  assert.match(mainSource, /getPreviewInteractionPositionArray/);
  assert.match(mainSource, /getPreviewInteractionVisibleMask/);
});

test('constant Vector3f particle colors reach the Composition preview unchanged', () => {
  const app = new PreviewHarness();
  const color = [0.729412, 0.529412, 0.529412];
  app.state = {
    globalVars: [],
    globalConsts: [],
    cards: [{
      id: 'particles',
      dataType: 'single',
      particleInit: [{
        target: 'color',
        expr: 'Vector3f(0.729412f, 0.529412f, 0.529412f)'
      }],
      controllerVars: [],
      controllerActions: []
    }]
  };
  app.previewNumericFnCache = new Map();
  app.previewControllerFnCache = new Map();
  app.previewVisualRuntimePlanCache = new Map();
  app.previewCardVisualAgeDependentCache = new Map();
  app.getCardById = (id) => app.state.cards.find((card) => card.id === id);
  app.exprRuntime = createExpressionRuntime({
    U,
    getState: () => app.state,
    sanitizeIdentifier: (value) => value
  });

  const visual = app.resolveCardPreviewVisual('particles');

  assert.deepEqual(visual.color, color);
});

test('Vector3f preview colors accept Kotlin exponent suffixes', () => {
  const app = new PreviewHarness();
  app.state = {
    globalVars: [],
    globalConsts: [],
    cards: [{
      id: 'particles',
      dataType: 'single',
      particleInit: [{
        target: 'color',
        expr: 'Vector3f(1e0f, 5.29412e-1f, 5.29412e-1f)'
      }],
      controllerVars: [],
      controllerActions: []
    }]
  };
  app.previewNumericFnCache = new Map();
  app.previewControllerFnCache = new Map();
  app.previewVisualRuntimePlanCache = new Map();
  app.previewCardVisualAgeDependentCache = new Map();
  app.getCardById = (id) => app.state.cards.find((card) => card.id === id);
  app.exprRuntime = createExpressionRuntime({
    U,
    getState: () => app.state,
    sanitizeIdentifier: (value) => value
  });

  assert.deepEqual(app.resolveCardPreviewVisual('particles').color, [1, 0.529412, 0.529412]);
});

test('Composition preview enables GPU behavior only through a shape root', () => {
  const staleSingle = { id: 'single', dataType: 'single', useCParticle: true, randomAgePreTick: true };
  const legacySingle = { id: 'legacy', dataType: 'cparticle', useCParticle: true, randomAgePreTick: true };
  const { card, leaf } = createGpuShapeCard({ randomAgePreTick: true });
  const cpuShape = { ...card, useCParticle: false };
  const app = createVisualHarness(card);

  assert.deepEqual(app.resolvePreviewTextureConfigForCard(staleSingle), {
    effectClass: '', useTexture: true, randomAgePreTick: false, useCParticle: false
  });
  assert.deepEqual(app.resolvePreviewTextureConfigForCard(legacySingle), {
    effectClass: '', useTexture: true, randomAgePreTick: false, useCParticle: false
  });
  assert.equal(app.resolvePreviewTextureConfigForShapeLeaf(leaf, card).useCParticle, true);
  assert.equal(app.resolvePreviewTextureConfigForShapeLeaf(leaf, cpuShape).useCParticle, false);
});

test('simple CParticle Composition selects the GPU preview path and complex behavior falls back', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app } = prepareGpuParticlePathHarness(card, leaf);

  assert.equal(app.canUsePreviewGpuParticlePath(), true);

  leaf.controllerActions = [{ type: 'tick_js', script: 'setAlpha(0.5)' }];
  app.previewVisualRuntimePlanCache.clear();
  app.previewCardVisualAgeDependentCache.clear();
  assert.equal(app.canUsePreviewGpuParticlePath(), false);
  assert.match(app.previewGpuParticleFallbackReason, /存在每帧控制器/);

  leaf.controllerActions = [];
  app.previewVisualRuntimePlanCache.clear();
  app.previewCardVisualAgeDependentCache.clear();
  app.previewBirthOffsets[0] = 1;
  assert.equal(app.canUsePreviewGpuParticlePath(), false);

  app.previewBirthOffsets[0] = 0;
  app.previewLeafTextureConfigs[0].useCParticle = false;
  assert.equal(app.canUsePreviewGpuParticlePath(), false);
});

test('one-time point-dependent CParticle initialization stays on the GPU preview path', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [
      { target: 'color', expr: 'Vector3f(index / 10, 0.5, 1)' },
      { target: 'age', expr: 'Random.nextInt(maxAge)' }
    ]
  });
  const { app } = prepareGpuParticlePathHarness(card, leaf);

  assert.equal(app.getCardPreviewVisualDependency(card, { visualSource: leaf }).pointDependent, true);
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
});

test('GPU preview uploads local-index particle initialization and lifecycle values', () => {
  const first = createGpuShapeCard({
    particleInit: [
      { target: 'maxAge', expr: '20 + index' },
      { target: 'age', expr: 'maxAge - 5' },
      { target: 'color', expr: 'Vector3f(index / 10, 0.5, 1)' }
    ]
  }, { id: 'first-gpu-card' });
  const second = createGpuShapeCard({
    particleInit: [
      { target: 'maxAge', expr: '20 + index' },
      { target: 'age', expr: 'maxAge - 5' },
      { target: 'color', expr: 'Vector3f(index / 10, 0.5, 1)' }
    ]
  }, { id: 'second-gpu-card' });
  const app = createVisualHarness(first.card, {
    compositionType: 'particle',
    compositionAnimates: [],
    displayActions: [],
    projectScale: { type: 'none' },
    cards: [first.card, second.card]
  });
  const attributes = {};
  app.pointsGeom = {
    attributes,
    getAttribute(name) {
      return attributes[name] || null;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    deleteAttribute(name) {
      delete attributes[name];
    },
    computeBoundingSphere() {}
  };
  app.previewBasePoints = [U.v(), U.v(), U.v(), U.v()];
  app.previewOwners = [first.card.id, first.card.id, second.card.id, second.card.id];
  app.previewOwnerLocalIndex = [0, 1, 0, 1];
  app.previewBirthOffsets = [0, 0, 0, 0];
  app.previewLeafTextureConfigs = [first.leaf, first.leaf, second.leaf, second.leaf].map(() => ({
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    randomAgePreTick: false,
    useCParticle: true
  }));
  app.previewLeafVisualSources = [first.leaf, first.leaf, second.leaf, second.leaf];
  app.previewCardById = new Map([
    [first.card.id, first.card],
    [second.card.id, second.card]
  ]);
  app.dom = { statusPoints: { textContent: '' } };
  app.updateSelectionStatus = () => {};

  app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  assert.equal(app.configurePreviewGpuParticlePath(), true);

  assert.deepEqual(
    Array.from(attributes.color.array).filter((_, index) => index % 3 === 0).map((value) => Number(value.toFixed(3))),
    [0, 0.1, 0, 0.1]
  );
  assert.deepEqual(Array.from(attributes.aGpuLifecycle.array), [15, 20, 16, 21, 15, 20, 16, 21]);
  assert.match(mainSource, /attribute vec2 aGpuLifecycle;/);
  assert.match(mainSource, /aGpuLifecycle\.x \/ max\(aGpuLifecycle\.y, 1\.0\)/);
});

test('static root rotateAsAxis stays on the GPU path and uploads a transform delta', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeDisplayActions: [{ type: 'rotateAsAxis', angleMode: 'expr', angleExpr: 'PI / 32' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewLevelBases = [[U.v(1, 0, 0)]];

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  const rotation = app.resolvePreviewGpuRootRotation(card);
  assert.ok(rotation);
  assert.ok(Math.abs(rotation.anglePerTick - Math.PI / 32) < 1e-6);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(Array.from(attributes.aGpuTransform.array.slice(0, 3)), [0, 1, 0]);
  assert.ok(Math.abs(attributes.aGpuTransform.array[3]) < 1e-6);
  assert.deepEqual(Array.from(attributes.aGpuTransformVector.array), [1, 0, 0]);
  assert.match(mainSource, /attribute vec4 aGpuTransform;/);
  assert.match(mainSource, /attribute float aGpuScale;/);
  assert.match(mainSource, /rotateGpuVector/);
  assert.match(mainSource, /transformed = \(uGpuPreviewGlobalTransform \* vec4\(transformed, 1\.0\)\)\.xyz/);
});

test('GPU preview accepts root rotateToPoint and rotateToWithAngle transforms', () => {
  for (const shapeDisplayActions of [
    [{ type: 'rotateToPoint', toPreset: 'RelativeLocation.xAxis()' }],
    [{ type: 'rotateToWithAngle', toPreset: 'RelativeLocation.xAxis()', angleMode: 'expr', angleExpr: 'PI / 4' }]
  ]) {
    const { card, leaf } = createGpuShapeCard({}, {
      shapeAxisPreset: 'RelativeLocation.yAxis()',
      shapeDisplayActions
    });
    const { app } = prepareGpuParticlePathHarness(card, leaf);
    assert.equal(app.canUsePreviewGpuParticlePath(), true);
    assert.equal(app.configurePreviewGpuParticlePath(), true);
    const rotation = app.resolvePreviewGpuRootRotation(card);
    assert.ok(rotation);
    assert.ok(rotation.angle > 0.1);
  }
});


test('GPU preview keeps nested static Composition leaves on the GPU path', () => {
  const { card, leaf } = createGpuShapeCard();
  card.shapeChildren = [{
    type: 'particle_shape',
    children: [leaf]
  }];
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
});

test('GPU preview keeps global rotateAsAxis in the uniform transform path', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app.state.displayActions = [{ type: 'rotateAsAxis', angleMode: 'numeric', angleValue: Math.PI / 2, angleUnit: 'rad' }];
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 },
      uGpuPreviewGlobalTransform: { value: app.createPreviewGpuMatrix4() }
    }
  };
  app.previewAnimStart = 0;
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleAnimation(50);
  const elements = app._pointsShaderRef.uniforms.uGpuPreviewGlobalTransform.value.elements;
  assert.ok(Math.abs(elements[0]) < 1e-6);
  assert.ok(Math.abs(Math.abs(elements[2]) - 1) < 1e-6);
});


test('GPU preview keeps project scale on a uniform transform instead of rebuilding CPU positions', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app.state.projectScale = { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' };
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 },
      uGpuPreviewGlobalTransform: { value: app.createPreviewGpuMatrix4() }
    }
  };
  app.previewAnimStart = 0;
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  const originalPosition = app.pointsGeom.getAttribute('position');
  app.updatePreviewGpuParticleAnimation(250);
  assert.equal(app.pointsGeom.getAttribute('position'), originalPosition);
  assert.ok(Math.abs(app._pointsShaderRef.uniforms.uGpuPreviewGlobalTransform.value.elements[0] - 1.25) < 1e-6);
  assert.ok(Math.abs(app._pointsShaderRef.uniforms.uGpuPreviewGlobalTransform.value.elements[5] - 1.25) < 1e-6);
  assert.ok(Math.abs(app._pointsShaderRef.uniforms.uGpuPreviewGlobalTransform.value.elements[10] - 1.25) < 1e-6);
});


test('GPU preview keeps card scale in a per-owner GPU attribute', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeScale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' }
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewAnimStart = 0;
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleAnimation(250);
  assert.ok(Math.abs(attributes.aGpuScale.array[0] - 1.25) < 1e-6);
});


test('GPU preview uploads static lifecycle attributes and advances with uniforms only', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    cparticleAlpha: {
      fadeIn: { enabled: true, durationTicks: 6, fromAlpha: 0.1, toAlpha: 0.9 },
      fadeOut: { enabled: true, durationTicks: 4, fromAlpha: 0.9, toAlpha: 0 }
    }
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app._particleDataFns = {
    getParticleDataByName: () => ({ atlasReady: true, atlas: {}, textureLoadOk: true, frames: 8 })
  };
  app._mergedAtlasOffsets = new Map([['ControlableEndRodEffect', 3]]);
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 }
    }
  };
  app.getPreviewCycleConfig = () => ({ play: 70, total: 80 });
  app.previewAnimStart = 0;
  app.dom = { statusPoints: { textContent: '' } };

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(Array.from(attributes.aGpuMeta.array), [1, 0, 3, 8]);
  assert.equal(attributes.aGpuFadeIn.array[0], 6);
  assert.ok(Math.abs(attributes.aGpuFadeIn.array[1] - 0.1) < 1e-6);
  assert.ok(Math.abs(attributes.aGpuFadeIn.array[2] - 0.9) < 1e-6);
  assert.ok(attributes.aGpuFadeIn.array[3] > 0);
  assert.equal(attributes.aGpuFadeOut.array[0], 4);
  assert.ok(Math.abs(attributes.aGpuFadeOut.array[1] - 0.9) < 1e-6);
  assert.deepEqual(Array.from(attributes.aGpuFadeOut.array.slice(2)), [0, 0]);
  assert.equal(attributes.aFrameIndex.array[0], 3);

  assert.equal(app.updatePreviewGpuParticleAnimation(250), true);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewEnabled.value, 1);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewTick.value, 5);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewPlayTicks.value, 70);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewCycleTicks.value, 80);
  assert.equal(app.dom.statusPoints.textContent, '点数: 1/1');
  assert.match(source, /if \(this\.updatePreviewGpuParticleAnimation\(now\)\) return;/);
  assert.match(mainSource, /attribute vec4 aGpuMeta;/);
  assert.match(mainSource, /uGpuPreviewEnabled/);
  assert.match(mainSource, /defaultAttributeValues/);
});

test('GPU preview refreshes active masks after Composition layer visibility changes', () => {
  const first = createGpuShapeCard({}, { id: 'first-gpu-card' });
  const second = createGpuShapeCard({}, { id: 'second-gpu-card' });
  const app = createVisualHarness(first.card, {
    compositionType: 'particle',
    cards: [first.card, second.card]
  });
  app.previewBasePoints = [U.v(1, 2, 3), U.v(4, 5, 6)];
  app.previewOwners = [first.card.id, second.card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewLeafTextureConfigs = [
    { useCParticle: true, effectClass: '', randomAgePreTick: false },
    { useCParticle: true, effectClass: '', randomAgePreTick: false }
  ];
  app.previewLeafVisualSources = [first.leaf, second.leaf];
  app.previewCardById = new Map([
    [first.card.id, first.card],
    [second.card.id, second.card]
  ]);
  const attributes = {
    aFrameIndex: { array: new Float32Array(2), needsUpdate: false }
  };
  app.pointsGeom = {
    getAttribute(name) {
      return attributes[name] || null;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuActivePointCount, 2);
  assert.deepEqual(Array.from(attributes.aGpuMeta.array).filter((_, index) => index % 4 === 0), [1, 1]);

  first.card.previewVisible = false;
  second.card.previewVisible = false;
  app.configurePreviewGpuParticlePath();
  assert.equal(app.previewGpuParticlePathEnabled, false);
  assert.equal(app.previewGpuActivePointCount, 0);

  second.card.previewVisible = true;
  app.configurePreviewGpuParticlePath();
  assert.equal(app.previewGpuParticlePathEnabled, true);
  assert.equal(app.previewGpuActivePointCount, 1);
  assert.deepEqual(Array.from(attributes.aGpuMeta.array).filter((_, index) => index % 4 === 0), [-1, 1]);

  second.card.previewSolo = true;
  first.card.previewVisible = true;
  app.configurePreviewGpuParticlePath();
  assert.equal(app.previewGpuActivePointCount, 1);
  assert.deepEqual(Array.from(attributes.aGpuMeta.array).filter((_, index) => index % 4 === 0), [-1, 1]);
  assert.match(mainSource, /this\.configurePreviewGpuParticlePath\?\.\(\);/);
});

test('GPU preview bypasses frame-cache construction while CPU fallback restores it', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app.state.settings = { previewRenderCacheEnabled: true };
  let clearReason = '';
  let disposeArgs = null;
  app.clearPreviewRenderCache = (reason) => {
    clearReason = reason;
  };
  app.disposePreviewRenderCacheWorkerPool = (reason, options) => {
    disposeArgs = { reason, options };
  };
  app.canUsePreviewGpuParticlePath = () => true;

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.isPreviewGpuParticleModeRequested(), true);
  assert.equal(app.isPreviewRenderCacheEnabled(), false);
  assert.equal(app.makePreviewFrameCacheKey({ totalCount: 1 }), '');
  assert.equal(clearReason, 'gpu-preview');
  assert.deepEqual(disposeArgs, {
    reason: 'gpu-preview',
    options: { disable: false }
  });

  app.canUsePreviewGpuParticlePath = () => false;
  app.state.settings.previewRenderCacheEnabled = false;
  app.configurePreviewGpuParticlePath();
  assert.equal(app.previewGpuParticlePathEnabled, false);
  assert.equal(app.isPreviewGpuParticleModeRequested(), true);
  assert.equal(app.isPreviewRenderCacheEnabled(), true);

  app.previewLeafTextureConfigs[0].useCParticle = false;
  app.configurePreviewGpuParticlePath();
  assert.equal(app.isPreviewGpuParticleModeRequested(), false);
  assert.equal(app.isPreviewRenderCacheEnabled(), false);

  app.previewBasePoints.push(U.v(4, 5, 6));
  app.previewOwners.push(card.id);
  app.previewBirthOffsets.push(0);
  app.previewLeafTextureConfigs = [
    { ...app.previewLeafTextureConfigs[0], useCParticle: true },
    { ...app.previewLeafTextureConfigs[0], useCParticle: false }
  ];
  app.configurePreviewGpuParticlePath();
  assert.equal(app.isPreviewGpuParticleModeRequested(), true);
  assert.equal(app.isPreviewRenderCacheEnabled(), true);
  assert.match(source, /isPreviewGpuParticleModeRequested/);
});

test('CParticle maxAge initialization drives the preview lifetime', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [{ target: 'maxAge', expr: '24' }],
    controllerVars: [],
    controllerActions: []
  });
  const app = createVisualHarness(card);

  const dependency = app.getCardPreviewVisualDependency(card, { visualSource: leaf });
  const visual = app.resolveCardPreviewVisual(card.id, { visualSource: leaf });

  assert.equal(dependency.initPointDependentLifetime, true);
  assert.equal(visual.__particleLifetimeInitialized, true);
  assert.equal(visual.__resolvedLifetime, 24);
});

test('CParticle teleportTo updates preview position and keeps later controller statements running', () => {
  const script = 'teleportTo(5, 6, 7); setAlpha(0.4);';
  const { card, leaf } = createGpuShapeCard({
    particleInit: [],
    controllerVars: [],
    controllerActions: [{ type: 'tick_js', script }]
  });
  const app = createVisualHarness(card);
  const compileKey = app.makePreviewControllerScriptCompileKey(leaf.id, 0);
  assert.equal(app.compilePreviewControllerScript(compileKey, script, { force: true }).ok, true);

  const visual = app.resolveCardPreviewVisual(card.id, {
    position: U.v(1, 2, 3),
    visualSource: leaf
  });

  assert.deepEqual(visual.__resolvedPosition, U.v(5, 6, 7));
  assert.equal(visual.alpha, 0.4);
});

test('manual CParticle alpha transition advances without restarting on repeated play calls', () => {
  const { card } = createGpuShapeCard();
  const app = createVisualHarness(card, {
    projectAlpha: {
      type: 'linear',
      runMode: 'manual',
      min: 0.2,
      max: 0.8,
      tick: 4,
      startMax: false
    }
  });
  const expression = 'playCParticleAlphaTransition(4, CParticleCurve.linear(0.2, 0.8));';
  const compiled = app.compilePreviewDisplayExpression('manual-cparticle-alpha', expression, { force: true });
  assert.equal(compiled.ok, true, compiled.message);
  const action = { type: 'expression', expression, expressionRaw: expression, fn: compiled.fn };
  const runtimeVars = {};

  app.applyExpressionGlobalsOnce([action], 0, 0, runtimeVars, U.v(0, 1, 0));
  assert.equal(app.getCParticleAlphaTransitionPreviewValue(runtimeVars), 0.2);
  assert.equal(app.getProjectAlphaPreviewValue(runtimeVars, app.state.projectAlpha), 1);
  app.applyExpressionGlobalsOnce([action], 2, 2, runtimeVars, U.v(0, 1, 0));
  assert.equal(app.getCParticleAlphaTransitionPreviewValue(runtimeVars), 0.5);
  assert.equal(app.getProjectAlphaPreviewValue(runtimeVars, app.state.projectAlpha), 1);
  app.applyExpressionGlobalsOnce([action], 4, 4, runtimeVars, U.v(0, 1, 0));
  assert.equal(app.getCParticleAlphaTransitionPreviewValue(runtimeVars), 0.8);
  assert.equal(app.getProjectAlphaPreviewValue(runtimeVars, app.state.projectAlpha), 1);
});

test('CParticle randomAgePreTick picks stable random texture frames per integer tick', () => {
  const { card, leaf } = createGpuShapeCard({
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    randomAgePreTick: true
  });
  const app = createVisualHarness(card);
  const pointCount = 12;
  const textureConfig = app.resolvePreviewTextureConfigForShapeLeaf(leaf, card, { enabled: true });
  app.previewVisibleMask = new Array(pointCount).fill(true);
  app.previewOwners = new Array(pointCount).fill(card.id);
  app.previewCardById = new Map([[card.id, card]]);
  app.previewLeafTextureConfigs = new Array(pointCount).fill(textureConfig);
  app.previewFrameCurrentAges = new Float32Array(pointCount).fill(7);
  app.previewFrameLifetimes = new Float32Array(pointCount).fill(20);
  app.previewManualAgeFlags = new Uint8Array(pointCount).fill(1);
  app._mergedAtlasOffsets = new Map([[leaf.effectClass, 0]]);
  app._particleDataFns = {
    calcTextureFrame: (age, lifetime, frames) => Math.min(frames - 1, Math.floor(age / lifetime * frames)),
    getParticleDataByName: () => ({ atlasReady: true, atlas: {}, frames: 8 })
  };

  const tickFour = new Float32Array(pointCount);
  const tickFourSubframe = new Float32Array(pointCount);
  const tickFive = new Float32Array(pointCount);
  app.updatePreviewFrameIndices(4, {}, [], null, pointCount, tickFour);
  app.updatePreviewFrameIndices(4.9, {}, [], null, pointCount, tickFourSubframe);
  app.updatePreviewFrameIndices(5, {}, [], null, pointCount, tickFive);

  assert.equal(textureConfig.randomAgePreTick, true);
  assert.deepEqual(tickFourSubframe, tickFour);
  assert.notDeepEqual(tickFive, tickFour);
  assert.deepEqual(app.previewFrameCurrentAges, new Float32Array(pointCount).fill(7));
});

test('CParticle texture animation keeps the default initial age across Composition ticks', () => {
  const { card, leaf } = createGpuShapeCard({
    effectClass: 'ControlableEndRodEffect',
    useTexture: true
  });
  const app = createVisualHarness(card);
  const pointCount = 3;
  const textureConfig = app.resolvePreviewTextureConfigForShapeLeaf(leaf, card, { enabled: true });
  app.previewVisibleMask = new Array(pointCount).fill(true);
  app.previewOwners = new Array(pointCount).fill(card.id);
  app.previewOwnerLocalIndex = new Uint32Array([0, 1, 2]);
  app.previewCardById = new Map([[card.id, card]]);
  app.previewLeafTextureConfigs = new Array(pointCount).fill(textureConfig);
  app.previewFrameCurrentAges = new Float32Array(pointCount);
  app.previewFrameAutomaticAges = new Float32Array([0, 5, 10]);
  app.previewFrameLifetimes = new Float32Array(pointCount).fill(20);
  app.previewManualAgeFlags = new Uint8Array(pointCount);
  app._mergedAtlasOffsets = new Map([[leaf.effectClass, 0]]);
  app._particleDataFns = {
    calcTextureFrame: (age, lifetime, frames) => Math.min(frames - 1, Math.floor(age / lifetime * frames)),
    getParticleDataByName: () => ({ atlasReady: true, atlas: {}, frames: 4 })
  };

  const frames = new Float32Array(pointCount);
  app.updatePreviewFrameIndices(10, {}, [], null, pointCount, frames);

  assert.deepEqual(frames, new Float32Array([0, 0, 0]));
});

test('Composition preview does not age or remove a CParticle point', () => {
  const { card } = createGpuShapeCard();
  const app = createVisualHarness(card);
  const first = app.resolvePreviewParticleLifecycleState({
    automaticAge: 4,
    initializedAge: 2,
    hasInitializedAge: true,
    lifetime: 20
  });
  const later = app.resolvePreviewParticleLifecycleState({
    automaticAge: 200,
    initializedAge: 2,
    hasInitializedAge: true,
    lifetime: 20
  });

  assert.deepEqual(first, { initialAge: 2, age: 2, lifetime: 20, alive: true });
  assert.deepEqual(later, first);
});

test('explicit CParticle Random.nextInt(maxAge) initializes once and stays fixed in Composition preview', () => {
  const leaf = {
    id: 'random-age-leaf',
    type: 'single',
    particleInit: [{ target: 'age', expr: 'Random.nextInt(maxAge)' }],
    controllerVars: [],
    controllerActions: []
  };
  const card = {
    id: 'shape-card',
    dataType: 'particle_shape',
    useCParticle: true,
    shapeChildren: [leaf]
  };
  const app = createVisualHarness(card);
  const dependency = app.getCardPreviewVisualDependency(card, { visualSource: leaf });
  const originalRandom = Math.random;
  const randomValues = [0.05, 0.25, 0.45, 0.65];
  let randomIndex = 0;

  try {
    Math.random = () => randomValues[randomIndex++];
    const initializedAges = randomValues.map((_, pointIndex) => app.resolveCardPreviewVisual(card.id, {
      pointIndex,
      currentAge: 0,
      lifetime: 20,
      visualSource: leaf
    }).__resolvedCurrentAge);

    Math.random = () => {
      throw new Error('initialized age must not be randomized again');
    };
    const resumedAges = initializedAges.map((currentAge, pointIndex) => app.resolveCardPreviewVisual(card.id, {
      pointIndex,
      currentAge,
      lifetime: 20,
      keepInitializedCurrentAge: true,
      visualSource: leaf
    }).__resolvedCurrentAge);
    const lifecycle = resumedAges.map((initializedAge, pointIndex) => app.resolvePreviewParticleLifecycleState({
      owner: leaf.id,
      pointIndex,
      automaticAge: 8,
      initializedAge,
      hasInitializedAge: true,
      lifetime: 20
    }));

    assert.equal(dependency.initPointDependentCurrentAge, true);
    assert.deepEqual(initializedAges, [1, 5, 9, 13]);
    assert.deepEqual(resumedAges, initializedAges);
    assert.deepEqual(lifecycle.map((state) => state.age), initializedAges);
    assert.deepEqual(lifecycle.map((state) => state.alive), [true, true, true, true]);
  } finally {
    Math.random = originalRandom;
  }
});
