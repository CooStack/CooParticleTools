import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createGeneratorBindingResolver } from '../src/modules/generator/bindings.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import {
  analyzeGeneratorDoTick,
  analyzeGeneratorExpression,
  applyGeneratorExpressionCompletion,
  buildGeneratorExpressionCompletions,
  executeGeneratorDoTick
} from '../src/modules/generator/expression-runtime.js';
import { createGeneratorPreviewRuntime } from '../src/modules/generator/preview-simulation.js';

const typedValues = [
  { name: 'i', type: 'Int', value: 2 },
  { name: 'd', type: 'Double', value: 0.5 },
  { name: 'relative', type: 'RelativeLocation', value: 'RelativeLocation(1.0, 2.0, 3.0)' },
  { name: 'vec', type: 'Vec3', value: 'Vec3(4.0, 5.0, 6.0)' },
  { name: 'color', type: 'Vector3f', value: 'Vector3f(0.1f, 0.2f, 0.3f)' }
];

test('typed expressions only allow exact numeric types and Int to Double widening', () => {
  const intSum = analyzeGeneratorExpression('i + i', typedValues, { expectedType: 'Double' });
  assert.equal(intSum.valid, true);
  assert.equal(intSum.type, 'Int');
  assert.equal(intSum.value, 4);

  const mixedSum = analyzeGeneratorExpression('i + d', typedValues, { expectedType: 'Double' });
  assert.equal(mixedSum.valid, true);
  assert.equal(mixedSum.type, 'Double');
  assert.match(mixedSum.kotlin, /i\)\.toDouble\(\) \+ d/);

  const narrowed = analyzeGeneratorExpression('i + d', typedValues, { expectedType: 'Int' });
  assert.equal(narrowed.valid, false);
  assert.equal(narrowed.reason, 'type_mismatch');

  const division = analyzeGeneratorExpression('1 / 2', typedValues, { expectedType: 'Double' });
  assert.equal(division.value, 0.5);
  assert.equal(division.kotlin, '(1).toDouble() / (2).toDouble()');

  const mathMin = analyzeGeneratorExpression('Math.min(i, d)', typedValues, { expectedType: 'Double' });
  assert.equal(mathMin.kotlin, 'min((i).toDouble(), d)');
  assert.equal(analyzeGeneratorExpression('log(d)', typedValues).kotlin, 'ln(d)');

  const longMath = analyzeGeneratorExpression(
    'large + 1L',
    [{ name: 'large', type: 'Long', value: '9007199254740993' }],
    { expectedType: 'Long' }
  );
  assert.equal(longMath.valid, true);
  assert.equal(longMath.value, 9007199254740994n);

  const mixedLong = analyzeGeneratorExpression(
    'large + d',
    [...typedValues, { name: 'large', type: 'Long', value: '10' }],
    { expectedType: 'Double' }
  );
  assert.equal(mixedLong.valid, false);
  assert.match(mixedLong.message, /数字类型不兼容/);

  const mixedFloat = analyzeGeneratorExpression(
    'f + i',
    [...typedValues, { name: 'f', type: 'Float', value: 1.5 }],
    { expectedType: 'Float' }
  );
  assert.equal(mixedFloat.valid, false);
  assert.equal(analyzeGeneratorExpression('i', typedValues, { expectedType: 'Float' }).valid, false);
  assert.equal(analyzeGeneratorExpression('i', typedValues, { expectedType: 'Long' }).valid, false);
});

test('numeric compatibility matrix stays exact except Int with Double', () => {
  const values = [
    { name: 'intValue', type: 'Int', value: 2 },
    { name: 'longValue', type: 'Long', value: '2' },
    { name: 'floatValue', type: 'Float', value: 2.0 },
    { name: 'doubleValue', type: 'Double', value: 2.0 }
  ];
  const types = ['Int', 'Long', 'Float', 'Double'];
  const compatiblePair = (left, right) => (
    left === right || new Set([left, right]).size === 2 && [left, right].includes('Int') && [left, right].includes('Double')
  );

  for (const left of values) {
    for (const right of values) {
      const result = analyzeGeneratorExpression(`${left.name} + ${right.name}`, values);
      assert.equal(result.valid, compatiblePair(left.type, right.type), `${left.type} + ${right.type}`);
    }
  }
  for (const actual of values) {
    for (const expected of types) {
      const result = analyzeGeneratorExpression(actual.name, values, { expectedType: expected });
      const assignable = actual.type === expected || actual.type === 'Int' && expected === 'Double';
      assert.equal(result.valid, assignable, `${actual.type} -> ${expected}`);
    }
  }
});

