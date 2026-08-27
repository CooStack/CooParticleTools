let forceIdSeed = 1;
const texturePreviewCache = new WeakMap();

function makeForceId(prefix) {
  forceIdSeed += 1;
  return `${prefix}_${Date.now().toString(16)}_${forceIdSeed.toString(16)}`;
}

export function setCParticleTexturePreview(resource, preview) {
  if (!resource || typeof resource !== 'object') return;
  const width = Math.max(0, Math.trunc(Number(preview?.width) || 0));
  const height = Math.max(0, Math.trunc(Number(preview?.height) || 0));
  const pixels = preview?.pixels;
  if (!width || !height || !pixels || pixels.length < width * height * 4) {
    texturePreviewCache.delete(resource);
    return;
  }
  texturePreviewCache.set(resource, {
    dataUrl: String(resource.dataUrl || ''),
    width,
    height,
    pixels
  });
}

export function getCParticleTexturePreview(resource) {
  if (!resource || typeof resource !== 'object') return null;
  const preview = texturePreviewCache.get(resource);
  return preview?.dataUrl === String(resource.dataUrl || '') ? preview : null;
}

export function clearCParticleTexturePreview(resource) {
  if (resource && typeof resource === 'object') texturePreviewCache.delete(resource);
}

function numberParam(key, label, defaultValue, options = {}) {
  return {
    key,
    label,
    type: options.optional ? 'optional-number' : 'number',
    defaultValue,
    min: options.min,
    max: options.max,
    integer: options.integer === true,
    step: options.step || (options.integer ? '1' : '0.01')
  };
}

function booleanParam(key, label, defaultValue = false) {
  return { key, label, type: 'boolean', defaultValue };
}

function selectParam(key, label, defaultValue, options) {
  return { key, label, type: 'select', defaultValue, options };
}

function resourceParam(key, label, resourceKind) {
  return { key, label, type: 'resource', defaultValue: '', resourceKind };
}

function kotlinParam(key, label, placeholder = '') {
  return { key, label, type: 'kotlin', defaultValue: '', placeholder };
}

function vec3Params(prefix, label, fallback = { x: 0, y: 0, z: 0 }) {
  return [
    numberParam(`${prefix}X`, `${label} X`, fallback.x),
    numberParam(`${prefix}Y`, `${label} Y`, fallback.y),
    numberParam(`${prefix}Z`, `${label} Z`, fallback.z)
  ];
}

function dynamicVec3Params(prefix, label, fallback = { x: 0, y: 0, z: 0 }) {
  return [
    kotlinParam(`${prefix}Expression`, `${label} Kotlin 表达式`, '例如：pos；留空时使用下方坐标'),
    ...vec3Params(prefix, label, fallback)
  ];
}

const FALLOFF_SHAPE_OPTIONS = [
  { value: 'SPHERE', label: 'SPHERE' },
  { value: 'TUBE', label: 'TUBE' },
  { value: 'CONE', label: 'CONE' }
];

const Z_DIRECTION_OPTIONS = [
  { value: 'BOTH', label: 'BOTH' },
  { value: 'POSITIVE', label: 'POSITIVE' },
  { value: 'NEGATIVE', label: 'NEGATIVE' }
];

function falloffParams(options = {}) {
  const fields = [
    numberParam('minDistance', 'Falloff 最小距离', 0, { min: 0 }),
    numberParam('maxDistance', 'Falloff 最大距离', null, { min: 0, optional: true }),
    numberParam('power', 'Falloff 幂次', 2, { min: 0 }),
    selectParam('shape', 'Falloff 形状', 'SPHERE', FALLOFF_SHAPE_OPTIONS),
    selectParam('zDirection', 'Falloff 轴向范围', 'BOTH', Z_DIRECTION_OPTIONS)
  ];
  if (options.includeAxis !== false) {
    fields.push(...vec3Params('falloffAxis', 'Falloff 轴', { x: 0, y: 0, z: 1 }));
  }
  return fields;
}

export const CPARTICLE_FORCE_MAX_COMMANDS = 128;
export const CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND = 8;

