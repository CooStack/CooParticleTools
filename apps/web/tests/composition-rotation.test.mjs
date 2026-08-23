import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createExpressionRuntime } from '../public/legacy/assets/composition_builder/js/expression_runtime.js';
import { normalizeAlphaHelperConfig } from '../public/legacy/assets/composition_builder/js/alpha_helper_utils.js';
import { normalizeScaleHelperConfig } from '../public/legacy/assets/composition_builder/js/scale_helper_utils.js';

const source = readFileSync(
  new URL('../public/legacy/assets/composition_builder/js/preview_runtime_mixin.js', import.meta.url),
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
const utilsSource = readFileSync(
  new URL('../public/legacy/assets/src/js/compat/legacy-utils.global.js', import.meta.url),
  'utf8'
);
new Function(utilsSource)();
const U = globalThis.Utils;
const workerSource = readFileSync(
  new URL('../public/legacy/assets/composition_builder/js/preview_render_cache_worker.js', import.meta.url),
  'utf8'
);
const executableWorkerSource = workerSource
  .replace(/^import\s+["'][^"']+["'];\r?\n/gm, '')
  .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\r?\n/gm, '')
  .replace(/const runtime = new WorkerPreviewRuntime\(\);[\s\S]*$/, 'return WorkerPreviewRuntime;');
const WorkerPreviewRuntime = new Function(
  'createExpressionRuntime',
  'normalizeAlphaHelperConfig',
  'normalizeCParticleAlphaConfig',
  'normalizeScaleHelperConfig',
  'normalizeAngleUnit',
  'normalizeAngleOffsetEaseName',
  'normalizeAngleOffsetEaseSpecialParams',
  'installPreviewRuntimeMethods',
  executableWorkerSource
)(
  createExpressionRuntime,
  normalizeAlphaHelperConfig,
  (value) => value,
  normalizeScaleHelperConfig,
  (value) => value,
  (value) => value,
  (value) => value,
  installPreviewRuntimeMethods
);

function dot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

function length(vector) {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector) {
  const magnitude = length(vector);
  if (magnitude <= 1e-12) return { x: 0, y: 1, z: 0 };
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude
  };
}

function rotateAroundAxis(point, axis, angle) {
  const unit = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const axisCrossPoint = cross(unit, point);
  const axisProjection = dot(unit, point) * (1 - cosine);
  return {
    x: point.x * cosine + axisCrossPoint.x * sine + unit.x * axisProjection,
    y: point.y * cosine + axisCrossPoint.y * sine + unit.y * axisProjection,
    z: point.z * cosine + axisCrossPoint.z * sine + unit.z * axisProjection
  };
}

