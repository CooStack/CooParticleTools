import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import { evaluatePointsProject } from '../src/modules/pointsbuilder/evaluator.js';
import { builderFormatters, generatePointsBuilderKotlin } from '../src/modules/pointsbuilder/codegen.js';
import { normalizePointsBuilderProject } from '../src/modules/pointsbuilder/defaults.js';
import { applyNoiseOffset, buildFourierSeries } from '../src/modules/pointsbuilder/geometry.js';
import {
  expressionValueTypeForRow,
  filterExpressionSuggestionsByType,
  filterVectorSuggestionsByType
} from '../public/legacy/assets/points_builder/js/cards.js';
import {
  createGeneratorPointsBuilderVariableContext,
  createGeneratorPointsBuilderSnapshot,
  matchesGeneratorPointsBuilderContext,
  mergeGeneratorPointsBuilderSnapshot,
  shouldReuseGeneratorPointsBuilderDraft
} from '../src/modules/generator/pointsbuilder-bridge.js';

test('generator bridge maps valid variables and constants into the legacy context', () => {
  const context = createGeneratorPointsBuilderVariableContext({
    variables: [
      { name: 'radius', type: 'Double', value: 2.5 },
      { name: 'origin', type: 'Vec3', value: 'Vec3(1.0, 2.0, 3.0)' },
      { name: '2invalid', type: 'Int', value: 4 }
    ],
    constants: [{ name: 'segments', type: 'Int', value: 32 }]
  });

  assert.deepEqual(context.globalVars.map((item) => [item.name, item.type]), [
    ['radius', 'Double'],
    ['origin', 'Vec3']
  ]);
  assert.deepEqual(context.globalConsts.map((item) => [item.name, item.type]), [['segments', 'Int']]);
  assert.equal(context.numericMap.radius, 2.5);
  assert.equal(context.numericMap.segments, 32);
  assert.equal(context.numericMap['2invalid'], undefined);
});

test('generator bridge keeps first variable semantics for duplicate context names', () => {
  const context = createGeneratorPointsBuilderVariableContext({
    variables: [
      { name: 'shared', type: 'String', value: 'first' },
      { name: 'shared', type: 'Double', value: 2 }
    ],
    constants: [
      { name: 'shared', type: 'Int', value: 3 },
      { name: 'radius', type: 'Double', value: 4 },
      { name: 'radius', type: 'Double', value: 5 }
    ]
  });

  assert.deepEqual(context.globalVars.map((item) => [item.name, item.type]), [['shared', 'String']]);
  assert.deepEqual(context.globalConsts.map((item) => [item.name, item.value]), [['radius', '4']]);
  assert.equal(context.numericMap.shared, undefined);
  assert.equal(context.numericMap.radius, 4);
});

test('PointsBuilder preview keeps first parameter semantics for duplicate names', () => {
  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [{
          id: 'duplicate-preview-name',
          kind: 'add_circle',
          params: { r: 'shared', count: 3 }
        }]
      }
    }
  });
  const points = evaluatePointsProject(project, {
    parameters: {
      variables: [
        { name: 'shared', type: 'Double', value: 2 },
        { name: 'shared', type: 'Double', value: 5 }
      ]
    }
  });

  assert.ok(Math.abs(Math.hypot(points[0].x, points[0].z) - 2) < 1e-9);
});

test('legacy PointsBuilder completion filters exact scalar target types', () => {
  const suggestions = [
    { value: 'segments', type: 'Int' },
    { value: 'radius', type: 'Double' },
    { value: 'origin.x', type: 'Double' }
  ];
  assert.deepEqual(
    filterExpressionSuggestionsByType(suggestions, 'Int').map((item) => item.value),
    ['segments']
  );
  assert.deepEqual(
    filterExpressionSuggestionsByType(suggestions, 'Double').map((item) => item.value),
    ['radius', 'origin.x']
  );
});

