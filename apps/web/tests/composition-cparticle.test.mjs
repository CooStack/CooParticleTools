import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { installKotlinCodegenMethods } from '../public/legacy/assets/composition_builder/js/kotlin_codegen_mixin.js';
import { installTargetPresetMethods } from '../public/legacy/assets/composition_builder/js/target_preset_mixin.js';
import {
  createCompositionCard,
  findCompositionNestedShapePaths,
  compositionShapeNodeHasParticleLeaf,
  isCompositionCardUsingCParticle,
  isCompositionShapeType,
  normalizeCompositionCard,
  normalizeCompositionProject,
  normalizeCompositionShapeNode
} from '../public/legacy/assets/composition_builder/js/model.js';
import {
  applyCompositionPreset,
  createCompositionPreset,
  validateCompositionPreset
} from '../public/legacy/assets/composition_builder/js/preset_store.js';

function normalizeHelper(raw, fallback) {
  return { ...(fallback || {}), ...(raw || {}) };
}

function defaultLiteral(type) {
  if (String(type).toLowerCase() === 'vec3') return 'Vec3.ZERO';
  return '0';
}

function translateBlock(value, indent = '') {
  return String(value || '').split('\n').map((line) => `${indent}${line}`).join('\n');
}

class CompositionCodegenFixture {
  constructor(card, projectAlpha = { type: 'none' }) {
    this.state = {
      projectName: 'CParticleComposition',
      packageName: 'cn.example.compositions',
      mapping: 'mojmap',
      compositionType: 'particle',
      compositionAxisExpr: 'RelativeLocation.yAxis()',
      compositionAxisPreset: 'RelativeLocation.yAxis()',
      compositionAnimates: [],
      globalVars: [],
      globalConsts: [],
      projectScale: { type: 'none' },
      projectAlpha,
      displayActions: [],
      cards: [card],
      enableRemoveStatusOverride: false,
      disabledInterval: 0
    };
  }

  rewriteRelativeTargetExpr(value) { return String(value || ''); }
  rewriteAnimateConditionExpr(value) { return String(value || ''); }
  rewriteCodeExpr(value) { return String(value || ''); }
  validateJsExpressionSource() { return { valid: true }; }
  getShapeScopeInfoByRuntimeLevel() { return {}; }
  emitBuilderExpr() { return 'PointsBuilder()'; }
  emitBuilderExprFromState() { return 'PointsBuilder()'; }
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
  rewriteClassQualifier: (value) => String(value || ''),
  rewriteControllerStatusQualifier: (value) => String(value || ''),
  normalizeKotlinFloatLiteralText: (value) => `${Number(value)}F`,
  isPlainNumericLiteralText: (value) => /^-?\d+(?:\.\d+)?$/.test(String(value || '').trim()),
  normalizeKotlinDoubleLiteralText: (value) => String(Number(value)),
  formatKotlinDoubleLiteral: (value) => String(Number(value)),
  relExpr: (x, y, z) => `RelativeLocation(${Number(x || 0)}, ${Number(y || 0)}, ${Number(z || 0)})`,
  indentText: (value, indent = '') => String(value || '').split('\n').map((line) => `${indent}${line}`).join('\n'),
  normalizeAngleOffsetEaseName: (value) => value,
  normalizeAngleOffsetEaseSpecialParams: (value) => value,
  normalizeAngleUnit: (value) => value,
  translateJsBlockToKotlin: translateBlock,
  normalizeParticleFloatAssignmentExpr: (_target, value) => String(value || ''),
  getCompositionControllerVariableNameError: () => '',
  normalizeCompositionControllerVariableName: (value) => String(value || ''),
  COMPOSITION_LAMBDA_RESERVED_NAMES: new Set(),
  isCompositionShapeType,
  findCompositionNestedShapePaths,
  DEFAULT_EFFECT_CLASS: 'ControlableEndRodEffect'
});

class TargetPresetFixture {
  constructor() {
    this.state = { projectName: 'CParticleComposition', globalVars: [], globalConsts: [] };
  }
}

installTargetPresetMethods(TargetPresetFixture, {
  esc: String,
  sanitizeKotlinClassName: String,
  PARTICLE_INIT_TARGET_OPTIONS: ['color', 'size', 'particleAlpha', 'currentAge', 'textureSheet'],
  CPARTICLE_INIT_TARGET_OPTIONS: [
    'color', 'size', 'alpha', 'age', 'maxAge',
    'alphaCurve', 'scaleCurve', 'colorCurve'
  ]
});

function cparticleCard(overrides = {}) {
  const {
    singleEffectClass = 'ControlableEndRodEffect',
    singleUseTexture = true,
    cparticleRenderLayer = 'TRANSLUCENT',
    randomAgePreTick = false,
    particleInit = [
      { target: 'particleAlpha', expr: '0.8' },
      { target: 'currentAge', expr: '2' },
      { target: 'lifetime', expr: '80' }
    ],
    controllerVars = [],
    controllerActions = [],
    shapeChildren,
    ...cardOverrides
  } = overrides;
  const leaf = normalizeCompositionShapeNode({
    id: 'gpu-leaf',
    type: 'single',
    bindMode: 'point',
    effectClass: singleEffectClass,
    useTexture: singleUseTexture,
    cparticleRenderLayer,
    randomAgePreTick,
    particleInit,
    controllerVars,
    controllerActions
  });
  return normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'gpu-card',
    name: 'GPU card',
    bindMode: 'point',
    point: { x: 1, y: 2, z: 3 },
    dataType: 'particle_shape',
    useCParticle: true,
    singleEffectClass,
    singleUseTexture,
    shapeChildren: shapeChildren ?? [leaf],
    ...cardOverrides
  });
}