function alignToDirection(point, fromAxis, toDirection) {
  const from = normalize(fromAxis);
  const to = normalize(toDirection);
  const cosine = Math.max(-1, Math.min(1, dot(from, to)));
  if (cosine >= 1 - 1e-12) return { ...point };
  let rotationAxis = cross(from, to);
  if (length(rotationAxis) <= 1e-12) {
    const reference = Math.abs(from.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    rotationAxis = cross(from, reference);
  }
  return rotateAroundAxis(point, rotationAxis, Math.acos(cosine));
}

class RotationHarness {}

function ensureStatusHelperMethods(rawStatus) {
  const status = rawStatus && typeof rawStatus === 'object' ? rawStatus : {};
  status.displayStatus = Math.trunc(Number(status.displayStatus) || 1) === 2 ? 2 : 1;
  status.isDisable = () => status.displayStatus === 2;
  status.disable = () => {
    status.displayStatus = 2;
    status.__manualDisplayStatus = true;
  };
  status.isEnable = () => status.displayStatus !== 2;
  status.enable = () => {
    status.displayStatus = 1;
    status.__manualDisplayStatus = true;
  };
  return status;
}

installPreviewRuntimeMethods(RotationHarness, {
  U,
  num: (value) => Number(value) || 0,
  int: (value) => Math.trunc(Number(value) || 0),
  clamp: (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
  normalizeAnimate: (value) => value,
  normalizeControllerAction: (value) => value,
  normalizeAlphaHelperConfig,
  normalizeDisplayAction: (value) => value,
  normalizeScaleHelperConfig,
  ensureStatusHelperMethods,
  stripJsForLint: (value) => String(value || ''),
  transpileKotlinThisQualifierToJs: (value) => value,
  rotatePointsToPointUpright: (value) => value,
  srgbRgbToLinearArray: (value) => value,
  CONTROLLER_SCOPE_RESERVED: new Set(),
  normalizeAngleUnit: (value) => value,
  normalizeAngleOffsetEaseName: (value) => value,
  normalizeAngleOffsetEaseSpecialParams: (value) => value
});

function assertVectorClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual.x - expected.x) <= epsilon, `x: ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= epsilon, `y: ${actual.y} != ${expected.y}`);
  assert.ok(Math.abs(actual.z - expected.z) <= epsilon, `z: ${actual.z} != ${expected.z}`);
}

function attachExpressionRuntime(app) {
  app.exprRuntime = createExpressionRuntime({
    U,
    getState: () => app.state || {},
    sanitizeIdentifier: String
  });
}

function attachPreviewGeometry(app, pointCount) {
  const attributes = {
    position: { array: new Float32Array(pointCount * 3), needsUpdate: false },
    color: { array: new Float32Array(pointCount * 3), needsUpdate: false },
    aSize: { array: new Float32Array(pointCount), needsUpdate: false },
    aAlpha: { array: new Float32Array(pointCount), needsUpdate: false },
    aFrameIndex: { array: new Float32Array(pointCount), needsUpdate: false }
  };
  app.pointsGeom = {
    getAttribute(name) {
      return attributes[name] || null;
    }
  };
  return attributes;
}

function createRealtimeRelFrameHarness() {
  const leaf = {
    id: 'leaf',
    type: 'single',
    particleInit: [],
    controllerVars: [],
    controllerActions: []
  };
  const card = {
    id: 'shape-card',
    name: 'shape card',
    previewVisible: true,
    previewSolo: false,
    bindMode: 'point',
    point: { x: 10, y: 0, z: 0 },
    dataType: 'particle_shape',
    shapeAxisExpr: 'RelativeLocation.yAxis()',
    shapeAxisPreset: 'RelativeLocation.yAxis()',
    shapeScale: { type: 'none' },
    shapeDisplayActions: [{ type: 'expression', expression: 'rotateToWithAngle(rel, 0)' }],
    shapeChildren: [leaf],
    particleInit: [],
    controllerVars: [],
    controllerActions: []
  };
  const app = new RotationHarness();
  app.state = {
    compositionType: 'particle',
    cards: [card],
    globalVars: [],
    globalConsts: [],
    compositionAnimates: [],
    projectScale: { type: 'none' },
    projectAlpha: { type: 'none' },
    displayActions: [{ type: 'expression', expression: 'rotateAsAxis(PI / 2)' }],
    disabledInterval: 0,
    previewPlayTicks: 100
  };
  for (const key of [
    'previewExprCountCache',
    'previewExprPrefixCache',
    'previewExprFnCache',
    'previewCondFnCache',
    'previewNumericFnCache',
    'previewControllerFnCache',
    'previewFoldSimpleActionCache',
    'previewVisualRuntimePlanCache',
    'previewCardVisualAgeDependentCache'
  ]) {
    app[key] = new Map();
  }
  attachExpressionRuntime(app);
  app.getCardById = (id) => id === card.id ? card : null;
  app.getCardIndexById = (id) => id === card.id ? 0 : -1;
  app.pointsGeom = {};
  app.previewBasePoints = [U.v(10, 1, 0)];
  app.previewPoints = [U.v(10, 1, 0)];
  app.previewOwners = [card.id];
  app.previewBirthOffsets = [0];
  app.previewOwnerLocalIndex = [0];
  app.previewOwnerPointCount = [1];
  app.previewAnchorBase = [U.v(10, 0, 0)];
  app.previewLocalBase = [U.v(0, 1, 0)];
  app.previewAnchorRef = [0];
  app.previewLocalRef = [0];
  app.previewLevelBases = [[U.v(0, 1, 0)]];
  app.previewLevelRefs = [[0]];
  app.previewLevelOffsetRefs = [[0]];
  app.previewLevelMetas = [[{ node: leaf, depth: 1 }]];
  app.previewUseLocalOps = [true];
  app.previewRootOffsetIndex = [0];
  app.previewRootVirtualIndex = [0];
  app.previewRootVirtualTotal = 1;
  app.previewLeafTextureConfigs = [{ effectClass: '', useTexture: false }];
  app.previewLeafVisualSources = [leaf];
  app.previewRuntimeAppliedTick = -1;
  app.previewCanResumeRuntimeState = false;
  app.rebuildPreviewRuntimeIndex();
  app.compilePreviewScriptsFromState({ force: true });
  return app;
}

function createRebuiltPointsBuilderShapeHarness() {
  const app = createRealtimeRelFrameHarness();
  const card = app.state.cards[0];
  const leaf = card.shapeChildren[0];
  card.point = { x: 10, y: 6, z: 0 };
  card.bindMode = 'point';
  card.dataType = 'particle_shape';
  card.shapeDisplayActions = [{ type: 'expression', expression: 'rotateToPoint(rel)' }];
  leaf.bindMode = 'builder';
  leaf.builderState = {};
  app.state.displayActions = [{ type: 'expression', expression: 'rotateAsAxis(PI / 32)' }];
  app.evaluateBuilderPoints = () => ({
    points: Array.from({ length: 291 }, (_, index) => U.v(index / 100, (index % 17) / 10, 0))
  });
  app.updatePreviewGeometry = (points) => {
    attachPreviewGeometry(app, points.length);
  };

  app.rebuildPreview();
  return app;
}

function createNetherStarLaserCardHarness() {
  const app = createRebuiltPointsBuilderShapeHarness();
  const card = app.state.cards[0];
  card.name = '卡片 4';
  card.shapeDisplayActions = [{
    type: 'expression',
    expression: 'rotateToWithAngle(rel, PI/32)'
  }];
  app.state.compositionType = 'sequenced';
  app.state.cards = [0, 1, 2].map((index) => ({
    id: `leading-card-${index}`,
    name: `卡片 ${index + 1}`,
    previewVisible: true,
    previewSolo: false,
    bindMode: 'point',
    point: { x: index + 1, y: 0, z: 0 },
    dataType: 'single',
    particleInit: [],
    controllerVars: [],
    controllerActions: [],
    shapeChildren: []
  })).concat(card);
  app.state.globalVars = [{
    name: 'age',
    type: 'Int',
    value: '0',
    codec: true,
    mutable: true
  }];
  app.state.displayActions = [{
    type: 'expression',
    expression: [
      'age++',
      'if (age > 50){',
      '    scaleHelper.doScale()',
      '}',
      'rotateAsAxis(PI/64)'
    ].join('\n')
  }];
  app.state.projectScale = {
    type: 'bezier',
    runMode: 'manual',
    min: 0.01,
    max: 1,
    tick: 10,
    c1x: 3.2199546485260773,
    c1y: 1.3516358463974547,
    c2x: 3.253968253968254,
    c2y: 1.2746217997179992,
    reversedOnDisable: false
  };
  app.state.compositionAnimates = [
    { count: 1, condition: 'true' },
    { count: 2, condition: 'age > 50' },
    { count: 1, condition: 'age > 51' }
  ];
  app.state.projectAlpha = {
    type: 'alpha',
    runMode: 'auto',
    min: 0,
    max: 1,
    tick: 10,
    startMax: false,
    decreaseOnDisable: true
  };
  app.state.previewPlayTicks = 100;
  app.state.disabledInterval = 10;
  app.rebuildPreview();
  return app;
}

function createManualProjectScaleHarness() {
  const app = new RotationHarness();
  app.state = {
    projectScale: {
      type: 'linear',
      runMode: 'manual',
      min: 1,
      max: 11,
      tick: 10
    },
    projectAlpha: { type: 'none' }
  };
  attachExpressionRuntime(app);
  app.createRuntimeExpressionScope = () => ({});
  app.createProjectAlphaHelperApi = () => ({});
  return app;
}

function applyRotation(direction) {
  const app = new RotationHarness();
  const point = { x: 1, y: 0, z: 0 };
  const angle = Math.PI / 2;
  const result = app.applyRuntimeActionsToPoint(
    point,
    [{ type: 'rotateToWithAngle', to: direction, anglePerTick: angle }],
    1,
    1,
    0,
    { x: 0, y: 1, z: 0 }
  );
  return { point, angle, result };
}

test('rotatePointToDirection maps the current card axis onto a diagonal target', () => {
  const app = new RotationHarness();
  const currentAxis = { x: 0, y: 1, z: 0 };
  const direction = { x: 1, y: 1, z: 0 };

  const result = app.rotatePointToDirection(currentAxis, direction, currentAxis);

  assertVectorClose(result, normalize(direction));
});

test('rotatePointToDirection maps the current card axis onto an opposite target', () => {
  const app = new RotationHarness();
  const currentAxis = { x: 0, y: 1, z: 0 };
  const direction = { x: 0, y: -1, z: 0 };

  const result = app.rotatePointToDirection(currentAxis, direction, currentAxis);

  assertVectorClose(result, direction);
});

test('rotateToWithAngle keeps Y as the card axis and rolls around it', () => {
  const direction = { x: 0, y: 1, z: 0 };
  const { point, angle, result } = applyRotation(direction);

  assertVectorClose(result, rotateAroundAxis(point, direction, angle));
});

test('rotateToWithAngle aligns the card axis before rolling around a diagonal direction', () => {
  const direction = { x: 1, y: 1, z: 0 };
  const { point, angle, result } = applyRotation(direction);
  const aligned = alignToDirection(point, { x: 0, y: 1, z: 0 }, direction);

  assertVectorClose(result, rotateAroundAxis(aligned, direction, angle));
  assert.ok(Math.abs(length(result) - length(point)) <= 1e-9);
});

test('expression rotateToWithAngle aligns and updates the card axis', () => {
  const app = new RotationHarness();
  const point = { x: 1, y: 0, z: 0 };
  const direction = { x: 1, y: 1, z: 0 };
  const angle = Math.PI / 2;
  app.state = {};
  attachExpressionRuntime(app);
  app.createRuntimeExpressionScope = () => ({});
  app.createProjectAlphaHelperApi = () => ({});

  const result = app.applyExpressionActionToPoint(
    {
      expression: 'rotateToWithAngle(direction, PI / 2)',
      fn(vars, currentPoint, rotateToPoint, rotateAsAxis, rotateToWithAngle) {
        rotateToWithAngle(direction, angle);
      }
    },
    point,
    1,
    1,
    0,
    { x: 0, y: 1, z: 0 }
  );

  const aligned = alignToDirection(point, { x: 0, y: 1, z: 0 }, direction);
  assertVectorClose(result.point, rotateAroundAxis(aligned, direction, angle));
  assertVectorClose(result.axis, normalize(direction));
});

test('shape expression supports RelativeLocation clone and add on rel', () => {
  const app = new RotationHarness();
  const expression = 'rotateToWithAngle(rel.clone().add(0.0, 2.5, 0.0), 0)';
  app.state = {};
  attachExpressionRuntime(app);
  app.previewExprFnCache = new Map();
  app.createRuntimeExpressionScope = () => ({});
  app.createProjectAlphaHelperApi = () => ({});

  const compiled = app.compilePreviewDisplayExpression('shape-rel-clone-add', expression, { force: true });
  assert.equal(compiled.ok, true, compiled.message);

  const result = app.applyExpressionActionToPoint(
    { expression, fn: compiled.fn },
    { x: 1, y: 0, z: 0 },
    1,
    1,
    0,
    { x: 0, y: 1, z: 0 },
    { shapeScope: { rel: { x: 1, y: 0, z: 0 } } }
  );

  assertVectorClose(result.axis, normalize({ x: 1, y: 2.5, z: 0 }));
});

test('Composition runtime vector supports functional basic operations and vector math', () => {
  const app = new RotationHarness();
  app.state = {};
  attachExpressionRuntime(app);

  const value = app.exprRuntime.createRuntimeVector({ x: 1, y: 2, z: 3 }, 0, 0, 'RelativeLocation');
  const result = value.clone()
    .add(1, 2, 3)
    .remove({ x: 1, y: 1, z: 1 })
    .multiple(2)
    .divide(2);

  assertVectorClose(result, { x: 1, y: 3, z: 5 });
  assertVectorClose(value, { x: 1, y: 2, z: 3 });
  assert.equal(result.__compositionVectorType, 'RelativeLocation');
  assert.equal(result.dot({ x: 2, y: 0, z: 0 }), 2);
  assertVectorClose(result.cross({ x: 0, y: 1, z: 0 }), { x: -5, y: 0, z: 1 });
  assert.ok(Math.abs(result.clone().normalize().length() - 1) <= 1e-9);
});

test('folded expression rotateToWithAngle aligns and rolls around the updated card axis', () => {
  const app = new RotationHarness();
  const point = { x: 1, y: 0, z: 0 };
  const direction = { x: 1, y: 1, z: 0 };
  app.state = { displayActions: [] };
  app.previewFoldSimpleActionCache = new Map();
  app.evaluateNumericExpression = (expression) => Function('PI', `return (${expression});`)(Math.PI);

  const runtimeActions = app.buildPreviewRuntimeActions(0, [
    {
      type: 'expression',
      expression: 'addMultiple(10)\nrotateToWithAngle(direction, PI / 64)'
    }
  ]);

  assert.deepEqual(runtimeActions.map((action) => action.type), ['growth_add', 'rotateToWithAngle']);
  assert.equal(runtimeActions[1].toExpr, 'direction');
  const result = app.applyRuntimeActionsToPoint(
    point,
    runtimeActions,
    32,
    32,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars: { direction } }
  );

  const aligned = alignToDirection(point, { x: 0, y: 1, z: 0 }, direction);
  assertVectorClose(result, rotateAroundAxis(aligned, direction, Math.PI / 2));
});

test('rotateAsAxis after rotateToWithAngle uses the updated card axis', () => {
  const app = new RotationHarness();
  const point = { x: 1, y: 0, z: 0 };
  const direction = { x: 1, y: 1, z: 0 };
  const quarterTurn = Math.PI / 4;
  const result = app.applyRuntimeActionsToPoint(
    point,
    [
      { type: 'rotateToWithAngle', to: direction, anglePerTick: quarterTurn },
      { type: 'rotateAsAxis', anglePerTick: quarterTurn }
    ],
    1,
    1,
    0,
    { x: 0, y: 1, z: 0 }
  );
  const aligned = alignToDirection(point, { x: 0, y: 1, z: 0 }, direction);

  assertVectorClose(result, rotateAroundAxis(aligned, direction, Math.PI / 2));
});

test('expression rotation direct frames match sequential accumulated rotation', () => {
  const createAction = () => ({
    expression: 'rotateAsAxis(PI / 2)',
    fn(vars, point, rotateToPoint, rotateAsAxis) {
      rotateAsAxis(Math.PI / 2);
    }
  });
  const apply = (app, action, elapsedTick, runtimeVars) => app.applyExpressionActionToPoint(
    action,
    { x: 1, y: 0, z: 0 },
    elapsedTick,
    elapsedTick,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars }
  ).point;

  const directApp = new RotationHarness();
  directApp.state = {};
  attachExpressionRuntime(directApp);
  directApp.createRuntimeExpressionScope = () => ({});
  directApp.createProjectAlphaHelperApi = () => ({});
  const direct = apply(directApp, createAction(), 2, {});

  const sequentialApp = new RotationHarness();
  sequentialApp.state = {};
  attachExpressionRuntime(sequentialApp);
  sequentialApp.createRuntimeExpressionScope = () => ({});
  sequentialApp.createProjectAlphaHelperApi = () => ({});
  const runtimeVars = {};
  apply(sequentialApp, createAction(), 0, runtimeVars);
  apply(sequentialApp, createAction(), 1, runtimeVars);
  const sequential = apply(sequentialApp, createAction(), 2, runtimeVars);

  assertVectorClose(direct, { x: -1, y: 0, z: 0 });
  assertVectorClose(direct, sequential);
});

test('expression rotation catches up after cached frames skip live runtime updates', () => {
  const createApp = () => {
    const app = new RotationHarness();
    app.state = {};
    attachExpressionRuntime(app);
    app.createRuntimeExpressionScope = () => ({});
    app.createProjectAlphaHelperApi = () => ({});
    return app;
  };
  const action = {
    expression: 'rotateAsAxis(PI / 8)',
    fn(vars, point, rotateToPoint, rotateAsAxis) {
      rotateAsAxis(Math.PI / 8);
    }
  };
  const apply = (app, elapsedTick, runtimeVars) => app.applyExpressionActionToPoint(
    action,
    { x: 1, y: 0, z: 0 },
    elapsedTick,
    elapsedTick,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars }
  ).point;
  const direct = apply(createApp(), 10, {});
  const resumedApp = createApp();
  const runtimeVars = {};
  apply(resumedApp, 0, runtimeVars);
  const afterCachedGap = apply(resumedApp, 10, runtimeVars);

  assertVectorClose(afterCachedGap, direct);
});

test('manual project scale advances once per helper call without catching up skipped ticks', () => {
  const app = createManualProjectScaleHarness();
  const action = {
    expression: 'scaleHelper.doScale()',
    fn(vars) {
      vars.scaleHelper.doScale();
    }
  };
  const runtimeVars = {};
  const apply = (elapsedTick) => app.applyExpressionActionToPoint(
    action,
    { x: 1, y: 0, z: 0 },
    elapsedTick,
    elapsedTick,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars, persistExpressionVars: true }
  ).point;

  assertVectorClose(apply(0), { x: 2, y: 0, z: 0 });
  assertVectorClose(apply(5), { x: 3, y: 0, z: 0 });
});

test('manual project scale interpolates only within ticks that call the helper', () => {
  const app = createManualProjectScaleHarness();
  const runtimeVars = {};
  const forwardAction = {
    expression: 'scaleHelper.doScale()',
    fn(vars) {
      vars.scaleHelper.doScale();
    }
  };
  const pausedAction = {
    expression: 'if (false) scaleHelper.doScale()',
    fn() {}
  };
  const reverseAction = {
    expression: 'scaleHelper.doScaleReversed()',
    fn(vars) {
      vars.scaleHelper.doScaleReversed();
    }
  };
  const apply = (action, elapsedTick, persistExpressionVars = false) => {
    app.previewManualProjectScaleTick = elapsedTick;
    return app.applyExpressionActionToPoint(
      action,
      { x: 1, y: 0, z: 0 },
      elapsedTick,
      elapsedTick,
      0,
      { x: 0, y: 1, z: 0 },
      { runtimeVars, persistExpressionVars }
    ).point;
  };

  assertVectorClose(apply(forwardAction, 0, true), { x: 2, y: 0, z: 0 });
  assertVectorClose(apply(forwardAction, 0.25), { x: 2.25, y: 0, z: 0 });
  assertVectorClose(apply(forwardAction, 0.5), { x: 2.5, y: 0, z: 0 });
  assertVectorClose(apply(pausedAction, 1.5), { x: 2, y: 0, z: 0 });

  assertVectorClose(apply(forwardAction, 2, true), { x: 3, y: 0, z: 0 });
  assertVectorClose(apply(reverseAction, 3, true), { x: 2, y: 0, z: 0 });
  assertVectorClose(apply(reverseAction, 3.5), { x: 1.5, y: 0, z: 0 });
});

test('manual project scale applies the final absolute scale once after multiple calls', () => {
  const app = createManualProjectScaleHarness();
  const runtimeVars = {};
  const result = app.applyExpressionActionToPoint(
    {
      expression: 'scaleHelper.doScale()\nscaleHelper.doScale()',
      fn(vars) {
        vars.scaleHelper.doScale();
        vars.scaleHelper.doScale();
      }
    },
    { x: 1, y: 0, z: 0 },
    0,
    0,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars, persistExpressionVars: true }
  ).point;

  assert.equal(runtimeVars.__cpbProjectScalePhase, 2);
  assertVectorClose(result, { x: 3, y: 0, z: 0 });
});

test('manual project scale is shared across expression actions and applied once to geometry', () => {
  const app = createManualProjectScaleHarness();
  const runtimeVars = {};
  const actions = [0, 1].map((index) => ({
    type: 'expression',
    expression: `scaleHelper.doScale() // ${index}`,
    fn(vars) {
      vars.scaleHelper.doScale();
    }
  }));

  app.applyExpressionGlobalsOnce(actions, 0, 0, runtimeVars, { x: 0, y: 1, z: 0 });
  const result = app.applyRuntimeActionsToPoint(
    { x: 1, y: 0, z: 0 },
    actions,
    0,
    0,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars }
  );

  assert.equal(runtimeVars.__cpbProjectScalePhase, 2);
  assertVectorClose(result, { x: 3, y: 0, z: 0 });
});

