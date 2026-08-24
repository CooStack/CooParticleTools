import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPointsBuilderNode,
  createPointsBuilderState,
  buildPointsBuilderVariableCompletions,
  normalizePointsBuilderVariables,
  normalizePointsBuilderNodeTree,
  normalizePointsBuilderState
} from '../public/legacy/assets/points_builder/js/model.js';

test('PointsBuilder node creation merges defaults into a complete extensible node', () => {
  const init = {
    label: 'Custom circle',
    params: { r: 5 },
    extensionData: { source: 'preset' }
  };
  const node = createPointsBuilderNode('add_circle', init, {
    idFactory: () => 'circle-id',
    defaultParams: { r: 1, count: 32 }
  });

  assert.deepEqual(node, {
    id: 'circle-id',
    kind: 'add_circle',
    folded: false,
    collapsed: false,
    bodyHeight: null,
    subWidth: null,
    subHeight: null,
    params: { r: 5, count: 32 },
    children: [],
    terms: [],
    label: 'Custom circle',
    extensionData: { source: 'preset' }
  });
  assert.deepEqual(init.params, { r: 5 });
});

test('PointsBuilder node creation can preserve legacy params replacement semantics', () => {
  const node = createPointsBuilderNode('add_circle', { params: { r: 5 } }, {
    idFactory: () => 'legacy-circle-id',
    defaultParams: { r: 1, count: 32 },
    mergeDefaultParams: false
  });

  assert.deepEqual(node.params, { r: 5 });
});

test('PointsBuilder model keeps a new or imported empty root empty', () => {
  const created = createPointsBuilderState();
  const normalized = normalizePointsBuilderState({
    root: { id: 'root', kind: 'ROOT', children: [] }
  });

  assert.deepEqual(created, {
    root: { id: 'root', kind: 'ROOT', children: [] }
  });
  assert.deepEqual(normalized.root.children, []);
});

test('PointsBuilder state normalization can preserve the legacy direct-root guard', () => {
  assert.equal(normalizePointsBuilderState(null, { requireDirectRoot: true }), null);
  assert.equal(normalizePointsBuilderState({
    state: { root: { id: 'root', kind: 'ROOT', children: [] } }
  }, { requireDirectRoot: true }), null);
  assert.deepEqual(normalizePointsBuilderState({
    root: { id: 'root', kind: 'ROOT', children: [] }
  }, { requireDirectRoot: true }), {
    root: { id: 'root', kind: 'ROOT', children: [] }
  });
});

test('PointsBuilder state normalization preserves embedded extension fields', () => {
  const source = {
    state: {
      root: { id: 'root', kind: 'ROOT', children: [] },
      variables: { scalar: { radius: 3 } },
      presets: [{ id: 'preset-a', name: 'Ring' }],
      settings: { pointSize: 0.12 },
      hotkeys: { add: 'KeyA' },
      extensionData: { owner: 'composition' }
    }
  };

  const normalized = normalizePointsBuilderState(source);

  assert.deepEqual(normalized, source.state);
  assert.notEqual(normalized, source.state);
  assert.notEqual(normalized.root, source.state.root);
});

test('PointsBuilder state normalization delegates optional preset and variable policies', () => {
  const normalized = normalizePointsBuilderState({
    root: { children: [] },
    presets: { entries: [{ id: 'preset-a' }] },
    variables: { radius: '3' },
    settings: { keep: true }
  }, {
    normalizePresets: (value) => value.entries,
    normalizeVariables: (value) => ({ scalar: { radius: Number(value.radius) } })
  });

  assert.deepEqual(normalized.presets, [{ id: 'preset-a' }]);
  assert.deepEqual(normalized.variables, { scalar: { radius: 3 } });
  assert.deepEqual(normalized.settings, { keep: true });
});

