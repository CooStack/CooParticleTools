const ADAPTIVE_GRID_BASE_STEP = 1;
const ADAPTIVE_GRID_TARGET_PIXEL_SPACING = 48;
const ADAPTIVE_GRID_MIN_EXPONENT = -7;
const ADAPTIVE_GRID_MAX_EXPONENT = 17;

function clampGridExponent(value, maximum = ADAPTIVE_GRID_MAX_EXPONENT) {
  return Math.max(ADAPTIVE_GRID_MIN_EXPONENT, Math.min(maximum, value));
}

function resolveRawGridStep({ distance, fov = 55, viewportHeight, targetPixelSpacing = ADAPTIVE_GRID_TARGET_PIXEL_SPACING } = {}) {
  const safeDistance = Number(distance);
  const safeFov = Number(fov);
  const safeViewportHeight = Number(viewportHeight);
  const safeTargetPixelSpacing = Number(targetPixelSpacing);
  if (![safeDistance, safeFov, safeViewportHeight, safeTargetPixelSpacing].every(Number.isFinite)) {
    return ADAPTIVE_GRID_BASE_STEP;
  }

  const visibleHeight = 2 * Math.max(0.001, safeDistance) * Math.tan(Math.max(1, safeFov) * Math.PI / 360);
  const rawStep = visibleHeight * Math.max(1, safeTargetPixelSpacing) / Math.max(1, safeViewportHeight);
  return rawStep > 0 ? rawStep : ADAPTIVE_GRID_BASE_STEP;
}

export function resolveAdaptiveGridStep(options = {}) {
  const rawStep = resolveRawGridStep(options);
  const exponent = clampGridExponent(Math.round(Math.log2(rawStep / ADAPTIVE_GRID_BASE_STEP)));
  return ADAPTIVE_GRID_BASE_STEP * (2 ** exponent);
}

export function resolveAdaptiveGridLod(options = {}) {
  const rawStep = resolveRawGridStep(options);
  const exponent = clampGridExponent(
    Math.floor(Math.log2(rawStep / ADAPTIVE_GRID_BASE_STEP)),
    ADAPTIVE_GRID_MAX_EXPONENT - 1
  );
  const fineStep = ADAPTIVE_GRID_BASE_STEP * (2 ** exponent);
  const coarseStep = fineStep * 2;
  const normalized = rawStep / fineStep;
  const blendStart = 1.05;
  const blendEnd = Math.max(blendStart + 0.1, (coarseStep / fineStep) * 0.85);
  const rawBlend = Math.max(0, Math.min(1, (normalized - blendStart) / (blendEnd - blendStart)));
  const blend = rawBlend * rawBlend * (3 - 2 * rawBlend);
  return { fineStep, coarseStep, blend };
}

export { ADAPTIVE_GRID_BASE_STEP };
