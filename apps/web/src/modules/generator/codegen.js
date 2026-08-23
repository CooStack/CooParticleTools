import { curveToKotlin, sampleLifecycleCurve } from './curves.js';
import {
  CPARTICLE_COMMAND_TYPE_IDS,
  TEXTURE_SHEET_OPTIONS,
  normalizeGeneratorProject
} from './defaults.js';
import {
  collectGeneratorValueEntries,
  createGeneratorBindingResolver,
  formatGeneratorKotlinLiteral,
  isGeneratorValueName
} from './bindings.js';
import {
  analyzeGeneratorDoTick,
  analyzeGeneratorExpression,
  generatorExpressionToKotlin
} from './expression-runtime.js';
import { generatePointsBuilderKotlin } from '../pointsbuilder/codegen.js';

const CPARTICLE_MAX_FORCES = 16;

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

function resolveBindingRef(bindingResolver, card, path, expectedType = '') {
  const binding = bindingResolver.resolve(card?.bindings, path, expectedType);
  if (binding.status !== 'resolved' && binding.status !== 'expression') return null;
  return {
    name: binding.status === 'expression'
      ? (binding.kotlin || generatorExpressionToKotlin(binding.expression))
      : (binding.kotlin || binding.name),
    value: binding.value,
    type: binding.type,
    expression: binding.status === 'expression'
  };
}

function resolveBinding(bindingResolver, card, path, expectedType = '') {
  return resolveBindingRef(bindingResolver, card, path, expectedType)?.name || '';
}

function numberExpr(bindingResolver, card, path, value, fallback = 0) {
  const binding = resolveBindingRef(bindingResolver, card, path, 'Double');
  if (binding?.expression) return `(${binding.name}).toDouble()`;
  return binding?.name || fmtD(value, fallback);
}

function intExpr(bindingResolver, card, path, value, fallback = 0) {
  const binding = resolveBindingRef(bindingResolver, card, path, 'Int');
  if (binding?.expression) return `(${binding.name}).toInt()`;
  return binding?.name || fmtI(value, fallback);
}

function floatExpr(bindingResolver, card, path, value, fallback = 0) {
  const binding = resolveBindingRef(bindingResolver, card, path, 'Float');
  if (binding?.expression) return `(${binding.name}).toFloat()`;
  return binding?.name || fmtF(value, fallback);
}

function vectorExpr(bindingResolver, card, path, value = {}, vec3Type = 'Vec3') {
  const binding = resolveBindingRef(bindingResolver, card, path, 'Vec3');
  if (binding?.value?.type === 'Vec3') return mapVec3Expression(binding.name, vec3Type);
  return `${vec3Type}(${numberExpr(bindingResolver, card, `${path}.x`, value.x)}, ${numberExpr(bindingResolver, card, `${path}.y`, value.y)}, ${numberExpr(bindingResolver, card, `${path}.z`, value.z)})`;
}

function relativeExpr(bindingResolver, card, path, value = {}) {
  const binding = resolveBindingRef(bindingResolver, card, path, 'RelativeLocation');
  if (binding?.value?.type === 'RelativeLocation') return binding.name;
  return `RelativeLocation(${numberExpr(bindingResolver, card, `${path}.x`, value.x)}, ${numberExpr(bindingResolver, card, `${path}.y`, value.y)}, ${numberExpr(bindingResolver, card, `${path}.z`, value.z)})`;
}

function relativeComponentExpr(bindingResolver, card, path, value, component) {
  const binding = resolveBindingRef(bindingResolver, card, path, 'RelativeLocation');
  return binding?.value?.type === 'RelativeLocation'
    ? `(${binding.name}).${component}`
    : numberExpr(bindingResolver, card, `${path}.${component}`, value?.[component]);
}