test('Int and Long literals and arithmetic match JVM ranges', () => {
  assert.equal(analyzeGeneratorExpression('2147483648').valid, false);
  assert.equal(analyzeGeneratorExpression('-2147483649').valid, false);
  assert.equal(analyzeGeneratorExpression('9223372036854775808L').valid, false);
  assert.equal(analyzeGeneratorExpression('-9223372036854775809L').valid, false);
  assert.match(analyzeGeneratorExpression('7 % 0').message, /Int 取余除数不能为 0/);
  assert.match(analyzeGeneratorExpression('7L % 0L').message, /Long 取余除数不能为 0/);

  const intMin = analyzeGeneratorExpression('-2147483648', {}, { expectedType: 'Int' });
  const longMin = analyzeGeneratorExpression('-9223372036854775808L', {}, { expectedType: 'Long' });
  assert.equal(intMin.valid, true);
  assert.equal(intMin.value, -2147483648);
  assert.equal(longMin.valid, true);
  assert.equal(longMin.value, -9223372036854775808n);

  const symbols = [
    { name: 'intMax', type: 'Int', value: 2147483647 },
    { name: 'intMin', type: 'Int', value: -2147483648 },
    { name: 'longMax', type: 'Long', value: '9223372036854775807' },
    { name: 'longMin', type: 'Long', value: '-9223372036854775808' }
  ];
  assert.equal(analyzeGeneratorExpression('intMax + 1', symbols).value, -2147483648);
  assert.equal(analyzeGeneratorExpression('intMin - 1', symbols).value, 2147483647);
  assert.equal(analyzeGeneratorExpression('longMax + 1L', symbols).value, -9223372036854775808n);
  assert.equal(analyzeGeneratorExpression('longMin - 1L', symbols).value, 9223372036854775807n);
  assert.equal(analyzeGeneratorExpression('intMax + 1 < 0', symbols).value, true);
  assert.equal(analyzeGeneratorExpression('abs(intMin)', symbols).value, -2147483648);
  assert.equal(analyzeGeneratorExpression('longMin.toInt()', symbols).value, 0);
  assert.equal(analyzeGeneratorExpression('2147483648.0.toInt()', symbols).value, 2147483647);

  const project = createGeneratorProject();
  project.parameters = {
    variables: [
      { name: 'i', type: 'Int', value: 2147483647 },
      { name: 'large', type: 'Long', value: '9223372036854775807' }
    ],
    constants: []
  };
  project.doTick.source = 'i += 1\nlarge += 1L';
  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  assert.deepEqual(runtime.getVariables(), {
    i: -2147483648,
    large: '-9223372036854775808'
  });

  const variables = { i: 7, divisor: 0 };
  const modulo = executeGeneratorDoTick(
    'i = i % divisor',
    variables,
    {},
    { tick: 0, progress: 0 },
    {
      variables: [
        { name: 'i', type: 'Int', value: 7 },
        { name: 'divisor', type: 'Int', value: 0 }
      ],
      constants: []
    }
  );
  assert.equal(modulo.ok, false);
  assert.equal(variables.i, 7);
  assert.match(modulo.message, /整数取余除数不能为 0/);
});

