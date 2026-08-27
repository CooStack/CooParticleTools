import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CPARTICLE_FORCE_MAX_COMMANDS,
  CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND,
  CPARTICLE_FORCE_TYPE_OPTIONS,
  collectCParticleForceWarnings,
  createCParticleForceCommand,
  createDefaultCParticleForceParameters,
  createEmitterCard,
  createGeneratorProject,
  nextAvailableCParticleCommandMaskValue,
  nextAvailableCParticleDefinitionName,
  nextAvailableCParticleSignValue,
  normalizeGeneratorProject
} from '../src/modules/generator/defaults.js';
import {
  collectCParticleCompatibilityErrors,
  generateEmitterKotlin
} from '../src/modules/generator/codegen.js';

function command(type, params = {}, id = type) {
  return { id, enabled: true, tick: 12, type, label: type, params };
}

function forceCommand(type, parameters = {}, selector = { type: 'All' }, id = type) {
  return createCParticleForceCommand({
    id,
    label: type,
    force: {
      type,
      parameters: { ...createDefaultCParticleForceParameters(type), ...parameters }
    },
    selector
  });
}

test('generator stores GPU routing on each emitter card', () => {
  const defaults = createGeneratorProject();
  assert.equal(defaults.schemaVersion, 13);
  assert.equal(defaults.emitters[0].useGPU, false);
  assert.deepEqual(defaults.emitters[0].gpu, {
    updateMode: 'static',
    randomSeed: null,
    useDataColorCurve: false,
    signRef: '',
    commandMaskRefs: [],
    metadataFlags: 0,
    charge: null,
    radius: 0
  });
  assert.equal(defaults.emitters[0].emitter.type, 'point');
  assert.deepEqual(defaults.emitters[0].particle, {
    countMin: 10,
    countMax: 20,
    lifeMin: 10,
    lifeMax: 20,
    sizeMin: 0.1,
    sizeMax: 0.2,
    colorGradientEnabled: false,
    colorStart: '#ffffff',
    colorEnd: '#ffffff',
    velocityMode: 'fixed',
    velocity: { x: 0, y: 0, z: 0 },
    velocityRandom: { x: 0.04, y: 0.04, z: 0.04 },
    speedMin: 0.1,
    speedMax: 0.3,
    visibleRange: 128
  });
  const normalized = normalizeGeneratorProject({ schemaVersion: 13, emitters: [{}] }).emitters[0];
  assert.equal(normalized.emitter.type, 'point');
  assert.deepEqual(normalized.particle, defaults.emitters[0].particle);
  assert.equal(defaults.emitters[0].render.relativeRotation, false);
  assert.deepEqual(defaults.forceCommands, []);
  assert.deepEqual(defaults.signs, []);
  assert.deepEqual(defaults.commandMasks, []);
  assert.deepEqual(defaults.forceResources, []);
  assert.equal(Object.hasOwn(defaults, 'gpuCommands'), false);
  assert.equal(Object.hasOwn(defaults, 'cparticleForces'), false);
  assert.equal(Object.hasOwn(defaults, 'particleBackend'), false);
});

test('every CParticle Force Command displays an English and Chinese name without changing its id', () => {
  assert.deepEqual(
    CPARTICLE_FORCE_TYPE_OPTIONS.map(({ id, label }) => [id, label]),
    [
      ['Gravity', 'Gravity（重力）'],
      ['EnvDrag', 'EnvDrag（环境阻力）'],
      ['ExpDrag', 'ExpDrag（指数阻力）'],
      ['Wind', 'Wind（风力）'],
      ['Vortex', 'Vortex（漩涡）'],
      ['Attraction', 'Attraction（吸引力）'],
      ['RotationForce', 'RotationForce（旋转力）'],
      ['Noise', 'Noise（噪声力）'],
      ['FlowField', 'FlowField（流场）'],
      ['Radial', 'Radial（径向力）'],
      ['DirectionalWind', 'DirectionalWind（定向风力）'],
      ['BlenderVortex', 'BlenderVortex（Blender 漩涡）'],
      ['Magnetic', 'Magnetic（磁场力）'],
      ['Harmonic', 'Harmonic（弹簧力）'],
      ['VelocityDrag', 'VelocityDrag（速度阻力）'],
      ['Charge', 'Charge（电荷力）'],
      ['LennardJones', 'LennardJones（伦纳德-琼斯力）'],
      ['Turbulence', 'Turbulence（湍流）'],
      ['Texture', 'Texture（纹理力）'],
      ['FluidFlow', 'FluidFlow（流体流动力）']
    ]
  );
});

test('commandMask fallback values cover all 32 Int bits', () => {
  const normalized = normalizeGeneratorProject({
    commandMasks: Array.from({ length: 32 }, () => undefined)
  });

  assert.equal(normalized.commandMasks[0].value, 1);
  assert.equal(normalized.commandMasks[30].value, 1 << 30);
  assert.equal(normalized.commandMasks[31].value, -2147483648);
});

test('new named values reuse deleted gaps without duplicating existing values', () => {
  assert.equal(nextAvailableCParticleSignValue([
    { value: 1 },
    { value: 3 }
  ]), 2);
  assert.equal(nextAvailableCParticleCommandMaskValue([
    { value: 1 },
    { value: 4 }
  ]), 2);
  assert.equal(nextAvailableCParticleCommandMaskValue(Array.from({ length: 32 }, (_, bit) => ({
    value: bit === 31 ? -2147483648 : 1 << bit
  }))), null);
});

test('new named values avoid Kotlin constant collisions after deletion', () => {
  assert.equal(nextAvailableCParticleDefinitionName([
    { name: 'sign_1' },
    { name: 'sign-2' },
    { name: 'sign_3' }
  ], 'sign', 'SIGN'), 'sign_4');
  assert.equal(nextAvailableCParticleDefinitionName([
    { name: 'command_1' },
    { name: 'command_3' }
  ], 'command', 'COMMAND_MASK'), 'command_2');
});

test('generator migrates the removed project-level CParticle backend', () => {
  const normalized = normalizeGeneratorProject({
    particleBackend: {
      type: 'cparticle',
      cparticleCapacity: 8192,
      cparticleUpdateMode: 'dynamic'
    },
    emitters: [createEmitterCard({ id: 'legacy-a' }), createEmitterCard({ id: 'legacy-b' })],
    commandQueues: [{
      id: 'legacy-gpu-forces',
      name: 'Legacy GPU forces',
      signs: [7],
      commands: [command('drag', { damping: 0.2 }), command('orbit')]
    }]
  });

  assert.equal(normalized.schemaVersion, 13);
  assert.deepEqual(normalized.emitters.map((card) => card.useGPU), [true, true]);
  assert.deepEqual(normalized.emitters.map((card) => card.gpu.updateMode), ['dynamic', 'dynamic']);
  assert.deepEqual(normalized.forceCommands, []);
  assert.equal(normalized.commandQueues[0].commands.length, 2);
  assert.equal(Object.hasOwn(normalized, 'particleBackend'), false);
});

