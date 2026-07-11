import { evaluatePointsProject } from '../pointsbuilder/evaluator.js';

const MAX_SIM_PARTICLES = 65536;
const MAX_PREWARM_VISUAL_SAMPLES = 16384;
const MAX_SPARSE_VISUAL_SAMPLES = 65536;
const EPSILON = 1e-8;

const COMMAND_ALIASES = {
  ParticleDragCommand: 'drag',
  ParticleGravityCommand: 'gravity',
  ParticleAttractionCommand: 'attraction',
  ParticleOrbitCommand: 'orbit',
  ParticleNoiseCommand: 'noise',
  ParticleFlowFieldCommand: 'flow_field',
  ParticleVortexCommand: 'vortex',
  ParticleRotationForceCommand: 'rotation_force',
  ParticleToroidalCirculationCommand: 'toroidal_circulation',
  ParticleDistortionCommand: 'distortion',
  ParticleInheritVelocityCommand: 'inherit_velocity',
  ParticleLifetimeMotionCommand: 'lifetime_motion',
  acceleration: 'velocity_add'
};

const VECTOR_VALUE_TYPES = new Set(['Vec3', 'RelativeLocation', 'Vector3f']);
const BINDING_PATH_LABELS = {
  'emitter.offset': '世界偏移',
  'emitter.box.x': '盒体 X',
  'emitter.box.y': '盒体 Y',
  'emitter.box.z': '盒体 Z',
  'emitter.sphere.r': '半径',
  'emitter.sphereSurface.r': '球面半径',
  'emitter.ring.r': '圆环半径',
  'emitter.ring.thickness': '圆环厚度',
  'emitter.ring.axis': '圆环法线轴',
  'emitter.line.step': '直线步长',
  'emitter.line.dir': '直线方向',
  'emitter.circle.r': '圆半径',
  'emitter.circle.axis': '圆法线轴',
  'emitter.arc.r': '弧线半径',
  'emitter.arc.start': '弧线起始角',
  'emitter.arc.end': '弧线结束角',
  'emitter.arc.rotate': '弧线整体旋转',
  'emitter.arc.axis': '弧线法线轴',
  'emitter.spiral.startR': '螺旋起始半径',
  'emitter.spiral.endR': '螺旋结束半径',
  'emitter.spiral.height': '螺旋高度',
  'emitter.spiral.rotateSpeed': '螺旋旋转速度',
  'emitter.spiral.rBias': '螺旋半径偏置',
  'emitter.spiral.hBias': '螺旋高度偏置',
  'emitter.spiral.axis': '螺旋轴',
  'particle.countMin': '最少数量',
  'particle.countMax': '最多数量',
  'particle.lifeMin': '最短寿命',
  'particle.lifeMax': '最长寿命',
  'particle.sizeMin': '最小大小',
  'particle.sizeMax': '最大大小',
  'particle.colorStart': '颜色 0%',
  'particle.colorEnd': '颜色 100%',
  'particle.visibleRange': '可见距离',
  'particle.velocity': '速度方向',
  'particle.velocityRandom': '速度随机量',
  'particle.speedMin': '最小速度',
  'particle.speedMax': '最大速度',
  'render.axis': '渲染轴',
  'render.baseScale': '基础缩放',
  'render.alpha': '透明度',
  'render.light': '亮度',
  'render.roll': 'Roll',
  'render.yaw': 'Yaw',
  'render.pitch': 'Pitch',
  'render.sign': 'Sign',
  'render.speedLimit': '速度限制'
};

function createBindingResolver(project = {}, options = {}) {
  return {
    values: createProjectValueMap(project),
    collectErrors: options.collectErrors === true,
    errors: [],
    seenErrors: new Set()
  };
}

function createProjectValueMap(project = {}) {
  const values = [
    ...(Array.isArray(project?.parameters?.variables) ? project.parameters.variables : []),
    ...(Array.isArray(project?.parameters?.constants) ? project.parameters.constants : [])
  ];
  return new Map(values
    .filter((item) => isIdent(item?.name))
    .map((item) => [String(item.name), item]));
}

function resolveEmitterCard(project, card, resolver, index = 0) {
  const emitter = card?.emitter || {};
  const particle = card?.particle || {};
  const render = card?.render || {};
  return {
    ...card,
    emitter: {
      ...emitter,
      offset: resolveVectorPath(resolver, card, 'emitter.offset', emitter.offset, ['RelativeLocation']),
      box: {
        ...(emitter.box || {}),
        x: resolveNumberPath(resolver, card, 'emitter.box.x', emitter.box?.x, 1),
        y: resolveNumberPath(resolver, card, 'emitter.box.y', emitter.box?.y, 1),
        z: resolveNumberPath(resolver, card, 'emitter.box.z', emitter.box?.z, 1)
      },
      sphere: {
        ...(emitter.sphere || {}),
        r: resolveNumberPath(resolver, card, 'emitter.sphere.r', emitter.sphere?.r, 1)
      },
      sphereSurface: {
        ...(emitter.sphereSurface || {}),
        r: resolveNumberPath(resolver, card, 'emitter.sphereSurface.r', emitter.sphereSurface?.r, 1)
      },
      ring: {
        ...(emitter.ring || {}),
        r: resolveNumberPath(resolver, card, 'emitter.ring.r', emitter.ring?.r, 1),
        thickness: resolveNumberPath(resolver, card, 'emitter.ring.thickness', emitter.ring?.thickness, 0),
        axis: resolveVectorPath(resolver, card, 'emitter.ring.axis', emitter.ring?.axis, ['RelativeLocation'])
      },
      line: {
        ...(emitter.line || {}),
        step: resolveNumberPath(resolver, card, 'emitter.line.step', emitter.line?.step, 0.2),
        dir: resolveVectorPath(resolver, card, 'emitter.line.dir', emitter.line?.dir, ['RelativeLocation'])
      },
      circle: {
        ...(emitter.circle || {}),
        r: resolveNumberPath(resolver, card, 'emitter.circle.r', emitter.circle?.r, 1),
        axis: resolveVectorPath(resolver, card, 'emitter.circle.axis', emitter.circle?.axis, ['RelativeLocation'])
      },
      arc: {
        ...(emitter.arc || {}),
        r: resolveNumberPath(resolver, card, 'emitter.arc.r', emitter.arc?.r, 1),
        start: resolveNumberPath(resolver, card, 'emitter.arc.start', emitter.arc?.start, 0),
        end: resolveNumberPath(resolver, card, 'emitter.arc.end', emitter.arc?.end, 0),
        rotate: resolveNumberPath(resolver, card, 'emitter.arc.rotate', emitter.arc?.rotate, 0),
        axis: resolveVectorPath(resolver, card, 'emitter.arc.axis', emitter.arc?.axis, ['RelativeLocation'])
      },
      spiral: {
        ...(emitter.spiral || {}),
        startR: resolveNumberPath(resolver, card, 'emitter.spiral.startR', emitter.spiral?.startR, 0.5),
        endR: resolveNumberPath(resolver, card, 'emitter.spiral.endR', emitter.spiral?.endR, 2.5),
        height: resolveNumberPath(resolver, card, 'emitter.spiral.height', emitter.spiral?.height, 2),
        rotateSpeed: resolveNumberPath(resolver, card, 'emitter.spiral.rotateSpeed', emitter.spiral?.rotateSpeed, 0.35),
        rBias: resolveNumberPath(resolver, card, 'emitter.spiral.rBias', emitter.spiral?.rBias, 1),
        hBias: resolveNumberPath(resolver, card, 'emitter.spiral.hBias', emitter.spiral?.hBias, 1),
        axis: resolveVectorPath(resolver, card, 'emitter.spiral.axis', emitter.spiral?.axis, ['RelativeLocation'])
      }
    },
    particle: {
      ...particle,
      countMin: resolveNumberPath(resolver, card, 'particle.countMin', particle.countMin, 1, 'Int'),
      countMax: resolveNumberPath(resolver, card, 'particle.countMax', particle.countMax, 1, 'Int'),
      lifeMin: resolveNumberPath(resolver, card, 'particle.lifeMin', particle.lifeMin, 1, 'Int'),
      lifeMax: resolveNumberPath(resolver, card, 'particle.lifeMax', particle.lifeMax, 1, 'Int'),
      sizeMin: resolveNumberPath(resolver, card, 'particle.sizeMin', particle.sizeMin, 0.08),
      sizeMax: resolveNumberPath(resolver, card, 'particle.sizeMax', particle.sizeMax, 0.18),
      colorStart: rgbToHexObject(resolveColorPath(resolver, card, 'particle.colorStart', particle.colorStart)),
      colorEnd: rgbToHexObject(resolveColorPath(resolver, card, 'particle.colorEnd', particle.colorEnd)),
      velocity: resolveVectorPath(resolver, card, 'particle.velocity', particle.velocity || particle.vel, ['Vec3']),
      velocityRandom: resolveVectorPath(resolver, card, 'particle.velocityRandom', particle.velocityRandom || particle.velRandom, ['Vec3']),
      speedMin: resolveNumberPath(resolver, card, 'particle.speedMin', particle.speedMin ?? particle.velSpeedMin, 0),
      speedMax: resolveNumberPath(resolver, card, 'particle.speedMax', particle.speedMax ?? particle.velSpeedMax, 0),
      visibleRange: resolveNumberPath(resolver, card, 'particle.visibleRange', particle.visibleRange, 128, 'Float')
    },
    render: {
      ...render,
      axis: resolveVectorPath(resolver, card, 'render.axis', render.axis, ['Vec3']),
      baseScale: resolveVectorPath(resolver, card, 'render.baseScale', render.baseScale, ['Vec3'], 'Float'),
      alpha: resolveNumberPath(resolver, card, 'render.alpha', render.alpha, 100),
      light: resolveNumberPath(resolver, card, 'render.light', render.light, 15, 'Int'),
      roll: resolveNumberPath(resolver, card, 'render.roll', render.roll, 0),
      yaw: resolveNumberPath(resolver, card, 'render.yaw', render.yaw, 0),
      pitch: resolveNumberPath(resolver, card, 'render.pitch', render.pitch, 0),
      sign: resolveNumberPath(resolver, card, 'render.sign', render.sign, index, 'Int'),
      speedLimit: resolveNumberPath(resolver, card, 'render.speedLimit', render.speedLimit, 32)
    }
  };
}

