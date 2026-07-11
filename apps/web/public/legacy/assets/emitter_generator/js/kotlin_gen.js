import { COMMAND_META } from "./command_meta.js";
import { conditionFilterToKotlin, normalizeConditionFilter } from "./expression_cards.js";
import { fmtD, indent, kSupplierVec3, kVec3, sanitizeKNumExpr } from "./utils.js";
import { genEmitterBehaviorKotlin } from "./emitter_behavior.js";
import { emitBuilderKotlinFromState } from "./points_builder_bridge.js";

function safeIdent(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  // very light sanitize for Kotlin identifier
  const t = s.replace(/[^A-Za-z0-9_]/g, "_");
  return t.length ? t : fallback;
}

function safePackageName(raw, fallback = "") {
  const text = String(raw ?? "")
    .trim()
    .replace(/^package\s+/i, "")
    .replace(/;+$/g, "");
  if (!text) return fallback;
  const parts = text
    .split(".")
    .map((part) => safeIdent(part, ""))
    .filter(Boolean);
  return parts.length ? parts.join(".") : fallback;
}

function indentBlock(text, spaces) {
  const pad = " ".repeat(spaces);
  return String(text ?? "")
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

function fmtF(n) {
  // Kotlin Float literal
  const x = Number(n);
  if (Number.isFinite(x)) return `${fmtD(x)}f`;
  const expr = sanitizeKNumExpr(n);
  return expr ? `(${expr}).toFloat()` : "0f";
}

function fmtI(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) {
    const expr = sanitizeKNumExpr(n);
    return expr ? `(${expr}).toInt()` : "0";
  }
  return String(Math.trunc(x));
}

function fmtNumLiteral(v, fallback = 0) {
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (Math.trunc(n) === n) return String(Math.trunc(n));
    return fmtD(n);
  }
  const f = Number(fallback);
  if (Number.isFinite(f)) {
    if (Math.trunc(f) === f) return String(Math.trunc(f));
    return fmtD(f);
  }
  return "0";
}

function numOrExpr(v, fallback) {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const expr = sanitizeKNumExpr(v);
  if (expr) return expr;
  return fallback;
}

function nonZeroLiteralVec(v) {
  const x = Number(v?.x);
  const y = Number(v?.y);
  const z = Number(v?.z);
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
    return (x * x + y * y + z * z) > 1e-12;
  }
  const ex = sanitizeKNumExpr(v?.x);
  const ey = sanitizeKNumExpr(v?.y);
  const ez = sanitizeKNumExpr(v?.z);
  return !!(ex || ey || ez);
}

function fmtHex(hex) {
  const s = String(hex ?? "#ffffff").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return "#ffffff";
}

