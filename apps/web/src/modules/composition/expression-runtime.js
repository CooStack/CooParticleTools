const VECTOR_TYPES = new Set(['Vec3', 'RelativeLocation', 'Vector3f']);
const NUMERIC_TYPES = new Set(['Int', 'Long', 'Float', 'Double']);

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createRelativeLocation(x = 0, y = 0, z = 0) {
  const point = {
    x: toFiniteNumber(x),
    y: toFiniteNumber(y),
    z: toFiniteNumber(z)
  };
  point.asRelative = () => ({ x: point.x, y: point.y, z: point.z });
  return point;
}
createRelativeLocation.yAxis = () => createRelativeLocation(0, 1, 0);

function createVec3(x = 0, y = 0, z = 0) {
  return {
    x: toFiniteNumber(x),
    y: toFiniteNumber(y),
    z: toFiniteNumber(z),
    asRelative() {
      return createRelativeLocation(this.x, this.y, this.z);
    }
  };
}
createVec3.ZERO = createVec3(0, 0, 0);

function createVector3f(x = 0, y = 0, z = 0) {
  return {
    x: toFiniteNumber(x),
    y: toFiniteNumber(y),
    z: toFiniteNumber(z),
    asRelative() {
      return createRelativeLocation(this.x, this.y, this.z);
    }
  };
}

const runtimeRandom = {
  nextInt(fromOrUntil, until) {
    if (until === undefined) {
      const upper = Math.floor(toFiniteNumber(fromOrUntil, 1));
      if (upper <= 0) return 0;
      return Math.floor(Math.random() * upper);
    }
    const from = Math.floor(toFiniteNumber(fromOrUntil, 0));
    const upper = Math.floor(toFiniteNumber(until, from + 1));
    if (upper <= from) return from;
    return from + Math.floor(Math.random() * (upper - from));
  },
  nextFloat(fromOrUntil, until) {
    return this.nextDouble(fromOrUntil, until);
  },
  nextDouble(fromOrUntil, until) {
    if (until === undefined) {
      const upper = toFiniteNumber(fromOrUntil, 1);
      if (upper <= 0) return 0;
      return Math.random() * upper;
    }
    const from = toFiniteNumber(fromOrUntil, 0);
    const upper = toFiniteNumber(until, from + 1);
    if (upper <= from) return from;
    return from + Math.random() * (upper - from);
  },
  nextBoolean() {
    return Math.random() < 0.5;
  },
  nextLong(fromOrUntil, until) {
    return this.nextInt(fromOrUntil, until);
  }
};

export function isVectorType(type = '') {
  return VECTOR_TYPES.has(String(type || '').trim());
}

export function isNumericType(type = '') {
  return NUMERIC_TYPES.has(String(type || '').trim());
}

export function defaultLiteralForType(type = 'Double') {
  const normalized = String(type || 'Double').trim();
  if (normalized === 'Boolean') return 'false';
  if (normalized === 'String') return '""';
  if (normalized === 'Vec3') return 'Vec3(0.0, 0.0, 0.0)';
  if (normalized === 'RelativeLocation') return 'RelativeLocation(0.0, 0.0, 0.0)';
  if (normalized === 'Vector3f') return 'Vector3f(0F, 0F, 0F)';
  if (normalized === 'Float') return '0.0';
  if (normalized === 'Double') return '0.0';
  return '0';
}

export function formatVectorLiteral(type = 'RelativeLocation', x = 0, y = 0, z = 0) {
  const normalized = String(type || 'RelativeLocation').trim();
  if (normalized === 'Vector3f') {
    return `Vector3f(${toFiniteNumber(x)}F, ${toFiniteNumber(y)}F, ${toFiniteNumber(z)}F)`;
  }
  if (normalized === 'Vec3') {
    return `Vec3(${toFiniteNumber(x)}, ${toFiniteNumber(y)}, ${toFiniteNumber(z)})`;
  }
  return `RelativeLocation(${toFiniteNumber(x)}, ${toFiniteNumber(y)}, ${toFiniteNumber(z)})`;
}

export function parseVectorLiteral(rawValue, fallback = { x: 0, y: 0, z: 0 }) {
  if (Array.isArray(rawValue)) {
    return {
      x: toFiniteNumber(rawValue[0], fallback.x),
      y: toFiniteNumber(rawValue[1], fallback.y),
      z: toFiniteNumber(rawValue[2], fallback.z)
    };
  }
  if (rawValue && typeof rawValue === 'object') {
    return {
      x: toFiniteNumber(rawValue.x, fallback.x),
      y: toFiniteNumber(rawValue.y, fallback.y),
      z: toFiniteNumber(rawValue.z, fallback.z)
    };
  }
  const text = String(rawValue || '').trim();
  const match = text.match(/^[A-Za-z0-9_]+\s*\(([^)]+)\)$/);
  if (!match) return { ...fallback };
  const parts = match[1].split(',').map((item) => item.trim().replace(/[fFdDlL]$/g, ''));
  return {
    x: toFiniteNumber(parts[0], fallback.x),
    y: toFiniteNumber(parts[1], fallback.y),
    z: toFiniteNumber(parts[2], fallback.z)
  };
}