test('typed vector expressions enforce compatible operands and constructors', () => {
  const sum = analyzeGeneratorExpression('relative + vec', typedValues, { expectedType: 'Vec3' });
  assert.equal(sum.valid, true);
  assert.equal(sum.type, 'Vec3');
  assert.equal(sum.kotlin, 'relative.toVector() + vec');
  assert.deepEqual(
    { x: sum.value.x, y: sum.value.y, z: sum.value.z },
    { x: 5, y: 7, z: 9 }
  );

  const constructor = analyzeGeneratorExpression('Vec3(1, i, d) * 2', typedValues, { expectedType: 'Vec3' });
  assert.equal(constructor.valid, true);
  assert.match(constructor.kotlin, /Vec3\(\(1\)\.toDouble\(\), \(i\)\.toDouble\(\), d\) \* \(2\)\.toDouble\(\)/);

  const colorSum = analyzeGeneratorExpression('color + color', typedValues, { expectedType: 'Vector3f' });
  assert.equal(colorSum.valid, true);
  assert.ok(Math.abs(colorSum.value.z - 0.6) < 1e-9);

  const operations = [
    ['vec + Vec3(1, 1, 1)', 'Vec3', { x: 5, y: 6, z: 7 }],
    ['vec - Vec3(1, 1, 1)', 'Vec3', { x: 3, y: 4, z: 5 }],
    ['relative + RelativeLocation(1, 1, 1)', 'RelativeLocation', { x: 2, y: 3, z: 4 }],
    ['relative - RelativeLocation(1, 1, 1)', 'RelativeLocation', { x: 0, y: 1, z: 2 }],
    ['color - Vector3f(0.1f, 0.1f, 0.1f)', 'Vector3f', { x: 0, y: 0.1, z: 0.2 }],
    ['vec * 2', 'Vec3', { x: 8, y: 10, z: 12 }],
    ['vec / 2', 'Vec3', { x: 2, y: 2.5, z: 3 }],
    ['relative * 2', 'RelativeLocation', { x: 2, y: 4, z: 6 }],
    ['relative / 2', 'RelativeLocation', { x: 0.5, y: 1, z: 1.5 }],
    ['color * 2', 'Vector3f', { x: 0.2, y: 0.4, z: 0.6 }],
    ['color / 2', 'Vector3f', { x: 0.05, y: 0.1, z: 0.15 }]
  ];
  operations.forEach(([source, expectedType, expectedValue]) => {
    const result = analyzeGeneratorExpression(source, typedValues, { expectedType });
    assert.equal(result.valid, true, source);
    Object.keys(expectedValue).forEach((axis) => {
      assert.ok(Math.abs(result.value[axis] - expectedValue[axis]) < 1e-9, `${source}.${axis}`);
    });
  });

  const incompatible = analyzeGeneratorExpression('vec + color', typedValues, { expectedType: 'Vec3' });
  assert.equal(incompatible.valid, false);
  assert.match(incompatible.message, /向量类型必须相同/);
  assert.equal(analyzeGeneratorExpression('vec + relative', typedValues, { expectedType: 'Vec3' }).valid, false);
  assert.equal(analyzeGeneratorExpression('relative - vec', typedValues, { expectedType: 'Vec3' }).valid, false);
  assert.equal(analyzeGeneratorExpression('relative + color', typedValues).valid, false);
  assert.equal(analyzeGeneratorExpression('2 / vec', typedValues).valid, false);
});

test('normal returns a unit vector and emits the receiver-specific Kotlin method', () => {
  const vec = analyzeGeneratorExpression('vec.normal()', typedValues, { expectedType: 'Vec3' });
  assert.equal(vec.valid, true);
  assert.equal(vec.kotlin, 'vec.normalize()');
  assert.ok(Math.abs(Math.hypot(vec.value.x, vec.value.y, vec.value.z) - 1) < 1e-9);

  const relative = analyzeGeneratorExpression('relative.normal()', typedValues, { expectedType: 'RelativeLocation' });
  assert.equal(relative.valid, true);
  assert.equal(relative.kotlin, 'relative.normalize()');

  const color = analyzeGeneratorExpression('color.normal()', typedValues, { expectedType: 'Vector3f' });
  assert.equal(color.valid, true);
  assert.equal(
    color.kotlin,
    'Vector3f(color).apply { if (lengthSquared() <= 1.0e-12F) zero() else normalize() }'
  );

  const zeroColor = analyzeGeneratorExpression('Vector3f(0f, 0f, 0f).normal()', typedValues, {
    expectedType: 'Vector3f'
  });
  assert.equal(zeroColor.valid, true);
  assert.deepEqual(
    { x: zeroColor.value.x, y: zeroColor.value.y, z: zeroColor.value.z },
    { x: 0, y: 0, z: 0 }
  );
  assert.match(zeroColor.kotlin, /\.apply \{ if \(lengthSquared\(\) <= 1\.0e-12F\) zero\(\) else normalize\(\) \}/);

  assert.match(analyzeGeneratorExpression('i.normal()', typedValues).message, /只能用于向量/);
  assert.match(analyzeGeneratorExpression('vec.normal(1)', typedValues).message, /不接受参数/);
});

