import { createLifecycleCurve, normalizeLifecycleCurve } from './curves.js';
import { createPointsBuilderProject, normalizePointsBuilderProject } from '../pointsbuilder/defaults.js';
import {
  GENERATOR_VALUE_TYPES,
  getGeneratorTypeDefault,
  isGeneratorValueName,
  normalizeGeneratorTypedValue,
  normalizeGeneratorValueType
} from './bindings.js';

export { GENERATOR_VALUE_TYPES };

let idSeed = 1;

function makeId(prefix = 'id') {
  idSeed += 1;
  return `${prefix}_${Date.now().toString(16)}_${idSeed.toString(16)}`;
}

export const EMITTER_TYPES = [
  { id: 'point', label: '点' },
  { id: 'points_builder', label: 'PointsBuilder' },
  { id: 'box', label: '盒体' },
  { id: 'sphere', label: '球体' },
  { id: 'sphere_surface', label: '球面' },
  { id: 'ring', label: '圆环' },
  { id: 'line', label: '直线' },
  { id: 'circle', label: '圆' },
  { id: 'arc', label: '弧线' },
  { id: 'spiral', label: '螺旋' }
];

export const BILLBOARD_MODES = [
  { id: 'face_camera', label: '始终面向相机' },
  { id: 'axis_billboard', label: '轴向面向相机' },
  { id: 'none', label: '关闭面向相机' }
];

export const EFFECT_OPTIONS = [
  { id: 'end_rod', label: 'ControlableEndRodEffect', className: 'ControlableEndRodEffect' },
  { id: 'enchantment', label: 'ControlableEnchantmentEffect', className: 'ControlableEnchantmentEffect' },
  { id: 'cloud', label: 'ControlableCloudEffect', className: 'ControlableCloudEffect' },
  { id: 'falling_dust', label: 'ControlableFallingDustEffect', className: 'ControlableFallingDustEffect' },
  { id: 'splash', label: 'ControlableSplashEffect', className: 'ControlableSplashEffect' },
  { id: 'flash', label: 'ControlableFlashEffect', className: 'ControlableFlashEffect' },
  { id: 'firework', label: 'ControlableFireworkEffect', className: 'ControlableFireworkEffect' },
  { id: 'angry_villager', label: 'ControlableAngryVillagerEffect', className: 'ControlableAngryVillagerEffect' },
  { id: 'ash', label: 'ControlableAshEffect', className: 'ControlableAshEffect' },
  { id: 'bubble', label: 'ControlableBubbleEffect', className: 'ControlableBubbleEffect' },
  { id: 'bubble_column_up', label: 'ControlableBubbleColumnUpEffect', className: 'ControlableBubbleColumnUpEffect' },
  { id: 'bubble_pop', label: 'ControlableBubblePopEffect', className: 'ControlableBubblePopEffect' },
  { id: 'campfire_cosy_smoke', label: 'ControlableCampfireCosySmokeEffect', className: 'ControlableCampfireCosySmokeEffect' },
  { id: 'campfire_signal_smoke', label: 'ControlableCampfireSignalSmokeEffect', className: 'ControlableCampfireSignalSmokeEffect' },
  { id: 'cherry_leaves', label: 'ControlableCherryLeavesEffect', className: 'ControlableCherryLeavesEffect' },
  { id: 'composter', label: 'ControlableComposterEffect', className: 'ControlableComposterEffect' },
  { id: 'crimson_spore', label: 'ControlableCrimsonSporeEffect', className: 'ControlableCrimsonSporeEffect' },
  { id: 'crit', label: 'ControlableCritEffect', className: 'ControlableCritEffect' },
  { id: 'current_down', label: 'ControlableCurrentDownEffect', className: 'ControlableCurrentDownEffect' },
  { id: 'damage_indicator', label: 'ControlableDamageIndicatorEffect', className: 'ControlableDamageIndicatorEffect' },
  { id: 'dolphin', label: 'ControlableDolphinEffect', className: 'ControlableDolphinEffect' },
  { id: 'dragon_breath', label: 'ControlableDragonBreathEffect', className: 'ControlableDragonBreathEffect' },
  { id: 'dripping_dripstone_lava', label: 'ControlableDrippingDripstoneLavaEffect', className: 'ControlableDrippingDripstoneLavaEffect' },
  { id: 'dripping_dripstone_water', label: 'ControlableDrippingDripstoneWaterEffect', className: 'ControlableDrippingDripstoneWaterEffect' },
  { id: 'dripping_honey', label: 'ControlableDrippingHoneyEffect', className: 'ControlableDrippingHoneyEffect' },
  { id: 'dripping_lava', label: 'ControlableDrippingLavaEffect', className: 'ControlableDrippingLavaEffect' },
  { id: 'dripping_obsidian_tear', label: 'ControlableDrippingObsidianTearEffect', className: 'ControlableDrippingObsidianTearEffect' },
  { id: 'dripping_water', label: 'ControlableDrippingWaterEffect', className: 'ControlableDrippingWaterEffect' },
  { id: 'dust_plume', label: 'ControlableDustPlumeEffect', className: 'ControlableDustPlumeEffect' },
  { id: 'effect', label: 'ControlableEffectParticleEffect', className: 'ControlableEffectParticleEffect' },
  { id: 'egg_crack', label: 'ControlableEggCrackEffect', className: 'ControlableEggCrackEffect' },
  { id: 'electric_spark', label: 'ControlableElectricSparkEffect', className: 'ControlableElectricSparkEffect' },
  { id: 'enchanted_hit', label: 'ControlableEnchantedHitEffect', className: 'ControlableEnchantedHitEffect' },
  { id: 'explosion', label: 'ControlableExplosionEffect', className: 'ControlableExplosionEffect' },
  { id: 'falling_dripstone_lava', label: 'ControlableFallingDripstoneLavaEffect', className: 'ControlableFallingDripstoneLavaEffect' },
  { id: 'falling_dripstone_water', label: 'ControlableFallingDripstoneWaterEffect', className: 'ControlableFallingDripstoneWaterEffect' },
  { id: 'falling_honey', label: 'ControlableFallingHoneyEffect', className: 'ControlableFallingHoneyEffect' },
  { id: 'falling_lava', label: 'ControlableFallingLavaEffect', className: 'ControlableFallingLavaEffect' },
  { id: 'falling_nectar', label: 'ControlableFallingNectarEffect', className: 'ControlableFallingNectarEffect' },
  { id: 'falling_obsidian_tear', label: 'ControlableFallingObsidianTearEffect', className: 'ControlableFallingObsidianTearEffect' },
  { id: 'falling_spore_blossom', label: 'ControlableFallingSporeBlossomEffect', className: 'ControlableFallingSporeBlossomEffect' },
  { id: 'falling_water', label: 'ControlableFallingWaterEffect', className: 'ControlableFallingWaterEffect' },
  { id: 'fishing', label: 'ControlableFishingEffect', className: 'ControlableFishingEffect' },
  { id: 'flame', label: 'ControlableFlameEffect', className: 'ControlableFlameEffect' },
  { id: 'glow', label: 'ControlableGlowEffect', className: 'ControlableGlowEffect' },
  { id: 'glow_squid_ink', label: 'ControlableGlowSquidInkEffect', className: 'ControlableGlowSquidInkEffect' },
  { id: 'gust', label: 'ControlableGustEffect', className: 'ControlableGustEffect' },
  { id: 'happy_villager', label: 'ControlableHappyVillagerEffect', className: 'ControlableHappyVillagerEffect' },
  { id: 'heart', label: 'ControlableHeartEffect', className: 'ControlableHeartEffect' },
  { id: 'infested', label: 'ControlableInfestedEffect', className: 'ControlableInfestedEffect' },
  { id: 'instant_effect', label: 'ControlableInstantEffectParticleEffect', className: 'ControlableInstantEffectParticleEffect' },
  { id: 'landing_honey', label: 'ControlableLandingHoneyEffect', className: 'ControlableLandingHoneyEffect' },
  { id: 'landing_lava', label: 'ControlableLandingLavaEffect', className: 'ControlableLandingLavaEffect' },
  { id: 'landing_obsidian_tear', label: 'ControlableLandingObsidianTearEffect', className: 'ControlableLandingObsidianTearEffect' },
  { id: 'large_smoke', label: 'ControlableLargeSmokeEffect', className: 'ControlableLargeSmokeEffect' },
  { id: 'lava', label: 'ControlableLavaEffect', className: 'ControlableLavaEffect' },
  { id: 'mycelium', label: 'ControlableMyceliumEffect', className: 'ControlableMyceliumEffect' },
  { id: 'nautilus', label: 'ControlableNautilusEffect', className: 'ControlableNautilusEffect' },
  { id: 'note', label: 'ControlableNoteEffect', className: 'ControlableNoteEffect' },
  { id: 'ominous_spawning', label: 'ControlableOminousSpawningEffect', className: 'ControlableOminousSpawningEffect' },
  { id: 'poof', label: 'ControlablePoofEffect', className: 'ControlablePoofEffect' },
  { id: 'portal', label: 'ControlablePortalEffect', className: 'ControlablePortalEffect' },
  { id: 'raid_omen', label: 'ControlableRaidOmenEffect', className: 'ControlableRaidOmenEffect' },
  { id: 'rain', label: 'ControlableRainEffect', className: 'ControlableRainEffect' },
  { id: 'reverse_portal', label: 'ControlableReversePortalEffect', className: 'ControlableReversePortalEffect' },
  { id: 'scrape', label: 'ControlableScrapeEffect', className: 'ControlableScrapeEffect' },
  { id: 'sculk_charge_pop', label: 'ControlableSculkChargePopEffect', className: 'ControlableSculkChargePopEffect' },
  { id: 'sculk_soul', label: 'ControlableSculkSoulEffect', className: 'ControlableSculkSoulEffect' },
  { id: 'small_flame', label: 'ControlableSmallFlameEffect', className: 'ControlableSmallFlameEffect' },
  { id: 'small_gust', label: 'ControlableSmallGustEffect', className: 'ControlableSmallGustEffect' },
  { id: 'smoke', label: 'ControlableSmokeEffect', className: 'ControlableSmokeEffect' },
  { id: 'sneeze', label: 'ControlableSneezeEffect', className: 'ControlableSneezeEffect' },
  { id: 'snowflake', label: 'ControlableSnowflakeEffect', className: 'ControlableSnowflakeEffect' },
  { id: 'sonic_boom', label: 'ControlableSonicBoomEffect', className: 'ControlableSonicBoomEffect' },
  { id: 'soul', label: 'ControlableSoulEffect', className: 'ControlableSoulEffect' },
  { id: 'soul_fire_flame', label: 'ControlableSoulFireFlameEffect', className: 'ControlableSoulFireFlameEffect' },
  { id: 'spit', label: 'ControlableSpitEffect', className: 'ControlableSpitEffect' },
  { id: 'spore_blossom_air', label: 'ControlableSporeBlossomAirEffect', className: 'ControlableSporeBlossomAirEffect' },
  { id: 'squid_ink', label: 'ControlableSquidInkEffect', className: 'ControlableSquidInkEffect' },
  { id: 'sweep_attack', label: 'ControlableSweepAttackEffect', className: 'ControlableSweepAttackEffect' },
  { id: 'totem_of_undying', label: 'ControlableTotemOfUndyingEffect', className: 'ControlableTotemOfUndyingEffect' },
  { id: 'trial_omen', label: 'ControlableTrialOmenEffect', className: 'ControlableTrialOmenEffect' },
  { id: 'trial_spawner_detection', label: 'ControlableTrialSpawnerDetectionEffect', className: 'ControlableTrialSpawnerDetectionEffect' },
  { id: 'trial_spawner_detection_ominous', label: 'ControlableTrialSpawnerDetectionOminousEffect', className: 'ControlableTrialSpawnerDetectionOminousEffect' },
  { id: 'underwater', label: 'ControlableUnderwaterEffect', className: 'ControlableUnderwaterEffect' },
  { id: 'vault_connection', label: 'ControlableVaultConnectionEffect', className: 'ControlableVaultConnectionEffect' },
  { id: 'warped_spore', label: 'ControlableWarpedSporeEffect', className: 'ControlableWarpedSporeEffect' },
  { id: 'wax_off', label: 'ControlableWaxOffEffect', className: 'ControlableWaxOffEffect' },
  { id: 'wax_on', label: 'ControlableWaxOnEffect', className: 'ControlableWaxOnEffect' },
  { id: 'white_ash', label: 'ControlableWhiteAshEffect', className: 'ControlableWhiteAshEffect' },
  { id: 'white_smoke', label: 'ControlableWhiteSmokeEffect', className: 'ControlableWhiteSmokeEffect' },
  { id: 'witch', label: 'ControlableWitchEffect', className: 'ControlableWitchEffect' }
];

