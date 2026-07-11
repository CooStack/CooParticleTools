import {
  COMPOSITION_CARD_DATA_TYPES,
  COMPOSITION_CONTROLLER_ACTION_TYPES,
  COMPOSITION_CONTROLLER_VAR_TYPES,
  COMPOSITION_GLOBAL_VAR_TYPES,
  COMPOSITION_PARTICLE_INIT_TARGET_OPTIONS,
  createCompositionAngleOffset,
  createCompositionAnimate,
  createCompositionCard,
  createCompositionConst,
  createCompositionControllerAction,
  createCompositionControllerVar,
  createCompositionParticleInit,
  createCompositionProject,
  createCompositionShapeChild,
  createCompositionVar,
  createDisplayAction,
  createScaleHelper
} from './defaults.js';
import {
  defaultLiteralForType,
  formatVectorLiteral,
  isVectorType,
  parseVectorLiteral
} from './expression-runtime.js';
import { normalizePointsBuilderProject } from '../pointsbuilder/defaults.js';

export function normalizeCompositionBuilderState(rawState) {
  const normalized = normalizePointsBuilderProject(rawState, 'composition-pointsbuilder');
  const rawNodes = Array.isArray(rawState?.state?.root?.children)
    ? rawState.state.root.children
    : Array.isArray(rawState?.root?.children)
      ? rawState.root.children
      : Array.isArray(rawState?.nodes)
        ? rawState.nodes
        : null;
  if (Array.isArray(rawNodes) && rawNodes.length === 0) {
    normalized.state.root.children = [];
    normalized.state.selection.focusedNodeId = '';
  }
  return normalized;
}

function coerceNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mergeVector(raw = {}, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: coerceNumber(raw?.x, fallback.x),
    y: coerceNumber(raw?.y, fallback.y),
    z: coerceNumber(raw?.z, fallback.z)
  };
}

function normalizeVariableType(rawType = 'Double', fallback = 'Double') {
  const type = String(rawType || fallback).trim();
  return COMPOSITION_GLOBAL_VAR_TYPES.includes(type) ? type : fallback;
}

function normalizeControllerVarType(rawType = 'Double', fallback = 'Double') {
  const type = String(rawType || fallback).trim();
  return COMPOSITION_CONTROLLER_VAR_TYPES.includes(type) ? type : fallback;
}

function normalizeLiteralValue(type, rawValue) {
  const fallback = defaultLiteralForType(type);
  if (isVectorType(type)) {
    const parsed = parseVectorLiteral(rawValue, { x: 0, y: 0, z: 0 });
    return formatVectorLiteral(type, parsed.x, parsed.y, parsed.z);
  }
  if (type === 'Boolean') {
    return /^true$/i.test(String(rawValue ?? fallback).trim()) ? 'true' : 'false';
  }
  if (type === 'String') {
    return String(rawValue ?? fallback);
  }
  const numeric = Number(rawValue ?? fallback);
  return Number.isFinite(numeric) ? String(numeric) : String(fallback);
}

function normalizeCardDataType(rawType = 'single') {
  const type = String(rawType || 'single').trim();
  return COMPOSITION_CARD_DATA_TYPES.some((item) => item.id === type) ? type : 'single';
}

function normalizeParticleInitTarget(rawTarget = 'color') {
  const target = String(rawTarget || 'color').trim();
  return COMPOSITION_PARTICLE_INIT_TARGET_OPTIONS.includes(target) ? target : 'color';
}

function normalizeParticleInitExpr(target, rawExpr, fallbackExpr) {
  const expr = String(rawExpr ?? '').trim();
  if (target !== 'color') return expr || String(fallbackExpr || '0');
  if (!expr) return 'Vector3f(1F, 1F, 1F)';
  const match = expr.match(/^([A-Za-z0-9_]+)\s*\(([^)]+)\)$/);
  if (!match || !['Vector3f', 'RelativeLocation', 'Vec3'].includes(match[1])) return expr;
  const parsed = parseVectorLiteral(expr, { x: 1, y: 1, z: 1 });
  return formatVectorLiteral('Vector3f', parsed.x, parsed.y, parsed.z);
}

