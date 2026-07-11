export function installKotlinCodegenMethods(CompositionBuilderApp, deps = {}) {
    const {
        U,
        num,
        int,
        normalizeAnimate,
        normalizeControllerAction,
        normalizeDisplayAction,
        normalizeAlphaHelperConfig,
        normalizeScaleHelperConfig,
        sanitizeKotlinClassName,
        sanitizeKotlinIdentifier,
        defaultLiteralForKotlinType,
        rewriteClassQualifier,
        rewriteControllerStatusQualifier,
        normalizeKotlinFloatLiteralText,
        isPlainNumericLiteralText,
        normalizeKotlinDoubleLiteralText,
        formatKotlinDoubleLiteral,
        relExpr,
        indentText,
        normalizeAngleOffsetEaseName,
        normalizeAngleOffsetEaseSpecialParams,
        normalizeAngleUnit,
        translateJsBlockToKotlin,
        normalizeParticleFloatAssignmentExpr,
        DEFAULT_EFFECT_CLASS
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installKotlinCodegenMethods requires CompositionBuilderApp");
    }

    class KotlinCodegenMixin {
    generateKotlin() {
        const className = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const packageName = this.normalizeGeneratedPackageName(this.state.packageName || "cn.coostack.compositions");
        const sequencedRoot = this.state.compositionType === "sequenced";
        const baseClass = sequencedRoot ? "AutoSequencedParticleComposition" : "AutoParticleComposition";
        const imports = [
            "import cn.coostack.cooparticlesapi.annotations.CodecField",
            "import cn.coostack.cooparticlesapi.annotations.CooAutoRegister",
            "import cn.coostack.cooparticlesapi.animation.timeline.*",
            "import cn.coostack.cooparticlesapi.extend.asRelative",
            "import cn.coostack.cooparticlesapi.network.particle.composition.*",
            "import cn.coostack.cooparticlesapi.particles.ParticleDisplayer",
            "import cn.coostack.cooparticlesapi.particles.impl.*",
            "import cn.coostack.cooparticlesapi.utils.RelativeLocation",
            "import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder",
            "import net.minecraft.world.level.Level",
            "import net.minecraft.world.phys.Vec3",
            "import kotlin.math.PI",
            "import kotlin.random.Random",
            "import java.util.SortedMap",
            "import java.util.TreeMap",
            "import org.joml.Vector3f"
        ];
        if (this.stateUsesLinearScaleHelper()) {
            imports.push("import cn.coostack.cooparticlesapi.utils.helper.impl.composition.CompositionScaleHelper");
        }
        if (this.stateUsesBezierScaleHelper()) {
            imports.push("import cn.coostack.cooparticlesapi.utils.helper.impl.composition.CompositionBezierScaleHelper");
        }
        if (this.stateUsesAlphaHelper()) {
            imports.push("import cn.coostack.cooparticlesapi.utils.helper.impl.composition.CompositionAlphaHelper");
        }
        if (this.stateUsesFourierSeriesBuilder()) {
            imports.push("import cn.coostack.cooparticlesapi.utils.builder.FourierSeriesBuilder");
        }
        if (this.stateUsesTextureSheetParticleRenderType()) {
            imports.push("import net.minecraft.client.particle.ParticleRenderType");
        }
        if (this.stateUsesTextureSheetCooTextureSheet()) {
            imports.push("import cn.coostack.cooparticlesapi.particles.CooParticleTextureSheet");
        }
        const importList = Array.from(new Set(imports));

        const body = [];
        body.push("@CooAutoRegister");
        body.push(`class ${className}(position: Vec3, world: Level? = null) : ${baseClass}(position, world) {`);
        const fields = this.buildClassFields(className);
        if (fields) body.push(fields);
        const initBlock = this.buildInitBlock(className, sequencedRoot);
        if (initBlock) body.push(initBlock);
        body.push(this.buildParticlesMethod(className, sequencedRoot));
        const removeMethod = this.buildRemoveMethod();
        if (removeMethod) body.push(removeMethod);
        body.push(this.buildOnDisplayMethod(className));
        body.push("}");

        const head = packageName ? [`package ${packageName}`, ""] : [];
        return [...head, ...importList, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n");
    }

    normalizeGeneratedPackageName(raw = "") {
        let text = String(raw || "").trim();
        if (!text) text = "cn.coostack.compositions";
        text = text.replace(/^package\s+/i, "").replace(/;+\s*$/g, "").trim();
        return text || "cn.coostack.compositions";
    }

    iterateParticleInitEntries(visitor) {
        if (typeof visitor !== "function") return;
        const walkNodes = (nodes, card) => {
            for (const node of (Array.isArray(nodes) ? nodes : [])) {
                for (const item of (Array.isArray(node?.particleInit) ? node.particleInit : [])) {
                    visitor(item, card, node);
                }
                if (Array.isArray(node?.children) && node.children.length) {
                    walkNodes(node.children, card);
                }
            }
        };
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            for (const item of (Array.isArray(card?.particleInit) ? card.particleInit : [])) {
                visitor(item, card, null);
            }
            walkNodes(card?.shapeChildren || [], card);
        }
    }

    builderStateUsesKind(builderState, kindName = "") {
        const expected = String(kindName || "").trim();
        if (!expected) return false;
        const walk = (node) => {
            if (!node || typeof node !== "object") return false;
            if (String(node.kind || "").trim() === expected) return true;
            if (Array.isArray(node.children) && node.children.some((child) => walk(child))) return true;
            if (Array.isArray(node.terms) && node.terms.some((child) => walk(child))) return true;
            return false;
        };
        const roots = Array.isArray(builderState?.root?.children)
            ? builderState.root.children
            : (Array.isArray(builderState?.children) ? builderState.children : []);
        return roots.some((node) => walk(node));
    }

    stateUsesFourierSeriesBuilder() {
        const cardUsesFourier = (card) => this.builderStateUsesKind(card?.builderState, "add_fourier_series");
        const nodeUsesFourier = (nodes) => {
            for (const node of (Array.isArray(nodes) ? nodes : [])) {
                if (this.builderStateUsesKind(node?.builderState, "add_fourier_series")) return true;
                if (Array.isArray(node?.children) && nodeUsesFourier(node.children)) return true;
            }
            return false;
        };
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            if (cardUsesFourier(card)) return true;
            if (nodeUsesFourier(card?.shapeChildren || [])) return true;
        }
        return false;
    }

    stateUsesBezierScaleHelper() {
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        return String(projectScale?.type || "none") === "bezier";
    }

    stateUsesLinearScaleHelper() {
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        return String(projectScale?.type || "none") === "linear";
    }

    stateUsesAlphaHelper() {
        const projectAlpha = normalizeAlphaHelperConfig(this.state.projectAlpha, { type: "none" });
        return String(projectAlpha?.type || "none") !== "none";
    }

    stateUsesTextureSheetLiteral(pattern) {
        let found = false;
        const matcher = pattern instanceof RegExp ? pattern : null;
        this.iterateParticleInitEntries((item) => {
            if (found) return;
            const target = String(item?.target || "").trim().toLowerCase();
            if (target !== "texturesheet") return;
            const source = String(item?.codegenExpr || item?.codegenExprPreset || item?.expr || "").trim();
            if (!source || !matcher) return;
            found = matcher.test(source);
        });
        return found;
    }

    stateUsesTextureSheetParticleRenderType() {
        return this.stateUsesTextureSheetLiteral(/\bParticleRenderType\s*\./);
    }

    stateUsesTextureSheetCooTextureSheet() {
        return this.stateUsesTextureSheetLiteral(/\bCooParticleTextureSheet\s*\./);
    }

    buildClassFields(className) {
        const lines = [];
        const used = new Set();
        const uniqueName = (raw, fallback) => {
            let base = sanitizeKotlinIdentifier(raw, fallback);
            if (!base) base = fallback;
            let out = base;
            let i = 2;
            while (used.has(out)) out = `${base}${i++}`;
            used.add(out);
            return out;
        };

        for (const v of this.state.globalVars) {
            const name = uniqueName(v.name, "value");
            const type = String(v.type || "Double").trim() || "Double";
            const rawValue = String(v.value || "").trim();
            let value = this.rewriteCodeExpr(rawValue || defaultLiteralForKotlinType(type), className);
            if (/^float$/i.test(type)) {
                if (isPlainNumericLiteralText(value)) value = normalizeKotlinFloatLiteralText(value);
                else if (!/\.toFloat\(\)\s*$/.test(value)) value = `(${value}).toFloat()`;
            } else if (/^double$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = normalizeKotlinDoubleLiteralText(value);
            }
            if (v.codec) lines.push("    @CodecField");
            lines.push(`    ${v.mutable ? "var" : "val"} ${name}: ${type} = ${value}`);
            lines.push("");
        }
        for (const c of this.state.globalConsts) {
            const name = uniqueName(c.name, "constant");
            const type = String(c.type || "Int").trim() || "Int";
            const rawValue = String(c.value || "").trim();
            let value = this.rewriteCodeExpr(rawValue || defaultLiteralForKotlinType(type), className);
            if (/^float$/i.test(type)) {
                if (isPlainNumericLiteralText(value)) value = normalizeKotlinFloatLiteralText(value);
                else if (!/\.toFloat\(\)\s*$/.test(value)) value = `(${value}).toFloat()`;
            } else if (/^double$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = normalizeKotlinDoubleLiteralText(value);
            }
            lines.push(`    val ${name}: ${type} = ${value}`);
            lines.push("");
        }

        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            if (projectScale.type === "bezier") {
                lines.push(
                    `    private val scaleHelper = CompositionBezierScaleHelper(${Math.max(1, int(projectScale.tick))}, ${formatKotlinDoubleLiteral(projectScale.min)}, ${formatKotlinDoubleLiteral(projectScale.max)}, ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(projectScale.c1x)}, ${formatKotlinDoubleLiteral(projectScale.c1y)}, ${formatKotlinDoubleLiteral(projectScale.c1z)}), ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(projectScale.c2x)}, ${formatKotlinDoubleLiteral(projectScale.c2y)}, ${formatKotlinDoubleLiteral(projectScale.c2z)}))`
                );
            } else {
                lines.push(`    private val scaleHelper = CompositionScaleHelper(${formatKotlinDoubleLiteral(projectScale.min)}, ${formatKotlinDoubleLiteral(projectScale.max)}, ${Math.max(1, int(projectScale.tick))})`);
            }
            lines.push("");
        }
        const projectAlpha = normalizeAlphaHelperConfig(this.state.projectAlpha, { type: "none" });
        if (projectAlpha.type !== "none") {
            lines.push(`    private val alphaHelper = CompositionAlphaHelper(${formatKotlinDoubleLiteral(projectAlpha.min)}, ${formatKotlinDoubleLiteral(projectAlpha.max)}, ${Math.max(1, int(projectAlpha.tick))})`);
            lines.push("");
        }

        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.join("\n");
    }

    buildInitBlock(className, sequencedRoot) {
        const lines = [];
        const axisExpr = this.rewriteRelativeTargetExpr(
            String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()"),
            className
        );
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            lines.push("        scaleHelper.loadControler(this)");
        }
        const projectAlpha = normalizeAlphaHelperConfig(this.state.projectAlpha, { type: "none" });
        if (projectAlpha.type !== "none") {
            lines.push("        alphaHelper.loadControler(this)");
            if (projectAlpha.startMax === true) {
                lines.push("        alphaHelper.resetAlphaMax()");
            }
        }
        const disabled = Math.max(0, int(this.state.disabledInterval || 0));
        if (disabled > 0) lines.push(`        setDisabledInterval(${disabled})`);
        if (sequencedRoot && this.state.compositionAnimates.length) {
            const animates = this.state.compositionAnimates.map((a) => normalizeAnimate(a));
            if (animates.length) {
                const first = animates[0];
                lines.push(`        animate.addAnimate(${Math.max(1, int(first.count))}) { ${this.rewriteAnimateConditionExpr(first.condition || "true", className)} }`);
                for (let i = 1; i < animates.length; i++) {
                    const it = animates[i];
                    lines.push(`            .addAnimate(${Math.max(1, int(it.count))}) { ${this.rewriteAnimateConditionExpr(it.condition || "true", className)} }`);
                }
            }
        }
        if (!lines.length) return "";
        return ["    init {", ...lines, "    }"].join("\n");
    }

    buildParticlesMethod(className, sequencedRoot) {
        const lines = [];
        if (sequencedRoot) {
            lines.push("    override fun getParticleSequenced(): SortedMap<CompositionData, RelativeLocation> {");
            lines.push("        val result: SortedMap<CompositionData, RelativeLocation> = TreeMap()");
            lines.push("        var orderCounter = 0");
        } else {
            lines.push("    override fun getParticles(): Map<CompositionData, RelativeLocation> {");
            lines.push("        val result = LinkedHashMap<CompositionData, RelativeLocation>()");
        }

        for (let i = 0; i < this.state.cards.length; i++) {
            const card = this.state.cards[i];
            lines.push("");
            lines.push(this.emitCardPut(card, className, sequencedRoot, i));
        }

        lines.push("");
        lines.push("        return result");
        lines.push("    }");
        return lines.join("\n");
    }

    emitCardPut(card, className, sequencedRoot, cardIndex = 0) {
        if (card.bindMode === "point") return this.emitCardPutPoint(card, className, sequencedRoot, cardIndex);
        return this.emitCardPutAll(card, className, sequencedRoot, cardIndex);
    }

    buildAngleOffsetEaseExpr(easeName, rawParams) {
        const ease = normalizeAngleOffsetEaseName(easeName || "outCubic");
        const params = normalizeAngleOffsetEaseSpecialParams(rawParams || {});
        if (ease === "outBack") {
            return `Eases.outBack(${formatKotlinDoubleLiteral(params.angleOffsetEaseOvershoot)})`;
        }
        if (ease === "outElastic") {
            const period = formatKotlinDoubleLiteral(params.angleOffsetEasePeriod);
            const decay = formatKotlinDoubleLiteral(params.angleOffsetEaseDecay);
            const shift = formatKotlinDoubleLiteral(params.angleOffsetEaseShift);
            return `Eases.outElastic(${period}, ${decay}, ${shift})`;
        }
        if (ease === "outBounce") {
            const n1 = formatKotlinDoubleLiteral(params.angleOffsetEaseN1);
            const d1 = formatKotlinDoubleLiteral(params.angleOffsetEaseD1);
            return `Eases.outBounce(${n1}, ${d1})`;
        }
        if (ease === "bezierEase") {
            const startX = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierStartX);
            const startY = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierStartY);
            const endX = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierEndX);
            const endY = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierEndY);
            return `Eases.bezierEase(RelativeLocation(${startX}, ${startY}, 0.0), RelativeLocation(${endX}, ${endY}, 0.0))`;
        }
        return `Eases.${ease}`;
    }

    resolveAngleOffsetConfig(raw, className) {
        if (!raw || raw.angleOffsetEnabled !== true) return null;
        const rawType = String(raw.type || raw.dataType || "").trim();
        if (rawType === "single") return null;
        const count = Math.max(1, int(raw.angleOffsetCount || 1));
        if (count <= 1) return null;
        const glowTick = Math.max(1, int(raw.angleOffsetGlowTick || 20));
        const easeName = normalizeAngleOffsetEaseName(raw.angleOffsetEase || "outCubic");
        const easeExpr = this.buildAngleOffsetEaseExpr(easeName, raw);
        const reverseOnDisable = raw.angleOffsetReverseOnDisable === true;
        const totalAngleRaw = raw.angleOffsetAngleMode === "expr"
            ? String(raw.angleOffsetAngleExpr || raw.angleOffsetAnglePreset || "PI * 2")
            : U.angleToKotlinRadExpr(num(raw.angleOffsetAngleValue || 0), normalizeAngleUnit(raw.angleOffsetAngleUnit || "deg"));
        const totalAngleExpr = this.rewriteCodeExpr(totalAngleRaw || "0.0", className) || "0.0";
        return { count, glowTick, easeName, easeExpr, reverseOnDisable, totalAngleExpr };
    }

    resolveCardAngleOffsetConfig(card, className) {
        if (!card || card.dataType === "single") return null;
        return this.resolveAngleOffsetConfig(card, className);
    }

    resolveShapeLevelAngleOffsetConfig(level, className) {
        if (!level) return null;
        return this.resolveAngleOffsetConfig(level, className);
    }

    createDescendantActionCtx(actionCtx) {
        if (!actionCtx || typeof actionCtx !== "object") return null;
        const suppressNodeAngleOffsetIds = Array.isArray(actionCtx.suppressNodeAngleOffsetIds)
            ? actionCtx.suppressNodeAngleOffsetIds.map((it) => String(it || "").trim()).filter(Boolean)
            : [];
        if (!suppressNodeAngleOffsetIds.length) return null;
        return { suppressNodeAngleOffsetIds };
    }

    normalizeVectorCtorNumericLiteral(rawArg, mode = "double") {
        const raw = String(rawArg || "").trim();
        if (!/^-?(?:\d+\.?\d*|\.\d+)(?:[fFdDlL])?$/.test(raw)) return raw;
        let core = raw;
        if (/[fFdDlL]$/.test(core)) core = core.slice(0, -1);
        if (!core) return raw;
        if (mode === "float") {
            if (!core.includes(".")) return `${core}F`;
            if (core.endsWith(".")) core = `${core}0`;
            return `${core}F`;
        }
        if (!core.includes(".")) return `${core}.0`;
        if (core.endsWith(".")) return `${core}0`;
        return core;
    }

    rewriteVectorCtorNumericLiterals(exprRaw) {
        const src = String(exprRaw || "");
        const rewrite = (ctor, a, b, c) => {
            const mode = ctor === "Vector3f" ? "float" : "double";
            const x = this.normalizeVectorCtorNumericLiteral(a, mode);
            const y = this.normalizeVectorCtorNumericLiteral(b, mode);
            const z = this.normalizeVectorCtorNumericLiteral(c, mode);
            return `${ctor}(${x}, ${y}, ${z})`;
        };
        let out = src.replace(
            /\bVector3f\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
            (m, a, b, c) => rewrite("Vector3f", a, b, c)
        );
        out = out.replace(
            /\bVec3\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
            (m, a, b, c) => rewrite("Vec3", a, b, c)
        );
        out = out.replace(
            /\bRelativeLocation\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
            (m, a, b, c) => rewrite("RelativeLocation", a, b, c)
        );
        return out;
    }

    rewriteCodeExpr(exprRaw, className) {
        const qualified = rewriteClassQualifier(String(exprRaw || ""), className);
        return this.rewriteVectorCtorNumericLiterals(qualified);
    }

    rewriteAnimateConditionExpr(exprRaw, className) {
        return this.rewriteCodeExpr(exprRaw, className);
    }

    shouldAutoAsRelative(exprRaw, className) {
        const expr = String(exprRaw || "").trim();
        if (!expr || /\.asRelative\(\)\s*$/.test(expr)) return false;
        if (/^(Vec3|Vector3f)\s*\(/.test(expr)) return true;
        const cls = sanitizeKotlinClassName(className || "NewComposition");
        for (const v of (this.state.globalVars || [])) {
            const rawName = String(v?.name || "").trim();
            const name = sanitizeKotlinIdentifier(rawName, "");
            const type = String(v?.type || "").trim();
            if (!name || (type !== "Vec3" && type !== "Vector3f")) continue;
            if (expr === name || expr === `this@${cls}.${name}`) return true;
        }
        return false;
    }

    rewriteRelativeTargetExpr(exprRaw, className) {
        const expr = this.rewriteCodeExpr(exprRaw, className).trim();
        if (!expr) return "RelativeLocation.yAxis()";
        if (this.shouldAutoAsRelative(expr, className)) {
            if (/^(Vec3|Vector3f)\s*\(/.test(expr)) return `(${expr}).asRelative()`;
            return `${expr}.asRelative()`;
        }
        return expr;
    }

    emitCardPutAll(card, className, sequencedRoot, cardIndex = 0) {
        const builderExpr = this.emitBuilderExpr(card);
        const offsetCfg = this.resolveCardAngleOffsetConfig(card, className);
        if (offsetCfg) {
            const suffix = Math.max(0, int(cardIndex)) + 1;
            const countVar = `angleOffsetCount${suffix}`;
            const angleVar = `finalAngle${suffix}`;
            const countLiteral = formatKotlinDoubleLiteral(Math.max(1, int(offsetCfg.count)));
            const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                        ", {
                angleOffsetExpr: angleVar,
                angleOffsetConfig: offsetCfg,
                suppressNodeAngleOffsetIds: offsetCfg?.hoistedFromNodeId ? [offsetCfg.hoistedFromNodeId] : []
            });
            return [
                `        val ${countVar} = ${Math.max(1, int(offsetCfg.count))}`,
                `        repeat(${countVar}) { index ->`,
                `            val ${angleVar} = (${offsetCfg.totalAngleExpr}) * (index / ${countLiteral})`,
                "            result.putAll(",
                `${indentText(builderExpr, "                ")}`,
                "                    .createWithCompositionData { rel ->",
                dataExpr,
                "                    }",
                "            )",
                "        }"
            ].join("\n");
        }
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        result.putAll(",
            `${indentText(builderExpr, "            ")}`,
            "                .createWithCompositionData { rel ->",
            dataExpr,
            "                }",
            "        )"
        ].join("\n");
    }

    emitCardPutPoint(card, className, sequencedRoot, cardIndex = 0) {
        const rel = relExpr(card.point?.x, card.point?.y, card.point?.z);
        const offsetCfg = this.resolveCardAngleOffsetConfig(card, className);
        if (offsetCfg) {
            const suffix = Math.max(0, int(cardIndex)) + 1;
            const countVar = `angleOffsetCount${suffix}`;
            const angleVar = `finalAngle${suffix}`;
            const countLiteral = formatKotlinDoubleLiteral(Math.max(1, int(offsetCfg.count)));
            const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                    ", {
                angleOffsetExpr: angleVar,
                angleOffsetConfig: offsetCfg,
                suppressNodeAngleOffsetIds: offsetCfg?.hoistedFromNodeId ? [offsetCfg.hoistedFromNodeId] : []
            });
            return [
                `        val ${countVar} = ${Math.max(1, int(offsetCfg.count))}`,
                `        repeat(${countVar}) { index ->`,
                `            val ${angleVar} = (${offsetCfg.totalAngleExpr}) * (index / ${countLiteral})`,
                "            result[",
                dataExpr,
                `            ] = ${rel}`,
                "        }"
            ].join("\n");
        }
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        result[",
            dataExpr,
            `        ] = ${rel}`
        ].join("\n");
    }


    emitCompositionDataExpr(card, className, sequencedRoot, indentBase = "                ", opts = {}) {
        const lines = [];
        const actionCtx = (opts && typeof opts === "object" && String(opts.angleOffsetExpr || "").trim())
            ? {
                angleOffsetExpr: String(opts.angleOffsetExpr || "").trim(),
                angleOffsetConfig: (opts.angleOffsetConfig && typeof opts.angleOffsetConfig === "object")
                    ? opts.angleOffsetConfig
                    : null,
                suppressNodeAngleOffsetIds: Array.isArray(opts.suppressNodeAngleOffsetIds)
                    ? opts.suppressNodeAngleOffsetIds.map((it) => String(it || "").trim()).filter(Boolean)
                    : []
            }
            : null;
        if (sequencedRoot) {
            lines.push(`${indentBase}CompositionData().apply { order = orderCounter++ }`);
        } else {
            lines.push(`${indentBase}CompositionData()`);
        }
        lines.push(`${indentBase}    .setDisplayerSupplier {`);
        if (card.dataType === "single") {
            lines.push(`${indentBase}        ParticleDisplayer.withSingle(${sanitizeKotlinIdentifier(card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS)}(it))`);
        } else if (card.dataType === "particle_shape") {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "particle_shape", actionCtx), `${indentBase}        `));
        } else {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "sequenced_shape", actionCtx), `${indentBase}        `));
        }
        lines.push(`${indentBase}    }`);

        if (card.dataType === "single") {
            lines.push(this.buildSingleDataChain(card, className, `${indentBase}    `));
        }
        return lines.join("\n");
    }

    buildSingleDataChain(card, className, indentBase = "                    ") {
        const lines = [];
        const normalizeParticleExpr = typeof normalizeParticleFloatAssignmentExpr === "function"
            ? normalizeParticleFloatAssignmentExpr
            : ((targetName, exprRaw) => String(exprRaw || "").trim());
        const rewriteStatus = typeof rewriteControllerStatusQualifier === "function"
            ? rewriteControllerStatusQualifier
            : ((exprRaw) => String(exprRaw || ""));
        if (Array.isArray(card.particleInit) && card.particleInit.length) {
            lines.push(`${indentBase}.addParticleInstanceInit {`);
            for (const it of card.particleInit) {
                const targetRaw = String(it?.target || "size").trim();
                const target = sanitizeKotlinIdentifier(targetRaw || "size", "size");
                const isTextureSheetTarget = targetRaw.toLowerCase() === "texturesheet";
                const exprRaw = isTextureSheetTarget
                    ? String(it?.codegenExpr || it?.codegenExprPreset || it?.expr || "").trim()
                    : String(it?.expr || "").trim();
                let expr = this.rewriteCodeExpr(exprRaw, className);
                if (!isTextureSheetTarget) {
                    expr = normalizeParticleExpr(target, expr);
                }
                if (!expr) continue;
                lines.push(`${indentBase}    ${target} = ${expr}`);
            }
            lines.push(`${indentBase}}`);
        }

        const normalizeController = typeof normalizeControllerAction === "function"
            ? normalizeControllerAction
            : ((raw) => Object.assign({ type: "tick_js", script: "" }, raw || {}));
        const hasTick = Array.isArray(card.controllerVars) && card.controllerVars.length;
        const actions = Array.isArray(card.controllerActions) ? card.controllerActions.map((it) => normalizeController(it)) : [];
        if (hasTick || actions.length) {
            lines.push(`${indentBase}.addParticleControlerInstanceInit {`);
            for (const v of (card.controllerVars || [])) {
                const vName = sanitizeKotlinIdentifier(v.name || "v", "v");
                const vType = sanitizeKotlinIdentifier(v.type || "Boolean", "Boolean");
                let expr = this.rewriteCodeExpr(String(v.expr || "").trim(), className);
                expr = rewriteStatus(expr, className);
                if (!expr) expr = defaultLiteralForKotlinType(vType);
                if (/^float$/i.test(vType)) {
                    if (isPlainNumericLiteralText(expr)) expr = normalizeKotlinFloatLiteralText(expr);
                    else if (!/\.toFloat\(\)\s*$/.test(expr)) expr = `(${expr}).toFloat()`;
                } else if (/^double$/i.test(vType) && isPlainNumericLiteralText(expr)) {
                    expr = normalizeKotlinDoubleLiteralText(expr);
                }
                lines.push(`${indentBase}    var ${vName}: ${vType} = ${expr}`);
            }
            for (const action of actions) {
                const script = rewriteClassQualifier(String(action.script || "").trim(), className);
                const patched = rewriteStatus(script, className);
                if (!patched) continue;
                lines.push(`${indentBase}    addPreTickAction {`);
                lines.push(translateJsBlockToKotlin(patched, `${indentBase}        `));
                lines.push(`${indentBase}    }`);
            }
            lines.push(`${indentBase}}`);
        }
        return lines.join("\n");
    }

    createShapeDataLambdaContext(depth = 0, sequenced = false, parentCtx = null) {
        const d = Math.max(0, int(depth));
        return {
            depth: d,
            relName: `shapeRel${d}`,
            orderName: sequenced ? `shapeOrder${d}` : "",
            parent: parentCtx && typeof parentCtx === "object" ? parentCtx : null
        };
    }

    formatShapeDataLambdaParams(ctx) {
        if (!ctx) return "shapeRel0";
        if (ctx.orderName) return `${ctx.relName}, ${ctx.orderName}`;
        return ctx.relName;
    }

    emitShapeCompositionDataBase(ctx, indent = "            ") {
        if (ctx?.orderName) return `${indent}CompositionData().apply { order = ${ctx.orderName} }`;
        return `${indent}CompositionData()`;
    }

    buildShapeDisplayerExpr(card, className, type = "particle_shape", actionCtx = null) {
        const isSequenced = type === "sequenced_shape";
        const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const axisExpr = this.rewriteRelativeTargetExpr(String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const rootCtx = this.createShapeDataLambdaContext(0, isSequenced, null);
        const rootScopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, 0);
        const lines = [];
        lines.push("ParticleDisplayer.withComposition(");
        lines.push(`    ${cls}(it).apply {`);
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        const children = card.shapeChildren || [];
        const childActionCtx = this.createDescendantActionCtx(actionCtx);
        this._emitTreeNodeChildrenApplyCodegen(lines, children, card, className, rootCtx, "        ", childActionCtx);
        lines.push(this.applyCardCompositionActions(card, className, "        ", isSequenced, rootScopeInfo, actionCtx));
        lines.push("    }");
        lines.push(")");
        return lines.join("\n");
    }

    _emitTreeNodeChildrenApplyCodegen(lines, children, card, className, parentCtx, indent, actionCtx) {
        const nodes = Array.isArray(children) ? children : [];
        if (!nodes.length) return;
        for (const child of nodes) {
            this._emitTreeNodeApplyBlockCodegen(lines, child, card, className, parentCtx, indent, actionCtx);
        }
    }

    _emitScaleHelperCodegen(lines, scale, indent) {
        if (scale.type === "bezier") {
            const tick = Math.max(1, int(scale.tick));
            const c1x = num(scale.c1x);
            const c1y = num(scale.c1y) - num(scale.min);
            const c1z = num(scale.c1z);
            const c2x = num(scale.c2x) - tick;
            const c2y = num(scale.c2y) - num(scale.max);
            const c2z = num(scale.c2z);
            lines.push(
                `${indent}loadScaleHelperBezierValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${tick}, ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(c1x)}, ${formatKotlinDoubleLiteral(c1y)}, ${formatKotlinDoubleLiteral(c1z)}), ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(c2x)}, ${formatKotlinDoubleLiteral(c2y)}, ${formatKotlinDoubleLiteral(c2z)}))`
            );
        } else if (scale.type === "linear") {
            lines.push(`${indent}loadScaleValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))})`);
        }
    }

    _emitTreeNodeApplyBlockCodegen(lines, node, card, className, parentCtx, indent, actionCtx, opts = null) {
        if (!node) return;
        const options = (opts && typeof opts === "object") ? opts : null;
        const nodeType = node.type || "single";
        const bindMode = node.bindMode === "builder" ? "builder" : "point";
        const pointExpr = relExpr(node.point?.x, node.point?.y, node.point?.z);
        const builderExpr = this.emitBuilderExprFromState(node.builderState);
        const isSequenced = nodeType === "sequenced_shape";
        const depth = parentCtx ? int(parentCtx.depth) + 1 : 1;
        const ctx = this.createShapeDataLambdaContext(depth, isSequenced, parentCtx);
        const dataLambdaHead = this.formatShapeDataLambdaParams(ctx);
        const suppressNodeAngleOffsetIds = Array.isArray(actionCtx?.suppressNodeAngleOffsetIds)
            ? actionCtx.suppressNodeAngleOffsetIds.map((it) => String(it || "").trim()).filter(Boolean)
            : [];
        const suppressOwnAngleOffset = options?.suppressOwnAngleOffset === true
            || suppressNodeAngleOffsetIds.includes(String(node?.id || "").trim());
        const offsetCfg = suppressOwnAngleOffset ? null : this.resolveShapeLevelAngleOffsetConfig(node, className);
        if (offsetCfg) {
            const angleOffsetCount = Math.max(1, int(offsetCfg.count));
            const angleOffsetCountLiteral = formatKotlinDoubleLiteral(angleOffsetCount);
            lines.push(`${indent}repeat(${angleOffsetCount}) { index ->`);
            lines.push(`${indent}    val finalAngle = (${offsetCfg.totalAngleExpr}) * (index / ${angleOffsetCountLiteral})`);
            const innerActionCtx = { angleOffsetExpr: "finalAngle", angleOffsetConfig: offsetCfg };
            if (nodeType === "single") {
                this._emitTreeNodeSingleApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, `${indent}    `, innerActionCtx);
            } else {
                this._emitTreeNodeShapeApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, `${indent}    `, isSequenced, depth, innerActionCtx);
            }
            lines.push(`${indent}}`);
        } else if (nodeType === "single") {
            this._emitTreeNodeSingleApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, actionCtx);
        } else {
            this._emitTreeNodeShapeApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, isSequenced, depth, actionCtx);
        }
    }

    _emitTreeNodeSingleApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, actionCtx) {
        const fx = sanitizeKotlinIdentifier(node.effectClass || card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS);
        if (bindMode === "builder") {
            lines.push(`${indent}applyBuilder(`);
            lines.push(indentText(builderExpr, `${indent}    `));
            lines.push(`${indent}) { ${dataLambdaHead} ->`);
        } else {
            lines.push(`${indent}applyPoint(${pointExpr}) { ${dataLambdaHead} ->`);
        }
        lines.push(this.emitShapeCompositionDataBase(ctx, `${indent}    `));
        lines.push(`${indent}        .setDisplayerSupplier {`);
        lines.push(`${indent}            ParticleDisplayer.withSingle(${fx}(it))`);
        lines.push(`${indent}        }`);
        const singleChain = this._buildTreeNodeSingleDataChainCodegen(node, card, className, `${indent}        `);
        if (singleChain) lines.push(singleChain);
        lines.push(`${indent}}`);
    }

    _emitTreeNodeShapeApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, isSequenced, depth, actionCtx) {
        const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const axisExpr = this.rewriteRelativeTargetExpr(String(node.axisExpr || node.axisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(node.scale, { type: "none" });
        if (bindMode === "builder") {
            lines.push(`${indent}applyBuilder(`);
            lines.push(indentText(builderExpr, `${indent}    `));
            lines.push(`${indent}) { ${dataLambdaHead} ->`);
        } else {
            lines.push(`${indent}applyPoint(${pointExpr}) { ${dataLambdaHead} ->`);
        }
        lines.push(this.emitShapeCompositionDataBase(ctx, `${indent}    `));
        lines.push(`${indent}        .setDisplayerSupplier {`);
        lines.push(`${indent}            ParticleDisplayer.withComposition(`);
        lines.push(`${indent}                ${cls}(it).apply {`);
        if (axisExpr) lines.push(`${indent}                    axis = ${axisExpr}`);
        const children = node.children || [];
        const childActionCtx = this.createDescendantActionCtx(actionCtx);
        this._emitTreeNodeChildrenApplyCodegen(lines, children, card, className, ctx, `${indent}                    `, childActionCtx);
        const pseudo = { id: card.id, shapeDisplayActions: node.displayActions || [], shapeScale: scale, growthAnimates: node.growthAnimates || [] };
        const scopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, depth);
        const actions = this.applyCardCompositionActions(pseudo, className, `${indent}                    `, isSequenced, scopeInfo, actionCtx);
        if (String(actions || "").trim()) lines.push(actions);
        lines.push(`${indent}                }`);
        lines.push(`${indent}            )`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}}`);
    }

    _buildTreeNodeSingleDataChainCodegen(node, card, className, indentBase) {
        return this.buildSingleDataChain({
            particleInit: Array.isArray(node?.particleInit) ? node.particleInit : [],
            controllerVars: Array.isArray(node?.controllerVars) ? node.controllerVars : [],
            controllerActions: Array.isArray(node?.controllerActions) ? node.controllerActions : []
        }, className, indentBase);
    }

    applyCardCompositionActions(card, className, innerIndent = "        ", supportsAnimate = false, scopeInfo = null, actionCtx = null) {
        const lines = [];
        const displayActions = Array.isArray(card.shapeDisplayActions) && card.shapeDisplayActions.length
            ? card.shapeDisplayActions.map((a) => normalizeDisplayAction(a))
            : [];
        const offsetAngleExpr = String(actionCtx?.angleOffsetExpr || "").trim();
        const offsetCfg = (actionCtx?.angleOffsetConfig && typeof actionCtx.angleOffsetConfig === "object")
            ? actionCtx.angleOffsetConfig
            : null;
        const useAngleOffsetAnimator = !!offsetAngleExpr && !!offsetCfg;
        const shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const hasShapeScale = shapeScale.type !== "none";
        const needReverseScale = hasShapeScale && shapeScale.reversedOnDisable;
        if (hasShapeScale) {
            this._emitScaleHelperCodegen(lines, shapeScale, innerIndent);
        }
        const appendOffsetAnimator = (targetLines, callIndent = `${innerIndent}    `) => {
            if (!useAngleOffsetAnimator) return;
            const glowTick = Math.max(1, int(offsetCfg.glowTick || 20));
            const easeExpr = String(offsetCfg.easeExpr || this.buildAngleOffsetEaseExpr(offsetCfg.easeName || "outCubic", offsetCfg));
            const reverseOnDisable = offsetCfg.reverseOnDisable === true;
            const cls = sanitizeKotlinClassName(className);
            targetLines.push(`${callIndent}val animator = AngleAnimator(${glowTick}, ${offsetAngleExpr}, ${easeExpr})`);
            targetLines.push(`${callIndent}animator.reset()`);
            targetLines.push(`${callIndent}val timeline = Timeline()`);
            targetLines.push(`${callIndent}    .step {`);
            targetLines.push(`${callIndent}        rotateAsAxis(animator.glowDelta())`);
            targetLines.push(`${callIndent}        animator.finished`);
            targetLines.push(`${callIndent}    }`);
            if (reverseOnDisable) {
                targetLines.push(`${callIndent}    .step {`);
                targetLines.push(`${callIndent}        if (!this@${cls}.status.isDisable()) return@step false`);
                targetLines.push(`${callIndent}        rotateAsAxis(animator.fadeDelta())`);
                targetLines.push(`${callIndent}        animator.finished`);
                targetLines.push(`${callIndent}    }`);
            }
            targetLines.push(`${callIndent}addPreTickAction {`);
            targetLines.push(`${callIndent}    timeline.doTick()`);
            targetLines.push(`${callIndent}}`);
        };
        if (displayActions.length || useAngleOffsetAnimator || needReverseScale) {
            const blockLines = [];
            if (useAngleOffsetAnimator) appendOffsetAnimator(blockLines);
            for (let i = 0; i < displayActions.length; i++) {
                const act = displayActions[i];
                const toExpr = this.rewriteRelativeTargetExpr(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
                const angleExpr = act.angleMode === "expr"
                    ? this.rewriteCodeExpr(String(act.angleExpr || "0.0"), className)
                    : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
                if (act.type === "rotateToPoint") {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateToPoint(${toExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else if (act.type === "rotateAsAxis") {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateAsAxis(${angleExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else if (act.type === "rotateToWithAngle") {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateToWithAngle(${toExpr}, ${angleExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else if (act.type === "expression") {
                    const rawExpr = String(act.expression || "").trim();
                    const check = this.validateJsExpressionSource(rawExpr, { cardId: card.id, scope: scopeInfo || undefined });
                    const expr = this.rewriteCodeExpr(rawExpr, className);
                    if (expr && check.valid) {
                        blockLines.push(`${innerIndent}    addPreTickAction {`);
                        blockLines.push(translateJsBlockToKotlin(expr, `${innerIndent}        `));
                        blockLines.push(`${innerIndent}    }`);
                    }
                }
            }
            if (needReverseScale) {
                const cls = sanitizeKotlinClassName(className);
                blockLines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            }
            if (blockLines.length) {
                lines.push(`${innerIndent}applyDisplayAction {`);
                lines.push(...blockLines);
                lines.push(`${innerIndent}}`);
            }
        }
        if (supportsAnimate && card.growthAnimates?.length) {
            const arr = card.growthAnimates.map((a) => normalizeAnimate(a));
            if (arr.length) {
                lines.push(`${innerIndent}animate.addAnimate(${arr[0].count}) { ${this.rewriteAnimateConditionExpr(arr[0].condition || "true", className)} }`);
                for (let i = 1; i < arr.length; i++) {
                    lines.push(`${innerIndent}    .addAnimate(${arr[i].count}) { ${this.rewriteAnimateConditionExpr(arr[i].condition || "true", className)} }`);
                }
            }
        }
        return lines.join("\n");
    }

    buildRemoveMethod() {
        if (this.state.enableRemoveStatusOverride !== true) return "";
        return [
            "    override fun remove() {",
            "        if (status.isDisable()) {",
            "            super.remove()",
            "        } else {",
            "            status.disable()",
            "        }",
            "    }"
        ].join("\n");
    }

    buildOnDisplayMethod(className) {
        const actions = this.state.displayActions || [];
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        const projectAlpha = normalizeAlphaHelperConfig(this.state.projectAlpha, { type: "none" });
        const hasProjectScaleHelper = projectScale.type !== "none";
        const projectScaleManual = hasProjectScaleHelper && String(projectScale.runMode || "auto").trim() === "manual";
        const projectScaleAuto = hasProjectScaleHelper && !projectScaleManual;
        const hasProjectAlphaHelper = projectAlpha.type !== "none";
        const projectAlphaManual = hasProjectAlphaHelper && String(projectAlpha.runMode || "auto").trim() === "manual";
        const projectAlphaAuto = hasProjectAlphaHelper && !projectAlphaManual;
        const needReverseScale = projectScaleAuto && projectScale.reversedOnDisable;
        const bodyLines = [];
        if (projectScaleAuto) {
            if (needReverseScale) {
                bodyLines.push("            if (status.isEnable()) {");
                bodyLines.push("                scaleHelper.doScale()");
                bodyLines.push("            } else {");
                bodyLines.push("                scaleHelper.doScaleReversed()");
                bodyLines.push("            }");
            } else {
                bodyLines.push("            scaleHelper.doScale()");
            }
        }
        if (projectAlphaAuto) {
            if (projectAlpha.decreaseOnDisable === true) {
                bodyLines.push("            if (status.isDisable()) {");
                bodyLines.push("                alphaHelper.decreaseAlpha()");
                bodyLines.push("            } else {");
                bodyLines.push("                alphaHelper.increaseAlpha()");
                bodyLines.push("            }");
            } else {
                bodyLines.push("            alphaHelper.increaseAlpha()");
            }
        }
        for (const raw of actions) {
            const act = normalizeDisplayAction(raw);
            const toExpr = this.rewriteRelativeTargetExpr(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? this.rewriteCodeExpr(String(act.angleExpr || "0.0"), className)
                : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
            if (act.type === "rotateToPoint") {
                bodyLines.push(`            rotateToPoint(${toExpr})`);
            } else if (act.type === "rotateAsAxis") {
                bodyLines.push(`            rotateAsAxis(${angleExpr})`);
            } else if (act.type === "rotateToWithAngle") {
                bodyLines.push(`            rotateToWithAngle(${toExpr}, ${angleExpr})`);
            } else if (act.type === "expression") {
                const rawExpr = String(act.expression || "").trim();
                const check = this.validateJsExpressionSource(rawExpr, {
                    cardId: "",
                    allowScaleHelper: projectScaleManual,
                    allowAlphaHelper: projectAlphaManual
                });
                const expr = this.rewriteCodeExpr(rawExpr, className);
                if (expr && check.valid) bodyLines.push(translateJsBlockToKotlin(expr, "            "));
            }
        }
        if (!bodyLines.length) {
            return [
                "    override fun onDisplay() {",
                "    }"
            ].join("\n");
        }
        const lines = [];
        lines.push("    override fun onDisplay() {");
        lines.push("        addPreTickAction {");
        lines.push(...bodyLines);
        lines.push("        }");
        lines.push("    }");
        return lines.join("\n");
    }
    }

    for (const key of Object.getOwnPropertyNames(KotlinCodegenMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = KotlinCodegenMixin.prototype[key];
    }
}