export const EFFECT_CLASS_OPTIONS = EFFECT_OPTIONS.map((item) => item.className);

export const TEXTURE_SHEET_OPTIONS = [
  { id: 'PARTICLE_SHEET_TRANSLUCENT', label: 'PARTICLE_SHEET_TRANSLUCENT' },
  { id: 'PARTICLE_SHEET_LIT', label: 'PARTICLE_SHEET_LIT' },
  { id: 'PARTICLE_SHEET_OPAQUE', label: 'PARTICLE_SHEET_OPAQUE' },
  { id: 'ADDITION_BLEND_TRANSLUCENT', label: 'ADDITION_BLEND_TRANSLUCENT' },
  { id: 'ADDITION_BLEND_TRANSLUCENT_NOT_HDR', label: 'ADDITION_BLEND_TRANSLUCENT_NOT_HDR' },
  { id: 'ADDITION_BLEND_TRANSLUCENT_NOT_HDR_NO_DEPTH_WRITE', label: 'ADDITION_BLEND_TRANSLUCENT_NOT_HDR_NO_DEPTH_WRITE' },
  { id: 'ADDITION_BLEND', label: 'ADDITION_BLEND' },
  { id: 'ADDITION_BLEND_NOT_HDR', label: 'ADDITION_BLEND_NOT_HDR' },
  { id: 'ADDITION_BLEND_NOT_HDR_NO_DEPTH_WRITE', label: 'ADDITION_BLEND_NOT_HDR_NO_DEPTH_WRITE' },
  { id: 'ADDITION_BLEND_TRANSLUCENT_NO_DEPTH_WRITE', label: 'ADDITION_BLEND_TRANSLUCENT_NO_DEPTH_WRITE' },
  { id: 'TERRAIN_SHEET', label: 'TERRAIN_SHEET' },
  { id: 'CUSTOM', label: 'CUSTOM' },
  { id: 'NO_RENDER', label: 'NO_RENDER' }
];

export const GENERATOR_THEME_OPTIONS = [
  { id: 'dark-1', label: '深粉' },
  { id: 'light-pink', label: '浅粉' }
];

export const GENERATOR_HOTKEY_DEFAULTS = {
  toggleSettings: 'KeyH',
  playPause: 'Space',
  clearParticles: 'KeyC',
  resetCamera: 'KeyR',
  fullscreen: 'KeyF',
  deleteEmitter: 'Delete',
  undo: 'Mod+KeyZ',
  redo: 'Mod+Shift+KeyZ'
};

function numberParam(key, label, defaultValue, options = {}) {
  return {
    key,
    label,
    type: 'number',
    defaultValue,
    step: options.step || '0.01',
    min: options.min,
    max: options.max,
    integer: options.integer === true
  };
}

function booleanParam(key, label, defaultValue = false) {
  return { key, label, type: 'boolean', defaultValue };
}

function selectParam(key, label, defaultValue, options) {
  return { key, label, type: 'select', defaultValue, options };
}

function vec3Params(prefix, label, fallback = { x: 0, y: 0, z: 0 }, options = {}) {
  return [
    numberParam(`${prefix}X`, `${label} X`, fallback.x, options),
    numberParam(`${prefix}Y`, `${label} Y`, fallback.y, options),
    numberParam(`${prefix}Z`, `${label} Z`, fallback.z, options)
  ];
}

