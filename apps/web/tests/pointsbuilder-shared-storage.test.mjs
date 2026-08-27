import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  installStoragePrefixPatch,
  migratePointsBuilderSharedStorage,
  POINTS_BUILDER_SHARED_STORAGE_KEYS
} from '../public/legacy/assets/src/js/shared/storage-prefix-bootstrap.js';
import {
  getAutoStateStorageKey,
  loadAutoState,
  saveAutoState
} from '../public/legacy/assets/points_builder/js/io.js';
import { GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY } from '../src/modules/generator/pointsbuilder-bridge.js';

const EXPECTED_SHARED_KEYS = [
  'pb_settings_v1',
  'pb_presets_v1',
  'pb_preset_groups_v1',
  'pb_hotkeys_v2',
  'pb_layout_v1',
  'pb_root_filter_v2',
  'pb_theme_v2'
];
const EXPECTED_CONTEXT_KEYS = [
  'pb_state_v1',
  'pb_project_name_v1',
  'pb_kotlin_end_v1',
  'pb_comp_context_v1'
];

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

function createContextStorage(prefix) {
  const originalStorage = globalThis.Storage;
  class ContextStorage extends MemoryStorage {}
  globalThis.Storage = ContextStorage;
  try {
    installStoragePrefixPatch({
      prefix,
      guardProperty: `__testPatched_${prefix}`,
      sharedKeys: POINTS_BUILDER_SHARED_STORAGE_KEYS
    });
    return new ContextStorage();
  } finally {
    globalThis.Storage = originalStorage;
  }
}

test('PointsBuilder presets and settings stay global while project state stays contextual', () => {
  assert.deepEqual([...POINTS_BUILDER_SHARED_STORAGE_KEYS], EXPECTED_SHARED_KEYS);

  for (const prefix of ['egpb_', 'cpb_']) {
    const storage = createContextStorage(prefix);
    for (const key of EXPECTED_SHARED_KEYS) {
      storage.setItem(key, key);
      assert.equal(storage.getItem(key), key);
      assert.equal(storage.values.get(key), key);
      assert.equal(storage.values.has(`${prefix}${key}`), false);
      storage.removeItem(key);
      assert.equal(storage.values.has(key), false);
    }

    for (const key of EXPECTED_CONTEXT_KEYS) {
      storage.setItem(key, key);
      assert.equal(storage.getItem(key), key);
      assert.equal(storage.values.get(`${prefix}${key}`), key);
      assert.equal(storage.values.has(key), false);
      storage.removeItem(key);
      assert.equal(storage.values.has(`${prefix}${key}`), false);
    }
  }
});

test('embedded contexts migrate legacy scoped preferences only when no global value exists', () => {
  const storage = new MemoryStorage();
  storage.setItem('egpb_pb_settings_v1', 'emitter-settings');
  storage.setItem('egpb_pb_presets_v1', 'emitter-presets');
  storage.setItem('pb_presets_v1', 'global-presets');
  storage.setItem('egpb_pb_kotlin_end_v1', 'clone');

  migratePointsBuilderSharedStorage({
    prefix: 'egpb_',
    storage,
    sharedKeys: EXPECTED_SHARED_KEYS
  });

  assert.equal(storage.getItem('pb_settings_v1'), 'emitter-settings');
  assert.equal(storage.getItem('egpb_pb_settings_v1'), null);
  assert.equal(storage.getItem('pb_presets_v1'), 'global-presets');
  assert.equal(storage.getItem('egpb_pb_presets_v1'), null);
  assert.equal(storage.getItem('egpb_pb_kotlin_end_v1'), 'clone');
  assert.equal(storage.getItem('pb_kotlin_end_v1'), null);
});

