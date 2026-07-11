import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeGeneratorProject } from '../src/modules/generator/defaults.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import {
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

test('color editor cancels a pending picker commit when the parameter type changes', () => {
  const source = readFileSync(
    new URL('../src/components/GeneratorParameterValueEditor.vue', import.meta.url),
    'utf8'
  );
  assert.match(source, /if \(type !== 'Vector3f'\) colorCommit\.cancel\(\)/);
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

test('color commit targets remain attached to the item that scheduled them', () => {
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
  assert.match(source, /if \(props\.item !== target\) return/);
  assert.match(source, /\(\) => props\.item,[\s\S]*?colorCommit\.cancel\(\)/);
  assert.match(source, /onBeforeUnmount\(colorCommit\.cancel\)/);
});