const orbitModeOptions = [
  { value: 'PHYSICAL', label: '物理轨道' },
  { value: 'SPRING', label: '弹簧轨道' },
  { value: 'SNAP', label: '吸附轨道' }
];

const inheritModeOptions = [
  { value: 'INITIAL', label: '首次继承' },
  { value: 'CURRENT', label: '持续继承' }
];

const motionSpaceOptions = [
  { value: 'WORLD', label: '世界空间' },
  { value: 'LOCAL', label: '局部空间' }
];

const lifetimeVelocityModeOptions = [
  { value: 'ADD', label: '叠加' },
  { value: 'OVERRIDE', label: '覆盖' },
  { value: 'MULTIPLY', label: '按轴相乘' }
];

export const COMMAND_TYPE_OPTIONS = [
  {
    id: 'drag',
    label: '空气阻尼',
    className: 'ParticleDragCommand',
    params: [
      numberParam('damping', '阻尼', 0.15, { min: 0 }),
      numberParam('minSpeed', '最小速度', 0, { min: 0 }),
      numberParam('linear', '线性阻力', 0, { min: 0, max: 1 })
    ]
  },
  {
    id: 'gravity',
    label: '发射器重力',
    className: 'ParticleGravityCommand',
    params: [numberParam('gravity', '重力强度', 0.04, { min: 0 })]
  },
  {
    id: 'attraction',
    label: '吸引 / 排斥',
    className: 'ParticleAttractionCommand',
    params: [
      ...vec3Params('target', '目标点'),
      numberParam('strength', '强度', 0.8),
      numberParam('range', '范围', 8, { min: 0.001 }),
      numberParam('falloffPower', '衰减幂次', 2, { min: 1 }),
      numberParam('minDistance', '最小距离', 0.25, { min: 0.001 })
    ]
  },
  {
    id: 'orbit',
    label: '轨道',
    className: 'ParticleOrbitCommand',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('radius', '半径', 3, { min: 0 }),
      numberParam('angularSpeed', '角速度', 0.35),
      numberParam('radialCorrect', '半径纠正', 0.25),
      numberParam('minDistance', '最小距离', 0.2, { min: 0.001 }),
      selectParam('mode', '模式', 'PHYSICAL', orbitModeOptions),
      numberParam('maxRadialStep', '最大径向步长', 0.5, { min: 0 })
    ]
  },
  {
    id: 'noise',
    label: '噪声扰动',
    className: 'ParticleNoiseCommand',
    params: [
      numberParam('strength', '强度', 0.03),
      numberParam('frequency', '空间频率', 0.15, { min: 0 }),
      numberParam('speed', '滚动速度', 0.12),
      numberParam('affectY', 'Y 轴影响', 1),
      numberParam('clampSpeed', '速度上限', 0.8, { min: 0 }),
      booleanParam('useLifeCurve', '按生命周期衰减', true)
    ]
  },
  {
    id: 'flow_field',
    label: '解析流场',
    className: 'ParticleFlowFieldCommand',
    params: [
      numberParam('amplitude', '振幅', 0.15),
      numberParam('frequency', '空间频率', 0.25, { min: 0 }),
      numberParam('timeScale', '时间缩放', 0.06),
      numberParam('phaseOffset', '相位偏移', 0),
      ...vec3Params('worldOffset', '世界偏移')
    ]
  },
  {
    id: 'vortex',
    label: '漩涡',
    className: 'ParticleVortexCommand',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('swirlStrength', '旋转强度', 0.8),
      numberParam('radialPull', '径向吸入', 0.35),
      numberParam('axialLift', '轴向升力', 0),
      numberParam('range', '范围', 10, { min: 0.001 }),
      numberParam('falloffPower', '衰减幂次', 2, { min: 1 }),
      numberParam('minDistance', '最小距离', 0.2, { min: 0.001 })
    ]
  },
  {
    id: 'rotation_force',
    label: '旋转力',
    className: 'ParticleRotationForceCommand',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('strength', '强度', 0.35),
      numberParam('range', '范围', 8, { min: 0.001 }),
      numberParam('falloffPower', '衰减幂次', 2, { min: 1 })
    ]
  },
  {
    id: 'toroidal_circulation',
    label: '环面回流',
    className: 'ParticleToroidalCirculationCommand',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('ringRadius', '主半径', 3, { min: 0 }),
      numberParam('radialThickness', '径向厚度', 1.2, { min: 0.001 }),
      numberParam('axialThickness', '轴向厚度', 0.8, { min: 0.001 }),
      numberParam('circulationStrength', '翻卷力度', 0.35),
      numberParam('outwardStrength', '外撑力度', 0),
      numberParam('upwardStrength', '上抬力度', 0),
      numberParam('followStrength', '回带力度', 0.12),
      numberParam('maxStep', '最大步长', 0.6, { min: 0 }),
      booleanParam('useLifeCurve', '按生命周期衰减', false)
    ]
  },
  {
    id: 'distortion',
    label: '扭曲环',
    className: 'ParticleDistortionCommand',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('radius', '基础半径', 3, { min: 0 }),
      numberParam('radialStrength', '径向扰动', 0.35),
      numberParam('axialStrength', '轴向扰动', 0.25),
      numberParam('tangentialStrength', '切向扰动', 0),
      numberParam('frequency', '空间频率', 0.25, { min: 0 }),
      numberParam('timeScale', '时间缩放', 0.1),
      numberParam('phaseOffset', '相位偏移', 0),
      numberParam('followStrength', '追随强度', 0.35),
      numberParam('maxStep', '最大步长', 0.6, { min: 0 }),
      numberParam('baseAxial', '基础轴向偏移', 0),
      numberParam('seedOffset', '种子偏移', 0, { integer: true, step: '1' }),
      booleanParam('useLifeCurve', '按生命周期衰减', false)
    ]
  },
  {
    id: 'inherit_velocity',
    label: '继承速度',
    className: 'ParticleInheritVelocityCommand',
    params: [
      ...vec3Params('source', '来源速度'),
      selectParam('mode', '继承模式', 'INITIAL', inheritModeOptions),
      numberParam('multiplier', '倍率', 1),
      ...vec3Params('axisMask', '轴向掩码', { x: 1, y: 1, z: 1 }),
      numberParam('overLifetime', '生命周期权重', 1),
      numberParam('damping', '阻尼', 0, { min: 0 }),
      numberParam('maxContributionSpeed', '继承速度上限', 0, { min: 0 }),
      selectParam('space', '空间', 'WORLD', motionSpaceOptions),
      booleanParam('randomizePerParticle', '按粒子随机', false),
      numberParam('randomScaleMin', '随机最小倍率', 1),
      numberParam('randomScaleMax', '随机最大倍率', 1),
      numberParam('randomSeedOffset', '随机种子偏移', 0, { integer: true, step: '1' })
    ]
  },
  {
    id: 'lifetime_motion',
    label: '生命周期运动',
    className: 'ParticleLifetimeMotionCommand',
    params: [
      ...vec3Params('force', 'Force 曲线常量'),
      ...vec3Params('velocity', 'Velocity 曲线常量'),
      selectParam('forceSpace', 'Force 空间', 'WORLD', motionSpaceOptions),
      selectParam('velocitySpace', 'Velocity 空间', 'WORLD', motionSpaceOptions),
      selectParam('velocityMode', 'Velocity 模式', 'ADD', lifetimeVelocityModeOptions),
      booleanParam('randomizePerParticle', '按粒子随机', false),
      numberParam('randomScaleMin', '随机最小倍率', 1),
      numberParam('randomScaleMax', '随机最大倍率', 1),
      numberParam('randomSeedOffset', '随机种子偏移', 0, { integer: true, step: '1' }),
      numberParam('maxVelocityDeltaPerTick', '单 Tick 最大速度变化', 0, { min: 0 })
    ]
  },
  {
    id: 'velocity_add',
    label: '自定义速度增量',
    className: 'ParticleCommand',
    params: vec3Params('delta', '速度增量')
  },
  {
    id: 'velocity_scale',
    label: '自定义速度缩放',
    className: 'ParticleCommand',
    params: vec3Params('scale', '倍率', { x: 1, y: 1, z: 1 })
  }
];