const NOT_HDR_RENDER_LAYERS = [
  'ADDITION_BLEND_NOT_HDR',
  'ADDITION_BLEND_NOT_HDR_NO_DEPTH_WRITE',
  'ADDITION_BLEND_TRANSLUCENT_NOT_HDR',
  'ADDITION_BLEND_TRANSLUCENT_NOT_HDR_NO_DEPTH_WRITE'
];

test('Composition model keeps GPU ownership on shape roots and strips legacy leaf flags', () => {
  const card = cparticleCard({ randomAgePreTick: true });
  assert.equal(card.dataType, 'particle_shape');
  assert.equal(card.useCParticle, true);
  assert.equal(card.shapeChildren[0].cparticleRenderLayer, 'TRANSLUCENT');
  assert.equal(card.shapeChildren[0].randomAgePreTick, true);

  const node = normalizeCompositionShapeNode({
    type: 'cparticle',
    cparticleRenderLayer: 'ADDITION_BLEND',
    randomAgePreTick: true,
    randomInitialAge: true,
    children: [{ type: 'single' }]
  });
  assert.equal(node.type, 'single');
  assert.equal(node.useCParticle, false);
  assert.equal(node.cparticleRenderLayer, 'ADDITION_BLEND');
  assert.equal(node.randomAgePreTick, true);
  assert.deepEqual(node.children, []);
  assert.equal(Object.hasOwn(node, 'randomInitialAge'), false);

  const migrated = normalizeCompositionCard({ dataType: 'cparticle', cparticleRenderLayer: 'invalid' });
  assert.equal(migrated.dataType, 'single');
  assert.equal(migrated.useCParticle, false);
  assert.equal(migrated.cparticleRenderLayer, 'ADDITION_BLEND_TRANSLUCENT');
  assert.equal(migrated.randomAgePreTick, false);
  assert.equal(Object.hasOwn(migrated, 'randomInitialAge'), false);
});

test('Composition rejects GPU ownership on single root cards', () => {
  const staleSingle = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'single',
    bindMode: 'point',
    useCParticle: true
  });
  const legacySingle = normalizeCompositionCard({ dataType: 'cparticle' });

  assert.equal(staleSingle.useCParticle, false);
  assert.equal(legacySingle.dataType, 'single');
  assert.equal(legacySingle.useCParticle, false);

  const kotlin = new CompositionCodegenFixture(staleSingle).generateKotlin();
  assert.match(kotlin, /ParticleDisplayer\.withSingle/);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withCParticle|addCParticleInstanceInit/);
});

test('Composition global GPU mode converts single cards and restores managed cards when disabled', () => {
  const enabled = normalizeCompositionProject({
    useCParticle: true,
    cards: [{ ...createCompositionCard(0), dataType: 'single' }]
  });

  assert.equal(enabled.useCParticle, true);
  assert.equal(enabled.cards[0].dataType, 'single');
  assert.equal(enabled.cards[0].particleBackend, 'cparticle');
  assert.equal(enabled.cards[0].globalCParticleAuto, true);
  assert.equal(isCompositionCardUsingCParticle(enabled.cards[0]), true);

  const disabled = normalizeCompositionProject({ ...enabled, useCParticle: false });
  assert.equal(disabled.cards[0].particleBackend, 'single');
  assert.equal(disabled.cards[0].globalCParticleAuto, false);
  assert.equal(isCompositionCardUsingCParticle(disabled.cards[0]), false);
});

test('Composition global GPU mode owns shape roots and restores managed shapes when disabled', () => {
  const enabled = normalizeCompositionProject({
    useCParticle: true,
    cards: [{
      ...createCompositionCard(0),
      dataType: 'particle_shape',
      shapeChildren: [{
        type: 'particle_shape',
        children: [{ type: 'single' }]
      }]
    }]
  });

  assert.equal(enabled.cards[0].useCParticle, true);
  assert.equal(enabled.cards[0].globalCParticleAuto, true);
  assert.equal(isCompositionCardUsingCParticle(enabled.cards[0]), true);

  const disabled = normalizeCompositionProject({ ...enabled, useCParticle: false });
  assert.equal(disabled.cards[0].useCParticle, false);
  assert.equal(disabled.cards[0].globalCParticleAuto, false);
  assert.equal(isCompositionCardUsingCParticle(disabled.cards[0]), false);
});

test('Composition global GPU mode preserves cards that already used CParticle', () => {
  const enabled = normalizeCompositionProject({
    useCParticle: true,
    cards: [{
      ...createCompositionCard(0),
      dataType: 'single',
      particleBackend: 'cparticle',
      globalCParticleAuto: false
    }]
  });

  assert.equal(enabled.cards[0].particleBackend, 'cparticle');
  assert.equal(enabled.cards[0].globalCParticleAuto, false);

  const disabled = normalizeCompositionProject({ ...enabled, useCParticle: false });
  assert.equal(disabled.cards[0].particleBackend, 'cparticle');
  assert.equal(disabled.cards[0].globalCParticleAuto, false);
});

