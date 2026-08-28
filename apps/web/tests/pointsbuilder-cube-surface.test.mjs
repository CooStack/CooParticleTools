import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import '../public/legacy/assets/src/js/compat/legacy-utils.global.js';
import { normalizeEmbeddedPointsBuilderState } from '../public/legacy/assets/composition_builder/js/model.js';
import {
  emitBuilderKotlinFromState,
  evaluateBuilderState,
  normalizeBuilderState
} from '../public/legacy/assets/emitter_generator/js/points_builder_bridge.js';
import { createKindDefs } from '../public/legacy/assets/points_builder/js/kinds.js';
import { generateCompositionKotlin, collectCompositionPreviewPoints } from '../src/modules/composition/codegen.js';
import { createCompositionProject } from '../src/modules/composition/defaults.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { generatePointsBuilderKotlin } from '../src/modules/pointsbuilder/codegen.js';
import { evaluatePointsProject } from '../src/modules/pointsbuilder/evaluator.js';
import {
  getBallLocations,
  getBallSolidLocations,
  getBallSurfaceLocations,
  getCubeSurfaceLocations
} from '../src/modules/pointsbuilder/geometry.js';
import { normalizePointsBuilderProject } from '../src/modules/pointsbuilder/normalizer.js';

function faceFor(point, halfX, halfY, halfZ) {
  const epsilon = 1e-9;
  if (Math.abs(point.y + halfY) < epsilon) return 0;
  if (Math.abs(point.y - halfY) < epsilon) return 1;
  if (Math.abs(point.z + halfZ) < epsilon) return 2;
  if (Math.abs(point.z - halfZ) < epsilon) return 3;
  if (Math.abs(point.x + halfX) < epsilon) return 4;
  if (Math.abs(point.x - halfX) < epsilon) return 5;
  return -1;
}

test('ball surface and solid previews follow the API final-count algorithms', () => {
  const surface = getBallSurfaceLocations(2, 32);
  const solid = getBallSolidLocations(2, 32);
  const legacy = getBallLocations(2, 6);

  assert.equal(surface.length, 32);
  surface.forEach((point) => {
    assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - 2) < 1e-9);
  });
  assert.equal(solid.length, 32);
  solid.forEach((point, index) => {
    const expectedRadius = 2 * Math.pow((index + 0.5) / 32, 1 / 3);
    assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - expectedRadius) < 1e-9);
  });
  assert.deepEqual(legacy, getBallSurfaceLocations(2, 36));
});

test('shared PointsBuilder emits every final-count ball API', () => {
  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [
          { id: 'ball-surface', kind: 'add_ball_surface', params: { r: 2, count: 11 } },
          { id: 'ball-solid', kind: 'add_ball_solid', params: { r: 3, count: 12, ox: 1, oy: 2, oz: 3 } },
          { id: 'ball-volume', kind: 'add_ball_volume', params: { r: 4, count: 13 } }
        ]
      }
    }
  });

  assert.equal(evaluatePointsProject(project).length, 36);
  const kotlin = generatePointsBuilderKotlin(project);
  assert.match(kotlin, /\.addBallSurface\(2\.0, 11\)/);
  assert.match(kotlin, /\.addBallSolid\(RelativeLocation\(1\.0, 2\.0, 3\.0\), 3\.0, 12\)/);
  assert.match(kotlin, /\.addBallVolume\(4\.0, 13\)/);
});

test('cube-surface preview follows API face-area allocation', () => {
  const points = getCubeSurfaceLocations(4, 2, 6, 120);
  const faceCounts = [0, 0, 0, 0, 0, 0];

  assert.equal(points.length, 120);
  for (const point of points) {
    const face = faceFor(point, 2, 1, 3);
    assert.notEqual(face, -1);
    faceCounts[face] += 1;
    assert.ok(point.x >= -2 && point.x <= 2);
    assert.ok(point.y >= -1 && point.y <= 1);
    assert.ok(point.z >= -3 && point.z <= 3);
  }
  assert.deepEqual(faceCounts, [33, 32, 11, 11, 17, 16]);
});

test('shared PointsBuilder node previews and emits both addCubeSurface overloads', () => {
  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [
          {
            id: 'uniform-cube-surface',
            kind: 'add_cube_surface',
            params: { sizeMode: 'uniform', size: 2, count: 12 }
          },
          {
            id: 'rectangular-cube-surface',
            kind: 'add_cube_surface',
            params: {
              sizeMode: 'dimensions',
              width: 4,
              height: 2,
              depth: 6,
              count: 18,
              ox: 1,
              oy: 2,
              oz: 3
            }
          }
        ]
      }
    }
  });

  assert.equal(evaluatePointsProject(project).length, 30);
  const kotlin = generatePointsBuilderKotlin(project);
  assert.match(kotlin, /\.addCubeSurface\(2\.0, 12\)/);
  assert.match(kotlin, /\.addCubeSurface\(RelativeLocation\(1\.0, 2\.0, 3\.0\), 4\.0, 2\.0, 6\.0, 18\)/);
});