test('legacy PointsBuilder fields map to their exact scalar types', () => {
  assert.equal(expressionValueTypeForRow('count'), 'Int');
  assert.equal(expressionValueTypeForRow('countPow'), 'Int');
  assert.equal(expressionValueTypeForRow('seed值'), 'Long');
  assert.equal(expressionValueTypeForRow('radius'), 'Double');
  assert.equal(expressionValueTypeForRow('sampler'), 'Double');
});

test('legacy PointsBuilder whole-vector completion excludes color vectors', () => {
  const suggestions = [
    { ref: 'vec', type: 'Vec3' },
    { ref: 'relative', type: 'RelativeLocation' },
    { ref: 'color', type: 'Vector3f' }
  ];
  assert.deepEqual(
    filterVectorSuggestionsByType(suggestions).map((item) => item.ref),
    ['vec', 'relative']
  );
});

test('PointsBuilder preview resolves generator defaults without replacing stored expressions', () => {
  const project = createGeneratorProject({
    parameters: {
      variables: [{ name: 'radius', type: 'Double', value: 3 }],
      constants: [{ name: 'segments', type: 'Int', value: 8 }]
    }
  });
  const builderState = project.emitters[0].emitter.builderState;
  builderState.state.root.children = [{
    id: 'circle-with-bindings',
    kind: 'add_circle',
    params: { r: 'radius', count: 'segments', enabled: 'false' },
    children: [],
    terms: []
  }];

  const points = evaluatePointsProject(builderState, { parameters: project.parameters });
  assert.equal(points.length, 8);
  assert.ok(Math.abs(Math.hypot(points[0].x, points[0].z) - 3) < 1e-9);
  assert.equal(builderState.state.root.children[0].params.r, 'radius');
  assert.equal(builderState.state.root.children[0].params.count, 'segments');
  assert.equal(builderState.state.root.children[0].params.enabled, 'false');

  project.emitters[0].emitter.type = 'points_builder';
  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /\.addCircle\(radius, \(segments\)\.toInt\(\)/);
  assert.doesNotMatch(kotlin, /\.addCircle\(3(?:\.0)?, 8\)/);
});

