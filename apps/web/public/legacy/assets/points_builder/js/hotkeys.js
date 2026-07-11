export function initHotkeysSystem(ctx) {
    const {
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
        getSettingsPayload,
        applySettingsPayload,
        getPresetList
    } = ctx || {};

    const HOTKEY_STORAGE_KEY = "pb_hotkeys_v2";

    const DEFAULT_HOTKEYS = {
        version: 13,
        actions: {
            openPicker: "KeyN",
            openPresetPicker: "Shift+KeyP",
            openPresetRingTool: "Shift+KeyH",
            pickLineXZ: "KeyQ",
            pickDottedLineXZ: "Shift+KeyQ",
            pickTriangle: "KeyT",
            pickPoint: "KeyE",
            pickBezierStartEnd: "KeyW",
            openMeasureTool: "KeyM",
            toggleFullscreen: "KeyG",
            resetCamera: "Shift+KeyR",
            importJson: "Shift+KeyN",
            toggleSettings: "KeyH",
            toggleParamSync: "KeyY",
            toggleFilter: "KeyL",
            toggleSnapGrid: "Mod+Space",
            toggleSnapParticle: "Space",
            toggleSnapQuick: "",
            snapPlaneXZ: "KeyA",
            snapPlaneXY: "KeyS",
            snapPlaneZY: "KeyD",
            mirrorPlaneXZ: "Shift+KeyA",
            mirrorPlaneXY: "Shift+KeyS",
            mirrorPlaneZY: "Shift+KeyD",
            lockPlaneHold: "KeyX",
            copyFocused: "Mod+KeyD",
            mirrorCopy: "Mod+Shift+KeyD",
            triggerFocusedMove: "KeyV",
            triggerFocusedRotate: "KeyR",
            triggerFocusedLocalRotate: "KeyF",
            undo: "Mod+KeyZ",
            redo: "Mod+Shift+KeyZ",
            deleteFocused: "Backspace",
        },
        kinds: {},
        presets: {},
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
        const ae = document.activeElement;
        if (!ae) return false;
        const tag = (ae.tagName || "").toUpperCase();
        if (tag === "INPUT") {
            return true;
        }
        if (tag === "TEXTAREA") {
            // 右侧 Kotlin 代码栏只读，但用户希望快捷键（W/Q等）依然可用
            if (ae.id === "kotlinOut" && ae.readOnly) return false;
            return true;
        }
        if (ae.isContentEditable) return true;
        return false;
    }

    function loadHotkeys() {
        try {
            const raw = localStorage.getItem(HOTKEY_STORAGE_KEY);
            if (raw) {
                const obj = JSON.parse(raw);
                const storedVersion = Number(obj && obj.version);
                const out = {
                    version: DEFAULT_HOTKEYS.version,
                    actions: Object.assign({}, DEFAULT_HOTKEYS.actions),
                    kinds: {},
                    presets: {},
                };
                if (obj && typeof obj === "object") {
                    if (obj.actions && typeof obj.actions === "object") {
                        Object.assign(out.actions, obj.actions);
                    }
                    if (obj.kinds && typeof obj.kinds === "object") {
                        out.kinds = Object.assign({}, obj.kinds);
                    }
                    if (obj.presets && typeof obj.presets === "object") {
                        out.presets = Object.assign({}, obj.presets);
                    }
                }
                // normalize
                for (const k of Object.keys(out.actions)) out.actions[k] = normalizeHotkey(out.actions[k]);
                for (const k of Object.keys(out.kinds)) out.kinds[k] = normalizeHotkey(out.kinds[k]);
                for (const k of Object.keys(out.presets)) out.presets[k] = normalizeHotkey(out.presets[k]);

                // v3 migration: preserve custom keys, only move old defaults.
                if (!Number.isFinite(storedVersion) || storedVersion < 3) {
                    if (out.actions.resetCamera === "KeyR") out.actions.resetCamera = "Shift+KeyR";
                    if (out.actions.triggerFocusedMove === "KeyT") out.actions.triggerFocusedMove = "KeyV";
                    if (!out.actions.triggerFocusedRotate) out.actions.triggerFocusedRotate = "KeyR";
                }
                // v5 migration: lockPlaneHold replaces snapVerticalUp/Down
                if (!Number.isFinite(storedVersion) || storedVersion < 5) {
                    if (!out.actions.lockPlaneHold && out.actions.snapVerticalUp) {
                        out.actions.lockPlaneHold = out.actions.snapVerticalUp;
                    }
                }
                // v6 migration: remove legacy "toggle both snaps" default binding.
                if (!Number.isFinite(storedVersion) || storedVersion < 6) {
                    out.actions.toggleSnapQuick = "";
                }
                // v12 migration: fullscreen defaults to G.
                if (out.actions.toggleFullscreen === "KeyF" || out.actions.toggleFullscreen === "Shift+KeyF") out.actions.toggleFullscreen = "KeyG";
                if (!out.actions.triggerFocusedLocalRotate) out.actions.triggerFocusedLocalRotate = "KeyF";
                // v13 migration: ring preset placement defaults to Shift+H.
                if (!out.actions.openPresetRingTool) out.actions.openPresetRingTool = "Shift+KeyH";
                return out;
            }
        } catch (e) {
            console.warn("loadHotkeys failed:", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
    }

    const hotkeys = loadHotkeys();
    // 关键动作快捷键不允许为空（否则用户会出现“按 W/Q 没反应”的体验）
    for (const k of Object.keys(DEFAULT_HOTKEYS.actions)) {
        if (!hotkeys.actions[k]) hotkeys.actions[k] = DEFAULT_HOTKEYS.actions[k];
    }

    function refreshHotkeyHints() {
        // 不改变按钮原始文案，只更新 title 提示
        if (btnAddCard) btnAddCard.title = `快捷键：${hotkeyToHuman(hotkeys.actions.openPicker || "") || "未设置"}`;
        if (btnPickLine) btnPickLine.title = `快捷键：${hotkeyToHuman(hotkeys.actions.pickLineXZ || "") || "未设置"}`;
        if (btnPickTriangle) btnPickTriangle.title = `快捷键：${hotkeyToHuman(hotkeys.actions.pickTriangle || "") || "未设置"}`;
        if (btnPickPoint) btnPickPoint.title = `快捷键：${hotkeyToHuman(hotkeys.actions.pickPoint || "") || "未设置"}`;
        if (btnLocalRotate) btnLocalRotate.title = `本地旋转；快捷键：${hotkeyToHuman(hotkeys.actions.triggerFocusedLocalRotate || "") || "未设置"}`;
        if (btnOpenPresetRingTool) btnOpenPresetRingTool.title = `环形放置；快捷键：${hotkeyToHuman(hotkeys.actions.openPresetRingTool || "") || "未设置"}`;
        if (btnFullscreen) btnFullscreen.title = `快捷键：${hotkeyToHuman(hotkeys.actions.toggleFullscreen || "") || "未设置"}`;
        if (btnResetCamera) btnResetCamera.title = `快捷键：${hotkeyToHuman(hotkeys.actions.resetCamera || "") || "未设置"}`;
        if (btnLoadJson) btnLoadJson.title = `快捷键：${hotkeyToHuman(hotkeys.actions.importJson || "") || "未设置"}`;
        if (btnApplyPreset) btnApplyPreset.title = `快捷键：${hotkeyToHuman(hotkeys.actions.openPresetPicker || "") || "未设置"}`;
        if (btnHotkeys) btnHotkeys.title = `快捷键：${hotkeyToHuman(hotkeys.actions.toggleSettings || "") || "未设置"}`;
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
        hotkeys.version = DEFAULT_HOTKEYS.version;
        hotkeys.actions = Object.assign({}, DEFAULT_HOTKEYS.actions);
        hotkeys.kinds = {};
        hotkeys.presets = {};
        saveHotkeys();
        renderHotkeysList();
    }

    function removeHotkeyConflicts(hk, except = null) {
        hk = normalizeHotkey(hk);
        if (!hk) return;

        // 清理重复绑定（同一个按键只能绑定一个功能）
        for (const [id, v] of Object.entries(hotkeys.actions || {})) {
            if (except && except.type === "action" && except.id === id) continue;
            if (normalizeHotkey(v) === hk) hotkeys.actions[id] = "";
        }
        for (const [kind, v] of Object.entries(hotkeys.kinds || {})) {
            if (except && except.type === "kind" && except.id === kind) continue;
            if (normalizeHotkey(v) === hk) delete hotkeys.kinds[kind];
        }
        for (const [presetId, v] of Object.entries(hotkeys.presets || {})) {
            if (except && except.type === "preset" && except.id === presetId) continue;
            if (normalizeHotkey(v) === hk) delete hotkeys.presets[presetId];
        }
    }

    let hotkeyCapture = null; // {type:"action"|"kind", id:"...", title:"..."}

    const HOTKEY_ACTION_DEFS = [
        {id: "openPicker", title: "打开「添加元素」", desc: "默认 N"},
        {id: "openPresetPicker", title: "打开「添加预设」", desc: "默认 Shift+P"},
        {id: "openPresetRingTool", title: "打开「环形放置」", desc: "默认 Shift+H"},
        {id: "pickLineXZ", title: "进入 XZ 拾取直线", desc: "默认 Q"},
        {id: "pickDottedLineXZ", title: "进入 XZ 拾取虚线直线", desc: "默认 Shift+Q"},
        {id: "pickTriangle", title: "进入 XZ 拾取三角形", desc: "默认 T"},
        {id: "pickPoint", title: "点拾取（填充当前输入）", desc: "默认 E"},
        {id: "pickBezierStartEnd", title: "进入 Bezier 创建流", desc: "默认 W"},
        {id: "openMeasureTool", title: "打开预览测距", desc: "默认 M"},
        {id: "toggleFullscreen", title: "预览全屏 / 退出全屏", desc: "默认 G"},
        {id: "resetCamera", title: "重置镜头", desc: "默认 Shift + R"},
        {id: "importJson", title: "导入 JSON", desc: "默认 Ctrl/Cmd+O"},
        {id: "toggleSettings", title: "打开/隐藏 设置", desc: "默认 H"},
        {id: "toggleParamSync", title: "打开/隐藏 参数同步", desc: "默认 Y"},
        {id: "toggleFilter", title: "打开/隐藏 过滤器", desc: "默认 L"},
        {id: "toggleSnapGrid", title: "切换吸附网格", desc: "默认 G"},
        {id: "toggleSnapParticle", title: "切换吸附粒子", desc: "默认 P"},
        {id: "snapPlaneXZ", title: "切换吸附平面：XZ", desc: "默认 A"},
        {id: "snapPlaneXY", title: "切换吸附平面：XY", desc: "默认 S"},
        {id: "snapPlaneZY", title: "切换吸附平面：ZY", desc: "默认 D"},
        {id: "mirrorPlaneXZ", title: "切换镜像平面：XZ", desc: "默认 Shift+A"},
        {id: "mirrorPlaneXY", title: "切换镜像平面：XY", desc: "默认 Shift+S"},
        {id: "mirrorPlaneZY", title: "切换镜像平面：ZY", desc: "默认 Shift+D"},
        {id: "lockPlaneHold", title: "锁定平面坐标（仅移动法线轴）", desc: "默认 X"},
        {id: "copyFocused", title: "复制当前聚焦卡片", desc: "默认 Ctrl/Cmd + D"},
        {id: "mirrorCopy", title: "镜像复制（直线/三角形/Bezier/Offset）", desc: "默认 Ctrl/Cmd + Shift + M"},
        {id: "triggerFocusedMove", title: "触发聚焦卡片移动", desc: "默认 V"},
        {id: "triggerFocusedRotate", title: "触发聚焦卡片旋转", desc: "默认 R"},
        {id: "triggerFocusedLocalRotate", title: "触发聚焦卡片本地旋转", desc: "默认 F"},
        {id: "deleteFocused", title: "删除当前聚焦卡片", desc: "默认 Backspace"},
        {id: "undo", title: "撤销", desc: "默认 Ctrl/Cmd + Z"},
        {id: "redo", title: "恢复", desc: "默认 Ctrl/Cmd + Shift + Z"},
    ];

    // ✅ 解决：从「添加元素」窗口内打开快捷键设置会遮挡：采用“叠窗 + 底层磨砂”
    // 打开快捷键时：让添加元素弹窗进入 under（模糊、不可交互）；关闭快捷键时恢复。
    let _addModalWasOpenWhenHotkeys = false;
    let _settingsWasOpenWhenHotkeys = false;
    function openHotkeysModal() {
        _addModalWasOpenWhenHotkeys = !!(modal && !modal.classList.contains("hidden"));
        if (_addModalWasOpenWhenHotkeys) {
            try { modal.classList.add("under"); } catch {}
            try { modalMask && modalMask.classList.add("under"); } catch {}
        }
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
        if (hkHint) hkHint.textContent = "设置后按键，Esc 取消，Backspace/Delete 清空。配置会保存到浏览器。";

        // ✅ 若打开快捷键时下面还有「添加元素」窗口，则恢复其可交互状态
        if (_addModalWasOpenWhenHotkeys) {
            _addModalWasOpenWhenHotkeys = false;
            try { modal.classList.remove("under"); } catch {}
            try { modalMask && modalMask.classList.remove("under"); } catch {}
            // 添加元素窗口仍然打开时，恢复遮罩
            if (modal && !modal.classList.contains("hidden")) {
                modalMask && modalMask.classList.remove("hidden");
                try { cardSearch && cardSearch.focus(); } catch {}
            }
        }
        if (_settingsWasOpenWhenHotkeys) {
            _settingsWasOpenWhenHotkeys = false;
            try { settingsModal && settingsModal.classList.remove("under"); } catch {}
            try { settingsMask && settingsMask.classList.remove("under"); } catch {}
            if (settingsModal && !settingsModal.classList.contains("hidden")) {
                settingsMask && settingsMask.classList.remove("hidden");
            }
        }
    }

    function beginHotkeyCapture(target) {
        hotkeyCapture = target;
        if (hkHint) hkHint.textContent = `正在设置：${target.title || target.id}（按下新按键；Esc 取消；Backspace/Delete 清空）`;
    }

    function setHotkeyFor(target, hk) {
        if (!target) return;
        const except = {type: target.type, id: target.id};
        removeHotkeyConflicts(hk, except);
        if (target.type === "action") {
            hotkeys.actions[target.id] = hk || "";
        } else if (target.type === "kind") {
            if (!hk) delete hotkeys.kinds[target.id];
            else hotkeys.kinds[target.id] = hk;
        } else if (target.type === "preset") {
            if (!hotkeys.presets || typeof hotkeys.presets !== "object") hotkeys.presets = {};
            if (!hk) delete hotkeys.presets[target.id];
            else hotkeys.presets[target.id] = hk;
        }
        saveHotkeys();
        renderHotkeysList();
    }

    function renderHotkeysList() {
        if (!hkList) return;
        const f = (hkSearch && hkSearch.value ? hkSearch.value : "").trim().toLowerCase();
        hkList.innerHTML = "";

        const makeRow = ({title, desc, type, id, hk}) => {
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
            bSet.addEventListener("click", () => beginHotkeyCapture({type, id, title}));

            const bClr = document.createElement("button");
            bClr.className = "btn small";
            bClr.textContent = "清空";
            bClr.addEventListener("click", () => setHotkeyFor({type, id, title}, ""));

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

        // Actions
        const s1 = section("动作");
        for (const a of HOTKEY_ACTION_DEFS) {
            const hk = (hotkeys.actions || {})[a.id] || "";
            const text = (a.title + " " + a.desc + " " + hotkeyToHuman(hk)).toLowerCase();
            if (f && !text.includes(f)) continue;
            s1.appendChild(makeRow({title: a.title, desc: a.desc, type: "action", id: a.id, hk}));
        }
        hkList.appendChild(s1);

        // Card kinds
        const s2 = section("卡片类型（新增）");
        const entries = Object.entries(KIND || {}).map(([kind, def]) => ({kind, def}))
            .filter(it => it.kind !== "ROOT");
        entries.sort((a, b) => (a.def?.title || a.kind).localeCompare(b.def?.title || b.kind, "zh-CN"));

        for (const it of entries) {
            const hk = (hotkeys.kinds || {})[it.kind] || "";
            const title = it.def?.title || it.kind;
            const desc = it.def?.desc || it.kind;
            const text = (it.kind + " " + title + " " + desc + " " + hotkeyToHuman(hk)).toLowerCase();
            if (f && !text.includes(f)) continue;
            s2.appendChild(makeRow({title, desc, type: "kind", id: it.kind, hk}));
        }
        hkList.appendChild(s2);

        const s3 = section("预设（拾取生成）");
        const presets = typeof getPresetList === "function" ? getPresetList() : [];
        for (const preset of presets) {
            if (!preset || !preset.id) continue;
            const hk = (hotkeys.presets || {})[preset.id] || "";
            const title = preset.name || "未命名预设";
            const desc = preset.group ? `分组：${preset.group}` : "默认分组";
            const text = (title + " " + desc + " " + hotkeyToHuman(hk)).toLowerCase();
            if (f && !text.includes(f)) continue;
            s3.appendChild(makeRow({ title, desc, type: "preset", id: preset.id, hk }));
        }
        hkList.appendChild(s3);
    }

    function handleHotkeyCaptureKeydown(e) {
        if (!hkModal || hkModal.classList.contains("hidden") || !hotkeyCapture) return false;
        e.preventDefault();
        e.stopPropagation();

        if (e.code === "Escape") {
            hotkeyCapture = null;
            if (hkHint) hkHint.textContent = "已取消。";
            renderHotkeysList();
            return true;
        }
        if (e.code === "Backspace" || e.code === "Delete") {
            setHotkeyFor(hotkeyCapture, "");
            hotkeyCapture = null;
            if (hkHint) hkHint.textContent = "已清空。";
            return true;
        }

        const hk = eventToHotkey(e);
        // 必须包含一个“非修饰键”
        if (!hk || hk === "Mod" || hk === "Shift" || hk === "Alt" || hk === "Mod+Shift" || hk === "Mod+Alt" || hk === "Shift+Alt" || hk === "Mod+Shift+Alt") {
            return true;
        }
        setHotkeyFor(hotkeyCapture, hk);
        hotkeyCapture = null;
        if (hkHint) hkHint.textContent = "已保存。";
        return true;
    }

    // Hotkeys modal events
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
                : ((obj.actions || obj.kinds) ? obj : null);
            if (hkObj) {
                if (!hkObj.actions || typeof hkObj.actions !== "object") hkObj.actions = {};
                if (!hkObj.kinds || typeof hkObj.kinds !== "object") hkObj.kinds = {};
                if (!hkObj.presets || typeof hkObj.presets !== "object") hkObj.presets = {};
                hotkeys.version = DEFAULT_HOTKEYS.version;
                hotkeys.actions = Object.assign({}, DEFAULT_HOTKEYS.actions, hkObj.actions);
                hotkeys.kinds = Object.assign({}, hkObj.kinds);
                hotkeys.presets = Object.assign({}, hkObj.presets);
                saveHotkeys();
                renderHotkeysList();
            }
            if (obj.settings && typeof applySettingsPayload === "function") {
                applySettingsPayload(obj.settings);
            }
            showToast && showToast("导入成功", "success");
        } catch (e) {
            showToast && showToast(`导入失败-格式错误(${e.message || e})`, "error");
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
