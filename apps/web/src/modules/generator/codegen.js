import { curveToKotlin } from './curves.js';
import { TEXTURE_SHEET_OPTIONS, normalizeGeneratorProject } from './defaults.js';
import { normalizeGeneratorLongValue, normalizeGeneratorVectorValue } from './parameter-values.js';
import { generatePointsBuilderKotlin } from '../pointsbuilder/codegen.js';

function safeIdent(raw, fallback = 'GeneratedEmitter') {
  const text = String(raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!text) return fallback;
  return /^[A-Za-z_]/.test(text) ? text : `_${text}`;
}

function safeKotlinReference(raw, fallback) {
  const text = String(raw || '').trim();
  if (!text) return fallback;
  const parts = text.split('.').map((part) => safeIdent(part, '')).filter(Boolean);
  return parts.length ? parts.join('.') : fallback;
}

function safePackage(raw) {
  const text = String(raw || '').trim().replace(/^package\s+/i, '').replace(/;+$/g, '');
  if (!text) return '';
  return text.split('.').map((part) => safeIdent(part, '')).filter(Boolean).join('.');
}

function fmtD(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number(fallback).toFixed(1);
  if (Math.trunc(numeric) === numeric) return `${numeric.toFixed(1)}`;
  return Number(numeric.toFixed(6)).toString();
}

function fmtF(value, fallback = 0) {
  return `${fmtD(value, fallback)}f`;
}

function fmtI(value, fallback = 0) {
  const numeric = Number(value);
  return String(Math.trunc(Number.isFinite(numeric) ? numeric : fallback));
}

function fmtBool(value) {
  return value === true ? 'true' : 'false';
}

function fmtString(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function indent(text, spaces = 4) {
  const pad = ' '.repeat(spaces);
  return String(text || '').split('\n').map((line) => `${pad}${line}`).join('\n');
}

function vec3(value = {}) {
  return `Vec3(${fmtD(value.x)}, ${fmtD(value.y)}, ${fmtD(value.z)})`;
}

function isIdent(raw) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(raw || '').trim());
}

function projectValueMap(project) {
  const values = [
    ...(Array.isArray(project?.parameters?.variables) ? project.parameters.variables : []),
    ...(Array.isArray(project?.parameters?.constants) ? project.parameters.constants : [])
  ];
  return new Map(values.filter((item) => isIdent(item?.name)).map((item) => [item.name, item]));
}

function resolveBindingRef(project, card, path, expectedType = '') {
  const name = String(card?.bindings?.[path] || '').trim();
  if (!name) return null;
  const value = projectValueMap(project).get(name);
  if (!value || (expectedType && value.type !== expectedType)) return null;
  return { name, value };
}

function resolveBinding(project, card, path, expectedType = '') {
  return resolveBindingRef(project, card, path, expectedType)?.name || '';
}

function numberExpr(project, card, path, value, fallback = 0) {
  const binding = resolveBinding(project, card, path, 'Double');
  return binding || fmtD(value, fallback);
}

function intExpr(project, card, path, value, fallback = 0) {
  const binding = resolveBinding(project, card, path, 'Int');
  return binding || fmtI(value, fallback);
}

function floatExpr(project, card, path, value, fallback = 0) {
  const binding = resolveBinding(project, card, path, 'Float');
  return binding || fmtF(value, fallback);
}

function vectorExpr(project, card, path, value = {}) {
  const binding = resolveBindingRef(project, card, path, 'Vec3');
  if (binding?.value?.type === 'Vec3') return binding.name;
  return `Vec3(${numberExpr(project, card, `${path}.x`, value.x)}, ${numberExpr(project, card, `${path}.y`, value.y)}, ${numberExpr(project, card, `${path}.z`, value.z)})`;
}

function relativeExpr(project, card, path, value = {}) {
  const binding = resolveBindingRef(project, card, path, 'RelativeLocation');
  if (binding?.value?.type === 'RelativeLocation') return binding.name;
  return `RelativeLocation(${numberExpr(project, card, `${path}.x`, value.x)}, ${numberExpr(project, card, `${path}.y`, value.y)}, ${numberExpr(project, card, `${path}.z`, value.z)})`;
}

function vec3Params(params = {}, prefix = '') {
  return `Vec3(${fmtD(params[`${prefix}X`])}, ${fmtD(params[`${prefix}Y`])}, ${fmtD(params[`${prefix}Z`])})`;
}

function supplierVec3(params = {}, prefix = '') {
  return `java.util.function.Supplier { ${vec3Params(params, prefix)} }`;
}

function rel(value = {}) {
  return `RelativeLocation(${fmtD(value.x)}, ${fmtD(value.y)}, ${fmtD(value.z)})`;
}

function cameraOptionConstant(mode) {
  if (mode === 'axis_billboard') return 'ParticleCameraOption.AXIS_BILLBOARD';
  if (mode === 'none') return 'ParticleCameraOption.ROTATION';
  return 'ParticleCameraOption.BILLBOARD';
}

const textureSheetIds = new Set(TEXTURE_SHEET_OPTIONS.map((item) => item.id));

function textureSheetStatement(project, card, sheet) {
  const binding = resolveBinding(project, card, 'render.textureSheet', 'String');
  if (binding) return `setTextureSheet(${binding})`;
  const value = String(sheet || 'PARTICLE_SHEET_TRANSLUCENT').trim();
  if (textureSheetIds.has(value)) {
    return `setTextureSheet(TextureSheetsEnum.${value})`;
  }
  return `setTextureSheet(${fmtString(value)})`;
}

