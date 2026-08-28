import { normalizePointsBuilderProject } from '../pointsbuilder/defaults.js';
import { readAutoSaveIntervals, readCurrentBackupEnabled } from '../preferences/auto-save.js';
import {
  collectGeneratorValueEntries,
  isGeneratorNumericType
} from './bindings.js';

export const GENERATOR_POINTS_BUILDER_STATE_KEY = 'egpb_pb_state_v1';
export const GENERATOR_POINTS_BUILDER_NAME_KEY = 'egpb_pb_project_name_v1';
export const GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY = 'egpb_pb_kotlin_end_v1';
export const GENERATOR_POINTS_BUILDER_CONTEXT_KEY = 'egpb_context_v2';
export const GENERATOR_POINTS_BUILDER_VARIABLE_CONTEXT_KEY = 'egpb_pb_comp_context_v1';

const TOOL_KEY = 'generator-pointsbuilder';
const KOTLIN_END_MODES = new Set(['builder', 'list', 'clone']);

function contextEntry(item, scope) {
  return {
    name: item.name,
    ref: item.name,
    type: String(item.type || 'Double'),
    value: String(item.value ?? ''),
    scope
  };
}

export function createGeneratorPointsBuilderVariableContext(parameters = {}) {
  const entries = collectGeneratorValueEntries(parameters);
  const globalVars = entries
    .filter((entry) => entry.scope === 'variable')
    .map((entry) => contextEntry(entry.value, '变量'));
  const globalConsts = entries
    .filter((entry) => entry.scope === 'constant')
    .map((entry) => contextEntry(entry.value, '常量'));
  const numericMap = { PI: Math.PI };
  for (const item of [...globalVars, ...globalConsts]) {
    if (!isGeneratorNumericType(item.type)) continue;
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

export async function saveGeneratorPointsBuilderProject({
  projectRepository,
  shell,
  projectId,
  project
} = {}) {
  const id = String(projectId || '');
  if (!id || !projectRepository?.save) return false;

  const snapshot = JSON.parse(JSON.stringify(project || {}));
  const existing = typeof projectRepository.get === 'function'
    ? await projectRepository.get('generator', id)
    : null;
  const filePath = String(existing?.filePath || '');
  if (filePath) {
    if (!shell?.saveProjectFile) {
      throw new Error('当前环境无法自动保存这个 Generator 项目文件。');
    }
    const text = JSON.stringify(snapshot, null, 2);
    if (shell.autoSaveProjectFile) {
      const backup = await shell.autoSaveProjectFile({
        filePath,
        text,
        intervals: readAutoSaveIntervals(),
        currentBackupEnabled: readCurrentBackupEnabled()
      });
      if (!backup?.ok) {
        throw new Error(backup?.message || 'Generator 项目自动备份失败。');
      }
    }
    const result = await shell.saveProjectFile({
      title: '自动保存 Generator 项目',
      filePath,
      addToRecent: false,
      text
    });
    if (!result?.ok) {
      throw new Error(result?.message || 'Generator 项目自动保存失败。');
    }
  }

  await projectRepository.save({
    id,
    tool: 'generator',
    name: snapshot.name || snapshot.kotlin?.className || 'EmitterGenerator',
    description: snapshot.description || '',
    filePath,
    payload: snapshot
  });
  return true;
}
