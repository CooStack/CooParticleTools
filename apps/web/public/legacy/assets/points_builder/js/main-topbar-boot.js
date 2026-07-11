export function initTopbarAndBoot(ctx = {}) {
    const {
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
        getCardSelectionIds,
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
        getState,
        getFocusedNodeId,
        findNodeContextById,
        getLinePickMode,
        getLinePickType,
        stopLinePick,
        getRotateMode,
        stopRotateMode,
        getPointPickMode,
        stopPointPick,
        startLinePick,
        startTrianglePick,
        startPointPick,
        startLocalRotateForTargetIds,
        toggleFullscreen,
        flushKotlinOut,
        emitKotlin,
        getKotlinRaw,
        setKotlinOut,
        setKotlinHidden,
        isKotlinHidden,
        makeExportFileName,
        setKotlinEndMode,
        saveKotlinEndMode,
        getKotlinEndMode,
        getProjectName,
        setProjectName,
        sanitizeFileBase,
        saveProjectName,
        paramStepRef,
        setParamStep,
        applyParamStepToInputs,
        saveSettingsToStorage,
        snapStepRef,
        setSnapStep,
        rotateSnapDegRef,
        setRotateSnapDeg,
        particleSnapRangeRef,
        setParticleSnapRange,
        offsetPreviewLimitRef,
        setOffsetPreviewLimit,
        lineDivisionPointsRef,
        setLineDivisionPoints,
        historyCapture,
        setState,
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
        getLastSavedStateJson,
        saveAutoState,
        initThree,
        setupListDropZone,
        onCardsContextMenu,
        initCollapseAllControls,
        bindParamSyncListeners,
        refreshHotkeyHints,
        triggerImportJson,
        setBuilderJsonTargetNode,
        getBuilderJsonTargetNode
    } = ctx;
    const CLOSE_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

    function doExportKotlin() {
        flushKotlinOut();
    }

    function formatPointInput(point) {
        const p = point && typeof point === "object" ? point : { x: 0, y: 0, z: 0 };
        const x = Number.isFinite(Number(p.x)) ? Number(p.x) : 0;
        const y = Number.isFinite(Number(p.y)) ? Number(p.y) : 0;
        const z = Number.isFinite(Number(p.z)) ? Number(p.z) : 0;
        return `${x}, ${y}, ${z}`;
    }

    function parsePointInput(raw) {
        const parts = String(raw || "").split(/[,，\s]+/).map((it) => Number(it)).filter((it) => Number.isFinite(it));
        if (parts.length < 3) return null;
        return { x: parts[0], y: parts[1], z: parts[2] };
    }

    function choosePreset(message = "选择预设序号") {
        const list = (typeof getPresetList === "function") ? getPresetList() : [];
        if (!list.length) {
            showToast("还没有预设", "error");
            return null;
        }
        const lines = list.map((p, i) => `${i + 1}. ${p.name || "未命名预设"}`);
        const raw = prompt(`${message}：\n${lines.join("\n")}`, "1");
        if (raw === null) return null;
        const idx = Number(raw) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
            showToast("预设序号无效", "error");
            return null;
        }
        return list[idx];
    }

    function getSelectedPresetSourceOptions() {
        if (typeof getCardSelectionIds !== "function") return {};
        const selected = getCardSelectionIds();
        const ids = selected && typeof selected[Symbol.iterator] === "function"
            ? Array.from(selected).map((id) => String(id || "").trim()).filter(Boolean)
            : [];
        return ids.length ? { sourceIds: ids } : {};
    }

    function ensureVariablesModal() {
        let mask = document.getElementById("variablesMask");
        let modal = document.getElementById("variablesModal");
        if (mask && modal) return { mask, modal };
        mask = document.createElement("div");
        mask.id = "variablesMask";
        mask.className = "modal-mask hidden";
        modal = document.createElement("div");
        modal.id = "variablesModal";
        modal.className = "modal hidden";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.innerHTML = `
            <div class="modal-head">
                <div class="modal-title">变量设置</div>
                <button id="btnCloseVariables" class="btn icon" type="button" aria-label="关闭">${CLOSE_ICON_SVG}</button>
            </div>
            <div class="modal-body">
                <div class="variables-layout">
                    <div class="settings-panel variables-panel-list">
                        <div class="settings-panel-title">变量列表</div>
                        <div class="variables-toolbar">
                            <button id="btnAddScalarVariable" class="btn" type="button">添加数值</button>
                            <button id="btnAddVectorVariable" class="btn" type="button">添加 Vec3</button>
                        </div>
                        <div id="variableList" class="variables-list variable-list"></div>
                    </div>
                    <div class="settings-panel variables-panel-editor">
                        <div class="settings-panel-title">变量编辑</div>
                        <div id="variableEditor" class="variables-editor"></div>
                    </div>
                </div>
            </div>
            <div class="modal-foot">
                <button id="btnCancelVariables" class="btn" type="button">取消</button>
                <button id="btnSaveVariables" class="btn primary" type="button">保存</button>
            </div>`;
        document.body.appendChild(mask);
        document.body.appendChild(modal);
        return { mask, modal };
    }

    function parseVariableStateFromText(text) {
        try {
            const obj = JSON.parse(String(text || "{}"));
            if (Array.isArray(obj.items)) return obj.items;
            const items = [];
            if (obj && typeof obj.scalar === "object") {
                for (const [name, value] of Object.entries(obj.scalar)) {
                    items.push({ id: makeVariableId(), type: "scalar", name, value: Number(value) });
                }
            }
            if (obj && typeof obj.vector === "object") {
                for (const [name, value] of Object.entries(obj.vector)) {
                    items.push({ id: makeVariableId(), type: "vector", name, value: value && typeof value === "object" ? value : {} });
                }
            }
            return items;
        } catch {
            return [];
        }
    }

    function makeVariableId() {
        return `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function normalizeVariableName(raw) {
        return String(raw || "").trim().replace(/[^\w$]/g, "_").replace(/^([^A-Za-z_$])/, "_$1");
    }

    function createVariableDraft(type = "scalar", preset = {}) {
        const nextType = type === "vector" ? "vector" : "scalar";
        return {
            id: preset.id || makeVariableId(),
            type: nextType,
            name: String(preset.name || "").trim(),
            value: nextType === "vector"
                ? {
                    x: Number.isFinite(Number(preset.value?.x)) ? Number(preset.value.x) : 0,
                    y: Number.isFinite(Number(preset.value?.y)) ? Number(preset.value.y) : 0,
                    z: Number.isFinite(Number(preset.value?.z)) ? Number(preset.value.z) : 0
                }
                : (Number.isFinite(Number(preset.value)) ? Number(preset.value) : 0)
        };
    }

    function normalizeVariableDraft(items) {
        return (Array.isArray(items) ? items : []).map((item) => createVariableDraft(item?.type || "scalar", item));
    }

    function collectVariablesFromDraft(items) {
        const scalar = {};
        const vector = {};
        for (const item of Array.isArray(items) ? items : []) {
            const name = normalizeVariableName(item?.name);
            if (!name) continue;
            if (String(item?.type || "scalar") === "vector") {
                const v = item.value && typeof item.value === "object" ? item.value : {};
                const x = Number(v.x);
                const y = Number(v.y);
                const z = Number(v.z);
                vector[name] = {
                    x: Number.isFinite(x) ? x : 0,
                    y: Number.isFinite(y) ? y : 0,
                    z: Number.isFinite(z) ? z : 0
                };
            } else {
                const n = Number(item?.value);
                scalar[name] = Number.isFinite(n) ? n : 0;
            }
        }
        return { scalar, vector };
    }

    function openVariablesModal() {
        if (typeof editLocalVariables !== "function" || typeof getLocalVariablesText !== "function") return;
        const { mask, modal } = ensureVariablesModal();
        const listEl = modal.querySelector("#variableList");
        const editorEl = modal.querySelector("#variableEditor");
        const state = normalizeVariableDraft(parseVariableStateFromText(getLocalVariablesText()));
        let activeId = state[0]?.id || null;

        function setActive(id) {
            activeId = id || null;
            render();
        }

        function upsertItem(item) {
            const idx = state.findIndex((it) => it.id === item.id);
            if (idx >= 0) state[idx] = item;
            else state.push(item);
        }

        function removeItem(id) {
            const idx = state.findIndex((it) => it.id === id);
            if (idx < 0) return;
            state.splice(idx, 1);
            if (activeId === id) activeId = state[idx]?.id || state[idx - 1]?.id || state[0]?.id || null;
            render();
        }

        function renderList() {
            if (!listEl) return;
            listEl.innerHTML = "";
            if (!state.length) {
                const empty = document.createElement("div");
                empty.className = "variables-empty";
                empty.textContent = "暂无变量";
                listEl.appendChild(empty);
                return;
            }
            for (const item of state) {
                const row = document.createElement("button");
                row.type = "button";
                row.className = `variable-list-item${item.id === activeId ? " active" : ""}`;
                row.innerHTML = `
                    <span class="variable-list-name"></span>
                    <span class="variable-list-meta"></span>
                    <span class="variable-list-handle">≡</span>`;
                row.querySelector(".variable-list-name").textContent = item.name || "未命名变量";
                row.querySelector(".variable-list-meta").textContent = item.type === "vector" ? "Vec3" : "数值";
                row.addEventListener("click", () => setActive(item.id));
                listEl.appendChild(row);
            }
        }

        function renderEditor() {
            if (!editorEl) return;
            editorEl.innerHTML = "";
            const item = state.find((it) => it.id === activeId) || null;
            if (!item) {
                const empty = document.createElement("div");
                empty.className = "variables-editor-empty";
                empty.textContent = state.length ? "选择左侧变量进行编辑" : "先添加变量";
                editorEl.appendChild(empty);
                return;
            }

            const typeLabel = item.type === "vector" ? "Vec3" : "数值";
            const nameRow = document.createElement("label");
            nameRow.className = "variable-field";
            nameRow.innerHTML = `<span>名称</span><input class="input" type="text" />`;
            const nameInput = nameRow.querySelector("input");
            nameInput.value = item.name || "";
            nameInput.addEventListener("input", () => {
                item.name = nameInput.value;
                renderList();
            });

            const typeRow = document.createElement("label");
            typeRow.className = "variable-field";
            typeRow.innerHTML = `<span>类型</span><select class="input"><option value="scalar">数值</option><option value="vector">Vec3</option></select>`;
            const typeSelect = typeRow.querySelector("select");
            typeSelect.value = item.type;
            typeSelect.addEventListener("change", () => {
                const nextType = typeSelect.value === "vector" ? "vector" : "scalar";
                item.type = nextType;
                if (nextType === "vector") {
                    item.value = {
                        x: Number.isFinite(Number(item.value?.x)) ? Number(item.value.x) : 0,
                        y: Number.isFinite(Number(item.value?.y)) ? Number(item.value.y) : 0,
                        z: Number.isFinite(Number(item.value?.z)) ? Number(item.value.z) : 0
                    };
                } else {
                    const current = item.value && typeof item.value === "object" ? item.value : { x: 0, y: 0, z: 0 };
                    item.value = Number.isFinite(Number(current.x)) ? Number(current.x) : 0;
                }
                render();
            });

            const valueBox = document.createElement("div");
            valueBox.className = item.type === "vector" ? "variable-value-box" : "variable-value-box scalar";
            if (item.type === "vector") {
                valueBox.innerHTML = `
                    <label class="variable-field compact"><span>x</span><input class="input" type="number" step="0.01"/></label>
                    <label class="variable-field compact"><span>y</span><input class="input" type="number" step="0.01"/></label>
                    <label class="variable-field compact"><span>z</span><input class="input" type="number" step="0.01"/></label>`;
                const [xInput, yInput, zInput] = valueBox.querySelectorAll("input");
                xInput.value = Number.isFinite(Number(item.value?.x)) ? Number(item.value.x) : 0;
                yInput.value = Number.isFinite(Number(item.value?.y)) ? Number(item.value.y) : 0;
                zInput.value = Number.isFinite(Number(item.value?.z)) ? Number(item.value.z) : 0;
                const sync = () => {
                    item.value = {
                        x: Number.isFinite(Number(xInput.value)) ? Number(xInput.value) : 0,
                        y: Number.isFinite(Number(yInput.value)) ? Number(yInput.value) : 0,
                        z: Number.isFinite(Number(zInput.value)) ? Number(zInput.value) : 0
                    };
                    renderList();
                };
                xInput.addEventListener("input", sync);
                yInput.addEventListener("input", sync);
                zInput.addEventListener("input", sync);
            } else {
                valueBox.innerHTML = `<label class="variable-field"><span>数值</span><input class="input" type="number" step="0.01"/></label>`;
                const valueInput = valueBox.querySelector("input");
                valueInput.value = Number.isFinite(Number(item.value)) ? Number(item.value) : 0;
                valueInput.addEventListener("input", () => {
                    item.value = Number.isFinite(Number(valueInput.value)) ? Number(valueInput.value) : 0;
                    renderList();
                });
            }

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn danger";
            removeBtn.textContent = "删除";
            removeBtn.addEventListener("click", () => removeItem(item.id));

            const meta = document.createElement("div");
            meta.className = "variables-editor-meta";
            meta.textContent = typeLabel;

            editorEl.append(meta, nameRow, typeRow, valueBox, removeBtn);
            upsertItem(item);
            renderList();
        }

        function render() {
            renderList();
            renderEditor();
        }

        const close = () => {
            mask.classList.add("hidden");
            modal.classList.add("hidden");
        };
        modal.querySelector("#btnCloseVariables").onclick = close;
        modal.querySelector("#btnCancelVariables").onclick = close;
        mask.onclick = close;
        modal.querySelector("#btnAddScalarVariable").onclick = () => {
            const next = createVariableDraft("scalar");
            state.push(next);
            activeId = next.id;
            render();
        };
        modal.querySelector("#btnAddVectorVariable").onclick = () => {
            const next = createVariableDraft("vector");
            state.push(next);
            activeId = next.id;
            render();
        };
        modal.querySelector("#btnSaveVariables").onclick = () => {
            try {
                editLocalVariables(collectVariablesFromDraft(state));
                showToast("变量已保存", "success");
                close();
            } catch (e) {
                showToast(`变量保存失败：${e.message || e}`, "error");
            }
        };
        render();
        mask.classList.remove("hidden");
        modal.classList.remove("hidden");
    }

    function doCopyKotlin() {
        const text = getKotlinRaw() || emitKotlin();
        if (!getKotlinRaw()) setKotlinOut(text);
        navigator.clipboard?.writeText(text);
    }

    function doDownloadKotlin() {
        const text = getKotlinRaw() || emitKotlin();
        if (!getKotlinRaw()) setKotlinOut(text);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = makeExportFileName("kt", "PointsBuilder_Generated");
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    btnExportKotlin?.addEventListener("click", doExportKotlin);
    btnExportKotlin2?.addEventListener("click", doExportKotlin);
    btnToggleKotlin?.addEventListener("click", () => setKotlinHidden(!isKotlinHidden()));
    btnCopyKotlin?.addEventListener("click", doCopyKotlin);
    btnCopyKotlin2?.addEventListener("click", doCopyKotlin);

    if (selKotlinEnd) {
        selKotlinEnd.value = getKotlinEndMode();
        selKotlinEnd.addEventListener("change", () => {
            const mode = selKotlinEnd.value || "builder";
            setKotlinEndMode(mode);
            saveKotlinEndMode(mode);
            flushKotlinOut();
        });
    }

    if (inpProjectName) {
        inpProjectName.value = getProjectName() || "";
        inpProjectName.addEventListener("input", () => {
            const next = sanitizeFileBase(inpProjectName.value || "");
            setProjectName(next);
            saveProjectName(next);
            if (inpProjectName.value !== next) inpProjectName.value = next;
        });
    }

    if (inpParamStep) {
        if (inpParamStep.value === "") inpParamStep.value = String(paramStepRef.value);
        setParamStep(inpParamStep.value, { skipSave: true });
        inpParamStep.addEventListener("input", () => {
            const n = parseFloat(inpParamStep.value);
            if (!Number.isFinite(n) || n <= 0) return;
            paramStepRef.value = n;
            applyParamStepToInputs();
            saveSettingsToStorage();
        });
        inpParamStep.addEventListener("blur", () => {
            setParamStep(inpParamStep.value);
        });
    }

    if (inpSnapStep) {
        if (inpSnapStep.value === "") inpSnapStep.value = String(snapStepRef.value);
        setSnapStep(inpSnapStep.value, { skipSave: true });
        inpSnapStep.addEventListener("input", () => {
            const n = parseFloat(inpSnapStep.value);
            if (!Number.isFinite(n) || n <= 0) return;
            snapStepRef.value = n;
            saveSettingsToStorage();
        });
        inpSnapStep.addEventListener("blur", () => {
            setSnapStep(inpSnapStep.value);
        });
    }

    if (inpRotateSnapDeg) {
        if (inpRotateSnapDeg.value === "") inpRotateSnapDeg.value = String(rotateSnapDegRef.value);
        setRotateSnapDeg(inpRotateSnapDeg.value, { skipSave: true });
        inpRotateSnapDeg.addEventListener("input", () => {
            const n = parseFloat(inpRotateSnapDeg.value);
            if (!Number.isFinite(n) || n <= 0) return;
            rotateSnapDegRef.value = n;
            saveSettingsToStorage();
        });
        inpRotateSnapDeg.addEventListener("blur", () => {
            setRotateSnapDeg(inpRotateSnapDeg.value);
        });
    }

    if (inpSnapParticleRange) {
        if (inpSnapParticleRange.value === "") inpSnapParticleRange.value = String(particleSnapRangeRef.value);
        setParticleSnapRange(inpSnapParticleRange.value, { skipSave: true });
        inpSnapParticleRange.addEventListener("input", () => {
            const n = parseFloat(inpSnapParticleRange.value);
            if (!Number.isFinite(n) || n <= 0) return;
            particleSnapRangeRef.value = n;
            saveSettingsToStorage();
        });
        inpSnapParticleRange.addEventListener("blur", () => {
            setParticleSnapRange(inpSnapParticleRange.value);
        });
    }

    if (inpOffsetPreviewLimit) {
        if (inpOffsetPreviewLimit.value === "") inpOffsetPreviewLimit.value = String(offsetPreviewLimitRef.value);
        setOffsetPreviewLimit(inpOffsetPreviewLimit.value, { skipSave: true });
        inpOffsetPreviewLimit.addEventListener("keydown", (ev) => {
            if (ev.key !== "-" && ev.code !== "NumpadSubtract") return;
            ev.preventDefault();
            setOffsetPreviewLimit(-1);
        });
        inpOffsetPreviewLimit.addEventListener("input", () => {
            setOffsetPreviewLimit(inpOffsetPreviewLimit.value);
        });
    }

    if (inpLineDivisionPoints) {
        if (inpLineDivisionPoints.value === "") inpLineDivisionPoints.value = String(lineDivisionPointsRef?.value ?? 0);
        setLineDivisionPoints(inpLineDivisionPoints.value, { skipSave: true });
        inpLineDivisionPoints.addEventListener("input", () => {
            setLineDivisionPoints(inpLineDivisionPoints.value);
        });
        inpLineDivisionPoints.addEventListener("blur", () => {
            setLineDivisionPoints(inpLineDivisionPoints.value);
        });
    }

    const snapRenderPopover = document.getElementById("snapRenderPopover");

    function isSnapRenderPopoverOpen() {
        return !!(snapRenderPopover && !snapRenderPopover.classList.contains("hidden"));
    }

    function positionSnapRenderPopover() {
        if (!snapRenderPopover || !btnSnapRenderSettings) return;
        const margin = 8;
        const rect = btnSnapRenderSettings.getBoundingClientRect();
        const panelRect = snapRenderPopover.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const left = Math.max(margin, Math.min(rect.right - panelRect.width, vw - panelRect.width - margin));
        const top = Math.max(margin, rect.bottom + 8);
        snapRenderPopover.style.left = `${Math.round(left)}px`;
        snapRenderPopover.style.top = `${Math.round(top)}px`;
    }

    function hideSnapRenderPopover() {
        if (!snapRenderPopover) return;
        snapRenderPopover.classList.add("hidden");
        btnSnapRenderSettings?.setAttribute("aria-expanded", "false");
    }

    function showSnapRenderPopover() {
        if (!snapRenderPopover) return;
        snapRenderPopover.classList.remove("hidden");
        btnSnapRenderSettings?.setAttribute("aria-expanded", "true");
        positionSnapRenderPopover();
        requestAnimationFrame(positionSnapRenderPopover);
    }

    function toggleSnapRenderPopover() {
        if (isSnapRenderPopoverOpen()) hideSnapRenderPopover();
        else showSnapRenderPopover();
    }

    if (snapRenderPopover && !snapRenderPopover.__pbSnapRenderPopoverBound) {
        snapRenderPopover.__pbSnapRenderPopoverBound = true;
        document.addEventListener("pointerdown", (ev) => {
            if (!isSnapRenderPopoverOpen()) return;
            const target = ev.target;
            if (snapRenderPopover.contains(target)) return;
            if (btnSnapRenderSettings && btnSnapRenderSettings.contains(target)) return;
            hideSnapRenderPopover();
        }, true);
        window.addEventListener("resize", hideSnapRenderPopover);
        window.addEventListener("scroll", hideSnapRenderPopover, true);
        window.addEventListener("keydown", (ev) => {
            if (ev.code === "Escape") hideSnapRenderPopover();
        }, true);
    }

    btnHotkeys?.addEventListener("click", () => {
        hideSnapRenderPopover();
        showSettingsModal();
    });
    btnSnapRenderSettings?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleSnapRenderPopover();
    });
    btnCloseSettings?.addEventListener("click", hideSettingsModal);
    settingsMask?.addEventListener("click", hideSettingsModal);

    btnAddCard?.addEventListener("click", () => {
        const pickCtx = getInsertContextFromFocus();
        const ownerNodeId = (pickCtx && pickCtx.ownerNode && isBuilderContainerKind(pickCtx.ownerNode.kind)) ? pickCtx.ownerNode.id : null;
        openModal(pickCtx.list, pickCtx.insertIndex, pickCtx.label, ownerNodeId);
    });

    btnQuickOffset?.addEventListener("click", () => {
        const stateObj = getState();
        addQuickOffsetTo(stateObj.root.children);
    });

    btnClearEmptyAddBuilder?.addEventListener("click", () => {
        const removed = (typeof clearEmptyBuilderCards === "function")
            ? clearEmptyBuilderCards("add_builder")
            : 0;
        if (!removed) {
            showToast("没有可清理的空添加组卡片", "info");
            return;
        }
        showToast(`已清理 ${removed} 个空添加组卡片`, "success");
    });

    btnClearEmptyAddWith?.addEventListener("click", () => {
        const removed = (typeof clearEmptyBuilderCards === "function")
            ? clearEmptyBuilderCards("add_with")
            : 0;
        if (!removed) {
            showToast("没有可清理的空旋转嵌套组卡片", "info");
            return;
        }
        showToast(`已清理 ${removed} 个空旋转嵌套组卡片`, "success");
    });

    btnPickLine?.addEventListener("click", () => {
        if (getLinePickMode() && getLinePickType() === "line") stopLinePick();
        else {
            if (getRotateMode()) stopRotateMode({ silent: true });
            if (getLinePickMode()) stopLinePick();
            if (getPointPickMode()) stopPointPick();
            const pickCtx = getInsertContextFromFocus();
            startLinePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex, pickCtx.ownerNode || null);
        }
    });

    btnPickTriangle?.addEventListener("click", () => {
        if (getLinePickMode() && getLinePickType() === "triangle") stopLinePick();
        else {
            if (getRotateMode()) stopRotateMode({ silent: true });
            if (getLinePickMode()) stopLinePick();
            if (getPointPickMode()) stopPointPick();
            const pickCtx = getInsertContextFromFocus();
            startTrianglePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex, pickCtx.ownerNode || null);
        }
    });

    btnPickPoint?.addEventListener("click", () => {
        if (getPointPickMode()) {
            stopPointPick();
        } else {
            if (getRotateMode()) stopRotateMode({ silent: true });
            if (getLinePickMode()) stopLinePick();
            startPointPick();
        }
    });

    btnLocalRotate?.addEventListener("click", () => {
        const selectedIds = [];
        if (typeof getCardSelectionIds === "function") {
            const sel = getCardSelectionIds();
            if (sel && sel.size) selectedIds.push(...Array.from(sel).filter(Boolean));
        }
        if (!selectedIds.length) {
            const focusedId = typeof getFocusedNodeId === "function" ? getFocusedNodeId() : null;
            if (focusedId) selectedIds.push(focusedId);
        }
        if (typeof startLocalRotateForTargetIds === "function") {
            startLocalRotateForTargetIds(selectedIds);
        }
    });

    btnFullscreen?.addEventListener("click", toggleFullscreen);

    btnEditVariables?.addEventListener("click", () => {
        openVariablesModal();
    });

    btnSavePreset?.addEventListener("click", () => {
        if (typeof openPresetPanel === "function") {
            openPresetPanel("save", getSelectedPresetSourceOptions());
            return;
        }
        if (typeof saveCurrentAsPreset !== "function") return;
        const existing = (typeof getPresetList === "function") ? getPresetList() : [];
        const defaultName = getProjectName() || `预设${existing.length + 1}`;
        const name = prompt("预设名字", defaultName);
        if (name === null) return;
        const originRaw = prompt("保存原点 x,y,z", "0, 0, 0");
        if (originRaw === null) return;
        const origin = parsePointInput(originRaw);
        if (!origin) {
            showToast("保存失败：原点格式应为 x,y,z", "error");
            return;
        }
        const overwrite = existing.find((it) => it.name === name);
        if (overwrite && !confirm(`已存在预设“${name}”，是否覆盖？`)) return;
        const preset = saveCurrentAsPreset({ name, origin, overwriteId: overwrite ? overwrite.id : "" });
        if (!preset) {
            showToast("保存预设失败", "error");
            return;
        }
        showToast(`已保存预设：${preset.name}`, "success");
    });

    btnApplyPreset?.addEventListener("click", async () => {
        if (typeof openPresetPanel === "function") {
            openPresetPanel("apply");
            return;
        }
        if (typeof applyPresetAtPoint !== "function" || typeof startPointPick !== "function") return;
        const preset = choosePreset("选择要生成的预设序号");
        if (!preset) return;
        const resolvedPreset = (typeof resolvePresetForApply === "function")
            ? await resolvePresetForApply(preset)
            : preset;
        if (!resolvedPreset) return;
        startPointPick({
            label: `预设 ${resolvedPreset.name || ""}`.trim(),
            onPick: (point) => {
                const ok = applyPresetAtPoint(resolvedPreset, point);
                showToast(ok ? `已生成预设：${resolvedPreset.name}` : "生成预设失败", ok ? "success" : "error");
            }
        });
    });

    btnOpenPresetRingToolMenu?.addEventListener("click", () => {
        if (typeof openPresetRingTool === "function") openPresetRingTool();
    });

    btnExportPresets?.addEventListener("click", async () => {
        if (typeof exportPresetLibraryZip === "function") {
            try {
                const count = await exportPresetLibraryZip();
                showToast(`已导出 ${count} 个预设`, "success");
            } catch (e) {
                if (e && e.name === "AbortError") {
                    showToast("取消导出", "info");
                    return;
                }
                showToast(`导出预设失败：${e.message || e}`, "error");
            }
            return;
        }
        const presets = (typeof getPresetList === "function") ? getPresetList() : [];
        if (!presets.length) {
            showToast("还没有可导出的预设", "error");
            return;
        }
        const payload = {
            type: "pointsbuilder-presets",
            version: 1,
            presets
        };
        downloadText(makeExportFileName("json", "pointsbuilder-presets"), JSON.stringify(payload, null, 2), "application/json");
        showToast("预设导出成功", "success");
    });

    btnImportPresets?.addEventListener("click", async () => {
        filePresetJson?.click();
    });
    filePresetJson?.addEventListener("change", async () => {
        const f = filePresetJson.files && filePresetJson.files[0];
        if (!f) return;
        try {
            const options = (typeof getPresetImportOptions === "function")
                ? getPresetImportOptions()
                : { overwrite: confirm("导入预设：确定=覆盖同名/同ID预设，取消=作为新预设导入") };
            const count = (typeof importPresetFile === "function")
                ? await importPresetFile(f, options)
                : importPresetPayload(JSON.parse(await f.text()), options);
            if (!count) throw new Error("no presets");
            showToast(`已导入 ${count} 个预设`, "success");
        } catch (e) {
            showToast(`导入预设失败：${e.message || e}`, "error");
        } finally {
            filePresetJson.value = "";
        }
    });

    btnSaveJson?.addEventListener("click", async () => {
        const text = JSON.stringify(getState(), null, 2);
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: makeExportFileName("json", "shape"),
                    types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                showToast("保存成功", "success");
                return;
            } catch (e) {
                if (e && e.name === "AbortError") {
                    showToast("取消保存", "error");
                    return;
                }
                console.warn("showSaveFilePicker failed:", e);
                showToast(`保存失败：${e.message || e}`, "error");
                return;
            }
        }
        try {
            downloadText(makeExportFileName("json", "shape"), text, "application/json");
            showToast("保存成功", "success");
        } catch (e) {
            showToast(`保存失败：${e.message || e}`, "error");
        }
    });

    btnLoadJson?.addEventListener("click", () => fileJson?.click());
    fileJson?.addEventListener("change", async () => {
        const f = fileJson.files && fileJson.files[0];
        if (!f) return;
        const text = await f.text();
        try {
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            historyCapture("import_json");
            setState(obj);
            normalizeNodeTree(getState().root);
            ensureAxisEverywhere();
            resetCollapseScopes();
            collapseAllNodes(getState().root.children);
            const rawName = (f.name || "").replace(/\.[^/.]+$/, "");
            const nextName = sanitizeFileBase(rawName || "");
            if (nextName) {
                setProjectName(nextName);
                saveProjectName(nextName);
                if (inpProjectName) inpProjectName.value = nextName;
            }
            renderAll();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            fileJson.value = "";
        }
    });

    fileBuilderJson?.addEventListener("change", async () => {
        const f = fileBuilderJson.files && fileBuilderJson.files[0];
        if (!f) return;
        const target = getBuilderJsonTargetNode();
        try {
            const text = await f.text();
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            if (!target) throw new Error("no target");
            historyCapture("import_add_builder_json");
            target.children = obj.root.children;
            normalizeNodeTree(target.children);
            ensureAxisInList(target.children);
            resetCollapseScopes();
            collapseAllNodes(target.children);
            renderAll();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            setBuilderJsonTargetNode(null);
            fileBuilderJson.value = "";
        }
    });

    btnReset?.addEventListener("click", () => {
        if (!confirm("确定重置全部卡片？")) return;
        historyCapture("reset");
        setState({ root: { id: "root", kind: "ROOT", children: [] } });
        renderAll();
    });

    window.addEventListener("message", (event) => {
        if (event.source !== window.parent) return;
        if (event.origin && event.origin !== window.location.origin) return;
        const command = event.data?.type === "coo-shell-command" ? event.data.command : null;
        const commandType = String(command?.type || "");
        if (commandType === "save-project" || commandType === "save-as-project") {
            btnSaveJson?.click();
        } else if (commandType === "export-kotlin") {
            doDownloadKotlin();
        }
    });
    window.addEventListener("coo-legacy-before-route-leave", () => {
        saveAutoState(getState());
    });

    // -------------------------
    // Boot
    // -------------------------
    loadSettingsFromStorage();
    if (chkRealtimeKotlin) setRealtimeKotlin(chkRealtimeKotlin.checked, { skipSave: true });
    if (chkPointPickPreview) setPointPickPreviewEnabled(chkPointPickPreview.checked, { skipSave: true });
    initTheme();
    bindThemeHotkeys();
    bindDragCopyGuards();
    bindActionMenuDismiss();
    bindPointPickMenuAnchorTracking();
    applyLayoutState(false);
    bindResizers();
    updateKotlinToggleText();
    window.addEventListener("resize", () => applyLayoutState(true));
    window.addEventListener("beforeunload", () => {
        const json = safeStringifyState(getState());
        if (json && json !== getLastSavedStateJson()) saveAutoState(getState());
    });
    initThree();
    setupListDropZone(elCardsRoot, () => getState().root.children, () => null);
    if (elCardsRoot && !elCardsRoot.__pbActionMenuBound) {
        elCardsRoot.__pbActionMenuBound = true;
        elCardsRoot.addEventListener("contextmenu", onCardsContextMenu);
    }
    initCollapseAllControls();
    if (typeof bindParamSyncListeners === "function") bindParamSyncListeners();
    if (typeof refreshHotkeyHints === "function") refreshHotkeyHints();
    renderAll();

    // 给快捷键模块调用（Ctrl/Cmd+O）
    if (typeof triggerImportJson === "function") {
        // keep
    }
}
