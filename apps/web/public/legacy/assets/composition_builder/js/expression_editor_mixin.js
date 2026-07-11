export function installExpressionEditorMethods(CompositionBuilderApp, deps = {}) {
    const {
        int,
        esc,
        normalizeAlphaHelperConfig,
        sanitizeKotlinClassName,
        transpileKotlinThisQualifierToJs,
        findFirstUnknownJsIdentifier,
        JS_LINT_GLOBALS,
        InlineCodeEditor,
        mergeCompletionGroups
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installExpressionEditorMethods requires CompositionBuilderApp");
    }

    class ExpressionEditorMixin {
    initExpressionSuggest() {
        const el = document.createElement("div");
        el.className = "expr-suggest hidden";
        document.body.appendChild(el);
        this.exprSuggest.el = el;
        el.addEventListener("mousedown", (e) => e.preventDefault());
        el.addEventListener("click", (e) => {
            const btn = e.target.closest(".expr-suggest-item");
            if (!btn) return;
            const idx = int(btn.dataset.idx);
            this.acceptExprSuggestion(idx);
        });
    }

    onExprFocusIn(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        this.exprSuggest.activeInput = input;
        this.openExprSuggest(input, false);
    }

    onExprInput(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        if (this.exprSuggest.activeInput !== input) this.exprSuggest.activeInput = input;
        this.openExprSuggest(input, false);
    }

    onExprKeydown(e) {
        const input = e.target?.closest?.(".expr-input");
        if (!input) return;
        if (!this.isExprTextInput(input)) return;
        if (!this.exprSuggest.el) return;
        const isOpen = !this.exprSuggest.el.classList.contains("hidden");
        if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
            e.preventDefault();
            this.openExprSuggest(input, true);
            return;
        }
        if (!isOpen) return;
        if (e.code === "ArrowDown") {
            e.preventDefault();
            this.moveExprSuggest(1);
            return;
        }
        if (e.code === "ArrowUp") {
            e.preventDefault();
            this.moveExprSuggest(-1);
            return;
        }
        if (e.code === "Enter" || e.code === "Tab") {
            e.preventDefault();
            this.acceptExprSuggestion(this.exprSuggest.active);
            return;
        }
        if (e.code === "Escape") {
            e.preventDefault();
            this.closeExprSuggest();
        }
    }

    onExprMouseDown(e) {
        if (!this.exprSuggest.el) return;
        const t = e.target;
        if (t?.closest?.(".expr-suggest")) return;
        if (t?.closest?.(".expr-input") && this.isExprTextInput(t.closest(".expr-input"))) return;
        this.closeExprSuggest();
    }

    isExprTextInput(el) {
        const tag = String(el?.tagName || "").toUpperCase();
        if (el?.dataset?.codeEditor) return false;
        return tag === "INPUT" || tag === "TEXTAREA";
    }

    openExprSuggest(input, force = false) {
        if (!input) return;
        const info = this.getExprTokenAtCursor(input);
        if (!info) {
            this.closeExprSuggest();
            return;
        }
        const all = this.getExprCompletions(input);
        const token = String(info.token || "").trim();
        if (!force && !token) {
            this.closeExprSuggest();
            return;
        }
        const tokenLower = token.toLowerCase();
        const dotIdx = token.lastIndexOf(".");
        const ownerPrefixLower = dotIdx > 0 ? `${token.slice(0, dotIdx)}.`.toLowerCase() : "";
        const memberPrefixLower = dotIdx > 0 ? token.slice(dotIdx + 1).toLowerCase() : "";
        const filtered = all.filter((it) => {
            if (!token) return force;
            const valueLower = String(it || "").toLowerCase();
            if (dotIdx > 0) {
                if (!valueLower.startsWith(ownerPrefixLower)) return false;
                return !memberPrefixLower || valueLower.slice(ownerPrefixLower.length).startsWith(memberPrefixLower);
            }
            return valueLower.includes(tokenLower);
        }).slice(0, 18);
        if (!filtered.length) {
            this.closeExprSuggest();
            return;
        }
        this.exprSuggest.activeInput = input;
        this.exprSuggest.items = all;
        this.exprSuggest.filtered = filtered;
        this.exprSuggest.token = token;
        this.exprSuggest.range = { start: info.start, end: info.end };
        this.exprSuggest.active = 0;
        this.renderExprSuggest();
    }

    renderExprSuggest() {
        const s = this.exprSuggest;
        if (!s.el || !s.activeInput || !s.filtered.length) return this.closeExprSuggest();
        const html = s.filtered.map((it, i) => `
            <button type="button" class="expr-suggest-item ${i === s.active ? "active" : ""}" data-idx="${i}">
                <span>${esc(String(it || "").replace("$0", ""))}</span>
            </button>
        `).join("");
        s.el.innerHTML = html;
        s.el.classList.remove("hidden");
        const rect = s.activeInput.getBoundingClientRect();
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const width = Math.min(420, Math.max(220, rect.width));
        let left = rect.left;
        let top = rect.bottom + 6;
        if (left + width > vw - 10) left = vw - width - 10;
        const panelHeight = 240;
        if (top + panelHeight > vh - 8) top = Math.max(8, rect.top - panelHeight - 8);
        s.el.style.left = `${Math.round(left)}px`;
        s.el.style.top = `${Math.round(top)}px`;
        s.el.style.width = `${Math.round(width)}px`;
    }

    moveExprSuggest(delta) {
        const s = this.exprSuggest;
        if (!s.filtered.length) return;
        const n = s.filtered.length;
        s.active = (s.active + delta + n) % n;
        this.renderExprSuggest();
    }

    acceptExprSuggestion(index) {
        const s = this.exprSuggest;
        const input = s.activeInput;
        if (!input) return;
        const item = s.filtered[int(index)];
        if (!item) return;
        const cursor = int(input.selectionStart ?? 0);
        const live = this.getExprTokenAtCursor(input) || { token: "", start: cursor, end: cursor };
        const stale = s.range || { start: cursor, end: cursor };
        let range = { start: stale.start, end: stale.end };
        if (cursor >= int(live.start) && cursor <= int(live.end)) {
            range = { start: int(live.start), end: int(live.end) };
        }
        const text = String(input.value || "");
        const marker = "$0";
        const rawInsert = String(item);
        const markerIdx = rawInsert.indexOf(marker);
        const insert = markerIdx >= 0 ? rawInsert.replace(marker, "") : rawInsert;
        const next = text.slice(0, range.start) + insert + text.slice(range.end);
        const caret = markerIdx >= 0 ? (range.start + markerIdx) : (range.start + insert.length);
        input.value = next;
        try {
            input.focus?.();
            input.setSelectionRange?.(caret, caret);
        } catch {
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        this.closeExprSuggest();
    }

    closeExprSuggest() {
        const s = this.exprSuggest;
        if (!s.el) return;
        s.el.classList.add("hidden");
        s.el.innerHTML = "";
        s.filtered = [];
        s.range = null;
        s.token = "";
    }

    getExprTokenAtCursor(input) {
        const value = String(input.value || "");
        const pos = int(input.selectionStart ?? value.length);
        const left = value.slice(0, pos);
        const m = left.match(/[A-Za-z_][A-Za-z0-9_.()@]*$/);
        if (!m) return { token: "", start: pos, end: pos };
        const token = m[0];
        return { token, start: pos - token.length, end: pos };
    }

    getExprCompletions(textarea = null) {
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const base = [
            "age",
            "tick",
            "tickCount",
            "axis",
            "PI",
            "status.displayStatus",
            "status.isDisable()",
            "status.disable()",
            "status.isEnable()",
            "status.enable()",
            `this@${projectClass}.status.displayStatus`,
            `this@${projectClass}.status.isDisable()`,
            `this@${projectClass}.status.disable()`,
            `this@${projectClass}.status.isEnable()`,
            `this@${projectClass}.status.enable()`,
            "rotateToPoint($0)",
            "rotateAsAxis($0)",
            "rotateToWithAngle($0, 0.05)",
            "addSingle()",
            "addMultiple($0)",
            "addPreTickAction { }",
            "setReversedScaleOnCompositionStatus($0)",
            "particle.particleAlpha",
            "particle.particleColor",
            "particle.particleSize",
            "axis = RelativeLocation($0)",
            "Vec3($0)",
            "RelativeLocation.yAxis()",
            "RelativeLocation($0)",
            "Vector3f($0)"
        ];
        for (const snippet of this.getProjectScaleHelperCompletionSnippets(textarea)) {
            base.push(snippet);
        }
        for (const snippet of this.getProjectAlphaHelperCompletionSnippets(textarea)) {
            base.push(snippet);
        }
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            if (!name) continue;
            base.push(name);
            base.push(`this@${projectClass}.${name}`);
            if (String(g.type || "") === "Vec3") base.push(`${name}.asRelative()`);
        }
        for (const c of this.state.globalConsts) {
            const name = String(c.name || "").trim();
            if (name) base.push(name);
        }
        return Array.from(new Set(base));
    }

    hasManualProjectScaleHelper() {
        const projectScale = (this.state?.projectScale && typeof this.state.projectScale === "object")
            ? this.state.projectScale
            : null;
        if (!projectScale) return false;
        const type = String(projectScale.type || "none").trim();
        if (!type || type === "none") return false;
        return String(projectScale.runMode || "auto").trim() === "manual";
    }

    isControllerScriptEditor(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        return String(textarea.dataset.cactField || textarea.dataset.treeNodeCactField || "").trim() === "script";
    }

    isScaleHelperAllowedForCodeEditor(textarea) {
        if (!this.hasManualProjectScaleHelper()) return false;
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        if (this.isControllerScriptEditor(textarea)) return false;
        return textarea.dataset.displayField === "expression"
            || textarea.dataset.cardShapeDisplayField === "expression"
            || textarea.dataset.cardShapeChildDisplayField === "expression"
            || textarea.dataset.shapeLevelDisplayField === "expression";
    }

    getProjectScaleHelperCompletionSnippets(textarea = null) {
        if (!this.isScaleHelperAllowedForCodeEditor(textarea)) return [];
        return [
            "scaleHelper.doScale()",
            "scaleHelper.doScaleReversed()"
        ];
    }

    hasManualProjectAlphaHelper() {
        const projectAlpha = normalizeAlphaHelperConfig(this.state?.projectAlpha, { type: "none" });
        if (projectAlpha.type === "none") return false;
        return String(projectAlpha.runMode || "auto").trim() === "manual";
    }

    isAlphaHelperAllowedForCodeEditor(textarea) {
        if (!this.hasManualProjectAlphaHelper()) return false;
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        if (this.isControllerScriptEditor(textarea)) return false;
        return textarea.dataset.displayField === "expression"
            && !String(textarea.dataset.cardId || "").trim();
    }

    getProjectAlphaHelperCompletionSnippets(textarea = null) {
        if (!this.isAlphaHelperAllowedForCodeEditor(textarea)) return [];
        return [
            "alphaHelper.increaseAlpha()",
            "alphaHelper.decreaseAlpha()",
            "alphaHelper.resetAlphaMin()",
            "alphaHelper.resetAlphaMax()",
            "alphaHelper.toggleAlpha(1.0)",
            "alphaHelper.doAlphaTo(0)",
            "alphaHelper.getCurrentAlpha()",
            "alphaHelper.over()",
            "alphaHelper.isZero()"
        ];
    }

    resolveCodeEditorControllerVars(cardId = "", treePathRaw = "") {
        const id = String(cardId || "").trim();
        if (!id) return [];
        const card = this.getCardById(id);
        if (!card) return [];
        const rawPath = String(treePathRaw || "").trim();
        if (rawPath) {
            try {
                const node = this.getShapeNodeByPath(card, JSON.parse(rawPath));
                if (node && Array.isArray(node.controllerVars)) return node.controllerVars;
            } catch (_) {
            }
        }
        return Array.isArray(card.controllerVars) ? card.controllerVars : [];
    }

    getCodeEditorScopeInfo(textarea) {
        const none = { allowRel: false, allowOrder: false, maxShapeDepth: -1, sequencedDepths: [] };
        if (!(textarea instanceof HTMLTextAreaElement)) return none;
        const cardId = String(textarea.dataset.cardId || "");
        if (!cardId) return none;
        const card = this.getCardById(cardId);
        if (!card) return none;
        if (this.isControllerScriptEditor(textarea)) {
            const levelFromRow = textarea.closest?.("[data-shape-level]")?.dataset?.shapeLevel;
            const rawLevel = textarea.dataset.shapeLevelIdx ?? levelFromRow;
            if (rawLevel !== undefined) {
                const levelIdx = Math.max(0, int(rawLevel));
                return this.getShapeScopeInfoByRuntimeLevel(card, levelIdx + 1);
            }
            return none;
        }
        // Scope detection should rely on stable index markers instead of field-value checks,
        // so preview/code-editor wrappers won't accidentally drop shapeRel* availability.
        if (
            textarea.dataset.shapeLevelIdx !== undefined
            || textarea.dataset.shapeLevelDisplayIdx !== undefined
            || textarea.dataset.shapeLevelDisplayField === "expression"
        ) {
            const levelFromRow = textarea.closest?.("[data-shape-level]")?.dataset?.shapeLevel;
            const idx = Math.max(1, int(textarea.dataset.shapeLevelIdx ?? levelFromRow ?? 1));
            return this.getShapeScopeInfoByRuntimeLevel(card, idx + 1);
        }
        if (textarea.dataset.cardShapeChildDisplayIdx !== undefined || textarea.dataset.cardShapeChildDisplayField === "expression") {
            return this.getShapeScopeInfoByRuntimeLevel(card, 1);
        }
        if (textarea.dataset.cardShapeDisplayIdx !== undefined || textarea.dataset.cardShapeDisplayField === "expression") {
            return this.getShapeScopeInfoByRuntimeLevel(card, 0);
        }
        return none;
    }

    isGrowthApiAllowedForCodeEditor(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) {
            return String(this.state?.compositionType || "") === "sequenced";
        }

        const cardId = String(textarea.dataset.cardId || "");
        if (!cardId) return String(this.state?.compositionType || "") === "sequenced";
        const card = this.getCardById(cardId);
        if (!card) return false;

        const levelFromRow = textarea.closest?.("[data-shape-level]")?.dataset?.shapeLevel;
        const rawLevel = textarea.dataset.shapeLevelIdx ?? levelFromRow;
        if (rawLevel !== undefined) {
            const levelIdx = Math.max(0, int(rawLevel));
            return this.getShapeCompositionTypeAtDepth(card, levelIdx + 1) === "sequenced_shape";
        }

        if (textarea.dataset.cardShapeChildDisplayIdx !== undefined || textarea.dataset.cardShapeChildDisplayField === "expression") {
            return this.getShapeCompositionTypeAtDepth(card, 1) === "sequenced_shape";
        }
        if (textarea.dataset.cardShapeDisplayIdx !== undefined || textarea.dataset.cardShapeDisplayField === "expression") {
            return this.getShapeCompositionTypeAtDepth(card, 0) === "sequenced_shape";
        }
        if (this.isControllerScriptEditor(textarea)) {
            return this.getShapeCompositionTypeAtDepth(card, 0) === "sequenced_shape";
        }
        return this.getShapeCompositionTypeAtDepth(card, 0) === "sequenced_shape";
    }

    getJsValidationAllowedIdentifiers(opts = {}) {
        const allowed = new Set();
        const allowGrowthApi = opts.allowGrowthApi !== false;
        for (const key of JS_LINT_GLOBALS) {
            if (!allowGrowthApi && (key === "addSingle" || key === "addMultiple")) continue;
            allowed.add(key);
        }
        const cardId = String(opts.cardId || "").trim();
        const treePath = String(opts.treePath || "").trim();
        if (opts.allowScaleHelper === true && this.hasManualProjectScaleHelper()) {
            allowed.add("scaleHelper");
        }
        if (opts.allowAlphaHelper === true && this.hasManualProjectAlphaHelper()) {
            allowed.add("alphaHelper");
        }
        const scope = (opts.scope && typeof opts.scope === "object") ? opts.scope : null;
        if (scope?.allowRel) allowed.add("rel");
        if (scope?.allowOrder) allowed.add("order");
        const scopeMaxShapeDepth = scope ? Number(scope.maxShapeDepth) : Number.NaN;
        const maxShapeDepth = Number.isFinite(scopeMaxShapeDepth)
            ? Math.max(-1, int(scopeMaxShapeDepth))
            : -1;
        const seqDepth = new Set(
            Array.isArray(scope?.sequencedDepths)
                ? scope.sequencedDepths.map((it) => int(it))
                : []
        );
        for (let i = 0; i <= maxShapeDepth; i++) {
            allowed.add(`shapeRel${i}`);
            if (seqDepth.has(i)) allowed.add(`shapeOrder${i}`);
        }
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        for (const v of this.resolveCodeEditorControllerVars(cardId, treePath)) {
            const name = String(v?.name || "").trim();
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) allowed.add(name);
        }
        return allowed;
    }

    validateJsExpressionSource(source, opts = {}) {
        const srcRaw = String(source || "").trim();
        if (!srcRaw) return { valid: true, message: "" };
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        try {
            new Function(
                "vars",
                "point",
                "particle",
                "rotateToPoint",
                "rotateAsAxis",
                "rotateToWithAngle",
                "addSingle",
                "addMultiple",
                "addPreTickAction",
                "thisAt",
                `with(vars){ ${src}\n }; return point;`
            );
        } catch (e) {
            return { valid: false, message: `语法错误: ${String(e?.message || e || "invalid script")}` };
        }
        if (opts.allowGrowthApi === false) {
            const disallowed = /\b(addSingle|addMultiple)\s*\(/.exec(src);
            if (disallowed && disallowed[1]) {
                return { valid: false, message: `Current scope does not allow ${disallowed[1]}()` };
            }
        }
        const allowed = this.getJsValidationAllowedIdentifiers(opts);
        const unknown = findFirstUnknownJsIdentifier(src, allowed);
        if (unknown) {
            return { valid: false, message: `未定义标识符: ${unknown}` };
        }
        return { valid: true, message: "" };
    }

    validateCodeEditorSource(textarea, source) {
        if (!(textarea instanceof HTMLTextAreaElement)) return { valid: true, message: "" };
        const isDisplayExpr = textarea.dataset.displayField === "expression";
        const isShapeDisplayExpr = textarea.dataset.cardShapeDisplayField === "expression";
        const isShapeChildDisplayExpr = textarea.dataset.cardShapeChildDisplayField === "expression";
        const isShapeLevelDisplayExpr = textarea.dataset.shapeLevelDisplayField === "expression";
        const isControllerScript = this.isControllerScriptEditor(textarea);
        if (!isDisplayExpr && !isShapeDisplayExpr && !isShapeChildDisplayExpr && !isShapeLevelDisplayExpr && !isControllerScript) {
            return { valid: true, message: "" };
        }
        const cardId = String(textarea.dataset.cardId || "");
        const treePath = String(textarea.dataset.treePath || "");
        const scope = this.getCodeEditorScopeInfo(textarea);
        const allowGrowthApi = this.isGrowthApiAllowedForCodeEditor(textarea);
        const allowScaleHelper = this.isScaleHelperAllowedForCodeEditor(textarea);
        const allowAlphaHelper = this.isAlphaHelperAllowedForCodeEditor(textarea);
        const result = this.validateJsExpressionSource(source, { cardId, treePath, scope, allowGrowthApi, allowScaleHelper, allowAlphaHelper });
        if (result.valid) return result;
        return {
            valid: false,
            message: `表达式存在问题，此表达式不生效${result.message ? ` ${result.message}` : ""}`
        };
    }

    buildCodeEditorApiDts(textarea, completions = []) {
        const cardId = String(textarea?.dataset?.cardId || "");
        const treePath = String(textarea?.dataset?.treePath || "");
        const scope = this.getCodeEditorScopeInfo(textarea);
        const allowGrowthApi = this.isGrowthApiAllowedForCodeEditor(textarea);
        const allowScaleHelper = this.isScaleHelperAllowedForCodeEditor(textarea);
        const allowAlphaHelper = this.isAlphaHelperAllowedForCodeEditor(textarea);
        const allowed = this.getJsValidationAllowedIdentifiers({ cardId, treePath, scope, allowGrowthApi, allowScaleHelper, allowAlphaHelper });
        const declared = new Map();
        const lines = [];
        const declareSymbol = (name, type = "any", mutable = false, opts = {}) => {
            const id = String(name || "").trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(id)) return;
            const prev = declared.get(id);
            if (!prev) {
                declared.set(id, { type, mutable: mutable === true });
                return;
            }
            if (mutable === true && opts.keepReadonly !== true) prev.mutable = true;
            if ((prev.type === "any" || opts.preferType === true) && type && type !== "any") prev.type = type;
        };

        const statusType = `{
  displayStatus: number;
  isDisable(): boolean;
  disable(): void;
  isEnable(): boolean;
  enable(): void;
  [key: string]: any;
}`;
        declareSymbol("Math", "Math");
        declareSymbol("PI", "number");
        // Runtime context values are writable in expression scope; use let to avoid false const diagnostics.
        declareSymbol("age", "number", true);
        declareSymbol("tick", "number", true);
        declareSymbol("tickCount", "number", true);
        declareSymbol("index", "number", true);
        declareSymbol("rel", "any", true);
        declareSymbol("order", "any", true);
        declareSymbol("axis", "any", true);
        declareSymbol("thisAt", "any", true);
        declareSymbol("particle", "any", true);
        declareSymbol("status", statusType, false, { keepReadonly: true });

        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            declareSymbol(name, "any", g?.mutable !== false);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            declareSymbol(name, "any", false);
        }
        for (const v of this.resolveCodeEditorControllerVars(cardId, treePath)) {
            const name = String(v?.name || "").trim();
            if (!name) continue;
            declareSymbol(name, "any", true);
        }
        lines.push("declare function rotateToPoint(...args: any[]): any;");
        lines.push("declare function rotateAsAxis(...args: any[]): any;");
        lines.push("declare function rotateToWithAngle(...args: any[]): any;");
        if (allowGrowthApi) {
            lines.push("declare function addSingle(...args: any[]): any;");
            lines.push("declare function addMultiple(...args: any[]): any;");
        }
        lines.push("declare function addPreTickAction(...args: any[]): any;");
        lines.push("declare function setReversedScaleOnCompositionStatus(...args: any[]): any;");
        if (allowScaleHelper) {
            lines.push("declare const scaleHelper: { doScale(...args: any[]): any; doScaleReversed(...args: any[]): any; };");
        }
        if (allowAlphaHelper) {
            lines.push("declare const alphaHelper: { increaseAlpha(...args: any[]): any; decreaseAlpha(...args: any[]): any; resetAlphaMin(...args: any[]): any; resetAlphaMax(...args: any[]): any; toggleAlpha(...args: any[]): any; doAlphaTo(...args: any[]): any; getCurrentAlpha(...args: any[]): any; over(...args: any[]): any; isZero(...args: any[]): any; };");
        }
        lines.push("declare function RelativeLocation(...args: any[]): any;");
        lines.push("declare namespace RelativeLocation { function yAxis(...args: any[]): any; }");
        lines.push("declare function Vec3(...args: any[]): any;");
        lines.push("declare function Vector3f(...args: any[]): any;");

        for (const name of Array.from(allowed).sort((a, b) => a.localeCompare(b))) {
            declareSymbol(name, "any", false);
        }
        for (const [name, meta] of declared.entries()) {
            lines.push(`declare ${meta.mutable ? "let" : "const"} ${name}: ${meta.type || "any"};`);
        }

        const reservedFn = new Set(["if", "for", "while", "switch", "catch", "new"]);
        const fnSet = new Set();
        const completionList = Array.isArray(completions) ? completions : [];
        for (const item of completionList) {
            const src = String(item?.insertText || item?.label || "").trim();
            const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(src);
            if (!m) continue;
            const fnName = String(m[1] || "");
            if (!fnName || reservedFn.has(fnName) || fnSet.has(fnName)) continue;
            fnSet.add(fnName);
            lines.push(`declare function ${fnName}(...args: any[]): any;`);
        }

        return `${lines.join("\n")}\n`;
    }

    buildCodeEditorLibs(textarea, completions = []) {
        return [
            {
                id: `composition-api-${String(textarea?.dataset?.codeTitle || "js")}`,
                name: "__composition_builder_api__.d.ts",
                content: this.buildCodeEditorApiDts(textarea, completions),
                enabled: true
            }
        ];
    }

    refreshCodeEditors() {
        const textareas = Array.from(document.querySelectorAll("textarea[data-code-editor]"));
        const alive = new Set(textareas);
        for (const [ta, editor] of this.codeEditors.entries()) {
            if (!alive.has(ta) || !document.body.contains(ta)) {
                try {
                    editor.dispose();
                } catch {
                }
                this.codeEditors.delete(ta);
            }
        }
        for (const ta of textareas) {
            const completions = this.getCodeEditorCompletions(ta);
            const libs = this.buildCodeEditorLibs(ta, completions);
            const title = String(ta.dataset.codeTitle || "代码编辑");
            const validate = (source) => this.validateCodeEditorSource(ta, source);
            const existing = this.codeEditors.get(ta);
            if (existing) {
                existing.setCompletions(completions);
                existing.setValidator(validate);
                existing.setLibs(libs);
                continue;
            }
            const editor = new InlineCodeEditor({
                textarea: ta,
                title,
                completions,
                validate,
                libs
            });
            this.codeEditors.set(ta, editor);
        }
    }

    getCodeEditorCompletions(textarea) {
        const isControllerScript = this.isControllerScriptEditor(textarea);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const scopeInfo = this.getCodeEditorScopeInfo(textarea);
        const allowGrowthApi = this.isGrowthApiAllowedForCodeEditor(textarea);
        const base = isControllerScript
            ? [
                { label: "if (...) { ... }", insertText: "if ($0) {\\n    \\n}", detail: "条件分支", priority: 220 },
                { label: "addSingle()", insertText: "addSingle()", detail: "生长 API", priority: 230 },
                { label: "addMultiple(n)", insertText: "addMultiple($0)", detail: "生长 API", priority: 230 },
                { label: "color = Vector3f()", insertText: "color = Vector3f($0)", detail: "粒子颜色", priority: 255 },
                { label: "size = 0.2", insertText: "size = $0", detail: "粒子尺寸", priority: 255 },
                { label: "particleAlpha = 1.0", insertText: "particleAlpha = $0", detail: "粒子透明度", priority: 255 },
                { label: "currentAge = 0", insertText: "currentAge = $0", detail: "粒子年龄", priority: 250 },
                { label: "textureSheet = 0", insertText: "textureSheet = $0", detail: "贴图序号", priority: 250 },
                { label: "particle.particleColor = Vector3f()", insertText: "particle.particleColor = Vector3f($0)", detail: "粒子颜色", priority: 250 },
                { label: "particle.particleSize = 0.2", insertText: "particle.particleSize = $0", detail: "粒子尺寸", priority: 250 },
                { label: "particle.particleAlpha = 1.0", insertText: "particle.particleAlpha = $0", detail: "粒子透明度", priority: 250 },
                { label: "status.displayStatus = 2", insertText: "status.displayStatus = $0", detail: "Composition 生命周期", priority: 258 },
                { label: "status.isDisable()", insertText: "status.isDisable()", detail: "Composition 生命周期", priority: 258 },
                { label: "status.disable()", insertText: "status.disable()", detail: "Composition 生命周期", priority: 258 },
                { label: "status.isEnable()", insertText: "status.isEnable()", detail: "Composition 生命周期", priority: 258 },
                { label: "status.enable()", insertText: "status.enable()", detail: "Composition 生命周期", priority: 258 },
                { label: `this@${projectClass}.status.displayStatus`, insertText: `this@${projectClass}.status.displayStatus`, detail: "Composition 生命周期", priority: 257 },
                { label: `this@${projectClass}.status.isDisable()`, insertText: `this@${projectClass}.status.isDisable()`, detail: "Composition 生命周期", priority: 257 },
                { label: `this@${projectClass}.status.disable()`, insertText: `this@${projectClass}.status.disable()`, detail: "Composition 生命周期", priority: 257 },
                { label: `this@${projectClass}.status.isEnable()`, insertText: `this@${projectClass}.status.isEnable()`, detail: "Composition 生命周期", priority: 257 },
                { label: `this@${projectClass}.status.enable()`, insertText: `this@${projectClass}.status.enable()`, detail: "Composition 生命周期", priority: 257 },
                { label: "RelativeLocation(x, y, z)", insertText: "RelativeLocation($0)", detail: "向量构造", priority: 220 },
                { label: "Vec3(x, y, z)", insertText: "Vec3($0)", detail: "向量构造", priority: 220 },
                { label: "Vector3f(x, y, z)", insertText: "Vector3f($0)", detail: "向量构造", priority: 220 },
                { label: "PI", detail: "数学常量", priority: 210 },
                { label: "tickCount", detail: "当前 tick（同 tick）", priority: 250 },
                { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 180 },
                { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 180 },
                { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 180 },
                { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 }
            ]
            : [
                { label: "if (...) { ... }", insertText: "if ($0) {\\n    \\n}", detail: "条件分支", priority: 140 },
                { label: "rotateToPoint(to)", insertText: "rotateToPoint($0)", detail: "Display API", priority: 260 },
                { label: "rotateAsAxis(angle)", insertText: "rotateAsAxis($0)", detail: "Display API", priority: 260 },
                { label: "rotateToWithAngle(to, angle)", insertText: "rotateToWithAngle($0, 0.05)", detail: "Display API", priority: 260 },
                { label: "addSingle()", insertText: "addSingle()", detail: "生长 API", priority: 260 },
                { label: "addMultiple(n)", insertText: "addMultiple($0)", detail: "生长 API", priority: 260 },
                { label: "addPreTickAction(() => {})", insertText: "addPreTickAction(() => {\\n    $0\\n})", detail: "控制器 API", priority: 220 },
                { label: "RelativeLocation(x, y, z)", insertText: "RelativeLocation($0)", detail: "向量构造", priority: 225 },
                { label: "Vec3(x, y, z)", insertText: "Vec3($0)", detail: "向量构造", priority: 225 },
                { label: "Vector3f(x, y, z)", insertText: "Vector3f($0)", detail: "向量构造", priority: 225 },
                { label: "RelativeLocation.yAxis()", insertText: "RelativeLocation.yAxis()", detail: "轴向量", priority: 225 },
                { label: "setReversedScaleOnCompositionStatus(comp)", insertText: "setReversedScaleOnCompositionStatus($0)", detail: "Scale API", priority: 215 },
                { label: "particle.particleAlpha", detail: "粒子属性", priority: 240 },
                { label: "particle.particleColor", detail: "粒子属性", priority: 240 },
                { label: "particle.particleSize", detail: "粒子属性", priority: 240 },
                { label: "age", detail: "当前 age", priority: 250 },
                { label: "tick", detail: "当前 tick", priority: 250 },
                { label: "tickCount", detail: "当前 tick（同 tick）", priority: 250 },
                { label: "index", detail: "点索引", priority: 250 },
                { label: "axis", detail: "当前轴向向量", priority: 248 },
                { label: "axis = RelativeLocation(x, y, z)", insertText: "axis = RelativeLocation($0)", detail: "更新当前轴向", priority: 248 },
                { label: "status.displayStatus", detail: "当前 Composition 状态", priority: 252 },
                { label: "status.isDisable()", insertText: "status.isDisable()", detail: "Composition state", priority: 252 },
                { label: "status.disable()", insertText: "status.disable()", detail: "Composition state", priority: 252 },
                { label: "status.isEnable()", insertText: "status.isEnable()", detail: "Composition state", priority: 252 },
                { label: "status.enable()", insertText: "status.enable()", detail: "Composition state", priority: 252 },
                { label: `this@${projectClass}.status.displayStatus`, insertText: `this@${projectClass}.status.displayStatus`, detail: "Composition state (qualified)", priority: 251 },
                { label: `this@${projectClass}.status.isDisable()`, insertText: `this@${projectClass}.status.isDisable()`, detail: "Composition state (qualified)", priority: 251 },
                { label: `this@${projectClass}.status.disable()`, insertText: `this@${projectClass}.status.disable()`, detail: "Composition state (qualified)", priority: 251 },
                { label: `this@${projectClass}.status.isEnable()`, insertText: `this@${projectClass}.status.isEnable()`, detail: "Composition state (qualified)", priority: 251 },
                { label: `this@${projectClass}.status.enable()`, insertText: `this@${projectClass}.status.enable()`, detail: "Composition state (qualified)", priority: 251 },
                { label: "PI", detail: "数学常量", priority: 230 },
                { label: "Math.sin(x)", insertText: "Math.sin($0)", detail: "数学函数", priority: 180 },
                { label: "Math.cos(x)", insertText: "Math.cos($0)", detail: "数学函数", priority: 180 },
                { label: "Math.abs(x)", insertText: "Math.abs($0)", detail: "数学函数", priority: 180 },
                { label: "Math.min(a, b)", insertText: "Math.min($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 },
                { label: "Math.max(a, b)", insertText: "Math.max($0, )", cursorOffset: 11, detail: "数学函数", priority: 180 }
            ];
        const isProjectDisplayExpr = !isControllerScript
            && String(textarea?.dataset?.displayField || "") === "expression"
            && !String(textarea?.dataset?.cardId || "").trim();
        if (isProjectDisplayExpr && this.hasManualProjectScaleHelper()) {
            base.push(
                {
                    label: "scaleHelper.doScale()",
                    insertText: "scaleHelper.doScale()",
                    detail: "项目缩放助手 API（手动模式）",
                    priority: 262
                },
                {
                    label: "scaleHelper.doScaleReversed()",
                    insertText: "scaleHelper.doScaleReversed()",
                    detail: "项目缩放助手 API（手动模式）",
                    priority: 262
                }
            );
        }
        if (isProjectDisplayExpr && this.hasManualProjectAlphaHelper()) {
            base.push(
                {
                    label: "alphaHelper.increaseAlpha()",
                    insertText: "alphaHelper.increaseAlpha()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 263
                },
                {
                    label: "alphaHelper.decreaseAlpha()",
                    insertText: "alphaHelper.decreaseAlpha()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 263
                },
                {
                    label: "alphaHelper.resetAlphaMin()",
                    insertText: "alphaHelper.resetAlphaMin()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 262
                },
                {
                    label: "alphaHelper.resetAlphaMax()",
                    insertText: "alphaHelper.resetAlphaMax()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 262
                },
                {
                    label: "alphaHelper.toggleAlpha(alpha)",
                    insertText: "alphaHelper.toggleAlpha($0)",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 261
                },
                {
                    label: "alphaHelper.doAlphaTo(tick)",
                    insertText: "alphaHelper.doAlphaTo($0)",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 261
                },
                {
                    label: "alphaHelper.getCurrentAlpha()",
                    insertText: "alphaHelper.getCurrentAlpha()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 261
                },
                {
                    label: "alphaHelper.over()",
                    insertText: "alphaHelper.over()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 260
                },
                {
                    label: "alphaHelper.isZero()",
                    insertText: "alphaHelper.isZero()",
                    detail: "项目透明度助手 API（手动模式）",
                    priority: 260
                }
            );
        }
        if (!allowGrowthApi) {
            for (let i = base.length - 1; i >= 0; i--) {
                const raw = String(base[i]?.insertText || base[i]?.label || "");
                if (/^addSingle\s*\(/.test(raw) || /^addMultiple\s*\(/.test(raw)) {
                    base.splice(i, 1);
                }
            }
        }
        const scopeMaxDepthRaw = Number(scopeInfo.maxShapeDepth);
        const hasScopedShapeVars = scopeInfo.allowRel
            || scopeInfo.allowOrder
            || (Number.isFinite(scopeMaxDepthRaw) && int(scopeMaxDepthRaw) >= 0);
        if (hasScopedShapeVars) {
            if (scopeInfo.allowRel) {
                base.push({ label: "rel", detail: "当前层的父级 rel", priority: 248 });
            }
            if (scopeInfo.allowOrder) {
                base.push({ label: "order", detail: "当前层的父级 order（Sequenced）", priority: 248 });
            }
            const scopeMaxDepth = scopeMaxDepthRaw;
            const maxDepth = Number.isFinite(scopeMaxDepth)
                ? Math.max(-1, int(scopeMaxDepth))
                : -1;
            const seqDepth = new Set(
                Array.isArray(scopeInfo.sequencedDepths)
                    ? scopeInfo.sequencedDepths.map((it) => int(it))
                    : []
            );
            for (let d = 0; d <= maxDepth; d++) {
                base.push({ label: `shapeRel${d}`, detail: `shape ${d} 的父级 rel`, priority: 246 - Math.min(d, 8) });
                if (seqDepth.has(d)) {
                    base.push({ label: `shapeOrder${d}`, detail: `shape ${d} 的父级 order（Sequenced）`, priority: 245 - Math.min(d, 8) });
                }
            }
        }

        const vars = [];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            if (!name) continue;
            vars.push({ label: name, detail: "全局变量", priority: 210 });
            vars.push({
                label: `this@${projectClass}.${name}`,
                insertText: `this@${projectClass}.${name}`,
                detail: "全局变量（限定访问）",
                priority: 208
            });
            if (String(g.type || "").trim() === "Vec3") {
                vars.push({ label: `${name}.asRelative()`, detail: "Vec3 -> Relative", priority: 205 });
            }
        }
        if (!isControllerScript) {
            for (const c of this.state.globalConsts) {
                const name = String(c.name || "").trim();
                if (!name) continue;
                vars.push({ label: name, detail: "全局常量", priority: 205 });
            }
        }

        const cardVars = [];
        const cardId = String(textarea.dataset.cardId || "");
        const treePath = String(textarea.dataset.treePath || "");
        for (const it of this.resolveCodeEditorControllerVars(cardId, treePath)) {
            const name = String(it.name || "").trim();
            if (!name) continue;
            cardVars.push({ label: name, detail: "控制器局部变量", priority: 245 });
        }
        return mergeCompletionGroups(base, vars, cardVars);
    }

    }

    for (const key of Object.getOwnPropertyNames(ExpressionEditorMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = ExpressionEditorMixin.prototype[key];
    }
}