function resolveNumberPath(resolver, card, path, value, fallback = 0, expectedType = 'Double') {
  const binding = resolveBindingValue(resolver, card, path, [expectedType]);
  if (binding) return toFiniteNumber(binding.value?.value, fallback);
  return toFiniteNumber(value, fallback);
}

function resolveVectorPath(resolver, card, path, value = {}, allowedTypes = ['Vec3', 'RelativeLocation'], componentType = 'Double') {
  const fallback = vectorFrom(value);
  const binding = resolveBindingValue(resolver, card, path, allowedTypes);
  if (binding) return parseVectorLiteral(binding.value?.value, fallback);
  return vec(
    resolveNumberPath(resolver, card, `${path}.x`, fallback.x, fallback.x, componentType),
    resolveNumberPath(resolver, card, `${path}.y`, fallback.y, fallback.y, componentType),
    resolveNumberPath(resolver, card, `${path}.z`, fallback.z, fallback.z, componentType)
  );
}

function resolveColorPath(resolver, card, path, hex) {
  const fallback = hexToRgb(hex);
  const binding = resolveBindingValue(resolver, card, path, ['Vector3f']);
  if (binding) {
    const vector = parseVectorLiteral(binding.value?.value, vec(255, 255, 255));
    return {
      r: clamp(vector.x, 0, 1) * 255,
      g: clamp(vector.y, 0, 1) * 255,
      b: clamp(vector.z, 0, 1) * 255
    };
  }
  return {
    r: resolveNumberFromPaths(resolver, card, [`${path}.r`, `${path}.x`], fallback.r),
    g: resolveNumberFromPaths(resolver, card, [`${path}.g`, `${path}.y`], fallback.g),
    b: resolveNumberFromPaths(resolver, card, [`${path}.b`, `${path}.z`], fallback.b)
  };
}

function resolveNumberFromPaths(resolver, card, paths, fallback = 0) {
  const path = paths.find((item) => String(card?.bindings?.[item] || '').trim());
  if (!path) return fallback;
  return clamp(resolveNumberPath(resolver, card, path, fallback, fallback), 0, 255);
}

function resolveBindingValue(resolver, card, path, expectedTypes) {
  const name = String(card?.bindings?.[path] || '').trim();
  if (!name) return null;
  const value = resolver.values.get(name);
  if (!value) {
    reportBindingError(resolver, card, path, name, `未找到变量 ${name}`);
    return null;
  }
  const type = String(value.type || '');
  const accepts = expectedTypes instanceof Set ? expectedTypes.has(type) : expectedTypes.includes(type);
  if (!accepts) {
    reportBindingError(resolver, card, path, name, `${name} 类型是 ${type || '未知'}，不适用于这里`);
    return null;
  }
  return { name, value };
}

function reportBindingError(resolver, card, path, name, reason) {
  if (!resolver.collectErrors) return;
  const key = `${card?.id || ''}:${path}:${name}:${reason}`;
  if (resolver.seenErrors.has(key)) return;
  resolver.seenErrors.add(key);
  resolver.errors.push({
    key,
    message: `${card?.name || '发射器'} / ${formatBindingPath(path)}：${reason}，已使用默认值`
  });
}

function formatBindingPath(path) {
  const text = String(path || '');
  const axis = text.match(/\.([xyzrgb])$/i)?.[1]?.toUpperCase();
  const base = axis ? text.slice(0, -2) : text;
  return `${BINDING_PATH_LABELS[base] || base}${axis ? `.${axis}` : ''}`;
}

function parseVectorLiteral(rawValue, fallback = vec()) {
  if (Array.isArray(rawValue)) return vec(
    toFiniteNumber(rawValue[0], fallback.x),
    toFiniteNumber(rawValue[1], fallback.y),
    toFiniteNumber(rawValue[2], fallback.z)
  );
  if (rawValue && typeof rawValue === 'object') return vectorFrom(rawValue, fallback);
  const text = String(rawValue || '').trim();
  const match = text.match(/^[A-Za-z0-9_]+\s*\(([^)]+)\)$/);
  if (!match) return { ...fallback };
  const parts = match[1].split(',').map((item) => item.trim().replace(/[fFdDlL]$/g, ''));
  return vec(
    toFiniteNumber(parts[0], fallback.x),
    toFiniteNumber(parts[1], fallback.y),
    toFiniteNumber(parts[2], fallback.z)
  );
}

