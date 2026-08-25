/*
 * The one theme store for the whole product.
 *
 * Every builder used to keep its own localStorage key (pb_theme_v2 /
 * pe_theme_v2 / a shader key / CPB_...), which is why the emitter, points,
 * composition and shader tools each remembered a different theme. They all read
 * and write this module instead, so picking a theme anywhere applies everywhere.
 *
 * The shell and the builder iframes are same-origin, so a write here raises a
 * `storage` event in every *other* document of the origin -- that is what makes
 * the sync live, in both directions, with no message plumbing.
 *
 * Kept dependency-free and framework-free so the legacy ES-module builders and
 * the Vue shell can share it verbatim.
 */

export const APP_THEME_KEY = 'coo-particles:app-theme';
export const DEFAULT_THEME = 'dark-1';

export const FLAT_THEMES = ['dark-1', 'light-1'];
export const GLASS_THEMES = [
  'glass-dark-blue',
  'glass-dark-green',
  'glass-dark-violet',
  'glass-dark-neutral',
  'glass-light-blue',
  'glass-light-green',
  'glass-light-violet',
  'glass-light-neutral'
];
export const ALL_THEMES = [...FLAT_THEMES, ...GLASS_THEMES];

const KNOWN = new Set(ALL_THEMES);

/** Maps retired ids and the old short forms onto something that exists. */
export function normalizeTheme(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (KNOWN.has(text)) return text;
  if (text === 'dark') return 'dark-1';
  if (text === 'light' || ['light-1', 'light-2', 'light-3', 'light-pink'].includes(text)) return 'light-1';
  return DEFAULT_THEME;
}

export function readAppTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(APP_THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Applies to <body data-theme>, which is what every stylesheet keys off. */
export function applyAppTheme(raw) {
  const theme = normalizeTheme(raw);
  if (typeof document !== 'undefined' && document.body) {
    document.body.setAttribute('data-theme', theme);
  }
  return theme;
}

export function writeAppTheme(raw) {
  const theme = normalizeTheme(raw);
  try {
    window.localStorage.setItem(APP_THEME_KEY, theme);
  } catch {
    // Storage disabled: the choice applies for this session but will not persist.
  }
  return theme;
}

/**
 * Calls back when another document of this origin changes the theme. Returns a
 * dispose function. Note the browser does not fire `storage` in the document
 * that performed the write, so this never echoes back to the writer.
 */
export function watchAppTheme(onChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (event.key !== APP_THEME_KEY) return;
    onChange(normalizeTheme(event.newValue));
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