test('manual project scale holds while paused and reverses one step per call', () => {
  const app = createManualProjectScaleHarness();
  const runtimeVars = { __cpbProjectScalePhase: 2 };
  const paused = app.applyExpressionActionToPoint(
    {
      expression: 'if (false) scaleHelper.doScale()',
      fn() {}
    },
    { x: 1, y: 0, z: 0 },
    4,
    4,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars }
  ).point;
  const reversed = app.applyExpressionActionToPoint(
    {
      expression: 'scaleHelper.doScaleReversed()',
      fn(vars) {
        vars.scaleHelper.doScaleReversed();
      }
    },
    { x: 1, y: 0, z: 0 },
    5,
    5,
    0,
    { x: 0, y: 1, z: 0 },
    { runtimeVars, persistExpressionVars: true }
  ).point;

  assertVectorClose(paused, { x: 3, y: 0, z: 0 });
  assert.equal(runtimeVars.__cpbProjectScalePhase, 1);
  assertVectorClose(reversed, { x: 2, y: 0, z: 0 });
});

test('rotateToPoint keeps the expression axis live for following vector expressions', () => {
  const app = new RotationHarness();
  const point = { x: 1, y: 0, z: 0 };
  const direction = { x: 1, y: 1, z: 0 };
  app.state = {};
  attachExpressionRuntime(app);
  app.createRuntimeExpressionScope = () => ({});
  app.createProjectAlphaHelperApi = () => ({});

  const result = app.applyExpressionActionToPoint(
    {
      expression: 'rotateToPoint(direction)\nrotateToWithAngle(axis, 0)',
      fn(vars, currentPoint, rotateToPoint, rotateAsAxis, rotateToWithAngle) {
        rotateToPoint(direction);
        rotateToWithAngle(vars.axis, 0);
      }
    },
    point,
    1,
    1,
    0,
    { x: 0, y: 1, z: 0 }
  );

  assertVectorClose(result.axis, normalize(direction));
  assertVectorClose(result.point, alignToDirection(point, { x: 0, y: 1, z: 0 }, direction));
});

