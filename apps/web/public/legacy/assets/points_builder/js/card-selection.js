export function shouldUseFocusedPointColor(focusedNodeId, selectedNodeIds) {
    if (!focusedNodeId || !selectedNodeIds || typeof selectedNodeIds.has !== "function") return false;
    return selectedNodeIds.has(focusedNodeId);
}

export function mergeBezierNodeSelectionMaps(current, incoming, additive = false) {
    const normalize = (source) => {
        const out = new Map();
        if (!(source instanceof Map)) return out;
        for (const [ownerId, indices] of source.entries()) {
            if (!ownerId) continue;
            const bucket = new Set();
            const values = indices instanceof Set ? indices : (Array.isArray(indices) ? indices : []);
            for (const index of values) {
                if (Number.isInteger(index) && index >= 0) bucket.add(index);
            }
            if (bucket.size) out.set(ownerId, bucket);
        }
        return out;
    };

    const next = additive ? normalize(current) : new Map();
    for (const [ownerId, indices] of normalize(incoming).entries()) {
        if (!additive) {
            next.set(ownerId, indices);
            continue;
        }
        const bucket = next.get(ownerId) || new Set();
        for (const index of indices) {
            if (bucket.has(index)) bucket.delete(index);
            else bucket.add(index);
        }
        if (bucket.size) next.set(ownerId, bucket);
        else next.delete(ownerId);
    }
    return next;
}

export function resolveBezierBoxSelectionLevel(cardOwnerIds, bezierNodesByOwner) {
    const nodeOwners = new Set();
    if (bezierNodesByOwner instanceof Map) {
        for (const [ownerId, indices] of bezierNodesByOwner.entries()) {
            const count = indices instanceof Set ? indices.size : (Array.isArray(indices) ? indices.length : 0);
            if (ownerId && count > 0) nodeOwners.add(ownerId);
        }
    }
    if (!nodeOwners.size) return "cards";
    for (const ownerId of Array.isArray(cardOwnerIds) ? cardOwnerIds : []) {
        if (ownerId && !nodeOwners.has(ownerId)) return "cards";
    }
    return "nodes";
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
