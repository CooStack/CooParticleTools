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
  .replace(/^import\s+\*\s+as\s+THREE[^\n]*\n/, 'const THREE = {};\n')
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
  len: (value) => Math.hypot(num(value?.x), num(value?.y), num(value?.z)),
  norm(value) {
    const length = this.len(value) || 1;
    return this.v(num(value?.x) / length, num(value?.y) / length, num(value?.z) / length);
  }
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
