import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createExpressionRuntime } from '../public/legacy/assets/composition_builder/js/expression_runtime.js';
import { computeAngleAnimatorAngle } from '../public/legacy/assets/composition_builder/js/preview_angle_animator.js';

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
  'computeAngleAnimatorAngle',
  `${executableSource}\nreturn installPreviewRuntimeMethods;`
)(computeAngleAnimatorAngle);

class PreviewHarness {}

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const int = (value) => Math.trunc(num(value));
const clamp = (value, min, max) => Math.min(Math.max(num(value), num(min)), num(max));
const srgbToLinear01 = (value) => {
  const c = clamp(value, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const srgbRgbToLinearArray = (value) => {
  const source = Array.isArray(value) ? value : [1, 1, 1];
  return source.map(srgbToLinear01);
};
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
  rotateAroundAxis(value, axis, angle) {
    const unit = this.norm(axis);
    const c = Math.cos(num(angle));
    const s = Math.sin(num(angle));
    const dot = num(value?.x) * unit.x + num(value?.y) * unit.y + num(value?.z) * unit.z;
    return this.v(
      num(value?.x) * c + (unit.y * num(value?.z) - unit.z * num(value?.y)) * s + unit.x * dot * (1 - c),
      num(value?.y) * c + (unit.z * num(value?.x) - unit.x * num(value?.z)) * s + unit.y * dot * (1 - c),
      num(value?.z) * c + (unit.x * num(value?.y) - unit.y * num(value?.x)) * s + unit.z * dot * (1 - c)
    );
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
  transpileKotlinThisQualifierToJs: (value) => String(value || '').replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, 'thisAt.'),
  rotatePointsToPointUpright: (value) => value,
  srgbRgbToLinearArray,
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
  app.previewCondFnCache = new Map();
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
    attributes,
    getAttribute(name) {
      return attributes[name] || null;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    computeBoundingSphere() {}
  };
  app.previewBasePoints = [U.v(1, 2, 3)];
  app.previewOwners = [card.id];
  app.previewBirthOffsets = [0];
  app.previewOwnerLocalIndex = [0];
  app.previewOwnerPointCount = [1];
  app.previewAnchorBase = [U.v(1, 2, 3)];
  app.previewLocalBase = [U.v(0, 0, 0)];
  app.previewAnchorRef = [0];
  app.previewLocalRef = [0];
  app.previewRootOffsetIndex = [0];
  app.previewLeafTextureConfigs = [{
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    randomAgePreTick: true,
    useCParticle: true
  }];
  app.previewLeafVisualSources = [leaf];
  app.previewCardById = new Map([[card.id, card]]);
  app.dom = { statusPoints: { textContent: '' } };
  app.updateSelectionStatus = () => {};
  return { app, attributes };
}

function createSequencedRebuildHarness() {
  const app = new PreviewHarness();
  const gpuTexture = {
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    randomAgePreTick: false,
    useCParticle: true
  };
  app.state = {
    compositionType: 'sequenced',
    cards: [
      { id: 'flat-card', dataType: 'single', bindMode: 'builder', builderState: { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }, particleBackend: 'cparticle' },
      { id: 'shape-card', dataType: 'particle_shape', bindMode: 'builder', builderState: { points: [{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }] }, useCParticle: true }
    ]
  };
  app.previewExprCountCache = new Map();
  app.previewExprPrefixCache = new Map();
  app.previewCondFnCache = new Map();
  app.previewNumericFnCache = new Map();
  app.previewControllerFnCache = new Map();
  app.previewVisualRuntimePlanCache = new Map();
  app.previewFoldSimpleActionCache = new Map();
  app.clearPreviewRenderCache = () => {};
  app.compilePreviewScriptsFromState = () => {};
  app.evaluateBuilderPoints = (builderState) => ({ points: builderState.points });
  app.resolvePreviewTextureConfigForCard = () => gpuTexture;
  app.resolvePreviewVisualSource = (card) => card;
  app.buildShapeLocalTuplesForPreview = () => [{
    sum: U.v(0, 0, 0),
    levels: [],
    textureCfg: gpuTexture,
    visualSource: null
  }];
  app.updatePreviewGeometry = () => {};
  return app;
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

test('GPU initial visual resolves global Vector3f color through thisAt', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [{ target: 'color', expr: 'thisAt.color' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.globalVars = [{
    name: 'color',
    type: 'Vector3f',
    value: 'Vector3f(0.643137f, 0.796078f, 0.996078f)'
  }];
  app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  const color = Array.from(attributes.color.array);
  assert.ok(color[2] > color[1] && color[1] > color[0], JSON.stringify(color));
});

test('GPU initial visual resolves the project-qualified global Vector3f color', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [{
      target: 'color',
      expr: 'this@NetherStarLaserComposition.color'
    }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.globalVars = [{
    name: 'color',
    type: 'Vector3f',
    value: 'Vector3f(0.658824f, 0.933333f, 1f)'
  }];
  app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  const color = Array.from(attributes.color.array);
  assert.ok(color[2] > color[1] && color[1] > color[0], JSON.stringify(color));
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

  leaf.controllerVars = [{ name: 'phase', type: 'Double', initial: '0.0' }];
  assert.equal(app.canUsePreviewGpuParticlePath(), true);

  leaf.controllerActions = [{ type: 'tick_js', script: 'setAlpha(0.5)' }];
  app.previewVisualRuntimePlanCache.clear();
  app.previewCardVisualAgeDependentCache.clear();
  assert.equal(app.canUsePreviewGpuParticlePath(), false);
  assert.match(app.previewGpuParticleFallbackReason, /存在每帧控制器/);

  leaf.controllerActions = [];
  leaf.controllerVars = [];
  app.previewVisualRuntimePlanCache.clear();
  app.previewCardVisualAgeDependentCache.clear();
  app.previewBirthOffsets[0] = 1;
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.pointsGeom.getAttribute('aGpuMeta').array[1], 1);

  app.previewBirthOffsets[0] = 0;
  app.previewLeafTextureConfigs[0].useCParticle = false;
  assert.equal(app.canUsePreviewGpuParticlePath(), false);
});

test('GPU sequenced shape without local growth keeps every particle hidden', () => {
  const { card, leaf } = createGpuShapeCard({}, { dataType: 'sequenced_shape' });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(attributes.aGpuMeta.array[0], -1);
  assert.equal(app.previewGpuActivePointCount, 0);
});

test('global Sequenced growth unlocks a root sequenced shape without a second local list', () => {
  const { card, leaf } = createGpuShapeCard({}, { dataType: 'sequenced_shape' });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.compositionAnimates = [{ count: 1, condition: 'true' }];
  app.state.globalVars = [{ name: 'age', type: 'Int', value: '1' }];
  app.state.displayActions = [{ type: 'expression', expression: 'age++' }];
  app.previewRootVirtualIndex = [0];
  app.previewRootVirtualTotal = 1;
  app.previewRuntimeGlobals = app.buildPreviewRuntimeGlobals(0, 0, 0);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(attributes.aGpuMeta.array[0], 1);
  assert.equal(attributes.aGpuMeta.array[1], 0);
  assert.equal(app.previewGpuActivePointCount, 1);
});

test('GPU sequenced shape encodes local growth unlock ticks', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    dataType: 'sequenced_shape',
    growthAnimates: [
      { count: 1, condition: 'true' },
      { count: 1, condition: 'age >= 2' }
    ]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(2, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewOwnerLocalIndex = [0, 1];
  app.previewOwnerPointCount = [2, 2];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(2, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 1];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(
    [attributes.aGpuMeta.array[1], attributes.aGpuMeta.array[5]],
    [0, 2]
  );
  assert.equal(app.previewGpuActivePointCount, 1);
  app.previewAnimStart = 0;
  app.updatePreviewGpuParticleAnimation(100);
  assert.equal(app.previewGpuActivePointCount, 2);
});

test('GPU nested sequenced Composition encodes its local growth unlock ticks', () => {
  const { card, leaf } = createGpuShapeCard();
  card.shapeChildren = [{
    id: 'nested-sequenced',
    type: 'sequenced_shape',
    controllerVars: [],
    controllerActions: [],
    displayActions: [],
    growthAnimates: [
      { count: 1, condition: 'true' },
      { count: 1, condition: 'age >= 3' }
    ],
    children: [leaf]
  }];
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(2, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewOwnerLocalIndex = [0, 1];
  app.previewOwnerPointCount = [2, 2];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(2, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 1];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(
    [attributes.aGpuMeta.array[1], attributes.aGpuMeta.array[5]],
    [0, 3]
  );
  assert.equal(app.previewGpuActivePointCount, 1);
  app.previewAnimStart = 0;
  app.updatePreviewGpuParticleAnimation(150);
  assert.equal(app.previewGpuActivePointCount, 2);
});

test('GPU local Sequenced growth replays global expression variables per tick', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    dataType: 'sequenced_shape',
    growthAnimates: [{ count: 2, condition: 'step >= 2' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.globalVars = [{ name: 'step', type: 'Int', value: '0' }];
  app.state.displayActions = [{ type: 'expression', expression: 'step++' }];
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(2, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewOwnerLocalIndex = [0, 1];
  app.previewOwnerPointCount = [2, 2];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(2, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 1];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];
  app.compilePreviewScriptsFromState({ force: true });

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(
    [attributes.aGpuMeta.array[1], attributes.aGpuMeta.array[5]],
    [1, 1]
  );
});

test('CParticle lifecycle curves sample on CPU and encode on the GPU preview path', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [
      { target: 'currentAge', expr: '50' },
      { target: 'maxAge', expr: '100' },
      { target: 'alphaCurve', expr: 'CParticleCurve.linear(0f, 1f)' },
      { target: 'scaleCurve', expr: 'CParticleCurve.linear(1f, 3f)' },
      {
        target: 'colorCurve',
        expr: 'CParticleColorCurve.linear(Vector3f(1f, 0f, 0f), Vector3f(0f, 0f, 1f))'
      }
    ]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  const cpuVisual = app.resolveCardPreviewVisual(card.id, { visualSource: leaf });

  assert.ok(Math.abs(cpuVisual.alpha - 0.5) < 1e-6);
  assert.ok(Math.abs(cpuVisual.size - 0.4) < 1e-6);
  assert.deepEqual(cpuVisual.color.map((value) => Math.round(value * 1000) / 1000), [0.5, 0, 0.5]);

  app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(Array.from(attributes.aGpuAlphaCurve.array.slice(0, 4)), [0, 1, -1, -2]);
  assert.deepEqual(Array.from(attributes.aGpuScaleCurve.array.slice(0, 4)), [1, 3, -1, -2]);
  const decodePackedColor = (packed) => {
    const value = Math.floor(Math.max(0, Math.min(1, packed)) * 16777215 + 0.5);
    const red = Math.floor(value / 65536);
    const green = Math.floor((value - red * 65536) / 256);
    const blue = value - red * 65536 - green * 256;
    return [red, green, blue].map((channel) => channel / 255);
  };
  assert.deepEqual(decodePackedColor(attributes.aGpuColorCurve.array[0]), [1, 0, 0]);
  assert.deepEqual(decodePackedColor(attributes.aGpuColorCurve.array[1]), [0, 0, 1]);
  assert.match(mainSource, /sampleGpuScalarCurve\(aGpuAlphaCurve, lifecycleProgress\)/);
  assert.match(mainSource, /gpuCurvedColor = srgbToLinearGpu\(linearToSrgbGpu\(gpuBaseColor\) \* gpuColorCurve\)/);
  assert.match(mainSource, /lifecycleAge = clamp\(aGpuLifecycle\.x \+ previewAge, 0\.0, lifecycleLifetime\);/);
  assert.match(mainSource, /textureProgress = clamp\(lifecycleAge \/ lifecycleLifetime, 0\.0, 1\.0\);/);
  assert.match(mainSource, /vGpuColorScale = gpuCurvedColor \/ max\(gpuBaseColor, vec3\(0\.000001\)\)/);
  assert.match(mainSource, /uniform int uGpuPreviewHasColorCurve;/);
  assert.match(mainSource, /if \(uGpuPreviewHasColorCurve == 1\)/);
  assert.ok(Math.abs(srgbToLinear01(0.5) - 0.21404114048223255) < 1e-12);
});

test('GPU preview keeps an unconfigured CParticle lifecycle static', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app._particleDataFns = {
    getParticleDataByName: () => ({ atlasReady: true, atlas: {}, textureLoadOk: true, frames: 4 })
  };
  app._mergedAtlasOffsets = new Map([['ControlableEndRodEffect', 0]]);
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 },
      uGpuPreviewGlobalAlpha: { value: 1 },
      uGpuPreviewHasLifecycle: { value: 1 },
      uGpuPreviewHasColorCurve: { value: 0 }
    }
  };

  app.previewGpuInitialLifecycle = new Float32Array([0, 100]);
  app.previewGpuAlphaCurves = [null];
  app.previewGpuScaleCurves = [null];
  app.previewGpuColorCurves = [null];
  app.previewGpuHasLifecycleData = false;
  assert.equal(app.previewGpuHasLifecycleData, false);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewHasLifecycle.value, 0);
  assert.match(mainSource, /if \(aGpuLifecycle\.y > 0\.0 && uGpuPreviewHasLifecycle == 1\)/);
  assert.match(mainSource, /float textureProgress = clamp\(lifecycleAge \/ lifecycleLifetime, 0\.0, 1\.0\);/);
});