test('binding resolver reports expression types instead of treating vectors as missing names', () => {
  const resolver = createGeneratorBindingResolver({ variables: typedValues });
  const resolved = resolver.resolve({ velocity: 'relative + vec' }, 'velocity', 'Vec3');
  assert.equal(resolved.status, 'expression');
  assert.equal(resolved.type, 'Vec3');
  assert.equal(resolved.kotlin, 'relative.toVector() + vec');

  const invalid = resolver.resolve({ velocity: 'vec + color' }, 'velocity', 'Vec3');
  assert.equal(invalid.status, 'invalid_expression');
  assert.match(invalid.message, /向量类型必须相同/);

  assert.deepEqual(
    resolver.resolve({ value: 'i' }, 'value', 'Double'),
    {
      status: 'resolved',
      name: 'i',
      value: typedValues[0],
      type: 'Int',
      kotlin: '(i).toDouble()'
    }
  );
  assert.equal(resolver.resolve({ value: '(i + i)' }, 'value', 'Double').status, 'expression');
});

test('preview and Kotlin generation share vector expression semantics', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emitter.type = 'point';
  card.particle.countMin = 1;
  card.particle.countMax = 1;
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  project.parameters = {
    variables: [
      { name: 'relative', type: 'RelativeLocation', value: 'RelativeLocation(1.0, 0.0, 0.0)' },
      { name: 'vec', type: 'Vec3', value: 'Vec3(0.0, 1.0, 0.0)' }
    ],
    constants: []
  };
  card.bindings['particle.velocity'] = 'relative + vec';

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const preview = runtime.snapshotRenderData(project);
  assert.deepEqual(preview.errors, []);
  assert.ok(Math.abs(preview.positions[0] - Math.SQRT1_2) < 1e-5);
  assert.ok(Math.abs(preview.positions[1] - Math.SQRT1_2) < 1e-5);

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.extend\.\*/);
  assert.match(kotlin, /velocity = relative\.toVector\(\) \+ vec/);
  assert.match(kotlin, /velocity = relative\.toVector\(\) \+ vec/);
  assert.match(kotlin, /val baseDir = template1\.velocity/);
  assert.doesNotMatch(kotlin, /velocityJitter/);
});

test('bound random velocity keeps per-axis jitter generation', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  project.parameters = {
    variables: [{ name: 'spread', type: 'Vec3', value: 'Vec3(0.1, 0.2, 0.3)' }],
    constants: []
  };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.bindings['particle.velocityRandom'] = 'spread';

  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /val velocityRandom = spread/);
  assert.match(kotlin, /val velocityJitter = Vec3\([^\n]+velocityRandom\.x[^\n]+velocityRandom\.y[^\n]+velocityRandom\.z\)/);
  assert.match(kotlin, /val baseDir = template1\.velocity\.add\(velocityJitter\)/);
});

test('tick and progress expressions freeze each particle at its spawn value', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  project.rootLifecycle.maxTick = 10;
  card.emitter.type = 'point';
  card.particle.countMin = 1;
  card.particle.countMax = 1;
  card.particle.lifeMin = 20;
  card.particle.lifeMax = 20;
  card.bindings['render.alpha'] = 'progress * 100';
  card.curves.opacity.enabled = true;

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const first = runtime.snapshotRenderData(project).alphas[0];
  runtime.step(project, 1);
  const second = runtime.snapshotRenderData(project);
  assert.equal(second.count, 2);
  assert.equal(second.alphas[0], first);
  assert.ok(second.alphas[1] > first, `${first} -> ${second.alphas[1]}`);

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /override fun genParticles[\s\S]*val progress = emitterProgress[\s\S]*alpha = \(\(progress \* \(100\)\.toDouble\(\)\)\.toDouble\(\) \* 100\.0 \/ 10000\.0\)/);
  assert.match(kotlin, /val particleSpawnProgress = [^\n]+[\s\S]*val emitter1BaseAlpha = \(\(particleSpawnProgress \* \(100\)\.toDouble\(\)\)\.toDouble\(\) \/ 100\.0\)/);
  assert.match(kotlin, /this\.particleAlpha = \(emitter1BaseAlpha \* emitter1Opacity\.sample\(lifeProgress\)\)/);
});

