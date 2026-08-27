import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createGeneratorProject,
  createGeneratorVariable,
  normalizeGeneratorProject
} from '../src/modules/generator/defaults.js';
import { createGeneratorBindingResolver } from '../src/modules/generator/bindings.js';
import {
  applyGeneratorExpressionCompletion,
  buildGeneratorExpressionCompletions,
  evaluateGeneratorExpression,
  executeGeneratorDoTick,
  filterGeneratorExpressionCompletions,
  generatorExpressionToKotlin,
  isLikelyIncompleteGeneratorExpression,
  validateGeneratorExpression
} from '../src/modules/generator/expression-runtime.js';
import { generateEmitterKotlin } from '../src/modules/generator/codegen.js';
import { createGeneratorPreviewRuntime } from '../src/modules/generator/preview-simulation.js';

test('generator expressions validate known variables and evaluate math helpers', () => {
  assert.equal(validateGeneratorExpression('radius + sin(phase)', ['radius', 'phase']).valid, true);
  assert.match(validateGeneratorExpression('radius + missing', ['radius']).message, /missing/);
  assert.equal(evaluateGeneratorExpression('clamp(radius * 2, 0, 5)', { radius: 4 }), 5);
  assert.equal(evaluateGeneratorExpression('if (radius > 2) 5 else 1', { radius: 4 }), 5);
  assert.equal(generatorExpressionToKotlin('Math.sin(phase);'), 'sin(phase)');
  assert.equal(generatorExpressionToKotlin('Math.random()'), 'Random.nextDouble()');
  assert.equal(generatorExpressionToKotlin('Math.log(phase)'), 'ln(phase)');
  assert.equal(generatorExpressionToKotlin('Math.trunc(phase)'), 'truncate(phase)');
  assert.equal(generatorExpressionToKotlin('phase > 1 ? 2 : 0'), 'if (phase > 1) 2 else 0');
  assert.equal(generatorExpressionToKotlin('radius = phase > 1 ? 2 : 0'), 'radius = if (phase > 1) 2 else 0');
  assert.equal(validateGeneratorExpression('this.constructor', ['radius']).valid, false);
});

test('doTick completion ranks prefixes and uses concrete mutable variable snippets', () => {
  const completions = buildGeneratorExpressionCompletions({
    variables: [
      { name: 'phase', type: 'Double', value: 0 },
      { name: 'radius', type: 'Double', value: 1 },
      { name: 'flag', type: 'Boolean', value: false },
      { name: 'direction', type: 'Vec3', value: 'Vec3(0.0, 1.0, 0.0)' }
    ],
    constants: [{ name: 'speed', type: 'Double', value: 0.25, codec: false }]
  }, { statements: true });

  assert.ok(completions.some((item) => item.label === 'phase = expression'));
  assert.ok(completions.some((item) => item.label === 'phase += 1'));
  assert.equal(completions.some((item) => item.label === 'flag += 1'), false);
  assert.equal(completions.some((item) => item.label === 'direction += 1'), false);
  assert.ok(completions.every((item) => item.label !== 'variable += value'));
  assert.equal(completions.some((item) => item.label === 'speed = expression'), false);

  const varMatches = filterGeneratorExpressionCompletions(completions, 'var');
  assert.equal(varMatches[0].label, 'var local = value');
  assert.equal(varMatches.some((item) => item.label === 'phase += 1'), false);

  const phaseMatches = filterGeneratorExpressionCompletions(completions, 'pha');
  assert.equal(phaseMatches[0].label, 'phase');
  assert.ok(phaseMatches.length <= 6);
  assert.ok(phaseMatches.slice(0, 3).every((item) => item.label.startsWith('phase')));
  assert.equal(filterGeneratorExpressionCompletions(completions).length, 6);
});

test('completion insertion replaces the active token and selects the editable argument', () => {
  const completion = {
    insertText: 'sin(0)',
    cursorOffset: 4,
    selectionLength: 1
  };
  assert.deepEqual(
    applyGeneratorExpressionCompletion('radius = si + 1', 11, 11, completion),
    {
      value: 'radius = sin(0) + 1',
      selectionStart: 13,
      selectionEnd: 14
    }
  );
});

test('editing intermediates do not surface transient syntax errors', () => {
  for (const source of ['var', 'phase = (', 'phase = sin(', 'if (phase > 0) {']) {
    assert.equal(isLikelyIncompleteGeneratorExpression(source), true, source);
  }
  assert.equal(isLikelyIncompleteGeneratorExpression('phase = sin(tick)'), false);
});

