import {
    fmtD,
    fmtB,
    kVec3,
    kSupplierVec3,
    kTrailingLambda,
    chain,
    deepCopy,
} from "./utils.js";
import { createConditionFilter, normalizeConditionFilter } from "./expression_cards.js";
import { createFloatCurve, normalizeFloatCurve, curveToKotlin } from "./command_curve.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fmtIExpr(v, fallback = 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return String(Math.trunc(n));
    const raw = String(v ?? "").trim();
    if (!raw || !IDENT_RE.test(raw)) return String(Math.trunc(fallback));
    return `(${raw}).toInt()`;
}

function normalizeNumeric(value, fallback = 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const raw = String(value ?? "").trim();
    if (IDENT_RE.test(raw)) return raw;
    return fallback;
}

function normalizeFieldParam(field, rawValue) {
    if (!field) return rawValue;
    if (field.t === "bool") return !!rawValue;
    if (field.t === "text") return String(rawValue ?? "");
    if (field.t === "select") {
        const raw = String(rawValue ?? "").trim();
        const opts = Array.isArray(field.opts) ? field.opts.map((it) => String(it[0])) : [];
        return opts.includes(raw) ? raw : field.def;
    }
    if (field.t === "curve") {
        const defValue = Number(field?.def?.value);
        const fallback = Number.isFinite(defValue) ? defValue : 0;
        return normalizeFloatCurve(rawValue, fallback);
    }
    return normalizeNumeric(rawValue, field.def);
}

function makeVecSupplierLine(mode, expr, x, y, z, fallbackExpr) {
    if (mode === "expr") return kTrailingLambda(expr, fallbackExpr);
    const base = String(fallbackExpr ?? "").trim();
    if (!base) return `(${kSupplierVec3(x, y, z)})`;
    return kTrailingLambda(`${base}.add(${fmtD(x)}, ${fmtD(y)}, ${fmtD(z)})`, base);
}