test('Composition migrates the legacy global GPU alias without pinning the new switch', () => {
  const migrated = normalizeCompositionProject({
    globalUseCParticle: true,
    cards: [{ ...createCompositionCard(0), dataType: 'single' }]
  });
  assert.equal(Object.hasOwn(migrated, 'globalUseCParticle'), false);
  migrated.useCParticle = false;

  const disabled = normalizeCompositionProject(migrated);
  assert.equal(disabled.useCParticle, false);
  assert.equal(disabled.cards[0].particleBackend, 'single');
});

test('Composition global GPU single card emits CParticle Kotlin', () => {
  const project = normalizeCompositionProject({
    useCParticle: true,
    cards: [{
      ...createCompositionCard(0),
      dataType: 'single',
      bindMode: 'point',
      cparticleRenderLayer: 'TRANSLUCENT',
      randomAgePreTick: true
    }]
  });
  const kotlin = new CompositionCodegenFixture(project.cards[0]).generateKotlin();

  assert.match(kotlin, /ParticleDisplayer\.withCParticle\(it, CParticleRenderLayer\.TRANSLUCENT\)/);
  assert.match(kotlin, /\.addCParticleInstanceInit \{/);
  assert.match(kotlin, /randomAgePreTick = true/);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withSingle|addParticleInstanceInit/);
});

test('Composition GPU parent preserves nested Composition leaves on the GPU', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'particle_shape',
    useCParticle: true,
    shapeChildren: [{
      type: 'particle_shape',
      children: [{
        type: 'sequenced_shape',
        children: [{ type: 'single' }]
      }]
    }]
  });

  assert.deepEqual(findCompositionNestedShapePaths(card), [[0], [0, 0]]);
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();
  assert.equal((kotlin.match(/ParticleDisplayer\.withCParticle/g) || []).length, 1);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withSingle|addParticleInstanceInit/);
  assert.match(kotlin, /ParticleDisplayer\.withComposition/);
});

test('nested GPU Composition receives inherited outer rotation and scale actions', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'particle_shape',
    useCParticle: true,
    shapeDisplayActions: [{ type: 'rotateAsAxis', angleMode: 'expr', angleExpr: 'PI / 8' }],
    shapeScale: { type: 'linear', min: 0.5, max: 1, tick: 10 },
    shapeChildren: [{
      type: 'particle_shape',
      children: [{ type: 'single' }]
    }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.equal((kotlin.match(/rotateAsAxis\(PI \/ 8\)/g) || []).length, 2);
  assert.equal((kotlin.match(/loadScaleValue\(0\.5, 1, 10\)/g) || []).length, 2);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withSingle/);
  assert.match(kotlin, /ParticleDisplayer\.withCParticle/);
});


test('Composition GPU node emits dedicated displayer, init and field mappings without preTick', () => {
  const kotlin = new CompositionCodegenFixture(cparticleCard({
    randomAgePreTick: true,
    controllerVars: [{ name: 'progress', type: 'Double', expr: '0.0' }],
    controllerActions: [{ type: 'tick_js', script: 'particleAlpha = 0.5;' }]
  })).generateKotlin();

  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleRenderLayer/);
  assert.match(kotlin, /import java\.util\.UUID/);
  assert.match(kotlin, /ParticleDisplayer\.withCParticle\(it, CParticleRenderLayer\.TRANSLUCENT\)/);
  assert.match(kotlin, /\.addCParticleInstanceInit \{/);
  assert.match(kotlin, /effect = ControlableEndRodEffect\(UUID\.randomUUID\(\)\)/);
  assert.match(kotlin, /alpha = 0\.8F/);
  assert.match(kotlin, /age = 2/);
  assert.match(kotlin, /maxAge = 80/);
  assert.match(kotlin, /randomAgePreTick = true/);
  assert.doesNotMatch(kotlin, /Random\.nextInt\(maxAge/);
  assert.doesNotMatch(kotlin, /\n\s+alpha = 0f/);
  assert.doesNotMatch(kotlin, /\.addCParticleControlerInstanceInit \{|addPreTickAction|setAlpha\(0\.5F\)/);
  assert.doesNotMatch(kotlin, /addParticleInstanceInit|addParticleControlerInstanceInit/);
  assert.doesNotMatch(kotlin, /particleAlpha\s*=/);
});

test('Composition CPU Single keeps its particle controller preTick code', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'single',
    particleBackend: 'single',
    controllerVars: [{ name: 'progress', type: 'Double', expr: '0.0' }],
    controllerActions: [{ type: 'tick_js', script: 'particleAlpha = 0.5;' }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /\.addParticleControlerInstanceInit \{/);
  assert.match(kotlin, /var progress: Double = 0/);
  assert.match(kotlin, /addPreTickAction \{/);
  assert.match(kotlin, /particleAlpha = 0\.5/);
});

test('Composition Kotlin labels every card block with its card name', () => {
  const fixture = new CompositionCodegenFixture(cparticleCard({ name: '主粒子\n内圈' }));
  fixture.state.cards.push(cparticleCard({ id: 'gpu-card-2', name: '尾焰' }));

  const kotlin = fixture.generateKotlin();

  assert.match(kotlin, /        \/\/ 主粒子 内圈\n        result\[/);
  assert.match(kotlin, /        \/\/ 尾焰\n        result\[/);
  assert.ok(kotlin.indexOf('// 主粒子 内圈') < kotlin.indexOf('// 尾焰'));
});

test('Composition GPU card forces every leaf onto GPU while preserving leaf render settings', () => {
  const translucentLeaf = normalizeCompositionShapeNode({
    id: 'gpu-leaf-translucent',
    name: 'Translucent GPU leaf',
    type: 'single',
    bindMode: 'point',
    point: { x: 0, y: 0, z: 0 },
    effectClass: 'ControlableCloudEffect',
    useTexture: true,
    cparticleRenderLayer: 'TRANSLUCENT',
    randomAgePreTick: false,
    particleInit: [{ target: 'alpha', expr: '0.6' }]
  });
  const additiveLeaf = normalizeCompositionShapeNode({
    id: 'gpu-leaf-additive',
    name: 'Additive GPU leaf',
    type: 'single',
    bindMode: 'point',
    point: { x: 1, y: 0, z: 0 },
    effectClass: 'ControlableEndRodEffect',
    useTexture: true,
    cparticleRenderLayer: 'ADDITION_BLEND',
    randomAgePreTick: true,
    particleInit: []
  });
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'shape-card',
    bindMode: 'point',
    dataType: 'particle_shape',
    useCParticle: true,
    cparticleRenderLayer: 'OPAQUE',
    randomAgePreTick: true,
    shapeChildren: [translucentLeaf, additiveLeaf]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /ParticleDisplayer\.withCParticle\(it, CParticleRenderLayer\.TRANSLUCENT\)/);
  assert.match(kotlin, /ParticleDisplayer\.withCParticle\(it, CParticleRenderLayer\.ADDITION_BLEND\)/);
  assert.match(kotlin, /effect = ControlableCloudEffect\(UUID\.randomUUID\(\)\)/);
  assert.match(kotlin, /alpha = 0\.6F/);
  assert.equal((kotlin.match(/randomAgePreTick = true/g) || []).length, 1);
  assert.doesNotMatch(kotlin, /CParticleRenderLayer\.OPAQUE/);
  assert.match(kotlin, /randomAgePreTick = true/);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withSingle/);
});

test('Composition CPU card ignores stale child GPU flags', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'cpu-shape-card',
    bindMode: 'point',
    dataType: 'particle_shape',
    useCParticle: false,
    shapeChildren: [{
      type: 'single',
      useCParticle: true,
      cparticleRenderLayer: 'TRANSLUCENT',
      randomAgePreTick: true,
      particleInit: []
    }]
  });

  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /ParticleDisplayer\.withSingle/);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withCParticle|addCParticleInstanceInit|randomAgePreTick = true/);
});

