export function shouldUseFocusedPointColor(focusedNodeId, selectedNodeIds) {
    if (!focusedNodeId || !selectedNodeIds || typeof selectedNodeIds.has !== "function") return false;
    return selectedNodeIds.has(focusedNodeId);
}

export function selectionRectIntersects(selectionRect, cardRect) {
    if (!selectionRect || !cardRect) return false;
    if (!(Number(cardRect.width) > 0) || !(Number(cardRect.height) > 0)) return false;
    return Number(cardRect.right) >= Number(selectionRect.left)
        && Number(cardRect.left) <= Number(selectionRect.right)
        && Number(cardRect.bottom) >= Number(selectionRect.top)
        && Number(cardRect.top) <= Number(selectionRect.bottom);
}

export function isCardVisibleForBoxSelection(card, root) {
    if (!card) return false;
    let current = card;
    while (current && current !== root) {
        if (current.hidden) return false;
        const classes = current.classList;
        if (classes?.contains?.("hidden")) return false;
        if (classes?.contains?.("pb-tree-children") && classes.contains("collapsed")) return false;
        if (current !== card && classes?.contains?.("card") && classes.contains("collapsed")) return false;
        current = current.parentElement;
    }
    return current === root;
}
