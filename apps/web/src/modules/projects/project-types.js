import { createGeneratorProject } from '../generator/defaults.js';

function safeProjectName(rawName, fallback) {
  return String(rawName || '').trim() || String(fallback || '').trim();
}

function unwrapCompositionState(payload) {
  return payload?.state || payload;
}

function withoutCompositionPreferences(payload) {
  const state = unwrapCompositionState(payload);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const { settings, hotkeys, ...project } = state;
  return project;
}

function compositionPreferencesFromDraft(payload) {
  const state = unwrapCompositionState(payload);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const preferences = {};
  if (state.settings && typeof state.settings === 'object' && !Array.isArray(state.settings)) {
    preferences.settings = state.settings;
  }
  if (state.hotkeys && typeof state.hotkeys === 'object' && !Array.isArray(state.hotkeys)) {
    preferences.hotkeys = state.hotkeys;
  }
  return Object.keys(preferences).length ? preferences : null;
}

function pointsBuilderPreferencesFromDraft(payload) {
  const source = Array.isArray(payload) ? { presets: payload } : payload;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const preferences = {};
  if (Array.isArray(source.presets)) preferences.presets = source.presets;
  if (Array.isArray(source.groups)) preferences.groups = source.groups;
  return Object.keys(preferences).length ? preferences : null;
}

function defineProject(definition) {
  return Object.freeze({
    ...definition,
    id: definition.type,
    aliases: Object.freeze([...(definition.aliases || [])]),
    legacy: definition.legacy ? Object.freeze({ ...definition.legacy }) : null
  });
}

export const PROJECT_DEFINITIONS = Object.freeze([
  defineProject({
    type: 'generator',
    route: 'generator',
    aliases: ['emitter', 'emitter-generator'],
    defaultName: 'EmitterGenerator',
    initial: 'G',
    label: '粒子发射器',
    shortLabel: 'Generator',
    description: '编辑发射器、命令队列和生命周期参数。',
    create(rawName, config = {}) {
      const name = safeProjectName(rawName, 'EmitterGenerator');
      return createGeneratorProject({
        name,
        kotlin: {
          className: name.replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedEmitter',
          packageName: String(config.packageName || '').trim(),
          baseClass: 'AutoParticleEmitters',
          mapping: config.mapping === 'mojmap' ? 'mojmap' : 'yarn'
        }
      });
    },
    nameOf(payload, fallback = 'EmitterGenerator') {
      return safeProjectName(payload?.name, fallback);
    },
    detect(payload) {
      return Array.isArray(payload?.emitters)
        && Boolean(payload?.kotlin || payload?.rootLifecycle || payload?.commandQueues);
    }
  }),
  defineProject({
    type: 'composition',
    route: 'composition',
    defaultName: 'NewComposition',
    initial: 'C',
    label: 'Composition',
    shortLabel: 'Composition',
    description: '组合粒子卡片并生成 Composition 代码。',
    create(rawName, config = {}) {
      return {
        tool: 'composition',
        schemaVersion: 1,
        projectName: safeProjectName(rawName, 'NewComposition'),
        packageName: String(config.packageName || '').trim() || 'cn.coostack.compositions',
        mapping: config.mapping === 'mojmap' ? 'mojmap' : 'yarn',
        compositionType: 'particle',
        cards: []
      };
    },
    nameOf(payload, fallback = 'NewComposition') {
      return safeProjectName(payload?.projectName, fallback);
    },
    detect(payload, fileName = '') {
      if (String(fileName || '').toLowerCase().endsWith('.composition.json')) return true;
      return Array.isArray(payload?.cards)
        && Boolean(payload?.compositionType || payload?.projectName || payload?.compositionAxisExpr);
    },
    legacy: {
      page: 'composition_builder.html',
      storageKey: 'cb_state_v1',
      preferencesStorageKey: 'cb_preferences_v1',
      preferencesFromDraft: compositionPreferencesFromDraft,
      toDraft(payload) {
        return withoutCompositionPreferences(payload);
      },
      fromDraft(draft) {
        return withoutCompositionPreferences(draft);
      },
      toFile(payload, projectName) {
        return {
          ...withoutCompositionPreferences(payload),
          tool: 'composition',
          projectName
        };
      }
    }
  }),
  defineProject({
    type: 'pointsbuilder',
    route: 'pointsbuilder',
    aliases: ['points-builder'],
    defaultName: 'PointsBuilderProject',
    initial: 'P',
    label: 'PointsBuilder',
    shortLabel: 'PointsBuilder',
    description: '构建路径、曲线和点阵。',
    create(rawName) {
      return {
        tool: 'pointsbuilder',
        schemaVersion: 1,
        projectName: safeProjectName(rawName, 'PointsBuilderProject'),
        root: {
          id: 'root',
          kind: 'ROOT',
          children: []
        }
      };
    },
    nameOf(payload, fallback = 'PointsBuilderProject') {
      return safeProjectName(payload?.projectName, fallback);
    },
    detect(payload) {
      const state = payload?.state?.root ? payload.state : payload;
      return Boolean(state?.root && Array.isArray(state.root.children));
    },
    legacy: {
      page: 'pointsbuilder.html',
      storageKey: 'pb_state_v1',
      nameStorageKey: 'pb_project_name_v1',
      preferencesStorageKey: 'pb_presets_v1',
      preferencesFromDraft: pointsBuilderPreferencesFromDraft,
      toDraft(payload) {
        const state = payload?.state?.root ? payload.state : payload;
        return { state, ts: Date.now() };
      },
      fromDraft(draft) {
        return draft?.state?.root ? draft.state : draft;
      },
      toFile(payload, projectName) {
        return {
          ...payload,
          tool: 'pointsbuilder',
          schemaVersion: 1,
          projectName
        };
      }
    }
  }),
  defineProject({
    type: 'shader-builder',
    route: 'shader-builder',
    aliases: ['shader', 'shaderbuilder'],
    defaultName: 'shader-workbench',
    initial: 'S',
    label: 'Shader Builder',
    shortLabel: 'Shader',
    description: '编辑 RendererAPI 着色器与后处理链。',
    create(rawName) {
      return {
        tool: 'shader-builder',
        schema: 'shader_builder_project_v1',
        projectName: safeProjectName(rawName, 'shader-workbench')
      };
    },
    nameOf(payload, fallback = 'shader-workbench') {
      return safeProjectName(payload?.projectName, fallback);
    },
    detect(payload) {
      return String(payload?.schema || '') === 'shader_builder_project_v1'
        || Boolean(payload?.model?.shader && payload?.post && Array.isArray(payload.post.nodes));
    },
    legacy: {
      page: 'shader_builder.html',
      storageKey: 'sb_project_v1',
      toDraft(payload) {
        return payload;
      },
      fromDraft(draft) {
        return draft;
      },
      toFile(payload, projectName) {
        return {
          ...payload,
          tool: 'shader-builder',
          schema: 'shader_builder_project_v1',
          projectName
        };
      }
    }
  })
]);

