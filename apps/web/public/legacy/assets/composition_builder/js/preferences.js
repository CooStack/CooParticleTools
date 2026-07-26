import {
    COMPOSITION_STORAGE_KEY,
    cloneCompositionValue,
    createCompositionProject,
    normalizeCompositionProject
} from "./model.js?v=20260720_1";

export const COMPOSITION_PREFERENCES_STORAGE_KEY = "cb_preferences_v1";

function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseStoredJson(storage, key) {
    try {
        const raw = storage?.getItem?.(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function hasLegacyPreferences(stateLike) {
    return isRecord(stateLike?.settings) || isRecord(stateLike?.hotkeys);
}

function isCompositionPreferences(value) {
    return isRecord(value) && hasLegacyPreferences(value);
}

function mergeCompositionPreferences(baseLike, overrideLike) {
    const base = isCompositionPreferences(baseLike) ? baseLike : {};
    const override = isCompositionPreferences(overrideLike) ? overrideLike : {};
    const settings = {
        ...(isRecord(base.settings) ? base.settings : {}),
        ...(isRecord(override.settings) ? override.settings : {})
    };
    const baseHotkeys = isRecord(base.hotkeys) ? base.hotkeys : {};
    const overrideHotkeys = isRecord(override.hotkeys) ? override.hotkeys : {};
    const hotkeys = {
        ...baseHotkeys,
        ...overrideHotkeys,
        actions: {
            ...(isRecord(baseHotkeys.actions) ? baseHotkeys.actions : {}),
            ...(isRecord(overrideHotkeys.actions) ? overrideHotkeys.actions : {})
        }
    };
    return { settings, hotkeys };
}

export function extractCompositionPreferences(stateLike = {}) {
    const source = isRecord(stateLike) ? stateLike : {};
    const normalized = normalizeCompositionProject({
        settings: isRecord(source.settings) ? source.settings : {},
        hotkeys: isRecord(source.hotkeys) ? source.hotkeys : {},
        cards: []
    });
    return {
        settings: cloneCompositionValue(normalized.settings),
        hotkeys: cloneCompositionValue(normalized.hotkeys)
    };
}

export function applyCompositionPreferences(stateLike, preferencesLike) {
    const next = normalizeCompositionProject(stateLike || {});
    if (!isRecord(preferencesLike)) return next;
    if (isRecord(preferencesLike.settings)) {
        next.settings = cloneCompositionValue(preferencesLike.settings);
    }
    if (isRecord(preferencesLike.hotkeys)) {
        next.hotkeys = cloneCompositionValue(preferencesLike.hotkeys);
    }
    return normalizeCompositionProject(next);
}

export function extractCompositionProjectState(stateLike) {
    const project = normalizeCompositionProject(cloneCompositionValue(stateLike || {}));
    delete project.settings;
    delete project.hotkeys;
    return project;
}

export function loadCompositionStateFromStorage(storage = globalThis.localStorage) {
    const draft = parseStoredJson(storage, COMPOSITION_STORAGE_KEY);
    const state = draft ? normalizeCompositionProject(draft) : createCompositionProject();
    const storedPreferences = parseStoredJson(storage, COMPOSITION_PREFERENCES_STORAGE_KEY);
    const legacyPreferences = hasLegacyPreferences(draft)
        ? extractCompositionPreferences(draft)
        : null;
    const preferences = mergeCompositionPreferences(legacyPreferences, storedPreferences);

    if (!isCompositionPreferences(storedPreferences) && legacyPreferences) {
        try {
            storage?.setItem?.(COMPOSITION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
        } catch {
        }
    }

    return isCompositionPreferences(preferences) ? applyCompositionPreferences(state, preferences) : state;
}

export function saveCompositionPreferencesToStorage(storage, stateLike) {
    const preferences = extractCompositionPreferences(stateLike);
    storage?.setItem?.(COMPOSITION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

export function saveCompositionStateToStorage(storage, stateLike) {
    let firstError = null;
    try {
        saveCompositionPreferencesToStorage(storage, stateLike);
    } catch (error) {
        firstError = error;
    }
    try {
        storage?.setItem?.(COMPOSITION_STORAGE_KEY, JSON.stringify(stateLike));
    } catch (error) {
        firstError ||= error;
    }
    if (firstError) throw firstError;
}
