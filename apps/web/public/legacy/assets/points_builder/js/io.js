export const PROJECT_NAME_KEY = "pb_project_name_v1";
export const KOTLIN_END_KEY = "pb_kotlin_end_v1";
export const STATE_STORAGE_KEY = "pb_state_v1";
export const PRESET_STORAGE_KEY = "pb_presets_v1";
export const PRESET_GROUPS_KEY = "pb_preset_groups_v1";

export function sanitizeFileBase(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    return raw.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60).trim();
}

export function loadProjectName() {
    try {
        const raw = localStorage.getItem(PROJECT_NAME_KEY);
        return sanitizeFileBase(raw || "");
    } catch {
        return "";
    }
}

export function saveProjectName(name) {
    try {
        localStorage.setItem(PROJECT_NAME_KEY, name || "");
    } catch {
    }
}

export function loadKotlinEndMode() {
    try {
        const raw = localStorage.getItem(KOTLIN_END_KEY) || "";
        if (raw === "list" || raw === "clone" || raw === "builder") return raw;
    } catch {
    }
    return "builder";
}

export function saveKotlinEndMode(mode) {
    try {
        localStorage.setItem(KOTLIN_END_KEY, mode || "builder");
    } catch {
    }
}

export function loadAutoState() {
    try {
        const raw = localStorage.getItem(STATE_STORAGE_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        const state = (obj && obj.state) ? obj.state : obj;
        if (state && state.root && Array.isArray(state.root.children)) return state;
    } catch {
    }
    return null;
}

export function saveAutoState(state) {
    if (!state) return false;
    try {
        const payload = {state, ts: Date.now()};
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
}

export function clearAutoState() {
    try {
        localStorage.removeItem(STATE_STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function loadPresetList() {
    try {
        const raw = localStorage.getItem(PRESET_STORAGE_KEY);
        if (!raw) return [];
        const obj = JSON.parse(raw);
        const list = Array.isArray(obj) ? obj : (Array.isArray(obj?.presets) ? obj.presets : []);
        return list.filter((it) => it && typeof it === "object");
    } catch {
        return [];
    }
}

export function savePresetList(presets) {
    try {
        const list = Array.isArray(presets) ? presets : [];
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ presets: list, ts: Date.now() }));
        return true;
    } catch {
        return false;
    }
}

export function loadPresetGroups() {
    try {
        const raw = localStorage.getItem(PRESET_GROUPS_KEY);
        if (!raw) return [];
        const obj = JSON.parse(raw);
        const list = Array.isArray(obj) ? obj : (Array.isArray(obj?.groups) ? obj.groups : []);
        return list.map((it) => String(it || "").trim()).filter(Boolean);
    } catch {
        return [];
    }
}

export function savePresetGroups(groups) {
    try {
        const list = Array.isArray(groups) ? groups : [];
        localStorage.setItem(PRESET_GROUPS_KEY, JSON.stringify({ groups: list, ts: Date.now() }));
        return true;
    } catch {
        return false;
    }
}

export function downloadText(filename, text, mime = "text/plain") {
    const blob = new Blob([text], {type: `${mime};charset=utf-8`});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "download.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 200);
}
