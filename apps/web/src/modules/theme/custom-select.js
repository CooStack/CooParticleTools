/*
 * Progressive enhancement for selects rendered by the Vue shell.
 *
 * The legacy builders already share the implementation in public/ so keep one
 * runtime copy instead of forking the dropdown behaviour. The native select
 * remains in the DOM (and therefore keeps Vue's v-model/change contract); only
 * its popup is replaced with the themed listbox.
 */

const SELECTOR = 'select:not([multiple]):not([size])';

let installerPromise = null;
let observer = null;
let scanQueued = false;
const pendingRefreshTargets = new Set();

async function loadInstaller() {
  if (!installerPromise) {
    const moduleUrl = new URL(
      'legacy/assets/shared/js/custom-select.js?v=20260827_2',
      document.baseURI
    ).href;
    installerPromise = import(/* @vite-ignore */ moduleUrl)
      .then((module) => ({
        install: module.installCustomSelects,
        refresh: module.refreshCustomSelect,
        refreshAll: module.refreshCustomSelects
      }));
  }
  return installerPromise;
}

function queueScan(root, refreshTargets = []) {
  for (const target of refreshTargets) {
    if (target?.tagName === 'SELECT') pendingRefreshTargets.add(target);
  }
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(async () => {
    scanQueued = false;
    try {
      const installer = await loadInstaller();
      installer.install(root, SELECTOR);
      // Vue may rebuild option lists without replacing the select element.
      // Refresh the shared listbox model so newly-added signs, masks, and force
      // types appear immediately in the custom popup.
      if (installer.refresh) {
        for (const select of pendingRefreshTargets) {
          if (select.isConnected) installer.refresh(select);
        }
      }
      installer.refreshAll?.(root);
      pendingRefreshTargets.clear();
    } catch (error) {
      // Native selects remain usable if a hosted build omits public assets.
      console.warn('Custom select enhancement unavailable:', error);
    }
  });
}

/**
 * Installs the shared custom select on shell controls and watches Vue updates
 * for newly-rendered selects (for example force parameter fields).
 */
export function installShellCustomSelects(root = document) {
  if (typeof document === 'undefined') return () => {};
  queueScan(root);

  if (!observer && typeof MutationObserver === 'function') {
    observer = new MutationObserver((records) => {
      const refreshTargets = new Set();
      let needsInstall = false;
      let needsCleanup = false;
      for (const record of records) {
        const target = record.target?.nodeType === Node.TEXT_NODE
          ? record.target.parentElement
          : record.target;
        const select = target?.closest?.('select');
        if (select) refreshTargets.add(select);
        for (const node of record.addedNodes || []) {
          if (node?.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.(SELECTOR) || node.querySelector?.(SELECTOR)) needsInstall = true;
        }
        for (const node of record.removedNodes || []) {
          if (node?.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.('.cp-select, select[data-cp-select="on"]')
            || node.querySelector?.('.cp-select, select[data-cp-select="on"]')) needsCleanup = true;
        }
      }
      if (needsInstall || needsCleanup || refreshTargets.size) queueScan(root, refreshTargets);
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['disabled', 'label', 'selected', 'value'],
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  return () => {
    observer?.disconnect();
    observer = null;
  };
}

/** Refreshes existing enhanced selects after framework property-only updates. */
export function refreshShellCustomSelects(root = document) {
  if (typeof document === 'undefined') return;
  void loadInstaller().then((installer) => {
    installer.refreshAll?.(root);
  }).catch(() => {
    // Native selects remain usable when the shared legacy asset is unavailable.
  });
}