test('CParticle Force type list matches the current public API', () => {
  assert.deepEqual(CPARTICLE_FORCE_TYPE_OPTIONS.map((item) => item.id), [
    'Gravity',
    'EnvDrag',
    'ExpDrag',
    'Wind',
    'Vortex',
    'Attraction',
    'RotationForce',
    'Noise',
    'FlowField',
    'Radial',
    'DirectionalWind',
    'BlenderVortex',
    'Magnetic',
    'Harmonic',
    'VelocityDrag',
    'Charge',
    'LennardJones',
    'Turbulence',
    'Texture',
    'FluidFlow'
  ]);
});

test('current Force defaults expose complete Vec3 and Magnetic enum parameters', () => {
  const radial = createDefaultCParticleForceParameters('Radial');
  const directionalWind = createDefaultCParticleForceParameters('DirectionalWind');
  const magnetic = createDefaultCParticleForceParameters('Magnetic');

  assert.deepEqual(
    [radial.falloffAxisX, radial.falloffAxisY, radial.falloffAxisZ],
    [0, 0, 1]
  );
  assert.deepEqual(
    [directionalWind.centerX, directionalWind.centerY, directionalWind.centerZ],
    [0, 0, 0]
  );
  assert.equal(Object.hasOwn(directionalWind, 'falloffAxisX'), false);
  assert.equal(Object.hasOwn(magnetic, 'falloffAxisX'), false);
  assert.equal(magnetic.fieldMode, 'LINE');
});

test('legacy Magnetic wire values migrate to public enum names', () => {
  const project = normalizeGeneratorProject({
    forceCommands: [0, 1, 2].map((fieldMode) => ({
      enabled: true,
      label: `magnetic-${fieldMode}`,
      force: { type: 'Magnetic', parameters: { fieldMode } },
      selector: { type: 'All' }
    }))
  });

  assert.deepEqual(
    project.forceCommands.map((command) => command.force.parameters.fieldMode),
    ['LINE', 'PLANE', 'POINT']
  );
});

test('legacy cparticleForces and gpuCommands migrate to forceCommands with All selectors', () => {
  const fromListApi = normalizeGeneratorProject({
    cparticleForces: [
      { type: 'Vortex', params: { centerX: 1, centerY: 2, centerZ: 3 } },
      { type: 'ExpDrag', params: { damping: 0.2 } }
    ]
  });
  assert.deepEqual(fromListApi.forceCommands.map((item) => item.force.type), ['Vortex', 'ExpDrag']);
  assert.deepEqual(fromListApi.forceCommands.map((item) => item.selector.type), ['All', 'All']);
  assert.equal(Object.hasOwn(fromListApi, 'cparticleForces'), false);

  const fromOldEditor = normalizeGeneratorProject({
    gpuCommands: [command('vortex', { centerX: 1, centerY: 2, centerZ: 3 }), command('drag', { damping: 0.3 })]
  });
  assert.deepEqual(fromOldEditor.forceCommands.map((item) => item.force.type), ['Vortex', 'ExpDrag']);
  assert.equal(Object.hasOwn(fromOldEditor, 'gpuCommands'), false);
});

test('migrated Force lists generate only the sink submission API', () => {
  const project = normalizeGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    cparticleForces: [
      { type: 'Gravity', params: { accelX: 0, accelY: -0.08, accelZ: 0 } },
      { type: 'ExpDrag', params: { damping: 0.2 } }
    ]
  });
  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /override fun submitCParticleForces\(sink: CParticleForceSink\)/);
  assert.equal(kotlin.match(/sink\.submit\(/g)?.length, 2);
  assert.doesNotMatch(kotlin, /cparticleForces\(\): List<CParticleForce>|override fun cparticleForces/);
});

test('Force selectors preserve order, skip disabled commands, and warn for runtime source IDs', () => {
  const project = createGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    signs: [{ id: 'sign-smoke', name: 'smoke trail', value: 6 }],
    commandMasks: [{ id: 'mask-wind', name: 'wind', value: 1 }],
    forceCommands: [
      forceCommand('Gravity', {}, { type: 'All' }, 'all'),
      { ...forceCommand('EnvDrag', {}, { type: 'All' }, 'disabled'), enabled: false },
      forceCommand('ExpDrag', {}, { type: 'SignEquals', signRef: 'sign-smoke' }, 'sign-equals'),
      forceCommand('Noise', {}, { type: 'SignMask', signRef: 'sign-smoke', signMask: 7 }, 'sign-mask'),
      forceCommand('FlowField', {}, { type: 'CommandMask', commandMaskRefs: ['mask-wind'] }, 'command-mask'),
      forceCommand('Vortex', {}, { type: 'SourceEquals', sourceId: 3 }, 'source-equals'),
      forceCommand('RotationForce', {}, { type: 'SourceMask', sourceId: 4, sourceMask: 7 }, 'source-mask')
    ]
  });

  assert.deepEqual(collectCParticleCompatibilityErrors(project), []);
  assert.deepEqual(collectCParticleForceWarnings(project), [
    'Force Command“Vortex”使用运行时 sourceId；它不是可持久化 emitter ID，也不能填写 UUID、字符串 ID 或资源 ID。',
    'Force Command“RotationForce”使用运行时 sourceId；它不是可持久化 emitter ID，也不能填写 UUID、字符串 ID 或资源 ID。'
  ]);

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /sink\.submit\(CParticleForce\.Gravity\([^\n]+\)\)/);
  assert.doesNotMatch(kotlin, /CParticleForce\.EnvDrag/);
  assert.match(kotlin, /CParticleSelector\.SignEquals\(SIGN_SMOKE_TRAIL\)/);
  assert.match(kotlin, /CParticleSelector\.SignMask\(SIGN_SMOKE_TRAIL, 7\)/);
  assert.match(kotlin, /CParticleSelector\.CommandMask\(COMMAND_MASK_WIND\)/);
  assert.match(kotlin, /CParticleSelector\.SourceEquals\(3\)/);
  assert.match(kotlin, /CParticleSelector\.SourceMask\(4, 7\)/);
  assert.ok(kotlin.indexOf('CParticleForce.Gravity') < kotlin.indexOf('CParticleForce.ExpDrag'));
  assert.ok(kotlin.indexOf('CParticleForce.ExpDrag') < kotlin.indexOf('CParticleForce.Noise'));
});

