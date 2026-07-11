import "./legacy-utils.global.js";

export function installUtilsGlobal() {
  if (!globalThis.Utils) {
    throw new Error("Utils global is not available after compat installation");
  }
  return globalThis.Utils;
}
