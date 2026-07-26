import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const previewSource = readFileSync(
  new URL('../src/modules/preview/three-points-preview.js', import.meta.url),
  'utf8'
);
const canvasSource = readFileSync(
  new URL('../src/components/PreviewCanvas.vue', import.meta.url),
  'utf8'
);
const generatorSource = readFileSync(
  new URL('../src/pages/GeneratorPage.vue', import.meta.url),
  'utf8'
);
const sharedConsumerSources = [
  '../src/components/PointsBuilderWorkspace.vue',
  '../src/components/CompositionPreviewWorkspace.vue',
  '../src/components/CompositionPreviewPanel.vue'
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));
const shaderPreviewSource = readFileSync(
  new URL('../src/components/ShaderPreviewPanel.vue', import.meta.url),
  'utf8'
);

function functionSource(name, nextName) {
  const start = previewSource.indexOf(`  function ${name}(`);
  const end = previewSource.indexOf(`  function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? previewSource.slice(start, end) : '';
}

test('preview render loop follows every animation frame callback', () => {
  const render = functionSource('render', 'resize');
  const activeRender = render.slice(render.indexOf('const interpolationChanged'));

  assert.match(activeRender, /renderer\.render\(scene, camera\)/);
  assert.match(activeRender, /frameId = requestAnimationFrame\(render\)/);
  assert.doesNotMatch(activeRender, /\breturn\b|setTimeout|1000\s*\/\s*60/);
});

test('particle updates never move the preview camera automatically', () => {
  const updatePoints = functionSource('updatePoints', 'updateBufferPoints');
  const updateBufferPoints = functionSource('updateBufferPoints', 'updateBillboardPoints');

  assert.ok(updatePoints);
  assert.ok(updateBufferPoints);
  assert.doesNotMatch(updatePoints, /resetCamera|alignCameraToPoints/);
  assert.doesNotMatch(updateBufferPoints, /resetCamera|alignCameraToPoints/);
});

test('reset uses a fixed pose while alignment frames current particles', () => {
  const resetCamera = functionSource('resetCamera', 'alignCameraToPoints');
  const alignCameraToPoints = functionSource('alignCameraToPoints', 'getCameraFocusBounds');

  assert.match(resetCamera, /camera\.position\.set\(2\.4, 1\.8, 2\.4\)/);
  assert.match(resetCamera, /controls\.target\.set\(0, 0, 0\)/);
  assert.doesNotMatch(resetCamera, /getCameraFocusBounds/);
  assert.match(alignCameraToPoints, /getCameraFocusBounds\(\)/);
  assert.match(alignCameraToPoints, /camera\.position\.copy\(center\)/);
});

test('generator exposes an explicit align camera action', () => {
  assert.match(canvasSource, /function alignCameraToPoints\(\)/);
  assert.match(canvasSource, /threePreview\.value\?\.alignCameraToPoints\(\)/);
  assert.match(canvasSource, /defineExpose\(\{ resetCamera, alignCameraToPoints, toggleFullscreen \}\)/);
  assert.match(generatorSource, /@click="previewCanvasRef\?\.alignCameraToPoints\(\)"[^>]*>对齐画面<\/button>/);
});

test('shared preview consumers retain an explicit align camera action', () => {
  sharedConsumerSources.forEach((source) => {
    assert.match(source, />对齐画面<\/button>/);
    assert.match(source, /\.alignCameraToPoints(?:\?\.)?\(/);
  });
  assert.match(shaderPreviewSource, /function alignCameraToPoints\(\)/);
  assert.match(shaderPreviewSource, /defineExpose\(\{ resetCamera, alignCameraToPoints, toggleFullscreen \}\)/);
});
