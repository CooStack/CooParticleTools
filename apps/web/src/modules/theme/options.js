/*
 * Canonical theme list for the whole app.
 *
 * One list feeds the generator's settings modal, the app shell's theme picker,
 * and (by id) the legacy builders' <select>s, so a variant can never exist in
 * one place and be missing from another.
 */

export const FLAT_THEME_IDS = Object.freeze(['dark-1', 'light-1']);

export const GLASS_THEME_IDS = Object.freeze([
  'glass-dark-blue',
  'glass-dark-green',
  'glass-dark-violet',
  'glass-dark-neutral',
  'glass-light-blue',
  'glass-light-green',
  'glass-light-violet',
  'glass-light-neutral'
]);

export const THEME_OPTIONS = Object.freeze([
  { id: 'dark-1', label: '深色', group: '扁平' },
  { id: 'light-1', label: '浅色', group: '扁平' },
  { id: 'glass-dark-blue', label: '蓝', group: '玻璃拟态 · 深色' },
  { id: 'glass-dark-green', label: '绿', group: '玻璃拟态 · 深色' },
  { id: 'glass-dark-violet', label: '紫', group: '玻璃拟态 · 深色' },
  { id: 'glass-dark-neutral', label: '黑', group: '玻璃拟态 · 深色' },
  { id: 'glass-light-blue', label: '蓝', group: '玻璃拟态 · 浅色' },
  { id: 'glass-light-green', label: '绿', group: '玻璃拟态 · 浅色' },
  { id: 'glass-light-violet', label: '紫', group: '玻璃拟态 · 浅色' },
  { id: 'glass-light-neutral', label: '白', group: '玻璃拟态 · 浅色' }
]);

export const DEFAULT_THEME_ID = 'dark-1';

const KNOWN_IDS = new Set(THEME_OPTIONS.map((item) => item.id));
/*
 * 'light' is the bare short form from before the numbered ids existed. It has to
 * be here: the legacy builders' shared normalizer maps it to light-1, and if this
 * one sent it to the dark default instead, a stored 'light' would resolve to a
 * different theme in the shell than in a builder — the two would disagree about
 * what the current theme is, which is the whole failure mode this normalizer
 * exists to prevent. 'dark' needs no entry; it already lands on the default.
 */
const LEGACY_LIGHT_IDS = new Set(['light', 'light-1', 'light-2', 'light-3', 'light-pink']);

export function normalizeThemeId(raw) {
  const text = String(raw || '').trim();
  if (KNOWN_IDS.has(text)) return text;
  if (LEGACY_LIGHT_IDS.has(text)) return 'light-1';
  return DEFAULT_THEME_ID;
}

export function isGlassTheme(raw) {
  return String(raw || '').startsWith('glass-');
}

/**
 * Collapses consecutive same-group entries into groups, preserving order.
 * Shared by every <select> that renders THEME_OPTIONS.
 */
export function groupThemeOptions(options = THEME_OPTIONS) {
  const groups = [];
  for (const option of options) {
    const name = option.group || '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(option);
    else groups.push({ name, items: [option] });
  }
  return groups;
}
