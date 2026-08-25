const EPSILON = 1e-9;
const TAU = Math.PI * 2;

export function v(x = 0, y = 0, z = 0) {
  return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
}

export function clone(point) {
  return v(point?.x, point?.y, point?.z);
}

export function add(a, b) {
  return v((a?.x || 0) + (b?.x || 0), (a?.y || 0) + (b?.y || 0), (a?.z || 0) + (b?.z || 0));
}

export function sub(a, b) {
  return v((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0), (a?.z || 0) - (b?.z || 0));
}

export function mul(point, scalar) {
  return v((point?.x || 0) * scalar, (point?.y || 0) * scalar, (point?.z || 0) * scalar);
}

export function dot(a, b) {
  return (a?.x || 0) * (b?.x || 0) + (a?.y || 0) * (b?.y || 0) + (a?.z || 0) * (b?.z || 0);
}

export function cross(a, b) {
  return v(
    (a?.y || 0) * (b?.z || 0) - (a?.z || 0) * (b?.y || 0),
    (a?.z || 0) * (b?.x || 0) - (a?.x || 0) * (b?.z || 0),
    (a?.x || 0) * (b?.y || 0) - (a?.y || 0) * (b?.x || 0)
  );
}

export function len(point) {
  return Math.sqrt(dot(point, point));
}

export function normalize(point, fallback = v(0, 1, 0)) {
  const length = len(point);
  if (length < EPSILON) return clone(fallback);
  return v(point.x / length, point.y / length, point.z / length);
}

