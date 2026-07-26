import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeGeneratorExpression,
  applyGeneratorExpressionCompletion,
  buildGeneratorExpressionCompletions
} from '../src/modules/generator/expression-runtime.js';

const parameters = {
  variables: [
    { name: 'phase', type: 'Double', value: 0 },
    { name: 'origin', type: 'RelativeLocation', value: 'RelativeLocation(0.0, 0.0, 0.0)' },
    { name: 'direction', type: 'Vec3', value: 'Vec3(0.0, 1.0, 0.0)' },
    { name: 'tint', type: 'Vector3f', value: 'Vector3f(1.0f, 1.0f, 1.0f)' }
  ],
  constants: [{ name: 'speed', type: 'Double', value: 0.25, codec: false }]
};

const supportedFunctionNames = [
  'min', 'max', 'abs', 'floor', 'ceil', 'round', 'trunc', 'pow', 'sqrt',
  'sin', 'cos', 'tan', 'log', 'exp', 'sign', 'clamp', 'lerp', 'random'
];

test('doTick completions expose parser-supported builtins and stable UI metadata', () => {
  const completions = buildGeneratorExpressionCompletions(parameters, { statements: true });
  const ids = completions.map((item) => item.id);

  assert.equal(new Set(ids).size, ids.length);
  for (const item of completions) {
    for (const key of ['id', 'kind', 'type', 'label', 'insertText', 'detail', 'signature']) {
      assert.equal(typeof item[key], 'string', `${item.label} is missing ${key}`);
      assert.notEqual(item[key], '', `${item.label} has an empty ${key}`);
    }
  }

  assert.equal(completions.find((item) => item.id === 'builtin:E')?.type, 'Double');
  assert.deepEqual(
    completions
      .filter((item) => item.kind === 'function')
      .map((item) => item.id.replace('function:', ''))
      .sort(),
    [...supportedFunctionNames].sort()
  );

  for (const name of supportedFunctionNames) {
    const completion = completions.find((item) => item.id === `function:${name}`);
    assert.ok(completion, `missing ${name}`);
    const analysis = analyzeGeneratorExpression(completion.insertText, parameters);
    assert.equal(analysis.valid, true, `${name}: ${analysis.message}`);
  }
});

test('doTick completions include every parser-supported vector constructor', () => {
  const completions = buildGeneratorExpressionCompletions(parameters, { statements: true });

  for (const type of ['Vec3', 'RelativeLocation', 'Vector3f']) {
    const completion = completions.find((item) => item.id === `constructor:${type}`);
    assert.ok(completion, `missing ${type}`);
    assert.equal(completion.kind, 'constructor');
    assert.equal(completion.type, type);
    const analysis = analyzeGeneratorExpression(completion.insertText, parameters);
    assert.equal(analysis.valid, true, `${type}: ${analysis.message}`);
    assert.equal(analysis.type, type);
  }
});

test('typed inputs only receive function snippets assignable to their target type', () => {
  for (const expectedType of ['Int', 'Long', 'Float', 'Double']) {
    const completions = buildGeneratorExpressionCompletions(parameters, { expectedType });
    const functions = completions.filter((item) => item.kind === 'function');
    assert.ok(functions.length > 0, `missing ${expectedType} functions`);
    for (const completion of functions) {
      const analysis = analyzeGeneratorExpression(completion.insertText, parameters, { expectedType });
      assert.equal(analysis.valid, true, `${expectedType} ${completion.label}: ${analysis.message}`);
    }
  }
});

test('completion insertion replaces the full identifier around the caret', () => {
  const completion = buildGeneratorExpressionCompletions(parameters, { expectedType: 'Double' })
    .find((item) => item.id === 'function:sin');
  const source = 'phase = sine + 1';
  const caret = source.indexOf('sine') + 2;

  assert.deepEqual(
    applyGeneratorExpressionCompletion(source, caret, caret, completion),
    {
      value: 'phase = sin(0) + 1',
      selectionStart: 12,
      selectionEnd: 13
    }
  );
});

test('completion insertion preserves negative cursor offsets and snippet selections', () => {
  assert.deepEqual(
    applyGeneratorExpressionCompletion('power + 1', 2, 2, {
      insertText: 'pow(0, 0)',
      cursorOffset: -2,
      selectionLength: 1
    }),
    {
      value: 'pow(0, 0) + 1',
      selectionStart: 7,
      selectionEnd: 8
    }
  );
});
