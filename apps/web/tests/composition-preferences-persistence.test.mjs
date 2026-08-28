import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COMPOSITION_STORAGE_KEY,
  createCompositionProject
} from '../public/legacy/assets/composition_builder/js/model.js';
import {
  COMPOSITION_PREFERENCES_STORAGE_KEY,
  loadCompositionStateFromStorage,
  saveCompositionStateToStorage
} from '../public/legacy/assets/composition_builder/js/preferences.js';
import { getProjectDefinition } from '../src/modules/projects/project-types.js';
import {
  hydrateLegacyPreferences,
  persistLegacyPreferences
} from '../src/modules/projects/legacy-preferences.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.entries.has(key) ? this.entries.get(key) : null;
  }

  setItem(key, value) {
    this.entries.set(key, String(value));
  }
}

test('Composition preferences survive a project draft replacement and restart', () => {
  const storage = new MemoryStorage();
  const state = createCompositionProject({ projectName: 'BeforeRestart' });
  state.settings.paramStep = 0.25;
  state.settings.pointSize = 0.08;
  state.settings.showAxes = false;
  state.settings.showGrid = true;
  state.settings.realtimeCode = false;
  state.hotkeys.actions.toggleSettings = 'Mod+KeyH';

  saveCompositionStateToStorage(storage, state);
  assert.ok(storage.getItem(COMPOSITION_PREFERENCES_STORAGE_KEY));

  storage.setItem(COMPOSITION_STORAGE_KEY, JSON.stringify({
    projectName: 'RestoredProject',
    compositionType: 'particle',
    cards: []
  }));

  const restored = loadCompositionStateFromStorage(storage);

  assert.equal(restored.projectName, 'RestoredProject');
  assert.equal(restored.settings.paramStep, 0.25);
  assert.equal(restored.settings.pointSize, 0.08);
  assert.equal(restored.settings.showAxes, false);
  assert.equal(restored.settings.showGrid, true);
  assert.equal(restored.settings.realtimeCode, false);
  assert.equal(restored.hotkeys.actions.toggleSettings, 'Mod+KeyH');
});

test('Composition preference loading tolerates damaged or unavailable storage', () => {
  const legacyState = createCompositionProject({ projectName: 'LegacyDraft' });
  legacyState.settings.pointSize = 0.12;
  const damaged = new MemoryStorage({
    [COMPOSITION_STORAGE_KEY]: JSON.stringify(legacyState),
    [COMPOSITION_PREFERENCES_STORAGE_KEY]: '{not-json'
  });

  const migrated = loadCompositionStateFromStorage(damaged);
  assert.equal(migrated.settings.pointSize, 0.12);
  assert.equal(
    JSON.parse(damaged.getItem(COMPOSITION_PREFERENCES_STORAGE_KEY)).settings.pointSize,
    0.12
  );

  const unavailable = {
    getItem() {
      throw new Error('storage unavailable');
    },
    setItem() {
      throw new Error('storage unavailable');
    }
  };
  assert.equal(loadCompositionStateFromStorage(unavailable).settings.paramStep, 0.1);
});

test('Composition preference loading repairs structurally invalid and partial records', () => {
  const legacyState = createCompositionProject({ projectName: 'LegacyDraft' });
  legacyState.settings.pointSize = 0.12;
  legacyState.hotkeys.actions.toggleSettings = 'Mod+KeyH';
  const invalid = new MemoryStorage({
    [COMPOSITION_STORAGE_KEY]: JSON.stringify(legacyState),
    [COMPOSITION_PREFERENCES_STORAGE_KEY]: '{}'
  });

  const repaired = loadCompositionStateFromStorage(invalid);
  assert.equal(repaired.settings.pointSize, 0.12);
  assert.equal(repaired.hotkeys.actions.toggleSettings, 'Mod+KeyH');

  const partial = new MemoryStorage({
    [COMPOSITION_STORAGE_KEY]: JSON.stringify(legacyState),
    [COMPOSITION_PREFERENCES_STORAGE_KEY]: JSON.stringify({
      settings: { pointSize: 0.2 }
    })
  });
  const merged = loadCompositionStateFromStorage(partial);
  assert.equal(merged.settings.pointSize, 0.2);
  assert.equal(merged.hotkeys.actions.toggleSettings, 'Mod+KeyH');
});

test('Composition loading persists repaired card identities', () => {
  const storage = new MemoryStorage({
    [COMPOSITION_STORAGE_KEY]: JSON.stringify({
      projectName: 'DuplicateCards',
      cards: [
        { id: 'same-card', name: '卡片 1' },
        { id: 'same-card', name: '卡片 2' },
        { id: '', name: '卡片 3' }
      ]
    })
  });

  const restored = loadCompositionStateFromStorage(storage);
  const ids = restored.cards.map((card) => card.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(Boolean));
  const persisted = JSON.parse(storage.getItem(COMPOSITION_STORAGE_KEY));
  assert.deepEqual(persisted.cards.map((card) => card.id), ids);
});

