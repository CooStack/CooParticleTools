/*
 * A custom dropdown that replaces the native <select> popup.
 *
 * Why this exists: the native popup is drawn by the OS, outside the page's
 * compositing context. It cannot be translucent, it ignores most CSS, and an
 * <optgroup>'s transparent background is painted WHITE — so the theme picker
 * came out as dark rows interrupted by bright bands while every other dropdown
 * looked uniform. Styling `option`/`optgroup` is the limit of what CSS can reach,
 * and it was not enough.
 *
 * Design constraint: this is a *progressive enhancement*, not a replacement API.
 * The original <select> stays in the DOM, keeps its id, keeps its value, and
 * still emits `change` — so every tool's existing
 * `themeSelect.addEventListener("change", ...)` and `themeSelect.value = x`
 * keeps working untouched. This only hides the native control visually and
 * drives it from a listbox that the page paints itself.
 *
 * Accessibility: the trigger carries the ARIA combobox roles, the panel is a
 * listbox with roles on each row, and the keyboard model matches a native
 * select (Up/Down/Home/End/Enter/Escape/typeahead).
 */

const OPEN_CLASS = 'cp-select-open';

/** Tracks the panel that is currently open, so only one can ever be. */
let openInstance = null;

function closeOpen() {
    if (openInstance) openInstance.close();
}

/*
 * One document-level listener pair rather than per-instance: a page can hold
 * dozens of selects, and the outside-click / Escape handling is identical for
 * all of them.
 */
let globalsInstalled = false;

function installGlobals() {
    if (globalsInstalled || typeof document === 'undefined') return;
    globalsInstalled = true;

    document.addEventListener('pointerdown', (event) => {
        if (!openInstance) return;
        // The panel is portaled to <body> so transformed/ clipped modals cannot
        // change its fixed-position containing block. Treat both halves of the
        // control as inside clicks.
        if (openInstance.root.contains(event.target) || openInstance.panel.contains(event.target)) return;
        closeOpen();
    }, true);

    document.addEventListener('keydown', (event) => {
        if (!openInstance) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            const instance = openInstance;
            instance.close();
            instance.trigger.focus();
        }
    }, true);

    /*
     * An ancestor scrolling moves the anchor out from under a fixed panel, so the
     * panel has to follow it — NOT close.
     *
     * Closing was the first attempt and it made the dropdown look broken: clicking
     * the trigger focuses it, the browser scrolls the enclosing modal to bring the
     * focused control into view, and that scroll arrived one frame after open().
     * Traced as `EVENT scroll <- modal inRoot=false` immediately followed by
     * `hidden=true` — the panel opened and vanished before it could be seen.
     *
     * Repositioning is also just better behaviour: scrolling a panel behind an
     * open dropdown keeps the dropdown attached to its control.
     */
    window.addEventListener('scroll', (event) => {
        if (!openInstance) return;
        const target = event.target;
        // The panel scrolls its own rows; that does not move the anchor.
        if (target instanceof Node && openInstance.panel.contains(target)) return;
        openInstance.place();
    }, true);

    window.addEventListener('resize', closeOpen);
}

/** Reads the <select>'s options and groups into a flat, renderable model. */
function readModel(select) {
    const rows = [];
    for (const node of select.children) {
        if (node.tagName === 'OPTGROUP') {
            rows.push({ type: 'group', label: node.label });
            for (const option of node.children) {
                if (option.tagName !== 'OPTION') continue;
                rows.push({
                    type: 'option',
                    value: option.value,
                    label: option.textContent.trim(),
                    disabled: option.disabled
                });
            }
        } else if (node.tagName === 'OPTION') {
            rows.push({
                type: 'option',
                value: node.value,
                label: node.textContent.trim(),
                disabled: node.disabled
            });
        }
    }
    return rows;
}