export function num(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function int(value, fallback = 0) {
  return Math.round(num(value, fallback));
}

export function intExpr(value, fallback = 0, min = null) {
  const expr = String(value ?? '').trim();
  if (!Number.isFinite(Number(value)) && isSafeNumericExpression(expr)) {
    const coerced = `(${expr}).toInt()`;
    return min === null ? coerced : `${coerced}.coerceAtLeast(${Math.trunc(min)})`;
  }
  const numeric = int(value, fallback);
  return String(min === null ? numeric : Math.max(Math.trunc(min), numeric));
}

export function longExpr(value, fallback = '0') {
  const expr = String(value ?? '').trim();
  if (/^-?\d+$/.test(expr)) {
    try {
      return `${BigInt(expr)}L`;
    } catch {
      return `${BigInt(fallback)}L`;
    }
  }
  if (Number.isFinite(Number(value))) return `${BigInt(Math.trunc(Number(value)))}L`;
  return isSafeNumericExpression(expr) ? expr : `${BigInt(fallback)}L`;
}

export function fmt(value) {
  const next = num(value, 0);
  if (!Number.isFinite(Number(value))) {
    const expr = String(value ?? '').trim();
    if (isSafeNumericExpression(expr)) return expr;
  }
  const normalized = Math.abs(next) < EPSILON ? 0 : next;
  const fixed = normalized.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return fixed === '-0' ? '0' : fixed;
}

export function fmtDouble(value) {
  const literal = fmt(value);
  if (Number.isFinite(Number(value))) {
    return Number.isInteger(Number(value)) ? `${literal}.0` : literal;
  }
  return formatExpressionNumericLiterals(literal, (token) => (
    /[.eE]/.test(token) ? token : `${token}.0`
  ));
}

export function fmtFloat(value) {
  const literal = fmt(value);
  if (Number.isFinite(Number(value))) return `${literal}F`;
  return formatExpressionNumericLiterals(literal, (token) => `${token}F`);
}

function formatExpressionNumericLiterals(source, formatToken) {
  return String(source || '').replace(
    /(^|[^A-Za-z0-9_.])(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)(?![A-Za-z0-9_.])/g,
    (_, prefix, token) => `${prefix}${formatToken(token)}`
  );
}

function isSafeNumericExpression(value) {
  const source = String(value || '').trim();
  return source.length > 0
    && /[A-Za-z0-9_]/.test(source)
    && /^[A-Za-z0-9_.$+\-*/%(),\s]+$/.test(source);
}

export function relExpr(x, y, z) {
  return `RelativeLocation(${fmtDouble(x)}, ${fmtDouble(y)}, ${fmtDouble(z)})`;
}

export function angleToRad(value, unit = 'deg') {
  const source = num(value);
  if (unit === 'rad') return source;
  return (source * Math.PI) / 180;
}

export function angleToDeg(value, unit = 'deg') {
  const source = num(value);
  if (unit === 'rad') return (source * 180) / Math.PI;
  return source;
}

export function getLineLocations(start, end, count) {
  const total = Math.max(1, int(count, 1));
  if (total === 1) return [clone(start)];
  return Array.from({ length: total }, (_, index) => {
    const ratio = index / (total - 1);
    return v(
      start.x + (end.x - start.x) * ratio,
      start.y + (end.y - start.y) * ratio,
      start.z + (end.z - start.z) * ratio
    );
  });
}

export function fillTriangle(p1, p2, p3, sampler = 3) {
  const density = Math.max(1, int(sampler, 3));
  const points = [];
  for (let i = 0; i <= density; i += 1) {
    for (let j = 0; j <= density - i; j += 1) {
      const a = i / density;
      const b = j / density;
      const c = 1 - a - b;
      points.push(v(
        p1.x * c + p2.x * a + p3.x * b,
        p1.y * c + p2.y * a + p3.y * b,
        p1.z * c + p2.z * a + p3.z * b
      ));
    }
  }
  return points;
}

export function getCircleXZ(radius, count) {
  const total = Math.max(3, int(count, 3));
  const r = num(radius, 1);
  return Array.from({ length: total }, (_, index) => {
    const angle = (index / total) * TAU;
    return v(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  });
}

export function getDottedLineLocations(target, totalCount, dottedCount, emptyStep) {
  const total = Math.max(1, int(totalCount, 1));
  const dotted = Math.max(1, int(dottedCount, 1));
  const gap = Math.max(0, num(emptyStep));
  const end = clone(target);
  const length = len(end);
  if (length <= EPSILON) return [v()];

  const gapCount = Math.max(0, dotted - 1);
  const usableLength = Math.max(0, length - gap * gapCount);
  if (usableLength <= EPSILON) return [v()];
  const segmentLength = usableLength / dotted;
  const segments = Array.from({ length: dotted }, (_, index) => {
    const start = index * (segmentLength + gap);
    return { start, end: Math.min(length, start + segmentLength) };
  }).filter((segment) => segment.end > segment.start + EPSILON);
  const solidLength = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const direction = mul(end, 1 / length);

  return Array.from({ length: total }, (_, index) => {
    let remaining = total <= 1 ? 0 : solidLength * index / (total - 1);
    let distance = segments.at(-1)?.end || 0;
    for (const segment of segments) {
      const currentLength = segment.end - segment.start;
      if (remaining <= currentLength || segment === segments.at(-1)) {
        distance = segment.start + Math.min(currentLength, Math.max(0, remaining));
        break;
      }
      remaining -= currentLength;
    }
    return mul(direction, distance);
  });
}

export function getDottedCircleXZ(radius, totalCount, dottedCount, emptyStep) {
  const total = Math.max(1, int(totalCount, 1));
  const dotted = Math.max(1, int(dottedCount, 1));
  const r = num(radius);
  const gap = Math.max(0, num(emptyStep));
  const usableArc = Math.max(0, TAU - gap * dotted);
  if (usableArc <= EPSILON || Math.abs(r) <= EPSILON) return [];

  const dashArc = usableArc / dotted;
  const segments = Array.from({ length: dotted }, (_, index) => {
    const start = index * (dashArc + gap);
    return { start, end: start + dashArc };
  });
  return Array.from({ length: total }, (_, index) => {
    let remaining = usableArc * index / total;
    let angle = segments.at(-1).start;
    for (const segment of segments) {
      const currentLength = segment.end - segment.start;
      if (remaining <= currentLength || segment === segments.at(-1)) {
        angle = segment.start + Math.min(currentLength, Math.max(0, remaining));
        break;
      }
      remaining -= currentLength;
    }
    return v(r * Math.cos(angle), 0, r * Math.sin(angle));
  });
}

export function getHalfCircleXZ(radius, count, rotateRad = 0) {
  return getRadianXZ(radius, count, 0, Math.PI, rotateRad);
}

export function getRadianXZCenter(radius, count, radian, rotateRad = 0) {
  const arc = num(radian);
  return getRadianXZ(radius, count, -arc / 2, arc / 2, rotateRad);
}

export function getRadianXZ(radius, count, startRadian, endRadian, rotateRad = 0) {
  const total = Math.max(1, int(count, 1));
  const r = num(radius);
  const start = num(startRadian);
  const span = num(endRadian) - start;
  return Array.from({ length: total }, (_, index) => {
    const angle = start + span * index / total + num(rotateRad);
    return v(r * Math.cos(angle), 0, r * Math.sin(angle));
  });
}

export function getBallSurfaceLocations(radius, count) {
  const r = num(radius);
  const total = Math.max(1, int(count, 1));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: total }, (_, index) => {
    const y = 1 - 2 * (index + 0.5) / total;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = goldenAngle * index;
    return v(
      r * ringRadius * Math.cos(angle),
      r * y,
      r * ringRadius * Math.sin(angle)
    );
  });
}

