import {
  v,
  clone,
  add,
  num,
  int,
  fmt,
  fmtDouble,
  fmtFloat,
  relExpr,
  getPolygonInCircleVertices,
  rotatePointsToPointUpright,
  generateEquidistantBezierCurveNodes
} from './geometry.js';
import { POINTS_NODE_KINDS, BUILDER_CONTAINER_KINDS } from './kinds.js';
import { getProjectNodes } from './node-helpers.js';
import {
  BUILDER_REFERENCE_KIND,
  EFFECT_RING_KIND,
  applyBuilderReferenceOverrides,
  builderReferenceCacheKey,
  builderReferenceInstanceMode,
  builderReferenceParameterId,
  getBuilderReferenceOverrideValues,
  getBuilderSnapshotVariableEntries,
  kotlinPrivateParameterConstantName,
  normalizeBuilderSnapshots
} from './references.js';

function clonePointWithOffset(point, offset = v(0, 0, 0)) {
  return {
    ...point,
    x: num(point?.x) + num(offset?.x),
    y: num(point?.y) + num(offset?.y),
    z: num(point?.z) + num(offset?.z)
  };
}

function buildPointOwnerByIndex(totalCount, segments) {
  const owners = new Array(totalCount || 0);
  if (!(segments instanceof Map)) return owners;
  for (const [id, segment] of segments.entries()) {
    if (!segment) continue;
    const start = Math.max(0, segment.start | 0);
    const end = Math.min(owners.length, segment.end | 0);
    for (let index = start; index < end; index += 1) owners[index] = id;
  }
  return owners;
}

function evaluateAddBuilder(node, evaluateChildren) {
  const child = evaluateChildren(node.children || []);
  const offset = v(num(node.params?.ox), num(node.params?.oy), num(node.params?.oz));
  return {
    points: (child.points || []).map((point) => clonePointWithOffset(point, offset)),
    previewPoints: Array.isArray(child.previewPoints)
      ? child.previewPoints.map((point) => clonePointWithOffset(point, offset))
      : [],
    segments: child.segments instanceof Map ? child.segments : new Map()
  };
}

function evaluateAddWith(node, evaluateChildren) {
  const child = evaluateChildren(node.children || []);
  const childPoints = Array.isArray(child.points) ? child.points : [];
  const offset = v(num(node.params?.ox), num(node.params?.oy), num(node.params?.oz));
  const radius = num(node.params?.r, 3);
  const count = Math.max(1, int(node.params?.c, 6));
  const rotateToCenter = Boolean(node.params?.rotateToCenter);
  const rotateReverse = Boolean(node.params?.rotateReverse);
  const rotateOffsetEnabled = Boolean(node.params?.rotateOffsetEnabled);
  const rotateOffset = v(num(node.params?.rox), num(node.params?.roy), num(node.params?.roz));
  const vertices = getPolygonInCircleVertices(count, radius) || [];
  const points = [];
  const previewPoints = [];

  if (node.params?.previewBeforeOffsetEnabled && childPoints.length) {
    const previewOwners = buildPointOwnerByIndex(childPoints.length, child.segments);
    for (let index = 0; index < childPoints.length; index += 1) {
      const point = childPoints[index];
      previewPoints.push({
        x: num(point?.x) + offset.x,
        y: num(point?.y) + offset.y,
        z: num(point?.z) + offset.z,
        nodeId: previewOwners[index] || null,
        previewParentId: node.id || null,
        previewSource: 'add_with'
      });
    }
  }

  for (const vertex of vertices) {
    let repeatedPoints = childPoints.map((point) => clone(point));
    if (rotateToCenter && repeatedPoints.length) {
      const targetPoint = rotateOffsetEnabled ? rotateOffset : v(0, 0, 0);
      const rotateTarget = rotateReverse
        ? add(targetPoint, vertex)
        : v(targetPoint.x - vertex.x, targetPoint.y - vertex.y, targetPoint.z - vertex.z);
      repeatedPoints = rotatePointsToPointUpright(repeatedPoints, rotateTarget, child.axis || v(0, 1, 0));
    }
    for (const point of repeatedPoints) {
      points.push({
        x: num(point?.x) + num(vertex?.x) + offset.x,
        y: num(point?.y) + num(vertex?.y) + offset.y,
        z: num(point?.z) + num(vertex?.z) + offset.z
      });
    }
  }

  return {
    points,
    previewPoints,
    segments: new Map()
  };
}

