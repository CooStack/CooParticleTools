import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  COMPOSITION_STORAGE_KEY,
  createCompositionProject,
  normalizeCompositionNestedLevel,
  normalizeCompositionProject,
  normalizeCompositionShapeNode,
  getCompositionControllerVariableNameError,
  normalizeEmbeddedPointsBuilderState
} from '../public/legacy/assets/composition_builder/js/model.js';
import { normalizePointsBuilderState } from '../public/legacy/assets/points_builder/js/model.js';

const perfProjectUrl = new URL(
  '../public/__perf__/MeteoriteMagicComposition.composition.json',
  import.meta.url
);

function readPerfProject() {
  return JSON.parse(readFileSync(perfProjectUrl, 'utf8'));
}

test('Composition project normalization keeps the perf payload lossless and idempotent', () => {
  const source = readPerfProject();
  source.packageName = 'cn.coostack.compositions';
  source.projectAlpha = { type: 'none', runMode: 'auto', max: 0.8 };
  source.extensionData = { owner: 'perf-characterization' };
  source.cards[0].extensionData = { layer: 'card' };
  source.cards[0].shapeChildren[0].extensionData = { layer: 'shape' };
  const before = structuredClone(source);
  const originalCardOrder = source.cards.map((card) => card.id);

  const normalized = normalizeCompositionProject(source);

  assert.equal(COMPOSITION_STORAGE_KEY, 'cb_state_v1');
  assert.equal(normalized.projectName, source.projectName);
  assert.equal(normalized.packageName, source.packageName);
  assert.equal(normalized.projectScale.type, source.projectScale.type);
  assert.equal(normalized.projectAlpha.max, source.projectAlpha.max);
  assert.deepEqual(normalized.extensionData, source.extensionData);
  assert.deepEqual(normalized.cards[0].extensionData, source.cards[0].extensionData);
  assert.deepEqual(
    normalized.cards[0].shapeChildren[0].extensionData,
    source.cards[0].shapeChildren[0].extensionData
  );
  assert.deepEqual(normalized.cards.map((card) => card.id), originalCardOrder);
  for (const [key, value] of Object.entries(source.cards[0])) {
    if (!key.startsWith('angleOffset')) continue;
    assert.ok(Object.hasOwn(normalized.cards[0], key), `missing angle offset key: ${key}`);
    assert.deepEqual(normalized.cards[0][key], value);
  }
  assert.deepEqual(source, before);
  assert.deepEqual(normalizeCompositionProject(normalized), normalized);
  for (const key of Object.keys(source)) {
    assert.ok(Object.hasOwn(normalized, key), `missing project key: ${key}`);
  }
});

test('Composition embedded builders delegate PointsBuilder migration and extension preservation', () => {
  const source = {
    state: {
      root: {
        id: 'root',
        kind: 'ROOT',
        children: [
          {
            id: 'legacy-builder',
            kind: 'with_builder',
            params: {},
            children: [],
            extensionData: { source: 'composition' }
          }
        ]
      },
      variables: { scalar: { radius: 3 } },
      extensionData: { owner: 'embedded-builder' }
    }
  };
  const before = structuredClone(source);

  const normalized = normalizeEmbeddedPointsBuilderState(source);

  assert.deepEqual(normalized, normalizePointsBuilderState(source));
  assert.equal(normalized.root.children[0].kind, 'add_builder');
  assert.deepEqual(normalized.root.children[0].params, { ox: 0, oy: 0, oz: 0 });
  assert.deepEqual(normalized.root.children[0].extensionData, { source: 'composition' });
  assert.deepEqual(normalized.extensionData, { owner: 'embedded-builder' });
  assert.deepEqual(source, before);
});