export function getBallSolidLocations(radius, count) {
  const r = num(radius);
  const total = Math.max(1, int(count, 1));
  return getBallSurfaceLocations(1, total).map((point, index) => (
    mul(point, r * Math.pow((index + 0.5) / total, 1 / 3))
  ));
}

export function getBallLocations(radius, countPow) {
  const resolution = Math.max(1, int(countPow, 1));
  return getBallSurfaceLocations(radius, resolution * resolution);
}

export function getCubeSurfaceLocations(width, height, depth, count) {
  const w = num(width);
  const h = num(height);
  const d = num(depth);
  if (w < 0 || h < 0 || d < 0) return [];

  const total = Math.max(1, int(count, 1));
  const halfX = w / 2;
  const halfY = h / 2;
  const halfZ = d / 2;
  const areas = [w * d, w * d, w * h, w * h, h * d, h * d];
  const totalArea = areas.reduce((sum, area) => sum + area, 0);

  return Array.from({ length: total }, (_, index) => {
    let selectedFace = 0;
    if (totalArea > 0) {
      const target = totalArea * (index + 0.5) / total;
      let accumulated = 0;
      while (selectedFace < areas.length - 1 && target > accumulated + areas[selectedFace]) {
        accumulated += areas[selectedFace];
        selectedFace += 1;
      }
    }

    const u = (index * 0.6180339887498949) % 1;
    const surfaceV = (index * 0.7548776662466927) % 1;
    const xU = -halfX + w * u;
    const xV = -halfX + w * surfaceV;
    const yU = -halfY + h * u;
    const yV = -halfY + h * surfaceV;
    const zU = -halfZ + d * u;
    const zV = -halfZ + d * surfaceV;

    switch (selectedFace) {
      case 0: return v(xU, -halfY, zV);
      case 1: return v(xU, halfY, zV);
      case 2: return v(xU, yV, -halfZ);
      case 3: return v(xU, yV, halfZ);
      case 4: return v(-halfX, yU, zV);
      default: return v(halfX, yU, zV);
    }
  });
}

export function getDiscreteCircleXZ(radius, count, discrete, seed = null) {
  const total = Math.max(1, int(count, 1));
  const r = num(radius);
  const spread = Math.max(0, num(discrete));
  const randomValue = seed === null || seed === undefined ? Math.random : mulberry32(Number(seed) >>> 0);
  return Array.from({ length: total }, (_, index) => {
    const angle = TAU * index / total;
    const randomRadius = randomValue() * spread;
    const rx = (randomValue() * 2 - 1) * Math.PI;
    const ry = (randomValue() * 2 - 1) * Math.PI;
    return v(
      Math.cos(angle) * r + randomRadius * Math.cos(rx) * Math.cos(ry),
      randomRadius * Math.sin(rx),
      Math.sin(angle) * r + randomRadius * Math.sin(ry) * Math.cos(rx)
    );
  });
}

export function getRoundShapeLocations(radius, step, preCircleCount) {
  const r = num(radius);
  const increment = num(step);
  const perCircle = Math.max(1, int(preCircleCount, 1));
  if (increment <= 0 || r < increment) return [];
  const points = [];
  for (let currentRadius = increment; currentRadius < r; currentRadius += increment) {
    points.push(...getCircleXZ(currentRadius, perCircle));
  }
  return points;
}

export function getRoundShapeLocationsRange(radius, step, minCircleCount, maxCircleCount) {
  const r = num(radius);
  const increment = num(step);
  const minCount = Math.max(1, int(minCircleCount, 1));
  const maxCount = Math.max(minCount, int(maxCircleCount, minCount));
  if (increment <= 0 || r < increment) return [];
  const circleTotal = Math.max(1, Math.trunc(r / increment));
  const countStep = (maxCount - minCount) / circleTotal;
  const points = [];
  let circleIndex = 1;
  for (let currentRadius = increment; currentRadius < r; currentRadius += increment) {
    points.push(...getCircleXZ(currentRadius, Math.max(1, Math.trunc(minCount + circleIndex * countStep))));
    circleIndex += 1;
  }
  return points;
}