test('disabled GPU emitters do not validate or emit unused named constants', () => {
  const disabled = createEmitterCard({
    enabled: false,
    useGPU: true,
    gpu: {
      signRef: 'sign-disabled',
      commandMaskRefs: ['mask-disabled'],
      metadataFlags: 0,
      charge: null,
      radius: 0
    }
  });
  const project = createGeneratorProject({
    emitters: [disabled, createEmitterCard()],
    signs: [{ id: 'sign-disabled', name: 'disabled', value: 9 }],
    commandMasks: [{ id: 'mask-disabled', name: 'disabled', value: 1 }]
  });

  assert.deepEqual(collectCParticleCompatibilityErrors(project), []);
  const kotlin = generateEmitterKotlin(project);
  assert.doesNotMatch(kotlin, /SIGN_DISABLED|COMMAND_MASK_DISABLED/);
});

test('named mask constants reject empty, duplicate, out-of-range, and stale references', () => {
  const gpu = createEmitterCard({
    name: 'GPU',
    useGPU: true,
    gpu: { signRef: 'missing-sign', commandMaskRefs: ['missing-mask'], metadataFlags: 2147483648 }
  });
  const project = createGeneratorProject({
    emitters: [gpu],
    signs: [{ id: 'blank', name: '', value: 1 }],
    commandMasks: [
      { id: 'mask-a', name: 'wind-mask', value: 1 },
      { id: 'mask-b', name: 'wind mask', value: 2147483648 }
    ]
  });
  const errors = collectCParticleCompatibilityErrors(project);

  assert.ok(errors.includes('sign 标签 #1 的名称不能为空。'));
  assert.ok(errors.includes('commandMask“wind mask”与“wind-mask”会生成重复常量 COMMAND_MASK_WIND_MASK。'));
  assert.ok(errors.includes('commandMask“wind mask”的值必须是 32-bit Int。'));
  assert.ok(errors.includes('发射器“GPU”引用了不存在的 sign 标签。'));
  assert.ok(errors.includes('发射器“GPU”引用了不存在的 commandMask。'));
  assert.ok(errors.includes('发射器“GPU”的 metadataFlags 必须是 32-bit Int。'));
});

test('Texture and FluidFlow forces use ResourceLocation resources and explicit falloff enums', () => {
  const forceResources = [
    { id: 'texture-wind', name: 'wind texture', kind: 'texture', location: 'examplemod:textures/force/wind.png' },
    { id: 'fluid-wind', name: 'wind volume', kind: 'fluid', location: 'examplemod:flow/wind_tunnel' }
  ];
  const texture = forceCommand('Texture', {
    resourceRef: 'texture-wind',
    mode: 'GRADIENT',
    minDistance: 1,
    maxDistance: null,
    power: 3,
    shape: 'CONE',
    zDirection: 'POSITIVE',
    falloffAxisX: 1,
    falloffAxisY: 2,
    falloffAxisZ: 3
  });
  const fluid = forceCommand('FluidFlow', {
    resourceRef: 'fluid-wind',
    useDensity: true,
    flowDrag: 0.25,
    shape: 'TUBE',
    zDirection: 'NEGATIVE'
  });
  const mojmap = generateEmitterKotlin(createGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceResources,
    forceCommands: [texture, fluid]
  }));
  const yarn = generateEmitterKotlin(createGeneratorProject({
    kotlin: { mapping: 'yarn' },
    emitters: [createEmitterCard({ useGPU: true })],
    forceResources,
    forceCommands: [texture, fluid]
  }));

  assert.match(mojmap, /CParticleTextureResource\(ResourceLocation\.fromNamespaceAndPath\("examplemod", "textures\/force\/wind\.png"\)\)/);
  assert.match(mojmap, /CParticleTextureForceMode\.GRADIENT/);
  assert.match(mojmap, /maxDistance = Double\.POSITIVE_INFINITY/);
  assert.match(mojmap, /shape = CParticleFalloffShape\.CONE/);
  assert.match(mojmap, /zDirection = CParticleZDirection\.POSITIVE/);
  assert.match(mojmap, /axis = Vec3\(1\.0, 2\.0, 3\.0\)/);
  assert.match(mojmap, /CParticleFluidResource\(ResourceLocation\.fromNamespaceAndPath\("examplemod", "flow\/wind_tunnel"\)\)/);
  assert.match(mojmap, /useDensity = true, flowDrag = 0\.25/);
  assert.match(yarn, /CParticleTextureResource\(Identifier\.of\("examplemod", "textures\/force\/wind\.png"\)\)/);
  assert.match(yarn, /CParticleFluidResource\(Identifier\.of\("examplemod", "flow\/wind_tunnel"\)\)/);
  assert.doesNotMatch(mojmap, /textureId|ssboId|glTexture/i);
});

test('DirectionalWind and Magnetic use the current public constructor parameters', () => {
  const project = createGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceCommands: [
      forceCommand('DirectionalWind', {
        centerX: 4,
        centerY: 5,
        centerZ: 6
      }),
      forceCommand('Magnetic', { fieldMode: 'POINT' })
    ]
  });
  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /CParticleForce\.DirectionalWind\([^\n]+center = Vec3\(4\.0, 5\.0, 6\.0\)\)/);
  const directionalWindLine = kotlin.split('\n').find((line) => line.includes('CParticleForce.DirectionalWind')) || '';
  const magneticLine = kotlin.split('\n').find((line) => line.includes('CParticleForce.Magnetic')) || '';
  assert.doesNotMatch(directionalWindLine, /falloff = CParticleFalloff\([^\n]+axis =/);
  assert.doesNotMatch(magneticLine, /falloff = CParticleFalloff\([^\n]+axis =/);
  assert.match(kotlin, /fieldMode = CParticleMagneticFieldMode\.POINT/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.force\.CParticleMagneticFieldMode/);
});

test('unknown Selectors remain visible to compatibility validation', () => {
  const project = normalizeGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceCommands: [{
      id: 'future-selector',
      enabled: true,
      label: 'future selector',
      force: { type: 'Gravity', parameters: {} },
      selector: { type: 'FutureSelector' }
    }]
  });

  assert.equal(project.forceCommands[0].selector.type, 'FutureSelector');
  assert.deepEqual(collectCParticleCompatibilityErrors(project), [
    'Force Command“future selector”的 Selector 类型无效。'
  ]);
  assert.throws(() => generateEmitterKotlin(project), /Selector 类型无效/);
});

test('Force resources enforce the runtime limit per resource kind', () => {
  const resources = Array.from({ length: CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND + 1 }, (_, index) => ({
    id: `texture-${index}`,
    name: `texture ${index}`,
    kind: 'texture',
    location: `examplemod:textures/force/${index}.png`
  }));
  const project = createGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceResources: resources,
    forceCommands: resources.map((resource) => forceCommand('Texture', { resourceRef: resource.id }))
  });

  assert.deepEqual(collectCParticleCompatibilityErrors(project), [
    `CParticle Texture Force 最多可同时使用 ${CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND} 个不同资源，当前为 ${CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND + 1} 个。`
  ]);
});