function mapVec3Expression(expression, vec3Type = 'Vec3') {
  const source = String(expression || '');
  if (vec3Type === 'Vec3') return source;
  let result = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (quote) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      index += 1;
      continue;
    }
    if (source.startsWith('//', index)) {
      result += source.slice(index);
      break;
    }
    if (source.startsWith('Vec3', index)
      && !/[A-Za-z0-9_]/.test(source[index - 1] || '')
      && /^\s*\(/.test(source.slice(index + 4))) {
      result += vec3Type;
      index += 4;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

function vec3Params(params = {}, prefix = '', vec3Type = 'Vec3') {
  return `${vec3Type}(${fmtD(params[`${prefix}X`])}, ${fmtD(params[`${prefix}Y`])}, ${fmtD(params[`${prefix}Z`])})`;
}

function supplierVec3(params = {}, prefix = '', vec3Type = 'Vec3') {
  return `java.util.function.Supplier { ${vec3Params(params, prefix, vec3Type)} }`;
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

function textureSheetStatement(bindingResolver, card, sheet) {
  const binding = resolveBinding(bindingResolver, card, 'render.textureSheet', 'String');
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

function curveOffsetRad(base, curveName) {
  return `${base} + (${curveName}.sample(lifeProgress) * PI / 180.0).toFloat()`;
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
    const source = binding.expression ? `(${binding.name})` : binding.name;
    return `Vector3f(${source}.x.coerceIn(0f, 1f), ${source}.y.coerceIn(0f, 1f), ${source}.z.coerceIn(0f, 1f))`;
  }
  return '';
}

function colorChannelExpr(bindingResolver, card, paths, fallback01) {
  const binding = paths.map((item) => resolveBinding(bindingResolver, card, item, 'Double')).find(Boolean);
  return binding ? `((${binding}.toDouble()) / 255.0).coerceIn(0.0, 1.0).toFloat()` : fmtF(fallback01);
}

function colorExpr(bindingResolver, card, path, hex) {
  const binding = resolveBindingRef(bindingResolver, card, path, 'Vector3f');
  const vectorBinding = binding ? colorVectorBindingExpr(binding) : '';
  if (vectorBinding) return vectorBinding;
  const color = vector3fFromHex(hex);
  const channelPaths = [
    [`${path}.r`, `${path}.x`],
    [`${path}.g`, `${path}.y`],
    [`${path}.b`, `${path}.z`]
  ];
  if (channelPaths.some((paths) => paths.some((item) => resolveBinding(bindingResolver, card, item, 'Double')))) {
    return `Vector3f(${colorChannelExpr(bindingResolver, card, channelPaths[0], color.x)}, ${colorChannelExpr(bindingResolver, card, channelPaths[1], color.y)}, ${colorChannelExpr(bindingResolver, card, channelPaths[2], color.z)})`;
  }
  return vector3fExprFromHex(hex);
}

function curveEnabled(curve) {
  return curve?.enabled === true;
}

function colorGradientEnabled(card) {
  return card?.particle?.colorGradientEnabled !== false;
}

function colorCurveEnabled(card) {
  return colorGradientEnabled(card) && curveEnabled(card?.curves?.color);
}

function usesDataColorCurve(card) {
  return card?.useGPU === true
    && card?.externalData === true
    && card?.externalTemplate === true
    && card?.gpu?.useDataColorCurve === true
    && colorCurveEnabled(card);
}

function clampUnit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function colorAtProgressExpr(bindingResolver, card, progress, dataVar = '') {
  const start = dataVar
    ? `${dataVar}.leftColor`
    : colorExpr(bindingResolver, card, 'particle.colorStart', card.particle.colorStart);
  const end = dataVar
    ? `${dataVar}.rightColor`
    : colorExpr(bindingResolver, card, 'particle.colorEnd', card.particle.colorEnd);
  const amount = clampUnit(progress);
  if (amount <= 0) return start;
  if (amount >= 1) return end;
  return `Vector3f(${start}).lerp(${end}, ${fmtF(amount)})`;
}

function colorOffsetExpr(bindingResolver, card, amount, dataVar = '') {
  const start = dataVar
    ? `${dataVar}.leftColor`
    : colorExpr(bindingResolver, card, 'particle.colorStart', card.particle.colorStart);
  const end = dataVar
    ? `${dataVar}.rightColor`
    : colorExpr(bindingResolver, card, 'particle.colorEnd', card.particle.colorEnd);
  return `Vector3f(${end}).sub(${start}).mul(${fmtF(amount)})`;
}

function prepareCParticleColorFrames(curve) {
  const framesByTime = new Map();
  (Array.isArray(curve?.keyframes) ? curve.keyframes : []).forEach((frame) => {
    const rawTime = Number(frame?.time);
    if (!Number.isFinite(rawTime)) return;
    const time = Math.max(0, Math.min(100, rawTime));
    framesByTime.set(time, {
      ...frame,
      time,
      in: { x: Number(frame?.in?.x || 0), y: Number(frame?.in?.y || 0) },
      out: { x: Number(frame?.out?.x || 0), y: Number(frame?.out?.y || 0) }
    });
  });
  let frames = Array.from(framesByTime.values()).sort((left, right) => left.time - right.time);
  if (!frames.length) {
    frames = [{ time: 0, value: 0, in: { x: 0, y: 0 }, out: { x: 0, y: 0 } }];
  }
  if (frames.length > 8) {
    frames = Array.from({ length: 8 }, (_, index) => (
      frames[Math.round(index * (frames.length - 1) / 7)]
    ));
  }
  if (curve?.mode !== 'bezier') return frames;

  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const gap = current.time - previous.time;
    let outX = Math.max(0, Math.min(gap, Number(previous.out.x) || 0));
    let inX = Math.max(-gap, Math.min(0, Number(current.in.x) || 0));
    const handleSpan = outX - inX;
    if (handleSpan >= gap) {
      const scale = (gap * 0.999) / handleSpan;
      outX *= scale;
      inX *= scale;
    }
    previous.out.x = outX;
    current.in.x = inX;
  }
  return frames;
}

function cparticleColorCurveExpr(bindingResolver, card, dataVar = '') {
  const curve = card.curves.color;
  const frames = prepareCParticleColorFrames(curve);
  if (curve?.mode === 'bezier') {
    const keys = frames.map((frame) => {
      const value = clampUnit(frame.value);
      const outValue = clampUnit(value + Number(frame.out?.y || 0));
      const inValue = clampUnit(value + Number(frame.in?.y || 0));
      return 'CParticleBezierColorKeyframe('
        + `time = ${fmtD(Number(frame.time || 0) / 100)}, `
        + `value = ${colorAtProgressExpr(bindingResolver, card, value, dataVar)}, `
        + `outX = ${fmtD(frame.out?.x || 0)}, `
        + `outValueOffset = ${colorOffsetExpr(bindingResolver, card, outValue - value, dataVar)}, `
        + `inX = ${fmtD(frame.in?.x || 0)}, `
        + `inValueOffset = ${colorOffsetExpr(bindingResolver, card, inValue - value, dataVar)})`;
    });
    return `CParticleColorCurve.bezier(${keys.join(', ')})`;
  }
  if (frames.length === 2
    && Number(frames[0].time) === 0
    && Number(frames[1].time) === 100
    && clampUnit(frames[0].value) === 0
    && clampUnit(frames[1].value) === 1) {
    return `CParticleColorCurve.linear(${colorAtProgressExpr(bindingResolver, card, 0, dataVar)}, ${colorAtProgressExpr(bindingResolver, card, 1, dataVar)})`;
  }
  const keys = frames.map((frame) => (
    `${fmtF(Number(frame.time || 0) / 100)} to ${colorAtProgressExpr(bindingResolver, card, frame.value, dataVar)}`
  ));
  return `CParticleColorCurve.of(${keys.join(', ')})`;
}

function emitEmitterPointBuilder(bindingResolver, card, dataVar) {
  const type = card.emitter.type;
  const offset = card.emitter.offset;
  const offsetComponent = (component) => relativeComponentExpr(
    bindingResolver,
    card,
    'emitter.offset',
    offset,
    component
  );
  const lines = [];
  lines.push('PointsBuilder()');
  if (type === 'point') {
    lines.push(`    .addWith { List(${dataVar}.getRandomCount()) { ${relativeExpr(bindingResolver, card, 'emitter.offset', offset)} } }`);
    return lines.join('\n');
  }
  if (type === 'points_builder') {
    const externalValues = collectGeneratorValueEntries(bindingResolver.parameters).map(({ value }) => value);
    const externalIntNames = new Set(externalValues
      .filter((value) => value.type === 'Int')
      .map((value) => value.name));
    const builderExpr = generatePointsBuilderKotlin({
      ...(card.emitter.builderState || {}),
      kotlinEndMode: 'builder'
    }, {
      coerceDoubleExpression(value) {
        const source = String(value ?? '').trim();
        const identifiers = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
        if (!identifiers.some((name) => externalIntNames.has(name))) return value;
        const analysis = analyzeGeneratorExpression(source, externalValues, { expectedTypes: 'Double' });
        if (!analysis.valid) return value;
        return analysis.type === 'Int'
          ? `(${analysis.kotlin}).toDouble()`
          : analysis.kotlin;
      }
    })
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
    lines.push(`            repeat(count) { locs.add(${relativeExpr(bindingResolver, card, 'emitter.offset', offset)}) }`);
    lines.push('        } else {');
    lines.push('            val rand = Random.Default');
    lines.push('            repeat(count) {');
    lines.push('                val base = source[rand.nextInt(source.size)]');
    lines.push(`                locs.add(RelativeLocation(base.x + ${offsetComponent('x')}, base.y + ${offsetComponent('y')}, base.z + ${offsetComponent('z')}))`);
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
    lines.push(`            var x = (rand.nextDouble() - 0.5) * ${numberExpr(bindingResolver, card, 'emitter.box.x', box.x)}`);
    lines.push(`            var y = (rand.nextDouble() - 0.5) * ${numberExpr(bindingResolver, card, 'emitter.box.y', box.y)}`);
    lines.push(`            var z = (rand.nextDouble() - 0.5) * ${numberExpr(bindingResolver, card, 'emitter.box.z', box.z)}`);
    if (box.surface) {
      lines.push('            when (rand.nextInt(3)) {');
      lines.push(`                0 -> x = (if (rand.nextBoolean()) -0.5 else 0.5) * ${numberExpr(bindingResolver, card, 'emitter.box.x', box.x)}`);
      lines.push(`                1 -> y = (if (rand.nextBoolean()) -0.5 else 0.5) * ${numberExpr(bindingResolver, card, 'emitter.box.y', box.y)}`);
      lines.push(`                else -> z = (if (rand.nextBoolean()) -0.5 else 0.5) * ${numberExpr(bindingResolver, card, 'emitter.box.z', box.z)}`);
      lines.push('            }');
    }
    lines.push(`            locs.add(RelativeLocation(x + ${offsetComponent('x')}, y + ${offsetComponent('y')}, z + ${offsetComponent('z')}))`);
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
      ? `            val rr = ${numberExpr(bindingResolver, card, radiusPath, radius)} * cbrt(rand.nextDouble())`
      : `            val rr = ${numberExpr(bindingResolver, card, radiusPath, radius)}`);
    lines.push(`            locs.add(RelativeLocation(dx * rr + ${offsetComponent('x')}, dy * rr + ${offsetComponent('y')}, dz * rr + ${offsetComponent('z')}))`);
    lines.push('        }');
    lines.push('        locs');
    lines.push('    }');
    return lines.join('\n');
  }
  if (type === 'line') {
    lines.push(`    .addLine(${relativeExpr(bindingResolver, card, 'emitter.line.dir', card.emitter.line.dir)}, ${numberExpr(bindingResolver, card, 'emitter.line.step', card.emitter.line.step)}, ${dataVar}.getRandomCount())`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(bindingResolver, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'circle') {
    lines.push(`    .addCircle(${numberExpr(bindingResolver, card, 'emitter.circle.r', card.emitter.circle.r)}, ${dataVar}.getRandomCount())`);
    lines.push(`    .rotateTo(${relativeExpr(bindingResolver, card, 'emitter.circle.axis', card.emitter.circle.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(bindingResolver, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'ring') {
    lines.push(`    .addDiscreteCircleXZ(${numberExpr(bindingResolver, card, 'emitter.ring.r', card.emitter.ring.r)}, ${dataVar}.getRandomCount(), ${numberExpr(bindingResolver, card, 'emitter.ring.thickness', card.emitter.ring.thickness)})`);
    lines.push(`    .rotateTo(${relativeExpr(bindingResolver, card, 'emitter.ring.axis', card.emitter.ring.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(bindingResolver, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'arc') {
    const arc = card.emitter.arc;
    lines.push(`    .addRadian(${numberExpr(bindingResolver, card, 'emitter.arc.r', arc.r)}, ${dataVar}.getRandomCount(), ${numberExpr(bindingResolver, card, 'emitter.arc.start', arc.start)} * PI / 180.0, ${numberExpr(bindingResolver, card, 'emitter.arc.end', arc.end)} * PI / 180.0, ${numberExpr(bindingResolver, card, 'emitter.arc.rotate', arc.rotate)} * PI / 180.0)`);
    lines.push(`    .rotateTo(${relativeExpr(bindingResolver, card, 'emitter.arc.axis', arc.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(bindingResolver, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  if (type === 'spiral') {
    const spiral = card.emitter.spiral;
    lines.push(`    .addSpiral(${numberExpr(bindingResolver, card, 'emitter.spiral.startR', spiral.startR)}, ${numberExpr(bindingResolver, card, 'emitter.spiral.endR', spiral.endR)}, ${numberExpr(bindingResolver, card, 'emitter.spiral.height', spiral.height)}, ${dataVar}.getRandomCount().coerceAtLeast(2), ${numberExpr(bindingResolver, card, 'emitter.spiral.rotateSpeed', spiral.rotateSpeed)}, ${numberExpr(bindingResolver, card, 'emitter.spiral.rBias', spiral.rBias)}, ${numberExpr(bindingResolver, card, 'emitter.spiral.hBias', spiral.hBias)})`);
    lines.push(`    .rotateTo(${relativeExpr(bindingResolver, card, 'emitter.spiral.axis', spiral.axis)})`);
    lines.push(`    .pointsOnEach { it.add(${relativeExpr(bindingResolver, card, 'emitter.offset', offset)}) }`);
    return lines.join('\n');
  }
  lines.push(`    .addWith { List(${dataVar}.getRandomCount()) { ${relativeExpr(bindingResolver, card, 'emitter.offset', offset)} } }`);
  return lines.join('\n');
}

function emitCurveDeclarations(bindingResolver, card, index) {
  const n = index + 1;
  const lines = [];
  const prefix = `emitter${n}`;
  if (card.useGPU) {
    if (curveEnabled(card.curves.size.x)) {
      lines.push(`private val ${prefix}SizeX = ${curveToKotlin(card.curves.size.x, 1)}`);
    }
    if (!card.curves.size.syncAxes && curveEnabled(card.curves.size.y)) {
      lines.push(`private val ${prefix}SizeY = ${curveToKotlin(card.curves.size.y, 1)}`);
    }
    if (curveEnabled(card.curves.opacity)) {
      lines.push(`private val ${prefix}Opacity = ${curveToKotlin(scaleCurveValues(card.curves.opacity, 0.01), 1)}`);
    }
    return lines.join('\n');
  }
  const hasAlphaBinding = Boolean(resolveBindingRef(bindingResolver, card, 'render.alpha', 'Double'));
  const opacityScale = hasAlphaBinding ? 0.01 : Number(card.render.alpha || 0) / 10000;
  if (curveEnabled(card.curves.size.x)) {
    lines.push(`private val ${prefix}SizeX = ${curveToKotlin(card.curves.size.x, 1)}`);
  }
  if (!card.curves.size.syncAxes && usesIndependentScale(card) && curveEnabled(card.curves.size.y)) {
    lines.push(`private val ${prefix}SizeY = ${curveToKotlin(card.curves.size.y, 1)}`);
  }
  if (curveEnabled(card.curves.light)) {
    lines.push(`private val ${prefix}Light = ${curveToKotlin(card.curves.light, 15)}`);
  }
  if (curveEnabled(card.curves.opacity)) {
    lines.push(`private val ${prefix}Opacity = ${curveToKotlin(scaleCurveValues(card.curves.opacity, opacityScale), 1)}`);
  }
  if (curveEnabled(card.curves.rotation.roll)) {
    lines.push(`private val ${prefix}Roll = ${curveToKotlin(card.curves.rotation.roll, 0)}`);
  }
  if (card.render.billboardMode === 'none' && !card.curves.rotation.syncAxes && curveEnabled(card.curves.rotation.yaw)) {
    lines.push(`private val ${prefix}Yaw = ${curveToKotlin(card.curves.rotation.yaw, 0)}`);
  }
  if (card.render.billboardMode === 'none' && !card.curves.rotation.syncAxes && curveEnabled(card.curves.rotation.pitch)) {
    lines.push(`private val ${prefix}Pitch = ${curveToKotlin(card.curves.rotation.pitch, 0)}`);
  }
  if (colorCurveEnabled(card)) {
    lines.push(`private val ${prefix}ColorProgress = ${curveToKotlin(card.curves.color, 0)}`);
  }
  return lines.join('\n');
}

function emitCommandQueueDeclarations(project, vec3Type, inlineGravity = false) {
  const queues = project.commandQueues
    .map((queue, index) => ({ queue, index }))
    .filter(({ queue }) => Array.isArray(queue.commands) && queue.commands.some((command) => command.enabled !== false));
  if (!queues.length) return '';
  const lines = [];
  queues.forEach(({ queue, index }) => {
    lines.push(`private val commandQueue${index + 1} = ParticleCommandQueue()`);
    queue.commands.filter((command) => command.enabled !== false).forEach((command) => {
      lines.push(`    .add(${commandToKotlin(command, vec3Type, inlineGravity)}) { _, particle -> particle.currentAge >= ${fmtI(command.tick)} }`);
    });
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

function commandToKotlin(command, vec3Type = 'Vec3', inlineGravity = false) {
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
    if (inlineGravity) {
      return `ParticleCommand { data, _ -> data.velocity = data.velocity.add(0.0, -${fmtD(p('gravity', 0.04))}, 0.0) }`;
    }
    return 'ParticleGravityCommand(this)';
  }
  if (command.type === 'attraction') {
    return `ParticleAttractionCommand(target = ${supplierVec3(params, 'target', vec3Type)}, strength = ${fmtD(p('strength', 0.8))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.25))})`;
  }
  if (command.type === 'orbit') {
    const mode = enumValue('mode', 'PHYSICAL', ['PHYSICAL', 'SPRING', 'SNAP']);
    return `ParticleOrbitCommand(center = ${supplierVec3(params, 'center', vec3Type)}, axis = ${vec3Params(params, 'axis', vec3Type)}, radius = ${fmtD(p('radius', 3))}, angularSpeed = ${fmtD(p('angularSpeed', 0.35))}, radialCorrect = ${fmtD(p('radialCorrect', 0.25))}, minDistance = ${fmtD(p('minDistance', 0.2))}, mode = OrbitMode.${mode}).maxRadialStep(${fmtD(p('maxRadialStep', 0.5))})`;
  }
  if (command.type === 'noise') {
    return `ParticleNoiseCommand(strength = ${fmtD(p('strength', 0.03))}, frequency = ${fmtD(p('frequency', 0.15))}, speed = ${fmtD(p('speed', 0.12))}, affectY = ${fmtD(p('affectY', 1))}, clampSpeed = ${fmtD(p('clampSpeed', 0.8))}, useLifeCurve = ${fmtBool(params.useLifeCurve !== false)})`;
  }
  if (command.type === 'flow_field') {
    return `ParticleFlowFieldCommand(amplitude = ${fmtD(p('amplitude', 0.15))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.06))}, phaseOffset = ${fmtD(p('phaseOffset'))}, worldOffset = ${vec3Params(params, 'worldOffset', vec3Type)})`;
  }
  if (command.type === 'vortex') {
    return `ParticleVortexCommand(center = ${supplierVec3(params, 'center', vec3Type)}, axis = ${vec3Params(params, 'axis', vec3Type)}, swirlStrength = ${fmtD(p('swirlStrength', 0.8))}, radialPull = ${fmtD(p('radialPull', 0.35))}, axialLift = ${fmtD(p('axialLift'))}, range = ${fmtD(p('range', 10))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.2))})`;
  }
  if (command.type === 'rotation_force') {
    return `ParticleRotationForceCommand(center = ${supplierVec3(params, 'center', vec3Type)}, axis = ${vec3Params(params, 'axis', vec3Type)}, strength = ${fmtD(p('strength', 0.35))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))})`;
  }
  if (command.type === 'toroidal_circulation') {
    return `ParticleToroidalCirculationCommand(center = ${supplierVec3(params, 'center', vec3Type)}, axis = ${vec3Params(params, 'axis', vec3Type)}, ringRadius = ${fmtD(p('ringRadius', 3))}, radialThickness = ${fmtD(p('radialThickness', 1.2))}, axialThickness = ${fmtD(p('axialThickness', 0.8))}, circulationStrength = ${fmtD(p('circulationStrength', 0.35))}, outwardStrength = ${fmtD(p('outwardStrength'))}, upwardStrength = ${fmtD(p('upwardStrength'))}, followStrength = ${fmtD(p('followStrength', 0.12))}, maxStep = ${fmtD(p('maxStep', 0.6))}, useLifeCurve = ${fmtBool(params.useLifeCurve === true)})`;
  }
  if (command.type === 'distortion') {
    return `ParticleDistortionCommand(center = ${supplierVec3(params, 'center', vec3Type)}, axis = ${vec3Params(params, 'axis', vec3Type)}, radius = ${fmtD(p('radius', 3))}, radialStrength = ${fmtD(p('radialStrength', 0.35))}, axialStrength = ${fmtD(p('axialStrength', 0.25))}, tangentialStrength = ${fmtD(p('tangentialStrength'))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.1))}, phaseOffset = ${fmtD(p('phaseOffset'))}, followStrength = ${fmtD(p('followStrength', 0.35))}, maxStep = ${fmtD(p('maxStep', 0.6))}, baseAxial = ${fmtD(p('baseAxial'))}, seedOffset = ${fmtI(p('seedOffset'))}, useLifeCurve = ${fmtBool(params.useLifeCurve === true)})`;
  }
  if (command.type === 'inherit_velocity') {
    const mode = enumValue('mode', 'INITIAL', ['INITIAL', 'CURRENT']);
    const space = enumValue('space', 'WORLD', ['WORLD', 'LOCAL']);
    const base = `ParticleInheritVelocityCommand(source = ${supplierVec3(params, 'source', vec3Type)}, mode = ParticleInheritMode.${mode}, multiplier = ${fmtD(p('multiplier', 1))}, axisMask = ${vec3Params(params, 'axisMask', vec3Type)}, overLifetime = ${constantCurve(p('overLifetime', 1), 1)}, damping = ${fmtD(p('damping'))}, maxContributionSpeed = ${fmtD(p('maxContributionSpeed'))}, space = ParticleMotionSpace.${space})`;
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
    return `ParticleCommand { data, _ -> data.velocity = ${vec3Type}(data.velocity.x * ${fmtD(p('scaleX', 1))}, data.velocity.y * ${fmtD(p('scaleY', 1))}, data.velocity.z * ${fmtD(p('scaleZ', 1))}) }`;
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
    const signs = Array.from(new Set(
      (Array.isArray(queue.signs) ? queue.signs : []).map((value) => fmtI(value))
    ));
    if (!signs.length) {
      lines.push(`        commandQueue${index + 1}.applyVelocity(data, this)`);
      return;
    }
    const condition = signs.map((value) => `data.sign == ${value}`).join(' || ');
    lines.push(`        if (${condition}) commandQueue${index + 1}.applyVelocity(data, this)`);
  });
  return lines;
}

function emitProjectParameterDeclarations(project, vec3Type) {
  const lines = [];
  const seen = new Set();
  const variables = Array.isArray(project?.parameters?.variables) ? project.parameters.variables : [];
  const constants = Array.isArray(project?.parameters?.constants) ? project.parameters.constants : [];
  variables.forEach((item) => {
    if (!isGeneratorValueName(item?.name) || seen.has(item.name)) return;
    seen.add(item.name);
    if (item.codec !== false) lines.push('@CodecField');
    const type = item.type === 'Vec3' ? vec3Type : (item.type || 'Double');
    const literal = formatGeneratorKotlinLiteral(item.type, item.value);
    const mappedLiteral = item.type === 'Vec3' ? literal.replace(/^Vec3(?=\s*\()/, vec3Type) : literal;
    lines.push(`var ${item.name}: ${type} = ${mappedLiteral}`);
    lines.push('');
  });
  constants.forEach((item) => {
    if (!isGeneratorValueName(item?.name) || seen.has(item.name)) return;
    seen.add(item.name);
    const type = item.type === 'Vec3' ? vec3Type : (item.type || 'Double');
    const literal = formatGeneratorKotlinLiteral(item.type, item.value);
    const mappedLiteral = item.type === 'Vec3' ? literal.replace(/^Vec3(?=\s*\()/, vec3Type) : literal;
    lines.push(`private val ${item.name}: ${type} = ${mappedLiteral}`);
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

function enabledGpuCommands(project) {
  return (Array.isArray(project?.gpuCommands) ? project.gpuCommands : [])
    .filter((command) => command?.enabled !== false);
}

function cparticleForceToKotlin(command, vec3Type = 'Vec3') {
  const params = command.params || {};
  const p = (key, fallback = 0) => params[key] ?? fallback;
  const lambdaVec3 = (prefix) => `{ ${vec3Params(params, prefix, vec3Type)} }`;

  if (command.type === 'drag') {
    return `CParticleForce.ExpDrag(damping = ${fmtD(p('damping', 0.15))}, minSpeed = ${fmtD(p('minSpeed'))}, linear = ${fmtD(p('linear'))})`;
  }
  if (command.type === 'gravity') {
    return `CParticleForce.Gravity(${fmtD(p('gravity', 0.04))})`;
  }
  if (command.type === 'attraction') {
    return `CParticleForce.Attraction(target = ${lambdaVec3('target')}, strength = ${fmtD(p('strength', 0.8))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.25))})`;
  }
  if (command.type === 'noise') {
    return `CParticleForce.Noise(strength = ${fmtD(p('strength', 0.03))}, frequency = ${fmtD(p('frequency', 0.15))}, speed = ${fmtD(p('speed', 0.12))}, clampSpeed = ${fmtD(p('clampSpeed', 0.8))}, affectY = ${fmtD(p('affectY', 1))}, useLifeCurve = ${fmtBool(params.useLifeCurve !== false)})`;
  }
  if (command.type === 'flow_field') {
    return `CParticleForce.FlowField(amplitude = ${fmtD(p('amplitude', 0.15))}, frequency = ${fmtD(p('frequency', 0.25))}, timeScale = ${fmtD(p('timeScale', 0.06))}, phaseOffset = ${fmtD(p('phaseOffset'))}, worldOffset = ${vec3Params(params, 'worldOffset', vec3Type)})`;
  }
  if (command.type === 'vortex') {
    return `CParticleForce.Vortex(center = ${lambdaVec3('center')}, axis = ${vec3Params(params, 'axis', vec3Type)}, swirlStrength = ${fmtD(p('swirlStrength', 0.8))}, radialPull = ${fmtD(p('radialPull', 0.35))}, axialLift = ${fmtD(p('axialLift'))}, range = ${fmtD(p('range', 10))}, falloffPower = ${fmtD(p('falloffPower', 2))}, minDistance = ${fmtD(p('minDistance', 0.2))})`;
  }
  if (command.type === 'rotation_force') {
    return `CParticleForce.RotationForce(center = ${lambdaVec3('center')}, axis = ${vec3Params(params, 'axis', vec3Type)}, strength = ${fmtD(p('strength', 0.35))}, range = ${fmtD(p('range', 8))}, falloffPower = ${fmtD(p('falloffPower', 2))})`;
  }
  if (command.type === 'velocity_add') {
    return `CParticleForce.Gravity(${vec3Params(params, 'delta', vec3Type)})`;
  }
  return '';
}

function emitCParticleForces(project, vec3Type) {
  const forces = enabledGpuCommands(project)
    .map((command) => cparticleForceToKotlin(command, vec3Type))
    .filter(Boolean);
  if (!forces.length) return 'override fun cparticleForces(): List<CParticleForce> = emptyList()';
  return [
    'override fun cparticleForces(): List<CParticleForce> = listOf(',
    ...forces.map((force, index) => `    ${force}${index === forces.length - 1 ? '' : ','}`),
    ')'
  ].join('\n');
}

export function collectCParticleCompatibilityErrors(rawProject) {
  const project = normalizeGeneratorProject(rawProject);
  const commands = enabledGpuCommands(project);
  const errors = commands
    .filter((command) => !CPARTICLE_COMMAND_TYPE_IDS.includes(command.type))
    .map((command) => `GPU Commands 不支持命令“${command.type}”。`);
  if (commands.length > CPARTICLE_MAX_FORCES) {
    errors.unshift(`GPU Commands 最多支持 ${CPARTICLE_MAX_FORCES} 个命令，当前为 ${commands.length} 个。`);
  }
  return errors;
}

function emitExpressionHelpers(project) {
  const sources = [String(project?.doTick?.source || '')];
  for (const card of Array.isArray(project?.emitters) ? project.emitters : []) {
    sources.push(...Object.values(card?.bindings || {}).map(String));
  }
  const joined = sources.join('\n');
  const lines = [];
  if (/\bclamp\s*\(/.test(joined)) {
    lines.push('private fun clamp(value: Number, min: Number, max: Number): Double = value.toDouble().coerceIn(min.toDouble(), max.toDouble())');
  }
  if (/\blerp\s*\(/.test(joined)) {
    lines.push('private fun lerp(a: Number, b: Number, progress: Number): Double = a.toDouble() + (b.toDouble() - a.toDouble()) * progress.toDouble()');
  }
  if (/\b(?:Math\.)?pow\s*\(/.test(joined)) {
    lines.push('private fun pow(a: Number, b: Number): Double = a.toDouble().pow(b.toDouble())');
  }
  return lines.join('\n');
}

function usesVectorOperatorExtensions(project) {
  const symbols = [
    ...(Array.isArray(project?.parameters?.variables) ? project.parameters.variables : []),
    ...(Array.isArray(project?.parameters?.constants) ? project.parameters.constants : [])
  ];
  const doTick = analyzeGeneratorDoTick(project?.doTick?.source, project?.parameters, {
    context: { tick: 0, progress: 0 }
  });
  if (doTick.handled && doTick.valid
    && doTick.statements.some((statement) => expressionAstUsesVectorOperator(statement.ast))) return true;
  if (!doTick.handled && doTick.fallbackSafe === true) {
    const source = String(project?.doTick?.source || '');
    const vectorNames = symbols
      .filter((item) => ['Vec3', 'RelativeLocation', 'Vector3f'].includes(item?.type))
      .map((item) => String(item.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);
    if (vectorNames.some((name) => new RegExp(`\\b${name}\\b`).test(source)) && /[+\-*/]/.test(source)) return true;
  }
  if ((Array.isArray(project?.emitters) ? project.emitters : []).some((card) => (
    card?.particle?.velocityMode === 'spawn_relative'
      || card?.particle?.velocityMode === 'spawn_inward'
      || (card?.render?.billboardMode === 'none' && card?.render?.relativeRotation === true)
  ))) return true;
  return (Array.isArray(project?.emitters) ? project.emitters : []).some((card) => (
    Object.values(card?.bindings || {}).some((source) => {
      const raw = String(source || '').trim();
      if (!raw || symbols.some((item) => item?.name === raw)) return false;
      const analysis = analyzeGeneratorExpression(raw, symbols);
      return analysis.valid && expressionAstUsesVectorOperator(analysis.ast);
    })
  ));
}

function expressionAstUsesVectorOperator(node) {
  if (!node || typeof node !== 'object') return false;
  if ((node.kind === 'binary' || node.kind === 'unary')
    && ['Vec3', 'RelativeLocation', 'Vector3f'].includes(node.type)) return true;
  return Object.values(node).some((value) => (
    Array.isArray(value)
      ? value.some(expressionAstUsesVectorOperator)
      : value && typeof value === 'object' && expressionAstUsesVectorOperator(value)
  ));
}

function emitVariableAutomationDeclarations(project) {
  const lines = [];
  const seen = new Set();
  const variables = Array.isArray(project?.parameters?.variables) ? project.parameters.variables : [];
  variables.forEach((item) => {
    const automation = item?.automation;
    if (!automation?.enabled || !['Int', 'Long', 'Float', 'Double'].includes(item?.type) || !isGeneratorValueName(item?.name) || seen.has(item.name)) return;
    seen.add(item.name);
    lines.push(`private val ${safeIdent(`automation_${item.name}`)} = ${curveToKotlin(automation.curve, 0)}`);
  });
  return lines.join('\n');
}

function automationValueExpr(item, automation) {
  const target = safeIdent(item.name);
  const curve = safeIdent(`automation_${item.name}`);
  const min = fmtD(automation.targetMin, 0);
  const max = fmtD(automation.targetMax, 0);
  const progress = automation.source === 'variable' && isGeneratorValueName(automation.sourceVariable)
    ? `(((${automation.sourceVariable}).toDouble() - ${fmtD(automation.sourceMin, 0)}) / (${fmtD(automation.sourceMax, 1)} - ${fmtD(automation.sourceMin, 0)})).coerceIn(0.0, 1.0)`
    : 'emitterProgress';
  const sampled = `(${min} + (${max} - ${min}) * ${curve}.sample(${progress}).toDouble())`;
  if (item.type === 'Int') return `${target} = ${sampled}.roundToInt()`;
  if (item.type === 'Long') return `${target} = ${sampled}.roundToLong()`;
  if (item.type === 'Float') return `${target} = ${sampled}.toFloat()`;
  return `${target} = ${sampled}`;
}

function emitDoTick(project, vec3Type = 'Vec3') {
  const source = String(project?.doTick?.source || '').trim();
  const variables = Array.isArray(project?.parameters?.variables) ? project.parameters.variables : [];
  const automations = variables.filter((item) => item?.automation?.enabled && ['Int', 'Long', 'Float', 'Double'].includes(item?.type) && isGeneratorValueName(item?.name));
  if (!source && !automations.length) return ['    override fun doTick() {', '    }'];
  const lines = ['    override fun doTick() {'];
  const needsLifecycleProgress = /\bprogress\b/.test(source)
    || automations.some((item) => item.automation.source !== 'variable' || !isGeneratorValueName(item.automation.sourceVariable));
  if (needsLifecycleProgress) {
    const maxTick = Number(project?.rootLifecycle?.maxTick || 0);
    const duration = maxTick > 0 ? fmtD(maxTick, 1) : '1.0';
    lines.push(`        val emitterProgress = (tick.toDouble() / ${duration}).coerceIn(0.0, 1.0)`);
    if (/\bprogress\b/.test(source)) lines.push('        val progress = emitterProgress');
  }
  if (source) {
    const typed = analyzeGeneratorDoTick(source, project.parameters, {
      context: { tick: 0, progress: 0 }
    });
    if (typed.handled && typed.valid) {
      typed.statements.forEach((statement) => {
        let text;
        if (statement.declaration) {
          const keyword = statement.declarationKeyword === 'val' ? 'val' : 'var';
          text = `${keyword} ${statement.name} = ${statement.kotlin}`;
        } else if (statement.operator !== '='
          && ['Int', 'Long', 'Float', 'Double'].includes(statement.type)
          && statement.rhsKotlin === statement.rhs) {
          text = `${statement.name} ${statement.operator} ${statement.rhs}`;
        } else {
          text = `${statement.name} = ${statement.kotlin}`;
        }
        lines.push(`        ${mapVec3Expression(text, vec3Type)}`);
      });
    } else if (!typed.handled && typed.fallbackSafe !== true) {
      lines.push(`        // doTick 未生成：${typed.message || '复杂 doTick 无法可靠转换为 Kotlin'}`);
    } else if (!typed.valid && typed.message) {
      lines.push(`        // doTick 未生成：${typed.message}`);
    } else {
      generatorExpressionToKotlin(source).split('\n').forEach((line) => {
        const text = line.trimEnd();
        if (text.trim()) lines.push(`        ${text}`);
      });
    }
  }
  automations.forEach((item) => lines.push(`        ${automationValueExpr(item, item.automation)}`));
  lines.push('    }');
  return lines;
}