test('cube-surface normalization recognizes legacy dimension-only payloads', () => {
  const project = normalizePointsBuilderProject({
    state: {
      root: {
        children: [{
          id: 'legacy-cube-surface',
          kind: 'add_cube_surface',
          params: { width: 3, height: 4, depth: 5, count: 24 }
        }]
      }
    }
  });

  assert.equal(project.state.root.children[0].params.sizeMode, 'dimensions');
  assert.match(generatePointsBuilderKotlin(project), /\.addCubeSurface\(3\.0, 4\.0, 5\.0, 24\)/);
});

test('legacy PointsBuilder card applies and emits addCubeSurface', () => {
  const U = globalThis.Utils;
  const num = (value) => Number(value) || 0;
  const int = (value) => Math.max(0, Math.trunc(num(value)));
  const relExpr = (x, y, z) => `RelativeLocation(${U.fmt(x)}, ${U.fmt(y)}, ${U.fmt(z)})`;
  const kinds = createKindDefs({ U, num, int, relExpr });
  const definition = kinds.add_cube_surface;
  const context = { points: [] };

  definition.apply(context, {
    params: {
      sizeMode: 'dimensions',
      width: 4,
      height: 2,
      depth: 6,
      count: 18,
      ox: 1,
      oy: 2,
      oz: 3
    }
  });

  assert.equal(context.points.length, 18);
  assert.equal(
    definition.kotlin({ params: { sizeMode: 'uniform', size: 2, count: 12, ox: 0, oy: 0, oz: 0 } }),
    '.addCubeSurface(2.0, 12)'
  );
  assert.equal(
    definition.kotlin({ params: { sizeMode: 'dimensions', width: 4, height: 2, depth: 6, count: 18, ox: 1, oy: 2, oz: 3 } }),
    '.addCubeSurface(RelativeLocation(1.0, 2.0, 3.0), 4.0, 2.0, 6.0, 18)'
  );
});

test('legacy PointsBuilder applies and emits final-count ball cards', () => {
  const U = globalThis.Utils;
  const num = (value) => Number(value) || 0;
  const int = (value) => Math.max(0, Math.trunc(num(value)));
  const relExpr = (x, y, z) => `RelativeLocation(${U.fmt(x)}, ${U.fmt(y)}, ${U.fmt(z)})`;
  const kinds = createKindDefs({ U, num, int, relExpr });
  const cases = [
    ['add_ball_surface', 'addBallSurface'],
    ['add_ball_solid', 'addBallSolid'],
    ['add_ball_volume', 'addBallVolume']
  ];

  for (const [kind, kotlinName] of cases) {
    const context = { points: [] };
    const params = { r: 2, count: 12, ox: 1, oy: 2, oz: 3 };
    kinds[kind].apply(context, { params });
    assert.equal(context.points.length, 12);
    assert.equal(
      kinds[kind].kotlin({ params }),
      `.${kotlinName}(RelativeLocation(1.0, 2.0, 3.0), 2.0, 12)`
    );
  }
});