export const COMMAND_META = {
    ParticleNoiseCommand: {
        title: "Noise 噪声扰动",
        fields: [
            { k: "strength", t: "number", step: 0.001, def: 0.03 },
            { k: "frequency", t: "number", step: 0.001, def: 0.15 },
            { k: "speed", t: "number", step: 0.001, def: 0.12 },
            { k: "affectY", t: "number", step: 0.01, def: 1.0 },
            { k: "clampSpeed", t: "number", step: 0.01, def: 0.8 },
            { k: "useLifeCurve", t: "bool", def: true },
        ],
        toKotlin: (c) => chain([
            `ParticleNoiseCommand()`,
            `.strength(${fmtD(c.params.strength)})`,
            `.frequency(${fmtD(c.params.frequency)})`,
            `.speed(${fmtD(c.params.speed)})`,
            `.affectY(${fmtD(c.params.affectY)})`,
            `.clampSpeed(${fmtD(c.params.clampSpeed)})`,
            `.useLifeCurve(${fmtB(c.params.useLifeCurve)})`,
        ]),
    },

    ParticleDragCommand: {
        title: "Drag 空气阻力",
        fields: [
            { k: "damping", t: "number", step: 0.01, def: 0.15 },
            { k: "minSpeed", t: "number", step: 0.001, def: 0.0 },
            { k: "linear", t: "number", step: 0.001, def: 0.0 },
        ],
        toKotlin: (c) => chain([
            `ParticleDragCommand()`,
            `.damping(${fmtD(c.params.damping)})`,
            `.minSpeed(${fmtD(c.params.minSpeed)})`,
            `.linear(${fmtD(c.params.linear)})`,
        ]),
    },

    ParticleFlowFieldCommand: {
        title: "FlowField 流场",
        fields: [
            { k: "amplitude", t: "number", step: 0.01, def: 0.15 },
            { k: "frequency", t: "number", step: 0.01, def: 0.25 },
            { k: "timeScale", t: "number", step: 0.01, def: 0.06 },
            { k: "phaseOffset", t: "number", step: 0.01, def: 0.0 },
            { k: "worldOffsetX", t: "number", step: 0.01, def: 0.0 },
            { k: "worldOffsetY", t: "number", step: 0.01, def: 0.0 },
            { k: "worldOffsetZ", t: "number", step: 0.01, def: 0.0 },
        ],
        toKotlin: (c) => chain([
            `ParticleFlowFieldCommand()`,
            `.amplitude(${fmtD(c.params.amplitude)})`,
            `.frequency(${fmtD(c.params.frequency)})`,
            `.timeScale(${fmtD(c.params.timeScale)})`,
            `.phaseOffset(${fmtD(c.params.phaseOffset)})`,
            `.worldOffset(${kVec3(c.params.worldOffsetX, c.params.worldOffsetY, c.params.worldOffsetZ)})`,
        ]),
    },

    ParticleAttractionCommand: {
        title: "Attraction 吸引/排斥",
        fields: [
            { k: "targetMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]] },
            { k: "targetX", t: "number", step: 0.01, def: 0.0 },
            { k: "targetY", t: "number", step: 0.01, def: 0.0 },
            { k: "targetZ", t: "number", step: 0.01, def: 0.0 },
            { k: "targetExpr", t: "text", def: "this.pos" },
            { k: "strength", t: "number", step: 0.01, def: 0.8 },
            { k: "range", t: "number", step: 0.01, def: 8.0 },
            { k: "falloffPower", t: "number", step: 0.01, def: 2.0 },
            { k: "minDistance", t: "number", step: 0.01, def: 0.25 },
        ],
        toKotlin: (c) => {
            const p = c.params;
            const targetLine = (p.targetMode === "expr")
                ? `.target${makeVecSupplierLine("expr", p.targetExpr, 0, 0, 0, "this.pos")}`
                : `.target${makeVecSupplierLine("const", "", p.targetX, p.targetY, p.targetZ, "this.pos")}`;
            return chain([
                `ParticleAttractionCommand()`,
                targetLine,
                `.strength(${fmtD(p.strength)})`,
                `.range(${fmtD(p.range)})`,
                `.falloffPower(${fmtD(p.falloffPower)})`,
                `.minDistance(${fmtD(p.minDistance)})`,
            ]);
        },
    },

    ParticleOrbitCommand: {
        title: "Orbit 轨道",
        fields: [
            { k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]] },
            { k: "centerX", t: "number", step: 0.01, def: 0.0 },
            { k: "centerY", t: "number", step: 0.01, def: 0.0 },
            { k: "centerZ", t: "number", step: 0.01, def: 0.0 },
            { k: "centerExpr", t: "text", def: "this.pos" },
            { k: "axisX", t: "number", step: 0.01, def: 0.0 },
            { k: "axisY", t: "number", step: 0.01, def: 1.0 },
            { k: "axisZ", t: "number", step: 0.01, def: 0.0 },
            { k: "radius", t: "number", step: 0.01, def: 3.0 },
            { k: "angularSpeed", t: "number", step: 0.01, def: 0.35 },
            { k: "radialCorrect", t: "number", step: 0.01, def: 0.25 },
            { k: "minDistance", t: "number", step: 0.01, def: 0.2 },
            { k: "mode", t: "select", def: "PHYSICAL", opts: [["PHYSICAL", "PHYSICAL"], ["SPRING", "SPRING"], ["SNAP", "SNAP"]] },
            { k: "maxRadialStep", t: "number", step: 0.01, def: 0.5 },
        ],
        toKotlin: (c) => {
            const p = c.params;
            const centerLine = (p.centerMode === "expr")
                ? `.center${makeVecSupplierLine("expr", p.centerExpr, 0, 0, 0, "this.pos")}`
                : `.center${makeVecSupplierLine("const", "", p.centerX, p.centerY, p.centerZ, "this.pos")}`;
            return chain([
                `ParticleOrbitCommand()`,
                centerLine,
                `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                `.radius(${fmtD(p.radius)})`,
                `.angularSpeed(${fmtD(p.angularSpeed)})`,
                `.radialCorrect(${fmtD(p.radialCorrect)})`,
                `.minDistance(${fmtD(p.minDistance)})`,
                `.mode(OrbitMode.${p.mode})`,
                `.maxRadialStep(${fmtD(p.maxRadialStep)})`,
            ]);
        },
    },

    ParticleVortexCommand: {
        title: "Vortex 漩涡（吸入 center）",
        fields: [
            { k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]] },
            { k: "centerX", t: "number", step: 0.01, def: 0.0 },
            { k: "centerY", t: "number", step: 0.01, def: 0.0 },
            { k: "centerZ", t: "number", step: 0.01, def: 0.0 },
            { k: "centerExpr", t: "text", def: "this.pos" },
            { k: "axisX", t: "number", step: 0.01, def: 0.0 },
            { k: "axisY", t: "number", step: 0.01, def: 1.0 },
            { k: "axisZ", t: "number", step: 0.01, def: 0.0 },
            { k: "swirlStrength", t: "number", step: 0.01, def: 0.8 },
            { k: "radialPull", t: "number", step: 0.01, def: 0.35 },
            { k: "axialLift", t: "number", step: 0.01, def: 0.0 },
            { k: "range", t: "number", step: 0.01, def: 10.0 },
            { k: "falloffPower", t: "number", step: 0.01, def: 2.0 },
            { k: "minDistance", t: "number", step: 0.01, def: 0.2 },
        ],
        toKotlin: (c) => {
            const p = c.params;
            const centerLine = (p.centerMode === "expr")
                ? `.center${makeVecSupplierLine("expr", p.centerExpr, 0, 0, 0, "this.pos")}`
                : `.center${makeVecSupplierLine("const", "", p.centerX, p.centerY, p.centerZ, "this.pos")}`;
            return chain([
                `ParticleVortexCommand()`,
                centerLine,
                `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                `.swirlStrength(${fmtD(p.swirlStrength)})`,
                `.radialPull(${fmtD(p.radialPull)})`,
                `.axialLift(${fmtD(p.axialLift)})`,
                `.range(${fmtD(p.range)})`,
                `.falloffPower(${fmtD(p.falloffPower)})`,
                `.minDistance(${fmtD(p.minDistance)})`,
            ]);
        },
    },

    ParticleToroidalCirculationCommand: {
        title: "ToroidalCirculation 环面回流",
        desc: "在一圈局部区域里制造翻卷回流，优先扭转当前速度方向，适合蘑菇云帽檐/烟团边缘。",
        notice: "它修改粒子速度，不修改 billboard 朝向；翻卷会跟当前速度一起变化，所以减速后卷动也会自然变慢。",
        fields: [
            { k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]] },
            { k: "centerX", t: "number", step: 0.01, def: 0.0 },
            { k: "centerY", t: "number", step: 0.01, def: 0.0 },
            { k: "centerZ", t: "number", step: 0.01, def: 0.0 },
            { k: "centerExpr", t: "text", def: "this.pos" },
            { k: "axisX", t: "number", step: 0.01, def: 0.0 },
            { k: "axisY", t: "number", step: 0.01, def: 1.0 },
            { k: "axisZ", t: "number", step: 0.01, def: 0.0 },
            { k: "ringRadius", t: "number", step: 0.01, def: 3.0 },
            { k: "radialThickness", t: "number", step: 0.01, def: 1.2 },
            { k: "axialThickness", t: "number", step: 0.01, def: 0.8 },
            { k: "circulationStrength", t: "number", step: 0.01, def: 0.35 },
            { k: "outwardStrength", t: "number", step: 0.01, def: 0.0 },
            { k: "upwardStrength", t: "number", step: 0.01, def: 0.0 },
            { k: "followStrength", t: "number", step: 0.01, def: 0.12 },
            { k: "maxStep", t: "number", step: 0.01, def: 0.6 },
            { k: "useLifeCurve", t: "bool", def: false },
        ],
        toKotlin: (c) => {
            const p = c.params;
            const centerLine = (p.centerMode === "expr")
                ? `.center${makeVecSupplierLine("expr", p.centerExpr, 0, 0, 0, "this.pos")}`
                : `.center${makeVecSupplierLine("const", "", p.centerX, p.centerY, p.centerZ, "this.pos")}`;
            return chain([
                `ParticleToroidalCirculationCommand()`,
                centerLine,
                `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                `.ringRadius(${fmtD(p.ringRadius)})`,
                `.radialThickness(${fmtD(p.radialThickness)})`,
                `.axialThickness(${fmtD(p.axialThickness)})`,
                `.circulationStrength(${fmtD(p.circulationStrength)})`,
                `.outwardStrength(${fmtD(p.outwardStrength)})`,
                `.upwardStrength(${fmtD(p.upwardStrength)})`,
                `.followStrength(${fmtD(p.followStrength)})`,
                `.maxStep(${fmtD(p.maxStep)})`,
                `.useLifeCurve(${fmtB(p.useLifeCurve)})`,
            ]);
        },
    },

    ParticleRotationForceCommand: {
        title: "RotationForce 切向旋转力",
        fields: [
            { k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]] },
            { k: "centerX", t: "number", step: 0.01, def: 0.0 },
            { k: "centerY", t: "number", step: 0.01, def: 0.0 },
            { k: "centerZ", t: "number", step: 0.01, def: 0.0 },
            { k: "centerExpr", t: "text", def: "this.pos" },
            { k: "axisX", t: "number", step: 0.01, def: 0.0 },
            { k: "axisY", t: "number", step: 0.01, def: 1.0 },
            { k: "axisZ", t: "number", step: 0.01, def: 0.0 },
            { k: "strength", t: "number", step: 0.01, def: 0.35 },
            { k: "range", t: "number", step: 0.01, def: 8.0 },
            { k: "falloffPower", t: "number", step: 0.01, def: 2.0 },
        ],
        toKotlin: (c) => {
            const p = c.params;
            const centerLine = (p.centerMode === "expr")
                ? `.center${makeVecSupplierLine("expr", p.centerExpr, 0, 0, 0, "this.pos")}`
                : `.center${makeVecSupplierLine("const", "", p.centerX, p.centerY, p.centerZ, "this.pos")}`;
            return chain([
                `ParticleRotationForceCommand()`,
                centerLine,
                `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                `.strength(${fmtD(p.strength)})`,
                `.range(${fmtD(p.range)})`,
                `.falloffPower(${fmtD(p.falloffPower)})`,
            ]);
        },
    },

    ParticleDistortionCommand: {
        title: "Distortion 扭曲环",
        fields: [
            { k: "centerMode", t: "select", def: "const", opts: [["const", "常量 Vec3"], ["expr", "Kotlin 表达式"]] },
            { k: "centerX", t: "number", step: 0.01, def: 0.0 },
            { k: "centerY", t: "number", step: 0.01, def: 0.0 },
            { k: "centerZ", t: "number", step: 0.01, def: 0.0 },
            { k: "centerExpr", t: "text", def: "Vec3.ZERO" },
            { k: "axisX", t: "number", step: 0.01, def: 0.0 },
            { k: "axisY", t: "number", step: 0.01, def: 1.0 },
            { k: "axisZ", t: "number", step: 0.01, def: 0.0 },
            { k: "radius", t: "number", step: 0.01, def: 3.0 },
            { k: "radialStrength", t: "number", step: 0.01, def: 0.35 },
            { k: "axialStrength", t: "number", step: 0.01, def: 0.25 },
            { k: "tangentialStrength", t: "number", step: 0.01, def: 0.0 },
            { k: "frequency", t: "number", step: 0.01, def: 0.25 },
            { k: "timeScale", t: "number", step: 0.01, def: 0.1 },
            { k: "phaseOffset", t: "number", step: 0.01, def: 0.0 },
            { k: "followStrength", t: "number", step: 0.01, def: 0.35 },
            { k: "maxStep", t: "number", step: 0.01, def: 0.6 },
            { k: "baseAxial", t: "number", step: 0.01, def: 0.0 },
            { k: "seedOffset", t: "number", step: 1, def: 0 },
            { k: "useLifeCurve", t: "bool", def: false },
        ],
        toKotlin: (c) => {
            const p = c.params;
            const centerLine = (p.centerMode === "expr")
                ? `.center${makeVecSupplierLine("expr", p.centerExpr, 0, 0, 0, "Vec3.ZERO")}`
                : `.center${makeVecSupplierLine("const", "", p.centerX, p.centerY, p.centerZ, "Vec3.ZERO")}`;
            return chain([
                `ParticleDistortionCommand()`,
                centerLine,
                `.axis(${kVec3(p.axisX, p.axisY, p.axisZ)})`,
                `.radius(${fmtD(p.radius)})`,
                `.radialStrength(${fmtD(p.radialStrength)})`,
                `.axialStrength(${fmtD(p.axialStrength)})`,
                `.tangentialStrength(${fmtD(p.tangentialStrength)})`,
                `.frequency(${fmtD(p.frequency)})`,
                `.timeScale(${fmtD(p.timeScale)})`,
                `.phaseOffset(${fmtD(p.phaseOffset)})`,
                `.followStrength(${fmtD(p.followStrength)})`,
                `.maxStep(${fmtD(p.maxStep)})`,
                `.baseAxial(${fmtD(p.baseAxial)})`,
                `.seedOffset(${fmtIExpr(p.seedOffset, 0)})`,
                `.useLifeCurve(${fmtB(p.useLifeCurve)})`,
            ]);
        },
    },

    ParticleGravityCommand: {
        title: "Gravity 重力(物理)",
        notice: "历史 bug：若只 `data.velocity.add(...)` 不回写会失效，必须回写 `data.velocity = ...`。",
        fields: [{ k: "emitterRef", t: "text", def: "" }],
        toKotlin: (c, ctx) => {
            const ref = (c.params.emitterRef && c.params.emitterRef.trim().length)
                ? c.params.emitterRef.trim()
                : ctx.kRefName;
            return `ParticleGravityCommand(${ref})`;
        },
    },

    ParticleLifetimeMotionCommand: {
        title: "LifetimeMotion 生命周期运动",
        notice: "X=生命周期进度(0~1)，Y=数值。force 曲线每 tick 叠加到速度；velocity 曲线按 velocityMode 直接作用在速度上。",
        fields: [
            { k: "forceX", t: "curve", def: createFloatCurve("constant", 0.0) },
            { k: "forceY", t: "curve", def: createFloatCurve("constant", 0.0) },
            { k: "forceZ", t: "curve", def: createFloatCurve("constant", 0.0) },
            { k: "velocityX", t: "curve", def: createFloatCurve("constant", 0.0) },
            { k: "velocityY", t: "curve", def: createFloatCurve("constant", 0.0) },
            { k: "velocityZ", t: "curve", def: createFloatCurve("constant", 0.0) },
            { k: "forceSpace", t: "select", def: "WORLD", opts: [["WORLD", "WORLD"], ["LOCAL", "LOCAL"]] },
            { k: "velocitySpace", t: "select", def: "WORLD", opts: [["WORLD", "WORLD"], ["LOCAL", "LOCAL"]] },
            { k: "velocityMode", t: "select", def: "ADD", opts: [["ADD", "ADD"], ["OVERRIDE", "OVERRIDE"], ["MULTIPLY", "MULTIPLY"]] },
            { k: "randomizePerParticle", t: "bool", def: false },
            { k: "randomScaleMin", t: "number", step: 0.01, def: 1.0 },
            { k: "randomScaleMax", t: "number", step: 0.01, def: 1.0 },
            { k: "randomSeedOffset", t: "number", step: 1, def: 0 },
            { k: "maxVelocityDeltaPerTick", t: "number", step: 0.01, def: 0.0 },
        ],
        toKotlin: (c) => {
            const p = c.params;
            return chain([
                `ParticleLifetimeMotionCommand()`,
                `.forceCurves(${curveToKotlin(p.forceX, 0.0)}, ${curveToKotlin(p.forceY, 0.0)}, ${curveToKotlin(p.forceZ, 0.0)})`,
                `.velocityCurves(${curveToKotlin(p.velocityX, 0.0)}, ${curveToKotlin(p.velocityY, 0.0)}, ${curveToKotlin(p.velocityZ, 0.0)})`,
                `.forceSpace(ParticleMotionSpace.${p.forceSpace})`,
                `.velocitySpace(ParticleMotionSpace.${p.velocitySpace})`,
                `.velocityMode(ParticleLifetimeVelocityMode.${p.velocityMode})`,
                `.randomizePerParticle(${fmtB(p.randomizePerParticle)})`,
                `.randomScale(${fmtD(p.randomScaleMin)}, ${fmtD(p.randomScaleMax)})`,
                `.randomSeedOffset(${fmtIExpr(p.randomSeedOffset, 0)})`,
                `.maxVelocityDeltaPerTick(${fmtD(p.maxVelocityDeltaPerTick)})`,
            ]);
        },
    },

    ParticleInheritVelocityCommand: {
        title: "InheritVelocity 继承速度",
        notice: "默认 source = `Supplier { emitter.emitterVelocity }`；若目标项目无该字段，请切自定义 source 或先计算 emitterVelocity。",
        fields: [
            { k: "sourceMode", t: "select", def: "emitter_velocity", opts: [["emitter_velocity", "默认 emitterVelocity"], ["custom", "自定义表达式"]] },
            { k: "sourceExpr", t: "text", def: "emitter.emitterVelocity" },
            { k: "mode", t: "select", def: "INITIAL", opts: [["INITIAL", "INITIAL"], ["CURRENT", "CURRENT"]] },
            { k: "multiplier", t: "number", step: 0.01, def: 1.0 },
            { k: "axisMaskX", t: "number", step: 0.01, def: 1.0 },
            { k: "axisMaskY", t: "number", step: 0.01, def: 1.0 },
            { k: "axisMaskZ", t: "number", step: 0.01, def: 1.0 },
            { k: "overLifetime", t: "curve", def: createFloatCurve("constant", 1.0) },
            { k: "damping", t: "number", step: 0.01, def: 0.0 },
            { k: "maxContributionSpeed", t: "number", step: 0.01, def: 0.0 },
            { k: "space", t: "select", def: "WORLD", opts: [["WORLD", "WORLD"], ["LOCAL", "LOCAL"]] },
            { k: "randomizePerParticle", t: "bool", def: false },
            { k: "randomScaleMin", t: "number", step: 0.01, def: 1.0 },
            { k: "randomScaleMax", t: "number", step: 0.01, def: 1.0 },
            { k: "randomSeedOffset", t: "number", step: 1, def: 0 },
        ],
        toKotlin: (c, ctx) => {
            const p = c.params;
            const fallbackSource = `${ctx.kRefName}.emitterVelocity`;
            const rawExpr = String(p.sourceExpr ?? "").trim();
            let sourceExpr = (p.sourceMode === "custom") ? (rawExpr || fallbackSource) : fallbackSource;
            if (sourceExpr === "emitter.emitterVelocity") sourceExpr = fallbackSource;
            return chain([
                `ParticleInheritVelocityCommand()`,
                `.source(Supplier { ${sourceExpr} })`,
                `.mode(ParticleInheritMode.${p.mode})`,
                `.multiplier(${fmtD(p.multiplier)})`,
                `.axisMask(${kVec3(p.axisMaskX, p.axisMaskY, p.axisMaskZ)})`,
                `.overLifetime(${curveToKotlin(p.overLifetime, 1.0)})`,
                `.damping(${fmtD(p.damping)})`,
                `.maxContributionSpeed(${fmtD(p.maxContributionSpeed)})`,
                `.space(ParticleMotionSpace.${p.space})`,
                `.randomizePerParticle(${fmtB(p.randomizePerParticle)})`,
                `.randomScale(${fmtD(p.randomScaleMin)}, ${fmtD(p.randomScaleMax)})`,
                `.randomSeedOffset(${fmtIExpr(p.randomSeedOffset, 0)})`,
            ]);
        },
    },
};

