/*
 * The glass material's two user-facing knobs, plus the pointer light.
 *
 * Theme choice lives in app-theme.js; this is its sibling for the *appearance of
 * the glass itself*:
 *
 *   blur   模糊度 — backdrop-filter radius, 0-48px
 *   frost  磨砂度 — how opaque the material is, 0-100
 *
 * Both are device preferences, not project data — exactly like the theme, and
 * for the same reason: saving them per Composition made the tools disagree with
 * each other. They are stored under one key and applied as two CSS custom
 * properties on <html>, which is all glass-theme.css needs; every surface reads
 * them from there.
 *
 * Because the shell and the builder iframes are same-origin, a write here raises
 * a `storage` event in every *other* document of the origin — the same mechanism
 * app-theme.js relies on to keep the tools in sync with no message plumbing.
 *
 * Kept dependency-free and framework-free so the legacy ES-module builders and
 * the Vue shell can both consume it.
 */

import { installCustomSelects } from './custom-select.js?v=20260825_2';

export const GLASS_SURFACE_KEY = 'coo-particles:glass-surface';

/* Mirrors the @property initial-values in shared/css/glass-theme.css. If you
 * change one, change the other — the stylesheet has to be complete on its own,
 * because it renders before this module runs. */
export const DEFAULT_GLASS_SURFACE = Object.freeze({ blur: 26, frost: 62 });

export const GLASS_SURFACE_LIMITS = Object.freeze({
    blur: Object.freeze({ min: 0, max: 48 }),
    frost: Object.freeze({ min: 0, max: 100 })
});

/*
 * Which elements the pointer light applies to.
 *
 * This is the single source of truth for "what counts as a glass surface" —
 * glass-theme.css paints `radial-gradient(... at var(--cp-glass-mx) ...)` on the
 * same selector lists, so the two must stay in step. Split in two because a
 * pointer over a button should light the button brightly *and* its panel
 * softly, the way light actually falls on stacked glass.
 */
const CONTROL_SELECTOR = [
    '.btn', '.tab', '.config-tab', '.right-tab',
    '.iconbtn', '.icon-btn', '.topbar-menu-trigger',
    '.card', '.card-item', '.node-item', '.project-item',
    '.emitter-list-card', '.queue-card', '.command-card', '.layer-card',
    '.node-card', '.preset-card', '.texture-card',
    '.hk-row', '.section-block', '.subgroup', '.kv-row', '.child-row',
    // The Vue shell's equivalents (WorkbenchPage.vue / PluginsPage.vue).
    '.project-row', '.recent-row', '.project-type-option', '.plugin-row',
    // The shell styles bare <button>s rather than giving them a .btn class.
    '.workbench-page button', '.plugins-header button'
].join(',');

const CONTAINER_SELECTOR = [
    '.topbar', '.panel', '.surface', '.settings-panel',
    '.code-panel', '.modal', '.topbar-submenu', '.snap-render-popover',
    // The Vue shell's equivalents.
    '.workbench-rail', '.create-dialog', '.plugins-header', '.plugins-section'
].join(',');

function clampInt(raw, { min, max }, fallback) {
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

/** Accepts an object, a JSON string, or junk; always returns a usable pair. */
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

export function readGlassSurface() {
    try {
        return normalizeGlassSurface(window.localStorage.getItem(GLASS_SURFACE_KEY));
    } catch {
        return { ...DEFAULT_GLASS_SURFACE };
    }
}

/**
 * Pushes the values onto <html> as the two custom properties glass-theme.css
 * reads. Registered with @property as inheriting, so setting them once at the
 * document root is enough for every surface below.
 */
export function applyGlassSurface(raw) {
    const value = normalizeGlassSurface(raw ?? readGlassSurface());
    if (typeof document !== 'undefined' && document.documentElement) {
        const style = document.documentElement.style;
        style.setProperty('--cp-glass-blur', `${value.blur}px`);
        style.setProperty('--cp-glass-frost', String(value.frost / 100));
    }
    return value;
}

/** Merges a partial update over the stored pair, persists, and applies it. */
export function writeGlassSurface(patch) {
    const value = normalizeGlassSurface({ ...readGlassSurface(), ...patch });
    try {
        window.localStorage.setItem(GLASS_SURFACE_KEY, JSON.stringify(value));
    } catch {
        // Storage disabled: the change applies for this session but will not persist.
    }
    applyGlassSurface(value);
    return value;
}

/**
 * Calls back when another document of this origin changes these values. Returns
 * a dispose function. The browser does not fire `storage` in the document that
 * performed the write, so this never echoes back to the writer.
 */
export function watchGlassSurface(onChange) {
    if (typeof window === 'undefined') return () => {};
    const handler = (event) => {
        if (event.key !== GLASS_SURFACE_KEY) return;
        onChange(normalizeGlassSurface(event.newValue));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
}

/* ------------------------------------------------------------------ controls */

/**
 * Binds whatever sliders the page happens to contain.
 *
 * The tools' settings panels only declare markup —
 * `<input type="range" data-glass-pref="blur">` and an optional
 * `[data-glass-pref-value="blur"]` readout — and this finds and drives them.
 * That keeps the wiring out of each builder's main.js, which is why adding the
 * feature to five tools did not mean editing five sets of event handlers.
 */
export function mountGlassSurfaceControls(root = document) {
    if (typeof document === 'undefined') return () => {};

    const inputs = [...root.querySelectorAll('input[data-glass-pref]')].filter((input) =>
        input.dataset.glassPref === 'blur' || input.dataset.glassPref === 'frost');
    if (!inputs.length) return () => {};

    const sync = (value) => {
        for (const input of inputs) {
            const key = input.dataset.glassPref;
            const next = String(value[key]);
            // Guard the assignment: writing .value while the user drags the same
            // slider snaps the thumb out from under the pointer.
            if (input.value !== next && document.activeElement !== input) input.value = next;
            const readout = root.querySelector(`[data-glass-pref-value="${key}"]`);
            if (readout) readout.textContent = key === 'blur' ? `${value[key]}px` : `${value[key]}%`;
        }
    };

    const onInput = (event) => {
        const key = event.currentTarget.dataset.glassPref;
        sync(writeGlassSurface({ [key]: event.currentTarget.value }));
    };

    for (const input of inputs) {
        const limits = GLASS_SURFACE_LIMITS[input.dataset.glassPref];
        input.min = String(limits.min);
        input.max = String(limits.max);
        input.step = '1';
        input.addEventListener('input', onInput);
    }

    sync(applyGlassSurface());
    const disposeWatch = watchGlassSurface((value) => {
        applyGlassSurface(value);
        sync(value);
    });

    return () => {
        for (const input of inputs) input.removeEventListener('input', onInput);
        disposeWatch();
    };
}

/* ------------------------------------------------------------- pointer light */

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

/**
 * Everything a page needs, in one call: apply the stored values, keep them in
 * sync with the other tools, bind any sliders, and light the glass.
 */
export function installGlassSurface() {
    applyGlassSurface();
    watchGlassSurface(applyGlassSurface);
    installGlassReveal();
    const mount = () => {
        mountGlassSurfaceControls();
        /*
         * Replace the native <select> popups. Those are drawn by the OS, outside
         * the page's compositing context: they cannot be translucent, and an
         * <optgroup>'s transparent background is painted white, which is why the
         * theme picker came out as dark rows with bright bands. Installed here so
         * a tool gets it from the one bootstrap call it already makes.
         */
        installCustomSelects();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
}