test('Force imports are emitted only for the APIs used by enabled commands', () => {
  const kotlin = generateEmitterKotlin(createGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceCommands: [forceCommand('Gravity')]
  }));

  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.force\.CParticleForce/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.force\.CParticleForceSink/);
  assert.doesNotMatch(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.force\.CParticleSelector/);
  assert.doesNotMatch(kotlin, /CParticleFalloffShape|CParticleTextureResource|CParticleFluidResource|ResourceLocation|Identifier/);
});

test('Force project data survives JSON save and reopen', () => {
  const original = createGeneratorProject({
    leftTab: 'cparticle_masks',
    emitters: [createEmitterCard({
      useGPU: true,
      gpu: {
        signRef: 'sign-smoke',
        commandMaskRefs: ['mask-wind'],
        metadataFlags: 3,
        charge: null,
        radius: 0.5
      }
    })],
    signs: [{ id: 'sign-smoke', name: 'smoke', value: 2 }],
    commandMasks: [{ id: 'mask-wind', name: 'wind', value: 1 }],
    forceResources: [{
      id: 'texture-wind',
      name: 'wind',
      kind: 'texture',
      location: 'examplemod:textures/force/wind.png',
      fileName: 'wind.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,wind',
      imageWidth: 16,
      imageHeight: 8
    }],
    forceCommands: [forceCommand('Vortex', {
      centerExpression: 'pos',
      centerX: 1,
      centerY: 2,
      centerZ: 3
    }, { type: 'SignEquals', signRef: 'sign-smoke' })]
  });
  const reopened = normalizeGeneratorProject(JSON.parse(JSON.stringify(original)));

  assert.equal(reopened.leftTab, 'cparticle_masks');
  assert.deepEqual(reopened.signs, original.signs);
  assert.deepEqual(reopened.commandMasks, original.commandMasks);
  assert.deepEqual(reopened.forceResources, original.forceResources);
  assert.deepEqual(reopened.forceCommands, original.forceCommands);
  assert.deepEqual(reopened.emitters[0].gpu, original.emitters[0].gpu);
});

test('mixed emitter generates CPU and GPU data with independent command paths', () => {
  const cpu = createEmitterCard({ id: 'cpu-emitter', name: 'CPU', useGPU: false });
  const gpu = createEmitterCard({
    id: 'gpu-emitter',
    name: 'GPU',
    useGPU: true,
    gpu: {
      updateMode: 'static',
      randomSeed: 42,
      signRef: 'sign-smoke',
      commandMaskRefs: ['mask-wind'],
      metadataFlags: 3,
      charge: 0.25,
      radius: 0.5
    },
    particle: {
      ...createEmitterCard().particle,
      colorGradientEnabled: true,
      colorStart: '#ff0000',
      colorEnd: '#0080ff'
    }
  });
  gpu.curves.size.x.enabled = true;
  gpu.curves.size.y.enabled = true;
  gpu.curves.opacity.enabled = true;
  gpu.curves.color.enabled = true;
  const project = createGeneratorProject({
    emitters: [cpu, gpu],
    commandQueues: [{
      id: 'cpu-commands',
      name: 'CPU commands',
      signs: [0],
      commands: [
        command('drag', { damping: 0.2, minSpeed: 0, linear: 0 }),
        command('gravity', { gravity: 0.04 }, 'cpu-gravity')
      ]
    }],
    signs: [{ id: 'sign-smoke', name: 'smoke', value: 2 }],
    commandMasks: [{ id: 'mask-wind', name: 'wind', value: 1 }],
    forceCommands: [
      forceCommand('Vortex', { centerExpression: 'pos', axialLift: 0.1 }, { type: 'SignEquals', signRef: 'sign-smoke' }),
      forceCommand('Noise', { useLifeCurve: true }, { type: 'CommandMask', commandMaskRefs: ['mask-wind'] })
    ]
  });

  const kotlin = generateEmitterKotlin(project);
  assert.match(kotlin, /val template1 = ControlableParticleData\(\)\.apply \{/);
  assert.match(kotlin, /val template2 = ControlableCParticleData\(\)\.apply \{/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleCurve/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleColorCurve/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.cparticle\.CParticleUpdateMode/);
  assert.match(kotlin, /updateMode = CParticleUpdateMode\.STATIC/);
  assert.match(kotlin, /alphaCurve = CParticleCurve\.fromFloatCurve\(emitter2Opacity\)/);
  assert.match(kotlin, /scaleXCurve = CParticleCurve\.fromFloatCurve\(emitter2SizeX\)/);
  assert.match(kotlin, /scaleYCurve = CParticleCurve\.fromFloatCurve\(emitter2SizeY\)/);
  assert.doesNotMatch(kotlin, /\n\s+scaleCurve =/);
  assert.doesNotMatch(kotlin, /\n\s+sizeCurve =/);
  assert.match(kotlin, /color = Vector3f\(1F\)/);
  assert.match(kotlin, /colorCurve = CParticleColorCurve\.linear\(Vector3f\(1F, 0F, 0F\), Vector3f\(0F, 0\.501961F, 1F\)\)/);
  assert.doesNotMatch(kotlin, /data2\.getInterpolatedColor/);
  assert.doesNotMatch(kotlin, /randomAgePreTick/);
  assert.match(kotlin, /randomSeed = 42/);
  assert.match(kotlin, /blockCollision = false/);
  assert.match(kotlin, /private const val SIGN_SMOKE = 2/);
  assert.match(kotlin, /private const val COMMAND_MASK_WIND = 1 shl 0/);
  assert.match(kotlin, /sign = SIGN_SMOKE/);
  assert.match(kotlin, /commandMask = COMMAND_MASK_WIND/);
  assert.match(kotlin, /metadataFlags = 3/);
  assert.match(kotlin, /charge = 0\.25F/);
  assert.match(kotlin, /radius = 0\.5F/);
  assert.doesNotMatch(kotlin, /(?:^|[^A-Za-z0-9_])\d+(?:\.\d+)?f(?:[^A-Za-z0-9_]|$)/);

  assert.match(kotlin, /override fun singleParticleAction\(/);
  assert.match(kotlin, /private val commandQueue1 = ParticleCommandQueue\(\)/);
  assert.match(kotlin, /data\.sign == 0/);
  assert.match(kotlin, /ParticleCommand \{ data, _ -> data\.velocity = data\.velocity\.add\(0\.0, -0\.04, 0\.0\) \}/);
  assert.doesNotMatch(kotlin, /\n\s+gravity = 0\.04/);
  assert.match(kotlin, /override fun submitCParticleForces\(sink: CParticleForceSink\)/);
  assert.equal(kotlin.match(/override fun submitCParticleForces/g)?.length, 1);
  assert.doesNotMatch(kotlin, /cparticleForces\(\): List<CParticleForce>/);
  assert.match(kotlin, /CParticleForce\.Vortex\(/);
  assert.match(kotlin, /CParticleForce\.Noise\(/);
  assert.match(kotlin, /CParticleSelector\.SignEquals\(SIGN_SMOKE\)/);
  assert.match(kotlin, /CParticleSelector\.CommandMask\(COMMAND_MASK_WIND\)/);

  assert.doesNotMatch(kotlin, /useCParticleSystem/);
  assert.doesNotMatch(kotlin, /cparticleCapacity/);
  assert.doesNotMatch(kotlin, /fun cparticleUpdateMode/);
  assert.doesNotMatch(kotlin, /cparticleFallbackCommandQueue/);
});

test('GPU lifecycle curves stay in ControlableCParticleData without CPU controller fallback', () => {
  const gpu = createEmitterCard({
    id: 'gpu-curves-only',
    useGPU: true,
    particle: { colorGradientEnabled: true }
  });
  gpu.curves.size.x.enabled = true;
  gpu.curves.size.y.enabled = true;
  gpu.curves.opacity.enabled = true;
  gpu.curves.color.enabled = true;

  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));
  assert.match(kotlin, /val template1 = ControlableCParticleData\(\)\.apply \{/);
  assert.doesNotMatch(kotlin, /ControlableParticleData\(\)/);
  assert.match(kotlin, /alphaCurve = CParticleCurve\.fromFloatCurve\(emitter1Opacity\)/);
  assert.match(kotlin, /scaleXCurve = CParticleCurve\.fromFloatCurve\(emitter1SizeX\)/);
  assert.match(kotlin, /scaleYCurve = CParticleCurve\.fromFloatCurve\(emitter1SizeY\)/);
  assert.match(kotlin, /colorCurve = CParticleColorCurve\./);
  assert.doesNotMatch(kotlin, /addParticleControlerInstanceInit|ParticleCommandQueue/);
  assert.doesNotMatch(kotlin, /singleParticleAction\(/);
});

test('color gradient defaults to lifetime interpolation without a custom color curve', () => {
  const base = createEmitterCard({
    id: 'default-color-gradient',
    particle: {
      ...createEmitterCard().particle,
      colorGradientEnabled: true,
      colorStart: '#ff0000',
      colorEnd: '#0080ff'
    }
  });
  base.curves.color.enabled = false;

  const cpuKotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [base] }));
  assert.match(cpuKotlin, /private val emitter1ColorProgress = KeyframeFloatCurve\(listOf\(FloatKeyframe\(0\.0, 0\.0\), FloatKeyframe\(1\.0, 1\.0\)\)\)/);
  assert.match(cpuKotlin, /this\.color = data1\.getInterpolatedColor\(emitter1ColorProgress\.sample\(lifeProgress\)\.toDouble\(\)\.coerceIn\(0\.0, 1\.0\)\)/);
  assert.doesNotMatch(cpuKotlin, /this\.color = data1\.getRandomColor\(\)/);

  const gpuKotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [{ ...base, useGPU: true }] }));
  assert.match(gpuKotlin, /color = Vector3f\(1F\)/);
  assert.match(gpuKotlin, /colorCurve = CParticleColorCurve\.linear\(Vector3f\(1F, 0F, 0F\), Vector3f\(0F, 0\.501961F, 1F\)\)/);
});