test('axis-dependent rotation expressions stay on the live expression path', () => {
  const app = new RotationHarness();
  app.previewFoldSimpleActionCache = new Map();
  app.evaluateNumericExpression = (expression) => Function('PI', `return (${expression});`)(Math.PI);

  assert.equal(app.tryFoldSimpleExpressionAction('rotateToWithAngle(axis, PI / 32)', 0), null);
});

test('shape rel follows the project rotateAsAxis transform on every preview frame', () => {
  const app = createRealtimeRelFrameHarness();
  const cycleCfg = { appear: 0, live: 100, fade: 0, play: 100, total: 100 };

  for (const elapsedTick of [1, 2]) {
    const frame = app.computePreviewFrame({
      totalCount: 1,
      elapsedTick,
      globalCycleAge: elapsedTick,
      cycleIndex: 0,
      cycleCfg,
      outputToGeometry: false
    });
    const anchor = U.rotateAroundAxis(
      U.v(10, 0, 0),
      U.v(0, 1, 0),
      elapsedTick * Math.PI / 2
    );
    const actualLocal = U.v(
      frame.positions[0] - anchor.x,
      frame.positions[1] - anchor.y,
      frame.positions[2] - anchor.z
    );

    assertVectorClose(actualLocal, normalize(anchor), 1e-6);
  }
});

