import { createGeneratorProject } from '../generator/defaults.js';

export const PROJECT_TYPES = Object.freeze([
  {
    id: 'generator',
    route: 'generator',
    label: '粒子发射器',
    shortLabel: 'Generator',
    description: '编辑发射器、命令队列和生命周期参数。'
  },
  {
    id: 'composition',
    route: 'composition',
    label: 'Composition',
    shortLabel: 'Composition',
    description: '组合粒子卡片并生成 Composition 代码。'
  },
  {
    id: 'pointsbuilder',
    route: 'pointsbuilder',
    label: 'PointsBuilder',
    shortLabel: 'PointsBuilder',
    description: '构建路径、曲线和点阵。'
  },
  {
    id: 'shader-builder',
    route: 'shader-builder',
    label: 'Shader Builder',
    shortLabel: 'Shader',
    description: '编辑 RendererAPI 着色器与后处理链。'
  }
]);

const PROJECT_TYPE_MAP = new Map(PROJECT_TYPES.map((item) => [item.id, item]));
const PROJECT_TYPE_ALIASES = Object.freeze({
  emitter: 'generator',
  'emitter-generator': 'generator',
  shader: 'shader-builder',
  shaderbuilder: 'shader-builder',
  'points-builder': 'pointsbuilder'
});

export function normalizeProjectType(rawType) {
  const text = String(rawType || '').trim().toLowerCase();
  const normalized = PROJECT_TYPE_ALIASES[text] || text;
  return PROJECT_TYPE_MAP.has(normalized) ? normalized : '';
}

export function getProjectType(rawType) {
  return PROJECT_TYPE_MAP.get(normalizeProjectType(rawType)) || null;
}

export function getProjectRoute(rawType) {
  return getProjectType(rawType)?.route || '';
}

function safeProjectName(rawName, fallback) {
  return String(rawName || '').trim() || fallback;
}

export function createProjectPayload(rawType, rawName) {
  const type = normalizeProjectType(rawType);
  if (!type) {
    throw new Error('请选择项目类型。');
  }

  if (type === 'generator') {
    const name = safeProjectName(rawName, 'EmitterGenerator');
    return createGeneratorProject({
      name,
      kotlin: {
        className: name.replace(/[^a-zA-Z0-9_]/g, '') || 'GeneratedEmitter',
        packageName: '',
        baseClass: 'AutoParticleEmitters'
      }
    });
  }

  if (type === 'composition') {
    return {
      tool: type,
      schemaVersion: 1,
      projectName: safeProjectName(rawName, 'NewComposition'),
      compositionType: 'particle',
      cards: []
    };
  }

  if (type === 'pointsbuilder') {
    return {
      tool: type,
      schemaVersion: 1,
      projectName: safeProjectName(rawName, 'PointsBuilderProject'),
      root: {
        id: 'root',
        kind: 'ROOT',
        children: []
      }
    };
  }

  return {
    tool: type,
    schema: 'shader_builder_project_v1',
    projectName: safeProjectName(rawName, 'shader-workbench')
  };
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
  const candidates = new Set();
  if (String(payload?.schema || '') === 'shader_builder_project_v1') {
    candidates.add('shader-builder');
  }

  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.composition.json')) {
    candidates.add('composition');
  }

  if (Array.isArray(payload?.emitters) && (payload?.kotlin || payload?.rootLifecycle || payload?.commandQueues)) {
    candidates.add('generator');
  }

  if (
    Array.isArray(payload?.cards)
    && (payload?.compositionType || payload?.projectName || payload?.compositionAxisExpr)
  ) {
    candidates.add('composition');
  }

  const pointsState = payload?.state?.root ? payload.state : payload;
  if (pointsState?.root && Array.isArray(pointsState.root.children)) {
    candidates.add('pointsbuilder');
  }

  if (payload?.model?.shader && payload?.post && Array.isArray(payload.post.nodes)) {
    candidates.add('shader-builder');
  }

  if (candidates.size > 1) {
    throw new Error(`项目类型冲突：同时匹配 ${Array.from(candidates).join('、')}。`);
  }
  return Array.from(candidates)[0] || '';
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