function scaleCurveValues(rawCurve, scale) {
  const curve = JSON.parse(JSON.stringify(rawCurve || {}));
  if (Number.isFinite(Number(curve.defaultValue))) curve.defaultValue = Number(curve.defaultValue) * scale;
  if (Number.isFinite(Number(curve.min))) curve.min = Number(curve.min) * scale;
  if (Number.isFinite(Number(curve.max))) curve.max = Number(curve.max) * scale;
  if (Array.isArray(curve.keyframes)) {
    curve.keyframes.forEach((frame) => {
      if (Number.isFinite(Number(frame.value))) frame.value = Number(frame.value) * scale;
      if (frame.in && Number.isFinite(Number(frame.in.y))) frame.in.y = Number(frame.in.y) * scale;
      if (frame.out && Number.isFinite(Number(frame.out.y))) frame.out.y = Number(frame.out.y) * scale;
    });
  }
  return curve;
}

function degToRad(value) {
  return `(${fmtD(value)} * PI / 180.0).toFloat()`;
}

function curveDegToRad(base, curveName) {
  return `((${fmtD(base)} + ${curveName}.sample(lifeProgress)) * PI / 180.0).toFloat()`;
}

function constantCurve(value, fallback = 0) {
  return `ConstantFloatCurve(${fmtD(value, fallback)})`;
}

function vector3fFromHex(hex) {
  const raw = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? String(hex).slice(1) : 'ffffff';
  const intValue = Number.parseInt(raw, 16);
  return {
    x: ((intValue >> 16) & 255) / 255,
    y: ((intValue >> 8) & 255) / 255,
    z: (intValue & 255) / 255
  };
}

function vector3fExprFromHex(hex) {
  const color = vector3fFromHex(hex);
  return `Vector3f(${fmtF(color.x)}, ${fmtF(color.y)}, ${fmtF(color.z)})`;
}

function colorVectorBindingExpr(binding) {
  if (binding.value?.type === 'Vector3f') {
    return `Vector3f(${binding.name}.x.coerceIn(0f, 1f), ${binding.name}.y.coerceIn(0f, 1f), ${binding.name}.z.coerceIn(0f, 1f))`;
  }
  return '';
}

function colorChannelExpr(project, card, paths, fallback01) {
  const binding = paths.map((item) => resolveBinding(project, card, item, 'Double')).find(Boolean);
  return binding ? `((${binding}.toDouble()) / 255.0).coerceIn(0.0, 1.0).toFloat()` : fmtF(fallback01);
}

function colorExpr(project, card, path, hex) {
  const binding = resolveBindingRef(project, card, path, 'Vector3f');
  const vectorBinding = binding ? colorVectorBindingExpr(binding) : '';
  if (vectorBinding) return vectorBinding;
  const color = vector3fFromHex(hex);
  const channelPaths = [
    [`${path}.r`, `${path}.x`],
    [`${path}.g`, `${path}.y`],
    [`${path}.b`, `${path}.z`]
  ];
  if (channelPaths.some((paths) => paths.some((item) => resolveBinding(project, card, item, 'Double')))) {
    return `Vector3f(${colorChannelExpr(project, card, channelPaths[0], color.x)}, ${colorChannelExpr(project, card, channelPaths[1], color.y)}, ${colorChannelExpr(project, card, channelPaths[2], color.z)})`;
  }
  return vector3fExprFromHex(hex);
}