test('rebuild keeps a manual card point as the anchor of PointsBuilder shape children', () => {
  const app = createRebuiltPointsBuilderShapeHarness();
  const cycleCfg = { appear: 0, live: 100, fade: 0, play: 100, total: 100 };
  assert.equal(app.previewBasePoints.length, 291);
  assertVectorClose(app.previewAnchorBase[0], U.v(10, 6, 0));

  for (const elapsedTick of [0, 20, 56, 99]) {
    const frame = app.computePreviewFrame({
      totalCount: app.previewBasePoints.length,
      elapsedTick,
      globalCycleAge: elapsedTick,
      cycleIndex: 0,
      cycleCfg,
      outputToGeometry: false
    });
    const expectedAnchor = U.rotateAroundAxis(
      U.v(10, 6, 0),
      U.v(0, 1, 0),
      elapsedTick * Math.PI / 32
    );
    const actualAnchor = U.v(frame.positions[0], frame.positions[1], frame.positions[2]);

    assertVectorClose(actualAnchor, expectedAnchor, 1e-6);
    assert.ok(Math.abs(length(actualAnchor) - Math.sqrt(136)) <= 1e-6);

    const frameKey = app.makePreviewFrameCacheKey({
      totalCount: app.previewBasePoints.length,
      elapsedTick,
      globalCycleAge: elapsedTick,
      cycleIndex: 0,
      cycleCfg
    });
    assert.ok(frameKey);
    assert.equal(app.storePreviewCachedFrame(frameKey, frame, { cycleCfg }), true);
    const cached = app.getPreviewCachedFrame(frameKey, { cycleCfg });
    assertVectorClose(U.v(cached.positions[0], cached.positions[1], cached.positions[2]), expectedAnchor, 1e-6);
  }
});

