import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { numericScrubValue } from '../public/legacy/assets/shared/js/custom-select.js';

const customSelectSource = readFileSync(
  new URL('../public/legacy/assets/shared/js/custom-select.js', import.meta.url),
  'utf8'
);

function input({ step = '', min = '', max = '', cpNumberStep = '' } = {}) {
  return {
    step,
    min,
    max,
    dataset: cpNumberStep ? { cpNumberStep } : {},
  };
}

test('numeric scrubbing ignores empty min/max attributes', () => {
  assert.equal(numericScrubValue(0, 10, input({ step: '1' })), 10);
  assert.equal(numericScrubValue(0, 10, input({ step: 'any' })), 0.1);
  assert.equal(numericScrubValue(0, -10, input({ step: '1' })), -10);
});

test('numeric scrubbing still applies explicit bounds', () => {
  const bounded = input({ step: '1', min: '0', max: '10' });
  assert.equal(numericScrubValue(5, 20, bounded), 10);
  assert.equal(numericScrubValue(5, -20, bounded), 0);
});

test('custom selects rebind cloned controls instead of exposing the native select', () => {
  assert.ok(customSelectSource.includes("if (instances.has(select)) return null;"));
  assert.ok(customSelectSource.includes("const staleRoot = select.closest('.cp-select');"));
  assert.ok(customSelectSource.includes('staleRoot.replaceWith(select)'));
  assert.ok(customSelectSource.includes("select.removeAttribute('data-cp-select')"));
  assert.ok(customSelectSource.includes("const hasLiveInstance = [...liveNumericInstances].some((item) => item.input === input);"));
  assert.ok(customSelectSource.includes("input.removeAttribute('data-cp-number')"));
});

test('custom selects do not rebuild an open popup for unchanged option attributes', () => {
  assert.ok(customSelectSource.includes('const modelChanged = !sameModel(rows, nextRows);'));
  assert.ok(customSelectSource.includes('modelChanged || valueChanged || labelChanged || disabledChanged'));
  assert.ok(customSelectSource.includes('instances.get(select)?.syncState();'));
  assert.ok(!customSelectSource.includes('instances.get(select)?.render();'));
});