function normalizeControllerActionType(rawType = 'tick_js') {
  const type = String(rawType || 'tick_js').trim();
  return COMPOSITION_CONTROLLER_ACTION_TYPES.some((item) => item.id === type) ? type : 'tick_js';
}

function normalizeAngleUnit(rawUnit = 'deg') {
  return String(rawUnit || 'deg').trim() === 'rad' ? 'rad' : 'deg';
}

export function normalizeCompositionAngleOffset(rawItem = {}) {
  const base = createCompositionAngleOffset();
  return {
    ...base,
    ...rawItem,
    enabled: rawItem?.enabled === true,
    count: Math.max(1, Math.round(coerceNumber(rawItem?.count, base.count))),
    glowTick: Math.max(1, Math.round(coerceNumber(rawItem?.glowTick, base.glowTick))),
    ease: String(rawItem?.ease || base.ease || 'outCubic'),
    reverseOnDisable: rawItem?.reverseOnDisable === true,
    angleMode: rawItem?.angleMode === 'expr' ? 'expr' : 'numeric',
    angleValue: coerceNumber(rawItem?.angleValue, base.angleValue),
    angleUnit: normalizeAngleUnit(rawItem?.angleUnit || base.angleUnit),
    angleExpr: String(rawItem?.angleExpr || base.angleExpr),
    angleExprPreset: String(rawItem?.angleExprPreset || rawItem?.angleExpr || base.angleExprPreset)
  };
}

export function normalizeCompositionVar(rawVar = {}, index = 0) {
  const base = createCompositionVar({ name: `value${index + 1}` });
  const type = normalizeVariableType(rawVar?.type, base.type);
  return {
    ...base,
    ...rawVar,
    name: String(rawVar?.name || base.name),
    type,
    value: normalizeLiteralValue(type, rawVar?.value),
    codec: rawVar?.codec !== false,
    mutable: rawVar?.mutable !== false
  };
}

export function normalizeCompositionConst(rawConst = {}, index = 0) {
  const base = createCompositionConst({ name: `const${index + 1}` });
  const type = normalizeVariableType(rawConst?.type, base.type);
  return {
    ...base,
    ...rawConst,
    name: String(rawConst?.name || base.name),
    type,
    value: normalizeLiteralValue(type, rawConst?.value)
  };
}

export function normalizeCompositionAnimate(rawAnimate = {}, index = 0) {
  const base = createCompositionAnimate();
  const legacyCount = rawAnimate?.duration ?? rawAnimate?.count;
  const legacyCondition = rawAnimate?.expression ?? rawAnimate?.condition;
  return {
    ...base,
    ...rawAnimate,
    id: rawAnimate?.id || base.id || `animate_${index}`,
    count: Math.max(1, Math.round(coerceNumber(legacyCount, base.count))),
    condition: String(legacyCondition || '')
  };
}

export function normalizeDisplayAction(rawAction = {}, index = 0) {
  const base = createDisplayAction();
  const next = {
    ...base,
    ...rawAction,
    id: rawAction?.id || base.id || `display_${index}`
  };
  next.type = ['rotateToPoint', 'rotateAsAxis', 'rotateToWithAngle'].includes(String(next.type || ''))
    ? String(next.type)
    : base.type;
  next.toUsePreset = next.toUsePreset === true;
  next.toPreset = String(next.toPreset || base.toPreset);
  next.toExpr = String(next.toExpr || next.toPreset || base.toExpr);
  next.toManualCtor = String(next.toManualCtor || base.toManualCtor);
  next.toManualX = coerceNumber(next.toManualX, base.toManualX);
  next.toManualY = coerceNumber(next.toManualY, base.toManualY);
  next.toManualZ = coerceNumber(next.toManualZ, base.toManualZ);
  next.angleMode = next.angleMode === 'expr' ? 'expr' : 'numeric';
  next.angleValue = coerceNumber(next.angleValue, base.angleValue);
  next.angleUnit = next.angleUnit === 'deg' ? 'deg' : 'rad';
  next.angleExpr = String(next.angleExpr || base.angleExpr);
  next.angleExprPreset = String(next.angleExprPreset || next.angleExpr || base.angleExprPreset);
  next.expression = String(next.expression || '');
  return next;
}

