import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainUrl = new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url);

function functionBody(text, name, nextName) {
  const start = text.indexOf(`function ${name}(`);
  const end = text.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should follow ${name}`);
  return text.slice(start, end);
}

test('mask cards participate in offset mode through their origin and preview geometry', async () => {
  const text = await readFile(mainUrl, 'utf8');
  const center = functionBody(text, 'getNodeSegmentCenter', 'buildAxisFromParams');
  const apply = functionBody(text, 'applyOffsetDeltaToNode', 'convertBezierCurveEndOnlyToStartEnd');
  const preview = functionBody(text, 'updateOffsetPreview', 'resetPointPickPreviewFrameState');

  assert.match(center, /lastMaskPreviewPoints/);
  assert.match(center, /clear_as_ball_mask/);
  assert.match(center, /clear_as_round_xz_mask/);
  assert.match(text, /NATIVE_OFFSET_TARGET_KINDS[\s\S]*?clear_as_ball_mask/);
  assert.match(text, /NATIVE_OFFSET_TARGET_KINDS[\s\S]*?clear_as_round_xz_mask/);
  assert.match(preview, /lastMaskPreviewPoints/);
  assert.match(preview, /targetSet\.has\(point\.nodeId\)/);
});