export const CPARTICLE_COMMAND_TYPE_IDS = Object.freeze([
  'drag',
  'gravity',
  'attraction',
  'noise',
  'flow_field',
  'vortex',
  'rotation_force',
  'velocity_add'
]);

export function createCurveGroup() {
  return {
    size: {
      syncAxes: false,
      x: createLifecycleCurve({ min: 0, max: 2, defaultValue: 1 }),
      y: createLifecycleCurve({ min: 0, max: 2, defaultValue: 1 })
    },
    light: createLifecycleCurve({ min: -1, max: 15, defaultValue: 15 }),
    opacity: createLifecycleCurve({ min: 0, max: 100, defaultValue: 100 }),
    color: createLifecycleCurve({
      min: 0,
      max: 1,
      defaultValue: 0,
      keyframes: [
        { time: 0, value: 0 },
        { time: 100, value: 1 }
      ]
    }),
    rotation: {
      syncAxes: false,
      roll: createLifecycleCurve({ min: -180, max: 180, defaultValue: 0 }),
      yaw: createLifecycleCurve({ min: -180, max: 180, defaultValue: 0 }),
      pitch: createLifecycleCurve({ min: -180, max: 180, defaultValue: 0 })
    }
  };
}

export function createGeneratorValue(overrides = {}) {
  const type = normalizeGeneratorValueType(overrides.type);
  return normalizeGeneratorValue({
    id: overrides.id || makeId('value'),
    name: '',
    type,
    value: getGeneratorTypeDefault(type),
    codec: true,
    ...overrides
  });
}

export function createGeneratorVariable(overrides = {}) {
  const value = createGeneratorValue({ codec: true, ...overrides });
  return {
    ...value,
    automation: createGeneratorVariableAutomation({
      targetMin: Number(value.value) || 0,
      targetMax: Number(value.value) || 0,
      ...(overrides.automation || {})
    })
  };
}

export function createGeneratorConstant(overrides = {}) {
  return createGeneratorValue({ codec: false, ...overrides });
}

export function createGeneratorVariableAutomation(overrides = {}) {
  return normalizeVariableAutomation({
    enabled: false,
    source: 'lifecycle',
    sourceVariable: '',
    sourceMin: 0,
    sourceMax: 1,
    targetMin: 0,
    targetMax: 1,
    curve: createLifecycleCurve({
      min: 0,
      max: 1,
      defaultValue: 0,
      keyframes: [
        { time: 0, value: 0 },
        { time: 100, value: 1 }
      ]
    }),
    ...overrides
  });
}

function createEmitterPointsBuilderState() {
  const project = createPointsBuilderProject('generator-pointsbuilder');
  project.name = 'EmitterPointsBuilder';
  project.kotlinEndMode = 'builder';
  return project;
}

export function createEmitterCard(overrides = {}) {
  const id = overrides.id || makeId('emitter');
  return normalizeEmitterCard({
    id,
    name: '发射器 #1',
    enabled: true,
    useGPU: false,
    gpu: {
      updateMode: 'static',
      randomSeed: null,
      useDataColorCurve: false
    },
    externalData: false,
    externalTemplate: false,
    vars: {
      data: '',
      template: ''
    },
    emitter: {
      type: 'sphere',
      offset: { x: 0, y: 0, z: 0 },
      builderState: createEmitterPointsBuilderState(),
      box: { x: 2, y: 1, z: 2, density: 0, surface: false },
      sphere: { r: 2 },
      sphereSurface: { r: 2 },
      ring: { r: 2.5, thickness: 0.15, axis: { x: 0, y: 1, z: 0 } },
      line: { step: 0.2, dir: { x: 1, y: 0, z: 0 } },
      circle: { r: 2.5, axis: { x: 0, y: 1, z: 0 } },
      arc: { r: 2.5, start: 0, end: 180, rotate: 0, axis: { x: 0, y: 1, z: 0 } },
      spiral: { startR: 0.5, endR: 2.5, height: 2, rotateSpeed: 0.35, rBias: 1, hBias: 1, axis: { x: 0, y: 1, z: 0 } }
    },
    emission: {
      mode: 'continuous',
      startTick: 0,
      endTick: -1,
      burstInterval: 10
    },
    particle: {
      countMin: 2,
      countMax: 6,
      lifeMin: 40,
      lifeMax: 120,
      sizeMin: 0.08,
      sizeMax: 0.18,
      colorGradientEnabled: true,
      colorStart: '#ffd1d1',
      colorEnd: '#ff8b8b',
      velocityMode: 'fixed',
      velocity: { x: 0, y: 0.12, z: 0 },
      velocityRandom: { x: 0.04, y: 0.04, z: 0.04 },
      speedMin: 0.2,
      speedMax: 0.6,
      visibleRange: 128
    },
    physics: {
      gravity: 0,
      collision: false,
      collisionTargets: []
    },
    render: {
      effectClass: 'ControlableEndRodEffect',
      textureSheet: 'PARTICLE_SHEET_TRANSLUCENT',
      billboardMode: 'face_camera',
      axis: { x: 0, y: 1, z: 0 },
      scaleMode: 'xyz',
      baseScale: { x: 1, y: 1 },
      alpha: 100,
      light: 15,
      roll: 0,
      yaw: 0,
      pitch: 0,
      relativeRotation: false,
      sign: 0,
      speedLimit: 32
    },
    bindings: {},
    curves: createCurveGroup(),
    ...overrides
  });
}

export function normalizeCollisionTargets(raw = []) {
  const values = Array.isArray(raw) ? raw : String(raw || '').split(/[，,\s]+/);
  return Array.from(new Set(values
    .map((value) => typeof value === 'string' ? value.trim() : value)
    .filter((value) => value !== '' && value !== null && value !== undefined)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => clampInt(value, -2147483648, 2147483647, 0))));
}

export function countDuplicateEmitterSigns(emitters, target, bindingResolver = null) {
  if (!target || target.enabled === false) return 0;
  const targetKey = emitterSignKey(target, bindingResolver);
  if (!targetKey) return 0;
  return (Array.isArray(emitters) ? emitters : []).filter((card) => (
    card
    && card !== target
    && card.id !== target.id
    && card.enabled !== false
    && emitterSignKey(card, bindingResolver) === targetKey
  )).length;
}

function emitterSignKey(card, bindingResolver) {
  const binding = bindingResolver?.resolve?.(card?.bindings, 'render.sign', 'Int');
  if (binding?.status === 'resolved') return `expression:${binding.name}`;
  if (binding?.status === 'expression') return `expression:${binding.kotlin || binding.name}`;
  const sign = Number(card?.render?.sign);
  return Number.isFinite(sign) ? `expression:${Math.trunc(sign)}` : '';
}

export function createCommandQueue(overrides = {}) {
  return {
    id: makeId('queue'),
    name: '命令队列 1',
    signs: [],
    commands: [],
    ...overrides
  };
}

export function createQueueCommand(overrides = {}) {
  return normalizeQueueCommand({
    id: makeId('cmd'),
    enabled: true,
    tick: 0,
    type: 'drag',
    label: '空气阻尼',
    params: createDefaultCommandParams('drag'),
    ...overrides
  });
}

