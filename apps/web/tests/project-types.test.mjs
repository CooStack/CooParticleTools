import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyProjectData,
  createProjectPayload,
  getProjectRoute,
  parseProjectText
} from '../src/modules/projects/project-types.js';

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
