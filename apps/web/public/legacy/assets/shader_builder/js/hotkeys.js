import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, STORAGE_KEYS } from "./constants.js";
import {
    eventToHotkey,
    hotkeyMatchEvent,
    hotkeyToHuman,
    normalizeHotkey,
    shouldIgnoreHotkeysForTarget,
    deepClone,
    loadJson,
    saveJson
} from "./utils.js";

function loadHotkeys() {
    const saved = loadJson(STORAGE_KEYS.hotkeys, null);
    const out = deepClone(DEFAULT_HOTKEYS);
    if (saved && typeof saved === "object" && saved.actions && typeof saved.actions === "object") {
        out.actions = Object.assign({}, out.actions, saved.actions);
    }
    for (const key of Object.keys(out.actions)) out.actions[key] = normalizeHotkey(out.actions[key]);
    return out;
}

export function initHotkeysSystem(ctx) {
    const {
        els,
        onAction = () => {},
        onCycleTheme = () => {},
        onModalStateChange = () => {}
    } = ctx;

    const {
        hotkeyModal,
        hotkeyMask,
        hotkeyList,
        hotkeyHint,
        hotkeySearch,
        btnCloseHotkeys,
        btnCloseHotkeys2,
        btnResetHotkeys
    } = els;

    const hotkeys = loadHotkeys();
    let captureTarget = null;

    function save() {
        saveJson(STORAGE_KEYS.hotkeys, hotkeys);
    }

    function open() {
        hotkeyModal?.classList.remove("hidden");
        hotkeyMask?.classList.remove("hidden");
        hotkeySearch && (hotkeySearch.value = "");
        renderList();
        onModalStateChange(true);
    }

    function close() {
        hotkeyModal?.classList.add("hidden");
        hotkeyMask?.classList.add("hidden");
        captureTarget = null;
        if (hotkeyHint) hotkeyHint.textContent = "点击“设置”后按键，Esc 取消，Backspace/Delete 清空。";
        onModalStateChange(false);
    }

    function reset() {
        hotkeys.actions = deepClone(DEFAULT_HOTKEYS.actions);
        save();
        renderList();
    }

    function beginCapture(actionId) {
        captureTarget = actionId;
        const def = HOTKEY_ACTIONS.find((a) => a.id === actionId);
        if (hotkeyHint) hotkeyHint.textContent = `正在设置：${def?.title || actionId}（Esc 取消，Backspace/Delete 清空）`;
        renderList();
    }

    function removeConflicts(hk, exceptActionId) {
        for (const [actionId, val] of Object.entries(hotkeys.actions)) {
            if (actionId === exceptActionId) continue;
            if (normalizeHotkey(val) === hk) hotkeys.actions[actionId] = "";
        }
    }

    function setActionHotkey(actionId, hk) {
        const n = normalizeHotkey(hk);
        removeConflicts(n, actionId);
        hotkeys.actions[actionId] = n;
        save();
        renderList();
    }

    function clearActionHotkey(actionId) {
        hotkeys.actions[actionId] = "";
        save();
        renderList();
    }

    function renderList() {
        if (!hotkeyList) return;
        const keyword = (hotkeySearch?.value || "").trim().toLowerCase();
        hotkeyList.innerHTML = "";

        for (const item of HOTKEY_ACTIONS) {
            const title = item.title;
            const desc = item.desc || "";
            if (keyword) {
                const text = `${title} ${desc} ${item.id}`.toLowerCase();
                if (!text.includes(keyword)) continue;
            }

            const row = document.createElement("div");
            row.className = "hk-item";

            const titleEl = document.createElement("div");
            titleEl.innerHTML = `<div class="hk-title">${title}</div><div class="hk-desc">${desc}</div>`;

            const keyEl = document.createElement("div");
            keyEl.className = "hk-key";
            keyEl.textContent = captureTarget === item.id ? "按键中..." : hotkeyToHuman(hotkeys.actions[item.id] || "");

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn small";
            btn.textContent = captureTarget === item.id ? "取消" : "设置";
            btn.addEventListener("click", () => {
                if (captureTarget === item.id) {
                    captureTarget = null;
                    renderList();
                    return;
                }
                beginCapture(item.id);
            });

            row.appendChild(titleEl);
            row.appendChild(keyEl);
            row.appendChild(btn);
            hotkeyList.appendChild(row);
        }
    }

    function bindModalEvents() {
        hotkeySearch?.addEventListener("input", renderList);
        btnCloseHotkeys?.addEventListener("click", close);
        btnCloseHotkeys2?.addEventListener("click", close);
        hotkeyMask?.addEventListener("click", close);
        btnResetHotkeys?.addEventListener("click", reset);
    }

    function handleCapture(e) {
        if (!captureTarget) return false;
        e.preventDefault();
        e.stopPropagation();

        if (e.code === "Escape") {
            captureTarget = null;
            if (hotkeyHint) hotkeyHint.textContent = "点击“设置”后按键，Esc 取消，Backspace/Delete 清空。";
            renderList();
            return true;
        }
        if (e.code === "Backspace" || e.code === "Delete") {
            clearActionHotkey(captureTarget);
            captureTarget = null;
            if (hotkeyHint) hotkeyHint.textContent = "已清空快捷键。";
            return true;
        }

        const hk = eventToHotkey(e);
        if (!hk) return true;
        setActionHotkey(captureTarget, hk);
        captureTarget = null;
        if (hotkeyHint) hotkeyHint.textContent = `已绑定：${hotkeyToHuman(hk)}`;
        return true;
    }

    function isModalOpen() {
        return !!(hotkeyModal && !hotkeyModal.classList.contains("hidden"));
    }

    function bindGlobalKeydown() {
        document.addEventListener("keydown", (e) => {
            if (handleCapture(e)) return;

            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "]" || e.key === "[")) {
                e.preventDefault();
                onCycleTheme(e.key === "]" ? 1 : -1);
                return;
            }

            if (isModalOpen()) {
                if (e.code === "Escape") {
                    e.preventDefault();
                    close();
                }
                return;
            }

            const target = e.target;
            const isPlainKey = !e.ctrlKey && !e.metaKey && !e.altKey;
            if (isPlainKey && shouldIgnoreHotkeysForTarget(target)) return;
            if (e.repeat) return;

            for (const def of HOTKEY_ACTIONS) {
                const hk = hotkeys.actions[def.id] || "";
                if (!hk) continue;
                if (hotkeyMatchEvent(e, hk)) {
                    e.preventDefault();
                    onAction(def.id);
                    return;
                }
            }
        });
    }

    bindModalEvents();
    bindGlobalKeydown();
    renderList();

    return {
        open,
        close,
        renderList,
        getHotkeys: () => deepClone(hotkeys),
        applyHotkeys(obj) {
            if (!obj || typeof obj !== "object") return;
            if (obj.actions && typeof obj.actions === "object") {
                hotkeys.actions = Object.assign({}, hotkeys.actions, obj.actions);
                for (const k of Object.keys(hotkeys.actions)) {
                    hotkeys.actions[k] = normalizeHotkey(hotkeys.actions[k]);
                }
                save();
                renderList();
            }
        }
    };
}