function applyReferenceTransform(points, node) {
  const params = node?.params || {};
  const offset = v(num(params.ox), num(params.oy), num(params.oz));
  const scale = num(params.scale, 1);
  const angle = num(params.rotationDeg) * Math.PI / 180;
  const axis = v(num(params.rotationAxisX), num(params.rotationAxisY, 1), num(params.rotationAxisZ));
  const length = Math.hypot(axis.x, axis.y, axis.z);
  const unit = length > 1e-9 ? v(axis.x / length, axis.y / length, axis.z / length) : v(0, 1, 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (points || []).map((source) => {
    const base = clonePointWithOffset(source, v(0, 0, 0));
    const point = scale > 0 ? v(base.x * scale, base.y * scale, base.z * scale) : base;
    const dot = point.x * unit.x + point.y * unit.y + point.z * unit.z;
    const crossX = unit.y * point.z - unit.z * point.y;
    const crossY = unit.z * point.x - unit.x * point.z;
    const crossZ = unit.x * point.y - unit.y * point.x;
    return {
      ...point,
      x: point.x * cos + crossX * sin + unit.x * dot * (1 - cos) + offset.x,
      y: point.y * cos + crossY * sin + unit.y * dot * (1 - cos) + offset.y,
      z: point.z * cos + crossZ * sin + unit.z * dot * (1 - cos) + offset.z
    };
  });
}

function evaluateEffectRing(node, resolveSnapshot) {
  const params = node?.params || {};
  const ids = Array.isArray(params.snapshotIds) ? params.snapshotIds : [];
  const count = Math.max(1, int(params.count, 12));
  const radius = num(params.radius, 3);
  const start = num(params.startDeg) * Math.PI / 180;
  const origin = v(num(params.originX), num(params.originY), num(params.originZ));
  const offset = v(num(params.offsetX), num(params.offsetY), num(params.offsetZ));
  const rawAxis = v(num(params.axisX), num(params.axisY), num(params.axisZ, 1));
  const axisLength = Math.hypot(rawAxis.x, rawAxis.y, rawAxis.z);
  const normal = axisLength > 1e-9 ? v(rawAxis.x / axisLength, rawAxis.y / axisLength, rawAxis.z / axisLength) : v(0, 0, 1);
  const reference = Math.abs(normal.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  const basisU0 = v(
    reference.y * normal.z - reference.z * normal.y,
    reference.z * normal.x - reference.x * normal.z,
    reference.x * normal.y - reference.y * normal.x
  );
  const basisULength = Math.hypot(basisU0.x, basisU0.y, basisU0.z);
  const basisU = basisULength > 1e-9 ? v(basisU0.x / basisULength, basisU0.y / basisULength, basisU0.z / basisULength) : v(1, 0, 0);
  const basisV = v(
    normal.y * basisU.z - normal.z * basisU.y,
    normal.z * basisU.x - normal.x * basisU.z,
    normal.x * basisU.y - normal.y * basisU.x
  );
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const snapshotId = ids.length ? ids[index % ids.length] : '';
    const base = resolveSnapshot(snapshotId);
    const angle = start + (Math.PI * 2 * index / count);
    const radial = v(
      basisU.x * Math.cos(angle) * radius + basisV.x * Math.sin(angle) * radius,
      basisU.y * Math.cos(angle) * radius + basisV.y * Math.sin(angle) * radius,
      basisU.z * Math.cos(angle) * radius + basisV.z * Math.sin(angle) * radius
    );
    const center = v(origin.x + radial.x + offset.x, origin.y + radial.y + offset.y, origin.z + radial.z + offset.z);
    const source = base?.points || [];
    let oriented = source.map((point) => ({ ...point }));
    if (params.faceCenter) {
      const target = params.reverse ? radial : v(-radial.x, -radial.y, -radial.z);
      oriented = rotatePointsToPointUpright(oriented, target, base?.axis || v(0, 1, 0));
    }
    for (const point of oriented) {
      points.push(clonePointWithOffset(point, center));
    }
  }
  return points;
}

function closeBezierNodes(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (list.length < 2) return list;
  const first = list[0];
  const last = list[list.length - 1];
  if (num(first?.x) === num(last?.x) && num(first?.y) === num(last?.y) && num(first?.z) === num(last?.z)) return list;
  return [...list, { ...first }];
}

function evaluateBezierDistribution(node, evaluateChildren) {
  const child = evaluateChildren(node.children || []);
  const sourceNodes = node.params?.closed ? closeBezierNodes(node.params?.nodes) : node.params?.nodes;
  const path = generateEquidistantBezierCurveNodes(sourceNodes || [], Math.max(1, int(node.params?.count, 16)));
  const source = Array.isArray(child.points) ? child.points : [];
  const points = [];
  for (const pathPoint of path) {
    for (const sourcePoint of source) {
      points.push(clonePointWithOffset(sourcePoint, pathPoint));
    }
  }
  return { points, previewPoints: [], segments: new Map() };
}

function applyPointMask(targetPoints, maskPoints, maskRange) {
  const range = Math.max(0, num(maskRange));
  if (!range || !targetPoints.length || !maskPoints.length) return targetPoints;
  const rangeSquared = range * range;
  const inverseRange = 1 / range;
  const buckets = new Map();
  const cellKey = (x, y, z) => `${x}:${y}:${z}`;

  for (const maskPoint of maskPoints) {
    const x = Math.floor(num(maskPoint?.x) * inverseRange);
    const y = Math.floor(num(maskPoint?.y) * inverseRange);
    const z = Math.floor(num(maskPoint?.z) * inverseRange);
    const key = cellKey(x, y, z);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(maskPoint);
    else buckets.set(key, [maskPoint]);
  }

  return targetPoints.filter((point) => {
    const pointX = num(point?.x);
    const pointY = num(point?.y);
    const pointZ = num(point?.z);
    const cellX = Math.floor(pointX * inverseRange);
    const cellY = Math.floor(pointY * inverseRange);
    const cellZ = Math.floor(pointZ * inverseRange);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = buckets.get(cellKey(cellX + dx, cellY + dy, cellZ + dz));
          if (!bucket) continue;
          for (const maskPoint of bucket) {
            const offsetX = pointX - num(maskPoint?.x);
            const offsetY = pointY - num(maskPoint?.y);
            const offsetZ = pointZ - num(maskPoint?.z);
            if (offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ < rangeSquared) return false;
          }
        }
      }
    }
    return true;
  });
}

