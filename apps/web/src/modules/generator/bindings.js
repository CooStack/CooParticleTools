import { analyzeGeneratorExpression } from './expression-runtime.js';

const GENERATOR_TYPE_DEFINITIONS = [
  { type: 'Int', aliases: ['int'], inputs: ['int'], category: 'numeric', defaultValue: 0, literal: 'int' },
  { type: 'Long', aliases: ['long'], inputs: ['long'], category: 'numeric', defaultValue: '0', literal: 'long' },
  { type: 'Float', aliases: ['float'], inputs: ['float'], category: 'numeric', defaultValue: 0, literal: 'float' },
  { type: 'Double', aliases: ['double'], inputs: ['number'], category: 'numeric', defaultValue: 0, literal: 'double' },
  {
    type: 'Boolean',
    aliases: ['boolean', 'bool'],
    inputs: ['boolean'],
    category: 'scalar',
    defaultValue: false,
    literal: 'boolean'
  },
  { type: 'String', aliases: ['string'], inputs: ['string'], category: 'scalar', defaultValue: '', literal: 'string' },
  {
    type: 'Vec3',
    aliases: ['vec3'],
    inputs: ['vec3', 'vector'],
    category: 'vector',
    defaultValue: 'Vec3(0.0, 0.0, 0.0)',
    literal: 'vector'
  },
  {
    type: 'RelativeLocation',
    aliases: ['relativelocation'],
    inputs: ['relative'],
    category: 'vector',
    defaultValue: 'RelativeLocation(0.0, 0.0, 0.0)',
    literal: 'vector'
  },
  {
    type: 'Vector3f',
    aliases: ['vector3f'],
    inputs: ['vector3f', 'color'],
    category: 'vector',
    defaultValue: 'Vector3f(0.0f, 0.0f, 0.0f)',
    literal: 'vector'
  }
];

export const GENERATOR_VALUE_TYPES = GENERATOR_TYPE_DEFINITIONS.map((item) => item.type);

const GENERATOR_VALUE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GENERATOR_LONG_PATTERN = /^-?\d+$/;
const GENERATOR_INT_MIN = -2147483648;
const GENERATOR_INT_MAX = 2147483647;
const GENERATOR_LONG_MIN = -9223372036854775808n;
const GENERATOR_LONG_MAX = 9223372036854775807n;
const GENERATOR_VECTOR_PATTERN = /^[A-Za-z0-9_]+\s*\(([^)]+)\)$/;
const GENERATOR_VECTOR_AXES = ['x', 'y', 'z'];
const TYPE_DEFINITION_BY_TYPE = new Map(GENERATOR_TYPE_DEFINITIONS.map((item) => [item.type, item]));
const TYPE_BY_ALIAS = new Map(GENERATOR_TYPE_DEFINITIONS.flatMap((item) => (
  item.aliases.map((alias) => [alias, item.type])
)));
const TYPE_BY_INPUT = new Map(GENERATOR_TYPE_DEFINITIONS.flatMap((item) => (
  item.inputs.map((input) => [input, item.type])
)));

export function isGeneratorValueName(value) {
  return GENERATOR_VALUE_NAME_PATTERN.test(String(value || ''));
}

export function collectGeneratorValueEntries(parameters = {}) {
  const sources = [
    ['variable', parameters?.variables],
    ['constant', parameters?.constants]
  ];
  const seenNames = new Set();
  const entries = [];
  for (const [scope, values] of sources) {
    for (const value of Array.isArray(values) ? values : []) {
      const name = String(value?.name || '');
      if (!isGeneratorValueName(name) || seenNames.has(name)) continue;
      seenNames.add(name);
      entries.push({ scope, value });
    }
  }
  return entries;
}

export function filterGeneratorValueNameInput(value) {
  const text = String(value || '').replace(/[^A-Za-z0-9_]/g, '');
  return text.replace(/^\d+/, '');
}

export function normalizeGeneratorValueType(rawType) {
  const raw = String(rawType || '').trim();
  const lowered = raw.toLowerCase();
  const aliased = TYPE_BY_ALIAS.get(lowered);
  if (aliased) return aliased;
  return GENERATOR_VALUE_TYPES.includes(raw) ? raw : 'Double';
}

export function generatorBindingType(valueType = 'number') {
  const type = String(valueType || 'number');
  return TYPE_BY_INPUT.get(type) || '';
}