test('GPU synchronized size emits only the shared scale curve', () => {
  const gpu = createEmitterCard({ id: 'gpu-shared-scale', useGPU: true });
  gpu.curves.size.syncAxes = true;
  gpu.curves.size.x.enabled = true;
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));

  assert.match(kotlin, /scaleCurve = CParticleCurve\.fromFloatCurve\(emitter1SizeX\)/);
  assert.doesNotMatch(kotlin, /scaleXCurve|scaleYCurve|emitter1SizeY|\n\s+sizeCurve =/);
});

test('external GPU template owns its colors without referencing private random data', () => {
  const gpu = createEmitterCard({
    id: 'gpu-external-template',
    useGPU: true,
    externalData: false,
    externalTemplate: true,
    particle: {
      ...createEmitterCard().particle,
      colorGradientEnabled: true,
      colorStart: '#204060',
      colorEnd: '#80c0ff'
    }
  });
  gpu.curves.color.enabled = true;
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));
  const templateStart = kotlin.indexOf('var template1 = ControlableCParticleData()');
  const initStart = kotlin.indexOf('\n\n    init {', templateStart);
  assert.ok(templateStart >= 0);
  assert.ok(initStart > templateStart);
  const templateDeclaration = kotlin.slice(templateStart, initStart);

  assert.match(kotlin, /private val data1 = SimpleRandomParticleData\(\)/);
  assert.match(kotlin, /leftColor = Vector3f\(0\.12549F, 0\.25098F, 0\.376471F\)/);
  assert.match(kotlin, /rightColor = Vector3f\(0\.501961F, 0\.752941F, 1F\)/);
  assert.doesNotMatch(templateDeclaration, /data1/);
  assert.match(templateDeclaration, /color = Vector3f\(1F\)/);
  assert.match(templateDeclaration, /colorCurve = CParticleColorCurve\.linear\(Vector3f\(0\.12549F, 0\.25098F, 0\.376471F\), Vector3f\(0\.501961F, 0\.752941F, 1F\)\)/);
});

test('external GPU data can build the color curve per particle and omit zero velocity jitter', () => {
  const gpu = createEmitterCard({
    id: 'gpu-external-colors',
    useGPU: true,
    externalData: true,
    externalTemplate: true,
    gpu: { updateMode: 'static', randomSeed: null, useDataColorCurve: true },
    particle: {
      ...createEmitterCard().particle,
      colorGradientEnabled: true,
      colorStart: '#ff0000',
      colorEnd: '#0080ff',
      velocityRandom: { x: 0, y: 0, z: 0 }
    }
  });
  gpu.curves.color.enabled = true;
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));
  const templateStart = kotlin.indexOf('var template1 = ControlableCParticleData()');
  const initStart = kotlin.indexOf('\n\n    init {', templateStart);
  const templateDeclaration = kotlin.slice(templateStart, initStart);

  assert.match(kotlin, /leftColor = Vector3f\(1F, 0F, 0F\)/);
  assert.match(kotlin, /rightColor = Vector3f\(0F, 0\.501961F, 1F\)/);
  assert.doesNotMatch(templateDeclaration, /colorCurve =/);
  assert.match(kotlin, /colorCurve = CParticleColorCurve\.linear\(data1\.leftColor, data1\.rightColor\)/);
  assert.doesNotMatch(kotlin, /val velocityJitter =/);
});