function indentText(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return String(text || '').split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function registerReferenceParameterConstant(node, emitCtx) {
  const parameterId = builderReferenceParameterId(node, node?.params?.snapshotId || node?.id);
  const constantName = kotlinPrivateParameterConstantName(parameterId);
  if (!emitCtx.constants) emitCtx.constants = new Map();
  emitCtx.constants.set(constantName, `private const val ${constantName} = ${JSON.stringify(parameterId)}`);
}

function registerSnapshotPrivateConstants(snapshot, emitCtx) {
  if (!emitCtx.constants) emitCtx.constants = new Map();
  const prefix = kotlinPrivateParameterConstantName(snapshot?.id || 'snapshot');
  for (const [key, value] of Object.entries(snapshot?.privateConstants || {})) {
    if ((typeof value !== 'string' && typeof value !== 'number') || !String(key || '').trim()) continue;
    const safeKey = String(key).replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
    const name = `${prefix}_${safeKey}`;
    const rendered = typeof value === 'number' && Number.isFinite(value)
      ? fmtDouble(value)
      : JSON.stringify(String(value));
    emitCtx.constants.set(name, `private const val ${name} = ${rendered}`);
  }
}

function registerSnapshotTemplate(snapshot, referenceNode, emitCtx, emitNodesKotlinLines) {
  const mode = builderReferenceInstanceMode(referenceNode);
  const key = `${mode}:${snapshot.id}`;
  if (!emitCtx.referenceTemplates) emitCtx.referenceTemplates = new Map();
  if (!emitCtx.referenceStack) emitCtx.referenceStack = new Set();
  if (emitCtx.referenceStack.has(key)) throw new Error(`Circular builder reference: ${snapshot.id}`);
  const existing = emitCtx.referenceTemplates.get(key);
  if (existing) return existing;

  const safeId = String(snapshot.id || 'snapshot').replace(/[^A-Za-z0-9_]/g, '_');
  const name = `builderInstance_${safeId}`;
  emitCtx.referenceStack.add(key);
  registerSnapshotPrivateConstants(snapshot, emitCtx);

  const childContext = {
    ...emitCtx,
    decls: []
  };
  const entries = getBuilderSnapshotVariableEntries(snapshot);
  const syntheticOverrides = {
    scalar: {},
    vector: {},
    modes: { scalar: {}, vector: {} },
    refs: { scalar: {}, vector: {} }
  };
  for (const entry of entries) {
    if (entry.type === 'vector') {
      syntheticOverrides.vector[entry.name] = {
        x: `${entry.name}X`,
        y: `${entry.name}Y`,
        z: `${entry.name}Z`
      };
    } else {
      syntheticOverrides.scalar[entry.name] = entry.name;
    }
  }
  const children = mode === 'construct'
    ? applyBuilderReferenceOverrides(snapshot.children || [], snapshot, {
        params: { instanceMode: 'construct', overrides: syntheticOverrides }
      })
    : applyBuilderReferenceOverrides(snapshot.children || [], snapshot, referenceNode, {
        freezeReferences: true,
        resolveReference: emitCtx.resolveStaticReference
      });
  if (typeof emitCtx.coerceNodes === 'function') emitCtx.coerceNodes(children);
  const childLines = emitNodesKotlinLines(children, '  ', childContext);
  const declaration = [];
  if (mode === 'construct') {
    const parameters = entries.flatMap((entry) => (
      entry.type === 'vector'
        ? [`${entry.name}X: Double`, `${entry.name}Y: Double`, `${entry.name}Z: Double`]
        : [`${entry.name}: Double`]
    )).join(', ');
    declaration.push(`private fun ${name}(${parameters}): PointsBuilder {`);
    for (const local of childContext.decls) declaration.push(indentText(local, 2));
    declaration.push('  return PointsBuilder()');
    declaration.push(...childLines.map((line) => `  ${line}`));
    declaration.push('}');
  } else {
    for (const local of childContext.decls) {
      declaration.push(String(local).replace(/^val /, 'private val ').replace(/^var /, 'private var '));
    }
    declaration.push(`private val ${name}: PointsBuilder = PointsBuilder()`);
    declaration.push(...childLines.map((line) => `  ${line}`));
  }
  if (!emitCtx.referenceDecls) emitCtx.referenceDecls = new Map();
  emitCtx.referenceDecls.set(`${mode}:${name}`, declaration.join('\n'));
  const template = { name, mode, entries };
  emitCtx.referenceTemplates.set(key, template);
  emitCtx.referenceStack.delete(key);
  return template;
}

function constructInstanceArguments(snapshot, node) {
  const values = getBuilderReferenceOverrideValues(snapshot, node);
  return getBuilderSnapshotVariableEntries(snapshot).flatMap((entry) => {
    if (entry.type === 'vector') {
      const vector = values.vector?.[entry.name] || {};
      return [fmtDouble(vector.x), fmtDouble(vector.y), fmtDouble(vector.z)];
    }
    return [fmtDouble(values.scalar?.[entry.name])];
  });
}

function emitNodeKotlinLines(node, emitCtx, indent, emitNodesKotlinLines) {
  if (node?.kind === BUILDER_REFERENCE_KIND) {
    const snapshotId = String(node.params?.snapshotId || '').trim();
    const snapshot = emitCtx?.snapshots?.[snapshotId];
    if (!snapshot) return [];
    registerReferenceParameterConstant(node, emitCtx);
    const template = registerSnapshotTemplate(snapshot, node, emitCtx, emitNodesKotlinLines);
    const params = node.params || {};
    const offset = relExpr(params.ox, params.oy, params.oz);
    const base = template.mode === 'construct'
      ? `${template.name}(${constructInstanceArguments(snapshot, node).join(', ')})`
      : template.name;
    const scale = num(params.scale, 1);
    const hasScale = scale > 0 && Math.abs(scale - 1) > 1e-9;
    const angle = num(params.rotationDeg);
    const hasRotation = Math.abs(angle) > 1e-9;
    const hasOffset = Math.abs(num(params.ox)) > 1e-9 || Math.abs(num(params.oy)) > 1e-9 || Math.abs(num(params.oz)) > 1e-9;
    if (!hasScale && !hasRotation) return [`${indent}.addBuilder(${offset}, ${base})`];
    const radian = `${fmtDouble(angle)} * PI / 180.0`;
    const defaultAxis = Math.abs(num(params.rotationAxisX)) <= 1e-9
      && Math.abs(num(params.rotationAxisY, 1) - 1) <= 1e-9
      && Math.abs(num(params.rotationAxisZ)) <= 1e-9;
    const axis = relExpr(params.rotationAxisX, params.rotationAxisY, params.rotationAxisZ);
    if (!hasScale && !hasOffset) {
      const args = defaultAxis ? radian : `${radian}, ${axis}`;
      return [`${indent}.addPoints(${base}.createWithRotation(${args}))`];
    }
    if (!hasScale) {
      const args = defaultAxis ? `${radian}, ${offset}` : `${radian}, ${axis}, ${offset}`;
      return [`${indent}.addPoints(${base}.createWithTransform(${args}))`];
    }
    const factor = fmtDouble(scale);
    const args = defaultAxis ? `${factor}, ${radian}, ${offset}` : `${factor}, ${radian}, ${axis}, ${offset}`;
    return [`${indent}.addPoints(${base}.createWithTransform(${args}))`];
  }
  if (node?.kind === EFFECT_RING_KIND) {
    const params = node.params || {};
    const ids = Array.isArray(params.snapshotIds) ? params.snapshotIds.map(String).filter(Boolean) : [];
    if (!ids.length) return [];
    registerReferenceParameterConstant(node, emitCtx);
    const names = ids.map((id) => {
      const snapshot = emitCtx?.snapshots?.[id];
      if (!snapshot) return '';
      return registerSnapshotTemplate(snapshot, { params: { instanceMode: 'static' } }, emitCtx, emitNodesKotlinLines).name;
    }).filter(Boolean);
    if (!names.length) return [];
    const lines = [
      `${indent}.addBuilder(${relExpr(params.offsetX, params.offsetY, params.offsetZ)}, PointsBuilder()`,
      `${indent}  .addWith {`,
      `${indent}  val res = arrayListOf<RelativeLocation>()`,
      `${indent}  getPolygonInCircleVertices(${int(params.count, 12)}, ${fmtDouble(params.radius)})`,
      `${indent}    .forEachIndexed { index, it ->`,
      `${indent}      val source = when (index % ${names.length}) {`
    ];
    names.forEach((name, index) => lines.push(`${indent}        ${index} -> ${name}.cloneBuilder()`));
    lines.push(`${indent}        else -> ${names[0]}.cloneBuilder()`, `${indent}      }`);
    if (params.faceCenter) {
      lines.push(`${indent}      source.rotateTo(${params.reverse ? 'it' : '-it'})`);
    }
    lines.push(`${indent}      res.addAll(source.pointsOnEach { rel -> rel.add(it).add(${fmtDouble(params.originX)}, ${fmtDouble(params.originY)}, ${fmtDouble(params.originZ)}) }.createWithoutClone())`);
    lines.push(`${indent}    }`, `${indent}  res`, `${indent}  })`);
    return lines;
  }
  const definition = POINTS_NODE_KINDS[node.kind];
  if (!definition?.kotlin) return [];
  const result = definition.kotlin(node, emitCtx, indent, emitNodesKotlinLines);
  if (Array.isArray(result)) return result;
  if (!result) return [];
  return [`${indent}${result}`];
}

export function evalBuilderWithMeta(nodes, initialAxis = v(0, 1, 0), options = {}) {
  const context = {
    points: [],
    axis: clone(initialAxis),
    previewPoints: []
  };
  const segments = new Map();
  const snapshots = normalizeBuilderSnapshots(options?.snapshots || options?.builderSnapshots);
  const referenceCache = options?.referenceCache instanceof Map ? options.referenceCache : new Map();
  const referenceStack = options?.referenceStack instanceof Set ? options.referenceStack : new Set();

  function evaluateChildren(children) {
    return evalBuilderWithMeta(children, v(0, 1, 0), { snapshots, referenceCache, referenceStack, resolveExpressions: options.resolveExpressions });
  }

  function resolveSnapshot(snapshotId, referenceNode = null) {
    const snapshot = snapshots[String(snapshotId || '')];
    if (!snapshot) return { points: [], axis: v(0, 1, 0) };
    const key = builderReferenceCacheKey(snapshot, referenceNode || { params: { snapshotId } });
    const cached = referenceCache.get(key);
    if (cached) return cached;
    if (referenceStack.has(key)) throw new Error(`Circular builder reference: ${snapshot.id}`);
    referenceStack.add(key);
    const children = applyBuilderReferenceOverrides(snapshot.children || [], snapshot, referenceNode);
    if (typeof options.resolveExpressions === 'function') options.resolveExpressions(children);
    const result = evalBuilderWithMeta(children, v(0, 1, 0), { snapshots, referenceCache, referenceStack, resolveExpressions: options.resolveExpressions });
    const frozen = {
      points: (result.points || []).map((item) => ({ x: num(item.x), y: num(item.y), z: num(item.z) })),
      axis: clone(result.axis || v(0, 1, 0))
    };
    referenceCache.set(key, frozen);
    referenceStack.delete(key);
    return frozen;
  }

  function appendPreviewPoints(targetContext, previewPoints) {
    if (!Array.isArray(previewPoints) || !previewPoints.length) return;
    if (!Array.isArray(targetContext.previewPoints)) targetContext.previewPoints = [];
    targetContext.previewPoints.push(...previewPoints.map((point) => ({ ...point })));
  }

  function evalList(list, targetContext, baseOffset) {
    (list || []).forEach((node) => {
      if (!node) return;
      const beforeLength = targetContext.points.length;

      if (node.kind === BUILDER_REFERENCE_KIND) {
        const resolved = resolveSnapshot(node.params?.snapshotId, node);
        const points = applyReferenceTransform(resolved.points, node);
        targetContext.points.push(...points);
        if (points.length) segments.set(node.id, { start: beforeLength + baseOffset, end: targetContext.points.length + baseOffset });
        return;
      }

      if (node.kind === EFFECT_RING_KIND) {
        const points = evaluateEffectRing(node, resolveSnapshot);
        targetContext.points.push(...points);
        if (points.length) segments.set(node.id, { start: beforeLength + baseOffset, end: targetContext.points.length + baseOffset });
        return;
      }

      if (BUILDER_CONTAINER_KINDS.has(node.kind)) {
        if (node.kind === 'apply_bezier_distribution') {
          const childResult = evaluateBezierDistribution(node, evaluateChildren);
          targetContext.points.push(...childResult.points);
          if (targetContext.points.length > beforeLength) {
            segments.set(node.id, { start: beforeLength + baseOffset, end: targetContext.points.length + baseOffset });
          }
          return;
        }
        if (node.kind === 'clear_as_mask') {
          const childResult = evaluateChildren(node.children || []);
          const childPoints = Array.isArray(childResult.points) ? childResult.points : [];
          targetContext.points = applyPointMask(targetContext.points, childPoints, node.params?.maskRange);
          targetContext.points.push(...childPoints.map((point) => clone(point)));
          appendPreviewPoints(targetContext, childResult.previewPoints);
          if (childPoints.length) {
            segments.set(node.id, {
              start: Math.max(0, targetContext.points.length - childPoints.length) + baseOffset,
              end: targetContext.points.length + baseOffset
            });
          }
          return;
        }
        const childResult = node.kind === 'add_builder'
          ? evaluateAddBuilder(node, evaluateChildren)
          : evaluateAddWith(node, evaluateChildren);

        targetContext.points.push(...(childResult.points || []));
        appendPreviewPoints(targetContext, childResult.previewPoints);

        if (targetContext.points.length > beforeLength) {
          segments.set(node.id, {
            start: beforeLength + baseOffset,
            end: targetContext.points.length + baseOffset
          });
        }

        if (node.kind === 'add_builder' && childResult.segments instanceof Map) {
          for (const [id, segment] of childResult.segments.entries()) {
            if (!segment) continue;
            segments.set(id, {
              start: segment.start + beforeLength + baseOffset,
              end: segment.end + beforeLength + baseOffset
            });
          }
        }
        return;
      }

      const definition = POINTS_NODE_KINDS[node.kind];
      if (!definition?.apply) return;
      definition.apply(targetContext, node);
      if (targetContext.points.length > beforeLength) {
        segments.set(node.id, {
          start: beforeLength + baseOffset,
          end: targetContext.points.length + baseOffset
        });
      }
    });
  }

  evalList(nodes || [], context, 0);
  return {
    points: context.points,
    axis: context.axis,
    previewPoints: context.previewPoints,
    segments
  };
}

export function evalBuilder(nodes, initialAxis = v(0, 1, 0), options = {}) {
  return evalBuilderWithMeta(nodes, initialAxis, options).points;
}

export function emitNodesKotlinLines(nodes, indent = '  ', emitCtx = { decls: [] }) {
  const lines = [];
  (nodes || []).forEach((node) => {
    lines.push(...emitNodeKotlinLines(node, emitCtx, indent, emitNodesKotlinLines));
  });
  return lines;
}

export function emitKotlinParts(project, options = {}) {
  const emitCtx = {
    decls: [],
    snapshots: normalizeBuilderSnapshots(project?.state?.builderSnapshots || project?.builderSnapshots),
    constants: new Map(),
    referenceDecls: new Map(),
    referenceTemplates: new Map(),
    referenceStack: new Set(),
    coerceNodes: options.coerceNodes,
    resolveStaticReference: options.resolveStaticReference
  };
  const nodes = getProjectNodes(project);
  const endMode = project?.kotlinEndMode || 'builder';
  const lines = ['PointsBuilder()', ...emitNodesKotlinLines(nodes, '  ', emitCtx)];

  if (endMode === 'list') {
    lines.push('  .createWithoutClone()');
  } else if (endMode === 'clone') {
    lines.push('  .create()');
  }

  return {
    expression: lines.join('\n'),
    localDeclarations: emitCtx.decls.slice(),
    constants: Array.from(emitCtx.constants.values()),
    declarations: Array.from(emitCtx.referenceDecls.values())
  };
}

export function emitKotlin(project, options = {}) {
  const parts = emitKotlinParts(project, options);
  const references = Array.isArray(parts.declarations) ? parts.declarations : [];
  const locals = Array.isArray(parts.localDeclarations) ? parts.localDeclarations : [];
  if (!references.length && !locals.length) return parts.expression;
  return [...references, ...locals, parts.expression].join('\n\n');
}

export function collectBuilderReferenceKotlinDeclarations(project) {
  const lines = emitKotlinParts(project).constants;
  return lines.length ? ['private companion object {', ...lines.map((line) => `  ${line}`), '}'].join('\n') : '';
}

export const builderFormatters = {
  fmt,
  fmtDouble,
  fmtFloat,
  relExpr
};
