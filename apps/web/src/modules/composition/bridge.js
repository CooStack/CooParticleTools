import { normalizeCompositionBuilderState } from './normalizer.js';

export const COMPOSITION_POINTS_BUILDER_DRAFT_KEY = 'blogs_composition_pointsbuilder_draft';
const CPB_RETURN_CARD_KEY = 'cpb_return_card_v1';
const CPB_RETURN_TARGET_KEY = 'cpb_return_target_v1';
const BEZIER_SEED_KEY = 'composition_bezier_seed_v1';
const BEZIER_RETURN_KEY = 'composition_bezier_return_v1';

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function saveCompositionPointsBuilderDraft(builderState) {
  writeJson(
    COMPOSITION_POINTS_BUILDER_DRAFT_KEY,
    normalizeCompositionBuilderState(builderState)
  );
}

export function loadCompositionPointsBuilderDraft() {
  return readJson(COMPOSITION_POINTS_BUILDER_DRAFT_KEY, null);
}

export function stashCompositionPointsBuilderReturn({ cardId = '', target = 'root' } = {}) {
  if (cardId) localStorage.setItem(CPB_RETURN_CARD_KEY, String(cardId));
  localStorage.setItem(CPB_RETURN_TARGET_KEY, String(target || 'root'));
}

export function consumeCompositionPointsBuilderReturn() {
  const payload = {
    cardId: localStorage.getItem(CPB_RETURN_CARD_KEY) || '',
    target: localStorage.getItem(CPB_RETURN_TARGET_KEY) || 'root'
  };
  localStorage.removeItem(CPB_RETURN_CARD_KEY);
  localStorage.removeItem(CPB_RETURN_TARGET_KEY);
  return payload;
}

export function openCompositionPointsBuilderBridge({ router, cardId, target = 'root', builderState }) {
  saveCompositionPointsBuilderDraft(builderState);
  const route = router.resolve({
    name: 'composition-pointsbuilder',
    query: {
      card: cardId,
      target,
      return: 'composition_builder.html'
    }
  });
  window.open(route.href, '_blank');
}

export function saveBezierSeed({ cardId = '', treePath = [], targetType = 'card', scaleHelper = null } = {}) {
  writeJson(BEZIER_SEED_KEY, {
    cardId,
    treePath: Array.isArray(treePath) ? treePath.map((item) => Number(item)) : [],
    targetType: String(targetType || 'card'),
    scaleHelper: scaleHelper || null
  });
}

export function loadBezierSeed() {
  return readJson(BEZIER_SEED_KEY, null);
}

export function saveBezierReturn({ cardId = '', treePath = [], targetType = 'card', p1, p2 } = {}) {
  writeJson(BEZIER_RETURN_KEY, {
    cardId,
    treePath: Array.isArray(treePath) ? treePath.map((item) => Number(item)) : [],
    targetType: String(targetType || 'card'),
    p1,
    p2
  });
}

export function consumeBezierReturn() {
  const payload = readJson(BEZIER_RETURN_KEY, null);
  localStorage.removeItem(BEZIER_RETURN_KEY);
  return payload;
}

export function openBezierBridge({ router, cardId, treePath = [], targetType = 'card', scaleHelper }) {
  saveBezierSeed({ cardId, treePath, targetType, scaleHelper });
  const route = router.resolve({
    name: 'bezier',
    query: {
      return: 'composition',
      card: cardId,
      target: targetType,
      treePath: Array.isArray(treePath) && treePath.length ? treePath.join('.') : ''
    }
  });
  window.open(route.href, '_blank', 'noopener');
}