test('expression editor keeps code height and completion position on long lines', async () => {
  const source = await readFile(
    new URL('../src/components/GeneratorExpressionEditor.vue', import.meta.url),
    'utf8'
  );
  assert.match(source, /wrap="off"/);
  assert.match(source, /height: 180px !important/);
  assert.match(source, /@scroll="handleScroll"/);
  assert.doesNotMatch(source, /@scroll="closeCompletions"/);
});

test('doTick execution mutates only the supplied variable store', () => {
  const variables = { phase: 0, radius: 1 };
  const result = executeGeneratorDoTick('phase += speed\nradius = 1 + sin(phase)', variables, { speed: 0.5 }, { tick: 0, progress: 0 });
  assert.equal(result.ok, true);
  assert.equal(variables.phase, 0.5);
  assert.ok(Math.abs(variables.radius - (1 + Math.sin(0.5))) < 1e-9);
  assert.match(executeGeneratorDoTick('speed = 3', variables, { speed: 0.5 }).message, /只读值/);
});

test('binding resolver accepts numeric expressions but preserves missing variable state', () => {
  const resolver = createGeneratorBindingResolver({
    variables: [{ name: 'radius', type: 'Double', value: 2 }]
  });
  assert.equal(resolver.resolve({ r: 'missing' }, 'r', 'Double').status, 'missing');
  assert.equal(resolver.resolve({ r: 'tick' }, 'r', 'Double').status, 'expression');
  assert.equal(resolver.resolve({ r: 'radius * 2' }, 'r', 'Double').status, 'expression');
  assert.equal(resolver.resolve({ r: 'radius + unknown' }, 'r', 'Double').status, 'invalid_expression');
});

test('generator emits custom doTick before hidden variable automation', () => {
  const project = createGeneratorProject();
  const phase = createGeneratorVariable({ name: 'phase', type: 'Double', value: 0 });
  const radius = createGeneratorVariable({ name: 'radius', type: 'Double', value: 1 });
  radius.automation = {
    ...radius.automation,
    enabled: true,
    source: 'variable',
    sourceVariable: 'phase',
    sourceMin: 0,
    sourceMax: 10,
    targetMin: 1,
    targetMax: 5
  };
  project.parameters.variables.push(phase, radius);
  project.doTick.source = 'phase += 1';
  project.emitters[0].emitter.type = 'sphere';
  project.emitters[0].bindings['emitter.sphere.r'] = 'radius + sin(phase)';

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /private val automation_radius = KeyframeFloatCurve/);
  assert.match(kotlin, /override fun doTick\(\) \{[\s\S]*phase \+= 1[\s\S]*radius =/);
  assert.match(kotlin, /val rr = \(radius \+ sin\(phase\)\)\.toDouble\(\)/);
});

test('complex doTick rejects standalone calls outside the safe assignment subset', () => {
  const project = createGeneratorProject();
  project.doTick.source = 'if (tick > 0) { Math.random(); Math.pow(2, 3); Math.log(2); Math.trunc(2.5) }';

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /doTick 未生成：复杂 doTick 仅支持 if\/else 与变量赋值/);
  assert.doesNotMatch(kotlin, /Math\.random|Math\.pow|Math\.log|Math\.trunc/);
});

test('preview runs doTick and samples variable-driven keyframes in order', () => {
  const project = createGeneratorProject();
  const phase = createGeneratorVariable({ name: 'phase', type: 'Double', value: 0 });
  const radius = createGeneratorVariable({ name: 'radius', type: 'Double', value: 0 });
  radius.automation = {
    ...radius.automation,
    enabled: true,
    source: 'variable',
    sourceVariable: 'phase',
    sourceMin: 0,
    sourceMax: 1,
    targetMin: 2,
    targetMax: 6
  };
  project.parameters.variables.push(phase, radius);
  project.doTick.source = 'phase += 0.25';

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 2);
  assert.deepEqual(runtime.getVariables(), { phase: 0.5, radius: 4 });
});

test('normalization migrates legacy doTick arrays and keeps automation ranges valid', () => {
  const project = normalizeGeneratorProject({
    doTickExpressions: ['phase += 1', 'radius = phase'],
    parameters: {
      variables: [{
        name: 'phase',
        type: 'Double',
        value: 0,
        automation: { enabled: true, sourceMin: 3, sourceMax: 3, targetMin: 5, targetMax: 1 }
      }]
    }
  });
  assert.equal(project.doTick.source, 'phase += 1\nradius = phase');
  assert.equal(project.parameters.variables[0].automation.sourceMax, 4);
  assert.equal(project.parameters.variables[0].automation.targetMin, 1);
  assert.equal(project.parameters.variables[0].automation.targetMax, 5);
});
