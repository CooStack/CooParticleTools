import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('PointsBuilder Vec3 numeric wrappers fit inside each grid column', async () => {
  const css = await read('../public/legacy/assets/points_builder/css/style.css');
  const rule = css.match(/\.pb-vector-input-row\s*>\s*\.cp-number\s*>\s*\.cp-number-native\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /width:\s*100%/);
  assert.match(rule, /flex:\s*1\s+1\s+auto/);
  assert.match(rule, /min-width:\s*0/);
});