test('Composition shape trees round-trip nested shapes and builders without reordering', () => {
  const source = {
    id: 'shape-root',
    name: 'Root shape',
    type: 'particle_shape',
    extensionData: { depth: 0 },
    builderState: { root: { id: 'root', kind: 'ROOT', children: [] } },
    children: [
      {
        id: 'shape-child',
        name: 'Child shape',
        type: 'particle_shape',
        extensionData: { depth: 1 },
        builderState: { root: { id: 'root', kind: 'ROOT', children: [] } },
        children: [
          {
            id: 'shape-leaf',
            name: 'Leaf',
            type: 'single',
            extensionData: { depth: 2 },
            builderState: {
              state: {
                root: {
                  id: 'root',
                  kind: 'ROOT',
                  children: [
                    {
                      id: 'legacy-leaf-builder',
                      kind: 'with_builder',
                      params: {},
                      children: []
                    }
                  ]
                }
              }
            }
          }
        ]
      }
    ]
  };
  const before = structuredClone(source);

  const normalized = normalizeCompositionShapeNode(source);

  assert.deepEqual(
    [normalized.id, normalized.children[0].id, normalized.children[0].children[0].id],
    ['shape-root', 'shape-child', 'shape-leaf']
  );
  assert.deepEqual(normalized.extensionData, { depth: 0 });
  assert.deepEqual(normalized.children[0].extensionData, { depth: 1 });
  assert.deepEqual(normalized.children[0].children[0].extensionData, { depth: 2 });
  assert.equal(
    normalized.children[0].children[0].builderState.root.children[0].kind,
    'add_builder'
  );
  assert.deepEqual(source, before);
  assert.deepEqual(normalizeCompositionShapeNode(normalized), normalized);
});

test('Composition nested levels keep their legacy semantic default name', () => {
  assert.equal(normalizeCompositionNestedLevel({}, 0).name, '嵌套层2');
});

test('Composition projects preserve explicit mappings and migrate legacy files to Mojmap', () => {
  assert.equal(createCompositionProject().mapping, 'yarn');
  assert.equal(normalizeCompositionProject({ mapping: 'yarn' }).mapping, 'yarn');
  assert.equal(normalizeCompositionProject({ mapping: 'mojmap' }).mapping, 'mojmap');
  assert.equal(normalizeCompositionProject({ projectName: 'Legacy', cards: [] }).mapping, 'mojmap');
});

test('Composition strips legacy project auto-save settings', () => {
  const created = createCompositionProject();
  assert.equal(Object.hasOwn(created, 'projectSettings'), false);
  const normalized = normalizeCompositionProject({
    settings: { autoSaveIntervalsMinutes: [30, 1, 1] },
    projectSettings: { autoSaveIntervalsMinutes: [], preserved: true }
  });
  assert.equal(Object.hasOwn(normalized.settings, 'autoSaveIntervalsMinutes'), false);
  assert.equal(Object.hasOwn(normalized.projectSettings, 'autoSaveIntervalsMinutes'), false);
  assert.equal(normalized.projectSettings.preserved, true);
});

test('Composition local variable names reject runtime names, globals, duplicates, and Kotlin keywords', () => {
  const reserved = new Set(['globalSpeed']);
  const existing = new Set(['speed']);
  assert.match(getCompositionControllerVariableNameError('rel'), /运行时保留名/);
  assert.match(getCompositionControllerVariableNameError('shapeRel1'), /运行时保留名/);
  assert.match(getCompositionControllerVariableNameError('globalSpeed', { reservedNames: reserved }), /全局变量或常量/);
  assert.match(getCompositionControllerVariableNameError('speed', { existingNames: existing }), /重复/);
  assert.match(getCompositionControllerVariableNameError('class'), /Kotlin 关键字/);
  assert.match(getCompositionControllerVariableNameError('bad-name'), /字母或下划线/);
});

test('Composition normalizes duplicate parallel card ids so Builder writes cannot alias cards', () => {
  const normalized = normalizeCompositionProject({
    cards: [
      { id: 'parallel-card', name: '卡片 1' },
      { id: 'parallel-card', name: '卡片 2' },
      { id: 'parallel-card', name: '卡片 3' }
    ]
  }, { idFactory: (() => {
    let index = 0;
    return () => `generated-card-${++index}`;
  })() });

  assert.deepEqual(normalized.cards.map((card) => card.id), [
    'parallel-card',
    'generated-card-1',
    'generated-card-2'
  ]);
  assert.equal(new Set(normalized.cards.map((card) => card.id)).size, 3);
});
