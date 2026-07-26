import { evalBuilder, evalBuilderWithMeta } from './builder-tools.js';
import { FOURIER_TERM_FIELDS, POINTS_NODE_KINDS } from './kinds.js';
import { getProjectNodes } from './node-helpers.js';
import { normalizePointsBuilderProject } from './normalizer.js';

const FOURIER_NUMERIC_KEYS = new Set(
  FOURIER_TERM_FIELDS.filter((field) => field.type === 'number').map((field) => field.key)
);

export function evaluatePointsNodes(nodes = []) {
  return evalBuilder(nodes);
}

export function evaluatePointsProject(project, options = {}) {
  const normalized = normalizePointsBuilderProject(project, project?.tool || 'pointsbuilder');
  resolvePreviewExpressions(getProjectNodes(normalized), options.parameters);
  return evalBuilder(getProjectNodes(normalized));
}

export function evaluatePointsProjectWithMeta(project, options = {}) {
  const normalized = normalizePointsBuilderProject(project, project?.tool || 'pointsbuilder');
  resolvePreviewExpressions(getProjectNodes(normalized), options.parameters);
  return evalBuilderWithMeta(getProjectNodes(normalized));
}

function resolvePreviewExpressions(nodes, parameters) {
  const scope = createParameterScope(parameters);
  if (!scope) return;
  const walk = (list) => {
    for (const node of list || []) {
      const numericKeys = new Set(
        (POINTS_NODE_KINDS[node?.kind]?.fields || [])
          .filter((field) => field.type === 'number')
          .map((field) => field.key)
      );
      resolveObjectExpressions(node?.params, numericKeys, scope);
      for (const term of node?.terms || []) resolveObjectExpressions(term, FOURIER_NUMERIC_KEYS, scope);
      walk(node?.children);
    }
  };
  walk(nodes);
}

function resolveObjectExpressions(target, numericKeys, scope) {
  if (!target || typeof target !== 'object') return;
  for (const key of numericKeys) {
    const value = target[key];
    if (typeof value !== 'string') continue;
    const resolved = evaluatePreviewExpression(value, scope);
    if (Number.isFinite(resolved)) target[key] = resolved;
  }
}

function createParameterScope(parameters = {}) {
  const values = [
    ...(Array.isArray(parameters?.variables) ? parameters.variables : []),
    ...(Array.isArray(parameters?.constants) ? parameters.constants : [])
  ];
  if (!values.length) return null;
  const scope = { PI: Math.PI, Math };
  const seenNames = new Set();
  for (const item of values) {
    const name = String(item?.name || '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    const type = String(item?.type || '');
    if (['Int', 'Long', 'Float', 'Double'].includes(type)) {
      const numeric = Number(item.value);
      if (Number.isFinite(numeric)) scope[name] = numeric;
      continue;
    }
    if (['Vec3', 'RelativeLocation', 'Vector3f'].includes(type)) {
      const vector = parsePreviewVector(item.value);
      if (vector) scope[name] = vector;
    }
  }
  return scope;
}

function parsePreviewVector(rawValue) {
  const match = String(rawValue || '').trim().match(/^[A-Za-z0-9_]+\s*\(([^)]+)\)$/);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => Number(part.trim().replace(/[fFdDlL]$/g, '')));
  if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) return null;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function evaluatePreviewExpression(rawValue, scope) {
  const source = String(rawValue || '')
    .trim()
    .replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, '')
    .replace(/(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, '$1');
  if (!source || !/^[A-Za-z0-9_.$+\-*/%(),\s]+$/.test(source)) return Number.NaN;
  const keys = Object.keys(scope);
  try {
    const result = new Function(...keys, `"use strict"; return (${source});`)(...keys.map((key) => scope[key]));
    const numeric = Number(result);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  } catch {
    return Number.NaN;
  }
}