export function getPolygonInCircleVertices(sideCount, radius) {
  const total = Math.max(3, int(sideCount, 3));
  const r = num(radius, 1);
  return Array.from({ length: total }, (_, index) => {
    const angle = (index / total) * TAU;
    return v(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  });
}

export function getPolygonInCircleLocations(sideCount, count, radius) {
  const vertices = getPolygonInCircleVertices(sideCount, radius);
  const perEdge = Math.max(2, int(count, 2));
  const points = [];
  vertices.forEach((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const linePoints = getLineLocations(start, end, perEdge);
    if (index < vertices.length - 1) {
      points.push(...linePoints.slice(0, -1));
      return;
    }
    points.push(...linePoints);
  });
  return points;
}

export function cubicBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  const u3 = u2 * u;
  const t3 = t2 * t;
  return v(
    u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
    u3 * p0.z + 3 * u2 * t * p1.z + 3 * u * t2 * p2.z + t3 * p3.z
  );
}

export function buildCubicBezier(p0, p1, p2, p3, count) {
  const total = Math.max(2, int(count, 2));
  return Array.from({ length: total }, (_, index) => {
    const t = total === 1 ? 1 : index / (total - 1);
    return cubicBezierPoint(t, p0, p1, p2, p3);
  });
}

export function quadToCubic(p0, p1, p2) {
  return {
    c1: add(p0, mul(sub(p1, p0), 2 / 3)),
    c2: add(p2, mul(sub(p1, p2), 2 / 3))
  };
}

export function generateBezierCurve(startOrTarget, endOrStartHandle, startHandleOrEndHandle, endHandleOrCount, maybeCount) {
  if (maybeCount !== undefined) {
    const start = clone(startOrTarget);
    const end = clone(endOrStartHandle);
    const startHandle = add(start, startHandleOrEndHandle);
    const endHandle = add(end, endHandleOrCount);
    return buildCubicBezier(start, startHandle, endHandle, end, maybeCount);
  }

  const target = clone(startOrTarget);
  const startHandle = clone(endOrStartHandle);
  const endHandle = clone(startHandleOrEndHandle);
  const origin = v(0, 0, 0);
  return buildCubicBezier(origin, startHandle, add(target, endHandle), target, endHandleOrCount);
}

function evaluateBezierNodePath(nodes, t) {
  if (!nodes.length) return v();
  if (nodes.length === 1) return clone(nodes[0].point);
  const scaled = Math.max(0, Math.min(1, t)) * (nodes.length - 1);
  const segmentIndex = Math.min(nodes.length - 2, Math.floor(scaled));
  const localT = segmentIndex === nodes.length - 2 && t >= 1 ? 1 : scaled - segmentIndex;
  const start = nodes[segmentIndex];
  const end = nodes[segmentIndex + 1];
  return cubicBezierPoint(
    localT,
    start.point,
    add(start.point, start.startHandle),
    add(end.point, end.endHandle),
    end.point
  );
}

export function generateSmoothBezierCurveNodes(controlNodes, count) {
  const total = Math.max(1, int(count, 1));
  const nodes = (Array.isArray(controlNodes) ? controlNodes : []).map((node) => ({
    point: clone(node?.point || { x: node?.x, y: node?.y, z: node?.z }),
    startHandle: clone(node?.startHandle || { x: node?.shx, y: node?.shy, z: node?.shz }),
    endHandle: clone(node?.endHandle || { x: node?.ehx, y: node?.ehy, z: node?.ehz })
  }));
  if (!nodes.length) return [];
  return Array.from({ length: total }, (_, index) => evaluateBezierNodePath(nodes, total === 1 ? 1 : index / (total - 1)));
}