function projectBindingsUseProgress(project) {
  return (Array.isArray(project?.emitters) ? project.emitters : []).some((card) => (
    Object.values(card?.bindings || {}).some((source) => /\bprogress\b/.test(String(source || '')))
  ));
}

function emitterProgressKotlin(project, indentSize = 8) {
  const maxTick = Number(project?.rootLifecycle?.maxTick || 0);
  const duration = maxTick > 0 ? fmtD(maxTick, 1) : '1.0';
  const pad = ' '.repeat(indentSize);
  return [
    `${pad}val emitterProgress = (tick.toDouble() / ${duration}).coerceIn(0.0, 1.0)`,
    `${pad}val progress = emitterProgress`
  ];
}

function emitEmitterGravityApplication(project, bindingResolver) {
  const physicsCards = project.emitters
    .filter((card) => card.enabled !== false && !card.useGPU)
    .map((card) => {
      const gravityBinding = resolveBindingRef(bindingResolver, card, 'physics.gravity', 'Double');
      return {
        gravity: Number(card.physics?.gravity || 0),
        gravityBinding: gravityBinding?.expression ? `(${gravityBinding.name}).toDouble()` : gravityBinding?.name || '',
        signExpr: intExpr(bindingResolver, card, 'render.sign', card.render.sign)
      };
    });
  if (!physicsCards.some(({ gravity, gravityBinding }) => gravityBinding || gravity > 0)) return [];

  const lines = [];
  const seenSigns = new Set();
  physicsCards.forEach(({ gravity, gravityBinding, signExpr }) => {
    if (seenSigns.has(signExpr)) return;
    const branch = seenSigns.size === 0 ? 'if' : 'else if';
    seenSigns.add(signExpr);
    lines.push(`        ${branch} (data.sign == ${signExpr}) {`);
    if (!gravityBinding && gravity <= 0) {
      lines.push('            Unit');
      lines.push('        }');
      return;
    }
    const gravityExpr = gravityBinding
      ? `(${gravityBinding}).coerceAtLeast(0.0)`
      : fmtD(gravity);
    lines.push(`            data.velocity = data.velocity.add(0.0, -${gravityExpr}, 0.0)`);
    lines.push('        }');
  });
  return lines;
}

