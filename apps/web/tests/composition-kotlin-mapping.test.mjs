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
  rewriteClassQualifier: (value) => String(value || ''),
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
CompositionCodegenFixture.prototype.buildParticlesMethod = () => [
  '    override fun getParticles(): Map<CompositionData, RelativeLocation> {',
  '        return emptyMap()',
  '    }'
].join('\n');

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
  assert.match(mojmap, /import net\.minecraft\.world\.level\.Level/);
  assert.match(mojmap, /import net\.minecraft\.world\.phys\.Vec3/);
  assert.match(mojmap, /import net\.minecraft\.client\.particle\.ParticleRenderType/);
  assert.match(mojmap, /class MappedComposition\(position: Vec3, world: Level\? = null\)/);
  assert.match(mojmap, /var direction: Vec3 = Vec3\.ZERO/);
  assert.doesNotMatch(mojmap, /net\.minecraft\.util\.math\.Vec3d/);
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

  assert.match(htmlSource, /composition-builder\.page\.js\?v=20260726_3/);
  assert.match(htmlSource, /composition_builder\/css\/style\.css\?v=20260726_3/);
  assert.match(pageSource, /main\.js\?v=20260726_3/);
  assert.match(mainSource, /composition_preset_mixin\.js\?v=20260726_3/);
  assert.match(mainSource, /expression_runtime\.js\?v=20260725_3/);
  assert.match(mainSource, /vector_value_utils\.js\?v=20260720_1/);
  assert.match(mainSource, /preview_runtime_mixin\.js\?v=20260725_6/);
  assert.match(modelSource, /vector_value_utils\.js\?v=20260720_1/);
  assert.match(previewSource, /preview_render_cache_worker\.js\?v=20260725_5/);
  assert.match(workerSource, /expression_runtime\.js\?v=20260725_3/);
  assert.match(workerSource, /preview_runtime_mixin\.js\?v=20260725_6/);
  assert.ok((previewSource.match(/src === "Vec3\.ZERO" \|\| src === "Vec3d\.ZERO"/g) || []).length >= 2);
  assert.ok((previewSource.match(/Vec3\|Vec3d\|RelativeLocation\|Vector3f/g) || []).length >= 2);
});
