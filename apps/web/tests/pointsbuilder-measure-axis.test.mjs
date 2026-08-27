import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createNodeHelpers } from '../public/legacy/assets/points_builder/js/nodes.js';
import {
  computeAxisMeasureResult,
  constrainMeasurePoint,
  resolveNearestMeasureAxis
} from '../public/legacy/assets/src/js/shared/preview-distance-tool.js';

test('axis measurement chooses only the nearest axis allowed by the active plane', () => {
  const anchor = { x: 1, y: 4, z: 2 };
  const raw = { x: 3, y: 100, z: 8 };

  assert.equal(resolveNearestMeasureAxis(anchor, raw, ['X', 'Z']), 'Z');
  assert.deepEqual(constrainMeasurePoint(anchor, raw, 'Z'), {
    x: 1,
    y: 4,
    z: 8,
    label: ''
  });
});

test('axis measurement reports signed direction and length', () => {
  const result = computeAxisMeasureResult(
    { x: 4, y: 0, z: 0 },
    { x: -2, y: 0, z: 0 },
    'X'
  );

  assert.equal(result.axis, 'X');
  assert.equal(result.direction, '-X');
  assert.equal(result.signedDistance, -6);
  assert.equal(result.distance, 6);
});

test('measured midpoint mirror maps the first point onto the confirmed second point', () => {
  const { mirrorCopyNode } = createNodeHelpers({ uid: () => 'copy-id' });
  const source = {
    id: 'source-id',
    kind: 'add_point',
    params: { x: 1, y: 2, z: 3 },
    children: [],
    terms: []
  };

  const mirrored = mirrorCopyNode(source, { plane: 'ZY', offset: 3 });
  assert.equal(mirrored.params.x, 5);
  assert.equal(mirrored.params.y, 2);
  assert.equal(mirrored.params.z, 3);
});

test('offset mirror is applied once across nested local builder coordinates', () => {
  let nextId = 0;
  const { mirrorCopyNode } = createNodeHelpers({ uid: () => `copy-${++nextId}` });
  const source = {
    id: 'builder',
    kind: 'add_builder',
    params: { ox: 1, oy: 0, oz: 0 },
    terms: [],
    children: [{
      id: 'point',
      kind: 'add_point',
      params: { x: 2, y: 0, z: 0 },
      children: [],
      terms: []
    }]
  };

  const mirrored = mirrorCopyNode(source, { plane: 'ZY', offset: 5 });
  assert.equal(mirrored.params.ox + mirrored.children[0].params.x, 7);
});

test('PointsBuilder wires M measurement axes, guide creation, and midpoint mirror state', async () => {
  const source = await readFile(
    new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /getAllowedAxes: \(\) => Array\.from\(getPlaneInfo\(\)\.axis\)/);
  assert.match(source, /onMeasureConfirmed: commitMeasuredReferenceGuide/);
  assert.match(source, /addGuideFromMeasurement\?\.\(result\)/);
  assert.match(source, /completeOnConfirm: true/);
  assert.match(source, /mirrorPlaneOffset/);
  assert.match(source, /offset = \(num\(result\.pointA\[key\]\) \+ num\(result\.pointB\[key\]\)\) \* 0\.5/);
});
