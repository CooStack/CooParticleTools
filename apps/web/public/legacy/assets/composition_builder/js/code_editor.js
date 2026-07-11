import { loadMonaco } from "../../code_tip/js/monacoLoader.js";
import { createLanguageService } from "../../code_tip/js/languageJsTs.js";

const MONACO_UI_FIX_STYLE_ID = "codetip-inline-monaco-ui-fix";
let INLINE_CODE_EDITOR_SEQ = 0;
const INLINE_RUNTIME_IDENTIFIER_SET = new Set([
    "PI",
    "age",
    "tick",
    "tickCount",
    "index",
    "rel",
    "order",
    "axis",
    "alphaHelper",
    "scaleHelper",
    "status",
    "particle",
    "thisAt"
]);

function ensureMonacoUiFixStyle() {
    if (typeof document === "undefined") return;
    if (document.getElementById(MONACO_UI_FIX_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = MONACO_UI_FIX_STYLE_ID;
    style.textContent = `
.editor-shell .monaco-editor .suggest-widget,
.editor-shell .monaco-editor .suggest-widget *,
.monaco-editor .suggest-widget,
.monaco-editor .suggest-widget * {
    text-transform: none !important;
    letter-spacing: normal !important;
    word-spacing: normal !important;
    text-indent: 0 !important;
    text-shadow: none !important;
    filter: none !important;
}
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .monaco-icon-label-container,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .monaco-icon-name-container,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-highlighted-label,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-highlighted-label .highlight,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-name,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-description,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .details-label,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .monaco-icon-label-container,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .monaco-icon-name-container,
.monaco-editor .suggest-widget .monaco-list-row .monaco-highlighted-label,
.monaco-editor .suggest-widget .monaco-list-row .monaco-highlighted-label .highlight,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-name,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-description,
.monaco-editor .suggest-widget .monaco-list-row .details-label {
    opacity: 1 !important;
    transform: none !important;
}
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-name,
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-description,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-name,
.monaco-editor .suggest-widget .monaco-list-row .monaco-icon-label .label-description {
    color: var(--text, #e8eef7) !important;
    font-family: "Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace !important;
    font-size: 12px !important;
    line-height: 20px !important;
}
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .details-label,
.monaco-editor .suggest-widget .monaco-list-row .details-label {
    color: var(--muted, #a9b7cc) !important;
    font-family: "Cascadia Mono", "JetBrains Mono", Consolas, "Courier New", monospace !important;
    font-size: 11px !important;
    line-height: 18px !important;
}
.editor-shell .monaco-editor .suggest-widget .monaco-list-row .monaco-highlighted-label .highlight,
.monaco-editor .suggest-widget .monaco-list-row .monaco-highlighted-label .highlight {
    color: inherit !important;
    background: transparent !important;
}`;
    document.head.appendChild(style);
}

function escHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

function toCompletionObjects(items) {
    const arr = Array.isArray(items) ? items : [];
    return arr
        .map((it) => {
            if (!it) return null;
            if (typeof it === "string") {
                return {
                    label: it,
                    insertText: it,
                    detail: "",
                    documentation: "",
                    priority: 100,
                    cursorOffset: null
                };
            }
            const label = String(it.label || it.insertText || "").trim();
            if (!label) return null;
            const p = Number(it.priority);
            return {
                label,
                insertText: String(it.insertText || label),
                detail: String(it.detail || ""),
                documentation: String(it.documentation || ""),
                kind: String(it.kind || ""),
                priority: Number.isFinite(p) ? p : 100,
                cursorOffset: Number.isFinite(Number(it.cursorOffset)) ? Number(it.cursorOffset) : null
            };
        })
        .filter(Boolean);
}

export function mergeCompletionGroups(...groups) {
    const map = new Map();
    for (const group of groups) {
        for (const it of toCompletionObjects(group)) {
            const key = String(it.label || "");
            const prev = map.get(key);
            if (!prev || (Number(it.priority) || 0) > (Number(prev.priority) || 0)) {
                map.set(key, it);
            }
        }
    }
    return Array.from(map.values());
}

function inferKind(item) {
    const rawKind = String(item?.kind || "").trim().toLowerCase();
    if (rawKind) return rawKind;
    const label = String(item?.label || "");
    if (/\(/.test(label)) return "function";
    if (/^[A-Z][A-Za-z0-9_]*$/.test(label)) return "class";
    return "variable";
}

function toSortText(priority, label) {
    const p = Number.isFinite(Number(priority)) ? Number(priority) : 0;
    const inv = String(Math.max(0, 9999 - Math.max(0, Math.min(9999, Math.round(p))))).padStart(4, "0");
    return `${inv}-${String(label || "").toLowerCase()}`;
}

function toSnippetInsertText(rawInsertText, cursorOffset = null) {
    const src = String(rawInsertText || "");
    if (/\$(?:0|[1-9]\d*|\{\d+(?::[^}]*)?\})/.test(src)) return { snippet: true, insertText: src };
    if (Number.isFinite(Number(cursorOffset))) {
        const at = Math.max(0, Math.min(src.length, Number(cursorOffset)));
        return {
            snippet: true,
            insertText: `${src.slice(0, at)}$0${src.slice(at)}`
        };
    }
    return {
        snippet: false,
        insertText: src
    };
}

function getCompletionFilterContext(model, position) {
    const lineNumber = Math.max(1, Number(position?.lineNumber) || 1);
    const column = Math.max(1, Number(position?.column) || 1);
    const lineContent = String(model?.getLineContent?.(lineNumber) || "");
    const left = lineContent.slice(0, Math.max(0, column - 1));
    const tokenMatch = left.match(/[A-Za-z_][A-Za-z0-9_@.]*$/);
    const token = tokenMatch ? String(tokenMatch[0] || "") : "";
    const startColumn = token ? Math.max(1, column - token.length) : column;
    return {
        token,
        lineNumber,
        startColumn,
        endColumn: column
    };
}

function filterCompletionItemsByToken(items, token) {
    const list = Array.isArray(items) ? items : [];
    const rawToken = String(token || "").trim();
    if (!rawToken) return list;
    const dotIdx = rawToken.lastIndexOf(".");
    if (dotIdx <= 0) return list;
    const ownerPrefixLower = `${rawToken.slice(0, dotIdx)}.`.toLowerCase();
    const memberPrefixLower = rawToken.slice(dotIdx + 1).toLowerCase();
    return list.filter((item) => {
        const candidates = [
            String(item?.insertText || ""),
            String(item?.label || "")
        ];
        for (const candidate of candidates) {
            const valueLower = candidate.toLowerCase();
            if (!valueLower.startsWith(ownerPrefixLower)) continue;
            const memberLower = valueLower.slice(ownerPrefixLower.length);
            if (!memberPrefixLower || memberLower.startsWith(memberPrefixLower)) return true;
        }
        return false;
    });
}

function parseValidationMessagePosition(source, message) {
    const m = /未定义标识符\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(String(message || ""));
    if (!m) return null;
    const target = String(m[1] || "");
    if (!target) return null;
    const re = new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const match = re.exec(String(source || ""));
    if (!match) return null;
    const idx = Number(match.index || 0);
    const prefix = String(source || "").slice(0, idx);
    const lines = prefix.split("\n");
    const line = Math.max(1, lines.length);
    const column = Math.max(1, String(lines[lines.length - 1] || "").length + 1);
    return {
        startLineNumber: line,
        endLineNumber: line,
        startColumn: column,
        endColumn: column + target.length
    };
}

function normalizeValidationResult(result, source) {
    if (!result) return { valid: true, message: "", markerRange: null };
    const ok = !(result.valid === false || result.ok === false || result.error);
    if (ok) return { valid: true, message: "", markerRange: null };
    const message = String(result.message || result.error || "表达式存在问题");
    return {
        valid: false,
        message,
        markerRange: parseValidationMessagePosition(source, message)
    };
}

function dispatchBubbledEvent(el, type) {
    try {
        if (type === "focus" || type === "blur" || type === "focusin" || type === "focusout") {
            el.dispatchEvent(new FocusEvent(type, { bubbles: type === "focusin" || type === "focusout" }));
            return;
        }
    } catch (_) {
        // Ignore FocusEvent constructor failures and fallback.
    }
    el.dispatchEvent(new Event(type, { bubbles: type === "input" || type === "change" || type === "focusin" || type === "focusout" }));
}

function normalizeLibEntries(libs) {
    const arr = Array.isArray(libs) ? libs : [];
    return arr
        .filter((it) => it && typeof it.content === "string")
        .map((it, index) => ({
            id: String(it.id || it.name || `inline-lib-${index + 1}`),
            name: String(it.name || `inline-lib-${index + 1}.d.ts`),
            content: String(it.content || ""),
            enabled: it.enabled !== false
        }));
}

function isSuppressedInlineLanguageDiagnostic(problem) {
    const msg = String(problem?.message || "").trim();
    const missingName = /^Cannot find name ['"]([^'"]+)['"]/.exec(msg);
    if (missingName && INLINE_RUNTIME_IDENTIFIER_SET.has(String(missingName[1] || "").trim())) {
        return true;
    }
    return false;
}

function buildApiDtsFromCompletions(completions) {
    const reserved = new Set([
        "break", "case", "catch", "class", "const", "continue", "debugger", "default",
        "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
        "function", "if", "import", "in", "instanceof", "let", "new", "null", "return",
        "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void",
        "while", "with", "yield", "await", "async"
    ]);
    const vars = new Set();
    const fns = new Set();
    const list = toCompletionObjects(completions);
    for (const item of list) {
        const raw = String(item.insertText || item.label || "").trim();
        if (!raw) continue;
        const first = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(raw);
        if (first && first[0]) vars.add(first[0]);
        const call = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(raw);
        if (call && call[1]) fns.add(call[1]);
        const labelCall = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(String(item.label || "").trim());
        if (labelCall && labelCall[1]) fns.add(labelCall[1]);
    }
    const lines = [];
    lines.push("declare const PI: number;");
    lines.push("declare let age: number;");
    lines.push("declare let tick: number;");
    lines.push("declare let tickCount: number;");
    lines.push("declare let index: number;");
    lines.push("declare let rel: any;");
    lines.push("declare let order: any;");
    lines.push("declare let axis: any;");
    lines.push("declare let alphaHelper: any;");
    lines.push("declare let scaleHelper: any;");
    lines.push("declare const status: any;");
    lines.push("declare let particle: any;");
    lines.push("declare let thisAt: any;");
    for (const name of Array.from(vars).sort((a, b) => a.localeCompare(b))) {
        if (reserved.has(name)) continue;
        if (/^(Math|PI|age|tick|tickCount|index|status|particle|thisAt|rel|order|axis|alphaHelper|scaleHelper)$/.test(name)) continue;
        // Use let to avoid false "assignment to constant" diagnostics for project symbols.
        lines.push(`declare let ${name}: any;`);
    }
    for (const fn of Array.from(fns).sort((a, b) => a.localeCompare(b))) {
        if (reserved.has(fn)) continue;
        if (/^(Math|if|for|while|switch|catch|new)$/.test(fn)) continue;
        lines.push(`declare function ${fn}(...args: any[]): any;`);
    }
    return `${lines.join("\n")}\n`;
}

export class InlineCodeEditor {
    constructor(options = {}) {
        const {
            textarea,
            title = "代码编辑",
            onChange = () => {},
            completions = [],
            validate = null,
            libs = [],
            compact = false,
            singleLine = false,
            showToolbar = null
        } = options;

        if (!(textarea instanceof HTMLTextAreaElement)) {
            throw new Error("InlineCodeEditor requires a textarea");
        }

        this.textarea = textarea;
        this.title = String(title || "代码编辑");
        this.onChange = typeof onChange === "function" ? onChange : () => {};
        this.validate = typeof validate === "function" ? validate : null;
        this.completions = mergeCompletionGroups(completions);
        this.libs = normalizeLibEntries(libs);
        this.compact = compact === true;
        this.singleLine = singleLine === true;
        this.showToolbar = typeof showToolbar === "boolean" ? showToolbar : !this.compact;
        this.inlineLibScope = `inline-${++INLINE_CODE_EDITOR_SEQ}`;
        this.disposed = false;
        this.monaco = null;
        this.editor = null;
        this.model = null;
        this.languageService = null;
        this.completionRegistration = null;
        this.languageDiagnostics = [];
        this.customValidationResult = { valid: true, message: "", markerRange: null };
        this.syncingFromModel = false;
        this.syncingFromSource = false;
        this.changeLock = false;
        this.disposables = [];
        this.monacoReady = false;
        this.monacoLoadError = null;

        this.buildDOM();
        this.bindSourceFallback();
        this.initMonacoAsync();
    }

    buildDOM() {
        const field = this.textarea.closest(".field") || this.textarea.parentElement;
        const hostParent = this.textarea.parentElement;
        const hostNext = this.textarea.nextSibling;

        this.shellEl = document.createElement("div");
        this.shellEl.className = "editor-shell editor-shell-monaco editor-loading";
        if (this.compact) this.shellEl.classList.add("editor-shell-compact");

        this.toolbarEl = document.createElement("div");
        this.toolbarEl.className = "editor-toolbar";

        const titleEl = document.createElement("div");
        titleEl.className = "editor-title";
        titleEl.textContent = this.title;

        const rightEl = document.createElement("div");
        rightEl.className = "editor-toolbar-right";

        const hintEl = document.createElement("div");
        hintEl.className = "editor-hint";
        hintEl.textContent = "Monaco / CodeTip";

        rightEl.appendChild(hintEl);
        this.toolbarEl.appendChild(titleEl);
        this.toolbarEl.appendChild(rightEl);

        this.errorEl = document.createElement("div");
        this.errorEl.className = "editor-error hidden";

        this.bodyEl = document.createElement("div");
        this.bodyEl.className = "editor-body";

        this.monacoHostEl = document.createElement("div");
        this.monacoHostEl.className = "editor-monaco-host";
        this.bodyEl.appendChild(this.monacoHostEl);

        this.textarea.classList.add("editor-source-hidden");
        this.bodyEl.appendChild(this.textarea);

        if (this.showToolbar) this.shellEl.appendChild(this.toolbarEl);
        this.shellEl.appendChild(this.errorEl);
        this.shellEl.appendChild(this.bodyEl);

        if (field) {
            const labelSpan = field.querySelector(":scope > span");
            if (labelSpan) labelSpan.remove();
            field.classList.add("editor-field");
        }

        if (hostParent) {
            hostParent.insertBefore(this.shellEl, hostNext || null);
        } else if (field) {
            field.appendChild(this.shellEl);
        }
    }

    bindSourceFallback() {
        this.sourceInputHandler = () => {
            if (this.syncingFromModel) return;
            this.syncModelFromSource();
            this.runValidation();
        };
        this.textarea.addEventListener("input", this.sourceInputHandler);
    }

    async initMonacoAsync() {
        try {
            const monaco = await loadMonaco();
            if (this.disposed) return;
            this.monaco = monaco;
            this.createMonacoEditor();
            this.monacoReady = true;
            this.shellEl.classList.remove("editor-loading");
            this.runValidation();
        } catch (error) {
            if (this.disposed) return;
            this.monacoLoadError = error instanceof Error ? error : new Error(String(error || "Unknown Monaco error"));
            this.shellEl.classList.remove("editor-loading");
            this.showFallbackError(`CodeTip 加载失败：${this.monacoLoadError.message}`);
            this.enablePlainTextareaFallback();
        }
    }

    createMonacoEditor() {
        const monaco = this.monaco;
        ensureMonacoUiFixStyle();
        const isLight = String(document.body?.dataset?.theme || "").startsWith("light");
        const modelUri = monaco.Uri.parse(`inmemory://code-tip-inline/${Date.now()}-${Math.random().toString(16).slice(2)}.js`);
        this.model = monaco.editor.createModel(String(this.textarea.value || ""), "javascript", modelUri);

        this.editor = monaco.editor.create(this.monacoHostEl, {
            model: this.model,
            language: "javascript",
            theme: isLight ? "vs" : "vs-dark",
            automaticLayout: true,
            lineNumbers: this.compact ? "off" : "on",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 4,
            insertSpaces: true,
            detectIndentation: false,
            wordWrap: this.singleLine ? "off" : "off",
            fontFamily: "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace",
            fontSize: 12,
            lineHeight: this.compact ? 18 : 19,
            suggestFontSize: 12,
            suggestLineHeight: 20,
            fixedOverflowWidgets: true,
            inlineSuggest: { enabled: false },
            suggest: {
                showStatusBar: false,
                preview: false
            },
            smoothScrolling: true,
            quickSuggestions: {
                comments: true,
                strings: true,
                other: true
            },
            suggestOnTriggerCharacters: true,
            parameterHints: { enabled: true },
            hover: { enabled: true },
            bracketPairColorization: { enabled: true },
            glyphMargin: !this.compact,
            folding: !this.compact,
            lineDecorationsWidth: this.compact ? 0 : 10,
            overviewRulerLanes: this.compact ? 0 : 2,
            scrollbar: this.compact
                ? {
                    vertical: "hidden",
                    horizontal: "hidden",
                    alwaysConsumeMouseWheel: false
                }
                : undefined,
            padding: this.compact
                ? { top: 7, bottom: 7 }
                : undefined
        });

        this.languageService = createLanguageService({
            monaco,
            language: "javascript",
            model: this.model,
            libs: []
        });

        const builtApiDts = buildApiDtsFromCompletions(this.completions);
        const mergedLibs = normalizeLibEntries([
            { id: `inline-api-${this.inlineLibScope}`, name: `__inline_api__-${this.inlineLibScope}.d.ts`, content: builtApiDts, enabled: true },
            ...this.libs
        ]);
        this.languageService.setExtraLibs(this.inlineLibScope, mergedLibs);

        this.completionRegistration = this.languageService.registerCompletionProvider({
            provideCompletionItems: ({ model, position }) => {
                const context = getCompletionFilterContext(model, position);
                const range = {
                    startLineNumber: context.lineNumber,
                    endLineNumber: context.lineNumber,
                    startColumn: context.startColumn,
                    endColumn: context.endColumn
                };
                const list = filterCompletionItemsByToken(toCompletionObjects(this.completions), context.token);
                const suggestions = list.map((item) => {
                    const insert = toSnippetInsertText(item.insertText || item.label, item.cursorOffset);
                    return {
                        label: item.label,
                        kind: inferKind(item),
                        detail: item.detail || "",
                        documentation: item.documentation || "",
                        insertText: insert.insertText,
                        snippet: insert.snippet,
                        sortText: toSortText(item.priority, item.label),
                        range
                    };
                });
                return { suggestions };
            }
        });

        const diagnosticsSubscription = this.languageService.observeDiagnostics((problems) => {
            this.languageDiagnostics = Array.isArray(problems) ? problems : [];
            this.refreshErrorUi();
        });
        this.disposables.push(diagnosticsSubscription);

        this.disposables.push(
            this.editor.onDidChangeModelContent(() => {
                if (this.changeLock) return;
                this.changeLock = true;
                try {
                    const value = this.editor.getValue();
                    this.syncingFromModel = true;
                    this.textarea.value = value;
                    dispatchBubbledEvent(this.textarea, "input");
                    this.onChange(value);
                    this.runValidation();
                } finally {
                    this.syncingFromModel = false;
                    this.changeLock = false;
                }
            })
        );

        this.disposables.push(
            this.editor.onDidBlurEditorWidget(() => {
                dispatchBubbledEvent(this.textarea, "change");
                dispatchBubbledEvent(this.textarea, "blur");
                dispatchBubbledEvent(this.textarea, "focusout");
                this.runValidation();
            })
        );

        if (this.singleLine) {
            this.disposables.push(
                this.editor.onKeyDown((ev) => {
                    if (ev.keyCode === monaco.KeyCode.Enter) {
                        ev.preventDefault();
                        this.editor.trigger("keyboard", "closeSuggestWidget", {});
                        this.editor.getAction("hideSuggestWidget")?.run?.();
                    }
                })
            );
        }

        this.disposables.push(
            this.editor.onDidFocusEditorWidget(() => {
                dispatchBubbledEvent(this.textarea, "focus");
                dispatchBubbledEvent(this.textarea, "focusin");
            })
        );
    }

    enablePlainTextareaFallback() {
        this.textarea.classList.remove("editor-source-hidden");
        this.textarea.classList.remove("hidden");
        this.textarea.classList.add("editor-textarea-fallback");
        this.monacoHostEl.classList.add("hidden");
    }

    showFallbackError(message) {
        this.errorEl.classList.remove("hidden");
        this.errorEl.textContent = String(message || "CodeTip 加载失败");
        this.shellEl.classList.add("editor-invalid");
    }

    syncModelFromSource() {
        if (!this.editor || !this.model || this.syncingFromSource) return;
        if (typeof this.editor.hasTextFocus === "function" && this.editor.hasTextFocus()) return;
        const sourceValue = String(this.textarea.value || "");
        if (sourceValue === this.editor.getValue()) return;
        this.syncingFromSource = true;
        try {
            const prevPos = this.editor.getPosition();
            const fullRange = this.model.getFullModelRange();
            this.editor.executeEdits("codetip-sync-source", [{
                range: fullRange,
                text: sourceValue,
                forceMoveMarkers: true
            }]);
            if (prevPos) {
                const line = Math.max(1, Math.min(prevPos.lineNumber, this.model.getLineCount()));
                const col = Math.max(1, Math.min(prevPos.column, this.model.getLineMaxColumn(line)));
                this.editor.setPosition({ lineNumber: line, column: col });
            }
        } finally {
            this.syncingFromSource = false;
        }
    }

    setCompletions(items) {
        this.completions = mergeCompletionGroups(items);
        if (this.languageService) {
            const builtApiDts = buildApiDtsFromCompletions(this.completions);
            const mergedLibs = normalizeLibEntries([
                { id: `inline-api-${this.inlineLibScope}`, name: `__inline_api__-${this.inlineLibScope}.d.ts`, content: builtApiDts, enabled: true },
                ...this.libs
            ]);
            this.languageService.setExtraLibs(this.inlineLibScope, mergedLibs);
        }
        this.runValidation();
    }

    setValidator(validate) {
        this.validate = typeof validate === "function" ? validate : null;
        this.runValidation();
    }

    setLibs(libs) {
        this.libs = normalizeLibEntries(libs);
        if (this.languageService) {
            const builtApiDts = buildApiDtsFromCompletions(this.completions);
            const mergedLibs = normalizeLibEntries([
                { id: `inline-api-${this.inlineLibScope}`, name: `__inline_api__-${this.inlineLibScope}.d.ts`, content: builtApiDts, enabled: true },
                ...this.libs
            ]);
            this.languageService.setExtraLibs(this.inlineLibScope, mergedLibs);
        }
        this.runValidation();
    }

    renderHighlight() {
        this.syncModelFromSource();
    }

    runValidation() {
        const source = this.editor ? this.editor.getValue() : String(this.textarea.value || "");
        let result = { valid: true, message: "", markerRange: null };
        if (typeof this.validate === "function") {
            try {
                result = normalizeValidationResult(this.validate(source), source);
            } catch (error) {
                result = {
                    valid: false,
                    message: String(error?.message || error || "表达式存在问题"),
                    markerRange: null
                };
            }
        }
        this.customValidationResult = result;
        this.applyCustomMarkers();
        this.refreshErrorUi();
        return result.valid;
    }

    applyCustomMarkers() {
        if (!this.monaco || !this.model) return;
        if (this.customValidationResult.valid) {
            this.monaco.editor.setModelMarkers(this.model, "codetip-inline-custom", []);
            return;
        }
        const src = this.editor ? this.editor.getValue() : String(this.textarea.value || "");
        const fallbackRange = {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 1,
            endColumn: Math.max(2, Math.min(120, src.length + 1))
        };
        const range = this.customValidationResult.markerRange || fallbackRange;
        this.monaco.editor.setModelMarkers(this.model, "codetip-inline-custom", [
            {
                severity: this.monaco.MarkerSeverity.Error,
                message: this.customValidationResult.message || "表达式存在问题",
                ...range
            }
        ]);
    }

    refreshErrorUi() {
        if (this.disposed) return;
        let message = "";
        let invalid = false;
        if (!this.customValidationResult.valid) {
            message = this.customValidationResult.message || "表达式存在问题";
            invalid = true;
        } else {
            const firstErr = this.languageDiagnostics.find((it) => String(it?.severity || "").toLowerCase() === "error" && !isSuppressedInlineLanguageDiagnostic(it));
            if (firstErr) {
                message = `语法/类型错误: ${String(firstErr.message || "")}`;
                invalid = true;
            }
        }
        if (message) {
            this.errorEl.classList.remove("hidden");
            this.errorEl.innerHTML = escHtml(message);
        } else {
            this.errorEl.classList.add("hidden");
            this.errorEl.textContent = "";
        }
        this.shellEl.classList.toggle("editor-invalid", !!invalid);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;

        this.textarea.removeEventListener("input", this.sourceInputHandler);

        for (const d of this.disposables) {
            try {
                d?.dispose?.();
            } catch (_) {
            }
        }
        this.disposables = [];

        try {
            this.completionRegistration?.dispose?.();
        } catch (_) {
        }
        this.completionRegistration = null;

        try {
            this.languageService?.dispose?.();
        } catch (_) {
        }
        this.languageService = null;

        try {
            this.editor?.dispose?.();
        } catch (_) {
        }
        this.editor = null;

        try {
            this.model?.dispose?.();
        } catch (_) {
        }
        this.model = null;

        this.textarea.classList.remove("editor-source-hidden");
        this.textarea.classList.remove("editor-textarea-fallback");

        if (this.shellEl?.parentNode) {
            this.shellEl.parentNode.removeChild(this.shellEl);
        }
    }
}
