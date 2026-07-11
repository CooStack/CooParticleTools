export function createPickerModule(ctx = {}) {
    const {
        settingsModal,
        settingsMask,
        modal,
        modalMask,
        btnCloseModal,
        btnCancelModal,
        cardPicker,
        cardSearch,
        KIND,
        getHotkeys,
        hotkeyToHuman,
        openHotkeysModal,
        beginHotkeyCapture,
        getState,
        makeNode,
        historyCapture,
        ensureAxisEverywhere,
        findNodeContextById,
        renderAll,
        focusCardById,
        isBuilderContainerKind,
        getFocusedNodeId,
        getCardSelectionIds,
        getCurrentCardScopeContext,
        setSuppressFocusHistory,
        getPresetList,
        startPresetPick,
        previewPreset,
        clearPresetPreview,
        beginPresetDragFromPicker,
        endPresetDragFromPicker,
        bindPresetPointerApplyDrag,
        shouldSuppressPresetClick
    } = ctx;

    let addTarget = { list: null, insertIndex: null, ownerLabel: "主Builder", ownerNodeId: null, keepFocusId: null };
    let pickerMode = "cards";
    const modalTitle = modal ? modal.querySelector(".modal-title") : null;
    const btnModalCardsTab = document.getElementById("btnModalCardsTab");
    const btnModalPresetsTab = document.getElementById("btnModalPresetsTab");

    function showSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.remove("hidden");
        settingsMask.classList.remove("hidden");
    }

    function hideSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.add("hidden");
        settingsMask.classList.add("hidden");
        settingsModal.classList.remove("under");
        settingsMask.classList.remove("under");
    }

    function setPickerMode(mode = "cards", options = {}) {
        pickerMode = mode === "presets" ? "presets" : "cards";
        btnModalCardsTab?.classList.toggle("active", pickerMode === "cards");
        btnModalCardsTab?.setAttribute("aria-selected", pickerMode === "cards" ? "true" : "false");
        btnModalPresetsTab?.classList.toggle("active", pickerMode === "presets");
        btnModalPresetsTab?.setAttribute("aria-selected", pickerMode === "presets" ? "true" : "false");
        if (modalTitle) modalTitle.textContent = pickerMode === "presets" ? "添加预设" : "添加元素";
        if (cardSearch) {
            cardSearch.placeholder = pickerMode === "presets"
                ? "搜索预设：名字 / 分组"
                : "搜索元素：addCircle / rotateTo / Fourier ...";
        }
        if (!options.skipRender) renderPicker(cardSearch ? cardSearch.value : "");
    }

    function showModal(mode = "cards") {
        if (!modal || !modalMask) return;
        // 任何时候打开「添加卡片」都必须是可交互的（不能遗留 under）
        modal.classList.remove("under");
        modalMask.classList.remove("under");
        modal.classList.remove("hidden");
        modalMask.classList.remove("hidden");
        if (cardSearch) {
            cardSearch.value = "";
            setPickerMode(mode, { skipRender: true });
            renderPicker("");
            cardSearch.focus();
        } else {
            setPickerMode(mode, { skipRender: true });
            renderPicker("");
        }
    }

    function hideModal() {
        if (!modal || !modalMask) return;
        modal.classList.add("hidden");
        modalMask.classList.add("hidden");
        // 清理 under 状态，避免下次打开还是模糊不可点
        modal.classList.remove("under");
        modalMask.classList.remove("under");
    }

    function openModal(targetList, insertIndex = null, ownerLabel = "主Builder", ownerNodeId = null, options = {}) {
        // 记录插入目标 + 需要保持的焦点
        addTarget = {
            list: targetList || null,
            insertIndex,
            ownerLabel,
            ownerNodeId: ownerNodeId || null,
            keepFocusId: ownerNodeId || null,
        };
        const mode = options && options.mode === "presets" ? "presets" : "cards";
        showModal(mode);
    }

    function openPresetPicker() {
        openModal(null, null, "主Builder", null, { mode: "presets" });
    }

    function toCompactSearchText(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
    }

    function toAsciiAcronym(text) {
        const raw = String(text || "")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_\-./()+[\]{}]+/g, " ")
            .toLowerCase();
        const words = raw.match(/[a-z0-9]+/g) || [];
        let out = "";
        for (const w of words) {
            if (w) out += w[0];
        }
        return out;
    }

    function findSubsequenceScore(query, target) {
        const q = String(query || "");
        const t = String(target || "");
        if (!q || !t) return Infinity;
        let qi = 0;
        let last = -1;
        let gap = 0;
        for (let i = 0; i < t.length && qi < q.length; i++) {
            if (t[i] !== q[qi]) continue;
            if (last >= 0) gap += (i - last - 1);
            last = i;
            qi++;
        }
        if (qi !== q.length || last < 0) return Infinity;
        // 越靠前、越紧凑，分数越低
        return last * 10 + gap;
    }

    function renderPresetPicker(filterText) {
        if (!cardPicker) return;
        const hotkeys = typeof getHotkeys === "function" ? getHotkeys() : null;
        const presets = (typeof getPresetList === "function" ? getPresetList() : []) || [];
        const f = String(filterText || "").trim().toLowerCase();
        cardPicker.innerHTML = "";
        cardPicker.classList.add("preset-picker");
        cardPicker.classList.remove("card-picker");
        if (typeof clearPresetPreview === "function") clearPresetPreview();

        const shown = presets.filter((preset) => {
            if (!f) return true;
            return `${preset.name || ""} ${preset.group || ""}`.toLowerCase().includes(f);
        });
        if (!shown.length) {
            const empty = document.createElement("div");
            empty.className = "pickitem preset-pick-empty";
            empty.textContent = presets.length ? "没有匹配的预设" : "还没有预设";
            cardPicker.appendChild(empty);
            return;
        }

        for (const preset of shown) {
            const div = document.createElement("div");
            div.className = "pickitem preset-pickitem preset-item";
            div.dataset.presetId = preset.id || "";
            const dragHandle = document.createElement("div");
            dragHandle.className = "handle preset-drag-handle";
            dragHandle.textContent = "≡";
            dragHandle.title = "拖动预设";
            dragHandle.setAttribute("aria-hidden", "true");
            const info = document.createElement("div");
            info.className = "preset-item-info";
            const t = document.createElement("div");
            t.className = "t preset-item-name";
            t.textContent = preset.name || "未命名预设";
            const d = document.createElement("div");
            d.className = "d preset-item-details";
            const group = String(preset.group || "默认分组");
            const count = Array.isArray(preset.children) ? preset.children.length : 0;
            d.textContent = `${group} / ${count} 张卡片`;
            info.appendChild(t);
            info.appendChild(d);
            div.appendChild(dragHandle);
            div.appendChild(info);

            const hk = hotkeys && hotkeys.presets ? (hotkeys.presets[preset.id] || "") : "";
            if (hk) {
                div.classList.add("has-hotkey");
                const bad = document.createElement("div");
                bad.className = "hkbad";
                bad.textContent = hotkeyToHuman ? hotkeyToHuman(hk) : hk;
                div.appendChild(bad);
            }

            if (typeof bindPresetPointerApplyDrag === "function") {
                bindPresetPointerApplyDrag(div, preset, { hideModalOnStart: true });
            }

            const setBtn = document.createElement("button");
            setBtn.className = "sethk btn icon preset-icon-btn";
            setBtn.textContent = "⌨";
            setBtn.title = "设置该预设的快捷键";
            setBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (typeof openHotkeysModal === "function") openHotkeysModal();
                if (typeof beginHotkeyCapture === "function") {
                    beginHotkeyCapture({ type: "preset", id: preset.id, title: preset.name || "未命名预设" });
                }
            });
            div.appendChild(setBtn);

            div.addEventListener("mouseenter", () => {
                if (typeof previewPreset === "function") previewPreset(preset);
            });
            div.addEventListener("focusin", () => {
                if (typeof previewPreset === "function") previewPreset(preset);
            });
            div.addEventListener("mouseleave", () => {
                if (typeof clearPresetPreview === "function") clearPresetPreview();
            });
            div.addEventListener("focusout", () => {
                if (typeof clearPresetPreview === "function") clearPresetPreview();
            });
            div.addEventListener("click", () => {
                if (typeof shouldSuppressPresetClick === "function" && shouldSuppressPresetClick()) return;
                if (typeof clearPresetPreview === "function") clearPresetPreview();
                hideModal();
                if (typeof startPresetPick === "function") startPresetPick(preset);
            });
            cardPicker.appendChild(div);
        }
    }

    function renderPicker(filterText) {
        if (!cardPicker) return;
        if (pickerMode === "presets") {
            renderPresetPicker(filterText);
            return;
        }
        if (typeof clearPresetPreview === "function") clearPresetPreview();
        const f = (filterText || "").trim().toLowerCase();
        const fCompact = toCompactSearchText(filterText);
        cardPicker.innerHTML = "";
        cardPicker.classList.add("card-picker");
        cardPicker.classList.remove("preset-picker");
        const entries = Object.entries(KIND || {}).map(([kind, def], order) => ({ kind, def, order }));

        const shown = [];
        for (const it of entries) {
            if (it.def && it.def.hiddenInPicker) continue;
            const titleRaw = (it.def?.title || it.kind) + "";
            const kindRaw = (it.kind || "") + "";
            const descRaw = (it.def?.desc || "") + "";
            const title = titleRaw.toLowerCase();
            const kind = kindRaw.toLowerCase();
            const desc = descRaw.toLowerCase();
            if (!f) {
                shown.push({ it, group: 0, score: 0, order: it.order });
                continue;
            }

            let best = null;
            const keepBest = (group, score) => {
                if (!Number.isFinite(score)) return;
                if (!best || group < best.group || (group === best.group && score < best.score)) {
                    best = { group, score };
                }
            };

            // 1) 直接前缀/包含匹配（优先）
            if (title.startsWith(f) || kind.startsWith(f)) keepBest(0, 0);
            const tIdx = title.indexOf(f);
            const kIdx = kind.indexOf(f);
            const directIdx = Math.min(tIdx >= 0 ? tIdx : Infinity, kIdx >= 0 ? kIdx : Infinity);
            if (Number.isFinite(directIdx)) keepBest(1, directIdx);

            // 2) 缩写匹配（支持 af -> addFillTriangle / add_fill_triangle）
            if (fCompact) {
                const acrTitle = toAsciiAcronym(titleRaw);
                const acrKind = toAsciiAcronym(kindRaw);
                const acrPrefix = Math.min(
                    acrTitle.startsWith(fCompact) ? 0 : Infinity,
                    acrKind.startsWith(fCompact) ? 0 : Infinity
                );
                if (Number.isFinite(acrPrefix)) keepBest(2, acrPrefix);

                const acrContain = Math.min(
                    acrTitle.indexOf(fCompact) >= 0 ? acrTitle.indexOf(fCompact) : Infinity,
                    acrKind.indexOf(fCompact) >= 0 ? acrKind.indexOf(fCompact) : Infinity
                );
                if (Number.isFinite(acrContain)) keepBest(3, acrContain);

                // 3) 顺序字符匹配（模糊）
                const compactTitle = toCompactSearchText(titleRaw);
                const compactKind = toCompactSearchText(kindRaw);
                const subseqScore = Math.min(
                    findSubsequenceScore(fCompact, compactTitle),
                    findSubsequenceScore(fCompact, compactKind)
                );
                if (Number.isFinite(subseqScore)) keepBest(4, subseqScore);
            }

            // 4) 描述匹配放后
            const dIdx = desc.indexOf(f);
            if (dIdx >= 0) keepBest(5, dIdx);

            if (best) shown.push({ it, group: best.group, score: best.score, order: it.order });
        }

        if (f) {
            shown.sort((a, b) => {
                if (a.group !== b.group) return a.group - b.group;
                if (a.score !== b.score) return a.score - b.score;
                return a.order - b.order;
            });
        } else {
            shown.sort((a, b) => a.order - b.order);
        }

        for (const { it } of shown) {
            const div = document.createElement("div");
            div.className = "pickitem";
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = it.def?.title || it.kind;
            const d = document.createElement("div");
            d.className = "d";
            d.textContent = it.def?.desc || it.kind;
            div.appendChild(t);
            div.appendChild(d);

            // 显示该卡片的快捷键（如果有）
            const hotkeys = typeof getHotkeys === "function" ? getHotkeys() : null;
            const hk = hotkeys && hotkeys.kinds ? (hotkeys.kinds[it.kind] || "") : "";
            if (hk) {
                div.classList.add("has-hotkey");
                const bad = document.createElement("div");
                bad.className = "hkbad";
                bad.textContent = hotkeyToHuman ? hotkeyToHuman(hk) : hk;
                div.appendChild(bad);
            }

            // 在“选择添加”里提供快速设置快捷键
            const setBtn = document.createElement("button");
            setBtn.className = "sethk";
            setBtn.textContent = "⌨";
            setBtn.title = "设置该卡片的快捷键";
            setBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (typeof openHotkeysModal === "function") openHotkeysModal();
                if (typeof beginHotkeyCapture === "function") {
                    beginHotkeyCapture({ type: "kind", id: it.kind, title: it.def?.title || it.kind });
                }
            });
            div.appendChild(setBtn);

            div.addEventListener("click", () => {
                const stateObj = (typeof getState === "function") ? getState() : null;
                const rootList = stateObj && stateObj.root && Array.isArray(stateObj.root.children) ? stateObj.root.children : [];
                const list = addTarget.list || rootList;
                const atRaw = addTarget.insertIndex;
                if (typeof historyCapture === "function") historyCapture("add_" + it.kind);
                const nn = (typeof makeNode === "function") ? makeNode(it.kind) : null;
                if (!nn) return;
                if (atRaw === null || atRaw === undefined) {
                    list.push(nn);
                } else {
                    const at = Math.max(0, Math.min(atRaw, list.length));
                    list.splice(at, 0, nn);
                    // 连续添加时，保持插入点向后移动
                    addTarget.insertIndex = at + 1;
                }
                if (typeof ensureAxisEverywhere === "function") ensureAxisEverywhere();

                // 子 builder 内新增：默认保持聚焦在 addBuilder 上；否则聚焦到新卡片
                const focusAfter = (addTarget.keepFocusId && typeof findNodeContextById === "function" && findNodeContextById(addTarget.keepFocusId))
                    ? addTarget.keepFocusId
                    : nn.id;

                hideModal();
                if (typeof renderAll === "function") renderAll();

                requestAnimationFrame(() => {
                    if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(true);
                    if (typeof focusCardById === "function") focusCardById(focusAfter, false, true);
                    if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(false);
                });
            });
            cardPicker.appendChild(div);
        }
    }

    function getInsertContextFromFocus() {
        const stateObj = (typeof getState === "function") ? getState() : null;
        const rootList = stateObj && stateObj.root && Array.isArray(stateObj.root.children) ? stateObj.root.children : [];

        const resolveCtx = (nodeId) => {
            if (!nodeId || typeof findNodeContextById !== "function") return null;
            const nodeCtx = findNodeContextById(nodeId);
            if (nodeCtx && nodeCtx.node) {
                if (typeof isBuilderContainerKind === "function" && isBuilderContainerKind(nodeCtx.node.kind)) {
                    if (!Array.isArray(nodeCtx.node.children)) nodeCtx.node.children = [];
                    return {
                        list: nodeCtx.node.children,
                        insertIndex: nodeCtx.node.children.length,
                        label: "子Builder",
                        ownerNode: nodeCtx.node
                    };
                }
                // 普通卡片：插到它后面（同一列表）
                const label = nodeCtx.parentNode ? "子Builder" : "主Builder";
                return { list: nodeCtx.parentList, insertIndex: nodeCtx.index + 1, label, ownerNode: nodeCtx.parentNode || null };
            }
            return null;
        };

        const focusedNodeId = (typeof getFocusedNodeId === "function") ? getFocusedNodeId() : null;
        if (focusedNodeId) {
            const resolved = resolveCtx(focusedNodeId);
            if (resolved) return resolved;
        }

        if (typeof getCardSelectionIds === "function") {
            const selected = getCardSelectionIds();
            if (selected && selected.size === 1) {
                const oneId = Array.from(selected)[0];
                const resolved = resolveCtx(oneId);
                if (resolved) return resolved;
            }
        }

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

        return { list: rootList, insertIndex: rootList.length, label: "主Builder", ownerNode: null };
    }

    function addKindInContext(kind, inCtx) {
        const stateObj = (typeof getState === "function") ? getState() : null;
        const rootList = stateObj && stateObj.root && Array.isArray(stateObj.root.children) ? stateObj.root.children : [];
        const list = inCtx?.list || rootList;
        const at = (inCtx && inCtx.insertIndex != null) ? inCtx.insertIndex : list.length;
        if (typeof historyCapture === "function") historyCapture("hotkey_add_" + kind);
        const nn = (typeof makeNode === "function") ? makeNode(kind) : null;
        if (!nn) return;
        const idx = Math.max(0, Math.min(at, list.length));
        list.splice(idx, 0, nn);
        if (typeof ensureAxisEverywhere === "function") ensureAxisEverywhere();
        if (typeof renderAll === "function") renderAll();

        // 若是在 addBuilder 内新增，则保持聚焦在 addBuilder；否则聚焦新卡片
        const focusAfter = (inCtx && inCtx.ownerNode && typeof isBuilderContainerKind === "function" && isBuilderContainerKind(inCtx.ownerNode.kind))
            ? inCtx.ownerNode.id
            : nn.id;
        requestAnimationFrame(() => {
            if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(true);
            if (typeof focusCardById === "function") focusCardById(focusAfter, false, true);
            if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(false);
        });
    }

    btnCloseModal?.addEventListener("click", hideModal);
    btnCancelModal?.addEventListener("click", hideModal);
    modalMask?.addEventListener("click", hideModal);
    cardSearch?.addEventListener("input", () => renderPicker(cardSearch.value));
    btnModalCardsTab?.addEventListener("click", () => {
        if (cardSearch) cardSearch.value = "";
        setPickerMode("cards");
        cardSearch?.focus();
    });
    btnModalPresetsTab?.addEventListener("click", () => {
        if (cardSearch) cardSearch.value = "";
        setPickerMode("presets");
        cardSearch?.focus();
    });

    return {
        showSettingsModal,
        hideSettingsModal,
        showModal,
        hideModal,
        openModal,
        openPresetPicker,
        getInsertContextFromFocus,
        addKindInContext
    };
}
