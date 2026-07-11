import { normalizePointsBuilderProject } from '../pointsbuilder/defaults.js';
import { isGeneratorValueName } from './parameter-values.js';

export const GENERATOR_POINTS_BUILDER_STATE_KEY = 'egpb_pb_state_v1';
export const GENERATOR_POINTS_BUILDER_NAME_KEY = 'egpb_pb_project_name_v1';
export const GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY = 'egpb_pb_kotlin_end_v1';
export const GENERATOR_POINTS_BUILDER_CONTEXT_KEY = 'egpb_context_v2';
export const GENERATOR_POINTS_BUILDER_VARIABLE_CONTEXT_KEY = 'egpb_pb_comp_context_v1';

const TOOL_KEY = 'generator-pointsbuilder';
const KOTLIN_END_MODES = new Set(['builder', 'list', 'clone']);
const NUMERIC_TYPES = new Set(['Int', 'Long', 'Float', 'Double']);

function contextEntry(item, scope) {
  if (!isGeneratorValueName(item?.name)) return null;
  return {
    name: item.name,
    ref: item.name,
    type: String(item.type || 'Double'),
    value: String(item.value ?? ''),
    scope
  };
}

export function createGeneratorPointsBuilderVariableContext(parameters = {}) {
  const globalVars = (Array.isArray(parameters?.variables) ? parameters.variables : [])
    .map((item) => contextEntry(item, '变量'))
    .filter(Boolean);
  const globalConsts = (Array.isArray(parameters?.constants) ? parameters.constants : [])
    .map((item) => contextEntry(item, '常量'))
    .filter(Boolean);
  const numericMap = { PI: Math.PI };
  for (const item of [...globalVars, ...globalConsts]) {
    if (!NUMERIC_TYPES.has(item.type)) continue;
    const numeric = Number(item.value);
    if (Number.isFinite(numeric)) numericMap[item.name] = numeric;
  }
  return {
    source: 'generator',
    globalVars,
    globalConsts,
    localVars: [],
    numericMap
  };
}

function getLegacyState(source) {
  if (source?.state?.root && Array.isArray(source.state.root.children)) return source.state;
  if (source?.root && Array.isArray(source.root.children)) return source;
  return null;
}

export function matchesGeneratorPointsBuilderContext(context, identity) {
  return String(context?.projectId || '') === String(identity?.projectId || '')
    && String(context?.emitterId || '') === String(identity?.emitterId || '');
}

export function shouldReuseGeneratorPointsBuilderDraft(storedState, context, identity) {
  return Boolean(getLegacyState(storedState))
    && matchesGeneratorPointsBuilderContext(context, identity);
}

export function createGeneratorPointsBuilderSnapshot(builderState) {
  const normalized = normalizePointsBuilderProject(builderState, TOOL_KEY);
  return {
    state: normalized.state,
    projectName: normalized.name,
    kotlinEndMode: normalized.kotlinEndMode
  };
}

export function mergeGeneratorPointsBuilderSnapshot(
  builderState,
  storedState,
  { projectName = '', kotlinEndMode = '' } = {}
) {
  const normalized = normalizePointsBuilderProject(builderState, TOOL_KEY);
  const legacyState = getLegacyState(storedState);
  if (!legacyState) return normalized;

  return normalizePointsBuilderProject({
    ...normalized,
    name: String(projectName || normalized.name),
    kotlinEndMode: KOTLIN_END_MODES.has(kotlinEndMode)
      ? kotlinEndMode
      : normalized.kotlinEndMode,
    state: {
      ...legacyState,
      selection: normalized.state.selection
    }
  }, TOOL_KEY);
}