export function createGeneratorProject(overrides = {}) {
  return normalizeGeneratorProject({
    id: '',
    tool: 'generator',
    schemaVersion: 12,
    name: 'EmitterGenerator',
    description: '参数化粒子发射器生成器',
    ticksPerSecond: 20,
    previewTicks: 120,
    playing: true,
    selectedEmitterId: '',
    selectedQueueId: '',
    leftTab: 'emitters',
    pageMode: 'editor',
    kotlin: {
      className: 'GeneratedEmitter',
      packageName: '',
      baseClass: 'AutoParticleEmitters',
      mapping: 'mojmap'
    },
    rootLifecycle: {
      mode: 'interval',
      intervalTick: 1,
      maxTick: 120
    },
    parameters: {
      variables: [],
      constants: []
    },
    doTick: { source: '' },
    doTickExpressions: [],
    deathBehavior: {
      enabled: true,
      mode: 'dissipate'
    },
    settings: {
      showGrid: true,
      showAxes: true,
      showSkybox: true,
      pointSize: 0.08,
      particleRenderScale: 1,
      theme: 'dark-1',
      hotkeys: { ...GENERATOR_HOTKEY_DEFAULTS },
      leftPanelWidth: 340,
      rightPanelWidth: 480
    },
    emitters: [createEmitterCard()],
    commandQueues: [createCommandQueue()],
    gpuCommands: [],
    ...overrides
  });
}

export function convertParticleCommandsToGpu(rawCommands = [], options = {}) {
  const result = convertCommands(rawCommands, (type) => CPARTICLE_COMMAND_TYPE_IDS.includes(type));
  const signs = normalizeCollisionTargets(options.signs || []);
  if (signs.length && result.commands.length) {
    result.adjustments.push({ field: 'signs', values: signs });
  }
  return result;
}

export function convertGpuCommandsToParticle(rawCommands = []) {
  return convertCommands(rawCommands, (type) => COMMAND_TYPE_OPTIONS.some((item) => item.id === type));
}

function convertCommands(rawCommands, isCompatible) {
  const commands = [];
  const incompatible = [];
  const adjustments = [];
  (Array.isArray(rawCommands) ? rawCommands : []).forEach((command, index) => {
    const type = resolveKnownCommandType(command?.type);
    if (!type || !isCompatible(type)) {
      incompatible.push({
        id: String(command?.id || ''),
        type: String(command?.type || ''),
        label: String(command?.label || command?.type || `命令 ${index + 1}`)
      });
      return;
    }
    const converted = normalizeQueueCommand({
      ...command,
      id: makeId('cmd'),
      tick: 0,
      type,
      params: { ...(command?.params || {}) }
    }, index);
    commands.push(converted);
    const sourceTick = Math.trunc(toNumber(command?.tick, 0));
    if (sourceTick !== 0) {
      adjustments.push({
        id: converted.id,
        type,
        label: String(command?.label || command?.type || `命令 ${index + 1}`),
        field: 'tick',
        from: sourceTick,
        to: 0
      });
    }
  });
  return { commands, incompatible, adjustments };
}

export function normalizeGeneratorProject(raw = {}) {
  const base = {
    ...raw,
    settings: {
      showGrid: true,
      showAxes: true,
      showSkybox: true,
      pointSize: 0.08,
      particleRenderScale: 1,
      theme: 'dark-1',
      hotkeys: { ...GENERATOR_HOTKEY_DEFAULTS },
      leftPanelWidth: 340,
      rightPanelWidth: 480,
      ...(raw.settings || {})
    }
  };
  const sourceSchemaVersion = Number(base.schemaVersion || 0);
  const legacyPercentUnit = sourceSchemaVersion < 3;
  const legacySizeInRenderScale = sourceSchemaVersion < 4;
  const repairOverscaledOpacityHandles = sourceSchemaVersion >= 3 && sourceSchemaVersion < 7;
  const legacyUseGPU = base.particleBackend?.type === 'cparticle';
  const legacyGpuUpdateMode = base.particleBackend?.cparticleUpdateMode === 'dynamic' ? 'dynamic' : 'static';
  const emitters = Array.isArray(base.emitters) && base.emitters.length
    ? base.emitters.map((card, index) => normalizeEmitterCard(card, index, {
        legacyPercentUnit,
        legacySizeInRenderScale,
        repairOverscaledOpacityHandles,
        legacyUseGPU,
        legacyGpuUpdateMode,
        inferLegacyCurveEnabled: sourceSchemaVersion < 11,
        legacyColorCurveEnabledByDefault: sourceSchemaVersion <= 7
      }))
    : [createEmitterCard()];
  const commandQueues = Array.isArray(base.commandQueues) && base.commandQueues.length
    ? base.commandQueues.map((queue, index) => ({
      id: String(queue.id || makeId('queue')),
      name: String(queue.name || `命令队列 ${index + 1}`),
      signs: Array.isArray(queue.signs) ? queue.signs.map((value) => Math.trunc(toNumber(value, 0))) : [],
      commands: Array.isArray(queue.commands) ? queue.commands.map((command, commandIndex) => normalizeQueueCommand(command, commandIndex)) : []
    }))
    : [createCommandQueue()];
  const gpuCommandSource = Array.isArray(base.gpuCommands) ? base.gpuCommands : [];
  const gpuCommands = gpuCommandSource.map((command, index) => normalizeQueueCommand(command, index, {
    preserveUnknownType: true
  }));
  const parameters = normalizeGeneratorParameters(base.parameters);
  const legacyDoTick = Array.isArray(base.doTickExpressions)
    ? base.doTickExpressions.filter(Boolean).join('\n')
    : '';
  const normalized = {
    ...base,
    schemaVersion: 12,
    ticksPerSecond: clampInt(base.ticksPerSecond, 1, 200, 20),
    previewTicks: clampInt(base.previewTicks, 1, 2000, 120),
    leftTab: ['emitters', 'queues', 'gpu_commands', 'project', 'tick', 'death'].includes(base.leftTab) ? base.leftTab : 'emitters',
    pageMode: base.pageMode === 'code' ? 'code' : 'editor',
    selectedEmitterId: emitters.some((item) => item.id === base.selectedEmitterId) ? base.selectedEmitterId : emitters[0]?.id || '',
    selectedQueueId: commandQueues.some((item) => item.id === base.selectedQueueId) ? base.selectedQueueId : commandQueues[0]?.id || '',
    kotlin: {
      className: String(base.kotlin?.className || 'GeneratedEmitter'),
      packageName: String(base.kotlin?.packageName || ''),
      baseClass: String(base.kotlin?.baseClass || 'AutoParticleEmitters'),
      mapping: base.kotlin?.mapping === 'yarn' ? 'yarn' : 'mojmap'
    },
    rootLifecycle: normalizeRootLifecycle(base.rootLifecycle),
    parameters,
    doTick: {
      source: String(base.doTick?.source ?? legacyDoTick ?? '').replace(/\r\n/g, '\n').trim()
    },
    deathBehavior: {
      enabled: base.deathBehavior?.enabled !== false,
      mode: base.deathBehavior?.mode === 'respawn' ? 'respawn' : 'dissipate'
    },
    settings: {
      ...base.settings,
      showGrid: base.settings.showGrid !== false,
      showAxes: base.settings.showAxes !== false,
      showSkybox: base.settings.showSkybox !== false,
      pointSize: clampNumber(base.settings.pointSize, 0.01, 0.6, 0.08),
      particleRenderScale: clampNumber(base.settings.particleRenderScale, 0.05, 20, 1),
      theme: normalizeGeneratorTheme(base.settings.theme),
      hotkeys: normalizeGeneratorHotkeys(base.settings.hotkeys),
      leftPanelWidth: clampInt(base.settings.leftPanelWidth, 220, 2400, 340),
      rightPanelWidth: clampInt(base.settings.rightPanelWidth, 260, 2400, 480)
    },
    emitters,
    commandQueues,
    gpuCommands
  };
  delete normalized.particleBackend;
  return normalized;
}

