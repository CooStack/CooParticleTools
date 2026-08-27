import { deepCopy, fmtD, safeNum } from "./utils.js";
import {
	conditionFilterToKotlin,
	createConditionFilter,
	createVarAction,
	normalizeConditionFilter,
	normalizeVarActionList,
	varActionToKotlin,
} from "./expression_cards.js";
import {
	normalizeDoTickExpression,
	translateDoTickJsToKotlin,
} from "./do_tick_expression.js";

export const EMITTER_BEHAVIOR_STORAGE_KEY = "pe_emitter_behavior_v1";

const ID_SEED = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 12);

function isIdent(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || "").trim());
}

function makeDefaultDeathBehavior() {
    return {
        enabled: false,
        mode: "dissipate", // dissipate | respawn
        condition: createConditionFilter({}, { allowReason: true }),
        respawnCount: 1,
        offset: { x: 0, y: 0, z: 0 },
        sizeMul: 1.0,
        speedMul: 1.0,
        signMode: "keep", // keep | set
        signValue: 0,
        maxAgeEnabled: false,
        maxAgeValueType: "number", // number | var | age | maxAge | respawnCount
        maxAgeValue: 1,
        varActions: [],
    };
}

const DEFAULT_BEHAVIOR = {
	emitterVars: [],
	tickExpression: "",
	tickActions: [],
	death: makeDefaultDeathBehavior(),
};

export const EMITTER_VAR_TYPES = [
    "Int",
    "Long",
    "Float",
    "Double",
    "Boolean",
    "String",
    "Vec3",
    "RelativeLocation",
    "Vector3f",
];

const NUMERIC_EMITTER_VAR_TYPES = new Set(["Int", "Long", "Float", "Double"]);
const VECTOR_EMITTER_VAR_TYPES = new Set(["Vec3", "RelativeLocation", "Vector3f"]);

export function isNumericEmitterVarType(type) {
    return NUMERIC_EMITTER_VAR_TYPES.has(String(type || "").trim());
}

function isVectorEmitterVarType(type) {
    return VECTOR_EMITTER_VAR_TYPES.has(String(type || "").trim());
}

export function normalizeEmitterVarType(rawType) {
    const raw = String(rawType || "").trim();
    const lowered = raw.toLowerCase();
    if (lowered === "int") return "Int";
    if (lowered === "long") return "Long";
    if (lowered === "float") return "Float";
    if (lowered === "double") return "Double";
    if (lowered === "boolean" || lowered === "bool") return "Boolean";
    if (lowered === "string") return "String";
    if (lowered === "vec3") return "Vec3";
    if (lowered === "relativelocation") return "RelativeLocation";
    if (lowered === "vector3f") return "Vector3f";
    return EMITTER_VAR_TYPES.includes(raw) ? raw : "Double";
}

function defaultValueForEmitterVarType(type) {
    const t = normalizeEmitterVarType(type);
    if (t === "Int") return 0;
    if (t === "Long") return 0;
    if (t === "Float") return 0;
    if (t === "Double") return 0;
    if (t === "Boolean") return false;
    if (t === "String") return "";
    if (t === "Vec3") return "Vec3(0.0, 0.0, 0.0)";
    if (t === "RelativeLocation") return "RelativeLocation(0.0, 0.0, 0.0)";
    if (t === "Vector3f") return "Vector3f(0.0f, 0.0f, 0.0f)";
    return 0;
}

export function createEmitterVar() {
    return {
        id: ID_SEED(),
        name: "",
        type: "Double",
        defaultValue: 0,
        minEnabled: false,
        minValue: 0,
        maxEnabled: false,
        maxValue: 0,
    };
}

export function createTickAction() {
    const out = createVarAction();
    out.condition = createConditionFilter({}, { allowReason: false });
    return out;
}

export function createDeathVarAction() {
    return createVarAction();
}