test('CParticle color curves keep non-unit RGB channels on CPU and GPU', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [{
      target: 'colorCurve',
      expr: 'CParticleColorCurve.linear(Vector3f(0.2f, 0.4f, 0.6f), Vector3f(0.6f, 0.8f, 1f))'
    }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  const visual = app.resolveCardPreviewVisual(card.id, { visualSource: leaf });
  assert.deepEqual(
    [visual.__colorCurve.from.x, visual.__colorCurve.from.y, visual.__colorCurve.from.z],
    [0.2, 0.4, 0.6]
  );
  assert.deepEqual(
    [visual.__colorCurve.to.x, visual.__colorCurve.to.y, visual.__colorCurve.to.z],
    [0.6, 0.8, 1]
  );

  app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  const decodePackedColor = (packed) => {
    const value = Math.floor(Math.max(0, Math.min(1, packed)) * 16777215 + 0.5);
    const red = Math.floor(value / 65536);
    const green = Math.floor((value - red * 65536) / 256);
    const blue = value - red * 65536 - green * 256;
    return [red, green, blue].map((channel) => channel / 255);
  };
  const from = decodePackedColor(attributes.aGpuColorCurve.array[0]);
  const to = decodePackedColor(attributes.aGpuColorCurve.array[1]);
  assert.ok(Math.abs(from[0] - 0.2) < 1 / 255);
  assert.ok(Math.abs(from[1] - 0.4) < 1 / 255);
  assert.ok(Math.abs(from[2] - 0.6) < 1 / 255);
  assert.ok(Math.abs(to[0] - 0.6) < 1 / 255);
  assert.ok(Math.abs(to[1] - 0.8) < 1 / 255);
  assert.ok(Math.abs(to[2] - 1) < 1 / 255);
});