export function sampleByDistance(polyline, count) {
  const total = Math.max(1, int(count, 1));
  const source = Array.isArray(polyline) ? polyline : [];
  if (!source.length) return [];
  if (total === 1) return [clone(source[source.length - 1])];
  if (source.length === 1) return Array.from({ length: total }, () => clone(source[0]));
  const cumulative = [0];
  for (let index = 1; index < source.length; index += 1) {
    const dx = source[index].x - source[index - 1].x;
    const dy = source[index].y - source[index - 1].y;
    const dz = source[index].z - source[index - 1].z;
    cumulative.push(cumulative[index - 1] + Math.hypot(dx, dy, dz));
  }
  const length = cumulative[cumulative.length - 1];
  if (!(length > EPSILON)) return Array.from({ length: total }, () => clone(source[0]));
  return Array.from({ length: total }, (_, index) => {
    const target = length * index / (total - 1);
    let high = cumulative.findIndex((value) => value >= target);
    if (high <= 0) return clone(source[0]);
    if (high < 0) high = cumulative.length - 1;
    const low = high - 1;
    const span = cumulative[high] - cumulative[low];
    if (!(span > EPSILON)) return clone(source[high]);
    const ratio = (target - cumulative[low]) / span;
    return v(
      source[low].x + (source[high].x - source[low].x) * ratio,
      source[low].y + (source[high].y - source[low].y) * ratio,
      source[low].z + (source[high].z - source[low].z) * ratio
    );
  });
}

export function generateEquidistantBezierCurveNodes(controlNodes, count) {
  const total = Math.max(1, int(count, 1));
  const nodes = Array.isArray(controlNodes) ? controlNodes : [];
  if (!nodes.length) return Array.from({ length: total }, () => ({ x: 0, y: 0, z: 0 }));
  if (nodes.length === 1) return Array.from({ length: total }, () => clone(nodes[0].point || nodes[0]));
  const subdivision = Math.min(16384, Math.max(256, total * 256));
  const result = sampleByDistance(generateSmoothBezierCurveNodes(nodes, subdivision), total);
  if (result.length) {
    result[0] = clone(nodes[0].point || nodes[0]);
    result[result.length - 1] = clone(nodes[nodes.length - 1].point || nodes[nodes.length - 1]);
  }
  return result;
}

export function rotateVectorAroundAxis(point, axis, angle) {
  const unit = normalize(axis, v(0, 1, 0));
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const term1 = mul(point, cosine);
  const term2 = mul(cross(unit, point), sine);
  const term3 = mul(unit, dot(unit, point) * (1 - cosine));
  return add(add(term1, term2), term3);
}

function getPerpendicularAxis(source) {
  const normalized = normalize(source, v(0, 1, 0));
  const fallback = Math.abs(normalized.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  return normalize(cross(normalized, fallback), v(0, 0, 1));
}

export function rotatePointsToPointUpright(points, targetPoint, axis = v(0, 1, 0)) {
  const from = normalize(axis, v(0, 1, 0));
  const to = normalize(targetPoint, from);
  const rotationAxis = cross(from, to);
  const rotationLength = len(rotationAxis);
  const alignment = Math.max(-1, Math.min(1, dot(from, to)));

  if (rotationLength < EPSILON) {
    if (alignment > 0.999999) return points;
    const fallbackAxis = getPerpendicularAxis(from);
    return points.map((point) => rotateVectorAroundAxis(point, fallbackAxis, Math.PI));
  }

  const angle = Math.acos(alignment);
  return points.map((point) => rotateVectorAroundAxis(point, rotationAxis, angle));
}

export function getLightningEffectNodes(start, end, counts, offsetRange = null, seed = null) {
  const source = clone(start);
  const target = clone(end);
  const defaultOffset = len(sub(target, source)) / 4;
  const initialOffset = offsetRange === null || offsetRange === undefined
    ? defaultOffset
    : Math.max(0.01, num(offsetRange, 0.01));
  const randomValue = seed === null || seed === undefined ? Math.random : mulberry32(Number(seed) >>> 0);

  function randomDirection() {
    const rx = (randomValue() * 2 - 1) * Math.PI;
    const ry = (randomValue() * 2 - 1) * Math.PI;
    return v(Math.cos(rx) * Math.cos(ry), Math.sin(rx), Math.sin(ry) * Math.cos(rx));
  }

  function subdivide(a, b, remaining, currentOffset) {
    const midpoint = mul(add(a, b), 0.5);
    const displaced = add(midpoint, mul(randomDirection(), (randomValue() * 2 - 1) * Math.max(0.01, currentOffset)));
    if (remaining <= 1) return [displaced];
    return [
      ...subdivide(a, displaced, remaining - 1, currentOffset),
      displaced,
      ...subdivide(displaced, b, remaining - 1, currentOffset)
    ];
  }

  return [source, ...subdivide(source, target, Math.max(1, int(counts, 1)), initialOffset), target];
}

export function getLightningEffectPoints(end, counts, preLineCount, offsetRange = null, seed = null) {
  const nodes = getLightningEffectNodes(v(), end, counts, offsetRange, seed);
  const points = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    points.push(...getLineLocations(nodes[index], nodes[index + 1], Math.max(1, int(preLineCount, 1))));
  }
  return points;
}