function rgbToHexObject(rgb) {
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isIdent(raw) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(raw || '').trim());
}

function attachPreviewErrors(target, errors) {
  Object.defineProperty(target, 'errors', {
    value: Array.isArray(errors) ? errors : [],
    configurable: true,
    writable: true,
    enumerable: false
  });
  return target;
}

export function createGeneratorPreviewRuntime() {
  const runtime = {
    tick: 0,
    particles: [],
    emitters: new Map(),
    shapeCache: new Map(),
    snapshotPoints: [],
    renderBuffers: createRenderBuffers(256),
    renderPlan: null
  };

  function reset() {
    runtime.tick = 0;
    runtime.particles = [];
    runtime.snapshotPoints = [];
    runtime.emitters.clear();
    runtime.shapeCache.clear();
    runtime.renderPlan = null;
  }

  function clearParticles() {
    runtime.particles = [];
    runtime.snapshotPoints = [];
  }

  function step(project, tickCount = 1) {
    const steps = Math.max(1, Math.trunc(Number(tickCount) || 1));
    for (let i = 0; i < steps; i += 1) tickOnce(project || {});
  }

  function tickOnce(project) {
    const resolver = createBindingResolver(project);
    const emitters = (Array.isArray(project.emitters) ? project.emitters : [])
      .map((card, index) => resolveEmitterCard(project, card, resolver, index));
    const builderPointsByEmitter = new Map();
    const builderPointsFor = (card) => getBuilderPointsForTick(
      card,
      builderPointsByEmitter,
      runtime.shapeCache,
      project.parameters
    );
    syncEmitterRuntime(runtime, emitters);
    const tick = runtime.tick;

    if (shouldParentEmit(project.rootLifecycle, tick)) {
      emitters.forEach((card) => {
        if (!card?.enabled || !isEmitterActive(card, tick)) return;
        const state = runtime.emitters.get(String(card.id || ''));
        if (!state) return;
        const mode = card.emission?.mode || 'continuous';
        if (mode === 'once') {
          if (state.emittedOnce) return;
          spawnFor(card, builderPointsFor(card));
          state.emittedOnce = true;
          return;
        }
        if (mode === 'burst') {
          const interval = Math.max(1, Math.trunc(Number(card.emission?.burstInterval || 1)));
          if (state.burstTick % interval === 0) spawnFor(card, builderPointsFor(card));
          state.burstTick += 1;
          return;
        }
        spawnFor(card, builderPointsFor(card));
      });
    }

    const queues = collectCommandQueues(project.commandQueues);
    const hasCommands = queues.length > 0;
    for (let index = runtime.particles.length - 1; index >= 0; index -= 1) {
      const particle = runtime.particles[index];
      particle.age += 1;
      if (hasCommands) applyCommandQueues(queues, particle, tick);
      particle.prev.x = particle.pos.x;
      particle.prev.y = particle.pos.y;
      particle.prev.z = particle.pos.z;
      particle.pos.x += particle.vel.x;
      particle.pos.y += particle.vel.y;
      particle.pos.z += particle.vel.z;

      if (particle.age >= particle.life) {
        if (project.deathBehavior?.enabled && project.deathBehavior?.mode === 'respawn') {
          respawnParticle(particle, builderPointsFor(particle.card || {}));
        } else {
          removeParticleAt(runtime, index);
        }
      }
    }
    runtime.tick += 1;
  }

  function spawnFor(card, builderPoints) {
    const countMin = Math.max(0, Math.trunc(Number(card.particle?.countMin || 0)));
    const countMax = Math.max(countMin, Math.trunc(Number(card.particle?.countMax || countMin)));
    const count = randomInt(countMin, countMax);
    for (let i = 0; i < count && runtime.particles.length < MAX_SIM_PARTICLES; i += 1) {
      runtime.particles.push(createParticle(card, builderPoints));
    }
  }

  function snapshot(project, options = {}) {
    const plan = getRenderPlan(project);
    const points = runtime.snapshotPoints;
    points.length = 0;
    const particles = runtime.particles;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const context = resolveParticleRenderContext(particle, plan);
      if (!context?.enabled || context.textureSheet === 'NO_RENDER') continue;
      points.push(particleToPreviewPoint(particle, context));
    }
    const result = options.copy === false ? points : points.slice();
    Object.defineProperty(result, 'effectSignature', {
      value: plan.effectSignature,
      configurable: true,
      writable: true,
      enumerable: false
    });
    attachPreviewErrors(result, plan.errors);
    return result;
  }

  function snapshotRenderData(project) {
    const plan = getRenderPlan(project);
    if (!plan.effectSignature || plan.effectSignature.includes('|') || !plan.canUseBillboardBuffers) {
      return snapshot(project);
    }

    ensureRenderBuffers(runtime, runtime.particles.length);
    const buffers = runtime.renderBuffers;
    const particles = runtime.particles;
    let count = 0;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const context = resolveParticleRenderContext(particle, plan);
      if (!context?.enabled || context.textureSheet === 'NO_RENDER') continue;
      writeParticlePreviewData(particle, context, buffers, count);
      count += 1;
    }
    return {
      kind: 'preview-buffers',
      length: count,
      count,
      effectSignature: plan.effectSignature,
      effectClass: plan.effectSignature,
      positions: buffers.positions,
      prevPositions: buffers.prevPositions,
      colors: buffers.colors,
      alphas: buffers.alphas,
      sizes: buffers.sizes,
      rolls: buffers.rolls,
      lifeProgresses: buffers.lifeProgresses,
      errors: plan.errors
    };
  }

  function getRenderPlan(project) {
    const signature = makeRenderPlanSignature(project);
    if (runtime.renderPlan?.signature === signature) return runtime.renderPlan;
    const resolver = createBindingResolver(project, { collectErrors: true });
    const emitters = (Array.isArray(project?.emitters) ? project.emitters : [])
      .map((card, index) => resolveEmitterCard(project, card, resolver, index));
    const contexts = new Map(emitters
      .map((card) => [String(card.id || ''), createEmitterSnapshotContext(card)]));
    runtime.renderPlan = {
      signature,
      contexts,
      effectSignature: resolveEffectSignature(contexts),
      canUseBillboardBuffers: canUseBillboardBuffers(contexts),
      errors: resolver.errors
    };
    return runtime.renderPlan;
  }

  return {
    reset,
    clearParticles,
    step,
    snapshot,
    snapshotRenderData,
    getTick: () => runtime.tick,
    getParticleCount: () => runtime.particles.length
  };
}

function syncEmitterRuntime(runtime, emitters) {
  const activeIds = new Set();
  let removedEmitter = false;
  emitters.forEach((card) => {
    const id = String(card?.id || '');
    if (!id) return;
    activeIds.add(id);
    const emissionSignature = getEmissionRuntimeSignature(card);
    const state = runtime.emitters.get(id);
    if (!state) {
      runtime.emitters.set(id, { burstTick: 0, emittedOnce: false, emissionSignature });
    } else if (state.emissionSignature !== emissionSignature) {
      state.burstTick = 0;
      state.emittedOnce = false;
      state.emissionSignature = emissionSignature;
    }
  });
  Array.from(runtime.emitters.keys()).forEach((id) => {
    if (!activeIds.has(id)) {
      runtime.emitters.delete(id);
      removedEmitter = true;
    }
  });
  if (removedEmitter) {
    runtime.particles = runtime.particles.filter((particle) => activeIds.has(particle.cardId));
  }
}