const COMMAND_TIPS = {
    ParticleNoiseCommand: { strength: "噪声强度", frequency: "空间频率", speed: "时间滚动速度", affectY: "Y 轴影响", clampSpeed: "限速", useLifeCurve: "是否生命周期调制" },
    ParticleDragCommand: { damping: "阻尼强度", minSpeed: "最小速度阈值", linear: "额外线性阻力" },
    ParticleFlowFieldCommand: { amplitude: "振幅", frequency: "空间频率", timeScale: "时间缩放", phaseOffset: "相位偏移", worldOffsetX: "世界偏移X", worldOffsetY: "世界偏移Y", worldOffsetZ: "世界偏移Z" },
    ParticleToroidalCirculationCommand: {
        centerExpr: "环流中心表达式；做蘑菇云时一般填帽子中心。",
        ringRadius: "翻卷带主半径，也就是帽檐离中心的距离。",
        radialThickness: "环面径向厚度，决定翻卷带的宽度。",
        axialThickness: "环面轴向厚度，决定翻卷带上下厚度。",
        circulationStrength: "翻卷转向力度，负数表示反向翻卷。",
        outwardStrength: "向外撑开的附加偏转；仅在翻卷带内生效。",
        upwardStrength: "沿主轴向上抬升的附加偏转；仅在翻卷带内生效。",
        followStrength: "带外回带/导向力度；更像把速度导回卷动区，而不是持续硬拉。",
        maxStep: "单 tick 最大速度修正量；<=0 表示不限制。",
        useLifeCurve: "按生命周期逐渐减弱。",
    },
    ParticleGravityCommand: { emitterRef: "ClassParticleEmitters 引用名" },
    ParticleInheritVelocityCommand: {
        sourceExpr: "默认建议：emitter.emitterVelocity；可改成自定义 source 表达式",
        overLifetime: "生命周期乘子曲线：X=进度(0~1), Y=倍率",
    },
    ParticleLifetimeMotionCommand: {
        forceX: "每 tick 叠加到速度的 X 向加速度曲线",
        forceY: "每 tick 叠加到速度的 Y 向加速度曲线",
        forceZ: "每 tick 叠加到速度的 Z 向加速度曲线",
        velocityX: "速度曲线 X 分量（按 velocityMode 作用）",
        velocityY: "速度曲线 Y 分量（按 velocityMode 作用）",
        velocityZ: "速度曲线 Z 分量（按 velocityMode 作用）",
        forceSpace: "force 曲线使用 WORLD 还是 LOCAL 坐标",
        velocitySpace: "velocity 曲线使用 WORLD 还是 LOCAL 坐标",
        velocityMode: "ADD=叠加，OVERRIDE=覆盖，MULTIPLY=按分量乘",
        randomizePerParticle: "开启后每个粒子独立随机缩放曲线强度",
        randomScaleMin: "随机缩放最小值",
        randomScaleMax: "随机缩放最大值",
        randomSeedOffset: "随机种子偏移，用于切换随机序列",
        maxVelocityDeltaPerTick: "每 tick 最大速度改变量限制（0=不限制）",
    },
};