export function normalizeCompositionParticleInit(rawItem = {}, index = 0) {
  const base = createCompositionParticleInit();
  const target = normalizeParticleInitTarget(rawItem?.target || base.target);
  return {
    ...base,
    ...rawItem,
    id: rawItem?.id || base.id || `pinit_${index}`,
    target,
    exprPreset: String(rawItem?.exprPreset || ''),
    expr: normalizeParticleInitExpr(target, rawItem?.expr, base.expr)
  };
}

export function normalizeCompositionControllerVar(rawItem = {}, index = 0) {
  const base = createCompositionControllerVar({ name: `temp${index + 1}` });
  const type = normalizeControllerVarType(rawItem?.type, base.type);
  return {
    ...base,
    ...rawItem,
    id: rawItem?.id || base.id || `cvar_${index}`,
    name: String(rawItem?.name || base.name),
    type,
    expr: normalizeLiteralValue(type, rawItem?.expr)
  };
}

export function normalizeCompositionControllerAction(rawItem = {}, index = 0) {
  const base = createCompositionControllerAction();
  return {
    ...base,
    ...rawItem,
    id: rawItem?.id || base.id || `cact_${index}`,
    type: normalizeControllerActionType(rawItem?.type || base.type),
    script: String(rawItem?.script || '')
  };
}

export function normalizeCompositionShapeChild(rawItem = {}, index = 0) {
  const base = createCompositionShapeChild({ name: `子节点 ${index + 1}` });
  const merged = {
    ...base,
    ...rawItem,
    point: mergeVector(rawItem?.point, base.point),
    scale: createScaleHelper({ ...base.scale, ...(rawItem?.scale || {}) })
  };
  merged.id = rawItem?.id || base.id || `shapeNode_${index}`;
  merged.name = String(rawItem?.name || base.name);
  merged.type = normalizeCardDataType(rawItem?.type || base.type);
  merged.bindMode = merged.bindMode === 'builder' ? 'builder' : 'point';
  merged.builderState = normalizeCompositionBuilderState(merged.builderState);
  merged.axisPreset = String(rawItem?.axisPreset || base.axisPreset || 'RelativeLocation.yAxis()');
  merged.axisExpr = String(rawItem?.axisExpr || merged.axisPreset || 'RelativeLocation.yAxis()');
  merged.axisManualCtor = String(rawItem?.axisManualCtor || base.axisManualCtor || 'RelativeLocation');
  merged.axisManualX = coerceNumber(rawItem?.axisManualX, base.axisManualX || 0);
  merged.axisManualY = coerceNumber(rawItem?.axisManualY, base.axisManualY || 1);
  merged.axisManualZ = coerceNumber(rawItem?.axisManualZ, base.axisManualZ || 0);
  merged.displayActions = Array.isArray(rawItem?.displayActions)
    ? rawItem.displayActions.map((item, actionIndex) => normalizeDisplayAction(item, actionIndex))
    : [];
  merged.angleOffset = normalizeCompositionAngleOffset(rawItem?.angleOffset);
  merged.growthAnimates = Array.isArray(rawItem?.growthAnimates)
    ? rawItem.growthAnimates.map((item, animateIndex) => normalizeCompositionAnimate(item, animateIndex))
    : [];
  merged.effectClass = String(rawItem?.effectClass || base.effectClass);
  merged.useTexture = rawItem?.useTexture !== false;
  merged.particleInit = Array.isArray(rawItem?.particleInit)
    ? rawItem.particleInit.map((item, itemIndex) => normalizeCompositionParticleInit(item, itemIndex))
    : [];
  merged.controllerVars = Array.isArray(rawItem?.controllerVars)
    ? rawItem.controllerVars.map((item, itemIndex) => normalizeCompositionControllerVar(item, itemIndex))
    : [];
  merged.controllerActions = Array.isArray(rawItem?.controllerActions)
    ? rawItem.controllerActions.map((item, itemIndex) => normalizeCompositionControllerAction(item, itemIndex))
    : [];
  merged.children = merged.type === 'single'
    ? []
    : Array.isArray(rawItem?.children)
      ? rawItem.children.map((child, childIndex) => normalizeCompositionShapeChild(child, childIndex))
      : [];
  return merged;
}

