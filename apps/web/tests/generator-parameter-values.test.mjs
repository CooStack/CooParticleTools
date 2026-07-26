import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createEmitterCard,
  createGeneratorProject,
  countDuplicateEmitterSigns,
  normalizeCollisionTargets,
  normalizeGeneratorProject
} from '../src/modules/generator/defaults.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import {
  collectGeneratorValueEntries,
  createGeneratorBindingResolver
} from '../src/modules/generator/bindings.js';
import {
  calculateGeneratorNumericScrubValue,
  createDeferredGeneratorValueCommit,
  filterGeneratorBindingsByType,
  filterGeneratorValueNameInput,
  formatGeneratorVectorValue,
  generatorHexToVectorValue,
  generatorVectorValueToHex,
  isGeneratorValueName,
  normalizeGeneratorLongValue,
  normalizeGeneratorVectorValue,
  parseGeneratorVectorValue,
  updateGeneratorVectorComponent
} from '../src/modules/generator/parameter-values.js';

test('numeric scrub follows field steps, modifiers and limits', () => {
  assert.equal(calculateGeneratorNumericScrubValue(10, 3, { step: 1 }), 13);
  assert.equal(calculateGeneratorNumericScrubValue(0.1, -4, { step: 0.01 }), 0.06);
  assert.equal(calculateGeneratorNumericScrubValue(1, 5, { step: 0.1, scale: 0.1 }), 1.05);
  assert.equal(calculateGeneratorNumericScrubValue(9, 5, { step: 1, max: 12 }), 12);
  assert.equal(calculateGeneratorNumericScrubValue(1, -5, { step: 1, min: 0 }), 0);
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('default generator schema and Kotlin output remain byte-stable after normalization', () => {
  const project = createGeneratorProject();
  const kotlin = generateEmitterKotlin(project);

  assert.equal(project.schemaVersion, 7);
  assert.equal(generateEmitterKotlin(normalizeGeneratorProject(project)), kotlin);
  assert.equal(sha256(kotlin), 'dead31fdb7a9cd6224e8ffe1ea39d40f6359a7364755652c76e3a9335698259e');
});

test('representative typed bindings keep Kotlin output byte-stable', () => {
  const project = createGeneratorProject({
    parameters: {
      variables: [
        { name: 'countValue', type: 'Int', value: 7 },
        { name: 'longValue', type: 'Long', value: '9223372036854775807' },
        { name: 'scaleValue', type: 'Float', value: 1.5 },
        { name: 'radiusValue', type: 'Double', value: 3 },
        { name: 'enabledValue', type: 'Boolean', value: true },
        { name: 'textureValue', type: 'String', value: 'PARTICLE_SHEET_LIT' },
        { name: 'velocityValue', type: 'Vec3', value: 'Vec3(0.1, 0.2, 0.3)' },
        { name: 'offsetValue', type: 'RelativeLocation', value: 'RelativeLocation(1.0, 2.0, 3.0)' },
        { name: 'colorValue', type: 'Vector3f', value: 'Vector3f(0.25f, 0.5f, 0.75f)' }
      ]
    }
  });
  const card = project.emitters[0];
  card.emitter.type = 'sphere';
  Object.assign(card.bindings, {
    'particle.countMin': 'countValue',
    'particle.countMax': 'radiusValue',
    'emitter.sphere.r': 'radiusValue',
    'render.baseScale.x': 'scaleValue',
    'emitter.offset': 'offsetValue',
    'particle.velocity': 'velocityValue',
    'particle.colorStart': 'colorValue',
    'render.textureSheet': 'textureValue'
  });

  assert.equal(sha256(generateEmitterKotlin(project)), '496424a51a4f2917a800ecf261ef3d25f96d1fcf1c08296c002c6dcbb710ae76');
});

test('generator emits Yarn symbols and initializes API particle state correctly', () => {
  const project = createGeneratorProject({
    kotlin: {
      className: 'YarnEmitter',
      packageName: 'cn.example.particles',
      mapping: 'yarn'
    },
    parameters: {
      constants: [
        { name: 'mappingLabel', type: 'String', value: 'Vec3 Level' },
        { name: 'axisValue', type: 'Vec3', value: 'Vec3(0.0, 1.0, 0.0)' }
      ]
    }
  });
  project.emitters[0].render.billboardMode = 'none';
  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /import net\.minecraft\.world\.World/);
  assert.match(kotlin, /import net\.minecraft\.util\.math\.Vec3d/);
  assert.match(kotlin, /override fun doTick\(\) \{\n    \}/);
  assert.match(kotlin, /weightSize =/);
  assert.match(kotlin, /heightSize =/);
  assert.match(kotlin, /color = data1\.getInterpolatedColor\(0\.0\)/);
  assert.match(kotlin, /alpha = \(/);
  assert.match(kotlin, /this\.particleAlpha = \(emitter1Opacity\.sample\(lifeProgress\)/);
  assert.match(kotlin, /this\.maxAge <= 0/);
  assert.match(kotlin, /this\.currentAge\.toDouble\(\) \/ this\.maxAge\.toDouble\(\)/);
  assert.doesNotMatch(kotlin, /this\.lifetime/);
  assert.match(kotlin, /this\.currentRoll =/);
  assert.match(kotlin, /this\.currentYaw =/);
  assert.match(kotlin, /this\.currentPitch =/);
  assert.doesNotMatch(kotlin, /this\.alpha =/);
  assert.doesNotMatch(kotlin, /this\.roll =/);
  assert.match(kotlin, /lengthSquared\(\)/);
  assert.match(kotlin, /\.multiply\(speed\)/);
  assert.match(kotlin, /private val mappingLabel: String = "Vec3 Level"/);
  assert.match(kotlin, /private val axisValue: Vec3d = Vec3d\(0\.0, 1\.0, 0\.0\)/);
});

test('generator initializes particle alpha from the opacity curve first frame', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  const opacity = card.curves.opacity;
  card.render.alpha = 50;
  opacity.mode = 'linear';
  opacity.keyframes[0].value = 40;
  opacity.keyframes[1].value = 100;

  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /alpha = \(20\.0 \/ 100\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /emitter1Opacity = KeyframeFloatCurve\(listOf\(FloatKeyframe\(0\.0, 0\.2\), FloatKeyframe\(1\.0, 0\.5\)\)\)/);
  assert.match(kotlin, /this\.particleAlpha = \(emitter1Opacity\.sample\(lifeProgress\)\)\.toFloat\(\)\.coerceIn\(0f, 1f\)/);
});

test('generator combines bound alpha with the opacity first frame without multiplying it twice', () => {
  const project = createGeneratorProject({
    parameters: {
      variables: [{ name: 'alphaValue', type: 'Double', value: 50 }]
    }
  });
  const card = project.emitters[0];
  card.bindings['render.alpha'] = 'alphaValue';
  card.curves.opacity.mode = 'linear';
  card.curves.opacity.keyframes[0].value = 40;
  card.curves.opacity.keyframes[1].value = 100;

  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /alpha = \(alphaValue \* 40\.0 \/ 10000\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /val emitter1BaseAlpha = \(alphaValue \/ 100\.0\)/);
  assert.match(kotlin, /emitter1Opacity = KeyframeFloatCurve\(listOf\(FloatKeyframe\(0\.0, 0\.4\), FloatKeyframe\(1\.0, 1\.0\)\)\)/);
  assert.match(kotlin, /this\.particleAlpha = \(emitter1BaseAlpha \* emitter1Opacity\.sample\(lifeProgress\)\)/);
  assert.doesNotMatch(kotlin, /data\.alpha \* emitter1Opacity/);
});

test('opacity curve migration is idempotent for current projects', () => {
  const project = createGeneratorProject();
  const opacity = project.emitters[0].curves.opacity;
  opacity.mode = 'bezier';
  opacity.keyframes[0].value = 0;
  opacity.keyframes[0].out.y = 12.5;
  opacity.keyframes[1].value = 0;
  opacity.keyframes[1].in.y = -8.25;

  const once = normalizeGeneratorProject(JSON.parse(JSON.stringify(project)));
  const twice = normalizeGeneratorProject(JSON.parse(JSON.stringify(once)));

  assert.deepEqual(twice.emitters[0].curves.opacity, once.emitters[0].curves.opacity);
  assert.equal(once.emitters[0].curves.opacity.keyframes[0].out.y, 12.5);
  assert.equal(once.emitters[0].curves.opacity.keyframes[1].in.y, -8.25);
});

test('legacy opacity curve migration scales values and handles only once', () => {
  const project = createGeneratorProject();
  project.schemaVersion = 2;
  const opacity = project.emitters[0].curves.opacity;
  opacity.max = 1;
  opacity.defaultValue = 1;
  opacity.keyframes[0].value = 0;
  opacity.keyframes[0].out.y = 0.125;
  opacity.keyframes[1].value = 1;
  opacity.keyframes[1].in.y = -0.25;

  const once = normalizeGeneratorProject(JSON.parse(JSON.stringify(project)));
  const twice = normalizeGeneratorProject(JSON.parse(JSON.stringify(once)));

  assert.equal(once.emitters[0].curves.opacity.keyframes[0].out.y, 12.5);
  assert.equal(once.emitters[0].curves.opacity.keyframes[1].in.y, -25);
  assert.deepEqual(twice.emitters[0].curves.opacity, once.emitters[0].curves.opacity);
});

test('schema 3-6 projects repair opacity handles already multiplied by the old migration', () => {
  for (const schemaVersion of [5, 6]) {
    const project = createGeneratorProject();
    project.schemaVersion = schemaVersion;
    const opacity = project.emitters[0].curves.opacity;
    opacity.mode = 'bezier';
    opacity.keyframes[0].value = 0;
    opacity.keyframes[0].out.y = 12550;
    opacity.keyframes[1].value = 0;
    opacity.keyframes[1].in.y = -8250;

    const once = normalizeGeneratorProject(JSON.parse(JSON.stringify(project)));
    const twice = normalizeGeneratorProject(JSON.parse(JSON.stringify(once)));

    assert.equal(once.emitters[0].curves.opacity.keyframes[0].out.y, 125.5);
    assert.equal(once.emitters[0].curves.opacity.keyframes[1].in.y, -82.5);
    assert.deepEqual(twice.emitters[0].curves.opacity, once.emitters[0].curves.opacity);

    project.emitters[0].curves.opacity.keyframes[0].out.y = 1250;
    project.emitters[0].curves.opacity.keyframes[1].value = 100;
    project.emitters[0].curves.opacity.keyframes[1].in.y = -825;
    const migratedPercent = normalizeGeneratorProject(JSON.parse(JSON.stringify(project)));
    assert.equal(migratedPercent.emitters[0].curves.opacity.keyframes[0].out.y, 12.5);
    assert.equal(migratedPercent.emitters[0].curves.opacity.keyframes[1].in.y, -8.25);

    project.emitters[0].curves.opacity.keyframes[0].out.y = 825;
    project.emitters[0].curves.opacity.keyframes[1].in.y = 0;
    const migratedSingleHandle = normalizeGeneratorProject(JSON.parse(JSON.stringify(project)));
    assert.equal(migratedSingleHandle.emitters[0].curves.opacity.keyframes[0].out.y, 8.25);
  }
});

test('generator emits allocation-free command queue sign checks', () => {
  const generateWithSigns = (signs) => generateEmitterKotlin(createGeneratorProject({
    commandQueues: [{
      id: 'queue_signs',
      name: 'Signs',
      signs,
      commands: [{
        id: 'command_drag',
        enabled: true,
        tick: 0,
        type: 'drag',
        params: { damping: 0.1, minSpeed: 0.02, linear: 0 }
      }]
    }]
  }));

  const unrestricted = generateWithSigns([]);
  assert.match(unrestricted, /\n            commandQueue1\.applyVelocity\(data, this\)/);
  assert.doesNotMatch(unrestricted, /if \(true\)/);

  const single = generateWithSigns([0]);
  assert.match(single, /if \(data\.sign == 0\) commandQueue1\.applyVelocity\(data, this\)/);
  assert.doesNotMatch(single, /setOf\(0\)/);

  const multiple = generateWithSigns([0, 2, 0]);
  assert.match(multiple, /if \(data\.sign == 0 \|\| data\.sign == 2\) commandQueue1\.applyVelocity\(data, this\)/);
  assert.doesNotMatch(multiple, /setOf\(/);
});

test('generator normalizes emitter physics without changing legacy defaults', () => {
  const defaults = normalizeGeneratorProject({}).emitters[0].physics;
  assert.deepEqual(defaults, {
    gravity: 0,
    collision: false,
    collisionTargets: []
  });

  const project = normalizeGeneratorProject({
    emitters: [{
      physics: {
        gravity: 0.04,
        collision: true,
        collisionTargets: [2, '3', 2, 'invalid']
      }
    }]
  });
  assert.deepEqual(project.emitters[0].physics, {
    gravity: 0.04,
    collision: true,
    collisionTargets: [2, 3]
  });
});

test('generator collision targets keep empty input unrestricted', () => {
  assert.deepEqual(normalizeCollisionTargets(''), []);
  assert.deepEqual(normalizeCollisionTargets('1,'), [1]);
  assert.deepEqual(normalizeCollisionTargets('1， 2  1 invalid'), [1, 2]);
});

test('generator reports duplicate signs only across enabled emitters', () => {
  const project = createGeneratorProject();
  const first = project.emitters[0];
  first.render.sign = 3;
  const duplicate = createEmitterCard({ id: 'duplicate-sign-marker' });
  duplicate.render.sign = 3;
  const disabled = createEmitterCard({ id: 'disabled-duplicate-sign-marker', enabled: false });
  disabled.render.sign = 3;
  project.emitters.push(duplicate, disabled);

  assert.equal(countDuplicateEmitterSigns(project.emitters, first), 1);
  assert.equal(countDuplicateEmitterSigns(project.emitters, duplicate), 1);
  assert.equal(countDuplicateEmitterSigns(project.emitters, disabled), 0);
  duplicate.render.sign = 4;
  assert.equal(countDuplicateEmitterSigns(project.emitters, first), 0);

  const bindingResolver = createGeneratorBindingResolver({
    variables: [
      { name: 'sharedSign', type: 'Int', value: 3 },
      { name: 'x', type: 'Int', value: 2 }
    ]
  });
  first.bindings['render.sign'] = 'sharedSign';
  duplicate.bindings['render.sign'] = 'sharedSign';
  assert.equal(countDuplicateEmitterSigns(project.emitters, first, bindingResolver), 1);
  duplicate.bindings['render.sign'] = 'otherSign';
  assert.equal(countDuplicateEmitterSigns(project.emitters, first, bindingResolver), 0);

  first.bindings['render.sign'] = 'x + 1';
  duplicate.bindings['render.sign'] = 'x+1';
  assert.equal(countDuplicateEmitterSigns(project.emitters, first, bindingResolver), 1);

  first.render.sign = 1;
  duplicate.render.sign = 2;
  first.bindings['render.sign'] = 'missing';
  duplicate.bindings['render.sign'] = 'missing';
  assert.equal(countDuplicateEmitterSigns(project.emitters, first, bindingResolver), 0);

  first.render.sign = 3;
  delete first.bindings['render.sign'];
  duplicate.bindings['render.sign'] = '3';
  assert.equal(countDuplicateEmitterSigns(project.emitters, first, bindingResolver), 1);
});

test('generator emits per-emitter gravity for the particle data sign', () => {
  const project = createGeneratorProject();
  project.emitters[0].render.sign = 7;
  project.emitters[0].physics.gravity = 0.04;

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /if \(data\.sign == 7\) \{\n\s+data\.velocity = data\.velocity\.add\(0\.0, -0\.04, 0\.0\)/);
  assert.doesNotMatch(kotlin, /import cn\.coostack\.cooparticlesapi\.utils\.PhysicsUtil/);
});

test('generator applies only the first gravity setting for duplicate data signs', () => {
  const project = createGeneratorProject();
  project.emitters[0].render.sign = 3;
  project.emitters[0].physics.gravity = 0.04;
  project.emitters.push({
    ...project.emitters[0],
    id: 'duplicate-sign',
    physics: { ...project.emitters[0].physics, gravity: 0.08 }
  });

  const kotlin = generateEmitterKotlin(project);
  assert.equal(kotlin.match(/data\.sign == 3/g)?.length, 1);
  assert.match(kotlin, /data\.velocity\.add\(0\.0, -0\.04, 0\.0\)/);
  assert.doesNotMatch(kotlin, /data\.velocity\.add\(0\.0, -0\.08, 0\.0\)/);
});

test('generator lets the first zero-gravity emitter own a duplicate data sign', () => {
  const project = createGeneratorProject();
  project.emitters[0].render.sign = 3;
  project.emitters[0].physics.gravity = 0;
  project.emitters.push({
    ...project.emitters[0],
    id: 'duplicate-sign-after-zero',
    physics: { ...project.emitters[0].physics, gravity: 0.08 }
  });

  const kotlin = generateEmitterKotlin(project);
  assert.equal(kotlin.match(/data\.sign == 3/g)?.length, 1);
  assert.match(kotlin, /if \(data\.sign == 3\) \{\n\s+Unit/);
  assert.doesNotMatch(kotlin, /data\.velocity\.add\(0\.0, -0\.08, 0\.0\)/);
});

test('generator clamps bound gravity to zero in Kotlin', () => {
  const project = createGeneratorProject({
    parameters: {
      variables: [{ name: 'gravityValue', type: 'Double', value: -0.25 }]
    }
  });
  project.emitters[0].bindings['physics.gravity'] = 'gravityValue';

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /-\(gravityValue\)\.coerceAtLeast\(0\.0\)/);
});

test('generator emits collision movement for all signs when targets are empty', () => {
  const project = createGeneratorProject();
  project.emitters[0].physics.collision = true;

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.utils\.PhysicsUtil/);
  assert.match(kotlin, /import net\.minecraft\.world\.phys\.BlockHitResult/);
  assert.match(kotlin, /import net\.minecraft\.world\.phys\.HitResult/);
  assert.match(kotlin, /to: Vec3,/);
  assert.match(kotlin, /if \(collide\.type == HitResult\.Type\.MISS\) \{/);
  assert.match(kotlin, /data\.velocity = PhysicsUtil\.collideMovement\(collide, data\.velocity\)/);
  assert.match(kotlin, /particle\.teleportTo\(PhysicsUtil\.fixBeforeCollidePosition\(collide\)\)/);
});

test('generator filters particle collisions by one or multiple data signs', () => {
  const generateWithTargets = (collisionTargets) => {
    const project = createGeneratorProject();
    project.emitters[0].physics.collision = true;
    project.emitters[0].physics.collisionTargets = collisionTargets;
    return generateEmitterKotlin(project);
  };

  assert.match(
    generateWithTargets([4]),
    /collide\.type == HitResult\.Type\.MISS \|\| data\.sign != 4/
  );
  assert.match(
    generateWithTargets([4, 9, 4]),
    /collide\.type == HitResult\.Type\.MISS \|\| data\.sign !in setOf\(4, 9\)/
  );
});

test('generator uses Yarn collision imports and Vec3d override signatures', () => {
  const project = createGeneratorProject({ kotlin: { mapping: 'yarn' } });
  project.emitters[0].physics.collision = true;

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /import net\.minecraft\.util\.hit\.BlockHitResult/);
  assert.match(kotlin, /import net\.minecraft\.util\.hit\.HitResult/);
  assert.match(kotlin, /to: Vec3d,/);
});

test('generator binding resolver exposes exact matching states', () => {
  const value = { name: 'radius', type: 'Double', value: 3 };
  const resolver = createGeneratorBindingResolver({ variables: [value] });

  assert.equal(resolver.resolve({}, 'emitter.sphere.r', 'Double').status, 'unbound');
  assert.equal(resolver.resolve({ 'emitter.sphere.r': 'missing' }, 'emitter.sphere.r', 'Double').status, 'missing');
  assert.equal(resolver.resolve({ 'emitter.sphere.r': 'radius' }, 'emitter.sphere.r', 'Int').status, 'type_mismatch');
  assert.deepEqual(
    resolver.resolve({ 'emitter.sphere.r': 'radius' }, 'emitter.sphere.r', 'Double'),
    { status: 'resolved', name: 'radius', value, type: 'Double' }
  );
});

test('generator bindings keep the first variable before later variables and constants', () => {
  const firstVariable = { name: 'sharedValue', type: 'Int', value: 1 };
  const resolver = createGeneratorBindingResolver({
    variables: [
      firstVariable,
      { name: 'sharedValue', type: 'Double', value: 2 }
    ],
    constants: [{ name: 'sharedValue', type: 'Float', value: 3 }]
  });
  const bindings = { 'particle.countMin': 'sharedValue' };

  assert.deepEqual(
    resolver.resolve(bindings, 'particle.countMin', 'Int'),
    { status: 'resolved', name: 'sharedValue', value: firstVariable, type: 'Int' }
  );
  assert.equal(resolver.resolve(bindings, 'particle.countMin', 'Double').status, 'type_mismatch');

  const project = createGeneratorProject({
    parameters: {
      variables: [
        firstVariable,
        { name: 'sharedValue', type: 'Double', value: 2 }
      ],
      constants: [{ name: 'sharedValue', type: 'Float', value: 3 }]
    }
  });
  project.emitters[0].bindings['particle.countMin'] = 'sharedValue';
  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /var sharedValue: Int = 1/);
  assert.match(kotlin, /minCount = sharedValue/);
  assert.doesNotMatch(kotlin, /sharedValue: (?:Double|Float)/);
});

test('generator binding candidates expose only first-wins parameter entries', () => {
  const firstVariable = { name: 'sharedValue', type: 'Int', value: 1 };
  const uniqueConstant = { name: 'radius', type: 'Double', value: 4 };
  const entries = collectGeneratorValueEntries({
    variables: [
      firstVariable,
      { name: 'sharedValue', type: 'Double', value: 2 }
    ],
    constants: [
      { name: 'sharedValue', type: 'Float', value: 3 },
      uniqueConstant
    ]
  });

  assert.deepEqual(entries, [
    { scope: 'variable', value: firstVariable },
    { scope: 'constant', value: uniqueConstant }
  ]);

  const pageSource = readFileSync(new URL('../src/pages/GeneratorPage.vue', import.meta.url), 'utf8');
  assert.match(pageSource, /collectGeneratorValueEntries\(project\.value\.parameters\)/);
});

test('color picker commits only the latest value after the idle delay', () => {
  const callbacks = new Map();
  const commits = [];
  let timerSeed = 0;
  const deferred = createDeferredGeneratorValueCommit((value) => commits.push(value), {
    delay: 220,
    setTimeoutFn(callback) {
      timerSeed += 1;
      callbacks.set(timerSeed, callback);
      return timerSeed;
    },
    clearTimeoutFn(id) {
      callbacks.delete(id);
    }
  });

  deferred.schedule('#110000');
  deferred.schedule('#220000');
  deferred.schedule('#330000');
  assert.deepEqual(commits, []);
  assert.equal(callbacks.size, 1);
  callbacks.values().next().value();
  assert.deepEqual(commits, ['#330000']);

  deferred.schedule('#440000');
  deferred.flush();
  assert.deepEqual(commits, ['#330000', '#440000']);
  assert.equal(callbacks.size, 0);
});

test('color editor keeps picker input local until change or blur', () => {
  const source = readFileSync(
    new URL('../src/components/GeneratorParameterValueEditor.vue', import.meta.url),
    'utf8'
  );
  assert.match(source, /@input="updateColor\(\$event\.target\.value\)"/);
  assert.match(source, /@change="commitColor"/);
  assert.doesNotMatch(source, /colorCommit\.schedule/);
});

test('generator value names reject invalid characters and numeric prefixes', () => {
  assert.equal(isGeneratorValueName('radius_2'), true);
  assert.equal(isGeneratorValueName('_radius'), true);
  assert.equal(isGeneratorValueName('2radius'), false);
  assert.equal(isGeneratorValueName('bad-name'), false);
  assert.equal(filterGeneratorValueNameInput('2bad-name!'), 'badname');

  const normalized = normalizeGeneratorProject({
    parameters: {
      variables: [{ name: '2bad-name', type: 'Double', value: 1 }],
      constants: [{ name: 'valid_name', type: 'Int', value: 2 }]
    }
  });
  assert.equal(normalized.parameters.variables[0].name, 'value1');
  assert.equal(normalized.parameters.constants[0].name, 'valid_name');
});

test('generator binding suggestions use exact target types', () => {
  const values = [
    { name: 'i', type: 'Int' },
    { name: 'd', type: 'Double' },
    { name: 'v', type: 'Vec3' },
    { name: 'r', type: 'RelativeLocation' },
    { name: 'c', type: 'Vector3f' }
  ];
  assert.deepEqual(filterGeneratorBindingsByType(values, 'int').map((item) => item.name), ['i']);
  assert.deepEqual(filterGeneratorBindingsByType(values, 'number').map((item) => item.name), ['d']);
  assert.deepEqual(filterGeneratorBindingsByType(values, 'vec3').map((item) => item.name), ['v']);
  assert.deepEqual(filterGeneratorBindingsByType(values, 'relative').map((item) => item.name), ['r']);
  assert.deepEqual(filterGeneratorBindingsByType(values, 'color').map((item) => item.name), ['c']);
  assert.deepEqual(filterGeneratorBindingsByType(values, 'float').map((item) => item.name), []);
});

test('generator Kotlin ignores incompatible bindings and preserves exact types', () => {
  const project = normalizeGeneratorProject({
    parameters: {
      variables: [
        { name: 'countValue', type: 'Int', value: 7 },
        { name: 'radiusValue', type: 'Double', value: 3 },
        { name: 'scaleValue', type: 'Float', value: 1.5 },
        { name: 'offsetValue', type: 'RelativeLocation', value: 'RelativeLocation(1.0, 2.0, 3.0)' }
      ]
    }
  });
  const card = project.emitters[0];
  card.emitter.type = 'sphere';
  card.bindings['particle.countMin'] = 'radiusValue';
  card.bindings['emitter.sphere.r'] = 'countValue';
  card.bindings['render.baseScale.x'] = 'scaleValue';
  card.bindings['emitter.offset'] = 'offsetValue';

  const kotlin = generateEmitterKotlin(project);
  assert.doesNotMatch(kotlin, /minCount = radiusValue/);
  assert.doesNotMatch(kotlin, /val rr = countValue/);
  assert.match(kotlin, /weightSize = scaleValue/);
  assert.match(kotlin, /offsetValue/);
});

test('generator vector values round-trip through three numeric components', () => {
  assert.deepEqual(
    parseGeneratorVectorValue('RelativeLocation', 'RelativeLocation(1.5, -2.0, 3.25)'),
    { x: 1.5, y: -2, z: 3.25 }
  );
  assert.equal(
    formatGeneratorVectorValue('Vec3', { x: 1, y: 2.5, z: -3 }),
    'Vec3(1.0, 2.5, -3.0)'
  );
  assert.equal(
    updateGeneratorVectorComponent('Vector3f', 'Vector3f(0.1f, 0.2f, 0.3f)', 'y', 0.75, { min: 0, max: 1 }),
    'Vector3f(0.1f, 0.75f, 0.3f)'
  );
  assert.equal(
    updateGeneratorVectorComponent('Vector3f', 'Vector3f(0.1f, 0.2f, 0.3f)', 'z', 4, { min: 0, max: 1 }),
    'Vector3f(0.1f, 0.2f, 1.0f)'
  );
  assert.equal(
    normalizeGeneratorVectorValue('Vector3f', 'Vec3(1.0, 0.5, 0.25)'),
    'Vector3f(1.0f, 0.5f, 0.25f)'
  );
});

test('Vector3f color mode converts between picker hex and normalized components', () => {
  assert.equal(generatorHexToVectorValue('#ff8000'), 'Vector3f(1.0f, 0.501961f, 0.0f)');
  assert.equal(generatorVectorValueToHex('Vector3f(1.0f, 0.501961f, 0.0f)'), '#ff8000');
});

test('generator preserves Vector3f color mode and emits the stored literal', () => {
  const project = normalizeGeneratorProject({
    parameters: {
      variables: [{ name: 'tint', type: 'Vector3f', value: 'Vector3f(1.0f, 0.5f, 0.0f)', colorMode: true }]
    }
  });

  assert.equal(project.parameters.variables[0].colorMode, true);
  assert.match(generateEmitterKotlin(project), /var tint: Vector3f = Vector3f\(1\.0f, 0\.5f, 0\.0f\)/);
});

test('generator preserves the full Kotlin Long range as decimal strings', () => {
  assert.equal(normalizeGeneratorLongValue('-9223372036854775808'), '-9223372036854775808');
  assert.equal(normalizeGeneratorLongValue('9223372036854775807L'), '9223372036854775807');
  assert.equal(normalizeGeneratorLongValue('9223372036854775808'), '0');

  const project = normalizeGeneratorProject({
    parameters: {
      variables: [{ name: 'minSeed', type: 'Long', value: '-9223372036854775808' }],
      constants: [{ name: 'maxSeed', type: 'Long', value: '9223372036854775807' }]
    }
  });
  assert.equal(project.parameters.variables[0].value, '-9223372036854775808');
  assert.equal(project.parameters.constants[0].value, '9223372036854775807');

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /var minSeed: Long = -9223372036854775808L/);
  assert.match(kotlin, /private val maxSeed: Long = 9223372036854775807L/);

  const source = readFileSync(
    new URL('../src/components/GeneratorParameterValueEditor.vue', import.meta.url),
    'utf8'
  );
  assert.match(source, /:value="item\.value"/);
  assert.match(source, /@input="updateScalarValue\(\$event\.target\.value\)"/);
  const scalarInput = source.match(/<input\s+v-else[\s\S]*?\/>/)?.[0] || '';
  assert.doesNotMatch(scalarInput, /v-model/);
});