function resolveCollisionTargets(project) {
  const collisionCards = project.emitters
    .filter((card) => card.enabled !== false && !card.useGPU && card.physics?.collision === true);
  if (!collisionCards.length) return null;
  if (collisionCards.some((card) => !card.physics.collisionTargets.length)) return [];
  return Array.from(new Set(
    collisionCards.flatMap((card) => card.physics.collisionTargets.map((value) => fmtI(value)))
  ));
}

function emitCollisionMovementOverride(project, target) {
  const collisionTargets = resolveCollisionTargets(project);
  if (collisionTargets === null) return '';
  let targetCondition = '';
  if (collisionTargets.length === 1) {
    targetCondition = ` || data.sign != ${collisionTargets[0]}`;
  } else if (collisionTargets.length > 1) {
    targetCondition = ` || data.sign !in setOf(${collisionTargets.join(', ')})`;
  }
  return [
    'override fun moveSingleParticleWithVelocity(',
    '    particle: ControlableParticle,',
    '    data: ControlableParticleData,',
    `    to: ${target.vec3Type},`,
    '    collide: BlockHitResult',
    ') {',
    `    if (collide.type == HitResult.Type.MISS${targetCondition}) {`,
    '        particle.teleportTo(to)',
    '        return',
    '    }',
    '    data.velocity = PhysicsUtil.collideMovement(collide, data.velocity)',
    '    particle.teleportTo(PhysicsUtil.fixBeforeCollidePosition(collide))',
    '}'
  ].join('\n');
}

