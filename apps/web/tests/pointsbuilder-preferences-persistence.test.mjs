import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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

function createShell(durable) {
  return {
    async readPreferences(key) {
      return { ok: true, value: durable.get(key) || null };
    },
    async writePreferences(key, value) {
      durable.set(key, structuredClone(value));
      return { ok: true };
    }
  };
}

test('PointsBuilder preset preferences survive an Electron origin change', async () => {
  const definition = getProjectDefinition('pointsbuilder');
  const presets = [
    { id: 'preset-1', name: '符文预设1', group: '默认分组', children: [] },
    { id: 'preset-2', name: '三角符文', group: '默认分组/符文预设组1', children: [] }
  ];
  const groups = ['默认分组', '默认分组/符文预设组1'];
  const firstOrigin = new MemoryStorage({
    pb_presets_v1: JSON.stringify({ presets, groups, ts: 123 })
  });
  const durable = new Map();
  const shell = createShell(durable);

  assert.equal(definition.legacy.preferencesStorageKey, 'pb_presets_v1');
  assert.deepEqual(definition.legacy.preferencesFromDraft({ presets, groups }), { presets, groups });

  await persistLegacyPreferences(definition.legacy, firstOrigin, shell);

  const restartedOrigin = new MemoryStorage();
  await hydrateLegacyPreferences(definition.legacy, restartedOrigin, shell);
  assert.deepEqual(
    JSON.parse(restartedOrigin.getItem('pb_presets_v1')),
    { presets, groups }
  );
});

test('PointsBuilder current-origin preset entries merge with stale durable arrays', async () => {
  const definition = getProjectDefinition('pointsbuilder');
  const durable = new Map([[
    'pb_presets_v1',
    {
      presets: [{ id: 'old', name: '旧预设', updatedAt: 10 }],
      groups: ['旧分组']
    }
  ]]);
  const current = {
    presets: [{ id: 'new', name: '新预设', updatedAt: 20 }],
    groups: ['新分组']
  };
  const storage = new MemoryStorage({ pb_presets_v1: JSON.stringify(current) });

  const preferences = await hydrateLegacyPreferences(
    definition.legacy,
    storage,
    createShell(durable)
  );

  assert.deepEqual(preferences, {
    presets: [
      { id: 'old', name: '旧预设', updatedAt: 10 },
      { id: 'new', name: '新预设', updatedAt: 20 }
    ],
    groups: ['旧分组', '新分组']
  });
  assert.deepEqual(durable.get('pb_presets_v1'), preferences);
});

test('PointsBuilder empty current-origin arrays do not erase durable presets', async () => {
  const definition = getProjectDefinition('pointsbuilder');
  const durablePreferences = {
    presets: [{ id: 'durable', name: '保留预设', updatedAt: 100 }],
    groups: ['默认分组']
  };
  const storage = new MemoryStorage({
    pb_presets_v1: JSON.stringify({ presets: [], groups: [] })
  });
  const durable = new Map([['pb_presets_v1', durablePreferences]]);

  const preferences = await hydrateLegacyPreferences(
    definition.legacy,
    storage,
    createShell(durable)
  );

  assert.deepEqual(preferences, durablePreferences);
  assert.deepEqual(durable.get('pb_presets_v1'), durablePreferences);
});

test('PointsBuilder duplicate presets prefer the newer snapshot', async () => {
  const definition = getProjectDefinition('pointsbuilder');
  const durable = new Map([['pb_presets_v1', {
    presets: [{ id: 'same', name: '旧名称', updatedAt: 10 }],
    groups: ['默认分组']
  }]]);
  const storage = new MemoryStorage({
    pb_presets_v1: JSON.stringify({
      presets: [{ id: 'same', name: '新名称', updatedAt: 20 }],
      groups: ['默认分组']
    })
  });

  const preferences = await hydrateLegacyPreferences(
    definition.legacy,
    storage,
    createShell(durable)
  );

  assert.equal(preferences.presets[0].name, '新名称');
});

test('embedded PointsBuilder pages hydrate the shared durable preset library', async () => {
  const source = await readFile(
    new URL('../src/components/LegacyPageFrame.vue', import.meta.url),
    'utf8'
  );
  assert.match(source, /composition_builder\.html/);
  assert.match(source, /composition_pointsbuilder\.html/);
  assert.match(source, /POINTS_BUILDER_PREFERENCES_ADAPTER/);
  assert.match(source, /for \(const adapter of getLegacyPreferenceAdapters\(\)\)/);
});

test('PointsBuilder renders dirty preset groups after the hidden preset page becomes active', async () => {
  const source = await readFile(
    new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /if \(presetsActive\) schedulePresetLibraryRender\(\);/);
});
