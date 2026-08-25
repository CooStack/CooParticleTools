import { DEFAULT_SETTINGS, THEME_IDS, STORAGE_KEYS } from "./constants.js?v=20260825_1";
import { clamp, loadJson, saveJson } from "./utils.js";
import { watchAppTheme } from "../../shared/js/app-theme.js?v=20260824_1";

/*
 * Tell the desktop shell which theme this builder is wearing so the app-drawn
 * title bar matches the page instead of looking bolted on.
 */
function broadcastThemeToShell(theme) {
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "coo-legacy-theme", theme: String(theme || "") }, window.location.origin);
        }
    } catch {
        // Cross-origin parents simply do not get the hint.
    }
}


function normalizeTheme(theme) {
    const valid = THEME_IDS.includes(theme);
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

    // Another tool (or the shell) changing the theme applies here live.
    watchAppTheme((next) => applyTheme(next));

    function applyTheme(themeId) {
        const finalTheme = normalizeTheme(themeId);
        document.body.setAttribute("data-theme", finalTheme);
        if (themeSelect && themeSelect.value !== finalTheme) themeSelect.value = finalTheme;
        localStorage.setItem(STORAGE_KEYS.theme, finalTheme);
        broadcastThemeToShell(finalTheme);
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
        /*
         * The shared theme store wins over the copy inside this tool's settings
         * blob. The other way round (saved?.theme first) meant the blob shadowed
         * the global choice, so this builder kept its own look no matter what was
         * picked elsewhere. The blob is only a fallback for installs that predate
         * the shared store.
         */
        const themeSaved = localStorage.getItem(STORAGE_KEYS.theme) || "";
        const saved = loadJson(STORAGE_KEYS.settings, null);
        const theme = themeSaved || saved?.theme || DEFAULT_SETTINGS.theme;
        const merged = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, saved || {}, { theme }));
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
        const list = THEME_IDS;
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
