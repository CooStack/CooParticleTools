const LEGACY_LIGHT_THEMES = new Set(["light-1", "light-2", "light-3", "light-pink"]);

export const GLASS_THEMES = Object.freeze([
    "glass-dark-blue",
    "glass-dark-green",
    "glass-dark-violet",
    "glass-dark-neutral",
    "glass-light-blue",
    "glass-light-green",
    "glass-light-violet",
    "glass-light-neutral"
]);

export function normalizeWorkbenchTheme(raw) {
    const theme = String(raw || "dark-1");
    if (GLASS_THEMES.includes(theme)) return theme;
    if (LEGACY_LIGHT_THEMES.has(theme)) return "light-1";
    return "dark-1";
}
