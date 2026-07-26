const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPreferencesStore } = require('../src/preferences-store');

async function withTempStore(run) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-preferences-'));
  try {
    const filePath = path.join(root, 'preferences.json');
    await run({ filePath, store: createPreferencesStore({ filePath }) });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test('preferences survive a new store instance', async () => {
  await withTempStore(async ({ filePath, store }) => {
    const preferences = {
      settings: { paramStep: 0.25, showGrid: true, realtimeCode: false },
      hotkeys: { actions: { toggleSettings: 'Mod+KeyH' } }
    };

    await store.write('cb_preferences_v1', preferences);
    const restartedStore = createPreferencesStore({ filePath });

    assert.deepEqual(await restartedStore.read('cb_preferences_v1'), preferences);
  });
});

test('preferences store isolates keys and tolerates a damaged file', async () => {
  await withTempStore(async ({ filePath, store }) => {
    await store.write('composition', { settings: { pointSize: 0.2 } });
    await store.write('other-tool', { settings: { pointSize: 0.4 } });
    assert.deepEqual(await store.read('composition'), { settings: { pointSize: 0.2 } });
    assert.deepEqual(await store.read('other-tool'), { settings: { pointSize: 0.4 } });

    await fsp.writeFile(filePath, '{broken', 'utf8');
    assert.equal(await createPreferencesStore({ filePath }).read('composition'), null);
  });
});
