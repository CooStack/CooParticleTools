export function initLayoutSystem(options = {}) {
    const {
        layoutEl,
        panelLeft,
        panelRight,
        resizerLeft,
        resizerRight,
        onResize,
    } = options;

    const STORAGE_KEY = "pe_layout_v1";
    const MIN_LEFT_W = 260;
    const MIN_RIGHT_W = 280;
    const MIN_CENTER_W = 320;

    let layoutState = loadLayoutState();

    function loadLayoutState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === "object") {
                    return {
                        leftWidth: Number.isFinite(obj.leftWidth) ? obj.leftWidth : null,
                        rightWidth: Number.isFinite(obj.rightWidth) ? obj.rightWidth : null,
                    };
                }
            }
        } catch (e) {
            console.warn("loadLayoutState failed:", e);
        }
        return { leftWidth: null, rightWidth: null };
    }

    function saveLayoutState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutState));
        } catch (e) {
            console.warn("saveLayoutState failed:", e);
        }
    }

    function getPanelWidth(panel) {
        if (!panel) return 0;
        const rect = panel.getBoundingClientRect();
        return rect && rect.width ? rect.width : 0;
    }

    function setPanelWidth(panel, w) {
        if (!panel || !Number.isFinite(w)) return;
        const v = Math.max(0, w);
        panel.style.width = `${v}px`;
        panel.style.flex = `0 0 ${v}px`;
    }

    function clampLeftWidth(w) {
        if (!layoutEl) return w;
        const layoutW = layoutEl.getBoundingClientRect().width || 0;
        const rightW = getPanelWidth(panelRight) || layoutState.rightWidth || MIN_RIGHT_W;
        const max = Math.max(MIN_LEFT_W, layoutW - rightW - MIN_CENTER_W);
        return Math.min(Math.max(Number(w) || 0, MIN_LEFT_W), max);
    }

    function clampRightWidth(w) {
        if (!layoutEl) return w;
        const layoutW = layoutEl.getBoundingClientRect().width || 0;
        const leftW = getPanelWidth(panelLeft) || layoutState.leftWidth || MIN_LEFT_W;
        const max = Math.max(MIN_RIGHT_W, layoutW - leftW - MIN_CENTER_W);
        return Math.min(Math.max(Number(w) || 0, MIN_RIGHT_W), max);
    }

    let resizeRaf = 0;
    function scheduleResize() {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            if (typeof onResize === "function") onResize();
        });
    }

    function applyLayoutState(persist = false) {
        if (!layoutEl) return;
        if (Number.isFinite(layoutState.leftWidth)) {
            const w = clampLeftWidth(layoutState.leftWidth);
            layoutState.leftWidth = w;
            setPanelWidth(panelLeft, w);
        }
        if (Number.isFinite(layoutState.rightWidth)) {
            const w = clampRightWidth(layoutState.rightWidth);
            layoutState.rightWidth = w;
            setPanelWidth(panelRight, w);
        }
        scheduleResize();
        if (persist) saveLayoutState();
    }

    function bindResizer(el, side) {
        if (!el) return;
        el.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startX = e.clientX;
            const startLeft = getPanelWidth(panelLeft);
            const startRight = getPanelWidth(panelRight);

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                if (side === "left") {
                    const w = clampLeftWidth(startLeft + dx);
                    layoutState.leftWidth = w;
                    setPanelWidth(panelLeft, w);
                } else {
                    const w = clampRightWidth(startRight - dx);
                    layoutState.rightWidth = w;
                    setPanelWidth(panelRight, w);
                }
                scheduleResize();
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-panels");
                saveLayoutState();
                scheduleResize();
            };

            document.body.classList.add("resizing-panels");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function bindResizers() {
        bindResizer(resizerLeft, "left");
        bindResizer(resizerRight, "right");
    }

    return {
        applyLayoutState,
        bindResizers,
    };
}
