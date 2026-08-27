export function initGlobalShortcuts(ctx = {}) {
    const {
        handleHotkeyCaptureKeydown,
        btnSaveJson,
        getRotateMode,
        stopRotateMode,
        getOffsetMode,
        stopOffsetMode,
        openPresetPicker,
        openPresetRingTool,
        hkModal,
        hideHotkeysModal,
        settingsModal,
        hideSettingsModal,
        modal,
        hideModal,
        getParamSync,
        setSyncEnabled,
        handleRotateModeManualInputKeydown,
        hotkeyMatchEvent,
        getHotkeys,
        historyUndo,
        historyRedo,
        isArrowKey,
        shouldIgnoreArrowPan,
        panKeyState,
        shouldIgnorePlainHotkeys,
        cardSearch,
        normalizeHotkey,
        deleteSelectedCards,
        deleteFocusedCard,
        getInsertContextFromFocus,
        isBuilderContainerKind,
        openModal,
        showSettingsModal,
        togglePreviewDistanceMeasure,
        toggleFullscreen,
        resetCameraToPoints,
        triggerImportJson,
        chkSnapGrid,
        chkSnapParticle,
        getSnapGridKeyToggleMode,
        getSnapParticleKeyToggleMode,
        setLockPlaneActive,
        getLinePickMode,
        getLinePickType,
        stopLinePick,
        getPointPickMode,
        stopPointPick,
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
        setSnapPlane,
        setMirrorPlane,
        copyFocusedCard,
        mirrorCopyFocusedCard,
        getFocusedNodeId,
        getCardSelectionIds,
        focusCardById,
        beginRenameNode,
        addRotateForTargetIds,
        startOffsetMode,
        addKindInContext,
        hideActionMenu,
        onWindowBlurCleanup,
        getIsModalOpen,
        getIsHotkeysOpen,
        getIsSettingsOpen,
        isPresetDragActive
    } = ctx;

    let gridHoldKeyDown = false;
    let gridHoldKeyCode = "";
    let gridHoldActive = false;

    let particleHoldKeyDown = false;
    let particleHoldKeyCode = "";
    let particleHoldActive = false;

    let lockPlaneKeyDown = false;
    let lockPlaneKeyCode = "";

    window.addEventListener("keydown", (e) => {
        // 1) Hotkey capture mode (for settings)
        if (typeof handleHotkeyCaptureKeydown === "function" && handleHotkeyCaptureKeydown(e)) return;

        const hotkeys = (typeof getHotkeys === "function" && getHotkeys()) || { actions: {}, kinds: {} };
        const paramSync = (typeof getParamSync === "function") ? getParamSync() : null;

        const rotateMode = !!(typeof getRotateMode === "function" && getRotateMode());
        const offsetMode = !!(typeof getOffsetMode === "function" && getOffsetMode());
        const linePickMode = !!(typeof getLinePickMode === "function" && getLinePickMode());
        const linePickType = (typeof getLinePickType === "function" && getLinePickType()) || "line";
        const pointPickMode = !!(typeof getPointPickMode === "function" && getPointPickMode());
        const activeVecTarget = (document.activeElement && document.activeElement.__vecTarget) || null;

        const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
        const mod = isMac ? e.metaKey : e.ctrlKey;
        const key = (e.key || "").toLowerCase();
        if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            const target = e.target;
            const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
            const cardEl = target && target.closest ? target.closest(".card[data-id]") : null;
            if (cardEl && typeof beginRenameNode === "function") {
                const cardId = cardEl.dataset.id || "";
                if (cardId) {
                    e.preventDefault();
                    beginRenameNode(cardId, e);
                    return;
                }
            }
            const scopeBar = target && target.closest ? target.closest(".pb-scope-crumb, .pb-scope-bar") : null;
            if (scopeBar) return;
            const presetItem = target && target.closest ? target.closest(".preset-item[data-preset-id]") : null;
            if (presetItem && typeof beginPresetItemRenameById === "function") {
                e.preventDefault();
                if (beginPresetItemRenameById(presetItem.dataset.presetId || "")) return;
            }
            const presetGroup = target && target.closest ? target.closest(".preset-group-head") : null;
            if (presetGroup && typeof beginPresetGroupRename === "function") {
                const group = presetGroup.closest(".preset-group")?.dataset?.group || "";
                if (group && !(typeof isDefaultPresetGroup === "function" && isDefaultPresetGroup(group))) {
                    e.preventDefault();
                    beginPresetGroupRename(group);
                    return;
                }
            }
            let targetId = (typeof getFocusedNodeId === "function") ? getFocusedNodeId() : null;
            if (!targetId && typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) targetId = Array.from(sel)[0] || null;
            }
            if (targetId && typeof beginRenameNode === "function") {
                e.preventDefault();
                if (typeof focusCardById === "function") focusCardById(targetId, false, false, false);
                beginRenameNode(targetId);
            }
            return;
        }
        if (mod && key === "n" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            return;
        }
        if (mod && key === "s" && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            if (btnSaveJson) btnSaveJson.click();
            return;
        }

        // Esc closes modal / hotkeys menu
        if (e.code === "Escape") {
            if (rotateMode) {
                e.preventDefault();
                if (typeof stopRotateMode === "function") stopRotateMode({ silent: true });
                return;
            }
            if (offsetMode) {
                e.preventDefault();
                if (typeof stopOffsetMode === "function") stopOffsetMode();
                return;
            }
            if (hkModal && !hkModal.classList.contains("hidden")) {
                e.preventDefault();
                if (typeof hideHotkeysModal === "function") hideHotkeysModal();
                return;
            }
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                e.preventDefault();
                if (typeof hideSettingsModal === "function") hideSettingsModal();
                return;
            }
            if (modal && !modal.classList.contains("hidden")) {
                e.preventDefault();
                if (typeof hideModal === "function") hideModal();
                return;
            }
            if (paramSync && paramSync.open && typeof setSyncEnabled === "function") {
                e.preventDefault();
                setSyncEnabled(false);
                return;
            }
        }

        if (typeof handleRotateModeManualInputKeydown === "function" && handleRotateModeManualInputKeydown(e)) return;

        // 2) Undo/Redo should work everywhere (including inputs)
        if (hotkeyMatchEvent(e, hotkeys.actions.undo)) {
            e.preventDefault();
            if (typeof historyUndo === "function") historyUndo();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.redo)) {
            e.preventDefault();
            if (typeof historyRedo === "function") historyRedo();
            return;
        }

        // Arrow keys: pan like right-drag (avoid when typing)
        if (isArrowKey(e.code) && !shouldIgnoreArrowPan()) {
            e.preventDefault();
            if (panKeyState) panKeyState[e.code] = true;
            return;
        }

        // ignore plain single-key hotkeys when typing
        const isPlainKey = !(e.ctrlKey || e.metaKey || e.altKey);
        if (
            isPlainKey &&
            typeof isPresetDragActive === "function" &&
            isPresetDragActive() &&
            hotkeyMatchEvent(e, hotkeys.actions.lockPlaneHold)
        ) {
            if (lockPlaneKeyDown && lockPlaneKeyCode === e.code) return;
            lockPlaneKeyDown = true;
            lockPlaneKeyCode = e.code;
            if (typeof setLockPlaneActive === "function") {
                e.preventDefault();
                setLockPlaneActive(true);
            }
            return;
        }
        if (isPlainKey && shouldIgnorePlainHotkeys() && !(activeVecTarget && hotkeyMatchEvent(e, hotkeys.actions.pickPoint))) return;

        // when Add-Card modal is open, avoid triggering kind hotkeys while typing search
        if (modal && !modal.classList.contains("hidden") && document.activeElement === cardSearch && isPlainKey) {
            // allow Esc handled elsewhere
            return;
        }

        // 2.45) Lock plane hold
        if (hotkeyMatchEvent(e, hotkeys.actions.lockPlaneHold)) {
            if (lockPlaneKeyDown && lockPlaneKeyCode === e.code) return;
            lockPlaneKeyDown = true;
            lockPlaneKeyCode = e.code;
            if (typeof setLockPlaneActive === "function") {
                e.preventDefault();
                setLockPlaneActive(true);
            }
            return;
        }

        // 2.5) Delete focused card (plain key)
        // 为了避免“在弹窗里误删卡片”，当任意弹窗打开时不响应删除快捷键
        const isAnyModalOpen = (typeof getIsModalOpen === "function" ? getIsModalOpen() : ((modal && !modal.classList.contains("hidden"))))
            || (typeof getIsHotkeysOpen === "function" ? getIsHotkeysOpen() : (hkModal && !hkModal.classList.contains("hidden")))
            || (typeof getIsSettingsOpen === "function" ? getIsSettingsOpen() : (settingsModal && !settingsModal.classList.contains("hidden")));
        if (!isAnyModalOpen) {
            const ae = document.activeElement;
            const tag = (ae && ae.tagName ? String(ae.tagName).toUpperCase() : "");
            const isTypingField = !!(ae && (tag === "INPUT" || tag === "TEXTAREA" || ae.isContentEditable));
            // 删除快捷键不应该在编辑输入时触发（尤其是 number 输入里的 Backspace）
            if (!isTypingField) {
                const delHk = hotkeys.actions.deleteFocused || "";
                const delMatch = hotkeyMatchEvent(e, delHk)
                    // 兼容：用户默认是 Backspace，但很多键盘会按 Delete
                    || (normalizeHotkey(delHk) === "Backspace" && (e.code === "Delete" || e.code === "Backspace") && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey));
                if (delMatch) {
                    e.preventDefault();
                    if (!(typeof deleteSelectedCards === "function" && deleteSelectedCards())) {
                        if (typeof deleteFocusedCard === "function") deleteFocusedCard();
                    }
                    return;
                }
            }
        }

        // 3) Open picker
        if (hotkeyMatchEvent(e, hotkeys.actions.openPicker)) {
            e.preventDefault();
            // 若快捷键弹窗打开，优先关闭（避免叠窗状态残留）
            if (hkModal && !hkModal.classList.contains("hidden")) {
                if (typeof hideHotkeysModal === "function") hideHotkeysModal();
            }
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                if (typeof hideSettingsModal === "function") hideSettingsModal();
            }
            const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
            const ownerNodeId = (pickCtx && pickCtx.ownerNode && typeof isBuilderContainerKind === "function" && isBuilderContainerKind(pickCtx.ownerNode.kind))
                ? pickCtx.ownerNode.id
                : null;
            if (pickCtx && typeof openModal === "function") {
                openModal(pickCtx.list, pickCtx.insertIndex, pickCtx.label, ownerNodeId);
            }
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.openPresetPicker)) {
            e.preventDefault();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (typeof openPresetPicker === "function") openPresetPicker();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.openPresetRingTool)) {
            e.preventDefault();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (typeof openPresetRingTool === "function") openPresetRingTool();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleSettings)) {
            e.preventDefault();
            const wasHotkeysOpen = !!(hkModal && !hkModal.classList.contains("hidden"));
            if (wasHotkeysOpen && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                if (!wasHotkeysOpen && typeof hideSettingsModal === "function") hideSettingsModal();
            } else if (typeof showSettingsModal === "function") {
                showSettingsModal();
            }
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleFullscreen)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (typeof toggleFullscreen === "function") toggleFullscreen();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.openMeasureTool)) {
            e.preventDefault();
            if (typeof togglePreviewDistanceMeasure === "function") togglePreviewDistanceMeasure();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.resetCamera)) {
            e.preventDefault();
            if (typeof resetCameraToPoints === "function") resetCameraToPoints();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.importJson)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (typeof triggerImportJson === "function") triggerImportJson();
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.toggleParamSync)) {
            e.preventDefault();
            if (paramSync && paramSync.anchor) {
                paramSync.anchor.click();
            } else if (typeof setSyncEnabled === "function") {
                setSyncEnabled(!(paramSync && paramSync.open));
            }
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.toggleFilter)) {
            e.preventDefault();
            const btn = document.querySelector(".panel.left .panel-tools .filter-wrap button");
            if (btn) btn.click();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.toggleSnapGrid)) {
            const toggleMode = (typeof getSnapGridKeyToggleMode === "function") && getSnapGridKeyToggleMode();
            if (toggleMode) {
                e.preventDefault();
                if (!e.repeat && chkSnapGrid) chkSnapGrid.click();
                return;
            }
            e.preventDefault();
            if (gridHoldKeyDown && gridHoldKeyCode === e.code) return;
            gridHoldKeyDown = true;
            gridHoldKeyCode = e.code;
            if (!gridHoldActive) {
                gridHoldActive = true;
                if (chkSnapGrid) chkSnapGrid.click();
            }
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.toggleSnapParticle)) {
            const toggleMode = (typeof getSnapParticleKeyToggleMode === "function") && getSnapParticleKeyToggleMode();
            if (toggleMode) {
                e.preventDefault();
                if (!e.repeat && chkSnapParticle) chkSnapParticle.click();
                return;
            }
            e.preventDefault();
            if (particleHoldKeyDown && particleHoldKeyCode === e.code) return;
            particleHoldKeyDown = true;
            particleHoldKeyCode = e.code;
            if (!particleHoldActive) {
                particleHoldActive = true;
                if (chkSnapParticle) chkSnapParticle.click();
            }
            return;
        }

        // 4) Pick line XZ
        if (hotkeyMatchEvent(e, hotkeys.actions.pickLineXZ)) {
            e.preventDefault();
            // 进入拾取模式前，关闭弹窗，避免鼠标事件被遮罩拦截
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (rotateMode && typeof stopRotateMode === "function") stopRotateMode({ silent: true });

            if (linePickMode && linePickType === "line") {
                if (typeof stopLinePick === "function") stopLinePick();
            } else {
                if (linePickMode && typeof stopLinePick === "function") stopLinePick();
                if (pointPickMode && typeof stopPointPick === "function") stopPointPick();
                const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
                if (pickCtx && typeof startLinePick === "function") startLinePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex, pickCtx.ownerNode || null);
            }
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.pickDottedLineXZ)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (rotateMode && typeof stopRotateMode === "function") stopRotateMode({ silent: true });

            if (linePickMode && linePickType === "dotted_line") {
                if (typeof stopLinePick === "function") stopLinePick();
            } else {
                if (linePickMode && typeof stopLinePick === "function") stopLinePick();
                if (pointPickMode && typeof stopPointPick === "function") stopPointPick();
                const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
                if (pickCtx && typeof startDottedLinePick === "function") startDottedLinePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex, pickCtx.ownerNode || null);
            }
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.pickTriangle)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (rotateMode && typeof stopRotateMode === "function") stopRotateMode({ silent: true });

            if (linePickMode && linePickType === "triangle") {
                if (typeof stopLinePick === "function") stopLinePick();
            } else {
                if (linePickMode && typeof stopLinePick === "function") stopLinePick();
                if (pointPickMode && typeof stopPointPick === "function") stopPointPick();
                const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
                if (pickCtx && typeof startTrianglePick === "function") startTrianglePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex, pickCtx.ownerNode || null);
            }
            return;
        }

        // 4.5) Pick point (fill focused vec3)
        if (hotkeyMatchEvent(e, hotkeys.actions.pickPoint)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (rotateMode && typeof stopRotateMode === "function") stopRotateMode({ silent: true });
            if (pointPickMode) {
                if (typeof stopPointPick === "function") stopPointPick();
            } else {
                if (linePickMode && typeof stopLinePick === "function") stopLinePick();
                if (typeof startPointPick === "function") startPointPick();
            }
            return;
        }

        if (hotkeyMatchEvent(e, hotkeys.actions.pickBezierStartEnd)) {
            e.preventDefault();
            if (modal && !modal.classList.contains("hidden") && typeof hideModal === "function") hideModal();
            if (hkModal && !hkModal.classList.contains("hidden") && typeof hideHotkeysModal === "function") hideHotkeysModal();
            if (settingsModal && !settingsModal.classList.contains("hidden") && typeof hideSettingsModal === "function") hideSettingsModal();
            if (rotateMode && typeof stopRotateMode === "function") stopRotateMode({ silent: true });
            if (linePickMode && typeof stopLinePick === "function") stopLinePick();
            if (pointPickMode && typeof stopPointPick === "function") stopPointPick();
            if (offsetMode && typeof stopOffsetMode === "function") stopOffsetMode();
            if (typeof startBezierCreate === "function") startBezierCreate();
            return;
        }

        // 4.6) Snap plane quick switch
        if (hotkeyMatchEvent(e, hotkeys.actions.snapPlaneXZ)) {
            e.preventDefault();
            if (typeof setSnapPlane === "function") setSnapPlane("XZ");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.snapPlaneXY)) {
            e.preventDefault();
            if (typeof setSnapPlane === "function") setSnapPlane("XY");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.snapPlaneZY)) {
            e.preventDefault();
            if (typeof setSnapPlane === "function") setSnapPlane("ZY");
            return;
        }

        // 4.6.1) Mirror plane quick switch
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorPlaneXZ)) {
            e.preventDefault();
            if (typeof setMirrorPlane === "function") setMirrorPlane("XZ");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorPlaneXY)) {
            e.preventDefault();
            if (typeof setMirrorPlane === "function") setMirrorPlane("XY");
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorPlaneZY)) {
            e.preventDefault();
            if (typeof setMirrorPlane === "function") setMirrorPlane("ZY");
            return;
        }

        // 4.7) Copy focused / mirror copy
        if (hotkeyMatchEvent(e, hotkeys.actions.copyFocused)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            if (typeof copyFocusedCard === "function") copyFocusedCard();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.mirrorCopy)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            if (typeof mirrorCopyFocusedCard === "function") mirrorCopyFocusedCard();
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.triggerFocusedRotate)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            if (typeof togglePointPickCallbackRotate === "function" && togglePointPickCallbackRotate()) {
                return;
            }
            if (offsetMode) {
                if (typeof stopOffsetMode === "function") stopOffsetMode();
                return;
            }
            if (rotateMode) {
                if (typeof stopRotateMode === "function") stopRotateMode({ silent: true });
                return;
            }
            let targetId = (typeof getFocusedNodeId === "function") ? getFocusedNodeId() : null;
            let selectedIds = [];
            if (!targetId && typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) targetId = Array.from(sel)[0] || null;
            }
            if (typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) selectedIds = Array.from(sel).filter(Boolean);
            }
            if (!targetId) return;
            if (typeof focusCardById === "function") focusCardById(targetId, false, false, true);
            if (typeof addRotateForTargetIds === "function") addRotateForTargetIds(selectedIds.length > 1 ? selectedIds : [targetId]);
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.triggerFocusedLocalRotate)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            if (offsetMode) {
                if (typeof stopOffsetMode === "function") stopOffsetMode();
                return;
            }
            if (rotateMode) {
                if (typeof stopRotateMode === "function") stopRotateMode({ silent: true });
                return;
            }
            let targetId = (typeof getFocusedNodeId === "function") ? getFocusedNodeId() : null;
            let selectedIds = [];
            if (!targetId && typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) targetId = Array.from(sel)[0] || null;
            }
            if (typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) selectedIds = Array.from(sel).filter(Boolean);
            }
            if (!targetId) return;
            if (typeof focusCardById === "function") focusCardById(targetId, false, false, true);
            if (typeof startLocalRotateForTargetIds === "function") {
                startLocalRotateForTargetIds(selectedIds.length > 1 ? selectedIds : [targetId]);
            }
            return;
        }
        if (hotkeyMatchEvent(e, hotkeys.actions.triggerFocusedMove)) {
            if ((modal && !modal.classList.contains("hidden")) || (hkModal && !hkModal.classList.contains("hidden"))) return;
            e.preventDefault();
            if (rotateMode) {
                if (typeof stopRotateMode === "function") stopRotateMode({ silent: true });
                return;
            }
            if (offsetMode) {
                if (typeof stopOffsetMode === "function") stopOffsetMode();
                return;
            }
            let targetId = (typeof getFocusedNodeId === "function") ? getFocusedNodeId() : null;
            let selectedIds = [];
            if (!targetId && typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) targetId = Array.from(sel)[0] || null;
            }
            if (typeof getCardSelectionIds === "function") {
                const sel = getCardSelectionIds();
                if (sel && sel.size) selectedIds = Array.from(sel).filter(Boolean);
            }
            if (!targetId) return;
            if (typeof focusCardById === "function") focusCardById(targetId, false, false, true);
            if (selectedIds.length > 1) {
                if (typeof startOffsetMode === "function") startOffsetMode(targetId, { ids: selectedIds });
            } else {
                if (typeof startOffsetMode === "function") startOffsetMode(targetId);
            }
            return;
        }

        // 5) Add specific kind
        for (const [kind, hk] of Object.entries(hotkeys.kinds || {})) {
            if (!hk) continue;
            if (hotkeyMatchEvent(e, hk)) {
                e.preventDefault();
                const pickCtx = (typeof getInsertContextFromFocus === "function") ? getInsertContextFromFocus() : null;
                if (pickCtx && typeof addKindInContext === "function") addKindInContext(kind, pickCtx);
                return;
            }
        }

        for (const [presetId, hk] of Object.entries(hotkeys.presets || {})) {
            if (!hk) continue;
            if (hotkeyMatchEvent(e, hk)) {
                e.preventDefault();
                if (typeof startPresetPickById === "function") startPresetPickById(presetId);
                return;
            }
        }
    }, true);

    window.addEventListener("keyup", (e) => {
        if (isArrowKey(e.code) && panKeyState) {
            panKeyState[e.code] = false;
        }
        if (gridHoldKeyDown && e.code === gridHoldKeyCode) {
            gridHoldKeyDown = false;
            gridHoldKeyCode = "";
            if (gridHoldActive) {
                gridHoldActive = false;
                if (chkSnapGrid) chkSnapGrid.click();
            }
        }
        if (particleHoldKeyDown && e.code === particleHoldKeyCode) {
            particleHoldKeyDown = false;
            particleHoldKeyCode = "";
            if (particleHoldActive) {
                particleHoldActive = false;
                if (chkSnapParticle) chkSnapParticle.click();
            }
        }
        if (lockPlaneKeyDown && e.code === lockPlaneKeyCode) {
            lockPlaneKeyDown = false;
            lockPlaneKeyCode = "";
            if (typeof setLockPlaneActive === "function") {
                setLockPlaneActive(false);
            }
        }
    }, true);

    window.addEventListener("blur", () => {
        if (panKeyState) {
            panKeyState.ArrowUp = false;
            panKeyState.ArrowDown = false;
            panKeyState.ArrowLeft = false;
            panKeyState.ArrowRight = false;
        }
        if (gridHoldKeyDown) {
            gridHoldKeyDown = false;
            gridHoldKeyCode = "";
            if (gridHoldActive) {
                gridHoldActive = false;
                if (chkSnapGrid) chkSnapGrid.click();
            }
        }
        if (particleHoldKeyDown) {
            particleHoldKeyDown = false;
            particleHoldKeyCode = "";
            if (particleHoldActive) {
                particleHoldActive = false;
                if (chkSnapParticle) chkSnapParticle.click();
            }
        }
        if (lockPlaneKeyDown) {
            lockPlaneKeyDown = false;
            lockPlaneKeyCode = "";
            if (typeof setLockPlaneActive === "function") {
                setLockPlaneActive(false);
            }
        }
        if (typeof hideActionMenu === "function") hideActionMenu();
        if (typeof onWindowBlurCleanup === "function") onWindowBlurCleanup();
    });
}
