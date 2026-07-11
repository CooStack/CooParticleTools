import { countDecimalsFromString, safeNum } from "./utils.js";

const THEMES = [
    { id: "dark-1", label: "夜岚" },
    { id: "dark-2", label: "深潮" },
    { id: "dark-3", label: "焰砂" },
    { id: "light-1", label: "" },
    { id: "light-2", label: "¶" },
    { id: "light-3", label: "薄荷" }
];
const THEME_ORDER = THEMES.map(t => t.id);
const THEME_KEY = "pe_theme_v2";

export function initSettingsSystem(ctx = {}) {
    const {
        settingsModal,
        settingsMask,
        btnSettings,
        btnCloseSettings,
        themeSelect,
        chkAxes,
        chkGrid,
        inpPointSize,
        inpParamStep,
        selMotionSnapPlane,
        chkMotionSnapGrid,
        inpMotionSnapStep,
        inpMotionSnapRadius,
        onShowAxes,
        onShowGrid,
        onPointSize,
        onMotionSnapSettingsChange,
    } = ctx;

    const SETTINGS_STORAGE_KEY = "pe_settings_v1";
    let paramStep = 0.1;
    let motionSnapPlane = "XZ";
    let motionSnapGrid = false;
    let motionSnapStep = 0.5;
    let motionSnapRadius = 0.35;

    function normalizeMotionPlane(raw) {
        const s = String(raw || "XZ").toUpperCase();
        if (s === "XY" || s === "ZY") return s;
        return "XZ";
    }

    function normalizeMotionSnapStep(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return 0.5;
        return n;
    }

    function normalizeMotionSnapRadius(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return 0.35;
        return n;
    }

    function getMotionSnapSettings() {
        return {
            plane: motionSnapPlane,
            snapGrid: !!motionSnapGrid,
            snapStep: motionSnapStep,
            snapRadius: motionSnapRadius,
        };
    }

    function syncMotionSnapForm() {
        if (selMotionSnapPlane) selMotionSnapPlane.value = motionSnapPlane;
        if (chkMotionSnapGrid) chkMotionSnapGrid.checked = !!motionSnapGrid;
        if (inpMotionSnapStep) inpMotionSnapStep.value = String(motionSnapStep);
        if (inpMotionSnapRadius) inpMotionSnapRadius.value = String(motionSnapRadius);
    }

    function notifyMotionSnapSettingsChange() {
        syncMotionSnapForm();
        if (typeof onMotionSnapSettingsChange === "function") {
            onMotionSnapSettingsChange(getMotionSnapSettings());
        }
    }

    function setMotionSnapSettings(next = {}, opts = {}) {
        motionSnapPlane = normalizeMotionPlane(next.plane ?? motionSnapPlane);
        motionSnapGrid = !!(next.snapGrid ?? motionSnapGrid);
        motionSnapStep = normalizeMotionSnapStep(next.snapStep ?? motionSnapStep);
        motionSnapRadius = normalizeMotionSnapRadius(next.snapRadius ?? motionSnapRadius);
        notifyMotionSnapSettingsChange();
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function hasTheme(id) {
        return THEMES.some(t => t.id === id);
    }

    function normalizeTheme(id) {
        if (id === "dark") return "dark-1";
        if (id === "light") return "light-1";
        return hasTheme(id) ? id : "dark-1";
    }

    function applyTheme(themeId) {
        const finalId = normalizeTheme(themeId);
        document.body.setAttribute("data-theme", finalId);
        if (themeSelect && themeSelect.value !== finalId) themeSelect.value = finalId;
    }

    function initThemeToggle() {
        const saved = localStorage.getItem(THEME_KEY) || "";
        const initial = normalizeTheme(saved || "dark-1");
        applyTheme(initial);
        localStorage.setItem(THEME_KEY, initial);

        if (themeSelect) {
            themeSelect.addEventListener("change", () => {
                const next = normalizeTheme(themeSelect.value);
                applyTheme(next);
                localStorage.setItem(THEME_KEY, next);
                saveSettingsToStorage();
            });
        }
    }

    function cycleTheme(dir) {
        const cur = document.body.getAttribute("data-theme") || "dark-1";
        const idx = Math.max(0, THEME_ORDER.indexOf(cur));
        const next = THEME_ORDER[(idx + dir + THEME_ORDER.length) % THEME_ORDER.length];
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
        saveSettingsToStorage();
    }

    function bindThemeHotkeys() {
        window.addEventListener("keydown", (e) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.key !== "[" && e.key !== "]") return;
            const el = document.activeElement;
            const isEditable = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName));
            if (isEditable) return;
            e.preventDefault();
            cycleTheme(e.key === "]" ? 1 : -1);
        });
    }

    function normalizeParamStep(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return 0.1;
        return n;
    }

    function applyParamStepToInputs() {
        const step = String(paramStep);
        const inputs = document.querySelectorAll('input[type="number"]');
        inputs.forEach((el) => {
            if (el === inpParamStep) return;
            if (el.dataset.stepFixed === "1") return;
            el.step = step;
            bindParamStepKeydown(el);
        });
    }

    function bindParamStepKeydown(el) {
        if (!el || el.dataset.paramStepBound === "1") return;
        el.dataset.paramStepBound = "1";
        el.addEventListener("keydown", (e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            if (el.dataset.stepFixed === "1" || el === inpParamStep) return;
            const liveStep = paramStep;
            if (!Number.isFinite(liveStep) || liveStep <= 0) return;
            e.preventDefault();
            const curStr = el.value;
            const cur = parseFloat(curStr);
            const base = Number.isFinite(cur) ? cur : 0;
            const next = base + (e.key === "ArrowUp" ? liveStep : -liveStep);
            const precision = Math.max(countDecimalsFromString(curStr), countDecimalsFromString(liveStep));
            const fixed = Number.isFinite(next) ? Number(next.toFixed(Math.min(12, precision + 2))) : next;
            el.value = String(fixed);
            el.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    function setParamStep(v, opts = {}) {
        const next = normalizeParamStep(v);
        paramStep = next;
        if (inpParamStep && inpParamStep.value !== String(next)) {
            inpParamStep.value = String(next);
        }
        applyParamStepToInputs();
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function collectSettingsPayload() {
        const currentTheme = normalizeTheme(
            (themeSelect && themeSelect.value) ||
            document.body.getAttribute("data-theme") ||
            "dark-1"
        );
        return {
            version: 2,
            paramStep,
            theme: currentTheme,
            showAxes: chkAxes ? !!chkAxes.checked : true,
            showGrid: chkGrid ? !!chkGrid.checked : true,
            pointSize: safeNum(inpPointSize?.value, 1.0),
            motionSnapPlane,
            motionSnapGrid: !!motionSnapGrid,
            motionSnapStep,
            motionSnapRadius,
        };
    }

    function saveSettingsToStorage() {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(collectSettingsPayload()));
        } catch (e) {
            console.warn("saveSettings failed:", e);
        }
    }

    function applySettingsPayload(payload, opts = {}) {
        if (!payload || typeof payload !== "object") return;
        if (payload.paramStep !== undefined) {
            setParamStep(payload.paramStep, { skipSave: true });
        }
        if (payload.theme) {
            applyTheme(payload.theme);
            localStorage.setItem(THEME_KEY, normalizeTheme(payload.theme));
        }
        if (chkAxes && typeof payload.showAxes === "boolean") chkAxes.checked = payload.showAxes;
        if (chkGrid && typeof payload.showGrid === "boolean") chkGrid.checked = payload.showGrid;
        if (inpPointSize && payload.pointSize !== undefined) {
            inpPointSize.value = String(payload.pointSize);
        }
        setMotionSnapSettings({
            plane: payload.motionSnapPlane,
            snapGrid: payload.motionSnapGrid,
            snapStep: payload.motionSnapStep,
            snapRadius: payload.motionSnapRadius,
        }, { skipSave: true });

        if (typeof onShowAxes === "function") onShowAxes(chkAxes ? chkAxes.checked : true);
        if (typeof onShowGrid === "function") onShowGrid(chkGrid ? chkGrid.checked : true);
        if (typeof onPointSize === "function" && inpPointSize) onPointSize(inpPointSize.value);
        notifyMotionSnapSettingsChange();
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function loadSettingsFromStorage() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const obj = JSON.parse(raw);
            applySettingsPayload(obj, { skipSave: true });
        } catch (e) {
            console.warn("loadSettings failed:", e);
        }
    }

    function showSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.remove("hidden");
        settingsMask.classList.remove("hidden");
        settingsModal.classList.remove("under");
        settingsMask.classList.remove("under");
    }

    function hideSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.add("hidden");
        settingsMask.classList.add("hidden");
        settingsModal.classList.remove("under");
        settingsMask.classList.remove("under");
    }

    btnSettings && btnSettings.addEventListener("click", showSettingsModal);
    btnCloseSettings && btnCloseSettings.addEventListener("click", hideSettingsModal);
    settingsMask && settingsMask.addEventListener("click", hideSettingsModal);

    if (chkAxes) {
        chkAxes.addEventListener("change", () => {
            if (typeof onShowAxes === "function") onShowAxes(chkAxes.checked);
            saveSettingsToStorage();
        });
    }
    if (chkGrid) {
        chkGrid.addEventListener("change", () => {
            if (typeof onShowGrid === "function") onShowGrid(chkGrid.checked);
            saveSettingsToStorage();
        });
    }
    if (inpPointSize) {
        inpPointSize.addEventListener("input", () => {
            if (typeof onPointSize === "function") onPointSize(inpPointSize.value);
            saveSettingsToStorage();
        });
    }
    if (inpParamStep) {
        inpParamStep.addEventListener("input", () => setParamStep(inpParamStep.value));
    }
    if (selMotionSnapPlane) {
        selMotionSnapPlane.addEventListener("change", () => {
            setMotionSnapSettings({
                plane: selMotionSnapPlane.value,
            });
        });
    }
    if (chkMotionSnapGrid) {
        chkMotionSnapGrid.addEventListener("change", () => {
            setMotionSnapSettings({
                snapGrid: !!chkMotionSnapGrid.checked,
            });
        });
    }
    if (inpMotionSnapStep) {
        inpMotionSnapStep.addEventListener("input", () => {
            setMotionSnapSettings({
                snapStep: inpMotionSnapStep.value,
            });
        });
    }
    if (inpMotionSnapRadius) {
        inpMotionSnapRadius.addEventListener("input", () => {
            setMotionSnapSettings({
                snapRadius: inpMotionSnapRadius.value,
            });
        });
    }

    initThemeToggle();

    return {
        getParamStep: () => paramStep,
        getMotionSnapSettings,
        setMotionSnapSettings,
        applyParamStepToInputs,
        showSettingsModal,
        hideSettingsModal,
        loadSettingsFromStorage,
        bindThemeHotkeys,
        getSettingsPayload: collectSettingsPayload,
        applySettingsPayload,
    };
}