export function isValidEmitterVarName(name) {
    const s = String(name ?? "").trim();
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

function sanitizeEmitterVar(v) {
    const type = normalizeEmitterVarType(v?.type);
    const out = {
        id: String(v?.id || ID_SEED()),
        name: String(v?.name || "").trim(),
        type,
        defaultValue: defaultValueForEmitterVarType(type),
        minEnabled: !!v?.minEnabled,
        minValue: 0,
        maxEnabled: !!v?.maxEnabled,
        maxValue: 0,
    };
    if (isNumericEmitterVarType(type)) {
        const n = Number(v?.defaultValue);
        if (Number.isFinite(n)) out.defaultValue = n;
        const nMin = Number(v?.minValue);
        const nMax = Number(v?.maxValue);
        if (Number.isFinite(nMin)) out.minValue = nMin;
        if (Number.isFinite(nMax)) out.maxValue = nMax;
        if (type === "Int" || type === "Long") {
            out.defaultValue = Math.trunc(Number(out.defaultValue) || 0);
            out.minValue = Math.trunc(Number(out.minValue) || 0);
            out.maxValue = Math.trunc(Number(out.maxValue) || 0);
        }
        if (out.minEnabled && out.maxEnabled && out.minValue > out.maxValue) {
            const t = out.minValue;
            out.minValue = out.maxValue;
            out.maxValue = t;
        }
    } else {
        out.minEnabled = false;
        out.maxEnabled = false;
        out.minValue = 0;
        out.maxValue = 0;
        if (type === "Boolean") {
            if (typeof v?.defaultValue === "boolean") {
                out.defaultValue = v.defaultValue;
            } else {
                const s = String(v?.defaultValue ?? "").trim().toLowerCase();
                out.defaultValue = (s === "true");
            }
        } else if (type === "String") {
            out.defaultValue = String(v?.defaultValue ?? "");
        } else if (isVectorEmitterVarType(type)) {
            const rawValue = String(v?.defaultValue ?? "").trim();
            out.defaultValue = rawValue || String(defaultValueForEmitterVarType(type));
        } else {
            out.defaultValue = defaultValueForEmitterVarType(type);
        }
    }
    return out;
}

function normalizeNumOrVar(value, fallback, opts = {}) {
    const raw = String(value ?? "").trim();
    if (raw && !Number.isFinite(Number(raw))) {
        if (isIdent(raw)) return raw;
        return fallback;
    }
    let out = safeNum(raw === "" ? fallback : raw, fallback);
    if (opts.int) out = Math.trunc(out);
    if (typeof opts.min === "number") out = Math.max(opts.min, out);
    if (typeof opts.max === "number") out = Math.min(opts.max, out);
    return out;
}

function normalizeMaxAgeType(rawType) {
    const raw = String(rawType || "").trim();
    const t = (raw === "life") ? "maxAge" : raw;
    if (t === "var" || t === "age" || t === "maxAge" || t === "respawnCount") return t;
    return "number";
}

function normalizeMaxAgeValue(rawType, rawValue) {
    const t = normalizeMaxAgeType(rawType);
    if (t === "number") return normalizeNumOrVar(rawValue, 1, { int: true, min: 1 });
    if (t === "var") return isIdent(rawValue) ? String(rawValue).trim() : "";
    return 0;
}

function parseLegacyMaxAgeExpr(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const n = Number(s);
    if (Number.isFinite(n)) {
        return { enabled: true, type: "number", value: Math.max(1, Math.trunc(n)) };
    }
    if (isIdent(s)) {
        if (s === "age" || s === "maxAge" || s === "life" || s === "respawnCount") {
            return { enabled: true, type: s === "life" ? "maxAge" : s, value: 0 };
        }
        return { enabled: true, type: "var", value: s };
    }
    return null;
}

function sanitizeDeath(raw) {
    const out = makeDefaultDeathBehavior();
    if (raw && typeof raw === "object") {
        out.enabled = !!raw.enabled;
        out.mode = raw.mode === "respawn" ? "respawn" : "dissipate";

        const condRaw = (raw.condition && typeof raw.condition === "object")
            ? raw.condition
            : {
                enabled: !!String(raw.condition || "").trim(),
                expr: String(raw.condition || ""),
            };
        out.condition = normalizeConditionFilter(condRaw, { allowReason: true });

        out.respawnCount = normalizeNumOrVar(raw.respawnCount, 1, { int: true, min: 0 });
        out.offset = {
            x: normalizeNumOrVar(raw.offset?.x, 0),
            y: normalizeNumOrVar(raw.offset?.y, 0),
            z: normalizeNumOrVar(raw.offset?.z, 0),
        };
        out.sizeMul = normalizeNumOrVar(raw.sizeMul, 1.0);
        out.speedMul = normalizeNumOrVar(raw.speedMul, 1.0);
        out.signMode = raw.signMode === "set" ? "set" : "keep";
        out.signValue = normalizeNumOrVar(raw.signValue, 0, { int: true });

        out.maxAgeEnabled = !!raw.maxAgeEnabled;
        out.maxAgeValueType = normalizeMaxAgeType(raw.maxAgeValueType);
        out.maxAgeValue = normalizeMaxAgeValue(out.maxAgeValueType, raw.maxAgeValue);

        const legacyMaxAge = parseLegacyMaxAgeExpr(raw.maxAgeExpr);
        if (legacyMaxAge && !out.maxAgeEnabled) {
            out.maxAgeEnabled = true;
            out.maxAgeValueType = legacyMaxAge.type;
            out.maxAgeValue = legacyMaxAge.value;
        }

        const list = Array.isArray(raw.varActions) ? raw.varActions : [];
        out.varActions = normalizeVarActionList(list);
    }
    return out;
}

function sanitizeTickAction(raw) {
    const base = createVarAction(raw && typeof raw === "object" ? raw : {});
    if (base.op !== "inc" && base.op !== "dec") {
        if (base.valueType !== "number" && base.valueType !== "var" && base.valueType !== "tick") {
            base.valueType = "number";
            base.value = 0;
        }
    }
    const src = (raw && typeof raw === "object") ? raw : {};
    const condRaw = (src.condition && typeof src.condition === "object")
        ? src.condition
        : {
            enabled: !!String(src.condition || "").trim(),
            expr: String(src.condition || ""),
        };
    base.condition = normalizeConditionFilter(condRaw, { allowReason: false });
    return base;
}

export function normalizeEmitterBehavior(raw) {
	const out = deepCopy(DEFAULT_BEHAVIOR);
	out.death = makeDefaultDeathBehavior();
	if (!raw || typeof raw !== "object") return out;

	const vars = Array.isArray(raw.emitterVars) ? raw.emitterVars : [];
	out.emitterVars = vars.map(sanitizeEmitterVar);

	const exprRaw = (raw.tickExpression !== undefined && raw.tickExpression !== null)
		? raw.tickExpression
		: (raw.doTickExpression !== undefined && raw.doTickExpression !== null)
			? raw.doTickExpression
			: (raw.tickScript !== undefined && raw.tickScript !== null)
				? raw.tickScript
				: "";
	out.tickExpression = normalizeDoTickExpression(exprRaw);

	const ticks = Array.isArray(raw.tickActions) ? raw.tickActions : [];
	out.tickActions = ticks.map((it) => sanitizeTickAction(it));

	out.death = sanitizeDeath(raw.death);
    return out;
}

export function loadEmitterBehavior() {
    try {
        const raw = localStorage.getItem(EMITTER_BEHAVIOR_STORAGE_KEY);
        if (!raw) return normalizeEmitterBehavior(null);
        const parsed = JSON.parse(raw);
        return normalizeEmitterBehavior(parsed);
    } catch (_) {
        return normalizeEmitterBehavior(null);
    }
}

export function saveEmitterBehavior(cfg) {
    try {
        const normalized = normalizeEmitterBehavior(cfg);
        localStorage.setItem(EMITTER_BEHAVIOR_STORAGE_KEY, JSON.stringify(normalized));
    } catch (_) {
    }
}

function sanitizeDefaultForType(v, type) {
    const t = normalizeEmitterVarType(type);
    const raw = String(v ?? "").trim();
    const n = Number(raw === "" ? v : raw);
    if (t === "Int") {
        if (!Number.isFinite(n)) return "0";
        return String(Math.trunc(n));
    }
    if (t === "Long") {
        if (!Number.isFinite(n)) return "0L";
        return `${Math.trunc(n)}L`;
    }
    if (t === "Float") {
        if (!Number.isFinite(n)) return "0.0f";
        return `${fmtD(n)}f`;
    }
    if (t === "Double") {
        if (!Number.isFinite(n)) return "0.0";
        return fmtD(n);
    }
    if (t === "Boolean") {
        if (typeof v === "boolean") return v ? "true" : "false";
        if (/^true$/i.test(raw)) return "true";
        if (/^false$/i.test(raw)) return "false";
        return "false";
    }
    if (t === "String") {
        if (/^\"[\s\S]*\"$/.test(raw)) return raw;
        const txt = String(v ?? "");
        const escaped = txt
            .replace(/\\/g, "\\\\")
            .replace(/"/g, "\\\"")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");
        return `"${escaped}"`;
    }
    if (isVectorEmitterVarType(t)) {
        if (raw) return raw;
        return String(defaultValueForEmitterVarType(t));
    }
    return "0.0";
}

function sanitizeBoundForType(v, type) {
    if (!isNumericEmitterVarType(type)) return "0.0";
    const t = normalizeEmitterVarType(type);
    const n = Number(v);
    if (!Number.isFinite(n)) {
        if (t === "Int") return "0";
        if (t === "Long") return "0L";
        if (t === "Float") return "0.0f";
        return "0.0";
    }
    if (t === "Int") return String(Math.trunc(n));
    if (t === "Long") return `${Math.trunc(n)}L`;
    if (t === "Float") return `${fmtD(n)}f`;
    return fmtD(n);
}

function fmtIntOrVar(v, fallback = 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return String(Math.trunc(n));
    const s = String(v || "").trim();
    if (isIdent(s)) return `${s}.toInt()`;
    return String(Math.trunc(fallback));
}

function fmtNumOrVar(v, fallback = 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return fmtD(n);
    const s = String(v || "").trim();
    if (isIdent(s)) return `${s}.toDouble()`;
    return fmtD(fallback);
}

function fmtKNumLiteral(v, fallback = 0) {
    const n = Number(v);
    if (Number.isFinite(n)) {
        if (Math.trunc(n) === n) return String(Math.trunc(n));
        return fmtD(n);
    }
    const nf = Number(fallback);
    if (Number.isFinite(nf)) {
        if (Math.trunc(nf) === nf) return String(Math.trunc(nf));
        return fmtD(nf);
    }
    return "0";
}

function maxAgeValueToKotlin(type, value) {
    const t = normalizeMaxAgeType(type);
    if (t === "number") return fmtNumOrVar(value, 1);
    if (t === "var") {
        const s = String(value || "").trim();
        return isIdent(s) ? s : "1";
    }
    if (t === "age" || t === "maxAge" || t === "respawnCount") return t;
    return "1";
}

function genEmitterVarsKotlin(vars) {
    const lines = [];
    for (const v of vars) {
        if (!isValidEmitterVarName(v.name)) continue;
        const type = normalizeEmitterVarType(v.type);
        const def = sanitizeDefaultForType(v.defaultValue, type);
        lines.push("@CodecField");
        lines.push(`var ${v.name}: ${type} = ${def}`);
        lines.push("");
    }
    return lines;
}

function genVarBoundsApplyFn(vars) {
    const lines = [];
    const valid = vars.filter((v) => isValidEmitterVarName(v.name));
    const clamps = [];
    for (const v of valid) {
        if (!isNumericEmitterVarType(v.type)) continue;
        if (!v.minEnabled && !v.maxEnabled) continue;
        if (v.minEnabled && v.maxEnabled) {
            const lo = sanitizeBoundForType(v.minValue, v.type);
            const hi = sanitizeBoundForType(v.maxValue, v.type);
            clamps.push(`    ${v.name} = ${v.name}.coerceIn(${lo}, ${hi})`);
            continue;
        }
        if (v.minEnabled) {
            const lo = sanitizeBoundForType(v.minValue, v.type);
            clamps.push(`    if (${v.name} < ${lo}) ${v.name} = ${lo}`);
            continue;
        }
        const hi = sanitizeBoundForType(v.maxValue, v.type);
        clamps.push(`    if (${v.name} > ${hi}) ${v.name} = ${hi}`);
    }
    if (!clamps.length) {
        return { lines: [], hasBounds: false };
    }
    lines.push("private fun applyEmitterVarBounds() {");
    lines.push(...clamps);
    lines.push("}");
    lines.push("");
    return { lines, hasBounds: true };
}

function genDoTickKotlin(tickExpression, tickActions, hasBounds) {
	const lines = [];
	lines.push("override fun doTick() {");
	const expr = normalizeDoTickExpression(tickExpression);
	if (expr) {
		lines.push(translateDoTickJsToKotlin(expr, "    "));
		if (hasBounds) lines.push("    applyEmitterVarBounds()");
		lines.push("}");
		return lines;
	}

	let stmtCount = 0;
	const actions = Array.isArray(tickActions) ? tickActions : [];
	for (const action of actions) {
		const stmt = varActionToKotlin(action, { tick: "tick" }, {
			numFmt: (v) => fmtKNumLiteral(v, 0),
        });
        if (!stmt) continue;
        const condExpr = conditionFilterToKotlin(action.condition, {
            tick: "tick",
            age: "0",
            maxAge: "0",
            life: "0",
            sign: "0",
            respawnCount: "0",
        }, {
            allowReason: false,
            numFmt: (v) => fmtKNumLiteral(v, 0),
        });
        if (condExpr) {
            lines.push(`    if (${condExpr}) {`);
            lines.push(`        ${stmt}`);
            lines.push("    }");
        } else {
            lines.push(`    ${stmt}`);
        }
        stmtCount += 1;
    }
    if (!stmtCount) {
        lines.push("    // modify emitter variables here");
    }
    if (hasBounds && stmtCount > 0) {
        lines.push("    applyEmitterVarBounds()");
    }
    lines.push("}");
    return lines;
}

function genDeathActionKotlin(death, hasBounds) {
    const lines = [];
    if (!death.enabled) {
        return lines;
    }

    lines.push("override fun singleParticleDeathAction(");
    lines.push("    oldControler: ParticleControler,");
    lines.push("    oldData: ControlableParticleData,");
    lines.push("    respawnCount: Int,");
    lines.push("    reason: RemoveReason");
    lines.push("): List<Pair<ControlableParticleData, RelativeLocation>> {");

    lines.push("    val age = oldControler.currentAge");
    lines.push("    val maxAge = oldControler.lifetime");

    const condExpr = conditionFilterToKotlin(death.condition, {
        age: "age",
        maxAge: "maxAge",
        life: "maxAge",
        sign: "oldData.sign",
        respawnCount: "respawnCount",
        reason: "reason",
    }, {
        allowReason: true,
        numFmt: (v) => fmtKNumLiteral(v, 0),
    });
    if (condExpr) {
        lines.push(`    if (!(${condExpr})) return listOf()`);
    }

    const varActions = Array.isArray(death.varActions) ? death.varActions : [];
    for (const action of varActions) {
        const stmt = varActionToKotlin(action, {
            age: "age",
            maxAge: "maxAge",
            life: "maxAge",
            sign: "oldData.sign",
            respawnCount: "respawnCount",
        }, {
            numFmt: (v) => fmtKNumLiteral(v, 0),
        });
        if (!stmt) continue;
        lines.push(`    ${stmt}`);
    }
    if (hasBounds && varActions.length > 0) {
        lines.push("    applyEmitterVarBounds()");
    }

    if (death.mode === "dissipate") {
        lines.push("    return listOf()");
        lines.push("}");
        return lines;
    }

    const respawnExpr = fmtIntOrVar(death.respawnCount, 0);
    lines.push("    val res = mutableListOf<Pair<ControlableParticleData, RelativeLocation>>()");
    lines.push(`    repeat(maxOf(0, ${respawnExpr})) {`);
    lines.push("        val data = oldData.clone().apply {");
    lines.push(`            size = (size * ${fmtNumOrVar(death.sizeMul, 1.0)}).toFloat()`);
    lines.push(`            velocity = velocity.scale(${fmtNumOrVar(death.speedMul, 1.0)})`);
    if (death.signMode === "set") {
        lines.push(`            sign = ${fmtIntOrVar(death.signValue, 0)}`);
    }
    if (death.maxAgeEnabled) {
        const maxAgeExpr = maxAgeValueToKotlin(death.maxAgeValueType, death.maxAgeValue);
        lines.push(`            maxAge = (${maxAgeExpr}).toInt().coerceAtLeast(1)`);
    }
    lines.push("        }");
    lines.push(`        res.add(data to RelativeLocation(${fmtNumOrVar(death.offset.x, 0)}, ${fmtNumOrVar(death.offset.y, 0)}, ${fmtNumOrVar(death.offset.z, 0)}))`);
    lines.push("    }");
    lines.push("    return res");
    lines.push("}");
    return lines;
}

export function genEmitterBehaviorKotlin(rawCfg) {
    const cfg = normalizeEmitterBehavior(rawCfg);
    const lines = [];

    lines.push(...genEmitterVarsKotlin(cfg.emitterVars));
    const boundsInfo = genVarBoundsApplyFn(cfg.emitterVars);
    lines.push(...boundsInfo.lines);
	lines.push(...genDoTickKotlin(cfg.tickExpression, cfg.tickActions, boundsInfo.hasBounds));
    const deathLines = genDeathActionKotlin(cfg.death, boundsInfo.hasBounds);
    if (deathLines.length) {
        lines.push("");
        lines.push(...deathLines);
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function getDefaultEmitterBehavior() {
    return normalizeEmitterBehavior(DEFAULT_BEHAVIOR);
}