test('direct bindings use doTick values at each particle birth', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emitter.type = 'point';
  card.particle.countMin = 1;
  card.particle.countMax = 1;
  card.particle.lifeMin = 20;
  card.particle.lifeMax = 20;
  project.parameters = {
    variables: [{ name: 'alphaValue', type: 'Double', value: 10 }],
    constants: []
  };
  project.doTick.source = 'alphaValue += 10';
  card.bindings['render.alpha'] = 'alphaValue';

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const first = runtime.snapshotRenderData(project).alphas[0];
  runtime.step(project, 1);
  const second = runtime.snapshotRenderData(project);
  assert.ok(Math.abs(first - 0.2) < 1e-6, String(first));
  assert.equal(second.count, 2);
  assert.ok(Math.abs(second.alphas[0] - 0.2) < 1e-6, String(second.alphas[0]));
  assert.ok(Math.abs(second.alphas[1] - 0.3) < 1e-6, String(second.alphas[1]));
});

test('respawn refreshes the frozen visual binding context', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.emission.mode = 'once';
  card.particle.countMin = 1;
  card.particle.countMax = 1;
  card.particle.lifeMin = 2;
  card.particle.lifeMax = 2;
  project.deathBehavior.enabled = true;
  project.deathBehavior.mode = 'respawn';
  project.parameters = {
    variables: [{ name: 'alphaValue', type: 'Double', value: 10 }],
    constants: []
  };
  project.doTick.source = 'alphaValue += 10';
  card.bindings['render.alpha'] = 'alphaValue';

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const first = runtime.snapshotRenderData(project);
  const firstAlpha = first.alphas[0];
  runtime.step(project, 1);
  const second = runtime.snapshotRenderData(project);
  assert.equal(first.count, 1);
  assert.equal(second.count, 1);
  assert.ok(Math.abs(firstAlpha - 0.2) < 1e-6, String(firstAlpha));
  assert.ok(Math.abs(second.alphas[0] - 0.3) < 1e-6, String(second.alphas[0]));
});

test('doTick preserves Long precision beyond JavaScript safe integers', () => {
  const project = createGeneratorProject();
  project.parameters = {
    variables: [{ name: 'large', type: 'Long', value: '9007199254740993' }],
    constants: []
  };
  project.doTick.source = 'large += 1L';

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  assert.equal(runtime.getVariables().large, '9007199254740994');
  assert.match(generateEmitterKotlin(project), /large \+= 1L/);
});

test('Yarn maps expression constructors and doTick emits typed assignments', () => {
  const project = createGeneratorProject({ kotlin: { mapping: 'yarn' } });
  project.parameters = {
    variables: [
      { name: 'i', type: 'Int', value: 2 },
      { name: 'd', type: 'Double', value: 0 },
      { name: 'a', type: 'Vec3', value: 'Vec3(1.0, 0.0, 0.0)' },
      { name: 'b', type: 'Vec3', value: 'Vec3(0.0, 1.0, 0.0)' }
    ],
    constants: []
  };
  project.emitters[0].bindings['particle.velocity'] = 'Vec3(1, i, 3)';
  project.doTick.source = 'd = i + i\na = a + b';

  const tick = analyzeGeneratorDoTick(project.doTick.source, project.parameters, {
    context: { tick: 0, progress: 0 }
  });
  assert.equal(tick.valid, true);
  assert.equal(tick.statements[0].kotlin, '(i + i).toDouble()');

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const variables = runtime.getVariables();
  assert.equal(variables.d, 4);
  assert.deepEqual(
    { x: variables.a.x, y: variables.a.y, z: variables.a.z },
    { x: 1, y: 1, z: 0 }
  );

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /d = \(i \+ i\)\.toDouble\(\)/);
  assert.match(kotlin, /a = a \+ b/);
  assert.match(kotlin, /velocity = Vec3d\(/);
  assert.doesNotMatch(kotlin, /velocity = Vec3\(/);
});

test('Yarn constructor mapping leaves string literals unchanged', () => {
  const project = createGeneratorProject({ kotlin: { mapping: 'yarn' } });
  project.parameters = {
    variables: [{ name: 'text', type: 'String', value: '' }],
    constants: []
  };
  project.doTick.source = 'text = "Vec3(1)"';

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /text = "Vec3\(1\)"/);
  assert.doesNotMatch(kotlin, /text = "Vec3d\(1\)"/);
});