function getEmissionRuntimeSignature(card) {
  const emission = card?.emission || {};
  const mode = ['continuous', 'burst', 'once'].includes(emission.mode) ? emission.mode : 'continuous';
  const startTick = Math.max(0, Math.trunc(Number(emission.startTick || 0)));
  const endTick = Math.trunc(Number(emission.endTick ?? -1));
  const burstInterval = Math.max(1, Math.trunc(Number(emission.burstInterval || 1)));
  return `${mode}:${startTick}:${endTick}:${burstInterval}`;
}

function shouldParentEmit(rootLifecycle = {}, tick) {
  const mode = rootLifecycle.mode || 'interval';
  if (mode === 'once') return tick === 0;
  if (mode === 'interval_n_tick') {
    const maxTick = Math.max(1, Math.trunc(Number(rootLifecycle.maxTick || 1)));
    if (tick >= maxTick) return false;
  }
  const interval = Math.max(1, Math.trunc(Number(rootLifecycle.intervalTick || 1)));
  return tick % interval === 0;
}

function isEmitterActive(card, tick) {
  const start = Math.max(0, Math.trunc(Number(card.emission?.startTick || 0)));
  const end = Math.trunc(Number(card.emission?.endTick ?? -1));
  return tick >= start && (end < 0 || tick <= end);
}

function createParticle(card, builderPoints) {
  const pos = sampleEmitterPoint(card, builderPoints);
  const velocity = sampleVelocity(card, pos);
  const lifeMin = Math.max(1, Math.trunc(Number(card.particle?.lifeMin || 1)));
  const lifeMax = Math.max(lifeMin, Math.trunc(Number(card.particle?.lifeMax || lifeMin)));
  const sizeMin = Math.max(0.001, Number(card.particle?.sizeMin || card.render?.baseScale?.x || 0.08));
  const sizeMax = Math.max(sizeMin, Number(card.particle?.sizeMax || sizeMin));
  return {
    cardId: String(card.id || ''),
    card,
    pos,
    prev: { ...pos },
    vel: velocity,
    age: 0,
    life: randomInt(lifeMin, lifeMax),
    baseSize: random(sizeMin, sizeMax),
    sign: Math.trunc(Number(card.render?.sign || 0)),
    seed: Math.trunc(Math.random() * 0x7fffffff),
    respawnCount: 0,
    previewPoint: {}
  };
}

function respawnParticle(particle, builderPoints) {
  const next = createParticle(particle.card || {}, builderPoints);
  particle.pos = next.pos;
  particle.prev = { ...next.pos };
  particle.vel = next.vel;
  particle.age = 0;
  particle.life = next.life;
  particle.baseSize = next.baseSize;
  particle.seed = next.seed;
  particle.respawnCount += 1;
}

function removeParticleAt(runtime, index) {
  const last = runtime.particles.length - 1;
  if (index !== last) runtime.particles[index] = runtime.particles[last];
  runtime.particles.pop();
}

function collectCommandQueues(rawQueues) {
  return (Array.isArray(rawQueues) ? rawQueues : []).map((queue) => ({
    signs: makeSignSet(queue?.signs),
    commands: (Array.isArray(queue?.commands) ? queue.commands : [])
      .filter((command) => command && command.enabled !== false)
      .map((command) => ({ ...command, type: normalizeCommandType(command.type) }))
  })).filter((queue) => queue.commands.length);
}

function makeSignSet(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const set = new Set();
  values.forEach((value) => {
    const sign = Math.trunc(Number(value));
    if (Number.isFinite(sign)) set.add(sign);
  });
  return set.size ? set : null;
}

function normalizeCommandType(type) {
  const text = String(type || '').trim();
  return COMMAND_ALIASES[text] || text || 'drag';
}

function applyCommandQueues(queues, particle, tick) {
  queues.forEach((queue) => {
    if (queue.signs && !queue.signs.has(particle.sign)) return;
    queue.commands.forEach((command) => {
      if (particle.age < Math.trunc(Number(command.tick || 0))) return;
      applyCommand(command, particle, tick);
    });
  });
}

function applyCommand(command, particle, tick) {
  const params = command.params && typeof command.params === 'object' ? command.params : command;
  const n = (key, fallback = 0) => numberParam(params, key, fallback);
  switch (command.type) {
    case 'drag': {
      const damping = Math.max(0, n('damping', 0.15));
      const minSpeed = Math.max(0, n('minSpeed', 0));
      const speed = vectorLength(particle.vel);
      if (minSpeed > 0 && speed <= minSpeed) {
        particle.vel = vec();
        return;
      }
      const factor = Math.exp(-damping);
      multiplyInPlace(particle.vel, factor * clamp(1 - Math.max(0, n('linear', 0)), 0, 1));
      return;
    }
    case 'gravity':
      particle.vel.y -= Math.max(0, n('gravity', 0.04));
      return;
    case 'velocity_add':
      addInPlace(particle.vel, vecParam(params, 'delta'));
      return;
    case 'velocity_scale': {
      const scale = vecParam(params, 'scale', vec(1, 1, 1));
      particle.vel.x *= scale.x;
      particle.vel.y *= scale.y;
      particle.vel.z *= scale.z;
      return;
    }
    case 'attraction': {
      const target = vecParam(params, 'target');
      const delta = sub(target, particle.pos);
      const dist = Math.max(vectorLength(delta), Math.max(EPSILON, n('minDistance', 0.25)));
      const strength = n('strength', 0.8) * inversePowerFalloff(dist, n('range', 8), n('falloffPower', 2));
      addInPlace(particle.vel, multiply(delta, strength / dist));
      return;
    }
    case 'orbit':
      applyOrbitCommand(particle, params);
      return;
    case 'noise':
      applyNoiseCommand(particle, params);
      return;
    case 'flow_field':
      applyFlowFieldCommand(particle, params, tick);
      return;
    case 'vortex':
      applyVortexCommand(particle, params);
      return;
    case 'rotation_force':
      applyRotationForceCommand(particle, params);
      return;
    case 'toroidal_circulation':
      applyToroidalCommand(particle, params);
      return;
    case 'distortion':
      applyDistortionCommand(particle, params, tick);
      return;
    case 'inherit_velocity':
      applyInheritVelocityCommand(particle, params);
      return;
    case 'lifetime_motion':
      applyLifetimeMotionCommand(particle, params);
      return;
    default:
      return;
  }
}

function applyOrbitCommand(particle, params) {
  const center = vecParam(params, 'center');
  const axis = normalize(vecParam(params, 'axis', vec(0, 1, 0)));
  const rel = sub(particle.pos, center);
  const axial = multiply(axis, dot(rel, axis));
  const radial = sub(rel, axial);
  const radius = vectorLength(radial);
  if (radius < EPSILON) return;
  const radialUnit = multiply(radial, 1 / radius);
  const tangent = normalize(cross(axis, radialUnit));
  addInPlace(particle.vel, multiply(tangent, numberParam(params, 'angularSpeed', 0.35)));
  addInPlace(particle.vel, multiply(radialUnit, (numberParam(params, 'radius', radius) - radius) * numberParam(params, 'radialCorrect', 0.25)));
}

