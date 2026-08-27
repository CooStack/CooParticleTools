import assert from 'node:assert/strict';
import test from 'node:test';
import { numericScrubValue } from '../public/legacy/assets/shared/js/custom-select.js';

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