test('delayed GPU card transforms start from their own birth tick', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeScale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' },
    shapeDisplayActions: [{ type: 'rotateAsAxis', angleMode: 'expr', angleExpr: 'PI / 32' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 5];
  app.previewOwnerLocalIndex = [0, 0];
  app.previewOwnerPointCount = [1, 1];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 0];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuTransformGroups.length, 2);
  app.updatePreviewGpuParticleTransforms(5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.ok(Math.abs(app.previewGpuTransformGroups[0].scale - 1.25) < 1e-6);
  assert.ok(Math.abs(app.previewGpuTransformGroups[1].scale - 0.5) < 1e-6);
  assert.ok(Math.abs(app.previewGpuTransformGroups[0].transform.w - 5 * Math.PI / 32) < 1e-6);
  assert.ok(Math.abs(app.previewGpuTransformGroups[1].transform.w) < 1e-6);

  app.updatePreviewGpuParticleTransforms(19, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  app.updatePreviewGpuParticleTransforms(5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  assert.ok(Math.abs(app.previewGpuTransformGroups[1].scale - 0.5) < 1e-6);
  assert.ok(Math.abs(app.previewGpuTransformGroups[1].transform.w) < 1e-6);
});

test('delayed GPU angle-offset starts from zero after the point becomes visible', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    angleOffsetEnabled: true,
    angleOffsetCount: 2,
    angleOffsetGlowTick: 1,
    angleOffsetAngleMode: 'numeric',
    angleOffsetAngleValue: Math.PI * 2,
    angleOffsetAngleUnit: 'rad'
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 5];
  app.previewOwnerLocalIndex = [0, 0];
  app.previewOwnerPointCount = [1, 1];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 0];
  app.previewRootOffsetIndex = [1, 1];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuTransformGroups.length, 2);
  app.updatePreviewGpuParticleTransforms(5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.ok(Math.abs(app.previewGpuTransformGroups[0].transform.w - Math.PI) < 1e-6);
  assert.ok(Math.abs(app.previewGpuTransformGroups[1].transform.w) < 1e-6);
});

test('GPU preview supports global SequencedParticleComposition ordering', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.compositionAnimates = [
    { count: 1, condition: 'true' },
    { count: 2, condition: 'age >= 2' }
  ];
  app.previewRootVirtualIndex = [2];
  app.previewRootVirtualTotal = 3;

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(attributes.aGpuMeta.array[1], 2);
  app.previewAnimStart = 0;
  app.updatePreviewGpuParticleAnimation(50);
  assert.equal(app.previewGpuActivePointCount, 0);
  assert.equal(app.previewInteractionVisibleMask[0], false);
  app.updatePreviewGpuParticleAnimation(100);
  assert.equal(app.previewGpuActivePointCount, 1);
  assert.equal(app.previewInteractionVisibleMask[0], true);
  assert.match(mainSource, /previewCycleAge = mod\(uGpuPreviewTick/);
  assert.match(mainSource, /previewBirthTick = max\(aGpuMeta\.y, 0\.0\)/);
  assert.match(mainSource, /previewCycleAge < previewBirthTick/);
});

test('Sequenced GPU root condition uses replayed global age instead of becoming visible during build', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.globalVars = [{ name: 'age', type: 'Int', value: '1' }];
  app.state.displayActions = [{ type: 'expression', expression: 'age++' }];
  app.state.compositionAnimates = [{ count: 1, condition: 'age > 30' }];
  app.previewRootVirtualIndex = [0];
  app.previewRootVirtualTotal = 1;
  app.previewCondFnCache = new Map();
  app.previewExprFnCache = new Map();
  app.previewExprCountCache = new Map();
  app.previewExprPrefixCache = new Map();
  app.compilePreviewScriptsFromState({ force: true });

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(attributes.aGpuMeta.array[0], 1);
  assert.equal(attributes.aGpuMeta.array[1], 31);
  assert.equal(app.previewGpuActivePointCount, 0);
  assert.match(
    mainSource,
    /applyAnimateField\(item, t\.dataset\.compAnimateField, t\);\s*(?:\/\/[^\n]*\n\s*)?this\.afterValueMutate\(\{ rebuildPreview: true \}\);/
  );
  assert.match(
    mainSource,
    /case "add-comp-animate"[\s\S]*?case "remove-comp-animate"[\s\S]*?const rebuildPreview = act === "add-comp-animate" \|\| act === "remove-comp-animate";/
  );
  assert.match(
    mainSource,
    /if \(t\.dataset\.pf === "compositionType"\) \{[\s\S]*?this\.afterValueMutate\(\{ rebuildPreview: true, rerenderProject: true \}\);/
  );
});