export function normalizeEmitterCard(raw = {}, index = 0, options = {}) {
  const card = raw && typeof raw === 'object' ? raw : {};
  const defaults = createCurveGroup();
  const gpuSource = card.gpu && typeof card.gpu === 'object' ? card.gpu : {};
  const particleSource = card.particle || {};
  const physicsSource = card.physics || {};
  const renderSource = card.render || {};
  const templateSource = card.template || {};
  const legacyBaseScale = normalizePlanarScale(renderSource.baseScale, { x: 0.14, y: 0.14 });
  const hasExplicitSize = particleSource.sizeMin !== undefined || particleSource.sizeMax !== undefined || particleSource.size !== undefined;
  const inferredLegacySize = options.legacySizeInRenderScale && !hasExplicitSize ? Math.max(0.001, Number(legacyBaseScale.x || 0.14)) : undefined;
  const baseScale = options.legacySizeInRenderScale && !hasExplicitSize
    ? normalizeLegacyScaleMultiplier(legacyBaseScale)
    : normalizePlanarScale(renderSource.baseScale, { x: 1, y: 1 });
  const alphaUsesUnit = options.legacyPercentUnit || (renderSource.alpha === undefined && templateSource.alpha !== undefined);
  const velocityMode = particleSource.velocityMode || particleSource.velMode;
  const next = {
    ...card,
    id: String(card.id || makeId('emitter')),
    name: String(card.name || `发射器 #${index + 1}`),
    enabled: card.enabled !== false,
    useGPU: card.useGPU === true || options.legacyUseGPU === true,
    gpu: {
      updateMode: gpuSource.updateMode === 'dynamic'
        ? 'dynamic'
        : options.legacyGpuUpdateMode === 'dynamic'
          ? 'dynamic'
          : 'static',
      randomSeed: gpuSource.randomSeed === null || gpuSource.randomSeed === undefined || gpuSource.randomSeed === ''
        ? null
        : clampInt(gpuSource.randomSeed, -2147483648, 2147483647, 0),
      useDataColorCurve: gpuSource.useDataColorCurve === true
    },
    externalData: card.externalData === true,
    externalTemplate: card.externalTemplate === true,
    vars: {
      data: normalizeEmitterVariableName(card.vars?.data),
      template: normalizeEmitterVariableName(card.vars?.template)
    },
    emitter: {
      type: normalizeEmitterType(card.emitter?.type),
      offset: normalizeVector(card.emitter?.offset, { x: 0, y: 0, z: 0 }),
      builderState: normalizePointsBuilderProject(
        card.emitter?.builderState || createEmitterPointsBuilderState(),
        'generator-pointsbuilder'
      ),
      box: {
        x: clampNumber(card.emitter?.box?.x, 0.001, 100, 2),
        y: clampNumber(card.emitter?.box?.y, 0.001, 100, 1),
        z: clampNumber(card.emitter?.box?.z, 0.001, 100, 2),
        density: clampNumber(card.emitter?.box?.density, 0, 1, 0),
        surface: card.emitter?.box?.surface === true
      },
      sphere: { r: clampNumber(card.emitter?.sphere?.r, 0.001, 100, 2) },
      sphereSurface: { r: clampNumber(card.emitter?.sphereSurface?.r, 0.001, 100, 2) },
      ring: {
        r: clampNumber(card.emitter?.ring?.r, 0.001, 100, 2.5),
        thickness: clampNumber(card.emitter?.ring?.thickness, 0, 100, 0.15),
        axis: normalizeVector(card.emitter?.ring?.axis, { x: 0, y: 1, z: 0 })
      },
      line: {
        step: clampNumber(card.emitter?.line?.step, 0.0001, 100, 0.2),
        dir: normalizeVector(card.emitter?.line?.dir, { x: 1, y: 0, z: 0 })
      },
      circle: {
        r: clampNumber(card.emitter?.circle?.r, 0.001, 100, 2.5),
        axis: normalizeVector(card.emitter?.circle?.axis, { x: 0, y: 1, z: 0 })
      },
      arc: {
        r: clampNumber(card.emitter?.arc?.r, 0.001, 100, 2.5),
        start: clampNumber(card.emitter?.arc?.start, -3600, 3600, 0),
        end: clampNumber(card.emitter?.arc?.end, -3600, 3600, 180),
        rotate: clampNumber(card.emitter?.arc?.rotate, -3600, 3600, 0),
        axis: normalizeVector(card.emitter?.arc?.axis, { x: 0, y: 1, z: 0 })
      },
      spiral: {
        startR: clampNumber(card.emitter?.spiral?.startR, 0.001, 100, 0.5),
        endR: clampNumber(card.emitter?.spiral?.endR, 0.001, 100, 2.5),
        height: clampNumber(card.emitter?.spiral?.height, -100, 100, 2),
        rotateSpeed: clampNumber(card.emitter?.spiral?.rotateSpeed, -100, 100, 0.35),
        rBias: clampNumber(card.emitter?.spiral?.rBias, 0.001, 100, 1),
        hBias: clampNumber(card.emitter?.spiral?.hBias, 0.001, 100, 1),
        axis: normalizeVector(card.emitter?.spiral?.axis, { x: 0, y: 1, z: 0 })
      }
    },
    emission: {
      mode: ['continuous', 'burst', 'once'].includes(card.emission?.mode) ? card.emission.mode : 'continuous',
      startTick: clampInt(card.emission?.startTick, 0, 100000, 0),
      endTick: clampInt(card.emission?.endTick, -1, 100000, -1),
      burstInterval: clampInt(card.emission?.burstInterval, 1, 100000, 10)
    },
    particle: {
      countMin: clampInt(particleSource.countMin, 1, 100000, 2),
      countMax: clampInt(particleSource.countMax, 1, 100000, 6),
      lifeMin: clampInt(particleSource.lifeMin, 1, 100000, 40),
      lifeMax: clampInt(particleSource.lifeMax, 1, 100000, 120),
      sizeMin: clampNumber(particleSource.sizeMin ?? particleSource.size ?? inferredLegacySize, 0.001, 100, 0.08),
      sizeMax: clampNumber(particleSource.sizeMax ?? particleSource.size ?? inferredLegacySize, 0.001, 100, 0.18),
      colorGradientEnabled: particleSource.colorGradientEnabled !== false,
      colorStart: normalizeHex(particleSource.colorStart, '#ffd1d1'),
      colorEnd: normalizeHex(particleSource.colorEnd, '#ff8b8b'),
      velocityMode: velocityMode === 'spawn_inward' || velocityMode === 'spawn_in'
        ? 'spawn_inward'
        : velocityMode === 'spawn_relative' || velocityMode === 'spawn_rel'
          ? 'spawn_relative'
          : 'fixed',
      velocity: normalizeVector(particleSource.velocity || particleSource.vel, { x: 0, y: 0.12, z: 0 }),
      velocityRandom: normalizeVector(particleSource.velocityRandom || particleSource.velRandom, { x: 0.04, y: 0.04, z: 0.04 }),
      speedMin: clampNumber(particleSource.speedMin ?? particleSource.velSpeedMin, 0, 100, 0.2),
      speedMax: clampNumber(particleSource.speedMax ?? particleSource.velSpeedMax, 0, 100, 0.6),
      visibleRange: clampInt(particleSource.visibleRange, 1, 10000, 128)
    },
    physics: {
      gravity: clampNumber(physicsSource.gravity, 0, 1000, 0),
      collision: physicsSource.collision === true,
      collisionTargets: normalizeCollisionTargets(
        Array.isArray(physicsSource.collisionTargets)
          ? physicsSource.collisionTargets
          : physicsSource.signs
      )
    },
    render: {
      effectClass: normalizeEffectClass(renderSource.effectClass ?? templateSource.effectClass),
      textureSheet: normalizeTextureSheet(renderSource.textureSheet),
      billboardMode: normalizeBillboardMode(renderSource.billboardMode || (templateSource.faceToCamera === false ? 'none' : 'face_camera')),
      axis: normalizeVector(renderSource.axis, { x: 0, y: 1, z: 0 }),
      scaleMode: renderSource.scaleMode === 'uniform_xy' ? 'uniform_xy' : 'xyz',
      baseScale,
      alpha: normalizePercentValue(renderSource.alpha ?? templateSource.alpha, 100, alphaUsesUnit),
      light: clampInt(renderSource.light ?? templateSource.light, -1, 15, 15),
      roll: clampNumber(renderSource.roll ?? templateSource.roll, -3600, 3600, 0),
      yaw: clampNumber(renderSource.yaw ?? templateSource.yaw, -3600, 3600, 0),
      pitch: clampNumber(renderSource.pitch ?? templateSource.pitch, -3600, 3600, 0),
      relativeRotation: renderSource.relativeRotation === true,
      sign: clampInt(renderSource.sign ?? templateSource.sign, -2147483648, 2147483647, 0),
      speedLimit: clampNumber(renderSource.speedLimit ?? templateSource.speedLimit, 0, 1000, 32)
    },
    bindings: normalizeEmitterBindings(card.bindings),
    bindingModes: normalizeEmitterBindingModes(card.bindingModes),
    curves: {
      size: {
        syncAxes: card.curves?.size?.syncAxes === true,
        x: normalizeEmitterLifecycleCurve(card.curves?.size?.x, defaults.size.x, options),
        y: normalizeEmitterLifecycleCurve(card.curves?.size?.y, defaults.size.y, options)
      },
      light: normalizeEmitterLifecycleCurve(card.curves?.light ?? card.curves?.brightness, defaults.light, options),
      opacity: applyEmitterCurveEnabled(
        normalizeOpacityCurve(
          card.curves?.opacity,
          defaults.opacity,
          options.legacyPercentUnit,
          options.repairOverscaledOpacityHandles
        ),
        card.curves?.opacity,
        defaults.opacity,
        options
      ),
      color: normalizeEmitterColorCurve(
        card.curves?.color,
        defaults.color,
        particleSource.colorOverLifeEnabled,
        options
      ),
      rotation: {
        syncAxes: card.curves?.rotation?.syncAxes === true,
        roll: normalizeEmitterLifecycleCurve(card.curves?.rotation?.roll, defaults.rotation.roll, options),
        yaw: normalizeEmitterLifecycleCurve(card.curves?.rotation?.yaw, defaults.rotation.yaw, options),
        pitch: normalizeEmitterLifecycleCurve(card.curves?.rotation?.pitch, defaults.rotation.pitch, options)
      }
    }
  };
  if (next.particle.countMax < next.particle.countMin) next.particle.countMax = next.particle.countMin;
  if (next.particle.lifeMax < next.particle.lifeMin) next.particle.lifeMax = next.particle.lifeMin;
  if (next.particle.sizeMax < next.particle.sizeMin) next.particle.sizeMax = next.particle.sizeMin;
  if (next.particle.speedMax < next.particle.speedMin) next.particle.speedMax = next.particle.speedMin;
  return next;
}