const emitterReservedNames = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true',
  'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
  'baseDir', 'controler', 'count', 'data', 'delay', 'dir', 'doTick', 'genParticles', 'gravity',
  'init', 'lerpProgress', 'lifeProgress', 'locs', 'maxTick', 'moveSingleParticleWithVelocity',
  'particleLerpProgress', 'particleSize', 'pos', 'posLerpProgress', 'rand', 'rel', 'res',
  'singleParticleAction', 'source', 'spawnPos', 'spawnWorld', 'speed', 'tick', 'uuid',
  'relativeRotationDir', 'velocity', 'velocityJitter', 'velocityRandom', 'world'
]);

function createEmitterVariablePlan(project, cards) {
  const baseName = (card, index, kind) => safeIdent(
    card.vars?.[kind],
    `${kind}${index + 1}`
  );
  const usedClassNames = new Set(emitterReservedNames);
  for (const item of [
    ...(project.parameters?.variables || []),
    ...(project.parameters?.constants || [])
  ]) {
    if (isGeneratorValueName(item?.name)) usedClassNames.add(item.name);
  }
  cards.forEach((_, index) => {
    const prefix = `emitter${index + 1}`;
    ['SizeX', 'SizeY', 'Light', 'Opacity', 'Roll', 'Yaw', 'Pitch', 'ColorProgress']
      .forEach((suffix) => usedClassNames.add(`${prefix}${suffix}`));
  });
  (project.commandQueues || []).forEach((_, index) => usedClassNames.add(`commandQueue${index + 1}`));
  (project.parameters?.variables || []).forEach((item) => {
    if (isGeneratorValueName(item?.name)) usedClassNames.add(safeIdent(`automation_${item.name}`));
  });

  function resolveSharedNames(kind, enabledKey) {
    const resolved = new Map();
    cards.forEach((card, index) => {
      if (!card[enabledKey]) return;
      const raw = baseName(card, index, kind);
      const key = kind === 'template' ? `${raw}:${card.useGPU ? 'gpu' : 'cpu'}` : raw;
      if (resolved.has(key)) return;
      let name = raw;
      let suffix = 2;
      while (usedClassNames.has(name)) {
        name = `${raw}_${suffix}`;
        suffix += 1;
      }
      resolved.set(key, name);
      usedClassNames.add(name);
    });
    return resolved;
  }

  const externalTemplateNames = resolveSharedNames('template', 'externalTemplate');
  const externalDataNames = resolveSharedNames('data', 'externalData');
  const entries = cards.map((card, index) => {
    const rawData = baseName(card, index, 'data');
    const rawTemplate = baseName(card, index, 'template');
    const data = card.externalData ? externalDataNames.get(rawData) : rawData;
    const templateKey = `${rawTemplate}:${card.useGPU ? 'gpu' : 'cpu'}`;
    const template = card.externalTemplate ? externalTemplateNames.get(templateKey) : rawTemplate;
    return { card, data, template };
  });

  entries.forEach((entry, index) => {
    if (!entry.card.externalData) {
      const base = `data${index + 1}`;
      let name = base;
      let suffix = 2;
      while (usedClassNames.has(name)) {
        name = `${base}_${suffix}`;
        suffix += 1;
      }
      entry.data = name;
      usedClassNames.add(name);
    }
    if (!entry.card.externalTemplate && entry.template === entry.data) {
      entry.template = `${entry.template}_template`;
    }
    if (!entry.card.externalTemplate) {
      const raw = entry.template;
      let name = raw;
      let suffix = 2;
      while (emitterReservedNames.has(name) || name === entry.data) {
        name = `${raw}_${suffix}`;
        suffix += 1;
      }
      entry.template = name;
    }
  });
  return entries;
}

function emitterDataAssignments(bindingResolver, card) {
  const lines = [
    `minAge = ${intExpr(bindingResolver, card, 'particle.lifeMin', card.particle.lifeMin)}`,
    `maxAge = ${intExpr(bindingResolver, card, 'particle.lifeMax', card.particle.lifeMax)}`,
    `minCount = ${intExpr(bindingResolver, card, 'particle.countMin', card.particle.countMin)}`,
    `maxCount = ${intExpr(bindingResolver, card, 'particle.countMax', card.particle.countMax)}`,
    `minSize = ${numberExpr(bindingResolver, card, 'particle.sizeMin', card.particle.sizeMin)}`,
    `maxSize = ${numberExpr(bindingResolver, card, 'particle.sizeMax', card.particle.sizeMax)}`,
    `minSpeed = ${numberExpr(bindingResolver, card, 'particle.speedMin', card.particle.speedMin)}`,
    `maxSpeed = ${numberExpr(bindingResolver, card, 'particle.speedMax', card.particle.speedMax)}`
  ];
  lines.push(`leftColor = ${colorExpr(bindingResolver, card, 'particle.colorStart', card.particle.colorStart)}`);
  lines.push(`rightColor = ${colorGradientEnabled(card)
    ? colorExpr(bindingResolver, card, 'particle.colorEnd', card.particle.colorEnd)
    : colorExpr(bindingResolver, card, 'particle.colorStart', card.particle.colorStart)}`);
  return lines;
}