export const CPARTICLE_SELECTOR_OPTIONS = [
  { id: 'All', label: 'All（全部粒子）' },
  { id: 'SourceEquals', label: 'SourceEquals（运行时来源）' },
  { id: 'SourceMask', label: 'SourceMask（运行时来源掩码）' },
  { id: 'SignEquals', label: 'SignEquals（逻辑标签）' },
  { id: 'SignMask', label: 'SignMask（逻辑标签掩码）' },
  { id: 'CommandMask', label: 'CommandMask（命令类别掩码）' }
];

export const CPARTICLE_FORCE_TYPE_OPTIONS = [
  {
    id: 'Gravity',
    label: 'Gravity（重力）',
    params: vec3Params('accel', '加速度', { x: 0, y: -0.04, z: 0 })
  },
  {
    id: 'EnvDrag',
    label: 'EnvDrag（环境阻力）',
    params: [numberParam('airDensity', '空气密度', 1.225, { min: 0 })]
  },
  {
    id: 'ExpDrag',
    label: 'ExpDrag（指数阻力）',
    params: [
      numberParam('damping', '指数阻尼', 0.15, { min: 0 }),
      numberParam('minSpeed', '最小速度', 0, { min: 0 }),
      numberParam('linear', '线性阻力', 0, { min: 0, max: 1 })
    ]
  },
  {
    id: 'Wind',
    label: 'Wind（风力）',
    params: [
      ...dynamicVec3Params('wind', '风速'),
      numberParam('airDensity', '空气密度', 1.225, { min: 0 }),
      selectParam('rangeMode', '范围模式', 0, [
        { value: 0, label: '0 - 全局' },
        { value: 1, label: '1 - 球形' },
        { value: 2, label: '2 - 盒形' }
      ]),
      ...dynamicVec3Params('rangeCenter', '范围中心'),
      ...vec3Params('rangeSize', '范围尺寸')
    ]
  },
  {
    id: 'Vortex',
    label: 'Vortex（漩涡）',
    params: [
      ...dynamicVec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('swirlStrength', '旋转强度', 0.8),
      numberParam('radialPull', '径向吸入', 0.35),
      numberParam('axialLift', '轴向升力', 0),
      numberParam('range', '范围', 10, { min: 0 }),
      numberParam('falloffPower', '衰减幂次', 2, { min: 0 }),
      numberParam('minDistance', '最小距离', 0.2, { min: 0 })
    ]
  },
  {
    id: 'Attraction',
    label: 'Attraction（吸引力）',
    params: [
      ...dynamicVec3Params('target', '目标点'),
      numberParam('strength', '强度', 0.8),
      numberParam('range', '范围', 8, { min: 0 }),
      numberParam('falloffPower', '衰减幂次', 2, { min: 0 }),
      numberParam('minDistance', '最小距离', 0.25, { min: 0 })
    ]
  },
  {
    id: 'RotationForce',
    label: 'RotationForce（旋转力）',
    params: [
      ...dynamicVec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('strength', '强度', 0.35),
      numberParam('range', '范围', 8, { min: 0 }),
      numberParam('falloffPower', '衰减幂次', 2, { min: 0 })
    ]
  },
  {
    id: 'Noise',
    label: 'Noise（噪声力）',
    params: [
      numberParam('strength', '强度', 0.1),
      numberParam('frequency', '空间频率', 0.35, { min: 0 }),
      numberParam('speed', '滚动速度', 0.02),
      numberParam('clampSpeed', '速度上限', 2, { min: 0 }),
      numberParam('affectY', 'Y 轴影响', 1),
      booleanParam('useLifeCurve', '按生命周期衰减', false),
      numberParam('seedOffset', '种子偏移', 0, { integer: true })
    ]
  },
  {
    id: 'FlowField',
    label: 'FlowField（流场）',
    params: [
      numberParam('amplitude', '振幅', 0.15),
      numberParam('frequency', '空间频率', 0.25, { min: 0 }),
      numberParam('timeScale', '时间缩放', 0.06),
      numberParam('phaseOffset', '相位偏移', 0),
      ...vec3Params('worldOffset', '世界偏移')
    ]
  },
  {
    id: 'Radial',
    label: 'Radial（径向力）',
    params: [
      ...vec3Params('center', '中心'),
      numberParam('strength', '强度', 1),
      ...falloffParams(),
      booleanParam('inverseSquare', '平方反比', false)
    ]
  },
  {
    id: 'DirectionalWind',
    label: 'DirectionalWind（定向风力）',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('strength', '强度', 1),
      ...falloffParams({ includeAxis: false })
    ]
  },
  {
    id: 'BlenderVortex',
    label: 'BlenderVortex（Blender 漩涡）',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('tangentialStrength', '切向强度', 1),
      numberParam('radialStrength', '径向强度', 0),
      numberParam('velocityCompensation', '速度补偿', 0),
      ...falloffParams({ includeAxis: false })
    ]
  },
  {
    id: 'Magnetic',
    label: 'Magnetic（磁场力）',
    params: [
      ...vec3Params('center', '中心'),
      ...vec3Params('axis', '轴', { x: 0, y: 1, z: 0 }),
      numberParam('strength', '强度', 1),
      selectParam('fieldMode', '场模式', 'LINE', [
        { value: 'POINT', label: 'POINT（点场）' },
        { value: 'LINE', label: 'LINE（线场）' },
        { value: 'PLANE', label: 'PLANE（平面场）' }
      ]),
      ...falloffParams({ includeAxis: false })
    ]
  },
  {
    id: 'Harmonic',
    label: 'Harmonic（弹簧力）',
    params: [
      ...vec3Params('center', '中心'),
      numberParam('stiffness', '刚度', 1),
      numberParam('damping', '阻尼', 0),
      numberParam('restLength', '静止长度', 0, { min: 0 }),
      ...falloffParams()
    ]
  },
  {
    id: 'VelocityDrag',
    label: 'VelocityDrag（速度阻力）',
    params: [
      numberParam('strength', '强度', 0),
      numberParam('damping', '阻尼', 0),
      booleanParam('exact', 'EXACT 模式', true),
      ...falloffParams()
    ]
  },
  {
    id: 'Charge',
    label: 'Charge（电荷力）',
    params: [
      ...vec3Params('center', '中心'),
      numberParam('strength', '强度', 1),
      numberParam('defaultCharge', '默认电荷', 0),
      ...falloffParams()
    ]
  },
  {
    id: 'LennardJones',
    label: 'LennardJones（伦纳德-琼斯力）',
    params: [
      ...vec3Params('center', '中心'),
      numberParam('strength', '强度', 1),
      numberParam('sourceRadius', '来源半径', 0, { min: 0 }),
      ...falloffParams()
    ]
  },
  {
    id: 'Turbulence',
    label: 'Turbulence（湍流）',
    params: [
      numberParam('strength', '强度', 0.1),
      numberParam('size', '尺寸', 1, { min: 0 }),
      numberParam('seed', '种子', 0, { integer: true }),
      numberParam('timeScale', '时间缩放', 0),
      ...falloffParams()
    ]
  },
  {
    id: 'Texture',
    label: 'Texture（纹理力）',
    resourceKind: 'texture',
    params: [
      resourceParam('resourceRef', 'Texture 资源', 'texture'),
      numberParam('strength', '强度', 1),
      selectParam('mode', '采样模式', 'VECTOR', [
        { value: 'VECTOR', label: 'VECTOR' },
        { value: 'GRADIENT', label: 'GRADIENT' }
      ]),
      numberParam('nabla', '梯度步长', 0.01, { min: 0 }),
      ...falloffParams()
    ]
  },
  {
    id: 'FluidFlow',
    label: 'FluidFlow（流体流动力）',
    resourceKind: 'fluid',
    params: [
      resourceParam('resourceRef', 'FluidFlow 资源', 'fluid'),
      numberParam('strength', '强度', 1),
      booleanParam('useDensity', '使用密度通道', false),
      numberParam('flowDrag', '流动阻力', 0, { min: 0 }),
      ...falloffParams()
    ]
  }
];

