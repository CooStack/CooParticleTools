import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import { createCardInputs, initCardSystem } from "./cards.js?v=20260828_2";
import { initFilterSystem } from "./filters.js?v=20260429_7";
import { initHotkeysSystem } from "./hotkeys.js?v=20260826_2";
import { createKindDefs } from "./kinds.js?v=20260828_1";
import { ALL_THEMES, APP_THEME_KEY, normalizeTheme, watchAppTheme } from "../../shared/js/app-theme.js?v=20260824_1";
import { createBuilderTools } from "./builder.js?v=20260828_1";
import { sampleAdaptiveBezierNodes } from "./bezier-sampling.js?v=20260826_1";
import { initLayoutSystem } from "./layout.js?v=20260429_1";
import { createNodeHelpers } from "./nodes.js?v=20260825_4";
import {
    collectPointsBuilderIds,
    createPointsBuilderNode,
    createPointsBuilderState,
    applyPointsBuilderInstanceOverrides,
    buildPointsBuilderVariableCompletions,
    ensureUniquePointsBuilderIds,
    normalizePointsBuilderNodeTree,
    normalizePointsBuilderState,
    normalizePointsBuilderVariables,
    reassignPointsBuilderIds,
    BUILDER_REFERENCE_KIND,
    EFFECT_RING_KIND
} from "./model.js?v=20260827_2";
import { toggleFullscreen } from "./viewer.js";
import { createPickerModule } from "./main-picker.js?v=20260828_1";
import { initGlobalShortcuts } from "./main-shortcuts.js?v=20260826_5";
import { initTopbarAndBoot } from "./main-topbar-boot.js?v=20260505_1";
import { createPreviewDistanceTool } from "../../src/js/shared/preview-distance-tool.js?v=20260826_4";
import { getCompositionReferenceSnapshot } from "../../shared/js/composition-reference-storage.js?v=20260825_1";
import { createAdaptiveGrid } from "../../shared/js/adaptive-grid.js?v=20260826_18";
import { createReferenceGuideController } from "./reference-guides.js?v=20260827_1";
import { createGridInspector } from "./grid-inspector.js?v=20260826_2";
import {
    getRandomPresetGroupOptions,
    pickRandomPresetIdsForGroup
} from "./preset-random.js";
import {
    mergeBezierNodeSelectionMaps,
    resolveBezierBoxSelectionLevel,
    shouldUseFocusedPointColor
} from "./card-selection.js?v=20260825_2";
import {
    BUILDER_INSTANCE_RENAME_STORAGE_KEY,
    collectBuilderInstanceRegistry,
    renameBuilderInstanceIdInState,
    syncRegisteredBuilderSnapshotsFromRegistry
} from "./instance-registry.js?v=20260828_3";
import {
    sanitizeFileBase,
    loadProjectName,
    saveProjectName,
    loadKotlinEndMode,
    saveKotlinEndMode,
    loadAutoState,
    loadLatestAutoStatePayload,
    flushAutoStateSave,
    saveAutoState,
    loadPresetList,
    hasPresetList,
    savePresetList,
    loadPresetGroups,
    savePresetGroups,
    downloadText
} from "./io.js?v=20260826_3";

const JSZIP_URL = new URL("../../shader_builder/js/jszip.min.js", import.meta.url).href;
const NATIVE_SUGGESTION_SKIP_INPUT_TYPES = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit"
]);

function disableNativeInputSuggestions(root = document) {
    const apply = (input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const type = String(input.type || "text").toLowerCase();
        if (NATIVE_SUGGESTION_SKIP_INPUT_TYPES.has(type)) return;
        input.autocomplete = "off";
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
        input.setAttribute("aria-autocomplete", "none");
        input.setAttribute("data-lpignore", "true");
        input.setAttribute("data-form-type", "other");
    };

    if (root instanceof HTMLInputElement) {
        apply(root);
        return;
    }

    root?.querySelectorAll?.("input").forEach(apply);
}

function initPointsBuilderMain() {
    const U = globalThis.Utils;
    if (!U) throw new Error("Utils 未加载：请确认 utils.js 在 main.js 之前加载，且 utils.js 内部设置了 globalThis.Utils");

    // -------------------------
    // DOM
    // -------------------------
    const elCardsRoot = document.getElementById("cardsRoot");
    const elReferenceGuidesRoot = document.getElementById("referenceGuidesRoot");
    const elCompositionReferenceRoot = document.getElementById("compositionReferenceRoot");
    const elBuilderColumnTitleLabel = document.getElementById("builderColumnTitleLabel");
    const elBuilderColumnFootnote = document.getElementById("builderColumnFootnote");
    const btnBuilderColumnTab = document.getElementById("btnBuilderColumnTab");
    const btnReferenceGuidesTab = document.getElementById("btnReferenceGuidesTab");
    const btnCompositionColumnTab = document.getElementById("btnCompositionColumnTab");
    const elKotlinOut = document.getElementById("kotlinOut");

    // 用户要求：右侧 Kotlin 代码栏只读（可复制，不可编辑）
    if (elKotlinOut && elKotlinOut.tagName === "TEXTAREA") {
        try { elKotlinOut.readOnly = true; } catch {}
        try { elKotlinOut.setAttribute("readonly", ""); } catch {}
    }

    const btnAddCard = document.getElementById("btnAddCard");
    const btnQuickOffset = document.getElementById("btnQuickOffset");
    const btnClearEmptyAddBuilder = document.getElementById("btnClearEmptyAddBuilder");
    const btnClearEmptyAddWith = document.getElementById("btnClearEmptyAddWith");
    const btnPickLine = document.getElementById("btnPickLine");
    const btnPickTriangle = document.getElementById("btnPickTriangle");
    const pickPointBtns = Array.from(document.querySelectorAll("#btnPickPoint"));
    const btnPickPoint = pickPointBtns[0] || null;
    if (pickPointBtns.length > 1) {
        for (let i = 1; i < pickPointBtns.length; i++) {
            try { pickPointBtns[i].remove(); } catch {}
        }
    }
    const btnLocalRotate = document.getElementById("btnLocalRotate");
    const btnHotkeys = document.getElementById("btnHotkeys");
    const btnSnapRenderSettings = document.getElementById("btnSnapRenderSettings");
    const btnFullscreen = document.getElementById("btnFullscreen");

    const btnExportKotlin = document.getElementById("btnExportKotlin");
    const btnToggleKotlin = document.getElementById("btnToggleKotlin");
    const btnCopyKotlin = document.getElementById("btnCopyKotlin");
    const btnDownloadKotlin = document.getElementById("btnDownloadKotlin");
    const btnCopyKotlin2 = document.getElementById("btnCopyKotlin2");
    const btnExportKotlin2 = document.getElementById("btnExportKotlin2");
    const btnDownloadKotlin2 = document.getElementById("btnDownloadKotlin2");
    const selKotlinEnd = document.getElementById("selKotlinEnd");
    const btnRightParamsTab = document.getElementById("btnRightParamsTab");
    const btnRightPresetsTab = document.getElementById("btnRightPresetsTab");
    const btnRightInstancesTab = document.getElementById("btnRightInstancesTab");
    const btnRightKotlinTab = document.getElementById("btnRightKotlinTab");
    const rightParamsPage = document.getElementById("rightParamsPage");
    const rightPresetsPage = document.getElementById("rightPresetsPage");
    const rightInstancesPage = document.getElementById("rightInstancesPage");
    const rightKotlinPage = document.getElementById("rightKotlinPage");
    const paramEditorStatus = document.getElementById("paramEditorStatus");
    const paramEditorSyncHint = document.getElementById("paramEditorSyncHint");
    const paramEditorHost = document.getElementById("paramEditorHost");
    const builderInstanceRegistryStatus = document.getElementById("builderInstanceRegistryStatus");
    const builderInstanceRegistryList = document.getElementById("builderInstanceRegistryList");
    const effectRingEditorParking = document.getElementById("effectRingEditorParking");
    const presetNameInput = document.getElementById("presetNameInput");
    const presetGroupInput = document.getElementById("presetGroupInput");
    const presetGroupList = document.getElementById("presetGroupList");
    const presetOriginX = document.getElementById("presetOriginX");
    const presetOriginY = document.getElementById("presetOriginY");
    const presetOriginZ = document.getElementById("presetOriginZ");
    const btnPresetUseCurrentOrigin = document.getElementById("btnPresetUseCurrentOrigin");
    const btnPresetPickOrigin = document.getElementById("btnPresetPickOrigin");
    const btnPresetCreateGroup = document.getElementById("btnPresetCreateGroup");
    const btnPresetCreateLibraryGroup = document.getElementById("btnPresetCreateLibraryGroup");
    const btnPresetSaveCurrent = document.getElementById("btnPresetSaveCurrent");
    const presetSaveMask = document.getElementById("presetSaveMask");
    const presetSaveModal = document.getElementById("presetSaveModal");
    const btnClosePresetSave = document.getElementById("btnClosePresetSave");
    const btnCancelPresetSave = document.getElementById("btnCancelPresetSave");
    const btnPresetExportZip = document.getElementById("btnPresetExportZip");
    const btnPresetImportFolder = document.getElementById("btnPresetImportFolder");
    const btnPresetImportZip = document.getElementById("btnPresetImportZip");
    const presetLibraryStatus = document.getElementById("presetLibraryStatus");
    const presetLibraryList = document.getElementById("presetLibraryList");
    const btnOpenPresetRingTool = document.getElementById("btnOpenPresetRingTool");
    const presetRingTool = document.getElementById("presetRingTool");
    const presetRingStatus = document.getElementById("presetRingStatus");
    const btnPresetRingClose = document.getElementById("btnPresetRingClose");
    const presetRingCount = document.getElementById("presetRingCount");
    const presetRingRadius = document.getElementById("presetRingRadius");
    const presetRingStartDeg = document.getElementById("presetRingStartDeg");
    const presetRingGroupLabel = document.getElementById("presetRingGroupLabel");
    const presetRingOriginX = document.getElementById("presetRingOriginX");
    const presetRingOriginY = document.getElementById("presetRingOriginY");
    const presetRingOriginZ = document.getElementById("presetRingOriginZ");
    const btnPresetRingPickOrigin = document.getElementById("btnPresetRingPickOrigin");
    const presetRingAxisX = document.getElementById("presetRingAxisX");
    const presetRingAxisY = document.getElementById("presetRingAxisY");
    const presetRingAxisZ = document.getElementById("presetRingAxisZ");
    const presetRingFaceCenter = document.getElementById("presetRingFaceCenter");
    const presetRingOffsetX = document.getElementById("presetRingOffsetX");
    const presetRingOffsetY = document.getElementById("presetRingOffsetY");
    const presetRingOffsetZ = document.getElementById("presetRingOffsetZ");
    const presetRingReverse = document.getElementById("presetRingReverse");
    const presetRingRandomEnabled = document.getElementById("presetRingRandomEnabled");
    const presetRingRandomGroup = document.getElementById("presetRingRandomGroup");
    const presetRingSlots = document.getElementById("presetRingSlots");
    const btnPresetRingSyncSlots = document.getElementById("btnPresetRingSyncSlots");

    const btnSaveJson = document.getElementById("btnSaveJson");
    const btnLoadJson = document.getElementById("btnLoadJson");
    const btnSavePreset = document.getElementById("btnSavePreset");
    const btnApplyPreset = document.getElementById("btnApplyPreset");
    const btnOpenPresetRingToolMenu = document.getElementById("btnOpenPresetRingToolMenu");
    const btnExportPresets = document.getElementById("btnExportPresets");
    const btnImportPresets = document.getElementById("btnImportPresets");
    const btnEditVariables = document.getElementById("btnEditVariables");
    const fileJson = document.getElementById("fileJson");
    const fileBuilderJson = document.getElementById("fileBuilderJson");
    const filePresetJson = document.getElementById("filePresetJson");
    const btnReset = document.getElementById("btnReset");
    const inpProjectName = document.getElementById("inpProjectName");
    let builderJsonTargetNode = null;

    const modal = document.getElementById("modal");
    const modalMask = document.getElementById("modalMask");
    const btnCloseModal = document.getElementById("btnCloseModal");
    const btnCancelModal = document.getElementById("btnCancelModal");
    const cardPicker = document.getElementById("cardPicker");
    const cardSearch = document.getElementById("cardSearch");
    disableNativeInputSuggestions(document);
    if (document.body && typeof MutationObserver !== "undefined") {
        const nativeSuggestionObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes?.forEach((node) => disableNativeInputSuggestions(node));
            }
        });
        nativeSuggestionObserver.observe(document.body, { childList: true, subtree: true });
    }

    // -------------------------
    // Hotkeys DOM
    // -------------------------
    const hkModal = document.getElementById("hkModal");
    const hkMask = document.getElementById("hkMask");
    const hkSearch = document.getElementById("hkSearch");
    const hkList = document.getElementById("hkList");
    const hkHint = document.getElementById("hkHint");
    const btnCloseHotkeys = document.getElementById("btnCloseHotkeys");
    const btnCloseHotkeys2 = document.getElementById("btnCloseHotkeys2");
    const btnHotkeysReset = document.getElementById("btnHotkeysReset");
    const btnHotkeysExport = document.getElementById("btnHotkeysExport");
    const btnHotkeysImport = document.getElementById("btnHotkeysImport");
    const fileHotkeys = document.getElementById("fileHotkeys");
    const settingsModal = document.getElementById("settingsModal");
    const settingsMask = document.getElementById("settingsMask");
    const btnCloseSettings = document.getElementById("btnCloseSettings");
    const btnOpenHotkeys = document.getElementById("btnOpenHotkeys");

    const threeHost = document.getElementById("threeHost");
    const chkAxes = document.getElementById("chkAxes");
    const chkGrid = document.getElementById("chkGrid");
    const chkRealtimeKotlin = document.getElementById("chkRealtimeKotlin");
    const chkPointPickPreview = document.getElementById("chkPointPickPreview");
    const chkAutoSelectCompleteGroups = document.getElementById("chkAutoSelectCompleteGroups");
    const chkShowGeometryCenters = document.getElementById("chkShowGeometryCenters");
    const inpLineDivisionPoints = document.getElementById("inpLineDivisionPoints");
    const snapPriorityList = document.getElementById("snapPriorityList");
    const btnResetCamera = document.getElementById("btnResetCamera");
    const themeSelect = document.getElementById("themeSelect");
    const chkSnapGrid = document.getElementById("chkSnapGrid");
    const chkSnapParticle = document.getElementById("chkSnapParticle");
    const chkSnapReferenceEndpoints = document.getElementById("chkSnapReferenceEndpoints");
    const chkSnapGridKeyToggleMode = document.getElementById("chkSnapGridKeyToggleMode");
    const chkSnapParticleKeyToggleMode = document.getElementById("chkSnapParticleKeyToggleMode");
    const selSnapPlane = document.getElementById("selSnapPlane");
    const selMirrorPlane = document.getElementById("selMirrorPlane");
    const inpPointSize = document.getElementById("inpPointSize");
    const inpParamStep = document.getElementById("inpParamStep");
    const inpOffsetPreviewLimit = document.getElementById("inpOffsetPreviewLimit");
    const inpSnapStep = document.getElementById("inpSnapStep");
    const inpRotateSnapDeg = document.getElementById("inpRotateSnapDeg");
    const inpSnapParticleRange = document.getElementById("inpSnapParticleRange");
    const statusLinePick = document.getElementById("statusLinePick");
    const statusSnapMode = document.getElementById("statusSnapMode");
    const statusPoints = document.getElementById("statusPoints");

    const layoutEl = document.querySelector(".layout");
    const panelLeft = document.querySelector(".panel.left");
    const panelRight = document.querySelector(".panel.right");
    const resizerLeft = document.querySelector(".resizer-left");
    const resizerRight = document.querySelector(".resizer-right");
    let actionMenuEl = null;
    let actionMenuListEl = null;
    let quickSyncPanelEl = null;
    let quickSyncEditorHostEl = null;
    let quickSyncTitleEl = null;
    let quickSyncHintEl = null;
    let quickSyncState = null;
    let quickSyncHistoryLockTimer = 0;
    let quickSyncCardsRenderTimer = 0;
    let rightPanelPage = "params";
    let paramEditorSyncState = null;
    let paramEditorRenderRaf = 0;
    let paramEditorHistoryLockTimer = 0;
    let presetLibraryRenderRaf = 0;
    let presetLibraryDirty = true;
    let compositionBuilderInstanceRegistry = [];
    let compositionBuilderInstanceRenames = [];
    let compositionBuilderInstanceRegistryRevision = "";
    let presetGroupEditState = null;
    let presetItemEditState = null;
    const presetCollapsedGroups = new Set();
    const presetGroupCollapsedSnapshot = new Map();
    let presetGroupAnimationTarget = "";
    let presetSaveSourceChildren = null;
    let presetSaveSourceLabel = "";
    let presetSaveVariableInfo = null;
    let presetSaveVariablePanelEl = null;
    let presetSaveOverwriteTarget = null;
    let presetRingSharedVariablePanelEl = null;
    const presetRingSharedVariableState = {
        enabled: {},
        values: {},
        touched: {},
        excluded: {}
    };
    const DEFAULT_PRESET_GROUP = "默认分组";
    const LEGACY_UNGROUPED_PRESET_GROUP = "未分组";
    let draggingPresetId = "";
    let draggingPresetGroup = "";
    let presetPointerDragState = null;
    let presetPointerDragClickSuppressUntil = 0;
    let presetDragLockPlaneKeyDown = false;
    let presetDragLockPlanePreviousState = false;
    let suppressPresetGroupToggleUntil = 0;
    let presetRingSlotPresetIds = [];
    let presetRingRandomPresetIds = [];
    let activeParameterizedInstanceNodeId = "";
    let pendingParameterizedInstancePlacement = null;
    let presetRingSnapshotSyncTimer = 0;

    // -------------------------
    // helpers
    // -------------------------
    const uid = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);

    function isDragCopyAllowedTarget(target) {
        if (!target || !target.closest) return false;
        if (target.closest("input, textarea")) return true;
        if (target.closest("#kotlinOut")) return true;
        return false;
    }

    function isInternalDragHandleTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest(".handle, .drag-handle, .snap-priority-item, .preset-item, .preset-group-head");
    }

    function bindDragCopyGuards() {
        if (document.__pbDragCopyGuardBound) return;
        document.__pbDragCopyGuardBound = true;

        document.addEventListener("selectstart", (ev) => {
            if (isDragCopyAllowedTarget(ev.target)) return;
            ev.preventDefault();
        }, true);

        document.addEventListener("dragstart", (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest(".preset-item, .preset-group-head")) return;
            if (isInternalDragHandleTarget(ev.target)) return;
            if (isDragCopyAllowedTarget(ev.target)) return;
            ev.preventDefault();
        }, true);
    }

    function ensureActionMenuEl() {
        if (actionMenuEl && actionMenuListEl) return actionMenuEl;
        const wrap = document.createElement("div");
        wrap.id = "pbActionMenu";
        wrap.className = "pb-context-menu hidden";
        const list = document.createElement("div");
        list.className = "pb-context-menu-list";
        wrap.appendChild(list);
        wrap.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        document.body.appendChild(wrap);
        actionMenuEl = wrap;
        actionMenuListEl = list;
        return wrap;
    }

    function removeActionSubmenusFrom(wrap, depth = 0) {
        if (!wrap) return;
        const submenus = Array.isArray(wrap.__pbSubmenus) ? wrap.__pbSubmenus : [];
        for (let i = submenus.length - 1; i >= Math.max(0, depth); i--) {
            const entry = submenus[i];
            if (entry?.anchor) {
                entry.anchor.classList.remove("active");
                entry.anchor.setAttribute("aria-expanded", "false");
            }
            if (entry?.el) entry.el.remove();
            submenus.pop();
        }
        wrap.__pbSubmenus = submenus;
        if (depth <= 0 && wrap.__pbSubmenu) {
            wrap.__pbSubmenu.remove();
            wrap.__pbSubmenu = null;
        }
        if (depth <= 0 && wrap.__pbSubmenuAnchor) {
            wrap.__pbSubmenuAnchor.classList.remove("active");
            wrap.__pbSubmenuAnchor.setAttribute("aria-expanded", "false");
            wrap.__pbSubmenuAnchor = null;
        }
    }

    function hideActionMenu() {
        if (!actionMenuEl) return;
        removeActionSubmenusFrom(actionMenuEl, 0);
        actionMenuEl.classList.add("hidden");
    }

    function clonePlain(value) {
        if (typeof deepClone === "function") return deepClone(value);
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function diffPlain(prev, next) {
        const diffs = [];
        const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
        const isArr = (v) => Array.isArray(v);
        const walk = (a, b, path) => {
            if (isObj(a) && isObj(b)) {
                const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
                for (const key of keys) {
                    if (String(key).startsWith("__pb_")) keys.delete(key);
                }
                for (const k of keys) walk(a[k], b[k], path.concat(k));
                return;
            }
            if (isArr(a) || isArr(b)) {
                if (isArr(a) && isArr(b) && a.length === b.length
                    && a.every((item, index) => isObj(item) && isObj(b[index]))) {
                    for (let i = 0; i < a.length; i++) walk(a[i], b[i], path.concat(i));
                    return;
                }
                if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ path, value: clonePlain(b) });
                return;
            }
            if (a !== b) diffs.push({ path, value: b });
        };
        walk(prev || {}, next || {}, []);
        return diffs;
    }

    function applyPlainDiff(target, diffs) {
        if (!target || !Array.isArray(diffs) || !diffs.length) return;
        for (const d of diffs) {
            const path = Array.isArray(d.path) ? d.path : [];
            if (!path.length) continue;
            let cur = target;
            for (let i = 0; i < path.length - 1; i++) {
                const k = path[i];
                if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
                cur = cur[k];
            }
            cur[path[path.length - 1]] = clonePlain(d.value);
        }
    }

    function ensureQuickSyncPanelEl() {
        if (quickSyncPanelEl && quickSyncEditorHostEl && quickSyncTitleEl && quickSyncHintEl) return quickSyncPanelEl;
        const panel = document.createElement("div");
        panel.id = "pbQuickSyncPanel";
        panel.className = "pb-context-panel hidden";
        const head = document.createElement("div");
        head.className = "pb-context-panel-head";
        const title = document.createElement("div");
        title.className = "pb-context-panel-title";
        title.textContent = "参数同步";
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "pb-context-panel-close";
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", () => hideQuickSyncPanel());
        head.appendChild(title);
        head.appendChild(closeBtn);
        const hint = document.createElement("div");
        hint.className = "pb-context-panel-hint";
        const editor = document.createElement("div");
        editor.className = "pb-context-panel-editor";
        panel.appendChild(head);
        panel.appendChild(hint);
        panel.appendChild(editor);
        panel.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        panel.addEventListener("pointerdown", (ev) => ev.stopPropagation(), true);
        document.body.appendChild(panel);
        quickSyncPanelEl = panel;
        quickSyncEditorHostEl = editor;
        quickSyncTitleEl = title;
        quickSyncHintEl = hint;
        return panel;
    }

    function hideQuickSyncPanel() {
        if (quickSyncPanelEl) quickSyncPanelEl.classList.add("hidden");
        if (quickSyncEditorHostEl && quickSyncEditorHostEl.__pbQuickSyncInputHandler) {
            quickSyncEditorHostEl.removeEventListener("input", quickSyncEditorHostEl.__pbQuickSyncInputHandler);
            quickSyncEditorHostEl.__pbQuickSyncInputHandler = null;
        }
        if (quickSyncEditorHostEl && quickSyncEditorHostEl.__pbQuickSyncChangeHandler) {
            quickSyncEditorHostEl.removeEventListener("change", quickSyncEditorHostEl.__pbQuickSyncChangeHandler);
            quickSyncEditorHostEl.__pbQuickSyncChangeHandler = null;
        }
        if (quickSyncCardsRenderTimer) {
            cancelAnimationFrame(quickSyncCardsRenderTimer);
            quickSyncCardsRenderTimer = 0;
        }
        quickSyncState = null;
    }

    function scheduleQuickSyncCardsRender() {
        if (quickSyncCardsRenderTimer) return;
        quickSyncCardsRenderTimer = requestAnimationFrame(() => {
            quickSyncCardsRenderTimer = 0;
            if (typeof renderCards === "function") renderCards();
            if (paramSync && paramSync.open && typeof renderSyncMenu === "function") renderSyncMenu();
            applyParamStepToInputs();
        });
    }

    function positionFloatingPanel(panelEl, clientX, clientY) {
        if (!panelEl) return;
        const margin = 8;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        panelEl.style.left = "-9999px";
        panelEl.style.top = "-9999px";
        const rect = panelEl.getBoundingClientRect();
        const maxLeft = Math.max(margin, vw - rect.width - margin);
        const maxTop = Math.max(margin, vh - rect.height - margin);
        const left = Math.max(margin, Math.min(clientX, maxLeft));
        const top = Math.max(margin, Math.min(clientY, maxTop));
        panelEl.style.left = `${Math.round(left)}px`;
        panelEl.style.top = `${Math.round(top)}px`;
    }

    function showActionMenu(clientX, clientY, items) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
            hideActionMenu();
            return false;
        }
        const wrap = ensureActionMenuEl();
        const host = actionMenuListEl;
        if (!wrap || !host) return false;
        let renderSubmenu = null;
        const renderMenuButton = (item, parent, depth) => {
            if (!item || !item.label) return;
            const hasChildren = Array.isArray(item.children) && item.children.length;
            if (!hasChildren && typeof item.onSelect !== "function") return;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `pb-context-menu-item${item.danger ? " danger" : ""}${hasChildren ? " has-children" : ""}${item.muted ? " muted" : ""}`;
            btn.textContent = hasChildren ? `${item.label} ›` : item.label;
            btn.title = String(item.label || "");
            const openChildren = () => {
                if (!hasChildren || typeof renderSubmenu !== "function") return false;
                return renderSubmenu(item.children, btn, depth);
            };
            if (hasChildren) {
                btn.setAttribute("aria-haspopup", "menu");
                btn.setAttribute("aria-expanded", "false");
                btn.__pbOpenChildren = openChildren;
                btn.addEventListener("pointerenter", openChildren);
                btn.addEventListener("mouseover", openChildren);
                btn.addEventListener("focus", openChildren);
                btn.addEventListener("pointerdown", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openChildren();
                });
            }
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (hasChildren) {
                    openChildren();
                    return;
                }
                hideActionMenu();
                item.onSelect();
            });
            parent.appendChild(btn);
        };
        renderSubmenu = (submenuItems, anchorBtn, depth = 0) => {
            removeActionSubmenusFrom(wrap, depth);
            const sub = document.createElement("div");
            sub.className = "pb-context-menu pb-context-submenu";
            const subHost = document.createElement("div");
            subHost.className = "pb-context-menu-list";
            sub.appendChild(subHost);
            for (const child of submenuItems || []) renderMenuButton(child, subHost, depth + 1);
            if (!subHost.children.length) return false;
            sub.addEventListener("contextmenu", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
            });
            document.body.appendChild(sub);
            const submenus = Array.isArray(wrap.__pbSubmenus) ? wrap.__pbSubmenus : [];
            submenus[depth] = { el: sub, anchor: anchorBtn };
            wrap.__pbSubmenus = submenus;
            anchorBtn.classList.add("active");
            anchorBtn.setAttribute("aria-expanded", "true");
            const rect = anchorBtn.getBoundingClientRect();
            positionFloatingPanel(sub, rect.right + 6, rect.top);
            return true;
        };
        const renderItems = (menuItems) => {
            removeActionSubmenusFrom(wrap, 0);
            host.innerHTML = "";
            for (const item of menuItems) renderMenuButton(item, host, 0);
        };
        renderItems(list);
        if (!host.children.length) {
            hideActionMenu();
            return false;
        }
        wrap.classList.remove("hidden");
        positionFloatingPanel(wrap, clientX, clientY);
        requestAnimationFrame(() => {
            if (!actionMenuEl || actionMenuEl.classList.contains("hidden")) return;
            const hoveredChildEntry = host.querySelector(".pb-context-menu-item.has-children:hover");
            if (hoveredChildEntry && typeof hoveredChildEntry.__pbOpenChildren === "function") {
                hoveredChildEntry.__pbOpenChildren();
            }
        });
        return true;
    }

    function createGroupTypeMenuItems(ids, sourceKind, options = {}) {
        const validIds = normalizeActionTargetIds(ids);
        if (!validIds.length) return [];
        const mode = options.mode || "create";
        const isSingle = validIds.length === 1;
        const sourceNode = options.sourceNode || (isSingle ? (findNodeContextById(validIds[0]) || {}).node || null : null);
        const makeCreate = (kind, label) => ({
            label,
            onSelect: () => wrapTargetIdsInGroup(validIds, kind)
        });
        const makeConvert = (kind, label, extra = {}) => ({
            label,
            onSelect: () => convertSingleGroupNode(sourceNode, kind, extra)
        });

        if (mode === "create") {
            return [
                makeCreate("add_builder", "普通组"),
                makeCreate("clear_as_mask", "蒙版组"),
                makeCreate("add_with", "旋转嵌套组"),
                {
                    label: "实例化组",
                    onSelect: () => createInstantiatedGroup(validIds)
                }
            ];
        }

        if (sourceNode?.kind === EFFECT_RING_KIND) {
            return [makeConvert("add_builder", "展开为普通组", { expanded: true })];
        }

        const items = [
            makeConvert("add_builder", "普通组"),
            makeConvert("clear_as_mask", "蒙版组"),
            makeConvert("add_with", "旋转嵌套组")
        ];
        if (sourceNode && sourceNode.kind !== BUILDER_REFERENCE_KIND && sourceNode.kind !== EFFECT_RING_KIND) {
            items.push({
                label: "转换为静态实例",
                onSelect: () => convertGroupToBuilderReference(sourceNode, "static")
            });
            items.push({
                label: "转换为构造实例",
                onSelect: () => convertGroupToBuilderReference(sourceNode, "construct")
            });
        }
        if (sourceNode?.kind === BUILDER_REFERENCE_KIND) {
            const currentMode = sourceNode.params?.instanceMode === "construct" ? "construct" : "static";
            items.push({
                label: currentMode === "construct" ? "转换为静态实例" : "转换为构造实例",
                onSelect: () => setBuilderReferenceInstanceMode(sourceNode, currentMode === "construct" ? "static" : "construct")
            });
            items.push({
                label: "编辑实例原型",
                onSelect: () => beginBuilderSnapshotEdit(sourceNode)
            });
        }
        if (sourceNode && sourceNode.kind === "add_with") {
            items.push(makeConvert("add_builder", "旋转嵌套后的普通组", { expanded: true }));
            items.push(makeConvert("clear_as_mask", "旋转嵌套后的蒙版组", { expanded: true }));
        }
        return items;
    }

    function createInstantiatedGroup(ids) {
        const valid = normalizeOutermostActionTargetIds(ids);
        if (!valid.length) return false;
        const rows = valid.map((id) => ({ id, ctx: findNodeContextById(id) })).filter((row) => row.ctx?.node && Array.isArray(row.ctx.parentList));
        if (!rows.length) return false;
        const parentList = rows[0].ctx.parentList;
        if (rows.some((row) => row.ctx.parentList !== parentList)) {
            showToast("创建实例化组失败：只能包裹同一层级的卡片", "error");
            return false;
        }

        // 将选中的同层卡片固化为实例原型，并以一个实例引用替换原卡片。
        const sourceChildren = rows
            .slice()
            .sort((a, b) => a.ctx.index - b.ctx.index)
            .map((row) => clonePlain(row.ctx.node))
            .filter(Boolean);
        if (!sourceChildren.length) return false;
        const sourceNode = {
            kind: "add_builder",
            label: "实例化组原型",
            children: sourceChildren
        };
        historyCapture("create_instantiated_group");
        const snapshot = makeBuilderSnapshotFromNode(sourceNode);
        if (!snapshot) {
            showToast("创建实例化组失败：无法建立实例原型", "error");
            return false;
        }
        const reference = makeNode(BUILDER_REFERENCE_KIND, {
            label: "实例化组",
            params: {
                snapshotId: snapshot.id,
                parameterId: "",
                instanceMode: "static",
                instanceBindingMode: "indexed",
                ox: 0,
                oy: 0,
                oz: 0,
                scale: 1,
                rotationDeg: 0,
                rotationAxisX: 0,
                rotationAxisY: 1,
                rotationAxisZ: 0,
                overrides: {}
            }
        });
        if (!reference) return false;
        reference.params.parameterId = `pb_instance_${reference.id}`;
        reference.children = [];

        const index = Math.min(...rows.map((row) => row.ctx.index));
        const selectedIds = new Set(rows.map((row) => row.id));
        for (let i = parentList.length - 1; i >= 0; i -= 1) {
            if (selectedIds.has(parentList[i]?.id)) parentList.splice(i, 1);
        }
        parentList.splice(Math.max(0, Math.min(index, parentList.length)), 0, reference);
        normalizeNodeTree(state.root);
        ensureAxisEverywhere();
        scheduleAutoSave();
        renderAll();
        if (typeof setCardSelectionIds === "function") setCardSelectionIds([reference.id], { replace: true, focus: true });
        setFocusedNode(reference.id, false);
        showToast(`已创建实例化组（${sourceChildren.length} 张卡片）`, "success");
        return true;
    }

    function buildGroupActionMenuEntry(ids, options = {}) {
        const validIds = normalizeActionTargetIds(ids);
        if (!validIds.length) return null;
        const mode = options.mode || "create";
        const label = mode === "convert" ? "转换" : "创建组";
        return {
            label,
            children: createGroupTypeMenuItems(validIds, options.sourceKind, Object.assign({}, options, { mode }))
        };
    }

    function copyGroupPresentation(sourceNode, targetNode) {
        if (!sourceNode || !targetNode) return;
        if (sourceNode.label !== undefined) targetNode.label = sourceNode.label;
        if (sourceNode.folded !== undefined) targetNode.folded = !!sourceNode.folded;
        if (sourceNode.collapsed !== undefined) targetNode.collapsed = !!sourceNode.collapsed;
        if (sourceNode.bodyHeight !== undefined) targetNode.bodyHeight = sourceNode.bodyHeight;
        if (sourceNode.subWidth !== undefined) targetNode.subWidth = sourceNode.subWidth;
        if (sourceNode.subHeight !== undefined) targetNode.subHeight = sourceNode.subHeight;
        if (Array.isArray(sourceNode.terms)) targetNode.terms = clonePlain(sourceNode.terms);
    }

    function copyCompatibleGroupParams(sourceNode, replacement) {
        if (!sourceNode || !replacement) return;
        const src = sourceNode.params || {};
        const dst = replacement.params || (replacement.params = {});
        if (replacement.kind === "add_builder") {
            dst.ox = Number(src.ox) || 0;
            dst.oy = Number(src.oy) || 0;
            dst.oz = Number(src.oz) || 0;
        } else if (replacement.kind === "clear_as_mask") {
            dst.maskRange = Number(src.maskRange) || dst.maskRange || 1;
        } else if (replacement.kind === "add_with") {
            dst.r = Number(src.r) || dst.r;
            dst.c = Number(src.c) || dst.c;
            dst.rotateToCenter = src.rotateToCenter !== undefined ? !!src.rotateToCenter : !!dst.rotateToCenter;
            dst.rotateReverse = !!src.rotateReverse;
            dst.rotateOffsetEnabled = !!src.rotateOffsetEnabled;
            dst.rox = Number(src.rox) || 0;
            dst.roy = Number(src.roy) || 0;
            dst.roz = Number(src.roz) || 0;
            dst.ox = Number(src.ox) || 0;
            dst.oy = Number(src.oy) || 0;
            dst.oz = Number(src.oz) || 0;
            dst.previewBeforeOffsetEnabled = !!src.previewBeforeOffsetEnabled;
        }
    }

    function makeUprightTwistDeg(axis, toPoint, upRef = U.v(0, 1, 0)) {
        const forward = U.norm(axis || U.v(0, 1, 0));
        const target = U.norm(toPoint || U.v(0, 1, 0));
        if (U.len(forward) <= 1e-9 || U.len(target) <= 1e-9) return 0;
        const buildBasis = (dir) => {
            let r = U.cross(upRef, dir);
            if (U.len(r) <= 1e-9) {
                const altUp = Math.abs(upRef.y) > 0.9 ? U.v(1, 0, 0) : U.v(0, 1, 0);
                r = U.cross(altUp, dir);
            }
            if (U.len(r) <= 1e-9) return null;
            r = U.norm(r);
            const u = U.norm(U.cross(dir, r));
            return { r, u, f: dir };
        };
        const from = buildBasis(forward);
        const to = buildBasis(target);
        if (!from || !to) return 0;
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(
            new THREE.Vector3(from.f.x, from.f.y, from.f.z),
            new THREE.Vector3(target.x, target.y, target.z)
        );
        const uAligned = new THREE.Vector3(from.u.x, from.u.y, from.u.z).applyQuaternion(q).normalize();
        const targetU = new THREE.Vector3(to.u.x, to.u.y, to.u.z).normalize();
        const forwardVec = new THREE.Vector3(target.x, target.y, target.z).normalize();
        const cross = new THREE.Vector3().crossVectors(uAligned, targetU);
        const sin = forwardVec.dot(cross);
        const cos = uAligned.dot(targetU);
        return Math.atan2(sin, cos) * 180 / Math.PI;
    }

    function makeRotateNodesForAddWith(base, params, childAxis) {
        const p = params || {};
        const targetPoint = p.rotateOffsetEnabled
            ? U.v(Number(p.rox) || 0, Number(p.roy) || 0, Number(p.roz) || 0)
            : U.v(0, 0, 0);
        const b = U.v(Number(base?.x) || 0, Number(base?.y) || 0, Number(base?.z) || 0);
        const rotateTarget = p.rotateReverse ? U.add(targetPoint, b) : U.sub(targetPoint, b);
        const axis = childAxis || U.v(0, 1, 0);
        const twistDeg = makeUprightTwistDeg(axis, rotateTarget);
        return [
            makeNode("rotate_to", {
                params: {
                    mode: "originEnd",
                    ox: 0,
                    oy: 0,
                    oz: 0,
                    ex: Number(rotateTarget.x) || 0,
                    ey: Number(rotateTarget.y) || 0,
                    ez: Number(rotateTarget.z) || 0
                }
            }),
            makeNode("rotate_as_axis", {
                params: {
                    deg: twistDeg,
                    degUnit: "deg",
                    useCustomAxis: true,
                    ax: Number(rotateTarget.x) || 0,
                    ay: Number(rotateTarget.y) || 0,
                    az: Number(rotateTarget.z) || 0
                }
            })
        ];
    }

    function buildExpandedAddWithGroup(node, targetKind) {
        const outer = makeNode(targetKind || "add_builder");
        copyGroupPresentation(node, outer);
        const p = node && node.params ? node.params : {};
        const count = Math.max(0, Math.trunc(Number(p.c)));
        const radius = Number(p.r);
        const rotateToCenter = !!p.rotateToCenter;
        const rotateReverse = !!p.rotateReverse;
        const rotateOffsetEnabled = !!p.rotateOffsetEnabled;
        const offset = {
            x: Number(p.ox) || 0,
            y: Number(p.oy) || 0,
            z: Number(p.oz) || 0
        };
        const rotateOffset = {
            x: Number(p.rox) || 0,
            y: Number(p.roy) || 0,
            z: Number(p.roz) || 0
        };
        const verts = (typeof U !== "undefined" && U && typeof U.getPolygonInCircleVertices === "function")
            ? (U.getPolygonInCircleVertices(count, radius) || [])
            : [];
        const childAxis = (() => {
            try {
                const child = evalBuilderWithMeta(node.children || [], U.v(0, 1, 0));
                return child?.axis || U.v(0, 1, 0);
            } catch {
                return U.v(0, 1, 0);
            }
        })();
        outer.children = [];
        for (const base of verts) {
            const inner = makeNode("add_builder", {
                params: {
                    ox: (Number(base?.x) || 0) + offset.x,
                    oy: (Number(base?.y) || 0) + offset.y,
                    oz: (Number(base?.z) || 0) + offset.z
                }
            });
            inner.children = cloneNodeListDeep(node.children || []);
            if (rotateToCenter) {
                inner.children.push(...makeRotateNodesForAddWith(base, {
                    rotateOffsetEnabled,
                    rotateReverse,
                    rox: rotateOffset.x,
                    roy: rotateOffset.y,
                    roz: rotateOffset.z
                }, childAxis));
            }
            outer.children.push(inner);
        }
        return outer;
    }

    function buildExpandedEffectRingGroup(node) {
        const p = node?.params || {};
        const ids = Array.isArray(p.snapshotIds) ? p.snapshotIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
        if (!ids.length) return null;
        const snapshots = ensureBuilderSnapshotState();
        const count = Math.max(1, Math.trunc(Number(p.count) || 12));
        const radius = Number(p.radius) || 0;
        const startDeg = Number(p.startDeg) || 0;
        const origin = U.v(Number(p.originX) || 0, Number(p.originY) || 0, Number(p.originZ) || 0);
        const rawAxis = U.v(Number(p.axisX) || 0, Number(p.axisY) || 0, Number.isFinite(Number(p.axisZ)) ? Number(p.axisZ) : 1);
        const axisLength = U.len(rawAxis);
        const ringAxis = axisLength > 1e-9
            ? U.v(rawAxis.x / axisLength, rawAxis.y / axisLength, rawAxis.z / axisLength)
            : U.v(0, 0, 1);
        const outer = makeNode("add_builder", {
            label: node.label || "环形放置",
            params: {
                ox: Number(p.offsetX) || 0,
                oy: Number(p.offsetY) || 0,
                oz: Number(p.offsetZ) || 0
            }
        });
        copyGroupPresentation(node, outer);
        outer.children = [];
        const usedIds = collectNodeIds(state.root);

        for (let index = 0; index < count; index += 1) {
            const snapshot = snapshots[ids[index % ids.length]];
            if (!snapshot) return null;
            const angle = (startDeg + index * 360 / count) * Math.PI / 180;
            const radial = U.v(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            const slot = makeNode("add_builder", {
                label: `${snapshot.name || "预设"} #${index + 1}`,
                params: {
                    ox: origin.x + radial.x,
                    oy: origin.y,
                    oz: origin.z + radial.z
                }
            });
            slot.children = materializeBuilderReferenceChildren(snapshot, {
                params: {
                    instanceMode: "static",
                    overrides: deepCloneJson(snapshot.staticOverrides || {}) || {}
                }
            });
            const snapshotOrigin = normalizePointValue(snapshot.origin);
            if (Math.abs(snapshotOrigin.x) > 1e-9 || Math.abs(snapshotOrigin.y) > 1e-9 || Math.abs(snapshotOrigin.z) > 1e-9) {
                slot.children.push(makeNode("points_on_each_offset", {
                    params: {
                        offX: -snapshotOrigin.x,
                        offY: -snapshotOrigin.y,
                        offZ: -snapshotOrigin.z,
                        kotlinMode: "direct3"
                    }
                }));
            }
            if (p.faceCenter) {
                const target = p.reverse ? radial : U.v(-radial.x, -radial.y, -radial.z);
                if (U.len(target) > 1e-9) {
                    slot.children.push(makeNode("axis", { params: { x: ringAxis.x, y: ringAxis.y, z: ringAxis.z } }));
                    slot.children.push(makeNode("rotate_to", {
                        params: {
                            mode: "toVec",
                            tox: target.x,
                            toy: target.y,
                            toz: target.z,
                            ox: 0,
                            oy: 0,
                            oz: 0,
                            ex: 0,
                            ey: 0,
                            ez: 1
                        }
                    }));
                }
            }
            reassignNodeIdsDeep(slot, usedIds);
            outer.children.push(slot);
        }
        return outer;
    }

    function convertSingleGroupNode(sourceNode, targetKind, options = {}) {
        if (!sourceNode || !sourceNode.kind) return false;
        if (!isBuilderContainerKind(sourceNode.kind)
            && sourceNode.kind !== BUILDER_REFERENCE_KIND
            && sourceNode.kind !== EFFECT_RING_KIND) return false;
        const ctx = findNodeContextById(sourceNode.id);
        if (!ctx || !ctx.node || !Array.isArray(ctx.parentList)) return false;
        const parentList = ctx.parentList;
        const at = ctx.index;
        if (!Number.isInteger(at) || at < 0 || at >= parentList.length) return false;

        let replacement = null;
        if (sourceNode.kind === EFFECT_RING_KIND && targetKind === "add_builder") {
            replacement = buildExpandedEffectRingGroup(sourceNode);
            if (!replacement) {
                showToast("环形放置展开失败：实例原型不存在", "error");
                return false;
            }
        } else if (sourceNode.kind === BUILDER_REFERENCE_KIND && targetKind === "add_builder") {
            const snapshot = ensureBuilderSnapshotState()[String(sourceNode.params?.snapshotId || "")];
            if (!snapshot) return false;
            replacement = makeNode("add_builder", {
                label: sourceNode.label || snapshot.name,
                params: {
                    ox: Number(sourceNode.params?.ox) || 0,
                    oy: Number(sourceNode.params?.oy) || 0,
                    oz: Number(sourceNode.params?.oz) || 0
                }
            });
            replacement.children = materializeBuilderReferenceChildren(snapshot, sourceNode);
            if (Math.abs(Number(sourceNode.params?.rotationDeg) || 0) > 1e-9) {
                replacement.children.push(makeNode("rotate_as_axis", {
                    params: {
                        deg: Number(sourceNode.params.rotationDeg) || 0,
                        degUnit: "deg",
                        useCustomAxis: true,
                        ax: Number(sourceNode.params.rotationAxisX) || 0,
                        ay: Number(sourceNode.params.rotationAxisY) || 1,
                        az: Number(sourceNode.params.rotationAxisZ) || 0
                    }
                }));
            }
        }
        const isExpandedAddWith = sourceNode.kind === "add_with" && !!options.expanded && (targetKind === "add_builder" || targetKind === "clear_as_mask");
        if (replacement) {
            // 已在上面从项目快照恢复为普通组。
        } else if (isExpandedAddWith) {
            replacement = buildExpandedAddWithGroup(sourceNode, targetKind);
        } else {
            replacement = makeNode(targetKind);
            copyGroupPresentation(sourceNode, replacement);
            replacement.children = cloneNodeListDeep(sourceNode.children || []);
            copyCompatibleGroupParams(sourceNode, replacement);
        }

        historyCapture(`convert_group_${sourceNode.kind}_to_${targetKind}${options.expanded ? "_expanded" : ""}`);
        parentList.splice(at, 1, replacement);
        ensureAxisEverywhere();
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds([replacement.id], { replace: true, focus: false, syncWithParamSync: false });
        }
        setFocusedNode(replacement.id, false);
        renderAll();
        requestAnimationFrame(() => {
            const el = elCardsRoot?.querySelector?.(`.card[data-id="${replacement.id}"]`);
            if (el) {
                try { el.focus(); } catch {}
                try { el.scrollIntoView({ block: "nearest" }); } catch {}
            }
        });
        const label = targetKind === "add_builder"
            ? (sourceNode.kind === "add_with" && options.expanded ? "旋转嵌套后的普通组" : "普通组")
            : targetKind === "clear_as_mask"
                ? (options.expanded ? "旋转嵌套后的蒙版组" : "蒙版组")
                : "旋转嵌套组";
        showToast(`已转换为${label}`, "success");
        return true;
    }

    function bindActionMenuDismiss() {
        if (document.__pbActionMenuBound) return;
        document.__pbActionMenuBound = true;
        document.addEventListener("pointerdown", (ev) => {
            if (!actionMenuEl || actionMenuEl.classList.contains("hidden")) return;
            if (actionMenuEl.contains(ev.target)) return;
            if (Array.isArray(actionMenuEl.__pbSubmenus) && actionMenuEl.__pbSubmenus.some((entry) => entry?.el?.contains(ev.target))) return;
            if (actionMenuEl.__pbSubmenu && actionMenuEl.__pbSubmenu.contains(ev.target)) return;
            hideActionMenu();
        }, true);
        document.addEventListener("pointerdown", (ev) => {
            if (!quickSyncPanelEl || quickSyncPanelEl.classList.contains("hidden")) return;
            if (quickSyncPanelEl.contains(ev.target)) return;
            hideQuickSyncPanel();
        }, true);
        window.addEventListener("resize", () => {
            hideActionMenu();
            hideQuickSyncPanel();
        });
        window.addEventListener("scroll", () => {
            hideActionMenu();
            hideQuickSyncPanel();
        }, true);
        window.addEventListener("blur", () => {
            hideActionMenu();
            hideQuickSyncPanel();
        });
        window.addEventListener("keydown", (ev) => {
            if (ev.code === "Escape") {
                hideActionMenu();
                hideQuickSyncPanel();
            }
        }, true);
    }

    function setRightPanelPage(page) {
        const next = page === "kotlin"
            ? "kotlin"
            : (page === "instances" ? "instances" : (page === "presets" ? "presets" : "params"));
        rightPanelPage = next;
        const paramsActive = next === "params";
        const presetsActive = next === "presets";
        const instancesActive = next === "instances";
        const kotlinActive = next === "kotlin";
        btnRightParamsTab?.classList.toggle("active", paramsActive);
        btnRightPresetsTab?.classList.toggle("active", presetsActive);
        btnRightInstancesTab?.classList.toggle("active", instancesActive);
        btnRightKotlinTab?.classList.toggle("active", kotlinActive);
        rightParamsPage?.classList.toggle("active", paramsActive);
        rightPresetsPage?.classList.toggle("active", presetsActive);
        rightInstancesPage?.classList.toggle("active", instancesActive);
        rightKotlinPage?.classList.toggle("active", kotlinActive);
        btnRightParamsTab?.setAttribute("aria-selected", paramsActive ? "true" : "false");
        btnRightPresetsTab?.setAttribute("aria-selected", presetsActive ? "true" : "false");
        btnRightInstancesTab?.setAttribute("aria-selected", instancesActive ? "true" : "false");
        btnRightKotlinTab?.setAttribute("aria-selected", kotlinActive ? "true" : "false");
        if (paramsActive) scheduleParamEditorRender();
        if (presetsActive) schedulePresetLibraryRender();
        if (instancesActive) renderBuilderInstanceRegistry();
    }

    function bindRightPanelTabs() {
        btnRightParamsTab?.addEventListener("click", () => setRightPanelPage("params"));
        btnRightPresetsTab?.addEventListener("click", () => setRightPanelPage("presets"));
        btnRightInstancesTab?.addEventListener("click", () => setRightPanelPage("instances"));
        btnRightKotlinTab?.addEventListener("click", () => setRightPanelPage("kotlin"));
        setRightPanelPage(rightPanelPage);
    }

    function detachParamEditorHandlers() {
        if (!paramEditorHost) return;
        if (paramEditorHost.__pbParamEditorInputHandler) {
            paramEditorHost.removeEventListener("input", paramEditorHost.__pbParamEditorInputHandler);
            paramEditorHost.__pbParamEditorInputHandler = null;
        }
        if (paramEditorHost.__pbParamEditorChangeHandler) {
            paramEditorHost.removeEventListener("change", paramEditorHost.__pbParamEditorChangeHandler);
            paramEditorHost.__pbParamEditorChangeHandler = null;
        }
    }

    function isParamEditorRerenderControl(ev) {
        const t = ev && ev.target;
        const tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
        const type = t && t.type ? String(t.type).toLowerCase() : "";
        return tag === "SELECT" || (tag === "INPUT" && (type === "checkbox" || type === "radio"));
    }

    function getParamEditorTargetIds() {
        const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIds = selectedSet ? normalizeActionTargetIds(Array.from(selectedSet)) : [];
        if (focusedNodeId && selectedIds.includes(focusedNodeId)) {
            return [focusedNodeId].concat(selectedIds.filter((id) => id !== focusedNodeId));
        }
        if (selectedIds.length) return selectedIds;
        if (focusedNodeId) return normalizeActionTargetIds([focusedNodeId]);
        return [];
    }

    function getParamEditorNodes(ids) {
        const out = [];
        for (const id of ids || []) {
            const ctx = findNodeContextById(id);
            if (ctx && ctx.node) out.push(ctx.node);
        }
        return out;
    }

    function setParamEditorSyncHint(text) {
        if (!paramEditorSyncHint) return;
        const msg = String(text || "").trim();
        paramEditorSyncHint.textContent = msg;
        paramEditorSyncHint.classList.toggle("hidden", !msg);
    }

    function renderParamEditorEmpty(text) {
        if (!paramEditorHost) return;
        const empty = document.createElement("div");
        empty.className = "param-editor-empty";
        empty.textContent = text;
        paramEditorHost.appendChild(empty);
    }

    function syncDockedParamEditorFromSource(sourceId, options = {}) {
        if (!paramEditorSyncState || !sourceId) return;
        const sourceCtx = findNodeContextById(sourceId);
        if (!sourceCtx || !sourceCtx.node) return;
        const source = sourceCtx.node;
        const prev = paramEditorSyncState.snapshots.get(sourceId) || {};
        const diff = diffPlain(prev, source.params || {});
        if (!diff.length) {
            if (options.rerender) scheduleParamEditorRender();
            return;
        }
        if (!paramEditorHistoryLockTimer) {
            historyCapture("right_param_sync");
            paramEditorHistoryLockTimer = setTimeout(() => {
                paramEditorHistoryLockTimer = 0;
            }, 180);
        }

        let changed = false;
        for (const id of paramEditorSyncState.ids) {
            if (id === sourceId) continue;
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node || ctx.node.kind !== paramEditorSyncState.kind) continue;
            if (!ctx.node.params) ctx.node.params = {};
            applyPlainDiff(ctx.node.params, diff);
            changed = true;
        }

        for (const id of paramEditorSyncState.ids) {
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node) continue;
            paramEditorSyncState.snapshots.set(id, clonePlain(ctx.node.params || {}));
        }

        if (changed) {
            rebuildPreviewAndKotlin();
            if (typeof renderCards === "function") renderCards();
        }
        if (options.rerender) scheduleParamEditorRender();
    }

    function updateRightParamEditor() {
        if (!paramEditorHost || !paramEditorStatus) return;
        detachParamEditorHandlers();
        if (presetRingTool?.parentElement === paramEditorHost) {
            presetRingTool.classList.add("hidden");
            presetRingTool.classList.remove("effect-ring-param-editor");
            effectRingEditorParking?.appendChild(presetRingTool);
        }
        paramEditorHost.innerHTML = "";
        setParamEditorSyncHint("");
        paramEditorSyncState = null;

        const selectedGuide = referenceGuideController?.getSelectedGuide?.();
        if (selectedGuide) {
            paramEditorStatus.textContent = `正在编辑参考线：${selectedGuide.name || `${selectedGuide.axis} 轴参考线`}`;
            referenceGuideController.renderSelectedEditor?.(paramEditorHost);
            return;
        }

        const ids = getParamEditorTargetIds();
        const nodes = getParamEditorNodes(ids);
        if (!nodes.length) {
            paramEditorStatus.textContent = "选择左侧卡片后编辑参数";
            renderParamEditorEmpty("未选择卡片");
            return;
        }

        const first = nodes[0];
        const firstKind = first.kind;
        const sameKind = nodes.every((node) => node && node.kind === firstKind);
        if (!sameKind) {
            paramEditorStatus.textContent = "编辑参数请选择同类型的卡片";
            renderParamEditorEmpty("编辑参数请选择同类型的卡片");
            return;
        }

        const kindDef = (KIND && KIND[firstKind]) || {};
        const title = kindDef.title || firstKind || "未命名卡片";
        const sourceTitle = (typeof formatNodePathLabel === "function" ? formatNodePathLabel(first.id) : "") || title;
        const source = first;
        if (nodes.length > 1) {
            paramEditorStatus.textContent = `正在编辑：${sourceTitle}（${nodes.length} 张）`;
            setParamEditorSyncHint(`参数同步已启用：${nodes.length} 张同类型卡片会使用同一套参数`);
            paramEditorSyncState = {
                ids: ids.slice(),
                kind: firstKind,
                sourceId: source.id,
                snapshots: new Map()
            };
            for (const node of nodes) {
                paramEditorSyncState.snapshots.set(node.id, clonePlain(node.params || {}));
            }
        } else {
            paramEditorStatus.textContent = `正在编辑：${sourceTitle}`;
        }

        if (typeof renderParamsEditors === "function") {
            renderParamsEditors(paramEditorHost, source, nodes.length > 1 ? "参数同步" : "卡片编辑", {
                paramsOnly: true,
                includeFourierTerms: nodes.length === 1 && firstKind === "add_fourier_series"
            });
        }
        applyParamStepToInputs();

        const onInput = () => {
            if (paramEditorSyncState) syncDockedParamEditorFromSource(source.id);
        };
        const onChange = (ev) => {
            const rerender = isParamEditorRerenderControl(ev);
            if (paramEditorSyncState) syncDockedParamEditorFromSource(source.id, { rerender });
            else if (rerender) scheduleParamEditorRender();
        };
        paramEditorHost.__pbParamEditorInputHandler = onInput;
        paramEditorHost.__pbParamEditorChangeHandler = onChange;
        paramEditorHost.addEventListener("input", onInput);
        paramEditorHost.addEventListener("change", onChange);
    }

    function scheduleParamEditorRender() {
        if (paramEditorRenderRaf) return;
        paramEditorRenderRaf = requestAnimationFrame(() => {
            paramEditorRenderRaf = 0;
            updateRightParamEditor();
        });
    }

    /*
     * The theme list and normalizer come from the shared store, not from a copy
     * here.
     *
     * This file used to keep its own THEMES array that still contained dark-2 /
     * dark-3 / light-2 / light-3, and its own normalizeTheme() that treated them
     * as valid. The shared normalizer collapses them to dark-1 / light-1, so
     * PointsBuilder would write "dark-2" into the shared key and every other tool
     * would read it back as "dark-1" — the tools genuinely disagreed about the
     * current theme, and those ids have no stylesheet either.
     */
    const THEME_ORDER = ALL_THEMES;
    // Shared with every other tool so the theme is global, not per-builder.
    const THEME_KEY = APP_THEME_KEY;
    const GRID_HELPER_SIZE = 256;
    const GRID_HELPER_DIVISIONS = 256;
    const MIRROR_HINT_GRID_DURATION_MS = 800;
    const MIRROR_HINT_GRID_MAX_OPACITY = 0.9;
    const MIRROR_HINT_GRID_OFFSET = -0.04;
    const MIRROR_HINT_GRID_COLOR_MIX = 0.44;
    const LOCK_AXIS_TICK_STEP = 1;
    const LOCK_AXIS_TICK_HALF_LEN = 0.28;
    const LOCK_AXIS_GUIDE_COLOR = 0x6cff98;
    /*
     * normalizeTheme is the shared one (imported above), not a local copy. The
     * copy that used to live here sent the retired light ids to dark-1, so a
     * project saved under light-2 opened in a dark theme; the shared normalizer
     * maps them to light-1, which is what every other tool already does.
     */
    const readCssColor = (name, fallback) => {
        if (!document || !document.body) return fallback;
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
    };
    const applySceneTheme = () => {
        const gridColor = readCssColor("--grid-color", "#617d9b");
        const pointColor = readCssColor("--point-color", "#ffffff");
        const focusColor = readCssColor("--point-focus", "#ffcc33");
        const syncColor = readCssColor("--point-sync", "#5dd6ff");
        const offsetColor = readCssColor("--point-offset", "#ff6ad5");
        const previewSceneColor = readCssColor("--wb-preview-scene", "#0b1017");

        defaultPointColor.set(pointColor);
        focusPointColor.set(focusColor);
        syncPointColor.set(syncColor);
        offsetPointColor.set(offsetColor);

        if (scene) scene.background = new THREE.Color(previewSceneColor);
        if (renderer) renderer.setClearColor(previewSceneColor, 1);

        if (adaptiveGrid) adaptiveGrid.setColor(gridColor);
        updateGridForPlane();
        updateLockPlaneGuideVisual();
        updateMirrorPlaneHintTheme();
        refreshPointBaseColors();
    };
    const broadcastThemeToShell = (theme) => {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: "coo-legacy-theme", theme: String(theme || "") }, window.location.origin);
            }
        } catch {
            // Cross-origin parents simply do not get the hint.
        }
    };
    const applyTheme = (id) => {
        const finalId = normalizeTheme(id);
        document.body.setAttribute("data-theme", finalId);
        if (themeSelect && themeSelect.value !== finalId) themeSelect.value = finalId;
        applySceneTheme();
        broadcastThemeToShell(finalId);
    };
    const initTheme = () => {
        // Another tool (or the shell) changing the theme applies here live.
        watchAppTheme((next) => applyTheme(next));
        const saved = localStorage.getItem(THEME_KEY) || "";
        const initial = normalizeTheme(saved || "dark-1");
        applyTheme(initial);
        localStorage.setItem(THEME_KEY, initial);
        if (!themeSelect) return;
        themeSelect.addEventListener("change", () => {
            const next = normalizeTheme(themeSelect.value);
            applyTheme(next);
            localStorage.setItem(THEME_KEY, next);
            saveSettingsToStorage();
        });
    };
    const cycleTheme = (dir) => {
        const cur = document.body.getAttribute("data-theme") || "dark-1";
        const idx = Math.max(0, THEME_ORDER.indexOf(cur));
        const next = THEME_ORDER[(idx + dir + THEME_ORDER.length) % THEME_ORDER.length];
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    };
    const bindThemeHotkeys = () => {
        window.addEventListener("keydown", (e) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.key !== "[" && e.key !== "]") return;
            const el = document.activeElement;
            const isEditable = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName));
            if (isEditable) return;
            e.preventDefault();
            cycleTheme(e.key === "]" ? 1 : -1);
        });
    };

    const PB_COMP_CONTEXT_KEY = "pb_comp_context_v1";
    const COMPOSITION_REFERENCE_BUILD_VERSION = "20260828_1";
    const compositionNumericContext = {
        enabled: false,
        map: { PI: Math.PI },
        suggestions: [],
        vectorOptions: [],
        cache: new Map(),
        version: 0
    };
    const isCompositionPointsBuilder = !!(document.body?.classList?.contains("composition-no-kotlin"));
    const COMPOSITION_REFERENCE_VISIBILITY_KEY = "cpb_composition_reference_visibility_v2";
    const COMPOSITION_REFERENCE_ONLY_CURRENT_KEY = "cpb_composition_reference_only_current_v1";
    const COMPOSITION_REFERENCE_OPACITY_KEY = "cpb_composition_reference_opacity_v1";
    const COMPOSITION_REFERENCE_COLLAPSED_KEY = "cpb_composition_reference_collapsed_v2";
    let compositionReferenceState = null;
    let compositionReferenceSnapshot = null;
    let compositionReferenceStatus = "";
    let compositionReferenceCardId = "";
    let compositionReferenceCurrentSourcePoints = null;
    let compositionReferenceCurrentAnchorRefs = [];
    let compositionReferenceFrameIndex = 0;
    let compositionReferenceOnlyCurrent = false;
    let compositionReferenceOpacity = 0.3;
    let activeBuilderColumn = "builder";
    let referenceGuideController = null;
    let gridInspector = null;
    let compositionReferenceVisibility = Object.create(null);
    let compositionReferenceCollapsed = Object.create(null);
    let compositionReferenceSceneReady = false;
    let compositionReferenceHydrating = false;
    let compositionReferenceFrameDragging = false;
    let compositionReferenceHydrationToken = 0;
    let compositionReferenceHydrationRetryHandle = 0;
    let compositionReferenceCollapseListenerBound = false;
    let compositionReferenceGpuMaterial = null;
    let compositionReferenceGpuUniforms = null;
    let compositionReferenceGpuVisibleBuf = null;
    let compositionReferenceGpuDeltaBuf = null;
    let compositionReferenceGpuPointCount = 0;
    let compositionReferenceGpuSnapshotRef = null;
    const CONTEXT_NUMERIC_TYPES = new Set(["Int", "Long", "Float", "Double"]);
    const CONTEXT_VECTOR_TYPES = new Set(["Vec3", "RelativeLocation", "Vector3f"]);

    function transpileKotlinThisQualifierToJs(raw) {
        return String(raw || "").replace(/this@[A-Za-z_][A-Za-z0-9_]*\./g, "");
    }

    function stripNumericSuffix(raw) {
        return transpileKotlinThisQualifierToJs(String(raw || "")).replace(/(\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)[fFdDlL]\b/g, "$1");
    }

    function isNumericLiteral(raw) {
        return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?$/.test(String(raw || "").trim());
    }

    function isIdentifier(raw) {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(raw || "").trim());
    }

    function normalizeContextIdentifier(raw) {
        const text = stripNumericSuffix(String(raw || "").trim());
        return isIdentifier(text) ? text : "";
    }

    const VARIABLE_SUGGESTION_USAGE_KEY = "pb_variable_suggestion_usage_v1";
    let variableSuggestionUsageCache = null;

    function getSuggestionUsageKey(raw) {
        const text = String(raw || "").trim();
        if (!text) return "";
        const base = text.split(".")[0].trim();
        const clean = normalizeContextIdentifier(base);
        return clean || base.toLowerCase();
    }

    function loadVariableSuggestionUsage() {
        if (variableSuggestionUsageCache) return variableSuggestionUsageCache;
        try {
            if (!globalThis.localStorage) throw new Error("localStorage unavailable");
            const raw = localStorage.getItem(VARIABLE_SUGGESTION_USAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            variableSuggestionUsageCache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            variableSuggestionUsageCache = {};
        }
        return variableSuggestionUsageCache;
    }

    function persistVariableSuggestionUsage() {
        if (!variableSuggestionUsageCache) return;
        try {
            if (!globalThis.localStorage) return;
            localStorage.setItem(VARIABLE_SUGGESTION_USAGE_KEY, JSON.stringify(variableSuggestionUsageCache));
        } catch {
            // ignore storage failures
        }
    }

    function getSuggestionUsageRecord(raw) {
        const key = getSuggestionUsageKey(raw);
        if (!key) return { count: 0, lastUsed: 0 };
        const store = loadVariableSuggestionUsage();
        const item = store[key];
        if (!item || typeof item !== "object") return { count: 0, lastUsed: 0 };
        return {
            count: Number(item.count) || 0,
            lastUsed: Number(item.lastUsed) || 0
        };
    }

    function touchSuggestionUsage(raw) {
        const key = getSuggestionUsageKey(raw);
        if (!key) return;
        const store = loadVariableSuggestionUsage();
        const prev = store[key] && typeof store[key] === "object" ? store[key] : { count: 0, lastUsed: 0 };
        store[key] = {
            count: (Number(prev.count) || 0) + 1,
            lastUsed: Date.now()
        };
        variableSuggestionUsageCache = store;
        persistVariableSuggestionUsage();
    }

    function getSuggestionMatchRank(raw, token = "") {
        const name = String(raw || "").trim();
        const needle = String(token || "").trim().toLowerCase();
        if (!needle) return 2;
        const lower = name.toLowerCase();
        if (!lower) return 4;
        if (lower === needle) return 0;
        if (lower.startsWith(needle)) return 1;
        const idx = lower.indexOf(needle);
        if (idx < 0) return 4;
        if (idx === 0) return 1;
        const prev = name[idx - 1];
        if (prev === "_" || prev === "-" || prev === "." || prev === "/" || prev === " " || /[A-Z]/.test(name[idx])) return 2;
        return 3;
    }

    function compareSuggestionNames(a, b, token = "") {
        const textA = String(a || "").trim();
        const textB = String(b || "").trim();
        const rankA = getSuggestionMatchRank(textA, token);
        const rankB = getSuggestionMatchRank(textB, token);
        if (rankA !== rankB) return rankA - rankB;
        const usageA = getSuggestionUsageRecord(textA);
        const usageB = getSuggestionUsageRecord(textB);
        if (usageA.count !== usageB.count) return usageB.count - usageA.count;
        if (usageA.lastUsed !== usageB.lastUsed) return usageB.lastUsed - usageA.lastUsed;
        const lowerA = textA.toLowerCase();
        const lowerB = textB.toLowerCase();
        if (lowerA.length !== lowerB.length) return lowerA.length - lowerB.length;
        return lowerA.localeCompare(lowerB);
    }

    function sortSuggestionNames(items, token = "") {
        return Array.from(items || []).sort((a, b) => compareSuggestionNames(a, b, token));
    }

    function isFiniteVectorLike(value) {
        return !!value
            && Number.isFinite(Number(value.x))
            && Number.isFinite(Number(value.y))
            && Number.isFinite(Number(value.z));
    }

    function makeVectorProxy(vec, typeName = "") {
        const x = Number.isFinite(Number(vec?.x)) ? Number(vec.x) : 0;
        const y = Number.isFinite(Number(vec?.y)) ? Number(vec.y) : 0;
        const z = Number.isFinite(Number(vec?.z)) ? Number(vec.z) : 0;
        const out = { x, y, z };
        if (String(typeName || "").trim() === "Vec3") {
            out.asRelative = () => ({ x, y, z });
        }
        return Object.freeze(out);
    }

    function evaluateExpressionWithMap(rawExpr, vars = {}) {
        const expr = stripNumericSuffix(String(rawExpr || "").trim());
        if (!expr) return 0;
        if (isNumericLiteral(expr)) {
            const n = Number(expr);
            return Number.isFinite(n) ? n : 0;
        }
        const keys = Object.keys(vars || {}).filter((k) => k !== "PI" && isIdentifier(k));
        const values = keys.map((k) => vars[k]);
        try {
            const fn = new Function(...keys, "PI", "Math", `return (${expr});`);
            const out = fn(...values, Math.PI, Math);
            return Number.isFinite(Number(out)) ? Number(out) : 0;
        } catch {
            return 0;
        }
    }

    function parseContextVectorValue(rawExpr, vars, resolveVectorByName, stack = new Set()) {
        const expr = stripNumericSuffix(String(rawExpr || "").trim());
        if (!expr) return null;
        if (expr === "Vec3.ZERO") return { x: 0, y: 0, z: 0 };
        if (expr === "RelativeLocation.yAxis()") return { x: 0, y: 1, z: 0 };
        const refName = normalizeContextIdentifier(expr);
        if (refName) {
            const resolved = typeof resolveVectorByName === "function" ? resolveVectorByName(refName, stack) : null;
            if (isFiniteVectorLike(resolved)) return resolved;
            const direct = vars?.[refName];
            if (isFiniteVectorLike(direct)) {
                return {
                    x: Number(direct.x) || 0,
                    y: Number(direct.y) || 0,
                    z: Number(direct.z) || 0
                };
            }
        }
        const m = expr.match(/^(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i);
        if (!m) return null;
        return {
            x: evaluateExpressionWithMap(m[1], vars || {}),
            y: evaluateExpressionWithMap(m[2], vars || {}),
            z: evaluateExpressionWithMap(m[3], vars || {})
        };
    }

    function buildCompositionContext(payload) {
        const map = { PI: Math.PI };
        const suggestions = [];
        const vectorOptions = [];
        const numericEntries = [];
        const vectorEntries = new Map();
        const pushSuggestion = (value, type, label = "") => {
            const text = String(value || "").trim();
            const normalizedType = String(type || "").trim();
            if (!text || !CONTEXT_NUMERIC_TYPES.has(normalizedType)) return;
            if (suggestions.some((item) => item.value === text && item.type === normalizedType)) return;
            suggestions.push({ value: text, type: normalizedType, label: String(label || "").trim() });
        };
        const pushNumericEntry = (name, expr) => {
            if (!name || !isIdentifier(name)) return;
            numericEntries.push({ name, expr: String(expr || "0") });
        };
        const baseMap = (payload && typeof payload.numericMap === "object") ? payload.numericMap : {};
        for (const key of Object.keys(baseMap || {})) {
            if (!isIdentifier(key)) continue;
            const n = Number(baseMap[key]);
            if (Number.isFinite(n)) map[key] = n;
        }
        const allScopedVars = []
            .concat(Array.isArray(payload?.globalVars) ? payload.globalVars : [])
            .concat(Array.isArray(payload?.globalConsts) ? payload.globalConsts : [])
            .concat(Array.isArray(payload?.localVars) ? payload.localVars : []);
        for (const item of allScopedVars) {
            const name = normalizeContextIdentifier(item?.name || "");
            const type = String(item?.type || "").trim();
            const value = String(item?.value ?? item?.expr ?? "").trim();
            const ref = String(item?.ref || name).trim() || name;
            if (!name) continue;
            if (CONTEXT_NUMERIC_TYPES.has(type)) {
                pushNumericEntry(name, value || "0");
                pushSuggestion(ref, type, `${ref}（${String(item?.scope || "变量").trim() || "变量"} ${type}）`);
                if (ref !== name) pushSuggestion(name, type, `${name}（${type}）`);
                continue;
            }
            if (type === "Boolean") {
                map[name] = /^true$/i.test(value);
                continue;
            }
            if (CONTEXT_VECTOR_TYPES.has(type)) {
                vectorEntries.set(name, { name, type, expr: value, ref, scope: String(item?.scope || "") });
                continue;
            }
        }
        for (let pass = 0; pass < 8; pass++) {
            let changed = false;
            for (const entry of numericEntries) {
                const n = evaluateExpressionWithMap(entry.expr, map);
                if (!Number.isFinite(n)) continue;
                if (map[entry.name] !== n) {
                    map[entry.name] = n;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        const resolvedVectors = new Map();
        const resolvingTag = Symbol("context_vector_resolving");
        const resolveVectorByName = (name, stack = new Set()) => {
            if (!name || !vectorEntries.has(name)) return null;
            if (resolvedVectors.has(name)) {
                const cached = resolvedVectors.get(name);
                if (cached === resolvingTag) return { x: 0, y: 0, z: 0 };
                return cached;
            }
            if (stack.has(name) || stack.size > 16) return { x: 0, y: 0, z: 0 };
            resolvedVectors.set(name, resolvingTag);
            const info = vectorEntries.get(name);
            const nextStack = new Set(stack);
            nextStack.add(name);
            const scope = Object.assign({}, map);
            for (const [resolvedName, vec] of resolvedVectors.entries()) {
                if (vec === resolvingTag || !isFiniteVectorLike(vec)) continue;
                const resolvedInfo = vectorEntries.get(resolvedName);
                scope[resolvedName] = makeVectorProxy(vec, resolvedInfo?.type || "");
            }
            const vec = parseContextVectorValue(info?.expr || "", scope, resolveVectorByName, nextStack) || { x: 0, y: 0, z: 0 };
            resolvedVectors.set(name, vec);
            map[name] = makeVectorProxy(vec, info?.type || "");
            return vec;
        };
        for (const [name, info] of vectorEntries.entries()) {
            resolveVectorByName(name, new Set());
            vectorOptions.push({
                name,
                ref: String(info?.ref || name).trim() || name,
                type: String(info?.type || "").trim(),
                label: `${String(info?.ref || name).trim() || name}（${String(info?.scope || "变量").trim() || "变量"} ${String(info?.type || "Vec3").trim() || "Vec3"}）`
            });
        }
        vectorOptions.sort((a, b) => String(a.ref).localeCompare(String(b.ref)));
        for (const option of vectorOptions) {
            const componentType = option.type === "Vector3f" ? "Float" : "Double";
            pushSuggestion(`${option.ref}.x`, componentType, `${option.ref}.x（${componentType}）`);
            pushSuggestion(`${option.ref}.y`, componentType, `${option.ref}.y（${componentType}）`);
            pushSuggestion(`${option.ref}.z`, componentType, `${option.ref}.z（${componentType}）`);
            if (option.ref !== option.name) {
                pushSuggestion(`${option.name}.x`, componentType, `${option.name}.x（${componentType}）`);
                pushSuggestion(`${option.name}.y`, componentType, `${option.name}.y（${componentType}）`);
                pushSuggestion(`${option.name}.z`, componentType, `${option.name}.z（${componentType}）`);
            }
        }
        return {
            enabled: suggestions.length > 0 || vectorOptions.length > 0 || Object.keys(map).some((k) => k !== "PI"),
            map,
            suggestions: suggestions.slice().sort((a, b) => a.value.localeCompare(b.value)),
            vectorOptions
        };
    }

    function getCompositionReferenceTimelineInfo(snapshot, hydrating = false) {
        const frames = Array.isArray(snapshot?.frames) ? snapshot.frames : [];
        const gpu = snapshot?.gpu?.enabled === true && typeof snapshot.gpu === "object"
            ? snapshot.gpu
            : null;
        const gpuTimeline = Array.isArray(gpu?.timeline) ? gpu.timeline : [];
        const frameTicks = Array.isArray(snapshot?.frameTicks) ? snapshot.frameTicks : [];
        const totalTicks = Math.max(1, Math.trunc(Number(
            snapshot?.totalTicks || snapshot?.frameCount || gpuTimeline.length || frames.length || 1
        ) || 1));
        const availableFrameCount = gpu ? gpuTimeline.length : frames.length;
        // Keep the frame-only expression explicit for CPU snapshots; GPU snapshots
        // extend the same timeline with their uniform-driven entries.
        const legacyFrameTimelineCount = Math.max(totalTicks, frames.length);
        const timelineCount = Math.max(legacyFrameTimelineCount, availableFrameCount);
        return {
            frames,
            gpu,
            gpuTimeline,
            frameTicks,
            totalTicks,
            timelineCount,
            availableFrameCount,
            pending: snapshot?.complete === false
                || hydrating
                || (availableFrameCount < timelineCount && snapshot?.frameSampled !== true)
        };
    }

    function loadCompositionNumericContext() {
        compositionReferenceHydrationToken += 1;
        compositionReferenceHydrating = false;
        const previousFrameTicks = Array.isArray(compositionReferenceSnapshot?.frameTicks)
            ? compositionReferenceSnapshot.frameTicks
            : [];
        const previousFrameIndex = Math.max(0, Math.trunc(Number(compositionReferenceFrameIndex) || 0));
        const previousFrameTick = Number(previousFrameTicks?.[previousFrameIndex] ?? previousFrameIndex);
        let payload = null;
        try {
            const raw = localStorage.getItem(PB_COMP_CONTEXT_KEY);
            if (raw) payload = JSON.parse(raw);
        } catch {
            payload = null;
        }
        const next = buildCompositionContext(payload || {});
        compositionNumericContext.enabled = !!next.enabled;
        compositionNumericContext.map = next.map || { PI: Math.PI };
        compositionNumericContext.suggestions = Array.isArray(next.suggestions) ? next.suggestions : [];
        compositionNumericContext.vectorOptions = Array.isArray(next.vectorOptions) ? next.vectorOptions : [];
        compositionNumericContext.cache.clear();
        compositionNumericContext.version += 1;
        compositionBuilderInstanceRegistry = Array.isArray(payload?.builderInstanceRegistry)
            ? deepCloneJson(payload.builderInstanceRegistry) || []
            : [];
        compositionBuilderInstanceRegistryRevision = String(
            payload?.compositionState?.revision
            || payload?.compositionReferenceRevision
            || ""
        );
        try {
            const rawRenames = localStorage.getItem(BUILDER_INSTANCE_RENAME_STORAGE_KEY);
            const renamePayload = rawRenames ? JSON.parse(rawRenames) : null;
            compositionBuilderInstanceRenames = !renamePayload?.compositionRevision
                || String(renamePayload.compositionRevision) === compositionBuilderInstanceRegistryRevision
                ? (Array.isArray(renamePayload?.renames) ? renamePayload.renames : [])
                : [];
        } catch {
            compositionBuilderInstanceRenames = [];
        }
        compositionReferenceState = payload?.compositionState && typeof payload.compositionState === "object"
            ? payload.compositionState
            : null;
        const storedReference = payload?.compositionReference && typeof payload.compositionReference === "object"
            ? payload.compositionReference
            : null;
        const compositionRevision = String(
            payload?.compositionReferenceRevision
            || payload?.compositionState?.revision
            || ""
        );
        compositionReferenceSnapshot = storedReference
            && String(storedReference.referenceVersion || "") === COMPOSITION_REFERENCE_BUILD_VERSION
            && compositionRevision
            && String(storedReference.compositionRevision || "") === compositionRevision
            ? storedReference
            : null;
        compositionReferenceStatus = String(payload?.compositionReferenceStatus || "");
        compositionReferenceCardId = String(payload?.cardId || new URLSearchParams(location.search).get("card") || "").trim();
        const snapshotMatchesCurrentCard = String(payload?.compositionReference?.currentCardId || "") === compositionReferenceCardId;
        compositionReferenceCurrentSourcePoints = snapshotMatchesCurrentCard && Array.isArray(payload?.compositionReference?.currentSourcePoints)
            ? payload.compositionReference.currentSourcePoints.map((point) => ({
                x: num(point?.x),
                y: num(point?.y),
                z: num(point?.z)
            }))
            : null;
        compositionReferenceCurrentAnchorRefs = Array.isArray(payload?.compositionReference?.currentAnchorRefs)
            ? payload.compositionReference.currentAnchorRefs.map((index) => {
                const value = Math.trunc(Number(index));
                return Number.isFinite(value) && value >= 0 ? value : -1;
            })
            : [];
        const nextFrameTicks = Array.isArray(compositionReferenceSnapshot?.frameTicks)
            ? compositionReferenceSnapshot.frameTicks
            : [];
        if (nextFrameTicks.length > 1 && Number.isFinite(previousFrameTick)) {
            let nearestIndex = 0;
            let nearestDistance = Number.POSITIVE_INFINITY;
            for (let index = 0; index < nextFrameTicks.length; index++) {
                const distance = Math.abs(Number(nextFrameTicks[index]) - previousFrameTick);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = index;
                }
            }
            compositionReferenceFrameIndex = nearestIndex;
        } else if (Number.isFinite(previousFrameTick) && Number(compositionReferenceSnapshot?.totalTicks || 0) > 1) {
            compositionReferenceFrameIndex = Math.max(0, Math.min(
                Math.max(0, Math.trunc(Number(compositionReferenceSnapshot.totalTicks) || 1) - 1),
                Math.trunc(previousFrameTick)
            ));
        } else {
            compositionReferenceFrameIndex = 0;
        }
        compositionReferenceOnlyCurrent = loadCompositionReferenceOnlyCurrent();
        compositionReferenceOpacity = loadCompositionReferenceOpacity();
        loadCompositionReferenceVisibility();
        loadCompositionReferenceCollapsed();
        if (!compositionReferenceFrameDragging) {
            renderCompositionReferencePanel();
            rebuildCompositionReferencePreview();
        }
        if (rightPanelPage === "instances") renderBuilderInstanceRegistry();
        if (compositionReferenceSnapshot?.storage === "indexeddb"
            && String(compositionReferenceSnapshot.storageKey || "").trim()
            && !(Array.isArray(compositionReferenceSnapshot.frames) && compositionReferenceSnapshot.frames.length)
            && !(compositionReferenceSnapshot.gpu?.enabled === true
                && Array.isArray(compositionReferenceSnapshot.gpu.timeline)
                && compositionReferenceSnapshot.gpu.timeline.length)) {
            hydrateCompositionReferenceSnapshot(compositionReferenceSnapshot.storageKey);
        }
    }

    function loadCompositionReferenceOnlyCurrent() {
        try {
            return localStorage.getItem(COMPOSITION_REFERENCE_ONLY_CURRENT_KEY) === "true";
        } catch {
            return false;
        }
    }

    function saveCompositionReferenceOnlyCurrent() {
        try {
            localStorage.setItem(COMPOSITION_REFERENCE_ONLY_CURRENT_KEY, compositionReferenceOnlyCurrent ? "true" : "false");
        } catch {
        }
    }

    async function hydrateCompositionReferenceSnapshot(storageKey) {
        const token = ++compositionReferenceHydrationToken;
        compositionReferenceHydrating = true;
        if (compositionReferenceHydrationRetryHandle) {
            clearTimeout(compositionReferenceHydrationRetryHandle);
            compositionReferenceHydrationRetryHandle = 0;
        }
        if (!compositionReferenceFrameDragging) renderCompositionReferencePanel();
        try {
            const stored = await getCompositionReferenceSnapshot(storageKey);
            if (token !== compositionReferenceHydrationToken) return;
            const storedGpu = stored?.gpu?.enabled === true && typeof stored.gpu === "object"
                ? stored.gpu
                : null;
            const storedGpuTimeline = Array.isArray(storedGpu?.timeline) ? storedGpu.timeline : [];
            if (!stored || (!storedGpuTimeline.length && (!Array.isArray(stored.frames) || !stored.frames.length))) {
                throw new Error("Composition reference snapshot is empty");
            }
            if (String(stored.compositionRevision || "") !== String(compositionReferenceSnapshot?.compositionRevision || "")) {
                throw new Error("Composition reference snapshot is stale");
            }
            const storedFrames = Array.isArray(stored.frames) ? stored.frames : [];
            const storedTotalTicks = Math.max(1, Math.trunc(Number(
                stored.totalTicks
                || compositionReferenceSnapshot?.totalTicks
                || stored.frameCount
                || storedGpuTimeline.length
                || storedFrames.length
                || 1
            ) || 1));
            compositionReferenceSnapshot = {
                ...compositionReferenceSnapshot,
                totalTicks: storedTotalTicks,
                frameTicks: Array.isArray(stored.frameTicks)
                    ? stored.frameTicks
                    : (Array.isArray(compositionReferenceSnapshot?.frameTicks) ? compositionReferenceSnapshot.frameTicks : []),
                frameCount: Math.max(storedTotalTicks, Math.trunc(Number(stored.frameCount) || 0), storedFrames.length),
                availableFrameCount: storedGpu ? storedGpuTimeline.length : storedFrames.length,
                frames: storedFrames,
                visibleMasks: Array.isArray(stored.visibleMasks) ? stored.visibleMasks : [],
                colors: Array.isArray(stored.colors) ? stored.colors : [],
                sizes: Array.isArray(stored.sizes) ? stored.sizes : [],
                alphas: Array.isArray(stored.alphas) ? stored.alphas : [],
                gpu: storedGpu || compositionReferenceSnapshot?.gpu || null,
                complete: stored.complete !== false
            };
            compositionReferenceHydrating = stored.complete === false;
            compositionReferenceStatus = stored.complete === false ? "pending" : "ready";
            if (!compositionReferenceFrameDragging) renderCompositionReferencePanel();
            rebuildCompositionReferencePreview();
            if (stored.complete === false && token === compositionReferenceHydrationToken) {
                compositionReferenceHydrationRetryHandle = setTimeout(() => {
                    compositionReferenceHydrationRetryHandle = 0;
                    if (token === compositionReferenceHydrationToken) hydrateCompositionReferenceSnapshot(storageKey);
                }, 200);
            }
        } catch (error) {
            if (token !== compositionReferenceHydrationToken) return;
            compositionReferenceHydrating = false;
            compositionReferenceStatus = "storage_unavailable";
            if (!compositionReferenceFrameDragging) renderCompositionReferencePanel();
            rebuildCompositionReferencePreview();
            console.warn("load Composition reference snapshot failed:", error);
        }
    }

    function loadCompositionReferenceOpacity() {
        try {
            const value = Number(localStorage.getItem(COMPOSITION_REFERENCE_OPACITY_KEY));
            return Number.isFinite(value) ? Math.max(0.05, Math.min(1, value)) : 0.3;
        } catch {
            return 0.3;
        }
    }

    function saveCompositionReferenceOpacity() {
        try {
            localStorage.setItem(COMPOSITION_REFERENCE_OPACITY_KEY, String(compositionReferenceOpacity));
        } catch {
        }
    }

    function loadCompositionReferenceVisibility() {
        compositionReferenceVisibility = Object.create(null);
        try {
            const raw = localStorage.getItem(COMPOSITION_REFERENCE_VISIBILITY_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === "object") {
                for (const [key, value] of Object.entries(parsed)) {
                    compositionReferenceVisibility[String(key)] = value !== false;
                }
            }
        } catch {
        }
    }

    function saveCompositionReferenceVisibility() {
        try {
            localStorage.setItem(COMPOSITION_REFERENCE_VISIBILITY_KEY, JSON.stringify(compositionReferenceVisibility));
        } catch {
        }
    }

    function loadCompositionReferenceCollapsed() {
        compositionReferenceCollapsed = Object.create(null);
        try {
            const raw = localStorage.getItem(COMPOSITION_REFERENCE_COLLAPSED_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === "object") {
                for (const [key, value] of Object.entries(parsed)) {
                    compositionReferenceCollapsed[String(key)] = value === true;
                }
            }
        } catch {
        }
    }

    function saveCompositionReferenceCollapsed() {
        try {
            localStorage.setItem(COMPOSITION_REFERENCE_COLLAPSED_KEY, JSON.stringify(compositionReferenceCollapsed));
        } catch {
        }
    }

    function escapeReferenceText(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function compositionReferenceNodeId(cardId, path = []) {
        const id = String(cardId || "").trim();
        const normalizedPath = Array.isArray(path) ? path.map((value) => Math.max(0, Math.trunc(Number(value) || 0))) : [];
        return normalizedPath.length ? `${id}::shape:${normalizedPath.join(".")}` : id;
    }

    function compositionReferenceTargetPath(targetRaw) {
        const target = String(targetRaw || "root");
        if (!target.startsWith("tree_node:")) return [];
        try {
            const path = JSON.parse(target.slice("tree_node:".length));
            return Array.isArray(path) ? path.map((value) => Math.max(0, Math.trunc(Number(value) || 0))) : [];
        } catch {
            return [];
        }
    }

    function isCompositionReferenceDescendant(idRaw, ancestorRaw) {
        const id = String(idRaw || "");
        const ancestor = String(ancestorRaw || "");
        if (!id || !ancestor) return false;
        if (id === ancestor) return true;
        return ancestor.includes("::shape:")
            ? id.startsWith(`${ancestor}.`)
            : id.startsWith(`${ancestor}::shape:`);
    }

    function decodeCompositionReferenceFrame(raw, expectedLength = 0) {
        if (raw instanceof Float32Array) return expectedLength > 0 && raw.length !== expectedLength ? null : raw;
        if (raw instanceof ArrayBuffer) {
            const view = new Float32Array(raw);
            return expectedLength > 0 && view.length !== expectedLength ? null : view;
        }
        if (Array.isArray(raw)) {
            const view = Float32Array.from(raw, (value) => Number(value) || 0);
            return expectedLength > 0 && view.length !== expectedLength ? null : view;
        }
        if (typeof raw !== "string" || !raw) return null;
        try {
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
            if (bytes.byteLength % 4 !== 0) return null;
            const view = new Float32Array(bytes.buffer);
            if (expectedLength > 0 && view.length !== expectedLength) return null;
            return view;
        } catch {
            return null;
        }
    }

    function decodeCompositionReferenceMask(raw, expectedLength = 0) {
        if (raw instanceof Uint8Array) return raw;
        if (Array.isArray(raw)) return Uint8Array.from(raw, (value) => value ? 1 : 0);
        if (typeof raw !== "string" || !raw) return null;
        try {
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
            if (expectedLength > 0 && bytes.length !== expectedLength) return null;
            return bytes;
        } catch {
            return null;
        }
    }

    function decodeCompositionReferenceVisualArray(raw, expectedLength = 0, normalizeByteLike = false) {
        const expected = Math.max(0, Math.trunc(Number(expectedLength) || 0));
        if (raw instanceof Uint8Array) {
            if (expected > 0 && raw.length !== expected) return null;
            return Float32Array.from(raw, (value) => (Number(value) || 0) / 255);
        }
        if (raw instanceof Float32Array) {
            if (expected > 0 && raw.length !== expected) return null;
            return raw;
        }
        if (raw instanceof ArrayBuffer) {
            const view = new Float32Array(raw);
            if (expected > 0 && view.length !== expected) return null;
            return view;
        }
        if (Array.isArray(raw)) {
            if (expected > 0 && raw.length !== expected) return null;
            const values = Float32Array.from(raw, (value) => Number(value) || 0);
            let byteLike = false;
            for (let i = 0; normalizeByteLike && i < values.length; i++) {
                if (Math.abs(values[i]) > 1.0001) {
                    byteLike = true;
                    break;
                }
            }
            return byteLike ? Float32Array.from(values, (value) => value / 255) : values;
        }
        if (typeof raw !== "string" || !raw) return null;
        return decodeCompositionReferenceFrame(raw, expected);
    }

    function compositionReferenceGroups() {
        const cards = Array.isArray(compositionReferenceState?.cards) ? compositionReferenceState.cards : [];
        const snapshotGroups = Array.isArray(compositionReferenceSnapshot?.groups)
            ? compositionReferenceSnapshot.groups
            : [];
        const currentOwnerId = String(compositionReferenceSnapshot?.currentOwnerId || "")
            || compositionReferenceNodeId(
                compositionReferenceCardId,
                compositionReferenceTargetPath(compositionReferenceSnapshot?.currentTarget || "root")
            );
        const countById = new Map(snapshotGroups.map((group) => [String(group?.id || ""), Math.max(0, Math.trunc(Number(group?.pointCount) || 0))]));
        const rows = [];
        const appendTree = (card, index, parentId = null, depth = 0, path = [], isCurrentCard = false, rootCardId = "") => {
            const rootId = rootCardId || String(card?.id || `card-${index}`);
            const nodePath = Array.isArray(path) ? path.slice() : [];
            const rowId = nodePath.length ? compositionReferenceNodeId(rootId, nodePath) : rootId;
            const children = Array.isArray(card?.shapeChildren)
                ? card.shapeChildren
                : (Array.isArray(card?.children) ? card.children : []);
            const isRoot = nodePath.length === 0;
            rows.push({
                id: rowId,
                parentId,
                depth,
                path: nodePath,
                name: String(card?.name || (isRoot ? `卡片 ${index + 1}` : `子节点 ${nodePath[nodePath.length - 1] + 1}`)),
                dataType: String(card?.type || card?.dataType || "single"),
                isCurrent: rowId === currentOwnerId,
                isCurrentCard: isCurrentCard || (isRoot && rootId === compositionReferenceCardId),
                isCurrentTarget: rowId === currentOwnerId,
                childIds: children.map((_, childIndex) => compositionReferenceNodeId(rootId, nodePath.concat(childIndex)))
            });
            children.forEach((child, childIndex) => appendTree(
                child,
                index,
                rowId,
                depth + 1,
                nodePath.concat(childIndex),
                isCurrentCard || (isRoot && rootId === compositionReferenceCardId),
                rootId
            ));
        };
        cards.forEach((card, index) => appendTree(card, index));
        const ownerIds = Array.from(countById.keys());
        const countForRow = (row) => ownerIds
            .filter((ownerId) => isCompositionReferenceDescendant(ownerId, row.id))
            .reduce((sum, ownerId) => sum + (countById.get(ownerId) || 0), 0);
        const selfVisible = new Map();
        for (const row of rows) {
            const hasStoredVisibility = Object.prototype.hasOwnProperty.call(compositionReferenceVisibility, row.id);
            // The current card is represented in the tree as a placement
            // placeholder, but its rendered reference stays opt-in. This
            // applies to nested Composition nodes as well as the root card.
            const defaultVisible = row.isCurrentCard ? false : true;
            selfVisible.set(row.id, hasStoredVisibility
                ? compositionReferenceVisibility[row.id] !== false
                : defaultVisible);
        }
        const effectiveVisible = new Map();
        for (const row of rows) {
            const parentVisible = row.parentId ? effectiveVisible.get(row.parentId) !== false : true;
            effectiveVisible.set(row.id, parentVisible && selfVisible.get(row.id) !== false);
        }
        return rows.map((row) => {
            return {
                ...row,
                pointCount: countForRow(row),
                visible: compositionReferenceOnlyCurrent
                    ? (row.isCurrentCard && effectiveVisible.get(row.id) === true)
                    : effectiveVisible.get(row.id) === true
            };
        });
    }

    function toggleCompositionReferenceCollapse(button) {
        const id = String(button?.dataset?.referenceCollapse || "");
        if (!id) return;
        compositionReferenceCollapsed[id] = compositionReferenceCollapsed[id] !== true;
        saveCompositionReferenceCollapsed();
        const section = button.closest?.("[data-reference-group]");
        const children = section?.querySelector?.(":scope > .composition-reference-children");
        const collapsed = compositionReferenceCollapsed[id] === true;
        const title = section?.querySelector?.(":scope > .composition-reference-group-head .composition-reference-group-title")?.textContent || "节点";
        button.setAttribute("aria-label", `${collapsed ? "展开" : "折叠"} ${title}`);
        button.title = collapsed ? "展开节点" : "折叠节点";
        button.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
        section?.classList.toggle("collapsed", collapsed);
        if (!children) return;
        children.classList.toggle("collapsed", collapsed);
        if (collapsed) {
            children.style.maxHeight = `${children.scrollHeight}px`;
            requestAnimationFrame(() => {
                children.style.maxHeight = "0px";
            });
        } else {
            children.style.maxHeight = "0px";
            requestAnimationFrame(() => {
                children.classList.remove("collapsed");
                children.style.maxHeight = `${children.scrollHeight}px`;
            });
            window.setTimeout(() => {
                if (!children.classList.contains("collapsed")) children.style.maxHeight = "";
            }, 260);
        }
    }

    function renderCompositionReferencePanel() {
        if (!elCompositionReferenceRoot || !isCompositionPointsBuilder) return;
        const groups = compositionReferenceGroups();
        if (!groups.length) {
            elCompositionReferenceRoot.innerHTML = '<div class="composition-reference-empty">当前没有可用的 Composition 快照。</div>';
            return;
        }
        const hasStoredSnapshot = !!(compositionReferenceSnapshot?.storage === "indexeddb"
            && String(compositionReferenceSnapshot.storageKey || "").trim());
        const hasGpuSnapshot = compositionReferenceSnapshot?.gpu?.enabled === true
            && Array.isArray(compositionReferenceSnapshot.gpu.timeline)
            && compositionReferenceSnapshot.gpu.timeline.length > 0;
        const hasSnapshot = !!(compositionReferenceSnapshot
            && ((Array.isArray(compositionReferenceSnapshot.frames) && compositionReferenceSnapshot.frames.length)
                || hasGpuSnapshot
                || hasStoredSnapshot));
        const sampled = compositionReferenceSnapshot?.sampled === true;
        const frameSampled = compositionReferenceSnapshot?.frameSampled === true;
        const timeline = getCompositionReferenceTimelineInfo(compositionReferenceSnapshot, compositionReferenceHydrating);
        const frames = timeline.frames;
        const availableFrameCount = timeline.availableFrameCount;
        const rawFrameTicks = timeline.frameTicks;
        const timelineCount = timeline.timelineCount;
        const safeFrameIndex = timelineCount > 0
            ? Math.max(0, Math.min(timelineCount - 1, Math.trunc(Number(compositionReferenceFrameIndex) || 0)))
            : 0;
        compositionReferenceFrameIndex = safeFrameIndex;
        const frameTick = Number(rawFrameTicks?.[safeFrameIndex] ?? safeFrameIndex);
        const controls = `<section class="composition-reference-controls" aria-label="Composition 预览控制">
            <div class="composition-reference-controls-head">
                <div>
                    <div class="composition-reference-controls-title">Composition 预览</div>
                    <div class="composition-reference-controls-subtitle">静态帧 · 手动切换</div>
                </div>
                <output class="composition-reference-frame-label" data-reference-frame-label>帧 ${timelineCount ? safeFrameIndex + 1 : 0} / ${timelineCount || 0} · Tick ${Number.isFinite(frameTick) ? frameTick : 0}</output>
            </div>
            <label class="composition-reference-current-only">
                <input type="checkbox" data-reference-only-current ${compositionReferenceOnlyCurrent ? "checked" : ""}/>
                <span>只显示当前卡片</span>
            </label>
            <label class="composition-reference-opacity">
                <span>参考不透明度</span>
                <input type="range" min="0.05" max="1" step="0.05" value="${compositionReferenceOpacity}" data-reference-opacity aria-label="参考不透明度"/>
                <output data-reference-opacity-label>${Math.round(compositionReferenceOpacity * 100)}%</output>
            </label>
            <div class="composition-reference-frame-controls">
                <button class="btn composition-reference-frame-btn" type="button" data-reference-frame-action="prev" ${timelineCount <= 1 ? "disabled" : ""}>上一帧</button>
                <input class="composition-reference-frame-range" type="range" min="0" max="${Math.max(0, timelineCount - 1)}" step="1" value="${safeFrameIndex}" data-reference-frame-range aria-label="Composition 预览进度" ${timelineCount > 1 ? "" : "disabled"}/>
                <button class="btn composition-reference-frame-btn" type="button" data-reference-frame-action="next" ${timelineCount <= 1 ? "disabled" : ""}>下一帧</button>
            </div>
        </section>`;
        const groupsById = new Map(groups.map((group) => [group.id, group]));
        const renderGroup = (group) => {
            const title = group.isCurrent
                ? `${group.depth > 0 ? "当前节点" : "当前卡片"} · ${group.name}`
                : group.name;
            const typeLabel = group.dataType === "single" ? "Single" : group.dataType;
            const meta = group.isCurrent
                ? "Composition 位置"
                : `${sampled ? "抽样 " : ""}${group.pointCount} 点 · ${typeLabel}`;
            const eyePath = group.visible
                ? '<path d="M2 12s3.2-5 10-5 10 5 10 5-3.2 5-10 5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.4"/>'
                : '<path d="m3 3 18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.8 0 10 6 10 6a18.5 18.5 0 0 1-3.2 3.8M6.2 6.2C3.5 8 2 12 2 12s3.2 6 10 6c1.3 0 2.4-.2 3.4-.6"/>';
            const eyeDisabled = !group.isCurrentCard && compositionReferenceOnlyCurrent;
            const childGroups = (group.childIds || []).map((id) => groupsById.get(id)).filter(Boolean);
            const hasChildren = childGroups.length > 0;
            const hasStoredCollapsed = Object.prototype.hasOwnProperty.call(compositionReferenceCollapsed, group.id);
            const collapsed = hasChildren && (hasStoredCollapsed
                ? compositionReferenceCollapsed[group.id] === true
                : !group.isCurrentCard);
            const collapseIcon = collapsed
                ? '<path d="m9 6 6 6-6 6"/>'
                : '<path d="m6 9 6 6 6-6"/>';
            return `<section class="composition-reference-group${collapsed ? " collapsed" : ""}" data-reference-group="${escapeReferenceText(group.id)}" data-reference-depth="${group.depth || 0}" style="--reference-depth:${group.depth || 0}">
                <div class="composition-reference-group-head">
                    ${hasChildren ? `<button class="composition-reference-collapse" type="button" data-reference-collapse="${escapeReferenceText(group.id)}" aria-label="${collapsed ? "展开" : "折叠"} ${escapeReferenceText(title)}" title="${collapsed ? "展开节点" : "折叠节点"}"><svg viewBox="0 0 24 24" aria-hidden="true">${collapseIcon}</svg></button>` : '<span class="composition-reference-collapse-spacer" aria-hidden="true"></span>'}
                    <div class="composition-reference-group-title" title="${escapeReferenceText(title)}">${escapeReferenceText(title)}</div>
                    <div class="composition-reference-group-meta">${escapeReferenceText(meta)}</div>
                    <button class="composition-reference-eye${group.visible ? " visible" : ""}" type="button" data-reference-eye="${escapeReferenceText(group.id)}" ${eyeDisabled ? "disabled" : ""} aria-label="${group.visible ? "隐藏" : "显示"} ${escapeReferenceText(group.isCurrent ? (group.depth > 0 ? "当前节点" : "当前卡片") : group.name)}" title="${eyeDisabled ? "已启用只显示当前卡片" : (group.visible ? "隐藏" : "显示")}"><svg viewBox="0 0 24 24" aria-hidden="true">${eyePath}</svg></button>
                </div>
                ${group.isCurrent ? `<div class="composition-reference-placeholder">当前编辑内容保留在主场景；可使用当前卡片或当前节点行的小眼睛显示参考位置。</div>` : ""}
                ${hasChildren ? `<div class="composition-reference-children${collapsed ? " collapsed" : ""}">${childGroups.map(renderGroup).join("")}</div>` : ""}
            </section>`;
        };
        const html = groups.filter((group) => !group.parentId).map(renderGroup).join("");
        const pendingNote = compositionReferenceStatus === "pending" || timeline.pending
            ? `<div class="composition-reference-note">完整参考帧正在后台加载；当前已完成 ${Math.min(availableFrameCount, timelineCount)} / ${timelineCount} Tick，可先切换已完成帧。</div>`
            : "";
        const snapshotNote = `${pendingNote}<div class="composition-reference-note">参考层${sampled ? `已从 ${escapeReferenceText(compositionReferenceSnapshot?.sourcePointTotal || 0)} 点中抽样` : "包含最终展开"}显示${frameSampled ? `；完整周期 ${escapeReferenceText(compositionReferenceSnapshot?.totalTicks || 0)} Tick 已均匀取样` : ""}；点位淡化且不可选中，但会参与粒子吸附。</div>`;
        const unavailableNote = compositionReferenceStatus === "storage_limit"
            ? '<div class="composition-reference-empty">Composition 参考快照过大，未能写入本地存储。</div>'
            : compositionReferenceStatus === "storage_unavailable"
                ? '<div class="composition-reference-empty">完整 Composition 参考快照存储不可用，未加载参考点。</div>'
            : compositionReferenceStatus === "pending"
                ? '<div class="composition-reference-note">参考快照正在后台更新；当前先显示已有快照，完成后会自动替换。</div>'
            : '<div class="composition-reference-empty">Composition 预览尚未生成快照。</div>';
        elCompositionReferenceRoot.innerHTML = `${controls}${html}${hasSnapshot ? snapshotNote : unavailableNote}`;
        const onlyCurrent = elCompositionReferenceRoot.querySelector("[data-reference-only-current]");
        onlyCurrent?.addEventListener("change", () => {
            compositionReferenceOnlyCurrent = !!onlyCurrent.checked;
            saveCompositionReferenceOnlyCurrent();
            renderCompositionReferencePanel();
            rebuildCompositionReferencePreview();
        });
        const frameRange = elCompositionReferenceRoot.querySelector("[data-reference-frame-range]");
        frameRange?.addEventListener("pointerdown", () => {
            compositionReferenceFrameDragging = true;
        });
        const finishFrameDrag = () => {
            if (!compositionReferenceFrameDragging) return;
            compositionReferenceFrameDragging = false;
            renderCompositionReferencePanel();
            rebuildCompositionReferencePreview();
        };
        frameRange?.addEventListener("pointerup", finishFrameDrag);
        frameRange?.addEventListener("pointercancel", finishFrameDrag);
        frameRange?.addEventListener("blur", finishFrameDrag);
        frameRange?.addEventListener("input", () => {
            setCompositionReferenceFrame(Number(frameRange.value));
        });
        frameRange?.addEventListener("change", () => {
            setCompositionReferenceFrame(Number(frameRange.value));
        });
        const opacityRange = elCompositionReferenceRoot.querySelector("[data-reference-opacity]");
        opacityRange?.addEventListener("input", () => {
            const value = Number(opacityRange.value);
            compositionReferenceOpacity = Number.isFinite(value)
                ? Math.max(0.05, Math.min(1, value))
                : 0.3;
            saveCompositionReferenceOpacity();
            if (compositionReferencePointsObj?.material) {
                compositionReferencePointsObj.material.opacity = compositionReferenceOpacity;
                compositionReferencePointsObj.material.needsUpdate = true;
            }
            const label = elCompositionReferenceRoot.querySelector("[data-reference-opacity-label]");
            if (label) label.textContent = `${Math.round(compositionReferenceOpacity * 100)}%`;
        });
        elCompositionReferenceRoot.querySelectorAll("[data-reference-frame-action]").forEach((button) => {
            button.addEventListener("click", () => {
                const delta = button.dataset.referenceFrameAction === "prev" ? -1 : 1;
                setCompositionReferenceFrame(compositionReferenceFrameIndex + delta);
            });
        });
        elCompositionReferenceRoot.querySelectorAll("[data-reference-eye]").forEach((button) => {
            button.addEventListener("click", () => {
                const id = String(button.dataset.referenceEye || "");
                if (!id) return;
                const group = compositionReferenceGroups().find((item) => item.id === id);
                const hasStoredVisibility = Object.prototype.hasOwnProperty.call(compositionReferenceVisibility, id);
                const defaultVisible = group?.isCurrentCard ? false : true;
                const currentSelfVisible = hasStoredVisibility
                    ? compositionReferenceVisibility[id] !== false
                    : defaultVisible;
                compositionReferenceVisibility[id] = !currentSelfVisible;
                saveCompositionReferenceVisibility();
                renderCompositionReferencePanel();
                rebuildCompositionReferencePreview();
            });
        });
        elCompositionReferenceRoot.querySelectorAll("[data-reference-collapse]").forEach((button) => {
            button.addEventListener("click", () => {
                const id = String(button.dataset.referenceCollapse || "");
                if (!id) return;
                compositionReferenceCollapsed[id] = compositionReferenceCollapsed[id] !== true;
                saveCompositionReferenceCollapsed();
                const section = button.closest?.("[data-reference-group]");
                const children = section?.querySelector?.(":scope > .composition-reference-children");
                const collapsed = compositionReferenceCollapsed[id] === true;
                const title = section?.querySelector?.(":scope > .composition-reference-group-head .composition-reference-group-title")?.textContent || "节点";
                button.setAttribute("aria-label", `${collapsed ? "展开" : "折叠"} ${title}`);
                button.title = collapsed ? "展开节点" : "折叠节点";
                button.innerHTML = collapsed
                    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
                    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
                section?.classList.toggle("collapsed", collapsed);
                if (!children) return;
                children.classList.toggle("collapsed", collapsed);
                if (collapsed) {
                    children.style.maxHeight = `${children.scrollHeight}px`;
                    requestAnimationFrame(() => {
                        children.style.maxHeight = "0px";
                    });
                } else {
                    children.style.maxHeight = "0px";
                    requestAnimationFrame(() => {
                        children.classList.remove("collapsed");
                        children.style.maxHeight = `${children.scrollHeight}px`;
                    });
                    window.setTimeout(() => {
                        if (!children.classList.contains("collapsed")) children.style.maxHeight = "";
                    }, 260);
                }
            });
        });
    }

    function setCompositionReferenceFrame(nextIndex) {
        const timeline = getCompositionReferenceTimelineInfo(compositionReferenceSnapshot, compositionReferenceHydrating);
        const frames = timeline.frames;
        const frameTicks = timeline.frameTicks;
        const timelineCount = timeline.timelineCount;
        const requested = Number(nextIndex);
        const normalized = Number.isFinite(requested) ? Math.trunc(requested) : 0;
        compositionReferenceFrameIndex = Math.max(0, Math.min(timelineCount - 1, normalized));
        if (frames.length || timeline.gpuTimeline.length) {
            rebuildCompositionReferencePreview(compositionReferenceFrameIndex);
        } else if (compositionReferenceHydrating) {
            // Keep the requested frame while IndexedDB is loading; hydration uses this index.
            lastCompositionReferencePoints = [];
        }
        const label = elCompositionReferenceRoot?.querySelector?.("[data-reference-frame-label]");
        const range = elCompositionReferenceRoot?.querySelector?.("[data-reference-frame-range]");
        const tick = Number(frameTicks?.[compositionReferenceFrameIndex] ?? compositionReferenceFrameIndex);
        if (label) label.textContent = `帧 ${compositionReferenceFrameIndex + 1} / ${timelineCount} · Tick ${Number.isFinite(tick) ? tick : 0}`;
        if (range) range.value = String(compositionReferenceFrameIndex);
    }

    function setBuilderColumnPage(page) {
        const requested = String(page || "builder");
        activeBuilderColumn = requested === "guides"
            ? "guides"
            : requested === "composition" && isCompositionPointsBuilder
                ? "composition"
                : "builder";
        const showBuilder = activeBuilderColumn === "builder";
        const showGuides = activeBuilderColumn === "guides";
        const showComposition = activeBuilderColumn === "composition";
        if (elCardsRoot) {
            elCardsRoot.hidden = !showBuilder;
            elCardsRoot.classList.toggle("composition-page-hidden", !showBuilder);
        }
        if (elReferenceGuidesRoot) {
            elReferenceGuidesRoot.hidden = !showGuides;
            elReferenceGuidesRoot.classList.toggle("composition-page-hidden", !showGuides);
        }
        if (elCompositionReferenceRoot) {
            elCompositionReferenceRoot.hidden = !showComposition;
            elCompositionReferenceRoot.classList.toggle("composition-page-hidden", !showComposition);
        }
        if (elBuilderColumnFootnote) {
            elBuilderColumnFootnote.classList.toggle("composition-page-hidden", !showBuilder);
        }
        if (elBuilderColumnTitleLabel) {
            elBuilderColumnTitleLabel.textContent = showBuilder
                ? "构建列"
                : showGuides ? "参考线" : "Composition 参考";
        }
        for (const [button, active] of [
            [btnBuilderColumnTab, showBuilder],
            [btnReferenceGuidesTab, showGuides],
            [btnCompositionColumnTab, showComposition]
        ]) {
            if (!button) continue;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
        }
        if (showGuides) referenceGuideController?.renderPanel?.();
        if (showComposition) {
            renderCompositionReferencePanel();
            rebuildCompositionReferencePreview();
        }
    }

    function createCompositionReferenceGpuMaterial() {
        const mat = new THREE.PointsMaterial({
            size: Math.max(0.12, pointSize * 0.9),
            sizeAttenuation: true,
            vertexColors: true,
            color: 0xffffff,
            transparent: true,
            opacity: compositionReferenceOpacity,
            depthWrite: false,
            depthTest: true
        });
        mat.defaultAttributeValues = {
            ...(mat.defaultAttributeValues || {}),
            aSize: [1],
            aAlpha: [1],
            aGpuMeta: [0, 0, 0, 0],
            aGpuFadeIn: [0, 0, 0, 0],
            aGpuFadeOut: [0, 0, 0, 0],
            aGpuTransform: [0, 0, 0, 0],
            aGpuTransformVector: [0, 0, 0],
            aGpuScale: [1],
            aGpuLifecycle: [0, 100],
            aGpuAlphaCurve: [1, 1, -2, -2],
            aGpuScaleCurve: [1, 1, -2, -2],
            aGpuColorCurve: [1, 1],
            aReferenceVisible: [1]
        };
        mat.customProgramCacheKey = () => "composition-reference-gpu-v2";
        mat.onBeforeCompile = (shader) => {
            const groupLimit = 24;
            shader.uniforms.uReferenceGpuEnabled = { value: 1 };
            shader.uniforms.uReferenceTick = { value: 0 };
            shader.uniforms.uReferenceCycleTicks = { value: 1 };
            shader.uniforms.uReferencePlayTicks = { value: 1 };
            shader.uniforms.uReferenceGlobalAlpha = { value: 1 };
            shader.uniforms.uReferenceHasLifecycle = { value: 0 };
            shader.uniforms.uReferenceUseSharedTransform = { value: 0 };
            shader.uniforms.uReferenceSharedTransform = { value: new THREE.Vector4() };
            shader.uniforms.uReferenceSharedScale = { value: 1 };
            shader.uniforms.uReferenceGroupCount = { value: 0 };
            shader.uniforms.uReferenceGroupTransforms = {
                value: Array.from({ length: groupLimit }, () => new THREE.Vector4())
            };
            shader.uniforms.uReferenceGroupScales = {
                value: new Float32Array(groupLimit).fill(1)
            };
            shader.uniforms.uReferenceGlobalTransform = { value: new THREE.Matrix4() };
            compositionReferenceGpuUniforms = shader.uniforms;
            const groupTransformSelectors = [];
            const groupScaleSelectors = [];
            for (let i = 0; i < groupLimit; i++) {
                const upper = (i + 1.5).toFixed(1);
                groupTransformSelectors.push(`if (groupIndex < ${upper}) return uReferenceGroupTransforms[${i}];`);
                groupScaleSelectors.push(`if (groupIndex < ${upper}) return uReferenceGroupScales[${i}];`);
            }
            shader.vertexShader = [
                "attribute float aSize;",
                "attribute float aAlpha;",
                "attribute vec4 aGpuMeta;",
                "attribute vec4 aGpuFadeIn;",
                "attribute vec4 aGpuFadeOut;",
                "attribute vec4 aGpuTransform;",
                "attribute vec3 aGpuTransformVector;",
                "attribute float aGpuScale;",
                "attribute vec2 aGpuLifecycle;",
                "attribute vec4 aGpuAlphaCurve;",
                "attribute vec4 aGpuScaleCurve;",
                "attribute float aReferenceVisible;",
                "uniform int uReferenceGpuEnabled;",
                "uniform float uReferenceTick;",
                "uniform float uReferenceCycleTicks;",
                "uniform float uReferencePlayTicks;",
                "uniform float uReferenceGlobalAlpha;",
                "uniform int uReferenceHasLifecycle;",
                "uniform int uReferenceUseSharedTransform;",
                "uniform vec4 uReferenceSharedTransform;",
                "uniform float uReferenceSharedScale;",
                `uniform int uReferenceGroupCount;`,
                `uniform vec4 uReferenceGroupTransforms[${groupLimit}];`,
                `uniform float uReferenceGroupScales[${groupLimit}];`,
                "uniform mat4 uReferenceGlobalTransform;",
                "varying float vReferenceAlpha;",
                "vec3 rotateReferenceVector(vec3 value, vec3 axis, float angle) {",
                "  float axisLength = length(axis);",
                "  if (axisLength < 0.0001) return value;",
                "  vec3 unitAxis = axis / axisLength;",
                "  float c = cos(angle);",
                "  float s = sin(angle);",
                "  return value * c + cross(unitAxis, value) * s + unitAxis * dot(unitAxis, value) * (1.0 - c);",
                "}",
                "vec4 resolveReferenceTransform(float groupIndex, vec4 fallbackValue) {",
                "  if (groupIndex < 0.5) return fallbackValue;",
                ...groupTransformSelectors,
                "  return fallbackValue;",
                "}",
                "float resolveReferenceScale(float groupIndex, float fallbackValue) {",
                "  if (groupIndex < 0.5) return fallbackValue;",
                ...groupScaleSelectors,
                "  return fallbackValue;",
                "}",
                "float sampleReferenceCurve(vec4 curve, float progress) {",
                "  float t = clamp(progress, 0.0, 1.0);",
                "  if (curve.z < -1.5) return 1.0;",
                "  if (curve.z < -0.5) return mix(curve.x, curve.y, t);",
                "  float fadeIn = clamp(curve.z, 0.0, 1.0);",
                "  float fadeOut = clamp(curve.w, fadeIn, 1.0);",
                "  if (t <= fadeIn) return fadeIn > 0.000001 ? curve.x * t / fadeIn : curve.x;",
                "  if (t <= fadeOut) return curve.x;",
                "  return fadeOut < 0.999999 ? curve.x * (1.0 - (t - fadeOut) / (1.0 - fadeOut)) : curve.x;",
                "}",
                ""
            ].join("\n") + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                /gl_PointSize\s*=\s*size\s*;/g,
                [
                    "float referenceAlpha = clamp(aAlpha, 0.0, 1.0) * clamp(uReferenceGlobalAlpha, 0.0, 1.0);",
                    "if (aReferenceVisible < 0.5) referenceAlpha = 0.0;",
                    "float referenceSizeScale = 1.0;",
                    "if (uReferenceGpuEnabled == 1 && abs(aGpuMeta.x) > 0.5) {",
                    "  float cycleAge = mod(uReferenceTick, max(uReferenceCycleTicks, 1.0));",
                    "  float birthTick = max(aGpuMeta.y, 0.0);",
                    "  if (aGpuMeta.x < 0.0 || cycleAge < birthTick) {",
                    "    referenceAlpha = 0.0;",
                    "  } else {",
                    "    float age = max(cycleAge - birthTick, 0.0);",
                    "    float lifetime = max(abs(aGpuLifecycle.y), 1.0);",
                    "    float lifecycleAge = aGpuLifecycle.x;",
                    "    if (aGpuLifecycle.y > 0.0 && uReferenceHasLifecycle == 1) lifecycleAge = clamp(aGpuLifecycle.x + age, 0.0, lifetime);",
                    "    float progress = clamp(lifecycleAge / lifetime, 0.0, 1.0);",
                    "    referenceAlpha *= sampleReferenceCurve(aGpuAlphaCurve, progress);",
                    "    referenceSizeScale = sampleReferenceCurve(aGpuScaleCurve, progress);",
                    "    if (aGpuFadeOut.x > 0.0 && cycleAge >= max(uReferencePlayTicks, 1.0)) {",
                    "      referenceAlpha *= mix(aGpuFadeOut.y, aGpuFadeOut.z, clamp((cycleAge - uReferencePlayTicks) / aGpuFadeOut.x, 0.0, 1.0));",
                    "    } else if (aGpuFadeIn.x > 0.0) {",
                    "      referenceAlpha *= mix(aGpuFadeIn.y, aGpuFadeIn.z, clamp(age / aGpuFadeIn.x, 0.0, 1.0));",
                    "    }",
                    "  }",
                    "}",
                    "gl_PointSize = referenceAlpha > 0.0001 ? size * max(aSize * referenceSizeScale, 0.05) : 0.0;",
                    "vReferenceAlpha = referenceAlpha;"
                ].join("\n    ")
            );
            shader.vertexShader = shader.vertexShader.replace(
                "#include <begin_vertex>",
                [
                    "#include <begin_vertex>",
                    "if (uReferenceGpuEnabled == 1 && aGpuMeta.x > 0.5) {",
                    "  float groupIndex = aGpuFadeOut.w;",
                    "  if (groupIndex < -0.5) {",
                    "    transformed = aGpuTransformVector;",
                    "  } else {",
                    "    vec4 gpuTransform = uReferenceUseSharedTransform == 1 ? uReferenceSharedTransform : resolveReferenceTransform(groupIndex, aGpuTransform);",
                    "    float gpuScale = uReferenceUseSharedTransform == 1 ? uReferenceSharedScale : resolveReferenceScale(groupIndex, aGpuScale);",
                    "    vec3 gpuAnchor = transformed - aGpuTransformVector;",
                    "    vec3 transformedLocal = aGpuTransformVector * max(gpuScale, 0.0001);",
                    "    if (abs(gpuTransform.w) > 0.000001) transformedLocal = rotateReferenceVector(transformedLocal, gpuTransform.xyz, gpuTransform.w);",
                    "    transformed = (uReferenceGlobalTransform * vec4(gpuAnchor, 1.0)).xyz + transformedLocal;",
                    "  }",
                    "}"
                ].join("\n    ")
            );
            shader.fragmentShader = [
                "varying float vReferenceAlpha;",
                ""
            ].join("\n") + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                /vec4\s+diffuseColor\s*=\s*vec4\(\s*diffuse\s*,\s*opacity\s*\)\s*;/g,
                [
                    "if (vReferenceAlpha <= 0.0001) discard;",
                    "vec4 diffuseColor = vec4(diffuse, opacity * vReferenceAlpha);"
                ].join("\n    ")
            );
        };
        return mat;
    }

    function ensureCompositionReferenceGpuPointsObj() {
        if (!scene) return null;
        ensureCompositionReferencePointsObj();
        if (!compositionReferencePointsObj) return null;
        if (compositionReferencePointsObj.material !== compositionReferenceGpuMaterial) {
            compositionReferencePointsObj.material?.dispose?.();
            compositionReferenceGpuMaterial = createCompositionReferenceGpuMaterial();
            compositionReferencePointsObj.material = compositionReferenceGpuMaterial;
        }
        compositionReferencePointsObj.onBeforeRender = () => {
            if (compositionReferenceSnapshot?.gpu?.enabled === true) {
                updateCompositionReferenceGpuUniforms(compositionReferenceSnapshot, compositionReferenceFrameIndex);
            }
        };
        compositionReferencePointsObj.frustumCulled = false;
        return compositionReferencePointsObj;
    }

    function updateCompositionReferenceGpuUniforms(snapshot, frameIndex) {
        const timeline = getCompositionReferenceTimelineInfo(snapshot, compositionReferenceHydrating);
        const entries = timeline.gpuTimeline;
        if (!entries.length) return null;
        const safeIndex = Math.max(0, Math.min(entries.length - 1, Math.trunc(Number(frameIndex) || 0)));
        const entry = entries[safeIndex] || entries[entries.length - 1] || {};
        const uniforms = compositionReferenceGpuUniforms;
        if (!uniforms) return entry;
        const setVector4 = (uniform, value) => {
            const target = uniforms[uniform]?.value;
            const values = Array.isArray(value) ? value : [0, 0, 0, 0];
            if (target?.set) target.set(Number(values[0]) || 0, Number(values[1]) || 0, Number(values[2]) || 0, Number(values[3]) || 0);
        };
        if (uniforms.uReferenceGpuEnabled) uniforms.uReferenceGpuEnabled.value = 1;
        if (uniforms.uReferenceTick) uniforms.uReferenceTick.value = Number(entry.tick) || 0;
        if (uniforms.uReferenceCycleTicks) uniforms.uReferenceCycleTicks.value = Math.max(1, Number(timeline.totalTicks) || 1);
        if (uniforms.uReferencePlayTicks) uniforms.uReferencePlayTicks.value = Math.max(
            1,
            Number(snapshot?.gpu?.playTicks) || Number(timeline.totalTicks) || 1
        );
        const globalAlpha = Number(entry.globalAlpha);
        if (uniforms.uReferenceGlobalAlpha) {
            uniforms.uReferenceGlobalAlpha.value = Number.isFinite(globalAlpha)
                ? Math.max(0, Math.min(1, globalAlpha))
                : 1;
        }
        if (uniforms.uReferenceHasLifecycle) uniforms.uReferenceHasLifecycle.value = entry.hasLifecycle ? 1 : 0;
        if (uniforms.uReferenceUseSharedTransform) uniforms.uReferenceUseSharedTransform.value = entry.useSharedTransform ? 1 : 0;
        setVector4("uReferenceSharedTransform", entry.sharedTransform);
        if (uniforms.uReferenceSharedScale) uniforms.uReferenceSharedScale.value = Math.max(0.0001, Number(entry.sharedScale) || 1);
        const transforms = Array.isArray(entry.groupTransforms) ? entry.groupTransforms : [];
        const scales = Array.isArray(entry.groupScales) ? entry.groupScales : [];
        if (uniforms.uReferenceGroupCount) uniforms.uReferenceGroupCount.value = Math.min(24, transforms.length);
        const transformTargets = uniforms.uReferenceGroupTransforms?.value || [];
        for (let i = 0; i < transformTargets.length; i++) setVector4Target(transformTargets[i], transforms[i]);
        const scaleTargets = uniforms.uReferenceGroupScales?.value;
        if (scaleTargets) for (let i = 0; i < scaleTargets.length; i++) scaleTargets[i] = Math.max(0.0001, Number(scales[i]) || 1);
        if (uniforms.uReferenceGlobalTransform?.value?.fromArray) {
            const matrix = Array.isArray(entry.globalTransform) && entry.globalTransform.length >= 16
                ? entry.globalTransform
                : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
            uniforms.uReferenceGlobalTransform.value.fromArray(matrix);
        }
        return entry;
    }

    function createCompositionReferenceCpuMaterial() {
        const mat = new THREE.PointsMaterial({
            size: Math.max(0.12, pointSize * 0.9),
            sizeAttenuation: true,
            color: 0xffffff,
            vertexColors: true,
            transparent: true,
            opacity: compositionReferenceOpacity,
            depthWrite: false,
            depthTest: true
        });
        mat.defaultAttributeValues = {
            ...(mat.defaultAttributeValues || {}),
            aReferenceAlpha: [1],
            aReferenceSize: [1]
        };
        mat.customProgramCacheKey = () => "composition-reference-cpu-v1";
        mat.onBeforeCompile = (shader) => {
            shader.vertexShader = [
                "attribute float aReferenceAlpha;",
                "attribute float aReferenceSize;",
                "varying float vReferenceAlpha;",
                ""
            ].join("\n") + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                /gl_PointSize\s*=\s*size\s*;/g,
                [
                    "vReferenceAlpha = clamp(aReferenceAlpha, 0.0, 1.0);",
                    "gl_PointSize = vReferenceAlpha > 0.0001 ? size * max(aReferenceSize, 0.05) : 0.0;"
                ].join("\n    ")
            );
            shader.fragmentShader = [
                "varying float vReferenceAlpha;",
                ""
            ].join("\n") + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                /vec4\s+diffuseColor\s*=\s*vec4\(\s*diffuse\s*,\s*opacity\s*\)\s*;/g,
                [
                    "if (vReferenceAlpha <= 0.0001) discard;",
                    "vec4 diffuseColor = vec4(diffuse, opacity * vReferenceAlpha);"
                ].join("\n    ")
            );
        };
        return mat;
    }

    function setVector4Target(target, value) {
        if (!target?.set) return;
        const values = Array.isArray(value) ? value : [0, 0, 0, 0];
        target.set(Number(values[0]) || 0, Number(values[1]) || 0, Number(values[2]) || 0, Number(values[3]) || 0);
    }

    function ensureCompositionReferencePointsObj() {
        if (compositionReferencePointsObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = createCompositionReferenceCpuMaterial();
        compositionReferencePointsObj = new THREE.Points(geom, mat);
        compositionReferencePointsObj.visible = false;
        scene.add(compositionReferencePointsObj);
    }

    function ensureCompositionReferencePickObj() {
        if (compositionReferencePickObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: Math.max(0.12, pointSize * 0.9),
            sizeAttenuation: true,
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false
        });
        compositionReferencePickObj = new THREE.Points(geom, mat);
        compositionReferencePickObj.visible = false;
        compositionReferencePickObj.renderOrder = -1000;
        scene.add(compositionReferencePickObj);
    }

    function updateCompositionReferencePickPoints(points) {
        const list = Array.isArray(points) ? points : [];
        ensureCompositionReferencePickObj();
        if (!compositionReferencePickObj) return;
        if (!list.length) {
            compositionReferencePickObj.visible = false;
            compositionReferencePickCount = 0;
            return;
        }
        if (!compositionReferencePickBuf || compositionReferencePickCount !== list.length) {
            compositionReferencePickBuf = new Float32Array(list.length * 3);
            compositionReferencePickCount = list.length;
            compositionReferencePickObj.geometry.setAttribute(
                "position",
                new THREE.BufferAttribute(compositionReferencePickBuf, 3)
            );
        }
        for (let i = 0; i < list.length; i++) {
            const point = list[i];
            compositionReferencePickBuf[i * 3] = Number(point?.x) || 0;
            compositionReferencePickBuf[i * 3 + 1] = Number(point?.y) || 0;
            compositionReferencePickBuf[i * 3 + 2] = Number(point?.z) || 0;
        }
        const position = compositionReferencePickObj.geometry.getAttribute("position");
        if (position) position.needsUpdate = true;
        compositionReferencePickObj.geometry.computeBoundingSphere();
        compositionReferencePickObj.material.size = Math.max(0.12, pointSize * 0.9);
        compositionReferencePickObj.visible = true;
    }

    function compositionReferenceGpuArray(raw) {
        if (raw instanceof Float32Array) return raw;
        if (Array.isArray(raw)) return Float32Array.from(raw, (value) => Number(value) || 0);
        if (raw && typeof raw.length === "number") return Float32Array.from(raw, (value) => Number(value) || 0);
        return null;
    }

    function updateCompositionReferenceGpuGeometry(snapshot, visibleIds) {
        const obj = ensureCompositionReferenceGpuPointsObj();
        const gpu = snapshot?.gpu;
        const attributes = gpu?.attributes;
        if (!obj || gpu?.enabled !== true || !attributes) return null;
        const geom = obj.geometry;
        const pointCount = Math.max(0, Math.trunc(Number(gpu.pointCount) || 0));
        if (!pointCount) return null;
        const needsBaseUpload = compositionReferenceGpuSnapshotRef !== gpu
            || compositionReferenceGpuPointCount !== pointCount
            || !geom.getAttribute?.("position");
        const itemSizes = {
            position: 3,
            color: 3,
            aSize: 1,
            aAlpha: 1,
            aGpuMeta: 4,
            aGpuFadeIn: 4,
            aGpuFadeOut: 4,
            aGpuTransform: 4,
            aGpuTransformVector: 3,
            aGpuScale: 1,
            aGpuLifecycle: 2,
            aGpuAlphaCurve: 4,
            aGpuScaleCurve: 4,
            aGpuColorCurve: 2
        };
        if (needsBaseUpload) {
            for (const [name, itemSize] of Object.entries(itemSizes)) {
                const array = compositionReferenceGpuArray(attributes[name]);
                if (!array || array.length < pointCount * itemSize) {
                    geom.deleteAttribute?.(name);
                    continue;
                }
                const buffer = name === "position" ? Float32Array.from(array) : array;
                geom.setAttribute(name, new THREE.BufferAttribute(buffer, itemSize));
            }
            compositionReferenceGpuSnapshotRef = gpu;
            compositionReferenceGpuPointCount = pointCount;
            compositionReferenceGpuVisibleBuf = new Float32Array(pointCount);
            compositionReferenceGpuDeltaBuf = new Float32Array(pointCount * 3);
            geom.setAttribute("aReferenceVisible", new THREE.BufferAttribute(compositionReferenceGpuVisibleBuf, 1));
            geom.deleteAttribute?.("aReferenceDelta");
            geom.computeBoundingSphere();
        }
        const owners = Array.isArray(compositionReferenceSnapshot?.owners)
            ? compositionReferenceSnapshot.owners
            : [];
        const anchorRefs = Array.isArray(compositionReferenceCurrentAnchorRefs)
            ? compositionReferenceCurrentAnchorRefs
            : [];
        const baselinePoints = Array.isArray(compositionReferenceCurrentSourcePoints)
            ? compositionReferenceCurrentSourcePoints
            : [];
        const currentTargetPath = compositionReferenceTargetPath(compositionReferenceSnapshot?.currentTarget || "root");
        const currentTargetIsNested = currentTargetPath.length > 0;
        const basePosition = compositionReferenceGpuArray(attributes.position);
        const baseTransformVector = compositionReferenceGpuArray(attributes.aGpuTransformVector);
        const positionAttr = geom.getAttribute("position");
        const transformVectorAttr = geom.getAttribute("aGpuTransformVector");
        for (let i = 0; i < pointCount; i++) {
            const owner = String(owners[i] || "");
            const visible = visibleIds.has(owner);
            compositionReferenceGpuVisibleBuf[i] = visible ? 1 : 0;
            let dx = 0;
            let dy = 0;
            let dz = 0;
            if (isCompositionReferenceDescendant(owner, compositionReferenceCardId)
                && lastPoints?.length
                && anchorRefs.length > i) {
                const sourceIndex = Math.trunc(Number(anchorRefs[i]));
                const baseline = baselinePoints[sourceIndex];
                const current = lastPoints[sourceIndex];
                if (baseline && current) {
                    dx = num(current.x) - num(baseline.x);
                    dy = num(current.y) - num(baseline.y);
                    dz = num(current.z) - num(baseline.z);
                }
            }
            compositionReferenceGpuDeltaBuf[i * 3] = dx;
            compositionReferenceGpuDeltaBuf[i * 3 + 1] = dy;
            compositionReferenceGpuDeltaBuf[i * 3 + 2] = dz;
            if (positionAttr?.array && basePosition) {
                // position is also the anchor carrier used by the GPU shader
                // (position - localVector). Move it with every edit so a
                // nested local-vector edit does not move the anchor backwards.
                const positionDelta = 1;
                positionAttr.array[i * 3] = (Number(basePosition[i * 3]) || 0) + dx * positionDelta;
                positionAttr.array[i * 3 + 1] = (Number(basePosition[i * 3 + 1]) || 0) + dy * positionDelta;
                positionAttr.array[i * 3 + 2] = (Number(basePosition[i * 3 + 2]) || 0) + dz * positionDelta;
            }
            if (transformVectorAttr?.array && baseTransformVector) {
                const offset = i * 3;
                const transformVectorDelta = currentTargetIsNested ? 1 : 0;
                transformVectorAttr.array[offset] = (Number(baseTransformVector[offset]) || 0) + dx * transformVectorDelta;
                transformVectorAttr.array[offset + 1] = (Number(baseTransformVector[offset + 1]) || 0) + dy * transformVectorDelta;
                transformVectorAttr.array[offset + 2] = (Number(baseTransformVector[offset + 2]) || 0) + dz * transformVectorDelta;
            }
        }
        geom.getAttribute("aReferenceVisible").needsUpdate = true;
        if (positionAttr) positionAttr.needsUpdate = true;
        if (transformVectorAttr) transformVectorAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        return {
            pointCount,
            owners,
            positions: compositionReferenceGpuArray(attributes.position),
            visible: compositionReferenceGpuVisibleBuf,
            delta: compositionReferenceGpuDeltaBuf
        };
    }

    function rotateCompositionReferenceVector(value, axis, angle) {
        const axisLength = Math.hypot(axis.x, axis.y, axis.z);
        if (axisLength < 0.0001 || Math.abs(angle) < 0.000001) return { ...value };
        const ax = axis.x / axisLength;
        const ay = axis.y / axisLength;
        const az = axis.z / axisLength;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const dot = ax * value.x + ay * value.y + az * value.z;
        return {
            x: value.x * c + (ay * value.z - az * value.y) * s + ax * dot * (1 - c),
            y: value.y * c + (az * value.x - ax * value.z) * s + ay * dot * (1 - c),
            z: value.z * c + (ax * value.y - ay * value.x) * s + az * dot * (1 - c)
        };
    }

    function sampleCompositionReferenceCurve(curve, progress) {
        const values = Array.isArray(curve) || curve instanceof Float32Array ? curve : [1, 1, -2, -2];
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        const x = Number(values[0]) || 0;
        const y = Number(values[1]) || 0;
        const z = Number(values[2]);
        const w = Number(values[3]);
        if (!Number.isFinite(z) || z < -1.5) return 1;
        if (z < -0.5) return x + (y - x) * t;
        const fadeIn = Math.max(0, Math.min(1, z));
        const fadeOut = Math.max(fadeIn, Math.min(1, Number.isFinite(w) ? w : 1));
        if (t <= fadeIn) return fadeIn > 0.000001 ? x * t / fadeIn : x;
        if (t <= fadeOut) return x;
        return fadeOut < 0.999999 ? x * (1 - (t - fadeOut) / (1 - fadeOut)) : x;
    }

    function compositionReferenceGpuMatrixPoint(matrix, point) {
        const m = Array.isArray(matrix) || matrix instanceof Float32Array ? matrix : null;
        if (!m || m.length < 16) return { ...point };
        return {
            x: m[0] * point.x + m[4] * point.y + m[8] * point.z + m[12],
            y: m[1] * point.x + m[5] * point.y + m[9] * point.z + m[13],
            z: m[2] * point.x + m[6] * point.y + m[10] * point.z + m[14]
        };
    }

    // Current-card edits are authored in Builder-local space. Reference frames
    // already contain the Composition transform, so only apply the matrix's
    // linear part to the edit delta; translation belongs to the baseline frame.
    function compositionReferenceGpuMatrixDelta(matrix, delta) {
        const m = Array.isArray(matrix) || matrix instanceof Float32Array ? matrix : null;
        const value = delta || { x: 0, y: 0, z: 0 };
        if (!m || m.length < 16) return {
            x: Number(value.x) || 0,
            y: Number(value.y) || 0,
            z: Number(value.z) || 0
        };
        const x = Number(value.x) || 0;
        const y = Number(value.y) || 0;
        const z = Number(value.z) || 0;
        return {
            x: m[0] * x + m[4] * y + m[8] * z,
            y: m[1] * x + m[5] * y + m[9] * z,
            z: m[2] * x + m[6] * y + m[10] * z
        };
    }

    function resolveCompositionReferenceGpuPoint(snapshot, index, frameEntry, delta = null) {
        const attributes = snapshot?.gpu?.attributes || {};
        const position = compositionReferenceGpuArray(attributes.position);
        if (!position || index * 3 + 2 >= position.length) {
            return null;
        }
        const nestedTarget = compositionReferenceTargetPath(snapshot?.currentTarget || "root").length > 0;
        const dx = Number(delta?.[0]) || 0;
        const dy = Number(delta?.[1]) || 0;
        const dz = Number(delta?.[2]) || 0;
        let point = {
            x: (Number(position[index * 3]) || 0) + (nestedTarget ? 0 : dx),
            y: (Number(position[index * 3 + 1]) || 0) + (nestedTarget ? 0 : dy),
            z: (Number(position[index * 3 + 2]) || 0) + (nestedTarget ? 0 : dz)
        };
        const meta = compositionReferenceGpuArray(attributes.aGpuMeta);
        const fadeIn = compositionReferenceGpuArray(attributes.aGpuFadeIn);
        const fadeOut = compositionReferenceGpuArray(attributes.aGpuFadeOut);
        const transform = compositionReferenceGpuArray(attributes.aGpuTransform);
        const transformVector = compositionReferenceGpuArray(attributes.aGpuTransformVector);
        const scale = compositionReferenceGpuArray(attributes.aGpuScale);
        const lifecycle = compositionReferenceGpuArray(attributes.aGpuLifecycle);
        const alphaCurve = compositionReferenceGpuArray(attributes.aGpuAlphaCurve);
        const scaleCurve = compositionReferenceGpuArray(attributes.aGpuScaleCurve);
        const alphaAttr = compositionReferenceGpuArray(attributes.aAlpha);
        const sizeAttr = compositionReferenceGpuArray(attributes.aSize);
        const metaOffset = index * 4;
        const gpuFlag = Number(meta?.[metaOffset]) || 0;
        let alpha = Number(alphaAttr?.[index]);
        if (!Number.isFinite(alpha)) alpha = 1;
        let size = Number(sizeAttr?.[index]) || 1;
        const tick = Number(frameEntry?.tick) || 0;
        if (gpuFlag < -0.5) {
            return null;
        }
        if (gpuFlag > 0.5) {
            const birthTick = Math.max(0, Number(meta?.[metaOffset + 1]) || 0);
            if (tick < birthTick) {
                return null;
            }
            const age = Math.max(0, tick - birthTick);
            const lifeOffset = index * 2;
            const lifetime = Math.max(Math.abs(Number(lifecycle?.[lifeOffset + 1]) || 100), 1);
            let lifecycleAge = Number(lifecycle?.[lifeOffset]) || 0;
            if (frameEntry?.hasLifecycle === true && Number(lifecycle?.[lifeOffset + 1]) > 0) {
                lifecycleAge = Math.max(0, Math.min(lifetime, lifecycleAge + age));
            }
            const progress = Math.max(0, Math.min(1, lifecycleAge / lifetime));
            alpha *= sampleCompositionReferenceCurve(alphaCurve ? alphaCurve.slice(index * 4, index * 4 + 4) : null, progress);
            size *= sampleCompositionReferenceCurve(scaleCurve ? scaleCurve.slice(index * 4, index * 4 + 4) : null, progress);
            const fadeOutOffset = index * 4;
            const fadeInOffset = index * 4;
            const cycleTicks = Math.max(1, Number(snapshot?.totalTicks) || 1);
            const playTicks = Math.max(1, Number(snapshot?.gpu?.playTicks) || cycleTicks);
            const fadeOutDuration = Number(fadeOut?.[fadeOutOffset]) || 0;
            const fadeInDuration = Number(fadeIn?.[fadeInOffset]) || 0;
            if (fadeOutDuration > 0 && tick >= playTicks) {
                const fadeProgress = Math.max(0, Math.min(1, (tick - playTicks) / fadeOutDuration));
                const fromAlpha = Number(fadeOut[fadeOutOffset + 1]);
                const toAlpha = Number(fadeOut[fadeOutOffset + 2]);
                alpha *= (Number.isFinite(fromAlpha) ? fromAlpha : 0)
                    + ((Number.isFinite(toAlpha) ? toAlpha : 0) - (Number.isFinite(fromAlpha) ? fromAlpha : 0)) * fadeProgress;
            } else if (fadeInDuration > 0) {
                const fadeProgress = Math.max(0, Math.min(1, age / fadeInDuration));
                const fromAlpha = Number(fadeIn[fadeInOffset + 1]);
                const toAlpha = Number(fadeIn[fadeInOffset + 2]);
                alpha *= (Number.isFinite(fromAlpha) ? fromAlpha : 0)
                    + ((Number.isFinite(toAlpha) ? toAlpha : 0) - (Number.isFinite(fromAlpha) ? fromAlpha : 0)) * fadeProgress;
            }
            const encodedGroupIndex = Number(fadeOut?.[fadeOutOffset + 3]);
            const vectorOffset = index * 3;
            const baseLocal = {
                x: Number(transformVector?.[vectorOffset]) || 0,
                y: Number(transformVector?.[vectorOffset + 1]) || 0,
                z: Number(transformVector?.[vectorOffset + 2]) || 0
            };
            const local = nestedTarget
                ? { x: baseLocal.x + dx, y: baseLocal.y + dy, z: baseLocal.z + dz }
                : baseLocal;
            if (encodedGroupIndex < -0.5) {
                point = local;
            } else {
                const groups = Array.isArray(frameEntry?.groupTransforms) ? frameEntry.groupTransforms : [];
                const scales = Array.isArray(frameEntry?.groupScales) ? frameEntry.groupScales : [];
                const groupIndex = Math.max(0, Math.trunc(encodedGroupIndex - 1));
                const fallback = [
                    Number(transform?.[metaOffset]) || 0,
                    Number(transform?.[metaOffset + 1]) || 0,
                    Number(transform?.[metaOffset + 2]) || 0,
                    Number(transform?.[metaOffset + 3]) || 0
                ];
                const resolved = frameEntry?.useSharedTransform
                    ? (frameEntry.sharedTransform || [0, 0, 0, 0])
                    : (groups[Math.max(0, Math.trunc(groupIndex))] || fallback);
                const resolvedScale = frameEntry?.useSharedTransform
                    ? Number(frameEntry.sharedScale) || 1
                    : Number(scales[Math.max(0, Math.trunc(groupIndex))] ?? scale?.[index] ?? 1) || 1;
                const anchor = {
                    x: point.x - baseLocal.x,
                    y: point.y - baseLocal.y,
                    z: point.z - baseLocal.z
                };
                const rotated = rotateCompositionReferenceVector({
                    x: local.x * resolvedScale,
                    y: local.y * resolvedScale,
                    z: local.z * resolvedScale
                }, { x: Number(resolved[0]) || 0, y: Number(resolved[1]) || 0, z: Number(resolved[2]) || 0 }, Number(resolved[3]) || 0);
                const worldAnchor = compositionReferenceGpuMatrixPoint(frameEntry.globalTransform, anchor);
                point = { x: worldAnchor.x + rotated.x, y: worldAnchor.y + rotated.y, z: worldAnchor.z + rotated.z };
            }
        }
        const frameGlobalAlpha = Number(frameEntry?.globalAlpha);
        alpha *= Number.isFinite(frameGlobalAlpha)
            ? Math.max(0, Math.min(1, frameGlobalAlpha))
            : 1;
        if (alpha <= 0.0001 || size <= 0.0001) {
            return null;
        }
        return point;
    }

    function rebuildCompositionReferencePreview(frameIndex = null) {
        if (!isCompositionPointsBuilder || !compositionReferenceSceneReady) return;
        ensureCompositionReferencePointsObj();
        if (!compositionReferencePointsObj) return;
        const snapshot = compositionReferenceSnapshot;
        const frames = Array.isArray(snapshot?.frames) ? snapshot.frames : [];
        const owners = Array.isArray(snapshot?.owners) ? snapshot.owners : [];
        const visibleMasks = Array.isArray(snapshot?.visibleMasks) ? snapshot.visibleMasks : [];
        const timeline = getCompositionReferenceTimelineInfo(snapshot, compositionReferenceHydrating);
        const requestedIndex = frameIndex == null ? compositionReferenceFrameIndex : frameIndex;
        const index = Math.max(0, Math.min(timeline.timelineCount - 1, Math.trunc(Number(requestedIndex) || 0)));
        compositionReferenceFrameIndex = index;
        const groups = compositionReferenceGroups();
        const visibleIds = new Set(groups
            .filter((group) => group.visible)
            .map((group) => group.id));
        if (timeline.gpu) {
            const gpuState = updateCompositionReferenceGpuGeometry(snapshot, visibleIds);
            const entry = updateCompositionReferenceGpuUniforms(snapshot, Math.min(index, timeline.availableFrameCount - 1));
            if (!gpuState || !entry) {
                compositionReferencePointsObj.visible = false;
                if (compositionReferencePickObj) compositionReferencePickObj.visible = false;
                lastCompositionReferencePoints = [];
                return;
            }
            const points = [];
            for (let i = 0; i < gpuState.pointCount; i++) {
                if (gpuState.visible[i] < 0.5) continue;
                const owner = String(gpuState.owners[i] || "");
                const offset = i * 3;
                const point = resolveCompositionReferenceGpuPoint(snapshot, i, entry, gpuState.delta.subarray(offset, offset + 3));
                if (!point) continue;
                points.push({
                    x: point.x,
                    y: point.y,
                    z: point.z,
                    ownerId: owner
                });
            }
            lastCompositionReferencePoints = points;
            updateCompositionReferencePickPoints(points);
            compositionReferencePointsObj.material.opacity = compositionReferenceOpacity;
            compositionReferencePointsObj.material.size = Math.max(0.12, pointSize * 0.9);
            compositionReferencePointsObj.visible = points.length > 0;
            return;
        }
        if (compositionReferencePointsObj.material === compositionReferenceGpuMaterial) {
            compositionReferenceGpuMaterial.dispose?.();
            compositionReferenceGpuMaterial = null;
            compositionReferenceGpuUniforms = null;
            compositionReferenceGpuSnapshotRef = null;
            compositionReferenceGpuPointCount = 0;
            compositionReferencePointsObj.material = createCompositionReferenceCpuMaterial();
        }
        if (compositionReferencePickObj) compositionReferencePickObj.visible = false;
        if (!frames.length || !owners.length) {
            compositionReferencePointsObj.visible = false;
            if (compositionReferencePickObj) compositionReferencePickObj.visible = false;
            lastCompositionReferencePoints = [];
            return;
        }
        const frameTicks = timeline.frameTicks;
        const timelineCount = timeline.timelineCount;
        const requestedTick = Number(frameTicks?.[index] ?? index);
        let sourceFrameIndex = 0;
        if (frames.length > 1) {
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < frames.length; i++) {
                const tick = Number(frameTicks?.[i] ?? i);
                const distance = Math.abs(tick - requestedTick);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    sourceFrameIndex = i;
                }
            }
        }
        const flat = decodeCompositionReferenceFrame(frames[sourceFrameIndex], owners.length * 3);
        const visibleMask = decodeCompositionReferenceMask(visibleMasks[sourceFrameIndex], owners.length);
        const frameColors = decodeCompositionReferenceVisualArray(
            compositionReferenceSnapshot?.colors?.[sourceFrameIndex],
            owners.length * 3,
            true
        );
        const frameSizes = decodeCompositionReferenceVisualArray(
            compositionReferenceSnapshot?.sizes?.[sourceFrameIndex],
            owners.length,
            false
        );
        const frameAlphas = decodeCompositionReferenceVisualArray(
            compositionReferenceSnapshot?.alphas?.[sourceFrameIndex],
            owners.length,
            true
        );
        const points = [];
        const pointColors = [];
        const pointSizes = [];
        const pointAlphas = [];
        for (let i = 0; i < owners.length; i++) {
            const owner = String(owners[i] || "");
            if (!visibleIds.has(owner)) continue;
            if (visibleMask && visibleMask[i] === 0) continue;
            const offset = i * 3;
            const x = Number(flat?.[offset]);
            const y = Number(flat?.[offset + 1]);
            const z = Number(flat?.[offset + 2]);
            if (![x, y, z].every(Number.isFinite)) continue;
            let nextX = x;
            let nextY = y;
            let nextZ = z;
            if (isCompositionReferenceDescendant(owner, compositionReferenceCardId)
                && compositionReferenceCurrentSourcePoints?.length
                && compositionReferenceCurrentAnchorRefs.length > i
                && lastPoints?.length) {
                const sourceIndex = compositionReferenceCurrentAnchorRefs[i];
                const baseline = compositionReferenceCurrentSourcePoints[sourceIndex];
                const current = lastPoints[sourceIndex];
                if (baseline && current) {
                    const delta = compositionReferenceGpuMatrixDelta(compositionReferenceSnapshot?.globalTransform, {
                        x: num(current.x) - num(baseline.x),
                        y: num(current.y) - num(baseline.y),
                        z: num(current.z) - num(baseline.z)
                    });
                    nextX += delta.x;
                    nextY += delta.y;
                    nextZ += delta.z;
                }
            }
            points.push({ x: nextX, y: nextY, z: nextZ, ownerId: owner });
            const colorOffset = i * 3;
            pointColors.push(
                Number(frameColors?.[colorOffset]) || 1,
                Number(frameColors?.[colorOffset + 1]) || 1,
                Number(frameColors?.[colorOffset + 2]) || 1
            );
            pointSizes.push(Math.max(0.05, Number(frameSizes?.[i]) || 1));
            pointAlphas.push(Math.max(0, Math.min(1, Number(frameAlphas?.[i]) || 0)));
        }
        lastCompositionReferencePoints = points;
        if (!points.length) {
            compositionReferencePointsObj.visible = false;
            if (compositionReferencePickObj) compositionReferencePickObj.visible = false;
            return;
        }
        const geom = compositionReferencePointsObj.geometry;
        if (!compositionReferencePointsBuf || compositionReferencePointCount !== points.length) {
            compositionReferencePointsBuf = new Float32Array(points.length * 3);
            compositionReferenceColorsBuf = new Float32Array(points.length * 3);
            compositionReferenceSizesBuf = new Float32Array(points.length);
            compositionReferenceAlphasBuf = new Float32Array(points.length);
            compositionReferencePointCount = points.length;
            geom.setAttribute("position", new THREE.BufferAttribute(compositionReferencePointsBuf, 3));
            geom.setAttribute("color", new THREE.BufferAttribute(compositionReferenceColorsBuf, 3));
            geom.setAttribute("aReferenceSize", new THREE.BufferAttribute(compositionReferenceSizesBuf, 1));
            geom.setAttribute("aReferenceAlpha", new THREE.BufferAttribute(compositionReferenceAlphasBuf, 1));
        }
        for (let i = 0; i < points.length; i++) {
            compositionReferencePointsBuf[i * 3] = points[i].x;
            compositionReferencePointsBuf[i * 3 + 1] = points[i].y;
            compositionReferencePointsBuf[i * 3 + 2] = points[i].z;
            compositionReferenceColorsBuf[i * 3] = pointColors[i * 3];
            compositionReferenceColorsBuf[i * 3 + 1] = pointColors[i * 3 + 1];
            compositionReferenceColorsBuf[i * 3 + 2] = pointColors[i * 3 + 2];
            compositionReferenceSizesBuf[i] = pointSizes[i];
            compositionReferenceAlphasBuf[i] = pointAlphas[i];
        }
        const position = geom.getAttribute("position");
        if (position) position.needsUpdate = true;
        const color = geom.getAttribute("color");
        if (color) color.needsUpdate = true;
        const referenceSize = geom.getAttribute("aReferenceSize");
        if (referenceSize) referenceSize.needsUpdate = true;
        const referenceAlpha = geom.getAttribute("aReferenceAlpha");
        if (referenceAlpha) referenceAlpha.needsUpdate = true;
        geom.computeBoundingSphere();
        compositionReferencePointsObj.material.size = Math.max(0.12, pointSize * 0.9);
        compositionReferencePointsObj.material.opacity = compositionReferenceOpacity;
        compositionReferencePointsObj.visible = true;
    }

    function hasCompositionNumericContext() {
        return compositionNumericContext.enabled;
    }

    function getCompositionNumericSuggestions() {
        return Array.isArray(compositionNumericContext.suggestions)
            ? compositionNumericContext.suggestions.map((item) => Object.assign({}, item))
            : [];
    }

    function getCompositionVec3VariableOptions() {
        return Array.isArray(compositionNumericContext.vectorOptions)
            ? compositionNumericContext.vectorOptions.map((it) => Object.assign({}, it))
            : [];
    }

    function isEmbeddedVariableHost() {
        const cls = document.body && document.body.classList;
        return !!(cls && (cls.contains("composition-no-kotlin") || cls.contains("emitter-no-kotlin")));
    }

    function normalizeVariableState(raw) {
        return normalizePointsBuilderVariables(raw);
    }

    function getLocalVariableState() {
        state.variables = normalizeVariableState(state.variables);
        return state.variables;
    }

    function getLocalNumericMap() {
        const vars = getLocalVariableState();
        const map = Object.assign({ PI: Math.PI }, vars.scalar || {});
        for (const [name, vec] of Object.entries(vars.vector || {})) {
            map[name] = makeVectorProxy(vec, "Vec3");
        }
        return map;
    }

    function getLocalNumericSuggestions() {
        return buildPointsBuilderVariableCompletions(getLocalVariableState()).numeric;
    }

    function getLocalVec3VariableOptions() {
        return buildPointsBuilderVariableCompletions(getLocalVariableState()).vectors;
    }

    function getLocalVariableCacheKey() {
        try {
            return JSON.stringify(getLocalVariableState());
        } catch {
            return "";
        }
    }

    function getEffectiveNumericMap() {
        const map = hasCompositionNumericContext()
            ? Object.assign({}, compositionNumericContext.map || {})
            : { PI: Math.PI };
        Object.assign(map, getLocalNumericMap());
        if (!Object.prototype.hasOwnProperty.call(map, "PI")) map.PI = Math.PI;
        return map;
    }

    function getEffectiveNumericSuggestions() {
        const seen = new Set();
        const out = [];
        const add = (item) => {
            const value = String(item?.value || item || "").trim();
            const type = String(item?.type || "Double").trim() || "Double";
            const key = `${value}\u0000${type}`;
            if (!value || seen.has(key)) return;
            seen.add(key);
            out.push(typeof item === "object" ? Object.assign({}, item, { value, type }) : { value, type });
        };
        if (hasCompositionNumericContext()) {
            for (const value of getCompositionNumericSuggestions()) add(value);
        }
        for (const value of getLocalNumericSuggestions()) add(value);
        return out.sort((a, b) => compareSuggestionNames(a.value, b.value));
    }

    function getEffectiveVec3VariableOptions() {
        const byRef = new Map();
        const add = (option) => {
            const ref = String(option?.ref || option?.value || option?.name || "").trim();
            if (!ref) return;
            byRef.set(ref, Object.assign({}, option, { ref }));
        };
        if (hasCompositionNumericContext()) {
            for (const option of getCompositionVec3VariableOptions()) add(option);
        }
        for (const option of getLocalVec3VariableOptions()) add(option);
        return Array.from(byRef.values()).sort((a, b) => compareSuggestionNames(String(a.ref || a.name || ""), String(b.ref || b.name || "")));
    }

    function num(v) {
        if (typeof v === "number") return Number.isFinite(v) ? v : 0;
        const raw = String(v ?? "").trim();
        if (!raw) return 0;
        const expr = stripNumericSuffix(raw);
        if (isNumericLiteral(expr)) {
            const n = Number(expr);
            return Number.isFinite(n) ? n : 0;
        }
        const map = getEffectiveNumericMap();
        const key = `${compositionNumericContext.version}|${getLocalVariableCacheKey()}|${expr}`;
        if (compositionNumericContext.cache.has(key)) return compositionNumericContext.cache.get(key);
        const value = evaluateExpressionWithMap(expr, map);
        if (compositionNumericContext.cache.size > 4096) compositionNumericContext.cache.clear();
        compositionNumericContext.cache.set(key, value);
        return value;
    }

    function int(v) {
        return Math.max(0, Math.trunc(num(v)));
    }

    function relExpr(x, y, z) {
        if (isEmbeddedVariableHost()) {
            const fmtExpr = (v) => {
                if (typeof v === "number") return U.fmt(Number.isFinite(v) ? v : 0);
                const raw = stripNumericSuffix(String(v ?? "").trim());
                if (!raw) return "0";
                return isNumericLiteral(raw) ? U.fmt(Number(raw)) : raw;
            };
            return `RelativeLocation(${fmtExpr(x)}, ${fmtExpr(y)}, ${fmtExpr(z)})`;
        }
        return `RelativeLocation(${U.fmt(num(x))}, ${U.fmt(num(y))}, ${U.fmt(num(z))})`;
    }

    loadCompositionNumericContext();
    btnBuilderColumnTab?.addEventListener("click", () => setBuilderColumnPage("builder"));
    btnReferenceGuidesTab?.addEventListener("click", () => setBuilderColumnPage("guides"));
    if (isCompositionPointsBuilder) {
        btnCompositionColumnTab?.addEventListener("click", () => setBuilderColumnPage("composition"));
    }
    setBuilderColumnPage("builder");
    window.addEventListener("storage", (e) => {
        const key = String(e?.key || "");
        if (!key || !key.endsWith(PB_COMP_CONTEXT_KEY)) return;
        loadCompositionNumericContext();
        const syncResult = syncCompositionRegisteredBuilderSnapshots();
        if (syncResult.changed) {
            scheduleAutoSave();
            renderAll();
        }
        // Composition reference progress only changes the overlay. Rebuilding
        // the editable Builder here steals pointer events from the frame range
        // and makes a drag appear to stop until the next click.
    });

    function clamp(v, min, max) {
        let lo = Number(min);
        let hi = Number(max);
        if (!Number.isFinite(lo)) lo = 0;
        if (!Number.isFinite(hi)) hi = lo;
        if (hi < lo) hi = lo;
        return Math.min(Math.max(Number(v) || 0, lo), hi);
    }

    const SETTINGS_STORAGE_KEY = "pb_settings_v1";
    const DEFAULT_SETTINGS_PAYLOAD = {
        paramStep: 0.5,
        snapStep: 0.125,
        rotateSnapDeg: 22.5,
        particleSnapRange: 0.5,
        showAxes: true,
        showGrid: true,
        realtimeKotlin: false,
        pointPickPreviewEnabled: true,
        showGeometryCenters: true,
        autoSelectCompleteGroups: false,
        lineDivisionPoints: 0,
        theme: "dark-1",
        pointSize: 0.5,
        offsetPreviewLimit: -1,
        snapGridKeyToggleMode: false,
        snapParticleKeyToggleMode: false,
        snapPriority: ["line_division", "reference_guide", "geometry_center", "grid", "particle"]
    };
    const SNAP_PRIORITY_DEFS = [
        { id: "line_division", label: "N分点" },
        { id: "reference_guide", label: "参考线" },
        { id: "geometry_center", label: "中心" },
        { id: "grid", label: "网格" },
        { id: "particle", label: "粒子点" }
    ];
    const SNAP_PRIORITY_IDS = SNAP_PRIORITY_DEFS.map((it) => it.id);
    const SNAP_PRIORITY_LABELS = new Map(SNAP_PRIORITY_DEFS.map((it) => [it.id, it.label]));
    let paramStep = DEFAULT_SETTINGS_PAYLOAD.paramStep;
    let snapStep = DEFAULT_SETTINGS_PAYLOAD.snapStep;
    let rotateSnapDeg = DEFAULT_SETTINGS_PAYLOAD.rotateSnapDeg;
    let particleSnapRange = DEFAULT_SETTINGS_PAYLOAD.particleSnapRange;
    let offsetPreviewLimit = DEFAULT_SETTINGS_PAYLOAD.offsetPreviewLimit;
    let realtimeKotlin = DEFAULT_SETTINGS_PAYLOAD.realtimeKotlin;
    let pointPickPreviewEnabled = DEFAULT_SETTINGS_PAYLOAD.pointPickPreviewEnabled;
    let autoSelectCompleteGroups = DEFAULT_SETTINGS_PAYLOAD.autoSelectCompleteGroups;
    let geometryCenterPreviewEnabled = DEFAULT_SETTINGS_PAYLOAD.showGeometryCenters;
    let lineDivisionPoints = DEFAULT_SETTINGS_PAYLOAD.lineDivisionPoints;
    let snapGridKeyToggleMode = DEFAULT_SETTINGS_PAYLOAD.snapGridKeyToggleMode;
    let snapParticleKeyToggleMode = DEFAULT_SETTINGS_PAYLOAD.snapParticleKeyToggleMode;
    let snapPriority = DEFAULT_SETTINGS_PAYLOAD.snapPriority.slice();

    function normalizeParamStep(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return DEFAULT_SETTINGS_PAYLOAD.paramStep;
        return Math.max(0.000001, n);
    }

    function normalizeSnapStep(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return DEFAULT_SETTINGS_PAYLOAD.snapStep;
        return Math.max(0.000001, n);
    }

    function normalizeRotateSnapDeg(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return DEFAULT_SETTINGS_PAYLOAD.rotateSnapDeg;
        return Math.max(0.000001, n);
    }

    function normalizeParticleSnapRange(v) {
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n <= 0) return DEFAULT_SETTINGS_PAYLOAD.particleSnapRange;
        return Math.max(0.000001, n);
    }

    function normalizeOffsetPreviewLimit(v) {
        const raw = String(v ?? "").trim();
        if (raw === "-" || raw === "-1") return -1;
        if (/^\d+$/.test(raw)) return Math.trunc(Number(raw));
        const n = Math.trunc(Number(raw));
        if (!Number.isFinite(n)) return -1;
        if (n < -1) return -1;
        if (n === -1) return -1;
        return Math.max(0, n);
    }

    function normalizeLineDivisionPoints(v) {
        const n = Math.trunc(Number(v));
        if (!Number.isFinite(n) || n < 0) return DEFAULT_SETTINGS_PAYLOAD.lineDivisionPoints;
        return Math.min(64, n);
    }

    function normalizeSnapPriority(value) {
        const out = [];
        const seen = new Set();
        const input = Array.isArray(value) ? value : DEFAULT_SETTINGS_PAYLOAD.snapPriority;
        for (const raw of input) {
            const id = String(raw || "").trim();
            if (!SNAP_PRIORITY_IDS.includes(id) || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        for (const id of DEFAULT_SETTINGS_PAYLOAD.snapPriority) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    }


    function applyParamStepToInputs() {
        const step = String(paramStep);
        const inputs = document.querySelectorAll('input[type="number"]');
        inputs.forEach((el) => {
            if (el.id === "inpSnapStep") return;
            if (el.id === "inpRotateSnapDeg") return;
            if (el.id === "inpParamStep") return;
            if (el.id === "inpSnapParticleRange") return;
            if (el.id === "inpOffsetPreviewLimit") return;
            el.step = step;
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

    function setSnapStep(v, opts = {}) {
        const next = normalizeSnapStep(v);
        snapStep = next;
        if (inpSnapStep && inpSnapStep.value !== String(next)) {
            inpSnapStep.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setRotateSnapDeg(v, opts = {}) {
        const next = normalizeRotateSnapDeg(v);
        rotateSnapDeg = next;
        if (inpRotateSnapDeg && inpRotateSnapDeg.value !== String(next)) {
            inpRotateSnapDeg.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
        if (rotateMode) refreshRotateStatus();
    }

    function setParticleSnapRange(v, opts = {}) {
        const next = normalizeParticleSnapRange(v);
        particleSnapRange = next;
        if (inpSnapParticleRange && inpSnapParticleRange.value !== String(next)) {
            inpSnapParticleRange.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setOffsetPreviewLimit(v, opts = {}) {
        const next = normalizeOffsetPreviewLimit(v);
        offsetPreviewLimit = next;
        if (inpOffsetPreviewLimit && inpOffsetPreviewLimit.value !== String(next)) {
            inpOffsetPreviewLimit.value = String(next);
        }
        if (!opts.skipSave) saveSettingsToStorage();
        updateOffsetPreview(offsetHoverPoint);
        if (pointPickMode && pointPickHoverPoint) {
            queuePointPickPreview(pointPickHoverPoint);
        } else if (!pointPickMode) {
            hidePointPickPreview();
        }
    }

    function setRealtimeKotlin(v, opts = {}) {
        const next = (v !== false);
        const changed = realtimeKotlin !== next;
        realtimeKotlin = next;
        if (chkRealtimeKotlin && chkRealtimeKotlin.checked !== next) {
            chkRealtimeKotlin.checked = next;
        }
        if (!next && kotlinRenderTimer) {
            clearTimeout(kotlinRenderTimer);
            kotlinRenderTimer = 0;
        }
        if (next && changed && opts.flushOnEnable) {
            flushKotlinOut();
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setPointPickPreviewEnabled(v, opts = {}) {
        const next = (v !== false);
        pointPickPreviewEnabled = next;
        if (chkPointPickPreview && chkPointPickPreview.checked !== next) {
            chkPointPickPreview.checked = next;
        }
        if (!next) {
            hidePointPickPreview();
        } else if (pointPickMode && pointPickHoverPoint) {
            queuePointPickPreview(pointPickHoverPoint);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setAutoSelectCompleteGroups(v, opts = {}) {
        const next = (v !== false);
        autoSelectCompleteGroups = next;
        if (chkAutoSelectCompleteGroups && chkAutoSelectCompleteGroups.checked !== next) {
            chkAutoSelectCompleteGroups.checked = next;
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setGeometryCenterPreviewEnabled(v, opts = {}) {
        const next = (v !== false);
        geometryCenterPreviewEnabled = next;
        if (chkShowGeometryCenters && chkShowGeometryCenters.checked !== next) {
            chkShowGeometryCenters.checked = next;
        }
        rebuildPreviewAndKotlin();
        if (!opts.skipSave) saveSettingsToStorage();
        renderSnapPriorityList();
    }

    function setLineDivisionPoints(v, opts = {}) {
        const next = normalizeLineDivisionPoints(v);
        lineDivisionPoints = next;
        if (inpLineDivisionPoints && inpLineDivisionPoints.value !== String(next)) {
            inpLineDivisionPoints.value = String(next);
        }
        rebuildPreviewAndKotlin();
        if (!opts.skipSave) saveSettingsToStorage();
        renderSnapPriorityList();
    }

    function setSnapPriorityOrder(value, opts = {}) {
        snapPriority = normalizeSnapPriority(value);
        renderSnapPriorityList();
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setSnapGridKeyToggleMode(v, opts = {}) {
        const next = (v === true);
        snapGridKeyToggleMode = next;
        if (chkSnapGridKeyToggleMode && chkSnapGridKeyToggleMode.checked !== next) {
            chkSnapGridKeyToggleMode.checked = next;
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function setSnapParticleKeyToggleMode(v, opts = {}) {
        const next = (v === true);
        snapParticleKeyToggleMode = next;
        if (chkSnapParticleKeyToggleMode && chkSnapParticleKeyToggleMode.checked !== next) {
            chkSnapParticleKeyToggleMode.checked = next;
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function isSnapPrioritySourceEnabled(id) {
        if (id === "line_division") return lineDivisionPoints > 0;
        if (id === "reference_guide") return !!referenceGuideController?.hasEnabledSnapGuides?.();
        if (id === "geometry_center") return !!geometryCenterPreviewEnabled;
        if (id === "grid") return !!(chkSnapGrid && chkSnapGrid.checked);
        if (id === "particle") return !!(chkSnapParticle && chkSnapParticle.checked);
        return false;
    }

    function getSnapPriorityStateLabel(id) {
        if (id === "line_division") return lineDivisionPoints > 0 ? `${lineDivisionPoints}点` : "关闭";
        if (id === "reference_guide") {
            const count = Array.isArray(state?.guides)
                ? state.guides.filter((guide) => guide?.visible !== false && guide?.snapEnabled !== false).length
                : 0;
            return count > 0 ? `${count}条` : "关闭";
        }
        if (id === "geometry_center") return geometryCenterPreviewEnabled ? "开启" : "关闭";
        if (id === "grid") return (chkSnapGrid && chkSnapGrid.checked) ? "开启" : "关闭";
        if (id === "particle") return (chkSnapParticle && chkSnapParticle.checked) ? "开启" : "关闭";
        return "";
    }

    function renderSnapPriorityList() {
        if (!snapPriorityList) return;
        const order = normalizeSnapPriority(snapPriority);
        snapPriority = order;
        snapPriorityList.textContent = "";
        order.forEach((id) => {
            const item = document.createElement("div");
            item.className = "snap-priority-item";
            item.draggable = true;
            item.dataset.snapPriorityId = id;
            item.title = "拖动调整吸附优先级";
            if (!isSnapPrioritySourceEnabled(id)) item.classList.add("disabled");

            const grip = document.createElement("span");
            grip.className = "snap-priority-grip";
            grip.textContent = "≡";

            const title = document.createElement("span");
            title.className = "snap-priority-title";
            title.textContent = SNAP_PRIORITY_LABELS.get(id) || id;

            const state = document.createElement("span");
            state.className = "snap-priority-state";
            state.textContent = getSnapPriorityStateLabel(id);

            item.append(grip, title, state);
            snapPriorityList.appendChild(item);
        });
    }

    function bindSnapPriorityList() {
        if (!snapPriorityList || snapPriorityList.__pbBound) return;
        snapPriorityList.__pbBound = true;
        let draggingId = "";
        snapPriorityList.addEventListener("dragstart", (ev) => {
            const item = ev.target?.closest?.(".snap-priority-item");
            if (!item) return;
            draggingId = item.dataset.snapPriorityId || "";
            item.classList.add("dragging");
            ev.dataTransfer.effectAllowed = "move";
            try { ev.dataTransfer.setData("text/plain", draggingId); } catch {}
        });
        snapPriorityList.addEventListener("dragover", (ev) => {
            const item = ev.target?.closest?.(".snap-priority-item");
            if (!item || !draggingId || item.dataset.snapPriorityId === draggingId) return;
            ev.preventDefault();
            item.classList.add("drag-over");
        });
        snapPriorityList.addEventListener("dragleave", (ev) => {
            const item = ev.target?.closest?.(".snap-priority-item");
            if (item) item.classList.remove("drag-over");
        });
        snapPriorityList.addEventListener("drop", (ev) => {
            const item = ev.target?.closest?.(".snap-priority-item");
            if (!item || !draggingId) return;
            ev.preventDefault();
            const targetId = item.dataset.snapPriorityId || "";
            if (!targetId || targetId === draggingId) return;
            const next = normalizeSnapPriority(snapPriority).filter((id) => id !== draggingId);
            const targetIndex = Math.max(0, next.indexOf(targetId));
            const rect = item.getBoundingClientRect();
            const after = Number.isFinite(ev.clientY) && ev.clientY > rect.top + rect.height / 2;
            next.splice(targetIndex + (after ? 1 : 0), 0, draggingId);
            setSnapPriorityOrder(next);
        });
        snapPriorityList.addEventListener("dragend", () => {
            draggingId = "";
            snapPriorityList.querySelectorAll(".snap-priority-item").forEach((item) => {
                item.classList.remove("dragging", "drag-over");
            });
        });
    }

    function collectSettingsPayload() {
        const currentTheme = normalizeTheme(
            (themeSelect && themeSelect.value) ||
            document.body.getAttribute("data-theme") ||
            localStorage.getItem(THEME_KEY) ||
            "dark-1"
        );
        return {
            paramStep,
            snapStep,
            rotateSnapDeg,
            particleSnapRange,
            showAxes: chkAxes ? !!chkAxes.checked : true,
            showGrid: chkGrid ? !!chkGrid.checked : true,
            realtimeKotlin,
            pointPickPreviewEnabled,
            autoSelectCompleteGroups,
            showGeometryCenters: geometryCenterPreviewEnabled,
            lineDivisionPoints,
            theme: currentTheme,
            pointSize,
            offsetPreviewLimit,
            snapGridKeyToggleMode,
            snapParticleKeyToggleMode,
            snapPriority
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
        if (payload.snapStep !== undefined) {
            setSnapStep(payload.snapStep, { skipSave: true });
        }
        if (payload.rotateSnapDeg !== undefined) {
            setRotateSnapDeg(payload.rotateSnapDeg, { skipSave: true });
        }
        if (payload.particleSnapRange !== undefined) {
            setParticleSnapRange(payload.particleSnapRange, { skipSave: true });
        }
        if (payload.offsetPreviewLimit !== undefined) {
            setOffsetPreviewLimit(payload.offsetPreviewLimit, { skipSave: true });
        }
        if (payload.realtimeKotlin !== undefined) {
            setRealtimeKotlin(payload.realtimeKotlin, { skipSave: true });
        }
        if (payload.pointPickPreviewEnabled !== undefined) {
            setPointPickPreviewEnabled(payload.pointPickPreviewEnabled, { skipSave: true });
        }
        if (payload.autoSelectCompleteGroups !== undefined) {
            setAutoSelectCompleteGroups(payload.autoSelectCompleteGroups, { skipSave: true });
        }
        if (payload.showGeometryCenters !== undefined) {
            setGeometryCenterPreviewEnabled(payload.showGeometryCenters, { skipSave: true });
        }
        if (payload.lineDivisionPoints !== undefined) {
            setLineDivisionPoints(payload.lineDivisionPoints, { skipSave: true });
        }
        if (payload.snapGridKeyToggleMode !== undefined) {
            setSnapGridKeyToggleMode(payload.snapGridKeyToggleMode, { skipSave: true });
        }
        if (payload.snapParticleKeyToggleMode !== undefined) {
            setSnapParticleKeyToggleMode(payload.snapParticleKeyToggleMode, { skipSave: true });
        }
        if (payload.snapPriority !== undefined) {
            setSnapPriorityOrder(payload.snapPriority, { skipSave: true });
        } else {
            setSnapPriorityOrder(DEFAULT_SETTINGS_PAYLOAD.snapPriority, { skipSave: true });
        }
        if (payload.theme) {
            /*
             * The global theme wins; a payload theme is only a migration fallback.
             *
             * This used to apply payload.theme unconditionally *and* write it into
             * the shared key. Since DEFAULT_SETTINGS_PAYLOAD.theme is "dark-1",
             * any profile that had ever saved settings would open PointsBuilder on
             * dark-1 while every other tool was on the user's real choice — and
             * because it wrote that back, the choice was destroyed rather than
             * merely ignored. Same bug composition's seedBuilderSandbox() had; the
             * theme is a device preference, not per-tool settings.
             */
            let storedTheme = "";
            try {
                storedTheme = localStorage.getItem(THEME_KEY) || "";
            } catch {
                storedTheme = "";
            }
            if (!storedTheme) {
                const next = normalizeTheme(payload.theme);
                applyTheme(next);
                localStorage.setItem(THEME_KEY, next);
            }
        }
        if (payload.showAxes !== undefined && chkAxes) {
            chkAxes.checked = !!payload.showAxes;
            if (axesHelper) axesHelper.visible = chkAxes.checked;
            if (axisLabelGroup) axisLabelGroup.visible = chkAxes.checked;
        }
        if (payload.showGrid !== undefined && chkGrid) {
            chkGrid.checked = !!payload.showGrid;
            if (gridHelper) gridHelper.visible = chkGrid.checked;
        }
        if (payload.pointSize !== undefined) {
            setPointSize(payload.pointSize);
            if (inpPointSize) inpPointSize.value = String(pointSize);
        }
        if (!opts.skipSave) saveSettingsToStorage();
    }

    function getSnapGridKeyToggleMode() {
        return !!snapGridKeyToggleMode;
    }

    function getSnapParticleKeyToggleMode() {
        return !!snapParticleKeyToggleMode;
    }

    if (chkAutoSelectCompleteGroups && !chkAutoSelectCompleteGroups.__pbBound) {
        chkAutoSelectCompleteGroups.__pbBound = true;
        chkAutoSelectCompleteGroups.addEventListener("change", () => {
            setAutoSelectCompleteGroups(chkAutoSelectCompleteGroups.checked);
        });
    }

    function loadSettingsFromStorage() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (!raw) {
                applySettingsPayload(DEFAULT_SETTINGS_PAYLOAD, { skipSave: true });
                return;
            }
            const obj = JSON.parse(raw);
            applySettingsPayload(Object.assign({}, DEFAULT_SETTINGS_PAYLOAD, obj || {}), { skipSave: true });
        } catch (e) {
            console.warn("loadSettings failed:", e);
            applySettingsPayload(DEFAULT_SETTINGS_PAYLOAD, { skipSave: true });
        }
    }

    let getFilterScope, saveRootFilter, isFilterActive, filterAllows, getVisibleEntries, getVisibleIndices, swapInList, findVisibleSwapIndex, cleanupFilterMenus;
      let renderCards, renderParamsEditors, layoutActionOverflow, initCollapseAllControls, setupListDropZone, addQuickOffsetTo, navigateCardScope;
      let revealCardScopeById, getCurrentCardScopeContext, formatNodePathLabel, beginRenameNode;
      let createFilterControls, createParamSyncControls, renderSyncMenu, bindParamSyncListeners, isSyncSelectableEvent, toggleSyncTarget, setSyncTargetsByIds, setSyncEnabled, paramSync;
      let getCardSelectionIds, setCardSelectionIds, clearCardSelectionIds;
      let hotkeys, hotkeyToHuman, hotkeyMatchEvent, normalizeHotkey, shouldIgnorePlainHotkeys;
      let openHotkeysModal, hideHotkeysModal, beginHotkeyCapture, refreshHotkeyHints, handleHotkeyCaptureKeydown;
      let isDraggingCard = false;


    let toastTimer = 0;
    function showToast(msg, type = "info") {
        let el = document.getElementById("pbToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "pbToast";
            el.className = "toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.remove("success", "error", "info", "show");
        if (type) el.classList.add(type);
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
    }

    // -------------------------
    // Project name / Kotlin ending
    // -------------------------
    let projectName = loadProjectName();
    if (!projectName) {
        projectName = "shape";
        saveProjectName(projectName);
    }

    function getProjectBaseName() {
        return sanitizeFileBase(projectName || "");
    }

    function makeExportFileName(ext, fallbackBase) {
        const base = getProjectBaseName();
        const safeBase = base || fallbackBase || "export";
        return `${safeBase}.${ext}`;
    }

    let kotlinEndMode = loadKotlinEndMode();

    // 让 axis 指向 toPoint，并保持“上方向”稳定（平面包含世界 Up）
    function rotatePointsToPointUpright(points, toPoint, axis, upRef = U.v(0, 1, 0)) {
        if (!points || points.length === 0) return points;
        const fwd = U.norm(axis);
        const dir = U.norm(toPoint);
        if (U.len(fwd) <= 1e-6 || U.len(dir) <= 1e-6) return points;

        const buildBasis = (forward) => {
            const f = U.norm(forward);
            let r = U.cross(upRef, f);
            if (U.len(r) <= 1e-6) {
                const altUp = (Math.abs(upRef.y) > 0.9) ? U.v(1, 0, 0) : U.v(0, 1, 0);
                r = U.cross(altUp, f);
            }
            if (U.len(r) <= 1e-6) return null;
            r = U.norm(r);
            const u = U.norm(U.cross(f, r));
            return {r, u, f};
        };

        const from = buildBasis(fwd);
        const to = buildBasis(dir);
        if (!from || !to) return points;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const x = U.dot(p, from.r);
            const y = U.dot(p, from.u);
            const z = U.dot(p, from.f);
            points[i] = {
                x: to.r.x * x + to.u.x * y + to.f.x * z,
                y: to.r.y * x + to.u.y * y + to.f.y * z,
                z: to.r.z * x + to.u.z * y + to.f.z * z,
            };
        }
        return points;
    }

    // -------------------------
    // Kotlin output (highlight)
    // -------------------------
    let kotlinRaw = "";
    let kotlinDirty = true;
    let kotlinRenderTimer = 0;
    const KOTLIN_RENDER_DELAY_MS = 110;

    function setKotlinOut(text, options = {}) {
        const next = text || "";
        const force = !!options.force;
        if (!force && next === kotlinRaw) {
            kotlinDirty = false;
            return;
        }
        kotlinRaw = next;
        kotlinDirty = false;
        if (!elKotlinOut) return;
        const highlighter = globalThis.CodeHighlighter && globalThis.CodeHighlighter.highlightKotlin;
        if (typeof highlighter === "function") {
            elKotlinOut.innerHTML = highlighter(kotlinRaw);
        } else {
            elKotlinOut.textContent = kotlinRaw;
        }
    }

    function flushKotlinOut() {
        if (kotlinRenderTimer) {
            clearTimeout(kotlinRenderTimer);
            kotlinRenderTimer = 0;
        }
        setKotlinOut(emitKotlin());
    }

    function scheduleKotlinOut() {
        if (kotlinRenderTimer) clearTimeout(kotlinRenderTimer);
        kotlinRenderTimer = setTimeout(() => {
            kotlinRenderTimer = 0;
            setKotlinOut(emitKotlin());
        }, KOTLIN_RENDER_DELAY_MS);
    }

    // -------------------------
    // Layout (panel sizes + kotlin toggle)
    // -------------------------
    const layoutSystem = initLayoutSystem({
        layoutEl,
        panelLeft,
        panelRight,
        resizerLeft,
        resizerRight,
        btnToggleKotlin,
        onResize,
        clamp
    });
    const {
        applyLayoutState,
        setKotlinHidden,
        updateKotlinToggleText,
        bindResizers,
        isKotlinHidden
    } = layoutSystem;

    function bindCardBodyResizer(resizerEl, bodyEl, target) {
        if (!resizerEl || !bodyEl || !target) return;
        resizerEl.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            if (target.collapsed) return;
            e.preventDefault();
            e.stopPropagation();
            historyCapture("resize_card_body");

            const startY = e.clientY;
            const startH = bodyEl.getBoundingClientRect().height || 0;
            const minH = 40;
            let maxH = Math.max(minH, Math.round(window.innerHeight * 0.8));

            const cardEl = bodyEl.closest ? bodyEl.closest(".card") : null;
            const subcards = cardEl && cardEl.parentElement && cardEl.parentElement.classList.contains("subcards")
                ? cardEl.parentElement
                : null;
            if (subcards) {
                const comp = window.getComputedStyle(subcards);
                const maxHStr = comp && comp.maxHeight ? String(comp.maxHeight) : "";
                const maxFromCss = maxHStr && maxHStr !== "none" ? parseFloat(maxHStr) : NaN;
                const headEl = cardEl.querySelector(".card-head");
                const headH = headEl ? headEl.getBoundingClientRect().height : 0;
                const limit = Math.floor((Number.isFinite(maxFromCss) ? maxFromCss : subcards.getBoundingClientRect().height) - headH - 12);
                if (Number.isFinite(limit) && limit > minH) {
                    maxH = Math.min(maxH, limit);
                }
            }
            const prevTransition = bodyEl.style.transition;
            bodyEl.style.transition = "none";

            const onMove = (ev) => {
                const next = clamp(startH + (ev.clientY - startY), minH, maxH);
                target.bodyHeight = next;
                bodyEl.style.height = `${next}px`;
                bodyEl.style.maxHeight = `${next}px`;
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-card");
                bodyEl.style.transition = prevTransition || "";
            };

            document.body.classList.add("resizing-card");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function bindSubblockWidthResizer(resizerEl, blockEl, target) {
        if (!resizerEl || !blockEl || !target) return;
        resizerEl.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            historyCapture("resize_subblock");

            const startX = e.clientX;
            const startW = blockEl.getBoundingClientRect().width || 0;
            const parentW = (blockEl.parentElement && blockEl.parentElement.getBoundingClientRect().width) || startW;
            const minW = 240;
            const maxW = Math.max(minW, parentW - 6);
            const prevTransition = blockEl.style.transition;
            blockEl.style.transition = "none";

            const onMove = (ev) => {
                const next = clamp(startW + (ev.clientX - startX), minW, maxW);
                target.subWidth = next;
                blockEl.style.width = `${next}px`;
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-subblock");
                blockEl.style.transition = prevTransition || "";
            };

            document.body.classList.add("resizing-subblock");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    function bindSubblockHeightResizer(resizerEl, subEl, target) {
        if (!resizerEl || !subEl || !target) return;
        resizerEl.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            historyCapture("resize_subblock_height");

            const startY = e.clientY;
            const startH = subEl.getBoundingClientRect().height || 0;
            const minH = 120;
            let maxH = Math.max(minH, Math.round(window.innerHeight * 0.75));
            const blockEl = subEl.closest ? subEl.closest(".subblock") : null;
            const parentBody = blockEl ? blockEl.closest(".card-body") : null;
            if (parentBody && parentBody.style && parentBody.style.height) {
                const bodyRect = parentBody.getBoundingClientRect();
                const blockRect = blockEl.getBoundingClientRect();
                const subRect = subEl.getBoundingClientRect();
                const otherH = Math.max(0, blockRect.height - subRect.height);
                const limit = Math.floor(bodyRect.height - otherH - 10);
                if (Number.isFinite(limit) && limit > minH) {
                    maxH = Math.min(maxH, limit);
                }
            }
            const prevTransition = subEl.style.transition;
            subEl.style.transition = "none";

            const onMove = (ev) => {
                const next = clamp(startH + (ev.clientY - startY), minH, maxH);
                target.subHeight = next;
                subEl.style.height = `${next}px`;
                subEl.style.maxHeight = `${next}px`;
            };

            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-subblock-y");
                subEl.style.transition = prevTransition || "";
            };

            document.body.classList.add("resizing-subblock-y");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }


    // -------------------------
    // KIND
    // -------------------------
    const KIND = createKindDefs({ U, num, int, relExpr, rotatePointsToPointUpright, applyPointsBuilderInstanceOverrides });

    // -------------------------
    // Node
    // -------------------------
    const nodeHelpers = createNodeHelpers({
        KIND,
        uid,
        getDefaultMirrorPlane: () => mirrorPlane
    });
    const {
        cloneNodeDeep,
        cloneNodeListDeep,
        replaceListContents,
        mirrorCopyNode
    } = nodeHelpers;
    const makeNode = (kind, init = {}) => createPointsBuilderNode(kind, init, {
        idFactory: uid,
        defaultParams: KIND[kind]?.defaultParams || {},
        mergeDefaultParams: false
    });

    // -------------------------
    // state
    // -------------------------
    let state = createPointsBuilderState();

    function hasMeaningfulVecComponentValue(value) {
        if (value === undefined || value === null) return false;
        return String(value).trim() !== "";
    }

    function assignLegacyVecComponentIfMissing(p, key, value) {
        if (!hasMeaningfulVecComponentValue(value)) return;
        if (hasMeaningfulVecComponentValue(p[key])) return;
        p[key] = value;
    }

    function syncLegacyVecParamsFromObject(p, prefix, objKey = null) {
        if (!p || typeof p !== "object") return;
        const raw = p[objKey || prefix];
        if (!raw) return;
        const px = `${prefix}x`;
        const py = `${prefix}y`;
        const pz = `${prefix}z`;
        if (Array.isArray(raw)) {
            assignLegacyVecComponentIfMissing(p, px, raw[0]);
            assignLegacyVecComponentIfMissing(p, py, raw[1]);
            assignLegacyVecComponentIfMissing(p, pz, raw[2]);
            return;
        }
        if (typeof raw === "object") {
            assignLegacyVecComponentIfMissing(p, px, raw.x);
            assignLegacyVecComponentIfMissing(p, py, raw.y);
            assignLegacyVecComponentIfMissing(p, pz, raw.z);
        }
    }

    function syncPresetLegacyParamAliases(node) {
        if (!node || !node.params || typeof node.params !== "object") return;
        const p = node.params;
        switch (node.kind) {
            case "add_bezier_4":
                syncLegacyVecParamsFromObject(p, "s", "start");
                syncLegacyVecParamsFromObject(p, "e", "end");
                syncLegacyVecParamsFromObject(p, "sh", "startHandle");
                syncLegacyVecParamsFromObject(p, "eh", "endHandle");
                if (p.count === undefined && p.counts !== undefined) p.count = p.counts;
                break;
            case "add_bezier_curve":
                syncLegacyVecParamsFromObject(p, "e", "target");
                syncLegacyVecParamsFromObject(p, "sh", "startHandle");
                syncLegacyVecParamsFromObject(p, "eh", "endHandle");
                if (p.count === undefined && p.counts !== undefined) p.count = p.counts;
                break;
            case "add_bezier":
                syncLegacyVecParamsFromObject(p, "p1");
                syncLegacyVecParamsFromObject(p, "p2");
                syncLegacyVecParamsFromObject(p, "p3");
                if (p.count === undefined && p.counts !== undefined) p.count = p.counts;
                break;
        }
    }

    function normalizeNodeTree(node) {
        return normalizePointsBuilderNodeTree(node, {
            idFactory: uid,
            toNumber: num
        });
    }

    function reassignNodeIdsDeep(target, usedIds = null) {
        return reassignPointsBuilderIds(target, usedIds, { idFactory: uid });
    }

    function collectNodeIds(target = state.root) {
        return collectPointsBuilderIds(target);
    }

    function ensureUniqueNodeIds(target = state.root) {
        return ensureUniquePointsBuilderIds(target, { idFactory: uid });
    }

    function normalizeState(obj) {
        const normalized = normalizePointsBuilderState(obj, {
            idFactory: uid,
            toNumber: num,
            requireDirectRoot: true,
            normalizePresets: normalizePresetList,
            normalizeVariables: normalizeVariableState
        });
        if (normalized) delete normalized.presets;
        return normalized;
    }

    function ensureBuilderSnapshotState() {
        if (!state.builderSnapshots || typeof state.builderSnapshots !== "object" || Array.isArray(state.builderSnapshots)) {
            state.builderSnapshots = {};
        }
        return state.builderSnapshots;
    }

    function ensureBuilderPresetMappingState() {
        if (!state.builderPresetMappings || typeof state.builderPresetMappings !== "object" || Array.isArray(state.builderPresetMappings)) {
            state.builderPresetMappings = {};
        }
        return state.builderPresetMappings;
    }

    function normalizeBuilderInstanceId(value) {
        const id = String(value || "").trim();
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) ? id : "";
    }

    function formatBuilderInstanceId(value, options = {}) {
        const words = String(value || "")
            .trim()
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .split(/[^A-Za-z0-9]+/)
            .filter(Boolean);
        if (!words.length) return options.fallback || "instance";
        const first = words[0].toLowerCase();
        const rest = words.slice(1).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");
        const combined = `${first}${rest}`;
        const withCase = options.upperFirst
            ? combined.charAt(0).toUpperCase() + combined.slice(1)
            : combined;
        return /^[A-Za-z_]/.test(withCase) ? withCase : `instance${withCase}`;
    }

    function suggestBuilderInstanceId(value, fallback = "instance") {
        const normalized = formatBuilderInstanceId(value, { fallback });
        return normalizeBuilderInstanceId(normalized) || fallback;
    }

    function getCurrentBuilderRegistryOwner() {
        const context = globalThis.__PB_EDITOR_CONTEXT || {};
        const target = String(context.target || "root").trim() || "root";
        const targetLabel = target === "shape"
            ? "Shape Builder"
            : (/^tree_node:/.test(target) ? "形状节点 Builder" : "根 Builder");
        return {
            ownerId: isCompositionPointsBuilder
                ? String(compositionReferenceCardId || context.cardId || "current")
                : "project",
            ownerName: isCompositionPointsBuilder
                ? String((compositionReferenceState?.cards || []).find((card) => String(card?.id || "") === String(compositionReferenceCardId || context.cardId || ""))?.name || "当前卡片")
                : String(projectName || "当前项目"),
            target,
            targetLabel
        };
    }

    function projectBuilderInstanceRegistryId(value) {
        let id = String(value || "").trim();
        for (const rename of compositionBuilderInstanceRenames) {
            if (id === String(rename?.from || "").trim()) id = String(rename?.to || "").trim();
        }
        return id;
    }

    function getBuilderInstanceRegistryEntries() {
        const currentOwner = getCurrentBuilderRegistryOwner();
        const currentOwnerKey = `${currentOwner.ownerId}:${currentOwner.target}`;
        const merged = new Map();
        const addEntry = (raw, options = {}) => {
            const id = projectBuilderInstanceRegistryId(raw?.id);
            if (!id || raw?.registered === false) return;
            let entry = merged.get(id);
            if (!entry) {
                entry = {
                    id,
                    name: String(raw?.name || id).trim() || id,
                    registered: true,
                    snapshot: null,
                    referenceCount: 0,
                    owners: [],
                    references: []
                };
                merged.set(id, entry);
            }
            if (!entry.snapshot && raw?.snapshot && typeof raw.snapshot === "object") {
                entry.snapshot = deepCloneJson(raw.snapshot) || null;
                if (entry.snapshot) entry.snapshot.id = id;
            }
            const owners = Array.isArray(raw?.owners) ? raw.owners : [];
            const references = Array.isArray(raw?.references) ? raw.references : [];
            for (const owner of owners) {
                const key = `${String(owner?.ownerId || "")}:${String(owner?.target || "root")}`;
                if (options.excludeCurrent && key === currentOwnerKey) continue;
                if (!entry.owners.some((item) => `${item.ownerId}:${item.target}` === key)) entry.owners.push({ ...owner });
            }
            for (const reference of references) {
                const key = `${String(reference?.ownerId || "")}:${String(reference?.target || "root")}`;
                if (options.excludeCurrent && key === currentOwnerKey) continue;
                const count = Math.max(0, Math.trunc(Number(reference?.count) || 0));
                const existing = entry.references.find((item) => `${item.ownerId}:${item.target}` === key);
                if (existing) existing.count += count;
                else entry.references.push({ ...reference, count });
            }
        };
        if (isCompositionPointsBuilder) {
            for (const entry of compositionBuilderInstanceRegistry) addEntry(entry, { excludeCurrent: true });
        }
        for (const entry of collectBuilderInstanceRegistry(state, currentOwner)) addEntry(entry);
        for (const entry of merged.values()) {
            entry.referenceCount = entry.references.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.count) || 0)), 0);
        }
        return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
    }

    function importRegisteredBuilderSnapshot(snapshotId) {
        const id = projectBuilderInstanceRegistryId(snapshotId);
        if (!id) return null;
        const snapshots = ensureBuilderSnapshotState();
        const entry = getBuilderInstanceRegistryEntries().find((item) => item.id === id);
        if (!entry?.snapshot) return snapshots[id] || null;
        const snapshot = deepCloneJson(entry.snapshot) || null;
        if (!snapshot) return null;
        snapshot.id = id;
        snapshot.children = Array.isArray(snapshot.children) ? snapshot.children : [];
        normalizeNodeTree(snapshot.children);
        snapshots[id] = snapshot;
        return snapshot;
    }

    function syncCompositionRegisteredBuilderSnapshots() {
        if (!isCompositionPointsBuilder) return { changed: false, syncedIds: [] };
        return syncRegisteredBuilderSnapshotsFromRegistry(state, compositionBuilderInstanceRegistry, {
            normalizeChildren: normalizeNodeTree
        });
    }

    function persistCompositionBuilderInstanceRenames() {
        if (!isCompositionPointsBuilder) return;
        try {
            localStorage.setItem(BUILDER_INSTANCE_RENAME_STORAGE_KEY, JSON.stringify({
                compositionRevision: compositionBuilderInstanceRegistryRevision,
                renames: compositionBuilderInstanceRenames,
                updatedAt: Date.now()
            }));
        } catch (error) {
            console.warn("persist builder instance renames failed:", error);
        }
    }

    function queueCompositionBuilderInstanceRename(fromId, toId) {
        if (!isCompositionPointsBuilder) return;
        const next = [];
        let chained = false;
        for (const rename of compositionBuilderInstanceRenames) {
            const from = String(rename?.from || "").trim();
            const to = String(rename?.to || "").trim();
            if (!from || !to) continue;
            if (to === fromId) {
                next.push({ from, to: toId });
                chained = true;
            } else if (from === fromId) {
                next.push({ from, to: toId });
                chained = true;
            } else {
                next.push({ from, to });
            }
        }
        if (!chained) next.push({ from: fromId, to: toId });
        compositionBuilderInstanceRenames = next.filter((rename) => rename.from !== rename.to);
        persistCompositionBuilderInstanceRenames();
    }

    function renameRegisteredBuilderInstanceId(fromId, rawToId, knownEntry = null) {
        const from = normalizeBuilderInstanceId(fromId);
        const rawTo = String(rawToId || "").trim();
        if (rawTo === from) return true;
        const to = normalizeBuilderInstanceId(formatBuilderInstanceId(rawToId, { fallback: "" }));
        if (!from || !to) {
            showToast("实例 ID 必须是合法的小驼峰 Kotlin 标识符", "error");
            return false;
        }
        if (from === to) return true;
        const registry = getBuilderInstanceRegistryEntries();
        if (registry.some((entry) => entry.id === to)) {
            showToast(`实例 ID“${to}”已注册，不能覆盖`, "error");
            return false;
        }
        const localEntry = registry.find((entry) => entry.id === from)
            || (knownEntry?.id === from ? knownEntry : null);
        if (!localEntry) {
            showToast(`实例 ID“${from}”不存在`, "error");
            return false;
        }
        historyCapture("rename_builder_instance_registry_id");
        const result = renameBuilderInstanceIdInState(state, from, to);
        if (result.conflict) {
            showToast(`实例 ID“${to}”已注册，不能覆盖`, "error");
            return false;
        }
        if (isCompositionPointsBuilder) queueCompositionBuilderInstanceRename(from, to);
        if (result.changed) {
            scheduleAutoSave();
            renderAll();
        } else {
            renderBuilderInstanceRegistry();
        }
        showToast(`实例 ID 已重命名为 ${to}`, "success");
        return true;
    }

    function renderBuilderInstanceRegistry() {
        if (!builderInstanceRegistryList || !builderInstanceRegistryStatus) return;
        const entries = getBuilderInstanceRegistryEntries();
        const ownerKeys = new Set(entries.flatMap((entry) => entry.owners.map((owner) => `${owner.ownerId}:${owner.target}`)));
        const referenceCount = entries.reduce((sum, entry) => sum + entry.referenceCount, 0);
        builderInstanceRegistryStatus.textContent = isCompositionPointsBuilder
            ? `${entries.length} 个已注册 ID · ${ownerKeys.size} 个 PointsBuilder · ${referenceCount} 处引用`
            : `${entries.length} 个已注册 ID · ${referenceCount} 处引用`;
        builderInstanceRegistryList.replaceChildren();
        if (!entries.length) {
            const empty = document.createElement("div");
            empty.className = "param-editor-empty";
            empty.textContent = "当前项目没有已注册的实例 ID";
            builderInstanceRegistryList.appendChild(empty);
            return;
        }
        const help = document.createElement("div");
        help.className = "instance-registry-help pb-tooltip-anchor";
        help.textContent = "失焦或按 Enter 应用重命名";
        help.setAttribute("data-tip", "重命名会同步当前项目中所有普通实例、环形槽位和预设映射引用；Composition 会在返回时同步其他 PointsBuilder。");
        builderInstanceRegistryList.appendChild(help);
        for (const entry of entries) {
            const item = document.createElement("article");
            item.className = "instance-registry-item";
            const head = document.createElement("div");
            head.className = "instance-registry-item-head";
            const input = document.createElement("input");
            input.type = "text";
            input.className = "input instance-registry-id-input";
            input.value = entry.id;
            input.autocomplete = "off";
            input.spellcheck = false;
            input.setAttribute("aria-label", `重命名实例 ID ${entry.id}`);
            let committed = false;
            const commit = () => {
                if (committed) return;
                committed = true;
                if (!renameRegisteredBuilderInstanceId(entry.id, input.value, entry)) {
                    input.value = entry.id;
                    committed = false;
                }
            };
            input.addEventListener("focus", () => { committed = false; });
            input.addEventListener("blur", commit);
            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    input.blur();
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    input.value = entry.id;
                    committed = true;
                    input.blur();
                }
            });
            const badge = document.createElement("span");
            badge.className = "instance-registry-reference-count";
            badge.textContent = `${entry.referenceCount} 引用`;
            head.append(input, badge);
            item.appendChild(head);
            const meta = document.createElement("div");
            meta.className = "instance-registry-meta";
            meta.textContent = entry.name && entry.name !== entry.id ? entry.name : "已注册实例";
            item.appendChild(meta);
            const owners = document.createElement("div");
            owners.className = "instance-registry-owners";
            for (const owner of entry.owners) {
                const chip = document.createElement("span");
                chip.className = "instance-registry-owner";
                chip.textContent = `${owner.ownerName} · ${owner.targetLabel}`;
                owners.appendChild(chip);
            }
            item.appendChild(owners);
            builderInstanceRegistryList.appendChild(item);
        }
    }

    function ensureBuilderReferenceDialog() {
        let mask = document.getElementById("builderReferenceDialogMask");
        let modal = document.getElementById("builderReferenceDialog");
        if (mask && modal) return { mask, modal };
        mask = document.createElement("div");
        mask.id = "builderReferenceDialogMask";
        mask.className = "modal-mask hidden";
        modal = document.createElement("div");
        modal.id = "builderReferenceDialog";
        modal.className = "modal hidden builder-reference-dialog";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.innerHTML = `
            <div class="modal-head">
                <div class="modal-title">重构实例</div>
                <button class="btn icon" type="button" data-builder-reference-dialog-close aria-label="关闭">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
                </button>
            </div>
            <div class="modal-body builder-reference-dialog-body">
                <div class="builder-reference-dialog-note" data-builder-reference-dialog-note></div>
                <label class="builder-reference-dialog-field">
                    <span>实例 ID</span>
                    <input id="builderReferenceIdInput" class="input" type="text" autocomplete="off" spellcheck="false"
                        role="combobox" aria-autocomplete="list" aria-expanded="false"
                        aria-controls="builderReferenceIdSuggestions" data-builder-reference-dialog-input />
                    <div id="builderReferenceIdSuggestions" class="builder-reference-id-suggestions hidden"
                        data-builder-reference-id-suggestions role="listbox" aria-label="项目内已注册实例"></div>
                </label>
                <div class="builder-reference-dialog-modes" data-builder-reference-dialog-modes>
                    <button class="builder-reference-mode-option active pb-tooltip-anchor" type="button" data-mode="registered" data-tip="注册式：目标 ID 不存在时注册当前原型，存在时引用已有原型。">
                        <strong>注册式</strong><span>创建或引用</span>
                    </button>
                    <button class="builder-reference-mode-option pb-tooltip-anchor" type="button" data-mode="indexed" data-tip="索引式：复制当前原型为当前卡片独享版本，后续编辑不会同步其他卡片。">
                        <strong>索引式</strong><span>当前卡片独享</span>
                    </button>
                    <button class="builder-reference-mode-option pb-tooltip-anchor" type="button" data-mode="linked" data-tip="联动式：重命名注册原型，并同步更新所有相同 ID 的实例引用。">
                        <strong>联动式</strong><span>全局同步改名</span>
                    </button>
                </div>
                <div class="builder-reference-dialog-error" data-builder-reference-dialog-error role="status"></div>
            </div>
            <div class="modal-foot builder-reference-dialog-foot">
                <button class="btn" type="button" data-builder-reference-dialog-cancel>取消</button>
                <span style="flex:1 1 auto;"></span>
                <button class="btn primary" type="button" data-builder-reference-dialog-apply>重构</button>
            </div>`;
        document.body.append(mask, modal);
        return { mask, modal };
    }

    function openBuilderReferenceDialog(options = {}) {
        const { mask, modal } = ensureBuilderReferenceDialog();
        const input = modal.querySelector("[data-builder-reference-dialog-input]");
        const suggestions = modal.querySelector("[data-builder-reference-id-suggestions]");
        const note = modal.querySelector("[data-builder-reference-dialog-note]");
        const error = modal.querySelector("[data-builder-reference-dialog-error]");
        const modes = modal.querySelector("[data-builder-reference-dialog-modes]");
        const modeButtons = Array.from(modal.querySelectorAll("[data-builder-reference-dialog-modes] [data-mode]"));
        const initialMode = ["registered", "indexed", "linked"].includes(options.mode) ? options.mode : "registered";
        let selectedMode = initialMode;
        let settled = false;
        const close = (value) => {
            if (settled) return;
            settled = true;
            mask.classList.add("hidden");
            modal.classList.add("hidden");
            resolve(value);
        };
        let resolve;
        const promise = new Promise((res) => { resolve = res; });
        let allSuggestionIds = [];
        let visibleSuggestionIds = [];
        let activeSuggestionIndex = -1;
        const hideSuggestions = () => {
            activeSuggestionIndex = -1;
            suggestions?.classList.add("hidden");
            input?.setAttribute("aria-expanded", "false");
            input?.removeAttribute("aria-activedescendant");
        };
        const chooseSuggestion = (id) => {
            if (!input) return;
            input.value = id;
            hideSuggestions();
            input.focus();
        };
        const renderSuggestions = () => {
            if (!suggestions || !input) return;
            const query = String(input.value || "").trim().toLowerCase();
            const matches = allSuggestionIds.filter((id) => !query || id.toLowerCase().includes(query)).slice(0, 8);
            suggestions.replaceChildren();
            activeSuggestionIndex = -1;
            if (!matches.length) {
                hideSuggestions();
                return;
            }
            const header = document.createElement("div");
            header.className = "builder-reference-id-suggestions-head";
            const headerTitle = document.createElement("span");
            headerTitle.textContent = "已注册实例";
            const headerCount = document.createElement("span");
            headerCount.className = "builder-reference-id-suggestions-count";
            headerCount.textContent = `${matches.length} 个`;
            header.append(headerTitle, headerCount);
            suggestions.appendChild(header);
            matches.forEach((id, index) => {
                const option = document.createElement("button");
                option.type = "button";
                option.className = "builder-reference-id-suggestion";
                option.id = `builderReferenceIdSuggestion${index}`;
                option.dataset.index = String(index);
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", "false");
                const badge = document.createElement("span");
                badge.className = "builder-reference-id-suggestion-badge";
                badge.textContent = "ID";
                const label = document.createElement("span");
                label.className = "builder-reference-id-suggestion-label";
                label.textContent = id;
                const state = document.createElement("span");
                state.className = "builder-reference-id-suggestion-state";
                state.textContent = "已注册";
                option.append(badge, label, state);
                option.addEventListener("mousedown", (event) => event.preventDefault());
                option.addEventListener("click", () => chooseSuggestion(id));
                suggestions.appendChild(option);
            });
            visibleSuggestionIds = matches;
            suggestions.classList.remove("hidden");
            input.setAttribute("aria-expanded", "true");
        };
        const setError = (message = "") => {
            if (error) error.textContent = message;
        };
        const setMode = (mode) => {
            selectedMode = ["registered", "indexed", "linked"].includes(mode) ? mode : "registered";
            modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === selectedMode));
        };
        const apply = () => {
            const id = normalizeBuilderInstanceId(formatBuilderInstanceId(input?.value, { fallback: "" }));
            if (!id) {
                setError("实例 ID 必须是合法的 Kotlin 标识符，只能包含字母、数字和下划线，且不能以数字开头。");
                input?.focus();
                return;
            }
            close({ id, mode: selectedMode });
        };
        if (note) note.textContent = String(options.message || "输入实例 ID，并选择这次重构的绑定方式。");
        if (suggestions) {
            allSuggestionIds = getBuilderInstanceRegistryEntries()
                .map((entry) => String(entry?.id || "").trim())
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b));
            hideSuggestions();
        }
        if (input) {
            input.value = String(options.initialValue || "").trim();
            input.oninput = renderSuggestions;
            input.onfocus = renderSuggestions;
            input.onkeydown = (event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    if (!suggestions || suggestions.classList.contains("hidden")) return;
                    event.preventDefault();
                    const delta = event.key === "ArrowDown" ? 1 : -1;
                    activeSuggestionIndex = (activeSuggestionIndex + delta + visibleSuggestionIds.length) % visibleSuggestionIds.length;
                    suggestions.querySelectorAll(".builder-reference-id-suggestion").forEach((option, index) => {
                        option.classList.toggle("active", index === activeSuggestionIndex);
                        option.setAttribute("aria-selected", index === activeSuggestionIndex ? "true" : "false");
                        if (index === activeSuggestionIndex) {
                            input.setAttribute("aria-activedescendant", option.id);
                            option.scrollIntoView({ block: "nearest" });
                        }
                    });
                } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (activeSuggestionIndex >= 0 && visibleSuggestionIds[activeSuggestionIndex]) chooseSuggestion(visibleSuggestionIds[activeSuggestionIndex]);
                    else apply();
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    if (suggestions && !suggestions.classList.contains("hidden")) hideSuggestions();
                    else close(null);
                }
            };
        }
        modeButtons.forEach((button) => {
            button.onclick = () => setMode(button.dataset.mode);
        });
        if (modes) modes.classList.toggle("hidden", options.showModes === false);
        modal.querySelector("[data-builder-reference-dialog-close]").onclick = () => close(null);
        modal.querySelector("[data-builder-reference-dialog-cancel]").onclick = () => close(null);
        modal.querySelector("[data-builder-reference-dialog-apply]").onclick = apply;
        mask.onclick = () => close(null);
        modal.onmousedown = (event) => {
            if (suggestions && !suggestions.contains(event.target) && event.target !== input) hideSuggestions();
        };
        setError("");
        setMode(initialMode);
        mask.classList.remove("hidden");
        modal.classList.remove("hidden");
        requestAnimationFrame(() => {
            input?.focus();
            input?.select?.();
        });
        return promise;
    }

    function promptBuilderInstanceId(message, initialValue = "") {
        return openBuilderReferenceDialog({
            message,
            initialValue,
            showModes: false
        }).then((result) => result?.id || "");
    }

    function findBuilderSnapshotByPresetId(presetId) {
        const id = String(presetId || "").trim();
        if (!id) return null;
        const snapshots = ensureBuilderSnapshotState();
        const mappings = ensureBuilderPresetMappingState();
        const mappedId = String(mappings[id] || "").trim();
        if (mappedId && snapshots[mappedId]) {
            if (String(snapshots[mappedId].sourcePresetId || "") === id) return snapshots[mappedId];
            delete mappings[id];
        }
        const snapshot = Object.values(snapshots).find((item) => item && item.sourcePresetId === id) || null;
        if (snapshot) mappings[id] = snapshot.id;
        return snapshot;
    }

    function makeBuilderSnapshotFromPreset(preset, options = {}) {
        let id = normalizeBuilderInstanceId(options.id);
        if (!id) id = `pbs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        while (ensureBuilderSnapshotState()[id]) id += "_x";
        const normalized = normalizePresetList([preset])[0];
        if (!normalized) return null;
        const variableInfo = normalizePresetVariableInfoForStorage(
            options.variableInfo || getPresetEffectiveVariableInfo(normalized) || normalized.variables
        );
        if (variableInfo && options.variableValues) {
            variableInfo.inputs = normalizePresetVariableValues(options.variableValues);
        }
        const snapshot = {
            id,
            sourcePresetId: String(normalized.id || "").trim(),
            sourcePresetRevision: String(normalized.updatedAt || normalized.createdAt || "").trim(),
            name: String(normalized.name || "未命名实例").trim() || "未命名实例",
            origin: normalizePointValue(normalized.origin),
            variables: variableInfo ? deepCloneJson(variableInfo) : null,
            staticOverrides: variableInfo ? deepCloneJson(variableInfo.inputs || {}) : null,
            children: deepCloneJson(normalized.children || []) || [],
            revision: 1,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        normalizeNodeTree(snapshot.children);
        if (options.persist !== false) ensureBuilderSnapshotState()[id] = snapshot;
        return snapshot;
    }

    function makeBuilderReferenceNode(snapshot, point, label = "") {
        if (!snapshot) return null;
        const anchor = normalizePointValue(point);
        const origin = normalizePointValue(snapshot.origin);
        const node = makeNode(BUILDER_REFERENCE_KIND, {
            label: label || snapshot.name,
            params: {
                snapshotId: snapshot.id,
                parameterId: "",
                instanceMode: "static",
                ox: anchor.x - origin.x,
                oy: anchor.y - origin.y,
                oz: anchor.z - origin.z,
                scale: 1,
                rotationDeg: 0,
                rotationAxisX: 0,
                rotationAxisY: 1,
                rotationAxisZ: 0,
                overrides: snapshot.staticOverrides
                    ? deepCloneJson(snapshot.staticOverrides) || {}
                    : snapshot.variables
                    ? deepCloneJson(getPresetVariableDefaultValues(snapshot.variables)) || {}
                    : {}
            }
        });
        node.params.parameterId = `pb_instance_${node.id}`;
        node.children = [];
        return node;
    }

    function makeBuilderSnapshotFromNode(sourceNode, options = {}) {
        if (!sourceNode || !Array.isArray(sourceNode.children)) return null;
        const snapshots = ensureBuilderSnapshotState();
        let id = normalizeBuilderInstanceId(options.id)
            || `pbs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        while (snapshots[id]) id += "_x";
        const snapshot = {
            id,
            sourcePresetId: "",
            sourcePresetRevision: "",
            name: String(sourceNode.label || "实例").trim() || "实例",
            origin: { x: 0, y: 0, z: 0 },
            variables: null,
            staticOverrides: null,
            children: deepCloneJson(sourceNode.children) || [],
            revision: 1,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        normalizeNodeTree(snapshot.children);
        snapshots[id] = snapshot;
        return snapshot;
    }

    async function convertGroupToBuilderReference(sourceNode, mode = "static") {
        if (!sourceNode || !isBuilderContainerKind(sourceNode.kind) || sourceNode.kind === BUILDER_REFERENCE_KIND) return false;
        const ctx = findNodeContextById(sourceNode.id);
        if (!ctx || !Array.isArray(ctx.parentList)) return false;
        const suggestedId = suggestBuilderInstanceId(sourceNode.label || sourceNode.id || "instance");
        const instanceId = await promptBuilderInstanceId("输入实例 ID；已注册的 ID 会直接引用已有原型。", suggestedId);
        if (!instanceId) return false;
        const bindingMode = "registered";
        const snapshot = importRegisteredBuilderSnapshot(instanceId)
            || ensureBuilderSnapshotState()[instanceId]
            || makeBuilderSnapshotFromNode(sourceNode, { id: instanceId });
        if (!snapshot) return false;
        const replacement = makeNode(BUILDER_REFERENCE_KIND, {
            label: sourceNode.label || snapshot.name,
            params: {
                snapshotId: snapshot.id,
                parameterId: "",
                instanceMode: mode === "construct" ? "construct" : "static",
                instanceBindingMode: bindingMode,
                ox: Number(sourceNode.params?.ox) || 0,
                oy: Number(sourceNode.params?.oy) || 0,
                oz: Number(sourceNode.params?.oz) || 0,
                scale: 1,
                rotationDeg: 0,
                rotationAxisX: 0,
                rotationAxisY: 1,
                rotationAxisZ: 0,
                overrides: {}
            }
        });
        replacement.params.parameterId = `pb_instance_${replacement.id}`;
        replacement.children = [];
        historyCapture("convert_group_to_builder_reference");
        ctx.parentList.splice(ctx.index, 1, replacement);
        normalizeNodeTree(state.root);
        scheduleAutoSave();
        renderAll();
        if (typeof setCardSelectionIds === "function") setCardSelectionIds([replacement.id], { replace: true, focus: false, syncWithParamSync: false });
        setFocusedNode(replacement.id, false);
        showToast(`已转换为${mode === "construct" ? "构造实例" : "静态实例"}（${bindingMode === "indexed" ? "索引式" : bindingMode === "linked" ? "联动式" : "注册式"}）`, "success");
        return true;
    }

    async function applyPresetReferenceAtPoint(preset, point, options = {}) {
        const normalized = normalizePresetList([preset])[0];
        if (!normalized || !point) return false;
        const snapshots = ensureBuilderSnapshotState();
        const mappings = ensureBuilderPresetMappingState();
        let snapshot = findBuilderSnapshotByPresetId(normalized.id);
        let pendingSnapshot = null;
        let requestedInstanceId = "";
        if (!snapshot) {
            requestedInstanceId = normalizeBuilderInstanceId(mappings[normalized.id] || normalized.instanceMappingId);
            if (!requestedInstanceId) {
                requestedInstanceId = await promptBuilderInstanceId(
                    `首次在当前项目使用预设“${normalized.name}”，请输入实例 ID`,
                    suggestBuilderInstanceId(normalized.name || normalized.id)
                );
                if (!requestedInstanceId) return false;
            }
            while (snapshots[requestedInstanceId]
                && String(snapshots[requestedInstanceId].sourcePresetId || "") !== String(normalized.id || "")) {
                showToast(`实例 ID“${requestedInstanceId}”已被其他预设占用，请输入新的实例 ID。`, "error");
                requestedInstanceId = await promptBuilderInstanceId(
                    `预设“${normalized.name}”请输入新的实例 ID`,
                    suggestBuilderInstanceId(`${normalized.name}_instance`)
                );
                if (!requestedInstanceId) return false;
            }
            if (snapshots[requestedInstanceId]) {
                snapshot = snapshots[requestedInstanceId];
                mappings[normalized.id] = requestedInstanceId;
            }
        }
        if (!snapshot) {
            if (!requestedInstanceId) return false;
            const variableInfo = getPresetEffectiveVariableInfo(normalized);
            const values = getPresetVariableEntries(variableInfo).length
                ? await openPresetVariableApplyDialog(Object.assign({}, normalized, { variables: variableInfo }))
                : getPresetVariableDefaultValues(variableInfo);
            if (!values) return false;
            pendingSnapshot = makeBuilderSnapshotFromPreset(normalized, {
                id: requestedInstanceId,
                persist: false,
                variableInfo,
                variableValues: values
            });
            snapshot = pendingSnapshot;
            mappings[normalized.id] = snapshot.id;
        }
        refreshBuilderSnapshotVariables(snapshot, normalized);
        const node = makeBuilderReferenceNode(snapshot, point, normalized.name);
        if (!node) return false;
        historyCapture("apply_preset_reference");
        if (pendingSnapshot) ensureBuilderSnapshotState()[pendingSnapshot.id] = pendingSnapshot;
        ensureBuilderPresetMappingState()[normalized.id] = snapshot.id;
        state.root.children.push(node);
        normalizeNodeTree(state.root);
        scheduleAutoSave();
        renderAll();
        if (typeof setCardSelectionIds === "function") setCardSelectionIds([node.id], { replace: true, focus: true });
        setFocusedNode(node.id, false);
        return { ok: true, insertedIds: [node.id], snapshotId: snapshot.id };
    }

    async function resolvePresetReferenceForDrop(preset) {
        const normalized = normalizePresetList([preset])[0];
        return normalized || null;
    }

    function deepCloneJson(obj) {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch {
            return null;
        }
    }

    function makePresetId() {
        return `preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function normalizePointValue(raw, fallback = { x: 0, y: 0, z: 0 }) {
        const src = raw && typeof raw === "object" ? raw : fallback;
        const x = Number(src.x);
        const y = Number(src.y);
        const z = Number(src.z);
        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0
        };
    }

    function sanitizePresetPathPart(part) {
        const safe = sanitizeFileBase(String(part || "").trim());
        return safe.replace(/^\.+|\.+$/g, "").trim() || "";
    }

    function normalizePresetGroup(raw) {
        const parts = String(raw || "")
            .split(/[\\/]+/)
            .map((it) => sanitizePresetPathPart(it))
            .filter(Boolean);
        return parts.join("/");
    }

    function getPresetGroupLabel(raw) {
        const group = normalizePresetGroup(raw);
        return (!group || group === LEGACY_UNGROUPED_PRESET_GROUP) ? DEFAULT_PRESET_GROUP : group;
    }

    function isDefaultPresetGroup(group) {
        return getPresetGroupLabel(group) === DEFAULT_PRESET_GROUP;
    }

    function normalizePresetScalarVariableValue(value, fallback = 0) {
        if (value && typeof value === "object") return fallback;
        const text = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(value ?? "").trim()));
        if (!text) return fallback;
        const n = Number(text);
        return Number.isFinite(n) && isNumericLiteral(text) ? n : text;
    }

    function normalizePresetVariableValues(raw) {
        const src = raw && typeof raw === "object" ? raw : {};
        const scalar = {};
        const vector = {};
        const scalarSrc = src.scalar && typeof src.scalar === "object" ? src.scalar : {};
        for (const [key, value] of Object.entries(scalarSrc)) {
            const name = normalizeContextIdentifier(key);
            if (!name) continue;
            scalar[name] = normalizePresetScalarVariableValue(value);
        }
        const vectorSrc = src.vector && typeof src.vector === "object" ? src.vector : {};
        for (const [key, value] of Object.entries(vectorSrc)) {
            const name = normalizeContextIdentifier(key);
            if (!name) continue;
            vector[name] = normalizePointValue(value);
        }
        return { scalar, vector };
    }

    function normalizePresetVariableInfoForStorage(raw) {
        if (!raw || typeof raw !== "object") return null;
        const refs = { scalar: new Set(), vector: new Set() };
        const entriesByKey = new Map();
        const addEntry = (type, name, source = "unknown", label = "") => {
            const cleanType = type === "vector" ? "vector" : "scalar";
            const cleanName = normalizeContextIdentifier(name);
            if (!cleanName) return;
            refs[cleanType].add(cleanName);
            const key = `${cleanType}:${cleanName}`;
            if (!entriesByKey.has(key)) {
                entriesByKey.set(key, {
                    type: cleanType,
                    name: cleanName,
                    source: source === "external" || source === "internal" ? source : "unknown",
                    label: String(label || cleanName).trim() || cleanName
                });
            }
        };
        const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
        for (const entry of rawEntries) {
            addEntry(entry?.type, entry?.name, entry?.source, entry?.label);
        }
        const rawRefs = raw.refs && typeof raw.refs === "object" ? raw.refs : {};
        for (const name of Array.isArray(rawRefs.scalar) ? rawRefs.scalar : []) addEntry("scalar", name);
        for (const name of Array.isArray(rawRefs.vector) ? rawRefs.vector : []) addEntry("vector", name);
        const rawInputs = normalizePresetVariableValues(raw.inputs || raw);
        const inferScalarFromInputs = !refs.scalar.size && !rawEntries.length;
        const inferVectorFromInputs = !refs.vector.size && !rawEntries.length;
        for (const name of Object.keys(rawInputs.scalar || {})) {
            if (inferScalarFromInputs) addEntry("scalar", name);
        }
        for (const name of Object.keys(rawInputs.vector || {})) {
            if (inferVectorFromInputs) addEntry("vector", name);
        }
        const scalarRefs = Array.from(refs.scalar).sort((a, b) => a.localeCompare(b));
        const vectorRefs = Array.from(refs.vector).sort((a, b) => a.localeCompare(b));
        if (!scalarRefs.length && !vectorRefs.length) return null;
        const inputs = { scalar: {}, vector: {} };
        for (const name of scalarRefs) {
            inputs.scalar[name] = normalizePresetScalarVariableValue(rawInputs.scalar?.[name]);
        }
        for (const name of vectorRefs) {
            inputs.vector[name] = normalizePointValue(rawInputs.vector?.[name]);
        }
        const entries = Array.from(entriesByKey.values()).sort((a, b) => {
            if (a.type !== b.type) return a.type === "vector" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const name of scalarRefs) {
            if (!entriesByKey.has(`scalar:${name}`)) entries.push({ type: "scalar", name, source: "unknown", label: name });
        }
        for (const name of vectorRefs) {
            if (!entriesByKey.has(`vector:${name}`)) entries.push({ type: "vector", name, source: "unknown", label: name });
        }
        return {
            version: 2,
            refs: { scalar: scalarRefs, vector: vectorRefs },
            inputs,
            entries
        };
    }

    function normalizePresetList(list) {
        const out = [];
        const src = Array.isArray(list) ? list : [];
        const seen = new Set();
        for (const raw of src) {
            if (!raw || typeof raw !== "object") continue;
            const children = Array.isArray(raw.children)
                ? raw.children
                : (raw.root && Array.isArray(raw.root.children) ? raw.root.children : []);
            const clonedChildren = deepCloneJson(children) || [];
            const idBase = String(raw.id || raw.name || makePresetId()).trim() || makePresetId();
            let id = idBase;
            let n = 2;
            while (seen.has(id)) id = `${idBase}_${n++}`;
            seen.add(id);
            const variableInfo = normalizePresetVariableInfoForStorage(raw.variables);
            const preset = {
                id,
                name: String(raw.name || "未命名预设").trim() || "未命名预设",
                instanceMappingId: normalizeBuilderInstanceId(raw.instanceMappingId),
                group: getPresetGroupLabel(raw.group),
                buildInfo: raw.buildInfo && typeof raw.buildInfo === "object" ? Object.assign({}, raw.buildInfo) : {},
                origin: normalizePointValue(raw.origin),
                children: clonedChildren,
                createdAt: Number(raw.createdAt) || Date.now(),
                updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
            };
            if (variableInfo) preset.variables = variableInfo;
            normalizeNodeTree(preset.children);
            out.push(preset);
        }
        return out;
    }

    function dedupePresetList(list) {
        const out = [];
        const seenId = new Set();
        const seenKey = new Set();
        for (const preset of normalizePresetList(list)) {
            const key = `${getPresetGroupLabel(preset.group)}::${preset.name}`;
            if (seenId.has(preset.id) || seenKey.has(key)) continue;
            seenId.add(preset.id);
            seenKey.add(key);
            out.push(preset);
        }
        return out;
    }

    let presetList = [];
    let presetGroups = [];

    function dedupePresetGroups(groups) {
        const out = [];
        const seen = new Set();
        for (const raw of groups || []) {
            const group = getPresetGroupLabel(raw);
            if (!group || seen.has(group)) continue;
            seen.add(group);
            out.push(group);
        }
        return out;
    }

    function persistPresetGroups() {
        presetGroups = dedupePresetGroups(presetGroups);
        savePresetGroups(presetGroups);
        savePresetList(presetList, presetGroups);
        updatePresetGroupList();
        schedulePresetLibraryRender();
    }

    function persistPresetList() {
        presetList = normalizePresetList(presetList);
        presetGroups = dedupePresetGroups(presetGroups.concat(presetList.map((it) => it.group)));
        savePresetGroups(presetGroups);
        savePresetList(presetList, presetGroups);
        schedulePresetLibraryRender();
    }

    const PRESET_VARIABLE_IGNORE_NAMES = new Set([
        "PI", "Math", "NaN", "Infinity", "true", "false", "null", "undefined",
        "Vec3", "RelativeLocation", "Vector3f", "this",
        "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sqrt", "abs",
        "min", "max", "pow", "floor", "ceil", "round", "random", "clamp"
    ]);
    const PRESET_VARIABLE_KNOWN_PARAM_NAMES = new Set([
        "age", "tick", "time", "index", "i", "count", "progress", "angle", "radian", "radius",
        "x", "y", "z", "dx", "dy", "dz", "ox", "oy", "oz", "step", "speed", "scale"
    ]);
    const PRESET_VARIABLE_VECTOR_PARAM_NAMES = new Set([
        "start", "end", "target", "origin", "offset", "point", "center", "from", "to",
        "p1", "p2", "p3", "p4", "startHandle", "endHandle", "handle", "axis"
    ]);
    const PRESET_VARIABLE_VECTOR_COMPONENT_NAMES = new Set(["x", "y", "z", "0", "1", "2"]);

    function getVariableCatalog() {
        const scalar = new Map();
        const vector = new Map();
        const addScalar = (name, source, value, label = "") => {
            const clean = normalizeContextIdentifier(name);
            if (!clean || clean === "PI") return;
            const n = Number(value);
            scalar.set(clean, {
                name: clean,
                type: "scalar",
                source,
                value: Number.isFinite(n) ? n : 0,
                label: String(label || clean).trim() || clean
            });
        };
        const addVector = (name, source, value, label = "") => {
            const clean = normalizeContextIdentifier(name);
            if (!clean) return;
            vector.set(clean, {
                name: clean,
                type: "vector",
                source,
                value: normalizePointValue(value),
                label: String(label || clean).trim() || clean
            });
        };
        if (hasCompositionNumericContext()) {
            for (const [name, value] of Object.entries(compositionNumericContext.map || {})) {
                if (name === "PI") continue;
                if (isFiniteVectorLike(value)) addVector(name, "external", value, `${name}（外部 Vec3）`);
                else if (Number.isFinite(Number(value))) addScalar(name, "external", value, `${name}（外部 数值）`);
            }
            for (const option of compositionNumericContext.vectorOptions || []) {
                const ref = String(option?.ref || option?.name || "").trim();
                const name = String(option?.name || ref).trim();
                const value = compositionNumericContext.map?.[name] || compositionNumericContext.map?.[ref] || { x: 0, y: 0, z: 0 };
                const label = String(option?.label || `${ref || name}（外部 Vec3）`).trim();
                if (ref) addVector(ref, "external", value, label);
                if (name && name !== ref) addVector(name, "external", value, label);
            }
        }
        const local = getLocalVariableState();
        for (const [name, value] of Object.entries(local.scalar || {})) {
            addScalar(name, "internal", value, `${name}（内部 数值）`);
        }
        for (const [name, value] of Object.entries(local.vector || {})) {
            addVector(name, "internal", value, `${name}（内部 Vec3）`);
        }
        return { scalar, vector };
    }

    function ensureBuilderReferenceOverrides(node, snapshot) {
        if (!node.params || typeof node.params !== "object") node.params = {};
        const defaults = getPresetVariableDefaultValues(snapshot?.variables);
        const raw = node.params.overrides && typeof node.params.overrides === "object"
            ? node.params.overrides
            : {};
        raw.scalar = Object.assign({}, defaults.scalar || {}, raw.scalar || {});
        raw.vector = Object.assign({}, defaults.vector || {}, raw.vector || {});
        raw.modes = Object.assign({ scalar: {}, vector: {} }, raw.modes || {});
        raw.modes.scalar = Object.assign({}, raw.modes.scalar || {});
        raw.modes.vector = Object.assign({}, raw.modes.vector || {});
        raw.refs = Object.assign({ scalar: {}, vector: {} }, raw.refs || {});
        raw.refs.scalar = Object.assign({}, raw.refs.scalar || {});
        raw.refs.vector = Object.assign({}, raw.refs.vector || {});
        node.params.overrides = raw;
        return raw;
    }

    function refreshBuilderSnapshotVariables(snapshot, preset = null) {
        if (!snapshot) return false;
        const sourcePreset = preset || presetList.find((item) => (
            String(item?.id || "") === String(snapshot.sourcePresetId || "")
        ));
        const freshInfo = getPresetEffectiveVariableInfo(sourcePreset);
        if (!freshInfo) return false;
        const mergedInfo = mergePresetVariableInfo(snapshot.variables, freshInfo);
        if (!mergedInfo) return false;
        const defaults = getPresetVariableDefaultValues(mergedInfo);
        const current = snapshot.staticOverrides && typeof snapshot.staticOverrides === "object"
            ? snapshot.staticOverrides
            : {};
        const nextOverrides = Object.assign({}, current, {
            scalar: Object.assign({}, defaults.scalar || {}, current.scalar || {}),
            vector: Object.assign({}, defaults.vector || {}, current.vector || {}),
            modes: Object.assign({ scalar: {}, vector: {} }, current.modes || {}),
            refs: Object.assign({ scalar: {}, vector: {} }, current.refs || {})
        });
        const previous = JSON.stringify({ variables: snapshot.variables || null, staticOverrides: snapshot.staticOverrides || null });
        const next = JSON.stringify({ variables: mergedInfo, staticOverrides: nextOverrides });
        if (previous === next) return false;
        snapshot.variables = deepCloneJson(mergedInfo);
        snapshot.staticOverrides = deepCloneJson(nextOverrides);
        snapshot.revision = Math.max(1, Math.trunc(Number(snapshot.revision) || 1)) + 1;
        snapshot.updatedAt = Date.now();
        return true;
    }

    function getBuilderReferenceOverrideValues(snapshot, node) {
        const values = getPresetVariableDefaultValues(snapshot?.variables);
        const overrides = ensureBuilderReferenceOverrides(node, snapshot);
        const catalog = getVariableCatalog();
        for (const [name, value] of Object.entries(overrides.scalar || {})) {
            values.scalar[name] = normalizePresetScalarVariableValue(value);
        }
        for (const [name, value] of Object.entries(overrides.vector || {})) {
            values.vector[name] = normalizePointValue(value);
        }
        for (const type of ["scalar", "vector"]) {
            for (const [name, mode] of Object.entries(overrides.modes?.[type] || {})) {
                if (mode !== "reference") continue;
                const ref = normalizeContextIdentifier(overrides.refs?.[type]?.[name]);
                const entry = ref ? getVariableEntryFromCatalog(type, ref, catalog) : null;
                if (!entry) continue;
                if (type === "vector") values.vector[name] = normalizePointValue(entry.value);
                else values.scalar[name] = normalizePresetScalarVariableValue(entry.value);
            }
        }
        return values;
    }

    function materializeBuilderReferenceChildren(snapshot, node) {
        const children = deepCloneJson(snapshot?.children || []) || [];
        if (!snapshot?.variables) return children;
        return applyPresetVariableValuesToChildren(children, getBuilderReferenceOverrideValues(snapshot, node));
    }

    function renderBuilderReferenceVariables(body, node) {
        const snapshot = ensureBuilderSnapshotState()[String(node?.params?.snapshotId || "")];
        if (refreshBuilderSnapshotVariables(snapshot)) scheduleAutoSave();
        const variableInfo = normalizePresetVariableInfoForStorage(snapshot?.variables);
        if (!getPresetVariableEntries(variableInfo).length) return false;
        const staticMode = node?.params?.instanceMode !== "construct";
        if (staticMode && snapshot?.staticOverrides && typeof snapshot.staticOverrides === "object") {
            node.params.overrides = deepCloneJson(snapshot.staticOverrides) || {};
        }
        const overrides = ensureBuilderReferenceOverrides(node, snapshot);
        const variableCatalog = getVariableCatalog();
        for (const type of ["scalar", "vector"]) {
            const catalog = type === "vector" ? variableCatalog.vector : variableCatalog.scalar;
            for (const [name, mode] of Object.entries(overrides.modes[type] || {})) {
                if (mode !== "reference") continue;
                const ref = normalizeContextIdentifier(overrides.refs[type]?.[name]);
                if (ref && catalog.has(ref)) continue;
                overrides.modes[type][name] = "manual";
                delete overrides.refs[type][name];
            }
        }
        const host = document.createElement("div");
        host.className = "preset-variable-panel builder-reference-variable-panel";
        renderPresetVariableRows(host, variableInfo, overrides, {
            title: "预设参数",
            allowVariableRefs: true,
            variableCatalog,
            applyState: overrides,
            commitOnChange: true,
            onChange: () => {
                if (staticMode) syncStaticBuilderReferenceOverrides(snapshot, node);
                scheduleAutoSave();
                rebuildPreviewAndKotlin();
            },
            onPickVector: (entry, setValue) => {
                startPointPick({
                    label: `拾取实例变量 ${entry.name}`,
                    onPick: (point) => {
                        setValue(point);
                        scheduleAutoSave();
                        rebuildPreviewAndKotlin();
                        scheduleParamEditorRender();
                    }
                });
            }
        });
        body.appendChild(host);
        return true;
    }

    function visitAllBuilderReferences(visitor) {
        const visit = (nodes) => {
            for (const item of Array.isArray(nodes) ? nodes : []) {
                if (!item || typeof item !== "object") continue;
                if (item.kind === BUILDER_REFERENCE_KIND) visitor(item);
                visit(item.children);
            }
        };
        visit(state.root?.children);
        for (const snapshot of Object.values(ensureBuilderSnapshotState())) visit(snapshot?.children);
    }

    function collectBuilderSnapshotReferenceCounts() {
        const snapshots = ensureBuilderSnapshotState();
        const counts = new Map();
        const queued = new Set();
        const pending = [];
        const add = (id) => {
            const key = String(id || "").trim();
            if (!key) return;
            counts.set(key, (counts.get(key) || 0) + 1);
            if (!queued.has(key)) {
                queued.add(key);
                pending.push(key);
            }
        };
        const visit = (nodes) => {
            for (const item of Array.isArray(nodes) ? nodes : []) {
                if (!item || typeof item !== "object") continue;
                if (item.kind === BUILDER_REFERENCE_KIND) add(item.params?.snapshotId);
                if (item.kind === EFFECT_RING_KIND) {
                    for (const id of Array.isArray(item.params?.snapshotIds) ? item.params.snapshotIds : []) add(id);
                }
                if (isBuilderSnapshotEditNode(item)) add(item.instanceEdit?.snapshotId);
                visit(item.children);
            }
        };
        visit(state.root?.children);
        while (pending.length) {
            const snapshot = snapshots[pending.shift()];
            if (snapshot) visit(snapshot.children);
        }
        return counts;
    }

    function cleanupUnreferencedBuilderSnapshots() {
        const snapshots = ensureBuilderSnapshotState();
        const mappings = ensureBuilderPresetMappingState();
        const counts = collectBuilderSnapshotReferenceCounts();
        const projectReferenceCounts = isCompositionPointsBuilder
            ? new Map(getBuilderInstanceRegistryEntries().map((entry) => [entry.id, entry.referenceCount]))
            : new Map();
        let removed = 0;
        for (const id of Object.keys(snapshots)) {
            if (counts.has(id) || (projectReferenceCounts.get(id) || 0) > 0) continue;
            delete snapshots[id];
            removed += 1;
        }
        for (const presetId of Object.keys(mappings)) {
            if (!snapshots[mappings[presetId]]) delete mappings[presetId];
        }
        return removed;
    }

    function rewriteBuilderSnapshotReferences(fromId, toId) {
        const from = String(fromId || "").trim();
        const to = String(toId || "").trim();
        if (!from || !to || from === to) return;
        const visit = (nodes) => {
            for (const item of Array.isArray(nodes) ? nodes : []) {
                if (!item || typeof item !== "object") continue;
                if (item.kind === BUILDER_REFERENCE_KIND && String(item.params?.snapshotId || "") === from) {
                    item.params.snapshotId = to;
                }
                if (item.kind === EFFECT_RING_KIND && Array.isArray(item.params?.snapshotIds)) {
                    item.params.snapshotIds = item.params.snapshotIds.map((id) => String(id || "") === from ? to : id);
                }
                visit(item.children);
            }
        };
        visit(state.root?.children);
        for (const snapshot of Object.values(ensureBuilderSnapshotState())) {
            visit(snapshot?.children);
        }
    }

    function syncStaticBuilderReferenceOverrides(snapshot, sourceNode) {
        if (!snapshot || !sourceNode) return;
        const shared = deepCloneJson(sourceNode.params?.overrides || {}) || {};
        snapshot.staticOverrides = shared;
        snapshot.revision = Math.max(1, Math.trunc(Number(snapshot.revision) || 1)) + 1;
        snapshot.updatedAt = Date.now();
        visitAllBuilderReferences((node) => {
            if (String(node.params?.snapshotId || "") !== String(snapshot.id || "")) return;
            if (node.params?.instanceMode === "construct") return;
            node.params.overrides = deepCloneJson(shared) || {};
        });
    }

    function setBuilderReferenceInstanceMode(node, mode) {
        if (!node || node.kind !== BUILDER_REFERENCE_KIND) return;
        const nextMode = mode === "construct" ? "construct" : "static";
        if (node.params?.instanceMode === nextMode) return;
        historyCapture("change_builder_reference_mode");
        node.params.instanceMode = nextMode;
        if (nextMode === "static") {
            const snapshot = ensureBuilderSnapshotState()[String(node.params?.snapshotId || "")];
            if (snapshot?.staticOverrides) node.params.overrides = deepCloneJson(snapshot.staticOverrides) || {};
            else if (snapshot) syncStaticBuilderReferenceOverrides(snapshot, node);
        }
        scheduleAutoSave();
        renderAll();
        rebuildPreviewAndKotlin();
    }

    function changeBuilderReferenceId(node, rawId) {
        if (!node || node.kind !== BUILDER_REFERENCE_KIND) return false;
        const nextId = normalizeBuilderInstanceId(rawId);
        if (!nextId) {
            showToast("实例 ID 格式无效", "error");
            return false;
        }
        const previousId = String(node.params?.snapshotId || "").trim();
        if (nextId === previousId) return true;
        const snapshots = ensureBuilderSnapshotState();
        const source = snapshots[previousId];
        if (!source) {
            showToast("当前实例原型不存在", "error");
            return false;
        }
        const bindingMode = ["registered", "indexed", "linked"].includes(node.params?.instanceBindingMode)
            ? node.params.instanceBindingMode
            : "registered";
        if (bindingMode === "linked" && snapshots[nextId] && nextId !== previousId) {
            showToast(`实例 ID“${nextId}”已存在，联动式不能覆盖已有原型。`, "error");
            return false;
        }
        historyCapture("change_builder_reference_id");
        let target = null;
        if (bindingMode === "linked") {
            target = deepCloneJson(source) || {};
            delete snapshots[previousId];
            target.id = nextId;
            target.updatedAt = Date.now();
            snapshots[nextId] = target;
            rewriteBuilderSnapshotReferences(previousId, nextId);
            const mappings = ensureBuilderPresetMappingState();
            Object.keys(mappings).forEach((presetId) => {
                if (String(mappings[presetId] || "") === previousId) mappings[presetId] = nextId;
            });
        } else if (bindingMode === "indexed") {
            let indexedId = nextId;
            const suffix = formatBuilderInstanceId(node.id || "card", { upperFirst: true, fallback: "Card" });
            if (snapshots[indexedId] && indexedId !== previousId) indexedId = `${indexedId}${suffix}`;
            let index = 2;
            while (snapshots[indexedId] && indexedId !== previousId) indexedId = `${nextId}${suffix}${index++}`;
            target = deepCloneJson(source) || {};
            target.id = indexedId;
            target.sourcePresetId = "";
            target.sourcePresetRevision = "";
            target.revision = 1;
            target.createdAt = Date.now();
            target.updatedAt = Date.now();
            snapshots[indexedId] = target;
            node.params.snapshotId = indexedId;
        } else {
            target = importRegisteredBuilderSnapshot(nextId);
            if (!target) {
                target = deepCloneJson(source) || {};
                target.id = nextId;
                target.sourcePresetId = "";
                target.sourcePresetRevision = "";
                target.revision = 1;
                target.createdAt = Date.now();
                target.updatedAt = Date.now();
                snapshots[nextId] = target;
            }
            node.params.snapshotId = target.id;
        }
        if (node.params.instanceMode === "construct") {
            ensureBuilderReferenceOverrides(node, target);
        } else {
            node.params.overrides = target.staticOverrides
                ? deepCloneJson(target.staticOverrides) || {}
                : deepCloneJson(getPresetVariableDefaultValues(target.variables)) || {};
            if (!target.staticOverrides) target.staticOverrides = deepCloneJson(node.params.overrides) || {};
        }
        cleanupUnreferencedBuilderSnapshots();
        scheduleAutoSave();
        renderAll();
        showToast(`已切换到实例：${nextId}`, "success");
        return true;
    }

    async function reconstructBuilderReference(node, options = {}) {
        if (!node || node.kind !== BUILDER_REFERENCE_KIND) return false;
        const sourceId = String(node.params?.snapshotId || "").trim();
        const source = ensureBuilderSnapshotState()[sourceId];
        if (!source) {
            showToast("当前实例原型不存在", "error");
            return false;
        }
        const result = await openBuilderReferenceDialog({
            message: "输入新的实例 ID，并选择重构方式。",
            initialValue: sourceId,
            mode: node.params?.instanceBindingMode || "registered"
        });
        if (!result?.id) return false;
        const nextId = result.id;
        const mode = result.mode || "registered";
        const snapshots = ensureBuilderSnapshotState();
        const mappings = ensureBuilderPresetMappingState();
        historyCapture("reconstruct_builder_reference");
        if (mode === "linked") {
            if (snapshots[nextId] && nextId !== sourceId) {
                showToast(`实例 ID“${nextId}”已存在，联动式不能覆盖已有原型。`, "error");
                return false;
            }
            const renamed = deepCloneJson(source) || {};
            delete snapshots[sourceId];
            renamed.id = nextId;
            renamed.updatedAt = Date.now();
            snapshots[nextId] = renamed;
            rewriteBuilderSnapshotReferences(sourceId, nextId);
            Object.keys(mappings).forEach((presetId) => {
                if (String(mappings[presetId] || "") === sourceId) mappings[presetId] = nextId;
            });
        } else if (mode === "indexed") {
            const suffix = formatBuilderInstanceId(node.id || "card", { upperFirst: true, fallback: "Card" });
            let id = snapshots[nextId] ? `${nextId}${suffix}` : nextId;
            let index = 2;
            while (snapshots[id]) id = `${nextId}${suffix}${index++}`;
            const copied = deepCloneJson(source) || {};
            copied.id = id;
            copied.sourcePresetId = "";
            copied.sourcePresetRevision = "";
            copied.revision = 1;
            copied.createdAt = Date.now();
            copied.updatedAt = Date.now();
            snapshots[id] = copied;
            node.params.snapshotId = id;
        } else {
            let target = importRegisteredBuilderSnapshot(nextId);
            if (!target) {
                target = deepCloneJson(source) || {};
                target.id = nextId;
                target.sourcePresetId = "";
                target.sourcePresetRevision = "";
                target.revision = 1;
                target.createdAt = Date.now();
                target.updatedAt = Date.now();
                snapshots[nextId] = target;
            }
            node.params.snapshotId = nextId;
        }
        node.params.instanceBindingMode = mode;
        const target = snapshots[String(node.params.snapshotId || "")];
        if (target) {
            if (node.params.instanceMode === "construct") {
                ensureBuilderReferenceOverrides(node, target);
            } else {
                node.params.overrides = target.staticOverrides
                    ? deepCloneJson(target.staticOverrides) || {}
                    : deepCloneJson(getPresetVariableDefaultValues(target.variables)) || {};
                if (!target.staticOverrides) target.staticOverrides = deepCloneJson(node.params.overrides) || {};
            }
        }
        cleanupUnreferencedBuilderSnapshots();
        scheduleAutoSave();
        renderAll();
        showToast(`实例已重构为${mode === "indexed" ? "索引式" : mode === "linked" ? "联动式" : "注册式"}`, "success");
        return true;
    }

    function isBuilderSnapshotEditNode(node) {
        return !!(node && isBuilderContainerKind(node.kind) && node.instanceEdit
            && normalizeBuilderInstanceId(node.instanceEdit.snapshotId));
    }

    function syncBuilderSnapshotEditNode(node) {
        if (!isBuilderSnapshotEditNode(node)) return false;
        const snapshot = ensureBuilderSnapshotState()[node.instanceEdit.snapshotId];
        if (!snapshot) return false;
        const children = deepCloneJson(node.children || []) || [];
        const previous = JSON.stringify(snapshot.children || []);
        const next = JSON.stringify(children);
        if (previous === next) return false;
        snapshot.children = children;
        snapshot.revision = Math.max(1, Math.trunc(Number(snapshot.revision) || 1)) + 1;
        snapshot.updatedAt = Date.now();
        return true;
    }

    function syncAllBuilderSnapshotEdits() {
        const visit = (nodes) => {
            for (const node of Array.isArray(nodes) ? nodes : []) {
                if (!node || typeof node !== "object") continue;
                syncBuilderSnapshotEditNode(node);
                visit(node.children);
            }
        };
        visit(state.root?.children);
    }

    function beginBuilderSnapshotEdit(referenceNode) {
        if (!referenceNode || referenceNode.kind !== BUILDER_REFERENCE_KIND) return false;
        const ctx = findNodeContextById(referenceNode.id);
        const snapshot = ensureBuilderSnapshotState()[String(referenceNode.params?.snapshotId || "")];
        if (!ctx || !Array.isArray(ctx.parentList) || !snapshot) return false;
        const replacement = makeNode("add_builder", {
            id: referenceNode.id,
            label: `${referenceNode.label || snapshot.name || snapshot.id}（实例原型）`,
            params: {
                ox: Number(referenceNode.params?.ox) || 0,
                oy: Number(referenceNode.params?.oy) || 0,
                oz: Number(referenceNode.params?.oz) || 0
            },
            children: deepCloneJson(snapshot.children || []) || [],
            instanceEdit: {
                snapshotId: snapshot.id,
                referenceLabel: referenceNode.label || snapshot.name || "实例",
                referenceParams: deepCloneJson(referenceNode.params || {}) || {}
            }
        });
        historyCapture("begin_builder_snapshot_edit");
        ctx.parentList.splice(ctx.index, 1, replacement);
        normalizeNodeTree(state.root);
        scheduleAutoSave();
        renderAll();
        setFocusedNode(replacement.id, false);
        requestAnimationFrame(() => navigateCardScope?.(replacement.id));
        showToast(`正在编辑实例原型：${snapshot.id}`, "info");
        return true;
    }

    function completeBuilderSnapshotEdit(editNode) {
        if (!isBuilderSnapshotEditNode(editNode)) return false;
        const ctx = findNodeContextById(editNode.id);
        const snapshot = ensureBuilderSnapshotState()[editNode.instanceEdit.snapshotId];
        if (!ctx || !Array.isArray(ctx.parentList) || !snapshot) return false;
        syncBuilderSnapshotEditNode(editNode);
        const replacement = makeNode(BUILDER_REFERENCE_KIND, {
            id: editNode.id,
            label: editNode.instanceEdit.referenceLabel || snapshot.name,
            params: deepCloneJson(editNode.instanceEdit.referenceParams || {}) || {}
        });
        replacement.params.snapshotId = snapshot.id;
        replacement.children = [];
        historyCapture("complete_builder_snapshot_edit");
        ctx.parentList.splice(ctx.index, 1, replacement);
        revealCardScopeById?.(replacement.id);
        normalizeNodeTree(state.root);
        scheduleAutoSave();
        renderAll();
        setFocusedNode(replacement.id, false);
        showToast(`已更新实例原型：${snapshot.id}`, "success");
        return true;
    }

    function getVariableEntryFromCatalog(type, name, catalog) {
        const clean = normalizeContextIdentifier(name);
        if (!clean) return null;
        const map = type === "vector" ? catalog.vector : catalog.scalar;
        const found = map.get(clean);
        if (found) return Object.assign({}, found);
        return {
            name: clean,
            type: type === "vector" ? "vector" : "scalar",
            source: "unknown",
            value: type === "vector" ? { x: 0, y: 0, z: 0 } : 0,
            label: clean
        };
    }

    function collectVariableRefsFromExpression(value, scalarRefs, vectorRefs) {
        const expr = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(value ?? "").trim()));
        if (!expr || isNumericLiteral(expr)) return;
        const tokenRe = /[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)?/g;
        let match;
        let plainCount = 0;
        const plainTokens = new Set();
        while ((match = tokenRe.exec(expr))) {
            const token = String(match[0] || "").replace(/\s+/g, "");
            if (!token) continue;
            const parts = token.split(".");
            const base = normalizeContextIdentifier(parts[0]);
            const prop = parts[1] || "";
            if (!base || PRESET_VARIABLE_IGNORE_NAMES.has(base)) continue;
            if (prop) {
                if (prop === "x" || prop === "y" || prop === "z") vectorRefs.add(base);
                continue;
            }
            plainCount += 1;
            plainTokens.add(base);
        }
        for (const base of plainTokens) {
            if (plainCount > 1 && PRESET_VARIABLE_KNOWN_PARAM_NAMES.has(base)) continue;
            scalarRefs.add(base);
        }
    }

    function collectKnownVariableRefsFromValue(value, catalog, scalarRefs, vectorRefs) {
        const expr = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(value ?? "").trim()));
        if (!expr || isNumericLiteral(expr)) return false;
        const tokenRe = /[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)?/g;
        let matched = false;
        let match;
        while ((match = tokenRe.exec(expr))) {
            const token = String(match[0] || "").replace(/\s+/g, "");
            if (!token) continue;
            const parts = token.split(".");
            const base = normalizeContextIdentifier(parts[0]);
            const prop = parts[1] || "";
            if (!base || PRESET_VARIABLE_IGNORE_NAMES.has(base)) continue;
            if (prop) {
                if ((prop === "x" || prop === "y" || prop === "z") && catalog?.vector?.has(base)) {
                    vectorRefs.add(base);
                    matched = true;
                }
                continue;
            }
            if (catalog?.vector?.has(base)) {
                vectorRefs.add(base);
                matched = true;
                continue;
            }
            if (catalog?.scalar?.has(base)) {
                scalarRefs.add(base);
                matched = true;
            }
        }
        return matched;
    }

    function collectPresetVariableRefsFromValue(node, key, value, catalog, scalarRefs, vectorRefs) {
        if (typeof value === "string") {
            if (isPresetVariableParamCandidate(node, key, value, catalog)) {
                collectVariableRefsFromExpression(value, scalarRefs, vectorRefs);
                return;
            }
            collectKnownVariableRefsFromValue(value, catalog, scalarRefs, vectorRefs);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item, index) => collectPresetVariableRefsFromValue(node, `${key}.${index}`, item, catalog, scalarRefs, vectorRefs));
            return;
        }
        if (value && typeof value === "object") {
            for (const [childKey, childValue] of Object.entries(value)) {
                collectPresetVariableRefsFromValue(node, key ? `${key}.${childKey}` : childKey, childValue, catalog, scalarRefs, vectorRefs);
            }
        }
    }

    function isPresetVariableNumericParamKey(node, key) {
        const keyText = String(key || "");
        if (!keyText || keyText.startsWith("__pb_")) return false;
        const defParams = KIND?.[node?.kind]?.defaultParams || {};
        if (Object.prototype.hasOwnProperty.call(defParams, keyText) && typeof defParams[keyText] === "number") return true;
        const parts = keyText.split(".").map((it) => String(it || "").trim()).filter(Boolean);
        const leaf = parts[parts.length - 1] || "";
        if (!leaf) return false;
        if (parts.length === 1) {
            if (Object.prototype.hasOwnProperty.call(defParams, leaf) && typeof defParams[leaf] === "number") return true;
            return PRESET_VARIABLE_KNOWN_PARAM_NAMES.has(leaf);
        }
        const parent = parts[parts.length - 2] || "";
        return PRESET_VARIABLE_VECTOR_PARAM_NAMES.has(parent)
            && PRESET_VARIABLE_VECTOR_COMPONENT_NAMES.has(leaf);
    }

    function isPresetVariableParamCandidate(node, key, value, catalog = null) {
        const keyText = String(key || "");
        if (keyText.startsWith("__pb_")) return false;
        if (typeof value !== "string") return false;
        const expr = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(value || "").trim()));
        if (!expr || isNumericLiteral(expr)) return false;
        if (isPresetVariableNumericParamKey(node, keyText)) return true;
        if (/[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*[xyz]\b/.test(expr)) return true;
        if (isIdentifier(expr) && catalog?.scalar?.has(normalizeContextIdentifier(expr))) return true;
        return /[+\-*/()%]/.test(expr);
    }

    function collectPresetVariableInfo(children) {
        const scalarRefs = new Set();
        const vectorRefs = new Set();
        const catalog = getVariableCatalog();
        const walk = (node) => {
            if (!node || typeof node !== "object") return;
            const p = node.params || {};
            for (const [key, value] of Object.entries(p)) {
                const keyText = String(key || "");
                if (keyText.startsWith("__pb_vec_var_")) {
                    const ref = normalizeContextIdentifier(value);
                    if (ref) vectorRefs.add(ref);
                    continue;
                }
                collectPresetVariableRefsFromValue(node, keyText, value, catalog, scalarRefs, vectorRefs);
            }
            if (Array.isArray(node.children)) node.children.forEach(walk);
        };
        (Array.isArray(children) ? children : []).forEach(walk);
        for (const name of Array.from(scalarRefs)) {
            if (vectorRefs.has(name)) scalarRefs.delete(name);
        }
        if (!scalarRefs.size && !vectorRefs.size) return null;
        const entries = [];
        const inputs = { scalar: {}, vector: {} };
        const scalar = Array.from(scalarRefs).sort((a, b) => a.localeCompare(b));
        const vector = Array.from(vectorRefs).sort((a, b) => a.localeCompare(b));
        for (const name of vector) {
            const entry = getVariableEntryFromCatalog("vector", name, catalog);
            entries.push(entry);
            inputs.vector[name] = normalizePointValue(entry.value);
        }
        for (const name of scalar) {
            const entry = getVariableEntryFromCatalog("scalar", name, catalog);
            entries.push(entry);
            const n = Number(entry.value);
            inputs.scalar[name] = Number.isFinite(n) ? n : 0;
        }
        return normalizePresetVariableInfoForStorage({
            refs: { scalar, vector },
            inputs,
            entries
        });
    }

    function getPresetOriginFallback() {
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const n of state.root.children || []) {
            const c = n && n.id ? getNodeSegmentCenter(n.id) : null;
            if (!c) continue;
            sx += c.x;
            sy += c.y;
            sz += c.z;
            count += 1;
        }
        if (!count) return { x: 0, y: 0, z: 0 };
        return { x: sx / count, y: sy / count, z: sz / count };
    }

    function preparePresetChildrenForStorage(children) {
        const cloned = deepCloneJson(children || []) || [];
        const snapshots = ensureBuilderSnapshotState();
        const materialize = (node) => {
            if (!node || typeof node !== "object") return null;
            if (node.kind === BUILDER_REFERENCE_KIND) {
                const snapshot = snapshots[String(node.params?.snapshotId || "")];
                if (!snapshot) return null;
                const wrapper = makeNode("add_builder", {
                    params: {
                        ox: Number(node.params?.ox) || 0,
                        oy: Number(node.params?.oy) || 0,
                        oz: Number(node.params?.oz) || 0
                    },
                    label: node.label || snapshot.name
                });
                wrapper.children = materializeBuilderReferenceChildren(snapshot, node).map(materialize).filter(Boolean);
                return wrapper;
            }
            if (node.kind === EFFECT_RING_KIND) {
                const p = node.params || {};
                const ids = Array.isArray(p.snapshotIds) ? p.snapshotIds : [];
                const group = makeNode("add_builder", { label: node.label || "环形放置" });
                const count = Math.max(1, Math.trunc(Number(p.count) || 12));
                const radius = Number(p.radius) || 3;
                const start = (Number(p.startDeg) || 0) * Math.PI / 180;
                ids.forEach((id, index) => {
                    const snapshot = snapshots[String(id || "")];
                    if (!snapshot) return;
                    const slot = makeNode("add_builder", {
                        label: snapshot.name,
                        params: {
                            ox: (Number(p.originX) || 0) + Math.cos(start + Math.PI * 2 * index / count) * radius + (Number(p.offsetX) || 0),
                            oy: (Number(p.originY) || 0) + (Number(p.offsetY) || 0),
                            oz: (Number(p.originZ) || 0) + Math.sin(start + Math.PI * 2 * index / count) * radius + (Number(p.offsetZ) || 0)
                        }
                    });
                    slot.children = (deepCloneJson(snapshot.children || []) || []).map(materialize).filter(Boolean);
                    group.children.push(slot);
                });
                return group;
            }
            const next = deepCloneJson(node);
            if (Array.isArray(next.children)) next.children = next.children.map(materialize).filter(Boolean);
            return next;
        };
        const preparedSource = cloned.map(materialize).filter(Boolean);
        normalizeNodeTree(preparedSource);
        if (preparedSource.length === 1 && preparedSource[0] && isBuilderContainerKind(preparedSource[0].kind)) {
            return preparedSource;
        }
        const wrapper = makeNode("add_builder", { params: { ox: 0, oy: 0, oz: 0 } });
        wrapper.children = preparedSource;
        return [wrapper];
    }

    function preparePresetChildrenForInsertion(children) {
        const prepared = preparePresetChildrenForStorage(children);
        const usedIds = collectNodeIds(state.root);
        reassignNodeIdsDeep(prepared, usedIds);
        return prepared;
    }

    function labelInsertedPresetContainers(children, presetName) {
        const label = String(presetName || "").trim();
        if (!label) return;
        const list = Array.isArray(children) ? children : [];
        for (const node of list) {
            if (!node || !isBuilderContainerKind(node.kind)) continue;
            if (!String(node.label || "").trim()) node.label = label;
        }
    }

    function collectPresetSourceChildrenFromIds(ids) {
        const idSet = new Set(normalizeActionTargetIds(ids));
        if (!idSet.size) return null;
        const out = [];
        const walk = (list) => {
            for (const node of list || []) {
                if (!node) continue;
                if (idSet.has(node.id)) {
                    const cloned = deepCloneJson(node);
                    if (cloned) out.push(cloned);
                    continue;
                }
                if (isBuilderContainerKind(node.kind) && Array.isArray(node.children)) {
                    walk(node.children);
                }
            }
        };
        walk(state.root.children || []);
        return out.length ? out : null;
    }

    function setPresetSaveSourceFromIds(ids) {
        const children = collectPresetSourceChildrenFromIds(ids);
        presetSaveSourceChildren = children || null;
        presetSaveSourceLabel = children ? `${children.length} 张选中卡片` : "全部卡片";
    }

    function getCurrentPresetSourceOptions() {
        const selected = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const ids = selected && typeof selected[Symbol.iterator] === "function"
            ? Array.from(selected).map((id) => String(id || "").trim()).filter(Boolean)
            : [];
        return ids.length ? { sourceIds: ids } : {};
    }

    function makePresetFromCurrentProject(options = {}) {
        const sourceChildren = Array.isArray(options.children) ? options.children : (state.root.children || []);
        const children = preparePresetChildrenForStorage(sourceChildren);
        const variableInfo = options.variables !== undefined
            ? normalizePresetVariableInfoForStorage(options.variables)
            : collectPresetVariableInfo(sourceChildren);
        const now = Date.now();
        const preset = {
            id: options.id || makePresetId(),
            name: String(options.name || projectName || "未命名预设").trim() || "未命名预设",
            group: getPresetGroupLabel(options.group),
            buildInfo: {
                projectName: projectName || "",
                kotlinEndMode,
                createdBy: "pointsbuilder",
                version: 1
            },
            origin: normalizePointValue(options.origin || getPresetOriginFallback()),
            children,
            createdAt: now,
            updatedAt: now
        };
        if (variableInfo) preset.variables = variableInfo;
        return preset;
    }

    function upsertPreset(preset, overwriteId = "") {
        const normalized = normalizePresetList([preset])[0];
        if (!normalized) return null;
        const id = overwriteId || normalized.id;
        const idx = presetList.findIndex((it) => (
            it.id === id ||
            (it.name === normalized.name && getPresetGroupLabel(it.group) === getPresetGroupLabel(normalized.group))
        ));
        if (idx >= 0) {
            normalized.id = presetList[idx].id;
            normalized.createdAt = presetList[idx].createdAt || normalized.createdAt;
            normalized.updatedAt = Date.now();
            presetList.splice(idx, 1, normalized);
        } else {
            presetList.push(normalized);
        }
        persistPresetList();
        return normalized;
    }

    function getPresetList() {
        return normalizePresetList(presetList);
    }

    function saveCurrentAsPreset(options = {}) {
        const preset = makePresetFromCurrentProject(options);
        return upsertPreset(preset, options.overwriteId || "");
    }

    function editLocalVariables(input) {
        const next = normalizeVariableState(
            typeof input === "string" ? JSON.parse(String(input || "{}")) : input
        );
        historyCapture("edit_variables");
        state.variables = next;
        compositionNumericContext.cache.clear();
        scheduleAutoSave();
        renderAll();
        return true;
    }

    function getLocalVariablesText() {
        return JSON.stringify(getLocalVariableState(), null, 2);
    }

    function importPresetPayload(payload, options = {}) {
        const src = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload?.presets) ? payload.presets : [payload]);
        const normalized = normalizePresetList(src);
        if (!normalized.length) return 0;
        for (const preset of normalized) {
            if (options.overwrite) upsertPreset(preset, preset.id);
            else {
                preset.id = makePresetId();
                let baseName = String(preset.name || "未命名预设").trim() || "未命名预设";
                let name = baseName;
                let n = 2;
                while (presetList.some((it) => (
                    it.name === name && getPresetGroupLabel(it.group) === getPresetGroupLabel(preset.group)
                ))) name = `${baseName} ${n++}`;
                preset.name = name;
                upsertPreset(preset, "");
            }
        }
        return normalized.length;
    }

    function applyPresetAtPoint(preset, point, options = {}) {
        const variablesResolved = !!preset?.__pbVariablesResolved;
        const normalized = normalizePresetList([preset])[0];
        if (!normalized || !normalized.children.length || !point) return false;
        const variableInfo = variablesResolved ? null : getPresetEffectiveVariableInfo(normalized);
        const defaultValues = getPresetVariableDefaultValues(variableInfo);
        const sourceChildren = variableInfo
            ? applyPresetVariableValuesToChildren(deepCloneJson(normalized.children || []) || [], defaultValues)
            : normalized.children;
        const nextChildren = preparePresetChildrenForInsertion(sourceChildren);
        normalizeNodeTree(nextChildren);
        labelInsertedPresetContainers(nextChildren, normalized.name);
        const anchor = normalizePointValue(point);
        const origin = normalizePointValue(normalized.origin);
        const delta = {
            x: anchor.x - origin.x,
            y: anchor.y - origin.y,
            z: anchor.z - origin.z
        };
        historyCapture("apply_preset");
        const oldList = state.root.children;
        state.root.children = oldList.concat(nextChildren);
        normalizeNodeTree(state.root);
        ensureAxisEverywhere();
        const insertedIds = nextChildren.map((it) => it && it.id).filter(Boolean);
        for (const id of insertedIds) applyOffsetToTargetId(id, delta);
        resetCollapseScopes();
        collapseAllNodes(state.root.children);
        renderAll();
        if (options && options.startRotate && insertedIds.length && typeof addRotateForTargetIds === "function") {
            requestAnimationFrame(() => addRotateForTargetIds(insertedIds));
        }
        return { ok: true, insertedIds };
    }

    function numFromInput(el, fallback = 0) {
        const n = Number(el && el.value);
        return Number.isFinite(n) ? n : fallback;
    }

    function intFromInput(el, fallback = 1) {
        const n = Math.trunc(numFromInput(el, fallback));
        return Number.isFinite(n) ? n : fallback;
    }

    function readPresetRingPoint(xEl, yEl, zEl) {
        return {
            x: numFromInput(xEl, 0),
            y: numFromInput(yEl, 0),
            z: numFromInput(zEl, 0)
        };
    }

    function setPresetRingPoint(xEl, yEl, zEl, point) {
        const p = normalizePointValue(point);
        if (xEl) xEl.value = String(p.x);
        if (yEl) yEl.value = String(p.y);
        if (zEl) zEl.value = String(p.z);
    }

    function getActiveParameterizedInstanceNode() {
        if (!activeParameterizedInstanceNodeId) return null;
        const ctx = findNodeContextById(activeParameterizedInstanceNodeId);
        return ctx?.node?.kind === EFFECT_RING_KIND ? ctx.node : null;
    }

    function resetPresetRingSharedVariableState() {
        presetRingSharedVariableState.enabled = {};
        presetRingSharedVariableState.values = {};
        presetRingSharedVariableState.touched = {};
        presetRingSharedVariableState.excluded = {};
    }

    function findPresetIdForSnapshot(snapshotId) {
        const snapshot = ensureBuilderSnapshotState()[String(snapshotId || "")];
        return String(snapshot?.sourcePresetId || "").trim();
    }

    function loadPresetRingEditorFromNode(node) {
        if (!node || node.kind !== EFFECT_RING_KIND) return false;
        const p = node.params || {};
        presetRingSlots?.replaceChildren();
        if (presetRingCount) presetRingCount.value = String(Math.max(1, Math.trunc(Number(p.count) || 12)));
        if (presetRingRadius) presetRingRadius.value = String(Number.isFinite(Number(p.radius)) ? Number(p.radius) : 3);
        if (presetRingStartDeg) presetRingStartDeg.value = String(Number(p.startDeg) || 0);
        if (presetRingGroupLabel) presetRingGroupLabel.value = String(node.label || "环形放置");
        setPresetRingPoint(presetRingOriginX, presetRingOriginY, presetRingOriginZ, {
            x: p.originX, y: p.originY, z: p.originZ
        });
        setPresetRingPoint(presetRingAxisX, presetRingAxisY, presetRingAxisZ, {
            x: p.axisX, y: p.axisY, z: p.axisZ
        });
        setPresetRingPoint(presetRingOffsetX, presetRingOffsetY, presetRingOffsetZ, {
            x: p.offsetX, y: p.offsetY, z: p.offsetZ
        });
        if (presetRingFaceCenter) presetRingFaceCenter.checked = p.faceCenter !== false;
        if (presetRingReverse) presetRingReverse.checked = p.reverse === true;
        if (presetRingRandomEnabled) presetRingRandomEnabled.checked = false;
        presetRingRandomPresetIds = [];
        presetRingSlotPresetIds = (Array.isArray(p.snapshotIds) ? p.snapshotIds : [])
            .map((id) => findPresetIdForSnapshot(id));
        return true;
    }

    function writePresetRingEditorToNode(node, snapshotIds) {
        if (!node || node.kind !== EFFECT_RING_KIND) return false;
        const origin = readPresetRingPoint(presetRingOriginX, presetRingOriginY, presetRingOriginZ);
        const axis = readPresetRingPoint(presetRingAxisX, presetRingAxisY, presetRingAxisZ);
        const offset = readPresetRingPoint(presetRingOffsetX, presetRingOffsetY, presetRingOffsetZ);
        node.label = String(presetRingGroupLabel?.value || "").trim() || "环形放置";
        node.params = Object.assign({}, node.params || {}, {
            snapshotIds: Array.isArray(snapshotIds) ? snapshotIds.slice() : [],
            count: getPresetRingCount(),
            radius: numFromInput(presetRingRadius, 3),
            startDeg: numFromInput(presetRingStartDeg, 0),
            originX: origin.x,
            originY: origin.y,
            originZ: origin.z,
            axisX: axis.x,
            axisY: axis.y,
            axisZ: axis.z,
            offsetX: offset.x,
            offsetY: offset.y,
            offsetZ: offset.z,
            faceCenter: !!presetRingFaceCenter?.checked,
            reverse: !!presetRingReverse?.checked
        });
        return true;
    }

    function commitPresetRingCardParams() {
        const node = getActiveParameterizedInstanceNode();
        if (!node) return false;
        historyCapture("update_effect_ring_params");
        writePresetRingEditorToNode(node, Array.isArray(node.params?.snapshotIds) ? node.params.snapshotIds : []);
        scheduleAutoSave();
        renderCards?.();
        rebuildPreviewAndKotlin();
        updatePresetRingStatus();
        return true;
    }

    function schedulePresetRingSnapshotSync(options = {}) {
        const node = getActiveParameterizedInstanceNode();
        if (!node) return false;
        const count = getPresetRingCount();
        const presetIds = getPresetRingSelectedIds();
        const presetsById = new Map(getPresetList().map((preset) => [preset.id, preset]));
        if (presetIds.length < count || presetIds.slice(0, count).some((id) => !id || !presetsById.has(id))) {
            return false;
        }
        if (presetRingSnapshotSyncTimer) clearTimeout(presetRingSnapshotSyncTimer);
        const nodeId = node.id;
        presetRingSnapshotSyncTimer = setTimeout(() => {
            presetRingSnapshotSyncTimer = 0;
            if (activeParameterizedInstanceNodeId !== nodeId) return;
            applyPresetRingTool({ silent: true }).catch((error) => {
                console.error("preset ring auto sync failed:", error);
                showToast(`环形放置自动更新失败：${error.message || error}`, "error");
            });
        }, Math.max(0, Math.trunc(Number(options.delay) || 80)));
        return true;
    }

    function getPresetRingCount() {
        return Math.max(1, intFromInput(presetRingCount, 12));
    }

    function isPresetRingRandomEnabled() {
        return !!presetRingRandomEnabled?.checked && !!presetRingRandomGroup?.value;
    }

    function updatePresetRingRandomGroupOptions() {
        if (!presetRingRandomGroup) return [];
        const groups = getRandomPresetGroupOptions(getPresetList());
        const current = String(presetRingRandomGroup.value || "");
        presetRingRandomGroup.replaceChildren();
        for (const group of groups) {
            const option = document.createElement("option");
            option.value = group;
            option.textContent = group;
            presetRingRandomGroup.appendChild(option);
        }
        presetRingRandomGroup.value = groups.includes(current) ? current : (groups[0] || "");
        const hasGroups = groups.length > 0;
        if (presetRingRandomEnabled) presetRingRandomEnabled.disabled = !hasGroups;
        presetRingRandomGroup.disabled = !presetRingRandomEnabled?.checked || !hasGroups;
        if (presetRingRandomEnabled && !hasGroups) presetRingRandomEnabled.checked = false;
        const randomEnabled = isPresetRingRandomEnabled();
        presetRingSlots?.classList.toggle("hidden", randomEnabled);
        if (btnPresetRingSyncSlots) btnPresetRingSyncSlots.textContent = randomEnabled ? "重新随机" : "同步槽位";
        return groups;
    }

    function refreshPresetRingRandomSelection() {
        updatePresetRingRandomGroupOptions();
        presetRingRandomPresetIds = isPresetRingRandomEnabled()
            ? pickRandomPresetIdsForGroup(
                getPresetList(),
                presetRingRandomGroup.value,
                getPresetRingCount()
            )
            : [];
        return presetRingRandomPresetIds.slice();
    }

    function getPresetRingPresetOptions() {
        return getPresetList().map((preset) => {
            const group = getPresetGroupLabel(preset.group);
            const name = preset.name || "未命名预设";
            return {
                id: preset.id,
                name,
                group,
                label: `${group ? `${group} / ` : ""}${name}`
            };
        });
    }

    function setPresetRingSlotPickerValue(button, presetId, options = null) {
        if (!button) return;
        const id = String(presetId || "");
        const list = Array.isArray(options) ? options : getPresetRingPresetOptions();
        const option = list.find((it) => it && it.id === id) || null;
        button.value = option ? option.id : "";
        button.dataset.value = option ? option.id : "";
        button.classList.toggle("empty", !option);
        const text = option ? option.label : "选择预设";
        const labelEl = button.__pbPickerLabelEl || button.querySelector?.(".preset-ring-slot-picker-label");
        if (labelEl) labelEl.textContent = text;
        else button.textContent = text;
        button.title = text;
    }

    function buildPresetRingPickerMenuItems(options, onSelect) {
        const root = { children: [], groups: new Map() };
        const ensureGroup = (parts) => {
            let node = root;
            for (const raw of parts) {
                const label = String(raw || "").trim();
                if (!label) continue;
                let child = node.groups.get(label);
                if (!child) {
                    child = { label, children: [], groups: new Map() };
                    node.groups.set(label, child);
                    node.children.push(child);
                }
                node = child;
            }
            return node;
        };
        for (const option of options || []) {
            if (!option || !option.id) continue;
            const parts = splitPresetGroupPath(option.group || DEFAULT_PRESET_GROUP);
            const parent = ensureGroup(parts.length ? parts : [DEFAULT_PRESET_GROUP]);
            parent.children.push({
                label: option.name || "未命名预设",
                onSelect: () => onSelect(option)
            });
        }
        const serialize = (node) => (node.children || []).map((child) => {
            if (child.groups) {
                return { label: child.label, children: serialize(child) };
            }
            return child;
        }).filter((item) => item && (item.onSelect || (Array.isArray(item.children) && item.children.length)));
        const items = [{ label: "清空槽位", onSelect: () => onSelect(null) }];
        const grouped = serialize(root);
        if (grouped.length) items.push(...grouped);
        else items.push({ label: "暂无预设", muted: true, onSelect: () => {} });
        return items;
    }

    function openPresetRingSlotPicker(button, slotIndex) {
        const options = getPresetRingPresetOptions();
        const applySelection = (option) => {
            const id = option?.id || "";
            presetRingSlotPresetIds[slotIndex] = id;
            setPresetRingSlotPickerValue(button, id, options);
            updatePresetRingStatus();
            renderPresetRingSharedVariables();
            schedulePresetRingSnapshotSync();
        };
        const items = buildPresetRingPickerMenuItems(options, applySelection);
        const rect = button.getBoundingClientRect();
        return showActionMenu(rect.left, rect.bottom + 4, items);
    }

    function updatePresetRingStatus() {
        if (!presetRingStatus) return;
        const selected = getPresetRingSelectedIds().filter(Boolean).length;
        const count = getPresetRingCount();
        if (isPresetRingRandomEnabled()) {
            presetRingStatus.textContent = `随机组：${presetRingRandomGroup.value} · ${selected}/${count} 个槽位`;
            return;
        }
        presetRingStatus.textContent = `圆点模式：${selected}/${count} 个槽位已选择`;
    }

    function renderPresetRingSlots() {
        if (!presetRingSlots) return;
        const count = getPresetRingCount();
        const previous = Array.from(presetRingSlots.querySelectorAll(".preset-ring-slot-select")).map((el) => el.value || el.dataset.value || "");
        for (let i = 0; i < previous.length; i++) presetRingSlotPresetIds[i] = previous[i];
        presetRingSlotPresetIds.length = count;
        const options = getPresetRingPresetOptions();
        presetRingSlots.replaceChildren();
        for (let i = 0; i < count; i++) {
            const row = document.createElement("div");
            row.className = "preset-ring-slot";
            const label = document.createElement("span");
            label.textContent = String(i + 1).padStart(2, "0");
            const picker = document.createElement("button");
            picker.type = "button";
            picker.className = "input preset-ring-slot-select preset-ring-slot-picker";
            picker.dataset.slotIndex = String(i);
            const pickerLabel = document.createElement("span");
            pickerLabel.className = "preset-ring-slot-picker-label";
            const pickerArrow = document.createElement("span");
            pickerArrow.className = "preset-ring-slot-picker-arrow";
            pickerArrow.textContent = "▾";
            picker.__pbPickerLabelEl = pickerLabel;
            picker.append(pickerLabel, pickerArrow);
            setPresetRingSlotPickerValue(picker, presetRingSlotPresetIds[i] || "", options);
            picker.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                openPresetRingSlotPicker(picker, i);
            });
            row.append(label, picker);
            presetRingSlots.appendChild(row);
        }
        updatePresetRingStatus();
        renderPresetRingSharedVariables();
    }

    function syncPresetRingSlots() {
        if (isPresetRingRandomEnabled()) refreshPresetRingRandomSelection();
        renderPresetRingSlots();
        renderPresetRingSharedVariables();
        schedulePresetRingSnapshotSync();
    }

    function getPresetRingSelectedIds() {
        if (isPresetRingRandomEnabled()) {
            return presetRingRandomPresetIds.slice(0, getPresetRingCount());
        }
        if (!presetRingSlots) return presetRingSlotPresetIds.slice(0, getPresetRingCount());
        const ids = Array.from(presetRingSlots.querySelectorAll(".preset-ring-slot-select")).map((el) => el.value || el.dataset.value || "");
        presetRingSlotPresetIds = ids.slice(0, getPresetRingCount());
        return presetRingSlotPresetIds.slice();
    }

    function getRingVariableKey(type, name) {
        const cleanType = type === "vector" ? "vector" : "scalar";
        const cleanName = normalizeContextIdentifier(name);
        return cleanName ? `${cleanType}:${cleanName}` : "";
    }

    function ensurePresetRingSharedVariablePanel() {
        if (presetRingSharedVariablePanelEl && presetRingSharedVariablePanelEl.isConnected) return presetRingSharedVariablePanelEl;
        if (!presetRingTool) return null;
        const el = document.createElement("div");
        el.id = "presetRingSharedVariables";
        el.className = "preset-ring-shared-vars hidden";
        if (presetRingSlots && presetRingSlots.parentNode) presetRingSlots.insertAdjacentElement("afterend", el);
        else presetRingTool.appendChild(el);
        presetRingSharedVariablePanelEl = el;
        return el;
    }

    function getPresetRingVariableGroups() {
        const count = getPresetRingCount();
        const presetIds = getPresetRingSelectedIds();
        const presetsById = new Map(getPresetList().map((preset) => [preset.id, preset]));
        const groups = new Map();
        for (let i = 0; i < count; i++) {
            const preset = presetsById.get(presetIds[i]);
            const normalized = normalizePresetList([preset])[0];
            if (!normalized) continue;
            const variableInfo = getPresetEffectiveVariableInfo(normalized);
            const entries = getPresetVariableEntries(variableInfo);
            const defaults = getPresetVariableDefaultValues(variableInfo);
            for (const entry of entries) {
                const name = normalizeContextIdentifier(entry?.name);
                if (!name) continue;
                const type = entry?.type === "vector" ? "vector" : "scalar";
                const key = getRingVariableKey(type, name);
                if (!key) continue;
                if (!groups.has(key)) {
                    groups.set(key, {
                        key,
                        type,
                        name,
                        entries: [],
                        defaultValue: type === "vector"
                            ? normalizePointValue(defaults.vector?.[name])
                            : normalizePresetScalarVariableValue(defaults.scalar?.[name])
                    });
                }
                groups.get(key).entries.push({
                    index: i,
                    presetId: normalized.id,
                    presetName: normalized.name || "未命名预设",
                    group: getPresetGroupLabel(normalized.group),
                    entry
                });
            }
        }
        return Array.from(groups.values())
            .filter((group) => group.entries.length > 1)
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === "vector" ? -1 : 1;
                return compareSuggestionNames(a.name, b.name);
            });
    }

    function cleanupPresetRingSharedState(groups) {
        const valid = new Set((groups || []).map((group) => group.key));
        // 数量变化时，变量可能暂时只剩一个槽位，随后又重新成为共享变量。
        // 保留已编辑值，避免重绘把用户输入替换回预设默认值。
        for (const key of Object.keys(presetRingSharedVariableState.excluded)) {
            if (!valid.has(key)) {
                delete presetRingSharedVariableState.excluded[key];
                continue;
            }
            const group = groups.find((it) => it.key === key);
            const validSlots = new Set((group?.entries || []).map((entry) => String(entry.index)));
            for (const slot of Object.keys(presetRingSharedVariableState.excluded[key] || {})) {
                if (!validSlots.has(slot)) delete presetRingSharedVariableState.excluded[key][slot];
            }
        }
    }

    function isPresetRingSharedVariableEnabled(key) {
        return presetRingSharedVariableState.enabled[key] === true;
    }

    function isPresetRingSharedVariableExcluded(key, index) {
        return !!presetRingSharedVariableState.excluded[key]?.[String(index)];
    }

    function getPresetRingSharedVariableValue(group) {
        const key = group?.key || "";
        if (!key) return group?.defaultValue;
        if (presetRingSharedVariableState.touched[key] !== true
            || !Object.prototype.hasOwnProperty.call(presetRingSharedVariableState.values, key)) {
            presetRingSharedVariableState.values[key] = group.type === "vector"
                ? normalizePointValue(group.defaultValue)
                : normalizePresetScalarVariableValue(group.defaultValue);
        }
        return presetRingSharedVariableState.values[key];
    }

    function setPresetRingSharedVariableInputValue(group, value) {
        if (!group?.key) return;
        presetRingSharedVariableState.touched[group.key] = true;
        presetRingSharedVariableState.values[group.key] = group.type === "vector"
            ? normalizePointValue(value)
            : normalizePresetScalarVariableValue(value);
    }

    function setPresetRingSharedVariableValue(values, group, value) {
        if (!values || !group) return;
        const name = normalizeContextIdentifier(group.name);
        if (!name) return;
        if (group.type === "vector") {
            if (!values.vector) values.vector = {};
            values.vector[name] = normalizePointValue(value);
        } else {
            if (!values.scalar) values.scalar = {};
            values.scalar[name] = normalizePresetScalarVariableValue(value);
        }
    }

    function makePresetVariableInfoWithoutShared(info, sharedKeys) {
        const normalized = normalizePresetVariableInfoForStorage(info);
        if (!normalized || !(sharedKeys instanceof Set) || !sharedKeys.size) return normalized;
        const refs = { scalar: [], vector: [] };
        const inputs = { scalar: {}, vector: {} };
        const entries = [];
        for (const entry of getPresetVariableEntries(normalized)) {
            const name = normalizeContextIdentifier(entry?.name);
            if (!name) continue;
            const type = entry?.type === "vector" ? "vector" : "scalar";
            const key = getRingVariableKey(type, name);
            if (sharedKeys.has(key)) continue;
            entries.push(entry);
            refs[type].push(name);
            if (type === "vector") inputs.vector[name] = normalizePointValue(normalized.inputs?.vector?.[name]);
            else inputs.scalar[name] = normalizePresetScalarVariableValue(normalized.inputs?.scalar?.[name]);
        }
        return normalizePresetVariableInfoForStorage({ refs, inputs, entries });
    }

    function renderPresetRingSharedVariables() {
        const panel = ensurePresetRingSharedVariablePanel();
        if (!panel) return;
        const groups = getPresetRingVariableGroups();
        cleanupPresetRingSharedState(groups);
        panel.innerHTML = "";
        panel.classList.toggle("hidden", !groups.length);
        if (!groups.length) return;
        const title = document.createElement("div");
        title.className = "preset-ring-shared-title";
        title.textContent = "同名变量统一应用";
        panel.appendChild(title);
        for (const group of groups) {
            const card = document.createElement("div");
            card.className = "preset-ring-shared-card";
            const head = document.createElement("label");
            head.className = "preset-ring-shared-head";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = isPresetRingSharedVariableEnabled(group.key);
            const name = document.createElement("span");
            name.className = "preset-ring-shared-name";
            name.textContent = `${group.name} / ${group.type === "vector" ? "Vec3" : "数值"}`;
            const meta = document.createElement("span");
            meta.className = "preset-ring-shared-meta";
            meta.textContent = `${group.entries.length} 个槽位`;
            head.append(checkbox, name, meta);
            checkbox.addEventListener("change", () => {
                presetRingSharedVariableState.enabled[group.key] = checkbox.checked;
                renderPresetRingSharedVariables();
                schedulePresetRingSnapshotSync();
            });
            card.appendChild(head);

            const valueRow = document.createElement("div");
            valueRow.className = `preset-ring-shared-value ${group.type === "vector" ? "vector" : "scalar"}`;
            const valueLabel = document.createElement("span");
            valueLabel.className = "preset-ring-shared-value-label";
            valueLabel.textContent = "统一值";
            valueRow.appendChild(valueLabel);
            if (group.type === "vector") {
                const current = normalizePointValue(getPresetRingSharedVariableValue(group));
                const inputs = ["x", "y", "z"].map((axis) => {
                    const input = document.createElement("input");
                    input.className = "input";
                    input.type = "text";
                    input.inputMode = "decimal";
                    input.value = String(current[axis]);
                    input.placeholder = axis;
                    input.disabled = !isPresetRingSharedVariableEnabled(group.key);
                    input.addEventListener("input", () => {
                        setPresetRingSharedVariableInputValue(group, {
                            x: inputs[0]?.value,
                            y: inputs[1]?.value,
                            z: inputs[2]?.value
                        });
                    });
                    input.addEventListener("change", () => schedulePresetRingSnapshotSync());
                    valueRow.appendChild(input);
                    return input;
                });
            } else {
                const input = document.createElement("input");
                input.className = "input";
                input.type = "text";
                input.inputMode = "decimal";
                input.value = String(getPresetRingSharedVariableValue(group));
                input.disabled = !isPresetRingSharedVariableEnabled(group.key);
                input.addEventListener("input", () => {
                    setPresetRingSharedVariableInputValue(group, input.value);
                });
                input.addEventListener("change", () => schedulePresetRingSnapshotSync());
                valueRow.appendChild(input);
            }
            card.appendChild(valueRow);

            const affected = document.createElement("div");
            affected.className = "preset-ring-shared-affected";
            for (const item of group.entries) {
                const opt = document.createElement("label");
                opt.className = "preset-ring-shared-affected-item";
                const exclude = document.createElement("input");
                exclude.type = "checkbox";
                exclude.checked = !isPresetRingSharedVariableExcluded(group.key, item.index);
                exclude.disabled = !isPresetRingSharedVariableEnabled(group.key);
                const text = document.createElement("span");
                const groupText = item.group ? `${item.group} / ` : "";
                text.textContent = `${String(item.index + 1).padStart(2, "0")} ${groupText}${item.presetName}`;
                opt.append(exclude, text);
                exclude.addEventListener("change", () => {
                    if (!presetRingSharedVariableState.excluded[group.key]) presetRingSharedVariableState.excluded[group.key] = {};
                    if (exclude.checked) delete presetRingSharedVariableState.excluded[group.key][String(item.index)];
                    else presetRingSharedVariableState.excluded[group.key][String(item.index)] = true;
                    renderPresetRingSharedVariables();
                    schedulePresetRingSnapshotSync();
                });
                affected.appendChild(opt);
            }
            card.appendChild(affected);
            panel.appendChild(card);
        }
    }

    function openParameterizedInstanceEditor(nodeOrId = null) {
        const node = typeof nodeOrId === "string"
            ? findNodeContextById(nodeOrId)?.node
            : nodeOrId;
        const target = node?.kind === EFFECT_RING_KIND
            ? node
            : findNodeContextById(focusedNodeId)?.node;
        if (!presetRingTool || target?.kind !== EFFECT_RING_KIND) return false;
        if (activeParameterizedInstanceNodeId !== target.id) resetPresetRingSharedVariableState();
        activeParameterizedInstanceNodeId = target.id;
        loadPresetRingEditorFromNode(target);
        setRightPanelPage("params");
        scheduleParamEditorRender();
        requestAnimationFrame(() => {
            presetRingCount?.focus?.();
        });
        return true;
    }

    function renderEffectRingParams(body, node) {
        if (!body || !presetRingTool || node?.kind !== EFFECT_RING_KIND) return false;
        if (activeParameterizedInstanceNodeId !== node.id) {
            resetPresetRingSharedVariableState();
            activeParameterizedInstanceNodeId = node.id;
            loadPresetRingEditorFromNode(node);
        }
        presetRingTool.classList.add("effect-ring-param-editor");
        presetRingTool.classList.remove("hidden");
        body.appendChild(presetRingTool);
        updatePresetRingRandomGroupOptions();
        renderPresetRingSlots();
        renderPresetRingSharedVariables();
        updatePresetRingStatus();
        return true;
    }

    function openPresetRingTool() {
        return openParameterizedInstanceEditor();
    }

    function closePresetRingTool() {
        if (presetRingSnapshotSyncTimer) clearTimeout(presetRingSnapshotSyncTimer);
        presetRingSnapshotSyncTimer = 0;
        presetRingTool?.classList.add("hidden");
        presetRingTool?.classList.remove("effect-ring-param-editor");
        if (effectRingEditorParking && presetRingTool?.parentElement !== effectRingEditorParking) {
            effectRingEditorParking.appendChild(presetRingTool);
        }
        activeParameterizedInstanceNodeId = "";
        clearPresetPreview();
        resetPresetRingSharedVariableState();
    }

    function confirmParameterizedInstancePlacement(point) {
        const pending = pendingParameterizedInstancePlacement;
        if (!pending) return false;
        const node = findNodeContextById(pending.nodeId)?.node;
        pendingParameterizedInstancePlacement = null;
        if (!node || node.kind !== EFFECT_RING_KIND) return false;
        const origin = normalizePointValue(point);
        node.params.originX = origin.x;
        node.params.originY = origin.y;
        node.params.originZ = origin.z;
        setPresetRingPoint(presetRingOriginX, presetRingOriginY, presetRingOriginZ, origin);
        scheduleAutoSave();
        renderAll();
        openParameterizedInstanceEditor(node);
        showToast("已设置环形放置圆心", "success");
        return true;
    }

    function beginParameterizedInstancePlacement(node, context = {}) {
        if (!node || node.kind !== EFFECT_RING_KIND) return false;
        pendingParameterizedInstancePlacement = {
            nodeId: node.id,
            list: Array.isArray(context.list) ? context.list : null
        };
        return startPointPick({
            label: "环形放置圆心（Enter 使用原点，Esc 取消）",
            onPick: (point) => confirmParameterizedInstancePlacement(point)
        });
    }

    function cancelPointPick() {
        const pending = pendingParameterizedInstancePlacement;
        pendingParameterizedInstancePlacement = null;
        stopPointPick();
        if (!pending) return true;
        const ctx = findNodeContextById(pending.nodeId);
        if (ctx && Array.isArray(ctx.parentList)) ctx.parentList.splice(ctx.index, 1);
        if (activeParameterizedInstanceNodeId === pending.nodeId) closePresetRingTool();
        if (focusedNodeId === pending.nodeId) setFocusedNode(null, false);
        scheduleAutoSave();
        renderAll();
        showToast("已取消创建环形放置", "info");
        return true;
    }

    function confirmPointPickDefault() {
        if (!pendingParameterizedInstancePlacement || !pointPickMode) return false;
        stopPointPick();
        return confirmParameterizedInstancePlacement({ x: 0, y: 0, z: 0 });
    }

    function handleCreatedNodeFromPicker(node, context = {}) {
        if (!node || node.kind !== EFFECT_RING_KIND) return false;
        node.label = node.label || "环形放置";
        activeParameterizedInstanceNodeId = node.id;
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds([node.id], { replace: true, focus: false, syncWithParamSync: false });
        }
        setFocusedNode(node.id, false);
        openParameterizedInstanceEditor(node);
        return beginParameterizedInstancePlacement(node, context);
    }

    function getPresetRingSnapshotDefinitionKey(preset, values) {
        return JSON.stringify({
            presetId: String(preset?.id || ""),
            values: values ? normalizePresetVariableValues(values) : null
        });
    }

    async function applyPresetRingTool(options = {}) {
        if (!presetRingTool) return false;
        const activeNode = getActiveParameterizedInstanceNode();
        const count = getPresetRingCount();
        const presetIds = getPresetRingSelectedIds();
        const presetsById = new Map(getPresetList().map((preset) => [preset.id, preset]));
        const sharedGroups = getPresetRingVariableGroups();
        const missingIndex = Array.from({ length: count }, (_, index) => index)
            .find((index) => !presetIds[index] || !presetsById.has(presetIds[index]));
        if (missingIndex !== undefined) {
            const message = isPresetRingRandomEnabled()
                ? `环形放置保存失败：随机组“${presetRingRandomGroup.value}”中没有可用预设`
                : `环形放置保存失败：第 ${missingIndex + 1} 个槽位未选择预设`;
            if (!options.silent) showToast(message, "error");
            return false;
        }

        if (activeNode) {
            historyCapture("update_effect_ring");
            const snapshots = ensureBuilderSnapshotState();
            const snapshotIds = [];
            const snapshotsByDefinitionKey = new Map();
            const claimedDefinitionBySnapshotId = new Map();
            for (let index = 0; index < count; index += 1) {
                const preset = normalizePresetList([presetsById.get(presetIds[index])])[0];
                if (!preset) continue;
                const existingId = String(activeNode.params?.snapshotIds?.[index] || "").trim();
                const existing = existingId ? snapshots[existingId] : null;
                const variableInfo = getPresetEffectiveVariableInfo(preset);
                const entries = getPresetVariableEntries(variableInfo);
                let values = entries.length
                    ? getPresetVariableDefaultValues(variableInfo)
                    : null;
                if (values && existing?.staticOverrides) {
                    values = normalizePresetVariableValues(existing.staticOverrides);
                }
                if (values) {
                    for (const sharedGroup of sharedGroups) {
                        const affectsSlot = (sharedGroup.entries || []).some((item) => item && item.index === index);
                        if (affectsSlot
                            && isPresetRingSharedVariableEnabled(sharedGroup.key)
                            && !isPresetRingSharedVariableExcluded(sharedGroup.key, index)) {
                            setPresetRingSharedVariableValue(values, sharedGroup, getPresetRingSharedVariableValue(sharedGroup));
                        }
                    }
                }
                const definitionKey = getPresetRingSnapshotDefinitionKey(preset, values);
                let snapshot = snapshotsByDefinitionKey.get(definitionKey) || null;
                const existingClaim = existing ? claimedDefinitionBySnapshotId.get(existing.id) : "";
                if (!snapshot
                    && existing
                    && String(existing.sourcePresetId || "") === String(preset.id || "")
                    && (!existingClaim || existingClaim === definitionKey)) {
                    const updated = makeBuilderSnapshotFromPreset(preset, {
                        persist: false,
                        variableInfo,
                        variableValues: values || undefined
                    });
                    if (updated) {
                        updated.id = existing.id;
                        updated.createdAt = existing.createdAt || updated.createdAt;
                        updated.revision = Math.max(1, Math.trunc(Number(existing.revision) || 1)) + 1;
                        snapshots[existing.id] = updated;
                        snapshot = updated;
                    }
                }
                if (!snapshot) {
                    snapshot = Object.values(snapshots).find((candidate) => {
                        if (!candidate || String(candidate.sourcePresetId || "") !== String(preset.id || "")) return false;
                        const claim = claimedDefinitionBySnapshotId.get(candidate.id);
                        if (claim && claim !== definitionKey) return false;
                        return getPresetRingSnapshotDefinitionKey(preset, values ? candidate.staticOverrides : null) === definitionKey;
                    }) || null;
                }
                snapshot = snapshot || makeBuilderSnapshotFromPreset(preset, {
                        variableInfo,
                        variableValues: values || undefined
                    });
                if (snapshot) {
                    snapshotsByDefinitionKey.set(definitionKey, snapshot);
                    claimedDefinitionBySnapshotId.set(snapshot.id, definitionKey);
                    snapshotIds.push(snapshot.id);
                }
            }
            writePresetRingEditorToNode(activeNode, snapshotIds);
            normalizeNodeTree(state.root);
            scheduleAutoSave();
            renderAll();
            if (!options.silent) showToast("已保存环形放置", "success");
            return true;
        }

        const scopeCtx = typeof getCurrentCardScopeContext === "function" ? getCurrentCardScopeContext() : null;
        const targetList = scopeCtx && Array.isArray(scopeCtx.list) ? scopeCtx.list : state.root.children;
        const ringOptions = {
            count,
            radius: numFromInput(presetRingRadius, 3),
            startDeg: numFromInput(presetRingStartDeg, 0),
            origin: readPresetRingPoint(presetRingOriginX, presetRingOriginY, presetRingOriginZ),
            axis: readPresetRingPoint(presetRingAxisX, presetRingAxisY, presetRingAxisZ),
            offset: readPresetRingPoint(presetRingOffsetX, presetRingOffsetY, presetRingOffsetZ),
            faceCenter: !!presetRingFaceCenter?.checked,
            reverse: !!presetRingReverse?.checked
        };
        const sharedValuesByKey = new Map();
        const sharedKeysBySlot = new Map();
        for (const sharedGroup of sharedGroups) {
            for (const item of sharedGroup.entries) {
                if (isPresetRingSharedVariableExcluded(sharedGroup.key, item.index)) continue;
                if (!sharedValuesByKey.has(sharedGroup.key)) sharedValuesByKey.set(sharedGroup.key, getPresetRingSharedVariableValue(sharedGroup));
                if (!sharedKeysBySlot.has(item.index)) sharedKeysBySlot.set(item.index, new Set());
                sharedKeysBySlot.get(item.index).add(sharedGroup.key);
            }
        }

        const snapshotIds = [];
        const snapshotsByDefinitionKey = new Map();
        for (let index = 0; index < count; index += 1) {
            const normalized = normalizePresetList([presetsById.get(presetIds[index])])[0];
            if (!normalized) continue;
            const variableInfo = getPresetEffectiveVariableInfo(normalized);
            const entries = getPresetVariableEntries(variableInfo);
            let resolvedValues = null;
            if (entries.length) {
                const sharedKeys = sharedKeysBySlot.get(index) || new Set();
                const values = getPresetVariableDefaultValues(variableInfo);
                for (const sharedGroup of sharedGroups) {
                    if (sharedKeys.has(sharedGroup.key)) setPresetRingSharedVariableValue(values, sharedGroup, sharedValuesByKey.get(sharedGroup.key));
                }
                const remainingInfo = makePresetVariableInfoWithoutShared(variableInfo, sharedKeys);
                if (getPresetVariableEntries(remainingInfo).length) {
                    const slotValues = await openPresetVariableApplyDialog(Object.assign({}, normalized, {
                        name: `${normalized.name || "未命名预设"} #${index + 1}`,
                        variables: Object.assign({}, remainingInfo, { inputs: values })
                    }));
                    if (!slotValues) {
                        showToast("环形放置创建已取消", "info");
                        return false;
                    }
                    Object.assign(values.scalar, slotValues.scalar || {});
                    Object.assign(values.vector, slotValues.vector || {});
                }
                resolvedValues = values;
            }
            const definitionKey = getPresetRingSnapshotDefinitionKey(normalized, resolvedValues);
            const snapshot = snapshotsByDefinitionKey.get(definitionKey)
                || (resolvedValues
                ? makeBuilderSnapshotFromPreset(normalized, {
                    variableInfo,
                    variableValues: resolvedValues
                })
                : (findBuilderSnapshotByPresetId(normalized.id) || makeBuilderSnapshotFromPreset(normalized)));
            if (snapshot) {
                snapshotsByDefinitionKey.set(definitionKey, snapshot);
                snapshotIds.push(snapshot.id);
            }
        }
        if (!snapshotIds.length) {
            showToast("环形放置创建失败：没有可用的实例原型", "error");
            return false;
        }

        const node = makeNode(EFFECT_RING_KIND, {
            label: String(presetRingGroupLabel?.value || "").trim() || "环形放置",
            params: {
                snapshotIds,
                count: ringOptions.count,
                radius: ringOptions.radius,
                startDeg: ringOptions.startDeg,
                originX: ringOptions.origin.x,
                originY: ringOptions.origin.y,
                originZ: ringOptions.origin.z,
                axisX: ringOptions.axis.x,
                axisY: ringOptions.axis.y,
                axisZ: ringOptions.axis.z,
                offsetX: ringOptions.offset.x,
                offsetY: ringOptions.offset.y,
                offsetZ: ringOptions.offset.z,
                faceCenter: ringOptions.faceCenter,
                reverse: ringOptions.reverse
            }
        });
        historyCapture("create_effect_ring");
        targetList.push(node);
        normalizeNodeTree(state.root);
        ensureAxisEverywhere();
        resetCollapseScopes();
        collapseAllNodes(state.root.children);
        renderAll();
        activeParameterizedInstanceNodeId = node.id;
        if (typeof setCardSelectionIds === "function") setCardSelectionIds([node.id], { replace: true, focus: true });
        setFocusedNode(node.id, false);
        openParameterizedInstanceEditor(node);
        beginParameterizedInstancePlacement(node, { list: targetList });
        showToast("已创建环形放置，请拾取圆心", "success");
        return true;
    }

    let jsZipLoadPromise = null;

    function loadJSZip() {
        if (globalThis.JSZip) return Promise.resolve(globalThis.JSZip);
        if (jsZipLoadPromise) return jsZipLoadPromise;
        jsZipLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = JSZIP_URL;
            script.async = true;
            script.onload = () => {
                if (globalThis.JSZip) resolve(globalThis.JSZip);
                else reject(new Error("JSZip 未加载"));
            };
            script.onerror = () => reject(new Error("JSZip 加载失败"));
            document.head.appendChild(script);
        });
        return jsZipLoadPromise;
    }

    function downloadBlob(filename, blob) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || "download.bin";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    function makePresetFilePayload(rawPreset) {
        const preset = normalizePresetList([rawPreset])[0];
        if (!preset) return null;
        const payload = {
            type: "pointsbuilder-preset",
            version: 1,
            id: preset.id,
            name: preset.name,
            group: getPresetGroupLabel(preset.group),
            buildInfo: preset.buildInfo || {},
            origin: normalizePointValue(preset.origin),
            root: {
                id: "root",
                kind: "ROOT",
                children: deepCloneJson(preset.children || []) || []
            },
            createdAt: preset.createdAt,
            updatedAt: preset.updatedAt
        };
        if (preset.variables) payload.variables = preset.variables;
        return payload;
    }

    function makeUniquePath(path, used) {
        const parts = String(path || "").split("/");
        const file = parts.pop() || "preset.json";
        const dot = file.lastIndexOf(".");
        const base = dot >= 0 ? file.slice(0, dot) : file;
        const ext = dot >= 0 ? file.slice(dot) : "";
        let candidate = parts.concat(file).join("/");
        let n = 2;
        while (used.has(candidate)) {
            candidate = parts.concat(`${base} ${n++}${ext}`).join("/");
        }
        used.add(candidate);
        return candidate;
    }

    function getPresetExportPath(preset, used) {
        const group = getPresetGroupLabel(preset.group);
        const filename = `${sanitizeFileBase(preset.name || "preset") || "preset"}.json`;
        return makeUniquePath(`${group}/${filename}`, used);
    }

    async function exportPresetLibraryZip() {
        const presets = getPresetList();
        if (!presets.length) throw new Error("还没有可导出的预设");
        const JSZip = await loadJSZip();
        const zip = new JSZip();
        const used = new Set();
        for (const preset of presets) {
            const payload = makePresetFilePayload(preset);
            if (!payload) continue;
            zip.file(getPresetExportPath(preset, used), JSON.stringify(payload, null, 2));
        }
        const blob = await zip.generateAsync({ type: "blob" });
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: "preset.zip",
                types: [{ description: "Preset Zip", accept: { "application/zip": [".zip"] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else {
            downloadBlob("preset.zip", blob);
        }
        return presets.length;
    }

    function getGroupFromImportPath(path) {
        const parts = String(path || "").replace(/\\/g, "/").split("/").filter(Boolean);
        parts.pop();
        return getPresetGroupLabel(parts.join("/"));
    }

    function collectPresetItemsFromPayload(payload, groupOverride = "") {
        const src = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload?.presets) ? payload.presets : [payload]);
        const group = normalizePresetGroup(groupOverride);
        return src
            .filter((it) => it && typeof it === "object")
            .map((it) => {
                const copy = deepCloneJson(it) || Object.assign({}, it);
                if (group) copy.group = group;
                return copy;
            });
    }

    function importPresetItems(items, options = {}) {
        const count = importPresetPayload({ presets: items }, options);
        schedulePresetLibraryRender();
        return count;
    }

    async function importPresetZipFile(file, options = {}) {
        const JSZip = await loadJSZip();
        const zip = await JSZip.loadAsync(file);
        const items = [];
        const entries = Object.values(zip.files || {})
            .filter((entry) => entry && !entry.dir && /\.json$/i.test(entry.name || ""));
        for (const entry of entries) {
            try {
                const text = await entry.async("string");
                const payload = JSON.parse(text);
                items.push(...collectPresetItemsFromPayload(payload, getGroupFromImportPath(entry.name)));
            } catch (e) {
                console.warn("skip preset json:", entry.name, e);
            }
        }
        if (!items.length) throw new Error("压缩包里没有可导入的 pointsbuilder JSON");
        return importPresetItems(items, options);
    }

    async function importPresetFile(file, options = {}) {
        if (!file) return 0;
        const name = String(file.name || "").toLowerCase();
        if (name.endsWith(".zip")) return importPresetZipFile(file, options);
        const payload = JSON.parse(await file.text());
        return importPresetPayload(payload, options);
    }

    async function collectPresetDirectoryItems(dirHandle, prefix = "") {
        const items = [];
        for await (const [name, handle] of dirHandle.entries()) {
            const path = prefix ? `${prefix}/${name}` : name;
            if (handle.kind === "directory") {
                items.push(...await collectPresetDirectoryItems(handle, path));
                continue;
            }
            if (handle.kind !== "file" || !/\.json$/i.test(name)) continue;
            try {
                const file = await handle.getFile();
                const payload = JSON.parse(await file.text());
                items.push(...collectPresetItemsFromPayload(payload, getGroupFromImportPath(path)));
            } catch (e) {
                console.warn("skip preset json:", path, e);
            }
        }
        return items;
    }

    async function importPresetDirectory(options = {}) {
        if (!window.showDirectoryPicker) {
            filePresetJson?.click();
            return 0;
        }
        const dir = await window.showDirectoryPicker({ mode: "read" });
        const items = await collectPresetDirectoryItems(dir);
        if (!items.length) throw new Error("文件夹里没有可导入的 pointsbuilder JSON");
        return importPresetItems(items, options);
    }

    function setPresetOriginInputs(point) {
        const p = normalizePointValue(point);
        if (presetOriginX) presetOriginX.value = String(p.x);
        if (presetOriginY) presetOriginY.value = String(p.y);
        if (presetOriginZ) presetOriginZ.value = String(p.z);
    }

    function readPresetOriginInputs() {
        const x = Number(presetOriginX?.value);
        const y = Number(presetOriginY?.value);
        const z = Number(presetOriginZ?.value);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return getPresetOriginFallback();
        return { x, y, z };
    }

    function getPresetGroups() {
        const out = [];
        const seen = new Set();
        const addGroup = (raw) => {
            const group = getPresetGroupLabel(raw);
            if (!group || seen.has(group)) return;
            seen.add(group);
            out.push(group);
        };
        const storedGroups = Array.isArray(presetGroups) && presetGroups.length ? presetGroups : [DEFAULT_PRESET_GROUP];
        addGroup(DEFAULT_PRESET_GROUP);
        for (const group of storedGroups) addGroup(group);
        for (const preset of presetList) addGroup(preset.group);
        const current = getPresetGroupLabel(presetGroupInput?.value || "");
        if (current) addGroup(current);
        return out;
    }

    function splitPresetGroupPath(group) {
        return getPresetGroupLabel(group).split("/").map((it) => it.trim()).filter(Boolean);
    }

    function getPresetParentGroup(group) {
        const parts = splitPresetGroupPath(group);
        return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    }

    function getPresetGroupDepth(group) {
        return Math.max(0, splitPresetGroupPath(group).length - 1);
    }

    function getPresetGroupLeaf(group) {
        const parts = splitPresetGroupPath(group);
        return parts[parts.length - 1] || getPresetGroupLabel(group);
    }

    function isPresetGroupHiddenByParent(group) {
        let parent = getPresetParentGroup(group);
        while (parent) {
            if (presetCollapsedGroups.has(parent)) return true;
            parent = getPresetParentGroup(parent);
        }
        return false;
    }

    function expandPresetGroupsWithParents(groups) {
        const out = new Set();
        for (const group of groups || []) {
            const parts = splitPresetGroupPath(group);
            if (!parts.length) continue;
            for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("/"));
        }
        if (!out.size) out.add(DEFAULT_PRESET_GROUP);
        return Array.from(out);
    }

    function sortPresetGroupsForTree(groups) {
        const source = Array.from(groups || []).map((it) => getPresetGroupLabel(it));
        const available = new Set(source);
        const out = [];
        const seen = new Set();
        const addGroupWithParents = (group) => {
            const parts = splitPresetGroupPath(group);
            if (!parts.length) {
                if (available.has(DEFAULT_PRESET_GROUP) && !seen.has(DEFAULT_PRESET_GROUP)) {
                    seen.add(DEFAULT_PRESET_GROUP);
                    out.push(DEFAULT_PRESET_GROUP);
                }
                return;
            }
            for (let i = 1; i <= parts.length; i++) {
                const key = parts.slice(0, i).join("/");
                if (!available.has(key) || seen.has(key)) continue;
                seen.add(key);
                out.push(key);
            }
        };
        for (const group of source) addGroupWithParents(group);
        return out;
    }

    function createPresetGroup(rawName = "", parentGroup = "", options = {}) {
        const normalizedParent = normalizePresetGroup(parentGroup);
        const parent = normalizedParent ? getPresetGroupLabel(normalizedParent) : "";
        const raw = getPresetGroupLabel(rawName || `分组 ${getPresetGroups().length}`);
        const base = parent && !isDefaultPresetGroup(raw) && !raw.includes("/") ? `${parent}/${raw}` : raw;
        let name = base;
        let n = 2;
        const existing = new Set(getPresetGroups());
        while (existing.has(name)) name = `${base} ${n++}`;
        presetGroups = dedupePresetGroups(presetGroups.concat(name));
        persistPresetGroups();
        updatePresetGroupList();
        if (options.focusPresetInput !== false && presetGroupInput) {
            presetGroupInput.value = name;
            presetGroupInput.focus();
        }
        showToast(`已创建分组：${name}`, "success");
        return name;
    }

    function createPresetGroupFromLibrary(parentGroup = "") {
        const normalizedParent = normalizePresetGroup(parentGroup);
        const parent = normalizedParent ? getPresetGroupLabel(normalizedParent) : "";
        if (parent) presetCollapsedGroups.delete(parent);
        const group = createPresetGroup("", parent, { focusPresetInput: false });
        if (group) beginPresetGroupRename(group);
        return group;
    }

    function getPresetGroupDragSource(ev) {
        const raw = draggingPresetGroup || ev?.dataTransfer?.getData("application/x-pointsbuilder-preset-group") || "";
        return raw ? getPresetGroupLabel(raw) : "";
    }

    function getPresetGroupDropPlacement(ev, targetEl) {
        const rect = targetEl?.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.height)) return "before";
        const y = Number(ev?.clientY);
        if (!Number.isFinite(y)) return "before";
        const topEdge = rect.top + rect.height * 0.22;
        const bottomEdge = rect.bottom - rect.height * 0.22;
        if (y < topEdge) return "before";
        if (y > bottomEdge) return "after";
        return "inside";
    }

    function clearPresetGroupDropState(head) {
        head?.classList?.remove("group-drop-before", "group-drop-after", "group-drop-inside");
    }

    function makeUniquePresetChildGroupName(parentGroup, leafName, sourceGroup) {
        const parent = normalizePresetGroup(parentGroup);
        const leaf = getPresetGroupLeaf(leafName || sourceGroup);
        const base = parent ? `${parent}/${leaf}` : leaf;
        const source = getPresetGroupLabel(sourceGroup);
        const existing = new Set(getPresetGroups().map((it) => getPresetGroupLabel(it)));
        let candidate = getPresetGroupLabel(base);
        let n = 2;
        while (existing.has(candidate) && candidate !== source) {
            candidate = getPresetGroupLabel(`${base} ${n++}`);
        }
        return candidate;
    }

    function getPresetSiblingTargetBase(sourceGroup, targetGroup) {
        const source = getPresetGroupLabel(sourceGroup);
        const target = getPresetGroupLabel(targetGroup);
        if (!source || !target) return "";
        const parent = getPresetParentGroup(target);
        return makeUniquePresetChildGroupName(parent, getPresetGroupLeaf(source), source);
    }

    function reparentPresetGroup(sourceGroup, targetGroup) {
        const source = getPresetGroupLabel(sourceGroup);
        const target = getPresetGroupLabel(targetGroup);
        if (!source || !target || source === target || isDefaultPresetGroup(source)) return false;
        if (target.startsWith(`${source}/`)) return false;
        const nextBase = makeUniquePresetChildGroupName(target, getPresetGroupLeaf(source), source);
        if (!nextBase || nextBase === source) return false;
        const sourcePrefix = `${source}/`;
        const remapGroup = (raw) => {
            const group = getPresetGroupLabel(raw);
            if (group === source) return nextBase;
            if (group.startsWith(sourcePrefix)) return `${nextBase}${group.slice(source.length)}`;
            return group;
        };
        presetList = presetList.map((preset) => Object.assign({}, preset, {
            group: remapGroup(preset.group),
            updatedAt: getPresetGroupLabel(preset.group) === remapGroup(preset.group) ? preset.updatedAt : Date.now()
        }));
        presetGroups = dedupePresetGroups(presetGroups.map(remapGroup).concat(target, nextBase));
        if (presetCollapsedGroups.has(source)) {
            presetCollapsedGroups.delete(source);
            presetCollapsedGroups.add(nextBase);
        }
        presetCollapsedGroups.delete(target);
        persistPresetList();
        return true;
    }

    function remapPresetGroupSubtree(sourceGroup, nextBase) {
        const source = getPresetGroupLabel(sourceGroup);
        const next = getPresetGroupLabel(nextBase);
        if (!source || !next || source === next || isDefaultPresetGroup(source)) return false;
        if (next.startsWith(`${source}/`)) return false;
        const sourcePrefix = `${source}/`;
        const remapGroup = (raw) => {
            const group = getPresetGroupLabel(raw);
            if (group === source) return next;
            if (group.startsWith(sourcePrefix)) return `${next}${group.slice(source.length)}`;
            return group;
        };
        presetList = presetList.map((preset) => {
            const prevGroup = getPresetGroupLabel(preset.group);
            const nextGroup = remapGroup(prevGroup);
            return Object.assign({}, preset, {
                group: nextGroup,
                updatedAt: prevGroup === nextGroup ? preset.updatedAt : Date.now()
            });
        });
        presetGroups = dedupePresetGroups(presetGroups.map(remapGroup).concat(next));
        if (presetCollapsedGroups.has(source)) {
            presetCollapsedGroups.delete(source);
            presetCollapsedGroups.add(next);
        }
        return true;
    }

    function movePresetGroupByDrop(sourceGroup, targetGroup, placement = "before") {
        const source = getPresetGroupLabel(sourceGroup);
        const target = getPresetGroupLabel(targetGroup);
        if (!source || !target || source === target) return false;
        if (isDefaultPresetGroup(source)) return false;
        if (target.startsWith(`${source}/`)) return false;
        if (placement === "inside") return reparentPresetGroup(source, target);
        const nextBase = getPresetSiblingTargetBase(source, target);
        if (!nextBase) return false;
        const changedParent = nextBase !== source;
        if (changedParent && !remapPresetGroupSubtree(source, nextBase)) return false;
        const movedSource = changedParent ? nextBase : source;
        const ordered = sortPresetGroupsForTree(expandPresetGroupsWithParents(getPresetGroups()));
        const sourcePrefix = `${movedSource}/`;
        const sourceBlock = ordered.filter((group) => group === movedSource || group.startsWith(sourcePrefix));
        if (!sourceBlock.length) return false;
        const sourceSet = new Set(sourceBlock);
        const rest = ordered.filter((group) => !sourceSet.has(group));
        let insertIndex = rest.findIndex((group) => group === target);
        if (insertIndex < 0) return false;
        if (placement === "after") {
            const targetPrefix = `${target}/`;
            while (insertIndex + 1 < rest.length && rest[insertIndex + 1].startsWith(targetPrefix)) {
                insertIndex++;
            }
            insertIndex++;
        }
        rest.splice(insertIndex, 0, ...sourceBlock);
        presetGroups = dedupePresetGroups(rest);
        persistPresetList();
        return true;
    }

    function togglePresetGroupCollapsed(group) {
        const key = getPresetGroupLabel(group);
        presetGroupAnimationTarget = key;
        if (presetCollapsedGroups.has(key)) presetCollapsedGroups.delete(key);
        else presetCollapsedGroups.add(key);
        schedulePresetLibraryRender();
    }

    function updatePresetGroupList() {
        const host = presetGroupInput && String(presetGroupInput.tagName || "").toUpperCase() === "SELECT"
            ? presetGroupInput
            : presetGroupList;
        if (!host) return;
        const current = presetGroupInput ? presetGroupInput.value : "";
        host.innerHTML = "";
        for (const group of getPresetGroups()) {
            const option = document.createElement("option");
            option.value = group;
            option.textContent = group;
            host.appendChild(option);
        }
        if (presetGroupInput && current && getPresetGroups().includes(current)) presetGroupInput.value = current;
    }

    function getPresetVariableEntries(info) {
        const normalized = normalizePresetVariableInfoForStorage(info);
        if (!normalized) return [];
        const entries = Array.isArray(normalized.entries) ? normalized.entries.slice() : [];
        const seen = new Set(entries.map((entry) => `${entry.type}:${entry.name}`));
        for (const name of normalized.refs.vector || []) {
            const key = `vector:${name}`;
            if (!seen.has(key)) entries.push({ type: "vector", name, source: "unknown", label: name });
        }
        for (const name of normalized.refs.scalar || []) {
            const key = `scalar:${name}`;
            if (!seen.has(key)) entries.push({ type: "scalar", name, source: "unknown", label: name });
        }
        return entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === "vector" ? -1 : 1;
            return String(a.name).localeCompare(String(b.name));
        });
    }

    function mergePresetVariableInfo(...infos) {
        const refs = { scalar: new Set(), vector: new Set() };
        const inputs = { scalar: {}, vector: {} };
        const entriesByKey = new Map();
        const hasInput = (type, name) => Object.prototype.hasOwnProperty.call(inputs[type], name);
        for (const raw of infos) {
            const info = normalizePresetVariableInfoForStorage(raw);
            if (!info) continue;
            for (const entry of getPresetVariableEntries(info)) {
                const name = normalizeContextIdentifier(entry?.name);
                if (!name) continue;
                const type = entry?.type === "vector" ? "vector" : "scalar";
                refs[type].add(name);
                const key = `${type}:${name}`;
                if (!entriesByKey.has(key)) entriesByKey.set(key, Object.assign({}, entry, { type, name }));
            }
            for (const name of info.refs?.vector || []) {
                const clean = normalizeContextIdentifier(name);
                if (!clean) continue;
                refs.vector.add(clean);
                if (!hasInput("vector", clean)) inputs.vector[clean] = normalizePointValue(info.inputs?.vector?.[clean]);
            }
            for (const name of info.refs?.scalar || []) {
                const clean = normalizeContextIdentifier(name);
                if (!clean) continue;
                refs.scalar.add(clean);
                if (!hasInput("scalar", clean)) {
                    inputs.scalar[clean] = normalizePresetScalarVariableValue(info.inputs?.scalar?.[clean]);
                }
            }
        }
        for (const name of refs.vector) refs.scalar.delete(name);
        if (!refs.scalar.size && !refs.vector.size) return null;
        return normalizePresetVariableInfoForStorage({
            refs: {
                scalar: Array.from(refs.scalar),
                vector: Array.from(refs.vector)
            },
            inputs,
            entries: Array.from(entriesByKey.values())
        });
    }

    function getPresetEffectiveVariableInfo(preset) {
        if (!preset || typeof preset !== "object") return null;
        return mergePresetVariableInfo(
            preset.variables,
            collectPresetVariableInfo(preset.children || [])
        );
    }

    function getPresetVariableDefaultValues(info) {
        const normalized = normalizePresetVariableInfoForStorage(info);
        return normalizePresetVariableValues(normalized?.inputs || {});
    }

    function clonePresetVariableValues(values) {
        return normalizePresetVariableValues(values);
    }

    function mergePresetVariableInputs(freshInfo, previousInfo) {
        const fresh = normalizePresetVariableInfoForStorage(freshInfo);
        if (!fresh) return null;
        const previous = getPresetVariableDefaultValues(previousInfo);
        const current = getPresetVariableDefaultValues(fresh);
        const inputs = { scalar: {}, vector: {} };
        for (const name of fresh.refs.scalar || []) {
            const prevValue = previous.scalar && Object.prototype.hasOwnProperty.call(previous.scalar, name)
                ? previous.scalar[name]
                : current.scalar?.[name];
            inputs.scalar[name] = normalizePresetScalarVariableValue(prevValue);
        }
        for (const name of fresh.refs.vector || []) {
            const prevValue = previous.vector && Object.prototype.hasOwnProperty.call(previous.vector, name)
                ? previous.vector[name]
                : current.vector?.[name];
            inputs.vector[name] = normalizePointValue(prevValue);
        }
        return normalizePresetVariableInfoForStorage(Object.assign({}, fresh, { inputs }));
    }

    function refreshPresetSaveVariableInfoForSource(options = {}) {
        const sourceChildren = presetSaveSourceChildren || state.root.children || [];
        const freshInfo = collectPresetVariableInfo(sourceChildren);
        presetSaveVariableInfo = options.preserveInputs === false
            ? normalizePresetVariableInfoForStorage(freshInfo)
            : mergePresetVariableInputs(freshInfo, presetSaveVariableInfo);
        return presetSaveVariableInfo;
    }

    function getPresetVariableSourceText(source) {
        if (source === "external") return "外部变量";
        if (source === "internal") return "内部变量";
        return "未识别";
    }

    function ensurePresetSaveVariablePanel() {
        if (presetSaveVariablePanelEl && presetSaveVariablePanelEl.isConnected) return presetSaveVariablePanelEl;
        const panel = presetSaveModal?.querySelector?.(".preset-save-panel") || document.querySelector(".preset-save-panel");
        if (!panel) return null;
        const el = document.createElement("div");
        el.id = "presetSaveVariableDefaults";
        el.className = "preset-variable-panel hidden";
        const originPanel = panel.querySelector(".preset-origin-panel");
        if (originPanel && originPanel.parentNode) originPanel.insertAdjacentElement("afterend", el);
        else panel.appendChild(el);
        presetSaveVariablePanelEl = el;
        return el;
    }

    function updatePresetVariableValue(values, entry, value) {
        if (!values || !entry) return;
        const name = normalizeContextIdentifier(entry.name);
        if (!name) return;
        if (entry.type === "vector") {
            if (!values.vector) values.vector = {};
            values.vector[name] = normalizePointValue(value);
        } else {
            if (!values.scalar) values.scalar = {};
            values.scalar[name] = normalizePresetScalarVariableValue(value, "");
        }
    }

    function getPresetVariableInputNavControls(host) {
        if (!host) return [];
        return Array.from(host.querySelectorAll("input.input"))
            .filter((el) => el instanceof HTMLInputElement && !el.disabled && !el.hidden && el.offsetParent !== null);
    }

    function handlePresetVariableInputNavigation(key, input, options = {}) {
        const host = options.host || null;
        const controls = getPresetVariableInputNavControls(host);
        if (!controls.length) return;
        const current = input instanceof HTMLInputElement ? input : document.activeElement;
        const idx = Math.max(0, controls.indexOf(current));
        const lastIndex = controls.length - 1;
        const focusAt = (index) => {
            const target = controls[Math.max(0, Math.min(lastIndex, index))];
            if (!target) return;
            target.focus();
            target.select?.();
        };
        if (key === "ArrowUp") {
            focusAt(idx <= 0 ? 0 : idx - 1);
            return;
        }
        if (key === "ArrowDown") {
            focusAt(idx >= lastIndex ? lastIndex : idx + 1);
            return;
        }
        if (key === "Enter") {
            if (idx < lastIndex) {
                focusAt(idx + 1);
                return;
            }
            if (typeof options.onLastEnter === "function") options.onLastEnter();
        }
    }

    function bindPresetVariableInputNavigation(host, options = {}) {
        if (!host || host.__pbPresetInputNavBound) return;
        host.__pbPresetInputNavBound = true;
        host.addEventListener("keydown", (ev) => {
            if (ev.defaultPrevented) return;
            const target = ev.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.dataset?.pbModalInputNavSelf === "1") return;
            if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown" && ev.key !== "Enter") return;
            ev.preventDefault();
            handlePresetVariableInputNavigation(ev.key, target, Object.assign({}, options, { host }));
        });
    }

    function focusFirstPresetVariableInput(host) {
        requestAnimationFrame(() => {
            const first = getPresetVariableInputNavControls(host)[0];
            if (!first) return;
            first.focus();
            first.select?.();
        });
    }

    function renderPresetVariableRows(host, info, values, options = {}) {
        if (!host) return;
        const normalized = normalizePresetVariableInfoForStorage(info);
        const entries = getPresetVariableEntries(normalized);
        host.innerHTML = "";
        host.classList.toggle("hidden", !entries.length);
        if (!entries.length) return;

        const allowVariableRefs = !!options.allowVariableRefs;
        const notifyChange = () => {
            if (typeof options.onChange === "function") options.onChange();
        };
        const variableCatalog = options.variableCatalog || (typeof getVariableCatalog === "function" ? getVariableCatalog() : { scalar: new Map(), vector: new Map() });
        const applyState = options.applyState || null;
        if (applyState) {
            if (!applyState.modes) applyState.modes = { scalar: {}, vector: {} };
            if (!applyState.refs) applyState.refs = { scalar: {}, vector: {} };
        }

        const title = document.createElement("div");
        title.className = "preset-variable-title";
        title.textContent = options.title || "变量默认值";
        host.appendChild(title);

        const list = document.createElement("div");
        list.className = "preset-variable-list";
        host.appendChild(list);

        const resolveCatalogEntry = (type, refName) => {
            const map = type === "vector" ? variableCatalog.vector : variableCatalog.scalar;
            if (!map || typeof map.get !== "function") return null;
            return map.get(normalizeContextIdentifier(refName)) || null;
        };
        const resolveCatalogValue = (type, refName) => {
            const found = resolveCatalogEntry(type, refName);
            if (!found) return null;
            return type === "vector"
                ? normalizePointValue(found.value)
                : (Number.isFinite(Number(found.value)) ? Number(found.value) : 0);
        };
        const getMode = (type, name) => {
            if (!applyState || !applyState.modes || !applyState.modes[type]) return "manual";
            return applyState.modes[type][name] === "reference" ? "reference" : "manual";
        };
        const setMode = (type, name, mode) => {
            if (!applyState) return;
            if (!applyState.modes[type]) applyState.modes[type] = {};
            if (!applyState.refs[type]) applyState.refs[type] = {};
            applyState.modes[type][name] = mode === "reference" ? "reference" : "manual";
            if (mode !== "reference") delete applyState.refs[type][name];
        };
        const getRefName = (type, name) => {
            if (!applyState || !applyState.refs || !applyState.refs[type]) return "";
            return String(applyState.refs[type][name] || "");
        };
        const setRefName = (type, name, refName) => {
            if (!applyState) return;
            if (!applyState.refs[type]) applyState.refs[type] = {};
            const clean = normalizeContextIdentifier(refName);
            if (clean) applyState.refs[type][name] = clean;
            else delete applyState.refs[type][name];
        };
        const catalogEntriesForType = (type) => {
            const map = type === "vector" ? variableCatalog.vector : variableCatalog.scalar;
            if (!map || typeof map.values !== "function") return [];
            return Array.from(map.values()).sort((a, b) => {
                const aSrc = a?.source === "external" ? 1 : 0;
                const bSrc = b?.source === "external" ? 1 : 0;
                if (aSrc !== bSrc) return aSrc - bSrc;
                return String(a?.label || a?.name || "").localeCompare(String(b?.label || b?.name || ""));
            });
        };

        for (const entry of entries) {
            const name = normalizeContextIdentifier(entry.name);
            if (!name) continue;
            const row = document.createElement("div");
            row.className = `preset-variable-row ${entry.type === "vector" ? "vector" : "scalar"}`;

            let activeMode = allowVariableRefs ? getMode(entry.type, name) : "manual";
            const catalogEntries = allowVariableRefs ? catalogEntriesForType(entry.type) : [];
            let currentRefName = allowVariableRefs ? getRefName(entry.type, name) : "";
            if (allowVariableRefs && activeMode === "reference" && !currentRefName && catalogEntries.length) {
                currentRefName = normalizeContextIdentifier(catalogEntries[0]?.name || "");
                setRefName(entry.type, name, currentRefName);
            }

            const label = document.createElement("div");
            label.className = "preset-variable-label";
            const labelName = document.createElement("span");
            labelName.className = "preset-variable-name";
            labelName.textContent = name;
            const labelMeta = document.createElement("span");
            labelMeta.className = "preset-variable-meta";
            labelMeta.textContent = `${getPresetVariableSourceText(entry.source)} / ${entry.type === "vector" ? "Vec3" : "数值"}`;
            label.append(labelName, labelMeta);

            let modeSelect = null;
            if (allowVariableRefs) {
                modeSelect = document.createElement("select");
                modeSelect.className = "input preset-variable-mode-select";
                const manualOption = document.createElement("option");
                manualOption.value = "manual";
                manualOption.textContent = "手动输入";
                const referenceOption = document.createElement("option");
                referenceOption.value = "reference";
                referenceOption.textContent = "引用变量";
                referenceOption.disabled = !catalogEntries.length;
                modeSelect.append(manualOption, referenceOption);
                modeSelect.value = activeMode;
                modeSelect.disabled = !catalogEntries.length;
            }

            const valueStack = document.createElement("div");
            valueStack.className = "preset-variable-value-stack";
            if (modeSelect) {
                row.classList.add("with-input-mode");
                const controls = document.createElement("div");
                controls.className = "preset-variable-controls";
                const modeField = document.createElement("div");
                modeField.className = "preset-variable-field preset-variable-mode-field";
                const modeLabel = document.createElement("span");
                modeLabel.className = "preset-variable-field-label";
                modeLabel.textContent = "输入类型";
                modeField.append(modeLabel, modeSelect);
                const valueField = document.createElement("div");
                valueField.className = "preset-variable-field preset-variable-input-field";
                const valueLabel = document.createElement("span");
                valueLabel.className = "preset-variable-field-label";
                valueLabel.textContent = "输入参数";
                valueField.append(valueLabel, valueStack);
                controls.append(modeField, valueField);
                row.append(label, controls);
            } else {
                row.append(label, valueStack);
            }

            const manualRow = document.createElement("div");
            manualRow.className = `preset-variable-manual-row ${entry.type === "vector" ? "vector" : "scalar"}`;
            let scalarInput = null;
            let vectorInputs = null;
            let pickBtn = null;
            let refRow = null;
            let refSelect = null;
            const syncManualScalar = () => {
                if (!scalarInput) return;
                const text = String(scalarInput.value ?? "").trim();
                if (!text || /^[+-]?(?:\.|\d+\.|\d+(?:\.\d+)?[eE][+-]?)$/.test(text)) return;
                updatePresetVariableValue(values, entry, scalarInput.value);
                notifyChange();
            };
            const syncManualVector = () => {
                if (!vectorInputs || vectorInputs.length < 3) return;
                const next = normalizePointValue({
                    x: vectorInputs[0]?.value,
                    y: vectorInputs[1]?.value,
                    z: vectorInputs[2]?.value
                });
                updatePresetVariableValue(values, entry, next);
                notifyChange();
            };
            const applyReferenceValue = (refName) => {
                const resolved = resolveCatalogValue(entry.type, refName);
                if (resolved === null || resolved === undefined) return false;
                updatePresetVariableValue(values, entry, resolved);
                notifyChange();
                return true;
            };

            if (entry.type === "vector") {
                const current = normalizePointValue(values?.vector?.[name]);
                const coords = document.createElement("div");
                coords.className = "preset-variable-vec-inputs";
                vectorInputs = ["x", "y", "z"].map((axis) => {
                    const input = document.createElement("input");
                    input.className = "input";
                    input.type = "text";
                    input.inputMode = "decimal";
                    input.step = "0.01";
                    input.placeholder = axis;
                    input.value = String(current[axis]);
                    input.addEventListener("input", () => {
                        syncManualVector();
                    });
                    coords.appendChild(input);
                    return input;
                });
                pickBtn = document.createElement("button");
                pickBtn.type = "button";
                pickBtn.className = "btn icon preset-variable-pick";
                pickBtn.title = `拾取 ${name}`;
                pickBtn.setAttribute("aria-label", `拾取 ${name}`);
                pickBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.6 6-11a6 6 0 0 0-12 0c0 5.4 6 11 6 11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
                pickBtn.addEventListener("click", () => {
                    if (typeof options.onPickVector === "function") {
                        options.onPickVector(entry, (point) => {
                            const p = normalizePointValue(point);
                            updatePresetVariableValue(values, entry, p);
                            notifyChange();
                            if (vectorInputs && vectorInputs.length >= 3) {
                                vectorInputs[0].value = String(p.x);
                                vectorInputs[1].value = String(p.y);
                                vectorInputs[2].value = String(p.z);
                            }
                        });
                    }
                });
            } else {
                const current = normalizePresetScalarVariableValue(values?.scalar?.[name]);
                const onScalarInput = (nextValue) => {
                    const text = String(nextValue ?? "").trim();
                    if (!text || /^[+-]?(?:\.|\d+\.|\d+(?:\.\d+)?[eE][+-]?)$/.test(text)) return;
                    updatePresetVariableValue(values, entry, nextValue);
                    notifyChange();
                };
                if (typeof inputNum === "function") {
                    scalarInput = inputNum(current, onScalarInput, {
                        modalNavigation: !!options.modalNavigation,
                        commitOnChange: !!options.commitOnChange,
                        onNavigate: (key, input) => handlePresetVariableInputNavigation(key, input, {
                            host,
                            onLastEnter: options.onLastEnter
                        })
                    });
                } else {
                    scalarInput = document.createElement("input");
                    scalarInput.className = "input";
                    scalarInput.type = "text";
                    scalarInput.inputMode = "decimal";
                    scalarInput.step = "0.01";
                    scalarInput.value = String(current);
                    scalarInput.addEventListener("input", () => onScalarInput(scalarInput.value));
                }
            }

            if (allowVariableRefs) {
                refRow = document.createElement("div");
                refRow.className = "preset-variable-ref-row";
                const refLabel = document.createElement("span");
                refLabel.className = "preset-variable-meta";
                refLabel.textContent = "引用变量";
                refSelect = document.createElement("select");
                refSelect.className = "input preset-variable-ref-select";
                const emptyOpt = document.createElement("option");
                emptyOpt.value = "";
                emptyOpt.textContent = catalogEntries.length ? "选择变量" : "暂无可引用变量";
                refSelect.appendChild(emptyOpt);
                for (const catalogEntry of catalogEntries) {
                    const opt = document.createElement("option");
                    opt.value = normalizeContextIdentifier(catalogEntry?.name || "");
                    const sourceTag = catalogEntry?.source === "external" ? "（外部）" : "（本地）";
                    opt.textContent = `${catalogEntry?.label || catalogEntry?.name || ""}${sourceTag}`;
                    refSelect.appendChild(opt);
                }
                refSelect.value = currentRefName && catalogEntries.some((it) => normalizeContextIdentifier(it?.name || "") === currentRefName)
                    ? currentRefName
                    : "";
                refSelect.disabled = !catalogEntries.length;
                refSelect.addEventListener("change", () => {
                    const nextRef = normalizeContextIdentifier(refSelect.value || "");
                    setRefName(entry.type, name, nextRef);
                    if (!applyReferenceValue(nextRef) && catalogEntries.length) {
                        refSelect.value = normalizeContextIdentifier(catalogEntries[0]?.name || "");
                        setRefName(entry.type, name, refSelect.value);
                        applyReferenceValue(refSelect.value);
                    }
                });
                refRow.append(refLabel, refSelect);
                refRow.hidden = activeMode !== "reference";

                modeSelect?.addEventListener("change", () => {
                    activeMode = modeSelect.value === "reference" && catalogEntries.length ? "reference" : "manual";
                    setMode(entry.type, name, activeMode);
                    manualRow.hidden = activeMode === "reference";
                    refRow.hidden = activeMode !== "reference";
                    if (activeMode === "reference") {
                        if (!refSelect.value && catalogEntries.length) refSelect.value = normalizeContextIdentifier(catalogEntries[0]?.name || "");
                        setRefName(entry.type, name, refSelect.value);
                        if (!applyReferenceValue(refSelect.value) && catalogEntries.length) {
                            refSelect.value = normalizeContextIdentifier(catalogEntries[0]?.name || "");
                            setRefName(entry.type, name, refSelect.value);
                            applyReferenceValue(refSelect.value);
                        }
                    } else {
                        setRefName(entry.type, name, "");
                        if (entry.type === "vector") syncManualVector();
                        else syncManualScalar();
                    }
                });
            }

            if (entry.type === "vector") {
                const manualRowWrap = document.createElement("div");
                manualRowWrap.className = "preset-variable-manual-row vector";
                const coords = document.createElement("div");
                coords.className = "preset-variable-vec-inputs";
                coords.appendChild(vectorInputs[0].parentElement || vectorInputs[0]);
                coords.appendChild(vectorInputs[1].parentElement || vectorInputs[1]);
                coords.appendChild(vectorInputs[2].parentElement || vectorInputs[2]);
                manualRowWrap.append(coords, pickBtn);
                manualRow.hidden = allowVariableRefs && activeMode === "reference";
                manualRow.appendChild(manualRowWrap);
            } else {
                const manualRowWrap = document.createElement("div");
                manualRowWrap.className = "preset-variable-manual-row scalar";
                manualRowWrap.appendChild(scalarInput);
                manualRow.hidden = allowVariableRefs && activeMode === "reference";
                manualRow.appendChild(manualRowWrap);
            }

            valueStack.appendChild(manualRow);
            if (refRow) valueStack.appendChild(refRow);
            list.appendChild(row);
        }
    }

    function renderPresetSaveVariableDefaults() {
        const host = ensurePresetSaveVariablePanel();
        if (!host) return;
        refreshPresetSaveVariableInfoForSource({ preserveInputs: true });
        if (!presetSaveVariableInfo) {
            host.innerHTML = "";
            host.classList.add("hidden");
            return;
        }
        const values = getPresetVariableDefaultValues(presetSaveVariableInfo);
        presetSaveVariableInfo.inputs = values;
        const beginVectorPick = (entry, setValue) => {
            hidePresetSaveDialog();
            startPointPick({
                label: `拾取变量 ${entry.name}`,
                onPick: (point) => {
                    showPresetSaveDialog();
                    setValue(point);
                    requestAnimationFrame(() => {
                        renderPresetVariableRows(host, presetSaveVariableInfo, presetSaveVariableInfo.inputs, {
                            title: "保存时使用的变量默认值",
                            modalNavigation: true,
                            onLastEnter: () => btnPresetSaveCurrent?.click(),
                            onPickVector: beginVectorPick
                        });
                        bindPresetVariableInputNavigation(host, {
                            onLastEnter: () => btnPresetSaveCurrent?.click()
                        });
                    });
                    showToast(`已拾取变量：${entry.name}`, "success");
                }
            });
        };
        renderPresetVariableRows(host, presetSaveVariableInfo, presetSaveVariableInfo.inputs, {
            title: "保存时使用的变量默认值",
            modalNavigation: true,
            onLastEnter: () => btnPresetSaveCurrent?.click(),
            onPickVector: beginVectorPick
        });
        bindPresetVariableInputNavigation(host, {
            onLastEnter: () => btnPresetSaveCurrent?.click()
        });
    }

    function escapeRegExp(text) {
        return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function formatPresetVariableNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? String(Number(n.toFixed(10))) : "0";
    }

    function isSimplePresetScalarExpression(value) {
        const text = String(value || "").trim();
        if (!text) return false;
        if (isNumericLiteral(text) || isIdentifier(text)) return true;
        return /^[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(text);
    }

    function formatPresetScalarReplacement(value) {
        const normalized = normalizePresetScalarVariableValue(value);
        if (typeof normalized === "number") return formatPresetVariableNumber(normalized);
        const text = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(normalized || "").trim()));
        if (!text) return "0";
        const n = Number(text);
        if (Number.isFinite(n) && isNumericLiteral(text)) return formatPresetVariableNumber(n);
        if (isSimplePresetScalarExpression(text)) return text.replace(/\s+/g, "");
        return `(${text})`;
    }

    function replaceScalarIdentifierWithText(expr, name, replacement) {
        const safe = escapeRegExp(name);
        if (!safe) return expr;
        const re = new RegExp(`(^|[^A-Za-z0-9_$])(${safe})(?![A-Za-z0-9_$.])`, "g");
        return String(expr || "").replace(re, (_match, prefix) => `${prefix}${replacement}`);
    }

    function replaceScalarIdentifier(expr, name, value) {
        return replaceScalarIdentifierWithText(expr, name, formatPresetScalarReplacement(value));
    }

    function replaceVectorComponent(expr, name, value) {
        const cleanName = normalizeContextIdentifier(name);
        if (!cleanName) return expr;
        const vec = normalizePointValue(value);
        return String(expr || "").replace(
            /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*([xyz])\b/g,
            (match, base, axis) => normalizeContextIdentifier(base) === cleanName
                ? formatPresetVariableNumber(vec[axis])
                : match
        );
    }

    function canFoldPresetNumericExpression(expr) {
        const text = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(expr || "").trim()));
        if (!text) return false;
        if (isNumericLiteral(text)) return true;
        const tokenRe = /[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)?/g;
        let match;
        while ((match = tokenRe.exec(text))) {
            const token = String(match[0] || "").replace(/\s+/g, "");
            const base = normalizeContextIdentifier(token.split(".")[0]);
            if (!base) continue;
            if (base === "PI" || base === "Math") continue;
            return false;
        }
        return /[+\-*/()%]/.test(text) || /\bMath\s*\./.test(text);
    }

    function foldPresetNumericExpression(expr) {
        if (!canFoldPresetNumericExpression(expr)) return expr;
        const n = evaluateExpressionWithMap(expr, { PI: Math.PI });
        return Number.isFinite(n) ? formatPresetVariableNumber(n) : expr;
    }

    function applyPresetVariableValueToParam(value, scalarEntries, vectorEntries) {
        if (typeof value === "string") {
            const before = stripNumericSuffix(transpileKotlinThisQualifierToJs(value));
            let next = before;
            for (const [name, vec] of vectorEntries) next = replaceVectorComponent(next, name, vec);
            const placeholders = [];
            scalarEntries.forEach(([name, scalar], index) => {
                const token = `__PB_PRESET_SCALAR_${index}__`;
                placeholders.push([token, formatPresetScalarReplacement(scalar)]);
                next = replaceScalarIdentifierWithText(next, name, token);
            });
            for (const [token, replacement] of placeholders) {
                next = next.replaceAll(token, replacement);
            }
            return next !== before ? foldPresetNumericExpression(next) : next;
        }
        if (Array.isArray(value)) {
            return value.map((item) => applyPresetVariableValueToParam(item, scalarEntries, vectorEntries));
        }
        if (value && typeof value === "object") {
            const out = {};
            for (const [childKey, childValue] of Object.entries(value)) {
                out[childKey] = applyPresetVariableValueToParam(childValue, scalarEntries, vectorEntries);
            }
            return out;
        }
        return value;
    }

    function applyPresetScalarParamKeyValue(params, key, value, variableValues) {
        const name = normalizeContextIdentifier(key);
        if (!name || !Object.prototype.hasOwnProperty.call(variableValues.scalar || {}, name)) return false;
        const raw = stripNumericSuffix(transpileKotlinThisQualifierToJs(String(value ?? "").trim()));
        if (raw && raw !== name) return false;
        params[key] = formatPresetScalarReplacement(variableValues.scalar[name]);
        return true;
    }

    function getVectorAliasPrefixForNode(node, key) {
        const keyText = String(key || "").trim();
        if (!keyText) return "";
        switch (node?.kind) {
            case "add_bezier_4":
                if (keyText === "start") return "s";
                if (keyText === "end") return "e";
                if (keyText === "startHandle") return "sh";
                if (keyText === "endHandle") return "eh";
                break;
            case "add_bezier_curve":
                if (keyText === "target" || keyText === "end") return "e";
                if (keyText === "startHandle") return "sh";
                if (keyText === "endHandle") return "eh";
                break;
            case "add_bezier":
            case "add_broken_line":
                if (keyText === "p1" || keyText === "p2" || keyText === "p3") return keyText;
                break;
            default:
                break;
        }
        return "";
    }

    function applyPresetVectorAliasValue(node, params, key, value, variableValues) {
        if (typeof value !== "string") return false;
        const ref = normalizeContextIdentifier(value);
        if (!ref) return false;
        const vec = variableValues.vector?.[ref];
        if (!vec) return false;
        const next = {
            x: formatPresetVariableNumber(vec.x),
            y: formatPresetVariableNumber(vec.y),
            z: formatPresetVariableNumber(vec.z)
        };
        const prefix = getVectorAliasPrefixForNode(node, key);
        if (prefix) {
            params[`__pb_vec_mode_${prefix}`] = "manual";
            params[`__pb_vec_var_${prefix}`] = "";
            params[`${prefix}x`] = next.x;
            params[`${prefix}y`] = next.y;
            params[`${prefix}z`] = next.z;
        }
        params[key] = next;
        return true;
    }

    function applyPresetVariableValuesToChildren(children, values) {
        const variableValues = clonePresetVariableValues(values);
        const scalarEntries = Object.entries(variableValues.scalar || {});
        const vectorEntries = Object.entries(variableValues.vector || {});
        const walk = (node) => {
            if (!node || typeof node !== "object") return;
            const p = node.params || {};
            for (const [key, value] of Object.entries(p)) {
                const keyText = String(key || "");
                if (keyText.startsWith("__pb_vec_var_")) {
                    const ref = normalizeContextIdentifier(value);
                    const vec = ref ? variableValues.vector?.[ref] : null;
                    if (vec) {
                        const prefix = keyText.slice("__pb_vec_var_".length);
                        p[`__pb_vec_mode_${prefix}`] = "manual";
                        p[keyText] = "";
                        p[`${prefix}x`] = formatPresetVariableNumber(vec.x);
                        p[`${prefix}y`] = formatPresetVariableNumber(vec.y);
                        p[`${prefix}z`] = formatPresetVariableNumber(vec.z);
                    }
                    continue;
                }
                if (applyPresetScalarParamKeyValue(p, key, value, variableValues)) continue;
                if (applyPresetVectorAliasValue(node, p, key, value, variableValues)) continue;
                p[key] = applyPresetVariableValueToParam(value, scalarEntries, vectorEntries);
            }
            syncPresetLegacyParamAliases(node);
            if (Array.isArray(node.children)) node.children.forEach(walk);
        };
        (Array.isArray(children) ? children : []).forEach(walk);
        return children;
    }

    function clonePresetWithVariableValues(preset, values) {
        const normalized = normalizePresetList([preset])[0];
        if (!normalized) return null;
        const children = deepCloneJson(normalized.children || []) || [];
        applyPresetVariableValuesToChildren(children, values);
        return Object.assign({}, normalized, {
            children,
            variables: null,
            __pbVariablesResolved: true
        });
    }

    function ensurePresetApplyVariableModal() {
        let mask = document.getElementById("presetVariableMask");
        let modal = document.getElementById("presetVariableModal");
        if (mask && modal) return { mask, modal };
        mask = document.createElement("div");
        mask.id = "presetVariableMask";
        mask.className = "modal-mask hidden";
        modal = document.createElement("div");
        modal.id = "presetVariableModal";
        modal.className = "modal hidden preset-variable-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.innerHTML = `
            <div class="modal-head">
                <div class="modal-title">应用预设变量</div>
                <button id="btnClosePresetVariables" class="btn icon" type="button" aria-label="关闭">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
                </button>
            </div>
            <div class="modal-body">
                <div id="presetVariableHost" class="preset-variable-panel hidden"></div>
            </div>
            <div class="modal-foot preset-variable-foot">
                <button id="btnCancelPresetVariables" class="btn" type="button">取消</button>
                <span style="flex:1 1 auto;"></span>
                <button id="btnApplyPresetVariables" class="btn primary" type="button">继续</button>
            </div>`;
        document.body.append(mask, modal);
        return { mask, modal };
    }

    function openPresetVariableApplyDialog(preset) {
        const variableInfo = normalizePresetVariableInfoForStorage(preset?.variables);
        const entries = getPresetVariableEntries(variableInfo);
        if (!entries.length) return Promise.resolve(getPresetVariableDefaultValues(variableInfo));
        const { mask, modal } = ensurePresetApplyVariableModal();
        const host = modal.querySelector("#presetVariableHost");
        const title = modal.querySelector(".modal-title");
        if (title) title.textContent = `应用预设变量：${preset?.name || "未命名预设"}`;
        const values = getPresetVariableDefaultValues(variableInfo);

        return new Promise((resolve) => {
            let settled = false;
            const close = (result) => {
                if (settled) return;
                settled = true;
                mask.classList.add("hidden");
                modal.classList.add("hidden");
                resolve(result);
            };
            const rerender = () => {
                renderPresetVariableRows(host, variableInfo, values, {
                    title: "输入本次应用的变量值",
                    modalNavigation: true,
                    onLastEnter: () => modal.querySelector("#btnApplyPresetVariables")?.click(),
                    onPickVector: (entry, setValue) => {
                        mask.classList.add("hidden");
                        modal.classList.add("hidden");
                        startPointPick({
                            label: `拾取变量 ${entry.name}`,
                            onPick: (point) => {
                                setValue(point);
                                mask.classList.remove("hidden");
                                modal.classList.remove("hidden");
                                rerender();
                                showToast(`已拾取变量：${entry.name}`, "success");
                            }
                        });
                    }
                });
                bindPresetVariableInputNavigation(host, {
                    onLastEnter: () => modal.querySelector("#btnApplyPresetVariables")?.click()
                });
            };
            modal.querySelector("#btnClosePresetVariables").onclick = () => close(null);
            modal.querySelector("#btnCancelPresetVariables").onclick = () => close(null);
            modal.querySelector("#btnApplyPresetVariables").onclick = () => close(clonePresetVariableValues(values));
            mask.onclick = () => close(null);
            rerender();
            mask.classList.remove("hidden");
            modal.classList.remove("hidden");
            focusFirstPresetVariableInput(host);
        });
    }

    async function resolvePresetForApply(preset) {
        const normalized = normalizePresetList([preset])[0];
        if (!normalized) return null;
        const variableInfo = getPresetEffectiveVariableInfo(normalized);
        if (!getPresetVariableEntries(variableInfo).length) return normalized;
        const presetWithVariables = Object.assign({}, normalized, { variables: variableInfo });
        const values = await openPresetVariableApplyDialog(presetWithVariables);
        if (!values) return null;
        return clonePresetWithVariableValues(presetWithVariables, values);
    }

    function fillPresetForm(preset = null) {
        const p = preset ? normalizePresetList([preset])[0] : null;
        updatePresetGroupList();
        if (presetNameInput) {
            presetNameInput.value = p?.name || projectName || `预设${presetList.length + 1}`;
            presetNameInput.select?.();
        }
        if (presetGroupInput) presetGroupInput.value = getPresetGroupLabel(p?.group || presetGroupInput.value || DEFAULT_PRESET_GROUP);
        setPresetOriginInputs(p?.origin || getPresetOriginFallback());
        renderPresetSaveVariableDefaults();
    }

    function showPresetSaveDialog() {
        if (!presetSaveModal || !presetSaveMask) return false;
        presetSaveModal.classList.remove("hidden");
        presetSaveMask.classList.remove("hidden");
        return true;
    }

    function hidePresetSaveDialog() {
        presetSaveModal?.classList.add("hidden");
        presetSaveMask?.classList.add("hidden");
    }

    function openPresetPanel(mode = "list", options = {}) {
        if (mode === "save") {
            const overwritePreset = options.overwritePreset
                ? normalizePresetList([options.overwritePreset])[0] || null
                : null;
            presetSaveOverwriteTarget = overwritePreset;
            if (Array.isArray(options.children)) {
                presetSaveSourceChildren = deepCloneJson(options.children) || [];
                presetSaveSourceLabel = options.label || `${presetSaveSourceChildren.length} 张选中卡片`;
            } else if (Array.isArray(options.sourceIds)) {
                setPresetSaveSourceFromIds(options.sourceIds);
            } else {
                presetSaveSourceChildren = null;
                presetSaveSourceLabel = "全部卡片";
            }
            presetSaveVariableInfo = overwritePreset?.variables
                ? normalizePresetVariableInfoForStorage(overwritePreset.variables)
                : null;
            if (showPresetSaveDialog()) {
                requestAnimationFrame(() => {
                    fillPresetForm(overwritePreset);
                    if (presetNameInput) presetNameInput.focus();
                });
                return;
            }
        }
        setRightPanelPage("presets");
        requestAnimationFrame(() => {
            if (mode === "save" || (presetNameInput && !presetNameInput.value.trim())) fillPresetForm();
            if (mode === "save" && presetNameInput) presetNameInput.focus();
        });
    }

    function savePresetFromPanel(overwritePreset = null) {
        if (!presetNameInput) return null;
        const name = String(presetNameInput.value || projectName || `预设${presetList.length + 1}`).trim() || "未命名预设";
        const group = getPresetGroupLabel(presetGroupInput?.value || DEFAULT_PRESET_GROUP);
        const origin = readPresetOriginInputs();
        const overwrite = overwritePreset || presetSaveOverwriteTarget || presetList.find((it) => (
            it.name === name && getPresetGroupLabel(it.group) === group
        ));
        const variableInfo = refreshPresetSaveVariableInfoForSource({ preserveInputs: true });
        const preset = saveCurrentAsPreset({
            name,
            group,
            origin,
            children: presetSaveSourceChildren || undefined,
            variables: variableInfo,
            overwriteId: overwrite ? overwrite.id : ""
        });
        if (preset) {
            presetSaveSourceChildren = null;
            presetSaveSourceLabel = "";
            presetSaveVariableInfo = null;
            presetSaveOverwriteTarget = null;
            fillPresetForm(preset);
            hidePresetSaveDialog();
        }
        return preset;
    }

    function beginPresetGroupRename(oldGroup) {
        const from = getPresetGroupLabel(oldGroup);
        if (isDefaultPresetGroup(from)) return;
        if (!from) return;
        presetGroupEditState = { group: from, value: getPresetGroupLeaf(from) };
        presetItemEditState = null;
        schedulePresetLibraryRender();
    }

    function commitPresetGroupRename(oldGroup, rawValue) {
        const from = getPresetGroupLabel(oldGroup);
        if (isDefaultPresetGroup(from)) {
            presetGroupEditState = null;
            schedulePresetLibraryRender();
            return;
        }
        const rawTo = getPresetGroupLabel(rawValue);
        const parent = getPresetParentGroup(from);
        const to = parent && rawTo && !rawTo.includes("/") ? `${parent}/${rawTo}` : rawTo;
        if (!to || to === from) {
            presetGroupEditState = null;
            schedulePresetLibraryRender();
            return;
        }
        const fromPrefix = `${from}/`;
        presetList = presetList.map((preset) => (
            getPresetGroupLabel(preset.group) === from || getPresetGroupLabel(preset.group).startsWith(fromPrefix)
                ? Object.assign({}, preset, { group: `${to}${getPresetGroupLabel(preset.group).slice(from.length)}`, updatedAt: Date.now() })
                : preset
        ));
        presetGroups = dedupePresetGroups(presetGroups.map((group) => (
            getPresetGroupLabel(group) === from || getPresetGroupLabel(group).startsWith(fromPrefix)
                ? `${to}${getPresetGroupLabel(group).slice(from.length)}`
                : group
        )).concat(to));
        if (presetCollapsedGroups.has(from)) {
            presetCollapsedGroups.delete(from);
            presetCollapsedGroups.add(to);
        }
        presetGroupEditState = null;
        persistPresetList();
    }

    function beginPresetItemRename(preset) {
        if (!preset) return;
        presetItemEditState = { id: preset.id, value: preset.name || "" };
        presetGroupEditState = null;
        schedulePresetLibraryRender();
    }

    function beginPresetItemRenameById(id) {
        const preset = presetList.find((it) => it && it.id === id);
        if (!preset) return false;
        beginPresetItemRename(preset);
        return true;
    }

    function commitPresetItemRename(id, rawValue) {
        const preset = presetList.find((it) => it.id === id);
        if (!preset) {
            presetItemEditState = null;
            schedulePresetLibraryRender();
            return;
        }
        const nextName = String(rawValue ?? "").trim() || preset.name || "未命名预设";
        if (nextName === preset.name) {
            presetItemEditState = null;
            schedulePresetLibraryRender();
            return;
        }
        presetItemEditState = null;
        updatePresetMeta(id, { name: nextName });
    }

    function renamePresetGroup(oldGroup) {
        beginPresetGroupRename(oldGroup);
    }

    function deletePresetGroup(oldGroup) {
        const group = getPresetGroupLabel(oldGroup);
        if (!group || isDefaultPresetGroup(group)) return false;
        const groupPrefix = `${group}/`;
        const count = presetList.filter((preset) => getPresetGroupLabel(preset.group) === group || getPresetGroupLabel(preset.group).startsWith(groupPrefix)).length;
        if (count && !confirm(`删除分组“${group}”？其中 ${count} 个预设会移动到“${DEFAULT_PRESET_GROUP}”。`)) return false;
        presetList = presetList.map((preset) => (
            getPresetGroupLabel(preset.group) === group || getPresetGroupLabel(preset.group).startsWith(groupPrefix)
                ? Object.assign({}, preset, { group: DEFAULT_PRESET_GROUP, updatedAt: Date.now() })
                : preset
        ));
        presetGroups = dedupePresetGroups(presetGroups.filter((it) => {
            const label = getPresetGroupLabel(it);
            return label !== group && !label.startsWith(groupPrefix);
        }));
        if (presetGroupInput && getPresetGroupLabel(presetGroupInput.value) === group) {
            presetGroupInput.value = DEFAULT_PRESET_GROUP;
        }
        persistPresetGroups();
        persistPresetList();
        showToast(`已删除分组：${group}`, "success");
        return true;
    }

    function updatePresetMeta(id, patch) {
        const idx = presetList.findIndex((it) => it.id === id);
        if (idx < 0) return null;
        presetList[idx] = Object.assign({}, presetList[idx], patch || {}, { updatedAt: Date.now() });
        persistPresetList();
        return presetList[idx];
    }

    function deletePresetById(id) {
        const preset = presetList.find((it) => it.id === id);
        if (!preset) return false;
        presetList = presetList.filter((it) => it.id !== id);
        persistPresetList();
        return true;
    }

    async function startPresetPick(preset) {
        if (!preset || typeof startPointPick !== "function") return;
        const resolvedPreset = await resolvePresetForApply(preset);
        if (!resolvedPreset) return;
        const onPickPreset = (point, options = {}) => {
            const result = applyPresetAtPoint(resolvedPreset, point, { startRotate: !!options.rotateAfterPick });
            const ok = !!(result && result.ok !== false);
            clearPresetPreview();
            showToast(ok ? `已生成预设：${resolvedPreset.name}` : "生成预设失败", ok ? "success" : "error");
        };
        onPickPreset.__presetPreview = resolvedPreset;
        const initialAnchor = pointPickHoverPoint || lastPickMappedPoint || lastPickBasePoint || null;
        previewPreset(resolvedPreset, initialAnchor);
        startPointPick({
            label: `预设 ${resolvedPreset.name || ""}`.trim(),
            onPick: onPickPreset
        });
    }

    function startPresetPickById(presetId) {
        const preset = getPresetList().find((it) => it && it.id === presetId);
        if (!preset) return false;
        startPresetPick(preset);
        return true;
    }

    function applyPresetFromLibrary(preset) {
        startPresetPick(preset);
    }

    function openPresetOverwriteDialog(preset) {
        const normalized = normalizePresetList([preset])[0];
        if (!normalized) return false;
        openPresetPanel("save", Object.assign(getCurrentPresetSourceOptions(), {
            overwritePreset: normalized
        }));
        return true;
    }

    function setPresetDragLockPlaneActive(next) {
        const active = next === true;
        if (presetDragLockPlaneKeyDown === active) return;
        presetDragLockPlaneKeyDown = active;
        if (active) {
            presetDragLockPlanePreviousState = lockPlaneActive;
            setLockPlaneActive(true);
        } else if (!presetDragLockPlanePreviousState) {
            setLockPlaneActive(false);
        }
    }

    function clearPresetDragLockPlane() {
        if (presetDragLockPlaneKeyDown) setPresetDragLockPlaneActive(false);
        else if (draggingPresetId && lockPlaneActive) setLockPlaneActive(false);
        presetDragLockPlaneKeyDown = false;
        presetDragLockPlanePreviousState = false;
    }

    function movePresetByDrop(sourceId, targetGroup, beforeId = null) {
        const sourceIndex = presetList.findIndex((it) => it && it.id === sourceId);
        if (sourceIndex < 0) return false;
        const source = presetList.splice(sourceIndex, 1)[0];
        if (!source) return false;
        source.group = getPresetGroupLabel(targetGroup || source.group);
        source.updatedAt = Date.now();
        let insertIndex = presetList.length;
        if (beforeId) {
            const idx = presetList.findIndex((it) => it && it.id === beforeId);
            if (idx >= 0) insertIndex = idx;
        } else {
            for (let i = presetList.length - 1; i >= 0; i--) {
                if (getPresetGroupLabel(presetList[i].group) === source.group) {
                    insertIndex = i + 1;
                    break;
                }
            }
        }
        presetList.splice(insertIndex, 0, source);
        persistPresetList();
        return true;
    }

    function presetFromDragEvent(ev) {
        if (getPresetGroupDragSource(ev)) return null;
        const id = draggingPresetId || (ev && ev.dataTransfer && (
            ev.dataTransfer.getData("application/x-pointsbuilder-preset")
            || ev.dataTransfer.getData("text/plain")
        ));
        return id ? getPresetList().find((it) => it && it.id === id) : null;
    }

    function showPresetDragPlacementStatus(preset, point) {
        if (!point) return;
        const name = String(preset?.name || "未命名预设").trim() || "未命名预设";
        const label = getPlaneInfo().label;
        setLinePickStatus(`${label} 拖放预设[${name}]：指针 (${U.fmt(point.x)}, ${U.fmt(point.y)}, ${U.fmt(point.z)})，松开应用`);
    }

    function clearPresetDragPlacementStatus() {
        if (linePickMode || pointPickMode || offsetMode || rotateMode) return;
        hideLinePickStatus();
    }

    function onPresetCanvasDragOver(ev) {
        const preset = presetFromDragEvent(ev);
        if (!preset) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        const point = getMappedPointFromEvent(ev);
        if (point) {
            hideHoverMarker();
            showPresetDragPointMarker(point);
            showPresetDragPlacementStatus(preset, point);
        } else {
            hidePresetDragPointMarker();
            hideHoverMarker();
            clearPresetDragPlacementStatus();
        }
        previewPreset(preset, point);
    }

    async function onPresetCanvasDrop(ev) {
        const preset = presetFromDragEvent(ev);
        if (!preset) return;
        ev.preventDefault();
        const point = getMappedPointFromEvent(ev);
        if (!point) {
            showToast("没有命中可放置平面", "error");
            clearPresetPreview();
            hidePresetDragPointMarker();
            hideHoverMarker();
            clearPresetDragPlacementStatus();
            clearPresetDragLockPlane();
            return;
        }
        const resolvedPreset = await resolvePresetReferenceForDrop(preset);
        if (!resolvedPreset) {
            clearPresetPreview();
            hidePresetDragPointMarker();
            clearPresetDragPlacementStatus();
            clearPresetDragLockPlane();
            return;
        }
        const result = await applyPresetReferenceAtPoint(resolvedPreset, point, { startRotate: false });
        const ok = !!(result && result.ok !== false);
        clearPresetPreview();
        hidePresetDragPointMarker();
        hideHoverMarker();
        clearPresetDragPlacementStatus();
        clearPresetDragLockPlane();
        showToast(ok ? `已放置预设：${resolvedPreset.name}` : "放置预设失败", ok ? "success" : "error");
    }

    function cleanupPresetPointerDrag(options = {}) {
        const state = presetPointerDragState;
        presetPointerDragState = null;
        if (state && state.sourceEl) state.sourceEl.classList.remove("dragging");
        if (state && state.dragging) presetPointerDragClickSuppressUntil = Date.now() + 220;
        clearPresetDragLockPlane();
        draggingPresetId = "";
        isDraggingCard = false;
        clearPresetPreview();
        hidePresetDragPointMarker();
        hideHoverMarker();
        clearPresetDragPlacementStatus();
        if (!options.keepModal && state && state.hideModalOnStart && typeof hideModal === "function") hideModal();
    }

    function updatePresetPointerDragPreview(ev) {
        const state = presetPointerDragState;
        if (!state || !state.preset) return null;
        const point = getMappedPointFromEvent(ev);
        if (point) {
            hideHoverMarker();
            showPresetDragPointMarker(point);
            showPresetDragPlacementStatus(state.preset, point);
        } else {
            hidePresetDragPointMarker();
            hideHoverMarker();
            clearPresetDragPlacementStatus();
        }
        previewPreset(state.preset, point);
        return point;
    }

    async function finishPresetPointerDrag(ev) {
        const state = presetPointerDragState;
        if (!state || !state.preset) return;
        const point = state.dragging ? updatePresetPointerDragPreview(ev) : null;
        if (!state.dragging) {
            cleanupPresetPointerDrag({ keepModal: true });
            return;
        }
        if (!point) {
            showToast("没有命中可放置平面", "error");
            cleanupPresetPointerDrag();
            return;
        }
        const preset = state.preset;
        cleanupPresetPointerDrag();
        const result = await applyPresetReferenceAtPoint(preset, point, { startRotate: false });
        const ok = !!(result && result.ok !== false);
        showToast(ok ? `已放置实例：${preset.name}` : "放置实例失败", ok ? "success" : "error");
    }

    function bindPresetPointerApplyDrag(el, preset, options = {}) {
        if (!el || !preset || !preset.id) return;
        el.addEventListener("pointerdown", (ev) => {
            if (ev.button !== 0) return;
            const target = ev.target;
            if (target && target.closest && target.closest("button, input, select, textarea, .preset-item-actions, .preset-inline-input")) return;
            presetPointerDragState = {
                preset,
                sourceEl: el,
                pointerId: ev.pointerId,
                startX: ev.clientX,
                startY: ev.clientY,
                dragging: false,
                hideModalOnStart: options.hideModalOnStart === true
            };
            try { el.setPointerCapture?.(ev.pointerId); } catch {}
        });
        el.addEventListener("pointermove", (ev) => {
            const state = presetPointerDragState;
            if (!state || state.sourceEl !== el || state.pointerId !== ev.pointerId) return;
            const dx = Math.abs(ev.clientX - state.startX);
            const dy = Math.abs(ev.clientY - state.startY);
            if (!state.dragging && Math.max(dx, dy) < 5) return;
            if (!state.dragging) {
                state.dragging = true;
                draggingPresetId = preset.id;
                isDraggingCard = true;
                el.classList.add("dragging");
                if (state.hideModalOnStart && typeof hideModal === "function") hideModal();
            }
            ev.preventDefault();
            updatePresetPointerDragPreview(ev);
        });
        el.addEventListener("pointerup", (ev) => {
            const state = presetPointerDragState;
            if (!state || state.sourceEl !== el || state.pointerId !== ev.pointerId) return;
            try { el.releasePointerCapture?.(ev.pointerId); } catch {}
            ev.preventDefault();
            finishPresetPointerDrag(ev);
        });
        el.addEventListener("pointercancel", (ev) => {
            const state = presetPointerDragState;
            if (!state || state.sourceEl !== el || state.pointerId !== ev.pointerId) return;
            cleanupPresetPointerDrag();
        });
    }

    function makePresetIconButton(className, iconSvg, title, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = className;
        btn.innerHTML = iconSvg;
        btn.title = title;
        btn.setAttribute("aria-label", title);
        btn.addEventListener("click", onClick);
        return btn;
    }

    function renderPresetLibrary() {
        if (!presetLibraryList) return;
        const animatedGroup = presetGroupAnimationTarget;
        const presets = getPresetList();
        updatePresetGroupList();
        const allPresetGroups = expandPresetGroupsWithParents(getPresetGroups());
        if (presetLibraryStatus) {
            presetLibraryStatus.textContent = (presets.length || allPresetGroups.length > 1)
                ? `${presets.length} 个预设，${allPresetGroups.length} 个分组`
                : "还没有预设，保存当前 PointsBuilder 后会出现在这里";
        }
        presetLibraryList.innerHTML = "";
        const grouped = new Map();
        for (const preset of presets) {
            const group = getPresetGroupLabel(preset.group);
            if (!grouped.has(group)) grouped.set(group, []);
            grouped.get(group).push(preset);
        }
        const groups = sortPresetGroupsForTree(allPresetGroups);
        for (const group of groups) {
            if (isPresetGroupHiddenByParent(group)) continue;
            const groupPresets = grouped.get(group) || [];
            const section = document.createElement("section");
            section.className = "preset-group";
            section.dataset.group = group;
            section.style.setProperty("--preset-depth", String(getPresetGroupDepth(group)));
            const groupCollapsed = presetCollapsedGroups.has(group);
            section.classList.toggle("collapsed", groupCollapsed);

            const head = document.createElement("div");
            head.className = "card compact-card preset-group-head";
            head.tabIndex = 0;
            head.setAttribute("role", "button");
            const canDragGroup = !isDefaultPresetGroup(group) && !(presetGroupEditState && presetGroupEditState.group === group);
            head.draggable = canDragGroup;
            head.setAttribute("aria-expanded", groupCollapsed ? "false" : "true");
            head.title = "拖动排序；拖到标题中部可变成子分组；单击展开/收起分组";
            head.addEventListener("dragstart", (ev) => {
                if (!canDragGroup) {
                    ev.preventDefault();
                    return;
                }
                draggingPresetGroup = group;
                suppressPresetGroupToggleUntil = Date.now() + 260;
                if (ev.dataTransfer) {
                    ev.dataTransfer.effectAllowed = "move";
                    ev.dataTransfer.setData("application/x-pointsbuilder-preset-group", group);
                    ev.dataTransfer.setData("text/plain", group);
                }
                head.classList.add("dragging");
            });
            head.addEventListener("dragend", () => {
                draggingPresetGroup = "";
                suppressPresetGroupToggleUntil = Date.now() + 180;
                head.classList.remove("dragging");
                clearPresetGroupDropState(head);
            });
            head.addEventListener("dragover", (ev) => {
                const sourceGroup = getPresetGroupDragSource(ev);
                if (!sourceGroup || sourceGroup === group || group.startsWith(`${sourceGroup}/`)) return;
                ev.preventDefault();
                if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
                const placement = getPresetGroupDropPlacement(ev, head);
                head.classList.toggle("group-drop-before", placement === "before");
                head.classList.toggle("group-drop-after", placement === "after");
                head.classList.toggle("group-drop-inside", placement === "inside");
            });
            head.addEventListener("dragleave", () => clearPresetGroupDropState(head));
            head.addEventListener("drop", (ev) => {
                const sourceGroup = getPresetGroupDragSource(ev);
                if (!sourceGroup || sourceGroup === group || group.startsWith(`${sourceGroup}/`)) return;
                ev.preventDefault();
                const placement = getPresetGroupDropPlacement(ev, head);
                clearPresetGroupDropState(head);
                if (movePresetGroupByDrop(sourceGroup, group, placement)) {
                    suppressPresetGroupToggleUntil = Date.now() + 220;
                }
            });
            head.addEventListener("click", (ev) => {
                if (Date.now() < suppressPresetGroupToggleUntil) return;
                if (ev.target && ev.target.closest && ev.target.closest(".preset-group-actions, .preset-group-title-text, .preset-group-input, .preset-group-handle")) return;
                togglePresetGroupCollapsed(group);
            });
            head.addEventListener("keydown", (ev) => {
                if (ev.target && ev.target.closest && ev.target.closest("button, input, select, textarea")) return;
                if (ev.key === "F2") {
                    if (!isDefaultPresetGroup(group)) {
                        ev.preventDefault();
                        beginPresetGroupRename(group);
                    }
                    return;
                }
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    togglePresetGroupCollapsed(group);
                }
            });
            head.addEventListener("contextmenu", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                showActionMenu(ev.clientX, ev.clientY, [
                    { label: isDefaultPresetGroup(group) ? "新建分组" : "新建子分组", onSelect: () => createPresetGroupFromLibrary(group) },
                    ...(isDefaultPresetGroup(group) ? [] : [{ label: "重命名分组", onSelect: () => beginPresetGroupRename(group) }]),
                    ...(isDefaultPresetGroup(group) ? [] : [{ label: "删除分组", danger: true, onSelect: () => deletePresetGroup(group) }])
                ]);
            });
            const collapseBtn = makePresetIconButton(
                "iconbtn preset-icon-btn preset-group-toggle",
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                groupCollapsed ? "展开分组" : "收起分组",
                (ev) => {
                    ev.stopPropagation();
                    togglePresetGroupCollapsed(group);
                }
            );
            collapseBtn.setAttribute("aria-expanded", groupCollapsed ? "false" : "true");
            const groupHandle = document.createElement("div");
            groupHandle.className = "handle preset-group-handle";
            groupHandle.textContent = "≡";
            groupHandle.title = "拖动分组";
            groupHandle.setAttribute("aria-hidden", "true");
            const title = document.createElement("div");
            title.className = "preset-group-title";
            const folderIcon = document.createElement("span");
            folderIcon.className = "preset-folder-icon";
            folderIcon.setAttribute("aria-hidden", "true");
            const titleBody = document.createElement("span");
            titleBody.className = "preset-group-title-text";
            const isEditingGroup = presetGroupEditState && presetGroupEditState.group === group;
            if (isEditingGroup) {
                const input = document.createElement("input");
                input.className = "preset-inline-input preset-group-input";
                input.value = presetGroupEditState.value ?? getPresetGroupLeaf(group);
                input.addEventListener("input", () => { presetGroupEditState.value = input.value; });
                input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
                input.addEventListener("click", (ev) => ev.stopPropagation());
                input.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter") {
                        ev.preventDefault();
                        commitPresetGroupRename(group, input.value);
                    } else if (ev.key === "Escape") {
                        ev.preventDefault();
                        presetGroupEditState = null;
                        schedulePresetLibraryRender();
                    }
                });
                input.addEventListener("blur", () => commitPresetGroupRename(group, input.value));
                titleBody.appendChild(input);
                requestAnimationFrame(() => {
                    if (presetGroupEditState && presetGroupEditState.group === group && input.isConnected) {
                        input.focus();
                        input.select();
                    }
                });
            } else {
                titleBody.textContent = getPresetGroupLeaf(group);
                titleBody.title = "右键重命名，或聚焦后按 F2";
            }
            title.append(folderIcon, titleBody);
            const meta = document.createElement("div");
            meta.className = "preset-group-meta";
            meta.textContent = `${groupPresets.length} 个`;
            const groupActions = document.createElement("div");
            groupActions.className = "preset-group-actions";
            const addChildGroupTitle = isDefaultPresetGroup(group) ? "新建分组" : "新建子分组";
            const addChildGroupBtn = makePresetIconButton(
                "iconbtn preset-icon-btn",
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9ZM12 10v6m-3-3h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                addChildGroupTitle,
                (ev) => {
                    ev.stopPropagation();
                    createPresetGroupFromLibrary(group);
                }
            );
            groupActions.appendChild(addChildGroupBtn);
            if (!isDefaultPresetGroup(group)) {
                const deleteGroupBtn = makePresetIconButton(
                    "iconbtn danger preset-icon-btn",
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12m-9 0V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7m-7 0 .6 12h6.8L16 7M10 11v5m4-5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    "删除分组",
                    (ev) => {
                        ev.stopPropagation();
                        deletePresetGroup(group);
                    }
                );
                groupActions.appendChild(deleteGroupBtn);
            }
            head.append(groupHandle, collapseBtn, title, groupActions);
            section.appendChild(head);

            const list = document.createElement("div");
            list.className = "preset-items preset-group-body";
            list.dataset.group = group;
            list.addEventListener("dragover", (ev) => {
                const sourceGroup = getPresetGroupDragSource(ev);
                if (sourceGroup) {
                    if (sourceGroup === group || group.startsWith(`${sourceGroup}/`)) return;
                    ev.preventDefault();
                    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
                    list.classList.add("group-drop-inside");
                    return;
                }
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "move";
            });
            list.addEventListener("dragleave", () => {
                list.classList.remove("group-drop-inside");
            });
            list.addEventListener("drop", (ev) => {
                const sourceGroup = getPresetGroupDragSource(ev);
                if (sourceGroup) {
                    if (sourceGroup === group || group.startsWith(`${sourceGroup}/`)) return;
                    ev.preventDefault();
                    list.classList.remove("group-drop-inside");
                    if (movePresetGroupByDrop(sourceGroup, group, "inside")) {
                        suppressPresetGroupToggleUntil = Date.now() + 220;
                    }
                    return;
                }
                ev.preventDefault();
                const sourceId = ev.dataTransfer ? ev.dataTransfer.getData("text/plain") : "";
                if (!sourceId) return;
                movePresetByDrop(sourceId, group, null);
            });
            const hasChildGroups = groups.some((candidate) => candidate !== group && getPresetParentGroup(candidate) === group);
            if (!groupPresets.length && !hasChildGroups) {
                const emptyGroup = document.createElement("div");
                emptyGroup.className = "preset-empty preset-group-empty";
                emptyGroup.textContent = "空分组";
                list.appendChild(emptyGroup);
            }
            for (const preset of groupPresets) {
                const row = document.createElement("article");
                row.className = "card compact-card preset-item";
                row.draggable = false;
                row.tabIndex = 0;
                row.dataset.presetId = preset.id;
                row.addEventListener("keydown", (ev) => {
                    if (ev.key !== "F2") return;
                    if (ev.target && ev.target.closest && ev.target.closest("button, input, select, textarea")) return;
                    ev.preventDefault();
                    beginPresetItemRename(preset);
                });
                row.addEventListener("contextmenu", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    showActionMenu(ev.clientX, ev.clientY, [
                        { label: "重命名", onSelect: () => beginPresetItemRename(preset) },
                        { label: "拾取生成", onSelect: () => applyPresetFromLibrary(preset) },
                        { label: "覆盖保存", onSelect: () => {
                            if (!openPresetOverwriteDialog(preset)) showToast("打开预设编辑失败", "error");
                        } },
                        { label: "删除", danger: true, onSelect: () => deletePresetById(preset.id) }
                    ]);
                });
        row.addEventListener("dragstart", (ev) => {
            const handle = ev.target && ev.target.closest ? ev.target.closest(".preset-drag-handle") : null;
            if (!handle || handle.closest(".preset-item") !== row) {
                ev.preventDefault();
                return;
            }
            draggingPresetId = preset.id;
            isDraggingCard = true;
            ev.dataTransfer.effectAllowed = "copyMove";
                    ev.dataTransfer.setData("text/plain", preset.id);
                    ev.dataTransfer.setData("application/x-pointsbuilder-preset", preset.id);
                    previewPreset(preset);
                    row.classList.add("dragging");
                });
        row.addEventListener("dragend", () => {
            clearPresetDragLockPlane();
            draggingPresetId = "";
            isDraggingCard = false;
            clearPresetPreview();
                    hidePresetDragPointMarker();
                    clearPresetDragPlacementStatus();
                    row.classList.remove("dragging");
                });
                row.addEventListener("dragover", (ev) => {
                    if (getPresetGroupDragSource(ev)) return;
                    ev.preventDefault();
                    row.classList.add("drop-target");
                    ev.dataTransfer.dropEffect = "move";
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("drop-target");
                });
                row.addEventListener("drop", (ev) => {
                    if (getPresetGroupDragSource(ev)) return;
                    ev.preventDefault();
                    row.classList.remove("drop-target");
                    const sourceId = ev.dataTransfer ? ev.dataTransfer.getData("text/plain") : "";
                    if (!sourceId || sourceId === preset.id) return;
                    movePresetByDrop(sourceId, group, preset.id);
                });

                const dragHandle = document.createElement("div");
                dragHandle.className = "handle preset-drag-handle";
                dragHandle.textContent = "≡";
                dragHandle.title = "拖动预设";
                dragHandle.setAttribute("aria-hidden", "true");

                const info = document.createElement("div");
                info.className = "preset-item-info";
                const name = document.createElement("div");
                name.className = "preset-item-name";
                const isEditingItem = presetItemEditState && presetItemEditState.id === preset.id;
                dragHandle.draggable = !isEditingItem;
                if (isEditingItem) {
                    const input = document.createElement("input");
                    input.className = "preset-inline-input preset-item-input";
                    input.value = presetItemEditState.value ?? (preset.name || "未命名预设");
                    input.addEventListener("input", () => { presetItemEditState.value = input.value; });
                    input.addEventListener("keydown", (ev) => {
                        if (ev.key === "Enter") {
                            ev.preventDefault();
                            commitPresetItemRename(preset.id, input.value);
                        } else if (ev.key === "Escape") {
                            ev.preventDefault();
                            presetItemEditState = null;
                            schedulePresetLibraryRender();
                        }
                    });
                    input.addEventListener("blur", () => commitPresetItemRename(preset.id, input.value));
                    name.appendChild(input);
                    requestAnimationFrame(() => {
                        if (presetItemEditState && presetItemEditState.id === preset.id && input.isConnected) {
                            input.focus();
                            input.select();
                        }
                    });
                } else {
                    const text = document.createElement("span");
                    text.className = "preset-item-name-text";
                    text.textContent = preset.name || "未命名预设";
                    text.title = "右键重命名，或聚焦后按 F2";
                    name.appendChild(text);
                }
                const details = document.createElement("div");
                details.className = "preset-item-details";
                const origin = normalizePointValue(preset.origin);
                const count = Array.isArray(preset.children) ? preset.children.length : 0;
                const variableCount = getPresetVariableEntries(getPresetEffectiveVariableInfo(preset)).length;
                details.textContent = `${count} 张卡片 · ${variableCount ? `${variableCount} 个变量 · ` : ""}原点 ${origin.x}, ${origin.y}, ${origin.z}`;
                info.append(name, details);
                if (!isEditingItem) bindPresetPointerApplyDrag(info, preset);

                const actions = document.createElement("div");
                actions.className = "preset-item-actions";
                const applyBtn = makePresetIconButton(
                    "btn icon primary preset-icon-btn",
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm5 3v8m-4-4h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    "拾取生成",
                    () => applyPresetFromLibrary(preset)
                );
                const overwriteBtn = makePresetIconButton(
                    "btn icon preset-icon-btn",
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10m-10 5h6m-4 9h8a2 2 0 0 0 2-2v-8l-4-4H9a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Zm4-12v5m-2-2h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    "用当前内容覆盖",
                    () => {
                        if (!openPresetOverwriteDialog(preset)) showToast("打开预设编辑失败", "error");
                    }
                );
                const deleteBtn = makePresetIconButton(
                    "btn icon danger preset-icon-btn",
                    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12m-9 0V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7m-7 0 .6 12h6.8L16 7M10 11v5m4-5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                    "删除",
                    () => deletePresetById(preset.id)
                );
                actions.append(applyBtn, overwriteBtn, deleteBtn);
                row.append(dragHandle, info, actions);
                list.appendChild(row);
            }
            section.appendChild(list);
            const collapsed = presetCollapsedGroups.has(group);
            const wasCollapsed = presetGroupCollapsedSnapshot.get(group);
            const shouldAnimate = group === animatedGroup && typeof wasCollapsed === "boolean" && wasCollapsed !== collapsed;
            if (!shouldAnimate) {
                list.style.transition = "none";
                presetLibraryList.appendChild(section);
                const finalHeight = list.scrollHeight;
                list.style.maxHeight = collapsed ? "0px" : `${finalHeight}px`;
                list.style.opacity = collapsed ? "0" : "1";
                list.style.transform = collapsed ? "translateY(-4px)" : "translateY(0)";
                requestAnimationFrame(() => {
                    if (list.isConnected) list.style.transition = "";
                });
            } else {
                presetLibraryList.appendChild(section);
                const startHeight = list.scrollHeight;
                if (collapsed) {
                    list.style.maxHeight = `${startHeight}px`;
                    list.style.opacity = "1";
                    list.style.transform = "translateY(0)";
                    requestAnimationFrame(() => {
                        list.style.maxHeight = "0px";
                        list.style.opacity = "0";
                        list.style.transform = "translateY(-4px)";
                    });
                } else {
                    list.style.maxHeight = "0px";
                    list.style.opacity = "0";
                    list.style.transform = "translateY(-4px)";
                    requestAnimationFrame(() => {
                        const nextHeight = list.scrollHeight;
                        list.style.maxHeight = `${nextHeight}px`;
                        list.style.opacity = "1";
                        list.style.transform = "translateY(0)";
                    });
                }
            }
            presetGroupCollapsedSnapshot.set(group, collapsed);
        }
        if (animatedGroup && presetGroupAnimationTarget === animatedGroup) presetGroupAnimationTarget = "";
    }

    function schedulePresetLibraryRender(options = {}) {
        if (options.dirty !== false) presetLibraryDirty = true;
        if (presetLibraryRenderRaf) return;
        presetLibraryRenderRaf = requestAnimationFrame(() => {
            presetLibraryRenderRaf = 0;
            if (rightPanelPage === "presets" && presetLibraryDirty) {
                renderPresetLibrary();
                presetLibraryDirty = false;
            }
        });
    }

    function getPresetImportOptions() {
        return { overwrite: false };
    }

    function bindPresetLibraryControls() {
        if (!rightPresetsPage) return;
        fillPresetForm();
        btnClosePresetSave?.addEventListener("click", hidePresetSaveDialog);
        btnCancelPresetSave?.addEventListener("click", hidePresetSaveDialog);
        presetSaveMask?.addEventListener("click", hidePresetSaveDialog);
        btnPresetUseCurrentOrigin?.addEventListener("click", () => setPresetOriginInputs(getPresetOriginFallback()));
        btnPresetPickOrigin?.addEventListener("click", () => {
            hidePresetSaveDialog();
            startPointPick({
                label: "拾取预设原点",
                onPick: (point) => {
                    showPresetSaveDialog();
                    setPresetOriginInputs(point);
                    requestAnimationFrame(() => {
                        setPresetOriginInputs(point);
                        btnPresetSaveCurrent?.focus();
                    });
                    showToast("已拾取预设原点", "success");
                }
            });
        });
        btnPresetCreateGroup?.addEventListener("click", () => {
            createPresetGroup("");
        });
        btnPresetCreateLibraryGroup?.addEventListener("click", () => {
            setRightPanelPage("presets");
            createPresetGroupFromLibrary("");
        });
        btnOpenPresetRingTool?.addEventListener("click", openPresetRingTool);
        btnPresetRingClose?.addEventListener("click", closePresetRingTool);
        btnPresetRingSyncSlots?.addEventListener("click", syncPresetRingSlots);
        const handlePresetRingCountChange = () => {
            if (isPresetRingRandomEnabled()) refreshPresetRingRandomSelection();
            renderPresetRingSlots();
        };
        presetRingCount?.addEventListener("input", handlePresetRingCountChange);
        presetRingCount?.addEventListener("change", () => {
            handlePresetRingCountChange();
            commitPresetRingCardParams();
            schedulePresetRingSnapshotSync();
        });
        presetRingGroupLabel?.addEventListener("change", commitPresetRingCardParams);
        presetRingRandomEnabled?.addEventListener("change", () => {
            updatePresetRingRandomGroupOptions();
            if (isPresetRingRandomEnabled()) refreshPresetRingRandomSelection();
            renderPresetRingSlots();
            schedulePresetRingSnapshotSync();
        });
        presetRingRandomGroup?.addEventListener("change", () => {
            refreshPresetRingRandomSelection();
            renderPresetRingSlots();
            schedulePresetRingSnapshotSync();
        });
        [
            presetRingRadius,
            presetRingStartDeg,
            presetRingOriginX,
            presetRingOriginY,
            presetRingOriginZ,
            presetRingAxisX,
            presetRingAxisY,
            presetRingAxisZ,
            presetRingOffsetX,
            presetRingOffsetY,
            presetRingOffsetZ,
            presetRingFaceCenter,
            presetRingReverse
        ].forEach((el) => {
            el?.addEventListener("change", () => {
                commitPresetRingCardParams();
            });
        });
        btnPresetRingPickOrigin?.addEventListener("click", () => {
            if (!presetRingTool) return;
            presetRingTool.classList.add("hidden");
            startPointPick({
                label: "拾取环形放置圆心",
                onPick: (point) => {
                    setPresetRingPoint(presetRingOriginX, presetRingOriginY, presetRingOriginZ, point);
                    const node = getActiveParameterizedInstanceNode();
                    if (node) {
                        node.params.originX = point.x;
                        node.params.originY = point.y;
                        node.params.originZ = point.z;
                        scheduleAutoSave();
                        renderAll();
                    }
                    presetRingTool.classList.remove("hidden");
                    updatePresetRingStatus();
                    showToast("已拾取环形放置圆心", "success");
                }
            });
        });
        presetLibraryList?.addEventListener("contextmenu", (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest(".preset-item, button, input, select")) return;
            ev.preventDefault();
            const group = ev.target && ev.target.closest ? ev.target.closest(".preset-group")?.dataset?.group || "" : "";
            showActionMenu(ev.clientX, ev.clientY, [
                { label: group ? "新建子分组" : "新建分组", onSelect: () => createPresetGroupFromLibrary(group) },
                ...(group ? [{ label: "重命名分组", onSelect: () => beginPresetGroupRename(group) }] : [])
            ]);
        });
        btnPresetSaveCurrent?.addEventListener("click", () => {
            const preset = savePresetFromPanel();
            showToast(preset ? `已保存预设：${preset.name}` : "保存预设已取消", preset ? "success" : "info");
        });
        btnPresetExportZip?.addEventListener("click", async () => {
            try {
                const count = await exportPresetLibraryZip();
                showToast(`已导出 ${count} 个预设`, "success");
            } catch (e) {
                showToast(`导出预设失败：${e.message || e}`, "error");
            }
        });
        btnPresetImportFolder?.addEventListener("click", async () => {
            if (!window.showDirectoryPicker) {
                showToast("当前浏览器不支持选择文件夹，请导入 zip", "info");
                filePresetJson?.click();
                return;
            }
            try {
                const count = await importPresetDirectory(getPresetImportOptions());
                showToast(`已导入 ${count} 个预设`, "success");
            } catch (e) {
                if (e && e.name === "AbortError") {
                    showToast("取消导入", "info");
                    return;
                }
                showToast(`导入预设失败：${e.message || e}`, "error");
            }
        });
        btnPresetImportZip?.addEventListener("click", () => filePresetJson?.click());
        renderPresetLibrary();
        presetLibraryDirty = false;
    }

    const storedState = loadAutoState();
    const hadLegacyStatePresets = Object.prototype.hasOwnProperty.call(storedState || {}, "presets");
    const legacyStatePresets = Array.isArray(storedState?.presets) ? storedState.presets : [];
    const restoredState = normalizeState(storedState);
    if (restoredState) state = restoredState;
    syncCompositionRegisteredBuilderSnapshots();
    state.variables = normalizeVariableState(state.variables);
    const hasSharedPresetList = hasPresetList();
    const sharedPresets = hasSharedPresetList ? loadPresetList() : [];
    presetList = dedupePresetList([...sharedPresets, ...legacyStatePresets]);
    presetGroups = dedupePresetGroups(loadPresetGroups().concat(presetList.map((it) => it.group)));
    let legacyPresetMigrationComplete = hasSharedPresetList || legacyStatePresets.length === 0;
    if (legacyStatePresets.length && presetList.length) {
        legacyPresetMigrationComplete = savePresetList(presetList, presetGroups);
    }

    let autoSaveTimer = 0;
    let lastSavedStateJson = "";

    function safeStringifyState(obj) {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            console.warn("state stringify failed:", e);
            return "";
        }
    }

    lastSavedStateJson = safeStringifyState(state);
    if (hadLegacyStatePresets && legacyPresetMigrationComplete) saveAutoState(state);

    function scheduleAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = 0;
            const json = safeStringifyState(state);
            if (!json || json === lastSavedStateJson) return;
            if (saveAutoState(state, json)) lastSavedStateJson = json;
        }, 180);
    }

    globalThis.__PB_flushAutoStateSave = flushAutoStateSave;
    globalThis.addEventListener?.("pb-auto-save-error", (event) => {
        const error = event?.detail?.error;
        showToast(`自动保存失败：${error?.message || "浏览器存储不可用"}`, "error");
    });

    const hotkeySystem = initHotkeysSystem({
        modal,
        modalMask,
        hkModal,
        hkMask,
        hkSearch,
        hkList,
        hkHint,
        btnAddCard,
        btnPickLine,
        btnPickTriangle,
        btnPickPoint,
        btnLocalRotate,
        btnOpenPresetRingTool,
        btnFullscreen,
        btnResetCamera,
        btnLoadJson,
        btnApplyPreset,
        btnHotkeys,
        btnOpenHotkeys,
        btnCloseHotkeys,
        btnCloseHotkeys2,
        btnHotkeysReset,
        btnHotkeysExport,
        btnHotkeysImport,
        fileHotkeys,
        cardSearch,
        settingsModal,
        settingsMask,
        KIND,
        showToast,
        downloadText,
        getSettingsPayload: collectSettingsPayload,
        applySettingsPayload,
        getPresetList: () => getPresetList()
    });
    ({
        hotkeys,
        hotkeyToHuman,
        hotkeyMatchEvent,
        normalizeHotkey,
        shouldIgnorePlainHotkeys,
        openHotkeysModal,
        hideHotkeysModal,
        beginHotkeyCapture,
        refreshHotkeyHints,
        handleHotkeyCaptureKeydown
    } = hotkeySystem);

    const builderTools = createBuilderTools({
        KIND,
        U,
        rotatePointsToPointUpright,
        applyPointsBuilderInstanceOverrides,
        getState: () => state,
        getKotlinEndMode: () => kotlinEndMode
    });
    const { evalBuilderWithMeta, emitKotlin } = builderTools;

    // -------------------------
    // focus/render flags
    // -------------------------
    // 渲染卡片列表时会触发 focusout（DOM 被重建）。这些 focus 事件不应写入历史，也不应清空聚焦。
    let suppressFocusHistory = false;
    let isRenderingCards = false;

    // -------------------------
    // History (Undo / Redo)
    // -------------------------
    // 撤销栈容量（用户要求“变大一点”）
    const HISTORY_MAX = 800;
    const undoStack = [];
    const redoStack = [];
    let isRestoringHistory = false;

    function deepClone(x) {
        return JSON.parse(JSON.stringify(x));
    }

    function historyCapture(reason = "") {
        if (isRestoringHistory) return;
        try {
            const snap = { state: deepClone(state), focusedNodeId: focusedNodeId || null };
            const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
            // ✅ 允许“仅焦点变化”入栈：state 相同但 focusedNodeId 不同也要记录
            if (last) {
                const sameState = (JSON.stringify(last.state) === JSON.stringify(snap.state));
                const sameFocus = ((last.focusedNodeId || null) === (snap.focusedNodeId || null));
                if (sameState && sameFocus) return;
            }
            undoStack.push(snap);
            if (undoStack.length > HISTORY_MAX) undoStack.shift();
            redoStack.length = 0;
        } catch (e) {
            console.warn("historyCapture failed:", reason, e);
        }
    }


    function restoreSnapshot(snap) {
        isRestoringHistory = true;
        try {
            stopLinePick?.(); // 取消拾取模式，避免状态错乱
            stopPointPick?.();
            stopBezierCreate?.();
        } catch {}
        try {
            state = normalizeState(deepClone(snap.state));
            focusedNodeId = snap.focusedNodeId || null;
        } finally {
            isRestoringHistory = false;
        }
        suppressFocusHistory = true;
        renderAll();
        suppressFocusHistory = false;
        const restoredFocus = focusedNodeId ? findNodeContextById(focusedNodeId)?.node : null;
        if (restoredFocus?.kind === EFFECT_RING_KIND) {
            activeParameterizedInstanceNodeId = restoredFocus.id;
            resetPresetRingSharedVariableState();
            loadPresetRingEditorFromNode(restoredFocus);
            scheduleParamEditorRender();
        } else {
            closePresetRingTool();
        }
        // 尝试恢复焦点（不强制，避免打断用户）
        requestAnimationFrame(() => {
            if (!focusedNodeId) return;
            const el = document.querySelector(`.card[data-id="${focusedNodeId}"]`);
            if (el) {
                try { el.scrollIntoView({block: "nearest"}); } catch {}
            }
            updateFocusColors?.();
            updateFocusCardUI?.();
        });
    }

    function historyUndo() {
        if (!undoStack.length) return;
        const snap = undoStack.pop();
        redoStack.push({ state: deepClone(state), focusedNodeId: focusedNodeId || null });
        restoreSnapshot(snap);
    }

    function historyRedo() {
        if (!redoStack.length) return;
        const snap = redoStack.pop();
        undoStack.push({ state: deepClone(state), focusedNodeId: focusedNodeId || null });
        restoreSnapshot(snap);
    }

    // 输入控件 focus 时只 capture 一次（开始编辑的那一刻）
    function armHistoryOnFocus(el, reason = "edit") {
        if (!el) return;
        if (el.__pbHistoryArmed) return;
        el.__pbHistoryArmed = true;
        el.addEventListener("focus", () => {
            if (isRestoringHistory) return;
            if (!el.__pbHistoryCaptured) {
                el.__pbHistoryCaptured = true;
                historyCapture(reason);
            }
        });
        el.addEventListener("blur", () => {
            el.__pbHistoryCaptured = false;
        });
    }

    const { row, inputNum, select, checkbox, makeVec3Editor, angleInput, setTipKind } = createCardInputs({
        num,
        armHistoryOnFocus,
        historyCapture,
        setActiveVecTarget: (target) => { activeVecTarget = target; },
        getParamStep: () => paramStep,
        enableExprNumbers: () => getEffectiveNumericSuggestions().length > 0,
        getExprSuggestions: () => getEffectiveNumericSuggestions(),
        getVec3VariableOptions: () => getEffectiveVec3VariableOptions(),
        parseExprNumber: (raw) => num(raw),
        startPointPickForVecTarget,
        compareSuggestionNames,
        sortSuggestionNames,
        touchSuggestionUsage
    });

    // 用户要求：左侧卡片允许“全部删除”（不再强制至少保留 axis）。
    // PointsBuilder 本身 axis 默认是 y 轴，因此 UI 不必强制插入 axis 卡片。
    function ensureAxisInList(_list) {
        // no-op
    }

    function ensureAxisEverywhere() {
        // no-op
    }

    function isBuilderContainerKind(kind) {
        return kind === "add_builder" || kind === "with_builder" || kind === "add_with" || kind === "clear_as_mask"
            || kind === "apply_bezier_distribution";
    }

    function forEachNode(list, fn) {
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            fn(n);
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                forEachNode(n.children, fn);
            }
        }
    }

    function collapseAllNodes(list) {
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            n.collapsed = true;
            if (Array.isArray(n.terms)) {
                for (const t of n.terms) {
                    if (t) t.collapsed = true;
                }
            }
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                collapseAllNodes(n.children);
            }
        }
    }

    const COLLAPSE_SCOPE_ROOT = "root";
    const collapseScopes = new Map(); // scopeId -> { active: boolean, manualOpen: Set }

    function scopeKey(scopeId) {
        return scopeId || COLLAPSE_SCOPE_ROOT;
    }

    function getCollapseScope(scopeId) {
        const key = scopeKey(scopeId);
        let scope = collapseScopes.get(key);
        if (!scope) {
            scope = { active: false, manualOpen: new Set(), forceOpenOnce: false };
            collapseScopes.set(key, scope);
        }
        return scope;
    }

    function resetCollapseScopes() {
        collapseScopes.clear();
    }

    function isCollapseAllActive(scopeId) {
        return !!getCollapseScope(scopeId).active;
    }

    function buildFocusPathIds(focusId = focusedNodeId) {
        const set = new Set();
        if (!focusId) return set;
        let ctx = findNodeContextById(focusId);
        if (!ctx || !ctx.node) return set;
        set.add(ctx.node.id);
        let parent = ctx.parentNode || null;
        while (parent && parent.id) {
            set.add(parent.id);
            const next = findNodeContextById(parent.id);
            parent = next ? (next.parentNode || null) : null;
        }
        return set;
    }

    function collapseAllInList(list, scopeId, focusPath = null) {
        const scope = getCollapseScope(scopeId);
        const focusSet = focusPath || buildFocusPathIds();
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            const keepOpen = scope.manualOpen.has(n.id) || (focusSet && focusSet.has(n.id));
            n.collapsed = !keepOpen;
        }
    }

    function expandAllInList(list) {
        const arr = list || [];
        for (const n of arr) {
            if (!n) continue;
            n.collapsed = false;
        }
    }

    function applyCollapseAllStates() {
        const focusPath = buildFocusPathIds();
        const rootScope = getCollapseScope(null);
        if (rootScope.forceOpenOnce) {
            expandAllInList(state.root.children);
            rootScope.forceOpenOnce = false;
        } else if (rootScope.active) {
            collapseAllInList(state.root.children, null, focusPath);
        }
        forEachNode(state.root.children, (n) => {
            if (!isBuilderContainerKind(n.kind)) return;
            const scope = collapseScopes.get(n.id);
            if (scope && scope.forceOpenOnce) {
                expandAllInList(n.children || []);
                scope.forceOpenOnce = false;
            } else if (scope && scope.active) {
                collapseAllInList(n.children || [], n.id, focusPath);
            }
        });
    }

    function getScopeIdForNodeId(id) {
        const ctx = findNodeContextById(id);
        if (!ctx) return null;
        return ctx.parentNode ? ctx.parentNode.id : null;
    }


    function syncCardCollapseUI(id) {
        if (!id || !elCardsRoot) return false;
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) return false;
        const card = elCardsRoot.querySelector(`.card[data-id="${id}"]`);
        if (!card) return false;
        const body = card.querySelector(".card-body");
        const btn = card.querySelector('.iconbtn[data-collapse-btn="1"]');
        const collapsed = !!ctx.node.collapsed;
        const wasCollapsed = card.classList.contains("collapsed");

        if (btn) {
            btn.innerHTML = collapsed
                ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
            btn.title = collapsed ? "展开" : "收起";
        }
        if (wasCollapsed === collapsed) {
            if (!collapsed && body && !Number.isFinite(ctx.node.bodyHeight)) {
                body.style.height = "";
                body.style.maxHeight = "";
            }
            return true;
        }

        const token = String(Date.now() + Math.random());
        if (body) body.dataset.animToken = token;

        if (collapsed) {
            // 先测量当前高度，再折叠（避免先加 collapsed 导致高度变成 0）
            if (body) {
                const current = body.getBoundingClientRect().height || 0;
                body.style.height = `${current}px`;
                body.style.maxHeight = `${current}px`;
            }
            card.classList.add("collapsed");
            if (body) {
                requestAnimationFrame(() => {
                    if (body.dataset.animToken !== token) return;
                    body.style.height = "0px";
                    body.style.maxHeight = "0px";
                });
            }
        } else {
            // 先取消 collapsed，再动画展开到内容高度
            card.classList.remove("collapsed");
            if (body) {
                const targetH = Number.isFinite(ctx.node.bodyHeight)
                    ? ctx.node.bodyHeight
                    : body.scrollHeight || 0;
                body.style.height = "0px";
                body.style.maxHeight = "0px";
                requestAnimationFrame(() => {
                    if (body.dataset.animToken !== token) return;
                    body.style.height = `${targetH}px`;
                    body.style.maxHeight = `${targetH}px`;
                });
                if (!Number.isFinite(ctx.node.bodyHeight)) {
                    setTimeout(() => {
                        if (body.dataset.animToken !== token) return;
                        if (!ctx.node.collapsed) {
                            body.style.height = "";
                            body.style.maxHeight = "";
                        }
                    }, 460);
                }
            }
        }
        scheduleAutoSave();
        return true;
    }

    function handleCollapseAllFocusChange(prevId, nextId) {
        if (isDraggingCard) return;
        const nextPath = nextId ? buildFocusPathIds(nextId) : null;
        if (prevId && prevId !== nextId) {
            const scopeId = getScopeIdForNodeId(prevId);
            const scope = getCollapseScope(scopeId);
            const keepOpen = nextPath && nextPath.has(prevId);
            if (scope.active && !scope.manualOpen.has(prevId) && !keepOpen) {
                const ctx = findNodeContextById(prevId);
                if (ctx && ctx.node && !ctx.node.collapsed) {
                    ctx.node.collapsed = true;
                    syncCardCollapseUI(prevId);
                }
            }
        }
        if (nextId) {
            const scopeId = getScopeIdForNodeId(nextId);
            const scope = getCollapseScope(scopeId);
            if (scope.active) {
                const ctx = findNodeContextById(nextId);
                if (ctx && ctx.node && ctx.node.collapsed) {
                    ctx.node.collapsed = false;
                    syncCardCollapseUI(nextId);
                }
            }
        }
    }

    function collapseAllInScope(scopeId, list) {
        const scope = getCollapseScope(scopeId);
        scope.active = true;
        scope.manualOpen.clear();
        collapseAllInList(list, scopeId, buildFocusPathIds());
    }

    function expandAllInScope(scopeId, list) {
        const scope = getCollapseScope(scopeId);
        scope.active = false;
        scope.manualOpen.clear();
        scope.forceOpenOnce = false;
        expandAllInList(list);
    }

    function findNodeContextById(id, list = state.root.children, parentNode = null) {
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (n.id === id) return { node: n, parentList: arr, index: i, parentNode };
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                const r = findNodeContextById(id, n.children, n);
                if (r) return r;
            }
        }
        return null;
    }

    function findNodePathById(id, list = state.root.children, parentNode = null) {
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (n.id === id) return [{ node: n, parentList: arr, index: i, parentNode }];
            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                const childPath = findNodePathById(id, n.children, n);
                if (childPath) {
                    return [{ node: n, parentList: arr, index: i, parentNode }, ...childPath];
                }
            }
        }
        return null;
    }

    // ✅ 支持“删除聚焦卡片”：不仅能找到普通卡片，也能找到 add_fourier_series 的 term 子卡片
    function findAnyCardContextById(id, list = state.root.children, parentNode = null) {
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (!n) continue;
            if (n.id === id) return { type: "node", node: n, parentList: arr, index: i, parentNode };

            // Fourier 子卡片（terms）
            if (n.kind === "add_fourier_series" && Array.isArray(n.terms)) {
                for (let ti = 0; ti < n.terms.length; ti++) {
                    const t = n.terms[ti];
                    if (t && t.id === id) {
                        return { type: "term", term: t, parentList: n.terms, index: ti, parentNode: n };
                    }
                }
            }

            if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                const r = findAnyCardContextById(id, n.children, n);
                if (r) return r;
            }
        }
        return null;
    }

    function pickReasonableFocusAfterDelete(ctx) {
        try {
            const list = ctx?.parentList;
            if (Array.isArray(list) && list.length) {
                const i = Math.max(0, Math.min(ctx.index, list.length - 1));
                const cand = list[i] || list[i - 1];
                if (cand && cand.id) return cand.id;
            }
            if (ctx?.parentNode && ctx.parentNode.id) return ctx.parentNode.id;
        } catch {}
        return null;
    }

    function deleteFocusedCard() {
        if (!focusedNodeId) return false;
        const ctx = findAnyCardContextById(focusedNodeId);
        if (!ctx || !Array.isArray(ctx.parentList)) {
            // 找不到：清空焦点即可
            setFocusedNode(null, true);
            return false;
        }

        historyCapture("delete_focused");

        // 删除
        ctx.parentList.splice(ctx.index, 1);

        // 删除后合理地保留焦点（不额外写历史，由 delete_focused 这一条快照承载）
        const nextFocus = pickReasonableFocusAfterDelete(ctx);
        setFocusedNode(nextFocus, false);

        ensureAxisEverywhere();
        renderAll();
        return true;
    }

    function collectSelectedDeleteContexts(ids) {
        const src = Array.isArray(ids) ? ids : [];
        const unique = [];
        const seen = new Set();
        for (const id of src) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            unique.push(id);
        }
        const rows = [];
        for (const id of unique) {
            const ctx = findAnyCardContextById(id);
            if (!ctx || !Array.isArray(ctx.parentList)) continue;
            rows.push({ id, ctx });
        }
        if (!rows.length) return [];

        const selectedNodeIds = new Set(rows.filter((r) => r.ctx && r.ctx.type === "node").map((r) => r.id));
        const out = [];
        for (const row of rows) {
            const { id, ctx } = row;
            if (ctx.type === "node") {
                const path = findNodePathById(id);
                let coveredByAncestor = false;
                if (Array.isArray(path) && path.length > 1) {
                    for (let i = 0; i < path.length - 1; i++) {
                        const ancId = path[i] && path[i].node ? path[i].node.id : null;
                        if (ancId && ancId !== id && selectedNodeIds.has(ancId)) {
                            coveredByAncestor = true;
                            break;
                        }
                    }
                }
                if (coveredByAncestor) continue;
            } else if (ctx.type === "term") {
                const pid = ctx.parentNode && ctx.parentNode.id ? ctx.parentNode.id : null;
                if (pid && selectedNodeIds.has(pid)) continue;
            }
            out.push(row);
        }
        return out;
    }

    function deleteSelectedCards() {
        const sel = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIds = sel ? Array.from(sel).filter(Boolean) : [];
        if (!selectedIds.length) return false;

        const rows = collectSelectedDeleteContexts(selectedIds);
        if (!rows.length) return false;

        const focusedInSelection = !!(focusedNodeId && selectedIds.includes(focusedNodeId));
        const focusCtxBeforeDelete = focusedInSelection
            ? (rows.find((r) => r.id === focusedNodeId)?.ctx || null)
            : null;

        historyCapture("delete_selected");

        const sorted = rows.slice().sort((a, b) => {
            if (a.ctx.parentList === b.ctx.parentList) return b.ctx.index - a.ctx.index;
            const depthA = (a.ctx.type === "node") ? ((findNodePathById(a.id)?.length) || 1) : 999;
            const depthB = (b.ctx.type === "node") ? ((findNodePathById(b.id)?.length) || 1) : 999;
            return depthB - depthA;
        });

        for (const row of sorted) {
            const { id, ctx } = row;
            const list = ctx.parentList;
            if (!Array.isArray(list)) continue;
            if (ctx.index >= 0 && ctx.index < list.length && list[ctx.index] && list[ctx.index].id === id) {
                list.splice(ctx.index, 1);
                continue;
            }
            const at = list.findIndex((it) => it && it.id === id);
            if (at >= 0) list.splice(at, 1);
        }

        if (typeof clearCardSelectionIds === "function") clearCardSelectionIds();

        let nextFocus = null;
        if (!focusedInSelection && focusedNodeId && findAnyCardContextById(focusedNodeId)) {
            nextFocus = focusedNodeId;
        } else if (focusCtxBeforeDelete) {
            nextFocus = pickReasonableFocusAfterDelete(focusCtxBeforeDelete);
        }
        setFocusedNode(nextFocus, false);

        ensureAxisEverywhere();
        renderAll();
        return true;
    }

    function matchesEmptyBuilderKind(node, kind) {
        if (!node) return false;
        const targetKind = (kind === "with_builder") ? "add_builder" : kind;
        if (targetKind === "add_builder") {
            return node.kind === "add_builder" || node.kind === "with_builder";
        }
        if (targetKind === "clear_as_mask") {
            return node.kind === "clear_as_mask";
        }
        return node.kind === targetKind;
    }

    function collectEmptyBuilderContexts(kind, list = state.root.children, depth = 1, out = []) {
        const arr = Array.isArray(list) ? list : [];
        for (let i = 0; i < arr.length; i++) {
            const node = arr[i];
            if (!node) continue;
            if (isBuilderContainerKind(node.kind) && Array.isArray(node.children) && node.children.length) {
                collectEmptyBuilderContexts(kind, node.children, depth + 1, out);
            }
            if (!matchesEmptyBuilderKind(node, kind)) continue;
            if (Array.isArray(node.children) && node.children.length) continue;
            out.push({ id: node.id || null, parentList: arr, index: i, depth });
        }
        return out;
    }

    function clearEmptyBuilderCards(kind) {
        const targetKind = (kind === "with_builder") ? "add_builder" : kind;
        let rows = collectEmptyBuilderContexts(targetKind);
        if (!rows.length) return 0;
        const removedIds = new Set();
        const sel = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIdsBefore = sel ? Array.from(sel).filter(Boolean) : [];
        const focusCtxBeforeDelete = (focusedNodeId && rows.some((row) => row.id === focusedNodeId))
            ? findAnyCardContextById(focusedNodeId)
            : null;
        historyCapture(`clear_empty_${targetKind}`);
        while (rows.length) {
            rows.sort((a, b) => {
                if (a.parentList === b.parentList) return b.index - a.index;
                return b.depth - a.depth;
            });
            for (const row of rows) {
                const list = row.parentList;
                if (!Array.isArray(list)) continue;
                const current = (row.index >= 0 && row.index < list.length) ? list[row.index] : null;
                if (current && current.id === row.id) {
                    if (!matchesEmptyBuilderKind(current, targetKind)) continue;
                    if (Array.isArray(current.children) && current.children.length) continue;
                    list.splice(row.index, 1);
                    if (row.id) removedIds.add(row.id);
                    continue;
                }
                const at = list.findIndex((item) => item && item.id === row.id);
                if (at < 0) continue;
                const found = list[at];
                if (!matchesEmptyBuilderKind(found, targetKind)) continue;
                if (Array.isArray(found.children) && found.children.length) continue;
                list.splice(at, 1);
                if (row.id) removedIds.add(row.id);
            }
            rows = collectEmptyBuilderContexts(targetKind);
        }
        if (!removedIds.size) return 0;
        const keptSelectionIds = normalizeActionTargetIds(
            selectedIdsBefore.filter((id) => !removedIds.has(id))
        );
        if (typeof clearCardSelectionIds === "function") clearCardSelectionIds();
        if (keptSelectionIds.length && typeof setCardSelectionIds === "function") {
            setCardSelectionIds(keptSelectionIds, {
                replace: true,
                focus: false,
                reveal: false,
                syncWithParamSync: true,
                syncStrictKind: false
            });
        }
        let nextFocus = null;
        if (focusedNodeId && !removedIds.has(focusedNodeId) && findAnyCardContextById(focusedNodeId)) {
            nextFocus = focusedNodeId;
        } else if (focusCtxBeforeDelete) {
            nextFocus = pickReasonableFocusAfterDelete(focusCtxBeforeDelete);
        }
        setFocusedNode(nextFocus, false);
        ensureAxisEverywhere();
        renderAll();
        return removedIds.size;
    }

    function collectSelectedRowsForDuplicate(opts = {}) {
        const mirrorOnly = opts.mirrorOnly === true;
        const sel = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIds = sel ? Array.from(sel).filter(Boolean) : [];
        if (selectedIds.length <= 1) return [];
        const rows = collectSelectedDeleteContexts(selectedIds);
        if (!rows.length) return [];
        if (!mirrorOnly) return rows;
        return rows.filter((r) => r && r.ctx && r.ctx.type === "node");
    }

    function duplicateRows(rows, cloneByRow) {
        const src = Array.isArray(rows) ? rows : [];
        if (!src.length || typeof cloneByRow !== "function") return { inserted: [], sourceToClone: new Map() };

        const grouped = new Map();
        for (const row of src) {
            const list = row?.ctx?.parentList;
            if (!Array.isArray(list)) continue;
            if (!grouped.has(list)) grouped.set(list, []);
            grouped.get(list).push(row);
        }

        const inserted = [];
        const sourceToClone = new Map();
        for (const [list, group] of grouped.entries()) {
            group.sort((a, b) => (a?.ctx?.index || 0) - (b?.ctx?.index || 0));
            let offset = 0;
            for (const row of group) {
                const cloned = cloneByRow(row);
                if (!cloned || !cloned.id) continue;
                const baseIndex = Number(row?.ctx?.index);
                const at = Math.max(0, Math.min((Number.isFinite(baseIndex) ? baseIndex : 0) + 1 + offset, list.length));
                list.splice(at, 0, cloned);
                offset += 1;
                inserted.push({ row, cloneId: cloned.id });
                sourceToClone.set(row.id, cloned.id);
            }
        }
        return { inserted, sourceToClone };
    }

    function postDuplicateApply(inserted, sourceToClone = new Map()) {
        if (!Array.isArray(inserted) || !inserted.length) return false;
        const cloneNodeIds = inserted
            .filter((it) => it && it.row && it.row.ctx && it.row.ctx.type === "node" && it.cloneId)
            .map((it) => it.cloneId);
        const fallbackCloneId = inserted[0]?.cloneId || null;
        const focusCloneId = (focusedNodeId && sourceToClone && sourceToClone.get(focusedNodeId)) || fallbackCloneId;

        if (cloneNodeIds.length && typeof setCardSelectionIds === "function") {
            setCardSelectionIds(cloneNodeIds, { replace: true, focus: false, syncWithParamSync: false });
        }
        if (focusCloneId) setFocusedNode(focusCloneId, false);

        renderAll();
        requestAnimationFrame(() => {
            if (!focusCloneId) return;
            const el = elCardsRoot.querySelector(`.card[data-id="${focusCloneId}"]`);
            if (el) {
                try { el.focus(); } catch {}
                try { el.scrollIntoView({ block: "nearest" }); } catch {}
                setFocusedNode(focusCloneId, false);
            }
        });
        return true;
    }

    function copyFocusedCard() {
        const selectedRows = collectSelectedRowsForDuplicate();
        if (selectedRows.length > 1) {
            historyCapture("copy_selected");
            const { inserted, sourceToClone } = duplicateRows(selectedRows, (row) => {
                const ctx = row?.ctx;
                if (!ctx) return null;
                if (ctx.type === "term") {
                    const clonedTerm = JSON.parse(JSON.stringify(ctx.term || {}));
                    clonedTerm.id = uid();
                    return clonedTerm;
                }
                if (ctx.type === "node") return cloneNodeDeep(ctx.node);
                return null;
            });
            if (!inserted.length) return false;
            ensureAxisEverywhere();
            postDuplicateApply(inserted, sourceToClone);
            showToast(`已粘贴 ${inserted.length} 张卡片`, "success");
            return true;
        }

        if (!focusedNodeId) return false;
        const ctx = findAnyCardContextById(focusedNodeId);
        if (!ctx || !Array.isArray(ctx.parentList)) return false;
        historyCapture("copy_focused");
        let cloned = null;
        if (ctx.type === "term") {
            cloned = JSON.parse(JSON.stringify(ctx.term));
            cloned.id = uid();
        } else {
            cloned = cloneNodeDeep(ctx.node);
        }
        ctx.parentList.splice(ctx.index + 1, 0, cloned);
        renderAll();
        requestAnimationFrame(() => {
            const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
            if (el) {
                try { el.focus(); } catch {}
                try { el.scrollIntoView({ block: "nearest" }); } catch {}
                setFocusedNode(cloned.id, false);
            }
        });
        showToast("已粘贴 1 张卡片", "success");
        return true;
    }

    function mirrorCopyFocusedCard() {
        const selectedRows = collectSelectedRowsForDuplicate({ mirrorOnly: true });
        if (selectedRows.length > 1) {
            historyCapture("mirror_copy_selected");
            const { inserted, sourceToClone } = duplicateRows(selectedRows, (row) => {
                const node = row?.ctx?.node;
                if (!node) return null;
                return mirrorCopyNode(node, { plane: mirrorPlane, offset: mirrorPlaneOffset });
            });
            if (!inserted.length) return false;
            ensureAxisEverywhere();
            postDuplicateApply(inserted, sourceToClone);
            showToast(`已镜像粘贴 ${inserted.length} 张卡片（${getMirrorPlaneDisplayLabel()}）`, "success");
            return true;
        }

        if (!focusedNodeId) return false;
        const ctx = findNodeContextById(focusedNodeId);
        if (!ctx || !Array.isArray(ctx.parentList)) return false;
        const cloned = mirrorCopyNode(ctx.node, { plane: mirrorPlane, offset: mirrorPlaneOffset });
        if (!cloned) return false;
        historyCapture("mirror_copy");
        ctx.parentList.splice(ctx.index + 1, 0, cloned);
        renderAll();
        requestAnimationFrame(() => {
            const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
            if (el) {
                try { el.focus(); } catch {}
                try { el.scrollIntoView({ block: "nearest" }); } catch {}
                setFocusedNode(cloned.id, false);
            }
        });
        showToast(`已镜像粘贴 1 张卡片（${getMirrorPlaneDisplayLabel()}）`, "success");
        return true;
    }

    function copySelectedReferenceGuide() {
        const guideId = referenceGuideController?.getSelectedGuideId?.() || "";
        if (!guideId) return false;
        const guide = referenceGuideController?.copyGuide?.(guideId);
        if (!guide) return false;
        showToast(`已复制参考线：${guide.name}`, "success");
        return true;
    }

    function mirrorCopySelectedReferenceGuide() {
        const guideId = referenceGuideController?.getSelectedGuideId?.() || "";
        if (!guideId) return false;
        const guide = referenceGuideController?.mirrorCopyGuide?.(guideId, {
            plane: mirrorPlane,
            offset: mirrorPlaneOffset
        });
        if (!guide) return false;
        showToast(`已镜像复制参考线：${guide.name}（${getMirrorPlaneDisplayLabel()}）`, "success");
        return true;
    }

    function deleteSelectedReferenceGuide() {
        const guide = referenceGuideController?.getSelectedGuide?.();
        if (!guide) return false;
        const deleted = referenceGuideController?.deleteSelectedGuide?.() === true;
        if (deleted) showToast(`已删除参考线：${guide.name}`, "success");
        return deleted;
    }

    function nodeContainsId(node, id) {
        if (!node) return false;
        if (node.id === id) return true;
        if (isBuilderContainerKind(node.kind) && Array.isArray(node.children)) {
            for (const c of node.children) if (nodeContainsId(c, id)) return true;
        }
        return false;
    }

      function moveNodeById(dragId, targetList, targetIndex, targetOwnerNode = null) {
          if (!dragId || !Array.isArray(targetList)) return false;
  
          const from = findNodeContextById(dragId);
          if (!from) return false;

        // 不能把节点拖进自己的子树（目标 owner 在拖拽节点子树中）
        if (targetOwnerNode && nodeContainsId(from.node, targetOwnerNode.id)) return false;

        const fromList = from.parentList;
        const fromIndex = from.index;

        // 过滤模式下，同列表只允许交换位置。
        const scopeId = targetOwnerNode ? targetOwnerNode.id : null;
        if (typeof isFilterActive === "function" && isFilterActive(scopeId) && fromList === targetList) {
            if (targetIndex < 0 || targetIndex >= targetList.length) return false;
            if (fromIndex === targetIndex) return false;
            swapInList(targetList, fromIndex, targetIndex);
            ensureAxisEverywhere();
            return true;
        }

          const originalLength = targetList.length;
          const [moved] = fromList.splice(fromIndex, 1);
  
          let idx = Math.max(0, Math.min(targetIndex, targetList.length));
          if (fromList === targetList && fromIndex < idx && targetIndex < originalLength) idx -= 1;
          targetList.splice(idx, 0, moved);

        ensureAxisEverywhere();
        return true;
    }

    function moveNodesByIds(dragIds, targetList, targetIndex, targetOwnerNode = null) {
        if (!Array.isArray(dragIds) || dragIds.length === 0 || !Array.isArray(targetList)) return false;
        const seen = new Set();
        const ids = [];
        for (const id of dragIds) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
        if (!ids.length) return false;

        let contexts = [];
        for (const id of ids) {
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node || !Array.isArray(ctx.parentList)) continue;
            contexts.push(ctx);
        }
        if (!contexts.length) return false;

        // 允许“部分可移动”：当多选里包含目标子卡片自身（或其祖先）时，仅跳过这些非法项。
        let movable = [];
        for (const ctx of contexts) {
            if (targetOwnerNode && nodeContainsId(ctx.node, targetOwnerNode.id)) continue;
            movable.push(ctx);
        }
        if (!movable.length) return false;

        const movableIds = new Set(movable.map((ctx) => ctx.node.id).filter(Boolean));
        movable = movable.filter((ctx) => {
            const path = findNodePathById(ctx.node.id);
            if (!Array.isArray(path) || path.length <= 1) return true;
            return !path.slice(0, -1).some((step) => step?.node?.id && movableIds.has(step.node.id));
        });
        if (!movable.length) return false;

        const scopeId = targetOwnerNode ? targetOwnerNode.id : null;
        if (typeof isFilterActive === "function" && isFilterActive(scopeId) && movable.some((ctx) => ctx.parentList === targetList)) {
            return false;
        }

        const movableById = new Map(movable.map((ctx) => [ctx.node.id, ctx]));
        movable = ids.map((id) => movableById.get(id)).filter(Boolean);

        let idx = Math.max(0, Math.min(targetIndex, targetList.length));
        let removedBefore = 0;
        for (const ctx of movable) {
            if (ctx.parentList === targetList && ctx.index < idx) removedBefore++;
        }
        idx = Math.max(0, idx - removedBefore);

        const byList = new Map();
        for (const ctx of movable) {
            const group = byList.get(ctx.parentList) || [];
            group.push(ctx);
            byList.set(ctx.parentList, group);
        }

        const movedById = new Map();
        for (const group of byList.values()) {
            group.sort((a, b) => b.index - a.index);
            for (const ctx of group) {
                const item = ctx.parentList.splice(ctx.index, 1)[0];
                if (item) movedById.set(ctx.node.id, item);
            }
        }

        const moved = movable.map((ctx) => movedById.get(ctx.node.id)).filter(Boolean);
        if (!moved.length) return false;

        idx = Math.max(0, Math.min(idx, targetList.length));
        targetList.splice(idx, 0, ...moved);
        ensureAxisEverywhere();
        return true;
    }

    function tryCopyWithBuilderIntoAddWith(dragId, targetOwnerNode) {
        if (!dragId || !targetOwnerNode || targetOwnerNode.kind !== "add_with") return false;
        const from = findNodeContextById(dragId);
        if (!from || !from.node || (from.node.kind !== "add_builder" && from.node.kind !== "with_builder")) return false;

        historyCapture("copy_addBuilder_into_addWith");
        if (!Array.isArray(targetOwnerNode.children)) targetOwnerNode.children = [];
        const cloned = cloneNodeListDeep(from.node.children || []);
        replaceListContents(targetOwnerNode.children, cloned);
        return true;
    }

    function handleBuilderDrop(info, targetList, targetIndex, targetOwnerNode) {
        if (!info || !Array.isArray(targetList)) return false;
        if (info.type !== "add_with_builder") return false;
        const srcCtx = findNodeContextById(info.ownerId);
        if (!srcCtx || !srcCtx.node || srcCtx.node.kind !== "add_with") return false;
        if (targetOwnerNode && targetOwnerNode.id === srcCtx.node.id) return false;

        historyCapture("drag_out_addWith_builder");
        const node = makeNode("add_builder");
        node.children = cloneNodeListDeep(srcCtx.node.children || []);

        const idx = Math.max(0, Math.min(targetIndex, targetList.length));
        targetList.splice(idx, 0, node);
        return true;
    }


    // -------------------------
    // Three.js
    // -------------------------
    let renderer, scene, camera, controls;
    let initialCameraState = null;
    let pointsObj = null;
    let compositionReferencePointsObj = null;
    let compositionReferencePointsBuf = null;
    let compositionReferenceColorsBuf = null;
    let compositionReferenceSizesBuf = null;
    let compositionReferenceAlphasBuf = null;
    let compositionReferencePointCount = 0;
    let compositionReferencePickObj = null;
    let compositionReferencePickBuf = null;
    let compositionReferencePickCount = 0;
    let addWithPreviewObj = null;
    let addWithPreviewBuf = null;
    let addWithPreviewCount = 0;
    let geometryCenterObj = null;
    let geometryCenterBuf = null;
    let geometryCenterCount = 0;
    let offsetPreviewObj = null;
    let offsetPreviewBuf = null;
    let offsetPreviewCount = 0;
    let linePickPreviewObj = null;
    let linePickPreviewBuf = null;
    let linePickPreviewCount = 0;
    let pointPickPreviewObj = null;
    let pointPickPreviewBuf = null;
    let pointPickPreviewCount = 0;
    let presetPreviewObj = null;
    let presetPreviewBuf = null;
    let presetPreviewCount = 0;
    let maskPreviewLineObj = null;
    let maskPreviewLineBuf = null;
    let maskPreviewLineCount = 0;
    let presetDragPointObj = null;
    let presetDragPointBuf = null;
    let pointPickPreviewRaf = 0;
    let pointPickPreviewPendingPoint = null;
    let pointPickPreviewLastTarget = null;
    let pointPickPreviewLastX = NaN;
    let pointPickPreviewLastY = NaN;
    let pointPickPreviewLastZ = NaN;
    let axesHelper, gridHelper, adaptiveGrid, axisLabelGroup;
    let mirrorHintGrid = null;
    let mirrorHintAdaptiveGrid = null;
    let mirrorHintGridExpireAt = 0;
    let lockPlaneGuide = null;
    let raycaster, mouse;
    let pickPlane;
    const SNAP_PLANES = {
        XZ: {label: "XZ", normal: new THREE.Vector3(0, 1, 0), axis: "XZ"},
        XY: {label: "XY", normal: new THREE.Vector3(0, 0, 1), axis: "XY"},
        ZY: {label: "ZY", normal: new THREE.Vector3(1, 0, 0), axis: "ZY"},
    };
    let snapPlane = "XZ";
    let mirrorPlane = "XZ";
    let mirrorPlaneOffset = 0;
    let hoverMarker = null;   // ✅ 实时跟随的红点
    let lastPoints = [];      // ✅ 当前预览点，用于“吸附到最近点”
    let lastCompositionReferencePoints = [];
    let lastAddWithPreviewPoints = [];
    let lastGeometryCenterPoints = [];
    let lastMaskPreviewPoints = [];
    let lastPickBasePoint = null;
    let lastPickMappedPoint = null;
    let lockPlaneActive = false;
    let lockPlaneBasePoint = null;

    // ✅ 点高亮：卡片获得焦点时，让该卡片“直接新增”的粒子变色
    let nodePointSegments = new Map(); // nodeId -> {start,end}
    let pointOwnerByIndex = null; // pointIndex -> nodeId（更细粒度优先）
    let suppressCardFocusOutClear = false; // 预览区点击时避免 focusout 清空焦点
    let focusedNodeId = null;          // 当前聚焦的卡片 id（或 null）
    let defaultColorBuf = null;        // Float32Array：默认颜色缓存（与 position 等长）
    const DEFAULT_POINT_HEX = 0xffffff;
    const FOCUS_POINT_HEX = 0xffcc33;
    const BEZIER_ANCHOR_HEX = 0x8d7bff;
    const BEZIER_SELECTED_HEX = 0xff6b9a;
    const SYNC_POINT_HEX = 0x5dd6ff;
    const OFFSET_POINT_HEX = 0xff6ad5;
    const ADD_WITH_PREVIEW_HEX = 0x63f5c8;
    const GEOMETRY_CENTER_HEX = 0xffb347;
    const OFFSET_PREVIEW_HEX = 0x8a8a8a;
    const LINE_PICK_PREVIEW_HEX = 0x33a1ff;
    const POINT_PICK_PREVIEW_HEX = 0x5dd6ff;
    const PRESET_PREVIEW_HEX = 0x6ecbff;
    const MASK_PREVIEW_HEX = 0x80d8ff;
    const ROTATE_POINT_HEX = 0x64f59d;
    const defaultPointColor = new THREE.Color(DEFAULT_POINT_HEX);
    const focusPointColor = new THREE.Color(FOCUS_POINT_HEX);
    const bezierAnchorColor = new THREE.Color(BEZIER_ANCHOR_HEX);
    const bezierSelectedColor = new THREE.Color(BEZIER_SELECTED_HEX);
    const syncPointColor = new THREE.Color(SYNC_POINT_HEX);
    const offsetPointColor = new THREE.Color(OFFSET_POINT_HEX);
    const addWithPreviewColor = new THREE.Color(ADD_WITH_PREVIEW_HEX);
    const geometryCenterColor = new THREE.Color(GEOMETRY_CENTER_HEX);
    const offsetPreviewColor = new THREE.Color(OFFSET_PREVIEW_HEX);
    const linePickPreviewColor = new THREE.Color(LINE_PICK_PREVIEW_HEX);
    const pointPickPreviewColor = new THREE.Color(POINT_PICK_PREVIEW_HEX);
    const presetPreviewColor = new THREE.Color(PRESET_PREVIEW_HEX);
    const maskPreviewColor = new THREE.Color(MASK_PREVIEW_HEX);
    const rotatePointColor = new THREE.Color(ROTATE_POINT_HEX);

    let pickMarkers = [];
    let pointSize = 0.5;     // ✅ 粒子大小（PointsMaterial.size）
    let previewDistanceTool = null;
    // line pick state (可指向主/任意子 builder)
    let linePickMode = false;
    let linePickType = "line"; // line | dotted_line | triangle
    let linePickRequiredPoints = 2;
    let picked = [];
    let bezierCreateState = null;
    let linePickTargetList = null;
    let linePickTargetLabel = "主Builder";
    // 插入位置（用于：在某个卡片后/某个 addBuilder 子列表末尾连续插入）
    let linePickInsertIndex = null;
    let linePickTargetOwnerNode = null;
    // 进入拾取前的聚焦卡片（用于：拾取新增后保持聚焦不丢失）
    let linePickKeepFocusId = null;
    // ✅ 解决：拾取直线时 pointerdown 处理完后仍会触发 click 事件，可能导致焦点被 onCanvasClick 清空
    let suppressNextCanvasClick = false;
    let suppressCanvasClickUntil = 0;
    let suppressCanvasClickPos = null;
    const SUPPRESS_CANVAS_CLICK_MS = 220;
    const SUPPRESS_CANVAS_CLICK_DIST = 8;
    // point pick state (for axis/start/end/vec3 fields)
    let pointPickMode = false;
    let pointPickTarget = null;
    let pointPickKeepFocusId = null;
    let pointPickHoverPoint = null;
    let pointPickPendingMapped = null;
    let pointPickCallback = null;
    let pointPickCallbackLabel = "";
    let pointPickCallbackRotate = false;
    let pointPickMenuAnchorX = NaN;
    let pointPickMenuAnchorY = NaN;
    let activeVecTarget = null;
    let offsetMode = false;
    let offsetTargetType = "node";
    let offsetTargetId = null;
    let offsetTargetIds = [];
    let offsetGuideId = null;
    let offsetRefPoint = null;
    let offsetHoverPoint = null;
    let offsetConstraintAxis = null;
    let offsetConstraintSpace = "world";
    let offsetConstraintVector = null;
    let offsetConstraintLastKey = "";
    let offsetConstraintLastAt = 0;
    const OFFSET_AXIS_DOUBLE_TAP_MS = 320;
    // Blender-style modal axis constraint shared by point picking and Bezier drags.
    let transformConstraintOperation = null;
    let transformConstraintOrigin = null;
    let transformConstraintNodeId = null;
    let transformConstraintAxis = null;
    let transformConstraintSpace = "world";
    let transformConstraintVector = null;
    let transformConstraintLastKey = "";
    let transformConstraintLastAt = 0;
    let rotateMode = false;
    let rotateTargetIds = [];
    let rotateBindings = [];
    let rotateSourceIds = [];
    let rotateAxis = null;
    let rotateCenter = null;
    let rotateCurrentDeg = 0;
    let rotateDragPointerId = null;
    let rotateDragStartPoint = null;
    let rotateDragStartDeg = 0;
    let rotateDragChanged = false;
    let rotateHistoryCaptured = false;
    let rotateManualInput = "";
    let bezierGuidePointsObj = null;
    let bezierGuideAnchorObj = null;
    let bezierGuideLineObj = null;
    let bezierGuideCurveObj = null;
    let bezierGuideMeta = [];
    let bezierGuideAnchorMeta = [];
    let bezierGuideNodeId = null;
    let bezierHandleDrag = null;
    let bezierSelectedNode = null;
    let bezierSelectedNodesByOwner = new Map();
    let bezierNodeMoveDrag = null;
    let bezierRotateTargetId = null;
    let bezierRotateSnapshots = null;
    const panKeyState = {ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false};
    const PAN_KEY_SPEED = 0.0025;
    const _panDir = new THREE.Vector3();
    const _panRight = new THREE.Vector3();
    const _panUp = new THREE.Vector3();
    const _panMove = new THREE.Vector3();

    let _rClickT = 0;
    let _rClickX = 0;
    let _rClickY = 0;
    const RDBL_MS = 320;  // 双击间隔
    const RDBL_PX = 7;    // 双击最大位移
    let _rDown = false;
    let _rMoved = false;
    let _rDownX = 0;
    let _rDownY = 0;
    const ACTION_MENU_DRAG_PX = 6;
    const ACTION_MENU_DRAG_SUPPRESS_MS = 240;
    let actionMenuRightTrack = null; // { pointerId, startX, startY, moved }
    let suppressActionMenuUntil = 0;

    function rememberPointPickMenuAnchor(ev) {
        if (!ev) return;
        if (Number.isFinite(ev.clientX)) pointPickMenuAnchorX = ev.clientX;
        if (Number.isFinite(ev.clientY)) pointPickMenuAnchorY = ev.clientY;
    }

    function resolvePointPickMenuAnchor() {
        if (Number.isFinite(pointPickMenuAnchorX) && Number.isFinite(pointPickMenuAnchorY)) {
            return { x: pointPickMenuAnchorX, y: pointPickMenuAnchorY };
        }
        if (renderer && renderer.domElement) {
            const rect = renderer.domElement.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.height > 0) {
                return {
                    x: rect.left + rect.width * 0.5,
                    y: rect.top + Math.min(rect.height * 0.5, Math.max(56, rect.height * 0.2))
                };
            }
        }
        return {
            x: (window.innerWidth || 0) * 0.5,
            y: Math.max(56, (window.innerHeight || 0) * 0.3)
        };
    }

    function bindPointPickMenuAnchorTracking() {
        if (window.__pbPointPickAnchorBound) return;
        window.__pbPointPickAnchorBound = true;
        window.addEventListener("pointermove", rememberPointPickMenuAnchor, true);
        window.addEventListener("pointerdown", rememberPointPickMenuAnchor, true);
    }

    const VIEW_BOX_DELAY_MS = 90;
    const VIEW_BOX_DRAG_START_PX = 2;
    let viewBoxEl = null;
    let viewBoxTimer = 0;
    let viewBoxPending = null; // { pointerId,startX,startY,ctrlKey,shiftKey }
    let viewBoxSelecting = false;
    let viewBoxRect = null; // {left,top,right,bottom}
    let viewBoxPointSelectionByOwner = new Map(); // ownerId -> Set(pointIndex)
    let viewBoxPreviewPointSelectionByOwner = new Map(); // ownerId -> Set(previewPointIndex)
    const _viewProjTmp = new THREE.Vector3();

    function isRightLike(ev) {
        // 1) 标准右键：button===2
        // 2) 右键按下位掩码：buttons&2
        // 3) macOS Ctrl+Click：button===0 且 ctrlKey=true
        return ev.button === 2 || (ev.buttons & 2) === 2 || (ev.button === 0 && ev.ctrlKey);
    }

    function beginActionMenuRightTrack(ev) {
        if (!ev || !isRightLike(ev)) return;
        actionMenuRightTrack = {
            pointerId: ev.pointerId,
            startX: Number(ev.clientX) || 0,
            startY: Number(ev.clientY) || 0,
            moved: false
        };
    }

    function updateActionMenuRightTrack(ev) {
        if (!actionMenuRightTrack || !ev) return;
        if (actionMenuRightTrack.pointerId !== undefined && ev.pointerId !== actionMenuRightTrack.pointerId) return;
        const dx = ev.clientX - actionMenuRightTrack.startX;
        const dy = ev.clientY - actionMenuRightTrack.startY;
        if (Math.hypot(dx, dy) > ACTION_MENU_DRAG_PX) actionMenuRightTrack.moved = true;
    }

    function endActionMenuRightTrack(ev, forceSuppress = false) {
        if (!actionMenuRightTrack) return;
        if (forceSuppress) {
            suppressActionMenuUntil = performance.now() + ACTION_MENU_DRAG_SUPPRESS_MS;
            actionMenuRightTrack = null;
            return;
        }
        if (!ev) return;
        if (actionMenuRightTrack.pointerId !== undefined && ev.pointerId !== actionMenuRightTrack.pointerId) return;
        updateActionMenuRightTrack(ev);
        if (actionMenuRightTrack.moved) {
            suppressActionMenuUntil = performance.now() + ACTION_MENU_DRAG_SUPPRESS_MS;
        }
        actionMenuRightTrack = null;
    }

    function shouldSuppressActionMenuByGesture(ev) {
        if (performance.now() < suppressActionMenuUntil) return true;
        if (!actionMenuRightTrack) return false;
        if (ev && Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY)) {
            const dx = ev.clientX - actionMenuRightTrack.startX;
            const dy = ev.clientY - actionMenuRightTrack.startY;
            if (Math.hypot(dx, dy) > ACTION_MENU_DRAG_PX) return true;
        }
        return !!actionMenuRightTrack.moved;
    }

    function armCanvasClickSuppress(ev = null, ttlMs = SUPPRESS_CANVAS_CLICK_MS) {
        suppressNextCanvasClick = true;
        suppressCanvasClickUntil = performance.now() + Math.max(0, Number(ttlMs) || 0);
        suppressCanvasClickPos = (ev && Number.isFinite(ev.clientX) && Number.isFinite(ev.clientY))
            ? { x: ev.clientX, y: ev.clientY }
            : null;
    }

    function shouldSuppressCanvasClick(ev) {
        if (!suppressNextCanvasClick) return false;
        const now = performance.now();
        if (now > suppressCanvasClickUntil) {
            suppressNextCanvasClick = false;
            suppressCanvasClickUntil = 0;
            suppressCanvasClickPos = null;
            return false;
        }
        if (ev && suppressCanvasClickPos) {
            const dx = ev.clientX - suppressCanvasClickPos.x;
            const dy = ev.clientY - suppressCanvasClickPos.y;
            if (Math.hypot(dx, dy) > SUPPRESS_CANVAS_CLICK_DIST) {
                suppressNextCanvasClick = false;
                suppressCanvasClickUntil = 0;
                suppressCanvasClickPos = null;
                return false;
            }
        }
        suppressNextCanvasClick = false;
        suppressCanvasClickUntil = 0;
        suppressCanvasClickPos = null;
        return true;
    }

    function blurActiveElementForCanvas() {
        suppressCardFocusOutClear = true;
        try {
            const ae = document.activeElement;
            if (ae && ae.blur) ae.blur();
        } catch {}
        suppressCardFocusOutClear = false;
    }

    function isArrowKey(code) {
        return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
    }

    function shouldIgnoreArrowPan() {
        if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden")) || (settingsModal && !settingsModal.classList.contains("hidden"))) return true;
        const ae = document.activeElement;
        if (!ae) return false;
        const tag = (ae.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA") return true;
        if (ae.isContentEditable) return true;
        return false;
    }

    function applyArrowPan() {
        if (!controls || !camera) return;
        if (!panKeyState.ArrowUp && !panKeyState.ArrowDown && !panKeyState.ArrowLeft && !panKeyState.ArrowRight) return;
        const dist = camera.position.distanceTo(controls.target);
        const step = Math.max(0.0001, dist * PAN_KEY_SPEED) * (controls.panSpeed || 1);
        camera.getWorldDirection(_panDir);
        _panRight.crossVectors(_panDir, camera.up).normalize();
        _panUp.copy(camera.up).normalize();
        _panMove.set(0, 0, 0);
        if (panKeyState.ArrowLeft) _panMove.addScaledVector(_panRight, -step);
        if (panKeyState.ArrowRight) _panMove.addScaledVector(_panRight, step);
        if (panKeyState.ArrowUp) _panMove.addScaledVector(_panUp, step);
        if (panKeyState.ArrowDown) _panMove.addScaledVector(_panUp, -step);
        if (_panMove.lengthSq() > 0) {
            controls.target.add(_panMove);
            camera.position.add(_panMove);
        }
    }

    function ensureHoverMarker() {
        if (hoverMarker) return;
        const geom = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({color: 0xff3333});
        hoverMarker = new THREE.Mesh(geom, mat);
        hoverMarker.visible = false;
        scene.add(hoverMarker);
    }

    function setHoverMarkerColor(hex) {
        ensureHoverMarker();
        hoverMarker.material.color.setHex(hex);
    }

    function colorForPickIndex(idx) {
        // idx=0：第一个点（红）；其余点（蓝）
        return idx === 0 ? 0xff3333 : 0x33a1ff;
    }

    function addPickMarker(p, hex) {
        const geom = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({color: hex});
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(p.x, p.y, p.z);
        scene.add(mesh);
        pickMarkers.push(mesh);
    }

    function clearPickMarkers() {
        if (!pickMarkers || pickMarkers.length === 0) return;
        if (!scene) {
            pickMarkers = [];
            return;
        }

        for (const m of pickMarkers) {
            try {
                scene.remove(m);
            } catch {
            }
            try {
                m.geometry && m.geometry.dispose && m.geometry.dispose();
            } catch {
            }
            try {
                m.material && m.material.dispose && m.material.dispose();
            } catch {
            }
        }
        pickMarkers = [];
    }

    function showHoverMarker(p) {
        ensureHoverMarker();
        hoverMarker.position.set(p.x, p.y, p.z);
        hoverMarker.visible = true;
    }

    function hideHoverMarker() {
        if (!hoverMarker) return;
        hoverMarker.visible = false;
    }

    function ensurePresetDragPointMarker() {
        if (presetDragPointObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        presetDragPointBuf = new Float32Array(3);
        geom.setAttribute("position", new THREE.BufferAttribute(presetDragPointBuf, 3));
        const mat = new THREE.PointsMaterial({
            size: Math.max(pointSize * 1.7, pointSize + 0.18),
            sizeAttenuation: true,
            color: pointPickPreviewColor.getHex(),
            transparent: true,
            opacity: 0.92,
            depthWrite: false
        });
        presetDragPointObj = new THREE.Points(geom, mat);
        presetDragPointObj.visible = false;
        scene.add(presetDragPointObj);
    }

    function showPresetDragPointMarker(point) {
        if (!point) {
            hidePresetDragPointMarker();
            return;
        }
        ensurePresetDragPointMarker();
        if (!presetDragPointObj || !presetDragPointBuf) return;
        const p = normalizePointValue(point);
        presetDragPointBuf[0] = p.x;
        presetDragPointBuf[1] = p.y;
        presetDragPointBuf[2] = p.z;
        const pos = presetDragPointObj.geometry?.getAttribute?.("position");
        if (pos) pos.needsUpdate = true;
        presetDragPointObj.geometry?.computeBoundingSphere?.();
        presetDragPointObj.visible = true;
    }

    function hidePresetDragPointMarker() {
        if (presetDragPointObj) presetDragPointObj.visible = false;
    }

    function clampNum(v, min, max) {
        const x = Number(v);
        if (!Number.isFinite(x)) return min;
        return Math.max(min, Math.min(max, x));
    }

    function setPointSize(v) {
        pointSize = clampNum(v, 0.001, 5);

        // ✅ 更新点云材质（不会重置相机）
        if (pointsObj && pointsObj.material) {
            pointsObj.material.size = pointSize;
            pointsObj.material.needsUpdate = true;
        }
        if (compositionReferencePointsObj && compositionReferencePointsObj.material) {
            compositionReferencePointsObj.material.size = Math.max(0.12, pointSize * 0.9);
            compositionReferencePointsObj.material.needsUpdate = true;
        }
        if (compositionReferencePickObj?.material) {
            compositionReferencePickObj.material.size = Math.max(0.12, pointSize * 0.9);
            compositionReferencePickObj.material.needsUpdate = true;
        }
        if (addWithPreviewObj && addWithPreviewObj.material) {
            addWithPreviewObj.material.size = Math.max(0.12, pointSize * 0.9);
            addWithPreviewObj.material.needsUpdate = true;
        }
        if (geometryCenterObj && geometryCenterObj.material) {
            geometryCenterObj.material.size = Math.max(0.14, pointSize * 1.1);
            geometryCenterObj.material.needsUpdate = true;
        }
        if (offsetPreviewObj && offsetPreviewObj.material) {
            offsetPreviewObj.material.size = pointSize;
            offsetPreviewObj.material.needsUpdate = true;
        }
        if (linePickPreviewObj && linePickPreviewObj.material) {
            linePickPreviewObj.material.size = pointSize;
            linePickPreviewObj.material.needsUpdate = true;
        }
        if (pointPickPreviewObj && pointPickPreviewObj.material) {
            pointPickPreviewObj.material.size = pointSize;
            pointPickPreviewObj.material.needsUpdate = true;
        }
        if (presetDragPointObj && presetDragPointObj.material) {
            presetDragPointObj.material.size = Math.max(pointSize * 1.7, pointSize + 0.18);
            presetDragPointObj.material.needsUpdate = true;
        }

    }

    function getSnapStep() {
        return snapStep;
    }
    function getPlaneInfo() {
        return SNAP_PLANES[snapPlane] || SNAP_PLANES.XZ;
    }

    function getMirrorPlaneInfo() {
        return SNAP_PLANES[mirrorPlane] || SNAP_PLANES.XZ;
    }

    function getMirrorPlaneDisplayLabel() {
        const axis = mirrorPlane === "XY" ? "Z" : (mirrorPlane === "ZY" ? "X" : "Y");
        const offset = Math.abs(mirrorPlaneOffset) < 1e-9
            ? "0"
            : Number(mirrorPlaneOffset.toFixed(6)).toString();
        return `${getMirrorPlaneInfo().label} · ${axis}=${offset}`;
    }

    function getGridHelperMaterials(helper) {
        if (!helper || !helper.material) return [];
        return Array.isArray(helper.material) ? helper.material : [helper.material];
    }

    function applyGridTransformForPlane(helper, planeKey, offset = -0.01) {
        if (!helper) return;
        const info = SNAP_PLANES[planeKey] || SNAP_PLANES.XZ;
        helper.rotation.set(0, 0, 0);
        if (info.axis === "XY") {
            helper.rotation.x = Math.PI / 2;
        } else if (info.axis === "ZY") {
            helper.rotation.z = -Math.PI / 2;
        }
        if (info.normal) {
            const off = Number.isFinite(Number(offset)) ? Number(offset) : -0.01;
            helper.position.set(info.normal.x * off, info.normal.y * off, info.normal.z * off);
        }
    }

    function getMirrorHintGridColor() {
        const base = new THREE.Color(readCssColor("--grid-color", "#617d9b"));
        return base.lerp(new THREE.Color(1, 1, 1), MIRROR_HINT_GRID_COLOR_MIX);
    }

    function setMirrorHintGridOpacity(opacity) {
        if (!mirrorHintGrid) return;
        const alpha = clamp(Number(opacity), 0, 1);
        if (mirrorHintAdaptiveGrid) {
            mirrorHintAdaptiveGrid.setOpacity(alpha);
            return;
        }
        for (const mat of getGridHelperMaterials(mirrorHintGrid)) {
            if (!mat) continue;
            mat.transparent = true;
            mat.opacity = alpha;
            mat.depthWrite = false;
            mat.depthTest = false;
            mat.needsUpdate = true;
        }
    }

    function updateMirrorPlaneHintTheme() {
        if (!mirrorHintGrid) return;
        const color = getMirrorHintGridColor();
        if (mirrorHintAdaptiveGrid) {
            mirrorHintAdaptiveGrid.setColor(color);
            return;
        }
        for (const mat of getGridHelperMaterials(mirrorHintGrid)) {
            if (!mat || !mat.color) continue;
            mat.color.copy(color);
            mat.needsUpdate = true;
        }
    }

    function ensureMirrorPlaneHintGrid() {
        if (mirrorHintGrid || !scene) return mirrorHintGrid;
        const color = getMirrorHintGridColor();
        mirrorHintAdaptiveGrid = createAdaptiveGrid({
            scene,
            camera,
            controls,
            renderer,
            color,
            visible: false,
            plane: mirrorPlane,
            offset: mirrorPlaneOffset + MIRROR_HINT_GRID_OFFSET,
        });
        mirrorHintGrid = mirrorHintAdaptiveGrid?.mesh || null;
        if (!mirrorHintGrid) return null;
        mirrorHintGrid.visible = false;
        mirrorHintGrid.renderOrder = 18;
        mirrorHintAdaptiveGrid.material.depthTest = false;
        mirrorHintAdaptiveGrid.material.needsUpdate = true;
        mirrorHintAdaptiveGrid.setPlane(mirrorPlane, mirrorPlaneOffset + MIRROR_HINT_GRID_OFFSET);
        setMirrorHintGridOpacity(0);
        return mirrorHintGrid;
    }

    function triggerMirrorPlaneHint(planeKey, planeOffset = mirrorPlaneOffset) {
        const helper = ensureMirrorPlaneHintGrid();
        if (!helper) return;
        const displayOffset = num(planeOffset) + MIRROR_HINT_GRID_OFFSET;
        if (mirrorHintAdaptiveGrid) mirrorHintAdaptiveGrid.setPlane(planeKey, displayOffset);
        else applyGridTransformForPlane(helper, planeKey, displayOffset);
        updateMirrorPlaneHintTheme();
        mirrorHintGridExpireAt = performance.now() + MIRROR_HINT_GRID_DURATION_MS;
        helper.visible = true;
        setMirrorHintGridOpacity(MIRROR_HINT_GRID_MAX_OPACITY);
    }

    function updateMirrorPlaneHint() {
        if (!mirrorHintGrid || !mirrorHintGrid.visible) return;
        const now = performance.now();
        if (!(mirrorHintGridExpireAt > 0)) {
            mirrorHintGrid.visible = false;
            return;
        }
        const remain = mirrorHintGridExpireAt - now;
        if (remain <= 0) {
            mirrorHintGrid.visible = false;
            mirrorHintGridExpireAt = 0;
            setMirrorHintGridOpacity(0);
            return;
        }
        const t = clamp(remain / MIRROR_HINT_GRID_DURATION_MS, 0, 1);
        setMirrorHintGridOpacity(MIRROR_HINT_GRID_MAX_OPACITY * t * t);
        if (mirrorHintAdaptiveGrid) mirrorHintAdaptiveGrid.update();
    }

    function updateGridForPlane() {
        if (adaptiveGrid) adaptiveGrid.setPlane(snapPlane, -0.01);
        updateLockPlaneGuideVisual();
    }

    function ensureLockPlaneGuide() {
        if (lockPlaneGuide || !scene) return lockPlaneGuide;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.LineBasicMaterial({
            color: LOCK_AXIS_GUIDE_COLOR,
            transparent: true,
            opacity: 0.94,
            depthTest: false,
            depthWrite: false
        });
        lockPlaneGuide = new THREE.LineSegments(geom, mat);
        lockPlaneGuide.visible = false;
        lockPlaneGuide.renderOrder = 20;
        scene.add(lockPlaneGuide);
        return lockPlaneGuide;
    }

    function updateLockPlaneGuideVisual() {
        if (!scene) return;
        const guide = ensureLockPlaneGuide();
        if (!guide) return;
        const offsetGuideActive = !!(offsetMode && offsetRefPoint && offsetConstraintVector);
        const transformGuideActive = !!(transformConstraintOperation
            && transformConstraintOrigin && transformConstraintVector);
        const planeGuideActive = !!(lockPlaneActive && lockPlaneBasePoint && shouldApplyLockPlane());
        if (!offsetGuideActive && !transformGuideActive && !planeGuideActive) {
            guide.visible = false;
            return;
        }

        const base = offsetGuideActive
            ? offsetRefPoint
            : transformGuideActive
                ? transformConstraintOrigin
                : lockPlaneBasePoint;
        const guideVector = offsetGuideActive
            ? offsetConstraintVector
            : transformGuideActive
                ? transformConstraintVector
                : getPlaneNormalVector();
        const n = new THREE.Vector3(guideVector.x, guideVector.y, guideVector.z).normalize();
        const halfLen = Math.max(1, Number(GRID_HELPER_SIZE) * 0.5);
        const tickStep = Math.max(0.001, Number(LOCK_AXIS_TICK_STEP) || 1);
        const tickEachSide = Math.max(0, Math.floor(halfLen / tickStep));
        const tickCount = tickEachSide * 2 + 1;

        const viewDir = (camera && camera.position)
            ? new THREE.Vector3(camera.position.x - base.x, camera.position.y - base.y, camera.position.z - base.z)
            : new THREE.Vector3(0, 1, 0);
        const nDotView = n.dot(viewDir);
        const tickDirA = viewDir.clone().addScaledVector(n, -nDotView);
        if (tickDirA.lengthSq() < 1e-8) tickDirA.crossVectors(n, new THREE.Vector3(0, 1, 0));
        if (tickDirA.lengthSq() < 1e-8) tickDirA.crossVectors(n, new THREE.Vector3(1, 0, 0));
        if (tickDirA.lengthSq() < 1e-8) tickDirA.set(0, 0, 1);
        tickDirA.normalize();

        const tickDirB = new THREE.Vector3().crossVectors(n, tickDirA);
        if (tickDirB.lengthSq() < 1e-8) tickDirB.crossVectors(n, new THREE.Vector3(1, 0, 0));
        if (tickDirB.lengthSq() < 1e-8) tickDirB.crossVectors(n, new THREE.Vector3(0, 0, 1));
        if (tickDirB.lengthSq() < 1e-8) tickDirB.set(0, 1, 0);
        tickDirB.normalize();

        const segmentCount = 1 + tickCount * 2;
        const pos = new Float32Array(segmentCount * 2 * 3);
        let o = 0;

        const sx = base.x - n.x * halfLen;
        const sy = base.y - n.y * halfLen;
        const sz = base.z - n.z * halfLen;
        const ex = base.x + n.x * halfLen;
        const ey = base.y + n.y * halfLen;
        const ez = base.z + n.z * halfLen;

        pos[o++] = sx; pos[o++] = sy; pos[o++] = sz;
        pos[o++] = ex; pos[o++] = ey; pos[o++] = ez;

        for (let i = -tickEachSide; i <= tickEachSide; i++) {
            const dist = i * tickStep;
            const cx = base.x + n.x * dist;
            const cy = base.y + n.y * dist;
            const cz = base.z + n.z * dist;

            pos[o++] = cx - tickDirA.x * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cy - tickDirA.y * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cz - tickDirA.z * LOCK_AXIS_TICK_HALF_LEN;

            pos[o++] = cx + tickDirA.x * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cy + tickDirA.y * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cz + tickDirA.z * LOCK_AXIS_TICK_HALF_LEN;

            pos[o++] = cx - tickDirB.x * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cy - tickDirB.y * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cz - tickDirB.z * LOCK_AXIS_TICK_HALF_LEN;

            pos[o++] = cx + tickDirB.x * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cy + tickDirB.y * LOCK_AXIS_TICK_HALF_LEN;
            pos[o++] = cz + tickDirB.z * LOCK_AXIS_TICK_HALF_LEN;
        }

        guide.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        guide.geometry.computeBoundingSphere();
        guide.visible = true;
    }

    function makeAxisLabelSprite(text, colorHex) {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, size, size);
        ctx.font = "bold 56px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, size / 2, size / 2);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 6;
        ctx.strokeText(text, size / 2, size / 2);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({map: tex, transparent: true, color: colorHex});
        const sprite = new THREE.Sprite(mat);
        sprite.material.depthTest = false;
        sprite.renderOrder = 10;
        return sprite;
    }

    function buildAxisLabels() {
        if (!scene) return;
        if (axisLabelGroup) {
            scene.remove(axisLabelGroup);
        }
        axisLabelGroup = new THREE.Group();
        const len = 5.6;
        const sx = makeAxisLabelSprite("+X", 0xff5555);
        const sy = makeAxisLabelSprite("+Y", 0x55ff55);
        const sz = makeAxisLabelSprite("+Z", 0x5599ff);
        sx.position.set(len, 0, 0);
        sy.position.set(0, len, 0);
        sz.position.set(0, 0, len);
        axisLabelGroup.add(sx, sy, sz);
        axisLabelGroup.visible = !!(chkAxes && chkAxes.checked);
        scene.add(axisLabelGroup);
        updateAxisLabelScale();
    }

    function updateAxisLabelScale() {
        if (!axisLabelGroup || !camera || !controls) return;
        const dist = camera.position.distanceTo(controls.target);
        const scale = Math.max(0.6, dist * 0.04);
        axisLabelGroup.children.forEach((s) => {
            s.scale.set(scale, scale, scale);
        });
    }

    function mapHitToPlaneRaw(hitVec3) {
        const plane = getPlaneInfo().axis;
        if (plane === "XY") return {x: hitVec3.x, y: hitVec3.y, z: 0};
        if (plane === "ZY") return {x: 0, y: hitVec3.y, z: hitVec3.z};
        return {x: hitVec3.x, y: 0, z: hitVec3.z};
    }

    function getPlaneNormalAxisKeyByPlane(plane) {
        if (plane === "XY") return "z";
        if (plane === "ZY") return "x";
        return "y";
    }

    function getPlaneNormalAxisKey() {
        return getPlaneNormalAxisKeyByPlane(getPlaneInfo().axis);
    }

    function getPlaneNormalVector() {
        const plane = getPlaneInfo().axis;
        if (plane === "XY") return new THREE.Vector3(0, 0, 1);
        if (plane === "ZY") return new THREE.Vector3(1, 0, 0);
        return new THREE.Vector3(0, 1, 0);
    }

    function getBezierHandleWorldPointByDragState(dragState = bezierHandleDrag) {
        if (!dragState || !dragState.nodeId || !dragState.role) return null;
        const guide = getBezierGuideDataByNodeId(dragState.nodeId);
        if (!guide) return null;
        if (Array.isArray(guide.nodes) && Number.isInteger(dragState.nodeIndex)) {
            const item = guide.nodes[dragState.nodeIndex];
            if (!item) return null;
            const prefix = dragState.role === "sh" ? "sh" : "eh";
            const inferred = getBezierGuideHandleOffset(guide.nodes, dragState.nodeIndex, dragState.role, guide.closed);
            return mapBezierGuidePointToDisplay({
                x: num(item.x) + num(inferred.x),
                y: num(item.y) + num(inferred.y),
                z: num(item.z) + num(inferred.z)
            }, dragState.nodeId);
        }
        if (dragState.role === "sh" && guide.c1) return mapBezierGuidePointToDisplay(guide.c1, dragState.nodeId);
        if (dragState.role === "eh" && guide.c2) return mapBezierGuidePointToDisplay(guide.c2, dragState.nodeId);
        return null;
    }

    function shouldApplyLockPlane() {
        return !!(linePickMode || pointPickMode || offsetMode || draggingPresetId || bezierHandleDrag || bezierCreateState);
    }

    function snapValue(v, step) {
        const s = Number(step) || 1;
        if (s <= 0) return v;
        return Math.round(v / s) * s;
    }

    function mapPickPointLockedFromRay(ray) {
        if (!ray || !lockPlaneBasePoint) return null;
        const base = lockPlaneBasePoint;
        const n = getPlaneNormalVector();
        const o = ray.origin;
        const d = ray.direction;
        const w0 = new THREE.Vector3(base.x - o.x, base.y - o.y, base.z - o.z);
        const a = d.dot(d);
        const b = d.dot(n);
        const c = n.dot(n);
        const d0 = d.dot(w0);
        const e0 = n.dot(w0);
        const denom = a * c - b * b;
        let v;
        if (Math.abs(denom) < 1e-8) {
            v = (c > 0 ? e0 / c : 0);
        } else {
            // Closest-point solution on line(base + n*v) vs ray(o + d*t).
            // Keep sign consistent with axis direction: down drag should decrease Y in XZ lock mode.
            v = (b * d0 - a * e0) / denom;
        }
        const p = {
            x: base.x + n.x * v,
            y: base.y + n.y * v,
            z: base.z + n.z * v
        };
        const axisKey = getPlaneNormalAxisKey();
        p[axisKey] = snapValue(p[axisKey], getSnapStep());
        return p;
    }

    function mapOffsetPointFromRay(ray) {
        if (!ray || !offsetMode || !offsetRefPoint || !offsetConstraintVector) return null;
        const axis = normalizeOffsetConstraintVector(offsetConstraintVector);
        if (!axis) return null;
        const base = offsetRefPoint;
        const o = ray.origin;
        const d = ray.direction;
        const w0 = new THREE.Vector3(base.x - o.x, base.y - o.y, base.z - o.z);
        const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z);
        const a = d.dot(d);
        const b = d.dot(axisVector);
        const c = axisVector.dot(axisVector);
        const d0 = d.dot(w0);
        const e0 = axisVector.dot(w0);
        const denom = a * c - b * b;
        const amount = Math.abs(denom) < 1e-8
            ? (c > 0 ? e0 / c : 0)
            : (b * d0 - a * e0) / denom;
        return {
            x: base.x + axis.x * amount,
            y: base.y + axis.y * amount,
            z: base.z + axis.z * amount
        };
    }

    function mapTransformPointFromRay(ray) {
        if (!ray || !transformConstraintOperation || !transformConstraintOrigin || !transformConstraintVector) return null;
        const axis = normalizeOffsetConstraintVector(transformConstraintVector);
        if (!axis) return null;
        const base = transformConstraintOrigin;
        const o = ray.origin;
        const d = ray.direction;
        const w0 = new THREE.Vector3(base.x - o.x, base.y - o.y, base.z - o.z);
        const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z);
        const a = d.dot(d);
        const b = d.dot(axisVector);
        const c = axisVector.dot(axisVector);
        const d0 = d.dot(w0);
        const e0 = axisVector.dot(w0);
        const denom = a * c - b * b;
        const amount = Math.abs(denom) < 1e-8
            ? (c > 0 ? e0 / c : 0)
            : (b * d0 - a * e0) / denom;
        return {
            x: base.x + axis.x * amount,
            y: base.y + axis.y * amount,
            z: base.z + axis.z * amount
        };
    }

    function snapToGridOnPlane(p, step, planeKey) {
        const s = step || 1;
        const plane = planeKey || getPlaneInfo().axis;
        if (plane === "XY") {
            return {x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s, z: p.z};
        }
        if (plane === "ZY") {
            return {x: p.x, y: Math.round(p.y / s) * s, z: Math.round(p.z / s) * s};
        }
        return {x: Math.round(p.x / s) * s, y: p.y, z: Math.round(p.z / s) * s};
    }

    function dist2OnPlane(a, b, planeKey) {
        const plane = planeKey || getPlaneInfo().axis;
        if (plane === "XY") {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            return dx * dx + dy * dy;
        }
        if (plane === "ZY") {
            const dy = a.y - b.y;
            const dz = a.z - b.z;
            return dy * dy + dz * dz;
        }
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return dx * dx + dz * dz;
    }

    function nearestPointCandidate(ref, maxDist = particleSnapRange, planeKey = getPlaneInfo().axis) {
        const referencePoints = compositionReferencePointsObj?.visible ? (lastCompositionReferencePoints || []) : [];
        if ((!lastPoints || lastPoints.length === 0) && referencePoints.length === 0) return null;
        const plane = planeKey || getPlaneInfo().axis;
        const normalAxis = getPlaneNormalAxisKeyByPlane(plane);
        const refNormal = Number(ref?.[normalAxis]);
        let best = null;
        let bestD2 = Infinity;
        for (const q of [...(lastPoints || []), ...referencePoints]) {
            if (!q) continue;
            const qNormal = Number(q[normalAxis]);
            if (Number.isFinite(refNormal) && Number.isFinite(qNormal) && Math.abs(qNormal - refNormal) > maxDist) {
                continue;
            }
            const d2 = dist2OnPlane(ref, q, plane);
            if (d2 < bestD2) {
                bestD2 = d2;
                best = q;
            }
        }
        if (!best) return null;
        const limit2 = maxDist * maxDist;
        if (bestD2 > limit2) return null;
        return {point: {x: best.x, y: best.y, z: best.z}, d2: bestD2};
    }

    function nearestHelperPointCandidate(ref, helperType, maxDist = particleSnapRange, planeKey = getPlaneInfo().axis) {
        if (!helperType || !lastGeometryCenterPoints || lastGeometryCenterPoints.length === 0) return null;
        const plane = planeKey || getPlaneInfo().axis;
        const normalAxis = getPlaneNormalAxisKeyByPlane(plane);
        const refNormal = Number(ref?.[normalAxis]);
        let best = null;
        let bestD2 = Infinity;
        for (const q of lastGeometryCenterPoints) {
            if (!q || q.helperType !== helperType) continue;
            const qNormal = Number(q[normalAxis]);
            if (Number.isFinite(refNormal) && Number.isFinite(qNormal) && Math.abs(qNormal - refNormal) > maxDist) {
                continue;
            }
            const d2 = dist2OnPlane(ref, q, plane);
            if (d2 < bestD2) {
                bestD2 = d2;
                best = q;
            }
        }
        if (!best) return null;
        const limit2 = maxDist * maxDist;
        if (bestD2 > limit2) return null;
        return { point: { x: best.x, y: best.y, z: best.z }, d2: bestD2 };
    }

    function normalizeParticleSnapContext(raw) {
        if (!raw) return { point: null, fromHit: false, source: "" };
        if (raw.point && typeof raw === "object") {
            return {
                point: raw.point ? { x: raw.point.x, y: raw.point.y, z: raw.point.z } : null,
                fromHit: raw.fromHit === true,
                source: String(raw.source || "")
            };
        }
        return { point: { x: raw.x, y: raw.y, z: raw.z }, fromHit: true, source: "particle" };
    }

    function mapPickPointBase(hitVec3, particleSnap = null) {
        const raw = mapHitToPlaneRaw(hitVec3);
        const particleContext = normalizeParticleSnapContext(particleSnap);
        const snapRange = particleSnapRange;
        const plane = getPlaneInfo().axis;
        for (const source of normalizeSnapPriority(snapPriority)) {
            if (source === "line_division") {
                if (lineDivisionPoints <= 0) continue;
                if (particleContext.point && particleContext.source === "line_division") return particleContext.point;
                const cand = nearestHelperPointCandidate(raw, "line_division", snapRange, plane);
                if (cand && cand.point) return cand.point;
                continue;
            }
            if (source === "reference_guide") {
                const candidate = referenceGuideController?.findSnapCandidate?.(raw, plane, snapRange, {
                    excludeIds: offsetTargetType === "guide" && offsetGuideId ? [offsetGuideId] : [],
                    includeEndpoints: !chkSnapReferenceEndpoints || chkSnapReferenceEndpoints.checked
                });
                if (candidate?.point) return candidate.point;
                continue;
            }
            if (source === "geometry_center") {
                if (!geometryCenterPreviewEnabled) continue;
                if (particleContext.point && particleContext.source === "geometry_center") return particleContext.point;
                const cand = nearestHelperPointCandidate(raw, "geometry_center", snapRange, plane);
                if (cand && cand.point) return cand.point;
                continue;
            }
            if (source === "grid") {
                if (!(chkSnapGrid && chkSnapGrid.checked)) continue;
                return snapToGridOnPlane(raw, getSnapStep(), plane);
            }
            if (source === "particle") {
                if (!(chkSnapParticle && chkSnapParticle.checked)) continue;
                if (particleContext.point && (!particleContext.source || particleContext.source === "particle")) return particleContext.point;
                const cand = nearestPointCandidate(raw, snapRange, plane);
                if (cand && cand.point) return cand.point;
            }
        }
        return raw;
    }

    function mapPickPoint(hitVec3, particleSnap = null) {
        const base = mapPickPointBase(hitVec3, particleSnap);
        lastPickBasePoint = base ? {x: base.x, y: base.y, z: base.z} : null;
        lastPickMappedPoint = base ? {x: base.x, y: base.y, z: base.z} : null;
        return base;
    }

    function updatePickHoverFromMapped(mapped, pointerId = null, ev = null) {
        if (!mapped) {
            hideHoverMarker();
            if (linePickMode) hideLinePickPreview();
            if (pointPickMode) {
                pointPickHoverPoint = null;
                hidePointPickPreview();
                if (pointPickCallback && pointPickCallback.__presetPreview) clearPresetPreview();
            }
            if (offsetMode) {
                offsetHoverPoint = null;
                updateOffsetPreview(null);
            }
            return;
        }

        if (linePickMode) {
            setHoverMarkerColor(colorForPickIndex((picked?.length || 0) >= 1 ? 1 : 0));
            if (picked && picked.length >= 1) updateLinePickPreview(mapped);
            else hideLinePickPreview();
        } else if (pointPickMode) {
            setHoverMarkerColor(0xffcc33);
            pointPickHoverPoint = mapped;
            if (pointPickCallback && pointPickCallback.__presetPreview) {
                previewPreset(pointPickCallback.__presetPreview, mapped);
            } else {
                queuePointPickPreview(mapped);
            }
        } else if (offsetMode) {
            setHoverMarkerColor(offsetPointColor.getHex());
            offsetHoverPoint = mapped;
            updateOffsetPreview(mapped);
        } else if (rotateMode) {
            setHoverMarkerColor(rotatePointColor.getHex());
            if (rotateDragPointerId !== null && (pointerId === null || pointerId === rotateDragPointerId)) {
                updateRotateFromMappedPoint(mapped, ev);
            }
        }
        showHoverMarker(mapped);
    }

    function updateSnapModeStatus() {
        if (!statusSnapMode) return;
        if (offsetMode && offsetConstraintVector) {
            statusSnapMode.textContent = `移动轴：${offsetConstraintLabel()}`;
            statusSnapMode.classList.remove("hidden");
            return;
        }
        if (transformConstraintOperation && transformConstraintVector) {
            statusSnapMode.textContent = `移动轴：${transformConstraintLabel()}`;
            statusSnapMode.classList.remove("hidden");
            return;
        }
        if (!lockPlaneActive || !shouldApplyLockPlane()) {
            statusSnapMode.classList.add("hidden");
            return;
        }
        const label = getPlaneInfo().label;
        const axisKey = getPlaneNormalAxisKey().toUpperCase();
        statusSnapMode.textContent = `锁定平面：${label}（仅 ${axisKey}）`;
        statusSnapMode.classList.remove("hidden");
    }

    function setLockPlaneActive(next) {
        const active = next === true;
        if (active && !shouldApplyLockPlane()) {
            updateSnapModeStatus();
            updateLockPlaneGuideVisual();
            return false;
        }
        if (lockPlaneActive === active) return lockPlaneActive;
        lockPlaneActive = active;
        if (lockPlaneActive) {
            const base = getBezierHandleWorldPointByDragState() || lastPickMappedPoint || lastPickBasePoint;
            if (!base) {
                lockPlaneActive = false;
                updateSnapModeStatus();
                updateLockPlaneGuideVisual();
                return false;
            }
            lockPlaneBasePoint = {x: base.x, y: base.y, z: base.z};
        } else {
            lockPlaneBasePoint = null;
        }
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
        return lockPlaneActive;
    }

    function updatePickLineButtons() {
        const label = getPlaneInfo().label;
        if (btnPickLine) btnPickLine.textContent = `${label} 绘制直线`;
        if (btnPickTriangle) btnPickTriangle.textContent = `${label} 绘制三角形`;
        document.querySelectorAll("[data-pick-line-btn]").forEach((el) => {
            el.textContent = `${label}绘制直线`;
        });
        if (btnPickPoint) btnPickPoint.textContent = `${label} 点拾取`;
    }

    function updateMirrorButtons() {
        const label = getMirrorPlaneDisplayLabel();
        document.querySelectorAll("[data-mirror-btn]").forEach((el) => {
            el.title = `镜像复制（${label}）`;
        });
    }

    function setSnapPlane(next) {
        const key = SNAP_PLANES[next] ? next : "XZ";
        snapPlane = key;
        setLockPlaneActive(false);
        lastPickBasePoint = null;
        lastPickMappedPoint = null;
        if (selSnapPlane && selSnapPlane.value !== key) selSnapPlane.value = key;
        applyPickPlane();
    }

    function setMirrorPlane(next, options = {}) {
        const key = SNAP_PLANES[next] ? next : "XZ";
        mirrorPlane = key;
        const requestedOffset = Number(options.offset);
        mirrorPlaneOffset = Number.isFinite(requestedOffset) ? requestedOffset : 0;
        if (selMirrorPlane && selMirrorPlane.value !== key) selMirrorPlane.value = key;
        updateMirrorButtons();
        triggerMirrorPlaneHint(key, mirrorPlaneOffset);
    }

    function applyMeasuredMirrorPlane(result) {
        const axis = String(result?.axis || "").toUpperCase();
        const plane = axis === "X" ? "ZY" : (axis === "Y" ? "XZ" : (axis === "Z" ? "XY" : ""));
        const key = axis.toLowerCase();
        if (!plane || !key || !result?.pointA || !result?.pointB) return;
        const offset = (num(result.pointA[key]) + num(result.pointB[key])) * 0.5;
        setMirrorPlane(plane, { offset });
    }

    function commitMeasuredReferenceGuide(result) {
        const guide = referenceGuideController?.addGuideFromMeasurement?.(result);
        if (!guide) return false;
        applyMeasuredMirrorPlane(result);
        return true;
    }

    function applyPickPlane() {
        if (!pickPlane) pickPlane = new THREE.Plane();
        const info = getPlaneInfo();
        pickPlane.set(info.normal, 0);
        updatePickLineButtons();
        updateGridForPlane();
        if (linePickMode) {
            setLinePickStatus(buildLinePickProgressStatus(info.label));
        }
        if (pointPickMode) {
            refreshPointPickStatus();
        }
        if (rotateMode) {
            refreshRotateStatus();
        }
    }

    function initThree() {
        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(threeHost.clientWidth, threeHost.clientHeight);
        threeHost.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        compositionReferenceSceneReady = true;

        camera = new THREE.PerspectiveCamera(55, threeHost.clientWidth / threeHost.clientHeight, 0.01, 1000000);
        camera.position.set(10, 10, 10);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        // 旋转改为中键，其它操作保持（左键不再旋转）
        controls.mouseButtons.LEFT = null;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        controls.addEventListener("change", () => {
            if (focusedNodeId || bezierGuideNodeId) updateBezierGuidePreview();
        });
        captureInitialCamera();
        axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);
        buildAxisLabels();
        if (chkAxes) axesHelper.visible = chkAxes.checked;

        adaptiveGrid = createAdaptiveGrid({
            scene,
            camera,
            controls,
            renderer,
            color: readCssColor("--grid-color", "#617d9b"),
            visible: chkGrid ? chkGrid.checked : true,
            plane: snapPlane,
            offset: -0.01,
        });
        gridHelper = adaptiveGrid?.mesh || null;
        if (new URLSearchParams(window.location.search || "").has("__perfDebug")) {
            globalThis.__pointsBuilderPreviewDebug = () => ({
                gridVisible: gridHelper?.visible,
                adaptive: !!adaptiveGrid,
                material: adaptiveGrid?.material?.type,
                uniforms: adaptiveGrid?.material?.uniforms,
                camera: camera?.position?.toArray?.(),
                target: controls?.target?.toArray?.(),
            });
        }
        ensureLockPlaneGuide();
        if (chkGrid) gridHelper.visible = chkGrid.checked;
        applySceneTheme();

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(10, 20, 10);
        scene.add(dir);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        pickPlane = new THREE.Plane(getPlaneInfo().normal.clone(), 0);
        const isReferenceGuideInteractionBlocked = () => !!(
            linePickMode
            || pointPickMode
            || offsetMode
            || rotateMode
            || bezierCreateState
            || bezierHandleDrag
            || bezierNodeMoveDrag
            || viewBoxSelecting
            || previewDistanceTool?.isActive?.()
        );
        referenceGuideController = createReferenceGuideController({
            scene,
            camera,
            controls,
            renderer,
            root: elReferenceGuidesRoot,
            getGuides: () => {
                if (!Array.isArray(state.guides)) state.guides = [];
                return state.guides;
            },
            createId: uid,
            captureHistory: historyCapture,
            onChange: (options = {}) => {
                if (offsetMode
                    && offsetTargetType === "guide"
                    && options.guideId === offsetGuideId) {
                    stopOffsetMode();
                }
                scheduleAutoSave();
                renderSnapPriorityList();
                if (rightPanelPage === "params" && options.renderEditor !== false) {
                    scheduleParamEditorRender();
                }
            },
            onSelect: (guideId, options = {}) => {
                if (!guideId) {
                    if (rightPanelPage === "params") scheduleParamEditorRender();
                    return;
                }
                if (options.source === "canvas" && options.event) armCanvasClickSuppress(options.event);
                setFocusedNode(null, false);
                if (typeof clearCardSelectionIds === "function") clearCardSelectionIds();
                setBuilderColumnPage("guides");
                setRightPanelPage("params");
            },
            isInteractionBlocked: isReferenceGuideInteractionBlocked
        });
        gridInspector = createGridInspector({
            scene,
            camera,
            controls,
            renderer,
            host: threeHost,
            adaptiveGrid,
            getPlane: () => snapPlane,
            isVisible: () => !!(chkGrid && chkGrid.checked),
            isAxesVisible: () => !!(chkAxes && chkAxes.checked),
            isInteractionBlocked: isReferenceGuideInteractionBlocked
        });
        updatePickLineButtons();
        updateGridForPlane();
        updateMirrorButtons();
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();

        window.addEventListener("resize", onResize);
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        window.addEventListener("keydown", onBezierPreviewModifierKeyDown, true);
        window.addEventListener("keyup", onBezierPreviewModifierKeyUp, true);
        window.addEventListener("blur", onBezierPreviewModifierBlur);
        renderer.domElement.addEventListener("pointercancel", (ev) => {
            if (bezierHandleDrag && ev && ev.pointerId === bezierHandleDrag.pointerId) {
                cancelBezierHandleDrag(ev, { restore: true, suppressClick: true });
            }
            if (bezierCreateState && ev && ev.pointerId === bezierCreateState.pointerId) {
                cancelActiveTransformOperation();
            }
            if (bezierNodeMoveDrag && ev && ev.pointerId === bezierNodeMoveDrag.pointerId) {
                cancelBezierNodeMoveDrag(ev, { restore: true, suppressClick: true });
            }
            if (actionMenuRightTrack && ev && ev.pointerId === actionMenuRightTrack.pointerId) {
                endActionMenuRightTrack(ev, true);
            }
            if (viewBoxPending && ev && ev.pointerId === viewBoxPending.pointerId) {
                clearViewBoxState(ev.pointerId);
            }
            if (rotateMode && ev && rotateDragPointerId !== null && ev.pointerId === rotateDragPointerId) {
                rotateDragPointerId = null;
                rotateDragStartPoint = null;
                stopRotateMode({ silent: true });
            }
            if (offsetMode) stopOffsetMode();
        });
        renderer.domElement.addEventListener("click", onCanvasClick);
        renderer.domElement.addEventListener("dblclick", onCanvasDblClick);

        chkAxes.addEventListener("change", () => {
            axesHelper.visible = chkAxes.checked;
            if (axisLabelGroup) axisLabelGroup.visible = chkAxes.checked;
            saveSettingsToStorage();
        });
        chkGrid.addEventListener("change", () => {
            if (adaptiveGrid) adaptiveGrid.setVisible(chkGrid.checked);
            else if (gridHelper) gridHelper.visible = chkGrid.checked;
            saveSettingsToStorage();
        });
        if (chkRealtimeKotlin) {
            chkRealtimeKotlin.addEventListener("change", () => {
                const next = !!chkRealtimeKotlin.checked;
                setRealtimeKotlin(next);
                if (next) flushKotlinOut();
            });
        }
        if (chkPointPickPreview) {
            chkPointPickPreview.addEventListener("change", () => {
                setPointPickPreviewEnabled(!!chkPointPickPreview.checked);
            });
        }
        if (chkShowGeometryCenters) {
            chkShowGeometryCenters.addEventListener("change", () => {
                setGeometryCenterPreviewEnabled(!!chkShowGeometryCenters.checked);
            });
        }
        if (btnResetCamera) {
            btnResetCamera.addEventListener("click", () => resetCameraToPoints());
        }
        if (selSnapPlane) {
            selSnapPlane.value = snapPlane;
            selSnapPlane.addEventListener("change", () => setSnapPlane(selSnapPlane.value));
        }
        if (selMirrorPlane) {
            selMirrorPlane.value = mirrorPlane;
            selMirrorPlane.addEventListener("change", () => setMirrorPlane(selMirrorPlane.value));
        }
        if (inpSnapStep) inpSnapStep.disabled = !(chkSnapGrid && chkSnapGrid.checked);
        bindSnapPriorityList();
        renderSnapPriorityList();
        chkSnapGrid?.addEventListener("change", () => {
            if (inpSnapStep) inpSnapStep.disabled = !chkSnapGrid.checked;
            renderSnapPriorityList();
        });
        chkSnapParticle?.addEventListener("change", () => renderSnapPriorityList());
        if (chkSnapGridKeyToggleMode) {
            chkSnapGridKeyToggleMode.addEventListener("change", () => {
                setSnapGridKeyToggleMode(!!chkSnapGridKeyToggleMode.checked);
            });
        }
        if (chkSnapParticleKeyToggleMode) {
            chkSnapParticleKeyToggleMode.addEventListener("change", () => {
                setSnapParticleKeyToggleMode(!!chkSnapParticleKeyToggleMode.checked);
            });
        }
        renderer.domElement.addEventListener("contextmenu", onCanvasContextMenu);
        renderer.domElement.addEventListener("dragover", onPresetCanvasDragOver);
        renderer.domElement.addEventListener("drop", onPresetCanvasDrop);
        renderer.domElement.addEventListener("dragleave", () => {
            clearPresetPreview();
            hidePresetDragPointMarker();
            hideHoverMarker();
            clearPresetDragPlacementStatus();
            clearPresetDragLockPlane();
        });
        if (inpPointSize) {
            inpPointSize.value = String(pointSize);
            inpPointSize.addEventListener("input", () => {
                setPointSize(inpPointSize.value);
                saveSettingsToStorage();
            });
        }

        previewDistanceTool = createPreviewDistanceTool({
            title: "PointsBuilder 测距",
            canvas: renderer.domElement,
            showToast,
            resolvePointFromEvent: resolveMeasurePointFromEvent,
            projectPointToClient: (point) => projectPointToClient(point),
            attachContextMenu: false,
            isBlocked: () => !!(linePickMode || pointPickMode || offsetMode || rotateMode || bezierCreateState || bezierHandleDrag),
            getAllowedAxes: () => Array.from(getPlaneInfo().axis),
            onMeasureConfirmed: commitMeasuredReferenceGuide,
            completeOnConfirm: true
        });

        animate();
    }

    function onResize() {
        if (!renderer || !camera) return;
        renderer.setSize(threeHost.clientWidth, threeHost.clientHeight);
        camera.aspect = threeHost.clientWidth / threeHost.clientHeight;
        camera.updateProjectionMatrix();
        layoutActionOverflow();
    }

    function captureInitialCamera() {
        if (!camera || !controls) return;
        initialCameraState = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            near: camera.near,
            far: camera.far,
        };
    }

    function restoreInitialCamera() {
        if (!camera || !controls || !initialCameraState) return;
        camera.position.copy(initialCameraState.position);
        controls.target.copy(initialCameraState.target);
        camera.near = initialCameraState.near;
        camera.far = initialCameraState.far;
        camera.updateProjectionMatrix();
        controls.update();
    }

    function resetCameraToPoints() {
        if (!camera || !controls) return;
        if (!lastPoints || lastPoints.length === 0) {
            restoreInitialCamera();
            return;
        }
        const b = U.computeBounds(lastPoints);
        const r = b.radius;
        const c = b.center;
        controls.target.set(c.x, c.y, c.z);

        const dist = r * 2.4 + 2;
        camera.position.set(c.x + dist, c.y + dist * 0.8, c.z + dist);
        camera.near = Math.max(0.01, r / 100);
        camera.far = Math.max(5000, r * 20);
        camera.updateProjectionMatrix();
        controls.update();
    }

    function ensureBezierGuideObjects() {
        if (!scene) return;
        if (!bezierGuideLineObj) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
            const mat = new THREE.LineBasicMaterial({
                color: 0x5dd6ff,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                depthTest: false
            });
            bezierGuideLineObj = new THREE.LineSegments(geom, mat);
            bezierGuideLineObj.frustumCulled = false;
            bezierGuideLineObj.renderOrder = 1000;
            bezierGuideLineObj.visible = false;
            scene.add(bezierGuideLineObj);
        }
        if (!bezierGuideCurveObj) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
            const mat = new THREE.LineBasicMaterial({
                color: 0x9cf2ff,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                depthTest: false
            });
            bezierGuideCurveObj = new THREE.Line(geom, mat);
            bezierGuideCurveObj.frustumCulled = false;
            bezierGuideCurveObj.renderOrder = 1000;
            bezierGuideCurveObj.visible = false;
            scene.add(bezierGuideCurveObj);
        }
        if (!bezierGuidePointsObj) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
            geom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(12), 3));
            const mat = new THREE.PointsMaterial({
                size: 13,
                sizeAttenuation: false,
                vertexColors: true,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                depthTest: false
            });
            bezierGuidePointsObj = new THREE.Points(geom, mat);
            bezierGuidePointsObj.frustumCulled = false;
            bezierGuidePointsObj.renderOrder = 1001;
            bezierGuidePointsObj.visible = false;
            scene.add(bezierGuidePointsObj);
        }
        if (!bezierGuideAnchorObj) {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
            geom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(3), 3));
            const mat = new THREE.PointsMaterial({
                size: 18,
                sizeAttenuation: false,
                vertexColors: true,
                transparent: true,
                opacity: 1,
                depthWrite: false,
                depthTest: false
            });
            bezierGuideAnchorObj = new THREE.Points(geom, mat);
            bezierGuideAnchorObj.frustumCulled = false;
            bezierGuideAnchorObj.renderOrder = 1002;
            bezierGuideAnchorObj.visible = false;
            scene.add(bezierGuideAnchorObj);
        }
    }

    function hideBezierGuidePreview() {
        bezierGuideNodeId = null;
        bezierGuideMeta = [];
        bezierGuideAnchorMeta = [];
        if (bezierGuideLineObj) bezierGuideLineObj.visible = false;
        if (bezierGuideCurveObj) bezierGuideCurveObj.visible = false;
        if (bezierGuidePointsObj) bezierGuidePointsObj.visible = false;
        if (bezierGuideAnchorObj) bezierGuideAnchorObj.visible = false;
        bezierSelectedNode = null;
        bezierSelectedNodesByOwner = new Map();
        bezierNodeMoveDrag = null;
    }

    const bezierGuideSegmentCache = new Map();

    function sampleBezierGuideNodes(nodes, count = 256) {
        const list = Array.isArray(nodes) ? nodes : [];
        if (!list.length) return [U.v(0, 0, 0)];
        return sampleAdaptiveBezierNodes(list, Math.max(1, Number(count) || 1), {
            cache: bezierGuideSegmentCache,
            maxSamples: 4096
        });
    }

    function isNearBezierGuidePoint(a, b, epsilon = 1e-9) {
        if (!a || !b) return false;
        return Math.abs(num(a.x) - num(b.x)) <= epsilon
            && Math.abs(num(a.y) - num(b.y)) <= epsilon
            && Math.abs(num(a.z) - num(b.z)) <= epsilon;
    }

    function getBezierGuideHandleOffset(nodes, index, role, closed = false) {
        const list = Array.isArray(nodes) ? nodes : [];
        const item = list[index] || {};
        const prefix = role === "sh" ? "sh" : "eh";
        const explicit = U.v(num(item[`${prefix}x`]), num(item[`${prefix}y`]), num(item[`${prefix}z`]));
        if (Math.abs(explicit.x) + Math.abs(explicit.y) + Math.abs(explicit.z) > 1e-9) return explicit;

        const count = list.length;
        const point = U.v(num(item.x), num(item.y), num(item.z));
        if (count > 1) {
            const prevIndex = index > 0 ? index - 1 : (closed ? count - 1 : -1);
            const nextIndex = index + 1 < count ? index + 1 : (closed ? 0 : -1);
            const preferredIndex = role === "sh" ? nextIndex : prevIndex;
            const oppositeIndex = role === "sh" ? prevIndex : nextIndex;
            const preferred = list[preferredIndex];
            const opposite = list[oppositeIndex];
            if (preferred) {
                const toward = U.v(
                    num(preferred.x) - point.x,
                    num(preferred.y) - point.y,
                    num(preferred.z) - point.z
                );
                const length = Math.hypot(toward.x, toward.y, toward.z);
                if (length > 1e-9) return U.v(toward.x / 3, toward.y / 3, toward.z / 3);
            }
            if (opposite) {
                const away = U.v(
                    point.x - num(opposite.x),
                    point.y - num(opposite.y),
                    point.z - num(opposite.z)
                );
                const length = Math.hypot(away.x, away.y, away.z);
                if (length > 1e-9) return U.v(away.x / 3, away.y / 3, away.z / 3);
            }
        }

        // 单节点或重合节点没有可推断方向，仍给出一个可拾取的屏幕标记。
        const fallback = role === "sh" ? 0.5 : -0.5;
        const plane = typeof getPlaneInfo === "function" ? getPlaneInfo().axis : "XZ";
        return plane === "ZY" ? U.v(0, 0, fallback) : U.v(fallback, 0, 0);
    }

    function makeBezierCreateNode(point) {
        const p = point || U.v(0, 0, 0);
        return {
            x: num(p.x),
            y: num(p.y),
            z: num(p.z),
            shx: 0,
            shy: 0,
            shz: 0,
            ehx: 0,
            ehy: 0,
            ehz: 0
        };
    }

    function cancelBezierHandleDrag(ev = null, options = {}) {
        if (!bezierHandleDrag) return false;
        const snapshot = bezierHandleDrag.snapshot;
        const shouldRestore = options.restore === true;
        releaseBezierHandlePointer(bezierHandleDrag.pointerId);
        bezierHandleDrag = null;
        clearTransformConstraint();
        if (shouldRestore && snapshot) {
            restoreTransformSnapshot(snapshot);
            if (options.suppressClick) armCanvasClickSuppress(ev);
            hideHoverMarker();
            updateBezierGuidePreview();
            return true;
        }
        rebuildPreviewAndKotlin();
        renderAll();
        if (options.suppressClick) armCanvasClickSuppress(ev);
        hideHoverMarker();
        updateBezierGuidePreview();
        return true;
    }

    function beginBezierHandleDrag(ev, meta, options = {}) {
        const nodeId = meta?.nodeId || bezierGuideNodeId;
        if (!ev || ev.button !== 0 || !nodeId || !meta || (meta.role !== "sh" && meta.role !== "eh")) return false;
        const dom = renderer && renderer.domElement;
        if (dom?.setPointerCapture) {
            try { dom.setPointerCapture(ev.pointerId); } catch {}
        }
        bezierHandleDrag = {
            pointerId: ev.pointerId,
            nodeId,
            role: meta.role,
            nodeIndex: Number.isInteger(meta.nodeIndex) ? meta.nodeIndex : null,
            symmetric: options.symmetric === true,
            snapshot: cloneTransformSnapshot()
        };
        historyCapture(options.symmetric === true ? "bezier_handle_drag_symmetric" : "bezier_handle_drag");
        beginTransformConstraint("bezier_handle", getBezierHandleWorldPointByDragState(bezierHandleDrag), nodeId);
        armCanvasClickSuppress(ev);
        hideActionMenu();
        return true;
    }

    function getBezierGuideDataByNodeId(nodeId) {
        if (!nodeId) return null;
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return null;
        const node = ctx.node;
        const p = node.params || {};
        if (node.kind === "add_bezier_4") {
            const start = U.v(num(p.sx), num(p.sy), num(p.sz));
            const end = U.v(num(p.ex), num(p.ey), num(p.ez));
            const c1 = U.add(start, U.v(num(p.shx), num(p.shy), num(p.shz)));
            const c2 = U.add(end, U.v(num(p.ehx), num(p.ehy), num(p.ehz)));
            return { nodeId, kind: node.kind, start, end, c1, c2 };
        }
        if (node.kind === "add_bezier_curve") {
            const start = U.v(0, 0, 0);
            const end = U.v(num(p.ex), num(p.ey), num(p.ez));
            const c1 = U.add(start, U.v(num(p.shx), num(p.shy), num(p.shz)));
            const c2 = U.add(end, U.v(num(p.ehx), num(p.ehy), num(p.ehz)));
            return { nodeId, kind: node.kind, start, end, c1, c2 };
        }
        if (node.kind === "add_bezier_curve_multi" || node.kind === "apply_bezier_distribution" || node.kind === "add_bezier_circle_preset") {
            const nodes = Array.isArray(p.nodes) ? p.nodes : [];
            if (p.closed && node.kind !== "add_bezier_circle_preset") connectBezierClosure(node);
            const handles = [];
            nodes.forEach((item, index) => {
                const point = U.v(num(item.x), num(item.y), num(item.z));
                handles.push({ role: "sh", nodeIndex: index, point: U.add(point, U.v(num(item.shx), num(item.shy), num(item.shz))) });
                handles.push({ role: "eh", nodeIndex: index, point: U.add(point, U.v(num(item.ehx), num(item.ehy), num(item.ehz))) });
            });
            return { nodeId, kind: node.kind, nodes, handles, closed: node.kind === "add_bezier_circle_preset" || !!p.closed };
        }
        return null;
    }

    function getBezierGuideDisplayPath(nodeId) {
        if (!nodeId || String(nodeId).startsWith("__bezier_create_preview__")) return [];
        const fullPath = findNodePathById(nodeId) || [];
        const scopeCtx = typeof getCurrentCardScopeContext === "function"
            ? getCurrentCardScopeContext()
            : null;
        const scopeId = scopeCtx?.scopeId || null;
        if (!scopeId) return fullPath;
        const scopeIndex = fullPath.findIndex((step) => step?.node?.id === scopeId);
        return scopeIndex >= 0 ? fullPath.slice(scopeIndex + 1) : fullPath;
    }

    function mapBezierGuidePointToDisplay(point, nodeId) {
        if (!point) return point;
        const path = getBezierGuideDisplayPath(nodeId);
        const worlds = mapLocalPointToWorldPoints(point, path);
        return worlds?.[0] || {x: num(point.x), y: num(point.y), z: num(point.z)};
    }

    function mapBezierGuidePointToLocal(point, nodeId) {
        if (!point) return point;
        const path = getBezierGuideDisplayPath(nodeId);
        if (!path.length) return {x: num(point.x), y: num(point.y), z: num(point.z)};
        const last = path[path.length - 1];
        return mapWorldPointThroughScopes(point, path.slice(0, -1), last.parentList, last.index);
    }

    function mapBezierGuideDeltaToLocal(delta, nodeId) {
        if (!delta) return delta;
        const path = getBezierGuideDisplayPath(nodeId);
        return mapWorldDeltaToLocalDelta(delta, path, path.length - 1);
    }

    function transformBezierGuideForDisplay(rawGuide) {
        if (!rawGuide || String(rawGuide.nodeId || "").startsWith("__bezier_create_preview__")) return rawGuide;
        const nodeId = rawGuide.nodeId;
        if (Array.isArray(rawGuide.nodes)) {
            const nodes = rawGuide.nodes.map((item, index) => {
                const anchor = U.v(num(item.x), num(item.y), num(item.z));
                const sh = U.add(anchor, getBezierGuideHandleOffset(rawGuide.nodes, index, "sh", rawGuide.closed));
                const eh = U.add(anchor, getBezierGuideHandleOffset(rawGuide.nodes, index, "eh", rawGuide.closed));
                const displayAnchor = mapBezierGuidePointToDisplay(anchor, nodeId);
                const displaySh = mapBezierGuidePointToDisplay(sh, nodeId);
                const displayEh = mapBezierGuidePointToDisplay(eh, nodeId);
                return {
                    ...item,
                    x: displayAnchor.x,
                    y: displayAnchor.y,
                    z: displayAnchor.z,
                    shx: displaySh.x - displayAnchor.x,
                    shy: displaySh.y - displayAnchor.y,
                    shz: displaySh.z - displayAnchor.z,
                    ehx: displayEh.x - displayAnchor.x,
                    ehy: displayEh.y - displayAnchor.y,
                    ehz: displayEh.z - displayAnchor.z
                };
            });
            return {...rawGuide, nodes};
        }
        return {
            ...rawGuide,
            start: mapBezierGuidePointToDisplay(rawGuide.start, nodeId),
            end: mapBezierGuidePointToDisplay(rawGuide.end, nodeId),
            c1: mapBezierGuidePointToDisplay(rawGuide.c1, nodeId),
            c2: mapBezierGuidePointToDisplay(rawGuide.c2, nodeId)
        };
    }

    function updateBezierGuidePreview() {
        if (!scene) return;
        if (linePickMode || pointPickMode || offsetMode || rotateMode) {
            hideBezierGuidePreview();
            return;
        }
        const createState = bezierCreateState;
        const previewNodeId = (createState && createState.nodeId)
            ? createState.nodeId
            : (bezierSelectedNode?.nodeId || focusedNodeId);
        let guide = transformBezierGuideForDisplay(getBezierGuideDataByNodeId(previewNodeId));
        if ((!guide || (Array.isArray(guide.nodes) && guide.nodes.length === 0))
            && createState?.previewArmed
            && createState.phase === "pick_start"
            && createState.lastMapped) {
            guide = {
                nodeId: "__bezier_create_preview__",
                kind: "add_bezier_curve_multi",
                nodes: [makeBezierCreateNode(createState.lastMapped)]
            };
        }
        if (!guide) {
            hideBezierGuidePreview();
            return;
        }
        if (Array.isArray(guide.nodes) && guide.nodes.length === 0) {
            hideBezierGuidePreview();
            return;
        }
        if (guide.nodes && createState && createState.pointerId === null && createState.lastMapped
            && createState.previewArmed
            && (createState.phase === "pick_end" || createState.phase === "pick_next")) {
            const nodes = guide.nodes.map((item) => ({ ...item }));
            const prev = nodes[nodes.length - 1];
            if (prev) {
                const dx = num(createState.lastMapped.x) - num(prev.x);
                const dy = num(createState.lastMapped.y) - num(prev.y);
                const dz = num(createState.lastMapped.z) - num(prev.z);
                if (Math.abs(num(prev.shx)) + Math.abs(num(prev.shy)) + Math.abs(num(prev.shz)) < 1e-9) {
                    prev.shx = dx / 3;
                    prev.shy = dy / 3;
                    prev.shz = dz / 3;
                }
                nodes.push({ x: createState.lastMapped.x, y: createState.lastMapped.y, z: createState.lastMapped.z, shx: 0, shy: 0, shz: 0, ehx: -dx / 3, ehy: -dy / 3, ehz: -dz / 3 });
                guide.nodes = nodes;
            }
        }
        ensureBezierGuideObjects();
        if (!bezierGuideLineObj || !bezierGuidePointsObj) return;
        bezierGuideNodeId = guide.nodeId;
        if (guide.nodes) {
            bezierGuideMeta = [];
            guide.nodes.forEach((item, index) => {
                const point = U.v(num(item.x), num(item.y), num(item.z));
                const c1 = U.add(point, getBezierGuideHandleOffset(guide.nodes, index, "sh", guide.closed));
                const c2 = U.add(point, getBezierGuideHandleOffset(guide.nodes, index, "eh", guide.closed));
                bezierGuideMeta.push({ role: "anchor", nodeId: guide.nodeId, nodeIndex: index, point });
                bezierGuideMeta.push({ role: "sh", nodeId: guide.nodeId, nodeIndex: index, point: c1 });
                bezierGuideMeta.push({ role: "eh", nodeId: guide.nodeId, nodeIndex: index, point: c2 });
            });
            const sampleNodes = guide.closed && guide.nodes.length > 1
                ? [...guide.nodes, { ...guide.nodes[0] }]
                : guide.nodes;
            const curve = sampleBezierGuideNodes(sampleNodes, 512);
            const curveArray = new Float32Array(curve.length * 3);
            curve.forEach((point, index) => {
                curveArray[index * 3] = point.x;
                curveArray[index * 3 + 1] = point.y;
                curveArray[index * 3 + 2] = point.z;
            });
            bezierGuideCurveObj.geometry.setAttribute("position", new THREE.BufferAttribute(curveArray, 3));
            bezierGuideCurveObj.geometry.computeBoundingSphere();
            // W 是钢笔工具：未按 Ctrl 时保留节点和曲柄控制点，但隐藏采样曲线。
            bezierGuideCurveObj.visible = !createState || createState.previewArmed;
            const handleArray = [];
            guide.nodes.forEach((item, index) => {
                const point = U.v(num(item.x), num(item.y), num(item.z));
                const c1 = U.add(point, getBezierGuideHandleOffset(guide.nodes, index, "sh", guide.closed));
                const c2 = U.add(point, getBezierGuideHandleOffset(guide.nodes, index, "eh", guide.closed));
                handleArray.push(point, c1, point, c2);
            });
            bezierGuideLineObj.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(handleArray.flatMap((p) => [p.x, p.y, p.z])), 3));
            bezierGuideLineObj.geometry.computeBoundingSphere();
            bezierGuideLineObj.visible = true;
        } else {
            const start = guide.start;
            const end = guide.end;
            const segment = U.v(
                num(end.x) - num(start.x),
                num(end.y) - num(start.y),
                num(end.z) - num(start.z)
            );
            const segmentLength = Math.hypot(segment.x, segment.y, segment.z);
            const fallbackAxis = typeof getPlaneInfo === "function" && getPlaneInfo().axis === "ZY"
                ? U.v(0, 0, 0.5)
                : U.v(0.5, 0, 0);
            const fallbackHandle = segmentLength > 1e-9
                ? U.v(segment.x / 3, segment.y / 3, segment.z / 3)
                : fallbackAxis;
            const startHandle = isNearBezierGuidePoint(start, guide.c1)
                ? U.v(
                    num(start.x) + fallbackHandle.x,
                    num(start.y) + fallbackHandle.y,
                    num(start.z) + fallbackHandle.z
                )
                : guide.c1;
            const endHandle = isNearBezierGuidePoint(end, guide.c2)
                ? U.v(
                    num(end.x) - fallbackHandle.x,
                    num(end.y) - fallbackHandle.y,
                    num(end.z) - fallbackHandle.z
                )
                : guide.c2;
            bezierGuideMeta = [
                { role: "anchor", nodeId: guide.nodeId, point: guide.start },
                { role: "anchor", nodeId: guide.nodeId, point: guide.end },
                { role: "sh", nodeId: guide.nodeId, point: startHandle },
                { role: "eh", nodeId: guide.nodeId, point: endHandle }
            ];
            const oldLineValues = new Float32Array(12);
            const linePos = new THREE.BufferAttribute(oldLineValues, 3);
            bezierGuideLineObj.geometry.setAttribute("position", linePos);
            const lp = linePos.array;
            lp[0] = guide.start.x; lp[1] = guide.start.y; lp[2] = guide.start.z;
            lp[3] = startHandle.x; lp[4] = startHandle.y; lp[5] = startHandle.z;
            lp[6] = guide.end.x; lp[7] = guide.end.y; lp[8] = guide.end.z;
            lp[9] = endHandle.x; lp[10] = endHandle.y; lp[11] = endHandle.z;
            linePos.needsUpdate = true;
            bezierGuideLineObj.visible = true;
            const curve = sampleBezierGuideNodes([
                { x: guide.start.x, y: guide.start.y, z: guide.start.z, shx: guide.c1.x - guide.start.x, shy: guide.c1.y - guide.start.y, shz: guide.c1.z - guide.start.z },
                { x: guide.end.x, y: guide.end.y, z: guide.end.z, ehx: guide.c2.x - guide.end.x, ehy: guide.c2.y - guide.end.y, ehz: guide.c2.z - guide.end.z }
            ], 256);
            const curveArray = new Float32Array(curve.length * 3);
            curve.forEach((point, index) => { curveArray[index * 3] = point.x; curveArray[index * 3 + 1] = point.y; curveArray[index * 3 + 2] = point.z; });
            bezierGuideCurveObj.geometry.setAttribute("position", new THREE.BufferAttribute(curveArray, 3));
            bezierGuideCurveObj.geometry.computeBoundingSphere();
            // 旧版两点贝塞尔也遵循相同的预览显示规则。
            bezierGuideCurveObj.visible = !createState || createState.previewArmed;
        }

        const pointPos = bezierGuidePointsObj.geometry.getAttribute("position");
        const pointColor = bezierGuidePointsObj.geometry.getAttribute("color");
        const pa = pointPos.array;
        const ca = pointColor.array;
        const colors = {
            anchor: bezierAnchorColor,
            sh: pointPickPreviewColor,
            eh: new THREE.Color(0xff5ca8),
            start: defaultPointColor,
            end: bezierAnchorColor
        };
        if (pa.length !== bezierGuideMeta.length * 3) {
            bezierGuidePointsObj.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bezierGuideMeta.length * 3), 3));
            bezierGuidePointsObj.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(bezierGuideMeta.length * 3), 3));
        }
        const nextPointPos = bezierGuidePointsObj.geometry.getAttribute("position");
        const nextPointColor = bezierGuidePointsObj.geometry.getAttribute("color");
        const nextPa = nextPointPos.array;
        const nextCa = nextPointColor.array;
        for (let i = 0; i < bezierGuideMeta.length; i++) {
            const meta = bezierGuideMeta[i];
            const base = i * 3;
            nextPa[base + 0] = meta.point.x;
            nextPa[base + 1] = meta.point.y;
            nextPa[base + 2] = meta.point.z;
            const color = colors[meta.role] || defaultPointColor;
            nextCa[base + 0] = color.r;
            nextCa[base + 1] = color.g;
            nextCa[base + 2] = color.b;
        }
        nextPointPos.needsUpdate = true;
        nextPointColor.needsUpdate = true;
        bezierGuidePointsObj.geometry.computeBoundingSphere();
        bezierGuidePointsObj.material.size = 13;
        bezierGuidePointsObj.visible = true;

        const anchors = bezierGuideMeta.filter((meta) => meta && meta.role === "anchor");
        const anchorKeys = new Set(anchors
            .filter((meta) => meta.nodeId && Number.isInteger(meta.nodeIndex))
            .map((meta) => `${meta.nodeId}:${meta.nodeIndex}`));
        for (const selected of getSelectedBezierNodeContexts()) {
            const key = `${selected.node.id}:${selected.index}`;
            if (anchorKeys.has(key)) continue;
            anchorKeys.add(key);
            anchors.push({
                role: "anchor",
                nodeId: selected.node.id,
                nodeIndex: selected.index,
                point: U.v(num(selected.item.x), num(selected.item.y), num(selected.item.z))
            });
        }
        bezierGuideAnchorMeta = anchors;
        const anchorPos = new Float32Array(Math.max(1, anchors.length) * 3);
        const anchorColor = new Float32Array(Math.max(1, anchors.length) * 3);
        anchors.forEach((meta, index) => {
            const base = index * 3;
            anchorPos[base] = meta.point.x;
            anchorPos[base + 1] = meta.point.y;
            anchorPos[base + 2] = meta.point.z;
            const selected = !!meta.nodeId
                && Number.isInteger(meta.nodeIndex)
                && bezierSelectedNodesByOwner.get(meta.nodeId)?.has(meta.nodeIndex);
            const color = selected ? bezierSelectedColor : bezierAnchorColor;
            anchorColor[base] = color.r;
            anchorColor[base + 1] = color.g;
            anchorColor[base + 2] = color.b;
        });
        bezierGuideAnchorObj.geometry.setAttribute("position", new THREE.BufferAttribute(anchorPos, 3));
        bezierGuideAnchorObj.geometry.setAttribute("color", new THREE.BufferAttribute(anchorColor, 3));
        bezierGuideAnchorObj.geometry.computeBoundingSphere();
        bezierGuideAnchorObj.visible = anchors.length > 0;
    }

    function pickBezierGuideAnchorFromEvent(ev) {
        if (!bezierGuideAnchorMeta || !bezierGuideAnchorMeta.length || !renderer || !camera) return null;
        const radiusPx = Math.max(28, Math.min(64, (Number(pointSize) || 0.2) * 72));
        let best = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const meta of bezierGuideAnchorMeta) {
            if (!meta || meta.role !== "anchor" || !Number.isInteger(meta.nodeIndex)) continue;
            const client = projectPointToClient(meta.point);
            if (!client) continue;
            const dist = Math.hypot((ev.clientX || 0) - client.x, (ev.clientY || 0) - client.y);
            if (dist > radiusPx || dist >= bestDist) continue;
            best = { ...meta, distancePx: dist };
            bestDist = dist;
        }
        return best || null;
    }

    function pickBezierGuideHandleFromEvent(ev) {
        if (!bezierGuideMeta || !bezierGuideMeta.length || !renderer || !camera) return null;
        const radiusPx = Math.max(36, Math.min(96, (Number(pointSize) || 0.2) * 96));
        let best = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const meta of bezierGuideMeta) {
            if (!meta || (meta.role !== "sh" && meta.role !== "eh")) continue;
            const client = projectPointToClient(meta.point);
            if (!client) continue;
            const dist = Math.hypot((ev.clientX || 0) - client.x, (ev.clientY || 0) - client.y);
            if (dist > radiusPx || dist >= bestDist) continue;
            best = { ...meta, distancePx: dist };
            bestDist = dist;
        }
        return best || null;
    }

    function pickBezierGuideControlFromEvent(ev) {
        const anchor = pickBezierGuideAnchorFromEvent(ev);
        const handle = pickBezierGuideHandleFromEvent(ev);
        if (!anchor) return handle ? { type: "handle", meta: handle } : null;
        if (!handle) return { type: "anchor", meta: anchor };
        return handle.distancePx < anchor.distancePx
            ? { type: "handle", meta: handle }
            : { type: "anchor", meta: anchor };
    }

    function syncVecEditorInputs(nodeId, prefix, point) {
        if (!nodeId || !prefix || !point) return;
        const targets = collectCardVecTargets(nodeId);
        const target = findTargetByKeys(targets, `${prefix}x`, `${prefix}y`, `${prefix}z`);
        if (!target || !target.inputs) return;
        if (target.inputs.x) target.inputs.x.value = String(point.x);
        if (target.inputs.y) target.inputs.y.value = String(point.y);
        if (target.inputs.z) target.inputs.z.value = String(point.z);
    }

    function buildBezierCreateStatus() {
        if (!bezierCreateState) return "";
        const info = getPlaneInfo().label;
        const axisHint = transformConstraintVector ? `，约束 ${transformConstraintLabel()}` : "，拖动中可按 X/Y/Z 约束";
        if (bezierCreateState.phase === "pick_start") {
            return `${info} Bezier 创建：Ctrl + 左键添加起点${axisHint}`;
        }
        if (bezierCreateState.phase === "pick_end") {
            const start = bezierCreateState.start;
            return `${info} Bezier 创建：已选 start (${U.fmt(start.x)}, ${U.fmt(start.y)}, ${U.fmt(start.z)})，Ctrl + 左键添加终点${axisHint}`;
        }
        if (bezierCreateState.phase === "pick_next") {
            const count = Number(bezierCreateState.nodeCount) || 1;
            return `${info} 空间贝塞尔创建：已添加 ${count} 个点，Ctrl + 左键继续添加，Esc / 右键双击结束${axisHint}`;
        }
        return `${info} Bezier 创建中`;
    }

    function refreshBezierCreateStatus() {
        if (!bezierCreateState) return;
        setLinePickStatus(buildBezierCreateStatus());
    }

    function stopBezierCreate(options = {}) {
        if (!bezierCreateState) return false;
        const keepGuide = options.keepGuide === true;
        const nodeId = bezierCreateState.nodeId;
        const pointerId = bezierCreateState.pointerId;
        const dom = renderer && renderer.domElement;
        try {
            if (pointerId !== null && pointerId !== undefined && dom?.hasPointerCapture?.(pointerId)) {
                dom.releasePointerCapture(pointerId);
            }
        } catch {}
        bezierCreateState = null;
        if (transformConstraintOperation === "bezier_create") clearTransformConstraint();
        hideHoverMarker();
        if (!keepGuide || !nodeId) {
            hideBezierGuidePreview();
        } else {
            try { focusCardById(nodeId, false, true, true); } catch {}
            requestAnimationFrame(() => updateBezierGuidePreview());
        }
        hideLinePickStatus();
        return true;
    }

    function setBezierCreatePreviewArmed(armed, mapped = null) {
        const state = bezierCreateState;
        if (!state) return false;
        if (!armed && state.pointerId !== null && state.pointerId !== undefined) return false;
        state.previewArmed = !!armed;
        if (mapped) state.lastMapped = { x: mapped.x, y: mapped.y, z: mapped.z };
        if (!state.previewArmed) {
            hideHoverMarker();
            updateBezierGuidePreview();
            return true;
        }
        if (!state.lastMapped) return true;
        ensureHoverMarker();
        setHoverMarkerColor(colorForPickIndex(Math.max(0, Number(state.nodeCount) || 0)));
        updateBezierCreateHover(state.lastMapped);
        return true;
    }

    function isControlModifierEvent(ev) {
        return ev?.key === "Control" || ev?.code === "ControlLeft" || ev?.code === "ControlRight";
    }

    function onBezierPreviewModifierKeyDown(ev) {
        if (!isControlModifierEvent(ev) || !bezierCreateState || bezierCreateState.pointerId !== null) return;
        setBezierCreatePreviewArmed(true);
    }

    function onBezierPreviewModifierKeyUp(ev) {
        if (!isControlModifierEvent(ev) || !bezierCreateState) return;
        setBezierCreatePreviewArmed(false);
    }

    function onBezierPreviewModifierBlur() {
        if (!bezierCreateState) return;
        setBezierCreatePreviewArmed(false);
    }

    function setBezierHandleRelative(nodeId, role, mapped, nodeIndex = null, options = {}) {
        if (!nodeId || !role || !mapped) return false;
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return false;
        const node = ctx.node;
        const p = node.params || (node.params = {});
        if ((node.kind === "add_bezier_curve_multi" || node.kind === "apply_bezier_distribution" || node.kind === "add_bezier_circle_preset") && Number.isInteger(nodeIndex)) {
            const item = Array.isArray(p.nodes) ? p.nodes[nodeIndex] : null;
            if (!item) return false;
            const anchor = U.v(num(item.x), num(item.y), num(item.z));
            const rel = U.sub(mapped, anchor);
            const prefix = role === "sh" ? "sh" : "eh";
            item[`${prefix}x`] = rel.x;
            item[`${prefix}y`] = rel.y;
            item[`${prefix}z`] = rel.z;
            if (options.symmetric === true) {
                const opposite = prefix === "sh" ? "eh" : "sh";
                item[`${opposite}x`] = -rel.x;
                item[`${opposite}y`] = -rel.y;
                item[`${opposite}z`] = -rel.z;
            }
            return true;
        }
        const anchor = role === "sh"
            ? (node.kind === "add_bezier_curve" ? U.v(0, 0, 0) : U.v(num(p.sx), num(p.sy), num(p.sz)))
            : U.v(num(p.ex), num(p.ey), num(p.ez));
        const rel = U.sub(mapped, anchor);
        p[`__pb_vec_mode_${role}`] = "manual";
        p[`${role}x`] = rel.x;
        p[`${role}y`] = rel.y;
        p[`${role}z`] = rel.z;
        syncVecEditorInputs(nodeId, role, rel);
        return true;
    }

    function insertBezierCreateNode(point) {
        const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
        const list = pickCtx && Array.isArray(pickCtx.list) ? pickCtx.list : state.root.children;
        const at = pickCtx && pickCtx.insertIndex != null ? pickCtx.insertIndex : list.length;
        const nn = makeNode("add_bezier_curve_multi", {
            params: {
                nodes: [{ x: point.x, y: point.y, z: point.z, shx: 0, shy: 0, shz: 0, ehx: 0, ehy: 0, ehz: 0 }],
                count: 100
            }
        });
        const idx = Math.max(0, Math.min(at, list.length));
        historyCapture("create_bezier_card");
        list.splice(idx, 0, nn);
        ensureAxisEverywhere();
        renderAll();
        requestAnimationFrame(() => {
            try { focusCardById(nn.id, false, true, true); } catch {}
            updateBezierGuidePreview();
        });
        return nn.id;
    }

    function insertEmptyBezierCreateNode() {
        const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
        const list = pickCtx && Array.isArray(pickCtx.list) ? pickCtx.list : state.root.children;
        const at = pickCtx && pickCtx.insertIndex != null ? pickCtx.insertIndex : list.length;
        const nn = makeNode("add_bezier_curve_multi", {
            params: { nodes: [], count: 100 }
        });
        const idx = Math.max(0, Math.min(at, list.length));
        historyCapture("create_bezier_card");
        list.splice(idx, 0, nn);
        ensureAxisEverywhere();
        renderAll();
        requestAnimationFrame(() => {
            try { focusCardById(nn.id, false, true, true); } catch {}
            updateBezierGuidePreview();
        });
        return nn.id;
    }

    function appendBezierCreateNode(nodeId, point) {
        const ctx = findNodeContextById(nodeId);
        const nodes = ctx?.node?.params?.nodes;
        if (!Array.isArray(nodes)) return false;
        const prev = nodes[nodes.length - 1];
        const dx = point.x - num(prev?.x);
        const dy = point.y - num(prev?.y);
        const dz = point.z - num(prev?.z);
        historyCapture("add_bezier_node");
        if (prev && Math.abs(num(prev.shx)) + Math.abs(num(prev.shy)) + Math.abs(num(prev.shz)) < 1e-9) {
            prev.shx = dx / 3;
            prev.shy = dy / 3;
            prev.shz = dz / 3;
        }
        nodes.push({ x: point.x, y: point.y, z: point.z, shx: 0, shy: 0, shz: 0, ehx: -dx / 3, ehy: -dy / 3, ehz: -dz / 3 });
        ensureAxisEverywhere();
        renderAll();
        return true;
    }

    function connectBezierClosure(node) {
        const nodes = Array.isArray(node?.params?.nodes) ? node.params.nodes : [];
        if (nodes.length < 2) return false;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const dx = num(first.x) - num(last.x);
        const dy = num(first.y) - num(last.y);
        const dz = num(first.z) - num(last.z);
        const lastHandleLength = Math.abs(num(last.shx)) + Math.abs(num(last.shy)) + Math.abs(num(last.shz));
        const firstHandleLength = Math.abs(num(first.ehx)) + Math.abs(num(first.ehy)) + Math.abs(num(first.ehz));
        if (lastHandleLength < 1e-9) {
            last.shx = dx / 3;
            last.shy = dy / 3;
            last.shz = dz / 3;
        }
        if (firstHandleLength < 1e-9) {
            first.ehx = -dx / 3;
            first.ehy = -dy / 3;
            first.ehz = -dz / 3;
        }
        return true;
    }

    function getBezierCreateNodes(nodeId) {
        const ctx = findNodeContextById(nodeId);
        return Array.isArray(ctx?.node?.params?.nodes) ? ctx.node.params.nodes : null;
    }

    function setBezierCreateHandle(nodeId, nodeIndex, role, mapped) {
        const nodes = getBezierCreateNodes(nodeId);
        const item = Number.isInteger(nodeIndex) ? nodes?.[nodeIndex] : null;
        if (!item || !mapped) return false;
        const anchor = U.v(num(item.x), num(item.y), num(item.z));
        const rel = U.sub(mapped, anchor);
        const prefix = role === "sh" ? "sh" : "eh";
        item[`${prefix}x`] = rel.x;
        item[`${prefix}y`] = rel.y;
        item[`${prefix}z`] = rel.z;
        return true;
    }

    function getSelectedBezierNodeContext() {
        const selected = getSelectedBezierNodeContexts();
        if (!selected.length) return null;
        if (!bezierSelectedNode) return selected[0];
        return selected.find((row) => row.node.id === bezierSelectedNode.nodeId && row.index === bezierSelectedNode.nodeIndex)
            || selected[0];
    }

    function getSelectedBezierNodeContexts() {
        const selected = [];
        for (const [ownerId, indices] of bezierSelectedNodesByOwner.entries()) {
            const ctx = findNodeContextById(ownerId);
            const node = ctx?.node;
            const nodes = Array.isArray(node?.params?.nodes) ? node.params.nodes : [];
            for (const index of indices) {
                if (!Number.isInteger(index) || !nodes[index]) continue;
                selected.push({ ctx, node, item: nodes[index], index });
            }
        }
        return selected;
    }

    function isEditableBezierNodeKind(kind) {
        return kind === "add_bezier_curve_multi"
            || kind === "apply_bezier_distribution"
            || kind === "add_bezier_circle_preset";
    }

    function getFocusedBezierEditContext() {
        if (!focusedNodeId) return null;
        const ctx = findNodeContextById(focusedNodeId);
        if (!ctx?.node || !isEditableBezierNodeKind(ctx.node.kind)) return null;
        if (!Array.isArray(ctx.node.params?.nodes)) return null;
        return ctx;
    }

    function clearBezierNodeSelection(options = {}) {
        bezierSelectedNode = null;
        bezierSelectedNodesByOwner = new Map();
        bezierNodeMoveDrag = null;
        if (options.refresh !== false) updateBezierGuidePreview();
    }

    function isBezierNodeSelected(nodeId, nodeIndex) {
        return !!nodeId && Number.isInteger(nodeIndex) && !!bezierSelectedNodesByOwner.get(nodeId)?.has(nodeIndex);
    }

    function setBezierNodeSelections(selectionMap, options = {}) {
        const valid = new Map();
        if (selectionMap instanceof Map) {
            for (const [nodeId, indices] of selectionMap.entries()) {
                const ctx = findNodeContextById(nodeId);
                const nodes = Array.isArray(ctx?.node?.params?.nodes) ? ctx.node.params.nodes : [];
                const source = indices instanceof Set ? indices : (Array.isArray(indices) ? indices : []);
                const bucket = new Set(Array.from(source).filter((index) => Number.isInteger(index) && !!nodes[index]));
                if (bucket.size) valid.set(nodeId, bucket);
            }
        }
        bezierSelectedNodesByOwner = mergeBezierNodeSelectionMaps(
            bezierSelectedNodesByOwner,
            valid,
            options.additive === true
        );
        const primary = options.primary;
        if (primary && isBezierNodeSelected(primary.nodeId, primary.nodeIndex)) {
            bezierSelectedNode = { nodeId: primary.nodeId, nodeIndex: primary.nodeIndex };
        } else {
            const firstOwner = bezierSelectedNodesByOwner.entries().next();
            if (firstOwner.done) {
                bezierSelectedNode = null;
            } else {
                const firstIndex = firstOwner.value[1].values().next();
                bezierSelectedNode = firstIndex.done
                    ? null
                    : { nodeId: firstOwner.value[0], nodeIndex: firstIndex.value };
            }
        }
        updateBezierGuidePreview();
        return valid.size > 0 || bezierSelectedNodesByOwner.size === 0;
    }

    function setBezierNodeSelection(nodeId, indices, options = {}) {
        if (!nodeId) return false;
        return setBezierNodeSelections(new Map([[nodeId, indices]]), options);
    }

    function clearCardSelectionForBezierNodes() {
        clearViewBoxPointSelection();
        if (typeof setCardSelectionIds !== "function") return;
        setCardSelectionIds([], {
            replace: true,
            focus: false,
            reveal: false,
            syncWithParamSync: false,
            keepBezierNodeSelection: true
        });
    }

    function selectBezierGuideNode(meta, options = {}) {
        const nodeId = meta?.nodeId || bezierGuideNodeId;
        if (!nodeId || !Number.isInteger(meta?.nodeIndex)) return false;
        clearCardSelectionForBezierNodes();
        if (options.additive !== true && isBezierNodeSelected(nodeId, meta.nodeIndex)) {
            bezierSelectedNode = { nodeId, nodeIndex: meta.nodeIndex };
            updateBezierGuidePreview();
            return true;
        }
        return setBezierNodeSelection(nodeId, [meta.nodeIndex], {
            ...options,
            primary: { nodeId, nodeIndex: meta.nodeIndex }
        });
    }

    function deleteSelectedBezierNode() {
        const selected = getSelectedBezierNodeContexts();
        if (!selected.length) return false;
        const indicesByOwner = new Map();
        for (const row of selected) {
            if (!indicesByOwner.has(row.node.id)) indicesByOwner.set(row.node.id, []);
            indicesByOwner.get(row.node.id).push(row.index);
        }
        historyCapture("delete_bezier_selected_node");
        let changed = false;
        for (const [nodeId, indices] of indicesByOwner.entries()) {
            changed = deleteBezierNodes(nodeId, indices, "delete_bezier_selected_node", {
                captureHistory: false,
                render: false,
                clearSelection: false
            }) || changed;
        }
        if (!changed) return false;
        clearBezierNodeSelection({ refresh: false });
        ensureAxisEverywhere();
        renderAll();
        return true;
    }

    function deleteBezierNodes(nodeId, indices, reason = "delete_bezier_node", options = {}) {
        const ctx = findNodeContextById(nodeId);
        const node = ctx?.node;
        const nodes = Array.isArray(node?.params?.nodes) ? node.params.nodes : null;
        if (!ctx || !node || !nodes) return false;
        const targets = Array.from(new Set(Array.isArray(indices) ? indices : []))
            .filter((index) => Number.isInteger(index) && index >= 0 && index < nodes.length)
            .sort((a, b) => b - a);
        if (!targets.length) return false;

        if (options.captureHistory !== false) historyCapture(reason);
        const deletingCard = targets.length >= nodes.length;
        if (deletingCard) {
            if (bezierCreateState?.targetNodeId === node.id || bezierCreateState?.nodeId === node.id) {
                stopBezierCreate();
            }
            ctx.parentList.splice(ctx.index, 1);
            const nextFocus = pickReasonableFocusAfterDelete(ctx);
            if (focusedNodeId === node.id) setFocusedNode(nextFocus, false);
        } else {
            for (const index of targets) nodes.splice(index, 1);
        }

        if (options.clearSelection !== false) clearBezierNodeSelection({ refresh: false });
        if (options.render !== false) {
            ensureAxisEverywhere();
            renderAll();
        }
        return true;
    }

    function beginBezierNodeMoveDrag(ev, meta) {
        const nodeId = meta?.nodeId || bezierGuideNodeId;
        if (!nodeId || !Number.isInteger(meta?.nodeIndex) || !isBezierNodeSelected(nodeId, meta.nodeIndex)) return false;
        const mapped = getMappedPointFromEvent(ev);
        const selected = getSelectedBezierNodeContexts();
        if (!mapped || !selected.length) return false;
        const anchor = selected.find((row) => row.node.id === nodeId && row.index === meta.nodeIndex);
        if (!anchor) return false;
        const anchorLocal = {x: num(anchor.item.x), y: num(anchor.item.y), z: num(anchor.item.z)};
        const anchorDisplay = mapBezierGuidePointToDisplay(anchorLocal, nodeId);
        const dom = renderer && renderer.domElement;
        if (dom?.setPointerCapture) {
            try { dom.setPointerCapture(ev.pointerId); } catch {}
        }
        historyCapture("bezier_node_move");
        bezierNodeMoveDrag = {
            pointerId: ev.pointerId,
            anchorNodeId: nodeId,
            anchorNodeIndex: meta.nodeIndex,
            startMapped: anchorDisplay,
            starts: selected.map((row) => ({
                nodeId: row.node.id,
                index: row.index,
                x: num(row.item.x),
                y: num(row.item.y),
                z: num(row.item.z)
            })),
            snapshot: cloneTransformSnapshot()
        };
        beginTransformConstraint("bezier_node", bezierNodeMoveDrag.startMapped, nodeId);
        armCanvasClickSuppress(ev);
        return true;
    }

    function updateBezierNodeMoveDrag(ev) {
        if (!bezierNodeMoveDrag || !ev || ev.pointerId !== bezierNodeMoveDrag.pointerId) return false;
        const mapped = getMappedPointFromEvent(ev);
        if (!mapped) return false;
        const worldDelta = {
            x: mapped.x - bezierNodeMoveDrag.startMapped.x,
            y: mapped.y - bezierNodeMoveDrag.startMapped.y,
            z: mapped.z - bezierNodeMoveDrag.startMapped.z
        };
        for (const start of bezierNodeMoveDrag.starts || []) {
            const ctx = findNodeContextById(start.nodeId);
            const nodes = Array.isArray(ctx?.node?.params?.nodes) ? ctx.node.params.nodes : [];
            const item = nodes[start.index];
            if (!item) continue;
            const localDelta = mapBezierGuideDeltaToLocal(worldDelta, start.nodeId);
            const dx = localDelta.x;
            const dy = localDelta.y;
            const dz = localDelta.z;
            item.x = start.x + dx;
            item.y = start.y + dy;
            item.z = start.z + dz;
        }
        rebuildPreviewAndKotlin();
        updateBezierGuidePreview();
        return true;
    }

    function finishBezierNodeMoveDrag(ev) {
        if (!bezierNodeMoveDrag || !ev || ev.pointerId !== bezierNodeMoveDrag.pointerId) return false;
        const dom = renderer && renderer.domElement;
        try {
            if (dom?.hasPointerCapture?.(bezierNodeMoveDrag.pointerId)) dom.releasePointerCapture(bezierNodeMoveDrag.pointerId);
        } catch {}
        bezierNodeMoveDrag = null;
        clearTransformConstraint();
        rebuildPreviewAndKotlin();
        renderAll();
        return true;
    }

    function cancelBezierNodeMoveDrag(ev = null, options = {}) {
        if (!bezierNodeMoveDrag) return false;
        const drag = bezierNodeMoveDrag;
        const dom = renderer && renderer.domElement;
        try {
            if (dom?.hasPointerCapture?.(drag.pointerId)) dom.releasePointerCapture(drag.pointerId);
        } catch {}
        bezierNodeMoveDrag = null;
        clearTransformConstraint();
        if (options.restore === true && drag.snapshot) {
            restoreTransformSnapshot(drag.snapshot);
        } else {
            rebuildPreviewAndKotlin();
            renderAll();
        }
        if (options.suppressClick) armCanvasClickSuppress(ev);
        return true;
    }

    function beginBezierCreateDrag(mapped, ev) {
        if (!bezierCreateState || !mapped || !ev) return false;
        const state = bezierCreateState;
        if (state.pointerId !== null && state.pointerId !== undefined) return false;
        const displayMapped = {x: num(mapped.x), y: num(mapped.y), z: num(mapped.z)};
        const localMapped = state.nodeId
            ? mapBezierGuidePointToLocal(displayMapped, state.nodeId)
            : displayMapped;
        if (state.phase === "pick_start") {
            state.start = { x: localMapped.x, y: localMapped.y, z: localMapped.z };
            if (state.targetNodeId) {
                const targetNodes = getBezierCreateNodes(state.targetNodeId);
                if (!targetNodes) return false;
                historyCapture("add_bezier_node");
                targetNodes.push({ x: localMapped.x, y: localMapped.y, z: localMapped.z, shx: 0, shy: 0, shz: 0, ehx: 0, ehy: 0, ehz: 0 });
                state.nodeId = state.targetNodeId;
                ensureAxisEverywhere();
                renderAll();
            } else {
                state.nodeId = insertBezierCreateNode(state.start);
            }
            state.nodeCount = 1;
            state.activeNodeIndex = 0;
            state.dragRole = "sh";
            state.phase = "drag_start";
        } else if (state.phase === "pick_end" || state.phase === "pick_next") {
            const nodeId = state.nodeId;
            if (!nodeId) return false;
            if (!appendBezierCreateNode(nodeId, localMapped)) return false;
            const nodes = getBezierCreateNodes(nodeId);
            state.activeNodeIndex = Math.max(0, (nodes?.length || 1) - 1);
            state.nodeCount = nodes?.length || state.nodeCount;
            state.start = { x: localMapped.x, y: localMapped.y, z: localMapped.z };
            state.dragRole = "eh";
            state.phase = "drag_end";
        } else {
            return false;
        }
        state.pointerId = ev.pointerId;
        state.previewArmed = true;
        state.lastMapped = displayMapped;
        state.dragSnapshot = cloneTransformSnapshot();
        beginTransformConstraint("bezier_create", mapBezierGuidePointToDisplay(state.start, state.nodeId), state.nodeId);
        const dom = renderer && renderer.domElement;
        if (dom?.setPointerCapture) {
            try { dom.setPointerCapture(ev.pointerId); } catch {}
        }
        armCanvasClickSuppress(ev);
        ensureHoverMarker();
        setHoverMarkerColor(pointPickPreviewColor.getHex());
        showHoverMarker(displayMapped);
        updateBezierCreateHover(displayMapped);
        refreshBezierCreateStatus();
        return true;
    }

    function finishBezierCreateDrag(ev, cancelled = false) {
        const state = bezierCreateState;
        if (!state || state.pointerId === null || state.pointerId === undefined) return false;
        if (ev && ev.pointerId !== state.pointerId) return false;
        const mapped = cancelled ? state.lastMapped : (getMappedPointFromEvent(ev) || state.lastMapped);
        const pointerId = state.pointerId;
        const dom = renderer && renderer.domElement;
        try {
            if (dom?.hasPointerCapture?.(pointerId)) dom.releasePointerCapture(pointerId);
        } catch {}
        if (mapped && !cancelled) updateBezierCreateHover(mapped);
        if (cancelled) {
            state.phase = state.nodeCount > 1 ? "pick_next" : (state.nodeCount === 1 ? "pick_end" : "pick_start");
        } else if (state.phase === "drag_end") {
            const nodes = getBezierCreateNodes(state.nodeId);
            const item = nodes?.[state.activeNodeIndex];
            if (item) {
                item.shx = -num(item.ehx);
                item.shy = -num(item.ehy);
                item.shz = -num(item.ehz);
            }
            state.phase = "pick_next";
            state.start = item ? { x: num(item.x), y: num(item.y), z: num(item.z) } : state.start;
        } else if (!cancelled && state.phase === "drag_start") {
            state.phase = "pick_end";
        }
        state.pointerId = null;
        state.dragRole = null;
        state.activeNodeIndex = null;
        state.lastMapped = mapped || state.lastMapped;
        state.previewArmed = !!(ev && ev.ctrlKey);
        if (transformConstraintOperation === "bezier_create") clearTransformConstraint();
        if (!state.previewArmed) hideHoverMarker();
        rebuildPreviewAndKotlin();
        renderAll();
        updateBezierGuidePreview();
        refreshBezierCreateStatus();
        return true;
    }

    function updateBezierCreateHover(mapped) {
        if (!bezierCreateState || !mapped) {
            hideHoverMarker();
            return;
        }
        if (bezierCreateState.phase === "drag_start" || bezierCreateState.phase === "drag_end") {
            const localMapped = mapBezierGuidePointToLocal(mapped, bezierCreateState.nodeId);
            if (setBezierCreateHandle(bezierCreateState.nodeId, bezierCreateState.activeNodeIndex, bezierCreateState.dragRole, localMapped)) {
                rebuildPreviewAndKotlin();
                updateBezierGuidePreview();
            }
        }
        bezierCreateState.lastMapped = { x: mapped.x, y: mapped.y, z: mapped.z };
        if (!bezierCreateState.previewArmed && bezierCreateState.pointerId === null) {
            hideHoverMarker();
            updateBezierGuidePreview();
            return;
        }
        showHoverMarker(mapped);
        updateBezierGuidePreview();
    }

    function confirmBezierCreatePoint(mapped) {
        if (!bezierCreateState || !mapped) return false;
        if (bezierCreateState.phase === "pick_start") {
            bezierCreateState.start = { x: mapped.x, y: mapped.y, z: mapped.z };
            bezierCreateState.phase = "pick_end";
            ensureHoverMarker();
            setHoverMarkerColor(colorForPickIndex(1));
            showHoverMarker(mapped);
            refreshBezierCreateStatus();
            return true;
        }
        if (bezierCreateState.phase === "pick_end") {
            bezierCreateState.end = { x: mapped.x, y: mapped.y, z: mapped.z };
            bezierCreateState.nodeId = insertBezierCreateNode(bezierCreateState.start);
            appendBezierCreateNode(bezierCreateState.nodeId, bezierCreateState.end);
            bezierCreateState.nodeCount = 2;
            bezierCreateState.phase = "pick_next";
            rebuildPreviewAndKotlin();
            updateBezierGuidePreview();
            return true;
        }
        if (bezierCreateState.phase === "pick_next") {
            if (appendBezierCreateNode(bezierCreateState.nodeId, mapped)) {
                bezierCreateState.nodeCount = (Number(bezierCreateState.nodeCount) || 1) + 1;
                rebuildPreviewAndKotlin();
                updateBezierGuidePreview();
                refreshBezierCreateStatus();
                return true;
            }
        }
        return false;
    }

    function startBezierCreate() {
        // W 是持续工作的钢笔工具；重复 keydown（按住 W 时浏览器会产生）不能重置当前曲线。
        if (bezierCreateState) return true;
        const operationSnapshot = cloneTransformSnapshot();
        hideActionMenu();
        hideQuickSyncPanel();
        if (offsetMode) stopOffsetMode();
        if (rotateMode) stopRotateMode({ silent: true });
        if (linePickMode) stopLinePick();
        if (pointPickMode) stopPointPick();
        setLockPlaneActive(false);
        lastPickBasePoint = null;
        lastPickMappedPoint = null;
        _rClickT = 0;
        clearPickMarkers();
        hideLinePickPreview();
        bezierCreateState = {
            phase: "pick_start",
            start: null,
            end: null,
            nodeId: null,
            targetNodeId: null,
            nodeCount: 0,
            pointerId: null,
            dragRole: null,
            activeNodeIndex: null,
            lastMapped: null,
            previewArmed: false,
            operationSnapshot
        };
        const selectedBezierCtx = focusedNodeId ? findNodeContextById(focusedNodeId) : null;
        const selectedBezierNode = selectedBezierCtx?.node;
        if (selectedBezierNode && isEditableBezierNodeKind(selectedBezierNode.kind)) {
            const selectedNodes = Array.isArray(selectedBezierNode.params?.nodes) ? selectedBezierNode.params.nodes : [];
            bezierCreateState.targetNodeId = selectedBezierNode.id;
            bezierCreateState.nodeId = selectedBezierNode.id;
            bezierCreateState.nodeCount = selectedNodes.length;
            if (selectedNodes.length) {
                const last = selectedNodes[selectedNodes.length - 1];
                bezierCreateState.start = { x: num(last.x), y: num(last.y), z: num(last.z) };
                bezierCreateState.phase = "pick_next";
            }
        } else {
            const newNodeId = insertEmptyBezierCreateNode();
            bezierCreateState.targetNodeId = newNodeId;
            bezierCreateState.nodeId = newNodeId;
        }
        hideHoverMarker();
        refreshBezierCreateStatus();
        updateBezierGuidePreview();
        return true;
    }

    function applyBezierGuideDragPoint(mapped) {
        if (!bezierHandleDrag || !mapped) return;
        const localMapped = mapBezierGuidePointToLocal(mapped, bezierHandleDrag.nodeId);
        const ok = setBezierHandleRelative(
            bezierHandleDrag.nodeId,
            bezierHandleDrag.role,
            localMapped,
            bezierHandleDrag.nodeIndex,
            { symmetric: bezierHandleDrag.symmetric === true }
        );
        if (!ok) {
            bezierHandleDrag = null;
            hideBezierGuidePreview();
            return;
        }
        rebuildPreviewAndKotlin();
        updateBezierGuidePreview();
    }

    function ensureAddWithPreviewObj() {
        if (addWithPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: Math.max(0.12, pointSize * 0.9),
            sizeAttenuation: true,
            color: addWithPreviewColor.getHex(),
            opacity: 0.72,
            transparent: true
        });
        addWithPreviewObj = new THREE.Points(geom, mat);
        addWithPreviewObj.visible = false;
        scene.add(addWithPreviewObj);
    }

    function hideAddWithPreview() {
        if (addWithPreviewObj) addWithPreviewObj.visible = false;
    }

    function setAddWithPreviewPoints(points) {
        const list = Array.isArray(points) ? points : [];
        lastAddWithPreviewPoints = list.map((point) => ({
            x: num(point?.x),
            y: num(point?.y),
            z: num(point?.z),
            nodeId: point?.nodeId || null,
            previewParentId: point?.previewParentId || null,
            previewSource: point?.previewSource || "add_with"
        }));
        if (!lastAddWithPreviewPoints.length) {
            hideAddWithPreview();
            return;
        }
        ensureAddWithPreviewObj();
        if (!addWithPreviewObj) return;
        const geom = addWithPreviewObj.geometry;
        if (!addWithPreviewBuf || addWithPreviewCount !== lastAddWithPreviewPoints.length) {
            addWithPreviewBuf = new Float32Array(lastAddWithPreviewPoints.length * 3);
            addWithPreviewCount = lastAddWithPreviewPoints.length;
            geom.setAttribute("position", new THREE.BufferAttribute(addWithPreviewBuf, 3));
        }
        let o = 0;
        for (const point of lastAddWithPreviewPoints) {
            addWithPreviewBuf[o++] = num(point?.x);
            addWithPreviewBuf[o++] = num(point?.y);
            addWithPreviewBuf[o++] = num(point?.z);
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        addWithPreviewObj.visible = true;
    }

    function ensureGeometryCenterPreviewObj() {
        if (geometryCenterObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: Math.max(0.14, pointSize * 1.1),
            sizeAttenuation: true,
            color: geometryCenterColor.getHex(),
            opacity: 0.9,
            transparent: true
        });
        geometryCenterObj = new THREE.Points(geom, mat);
        geometryCenterObj.visible = false;
        scene.add(geometryCenterObj);
    }

    function hideGeometryCenterPreview() {
        if (geometryCenterObj) geometryCenterObj.visible = false;
    }

    function setGeometryCenterPoints(points) {
        const list = Array.isArray(points) ? points : [];
        lastGeometryCenterPoints = list.map((point) => ({
            x: num(point?.x),
            y: num(point?.y),
            z: num(point?.z),
            nodeId: point?.nodeId || null,
            kind: point?.kind || "",
            helperType: point?.helperType || "geometry_center"
        }));
        if (!lastGeometryCenterPoints.length) {
            hideGeometryCenterPreview();
            return;
        }
        ensureGeometryCenterPreviewObj();
        if (!geometryCenterObj) return;
        const geom = geometryCenterObj.geometry;
        if (!geometryCenterBuf || geometryCenterCount !== lastGeometryCenterPoints.length) {
            geometryCenterBuf = new Float32Array(lastGeometryCenterPoints.length * 3);
            geometryCenterCount = lastGeometryCenterPoints.length;
            geom.setAttribute("position", new THREE.BufferAttribute(geometryCenterBuf, 3));
        }
        let o = 0;
        for (const point of lastGeometryCenterPoints) {
            geometryCenterBuf[o++] = point.x;
            geometryCenterBuf[o++] = point.y;
            geometryCenterBuf[o++] = point.z;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        geometryCenterObj.visible = true;
    }

    function ensureMaskPreviewObj() {
        if (maskPreviewLineObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.LineBasicMaterial({
            color: maskPreviewColor.getHex(),
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        });
        maskPreviewLineObj = new THREE.LineSegments(geom, mat);
        maskPreviewLineObj.visible = false;
        scene.add(maskPreviewLineObj);
    }

    function hideMaskPreview() {
        if (maskPreviewLineObj) maskPreviewLineObj.visible = false;
    }

    function setMaskPreviewPoints(points) {
        const list = Array.isArray(points) ? points : [];
        lastMaskPreviewPoints = list.map((point) => ({
            ...point,
            x: num(point?.x),
            y: num(point?.y),
            z: num(point?.z),
            radius: num(point?.radius),
            maskKind: point?.maskKind || "mask",
            previewType: point?.previewType || "mask_line",
            nodeId: point?.nodeId || null
        }));
        const count = Math.trunc(lastMaskPreviewPoints.length / 2) * 2;
        if (count <= 0) {
            hideMaskPreview();
            return;
        }
        ensureMaskPreviewObj();
        if (!maskPreviewLineObj) return;
        const geom = maskPreviewLineObj.geometry;
        if (!maskPreviewLineBuf || maskPreviewLineCount !== count) {
            maskPreviewLineBuf = new Float32Array(count * 3);
            maskPreviewLineCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(maskPreviewLineBuf, 3));
        }
        let o = 0;
        for (let i = 0; i < count; i++) {
            const point = lastMaskPreviewPoints[i];
            maskPreviewLineBuf[o++] = point.x;
            maskPreviewLineBuf[o++] = point.y;
            maskPreviewLineBuf[o++] = point.z;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        maskPreviewLineObj.visible = true;
    }

    function setPoints(points, addWithPreviewPoints = [], geometryCenterPoints = [], maskPreviewPoints = []) {
        statusPoints.textContent = `点数：${points.length}`;

        if (pointsObj) {
            scene.remove(pointsObj);
            pointsObj.geometry.dispose();
            pointsObj.material.dispose();
            pointsObj = null;
        }

        lastPoints = points ? points.map(p => ({ x: p.x, y: p.y, z: p.z })) : [];
        if (!points || points.length === 0) {
            defaultColorBuf = null;
            setAddWithPreviewPoints(addWithPreviewPoints);
            setGeometryCenterPoints(geometryCenterPoints);
            setMaskPreviewPoints(maskPreviewPoints);
            hideOffsetPreview();
            hideLinePickPreview();
            hidePointPickPreview();
            hideBezierGuidePreview();
            rebuildCompositionReferencePreview();
            return;
        }

        const geom = new THREE.BufferGeometry();

        // position
        const pos = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            pos[i * 3 + 0] = points[i].x;
            pos[i * 3 + 1] = points[i].y;
            pos[i * 3 + 2] = points[i].z;
        }
        geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));

        // color（默认色 + 聚焦色）
        const c0 = defaultPointColor;
        defaultColorBuf = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            defaultColorBuf[i * 3 + 0] = c0.r;
            defaultColorBuf[i * 3 + 1] = c0.g;
            defaultColorBuf[i * 3 + 2] = c0.b;
        }
        const colorArr = defaultColorBuf.slice();
        geom.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));

        geom.computeBoundingSphere();

        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            vertexColors: true,
            color: 0xffffff
        });
        pointsObj = new THREE.Points(geom, mat);
        scene.add(pointsObj);

        setAddWithPreviewPoints(addWithPreviewPoints);
        setGeometryCenterPoints(geometryCenterPoints);
        setMaskPreviewPoints(maskPreviewPoints);
        // ✅ 根据当前聚焦的卡片，重新着色
        updateFocusColors();
        updateOffsetPreview(offsetHoverPoint);
        updatePresetPreviewSize();
        updateBezierGuidePreview();
        rebuildCompositionReferencePreview();

        // 不自动重置镜头：由用户手动点击“重置镜头”
    }

    function refreshPointBaseColors() {
        if (!pointsObj || !defaultColorBuf) return;
        const c0 = defaultPointColor;
        for (let i = 0; i < defaultColorBuf.length; i += 3) {
            defaultColorBuf[i + 0] = c0.r;
            defaultColorBuf[i + 1] = c0.g;
            defaultColorBuf[i + 2] = c0.b;
        }
        updateFocusColors();
    }

    function getPointSegmentRanges(seg, totalCount = lastPoints?.length || 0) {
        if (!seg) return [];
        const max = Math.max(0, Math.trunc(Number(totalCount) || 0));
        const normalizeRange = (range) => {
            const start = Math.trunc(Number(range?.start));
            const end = Math.trunc(Number(range?.end));
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
            return {
                start: Math.max(0, Math.min(max, start)),
                end: Math.max(0, Math.min(max, end))
            };
        };
        const raw = Array.isArray(seg.ranges) ? seg.ranges : [seg];
        return raw.map(normalizeRange).filter((range) => range && range.end > range.start);
    }

    function getPointSegmentLength(seg, totalCount = lastPoints?.length || 0) {
        return getPointSegmentRanges(seg, totalCount)
            .reduce((sum, range) => sum + (range.end - range.start), 0);
    }

    function paintPointSegment(attr, seg, color) {
        if (!attr || !attr.array || !seg || !color) return;
        for (const range of getPointSegmentRanges(seg)) {
            for (let i = range.start; i < range.end; i++) {
                const k = i * 3;
                attr.array[k + 0] = color.r;
                attr.array[k + 1] = color.g;
                attr.array[k + 2] = color.b;
            }
        }
    }

    function updateFocusColors() {
        if (!pointsObj) return;
        const g = pointsObj.geometry;
        const attr = g.getAttribute("color");
        if (!attr || !attr.array || !defaultColorBuf) return;

        // 先恢复默认色
        attr.array.set(defaultColorBuf);

        // 参数同步选中：统一颜色标记
        const syncIds = (paramSync && paramSync.selectedIds) ? paramSync.selectedIds : null;
        if (syncIds && syncIds.size) {
            const cSync = syncPointColor;
            for (const id of syncIds) {
                paintPointSegment(attr, nodePointSegments.get(id), cSync);
            }
        }

        const selectedIds = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        if (selectedIds && selectedIds.size) {
            const cSel = focusPointColor;
            for (const id of selectedIds) {
                paintPointSegment(attr, nodePointSegments.get(id), cSel);
            }
        }

        // 只有仍在选中集合中的卡片才允许整段使用聚焦色。
        const focusSeg = shouldUseFocusedPointColor(focusedNodeId, selectedIds)
            ? nodePointSegments.get(focusedNodeId)
            : null;
        paintPointSegment(attr, focusSeg, focusPointColor);

        const c2 = offsetPointColor;
        const offsetIds = getActiveOffsetTargetIds();
        for (const id of offsetIds) {
            paintPointSegment(attr, nodePointSegments.get(id), c2);
        }

        attr.needsUpdate = true;
    }

    function shouldShowOffsetPreview(count) {
        if (offsetPreviewLimit === 0) return false;
        if (offsetPreviewLimit < 0) return true;
        return count <= offsetPreviewLimit;
    }

    function ensureOffsetPreviewObj() {
        if (offsetPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            color: offsetPreviewColor.getHex(),
            transparent: true,
            opacity: 0.55,
            depthWrite: false
        });
        offsetPreviewObj = new THREE.Points(geom, mat);
        offsetPreviewObj.visible = false;
        scene.add(offsetPreviewObj);
    }

    function hideOffsetPreview() {
        if (offsetPreviewObj) offsetPreviewObj.visible = false;
        referenceGuideController?.clearOffsetPreview?.();
    }

    function ensureLinePickPreviewObj() {
        if (linePickPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            color: linePickPreviewColor.getHex(),
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });
        linePickPreviewObj = new THREE.Points(geom, mat);
        linePickPreviewObj.visible = false;
        scene.add(linePickPreviewObj);
    }

    function hideLinePickPreview() {
        if (linePickPreviewObj) linePickPreviewObj.visible = false;
    }

    function appendPreviewSegment(out, a, b, count) {
        const c = Math.max(2, Math.trunc(Number(count) || 2));
        for (let i = 0; i < c; i++) {
            const t = c <= 1 ? 0 : (i / (c - 1));
            out.push(
                a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t
            );
        }
    }

    function appendPreviewDottedSegment(out, a, b, totalCount = 30, dottedCount = 4, emptyStep = 0.3) {
        const points = U.getDottedLineLocations(
            U.v(b.x - a.x, b.y - a.y, b.z - a.z),
            totalCount,
            dottedCount,
            emptyStep
        ) || [];
        for (const p of points) {
            out.push(a.x + p.x, a.y + p.y, a.z + p.z);
        }
    }

    function updateLinePickPreview(targetPoint) {
        if (!linePickMode || !targetPoint || !picked || !picked.length) {
            hideLinePickPreview();
            return;
        }

        const previewVerts = [];
        if (linePickType === "triangle") {
            if (picked.length === 1) {
                const a = picked[0];
                if (!a) {
                    hideLinePickPreview();
                    return;
                }
                // 三角拾取第 1 点确认后：先显示当前边
                appendPreviewSegment(previewVerts, a, targetPoint, 30);
            } else if (picked.length === 2) {
                const a = picked[0], b = picked[1];
                if (!a || !b) {
                    hideLinePickPreview();
                    return;
                }
                // 三角拾取第 2 点确认后：显示三角轮廓（第三点跟随鼠标）
                appendPreviewSegment(previewVerts, a, b, 24);
                appendPreviewSegment(previewVerts, b, targetPoint, 24);
                appendPreviewSegment(previewVerts, targetPoint, a, 24);
            } else {
                hideLinePickPreview();
                return;
            }
        } else {
            if (picked.length !== 1) {
                hideLinePickPreview();
                return;
            }
            const a = picked[0];
            if (!a) {
                hideLinePickPreview();
                return;
            }
            if (linePickType === "dotted_line") {
                appendPreviewDottedSegment(previewVerts, a, targetPoint, 30, 4, 0.3);
            } else {
                appendPreviewSegment(previewVerts, a, targetPoint, 30);
            }
        }

        const count = Math.max(0, Math.trunc(previewVerts.length / 3));
        if (count <= 0) {
            hideLinePickPreview();
            return;
        }
        ensureLinePickPreviewObj();
        if (!linePickPreviewObj) return;
        const geom = linePickPreviewObj.geometry;
        if (!linePickPreviewBuf || linePickPreviewCount !== count) {
            linePickPreviewBuf = new Float32Array(count * 3);
            linePickPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(linePickPreviewBuf, 3));
        }
        linePickPreviewBuf.set(previewVerts);
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        linePickPreviewObj.visible = true;
    }

    function getActiveOffsetTargetIds() {
        if (Array.isArray(offsetTargetIds) && offsetTargetIds.length) {
            const out = [];
            const seen = new Set();
            for (const id of offsetTargetIds) {
                if (!id || seen.has(id)) continue;
                seen.add(id);
                out.push(id);
            }
            if (out.length) return out;
        }
        return offsetTargetId ? [offsetTargetId] : [];
    }

    function normalizeOffsetConstraintVector(axis) {
        if (!axis || !Number.isFinite(axis.x) || !Number.isFinite(axis.y) || !Number.isFinite(axis.z)) return null;
        const normalized = U.norm(axis);
        return U.len(normalized) > 1e-9 ? normalized : null;
    }

    function applyForwardLinearTransformsToDirection(direction, transforms) {
        if (!direction || !Array.isArray(transforms) || !transforms.length) return direction;
        const vector = new THREE.Vector3(direction.x, direction.y, direction.z);
        for (const transform of transforms) {
            if (transform.type === "scale" && Number.isFinite(transform.factor)) {
                vector.multiplyScalar(transform.factor);
            } else if (transform.type === "rot" && transform.quat) {
                vector.applyQuaternion(transform.quat);
            }
        }
        return { x: vector.x, y: vector.y, z: vector.z };
    }

    function mapLocalDirectionToWorldDirection(direction, path) {
        if (!direction || !Array.isArray(path) || !path.length) return direction;
        const originPoints = mapLocalPointToWorldPoints({ x: 0, y: 0, z: 0 }, path);
        const tipPoints = mapLocalPointToWorldPoints(direction, path);
        const origin = Array.isArray(originPoints) ? originPoints[0] : null;
        const tip = Array.isArray(tipPoints) ? tipPoints[0] : null;
        if (origin && tip
            && Number.isFinite(origin.x) && Number.isFinite(origin.y) && Number.isFinite(origin.z)
            && Number.isFinite(tip.x) && Number.isFinite(tip.y) && Number.isFinite(tip.z)) {
            return {
                x: tip.x - origin.x,
                y: tip.y - origin.y,
                z: tip.z - origin.z
            };
        }
        let result = { x: direction.x, y: direction.y, z: direction.z };
        for (let i = path.length - 1; i >= 0; i--) {
            const step = path[i];
            if (!step) continue;
            result = applyForwardLinearTransformsToDirection(
                result,
                collectPostPointForwardTransformsForList(step.parentList, step.index)
            );
        }
        return result;
    }

    function resolveOffsetLocalAxis(axisKey) {
        const targetIds = getActiveOffsetTargetIds();
        const targetId = targetIds[0] || null;
        const path = targetId ? findNodePathById(targetId) : null;
        const basis = axisKey === "X"
            ? U.v(1, 0, 0)
            : axisKey === "Z"
                ? U.v(0, 0, 1)
                : U.v(0, 1, 0);
        const targetCtx = targetId ? findNodeContextById(targetId) : null;
        const innerTransforms = targetCtx?.node && isBuilderContainerKind(targetCtx.node.kind)
            ? collectPostPointForwardTransformsForList(targetCtx.node.children, -1)
            : [];
        const innerDirection = applyForwardLinearTransformsToDirection(basis, innerTransforms);
        return normalizeOffsetConstraintVector(mapLocalDirectionToWorldDirection(innerDirection, path));
    }

    function offsetConstraintLabel() {
        if (!offsetConstraintAxis || !offsetConstraintVector) return "自由";
        return `${offsetConstraintSpace === "local" ? "局部" : "世界"}${offsetConstraintAxis}`;
    }

    function transformConstraintLabel() {
        if (!transformConstraintAxis || !transformConstraintVector) return "自由";
        return `${transformConstraintSpace === "local" ? "局部" : "世界"}${transformConstraintAxis}`;
    }

    function clearTransformConstraint() {
        transformConstraintOperation = null;
        transformConstraintOrigin = null;
        transformConstraintNodeId = null;
        transformConstraintAxis = null;
        transformConstraintSpace = "world";
        transformConstraintVector = null;
        transformConstraintLastKey = "";
        transformConstraintLastAt = 0;
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
    }

    function beginTransformConstraint(operation, origin = null, nodeId = null) {
        clearTransformConstraint();
        transformConstraintOperation = operation || null;
        transformConstraintNodeId = nodeId || null;
        transformConstraintOrigin = origin
            ? {x: num(origin.x), y: num(origin.y), z: num(origin.z)}
            : null;
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
    }

    function resolveTransformLocalAxis(axisKey, nodeId = transformConstraintNodeId) {
        const key = String(axisKey || "").toUpperCase();
        const basis = key === "X" ? U.v(1, 0, 0) : key === "Z" ? U.v(0, 0, 1) : U.v(0, 1, 0);
        if (!nodeId) return basis;
        const path = typeof getBezierGuideDisplayPath === "function"
            ? getBezierGuideDisplayPath(nodeId)
            : findNodePathById(nodeId);
        if (!Array.isArray(path) || !path.length) return basis;
        const targetCtx = findNodeContextById(nodeId);
        const innerTransforms = targetCtx?.node && isBuilderContainerKind(targetCtx.node.kind)
            ? collectPostPointForwardTransformsForList(targetCtx.node.children, -1)
            : [];
        const innerDirection = applyForwardLinearTransformsToDirection(basis, innerTransforms);
        return normalizeOffsetConstraintVector(mapLocalDirectionToWorldDirection(innerDirection, path)) || basis;
    }

    function setTransformAxisConstraint(axisKey, timestamp = Date.now()) {
        if (!transformConstraintOperation) {
            return offsetMode ? setOffsetAxisConstraint(axisKey, timestamp) : false;
        }
        const key = String(axisKey || "").toUpperCase();
        if (!["X", "Y", "Z"].includes(key)) return false;
        const now = Number.isFinite(timestamp) ? timestamp : Date.now();
        const isDoubleTap = transformConstraintLastKey === key
            && now - transformConstraintLastAt <= OFFSET_AXIS_DOUBLE_TAP_MS;
        transformConstraintLastKey = key;
        transformConstraintLastAt = now;
        const worldAxis = key === "X" ? U.v(1, 0, 0) : key === "Y" ? U.v(0, 1, 0) : U.v(0, 0, 1);
        transformConstraintSpace = isDoubleTap ? "local" : "world";
        transformConstraintVector = isDoubleTap ? resolveTransformLocalAxis(key) : worldAxis;
        transformConstraintAxis = key;
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
        if (pointPickMode) refreshPointPickStatus();
        if (bezierCreateState) refreshBezierCreateStatus();
        return true;
    }

    function constrainTransformDelta(delta) {
        if (!delta || !transformConstraintVector) return delta;
        const axis = normalizeOffsetConstraintVector(transformConstraintVector);
        if (!axis) return delta;
        return U.mul(axis, U.dot(delta, axis));
    }

    function constrainTransformPoint(point, origin = null) {
        if (!point) return point;
        if (!transformConstraintOrigin && origin) {
            transformConstraintOrigin = {x: num(origin.x), y: num(origin.y), z: num(origin.z)};
        }
        if (!transformConstraintVector || !transformConstraintOrigin) return point;
        const delta = constrainTransformDelta({
            x: num(point.x) - transformConstraintOrigin.x,
            y: num(point.y) - transformConstraintOrigin.y,
            z: num(point.z) - transformConstraintOrigin.z
        });
        return {
            x: transformConstraintOrigin.x + delta.x,
            y: transformConstraintOrigin.y + delta.y,
            z: transformConstraintOrigin.z + delta.z
        };
    }

    function cloneTransformSnapshot() {
        return {state: deepClone(state), focusedNodeId: focusedNodeId || null};
    }

    function restoreTransformSnapshot(snapshot) {
        if (!snapshot?.state) return false;
        isRestoringHistory = true;
        try {
            state = normalizeState(deepClone(snapshot.state));
            focusedNodeId = snapshot.focusedNodeId || null;
        } finally {
            isRestoringHistory = false;
        }
        clearTransformConstraint();
        renderAll();
        return true;
    }

    function cancelActiveTransformOperation() {
        if (bezierHandleDrag) return cancelBezierHandleDrag(null, {restore: true, suppressClick: true});
        if (bezierNodeMoveDrag) return cancelBezierNodeMoveDrag(null, {restore: true, suppressClick: true});
        if (bezierCreateState) {
            const snapshot = bezierCreateState.operationSnapshot || bezierCreateState.dragSnapshot;
            if (snapshot) {
                stopBezierCreate({keepGuide: false});
                return restoreTransformSnapshot(snapshot);
            }
            stopBezierCreate({keepGuide: false});
            clearTransformConstraint();
            return true;
        }
        if (pointPickMode) {
            return cancelPointPick();
        }
        if (offsetMode) {
            stopOffsetMode();
            return true;
        }
        if (transformConstraintOperation) {
            clearTransformConstraint();
            return true;
        }
        return false;
    }

    function constrainOffsetDelta(delta) {
        if (!delta || !offsetConstraintVector) return delta;
        const axis = offsetConstraintVector;
        const amount = U.dot(delta, axis);
        return U.mul(axis, amount);
    }

    function refreshOffsetStatus() {
        if (!offsetMode) return;
        if (offsetTargetType === "guide") {
            const guide = referenceGuideController?.getSelectedGuide?.();
            const name = String(guide?.name || "参考线");
            setLinePickStatus(`${getPlaneInfo().label} 偏移模式（${name}）：约束 ${offsetConstraintLabel()}；左键确定位置，X/Y/Z 轴约束，Esc / V / 右键双击退出`);
            return;
        }
        const targetIds = getActiveOffsetTargetIds();
        const groupTip = targetIds.length > 1 ? `（${targetIds.length}项）` : "";
        setLinePickStatus(`${getPlaneInfo().label} 偏移模式${groupTip}：约束 ${offsetConstraintLabel()}；左键确定位置，X/Y/Z 轴约束，双击切换局部轴，Esc / V / 右键双击退出`);
    }

    function setOffsetAxisConstraint(axisKey, timestamp = Date.now()) {
        if (!offsetMode) return false;
        const key = String(axisKey || "").toUpperCase();
        if (!["X", "Y", "Z"].includes(key)) return false;
        const now = Number.isFinite(timestamp) ? timestamp : Date.now();
        const isDoubleTap = offsetConstraintLastKey === key
            && now - offsetConstraintLastAt <= OFFSET_AXIS_DOUBLE_TAP_MS;
        offsetConstraintLastKey = key;
        offsetConstraintLastAt = now;

        if (isDoubleTap) {
            const localAxis = resolveOffsetLocalAxis(key);
            offsetConstraintSpace = localAxis ? "local" : "world";
            offsetConstraintVector = localAxis || (key === "X" ? U.v(1, 0, 0) : key === "Y" ? U.v(0, 1, 0) : U.v(0, 0, 1));
        } else {
            offsetConstraintSpace = "world";
            offsetConstraintVector = key === "X" ? U.v(1, 0, 0) : key === "Y" ? U.v(0, 1, 0) : U.v(0, 0, 1);
        }
        offsetConstraintAxis = key;
        refreshOffsetStatus();
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
        updateOffsetPreview(offsetHoverPoint);
        return true;
    }

    function updateOffsetPreview(targetPoint) {
        if (!offsetMode || !offsetRefPoint || !targetPoint || !scene) {
            hideOffsetPreview();
            return;
        }
        const constrainedDelta = constrainOffsetDelta({
            x: targetPoint.x - offsetRefPoint.x,
            y: targetPoint.y - offsetRefPoint.y,
            z: targetPoint.z - offsetRefPoint.z
        });
        const dx = constrainedDelta.x;
        const dy = constrainedDelta.y;
        const dz = constrainedDelta.z;
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)
            || Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-9) {
            hideOffsetPreview();
            return;
        }
        if (offsetTargetType === "guide") {
            if (offsetPreviewObj) offsetPreviewObj.visible = false;
            referenceGuideController?.setOffsetPreview?.(offsetGuideId, { x: dx, y: dy, z: dz });
            return;
        }
        const targetIds = getActiveOffsetTargetIds();
        if (!targetIds.length) {
            hideOffsetPreview();
            return;
        }
        const targetSet = new Set(targetIds);
        const previewBasePoints = [];
        for (const id of targetIds) {
            const segRanges = getPointSegmentRanges(nodePointSegments.get(id));
            if (!segRanges.length) continue;
            for (const range of segRanges) {
                for (let i = range.start; i < range.end; i++) {
                    const point = lastPoints?.[i];
                    if (point) previewBasePoints.push(point);
                }
            }
        }
        for (const point of (lastMaskPreviewPoints || [])) {
            if (point && targetSet.has(point.nodeId)) previewBasePoints.push(point);
        }
        const count = previewBasePoints.length;
        if (!count || !shouldShowOffsetPreview(count)) {
            hideOffsetPreview();
            return;
        }
        ensureOffsetPreviewObj();
        if (!offsetPreviewObj) return;

        const geom = offsetPreviewObj.geometry;
        if (!offsetPreviewBuf || offsetPreviewCount !== count) {
            offsetPreviewBuf = new Float32Array(count * 3);
            offsetPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(offsetPreviewBuf, 3));
        }
        let o = 0;
        for (const p of previewBasePoints) {
            offsetPreviewBuf[o++] = num(p.x) + dx;
            offsetPreviewBuf[o++] = num(p.y) + dy;
            offsetPreviewBuf[o++] = num(p.z) + dz;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        offsetPreviewObj.visible = true;
    }

    function resetPointPickPreviewFrameState() {
        pointPickPreviewLastTarget = null;
        pointPickPreviewLastX = NaN;
        pointPickPreviewLastY = NaN;
        pointPickPreviewLastZ = NaN;
    }

    function cancelPointPickPreviewRaf() {
        if (pointPickPreviewRaf) {
            cancelAnimationFrame(pointPickPreviewRaf);
            pointPickPreviewRaf = 0;
        }
        pointPickPreviewPendingPoint = null;
    }

    function ensurePointPickPreviewObj() {
        if (pointPickPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: pointSize,
            sizeAttenuation: true,
            color: pointPickPreviewColor.getHex(),
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        pointPickPreviewObj = new THREE.Points(geom, mat);
        pointPickPreviewObj.visible = false;
        scene.add(pointPickPreviewObj);
    }

    function hidePointPickPreview() {
        cancelPointPickPreviewRaf();
        resetPointPickPreviewFrameState();
        if (pointPickPreviewObj) pointPickPreviewObj.visible = false;
    }

    function ensurePresetPreviewObj() {
        if (presetPreviewObj || !scene) return;
        const geom = new THREE.BufferGeometry();
        const mat = new THREE.PointsMaterial({
            size: Math.max(pointSize * 1.25, pointSize + 0.08),
            sizeAttenuation: true,
            color: presetPreviewColor.getHex(),
            transparent: true,
            opacity: 0.72,
            depthWrite: false
        });
        presetPreviewObj = new THREE.Points(geom, mat);
        presetPreviewObj.visible = false;
        scene.add(presetPreviewObj);
    }

    function updatePresetPreviewSize() {
        if (!presetPreviewObj || !presetPreviewObj.material) return;
        presetPreviewObj.material.size = Math.max(pointSize * 1.25, pointSize + 0.08);
        presetPreviewObj.material.needsUpdate = true;
    }

    function clearPresetPreview() {
        if (presetPreviewObj) presetPreviewObj.visible = false;
    }

    function collectPresetPreviewPoints(preset) {
        if (!preset) return null;
        const normalized = normalizePresetList([preset])[0];
        if (!normalized || !normalized.children.length) return null;
        try {
            const variableInfo = getPresetEffectiveVariableInfo(normalized);
            const defaultValues = getPresetVariableDefaultValues(variableInfo);
            const sourceChildren = variableInfo
                ? applyPresetVariableValuesToChildren(deepCloneJson(normalized.children || []) || [], defaultValues)
                : normalized.children;
            const children = preparePresetChildrenForInsertion(sourceChildren);
            const res = evalBuilderWithMeta(children, U.v(0, 1, 0));
            const points = res && Array.isArray(res.points) ? res.points : null;
            if (!points || !points.length) return null;
            return { normalized, points };
        } catch {
            return null;
        }
    }

    function renderPresetPreviewPoints(points, anchorPoint = null, originPoint = null) {
        if (!points || !points.length || !scene) {
            clearPresetPreview();
            return false;
        }
        ensurePresetPreviewObj();
        if (!presetPreviewObj) return false;
        const geom = presetPreviewObj.geometry;
        const count = points.length;
        if (!presetPreviewBuf || presetPreviewCount !== count) {
            presetPreviewBuf = new Float32Array(count * 3);
            presetPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(presetPreviewBuf, 3));
        }
        let o = 0;
        const anchor = anchorPoint ? normalizePointValue(anchorPoint) : null;
        const origin = originPoint ? normalizePointValue(originPoint) : { x: 0, y: 0, z: 0 };
        const dx = anchor ? anchor.x - origin.x : 0;
        const dy = anchor ? anchor.y - origin.y : 0;
        const dz = anchor ? anchor.z - origin.z : 0;
        for (const p of points) {
            presetPreviewBuf[o++] = (Number(p?.x) || 0) + dx;
            presetPreviewBuf[o++] = (Number(p?.y) || 0) + dy;
            presetPreviewBuf[o++] = (Number(p?.z) || 0) + dz;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        updatePresetPreviewSize();
        presetPreviewObj.visible = true;
        return true;
    }

    function previewPreset(preset, anchorPoint = null) {
        if (!preset || !scene) return;
        const collected = collectPresetPreviewPoints(preset);
        if (!collected) {
            clearPresetPreview();
            return;
        }
        renderPresetPreviewPoints(collected.points, anchorPoint, collected.normalized.origin);
    }

    function updatePointPickPreview(targetPoint) {
        if (!pointPickMode || !pointPickPreviewEnabled || !pointPickTarget || !targetPoint || !scene) {
            hidePointPickPreview();
            return;
        }
        const t = pointPickTarget;
        const previewTargetsRaw = (Array.isArray(t.multiTargets) && t.multiTargets.length) ? t.multiTargets : [t];
        const previewTargets = previewTargetsRaw.filter((it) => (
            it && it.obj && it.keys && it.keys.x && it.keys.y && it.keys.z
        ));
        if (!previewTargets.length) {
            hidePointPickPreview();
            return;
        }
        if (pointPickPreviewLastTarget === t
            && pointPickPreviewLastX === targetPoint.x
            && pointPickPreviewLastY === targetPoint.y
            && pointPickPreviewLastZ === targetPoint.z) {
            return;
        }
        if (Array.isArray(lastPoints) && lastPoints.length > 0 && !shouldShowOffsetPreview(lastPoints.length)) {
            hidePointPickPreview();
            return;
        }
        pointPickPreviewLastTarget = t;
        pointPickPreviewLastX = targetPoint.x;
        pointPickPreviewLastY = targetPoint.y;
        pointPickPreviewLastZ = targetPoint.z;
        let previewPoints = null;
        const backups = [];
        try {
            for (const it of previewTargets) {
                const kx = it.keys.x;
                const ky = it.keys.y;
                const kz = it.keys.z;
                backups.push({
                    target: it,
                    x: it.obj[kx],
                    y: it.obj[ky],
                    z: it.obj[kz]
                });
                it.obj[kx] = targetPoint.x;
                it.obj[ky] = targetPoint.y;
                it.obj[kz] = targetPoint.z;
            }
            const res = evalBuilderWithMeta(state.root.children, U.v(0, 1, 0));
            if (res && Array.isArray(res.points)) previewPoints = res.points;
        } catch {
            previewPoints = null;
        } finally {
            for (const b of backups) {
                const it = b.target;
                if (!it || !it.obj || !it.keys) continue;
                it.obj[it.keys.x] = b.x;
                it.obj[it.keys.y] = b.y;
                it.obj[it.keys.z] = b.z;
            }
        }
        if (!previewPoints || !previewPoints.length) {
            hidePointPickPreview();
            return;
        }
        if (!shouldShowOffsetPreview(previewPoints.length)) {
            hidePointPickPreview();
            return;
        }
        ensurePointPickPreviewObj();
        if (!pointPickPreviewObj) return;

        const geom = pointPickPreviewObj.geometry;
        const count = previewPoints.length;
        if (!pointPickPreviewBuf || pointPickPreviewCount !== count) {
            pointPickPreviewBuf = new Float32Array(count * 3);
            pointPickPreviewCount = count;
            geom.setAttribute("position", new THREE.BufferAttribute(pointPickPreviewBuf, 3));
        }
        let o = 0;
        for (let i = 0; i < count; i++) {
            const p = previewPoints[i];
            if (!p) {
                pointPickPreviewBuf[o++] = 0;
                pointPickPreviewBuf[o++] = 0;
                pointPickPreviewBuf[o++] = 0;
                continue;
            }
            pointPickPreviewBuf[o++] = p.x;
            pointPickPreviewBuf[o++] = p.y;
            pointPickPreviewBuf[o++] = p.z;
        }
        const posAttr = geom.getAttribute("position");
        if (posAttr) posAttr.needsUpdate = true;
        geom.computeBoundingSphere();
        pointPickPreviewObj.visible = true;
    }

    function queuePointPickPreview(targetPoint) {
        if (!pointPickMode || !pointPickPreviewEnabled || !targetPoint) {
            hidePointPickPreview();
            return;
        }
        pointPickPreviewPendingPoint = targetPoint;
        if (pointPickPreviewRaf) return;
        pointPickPreviewRaf = requestAnimationFrame(() => {
            pointPickPreviewRaf = 0;
            const next = pointPickPreviewPendingPoint;
            pointPickPreviewPendingPoint = null;
            updatePointPickPreview(next);
        });
    }

    // ✅ 左侧卡片聚焦高亮（UI）
    function updateFocusCardUI() {
        if (!elCardsRoot) return;
        try {
            elCardsRoot.querySelectorAll('.card.focused').forEach(el => el.classList.remove('focused'));
            elCardsRoot.querySelectorAll('.card.multi-selected').forEach(el => el.classList.remove('multi-selected'));
        } catch {}
        const selectedIds = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        if (selectedIds && selectedIds.size) {
            for (const id of selectedIds) {
                elCardsRoot.querySelectorAll(`.card[data-id="${id}"]`).forEach((el) => {
                    el.classList.add("multi-selected");
                });
            }
        }
        if (!focusedNodeId) return;
        elCardsRoot.querySelectorAll(`.card[data-id="${focusedNodeId}"]`).forEach((el) => {
            el.classList.add('focused');
        });
    }

    function setFocusedNode(id, recordHistory = true) {
        const next = id || null;
        if (next) referenceGuideController?.selectGuide?.("", { source: "card" });
        if (focusedNodeId === next) return;
        const prev = focusedNodeId;
        if (recordHistory && !isRestoringHistory && !suppressFocusHistory && !isRenderingCards) {
            historyCapture("focus_change");
        }
        focusedNodeId = next;
        updateFocusColors();
        updateBezierGuidePreview();
        updateFocusCardUI();
        scheduleParamEditorRender();
        handleCollapseAllFocusChange(prev, focusedNodeId);
        const focusedNode = focusedNodeId ? findNodeContextById(focusedNodeId)?.node : null;
        if (focusedNode?.kind === EFFECT_RING_KIND
            && (activeParameterizedInstanceNodeId !== focusedNode.id || presetRingTool?.classList.contains("hidden"))) {
            openParameterizedInstanceEditor(focusedNode);
        } else if (focusedNode?.kind !== EFFECT_RING_KIND && activeParameterizedInstanceNodeId) {
            closePresetRingTool();
        }
    }

    function clearFocusedNodeIf(id, recordHistory = true) {
        if (!id) return;
        if (focusedNodeId !== id) return;
        const prev = focusedNodeId;
        if (recordHistory && !isRestoringHistory && !suppressFocusHistory && !isRenderingCards) {
            historyCapture("focus_clear");
        }
        focusedNodeId = null;
        updateFocusColors();
        updateBezierGuidePreview();
        updateFocusCardUI();
        scheduleParamEditorRender();
        handleCollapseAllFocusChange(prev, null);
        if (activeParameterizedInstanceNodeId) {
            closePresetRingTool();
        }
    }


function buildPointOwnerByIndex(totalCount, segments) {
    const owners = new Array(totalCount || 0);
    if (!segments) return owners;
    for (const [id, seg] of segments.entries()) {
        for (const range of getPointSegmentRanges(seg, owners.length)) {
            for (let i = range.start; i < range.end; i++) owners[i] = id; // 后写入的更细粒度（子卡片）会覆盖父段
        }
    }
    return owners;
}

function ownerIdForPointIndex(i) {
    if (i === null || i === undefined) return null;
    if (pointOwnerByIndex && pointOwnerByIndex[i]) return pointOwnerByIndex[i];
    // fallback：在 segments 里找“最短段”（更细粒度）
    let best = null;
    let bestLen = Infinity;
    for (const [id, seg] of nodePointSegments.entries()) {
        for (const range of getPointSegmentRanges(seg)) {
            if (i < range.start || i >= range.end) continue;
            const len = range.end - range.start;
            if (len < bestLen) {
                bestLen = len;
                best = id;
            }
        }
    }
    return best;
}

function getNodeSegmentCenter(id) {
    if (!id) return null;
    const seg = nodePointSegments.get(id);
    if (!seg || !lastPoints || !lastPoints.length) {
        const maskPoints = Array.isArray(lastMaskPreviewPoints)
            ? lastMaskPreviewPoints.filter((point) => point && point.nodeId === id)
            : [];
        if (maskPoints.length) {
            let mx = 0, my = 0, mz = 0;
            for (const point of maskPoints) {
                mx += num(point.x);
                my += num(point.y);
                mz += num(point.z);
            }
            return {
                x: mx / maskPoints.length,
                y: my / maskPoints.length,
                z: mz / maskPoints.length
            };
        }
        const ctx = findNodeContextById(id);
        const kind = ctx?.node?.kind;
        if (kind === "clear_as_ball_mask" || kind === "clear_as_round_xz_mask") {
            const path = findNodePathById(id);
            const params = ctx.node.params || {};
            const localOrigin = {
                x: num(params.ox),
                y: num(params.oy),
                z: num(params.oz)
            };
            const worldOrigins = mapLocalPointToWorldPoints(localOrigin, path) || [];
            if (worldOrigins.length) {
                return {
                    x: worldOrigins.reduce((sum, point) => sum + num(point.x), 0) / worldOrigins.length,
                    y: worldOrigins.reduce((sum, point) => sum + num(point.y), 0) / worldOrigins.length,
                    z: worldOrigins.reduce((sum, point) => sum + num(point.z), 0) / worldOrigins.length
                };
            }
        }
        return null;
    }
    let sx = 0, sy = 0, sz = 0;
    let count = 0;
    for (const range of getPointSegmentRanges(seg)) {
        for (let i = range.start; i < range.end; i++) {
            const p = lastPoints[i];
            if (!p) continue;
            sx += p.x;
            sy += p.y;
            sz += p.z;
            count += 1;
        }
    }
    if (!count) return null;
    return { x: sx / count, y: sy / count, z: sz / count };
}

function buildAxisFromParams(p) {
    if (!p) return U.v(0, 1, 0);
    return U.v(num(p.x), num(p.y), num(p.z));
}

function averageSegmentCenterForNodeIds(ids) {
    const src = Array.isArray(ids) ? ids : [];
    let sx = 0, sy = 0, sz = 0;
    let count = 0;
    for (const id of src) {
        const c = getNodeSegmentCenter(id);
        if (!c) continue;
        sx += c.x;
        sy += c.y;
        sz += c.z;
        count += 1;
    }
    if (!count) return null;
    return { x: sx / count, y: sy / count, z: sz / count };
}

function resolveAxisForNodeId(nodeId) {
    const path = findNodePathById(nodeId);
    if (!Array.isArray(path) || !path.length) return U.v(0, 1, 0);
    let axis = U.v(0, 1, 0);
    for (const step of path) {
        let localAxis = U.v(0, 1, 0);
        const list = (step && Array.isArray(step.parentList)) ? step.parentList : [];
        const end = step && Number.isFinite(step.index) ? step.index : -1;
        for (let i = 0; i <= end && i < list.length; i++) {
            const n = list[i];
            if (!n || !n.kind) continue;
            if (n.kind === "axis") {
                localAxis = buildAxisFromParams(n.params);
            }
        }
        axis = localAxis;
    }
    const n = U.norm(axis);
    if (U.len(n) <= 1e-9) return U.v(0, 1, 0);
    return n;
}

function projectVectorOnAxisPlane(v, axisN) {
    const d = U.dot(v, axisN);
    return U.sub(v, U.mul(axisN, d));
}

function signedAngleDegAroundAxis(fromPoint, toPoint, center, axisN) {
    if (!fromPoint || !toPoint || !center || !axisN) return null;
    const fromVec = projectVectorOnAxisPlane(U.sub(fromPoint, center), axisN);
    const toVec = projectVectorOnAxisPlane(U.sub(toPoint, center), axisN);
    const fromLen = U.len(fromVec);
    const toLen = U.len(toVec);
    if (fromLen <= 1e-9 || toLen <= 1e-9) return null;
    const a = U.mul(fromVec, 1 / fromLen);
    const b = U.mul(toVec, 1 / toLen);
    const dot = Math.max(-1, Math.min(1, U.dot(a, b)));
    const cross = U.cross(a, b);
    const sign = U.dot(cross, axisN) >= 0 ? 1 : -1;
    const rad = Math.acos(dot) * sign;
    return rad * 180 / Math.PI;
}

function makeInverseAxisAngleQuat(axis, rad) {
    if (!Number.isFinite(rad) || Math.abs(rad) < 1e-12) return null;
    const n = U.norm(axis);
    if (U.len(n) <= 1e-9) return null;
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(n.x, n.y, n.z), rad);
    q.invert();
    return q;
}

function makeInverseRotateToQuat(node, axisVec) {
    const axisN = U.norm(axisVec);
    if (U.len(axisN) <= 1e-9) return null;
    const p = node.params || {};
    let to;
    if (p.mode === "originEnd") {
        const origin = U.v(num(p.ox), num(p.oy), num(p.oz));
        const end = U.v(num(p.ex), num(p.ey), num(p.ez));
        to = U.sub(end, origin);
    } else {
        to = U.v(num(p.tox), num(p.toy), num(p.toz));
    }
    const toN = U.norm(to);
    if (U.len(toN) <= 1e-9) return null;
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(
        new THREE.Vector3(axisN.x, axisN.y, axisN.z),
        new THREE.Vector3(toN.x, toN.y, toN.z)
    );
    q.invert();
    return q;
}

function collectPostLinearTransformsForList(list, afterIndex) {
    const arr = list || [];
    const transforms = [];
    let axis = U.v(0, 1, 0);

    for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (!n || !n.kind || !KIND[n.kind]) continue;

        if (n.kind === "axis") {
            axis = buildAxisFromParams(n.params);
            continue;
        }

        if (i <= afterIndex) continue;

        if (n.kind === "rotate_as_axis") {
            const rad = U.angleToRad(num(n.params?.deg), n.params?.degUnit);
            const axisVec = n.params?.useCustomAxis
                ? U.v(num(n.params?.ax), num(n.params?.ay), num(n.params?.az))
                : axis;
            const inv = makeInverseAxisAngleQuat(axisVec, rad);
            if (inv) transforms.push({ type: "rot", inv });
            continue;
        }

        if (n.kind === "rotate_to") {
            const inv = makeInverseRotateToQuat(n, axis);
            if (inv) transforms.push({ type: "rot", inv });
            continue;
        }

        if (n.kind === "scale") {
            const f = num(n.params?.factor);
            if (Number.isFinite(f) && f > 0 && Math.abs(f - 1) > 1e-12) {
                transforms.push({ type: "scale", inv: 1 / f });
            }
        }
    }
    return transforms;
}

function applyInverseTransformsToDelta(delta, transforms) {
    if (!delta || !transforms || transforms.length === 0) return delta;
    const v = new THREE.Vector3(delta.x, delta.y, delta.z);
    for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if (t.type === "scale") {
            v.multiplyScalar(t.inv);
        } else if (t.type === "rot") {
            v.applyQuaternion(t.inv);
        }
    }
    return { x: v.x, y: v.y, z: v.z };
}

function collectPostPointTransformsForList(list, afterIndex) {
    const arr = list || [];
    const transforms = [];
    let axis = U.v(0, 1, 0);

    for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (!n || !n.kind || !KIND[n.kind]) continue;

        if (n.kind === "axis") {
            axis = buildAxisFromParams(n.params);
            continue;
        }

        if (i <= afterIndex) continue;

        if (n.kind === "rotate_as_axis") {
            const rad = U.angleToRad(num(n.params?.deg), n.params?.degUnit);
            const axisVec = n.params?.useCustomAxis
                ? U.v(num(n.params?.ax), num(n.params?.ay), num(n.params?.az))
                : axis;
            const inv = makeInverseAxisAngleQuat(axisVec, rad);
            if (inv) transforms.push({ type: "rot", inv });
            continue;
        }

        if (n.kind === "rotate_to") {
            const inv = makeInverseRotateToQuat(n, axis);
            if (inv) transforms.push({ type: "rot", inv });
            continue;
        }

        if (n.kind === "scale") {
            const f = num(n.params?.factor);
            if (Number.isFinite(f) && f > 0 && Math.abs(f - 1) > 1e-12) {
                transforms.push({ type: "scale", inv: 1 / f });
            }
            continue;
        }

        if (n.kind === "points_on_each_offset") {
            transforms.push({
                type: "translate",
                x: num(n.params?.offX),
                y: num(n.params?.offY),
                z: num(n.params?.offZ)
            });
        }
    }

    return transforms;
}

function applyInversePointTransforms(point, transforms) {
    if (!point || !transforms || !transforms.length) return point;
    const v = new THREE.Vector3(point.x, point.y, point.z);
    for (let i = transforms.length - 1; i >= 0; i--) {
        const t = transforms[i];
        if (t.type === "scale") {
            v.multiplyScalar(t.inv);
        } else if (t.type === "rot") {
            v.applyQuaternion(t.inv);
        } else if (t.type === "translate") {
            v.set(v.x - num(t.x), v.y - num(t.y), v.z - num(t.z));
        }
    }
    return { x: v.x, y: v.y, z: v.z };
}

function applyInverseContainerPointOffset(point, node) {
    if (!point || !node) return point;
    if (node.kind === "add_builder" || node.kind === "with_builder" || node.kind === "add_with") {
        return {
            x: point.x - num(node.params?.ox),
            y: point.y - num(node.params?.oy),
            z: point.z - num(node.params?.oz)
        };
    }
    return point;
}

function mapWorldPointThroughScopes(worldPoint, ownerPath, currentList, currentAfterIndex) {
    if (!worldPoint) return worldPoint;
    let point = { x: num(worldPoint.x), y: num(worldPoint.y), z: num(worldPoint.z) };
    const scopes = Array.isArray(ownerPath) ? ownerPath : [];
    for (const step of scopes) {
        if (!step) continue;
        point = applyInversePointTransforms(point, collectPostPointTransformsForList(step.parentList, step.index));
        point = applyInverseContainerPointOffset(point, step.node);
    }
    point = applyInversePointTransforms(point, collectPostPointTransformsForList(currentList, currentAfterIndex));
    return point;
}

function mapWorldPointToInsertLocalPoint(worldPoint, targetList, insertIndex, ownerNode = null) {
    const ownerPath = ownerNode?.id ? (findNodePathById(ownerNode.id) || []) : [];
    const currentList = Array.isArray(targetList) ? targetList : state.root.children;
    const afterIndex = (insertIndex === null || insertIndex === undefined)
        ? (currentList.length - 1)
        : (Math.max(-1, int(insertIndex) - 1));
    return mapWorldPointThroughScopes(worldPoint, ownerPath, currentList, afterIndex);
}

function resolvePointPickTargetNodeId(target) {
    if (!target) return null;
    if (target.nodeId && findNodeContextById(target.nodeId)) return target.nodeId;
    if (target.ownerId && findNodeContextById(target.ownerId)) return target.ownerId;
    const input = target.inputs?.x || target.inputs?.y || target.inputs?.z || null;
    const syncSourceId = input?.closest?.("[data-sync-source-id]")?.dataset?.syncSourceId || null;
    if (syncSourceId && findNodeContextById(syncSourceId)) return syncSourceId;
    const card = input?.closest?.(".card[data-id]");
    const nodeId = card?.dataset?.id || null;
    return (nodeId && findNodeContextById(nodeId)) ? nodeId : null;
}

function mapWorldPointToTargetLocalPoint(worldPoint, target) {
    const nodeId = resolvePointPickTargetNodeId(target);
    if (!nodeId) return worldPoint;
    const path = findNodePathById(nodeId);
    if (!Array.isArray(path) || !path.length) return worldPoint;
    const current = path[path.length - 1];
    return mapWorldPointThroughScopes(worldPoint, path.slice(0, -1), current.parentList, current.index);
}

const GEOMETRY_CENTER_PREVIEW_KINDS = new Set([
    "add_circle",
    "add_discrete_circle_xz",
    "add_half_circle",
    "add_radian_center",
    "add_radian",
    "add_ball",
    "add_ball_surface",
    "add_ball_solid",
    "add_ball_volume",
    "add_cube_surface",
    "add_polygon",
    "add_polygon_in_circle",
    "add_round_shape",
    "add_fourier_series"
]);

function applyContainerPointOffset(point, node) {
    if (!point || !node) return point;
    if (node.kind === "add_builder" || node.kind === "with_builder" || node.kind === "add_with") {
        return {
            x: point.x + num(node.params?.ox),
            y: point.y + num(node.params?.oy),
            z: point.z + num(node.params?.oz)
        };
    }
    return point;
}

function collectPostPointForwardTransformsForList(list, afterIndex) {
    const arr = list || [];
    const transforms = [];
    let axis = U.v(0, 1, 0);
    for (let i = 0; i < arr.length; i++) {
        const n = arr[i];
        if (!n || !n.kind || !KIND[n.kind]) continue;

        if (n.kind === "axis") {
            axis = buildAxisFromParams(n.params);
            continue;
        }

        if (i <= afterIndex) continue;

        if (n.kind === "rotate_as_axis") {
            const rad = U.angleToRad(num(n.params?.deg), n.params?.degUnit);
            const axisVec = n.params?.useCustomAxis
                ? U.v(num(n.params?.ax), num(n.params?.ay), num(n.params?.az))
                : axis;
            const unit = U.norm(axisVec);
            if (U.len(unit) > 1e-9 && Number.isFinite(rad) && Math.abs(rad) > 1e-12) {
                const q = new THREE.Quaternion();
                q.setFromAxisAngle(new THREE.Vector3(unit.x, unit.y, unit.z), rad);
                transforms.push({ type: "rot", quat: q });
            }
            continue;
        }

        if (n.kind === "rotate_to") {
            const axisVec = U.norm(axis);
            if (U.len(axisVec) <= 1e-9) continue;
            const p = n.params || {};
            let to;
            if (p.mode === "originEnd") {
                const origin = U.v(num(p.ox), num(p.oy), num(p.oz));
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                to = U.sub(end, origin);
            } else {
                to = U.v(num(p.tox), num(p.toy), num(p.toz));
            }
            const toN = U.norm(to);
            if (U.len(toN) <= 1e-9) continue;
            const q = new THREE.Quaternion();
            q.setFromUnitVectors(
                new THREE.Vector3(axisVec.x, axisVec.y, axisVec.z),
                new THREE.Vector3(toN.x, toN.y, toN.z)
            );
            transforms.push({ type: "rot", quat: q });
            continue;
        }

        if (n.kind === "scale") {
            const f = num(n.params?.factor);
            if (Number.isFinite(f) && f > 0 && Math.abs(f - 1) > 1e-12) {
                transforms.push({ type: "scale", factor: f });
            }
            continue;
        }

        if (n.kind === "points_on_each_offset") {
            transforms.push({
                type: "translate",
                x: num(n.params?.offX),
                y: num(n.params?.offY),
                z: num(n.params?.offZ)
            });
        }
    }
    return transforms;
}

function applyForwardPointTransforms(point, transforms) {
    if (!point || !transforms || !transforms.length) return point;
    const v = new THREE.Vector3(point.x, point.y, point.z);
    for (const t of transforms) {
        if (t.type === "translate") {
            v.set(v.x + num(t.x), v.y + num(t.y), v.z + num(t.z));
        } else if (t.type === "scale") {
            v.multiplyScalar(t.factor);
        } else if (t.type === "rot" && t.quat) {
            v.applyQuaternion(t.quat);
        }
    }
    return { x: v.x, y: v.y, z: v.z };
}

function pathHasRepeatedContainer(path) {
    const list = Array.isArray(path) ? path : [];
    return list.some((step) => step?.node?.kind === "add_with");
}

function applyAddWithContainerPoints(points, node) {
    const src = Array.isArray(points) ? points : [];
    if (!src.length || !node || node.kind !== "add_with") return src;
    const p = node.params || {};
    const offset = { x: num(p.ox), y: num(p.oy), z: num(p.oz) };
    const verts = U.getPolygonInCircleVertices(Math.max(0, Math.trunc(num(p.c))), num(p.r)) || [];
    const rotateToCenter = !!p.rotateToCenter;
    const rotateReverse = !!p.rotateReverse;
    const rotateOffsetEnabled = !!p.rotateOffsetEnabled;
    const childAxis = (() => {
        try {
            const child = evalBuilderWithMeta(node.children || [], U.v(0, 1, 0));
            return child?.axis || U.v(0, 1, 0);
        } catch {
            return U.v(0, 1, 0);
        }
    })();
    const out = [];
    for (const base of verts) {
        for (const point of src) {
            const rotated = [U.clone(point)];
            if (rotateToCenter && typeof rotatePointsToPointUpright === "function") {
                const targetPoint = rotateOffsetEnabled
                    ? U.v(num(p.rox), num(p.roy), num(p.roz))
                    : U.v(0, 0, 0);
                const rotateTarget = rotateReverse ? U.add(targetPoint, base) : U.sub(targetPoint, base);
                rotatePointsToPointUpright(rotated, rotateTarget, childAxis);
            }
            const clone = rotated[0] || point;
            out.push({
                x: num(clone.x) + num(base?.x) + offset.x,
                y: num(clone.y) + num(base?.y) + offset.y,
                z: num(clone.z) + num(base?.z) + offset.z
            });
        }
    }
    return out;
}

function applyContainerPoints(points, node) {
    const src = Array.isArray(points) ? points : [];
    if (!src.length || !node) return src;
    if (node.kind === "add_with") return applyAddWithContainerPoints(src, node);
    return src.map((point) => applyContainerPointOffset(point, node));
}

function mapLocalPointToWorldPoints(localPoint, path) {
    if (!localPoint) return null;
    if (!Array.isArray(path) || !path.length) return [localPoint];
    let points = [{ x: num(localPoint.x), y: num(localPoint.y), z: num(localPoint.z) }];
    for (let i = path.length - 1; i >= 0; i--) {
        const step = path[i];
        if (!step) continue;
        const transforms = collectPostPointForwardTransformsForList(step.parentList, step.index);
        points = points.map((point) => applyForwardPointTransforms(point, transforms));
        if (i > 0) points = applyContainerPoints(points, path[i - 1].node);
    }
    return points;
}

function collectGeometryCenterPreviewPoints(scopeCtx = null) {
    if (!geometryCenterPreviewEnabled && lineDivisionPoints <= 0) return [];
    const out = [];
    const scopeId = scopeCtx && scopeCtx.scopeId ? String(scopeCtx.scopeId) : null;
    const sourceList = (scopeCtx && Array.isArray(scopeCtx.list)) ? scopeCtx.list : state.root.children;
    forEachNode(sourceList, (node) => {
        if (!node) return;
        const fullPath = findNodePathById(node.id);
        const scopeIndex = scopeId && Array.isArray(fullPath)
            ? fullPath.findIndex((step) => step && step.node && String(step.node.id) === scopeId)
            : -1;
        const path = scopeIndex >= 0 ? fullPath.slice(scopeIndex + 1) : fullPath;
        if (!Array.isArray(path) || !path.length) return;
        const params = node.params || {};
        if (geometryCenterPreviewEnabled && GEOMETRY_CENTER_PREVIEW_KINDS.has(node.kind)) {
            const localPoint = { x: num(params.ox), y: num(params.oy), z: num(params.oz) };
            const worldPoints = mapLocalPointToWorldPoints(localPoint, path) || [];
            for (const worldPoint of worldPoints) {
                out.push({
                    x: worldPoint.x,
                    y: worldPoint.y,
                    z: worldPoint.z,
                    nodeId: node.id,
                    kind: node.kind,
                    helperType: "geometry_center"
                });
            }
        }
        if (lineDivisionPoints > 0 && node.kind === "add_line") {
            const s = U.v(num(params.sx), num(params.sy), num(params.sz));
            const e = U.v(num(params.ex), num(params.ey), num(params.ez));
            for (let i = 1; i <= lineDivisionPoints; i++) {
                const t = i / (lineDivisionPoints + 1);
                const localPoint = {
                    x: s.x + (e.x - s.x) * t,
                    y: s.y + (e.y - s.y) * t,
                    z: s.z + (e.z - s.z) * t
                };
                const worldPoints = mapLocalPointToWorldPoints(localPoint, path) || [];
                for (const worldPoint of worldPoints) {
                    out.push({
                        x: worldPoint.x,
                        y: worldPoint.y,
                        z: worldPoint.z,
                        nodeId: node.id,
                        kind: node.kind,
                        helperType: "line_division"
                    });
                }
            }
        }
    });
    return out;
}

function mapWorldDeltaToLocalDelta(worldDelta, path, pathIndex) {
    if (!worldDelta) return worldDelta;
    if (!Array.isArray(path) || pathIndex < 0 || pathIndex >= path.length) return worldDelta;
    const transforms = [];
    for (let i = pathIndex; i >= 0; i--) {
        const ctx = path[i];
        if (!ctx || !Array.isArray(ctx.parentList)) continue;
        const post = collectPostLinearTransformsForList(ctx.parentList, ctx.index);
        if (post.length) transforms.push(...post);
    }
    return applyInverseTransformsToDelta(worldDelta, transforms);
}

function pickPointIndexFromEvent(ev) {
    if (!pointsObj || !renderer || !camera || !raycaster) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    // Points 的阈值是“世界坐标”，这里给一个随点大小变化的经验值
    raycaster.params.Points = raycaster.params.Points || {};
    raycaster.params.Points.threshold = Math.max(0.06, (pointSize || 0.2) * 0.25);
    const hits = raycaster.intersectObject(pointsObj, false);
    if (!hits || hits.length === 0) return null;
    const idx = hits[0].index;
    return (idx === undefined || idx === null) ? null : idx;
}

function pickSelectablePointHitFromEvent(ev) {
    if (!renderer || !camera || !raycaster) return null;
    const pickTargets = [];
    if (pointsObj) pickTargets.push(pointsObj);
    if (addWithPreviewObj && addWithPreviewObj.visible && lastAddWithPreviewPoints.length) {
        pickTargets.push(addWithPreviewObj);
    }
    if (!pickTargets.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    raycaster.params.Points = raycaster.params.Points || {};
    raycaster.params.Points.threshold = Math.max(0.06, (pointSize || 0.2) * 0.25);
    const hits = raycaster.intersectObjects(pickTargets, false);
    if (!hits || hits.length === 0) return null;
    const previewHit = hits.find((hit) => (
        hit && hit.object === addWithPreviewObj && hit.index !== undefined && hit.index !== null
    ));
    const hit = previewHit || hits[0];
    const idx = hit.index;
    if (idx === undefined || idx === null) return null;
    if (hit.object === addWithPreviewObj) {
        const point = lastAddWithPreviewPoints[idx] || null;
        if (!point) return null;
        return {
            source: "add_with_preview",
            index: idx,
            ownerId: point.nodeId || point.previewParentId || null,
            point
        };
    }
    return {
        source: "main",
        index: idx,
        ownerId: ownerIdForPointIndex(idx),
        point: (lastPoints && lastPoints[idx]) ? lastPoints[idx] : null
    };
}

function getParticleSnapFromEvent(ev) {
    if (!(chkSnapParticle && chkSnapParticle.checked)) return null;
    if ((!pointsObj && !compositionReferencePointsObj) || !renderer || !camera || !raycaster) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    // 吸附更宽松的阈值，优先捕获鼠标附近的粒子
    raycaster.params.Points = raycaster.params.Points || {};
    const hitThreshold = Math.max(0.12, (pointSize || 0.2) * 0.6);
    raycaster.params.Points.threshold = Math.min(hitThreshold, particleSnapRange);
    const pickTargets = [pointsObj];
    const compositionReferenceSnapTarget = compositionReferencePickObj?.visible
        ? compositionReferencePickObj
        : (compositionReferencePointsObj?.visible ? compositionReferencePointsObj : null);
    if (compositionReferenceSnapTarget && lastCompositionReferencePoints.length) {
        pickTargets.push(compositionReferenceSnapTarget);
    }
    const filteredPickTargets = pickTargets.filter(Boolean);
    if (geometryCenterObj && geometryCenterObj.visible) {
        filteredPickTargets.push(geometryCenterObj);
    }
    const hits = raycaster.intersectObjects(filteredPickTargets, false);
    if (!hits || hits.length === 0) return null;
    const hit = hits[0];
    const idx = hit.index;
    if (idx === null || idx === undefined) return null;
    if (hit.object === geometryCenterObj) {
        const point = lastGeometryCenterPoints[idx] || null;
        return point ? { point, fromHit: true, source: point.helperType || "helper" } : null;
    }
    if (hit.object === compositionReferencePointsObj || hit.object === compositionReferencePickObj) {
        const point = lastCompositionReferencePoints[idx] || null;
        return point ? { point, fromHit: true, source: "composition_reference" } : null;
    }
    if (!lastPoints || !lastPoints[idx]) return null;
    return { point: lastPoints[idx], fromHit: true, source: "particle" };
}

function getMappedPointFromEvent(ev) {
    if (!renderer || !camera || !raycaster || !pickPlane) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    if (offsetMode && offsetConstraintVector && offsetRefPoint) {
        return mapOffsetPointFromRay(raycaster.ray);
    }
    if (transformConstraintOperation && transformConstraintVector && transformConstraintOrigin) {
        return mapTransformPointFromRay(raycaster.ray);
    }
    if (lockPlaneActive && lockPlaneBasePoint && shouldApplyLockPlane()) {
        return transformConstraintOperation
            ? constrainTransformPoint(mapPickPointLockedFromRay(raycaster.ray))
            : mapPickPointLockedFromRay(raycaster.ray);
    }
    const particle = getParticleSnapFromEvent(ev);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null;
    const mapped = mapPickPoint(hit, particle);
    if (transformConstraintOperation && !transformConstraintOrigin && mapped) {
        transformConstraintOrigin = {x: mapped.x, y: mapped.y, z: mapped.z};
        updateLockPlaneGuideVisual();
    }
    return transformConstraintOperation ? constrainTransformPoint(mapped) : mapped;
}

function ensureViewBoxEl() {
    if (viewBoxEl) return viewBoxEl;
    const el = document.createElement("div");
    el.className = "pb-select-box pb-select-box-view hidden";
    document.body.appendChild(el);
    viewBoxEl = el;
    return el;
}

function releaseViewBoxPointer(pointerId) {
    const dom = renderer && renderer.domElement;
    if (!dom || pointerId === null || pointerId === undefined) return;
    try {
        if (dom.hasPointerCapture && dom.hasPointerCapture(pointerId)) {
            dom.releasePointerCapture(pointerId);
        }
    } catch {}
}

function releaseBezierHandlePointer(pointerId) {
    const dom = renderer && renderer.domElement;
    if (!dom || pointerId === null || pointerId === undefined) return;
    try {
        if (dom.hasPointerCapture && dom.hasPointerCapture(pointerId)) {
            dom.releasePointerCapture(pointerId);
        }
    } catch {}
}

function hideViewBox() {
    if (!viewBoxEl) return;
    viewBoxEl.classList.add("hidden");
}

function setViewBoxRectByClient(startX, startY, endX, endY) {
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    viewBoxRect = { left, top, right, bottom };
    const el = ensureViewBoxEl();
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${Math.round(Math.max(0, right - left))}px`;
    el.style.height = `${Math.round(Math.max(0, bottom - top))}px`;
    el.classList.remove("hidden");
}

function clearViewBoxState(pointerId = null) {
    if (viewBoxTimer) {
        clearTimeout(viewBoxTimer);
        viewBoxTimer = 0;
    }
    viewBoxPending = null;
    viewBoxSelecting = false;
    viewBoxRect = null;
    hideViewBox();
    if (pointerId !== null && pointerId !== undefined) releaseViewBoxPointer(pointerId);
}

function normalizeViewBoxPointSelection(selectionMap) {
    const out = new Map();
    if (!(selectionMap instanceof Map)) return out;
    for (const [ownerId, source] of selectionMap.entries()) {
        if (!ownerId) continue;
        const bucket = new Set();
        if (source instanceof Set) {
            for (const idx of source) {
                if (Number.isInteger(idx) && idx >= 0) bucket.add(idx);
            }
        } else if (Array.isArray(source)) {
            for (const idx of source) {
                if (Number.isInteger(idx) && idx >= 0) bucket.add(idx);
            }
        } else if (Number.isInteger(source) && source >= 0) {
            bucket.add(source);
        }
        if (bucket.size) out.set(ownerId, bucket);
    }
    return out;
}

function clearViewBoxPointSelection() {
    viewBoxPointSelectionByOwner = new Map();
    viewBoxPreviewPointSelectionByOwner = new Map();
}

function setViewBoxPointSelection(selectionMap, options = {}) {
    const additive = options.additive === true;
    const normalized = normalizeViewBoxPointSelection(selectionMap);
    if (!additive) {
        viewBoxPointSelectionByOwner = normalized;
        return;
    }
    if (!normalized.size) return;
    const merged = normalizeViewBoxPointSelection(viewBoxPointSelectionByOwner);
    for (const [ownerId, bucket] of normalized.entries()) {
        if (!merged.has(ownerId)) merged.set(ownerId, new Set());
        const target = merged.get(ownerId);
        for (const idx of bucket) target.add(idx);
    }
    viewBoxPointSelectionByOwner = merged;
}

function setViewBoxPreviewPointSelection(selectionMap, options = {}) {
    const additive = options.additive === true;
    const normalized = normalizeViewBoxPointSelection(selectionMap);
    if (!additive) {
        viewBoxPreviewPointSelectionByOwner = normalized;
        return;
    }
    if (!normalized.size) return;
    const merged = normalizeViewBoxPointSelection(viewBoxPreviewPointSelectionByOwner);
    for (const [ownerId, bucket] of normalized.entries()) {
        if (!merged.has(ownerId)) merged.set(ownerId, new Set());
        const target = merged.get(ownerId);
        for (const idx of bucket) target.add(idx);
    }
    viewBoxPreviewPointSelectionByOwner = merged;
}

function getViewBoxPointIndicesForOwner(ownerId) {
    if (!ownerId || !(viewBoxPointSelectionByOwner instanceof Map)) return [];
    const bucket = viewBoxPointSelectionByOwner.get(ownerId);
    if (!bucket || !bucket.size) return [];
    return Array.from(bucket)
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && (!lastPoints || idx < lastPoints.length) && ownerIdForPointIndex(idx) === ownerId)
        .sort((a, b) => a - b);
}

function getViewBoxPreviewPointIndicesForOwner(ownerId) {
    if (!ownerId || !(viewBoxPreviewPointSelectionByOwner instanceof Map)) return [];
    const bucket = viewBoxPreviewPointSelectionByOwner.get(ownerId);
    if (!bucket || !bucket.size) return [];
    return Array.from(bucket)
        .filter((idx) => {
            if (!Number.isInteger(idx) || idx < 0) return false;
            if (!lastAddWithPreviewPoints || idx >= lastAddWithPreviewPoints.length) return false;
            return (lastAddWithPreviewPoints[idx]?.nodeId || lastAddWithPreviewPoints[idx]?.previewParentId || null) === ownerId;
        })
        .sort((a, b) => a - b);
}

function getViewBoxSelectedOwnerIds() {
    const out = new Set();
    if (viewBoxPointSelectionByOwner instanceof Map) {
        for (const ownerId of viewBoxPointSelectionByOwner.keys()) {
            if (!ownerId) continue;
            if (!getViewBoxPointIndicesForOwner(ownerId).length) continue;
            out.add(ownerId);
        }
    }
    if (viewBoxPreviewPointSelectionByOwner instanceof Map) {
        for (const ownerId of viewBoxPreviewPointSelectionByOwner.keys()) {
            if (!ownerId) continue;
            if (!getViewBoxPreviewPointIndicesForOwner(ownerId).length) continue;
            out.add(ownerId);
        }
    }
    return normalizeActionTargetIds(Array.from(out));
}

function shouldStartViewBox(ev) {
    if (!renderer || !renderer.domElement) return false;
    if (!ev || ev.button !== 0) return false;
    if (ev.altKey && !getFocusedBezierEditContext()) return false;
    const leftMouseAction = controls && controls.mouseButtons ? controls.mouseButtons.LEFT : null;
    if (leftMouseAction !== null && leftMouseAction !== undefined) return false;
    if (linePickMode || pointPickMode || offsetMode || rotateMode) return false;
    return true;
}

function startViewBoxSelecting(ev) {
    if (!viewBoxPending || !ev || ev.pointerId !== viewBoxPending.pointerId) return;
    viewBoxSelecting = true;
    setViewBoxRectByClient(viewBoxPending.startX, viewBoxPending.startY, ev.clientX, ev.clientY);
}

function beginViewBoxPending(ev) {
    if (!shouldStartViewBox(ev)) return false;
    clearViewBoxState();
    viewBoxPending = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        ctrlKey: !!ev.ctrlKey,
        shiftKey: !!ev.shiftKey,
        altKey: !!ev.altKey
    };
    const dom = renderer && renderer.domElement;
    if (dom && dom.setPointerCapture) {
        try { dom.setPointerCapture(ev.pointerId); } catch {}
    }
    viewBoxTimer = setTimeout(() => {
        viewBoxTimer = 0;
        if (!viewBoxPending) return;
        startViewBoxSelecting({
            pointerId: viewBoxPending.pointerId,
            clientX: viewBoxPending.startX,
            clientY: viewBoxPending.startY
        });
    }, VIEW_BOX_DELAY_MS);
    return true;
}

function updateViewBoxSelecting(ev) {
    if (!viewBoxPending || !ev || ev.pointerId !== viewBoxPending.pointerId) return false;
    if (!viewBoxSelecting) {
        const dx = ev.clientX - viewBoxPending.startX;
        const dy = ev.clientY - viewBoxPending.startY;
        if (Math.hypot(dx, dy) >= VIEW_BOX_DRAG_START_PX) {
            if (viewBoxTimer) {
                clearTimeout(viewBoxTimer);
                viewBoxTimer = 0;
            }
            startViewBoxSelecting(ev);
        } else {
            return false;
        }
    }
    setViewBoxRectByClient(viewBoxPending.startX, viewBoxPending.startY, ev.clientX, ev.clientY);
    return true;
}

function projectPointToClient(p) {
    if (!camera || !renderer || !p) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    _viewProjTmp.set(p.x, p.y, p.z).project(camera);
    if (!Number.isFinite(_viewProjTmp.x) || !Number.isFinite(_viewProjTmp.y) || !Number.isFinite(_viewProjTmp.z)) return null;
    if (_viewProjTmp.z < -1 || _viewProjTmp.z > 1) return null;
    const x = ((_viewProjTmp.x + 1) / 2) * rect.width + rect.left;
    const y = ((-_viewProjTmp.y + 1) / 2) * rect.height + rect.top;
    return { x, y };
}

function pickMeasurePointAtClientPoint(clientX, clientY, radiusPx = 12) {
    if (!renderer || !camera) return null;
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const visit = (points, label) => {
        const list = Array.isArray(points) ? points : [];
        for (let i = 0; i < list.length; i++) {
            const point = list[i];
            if (!point) continue;
            const screen = projectPointToClient(point);
            if (!screen) continue;
            const dx = screen.x - clientX;
            const dy = screen.y - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 >= bestDist) continue;
            bestDist = d2;
            best = {
                x: num(point.x),
                y: num(point.y),
                z: num(point.z),
                label
            };
        }
    };
    visit(lastPoints, "point");
    visit(lastAddWithPreviewPoints, "addWithPreview");
    if (geometryCenterObj && geometryCenterObj.visible) {
        visit(lastGeometryCenterPoints, "geometryCenter");
    }
    if (bestDist <= radiusPx * radiusPx) return best;
    return null;
}

function resolveMeasurePointFromEvent(ev) {
    if (!ev) return null;
    const picked = pickMeasurePointAtClientPoint(ev.clientX, ev.clientY);
    if (picked) {
        return {
            point: picked,
            clientX: ev.clientX,
            clientY: ev.clientY,
            source: picked.label || "point"
        };
    }
    const mapped = getMappedPointFromEvent(ev);
    if (!mapped) return null;
    const point = {
        x: num(mapped?.x),
        y: num(mapped?.y),
        z: num(mapped?.z),
        label: `grid:${getPlaneInfo().label}`
    };
    return {
        point,
        clientX: ev.clientX,
        clientY: ev.clientY,
        source: "grid"
    };
}

function collectViewBoxSelection(rect) {
    const hasMainPoints = Array.isArray(lastPoints) && lastPoints.length > 0;
    const hasPreviewPoints = Array.isArray(lastAddWithPreviewPoints) && lastAddWithPreviewPoints.length > 0;
    if (!rect || (!hasMainPoints && !hasPreviewPoints)) {
        return { ownerIds: [], pointIndicesByOwner: new Map(), previewPointIndicesByOwner: new Map() };
    }
    const counts = new Map();
    const pointIndicesByOwner = new Map();
    const previewPointIndicesByOwner = new Map();
    if (hasMainPoints) {
        for (let i = 0; i < lastPoints.length; i++) {
            const p = lastPoints[i];
            if (!p) continue;
            const ownerId = ownerIdForPointIndex(i);
            if (!ownerId) continue;
            const sp = projectPointToClient(p);
            if (!sp) continue;
            if (sp.x < rect.left || sp.x > rect.right || sp.y < rect.top || sp.y > rect.bottom) continue;
            counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
            if (!pointIndicesByOwner.has(ownerId)) pointIndicesByOwner.set(ownerId, []);
            pointIndicesByOwner.get(ownerId).push(i);
        }
    }
    if (hasPreviewPoints) {
        for (let i = 0; i < lastAddWithPreviewPoints.length; i++) {
            const p = lastAddWithPreviewPoints[i];
            if (!p) continue;
            const ownerId = p.nodeId || p.previewParentId || null;
            if (!ownerId) continue;
            const sp = projectPointToClient(p);
            if (!sp) continue;
            if (sp.x < rect.left || sp.x > rect.right || sp.y < rect.top || sp.y > rect.bottom) continue;
            counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
            if (!previewPointIndicesByOwner.has(ownerId)) previewPointIndicesByOwner.set(ownerId, []);
            previewPointIndicesByOwner.get(ownerId).push(i);
        }
    }
    const ownerIds = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    return { ownerIds, pointIndicesByOwner, previewPointIndicesByOwner };
}

function collectOwnerIdsInViewBox(rect) {
    return collectViewBoxSelection(rect).ownerIds;
}

function collectBezierNodeSelectionsInRect(rect) {
    const selectedByOwner = new Map();
    if (!rect) return selectedByOwner;
    const visit = (list) => {
        for (const node of Array.isArray(list) ? list : []) {
            if (!node) continue;
            if (node.id && isEditableBezierNodeKind(node.kind)) {
                const nodes = Array.isArray(node.params?.nodes) ? node.params.nodes : [];
                const displayGuide = transformBezierGuideForDisplay(getBezierGuideDataByNodeId(node.id));
                const selected = [];
                for (let index = 0; index < nodes.length; index++) {
                    const item = nodes[index];
                    const displayItem = displayGuide?.nodes?.[index] || item;
                    const screen = projectPointToClient({ x: num(displayItem.x), y: num(displayItem.y), z: num(displayItem.z) });
                    if (!screen) continue;
                    if (screen.x >= rect.left && screen.x <= rect.right && screen.y >= rect.top && screen.y <= rect.bottom) {
                        selected.push(index);
                    }
                }
                if (selected.length) selectedByOwner.set(node.id, selected);
            }
            if (Array.isArray(node.children)) visit(node.children);
        }
    };
    visit(state?.root?.children || []);
    return selectedByOwner;
}

function isPreviewSelectableGroupChild(node) {
    if (!node || !node.id) return false;
    if (String(node.kind || "").startsWith("apply_")) return false;
    return nodePointSegments instanceof Map && nodePointSegments.has(node.id);
}

function expandPreviewSelectionWithCompleteGroups(ids) {
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
    if (!selected.size) return [];
    let changed = true;
    while (changed) {
        changed = false;
        const visit = (list) => {
            const arr = Array.isArray(list) ? list : [];
            for (const node of arr) {
                if (!node || !node.id) continue;
                if (isBuilderContainerKind(node.kind) && Array.isArray(node.children)) {
                    const required = node.children
                        .filter(isPreviewSelectableGroupChild)
                        .map((child) => child.id);
                    if (required.length && required.every((id) => selected.has(id)) && !selected.has(node.id)) {
                        selected.add(node.id);
                        changed = true;
                    }
                    visit(node.children);
                }
            }
        };
        visit(state?.root?.children || []);
    }
    const pruneDescendants = (list, ancestorSelected = false) => {
        const arr = Array.isArray(list) ? list : [];
        for (const node of arr) {
            if (!node || !node.id) continue;
            const selectedHere = selected.has(node.id);
            if (ancestorSelected) selected.delete(node.id);
            if (Array.isArray(node.children)) {
                pruneDescendants(node.children, ancestorSelected || selectedHere);
            }
        }
    };
    pruneDescendants(state?.root?.children || []);
    return Array.from(selected);
}

function buildPreviewSelectionIds(ids, additive = false) {
    const base = [];
    if (additive && typeof getCardSelectionIds === "function") {
        const current = getCardSelectionIds();
        if (current && current.size) base.push(...Array.from(current).filter(Boolean));
    }
    base.push(...(Array.isArray(ids) ? ids.filter(Boolean) : []));
    return expandPreviewSelectionWithCompleteGroups(base);
}

function getPreviewSelectionFocusId(ids) {
    const list = Array.isArray(ids) ? ids : [];
    for (const id of list) {
        const ctx = findNodeContextById(id);
        if (ctx && ctx.node && isBuilderContainerKind(ctx.node.kind)) return id;
    }
    return list.find(Boolean) || null;
}

function applyViewBoxSelection(ownerIds, options = {}) {
    const replace = !options.additive;
    const ids = buildPreviewSelectionIds(ownerIds, !!options.additive);
    const pointIndicesByOwner = options.pointIndicesByOwner instanceof Map ? options.pointIndicesByOwner : new Map();
    const previewPointIndicesByOwner = options.previewPointIndicesByOwner instanceof Map ? options.previewPointIndicesByOwner : new Map();
    blurActiveElementForCanvas();
    if (pointIndicesByOwner.size || previewPointIndicesByOwner.size) {
        setViewBoxPointSelection(pointIndicesByOwner, { additive: !!options.additive });
        setViewBoxPreviewPointSelection(previewPointIndicesByOwner, { additive: !!options.additive });
    } else if (replace) {
        clearViewBoxPointSelection();
    }
    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(ids, {
            replace,
            focus: false,
            reveal: false,
            syncWithParamSync: true,
            syncStrictKind: true,
            keepPointSelection: true
        });
    }
    if (!ids.length) {
        if (replace && focusedNodeId) setFocusedNode(null, true);
        return;
    }
    const focusId = getPreviewSelectionFocusId(ids);
    focusCardById(focusId, true, false, false);
}

function finishViewBoxSelection(ev) {
    if (!viewBoxPending || !ev || ev.pointerId !== viewBoxPending.pointerId) return false;
    const additive = !!(viewBoxPending.ctrlKey || viewBoxPending.shiftKey);
    const altSelect = !!viewBoxPending.altKey;
    const pointerId = viewBoxPending.pointerId;
    const rect = viewBoxRect;
    const active = viewBoxSelecting;
    clearViewBoxState(pointerId);
    if (!active || !rect) return false;
    if ((rect.right - rect.left) < 3 && (rect.bottom - rect.top) < 3) return false;
    const selection = collectViewBoxSelection(rect);
    const bezierNodesByOwner = bezierCreateState
        ? collectBezierNodeSelectionsInRect(rect)
        : new Map();
    const selectionLevel = resolveBezierBoxSelectionLevel(selection.ownerIds, bezierNodesByOwner);
    if (selectionLevel === "nodes") {
        clearCardSelectionForBezierNodes();
        setBezierNodeSelections(bezierNodesByOwner, { additive });
        if (altSelect && bezierNodesByOwner.size) deleteSelectedBezierNode();
        armCanvasClickSuppress(ev);
        return true;
    }
    applyViewBoxSelection(selection.ownerIds, {
        additive,
        pointIndicesByOwner: selection.pointIndicesByOwner,
        previewPointIndicesByOwner: selection.previewPointIndicesByOwner
    });
    armCanvasClickSuppress(ev);
    return true;
}

function scrollCardToTop(cardEl) {
    if (!cardEl || !elCardsRoot) return;
    scrollCardIntoContainer(elCardsRoot, cardEl);
}

function scrollCardIntoContainer(containerEl, cardEl, offset = 8) {
    if (!containerEl || !cardEl) return;
    const cr = containerEl.getBoundingClientRect();
    const r = cardEl.getBoundingClientRect();
    const delta = (r.top - cr.top);
    containerEl.scrollTop += delta - offset;
}

function getCardScrollContainer(cardEl) {
    if (!cardEl) return elCardsRoot;
    const sub = cardEl.closest ? cardEl.closest(".subcards") : null;
    return sub || elCardsRoot;
}

function revealCardPathById(id) {
    const ctx = findNodeContextById(id);
    if (!ctx || !ctx.node) return false;
    let changed = false;
    const list = [];
    list.push(ctx.node);
    let parent = ctx.parentNode;
    while (parent && parent.id) {
        list.push(parent);
        const next = findNodeContextById(parent.id);
        parent = next ? (next.parentNode || null) : null;
    }
    for (const n of list) {
        if (n.collapsed) {
            n.collapsed = false;
            changed = true;
        }
        if (n.folded && (isBuilderContainerKind(n.kind) || n.kind === "add_fourier_series")) {
            n.folded = false;
            changed = true;
        }
    }
    return changed;
}

function focusCardById(id, recordHistory = true, scrollToTop = true, revealPath = false) {
    if (!id) return false;
    const ctx = findNodeContextById(id);
    const parentNode = ctx ? ctx.parentNode : null;
    const parentIsBuilder = parentNode && isBuilderContainerKind(parentNode.kind);
    const parentId = parentIsBuilder ? parentNode.id : null;
    const needRender = revealPath ? (revealCardPathById(id) || (typeof revealCardScopeById === "function" ? revealCardScopeById(id) : false)) : false;
    setFocusedNode(id, recordHistory);
    if (needRender) {
        renderAll();
    }
    requestAnimationFrame(() => {
        const el = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${id}"]`) : null;
        const parentEl = parentId ? elCardsRoot.querySelector(`.card[data-id="${parentId}"]`) : null;
        if (parentEl) {
            const container = getCardScrollContainer(parentEl);
            scrollCardIntoContainer(container, parentEl);
        } else if ((scrollToTop || revealPath) && el) {
            const container = getCardScrollContainer(el);
            scrollCardIntoContainer(container, el);
        }
        if (el) {
            try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
        }
        if (parentEl && el) {
            requestAnimationFrame(() => {
                const parentEl2 = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${parentId}"]`) : null;
                const el2 = elCardsRoot ? elCardsRoot.querySelector(`.card[data-id="${id}"]`) : null;
                const subcards = parentEl2 ? parentEl2.querySelector(".subcards") : null;
                if (subcards && el2) {
                    scrollCardIntoContainer(subcards, el2);
                }
            });
        }
    });
    return true;
}

function isActionMenuAllowed() {
    if (linePickMode || pointPickMode || offsetMode || rotateMode) return false;
    if ((modal && !modal.classList.contains("hidden"))
        || (hkModal && !hkModal.classList.contains("hidden"))
        || (settingsModal && !settingsModal.classList.contains("hidden"))) {
        return false;
    }
    return true;
}

function normalizeActionTargetIds(ids) {
    const src = Array.isArray(ids) ? ids : [];
    const out = [];
    const seen = new Set();
    for (const id of src) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (!findNodeContextById(id)) continue;
        out.push(id);
    }
    return out;
}

function normalizeOutermostActionTargetIds(ids) {
    const out = normalizeActionTargetIds(ids);
    if (out.length <= 1) return out;
    const outSet = new Set(out);
    const pruned = [];
    for (const id of out) {
        const path = findNodePathById(id);
        let coveredByAncestor = false;
        if (Array.isArray(path) && path.length > 1) {
            for (let i = 0; i < path.length - 1; i++) {
                const ancId = path[i] && path[i].node ? path[i].node.id : null;
                if (ancId && outSet.has(ancId)) {
                    coveredByAncestor = true;
                    break;
                }
            }
        }
        if (!coveredByAncestor) pruned.push(id);
    }
    return pruned;
}

function getActionTargetIds(preferredId = null) {
    const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
    const selected = selectedSet ? Array.from(selectedSet).filter(Boolean) : [];
    if (preferredId) {
        if (selected.length && selected.includes(preferredId)) return normalizeActionTargetIds(selected);
        return normalizeActionTargetIds([preferredId]);
    }
    if (selected.length) return normalizeActionTargetIds(selected);
    if (focusedNodeId) return normalizeActionTargetIds([focusedNodeId]);
    return [];
}

function areActionTargetsSameKind(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return false;
    let kind = null;
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) return false;
        if (!kind) kind = ctx.node.kind;
        else if (kind !== ctx.node.kind) return false;
    }
    return true;
}

function wrapTargetIdsInGroup(ids, kind = "add_builder") {
    const valid = normalizeOutermostActionTargetIds(ids);
    if (!valid.length) return false;

    const rows = [];
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node || !Array.isArray(ctx.parentList)) continue;
        rows.push({ id, ctx });
    }
    if (!rows.length) return false;

    const parentList = rows[0].ctx.parentList;
    for (const row of rows) {
        if (row.ctx.parentList !== parentList) {
            showToast("创建组失败：只能包裹同一层级的卡片", "error");
            return false;
        }
    }

    rows.sort((a, b) => a.ctx.index - b.ctx.index);
    const insertIndex = rows[0].ctx.index;
    const groupNode = makeNode(kind);
    if (!groupNode) return false;
    if (!Array.isArray(groupNode.children)) groupNode.children = [];

    historyCapture(`wrap_${kind}`);
    const children = [];
    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const at = parentList.findIndex((item) => item && item.id === row.id);
        if (at < 0) continue;
        const [moved] = parentList.splice(at, 1);
        if (moved) children.unshift(moved);
    }
    if (!children.length) return false;

    groupNode.children.splice(0, groupNode.children.length, ...children);
    const at = Math.max(0, Math.min(insertIndex, parentList.length));
    parentList.splice(at, 0, groupNode);
    ensureAxisEverywhere();

    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(children.map((node) => node.id).filter(Boolean), {
            replace: true,
            focus: false,
            syncWithParamSync: false
        });
    }
    setFocusedNode(groupNode.id, false);
    renderAll();
    requestAnimationFrame(() => {
        const el = elCardsRoot?.querySelector?.(`.card[data-id="${groupNode.id}"]`);
        if (el) {
            try { el.focus(); } catch {}
            try { el.scrollIntoView({ block: "nearest" }); } catch {}
        }
    });
    showToast(`已创建组并移入 ${children.length} 张卡片`, "success");
    return true;
}

function startMoveForTargetIds(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return;
    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(valid, { replace: true, focus: false, syncWithParamSync: false });
    }
    const focusId = valid[0];
    focusCardById(focusId, false, false, true);
    if (valid.length > 1) startOffsetMode(focusId, { ids: valid });
    else startOffsetMode(focusId);
}

function normalizeAxisForRotate(axis, fallback = null) {
    const fb = fallback || U.v(0, 1, 0);
    let out = axis;
    if (!out || !Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z)) out = fb;
    out = U.norm(out || fb);
    if (U.len(out) <= 1e-9) out = U.v(0, 1, 0);
    return out;
}

function resolveAxisFromRotateNodeId(rotateId, fallbackSourceId = null) {
    const rotateCtx = findNodeContextById(rotateId);
    if (!rotateCtx || !rotateCtx.node || rotateCtx.node.kind !== "rotate_as_axis") {
        return normalizeAxisForRotate(resolveAxisForNodeId(fallbackSourceId || null));
    }
    const p = rotateCtx.node.params || {};
    if (p.useCustomAxis) {
        return normalizeAxisForRotate(U.v(num(p.ax), num(p.ay), num(p.az)));
    }
    return normalizeAxisForRotate(resolveAxisForNodeId(fallbackSourceId || null));
}

function resolveReusableTailRotateForRows(rows) {
    const src = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (!src.length) return null;

    // 选中的是一个子 builder 卡片，且其子卡片末尾已是 rotate_as_axis：直接复用
    if (src.length === 1) {
        const ctx = src[0].ctx;
        const node = ctx && ctx.node;
        const children = node && Array.isArray(node.children) ? node.children : null;
        if (node && isBuilderContainerKind(node.kind) && children && children.length >= 1) {
            const tail = children[children.length - 1];
            if (tail && tail.kind === "rotate_as_axis") {
                return {
                    rotateId: tail.id,
                    sourceIds: [src[0].id]
                };
            }
        }
    }

    // 选中的是同一子 builder 下的全部子卡片（末尾 rotate_as_axis 之外）
    const firstCtx = src[0].ctx;
    if (!firstCtx || !firstCtx.parentNode || !isBuilderContainerKind(firstCtx.parentNode.kind)) return null;
    const parentNode = firstCtx.parentNode;
    const parentList = firstCtx.parentList;
    if (!Array.isArray(parentList) || parentList.length < 2) return null;
    for (const row of src) {
        const ctx = row && row.ctx;
        if (!ctx || ctx.parentNode !== parentNode || ctx.parentList !== parentList) return null;
    }
    const tailIndex = parentList.length - 1;
    const tail = parentList[tailIndex];
    if (!tail || tail.kind !== "rotate_as_axis") return null;
    if (src.length !== tailIndex) return null;
    const idxSet = new Set();
    for (const row of src) {
        const idx = row.ctx.index;
        if (!Number.isInteger(idx) || idx < 0 || idx >= tailIndex) return null;
        idxSet.add(idx);
    }
    if (idxSet.size !== src.length) return null;
    for (let i = 0; i < tailIndex; i++) {
        if (!idxSet.has(i)) return null;
    }
    const ordered = src.slice().sort((a, b) => a.ctx.index - b.ctx.index).map((r) => r.id);
    return {
        rotateId: tail.id,
        sourceIds: ordered
    };
}

function hasPointSegmentForNodeId(id) {
    if (!id) return false;
    const seg = nodePointSegments.get(id);
    return getPointSegmentLength(seg) > 0;
}

function resolveReusableOffsetAncestor(path) {
    if (!Array.isArray(path) || path.length < 2) return null;
    for (let i = path.length - 2; i >= 0; i--) {
        const step = path[i];
        const builderNode = step && step.node;
        const childStep = path[i + 1];
        const childNode = childStep && childStep.node;
        if (!builderNode || builderNode.kind !== "add_builder" || !Array.isArray(builderNode.children) || !childNode) continue;
        let pointCount = 0;
        let coversTarget = false;
        for (const child of builderNode.children) {
            if (!child || !hasPointSegmentForNodeId(child.id)) continue;
            pointCount += 1;
            if (child.id === childNode.id) coversTarget = true;
            if (pointCount > 1 && coversTarget) break;
        }
        if (pointCount === 1 && coversTarget) {
            return { node: builderNode, pathIndex: i };
        }
    }
    return null;
}

const BUILTIN_ROTATE_PARAM_BINDINGS = {
    add_half_circle: { valueKey: "rotateDeg", unitKey: "rotateDegUnit", enableKey: "useRotate" },
    add_radian_center: { valueKey: "rotateDeg", unitKey: "rotateDegUnit", enableKey: "useRotate" },
    add_radian: { valueKey: "rotateDeg", unitKey: "rotateDegUnit", enableKey: "useRotate" },
    apply_spiral_offset: { valueKey: "rotateDeg", unitKey: "rotateDegUnit", enableKey: "useRotate" }
};

function normalizeAngleUnitForRotate(unit) {
    return String(unit || "deg").toLowerCase() === "rad" ? "rad" : "deg";
}

function readAngleParamAsDeg(params, valueKey, unitKey) {
    const p = params || {};
    const value = num(p[valueKey]);
    return normalizeAngleUnitForRotate(p[unitKey]) === "rad" ? (value * 180 / Math.PI) : value;
}

function makeRotateParamBinding(nodeId, options = {}) {
    const valueKey = options.valueKey || "deg";
    const unitKey = options.unitKey || `${valueKey}Unit`;
    const scale = Number.isFinite(options.valueScale) && Math.abs(options.valueScale) > 1e-9 ? options.valueScale : 1;
    return {
        type: "param",
        nodeId,
        valueKey,
        unitKey,
        enableKey: options.enableKey || null,
        valueScale: scale,
        sourceIds: Array.isArray(options.sourceIds) && options.sourceIds.length ? options.sourceIds.slice() : (nodeId ? [nodeId] : [])
    };
}

function readRotateBindingDeg(binding) {
    if (!binding) return 0;
    if (binding.type === "deferred_wrapper") return Number.isFinite(binding.initialDeg) ? binding.initialDeg : 0;
    if (!binding.nodeId) return 0;
    const ctx = findNodeContextById(binding.nodeId);
    if (!ctx || !ctx.node) return 0;
    const scale = Number.isFinite(binding.valueScale) && Math.abs(binding.valueScale) > 1e-9 ? binding.valueScale : 1;
    return readAngleParamAsDeg(ctx.node.params || {}, binding.valueKey || "deg", binding.unitKey || `${binding.valueKey || "deg"}Unit`) / scale;
}

function resolveBuiltinRotateBindingForRow(row) {
    if (!row || !row.ctx || !row.ctx.node) return null;
    if (row.ctx.node.kind === BUILDER_REFERENCE_KIND) {
        const p = row.ctx.node.params || {};
        return Object.assign(makeRotateParamBinding(row.id, {
            valueKey: "rotationDeg",
            unitKey: "rotationDegUnit",
            sourceIds: [row.id]
        }), {
            axis: normalizeAxisForRotate(U.v(num(p.rotationAxisX), num(p.rotationAxisY, 1), num(p.rotationAxisZ)))
        });
    }
    const cfg = BUILTIN_ROTATE_PARAM_BINDINGS[row.ctx.node.kind];
    if (!cfg) return null;
    const axis = normalizeAxisForRotate(resolveAxisForNodeId(row.id));
    if (Math.abs(axis.x) > 1e-6 || Math.abs(axis.z) > 1e-6 || Math.abs(Math.abs(axis.y) - 1) > 1e-6) {
        return null;
    }
    return makeRotateParamBinding(row.id, {
        valueKey: cfg.valueKey,
        unitKey: cfg.unitKey,
        enableKey: cfg.enableKey,
        valueScale: axis.y < 0 ? -1 : 1,
        sourceIds: [row.id]
    });
}

function ensureRotateHistoryCaptured(reason = "rotate_drag") {
    if (rotateHistoryCaptured) return;
    historyCapture(reason);
    rotateHistoryCaptured = true;
}

function normalizeLocalRotateAnchor(anchor) {
    const a = anchor || {};
    return {
        x: num(a.x),
        y: num(a.y),
        z: num(a.z)
    };
}

function materializeRotateBinding(binding) {
    if (!binding || binding.type !== "deferred_wrapper") return binding;
    const sourceIds = normalizeOffsetTargetIds(Array.isArray(binding.sourceIds) ? binding.sourceIds : []);
    if (!sourceIds.length) return null;
    const axis = normalizeAxisForRotate(binding.axis || U.v(0, 1, 0));
    const rotateNode = makeNode("rotate_as_axis", {
        params: {
            deg: 0,
            degUnit: "deg",
            useCustomAxis: true,
            ax: axis.x,
            ay: axis.y,
            az: axis.z
        }
    });

    const rows = [];
    for (const id of sourceIds) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node || !Array.isArray(ctx.parentList)) return null;
        rows.push({ id, ctx });
    }
    const firstList = rows[0].ctx.parentList;
    for (const row of rows) {
        if (row.ctx.parentList !== firstList) return null;
    }
    const orderedRows = rows.slice().sort((a, b) => a.ctx.index - b.ctx.index);

    if (binding.localRotate) {
        const anchor = normalizeLocalRotateAnchor(binding.anchor);
        const inner = makeNode("add_builder", {
            params: { ox: -anchor.x, oy: -anchor.y, oz: -anchor.z }
        });
        inner.children = orderedRows.map((row) => row.ctx.node);

        const parentNode = orderedRows[0].ctx.parentNode || null;
        const canReuseParentGroup = !!(
            parentNode &&
            parentNode.kind === "add_builder" &&
            Array.isArray(parentNode.children) &&
            parentNode.children === firstList &&
            orderedRows.length === firstList.length &&
            orderedRows.every((row, index) => row.ctx.index === index)
        );

        if (canReuseParentGroup) {
            const p = parentNode.params || (parentNode.params = {});
            p.ox = num(p.ox) + anchor.x;
            p.oy = num(p.oy) + anchor.y;
            p.oz = num(p.oz) + anchor.z;
            parentNode.children = [inner, rotateNode];
            binding.wrapperId = parentNode.id;
            binding.innerWrapperId = inner.id;
        } else {
            const outer = makeNode("add_builder", {
                params: { ox: anchor.x, oy: anchor.y, oz: anchor.z }
            });
            outer.children = [inner, rotateNode];
            const removeRows = orderedRows.slice().sort((a, b) => b.ctx.index - a.ctx.index);
            for (const row of removeRows) {
                firstList.splice(row.ctx.index, 1);
            }
            firstList.splice(orderedRows[0].ctx.index, 0, outer);
            binding.wrapperId = outer.id;
            binding.innerWrapperId = inner.id;
        }
    } else {
        const wrapper = makeNode("add_builder", { params: { ox: 0, oy: 0, oz: 0 } });
        wrapper.children = orderedRows.map((row) => row.ctx.node);
        const removeRows = orderedRows.slice().sort((a, b) => b.ctx.index - a.ctx.index);
        for (const row of removeRows) {
            firstList.splice(row.ctx.index, 1);
        }
        wrapper.children.push(rotateNode);
        firstList.splice(orderedRows[0].ctx.index, 0, wrapper);
        binding.wrapperId = wrapper.id;
    }
    binding.type = "param";
    binding.nodeId = rotateNode.id;
    binding.valueKey = "deg";
    binding.unitKey = "degUnit";
    binding.enableKey = null;
    binding.valueScale = 1;
    renderAll();
    return binding;
}

function willRotateBindingChange(binding, nextDeg) {
    if (!binding || !Number.isFinite(nextDeg)) return false;
    if (binding.type === "deferred_wrapper") {
        return Math.abs((Number.isFinite(binding.initialDeg) ? binding.initialDeg : 0) - nextDeg) > 1e-9;
    }
    const ctx = binding.nodeId ? findNodeContextById(binding.nodeId) : null;
    if (!ctx || !ctx.node) return false;
    const p = ctx.node.params || {};
    if (binding.enableKey && !p[binding.enableKey]) return true;
    if (normalizeAngleUnitForRotate(p[binding.unitKey]) !== "deg") return true;
    return Math.abs(readRotateBindingDeg(binding) - nextDeg) > 1e-9;
}

function getActiveRotateBindings() {
    const out = [];
    for (const binding of (Array.isArray(rotateBindings) ? rotateBindings : [])) {
        if (!binding) continue;
        if (binding.type === "deferred_wrapper") {
            const sourceIds = normalizeOffsetTargetIds(Array.isArray(binding.sourceIds) ? binding.sourceIds : []);
            if (!sourceIds.length) continue;
            binding.sourceIds = sourceIds;
            out.push(binding);
            continue;
        }
        if (!binding.nodeId) continue;
        const ctx = findNodeContextById(binding.nodeId);
        if (!ctx || !ctx.node) continue;
        out.push(binding);
    }
    return out;
}

function addRotateForTargetIds(ids) {
    const validBase = normalizeActionTargetIds(ids);
    const valid = normalizeOffsetTargetIds(validBase);
    if (!valid.length) return;
    const usableRows = [];
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) continue;
        const center = getNodeSegmentCenter(id);
        if (!center) continue;
        usableRows.push({ id, ctx });
    }
    if (!usableRows.length) {
        showToast("所选卡片没有可旋转的点", "error");
        return;
    }
    const usable = usableRows.map((r) => r.id);

    if (usableRows.every((row) => row.ctx.node.kind === BUILDER_REFERENCE_KIND)) {
        const bindings = usableRows.map(resolveBuiltinRotateBindingForRow).filter(Boolean);
        const centerSeed = averageSegmentCenterForNodeIds(usable);
        const axisSeed = normalizeAxisForRotate(bindings[0]?.axis || U.v(0, 1, 0));
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds(usable, { replace: true, focus: false, syncWithParamSync: false });
        }
        focusCardById(usable[0], false, false, true);
        startRotateMode([], {
            bindings,
            sourceIds: usable,
            center: centerSeed,
            axis: axisSeed,
            initialDeg: readRotateBindingDeg(bindings[0])
        });
        return;
    }

    const reusable = resolveReusableTailRotateForRows(usableRows);
    if (reusable && reusable.rotateId) {
        const sourceIds = Array.isArray(reusable.sourceIds) && reusable.sourceIds.length ? reusable.sourceIds : usable;
        const centerSeed = averageSegmentCenterForNodeIds(sourceIds) || averageSegmentCenterForNodeIds(usable);
        const axisSeed = resolveAxisFromRotateNodeId(reusable.rotateId, sourceIds[0] || usable[0]);
        const binding = makeRotateParamBinding(reusable.rotateId, { sourceIds });
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds(sourceIds, { replace: true, focus: false, syncWithParamSync: false });
        }
        focusCardById(sourceIds[0], false, false, true);
        startRotateMode([], { bindings: [binding], sourceIds, center: centerSeed, axis: axisSeed });
        return;
    }

    if (usable.length > 1) {
        const firstList = usableRows[0].ctx.parentList;
        if (!Array.isArray(firstList)) {
            showToast("多选旋转失败：目标列表无效", "error");
            return;
        }
        for (const row of usableRows) {
            if (row.ctx.parentList !== firstList) {
                showToast("多选旋转仅支持同一层级卡片", "error");
                return;
            }
        }

        const orderedRows = usableRows.slice().sort((a, b) => a.ctx.index - b.ctx.index);
        const orderedIds = orderedRows.map((r) => r.id);
        const centerSeed = averageSegmentCenterForNodeIds(orderedIds);
        const axisSeed = normalizeAxisForRotate(resolveAxisForNodeId(orderedIds[0]));
        const binding = {
            type: "deferred_wrapper",
            sourceIds: orderedIds,
            axis: axisSeed,
            initialDeg: 0
        };

        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds(orderedIds, { replace: true, focus: false, syncWithParamSync: false });
        }
        focusCardById(orderedIds[0], false, false, true);
        startRotateMode([], { bindings: [binding], sourceIds: orderedIds, center: centerSeed, axis: axisSeed, initialDeg: 0 });
        return;
    }

    const row = usableRows[0];
    const centerSeed = averageSegmentCenterForNodeIds([row.id]);
    const builtinBinding = resolveBuiltinRotateBindingForRow(row);
    const axisSeed = normalizeAxisForRotate(builtinBinding?.axis || resolveAxisForNodeId(row.id));

    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds([row.id], { replace: true, focus: false, syncWithParamSync: false });
    }
    focusCardById(row.id, false, false, true);
    if (builtinBinding) {
        startRotateMode([], {
            bindings: [builtinBinding],
            sourceIds: [row.id],
            center: centerSeed,
            axis: axisSeed,
            initialDeg: readRotateBindingDeg(builtinBinding)
        });
        return;
    }
    const binding = {
        type: "deferred_wrapper",
        sourceIds: [row.id],
        axis: axisSeed,
        initialDeg: 0
    };
    startRotateMode([], { bindings: [binding], sourceIds: [row.id], center: centerSeed, axis: axisSeed, initialDeg: 0 });
}

function prepareLocalRotateTargets(ids, opts = {}) {
    const validBase = normalizeActionTargetIds(ids);
    const valid = normalizeOffsetTargetIds(validBase);
    if (!valid.length) {
        if (!opts.silent) showToast("请先选择要本地旋转的卡片", "error");
        return null;
    }

    const usableRows = [];
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node || !Array.isArray(ctx.parentList)) continue;
        const center = getNodeSegmentCenter(id);
        if (!center) continue;
        usableRows.push({ id, ctx });
    }
    if (!usableRows.length) {
        if (!opts.silent) showToast("所选卡片没有可旋转的点", "error");
        return null;
    }

    const firstList = usableRows[0].ctx.parentList;
    if (!Array.isArray(firstList)) {
        if (!opts.silent) showToast("本地旋转失败：目标列表无效", "error");
        return null;
    }
    for (const row of usableRows) {
        if (row.ctx.parentList !== firstList) {
            if (!opts.silent) showToast("本地旋转不能选择两个不同组内的卡片", "error");
            return null;
        }
    }

    const orderedRows = usableRows.slice().sort((a, b) => a.ctx.index - b.ctx.index);
    const orderedIds = orderedRows.map((r) => r.id);
    return {
        rows: orderedRows,
        ids: orderedIds,
        firstList,
        parentNode: orderedRows[0].ctx.parentNode || null,
        insertIndex: orderedRows[0].ctx.index
    };
}

function startLocalRotateForTargetIds(ids) {
    const prepared = prepareLocalRotateTargets(ids);
    if (!prepared) return false;

    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(prepared.ids, { replace: true, focus: false, syncWithParamSync: false });
    }
    focusCardById(prepared.ids[0], false, false, true);

    const onPickAnchor = (anchorWorld) => {
        const latest = prepareLocalRotateTargets(prepared.ids);
        if (!latest) return;
        const worldAnchor = {
            x: num(anchorWorld?.x),
            y: num(anchorWorld?.y),
            z: num(anchorWorld?.z)
        };
        const localAnchor = mapWorldPointToInsertLocalPoint(
            worldAnchor,
            latest.firstList,
            latest.insertIndex,
            latest.parentNode || null
        ) || worldAnchor;
        const axisSeed = normalizeAxisForRotate(resolveAxisForNodeId(latest.ids[0]));
        const binding = {
            type: "deferred_wrapper",
            sourceIds: latest.ids,
            axis: axisSeed,
            initialDeg: 0,
            localRotate: true,
            anchor: localAnchor
        };
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds(latest.ids, { replace: true, focus: false, syncWithParamSync: false });
        }
        focusCardById(latest.ids[0], false, false, true);
        startRotateMode([], {
            bindings: [binding],
            sourceIds: latest.ids,
            center: worldAnchor,
            axis: axisSeed,
            initialDeg: 0
        });
    };
    onPickAnchor.__localRotateAnchor = true;

    const ok = startPointPick({
        label: "本地旋转锚点",
        onPick: onPickAnchor
    });
    if (ok) showToast("请选择本地旋转锚点", "info");
    return !!ok;
}

function deleteTargetIds(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return;
    if (valid.length > 1) {
        if (typeof setCardSelectionIds === "function") {
            setCardSelectionIds(valid, { replace: true, focus: false, syncWithParamSync: false });
        }
        setFocusedNode(valid[0], false);
        deleteSelectedCards();
        return;
    }
    setFocusedNode(valid[0], false);
    deleteFocusedCard();
}

function quickSyncTargetIds(ids, anchor = {}) {
    const valid = normalizeActionTargetIds(ids);
    if (valid.length < 1) return false;
    if (!areActionTargetsSameKind(valid)) {
        showToast("仅同类型目标支持修改参数", "error");
        return false;
    }
    if (typeof renderParamsEditors !== "function") {
        showToast("参数编辑器不可用", "error");
        return false;
    }

    const nodes = [];
    for (const id of valid) {
        const ctx = findNodeContextById(id);
        if (!ctx || !ctx.node) continue;
        nodes.push(ctx.node);
    }
    if (nodes.length < 1) return false;

    hideActionMenu();
    const panel = ensureQuickSyncPanelEl();
    if (!panel || !quickSyncEditorHostEl || !quickSyncTitleEl || !quickSyncHintEl) return false;
    quickSyncEditorHostEl.innerHTML = "";

    const source = nodes[0];
    const sourceName = (KIND && KIND[source.kind] && KIND[source.kind].title) ? KIND[source.kind].title : source.kind;
    const model = {
        id: source.id,
        kind: source.kind,
        params: clonePlain(source.params || {})
    };
    quickSyncTitleEl.textContent = `修改参数：${sourceName}`;
    quickSyncHintEl.textContent = `此修改会同步选中的${nodes.length}个项目`;
    quickSyncState = {
        ids: valid.slice(),
        model,
        snapshot: clonePlain(model.params || {})
    };

    const renderInlineEditor = () => {
        if (!quickSyncState || quickSyncState.model !== model) return;
        quickSyncEditorHostEl.innerHTML = "";
        renderParamsEditors(quickSyncEditorHostEl, model, "修改参数", { paramsOnly: true });
        applyParamStepToInputs();
    };

    const applyInlineSync = (opts = {}) => {
        if (!quickSyncState || quickSyncState.model !== model) return;
        const current = clonePlain(model.params || {});
        const diff = diffPlain(quickSyncState.snapshot, current);
        const rerenderInlineEditor = () => {
            if (!quickSyncState || quickSyncState.model !== model) return;
            renderInlineEditor();
        };
        if (!diff.length) {
            if (opts.rerender) {
                rerenderInlineEditor();
            }
            return;
        }
        if (!quickSyncHistoryLockTimer) {
            historyCapture("quick_sync_inline");
            quickSyncHistoryLockTimer = setTimeout(() => {
                quickSyncHistoryLockTimer = 0;
            }, 180);
        }
        let changed = false;
        for (const id of quickSyncState.ids) {
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node) continue;
            if (!ctx.node.params) ctx.node.params = {};
            applyPlainDiff(ctx.node.params, diff);
            changed = true;
        }
        quickSyncState.snapshot = current;
        if (changed) {
            rebuildPreviewAndKotlin();
            if (opts.rerender) {
                if (quickSyncCardsRenderTimer) {
                    cancelAnimationFrame(quickSyncCardsRenderTimer);
                    quickSyncCardsRenderTimer = 0;
                }
                renderAll();
            } else {
                scheduleQuickSyncCardsRender();
            }
        }
        if (opts.rerender) {
            rerenderInlineEditor();
        }
    };

    const onInlineInput = () => {
        applyInlineSync();
    };
    const onInlineChange = (ev) => {
        const t = ev && ev.target;
        const tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
        const type = t && t.type ? String(t.type).toLowerCase() : "";
        const needRerender = (tag === "SELECT") || (tag === "INPUT" && (type === "checkbox" || type === "radio"));
        applyInlineSync({ rerender: needRerender });
    };

    if (quickSyncEditorHostEl.__pbQuickSyncInputHandler) {
        quickSyncEditorHostEl.removeEventListener("input", quickSyncEditorHostEl.__pbQuickSyncInputHandler);
    }
    if (quickSyncEditorHostEl.__pbQuickSyncChangeHandler) {
        quickSyncEditorHostEl.removeEventListener("change", quickSyncEditorHostEl.__pbQuickSyncChangeHandler);
    }
    quickSyncEditorHostEl.__pbQuickSyncInputHandler = onInlineInput;
    quickSyncEditorHostEl.__pbQuickSyncChangeHandler = onInlineChange;
    quickSyncEditorHostEl.addEventListener("input", onInlineInput);
    quickSyncEditorHostEl.addEventListener("change", onInlineChange);
    renderInlineEditor();

    const ax = Number.isFinite(anchor.x) ? anchor.x : 0;
    const ay = Number.isFinite(anchor.y) ? anchor.y : 0;
    panel.classList.remove("hidden");
    positionFloatingPanel(panel, ax + 14, ay);
    return true;
}

function openQuickSyncTargetIdsAt(ids, clientX, clientY) {
    return quickSyncTargetIds(ids, { x: clientX, y: clientY });
}

function openDockedParamEditorForIds(ids) {
    const valid = normalizeActionTargetIds(ids);
    if (!valid.length) return false;
    if (typeof setCardSelectionIds === "function") {
        setCardSelectionIds(valid, { replace: true, focus: false, syncWithParamSync: false });
    }
    focusCardById(valid[0], false, false, true);
    if (typeof setKotlinHidden === "function" && typeof isKotlinHidden === "function" && isKotlinHidden()) {
        setKotlinHidden(false);
    }
    setRightPanelPage("params");
    scheduleParamEditorRender();
    return true;
}

function addShortcutKindInContext(kind, contextFactory) {
    const ctx = (typeof contextFactory === "function") ? contextFactory() : contextFactory;
    if (!ctx || !Array.isArray(ctx.list)) return;
    if (typeof addKindInContext === "function") {
        addKindInContext(kind, ctx);
    }
}

function openActionMenuForBlankNoSelection(ev) {
    if (!ev || !isActionMenuAllowed()) {
        hideActionMenu();
        hideQuickSyncPanel();
        return false;
    }
    const getBlankInsertContext = () => {
        if (typeof getCurrentCardScopeContext === "function") {
            const scopeCtx = getCurrentCardScopeContext();
            if (scopeCtx && Array.isArray(scopeCtx.list)) {
                return {
                    list: scopeCtx.list,
                    insertIndex: scopeCtx.list.length,
                    label: scopeCtx.label || (scopeCtx.ownerNode ? "子Builder" : "主Builder"),
                    ownerNode: scopeCtx.ownerNode || null
                };
            }
        }
        return getInsertContextFromFocus();
    };
    hideQuickSyncPanel();
    const items = [
        {
            label: "添加组",
            children: [
                {
                    label: "普通组",
                    onSelect: () => addShortcutKindInContext("add_builder", getBlankInsertContext)
                },
                {
                    label: "遮罩组",
                    onSelect: () => addShortcutKindInContext("clear_as_mask", getBlankInsertContext)
                }
            ]
        },
        {
            label: "组效果",
            children: [
                {
                    label: "旋转嵌套组",
                    onSelect: () => addShortcutKindInContext("add_with", getBlankInsertContext)
                },
                {
                    label: "环形放置",
                    onSelect: () => addShortcutKindInContext("effect_ring", getBlankInsertContext)
                }
            ]
        },
        {
            label: "添加圆遮罩",
            onSelect: () => addShortcutKindInContext("clear_as_round_xz_mask", getBlankInsertContext)
        },
        {
            label: "添加球遮罩",
            onSelect: () => addShortcutKindInContext("clear_as_ball_mask", getBlankInsertContext)
        },
        {
            label: "添加卡片",
            onSelect: () => {
                const ctx = getBlankInsertContext();
                const ownerNodeId = (ctx && ctx.ownerNode && isBuilderContainerKind(ctx.ownerNode.kind)) ? ctx.ownerNode.id : null;
                openModal(ctx.list, ctx.insertIndex, ctx.label, ownerNodeId);
            }
        },
        {
            label: "绘制直线",
            onSelect: () => {
                if (linePickMode) stopLinePick();
                if (pointPickMode) stopPointPick();
                const ctx = getBlankInsertContext();
                startLinePick(ctx.list, ctx.label, ctx.insertIndex);
            }
        },
        {
            label: "绘制三角形",
            onSelect: () => {
                if (linePickMode) stopLinePick();
                if (pointPickMode) stopPointPick();
                const ctx = getBlankInsertContext();
                startTrianglePick(ctx.list, ctx.label, ctx.insertIndex);
            }
        },
        {
            label: "添加全局偏移",
            onSelect: () => addQuickOffsetTo(state.root.children)
        },
        {
            label: "保存为预设",
            onSelect: () => {
                presetSaveSourceChildren = null;
                presetSaveSourceLabel = "全部卡片";
                openPresetPanel("save");
            }
        },
    ];
    return showActionMenu(ev.clientX, ev.clientY, items);
}

    function openActionMenuForTargets(ev, targetIds, options = {}) {
        if (!ev || !isActionMenuAllowed()) {
            hideActionMenu();
            hideQuickSyncPanel();
            return false;
    }
    const ids = normalizeActionTargetIds(targetIds);
    if (!ids.length) {
        hideActionMenu();
        hideQuickSyncPanel();
        return false;
    }
    hideQuickSyncPanel();
    const allowQuickSync = !!options.allowQuickSync;
    const sameKind = areActionTargetsSameKind(ids);
    const items = [];
    let singleCtxNode = null;
    if (ids.length === 1) {
        singleCtxNode = findNodeContextById(ids[0]);
    }
    const isInstanceEdit = isBuilderSnapshotEditNode(singleCtxNode?.node);
    if (isInstanceEdit) {
        items.push({
            label: "完成实例原型编辑",
            onSelect: () => completeBuilderSnapshotEdit(singleCtxNode.node)
        });
    }
    const isEffectRing = singleCtxNode?.node?.kind === EFFECT_RING_KIND;
    if (isEffectRing) {
        items.push({
            label: "转换为普通组",
            onSelect: () => convertSingleGroupNode(singleCtxNode.node, "add_builder", { expanded: true })
        });
    }
    const isSingleGroup = !!(singleCtxNode && singleCtxNode.node
        && (isBuilderContainerKind(singleCtxNode.node.kind) || singleCtxNode.node.kind === BUILDER_REFERENCE_KIND));
    const groupEntry = isInstanceEdit || isEffectRing ? null : buildGroupActionMenuEntry(ids, {
        mode: isSingleGroup ? "convert" : "create",
        sourceNode: isSingleGroup ? singleCtxNode.node : null,
        sourceKind: isSingleGroup ? singleCtxNode.node.kind : null
    });
    if (groupEntry && Array.isArray(groupEntry.children) && groupEntry.children.length) items.push(groupEntry);
    if (ids.length === 1 && typeof beginRenameNode === "function") {
        items.push({
            label: "重命名",
            onSelect: () => beginRenameNode(ids[0])
        });
    }
    items.push({
        label: "保存为预设",
        onSelect: () => openPresetPanel("save", { sourceIds: ids })
    });
    if (ids.length === 1) {
        const ctxNode = singleCtxNode || findNodeContextById(ids[0]);
        if (ctxNode && Array.isArray(ctxNode.parentList)) {
            const label = ctxNode.parentNode ? "子Builder" : "主Builder";
            if (ctxNode.node && isBuilderContainerKind(ctxNode.node.kind) && typeof navigateCardScope === "function") {
                items.push({
                    label: "进入组",
                    onSelect: () => navigateCardScope(ctxNode.node.id)
                });
            }
            items.push({
                label: "向上插入卡片",
                onSelect: () => openModal(ctxNode.parentList, ctxNode.index, label)
            });
            items.push({
                label: "向下插入卡片",
                onSelect: () => openModal(ctxNode.parentList, ctxNode.index + 1, label)
            });
            items.push({
                label: "添加圆遮罩",
                onSelect: () => addShortcutKindInContext("clear_as_round_xz_mask", () => ({
                    list: ctxNode.parentList,
                    insertIndex: ctxNode.index + 1,
                    label,
                    ownerNode: null
                }))
            });
            items.push({
                label: "添加球遮罩",
                onSelect: () => addShortcutKindInContext("clear_as_ball_mask", () => ({
                    list: ctxNode.parentList,
                    insertIndex: ctxNode.index + 1,
                    label,
                    ownerNode: null
                }))
            });
        }
    }
    if (allowQuickSync && sameKind && ids.length >= 1) {
        items.push({
            label: "修改参数",
            onSelect: () => openDockedParamEditorForIds(ids)
        });
    }
    items.push({
        label: "移动",
        onSelect: () => startMoveForTargetIds(ids)
    });
    items.push({
        label: "添加旋转",
        onSelect: () => addRotateForTargetIds(ids)
    });
    items.push({
        label: "本地旋转",
        onSelect: () => startLocalRotateForTargetIds(ids)
    });
    items.push({
        label: "删除",
        danger: true,
        onSelect: () => deleteTargetIds(ids)
    });
    return showActionMenu(ev.clientX, ev.clientY, items);
}

function onCanvasContextMenu(ev) {
    ev.preventDefault();
    if (previewDistanceTool?.isActive()) {
        previewDistanceTool.cancel?.();
        hideActionMenu();
        hideQuickSyncPanel();
        return;
    }
    if (shouldSuppressActionMenuByGesture(ev)) {
        hideActionMenu();
        return;
    }
    if (!isActionMenuAllowed()) {
        hideActionMenu();
        return;
    }
    let targetIds = [];
    const pointHit = pickSelectablePointHitFromEvent(ev);
    if (pointHit && pointHit.ownerId) {
        const ownerId = pointHit.ownerId;
        if (ownerId) {
            targetIds = getActionTargetIds(ownerId);
            if (!targetIds.length) targetIds = [ownerId];
            if (typeof setCardSelectionIds === "function") {
                setCardSelectionIds(targetIds, { replace: true, focus: false, syncWithParamSync: false });
            }
            focusCardById(ownerId, false, false, true);
        }
    }
    if (!targetIds.length) {
        const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedCount = selectedSet ? selectedSet.size : 0;
        if (selectedCount === 0 && openActionMenuForBlankNoSelection(ev)) return;
        targetIds = getActionTargetIds();
    }
    openActionMenuForTargets(ev, targetIds, { allowQuickSync: true });
    }

    function onCardsContextMenu(ev) {
        if (!ev) return;
        ev.preventDefault();
    if (shouldSuppressActionMenuByGesture(ev)) {
        hideActionMenu();
        return;
    }
    const target = ev && ev.target;
    const card = target && target.closest ? target.closest(".card[data-id]") : null;
    if (!card || !elCardsRoot || !elCardsRoot.contains(card)) {
        if (openActionMenuForBlankNoSelection(ev)) return;
        const ids = getActionTargetIds();
        openActionMenuForTargets(ev, ids, { allowQuickSync: true });
        return;
    }
    if (!isActionMenuAllowed()) {
        hideActionMenu();
        return;
    }
    const id = card.dataset.id;
    if (!id) return;
    const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
    const selectedIds = normalizeActionTargetIds(selectedSet ? Array.from(selectedSet) : []);
    const useSelectedGroup = selectedIds.length > 1 && selectedIds.includes(id);
    const targetIds = useSelectedGroup ? selectedIds : [id];
    if (!useSelectedGroup && typeof setCardSelectionIds === "function") {
        setCardSelectionIds(targetIds, { replace: true, focus: false, syncWithParamSync: false });
    }
    focusCardById(id, false, false, false);
    openActionMenuForTargets(ev, targetIds, { allowQuickSync: true });
}

function onCanvasClick(ev) {
    // ✅ 直线拾取用 pointerdown 处理，但浏览器仍会在 pointerup 后补一个 click。
    // 如果不屏蔽，这个 click 会走到下面的“点到空白处清空焦点”，导致聚焦丢失。
    if (shouldSuppressCanvasClick(ev)) return;
    if (previewDistanceTool?.isActive()) return;
    hideActionMenu();
    hideQuickSyncPanel();

    // 拾取/旋转模式中由 onPointerDown 处理；此处不抢逻辑
    if (linePickMode || pointPickMode || rotateMode || bezierCreateState) return;

    blurActiveElementForCanvas();

    if (offsetMode) {
        const mapped = getMappedPointFromEvent(ev);
        if (mapped) applyOffsetAtPoint(mapped);
        return;
    }

    const pointHit = pickSelectablePointHitFromEvent(ev);
    if (pointHit && pointHit.ownerId) {
        const ownerId = pointHit.ownerId;
        if (ownerId) {
            const additive = !!(ev && (ev.ctrlKey || ev.shiftKey));
            const selectionIds = buildPreviewSelectionIds([ownerId], additive);
            if (typeof setCardSelectionIds === "function") {
                setCardSelectionIds(selectionIds, {
                    replace: !additive,
                    focus: false,
                    reveal: false,
                    syncWithParamSync: false
                });
            }
            const ctx = findNodeContextById(ownerId);
            if (paramSync && paramSync.open && ctx && ctx.node) {
                toggleSyncTarget(ctx.node);
            }
            focusCardById(ownerId, true, true, false);
            return;
        }
    }

    // 点到空白处不再自动取消粒子聚焦，避免曲柄/粒子难点中时直接失焦。
}

function onCanvasDblClick(ev) {
    // 已移除“双击左键进入快捷移动”。
    hideActionMenu();
}

    function animate() {
        requestAnimationFrame(animate);
        applyArrowPan();
        updateAxisLabelScale();
        controls.update();
        if (adaptiveGrid) adaptiveGrid.update();
        referenceGuideController?.update?.();
        gridInspector?.update?.();
        if ((lockPlaneActive && lockPlaneBasePoint)
            || (offsetMode && offsetConstraintVector && offsetRefPoint)
            || (transformConstraintOperation && transformConstraintVector && transformConstraintOrigin)) {
            updateLockPlaneGuideVisual();
        }
        updateMirrorPlaneHint();
        renderer.render(scene, camera);
    }

    // -------------------------
    // line pick / point pick
    // -------------------------
    function setLinePickStatus(text) {
        statusLinePick.textContent = text;
        statusLinePick.classList.remove("hidden");
    }

    function hideLinePickStatus() {
        statusLinePick.classList.add("hidden");
    }

    function setPointPickStatus(text) {
        setLinePickStatus(text);
    }

    function isTrianglePickType() {
        return linePickType === "triangle";
    }

    function isDottedLinePickType() {
        return linePickType === "dotted_line";
    }

    function buildLinePickProgressStatus(infoLabel) {
        const label = infoLabel || getPlaneInfo().label;
        const targetLabel = linePickTargetLabel || "主Builder";
        if (isTrianglePickType()) {
            if (!picked || picked.length <= 0) {
                return `${label} 三角拾取[${targetLabel}]：请点第 1 点`;
            }
            if (picked.length === 1) {
                const a = picked[0];
                return `${label} 三角拾取[${targetLabel}]：已选第 1 点：(${U.fmt(a.x)}, ${U.fmt(a.y)}, ${U.fmt(a.z)})，再点第 2 点`;
            }
            if (picked.length === 2) {
                const b = picked[1];
                return `${label} 三角拾取[${targetLabel}]：已选第 2 点：(${U.fmt(b.x)}, ${U.fmt(b.y)}, ${U.fmt(b.z)})，再点第 3 点`;
            }
            return `${label} 三角拾取[${targetLabel}]：请点第 1 点`;
        }
        if (isDottedLinePickType()) {
            if (!picked || picked.length <= 0) {
                return `${label} 虚线拾取[${targetLabel}]：请点第 1 点`;
            }
            const a = picked[0];
            return `${label} 虚线拾取[${targetLabel}]：已选第 1 点：(${U.fmt(a.x)}, ${U.fmt(a.y)}, ${U.fmt(a.z)})，再点第 2 点`;
        }
        if (!picked || picked.length <= 0) {
            return `${label} 拾取模式[${targetLabel}]：请点第 1 点`;
        }
        const a = picked[0];
        return `${label} 拾取模式[${targetLabel}]：已选第 1 点：(${U.fmt(a.x)}, ${U.fmt(a.y)}, ${U.fmt(a.z)})，再点第 2 点`;
    }

    function formatRotateAxisForStatus(axis) {
        if (!axis) return "(0, 1, 0)";
        return `(${U.fmt(axis.x)}, ${U.fmt(axis.y)}, ${U.fmt(axis.z)})`;
    }

    function buildRotateStatusText() {
        const info = getPlaneInfo().label;
        const axisText = formatRotateAxisForStatus(rotateAxis);
        const groupTip = (Array.isArray(rotateSourceIds) && rotateSourceIds.length > 1) ? `（${rotateSourceIds.length}项）` : "";
        const manualTip = rotateManualInput ? `，输入中：${rotateManualInput}` : "";
        const modeText = (Array.isArray(rotateBindings) && rotateBindings.some((binding) => binding && binding.localRotate))
            ? "本地旋转模式"
            : "旋转模式";
        return `${info} ${modeText}${groupTip}：当前 ${U.fmt(rotateCurrentDeg)}°，轴 ${axisText}${manualTip}；长按左键拖动，按住 Shift 吸附 ${U.fmt(rotateSnapDeg)}°，或输入数值后 Enter 确认`;
    }

    function refreshRotateStatus() {
        if (!rotateMode) return;
        setLinePickStatus(buildRotateStatusText());
    }

    function pointPickTargetLabel(target) {
        if (!target) return "";
        const raw = String(target.label || "").trim();
        if (raw) return raw;
        const kx = target.keys && target.keys.x ? String(target.keys.x) : "";
        if (!kx) return "point";
        if (kx === "sx") return "start";
        if (kx === "ex") return "end";
        if (kx === "shx") return "startHandle";
        if (kx === "ehx") return "endHandle";
        if (kx === "ox") return "origin";
        if (kx === "tox") return "to";
        if (kx === "cx") return "center";
        if (kx === "x") return "point";
        const base = kx.replace(/x$/, "");
        if (/^p\d+$/i.test(base) || /^h\d+$/i.test(base)) return base.toUpperCase();
        return base || "point";
    }

    function buildPointPickStatus() {
        const info = getPlaneInfo().label;
        const axisHint = transformConstraintVector ? `，当前约束 ${transformConstraintLabel()}` : "，X/Y/Z 单击约束轴";
        if (typeof pointPickCallback === "function") {
            const label = String(pointPickCallbackLabel || "预设原点").trim() || "预设原点";
            if (pointPickCallback.__localRotateAnchor) {
                return `${info} 点拾取[${label}]：左键确定锚点，右键取消${axisHint}`;
            }
            const rotateHint = pointPickCallbackRotate ? "，确认后自动进入旋转" : "，按旋转快捷键可在确认后旋转";
            return `${info} 点拾取[${label}]：左键确定，右键取消${rotateHint}${axisHint}`;
        }
        const label = pointPickTargetLabel(pointPickTarget);
        if (label) return `${info} 点拾取[${label}]：左键确定，右键取消${axisHint}`;
        return `${info} 点拾取：请先选择目标坐标组，再左键确定，右键取消${axisHint}`;
    }

    function refreshPointPickStatus() {
        if (!pointPickMode) return;
        setPointPickStatus(buildPointPickStatus());
    }

    function setPointPickTarget(target) {
        pointPickTarget = target || null;
        if (pointPickTarget) activeVecTarget = pointPickTarget;
        if (transformConstraintOperation === "point_pick" && pointPickTarget && !transformConstraintOrigin) {
            const nodeId = resolvePointPickTargetNodeId(pointPickTarget);
            transformConstraintNodeId = nodeId || null;
            const local = pointPickTarget.obj && pointPickTarget.keys
                ? {x: num(pointPickTarget.obj[pointPickTarget.keys.x]), y: num(pointPickTarget.obj[pointPickTarget.keys.y]), z: num(pointPickTarget.obj[pointPickTarget.keys.z])}
                : null;
            const path = nodeId ? findNodePathById(nodeId) : null;
            const worlds = local && Array.isArray(path) ? mapLocalPointToWorldPoints(local, path) : null;
            transformConstraintOrigin = worlds?.[0] || local || null;
            if (transformConstraintSpace === "local" && transformConstraintAxis) {
                transformConstraintVector = resolveTransformLocalAxis(transformConstraintAxis, nodeId);
            }
            updateLockPlaneGuideVisual();
        }
        if (pointPickMode && pointPickTarget && pointPickHoverPoint) queuePointPickPreview(pointPickHoverPoint);
        else if (!pointPickTarget) hidePointPickPreview();
        refreshPointPickStatus();
    }

    function startPointPickForVecTarget(target) {
        if (!target || !target.obj || !target.keys) return false;
        setPointPickTarget(target);
        activeVecTarget = target;
        return startPointPick({ target });
    }

    function setPointPickCallbackRotate(enabled) {
        pointPickCallbackRotate = !!enabled;
        if (pointPickMode && typeof pointPickCallback === "function") refreshPointPickStatus();
        return pointPickCallbackRotate;
    }

    function togglePointPickCallbackRotate() {
        if (!pointPickMode || typeof pointPickCallback !== "function") return false;
        pointPickCallbackRotate = !pointPickCallbackRotate;
        refreshPointPickStatus();
        showToast(pointPickCallbackRotate ? "预设确认后将自动旋转" : "预设确认后不自动旋转", "info");
        return true;
    }

    function collectVecTargetsFromRoot(rootEl) {
        if (!rootEl || !rootEl.querySelectorAll) return [];
        const out = [];
        const seen = new Set();
        rootEl.querySelectorAll("input").forEach((el) => {
            const t = el && el.__vecTarget;
            if (!t || !t.obj || !t.keys) return;
            const k = t.keys || {};
            if (!k.x || !k.y || !k.z) return;
            if (seen.has(t)) return;
            seen.add(t);
            out.push(t);
        });
        return out;
    }

    function collectQuickSyncVecTargets() {
        if (!quickSyncPanelEl || quickSyncPanelEl.classList.contains("hidden")) return [];
        return collectVecTargetsFromRoot(quickSyncEditorHostEl);
    }

    function collectCardVecTargets(nodeId) {
        if (!nodeId || !elCardsRoot) return [];
        const card = elCardsRoot.querySelector(`.card[data-id="${nodeId}"]`);
        if (!card) return [];
        return collectVecTargetsFromRoot(card);
    }

    function fallbackPointLabelByPrefix(prefix, kind = "") {
        const p = String(prefix || "");
        if (!p) return (kind === "axis" ? "axis" : "point");
        if (/^p\d+$/i.test(p) || /^h\d+$/i.test(p)) return p.toUpperCase();
        if (p === "s") return "start";
        if (p === "e") return "end";
        if (p === "sh") return "startHandle";
        if (p === "eh") return "endHandle";
        if (p === "o") return "origin";
        if (p === "to") return "to";
        if (p === "c") return "center";
        if (p === "off" || p === "ro") return "offset";
        if (p === "axis") return "axis";
        if (p === "rotAxis") return "rotateAxis";
        return p;
    }

function collectSyntheticVecTargetsForNode(node) {
    const p = node && node.params;
    if (!p || typeof p !== "object") return [];
        const byPrefix = new Map();
        for (const key of Object.keys(p)) {
            const m = String(key).match(/^(.*?)([xyz])$/);
            if (!m) continue;
            const prefix = m[1] || "";
            const axis = m[2];
            if (!byPrefix.has(prefix)) byPrefix.set(prefix, {});
            byPrefix.get(prefix)[axis] = key;
        }
        const keys = Array.from(byPrefix.keys()).sort();
        const out = [];
        for (const prefix of keys) {
            const g = byPrefix.get(prefix) || {};
            if (!g.x || !g.y || !g.z) continue;
        out.push({
            obj: p,
            keys: { x: g.x, y: g.y, z: g.z },
            inputs: null,
            label: fallbackPointLabelByPrefix(prefix, node.kind),
            onChange: () => renderAll(),
            nodeId: node.id || null
        });
    }
    return out;
}

    function mergePointPickTargets(cardTargets, syntheticTargets) {
        const out = [];
        const seen = new Set();
        const pushTarget = (t) => {
            if (!t || !t.keys || !t.keys.x || !t.keys.y || !t.keys.z) return;
            const sig = `${t.keys.x}|${t.keys.y}|${t.keys.z}`;
            if (seen.has(sig)) return;
            seen.add(sig);
            out.push(t);
        };
        (cardTargets || []).forEach(pushTarget);
        (syntheticTargets || []).forEach(pushTarget);
        return out;
    }

    function getPointPickTargetsForNodeId(nodeId) {
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return [];
        const cardTargets = collectCardVecTargets(nodeId);
        const syntheticTargets = collectSyntheticVecTargetsForNode(ctx.node);
        return mergePointPickTargets(cardTargets, syntheticTargets);
    }

    function findTargetByKeys(targets, xKey, yKey, zKey) {
        if (!Array.isArray(targets) || !targets.length) return null;
        for (const t of targets) {
            if (!t || !t.keys) continue;
            if (t.keys.x === xKey && t.keys.y === yKey && t.keys.z === zKey) return t;
        }
        return null;
    }

    function targetKeysSignature(target) {
        if (!target || !target.keys) return "";
        return `${target.keys.x || ""}|${target.keys.y || ""}|${target.keys.z || ""}`;
    }

    function pointPickGroupLabel(group) {
        const xKey = Array.isArray(group) ? String(group[0] || "") : "";
        if (!xKey || xKey === "x") return "point";
        return fallbackPointLabelByPrefix(xKey.replace(/x$/, ""), "point");
    }

    function buildPointPickTargetForGroup(node, group, targets) {
        if (!node || !Array.isArray(group) || group.length < 3) return null;
        const [xKey, yKey, zKey] = group;
        const matched = findTargetByKeys(targets, xKey, yKey, zKey);
        if (matched) return matched;
        const p = node.params || (node.params = {});
    return {
        obj: p,
        keys: { x: xKey, y: yKey, z: zKey },
        inputs: null,
        label: pointPickGroupLabel(group),
        onChange: () => renderAll(),
        nodeId: node.id || null
    };
}

    function getPointPickGroupPoint(node, group) {
        if (!node || !node.params || !Array.isArray(group) || group.length < 3) return null;
        const [xKey, yKey, zKey] = group;
        const x = num(node.params[xKey]);
        const y = num(node.params[yKey]);
        const z = num(node.params[zKey]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x, y, z };
    }

    function collectLineEndpointTargetsForPointIndices(nodeId, pointIndices, targets) {
        const indices = Array.from(new Set(
            (Array.isArray(pointIndices) ? pointIndices : [])
                .filter((idx) => Number.isInteger(idx) && idx >= 0 && ownerIdForPointIndex(idx) === nodeId)
        )).sort((a, b) => a - b);
        if (!indices.length) return [];
        const ctx = findNodeContextById(nodeId);
        const node = ctx && ctx.node ? ctx.node : null;
        const startPoint = getPointPickGroupPoint(node, ["sx", "sy", "sz"]);
        const endPoint = getPointPickGroupPoint(node, ["ex", "ey", "ez"]);
        let startHits = 0;
        let endHits = 0;
        let avg = 0;
        const tieEpsilon = 1e-9;
        for (const idx of indices) {
            avg += idx;
            const pickedPoint = lastPoints && lastPoints[idx];
            if (!pickedPoint || !startPoint || !endPoint) continue;
            const startDx = pickedPoint.x - startPoint.x;
            const startDy = pickedPoint.y - startPoint.y;
            const startDz = pickedPoint.z - startPoint.z;
            const endDx = pickedPoint.x - endPoint.x;
            const endDy = pickedPoint.y - endPoint.y;
            const endDz = pickedPoint.z - endPoint.z;
            const startDist = startDx * startDx + startDy * startDy + startDz * startDz;
            const endDist = endDx * endDx + endDy * endDy + endDz * endDz;
            if (!Number.isFinite(startDist) || !Number.isFinite(endDist)) continue;
            if (Math.abs(startDist - endDist) <= tieEpsilon) continue;
            if (startDist < endDist) startHits++;
            else endHits++;
        }
        const out = [];
        if (startHits > 0) {
            const startTarget = buildPointPickTargetForGroup(node, ["sx", "sy", "sz"], targets);
            if (startTarget) out.push(startTarget);
        }
        if (endHits > 0) {
            const endTarget = buildPointPickTargetForGroup(node, ["ex", "ey", "ez"], targets);
            if (endTarget && !out.some((it) => targetKeysSignature(it) === targetKeysSignature(endTarget))) out.push(endTarget);
        }
        if (out.length) return out;
        const seg = nodePointSegments.get(nodeId);
        const fallbackIndex = seg ? Math.round(avg / indices.length) : indices[0];
        const fallback = chooseLineEndpointTarget(nodeId, fallbackIndex, targets);
        return fallback ? [fallback] : [];
    }

    function collectPointPickTargetsForNodePointIndices(nodeId, pointIndices, targetsOverride = null) {
        if (!nodeId) return [];
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return [];
        const targets = (Array.isArray(targetsOverride) && targetsOverride.length)
            ? targetsOverride
            : getPointPickTargetsForNodeId(nodeId);
        if (!targets.length) return [];
        const indices = Array.from(new Set(
            (Array.isArray(pointIndices) ? pointIndices : [])
                .filter((idx) => Number.isInteger(idx) && idx >= 0 && ownerIdForPointIndex(idx) === nodeId)
        ));
        if (!indices.length) return [];
        const out = [];
        const seen = new Set();
        const push = (target) => {
            const sig = targetKeysSignature(target);
            if (!sig || seen.has(sig)) return;
            seen.add(sig);
            out.push(target);
        };
        if (ctx.node.kind === "add_line") {
            for (const target of collectLineEndpointTargetsForPointIndices(nodeId, indices, targets)) {
                push(target);
            }
            if (out.length) return out;
        }
        const groups = OFFSET_PARAM_GROUPS[ctx.node.kind];
        if (!Array.isArray(groups) || !groups.length) {
            if (targets.length === 1) push(targets[0]);
            return out;
        }
        if (groups.length === 1) {
            push(buildPointPickTargetForGroup(ctx.node, groups[0], targets));
            return out;
        }
        for (const idx of indices) {
            const pickedPoint = lastPoints && lastPoints[idx];
            if (!pickedPoint) continue;
            let bestGroup = null;
            let bestDist = Infinity;
            for (const group of groups) {
                const point = getPointPickGroupPoint(ctx.node, group);
                if (!point) continue;
                const dx = pickedPoint.x - point.x;
                const dy = pickedPoint.y - point.y;
                const dz = pickedPoint.z - point.z;
                const dist = dx * dx + dy * dy + dz * dz;
                if (dist < bestDist) {
                    bestDist = dist;
                    bestGroup = group;
                }
            }
            if (!bestGroup) continue;
            push(buildPointPickTargetForGroup(ctx.node, bestGroup, targets));
        }
        return out;
    }

    function collectSyncPointPickTargetsForNodeIds(ids) {
        const valid = normalizeActionTargetIds(ids);
        if (valid.length < 2) return [];
        if (!areActionTargetsSameKind(valid)) return [];
        const targetBuckets = valid.map((id) => ({
            id,
            targets: getPointPickTargetsForNodeId(id)
        }));
        if (!targetBuckets.length || !Array.isArray(targetBuckets[0].targets)) return [];
        const baseTargets = targetBuckets[0].targets;
        const wrapTarget = (target, ownerId) => {
            if (!target) return null;
            return {
                obj: target.obj,
                keys: target.keys,
                inputs: target.inputs || null,
                label: target.label || "",
                onChange: target.onChange,
                ownerId: ownerId || null,
                nodeId: target.nodeId || ownerId || null
            };
        };
        const out = [];
        for (const base of baseTargets) {
            if (!base || !base.keys || !base.keys.x || !base.keys.y || !base.keys.z) continue;
            const group = [];
            const first = wrapTarget(base, targetBuckets[0].id);
            if (!first) continue;
            group.push(first);
            let ok = true;
            for (let i = 1; i < targetBuckets.length; i++) {
                const bucket = targetBuckets[i];
                const matched = findTargetByKeys(
                    bucket.targets,
                    base.keys.x,
                    base.keys.y,
                    base.keys.z
                );
                if (!matched) {
                    ok = false;
                    break;
                }
                const wrapped = wrapTarget(matched, bucket.id);
                if (!wrapped) {
                    ok = false;
                    break;
                }
                group.push(wrapped);
            }
            if (!ok || group.length !== valid.length) continue;
            const lead = group[0];
            out.push({
                obj: lead.obj,
                keys: { x: lead.keys.x, y: lead.keys.y, z: lead.keys.z },
                inputs: lead.inputs || null,
                label: lead.label || "",
                onChange: lead.onChange,
                ownerId: lead.ownerId || null,
                multiTargets: group
            });
        }
        return out;
    }

    function collectSyncPointPickTargetsForSelectedPointIndices(ids) {
        const valid = normalizeActionTargetIds(ids);
        if (valid.length < 2) return [];
        if (!areActionTargetsSameKind(valid)) return [];
        let common = null;
        for (const id of valid) {
            const targets = collectPointPickTargetsForNodePointIndices(id, getViewBoxPointIndicesForOwner(id));
            const signatures = new Set(targets.map(targetKeysSignature).filter(Boolean));
            if (!signatures.size) return [];
            if (!common) {
                common = signatures;
                continue;
            }
            for (const sig of Array.from(common)) {
                if (!signatures.has(sig)) common.delete(sig);
            }
            if (!common.size) return [];
        }
        if (!common || !common.size) return [];
        return collectSyncPointPickTargetsForNodeIds(valid)
            .filter((target) => common.has(targetKeysSignature(target)));
    }

    function chooseLineEndpointTarget(nodeId, pickedIndex, targets, options = {}) {
        const seg = nodePointSegments.get(nodeId);
        let useEnd = false;
        if (seg && Number.isInteger(pickedIndex)) {
            let best = null;
            for (const range of getPointSegmentRanges(seg)) {
                const startDist = Math.abs(pickedIndex - range.start);
                const endDist = Math.abs(pickedIndex - (range.end - 1));
                const dist = Math.min(startDist, endDist);
                if (!best || dist < best.dist) {
                    best = { dist, useEnd: endDist < startDist };
                }
            }
            useEnd = !!best?.useEnd;
        }
        const keyPrefix = useEnd ? "e" : "s";
        const x = `${keyPrefix}x`;
        const y = `${keyPrefix}y`;
        const z = `${keyPrefix}z`;
        const matched = findTargetByKeys(targets, x, y, z);
        if (matched) return matched;
        if (options.allowFallback === false) return null;
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return null;
        const p = ctx.node.params || (ctx.node.params = {});
        return {
            obj: p,
            keys: { x, y, z },
            inputs: null,
            label: useEnd ? "end" : "start",
            onChange: () => renderAll(),
            nodeId
        };
    }

    function showPointPickTargetMenu(targets, anchorX, anchorY, pendingMapped = null) {
        const list = Array.isArray(targets) ? targets.filter(Boolean) : [];
        if (!list.length) return false;
        pointPickPendingMapped = pendingMapped || null;
        const items = list.map((t, i) => ({
            label: `选择 ${pointPickTargetLabel(t) || `point${i + 1}`}`,
            onSelect: () => {
                if (!pointPickMode) return;
                setPointPickTarget(t);
                const pending = pointPickPendingMapped;
                pointPickPendingMapped = null;
                if (pending) {
                    applyPointToTarget(pending);
                    stopPointPick();
                    setTimeout(() => hideLinePickStatus(), 900);
                }
            }
        }));
        const x = Number.isFinite(anchorX) ? anchorX : ((window.innerWidth || 0) * 0.5);
        const y = Number.isFinite(anchorY) ? anchorY : ((window.innerHeight || 0) * 0.5);
        const shown = showActionMenu(x, y, items);
        if (shown) {
            setPointPickStatus(`${getPlaneInfo().label} 点拾取：请先在菜单里选择要修改的坐标组`);
        }
        return shown;
    }

    function getPointPickFallbackNodeId() {
        const selectedOwnerIds = getViewBoxSelectedOwnerIds();
        if (selectedOwnerIds.length === 1) return selectedOwnerIds[0];
        if (focusedNodeId && findNodeContextById(focusedNodeId)) return focusedNodeId;
        if (typeof getCardSelectionIds === "function") {
            const ids = getCardSelectionIds();
            if (ids && ids.size === 1) {
                const id = Array.from(ids)[0];
                if (id && findNodeContextById(id)) return id;
            }
        }
        return null;
    }

    function resolvePointPickTargetByNodeId(nodeId, options = {}) {
        if (!nodeId) return null;
        const ctx = findNodeContextById(nodeId);
        if (!ctx || !ctx.node) return null;
        const targets = getPointPickTargetsForNodeId(nodeId);
        if (!targets.length) return null;
        if (ctx.node.kind === "add_line" && Number.isInteger(options.pickedIndex)) {
            const lineTarget = chooseLineEndpointTarget(nodeId, options.pickedIndex, targets);
            if (lineTarget) return lineTarget;
        }
        if (targets.length === 1) return targets[0];
        if (options.allowMenu) {
            showPointPickTargetMenu(targets, options.anchorX, options.anchorY, options.pendingMapped || null);
        }
        return null;
    }

    function resolvePointPickTargetOnPick(ev, mappedPoint) {
        const idx = pickPointIndexFromEvent(ev);
        const ownerId = (idx !== null) ? ownerIdForPointIndex(idx) : null;
        const ownerCtx = ownerId ? findNodeContextById(ownerId) : null;
        const quickTargets = collectQuickSyncVecTargets();
        if (quickTargets.length === 1) return quickTargets[0];
        if (quickTargets.length > 1) {
            if (ownerCtx && ownerCtx.node && ownerCtx.node.kind === "add_line" && Number.isInteger(idx)) {
                const lineTarget = chooseLineEndpointTarget(ownerId, idx, quickTargets, { allowFallback: false });
                if (lineTarget) return lineTarget;
            }
            showPointPickTargetMenu(
                quickTargets,
                ev ? ev.clientX : undefined,
                ev ? ev.clientY : undefined,
                mappedPoint
            );
            return null;
        }
        if (ownerId) {
            const selectedPointTargets = collectPointPickTargetsForNodePointIndices(
                ownerId,
                getViewBoxPointIndicesForOwner(ownerId)
            );
            if (selectedPointTargets.length === 1) {
                try { focusCardById(ownerId, false, false, true); } catch {}
                return selectedPointTargets[0];
            }
            if (selectedPointTargets.length > 1) {
                showPointPickTargetMenu(
                    selectedPointTargets,
                    ev ? ev.clientX : undefined,
                    ev ? ev.clientY : undefined,
                    mappedPoint
                );
                return null;
            }
            const target = resolvePointPickTargetByNodeId(ownerId, {
                pickedIndex: idx,
                allowMenu: true,
                anchorX: ev ? ev.clientX : undefined,
                anchorY: ev ? ev.clientY : undefined,
                pendingMapped: mappedPoint
            });
            if (target) {
                try { focusCardById(ownerId, false, false, true); } catch {}
            }
            return target;
        }
        const fallbackNodeId = getPointPickFallbackNodeId();
        if (!fallbackNodeId) return null;
        const selectedPointTargets = collectPointPickTargetsForNodePointIndices(
            fallbackNodeId,
            getViewBoxPointIndicesForOwner(fallbackNodeId)
        );
        if (selectedPointTargets.length === 1) return selectedPointTargets[0];
        if (selectedPointTargets.length > 1) {
            showPointPickTargetMenu(
                selectedPointTargets,
                ev ? ev.clientX : undefined,
                ev ? ev.clientY : undefined,
                mappedPoint
            );
            return null;
        }
        return resolvePointPickTargetByNodeId(fallbackNodeId, {
            allowMenu: true,
            anchorX: ev ? ev.clientX : undefined,
            anchorY: ev ? ev.clientY : undefined,
            pendingMapped: mappedPoint
        });
    }

    function startShapePick(type, targetList, label, insertIndex = null, ownerNode = null) {
        hideActionMenu();
        hideQuickSyncPanel();
        if (offsetMode) stopOffsetMode();
        if (rotateMode) stopRotateMode({ silent: true });
        if (pointPickMode) stopPointPick();
        setLockPlaneActive(false);
        lastPickBasePoint = null;
        lastPickMappedPoint = null;
        _rClickT = 0;
        clearPickMarkers();
        hideLinePickPreview();
        ensureHoverMarker();
        setHoverMarkerColor(colorForPickIndex(0)); // 第一个点红
        hoverMarker.visible = true;
        linePickTargetList = targetList || state.root.children;
        linePickTargetLabel = label || "主Builder";
        linePickInsertIndex = (insertIndex === undefined ? null : insertIndex);
        linePickTargetOwnerNode = ownerNode || null;
        linePickType = (type === "triangle" || type === "dotted_line") ? type : "line";
        linePickRequiredPoints = (linePickType === "triangle") ? 3 : 2;
        // 记录进入拾取前的聚焦卡片：拾取新增完成后要把聚焦留在原卡片上
        linePickKeepFocusId = focusedNodeId;
        linePickMode = true;
        picked = [];
        setLinePickStatus(buildLinePickProgressStatus(getPlaneInfo().label));
    }

    function startLinePick(targetList, label, insertIndex = null, ownerNode = null) {
        startShapePick("line", targetList, label, insertIndex, ownerNode);
    }

    function startDottedLinePick(targetList, label, insertIndex = null, ownerNode = null) {
        startShapePick("dotted_line", targetList, label, insertIndex, ownerNode);
    }

    function startTrianglePick(targetList, label, insertIndex = null, ownerNode = null) {
        startShapePick("triangle", targetList, label, insertIndex, ownerNode);
    }

    function stopLinePick() {
        _rClickT = 0;
        clearPickMarkers();
        hideLinePickPreview();
        hideHoverMarker();
        setLockPlaneActive(false);
        linePickMode = false;
        picked = [];
        linePickInsertIndex = null;
        linePickTargetOwnerNode = null;
        linePickKeepFocusId = null;
        linePickType = "line";
        linePickRequiredPoints = 2;
        hideLinePickStatus();
    }

    function startPointPick(options = {}) {
        hideActionMenu();
        hidePointPickPreview();
        pointPickHoverPoint = null;
        if (offsetMode) stopOffsetMode();
        if (rotateMode) stopRotateMode({ silent: true });
        if (linePickMode) stopLinePick();
        setLockPlaneActive(false);
        lastPickBasePoint = null;
        lastPickMappedPoint = null;
        beginTransformConstraint("point_pick");
        if (typeof options.onPick === "function") {
            _rClickT = 0;
            pointPickPendingMapped = null;
            pointPickTarget = null;
            pointPickCallback = options.onPick;
            pointPickCallbackLabel = String(options.label || "预设原点").trim();
            pointPickCallbackRotate = false;
            pointPickKeepFocusId = focusedNodeId;
            pointPickMode = true;
            setPointPickStatus(buildPointPickStatus());
            ensureHoverMarker();
            setHoverMarkerColor(pointPickPreviewColor.getHex());
            hoverMarker.visible = false;
            updateFocusColors();
            return true;
        }
        pointPickCallback = null;
        pointPickCallbackLabel = "";
        if (options.target && options.target.obj && options.target.keys) {
            _rClickT = 0;
            pointPickPendingMapped = null;
            pointPickKeepFocusId = focusedNodeId;
            pointPickMode = true;
            setPointPickTarget(options.target);
            ensureHoverMarker();
            setHoverMarkerColor(pointPickPreviewColor.getHex());
            hoverMarker.visible = false;
            updateFocusColors();
            refreshPointPickStatus();
            return true;
        }
        const selectedSet = (typeof getCardSelectionIds === "function") ? getCardSelectionIds() : null;
        const selectedIds = normalizeActionTargetIds(selectedSet ? Array.from(selectedSet) : []);
        const selectedCount = selectedIds.length;
        const selectedPointOwnerIds = getViewBoxSelectedOwnerIds();
        const preferredPointOwnerId = selectedPointOwnerIds.length === 1 ? selectedPointOwnerIds[0] : null;
        const hasSelectedCard = selectedCount > 0 || !!preferredPointOwnerId;
        if (!hasSelectedCard) {
            setPointPickStatus("请先选中卡片，再按 E 进行点拾取");
            setTimeout(() => hideLinePickStatus(), 1200);
            showToast("请先选中卡片后再使用点拾取", "error");
            return false;
        }
        const multiSelection = selectedCount > 1;
        let syncTargets = [];
        if (multiSelection) {
            if (!areActionTargetsSameKind(selectedIds)) {
                setPointPickStatus("多选点拾取仅支持同类型卡片");
                setTimeout(() => hideLinePickStatus(), 1200);
                showToast("多选卡片类型不一致，无法同步点拾取", "error");
                return false;
            }
            syncTargets = collectSyncPointPickTargetsForNodeIds(selectedIds);
            if (!syncTargets.length) {
                setPointPickStatus("当前多选不具备可同步的坐标组");
                setTimeout(() => hideLinePickStatus(), 1200);
                showToast("多选卡片缺少可同步参数，无法使用 E 点拾取", "error");
                return false;
            }
        }
        const activeTarget = (document.activeElement && document.activeElement.__vecTarget) || null;
        const quickTargets = collectQuickSyncVecTargets();
        const fallbackNodeId = preferredPointOwnerId || getPointPickFallbackNodeId();
        const singlePointTargetNodeId = multiSelection
            ? null
            : (preferredPointOwnerId || (selectedCount === 1 ? selectedIds[0] : fallbackNodeId));
        const pointSelectionTargets = multiSelection
            ? collectSyncPointPickTargetsForSelectedPointIndices(selectedIds)
            : collectPointPickTargetsForNodePointIndices(
                singlePointTargetNodeId,
                getViewBoxPointIndicesForOwner(singlePointTargetNodeId)
            );
        const hasCardContext = multiSelection
            ? (syncTargets.length > 0 || pointSelectionTargets.length > 0 || !!activeTarget)
            : (!!singlePointTargetNodeId || !!activeTarget || quickTargets.length > 0 || pointSelectionTargets.length > 0);
        if (!hasCardContext) {
            setPointPickStatus("请先选中卡片，再按 E 进行点拾取");
            setTimeout(() => hideLinePickStatus(), 1200);
            showToast("请先选中卡片后再使用点拾取", "error");
            return false;
        }
        _rClickT = 0;
        pointPickPendingMapped = null;
        pointPickKeepFocusId = focusedNodeId;
        pointPickMode = true;
        setPointPickStatus(`${getPlaneInfo().label} 点拾取：正在准备目标...`);
        let target = null;
        let openedMenu = false;
        if (multiSelection) {
            if (activeTarget && activeTarget.keys) {
                target = findTargetByKeys(
                    syncTargets,
                    activeTarget.keys.x,
                    activeTarget.keys.y,
                    activeTarget.keys.z
                );
            }
            if (!target && pointSelectionTargets.length === 1) {
                target = pointSelectionTargets[0];
            } else if (!target && pointSelectionTargets.length > 1) {
                const anchor = resolvePointPickMenuAnchor();
                openedMenu = !!showPointPickTargetMenu(
                    pointSelectionTargets,
                    anchor.x,
                    anchor.y
                );
            }
            if (!target && !openedMenu && syncTargets.length === 1) {
                target = syncTargets[0];
            } else if (!target && !openedMenu && syncTargets.length > 1) {
                const anchor = resolvePointPickMenuAnchor();
                openedMenu = !!showPointPickTargetMenu(
                    syncTargets,
                    anchor.x,
                    anchor.y
                );
            }
        } else {
            target = activeTarget || null;
            if (!target && quickTargets.length === 1) {
                target = quickTargets[0];
            } else if (!target && quickTargets.length > 1) {
                const anchor = resolvePointPickMenuAnchor();
                openedMenu = !!showPointPickTargetMenu(
                    quickTargets,
                    anchor.x,
                    anchor.y
                );
            }
            if (!target && !openedMenu && pointSelectionTargets.length === 1) {
                target = pointSelectionTargets[0];
            } else if (!target && !openedMenu && pointSelectionTargets.length > 1) {
                const anchor = resolvePointPickMenuAnchor();
                openedMenu = !!showPointPickTargetMenu(
                    pointSelectionTargets,
                    anchor.x,
                    anchor.y
                );
            }
            if (!target && !openedMenu && fallbackNodeId) {
                const ctx = findNodeContextById(fallbackNodeId);
                if (ctx && ctx.node) {
                    const nodeTargets = getPointPickTargetsForNodeId(fallbackNodeId);
                    if (nodeTargets.length === 1) {
                        target = nodeTargets[0];
                    } else if (nodeTargets.length > 1 && !openedMenu) {
                        const anchor = resolvePointPickMenuAnchor();
                        openedMenu = !!showPointPickTargetMenu(
                            nodeTargets,
                            anchor.x,
                            anchor.y
                        );
                    }
                }
            }
        }
        setPointPickTarget(target || null);
        ensureHoverMarker();
        setHoverMarkerColor(0xffcc33);
        hoverMarker.visible = true;
        if (openedMenu) {
            setPointPickStatus(`${getPlaneInfo().label} 点拾取：请先在菜单里选择要修改的坐标组`);
        } else {
            refreshPointPickStatus();
        }
        return true;
    }

    function stopPointPick() {
        setLockPlaneActive(false);
        hideHoverMarker();
        hidePointPickPreview();
        clearPresetPreview();
        pointPickMode = false;
        pointPickTarget = null;
        pointPickKeepFocusId = null;
        pointPickHoverPoint = null;
        pointPickPendingMapped = null;
        pointPickCallback = null;
        pointPickCallbackLabel = "";
        pointPickCallbackRotate = false;
        _rClickT = 0;
        if (transformConstraintOperation === "point_pick") clearTransformConstraint();
        hideLinePickStatus();
    }

    const OFFSET_PARAM_GROUPS = {
        add_point: [["x", "y", "z"]],
        add_line: [["sx", "sy", "sz"], ["ex", "ey", "ez"]],
        add_fill_triangle: [
            ["p1x", "p1y", "p1z"],
            ["p2x", "p2y", "p2z"],
            ["p3x", "p3y", "p3z"]
        ],
        add_bezier: [
            ["p1x", "p1y", "p1z"],
            ["p2x", "p2y", "p2z"],
            ["p3x", "p3y", "p3z"]
        ],
        add_bezier_4: [
            ["sx", "sy", "sz"],
            ["ex", "ey", "ez"],
            ["shx", "shy", "shz"],
            ["ehx", "ehy", "ehz"]
        ],
        add_bezier_curve: [
            ["ex", "ey", "ez"],
            ["shx", "shy", "shz"],
            ["ehx", "ehy", "ehz"]
        ]
    };

    const NATIVE_OFFSET_TARGET_KINDS = new Set([
        BUILDER_REFERENCE_KIND,
        "add_circle",
        "add_discrete_circle_xz",
        "add_half_circle",
        "add_radian_center",
        "add_radian",
        "add_ball",
        "add_ball_surface",
        "add_ball_solid",
        "add_ball_volume",
        "add_cube_surface",
        "add_polygon",
        "add_polygon_in_circle",
        "add_round_shape",
        "add_fourier_series",
        "clear_as_ball_mask",
        "clear_as_round_xz_mask",
        "add_with"
    ]);

    function applyNodeOffsetParams(node, delta) {
        if (!node || !delta) return false;
        const p = node.params || (node.params = {});
        p.ox = num(p.ox) + delta.x;
        p.oy = num(p.oy) + delta.y;
        p.oz = num(p.oz) + delta.z;
        return true;
    }

    function applyOffsetDeltaToNode(node, delta) {
        if (!node || !node.kind) return false;
        if (NATIVE_OFFSET_TARGET_KINDS.has(node.kind)) {
            return applyNodeOffsetParams(node, delta);
        }
        if (node.kind === "add_bezier_curve_multi"
            || node.kind === "apply_bezier_distribution"
            || node.kind === "add_bezier_circle_preset") {
            const nodes = Array.isArray(node.params?.nodes) ? node.params.nodes : [];
            if (!nodes.length) return false;
            for (const item of nodes) {
                if (!item || typeof item !== "object") continue;
                item.x = num(item.x) + delta.x;
                item.y = num(item.y) + delta.y;
                item.z = num(item.z) + delta.z;
            }
            return true;
        }
        if (node.kind === "add_bezier_4") {
            const p = node.params || (node.params = {});
            const keys = ["sx", "sy", "sz", "ex", "ey", "ez"];
            for (const key of keys) {
                const raw = String(p[key] ?? "").trim();
                if (!raw) continue;
                if (!isNumericLiteral(stripNumericSuffix(raw))) return false;
            }
            p.sx = num(p.sx) + delta.x;
            p.sy = num(p.sy) + delta.y;
            p.sz = num(p.sz) + delta.z;
            p.ex = num(p.ex) + delta.x;
            p.ey = num(p.ey) + delta.y;
            p.ez = num(p.ez) + delta.z;
            p.__pb_vec_mode_s = "manual";
            p.__pb_vec_mode_e = "manual";
            return true;
        }
        const groups = OFFSET_PARAM_GROUPS[node.kind];
        if (!groups) return false;
        const p = node.params || (node.params = {});
        for (const g of groups) {
            for (const key of g) {
                const raw = String(p[key] ?? "").trim();
                if (!raw) continue;
                if (!isNumericLiteral(stripNumericSuffix(raw))) {
                    return false;
                }
            }
        }
        for (const g of groups) {
            const kx = g[0], ky = g[1], kz = g[2];
            if (kx) p[kx] = num(p[kx]) + delta.x;
            if (ky) p[ky] = num(p[ky]) + delta.y;
            if (kz) p[kz] = num(p[kz]) + delta.z;
        }
        return true;
    }

    function convertBezierCurveEndOnlyToStartEnd(node, delta) {
        if (!node || node.kind !== "add_bezier_curve" || !delta) return false;
        const p = node.params || (node.params = {});
        const keys = ["ex", "ey", "ez"];
        for (const key of keys) {
            const raw = String(p[key] ?? "").trim();
            if (!raw) continue;
            if (!isNumericLiteral(stripNumericSuffix(raw))) return false;
        }
        p.sx = delta.x;
        p.sy = delta.y;
        p.sz = delta.z;
        p.ex = num(p.ex) + delta.x;
        p.ey = num(p.ey) + delta.y;
        p.ez = num(p.ez) + delta.z;
        p.__pb_vec_mode_s = "manual";
        p.__pb_vec_mode_e = "manual";
        node.kind = "add_bezier_4";
        return true;
    }

    function normalizeOffsetTargetIds(ids) {
        return normalizeOutermostActionTargetIds(ids);
    }

    function startOffsetMode(nodeId, options = {}) {
        hideActionMenu();
        hideQuickSyncPanel();
        if (bezierHandleDrag || bezierNodeMoveDrag || bezierCreateState) return;
        const requestedGuideId = String(options.guideId || "");
        const nextTargetType = requestedGuideId ? "guide" : "node";
        const usableIds = [];
        let sx = 0, sy = 0, sz = 0;
        let guideOrigin = null;
        if (nextTargetType === "guide") {
            if (referenceGuideController?.isGuideLocked?.(requestedGuideId)) {
                showToast("参考线已锁定，无法移动", "info");
                return;
            }
            guideOrigin = referenceGuideController?.getGuideOrigin?.(requestedGuideId) || null;
            if (!guideOrigin) return;
        } else {
            const srcIds = Array.isArray(options.ids) && options.ids.length
                ? options.ids
                : (nodeId ? [nodeId] : []);
            const targetIds = normalizeOffsetTargetIds(srcIds);
            if (!targetIds.length) return;
            for (const id of targetIds) {
                const center = getNodeSegmentCenter(id);
                if (!center) continue;
                usableIds.push(id);
                sx += center.x;
                sy += center.y;
                sz += center.z;
            }
            if (!usableIds.length) {
                showToast("无法进入偏移模式：该图形没有点", "error");
                return;
            }
        }

        if (linePickMode) stopLinePick();
        if (pointPickMode) stopPointPick();
        if (rotateMode) stopRotateMode({ silent: true });
        setLockPlaneActive(false);
        lastPickBasePoint = null;
        lastPickMappedPoint = null;
        offsetMode = true;
        offsetTargetType = nextTargetType;
        offsetTargetIds = usableIds;
        offsetTargetId = usableIds[0] || null;
        offsetGuideId = nextTargetType === "guide" ? requestedGuideId : null;
        offsetConstraintAxis = null;
        offsetConstraintSpace = "world";
        offsetConstraintVector = null;
        offsetConstraintLastKey = "";
        offsetConstraintLastAt = 0;
        offsetRefPoint = guideOrigin || {
            x: sx / usableIds.length,
            y: sy / usableIds.length,
            z: sz / usableIds.length
        };
        offsetHoverPoint = null;
        hideOffsetPreview();
        refreshOffsetStatus();
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
        ensureHoverMarker();
        setHoverMarkerColor(offsetPointColor.getHex());
        hoverMarker.visible = false;
        updateFocusColors();
    }

    function stopOffsetMode() {
        if (!offsetMode) return;
        setLockPlaneActive(false);
        offsetMode = false;
        offsetTargetType = "node";
        offsetTargetId = null;
        offsetTargetIds = [];
        offsetGuideId = null;
        offsetRefPoint = null;
        offsetHoverPoint = null;
        offsetConstraintAxis = null;
        offsetConstraintSpace = "world";
        offsetConstraintVector = null;
        offsetConstraintLastKey = "";
        offsetConstraintLastAt = 0;
        hideHoverMarker();
        hideOffsetPreview();
        updateSnapModeStatus();
        updateLockPlaneGuideVisual();
        hideLinePickStatus();
        updateFocusColors();
        updateBezierGuidePreview();
    }

    function applyOffsetToTargetId(targetId, worldDelta) {
        if (!targetId || !worldDelta) return false;
        const ctx = findNodeContextById(targetId);
        if (!ctx || !ctx.node) return false;

        const path = findNodePathById(targetId);
        const localDeltaRaw = mapWorldDeltaToLocalDelta(worldDelta, path, path ? path.length - 1 : -1);
        const localDelta = (localDeltaRaw
            && Number.isFinite(localDeltaRaw.x)
            && Number.isFinite(localDeltaRaw.y)
            && Number.isFinite(localDeltaRaw.z))
            ? localDeltaRaw
            : worldDelta;

        if (ctx.node.kind === "add_builder" || ctx.node.kind === "with_builder" || ctx.node.kind === "add_with") {
            const p = ctx.node.params || (ctx.node.params = {});
            p.ox = num(p.ox) + localDelta.x;
            p.oy = num(p.oy) + localDelta.y;
            p.oz = num(p.oz) + localDelta.z;
            return true;
        }

        if (ctx.node.kind === "add_bezier_curve") {
            return convertBezierCurveEndOnlyToStartEnd(ctx.node, localDelta);
        }

        if (applyOffsetDeltaToNode(ctx.node, localDelta)) return true;

        const reusableParent = resolveReusableOffsetAncestor(path);
        if (reusableParent && reusableParent.node) {
            const parentDeltaRaw = mapWorldDeltaToLocalDelta(worldDelta, path, reusableParent.pathIndex);
            const parentDelta = (parentDeltaRaw
                && Number.isFinite(parentDeltaRaw.x)
                && Number.isFinite(parentDeltaRaw.y)
                && Number.isFinite(parentDeltaRaw.z))
                ? parentDeltaRaw
                : localDelta;
            const p = reusableParent.node.params || (reusableParent.node.params = {});
            p.ox = num(p.ox) + parentDelta.x;
            p.oy = num(p.oy) + parentDelta.y;
            p.oz = num(p.oz) + parentDelta.z;
            return true;
        }

        const wrapper = makeNode("add_builder", { params: { ox: localDelta.x, oy: localDelta.y, oz: localDelta.z } });
        wrapper.children = [ctx.node];
        ctx.parentList.splice(ctx.index, 1, wrapper);
        return true;
    }

    function applyOffsetAtPoint(target) {
        if (!offsetMode || !offsetRefPoint || !target) return;
        const constrainedDelta = constrainOffsetDelta({
            x: target.x - offsetRefPoint.x,
            y: target.y - offsetRefPoint.y,
            z: target.z - offsetRefPoint.z
        });
        const dx = constrainedDelta.x;
        const dy = constrainedDelta.y;
        const dz = constrainedDelta.z;
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-9) {
            stopOffsetMode();
            return;
        }

        const worldDelta = { x: dx, y: dy, z: dz };
        if (offsetTargetType === "guide") {
            if (!referenceGuideController?.getGuideOrigin?.(offsetGuideId)) {
                stopOffsetMode();
                return;
            }
            if (referenceGuideController?.isGuideLocked?.(offsetGuideId)) {
                showToast("参考线已锁定，无法移动", "info");
                stopOffsetMode();
                return;
            }
            historyCapture("move_reference_guide");
            const changed = referenceGuideController?.moveGuideBy?.(offsetGuideId, worldDelta) === true;
            if (!changed) showToast("参考线无法移动，请检查锁定状态", "info");
            stopOffsetMode();
            return;
        }
        const targetIds = getActiveOffsetTargetIds();
        if (!targetIds.length) {
            stopOffsetMode();
            return;
        }
        historyCapture("offset_move");
        let changed = false;
        for (const id of targetIds) {
            if (applyOffsetToTargetId(id, worldDelta)) changed = true;
        }
        if (changed) renderAll();
        stopOffsetMode();
    }

    function resetOffsetForTargetIds(ids) {
        const targetIds = normalizeOffsetTargetIds(Array.isArray(ids) ? ids : []);
        if (!targetIds.length) return false;
        const center = averageSegmentCenterForNodeIds(targetIds);
        if (!center) {
            showToast("无法重置：所选图形没有点", "error");
            return false;
        }
        const worldDelta = { x: -center.x, y: -center.y, z: -center.z };
        if (Math.abs(worldDelta.x) + Math.abs(worldDelta.y) + Math.abs(worldDelta.z) < 1e-9) {
            showToast("所选图形已在原点", "info");
            return true;
        }
        historyCapture("offset_reset_origin");
        let changed = false;
        for (const id of targetIds) {
            if (applyOffsetToTargetId(id, worldDelta)) changed = true;
        }
        if (changed) {
            renderAll();
            showToast("已将所选图形中心重置到原点", "success");
        } else {
            showToast("无法重置：目标包含不可直接移动的表达式", "error");
        }
        return changed;
    }

    function resetOffsetForGuideId(guideId) {
        const id = String(guideId || "");
        if (!id) return false;
        if (referenceGuideController?.isGuideLocked?.(id)) {
            showToast("参考线已锁定，无法重置", "info");
            return false;
        }
        const origin = referenceGuideController?.getGuideOrigin?.(id);
        if (!origin) return false;
        const worldDelta = { x: -origin.x, y: -origin.y, z: -origin.z };
        if (Math.abs(worldDelta.x) + Math.abs(worldDelta.y) + Math.abs(worldDelta.z) < 1e-9) {
            showToast("参考线已在原点", "info");
            return true;
        }
        historyCapture("reset_reference_guide_origin");
        const changed = referenceGuideController?.moveGuideBy?.(id, worldDelta) === true;
        if (changed) showToast("已将参考线原点重置到原点", "success");
        return changed;
    }

    function normalizeRotateTargetIds(ids) {
        const src = normalizeActionTargetIds(ids);
        const out = [];
        for (const id of src) {
            const ctx = findNodeContextById(id);
            if (!ctx || !ctx.node || ctx.node.kind !== "rotate_as_axis") continue;
            out.push(id);
        }
        return out;
    }

    function syncRotateCardUiForTarget(targetId, degValue, unitValue = "deg", valueKey = "deg", unitKey = null) {
        if (!targetId || !elCardsRoot) return false;
        const card = elCardsRoot.querySelector(`.card[data-id="${targetId}"]`);
        if (!card) return false;
        const safeUnitKey = unitKey || `${valueKey}Unit`;
        const input = Array.from(card.querySelectorAll("input.angle-value")).find((el) => (el.dataset.angleKey || "") === valueKey)
            || (valueKey === "deg" ? card.querySelector("input.angle-value") : null);
        const unitSelect = Array.from(card.querySelectorAll("select.angle-unit")).find((el) => (el.dataset.angleUnitKey || "") === safeUnitKey)
            || (safeUnitKey === "degUnit" ? card.querySelector("select.angle-unit") : null);
        if (!input && !unitSelect) return false;
        if (input && input.value !== String(degValue)) input.value = String(degValue);
        if (unitSelect && unitSelect.value !== unitValue) unitSelect.value = unitValue;
        return true;
    }

    function setRotateDegForTargets(nextDeg) {
        if (!Number.isFinite(nextDeg)) return false;
        const bindings = getActiveRotateBindings();
        if (!bindings.length) return false;
        rotateBindings = bindings;
        let shouldApply = false;
        for (const binding of bindings) {
            if (willRotateBindingChange(binding, nextDeg)) {
                shouldApply = true;
                break;
            }
        }
        rotateCurrentDeg = nextDeg;
        if (!shouldApply) {
            refreshRotateStatus();
            return false;
        }
        ensureRotateHistoryCaptured("rotate_drag");
        for (const binding of bindings) {
            if (binding.type === "deferred_wrapper" && !materializeRotateBinding(binding)) {
                showToast("旋转目标已变化，无法继续", "error");
                stopRotateMode({ silent: true });
                return false;
            }
        }
        let changed = false;
        let needsCardRender = false;
        for (const binding of getActiveRotateBindings()) {
            const ctx = binding.nodeId ? findNodeContextById(binding.nodeId) : null;
            if (!ctx || !ctx.node) continue;
            const p = ctx.node.params || (ctx.node.params = {});
            const prev = readRotateBindingDeg(binding);
            const valueKey = binding.valueKey || "deg";
            const unitKey = binding.unitKey || `${valueKey}Unit`;
            const enableKey = binding.enableKey || null;
            const storageDeg = nextDeg * (Number.isFinite(binding.valueScale) && Math.abs(binding.valueScale) > 1e-9 ? binding.valueScale : 1);
            if (Math.abs(prev - nextDeg) > 1e-9) changed = true;
            if (normalizeAngleUnitForRotate(p[unitKey]) !== "deg") changed = true;
            if (enableKey && !p[enableKey]) {
                p[enableKey] = true;
                changed = true;
                needsCardRender = true;
            }
            p[valueKey] = storageDeg;
            p[unitKey] = "deg";
            syncRotateCardUiForTarget(binding.nodeId, storageDeg, "deg", valueKey, unitKey);
        }
        if (changed) {
            if (needsCardRender) renderAll();
            else rebuildPreviewAndKotlin();
        }
        refreshRotateStatus();
        return changed;
    }

    function updateRotateFromMappedPoint(mapped, ev = null) {
        if (!rotateMode || !rotateDragStartPoint || !mapped || !rotateCenter || !rotateAxis) return;
        const deltaDeg = signedAngleDegAroundAxis(rotateDragStartPoint, mapped, rotateCenter, rotateAxis);
        if (!Number.isFinite(deltaDeg)) return;
        let nextDeg = rotateDragStartDeg + deltaDeg;
        if (ev && ev.shiftKey) {
            const step = normalizeRotateSnapDeg(rotateSnapDeg);
            nextDeg = Math.round(nextDeg / step) * step;
        }
        if (bezierRotateTargetId) {
            if (applyBezierRotationDeg(nextDeg)) rotateDragChanged = true;
            return;
        }
        if (setRotateDegForTargets(nextDeg)) rotateDragChanged = true;
    }

    function applyBezierRotationDeg(nextDeg) {
        if (!bezierRotateTargetId || !Array.isArray(bezierRotateSnapshots) || !rotateCenter || !rotateAxis) return false;
        const ctx = findNodeContextById(bezierRotateTargetId);
        const nodes = Array.isArray(ctx?.node?.params?.nodes) ? ctx.node.params.nodes : [];
        if (!nodes.length) return false;
        const q = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(rotateAxis.x, rotateAxis.y, rotateAxis.z),
            Number(nextDeg || 0) * Math.PI / 180
        );
        const center = new THREE.Vector3(rotateCenter.x, rotateCenter.y, rotateCenter.z);
        for (const snapshot of bezierRotateSnapshots) {
            const item = nodes[snapshot.index];
            if (!item) continue;
            const anchor = new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z)
                .sub(center)
                .applyQuaternion(q)
                .add(center);
            item.x = anchor.x;
            item.y = anchor.y;
            item.z = anchor.z;
            const sh = new THREE.Vector3(snapshot.shx, snapshot.shy, snapshot.shz).applyQuaternion(q);
            const eh = new THREE.Vector3(snapshot.ehx, snapshot.ehy, snapshot.ehz).applyQuaternion(q);
            item.shx = sh.x;
            item.shy = sh.y;
            item.shz = sh.z;
            item.ehx = eh.x;
            item.ehy = eh.y;
            item.ehz = eh.z;
        }
        rotateCurrentDeg = Number(nextDeg) || 0;
        ensureRotateHistoryCaptured("bezier_rotate_drag");
        rebuildPreviewAndKotlin();
        updateBezierGuidePreview();
        refreshRotateStatus();
        return true;
    }

    function startBezierRotateMode(nodeId) {
        const ctx = nodeId ? findNodeContextById(nodeId) : getFocusedBezierEditContext();
        const node = ctx?.node;
        const nodes = Array.isArray(node?.params?.nodes) ? node.params.nodes : [];
        if (!node || !isEditableBezierNodeKind(node.kind) || !nodes.length) return false;
        if (bezierCreateState) stopBezierCreate({ keepGuide: true });
        if (rotateMode) stopRotateMode({ silent: true });
        if (offsetMode) stopOffsetMode();
        const center = nodes.reduce((acc, item) => ({
            x: acc.x + num(item.x),
            y: acc.y + num(item.y),
            z: acc.z + num(item.z)
        }), { x: 0, y: 0, z: 0 });
        center.x /= nodes.length;
        center.y /= nodes.length;
        center.z /= nodes.length;
        const axis = normalizeAxisForRotate(resolveAxisForNodeId(node.id));
        bezierRotateTargetId = node.id;
        bezierRotateSnapshots = nodes.map((item, index) => ({
            index,
            x: num(item.x), y: num(item.y), z: num(item.z),
            shx: num(item.shx), shy: num(item.shy), shz: num(item.shz),
            ehx: num(item.ehx), ehy: num(item.ehy), ehz: num(item.ehz)
        }));
        rotateMode = true;
        rotateBindings = [];
        rotateTargetIds = [node.id];
        rotateSourceIds = [node.id];
        rotateCenter = center;
        rotateAxis = axis;
        rotateCurrentDeg = 0;
        rotateManualInput = "";
        rotateDragPointerId = null;
        rotateDragStartPoint = null;
        rotateDragStartDeg = 0;
        rotateDragChanged = false;
        rotateHistoryCaptured = false;
        hideActionMenu();
        ensureHoverMarker();
        setHoverMarkerColor(rotatePointColor.getHex());
        hoverMarker.visible = false;
        refreshRotateStatus();
        updateFocusColors();
        return true;
    }

    function startRotateMode(rotateIds, options = {}) {
        hideActionMenu();
        hideQuickSyncPanel();
        if (linePickMode) stopLinePick();
        if (pointPickMode) stopPointPick();
        if (offsetMode) stopOffsetMode();

        const explicitBindings = Array.isArray(options.bindings) ? options.bindings.filter(Boolean) : [];
        const ids = explicitBindings.length ? [] : normalizeRotateTargetIds(rotateIds);
        const bindings = explicitBindings.length
            ? explicitBindings.slice()
            : ids.map((id) => makeRotateParamBinding(id));
        if (!bindings.length) return false;
        const sourceIds = normalizeOffsetTargetIds(Array.isArray(options.sourceIds) ? options.sourceIds : []);
        let center = options.center;
        if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
            center = averageSegmentCenterForNodeIds(sourceIds);
        }
        if (!center) {
            showToast("无法进入旋转模式：该图形没有点", "error");
            return false;
        }
        let axis = options.axis;
        if (!axis || !Number.isFinite(axis.x) || !Number.isFinite(axis.y) || !Number.isFinite(axis.z)) {
            axis = resolveAxisForNodeId(sourceIds[0] || null);
        }
        axis = U.norm(axis || U.v(0, 1, 0));
        if (U.len(axis) <= 1e-9) axis = U.v(0, 1, 0);

        rotateMode = true;
        rotateBindings = bindings;
        rotateTargetIds = bindings.map((binding) => binding.nodeId).filter(Boolean);
        rotateSourceIds = sourceIds.length ? sourceIds.slice() : bindings.flatMap((binding) => binding.sourceIds || (binding.nodeId ? [binding.nodeId] : []));
        rotateCenter = { x: center.x, y: center.y, z: center.z };
        rotateAxis = axis;
        rotateManualInput = "";
        rotateDragPointerId = null;
        rotateDragStartPoint = null;
        rotateDragStartDeg = 0;
        rotateDragChanged = false;
        rotateHistoryCaptured = false;

        rotateCurrentDeg = Number.isFinite(options.initialDeg) ? options.initialDeg : readRotateBindingDeg(bindings[0]);
        _rClickT = 0;
        ensureHoverMarker();
        setHoverMarkerColor(rotatePointColor.getHex());
        hoverMarker.visible = false;
        refreshRotateStatus();
        updateFocusColors();
        return true;
    }

    function stopRotateMode(options = {}) {
        if (!rotateMode) return;
        const silent = !!options.silent;
        const keepDoneText = !!options.keepDoneText;
        const finalDeg = rotateCurrentDeg;
        rotateMode = false;
        rotateTargetIds = [];
        rotateBindings = [];
        rotateSourceIds = [];
        rotateCenter = null;
        rotateAxis = null;
        rotateManualInput = "";
        rotateDragPointerId = null;
        rotateDragStartPoint = null;
        rotateDragStartDeg = 0;
        rotateDragChanged = false;
        rotateHistoryCaptured = false;
        bezierRotateTargetId = null;
        bezierRotateSnapshots = null;
        hideHoverMarker();
        if (silent) {
            hideLinePickStatus();
        } else if (keepDoneText) {
            setLinePickStatus(`${getPlaneInfo().label} 旋转完成：${U.fmt(finalDeg)}°`);
            setTimeout(() => {
                if (!linePickMode && !pointPickMode && !offsetMode && !rotateMode) hideLinePickStatus();
            }, 900);
        } else {
            hideLinePickStatus();
        }
        updateFocusColors();
        if (focusedNodeId || bezierGuideNodeId) requestAnimationFrame(() => updateBezierGuidePreview());
    }

    function handleRotateModeManualInputKeydown(e) {
        if (!rotateMode) return false;
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        const ae = document.activeElement;
        const tag = (ae && ae.tagName ? String(ae.tagName).toUpperCase() : "");
        if (ae && (tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable)) return false;

        const key = String(e.key || "");
        const code = String(e.code || "");

        const commitManual = () => {
            const text = String(rotateManualInput || "").trim();
            if (!text || text === "-" || text === "." || text === "-.") {
                rotateManualInput = "";
                refreshRotateStatus();
                return true;
            }
            const n = parseFloat(text);
            if (!Number.isFinite(n)) {
                showToast("旋转角度输入无效", "error");
                return true;
            }
            if (bezierRotateTargetId) applyBezierRotationDeg(n);
            else setRotateDegForTargets(n);
            stopRotateMode({ keepDoneText: true });
            return true;
        };

        if (code === "Enter" || key === "Enter") {
            e.preventDefault();
            return commitManual();
        }
        if (code === "Backspace" || key === "Backspace") {
            e.preventDefault();
            rotateManualInput = rotateManualInput ? rotateManualInput.slice(0, -1) : "";
            refreshRotateStatus();
            return true;
        }
        if (code === "Delete" || key === "Delete") {
            e.preventDefault();
            rotateManualInput = "";
            refreshRotateStatus();
            return true;
        }
        if (code === "Minus" || code === "NumpadSubtract" || key === "-") {
            e.preventDefault();
            if (!rotateManualInput) rotateManualInput = "-";
            refreshRotateStatus();
            return true;
        }
        if (code === "Period" || code === "NumpadDecimal" || key === ".") {
            e.preventDefault();
            if (!rotateManualInput.includes(".")) {
                if (!rotateManualInput || rotateManualInput === "-") rotateManualInput += "0.";
                else rotateManualInput += ".";
            }
            refreshRotateStatus();
            return true;
        }
        if (/^\d$/.test(key)) {
            e.preventDefault();
            rotateManualInput += key;
            refreshRotateStatus();
            return true;
        }
        return false;
    }

    function applyPointToTarget(p) {
        if (!pointPickTarget) return;
        const root = pointPickTarget;
        const targets = (Array.isArray(root.multiTargets) && root.multiTargets.length)
            ? root.multiTargets
            : [root];
        historyCapture(targets.length > 1 ? "pick_point_multi" : "pick_point");
        let needRenderAll = false;
        let focusInput = null;
        for (const t of targets) {
            if (!t || !t.obj || !t.keys) continue;
            const localPoint = mapWorldPointToTargetLocalPoint(p, t) || p;
            t.obj[t.keys.x] = localPoint.x;
            t.obj[t.keys.y] = localPoint.y;
            t.obj[t.keys.z] = localPoint.z;
            let dispatched = false;
            if (t.inputs) {
                t.inputs.x.value = String(localPoint.x);
                t.inputs.y.value = String(localPoint.y);
                t.inputs.z.value = String(localPoint.z);
                if (t.inputs.x && t.inputs.x.isConnected) {
                    try {
                        t.inputs.x.dispatchEvent(new Event("input", { bubbles: true }));
                        dispatched = true;
                        if (!focusInput) focusInput = t.inputs.x;
                    } catch {}
                }
            }
            if (!dispatched && typeof t.onChange === "function") t.onChange();
            if (t.inputs && t.inputs.x && t.inputs.x.isConnected === false) {
                needRenderAll = true;
            }
        }
        clearViewBoxPointSelection();
        if (needRenderAll) renderAll();
        if (focusInput) {
            try { focusInput.focus({ preventScroll: true }); } catch { try { focusInput.focus(); } catch {} }
        }
    }

    function onPointerMove(ev) {
        rememberPointPickMenuAnchor(ev);
        updateActionMenuRightTrack(ev);
        if (bezierNodeMoveDrag) {
            updateBezierNodeMoveDrag(ev);
            return;
        }
        if (bezierHandleDrag) {
            if (!ev || ev.pointerId !== bezierHandleDrag.pointerId) return;
            const mapped = getMappedPointFromEvent(ev);
            if (!mapped) return;
            armCanvasClickSuppress(ev);
            applyBezierGuideDragPoint(mapped);
            showHoverMarker(mapped);
            return;
        }
        if (updateViewBoxSelecting(ev)) {
            ev.preventDefault();
            return;
        }
        if (bezierCreateState) {
            const state = bezierCreateState;
            const mapped = getMappedPointFromEvent(ev);
            if (!mapped) {
                if (state.pointerId === null) setBezierCreatePreviewArmed(false);
                else hideHoverMarker();
                return;
            }
            if (state.pointerId === null && !ev.ctrlKey) {
                state.lastMapped = { x: mapped.x, y: mapped.y, z: mapped.z };
                if (state.previewArmed) setBezierCreatePreviewArmed(false);
                else hideHoverMarker();
                return;
            }
            state.previewArmed = true;
            armCanvasClickSuppress(ev);
            updateBezierCreateHover(mapped);
            return;
        }
        const modeActive = !!(linePickMode || pointPickMode || offsetMode || rotateMode || bezierCreateState);
        if (_rDown) {
            const d = Math.hypot(ev.clientX - _rDownX, ev.clientY - _rDownY);
            if (d > 6) _rMoved = true; // 视为拖动
            hideHoverMarker();
            if (linePickMode) hideLinePickPreview();
            if (pointPickMode) hidePointPickPreview();
            return;
        }
        if (!modeActive) return;
        if (!renderer || !camera) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(mouse, camera);
        let mapped = null;
        if (offsetMode && offsetConstraintVector && offsetRefPoint) {
            mapped = mapOffsetPointFromRay(raycaster.ray);
        } else if (lockPlaneActive && lockPlaneBasePoint && shouldApplyLockPlane()) {
            mapped = mapPickPointLockedFromRay(raycaster.ray);
        } else {
            const particle = getParticleSnapFromEvent(ev);
            const hit = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(pickPlane, hit)) {
                mapped = mapPickPoint(hit, particle);
            }
        }
        if (mapped && transformConstraintOperation) mapped = constrainTransformPoint(mapped);
        if (mapped) {
            updatePickHoverFromMapped(mapped, ev.pointerId, ev);
            lastPickBasePoint = mapped ? {x: mapped.x, y: mapped.y, z: mapped.z} : null;
            lastPickMappedPoint = mapped ? {x: mapped.x, y: mapped.y, z: mapped.z} : null;
        } else {
            updatePickHoverFromMapped(null, ev.pointerId, ev);
            lastPickBasePoint = null;
            lastPickMappedPoint = null;
        }
    }

    function onPointerUp(ev) {
        rememberPointPickMenuAnchor(ev);
        endActionMenuRightTrack(ev);
        if (bezierNodeMoveDrag && ev && ev.button === 0 && ev.pointerId === bezierNodeMoveDrag.pointerId) {
            finishBezierNodeMoveDrag(ev);
            return;
        }
        if (bezierHandleDrag && ev && ev.button === 0 && ev.pointerId === bezierHandleDrag.pointerId) {
            cancelBezierHandleDrag(ev, { suppressClick: true });
            return;
        }
        if (bezierCreateState && ev && ev.button === 0 && ev.pointerId === bezierCreateState.pointerId) {
            finishBezierCreateDrag(ev);
            return;
        }
        if (finishViewBoxSelection(ev)) return;
        if (viewBoxPending && ev && ev.pointerId === viewBoxPending.pointerId) {
            clearViewBoxState(ev.pointerId);
        }
        const modeActive = !!(linePickMode || pointPickMode || offsetMode || rotateMode);
        if (rotateMode && ev && ev.button === 0 && rotateDragPointerId !== null && ev.pointerId === rotateDragPointerId) {
            rotateDragPointerId = null;
            rotateDragStartPoint = null;
            const changed = !!rotateDragChanged;
            rotateDragChanged = false;
            armCanvasClickSuppress(ev);
            if (changed) stopRotateMode({ keepDoneText: true });
            else refreshRotateStatus();
            return;
        }
        if (!_rDown) {
            if (!modeActive) return;
            return;
        }

        _rDown = false;

        // 右键拖动过：这是平移，不算点击，不参与双击取消
        if (_rMoved) {
            _rMoved = false;
            return;
        }

        // 没拖动：算一次“右键点击”
        const now = performance.now();
        const dx = ev.clientX - _rClickX;
        const dy = ev.clientY - _rClickY;
        const dist = Math.hypot(dx, dy);

        if (now - _rClickT < RDBL_MS && dist < RDBL_PX) {
            // ✅ 右键双击取消拾取
            if (linePickMode) stopLinePick();
            if (pointPickMode) stopPointPick();
            if (offsetMode) stopOffsetMode();
            if (rotateMode) stopRotateMode({ silent: true });
            if (bezierCreateState) stopBezierCreate({ keepGuide: true });
            if (!modeActive) {
                hideActionMenu();
                if (typeof clearCardSelectionIds === "function") clearCardSelectionIds();
                if (focusedNodeId) setFocusedNode(null, true);
            }
            _rClickT = 0;
            return;
        }

        // 记录第一次点击
        _rClickT = now;
        _rClickX = ev.clientX;
        _rClickY = ev.clientY;
    }

    function onPointerDown(ev) {
        rememberPointPickMenuAnchor(ev);
        const bezierCtrlCreate = !!(bezierCreateState && ev.button === 0 && ev.ctrlKey);
        if (!bezierCtrlCreate) beginActionMenuRightTrack(ev);
        if (bezierHandleDrag && ev && ev.button !== 0) {
            cancelBezierHandleDrag(ev, { suppressClick: true });
        }
        if (isRightLike(ev) && !bezierCtrlCreate) {
            _rDown = true;
            _rMoved = false;
            _rDownX = ev.clientX;
            _rDownY = ev.clientY;
        }
        if (bezierCreateState) {
            if (ev.button !== 0) {
                if (isRightLike(ev)) return;
                return;
            }
            if (ev.ctrlKey) {
                const target = getFocusedBezierEditContext();
                if (!target || target.node.id !== bezierCreateState.targetNodeId) return;
                const mapped = getMappedPointFromEvent(ev);
                if (!mapped) return;
                setBezierCreatePreviewArmed(true, mapped);
                beginBezierCreateDrag(mapped, ev);
                return;
            }
            const controlHit = pickBezierGuideControlFromEvent(ev);
            if (controlHit?.type === "anchor" && ev.altKey) {
                armCanvasClickSuppress(ev);
                selectBezierGuideNode(controlHit.meta);
                deleteSelectedBezierNode();
                return;
            }
            if (controlHit?.type === "handle") {
                beginBezierHandleDrag(ev, controlHit.meta, { symmetric: !!ev.altKey });
                return;
            }
            const anchorHit = controlHit?.type === "anchor" ? controlHit.meta : null;
            if (anchorHit && bezierCreateState.targetNodeId && bezierCreateState.phase === "pick_next"
                && anchorHit.nodeIndex === 0) {
                const targetCtx = findNodeContextById(bezierCreateState.targetNodeId);
                if (targetCtx?.node && targetCtx.node.kind !== "add_bezier_circle_preset") {
                    historyCapture("bezier_toggle_closed");
                    const params = targetCtx.node.params || (targetCtx.node.params = {});
                    params.closed = !params.closed;
                    if (params.closed) connectBezierClosure(targetCtx.node);
                    rebuildPreviewAndKotlin();
                    renderAll();
                    stopBezierCreate({ keepGuide: true });
                    return;
                }
            }
            if (anchorHit) {
                armCanvasClickSuppress(ev);
                hideActionMenu();
                selectBezierGuideNode(anchorHit, { additive: !!ev.shiftKey });
                beginBezierNodeMoveDrag(ev, anchorHit);
                return;
            }
            beginViewBoxPending(ev);
            return;
        }
        // 非拾取模式：点击/拖动预览主要用于 OrbitControls；选点聚焦由 click 事件处理
        if (!linePickMode && !pointPickMode && !offsetMode && !rotateMode) {
            if (isRightLike(ev)) return;
            if (ev.button === 0) {
                const controlHit = pickBezierGuideControlFromEvent(ev);
                if (controlHit?.type === "anchor") {
                    const bezierNodeHit = controlHit.meta;
                    armCanvasClickSuppress(ev);
                    hideActionMenu();
                    selectBezierGuideNode(bezierNodeHit, { additive: !!ev.shiftKey });
                    if (ev.altKey) {
                        deleteSelectedBezierNode();
                    } else {
                        beginBezierNodeMoveDrag(ev, bezierNodeHit);
                    }
                    return;
                }
                if (controlHit?.type === "handle") {
                    beginBezierHandleDrag(ev, controlHit.meta, { symmetric: !!ev.altKey });
                    return;
                }
            }
            beginViewBoxPending(ev);
            return;
        }

        // ✅ 右键 / Ctrl+Click：不选点，只进入“可能的右键双击取消”判定流程
        if ((linePickMode || pointPickMode || offsetMode || rotateMode) && isRightLike(ev)) {
            return; // 关键：右键永远不选点
        }

        if (rotateMode) {
            if (ev.button !== 0 || ev.ctrlKey) return;
            armCanvasClickSuppress(ev);
            const mapped = getMappedPointFromEvent(ev);
            if (!mapped) return;
            rotateDragPointerId = ev.pointerId;
            rotateDragStartPoint = mapped;
            rotateDragStartDeg = rotateCurrentDeg;
            rotateDragChanged = false;
            rotateManualInput = "";
            ensureHoverMarker();
            setHoverMarkerColor(rotatePointColor.getHex());
            showHoverMarker(mapped);
            refreshRotateStatus();
            return;
        }

        if (offsetMode) {
            if (ev.button !== 0 || ev.ctrlKey) return;
            const mapped = getMappedPointFromEvent(ev);
            if (!mapped) return;
            ev.preventDefault();
            armCanvasClickSuppress(ev);
            applyOffsetAtPoint(mapped);
            return;
        }

        // ✅ 只允许纯左键选点（排除 ctrlKey）
        if (ev.button !== 0 || ev.ctrlKey) return;

        // ✅ 屏蔽随后到来的 click（否则可能清空焦点/误聚焦）
        armCanvasClickSuppress(ev);

        const mapped = getMappedPointFromEvent(ev);
        if (!mapped) return;
        if (pointPickMode) {
            if (typeof pointPickCallback === "function") {
                const cb = pointPickCallback;
                const payload = { x: mapped.x, y: mapped.y, z: mapped.z };
                const callbackOptions = { rotateAfterPick: !!pointPickCallbackRotate };
                stopPointPick();
                try { cb(payload, callbackOptions); } catch (e) { console.warn("point pick callback failed:", e); }
                setTimeout(() => hideLinePickStatus(), 900);
                return;
            }
            let target = pointPickTarget;
            if (target && target.inputs && target.inputs.x && !target.inputs.x.isConnected) {
                setPointPickTarget(null);
                target = null;
            }
            if (!target) {
                target = resolvePointPickTargetOnPick(ev, mapped);
                if (!target) return;
                setPointPickTarget(target);
            }
            applyPointToTarget(mapped);
            stopPointPick();
            setTimeout(() => hideLinePickStatus(), 900);
            return;
        }
        const idx = picked.length; // 0=第一个点, 1=第二个点
        picked.push(mapped);

        addPickMarker(mapped, colorForPickIndex(idx));
        setHoverMarkerColor(colorForPickIndex(picked.length >= 1 ? 1 : 0));
        showHoverMarker(mapped);

        const required = Math.max(2, Number(linePickRequiredPoints) || 2);
        if (picked.length < required) {
            setLinePickStatus(buildLinePickProgressStatus(getPlaneInfo().label));
        } else if (picked.length === required) {
            const list = linePickTargetList || state.root.children;
            const isTriangle = isTrianglePickType();
            historyCapture(isTriangle ? "pick_fill_triangle" : "pick_line_xz");

            let nn;
            if (isTriangle) {
                const a = mapWorldPointToInsertLocalPoint(picked[0], list, linePickInsertIndex, linePickTargetOwnerNode);
                const b = mapWorldPointToInsertLocalPoint(picked[1], list, linePickInsertIndex, linePickTargetOwnerNode);
                const c = mapWorldPointToInsertLocalPoint(picked[2], list, linePickInsertIndex, linePickTargetOwnerNode);
                nn = makeNode("add_fill_triangle", {
                    params: {
                        p1x: a.x, p1y: a.y, p1z: a.z,
                        p2x: b.x, p2y: b.y, p2z: b.z,
                        p3x: c.x, p3y: c.y, p3z: c.z,
                        sampler: 3
                    }
                });
            } else {
                const a = mapWorldPointToInsertLocalPoint(picked[0], list, linePickInsertIndex, linePickTargetOwnerNode);
                const b = mapWorldPointToInsertLocalPoint(picked[1], list, linePickInsertIndex, linePickTargetOwnerNode);
                if (linePickType === "dotted_line") {
                    nn = makeNode("add_dotted_line", {
                        params: {
                            ox: a.x, oy: a.y, oz: a.z,
                            tx: b.x - a.x, ty: b.y - a.y, tz: b.z - a.z,
                            totalCount: 30,
                            dottedCount: 4,
                            emptyStep: 0.3
                        }
                    });
                } else {
                    nn = makeNode("add_line", {
                        params: {sx: a.x, sy: a.y, sz: a.z, ex: b.x, ey: b.y, ez: b.z, count: 30}
                    });
                }
            }

            // ✅ 支持插入位置：如果是从 addBuilder 或某张卡片后进入拾取，则按 insertIndex 插入并可连续插入
            if (linePickInsertIndex === null || linePickInsertIndex === undefined) {
                list.push(nn);
            } else {
                const at = Math.max(0, Math.min(linePickInsertIndex, list.length));
                list.splice(at, 0, nn);
                linePickInsertIndex = at + 1;
            }

            if (isTriangle) {
                setLinePickStatus(`${getPlaneInfo().label} 三角拾取[${linePickTargetLabel}]：已添加 addFillTriangle（可在卡片里改 sampler）`);
            } else if (linePickType === "dotted_line") {
                setLinePickStatus(`${getPlaneInfo().label} 虚线拾取[${linePickTargetLabel}]：已添加 addDottedLine（可在卡片里改 totalCount / dottedCount / emptyStep）`);
            } else {
                setLinePickStatus(`${getPlaneInfo().label} 拾取模式[${linePickTargetLabel}]：已添加 addLine（可在卡片里改 count）`);
            }
            picked = [];
            linePickMode = false;
            // 退出拾取时清掉插入点；聚焦保留由 keepId 处理
            linePickInsertIndex = null;
            linePickType = "line";
            linePickRequiredPoints = 2;
            setTimeout(() => hideLinePickStatus(), 900);
            hideHoverMarker();
            clearPickMarkers();
            hideLinePickPreview();
            const keepId = linePickKeepFocusId;
            renderAll();
            // 用户要求：若进入拾取前聚焦在 addBuilder，则拾取新增后仍保持聚焦在原卡片上
            if (keepId) {
                requestAnimationFrame(() => {
                    suppressFocusHistory = true;
                    const el = elCardsRoot.querySelector(`.card[data-id="${keepId}"]`);
                    if (el) {
                        try { el.focus(); } catch {}
                        try { el.scrollIntoView({ block: "nearest" }); } catch {}
                        setFocusedNode(keepId, false);
                    }
                suppressFocusHistory = false;
                });
            }
        }
    }

    // -------------------------
    // UI render
    // -------------------------
    let rebuildTimer = null;

    function rebuildPreviewAndKotlin() {
        if (rebuildTimer) cancelAnimationFrame(rebuildTimer);
        rebuildTimer = requestAnimationFrame(() => {
            syncAllBuilderSnapshotEdits();
            const scopeCtx = (typeof getCurrentCardScopeContext === "function") ? getCurrentCardScopeContext() : null;
            const previewNodes = (scopeCtx && Array.isArray(scopeCtx.list)) ? scopeCtx.list : state.root.children;
            const res = evalBuilderWithMeta(previewNodes, U.v(0, 1, 0));
            nodePointSegments = res.segments;
            pointOwnerByIndex = buildPointOwnerByIndex(res.points.length, res.segments);
            const geometryCenters = collectGeometryCenterPreviewPoints(scopeCtx);
            setPoints(res.points, res.previewPoints || [], geometryCenters, res.maskPreviewPoints || []);
            // setPoints 内部会根据 focusedNodeId 重新上色
            kotlinDirty = true;
            if (realtimeKotlin) scheduleKotlinOut();
            scheduleAutoSave();
        });
    }

    function renderAll() {
        cleanupUnreferencedBuilderSnapshots();
        if (activeParameterizedInstanceNodeId
            && !findNodeContextById(activeParameterizedInstanceNodeId)?.node) {
            closePresetRingTool();
        }
        ensureUniqueNodeIds(state.root);
        referenceGuideController?.sync?.();
        if (activeBuilderColumn === "guides") referenceGuideController?.renderPanel?.();
        // 保持选中卡片：用于高亮 & 插入规则（addBuilder 内新增等）
        applyCollapseAllStates();
        renderCards();
        scheduleParamEditorRender();
        if (paramSync && paramSync.open && typeof renderSyncMenu === "function") renderSyncMenu();
        applyParamStepToInputs();
        // 如果选中的卡片已不存在，则清空
        if (focusedNodeId && !linePickMode) {
            const ctx = findNodeContextById(focusedNodeId);
            if (!ctx) focusedNodeId = null;
        }
        updateBezierGuidePreview();
        rebuildPreviewAndKotlin();
    }

    const pickerModule = createPickerModule({
        settingsModal,
        settingsMask,
        modal,
        modalMask,
        btnCloseModal, 
        btnCancelModal,
        cardPicker,
        cardSearch,
        KIND,
        getHotkeys: () => hotkeys,
        hotkeyToHuman,
        openHotkeysModal,
        beginHotkeyCapture,
        getPresetList: () => getPresetList(),
        startPresetPick,
        previewPreset,
        clearPresetPreview,
        bindPresetPointerApplyDrag,
        shouldSuppressPresetClick: () => Date.now() < presetPointerDragClickSuppressUntil,
        beginPresetDragFromPicker: (preset) => {
            const id = preset && preset.id ? preset.id : "";
            if (!id) return;
            draggingPresetId = id;
            isDraggingCard = true;
        },
        endPresetDragFromPicker: () => {
            clearPresetDragLockPlane();
            draggingPresetId = "";
            isDraggingCard = false;
            clearPresetPreview();
            hidePresetDragPointMarker();
            hideHoverMarker();
            clearPresetDragPlacementStatus();
        },
        getState: () => state,
        makeNode,
        historyCapture,
        ensureAxisEverywhere,
        findNodeContextById,
        renderAll,
        focusCardById,
        onNodeCreated: handleCreatedNodeFromPicker,
        isBuilderContainerKind,
        getFocusedNodeId: () => focusedNodeId,
        getCardSelectionIds: () => (typeof getCardSelectionIds === "function" ? getCardSelectionIds() : null),
        getCurrentCardScopeContext: () => (typeof getCurrentCardScopeContext === "function" ? getCurrentCardScopeContext() : null),
        setSuppressFocusHistory: (v) => { suppressFocusHistory = !!v; }
    });
    const {
        showSettingsModal,
        hideSettingsModal,
        showModal,
        hideModal,
        openModal,
        openPresetPicker,
        getInsertContextFromFocus,
        addKindInContext
    } = pickerModule;

      const cardSystem = initCardSystem({
          KIND,
        elCardsRoot,
        renderCardParamsInline: false,
        row,
        inputNum,
        select,
        checkbox,
        makeVec3Editor,
        angleInput,
        setTipKind,
        historyCapture,
        rebuildPreviewAndKotlin,
        openModal,
        mirrorCopyNode,
        copyFocusedCard,
        mirrorCopyFocusedCard,
        cloneNodeDeep,
        cloneNodeListDeep,
        makeNode,
        ensureAxisEverywhere,
        ensureAxisInList,
        isBuilderContainerKind,
        showToast,
        pickReasonableFocusAfterDelete,
        bindCardBodyResizer,
        bindSubblockWidthResizer,
        bindSubblockHeightResizer,
        handleBuilderDrop,
        tryCopyWithBuilderIntoAddWith,
        moveNodeById,
        moveNodesByIds,
        downloadText,
        deepClone,
        fileBuilderJson,
        stopLinePick,
        startLinePick,
        stopPointPick,
        startPointPickForVecTarget,
        startOffsetMode,
        connectBezierClosure,
        deleteBezierNodeAt: (nodeId, index) => deleteBezierNodes(nodeId, [index]),
        clearEmptyBuilderCards,
        uid,
        getState: () => state,
        getRenderAll: () => renderAll,
        getFocusedNodeId: () => focusedNodeId,
        setFocusedNode,
        clearFocusedNodeIf,
        updateFocusCardUI,
        getIsRenderingCards: () => isRenderingCards,
        setIsRenderingCards: (v) => { isRenderingCards = v; },
        getSuppressCardFocusOutClear: () => suppressCardFocusOutClear,
        getMirrorPlaneInfo,
        getMirrorPlane: () => ({ plane: mirrorPlane, offset: mirrorPlaneOffset }),
        getVisibleEntries: () => getVisibleEntries,
        getCleanupFilterMenus: () => cleanupFilterMenus,
        getIsFilterActive: () => isFilterActive,
        getFindVisibleSwapIndex: () => findVisibleSwapIndex,
        getSwapInList: () => swapInList,
        getCreateFilterControls: () => createFilterControls,
        getCreateParamSyncControls: () => createParamSyncControls,
        getParamSync: () => paramSync,
        getIsSyncSelectableEvent: () => isSyncSelectableEvent,
        getToggleSyncTarget: () => toggleSyncTarget,
        getSetSyncTargetsByIds: () => setSyncTargetsByIds,
        getBuilderJsonTargetNode: () => builderJsonTargetNode,
        setBuilderJsonTargetNode: (node) => { builderJsonTargetNode = node; },
        findNodeContextById,
        findNodePathById,
          getLinePickMode: () => linePickMode,
          getPointPickMode: () => pointPickMode,
        getAutoSelectCompleteGroups: () => autoSelectCompleteGroups,
        getBuilderSnapshot: (id) => ensureBuilderSnapshotState()[String(id || "")] || null,
          openParameterizedInstanceEditor,
          renderEffectRingParams,
          renderBuilderReferenceVariables,
          changeBuilderReferenceId,
          reconstructBuilderReference,
          setBuilderReferenceInstanceMode,
          setDraggingState: (v) => { isDraggingCard = !!v; },
          onCardSelectionChange: () => {
              updateFocusColors();
              if (rightPanelPage === "params") scheduleParamEditorRender();
          },
          syncCardCollapseUI,
          isCollapseAllActive,
          getCollapseScope,
          collapseAllInScope,
        expandAllInScope
    });
    ({
        renderCards,
        renderParamsEditors,
        layoutActionOverflow,
        initCollapseAllControls,
        setupListDropZone,
        addQuickOffsetTo,
        navigateCardScope,
        revealCardScopeById,
        getCurrentCardScopeContext,
        formatNodePathLabel,
        beginRenameNode,
        getSelectedNodeIds: getCardSelectionIds,
        setSelectedNodeIds: setCardSelectionIds,
        clearSelectedNodeIds: clearCardSelectionIds
    } = cardSystem);
    if (typeof setCardSelectionIds === "function") {
        const rawSetCardSelectionIds = setCardSelectionIds;
        setCardSelectionIds = (ids, options = {}) => {
            if (!(options && options.keepPointSelection === true)) clearViewBoxPointSelection();
            if (!(options && options.keepBezierNodeSelection === true)) clearBezierNodeSelection({ refresh: false });
            return rawSetCardSelectionIds(ids, options);
        };
    }
    if (typeof clearCardSelectionIds === "function") {
        const rawClearCardSelectionIds = clearCardSelectionIds;
        clearCardSelectionIds = (...args) => {
            clearViewBoxPointSelection();
            clearBezierNodeSelection({ refresh: false });
            return rawClearCardSelectionIds(...args);
        };
    }

    const filterSystem = initFilterSystem({
        KIND,
        showToast,
        elCardsRoot,
        deepClone,
        findNodeContextById,
        renderCards: () => renderCards(),
        rebuildPreviewAndKotlin: () => rebuildPreviewAndKotlin(),
        renderParamsEditors: (...args) => renderParamsEditors(...args),
        onSyncSelectionChange: () => updateFocusColors()
    });
    ({
        getFilterScope,
        saveRootFilter,
        isFilterActive,
        filterAllows,
        getVisibleEntries,
        getVisibleIndices,
        swapInList,
        findVisibleSwapIndex,
        cleanupFilterMenus,
        createFilterControls,
        createParamSyncControls,
        renderSyncMenu,
        bindParamSyncListeners,
        isSyncSelectableEvent,
        toggleSyncTarget,
        setSyncTargetsByIds,
        setSyncEnabled,
        paramSync
    } = filterSystem);

    initGlobalShortcuts({
        handleHotkeyCaptureKeydown,
        btnSaveJson,
        getRotateMode: () => rotateMode,
        stopRotateMode,
        getOffsetMode: () => offsetMode,
        stopOffsetMode,
        openPresetPicker,
        openPresetRingTool,
        hkModal,
        hideHotkeysModal,
        settingsModal,
        hideSettingsModal,
        modal,
        hideModal,
        getParamSync: () => paramSync,
        setSyncEnabled,
        handleRotateModeManualInputKeydown,
        hotkeyMatchEvent,
        getHotkeys: () => hotkeys,
        historyUndo,
        historyRedo,
        isArrowKey,
        shouldIgnoreArrowPan,
        panKeyState,
        shouldIgnorePlainHotkeys: () => {
            if (!shouldIgnorePlainHotkeys || !shouldIgnorePlainHotkeys()) return false;
            return true;
        },
        isPresetDragActive: () => !!draggingPresetId,
        isBezierHandleDragActive: () => !!bezierHandleDrag,
        cardSearch,
        normalizeHotkey,
        deleteSelectedCards,
        deleteFocusedCard,
        getInsertContextFromFocus,
        isBuilderContainerKind,
        openModal,
        showSettingsModal,
        togglePreviewDistanceMeasure: () => {
            if (previewDistanceTool) previewDistanceTool.toggleMeasureMode();
        },
        toggleFullscreen,
        resetCameraToPoints,
        triggerImportJson,
        chkSnapGrid,
        chkSnapParticle,
        getSnapGridKeyToggleMode,
        getSnapParticleKeyToggleMode,
        setLockPlaneActive,
        getLinePickMode: () => linePickMode,
        getLinePickType: () => linePickType,
        stopLinePick,
        getPointPickMode: () => pointPickMode,
        stopPointPick,
        cancelPointPick,
        confirmPointPickDefault,
        startLinePick,
        startDottedLinePick,
        startTrianglePick,
        startPointPick,
        startLocalRotateForTargetIds,
        togglePointPickCallbackRotate,
        startPresetPickById,
        beginPresetItemRenameById,
        beginPresetGroupRename,
        isDefaultPresetGroup,
        startBezierCreate,
        startBezierRotateMode,
        getBezierCreateState: () => bezierCreateState,
        stopBezierCreate,
        getSelectedBezierNode: () => bezierSelectedNode,
        deleteSelectedBezierNode,
        setSnapPlane,
        setMirrorPlane,
        copyFocusedCard,
        mirrorCopyFocusedCard,
        copySelectedReferenceGuide,
        mirrorCopySelectedReferenceGuide,
        deleteSelectedReferenceGuide,
        getFocusedNodeId: () => focusedNodeId,
        getCardSelectionIds: () => (typeof getCardSelectionIds === "function" ? getCardSelectionIds() : null),
        focusCardById,
        beginRenameNode,
        addRotateForTargetIds,
        setOffsetAxisConstraint,
        setTransformAxisConstraint,
        getTransformConstraintOperation: () => transformConstraintOperation,
        cancelActiveTransformOperation,
        resetOffsetForTargetIds,
        resetOffsetForGuideId,
        startOffsetMode,
        getSelectedReferenceGuideId: () => referenceGuideController?.getSelectedGuideId?.() || "",
        addKindInContext,
        hideActionMenu,
        onWindowBlurCleanup: () => {
            actionMenuRightTrack = null;
            suppressActionMenuUntil = 0;
            const pid = viewBoxPending ? viewBoxPending.pointerId : null;
            clearViewBoxState(pid);
        },
        getIsModalOpen: () => !!(modal && !modal.classList.contains("hidden")),
        getIsHotkeysOpen: () => !!(hkModal && !hkModal.classList.contains("hidden")),
        getIsSettingsOpen: () => !!(settingsModal && !settingsModal.classList.contains("hidden"))
    });

    function triggerImportJson() {
        if (focusedNodeId) {
            const ctx = findNodeContextById(focusedNodeId);
            if (ctx && ctx.node && isBuilderContainerKind(ctx.node.kind)) {
                builderJsonTargetNode = ctx.node;
                fileBuilderJson && fileBuilderJson.click();
                return;
            }
        }
        fileJson && fileJson.click();
    }

    bindPresetLibraryControls();
    bindRightPanelTabs();

    if (new URLSearchParams(window.location.search || "").get("pb_debug") === "1") {
        globalThis.__pointsBuilderDebug = Object.freeze({
            getState: () => state,
            getPresetList: () => getPresetList(),
            applyPresetAtPoint,
            saveCurrentAsPreset,
            importPresetPayload,
            normalizePresetList,
            getPresetEffectiveVariableInfo,
            clonePresetWithVariableValues
        });
    }

    const initialAutoStateJson = safeStringifyState(state);
    initTopbarAndBoot({
        btnExportKotlin,
        btnExportKotlin2,
        btnToggleKotlin,
        btnCopyKotlin,
        btnCopyKotlin2,
        selKotlinEnd,
        inpProjectName,
        inpParamStep,
        inpSnapStep,
        inpRotateSnapDeg,
        inpSnapParticleRange,
        inpOffsetPreviewLimit,
        btnHotkeys,
        btnSnapRenderSettings,
        btnCloseSettings,
        settingsMask,
        btnAddCard,
        btnQuickOffset,
        btnClearEmptyAddBuilder,
        btnClearEmptyAddWith,
        btnPickLine,
        btnPickTriangle,
        btnPickPoint,
        btnLocalRotate,
        btnFullscreen,
        btnSavePreset,
        btnApplyPreset,
        btnOpenPresetRingToolMenu,
        btnExportPresets,
        btnImportPresets,
        btnEditVariables,
        btnSaveJson,
        btnLoadJson,
        fileJson,
        fileBuilderJson,
        filePresetJson,
        btnReset,
        elCardsRoot,
        chkRealtimeKotlin,
        chkPointPickPreview,
        inpLineDivisionPoints,
        showSettingsModal,
        hideSettingsModal,
        getInsertContextFromFocus,
        isBuilderContainerKind,
        openModal,
        addQuickOffsetTo,
        clearEmptyBuilderCards,
        saveCurrentAsPreset,
        getPresetList,
        getCardSelectionIds: () => (typeof getCardSelectionIds === "function" ? getCardSelectionIds() : null),
        importPresetPayload,
        applyPresetAtPoint,
        resolvePresetForApply,
        openPresetPanel,
        openPresetRingTool,
        exportPresetLibraryZip,
        importPresetDirectory,
        importPresetFile,
        getPresetImportOptions,
        editLocalVariables,
        getLocalVariablesText,
        getState: () => state,
        getFocusedNodeId: () => focusedNodeId,
        findNodeContextById,
        getLinePickMode: () => linePickMode,
        getLinePickType: () => linePickType,
        stopLinePick,
        getRotateMode: () => rotateMode,
        stopRotateMode,
        getPointPickMode: () => pointPickMode,
        stopPointPick,
        startLinePick,
        startTrianglePick,
        startPointPick,
        startLocalRotateForTargetIds,
        toggleFullscreen,
        flushKotlinOut,
        emitKotlin,
        getKotlinRaw: () => kotlinRaw,
        setKotlinOut,
        setKotlinHidden,
        isKotlinHidden,
        makeExportFileName,
        setKotlinEndMode: (v) => { kotlinEndMode = v; },
        saveKotlinEndMode,
        getKotlinEndMode: () => kotlinEndMode,
        getProjectName: () => projectName,
        setProjectName: (v) => { projectName = v; },
        sanitizeFileBase,
        saveProjectName,
        paramStepRef: {
            get value() { return paramStep; },
            set value(v) { paramStep = v; }
        },
        setParamStep,
        applyParamStepToInputs,
        saveSettingsToStorage,
        snapStepRef: {
            get value() { return snapStep; },
            set value(v) { snapStep = v; }
        },
        setSnapStep,
        rotateSnapDegRef: {
            get value() { return rotateSnapDeg; },
            set value(v) { rotateSnapDeg = normalizeRotateSnapDeg(v); }
        },
        setRotateSnapDeg,
        particleSnapRangeRef: {
            get value() { return particleSnapRange; },
            set value(v) { particleSnapRange = v; }
        },
        setParticleSnapRange,
        offsetPreviewLimitRef: {
            get value() { return offsetPreviewLimit; },
            set value(v) { offsetPreviewLimit = v; }
        },
        setOffsetPreviewLimit,
        lineDivisionPointsRef: {
            get value() { return lineDivisionPoints; },
            set value(v) { lineDivisionPoints = normalizeLineDivisionPoints(v); }
        },
        setLineDivisionPoints,
        historyCapture,
        setState: (next) => {
            state = normalizeState(next);
            syncCompositionRegisteredBuilderSnapshots();
        },
        normalizeNodeTree,
        ensureAxisEverywhere,
        ensureAxisInList,
        resetCollapseScopes,
        collapseAllNodes,
        renderAll,
        showToast,
        downloadText,
        loadSettingsFromStorage,
        setRealtimeKotlin,
        setPointPickPreviewEnabled,
        initTheme,
        bindThemeHotkeys,
        bindDragCopyGuards,
        bindActionMenuDismiss,
        bindPointPickMenuAnchorTracking,
        applyLayoutState,
        bindResizers,
        updateKotlinToggleText,
        safeStringifyState,
        getLastSavedStateJson: () => lastSavedStateJson,
        saveAutoState,
        initThree,
        setupListDropZone,
        onCardsContextMenu,
        initCollapseAllControls,
        bindParamSyncListeners,
        refreshHotkeyHints,
        triggerImportJson,
        setBuilderJsonTargetNode: (node) => { builderJsonTargetNode = node; },
        getBuilderJsonTargetNode: () => builderJsonTargetNode
    });

    // localStorage is kept as the fast path, but large point models can exceed
    // its quota. Recover a newer IndexedDB draft only if the user has not
    // edited the freshly loaded state while the asynchronous read was pending.
    void loadLatestAutoStatePayload?.().then?.((record) => {
        if (!record?.state) return;
        if (safeStringifyState(state) !== initialAutoStateJson) return;
        const recoveredJson = safeStringifyState(record.state);
        if (!recoveredJson || recoveredJson === initialAutoStateJson) return;
        state = normalizeState(record.state);
        syncCompositionRegisteredBuilderSnapshots();
        lastSavedStateJson = safeStringifyState(state) || recoveredJson;
        renderAll();
        showToast("已恢复最近一次自动保存", "info");
    }).catch(() => {});
}
initPointsBuilderMain();