test('PointsBuilder preview and Kotlin preserve compatible function expressions', () => {
  const project = createGeneratorProject({
    parameters: {
      variables: [{ name: 'radius', type: 'Double', value: 3 }],
      constants: [{ name: 'segments', type: 'Int', value: 8 }]
    }
  });
  const card = project.emitters[0];
  card.emitter.type = 'points_builder';
  card.emitter.builderState.state.root.children = [{
    id: 'circle-with-functions',
    kind: 'add_circle',
    params: {
      r: 'Math.max(radius, 4)',
      count: 'Math.max(segments, 12)'
    },
    children: [],
    terms: []
  }];

  const points = evaluatePointsProject(card.emitter.builderState, { parameters: project.parameters });
  assert.equal(points.length, 12);
  assert.ok(Math.abs(Math.hypot(points[0].x, points[0].z) - 4) < 1e-9);

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /\.addCircle\(Math\.max\(radius, 4\.0\), \(Math\.max\(segments, 12\)\)\.toInt\(\)\.coerceAtLeast\(3\)\)/);
});

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('generator PointsBuilder route reuses the standard PointsBuilder page', () => {
  const pageSource = read('../src/pages/GeneratorPointsBuilderPage.vue');
  const pointsBuilderHtml = read('../public/legacy/pointsbuilder.html');
  const pointsBuilderEntry = read('../public/legacy/assets/src/js/pages/pointsbuilder.page.js');
  const legacyGenerator = read('../public/legacy/assets/emitter_generator/js/generate.js');

  assert.match(pageSource, /page="pointsbuilder\.html"/);
  assert.match(pageSource, /:manage-project="false"/);
  assert.doesNotMatch(pageSource, /PointsBuilderWorkspace/);
  assert.match(pointsBuilderHtml, /id="btnPointsBuilderHome"/);
  assert.match(pointsBuilderHtml, /id="btnPointsBuilderEmitterReturn"/);
  assert.match(pointsBuilderEntry, /pointsBuilderContext/);
  assert.match(pointsBuilderEntry, /emitter-pointsbuilder-bootstrap\.page\.js/);
  assert.match(legacyGenerator, /window\.location\.href = `\.\/pointsbuilder\.html/);
  assert.doesNotMatch(legacyGenerator, /assets\/emitter_generator\/pointsbuilder\.html/);
  assert.match(
    pageSource,
    /localStorage\.setItem\(\s*GENERATOR_POINTS_BUILDER_VARIABLE_CONTEXT_KEY,[\s\S]*?if \(shouldReuseGeneratorPointsBuilderDraft/
  );
  assert.equal(
    existsSync(new URL('../public/legacy/assets/emitter_generator/pointsbuilder.html', import.meta.url)),
    false
  );
});

test('generator bridge round-trips legacy PointsBuilder state without losing project metadata', () => {
  const project = createGeneratorProject();
  const builderState = project.emitters[0].emitter.builderState;
  const snapshot = createGeneratorPointsBuilderSnapshot(builderState);
  snapshot.state.root.children[0].params.r = 7;
  snapshot.state.variables = {
    globals: [{ name: 'radius', type: 'Double', value: '7.0' }]
  };

  const merged = mergeGeneratorPointsBuilderSnapshot(
    builderState,
    { state: snapshot.state, ts: Date.now() },
    { projectName: 'EmitterShape', kotlinEndMode: 'clone' }
  );

  assert.equal(merged.name, 'EmitterShape');
  assert.equal(merged.kotlinEndMode, 'clone');
  assert.equal(merged.state.root.children[0].params.r, 7);
  assert.deepEqual(merged.state.variables, snapshot.state.variables);
  assert.equal(merged.tool, 'generator-pointsbuilder');
});

test('generator bridge preserves legacy-only PointsBuilder nodes and nested metadata', () => {
  const project = createGeneratorProject();
  const builderState = project.emitters[0].emitter.builderState;
  const snapshot = createGeneratorPointsBuilderSnapshot(builderState);
  snapshot.state.root.children = [
    {
      id: 'legacy-ball',
      kind: 'add_ball',
      label: '球面',
      params: { r: 'radius', countPow: 'segments', ox: 1, oy: 2, oz: 3 },
      children: [],
      terms: [],
      legacyMeta: { keep: true }
    },
    {
      id: 'known-container',
      kind: 'add_builder',
      label: '保留的组名',
      params: { ox: 0, oy: 0, oz: 0 },
      children: [{
        id: 'legacy-round-shape',
        kind: 'add_round_shape',
        params: { r: 3, step: 0.25, mode: 'range', minCircleCount: 20, maxCircleCount: 80 },
        children: [],
        terms: []
      }],
      terms: []
    }
  ];

  const merged = mergeGeneratorPointsBuilderSnapshot(builderState, { state: snapshot.state });
  const [ball, container] = merged.state.root.children;
  assert.equal(ball.kind, 'add_ball');
  assert.deepEqual(ball.params, snapshot.state.root.children[0].params);
  assert.deepEqual(ball.legacyMeta, { keep: true });
  assert.equal(container.label, '保留的组名');
  assert.equal(container.children[0].kind, 'add_round_shape');
  assert.deepEqual(
    Object.fromEntries(Object.keys(snapshot.state.root.children[1].children[0].params)
      .map((key) => [key, container.children[0].params[key]])),
    snapshot.state.root.children[1].children[0].params
  );
});

test('legacy-only PointsBuilder shapes participate in Generator preview and Kotlin output', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emitter.type = 'points_builder';
  card.emitter.builderState.state.root.children = [
    {
      id: 'legacy-ball',
      kind: 'add_ball',
      params: { r: 2, countPow: 4, ox: 1, oy: 0, oz: 0 },
      children: [],
      terms: []
    },
    {
      id: 'legacy-round',
      kind: 'add_round_shape',
      params: { r: 2, step: 1, mode: 'fixed', preCircleCount: 8, ox: 0, oy: 0, oz: 0 },
      children: [],
      terms: []
    }
  ];

  const points = evaluatePointsProject(card.emitter.builderState);
  assert.equal(points.length, 24);
  assert.ok(points.some((point) => Math.abs(point.x - 1) > 1e-6));

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /\.addBall\(RelativeLocation\(1\.0, 0\.0, 0\.0\), 2\.0, 4\)/);
  assert.match(kotlin, /\.addRoundShape\(2\.0, 1\.0, 8\)/);
});

test('legacy-only PointsBuilder transforms and masks preserve execution order', () => {
  const project = createGeneratorProject();
  const builderState = project.emitters[0].emitter.builderState;
  builderState.state.root.children = [
    { id: 'inside', kind: 'add_point', params: { x: 0, y: 0, z: 0 }, children: [], terms: [] },
    { id: 'outside', kind: 'add_point', params: { x: 3, y: 0, z: 0 }, children: [], terms: [] },
    { id: 'mask', kind: 'clear_as_ball_mask', params: { ox: 0, oy: 0, oz: 0, radius: 1 }, children: [], terms: [] },
    { id: 'scale', kind: 'scale', params: { factor: 2 }, children: [], terms: [] },
    {
      id: 'join-mask',
      kind: 'clear_as_mask',
      params: { maskRange: 0.5 },
      children: [{ id: 'mask-point', kind: 'add_point', params: { x: 6, y: 0, z: 0 }, children: [], terms: [] }],
      terms: []
    }
  ];

  const points = evaluatePointsProject(builderState);
  assert.deepEqual(points.map((point) => [point.x, point.y, point.z]), [[6, 0, 0]]);
  const kotlin = generateEmitterKotlin({ ...project, emitters: [{ ...project.emitters[0], emitter: { ...project.emitters[0].emitter, type: 'points_builder' } }] });
  assert.match(kotlin, /\.clearAsBallMask\(RelativeLocation\(0\.0, 0\.0, 0\.0\), 1\.0\)/);
  assert.match(kotlin, /\.scale\(2\)/);
  assert.match(kotlin, /\.clearAsMaskAndJoin\(/);
});

test('legacy addBall editor writes the countPow parameter used by preview and Kotlin', () => {
  const source = read('../public/legacy/assets/points_builder/js/cards.js');
  const editor = source.match(/case "add_ball":[\s\S]*?break;/)?.[0] || '';
  assert.match(editor, /inputNum\(p\.countPow/);
  assert.match(editor, /p\.countPow = v/);
  assert.doesNotMatch(editor, /p\.discrete/);
});

test('PointsBuilder migrates legacy ball and round-shape parameter names', () => {
  const normalized = normalizePointsBuilderProject({
    state: {
      root: {
        children: [
          { id: 'old-ball', kind: 'add_ball', params: { r: 2, count: 7 } },
          {
            id: 'old-round',
            kind: 'add_round_shape',
            params: { r: 3, step: 0.5, mode: 'range', circleCount: 33, minCount: 11, maxCount: 55 }
          }
        ]
      }
    }
  });
  const [ball, round] = normalized.state.root.children;
  assert.equal(ball.params.countPow, 7);
  assert.equal(round.params.preCircleCount, 33);
  assert.equal(round.params.minCircleCount, 11);
  assert.equal(round.params.maxCircleCount, 55);
});

test('PointsBuilder shell noise stays on the shell radius', () => {
  const points = applyNoiseOffset(
    Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0 })),
    1,
    1,
    1,
    { mode: 'SHELL_UNIFORM', seed: 42 }
  );
  points.forEach((point) => {
    assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - 1) < 1e-9);
  });
});

test('PointsBuilder Fourier preview and Kotlin share sampling and angle units', () => {
  const term = { r: 1, w: 1, startAngle: Math.PI / 2, startAngleUnit: 'rad' };
  const points = buildFourierSeries([term], 4, 1);
  assert.ok(Math.abs(points[0].x) < 1e-9);
  assert.ok(Math.abs(points[0].z - 1) < 1e-9);
  assert.ok(Math.abs(points[1].x + 1) < 1e-9);
  assert.ok(Math.abs(points[3].x - 1) < 1e-9);

  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [{
          id: 'fourier-radians',
          kind: 'add_fourier_series',
          params: { count: 4, scale: 1 },
          terms: [term]
        }]
      }
    }
  });
  assert.match(generatePointsBuilderKotlin(project), /\.addFourier\(1\.0, 1\.0, 90\.0\)/);
});

test('PointsBuilder emits Kotlin numeric literals for the target scalar type', () => {
  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [{
          id: 'integer-double-inputs',
          kind: 'add_discrete_circle_xz',
          params: { r: 5, count: 120, discrete: 1 }
        }]
      }
    }
  });

  assert.match(generatePointsBuilderKotlin(project), /\.addDiscreteCircleXZ\(5\.0, 120, 1\.0\)/);
  assert.equal(generatePointsBuilderKotlin(project).includes('5, 120, 1)'), false);

  const { fmtDouble, fmtFloat } = builderFormatters;
  assert.equal(fmtDouble(5), '5.0');
  assert.equal(fmtDouble(1.5), '1.5');
  assert.equal(fmtFloat(5), '5F');
  assert.equal(fmtFloat(1.5), '1.5F');
  assert.equal(fmtDouble('Math.max(radius, 4)'), 'Math.max(radius, 4.0)');
  assert.equal(fmtFloat('Math.max(scale, 4)'), 'Math.max(scale, 4F)');
});

test('generator embeds PointsBuilder expressions without a nested terminal call', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emitter.type = 'points_builder';
  card.emitter.builderState.kotlinEndMode = 'clone';

  const standalone = generatePointsBuilderKotlin(card.emitter.builderState);
  assert.match(standalone, /\.create\(\)$/);

  const kotlin = generateEmitterKotlin(project);
  assert.doesNotMatch(kotlin, /\.create\(\)/);
  assert.match(kotlin, /\)\.createWithoutClone\(\)/);
});

test('PointsBuilder Bezier Kotlin preserves coordinate expressions', () => {
  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [{
          id: 'expression-bezier',
          kind: 'add_bezier_4',
          params: {
            p1x: 'startX', p1y: 0, p1z: 0,
            p2x: 'startX + 1', p2y: 2, p2z: 0,
            p3x: 'endX - 1', p3y: 2, p3z: 0,
            p4x: 'endX', p4y: 0, p4z: 0,
            count: 40
          }
        }]
      }
    }
  });

  const kotlin = generatePointsBuilderKotlin(project);
  assert.match(kotlin, /RelativeLocation\(startX, 0\.0, 0\.0\)/);
  assert.match(kotlin, /RelativeLocation\(endX, 0\.0, 0\.0\)/);
  assert.match(kotlin, /\(startX \+ 1\.0\)/);
  assert.match(kotlin, /\(endX - 1\.0\)/);
  assert.doesNotMatch(kotlin, /generateBezierCurve\(RelativeLocation\(0\.0, 0\.0, 0\.0\)/);
});

test('generator draft context only matches the same project and emitter', () => {
  const context = { projectId: 'project-a', emitterId: 'emitter-a' };
  const storedState = { state: { root: { children: [] } }, ts: Date.now() };
  assert.equal(matchesGeneratorPointsBuilderContext(context, context), true);
  assert.equal(shouldReuseGeneratorPointsBuilderDraft(storedState, context, context), true);
  assert.equal(
    matchesGeneratorPointsBuilderContext(context, { ...context, emitterId: 'emitter-b' }),
    false
  );
  assert.equal(
    shouldReuseGeneratorPointsBuilderDraft(
      storedState,
      context,
      { ...context, emitterId: 'emitter-b' }
    ),
    false
  );
  assert.equal(
    matchesGeneratorPointsBuilderContext(context, { ...context, projectId: 'project-b' }),
    false
  );
});
