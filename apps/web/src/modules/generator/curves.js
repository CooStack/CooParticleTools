let curveIdSeed = 1;

function makeCurveId(prefix = 'kf') {
  curveIdSeed += 1;
  return `${prefix}_${Date.now().toString(16)}_${curveIdSeed.toString(16)}`;
}

export function clampNumber(value, min, max, fallback = 0) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safe));
}

export function clampPercent(value, fallback = 0) {
  return clampNumber(value, 0, 100, fallback);
}

export function createCurveKeyframe(overrides = {}) {
  return {
    id: makeCurveId('kf'),
    time: 0,
    value: 0,
    out: { x: 33, y: 0 },
    in: { x: -33, y: 0 },
    ...overrides
  };
}

export function createLifecycleCurve(overrides = {}) {
  const fallbackValue = Number.isFinite(Number(overrides.defaultValue)) ? Number(overrides.defaultValue) : 1;
  const frames = Array.isArray(overrides.keyframes) && overrides.keyframes.length
    ? overrides.keyframes
    : [
      createCurveKeyframe({ time: 0, value: fallbackValue }),
      createCurveKeyframe({ time: 100, value: fallbackValue })
    ];
  return normalizeLifecycleCurve({
    id: makeCurveId('curve'),
    mode: 'linear',
    min: 0,
    max: Math.max(1, fallbackValue),
    defaultValue: fallbackValue,
    keyframes: frames,
    ...overrides
  });
}

export function normalizeLifecycleCurve(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const fallback = Number.isFinite(Number(source.defaultValue)) ? Number(source.defaultValue) : 0;
  const min = Number.isFinite(Number(source.min)) ? Number(source.min) : Math.min(0, fallback);
  const max = Number.isFinite(Number(source.max)) ? Number(source.max) : Math.max(1, fallback);
  const mode = String(source.mode || source.kind || 'linear') === 'bezier' ? 'bezier' : 'linear';
  const list = Array.isArray(source.keyframes) ? source.keyframes : [];
  const keyframes = list.length ? list.map((frame, index) => normalizeKeyframe(frame, fallback, index)) : [
    createCurveKeyframe({ time: 0, value: fallback }),
    createCurveKeyframe({ time: 100, value: fallback })
  ];
  keyframes.sort((a, b) => a.time - b.time);
  return {
    id: String(source.id || makeCurveId('curve')),
    enabled: source.enabled === true,
    mode,
    min,
    max: Math.max(min + 0.0001, max),
    defaultValue: fallback,
    keyframes
  };
}

function normalizeHandle(raw, fallback = { x: 0, y: 0 }) {
  return {
    x: Number.isFinite(Number(raw?.x)) ? Number(raw.x) : fallback.x,
    y: Number.isFinite(Number(raw?.y)) ? Number(raw.y) : fallback.y
  };
}

function normalizeKeyframe(raw = {}, fallback = 0, index = 0) {
  return createCurveKeyframe({
    id: String(raw.id || makeCurveId(`kf${index}`)),
    time: clampPercent(raw.time, index === 0 ? 0 : 100),
    value: Number.isFinite(Number(raw.value)) ? Number(raw.value) : fallback,
    out: normalizeHandle(raw.out, { x: 33, y: 0 }),
    in: normalizeHandle(raw.in, { x: -33, y: 0 })
  });
}

export function getSortedKeyframes(curve) {
  return (Array.isArray(curve?.keyframes) ? curve.keyframes : [])
    .slice()
    .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
}

export function getLifecycleCurveDisplayBounds(rawCurve, options = {}) {
  const curve = rawCurve && typeof rawCurve === 'object' ? rawCurve : {};
  const frames = getSortedKeyframes(curve);
  const values = [curve.min, curve.max, options.hardMin, options.hardMax]
    .map(Number)
    .filter(Number.isFinite);
  frames.forEach((frame) => values.push(Number(frame.value || 0)));
  if (curve.mode === 'bezier') {
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      const next = frames[index];
      values.push(Number(previous.value || 0) + Number(previous.out?.y || 0));
      values.push(Number(next.value || 0) + Number(next.in?.y || 0));
    }
  }
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) finiteValues.push(0, 1);
  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  if (rawMax - rawMin < 0.01) {
    return {
      min: roundCurveBound(rawMin - 0.5),
      max: roundCurveBound(rawMax + 0.5)
    };
  }
  return {
    min: niceCurveBound(rawMin, 'min'),
    max: niceCurveBound(rawMax, 'max')
  };
}