test('Composition CParticle presets preserve render layer, effect and texture settings', () => {
  const source = cparticleCard({
    cparticleRenderLayer: 'OPAQUE',
    singleUseTexture: false,
    randomAgePreTick: true
  });
  const preset = createCompositionPreset({
    name: 'gpu-preset',
    sourceKind: 'card',
    target: source,
    now: 0
  });
  const validated = validateCompositionPreset(preset);
  const validatedLeaf = validated.sections.particle.children[0].sections.particle;
  assert.equal(validated.sections.particle.dataType, 'particle_shape');
  assert.equal(validated.sections.particle.useCParticle, true);
  assert.equal(validatedLeaf.cparticleRenderLayer, 'OPAQUE');
  assert.equal(validatedLeaf.effectClass, 'ControlableEndRodEffect');
  assert.equal(validatedLeaf.useTexture, false);
  assert.equal(validatedLeaf.randomAgePreTick, true);

  const applied = applyCompositionPreset(createCompositionCard(0), validated, ['particle'], 'card');
  const appliedLeaf = applied.shapeChildren[0];
  assert.equal(applied.dataType, 'particle_shape');
  assert.equal(applied.useCParticle, true);
  assert.equal(appliedLeaf.cparticleRenderLayer, 'OPAQUE');
  assert.equal(appliedLeaf.useTexture, false);
  assert.equal(appliedLeaf.randomAgePreTick, true);

  const legacyPreset = structuredClone(preset);
  const legacyLeaf = legacyPreset.sections.particle.children[0].sections.particle;
  delete legacyLeaf.randomAgePreTick;
  legacyLeaf.randomInitialAge = true;
  const legacyApplied = applyCompositionPreset(
    createCompositionCard(0),
    validateCompositionPreset(legacyPreset),
    ['particle'],
    'card'
  );
  assert.equal(legacyApplied.shapeChildren[0].randomAgePreTick, false);
  assert.equal(Object.hasOwn(legacyApplied.shapeChildren[0], 'randomInitialAge'), false);
});

test('Composition presets preserve a single-card CParticle backend', () => {
  const source = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'single',
    particleBackend: 'cparticle',
    cparticleRenderLayer: 'OPAQUE',
    randomAgePreTick: true
  });
  const preset = validateCompositionPreset(createCompositionPreset({
    name: 'single-gpu-preset',
    sourceKind: 'card',
    target: source,
    now: 0
  }));

  assert.equal(preset.sections.particle.dataType, 'single');
  assert.equal(preset.sections.particle.particleBackend, 'cparticle');

  const applied = applyCompositionPreset(createCompositionCard(0), preset, ['particle'], 'card');
  assert.equal(applied.dataType, 'single');
  assert.equal(applied.particleBackend, 'cparticle');
  assert.equal(applied.globalCParticleAuto, false);
  assert.equal(applied.cparticleRenderLayer, 'OPAQUE');
  assert.equal(applied.randomAgePreTick, true);
});

