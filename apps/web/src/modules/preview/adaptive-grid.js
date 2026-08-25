const ADAPTIVE_GRID_BASE_STEP = 1;
const ADAPTIVE_GRID_TARGET_PIXEL_SPACING = 48;
const ADAPTIVE_GRID_MIN_STEP = 0.01;
const ADAPTIVE_GRID_MAX_STEP = 100000;

function clampGridStep(value) {
  return Math.max(ADAPTIVE_GRID_MIN_STEP, Math.min(ADAPTIVE_GRID_MAX_STEP, value));
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

  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;
  const multiplier = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return clampGridStep(multiplier * magnitude);
}

export function resolveAdaptiveGridLod(options = {}) {
  const rawStep = resolveRawGridStep(options);
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const normalizedMagnitude = rawStep / magnitude;
  let fineMultiplier = 1;
  let coarseMultiplier = 2;
  if (normalizedMagnitude >= Math.sqrt(2) && normalizedMagnitude < Math.sqrt(10)) {
    fineMultiplier = 2;
    coarseMultiplier = 5;
  } else if (normalizedMagnitude >= Math.sqrt(10)) {
    fineMultiplier = 5;
    coarseMultiplier = 10;
  }
  const fineStep = clampGridStep(fineMultiplier * magnitude);
  const coarseStep = clampGridStep(coarseMultiplier * magnitude);
  const normalized = rawStep / fineStep;
  const blendStart = 1.05;
  const blendEnd = Math.max(blendStart + 0.1, (coarseStep / fineStep) * 0.85);
  const rawBlend = Math.max(0, Math.min(1, (normalized - blendStart) / (blendEnd - blendStart)));
  const blend = rawBlend * rawBlend * (3 - 2 * rawBlend);
  return { fineStep, coarseStep, blend };
}

export { ADAPTIVE_GRID_BASE_STEP };
