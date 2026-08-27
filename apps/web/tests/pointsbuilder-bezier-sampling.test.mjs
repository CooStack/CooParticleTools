import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCubicBezier,
  generateEquidistantBezierCurveNodes
} from '../src/modules/pointsbuilder/geometry.js';
import { sampleAdaptiveBezierNodes } from '../public/legacy/assets/points_builder/js/bezier-sampling.js?v=20260826_1';

const start = { x: 0, y: 0, z: 0 };
const end = { x: 10, y: 0, z: 0 };

test('Bezier sampling keeps direct count 1/2 endpoint behavior', () => {
  const nodes = [
    { x: 0, y: 0, z: 0, shx: 0, shy: 8, shz: 0 },
    { x: 10, y: 0, z: 0, ehx: 0, ehy: -8, ehz: 0 }
  ];
  assert.deepEqual(generateEquidistantBezierCurveNodes(nodes, 1), [start]);
  assert.deepEqual(generateEquidistantBezierCurveNodes(nodes, 2), [start, end]);
  assert.deepEqual(buildCubicBezier(start, { x: 0, y: 8, z: 0 }, { x: 10, y: -8, z: 0 }, end, 2), [start, end]);
});

test('Bezier sampling uses adaptive subdivision and preserves exact endpoints', () => {
  const points = buildCubicBezier(
    start,
    { x: 0, y: 20, z: 0 },
    { x: 10, y: 20, z: 0 },
    end,
    17
  );
  assert.equal(points.length, 17);
  assert.deepEqual(points[0], start);
  assert.deepEqual(points.at(-1), end);
  assert.ok(points.some((point) => point.y > 10), 'curved control polygon should influence samples');
});

test('multi-segment sampling reuses unchanged segment cache entries', () => {
  const cache = new Map();
  const nodes = [
    { x: 0, y: 0, z: 0, shx: 2, shy: 4, shz: 0 },
    { x: 10, y: 0, z: 0, ehx: -2, ehy: 4, ehz: 0, shx: 2, shy: -4, shz: 0 },
    { x: 20, y: 0, z: 0, ehx: -2, ehy: -4, ehz: 0 }
  ];
  generateEquidistantBezierCurveNodes(nodes, 32, { cache });
  assert.equal(cache.size, 2);
  const firstEntry = [...cache.values()][0];
  const changed = nodes.map((node) => ({ ...node }));
  changed[1] = { ...changed[1], x: 11 };
  generateEquidistantBezierCurveNodes(changed, 32, { cache });
  assert.equal(cache.size, 4);
  assert.ok([...cache.values()].includes(firstEntry), 'unchanged segment entry should remain cached');
});

test('legacy editor cache stores numeric samples and cumulative arc lengths', () => {
  const cache = new Map();
  sampleAdaptiveBezierNodes([
    { x: 0, y: 0, z: 0, shx: 0, shy: 10, shz: 0 },
    { x: 10, y: 0, z: 0, ehx: 0, ehy: -10, ehz: 0 }
  ], 12, { cache, maxSamples: 64 });
  const entry = [...cache.values()][0];
  assert.ok(Array.isArray(entry.samples));
  assert.ok(entry.samples.every((sample) => Array.isArray(sample) && sample.length === 3));
  assert.ok(Array.isArray(entry.cumulative));
  assert.ok(entry.cumulative.every((value, index) => index === 0 || value >= entry.cumulative[index - 1]));
  assert.ok(entry.samples.length <= 64);
});
