import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import {
  createPointsBuilderReferenceGuide,
  normalizePointsBuilderState
} from '../public/legacy/assets/points_builder/js/model.js';
import {
  createMeasuredReferenceGuide,
  createMirroredReferenceGuide,
  createReferenceGuideController,
  findReferenceGuideSnapCandidate,
  getReferenceGuideSnapPoints
} from '../public/legacy/assets/points_builder/js/reference-guides.js';

test('reference guide normalization keeps editor-only geometry settings valid', () => {
  const guide = createPointsBuilderReferenceGuide({
    id: 'guide-a',
    axis: 'z',
    mode: 'segment',
    origin: { x: '1.5', y: 'bad', z: 3 },
    start: 5,
    end: -1,
    divisionCount: 0,
    step: 0
  });

  assert.deepEqual(guide, {
    id: 'guide-a',
    name: 'Z 轴参考线',
    axis: 'Z',
    mode: 'segment',
    origin: { x: 1.5, y: 0, z: 3 },
    start: -1,
    end: 5,
    visible: true,
    locked: false,
    snapEnabled: true,
    snapEndpoints: true,
    divisionCount: 1,
    step: 1
  });
});

test('old PointsBuilder projects migrate to an empty guide collection', () => {
  const normalized = normalizePointsBuilderState({
    root: { id: 'root', kind: 'ROOT', children: [] }
  });

  assert.deepEqual(normalized.guides, []);
});

test('segment guides expose endpoints and N interior division points', () => {
  const guide = createPointsBuilderReferenceGuide({
    id: 'guide-segment',
    axis: 'X',
    origin: { x: 1, y: 2, z: 3 },
    start: -2,
    end: 2,
    divisionCount: 1
  });

  assert.deepEqual(
    getReferenceGuideSnapPoints(guide).map((point) => [point.x, point.y, point.z, point.snapType]),
    [
      [-1, 2, 3, 'endpoint'],
      [3, 2, 3, 'endpoint'],
      [1, 2, 3, 'division']
    ]
  );
  assert.deepEqual(
    getReferenceGuideSnapPoints(guide, { includeEndpoints: false })
      .map((point) => [point.x, point.y, point.z, point.snapType]),
    [[1, 2, 3, 'division']]
  );

  guide.snapEndpoints = false;
  guide.start = 0;
  guide.end = 6;
  guide.divisionCount = 2;
  assert.deepEqual(
    getReferenceGuideSnapPoints(guide).map((point) => point.x),
    [3, 5]
  );
});

test('infinite guides snap along their axis using their own step', () => {
  const guide = createPointsBuilderReferenceGuide({
    id: 'guide-line',
    axis: 'X',
    mode: 'line',
    origin: { x: 0, y: 2, z: 3 },
    step: 0.5
  });
  const candidate = findReferenceGuideSnapCandidate(
    [guide],
    { x: 2.74, y: 2, z: 3.08 },
    'XZ',
    0.3,
    { includeEndpoints: false }
  );

  assert.ok(candidate);
  assert.deepEqual(candidate.point, {
    x: 2.5,
    y: 2,
    z: 3,
    snapType: 'step'
  });
});

test('hidden or disabled guides do not participate in snapping', () => {
  const hidden = createPointsBuilderReferenceGuide({ id: 'hidden', visible: false });
  const disabled = createPointsBuilderReferenceGuide({ id: 'disabled', snapEnabled: false });

  assert.equal(findReferenceGuideSnapCandidate([hidden, disabled], { x: 0, y: 0, z: 0 }, 'XZ', 1), null);
});

