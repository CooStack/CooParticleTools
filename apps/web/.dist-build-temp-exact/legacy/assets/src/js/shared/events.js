export function postMessageSafe(targetWindow, payload, targetOrigin = "*") {
  if (!targetWindow || typeof targetWindow.postMessage !== "function") return false;
  try {
    targetWindow.postMessage(payload, targetOrigin);
    return true;
  } catch {
    return false;
  }
}

export function addDomReadyListener(handler) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handler, { once: true });
    return;
  }
  handler();
}
