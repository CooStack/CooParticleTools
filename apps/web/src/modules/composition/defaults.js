import { makeId } from '../../utils/id.js';
import { createPointsBuilderBaseProject } from '../pointsbuilder/schema.js';

export const DEFAULT_COMPOSITION_EFFECT_CLASS = 'ControlableEndRodEffect';

export const COMPOSITION_EFFECT_CLASS_OPTIONS = [
  'ControlableEndRodEffect',
  'ControlableEnchantmentEffect',
  'ControlableCloudEffect',
  'ControlableFallingDustEffect',
  'ControlableSplashEffect',
  'ControlableFlashEffect',
  'ControlableFireworkEffect',
  'ControlableAngryVillagerEffect',
  'ControlableAshEffect',
  'ControlableBubbleEffect',
  'ControlableBubbleColumnUpEffect',
  'ControlableBubblePopEffect',
  'ControlableCampfireCosySmokeEffect',
  'ControlableCampfireSignalSmokeEffect',
  'ControlableCherryLeavesEffect',
  'ControlableComposterEffect',
  'ControlableCrimsonSporeEffect',
  'ControlableCritEffect',
  'ControlableCurrentDownEffect',
  'ControlableDamageIndicatorEffect',
  'ControlableDolphinEffect',
  'ControlableDragonBreathEffect',
  'ControlableDrippingDripstoneLavaEffect',
  'ControlableDrippingDripstoneWaterEffect',
  'ControlableDrippingHoneyEffect',
  'ControlableDrippingLavaEffect',
  'ControlableDrippingObsidianTearEffect',
  'ControlableDrippingWaterEffect',
  'ControlableDustPlumeEffect',
  'ControlableEffectParticleEffect',
  'ControlableEggCrackEffect',
  'ControlableElectricSparkEffect',
  'ControlableEnchantedHitEffect',
  'ControlableExplosionEffect',
  'ControlableFallingDripstoneLavaEffect',
  'ControlableFallingDripstoneWaterEffect',
  'ControlableFallingHoneyEffect',
  'ControlableFallingLavaEffect',
  'ControlableFallingNectarEffect',
  'ControlableFallingObsidianTearEffect',
  'ControlableFallingSporeBlossomEffect',
  'ControlableFallingWaterEffect',
  'ControlableFishingEffect',
  'ControlableFlameEffect',
  'ControlableGlowEffect',
  'ControlableGlowSquidInkEffect',
  'ControlableGustEffect',
  'ControlableHappyVillagerEffect',
  'ControlableHeartEffect',
  'ControlableInfestedEffect',
  'ControlableInstantEffectParticleEffect',
  'ControlableLandingHoneyEffect',
  'ControlableLandingLavaEffect',
  'ControlableLandingObsidianTearEffect',
  'ControlableLargeSmokeEffect',
  'ControlableLavaEffect',
  'ControlableMyceliumEffect',
  'ControlableNautilusEffect',
  'ControlableNoteEffect',
  'ControlableOminousSpawningEffect',
  'ControlablePoofEffect',
  'ControlablePortalEffect',
  'ControlableRaidOmenEffect',
  'ControlableRainEffect',
  'ControlableReversePortalEffect',
  'ControlableScrapeEffect',
  'ControlableSculkChargePopEffect',
  'ControlableSculkSoulEffect',
  'ControlableSmallFlameEffect',
  'ControlableSmallGustEffect',
  'ControlableSmokeEffect',
  'ControlableSneezeEffect',
  'ControlableSnowflakeEffect',
  'ControlableSonicBoomEffect',
  'ControlableSoulEffect',
  'ControlableSoulFireFlameEffect',
  'ControlableSpitEffect',
  'ControlableSporeBlossomAirEffect',
  'ControlableSquidInkEffect',
  'ControlableSweepAttackEffect',
  'ControlableTotemOfUndyingEffect',
  'ControlableTrialOmenEffect',
  'ControlableTrialSpawnerDetectionEffect',
  'ControlableTrialSpawnerDetectionOminousEffect',
  'ControlableUnderwaterEffect',
  'ControlableVaultConnectionEffect',
  'ControlableWarpedSporeEffect',
  'ControlableWaxOffEffect',
  'ControlableWaxOnEffect',
  'ControlableWhiteAshEffect',
  'ControlableWhiteSmokeEffect',
  'ControlableWitchEffect'
];