test('reference endpoint snapping can be disabled without disabling other guide snap points', () => {
  const guide = createPointsBuilderReferenceGuide({
    id: 'guide-endpoint-toggle',
    axis: 'X',
    origin: { x: 0, y: 0, z: 0 },
    start: 0,
    end: 6,
    divisionCount: 1
  });

  assert.equal(
    findReferenceGuideSnapCandidate([guide], { x: 0.05, y: 0, z: 0 }, 'XZ', 0.1)?.point.snapType,
    'endpoint'
  );
  assert.equal(
    findReferenceGuideSnapCandidate(
      [guide],
      { x: 0.05, y: 0, z: 0 },
      'XZ',
      0.1,
      { includeEndpoints: false }
    ),
    null
  );
  assert.equal(
    findReferenceGuideSnapCandidate(
      [guide],
      { x: 3.05, y: 0, z: 0 },
      'XZ',
      0.1,
      { includeEndpoints: false }
    )?.point.snapType,
    'division'
  );
});

test('guides outside the active plane normal range do not snap', () => {
  const guide = createPointsBuilderReferenceGuide({
    id: 'off-plane',
    axis: 'X',
    mode: 'line',
    origin: { x: 0, y: 1000, z: 0 },
    step: 1
  });

  assert.equal(
    findReferenceGuideSnapCandidate([guide], { x: 1.1, y: 0, z: 0 }, 'XZ', 0.5),
    null
  );
});

test('axis measurement creates a segment guide from the confirmed start point', () => {
  const positive = createMeasuredReferenceGuide({
    axis: 'X',
    pointA: { x: 2, y: 3, z: 4 },
    pointB: { x: 7, y: 3, z: 4 },
    signedDistance: 5
  }, { idFactory: () => 'guide-positive' });
  const negative = createMeasuredReferenceGuide({
    axis: 'Z',
    pointA: { x: 2, y: 3, z: 4 },
    pointB: { x: 2, y: 3, z: -2 },
    signedDistance: -6
  }, { idFactory: () => 'guide-negative' });

  assert.deepEqual(
    { id: positive.id, axis: positive.axis, mode: positive.mode, origin: positive.origin, start: positive.start, end: positive.end },
    { id: 'guide-positive', axis: 'X', mode: 'segment', origin: { x: 2, y: 3, z: 4 }, start: 0, end: 5 }
  );
  assert.deepEqual(
    { id: negative.id, axis: negative.axis, mode: negative.mode, origin: negative.origin, start: negative.start, end: negative.end },
    { id: 'guide-negative', axis: 'Z', mode: 'segment', origin: { x: 2, y: 3, z: 4 }, start: -6, end: 0 }
  );
});

test('mirroring a segment guide reflects both its origin and axial range', () => {
  const source = createPointsBuilderReferenceGuide({
    id: 'source-guide',
    name: '定位线',
    axis: 'X',
    origin: { x: 2, y: 3, z: 4 },
    start: -1,
    end: 5
  });
  const mirrored = createMirroredReferenceGuide(source, {
    plane: 'ZY',
    offset: 10,
    idFactory: () => 'mirrored-guide'
  });

  assert.deepEqual(
    { id: mirrored.id, name: mirrored.name, origin: mirrored.origin, start: mirrored.start, end: mirrored.end },
    { id: 'mirrored-guide', name: '定位线 镜像', origin: { x: 18, y: 3, z: 4 }, start: -5, end: 1 }
  );
});