test('Composition preserves and emits every NOT_HDR CParticle render layer', () => {
  for (const layer of NOT_HDR_RENDER_LAYERS) {
    const card = cparticleCard({ cparticleRenderLayer: layer });
    assert.equal(card.shapeChildren[0].cparticleRenderLayer, layer);

    const node = normalizeCompositionShapeNode({ type: 'single', useCParticle: true, cparticleRenderLayer: layer });
    assert.equal(node.cparticleRenderLayer, layer);
    assert.equal(node.useCParticle, false);

    const preset = validateCompositionPreset(createCompositionPreset({
      name: `preset-${layer}`,
      sourceKind: 'card',
      target: card,
      now: 0
    }));
    assert.equal(preset.sections.particle.children[0].sections.particle.cparticleRenderLayer, layer);
    assert.equal(
      applyCompositionPreset(createCompositionCard(0), preset, ['particle'], 'card')
        .shapeChildren[0].cparticleRenderLayer,
      layer
    );

    assert.ok(
      new CompositionCodegenFixture(card).generateKotlin()
        .includes(`ParticleDisplayer.withCParticle(it, CParticleRenderLayer.${layer})`)
    );
  }
});

test('Composition CParticle init targets use GPU fields while texture stays in the effect controls', () => {
  const fixture = new TargetPresetFixture();
  const gpuOptions = fixture.getParticleInitTargetOptionsHtml('alpha', 'cparticle');
  const singleOptions = fixture.getParticleInitTargetOptionsHtml('particleAlpha', 'single');

  assert.match(gpuOptions, /value="alpha"/);
  assert.match(gpuOptions, /value="age"/);
  assert.match(gpuOptions, /value="maxAge"/);
  assert.match(gpuOptions, /value="alphaCurve"/);
  assert.match(gpuOptions, /value="scaleCurve"/);
  assert.match(gpuOptions, /value="colorCurve"/);
  assert.doesNotMatch(gpuOptions, /value="particleAlpha"|value="textureSheet"/);
  assert.match(singleOptions, /value="particleAlpha"/);
  assert.match(singleOptions, /value="textureSheet"/);
  assert.equal(fixture.getParticleInitDefaultExprByTarget('maxAge'), '20');
  assert.equal(fixture.getParticleInitDefaultExprByTarget('alphaCurve'), 'CParticleCurve.linear(1f, 0f)');
  assert.equal(
    fixture.getParticleInitDefaultExprByTarget('colorCurve'),
    'CParticleColorCurve.linear(Vector3f(1f, 1f, 1f), Vector3f(1f, 1f, 1f))'
  );
});

test('Composition emits native GPU lifecycle curves without a CParticle controller', () => {
  const kotlin = new CompositionCodegenFixture(cparticleCard({
    controllerActions: [],
    particleInit: [
      { target: 'alphaCurve', expr: 'CParticleCurve.linear(0f, 1f)' },
      { target: 'scaleCurve', expr: 'CParticleCurve.fadeInOut()' },
      {
        target: 'colorCurve',
        expr: 'CParticleColorCurve.linear(Vector3f(1f, 0f, 0f), Vector3f(0f, 0f, 1f))'
      }
    ]
  })).generateKotlin();

  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleCurve/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleColorCurve/);
  assert.match(kotlin, /alphaCurve = CParticleCurve\.linear\(0f, 1f\)/);
  assert.match(kotlin, /scaleCurve = CParticleCurve\.fadeInOut\(\)/);
  assert.match(kotlin, /colorCurve = CParticleColorCurve\.linear/);
  assert.doesNotMatch(kotlin, /addCParticleControlerInstanceInit/);
});

test('Composition GPU shape node emits its own fade-in and fade-out transitions', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'gpu-shape',
    bindMode: 'point',
    dataType: 'particle_shape',
    useCParticle: true,
    cparticleAlpha: {
      fadeIn: { enabled: true, durationTicks: 8, fromAlpha: 0.1, toAlpha: 0.9 },
      fadeOut: { enabled: true, durationTicks: 12, fromAlpha: 0.9, toAlpha: 0.2 }
    },
    shapeChildren: [{ type: 'single', particleInit: [] }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleCurve/);
  assert.match(kotlin, /if \(this@CParticleComposition\.status\.isDisable\(\)\)/);
  assert.match(kotlin, /durationTicks = 12(?:\.0)?f/);
  assert.match(kotlin, /CParticleCurve\.linear\(0\.9f, 0\.2f\)/);
  assert.match(kotlin, /durationTicks = 8(?:\.0)?f/);
  assert.match(kotlin, /CParticleCurve\.linear\(0\.1f, 0\.9f\)/);
});