function emitterTemplateAssignments(bindingResolver, card, dataVar, target, curvePrefix) {
  const lines = [];
  const initialOpacity = curveEnabled(card.curves.opacity)
    ? sampleLifecycleCurve(card.curves.opacity, 0)
    : 100;
  const initialColorProgress = colorCurveEnabled(card)
    ? clampUnit(sampleLifecycleCurve(card.curves.color, 0))
    : 0;
  const hasAlphaBinding = Boolean(resolveBindingRef(bindingResolver, card, 'render.alpha', 'Double'));
  lines.push(`velocity = ${vectorExpr(bindingResolver, card, 'particle.velocity', card.particle.velocity, target.vec3Type)}`);
  lines.push(`uniformSize = ${usesIndependentScale(card) ? 'false' : 'true'}`);
  lines.push(`weightSize = ${floatExpr(bindingResolver, card, 'render.baseScale.x', card.render.baseScale.x)}`);
  lines.push(`heightSize = ${usesIndependentScale(card)
    ? floatExpr(bindingResolver, card, 'render.baseScale.y', card.render.baseScale.y)
    : floatExpr(bindingResolver, card, 'render.baseScale.x', card.render.baseScale.x)}`);
  lines.push(`visibleRange = ${floatExpr(bindingResolver, card, 'particle.visibleRange', card.particle.visibleRange)}`);
  lines.push(card.useGPU
    ? colorCurveEnabled(card)
      ? 'color = Vector3f(1f)'
      : `color = ${colorExpr(bindingResolver, card, 'particle.colorStart', card.particle.colorStart)}`
    : `color = ${dataVar}.getInterpolatedColor(${fmtD(initialColorProgress)})`);
  if (card.useGPU) {
    lines.push(`alpha = (${numberExpr(bindingResolver, card, 'render.alpha', card.render.alpha)} / 100.0).toFloat()`);
  } else {
    lines.push(hasAlphaBinding
      ? `alpha = (${numberExpr(bindingResolver, card, 'render.alpha', card.render.alpha)} * ${fmtD(initialOpacity)} / 10000.0).toFloat()`
      : `alpha = (${fmtD(initialOpacity * Number(card.render.alpha || 0) / 100)} / 100.0).toFloat()`);
  }
  lines.push(`light = ${intExpr(bindingResolver, card, 'render.light', card.render.light)}`);
  lines.push(textureSheetStatement(bindingResolver, card, card.render.textureSheet));
  lines.push(`cameraOption = ${cameraOptionConstant(card.render.billboardMode)}`);
  if (card.render.billboardMode === 'axis_billboard') {
    lines.push(`axis = ${vectorExpr(bindingResolver, card, 'render.axis', card.render.axis, target.vec3Type)}`);
  }
  lines.push(`roll = (${numberExpr(bindingResolver, card, 'render.roll', card.render.roll)} * PI / 180.0).toFloat()`);
  if (card.render.billboardMode === 'none') {
    lines.push(`yaw = (${numberExpr(bindingResolver, card, 'render.yaw', card.render.yaw)} * PI / 180.0).toFloat()`);
    lines.push(`pitch = (${numberExpr(bindingResolver, card, 'render.pitch', card.render.pitch)} * PI / 180.0).toFloat()`);
  }
  lines.push(`speedLimit = ${numberExpr(bindingResolver, card, 'render.speedLimit', card.render.speedLimit)}`);
  lines.push(`sign = ${intExpr(bindingResolver, card, 'render.sign', card.render.sign)}`);
  lines.push(`effect = ${safeKotlinReference(card.render.effectClass, 'ControlableEndRodEffect')}(uuid)`);
  if (card.useGPU) {
    lines.push(`updateMode = CParticleUpdateMode.${card.gpu.updateMode === 'dynamic' ? 'DYNAMIC' : 'STATIC'}`);
    lines.push(`blockCollision = ${fmtBool(card.physics.collision)}`);
    if (curveEnabled(card.curves.opacity)) {
      lines.push(`alphaCurve = CParticleCurve.fromFloatCurve(${curvePrefix}Opacity)`);
    }
    if (card.curves.size.syncAxes) {
      if (curveEnabled(card.curves.size.x)) {
        lines.push(`scaleCurve = CParticleCurve.fromFloatCurve(${curvePrefix}SizeX)`);
      }
    } else {
      if (curveEnabled(card.curves.size.x)) {
        lines.push(`scaleXCurve = CParticleCurve.fromFloatCurve(${curvePrefix}SizeX)`);
      }
      if (curveEnabled(card.curves.size.y)) {
        lines.push(`scaleYCurve = CParticleCurve.fromFloatCurve(${curvePrefix}SizeY)`);
      }
    }
    if (colorCurveEnabled(card) && !usesDataColorCurve(card)) {
      lines.push(`colorCurve = ${cparticleColorCurveExpr(bindingResolver, card)}`);
    }
    if (card.gpu.randomSeed !== null) lines.push(`randomSeed = ${fmtI(card.gpu.randomSeed)}`);
  }
  return lines;
}

function emitterTemplateType(card) {
  return card.useGPU ? 'ControlableCParticleData' : 'ControlableParticleData';
}

function emitEmitterParameterDeclarations(bindingResolver, variablePlan, target, section = 'all') {
  const lines = [];
  const declaredData = new Set();
  if (section !== 'templates') {
    variablePlan.forEach(({ card, data }) => {
      if (declaredData.has(data)) return;
      if (card.externalData) {
        lines.push('@CodecField');
        lines.push(`var ${data} = SimpleRandomParticleData().apply {`);
        emitterDataAssignments(bindingResolver, card)
          .map(classInitializerExpression)
          .forEach((line) => lines.push(`    ${line}`));
        lines.push('}');
      } else {
        lines.push(`private val ${data} = SimpleRandomParticleData()`);
      }
      lines.push('');
      declaredData.add(data);
    });
  }

  const declaredTemplates = new Set();
  if (section !== 'data') {
    variablePlan.forEach(({ card, data, template }, index) => {
      if (!card.externalTemplate || declaredTemplates.has(template)) return;
      lines.push('@CodecField');
      lines.push(`var ${template} = ${emitterTemplateType(card)}().apply {`);
      emitterTemplateAssignments(bindingResolver, card, data, target, `emitter${index + 1}`)
        .map(classInitializerExpression)
        .forEach((line) => lines.push(`    ${line}`));
      lines.push('}');
      lines.push('');
      declaredTemplates.add(template);
    });
  }
  return lines.join('\n').trimEnd();
}

function classInitializerExpression(line) {
  return line.replace(/\bprogress\b/g, '0.0');
}

function hasVelocityJitter(bindingResolver, card) {
  if (resolveBindingRef(bindingResolver, card, 'particle.velocityRandom', 'Vec3')) return true;
  return ['x', 'y', 'z'].some((component) => (
    resolveBindingRef(bindingResolver, card, `particle.velocityRandom.${component}`, 'Double')
      || Number(card.particle.velocityRandom?.[component] || 0) !== 0
  ));
}

function emitEmitterBlock(bindingResolver, card, index, target, variables, singleEmissionTick = undefined) {
  const n = index + 1;
  const templateVar = variables.template;
  const dataVar = variables.data;
  const lines = [];
  lines.push(`// 发射器 #${n}: ${card.name}`);
  lines.push(`if (${buildEmitterActiveExpr(card, singleEmissionTick)}) {`);
  if (!card.externalData) {
    lines.push(`    ${dataVar}.apply {`);
    emitterDataAssignments(bindingResolver, card).forEach((line) => lines.push(`        ${line}`));
    lines.push('    }');
  }
  if (!card.externalTemplate) {
    lines.push(`    val ${templateVar} = ${emitterTemplateType(card)}().apply {`);
    emitterTemplateAssignments(bindingResolver, card, dataVar, target, `emitter${n}`).forEach((line) => lines.push(`        ${line}`));
    lines.push('    }');
  }
  lines.push('    res.addAll(');
  lines.push(indent(emitEmitterPointBuilder(bindingResolver, card, dataVar), 8));
  lines.push('            .createWithoutClone()');
  lines.push('            .map { rel ->');
  lines.push(`                val speed = ${dataVar}.getRandomSpeed()`);
  lines.push(`                val particleSize = ${dataVar}.getRandomSize()`);
  const usesSpawnRelative = card.particle.velocityMode === 'spawn_relative'
    || card.particle.velocityMode === 'spawn_inward'
    || (card.render.billboardMode === 'none' && card.render.relativeRotation);
  if (usesSpawnRelative) {
    lines.push(`                val spawnRelative = rel.toVector() - ${relativeExpr(bindingResolver, card, 'emitter.offset', card.emitter.offset)}.toVector()`);
  }
  const jitterEnabled = hasVelocityJitter(bindingResolver, card);
  if (jitterEnabled) {
    const vectorBinding = resolveBindingRef(bindingResolver, card, 'particle.velocityRandom', 'Vec3');
    if (vectorBinding) {
      lines.push(`                val velocityRandom = ${vectorExpr(bindingResolver, card, 'particle.velocityRandom', card.particle.velocityRandom, target.vec3Type)}`);
    }
    const component = (key) => vectorBinding
      ? `velocityRandom.${key}`
      : numberExpr(bindingResolver, card, `particle.velocityRandom.${key}`, card.particle.velocityRandom[key]);
    lines.push(`                val velocityJitter = ${target.vec3Type}((Random.nextDouble() * 2.0 - 1.0) * ${component('x')}, (Random.nextDouble() * 2.0 - 1.0) * ${component('y')}, (Random.nextDouble() * 2.0 - 1.0) * ${component('z')})`);
  }
  if (card.particle.velocityMode === 'spawn_relative') {
    lines.push(`                val dir = spawnRelative${jitterEnabled ? '.add(velocityJitter)' : ''}`);
    lines.push(`                val velocity = if (dir.${target.lengthSquaredMethod}() < 1e-8) ${target.vec3Type}.ZERO else dir.normalize().${target.multiplyMethod}(speed)`);
  } else if (card.particle.velocityMode === 'spawn_inward') {
    lines.push(`                val dir = -spawnRelative${jitterEnabled ? ' + velocityJitter' : ''}`);
    lines.push(`                val velocity = if (dir.${target.lengthSquaredMethod}() < 1e-8) ${target.vec3Type}.ZERO else dir.normalize().${target.multiplyMethod}(speed)`);
  } else {
    lines.push(`                val baseDir = ${templateVar}.velocity${jitterEnabled ? '.add(velocityJitter)' : ''}`);
    lines.push(`                val velocity = if (baseDir.${target.lengthSquaredMethod}() < 1e-8) ${target.vec3Type}.ZERO else baseDir.normalize().${target.multiplyMethod}(speed)`);
  }
  if (card.render.billboardMode === 'none' && card.render.relativeRotation) {
    lines.push('                val relativeRotationDir = spawnRelative');
  }
  lines.push(`                ${templateVar}.clone().apply {`);
  lines.push(`                    maxAge = ${dataVar}.getRandomParticleMaxAge()`);
  if (resolveBindingRef(bindingResolver, card, 'render.alpha', 'Double')) {
    const alphaExpr = numberExpr(bindingResolver, card, 'render.alpha', card.render.alpha);
    if (card.useGPU) {
      lines.push(`                    this.alpha = (${alphaExpr} / 100.0).toFloat()`);
    } else {
      const initialOpacity = curveEnabled(card.curves.opacity)
        ? sampleLifecycleCurve(card.curves.opacity, 0)
        : 100;
      lines.push(`                    this.alpha = (${alphaExpr} * ${fmtD(initialOpacity)} / 10000.0).toFloat()`);
    }
  }
  const initialColorProgress = colorCurveEnabled(card)
    ? clampUnit(sampleLifecycleCurve(card.curves.color, 0))
    : 0;
  lines.push(`                    this.color = ${card.useGPU
    ? colorCurveEnabled(card)
      ? 'Vector3f(1f)'
      : colorExpr(bindingResolver, card, 'particle.colorStart', card.particle.colorStart)
    : colorCurveEnabled(card)
      ? `${dataVar}.getInterpolatedColor(${fmtD(initialColorProgress)})`
      : `${dataVar}.getRandomColor()`}`);
  if (usesIndependentScale(card)) {
    lines.push('                    uniformSize = false');
    lines.push(`                    weightSize = particleSize * ${templateVar}.weightSize`);
    lines.push(`                    heightSize = particleSize * ${templateVar}.heightSize`);
  } else {
    lines.push(`                    size = particleSize * ${templateVar}.weightSize`);
  }
  lines.push('                    this.velocity = velocity');
  if (card.render.billboardMode === 'none' && card.render.relativeRotation) {
    lines.push(`                    if (relativeRotationDir.${target.lengthSquaredMethod}() >= 1e-8) {`);
    lines.push(`                        this.pitch = ${templateVar}.pitch + atan2(relativeRotationDir.z, relativeRotationDir.y).toFloat()`);
    lines.push(`                        this.roll = ${templateVar}.roll + atan2(-relativeRotationDir.x, hypot(relativeRotationDir.y, relativeRotationDir.z)).toFloat()`);
    lines.push('                    }');
  }
  if (usesDataColorCurve(card)) {
    lines.push(`                    colorCurve = ${cparticleColorCurveExpr(bindingResolver, card, dataVar)}`);
  }
  lines.push('                } to rel');
  lines.push('            }');
  lines.push('    )');
  lines.push('}');
  return lines.join('\n');
}

