import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROJECT_DEFINITIONS,
  classifyProjectData,
  createProjectPayload,
  getLegacyProjectDefinition,
  getProjectDefinition,
  getProjectRoute,
  parseProjectText,
  projectNameForTypeChange
} from '../src/modules/projects/project-types.js';

test('exposes one project definition interface for every project type', () => {
  assert.deepEqual(
    PROJECT_DEFINITIONS.map(({ type, route, defaultName }) => ({ type, route, defaultName })),
    [
      { type: 'generator', route: 'generator', defaultName: 'EmitterGenerator' },
      { type: 'composition', route: 'composition', defaultName: 'NewComposition' },
      { type: 'pointsbuilder', route: 'pointsbuilder', defaultName: 'PointsBuilderProject' },
      { type: 'shader-builder', route: 'shader-builder', defaultName: 'shader-workbench' }
    ]
  );

  for (const definition of PROJECT_DEFINITIONS) {
    assert.equal(typeof definition.create, 'function');
    assert.equal(typeof definition.nameOf, 'function');
    assert.equal(typeof definition.detect, 'function');
    const payload = definition.create(`Definition ${definition.type}`);
    assert.equal(definition.nameOf(payload), `Definition ${definition.type}`);
    assert.equal(definition.detect(payload, ''), true);
    assert.equal(getProjectDefinition(definition.type), definition);
  }

  assert.equal(getProjectDefinition('emitter'), getProjectDefinition('generator'));
  assert.equal(getProjectDefinition('points-builder'), getProjectDefinition('pointsbuilder'));
});

test('legacy adapters preserve active draft, storage, and file payload contracts', () => {
  const composition = getLegacyProjectDefinition('composition_builder.html');
  const compositionState = {
    projectName: 'Meteorite',
    packageName: 'cn.coostack.compositions',
    cards: [{ id: 'card_1' }]
  };
  assert.equal(composition.type, 'composition');
  assert.equal(composition.legacy.storageKey, 'cb_state_v1');
  assert.deepEqual(composition.legacy.toDraft(compositionState), compositionState);
  assert.deepEqual(composition.legacy.toDraft({ state: compositionState }), compositionState);
  assert.deepEqual(composition.legacy.fromDraft(compositionState), compositionState);
  assert.deepEqual(composition.legacy.fromDraft({ state: compositionState }), compositionState);
  const incompleteCompositionState = {
    projectName: 'Legacy incomplete',
    compositionType: 'particle'
  };
  assert.deepEqual(
    composition.legacy.toDraft({ tool: 'composition', state: incompleteCompositionState }),
    incompleteCompositionState
  );
  assert.deepEqual(
    composition.legacy.fromDraft({ state: incompleteCompositionState }),
    incompleteCompositionState
  );
  assert.deepEqual(composition.legacy.toFile(compositionState, 'Saved Composition'), {
    ...compositionState,
    tool: 'composition',
    projectName: 'Saved Composition'
  });

  const pointsbuilder = getLegacyProjectDefinition('pointsbuilder.html');
  const pointsState = {
    root: { id: 'root', kind: 'ROOT', children: [{ id: 'line_1' }] }
  };
  const originalNow = Date.now;
  Date.now = () => 4242;
  try {
    assert.equal(pointsbuilder.type, 'pointsbuilder');
    assert.equal(pointsbuilder.legacy.storageKey, 'pb_state_v1');
    assert.equal(pointsbuilder.legacy.nameStorageKey, 'pb_project_name_v1');
    assert.deepEqual(pointsbuilder.legacy.toDraft(pointsState), { state: pointsState, ts: 4242 });
  } finally {
    Date.now = originalNow;
  }
  assert.deepEqual(pointsbuilder.legacy.fromDraft({ state: pointsState, ts: 1 }), pointsState);
  assert.deepEqual(pointsbuilder.legacy.fromDraft(pointsState), pointsState);
  assert.deepEqual(pointsbuilder.legacy.toFile(pointsState, 'Saved Points'), {
    ...pointsState,
    tool: 'pointsbuilder',
    schemaVersion: 1,
    projectName: 'Saved Points'
  });

  const shader = getLegacyProjectDefinition('shader_builder.html');
  const shaderState = { projectName: 'Glow', model: {}, post: { nodes: [] } };
  assert.equal(shader.type, 'shader-builder');
  assert.equal(shader.legacy.storageKey, 'sb_project_v1');
  assert.deepEqual(shader.legacy.toDraft(shaderState), shaderState);
  assert.deepEqual(shader.legacy.fromDraft(shaderState), shaderState);
  assert.deepEqual(shader.legacy.toFile(shaderState, 'Saved Shader'), {
    ...shaderState,
    tool: 'shader-builder',
    schema: 'shader_builder_project_v1',
    projectName: 'Saved Shader'
  });

  assert.equal(getLegacyProjectDefinition('bezier.html'), null);
});