function normalizeEmitterLifecycleCurve(raw, fallback, options = {}) {
  const normalized = normalizeLifecycleCurve({ ...fallback, ...(raw || {}) });
  return applyEmitterCurveEnabled(normalized, raw, fallback, options);
}

function normalizeEmitterColorCurve(raw, fallback, legacyEnabled, options = {}) {
  const normalized = normalizeEmitterLifecycleCurve(raw, fallback, options);
  const hasExplicitState = raw && Object.prototype.hasOwnProperty.call(raw, 'enabled');
  if (hasExplicitState || options.inferLegacyCurveEnabled !== true) return normalized;
  if (legacyEnabled !== undefined) normalized.enabled = legacyEnabled !== false;
  else if (options.legacyColorCurveEnabledByDefault === true) normalized.enabled = true;
  return normalized;
}

function applyEmitterCurveEnabled(normalized, raw, fallback, options = {}) {
  const hasExplicitState = raw && Object.prototype.hasOwnProperty.call(raw, 'enabled');
  normalized.enabled = hasExplicitState
    ? raw.enabled === true
    : options.inferLegacyCurveEnabled === true && lifecycleCurveBehaviorDiffers(normalized, fallback);
  return normalized;
}

function lifecycleCurveBehaviorDiffers(left, right) {
  return JSON.stringify(lifecycleCurveBehavior(left)) !== JSON.stringify(lifecycleCurveBehavior(right));
}

function lifecycleCurveBehavior(raw) {
  const curve = normalizeLifecycleCurve(raw);
  return {
    mode: curve.mode,
    keyframes: curve.keyframes.map((frame) => ({
      time: frame.time,
      value: frame.value,
      out: { x: frame.out.x, y: frame.out.y },
      in: { x: frame.in.x, y: frame.in.y }
    }))
  };
}

function normalizeGeneratorParameters(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    variables: Array.isArray(source.variables)
      ? source.variables.map((item, index) => normalizeGeneratorValue({ codec: true, ...item }, index))
      : [],
    constants: Array.isArray(source.constants)
      ? source.constants.map((item, index) => normalizeGeneratorValue({ codec: false, ...item }, index))
      : []
  };
}

function normalizeGeneratorValue(raw = {}, index = 0) {
  const type = normalizeGeneratorValueType(raw.type);
  return {
    id: String(raw.id || makeId('value')),
    name: normalizeValueName(raw.name, `value${index + 1}`),
    type,
    value: normalizeGeneratorTypedValue(type, raw.value ?? raw.defaultValue),
    codec: raw.codec !== false,
    ...(raw.codec !== false ? { automation: normalizeVariableAutomation(raw.automation, type, raw.value ?? raw.defaultValue) } : {}),
    ...(type === 'Vector3f' ? { colorMode: raw.colorMode === true } : {})
  };
}

function normalizeVariableAutomation(raw, type, rawValue) {
  const fallback = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;
  const source = raw && typeof raw === 'object' ? raw : {};
  const targetMin = toNumber(source.targetMin, fallback);
  const targetMax = toNumber(source.targetMax, fallback);
  const sourceMin = toNumber(source.sourceMin, 0);
  const rawSourceMax = toNumber(source.sourceMax, 1);
  const sourceMax = Math.abs(rawSourceMax - sourceMin) < 1e-9 ? sourceMin + 1 : rawSourceMax;
  const curve = normalizeLifecycleCurve({
    min: 0,
    max: 1,
    defaultValue: 0,
    ...(source.curve || {})
  });
  return {
    enabled: source.enabled === true && (!type || ['Int', 'Long', 'Float', 'Double'].includes(type)),
    source: source.source === 'variable' ? 'variable' : 'lifecycle',
    sourceVariable: String(source.sourceVariable || '').trim(),
    sourceMin,
    sourceMax,
    targetMin: Math.min(targetMin, targetMax),
    targetMax: Math.max(targetMin, targetMax),
    curve
  };
}

function normalizeValueName(raw, fallback) {
  const text = String(raw || '').trim();
  return isGeneratorValueName(text) ? text : fallback;
}

function normalizeEmitterBindings(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw)
    .map(([path, value]) => [String(path || '').trim(), String(value || '').trim()])
    .filter(([path, value]) => isSupportedEmitterBindingPath(path) && value));
}

function normalizeEmitterBindingModes(raw = {}) {
  if (!raw || typeof raw !== 'object') return {};
  const modes = new Set(['constant', 'independent', 'vector']);
  return Object.fromEntries(Object.entries(raw)
    .map(([path, value]) => [String(path || '').trim(), String(value || '').trim()])
    .filter(([path, value]) => isSupportedEmitterBindingPath(path) && modes.has(value)));
}

function isSupportedEmitterBindingPath(path) {
  return path && path !== 'render.baseScale.z';
}

function normalizeRootLifecycle(raw = {}) {
  const mode = ['once', 'interval', 'interval_n_tick'].includes(raw.mode) ? raw.mode : 'interval';
  return {
    mode,
    intervalTick: clampInt(raw.intervalTick, 1, 100000, 1),
    maxTick: clampInt(raw.maxTick, 1, 100000, 120)
  };
}

function normalizeEmitterType(raw) {
  const id = String(raw || 'sphere');
  return EMITTER_TYPES.some((item) => item.id === id) ? id : 'sphere';
}

function normalizeBillboardMode(raw) {
  const id = String(raw || 'face_camera');
  return BILLBOARD_MODES.some((item) => item.id === id) ? id : 'face_camera';
}

function normalizeEffectClass(raw) {
  const text = String(raw || 'ControlableEndRodEffect');
  return text.trim() || 'ControlableEndRodEffect';
}

function normalizeTextureSheet(raw) {
  const text = String(raw || 'PARTICLE_SHEET_TRANSLUCENT');
  return text.trim() || 'PARTICLE_SHEET_TRANSLUCENT';
}