export function normalizeCompositionCard(rawCard = {}, index = 0) {
  const base = createCompositionCard({ name: `卡片 ${index + 1}` });
  const merged = {
    ...base,
    ...rawCard,
    point: mergeVector(rawCard?.point, base.point),
    scaleHelper: createScaleHelper({ ...base.scaleHelper, ...(rawCard?.scaleHelper || {}) })
  };
  merged.visible = merged.visible !== false;
  merged.bindMode = merged.bindMode === 'point' ? 'point' : 'builder';
  merged.dataType = normalizeCardDataType(rawCard?.dataType || base.dataType);
  merged.delay = coerceNumber(merged.delay, 0);
  merged.duration = Math.max(1, Math.round(coerceNumber(merged.duration, 30)));
  merged.targetPreset = String(merged.targetPreset || 'root');
  merged.builderState = normalizeCompositionBuilderState(merged.builderState);
  merged.particleEffect = String(merged.particleEffect || merged.singleEffectClass || base.particleEffect);
  merged.singleEffectClass = String(rawCard?.singleEffectClass || merged.particleEffect || base.singleEffectClass);
  merged.singleUseTexture = rawCard?.singleUseTexture !== false;
  merged.particleInit = Array.isArray(rawCard?.particleInit)
    ? rawCard.particleInit.map((item, itemIndex) => normalizeCompositionParticleInit(item, itemIndex))
    : [];
  merged.controllerVars = Array.isArray(rawCard?.controllerVars)
    ? rawCard.controllerVars.map((item, itemIndex) => normalizeCompositionControllerVar(item, itemIndex))
    : [];
  merged.controllerActions = Array.isArray(rawCard?.controllerActions)
    ? rawCard.controllerActions.map((item, itemIndex) => normalizeCompositionControllerAction(item, itemIndex))
    : [];
  merged.growthAnimates = Array.isArray(rawCard?.growthAnimates)
    ? rawCard.growthAnimates.map((item, itemIndex) => normalizeCompositionAnimate(item, itemIndex))
    : [];
  merged.shapeChildren = Array.isArray(rawCard?.shapeChildren)
    ? rawCard.shapeChildren.map((item, itemIndex) => normalizeCompositionShapeChild(item, itemIndex))
    : [];
  merged.viewPath = Array.isArray(rawCard?.viewPath)
    ? rawCard.viewPath.map((item) => Math.max(0, Math.round(coerceNumber(item, 0))))
    : [];
  merged.shapeAxisPreset = String(rawCard?.shapeAxisPreset || base.shapeAxisPreset || 'RelativeLocation.yAxis()');
  merged.shapeAxisExpr = String(rawCard?.shapeAxisExpr || merged.shapeAxisPreset || 'RelativeLocation.yAxis()');
  merged.shapeAxisManualCtor = String(rawCard?.shapeAxisManualCtor || base.shapeAxisManualCtor || 'RelativeLocation');
  merged.shapeAxisManualX = coerceNumber(rawCard?.shapeAxisManualX, base.shapeAxisManualX || 0);
  merged.shapeAxisManualY = coerceNumber(rawCard?.shapeAxisManualY, base.shapeAxisManualY || 1);
  merged.shapeAxisManualZ = coerceNumber(rawCard?.shapeAxisManualZ, base.shapeAxisManualZ || 0);
  merged.shapeDisplayActions = Array.isArray(rawCard?.shapeDisplayActions)
    ? rawCard.shapeDisplayActions.map((item, actionIndex) => normalizeDisplayAction(item, actionIndex))
    : [];
  merged.shapeAngleOffset = normalizeCompositionAngleOffset(rawCard?.shapeAngleOffset);
  merged.script = String(merged.script || base.script);
  merged.notes = String(merged.notes || '');
  return merged;
}

