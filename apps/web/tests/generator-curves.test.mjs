import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLifecycleCurveDisplayBounds
} from '../src/modules/generator/curves.js';

function curve(overrides = {}) {
  return {
    mode: 'bezier',
    min: 0,
    max: 2,
    keyframes: [
      { id: 'start', time: 0, value: 1, in: { x: -20, y: -999 }, out: { x: 30, y: 17 } },
      { id: 'end', time: 100, value: 1, in: { x: -30, y: -26 }, out: { x: 20, y: 999 } }
    ],
    ...overrides
  };
}

test('bezier display bounds include only handles used by active segments', () => {
  assert.deepEqual(getLifecycleCurveDisplayBounds(curve()), { min: -25, max: 20 });
});

test('linear display bounds ignore stale bezier handles', () => {
  assert.deepEqual(getLifecycleCurveDisplayBounds(curve({ mode: 'linear' })), { min: 0, max: 2 });
});

test('hard bounds remain a baseline without hiding an overshooting handle', () => {
  assert.deepEqual(
    getLifecycleCurveDisplayBounds(curve(), { hardMin: -1, hardMax: 15 }),
    { min: -25, max: 20 }
  );
});

test('a runaway handle still resolves to finite display coordinates', () => {
  const runaway = curve();
  runaway.keyframes[0].out.y = 1_000_000;
  const bounds = getLifecycleCurveDisplayBounds(runaway, { hardMin: 0, hardMax: 100 });
  const handleValue = runaway.keyframes[0].value + runaway.keyframes[0].out.y;
  const handleY = 180 - ((handleValue - bounds.min) / (bounds.max - bounds.min)) * 180;

  assert.equal(Number.isFinite(bounds.max), true);
  assert.ok(bounds.max >= handleValue);
  assert.ok(handleY >= 0 && handleY <= 180);
});
