export function initHotkeysSystem(ctx) {
    const {
        hkModal,
        hkMask,
        hkSearch,
        hkList,
        hkHint,
        btnSettings,
        btnOpenHotkeys,
        btnCloseHotkeys,
        btnCloseHotkeys2,
        btnHotkeysReset,
        btnHotkeysExport,
        btnHotkeysImport,
        fileHotkeys,
        settingsModal,
        settingsMask,
        showToast,
        downloadText,
        getSettingsPayload,
        applySettingsPayload,
        btnPlay,
        btnPause,
        btnClear,
        btnGen,
        btnCopy,
        btnImportJson,
        btnExportJson,
        btnUndo,
        btnRedo,
        btnFullscreen,
    } = ctx || {};

    const HOTKEY_STORAGE_KEY = "pe_hotkeys_v1";

    const DEFAULT_HOTKEYS = {
        version: 2,
        actions: {
            togglePlay: "Space",
            clearParticles: "KeyC",
            generateKotlin: "KeyG",
            copyKotlin: "Mod+Shift+KeyC",
            importJson: "Mod+KeyO",
            exportJson: "Mod+KeyS",
            openMeasureTool: "KeyM",
            toggleFullscreen: "KeyF",
            undo: "Mod+KeyZ",
            redo: "Mod+Shift+KeyZ",
            openSettings: "KeyH",
            motionSnapPlaneXZ: "KeyA",
            motionSnapPlaneXY: "KeyS",
            motionSnapPlaneZY: "KeyD",
        },
    };

    function normalizeHotkey(hk) {
        if (!hk || typeof hk !== "string") return "";
        const parts = hk.split("+").map(s => s.trim()).filter(Boolean);
        const hasMod = parts.includes("Mod");
        const hasShift = parts.includes("Shift");
        const hasAlt = parts.includes("Alt");
        const main = parts.find(p => p !== "Mod" && p !== "Shift" && p !== "Alt") || "";
        const out = [];
        if (hasMod) out.push("Mod");
        if (hasShift) out.push("Shift");
        if (hasAlt) out.push("Alt");
        if (main) out.push(main);
        return out.join("+");
    }

    function eventToHotkey(e) {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push("Mod");
        if (e.shiftKey) parts.push("Shift");
        if (e.altKey) parts.push("Alt");

        const code = e.code || "";
        const isModifierCode = (
            code === "ShiftLeft" || code === "ShiftRight" ||
            code === "ControlLeft" || code === "ControlRight" ||
            code === "AltLeft" || code === "AltRight" ||
            code === "MetaLeft" || code === "MetaRight"
        );
        if (code && !isModifierCode) parts.push(code);
        return normalizeHotkey(parts.join("+"));
    }

    function hotkeyToHuman(hk) {
        hk = normalizeHotkey(hk);
        if (!hk) return "";
        const parts = hk.split("+");
        const out = parts.map(p => {
            if (p === "Mod") return "Ctrl/Cmd";
            if (p === "Shift") return "Shift";
            if (p === "Alt") return "Alt";
            if (p.startsWith("Key")) return p.slice(3).toUpperCase();
            if (p.startsWith("Digit")) return p.slice(5);
            if (p === "Space") return "Space";
            if (p === "Escape") return "Esc";
            if (p === "Backspace") return "Backspace";
            if (p === "Enter") return "Enter";
            if (p.startsWith("Arrow")) return p.replace("Arrow", "");
            return p;
        });
        return out.join("+");
    }

    function hotkeyMatchEvent(e, hk) {
        hk = normalizeHotkey(hk);
        if (!hk) return false;
        return eventToHotkey(e) === hk;
    }

    function shouldIgnorePlainHotkeys() {
        const isEditableNode = (node) => {
            if (!(node instanceof Element) || typeof node.closest !== "function") return false;
            const tag = (node.tagName || "").toUpperCase();
            if (tag === "INPUT") {
                return true;
            }
            if (tag === "TEXTAREA") {
                if (node.id === "kotlinOutEmitter" && node.readOnly) return false;
                return true;
            }
            if (node.isContentEditable) return true;
            if (node.closest("[role='textbox'], [role='combobox']")) return true;
            if (node.closest(".editor-shell-monaco, .editor-monaco-host, .monaco-editor")) return true;
            if (node.closest(".suggest-widget, .monaco-hover, .monaco-menu-container")) return true;
            return false;
        };
        if (isEditableNode(document.activeElement)) return true;
        if (isEditableNode(document.activeElement?.closest?.(".monaco-editor"))) return true;
        if (document.querySelector(".editor-shell-monaco .monaco-editor.focused")) return true;
        return false;
    }

    function loadHotkeys() {
        try {
            const raw = localStorage.getItem(HOTKEY_STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                const out = {
                    version: 1,
                    actions: Object.assign({}, DEFAULT_HOTKEYS.actions),
                };
                if (obj && typeof obj === "object" && obj.actions && typeof obj.actions === "object") {
                    Object.assign(out.actions, obj.actions);
                }
                for (const k of Object.keys(out.actions)) out.actions[k] = normalizeHotkey(out.actions[k]);
                return out;
            }
        } catch (e) {
            console.warn("loadHotkeys failed:", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
    }

    const hotkeys = loadHotkeys();
    for (const k of Object.keys(DEFAULT_HOTKEYS.actions)) {
        if (!hotkeys.actions[k]) hotkeys.actions[k] = DEFAULT_HOTKEYS.actions[k];
    }

    function refreshHotkeyHints() {
        const togglePlayLabel = hotkeyToHuman(hotkeys.actions.togglePlay || "") || "未设置";
        if (btnPlay) btnPlay.title = `快捷键：${togglePlayLabel}`;
        if (btnPause) btnPause.title = `快捷键：${togglePlayLabel}`;
        if (btnClear) btnClear.title = `快捷键：${hotkeyToHuman(hotkeys.actions.clearParticles || "") || "未设置"}`;
        if (btnGen) btnGen.title = `快捷键：${hotkeyToHuman(hotkeys.actions.generateKotlin || "") || "未设置"}`;
        if (btnCopy) btnCopy.title = `快捷键：${hotkeyToHuman(hotkeys.actions.copyKotlin || "") || "未设置"}`;
        if (btnImportJson) btnImportJson.title = `快捷键：${hotkeyToHuman(hotkeys.actions.importJson || "") || "未设置"}`;
        if (btnExportJson) btnExportJson.title = `快捷键：${hotkeyToHuman(hotkeys.actions.exportJson || "") || "未设置"}`;
        if (btnUndo) btnUndo.title = `快捷键：${hotkeyToHuman(hotkeys.actions.undo || "") || "未设置"}`;
        if (btnRedo) btnRedo.title = `快捷键：${hotkeyToHuman(hotkeys.actions.redo || "") || "未设置"}`;
        if (btnFullscreen) btnFullscreen.title = `快捷键：${hotkeyToHuman(hotkeys.actions.toggleFullscreen || "") || "未设置"}`;
        if (btnSettings) btnSettings.title = "打开设置";
    }

    function saveHotkeys() {
        try {
            localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(hotkeys));
        } catch (e) {
            console.warn("saveHotkeys failed:", e);
        }
        refreshHotkeyHints();
    }

    function resetHotkeys() {
        hotkeys.version = 1;
        hotkeys.actions = Object.assign({}, DEFAULT_HOTKEYS.actions);
        saveHotkeys();
        renderHotkeysList();
    }

    function removeHotkeyConflicts(hk, exceptId = null) {
        hk = normalizeHotkey(hk);
        if (!hk) return;
        for (const [id, v] of Object.entries(hotkeys.actions || {})) {
            if (exceptId && exceptId === id) continue;
            if (normalizeHotkey(v) === hk) hotkeys.actions[id] = "";
        }
    }

    let hotkeyCapture = null;

    const HOTKEY_ACTION_DEFS = [
        {id: "togglePlay", title: "播放 / 暂停预览", desc: "默认 Space"},
        {id: "clearParticles", title: "清空粒子", desc: "默认 C"},
        {id: "generateKotlin", title: "生成 Kotlin", desc: "默认 G"},
        {id: "copyKotlin", title: "复制 Kotlin", desc: "默认 Ctrl/Cmd+Shift+C"},
        {id: "importJson", title: "导入 JSON", desc: "默认 Ctrl/Cmd+O"},
        {id: "exportJson", title: "导出 JSON", desc: "默认 Ctrl/Cmd+S"},
        {id: "openMeasureTool", title: "打开预览测距", desc: "默认 M"},
        {id: "toggleFullscreen", title: "预览区全屏 / 退出", desc: "默认 F"},
        {id: "undo", title: "撤回", desc: "默认 Ctrl/Cmd+Z"},
        {id: "redo", title: "重做", desc: "默认 Ctrl/Cmd+Shift+Z"},
        {id: "openSettings", title: "打开设置", desc: "默认 H"},
        {id: "motionSnapPlaneXZ", title: "关键帧平面 XZ", desc: "默认 A"},
        {id: "motionSnapPlaneXY", title: "关键帧平面 XY", desc: "默认 S"},
        {id: "motionSnapPlaneZY", title: "关键帧平面 ZY", desc: "默认 D"},
    ];

    let _settingsWasOpenWhenHotkeys = false;
    function openHotkeysModal() {
        _settingsWasOpenWhenHotkeys = !!(settingsModal && !settingsModal.classList.contains("hidden"));
        if (_settingsWasOpenWhenHotkeys) {
            try { settingsModal.classList.add("under"); } catch {}
            try { settingsMask && settingsMask.classList.add("under"); } catch {}
        }
        showHotkeysModal();
    }

    function showHotkeysModal() {
        hkModal?.classList.remove("hidden");
        hkMask?.classList.remove("hidden");
        if (hkSearch) {
            hkSearch.value = "";
            renderHotkeysList();
            hkSearch.focus();
        } else {
            renderHotkeysList();
        }
    }

    function hideHotkeysModal() {
        hkModal?.classList.add("hidden");
        hkMask?.classList.add("hidden");
        hotkeyCapture = null;
        if (hkHint) hkHint.textContent = "Esc 关闭 · Backspace/Delete 清空绑定";

        try { settingsModal && settingsModal.classList.remove("under"); } catch {}
        try { settingsMask && settingsMask.classList.remove("under"); } catch {}
        if (_settingsWasOpenWhenHotkeys) {
            _settingsWasOpenWhenHotkeys = false;
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                settingsMask && settingsMask.classList.remove("hidden");
            }
        }
    }

    function beginHotkeyCapture(target) {
        hotkeyCapture = target;
        if (hkHint) hkHint.textContent = `正在设置「${target.title || target.id}」：Esc 取消，Backspace/Delete 清空`;
    }

    function setHotkeyFor(target, hk) {
        if (!target) return;
        removeHotkeyConflicts(hk, target.id);
        hotkeys.actions[target.id] = hk || "";
        saveHotkeys();
        renderHotkeysList();
    }

    function renderHotkeysList() {
        if (!hkList) return;
        const f = (hkSearch && hkSearch.value ? hkSearch.value : "").trim().toLowerCase();
        hkList.innerHTML = "";

        const makeRow = ({title, desc, id, hk}) => {
            const rowEl = document.createElement("div");
            rowEl.className = "hk-row";

            const name = document.createElement("div");
            name.className = "hk-name";
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = title;
            const d = document.createElement("div");
            d.className = "d";
            d.textContent = desc || id;
            name.appendChild(t);
            name.appendChild(d);

            const key = document.createElement("div");
            const human = hotkeyToHuman(hk || "");
            key.className = "hk-key" + (human ? "" : " empty");
            key.textContent = human || "未设置";

            const btns = document.createElement("div");
            btns.className = "hk-btns";

            const bSet = document.createElement("button");
            bSet.className = "btn small primary";
            bSet.textContent = "设置";
            bSet.addEventListener("click", () => beginHotkeyCapture({id, title}));

            const bClr = document.createElement("button");
            bClr.className = "btn small";
            bClr.textContent = "清空";
            bClr.addEventListener("click", () => setHotkeyFor({id, title}, ""));

            btns.appendChild(bSet);
            btns.appendChild(bClr);

            rowEl.appendChild(name);
            rowEl.appendChild(key);
            rowEl.appendChild(btns);
            return rowEl;
        };

        const section = (title) => {
            const s = document.createElement("div");
            s.className = "hk-section";
            const h = document.createElement("div");
            h.className = "hk-section-title";
            h.textContent = title;
            s.appendChild(h);
            return s;
        };

        const s1 = section("动作");
        for (const a of HOTKEY_ACTION_DEFS) {
            const hk = (hotkeys.actions || {})[a.id] || "";
            const text = (a.title + " " + a.desc + " " + hotkeyToHuman(hk)).toLowerCase();
            if (f && !text.includes(f)) continue;
            s1.appendChild(makeRow({title: a.title, desc: a.desc, id: a.id, hk}));
        }
        hkList.appendChild(s1);
    }

    function handleHotkeyCaptureKeydown(e) {
        if (!hkModal || hkModal.classList.contains("hidden") || !hotkeyCapture) return false;
        e.preventDefault();
        e.stopPropagation();

        if (e.code === "Escape") {
            hotkeyCapture = null;
        if (hkHint) hkHint.textContent = "Esc 关闭 · Backspace/Delete 清空绑定";
            renderHotkeysList();
            return true;
        }
        if (e.code === "Backspace" || e.code === "Delete") {
            setHotkeyFor(hotkeyCapture, "");
            hotkeyCapture = null;
        if (hkHint) hkHint.textContent = "Esc 关闭 · Backspace/Delete 清空绑定";
            return true;
        }

        const hk = eventToHotkey(e);
        if (!hk || hk === "Mod" || hk === "Shift" || hk === "Alt" || hk === "Mod+Shift" || hk === "Mod+Alt" || hk === "Shift+Alt" || hk === "Mod+Shift+Alt") {
            return true;
        }
        setHotkeyFor(hotkeyCapture, hk);
        hotkeyCapture = null;
        if (hkHint) hkHint.textContent = "Esc 关闭 · Backspace/Delete 清空绑定";
        return true;
    }

    btnOpenHotkeys && btnOpenHotkeys.addEventListener("click", openHotkeysModal);
    btnCloseHotkeys && btnCloseHotkeys.addEventListener("click", hideHotkeysModal);
    btnCloseHotkeys2 && btnCloseHotkeys2.addEventListener("click", hideHotkeysModal);
    hkMask && hkMask.addEventListener("click", hideHotkeysModal);
    hkSearch && hkSearch.addEventListener("input", renderHotkeysList);

    btnHotkeysReset && btnHotkeysReset.addEventListener("click", () => {
        if (!confirm("确定恢复默认快捷键？")) return;
        resetHotkeys();
    });

    btnHotkeysExport && btnHotkeysExport.addEventListener("click", () => {
        const settings = (typeof getSettingsPayload === "function") ? getSettingsPayload() : null;
        const payload = {
            version: 1,
            hotkeys,
            settings: settings || null
        };
        downloadText && downloadText("settings.json", JSON.stringify(payload, null, 2), "application/json");
    });

    btnHotkeysImport && btnHotkeysImport.addEventListener("click", () => fileHotkeys && fileHotkeys.click());
    fileHotkeys && fileHotkeys.addEventListener("change", async () => {
        const f = fileHotkeys.files && fileHotkeys.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const obj = JSON.parse(text);
            if (!obj || typeof obj !== "object") throw new Error("invalid json");
            const hkObj = (obj.hotkeys && typeof obj.hotkeys === "object")
                ? obj.hotkeys
                : ((obj.actions) ? obj : null);
            if (hkObj) {
                if (!hkObj.actions || typeof hkObj.actions !== "object") hkObj.actions = {};
                hotkeys.version = 1;
                hotkeys.actions = Object.assign({}, DEFAULT_HOTKEYS.actions, hkObj.actions);
                saveHotkeys();
                renderHotkeysList();
            }
            if (obj.settings && typeof applySettingsPayload === "function") {
                applySettingsPayload(obj.settings);
            }
            showToast && showToast("导入成功", "success");
        } catch (e) {
            showToast && showToast(`ʧ-ʽ(${e.message || e})`, "error");
        } finally {
            fileHotkeys.value = "";
        }
    });

    return {
        hotkeys,
        normalizeHotkey,
        hotkeyToHuman,
        hotkeyMatchEvent,
        shouldIgnorePlainHotkeys,
        openHotkeysModal,
        hideHotkeysModal,
        beginHotkeyCapture,
        refreshHotkeyHints,
        handleHotkeyCaptureKeydown
    };
}