export function normalizeCompositionProject(rawProject = {}) {
  const base = createCompositionProject();
  const merged = {
    ...base,
    ...rawProject,
    settings: {
      ...base.settings,
      ...(rawProject?.settings || {})
    }
  };

  merged.globalVars = Array.isArray(rawProject?.globalVars)
    ? rawProject.globalVars.map((item, index) => normalizeCompositionVar(item, index))
    : base.globalVars;
  merged.globalConsts = Array.isArray(rawProject?.globalConsts)
    ? rawProject.globalConsts.map((item, index) => normalizeCompositionConst(item, index))
    : base.globalConsts;
  merged.compositionAnimates = Array.isArray(rawProject?.compositionAnimates)
    ? rawProject.compositionAnimates.map((item, index) => normalizeCompositionAnimate(item, index))
    : base.compositionAnimates;
  merged.displayActions = Array.isArray(rawProject?.displayActions)
    ? rawProject.displayActions.map((item, index) => normalizeDisplayAction(item, index))
    : base.displayActions;
  merged.cards = Array.isArray(rawProject?.cards) && rawProject.cards.length
    ? rawProject.cards.map((item, index) => normalizeCompositionCard(item, index))
    : base.cards;

  merged.schemaVersion = 5;
  merged.compositionType = merged.compositionType === 'sequenced' ? 'sequenced' : 'particle';
  merged.previewPlayTicks = Math.max(1, Math.round(coerceNumber(rawProject?.previewPlayTicks ?? merged.settings.previewTicks, 70)));
  merged.disabledInterval = Math.max(0, Math.round(coerceNumber(rawProject?.disabledInterval, 0)));
  merged.compositionAxisPreset = String(rawProject?.compositionAxisPreset || 'RelativeLocation.yAxis()');
  merged.compositionAxisExpr = String(rawProject?.compositionAxisExpr || merged.compositionAxisPreset || 'RelativeLocation.yAxis()');
  merged.compositionAxisManualCtor = String(rawProject?.compositionAxisManualCtor || 'RelativeLocation');
  merged.compositionAxisManualX = coerceNumber(rawProject?.compositionAxisManualX, 0);
  merged.compositionAxisManualY = coerceNumber(rawProject?.compositionAxisManualY, 1);
  merged.compositionAxisManualZ = coerceNumber(rawProject?.compositionAxisManualZ, 0);
  merged.settings.previewTicks = merged.previewPlayTicks;
  merged.settings.pointSize = Math.max(0.01, coerceNumber(merged.settings.pointSize, 0.08));
  merged.settings.previewCacheWorkerCount = Math.max(0, Math.min(16, Math.round(coerceNumber(merged.settings.previewCacheWorkerCount, 0))));
  merged.settings.showAxes = merged.settings.showAxes !== false;
  merged.settings.showGrid = merged.settings.showGrid !== false;
  merged.settings.leftPanelWidth = Math.max(400, Math.min(1200, Math.round(coerceNumber(merged.settings.leftPanelWidth, 560))));
  merged.settings.leftPanelTab = merged.settings.leftPanelTab === 'cards' ? 'cards' : 'project';
  merged.settings.realtimeCode = merged.settings.realtimeCode !== false;
  merged.settings.autoplay = merged.settings.autoplay !== false;
  merged.settings.snapGridKeyToggleMode = merged.settings.snapGridKeyToggleMode === true;
  merged.settings.snapParticleKeyToggleMode = merged.settings.snapParticleKeyToggleMode === true;
  return merged;
}
