const VECTOR_TYPES = new Set(['Vec3', 'RelativeLocation', 'Vector3f']);
const VECTOR_AXES = ['x', 'y', 'z'];
const GENERATOR_VALUE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GENERATOR_LONG_PATTERN = /^-?\d+$/;
const GENERATOR_LONG_MIN = -9223372036854775808n;
const GENERATOR_LONG_MAX = 9223372036854775807n;

export function isGeneratorValueName(value) {
  return GENERATOR_VALUE_NAME_PATTERN.test(String(value || ''));
}

export function filterGeneratorValueNameInput(value) {
  const text = String(value || '').replace(/[^A-Za-z0-9_]/g, '');
  return text.replace(/^\d+/, '');
}

export function generatorBindingType(valueType = 'number') {
  const type = String(valueType || 'number');
  if (type === 'number') return 'Double';
  if (type === 'int') return 'Int';
  if (type === 'long') return 'Long';
  if (type === 'float') return 'Float';
  if (type === 'string') return 'String';
  if (type === 'boolean') return 'Boolean';
  if (type === 'vec3' || type === 'vector') return 'Vec3';
  if (type === 'relative') return 'RelativeLocation';
  if (type === 'vector3f' || type === 'color') return 'Vector3f';
  return '';
}

export function filterGeneratorBindingsByType(items = [], valueType = 'number') {
  const expectedType = generatorBindingType(valueType);
  if (!expectedType) return [];
  return Array.from(items || []).filter((item) => String(item?.type || '') === expectedType);
}

export function normalizeGeneratorLongValue(value, fallback = '0') {
  const text = String(value ?? '').trim().replace(/[lL]$/, '');
  if (!GENERATOR_LONG_PATTERN.test(text)) return normalizeGeneratorLongFallback(fallback);
  try {
    const parsed = BigInt(text);
    if (parsed < GENERATOR_LONG_MIN || parsed > GENERATOR_LONG_MAX) {
      return normalizeGeneratorLongFallback(fallback);
    }
    return parsed.toString();
  } catch {
    return normalizeGeneratorLongFallback(fallback);
  }
}

export function createDeferredGeneratorValueCommit(commit, options = {}) {
  const delay = Math.max(0, Number(options.delay) || 220);
  const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout;
  let timer = 0;
  let pendingValue;
  let pendingTarget;
  let hasPendingValue = false;

  function clearTimer() {
    if (!timer) return;
    clearTimeoutFn(timer);
    timer = 0;
  }

  function flush() {
    clearTimer();
    if (!hasPendingValue) return;
    const value = pendingValue;
    const target = pendingTarget;
    pendingValue = undefined;
    pendingTarget = undefined;
    hasPendingValue = false;
    commit(value, target);
  }

  return {
    schedule(value, target) {
      pendingValue = value;
      pendingTarget = target;
      hasPendingValue = true;
      clearTimer();
      timer = setTimeoutFn(() => {
        const completedTimer = timer;
        timer = 0;
        if (completedTimer) clearTimeoutFn(completedTimer);
        flush();
      }, delay);
    },
    flush,
    cancel() {
      clearTimer();
      pendingValue = undefined;
      pendingTarget = undefined;
      hasPendingValue = false;
    },
    isPending() {
      return hasPendingValue;
    }
  };
}

export function isGeneratorVectorType(type) {
  return VECTOR_TYPES.has(String(type || ''));
}

export function parseGeneratorVectorValue(type, rawValue) {
  const fallback = { x: 0, y: 0, z: 0 };
  if (!isGeneratorVectorType(type)) return fallback;

  const match = String(rawValue || '').trim().match(/^[A-Za-z0-9_]+\s*\(([^)]+)\)$/);
  if (!match) return fallback;
  const parts = match[1].split(',').map((part) => Number(part.trim().replace(/[fFdDlL]$/g, '')));
  if (parts.length < 3) return fallback;

  return Object.fromEntries(VECTOR_AXES.map((axis, index) => [
    axis,
    Number.isFinite(parts[index]) ? parts[index] : fallback[axis]
  ]));
}

export function formatGeneratorVectorValue(type, components = {}) {
  if (!isGeneratorVectorType(type)) return '';
  const values = VECTOR_AXES.map((axis) => formatVectorComponent(type, components[axis]));
  return `${type}(${values.join(', ')})`;
}

export function normalizeGeneratorVectorValue(type, rawValue) {
  if (!isGeneratorVectorType(type)) return '';
  const text = String(rawValue ?? '').trim();
  if (!/^[A-Za-z0-9_]+\s*\([^)]+\)$/.test(text)) {
    return formatGeneratorVectorValue(type, { x: 0, y: 0, z: 0 });
  }
  return formatGeneratorVectorValue(type, parseGeneratorVectorValue(type, text));
}

export function updateGeneratorVectorComponent(type, rawValue, axis, value, limits = {}) {
  if (!VECTOR_AXES.includes(axis)) return String(rawValue || '');
  const components = parseGeneratorVectorValue(type, rawValue);
  const fallback = components[axis];
  let next = Number(value);
  if (!Number.isFinite(next)) next = fallback;
  if (Number.isFinite(limits.min)) next = Math.max(limits.min, next);
  if (Number.isFinite(limits.max)) next = Math.min(limits.max, next);
  components[axis] = next;
  return formatGeneratorVectorValue(type, components);
}

export function generatorVectorValueToHex(rawValue) {
  const vector = parseGeneratorVectorValue('Vector3f', rawValue);
  return rgbToHex(vector.x * 255, vector.y * 255, vector.z * 255);
}

export function generatorHexToVectorValue(hex) {
  const rgb = hexToRgb(hex);
  return formatGeneratorVectorValue('Vector3f', {
    x: rgb.r / 255,
    y: rgb.g / 255,
    z: rgb.b / 255
  });
}

function formatVectorComponent(type, value) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const rounded = Math.abs(safe) < 0.0000005 ? 0 : Number(safe.toFixed(6));
  const literal = Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
  return type === 'Vector3f' ? `${literal}f` : literal;
}

function normalizeGeneratorLongFallback(fallback) {
  const text = String(fallback ?? '0').trim().replace(/[lL]$/, '');
  try {
    if (!GENERATOR_LONG_PATTERN.test(text)) return '0';
    const parsed = BigInt(text);
    return parsed >= GENERATOR_LONG_MIN && parsed <= GENERATOR_LONG_MAX ? parsed.toString() : '0';
  } catch {
    return '0';
  }
}

function hexToRgb(hex) {
  const text = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? String(hex).slice(1) : '000000';
  const value = Number.parseInt(text, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.round(Math.max(0, Math.min(255, Number(value) || 0))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