function applyNoiseCommand(particle, params) {
  const strength = numberParam(params, 'strength', 0.03);
  const frequency = numberParam(params, 'frequency', 0.15);
  const speed = numberParam(params, 'speed', 0.12);
  const t = particle.age * speed;
  const nx = valueNoise(particle.pos.x * frequency + t, particle.pos.y * frequency, particle.pos.z * frequency, particle.seed + 11) * 2 - 1;
  const ny = valueNoise(particle.pos.y * frequency + t, particle.pos.z * frequency, particle.pos.x * frequency, particle.seed + 23) * 2 - 1;
  const nz = valueNoise(particle.pos.z * frequency + t, particle.pos.x * frequency, particle.pos.y * frequency, particle.seed + 37) * 2 - 1;
  const lifeScale = params.useLifeCurve === false ? 1 : 1 - clamp(particle.age / Math.max(1, particle.life), 0, 1);
  addInPlace(particle.vel, multiply(normalize(vec(nx, ny * numberParam(params, 'affectY', 1), nz)), strength * lifeScale));
  clampVelocity(particle.vel, Math.max(0, numberParam(params, 'clampSpeed', 0.8)));
}

function applyFlowFieldCommand(particle, params, tick) {
  const amp = numberParam(params, 'amplitude', 0.15) * 0.5;
  const frequency = numberParam(params, 'frequency', 0.25);
  const t = tick * numberParam(params, 'timeScale', 0.06) + numberParam(params, 'phaseOffset', 0);
  const offset = vecParam(params, 'worldOffset');
  const p = add(particle.pos, offset);
  particle.vel.x += (Math.sin((p.y + t) * frequency) + Math.cos((p.z - t) * frequency)) * amp;
  particle.vel.y += (Math.sin((p.z + t) * frequency) + Math.cos((p.x + t) * frequency)) * amp;
  particle.vel.z += (Math.sin((p.x - t) * frequency) + Math.cos((p.y - t) * frequency)) * amp;
}

function applyVortexCommand(particle, params) {
  const center = vecParam(params, 'center');
  const axis = normalize(vecParam(params, 'axis', vec(0, 1, 0)));
  const rel = sub(particle.pos, center);
  const axial = multiply(axis, dot(rel, axis));
  const radial = sub(rel, axial);
  const radius = vectorLength(radial);
  if (radius < EPSILON) return;
  const falloff = inversePowerFalloff(radius, numberParam(params, 'range', 10), numberParam(params, 'falloffPower', 2));
  const radialUnit = multiply(radial, 1 / radius);
  const tangent = normalize(cross(axis, radialUnit));
  addInPlace(particle.vel, multiply(tangent, numberParam(params, 'swirlStrength', 0.8) * falloff));
  addInPlace(particle.vel, multiply(radialUnit, -numberParam(params, 'radialPull', 0.35) * falloff));
  addInPlace(particle.vel, multiply(axis, numberParam(params, 'axialLift', 0) * falloff));
}

function applyRotationForceCommand(particle, params) {
  const center = vecParam(params, 'center');
  const axis = normalize(vecParam(params, 'axis', vec(0, 1, 0)));
  const rel = sub(particle.pos, center);
  const radial = sub(rel, multiply(axis, dot(rel, axis)));
  const radius = vectorLength(radial);
  if (radius < EPSILON) return;
  const tangent = normalize(cross(axis, radial));
  const falloff = inversePowerFalloff(radius, numberParam(params, 'range', 8), numberParam(params, 'falloffPower', 2));
  addInPlace(particle.vel, multiply(tangent, numberParam(params, 'strength', 0.35) * falloff));
}

function applyToroidalCommand(particle, params) {
  const center = vecParam(params, 'center');
  const axis = normalize(vecParam(params, 'axis', vec(0, 1, 0)));
  const rel = sub(particle.pos, center);
  const axial = dot(rel, axis);
  const radial = sub(rel, multiply(axis, axial));
  const radialLength = vectorLength(radial);
  if (radialLength < EPSILON) return;
  const radialUnit = multiply(radial, 1 / radialLength);
  const tangent = normalize(cross(axis, radialUnit));
  const ringRadius = numberParam(params, 'ringRadius', 3);
  const radialDelta = radialLength - ringRadius;
  const falloff = inversePowerFalloff(Math.hypot(radialDelta, axial), Math.max(numberParam(params, 'radialThickness', 1.2), numberParam(params, 'axialThickness', 0.8)), 2);
  addInPlace(particle.vel, multiply(tangent, numberParam(params, 'circulationStrength', 0.35) * falloff));
  addInPlace(particle.vel, multiply(radialUnit, numberParam(params, 'outwardStrength', 0) * falloff));
  addInPlace(particle.vel, multiply(axis, numberParam(params, 'upwardStrength', 0) * falloff));
  addInPlace(particle.vel, multiply(radialUnit, -radialDelta * numberParam(params, 'followStrength', 0.12) * falloff));
}

function applyDistortionCommand(particle, params, tick) {
  const center = vecParam(params, 'center');
  const axis = normalize(vecParam(params, 'axis', vec(0, 1, 0)));
  const rel = sub(particle.pos, center);
  const axial = multiply(axis, dot(rel, axis));
  const radial = sub(rel, axial);
  const radius = vectorLength(radial);
  if (radius < EPSILON) return;
  const radialUnit = multiply(radial, 1 / radius);
  const tangent = normalize(cross(axis, radialUnit));
  const phase = tick * numberParam(params, 'timeScale', 0.1) + numberParam(params, 'phaseOffset', 0) + particle.seed * 0.001;
  const wave = Math.sin((radius + phase) * numberParam(params, 'frequency', 0.25));
  addInPlace(particle.vel, multiply(radialUnit, wave * numberParam(params, 'radialStrength', 0.35)));
  addInPlace(particle.vel, multiply(axis, wave * numberParam(params, 'axialStrength', 0.25)));
  addInPlace(particle.vel, multiply(tangent, wave * numberParam(params, 'tangentialStrength', 0)));
}

function applyInheritVelocityCommand(particle, params) {
  const mode = String(params.mode || 'INITIAL');
  if (mode === 'INITIAL' && particle.age > 1) return;
  const source = vecParam(params, 'source');
  const mask = vecParam(params, 'axisMask', vec(1, 1, 1));
  const lifeWeight = clamp(numberParam(params, 'overLifetime', 1), 0, 1);
  const factor = numberParam(params, 'multiplier', 1) * lifeWeight;
  particle.vel.x += source.x * mask.x * factor;
  particle.vel.y += source.y * mask.y * factor;
  particle.vel.z += source.z * mask.z * factor;
  clampVelocity(particle.vel, numberParam(params, 'maxContributionSpeed', 0));
}

function applyLifetimeMotionCommand(particle, params) {
  const force = vecParam(params, 'force');
  const velocity = vecParam(params, 'velocity');
  addInPlace(particle.vel, force);
  const mode = String(params.velocityMode || 'ADD');
  if (mode === 'OVERRIDE') particle.vel = { ...velocity };
  else if (mode === 'MULTIPLY') {
    particle.vel.x *= velocity.x;
    particle.vel.y *= velocity.y;
    particle.vel.z *= velocity.z;
  } else {
    addInPlace(particle.vel, velocity);
  }
  clampVelocity(particle.vel, numberParam(params, 'maxVelocityDeltaPerTick', 0));
}