test('Composition GPU fade-in initializes every leaf alpha to zero after other particle init', () => {
  const firstLeaf = normalizeCompositionShapeNode({
    id: 'fade-leaf-1',
    type: 'single',
    useTexture: false,
    particleInit: [{ target: 'alpha', expr: '0.8' }]
  });
  const secondLeaf = normalizeCompositionShapeNode({
    id: 'fade-leaf-2',
    type: 'single',
    useTexture: false,
    particleInit: [{ target: 'size', expr: '2' }]
  });
  const kotlin = new CompositionCodegenFixture(cparticleCard({
    shapeChildren: [firstLeaf, secondLeaf],
    cparticleAlpha: {
      fadeIn: { enabled: true, durationTicks: 8, fromAlpha: 0.1, toAlpha: 0.9 },
      fadeOut: { enabled: false }
    }
  })).generateKotlin();
  const initBodies = [...kotlin.matchAll(/\.addCParticleInstanceInit \{\n([\s\S]*?)\n\s+\}/g)]
    .map((match) => match[1].trim());

  assert.equal(initBodies.length, 2);
  assert.match(initBodies[0], /^alpha = 0\.8F\n\s*alpha = 0f$/);
  assert.match(initBodies[1], /^size = 2F\n\s*alpha = 0f$/);
});

test('Composition GPU fade-in creates an alpha-only particle init block when needed', () => {
  const kotlin = new CompositionCodegenFixture(cparticleCard({
    singleUseTexture: false,
    particleInit: [],
    controllerActions: [],
    cparticleAlpha: {
      fadeIn: { enabled: true, durationTicks: 8, fromAlpha: 0, toAlpha: 1 },
      fadeOut: { enabled: false }
    }
  })).generateKotlin();

  assert.match(kotlin, /\.addCParticleInstanceInit \{\n\s+alpha = 0f\n\s+\}/);
});

test('Composition GPU fade-out alone does not force initial alpha to zero', () => {
  const kotlin = new CompositionCodegenFixture(cparticleCard({
    cparticleAlpha: {
      fadeIn: { enabled: false },
      fadeOut: { enabled: true, durationTicks: 8, fromAlpha: 1, toAlpha: 0 }
    }
  })).generateKotlin();

  assert.doesNotMatch(kotlin, /\n\s+alpha = 0f/);
});

test('Composition codegen preserves nested GPU fade transitions without CPU leaves', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'gpu-shape',
    bindMode: 'point',
    dataType: 'particle_shape',
    useCParticle: true,
    cparticleAlpha: {
      fadeIn: { enabled: true, durationTicks: 8, fromAlpha: 0, toAlpha: 1 },
      fadeOut: { enabled: false }
    },
    shapeChildren: [{
      type: 'particle_shape',
      cparticleAlpha: {
        fadeIn: { enabled: true, durationTicks: 3, fromAlpha: 0.4, toAlpha: 0.7 },
        fadeOut: { enabled: true, durationTicks: 4, fromAlpha: 0.7, toAlpha: 0.2 }
      },
      children: [{ type: 'single', particleInit: [] }]
    }]
  });

  const kotlin = new CompositionCodegenFixture(card).generateKotlin();
  assert.equal((kotlin.match(/ParticleDisplayer\.withCParticle/g) || []).length, 1);
  assert.match(kotlin, /CParticleCurve\.linear\(0f, 1f\)/);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withSingle|addParticleInstanceInit/);
});

test('Nested GPU Composition owns its CParticle descendants and emits its own fade transitions', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'cpu-root-with-gpu-child',
    dataType: 'particle_shape',
    useCParticle: false,
    shapeChildren: [{
      id: 'inner-gpu-shape',
      type: 'particle_shape',
      useCParticle: true,
      cparticleAlpha: {
        fadeIn: { enabled: true, durationTicks: 5, fromAlpha: 0.2, toAlpha: 0.8 },
        fadeOut: { enabled: true, durationTicks: 6, fromAlpha: 0.8, toAlpha: 0.1 }
      },
      children: [{ type: 'single', particleInit: [] }]
    }]
  });

  assert.equal(compositionShapeNodeHasParticleLeaf(card.shapeChildren[0]), true);
  assert.equal(card.shapeChildren[0].useCParticle, true);
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();
  assert.equal((kotlin.match(/ParticleDisplayer\.withCParticle/g) || []).length, 1);
  assert.match(kotlin, /CParticleCurve\.linear\(0\.2f, 0\.8f\)/);
  assert.match(kotlin, /CParticleCurve\.linear\(0\.8f, 0\.1f\)/);
});

test('Root GPU Composition detects CParticle leaves stored in shapeChildren', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'particle_shape',
    useCParticle: true,
    shapeChildren: [{ type: 'single', particleBackend: 'cparticle' }]
  });

  assert.equal(compositionShapeNodeHasParticleLeaf(card), true);
});

test('GPU fade transitions follow the complete Composition subtree', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'particle_shape',
    useCParticle: true,
    cparticleAlpha: {
      fadeIn: { enabled: true, durationTicks: 2, fromAlpha: 0.11, toAlpha: 0.22 },
      fadeOut: { enabled: false }
    },
    shapeChildren: [{
      type: 'particle_shape',
      useCParticle: true,
      cparticleAlpha: {
        fadeIn: { enabled: true, durationTicks: 3, fromAlpha: 0.33, toAlpha: 0.44 },
        fadeOut: { enabled: false }
      },
      children: [{ type: 'single', particleInit: [] }]
    }]
  });

  const kotlin = new CompositionCodegenFixture(card).generateKotlin();
  assert.match(kotlin, /CParticleCurve\.linear\(0\.11f, 0\.22f\)/);
  assert.match(kotlin, /CParticleCurve\.linear\(0\.33f, 0\.44f\)/);
});

