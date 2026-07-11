import { DEFAULT_SETTINGS, THEMES, STORAGE_KEYS } from "./constants.js";
import { clamp, loadJson, saveJson } from "./utils.js";

function normalizeTheme(theme) {
    const valid = THEMES.some((t) => t.id === theme);
    return valid ? theme : DEFAULT_SETTINGS.theme;
}

function normalizePreviewControlMode(mode) {
    const v = String(mode || DEFAULT_SETTINGS.previewControlMode).toLowerCase();
    return v === "touch" ? "touch" : "default";
}

function normalizeSettings(raw = {}) {
    const out = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    out.theme = normalizeTheme(out.theme);
    out.paramStep = clamp(out.paramStep, 0.0001, 1000);
    out.cameraFov = clamp(out.cameraFov, 20, 120);
    out.showAxes = !!out.showAxes;
    out.showGrid = !!out.showGrid;
    out.helpersIndependentRender = out.helpersIndependentRender !== false;
    out.previewControlMode = normalizePreviewControlMode(out.previewControlMode);
    out.realtimeCompile = !!out.realtimeCompile;
    out.realtimeCode = !!out.realtimeCode;
    return out;
}

export function initSettingsSystem(ctx) {
    const {
        store,
        els,
        onOpenHotkeys = () => {},
        onSettingsApplied = () => {}
    } = ctx;

    const {
        settingsModal,
        settingsMask,
        btnSettings,
        btnCloseSettings,
        btnOpenHotkeys,
        btnExportSettings,
        btnImportSettings,
        fileSettings,
        themeSelect,
        inpParamStep,
        inpCameraFov,
        chkAxes,
        chkGrid,
        chkHelpersIndependent,
        selPreviewControls,
        chkRealtimeCompile,
        chkRealtimeCode
    } = els;

    function collectForm() {
        return normalizeSettings({
            theme: themeSelect?.value,
            paramStep: Number(inpParamStep?.value ?? DEFAULT_SETTINGS.paramStep),
            cameraFov: Number(inpCameraFov?.value ?? DEFAULT_SETTINGS.cameraFov),
            showAxes: !!chkAxes?.checked,
            showGrid: !!chkGrid?.checked,
            helpersIndependentRender: !!chkHelpersIndependent?.checked,
            previewControlMode: normalizePreviewControlMode(selPreviewControls?.value),
            realtimeCompile: !!chkRealtimeCompile?.checked,
            realtimeCode: !!chkRealtimeCode?.checked
        });
    }

    function applyTheme(themeId) {
        const finalTheme = normalizeTheme(themeId);
        document.body.setAttribute("data-theme", finalTheme);
        if (themeSelect && themeSelect.value !== finalTheme) themeSelect.value = finalTheme;
        localStorage.setItem(STORAGE_KEYS.theme, finalTheme);
    }

    function applyToForm(settings) {
        if (themeSelect) themeSelect.value = settings.theme;
        if (inpParamStep) inpParamStep.value = String(settings.paramStep);
        if (inpCameraFov) inpCameraFov.value = String(settings.cameraFov);
        if (chkAxes) chkAxes.checked = !!settings.showAxes;
        if (chkGrid) chkGrid.checked = !!settings.showGrid;
        if (chkHelpersIndependent) chkHelpersIndependent.checked = !!settings.helpersIndependentRender;
        if (selPreviewControls) selPreviewControls.value = normalizePreviewControlMode(settings.previewControlMode);
        if (chkRealtimeCompile) chkRealtimeCompile.checked = !!settings.realtimeCompile;
        if (chkRealtimeCode) chkRealtimeCode.checked = !!settings.realtimeCode;
    }

    function save(settings) {
        saveJson(STORAGE_KEYS.settings, settings);
    }

    function patchSettings(next, meta = {}) {
        const normalized = normalizeSettings(next);
        store.patch((draft) => {
            draft.settings = normalized;
        }, Object.assign({ reason: "settings-change" }, meta));
        applyTheme(normalized.theme);
        applyToForm(normalized);
        save(normalized);
        try {
            onSettingsApplied(normalized);
        } catch (err) {
            console.error("settings onSettingsApplied failed", err);
        }
    }

    function show() {
        settingsModal?.classList.remove("hidden");
        settingsMask?.classList.remove("hidden");
    }

    function hide() {
        settingsModal?.classList.add("hidden");
        settingsMask?.classList.add("hidden");
    }

    function loadInitialSettings() {
        const themeSaved = localStorage.getItem(STORAGE_KEYS.theme) || DEFAULT_SETTINGS.theme;
        const saved = loadJson(STORAGE_KEYS.settings, null);
        const merged = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, saved || {}, { theme: saved?.theme || themeSaved }));
        patchSettings(merged, { silent: true, skipHistory: true });
    }

    function bindFormEvents() {
        const onAnyChange = () => {
            patchSettings(collectForm());
        };
        [themeSelect, inpParamStep, inpCameraFov, chkAxes, chkGrid, chkHelpersIndependent, selPreviewControls, chkRealtimeCompile, chkRealtimeCode].forEach((el) => {
            if (!el) return;
            el.addEventListener("change", onAnyChange);
        });

        btnSettings?.addEventListener("click", () => {
            if (settingsModal?.classList.contains("hidden")) show();
            else hide();
        });
        btnCloseSettings?.addEventListener("click", hide);
        settingsMask?.addEventListener("click", hide);
        btnOpenHotkeys?.addEventListener("click", onOpenHotkeys);
    }

    function cycleTheme(dir) {
        const list = THEMES.map((t) => t.id);
        const cur = normalizeTheme(document.body.getAttribute("data-theme") || DEFAULT_SETTINGS.theme);
        const idx = Math.max(0, list.indexOf(cur));
        const next = list[(idx + dir + list.length) % list.length];
        const current = collectForm();
        current.theme = next;
        patchSettings(current, { reason: "theme-cycle" });
    }

    bindFormEvents();
    loadInitialSettings();

    return {
        show,
        hide,
        cycleTheme,
        patchSettings,
        collectSettings: collectForm,
        applySettings: (s) => patchSettings(normalizeSettings(s), { reason: "settings-import" }),
        applyToForm,
        normalizeSettings,
        exportSettingsButton: btnExportSettings,
        importSettingsButton: btnImportSettings,
        importSettingsFileInput: fileSettings
    };
}
