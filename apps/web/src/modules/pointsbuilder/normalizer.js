import { deepClone } from '../../utils/clone.js';
import { createPointsBuilderBaseProject } from './schema.js';
import { POINTS_NODE_KINDS } from './kinds.js';
import { createFourierTerm, createNodeByKind, isBuilderContainerKind } from './node-helpers.js';

const KIND_ALIASES = {
  point: 'add_point',
  line: 'add_line',
  circle: 'add_circle',
  with_builder: 'add_builder'
};

function normalizeLegacyVecParams(params, prefix, objectKey = null) {
  if (!params || typeof params !== 'object') return;
  const px = `${prefix}x`;
  const py = `${prefix}y`;
  const pz = `${prefix}z`;
  if (params[px] !== undefined || params[py] !== undefined || params[pz] !== undefined) return;

  const key = objectKey || prefix;
  const raw = params[key];
  if (!raw) return;

  if (Array.isArray(raw)) {
    if (raw[0] !== undefined) params[px] = raw[0];
    if (raw[1] !== undefined) params[py] = raw[1];
    if (raw[2] !== undefined) params[pz] = raw[2];
    return;
  }

  if (typeof raw === 'object') {
    if (raw.x !== undefined) params[px] = raw.x;
    if (raw.y !== undefined) params[py] = raw.y;
    if (raw.z !== undefined) params[pz] = raw.z;
  }
}


function normalizeKind(kind) {
  const next = KIND_ALIASES[kind] || kind;
  return String(next || 'add_point');
}

function normalizeUnknownNode(rawNode, kind) {
  const source = rawNode && typeof rawNode === 'object' ? deepClone(rawNode) : {};
  const fallbackId = createNodeByKind('add_point').id;
  return {
    ...source,
    id: String(source.id || fallbackId),
    kind,
    params: source.params && typeof source.params === 'object' && !Array.isArray(source.params)
      ? source.params
      : {},
    children: Array.isArray(source.children)
      ? source.children.map((child) => normalizeNode(child))
      : [],
    terms: Array.isArray(source.terms) ? source.terms : []
  };
}

function collectParams(rawNode, definition) {
  const params = {
    ...deepClone(definition.defaultParams || {}),
    ...(typeof rawNode?.params === 'object' && rawNode.params ? deepClone(rawNode.params) : {})
  };

  (definition.fields || []).forEach((field) => {
    if (params[field.key] === undefined && rawNode?.[field.key] !== undefined) {
      params[field.key] = rawNode[field.key];
    }
  });
  return params;
}

