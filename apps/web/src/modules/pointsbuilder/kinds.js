import {
  v,
  num,
  int,
  intExpr,
  longExpr,
  fmt,
  fmtDouble,
  relExpr,
  angleToRad,
  getLineLocations,
  getDottedLineLocations,
  fillTriangle,
  getCircleXZ,
  getDottedCircleXZ,
  getDiscreteCircleXZ,
  getHalfCircleXZ,
  getRadianXZCenter,
  getRadianXZ,
  getBallLocations,
  getBallSurfaceLocations,
  getBallSolidLocations,
  getCubeSurfaceLocations,
  getRoundShapeLocations,
  getRoundShapeLocationsRange,
  getPolygonInCircleLocations,
  quadToCubic,
  buildCubicBezier,
  generateBezierCurve,
  generateEquidistantBezierCurveNodes,
  rotateVectorAroundAxis,
  rotatePointsToPointUpright,
  getLightningEffectPoints,
  getLightningEffectNodes,
  getLightningNodesEffectAttenuation,
  applyNoiseOffset,
  buildFourierSeries
} from './geometry.js';

function numberField(key, label, options = {}) {
  return {
    key,
    label,
    type: 'number',
    step: options.step ?? 0.1,
    min: options.min,
    max: options.max,
    placeholder: options.placeholder || ''
  };
}

function toggleField(key, label) {
  return {
    key,
    label,
    type: 'checkbox'
  };
}

function selectField(key, label, options = []) {
  return {
    key,
    label,
    type: 'select',
    options
  };
}

function numericFields(keys) {
  return keys.map((key) => numberField(key, key));
}

const ANGLE_UNIT_OPTIONS = [
  { label: '角度', value: 'deg' },
  { label: '弧度', value: 'rad' }
];

const KOTLIN_MODE_OPTIONS = [
  { label: 'it.add(x, y, z)', value: 'direct3' },
  { label: 'it.add(RelativeLocation)', value: 'newRel' },
  { label: '预声明变量', value: 'valRel' }
];

export const BUILDER_CONTAINER_KINDS = new Set(['add_builder', 'add_with', 'clear_as_mask', 'apply_bezier_distribution']);

function offsetFrom(params = {}) {
  return v(num(params.ox), num(params.oy), num(params.oz));
}

function appendWithOffset(ctx, points, params = {}) {
  const offset = offsetFrom(params);
  ctx.points.push(...(points || []).map((point) => v(
    point.x + offset.x,
    point.y + offset.y,
    point.z + offset.z
  )));
}

function hasKotlinOffset(params = {}) {
  return ['ox', 'oy', 'oz'].some((key) => {
    const value = params[key];
    return Number.isFinite(Number(value)) ? Math.abs(Number(value)) > 1e-9 : String(value ?? '').trim() !== '';
  });
}

function makeBezierCircleNodes(radius = 3, ox = 0, oy = 0, oz = 0) {
  const r = Math.abs(num(radius, 3));
  const k = 0.5522847498 * r;
  return [
    { x: r + ox, y: oy, z: oz, shx: 0, shy: 0, shz: k, ehx: 0, ehy: 0, ehz: -k },
    { x: ox, y: oy, z: oz + r, shx: -k, shy: 0, shz: 0, ehx: k, ehy: 0, ehz: 0 },
    { x: ox - r, y: oy, z: oz, shx: 0, shy: 0, shz: -k, ehx: 0, ehy: 0, ehz: k },
    { x: ox, y: oy, z: oz - r, shx: k, shy: 0, shz: 0, ehx: -k, ehy: 0, ehz: 0 }
  ];
}

function closeBezierNodes(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  return list.length > 1 ? [...list, { ...list[0] }] : list;
}

function isZeroBezierVector(x, y, z) {
  return [x, y, z].every((value) => {
    if (value === null || value === undefined || String(value).trim() === '') return true;
    const numeric = Number(value);
    return Number.isFinite(numeric) && Math.abs(numeric) < 1e-9;
  });
}

function bezierNodeKotlinLines(node, indent) {
  const item = node || {};
  const args = [`point = ${relExpr(item.x, item.y, item.z)}`];
  if (!isZeroBezierVector(item.shx, item.shy, item.shz)) {
    args.push(`startHandle = ${relExpr(item.shx, item.shy, item.shz)}`);
  }
  if (!isZeroBezierVector(item.ehx, item.ehy, item.ehz)) {
    args.push(`endHandle = ${relExpr(item.ehx, item.ehy, item.ehz)}`);
  }
  return [
    `${indent}addNode(`,
    ...args.map((arg, index) => `${indent}  ${arg}${index < args.length - 1 ? ',' : ''}`),
    `${indent})`
  ];
}

function bezierCurveKotlinLines(nodes, count, indent) {
  const lines = [`${indent}.addBezierCurve(${count}) {`];
  for (const node of (nodes || [])) {
    lines.push(...bezierNodeKotlinLines(node, `${indent}  `));
  }
  lines.push(`${indent}}`);
  return lines;
}

function angleKotlinExpr(value, unit = 'deg') {
  return unit === 'rad' ? fmtDouble(value) : `((${fmtDouble(value)}) * PI / 180.0)`;
}

