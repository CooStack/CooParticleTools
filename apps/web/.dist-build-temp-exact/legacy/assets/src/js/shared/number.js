export function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toInt(value, fallback = 0) {
  return Math.trunc(safeNum(value, fallback));
}

export function formatFixedTrim(value, digits = 6) {
  const n = safeNum(value, 0);
  if (Math.abs(n) < 1e-12) return "0";
  return n.toFixed(digits).replace(/0+$/g, "").replace(/\.$/, "");
}
