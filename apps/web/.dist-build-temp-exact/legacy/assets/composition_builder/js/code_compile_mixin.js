export function installCodeCompileMethods(CompositionBuilderApp, deps = {}) {
    const int = (typeof deps.int === "function")
        ? deps.int
        : ((v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return n < 0 ? Math.ceil(n) : Math.floor(n);
        });

    CompositionBuilderApp.prototype.isCodeEditorSourceFieldTarget = function isCodeEditorSourceFieldTarget(target) {
        if (!(target instanceof HTMLTextAreaElement)) return false;
        if (!target.dataset.codeEditor) return false;
        if (target.dataset.displayField === "expression") return true;
        if (target.dataset.cardShapeDisplayField === "expression") return true;
        if (target.dataset.cardShapeChildDisplayField === "expression") return true;
        if (target.dataset.shapeLevelDisplayField === "expression") return true;
        if (target.dataset.cactField === "script") return true;
        if (target.dataset.treeNodeCactField === "script") return true;
        return false;
    };

    CompositionBuilderApp.prototype.resolveCodeEditorCompileBinding = function resolveCodeEditorCompileBinding(target) {
        if (!this.isCodeEditorSourceFieldTarget(target)) return null;
        const parseIndex = (raw) => {
            const n = Number(raw);
            return Number.isFinite(n) ? int(n) : -1;
        };
        if (target.dataset.displayField === "expression") {
            const actionIdx = parseIndex(target.dataset.displayIdx);
            if (actionIdx < 0) return null;
            const list = Array.isArray(this.state.displayActions) ? this.state.displayActions : [];
            const action = list[actionIdx];
            if (!action) return null;
            return {
                kind: "display_expression",
                compileKey: this.makePreviewDisplayActionCompileKey("display", "", -1, actionIdx),
                source: String(action.expression || "")
            };
        }
        const cardId = String(target.dataset.cardId || "");
        const card = cardId ? this.getCardById(cardId) : null;
        if (!card) return null;
        if (target.dataset.cardShapeDisplayField === "expression") {
            const actionIdx = parseIndex(target.dataset.cardShapeDisplayIdx);
            if (actionIdx < 0) return null;
            const list = Array.isArray(card.shapeDisplayActions) ? card.shapeDisplayActions : [];
            const action = list[actionIdx];
            if (!action) return null;
            return {
                kind: "display_expression",
                compileKey: this.makePreviewDisplayActionCompileKey("shape_display", card.id, 0, actionIdx),
                source: String(action.expression || "")
            };
        }
        if (target.dataset.treeNodeDisplayField === "expression") {
            const actionIdx = parseIndex(target.dataset.treeNodeDisplayIdx);
            if (actionIdx < 0) return null;
            const node = this.getCurrentViewNode(card);
            if (!node) return null;
            const list = Array.isArray(node.displayActions) ? node.displayActions : [];
            const action = list[actionIdx];
            if (!action) return null;
            const depth = (card.viewPath || []).length + 1;
            return {
                kind: "display_expression",
                compileKey: this.makePreviewDisplayActionCompileKey("shape_level_display", card.id, depth, actionIdx),
                source: String(action.expression || "")
            };
        }
        if (target.dataset.cactField === "script") {
            const actionIdx = parseIndex(target.dataset.cactIdx);
            if (actionIdx < 0) return null;
            const list = Array.isArray(card.controllerActions) ? card.controllerActions : [];
            const action = list[actionIdx];
            if (!action) return null;
            return {
                kind: "controller_script",
                compileKey: this.makePreviewControllerScriptCompileKey(card.id, actionIdx),
                source: String(action.script || "")
            };
        }
        if (target.dataset.treeNodeCactField === "script") {
            const actionIdx = parseIndex(target.dataset.treeNodeCactIdx);
            if (actionIdx < 0) return null;
            let node = null;
            const rawTreePath = String(target.dataset.treePath || "").trim();
            if (rawTreePath) {
                try {
                    node = this.getShapeNodeByPath(card, JSON.parse(rawTreePath));
                } catch {
                }
            }
            if (!node) node = this.getCurrentViewNode(card);
            if (!node) return null;
            const list = Array.isArray(node.controllerActions) ? node.controllerActions : [];
            const action = list[actionIdx];
            if (!action) return null;
            const sourceId = String(node.id || card.id || "");
            if (!sourceId) return null;
            return {
                kind: "controller_script",
                compileKey: this.makePreviewControllerScriptCompileKey(sourceId, actionIdx),
                source: String(action.script || "")
            };
        }
        return null;
    };

    CompositionBuilderApp.prototype.compileCodeEditorTarget = function compileCodeEditorTarget(target, opts = {}) {
        const binding = this.resolveCodeEditorCompileBinding(target);
        if (!binding) return { handled: false, ok: true, usedFallback: false, message: "" };
        const source = String(binding.source || "");
        const force = opts.force === true;
        const check = this.validateCodeEditorSource(target, source);
        if (!check.valid) {
            const message = String(check.message || "表达式存在问题，此表达式不生效。");
            let marked = null;
            if (binding.kind === "controller_script") {
                if (typeof this.markPreviewControllerCompileFailure === "function") {
                    marked = this.markPreviewControllerCompileFailure(binding.compileKey, source, message);
                }
            } else if (typeof this.markPreviewDisplayExpressionCompileFailure === "function") {
                marked = this.markPreviewDisplayExpressionCompileFailure(binding.compileKey, source, message);
            }
            return {
                handled: true,
                ok: false,
                usedFallback: marked?.usedFallback === true,
                message
            };
        }
        let result = null;
        if (binding.kind === "controller_script") {
            if (typeof this.compilePreviewControllerScript === "function") {
                result = this.compilePreviewControllerScript(binding.compileKey, source, { force });
            }
        } else if (typeof this.compilePreviewDisplayExpression === "function") {
            result = this.compilePreviewDisplayExpression(binding.compileKey, source, { force });
        }
        if (!result) return { handled: true, ok: true, usedFallback: false, message: "" };
        const ok = result.ok === true;
        const usedFallback = result.usedFallback === true;
        const message = String(result.message || "");
        if (ok) return { handled: true, ok: true, usedFallback: false, message: "" };
        const fallbackPrefix = usedFallback ? "编译失败，已回退到上一次成功结果。" : "编译失败。";
        return {
            handled: true,
            ok: false,
            usedFallback,
            message: message ? `${fallbackPrefix} ${message}` : fallbackPrefix
        };
    };

    CompositionBuilderApp.prototype.compileAllCodeEditorSources = function compileAllCodeEditorSources(opts = {}) {
        const force = opts.force === true;
        const showToast = opts.showToast === true;
        let summary = { total: 0, compiled: 0, failed: 0, fallback: 0 };
        if (typeof this.compilePreviewScriptsFromState === "function") {
            const result = this.compilePreviewScriptsFromState({ force });
            if (result && typeof result === "object") summary = result;
        }
        let applyOpts = { rebuildPreview: true };
        if (this.pendingCodeApplyOpts instanceof Map && this.pendingCodeApplyOpts.size) {
            for (const pending of this.pendingCodeApplyOpts.values()) {
                applyOpts = this.mergeMutateOptions(applyOpts, pending || {});
            }
            this.pendingCodeApplyOpts.clear();
        }
        this.afterValueMutate(applyOpts);
        if (showToast) {
            const total = Math.max(0, int(summary.total || 0));
            const compiled = Math.max(0, int(summary.compiled || 0));
            const failed = Math.max(0, int(summary.failed || 0));
            const fallback = Math.max(0, int(summary.fallback || 0));
            if (total <= 0) {
                this.showToast("没有可编译的表达式脚本。", "info");
            } else if (failed > 0 && fallback > 0) {
                this.showToast(`编译完成：${compiled} 成功，${failed} 失败（${fallback} 已回退上次成功结果）`, "info");
            } else if (failed > 0) {
                this.showToast(`编译失败：${failed} 处表达式脚本有问题。`, "error");
            } else {
                this.showToast(`编译成功：${compiled}/${total}`, "success");
            }
        }
        return summary;
    };

    CompositionBuilderApp.prototype.queueCodeEditorRefresh = function queueCodeEditorRefresh(target, opts = {}) {
        if (!this.isCodeEditorSourceFieldTarget(target)) return false;
        if (!(this.pendingCodeApplyOpts instanceof Map)) this.pendingCodeApplyOpts = new Map();
        const merged = this.mergeMutateOptions(
            this.pendingCodeApplyOpts.get(target) || null,
            Object.assign({ rebuildPreview: true }, opts || {})
        );
        this.pendingCodeApplyOpts.set(target, merged);
        this.scheduleSave();
        return true;
    };

    CompositionBuilderApp.prototype.flushCodeEditorRefresh = function flushCodeEditorRefresh(target, opts = {}) {
        if (!this.isCodeEditorSourceFieldTarget(target)) return false;
        const force = opts.force === true;
        const showToast = opts.showToast === true;
        const pendingMap = (this.pendingCodeApplyOpts instanceof Map) ? this.pendingCodeApplyOpts : new Map();
        const applyOpts = pendingMap.get(target) || null;
        if (!applyOpts && !force) return false;
        if (applyOpts) pendingMap.delete(target);
        this.pendingCodeApplyOpts = pendingMap;
        const compileResult = this.compileCodeEditorTarget(target, { force });
        if (compileResult.handled && !compileResult.ok && !compileResult.usedFallback) {
            if (showToast) this.showToast(compileResult.message || "编译失败。", "error");
            this.scheduleSave();
            return true;
        }
        if (showToast && compileResult.handled && !compileResult.ok && compileResult.usedFallback) {
            this.showToast(compileResult.message || "编译失败，已回退到上一次成功结果。", "info");
        } else if (showToast && compileResult.handled && compileResult.ok) {
            this.showToast("编译成功。", "success");
        }
        this.afterValueMutate(applyOpts || { rebuildPreview: true });
        return true;
    };

    CompositionBuilderApp.prototype.onCodeEditorFocusOut = function onCodeEditorFocusOut(e) {
        const target = e?.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        this.flushCodeEditorRefresh(target);
    };
}
