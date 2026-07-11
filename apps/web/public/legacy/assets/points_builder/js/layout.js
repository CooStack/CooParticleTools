export function initLayoutSystem(options = {}) {
    const {
        layoutEl,
        panelLeft,
        panelRight,
        resizerLeft,
        resizerRight,
        btnToggleKotlin,
        onResize,
        clamp
    } = options;

    const clampFn = (typeof clamp === "function")
        ? clamp
        : (v, min, max) => {
            let lo = Number(min);
            let hi = Number(max);
            if (!Number.isFinite(lo)) lo = 0;
            if (!Number.isFinite(hi)) hi = lo;
            if (hi < lo) hi = lo;
            return Math.min(Math.max(Number(v) || 0, lo), hi);
        };

    const LAYOUT_STORAGE_KEY = "pb_layout_v1";
    const MIN_LEFT_W = 220;
    const MIN_RIGHT_W = 260;
    const MIN_VIEWER_W = 280;

    let layoutState = loadLayoutState();

    function loadLayoutState() {
        try {
            const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === "object") {
                    return {
                        leftWidth: Number.isFinite(obj.leftWidth) ? obj.leftWidth : null,
                        rightWidth: Number.isFinite(obj.rightWidth) ? obj.rightWidth : null,
                        kotlinHidden: !!obj.kotlinHidden,
                    };
                }
            }
        } catch (e) {
            console.warn("loadLayoutState failed:", e);
        }
        return { leftWidth: null, rightWidth: null, kotlinHidden: false };
    }

    function saveLayoutState() {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutState));
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
        const rightW = layoutState.kotlinHidden ? 0 : (getPanelWidth(panelRight) || layoutState.rightWidth || MIN_RIGHT_W);
        const max = Math.max(MIN_LEFT_W, layoutW - rightW - MIN_VIEWER_W);
        return clampFn(w, MIN_LEFT_W, max);
    }

    function clampRightWidth(w) {
        if (!layoutEl) return w;
        const layoutW = layoutEl.getBoundingClientRect().width || 0;
        const leftW = getPanelWidth(panelLeft) || layoutState.leftWidth || MIN_LEFT_W;
        const max = Math.max(MIN_RIGHT_W, layoutW - leftW - MIN_VIEWER_W);
        return clampFn(w, MIN_RIGHT_W, max);
    }

    function updateKotlinToggleText() {
        if (!btnToggleKotlin) return;
        if (layoutState.kotlinHidden) {
            btnToggleKotlin.textContent = "<";
            btnToggleKotlin.title = "显示右侧面板";
        } else {
            btnToggleKotlin.textContent = ">";
            btnToggleKotlin.title = "折叠右侧面板";
        }
    }

    let resizeRaf = 0;
    let togglePosRaf = 0;
    function scheduleThreeResize() {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            if (typeof onResize === "function") onResize();
        });
    }

    function positionKotlinToggle() {
        if (!btnToggleKotlin || !layoutEl) return;
        const layoutRect = layoutEl.getBoundingClientRect();
        if (!layoutRect || layoutRect.width <= 0) return;
        if (layoutState.kotlinHidden || !panelRight) {
            btnToggleKotlin.style.left = "auto";
            btnToggleKotlin.style.right = "10px";
            return;
        }
        const rightRect = panelRight.getBoundingClientRect();
        const desiredLeft = rightRect.left - layoutRect.left + 8;
        const safeLeft = clampFn(desiredLeft, 8, Math.max(8, layoutRect.width - 36));
        btnToggleKotlin.style.left = `${safeLeft}px`;
        btnToggleKotlin.style.right = "auto";
    }

    function scheduleTogglePosition() {
        if (togglePosRaf) cancelAnimationFrame(togglePosRaf);
        togglePosRaf = requestAnimationFrame(() => {
            togglePosRaf = 0;
            positionKotlinToggle();
        });
    }

    function setKotlinHidden(hidden, persist = true) {
        if (!layoutEl) return;
        const next = !!hidden;
        if (next) {
            const curRight = getPanelWidth(panelRight);
            if (curRight) layoutState.rightWidth = curRight;
            if (Number.isFinite(curRight) && curRight > 0) setPanelWidth(panelRight, curRight);
            requestAnimationFrame(() => layoutEl.classList.add("kotlin-hidden"));
        } else {
            layoutEl.classList.remove("kotlin-hidden");
            if (Number.isFinite(layoutState.rightWidth)) {
                const w = clampRightWidth(layoutState.rightWidth);
                layoutState.rightWidth = w;
                requestAnimationFrame(() => setPanelWidth(panelRight, w));
            }
        }
        layoutState.kotlinHidden = next;
        updateKotlinToggleText();
        scheduleThreeResize();
        scheduleTogglePosition();
        setTimeout(scheduleThreeResize, 360);
        setTimeout(scheduleTogglePosition, 360);
        if (persist) saveLayoutState();
    }

    function applyLayoutState(persist = false) {
        if (!layoutEl) return;
        setKotlinHidden(!!layoutState.kotlinHidden, false);
        if (Number.isFinite(layoutState.leftWidth)) {
            const w = clampLeftWidth(layoutState.leftWidth);
            layoutState.leftWidth = w;
            setPanelWidth(panelLeft, w);
        }
        if (!layoutState.kotlinHidden && Number.isFinite(layoutState.rightWidth)) {
            const w = clampRightWidth(layoutState.rightWidth);
            layoutState.rightWidth = w;
            setPanelWidth(panelRight, w);
        }
        scheduleTogglePosition();
        if (persist) saveLayoutState();
    }

    if (panelRight) {
        panelRight.addEventListener("transitionend", (e) => {
            if (e.propertyName === "width" || e.propertyName === "flex-basis" || e.propertyName === "transform") {
                scheduleThreeResize();
                scheduleTogglePosition();
            }
        });
    }

    function bindResizer(el, side) {
        if (!el) return;
        el.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            if (side === "right" && layoutState.kotlinHidden) return;
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
                    scheduleTogglePosition();
                } else {
                    const w = clampRightWidth(startRight - dx);
                    layoutState.rightWidth = w;
                    setPanelWidth(panelRight, w);
                    scheduleTogglePosition();
                }
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-panels");
                saveLayoutState();
                scheduleThreeResize();
                scheduleTogglePosition();
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
        setKotlinHidden,
        updateKotlinToggleText,
        bindResizer,
        bindResizers,
        getLayoutState: () => layoutState,
        isKotlinHidden: () => !!layoutState.kotlinHidden
    };
}