export const COMPOSITION_GLOBAL_VAR_TYPES = [
  'Int',
  'Long',
  'Float',
  'Double',
  'Boolean',
  'String',
  'Vec3',
  'RelativeLocation',
  'Vector3f'
];

export const COMPOSITION_CONTROLLER_VAR_TYPES = [
  'Boolean',
  'Int',
  'Float',
  'Double',
  'Long',
  'String'
];

export const COMPOSITION_PARTICLE_INIT_TARGET_OPTIONS = [
  'color',
  'size',
  'particleAlpha',
  'currentAge',
  'textureSheet'
];

export const COMPOSITION_CONTROLLER_ACTION_TYPES = [
  { id: 'tick_js', title: 'tick action (JS)' }
];

export const COMPOSITION_ANGLE_OFFSET_EASE_OPTIONS = [
  { id: 'outCubic', title: 'outCubic' },
  { id: 'outQuad', title: 'outQuad' },
  { id: 'linear', title: 'linear' },
  { id: 'bezierEase', title: 'bezierEase' }
];

export const COMPOSITION_CARD_DATA_TYPES = [
  { id: 'single', label: 'single' },
  { id: 'particle_shape', label: 'ParticleShapeComposition' },
  { id: 'sequenced_shape', label: 'SequencedParticleShapeComposition' }
];

export function createCompositionPointsBuilderState() {
  return createPointsBuilderBaseProject('composition-pointsbuilder');
}

export function createScaleHelper(overrides = {}) {
  return {
    type: 'linear',
    from: 0.2,
    to: 1,
    duration: 20,
    p1: { x: 0.2, y: 0.8 },
    p2: { x: 0.35, y: 1 },
    ...overrides
  };
}

export function createCompositionVar(overrides = {}) {
  return {
    id: makeId('var'),
    name: 'value1',
    type: 'Double',
    value: '0.0',
    codec: true,
    mutable: true,
    ...overrides
  };
}

export function createCompositionConst(overrides = {}) {
  return {
    id: makeId('const'),
    name: 'const1',
    type: 'Int',
    value: '0',
    ...overrides
  };
}

export function createCompositionAnimate(overrides = {}) {
  return {
    id: makeId('animate'),
    count: 1,
    condition: '',
    ...overrides
  };
}

export function createDisplayAction(overrides = {}) {
  return {
    id: makeId('display'),
    type: 'rotateToWithAngle',
    toUsePreset: true,
    toPreset: 'RelativeLocation.yAxis()',
    toExpr: 'RelativeLocation.yAxis()',
    toManualCtor: 'RelativeLocation',
    toManualX: 0,
    toManualY: 1,
    toManualZ: 0,
    angleMode: 'numeric',
    angleValue: 0.05,
    angleUnit: 'rad',
    angleExpr: 'speed / 180 * PI',
    angleExprPreset: 'speed / 180 * PI',
    expression: '',
    ...overrides
  };
}

export function createCompositionParticleInit(overrides = {}) {
  return {
    id: makeId('pinit'),
    target: 'color',
    exprPreset: '',
    expr: 'Vector3f(1F, 1F, 1F)',
    ...overrides
  };
}

export function createCompositionControllerVar(overrides = {}) {
  return {
    id: makeId('cvar'),
    name: 'temp1',
    type: 'Double',
    expr: '0.0',
    ...overrides
  };
}

export function createCompositionControllerAction(overrides = {}) {
  return {
    id: makeId('cact'),
    type: 'tick_js',
    script: '',
    ...overrides
  };
}

