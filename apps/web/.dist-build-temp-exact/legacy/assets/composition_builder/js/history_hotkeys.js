const NON_TEXT_INPUT_TYPES = new Set([
    "button", "checkbox", "color", "file", "hidden", "image",
    "radio", "range", "reset", "submit"
]);

export function isCompositionTextEditingTarget(target, activeElement, options = {}) {
    const ElementCtor = options.ElementCtor || globalThis.Element;
    const isTextEditingNode = (node) => {
        if (typeof ElementCtor !== "function" || !(node instanceof ElementCtor) || typeof node.closest !== "function") {
            return false;
        }
        if (node.closest(".hidden, [hidden], [aria-hidden='true']")) return false;
        if (node.closest("textarea, [contenteditable='true'], [role='textbox'], [role='searchbox']")) return true;
        const input = node.closest("input");
        if (input) return !NON_TEXT_INPUT_TYPES.has(String(input.type || "text").toLowerCase());
        return !!node.closest(".editor-shell-monaco, .editor-monaco-host, .monaco-editor");
    };
    return isTextEditingNode(target)
        || isTextEditingNode(activeElement)
        || options.hasFocusedMonaco?.() === true;
}

export function handleCompositionHistoryShortcut(event, options = {}) {
    if (options.modalOpen || options.textEditing) return false;
    const action = options.undoMatched ? "undo" : (options.redoMatched ? "redo" : "");
    if (!action) return false;
    event?.preventDefault?.();
    if (action === "undo") options.undo?.();
    else options.redo?.();
    return true;
}