test('maps project types to their editor routes', () => {
  assert.equal(getProjectRoute('generator'), 'generator');
  assert.equal(getProjectRoute('composition'), 'composition');
  assert.equal(getProjectRoute('pointsbuilder'), 'pointsbuilder');
  assert.equal(getProjectRoute('shader-builder'), 'shader-builder');
});

test('uses explicit project type when an empty payload has no structural signature', () => {
  assert.equal(classifyProjectData({ tool: 'generator', emitters: [] }).type, 'generator');
  assert.equal(classifyProjectData({ tool: 'composition', payload: { cards: [] } }).type, 'composition');
});

test('detects legacy project formats', () => {
  assert.equal(
    classifyProjectData({ schema: 'shader_builder_project_v1', model: {}, post: {} }).type,
    'shader-builder'
  );
  assert.equal(
    classifyProjectData({ projectName: 'Meteorite', compositionType: 'particle', cards: [] }).type,
    'composition'
  );
  assert.equal(
    classifyProjectData({ root: { id: 'root', kind: 'ROOT', children: [] } }).type,
    'pointsbuilder'
  );
  assert.equal(
    classifyProjectData({
      state: {
        projectName: 'WrappedComposition',
        packageName: 'cn.coostack.compositions',
        cards: []
      }
    }).type,
    'composition'
  );
  assert.equal(
    classifyProjectData({
      state: { root: { id: 'root', kind: 'ROOT', children: [] } },
      ts: 1
    }).type,
    'pointsbuilder'
  );
  assert.equal(
    classifyProjectData({ emitters: [], commandQueues: [] }).type,
    'generator'
  );
  assert.equal(classifyProjectData({ cards: [] }, 'trail.composition.json').type, 'composition');
});

test('rejects invalid, unknown, and conflicting project files', () => {
  assert.throws(() => parseProjectText('{'), /有效的 JSON/);
  assert.throws(() => classifyProjectData({}), /无法识别/);
  assert.throws(
    () => classifyProjectData({ tool: 'unknown', emitters: [], commandQueues: [] }),
    /不支持的项目类型/
  );
  assert.throws(
    () => classifyProjectData({ tool: 'generator', payload: { tool: 'composition', cards: [] } }),
    /项目类型冲突/
  );
  assert.throws(
    () => classifyProjectData({ emitters: [], commandQueues: [], cards: [], compositionType: 'particle' }),
    /项目类型冲突/
  );
  assert.throws(
    () => classifyProjectData({ emitters: [], commandQueues: [] }, 'emitter.composition.json'),
    /项目类型冲突/
  );
  assert.throws(
    () => classifyProjectData({ tool: 'generator', cards: [], compositionType: 'particle' }),
    /项目类型冲突/
  );
  assert.throws(
    () => classifyProjectData({ tool: 'pointsbuilder', root: { children: [] } }, 'shape.composition.json'),
    /项目类型冲突/
  );
});

test('creates payloads that reopen as their selected project type', () => {
  for (const type of ['generator', 'composition', 'pointsbuilder', 'shader-builder']) {
    const payload = createProjectPayload(type, `Route ${type}`);
    assert.equal(classifyProjectData({ tool: type, payload }).type, type);
  }
});

test('keeps an edited project name when the create type changes', () => {
  assert.equal(
    projectNameForTypeChange('EmitterGenerator', 'composition'),
    'NewComposition'
  );
  assert.equal(
    projectNameForTypeChange('MyParticles', 'composition', true),
    'MyParticles'
  );
  assert.equal(
    projectNameForTypeChange('EmitterGenerator', 'composition', true),
    'EmitterGenerator'
  );
  assert.equal(projectNameForTypeChange('', 'composition'), 'NewComposition');
});

test('passes creation configuration into emitter and composition payloads', () => {
  const generator = createProjectPayload('generator', 'Spark', {
    packageName: 'cn.example.particles',
    mapping: 'yarn'
  });
  assert.equal(generator.kotlin.packageName, 'cn.example.particles');
  assert.equal(generator.kotlin.mapping, 'yarn');

  const composition = createProjectPayload('composition', 'Spark', {
    packageName: 'cn.example.compositions',
    mapping: 'yarn'
  });
  assert.equal(composition.packageName, 'cn.example.compositions');
  assert.equal(composition.mapping, 'yarn');
});