test('Composition display expressions stay on GPU including point-indexed transforms', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.displayActions = [{
    type: 'expression',
    expression: 'age++; if (age > 50) { scaleHelper.doScale(); } rotateAsAxis(PI / 64)'
  }];
  app.state.projectScale = {
    type: 'linear',
    min: 1,
    max: 2,
    tick: 10,
    runMode: 'manual'
  };
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 },
      uGpuPreviewGlobalAlpha: { value: 0 },
      uGpuPreviewGlobalTransform: { value: app.createPreviewGpuMatrix4() }
    }
  };
  app.previewAnimStart = 0;
  app.compilePreviewScriptsFromState({ force: true });

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuParticleFallbackReason, '');
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleAnimation(2550);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewEnabled.value, 1);
  const scaleAtTick = app._pointsShaderRef.uniforms.uGpuPreviewGlobalTransform.value.elements[5];
  assert.ok(scaleAtTick > 1);
  app.updatePreviewGpuParticleAnimation(2575);
  const scaleAtHalfTick = app._pointsShaderRef.uniforms.uGpuPreviewGlobalTransform.value.elements[5];
  assert.ok(scaleAtHalfTick > scaleAtTick + 0.03);
  assert.equal(attributes.aGpuMeta.array[0], 1);

  app.state.displayActions = [{
    type: 'expression',
    expression: 'if (index > 0) rotateAsAxis(PI / 64)'
  }];
  app.compilePreviewScriptsFromState({ force: true });
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuParticleFallbackReason, '');
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuPerPointTransformEnabled, true);
  assert.ok(attributes.aGpuFadeOut.array[3] < 0);
});

test('GPU preview accepts Composition root expressions that use global vectors', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeDisplayActions: [{
      type: 'expression',
      expression: 'rotateToWithAngle(direction, PI / 64)'
    }]
  });
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app.state.globalVars = [
    { name: 'direction', type: 'RelativeLocation', value: 'RelativeLocation(0, 1, 0)' }
  ];
  app.compilePreviewScriptsFromState({ force: true });
  assert.ok(app.resolvePreviewGpuRootRotation(card));
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
});

test('Sequenced GPU preview without growth animation keeps every card hidden', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.previewRootVirtualIndex = [75];
  app.previewRootVirtualTotal = 76;

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(attributes.aGpuMeta.array[0], -1);
  assert.equal(attributes.aGpuMeta.array[1], 0);
  assert.equal(app.previewGpuActivePointCount, 0);
  app.previewAnimStart = 0;
  app.updatePreviewGpuParticleAnimation(5000);
  assert.equal(app.previewGpuActivePointCount, 0);
  assert.equal(app.previewInteractionVisibleMask[0], false);
});

test('hidden Sequenced GPU preview does not update dynamic card transforms', () => {
  const pointCount = 71936;
  const { card, leaf } = createGpuShapeCard({}, {
    shapeScale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' }
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  attributes.aFrameIndex.array = new Float32Array(pointCount);
  app.previewBasePoints = new Array(pointCount).fill(U.v(1, 2, 3));
  app.previewOwners = new Array(pointCount).fill(card.id);
  app.previewBirthOffsets = new Array(pointCount).fill(0);
  app.previewOwnerLocalIndex = Array.from({ length: pointCount }, (_, index) => index);
  app.previewOwnerPointCount = new Array(pointCount).fill(pointCount);
  app.previewAnchorBase = Array.from({ length: pointCount }, (_, index) => U.v(index, 2, 3));
  app.previewLocalBase = new Array(pointCount).fill(U.v(0, 0, 0));
  app.previewAnchorRef = Array.from({ length: pointCount }, (_, index) => index);
  app.previewLocalRef = new Array(pointCount).fill(0);
  app.previewRootOffsetIndex = new Array(pointCount).fill(0);
  app.previewLeafTextureConfigs = new Array(pointCount).fill(app.previewLeafTextureConfigs[0]);
  app.previewLeafVisualSources = new Array(pointCount).fill(leaf);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuConfiguredPointCount, 0);
  assert.equal(app.previewGpuActivePointCount, 0);
  attributes.aGpuTransform.needsUpdate = false;
  attributes.aGpuScale.needsUpdate = false;
  app.previewAnimStart = 0;

  app.updatePreviewGpuParticleAnimation(250);

  assert.equal(attributes.aGpuTransform.needsUpdate, false);
  assert.equal(attributes.aGpuScale.needsUpdate, false);
  assert.equal(app.previewGpuActivePointCount, 0);
});

test('large single-group GPU preview animates card scale through shared uniforms', () => {
  const pointCount = 71936;
  const { card, leaf } = createGpuShapeCard({}, {
    shapeScale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' }
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 },
      uGpuPreviewGlobalAlpha: { value: 1 },
      uGpuPreviewUseSharedTransform: { value: 0 },
      uGpuPreviewSharedTransform: { value: { x: 0, y: 0, z: 0, w: 0 } },
      uGpuPreviewSharedScale: { value: 1 },
      uGpuPreviewGlobalTransform: { value: app.createPreviewGpuMatrix4() }
    }
  };
  attributes.aFrameIndex.array = new Float32Array(pointCount);
  app.previewBasePoints = new Array(pointCount).fill(U.v(1, 2, 3));
  app.previewOwners = new Array(pointCount).fill(card.id);
  app.previewBirthOffsets = new Array(pointCount).fill(0);
  app.previewOwnerLocalIndex = Array.from({ length: pointCount }, (_, index) => index);
  app.previewOwnerPointCount = new Array(pointCount).fill(pointCount);
  app.previewAnchorBase = Array.from({ length: pointCount }, (_, index) => U.v(index, 2, 3));
  app.previewLocalBase = new Array(pointCount).fill(U.v(0, 0, 0));
  app.previewAnchorRef = Array.from({ length: pointCount }, (_, index) => index);
  app.previewLocalRef = new Array(pointCount).fill(0);
  app.previewRootOffsetIndex = new Array(pointCount).fill(0);
  app.previewLeafTextureConfigs = new Array(pointCount).fill(app.previewLeafTextureConfigs[0]);
  app.previewLeafVisualSources = new Array(pointCount).fill(leaf);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuTransformsDynamic, true);
  assert.equal(app.previewGpuSharedTransformEnabled, true);
  assert.equal(app.previewGpuVisibilityDynamic, false);
  assert.deepEqual(app.previewGpuAttributeUsage, {
    transform: false,
    transformVector: true,
    scale: false,
    lifecycle: false,
    alphaCurve: false,
    scaleCurve: false,
    colorCurve: false
  });
  attributes.aGpuTransform.needsUpdate = false;
  attributes.aGpuScale.needsUpdate = false;
  const visibleMask = app.previewVisibleMask;
  const interactionMask = app.previewInteractionVisibleMask;
  app.previewAnimStart = 0;

  app.updatePreviewGpuParticleAnimation(250);
  const firstScale = app.previewGpuSharedScale;
  app.updatePreviewGpuParticleAnimation(300);

  assert.equal(attributes.aGpuTransform.needsUpdate, false);
  assert.equal(attributes.aGpuScale.needsUpdate, false);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewUseSharedTransform.value, 1);
  assert.ok(Math.abs(firstScale - 1.25) < 1e-6);
  assert.ok(app.previewGpuSharedScale > firstScale);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewSharedScale.value, app.previewGpuSharedScale);
  assert.equal(app.previewVisibleMask, visibleMask);
  assert.equal(app.previewInteractionVisibleMask, interactionMask);
  assert.equal(app.previewGpuActivePointCount, pointCount);
});

