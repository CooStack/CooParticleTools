import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCompositionPreset,
  createCompositionPreset,
  createCompositionPresetStorage,
  normalizePresetName,
  normalizePresetTreePath,
  validateCompositionPreset
} from '../public/legacy/assets/composition_builder/js/preset_store.js';
import { installCompositionPresetMethods } from '../public/legacy/assets/composition_builder/js/composition_preset_mixin.js';
import { handleCompositionHistoryShortcut } from '../public/legacy/assets/composition_builder/js/history_hotkeys.js';
import {
  cloneCompositionValue,
  normalizeCompositionCard,
  normalizeCompositionProject,
  normalizeCompositionShapeNode
} from '../public/legacy/assets/composition_builder/js/model.js';

function ids(prefix = 'id') {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function makeNode(name, overrides = {}) {
  return normalizeCompositionShapeNode({
    id: `${name}-id`,
    name,
    type: 'particle_shape',
    bindMode: 'point',
    point: { x: 1, y: 2, z: 3 },
    effectClass: `${name}Effect`,
    useTexture: true,
    particleInit: [{ target: 'size', expr: '0.4' }],
    displayActions: [{ type: 'expression', expression: `${name}Display()` }],
    scale: { type: 'linear', min: 0.2, max: 1, tick: 8 },
    growthAnimates: [{ count: 3, condition: 'age > 1' }],
    children: [],
    ...overrides
  }, 0, { idFactory: ids(name) });
}

function makeCard(name = 'source', overrides = {}) {
  return normalizeCompositionCard({
    id: `${name}-card`,
    name,
    bindMode: 'builder',
    point: { x: 4, y: 5, z: 6 },
    builderState: {
      root: {
        id: 'root',
        kind: 'ROOT',
        children: [{ id: `${name}-builder-node`, kind: 'POINT', x: 2, y: 3, z: 4 }]
      }
    },
    builderKotlinOverride: `${name}Builder()`,
    dataType: 'sequenced_shape',
    singleEffectClass: `${name}Effect`,
    singleUseTexture: false,
    particleInit: [{ target: 'particleAlpha', expr: '0.75' }],
    controllerVars: [{ name: 'tick', type: 'Int', expr: '0' }],
    controllerActions: [{ type: 'tick_js', script: `${name}Tick()` }],
    shapeDisplayActions: [{ type: 'expression', expression: `${name}Display()` }],
    shapeScale: { type: 'linear', min: 0.1, max: 1.2, tick: 12 },
    growthAnimates: [{ count: 2, condition: 'age > 0' }],
    sequencedAnimates: [{ count: 7, condition: 'age > 2' }],
    shapeChildren: [makeNode(`${name}-child`, {
      children: [makeNode(`${name}-grandchild`, { type: 'single' })]
    })],
    ...overrides
  }, 0, { idFactory: ids(name) });
}

function makeMemoryPresetBridge() {
  const files = new Map();
  const folders = new Set(['cards', 'nodes', 'shared']);
  const keyOf = ({ category, fileName = '' }) => `${category}/${fileName}`;
  return {
    files,
    folders,
    async listProjectPresetFolders() {
      return { ok: true, items: Array.from(folders, (name) => ({ name, builtin: ['cards', 'nodes', 'shared'].includes(name) })) };
    },
    async createProjectPresetFolder({ category }) {
      if (folders.has(category)) return { ok: false, exists: true, message: 'exists' };
      folders.add(category);
      return { ok: true };
    },
    async deleteProjectPresetFolder({ category }) {
      if (Array.from(files.keys()).some((key) => key.startsWith(`${category}/`))) {
        return { ok: false, message: 'not empty' };
      }
      const removed = folders.delete(category);
      return { ok: removed, notFound: !removed };
    },
    async listProjectPresets(payload) {
      const prefix = keyOf({ ...payload, fileName: '' });
      const items = Array.from(files.keys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => {
          const fileName = key.slice(prefix.length);
          const preset = JSON.parse(files.get(key));
          return {
            fileName,
            name: fileName.replace(/\.json$/i, ''),
            description: preset.description || '',
            sourceKind: preset.sourceKind,
            modifiedAt: '2026-07-25T00:00:00.000Z'
          };
        })
        .filter((item) => !payload.sourceKind || item.sourceKind === payload.sourceKind);
      return { ok: true, items };
    },
    async readProjectPreset(payload) {
      const key = keyOf(payload);
      return files.has(key)
        ? { ok: true, text: files.get(key) }
        : { ok: false, notFound: true, message: 'missing' };
    },
    async writeProjectPreset(payload) {
      const key = keyOf(payload);
      if (files.has(key) && !payload.overwrite) return { ok: false, exists: true, message: 'exists' };
      files.set(key, payload.text);
      return { ok: true };
    },
    async moveProjectPreset(payload) {
      const sourceKey = keyOf({ category: payload.sourceCategory, fileName: payload.sourceFileName });
      const targetKey = keyOf({ category: payload.targetCategory, fileName: payload.targetFileName });
      if (!files.has(sourceKey)) return { ok: false, notFound: true, message: 'missing' };
      if (sourceKey !== targetKey && files.has(targetKey)) return { ok: false, exists: true, message: 'exists' };
      const preset = JSON.parse(files.get(sourceKey));
      preset.name = payload.targetFileName.replace(/\.json$/i, '');
      if (Object.hasOwn(payload, 'description')) preset.description = payload.description;
      files.set(targetKey, JSON.stringify(preset, null, 2));
      if (sourceKey !== targetKey) files.delete(sourceKey);
      return { ok: true };
    },
    async deleteProjectPreset(payload) {
      const key = keyOf(payload);
      if (!files.delete(key)) return { ok: false, notFound: true, message: 'missing' };
      return { ok: true };
    }
  };
}

test('Composition preset saves, lists, loads, overwrites and deletes through the project bridge', async () => {
  const bridge = makeMemoryPresetBridge();
  const storage = createCompositionPresetStorage({
    bridge,
    projectFilePath: 'D:\\projects\\demo\\effect.composition.json'
  });
  const source = makeCard();
  const preset = createCompositionPreset({
    name: 'spark-ring',
    sourceKind: 'card',
    target: source,
    cardId: source.id,
    now: Date.UTC(2026, 6, 25)
  });

  await storage.save('cards', preset);
  assert.deepEqual((await storage.list('cards')).map((item) => item.name), ['spark-ring']);
  assert.deepEqual(await storage.load('cards', 'spark-ring'), preset);

  await assert.rejects(() => storage.save('cards', preset), (error) => error.code === 'PRESET_EXISTS');
  await storage.save('cards', { ...preset, createdAt: '2026-07-25T01:00:00.000Z' }, { overwrite: true });
  assert.equal((await storage.load('cards', 'spark-ring')).createdAt, '2026-07-25T01:00:00.000Z');

  await storage.remove('cards', 'spark-ring');
  assert.deepEqual(await storage.list('cards'), []);
});

test('Composition preset storage is global across project contexts and supports folder edits', async () => {
  const bridge = makeMemoryPresetBridge();
  const firstProject = createCompositionPresetStorage({
    bridge,
    projectFilePath: 'D:\\projects\\one\\effect.composition.json'
  });
  const secondProject = createCompositionPresetStorage({
    bridge,
    projectId: 'project-two',
    projectType: 'composition'
  });
  const withoutProject = createCompositionPresetStorage({ bridge });
  const preset = createCompositionPreset({ name: 'wind', sourceKind: 'card', target: makeCard(), now: 0 });
  const nodePreset = createCompositionPreset({ name: 'node-wind', sourceKind: 'node', target: makeNode('node-wind'), now: 0 });

  await firstProject.createDirectory('常用');
  await firstProject.save('cards', preset);
  await firstProject.save('cards', nodePreset);
  assert.deepEqual((await secondProject.list('cards')).map((item) => item.name), ['wind', 'node-wind']);
  assert.deepEqual((await withoutProject.list('cards')).map((item) => item.name), ['wind', 'node-wind']);

  await secondProject.move('cards', 'wind', '常用', { name: '随机风场', description: '全局风场' });
  assert.deepEqual((await firstProject.list('cards')).map((item) => item.name), ['node-wind']);
  assert.equal((await firstProject.list('常用'))[0].description, '全局风场');
  const loaded = await firstProject.load('常用', '随机风场');
  assert.equal(loaded.name, '随机风场');
  assert.equal(loaded.description, '全局风场');

  await firstProject.remove('常用', '随机风场');
  await firstProject.removeDirectory('常用');
  assert.deepEqual((await secondProject.listDirectories()).map((item) => item.name), ['cards', 'nodes', 'shared']);
});

test('Composition preset loading rejects a JSON name that differs from its file name', async () => {
  const bridge = makeMemoryPresetBridge();
  const storage = createCompositionPresetStorage({
    bridge,
    projectFilePath: 'D:\\projects\\demo\\effect.composition.json'
  });
  const preset = createCompositionPreset({ name: 'inside', sourceKind: 'card', target: makeCard(), now: 0 });
  bridge.files.set(
    'cards/outside.json',
    JSON.stringify(preset)
  );
  await assert.rejects(() => storage.load('cards', 'outside'), /name 与文件名不一致/);
});

test('Composition preset rejects illegal names, categories and imported data', () => {
  const preset = createCompositionPreset({ name: 'valid', sourceKind: 'card', target: makeCard(), now: 0 });

  for (const name of ['', '..', '../escape', 'CON', 'bad?.json', 'trailing.']) {
    assert.throws(() => normalizePresetName(name));
  }
  assert.equal(normalizePresetName('.hidden'), '.hidden');
  assert.throws(() => normalizePresetTreePath([0, '1', 2]));
  assert.throws(() => validateCompositionPreset('{not-json'));
  assert.throws(() => validateCompositionPreset({ ...preset, schemaVersion: 99 }));
  assert.equal(validateCompositionPreset(preset, { category: 'nodes' }).sourceKind, 'card');

  const dangerous = cloneCompositionValue(preset);
  Object.defineProperty(dangerous.sections.position.builderState, '__proto__', {
    value: { polluted: true },
    enumerable: true
  });
  assert.throws(() => validateCompositionPreset(dangerous), /危险字段/);

  const hiddenChildren = cloneCompositionValue(preset);
  hiddenChildren.sections.particle.dataType = 'single';
  assert.throws(() => validateCompositionPreset(hiddenChildren), /single 类型不兼容/);

  const invalidProperties = [
    [(value) => { value.sections.properties.particleInit[0].expr = 1; }, /expr 必须是字符串/],
    [(value) => { value.sections.properties.controllerVars[0].type = null; }, /type 必须是字符串/],
    [(value) => { value.sections.properties.controllerVars[0].type = 'Any'; }, /type 无效/],
    [(value) => { value.sections.properties.controllerActions[0].type = 'eval'; }, /type 无效/],
    [(value) => { value.sections.properties.displayActions[0].type = 'script'; }, /type 无效/],
    [(value) => { value.sections.properties.growthAnimates[0].count = 0; }, /count 必须是正整数/],
    [(value) => { value.sections.properties.sequencedAnimates[0].condition = false; }, /condition 必须是字符串/],
    [(value) => { value.sections.properties.scale.type = 'cubic'; }, /scale\.type 无效/],
    [(value) => { value.sections.properties.scale.runMode = 'later'; }, /runMode 无效/],
    [(value) => { value.sections.properties.scale.min = Number.POSITIVE_INFINITY; }, /非有限数字/],
    [(value) => { value.sections.properties.scale.reversedOnDisable = 'false'; }, /必须是布尔值/],
    [(value) => { value.sections.properties.angleOffset.angleOffsetCount = 0; }, /必须是正整数/],
    [(value) => { value.sections.properties.singleDisplay.rotateAngleMode = 'script'; }, /rotateAngleMode 无效/]
  ];
  for (const [mutate, expected] of invalidProperties) {
    const invalid = cloneCompositionValue(preset);
    mutate(invalid);
    assert.throws(() => validateCompositionPreset(invalid), expected);
  }
});

test('Composition preset applies only the checked sections, including nested nodes', () => {
  const source = makeCard('source');
  const target = makeCard('target', {
    point: { x: 90, y: 91, z: 92 },
    dataType: 'particle_shape',
    singleEffectClass: 'KeepParticle',
    particleInit: [{ target: 'size', expr: 'keep-properties' }],
    shapeChildren: [makeNode('target-child', {
      point: { x: 70, y: 71, z: 72 },
      effectClass: 'KeepChildParticle',
      particleInit: [{ target: 'size', expr: 'keep-child-properties' }],
      children: [makeNode('target-grandchild', { type: 'single' })]
    })]
  });
  const preset = createCompositionPreset({ name: 'partial', sourceKind: 'card', target: source, now: 0 });

  const positionOnly = applyCompositionPreset(target, preset, ['position'], 'card');
  assert.deepEqual(positionOnly.point, source.point);
  assert.deepEqual(positionOnly.shapeChildren[0].point, source.shapeChildren[0].point);
  assert.equal(positionOnly.dataType, target.dataType);
  assert.deepEqual(positionOnly.particleInit, target.particleInit);
  assert.equal(positionOnly.shapeChildren[0].effectClass, 'KeepChildParticle');
  assert.deepEqual(positionOnly.shapeChildren[0].particleInit, target.shapeChildren[0].particleInit);

  const propertiesOnly = applyCompositionPreset(target, preset, ['properties'], 'card');
  assert.deepEqual(propertiesOnly.point, target.point);
  assert.equal(propertiesOnly.dataType, target.dataType);
  assert.deepEqual(propertiesOnly.particleInit.map(({ id, ...item }) => item), preset.sections.properties.particleInit);
  assert.equal(propertiesOnly.shapeChildren[0].effectClass, 'KeepChildParticle');
  assert.equal(propertiesOnly.shapeChildren[0].particleInit[0].expr, source.shapeChildren[0].particleInit[0].expr);

  const particleOnly = applyCompositionPreset(target, preset, ['particle'], 'card');
  assert.equal(particleOnly.dataType, source.dataType);
  assert.equal(particleOnly.singleEffectClass, source.singleEffectClass);
  assert.deepEqual(particleOnly.point, target.point);
  assert.deepEqual(particleOnly.particleInit, target.particleInit);
  assert.equal(particleOnly.shapeChildren[0].particleInit[0].expr, 'keep-child-properties');
});

test('Shared presets map between cards and nodes without clearing target-only properties', () => {
  const sourceNode = makeNode('shared-node', { type: 'sequenced_shape' });
  const nodePreset = createCompositionPreset({ name: 'node-shared', sourceKind: 'node', target: sourceNode, treePath: [1, 2], now: 0 });
  const targetCard = makeCard('target-card');
  const originalSequenced = cloneCompositionValue(targetCard.sequencedAnimates);
  const cardResult = applyCompositionPreset(targetCard, nodePreset, ['particle', 'properties'], 'card');

  assert.equal(cardResult.dataType, sourceNode.type);
  assert.equal(cardResult.singleEffectClass, sourceNode.effectClass);
  assert.deepEqual(cardResult.sequencedAnimates, originalSequenced);

  const sourceCard = makeCard('shared-card', { dataType: 'particle_shape' });
  const cardPreset = createCompositionPreset({ name: 'card-shared', sourceKind: 'card', target: sourceCard, now: 0 });
  const targetNode = makeNode('target-node');
  const nodeResult = applyCompositionPreset(targetNode, cardPreset, ['position', 'particle', 'properties'], 'node');
  assert.equal(nodeResult.type, sourceCard.dataType);
  assert.equal(nodeResult.effectClass, sourceCard.singleEffectClass);
  assert.deepEqual(nodeResult.point, sourceCard.point);
  assert.equal(nodeResult.displayActions[0].expression, sourceCard.shapeDisplayActions[0].expression);
});

test('Preset application records one history entry and undo restores the previous card', async () => {
  class PresetHarness {
    constructor(card) {
      this.state = normalizeCompositionProject({ cards: [card] });
      this.undoStack = [];
      this.redoStack = [];
      this.armedHistorySnapshot = cloneCompositionValue(this.state);
      this.dom = {
        cardPresetSearch: { value: '' },
        cardPresetModal: { querySelectorAll: () => [], classList: { add() {} } },
        cardPresetMask: { classList: { add() {} } },
        cardPresetStatus: { textContent: '', classList: { toggle() {} } }
      };
      this.initCompositionPresetState();
    }
    getCardIndexById(cardId) { return this.state.cards.findIndex((card) => card.id === cardId); }
    getShapeNodeByPath(card, treePath) {
      let node = null;
      let children = card.shapeChildren;
      for (const index of treePath) {
        node = children[index];
        if (!node) return null;
        children = node.children;
      }
      return node;
    }
    pushHistory(snapshot = null) {
      this.undoStack.push(normalizeCompositionProject(
        snapshot ? cloneCompositionValue(snapshot) : cloneCompositionValue(this.state)
      ));
      this.redoStack.length = 0;
    }
    afterStructureMutate() { this.state = normalizeCompositionProject(this.state); }
    showToast() {}
    undo() {
      this.redoStack.push(cloneCompositionValue(this.state));
      this.state = normalizeCompositionProject(this.undoStack.pop());
    }
  }
  installCompositionPresetMethods(PresetHarness, {
    esc: (value) => String(value),
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const target = makeCard('undo-target');
  const before = cloneCompositionValue(target);
  const source = makeCard('undo-source');
  const preset = createCompositionPreset({ name: 'undo-preset', sourceKind: 'card', target: source, now: 0 });
  const app = new PresetHarness(target);
  app.compositionPresetState.card.context = { cardId: target.id, treePath: [], nodeId: '' };
  app.compositionPresetState.card.category = 'shared';
  app.compositionPresetState.card.selectedName = 'undo-preset';
  app.compositionPresetState.card.loadedPreset = preset;
  app.compositionPresetState.card.loadedKey = 'shared/undo-preset';
  app.getCompositionPresetSelectedSections = () => ['position', 'particle', 'properties'];

  await app.applyLoadedCompositionPreset('card');
  assert.equal(app.undoStack.length, 1);
  assert.equal(app.armedHistorySnapshot, null);
  assert.deepEqual(app.state.cards[0].point, source.point, app.dom.cardPresetStatus.textContent);
  assert.equal(app.state.cards[0].dataType, source.dataType);
  assert.equal(app.state.cards[0].singleEffectClass, source.singleEffectClass);
  assert.equal(app.state.cards[0].singleUseTexture, source.singleUseTexture);
  assert.equal(app.state.cards[0].shapeChildren[0].effectClass, source.shapeChildren[0].effectClass);
  assert.equal(app.state.cards[0].shapeChildren[0].useTexture, source.shapeChildren[0].useTexture);

  let prevented = false;
  const handled = handleCompositionHistoryShortcut({ preventDefault() { prevented = true; } }, {
    undoMatched: true,
    textEditing: false,
    undo: () => app.undo()
  });
  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.deepEqual(app.state.cards[0], before);
});

test('Nested node presets apply at treePath, undo cleanly, and reject stale targets', async () => {
  class NodeHarness {
    constructor(card, preset) {
      this.state = { cards: [card] };
      this.history = [];
      this.dom = {
        nodePresetSearch: { value: '' },
        nodePresetModal: { querySelectorAll: () => [], classList: { add() {} } },
        nodePresetMask: { classList: { add() {} } },
        nodePresetStatus: { textContent: '', classList: { toggle() {} } }
      };
      this.initCompositionPresetState();
      this.compositionPresetState.node = {
        ...this.compositionPresetState.node,
        category: 'shared',
        selectedName: 'nested',
        loadedPreset: preset,
        loadedKey: 'shared/nested'
      };
    }
    getCardIndexById(id) { return this.state.cards.findIndex((card) => card.id === id); }
    getShapeNodeByPath(card, path) {
      let current = null;
      let children = card.shapeChildren;
      for (const index of path) {
        current = children[index];
        if (!current) return null;
        children = current.children;
      }
      return current;
    }
    pushHistory() { this.history.push(cloneCompositionValue(this.state)); }
    afterStructureMutate() {}
    showToast() {}
    undo() { this.state = this.history.pop(); }
  }
  installCompositionPresetMethods(NodeHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const card = makeCard('nested-target');
  card.shapeChildren.push(makeNode('untouched-sibling', {
    particleInit: [{ target: 'size', expr: 'keep-sibling' }]
  }));
  const nested = card.shapeChildren[0].children[0];
  const replacement = makeNode('replacement', {
    particleInit: [{ target: 'size', expr: 'replacement-properties' }]
  });
  const preset = createCompositionPreset({ name: 'nested', sourceKind: 'node', target: replacement, treePath: [0, 0], now: 0 });
  const app = new NodeHarness(card, preset);
  app.getCompositionPresetSelectedSections = () => ['properties'];
  app.compositionPresetState.node.context = {
    cardId: card.id,
    treePath: [0, 0],
    nodeId: nested.id
  };

  const before = cloneCompositionValue(app.state);
  await app.applyLoadedCompositionPreset('node');
  assert.equal(app.history.length, 1);
  assert.equal(app.state.cards[0].shapeChildren[0].children[0].particleInit[0].expr, 'replacement-properties');
  assert.equal(app.state.cards[0].shapeChildren[1].particleInit[0].expr, 'keep-sibling');
  app.undo();
  assert.deepEqual(app.state, before);

  const restoredCard = app.state.cards[0];
  app.compositionPresetState.node.context.nodeId = restoredCard.shapeChildren[0].children[0].id;
  restoredCard.shapeChildren[0].children[0] = makeNode('moved-here');
  await app.applyLoadedCompositionPreset('node');
  assert.equal(app.history.length, 0);
  assert.match(app.dom.nodePresetStatus.textContent, /已移动或替换/);
});

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makePresetUiDom(sectionNames = []) {
  const classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
  const sectionInputs = sectionNames.map((section) => ({
    checked: true,
    dataset: { presetSection: section }
  }));
  const modal = {
    classList,
    querySelector() { return null; },
    querySelectorAll(selector) {
      return selector === '[data-preset-section]:checked'
        ? sectionInputs.filter((input) => input.checked)
        : [];
    }
  };
  return {
    modal,
    mask: { classList },
    context: { textContent: '' },
    search: { value: '' },
    list: { className: '', textContent: '', innerHTML: '' },
    status: { textContent: '', classList },
    close: { focus() {} },
    sectionInputs
  };
}

function assignPresetUiDom(target, prefix, ui) {
  target[`${prefix}PresetModal`] = ui.modal;
  target[`${prefix}PresetMask`] = ui.mask;
  target[`${prefix}PresetContext`] = ui.context;
  target[`${prefix}PresetSearch`] = ui.search;
  target[`${prefix}PresetList`] = ui.list;
  target[`${prefix}PresetStatus`] = ui.status;
  target[`btnClose${prefix[0].toUpperCase()}${prefix.slice(1)}Preset`] = ui.close;
}

test('Preset row editing keeps the input mounted and all folders remain accessible', () => {
  class InteractionHarness {
    constructor() {
      this.dom = {};
      assignPresetUiDom(this.dom, 'card', makePresetUiDom());
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.initCompositionPresetState();
      this.compositionPresetState.card.selectedName = 'wind';
      this.syncCount = 0;
      this.refreshCount = 0;
      this.syncCompositionPresetUi = () => { this.syncCount += 1; };
      this.refreshCompositionPresetList = () => { this.refreshCount += 1; };
    }
  }
  installCompositionPresetMethods(InteractionHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const app = new InteractionHarness();
  const editInput = {
    matches(selector) { return selector === '[data-preset-edit-input]'; },
    closest() { return { dataset: { presetSelect: 'other' } }; }
  };
  app.onCompositionPresetClick('card', { target: editInput });
  assert.equal(app.compositionPresetState.card.selectedName, 'wind');
  assert.equal(app.syncCount, 0);

  app.selectCompositionPresetCategory('node', 'cards');
  assert.equal(app.compositionPresetState.node.category, 'cards');
  assert.equal(app.syncCount, 1);
  assert.equal(app.refreshCount, 1);
});

test('Preset context menus separate new saves from targeted overwrite and delete actions', () => {
  const contextMenu = {
    classList: {
      hidden: true,
      add(name) { if (name === 'hidden') this.hidden = true; },
      remove(name) { if (name === 'hidden') this.hidden = false; }
    },
    innerHTML: '',
    style: {}
  };

  class ContextMenuHarness {
    constructor() {
      this.state = { cards: [makeCard('menu-card')] };
      this.dom = {};
      const cardUi = makePresetUiDom();
      cardUi.modal.querySelector = (selector) => selector === '[data-preset-context-menu]' ? contextMenu : null;
      assignPresetUiDom(this.dom, 'card', cardUi);
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.getCompositionPresetShell = () => ({});
      this.initCompositionPresetState();
      this.compositionPresetState.card.context = {
        cardId: this.state.cards[0].id,
        treePath: [],
        nodeId: ''
      };
    }
    getCardIndexById(cardId) { return this.state.cards.findIndex((card) => card.id === cardId); }
  }
  installCompositionPresetMethods(ContextMenuHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const app = new ContextMenuHarness();
  app.openCompositionPresetContextMenu('card', {
    kind: 'preset-list',
    clientX: 20,
    clientY: 30
  });
  assert.equal(contextMenu.classList.hidden, false);
  assert.match(contextMenu.innerHTML, /保存当前卡片（menu-card）为预设/);
  assert.doesNotMatch(contextMenu.innerHTML, /删除预设/);

  app.openCompositionPresetContextMenu('card', {
    kind: 'preset-row',
    name: 'wind',
    clientX: 20,
    clientY: 30
  });
  assert.doesNotMatch(contextMenu.innerHTML, /保存当前卡片/);
  assert.match(contextMenu.innerHTML, /覆盖预设（wind）/);
  assert.match(contextMenu.innerHTML, /删除预设（wind）/);

  app.openCompositionPresetContextMenu('card', {
    kind: 'folder',
    category: 'custom',
    clientX: 20,
    clientY: 30
  });
  assert.match(contextMenu.innerHTML, /新建预设文件夹/);
  assert.match(contextMenu.innerHTML, /删除文件夹（custom）/);
  let deletedFolder = '';
  app.deleteCompositionPresetFolder = (_targetKind, category) => { deletedFolder = category; };
  app.runCompositionPresetContextMenuAction('card', 'delete-folder');
  assert.equal(deletedFolder, 'custom');

  app.openCompositionPresetContextMenu('card', {
    kind: 'folder',
    category: 'cards',
    clientX: 20,
    clientY: 30
  });
  assert.match(contextMenu.innerHTML, /新建预设文件夹/);
  assert.doesNotMatch(contextMenu.innerHTML, /删除文件夹/);

  app.openCompositionPresetContextMenu('card', {
    kind: 'preset-row',
    name: 'wind',
    clientX: 20,
    clientY: 30
  });
  let deletedPreset = '';
  app.deleteCompositionPreset = (_targetKind, name) => { deletedPreset = name; };
  app.runCompositionPresetContextMenuAction('card', 'delete-preset');
  assert.equal(deletedPreset, 'wind');

  app.openCompositionPresetContextMenu('card', {
    kind: 'preset-row',
    name: 'wind',
    clientX: 20,
    clientY: 30
  });
  let overwrittenPreset = '';
  app.overwriteCompositionPreset = (_targetKind, name) => { overwrittenPreset = name; };
  app.runCompositionPresetContextMenuAction('card', 'overwrite-preset');
  assert.equal(overwrittenPreset, 'wind');

  app.compositionPresetState.card.contextMenu = { kind: 'preset-list' };
  contextMenu.classList.hidden = false;
  app.onCompositionPresetContextMenu('card', {
    target: {
      closest(selector) { return selector.includes('input') ? this : null; }
    }
  });
  assert.equal(app.compositionPresetState.card.contextMenu, null);
  assert.equal(contextMenu.classList.hidden, true);

  app.compositionPresetState.card.contextMenu = { kind: 'preset-list' };
  contextMenu.classList.hidden = false;
  app.onCompositionPresetClick('card', {
    target: {
      matches(selector) { return selector === '[data-preset-edit-input]'; }
    }
  });
  assert.equal(app.compositionPresetState.card.contextMenu, null);
  assert.equal(contextMenu.classList.hidden, true);
});

test('Preset overwrite requires confirmation and saves the current target under the existing name', async () => {
  class OverwriteHarness {
    constructor(accepted) {
      this.state = { cards: [makeCard('current-card', { point: { x: 41, y: 42, z: 43 } })] };
      this.dom = {};
      assignPresetUiDom(this.dom, 'card', makePresetUiDom());
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.saved = [];
      this.confirmations = [];
      this.accepted = accepted;
      this.initCompositionPresetState();
      this.compositionPresetState.card.context = {
        cardId: this.state.cards[0].id,
        treePath: [],
        nodeId: ''
      };
      this.compositionPresetState.card.items = [{ name: 'wind', description: 'kept description' }];
      this.getCompositionPresetShell = () => ({});
      this.refreshCompositionPresetList = async () => {};
      this.getCompositionPresetStorage = () => ({
        save: async (...args) => { this.saved.push(args); }
      });
    }
    getCardIndexById(cardId) { return this.state.cards.findIndex((card) => card.id === cardId); }
    async askThemeConfirm(options) {
      this.confirmations.push(options);
      return this.accepted;
    }
  }
  installCompositionPresetMethods(OverwriteHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const cancelled = new OverwriteHarness(false);
  await cancelled.overwriteCompositionPreset('card', 'wind');
  assert.equal(cancelled.saved.length, 0);
  assert.deepEqual(cancelled.confirmations[0], {
    title: '覆盖预设',
    message: '确定使用当前卡片覆盖预设“wind”吗？',
    okText: '覆盖',
    danger: true
  });

  const confirmed = new OverwriteHarness(true);
  await confirmed.overwriteCompositionPreset('card', 'wind');
  assert.equal(confirmed.saved.length, 1);
  const [category, preset, options] = confirmed.saved[0];
  assert.equal(category, 'cards');
  assert.equal(preset.name, 'wind');
  assert.equal(preset.description, 'kept description');
  assert.deepEqual(preset.sections.position.point, { x: 41, y: 42, z: 43 });
  assert.deepEqual(options, { overwrite: true });
  assert.equal(confirmed.compositionPresetState.card.selectedName, 'wind');
  assert.equal(confirmed.compositionPresetState.card.loadedKey, 'cards/wind');
  assert.match(confirmed.dom.cardPresetStatus.textContent, /已覆盖预设“wind”/);
});

test('Preset save dialog blocks duplicate submits and ignores a stale save after cancel and reopen', async () => {
  const pendingSave = createDeferred();
  const saveInput = { value: '', focusCount: 0, focus() { this.focusCount += 1; } };
  const confirmButton = { disabled: false };
  const classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
  const saveDialog = { classList };
  const saveDialogMask = { classList };
  const cardUi = makePresetUiDom();
  cardUi.modal.querySelector = (selector) => {
    if (selector === '[data-preset-save-name]') return saveInput;
    if (selector === '[data-preset-save-dialog]') return saveDialog;
    if (selector === '[data-preset-save-dialog-mask]') return saveDialogMask;
    if (selector === '[data-preset-action="confirm-save"]') return confirmButton;
    return null;
  };

  class SaveDialogHarness {
    constructor() {
      this.state = { cards: [makeCard('save-target')] };
      this.dom = {};
      assignPresetUiDom(this.dom, 'card', cardUi);
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.saveCalls = 0;
      this.initCompositionPresetState();
      this.compositionPresetState.card.context = {
        cardId: this.state.cards[0].id,
        treePath: [],
        nodeId: ''
      };
      this.getCompositionPresetShell = () => ({});
      this.getCompositionPresetStorage = () => ({
        save: async () => {
          this.saveCalls += 1;
          if (this.saveCalls === 1) await pendingSave.promise;
        }
      });
      this.refreshCompositionPresetList = async () => {};
    }
    getCardIndexById(cardId) { return this.state.cards.findIndex((card) => card.id === cardId); }
  }
  installCompositionPresetMethods(SaveDialogHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const app = new SaveDialogHarness();
  app.openCompositionPresetSaveDialog('card');
  saveInput.value = 'first';
  const firstSubmit = app.confirmCompositionPresetSave('card');
  const duplicateSubmit = app.confirmCompositionPresetSave('card');
  assert.equal(app.saveCalls, 1);
  assert.equal(confirmButton.disabled, true);

  app.closeCompositionPresetSaveDialog('card');
  app.openCompositionPresetSaveDialog('card');
  saveInput.value = 'second';
  pendingSave.resolve();
  await Promise.all([firstSubmit, duplicateSubmit]);

  assert.equal(app.compositionPresetState.card.saveDialogOpen, true);
  assert.equal(app.compositionPresetState.card.saveDialogSubmitting, false);
  assert.equal(saveInput.value, 'second');
  assert.equal(app.compositionPresetState.card.selectedName, '');
  assert.equal(confirmButton.disabled, false);
});

test('Node preset windows list card-origin presets without a source filter', async () => {
  let listPayload = null;
  const bridge = {
    async listProjectPresets(payload) {
      listPayload = payload;
      return {
        ok: true,
        items: [{
          fileName: 'wind.json',
          name: 'wind',
          description: '',
          sourceKind: 'card',
          modifiedAt: '2026-07-25T00:00:00.000Z'
        }]
      };
    }
  };

  class GlobalPresetHarness {
    constructor() {
      this.dom = {};
      assignPresetUiDom(this.dom, 'card', makePresetUiDom());
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.getCompositionPresetShell = () => bridge;
      this.initCompositionPresetState();
      this.compositionPresetState.node.category = 'cards';
    }
  }
  installCompositionPresetMethods(GlobalPresetHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const app = new GlobalPresetHarness();
  await app.refreshCompositionPresetList('node');
  assert.equal(listPayload.category, 'cards');
  assert.equal(listPayload.sourceKind, '');
  assert.equal(app.compositionPresetState.node.items[0].sourceKind, 'card');
});

test('Preset text swaps only the clicked field into an input', () => {
  class InlineEditHarness {
    constructor() {
      this.dom = {};
      assignPresetUiDom(this.dom, 'card', makePresetUiDom());
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.initCompositionPresetState();
      this.compositionPresetState.card.items = [{
        name: 'wind',
        description: '环境风场',
        modifiedAt: '2026-07-25T00:00:00.000Z'
      }];
    }
  }
  installCompositionPresetMethods(InlineEditHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const app = new InlineEditHarness();
  app.openCompositionPresetRowEditor('card', 'wind', 'name');
  assert.match(app.dom.cardPresetList.innerHTML, /aria-label="预设名称"/);
  assert.match(app.dom.cardPresetList.innerHTML, /class="preset-list-description"/);
  assert.doesNotMatch(app.dom.cardPresetList.innerHTML, /class="preset-list-name"/);
  app.onCompositionPresetInput('card', {
    target: {
      value: 'storm',
      matches(selector) { return selector === '[data-preset-edit-input]'; }
    }
  });
  app.renderCompositionPresetList('card');
  assert.match(app.dom.cardPresetList.innerHTML, /value="storm"/);

  app.cancelCompositionPresetRowEdit('card');
  let prevented = false;
  const descriptionText = {
    dataset: { presetDescription: 'wind' },
    closest(selector) {
      return selector.includes('[data-preset-description]') ? this : null;
    }
  };
  app.onCompositionPresetKeydown('card', {
    target: descriptionText,
    key: 'Enter',
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.match(app.dom.cardPresetList.innerHTML, /aria-label="预设描述"/);
  assert.match(app.dom.cardPresetList.innerHTML, /class="preset-list-name"/);
  assert.doesNotMatch(app.dom.cardPresetList.innerHTML, /class="preset-list-description"/);
});

test('Delayed preset loads cannot write into another category, project, or name', async () => {
  const source = makeCard('race-source');
  const preset = createCompositionPreset({ name: 'race', sourceKind: 'card', target: source, now: 0 });

  for (const invalidate of ['category', 'project', 'selection']) {
    const pendingRead = createDeferred();
    const bridge = {
      async listProjectPresets() { return { ok: true, items: [] }; },
      async readProjectPreset() { return pendingRead.promise; }
    };

    class RaceHarness {
      constructor() {
        this.dom = {};
        this.getCompositionPresetShell = () => bridge;
        assignPresetUiDom(this.dom, 'card', makePresetUiDom());
        assignPresetUiDom(this.dom, 'node', makePresetUiDom());
        this.initCompositionPresetState();
        this.projectPresetContext = {
          projectFilePath: 'D:\\projects\\one\\effect.json',
          projectId: '',
          projectType: 'composition',
          projectName: 'one'
        };
        this.compositionPresetState.card.context = { cardId: source.id, treePath: [], nodeId: '' };
        this.compositionPresetState.card.selectedName = 'race';
      }
    }
    installCompositionPresetMethods(RaceHarness, {
      esc: String,
      normalizeCard: normalizeCompositionCard,
      normalizeShapeTreeNode: normalizeCompositionShapeNode
    });

    const app = new RaceHarness();
    const loading = app.loadCompositionPreset('card');
    if (invalidate === 'category') {
      app.selectCompositionPresetCategory('card', 'shared');
      } else {
        if (invalidate === 'project') {
        app.setCompositionPresetProjectContext({
          projectFilePath: 'D:\\projects\\two\\effect.json',
          projectType: 'composition',
          projectName: 'two'
        });
        } else app.selectCompositionPreset('card', 'other');
    }
    pendingRead.resolve({ ok: true, text: JSON.stringify(preset) });
    assert.equal(await loading, null);
    assert.equal(app.compositionPresetState.card.loadedPreset, null);
    assert.equal(app.compositionPresetState.card.loadedKey, '');
  }
});

test('Delayed apply reads the checked sections after loading completes', async () => {
  const pendingRead = createDeferred();
  const source = makeCard('delayed-source');
  const target = makeCard('delayed-target', {
    point: { x: 90, y: 91, z: 92 },
    particleInit: [{ target: 'size', expr: 'keep-properties' }]
  });
  const preset = createCompositionPreset({ name: 'delayed', sourceKind: 'card', target: source, now: 0 });
  const bridge = {
    async readProjectPreset() { return pendingRead.promise; }
  };

  class ApplyRaceHarness {
    constructor() {
      this.state = { cards: [target] };
      this.history = [];
      this.dom = {};
      this.getCompositionPresetShell = () => bridge;
      this.cardUi = makePresetUiDom(['position', 'properties']);
      assignPresetUiDom(this.dom, 'card', this.cardUi);
      assignPresetUiDom(this.dom, 'node', makePresetUiDom());
      this.initCompositionPresetState();
      this.projectPresetContext = {
        projectFilePath: 'D:\\projects\\one\\effect.json',
        projectId: '',
        projectType: 'composition',
        projectName: 'one'
      };
      this.compositionPresetState.card.context = { cardId: target.id, treePath: [], nodeId: '' };
      this.compositionPresetState.card.selectedName = 'delayed';
    }
    getCardIndexById(cardId) { return this.state.cards.findIndex((card) => card.id === cardId); }
    pushHistory() { this.history.push(cloneCompositionValue(this.state)); }
    afterStructureMutate() {}
    showToast() {}
  }
  installCompositionPresetMethods(ApplyRaceHarness, {
    esc: String,
    normalizeCard: normalizeCompositionCard,
    normalizeShapeTreeNode: normalizeCompositionShapeNode
  });

  const app = new ApplyRaceHarness();
  const applying = app.applyLoadedCompositionPreset('card');
  app.cardUi.sectionInputs.find((input) => input.dataset.presetSection === 'properties').checked = false;
  pendingRead.resolve({ ok: true, text: JSON.stringify(preset) });
  await applying;
  assert.equal(app.history.length, 1, JSON.stringify({
    token: app.compositionPresetState.card.operationToken,
    status: app.dom.cardPresetStatus.textContent,
    loadedKey: app.compositionPresetState.card.loadedKey,
    selectedName: app.compositionPresetState.card.selectedName,
    query: app.dom.cardPresetSearch.value
  }));
  assert.deepEqual(app.state.cards[0].point, source.point);
  assert.equal(app.state.cards[0].particleInit[0].expr, 'keep-properties');
});
