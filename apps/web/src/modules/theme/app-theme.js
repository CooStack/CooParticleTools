import { DEFAULT_THEME_ID, normalizeThemeId } from './options.js';
import { getElectronShell } from '../../services/shell/electron-shell.js';

/*
 * The app-global theme: shell, every builder, and the Electron title bar.
 *
 * Two layers on purpose:
 *
 *   localStorage — the synchronous cache. The builder iframes read it during
 *     bootstrap and cannot await IPC, and because they are same-origin a write
 *     here raises a `storage` event in the others, which is what keeps the tools
 *     in sync live.
 *
 *   Electron preferences.json — the durable copy. The desktop shell serves the
 *     renderer from http://127.0.0.1:<port> where the port is allocated fresh on
 *     every launch (see getFreePort in apps/electron/src/main.js), so the origin
 *     changes and localStorage starts empty each time. That is why the theme
 *     "reset to the first one" after a restart. Anything that must outlive a
 *     launch has to go through the shell's own store.
 */

const STORAGE_KEY = 'coo-particles:app-theme';
const PREFERENCE_KEY = 'appTheme';

function readCache() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeCache(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / disabled storage: applies for this session only.
  }
}

export function readAppTheme() {
  return normalizeThemeId(readCache() || DEFAULT_THEME_ID);
}

export function writeAppTheme(raw) {
  const theme = normalizeThemeId(raw);
  writeCache(theme);
  applyAppTheme(theme);
  // Durable copy; fire-and-forget so picking a theme stays instant.
  void persistAppTheme(theme);
  return theme;
}

async function persistAppTheme(theme) {
  const shell = getElectronShell();
  if (!shell?.writePreferences) return;
  try {
    await shell.writePreferences(PREFERENCE_KEY, theme);
  } catch {
    // Web build, or the store is unavailable: the cache still holds it.
  }
}

/**
 * Pulls the durable theme into the cache and applies it. Call once at startup,
 * before the shell paints, so a fresh-origin launch recovers the real choice
 * instead of falling back to the default.
 */
export async function hydrateAppTheme() {
  const shell = getElectronShell();
  if (!shell?.readPreferences) return applyAppTheme();
  try {
    const result = await shell.readPreferences(PREFERENCE_KEY);
    const stored = result?.ok ? result.value : result;
    if (typeof stored === 'string' && stored) {
      const theme = normalizeThemeId(stored);
      writeCache(theme);
      return applyAppTheme(theme);
    }
    // Nothing durable yet: promote whatever this origin happens to have so the
    // first run after this change keeps the user's current pick.
    const cached = readCache();
    if (cached) void persistAppTheme(normalizeThemeId(cached));
  } catch {
    // Fall through to the cache.
  }
  return applyAppTheme();
}

/** Applies a theme to <body>. Defaults to the cached one. */
export function applyAppTheme(raw) {
  if (typeof document === 'undefined') return DEFAULT_THEME_ID;
  const theme = normalizeThemeId(raw ?? readAppTheme());
  document.body.dataset.theme = theme;
  notifyListeners(theme);
  return theme;
}

const listeners = new Set();

function notifyListeners(theme) {
  for (const listener of listeners) {
    try {
      listener(theme);
    } catch {
      // A broken subscriber must not stop the theme from applying.
    }
  }
}

/**
 * Fires whenever the applied theme changes, including the async hydrate at
 * startup. UI that mirrors the theme (the shell's picker) needs this: it reads
 * the cache during setup, and on a fresh-origin launch the durable value only
 * arrives afterwards. Returns a dispose function.
 */
export function onAppThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Used when leaving a builder: the builder had overridden <body data-theme> with
 * its project's theme, so put the shell's own choice back rather than clearing
 * the attribute (which would drop the shell to the default).
 */
export function restoreAppTheme() {
  return applyAppTheme();
}

/**
 * Subscribes to theme changes made in another document of this origin — in
 * practice a builder iframe's own theme <select>. Returns a dispose function.
 *
 * The browser does not fire `storage` in the document that wrote, so this only
 * ever reports somebody else's change and cannot loop.
 */
export function watchAppTheme(onChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (event.key !== STORAGE_KEY) return;
    onChange(normalizeThemeId(event.newValue));
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
