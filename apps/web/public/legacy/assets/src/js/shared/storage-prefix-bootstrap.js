import { addDomReadyListener, postMessageSafe } from "./events.js";
import { safeStorageSet } from "./storage.js";

export function installStoragePrefixPatch({ prefix, guardProperty, keyPattern = /^pb_/, sharedKeys = [] }) {
  const safePrefix = String(prefix || "");
  const sharedKeySet = new Set((Array.isArray(sharedKeys) ? sharedKeys : []).map((key) => String(key)));
  const proto = Storage.prototype;
  if (proto[guardProperty]) return;

  const rawGet = proto.getItem;
  const rawSet = proto.setItem;
  const rawRemove = proto.removeItem;

  function mapKey(key) {
    const raw = String(key ?? "");
    if (sharedKeySet.has(raw)) return raw;
    return keyPattern.test(raw) ? `${safePrefix}${raw}` : raw;
  }

  proto.getItem = function getItemPatched(key) {
    return rawGet.call(this, mapKey(key));
  };
  proto.setItem = function setItemPatched(key, value) {
    return rawSet.call(this, mapKey(key), value);
  };
  proto.removeItem = function removeItemPatched(key) {
    return rawRemove.call(this, mapKey(key));
  };

  Object.defineProperty(proto, guardProperty, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export function hideRealtimeKotlinControls() {
  document.querySelector(".layout")?.classList.add("kotlin-hidden");
  const realtimeKotlin = document.getElementById("chkRealtimeKotlin");
  const realtimeLabel = realtimeKotlin?.closest("label");
  if (realtimeLabel) realtimeLabel.style.display = "none";
  if (realtimeKotlin) {
    realtimeKotlin.checked = false;
    realtimeKotlin.disabled = true;
  }
}

export function initStandaloneOrEmbeddedReturn({
  backButtonId,
  messageType,
  defaultReturnPage,
  queryReturnKey,
  writeStorage,
  hideKotlin = true,
}) {
  addDomReadyListener(() => {
    if (hideKotlin) hideRealtimeKotlinControls();

    const back = document.getElementById(backButtonId);
    if (!back) return;

    const params = new URLSearchParams(window.location.search);
    const returnPage = params.get(queryReturnKey) || defaultReturnPage;

    back.addEventListener("click", (ev) => {
      ev.preventDefault();

      try {
        window.dispatchEvent(new CustomEvent("coo-legacy-before-route-leave"));
      } catch {
      }

      try {
        writeStorage(params, localStorage);
      } catch {
      }

      if (window.parent && window.parent !== window) {
        postMessageSafe(window.parent, { type: messageType }, "*");
        return;
      }

      if (window.opener && !window.opener.closed) {
        postMessageSafe(window.opener, { type: messageType }, "*");
        window.close();
        return;
      }

      if (typeof window.__legacyNavigate === 'function') {
        window.__legacyNavigate(`./${returnPage}`);
        return;
      }
      window.location.href = `./${returnPage}`;
    });
  });
}

export function setOptionalStorage(storage, key, value) {
  if (!value) return;
  safeStorageSet(storage, key, String(value));
}