const LEGACY_FORCE_TYPES = {
  drag: 'ExpDrag',
  gravity: 'Gravity',
  attraction: 'Attraction',
  noise: 'Noise',
  flow_field: 'FlowField',
  vortex: 'Vortex',
  rotation_force: 'RotationForce',
  velocity_add: 'Gravity'
};

export function getCParticleForceTypeOption(type) {
  return CPARTICLE_FORCE_TYPE_OPTIONS.find((item) => item.id === type) || null;
}

export function createDefaultCParticleForceParameters(type) {
  const option = getCParticleForceTypeOption(type) || CPARTICLE_FORCE_TYPE_OPTIONS[0];
  return Object.fromEntries(option.params.map((field) => [field.key, field.defaultValue]));
}

export function createCParticleForceResource(overrides = {}) {
  return {
    id: makeForceId('resource'),
    name: 'resource',
    kind: 'texture',
    location: '',
    fileName: '',
    mimeType: '',
    dataUrl: '',
    imageWidth: 0,
    imageHeight: 0,
    ...overrides
  };
}

function normalizeParameter(field, value) {
  if (value === undefined) return field.defaultValue;
  if (field.type === 'boolean') {
    return value === true || value === 'true' || value === 1 || value === '1';
  }
  if (field.type === 'select') return value;
  if (field.type === 'resource' || field.type === 'kotlin') return String(value || '');
  if (field.type === 'optional-number' && (value === null || value === '')) return null;
  if (value === null || value === '') return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function legacyForceType(rawType) {
  const source = String(rawType || '').trim();
  const simple = source.split('.').pop()?.replace(/[()]/g, '') || '';
  return LEGACY_FORCE_TYPES[simple] || LEGACY_FORCE_TYPES[source] || simple;
}

function migrateLegacyParameters(rawType, raw = {}) {
  const source = { ...(raw || {}) };
  if (rawType === 'gravity') {
    const gravity = source.gravity ?? 0.04;
    return { accelX: 0, accelY: -Number(gravity || 0), accelZ: 0 };
  }
  if (rawType === 'velocity_add') {
    return {
      accelX: source.deltaX ?? source.x ?? 0,
      accelY: source.deltaY ?? source.y ?? 0,
      accelZ: source.deltaZ ?? source.z ?? 0
    };
  }
  if (legacyForceType(rawType) === 'Magnetic' && source.fieldMode !== undefined) {
    const legacyFieldModes = { 0: 'LINE', 1: 'PLANE', 2: 'POINT' };
    const legacyValue = String(source.fieldMode).trim();
    if (Object.prototype.hasOwnProperty.call(legacyFieldModes, legacyValue)) {
      source.fieldMode = legacyFieldModes[legacyValue];
    }
  }
  return source;
}

function normalizeSelector(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const type = String(source.type || '').trim() || 'All';
  return {
    type,
    sourceId: source.sourceId ?? 0,
    sourceMask: source.sourceMask ?? -1,
    signRef: String(source.signRef || ''),
    signMask: source.signMask ?? -1,
    commandMaskRefs: Array.isArray(source.commandMaskRefs) ? source.commandMaskRefs.map(String) : []
  };
}

export function normalizeCParticleForceCommand(raw = {}, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawForce = source.force && typeof source.force === 'object' ? source.force : source;
  const originalType = String(rawForce.type || source.type || 'Gravity');
  const type = legacyForceType(originalType);
  const option = getCParticleForceTypeOption(type);
  const rawParameters = rawForce.parameters || rawForce.params || source.parameters || source.params || {};
  const migrated = migrateLegacyParameters(originalType, rawParameters);
  const parameters = option
    ? Object.fromEntries(option.params.map((field) => [field.key, normalizeParameter(field, migrated[field.key])]))
    : { ...migrated };
  return {
    id: String(source.id || makeForceId('force')),
    enabled: source.enabled !== false,
    label: String(source.label || option?.label || `Force Command ${index + 1}`),
    force: { type, parameters },
    selector: normalizeSelector(source.selector)
  };
}

export function createCParticleForceCommand(overrides = {}) {
  return normalizeCParticleForceCommand({
    id: makeForceId('force'),
    enabled: true,
    label: 'Gravity',
    force: { type: 'Gravity', parameters: createDefaultCParticleForceParameters('Gravity') },
    selector: { type: 'All' },
    ...overrides
  });
}

function normalizeNamedInt(raw, index, prefix, fallbackValue) {
  if (raw && typeof raw === 'object') {
    return {
      id: String(raw.id || makeForceId(prefix)),
      name: String(raw.name ?? ''),
      value: raw.value === undefined ? fallbackValue : raw.value
    };
  }
  return {
    id: makeForceId(prefix),
    name: `${prefix}_${index + 1}`,
    value: raw === undefined ? fallbackValue : raw
  };
}

export function normalizeCParticleSigns(raw = []) {
  return (Array.isArray(raw) ? raw : []).map((item, index) => normalizeNamedInt(item, index, 'sign', index + 1));
}

export function normalizeCParticleCommandMasks(raw = []) {
  return (Array.isArray(raw) ? raw : []).map((item, index) => normalizeNamedInt(
    item,
    index,
    'mask',
    Math.min(index, 31) === 31 ? -2147483648 : 1 << index
  ));
}

export function nextAvailableCParticleSignValue(raw = []) {
  const used = new Set((Array.isArray(raw) ? raw : [])
    .map((item) => Number(item?.value))
    .filter((value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647));
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

export function nextAvailableCParticleCommandMaskValue(raw = []) {
  const used = new Set((Array.isArray(raw) ? raw : [])
    .map((item) => Number(item?.value))
    .filter(Number.isInteger));
  for (let bit = 0; bit < 32; bit += 1) {
    const value = bit === 31 ? -2147483648 : 1 << bit;
    if (!used.has(value)) return value;
  }
  return null;
}

export function nextAvailableCParticleDefinitionName(raw = [], namePrefix, constantPrefix) {
  const used = new Set((Array.isArray(raw) ? raw : [])
    .map((item) => kotlinConstantName(constantPrefix, item?.name))
    .filter(Boolean));
  let index = 1;
  while (used.has(kotlinConstantName(constantPrefix, `${namePrefix}_${index}`))) index += 1;
  return `${namePrefix}_${index}`;
}

export function normalizeCParticleForceResources(raw = []) {
  return (Array.isArray(raw) ? raw : []).map((item, index) => ({
    id: String(item?.id || makeForceId('resource')),
    name: String(item?.name ?? `resource_${index + 1}`),
    kind: item?.kind === 'fluid' ? 'fluid' : 'texture',
    location: String(item?.location || item?.resourceLocation || ''),
    fileName: String(item?.fileName || ''),
    mimeType: String(item?.mimeType || ''),
    dataUrl: String(item?.dataUrl || ''),
    imageWidth: Math.max(0, Math.trunc(Number(item?.imageWidth) || 0)),
    imageHeight: Math.max(0, Math.trunc(Number(item?.imageHeight) || 0))
  }));
}

export function kotlinConstantName(prefix, name) {
  const suffix = String(name || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();
  return suffix ? `${prefix}_${suffix}` : '';
}

export function parseMinecraftResourceLocation(raw) {
  const text = String(raw || '').trim();
  const separator = text.indexOf(':');
  if (separator <= 0 || separator !== text.lastIndexOf(':')) return null;
  const namespace = text.slice(0, separator);
  const path = text.slice(separator + 1);
  if (!/^[a-z0-9_.-]+$/.test(namespace)) return null;
  if (!/^[a-z0-9/._-]+$/.test(path)) return null;
  return { namespace, path };
}

function isInt32(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= -2147483648 && numeric <= 2147483647;
}

function validateNamedValues(items, prefix, label, errors) {
  const seen = new Map();
  items.forEach((item, index) => {
    const constant = kotlinConstantName(prefix, item.name);
    if (!String(item.name || '').trim()) {
      errors.push(`${label} #${index + 1} 的名称不能为空。`);
    } else if (!constant) {
      errors.push(`${label}“${item.name}”无法转换为合法 Kotlin 常量名。`);
    } else if (seen.has(constant)) {
      errors.push(`${label}“${item.name}”与“${seen.get(constant)}”会生成重复常量 ${constant}。`);
    } else {
      seen.set(constant, item.name);
    }
    if (!isInt32(item.value)) errors.push(`${label}“${item.name || index + 1}”的值必须是 32-bit Int。`);
  });
}

function validateForceParameters(command, project, errors) {
  const option = getCParticleForceTypeOption(command.force?.type);
  if (!option) {
    errors.push(`Force Command“${command.label}”使用了未知 Force 类型“${command.force?.type || ''}”。`);
    return;
  }
  const params = command.force.parameters || {};
  option.params.forEach((field) => {
    const value = params[field.key];
    if (field.type === 'number' || field.type === 'optional-number') {
      if (field.type === 'optional-number' && (value === null || value === '')) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        errors.push(`Force Command“${command.label}”的“${field.label}”必须是有限数字。`);
        return;
      }
      if (field.integer && !Number.isInteger(numeric)) {
        errors.push(`Force Command“${command.label}”的“${field.label}”必须是整数。`);
      }
      if (Number.isFinite(Number(field.min)) && numeric < Number(field.min)) {
        errors.push(`Force Command“${command.label}”的“${field.label}”不能小于 ${field.min}。`);
      }
      if (Number.isFinite(Number(field.max)) && numeric > Number(field.max)) {
        errors.push(`Force Command“${command.label}”的“${field.label}”不能大于 ${field.max}。`);
      }
    } else if (field.type === 'select') {
      if (!field.options.some((item) => String(item.value) === String(value))) {
        errors.push(`Force Command“${command.label}”的“${field.label}”枚举值无效。`);
      }
    } else if (field.type === 'resource') {
      const resource = project.forceResources.find((item) => item.id === value);
      if (!resource) {
        errors.push(`Force Command“${command.label}”没有选择有效的${field.resourceKind === 'fluid' ? ' FluidFlow' : ' Texture'}资源。`);
      } else if (resource.kind !== field.resourceKind) {
        errors.push(`Force Command“${command.label}”选择了错误类型的资源“${resource.name}”。`);
      }
    }
  });
  const minDistance = Number(params.minDistance);
  const maxDistance = params.maxDistance === null || params.maxDistance === ''
    ? Number.POSITIVE_INFINITY
    : Number(params.maxDistance);
  if (Number.isFinite(minDistance) && Number.isFinite(maxDistance) && maxDistance < minDistance) {
    errors.push(`Force Command“${command.label}”的 Falloff 最大距离不能小于最小距离。`);
  }
}

function validateSelector(command, project, errors) {
  const selector = command.selector || { type: 'All' };
  if (!CPARTICLE_SELECTOR_OPTIONS.some((item) => item.id === selector.type)) {
    errors.push(`Force Command“${command.label}”的 Selector 类型无效。`);
    return;
  }
  if ((selector.type === 'SourceEquals' || selector.type === 'SourceMask') && !isInt32(selector.sourceId)) {
    errors.push(`Force Command“${command.label}”的 sourceId 必须是 32-bit Int。`);
  }
  if (selector.type === 'SourceMask' && !isInt32(selector.sourceMask)) {
    errors.push(`Force Command“${command.label}”的 sourceMask 必须是 32-bit Int。`);
  }
  if (selector.type === 'SignEquals' || selector.type === 'SignMask') {
    if (!project.signs.some((item) => item.id === selector.signRef)) {
      errors.push(`Force Command“${command.label}”没有选择有效的 sign 标签。`);
    }
  }
  if (selector.type === 'SignMask' && !isInt32(selector.signMask)) {
    errors.push(`Force Command“${command.label}”的 signMask 必须是 32-bit Int。`);
  }
  if (selector.type === 'CommandMask') {
    if (!selector.commandMaskRefs.length) {
      errors.push(`Force Command“${command.label}”的 CommandMask 至少需要选择一个命令类别。`);
    }
    selector.commandMaskRefs.forEach((id) => {
      if (!project.commandMasks.some((item) => item.id === id)) {
        errors.push(`Force Command“${command.label}”引用了不存在的 commandMask。`);
      }
    });
  }
}

export function collectCParticleForceErrors(project) {
  const source = project && typeof project === 'object' ? project : {};
  const errors = [];
  const signs = Array.isArray(source.signs) ? source.signs : [];
  const commandMasks = Array.isArray(source.commandMasks) ? source.commandMasks : [];
  const forceResources = Array.isArray(source.forceResources) ? source.forceResources : [];
  const forceCommands = Array.isArray(source.forceCommands) ? source.forceCommands : [];
  const normalized = { ...source, signs, commandMasks, forceResources, forceCommands };
  validateNamedValues(signs, 'SIGN', 'sign 标签', errors);
  validateNamedValues(commandMasks, 'COMMAND_MASK', 'commandMask', errors);
  forceResources.forEach((resource, index) => {
    if (!String(resource.name || '').trim()) errors.push(`Force 资源 #${index + 1} 的名称不能为空。`);
    if (!parseMinecraftResourceLocation(resource.location)) {
      errors.push(`Force 资源“${resource.name || index + 1}”必须使用合法 ResourceLocation（namespace:path）。`);
    }
  });
  for (const [kind, forceType, label] of [
    ['texture', 'Texture', 'Texture'],
    ['fluid', 'FluidFlow', 'FluidFlow']
  ]) {
    const locations = new Set(forceCommands
      .filter((command) => command?.enabled !== false && command.force?.type === forceType)
      .map((command) => forceResources.find((resource) => (
        resource.id === command.force?.parameters?.resourceRef && resource.kind === kind
      ))?.location)
      .filter((location) => parseMinecraftResourceLocation(location)));
    if (locations.size > CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND) {
      errors.push(`CParticle ${label} Force 最多可同时使用 ${CPARTICLE_FORCE_MAX_RESOURCES_PER_KIND} 个不同资源，当前为 ${locations.size} 个。`);
    }
  }
  if (forceCommands.filter((item) => item.enabled !== false).length > CPARTICLE_FORCE_MAX_COMMANDS) {
    errors.push(`CParticle Force Commands 最多支持 ${CPARTICLE_FORCE_MAX_COMMANDS} 条，当前为 ${forceCommands.filter((item) => item.enabled !== false).length} 条。`);
  }
  forceCommands.forEach((command) => {
    if (command.enabled === false) return;
    validateForceParameters(command, normalized, errors);
    validateSelector(command, normalized, errors);
  });
  (Array.isArray(source.emitters) ? source.emitters : []).forEach((emitter) => {
    if (emitter?.enabled === false || !emitter?.useGPU) return;
    if (emitter.gpu?.signRef && !signs.some((item) => item.id === emitter.gpu.signRef)) {
      errors.push(`发射器“${emitter.name}”引用了不存在的 sign 标签。`);
    }
    (emitter.gpu?.commandMaskRefs || []).forEach((id) => {
      if (!commandMasks.some((item) => item.id === id)) errors.push(`发射器“${emitter.name}”引用了不存在的 commandMask。`);
    });
    if (!isInt32(emitter.gpu?.metadataFlags ?? 0)) {
      errors.push(`发射器“${emitter.name}”的 metadataFlags 必须是 32-bit Int。`);
    }
    if (emitter.gpu?.charge !== null && !Number.isFinite(Number(emitter.gpu?.charge))) {
      errors.push(`发射器“${emitter.name}”的 charge 必须是有限 Float，或留空使用 Float.NaN。`);
    }
    const radius = Number(emitter.gpu?.radius ?? 0);
    if (!Number.isFinite(radius) || radius < 0) {
      errors.push(`发射器“${emitter.name}”的 radius 必须是非负有限 Float。`);
    }
  });
  return Array.from(new Set(errors));
}

export function collectCParticleForceWarnings(project) {
  return (Array.isArray(project?.forceCommands) ? project.forceCommands : [])
    .filter((command) => command?.enabled !== false && (command.selector?.type === 'SourceEquals' || command.selector?.type === 'SourceMask'))
    .map((command) => `Force Command“${command.label}”使用运行时 sourceId；它不是可持久化 emitter ID，也不能填写 UUID、字符串 ID 或资源 ID。`);
}
