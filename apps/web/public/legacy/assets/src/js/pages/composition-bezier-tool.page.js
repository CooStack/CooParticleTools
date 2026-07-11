(() => {
    const q = new URLSearchParams(location.search);
    const bezierMode = q.get("mode") === "angle_ease" ? "angle_ease" : "scale";
    const isScaleBezierMode = bezierMode === "scale";
    const num = (v, fb = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fb;
    };
    const int = (v, fb = 0) => Math.trunc(num(v, fb));
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const state = {
        min: num(q.get("min"), 0.01),
        max: num(q.get("max"), 4.0),
        tick: isScaleBezierMode ? Math.max(1, int(q.get("tick"), 18)) : 1,
        c1x: num(q.get("c1x"), 0.17106),
        c1y: num(q.get("c1y"), 0.49026),
        c1z: num(q.get("c1z"), 0.0),
        c2x: num(q.get("c2x"), -0.771523),
        c2y: num(q.get("c2y"), -0.116883),
        c2z: num(q.get("c2z"), 0.0),
        snapSEY: q.get("snapSEY") === "1"
    };

    const el = {
        chart: document.getElementById("chart"),
        status: document.getElementById("status"),
        lblXRange: document.getElementById("lblXRange"),
        inpMin: document.getElementById("inpMin"),
        inpMax: document.getElementById("inpMax"),
        inpTick: document.getElementById("inpTick"),
        inpC1x: document.getElementById("inpC1x"),
        inpC1y: document.getElementById("inpC1y"),
        inpC1z: document.getElementById("inpC1z"),
        inpC2x: document.getElementById("inpC2x"),
        inpC2y: document.getElementById("inpC2y"),
        inpC2z: document.getElementById("inpC2z"),
        btnResetLinear: document.getElementById("btnResetLinear"),
        chkSnapSEY: document.getElementById("chkSnapSEY")
    };

    const tickFieldLabel = el.inpTick?.closest("label");
    if (tickFieldLabel) tickFieldLabel.style.display = isScaleBezierMode ? "" : "none";

    const ctx = el.chart.getContext("2d", { alpha: true });
    const pad = { l: 44, r: 16, t: 16, b: 34 };
    let dragTarget = "";
    let hoverTarget = "";
    let dragPointerId = null;
    let dragRangeAnchor = null;
    let manualYRange = null;
    let yRangeDialog = null;
    let rafId = 0;
    let dragHandleYRange = null;

    const cubic = (a, b, c, d, t) => {
        const inv = 1 - t;
        return inv * inv * inv * a + 3 * inv * inv * t * b + 3 * inv * t * t * c + t * t * t * d;
    };

    const makePoint = (x, y) => ({ x, y });

    const getHandlePoint = (target, sourceState = state) => {
        const tick = isScaleBezierMode ? Math.max(1, int(sourceState.tick || 1)) : 1;
        if (target === "c1") {
            return makePoint(
                clamp(num(sourceState.c1x), 0, tick),
                isScaleBezierMode ? num(sourceState.c1y) : num(sourceState.min) + num(sourceState.c1y)
            );
        }
        if (isScaleBezierMode) {
            return makePoint(
                clamp(num(sourceState.c2x), 0, tick),
                num(sourceState.c2y)
            );
        }
        return makePoint(
            tick + clamp(num(sourceState.c2x), -tick, 0),
            num(sourceState.max) + num(sourceState.c2y)
        );
    };

    const getCurvePoints = (sourceState = state) => {
        const tick = isScaleBezierMode ? Math.max(1, int(sourceState.tick || 1)) : 1;
        return {
            p0: makePoint(0, num(sourceState.min)),
            p1: getHandlePoint("c1", sourceState),
            p2: getHandlePoint("c2", sourceState),
            p3: makePoint(tick, num(sourceState.max))
        };
    };

    const toHandleModel = (target, point, sourceState = state) => {
        const tick = isScaleBezierMode ? Math.max(1, int(sourceState.tick || 1)) : 1;
        const actualX = clamp(num(point.x), 0, tick);
        const actualY = num(point.y);
        if (target === "c1") {
            return {
                x: actualX,
                y: isScaleBezierMode ? actualY : actualY - num(sourceState.min)
            };
        }
        if (isScaleBezierMode) {
            return {
                x: actualX,
                y: actualY
            };
        }
        return {
            x: clamp(actualX - tick, -tick, 0),
            y: actualY - num(sourceState.max)
        };
    };

    const updateStatus = (text) => {
        el.status.textContent = text || "Ready";
    };

    const safeTick = () => (isScaleBezierMode ? Math.max(1, int(state.tick || 1)) : 1);

    const normalizeState = () => {
        state.tick = safeTick();
        state.min = num(state.min);
        state.max = num(state.max);
        state.c1x = clamp(num(state.c1x), 0, state.tick);
        state.c2x = isScaleBezierMode
            ? clamp(num(state.c2x), 0, state.tick)
            : clamp(num(state.c2x), -state.tick, 0);
        state.c1y = num(state.c1y);
        state.c2y = num(state.c2y);
        state.c1z = num(state.c1z);
        state.c2z = num(state.c2z);
        state.snapSEY = !!state.snapSEY;
    };

    const toFixedCompact = (v, digits = 6) => {
        const n = num(v);
        if (Math.abs(n) < 1e-9) return "0";
        return n.toFixed(digits).replace(/0+$/g, "").replace(/\.$/, "");
    };

    const syncInputs = () => {
        el.inpMin.value = toFixedCompact(state.min);
        el.inpMax.value = toFixedCompact(state.max);
        el.inpTick.value = String(safeTick());
        el.inpC1x.value = toFixedCompact(state.c1x);
        el.inpC1y.value = toFixedCompact(state.c1y);
        el.inpC1z.value = toFixedCompact(state.c1z);
        el.inpC2x.value = toFixedCompact(state.c2x);
        el.inpC2y.value = toFixedCompact(state.c2y);
        el.inpC2z.value = toFixedCompact(state.c2z);
        if (el.chkSnapSEY) el.chkSnapSEY.checked = !!state.snapSEY;
        el.lblXRange.textContent = `X: 0..${safeTick()}`;
    };

    const getBounds = () => {
        const w = Math.max(320, el.chart.clientWidth || 320);
        const h = Math.max(240, el.chart.clientHeight || 240);
        return { w, h, iw: w - pad.l - pad.r, ih: h - pad.t - pad.b };
    };

    const calcAutoYRange = () => {
        const { p0, p1, p2, p3 } = getCurvePoints();
        const vals = [p0.y, p1.y, p2.y, p3.y];
        let lo = Math.min(...vals);
        let hi = Math.max(...vals);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
            lo = -1;
            hi = 1;
        }
        if (Math.abs(hi - lo) < 1e-6) {
            hi = lo + 1;
        }
        const padY = (hi - lo) * 0.14;
        return { lo: lo - padY, hi: hi + padY };
    };

    const getYRange = () => {
        if (manualYRange) {
            const lo = num(manualYRange.lo, -1);
            const hi = num(manualYRange.hi, 1);
            if (!Number.isFinite(lo) || !Number.isFinite(hi)) return calcAutoYRange();
            if (hi - lo < 1e-6) return { lo, hi: lo + 1 };
            return { lo, hi };
        }
        if (dragHandleYRange) return dragHandleYRange;
        return calcAutoYRange();
    };

    const ensureManualYRange = () => {
        if (!manualYRange) {
            const auto = calcAutoYRange();
            manualYRange = { lo: auto.lo, hi: auto.hi };
        }
        return manualYRange;
    };

    const setManualYRange = (lo, hi) => {
        let a = num(lo);
        let b = num(hi);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        if (a > b) {
            const t = a;
            a = b;
            b = t;
        }
        if (b - a < 1e-6) b = a + 1e-6;
        manualYRange = { lo: a, hi: b };
        return true;
    };

    const xToPx = (x, b) => pad.l + clamp(x, 0, safeTick()) / safeTick() * b.iw;
    const pxToX = (px, b) => clamp((px - pad.l) / Math.max(1, b.iw), 0, 1) * safeTick();
    const yToPx = (y, b, yr) => pad.t + (1 - (y - yr.lo) / (yr.hi - yr.lo)) * b.ih;
    const pxToY = (py, b, yr) => yr.lo + (1 - (py - pad.t) / Math.max(1, b.ih)) * (yr.hi - yr.lo);

    const evalBezierAtTick = (xTick) => {
        const tick = safeTick();
        const x = clamp(num(xTick), 0, tick);
        const { p0, p1, p2, p3 } = getCurvePoints();

        if (x <= 0) return p0.y;
        if (x >= tick) return p3.y;

        let lo = 0;
        let hi = 1;
        let mid = 0.5;
        for (let i = 0; i < 26; i++) {
            mid = (lo + hi) * 0.5;
            const bx = cubic(p0.x, p1.x, p2.x, p3.x, mid);
            if (bx < x) lo = mid;
            else hi = mid;
        }
        return cubic(p0.y, p1.y, p2.y, p3.y, mid);
    };

    const scheduleRender = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(render);
    };

    const render = () => {
        normalizeState();
        syncInputs();

        const b = getBounds();
        if (el.chart.width !== b.w || el.chart.height !== b.h) {
            el.chart.width = b.w;
            el.chart.height = b.h;
        }
        const yr = getYRange();

        ctx.clearRect(0, 0, b.w, b.h);

        // grid
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.09)";
        ctx.lineWidth = 1;
        const gx = Math.max(4, Math.min(10, safeTick()));
        for (let i = 0; i <= gx; i++) {
            const x = pad.l + i / gx * b.iw;
            ctx.beginPath();
            ctx.moveTo(x, pad.t);
            ctx.lineTo(x, pad.t + b.ih);
            ctx.stroke();
        }
        for (let i = 0; i <= 6; i++) {
            const y = pad.t + i / 6 * b.ih;
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(pad.l + b.iw, y);
            ctx.stroke();
        }
        ctx.restore();

        // y-range drag zones (always visible)
        const topY = pad.t;
        const bottomY = pad.t + b.ih;
        const zoneHeight = 12;
        const drawRangeZone = (kind, y) => {
            const active = dragTarget === kind;
            const hover = hoverTarget === kind;
            const y0 = y - zoneHeight / 2;
            const fill = active
                ? "rgba(255,107,107,0.22)"
                : hover
                    ? "rgba(255,107,107,0.14)"
                    : "rgba(255,107,107,0.08)";
            const stroke = active
                ? "rgba(255,107,107,0.95)"
                : hover
                    ? "rgba(255,107,107,0.72)"
                    : "rgba(255,107,107,0.46)";
            ctx.save();
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = active ? 1.8 : 1.2;
            ctx.setLineDash(active ? [8, 4] : [6, 5]);
            ctx.fillRect(pad.l, y0, b.iw, zoneHeight);
            ctx.strokeRect(pad.l + 0.5, y0 + 0.5, b.iw - 1, zoneHeight - 1);
            ctx.setLineDash([]);
            const cx = pad.l + b.iw * 0.5;
            ctx.fillRect(cx - 16, y - 2, 32, 4);
            ctx.restore();
        };
        drawRangeZone("ymax", topY);
        drawRangeZone("ymin", bottomY);

        // axis labels
        ctx.save();
        ctx.fillStyle = "rgba(223,234,252,0.84)";
        ctx.font = "12px ui-monospace,Consolas,monospace";
        ctx.fillText("0", pad.l - 6, pad.t + b.ih + 20);
        ctx.fillText(String(safeTick()), pad.l + b.iw - 18, pad.t + b.ih + 20);
        ctx.fillText(toFixedCompact(yr.hi), 8, pad.t + 4);
        ctx.fillText(toFixedCompact(yr.lo), 8, pad.t + b.ih);
        ctx.fillStyle = "rgba(223,234,252,0.5)";
        ctx.font = "10px ui-monospace,Consolas,monospace";
        ctx.fillText("drag/edit", 8, pad.t + 16);
        ctx.fillText("drag/edit", 8, pad.t + b.ih - 10);
        ctx.restore();

        // helper lines
        const { p0, p1, p2, p3 } = getCurvePoints();

        ctx.save();
        ctx.strokeStyle = "rgba(103,164,255,0.45)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(xToPx(p0.x, b), yToPx(p0.y, b, yr));
        ctx.lineTo(xToPx(p1.x, b), yToPx(p1.y, b, yr));
        ctx.lineTo(xToPx(p2.x, b), yToPx(p2.y, b, yr));
        ctx.lineTo(xToPx(p3.x, b), yToPx(p3.y, b, yr));
        ctx.stroke();
        ctx.restore();

        // linear baseline
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(xToPx(0, b), yToPx(state.min, b, yr));
        ctx.lineTo(xToPx(safeTick(), b), yToPx(state.max, b, yr));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // S / E horizontal snap lines
        ctx.save();
        ctx.strokeStyle = "rgba(83,211,171,0.22)";
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(pad.l, yToPx(state.min, b, yr));
        ctx.lineTo(pad.l + b.iw, yToPx(state.min, b, yr));
        ctx.moveTo(pad.l, yToPx(state.max, b, yr));
        ctx.lineTo(pad.l + b.iw, yToPx(state.max, b, yr));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // bezier curve
        ctx.save();
        ctx.strokeStyle = "rgba(103,164,255,0.95)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        const samples = Math.max(80, safeTick() * 6);
        for (let i = 0; i <= samples; i++) {
            const xTick = i / samples * safeTick();
            const yValue = evalBezierAtTick(xTick);
            const x = xToPx(xTick, b);
            const y = yToPx(yValue, b, yr);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        const drawPoint = (x, y, fill, label) => {
            const px = xToPx(x, b);
            const py = yToPx(y, b, yr);
            ctx.save();
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(15,23,36,0.9)";
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.fillStyle = "rgba(230,238,252,0.92)";
            ctx.font = "11px ui-monospace,Consolas,monospace";
            ctx.fillText(label, px + 8, py - 8);
            ctx.restore();
        };

        drawPoint(p0.x, p0.y, "rgba(83,211,171,0.95)", "S");
        drawPoint(p3.x, p3.y, "rgba(83,211,171,0.95)", "E");
        drawPoint(p1.x, p1.y, "rgba(255,176,85,0.95)", "C1");
        drawPoint(p2.x, p2.y, "rgba(255,176,85,0.95)", "C2");
    };

    const getMousePos = (ev) => {
        const rect = el.chart.getBoundingClientRect();
        return {
            x: ev.clientX - rect.left,
            y: ev.clientY - rect.top
        };
    };

    const pickHandle = (mx, my) => {
        const b = getBounds();
        const yr = getYRange();
        const handlePriorityR = 14;
        const borderHitY = 14;
        const d = (x, y) => {
            const dx = x - mx;
            const dy = y - my;
            return Math.sqrt(dx * dx + dy * dy);
        };
        const c1Point = getHandlePoint("c1");
        const c2Point = getHandlePoint("c2");
        const c1 = { x: xToPx(c1Point.x, b), y: yToPx(c1Point.y, b, yr), id: "c1" };
        const c2 = { x: xToPx(c2Point.x, b), y: yToPx(c2Point.y, b, yr), id: "c2" };
        const a = d(c1.x, c1.y);
        const b2 = d(c2.x, c2.y);
        if (a <= handlePriorityR && a <= b2) return c1.id;
        if (b2 <= handlePriorityR) return c2.id;

        const topY = pad.t;
        const bottomY = pad.t + b.ih;
        const inBorderX = mx >= pad.l - 12 && mx <= pad.l + b.iw + 12;
        if (inBorderX && Math.abs(my - topY) <= borderHitY) return "ymax";
        if (inBorderX && Math.abs(my - bottomY) <= borderHitY) return "ymin";

        const inLeftLabel = mx >= 0 && mx <= pad.l + 14;
        if (inLeftLabel && Math.abs(my - topY) <= 22) return "ymax";
        if (inLeftLabel && Math.abs(my - bottomY) <= 22) return "ymin";
        return "";
    };

    const isYRangeTarget = (target) => target === "ymax" || target === "ymin";

    const cursorForTarget = (target) => {
        if (target === "c1" || target === "c2") return dragTarget ? "grabbing" : "grab";
        if (isYRangeTarget(target)) return "ns-resize";
        return "crosshair";
    };

    const applyCursor = () => {
        const active = dragTarget || hoverTarget;
        el.chart.style.cursor = cursorForTarget(active);
    };

    const clearDragState = (statusText = "") => {
        if (!dragTarget && dragPointerId === null) return;
        if (Number.isFinite(dragPointerId) && el.chart.hasPointerCapture?.(dragPointerId)) {
            el.chart.releasePointerCapture?.(dragPointerId);
        }
        dragTarget = "";
        dragPointerId = null;
        dragRangeAnchor = null;
        dragHandleYRange = null;
        if (statusText) updateStatus(statusText);
        applyCursor();
        scheduleRender();
    };

    const onPointerDown = (ev) => {
        ev.preventDefault();
        const p = getMousePos(ev);
        dragTarget = pickHandle(p.x, p.y);
        hoverTarget = dragTarget || hoverTarget;
        if (!dragTarget) {
            dragPointerId = null;
            applyCursor();
            return;
        }

        if (isYRangeTarget(dragTarget)) {
            const base = ensureManualYRange();
            const b = getBounds();
            dragRangeAnchor = {
                pointerY: p.y,
                lo: base.lo,
                hi: base.hi,
                valuePerPixel: (base.hi - base.lo) / Math.max(1, b.ih)
            };
            dragHandleYRange = null;
        } else {
            dragRangeAnchor = null;
            dragHandleYRange = manualYRange ? null : calcAutoYRange();
        }

        dragPointerId = ev.pointerId;
        el.chart.setPointerCapture?.(ev.pointerId);
        if (dragTarget === "ymax") updateStatus("Dragging Y upper limit");
        else if (dragTarget === "ymin") updateStatus("Dragging Y lower limit");
        else updateStatus(`Dragging ${dragTarget.toUpperCase()}`);
        applyCursor();
        scheduleRender();
    };

    const onPointerMove = (ev) => {
        const p = getMousePos(ev);
        if (!dragTarget) {
            const nextHover = pickHandle(p.x, p.y);
            if (nextHover !== hoverTarget) {
                hoverTarget = nextHover;
                applyCursor();
                scheduleRender();
            }
            return;
        }

        if (dragPointerId !== null && ev.pointerId !== dragPointerId) return;
        const b = getBounds();
        const yr = getYRange();

        if (isYRangeTarget(dragTarget)) {
            if (!dragRangeAnchor) {
                const base = ensureManualYRange();
                dragRangeAnchor = {
                    pointerY: p.y,
                    lo: base.lo,
                    hi: base.hi,
                    valuePerPixel: (base.hi - base.lo) / Math.max(1, b.ih)
                };
            }
            const anchor = dragRangeAnchor;
            const minSpan = Math.max(1e-6, (anchor.hi - anchor.lo) * 0.01);
            const delta = -(p.y - anchor.pointerY) * anchor.valuePerPixel;
            if (dragTarget === "ymax") {
                const nextHi = Math.max(anchor.lo + minSpan, anchor.hi + delta);
                setManualYRange(anchor.lo, nextHi);
            } else {
                const nextLo = Math.min(anchor.hi - minSpan, anchor.lo + delta);
                setManualYRange(nextLo, anchor.hi);
            }
            scheduleRender();
            return;
        }

        const nextX = clamp(pxToX(p.x, b), 0, safeTick());
        const clampedY = clamp(p.y, pad.t - b.ih, pad.t + b.ih * 2);
        let nextY = pxToY(clampedY, b, yr);
        const snapEnabled = !!state.snapSEY && !ev.shiftKey;
        if (snapEnabled) {
            const snapPx = 7;
            const minPy = yToPx(state.min, b, yr);
            const maxPy = yToPx(state.max, b, yr);
            if (Math.abs(p.y - minPy) <= snapPx) nextY = state.min;
            else if (Math.abs(p.y - maxPy) <= snapPx) nextY = state.max;
        }

        const nextHandle = toHandleModel(dragTarget, { x: nextX, y: nextY });
        if (dragTarget === "c1") {
            state.c1x = nextHandle.x;
            state.c1y = nextHandle.y;
        } else if (dragTarget === "c2") {
            state.c2x = nextHandle.x;
            state.c2y = nextHandle.y;
        }
        scheduleRender();
    };

    const onPointerUp = (ev) => {
        if (!dragTarget) return;
        if (dragPointerId !== null && ev.pointerId !== dragPointerId) return;
        clearDragState("Curve updated");
    };

    const onPointerCancel = (ev) => {
        if (!dragTarget) return;
        if (dragPointerId !== null && ev.pointerId !== dragPointerId) return;
        clearDragState("Drag canceled");
    };

    const onLostPointerCapture = (ev) => {
        if (!dragTarget) return;
        if (dragPointerId !== null && ev.pointerId !== dragPointerId) return;
        clearDragState("Drag canceled");
    };

    const onPointerLeave = () => {
        if (dragTarget || !hoverTarget) return;
        hoverTarget = "";
        applyCursor();
        scheduleRender();
    };

    const ensureYRangeDialog = () => {
        if (yRangeDialog) return yRangeDialog;

        const style = document.createElement("style");
        style.textContent = `
.cb-y-dialog-backdrop {
    position: fixed;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(4, 10, 18, 0.56);
    backdrop-filter: blur(4px);
    z-index: 9999;
}
.cb-y-dialog-backdrop.show { display: flex; }
.cb-y-dialog {
    width: min(360px, calc(100vw - 24px));
    border: 1px solid var(--line2);
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel) 92%, transparent);
    box-shadow: 0 18px 36px rgba(0, 0, 0, 0.4);
    padding: 12px;
    display: grid;
    gap: 10px;
}
.cb-y-dialog-title {
    font-size: 13px;
    color: var(--text);
}
.cb-y-dialog-input {
    width: 100%;
    height: 34px;
    border-radius: 9px;
    border: 1px solid var(--line2);
    background: rgba(0, 0, 0, 0.24);
    color: var(--text);
    outline: none;
    padding: 0 10px;
    font-family: var(--mono);
    font-size: 12px;
}
.cb-y-dialog-input:focus {
    border-color: color-mix(in srgb, var(--accent) 70%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 26%, transparent);
}
.cb-y-dialog-input.invalid {
    border-color: color-mix(in srgb, var(--danger) 78%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 24%, transparent);
}
.cb-y-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
`;
        document.head.appendChild(style);

        const backdrop = document.createElement("div");
        backdrop.className = "cb-y-dialog-backdrop";
        backdrop.innerHTML = `
<div class="cb-y-dialog" role="dialog" aria-modal="true">
    <div class="cb-y-dialog-title"></div>
    <input class="cb-y-dialog-input" type="number" step="0.000001" />
    <div class="cb-y-dialog-actions">
        <button type="button" data-role="cancel">Cancel</button>
        <button type="button" class="primary" data-role="ok">Apply</button>
    </div>
</div>`;
        document.body.appendChild(backdrop);

        const panel = backdrop.querySelector(".cb-y-dialog");
        const title = backdrop.querySelector(".cb-y-dialog-title");
        const input = backdrop.querySelector(".cb-y-dialog-input");
        const btnCancel = backdrop.querySelector('[data-role="cancel"]');
        const btnOk = backdrop.querySelector('[data-role="ok"]');

        let onSubmit = null;
        const close = () => {
            backdrop.classList.remove("show");
            onSubmit = null;
            input.classList.remove("invalid");
        };
        const confirm = () => {
            const value = Number(input.value);
            if (!Number.isFinite(value)) {
                input.classList.add("invalid");
                input.focus();
                input.select();
                updateStatus("Invalid number");
                return;
            }
            const submit = onSubmit;
            close();
            if (typeof submit === "function") submit(value);
        };

        backdrop.addEventListener("pointerdown", (ev) => {
            if (ev.target === backdrop) close();
        });
        panel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
        btnCancel.addEventListener("click", close);
        btnOk.addEventListener("click", confirm);
        input.addEventListener("input", () => input.classList.remove("invalid"));
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                confirm();
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                close();
            }
        });

        yRangeDialog = {
            open(titleText, value, submitHandler) {
                onSubmit = submitHandler;
                title.textContent = titleText;
                input.value = toFixedCompact(value);
                input.classList.remove("invalid");
                backdrop.classList.add("show");
                requestAnimationFrame(() => {
                    input.focus();
                    input.select();
                });
            },
            close
        };
        return yRangeDialog;
    };

    const onChartDoubleClick = (ev) => {
        const p = getMousePos(ev);
        const b = getBounds();
        const topY = pad.t;
        const bottomY = pad.t + b.ih;
        const topHit = p.x >= 0 && p.x <= pad.l + 14 && Math.abs(p.y - topY) <= 22;
        const bottomHit = p.x >= 0 && p.x <= pad.l + 14 && Math.abs(p.y - bottomY) <= 22;
        if (!topHit && !bottomHit) return;
        ev.preventDefault();
        const yr = getYRange();
        const current = topHit ? yr.hi : yr.lo;
        const dialog = ensureYRangeDialog();
        dialog.open(topHit ? "Edit Y upper limit" : "Edit Y lower limit", current, (value) => {
            const base = ensureManualYRange();
            const minSpan = Math.max(1e-6, (base.hi - base.lo) * 0.01);
            if (topHit) {
                setManualYRange(base.lo, Math.max(value, base.lo + minSpan));
                updateStatus("Y upper limit updated");
            } else {
                setManualYRange(Math.min(value, base.hi - minSpan), base.hi);
                updateStatus("Y lower limit updated");
            }
            scheduleRender();
        });
    };

    const bindInput = (node, key, forceInt = false) => {
        node.addEventListener("input", () => {
            state[key] = forceInt ? Math.max(1, int(node.value || 1)) : num(node.value);
            normalizeState();
            scheduleRender();
        });
    };

    bindInput(el.inpMin, "min");
    bindInput(el.inpMax, "max");
    if (isScaleBezierMode) bindInput(el.inpTick, "tick", true);
    bindInput(el.inpC1x, "c1x");
    bindInput(el.inpC1y, "c1y");
    bindInput(el.inpC1z, "c1z");
    bindInput(el.inpC2x, "c2x");
    bindInput(el.inpC2y, "c2y");
    bindInput(el.inpC2z, "c2z");
    el.chkSnapSEY?.addEventListener("change", () => {
        state.snapSEY = !!el.chkSnapSEY.checked;
        scheduleRender();
    });

    el.btnResetLinear.addEventListener("click", () => {
        const tick = safeTick();
        const delta = state.max - state.min;
        state.c1x = tick / 3;
        state.c1y = isScaleBezierMode ? state.min + delta / 3 : delta / 3;
        state.c2x = isScaleBezierMode ? tick * 2 / 3 : -tick / 3;
        state.c2y = isScaleBezierMode ? state.min + delta * 2 / 3 : -delta / 3;
        scheduleRender();
        updateStatus("Reset to linear");
    });

    el.chart.addEventListener("pointerdown", onPointerDown);
    el.chart.addEventListener("pointermove", onPointerMove);
    el.chart.addEventListener("pointerup", onPointerUp);
    el.chart.addEventListener("pointercancel", onPointerCancel);
    el.chart.addEventListener("lostpointercapture", onLostPointerCapture);
    el.chart.addEventListener("pointerleave", onPointerLeave);
    el.chart.addEventListener("dblclick", onChartDoubleClick);
    window.addEventListener("resize", scheduleRender);

    window.getBezierConfig = () => {
        normalizeState();
        return {
            min: num(state.min),
            max: num(state.max),
            tick: Math.max(1, int(state.tick || 1)),
            c1x: num(state.c1x),
            c1y: num(state.c1y),
            c1z: num(state.c1z),
            c2x: num(state.c2x),
            c2y: num(state.c2y),
            c2z: num(state.c2z)
        };
    };

    window.setBezierConfig = (cfg) => {
        if (!cfg || typeof cfg !== "object") return;
        state.min = num(cfg.min, state.min);
        state.max = num(cfg.max, state.max);
        state.tick = isScaleBezierMode ? Math.max(1, int(cfg.tick, state.tick)) : 1;
        state.c1x = num(cfg.c1x, state.c1x);
        state.c1y = num(cfg.c1y, state.c1y);
        state.c1z = num(cfg.c1z, state.c1z);
        state.c2x = num(cfg.c2x, state.c2x);
        state.c2y = num(cfg.c2y, state.c2y);
        state.c2z = num(cfg.c2z, state.c2z);
        scheduleRender();
    };

    window.addEventListener("message", (ev) => {
        const data = ev?.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "cb-bezier-init") {
            window.setBezierConfig(data.payload || {});
        }
    });

    normalizeState();
    syncInputs();
    applyCursor();
    render();
})();
