import { getElectronShell } from '../../services/shell/electron-shell.js';

/*
 * The glass material's two knobs, for the Vue shell.
 *
 * Sibling of app-theme.js, and the same two-layer story for the same reason:
 *
 *   localStorage — the synchronous cache. The builder iframes read it during
 *     bootstrap and cannot await IPC, and because they are same-origin a write
 *     here raises a `storage` event in the others, which is what keeps the tools
 *     in sync live.
 *
 *   Electron preferences.json — the durable copy. The desktop shell serves the
 *     renderer from http://127.0.0.1:<port> with a port allocated fresh on every
 *     launch, so the origin changes and localStorage starts empty each time.
 *     Anything that must outlive a launch has to go through the shell's store.
 *
 * This is a deliberate near-duplicate of
 * public/legacy/assets/shared/js/glass-surface.js — the legacy builders live in
 * public/ and cannot import from src/, exactly as with the theme. Keep the two
 * in step; the key, the defaults and the limits must agree or a slider in one
 * tool will clamp differently from the same slider in another.
 */

const STORAGE_KEY = 'coo-particles:glass-surface';
const PREFERENCE_KEY = 'glassSurface';

/* Mirrors the @property initial-values in
 * public/legacy/assets/shared/css/glass-theme.css. */
export const DEFAULT_GLASS_SURFACE = Object.freeze({ blur: 26, frost: 62 });

export const GLASS_SURFACE_LIMITS = Object.freeze({
  blur: Object.freeze({ min: 0, max: 48 }),
  frost: Object.freeze({ min: 0, max: 100 })
});

function clampInt(raw, { min, max }, fallback) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeGlassSurface(raw) {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (!source || typeof source !== 'object') return { ...DEFAULT_GLASS_SURFACE };
  return {
    blur: clampInt(source.blur, GLASS_SURFACE_LIMITS.blur, DEFAULT_GLASS_SURFACE.blur),
    frost: clampInt(source.frost, GLASS_SURFACE_LIMITS.frost, DEFAULT_GLASS_SURFACE.frost)
  };
}

function readCache() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeCache(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / disabled storage: applies for this session only.
  }
}

export function readGlassSurface() {
  return normalizeGlassSurface(readCache());
}

/**
 * Pushes the values onto <html> as the two custom properties glass-theme.css
 * reads. They are registered with @property as inheriting, so the document root
 * is the only place they need to be set.
 */
export function applyGlassSurface(raw) {
  if (typeof document === 'undefined') return { ...DEFAULT_GLASS_SURFACE };
  const value = normalizeGlassSurface(raw ?? readGlassSurface());
  const style = document.documentElement.style;
  style.setProperty('--cp-glass-blur', `${value.blur}px`);
  style.setProperty('--cp-glass-frost', String(value.frost / 100));
  notifyListeners(value);
  return value;
}

/** Merges a partial update over the stored pair, persists, and applies it. */
export function writeGlassSurface(patch) {
  const value = normalizeGlassSurface({ ...readGlassSurface(), ...patch });
  writeCache(value);
  applyGlassSurface(value);
  // Durable copy; fire-and-forget so dragging a slider stays instant.
  void persistGlassSurface(value);
  return value;
}

async function persistGlassSurface(value) {
  const shell = getElectronShell();
  if (!shell?.writePreferences) return;
  try {
    await shell.writePreferences(PREFERENCE_KEY, value);
  } catch {
    // Web build, or the store is unavailable: the cache still holds it.
  }
}

/**
 * Pulls the durable values into the cache and applies them. Call once at
 * startup, before the shell paints, so a fresh-origin launch recovers the real
 * choice instead of falling back to the defaults.
 */
export async function hydrateGlassSurface() {
  const shell = getElectronShell();
  if (!shell?.readPreferences) return applyGlassSurface();
  try {
    const result = await shell.readPreferences(PREFERENCE_KEY);
    const stored = result?.ok ? result.value : result;
    if (stored && (typeof stored === 'object' || typeof stored === 'string')) {
      const value = normalizeGlassSurface(stored);
      writeCache(value);
      return applyGlassSurface(value);
    }
    // Nothing durable yet: promote whatever this origin happens to have so the
    // first run after this change keeps the user's current settings.
    const cached = readCache();
    if (cached) void persistGlassSurface(normalizeGlassSurface(cached));
  } catch {
    // Fall through to the cache.
  }
  return applyGlassSurface();
}

const listeners = new Set();

function notifyListeners(value) {
  for (const listener of listeners) {
    try {
      listener(value);
    } catch {
      // A broken subscriber must not stop the values from applying.
    }
  }
}

/**
 * Fires whenever the applied values change, including the async hydrate at
 * startup. UI that mirrors them needs this: it reads the cache during setup, and
 * on a fresh-origin launch the durable values only arrive afterwards. Returns a
 * dispose function.
 */
export function onGlassSurfaceChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Subscribes to changes made in another document of this origin — in practice a
 * builder iframe's own sliders. Also writes them through to the durable store,
 * because the iframes have no Electron bridge of their own: the shell is what
 * makes a change made inside a builder survive a restart.
 *
 * The browser does not fire `storage` in the document that wrote, so this only
 * ever reports somebody else's change and cannot loop.
 */