test('legacy PointsBuilder exposes final-count ball card controls', () => {
  const source = readFileSync(
    new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url),
    'utf8'
  );
  const editor = source.match(/case "add_ball_surface":[\s\S]*?break;/)?.[0] || '';

  assert.match(editor, /case "add_ball_solid"/);
  assert.match(editor, /case "add_ball_volume"/);
  assert.match(editor, /inputNum\(p\.r/);
  assert.match(editor, /inputNum\(p\.count/);
  assert.doesNotMatch(editor, /inputNum\(p\.countPow/);
  assert.match(editor, /makeVec3Editor\(p, "o"/);
});

test('legacy PointsBuilder exposes cube-surface card controls', () => {
  const source = readFileSync(
    new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url),
    'utf8'
  );
  const editor = source.match(/case "add_cube_surface":[\s\S]*?break;/)?.[0] || '';

  assert.match(editor, /尺寸模式/);
  assert.match(editor, /p\.sizeMode === "dimensions"/);
  assert.match(editor, /inputNum\(p\.size/);
  assert.match(editor, /inputNum\(p\.width/);
  assert.match(editor, /inputNum\(p\.height/);
  assert.match(editor, /inputNum\(p\.depth/);
  assert.match(editor, /inputNum\(p\.count/);
  assert.match(editor, /makeVec3Editor\(p, "o"/);
});

test('Composition preserves, previews, and emits addCubeSurface builders', () => {
  const cubeNode = {
    id: 'composition-cube-surface',
    kind: 'add_cube_surface',
    params: {
      sizeMode: 'dimensions',
      width: 4,
      height: 2,
      depth: 6,
      count: 18,
      ox: 1,
      oy: 2,
      oz: 3
    },
    children: [],
    terms: []
  };
  const legacyState = normalizeEmbeddedPointsBuilderState({
    root: { id: 'root', kind: 'ROOT', children: [cubeNode] }
  });
  assert.equal(legacyState.root.children[0].params.sizeMode, 'dimensions');

  const project = createCompositionProject();
  project.cards[0].builderState.state.root.children = [cubeNode];
  assert.equal(collectCompositionPreviewPoints(project, 0).length, 18);
  assert.match(
    generateCompositionKotlin(project),
    /\.addCubeSurface\(RelativeLocation\(1\.0, 2\.0, 3\.0\), 4\.0, 2\.0, 6\.0, 18\)/
  );
});

test('Emitter bridges preserve, preview, and emit addCubeSurface builders', () => {
  const builderState = {
    root: {
      id: 'root',
      kind: 'ROOT',
      children: [{
        id: 'emitter-cube-surface',
        kind: 'add_cube_surface',
        params: { width: 4, height: 2, depth: 6, count: 18, ox: 1, oy: 2, oz: 3 },
        children: [],
        terms: []
      }]
    }
  };
  const normalized = normalizeBuilderState(builderState);
  assert.equal(normalized.root.children[0].params.sizeMode, 'dimensions');
  assert.equal(evaluateBuilderState(normalized).points.length, 18);
  assert.match(
    emitBuilderKotlinFromState(normalized),
    /\.addCubeSurface\(RelativeLocation\(1\.0, 2\.0, 3\.0\), 4\.0, 2\.0, 6\.0, 18\)/
  );

  const project = createGeneratorProject();
  project.emitters[0].emitter.type = 'points_builder';
  project.emitters[0].emitter.builderState.state.root.children = [{
    id: 'generator-cube-surface',
    kind: 'add_cube_surface',
    params: { sizeMode: 'uniform', size: 2, count: 12, ox: 0, oy: 0, oz: 0 },
    children: [],
    terms: []
  }];
  assert.match(generateEmitterKotlin(project), /\.addCubeSurface\(2\.0, 12\)/);
});

test('ball variants flow through Composition and Emitter previews and Kotlin', () => {
  const ballNodes = [
    { id: 'surface', kind: 'add_ball_surface', params: { r: 2, count: 5 }, children: [], terms: [] },
    { id: 'solid', kind: 'add_ball_solid', params: { r: 3, count: 6 }, children: [], terms: [] },
    { id: 'volume', kind: 'add_ball_volume', params: { r: 4, count: 7 }, children: [], terms: [] }
  ];

  const composition = createCompositionProject();
  composition.cards[0].builderState.state.root.children = ballNodes;
  assert.equal(collectCompositionPreviewPoints(composition, 0).length, 18);
  const compositionKotlin = generateCompositionKotlin(composition);
  assert.match(compositionKotlin, /\.addBallSurface\(2\.0, 5\)/);
  assert.match(compositionKotlin, /\.addBallSolid\(3\.0, 6\)/);
  assert.match(compositionKotlin, /\.addBallVolume\(4\.0, 7\)/);

  const emitterState = { root: { id: 'root', kind: 'ROOT', children: ballNodes } };
  assert.equal(evaluateBuilderState(emitterState).points.length, 18);
  const emitterBridgeKotlin = emitBuilderKotlinFromState(emitterState);
  assert.match(emitterBridgeKotlin, /\.addBallSurface\(2\.0, 5\)/);
  assert.match(emitterBridgeKotlin, /\.addBallSolid\(3\.0, 6\)/);
  assert.match(emitterBridgeKotlin, /\.addBallVolume\(4\.0, 7\)/);

  const generator = createGeneratorProject();
  generator.emitters[0].emitter.type = 'points_builder';
  generator.emitters[0].emitter.builderState.state.root.children = ballNodes;
  const generatorKotlin = generateEmitterKotlin(generator);
  assert.match(generatorKotlin, /\.addBallSurface\(2\.0, 5\)/);
  assert.match(generatorKotlin, /\.addBallSolid\(3\.0, 6\)/);
  assert.match(generatorKotlin, /\.addBallVolume\(4\.0, 7\)/);
});

test('Composition and Emitter load the versioned shared PointsBuilder kinds', () => {
  const compositionSource = readFileSync(
    new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url),
    'utf8'
  );
  const emitterBridgeSource = readFileSync(
    new URL('../public/legacy/assets/emitter_generator/js/points_builder_bridge.js', import.meta.url),
    'utf8'
  );

  assert.match(compositionSource, /points_builder\/js\/kinds\.js\?v=20260828_1/);
  assert.match(emitterBridgeSource, /points_builder\/js\/kinds\.js\?v=20260828_1/);
  assert.match(emitterBridgeSource, /normalizePointsBuilderState/);
});