test('spawn-relative direction ignores a bound emitter offset', () => {
  const base = createEmitterCard();
  const gpu = createEmitterCard({
    id: 'gpu-relative-rotation',
    useGPU: true,
    render: {
      ...base.render,
      billboardMode: 'none',
      relativeRotation: true,
      roll: 10,
      yaw: 20,
      pitch: 30
    },
    particle: {
      ...base.particle,
      velocityMode: 'spawn_relative',
      velocityRandom: { x: 0, y: 0, z: 0 }
    }
  });
  gpu.emitter.offset = { x: 4, y: 5, z: 6 };
  gpu.bindings['emitter.offset'] = 'emitterOffset';
  const kotlin = generateEmitterKotlin(createGeneratorProject({
    parameters: {
      variables: [{
        name: 'emitterOffset',
        type: 'RelativeLocation',
        value: 'RelativeLocation(4.0, 5.0, 6.0)'
      }]
    },
    emitters: [gpu]
  }));

  assert.match(kotlin, /roll = \(10\.0 \* PI \/ 180\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /yaw = \(20\.0 \* PI \/ 180\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /pitch = \(30\.0 \* PI \/ 180\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.extend\.\*/);
  assert.match(kotlin, /val spawnRelative = rel\.toVector\(\) - emitterOffset\.toVector\(\)/);
  assert.match(kotlin, /val relativeRotationDir = spawnRelative/);
  assert.match(kotlin, /this\.pitch = template1\.pitch \+ atan2\(relativeRotationDir\.z, relativeRotationDir\.y\)\.toFloat\(\)/);
  assert.match(kotlin, /this\.roll = template1\.roll \+ atan2\(-relativeRotationDir\.x, hypot\(relativeRotationDir\.y, relativeRotationDir\.z\)\)\.toFloat\(\)/);
  assert.doesNotMatch(kotlin, /val velocityJitter =/);
  assert.match(kotlin, /val dir = spawnRelative/);
  assert.doesNotMatch(kotlin, /val dir = rel\.toVector\(\)/);
});

test('spawn-inward direction points back to the emitter origin', () => {
  const card = createEmitterCard({
    particle: {
      velocityMode: 'spawn_inward',
      velocityRandom: { x: 0.1, y: 0.2, z: 0.3 }
    }
  });
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [card] }));
  const yarn = generateEmitterKotlin(createGeneratorProject({
    kotlin: { mapping: 'yarn' },
    emitters: [card]
  }));

  assert.equal(card.particle.velocityMode, 'spawn_inward');
  assert.equal(createEmitterCard({ particle: { velMode: 'spawn_in' } }).particle.velocityMode, 'spawn_inward');
  assert.match(kotlin, /import cn\.coostack\.cooparticlesapi\.extend\.\*/);
  assert.match(kotlin, /val spawnRelative = rel\.toVector\(\) - RelativeLocation\(0\.0, 0\.0, 0\.0\)\.toVector\(\)/);
  assert.match(kotlin, /val velocityJitter = Vec3\(/);
  assert.match(kotlin, /val dir = -spawnRelative \+ velocityJitter/);
  assert.doesNotMatch(kotlin, /val baseDir = template1\.velocity/);
  assert.match(yarn, /import net\.minecraft\.util\.math\.Vec3d/);
  assert.match(yarn, /val velocityJitter = Vec3d\(/);
  assert.match(yarn, /val dir = -spawnRelative \+ velocityJitter/);
});

test('CPU relative rotation curves stay offset from each particle birth orientation', () => {
  const cpu = createEmitterCard();
  cpu.render.billboardMode = 'none';
  cpu.render.relativeRotation = true;
  cpu.render.roll = 10;
  cpu.render.yaw = 20;
  cpu.render.pitch = 30;
  cpu.curves.rotation.syncAxes = false;
  cpu.curves.rotation.roll.enabled = true;
  cpu.curves.rotation.yaw.enabled = true;
  cpu.curves.rotation.pitch.enabled = true;

  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [cpu] }));

  assert.match(kotlin, /this\.pitch = template1\.pitch \+ atan2\(relativeRotationDir\.z, relativeRotationDir\.y\)\.toFloat\(\)/);
  assert.match(kotlin, /this\.roll = template1\.roll \+ atan2\(-relativeRotationDir\.x, hypot\(relativeRotationDir\.y, relativeRotationDir\.z\)\)\.toFloat\(\)/);
  assert.match(kotlin, /this\.currentRoll = data\.roll \+ \(emitter1Roll\.sample\(lifeProgress\) \* PI \/ 180\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /this\.currentYaw = data\.yaw \+ \(emitter1Yaw\.sample\(lifeProgress\) \* PI \/ 180\.0\)\.toFloat\(\)/);
  assert.match(kotlin, /this\.currentPitch = data\.pitch \+ \(emitter1Pitch\.sample\(lifeProgress\) \* PI \/ 180\.0\)\.toFloat\(\)/);
});

test('single-color mode writes one color into both random-data endpoints', () => {
  const gpu = createEmitterCard({
    id: 'gpu-single-color',
    useGPU: true,
    particle: {
      ...createEmitterCard().particle,
      colorGradientEnabled: false,
      colorStart: '#204060',
      colorEnd: '#80c0ff'
    }
  });
  gpu.curves.color.enabled = true;
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));

  assert.match(kotlin, /leftColor = Vector3f\(0\.12549F, 0\.25098F, 0\.376471F\)/);
  assert.match(kotlin, /rightColor = Vector3f\(0\.12549F, 0\.25098F, 0\.376471F\)/);
  assert.doesNotMatch(kotlin, /CParticleColorCurve/);
  assert.doesNotMatch(kotlin, /0\.501961F, 0\.752941F, 1F/);

  const cpu = createEmitterCard({
    id: 'cpu-single-color',
    useGPU: false,
    particle: {
      ...createEmitterCard().particle,
      colorGradientEnabled: false,
      colorStart: '#204060',
      colorEnd: '#80c0ff'
    }
  });
  const cpuKotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [cpu] }));
  assert.match(cpuKotlin, /this\.color = data1\.getInterpolatedColor\(0\.0\)/);
  assert.doesNotMatch(cpuKotlin, /data1\.getRandomColor\(\)/);
});