test('Composition codegen keeps global GPU Composition cards on the GPU', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    dataType: 'particle_shape',
    shapeChildren: [{ type: 'single', particleInit: [] }]
  });
  const fixture = new CompositionCodegenFixture(card);
  fixture.state.useCParticle = true;
  fixture.state.cards[0].useCParticle = true;

  const kotlin = fixture.generateKotlin();
  assert.match(kotlin, /ParticleDisplayer\.withCParticle/);
  assert.doesNotMatch(kotlin, /ParticleDisplayer\.withSingle|addParticleInstanceInit/);
});

test('Composition project alpha does not implicitly control GPU nodes', () => {
  const kotlin = new CompositionCodegenFixture(cparticleCard(), {
    type: 'linear',
    runMode: 'auto',
    min: 0.2,
    max: 0.9,
    tick: 12,
    startMax: false,
    decreaseOnDisable: true
  }).generateKotlin();

  assert.doesNotMatch(kotlin, /playCParticleAlphaTransition\(/);
  assert.doesNotMatch(kotlin, /cparticleAlphaTransitionDirection/);
});

test('Sequenced shape applyBuilder receives order and assigns it to CompositionData', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'sequenced-shape',
    bindMode: 'point',
    dataType: 'sequenced_shape',
    shapeChildren: [{ type: 'single', bindMode: 'builder', particleInit: [] }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /\) \{ shapeRel1, order ->\s+CompositionData\(\)\.apply \{ this\.order = order \}/);
});