export function getLightningNodesEffectAttenuation(start, end, counts, maxOffset, attenuation, seed = null) {
  const source = clone(start);
  const target = clone(end);
  const decay = Math.min(1, Math.max(0.01, num(attenuation, 1)));
  const initialOffset = Math.max(0.01, num(maxOffset, 0.01));
  const randomValue = seed === null || seed === undefined ? Math.random : mulberry32(Number(seed) >>> 0);

  function randomDirection() {
    const rx = (randomValue() * 2 - 1) * Math.PI;
    const ry = (randomValue() * 2 - 1) * Math.PI;
    return v(Math.cos(rx) * Math.cos(ry), Math.sin(rx), Math.sin(ry) * Math.cos(rx));
  }

  function subdivide(a, b, remaining, currentOffset) {
    const offset = Math.max(0.01, currentOffset);
    const midpoint = mul(add(a, b), 0.5);
    const displaced = add(midpoint, mul(randomDirection(), (randomValue() * 2 - 1) * offset));
    if (remaining <= 1) return [displaced];
    const nextOffset = Math.max(0.01, offset * decay);
    return [
      ...subdivide(a, displaced, remaining - 1, nextOffset),
      displaced,
      ...subdivide(displaced, b, remaining - 1, nextOffset)
    ];
  }

  return [source, ...subdivide(source, target, Math.max(1, int(counts, 1)), initialOffset), target];
}

export function applyNoiseOffset(points, noiseX, noiseY, noiseZ, options = {}) {
  const nx = num(noiseX);
  const ny = num(noiseY, nx);
  const nz = num(noiseZ, nx);
  const seed = options.seed === null || options.seed === undefined ? null : Number(options.seed);
  const minLength = options.offsetLenMin === null || options.offsetLenMin === undefined ? null : num(options.offsetLenMin);
  const maxLength = options.offsetLenMax === null || options.offsetLenMax === undefined ? null : num(options.offsetLenMax);

  return (points || []).map((point, index) => {
    const randomValue = seed === null ? Math.random : mulberry32(((seed >>> 0) + Math.imul(index, 2654435761)) >>> 0);
    let x = 0;
    let y = 0;
    let z = 0;
    if (options.mode === 'SPHERE_UNIFORM') {
      let lengthSquared = 0;
      do {
        x = randomValue() * 2 - 1;
        y = randomValue() * 2 - 1;
        z = randomValue() * 2 - 1;
        lengthSquared = x * x + y * y + z * z;
      } while (lengthSquared <= EPSILON || lengthSquared > 1);
      x *= nx;
      y *= ny;
      z *= nz;
    } else if (options.mode === 'SHELL_UNIFORM') {
      const theta = TAU * randomValue();
      const normal = randomValue() * 2 - 1;
      const tangent = Math.sqrt(1 - normal * normal);
      x = tangent * Math.cos(theta) * nx;
      y = tangent * Math.sin(theta) * ny;
      z = normal * nz;
    } else {
      x = (randomValue() * 2 - 1) * nx;
      y = (randomValue() * 2 - 1) * ny;
      z = (randomValue() * 2 - 1) * nz;
    }

    const offsetLength = Math.sqrt(x * x + y * y + z * z);
    if (offsetLength > EPSILON) {
      let scale = 1;
      if (minLength !== null && offsetLength < minLength) scale = minLength / offsetLength;
      if (maxLength !== null && offsetLength > maxLength) scale = maxLength / offsetLength;
      x *= scale;
      y *= scale;
      z *= scale;
    }
    return v(point.x + x, point.y + y, point.z + z);
  });
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result;
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export function buildFourierSeries(terms = [], count = 360, scale = 1) {
  const total = Math.max(2, int(count, 2));
  const factor = num(scale, 1);
  return Array.from({ length: total }, (_, index) => {
    const ratio = index / total;
    const theta = ratio * TAU;
    let x = 0;
    let z = 0;

    terms.forEach((term) => {
      const radius = num(term?.r, 0);
      const omega = num(term?.w, 1);
      const startAngle = angleToRad(term?.startAngle, term?.startAngleUnit);
      x += radius * Math.cos(theta * omega + startAngle);
      z += radius * Math.sin(theta * omega + startAngle);
    });

    return v(x * factor, 0, z * factor);
  });
}