test('PointsBuilder variable normalization keeps array and legacy scoped definitions for completion', () => {
  const variables = [
      { name: 'radius', type: 'Double', value: 2.5 },
      { name: 'segments', type: 'Int', value: 32 },
      { name: 'origin', type: 'Vec3', value: { x: 1, y: 2, z: 3 } }
  ];
  assert.deepEqual(
    normalizePointsBuilderVariables(variables),
    {
      scalar: { radius: 2.5, segments: 32 },
      vector: { origin: { x: 1, y: 2, z: 3 } }
    }
  );
  assert.deepEqual(
    normalizePointsBuilderVariables({ globals: [{ name: 'legacyRadius', type: 'Double', value: '4.5' }] }),
    { scalar: { legacyRadius: 4.5 }, vector: {} }
  );
  assert.deepEqual(
    normalizePointsBuilderVariables({ globals: { legacySegments: 8 } }),
    { scalar: { legacySegments: 8 }, vector: {} }
  );
  const completions = buildPointsBuilderVariableCompletions(variables);
  assert.deepEqual(completions.numeric.map((item) => item.value), ['radius', 'segments', 'origin.x', 'origin.y', 'origin.z']);
  assert.deepEqual(completions.vectors.map((item) => item.ref), ['origin']);
  assert.deepEqual(buildPointsBuilderVariableCompletions([
    { name: 'color', type: 'Vector3f', value: { x: 1, y: 0, z: 0 } }
  ]).vectors, []);
  assert.deepEqual(normalizePointsBuilderVariables([
    { name: 'metadata', type: 'String', value: { x: 1, y: 2, z: 3 } }
  ]), { scalar: {}, vector: {} });
});

test('PointsBuilder node normalization migrates legacy data without changing execution order', () => {
  const generatedIds = ['nested-node', 'fourier-term-a', 'fourier-term-b'];
  const root = {
    id: 'root',
    kind: 'ROOT',
    children: [
      {
        id: 'duplicate',
        kind: 'with_builder',
        params: {},
        legacyMeta: { keep: true },
        children: [
          { id: 'duplicate', kind: 'add_ball', params: { r: 2, count: 7 } }
        ]
      },
      {
        id: 'fourier',
        kind: 'add_fourier_series',
        params: {},
        terms: [{ id: 'duplicate', r: 2 }, null, { w: 3 }]
      }
    ]
  };

  normalizePointsBuilderNodeTree(root, {
    idFactory: () => generatedIds.shift()
  });

  assert.deepEqual(root.children.map((node) => node.kind), [
    'add_builder',
    'add_fourier_series'
  ]);
  assert.deepEqual(root.children[0].legacyMeta, { keep: true });
  assert.deepEqual(root.children[0].params, { ox: 0, oy: 0, oz: 0 });
  assert.equal(root.children[0].children[0].id, 'nested-node');
  assert.equal(root.children[0].children[0].params.countPow, 7);
  assert.deepEqual(root.children[1].terms.map((term) => term.id), [
    'fourier-term-a',
    'fourier-term-b'
  ]);
  assert.deepEqual(root.children[1].terms.map((term) => [term.r, term.w]), [
    [2, 1],
    [1, 3]
  ]);
});

test('PointsBuilder bezier-curve migration fills missing legacy vector components independently', () => {
  const root = {
    id: 'root',
    kind: 'ROOT',
    children: [{
      id: 'mixed-bezier',
      kind: 'add_bezier_curve',
      params: {
        ex: 10,
        target: { x: 1, y: 2, z: 3 },
        shx: 4,
        startHandle: [11, 5, 6],
        ehy: 8,
        endHandle: { x: 7, y: 12, z: 9 }
      }
    }]
  };

  normalizePointsBuilderNodeTree(root);

  assert.deepEqual(
    Object.fromEntries(['ex', 'ey', 'ez', 'shx', 'shy', 'shz', 'ehx', 'ehy', 'ehz']
      .map((key) => [key, root.children[0].params[key]])),
    {
      ex: 10,
      ey: 2,
      ez: 3,
      shx: 4,
      shy: 5,
      shz: 6,
      ehx: 7,
      ehy: 8,
      ehz: 9
    }
  );
});