test('doTick rewrites translated compound expressions and rejects unsafe nested assignments', () => {
  const project = createGeneratorProject();
  project.parameters = {
    variables: [
      { name: 'x', type: 'Double', value: 0 },
      { name: 'i', type: 'Int', value: 1 }
    ],
    constants: []
  };
  project.doTick.source = 'x += random()';
  assert.match(generateEmitterKotlin(project), /x = x \+ \(Random\.nextDouble\(\)\)/);

  const invalid = analyzeGeneratorDoTick('if (tick >= 0) { x = "bad" }', project.parameters, {
    context: { tick: 0, progress: 0 }
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.message, /String.*Double/);

  const needsRewrite = analyzeGeneratorDoTick('if (tick >= 0) { x = sin(i) }', project.parameters, {
    context: { tick: 0, progress: 0 }
  });
  assert.equal(needsRewrite.valid, false);
  assert.match(needsRewrite.message, /自动转型或函数转换/);
  project.doTick.source = 'if (tick >= 0) { x = sin(i) }';
  const guardedKotlin = generateEmitterKotlin(project);
  assert.match(guardedKotlin, /doTick 未生成：复杂控制流中的自动转型或函数转换暂不支持/);
  assert.doesNotMatch(guardedKotlin, /x = sin\(i\)/);

  const immutable = analyzeGeneratorDoTick('val local = 1\nlocal = 2', project.parameters);
  assert.equal(immutable.valid, false);
  assert.match(immutable.message, /只读值/);

  const loop = analyzeGeneratorDoTick(
    'for (let j = 0; j < 3; j++) { i = i + 1 }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(loop.valid, false);
  assert.match(loop.message, /不支持 for/);

  const unsafeCondition = analyzeGeneratorDoTick(
    'if (sin(i) > 0.0) { x = x }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(unsafeCondition.valid, false);
  assert.match(unsafeCondition.message, /条件需要自动转型或函数转换/);

  const overflowCondition = analyzeGeneratorDoTick(
    'if (i + 1 < 0) { i = 0 } else { i = 1 }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(overflowCondition.valid, false);
  assert.match(overflowCondition.message, /Int 算术无法保证 JVM 溢出语义/);

  const overflowMultiply = analyzeGeneratorDoTick(
    'if (tick >= 0) { i = i * i }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(overflowMultiply.valid, false);
  assert.match(overflowMultiply.message, /Int 中间运算无法保证 JVM 溢出语义/);

  const intermediateModulo = analyzeGeneratorDoTick(
    'if (true) { i = (i + 1) % 3 }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(intermediateModulo.valid, false);
  assert.match(intermediateModulo.message, /Int 中间运算无法保证 JVM 溢出语义/);

  const observedByFunction = analyzeGeneratorDoTick(
    'if (true) { i = min(i + 1, 0) }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(observedByFunction.valid, false);
  assert.match(observedByFunction.message, /Int 中间运算无法保证 JVM 溢出语义/);

  const zeroModuloCondition = analyzeGeneratorDoTick(
    'if (tick % 0 == 0) { i = 1 } else { i = 2 }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(zeroModuloCondition.valid, false);
  assert.match(zeroModuloCondition.message, /Int 取余除数不能为 0/);

  const dynamicModuloCondition = analyzeGeneratorDoTick(
    'if (tick % i == 0) { i = 1 } else { i = 2 }',
    project.parameters,
    { context: { tick: 0, progress: 0 } }
  );
  assert.equal(dynamicModuloCondition.valid, false);
  assert.match(dynamicModuloCondition.message, /Int 算术无法保证 JVM 溢出语义/);

  const unsupported = analyzeGeneratorDoTick('Math.random()', project.parameters, {
    context: { tick: 0, progress: 0 }
  });
  assert.equal(unsupported.fallbackSafe, false);
  assert.match(unsupported.message, /doTick 仅支持变量赋值/);
  project.doTick.source = 'Math.random()';
  const unsupportedKotlin = generateEmitterKotlin(project);
  assert.match(
    unsupportedKotlin,
    /override fun doTick\(\) \{\s*\/\/ doTick 未生成：doTick 仅支持变量赋值[^\n]*\s*\}/
  );
});

test('safe if/else doTick stays aligned between preview and Kotlin', () => {
  const project = createGeneratorProject();
  project.parameters = {
    variables: [
      { name: 'phase', type: 'Double', value: 1 },
      { name: 'speed', type: 'Double', value: 0.25 }
    ],
    constants: []
  };
  project.doTick.source = 'if (tick % 2 == 0) { phase = phase + speed } else { phase = phase - speed }';
  const analysis = analyzeGeneratorDoTick(project.doTick.source, project.parameters, {
    context: { tick: 0, progress: 0 }
  });
  assert.equal(analysis.handled, false);
  assert.equal(analysis.fallbackSafe, true);
  assert.equal(analysis.valid, true);

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  assert.equal(runtime.getVariables().phase, 1.25);
  runtime.step(project, 1);
  assert.equal(runtime.getVariables().phase, 1);
  assert.match(generateEmitterKotlin(project), /if \(tick % 2 == 0\) \{ phase = phase \+ speed \} else \{ phase = phase - speed \}/);
});

test('expression inputs expose vector snippets and inline validation UI', async () => {
  const completions = buildGeneratorExpressionCompletions(
    { variables: typedValues, constants: [] },
    { expectedType: 'Vec3' }
  );
  assert.ok(completions.some((item) => item.label === 'Vec3(x, y, z)'));
  const normalCompletion = completions.find((item) => item.label === 'vec.normal()');
  assert.ok(normalCompletion);
  assert.equal(applyGeneratorExpressionCompletion('', 0, 0, normalCompletion).value, 'vec.normal()');
  assert.equal(applyGeneratorExpressionCompletion('vec.no', 6, 6, normalCompletion).value, 'vec.normal()');
  const relativeConstructor = completions.find((item) => item.label === 'RelativeLocation(x, y, z) + Vec3(x, y, z)');
  assert.ok(relativeConstructor);
  const applied = applyGeneratorExpressionCompletion('', 0, 0, relativeConstructor);
  assert.equal(applied.value.slice(applied.selectionStart, applied.selectionEnd), '0.0');

  const doubleCompletions = buildGeneratorExpressionCompletions(
    { variables: typedValues, constants: [] },
    { expectedType: 'Double' }
  );
  assert.ok(doubleCompletions.some((item) => item.label === 'd'));
  assert.ok(doubleCompletions.some((item) => item.label === 'progress'));
  assert.equal(doubleCompletions.some((item) => item.label === 'i'), false);

  const source = await readFile(new URL('../src/pages/GeneratorPage.vue', import.meta.url), 'utf8');
  assert.match(source, /validationMessage: bindingValidationMessage/);
  assert.match(source, /mc-autocomplete--invalid/);
  assert.match(source, /applyGeneratorExpressionCompletion/);
  assert.match(source, /displayText: item\.label/);
  assert.match(source, /buildRelativeVec3Completions/);
  assert.match(source, /event\?\.type === 'keyup'.*ArrowDown.*ArrowUp/);
  assert.match(source, /matches\.value\.length \* 40 \+ 8/);
  assert.match(source, /vectorNumericOperand\s*\?\s*numericTypes/);
  assert.match(source, /typed\.fallbackSafe !== true/);
  assert.match(source, /\.generator-page :deep\(\.bindable-field > span\)/);
  assert.match(source, /\.generator-right :deep\(\.bindable-field > span\)/);
  assert.match(source, /h\(Teleport, \{ to: 'body' \}/);
  assert.match(source, /role: 'combobox'/);
  assert.match(source, /role: 'listbox'/);
  assert.match(source, /role: 'option'/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /onCompositionstart: onCompositionStart/);
  assert.match(source, /scrollIntoView\(\{ block: 'nearest' \}\)/);
  assert.match(source, /previewErrors\.length && !hasVisibleAutocomplete/);
});