function niceCurveBound(value, edge) {
  const magnitude = Math.abs(Number(value) || 0);
  const step = magnitude <= 1 ? 0.1
    : magnitude <= 2 ? 0.2
      : magnitude <= 5 ? 0.5
        : magnitude <= 10 ? 1
          : magnitude <= 50 ? 5
            : magnitude <= 200 ? 10
              : 50;
  const scaled = Number(value) / step;
  return roundCurveBound((edge === 'min' ? Math.floor(scaled) : Math.ceil(scaled)) * step);
}

function roundCurveBound(value) {
  const rounded = Number(Number(value).toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function cubic1d(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

export function sampleBezierSegment(a, b, percent) {
  const x0 = Number(a.time || 0);
  const y0 = Number(a.value || 0);
  const x3 = Number(b.time || 0);
  const y3 = Number(b.value || 0);
  const gap = Math.max(0.0001, x3 - x0);
  let outX = clampNumber(a.out?.x, 0, gap, 0);
  let inX = clampNumber(b.in?.x, -gap, 0, 0);
  const handleSpan = outX - inX;
  if (handleSpan >= gap) {
    const scale = (gap * 0.999) / handleSpan;
    outX *= scale;
    inX *= scale;
  }
  const x1 = x0 + outX;
  const y1 = y0 + Number(a.out?.y || 0);
  const x2 = x3 + inX;
  const y2 = y3 + Number(b.in?.y || 0);
  const target = clampNumber(percent, x0, x3, x0);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 28; i += 1) {
    const t = (low + high) / 2;
    if (cubic1d(x0, x1, x2, x3, t) < target) low = t;
    else high = t;
  }
  return cubic1d(y0, y1, y2, y3, (low + high) / 2);
}

export function sampleLifecycleCurve(rawCurve, percent) {
  const curve = normalizeLifecycleCurve(rawCurve);
  const frames = getSortedKeyframes(curve);
  if (!frames.length) return Number(curve.defaultValue || 0);
  if (frames.length === 1) return Number(frames[0].value || 0);
  const t = clampPercent(percent);
  if (t <= frames[0].time) return Number(frames[0].value || 0);
  if (t >= frames[frames.length - 1].time) return Number(frames[frames.length - 1].value || 0);
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (t <= next.time) {
      if (curve.mode === 'bezier') {
        return sampleBezierSegment(prev, next, t);
      }
      const span = Math.max(0.0001, Number(next.time || 0) - Number(prev.time || 0));
      const alpha = (t - Number(prev.time || 0)) / span;
      return Number(prev.value || 0) + (Number(next.value || 0) - Number(prev.value || 0)) * alpha;
    }
  }
  return Number(frames[frames.length - 1].value || 0);
}

export function curveToKotlin(rawCurve, fallback = 0) {
  const curve = normalizeLifecycleCurve({ defaultValue: fallback, ...rawCurve });
  const frames = getSortedKeyframes(curve);
  if (curve.mode === 'bezier') {
    const items = frames.map((frame) => (
      `BezierFloatKeyframe(time = ${formatKNumber(frame.time / 100)}, value = ${formatKNumber(frame.value)}, `
      + `outX = ${formatKNumber(frame.out?.x || 0)}, outY = ${formatKNumber(frame.out?.y || 0)}, `
      + `inX = ${formatKNumber(frame.in?.x || 0)}, inY = ${formatKNumber(frame.in?.y || 0)})`
    ));
    return `BezierKeyframeFloatCurve(listOf(${items.join(', ')}))`;
  }
  if (frames.length <= 1) {
    const value = frames.length ? frames[0].value : fallback;
    return `ConstantFloatCurve(${formatKNumber(value)})`;
  }
  const linear = frames.map((frame) => `FloatKeyframe(${formatKNumber(frame.time / 100)}, ${formatKNumber(frame.value)})`);
  return `KeyframeFloatCurve(listOf(${linear.join(', ')}))`;
}

function formatKNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.0';
  if (Math.trunc(numeric) === numeric) return `${numeric.toFixed(1)}`;
  return Number(numeric.toFixed(6)).toString();
}
