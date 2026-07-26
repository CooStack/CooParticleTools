import {
  formatGeneratorVectorValue,
  parseGeneratorVectorValue
} from './bindings.js';

export {
  filterGeneratorBindingsByType,
  filterGeneratorValueNameInput,
  formatGeneratorVectorValue,
  generatorBindingType,
  isGeneratorValueName,
  isGeneratorVectorType,
  normalizeGeneratorLongValue,
  normalizeGeneratorVectorValue,
  parseGeneratorVectorValue,
  updateGeneratorVectorComponent
} from './bindings.js';

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

export function calculateGeneratorNumericScrubValue(startValue, verticalPixels, options = {}) {
  const start = Number(startValue);
  if (!Number.isFinite(start)) return startValue;
  const rawStep = Math.abs(Number(options.step));
  const step = rawStep > 0 ? rawStep : 0.01;
  const rawScale = Number(options.scale);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  let next = start + Number(verticalPixels || 0) * step * scale;
  const min = Number(options.min);
  const max = Number(options.max);
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  const precision = Math.min(8, Math.max(0, decimalPlaces(step) + (scale < 1 ? 1 : 0)));
  const rounded = Number(next.toFixed(precision));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
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