for (const [type, tips] of Object.entries(COMMAND_TIPS)) {
    const meta = COMMAND_META[type];
    if (!meta || !Array.isArray(meta.fields)) continue;
    for (const field of meta.fields) {
        if (field.tip) continue;
        const tip = tips ? tips[field.k] : "";
        if (tip) field.tip = tip;
    }
}

function buildDefaultParams(type) {
    const meta = COMMAND_META[type];
    const params = {};
    for (const field of meta.fields) {
        params[field.k] = normalizeFieldParam(field, deepCopy(field.def));
    }
    return params;
}

export function newCommand(type) {
    if (!COMMAND_META[type]) throw new Error(`Unknown command type: ${type}`);
    return {
        id: cryptoRandomId(),
        type,
        enabled: true,
        params: buildDefaultParams(type),
        signs: [],
        lifeFilter: createConditionFilter(),
        ui: { collapsed: false },
    };
}

export function cryptoRandomId() {
    const a = new Uint32Array(4);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a).map((x) => x.toString(16)).join("");
}

const FIELD_CN = {
    sourceMode: "source模式",
    sourceExpr: "source表达式",
    overLifetime: "生命周期曲线",
    forceX: "ForceX 曲线",
    forceY: "ForceY 曲线",
    forceZ: "ForceZ 曲线",
    velocityX: "VelocityX 曲线",
    velocityY: "VelocityY 曲线",
    velocityZ: "VelocityZ 曲线",
};

