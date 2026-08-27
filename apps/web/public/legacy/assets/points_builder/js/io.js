export const PROJECT_NAME_KEY = "pb_project_name_v1";
export const KOTLIN_END_KEY = "pb_kotlin_end_v1";
export const STATE_STORAGE_KEY = "pb_state_v1";
export const PRESET_STORAGE_KEY = "pb_presets_v1";
export const PRESET_GROUPS_KEY = "pb_preset_groups_v1";

// Keep Composition Builder drafts isolated per card and target. The legacy
// shared slot remains available for standalone PointsBuilder pages.
export function getAutoStateStorageKey(context = null, storageKey = STATE_STORAGE_KEY) {
    const base = String(storageKey || STATE_STORAGE_KEY);
    const normalized = getAutoStateContext(context);
    if (!normalized) return base;
    const suffix = `:${encodeURIComponent(normalized.cardId)}:${encodeURIComponent(normalized.target)}`;
    return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

const AUTO_STATE_DB_NAME = "coo-particles-points-builder-v1";
const AUTO_STATE_DB_VERSION = 1;
const AUTO_STATE_STORE = "drafts";
let autoStateDbPromise = null;
let autoStatePendingRecord = null;
let autoStateWriterPromise = null;

function getAutoStateContext(raw = null) {
    const source = raw && typeof raw === "object"
        ? raw
        : globalThis.__PB_EDITOR_CONTEXT;
    if (!source || typeof source !== "object") return null;
    const cardId = String(source.cardId || "").trim();
    if (!cardId) return null;
    return {
        cardId,
        target: String(source.target || "root"),
        compositionRevision: String(source.compositionRevision || "")
    };
}

function autoStateContextMatches(actual, expected) {
    const left = getAutoStateContext(actual);
    const right = getAutoStateContext(expected);
    if (!right) return true;
    if (!left) return false;
    if (left.cardId !== right.cardId || left.target !== right.target) return false;
    if (!right.compositionRevision) return true;
    return left.compositionRevision === right.compositionRevision;
}

function autoStateContextKey(context) {
    const normalized = getAutoStateContext(context);
    if (!normalized) return "standalone";
    return `composition:${normalized.cardId}:${normalized.target}`;
}

function parseAutoStatePayload(raw) {
    if (!raw) return null;
    try {
        const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
        const state = payload?.state || payload;
        if (!state || !state.root || !Array.isArray(state.root.children)) return null;
        return {
            state,
            context: getAutoStateContext(payload?.context),
            ts: Number(payload?.ts) || 0
        };
    } catch {
        return null;
    }
}

function openAutoStateDb() {
    if (autoStateDbPromise) return autoStateDbPromise;
    if (!globalThis.indexedDB?.open) return null;
    autoStateDbPromise = new Promise((resolve, reject) => {
        let request;
        try {
            request = globalThis.indexedDB.open(AUTO_STATE_DB_NAME, AUTO_STATE_DB_VERSION);
        } catch (error) {
            reject(error);
            return;
        }
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(AUTO_STATE_STORE)) {
                db.createObjectStore(AUTO_STATE_STORE, { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
        request.onblocked = () => reject(new Error("IndexedDB blocked"));
    }).catch((error) => {
        autoStateDbPromise = null;
        return Promise.reject(error);
    });
    return autoStateDbPromise;
}

function putAutoStateRecord(record) {
    const dbPromise = openAutoStateDb();
    if (!dbPromise) return Promise.reject(new Error("IndexedDB unavailable"));
    return dbPromise.then((db) => new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(AUTO_STATE_STORE, "readwrite");
            tx.objectStore(AUTO_STATE_STORE).put(record);
        } catch (error) {
            reject(error);
            return;
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
    }));
}

function readAutoStateRecord(key) {
    const dbPromise = openAutoStateDb();
    if (!dbPromise) return Promise.resolve(null);
    return dbPromise.then((db) => new Promise((resolve, reject) => {
        let tx;
        let request;
        try {
            tx = db.transaction(AUTO_STATE_STORE, "readonly");
            request = tx.objectStore(AUTO_STATE_STORE).get(key);
        } catch (error) {
            reject(error);
            return;
        }
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    })).catch(() => null);
}

async function drainAutoStateWrites() {
    let failed = false;
    while (autoStatePendingRecord) {
        const record = autoStatePendingRecord;
        autoStatePendingRecord = null;
        try {
            await putAutoStateRecord(record);
        } catch (error) {
            // Keep the latest failed record for the next edit, and expose the
            // failure instead of silently discarding the user's work.
            if (!autoStatePendingRecord || Number(autoStatePendingRecord.ts) < Number(record.ts)) {
                autoStatePendingRecord = record;
            }
            try {
                globalThis.dispatchEvent?.(new CustomEvent("pb-auto-save-error", {
                    detail: { error, ts: record.ts }
                }));
            } catch {
            }
            failed = true;
            break;
        }
    }
    autoStateWriterPromise = null;
    if (!failed && autoStatePendingRecord) queueAutoStateWrite(autoStatePendingRecord);
}

function queueAutoStateWrite(record) {
    if (!record || !openAutoStateDb()) return false;
    if (!autoStatePendingRecord || Number(record.ts) >= Number(autoStatePendingRecord.ts)) {
        autoStatePendingRecord = record;
    }
    if (!autoStateWriterPromise) {
        autoStateWriterPromise = drainAutoStateWrites();
    }
    return true;
}

export function flushAutoStateSave() {
    return autoStateWriterPromise || Promise.resolve(true);
}

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
        const context = getAutoStateContext(globalThis.__PB_EDITOR_CONTEXT);
        const storageKey = getAutoStateStorageKey(context, STATE_STORAGE_KEY);
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        const state = (obj && obj.state) ? obj.state : obj;
        if (state && state.root && Array.isArray(state.root.children)) return state;
    } catch {
    }
    return null;
}

