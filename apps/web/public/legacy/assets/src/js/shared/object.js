export function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function deepCopy(value) {
  return deepClone(value);
}

export function deepAssign(dst, src) {
  if (!src || typeof src !== "object") return;
  for (const key of Object.keys(src)) {
    const value = src[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!dst[key] || typeof dst[key] !== "object") dst[key] = {};
      deepAssign(dst[key], value);
      continue;
    }
    dst[key] = value;
  }
}