test('Composition preferences persist when the larger project draft exceeds storage quota', () => {
  const entries = new Map();
  const storage = {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      if (key === COMPOSITION_STORAGE_KEY) throw new Error('quota exceeded');
      entries.set(key, String(value));
    }
  };
  const state = createCompositionProject();
  state.settings.pointSize = 0.18;

  assert.throws(() => saveCompositionStateToStorage(storage, state), /quota exceeded/);
  assert.equal(
    JSON.parse(storage.getItem(COMPOSITION_PREFERENCES_STORAGE_KEY)).settings.pointSize,
    0.18
  );
});

test('Composition pagehide persists preferences without overwriting a pending project draft', async () => {
  const source = await readFile(
    new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url),
    'utf8'
  );
  const pagehideHandler = source.match(/window\.addEventListener\("pagehide",[\s\S]*?\n}\);/)?.[0] || '';

  assert.match(pagehideHandler, /app\.savePreferencesNow\(\)/);
  assert.doesNotMatch(pagehideHandler, /app\.saveStateNow\(\)/);
});

test('Composition legacy project adapter keeps preferences outside project payloads', () => {
  const definition = getProjectDefinition('composition');
  const state = createCompositionProject({ projectName: 'PortableProject' });
  state.settings.theme = 'light-pink';
  state.hotkeys.actions.toggleSettings = 'Mod+KeyH';

  const preferences = definition.legacy.preferencesFromDraft(state);
  const draft = definition.legacy.toDraft(state);
  const payload = definition.legacy.fromDraft(state);
  const file = definition.legacy.toFile(state, state.projectName);

  assert.equal(preferences.settings.theme, 'light-pink');
  assert.equal(preferences.hotkeys.actions.toggleSettings, 'Mod+KeyH');
  for (const value of [draft, payload, file]) {
    assert.equal(Object.hasOwn(value, 'settings'), false);
    assert.equal(Object.hasOwn(value, 'hotkeys'), false);
  }
  assert.equal(Object.hasOwn(preferences.settings, 'autoSaveIntervalsMinutes'), false);
  assert.equal(Object.hasOwn(draft, 'projectSettings'), false);
});

test('Electron durable preferences survive an origin change', async () => {
  const definition = getProjectDefinition('composition');
  const durable = new Map();
  const shell = {
    async readPreferences(key) {
      return { ok: true, value: durable.get(key) || null };
    },
    async writePreferences(key, value) {
      durable.set(key, structuredClone(value));
      return { ok: true };
    }
  };
  const firstOrigin = new MemoryStorage();
  const state = createCompositionProject();
  state.settings.paramStep = 0.25;
  state.settings.showGrid = true;
  state.settings.realtimeCode = false;
  saveCompositionStateToStorage(firstOrigin, state);

  await persistLegacyPreferences(definition.legacy, firstOrigin, shell);

  const restartedOrigin = new MemoryStorage();
  await hydrateLegacyPreferences(definition.legacy, restartedOrigin, shell);
  const restored = loadCompositionStateFromStorage(restartedOrigin);
  assert.equal(restored.settings.paramStep, 0.25);
  assert.equal(restored.settings.showGrid, true);
  assert.equal(restored.settings.realtimeCode, false);
});

test('current-origin preferences win stale durable values during reload', async () => {
  const definition = getProjectDefinition('composition');
  const durable = new Map([[
    COMPOSITION_PREFERENCES_STORAGE_KEY,
    {
      settings: { paramStep: 0.1, showGrid: false },
      hotkeys: { actions: { undo: 'Mod+KeyZ' } }
    }
  ]]);
  const storage = new MemoryStorage({
    [COMPOSITION_PREFERENCES_STORAGE_KEY]: JSON.stringify({
      settings: { paramStep: 0.35 },
      hotkeys: { actions: { toggleSettings: 'Mod+KeyH' } }
    })
  });
  const shell = {
    async readPreferences(key) {
      return { ok: true, value: durable.get(key) || null };
    },
    async writePreferences(key, value) {
      durable.set(key, structuredClone(value));
      return { ok: true };
    }
  };

  const preferences = await hydrateLegacyPreferences(definition.legacy, storage, shell);

  assert.equal(preferences.settings.paramStep, 0.35);
  assert.equal(preferences.settings.showGrid, false);
  assert.equal(preferences.hotkeys.actions.undo, 'Mod+KeyZ');
  assert.equal(preferences.hotkeys.actions.toggleSettings, 'Mod+KeyH');
  assert.deepEqual(durable.get(COMPOSITION_PREFERENCES_STORAGE_KEY), preferences);
});