test('measured creation and guide duplication each capture one history entry and select the result', () => {
  const guides = [];
  const history = [];
  let nextId = 0;
  const controller = createReferenceGuideController({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(55, 1, 0.01, 1000),
    controls: { target: new THREE.Vector3() },
    getGuides: () => guides,
    createId: () => `guide-${++nextId}`,
    captureHistory: (label) => history.push(label)
  });

  const measured = controller.addGuideFromMeasurement({
    axis: 'X',
    pointA: { x: 1, y: 2, z: 3 },
    pointB: { x: 5, y: 2, z: 3 },
    signedDistance: 4
  });
  assert.equal(guides.length, 1);
  assert.equal(controller.getSelectedGuideId(), measured.id);
  assert.deepEqual(history, ['add_measured_reference_guide']);
  measured.locked = true;
  assert.equal(controller.setOffsetPreview(measured.id, { x: 1, y: 0, z: 0 }), false);
  measured.locked = false;

  const copied = controller.copyGuide(measured.id);
  assert.equal(guides.length, 2);
  assert.equal(controller.getSelectedGuideId(), copied.id);
  assert.deepEqual(history, ['add_measured_reference_guide', 'copy_reference_guide']);

  const mirrored = controller.mirrorCopyGuide(copied.id, { plane: 'ZY', offset: 8 });
  assert.equal(guides.length, 3);
  assert.equal(controller.getSelectedGuideId(), mirrored.id);
  assert.deepEqual(history, [
    'add_measured_reference_guide',
    'copy_reference_guide',
    'mirror_copy_reference_guide'
  ]);
  controller.dispose();
});

test('guide list stays compact while the selected guide renders its parameters in the right editor', () => {
  const guides = [createPointsBuilderReferenceGuide({
    id: 'guide-ui',
    name: '定位参考线',
    axis: 'Z',
    start: -3,
    end: 5
  })];
  const root = { innerHTML: '', addEventListener() {} };
  const editor = { innerHTML: '', addEventListener() {} };
  const controller = createReferenceGuideController({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(55, 1, 0.01, 1000),
    controls: { target: new THREE.Vector3() },
    root,
    getGuides: () => guides
  });

  controller.selectGuide('guide-ui');
  assert.match(root.innerHTML, /reference-guide-summary/);
  assert.match(root.innerHTML, /线段 · 长度 8/);
  assert.doesNotMatch(root.innerHTML, /data-guide-field=|data-guide-origin=/);
  assert.equal(controller.renderSelectedEditor(editor), true);
  assert.match(editor.innerHTML, /class="reference-guide-editor"/);
  assert.match(editor.innerHTML, /data-guide-field="name"/);
  assert.match(editor.innerHTML, /data-guide-origin="x"/);
  assert.match(editor.innerHTML, /data-guide-field="divisionCount"/);
  controller.dispose();
});

test('deleting the selected guide captures one history entry and clears the selection', () => {
  const guides = [createPointsBuilderReferenceGuide({ id: 'guide-delete', name: '待删除参考线' })];
  const history = [];
  const changes = [];
  const selections = [];
  const controller = createReferenceGuideController({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(55, 1, 0.01, 1000),
    controls: { target: new THREE.Vector3() },
    getGuides: () => guides,
    captureHistory: (label) => history.push(label),
    onChange: (options) => changes.push(options),
    onSelect: (id) => selections.push(id)
  });

  controller.selectGuide('guide-delete');
  assert.equal(controller.deleteSelectedGuide(), true);
  assert.deepEqual(guides, []);
  assert.equal(controller.getSelectedGuideId(), '');
  assert.deepEqual(history, ['delete_reference_guide']);
  assert.deepEqual(changes.at(-1), { guideId: 'guide-delete', deleted: true });
  assert.equal(selections.at(-1), '');
  assert.equal(controller.deleteSelectedGuide(), false);
  assert.deepEqual(history, ['delete_reference_guide']);
  controller.dispose();
});

test('both PointsBuilder entry pages expose the reference guide tab', async () => {
  const [standalone, composition, mainSource, gridSource] = await Promise.all([
    readFile(new URL('../public/legacy/pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/composition_pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/shared/js/adaptive-grid.js', import.meta.url), 'utf8')
  ]);

  for (const source of [standalone, composition]) {
    assert.match(source, /id="btnReferenceGuidesTab"/);
    assert.match(source, /id="referenceGuidesRoot"/);
    assert.match(source, /id="chkSnapReferenceEndpoints"[\s\S]*?吸附参考端点/);
  }
  assert.match(mainSource, /createReferenceGuideController/);
  assert.match(mainSource, /source === "reference_guide"/);
  assert.match(mainSource, /includeEndpoints: !chkSnapReferenceEndpoints \|\| chkSnapReferenceEndpoints\.checked/);
  assert.match(gridSource, /getMetrics: \(\) => \(\{ \.\.\.lastMetrics \}\)/);
});