function enhance(select) {
    if (select.dataset.cpSelect === 'on') return null;
    select.dataset.cpSelect = 'on';

    const root = document.createElement('div');
    root.className = 'cp-select';
    // Inherit the sizing the host tool gave the select, so the control keeps its
    // place in whatever grid or flex row it was sitting in.
    if (select.classList.contains('theme-select')) root.classList.add('cp-select-theme');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cp-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'listbox');
    if (select.title) trigger.title = select.title;
    const label = select.getAttribute('aria-label');
    if (label) trigger.setAttribute('aria-label', label);

    const text = document.createElement('span');
    text.className = 'cp-select-value';
    const caret = document.createElement('span');
    caret.className = 'cp-select-caret';
    caret.setAttribute('aria-hidden', 'true');
    trigger.append(text, caret);

    const panel = document.createElement('div');
    panel.className = 'cp-select-panel';
    panel.setAttribute('role', 'listbox');
    panel.hidden = true;

    select.parentNode.insertBefore(root, select);
    root.append(trigger);
    // Keep the popup out of modal stacking/overflow/transform contexts. Its
    // coordinates are viewport-relative, so it must live under the document
    // body rather than inside the select's transformed ancestor.
    document.body.appendChild(panel);
    // The native control stays for its value/change contract, but is taken out
    // of the layout and the tab order.
    root.appendChild(select);
    select.classList.add('cp-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    let rows = [];
    let optionEls = [];
    let activeIndex = -1;
    let typeahead = '';
    let typeaheadTimer = 0;

    const optionRows = () => rows
        .map((row, index) => ({ row, index }))
        .filter((entry) => entry.row.type === 'option' && !entry.row.disabled);

    const syncTriggerText = () => {
        const current = rows.find((row) => row.type === 'option' && row.value === select.value);
        text.textContent = current ? current.label : (select.options[select.selectedIndex]?.text || '');
    };

    const setActive = (index, { scroll = true } = {}) => {
        activeIndex = index;
        for (const el of optionEls) {
            const isActive = Number(el.dataset.index) === index;
            el.classList.toggle('active', isActive);
            if (isActive) {
                // Skipped on open: nothing is scrolled yet, and the scroll event
                // would be one more thing for the outside-click logic to filter.
                if (scroll) el.scrollIntoView({ block: 'nearest' });
                panel.setAttribute('aria-activedescendant', el.id);
            }
        }
    };

    const render = () => {
        rows = readModel(select);
        panel.textContent = '';
        optionEls = [];

        rows.forEach((row, index) => {
            if (row.type === 'group') {
                const group = document.createElement('div');
                group.className = 'cp-select-group';
                group.setAttribute('role', 'presentation');
                group.textContent = row.label;
                panel.appendChild(group);
                return;
            }
            const option = document.createElement('div');
            option.className = 'cp-select-option';
            option.id = `cp-opt-${Math.abs(hash(select.id + row.value + index))}`;
            option.setAttribute('role', 'option');
            option.dataset.index = String(index);
            option.dataset.value = row.value;
            option.textContent = row.label;
            if (row.disabled) {
                option.classList.add('disabled');
                option.setAttribute('aria-disabled', 'true');
            }
            if (row.value === select.value) {
                option.classList.add('selected');
                option.setAttribute('aria-selected', 'true');
            } else {
                option.setAttribute('aria-selected', 'false');
            }
            panel.appendChild(option);
            optionEls.push(option);
        });

        syncTriggerText();
    };

    const commit = (value) => {
        if (select.value === value) return;
        select.value = value;
        // The tools listen for `change`; a programmatic .value assignment does not
        // fire one, so it has to be dispatched explicitly.
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    /*
     * The panel is `position: fixed` and placed here rather than with CSS.
     *
     * Every tool puts these selects inside a panel or modal with
     * `overflow: hidden`, which would clip an absolutely-positioned dropdown to
     * the row it lives in. Fixed positioning escapes the clip; the trade-off is
     * that the coordinates have to be recomputed on open and while ancestors
     * scroll, which installGlobals handles.
     */
    const place = () => {
        const anchor = trigger.getBoundingClientRect();
        panel.style.minWidth = `${Math.round(anchor.width)}px`;
        panel.style.left = `${Math.round(anchor.left)}px`;

        // Measure before deciding the direction, then flip up if there is more
        // room above than below.
        panel.style.top = '0px';
        panel.style.maxHeight = '';
        const height = panel.offsetHeight;
        const below = window.innerHeight - anchor.bottom - 8;
        const above = anchor.top - 8;
        const flip = height > below && above > below;

        panel.style.maxHeight = `${Math.max(120, Math.round(flip ? above : below))}px`;
        panel.style.top = flip
            ? `${Math.round(anchor.top - Math.min(height, above) - 6)}px`
            : `${Math.round(anchor.bottom + 6)}px`;
    };

    const open = () => {
        if (openInstance === instance) return;
        closeOpen();
        render();
        panel.hidden = false;
        root.classList.add(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'true');
        openInstance = instance;
        place();
        const current = optionRows().find((entry) => entry.row.value === select.value);
        // The panel has only just been shown, so there is nothing to scroll to
        // yet — and scrolling here used to close the panel again immediately.
        setActive(current ? current.index : (optionRows()[0]?.index ?? -1), { scroll: false });
        // Now that a row is marked, bring it into view if the list is long.
        panel.querySelector('.cp-select-option.active')?.scrollIntoView({ block: 'nearest' });
    };

    const close = () => {
        panel.hidden = true;
        root.classList.remove(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'false');
        panel.removeAttribute('aria-activedescendant');
        if (openInstance === instance) openInstance = null;
    };

    const instance = { root, panel, trigger, place, close, render, syncTriggerText };

    trigger.addEventListener('click', () => {
        if (openInstance === instance) close();
        else open();
    });

    panel.addEventListener('click', (event) => {
        const option = event.target.closest('.cp-select-option');
        if (!option || option.classList.contains('disabled')) return;
        commit(option.dataset.value);
        close();
        trigger.focus();
    });

    panel.addEventListener('pointermove', (event) => {
        const option = event.target.closest('.cp-select-option');
        if (!option || option.classList.contains('disabled')) return;
        setActive(Number(option.dataset.index));
    });

    const step = (delta) => {
        const entries = optionRows();
        if (!entries.length) return;
        const at = entries.findIndex((entry) => entry.index === activeIndex);
        const next = entries[Math.min(entries.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))];
        setActive(next.index);
    };

    trigger.addEventListener('keydown', (event) => {
        const isOpen = openInstance === instance;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) return open();
            return step(event.key === 'ArrowDown' ? 1 : -1);
        }
        if (event.key === 'Home' || event.key === 'End') {
            if (!isOpen) return;
            event.preventDefault();
            const entries = optionRows();
            if (entries.length) setActive(event.key === 'Home' ? entries[0].index : entries[entries.length - 1].index);
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!isOpen) return open();
            const row = rows[activeIndex];
            if (row && row.type === 'option' && !row.disabled) commit(row.value);
            close();
            return;
        }
        if (event.key === 'Tab') {
            close();
            return;
        }
        // Typeahead, as a native select does.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            typeahead += event.key.toLowerCase();
            window.clearTimeout(typeaheadTimer);
            typeaheadTimer = window.setTimeout(() => { typeahead = ''; }, 700);
            const hit = optionRows().find((entry) => entry.row.label.toLowerCase().startsWith(typeahead));
            if (hit) {
                if (isOpen) setActive(hit.index);
                else commit(hit.row.value);
            }
        }
    });

    /*
     * The tools change the select from their own code — applyTheme() assigns
     * .value, and the shared theme watcher does too. Mirroring that back into the
     * trigger label is what keeps this in sync with the rest of the app.
     */
    select.addEventListener('change', () => {
        syncTriggerText();
        for (const el of optionEls) {
            const isSelected = el.dataset.value === select.value;
            el.classList.toggle('selected', isSelected);
            el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        }
    });

    render();
    return instance;
}

/** Small stable hash, only used to build unique option element ids. */
function hash(text) {
    let value = 0;
    for (let i = 0; i < text.length; i += 1) {
        value = (value * 31 + text.charCodeAt(i)) | 0;
    }
    return value;
}

const instances = new WeakMap();

/**
 * Replaces the native popup on every matching <select>.
 *
 * Idempotent: a select that has already been enhanced is skipped, so this is safe
 * to call again after a tool rebuilds part of its DOM.
 */
export function installCustomSelects(root = document, selector = 'select.input, select.theme-select') {
    if (typeof document === 'undefined') return;
    installGlobals();
    for (const select of root.querySelectorAll(selector)) {
        // A multiple/size select is a list box, not a dropdown; leave it alone.
        if (select.multiple || select.size > 1) continue;
        const instance = enhance(select);
        if (instance) instances.set(select, instance);
    }
}

/**
 * Re-reads a select whose <option>s were rebuilt by its tool. Without this the
 * panel would still show the old rows.
 */
export function refreshCustomSelect(select) {
    instances.get(select)?.render();
}