export function watchGlassSurface(onChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    if (event.key !== STORAGE_KEY) return;
    const value = normalizeGlassSurface(event.newValue);
    applyGlassSurface(value);
    void persistGlassSurface(value);
    onChange?.(value);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/* ------------------------------------------------------------- pointer light */

/*
 * Which elements the accent rim light applies to. Single source of truth for
 * "what counts as a glass surface" — glass-theme.css paints
 * `radial-gradient(... at var(--cp-glass-mx) ...)` on the same selector lists,
 * so the two must stay in step. Split in two because a pointer over a button
 * should light the button brightly *and* its panel softly, the way light
 * actually falls on stacked glass.
 */
const CONTROL_SELECTOR = [
  '.btn', '.tab', '.config-tab', '.right-tab',
  '.iconbtn', '.icon-btn', '.topbar-menu-trigger',
  '.card', '.card-item', '.node-item', '.project-item',
  '.emitter-list-card', '.queue-card', '.command-card', '.layer-card',
  '.parameter-editor', '.axis-curve-box', '.definition-row', '.resource-card',
  '.generator-right .editor-section', '.command-param-grid', '.selector-editor',
  '.mask-choice-list', '.force-vector-field',
  '.node-card', '.preset-card', '.texture-card',
  '.hk-row', '.section-block', '.subgroup', '.kv-row', '.child-row',
  // Vue shell equivalents (WorkbenchPage.vue / PluginsPage.vue).
  '.project-row', '.recent-row', '.project-type-option', '.plugin-row',
  // The shell styles bare <button>s rather than giving them a .btn class.
  '.workbench-page button', '.plugins-header button'
].join(',');

const CONTAINER_SELECTOR = [
  '.topbar', '.generator-topbar', '.panel', '.generator-panel', '.surface', '.settings-panel',
  '.code-panel', '.modal', '.topbar-submenu', '.snap-render-popover',
  // Vue shell equivalents.
  '.workbench-rail', '.create-dialog', '.plugins-header', '.plugins-section'
].join(',');

let revealInstalled = false;

/**
 * The accent rim light that follows the pointer across glass surfaces.
 *
 * One delegated listener for the whole document, coalesced to one write per
 * animation frame. The coordinates go onto the surface as --cp-glass-mx/my,
 * which glass-theme.css registers with `inherits: false` — so writing them
 * invalidates style for that one element rather than its whole subtree, which is
 * what makes this affordable on a page with hundreds of cards.
 *
 * "Not hovered" is expressed by the registered initial value parking the light
 * far off-screen, so leaving a surface just means removing the properties.
 */
export function installGlassReveal() {
  if (typeof window === 'undefined' || revealInstalled) return () => {};
  // Someone who asked the OS to reduce motion should not get a light chasing
  // their cursor. The stylesheet parks it too, so this is belt and braces.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return () => {};
  revealInstalled = true;

  // [{ element, rect }] — the surfaces currently carrying the light, with their
  // geometry cached. See the note on rectsDirty below.
  let lit = [];
  let rectsDirty = false;
  let pending = null;
  let frame = 0;

  const isGlass = (element) => {
    const themed = element.closest('[data-theme]');
    return !!themed && String(themed.dataset.theme || '').startsWith('glass-');
  };

  const douse = (entries) => {
    for (const { element } of entries) {
      element.style.removeProperty('--cp-glass-mx');
      element.style.removeProperty('--cp-glass-my');
    }
  };

  const paint = () => {
    frame = 0;
    const event = pending;
    pending = null;
    if (!event) return;

    const target = event.target;
    let control = null;
    let container = null;
    if (target instanceof Element && isGlass(target)) {
      control = target.closest(CONTROL_SELECTOR);
      container = target.closest(CONTAINER_SELECTOR);
      if (container === control) container = null;
    }
    const wanted = control && container ? [control, container] : (control || container ? [control || container] : []);

    /*
    * Only measure when the surfaces under the pointer actually change.
    *
    * getBoundingClientRect() after having written a custom property forces a
    * synchronous layout flush, so measuring on every frame of a pointermove
    * makes the whole document's layout the cost of moving the mouse. The
    * geometry cannot change while the pointer stays over the same elements,
    * except via a scroll or a resize — which set rectsDirty instead of
    * measuring eagerly, so the read still happens at most once per frame.
    */
    const unchanged = !rectsDirty
      && wanted.length === lit.length
      && wanted.every((element, i) => lit[i].element === element);

    if (!unchanged) {
      douse(lit.filter((entry) => !wanted.includes(entry.element)));
      lit = wanted.map((element) => ({ element, rect: element.getBoundingClientRect() }));
      rectsDirty = false;
    }

    for (const { element, rect } of lit) {
      element.style.setProperty('--cp-glass-mx', `${event.clientX - rect.left}px`);
      element.style.setProperty('--cp-glass-my', `${event.clientY - rect.top}px`);
    }
  };

  const onMove = (event) => {
    pending = event;
    if (!frame) frame = window.requestAnimationFrame(paint);
  };

  const onLeave = () => {
    pending = null;
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    douse(lit);
    lit = [];
  };

  // Cheap: no measuring here, just a note to re-measure on the next frame.
  const onGeometryChange = () => {
    rectsDirty = true;
  };

  const onOut = (event) => {
    // pointerout with no relatedTarget means the pointer left the document.
    if (!event.relatedTarget) onLeave();
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerout', onOut, { passive: true });
  window.addEventListener('blur', onLeave);
  // Capture, because most scrolling here happens in inner panels, not on window.
  window.addEventListener('scroll', onGeometryChange, { passive: true, capture: true });
  window.addEventListener('resize', onGeometryChange, { passive: true });

  return () => {
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerout', onOut);
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('scroll', onGeometryChange, { capture: true });
    window.removeEventListener('resize', onGeometryChange);
    onLeave();
    revealInstalled = false;
  };
}
