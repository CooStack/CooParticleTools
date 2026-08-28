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
let numericObserverInstalled = false;
let selectObserverInstalled = false;
const liveNumericInstances = new Set();

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

/*
 * Legacy numeric fields use the same interaction contract as the Vue control:
 * the input remains a normal editable/selectable field, while only the narrow
 * right-hand rail acts as a vertical scrub handle. A click on the rail alone
 * is intentionally inert; movement is required before a value changes.
 */
function numericStep(input) {
    const value = Number(input.dataset.cpNumberStep || input.step);
    return Number.isFinite(value) && value > 0 ? value : 0.01;
}

function hasPureNumericValue(input) {
    const value = String(input.value ?? '').trim();
    return value !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
}

export function numericScrubValue(start, pixels, input, scale = 1) {
    const step = numericStep(input);
    let next = Number(start) + Number(pixels || 0) * step * scale;
    const minText = String(input.min ?? '').trim();
    const maxText = String(input.max ?? '').trim();
    const min = minText ? Number(minText) : Number.NaN;
    const max = maxText ? Number(maxText) : Number.NaN;
    if (Number.isFinite(min)) next = Math.max(min, next);
    if (Number.isFinite(max)) next = Math.min(max, next);
    const precision = Math.min(8, Math.max(0, (String(step).split('.')[1] || '').length + (scale < 1 ? 1 : 0)));
    const rounded = Number(next.toFixed(precision));
    return Object.is(rounded, -0) ? 0 : rounded;
}

function makeNumericSvg(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    node.setAttribute('d', path);
    svg.appendChild(node);
    return svg;
}