export function filterGeneratorBindingsByType(items = [], valueType = 'number') {
  const expectedType = generatorBindingType(valueType);
  if (!expectedType) return [];
  return Array.from(items || []).filter((item) => acceptsGeneratorType(String(item?.type || ''), expectedType));
}

/**
 * Analyze an emitter binding with the same expression rules used by preview
 * and Kotlin generation.  Keeping this small wrapper in bindings.js lets UI
 * callers work with parameter objects instead of rebuilding a symbol table.
 */
export function analyzeGeneratorBindingExpression(raw, parameters = {}, expectedTypes = '') {
  const symbols = collectGeneratorValueEntries(parameters).map(({ value }) => value);
  return analyzeGeneratorExpression(raw, symbols, { expectedTypes });
}

export function isGeneratorNumericType(type) {
  return TYPE_DEFINITION_BY_TYPE.get(String(type || ''))?.category === 'numeric';
}

export function isGeneratorVectorType(type) {
  return TYPE_DEFINITION_BY_TYPE.get(String(type || ''))?.category === 'vector';
}

export function getGeneratorTypeDefault(type) {
  const normalized = normalizeGeneratorValueType(type);
  return TYPE_DEFINITION_BY_TYPE.get(normalized)?.defaultValue ?? 0;
}

export function normalizeGeneratorTypedValue(type, value) {
  const normalized = normalizeGeneratorValueType(type);
  if (normalized === 'Long') return normalizeGeneratorLongValue(value);
  if (isGeneratorNumericType(normalized)) {
    const numeric = toFiniteNumber(value, 0);
    return normalized === 'Int'
      ? Math.min(GENERATOR_INT_MAX, Math.max(GENERATOR_INT_MIN, Math.trunc(numeric)))
      : numeric;
  }
  if (normalized === 'Boolean') {
    return value === true || value === 'true' || value === 1 || value === '1';
  }
  if (isGeneratorVectorType(normalized)) {
    return normalizeGeneratorVectorValue(normalized, value || getGeneratorTypeDefault(normalized));
  }
  if (normalized === 'String') {
    const text = String(value ?? '').trim();
    return text || getGeneratorTypeDefault(normalized);
  }
  return getGeneratorTypeDefault(normalized);
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

export function parseGeneratorVectorLiteral(rawValue, fallback = { x: 0, y: 0, z: 0 }) {
  const normalizedFallback = vectorFrom(fallback);
  if (Array.isArray(rawValue)) {
    return vectorFrom({ x: rawValue[0], y: rawValue[1], z: rawValue[2] }, normalizedFallback);
  }
  if (rawValue && typeof rawValue === 'object') return vectorFrom(rawValue, normalizedFallback);

  const match = String(rawValue || '').trim().match(GENERATOR_VECTOR_PATTERN);
  if (!match) return { ...normalizedFallback };
  const parts = match[1].split(',').map(stripKotlinNumberSuffix);
  return vectorFrom({ x: parts[0], y: parts[1], z: parts[2] }, normalizedFallback);
}

export function parseGeneratorVectorValue(type, rawValue) {
  const fallback = { x: 0, y: 0, z: 0 };
  if (!isGeneratorVectorType(type)) return fallback;

  const match = String(rawValue || '').trim().match(GENERATOR_VECTOR_PATTERN);
  if (!match || match[1].split(',').length < 3) return fallback;
  return parseGeneratorVectorLiteral(rawValue, fallback);
}

export function formatGeneratorVectorValue(type, components = {}) {
  if (!isGeneratorVectorType(type)) return '';
  const values = GENERATOR_VECTOR_AXES.map((axis) => formatVectorComponent(type, components[axis]));
  return `${type}(${values.join(', ')})`;
}

export function normalizeGeneratorVectorValue(type, rawValue) {
  if (!isGeneratorVectorType(type)) return '';
  const text = String(rawValue ?? '').trim();
  if (!GENERATOR_VECTOR_PATTERN.test(text)) {
    return formatGeneratorVectorValue(type, { x: 0, y: 0, z: 0 });
  }
  return formatGeneratorVectorValue(type, parseGeneratorVectorValue(type, text));
}

export function updateGeneratorVectorComponent(type, rawValue, axis, value, limits = {}) {
  if (!GENERATOR_VECTOR_AXES.includes(axis)) return String(rawValue || '');
  const components = parseGeneratorVectorValue(type, rawValue);
  const fallback = components[axis];
  let next = Number(value);
  if (!Number.isFinite(next)) next = fallback;
  if (Number.isFinite(limits.min)) next = Math.max(limits.min, next);
  if (Number.isFinite(limits.max)) next = Math.min(limits.max, next);
  components[axis] = next;
  return formatGeneratorVectorValue(type, components);
}

export function formatGeneratorKotlinLiteral(type, value) {
  const normalized = normalizeGeneratorValueType(type);
  const literal = TYPE_DEFINITION_BY_TYPE.get(normalized)?.literal;
  if (literal === 'int') return formatInteger(value);
  if (literal === 'long') return `${normalizeGeneratorLongValue(value)}L`;
  if (literal === 'float') return `${formatDouble(value)}f`;
  if (literal === 'double') return formatDouble(value);
  if (literal === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (literal === 'string') return formatString(value);
  if (literal === 'vector') return normalizeGeneratorVectorValue(normalized, value);
  return formatDouble(value);
}

function createGeneratorValueIndex(parameters = {}) {
  return new Map(collectGeneratorValueEntries(parameters)
    .map(({ value }) => [String(value.name), value]));
}

export function createGeneratorBindingResolver(parameters = {}) {
  const values = createGeneratorValueIndex(parameters);
  const expressionSymbols = Array.from(values.values());
  return {
    parameters,
    resolve(bindings, path, expectedTypes = '') {
      const name = String(bindings?.[path] || '').trim();
      if (!name) return { status: 'unbound', name, value: null, type: '' };

      const value = values.get(name);
      if (!value) {
        const analysis = analyzeGeneratorExpression(name, expressionSymbols, { expectedTypes });
        if (analysis.valid) {
          return {
            status: 'expression',
            name,
            expression: name,
            value: { type: analysis.type, value: analysis.value },
            type: analysis.type,
            kotlin: analysis.kotlin,
            analysis
          };
        }
        if (GENERATOR_VALUE_NAME_PATTERN.test(name)) {
          return { status: 'missing', name, value: null, type: '' };
        }
        return {
          status: analysis.reason === 'type_mismatch' ? 'type_mismatch' : 'invalid_expression',
          name,
          value: null,
          type: analysis.type || '',
          message: analysis.message,
          analysis
        };
      }

      const type = String(value.type || '');
      if (!acceptsGeneratorType(type, expectedTypes)) {
        return { status: 'type_mismatch', name, value, type };
      }
      const kotlin = generatorBindingKotlin(name, type, expectedTypes);
      return kotlin
        ? { status: 'resolved', name, value, type, kotlin }
        : { status: 'resolved', name, value, type };
    }
  };
}

function acceptsGeneratorType(type, expectedTypes) {
  if (!expectedTypes) return true;
  return expectedGeneratorTypes(expectedTypes).some((expectedType) => (
    type === expectedType || type === 'Int' && expectedType === 'Double'
  ));
}

function generatorBindingKotlin(name, type, expectedTypes) {
  return type === 'Int' && expectedGeneratorTypes(expectedTypes).includes('Double')
    ? `(${name}).toDouble()`
    : '';
}

function expectedGeneratorTypes(expectedTypes) {
  if (expectedTypes instanceof Set) return Array.from(expectedTypes, String);
  if (Array.isArray(expectedTypes)) return expectedTypes.map(String);
  return [String(expectedTypes)];
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

function stripKotlinNumberSuffix(value) {
  return String(value ?? '').trim().replace(/[fFdDlL]$/g, '');
}

function vectorFrom(value = {}, fallback = { x: 0, y: 0, z: 0 }) {
  return {
    x: toFiniteNumber(value?.x, toFiniteNumber(fallback?.x, 0)),
    y: toFiniteNumber(value?.y, toFiniteNumber(fallback?.y, 0)),
    z: toFiniteNumber(value?.z, toFiniteNumber(fallback?.z, 0))
  };
}

function formatVectorComponent(type, value) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const rounded = Math.abs(safe) < 0.0000005 ? 0 : Number(safe.toFixed(6));
  const literal = Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
  return type === 'Vector3f' ? `${literal}f` : literal;
}

function formatDouble(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number(fallback).toFixed(1);
  if (Math.trunc(numeric) === numeric) return numeric.toFixed(1);
  return Number(numeric.toFixed(6)).toString();
}

function formatInteger(value, fallback = 0) {
  const numeric = Number(value);
  const safe = Math.trunc(Number.isFinite(numeric) ? numeric : fallback);
  return String(Math.min(GENERATOR_INT_MAX, Math.max(GENERATOR_INT_MIN, safe)));
}

function formatString(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