function normalizeNodeParams(kind, params, rawNode = {}) {
  const rawParams = rawNode?.params && typeof rawNode.params === 'object' ? rawNode.params : {};
  const rawValue = (key) => rawParams[key] ?? rawNode?.[key];
  const hasRawValue = (key) => rawParams[key] !== undefined || rawNode?.[key] !== undefined;

  if (kind === 'add_builder') {
    if (params.ox === undefined) params.ox = 0;
    if (params.oy === undefined) params.oy = 0;
    if (params.oz === undefined) params.oz = 0;
  }

  switch (kind) {
    case 'add_bezier':
      normalizeLegacyVecParams(params, 'p1');
      normalizeLegacyVecParams(params, 'p2');
      normalizeLegacyVecParams(params, 'p3');
      if (params.count === undefined && params.counts !== undefined) params.count = params.counts;
      break;
    case 'add_bezier_4':
      normalizeLegacyVecParams(params, 'p1');
      normalizeLegacyVecParams(params, 'p2');
      normalizeLegacyVecParams(params, 'p3');
      normalizeLegacyVecParams(params, 'p4');
      if (params.count === undefined && params.counts !== undefined) params.count = params.counts;
      break;
    case 'add_bezier_curve':
      if (params.sx === undefined) params.sx = 0;
      if (params.sy === undefined) params.sy = 0;
      if (params.sz === undefined) params.sz = 0;
      if (params.ex === undefined && params.tx !== undefined) params.ex = params.tx;
      if (params.ey === undefined && params.ty !== undefined) params.ey = params.ty;
      if (params.ez === undefined && params.tz !== undefined) params.ez = params.tz;
      if (params.ex === undefined && params.target && typeof params.target === 'object') params.ex = params.target.x ?? params.target[0] ?? 0;
      if (params.ey === undefined && params.target && typeof params.target === 'object') params.ey = params.target.y ?? params.target[1] ?? 0;
      if (params.ez === undefined && params.target && typeof params.target === 'object') params.ez = params.target.z ?? params.target[2] ?? 0;
      if (params.shx === undefined && params.startHandle && typeof params.startHandle === 'object') params.shx = params.startHandle.x ?? params.startHandle[0] ?? 0;
      if (params.shy === undefined && params.startHandle && typeof params.startHandle === 'object') params.shy = params.startHandle.y ?? params.startHandle[1] ?? 0;
      if (params.shz === undefined && params.startHandle && typeof params.startHandle === 'object') params.shz = params.startHandle.z ?? params.startHandle[2] ?? 0;
      if (params.ehx === undefined && params.endHandle && typeof params.endHandle === 'object') params.ehx = params.endHandle.x ?? params.endHandle[0] ?? 0;
      if (params.ehy === undefined && params.endHandle && typeof params.endHandle === 'object') params.ehy = params.endHandle.y ?? params.endHandle[1] ?? 0;
      if (params.ehz === undefined && params.endHandle && typeof params.endHandle === 'object') params.ehz = params.endHandle.z ?? params.endHandle[2] ?? 0;
      break;
        case 'add_bezier_curve_multi':
        case 'apply_bezier_distribution':
      if (!Array.isArray(params.nodes)) params.nodes = [];
      params.nodes = params.nodes.map((node) => ({
        x: node?.x ?? node?.point?.x ?? 0,
        y: node?.y ?? node?.point?.y ?? 0,
        z: node?.z ?? node?.point?.z ?? 0,
        shx: node?.shx ?? node?.startHandle?.x ?? 0,
        shy: node?.shy ?? node?.startHandle?.y ?? 0,
        shz: node?.shz ?? node?.startHandle?.z ?? 0,
        ehx: node?.ehx ?? node?.endHandle?.x ?? 0,
        ehy: node?.ehy ?? node?.endHandle?.y ?? 0,
        ehz: node?.ehz ?? node?.endHandle?.z ?? 0
      }));
            if (params.count === undefined) params.count = 16;
            break;
        case 'add_bezier_circle_preset':
            if (params.count === undefined) params.count = 96;
            if (!Array.isArray(params.nodes)) params.nodes = [];
            break;
    case 'add_polygon':
      if (params.count === undefined && params.edgeCount !== undefined) params.count = params.edgeCount;
      if (params.sideCount === undefined && params.n !== undefined) params.sideCount = params.n;
      break;
    case 'add_polygon_in_circle':
      if (params.edgeCount === undefined && params.count !== undefined) params.edgeCount = params.count;
      if (params.n === undefined && params.sideCount !== undefined) params.n = params.sideCount;
      break;
    case 'add_ball':
      if (!hasRawValue('countPow') && hasRawValue('count')) params.countPow = rawValue('count');
      break;
    case 'add_cube_surface':
      if (!hasRawValue('sizeMode')) {
        params.sizeMode = hasRawValue('width') || hasRawValue('height') || hasRawValue('depth')
          ? 'dimensions'
          : 'uniform';
      }
      break;
    case 'add_round_shape':
      if (!hasRawValue('preCircleCount') && hasRawValue('circleCount')) params.preCircleCount = rawValue('circleCount');
      if (!hasRawValue('minCircleCount') && hasRawValue('minCount')) params.minCircleCount = rawValue('minCount');
      if (!hasRawValue('maxCircleCount') && hasRawValue('maxCount')) params.maxCircleCount = rawValue('maxCount');
      break;
    case 'add_lightning_points':
    case 'add_lightning_nodes':
    case 'add_lightning_nodes_attenuation':
      normalizeLegacyVecParams(params, 's', 'start');
      normalizeLegacyVecParams(params, 'e', 'end');
      if (params.useStart === undefined && (params.start || params.sx !== undefined || params.sy !== undefined || params.sz !== undefined)) {
        params.useStart = true;
      }
      if (params.useOffsetRange === undefined && params.offsetRange !== undefined) {
        params.useOffsetRange = true;
      }
      break;
    default:
      break;
  }
}