test('large Sequenced GPU visibility updates use sorted unlock ticks without scanning particle metadata', () => {
  const pointCount = 71936;
  const { card, leaf } = createGpuShapeCard({}, {
    dataType: 'sequenced_shape',
    growthAnimates: [{ count: pointCount, condition: 'age >= 5' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(pointCount);
  app.previewBasePoints = new Array(pointCount).fill(U.v(1, 2, 3));
  app.previewOwners = new Array(pointCount).fill(card.id);
  app.previewBirthOffsets = new Array(pointCount).fill(0);
  app.previewOwnerLocalIndex = Array.from({ length: pointCount }, (_, index) => index);
  app.previewOwnerPointCount = new Array(pointCount).fill(pointCount);
  app.previewAnchorBase = new Array(pointCount).fill(U.v(1, 2, 3));
  app.previewLocalBase = new Array(pointCount).fill(U.v(0, 0, 0));
  app.previewAnchorRef = new Array(pointCount).fill(0);
  app.previewLocalRef = new Array(pointCount).fill(0);
  app.previewRootOffsetIndex = new Array(pointCount).fill(0);
  app.previewLeafTextureConfigs = new Array(pointCount).fill(app.previewLeafTextureConfigs[0]);
  app.previewLeafVisualSources = new Array(pointCount).fill(leaf);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuUnlockTicks.length, pointCount);
  const originalMeta = attributes.aGpuMeta.array;
  let metadataReads = 0;
  attributes.aGpuMeta.array = new Proxy(originalMeta, {
    get(target, property) {
      if (typeof property === 'string' && /^\d+$/.test(property)) metadataReads += 1;
      return Reflect.get(target, property, target);
    }
  });

  app.updatePreviewGpuParticleVisibility(5, { force: true });

  assert.equal(metadataReads, 0);
  assert.equal(app.previewGpuActivePointCount, pointCount);
  assert.equal(app.previewInteractionVisibleMask[0], true);
  assert.equal(metadataReads, 2);
});

test('Sequenced GPU root animate with age expression emits the first card immediately', () => {
  const { card, leaf } = createGpuShapeCard({}, { dataType: 'particle_shape' });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.compositionAnimates = [{ count: 1, condition: 'true' }];
  app.state.globalVars = [{ name: 'age', type: 'Int', value: '1' }];
  app.state.displayActions = [{ type: 'expression', expression: 'age++' }];
  app.previewRootVirtualIndex = [0];
  app.previewRootVirtualTotal = 1;
  app.previewRuntimeGlobals = app.buildPreviewRuntimeGlobals(0, 0, 0);

  assert.equal(app.buildSequencedRootGrowthPlan(
    app.buildPreviewRuntimeActions(0, app.state.displayActions, { scope: 'display' }),
    1,
    69,
    0,
    { runtimeVars: app.previewRuntimeGlobals, axis: app.resolveCompositionAxisDirection() }
  ).unlockTickByIndex[0], 0);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuConfiguredPointCount, 1);
  assert.equal(app.previewGpuActivePointCount, 1);
  assert.equal(attributes.aGpuMeta.array[0], 1);
  assert.equal(attributes.aGpuMeta.array[1], 0);
});

test('Sequenced GPU single root with global CParticle mode emits immediately', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    dataType: 'single',
    particleBackend: 'cparticle',
    useCParticle: false,
    bindMode: 'builder'
  });
  delete card.shapeChildren;
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.useCParticle = true;
  app.state.compositionAnimates = [{ count: 1, condition: 'true' }];
  app.state.globalVars = [{ name: 'age', type: 'Int', value: '1' }];
  app.state.displayActions = [{ type: 'expression', expression: 'age++' }];
  app.previewRootVirtualIndex = [0];
  app.previewRootVirtualTotal = 1;
  app.previewRuntimeGlobals = app.buildPreviewRuntimeGlobals(0, 0, 0);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuConfiguredPointCount, 1);
  assert.equal(app.previewGpuActivePointCount, 1);
  assert.equal(attributes.aGpuMeta.array[0], 1);
  assert.equal(attributes.aGpuMeta.array[1], 0);
});

test('Sequenced GPU builder points keep root sequencing data for the first generated point', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    dataType: 'single',
    particleBackend: 'cparticle',
    bindMode: 'builder'
  });
  delete card.shapeChildren;
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.compositionAnimates = [{ count: 1, condition: 'true' }];
  app.state.globalVars = [{ name: 'age', type: 'Int', value: '1' }];
  app.state.displayActions = [{ type: 'expression', expression: 'age++' }];
  app.previewBasePoints = [U.v(1, 2, 3), U.v(2, 2, 3), U.v(3, 2, 3)];
  app.previewOwners = [card.id, card.id, card.id];
  app.previewBirthOffsets = [0, 0, 0];
  app.previewOwnerLocalIndex = [0, 1, 2];
  app.previewOwnerPointCount = [3, 3, 3];
  app.previewAnchorBase = app.previewBasePoints.slice();
  app.previewLocalBase = [U.v(0, 0, 0), U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewAnchorRef = [0, 1, 2];
  app.previewLocalRef = [0, 0, 0];
  app.previewRootOffsetIndex = [0, 0, 0];
  app.previewRootVirtualIndex = [0, 1, 2];
  app.previewRootVirtualTotal = 3;
  app.previewRuntimeGlobals = app.buildPreviewRuntimeGlobals(0, 0, 0);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuConfiguredPointCount, 3);
  assert.equal(app.previewGpuActivePointCount, 1);
  assert.deepEqual(Array.from(attributes.aGpuMeta.array), [1, 0, 0, 0, 1, 71, 0, 0, 1, 71, 0, 0]);
});

test('Sequenced preview assigns root order per generated CompositionData', () => {
  const app = createSequencedRebuildHarness();
  app.rebuildPreview();

  assert.deepEqual(app.previewRootVirtualIndex, [0, 1, 2, 3]);
  assert.equal(app.previewRootVirtualTotal, 4);
});

test('Sequenced preview keeps root angle-offset order aligned with generated repeats', () => {
  const app = createSequencedRebuildHarness();
  Object.assign(app.state.cards[1], { angleOffsetEnabled: true, angleOffsetCount: 2 });
  app.rebuildPreview();

  assert.deepEqual(app.previewRootVirtualIndex, [0, 1, 2, 4, 3, 5]);
  assert.equal(app.previewRootVirtualTotal, 6);
});

