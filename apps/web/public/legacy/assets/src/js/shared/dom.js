export function resolveElement(target, root = document) {
  if (target && typeof target === "object" && "nodeType" in target) return target;
  if (typeof target === "string") return root.querySelector(target);
  return null;
}

export function resolveRequiredElement(target, root = document) {
  const el = resolveElement(target, root);
  if (!el) {
    throw new Error(`Required element not found: ${String(target)}`);
  }
  return el;
}

export function onDomReady(handler) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handler, { once: true });
    return;
  }
  handler();
}