test('Composition PointsBuilder drafts are isolated by card and target', () => {
  const previousStorage = globalThis.localStorage;
  const previousContext = globalThis.__PB_EDITOR_CONTEXT;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    const state = (value) => ({
      root: { id: 'root', kind: 'ROOT', children: [{ id: value, kind: 'add_point', x: value, y: 0, z: 0 }] }
    });
    globalThis.__PB_EDITOR_CONTEXT = { cardId: 'card-2', target: 'root', compositionRevision: 'r2' };
    assert.equal(saveAutoState(state('card-2')), true);
    globalThis.__PB_EDITOR_CONTEXT = { cardId: 'card-3', target: 'root', compositionRevision: 'r3' };
    assert.equal(saveAutoState(state('card-3')), true);

    const card2Key = getAutoStateStorageKey({ cardId: 'card-2', target: 'root' });
    const card3Key = getAutoStateStorageKey({ cardId: 'card-3', target: 'root' });
    assert.notEqual(card2Key, card3Key);
    assert.ok(storage.getItem(card2Key));
    assert.ok(storage.getItem(card3Key));

    globalThis.__PB_EDITOR_CONTEXT = { cardId: 'card-2', target: 'root', compositionRevision: 'r2' };
    assert.equal(loadAutoState().root.children[0].id, 'card-2');
    globalThis.__PB_EDITOR_CONTEXT = { cardId: 'card-3', target: 'root', compositionRevision: 'r3' };
    assert.equal(loadAutoState().root.children[0].id, 'card-3');
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.__PB_EDITOR_CONTEXT = previousContext;
  }
});

test('embedded PointsBuilder contexts use the program-wide storage key set', async () => {
  const [
    emitterBootstrap,
    compositionBootstrap,
    generatorPage,
    pointsBuilderMain,
    pointsBuilderEntry,
    compositionEntry,
    pointsBuilderHtml,
    compositionHtml
  ] = await Promise.all([
    readFile(new URL('../public/legacy/assets/src/js/pages/emitter-pointsbuilder-bootstrap.page.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/src/js/pages/composition-pointsbuilder-bootstrap.page.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/GeneratorPointsBuilderPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/src/js/pages/pointsbuilder.page.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/src/js/pages/composition-pointsbuilder.page.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/composition_pointsbuilder.html', import.meta.url), 'utf8')
  ]);

  for (const source of [emitterBootstrap, compositionBootstrap]) {
    assert.match(source, /migratePointsBuilderSharedStorage\(/);
    assert.match(source, /sharedKeys:\s*POINTS_BUILDER_SHARED_STORAGE_KEYS/);
    assert.match(source, /storage-prefix-bootstrap\.js\?v=[0-9_]+/);
  }
  assert.equal(GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY, 'egpb_pb_kotlin_end_v1');
  assert.match(
    generatorPage,
    /localStorage\.setItem\(GENERATOR_POINTS_BUILDER_KOTLIN_END_KEY,\s*snapshot\.kotlinEndMode\)/
  );
  assert.match(pointsBuilderMain, /if \(normalized\) delete normalized\.presets/);
  assert.match(pointsBuilderMain, /hasSharedPresetList \? loadPresetList\(\) : legacyStatePresets/);
  assert.match(pointsBuilderMain, /if \(hadLegacyStatePresets && legacyPresetMigrationComplete\) saveAutoState\(state\)/);
  assert.doesNotMatch(pointsBuilderMain, /state\.presets\s*=/);
  /*
   * Both PointsBuilder entries must load the *same* cache-busted main.js build,
   * or the standalone page and the embedded one end up on different code with the
   * same storage keys. Asserted as agreement rather than as a literal version:
   * pinning the literal meant every routine cache bump failed this test, which
   * trains people to edit the assertion instead of reading it.
   */
  const versionOf = (source) => source.match(/points_builder\/js\/main\.js\?v=([0-9_]+)/)?.[1];
  const entryVersion = versionOf(pointsBuilderEntry);
  assert.ok(entryVersion, 'the PointsBuilder entry must load a cache-busted main.js');
  assert.equal(
    versionOf(compositionEntry),
    entryVersion,
    'both PointsBuilder entries must load the same main.js build'
  );
  assert.match(pointsBuilderHtml, /pointsbuilder\.page\.js\?v=[0-9_]+/);
  assert.match(compositionHtml, /composition-pointsbuilder\.page\.js\?v=[0-9_]+/);
});
