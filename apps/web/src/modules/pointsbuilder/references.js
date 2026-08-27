import { deepClone } from '../../utils/clone.js';
import { makeId } from '../../utils/id.js';
import { createNodeByKind, cloneNodeDeep } from './node-helpers.js';

export const BUILDER_REFERENCE_KIND = 'builder_reference';
export const EFFECT_RING_KIND = 'effect_ring';
export const EFFECT_GROUP_LABEL = '参数化实例';
export const BUILDER_REFERENCE_SCHEMA_VERSION = 1;

const BUILDER_SNAPSHOT_CACHE = new Map();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value = {}, fallback = 0) {
  return {
    x: finite(value?.x ?? value?.[0], fallback),
    y: finite(value?.y ?? value?.[1], fallback),
    z: finite(value?.z ?? value?.[2], fallback)
  };
}

export function builderReferenceInstanceMode(node) {
  return node?.params?.instanceMode === 'construct' ? 'construct' : 'static';
}

function safeParameterPart(value, fallback = 'instance') {
  const safe = String(value || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  return safe || fallback;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacementExpression(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value ?? '').trim();
  if (!text) return '0';
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(text)) return text;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/.test(text)) return text;
  return `(${text})`;
}

function replaceExpressionVariables(value, scalar, vector) {
  let result = String(value ?? '');
  for (const [name, replacement] of Object.entries(vector || {})) {
    const escaped = escapeRegExp(name);
    result = result.replace(
      new RegExp(`(^|[^A-Za-z0-9_$])${escaped}\\s*\\.\\s*([xyz])(?![A-Za-z0-9_$])`, 'g'),
      (match, prefix, component) => `${prefix}${replacementExpression(replacement?.[component])}`
    );
  }
  for (const [name, replacement] of Object.entries(scalar || {})) {
    const escaped = escapeRegExp(name);
    result = result.replace(
      new RegExp(`(^|[^A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, 'g'),
      (match, prefix) => `${prefix}${replacementExpression(replacement)}`
    );
  }
  return result;
}

function referenceOverrideValues(snapshot, nodeOrOverrides, options = {}) {
  const nodeMode = builderReferenceInstanceMode(nodeOrOverrides);
  const sharedStaticOverrides = snapshot?.staticOverrides && typeof snapshot.staticOverrides === 'object'
    ? snapshot.staticOverrides
    : null;
  const raw = (nodeMode === 'static' && sharedStaticOverrides)
    ? sharedStaticOverrides
    : nodeOrOverrides?.params?.overrides
    || nodeOrOverrides?.overrides
    || nodeOrOverrides
    || {};
  const defaults = snapshot?.variables?.inputs && typeof snapshot.variables.inputs === 'object'
    ? snapshot.variables.inputs
    : {};
  const scalar = {
    ...(defaults.scalar && typeof defaults.scalar === 'object' ? defaults.scalar : {}),
    ...(raw.scalar && typeof raw.scalar === 'object' ? raw.scalar : {})
  };
  const vector = {
    ...(defaults.vector && typeof defaults.vector === 'object' ? defaults.vector : {}),
    ...(raw.vector && typeof raw.vector === 'object' ? raw.vector : {})
  };
  const modes = raw.modes && typeof raw.modes === 'object' ? raw.modes : {};
  const refs = raw.refs && typeof raw.refs === 'object' ? raw.refs : {};
  for (const [name, mode] of Object.entries(modes.scalar || {})) {
    const ref = String(refs.scalar?.[name] || '').trim();
    if (mode !== 'reference' || !ref) continue;
    const resolved = typeof options.resolveReference === 'function'
      ? options.resolveReference('scalar', ref)
      : undefined;
    if (!options.freezeReferences) scalar[name] = ref;
    else if (resolved !== undefined) scalar[name] = resolved;
  }
  for (const [name, mode] of Object.entries(modes.vector || {})) {
    const ref = String(refs.vector?.[name] || '').trim();
    if (mode === 'reference' && ref) {
      const resolved = typeof options.resolveReference === 'function'
        ? options.resolveReference('vector', ref)
        : undefined;
      if (!options.freezeReferences) vector[name] = { x: `${ref}.x`, y: `${ref}.y`, z: `${ref}.z` };
      else if (resolved !== undefined) vector[name] = point(resolved);
    }
  }
  return { scalar, vector };
}

export function getBuilderReferenceOverrideValues(snapshot, nodeOrOverrides, options = {}) {
  return referenceOverrideValues(snapshot, nodeOrOverrides, options);
}

export function getBuilderSnapshotVariableEntries(snapshot) {
  const variables = snapshot?.variables && typeof snapshot.variables === 'object' ? snapshot.variables : {};
  const result = [];
  const seen = new Set();
  const add = (type, rawName) => {
    const name = String(rawName || '').trim();
    const normalizedType = type === 'vector' ? 'vector' : 'scalar';
    const key = `${normalizedType}:${name}`;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || seen.has(key)) return;
    seen.add(key);
    result.push({ type: normalizedType, name });
  };
  for (const entry of Array.isArray(variables.entries) ? variables.entries : []) add(entry?.type, entry?.name);
  for (const name of Array.isArray(variables.refs?.vector) ? variables.refs.vector : []) add('vector', name);
  for (const name of Array.isArray(variables.refs?.scalar) ? variables.refs.scalar : []) add('scalar', name);
  for (const name of Object.keys(variables.inputs?.vector || {})) add('vector', name);
  for (const name of Object.keys(variables.inputs?.scalar || {})) add('scalar', name);
  return result;
}

export function builderReferenceParameterId(node, fallback = '') {
  const explicit = String(node?.params?.parameterId || node?.parameterId || '').trim();
  if (explicit) return explicit;
  return `pb_instance_${safeParameterPart(node?.id || fallback)}`;
}

export function applyBuilderReferenceOverrides(nodes, snapshot, nodeOrOverrides, options = {}) {
  const result = deepClone(Array.isArray(nodes) ? nodes : []);
  const replacements = referenceOverrideValues(snapshot, nodeOrOverrides, options);
  const visitValue = (value) => {
    if (typeof value === 'string') {
      return replaceExpressionVariables(value, replacements.scalar, replacements.vector);
    }
    if (Array.isArray(value)) return value.map(visitValue);
    if (!value || typeof value !== 'object') return value;
    const next = {};
    for (const [key, child] of Object.entries(value)) next[key] = visitValue(child);
    return next;
  };
  const visitNode = (node) => {
    if (!node || typeof node !== 'object') return node;
    const next = { ...node };
    if (node.params && typeof node.params === 'object') next.params = visitValue(node.params);
    if (Array.isArray(node.terms)) next.terms = node.terms.map(visitValue);
    if (Array.isArray(node.children)) next.children = node.children.map(visitNode);
    return next;
  };
  return result.map(visitNode);
}

export function builderReferenceTemplateCacheKey(snapshot, nodeOrOverrides) {
  return JSON.stringify({
    snapshotId: snapshot?.id || '',
    revision: snapshot?.revision || 0,
    updatedAt: snapshot?.updatedAt || 0,
    children: snapshot?.children || [],
    instanceMode: builderReferenceInstanceMode(nodeOrOverrides),
    overrides: referenceOverrideValues(snapshot, nodeOrOverrides)
  });
}

function idFactory(options = {}) {
  return typeof options.idFactory === 'function' ? options.idFactory : () => makeId('pb');
}

function uniqueId(used, options = {}) {
  const make = idFactory(options);
  let candidate = '';
  do candidate = String(make() || '').trim(); while (!candidate || used.has(candidate));
  used.add(candidate);
  return candidate;
}

export function normalizeBuilderSnapshots(raw, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  const used = new Set();
  const items = Array.isArray(source)
    ? source
    : Array.isArray(source.items)
      ? source.items
      : (source.id && (Array.isArray(source.children) || source.root || source.source)
          ? [source]
          : Object.entries(source).map(([id, item]) => ({ id, ...item })));
  const entries = items.map((item) => [item?.id, item]);
  for (const [key, rawSnapshot] of entries) {
    if (!rawSnapshot || typeof rawSnapshot !== 'object') continue;
    const id = String(rawSnapshot.id || key || '').trim() || uniqueId(used, options);
    if (used.has(id)) continue;
    used.add(id);
    const sourceRoot = rawSnapshot.source?.root || rawSnapshot.root;
    const children = Array.isArray(rawSnapshot.children)
      ? deepClone(rawSnapshot.children)
      : Array.isArray(sourceRoot?.children)
        ? deepClone(sourceRoot.children)
        : [];
    result[id] = {
      id,
      sourcePresetId: String(rawSnapshot.sourcePresetId || rawSnapshot.presetId || '').trim(),
      sourcePresetRevision: String(rawSnapshot.sourcePresetRevision || rawSnapshot.revision || '').trim(),
      name: String(rawSnapshot.name || '未命名实例').trim() || '未命名实例',
      origin: point(rawSnapshot.origin),
      variables: rawSnapshot.variables && typeof rawSnapshot.variables === 'object'
        ? deepClone(rawSnapshot.variables)
        : null,
      staticOverrides: rawSnapshot.staticOverrides && typeof rawSnapshot.staticOverrides === 'object'
        ? deepClone(rawSnapshot.staticOverrides)
        : null,
      privateConstants: rawSnapshot.privateConstants && typeof rawSnapshot.privateConstants === 'object'
        ? deepClone(rawSnapshot.privateConstants)
        : {},
      source: {
        root: {
          id: 'root',
          kind: 'ROOT',
          children: deepClone(children)
        }
      },
      children,
      revision: Math.max(1, Math.trunc(finite(rawSnapshot.revision, 1))),
      createdAt: Math.trunc(finite(rawSnapshot.createdAt, Date.now())),
      updatedAt: Math.trunc(finite(rawSnapshot.updatedAt, Date.now()))
    };
  }
  return result;
}

export function createBuilderSnapshotFromPreset(preset, options = {}) {
  if (!preset || typeof preset !== 'object') return null;
  const used = options.usedIds instanceof Set ? options.usedIds : new Set();
  const id = uniqueId(used, options);
  return {
    id,
    sourcePresetId: String(preset.id || '').trim(),
    sourcePresetRevision: String(preset.updatedAt || preset.createdAt || '').trim(),
    name: String(preset.name || '未命名实例').trim() || '未命名实例',
    origin: point(preset.origin),
    variables: preset.variables && typeof preset.variables === 'object' ? deepClone(preset.variables) : null,
    staticOverrides: options.staticOverrides && typeof options.staticOverrides === 'object'
      ? deepClone(options.staticOverrides)
      : (preset.variables?.inputs && typeof preset.variables.inputs === 'object' ? deepClone(preset.variables.inputs) : null),
    children: Array.isArray(preset.children) ? deepClone(preset.children) : [],
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function createBuilderSnapshot(projectOrNodes, options = {}) {
  const project = projectOrNodes && typeof projectOrNodes === 'object' ? projectOrNodes : {};
  const children = Array.isArray(projectOrNodes)
    ? projectOrNodes
    : Array.isArray(project?.state?.root?.children)
      ? project.state.root.children
      : Array.isArray(project?.root?.children)
        ? project.root.children
        : Array.isArray(project?.children)
          ? project.children
          : [];
  const used = options.usedIds instanceof Set ? options.usedIds : new Set();
  const id = String(options.id || '').trim() || uniqueId(used, options);
  const now = Date.now();
  const revision = Math.max(1, Math.trunc(finite(options.revision, 1)));
  const snapshot = {
    id,
    name: String(options.name || project?.name || '未命名实例').trim() || '未命名实例',
    sourcePresetId: String(options.sourcePresetId || project?.id || '').trim(),
    sourcePresetRevision: String(options.sourcePresetRevision || project?.updatedAt || '').trim(),
    origin: point(options.origin || project?.origin),
    variables: options.variables && typeof options.variables === 'object'
      ? deepClone(options.variables)
      : (project?.variables && typeof project.variables === 'object' ? deepClone(project.variables) : null),
    staticOverrides: options.staticOverrides && typeof options.staticOverrides === 'object'
      ? deepClone(options.staticOverrides)
      : null,
    privateConstants: options.privateConstants && typeof options.privateConstants === 'object'
      ? deepClone(options.privateConstants)
      : {},
    children: deepClone(children),
    revision,
    createdAt: Math.trunc(finite(options.createdAt, now)),
    updatedAt: Math.trunc(finite(options.updatedAt, now))
  };
  snapshot.source = {
    root: {
      id: 'root',
      kind: 'ROOT',
      children: deepClone(snapshot.children)
    }
  };
  return snapshot;
}

export function createBuilderSnapshotStore(raw = {}) {
  return {
    version: BUILDER_REFERENCE_SCHEMA_VERSION,
    items: Object.values(normalizeBuilderSnapshots(raw))
  };
}

export function resolveBuilderReferenceSnapshot(project, node, options = {}) {
  const snapshots = options.snapshots
    || project?.state?.builderSnapshots
    || project?.builderSnapshots
    || project?.snapshots;
  const id = String(node?.params?.snapshotId || options.snapshotId || '').trim();
  if (!id) return null;
  return normalizeBuilderSnapshots(snapshots, options)[id] || null;
}

export function findBuilderSnapshotForPreset(snapshots, presetId) {
  const id = String(presetId || '').trim();
  if (!id) return null;
  return Object.values(normalizeBuilderSnapshots(snapshots)).find((item) => item.sourcePresetId === id) || null;
}

export function createBuilderReferenceNode(snapshot, init = {}, options = {}) {
  const snapshotId = String(init.snapshotId || snapshot?.id || '').trim();
  if (!snapshotId) return null;
  const node = createNodeByKind(BUILDER_REFERENCE_KIND, {
    id: init.id || undefined,
    collapsed: init.collapsed,
    folded: init.folded,
    params: {
      snapshotId,
      parameterId: String(init.parameterId || '').trim(),
      instanceMode: init.instanceMode === 'construct' ? 'construct' : 'static',
      ox: finite(init.ox),
      oy: finite(init.oy),
      oz: finite(init.oz),
      scale: finite(init.scale, 1),
      rotationDeg: finite(init.rotationDeg),
      rotationAxisX: finite(init.rotationAxisX),
      rotationAxisY: finite(init.rotationAxisY, 1),
      rotationAxisZ: finite(init.rotationAxisZ),
      overrides: init.overrides && typeof init.overrides === 'object'
        ? deepClone(init.overrides)
        : (snapshot?.staticOverrides && typeof snapshot.staticOverrides === 'object' ? deepClone(snapshot.staticOverrides) : {}),
      ...deepClone(init.params || {})
    }
  });
  node.params.parameterId = builderReferenceParameterId(node, snapshotId);
  node.label = init.label || snapshot?.name || '实例';
  node.children = [];
  return node;
}

export function createEffectRingNode(init = {}, options = {}) {
  const node = createNodeByKind(EFFECT_RING_KIND, {
    id: init.id,
    collapsed: init.collapsed,
    folded: init.folded,
    params: {
      snapshotIds: Array.isArray(init.snapshotIds) ? init.snapshotIds.map(String) : [],
      count: Math.max(1, Math.trunc(finite(init.count, 12))),
      radius: finite(init.radius, 3),
      startDeg: finite(init.startDeg),
      originX: finite(init.originX),
      originY: finite(init.originY),
      originZ: finite(init.originZ),
      axisX: finite(init.axisX),
      axisY: finite(init.axisY),
      axisZ: finite(init.axisZ, 1),
      offsetX: finite(init.offsetX),
      offsetY: finite(init.offsetY),
      offsetZ: finite(init.offsetZ),
      faceCenter: init.faceCenter !== false,
      reverse: init.reverse === true,
      ...deepClone(init.params || {})
    }
  });
  node.label = init.label || '环形阵列实例';
  node.children = [];
  return node;
}

export function materializeBuilderReferences(nodes, snapshots, options = {}) {
  const source = Array.isArray(nodes) ? nodes : [];
  const snapshotMap = normalizeBuilderSnapshots(snapshots, options);
  const used = options.usedIds instanceof Set ? options.usedIds : new Set();
  const stack = options.stack instanceof Set ? options.stack : new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (node.kind === BUILDER_REFERENCE_KIND) {
      const snapshotId = String(node.params?.snapshotId || '');
      const snapshot = snapshotMap[snapshotId];
      if (!snapshot) {
        if (options.strict === false) return cloneNodeDeep(node);
        throw new Error(`Missing builder snapshot: ${snapshotId || '<empty>'}`);
      }
      if (stack.has(snapshotId)) throw new Error(`Circular builder reference: ${snapshotId}`);
      stack.add(snapshotId);
      const wrapper = createNodeByKind('add_builder', {
        params: {
          ox: finite(node.params?.ox),
          oy: finite(node.params?.oy),
          oz: finite(node.params?.oz)
        }
      });
      wrapper.label = node.label || snapshot.name;
      wrapper.children = applyBuilderReferenceOverrides(snapshot.children || [], snapshot, node)
        .map(visit)
        .filter(Boolean);
      if (Math.abs(finite(node.params?.rotationDeg)) > 1e-9) {
        wrapper.children.push(createNodeByKind('rotate_as_axis', {
          params: {
            deg: finite(node.params.rotationDeg),
            degUnit: 'deg',
            useCustomAxis: true,
            ax: finite(node.params.rotationAxisX),
            ay: finite(node.params.rotationAxisY, 1),
            az: finite(node.params.rotationAxisZ)
          }
        }));
      }
      stack.delete(snapshotId);
      return wrapper;
    }
    const cloned = deepClone(node);
    if (Array.isArray(cloned.children)) cloned.children = cloned.children.map(visit).filter(Boolean);
    return cloned;
  };
  const result = source.map(visit).filter(Boolean);
  if (options.reassignIds !== false) {
    const remap = (node) => {
      node.id = uniqueId(used, options);
      if (Array.isArray(node.terms)) node.terms.forEach((term) => { term.id = uniqueId(used, options); });
      if (Array.isArray(node.children)) node.children.forEach(remap);
    };
    result.forEach(remap);
  }
  return result;
}

export function flattenBuilderReferencesForPreset(nodes, snapshots, options = {}) {
  return materializeBuilderReferences(nodes, snapshots, { ...options, reassignIds: false });
}

export function expandBuilderReferences(project, options = {}) {
  const nodes = Array.isArray(project)
    ? project
    : project?.state?.root?.children || project?.root?.children || project?.nodes || [];
  const snapshots = options.snapshots
    || project?.state?.builderSnapshots
    || project?.builderSnapshots
    || project?.snapshots;
  return materializeBuilderReferences(nodes, snapshots, options);
}

export function saveBuilderPresetWithSnapshot(project, options = {}) {
  const snapshot = createBuilderSnapshot(project, options);
  const snapshots = normalizeBuilderSnapshots(
    options.snapshots || project?.state?.builderSnapshots || project?.builderSnapshots
  );
  snapshots[snapshot.id] = snapshot;
  const expandedChildren = expandBuilderReferences(project, { snapshots, strict: options.strict });
  return {
    ...deepClone(project || {}),
    id: options.presetId || project?.id || snapshot.id,
    name: options.name || project?.name || snapshot.name,
    children: expandedChildren,
    state: {
      ...(deepClone(project?.state) || {}),
      root: {
        id: 'root',
        kind: 'ROOT',
        children: expandedChildren
      }
    },
    snapshot,
    builderSnapshots: snapshots
  };
}

export function builderReferenceCacheKey(snapshot, node, options = {}) {
  const params = node?.params || {};
  const overrides = getBuilderReferenceOverrideValues(snapshot, node);
  return JSON.stringify({
    version: options.version || 1,
    snapshotId: snapshot?.id || params.snapshotId || '',
    revision: snapshot?.revision || 0,
    instanceMode: builderReferenceInstanceMode(node),
    overrides,
    rotationDeg: finite(params.rotationDeg),
    rotationAxis: [finite(params.rotationAxisX), finite(params.rotationAxisY, 1), finite(params.rotationAxisZ)],
    scale: finite(params.scale, 1)
  });
}

export function getBuilderSnapshotRevision(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '0';
  return `${Math.max(1, Math.trunc(finite(snapshot.revision, 1)))}:${String(snapshot.updatedAt || '')}`;
}

export function invalidateBuilderSnapshotCache(projectOrStore, snapshotId = '') {
  const external = projectOrStore instanceof Map
    ? projectOrStore
    : projectOrStore?.referenceCache instanceof Map
      ? projectOrStore.referenceCache
      : null;
  const cache = external || BUILDER_SNAPSHOT_CACHE;
  const id = String(snapshotId || '').trim();
  if (!id) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (String(key).includes(`"snapshotId":"${id}"`)) cache.delete(key);
  }
}

export function kotlinPrivateParameterConstantName(snapshotId) {
  const safe = String(snapshotId || 'snapshot').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
  return `BUILDER_SNAPSHOT_${safe}_PARAM_ID`;
}
