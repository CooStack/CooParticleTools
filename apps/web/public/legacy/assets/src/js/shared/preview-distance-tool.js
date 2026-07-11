const STYLE_ID = "preview-distance-tool-style";
const CONTEXT_DRAG_PX = 6;
const CONTEXT_SUPPRESS_MS = 260;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.preview-distance-tool-overlay {
    position: fixed;
    inset: 0;
    z-index: 10040;
    pointer-events: none;
}
.preview-distance-tool-overlay.hidden {
    display: none;
}
.preview-distance-tool-overlay-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
}
.preview-distance-tool-overlay-line {
    stroke: rgba(99, 195, 255, 0.92);
    stroke-width: 2;
    stroke-linecap: round;
    filter: drop-shadow(0 0 6px rgba(99, 195, 255, 0.35));
}
.preview-distance-tool-marker {
    position: absolute;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    margin-top: -6px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.92);
    box-shadow: 0 0 0 3px rgba(11, 16, 23, 0.36), 0 0 12px rgba(99, 195, 255, 0.42);
    background: rgba(99, 195, 255, 0.95);
}
.preview-distance-tool-marker.anchor {
    background: rgba(255, 196, 77, 0.96);
    border-color: rgba(255,255,255,0.98);
}
.preview-distance-tool-marker.hidden {
    display: none;
}
.preview-distance-tool-label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(11, 16, 23, 0.92);
    color: #eef6ff;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    white-space: nowrap;
    box-shadow: 0 12px 24px rgba(0,0,0,0.24);
}
.preview-distance-tool-label.hidden {
    display: none;
}
`;
    document.head.appendChild(style);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function safeNum(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
}

function formatNum(value) {
    const next = safeNum(value);
    if (Math.abs(next) < 1e-9) return "0";
    const fixed = next.toFixed(4);
    return fixed.replace(/\.?0+$/, "");
}

function clonePoint(point) {
    if (!point) return null;
    return {
        x: safeNum(point.x),
        y: safeNum(point.y),
        z: safeNum(point.z),
        label: String(point.label || "")
    };
}

function normalizeResolvedPoint(value, fallbackClientX = NaN, fallbackClientY = NaN) {
    if (!value) return null;
    const rawPoint = (value.point && typeof value.point === "object") ? value.point : value;
    const point = clonePoint(rawPoint);
    if (!point) return null;
    return {
        point,
        clientX: Number.isFinite(value.clientX) ? Number(value.clientX) : fallbackClientX,
        clientY: Number.isFinite(value.clientY) ? Number(value.clientY) : fallbackClientY,
        label: String(value.label || point.label || ""),
        source: String(value.source || "")
    };
}

function computeAbResult(pointA, pointB) {
    const a = clonePoint(pointA);
    const b = clonePoint(pointB);
    const dx = safeNum(b?.x) - safeNum(a?.x);
    const dy = safeNum(b?.y) - safeNum(a?.y);
    const dz = safeNum(b?.z) - safeNum(a?.z);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { pointA: a, pointB: b, dx, dy, dz, distance };
}

function isRightLike(ev) {
    return !!ev && (
        ev.button === 2
        || ((ev.buttons & 2) === 2)
        || (ev.button === 0 && ev.ctrlKey)
    );
}

export function createPreviewDistanceTool(options = {}) {
    ensureStyle();

    const {
        canvas = null,
        showToast = null,
        resolvePointFromEvent = null,
        projectPointToClient = null,
        attachContextMenu = true,
        shouldOpenContextMenu = null,
        isBlocked = null
    } = options;

    if (!(canvas instanceof Element) || typeof resolvePointFromEvent !== "function") {
        return {
            isOpen: () => false,
            isActive: () => false,
            startMeasureMode() {},
            toggleMeasureMode() {},
            cancel() {},
            clear() {},
            openPanelAt() {},
            openPanelAtCanvasCenter() {},
            togglePanelAtCanvasCenter() {},
            startMode() {},
            destroy() {}
        };
    }

    const state = {
        active: false,
        anchorResolved: null,
        hoverResolved: null,
        lockedResolved: null,
        hoverResult: null,
        lockedResult: null
    };

    let overlayRaf = 0;
    let rightGesture = null;
    let suppressContextMenuUntil = 0;

    const overlay = document.createElement("div");
    overlay.className = "preview-distance-tool-overlay hidden";
    overlay.innerHTML = `
        <svg class="preview-distance-tool-overlay-svg" aria-hidden="true">
            <line class="preview-distance-tool-overlay-line" x1="0" y1="0" x2="0" y2="0"></line>
        </svg>
        <div class="preview-distance-tool-marker anchor hidden" aria-hidden="true"></div>
        <div class="preview-distance-tool-marker current hidden" aria-hidden="true"></div>
        <div class="preview-distance-tool-label hidden" aria-hidden="true"></div>
    `;
    document.body.appendChild(overlay);

    const overlayLine = overlay.querySelector(".preview-distance-tool-overlay-line");
    const anchorMarker = overlay.querySelector(".preview-distance-tool-marker.anchor");
    const currentMarker = overlay.querySelector(".preview-distance-tool-marker.current");
    const distanceLabel = overlay.querySelector(".preview-distance-tool-label");

    function emitToast(message, type = "info") {
        if (!message || typeof showToast !== "function") return;
        try {
            showToast(message, type);
        } catch {
        }
    }

    function isToolBlocked() {
        if (typeof isBlocked !== "function") return false;
        try {
            return !!isBlocked();
        } catch {
            return false;
        }
    }

    function resolveScreenPoint(resolved) {
        if (!resolved?.point) return null;
        if (typeof projectPointToClient === "function") {
            try {
                const projected = projectPointToClient(resolved.point);
                if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
                    return { x: Number(projected.x), y: Number(projected.y) };
                }
            } catch {
            }
        }
        if (Number.isFinite(resolved.clientX) && Number.isFinite(resolved.clientY)) {
            return { x: Number(resolved.clientX), y: Number(resolved.clientY) };
        }
        return null;
    }

    function positionMarker(marker, screen) {
        if (!marker) return;
        if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
            marker.classList.add("hidden");
            return;
        }
        marker.style.left = `${Math.round(screen.x)}px`;
        marker.style.top = `${Math.round(screen.y)}px`;
        marker.classList.remove("hidden");
    }

    function updateDistanceLabel(fromScreen, toScreen, result) {
        if (!distanceLabel) return;
        if (!fromScreen || !toScreen || !result) {
            distanceLabel.classList.add("hidden");
            return;
        }
        const mx = (fromScreen.x + toScreen.x) * 0.5;
        const my = (fromScreen.y + toScreen.y) * 0.5;
        distanceLabel.textContent = formatNum(result.distance);
        distanceLabel.style.left = `${Math.round(mx)}px`;
        distanceLabel.style.top = `${Math.round(my)}px`;
        distanceLabel.classList.remove("hidden");
    }

    function updateOverlay() {
        overlay.classList.toggle("hidden", !state.active);
        if (!state.active) {
            anchorMarker.classList.add("hidden");
            currentMarker.classList.add("hidden");
            distanceLabel.classList.add("hidden");
            overlayLine.style.display = "none";
            return;
        }

        const fromResolved = state.anchorResolved;
        const toResolved = state.lockedResolved || state.hoverResolved;
        const currentResult = state.lockedResult || state.hoverResult;
        const fromScreen = resolveScreenPoint(fromResolved);
        const toScreen = resolveScreenPoint(toResolved);

        positionMarker(anchorMarker, fromScreen);
        positionMarker(currentMarker, toScreen);
        updateDistanceLabel(fromScreen, toScreen, currentResult);

        if (fromScreen && toScreen) {
            overlayLine.style.display = "";
            overlayLine.setAttribute("x1", `${fromScreen.x}`);
            overlayLine.setAttribute("y1", `${fromScreen.y}`);
            overlayLine.setAttribute("x2", `${toScreen.x}`);
            overlayLine.setAttribute("y2", `${toScreen.y}`);
        } else {
            overlayLine.style.display = "none";
        }
    }

    function stopOverlayLoop() {
        if (!overlayRaf) return;
        cancelAnimationFrame(overlayRaf);
        overlayRaf = 0;
    }

    function tickOverlay() {
        overlayRaf = 0;
        updateOverlay();
        if (state.active) overlayRaf = requestAnimationFrame(tickOverlay);
    }

    function ensureOverlayLoop() {
        if (overlayRaf || !state.active) return;
        overlayRaf = requestAnimationFrame(tickOverlay);
    }

    function render() {
        updateOverlay();
        if (state.active) ensureOverlayLoop();
        else stopOverlayLoop();
    }

    function resetState() {
        state.anchorResolved = null;
        state.hoverResolved = null;
        state.lockedResolved = null;
        state.hoverResult = null;
        state.lockedResult = null;
    }

    function resolvePoint(ev) {
        try {
            return normalizeResolvedPoint(
                resolvePointFromEvent(ev),
                Number(ev?.clientX),
                Number(ev?.clientY)
            );
        } catch {
            return null;
        }
    }

    function cancel(silent = false) {
        if (!state.active) return false;
        state.active = false;
        resetState();
        render();
        if (!silent) emitToast("已取消测距", "info");
        return true;
    }

    function startMeasureMode() {
        state.active = true;
        resetState();
        render();
        emitToast("测距已开启：左键选 A 点，再选 B 点", "info");
    }

    function toggleMeasureMode() {
        if (state.active) {
            cancel(true);
            return;
        }
        startMeasureMode();
    }

    function updateHover(ev) {
        if (!state.active || isToolBlocked()) return;
        if (ev && ev.buttons) return;
        const resolved = resolvePoint(ev);
        state.hoverResolved = resolved;
        if (!resolved?.point || !state.anchorResolved?.point) {
            state.hoverResult = null;
            render();
            return;
        }
        state.hoverResult = computeAbResult(state.anchorResolved.point, resolved.point);
        render();
    }

    function confirmPoint(ev) {
        if (!state.active || isToolBlocked()) return false;
        const resolved = resolvePoint(ev);
        if (!resolved?.point) {
            emitToast("当前没有吸附到可测距的点", "info");
            return false;
        }
        if (!state.anchorResolved?.point || state.lockedResolved?.point) {
            state.anchorResolved = resolved;
            state.hoverResolved = resolved;
            state.lockedResolved = null;
            state.hoverResult = null;
            state.lockedResult = null;
            render();
            emitToast("已记录 A 点", "info");
            return true;
        }
        state.lockedResolved = resolved;
        state.hoverResolved = resolved;
        state.lockedResult = computeAbResult(state.anchorResolved.point, resolved.point);
        state.hoverResult = state.lockedResult;
        render();
        return true;
    }

    function updateRightGesture(ev) {
        if (!rightGesture || !ev) return;
        if (rightGesture.pointerId !== undefined && ev.pointerId !== rightGesture.pointerId) return;
        const dx = Number(ev.clientX) - rightGesture.startX;
        const dy = Number(ev.clientY) - rightGesture.startY;
        if (Math.hypot(dx, dy) > CONTEXT_DRAG_PX) rightGesture.moved = true;
    }

    function handlePointerDown(ev) {
        if (!attachContextMenu || !isRightLike(ev)) return;
        rightGesture = {
            pointerId: ev.pointerId,
            startX: Number(ev.clientX) || 0,
            startY: Number(ev.clientY) || 0,
            moved: false
        };
    }

    function handlePointerMoveGesture(ev) {
        updateRightGesture(ev);
    }

    function handlePointerUp(ev) {
        if (!attachContextMenu || !rightGesture || !ev) return;
        if (rightGesture.pointerId !== undefined && ev.pointerId !== rightGesture.pointerId) return;
        updateRightGesture(ev);
        if (rightGesture.moved) {
            suppressContextMenuUntil = performance.now() + CONTEXT_SUPPRESS_MS;
        }
        rightGesture = null;
    }

    function shouldSuppressContextMenuByGesture(ev) {
        if (!attachContextMenu) return false;
        if (performance.now() < suppressContextMenuUntil) return true;
        if (!rightGesture || !ev) return false;
        if (rightGesture.pointerId !== undefined && ev.pointerId !== rightGesture.pointerId) return false;
        updateRightGesture(ev);
        return !!rightGesture.moved;
    }

    function handleContextMenu(ev) {
        if (state.active) {
            ev.preventDefault();
            cancel(true);
            return;
        }
        if (!attachContextMenu || isToolBlocked()) return;
        if (shouldSuppressContextMenuByGesture(ev)) {
            ev.preventDefault();
            return;
        }
        if (typeof shouldOpenContextMenu === "function") {
            let next = false;
            try {
                next = !!shouldOpenContextMenu(ev);
            } catch {
                next = false;
            }
            if (!next) return;
        }
        ev.preventDefault();
        startMeasureMode();
    }

    const handleCanvasClick = (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        if (!state.active) return;
        confirmPoint(ev);
    };

    canvas.addEventListener("pointerdown", handlePointerDown, true);
    canvas.addEventListener("pointermove", handlePointerMoveGesture, true);
    canvas.addEventListener("pointermove", updateHover, true);
    canvas.addEventListener("pointerup", handlePointerUp, true);
    canvas.addEventListener("pointercancel", handlePointerUp, true);
    canvas.addEventListener("click", handleCanvasClick, true);
    canvas.addEventListener("contextmenu", handleContextMenu, true);

    render();

    return {
        isOpen: () => state.active,
        isActive: () => state.active,
        startMeasureMode,
        toggleMeasureMode,
        cancel: () => cancel(true),
        clear: () => cancel(true),
        openPanelAt: startMeasureMode,
        openPanelAtCanvasCenter: startMeasureMode,
        togglePanelAtCanvasCenter: toggleMeasureMode,
        startMode: startMeasureMode,
        destroy() {
            stopOverlayLoop();
            canvas.removeEventListener("pointerdown", handlePointerDown, true);
            canvas.removeEventListener("pointermove", handlePointerMoveGesture, true);
            canvas.removeEventListener("pointermove", updateHover, true);
            canvas.removeEventListener("pointerup", handlePointerUp, true);
            canvas.removeEventListener("pointercancel", handlePointerUp, true);
            canvas.removeEventListener("click", handleCanvasClick, true);
            canvas.removeEventListener("contextmenu", handleContextMenu, true);
            if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
        }
    };
}