test('GPU Bezier color curves stay within API key and monotonic-handle limits', () => {
  const gpu = createEmitterCard({
    id: 'gpu-bezier-color',
    useGPU: true,
    particle: { colorGradientEnabled: true }
  });
  gpu.curves.color.enabled = true;
  gpu.curves.color.mode = 'bezier';
  gpu.curves.color.keyframes = [
    { id: 'c0', time: 0, value: 0, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c1', time: 10, value: 0.1, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c2', time: 20, value: 0.2, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c3', time: 30, value: 0.3, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c4', time: 40, value: 0.4, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c5', time: 50, value: 0.5, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c5-duplicate', time: 50, value: 0.55, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c6', time: 60, value: 0.6, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c7', time: 70, value: 0.7, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c8', time: 80, value: 0.8, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } },
    { id: 'c9', time: 100, value: 1, out: { x: 33, y: 0 }, in: { x: -33, y: 0 } }
  ];

  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));
  const keys = Array.from(kotlin.matchAll(
    /CParticleBezierColorKeyframe\(time = ([\d.]+), value = .*?outX = (-?[\d.]+), .*?inX = (-?[\d.]+)/g
  )).map((match) => ({ time: Number(match[1]), outX: Number(match[2]), inX: Number(match[3]) }));

  assert.equal(keys.length, 8);
  assert.equal(keys[0].time, 0);
  assert.equal(keys.at(-1).time, 1);
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const current = keys[index];
    const firstControl = previous.time + previous.outX / 100;
    const secondControl = current.time + current.inX / 100;
    assert.ok(previous.time < current.time);
    assert.ok(firstControl >= previous.time && firstControl <= current.time);
    assert.ok(secondControl >= previous.time && secondControl <= current.time);
    assert.ok(firstControl <= secondControl);
  }
});

test('GPU collision is stored on CParticle data without CPU movement collision code', () => {
  const gpu = createEmitterCard({
    id: 'gpu-collision',
    useGPU: true,
    physics: {
      ...createEmitterCard().physics,
      collision: true,
      collisionTargets: [7]
    }
  });
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [gpu] }));

  assert.match(kotlin, /blockCollision = true/);
  assert.doesNotMatch(kotlin, /moveSingleParticleWithVelocity/);
  assert.doesNotMatch(kotlin, /PhysicsUtil|BlockHitResult|HitResult/);
});

test('mixed collision keeps GPU targets out of the CPU collision condition', () => {
  const cpu = createEmitterCard({
    id: 'cpu-collision',
    useGPU: false,
    physics: {
      ...createEmitterCard().physics,
      collision: true,
      collisionTargets: [2]
    }
  });
  const gpu = createEmitterCard({
    id: 'gpu-collision',
    useGPU: true,
    physics: {
      ...createEmitterCard().physics,
      collision: true,
      collisionTargets: []
    }
  });
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [cpu, gpu] }));

  assert.match(kotlin, /blockCollision = true/);
  assert.match(kotlin, /if \(collide\.type == HitResult\.Type\.MISS \|\| data\.sign != 2\)/);
  assert.equal(kotlin.match(/moveSingleParticleWithVelocity/g)?.length, 1);
});