function createEmitterSnapshotContext(card) {
  const render = card?.render || {};
  const particle = card?.particle || {};
  const curves = card?.curves || {};
  const scaleMode = render.scaleMode === 'uniform_xy' ? 'uniform_xy' : 'xyz';
  const sizeSyncAxes = curves.size?.syncAxes === true;
  const rotationSyncAxes = curves.rotation?.syncAxes === true;
  const context = {
    enabled: card?.enabled !== false,
    effectClass: render.effectClass,
    textureSheet: render.textureSheet,
    billboardMode: render.billboardMode,
    axis: render.axis || { x: 0, y: 1, z: 0 },
    roll: Number(render.roll || 0),
    yaw: Number(render.yaw || 0),
    pitch: Number(render.pitch || 0),
    alpha: Number(render.alpha ?? 100) / 100,
    light: Number(render.light ?? 15),
    scaleMode,
    baseScale: render.baseScale || {},
    sizeSyncAxes,
    rotationSyncAxes,
    colorStart: hexToRgb(particle.colorStart),
    colorEnd: hexToRgb(particle.colorOverLifeEnabled ? particle.colorEnd : particle.colorStart),
    curves: {
      sizeX: prepareCurve(curves.size?.x, 1),
      sizeY: prepareCurve(sizeSyncAxes ? curves.size?.x : curves.size?.y, 1),
      sizeZ: prepareCurve(sizeSyncAxes ? curves.size?.x : curves.size?.z, 1),
      opacity: prepareCurve(curves.opacity, 100),
      brightness: prepareCurve(curves.brightness, Number(render.light ?? 15)),
      roll: prepareCurve(curves.rotation?.roll, 0),
      yaw: prepareCurve(rotationSyncAxes ? curves.rotation?.roll : curves.rotation?.yaw, 0),
      pitch: prepareCurve(rotationSyncAxes ? curves.rotation?.roll : curves.rotation?.pitch, 0)
    },
    visualSamplesByLife: null,
    sparseVisualSamples: null
  };
  const lifeMin = Math.max(1, Math.trunc(Number(particle.lifeMin) || 1));
  const lifeMax = Math.max(lifeMin, Math.trunc(Number(particle.lifeMax) || lifeMin));
  const lifeCount = lifeMax - lifeMin + 1;
  const estimatedSamples = ((lifeMin + lifeMax + 2) * lifeCount) / 2;
  if (estimatedSamples <= MAX_PREWARM_VISUAL_SAMPLES) {
    context.visualSamplesByLife = [];
    for (let life = lifeMin; life <= lifeMax; life += 1) {
      const samples = new Array(life + 1);
      for (let age = 0; age <= life; age += 1) {
        samples[age] = buildParticleVisualSample(age, life, context);
      }
      context.visualSamplesByLife[life] = samples;
    }
  } else {
    context.sparseVisualSamples = new Map();
  }
  return context;
}

function makeRenderPlanSignature(project) {
  return JSON.stringify({
    parameters: project?.parameters || {},
    emitters: Array.isArray(project?.emitters) ? project.emitters : []
  });
}

function resolveParticleRenderContext(particle, plan) {
  if (particle.previewRenderPlan !== plan) {
    particle.previewRenderPlan = plan;
    particle.previewRenderContext = plan.contexts.get(particle.cardId) || null;
  }
  return particle.previewRenderContext;
}

function resolveEffectSignature(contexts) {
  const names = new Set();
  contexts.forEach((context) => {
    if (context?.enabled && context.textureSheet !== 'NO_RENDER' && context.effectClass) {
      names.add(String(context.effectClass));
    }
  });
  return Array.from(names).sort().join('|');
}

function canUseBillboardBuffers(contexts) {
  let ok = true;
  contexts.forEach((context) => {
    if (!ok || !context?.enabled || context.textureSheet === 'NO_RENDER') return;
    if (context.billboardMode === 'none' || context.billboardMode === 'axis_billboard') ok = false;
  });
  return ok;
}

function createRenderBuffers(capacity) {
  return {
    capacity,
    positions: new Float32Array(capacity * 3),
    prevPositions: new Float32Array(capacity * 3),
    colors: new Float32Array(capacity * 3),
    alphas: new Float32Array(capacity),
    sizes: new Float32Array(capacity),
    rolls: new Float32Array(capacity),
    lifeProgresses: new Float32Array(capacity)
  };
}

function ensureRenderBuffers(runtime, count) {
  if (runtime.renderBuffers.capacity >= count) return;
  let capacity = runtime.renderBuffers.capacity || 256;
  while (capacity < count) capacity = Math.ceil(capacity * 1.5);
  runtime.renderBuffers = createRenderBuffers(capacity);
}

function writeParticlePreviewData(particle, context, buffers, index) {
  const visual = getParticleVisualSample(particle, context);
  const sx = particle.baseSize * visual.sizeScaleX;
  const sy = particle.baseSize * visual.sizeScaleY;
  const offset = index * 3;
  buffers.positions[offset] = particle.pos.x;
  buffers.positions[offset + 1] = particle.pos.y;
  buffers.positions[offset + 2] = particle.pos.z;
  buffers.prevPositions[offset] = particle.prev.x;
  buffers.prevPositions[offset + 1] = particle.prev.y;
  buffers.prevPositions[offset + 2] = particle.prev.z;
  buffers.colors[offset] = visual.r;
  buffers.colors[offset + 1] = visual.g;
  buffers.colors[offset + 2] = visual.b;
  buffers.alphas[index] = visual.alpha;
  buffers.sizes[index] = Math.max(0.001, Math.max(0.01, sx, sy) * 1.6);
  buffers.rolls[index] = visual.roll;
  buffers.lifeProgresses[index] = visual.lifeProgress;
}

function particleToPreviewPoint(particle, context) {
  const point = particle.previewPoint || (particle.previewPoint = {});
  const visual = getParticleVisualSample(particle, context);
  const sx = particle.baseSize * visual.sizeScaleX;
  const sy = particle.baseSize * visual.sizeScaleY;
  const sz = particle.baseSize * visual.sizeScaleZ;
  point.r = visual.r;
  point.g = visual.g;
  point.b = visual.b;
  point.x = particle.pos.x;
  point.y = particle.pos.y;
  point.z = particle.pos.z;
  point.prevX = particle.prev.x;
  point.prevY = particle.prev.y;
  point.prevZ = particle.prev.z;
  point.alpha = visual.alpha;
  point.light = visual.light;
  point.effectClass = context.effectClass;
  point.textureSheet = context.textureSheet;
  point.billboardMode = context.billboardMode;
  point.axis = context.axis;
  point.roll = visual.roll;
  point.yaw = visual.yaw;
  point.pitch = visual.pitch;
  point.scaleX = sx;
  point.scaleY = sy;
  point.scaleZ = sz;
  point.size = Math.max(0.01, sx, sy);
  point.age = particle.age;
  point.life = particle.life;
  point.seed = particle.seed;
  return point;
}

