import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompositionPreviewRuntime } from '../src/modules/composition/preview-runtime.js';

function createProject(overrides = {}) {
  return {
    compositionType: 'sequenced',
    compositionAnimates: [],
    cards: [{
      id: 'card-1',
      name: 'GPU card',
      dataType: 'single',
      bindMode: 'point',
      point: { x: 1, y: 0, z: 0 },
      visible: true
    }],
    ...overrides
  };
}

test('modern Composition preview hides all root cards when Sequenced has no growth plan', () => {
  const runtime = createCompositionPreviewRuntime(createProject());

  assert.equal(runtime.getFrame(0).points.length, 0);
  assert.equal(runtime.getFrame(0).activeCards.length, 0);
});

test('modern Composition preview keeps normal Composition immediate emission', () => {
  const runtime = createCompositionPreviewRuntime(createProject({ compositionType: 'particle' }));

  assert.equal(runtime.getFrame(0).points.length, 1);
  assert.equal(runtime.getFrame(0).activeCards.length, 1);
});

test('modern Sequenced preview emits cards only after a root growth entry matches', () => {
  const runtime = createCompositionPreviewRuntime(createProject({
    compositionAnimates: [{ count: 1, condition: 'age >= 2' }]
  }));

  assert.equal(runtime.getFrame(0).points.length, 0);
  assert.equal(runtime.getFrame(2).points.length, 1);
});