test('color picker commit writes the latest draft to the current item', () => {
  const callbacks = new Map();
  const commits = [];
  let timerSeed = 0;
  const deferred = createDeferredGeneratorValueCommit((value, target) => commits.push([value, target]), {
    setTimeoutFn(callback) {
      timerSeed += 1;
      callbacks.set(timerSeed, callback);
      return timerSeed;
    },
    clearTimeoutFn(id) {
      callbacks.delete(id);
    }
  });
  const item = { id: 'original' };

  deferred.schedule('#123456', item);
  callbacks.values().next().value();

  assert.deepEqual(commits, [['#123456', item]]);
  const source = readFileSync(
    new URL('../src/components/GeneratorParameterValueEditor.vue', import.meta.url),
    'utf8'
  );
  assert.match(source, /props\.item\.value = generatorHexToVectorValue\(draftColorHex\.value\)/);
  assert.doesNotMatch(source, /createDeferredGeneratorValueCommit/);
});

test('generator bindable numeric drafts keep a trailing decimal until commit', () => {
  const source = readFileSync(
    new URL('../src/pages/GeneratorPage.vue', import.meta.url),
    'utf8'
  );
  const helperSource = source.match(
    /function coerceBindableNumericInput\(value, valueType = 'number'\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(helperSource, 'numeric commit helper must remain available in the generator page');
  const coerceBindableNumericInput = Function(
    'value',
    'valueType',
    `${helperSource}; return coerceBindableNumericInput(value, valueType);`
  );

  assert.equal(coerceBindableNumericInput('0.', 'number'), 0);
  assert.equal(coerceBindableNumericInput('0.6', 'number'), 0.6);
  assert.equal(coerceBindableNumericInput('3.9', 'int'), 3);
  assert.match(source, /emits: \['update:modelValue', 'commit'\]/);
  assert.match(source, /if \(event\.key === 'Enter'\) \{\s*emit\('commit', event\.target\.value\);\s*open\.value = false;/);
  assert.match(source, /onBlur: \(event\) => \{\s*emit\('commit', event\.target\.value\)/);
  assert.match(
    source,
    /function updateValue\(next\) \{\s*if \(isBindableNumericValueType\(props\.valueType\)\) \{\s*draftValue\.value = String\(next \?\? ''\);\s*return;/
  );
  assert.match(
    source,
    /function commitValue\(next\) \{\s*const value = draftValue\.value \?\? next;\s*applyBindableSingleInput\(props\.card, props\.path, value, props\.valueType\);\s*draftValue\.value = null;/
  );
  assert.match(
    source,
    /'onUpdate:modelValue': inputState\.onUpdate[\s\S]*?onCommit: inputState\.onCommit/
  );
  assert.match(
    source,
    /value: inputState\.hasDraft \? inputState\.draftValue[\s\S]*?onInput: \(event\) => inputState\.onUpdate\?\.\(event\.target\.value\),\s*onBlur: commit,[\s\S]*?event\.key !== 'Enter'/
  );
});

test('generator normalizes emitter data and template externalization settings', () => {
  const defaults = createGeneratorProject().emitters[0];
  assert.equal(defaults.externalData, false);
  assert.equal(defaults.externalTemplate, false);
  assert.deepEqual(defaults.vars, { data: '', template: '' });

  const card = normalizeGeneratorProject({
    emitters: [{
      externalData: true,
      externalTemplate: true,
      vars: { data: 'shared-data', template: '2shared template' }
    }]
  }).emitters[0];
  assert.equal(card.externalData, true);
  assert.equal(card.externalTemplate, true);
  assert.deepEqual(card.vars, { data: 'shared_data', template: '_2shared_template' });
});

test('generator externalizes shared emitter data and templates as codec fields', () => {
  const project = createGeneratorProject();
  const first = project.emitters[0];
  first.externalData = true;
  first.externalTemplate = true;
  first.vars = { data: 'sharedData', template: 'sharedTemplate' };
  const second = JSON.parse(JSON.stringify(first));
  second.id = 'second-emitter';
  second.name = 'Second emitter';
  project.emitters.push(second);

  const kotlin = generateEmitterKotlin(project);
  assert.equal((kotlin.match(/var sharedData = SimpleRandomParticleData\(\)/g) || []).length, 1);
  assert.equal((kotlin.match(/var sharedTemplate = ControlableParticleData\(\)/g) || []).length, 1);
  assert.match(kotlin, /@CodecField\n\s*var sharedData = SimpleRandomParticleData\(\)\.apply \{/);
  assert.match(kotlin, /@CodecField\n\s*var sharedTemplate = ControlableParticleData\(\)\.apply \{/);
  assert.doesNotMatch(kotlin, /val data[12] = SimpleRandomParticleData/);
  assert.doesNotMatch(kotlin, /val template[12] = ControlableParticleData/);
  assert.match(kotlin, /val baseDir = sharedTemplate\.velocity\.add\(velocityJitter\)/);
  assert.match(kotlin, /weightSize = \(particleSize \* sharedTemplate\.weightSize\)\.toFloat\(\)/);
  assert.equal((kotlin.match(/^\s*sharedTemplate\.sign -> \{/gm) || []).length, 1);
});

test('generator keeps external field names and class initializers compilable', () => {
  const project = createGeneratorProject();
  const first = project.emitters[0];
  first.externalData = true;
  first.externalTemplate = true;
  first.vars = { data: 'shared', template: 'shared' };
  first.bindings['particle.sizeMin'] = 'progress * 2.0';

  const second = JSON.parse(JSON.stringify(first));
  second.id = 'second-external-name';
  second.externalTemplate = false;
  second.vars = { data: 'shared_2', template: '' };
  project.emitters.push(second);

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /var shared_2 = SimpleRandomParticleData\(\)\.apply \{/);
  assert.match(kotlin, /var shared_2_2 = SimpleRandomParticleData\(\)\.apply \{/);
  assert.match(kotlin, /minSize = \(0\.0 \* 2\.0\)\.toDouble\(\)/);
  assert.doesNotMatch(kotlin, /minSize = \(progress \*/);
});

test('generator external fields avoid project and inherited member names', () => {
  const project = createGeneratorProject({
    parameters: {
      variables: [{ name: 'sharedData', type: 'Double', value: 1 }]
    }
  });
  const card = project.emitters[0];
  card.externalData = true;
  card.externalTemplate = true;
  card.vars = { data: 'sharedData', template: 'tick' };

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /var sharedData: Double = 1\.0/);
  assert.match(kotlin, /var sharedData_2 = SimpleRandomParticleData\(\)/);
  assert.match(kotlin, /var tick_2 = ControlableParticleData\(\)/);
  assert.doesNotMatch(kotlin, /var tick = ControlableParticleData/);
});

test('generator emitter object names avoid generated and local members', () => {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  card.vars.template = 'when';
  let kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /val when_2 = ControlableParticleData\(\)/);
  assert.doesNotMatch(kotlin, /val when =/);

  card.externalTemplate = true;
  card.vars.template = 'commandQueue1';
  kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /var commandQueue1_2 = ControlableParticleData\(\)/);
});

test('generator uses SimpleRandomParticleData color interpolation helpers', () => {
  const project = createGeneratorProject();
  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /leftColor = Vector3f\(/);
  assert.match(kotlin, /rightColor = Vector3f\(/);
  assert.match(kotlin, /this\.color = data1\.getInterpolatedColor\(lifeProgress\)/);
  assert.doesNotMatch(kotlin, /startColor\.x \+ \(endColor\.x - startColor\.x\)/);

  const source = readFileSync(new URL('../src/pages/GeneratorPage.vue', import.meta.url), 'utf8');
  assert.match(source, /v-model="selectedEmitter\.externalData"/);
  assert.match(source, /v-model="selectedEmitter\.externalTemplate"/);
  assert.match(source, /v-model="selectedEmitter\.vars\.data"/);
  assert.match(source, /v-model="selectedEmitter\.vars\.template"/);
  assert.match(source, /外放粒子数值数据/);
  assert.match(source, /外放粒子数据/);
  assert.doesNotMatch(source, /外放 SimpleRandomParticleData/);
  assert.doesNotMatch(source, /外放 ControlableParticleData/);
  assert.match(source, /duplicate-sign-badge/);
  assert.match(source, /与 \{\{ duplicateEmitterSignCount\(selectedEmitter\) \}\} 个启用发射器 sign 重复/);
});