function enhanceNumericInput(input) {
    if (!(input instanceof HTMLInputElement)) return null;
    if (input.dataset.cpNumber === 'on') {
        // Cloned inspector fields carry the marker but not the live scrubber
        // instance. Unwrap those stale wrappers so the enhancer can bind a new
        // custom numeric control.
        const hasLiveInstance = [...liveNumericInstances].some((item) => item.input === input);
        if (hasLiveInstance) return null;
        const staleRoot = input.closest('.cp-number');
        if (staleRoot) staleRoot.replaceWith(input);
        input.removeAttribute('data-cp-number');
        input.classList.remove('cp-number-native');
        input.tabIndex = 0;
    }
    if (input.dataset.cpNumberSkip === 'on'
        || (input.type !== 'number' && !input.hasAttribute('data-pb-expression-input'))
        || input.closest('.numeric-input')
        || input.closest('.cp-number')) return null;

    input.dataset.cpNumber = 'on';
    const wrapper = document.createElement('div');
    wrapper.className = 'cp-number';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.classList.add('cp-number-native');

    const stepper = document.createElement('div');
    stepper.className = 'cp-number-stepper';
    stepper.setAttribute('role', 'presentation');
    stepper.setAttribute('aria-hidden', 'true');
    const up = document.createElement('span');
    up.className = 'cp-number-step cp-number-step-up';
    up.appendChild(makeNumericSvg('m2.2 7.6 3.8-3.8 3.8 3.8'));
    const down = document.createElement('span');
    down.className = 'cp-number-step cp-number-step-down';
    down.appendChild(makeNumericSvg('m2.2 4.4 3.8 3.8 3.8-3.8'));
    stepper.append(up, down);
    wrapper.appendChild(stepper);

    let scrubState = null;
    let lastNumericValue = Number.isFinite(Number(input.value)) ? Number(input.value) : null;
    const sync = () => {
        const disabled = input.disabled || !hasPureNumericValue(input);
        wrapper.classList.toggle('cp-number--disabled', disabled);
        stepper.classList.toggle('cp-number-stepper--disabled', disabled);
    };
    const dispatchValue = (value, commit = false) => {
        input.value = String(value);
        lastNumericValue = Number.isFinite(Number(value)) ? Number(value) : lastNumericValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const move = (event) => {
        if (!scrubState || !Number.isFinite(scrubState.startValue)) return;
        const pixels = scrubState.startY - event.clientY;
        if (!scrubState.active && Math.abs(pixels) < 2) return;
        scrubState.active = true;
        event.preventDefault();
        const scale = event.shiftKey ? 0.1 : (event.ctrlKey || event.metaKey) ? 10 : 1;
        dispatchValue(numericScrubValue(scrubState.startValue, pixels, input, scale));
    };
    const finish = (event) => {
        if (!scrubState) return;
        const active = scrubState.active;
        scrubState = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (active) {
            event?.preventDefault?.();
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sync();
    };
    const start = (event) => {
        if (event.button !== 0 || input.disabled || !hasPureNumericValue(input)) return;
        const startValue = Number(input.value);
        if (!Number.isFinite(startValue)) return;
        lastNumericValue = startValue;
        event.preventDefault();
        stepper.setPointerCapture?.(event.pointerId);
        scrubState = { startY: event.clientY, startValue, active: false };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
    };
    stepper.addEventListener('pointerdown', start);
    stepper.addEventListener('pointerup', finish);
    stepper.addEventListener('pointercancel', finish);
    stepper.addEventListener('contextmenu', (event) => event.preventDefault());
    input.addEventListener('input', () => {
        if (hasPureNumericValue(input)) lastNumericValue = Number(input.value);
        sync();
    });
    input.addEventListener('change', () => {
        if (hasPureNumericValue(input)) lastNumericValue = Number(input.value);
        sync();
    });
    sync();

    const instance = { input, wrapper, sync, destroy() {
        if (scrubState) finish();
        liveNumericInstances.delete(instance);
        stepper.remove();
        input.classList.remove('cp-number-native');
        input.dataset.cpNumber = '';
        wrapper.replaceWith(input);
    }};
    liveNumericInstances.add(instance);
    return instance;
}

function installNumericInputs(root = document) {
    if (typeof document === 'undefined' || !root?.querySelectorAll) return;
    for (const input of root.querySelectorAll('input.input[type="number"]:not([data-cp-number="on"]), input.input[data-pb-expression-input]:not([data-cp-number="on"])')) {
        enhanceNumericInput(input);
    }
    if (numericObserverInstalled || typeof MutationObserver !== 'function') return;
    numericObserverInstalled = true;
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.('input.input[type="number"], input.input[data-pb-expression-input]')) enhanceNumericInput(node);
                installNumericInputs(node);
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
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

function sameModel(left, right) {
    if (left.length !== right.length) return false;
    return left.every((row, index) => {
        const other = right[index];
        return row.type === other?.type
            && row.value === other.value
            && row.label === other.label
            && row.disabled === other.disabled;
    });
}

function enhance(select) {
    if (select.dataset.cpSelect === 'on') {
        // A cloned inspector card copies the enhanced native select, but DOM
        // cloning does not copy this module's event listeners or WeakMap entry.
        // Treat that markup as a stale enhancement and rebuild it in place.
        if (instances.has(select)) return null;
        const staleRoot = select.closest('.cp-select');
        if (staleRoot) staleRoot.replaceWith(select);
        select.removeAttribute('data-cp-select');
        select.classList.remove('cp-select-native');
        select.removeAttribute('aria-hidden');
        select.tabIndex = 0;
    }
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
    panel.dataset.state = 'closed';
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
    let lastValue = select.value;
    let lastLabel = '';
    let lastDisabled = select.disabled;
    let closeTimer = 0;

    const optionRows = () => rows
        .map((row, index) => ({ row, index }))
        .filter((entry) => entry.row.type === 'option' && !entry.row.disabled);

    const syncTriggerText = () => {
        const current = select.options[select.selectedIndex];
        text.textContent = current?.textContent?.trim() || '';
    };

    const syncDisabledState = () => {
        trigger.disabled = select.disabled;
        trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
        if (select.disabled && openInstance?.trigger === trigger) closeOpen();
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

    const render = (nextRows = readModel(select)) => {
        const previousActiveValue = rows[activeIndex]?.value;
        rows = nextRows;
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
        syncDisabledState();
        const nextActive = rows.findIndex((row) => row.type === 'option' && row.value === previousActiveValue && !row.disabled);
        const selectedActive = rows.findIndex((row) => row.type === 'option' && row.value === select.value && !row.disabled);
        activeIndex = nextActive >= 0 ? nextActive : selectedActive;
        if (activeIndex >= 0) {
            for (const el of optionEls) {
                const isActive = Number(el.dataset.index) === activeIndex;
                el.classList.toggle('active', isActive);
                if (isActive) panel.setAttribute('aria-activedescendant', el.id);
            }
        } else {
            panel.removeAttribute('aria-activedescendant');
        }
    };

    const commit = (value) => {
        if (select.disabled) return;
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
        if (select.disabled) return;
        if (openInstance === instance) return;
        closeOpen();
        if (closeTimer) window.clearTimeout(closeTimer);
        render();
        panel.hidden = false;
        panel.dataset.state = 'closed';
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
        requestAnimationFrame(() => {
            if (openInstance === instance) panel.dataset.state = 'open';
        });
    };

    const close = () => {
        if (panel.hidden) return;
        panel.dataset.state = 'closed';
        root.classList.remove(OPEN_CLASS);
        trigger.setAttribute('aria-expanded', 'false');
        panel.removeAttribute('aria-activedescendant');
        if (openInstance === instance) openInstance = null;
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const hide = () => {
            closeTimer = 0;
            panel.hidden = true;
        };
        if (reducedMotion) hide();
        else {
            if (closeTimer) window.clearTimeout(closeTimer);
            closeTimer = window.setTimeout(hide, 180);
        }
    };

    const syncState = () => {
        if (!select.isConnected) {
            instance.destroy();
            return;
        }
        const nextRows = readModel(select);
        const modelChanged = !sameModel(rows, nextRows);
        const selectedLabel = select.options[select.selectedIndex]?.textContent?.trim() || '';
        const valueChanged = select.value !== lastValue;
        const labelChanged = selectedLabel !== lastLabel;
        const disabledChanged = select.disabled !== lastDisabled;
        if (valueChanged || labelChanged) syncTriggerText();
        if (disabledChanged) syncDisabledState();
        if (openInstance === instance && (modelChanged || valueChanged || labelChanged || disabledChanged)) {
            render(nextRows);
            place();
        }
        lastValue = select.value;
        lastLabel = selectedLabel;
        lastDisabled = select.disabled;
    };

    let modelObserver = null;
    const destroy = () => {
        if (openInstance === instance) close();
        if (closeTimer) window.clearTimeout(closeTimer);
        modelObserver?.disconnect();
        panel.remove();
        instances.delete(select);
        liveInstances.delete(instance);
    };

    const instance = { root, panel, trigger, place, close, render, syncTriggerText, syncState, destroy };

    trigger.addEventListener('click', () => {
        if (select.disabled) return;
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
        if (select.disabled) return;
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

    /*
     * Option labels and disabled flags can change without replacing the select.
     * Re-render an open popup immediately; closed controls are also mirrored by
     * the lightweight state loop below, which catches property-only v-model
     * assignments that MutationObserver cannot see.
     */
    if (typeof MutationObserver === 'function') {
        modelObserver = new MutationObserver(() => {
            syncState();
        });
        modelObserver.observe(select, {
            attributes: true,
            attributeFilter: ['disabled', 'label', 'selected', 'value'],
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    render();
    lastLabel = text.textContent;
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
const liveInstances = new Set();

function isEnhanceableSelect(node, selector) {
    return node?.nodeType === 1
        && node.matches?.(selector)
        && !node.multiple
        && node.size <= 1;
}

function installSelectObserver(selector) {
    if (selectObserverInstalled || typeof MutationObserver !== 'function' || !document.body) return;
    selectObserverInstalled = true;
    const observer = new MutationObserver((records) => {
        let hasNewControls = false;
        for (const record of records) {
            for (const node of record.removedNodes || []) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.('.cp-select, select[data-cp-select="on"]')
                    || node.querySelector?.('.cp-select, select[data-cp-select="on"]')) {
                    hasNewControls = true;
                }
            }
            for (const node of record.addedNodes || []) {
                if (node.nodeType !== 1) continue;
                if (isEnhanceableSelect(node, selector)) {
                    const instance = enhance(node);
                    if (instance) {
                        instances.set(node, instance);
                        liveInstances.add(instance);
                    }
                    continue;
                }
                if (node.matches?.(selector) || node.querySelector?.(selector)) {
                    hasNewControls = true;
                    installCustomSelects(node, selector);
                }
            }
        }
        if (hasNewControls) refreshCustomSelects(document);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Replaces the native popup on every matching <select>.
 *
 * Idempotent: a select that has already been enhanced is skipped, so this is safe
 * to call again after a tool rebuilds part of its DOM.
 */
export function installCustomSelects(root = document, selector = 'select:not([multiple]):not([size])') {
    if (typeof document === 'undefined') return;
    installGlobals();
    installSelectObserver(selector);
    installNumericInputs(root);
    if (isEnhanceableSelect(root, selector)) {
        const instance = enhance(root);
        if (instance) {
            instances.set(root, instance);
            liveInstances.add(instance);
        }
    }
    for (const select of root.querySelectorAll(selector)) {
        // A multiple/size select is a list box, not a dropdown; leave it alone.
        if (select.multiple || select.size > 1) continue;
        const instance = enhance(select);
        if (instance) {
            instances.set(select, instance);
            liveInstances.add(instance);
        }
    }
}

/**
 * Mirrors property-only framework updates and removes panels whose selects were
 * unmounted. Call after a host UI update; opening a dropdown also re-renders its
 * model, so this never needs a permanent animation-frame polling loop.
 */
export function refreshCustomSelects(root = document) {
    if (typeof document === 'undefined') return;
    for (const instance of [...liveInstances]) {
        if (!instance.root.isConnected) instance.destroy();
    }
    for (const select of root.querySelectorAll('select[data-cp-select="on"]')) {
        instances.get(select)?.syncState();
    }
    for (const instance of [...liveNumericInstances]) {
        if (!instance.input.isConnected) instance.destroy();
        else instance.sync();
    }
}

/**
 * Re-reads a select whose <option>s were rebuilt by its tool. Without this the
 * panel would still show the old rows.
 */
export function refreshCustomSelect(select) {
    instances.get(select)?.syncState();
}
