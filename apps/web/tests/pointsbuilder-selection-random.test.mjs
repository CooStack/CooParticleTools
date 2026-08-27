import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCardVisibleForBoxSelection,
  mergeBezierNodeSelectionMaps,
  resolveBezierBoxSelectionLevel,
  selectionRectIntersects,
  shouldUseFocusedPointColor
} from '../public/legacy/assets/points_builder/js/card-selection.js';
import {
  getRandomPresetGroupOptions,
  pickRandomPresetIdsForGroup
} from '../public/legacy/assets/points_builder/js/preset-random.js';

function fakeElement(classes = [], parentElement = null, options = {}) {
  const values = new Set(classes);
  return {
    parentElement,
    hidden: Boolean(options.hidden),
    classList: { contains: (name) => values.has(name) },
  };
}

test('PointsBuilder box selection excludes cards inside a collapsed group', () => {
  const root = fakeElement(['cards-root']);
  const visibleTree = fakeElement(['pb-tree-children'], root);
  const collapsedTree = fakeElement(['pb-tree-children', 'collapsed'], root);
  const visibleCard = fakeElement(['card'], visibleTree);
  const collapsedCard = fakeElement(['card'], collapsedTree);

  assert.equal(isCardVisibleForBoxSelection(visibleCard, root), true);
  assert.equal(isCardVisibleForBoxSelection(collapsedCard, root), false);
  assert.equal(shouldUseFocusedPointColor('card-a', new Set()), false);
  assert.equal(shouldUseFocusedPointColor('card-a', new Set(['card-a'])), true);
  assert.equal(selectionRectIntersects(
    { left: 0, top: 0, right: 100, bottom: 100 },
    { left: 25, top: 25, right: 75, bottom: 75, width: 50, height: 50 }
  ), true);
});

test('PointsBuilder random preset groups choose each slot independently', () => {
  const presets = [
    { id: 'a', group: 'Group A' },
    { id: 'b', group: 'Group A' },
    { id: 'nested', group: 'Group A/Child' },
    { id: 'other', group: 'Group B' },
  ];
  const randomValues = [0, 0.99, 0.49, 0.51];
  let index = 0;

  assert.deepEqual(getRandomPresetGroupOptions(presets), ['Group A', 'Group A/Child', 'Group B']);
  assert.deepEqual(
    pickRandomPresetIdsForGroup(presets, 'Group A', 4, () => randomValues[index++]),
    ['a', 'b', 'a', 'b']
  );
  assert.deepEqual(pickRandomPresetIdsForGroup(presets, 'Missing', 2), []);
});

test('Bezier box selection switches between card and node levels by owner coverage', () => {
  const nodes = new Map([
    ['bezier-a', new Set([0, 2])],
    ['bezier-b', new Set([1])],
  ]);

  assert.equal(resolveBezierBoxSelectionLevel([], nodes), 'nodes');
  assert.equal(resolveBezierBoxSelectionLevel(['bezier-a', 'bezier-b'], nodes), 'nodes');
  assert.equal(resolveBezierBoxSelectionLevel(['bezier-a', 'regular-card'], nodes), 'cards');
  assert.equal(resolveBezierBoxSelectionLevel(['regular-card'], new Map()), 'cards');
});

test('Bezier node selection merges across cards and toggles additive hits', () => {
  const current = new Map([
    ['bezier-a', new Set([0, 1])],
    ['bezier-b', new Set([2])],
  ]);
  const incoming = new Map([
    ['bezier-a', new Set([1, 3])],
    ['bezier-c', new Set([4])],
  ]);

  assert.deepEqual(
    Array.from(mergeBezierNodeSelectionMaps(current, incoming, true), ([owner, indices]) => [owner, [...indices]]),
    [['bezier-a', [0, 3]], ['bezier-b', [2]], ['bezier-c', [4]]]
  );
  assert.deepEqual(
    Array.from(mergeBezierNodeSelectionMaps(current, incoming, false), ([owner, indices]) => [owner, [...indices]]),
    [['bezier-a', [1, 3]], ['bezier-c', [4]]]
  );
});