test('automatic replay keeps cached and live rotation frames cycle-local', () => {
  const app = createRealtimeRelFrameHarness();
  const cycleCfg = { appear: 0, live: 99, fade: 0, play: 99, total: 99 };
  const firstCycle = app.computePreviewFrame({
    totalCount: 1,
    elapsedTick: 1,
    globalCycleAge: 1,
    cycleIndex: 0,
    cycleCfg,
    outputToGeometry: false
  });
  const secondCycle = app.computePreviewFrame({
    totalCount: 1,
    elapsedTick: 100,
    globalCycleAge: 1,
    cycleIndex: 1,
    cycleCfg,
    outputToGeometry: false
  });

  assert.deepEqual(Array.from(secondCycle.positions), Array.from(firstCycle.positions));
});

test('automatic replay writes the cached manual card anchor into final geometry without flicker', () => {
  const app = createRebuiltPointsBuilderShapeHarness();
  const cycleCfg = { appear: 0, live: 100, fade: 0, play: 100, total: 100 };
  app.state.settings = { previewRenderCacheEnabled: true };
  app.getPreviewCycleConfig = () => cycleCfg;
  app.queuePreviewRenderCacheBuilds = () => false;
  app.syncTextureUniforms = () => {};
  app.previewLastAppliedFrameKey = '';

  const renderAt = (elapsedTick) => {
    app.previewAnimStart = performance.now() - elapsedTick * 50;
    app.updatePreviewAnimation();
    const positions = app.pointsGeom.getAttribute('position').array;
    return U.v(positions[0], positions[1], positions[2]);
  };
  const firstCycle = new Map();
  for (let frame = 0; frame < 400; frame++) {
    const cycleAge = frame / 4;
    firstCycle.set(frame, renderAt(cycleAge));
  }

  for (let frame = 0; frame < 400; frame++) {
    const cycleAge = frame / 4;
    const actual = renderAt(100 + cycleAge);
    const expected = firstCycle.get(frame);
    assertVectorClose(actual, expected, 1e-5);
    assert.ok(Math.abs(length(actual) - Math.sqrt(136)) <= 1e-5);
  }
});

