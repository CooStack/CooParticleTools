export function cubicBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return {
    x: (u ** 3) * p0.x + 3 * (u ** 2) * t * p1.x + 3 * u * (t ** 2) * p2.x + (t ** 3) * p3.x,
    y: (u ** 3) * p0.y + 3 * (u ** 2) * t * p1.y + 3 * u * (t ** 2) * p2.y + (t ** 3) * p3.y
  };
}

export function sampleBezier(p1, p2, count = 32) {
  const p0 = { x: 0, y: 0 };
  const p3 = { x: 1, y: 1 };
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    return cubicBezierPoint(t, p0, p1, p2, p3);
  });
}
