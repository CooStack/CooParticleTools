import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createExpressionRuntime } from '../public/legacy/assets/composition_builder/js/expression_runtime.js';
import { installKotlinCodegenMethods } from '../public/legacy/assets/composition_builder/js/kotlin_codegen_mixin.js';
import {
  getCompositionKotlinTarget,
  mapCompositionKotlinType,
  normalizeCompositionMapping,
  rewriteCompositionKotlinExpression
} from '../public/legacy/assets/composition_builder/js/kotlin_mapping.js';

function normalizeHelper(raw, fallback) {
  return { ...(fallback || {}), ...(raw || {}) };
}

function defaultLiteral(type) {
  if (String(type).toLowerCase() === 'vec3') return 'Vec3.ZERO';
  return '0';
}

class CompositionCodegenFixture {
  constructor(mapping) {
    this.state = {
      projectName: 'MappedComposition',
      packageName: 'cn.example.compositions',
      mapping,
      compositionType: 'particle',
      compositionAxisExpr: 'RelativeLocation.yAxis()',
      compositionAxisPreset: 'RelativeLocation.yAxis()',
      compositionAnimates: [],
      globalVars: [{ name: 'direction', type: 'Vec3', value: 'Vec3.ZERO', codec: true, mutable: true }],
      globalConsts: [],
      projectScale: { type: 'none' },
      projectAlpha: { type: 'none' },
      displayActions: [],
      cards: [{
        particleInit: [{ target: 'textureSheet', expr: 'ParticleRenderType.PARTICLE_SHEET_LIT' }],
        shapeChildren: []
      }],
      enableRemoveStatusOverride: false
    };
  }
}

installKotlinCodegenMethods(CompositionCodegenFixture, {
  U: { angleToKotlinRadExpr: () => '0.0' },
  num: Number,
  int: (value) => Math.trunc(Number(value) || 0),
  normalizeAnimate: (value) => value,
  normalizeControllerAction: (value) => value,
  normalizeDisplayAction: (value) => value,
  normalizeAlphaHelperConfig: normalizeHelper,
  normalizeScaleHelperConfig: normalizeHelper,
  sanitizeKotlinClassName: (value) => String(value || 'NewComposition'),
  sanitizeKotlinIdentifier: (value, fallback) => String(value || fallback || ''),
  defaultLiteralForKotlinType: defaultLiteral,
  rewriteClassQualifier: (value, className) => String(value || '')
    .replace(/this@[A-Za-z_][A-Za-z0-9_]*/g, `this@${className}`),
  rewriteControllerStatusQualifier: (value) => String(value || ''),
  normalizeKotlinFloatLiteralText: (value) => `${Number(value)}F`,
  isPlainNumericLiteralText: (value) => /^-?\d+(?:\.\d+)?$/.test(String(value || '').trim()),
  normalizeKotlinDoubleLiteralText: (value) => String(Number(value)),
  formatKotlinDoubleLiteral: (value) => String(Number(value)),
  relExpr: () => 'RelativeLocation(0.0, 0.0, 0.0)',
  indentText: (value) => String(value || ''),
  normalizeAngleOffsetEaseName: (value) => value,
  normalizeAngleOffsetEaseSpecialParams: (value) => value,
  normalizeAngleUnit: (value) => value,
  translateJsBlockToKotlin: (value) => String(value || ''),
  normalizeParticleFloatAssignmentExpr: (_target, value) => String(value || ''),
  DEFAULT_EFFECT_CLASS: 'ControlableEndRodEffect'
});
const buildCompositionParticlesMethod = CompositionCodegenFixture.prototype.buildParticlesMethod;
CompositionCodegenFixture.prototype.buildParticlesMethod = () => [
  '    override fun getParticles(): Map<CompositionData, RelativeLocation> {',
  '        return emptyMap()',
  '    }'
].join('\n');