function getParticleVisualSample(particle, context) {
  const life = particle.life > 0 ? particle.life : 1;
  const rawAge = particle.age | 0;
  const age = rawAge < 0 ? 0 : (rawAge > life ? life : rawAge);
  if (context.visualSamplesByLife) {
    let samples = context.visualSamplesByLife[life];
    if (!samples) {
      samples = new Array(life + 1);
      context.visualSamplesByLife[life] = samples;
    }
    let sample = samples[age];
    if (sample) return sample;
    sample = buildParticleVisualSample(age, life, context);
    samples[age] = sample;
    return sample;
  }
  const sparse = context.sparseVisualSamples || (context.sparseVisualSamples = new Map());
  const key = life * 100001 + age;
  let sample = sparse.get(key);
  if (sample) return sample;
  sample = buildParticleVisualSample(age, life, context);
  if (sparse.size >= MAX_SPARSE_VISUAL_SAMPLES) {
    const first = sparse.keys().next();
    if (!first.done) sparse.delete(first.value);
  }
  sparse.set(key, sample);
  return sample;
}

function buildParticleVisualSample(age, life, context) {
  const lifeProgress = clamp(age / life, 0, 1);
  const agePercent = lifeProgress * 100;
  const scaleMode = context.scaleMode;
  const baseScale = context.baseScale;
  const sizeCurveX = Math.max(0, samplePreparedCurve(context.curves.sizeX, agePercent, 1));
  const sizeCurveY = Math.max(0, samplePreparedCurve(context.curves.sizeY, agePercent, 1));
  const sizeCurveZ = Math.max(0, samplePreparedCurve(context.curves.sizeZ, agePercent, 1));
  const light = clamp(samplePreparedCurve(context.curves.brightness, agePercent, context.light), -1, 15);
  const factor = light < 0 ? 0.62 : 0.5 + clamp(light, 0, 15) / 30;
  const rotation = sampleRotation(context, agePercent);
  return {
    r: clamp(mix(context.colorStart.r, context.colorEnd.r, lifeProgress) * factor, 0, 255) / 255,
    g: clamp(mix(context.colorStart.g, context.colorEnd.g, lifeProgress) * factor, 0, 255) / 255,
    b: clamp(mix(context.colorStart.b, context.colorEnd.b, lifeProgress) * factor, 0, 255) / 255,
    alpha: clamp(context.alpha * (samplePreparedCurve(context.curves.opacity, agePercent, 100) / 100), 0, 1),
    light,
    roll: rotation.roll,
    yaw: rotation.yaw,
    pitch: rotation.pitch,
    sizeScaleX: Math.max(0, Number(baseScale.x ?? 1)) * sizeCurveX,
    sizeScaleY: Math.max(0, Number((scaleMode === 'xyz' ? baseScale.y : baseScale.x) ?? 1)) * sizeCurveY,
    sizeScaleZ: Math.max(0, Number((scaleMode === 'xyz' ? baseScale.z : baseScale.x) ?? 1)) * sizeCurveZ,
    lifeProgress
  };
}

function sampleRotation(context, agePercent) {
  const rollCurve = samplePreparedCurve(context.curves.roll, agePercent, 0);
  const yawCurve = samplePreparedCurve(context.curves.yaw, agePercent, 0);
  const pitchCurve = samplePreparedCurve(context.curves.pitch, agePercent, 0);
  return {
    roll: context.roll + rollCurve,
    yaw: context.billboardMode === 'none' ? context.yaw + yawCurve : 0,
    pitch: context.billboardMode === 'none' ? context.pitch + pitchCurve : 0
  };
}

function prepareCurve(curve, fallback = 0) {
  const frames = Array.isArray(curve?.keyframes)
    ? curve.keyframes.slice().sort((a, b) => Number(a.time || 0) - Number(b.time || 0))
    : [];
  return {
    mode: curve?.mode,
    defaultValue: Number(curve?.defaultValue ?? fallback),
    frames
  };
}

function samplePreparedCurve(curve, percent, fallback = 0) {
  const frames = curve?.frames || [];
  if (!frames.length) return Number(curve?.defaultValue ?? fallback);
  if (frames.length === 1) return Number(frames[0].value ?? fallback);
  const t = clamp(percent, 0, 100);
  if (t <= Number(frames[0].time || 0)) return Number(frames[0].value ?? fallback);
  const last = frames[frames.length - 1];
  if (t >= Number(last.time || 0)) return Number(last.value ?? fallback);
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (t > Number(next.time || 0)) continue;
    if (curve?.mode === 'bezier') return sampleBezier(prev, next, t);
    const start = Number(prev.time || 0);
    const span = Math.max(0.0001, Number(next.time || 0) - start);
    const alpha = (t - start) / span;
    return mix(Number(prev.value || 0), Number(next.value || 0), alpha);
  }
  return Number(last.value ?? fallback);
}

function sampleBezier(a, b, percent) {
  const x0 = Number(a.time || 0);
  const y0 = Number(a.value || 0);
  const x3 = Number(b.time || 0);
  const y3 = Number(b.value || 0);
  const x1 = clamp(x0 + Number(a.out?.x || 0), 0, 100);
  const y1 = y0 + Number(a.out?.y || 0);
  const x2 = clamp(x3 + Number(b.in?.x || 0), 0, 100);
  const y2 = y3 + Number(b.in?.y || 0);
  let bestDistance = Infinity;
  let bestValue = y0;
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const x = cubic(x0, x1, x2, x3, t);
    const distance = Math.abs(x - percent);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = cubic(y0, y1, y2, y3, t);
    }
  }
  return bestValue;
}