test('grid hover highlights one cell segment instead of an infinite line', async () => {
  const source = await readFile(
    new URL('../public/legacy/assets/points_builder/js/grid-inspector.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /Math\.floor\(secondValue \/ step\) \* step/);
  assert.match(source, /Math\.floor\(firstValue \/ step\) \* step/);
  assert.match(source, /线段长度/);
  assert.doesNotMatch(source, /const extent =/);
});

test('reference guides are selected directly but moved only through the V offset tool', async () => {
  const [guideSource, mainSource, shortcutSource] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/reference-guides.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main-shortcuts.js', import.meta.url), 'utf8')
  ]);

  assert.match(guideSource, /getSelectedGuideId/);
  assert.match(guideSource, /moveGuideBy\(id, delta\)/);
  assert.doesNotMatch(guideSource, /dragState|dragPlane|setPointerCapture|releasePointerCapture/);
  assert.match(mainSource, /requestedGuideId \? "guide" : "node"/);
  assert.match(mainSource, /moveGuideBy\?\.\(offsetGuideId, worldDelta\)/);
  assert.match(mainSource, /isGuideLocked\?\.\(offsetGuideId\)[\s\S]*?historyCapture\("move_reference_guide"\)/);
  assert.match(mainSource, /options\.guideId === offsetGuideId[\s\S]*?stopOffsetMode\(\)/);
  assert.match(mainSource, /getGuideOrigin\?\.\(offsetGuideId\)[\s\S]*?historyCapture\("move_reference_guide"\)/);
  assert.match(mainSource, /if \(offsetMode\) \{[\s\S]*?armCanvasClickSuppress\(ev\);[\s\S]*?applyOffsetAtPoint\(mapped\);[\s\S]*?return;[\s\S]*?\}/);
  assert.match(shortcutSource, /startOffsetMode\(null, \{ guideId \}\)/);
  assert.match(shortcutSource, /resetOffsetForGuideId\(guideId\)/);
});

test('measured guides and selected-guide duplication are wired into PointsBuilder commands', async () => {
  const [guideSource, mainSource, shortcutSource, distanceToolSource] = await Promise.all([
    readFile(new URL('../public/legacy/assets/points_builder/js/reference-guides.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main-shortcuts.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/src/js/shared/preview-distance-tool.js', import.meta.url), 'utf8')
  ]);

  assert.match(guideSource, /addGuideFromMeasurement/);
  assert.match(guideSource, /copyGuide/);
  assert.match(guideSource, /mirrorCopyGuide/);
  assert.match(guideSource, /renderSelectedEditor/);
  assert.match(guideSource, /deleteSelectedGuide/);
  assert.match(mainSource, /onMeasureConfirmed: commitMeasuredReferenceGuide/);
  assert.match(mainSource, /completeOnConfirm: true/);
  assert.match(mainSource, /copySelectedReferenceGuide/);
  assert.match(mainSource, /mirrorCopySelectedReferenceGuide/);
  assert.match(shortcutSource, /copySelectedReferenceGuide\(\)/);
  assert.match(shortcutSource, /mirrorCopySelectedReferenceGuide\(\)/);
  assert.match(shortcutSource, /guideId[\s\S]*?deleteSelectedReferenceGuide\(\)/);
  assert.match(shortcutSource, /tag === "SELECT"/);
  assert.match(distanceToolSource, /if \(completeOnConfirm\) cancel\(true\)/);
  assert.match(distanceToolSource, /state\.active && ev\?\.button === 0[\s\S]*?stopImmediatePropagation\(\)/);
});
