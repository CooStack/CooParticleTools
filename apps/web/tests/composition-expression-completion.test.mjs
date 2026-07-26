import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeCompletionGroups } from '../public/legacy/assets/composition_builder/js/code_editor.js';
import { installExpressionEditorMethods } from '../public/legacy/assets/composition_builder/js/expression_editor_mixin.js';
import { createExpressionRuntime } from '../public/legacy/assets/composition_builder/js/expression_runtime.js';
import { getCompositionKotlinTarget } from '../public/legacy/assets/composition_builder/js/kotlin_mapping.js';

class FakeCompositionBuilderApp {}

installExpressionEditorMethods(FakeCompositionBuilderApp, {
  int: (value) => Math.trunc(Number(value) || 0),
  esc: String,
  normalizeAlphaHelperConfig: (value) => value || { type: 'none' },
  getCompositionKotlinTarget,
  sanitizeKotlinClassName: (value) => String(value || 'NewComposition'),
  transpileKotlinThisQualifierToJs: String,
  findFirstUnknownJsIdentifier: () => '',
  JS_LINT_GLOBALS: new Set(['Math', 'Random', 'currentAge', 'lifetime', 'lifeTime', 'maxAge']),
  InlineCodeEditor: class {},
  mergeCompletionGroups
});

function createApp(mapping) {
  const app = new FakeCompositionBuilderApp();
  app.state = {
    projectName: 'ExternalSymbolsComposition',
    mapping,
    globalVars: [{ name: 'externalSpeed', type: 'Double', mutable: true }],
    globalConsts: [{ name: 'externalLimit', type: 'Int' }]
  };
  app.getCodeEditorScopeInfo = () => ({ allowRel: false, allowOrder: false, maxShapeDepth: -1 });
  app.isGrowthApiAllowedForCodeEditor = () => true;
  app.isScaleHelperAllowedForCodeEditor = () => false;
  app.isAlphaHelperAllowedForCodeEditor = () => false;
  app.resolveCodeEditorControllerVars = () => [];
  return app;
}

test('Composition controller completion exposes Random, mapped lifetime, and external symbols', () => {
  const PreviousTextarea = globalThis.HTMLTextAreaElement;
  globalThis.HTMLTextAreaElement = class FakeTextarea {
    constructor() {
      this.dataset = { cactField: 'script', cardId: 'card-1' };
    }
  };

  try {
    const textarea = new globalThis.HTMLTextAreaElement();
    const mojmapApp = createApp('mojmap');
    const mojmap = mojmapApp.getCodeEditorCompletions(textarea);
    const mojmapLabels = new Set(mojmap.map((item) => item.label));

    assert.ok(mojmapLabels.has('Random'));
    assert.ok(mojmapLabels.has('Random.nextInt()'));
    assert.ok(mojmapLabels.has('Random.nextInt(until)'));
    assert.ok(mojmapLabels.has('Random.nextLong()'));
    assert.ok(mojmapLabels.has('Random.nextDouble()'));
    assert.ok(mojmapLabels.has('lifetime'));
    assert.equal(mojmapLabels.has('maxAge'), false);
    assert.ok(mojmapLabels.has('externalSpeed'));
    assert.ok(mojmapLabels.has('externalLimit'));
    assert.ok(mojmapLabels.has('this@ExternalSymbolsComposition.externalLimit'));
    assert.match(mojmap.find((item) => item.label === 'externalSpeed')?.detail || '', /Double/);
    assert.match(mojmap.find((item) => item.label === 'externalLimit')?.detail || '', /Int/);

    const yarnApp = createApp('yarn');
    const yarnLabels = new Set(yarnApp.getCodeEditorCompletions(textarea).map((item) => item.label));
    assert.ok(yarnLabels.has('maxAge'));
    assert.equal(yarnLabels.has('lifetime'), false);
    assert.ok(yarnLabels.has('Vec3d(x, y, z)'));

    const dts = mojmapApp.buildCodeEditorApiDts(textarea, mojmap);
    assert.match(dts, /declare const Random: \{[^}]*nextInt\(\): number;[^}]*nextInt\(until: number\): number/);
    assert.match(dts, /nextLong\(\): number;/);
    assert.match(dts, /declare let externalSpeed: number;/);
    assert.match(dts, /declare const externalLimit: number;/);
    assert.match(dts, /declare let lifetime: number;/);
    assert.match(dts, /declare let maxAge: number;/);
  } finally {
    if (PreviousTextarea === undefined) delete globalThis.HTMLTextAreaElement;
    else globalThis.HTMLTextAreaElement = PreviousTextarea;
  }
});

test('Composition preview evaluates Random no-arg overloads without collapsing to zero', () => {
  const runtime = createExpressionRuntime({
    U: {
      v: (x, y, z) => ({ x, y, z }),
      len: (value) => Math.hypot(value.x, value.y, value.z),
      norm: (value) => value
    },
    getState: () => ({ globalVars: [], globalConsts: [] }),
    sanitizeIdentifier: String
  });
  const previousRandom = Math.random;
  Math.random = () => 0.75;

  try {
    assert.equal(runtime.evaluateNumericExpression('Random.nextInt()'), 1073741824);
    assert.equal(runtime.evaluateNumericExpression('Random.nextLong()'), 1073741824);
    assert.equal(runtime.evaluateNumericExpression('Random.nextInt(10)'), 7);
    assert.equal(runtime.evaluateNumericExpression('Random.nextLong(4, 8)'), 7);
  } finally {
    Math.random = previousRandom;
  }
});