function normalizeGeneratorTheme(raw) {
  const text = String(raw || 'dark-1');
  if (text === 'light-pink' || ['light-1', 'light-2', 'light-3'].includes(text)) return 'light-pink';
  return GENERATOR_THEME_OPTIONS.some((item) => item.id === text) ? text : 'dark-1';
}

function normalizeGeneratorHotkeys(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = { ...GENERATOR_HOTKEY_DEFAULTS };
  Object.keys(result).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return;
    const value = String(source[key] ?? '').trim();
    if (key === 'undo' && value === 'KeyZ') result[key] = 'Mod+KeyZ';
    else if (key === 'redo' && value === 'KeyY') result[key] = 'Mod+KeyY';
    else result[key] = value;
  });
  return result;
}

function normalizeEmitterVariableName(raw) {
  const text = String(raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!text) return '';
  return /^[A-Za-z_]/.test(text) ? text : `_${text}`;
}

function normalizeVector(raw = {}, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: toNumber(raw?.x, fallback.x),
    y: toNumber(raw?.y, fallback.y),
    z: toNumber(raw?.z, fallback.z)
  };
}

function normalizePlanarScale(raw = {}, fallback = { x: 1, y: 1 }) {
  return {
    x: toNumber(raw?.x, fallback.x),
    y: toNumber(raw?.y, fallback.y)
  };
}

function normalizeLegacyScaleMultiplier(baseScale) {
  const base = Math.max(0.001, toNumber(baseScale?.x, 0.14));
  return {
    x: 1,
    y: clampNumber(toNumber(baseScale?.y, base) / base, 0.001, 100, 1)
  };
}

function normalizeHex(raw, fallback) {
  const text = String(raw || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
}

function normalizeQueueCommand(raw = {}, index = 0, options = {}) {
  const command = raw && typeof raw === 'object' ? raw : {};
  const knownType = resolveKnownCommandType(command.type);
  const preserveUnknownType = options.preserveUnknownType === true && !knownType;
  const type = preserveUnknownType
    ? String(command.type || 'unknown').trim() || 'unknown'
    : knownType || 'drag';
  const option = COMMAND_TYPE_OPTIONS.find((item) => item.id === type);
  return {
    id: String(command.id || makeId('cmd')),
    enabled: command.enabled !== false,
    tick: clampInt(command.tick, 0, 100000, 0),
    type,
    label: String(command.label || option?.label || `命令 ${index + 1}`),
    params: preserveUnknownType
      ? { ...(command.params && typeof command.params === 'object' ? command.params : {}) }
      : normalizeCommandParams(type, command.params)
  };
}

function normalizeCommandType(raw) {
  return resolveKnownCommandType(raw) || 'drag';
}

function resolveKnownCommandType(raw) {
  const text = String(raw || 'velocity_add');
  if (text === 'acceleration') return 'velocity_add';
  const byClassName = COMMAND_TYPE_OPTIONS.find((item) => item.className === text);
  if (byClassName) return byClassName.id;
  return COMMAND_TYPE_OPTIONS.some((item) => item.id === text) ? text : '';
}

export function getCommandTypeOption(type) {
  return COMMAND_TYPE_OPTIONS.find((item) => item.id === type) || COMMAND_TYPE_OPTIONS[0];
}

export function createDefaultCommandParams(type) {
  const option = getCommandTypeOption(normalizeCommandType(type));
  return Object.fromEntries((option?.params || []).map((field) => [field.key, field.defaultValue]));
}

function normalizeCommandParams(type, raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const params = createDefaultCommandParams(type);
  const option = getCommandTypeOption(type);
  (option?.params || []).forEach((field) => {
    const legacyValue = readLegacyCommandParam(type, source, field.key);
    const value = source[field.key] ?? legacyValue ?? field.defaultValue;
    params[field.key] = normalizeCommandParamValue(field, value);
  });
  return params;
}

function readLegacyCommandParam(type, source, key) {
  if (!source || typeof source !== 'object') return undefined;
  const legacy = { x: source.x, y: source.y, z: source.z };
  if (!Object.values(legacy).some((value) => value !== undefined)) return undefined;
  const maps = {
    drag: { damping: 'x', minSpeed: 'y', linear: 'z' },
    velocity_add: { deltaX: 'x', deltaY: 'y', deltaZ: 'z' },
    velocity_scale: { scaleX: 'x', scaleY: 'y', scaleZ: 'z' }
  };
  const legacyKey = maps[type]?.[key];
  return legacyKey ? legacy[legacyKey] : undefined;
}

function normalizeCommandParamValue(field, value) {
  if (field.type === 'boolean') {
    return value === true || value === 'true' || value === 1 || value === '1';
  }
  if (field.type === 'select') {
    const text = String(value ?? field.defaultValue);
    return field.options?.some((item) => item.value === text) ? text : field.defaultValue;
  }
  const numeric = toNumber(value, field.defaultValue);
  const clamped = clampNumber(
    numeric,
    Number.isFinite(Number(field.min)) ? Number(field.min) : Number.NEGATIVE_INFINITY,
    Number.isFinite(Number(field.max)) ? Number(field.max) : Number.POSITIVE_INFINITY,
    field.defaultValue
  );
  return field.integer ? Math.round(clamped) : clamped;
}

function normalizePercentValue(value, fallback = 100, legacyPercentUnit = false) {
  const numeric = toNumber(value, fallback);
  const migrated = legacyPercentUnit && numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  return clampNumber(migrated, 0, 100, fallback);
}

function normalizeOpacityCurve(raw, fallbackCurve, legacyPercentUnit = false, repairOverscaledHandles = false) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const curve = normalizeLifecycleCurve({ ...fallbackCurve, ...source });
  const frames = Array.isArray(curve.keyframes) ? curve.keyframes : [];
  const frameValuesLookUnit = frames.length > 0
    && frames.every((frame) => Number(frame.value || 0) >= 0 && Number(frame.value || 0) <= 1);
  const frameValuesLookPercent = frames.length > 0
    && frames.every((frame) => Number(frame.value || 0) >= 0 && Number(frame.value || 0) <= 100);
  const sourceMax = Number(source.max);
  if (repairOverscaledHandles && frameValuesLookPercent && Number.isFinite(sourceMax) && sourceMax > 1) {
    // The old migration multiplied on every reopen; preserve modest intentional overshoot from existing curves.
    const repairThreshold = Math.max(100, Math.abs(Number(curve.max || 100))) * 1.5;
    let maxHandleMagnitude = Math.max(
      0,
      ...frames.flatMap((frame) => [Math.abs(Number(frame.in?.y || 0)), Math.abs(Number(frame.out?.y || 0))])
    );
    while (maxHandleMagnitude > repairThreshold) {
      frames.forEach((frame) => {
        if (frame.in) frame.in.y = Number(frame.in.y || 0) / 100;
        if (frame.out) frame.out.y = Number(frame.out.y || 0) / 100;
      });
      maxHandleMagnitude /= 100;
    }
  }
  const looksLegacyUnit = frameValuesLookUnit
    && (legacyPercentUnit || (Number.isFinite(sourceMax) && sourceMax <= 1));
  if (!looksLegacyUnit) {
    curve.min = 0;
    curve.max = 100;
    curve.defaultValue = normalizePercentValue(curve.defaultValue, 100, false);
    frames.forEach((frame) => {
      frame.value = clampNumber(frame.value, 0, 100, 100);
    });
    return curve;
  }
  curve.min = 0;
  curve.max = 100;
  curve.defaultValue = normalizePercentValue(curve.defaultValue, 100, true);
  frames.forEach((frame) => {
    frame.value = normalizePercentValue(frame.value, 100, true);
    if (frame.in) frame.in.y = Number(frame.in.y || 0) * 100;
    if (frame.out) frame.out.y = Number(frame.out.y || 0) * 100;
  });
  return curve;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, min, max, fallback = 0) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function clampInt(value, min, max, fallback = 0) {
  return Math.round(clampNumber(value, min, max, fallback));
}