export function createCompositionAngleOffset(overrides = {}) {
  return {
    enabled: false,
    count: 1,
    glowTick: 20,
    ease: 'outCubic',
    reverseOnDisable: false,
    angleMode: 'numeric',
    angleValue: 360,
    angleUnit: 'deg',
    angleExpr: 'PI * 2',
    angleExprPreset: 'PI * 2',
    ...overrides
  };
}

export function createCompositionShapeChild(overrides = {}) {
  return {
    id: makeId('shapeNode'),
    name: '子节点 1',
    type: 'single',
    bindMode: 'point',
    point: { x: 0, y: 0, z: 0 },
    builderState: createCompositionPointsBuilderState(),
    axisPreset: 'RelativeLocation.yAxis()',
    axisExpr: 'RelativeLocation.yAxis()',
    axisManualCtor: 'RelativeLocation',
    axisManualX: 0,
    axisManualY: 1,
    axisManualZ: 0,
    displayActions: [],
    angleOffset: createCompositionAngleOffset(),
    growthAnimates: [],
    effectClass: DEFAULT_COMPOSITION_EFFECT_CLASS,
    useTexture: true,
    particleInit: [],
    controllerVars: [],
    controllerActions: [],
    scale: createScaleHelper({ type: 'none' }),
    children: [],
    ...overrides
  };
}

export function createCompositionCard(overrides = {}) {
  return {
    id: makeId('compCard'),
    name: '卡片 1',
    group: '默认分组',
    bindMode: 'builder',
    dataType: 'single',
    targetPreset: 'root',
    point: { x: 0, y: 0, z: 0 },
    builderState: createCompositionPointsBuilderState(),
    particleEffect: DEFAULT_COMPOSITION_EFFECT_CLASS,
    singleEffectClass: DEFAULT_COMPOSITION_EFFECT_CLASS,
    singleUseTexture: true,
    particleInit: [],
    controllerVars: [],
    controllerActions: [],
    growthAnimates: [],
    shapeChildren: [],
    viewPath: [],
    delay: 0,
    duration: 30,
    visible: true,
    shapeAxisPreset: 'RelativeLocation.yAxis()',
    shapeAxisExpr: 'RelativeLocation.yAxis()',
    shapeAxisManualCtor: 'RelativeLocation',
    shapeAxisManualX: 0,
    shapeAxisManualY: 1,
    shapeAxisManualZ: 0,
    shapeDisplayActions: [],
    shapeAngleOffset: createCompositionAngleOffset(),
    scaleHelper: createScaleHelper(),
    script: 'RelativeLocation(0.0, age / Math.max(duration, 1), 0.0)',
    notes: '',
    ...overrides
  };
}

export function createCompositionProject(overrides = {}) {
  return {
    id: '',
    tool: 'composition',
    schemaVersion: 4,
    name: 'NewComposition',
    description: '按旧站模块语义迁移到 Vue 的 Composition Builder 项目',
    compositionType: 'particle',
    previewPlayTicks: 70,
    disabledInterval: 0,
    compositionAxisPreset: 'RelativeLocation.yAxis()',
    compositionAxisExpr: 'RelativeLocation.yAxis()',
    compositionAxisManualCtor: 'RelativeLocation',
    compositionAxisManualX: 0,
    compositionAxisManualY: 1,
    compositionAxisManualZ: 0,
    settings: {
      previewTicks: 70,
      realtimeCode: true,
      theme: 'dark-1',
      autoplay: true,
      pointSize: 0.08,
      previewCacheWorkerCount: 0,
      showGrid: true,
      showAxes: true,
      leftPanelWidth: 560,
      leftPanelTab: 'project',
      snapGridKeyToggleMode: false,
      snapParticleKeyToggleMode: false
    },
    globalVars: [],
    globalConsts: [],
    compositionAnimates: [],
    displayActions: [],
    cards: [createCompositionCard()],
    ...overrides
  };
}