function usesIndependentScale(card) {
  return card.render.scaleMode === 'xyz';
}

function buildEmitterActiveExpr(card, singleEmissionTick = undefined) {
  const start = fmtI(card.emission.startTick);
  const end = Number(card.emission.endTick);
  const base = end < 0 ? `tick >= ${start}` : `tick >= ${start} && tick <= ${fmtI(end)}`;
  if (card.emission.mode === 'once') {
    if (singleEmissionTick === false) return 'false';
    return singleEmissionTick === null ? base : `tick == ${singleEmissionTick ?? start}`;
  }
  if (card.emission.mode === 'burst') return `(${base}) && ((tick - ${start}) % ${fmtI(card.emission.burstInterval, 1)} == 0)`;
  return base;
}

function firstReachableParentTick(card, delay) {
  const start = Math.max(0, Math.trunc(Number(card.emission.startTick) || 0));
  const end = Math.trunc(Number(card.emission.endTick ?? -1));
  const tick = Math.ceil(start / delay) * delay;
  return end >= 0 && tick > end ? null : tick;
}

function createEmitterLifecyclePlan(project, enabledEmitters) {
  if (project.rootLifecycle.mode === 'once') {
    return { delay: 1, maxTick: 1, singleEmissionTicks: enabledEmitters.map(() => null) };
  }
  const delay = Math.max(1, Math.trunc(Number(project.rootLifecycle.intervalTick) || 1));
  const singleEmissionTicks = enabledEmitters.map((card) => (
    card.emission.mode === 'once' ? firstReachableParentTick(card, delay) : null
  ));
  if (project.rootLifecycle.mode !== 'interval'
    || !enabledEmitters.length
    || enabledEmitters.some((card) => card.emission.mode !== 'once')) {
    return { delay, maxTick: null, singleEmissionTicks };
  }
  const reachableTicks = singleEmissionTicks.filter((tick) => Number.isInteger(tick));
  const maxTick = reachableTicks.length ? Math.max(...reachableTicks) + 1 : 1;
  return {
    delay,
    maxTick,
    singleEmissionTicks: maxTick === 1
      ? singleEmissionTicks.map((tick) => tick === 0 ? null : tick === null ? false : tick)
      : singleEmissionTicks.map((tick) => tick === null ? false : tick)
  };
}

function emitLifecycleAction(
  project,
  bindingResolver,
  target,
  variablePlan,
  includeCommandQueues = true
) {
  const enabled = project.emitters.filter((card) => card.enabled !== false);
  const lifecycleCards = enabled
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.useGPU && cardHasCpuLifecycle(card));
  const gravityLines = emitEmitterGravityApplication(project, bindingResolver);
  const commandLines = includeCommandQueues ? emitCommandQueueApplication(project) : [];
  const hasCpuWork = lifecycleCards.length || gravityLines.length || commandLines.length;
  if (!hasCpuWork && enabled.length && enabled.every((card) => card.useGPU)) return '';
  const lines = [];
  lines.push('override fun singleParticleAction(');
  lines.push('    controler: ParticleControler,');
  lines.push('    data: ControlableParticleData,');
  lines.push('    spawnPos: RelativeLocation,');
  lines.push(`    spawnWorld: ${target.worldType},`);
  lines.push('    particleLerpProgress: Float,');
  lines.push('    posLerpProgress: Float');
  lines.push(') {');
  if (!hasCpuWork) {
    lines.push('}');
    return lines.join('\n');
  }
  const alphaBindings = lifecycleCards.map(({ card, index }) => ({
    card,
    index,
    binding: resolveBindingRef(bindingResolver, card, 'render.alpha', 'Double')
  })).filter((item) => item.binding && curveEnabled(item.card.curves.opacity));
  if (alphaBindings.some(({ binding }) => /\bprogress\b/.test(binding.name))) {
    const maxTick = Number(project?.rootLifecycle?.maxTick || 0);
    const duration = maxTick > 0 ? fmtD(maxTick, 1) : '1.0';
    lines.push(`    val particleSpawnProgress = (tick.toDouble() / ${duration}).coerceIn(0.0, 1.0)`);
  }
  alphaBindings.forEach(({ card, index }) => {
    const alpha = numberExpr(bindingResolver, card, 'render.alpha', card.render.alpha)
      .replace(/\bprogress\b/g, 'particleSpawnProgress');
    lines.push(`    val emitter${index + 1}BaseAlpha = (${alpha} / 100.0)`);
  });
  lines.push('    controler.addPreTickAction {');
  if (lifecycleCards.length) {
    lines.push(`        val lifeProgress = if (this.${target.lifetimeProperty} <= 0) 1.0 else (this.currentAge.toDouble() / this.${target.lifetimeProperty}.toDouble()).coerceIn(0.0, 1.0)`);
  }
  if (projectBindingsUseProgress(project)) lines.push(...emitterProgressKotlin(project, 8));
  lines.push(...gravityLines);
  lines.push(...commandLines);
  if (lifecycleCards.length) {
    lines.push('        when (data.sign) {');
    const emittedSigns = new Set();
    lifecycleCards.forEach(({ card, index }) => {
      const n = index + 1;
      const prefix = `emitter${n}`;
      const dataVar = variablePlan[index].data;
      const sign = card.externalTemplate
        ? `${variablePlan[index].template}.sign`
        : intExpr(bindingResolver, card, 'render.sign', card.render.sign);
      if (emittedSigns.has(sign)) return;
      emittedSigns.add(sign);
      lines.push(`            ${sign} -> {`);
      if (colorCurveEnabled(card)) {
        lines.push(`                this.color = ${dataVar}.getInterpolatedColor(${prefix}ColorProgress.sample(lifeProgress).toDouble().coerceIn(0.0, 1.0))`);
      }
      emitCpuSizeCurveAssignments(lines, card, prefix);
      if (curveEnabled(card.curves.opacity)) {
        const alphaBinding = resolveBindingRef(bindingResolver, card, 'render.alpha', 'Double');
        const opacity = alphaBinding
          ? `${prefix}BaseAlpha * ${prefix}Opacity.sample(lifeProgress)`
          : `${prefix}Opacity.sample(lifeProgress)`;
        lines.push(`                this.particleAlpha = (${opacity}).toFloat().coerceIn(0f, 1f)`);
      }
      if (curveEnabled(card.curves.light)) {
        lines.push(`                this.light = ${prefix}Light.sample(lifeProgress).toInt().coerceIn(-1, 15)`);
      }
      if (curveEnabled(card.curves.rotation.roll)) {
        lines.push(`                this.currentRoll = ${card.render.relativeRotation
          ? curveOffsetRad('data.roll', `${prefix}Roll`)
          : curveDegToRad(card.render.roll, `${prefix}Roll`)}`);
      }
      if (card.render.billboardMode === 'none') {
        if (card.curves.rotation.syncAxes && curveEnabled(card.curves.rotation.roll)) {
          lines.push(`                this.currentYaw = ${card.render.relativeRotation
            ? curveOffsetRad('data.yaw', `${prefix}Roll`)
            : curveDegToRad(card.render.yaw, `${prefix}Roll`)}`);
          lines.push(`                this.currentPitch = ${card.render.relativeRotation
            ? curveOffsetRad('data.pitch', `${prefix}Roll`)
            : curveDegToRad(card.render.pitch, `${prefix}Roll`)}`);
        } else {
          if (curveEnabled(card.curves.rotation.yaw)) {
            lines.push(`                this.currentYaw = ${card.render.relativeRotation
              ? curveOffsetRad('data.yaw', `${prefix}Yaw`)
              : curveDegToRad(card.render.yaw, `${prefix}Yaw`)}`);
          }
          if (curveEnabled(card.curves.rotation.pitch)) {
            lines.push(`                this.currentPitch = ${card.render.relativeRotation
              ? curveOffsetRad('data.pitch', `${prefix}Pitch`)
              : curveDegToRad(card.render.pitch, `${prefix}Pitch`)}`);
          }
        }
      }
      lines.push('            }');
    });
    lines.push('        }');
  }
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

function cardHasCpuLifecycle(card) {
  if (colorCurveEnabled(card)
    || curveEnabled(card.curves.opacity)
    || curveEnabled(card.curves.light)
    || curveEnabled(card.curves.rotation.roll)) return true;
  if (curveEnabled(card.curves.size.x)) return true;
  if (usesIndependentScale(card) && !card.curves.size.syncAxes && curveEnabled(card.curves.size.y)) return true;
  return card.render.billboardMode === 'none'
    && !card.curves.rotation.syncAxes
    && (curveEnabled(card.curves.rotation.yaw) || curveEnabled(card.curves.rotation.pitch));
}