test('mixed external templates use distinct Kotlin fields for CPU and GPU data types', () => {
  const cpu = createEmitterCard({
    id: 'cpu-external',
    useGPU: false,
    externalTemplate: true,
    vars: { data: '', template: 'sharedTemplate' }
  });
  const gpu = createEmitterCard({
    id: 'gpu-external',
    useGPU: true,
    externalTemplate: true,
    vars: { data: '', template: 'sharedTemplate' }
  });
  const kotlin = generateEmitterKotlin(createGeneratorProject({ emitters: [cpu, gpu] }));

  assert.match(kotlin, /var sharedTemplate = ControlableParticleData\(\)\.apply \{/);
  assert.match(kotlin, /var sharedTemplate_2 = ControlableCParticleData\(\)\.apply \{/);
  assert.match(kotlin, /sharedTemplate\.clone\(\)\.apply \{/);
  assert.match(kotlin, /sharedTemplate_2\.clone\(\)\.apply \{/);
  assert.ok(kotlin.indexOf('private val emitter2Opacity') < kotlin.indexOf('var sharedTemplate_2'));
});

test('unknown Force commands remain visible to compatibility validation', () => {
  const project = normalizeGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceCommands: [{
      id: 'future-force',
      enabled: true,
      label: 'future force',
      force: { type: 'FutureForce', parameters: {} },
      selector: { type: 'All' }
    }]
  });

  assert.equal(project.forceCommands[0].force.type, 'FutureForce');
  assert.deepEqual(collectCParticleCompatibilityErrors(project), [
    'Force Command“future force”使用了未知 Force 类型“FutureForce”。'
  ]);
  assert.throws(() => generateEmitterKotlin(project), /FutureForce/);
});

test('CPU-only project keeps ParticleCommandQueue and omits GPU API', () => {
  const project = createGeneratorProject({
    commandQueues: [{
      id: 'cpu-commands',
      name: 'CPU commands',
      signs: [3],
      commands: [command('drag', { damping: 0.2, minSpeed: 0, linear: 0 })]
    }]
  });
  const kotlin = generateEmitterKotlin(project);

  assert.match(kotlin, /private val commandQueue1 = ParticleCommandQueue\(\)/);
  assert.match(kotlin, /data\.sign == 3/);
  assert.doesNotMatch(kotlin, /ControlableCParticleData/);
  assert.doesNotMatch(kotlin, /cparticleForces/);
});

test('Force commands reject more entries than the sink can store', () => {
  const project = createGeneratorProject({
    emitters: [createEmitterCard({ useGPU: true })],
    forceCommands: Array.from({ length: CPARTICLE_FORCE_MAX_COMMANDS + 1 }, (_, index) => forceCommand('ExpDrag', {}, { type: 'All' }, `drag-${index}`))
  });

  assert.deepEqual(collectCParticleCompatibilityErrors(project), [
    `CParticle Force Commands 最多支持 ${CPARTICLE_FORCE_MAX_COMMANDS} 条，当前为 ${CPARTICLE_FORCE_MAX_COMMANDS + 1} 条。`
  ]);
  assert.throws(
    () => generateEmitterKotlin(project),
    new RegExp(`CParticle Force Commands 最多支持 ${CPARTICLE_FORCE_MAX_COMMANDS}`)
  );
});

test('generator UI separates CPU and GPU particle forces', () => {
  const page = readFileSync(new URL('../src/pages/GeneratorPage.vue', import.meta.url), 'utf8');
  const forceEditor = readFileSync(new URL('../src/components/CParticleForceEditor.vue', import.meta.url), 'utf8');
  const resourceEditor = readFileSync(new URL('../src/components/CParticleResourceEditor.vue', import.meta.url), 'utf8');
  const maskEditor = readFileSync(new URL('../src/components/CParticleMaskEditor.vue', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/GeneratorSettingsModal.vue', import.meta.url), 'utf8');
  const maskSidebarStart = page.indexOf(`<section v-else-if="project.leftTab === 'cparticle_masks'" class="left-block">`);
  const maskSidebarEnd = page.indexOf('</section>', maskSidebarStart);
  const maskSidebar = page.slice(maskSidebarStart, maskSidebarEnd);
  const projectGroupStart = page.indexOf("id: 'project_declarations'");
  const projectGroupEnd = page.indexOf('const emitterTypes', projectGroupStart);
  const projectGroup = page.slice(projectGroupStart, projectGroupEnd);
  const compactMediaStart = page.indexOf('@media (max-width: 1180px)');
  const compactMediaEnd = page.indexOf('@media (max-width: 720px)', compactMediaStart);
  const compactMedia = page.slice(compactMediaStart, compactMediaEnd);

  assert.match(page, /v-model="selectedEmitter\.useGPU"/);
  assert.match(page, /class="gpu-parameter-panel"/);
  assert.match(page, /class="gpu-parameter-options"/);
  assert.doesNotMatch(page, /randomAgePreTick|每 Tick 随机动画帧/);
  assert.doesNotMatch(page, /class="grid4 gpu-parameter-grid"/);
  assert.match(page, /project\.leftTab === 'force_commands'/);
  assert.match(page, /project\.leftTab === 'resources'/);
  assert.match(page, /let textureHydrationGeneration = 0/);
  assert.match(page, /generation !== textureHydrationGeneration \|\| project\.value !== targetProject/);
  assert.doesNotMatch(page, /hydrateCParticleTexturePreviews\([^\n]+\.then\(\(\) => restartPreview\(\)\)/);
  assert.ok(maskSidebarStart >= 0 && maskSidebarEnd > maskSidebarStart);
  assert.ok(projectGroupStart >= 0 && projectGroupEnd > projectGroupStart);
  assert.ok(projectGroup.indexOf("id: 'resources'") < projectGroup.indexOf("id: 'cparticle_masks'"));
  assert.ok(projectGroup.indexOf("id: 'cparticle_masks'") < projectGroup.indexOf("id: 'tick'"));
  assert.ok(projectGroup.indexOf("id: 'tick'") < projectGroup.indexOf("id: 'project'"));
  assert.doesNotMatch(projectGroup, /id: 'settings'/);
  assert.match(page, /CParticleMaskEditor/);
  assert.match(maskSidebar, /addCParticleSignFromSidebar">增加一个 sign/);
  assert.match(maskSidebar, /addCParticleCommandMaskFromSidebar">增加一个 commandMask/);
  assert.match(maskSidebar, /sign 是用户定义的逻辑标签/);
  assert.doesNotMatch(page, /convertSelectedQueueToGpu|convertGpuCommandsToSelectedQueue/);
  assert.match(page, /v-model="selectedEmitter\.useGPU" type="checkbox" @change="restartPreview"/);
  assert.match(page, /GPU 方块碰撞/);
  assert.match(page, /v-if="!selectedEmitter\.useGPU" class="field">\s*<span>粒子碰撞目标<\/span>/);
  assert.doesNotMatch(page, /v-model="selectedEmitter\.physics\.collision" class="input" :disabled="selectedEmitter\.useGPU"/);
  assert.match(page, /ControlableCParticleData\.blockCollision/);
  assert.match(page, /v-model="selectedEmitter\.render\.relativeRotation"[^>]*\/>相对出生位置旋转/);
  assert.match(page, /<option value="spawn_inward">从发射点朝内<\/option>/);
  assert.match(page, /v-model="selectedEmitter\.particle\.colorGradientEnabled"[^>]*\/>颜色渐变/);
  assert.match(page, /v-model="selectedEmitter\.gpu\.useDataColorCurve"[^>]*\/>引用 simpleData 颜色/);
  assert.match(page, /起始颜色/);
  assert.match(page, /最终颜色/);
  assert.doesNotMatch(page, /render\.baseScale\.z|curves\.size\.z|深度倍率|大小 Z \/ 深度|usesDepthScale/);
  assert.match(page, /v-model="selectedEmitter\.gpu\.signRef"/);
  assert.match(page, /v-model\.number="selectedEmitter\.gpu\.metadataFlags"/);
  assert.match(page, /v-model\.number="selectedEmitter\.gpu\.charge"/);
  assert.match(page, /v-model\.number="selectedEmitter\.gpu\.radius"/);
  assert.match(page, /粒子物理半径（Lennard-Jones）/);
  assert.doesNotMatch(compactMedia, /bindable-axis-grid/);
  assert.match(page, /为 CParticle GPU compute 定义粒子处理力与 Selector/);
  assert.doesNotMatch(forceEditor, /为 CParticle GPU compute 定义粒子处理力与 Selector|当前没有 GPU 粒子处理力/);
  assert.match(forceEditor, /GeneratorParameterValueEditor/);
  assert.match(forceEditor, /type: 'Vec3'/);
  assert.match(forceEditor, /parameters\[`\$\{field\.prefix\}X`\] = vector\.x/);
  assert.match(forceEditor, /parameters\[`\$\{field\.prefix\}Y`\] = vector\.y/);
  assert.match(forceEditor, /parameters\[`\$\{field\.prefix\}Z`\] = vector\.z/);
  assert.doesNotMatch(forceEditor, /addForceCommand|>\+ Force</);
  assert.doesNotMatch(forceEditor, />\+ sign<|>\+ commandMask</);
  assert.doesNotMatch(forceEditor, /section-title">sign 逻辑标签/);
  assert.doesNotMatch(forceEditor, /section-title">commandMask 类别/);
  assert.match(forceEditor, /sourceId 由运行时 system 分配/);
  assert.doesNotMatch(forceEditor, /声明式 Force 资源|addForceResource|OpenGL texture id/);
  assert.match(page, /Texture 上传用于 Web 预览/);
  assert.doesNotMatch(resourceEditor, /Texture 上传用于 Web 预览|暂无 Force 资源/);
  assert.match(resourceEditor, /type="file" accept="image\/\*"/);
  assert.match(resourceEditor, /uploadCParticleTexturePreview/);
  assert.match(page, /CParticleTextureResource/);
  assert.match(page, /CParticleForceResourceBinding/);
  assert.doesNotMatch(resourceEditor, /addForceResource|>\+ 资源</);
  assert.match(maskEditor, /CParticle 标记与掩码/);
  assert.match(maskEditor, /sign 逻辑标签/);
  assert.match(maskEditor, /commandMask 类别/);
  assert.doesNotMatch(maskEditor, /sign 是用户定义的逻辑标签/);
  assert.doesNotMatch(maskEditor, />\+ sign<|>\+ commandMask</);
  assert.match(page, /hasEnabledFluidFlowForce/);
  assert.match(page, /CParticleForceResourceRegistry 注册 CParticleForceResourceBinding/);
  assert.match(page, /v-if="!selectedEmitter\.useGPU" class="field-pack sign-field-wrap"/);
  assert.doesNotMatch(page, /project\.particleBackend/);
  assert.doesNotMatch(settings, /particleBackend|粒子后端/);
});
