import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeCompletionGroups } from '../public/legacy/assets/composition_builder/js/code_editor.js';
import { installExpressionEditorMethods } from '../public/legacy/assets/composition_builder/js/expression_editor_mixin.js';
import { createExpressionRuntime } from '../public/legacy/assets/composition_builder/js/expression_runtime.js';
import { getCompositionKotlinTarget } from '../public/legacy/assets/composition_builder/js/kotlin_mapping.js';
import {
  isCompositionCardUsingCParticle,
  isCompositionLeafParticleType
} from '../public/legacy/assets/composition_builder/js/model.js';

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
  mergeCompletionGroups,
  isCompositionCardUsingCParticle,
  isCompositionLeafParticleType
});

function createApp(mapping) {
  const app = new FakeCompositionBuilderApp();
  app.state = {
    projectName: 'ExternalSymbolsComposition',
    mapping,
    globalVars: [{ name: 'externalSpeed', type: 'Double', mutable: true }],
    globalConsts: [{ name: 'externalLimit', type: 'Int' }],
    projectAlpha: { type: 'none' },
    cards: [{ id: 'card-1', dataType: 'single', shapeChildren: [] }]
  };
  app.getCardById = (id) => app.state.cards.find((card) => card.id === id) || null;
  app.getShapeNodeByPath = (card, path) => {
    let nodes = card.shapeChildren || [];
    let node = null;
    for (const index of path) {
      node = nodes[index];
      if (!node) return null;
      nodes = node.children || [];
    }
    return node;
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
    assert.match(dts, /interface CompositionVector<TSelf>/);
    assert.match(dts, /add\(x: number, y: number, z: number\): TSelf;/);
    assert.match(dts, /multiple\(value: number \| CompositionVector<any>\): TSelf;/);
    assert.match(dts, /lengthSquared\(\): number;/);
    assert.match(dts, /declare namespace RelativeLocation \{[^}]*of\(start: Vec3Value, end: Vec3Value\): RelativeLocationValue;/);
    assert.match(dts, /declare namespace Vec3 \{ const ZERO: Vec3Value; \}/);
    assert.match(dts, /declare namespace Vec3d \{ const ZERO: Vec3Value; \}/);
    assert.match(dts, /declare let rel: RelativeLocationValue;/);
    assert.match(dts, /rotateToWithAngle\(to: RelativeLocationValue, angle: number\): void/);
  } finally {
    if (PreviousTextarea === undefined) delete globalThis.HTMLTextAreaElement;
    else globalThis.HTMLTextAreaElement = PreviousTextarea;
  }
});

test('Composition CParticle controller completion exposes GPU control methods only', () => {
  const PreviousTextarea = globalThis.HTMLTextAreaElement;
  globalThis.HTMLTextAreaElement = class FakeTextarea {
    constructor(dataset) {
      this.dataset = dataset;
    }
  };

  try {
    const app = createApp('mojmap');
    app.state.cards = [{
      id: 'shape-card',
      dataType: 'particle_shape',
      useCParticle: true,
      shapeChildren: [{ type: 'single', children: [] }]
    }];
    const textarea = new globalThis.HTMLTextAreaElement({
      treeNodeCactField: 'script',
      cardId: 'shape-card',
      treePath: '[0]'
    });
    const labels = new Set(app.getCodeEditorCompletions(textarea).map((item) => item.label));

    assert.ok(labels.has('setAlpha(alpha)'));
    assert.ok(labels.has('setColor(color)'));
    assert.ok(labels.has('setSize(size)'));
    assert.ok(labels.has('teleportTo(pos)'));
    assert.ok(labels.has('pos'));
    assert.ok(labels.has('velocity'));
    assert.ok(labels.has('valid'));
    assert.equal(labels.has('particle.particleAlpha = 1.0'), false);
    assert.equal(labels.has('particleAlpha = 1.0'), false);
    assert.equal(labels.has('age'), false);
    assert.equal(labels.has('currentAge'), false);
    assert.equal(labels.has('tick'), false);
    assert.equal(labels.has('textureSheet = 0'), false);

    const cparticleDts = app.buildCodeEditorApiDts(textarea, []);
    assert.doesNotMatch(cparticleDts, /declare let (?:age|currentAge|lifetime|maxAge|textureSheet):/);
    assert.doesNotMatch(cparticleDts, /declare let particle:/);
    assert.match(cparticleDts, /declare const pos: any;/);
    assert.match(cparticleDts, /declare let velocity: any;/);
    assert.match(cparticleDts, /declare const valid: boolean;/);
    assert.equal(app.validateCodeEditorSource(textarea, 'currentAge / maxAge').valid, false);
    assert.match(app.validateCodeEditorSource(textarea, 'particle.currentAge').message, /particle\.currentAge/);

    app.state.projectAlpha = { type: 'linear', runMode: 'manual' };
    const projectTextarea = new globalThis.HTMLTextAreaElement({ displayField: 'expression' });
    const projectCompletions = app.getCodeEditorCompletions(projectTextarea);
    const projectLabels = new Set(projectCompletions.map((item) => item.label));
    assert.ok(projectLabels.has('playCParticleAlphaTransition(durationTicks, alphaCurve)'));
    assert.equal(
      projectCompletions.find((item) => item.label === 'playCParticleAlphaTransition(durationTicks, alphaCurve)')?.insertText,
      'playCParticleAlphaTransition(20.0, CParticleCurve.linear(0.0, 1.0))'
    );
    app.isAlphaHelperAllowedForCodeEditor = () => true;
    assert.match(app.buildCodeEditorApiDts(projectTextarea, projectCompletions), /declare const CParticleCurve:/);
  } finally {
    if (PreviousTextarea === undefined) delete globalThis.HTMLTextAreaElement;
    else globalThis.HTMLTextAreaElement = PreviousTextarea;
  }
});

test('Composition single-card CParticle controller uses GPU completion rules', () => {
  const PreviousTextarea = globalThis.HTMLTextAreaElement;
  globalThis.HTMLTextAreaElement = class FakeTextarea {
    constructor(dataset) {
      this.dataset = dataset;
    }
  };

  try {
    const app = createApp('mojmap');
    app.state.cards = [{
      id: 'single-gpu-card',
      dataType: 'single',
      particleBackend: 'cparticle',
      shapeChildren: []
    }];
    const textarea = new globalThis.HTMLTextAreaElement({
      cactField: 'script',
      cardId: 'single-gpu-card'
    });
    const labels = new Set(app.getCodeEditorCompletions(textarea).map((item) => item.label));

    assert.ok(labels.has('setAlpha(alpha)'));
    assert.ok(labels.has('teleportTo(pos)'));
    assert.equal(labels.has('currentAge'), false);
    assert.equal(labels.has('particle.particleAlpha = 1.0'), false);
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
