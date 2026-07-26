import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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

installPreviewRuntimeMethods(RotationHarness, {
  U,
  num: (value) => Number(value) || 0,
  int: (value) => Math.trunc(Number(value) || 0),
  clamp: (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max),
  normalizeAlphaHelperConfig: () => ({ type: 'none' }),
  normalizeDisplayAction: (value) => value,
  normalizeScaleHelperConfig: () => ({ type: 'none' }),
  transpileKotlinThisQualifierToJs: (value) => value
});

function assertVectorClose(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual.x - expected.x) <= epsilon, `x: ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= epsilon, `y: ${actual.y} != ${expected.y}`);
  assert.ok(Math.abs(actual.z - expected.z) <= epsilon, `z: ${actual.z} != ${expected.z}`);
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