test('preview rebuild requests coalesce and freeze lifecycle timing while queued', async () => {
  const app = new PreviewHarness();
  let builds = 0;
  app.buildPreviewNow = () => { builds += 1; };
  app.previewAnimStart = 123;
  const previousWindow = globalThis.window;
  try {
    globalThis.window = {};
    app.rebuildPreview();
    app.rebuildPreview();
    assert.equal(app.previewBuildInProgress, true);
    app.updatePreviewAnimation();
    assert.equal(app.previewAnimStart, 123);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(builds, 1);
    assert.equal(app.previewBuildInProgress, false);
    assert.notEqual(app.previewAnimStart, 123);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('clearing preview cache terminates in-flight worker tasks', () => {
  const app = createHarness(1);
  let terminated = 0;
  app.previewRenderCacheWorkerPool = {
    workers: [{ terminate: () => { terminated += 1; } }],
    queue: [{ id: 'queued' }],
    pending: new Map([['active', {}]]),
    buildKeys: new Set(['active']),
    active: 1
  };

  app.clearPreviewRenderCacheWorkerQueue('test-clear');

  assert.equal(terminated, 1);
  assert.equal(app.previewRenderCacheWorkerPool, null);
});

test('Sequenced GPU preview encodes global animate unlock ticks', () => {
  const { card, leaf } = createGpuShapeCard();
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.state.compositionType = 'sequenced';
  app.state.compositionAnimates = [{ count: 1, condition: 'age >= 2' }];
  app.previewCondFnCache = new Map();
  app.previewRootVirtualIndex = [0];
  app.previewRootVirtualTotal = 1;

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(attributes.aGpuMeta.array[1], 2);
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
    [0, 0.01, 0, 0.01]
  );
  assert.deepEqual(Array.from(attributes.aGpuLifecycle.array), [15, 20, 16, 21, 15, 20, 16, 21]);
  assert.match(mainSource, /attribute vec2 aGpuLifecycle;/);
  assert.match(mainSource, /aGpuLifecycle\.x \+ previewAge/);
});

test('GPU lifecycle advancement is isolated per particle', () => {
  const first = createGpuShapeCard({}, { id: 'static-gpu-card' });
  const second = createGpuShapeCard({
    particleInit: [
      { target: 'maxAge', expr: '40' },
      { target: 'age', expr: '7' }
    ]
  }, { id: 'aged-gpu-card' });
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
  app.previewBasePoints = [U.v(), U.v()];
  app.previewOwners = [first.card.id, second.card.id];
  app.previewOwnerLocalIndex = [0, 0];
  app.previewOwnerPointCount = [1, 1];
  app.previewBirthOffsets = [0, 0];
  app.previewLeafTextureConfigs = [first.leaf, second.leaf].map(() => ({
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    randomAgePreTick: false,
    useCParticle: true
  }));
  app.previewLeafVisualSources = [first.leaf, second.leaf];
  app.previewCardById = new Map([
    [first.card.id, first.card],
    [second.card.id, second.card]
  ]);
  app.dom = { statusPoints: { textContent: '' } };
  app.updateSelectionStatus = () => {};

  app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  assert.equal(app.previewGpuHasLifecycleData, true);
  assert.deepEqual(Array.from(app.previewGpuLifecycleFlags), [0, 1]);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(Array.from(attributes.aGpuLifecycle.array), [0, -100, 7, 40]);
  assert.match(mainSource, /aGpuLifecycle\.y > 0\.0 && uGpuPreviewHasLifecycle == 1/);
  assert.match(mainSource, /float textureProgress = clamp\(lifecycleAge \/ lifecycleLifetime, 0\.0, 1\.0\);/);
});

test('static single-group rotateAsAxis stays on the GPU path through a shared transform', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeDisplayActions: [{ type: 'rotateAsAxis', angleMode: 'expr', angleExpr: 'PI / 32' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewBasePoints = [U.v(11, 2, 3)];
  app.previewAnchorBase = [U.v(1, 2, 3)];
  app.previewLocalBase = [U.v(10, 0, 0)];
  app.previewLevelBases = [[U.v(1, 0, 0), U.v(9, 0, 0)]];

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  const rotation = app.resolvePreviewGpuRootRotation(card);
  assert.ok(rotation);
  assert.ok(Math.abs(rotation.anglePerTick - Math.PI / 32) < 1e-6);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuSharedTransformEnabled, true);
  assert.deepEqual(
    [app.previewGpuSharedTransform.x, app.previewGpuSharedTransform.y, app.previewGpuSharedTransform.z],
    [0, 1, 0]
  );
  assert.ok(Math.abs(app.previewGpuSharedTransform.w) < 1e-6);
  assert.deepEqual(Array.from(attributes.aGpuTransformVector.array), [10, 0, 0]);
  assert.match(mainSource, /attribute vec4 aGpuTransform;/);
  assert.match(mainSource, /attribute float aGpuScale;/);
  assert.match(mainSource, /rotateGpuVector/);
  assert.match(mainSource, /gpuAnchor = transformed - aGpuTransformVector/);
  assert.match(mainSource, /transformedGpuAnchor = \(uGpuPreviewGlobalTransform \* vec4\(gpuAnchor, 1\.0\)\)\.xyz/);
  assert.match(mainSource, /transformed = transformedGpuAnchor \+ transformedGpuLocal/);

  app.updatePreviewGpuParticleTransforms(0.5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  assert.ok(Math.abs(app.previewGpuSharedTransform.w - Math.PI / 64) < 1e-6);
  assert.match(mainSource, /vec3 texColor = clamp\(texel\.rgb \/ max\(texel\.a/);
  assert.match(source, /colorSpace.*THREE\.SRGBColorSpace/);
});

test('GPU root rel rotation is resolved per anchor toward the parent Composition origin', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeAxisExpr: 'RelativeLocation.yAxis()',
    shapeDisplayActions: [{ type: 'expression', expression: 'rotateToWithAngle(rel, 0)' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(10, 1, 0), U.v(-10, 1, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewAnchorBase = [U.v(10, 0, 0), U.v(-10, 0, 0)];
  app.previewLocalBase = [U.v(0, 1, 0), U.v(0, 1, 0)];
  app.previewAnchorRef = [0, 1];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];
  app.compilePreviewScriptsFromState({ force: true });

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleTransforms(0, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.equal(app.previewGpuTransformGroups.length, 2);
  const firstAxis = [
    app.previewGpuTransformGroups[0].transform.x,
    app.previewGpuTransformGroups[0].transform.y,
    app.previewGpuTransformGroups[0].transform.z
  ];
  const secondAxis = [
    app.previewGpuTransformGroups[1].transform.x,
    app.previewGpuTransformGroups[1].transform.y,
    app.previewGpuTransformGroups[1].transform.z
  ];
  assert.ok(firstAxis[2] > 0.9, JSON.stringify({ firstAxis, secondAxis }));
  assert.ok(secondAxis[2] < -0.9, JSON.stringify({ firstAxis, secondAxis }));
  assert.deepEqual(Array.from(attributes.aGpuTransform.array), new Array(8).fill(0));
});

test('GPU root angle-offset repeats keep distinct transforms', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    angleOffsetEnabled: true,
    angleOffsetCount: 2,
    angleOffsetGlowTick: 1,
    angleOffsetAngleMode: 'numeric',
    angleOffsetAngleValue: Math.PI * 2,
    angleOffsetAngleUnit: 'rad'
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewOwnerLocalIndex = [0, 0];
  app.previewOwnerPointCount = [1, 1];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 0];
  app.previewRootOffsetIndex = [0, 1];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuSharedTransformEnabled, false);
  assert.equal(app.previewGpuTransformGroups.length, 2);
  app.updatePreviewGpuParticleTransforms(1, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  const firstAngle = app.previewGpuTransformGroups[0].transform.w;
  const secondAxis = [
    app.previewGpuTransformGroups[1].transform.x,
    app.previewGpuTransformGroups[1].transform.y,
    app.previewGpuTransformGroups[1].transform.z
  ];
  const secondAngle = app.previewGpuTransformGroups[1].transform.w;
  assert.ok(Math.abs(firstAngle) < 1e-6);
  assert.ok(Math.abs(secondAxis[1]) > 0.9, JSON.stringify(secondAxis));
  assert.ok(Math.abs(secondAngle - Math.PI) < 1e-6, String(secondAngle));
  assert.deepEqual(Array.from(attributes.aGpuTransform.array), new Array(8).fill(0));
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

test('GPU preview applies nested Composition scale without falling back', () => {
  const { card, leaf } = createGpuShapeCard();
  const nested = {
    id: 'nested-scale',
    type: 'particle_shape',
    scale: { type: 'linear', min: 1, max: 2, tick: 10, runMode: 'auto' },
    children: [leaf]
  };
  card.shapeChildren = [nested];
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewBasePoints = [U.v(1, 0, 0)];
  app.previewAnchorBase = [U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0)];
  app.previewLevelBases = [[U.v(1, 0, 0)]];
  app.previewLevelRefs = [[0]];
  app.previewLevelOffsetRefs = [[0]];
  app.previewLevelMetas = [[{
    node: nested,
    sharedNode: nested,
    sharedMode: 'full',
    sharedOffsetIndex: 0,
    depth: 1
  }]];

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleTransforms(5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.equal(app.previewGpuPerPointTransformEnabled, true);
  assert.ok(Math.abs(attributes.aGpuTransformVector.array[0] - 1.5) < 1e-6);
  assert.ok(attributes.aGpuFadeOut.array[3] < 0);

  app.updatePreviewGpuParticleTransforms(19, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  app.updatePreviewGpuParticleTransforms(5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  assert.ok(Math.abs(attributes.aGpuTransformVector.array[0] - 1.5) < 1e-6);
});

test('delayed per-point nested GPU transforms use each point local age', () => {
  const { card, leaf } = createGpuShapeCard();
  const nested = {
    id: 'nested-delayed-scale',
    type: 'particle_shape',
    scale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' },
    children: [leaf]
  };
  card.shapeChildren = [nested];
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  attributes.aFrameIndex.array = new Float32Array(2);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 5];
  app.previewOwnerLocalIndex = [0, 0];
  app.previewOwnerPointCount = [1, 1];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 0];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLevelBases = [[U.v(1, 0, 0)], [U.v(1, 0, 0)]];
  app.previewLevelRefs = [[0], [0]];
  app.previewLevelOffsetRefs = [[0], [0]];
  app.previewLevelMetas = [0, 1].map(() => [{
    node: nested,
    sharedNode: nested,
    sharedMode: 'full',
    sharedOffsetIndex: 0,
    depth: 1
  }]);
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleTransforms(5, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.equal(app.previewGpuPerPointTransformEnabled, true);
  assert.ok(Math.abs(attributes.aGpuTransformVector.array[0] - 1.25) < 1e-6);
  assert.ok(Math.abs(attributes.aGpuTransformVector.array[3] - 0.5) < 1e-6);
});

test('GPU nested angle-offset keeps child repeats aligned after replay', () => {
  const { card, leaf } = createGpuShapeCard();
  const nested = {
    id: 'nested-angle-offset',
    type: 'particle_shape',
    angleOffsetEnabled: true,
    angleOffsetCount: 2,
    angleOffsetGlowTick: 1,
    angleOffsetAngleMode: 'numeric',
    angleOffsetAngleValue: Math.PI * 2,
    angleOffsetAngleUnit: 'rad',
    children: [leaf]
  };
  card.shapeChildren = [nested];
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewBasePoints = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewOwnerLocalIndex = [0, 1];
  app.previewOwnerPointCount = [2, 2];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(1, 0, 0), U.v(1, 0, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 1];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLevelBases = [[U.v(1, 0, 0)], [U.v(1, 0, 0)]];
  app.previewLevelRefs = [[0], [0]];
  app.previewLevelOffsetRefs = [[0], [1]];
  app.previewLevelMetas = [0, 1].map((offsetIndex) => [{
    node: nested,
    sharedNode: nested,
    sharedMode: 'full',
    sharedOffsetIndex: offsetIndex,
    depth: 1
  }]);
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];
  attributes.aFrameIndex.array = new Float32Array(2);

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleTransforms(1, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  const firstPass = Array.from(attributes.aGpuTransformVector.array);
  assert.ok(firstPass[0] > 0.9, JSON.stringify(firstPass));
  assert.ok(firstPass[3] < -0.9, JSON.stringify(firstPass));

  app.updatePreviewGpuParticleTransforms(19, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  app.updatePreviewGpuParticleTransforms(1, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  assert.deepEqual(Array.from(attributes.aGpuTransformVector.array), firstPass);
});

test('GPU root order expressions keep per-point rotation semantics', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeDisplayActions: [{
      type: 'expression',
      expression: 'if (order > 0) rotateToPoint(RelativeLocation.xAxis())'
    }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewBasePoints = [U.v(0, 1, 0), U.v(0, 1, 0)];
  app.previewOwners = [card.id, card.id];
  app.previewBirthOffsets = [0, 0];
  app.previewOwnerLocalIndex = [0, 1];
  app.previewOwnerPointCount = [2, 2];
  app.previewAnchorBase = [U.v(0, 0, 0), U.v(0, 0, 0)];
  app.previewLocalBase = [U.v(0, 1, 0), U.v(0, 1, 0)];
  app.previewAnchorRef = [0, 0];
  app.previewLocalRef = [0, 1];
  app.previewRootOffsetIndex = [0, 0];
  app.previewLeafTextureConfigs = [app.previewLeafTextureConfigs[0], app.previewLeafTextureConfigs[0]];
  app.previewLeafVisualSources = [leaf, leaf];
  app.compilePreviewScriptsFromState({ force: true });

  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuTransformGroups.length, 2);
  app.updatePreviewGpuParticleTransforms(0, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.ok(Math.abs(app.previewGpuTransformGroups[0].transform.w) < 1e-6);
  assert.ok(app.previewGpuTransformGroups[1].transform.w > 1);
  assert.deepEqual(Array.from(attributes.aGpuTransform.array), new Array(8).fill(0));
});

test('large multi-group GPU preview updates group uniforms instead of particle transforms', () => {
  const pointCount = 71936;
  const { card, leaf } = createGpuShapeCard({}, {
    angleOffsetEnabled: true,
    angleOffsetCount: 2,
    angleOffsetGlowTick: 1,
    angleOffsetAngleMode: 'numeric',
    angleOffsetAngleValue: Math.PI * 2,
    angleOffsetAngleUnit: 'rad'
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  app.previewBasePoints = new Array(pointCount);
  app.previewOwners = new Array(pointCount).fill(card.id);
  app.previewBirthOffsets = new Array(pointCount).fill(0);
  app.previewOwnerLocalIndex = new Array(pointCount);
  app.previewOwnerPointCount = new Array(pointCount).fill(pointCount / 2);
  app.previewAnchorBase = new Array(pointCount);
  app.previewLocalBase = new Array(pointCount);
  app.previewAnchorRef = new Array(pointCount);
  app.previewLocalRef = new Array(pointCount);
  app.previewRootOffsetIndex = new Array(pointCount);
  app.previewLeafTextureConfigs = new Array(pointCount).fill(app.previewLeafTextureConfigs[0]);
  app.previewLeafVisualSources = new Array(pointCount).fill(leaf);
  attributes.aFrameIndex.array = new Float32Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    const repeatIndex = i & 1;
    const pointIndex = i >> 1;
    const local = U.v(1 + pointIndex * 0.0001, 0, 0);
    app.previewBasePoints[i] = local;
    app.previewOwnerLocalIndex[i] = pointIndex;
    app.previewAnchorBase[i] = U.v(0, 0, 0);
    app.previewLocalBase[i] = local;
    app.previewAnchorRef[i] = 0;
    app.previewLocalRef[i] = pointIndex;
    app.previewRootOffsetIndex[i] = repeatIndex;
  }

  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.equal(app.previewGpuTransformGroups.length, 2);
  attributes.aGpuTransform.needsUpdate = false;
  attributes.aGpuScale.needsUpdate = false;
  attributes.aGpuTransformVector.needsUpdate = false;

  app.updatePreviewGpuParticleTransforms(1, { appear: 0, live: 20, fade: 0, play: 20, total: 20 });

  assert.equal(attributes.aGpuTransform.needsUpdate, false);
  assert.equal(attributes.aGpuScale.needsUpdate, false);
  assert.equal(attributes.aGpuTransformVector.needsUpdate, false);
  assert.ok(Math.abs(app.previewGpuTransformGroups[1].transform.w - Math.PI) < 1e-6);
  assert.match(mainSource, /uGpuPreviewGroupTransforms\[\$\{gpuTransformGroupLimit\}\]/);
  assert.match(mainSource, /gpuTransformGroup = aGpuFadeOut\.w/);
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


test('GPU preview keeps single-group card scale in a shared uniform value', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeScale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' }
  });
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app.previewAnimStart = 0;
  assert.equal(app.canUsePreviewGpuParticlePath(), true);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  app.updatePreviewGpuParticleAnimation(250);
  assert.equal(app.previewGpuSharedTransformEnabled, true);
  assert.ok(Math.abs(app.previewGpuSharedScale - 1.25) < 1e-6);
});

test('GPU card scale replays from the same cycle-local tick', () => {
  const { card, leaf } = createGpuShapeCard({}, {
    shapeScale: { type: 'linear', min: 0.5, max: 2, tick: 10, runMode: 'auto' }
  });
  const { app } = prepareGpuParticlePathHarness(card, leaf);
  app.getPreviewCycleConfig = () => ({ appear: 0, live: 20, fade: 0, play: 20, total: 20 });
  app._pointsShaderRef = {
    uniforms: {
      uGpuPreviewEnabled: { value: 0 },
      uGpuPreviewTick: { value: 0 },
      uGpuPreviewPlayTicks: { value: 0 },
      uGpuPreviewCycleTicks: { value: 0 },
      uGpuPreviewGlobalAlpha: { value: 1 },
      uGpuPreviewUseSharedTransform: { value: 0 },
      uGpuPreviewSharedTransform: { value: { x: 0, y: 0, z: 0, w: 0 } },
      uGpuPreviewSharedScale: { value: 1 },
      uGpuPreviewGlobalTransform: { value: app.createPreviewGpuMatrix4() }
    }
  };
  app.previewAnimStart = 0;
  assert.equal(app.configurePreviewGpuParticlePath(), true);

  app.updatePreviewGpuParticleAnimation(250);
  const firstCycleScale = app.previewGpuSharedScale;
  app.updatePreviewGpuParticleAnimation(1250);
  const secondCycleScale = app.previewGpuSharedScale;

  assert.ok(Math.abs(firstCycleScale - 1.25) < 1e-6);
  assert.ok(Math.abs(secondCycleScale - firstCycleScale) < 1e-6);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewUseSharedTransform.value, 1);
  assert.equal(app._pointsShaderRef.uniforms.uGpuPreviewSharedScale.value, secondCycleScale);
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

test('GPU random birth age keeps its initial texture frame static', () => {
  const { card, leaf } = createGpuShapeCard({
    particleInit: [{ target: 'age', expr: 'Random.nextInt(maxAge)' }]
  });
  const { app, attributes } = prepareGpuParticlePathHarness(card, leaf);
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    app.updatePreviewGeometry(app.previewBasePoints, app.previewOwners);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(app.previewGpuHasLifecycleData, false);
  assert.deepEqual(Array.from(app.previewGpuLifecycleFlags), [0]);
  assert.equal(app.configurePreviewGpuParticlePath(), true);
  assert.deepEqual(Array.from(attributes.aGpuLifecycle.array), [50, -100]);
  assert.match(mainSource, /float textureProgress = clamp\(lifecycleAge \/ lifecycleLifetime, 0\.0, 1\.0\);/);
  assert.doesNotMatch(mainSource, /textureProgress = clamp\(previewAge \/ max\(uGpuPreviewCycleTicks, 1\.0\)/);
});