test('Sequenced Composition emits cards directly in visible card order', () => {
  const app = new CompositionCodegenFixture('mojmap');
  const cards = [{ name: '上层卡片' }, { name: '下层卡片' }];
  const calls = [];
  app.state.cards = cards;
  app.emitCardPut = (card, _className, sequencedRoot, cardIndex) => {
    calls.push({ name: card.name, sequencedRoot, cardIndex });
    return `        result[CompositionData().apply { order = cardOrder++ }] = RelativeLocation(${cardIndex}.0, 0.0, 0.0)`;
  };

  const first = buildCompositionParticlesMethod.call(app, 'MappedComposition', true);
  assert.deepEqual(calls.map((call) => call.name), ['上层卡片', '下层卡片']);
  assert.ok(first.indexOf('// 上层卡片') < first.indexOf('// 下层卡片'));
  assert.match(first, /getParticleSequenced\(\)[\s\S]*?var cardOrder = 0[\s\S]*?\/\/ 上层卡片/);
  assert.equal((first.match(/order = cardOrder\+\+/g) || []).length, 2);
  assert.doesNotMatch(first, /cardEntries\d+|orderCounter|\.forEach \{ \(data, relative\)/);
  assert.ok(calls.every((call) => call.sequencedRoot));

  calls.length = 0;
  app.state.cards = cards.slice().reverse();
  const swapped = buildCompositionParticlesMethod.call(app, 'MappedComposition', true);
  assert.deepEqual(calls.map((call) => call.name), ['下层卡片', '上层卡片']);
  assert.ok(swapped.indexOf('// 下层卡片') < swapped.indexOf('// 上层卡片'));
});

test('Sequenced Composition assigns one local cardOrder entry to each of 11 shape point cards', () => {
  const app = new CompositionCodegenFixture('mojmap');
  app.buildShapeDisplayerExpr = () => 'ParticleShapeComposition(it)';
  app.state.cards = Array.from({ length: 11 }, (_, index) => ({
    name: `卡片 ${index + 1}`,
    dataType: 'particle_shape',
    bindMode: 'point',
    point: { x: index, y: 0, z: 0 },
    shapeChildren: [],
    useCParticle: false
  }));

  const source = buildCompositionParticlesMethod.call(app, 'MappedComposition', true);
  assert.match(source, /val result: SortedMap<CompositionData, RelativeLocation> = TreeMap\(\)\s*var cardOrder = 0/);
  assert.match(source, /result\[\s*CompositionData\(\)\.apply \{ order = cardOrder\+\+ \}/);
  assert.equal((source.match(/order = cardOrder\+\+/g) || []).length, 11);
  assert.equal((source.match(/^\s*\/\/ 卡片 \d+$/gm) || []).length, 11);
  assert.doesNotMatch(source, /cardEntries\d+|orderCounter|\.forEach \{ \(data, relative\)/);
});

test('Sequenced Composition increments cardOrder for every data emitted by Builder and repeat paths', () => {
  const app = new CompositionCodegenFixture('mojmap');
  app.emitBuilderExpr = () => 'PointsBuilder().addLine(RelativeLocation.ZERO, RelativeLocation.xAxis(), 3)';
  app.buildShapeDisplayerExpr = () => 'ParticleShapeComposition(it)';
  app.state.cards = [
    {
      name: 'Builder 多点',
      dataType: 'single',
      bindMode: 'builder',
      builderState: { root: { children: [] } },
      particleInit: [],
      controllerVars: [],
      controllerActions: [],
      singleEffectClass: 'ControlableEndRodEffect'
    },
    {
      name: 'Point 重复',
      dataType: 'particle_shape',
      bindMode: 'point',
      point: { x: 1, y: 2, z: 3 },
      shapeChildren: [],
      useCParticle: false,
      angleOffsetEnabled: true,
      angleOffsetCount: 2,
      angleOffsetValue: 90,
      angleOffsetUnit: 'deg'
    }
  ];

  const source = buildCompositionParticlesMethod.call(app, 'MappedComposition', true);
  assert.match(source, /result\.putAll\([\s\S]*?\.createWithCompositionData \{ rel ->\s*CompositionData\(\)\.apply \{ order = cardOrder\+\+ \}/);
  assert.match(source, /repeat\(angleOffsetCount2\) \{ index ->[\s\S]*?result\[\s*CompositionData\(\)\.apply \{ order = cardOrder\+\+ \}/);
  assert.doesNotMatch(source, /cardEntries\d+|orderCounter|\.forEach \{ \(data, relative\)/);
});

test('Composition mapping targets Yarn and Mojmap symbols', () => {
  assert.equal(normalizeCompositionMapping('yarn'), 'yarn');
  assert.equal(normalizeCompositionMapping('unknown'), 'mojmap');
  assert.equal(mapCompositionKotlinType('Vec3', 'yarn'), 'Vec3d');
  assert.equal(mapCompositionKotlinType('Vec3d', 'mojmap'), 'Vec3');
  assert.equal(getCompositionKotlinTarget('yarn').particleRenderType, 'ParticleTextureSheet');
  assert.equal(
    rewriteCompositionKotlinExpression('Vec3.ZERO to ParticleRenderType.PARTICLE_SHEET_LIT', 'yarn'),
    'Vec3d.ZERO to ParticleTextureSheet.PARTICLE_SHEET_LIT'
  );
});

test('Composition mapping leaves strings and comments unchanged', () => {
  const source = [
    'val label = "Vec3 ParticleRenderType"',
    'val raw = """Vec3 ParticleRenderType"""',
    '// Vec3 ParticleRenderType',
    '/* Vec3 ParticleRenderType */',
    'val direction = Vec3.ZERO',
    'textureSheet = ParticleRenderType.PARTICLE_SHEET_LIT'
  ].join('\n');
  const mapped = rewriteCompositionKotlinExpression(source, 'yarn');

  assert.match(mapped, /"Vec3 ParticleRenderType"/);
  assert.match(mapped, /"""Vec3 ParticleRenderType"""/);
  assert.match(mapped, /\/\/ Vec3 ParticleRenderType/);
  assert.match(mapped, /\/\* Vec3 ParticleRenderType \*\//);
  assert.match(mapped, /val direction = Vec3d\.ZERO/);
  assert.match(mapped, /textureSheet = ParticleTextureSheet\.PARTICLE_SHEET_LIT/);
});

test('Composition Kotlin output follows the selected mapping', () => {
  const yarn = new CompositionCodegenFixture('yarn').generateKotlin();
  assert.match(yarn, /^package cn\.example\.compositions/m);
  assert.match(yarn, /import net\.minecraft\.world\.World/);
  assert.match(yarn, /import net\.minecraft\.util\.math\.Vec3d/);
  assert.match(yarn, /import net\.minecraft\.client\.particle\.ParticleTextureSheet/);
  assert.match(yarn, /class MappedComposition\(position: Vec3d, world: World\? = null\)/);
  assert.match(yarn, /var direction: Vec3d = Vec3d\.ZERO/);
  assert.doesNotMatch(yarn, /net\.minecraft\.world\.level\.Level/);

  const mojmap = new CompositionCodegenFixture('mojmap').generateKotlin();
  assert.match(mojmap, /import cn\.coostack\.cooparticlesapi\.extend\.\*/);
  assert.match(mojmap, /import net\.minecraft\.world\.level\.Level/);
  assert.match(mojmap, /import net\.minecraft\.world\.phys\.Vec3/);
  assert.match(mojmap, /import net\.minecraft\.client\.particle\.ParticleRenderType/);
  assert.match(mojmap, /class MappedComposition\(position: Vec3, world: Level\? = null\)/);
  assert.match(mojmap, /var direction: Vec3 = Vec3\.ZERO/);
  assert.doesNotMatch(mojmap, /net\.minecraft\.util\.math\.Vec3d/);
});

test('Composition Kotlin output rewrites vector methods to operators', () => {
  const app = new CompositionCodegenFixture('mojmap');
  const expression = app.rewriteCodeExpr(
    'rotateToWithAngle(rel.clone().add(0.0, 2.5, 0.0).remove(RelativeLocation(0.0, 0.5, 0.0)).multiple(2).divide(4), PI / 32)',
    'MappedComposition'
  );

  assert.match(expression, /rotateToWithAngle\(/);
  assert.match(expression, /rel\.clone\(\) \+ RelativeLocation\(0\.0, 2\.5, 0\.0\)/);
  assert.match(expression, /- RelativeLocation\(0\.0, 0\.5, 0\.0\)/);
  assert.match(expression, /\* 2 \/ 4/);
  assert.doesNotMatch(expression, /\.(?:add|remove|multiple|multiply|divide|div)\(/);
});

test('Composition vector operations prefer the left type and method parameters enforce their type', () => {
  const app = new CompositionCodegenFixture('mojmap');
  const expression = app.rewriteRelativeTargetExpr(
    'direction.add(Vector3f(1.0, 2.0, 3.0))',
    'MappedComposition'
  );

  assert.match(expression, /^\(direction \+ Vec3\(/);
  assert.match(expression, /Vector3f\(1\.0F, 2\.0F, 3\.0F\)\.x\.toDouble\(\)/);
  assert.match(expression, /\)\.asRelative\(\)$/);
});

test('Composition vector methods use compilable Yarn and Mojmap names', () => {
  const mojmap = new CompositionCodegenFixture('mojmap');
  const yarn = new CompositionCodegenFixture('yarn');

  assert.equal(
    mojmap.rewriteCodeExpr('direction.lengthSquared()', 'MappedComposition'),
    'direction.lengthSqr()'
  );
  assert.equal(
    mojmap.rewriteCodeExpr('direction.distance(rel)', 'MappedComposition'),
    'direction.distanceTo(rel.toVector())'
  );
  assert.equal(
    yarn.rewriteCodeExpr('direction.dot(rel)', 'MappedComposition'),
    'direction.dotProduct(rel.toVector())'
  );
  assert.equal(
    yarn.rewriteCodeExpr('direction.cross(rel)', 'MappedComposition'),
    'direction.crossProduct(rel.toVector())'
  );
  assert.match(
    mojmap.rewriteCodeExpr('rel.lengthSquared()', 'MappedComposition'),
    /\.let \{ value -> value\.dot\(value\) \}/
  );
});

test('Composition vector rewriting handles assignment RHS, strict equality and dynamic constructor values', () => {
  const app = new CompositionCodegenFixture('mojmap');
  app.state.globalVars.push({ name: 'color', type: 'Vector3f', value: 'Vector3f()', codec: true, mutable: true });

  const assigned = app.rewriteCodeExpr(
    'axis = enabled === true ? direction.clone().add(Vec3(age, tick, index)) : rel',
    'MappedComposition'
  );
  const color = app.rewriteCodeExpr('setColor(Vector3f(age, tick, index))', 'MappedComposition');

  assert.match(assigned, /^axis = /);
  assert.match(assigned, /if \(enabled == true\)/);
  assert.match(assigned, /Vec3\(age\.toDouble\(\), tick\.toDouble\(\), index\.toDouble\(\)\)/);
  assert.doesNotMatch(assigned, /===|\.clone\(\)|\.add\(/);
  assert.match(color, /Vector3f\(age\.toFloat\(\), tick\.toFloat\(\), index\.toFloat\(\)\)/);
});

test('Composition vector rewriting supports constants, this qualifiers and Kotlin conditionals', () => {
  const app = new CompositionCodegenFixture('mojmap');
  app.state.globalConsts = [{ name: 'fallback', type: 'Vec3', value: 'Vec3.ZERO' }];

  const constant = app.rewriteRelativeTargetExpr('fallback.add(Vector3f(1, 2, 3))', 'MappedComposition');
  const qualified = app.rewriteRelativeTargetExpr(
    'this@OtherComposition.direction.add(RelativeLocation(1, 2, 3))',
    'MappedComposition'
  );
  const conditional = app.rewriteRelativeTargetExpr(
    'enabled ? fallback.add(Vec3(1, 0, 0)) : rel',
    'MappedComposition'
  );

  assert.match(constant, /^\(fallback \+ Vec3\(/);
  assert.match(constant, /\)\.asRelative\(\)$/);
  assert.match(qualified, /this@MappedComposition\.direction \+ RelativeLocation\(/);
  assert.match(qualified, /\.toVector\(\)/);
  assert.match(qualified, /\)\.asRelative\(\)$/);
  assert.match(conditional, /^\(if \(enabled\) /);
  assert.match(conditional, / else /);
  assert.doesNotMatch(conditional, /\?/);
});

test('Composition vector constructor literal rewriting ignores strings and comments', () => {
  const app = new CompositionCodegenFixture('mojmap');
  const source = [
    'val label = "Vec3(1, 2, 3)"',
    '// RelativeLocation(1, 2, 3)',
    '/* Vector3f(1, 2, 3) */',
    'val direction = Vec3(1, 2, 3)'
  ].join('\n');
  const rewritten = app.rewriteVectorCtorNumericLiterals(source);

  assert.match(rewritten, /"Vec3\(1, 2, 3\)"/);
  assert.match(rewritten, /\/\/ RelativeLocation\(1, 2, 3\)/);
  assert.match(rewritten, /\/\* Vector3f\(1, 2, 3\) \*\//);
  assert.match(rewritten, /val direction = Vec3\(1\.0, 2\.0, 3\.0\)/);
});

test('Composition vector constants and RelativeLocation.of(start, end) work in preview', () => {
  const state = {
    globalVars: [],
    globalConsts: [{ name: 'offset', type: 'Vec3', value: 'Vec3(1, 2, 3)' }]
  };
  const runtime = createExpressionRuntime({
    U: {
      v: (x, y, z) => ({ x, y, z }),
      len: (value) => Math.hypot(value.x, value.y, value.z),
      norm: (value) => value
    },
    getState: () => state,
    sanitizeIdentifier: String
  });

  assert.deepEqual(runtime.parseVecLikeValue('offset.add(1, 1, 1)'), { x: 2, y: 3, z: 4 });
  assert.deepEqual(
    runtime.parseVecLikeValue('RelativeLocation.of(Vec3(1, 2, 3), Vec3(4, 7, 9))'),
    { x: 3, y: 5, z: 6 }
  );
});

test('Composition Vec3d preview parsing supports dynamic numeric inputs', () => {
  const state = {
    globalVars: [{ name: 'localY', type: 'Double', value: '4.5' }],
    globalConsts: []
  };
  const runtime = createExpressionRuntime({
    U: {
      v: (x, y, z) => ({ x, y, z }),
      len: (value) => Math.hypot(value.x, value.y, value.z),
      norm: (value) => {
        const length = Math.hypot(value.x, value.y, value.z) || 1;
        return { x: value.x / length, y: value.y / length, z: value.z / length };
      }
    },
    getState: () => state,
    sanitizeIdentifier: (value) => String(value || '')
  });

  assert.deepEqual(
    runtime.parseVecLikeValue('Vec3d(age, localY, 3.0)', { ageTick: 2 }),
    { x: 2, y: 4.5, z: 3 }
  );
});

test('Composition runtime modules use cache-busted Vec3d-aware sources', async () => {
  const [htmlSource, pageSource, mainSource, modelSource, previewSource, workerSource] = await Promise.all([
    readFile(new URL('../public/legacy/composition_builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/src/js/pages/composition-builder.page.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/model.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/preview_runtime_mixin.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/preview_render_cache_worker.js', import.meta.url), 'utf8')
  ]);

  assert.match(htmlSource, /composition-builder\.page\.js\?v=[0-9_]+/);
  assert.match(htmlSource, /composition_builder\/css\/style\.css\?v=20260823_1/);
  assert.match(pageSource, /main\.js\?v=[0-9_]+/);
  assert.match(mainSource, /model\.js\?v=20260827_2/);
  assert.match(mainSource, /kotlin_codegen_mixin\.js\?v=20260827_3/);
  assert.match(mainSource, /code_output_mixin\.js\?v=20260827_2/);
  assert.match(mainSource, /preferences\.js\?v=20260729_3/);
  assert.match(mainSource, /alpha_helper_utils\.js\?v=20260729_1/);
  assert.match(mainSource, /composition_preset_mixin\.js\?v=20260729_4/);
  assert.match(mainSource, /expression_runtime\.js\?v=20260729_3/);
  assert.match(mainSource, /vector_value_utils\.js\?v=20260720_1/);
  assert.match(mainSource, /preview_runtime_mixin\.js\?v=20260825_3/);
  assert.match(mainSource, /kotlin_codegen_mixin\.js\?v=20260827_3/);
  assert.match(mainSource, /expression_editor_mixin\.js\?v=20260729_3/);
  assert.match(mainSource, /composition_vector_expression\.js\?v=20260729_3/);
  assert.match(modelSource, /alpha_helper_utils\.js\?v=20260729_1/);
  assert.match(modelSource, /vector_value_utils\.js\?v=20260720_1/);
  assert.match(previewSource, /preview_render_cache_worker\.js\?v=20260826_1/);
  assert.match(workerSource, /expression_runtime\.js\?v=20260729_3/);
  assert.match(workerSource, /alpha_helper_utils\.js\?v=20260729_1/);
  assert.match(workerSource, /preview_runtime_mixin\.js\?v=20260826_1/);
  assert.ok((previewSource.match(/src === "Vec3\.ZERO" \|\| src === "Vec3d\.ZERO"/g) || []).length >= 2);
  assert.ok((previewSource.match(/Vec3\|Vec3d\|RelativeLocation\|Vector3f/g) || []).length >= 2);
});