export function humanFieldName(k) {
    const cn = FIELD_CN[k];
    return cn ? `${k} (${cn})` : k;
}

export function cloneDefaultCommands() {
    return [
        newCommand("ParticleNoiseCommand"),
        newCommand("ParticleDragCommand"),
    ];
}

function normalizeCommandParams(type, rawParams) {
    const meta = COMMAND_META[type];
    const out = buildDefaultParams(type);
    const params = (rawParams && typeof rawParams === "object") ? rawParams : {};
    for (const field of meta.fields) {
        const next = Object.prototype.hasOwnProperty.call(params, field.k) ? params[field.k] : out[field.k];
        out[field.k] = normalizeFieldParam(field, next);
    }
    return out;
}

export function normalizeCommand(raw) {
    if (!raw || typeof raw !== "object") return null;
    const type = raw.type;
    if (!type || !COMMAND_META[type]) return null;
    const base = newCommand(type);
    if (typeof raw.id === "string" && raw.id.trim().length) base.id = raw.id.trim();
    if (typeof raw.enabled === "boolean") base.enabled = raw.enabled;
    base.params = normalizeCommandParams(type, raw.params);
    if (raw.ui && typeof raw.ui === "object") {
        base.ui = Object.assign({}, base.ui, deepCopy(raw.ui));
    }

    const rawSigns = raw.signs ?? raw.effectSigns ?? raw.applySigns;
    if (Array.isArray(rawSigns)) {
        const out = [];
        const seen = new Set();
        for (const it of rawSigns) {
            const n = Number(it);
            if (!Number.isFinite(n)) continue;
            const v = Math.trunc(n);
            if (seen.has(v)) continue;
            seen.add(v);
            out.push(v);
        }
        base.signs = out;
    }

    const lf = raw.lifeFilter && typeof raw.lifeFilter === "object" ? raw.lifeFilter : {};
    const legacyExpr = String(raw.lifeExpr ?? raw.ageExpr ?? "");
    const legacyEnabled = (raw.lifeFilterEnabled ?? raw.ageFilterEnabled);
    const enabled = (legacyEnabled !== undefined) ? !!legacyEnabled : !!lf.enabled;
    base.lifeFilter = normalizeConditionFilter({
        enabled,
        rules: lf.rules,
        expr: String(lf.expr ?? legacyExpr),
    }, { allowReason: false });
    return base;
}