function normalizeLiteralByType(type = 'Double', rawValue = '') {
  const normalizedType = String(type || 'Double').trim();
  if (isVectorType(normalizedType)) {
    const parsed = parseVectorLiteral(rawValue, { x: 0, y: 0, z: 0 });
    return formatVectorLiteral(normalizedType, parsed.x, parsed.y, parsed.z);
  }
  if (normalizedType === 'Boolean') {
    return /^true$/i.test(String(rawValue || '').trim()) ? 'true' : 'false';
  }
  if (normalizedType === 'String') {
    return String(rawValue ?? '');
  }
  if (isNumericType(normalizedType)) {
    const fallback = normalizedType === 'Int' || normalizedType === 'Long' ? 0 : 0.0;
    return String(toFiniteNumber(rawValue, fallback));
  }
  return String(rawValue ?? defaultLiteralForType(normalizedType));
}

function createBaseRuntimeVars() {
  return {
    Math,
    PI: Math.PI,
    RelativeLocation: createRelativeLocation,
    Vec3: createVec3,
    Vector3f: createVector3f,
    Random: runtimeRandom
  };
}

function createExpressionRunner(scopeVars) {
  const keys = Object.keys(scopeVars);
  const values = Object.values(scopeVars);
  return function run(expression) {
    return new Function(...keys, `return (${expression});`)(...values);
  };
}

function asVector(result, fallback = { x: 0, y: 0, z: 0 }) {
  if (Array.isArray(result)) {
    return {
      x: toFiniteNumber(result[0], fallback.x),
      y: toFiniteNumber(result[1], fallback.y),
      z: toFiniteNumber(result[2], fallback.z)
    };
  }
  if (result && typeof result === 'object') {
    return {
      x: toFiniteNumber(result.x, fallback.x),
      y: toFiniteNumber(result.y, fallback.y),
      z: toFiniteNumber(result.z, fallback.z)
    };
  }
  return { ...fallback };
}

function resolveProjectStaticVars(project = {}) {
  const vars = createBaseRuntimeVars();

  (Array.isArray(project.globalVars) ? project.globalVars : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    const type = String(item?.type || 'Double').trim();
    const value = normalizeLiteralByType(type, item?.value);
    if (isVectorType(type)) {
      const vector = parseVectorLiteral(value, { x: 0, y: 0, z: 0 });
      vars[name] = type === 'Vec3'
        ? createVec3(vector.x, vector.y, vector.z)
        : type === 'Vector3f'
          ? createVector3f(vector.x, vector.y, vector.z)
          : createRelativeLocation(vector.x, vector.y, vector.z);
      return;
    }
    if (type === 'Boolean') {
      vars[name] = /^true$/i.test(value);
      return;
    }
    if (isNumericType(type)) {
      vars[name] = toFiniteNumber(value, 0);
      return;
    }
    vars[name] = value;
  });

  (Array.isArray(project.globalConsts) ? project.globalConsts : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    const type = String(item?.type || 'Int').trim();
    const value = normalizeLiteralByType(type, item?.value);
    if (isVectorType(type)) {
      const vector = parseVectorLiteral(value, { x: 0, y: 0, z: 0 });
      vars[name] = type === 'Vec3'
        ? createVec3(vector.x, vector.y, vector.z)
        : type === 'Vector3f'
          ? createVector3f(vector.x, vector.y, vector.z)
          : createRelativeLocation(vector.x, vector.y, vector.z);
      return;
    }
    if (type === 'Boolean') {
      vars[name] = /^true$/i.test(value);
      return;
    }
    if (isNumericType(type)) {
      vars[name] = toFiniteNumber(value, 0);
      return;
    }
    vars[name] = value;
  });

  return vars;
}

export function createCompositionExpressionRuntime(project = {}) {
  const staticVars = resolveProjectStaticVars(project);

  function buildVars(scope = {}) {
    return {
      ...staticVars,
      ...scope,
      Math,
      PI: Math.PI,
      RelativeLocation: createRelativeLocation,
      Vec3: createVec3,
      Vector3f: createVector3f,
      Random: runtimeRandom
    };
  }

  function evaluate(expression, scope = {}, fallback = 0) {
    const source = String(expression || '').trim();
    if (!source) return fallback;
    try {
      const vars = buildVars(scope);
      return createExpressionRunner(vars)(source);
    } catch {
      const numeric = Number(source);
      return Number.isFinite(numeric) ? numeric : fallback;
    }
  }

  function evaluateNumeric(expression, scope = {}, fallback = 0) {
    return toFiniteNumber(evaluate(expression, scope, fallback), fallback);
  }

  function evaluateBoolean(expression, scope = {}, fallback = true) {
    const result = evaluate(expression, scope, fallback);
    if (typeof result === 'boolean') return result;
    if (typeof result === 'number') return result !== 0;
    if (typeof result === 'string') return result.trim() ? /^true$/i.test(result.trim()) : fallback;
    return Boolean(result);
  }

  function evaluateVector(expression, scope = {}, fallback = { x: 0, y: 0, z: 0 }) {
    return asVector(evaluate(expression, scope, fallback), fallback);
  }

  function resolveRelativeTarget(expression, scope = {}, fallback = { x: 0, y: 0, z: 0 }) {
    const source = String(expression || '').trim();
    if (!source || source === 'root') return { ...fallback };
    return evaluateVector(source, scope, fallback);
  }

  return {
    buildVars,
    evaluate,
    evaluateNumeric,
    evaluateBoolean,
    evaluateVector,
    resolveRelativeTarget
  };
}