function emitEmitterPointBuilder(project, card, dataVar) {
  const type = card.emitter.type;
  const offset = card.emitter.offset;
  const lines = [];
  lines.push('PointsBuilder()');
  if (type === 'point') {
    lines.push(`    .addWith { List(${dataVar}.getRandomCount()) { ${relativeExpr(project, card, 'emitter.offset', offset)} } }`);
    return lines.join('\n');
  }
  if (type === 'points_builder') {
    const builderExpr = generatePointsBuilderKotlin(card.emitter.builderState || {})
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim());
    lines.push('    .addWith {');
    lines.push('        val locs = arrayListOf<RelativeLocation>()');
    if (builderExpr.length) {
      lines.push('        val source = (');
      builderExpr.forEach((line) => lines.push(`            ${line}`));
      lines.push('        ).createWithoutClone()');
    } else {
      lines.push('        val source = emptyList<RelativeLocation>()');
    }
    lines.push(`        val count = ${dataVar}.getRandomCount().coerceAtLeast(1)`);
    lines.push('        if (source.isEmpty()) {');
    lines.push(`            repeat(count) { locs.add(${relativeExpr(project, card, 'emitter.offset', offset)}) }`);
    lines.push('        } else {');
    lines.push('            val rand = Random.Default');
    lines.push('            repeat(count) {');
    lines.push('                val base = source[rand.nextInt(source.size)]');
    lines.push(`                locs.add(RelativeLocation(base.x + ${numberExpr(project, card, 'emitter.offset.x', offset.x)}, base.y + ${numberExpr(project, card, 'emitter.offset.y', offset.y)}, base.z + ${numberExpr(project, card, 'emitter.offset.z', offset.z)}))`);
    lines.push('            }');
    lines.push('        }');
    lines.push('        locs');
    lines.push('    }');
    return lines.join('\n');
  }
  if (type === 'box') {
    const box = card.emitter.box;
    lines.push('    .addWith {');
    lines.push('        val rand = Random.Default');
    lines.push('        val locs = arrayListOf<RelativeLocation>()');
    lines.push(`        repeat(${dataVar}.getRandomCount()) {`);
    lines.push(`            var x = (rand.nextDouble() - 0.5) * ${numberExpr(project, card, 'emitter.box.x', box.x)}`);
    lines.push(`            var y = (rand.nextDouble() - 0.5) * ${numberExpr(project, card, 'emitter.box.y', box.y)}`);
    lines.push(`            var z = (rand.nextDouble() - 0.5) * ${numberExpr(project, card, 'emitter.box.z', box.z)}`);
    if (box.surface) {
      lines.push('            when (rand.nextInt(3)) {');
      lines.push(`                0 -> x = (if (rand.nextBoolean()) -0.5 else 0.5) * ${numberExpr(project, card, 'emitter.box.x', box.x)}`);
      lines.push(`                1 -> y = (if (rand.nextBoolean()) -0.5 else 0.5) * ${numberExpr(project, card, 'emitter.box.y', box.y)}`);
      lines.push(`                else -> z = (if (rand.nextBoolean()) -0.5 else 0.5) * ${numberExpr(project, card, 'emitter.box.z', box.z)}`);
      lines.push('            }');
    }
    lines.push(`            locs.add(RelativeLocation(x + ${numberExpr(project, card, 'emitter.offset.x', offset.x)}, y + ${numberExpr(project, card, 'emitter.offset.y', offset.y)}, z + ${numberExpr(project, card, 'emitter.offset.z', offset.z)}))`);
    lines.push('        }');
    lines.push('        locs');
    lines.push('    }');
    return lines.join('\n');
  }
  if (type === 'sphere' || type === 'sphere_surface') {
    const radius = type === 'sphere' ? card.emitter.sphere.r : card.emitter.sphereSurface.r;
    const radiusPath = type === 'sphere' ? 'emitter.sphere.r' : 'emitter.sphereSurface.r';
    lines.push('    .addWith {');
    lines.push('        val rand = Random.Default');
    lines.push('        val locs = arrayListOf<RelativeLocation>()');
    lines.push(`        repeat(${dataVar}.getRandomCount()) {`);
    lines.push('            val u = rand.nextDouble()');
    lines.push('            val v = rand.nextDouble()');
    lines.push('            val theta = 2.0 * PI * u');
    lines.push('            val phi = acos(2.0 * v - 1.0)');
    lines.push('            val dx = sin(phi) * cos(theta)');
    lines.push('            val dy = cos(phi)');
    lines.push('            val dz = sin(phi) * sin(theta)');
    lines.push(type === 'sphere'
      ? `            val rr = ${numberExpr(project, card, radiusPath, radius)} * cbrt(rand.nextDouble())`
      : `            val rr = ${numberExpr(project, card, radiusPath, radius)}`);
    lines.push(`            locs.add(RelativeLocation(dx * rr + ${numberExpr(project, card, 'emitter.offset.x', offset.x)}, dy * rr + ${numberExpr(project, card, 'emitter.offset.y', offset.y)}, dz * rr + ${numberExpr(project, card, 'emitter.offset.z', offset.z)}))`);
    lines.push('        }');
    lines.push('        locs');
    lines.push('    }');
    return lines.join('\n');
  }
  if (type === 'line') {
    lines.push(`    .addLine(${relativeExpr(project, card, 'emitter.line.dir', card.emitter.line.dir)}, ${numberExpr(project, card, 'emitter.line.step', card.emitter.line.step)}, ${dataVar}.getRandomCount())`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(project, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'circle') {
    lines.push(`    .addCircle(${numberExpr(project, card, 'emitter.circle.r', card.emitter.circle.r)}, ${dataVar}.getRandomCount())`);
    lines.push(`    .rotateTo(${relativeExpr(project, card, 'emitter.circle.axis', card.emitter.circle.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(project, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'ring') {
    lines.push(`    .addDiscreteCircleXZ(${numberExpr(project, card, 'emitter.ring.r', card.emitter.ring.r)}, ${dataVar}.getRandomCount(), ${numberExpr(project, card, 'emitter.ring.thickness', card.emitter.ring.thickness)})`);
    lines.push(`    .rotateTo(${relativeExpr(project, card, 'emitter.ring.axis', card.emitter.ring.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(project, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'arc') {
    const arc = card.emitter.arc;
    lines.push(`    .addRadian(${numberExpr(project, card, 'emitter.arc.r', arc.r)}, ${dataVar}.getRandomCount(), ${numberExpr(project, card, 'emitter.arc.start', arc.start)} * PI / 180.0, ${numberExpr(project, card, 'emitter.arc.end', arc.end)} * PI / 180.0, ${numberExpr(project, card, 'emitter.arc.rotate', arc.rotate)} * PI / 180.0)`);
    lines.push(`    .rotateTo(${relativeExpr(project, card, 'emitter.arc.axis', arc.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(project, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'spiral') {
    const spiral = card.emitter.spiral;
    lines.push(`    .addSpiral(${numberExpr(project, card, 'emitter.spiral.startR', spiral.startR)}, ${numberExpr(project, card, 'emitter.spiral.endR', spiral.endR)}, ${numberExpr(project, card, 'emitter.spiral.height', spiral.height)}, ${dataVar}.getRandomCount().coerceAtLeast(2), ${numberExpr(project, card, 'emitter.spiral.rotateSpeed', spiral.rotateSpeed)}, ${numberExpr(project, card, 'emitter.spiral.rBias', spiral.rBias)}, ${numberExpr(project, card, 'emitter.spiral.hBias', spiral.hBias)})`);
    lines.push(`    .rotateTo(${relativeExpr(project, card, 'emitter.spiral.axis', spiral.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(project, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  lines.push(`    .addWith { List(${dataVar}.getRandomCount()) { ${relativeExpr(project, card, 'emitter.offset', offset)} } }`);
  return lines.join('\n');
}

function emitCurveDeclarations(card, index) {
  const n = index + 1;
  const lines = [];
  const prefix = `emitter${n}`;
  lines.push(`private val ${prefix}SizeX = ${curveToKotlin(card.curves.size.x, 1)}`);
  if (!card.curves.size.syncAxes && usesIndependentScale(card)) {
    lines.push(`private val ${prefix}SizeY = ${curveToKotlin(card.curves.size.y, 1)}`);
  }
  if (!card.curves.size.syncAxes && usesDepthScale(card)) {
    lines.push(`private val ${prefix}SizeZ = ${curveToKotlin(card.curves.size.z, 1)}`);
  }
  lines.push(`private val ${prefix}Brightness = ${curveToKotlin(card.curves.brightness, 15)}`);
  lines.push(`private val ${prefix}Opacity = ${curveToKotlin(scaleCurveValues(card.curves.opacity, 0.01), 1)}`);
  lines.push(`private val ${prefix}Roll = ${curveToKotlin(card.curves.rotation.roll, 0)}`);
  if (card.render.billboardMode === 'none' && !card.curves.rotation.syncAxes) {
    lines.push(`private val ${prefix}Yaw = ${curveToKotlin(card.curves.rotation.yaw, 0)}`);
    lines.push(`private val ${prefix}Pitch = ${curveToKotlin(card.curves.rotation.pitch, 0)}`);
  }
  return lines.join('\n');
}

function emitCommandQueueDeclarations(project) {
  const queues = project.commandQueues
    .map((queue, index) => ({ queue, index }))
    .filter(({ queue }) => Array.isArray(queue.commands) && queue.commands.some((command) => command.enabled !== false));
  if (!queues.length) return '';
  const lines = [];
  queues.forEach(({ queue, index }) => {
    lines.push(`private val commandQueue${index + 1} = ParticleCommandQueue()`);
    queue.commands.filter((command) => command.enabled !== false).forEach((command) => {
      lines.push(`    .add(${commandToKotlin(command)}) { _, particle -> particle.currentAge >= ${fmtI(command.tick)} }`);
    });
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function commandToKotlin(command) {
  const params = command.params || {};
  const p = (key, fallback = 0) => params[key] ?? fallback;
  const enumValue = (key, fallback, allowed) => {
    const value = String(params[key] || fallback);
    return allowed.includes(value) ? value : fallback;
  };

  if (command.type === 'drag') {
    return `ParticleDragCommand(damping = ${fmtD(p('damping', 0.15))}, minSpeed = ${fmtD(p('minSpeed'))}, linear = ${fmtD(p('linear'))})`;
  }
  if (command.type === 'gravity') {
    return 'ParticleGravityCommand(this)';
  }
  if (command.type === 'attraction') {
    return `ParticleAttractionCommand(target = ${supplierVec3(params, 'target')}, strength = ${fmtD(p('strength', 0.8))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.25))})`;
  }
  if (command.type === 'orbit') {
    const mode = enumValue('mode', 'PHYSICAL', ['PHYSICAL', 'SPRING', 'SNAP']);
    return `ParticleOrbitCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, radius = ${fmtD(p('radius', 3))}, angularSpeed = ${fmtD(p('angularSpeed', 0.35))}, radialCorrect = ${fmtD(p('radialCorrect', 0.25))}, minDistance = ${fmtD(p('minDistance', 0.2))}, mode = OrbitMode.${mode}).maxRadialStep(${fmtD(p('maxRadialStep', 0.5))})`;
  }
  if (command.type === 'noise') {
    return `ParticleNoiseCommand(strength = ${fmtD(p('strength', 0.03))}, frequency = ${fmtD(p('frequency', 0.15))}, speed = ${fmtD(p('speed', 0.12))}, affectY = ${fmtD(p('affectY', 1))}, clampSpeed = ${fmtD(p('clampSpeed', 0.8))}, useLifeCurve = ${fmtBool(params.useLifeCurve !== false)})`;
  }
  if (command.type === 'flow_field') {
    return `ParticleFlowFieldCommand(amplitude = ${fmtD(p('amplitude', 0.15))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.06))}, phaseOffset = ${fmtD(p('phaseOffset'))}, worldOffset = ${vec3Params(params, 'worldOffset')})`;
  }
  if (command.type === 'vortex') {
    return `ParticleVortexCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, swirlStrength = ${fmtD(p('swirlStrength', 0.8))}, radialPull = ${fmtD(p('radialPull', 0.35))}, axialLift = ${fmtD(p('axialLift'))}, range = ${fmtD(p('range', 10))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.2))})`;
  }
  if (command.type === 'rotation_force') {
    return `ParticleRotationForceCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, strength = ${fmtD(p('strength', 0.35))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))})`;
  }
  if (command.type === 'toroidal_circulation') {
    return `ParticleToroidalCirculationCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, ringRadius = ${fmtD(p('ringRadius', 3))}, radialThickness = ${fmtD(p('radialThickness', 1.2))}, axialThickness = ${fmtD(p('axialThickness', 0.8))}, circulationStrength = ${fmtD(p('circulationStrength', 0.35))}, outwardStrength = ${fmtD(p('outwardStrength'))}, upwardStrength = ${fmtD(p('upwardStrength'))}, followStrength = ${fmtD(p('followStrength', 0.12))}, maxStep = ${fmtD(p('maxStep', 0.6))}, useLifeCurve = ${fmtBool(params.useLifeCurve === true)})`;
  }
  if (command.type === 'distortion') {
    return `ParticleDistortionCommand(center = ${supplierVec3(params, 'center')}, axis = ${vec3Params(params, 'axis')}, radius = ${fmtD(p('radius', 3))}, radialStrength = ${fmtD(p('radialStrength', 0.35))}, axialStrength = ${fmtD(p('axialStrength', 0.25))}, tangentialStrength = ${fmtD(p('tangentialStrength'))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.1))}, phaseOffset = ${fmtD(p('phaseOffset'))}, followStrength = ${fmtD(p('followStrength', 0.35))}, maxStep = ${fmtD(p('maxStep', 0.6))}, baseAxial = ${fmtD(p('baseAxial'))}, seedOffset = ${fmtI(p('seedOffset'))}, useLifeCurve = ${fmtBool(params.useLifeCurve === true)})`;
  }
  if (command.type === 'inherit_velocity') {
    const mode = enumValue('mode', 'INITIAL', ['INITIAL', 'CURRENT']);
    const space = enumValue('space', 'WORLD', ['WORLD', 'LOCAL']);
    const base = `ParticleInheritVelocityCommand(source = ${supplierVec3(params, 'source')}, mode = ParticleInheritMode.${mode}, multiplier = ${fmtD(p('multiplier', 1))}, axisMask = ${vec3Params(params, 'axisMask')}, overLifetime = ${constantCurve(p('overLifetime', 1), 1)}, damping = ${fmtD(p('damping'))}, maxContributionSpeed = ${fmtD(p('maxContributionSpeed'))}, space = ParticleMotionSpace.${space})`;
    return `${base}.randomizePerParticle(${fmtBool(params.randomizePerParticle === true)}).randomScale(${fmtD(p('randomScaleMin', 1))}, ${fmtD(p('randomScaleMax', 1))}).randomSeedOffset(${fmtI(p('randomSeedOffset'))})`;
  }
  if (command.type === 'lifetime_motion') {
    const forceSpace = enumValue('forceSpace', 'WORLD', ['WORLD', 'LOCAL']);
    const velocitySpace = enumValue('velocitySpace', 'WORLD', ['WORLD', 'LOCAL']);
    const velocityMode = enumValue('velocityMode', 'ADD', ['ADD', 'OVERRIDE', 'MULTIPLY']);
    const base = `ParticleLifetimeMotionCommand(forceX = ${constantCurve(p('forceX'))}, forceY = ${constantCurve(p('forceY'))}, forceZ = ${constantCurve(p('forceZ'))}, velocityX = ${constantCurve(p('velocityX'))}, velocityY = ${constantCurve(p('velocityY'))}, velocityZ = ${constantCurve(p('velocityZ'))}, forceSpace = ParticleMotionSpace.${forceSpace}, velocitySpace = ParticleMotionSpace.${velocitySpace}, velocityMode = ParticleLifetimeVelocityMode.${velocityMode})`;
    return `${base}.randomizePerParticle(${fmtBool(params.randomizePerParticle === true)}).randomScale(${fmtD(p('randomScaleMin', 1))}, ${fmtD(p('randomScaleMax', 1))}).randomSeedOffset(${fmtI(p('randomSeedOffset'))}).maxVelocityDeltaPerTick(${fmtD(p('maxVelocityDeltaPerTick'))})`;
  }
  if (command.type === 'velocity_scale') {
    return `ParticleCommand { data, _ -> data.velocity = Vec3(data.velocity.x * ${fmtD(p('scaleX', 1))}, data.velocity.y * ${fmtD(p('scaleY', 1))}, data.velocity.z * ${fmtD(p('scaleZ', 1))}) }`;
  }
  return `ParticleCommand { data, _ -> data.velocity = data.velocity.add(${fmtD(p('deltaX'))}, ${fmtD(p('deltaY'))}, ${fmtD(p('deltaZ'))}) }`;
}

function emitCommandQueueApplication(project) {
  const queues = project.commandQueues
    .map((queue, index) => ({ queue, index }))
    .filter(({ queue }) => Array.isArray(queue.commands) && queue.commands.some((command) => command.enabled !== false));
  if (!queues.length) return [];
  const lines = [];
  queues.forEach(({ queue, index }) => {
    const signs = Array.isArray(queue.signs) ? queue.signs : [];
    const condition = signs.length ? `data.sign in setOf(${signs.map((value) => fmtI(value)).join(', ')})` : 'true';
    lines.push(`        if (${condition}) commandQueue${index + 1}.applyVelocity(data, this)`);
  });
  return lines;
}

function defaultLiteralForType(type, value) {
  const normalized = String(type || 'Double');
  if (normalized === 'Int') return fmtI(value);
  if (normalized === 'Long') return `${normalizeGeneratorLongValue(value)}L`;
  if (normalized === 'Float') return fmtF(value);
  if (normalized === 'Double') return fmtD(value);
  if (normalized === 'Boolean') return value === true || value === 'true' ? 'true' : 'false';
  if (normalized === 'String') return fmtString(value);
  if (['Vec3', 'RelativeLocation', 'Vector3f'].includes(normalized)) {
    return normalizeGeneratorVectorValue(normalized, value);
  }
  return fmtD(value);
}

function emitProjectParameterDeclarations(project) {
  const lines = [];
  const seen = new Set();
  const variables = Array.isArray(project?.parameters?.variables) ? project.parameters.variables : [];
  const constants = Array.isArray(project?.parameters?.constants) ? project.parameters.constants : [];
  variables.forEach((item) => {
    if (!isIdent(item?.name) || seen.has(item.name)) return;
    seen.add(item.name);
    if (item.codec !== false) lines.push('@CodecField');
    lines.push(`var ${item.name}: ${item.type || 'Double'} = ${defaultLiteralForType(item.type, item.value)}`);
    lines.push('');
  });
  constants.forEach((item) => {
    if (!isIdent(item?.name) || seen.has(item.name)) return;
    seen.add(item.name);
    lines.push(`private val ${item.name}: ${item.type || 'Double'} = ${defaultLiteralForType(item.type, item.value)}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function resolveGlobalGravity(project) {
  for (const queue of project.commandQueues || []) {
    for (const command of queue.commands || []) {
      if (command.enabled !== false && command.type === 'gravity') {
        return Number(command.params?.gravity ?? 0.04);
      }
    }
  }
  return null;
}

function emitEmitterBlock(project, card, index) {
  const n = index + 1;
  const templateVar = `template${n}`;
  const dataVar = `data${n}`;
  const lines = [];
  lines.push(`// 发射器 #${n}: ${card.name}`);
  lines.push(`if (${buildEmitterActiveExpr(card)}) {`);
  lines.push(`    val ${dataVar} = SimpleRandomParticleData().apply {`);
  lines.push(`        minAge = ${intExpr(project, card, 'particle.lifeMin', card.particle.lifeMin)}`);
  lines.push(`        maxAge = ${intExpr(project, card, 'particle.lifeMax', card.particle.lifeMax)}`);
  lines.push(`        minCount = ${intExpr(project, card, 'particle.countMin', card.particle.countMin)}`);
  lines.push(`        maxCount = ${intExpr(project, card, 'particle.countMax', card.particle.countMax)}`);
  lines.push(`        minSize = ${numberExpr(project, card, 'particle.sizeMin', card.particle.sizeMin)}`);
  lines.push(`        maxSize = ${numberExpr(project, card, 'particle.sizeMax', card.particle.sizeMax)}`);
  lines.push(`        minSpeed = ${numberExpr(project, card, 'particle.speedMin', card.particle.speedMin)}`);
  lines.push(`        maxSpeed = ${numberExpr(project, card, 'particle.speedMax', card.particle.speedMax)}`);
  lines.push('    }');
  lines.push(`    val ${templateVar} = ControlableParticleData().apply {`);
  lines.push(`        velocity = ${vectorExpr(project, card, 'particle.velocity', card.particle.velocity)}`);
  lines.push(`        uniformSize = ${usesIndependentScale(card) ? 'false' : 'true'}`);
  lines.push(`        weightSize = ${floatExpr(project, card, 'render.baseScale.x', card.render.baseScale.x)}`);
  lines.push(`        heightSize = ${usesIndependentScale(card)
    ? floatExpr(project, card, 'render.baseScale.y', card.render.baseScale.y)
    : floatExpr(project, card, 'render.baseScale.x', card.render.baseScale.x)}`);
  if (usesDepthScale(card)) {
    lines.push(`        depthSize = ${floatExpr(project, card, 'render.baseScale.z', card.render.baseScale.z)}`);
  }
  lines.push(`        visibleRange = ${floatExpr(project, card, 'particle.visibleRange', card.particle.visibleRange)}`);
  lines.push(`        color = ${colorExpr(project, card, 'particle.colorStart', card.particle.colorStart)}`);
  lines.push(`        alpha = (${numberExpr(project, card, 'render.alpha', card.render.alpha)} / 100.0).toFloat()`);
  lines.push(`        light = ${intExpr(project, card, 'render.light', card.render.light)}`);
  lines.push(`        ${textureSheetStatement(project, card, card.render.textureSheet)}`);
  lines.push(`        cameraOption = ${cameraOptionConstant(card.render.billboardMode)}`);
  if (card.render.billboardMode === 'axis_billboard') {
    lines.push(`        axis = ${vectorExpr(project, card, 'render.axis', card.render.axis)}`);
  }
  lines.push(`        roll = (${numberExpr(project, card, 'render.roll', card.render.roll)} * PI / 180.0).toFloat()`);
  if (card.render.billboardMode === 'none') {
    lines.push(`        yaw = (${numberExpr(project, card, 'render.yaw', card.render.yaw)} * PI / 180.0).toFloat()`);
    lines.push(`        pitch = (${numberExpr(project, card, 'render.pitch', card.render.pitch)} * PI / 180.0).toFloat()`);
  }
  lines.push(`        speedLimit = ${numberExpr(project, card, 'render.speedLimit', card.render.speedLimit)}`);
  lines.push(`        sign = ${intExpr(project, card, 'render.sign', card.render.sign)}`);
  lines.push(`        effect = ${safeKotlinReference(card.render.effectClass, 'ControlableEndRodEffect')}(uuid)`);
  lines.push('    }');
  lines.push('    res.addAll(');
  lines.push(indent(emitEmitterPointBuilder(project, card, dataVar), 8));
  lines.push('            .createWithoutClone()');
  lines.push('            .map { rel ->');
  lines.push(`                val speed = ${dataVar}.getRandomSpeed()`);
  lines.push(`                val particleSize = ${dataVar}.getRandomSize()`);
  lines.push(`                val velocityJitter = Vec3((Random.nextDouble() * 2.0 - 1.0) * ${numberExpr(project, card, 'particle.velocityRandom.x', card.particle.velocityRandom.x)}, (Random.nextDouble() * 2.0 - 1.0) * ${numberExpr(project, card, 'particle.velocityRandom.y', card.particle.velocityRandom.y)}, (Random.nextDouble() * 2.0 - 1.0) * ${numberExpr(project, card, 'particle.velocityRandom.z', card.particle.velocityRandom.z)})`);
  if (card.particle.velocityMode === 'spawn_relative') {
    lines.push('                val dir = rel.toVector().add(velocityJitter)');
    lines.push('                val velocity = if (dir.lengthSqr() < 1e-8) Vec3.ZERO else dir.normalize().scale(speed)');
  } else {
    lines.push(`                val baseDir = ${vectorExpr(project, card, 'particle.velocity', card.particle.velocity)}.add(velocityJitter)`);
    lines.push('                val velocity = if (baseDir.lengthSqr() < 1e-8) Vec3.ZERO else baseDir.normalize().scale(speed)');
  }
  lines.push(`                ${templateVar}.clone().apply {`);
  lines.push(`                    maxAge = ${dataVar}.getRandomParticleMaxAge()`);
  if (usesIndependentScale(card)) {
    lines.push('                    uniformSize = false');
    lines.push(`                    weightSize = (particleSize * (${floatExpr(project, card, 'render.baseScale.x', card.render.baseScale.x)}).toDouble()).toFloat()`);
    lines.push(`                    heightSize = (particleSize * (${floatExpr(project, card, 'render.baseScale.y', card.render.baseScale.y)}).toDouble()).toFloat()`);
    if (usesDepthScale(card)) {
      lines.push(`                    depthSize = (particleSize * (${floatExpr(project, card, 'render.baseScale.z', card.render.baseScale.z)}).toDouble()).toFloat()`);
    }
  } else {
    lines.push(`                    size = (particleSize * (${floatExpr(project, card, 'render.baseScale.x', card.render.baseScale.x)}).toDouble()).toFloat()`);
  }
  lines.push('                    this.velocity = velocity');
  lines.push('                } to rel');
  lines.push('            }');
  lines.push('    )');
  lines.push('}');
  return lines.join('\n');
}

function usesIndependentScale(card) {
  return card.render.scaleMode === 'xyz';
}

function usesDepthScale(card) {
  return usesIndependentScale(card) && card.render.billboardMode === 'none';
}

function buildEmitterActiveExpr(card) {
  const start = fmtI(card.emission.startTick);
  const end = Number(card.emission.endTick);
  const base = end < 0 ? `tick >= ${start}` : `tick >= ${start} && tick <= ${fmtI(end)}`;
  if (card.emission.mode === 'once') return `tick == ${start}`;
  if (card.emission.mode === 'burst') return `(${base}) && ((tick - ${start}) % ${fmtI(card.emission.burstInterval, 1)} == 0)`;
  return base;
}

function emitLifecycleAction(project) {
  const enabled = project.emitters.filter((card) => card.enabled !== false);
  const lines = [];
  lines.push('override fun singleParticleAction(');
  lines.push('    controler: ParticleControler,');
  lines.push('    data: ControlableParticleData,');
  lines.push('    spawnPos: RelativeLocation,');
  lines.push('    spawnWorld: Level,');
  lines.push('    particleLerpProgress: Float,');
  lines.push('    posLerpProgress: Float');
  lines.push(') {');
  lines.push('    controler.addPreTickAction {');
  lines.push('        val lifeProgress = if (this.lifetime <= 0) 1.0 else (this.currentAge.toDouble() / this.lifetime.toDouble()).coerceIn(0.0, 1.0)');
  lines.push(...emitCommandQueueApplication(project));
  lines.push('        when (data.sign) {');
  enabled.forEach((card, index) => {
    const n = index + 1;
    const prefix = `emitter${n}`;
    lines.push(`            ${intExpr(project, card, 'render.sign', card.render.sign)} -> {`);
    if (card.particle.colorOverLifeEnabled) {
      lines.push('                val cp = lifeProgress.toFloat()');
      lines.push(`                val startColor = ${colorExpr(project, card, 'particle.colorStart', card.particle.colorStart)}`);
      lines.push(`                val endColor = ${colorExpr(project, card, 'particle.colorEnd', card.particle.colorEnd)}`);
      lines.push('                this.color = Vector3f(startColor.x + (endColor.x - startColor.x) * cp, startColor.y + (endColor.y - startColor.y) * cp, startColor.z + (endColor.z - startColor.z) * cp)');
    }
    if (usesIndependentScale(card)) {
      lines.push('                this.uniformSize = false');
      lines.push(`                this.weightSize = (data.weightSize * ${prefix}SizeX.sample(lifeProgress)).toFloat()`);
      const sizeYCurve = card.curves.size.syncAxes ? `${prefix}SizeX` : `${prefix}SizeY`;
      lines.push(`                this.heightSize = (data.heightSize * ${sizeYCurve}.sample(lifeProgress)).toFloat()`);
      if (usesDepthScale(card)) {
        const sizeZCurve = card.curves.size.syncAxes ? `${prefix}SizeX` : `${prefix}SizeZ`;
        lines.push(`                this.depthSize = (data.depthSize * ${sizeZCurve}.sample(lifeProgress)).toFloat()`);
      }
    } else {
      lines.push('                this.uniformSize = true');
      lines.push(`                this.size = (data.size * ${prefix}SizeX.sample(lifeProgress)).toFloat()`);
    }
    lines.push(`                this.alpha = (${prefix}Opacity.sample(lifeProgress)).toFloat().coerceIn(0f, 1f)`);
    lines.push(`                this.light = ${prefix}Brightness.sample(lifeProgress).toInt().coerceIn(-1, 15)`);
    lines.push(`                this.roll = ${curveDegToRad(card.render.roll, `${prefix}Roll`)}`);
    if (card.render.billboardMode === 'none') {
      const yawCurve = card.curves.rotation.syncAxes ? `${prefix}Roll` : `${prefix}Yaw`;
      const pitchCurve = card.curves.rotation.syncAxes ? `${prefix}Roll` : `${prefix}Pitch`;
      lines.push(`                this.yaw = ${curveDegToRad(card.render.yaw, yawCurve)}`);
      lines.push(`                this.pitch = ${curveDegToRad(card.render.pitch, pitchCurve)}`);
    }
    lines.push('            }');
  });
  lines.push('        }');
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

export function generateEmitterScript(project) {
  return generateEmitterKotlin(project);
}

export function generateEmitterKotlin(rawProject) {
  const project = normalizeGeneratorProject(rawProject);
  const className = safeIdent(project.kotlin.className, 'GeneratedEmitter');
  const packageName = safePackage(project.kotlin.packageName);
  const baseClass = safeIdent(project.kotlin.baseClass, 'AutoParticleEmitters');
  const lines = [];
  if (packageName) {
    lines.push(`package ${packageName}`);
    lines.push('');
  }
  lines.push('import cn.coostack.cooparticlesapi.annotations.CooAutoRegister');
  lines.push('import cn.coostack.cooparticlesapi.annotations.CodecField');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.command.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.command.curve.*');
  lines.push('import cn.coostack.cooparticlesapi.particles.ParticleCameraOption');
  lines.push('import cn.coostack.cooparticlesapi.particles.control.ParticleControler');
  lines.push('import cn.coostack.cooparticlesapi.particles.impl.*');
  lines.push('import cn.coostack.cooparticlesapi.supports.TextureSheetsEnum');
  lines.push('import cn.coostack.cooparticlesapi.utils.RelativeLocation');
  lines.push('import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder');
  lines.push('import net.minecraft.world.level.Level');
  lines.push('import net.minecraft.world.phys.Vec3');
  lines.push('import org.joml.Vector3f');
  lines.push('import kotlin.math.*');
  lines.push('import kotlin.random.Random');
  lines.push('');
  lines.push('@CooAutoRegister');
  lines.push(`class ${className}(pos: Vec3, world: Level?) : ${baseClass}(pos, world) {`);
  const parameterDeclarations = emitProjectParameterDeclarations(project);
  if (parameterDeclarations) {
    lines.push(indent(parameterDeclarations, 4));
    lines.push('');
  }
  project.emitters.filter((card) => card.enabled !== false).forEach((card, index) => {
    lines.push(indent(emitCurveDeclarations(card, index), 4));
    lines.push('');
  });
  const commandQueues = emitCommandQueueDeclarations(project);
  if (commandQueues) {
    lines.push(indent(commandQueues, 4));
    lines.push('');
  }
  lines.push('    init {');
  const gravity = resolveGlobalGravity(project);
  if (gravity !== null) {
    lines.push(`        gravity = ${fmtD(gravity, 0.04)}`);
  }
  if (project.rootLifecycle.mode === 'once') {
    lines.push('        delay = 1');
    lines.push('        maxTick = 1');
  } else if (project.rootLifecycle.mode === 'interval_n_tick') {
    lines.push(`        delay = ${fmtI(project.rootLifecycle.intervalTick)}`);
    lines.push(`        maxTick = ${fmtI(project.rootLifecycle.maxTick)}`);
  } else {
    lines.push(`        delay = ${fmtI(project.rootLifecycle.intervalTick)}`);
    lines.push('        maxTick = -1');
  }
  lines.push('    }');
  lines.push('');
  lines.push('    override fun genParticles(lerpProgress: Float): List<Pair<ControlableParticleData, RelativeLocation>> {');
  lines.push('        val res = mutableListOf<Pair<ControlableParticleData, RelativeLocation>>()');
  lines.push('');
  project.emitters.filter((card) => card.enabled !== false).forEach((card, index) => {
    lines.push(indent(emitEmitterBlock(project, card, index), 8));
    lines.push('');
  });
  lines.push('        return res');
  lines.push('    }');
  lines.push('');
  lines.push(indent(emitLifecycleAction(project), 4));
  lines.push('}');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
