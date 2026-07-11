const LEGACY_LIGHT_THEMES = new Set(["light-1", "light-2", "light-3"]);

export function normalizeWorkbenchTheme(raw) {
    const theme = String(raw || "dark-1");
    if (theme === "light-pink" || LEGACY_LIGHT_THEMES.has(theme)) return "light-pink";
    return "dark-1";
}

export function minecraftThemeFor(theme) {
    return normalizeWorkbenchTheme(theme) === "light-pink" ? "light-pink" : "deep-pink";
}