export function normalizeNode(rawNode) {
  const kind = normalizeKind(rawNode?.kind);
  const definition = POINTS_NODE_KINDS[kind];
  if (!definition) return normalizeUnknownNode(rawNode, kind);
  const params = collectParams(rawNode, definition);
  normalizeNodeParams(kind, params, rawNode);

  const node = {
    ...deepClone(rawNode || {}),
    ...createNodeByKind(kind, {
      id: rawNode?.id,
      collapsed: rawNode?.collapsed,
      folded: rawNode?.folded,
      bodyHeight: rawNode?.bodyHeight,
      subWidth: rawNode?.subWidth,
      subHeight: rawNode?.subHeight,
      params
    })
  };

  node.children = isBuilderContainerKind(kind)
    ? (Array.isArray(rawNode?.children) ? rawNode.children.map((child) => normalizeNode(child)) : [])
    : [];

  node.terms = kind === 'add_fourier_series'
    ? (Array.isArray(rawNode?.terms) && rawNode.terms.length
        ? rawNode.terms.map((term) => createFourierTerm(term))
        : node.terms)
    : [];

  return node;
}

export function normalizePointsBuilderProject(source, tool = 'pointsbuilder') {
  const base = createPointsBuilderBaseProject(tool);
  const raw = source && typeof source === 'object' ? deepClone(source) : {};
  const hasExplicitNodeList = (
    Array.isArray(raw?.state?.root?.children)
    || Array.isArray(raw?.root?.children)
    || Array.isArray(raw?.nodes)
  );
  const rawState = raw?.state?.root && Array.isArray(raw.state.root.children)
    ? raw.state
    : raw?.root && Array.isArray(raw.root.children)
      ? raw
      : {};
  const rawNodes = Array.isArray(rawState?.root?.children)
    ? rawState.root.children
    : Array.isArray(raw?.nodes)
      ? raw.nodes
      : [];

  const normalized = {
    id: raw.id || base.id,
    tool: raw.tool || tool,
    schemaVersion: base.schemaVersion,
    name: raw.name || base.name,
    description: raw.description || base.description,
    kotlinEndMode: raw.kotlinEndMode || base.kotlinEndMode,
    settings: {
      ...base.settings,
      ...(typeof raw.settings === 'object' && raw.settings ? raw.settings : {})
    },
    state: {
      ...rawState,
      root: {
        id: 'root',
        kind: 'ROOT',
        children: rawNodes.map((node) => normalizeNode(node))
      },
      selection: {
        ...(typeof rawState.selection === 'object' && rawState.selection ? rawState.selection : {}),
        focusedNodeId: rawState?.selection?.focusedNodeId || raw.selectedNodeId || ''
      }
    }
  };

  if (!normalized.state.root.children.length && !hasExplicitNodeList) {
    normalized.state.root.children.push(createNodeByKind('add_circle'));
  }

  const existing = normalized.state.root.children.some((node) => node.id === normalized.state.selection.focusedNodeId);
  if (!existing) {
    normalized.state.selection.focusedNodeId = normalized.state.root.children[0]?.id || '';
  }

  return normalized;
}
