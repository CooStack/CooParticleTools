import { deepClone } from '../../utils/clone.js';
import { makeId } from '../../utils/id.js';
import { POINTS_NODE_KINDS, BUILDER_CONTAINER_KINDS } from './kinds.js';

function fallbackKind(kind) {
  return POINTS_NODE_KINDS[kind] ? kind : 'add_point';
}

export function isBuilderContainerKind(kind) {
  return BUILDER_CONTAINER_KINDS.has(kind);
}

export function createFourierTerm(init = {}) {
  return {
    id: makeId('fourierTerm'),
    r: 1,
    w: 1,
    startAngle: 0,
    startAngleUnit: 'deg',
    collapsed: false,
    ...deepClone(init)
  };
}

export function createNodeByKind(kind = 'add_point', init = {}) {
  const normalizedKind = fallbackKind(kind);
  const definition = POINTS_NODE_KINDS[normalizedKind] || POINTS_NODE_KINDS.add_point;
  const params = {
    ...deepClone(definition.defaultParams || {}),
    ...deepClone(init.params || {})
  };
  const node = {
    id: init.id || makeId('pointNode'),
    kind: normalizedKind,
    folded: Boolean(init.folded),
    collapsed: Boolean(init.collapsed),
    bodyHeight: init.bodyHeight ?? null,
    subWidth: init.subWidth ?? null,
    subHeight: init.subHeight ?? null,
    params,
    children: Array.isArray(init.children) ? deepClone(init.children) : [],
    terms: Array.isArray(init.terms) ? deepClone(init.terms) : []
  };

  if (normalizedKind === 'add_fourier_series' && !node.terms.length) {
    node.terms.push(createFourierTerm());
  }
  return node;
}

export function cloneNodeDeep(node) {
  const cloned = deepClone(node || {});
  const remap = (current) => {
    current.id = makeId('pointNode');
    if (Array.isArray(current.terms)) {
      current.terms = current.terms.map((term) => ({
        ...term,
        id: makeId('fourierTerm')
      }));
    }
    if (Array.isArray(current.children)) {
      current.children.forEach(remap);
    }
  };
  remap(cloned);
  return cloned;
}

export function cloneNodeListDeep(list = []) {
  return list.map((node) => cloneNodeDeep(node));
}

export function replaceListContents(listRef, newItems) {
  if (!Array.isArray(listRef)) return;
  listRef.splice(0, listRef.length, ...(newItems || []));
}

export function mirrorPointByPlane(point, planeKey = 'XZ') {
  if (planeKey === 'XY') return { x: point.x, y: point.y, z: -point.z };
  if (planeKey === 'ZY') return { x: -point.x, y: point.y, z: point.z };
  return { x: point.x, y: -point.y, z: point.z };
}

export function mirrorCopyNode(node, planeKey = 'XZ') {
  if (!node || !node.kind) return null;
  const cloned = cloneNodeDeep(node);
  const params = cloned.params || (cloned.params = {});

  if (cloned.kind === 'add_line') {
    const start = mirrorPointByPlane({ x: params.sx, y: params.sy, z: params.sz }, planeKey);
    const end = mirrorPointByPlane({ x: params.ex, y: params.ey, z: params.ez }, planeKey);
    Object.assign(params, { sx: start.x, sy: start.y, sz: start.z, ex: end.x, ey: end.y, ez: end.z });
    return cloned;
  }

  if (cloned.kind === 'add_fill_triangle') {
    ['p1', 'p2', 'p3'].forEach((prefix) => {
      const next = mirrorPointByPlane({ x: params[`${prefix}x`], y: params[`${prefix}y`], z: params[`${prefix}z`] }, planeKey);
      params[`${prefix}x`] = next.x;
      params[`${prefix}y`] = next.y;
      params[`${prefix}z`] = next.z;
    });
    return cloned;
  }

  if (cloned.kind === 'points_on_each_offset') {
    const next = mirrorPointByPlane({ x: params.offX, y: params.offY, z: params.offZ }, planeKey);
    Object.assign(params, { offX: next.x, offY: next.y, offZ: next.z });
    return cloned;
  }

  return cloned;
}

export function visitNodes(list = [], visitor) {
  list.forEach((node) => {
    if (!node) return;
    visitor(node);
    if (Array.isArray(node.children) && node.children.length) {
      visitNodes(node.children, visitor);
    }
  });
}

export function findNodeContext(list = [], nodeId, parentNode = null) {
  for (let index = 0; index < list.length; index += 1) {
    const node = list[index];
    if (!node) continue;
    if (node.id === nodeId) {
      return {
        node,
        list,
        index,
        parentNode
      };
    }
    if (Array.isArray(node.children) && node.children.length) {
      const nested = findNodeContext(node.children, nodeId, node);
      if (nested) return nested;
    }
  }
  return null;
}

export function findNodeById(list = [], nodeId) {
  return findNodeContext(list, nodeId)?.node || null;
}

export function removeNodeById(list = [], nodeId) {
  const context = findNodeContext(list, nodeId);
  if (!context) return false;
  context.list.splice(context.index, 1);
  return true;
}

export function getProjectNodes(project) {
  return Array.isArray(project?.state?.root?.children)
    ? project.state.root.children
    : Array.isArray(project?.nodes)
      ? project.nodes
      : [];
}

export function getFirstNodeId(project) {
  return getProjectNodes(project)[0]?.id || '';
}
