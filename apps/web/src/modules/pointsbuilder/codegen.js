import { emitKotlin } from './builder-tools.js';
import { normalizePointsBuilderProject } from './normalizer.js';

export { builderFormatters } from './builder-tools.js';

export function generatePointsBuilderKotlin(project) {
  const normalized = normalizePointsBuilderProject(project, project?.tool || 'pointsbuilder');
  return emitKotlin(normalized);
}