function cubic(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function sampleEmitterPoint(card, builderPoints) {
  const type = card.emitter?.type || 'point';
  const offset = vectorFrom(card.emitter?.offset);
  if (type === 'point') return { ...offset };
  if (type === 'points_builder') {
    const source = Array.isArray(builderPoints) ? builderPoints : [];
    if (!source.length) return { ...offset };
    const point = source[randomInt(0, source.length - 1)];
    return add(vectorFrom(point), offset);
  }
  if (type === 'box') {
    const box = card.emitter?.box || {};
    let point = vec((Math.random() - 0.5) * Number(box.x || 1), (Math.random() - 0.5) * Number(box.y || 1), (Math.random() - 0.5) * Number(box.z || 1));
    if (box.surface) {
      const axis = randomInt(0, 2);
      if (axis === 0) point.x = (Math.random() < 0.5 ? -0.5 : 0.5) * Number(box.x || 1);
      if (axis === 1) point.y = (Math.random() < 0.5 ? -0.5 : 0.5) * Number(box.y || 1);
      if (axis === 2) point.z = (Math.random() < 0.5 ? -0.5 : 0.5) * Number(box.z || 1);
    }
    return add(point, offset);
  }
  if (type === 'sphere' || type === 'sphere_surface') {
    const radius = type === 'sphere' ? Number(card.emitter?.sphere?.r || 1) : Number(card.emitter?.sphereSurface?.r || 1);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = type === 'sphere' ? radius * Math.cbrt(Math.random()) : radius;
    return add(vec(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r), offset);
  }
  if (type === 'line') {
    const dir = normalize(vectorFrom(card.emitter?.line?.dir, vec(1, 0, 0)));
    const count = Math.max(1, Math.trunc(Number(card.particle?.countMax || 1)));
    return add(multiply(dir, randomInt(0, count - 1) * Number(card.emitter?.line?.step || 0.2)), offset);
  }
  if (type === 'circle') {
    const angle = Math.random() * Math.PI * 2;
    const r = Number(card.emitter?.circle?.r || 1);
    return add(rotateFromYAxis(vec(Math.cos(angle) * r, 0, Math.sin(angle) * r), vectorFrom(card.emitter?.circle?.axis, vec(0, 1, 0))), offset);
  }
  if (type === 'arc') {
    const arc = card.emitter?.arc || {};
    const start = Math.min(Number(arc.start || 0), Number(arc.end || 0)) * Math.PI / 180;
    const end = Math.max(Number(arc.start || 0), Number(arc.end || 0)) * Math.PI / 180;
    const angle = random(start, end) + Number(arc.rotate || 0) * Math.PI / 180;
    const r = Number(arc.r || 1);
    return add(rotateFromYAxis(vec(Math.cos(angle) * r, 0, Math.sin(angle) * r), vectorFrom(arc.axis, vec(0, 1, 0))), offset);
  }
  if (type === 'spiral') {
    const spiral = card.emitter?.spiral || {};
    const t = Math.random();
    const radius = mix(Number(spiral.startR || 0.5), Number(spiral.endR || 2.5), Math.pow(t, Number(spiral.rBias || 1)));
    const height = Math.pow(t, Number(spiral.hBias || 1)) * Number(spiral.height || 2);
    const angle = t * Number(spiral.rotateSpeed || 0.35) * Math.PI * 8;
    return add(rotateFromYAxis(vec(Math.cos(angle) * radius, height, Math.sin(angle) * radius), vectorFrom(spiral.axis, vec(0, 1, 0))), offset);
  }
  const ring = card.emitter?.ring || {};
  const angle = Math.random() * Math.PI * 2;
  const radius = Number(ring.r || 1) + (Math.random() - 0.5) * Number(ring.thickness || 0);
  return add(rotateFromYAxis(vec(Math.cos(angle) * radius, 0, Math.sin(angle) * radius), vectorFrom(ring.axis, vec(0, 1, 0))), offset);
}

function getBuilderPointsForTick(card, tickCache, shapeCache, parameters) {
  if (card?.emitter?.type !== 'points_builder') return null;
  const id = String(card?.id || '');
  const cacheKey = id || card;
  if (!tickCache.has(cacheKey)) {
    tickCache.set(cacheKey, getCachedBuilderPoints(card, shapeCache, parameters));
  }
  return tickCache.get(cacheKey);
}

function getCachedBuilderPoints(card, shapeCache, parameters) {
  const id = String(card?.id || '');
  const builderState = card?.emitter?.builderState || {};
  const signature = JSON.stringify({ builderState, parameters: parameters || {} });
  const cacheKey = id || signature;
  const cached = shapeCache?.get(cacheKey);
  if (cached?.signature === signature) return cached.points;
  let points = [];
  try {
    points = evaluatePointsProject(builderState, { parameters }).map((point) => vectorFrom(point));
  } catch {
    points = [];
  }
  shapeCache?.set(cacheKey, { signature, points });
  return points;
}

function sampleVelocity(card, spawnPos) {
  const particle = card.particle || {};
  const offset = vectorFrom(card.emitter?.offset);
  const mode = particle.velocityMode || particle.velMode;
  let direction = mode === 'spawn_relative' || mode === 'spawn_rel'
    ? sub(spawnPos, offset)
    : vectorFrom(particle.velocity || particle.vel);
  const randomSpread = vectorFrom(particle.velocityRandom || particle.velRandom);
  direction = add(direction, vec(
    random(-randomSpread.x, randomSpread.x),
    random(-randomSpread.y, randomSpread.y),
    random(-randomSpread.z, randomSpread.z)
  ));
  const speedMin = Math.max(0, Number(particle.speedMin ?? particle.velSpeedMin ?? 0));
  const speedMax = Math.max(speedMin, Number(particle.speedMax ?? particle.velSpeedMax ?? speedMin));
  const speed = random(speedMin, speedMax);
  return vectorLength(direction) < EPSILON ? vec() : multiply(normalize(direction), speed);
}

function rotateFromYAxis(value, axis) {
  const target = normalize(axis);
  const up = vec(0, 1, 0);
  const c = clamp(dot(up, target), -1, 1);
  if (c > 1 - EPSILON) return value;
  if (c < -1 + EPSILON) return vec(value.x, -value.y, -value.z);
  const k = normalize(cross(up, target));
  const s = Math.sqrt(1 - c * c);
  return add(add(multiply(value, c), multiply(cross(k, value), s)), multiply(k, dot(k, value) * (1 - c)));
}

function numberParam(params, key, fallback = 0) {
  const value = params?.[key];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function vecParam(params, prefix, fallback = vec()) {
  return vec(
    numberParam(params, `${prefix}X`, fallback.x),
    numberParam(params, `${prefix}Y`, fallback.y),
    numberParam(params, `${prefix}Z`, fallback.z)
  );
}

function vectorFrom(raw, fallback = vec()) {
  return vec(
    Number.isFinite(Number(raw?.x)) ? Number(raw.x) : fallback.x,
    Number.isFinite(Number(raw?.y)) ? Number(raw.y) : fallback.y,
    Number.isFinite(Number(raw?.z)) ? Number(raw.z) : fallback.z
  );
}

function vec(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function add(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function multiply(value, scalar) {
  return vec(value.x * scalar, value.y * scalar, value.z * scalar);
}

function addInPlace(target, value) {
  target.x += value.x;
  target.y += value.y;
  target.z += value.z;
}

function multiplyInPlace(target, scalar) {
  target.x *= scalar;
  target.y *= scalar;
  target.z *= scalar;
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function vectorLength(value) {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value) {
  const length = vectorLength(value);
  return length < EPSILON ? vec() : multiply(value, 1 / length);
}

function clampVelocity(value, maxSpeed) {
  if (!(maxSpeed > 0)) return;
  const speed = vectorLength(value);
  if (speed > maxSpeed) multiplyInPlace(value, maxSpeed / speed);
}

function inversePowerFalloff(distance, range, power) {
  const safeRange = Math.max(EPSILON, Number(range) || 1);
  const safePower = Math.max(1, Number(power) || 1);
  return 1 / (1 + Math.pow(distance / safeRange, safePower));
}

function valueNoise(x, y, z, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.001) * 43758.5453;
  return n - Math.floor(n);
}

function interpolateHex(startHex, endHex, alpha, light = 15) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const factor = light < 0 ? 0.62 : 0.5 + clamp(light, 0, 15) / 30;
  const r = clamp(mix(start.r, end.r, alpha) * factor, 0, 255);
  const g = clamp(mix(start.g, end.g, alpha) * factor, 0, 255);
  const b = clamp(mix(start.b, end.b, alpha) * factor, 0, 255);
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const text = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? String(hex).slice(1) : 'ffffff';
  const value = Number.parseInt(text, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function random(min, max) {
  return min + (max - min) * Math.random();
}

function randomInt(min, max) {
  return Math.floor(random(min, max + 1));
}

function mix(a, b, alpha) {
  return a + (b - a) * alpha;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}