test('direct project cards compute rel from the root composition inside preTick', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'direct-card',
    bindMode: 'point',
    point: { x: 1, y: 2, z: 3 },
    dataType: 'single',
    controllerActions: [{ type: 'tick_js', script: 'rotateToPoint(rel)' }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(
    kotlin,
    /addPreTickAction \{\s+val rel1 = \(this@CParticleComposition\.position - this\.position\)\.asRelative\(\)\s+rotateToPoint\(rel1\)/
  );
  assert.match(kotlin, /\] = RelativeLocation\(1, 2, 3\)/);
  assert.doesNotMatch(kotlin, /RelativeLocation\(1, 2, 3\)\.let \{ rel ->/);
});

test('nested cards keep shapeRel for the parent offset and compute rel from the project root', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'shape-card',
    bindMode: 'point',
    dataType: 'particle_shape',
    useCParticle: false,
    shapeChildren: [{
      id: 'nested-particle',
      type: 'single',
      bindMode: 'point',
      point: { x: 4, y: 5, z: 6 },
      particleInit: [],
      controllerActions: [{
        type: 'tick_js',
        script: 'rotateToPoint(rel); rotateToPoint(shapeRel1)'
      }]
    }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /applyPoint\(RelativeLocation\(4, 5, 6\)\) \{ shapeRel1 ->/);
  assert.match(
    kotlin,
    /addPreTickAction \{\s+val rel2 = \(this@CParticleComposition\.position - this\.position\)\.asRelative\(\)\s+rotateToPoint\(rel2\); rotateToPoint\(shapeRel1\)/
  );
});

test('nested Composition preTick uses root-relative rel without replacing shapeRel', () => {
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'outer-shape',
    bindMode: 'point',
    dataType: 'particle_shape',
    useCParticle: false,
    shapeChildren: [{
      id: 'inner-shape',
      type: 'particle_shape',
      bindMode: 'point',
      point: { x: 2, y: 3, z: 4 },
      displayActions: [{
        type: 'expression',
        expression: 'rotateToPoint(rel); rotateToPoint(shapeRel1)'
      }],
      children: [{ type: 'single', bindMode: 'point', particleInit: [] }]
    }]
  });
  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  assert.match(kotlin, /applyPoint\(RelativeLocation\(2, 3, 4\)\) \{ shapeRel1 ->/);
  assert.match(
    kotlin,
    /applyDisplayAction \{\s+addPreTickAction \{\s+val rel2 = \(this@CParticleComposition\.position - this\.position\)\.asRelative\(\)\s+rotateToPoint\(rel2\); rotateToPoint\(shapeRel1\)/
  );
});

test('Composition local controllers repeat at every nested Composition depth', () => {
  const leaf = normalizeCompositionShapeNode({
    id: 'deep-leaf',
    type: 'single',
    particleInit: []
  });
  const inner = normalizeCompositionShapeNode({
    id: 'inner-comp',
    type: 'particle_shape',
    controllerVars: [{ name: 'innerValue', type: 'Double', expr: '1.0' }],
    controllerActions: [{ type: 'tick_js', script: 'innerValue += 1.0; rotateToPoint(rel)' }],
    children: [leaf]
  });
  const middle = normalizeCompositionShapeNode({
    id: 'middle-comp',
    type: 'particle_shape',
    controllerVars: [{ name: 'middleValue', type: 'Double', expr: '2.0' }],
    controllerActions: [{ type: 'tick_js', script: 'middleValue += 1.0; rotateToPoint(rel)' }],
    children: [inner]
  });
  const card = normalizeCompositionCard({
    ...createCompositionCard(0),
    id: 'root-comp',
    dataType: 'particle_shape',
    controllerVars: [{ name: 'rootValue', type: 'Double', expr: '3.0' }],
    controllerActions: [{ type: 'tick_js', script: 'rootValue += 1.0; rotateToPoint(rel)' }],
    shapeChildren: [middle]
  });

  const kotlin = new CompositionCodegenFixture(card).generateKotlin();

  for (const name of ['rootValue', 'middleValue', 'innerValue']) {
    assert.equal((kotlin.match(new RegExp(`var ${name}: Double`, 'g')) || []).length, 1);
  }
  assert.ok((kotlin.match(/addPreTickAction \{/g) || []).length >= 3);
  assert.match(kotlin, /var rootValue: Double = 3/);
  assert.match(kotlin, /var middleValue: Double = 2/);
  assert.match(kotlin, /var innerValue: Double = 1/);
  assert.match(kotlin, /rootValue \+= 1\.0/);
  assert.match(kotlin, /middleValue \+= 1\.0/);
  assert.match(kotlin, /innerValue \+= 1\.0/);
  assert.match(kotlin, /val rel1 = /);
  assert.match(kotlin, /val rel2 = /);
  assert.match(kotlin, /val rel3 = /);
});

test('runtime rel rewriting ignores strings, comments and member properties', () => {
  const fixture = new CompositionCodegenFixture(cparticleCard());
  const source = 'val label = "rel"\n// rel\nholder.rel';

  assert.deepEqual(fixture.rewritePreTickRuntimeRel(source, 2), {
    code: source,
    used: false,
    relName: 'rel2'
  });
  assert.deepEqual(fixture.rewritePreTickRuntimeRel('rotateToPoint(rel)', 3), {
    code: 'rotateToPoint(rel3)',
    used: true,
    relName: 'rel3'
  });
});

test('Composition does not generate legacy CParticle controller configuration', () => {
  const kotlin = new CompositionCodegenFixture(cparticleCard({
    controllerVars: [{ name: 'progress', type: 'Double', expr: 'currentAge / maxAge' }],
    controllerActions: [{ type: 'tick_js', script: 'particle.teleportTo(Vec3(1, 2, 3));' }]
  })).generateKotlin();

  assert.doesNotMatch(kotlin, /addCParticleControlerInstanceInit|addPreTickAction|currentAge \/ maxAge|teleportTo/);
});

test('Composition editor keeps GPU and fades on the card root and leaf render settings on GPU children', async () => {
  const [source, presetSource] = await Promise.all([
    readFile(new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/composition_preset_mixin.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(source, /value="cparticle"[^>]*>C粒子</);
  assert.match(source, /CParticle RenderLayer/);
  assert.match(source, /const isRootCard = !treePath/);
  assert.match(source, /const rootCard = isRootCard \? target : opts\.card/);
  assert.match(source, /const rootGpuEnabled = isCompositionCardUsingCParticle\(rootCard\)/);
  assert.match(source, /compositionShapeNodeHasParticleLeaf\(target\)/);
  assert.match(source, /isTreeNodeCParticleEnabled\(rootCard, parentPath\)/);
  assert.match(source, /data-tree-node-field="useCParticle"/);
  assert.match(source, /nestedFadeBox/);
  assert.match(source, /renderSingleGpuSettings\(card\)/);
  assert.match(source, /CParticle 不支持 preTick action/);
  assert.match(source, /const isGpuCParticle = isCompositionCardUsingCParticle\(card\)/);
  assert.match(source, /const controllerBlock = isGpuCParticle/);
  assert.match(source, /data-card-field="useCParticle"/);
  assert.match(source, /id="chkGlobalCParticle"[^>]*data-pf="useCParticle"/);
  assert.match(source, /resolveLoadedCParticleConflicts\(\)/);
  assert.match(source, /normalizeStateShape\(this\.state\)/);
  assert.match(source, /GPU Composition/);
  assert.match(source, /getShapeNodeTypeLabel\(card, child\)/);
  assert.doesNotMatch(source, /GPU 粒子卡片含有嵌套 Composition/);
  assert.doesNotMatch(source, /card\.useCParticle === true && isCompositionShapeType\(requestedType\)/);
  assert.doesNotMatch(source, /全局 GPU 粒子已启用，所有卡片只能使用 CParticle/);
  assert.match(source, /data-tree-node-field="useCParticle"/);
  assert.match(source, /isRootCard \? "data-card-field" : "data-tree-node-field"/);
  assert.match(source, /=\"cparticleRenderLayer\"/);
  assert.match(source, /=\"randomAgePreTick\"/);
  assert.match(source, /cparticle-fade-grid/);
  assert.match(source, /renderFade\("fadeIn", "淡入"\)/);
  assert.match(source, /renderFade\("fadeOut", "淡出"\)/);
  assert.match(source, /每 Tick 随机动画帧/);
  assert.doesNotMatch(source, /随机初始生命周期/);
  for (const layer of NOT_HDR_RENDER_LAYERS) assert.ok(source.includes(`"${layer}"`));
  assert.doesNotMatch(source, /当前节点是 single/);
  assert.match(source, /isCompositionLeafParticleType\(node\.type \|\| "single"\)\) return/);
  const singleInspector = source.slice(
    source.indexOf('    renderSingleInspectorPanel(card) {'),
    source.indexOf('    renderShapeStackPanel(card) {')
  );
  assert.doesNotMatch(singleInspector, /renderCParticleNodeSettings/);
  assert.doesNotMatch(presetSource, /全局 GPU 粒子已启用，不能应用 Composition 预设/);
  assert.doesNotMatch(presetSource, /GPU 粒子卡片不能包含嵌套 Composition/);
  assert.doesNotMatch(presetSource, /GPU 粒子卡片的子节点只能使用 CParticle/);
});