test('NetherStarLaser keeps card 4 anchor radius and replays manual scale and rotation identically', () => {
  const app = createNetherStarLaserCardHarness();
  const cycleCfg = { appear: 16, live: 84, fade: 10, play: 100, total: 110 };
  app.state.settings = { previewRenderCacheEnabled: true };
  app.getPreviewCycleConfig = () => cycleCfg;
  app.queuePreviewRenderCacheBuilds = () => false;
  app.syncTextureUniforms = () => {};
  app.previewLastAppliedFrameKey = '';

  const intermediateFrame = app.computePreviewFrame({
    totalCount: app.previewBasePoints.length,
    elapsedTick: 52,
    globalCycleAge: 52,
    cycleIndex: 0,
    cycleCfg,
    outputToGeometry: false
  });
  const intermediateAnchor = U.v(...Array.from(intermediateFrame.positions.slice(9, 12)));
  const expectedIntermediateScale = app.evalScaleCurve(app.state.projectScale, 3, 10);
  assert.ok(
    Math.abs(length(intermediateAnchor) - Math.sqrt(136) * expectedIntermediateScale) <= 1e-5,
    JSON.stringify({ intermediateAnchor, expectedIntermediateScale, runtimeGlobals: app.previewRuntimeGlobals })
  );

  const directFrame = app.computePreviewFrame({
    totalCount: app.previewBasePoints.length,
    elapsedTick: 61,
    globalCycleAge: 61,
    cycleIndex: 0,
    cycleCfg,
    outputToGeometry: false
  });
  assert.ok(
    Math.abs(length(U.v(...Array.from(directFrame.positions.slice(9, 12)))) - Math.sqrt(136)) <= 1e-5,
    JSON.stringify(app.previewRuntimeGlobals)
  );
  app.previewRuntimeGlobals = null;
  app.previewRuntimeAppliedTick = -1;
  app.previewCanResumeRuntimeState = false;

  const renderAt = (elapsedTick) => {
    app.previewAnimStart = performance.now() - elapsedTick * 50;
    app.updatePreviewAnimation();
    return Array.from(app.pointsGeom.getAttribute('position').array);
  };
  const firstCycle = new Map();
  let tick61RuntimeGlobals = null;
  for (let frame = 0; frame < 440; frame++) {
    firstCycle.set(frame, renderAt(frame / 4));
    if (frame === 244) {
      tick61RuntimeGlobals = JSON.parse(JSON.stringify(app.previewRuntimeGlobals));
    }
  }

  const firstCard4Point = firstCycle.get(244).slice(9, 12);
  assert.ok(
    Math.abs(length(U.v(...firstCard4Point)) - Math.sqrt(136)) <= 1e-5,
    JSON.stringify({ firstCard4Point, runtimeGlobals: tick61RuntimeGlobals })
  );

  const scaleSubframeRadii = [208, 209, 210, 211].map((frame) => (
    length(U.v(...firstCycle.get(frame).slice(9, 12)))
  ));
  for (let i = 1; i < scaleSubframeRadii.length; i++) {
    assert.ok(
      scaleSubframeRadii[i] > scaleSubframeRadii[i - 1] + 1e-6,
      JSON.stringify({ scaleSubframeRadii })
    );
  }

  const cacheHitsBeforeReplay = app.previewRenderCache?.hits || 0;

  for (let frame = 0; frame < 440; frame++) {
    const actual = renderAt(110 + frame / 4);
    const expected = firstCycle.get(frame);
    assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) {
      assert.ok(Math.abs(actual[i] - expected[i]) <= 1e-5, `frame ${frame}, value ${i}`);
    }
  }
  assert.ok((app.previewRenderCache?.hits || 0) > cacheHitsBeforeReplay);
});