export const PROJECT_TYPES = PROJECT_DEFINITIONS;

const PROJECT_DEFINITION_MAP = new Map(
  PROJECT_DEFINITIONS.map((definition) => [definition.type, definition])
);
const PROJECT_TYPE_ALIASES = new Map(
  PROJECT_DEFINITIONS.flatMap((definition) => (
    definition.aliases.map((alias) => [alias, definition.type])
  ))
);
const LEGACY_PROJECT_DEFINITION_MAP = new Map(
  PROJECT_DEFINITIONS
    .filter((definition) => definition.legacy)
    .map((definition) => [definition.legacy.page, definition])
);

export function normalizeProjectType(rawType) {
  const text = String(rawType || '').trim().toLowerCase();
  const normalized = PROJECT_TYPE_ALIASES.get(text) || text;
  return PROJECT_DEFINITION_MAP.has(normalized) ? normalized : '';
}

export function getProjectDefinition(rawType) {
  return PROJECT_DEFINITION_MAP.get(normalizeProjectType(rawType)) || null;
}

export function getLegacyProjectDefinition(rawPage) {
  return LEGACY_PROJECT_DEFINITION_MAP.get(String(rawPage || '').trim()) || null;
}

export function getProjectType(rawType) {
  return getProjectDefinition(rawType);
}

export function projectNameForTypeChange(rawName, nextType, edited = false) {
  const currentName = String(rawName ?? '');
  const nextDefault = getProjectDefinition(nextType)?.defaultName || 'NewProject';
  return edited ? currentName : nextDefault;
}

export function getProjectRoute(rawType) {
  return getProjectDefinition(rawType)?.route || '';
}

export function createProjectPayload(rawType, rawName, config = {}) {
  const definition = getProjectDefinition(rawType);
  if (!definition) {
    throw new Error('请选择项目类型。');
  }
  return definition.create(rawName, config);
}

function unwrapProjectRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { recordType: '', payload: raw };
  }
  const recordType = normalizeProjectType(raw.tool || raw.projectType);
  let payload = raw;
  if (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)) {
    payload = raw.payload;
  } else if (
    raw.state
    && typeof raw.state === 'object'
    && !Array.isArray(raw.state)
    && (raw.state.root || raw.state.cards || raw.state.emitters || raw.state.model)
  ) {
    payload = raw.state;
  }
  return { recordType, payload };
}

function detectByStructure(payload, fileName) {
  const candidates = PROJECT_DEFINITIONS
    .filter((definition) => definition.detect(payload, fileName))
    .map((definition) => definition.type);

  if (candidates.length > 1) {
    throw new Error(`项目类型冲突：同时匹配 ${candidates.join('、')}。`);
  }
  return candidates[0] || '';
}

export function classifyProjectData(raw, fileName = '') {
  const { recordType, payload } = unwrapProjectRecord(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('项目文件必须是 JSON 对象。');
  }

  const recordDeclaration = String(raw?.tool || raw?.projectType || '').trim();
  const payloadDeclaration = String(payload.tool || payload.projectType || '').trim();
  if (recordDeclaration && !normalizeProjectType(recordDeclaration)) {
    throw new Error(`不支持的项目类型：${recordDeclaration}。`);
  }
  if (payloadDeclaration && !normalizeProjectType(payloadDeclaration)) {
    throw new Error(`不支持的项目类型：${payloadDeclaration}。`);
  }

  const payloadType = normalizeProjectType(payload.tool || payload.projectType);
  const structuralType = detectByStructure(payload, fileName);
  const declaredType = recordType || payloadType;
  const type = declaredType || structuralType;
  if (!type) {
    throw new Error('无法识别项目类型。请从项目页创建项目，或检查 JSON 的 tool 字段。');
  }
  if (recordType && payloadType && recordType !== payloadType) {
    throw new Error(`项目类型冲突：索引为 ${recordType}，内容为 ${payloadType}。`);
  }
  if (declaredType && structuralType && declaredType !== structuralType) {
    throw new Error(`项目类型冲突：声明为 ${declaredType}，内容结构为 ${structuralType}。`);
  }

  return { type, payload };
}

export function parseProjectText(text, fileName = '') {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw new Error('项目文件不是有效的 JSON。');
  }
  return classifyProjectData(parsed, fileName);
}
