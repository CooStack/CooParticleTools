import { emitKotlin } from './builder-tools.js';
import { POINTS_NODE_KINDS } from './kinds.js';
import { normalizePointsBuilderProject } from './normalizer.js';

export { builderFormatters } from './builder-tools.js';

const INTEGER_PARAMETER_KEYS = new Set([
  'c', 'count', 'count1', 'count2', 'counts', 'countW', 'countH', 'countPow',
  'totalCount', 'dottedCount', 'sideCount', 'edgeCount', 'n', 'minCircleCount',
  'maxCircleCount', 'preCircleCount', 'preLineCount', 'seed'
]);

export function generatePointsBuilderKotlin(project, options = {}) {
  const normalized = normalizePointsBuilderProject(project, project?.tool || 'pointsbuilder');
  coerceExternalDoubleExpressions(normalized.state.root.children, options.coerceDoubleExpression);
  return emitKotlin(normalized);
}

function coerceExternalDoubleExpressions(nodes, coerceDoubleExpression) {
  if (typeof coerceDoubleExpression !== 'function') return;
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const doubleKeys = new Set((POINTS_NODE_KINDS[node?.kind]?.fields || [])
      .filter((field) => field.type === 'number' && !INTEGER_PARAMETER_KEYS.has(field.key))
      .map((field) => field.key));
    for (const key of doubleKeys) {
      if (node?.params?.[key] === undefined) continue;
      node.params[key] = coerceDoubleExpression(node.params[key]);
    }
    for (const term of Array.isArray(node?.terms) ? node.terms : []) {
      for (const key of ['r', 'w', 'startAngle']) {
        if (term?.[key] !== undefined) term[key] = coerceDoubleExpression(term[key]);
      }
    }
    coerceExternalDoubleExpressions(node?.children, coerceDoubleExpression);
  }
}