export async function loadLatestAutoStatePayload({ storageKey = STATE_STORAGE_KEY, expectedContext = null } = {}) {
    const resolvedStorageKey = getAutoStateStorageKey(
        expectedContext || globalThis.__PB_EDITOR_CONTEXT,
        storageKey
    );
    const local = (() => {
        try {
            return parseAutoStatePayload(localStorage.getItem(resolvedStorageKey));
        } catch {
            return null;
        }
    })();
    const expected = getAutoStateContext(expectedContext);
    const key = autoStateContextKey(expected || local?.context);
    const stored = await readAutoStateRecord(key);
    const indexed = parseAutoStatePayload(stored?.payloadJson || null);
    const candidates = [local, indexed]
        .filter((candidate) => candidate && autoStateContextMatches(candidate.context, expected))
        .sort((a, b) => Number(b.ts) - Number(a.ts));
    return candidates[0] || null;
}

export function saveAutoState(state, serializedState = "") {
    if (!state) return false;
    let stateJson = String(serializedState || "");
    if (!stateJson) {
        try {
            stateJson = JSON.stringify(state);
        } catch {
            return false;
        }
    }
    if (!stateJson) return false;
    try {
        const editorContext = globalThis.__PB_EDITOR_CONTEXT;
        const context = editorContext && typeof editorContext === "object"
            ? {
                cardId: String(editorContext.cardId || ""),
                target: String(editorContext.target || "root"),
                // Never inherit a revision from another card's old sandbox.
                compositionRevision: String(editorContext.compositionRevision || "")
            }
            : null;
        const ts = Date.now();
        const payloadJson = context?.cardId
            ? `{"state":${stateJson},"context":${JSON.stringify(context)},"ts":${ts}}`
            : `{"state":${stateJson},"ts":${ts}}`;
        const localStorageKey = getAutoStateStorageKey(context, STATE_STORAGE_KEY);
        let localSaved = false;
        try {
            localStorage.setItem(localStorageKey, payloadJson);
            localSaved = true;
            if (context?.cardId && localStorageKey !== STATE_STORAGE_KEY) {
                localStorage.removeItem(STATE_STORAGE_KEY);
            }
        } catch (error) {
            try {
                globalThis.dispatchEvent?.(new CustomEvent("pb-auto-save-error", {
                    detail: { error, ts }
                }));
            } catch {
            }
        }
        const indexedQueued = queueAutoStateWrite({
            key: autoStateContextKey(context),
            payloadJson,
            ts
        });
        return localSaved || indexedQueued;
    } catch {
        return false;
    }
}

export function clearAutoState() {
    try {
        const contextKey = getAutoStateStorageKey(globalThis.__PB_EDITOR_CONTEXT, STATE_STORAGE_KEY);
        localStorage.removeItem(contextKey);
        if (contextKey !== STATE_STORAGE_KEY) localStorage.removeItem(STATE_STORAGE_KEY);
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

export function hasPresetList() {
    try {
        return localStorage.getItem(PRESET_STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}

export function savePresetList(presets, groups) {
    try {
        const list = Array.isArray(presets) ? presets : [];
        const groupList = Array.isArray(groups) ? groups : loadPresetGroups();
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({
            presets: list,
            groups: groupList,
            ts: Date.now()
        }));
        return true;
    } catch {
        return false;
    }
}

export function loadPresetGroups() {
    try {
        const raw = localStorage.getItem(PRESET_GROUPS_KEY);
        let obj = raw ? JSON.parse(raw) : null;
        let list = Array.isArray(obj) ? obj : (Array.isArray(obj?.groups) ? obj.groups : []);
        if (!list.length) {
            const presetRaw = localStorage.getItem(PRESET_STORAGE_KEY);
            const presetObj = presetRaw ? JSON.parse(presetRaw) : null;
            list = Array.isArray(presetObj?.groups) ? presetObj.groups : list;
        }
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