function angleDegreesKotlinExpr(value, unit = 'deg') {
  if (unit !== 'rad') return fmtDouble(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return fmtDouble(numeric * 180 / Math.PI);
  return `((${fmtDouble(value)}) * 180.0 / PI)`;
}

function kotlinCall(name, args, params = null) {
  const values = params && hasKotlinOffset(params)
    ? [relExpr(params.ox, params.oy, params.oz), ...args]
    : args;
  return `.${name}(${values.join(', ')})`;
}

function subtractKotlinExpr(left, right) {
  return `((${fmtDouble(left)}) - (${fmtDouble(right)}))`;
}

function quadraticHandleKotlinExpr(control, endpoint) {
  return `((2.0 / 3.0) * ${subtractKotlinExpr(control, endpoint)})`;
}

function mapPointSets(ctx, mapper) {
  ctx.points = (ctx.points || []).map(mapper);
  if (Array.isArray(ctx.previewPoints)) ctx.previewPoints = ctx.previewPoints.map(mapper);
}

function filterPointSets(ctx, predicate) {
  ctx.points = (ctx.points || []).filter(predicate);
  if (Array.isArray(ctx.previewPoints)) ctx.previewPoints = ctx.previewPoints.filter(predicate);
}

export const FOURIER_TERM_FIELDS = [
  numberField('r', '半径', { step: 0.1 }),
  numberField('w', '频率', { step: 0.1 }),
  numberField('startAngle', '起始角', { step: 1 }),
  selectField('startAngleUnit', '角度单位', ANGLE_UNIT_OPTIONS)
];

export const POINTS_NODE_KINDS = {
  axis: {
    title: '对称轴',
    group: '变换',
    description: '设置后续旋转使用的轴。',
    defaultParams: { x: 0, y: 1, z: 0 },
    fields: numericFields(['x', 'y', 'z']),
    apply(ctx, node) {
      ctx.axis = v(num(node.params.x), num(node.params.y), num(node.params.z));
    },
    kotlin(node) {
      return `.axis(${relExpr(node.params.x, node.params.y, node.params.z)})`;
    }
  },
  rotate_as_axis: {
    title: '绕轴旋转',
    group: '变换',
    description: '绕当前轴或指定轴旋转已有点。',
    defaultParams: { deg: 90, degUnit: 'deg', useCustomAxis: false, ax: 0, ay: 1, az: 0 },
    fields: [
      numberField('deg', '角度'),
      selectField('degUnit', '单位', ANGLE_UNIT_OPTIONS),
      toggleField('useCustomAxis', '指定轴'),
      ...numericFields(['ax', 'ay', 'az'])
    ],
    apply(ctx, node) {
      const axis = node.params.useCustomAxis
        ? v(num(node.params.ax), num(node.params.ay), num(node.params.az))
        : ctx.axis;
      const angle = angleToRad(node.params.deg, node.params.degUnit);
      mapPointSets(ctx, (point) => rotateVectorAroundAxis(point, axis, angle));
    },
    kotlin(node) {
      const angle = angleKotlinExpr(node.params.deg, node.params.degUnit);
      return node.params.useCustomAxis
        ? `.rotateAsAxis(${angle}, ${relExpr(node.params.ax, node.params.ay, node.params.az)})`
        : `.rotateAsAxis(${angle})`;
    }
  },
  rotate_to: {
    title: '指向目标',
    group: '变换',
    description: '把当前轴旋转到目标方向。',
    defaultParams: { mode: 'toVec', tox: 0, toy: 1, toz: 1, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 1 },
    fields: [
      selectField('mode', '模式', [
        { label: '目标向量', value: 'toVec' },
        { label: '起点到终点', value: 'originEnd' }
      ]),
      ...numericFields(['tox', 'toy', 'toz', 'ox', 'oy', 'oz', 'ex', 'ey', 'ez'])
    ],
    apply(ctx, node) {
      const target = node.params.mode === 'originEnd'
        ? v(
          num(node.params.ex) - num(node.params.ox),
          num(node.params.ey) - num(node.params.oy),
          num(node.params.ez) - num(node.params.oz)
        )
        : v(num(node.params.tox), num(node.params.toy), num(node.params.toz));
      ctx.points = rotatePointsToPointUpright(ctx.points || [], target, ctx.axis);
      if (Array.isArray(ctx.previewPoints)) {
        ctx.previewPoints = rotatePointsToPointUpright(ctx.previewPoints, target, ctx.axis);
      }
    },
    kotlin(node) {
      if (node.params.mode === 'originEnd') {
        return `.rotateTo(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)})`;
      }
      return `.rotateTo(${relExpr(node.params.tox, node.params.toy, node.params.toz)})`;
    }
  },
  scale: {
    title: '缩放',
    group: '变换',
    description: '缩放已有点集。',
    defaultParams: { factor: 1 },
    fields: [numberField('factor', '倍率')],
    apply(ctx, node) {
      const factor = num(node.params.factor, 1);
      if (factor <= 0) return;
      mapPointSets(ctx, (point) => v(point.x * factor, point.y * factor, point.z * factor));
    },
    kotlin(node) {
      return `.scale(${fmt(node.params.factor)})`;
    }
  },
  add_point: {
    title: '单点',
    group: '基础',
    description: '添加一个点。',
    defaultParams: { x: 0, y: 0, z: 0 },
    fields: [numberField('x', 'X'), numberField('y', 'Y'), numberField('z', 'Z')],
    apply(ctx, node) {
      ctx.points.push(v(num(node.params.x), num(node.params.y), num(node.params.z)));
    },
    kotlin(node) {
      return `.addPoint(${relExpr(node.params.x, node.params.y, node.params.z)})`;
    }
  },
  add_line: {
    title: '线段',
    group: '基础',
    description: '添加线段采样点。',
    defaultParams: { sx: 0, sy: 0, sz: 0, ex: 3, ey: 0, ez: 3, count: 30 },
    fields: [
      numberField('sx', '起点 X'),
      numberField('sy', '起点 Y'),
      numberField('sz', '起点 Z'),
      numberField('ex', '终点 X'),
      numberField('ey', '终点 Y'),
      numberField('ez', '终点 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const start = v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      ctx.points.push(...getLineLocations(start, end, Math.max(2, int(node.params.count, 30))));
    },
    kotlin(node) {
      return `.addLine(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${intExpr(node.params.count, 30, 2)})`;
    }
  },
  add_dotted_line: {
    title: '虚线',
    group: '基础',
    description: '添加带间隔的线段采样点。',
    defaultParams: { tx: 3, ty: 0, tz: 3, totalCount: 30, dottedCount: 4, emptyStep: 0.3, ox: 0, oy: 0, oz: 0 },
    fields: numericFields(['tx', 'ty', 'tz', 'totalCount', 'dottedCount', 'emptyStep', 'ox', 'oy', 'oz']),
    apply(ctx, node) {
      appendWithOffset(ctx, getDottedLineLocations(
        v(num(node.params.tx), num(node.params.ty), num(node.params.tz)),
        node.params.totalCount,
        node.params.dottedCount,
        node.params.emptyStep
      ), node.params);
    },
    kotlin(node) {
      return kotlinCall('addDottedLine', [
        relExpr(node.params.tx, node.params.ty, node.params.tz),
        intExpr(node.params.totalCount, 30, 1),
        intExpr(node.params.dottedCount, 4, 1),
        fmtDouble(node.params.emptyStep)
      ], node.params);
    }
  },
  add_fill_triangle: {
    title: '三角填充',
    group: '基础',
    description: '根据三个顶点填充三角形。',
    defaultParams: {
      p1x: 0, p1y: 0, p1z: 0,
      p2x: 3, p2y: 0, p2z: 0,
      p3x: 0, p3y: 0, p3z: 3,
      sampler: 3
    },
    fields: [
      numberField('p1x', 'P1 X'), numberField('p1y', 'P1 Y'), numberField('p1z', 'P1 Z'),
      numberField('p2x', 'P2 X'), numberField('p2y', 'P2 Y'), numberField('p2z', 'P2 Z'),
      numberField('p3x', 'P3 X'), numberField('p3y', 'P3 Y'), numberField('p3z', 'P3 Z'),
      numberField('sampler', '采样密度', { step: 1, min: 1 })
    ],
    apply(ctx, node) {
      const p1 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p2 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p3 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      ctx.points.push(...fillTriangle(p1, p2, p3, node.params.sampler));
    },
    kotlin(node) {
      return `.addFillTriangle(${relExpr(node.params.p1x, node.params.p1y, node.params.p1z)}, ${relExpr(node.params.p2x, node.params.p2y, node.params.p2z)}, ${relExpr(node.params.p3x, node.params.p3y, node.params.p3z)}, ${fmt(node.params.sampler ?? 3)})`;
    }
  },
  add_circle: {
    title: '圆环 XZ',
    group: '基础',
    description: '添加 XZ 平面的圆周点。',
    defaultParams: { r: 2, count: 120, ox: 0, oy: 0, oz: 0 },
    fields: [
      numberField('r', '半径', { min: 0.1 }),
      numberField('count', '点数', { step: 1, min: 3 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getCircleXZ(num(node.params.r, 2), Math.max(3, int(node.params.count, 120))), node.params);
    },
    kotlin(node) {
      return kotlinCall('addCircle', [fmtDouble(node.params.r ?? 2), intExpr(node.params.count, 120, 3)], node.params);
    }
  },
  add_dotted_circle: {
    title: '虚线圆环 XZ',
    group: '形状',
    description: '添加带间隔的 XZ 圆环点。',
    defaultParams: { r: 2, totalCount: 120, dottedCount: 8, emptyStep: 0.2, ox: 0, oy: 0, oz: 0 },
    fields: numericFields(['r', 'totalCount', 'dottedCount', 'emptyStep', 'ox', 'oy', 'oz']),
    apply(ctx, node) {
      appendWithOffset(ctx, getDottedCircleXZ(
        node.params.r,
        node.params.totalCount,
        node.params.dottedCount,
        node.params.emptyStep
      ), node.params);
    },
    kotlin(node) {
      return kotlinCall('addDottedCircle', [
        fmtDouble(node.params.r),
        intExpr(node.params.totalCount, 120, 1),
        intExpr(node.params.dottedCount, 8, 1),
        fmtDouble(node.params.emptyStep)
      ], node.params);
    }
  },
  add_discrete_circle_xz: {
    title: '离散圆环 XZ',
    group: '形状',
    description: '添加带随机离散的 XZ 圆环点。',
    defaultParams: { r: 2, count: 120, discrete: 0.4, seedEnabled: false, seed: 1, ox: 0, oy: 0, oz: 0 },
    fields: [
      ...numericFields(['r', 'count', 'discrete']),
      toggleField('seedEnabled', '固定种子'),
      numberField('seed', '种子'),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getDiscreteCircleXZ(
        node.params.r,
        node.params.count,
        node.params.discrete,
        node.params.seedEnabled ? node.params.seed : null
      ), node.params);
    },
    kotlin(node) {
      return kotlinCall('addDiscreteCircleXZ', [
        fmtDouble(node.params.r),
        intExpr(node.params.count, 120, 1),
        fmtDouble(node.params.discrete)
      ], node.params);
    }
  },
  add_half_circle: {
    title: '半圆 XZ',
    group: '形状',
    description: '添加 XZ 半圆弧点。',
    defaultParams: { r: 2, count: 80, useRotate: false, rotateDeg: 0, rotateDegUnit: 'deg', ox: 0, oy: 0, oz: 0 },
    fields: [
      ...numericFields(['r', 'count']),
      toggleField('useRotate', '旋转'),
      numberField('rotateDeg', '旋转角'),
      selectField('rotateDegUnit', '单位', ANGLE_UNIT_OPTIONS),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getHalfCircleXZ(
        node.params.r,
        node.params.count,
        node.params.useRotate ? angleToRad(node.params.rotateDeg, node.params.rotateDegUnit) : 0
      ), node.params);
    },
    kotlin(node) {
      const args = [fmtDouble(node.params.r), intExpr(node.params.count, 80, 1)];
      if (node.params.useRotate) args.push(angleKotlinExpr(node.params.rotateDeg, node.params.rotateDegUnit));
      return kotlinCall('addHalfCircle', args, node.params);
    }
  },
  add_radian_center: {
    title: '居中弧线 XZ',
    group: '形状',
    description: '添加以 Z 轴居中的弧线点。',
    defaultParams: { r: 2, count: 80, radianDeg: 120, radianDegUnit: 'deg', useRotate: false, rotateDeg: 0, rotateDegUnit: 'deg', ox: 0, oy: 0, oz: 0 },
    fields: [
      ...numericFields(['r', 'count', 'radianDeg']),
      selectField('radianDegUnit', '弧长单位', ANGLE_UNIT_OPTIONS),
      toggleField('useRotate', '旋转'),
      numberField('rotateDeg', '旋转角'),
      selectField('rotateDegUnit', '旋转单位', ANGLE_UNIT_OPTIONS),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getRadianXZCenter(
        node.params.r,
        node.params.count,
        angleToRad(node.params.radianDeg, node.params.radianDegUnit),
        node.params.useRotate ? angleToRad(node.params.rotateDeg, node.params.rotateDegUnit) : 0
      ), node.params);
    },
    kotlin(node) {
      const args = [
        fmtDouble(node.params.r),
        intExpr(node.params.count, 80, 1),
        angleKotlinExpr(node.params.radianDeg, node.params.radianDegUnit)
      ];
      if (node.params.useRotate) args.push(angleKotlinExpr(node.params.rotateDeg, node.params.rotateDegUnit));
      return kotlinCall('addRadianCenter', args, node.params);
    }
  },
  add_radian: {
    title: '弧线 XZ',
    group: '形状',
    description: '添加指定起止角的弧线点。',
    defaultParams: { r: 2, count: 80, startDeg: 0, startDegUnit: 'deg', endDeg: 120, endDegUnit: 'deg', useRotate: false, rotateDeg: 0, rotateDegUnit: 'deg', ox: 0, oy: 0, oz: 0 },
    fields: [
      ...numericFields(['r', 'count', 'startDeg']),
      selectField('startDegUnit', '起始单位', ANGLE_UNIT_OPTIONS),
      numberField('endDeg', '结束角'),
      selectField('endDegUnit', '结束单位', ANGLE_UNIT_OPTIONS),
      toggleField('useRotate', '旋转'),
      numberField('rotateDeg', '旋转角'),
      selectField('rotateDegUnit', '旋转单位', ANGLE_UNIT_OPTIONS),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getRadianXZ(
        node.params.r,
        node.params.count,
        angleToRad(node.params.startDeg, node.params.startDegUnit),
        angleToRad(node.params.endDeg, node.params.endDegUnit),
        node.params.useRotate ? angleToRad(node.params.rotateDeg, node.params.rotateDegUnit) : 0
      ), node.params);
    },
    kotlin(node) {
      const args = [
        fmtDouble(node.params.r),
        intExpr(node.params.count, 80, 1),
        angleKotlinExpr(node.params.startDeg, node.params.startDegUnit),
        angleKotlinExpr(node.params.endDeg, node.params.endDegUnit)
      ];
      if (node.params.useRotate) args.push(angleKotlinExpr(node.params.rotateDeg, node.params.rotateDegUnit));
      return kotlinCall('addRadian', args, node.params);
    }
  },
  add_ball: {
    title: '旧版球面点集',
    group: '形状',
    description: '兼容旧版 addBall；最终点数为 countPow 的平方。',
    defaultParams: { r: 2, countPow: 24, ox: 0, oy: 0, oz: 0 },
    fields: numericFields(['r', 'countPow', 'ox', 'oy', 'oz']),
    apply(ctx, node) {
      appendWithOffset(ctx, getBallLocations(node.params.r, node.params.countPow), node.params);
    },
    kotlin(node) {
      return kotlinCall('addBall', [fmtDouble(node.params.r), intExpr(node.params.countPow, 24, 1)], node.params);
    }
  },
  add_ball_surface: {
    title: '均匀球面点集',
    group: '形状',
    description: '使用黄金角在球面均匀采样，count 是最终点数。',
    defaultParams: { r: 2, count: 600, ox: 0, oy: 0, oz: 0 },
    fields: [
      numberField('r', '半径'),
      numberField('count', '点数', { step: 1, min: 1 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getBallSurfaceLocations(node.params.r, node.params.count), node.params);
    },
    kotlin(node) {
      return kotlinCall('addBallSurface', [fmtDouble(node.params.r), intExpr(node.params.count, 600, 1)], node.params);
    }
  },
  add_ball_solid: {
    title: '球体内部点集',
    group: '形状',
    description: '在整个球体内部均匀采样，count 是最终点数。',
    defaultParams: { r: 2, count: 600, ox: 0, oy: 0, oz: 0 },
    fields: [
      numberField('r', '半径'),
      numberField('count', '点数', { step: 1, min: 1 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getBallSolidLocations(node.params.r, node.params.count), node.params);
    },
    kotlin(node) {
      return kotlinCall('addBallSolid', [fmtDouble(node.params.r), intExpr(node.params.count, 600, 1)], node.params);
    }
  },
  add_ball_volume: {
    title: '球体体积点集',
    group: '形状',
    description: 'addBallSolid 的公开别名，在球体内部均匀采样。',
    defaultParams: { r: 2, count: 600, ox: 0, oy: 0, oz: 0 },
    fields: [
      numberField('r', '半径'),
      numberField('count', '点数', { step: 1, min: 1 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getBallSolidLocations(node.params.r, node.params.count), node.params);
    },
    kotlin(node) {
      return kotlinCall('addBallVolume', [fmtDouble(node.params.r), intExpr(node.params.count, 600, 1)], node.params);
    }
  },
  add_cube_surface: {
    title: '方块表面点集',
    group: '形状',
    description: '按面积权重在方块或长方体的六个表面采样。',
    defaultParams: { sizeMode: 'uniform', size: 2, width: 2, height: 2, depth: 2, count: 600, ox: 0, oy: 0, oz: 0 },
    fields: [
      selectField('sizeMode', '尺寸模式', [
        { label: '等边尺寸', value: 'uniform' },
        { label: '长 / 高 / 深', value: 'dimensions' }
      ]),
      numberField('size', '尺寸', { min: 0 }),
      numberField('width', '长度', { min: 0 }),
      numberField('height', '高度', { min: 0 }),
      numberField('depth', '深度', { min: 0 }),
      numberField('count', '点数', { step: 1, min: 1 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      const dimensions = node.params.sizeMode === 'dimensions'
        ? [node.params.width, node.params.height, node.params.depth]
        : [node.params.size, node.params.size, node.params.size];
      appendWithOffset(ctx, getCubeSurfaceLocations(...dimensions, node.params.count), node.params);
    },
    kotlin(node) {
      const args = node.params.sizeMode === 'dimensions'
        ? [fmtDouble(node.params.width), fmtDouble(node.params.height), fmtDouble(node.params.depth)]
        : [fmtDouble(node.params.size)];
      args.push(intExpr(node.params.count, 600, 1));
      return kotlinCall('addCubeSurface', args, node.params);
    }
  },
  add_round_shape: {
    title: '圆面 XZ',
    group: '形状',
    description: '按同心圆填充 XZ 圆面。',
    defaultParams: { r: 3, step: 0.25, mode: 'fixed', preCircleCount: 60, minCircleCount: 20, maxCircleCount: 120, ox: 0, oy: 0, oz: 0 },
    fields: [
      ...numericFields(['r', 'step']),
      selectField('mode', '采样模式', [
        { label: '固定', value: 'fixed' },
        { label: '范围', value: 'range' }
      ]),
      ...numericFields(['preCircleCount', 'minCircleCount', 'maxCircleCount', 'ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      const points = node.params.mode === 'range'
        ? getRoundShapeLocationsRange(node.params.r, node.params.step, node.params.minCircleCount, node.params.maxCircleCount)
        : getRoundShapeLocations(node.params.r, node.params.step, node.params.preCircleCount);
      appendWithOffset(ctx, points, node.params);
    },
    kotlin(node) {
      const args = [fmtDouble(node.params.r), fmtDouble(node.params.step)];
      if (node.params.mode === 'range') {
        args.push(intExpr(node.params.minCircleCount, 20, 1), intExpr(node.params.maxCircleCount, 120, 1));
      } else {
        args.push(intExpr(node.params.preCircleCount, 60, 1));
      }
      return kotlinCall('addRoundShape', args, node.params);
    }
  },
  add_polygon: {
    title: '正多边形边点',
    group: '形状',
    description: '按照外接圆生成多边形边点。',
    defaultParams: { r: 2, sideCount: 5, count: 30, ox: 0, oy: 0, oz: 0 },
    fields: [
      numberField('r', '半径', { min: 0.1 }),
      numberField('sideCount', '边数', { step: 1, min: 3 }),
      numberField('count', '每边点数', { step: 1, min: 2 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getPolygonInCircleLocations(int(node.params.sideCount, 5), int(node.params.count, 30), num(node.params.r, 2)), node.params);
    },
    kotlin(node) {
      return kotlinCall('addPolygonInCircle', [
        intExpr(node.params.sideCount, 5, 3),
        intExpr(node.params.count, 30, 2),
        fmtDouble(node.params.r ?? 2)
      ], node.params);
    }
  },
  add_polygon_in_circle: {
    title: '内接多边形边点',
    group: '形状',
    description: '兼容旧版 addPolygonInCircle。',
    defaultParams: { n: 5, edgeCount: 30, r: 2, ox: 0, oy: 0, oz: 0 },
    fields: [
      numberField('n', '边数', { step: 1, min: 3 }),
      numberField('edgeCount', '每边点数', { step: 1, min: 2 }),
      numberField('r', '半径', { min: 0.1 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, getPolygonInCircleLocations(int(node.params.n, 5), int(node.params.edgeCount, 30), num(node.params.r, 2)), node.params);
    },
    kotlin(node) {
      return kotlinCall('addPolygonInCircle', [
        intExpr(node.params.n, 5, 3),
        intExpr(node.params.edgeCount, 30, 2),
        fmtDouble(node.params.r ?? 2)
      ], node.params);
    }
  },
  add_bezier: {
    title: '三点贝塞尔',
    group: '曲线',
    description: '通过三点生成二次贝塞尔曲线。',
    defaultParams: {
      p1x: 0, p1y: 0, p1z: 0,
      p2x: 2, p2y: 2, p2z: 0,
      p3x: 4, p3y: 0, p3z: 0,
      count: 80
    },
    fields: [
      numberField('p1x', '起点 X'), numberField('p1y', '起点 Y'), numberField('p1z', '起点 Z'),
      numberField('p2x', '控制点 X'), numberField('p2y', '控制点 Y'), numberField('p2z', '控制点 Z'),
      numberField('p3x', '终点 X'), numberField('p3y', '终点 Y'), numberField('p3z', '终点 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const p0 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p1 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p2 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      const cubic = quadToCubic(p0, p1, p2);
      ctx.points.push(...buildCubicBezier(p0, cubic.c1, cubic.c2, p2, Math.max(2, int(node.params.count, 80))));
    },
    kotlin(node) {
      const start = relExpr(node.params.p1x, node.params.p1y, node.params.p1z);
      const end = relExpr(node.params.p3x, node.params.p3y, node.params.p3z);
      const startHandle = relExpr(
        quadraticHandleKotlinExpr(node.params.p2x, node.params.p1x),
        quadraticHandleKotlinExpr(node.params.p2y, node.params.p1y),
        quadraticHandleKotlinExpr(node.params.p2z, node.params.p1z)
      );
      const endHandle = relExpr(
        quadraticHandleKotlinExpr(node.params.p2x, node.params.p3x),
        quadraticHandleKotlinExpr(node.params.p2y, node.params.p3y),
        quadraticHandleKotlinExpr(node.params.p2z, node.params.p3z)
      );
      return `.addWith { generateBezierCurve(${start}, ${end}, ${startHandle}, ${endHandle}, ${intExpr(node.params.count, 80, 2)}) }`;
    }
  },
  add_bezier_4: {
    title: '四点贝塞尔',
    group: '曲线',
    description: '通过四点生成三次贝塞尔曲线。',
    defaultParams: {
      p1x: 0, p1y: 0, p1z: 0,
      p2x: 2, p2y: 2, p2z: 0,
      p3x: 4, p3y: -2, p3z: 0,
      p4x: 6, p4y: 0, p4z: 0,
      count: 80
    },
    fields: [
      numberField('p1x', 'P1 X'), numberField('p1y', 'P1 Y'), numberField('p1z', 'P1 Z'),
      numberField('p2x', 'P2 X'), numberField('p2y', 'P2 Y'), numberField('p2z', 'P2 Z'),
      numberField('p3x', 'P3 X'), numberField('p3y', 'P3 Y'), numberField('p3z', 'P3 Z'),
      numberField('p4x', 'P4 X'), numberField('p4y', 'P4 Y'), numberField('p4z', 'P4 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const p0 = v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
      const p1 = v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
      const p2 = v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
      const p3 = v(num(node.params.p4x), num(node.params.p4y), num(node.params.p4z));
      ctx.points.push(...buildCubicBezier(p0, p1, p2, p3, Math.max(2, int(node.params.count, 80))));
    },
    kotlin(node) {
      const start = relExpr(node.params.p1x, node.params.p1y, node.params.p1z);
      const end = relExpr(node.params.p4x, node.params.p4y, node.params.p4z);
      const startHandle = relExpr(
        subtractKotlinExpr(node.params.p2x, node.params.p1x),
        subtractKotlinExpr(node.params.p2y, node.params.p1y),
        subtractKotlinExpr(node.params.p2z, node.params.p1z)
      );
      const endHandle = relExpr(
        subtractKotlinExpr(node.params.p3x, node.params.p4x),
        subtractKotlinExpr(node.params.p3y, node.params.p4y),
        subtractKotlinExpr(node.params.p3z, node.params.p4z)
      );
      return `.addWith { generateBezierCurve(${start}, ${end}, ${startHandle}, ${endHandle}, ${intExpr(node.params.count, 80, 2)}) }`;
    }
  },
  add_bezier_curve: {
    title: 'Bezier Curve',
    group: '曲线',
    description: '使用起点/终点与相对手柄生成三维三次贝塞尔曲线。',
    defaultParams: {
      sx: 0, sy: 0, sz: 0,
      ex: 5, ey: 0, ez: 0,
      shx: 2, shy: 2, shz: 0,
      ehx: -2, ehy: 2, ehz: 0,
      count: 80
    },
    fields: [
      numberField('sx', '起点 X'), numberField('sy', '起点 Y'), numberField('sz', '起点 Z'),
      numberField('ex', '终点 X'), numberField('ey', '终点 Y'), numberField('ez', '终点 Z'),
      numberField('shx', '起始手柄 X'), numberField('shy', '起始手柄 Y'), numberField('shz', '起始手柄 Z'),
      numberField('ehx', '结束手柄 X'), numberField('ehy', '结束手柄 Y'), numberField('ehz', '结束手柄 Z'),
      numberField('count', '点数', { step: 1, min: 2 })
    ],
    apply(ctx, node) {
      const start = v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      const startHandle = v(num(node.params.shx), num(node.params.shy), num(node.params.shz));
      const endHandle = v(num(node.params.ehx), num(node.params.ehy), num(node.params.ehz));
      ctx.points.push(...generateBezierCurve(start, end, startHandle, endHandle, Math.max(2, int(node.params.count, 80))));
    },
    kotlin(node) {
      return `.addBezierCurve(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${relExpr(node.params.shx, node.params.shy, node.params.shz)}, ${relExpr(node.params.ehx, node.params.ehy, node.params.ehz)}, ${intExpr(node.params.count, 80, 2)})`;
    }
  },
  add_bezier_curve_multi: {
    title: '空间贝塞尔',
    group: '曲线',
    description: '使用多个空间节点与相对曲柄生成按弧长等距采样的三次贝塞尔曲线。',
    defaultParams: { nodes: [], count: 16, closed: false },
    fields: [numberField('count', '点数', { step: 1, min: 1 })],
    apply(ctx, node) {
      const nodes = node.params.closed ? closeBezierNodes(node.params.nodes) : (node.params.nodes || []);
      if (!nodes.length) return;
      const points = generateEquidistantBezierCurveNodes(nodes, Math.max(1, int(node.params.count, 16)));
      ctx.points.push(...points);
    },
    kotlin(node, emitCtx, indent) {
      const sourceNodes = node.params.closed ? closeBezierNodes(node.params.nodes) : (node.params.nodes || []);
      return bezierCurveKotlinLines(sourceNodes, intExpr(node.params.count, 16, 1), indent);
    }
  },
  add_bezier_circle_preset: {
    title: '贝塞尔圆预设',
    group: '曲线',
    description: '由四段三次贝塞尔曲线组成的 XZ 平面圆。',
    defaultParams: { nodes: makeBezierCircleNodes(), count: 96 },
    fields: [numberField('count', '点数', { step: 1, min: 4 })],
    apply(ctx, node) {
      let nodes = Array.isArray(node.params.nodes) && node.params.nodes.length ? node.params.nodes : null;
      if (!nodes) nodes = makeBezierCircleNodes(node.params.radius, node.params.ox, node.params.oy, node.params.oz);
      ctx.points.push(...generateEquidistantBezierCurveNodes(closeBezierNodes(nodes), Math.max(4, int(node.params.count, 96))));
    },
    kotlin(node, emitCtx, indent) {
      let nodes = Array.isArray(node.params.nodes) && node.params.nodes.length ? node.params.nodes : null;
      if (!nodes) nodes = makeBezierCircleNodes(node.params.radius, node.params.ox, node.params.oy, node.params.oz);
      return bezierCurveKotlinLines(closeBezierNodes(nodes), intExpr(node.params.count, 96, 4), indent);
    }
  },
  apply_bezier_distribution: {
    title: '空间贝塞尔分布',
    group: '容器',
    description: '沿空间贝塞尔路径复制子 Builder 的点集。',
    defaultParams: { nodes: [], count: 16, closed: false },
    supportsChildren: true,
    fields: [numberField('count', '路径点数', { step: 1, min: 1 })],
    apply() {},
    kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
      const lines = [`${indent}.applyBezierDistribution {`];
      const nodes = node.params.closed ? closeBezierNodes(node.params.nodes) : (node.params.nodes || []);
      nodes.forEach((item) => {
        lines.push(`${indent}  addNode(${relExpr(item.x, item.y, item.z)}, ${relExpr(item.shx, item.shy, item.shz)}, ${relExpr(item.ehx, item.ehy, item.ehz)})`);
      });
      lines.push(`${indent}  count(${intExpr(node.params.count, 16, 1)})`);
      lines.push(`${indent}  applyBuilder(PointsBuilder()`);
      lines.push(...emitNodesKotlinLines(node.children || [], `${indent}    `, emitCtx));
      lines.push(`${indent}  )`);
      lines.push(`${indent}}`);
      return lines;
    }
  },
  add_lightning_points: {
    title: '闪电折线点',
    group: '高级',
    description: '添加闪电节点间的线段采样点。',
    defaultParams: { useStart: false, sx: 0, sy: 0, sz: 0, ex: 6, ey: 2, ez: 0, count: 6, preLineCount: 10, useOffsetRange: true, offsetRange: 1.2 },
    fields: [
      toggleField('useStart', '指定起点'),
      ...numericFields(['sx', 'sy', 'sz', 'ex', 'ey', 'ez', 'count', 'preLineCount']),
      toggleField('useOffsetRange', '指定偏移范围'),
      numberField('offsetRange', '偏移范围')
    ],
    apply(ctx, node) {
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      const points = getLightningEffectPoints(
        end,
        node.params.count,
        node.params.preLineCount,
        node.params.useOffsetRange ? node.params.offsetRange : null
      );
      if (node.params.useStart) {
        appendWithOffset(ctx, points, { ox: node.params.sx, oy: node.params.sy, oz: node.params.sz });
      } else {
        ctx.points.push(...points);
      }
    },
    kotlin(node) {
      const args = [];
      if (node.params.useStart) args.push(relExpr(node.params.sx, node.params.sy, node.params.sz));
      args.push(
        relExpr(node.params.ex, node.params.ey, node.params.ez),
        intExpr(node.params.count, 6, 1),
        intExpr(node.params.preLineCount, 10, 1)
      );
      if (node.params.useOffsetRange) args.push(fmtDouble(node.params.offsetRange));
      return `.addLightningPoints(${args.join(', ')})`;
    }
  },
  add_lightning_nodes: {
    title: '闪电节点',
    group: '高级',
    description: '添加递归闪电节点。',
    defaultParams: { useStart: false, sx: 0, sy: 0, sz: 0, ex: 6, ey: 2, ez: 0, count: 6, useOffsetRange: false, offsetRange: 1.2 },
    fields: [
      toggleField('useStart', '指定起点'),
      ...numericFields(['sx', 'sy', 'sz', 'ex', 'ey', 'ez', 'count']),
      toggleField('useOffsetRange', '指定偏移范围'),
      numberField('offsetRange', '偏移范围')
    ],
    apply(ctx, node) {
      const start = node.params.useStart
        ? v(num(node.params.sx), num(node.params.sy), num(node.params.sz))
        : v();
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      ctx.points.push(...getLightningEffectNodes(
        start,
        end,
        node.params.count,
        node.params.useOffsetRange ? node.params.offsetRange : null
      ));
    },
    kotlin(node) {
      const args = [];
      if (node.params.useStart) args.push(relExpr(node.params.sx, node.params.sy, node.params.sz));
      args.push(relExpr(node.params.ex, node.params.ey, node.params.ez), intExpr(node.params.count, 6, 1));
      if (node.params.useOffsetRange) args.push(fmtDouble(node.params.offsetRange));
      return `.addLightningNodes(${args.join(', ')})`;
    }
  },
  add_lightning_nodes_attenuation: {
    title: '衰减闪电节点',
    group: '高级',
    description: '添加偏移逐层衰减的闪电节点。',
    defaultParams: { useStart: false, sx: 0, sy: 0, sz: 0, ex: 6, ey: 2, ez: 0, counts: 6, maxOffset: 1.2, attenuation: 0.8, seedEnabled: false, seed: 1 },
    fields: [
      toggleField('useStart', '指定起点'),
      ...numericFields(['sx', 'sy', 'sz', 'ex', 'ey', 'ez', 'counts', 'maxOffset', 'attenuation']),
      toggleField('seedEnabled', '固定种子'),
      numberField('seed', '种子')
    ],
    apply(ctx, node) {
      const start = node.params.useStart
        ? v(num(node.params.sx), num(node.params.sy), num(node.params.sz))
        : v();
      const end = v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
      ctx.points.push(...getLightningNodesEffectAttenuation(
        start,
        end,
        node.params.counts,
        node.params.maxOffset,
        node.params.attenuation,
        node.params.seedEnabled ? node.params.seed : null
      ));
    },
    kotlin(node) {
      const args = [];
      if (node.params.useStart) args.push(relExpr(node.params.sx, node.params.sy, node.params.sz));
      args.push(
        relExpr(node.params.ex, node.params.ey, node.params.ez),
        intExpr(node.params.counts, 6, 1),
        fmtDouble(node.params.maxOffset),
        fmtDouble(node.params.attenuation)
      );
      return `.addLightningNodesAttenuation(${args.join(', ')})`;
    }
  },
  apply_noise_offset: {
    title: '随机扰动',
    group: '变换',
    description: '对已有点应用随机偏移。',
    defaultParams: { noiseX: 0.2, noiseY: 0.2, noiseZ: 0.2, mode: 'AXIS_UNIFORM', seedEnabled: false, seed: 1, lenMinEnabled: false, offsetLenMin: 0, lenMaxEnabled: false, offsetLenMax: 0 },
    fields: [
      ...numericFields(['noiseX', 'noiseY', 'noiseZ']),
      selectField('mode', '模式', [
        { label: '轴向均匀', value: 'AXIS_UNIFORM' },
        { label: '球内均匀', value: 'SPHERE_UNIFORM' },
        { label: '球壳均匀', value: 'SHELL_UNIFORM' }
      ]),
      toggleField('seedEnabled', '固定种子'),
      numberField('seed', '种子'),
      toggleField('lenMinEnabled', '最小偏移长度'),
      numberField('offsetLenMin', '最小长度'),
      toggleField('lenMaxEnabled', '最大偏移长度'),
      numberField('offsetLenMax', '最大长度')
    ],
    apply(ctx, node) {
      const options = {
        mode: node.params.mode,
        seed: node.params.seedEnabled ? node.params.seed : null,
        offsetLenMin: node.params.lenMinEnabled ? node.params.offsetLenMin : null,
        offsetLenMax: node.params.lenMaxEnabled ? node.params.offsetLenMax : null
      };
      ctx.points = applyNoiseOffset(ctx.points, node.params.noiseX, node.params.noiseY, node.params.noiseZ, options);
      if (Array.isArray(ctx.previewPoints)) {
        ctx.previewPoints = applyNoiseOffset(ctx.previewPoints, node.params.noiseX, node.params.noiseY, node.params.noiseZ, options);
      }
    },
    kotlin(node) {
      const args = [fmtDouble(node.params.noiseX), fmtDouble(node.params.noiseY), fmtDouble(node.params.noiseZ)];
      if (node.params.mode && node.params.mode !== 'AXIS_UNIFORM') args.push(`mode = NoiseMode.${node.params.mode}`);
      if (node.params.seedEnabled) args.push(`seed = ${longExpr(node.params.seed)}`);
      if (node.params.lenMinEnabled) args.push(`offsetLenMin = ${fmtDouble(node.params.offsetLenMin)}`);
      if (node.params.lenMaxEnabled) args.push(`offsetLenMax = ${fmtDouble(node.params.offsetLenMax)}`);
      return `.applyNoiseOffset(${args.join(', ')})`;
    }
  },
  points_on_each_offset: {
    title: '整体偏移',
    group: '变换',
    description: '对已有点执行 pointsOnEach 偏移。',
    defaultParams: { offX: 0.2, offY: 0, offZ: 0, kotlinMode: 'direct3' },
    fields: [
      numberField('offX', '偏移 X'),
      numberField('offY', '偏移 Y'),
      numberField('offZ', '偏移 Z'),
      selectField('kotlinMode', 'Kotlin 输出', KOTLIN_MODE_OPTIONS)
    ],
    apply(ctx, node) {
      const dx = num(node.params.offX);
      const dy = num(node.params.offY);
      const dz = num(node.params.offZ);
      ctx.points = ctx.points.map((point) => ({ x: point.x + dx, y: point.y + dy, z: point.z + dz }));
    },
    kotlin(node, emitCtx) {
      const dx = fmtDouble(node.params.offX);
      const dy = fmtDouble(node.params.offY);
      const dz = fmtDouble(node.params.offZ);
      const mode = node.params.kotlinMode;
      if (mode === 'newRel') return `.pointsOnEach { it.add(RelativeLocation(${dx}, ${dy}, ${dz})) }`;
      if (mode === 'valRel') {
        const variableName = `rel_${node.id.slice(0, 6)}`;
        emitCtx.decls.push(`val ${variableName} = RelativeLocation(${dx}, ${dy}, ${dz})`);
        return `.pointsOnEach { it.add(${variableName}) }`;
      }
      return `.pointsOnEach { it.add(${dx}, ${dy}, ${dz}) }`;
    }
  },
  add_builder: {
    title: '子 Builder',
    group: '容器',
    description: '拼接一个带偏移的子 Builder。',
    defaultParams: { ox: 0, oy: 0, oz: 0, folded: false },
    supportsChildren: true,
    fields: [numberField('ox', '偏移 X'), numberField('oy', '偏移 Y'), numberField('oz', '偏移 Z')],
    kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
      const lines = [];
      lines.push(`${indent}.addBuilder(${relExpr(node.params.ox, node.params.oy, node.params.oz)},`);
      lines.push(`${indent}  PointsBuilder()`);
      lines.push(...emitNodesKotlinLines(node.children || [], `${indent}    `, emitCtx));
      lines.push(`${indent}  )`);
      return lines;
    }
  },
  add_with: {
    title: '旋转重复',
    group: '容器',
    description: '围绕多边形顶点重复子 Builder。',
    defaultParams: {
      r: 3,
      c: 6,
      rotateToCenter: true,
      rotateReverse: false,
      rotateOffsetEnabled: false,
      rox: 0,
      roy: 0,
      roz: 0,
      ox: 0,
      oy: 0,
      oz: 0
    },
    supportsChildren: true,
    fields: [
      numberField('r', '半径', { min: 0.1 }),
      numberField('c', '数量', { step: 1, min: 1 }),
      toggleField('rotateToCenter', '朝向中心'),
      toggleField('rotateReverse', '朝向反转'),
      toggleField('rotateOffsetEnabled', '启用朝向偏移'),
      numberField('rox', '朝向偏移 X'),
      numberField('roy', '朝向偏移 Y'),
      numberField('roz', '朝向偏移 Z'),
      numberField('ox', '偏移 X'),
      numberField('oy', '偏移 Y'),
      numberField('oz', '偏移 Z')
    ],
    kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
      const lines = [];
      const radius = fmtDouble(node.params.r ?? 3);
      const count = intExpr(node.params.c, 6, 1);
      const rotateToCenter = Boolean(node.params.rotateToCenter);
      const rotateReverse = Boolean(node.params.rotateReverse);
      const rotateOffsetEnabled = Boolean(node.params.rotateOffsetEnabled);
      const rox = fmtDouble(node.params.rox);
      const roy = fmtDouble(node.params.roy);
      const roz = fmtDouble(node.params.roz);

      lines.push(`${indent}.addWith {`);
      lines.push(`${indent}  val res = arrayListOf<RelativeLocation>()`);
      lines.push(`${indent}  getPolygonInCircleVertices(${count}, ${radius})`);
      lines.push(`${indent}        .forEach { it ->`);
      lines.push(`${indent}            val p = PointsBuilder()`);
      lines.push(...emitNodesKotlinLines(node.children || [], `${indent}              `, emitCtx));
      if (rotateToCenter) {
        if (rotateOffsetEnabled) {
          if (rotateReverse) {
            lines.push(`${indent}            p.rotateTo(it.clone().add(${rox}, ${roy}, ${roz}))`);
          } else {
            lines.push(`${indent}            p.rotateTo((-it).add(${rox}, ${roy}, ${roz}))`);
          }
        } else {
          lines.push(`${indent}            p.rotateTo(${rotateReverse ? 'it' : '-it'})`);
        }
      }
      lines.push(`${indent}            res.addAll(p`);
      lines.push(`${indent}                    .pointsOnEach { rel -> rel.add(it) }`);
      lines.push(`${indent}                    .createWithoutClone()`);
      lines.push(`${indent}            )`);
      lines.push(`${indent}        }`);
      if (hasKotlinOffset(node.params)) {
        lines.push(`${indent}  res.onEach { rel -> rel.add(${relExpr(node.params.ox, node.params.oy, node.params.oz)}) }`);
      } else {
        lines.push(`${indent}  res`);
      }
      lines.push(`${indent}}`);
      return lines;
    }
  },
  add_fourier_series: {
    title: '傅里叶级数',
    group: '高级',
    description: '根据项列表生成傅里叶曲线。',
    defaultParams: { count: 360, scale: 1, folded: false, ox: 0, oy: 0, oz: 0 },
    supportsTerms: true,
    fields: [
      numberField('count', '点数', { step: 1, min: 2 }),
      numberField('scale', '缩放', { step: 0.1, min: 0.1 }),
      ...numericFields(['ox', 'oy', 'oz'])
    ],
    apply(ctx, node) {
      appendWithOffset(ctx, buildFourierSeries(node.terms || [], Math.max(2, int(node.params.count, 360)), num(node.params.scale, 1)), node.params);
    },
    kotlin(node, emitCtx, indent) {
      const lines = [];
      lines.push(hasKotlinOffset(node.params)
        ? `${indent}.addFourierSeries(${relExpr(node.params.ox, node.params.oy, node.params.oz)},`
        : `${indent}.addFourierSeries(`);
      lines.push(`${indent}  FourierSeriesBuilder()`);
      lines.push(`${indent}    .count(${intExpr(node.params.count, 360, 2)})`);
      lines.push(`${indent}    .scale(${fmtDouble(node.params.scale ?? 1)})`);
      (node.terms || []).forEach((term) => {
        lines.push(`${indent}    .addFourier(${fmtDouble(term.r ?? 1)}, ${fmtDouble(term.w ?? 1)}, ${angleDegreesKotlinExpr(term.startAngle ?? 0, term.startAngleUnit)})`);
      });
      lines.push(`${indent}  )`);
      return lines;
    }
  },
  clear_as_mask: {
    title: '点集遮罩组',
    group: '容器',
    description: '用子组点集清理已有点，并拼接子组。',
    defaultParams: { maskRange: 1 },
    supportsChildren: true,
    fields: [numberField('maskRange', '遮罩范围', { min: 0 })],
    kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
      return [
        `${indent}.clearAsMaskAndJoin(`,
        `${indent}  PointsBuilder()`,
        ...emitNodesKotlinLines(node.children || [], `${indent}    `, emitCtx),
        `${indent}  , ${fmtDouble(node.params.maskRange)}`,
        `${indent})`
      ];
    }
  },
  clear_as_ball_mask: {
    title: '球形遮罩',
    group: '高级',
    description: '清除球形范围内的已有点。',
    defaultParams: { ox: 0, oy: 0, oz: 0, radius: 1 },
    fields: numericFields(['ox', 'oy', 'oz', 'radius']),
    apply(ctx, node) {
      const origin = offsetFrom(node.params);
      const radius = Math.max(0, num(node.params.radius));
      const radiusSquared = radius * radius;
      filterPointSets(ctx, (point) => {
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        const dz = point.z - origin.z;
        return dx * dx + dy * dy + dz * dz > radiusSquared;
      });
    },
    kotlin(node) {
      return `.clearAsBallMask(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${fmtDouble(node.params.radius)})`;
    }
  },
  clear_as_round_xz_mask: {
    title: '圆面遮罩 XZ',
    group: '高级',
    description: '清除 XZ 圆面范围内的已有点。',
    defaultParams: { ox: 0, oy: 0, oz: 0, radius: 1, yAxisRange: -1 },
    fields: numericFields(['ox', 'oy', 'oz', 'radius', 'yAxisRange']),
    apply(ctx, node) {
      const origin = offsetFrom(node.params);
      const radius = Math.max(0, num(node.params.radius));
      const radiusSquared = radius * radius;
      const yRange = num(node.params.yAxisRange);
      filterPointSets(ctx, (point) => {
        const dx = point.x - origin.x;
        const dz = point.z - origin.z;
        const insideCircle = dx * dx + dz * dz < radiusSquared;
        const insideHeight = yRange <= 0 || Math.abs(point.y - origin.y) <= yRange;
        return !(insideCircle && insideHeight);
      });
    },
    kotlin(node) {
      return `.clearAsRoundXZMask(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${fmtDouble(node.params.radius)}, ${fmtDouble(node.params.yAxisRange)})`;
    }
  },
  clear: {
    title: '清空',
    group: '高级',
    description: '清空当前累计点集。',
    defaultParams: {},
    fields: [],
    apply(ctx) {
      ctx.points = [];
    },
    kotlin() {
      return '.clear()';
    }
  }
};

export const POINTS_NODE_KIND_OPTIONS = Object.entries(POINTS_NODE_KINDS)
  .filter(([, item]) => item.hidden !== true)
  .map(([value, item]) => ({
    value,
    label: `${item.group} / ${item.title}`
  }));

export function getNodeKindDefinition(kind) {
  return POINTS_NODE_KINDS[kind] || null;
}

export function getNodeField(kind, key) {
  return (POINTS_NODE_KINDS[kind]?.fields || []).find((field) => field.key === key) || null;
}
