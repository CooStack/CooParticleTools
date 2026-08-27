function normalizeGroup(value) {
    return String(value || "默认分组").trim() || "默认分组";
}

export function getRandomPresetGroupOptions(presets) {
    return Array.from(new Set((Array.isArray(presets) ? presets : [])
        .filter((preset) => preset && preset.id)
        .map((preset) => normalizeGroup(preset.group))))
        .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function pickRandomPresetIdsForGroup(presets, group, count, random = Math.random) {
    const targetGroup = normalizeGroup(group);
    const candidates = (Array.isArray(presets) ? presets : [])
        .filter((preset) => preset && preset.id && normalizeGroup(preset.group) === targetGroup);
    const total = Math.max(0, Math.trunc(Number(count) || 0));
    if (!candidates.length || !total) return [];
    const ids = [];
    for (let index = 0; index < total; index++) {
        const value = Number(random());
        const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999999) : 0;
        ids.push(candidates[Math.floor(normalized * candidates.length)].id);
    }
    return ids;
}
