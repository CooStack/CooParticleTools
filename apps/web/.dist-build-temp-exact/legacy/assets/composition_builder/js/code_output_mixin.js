export function installCodeOutputMethods(CompositionBuilderApp, deps = {}) {
    const {
        sanitizeKotlinClassName,
        sanitizeFileBase,
        relExpr,
        emitBuilderKotlinFromState
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installCodeOutputMethods requires CompositionBuilderApp");
    }
    if (typeof emitBuilderKotlinFromState !== "function") {
        throw new Error("installCodeOutputMethods requires emitBuilderKotlinFromState dependency");
    }

    class CodeOutputMixin {
        renderKotlin(text) {
            const raw = String(text || "");
            const highlighter = globalThis.CodeHighlighter?.highlightKotlin;
            if (typeof highlighter === "function") {
                this.dom.kotlinOut.innerHTML = highlighter(raw);
            } else {
                this.dom.kotlinOut.textContent = raw;
            }
        }

        generateCodeAndRender(force = false) {
            if (!force && !this.state.settings.realtimeCode) return;
            this.currentKotlin = this.generateKotlin();
            this.renderKotlin(this.currentKotlin);
        }

        async copyCode() {
            if (!this.currentKotlin) this.generateCodeAndRender(true);
            const text = this.currentKotlin || "";
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement("textarea");
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    ta.remove();
                }
                this.showToast("代码已复制", "success");
            } catch (e) {
                this.showToast(`复制失败: ${e?.message || e}`, "error");
            }
        }

        async downloadCode() {
            if (!this.currentKotlin) this.generateCodeAndRender(true);
            const cls = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
            const filename = `${sanitizeFileBase(cls) || "NewComposition"}.kt`;
            const result = await this.saveTextWithPicker({
                filename,
                text: this.currentKotlin || "",
                mime: "text/plain",
                description: "Kotlin 文件",
                extensions: [".kt"]
            });
            if (result.ok) this.showToast("代码已下载", "success");
            else if (result.canceled) this.showToast("已取消下载", "info");
            else this.showToast(`下载失败: ${result.error?.message || result.error || "未知错误"}`, "error");
        }

        emitBuilderExpr(card) {
            if (card.bindMode === "point") {
                return `PointsBuilder().addPoint(${relExpr(card.point.x, card.point.y, card.point.z)})`;
            }
            return this.emitBuilderExprFromState(card.builderState);
        }

        emitBuilderExprFromState(builderState) {
            return emitBuilderKotlinFromState(builderState);
        }
    }

    for (const key of Object.getOwnPropertyNames(CodeOutputMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = CodeOutputMixin.prototype[key];
    }
}
