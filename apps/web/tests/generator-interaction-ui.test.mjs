import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const curveSource = readFileSync(
  new URL('../src/components/LifecycleCurveEditor.vue', import.meta.url),
  'utf8'
);
const pageSource = readFileSync(
  new URL('../src/pages/GeneratorPage.vue', import.meta.url),
  'utf8'
);

test('curve drag renders a local draft and commits keyframes once on release', () => {
  const dragUpdateStart = curveSource.indexOf('function updateDraggedFrame(');
  const dragUpdateEnd = curveSource.indexOf('function stopPointDrag(', dragUpdateStart);
  const dragUpdate = dragUpdateStart >= 0 && dragUpdateEnd > dragUpdateStart
    ? curveSource.slice(dragUpdateStart, dragUpdateEnd)
    : '';
  assert.match(curveSource, /const activeCurve = computed\(\(\) => dragCurve\.value \|\| props\.curve\)/);
  assert.match(dragUpdate, /const frame = activeCurve\.value\.keyframes\.find/);
  assert.match(curveSource, /props\.curve\.keyframes = getSortedKeyframes\(dragCurve\.value\)\.map/);
  assert.doesNotMatch(dragUpdate, /props\.curve\.keyframes\.find/);
  assert.match(curveSource, /function startHandleDrag\(id, role, event\) \{[\s\S]*?event\.preventDefault\(\);/);
  assert.match(curveSource, /pointerId !== null && event\.pointerId !== dragging\.value\.pointerId/);
  assert.match(curveSource, /function cancelPointDrag\(event\) \{[\s\S]*?commitCurveDrag\(\);[\s\S]*?commitDisplayRange\(\);/);
  assert.match(curveSource, /window\.addEventListener\('pointercancel', stopWindowDrag\)/);
  assert.match(curveSource, /window\.removeEventListener\('pointerup', stopWindowDrag\)/);
  assert.match(curveSource, /window\.addEventListener\('blur', stopWindowDrag\)/);
  assert.match(curveSource, /touch-action: none/);
});

test('curve view exposes editable two-decimal bounds and a resizable expanded surface', () => {
  assert.match(curveSource, /aria-label="显示上限"/);
  assert.match(curveSource, /aria-label="显示下限"/);
  assert.match(curveSource, /const displayMinText = computed\(\(\) => Number\(displayMin\.value\)\.toFixed\(2\)\)/);
  assert.match(curveSource, /const displayMaxText = computed\(\(\) => Number\(displayMax\.value\)\.toFixed\(2\)\)/);
  assert.match(curveSource, /\.curve-stage > \.curve-range-input \{/);
  assert.match(curveSource, /background: transparent !important/);
  assert.match(curveSource, /\.curve-stage > \.curve-range-input:focus \{/);
  assert.match(curveSource, /resize: vertical/);
  assert.match(curveSource, /content-visibility: auto/);
});

test('generator color picker and numeric scrub defer project writes until commit', () => {
  assert.match(pageSource, /onInput: \(event\) => updateColorDraft\(event\.target\.value\)/);
  assert.match(pageSource, /onChange: \(event\) => commitColorDraft\(event\.target\.value\)/);
  assert.match(pageSource, /emit\('update:modelValue', scrubState\.lastValue\)/);
  assert.match(pageSource, /emit\('commit', state\.lastValue\)/);
  assert.match(pageSource, /&& !getBinding\(card, path\)/);
});