function hexToRgb01(hex) {
  const normalized = fmtHex(hex).slice(1);
  const value = Number.parseInt(normalized, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function normalizeRootLifecycleMode(rawMode) {
  const modeRaw = String(rawMode || "interval").trim().toLowerCase();
  if (modeRaw === "once") return "once";
  if (modeRaw === "interval_n_tick" || modeRaw === "intervalntick") return "interval_n_tick";
  return "interval";
}

function normalizeRootLifecycle(raw) {
  const src = (raw && typeof raw === "object") ? raw : {};
  const mode = normalizeRootLifecycleMode(src.mode);

  const intervalNum = Number(src.intervalTick);
  const maxTickNum = Number(src.maxTick);
  const intervalTick = Number.isFinite(intervalNum)
    ? Math.max(1, Math.trunc(intervalNum))
    : 1;
  const maxTick = Number.isFinite(maxTickNum)
    ? Math.max(1, Math.trunc(maxTickNum))
    : 120;

  return { mode, intervalTick, maxTick };
}

function buildEmitterDataApplyLines(card) {
  const p = card?.particle || {};
  const colorEnd = p.colorOverLifeEnabled ? p.colorEnd : p.colorStart;
  const lines = [];

  // Keep field names aligned with UI defaults.
  lines.push(`lifeMin = ${fmtI(p.lifeMin)}`);
  lines.push(`lifeMax = ${fmtI(p.lifeMax)}`);
  lines.push(`sizeMin = ${fmtF(p.sizeMin)}`);
  lines.push(`sizeMax = ${fmtF(p.sizeMax)}`);
  lines.push(`countMin = ${fmtI(p.countMin)}`);
  lines.push(`countMax = ${fmtI(p.countMax)}`);

  const v = p.vel || {};
  lines.push(`vel = ${kSupplierVec3(v.x || 0, v.y || 0, v.z || 0)}`);
  lines.push(`velSpeedMin = ${fmtD(p.velSpeedMin ?? 0)}`);
  lines.push(`velSpeedMax = ${fmtD(p.velSpeedMax ?? 0)}`);
  lines.push(`visibleRange = ${fmtI(p.visibleRange)}`);
  lines.push(`colorStart = "${fmtHex(p.colorStart)}"`);
  lines.push(`colorEnd = "${fmtHex(colorEnd)}"`);
  return lines;
}

function buildEmitterLocationsBlock(card, dataName) {
  const e = card?.emitter || {};
  const t = String(e.type || "point");
  const off = e.offset || { x: 0, y: 0, z: 0 };
  const ox = Number(off.x) || 0;
  const oy = Number(off.y) || 0;
  const oz = Number(off.z) || 0;

  const lines = [];
  lines.push(`val locs = arrayListOf<RelativeLocation>()`);
  lines.push(`repeat(${dataName}.getRandomCount()) { i ->`);

  // Helpers are assumed to exist in outer scope of emitter lambda:
  // - randD(min,max)
  // - randI(min,max)
  // - lerp(a,b,t)
  // - rotateToAxis(x,y,z, ax,ay,az) => RelativeLocation

  if (t === "point") {
    lines.push(`  locs.add(RelativeLocation(${fmtD(ox)}, ${fmtD(oy)}, ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "box") {
    const box = e.box || {};
    const bx = Number(box.x) || 1;
    const by = Number(box.y) || 1;
    const bz = Number(box.z) || 1;
    const density = Math.min(1, Math.max(0, Number(box.density) || 0));
    const surface = !!box.surface;
    lines.push(`  val bx = ${fmtD(bx)}`);
    lines.push(`  val by = ${fmtD(by)}`);
    lines.push(`  val bz = ${fmtD(bz)}`);
    lines.push(`  val density = ${fmtD(density)}`);
    lines.push(`  val surface = ${surface ? "true" : "false"}`);
    lines.push(`  fun biased(u0: Double): Double {`);
    lines.push(`    if (density <= 0.0) return u0`);
    lines.push(`    val s = if (u0 < 0.0) -1.0 else 1.0`);
    lines.push(`    val a = abs(u0)`);
    lines.push(`    val pw = lerp(1.0, 4.0, density)`);
    lines.push(`    return s * a.pow(pw)`);
    lines.push(`  }`);
    lines.push(`  var x = biased(randD(-0.5, 0.5)) * bx`);
    lines.push(`  var y = biased(randD(-0.5, 0.5)) * by`);
    lines.push(`  var z = biased(randD(-0.5, 0.5)) * bz`);
    lines.push(`  if (surface) {`);
    lines.push(`    when (randI(0, 2)) {`);
    lines.push(`      0 -> x = (if (randD(0.0, 1.0) < 0.5) -0.5 else 0.5) * bx`);
    lines.push(`      1 -> y = (if (randD(0.0, 1.0) < 0.5) -0.5 else 0.5) * by`);
    lines.push(`      2 -> z = (if (randD(0.0, 1.0) < 0.5) -0.5 else 0.5) * bz`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  locs.add(RelativeLocation(x + ${fmtD(ox)}, y + ${fmtD(oy)}, z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "sphere") {
    const sph = e.sphere || {};
    const r = Math.max(0.001, Number(sph.r) || 1);
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val u = randD(0.0, 1.0)`);
    lines.push(`  val v = randD(0.0, 1.0)`);
    lines.push(`  val theta = 2.0 * PI * u`);
    lines.push(`  val phi = acos(2.0 * v - 1.0)`);
    lines.push(`  val dx = sin(phi) * cos(theta)`);
    lines.push(`  val dy = cos(phi)`);
    lines.push(`  val dz = sin(phi) * sin(theta)`);
    lines.push(`  val rr = r * cbrt(randD(0.0, 1.0))`);
    lines.push(`  locs.add(RelativeLocation(dx * rr + ${fmtD(ox)}, dy * rr + ${fmtD(oy)}, dz * rr + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "sphere_surface") {
    const sph = e.sphereSurface || {};
    const r = Math.max(0.001, Number(sph.r) || 1);
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val u = randD(0.0, 1.0)`);
    lines.push(`  val v = randD(0.0, 1.0)`);
    lines.push(`  val theta = 2.0 * PI * u`);
    lines.push(`  val phi = acos(2.0 * v - 1.0)`);
    lines.push(`  val dx = sin(phi) * cos(theta)`);
    lines.push(`  val dy = cos(phi)`);
    lines.push(`  val dz = sin(phi) * sin(theta)`);
    lines.push(`  locs.add(RelativeLocation(dx * r + ${fmtD(ox)}, dy * r + ${fmtD(oy)}, dz * r + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "line") {
    const l = e.line || {};
    const dir = l.dir || { x: 1, y: 0, z: 0 };
    const step = Math.max(0.0001, Number(l.step) || 0.25);
    lines.push(`  var dx = ${fmtD(dir.x || 1)}`);
    lines.push(`  var dy = ${fmtD(dir.y || 0)}`);
    lines.push(`  var dz = ${fmtD(dir.z || 0)}`);
    lines.push(`  val step = ${fmtD(step)}`);
    lines.push(`  val len = sqrt(dx*dx + dy*dy + dz*dz)`);
    lines.push(`  if (len < 1e-9) { dx = 1.0; dy = 0.0; dz = 0.0 } else { dx /= len; dy /= len; dz /= len }`);
    lines.push(`  val t = i.toDouble()`);
    lines.push(`  locs.add(RelativeLocation(dx * step * t + ${fmtD(ox)}, dy * step * t + ${fmtD(oy)}, dz * step * t + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "circle") {
    const c = e.circle || {};
    const r = Math.max(0.001, Number(c.r) || 1);
    const ax = c.axis || { x: 0, y: 1, z: 0 };
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val a = randD(0.0, 2.0 * PI)`);
    lines.push(`  val x = cos(a) * r`);
    lines.push(`  val z = sin(a) * r`);
    lines.push(`  val rot = rotateToAxis(x, 0.0, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "arc") {
    const a = e.arc || {};
    const r = Math.max(0.001, Number(a.r) || 1);
    const start = Number(a.start) || 0;
    const end = Number(a.end) || 0;
    const rotate = Number(a.rotate) || 0;
    const ax = a.axis || { x: 0, y: 1, z: 0 };
    // normalize for generation
    const s0 = Math.min(start, end);
    const s1 = Math.max(start, end);
    lines.push(`  val r = ${fmtD(r)}`);
    lines.push(`  val a0 = ${fmtD(s0)} * PI / 180.0`);
    lines.push(`  val a1 = ${fmtD(s1)} * PI / 180.0`);
    lines.push(`  val rotDeg = ${fmtD(rotate)} * PI / 180.0`);
    lines.push(`  val ang = randD(a0, a1) + rotDeg`);
    lines.push(`  val x = cos(ang) * r`);
    lines.push(`  val z = sin(ang) * r`);
    lines.push(`  val rot = rotateToAxis(x, 0.0, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "spiral") {
    const s = e.spiral || {};
    const startR = Math.max(0.001, Number(s.startR) || 0.6);
    const endR = Math.max(0.001, Number(s.endR) || 2.8);
    const height = Number(s.height) || 3;
    const rotateSpeed = Number(s.rotateSpeed) || 0.6;
    const rBias = Math.max(0.01, Number(s.rBias) || 1);
    const hBias = Math.max(0.01, Number(s.hBias) || 1);
    const ax = s.axis || { x: 0, y: 1, z: 0 };
    lines.push(`  val startR = ${fmtD(startR)}`);
    lines.push(`  val endR = ${fmtD(endR)}`);
    lines.push(`  val height = ${fmtD(height)}`);
    lines.push(`  val rotateSpeed = ${fmtD(rotateSpeed)}`);
    lines.push(`  val rBias = ${fmtD(rBias)}`);
    lines.push(`  val hBias = ${fmtD(hBias)}`);
    lines.push(`  val count = max(2, ${dataName}.getRandomCount())`);
    lines.push(`  val idx = i % count`);
    lines.push(`  val process = idx.toDouble() / max(1, count - 1).toDouble()`);
    lines.push(`  val rb = process.pow(rBias)`);
    lines.push(`  val hb = process.pow(hBias)`);
    lines.push(`  val rr = lerp(startR, endR, rb)`);
    lines.push(`  val ang = rotateSpeed * idx.toDouble()`);
    lines.push(`  val x = cos(ang) * rr`);
    lines.push(`  val y = hb * height`);
    lines.push(`  val z = sin(ang) * rr`);
    lines.push(`  val rot = rotateToAxis(x, y, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  if (t === "ring") {
    const r0 = e.ring || {};
    const rr = Math.max(0.001, Number(r0.r) || 1);
    const th = Math.max(0, Number(r0.thickness) || 0);
    const ax = r0.axis || { x: 0, y: 1, z: 0 };
    lines.push(`  val r = ${fmtD(rr)}`);
    lines.push(`  val th = ${fmtD(th)}`);
    lines.push(`  val a = randD(0.0, 2.0 * PI)`);
    lines.push(`  val rr2 = r + (randD(-0.5, 0.5) * th)`);
    lines.push(`  val x = cos(a) * rr2`);
    lines.push(`  val z = sin(a) * rr2`);
    lines.push(`  val rot = rotateToAxis(x, 0.0, z, ${fmtD(ax.x || 0)}, ${fmtD(ax.y ?? 1)}, ${fmtD(ax.z || 0)})`);
    lines.push(`  locs.add(RelativeLocation(rot.x + ${fmtD(ox)}, rot.y + ${fmtD(oy)}, rot.z + ${fmtD(oz)}))`);
    lines.push(`}`);
    return lines;
  }

  // fallback
  lines.push(`  locs.add(RelativeLocation(${fmtD(ox)}, ${fmtD(oy)}, ${fmtD(oz)}))`);
  lines.push(`}`);
  return lines;
}

export function genCommandKotlin(state, settings = {}) {
  const includeImportComments = settings.includeImportComments !== false;
  const legacyVarName = safeIdent(state?.kotlin?.varName, "command");
  const kRefName = safeIdent(state?.kotlin?.kRefName, "emitter");

  const uniqSigns = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const it of arr) {
      const n = Number(it);
      if (!Number.isFinite(n)) continue;
      const v = Math.trunc(n);
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  };

  const signPredicate = (signs) => {
    const s = uniqSigns(signs);
    if (!s.length) return "";
    if (s.length === 1) return `data.sign == ${fmtI(s[0])}`;
    return `data.sign in setOf(${s.map((x) => fmtI(x)).join(", ")})`;
  };

  const lifecycleColorRules = (() => {
    const out = [];
    const usedSigns = new Set();
    const emitters = Array.isArray(state?.emitters) ? state.emitters : [];
    for (const card of emitters) {
      if (!card || card.enabled === false) continue;
      const particle = card.particle || {};
      if (!particle.colorOverLifeEnabled) continue;
      const signNum = Number(card?.template?.sign);
      if (!Number.isFinite(signNum)) continue;
      const sign = Math.trunc(signNum);
      if (usedSigns.has(sign)) continue;
      usedSigns.add(sign);
      const start = hexToRgb01(particle.colorStart);
      const end = hexToRgb01(particle.colorEnd || particle.colorStart);
      out.push({ sign, start, end });
    }
    return out;
  })();

  const lifePredicate = (lifeFilter) => {
    const normalized = normalizeConditionFilter(lifeFilter, { allowReason: false });
    if (!normalized.enabled) return "";
    const expr = conditionFilterToKotlin(normalized, {
      age: "age",
      maxAge: "maxAge",
      life: "maxAge",
      sign: "data.sign",
      respawnCount: "0",
      tick: "0",
    }, {
      allowReason: false,
      numFmt: (v) => fmtNumLiteral(v, 0),
    });
    if (!expr) return "";
    return `run { val age = particle.currentAge; val maxAge = particle.lifetime; (${expr}) }`;
  };

  const queueSources = (() => {
    let rawQueues = [];
    if (Array.isArray(state?.commandQueues)) {
      rawQueues = state.commandQueues;
    } else if (state?.commandQueues && typeof state.commandQueues === "object") {
      rawQueues = Object.values(state.commandQueues).filter((it) => it && typeof it === "object");
    }
    if (rawQueues.length) {
      return rawQueues.map((q, idx) => ({
        id: String(q?.id ?? idx),
        name: String(q?.name || "").trim() || `command${idx + 1}`,
        signs: uniqSigns(q?.signs),
        commands: Array.isArray(q?.commands) ? q.commands : [],
      }));
    }
    return [{
      id: "legacy_queue",
      name: legacyVarName,
      signs: [],
      commands: Array.isArray(state?.commands) ? state.commands : [],
    }];
  })();

  const usedQueueVars = new Set();
  const queueInfos = queueSources.map((queue, idx) => {
    const base = safeIdent(queue.name, idx === 0 ? legacyVarName : `command${idx + 1}`);
    let varName = base || `command${idx + 1}`;
    let suffix = 2;
    while (usedQueueVars.has(varName)) {
      varName = `${base}_${suffix}`;
      suffix += 1;
    }
    usedQueueVars.add(varName);
    return {
      ...queue,
      varName,
      commands: queue.commands.filter((c) => !!c && c.enabled !== false),
    };
  });

  const lines = [];
  if (includeImportComments) {
    lines.push(`// file-level imports:`);
    lines.push(`// import cn.coostack.cooparticlesapi.network.particle.emitters.command.*`);
    lines.push(`// import cn.coostack.cooparticlesapi.network.particle.emitters.command.curve.*`);
    lines.push(`// import kotlin.math.*`);
    lines.push(`// import kotlin.random.Random`);
    lines.push("");
  }
  for (const queue of queueInfos) {
    lines.push(`val ${queue.varName} = ParticleCommandQueue()`);
    for (const c of queue.commands) {
      const meta = COMMAND_META[c.type];
      if (!meta || typeof meta.toKotlin !== "function") continue;
      const kotlin = meta.toKotlin(c, { kRefName });
      const predicates = [];
      const signPred = signPredicate(c.signs);
      const lifePred = lifePredicate(c.lifeFilter);
      if (signPred) predicates.push(`(${signPred})`);
      if (lifePred) predicates.push(`(${lifePred})`);
      const pred = predicates.join(" && ");
      let block = `.add(\n${indent(kotlin, 4)}\n)`;
      if (pred) {
        block += ` { data, particle ->\n${indent(pred, 4)}\n}`;
      }
      lines.push(indent(block, 4));
    }
    if (!queue.commands.length) {
      lines.push(`    // no enabled commands in this queue`);
    }
    lines.push("");
  }
  lines.push(`override fun singleParticleAction(`);
  lines.push(`    controler: ParticleControler,`);
  lines.push(`    data: ControlableParticleData,`);
  lines.push(`    spawnPos: RelativeLocation,`);
  lines.push(`    spawnWorld: Level,`);
  lines.push(`    particleLerpProgress: Float,`);
  lines.push(`    posLerpProgress: Float`);
  lines.push(`) {`);
  lines.push(`    controler.addPreTickAction {`);
  if (lifecycleColorRules.length) {
    lines.push(`        val colorLifeProgress = if (this.lifetime <= 0) 1f else (this.currentAge.toFloat() / this.lifetime.toFloat()).coerceIn(0f, 1f)`);
    lines.push(`        when (data.sign) {`);
    for (const rule of lifecycleColorRules) {
      lines.push(`            ${fmtI(rule.sign)} -> {`);
      lines.push(`                this.color = Vector3f(`);
      lines.push(`                    ${fmtF(rule.start.r)} + (${fmtF(rule.end.r)} - ${fmtF(rule.start.r)}) * colorLifeProgress,`);
      lines.push(`                    ${fmtF(rule.start.g)} + (${fmtF(rule.end.g)} - ${fmtF(rule.start.g)}) * colorLifeProgress,`);
      lines.push(`                    ${fmtF(rule.start.b)} + (${fmtF(rule.end.b)} - ${fmtF(rule.start.b)}) * colorLifeProgress`);
      lines.push(`                )`);
      lines.push(`            }`);
    }
    lines.push(`        }`);
  }
  if (!queueInfos.length) {
    lines.push(`        // no command queues`);
  } else {
    for (const queue of queueInfos) {
      const pred = signPredicate(queue.signs);
      if (!pred) {
        lines.push(`        ${queue.varName}.applyVelocity(data, this)`);
      } else {
        lines.push(`        if (${pred}) {`);
        lines.push(`            ${queue.varName}.applyVelocity(data, this)`);
        lines.push(`        }`);
      }
    }
  }
  lines.push(`    }`);
  lines.push(`}`);
  return lines.join("\n");
}

function genEmitterBodyKotlin(state, settings = {}) {
  const rawEmitters = Array.isArray(state?.emitters) ? state.emitters : [];
  const emitters = rawEmitters.filter(c => c && c.enabled !== false);

  // Kotlin variable naming:
  // - Per emitter card: vars.template / vars.data
  // - Empty -> auto templateN / dataN
  // - externalTemplate/externalData are lifted to class scope, then deduplicated
  const varCache = new Map();

  function baseVar(card, index, kind) {
    const raw = String(card?.vars?.[kind] ?? "").trim();
    const fallback = (kind === "template") ? `template${index + 1}` : `data${index + 1}`;
    return safeIdent(raw || fallback, fallback);
  }

  const extResolved = new Map(); // id -> { template, data }
  const extTemplateNames = new Set();

  for (let i = 0; i < emitters.length; i++) {
    const card = emitters[i];
    const t0 = baseVar(card, i, "template");
    if (card?.externalTemplate) extTemplateNames.add(t0);
  }

  const dataNameMap = new Map();
  function resolveDataName(name) {
    const raw = String(name || "").trim() || "v";
    if (dataNameMap.has(raw)) return dataNameMap.get(raw);
    let n = raw;
    if (extTemplateNames.has(n)) {
      let i = 2;
      while (extTemplateNames.has(n)) {
        n = `${raw}_${i}`;
        i += 1;
      }
    }
    dataNameMap.set(raw, n);
    return n;
  }

  for (let i = 0; i < emitters.length; i++) {
    const card = emitters[i];
    const id = String(card?.id ?? i);
    const t0 = baseVar(card, i, "template");
    const d0 = baseVar(card, i, "data");
    const r = { template: t0, data: d0 };
    if (card?.externalTemplate) r.template = t0;
    if (card?.externalData) r.data = resolveDataName(d0);
    extResolved.set(id, r);
  }

  function cardVar(card, index, kind) {
    const id = String(card?.id ?? index);
    const cacheKey = `${id}_${kind}`;
    if (varCache.has(cacheKey)) return varCache.get(cacheKey);

    let name = baseVar(card, index, kind);
    const r = extResolved.get(id);
    if (r) {
      if (kind === "template" && card?.externalTemplate) name = r.template;
      if (kind === "data" && card?.externalData) name = r.data;
    }
    varCache.set(cacheKey, name);
    return name;
  }

  const modeOf = (c) => String(c?.emission?.mode || "continuous");
  const rootLifecycle = normalizeRootLifecycle(state?.rootLifecycle);
  const anyBurst = emitters.some(c => modeOf(c) === "burst");

  const fmtRel = (x, y, z) => `RelativeLocation(${fmtD(x)}, ${fmtD(y)}, ${fmtD(z)})`;

  const hexToRgb01 = (hex) => {
    const h = fmtHex(hex);
    const r = parseInt(h.slice(1, 3), 16) / 255;
    const g = parseInt(h.slice(3, 5), 16) / 255;
    const b = parseInt(h.slice(5, 7), 16) / 255;
    return { r, g, b };
  };

  const isNonZeroVec = (v) => {
    return nonZeroLiteralVec(v);
  };
function buildBaseTemplateAssignLines(card) {
  const p = card?.particle || {};
  const t = card?.template || {};
  const v = p.vel || {};
  const vx = numOrExpr(v.x, 0);
  const vy = numOrExpr(v.y, 0);
  const vz = numOrExpr(v.z, 0);

  const lines = [];
  // Velocity initialization: fixed uses configured vector, expression mode starts from zero.
  const velMode = String(p.velMode || "fixed");
  if (velMode === "fixed") {
    lines.push(`velocity = ${kVec3(vx, vy, vz)}`);
  } else {
    lines.push(`velocity = Vec3.ZERO`);
  }
  lines.push(`visibleRange = ${fmtF(p.visibleRange ?? 128)}`);
  const { r, g, b } = hexToRgb01(p.colorStart);
  lines.push(`color = Vector3f(${fmtF(r)}, ${fmtF(g)}, ${fmtF(b)})`);

  // Template scalar fields.
  lines.push(`alpha = ${fmtF(t.alpha ?? 1.0)}`);
  lines.push(`light = ${fmtI(t.light ?? 15)}`);
  const face = (t.faceToCamera !== false);
  lines.push(`faceToCamera = ${face ? "true" : "false"}`);
  if (!face) {
    lines.push(`yaw = ${fmtF(t.yaw ?? 0.0)}`);
    lines.push(`pitch = ${fmtF(t.pitch ?? 0.0)}`);
    lines.push(`roll = ${fmtF(t.roll ?? 0.0)}`);
  }
  lines.push(`speedLimit = ${fmtD(t.speedLimit ?? 32.0)}`);
  lines.push(`sign = ${fmtI(t.sign ?? 0)}`);
  return lines;
}

function buildLocalDataApplyLines(card) {
  const p = card?.particle || {};
  const lines = [];
  // SimpleRandomParticleData mapping
  lines.push(`minAge = ${fmtI(p.lifeMin)}`);
  lines.push(`maxAge = ${fmtI(p.lifeMax)}`);
  lines.push(`minCount = ${fmtI(p.countMin)}`);
  lines.push(`maxCount = ${fmtI(p.countMax)}`);
  lines.push(`minSize = ${fmtD(p.sizeMin)}`);
  lines.push(`maxSize = ${fmtD(p.sizeMax)}`);
  lines.push(`minSpeed = ${fmtD(p.velSpeedMin ?? 0)}`);
  lines.push(`maxSpeed = ${fmtD(p.velSpeedMax ?? 0)}`);
  return lines;
}

  function pushPBChain(lines, baseIndent, card, dataVar) {
    const e = card?.emitter || {};
    const type = String(e.type || "point");

    const off = e.offset || { x: 0, y: 0, z: 0 };
    const ox = numOrExpr(off.x, 0);
    const oy = numOrExpr(off.y, 0);
    const oz = numOrExpr(off.z, 0);
    const hasOffset = nonZeroLiteralVec({ x: ox, y: oy, z: oz });
    const offsetStr = fmtRel(ox, oy, oz);

    const countExpr = `${dataVar}.getRandomCount()`;

    const pad = (n) => " ".repeat(n);

    lines.push(pad(baseIndent) + "PointsBuilder()");

    const chainIndent = baseIndent + 4;

    const addChainLine = (s) => lines.push(pad(chainIndent) + s);

    if (type === "points_builder") {
      const builderExprRaw = String(emitBuilderKotlinFromState(e.builderState) || "PointsBuilder()");
      const builderExprLines = builderExprRaw
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+$/g, ""))
        .filter((line) => line.trim().length > 0);
      const hasBuilderExpr = builderExprLines.length > 0;
      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + "val locs = arrayListOf<RelativeLocation>()");
      if (hasBuilderExpr) {
        lines.push(pad(chainIndent + 4) + "val source = (");
        builderExprLines.forEach((line) => {
          lines.push(pad(chainIndent + 8) + line);
        });
        lines.push(pad(chainIndent + 4) + ").createWithoutClone()");
      } else {
        lines.push(pad(chainIndent + 4) + "val source = emptyList<RelativeLocation>()");
      }
      lines.push(pad(chainIndent + 4) + `val count = (${countExpr}).coerceAtLeast(1)`);
      lines.push(pad(chainIndent + 4) + "if (source.isEmpty()) {");
      lines.push(pad(chainIndent + 8) + "repeat(count) {");
      lines.push(pad(chainIndent + 12) + `locs.add(RelativeLocation(${fmtD(ox)}, ${fmtD(oy)}, ${fmtD(oz)}))`);
      lines.push(pad(chainIndent + 8) + "}");
      lines.push(pad(chainIndent + 4) + "} else {");
      lines.push(pad(chainIndent + 8) + "val rand = Random.Default");
      lines.push(pad(chainIndent + 8) + "repeat(count) {");
      lines.push(pad(chainIndent + 12) + "val base = source[rand.nextInt(source.size)]");
      lines.push(pad(chainIndent + 12) + `locs.add(RelativeLocation(base.x + ${fmtD(ox)}, base.y + ${fmtD(oy)}, base.z + ${fmtD(oz)}))`);
      lines.push(pad(chainIndent + 8) + "}");
      lines.push(pad(chainIndent + 4) + "}");
      lines.push(pad(chainIndent + 4) + "locs");
      lines.push(pad(chainIndent) + "}");
      return;
    }

    if (type === "point") {
      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + `val locs = arrayListOf<RelativeLocation>()`);
      lines.push(pad(chainIndent + 4) + `val count = ${countExpr}`);
      lines.push(pad(chainIndent + 4) + `repeat(count) {`);
      lines.push(pad(chainIndent + 8) + `locs.add(${fmtRel(ox, oy, oz)})`);
      lines.push(pad(chainIndent + 4) + `}`);
      lines.push(pad(chainIndent + 4) + `locs`);
      lines.push(pad(chainIndent) + `}`);
      // point 瀹歌尙娲块幒銉ュ晸閸?offset閿涘奔绗夐崘宥櫢?pointsOnEach
    } else if (type === "line") {
      const l = e.line || {};
      const d = l.dir || { x: 0, y: 1, z: 0 };
      const dx = numOrExpr(d.x, 0);
      const dy = numOrExpr(d.y, 1);
      const dz = numOrExpr(d.z, 0);
      const step = numOrExpr(l.step, 0.2);
      addChainLine(`.addLine(${fmtRel(dx, dy, dz)}, ${fmtD(step)}, ${countExpr})`);
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "circle") {
      const c = e.circle || {};
      const r = numOrExpr(c.r, 1);
      addChainLine(`.addCircle(${fmtD(r)}, ${countExpr})`);

      const axis = c.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "ring") {
      const r0 = e.ring || {};
      const r = numOrExpr(r0.r, 1);
      const th = numOrExpr(r0.thickness, 0);
      addChainLine(`.addDiscreteCircleXZ(${fmtD(r)}, ${countExpr}, ${fmtD(th)})`);

      const axis = r0.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "arc") {
      const a = e.arc || {};
      const r = numOrExpr(a.r, 1);
      const s0 = numOrExpr(a.start, 0);
      const s1 = numOrExpr(a.end, 180);
      const rotate = numOrExpr(a.rotate, 0);
      const unit = String(e.arcUnit || a.unit || "deg");
      const toRad = (v) => (unit === "rad") ? fmtD(v) : `${fmtD(v)} * PI / 180.0`;
      const canOrder = Number.isFinite(Number(s0)) && Number.isFinite(Number(s1));
      const start = canOrder ? Math.min(Number(s0), Number(s1)) : s0;
      const end = canOrder ? Math.max(Number(s0), Number(s1)) : s1;

      if (a.center) {
        const canRotateNum = Number.isFinite(Number(rotate));
        if (canOrder && canRotateNum) {
          const extent = Math.abs(Number(end) - Number(start));
          const mid = ((Number(start) + Number(end)) / 2.0) + Number(rotate);
          addChainLine(
            `.addRadianCenter(${fmtD(r)}, ${countExpr}, ${toRad(extent)}, ${toRad(mid)})`
          );
        } else {
          const startRad = toRad(start);
          const endRad = toRad(end);
          const rotateRad = toRad(rotate);
          const extentExpr = `abs(${endRad} - ${startRad})`;
          const midExpr = `((${startRad} + ${endRad}) / 2.0) + (${rotateRad})`;
          addChainLine(
            `.addRadianCenter(${fmtD(r)}, ${countExpr}, ${extentExpr}, ${midExpr})`
          );
        }
      } else {
        addChainLine(
          `.addRadian(${fmtD(r)}, ${countExpr}, ${toRad(start)}, ${toRad(end)}, ${toRad(rotate)})`
        );
      }

      const axis = a.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "spiral") {
      const sp = e.spiral || {};
      const startR = numOrExpr(sp.startR, 0.5);
      const endR = numOrExpr(sp.endR, 1.5);
      const height = numOrExpr(sp.height, 2.0);
      const rotateSpeed = numOrExpr(sp.rotateSpeed, 0.4);
      const radiusBias = numOrExpr(sp.rBias ?? sp.radiusBias, 1.0);
      const heightBias = numOrExpr(sp.hBias ?? sp.heightBias, 1.0);

      addChainLine(
        `.addSpiral(${fmtD(startR)}, ${fmtD(endR)}, ${fmtD(height)}, (${countExpr}).coerceAtLeast(2), ${fmtD(rotateSpeed)}, ${fmtD(radiusBias)}, ${fmtD(heightBias)})`
      );

      const axis = sp.axis || { x: 0, y: 1, z: 0 };
      if (isNonZeroVec(axis)) {
        addChainLine(`.rotateTo(${fmtRel(axis.x, axis.y, axis.z)})`);
      }
      if (hasOffset) addChainLine(`.pointsOnEach { it.add(${offsetStr}) }`);
    } else if (type === "sphere" || type === "sphere_surface") {
      const sph = type === "sphere_surface" ? (e.sphereSurface || {}) : (e.sphere || {});
      const r = numOrExpr(sph.r, 1);

      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + `val rand = Random.Default`);
      lines.push(pad(chainIndent + 4) + `val locs = arrayListOf<RelativeLocation>()`);
      lines.push(pad(chainIndent + 4) + `val count = ${countExpr}`);
      lines.push(pad(chainIndent + 4) + `repeat(count) {`);
      lines.push(pad(chainIndent + 8) + `val u = rand.nextDouble()`);
      lines.push(pad(chainIndent + 8) + `val v = rand.nextDouble()`);
      lines.push(pad(chainIndent + 8) + `val theta = 2.0 * PI * u`);
      lines.push(pad(chainIndent + 8) + `val phi = acos(2.0 * v - 1.0)`);
      lines.push(pad(chainIndent + 8) + `val dx = sin(phi) * cos(theta)`);
      lines.push(pad(chainIndent + 8) + `val dy = cos(phi)`);
      lines.push(pad(chainIndent + 8) + `val dz = sin(phi) * sin(theta)`);
      if (type === "sphere") {
        lines.push(pad(chainIndent + 8) + `val rr = ${fmtD(r)} * cbrt(rand.nextDouble())`);
      } else {
        lines.push(pad(chainIndent + 8) + `val rr = ${fmtD(r)}`);
      }
      lines.push(pad(chainIndent + 8) + `locs.add(RelativeLocation(dx * rr + ${fmtD(ox)}, dy * rr + ${fmtD(oy)}, dz * rr + ${fmtD(oz)}))`);
      lines.push(pad(chainIndent + 4) + `}`);
      lines.push(pad(chainIndent + 4) + `locs`);
      lines.push(pad(chainIndent) + `}`);
      // sphere 瀹歌尙娲块幒銉ュ晸閸?offset閿涘奔绗夐崘宥櫢?pointsOnEach
    } else if (type === "box") {
      const b = e.box || {};
      const bx = numOrExpr(b.x, 2);
      const by = numOrExpr(b.y, 1);
      const bz = numOrExpr(b.z, 2);
      const density = numOrExpr(b.density, 0);
      const surface = !!b.surface;

      addChainLine(".addWith {");
      lines.push(pad(chainIndent + 4) + `val rand = Random.Default`);
      lines.push(pad(chainIndent + 4) + `val locs = arrayListOf<RelativeLocation>()`);
      lines.push(pad(chainIndent + 4) + `val count = ${countExpr}`);
      lines.push(pad(chainIndent + 4) + `val density = ${fmtD(density)}`);
      lines.push(pad(chainIndent + 4) + `val surface = ${surface ? "true" : "false"}`);
      lines.push(pad(chainIndent + 4) + `val pw = 1.0 + 3.0 * density`);
      lines.push(pad(chainIndent + 4) + `repeat(count) {`);
      lines.push(pad(chainIndent + 8) + `val u0x = rand.nextDouble() - 0.5`);
      lines.push(pad(chainIndent + 8) + `var x = (if (u0x < 0.0) -1.0 else 1.0) * pow(abs(u0x), pw) * ${fmtD(bx)}`);
      lines.push(pad(chainIndent + 8) + `val u0y = rand.nextDouble() - 0.5`);
      lines.push(pad(chainIndent + 8) + `var y = (if (u0y < 0.0) -1.0 else 1.0) * pow(abs(u0y), pw) * ${fmtD(by)}`);
      lines.push(pad(chainIndent + 8) + `val u0z = rand.nextDouble() - 0.5`);
      lines.push(pad(chainIndent + 8) + `var z = (if (u0z < 0.0) -1.0 else 1.0) * pow(abs(u0z), pw) * ${fmtD(bz)}`);
      lines.push(pad(chainIndent + 8) + `if (surface) {`);
      lines.push(pad(chainIndent + 12) + `when (rand.nextInt(3)) {`);
      lines.push(pad(chainIndent + 16) + `0 -> x = (if (rand.nextDouble() < 0.5) -0.5 else 0.5) * ${fmtD(bx)}`);
      lines.push(pad(chainIndent + 16) + `1 -> y = (if (rand.nextDouble() < 0.5) -0.5 else 0.5) * ${fmtD(by)}`);
      lines.push(pad(chainIndent + 16) + `2 -> z = (if (rand.nextDouble() < 0.5) -0.5 else 0.5) * ${fmtD(bz)}`);
      lines.push(pad(chainIndent + 12) + `}`);
      lines.push(pad(chainIndent + 8) + `}`);
      lines.push(pad(chainIndent + 8) + `locs.add(RelativeLocation(x + ${fmtD(ox)}, y + ${fmtD(oy)}, z + ${fmtD(oz)}))`);
      lines.push(pad(chainIndent + 4) + `}`);
      lines.push(pad(chainIndent + 4) + `locs`);
      lines.push(pad(chainIndent) + `}`);
    } else {
      // fallback
      addChainLine(`.addPoint(${fmtRel(ox, oy, oz)})`);
    }
  }

  const out = [];
  const push = (s = "") => out.push(s);

  // Deduplicate externalTemplate/externalData declarations at class scope.
  const declaredTemplate = new Set();
  const declaredData = new Set();
  emitters.forEach((card, i) => {
    const tVar = cardVar(card, i, "template");
    const dVar = cardVar(card, i, "data");

    if (card.externalTemplate && !declaredTemplate.has(tVar)) {
      push("@CodecField");
      push(`var ${tVar} = ControlableParticleData().apply {`);
      buildBaseTemplateAssignLines(card).forEach((line) => push(`    ${line}`));
      push("}");
      push("");
      declaredTemplate.add(tVar);
    }
    if (card.externalData && !declaredData.has(dVar)) {
      push("@CodecField");
      push(`var ${dVar} = SimpleRandomParticleData().apply {`);
      buildLocalDataApplyLines(card).forEach((line) => push(`    ${line}`));
      push("}");
      push("");
      declaredData.add(dVar);
    }
  });

  push("init {");
  if (rootLifecycle.mode === "once") {
    push("    delay = 1");
    push("    maxTick = 1");
  } else if (rootLifecycle.mode === "interval") {
    push(`    delay = ${fmtI(rootLifecycle.intervalTick)}`);
    push("    maxTick = -1");
  } else {
    push(`    delay = ${fmtI(rootLifecycle.intervalTick)}`);
    push(`    maxTick = ${fmtI(rootLifecycle.maxTick)}`);
  }
  push("}");
  push("");

  push("override fun genParticles(lerpProgress: Float): List<Pair<ControlableParticleData, RelativeLocation>> {");
  push("    val res = mutableListOf<Pair<ControlableParticleData, RelativeLocation>>()");
  push("");

  if (anyBurst) {
    push("    val tickSec = 0.05");
    push("");
  }

  emitters.forEach((card, i) => {
    const n = i + 1;
    const label = String(card.label || `Emitter ${n}`);
    const mode = modeOf(card);

    const tVar = cardVar(card, i, "template");
    const dVar = cardVar(card, i, "data");
    const velMode = String(card?.particle?.velMode || "fixed");
    const fixedVX = numOrExpr(card?.particle?.vel?.x, 0);
    const fixedVY = numOrExpr(card?.particle?.vel?.y, 0);
    const fixedVZ = numOrExpr(card?.particle?.vel?.z, 0);

    push(`    // 发射器 #${n}: ${label}`);

    let openLines = [];
    let closeLines = [];
    let innerIndent = 4;
    const pushWrap = (openLineRaw, closeLineRaw = "}") => {
      const pad = " ".repeat(innerIndent);
      openLines.push(`${pad}${openLineRaw}`);
      closeLines.unshift(`${pad}${closeLineRaw}`);
      innerIndent += 4;
    };

    const startTick = numOrExpr(card?.emission?.startTick, 0);
    const endTick = numOrExpr(card?.emission?.endTick, -1);
    const endNum = Number(endTick);
    let activeExpr = `tick >= ${fmtI(startTick)}`;
    if (!(Number.isFinite(endNum) && endNum < 0)) {
      activeExpr += ` && tick <= ${fmtI(endTick)}`;
    }
    pushWrap(`if (${activeExpr}) {`);

    if (mode === "once") {
      const startNum = Number(startTick);
      const onceExpr = Number.isFinite(startNum)
        ? String(Math.max(1, Math.trunc(startNum)))
        : `(${fmtI(startTick)}).coerceAtLeast(1)`;
      pushWrap(`if (tick == ${onceExpr}) {`);
    } else if (mode === "burst") {
      const interval = numOrExpr(card?.emission?.burstInterval, 0.5);
      const intervalVar = `intervalTicks${n}`;
      openLines.push(`${" ".repeat(innerIndent)}val ${intervalVar} = round(${fmtD(interval)} / tickSec).toInt().coerceAtLeast(1)`);
      pushWrap(`if ((tick - 1) % ${intervalVar} == 0) {`);
    }

    openLines.forEach(l => push(l));

    const pad = " ".repeat(innerIndent);
    const pad2 = " ".repeat(innerIndent + 4);

    // ÿʹö run 򣬱ֲͻ
    push(`${pad}run {`);

    // local data
    if (!card.externalData) {
      push(`${pad2}val ${dVar} = SimpleRandomParticleData().apply {`);
      buildLocalDataApplyLines(card).forEach(line => push(`${pad2}    ${line}`));
      push(`${pad2}}`);
      push("");
    }

    // local template
    if (!card.externalTemplate) {
      push(`${pad2}val ${tVar} = ControlableParticleData().apply {`);
      buildBaseTemplateAssignLines(card).forEach(line => push(`${pad2}    ${line}`));
      push(`${pad2}}`);
      push("");
    }

    const effectClass = String(card?.template?.effectClass || "ControlableEndRodEffect").trim();
    if (effectClass) {
      push(`${pad2}${tVar}.apply {`);
      push(`${pad2}    effect = ${safeIdent(effectClass, "ControlableEndRodEffect")}(uuid)`);
      push(`${pad2}}`);
      push("");
    }

    // res.addAll block
    push(`${pad2}res.addAll(`);

    const pbLines = [];
    // build PointsBuilder chain without indentation; we'll indent here
    pushPBChain(pbLines, innerIndent + 8, card, dVar);

    // append createWithoutClone + map
    const chainIndent = innerIndent + 12;
    const mapIndent = innerIndent + 12;
    pbLines.push(" ".repeat(chainIndent) + ".createWithoutClone()");
    pbLines.push(" ".repeat(mapIndent) + ".map { rel ->");
    pbLines.push(" ".repeat(mapIndent + 4) + `val speed = ${dVar}.getRandomSpeed()`);
    pbLines.push(" ".repeat(mapIndent + 4) + `${tVar}.clone().apply {`);
    pbLines.push(" ".repeat(mapIndent + 8) + `maxAge = ${dVar}.getRandomParticleMaxAge()`);
    pbLines.push(" ".repeat(mapIndent + 8) + `size = ${dVar}.getRandomSize()`);
    if (velMode === "spawn_rel") {
      pbLines.push(" ".repeat(mapIndent + 8) + `val dir = rel.toVector()`);
      pbLines.push(" ".repeat(mapIndent + 8) + `velocity = if (dir.lengthSqr() < 1e-8) Vec3.ZERO else dir.normalize().scale(speed)`);
    } else {
      pbLines.push(" ".repeat(mapIndent + 8) + `val baseDir = Vec3(${fmtD(fixedVX)}, ${fmtD(fixedVY)}, ${fmtD(fixedVZ)})`);
      pbLines.push(" ".repeat(mapIndent + 8) + `velocity = if (baseDir.lengthSqr() < 1e-8) Vec3.ZERO else baseDir.normalize().scale(speed)`);
    }
    pbLines.push(" ".repeat(mapIndent + 4) + `} to rel`);
    pbLines.push(" ".repeat(mapIndent) + `}`);

    pbLines.forEach(l => push(l));

    push(`${pad2})`);
    push("");

    push(`${pad}}`);
    push("");

    closeLines.forEach(l => push(l));
    if (closeLines.length) push("");
  });

  push("    return res");
  push("}");

  const behaviorText = genEmitterBehaviorKotlin(state?.emitterBehavior);
  if (behaviorText) {
    push("");
    push(behaviorText);
  }

  return out.join("\n");
}

export function genEmitterKotlin(state, settings = {}) {
  const className = safeIdent(state?.kotlin?.className, "GeneratedEmitter");
  const packageName = safePackageName(state?.kotlin?.packageName, "");
  const baseClass = safeIdent(state?.kotlin?.baseClass, "AutoParticleEmitters");
  const commandText = genCommandKotlin(state, { includeImportComments: false }).trim();
  const emitterBodyText = genEmitterBodyKotlin(state, settings).trim();
  const imports = [
    "import cn.coostack.cooparticlesapi.annotations.CodecField",
    "import cn.coostack.cooparticlesapi.annotations.CooAutoRegister",
    "import cn.coostack.cooparticlesapi.network.particle.emitters.*",
    "import cn.coostack.cooparticlesapi.network.particle.emitters.command.*",
    "import cn.coostack.cooparticlesapi.network.particle.emitters.command.curve.*",
    "import cn.coostack.cooparticlesapi.particles.CooParticleTextureSheet",
    "import cn.coostack.cooparticlesapi.particles.control.ParticleControler",
    "import cn.coostack.cooparticlesapi.particles.impl.*",
    "import cn.coostack.cooparticlesapi.utils.RelativeLocation",
    "import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder",
    "import net.minecraft.client.particle.ParticleRenderType",
    "import net.minecraft.world.level.Level",
    "import net.minecraft.world.phys.Vec3",
    "import org.joml.Vector3f",
    "import java.util.function.Supplier",
    "import kotlin.math.*",
    "import kotlin.random.Random",
  ];
  const lines = [];
  if (packageName) {
    lines.push(`package ${packageName}`);
    lines.push("");
  }
  lines.push(...imports);
  lines.push("");
  lines.push("@CooAutoRegister");
  lines.push(`class ${className}(pos: Vec3, world: Level?) : ${baseClass}(pos, world) {`);
  if (commandText) {
    lines.push(indentBlock(commandText, 4));
  }
  if (commandText && emitterBodyText) {
    lines.push("");
  }
  if (emitterBodyText) {
    lines.push(indentBlock(emitterBodyText, 4));
  }
  lines.push("}");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
