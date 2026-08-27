import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url),
  'utf8'
);

test('Composition Builder redraws after camera controls change outside the animation update', () => {
  assert.match(
    source,
    /this\.controls\.addEventListener\("change", \(\) => \{\s*this\.previewSceneDirty = true;\s*\}\);/
  );

  const animateStart = source.indexOf('const animate = () => {');
  const animateEnd = source.indexOf('    }\n\n    init', animateStart);
  const animateSource = source.slice(animateStart, animateEnd);
  assert.match(animateSource, /this\.controls\.update\(\)/);
  assert.match(animateSource, /this\.previewSceneDirty/);
  assert.match(animateSource, /this\.renderer\.render\(this\.scene, this\.camera\)/);
});

test('Composition preview left-click selection avoids per-point layout and duplicate editor renders', () => {
  assert.match(source, /LEFT:\s*null/);
  assert.match(source, /this\.controls\.enabled = false;/);
  assert.match(source, /canvas\.addEventListener\("pointercancel", \(e\) => this\.onPreviewPointerCancel\(e\), true\)/);
  assert.match(source, /onPreviewPointerCancel\(e\)/);
  assert.match(source, /this\.applySelectBoxRect\(this\.getSelectionRectFromState\(this\.selectState\), this\.selectState\.hostRect\)/);
  const selectionSource = source.match(/pickPreviewPointAtClientPoint\([\s\S]*?selectCardsByClientRect\([\s\S]*?\n    \}/u)?.[0] || '';
  assert.match(selectionSource, /const rect = canvas\?\.getBoundingClientRect\?\.\(\)/);
  assert.match(selectionSource, /const projector = this\.previewPickVector/);
  assert.doesNotMatch(selectionSource, /this\.worldToClient\(point\)/);
  assert.match(source, /hasSelectionStateChanged\(previousIds, previousFocusedCardId\)/);
});