function emitCpuSizeCurveAssignments(lines, card, prefix) {
  const xEnabled = curveEnabled(card.curves.size.x);
  const yEnabled = card.curves.size.syncAxes ? xEnabled : curveEnabled(card.curves.size.y);
  if (usesIndependentScale(card)) {
    if (!xEnabled && !yEnabled) return;
    lines.push('                this.uniformSize = false');
    if (xEnabled) {
      lines.push(`                this.weightSize = (data.weightSize * ${prefix}SizeX.sample(lifeProgress)).toFloat()`);
    }
    if (yEnabled) {
      const yCurve = card.curves.size.syncAxes ? `${prefix}SizeX` : `${prefix}SizeY`;
      lines.push(`                this.heightSize = (data.heightSize * ${yCurve}.sample(lifeProgress)).toFloat()`);
    }
    return;
  }
  if (!xEnabled) return;
  lines.push('                this.uniformSize = true');
  lines.push(`                this.size = (data.size * ${prefix}SizeX.sample(lifeProgress)).toFloat()`);
}

export function generateEmitterScript(project) {
  return generateEmitterKotlin(project);
}

export function generateEmitterKotlin(rawProject) {
  const project = normalizeGeneratorProject(rawProject);
  const compatibilityErrors = collectCParticleCompatibilityErrors(project);
  if (compatibilityErrors.length) {
    throw new Error(compatibilityErrors.join('\n'));
  }
  const bindingResolver = createGeneratorBindingResolver(project.parameters);
  const target = project.kotlin.mapping === 'yarn'
    ? {
        vec3Type: 'Vec3d',
        worldType: 'World',
        lengthSquaredMethod: 'lengthSquared',
        multiplyMethod: 'multiply',
        lifetimeProperty: 'maxAge',
        blockHitResultImport: 'net.minecraft.util.hit.BlockHitResult',
        hitResultImport: 'net.minecraft.util.hit.HitResult'
      }
    : {
        vec3Type: 'Vec3',
        worldType: 'Level',
        lengthSquaredMethod: 'lengthSqr',
        multiplyMethod: 'scale',
        lifetimeProperty: 'lifetime',
        blockHitResultImport: 'net.minecraft.world.phys.BlockHitResult',
        hitResultImport: 'net.minecraft.world.phys.HitResult'
      };
  const className = safeIdent(project.kotlin.className, 'GeneratedEmitter');
  const packageName = safePackage(project.kotlin.packageName);
  const baseClass = safeIdent(project.kotlin.baseClass, 'AutoParticleEmitters');
  const enabledEmitters = project.emitters.filter((card) => card.enabled !== false);
  const lifecyclePlan = createEmitterLifecyclePlan(project, enabledEmitters);
  const hasGpuEmitters = enabledEmitters.some((card) => card.useGPU);
  const hasGpuFloatCurves = enabledEmitters.some((card) => card.useGPU && (
    curveEnabled(card.curves.size.x)
    || (!card.curves.size.syncAxes && curveEnabled(card.curves.size.y))
    || curveEnabled(card.curves.opacity)
  ));
  const hasGpuColorCurves = enabledEmitters.some((card) => card.useGPU && colorCurveEnabled(card));
  const hasGpuBezierColorCurves = enabledEmitters.some((card) => (
    card.useGPU && colorCurveEnabled(card) && card.curves.color.mode === 'bezier'
  ));
  const hasGpuCommands = enabledGpuCommands(project).length > 0;
  const emitterVariablePlan = createEmitterVariablePlan(project, enabledEmitters);
  const lines = [];
  if (packageName) {
    lines.push(`package ${packageName}`);
    lines.push('');
  }
  lines.push('import cn.coostack.cooparticlesapi.annotations.CooAutoRegister');
  lines.push('import cn.coostack.cooparticlesapi.annotations.CodecField');
  if (hasGpuEmitters) {
    lines.push('import cn.coostack.cooparticlesapi.cparticle.CParticleUpdateMode');
  }
  if (hasGpuFloatCurves) lines.push('import cn.coostack.cooparticlesapi.cparticle.CParticleCurve');
  if (hasGpuColorCurves) lines.push('import cn.coostack.cooparticlesapi.cparticle.CParticleColorCurve');
  if (hasGpuBezierColorCurves) lines.push('import cn.coostack.cooparticlesapi.cparticle.CParticleBezierColorKeyframe');
  if (hasGpuCommands) {
    lines.push('import cn.coostack.cooparticlesapi.cparticle.force.CParticleForce');
  }
  if (usesVectorOperatorExtensions(project)) lines.push('import cn.coostack.cooparticlesapi.extend.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.command.*');
  lines.push('import cn.coostack.cooparticlesapi.network.particle.emitters.command.curve.*');
  lines.push('import cn.coostack.cooparticlesapi.particles.ParticleCameraOption');
  lines.push('import cn.coostack.cooparticlesapi.particles.control.ParticleControler');
  lines.push('import cn.coostack.cooparticlesapi.particles.impl.*');
  lines.push('import cn.coostack.cooparticlesapi.supports.TextureSheetsEnum');
  lines.push('import cn.coostack.cooparticlesapi.utils.RelativeLocation');
  const collisionEnabled = resolveCollisionTargets(project) !== null;
  if (collisionEnabled) lines.push('import cn.coostack.cooparticlesapi.utils.PhysicsUtil');
  lines.push('import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder');
  lines.push(project.kotlin.mapping === 'yarn'
    ? 'import net.minecraft.world.World'
    : 'import net.minecraft.world.level.Level');
  lines.push(project.kotlin.mapping === 'yarn'
    ? 'import net.minecraft.util.math.Vec3d'
    : 'import net.minecraft.world.phys.Vec3');
  if (collisionEnabled) {
    lines.push(`import ${target.blockHitResultImport}`);
    lines.push(`import ${target.hitResultImport}`);
  }
  lines.push('import org.joml.Vector3f');
  lines.push('import kotlin.math.*');
  lines.push('import kotlin.random.Random');
  lines.push('');
  lines.push('@CooAutoRegister');
  lines.push(`class ${className}(pos: ${target.vec3Type}, world: ${target.worldType}?) : ${baseClass}(pos, world) {`);
  if (hasGpuCommands) {
    lines.push(indent(emitCParticleForces(project, target.vec3Type), 4));
    lines.push('');
  }
  const parameterDeclarations = emitProjectParameterDeclarations(project, target.vec3Type);
  if (parameterDeclarations) {
    lines.push(indent(parameterDeclarations, 4));
    lines.push('');
  }
  const emitterDataDeclarations = emitEmitterParameterDeclarations(bindingResolver, emitterVariablePlan, target, 'data');
  if (emitterDataDeclarations) {
    lines.push(indent(emitterDataDeclarations, 4));
    lines.push('');
  }
  enabledEmitters.forEach((card, index) => {
    lines.push(indent(emitCurveDeclarations(bindingResolver, card, index), 4));
    lines.push('');
  });
  const emitterTemplateDeclarations = emitEmitterParameterDeclarations(bindingResolver, emitterVariablePlan, target, 'templates');
  if (emitterTemplateDeclarations) {
    lines.push(indent(emitterTemplateDeclarations, 4));
    lines.push('');
  }
  const variableAutomationDeclarations = emitVariableAutomationDeclarations(project);
  if (variableAutomationDeclarations) {
    lines.push(indent(variableAutomationDeclarations, 4));
    lines.push('');
  }
  const expressionHelpers = emitExpressionHelpers(project);
  if (expressionHelpers) {
    lines.push(indent(expressionHelpers, 4));
    lines.push('');
  }
  const commandQueues = emitCommandQueueDeclarations(project, target.vec3Type, hasGpuEmitters);
  if (commandQueues) {
    lines.push(indent(commandQueues, 4));
    lines.push('');
  }
  lines.push('    init {');
  const gravity = resolveGlobalGravity(project);
  if (!hasGpuEmitters && gravity !== null) {
    lines.push(`        gravity = ${fmtD(gravity, 0.04)}`);
  }
  if (lifecyclePlan.maxTick !== null) {
    lines.push(`        delay = ${fmtI(lifecyclePlan.delay, 1)}`);
    lines.push(`        maxTick = ${fmtI(lifecyclePlan.maxTick, 1)}`);
  } else if (project.rootLifecycle.mode === 'interval_n_tick') {
    lines.push(`        delay = ${fmtI(project.rootLifecycle.intervalTick)}`);
    lines.push(`        maxTick = ${fmtI(project.rootLifecycle.maxTick)}`);
  } else {
    lines.push(`        delay = ${fmtI(project.rootLifecycle.intervalTick)}`);
    lines.push('        maxTick = -1');
  }
  lines.push('    }');
  lines.push('');
  lines.push(...emitDoTick(project, target.vec3Type));
  const collisionMovementOverride = emitCollisionMovementOverride(project, target);
  if (collisionMovementOverride) {
    lines.push('');
    lines.push(indent(collisionMovementOverride, 4));
  }
  lines.push('');
  lines.push('    override fun genParticles(lerpProgress: Float): List<Pair<ControlableParticleData, RelativeLocation>> {');
  lines.push('        val res = mutableListOf<Pair<ControlableParticleData, RelativeLocation>>()');
  if (projectBindingsUseProgress(project)) lines.push(...emitterProgressKotlin(project, 8));
  lines.push('');
  enabledEmitters.forEach((card, index) => {
    lines.push(indent(emitEmitterBlock(
      bindingResolver,
      card,
      index,
      target,
      emitterVariablePlan[index],
      lifecyclePlan.singleEmissionTicks[index]
    ), 8));
    lines.push('');
  });
  lines.push('        return res');
  lines.push('    }');
  lines.push('');
  const lifecycleAction = emitLifecycleAction(
    project,
    bindingResolver,
    target,
    emitterVariablePlan,
    true
  );
  if (lifecycleAction) {
    lines.push(indent(lifecycleAction, 4));
  }
  lines.push('}');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