test('render cache worker matches live manual scaleHelper frames', () => {
  const cycleCfg = { appear: 16, live: 84, fade: 10, play: 100, total: 110 };
  const liveApp = createNetherStarLaserCardHarness();
  const workerApp = createNetherStarLaserCardHarness();
  const frameTime = workerApp.resolvePreviewFrameTimeContext({
    totalCount: workerApp.previewBasePoints.length,
    elapsedTick: 52.75,
    globalCycleAge: 52.75,
    cycleIndex: 0,
    cycleCfg
  });
  const expected = liveApp.computePreviewFrame({
    totalCount: liveApp.previewBasePoints.length,
    elapsedTick: frameTime.elapsedTick,
    globalCycleAge: frameTime.globalCycleAge,
    cycleIndex: frameTime.cycleIndex,
    cycleCfg,
    outputToGeometry: false
  });
  const snapshot = workerApp.makePreviewRenderWorkerSnapshot(workerApp.previewBasePoints.length, cycleCfg);
  const workerRuntime = new WorkerPreviewRuntime();
  workerRuntime.applySnapshot(snapshot);
  const result = workerRuntime.computeSnapshotFrame({
    totalCount: workerApp.previewBasePoints.length,
    cycleCfg,
    ...frameTime
  });

  assert.ok(result);
  assert.equal(result.positions.length, expected.positions.length);
  for (let i = 0; i < expected.positions.length; i++) {
    assert.ok(
      Math.abs(result.positions[i] - expected.positions[i]) <= 1e-5,
      `position ${i}: ${result.positions[i]} != ${expected.positions[i]}`
    );
  }
});

test('CParticle card fades change preview alpha and repeat identically on automatic replay', () => {
  const app = createRealtimeRelFrameHarness();
  const card = app.state.cards[0];
  card.useCParticle = true;
  card.cparticleAlpha = {
    fadeIn: { enabled: true, durationTicks: 10, fromAlpha: 0, toAlpha: 1 },
    fadeOut: { enabled: true, durationTicks: 10, fromAlpha: 1, toAlpha: 0 }
  };
  app.previewLeafTextureConfigs = [{
    effectClass: '',
    useTexture: false,
    useCParticle: true,
    randomAgePreTick: false
  }];
  const cycleCfg = { appear: 0, live: 90, fade: 10, play: 90, total: 100 };
  const alphaAt = (elapsedTick, globalCycleAge, cycleIndex) => app.computePreviewFrame({
    totalCount: 1,
    elapsedTick,
    globalCycleAge,
    cycleIndex,
    cycleCfg,
    outputToGeometry: false
  }).alphas[0];

  assert.equal(alphaAt(0, 0, 0), 0);
  assert.ok(Math.abs(alphaAt(5, 5, 0) - 0.5) <= 1e-6);
  assert.equal(alphaAt(10, 10, 0), 1);
  assert.ok(Math.abs(alphaAt(95, 95, 0) - 0.5) <= 1e-6);
  assert.ok(Math.abs(alphaAt(105, 5, 1) - 0.5) <= 1e-6);
});

test('CParticle shape fade-in starts when a sequenced card is generated', () => {
  const app = createNetherStarLaserCardHarness();
  const card = app.state.cards.find((item) => item.name === '卡片 4');
  card.useCParticle = true;
  card.cparticleAlpha = {
    fadeIn: { enabled: true, durationTicks: 10, fromAlpha: 0, toAlpha: 1 },
    fadeOut: { enabled: false }
  };
  app.rebuildPreview();

  const card4AlphaAt = (globalCycleAge) => app.computePreviewFrame({
    totalCount: app.previewBasePoints.length,
    elapsedTick: globalCycleAge,
    globalCycleAge,
    cycleIndex: 0,
    cycleCfg: { appear: 0, live: 90, fade: 10, play: 90, total: 100 },
    outputToGeometry: false
  }).alphas[9];

  assert.equal(card4AlphaAt(51), 0);
  assert.ok(card4AlphaAt(52) < 0.2);
  assert.ok(card4AlphaAt(56) > 0.4 && card4AlphaAt(56) < 0.7);
});
