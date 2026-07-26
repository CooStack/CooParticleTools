import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dispatchProjectCloseRequest } from '../src/services/shell/electron-shell.js';

test('project close requests default to a clean unhandled page', async () => {
  const target = new EventTarget();
  assert.deepEqual(await dispatchProjectCloseRequest({ action: 'inspect' }, target), {
    handled: false,
    dirty: false,
  });
});

test('project pages can respond to asynchronous close requests', async () => {
  const target = new EventTarget();
  target.addEventListener('coo-project-close-request', (event) => {
    event.detail.respondWith(Promise.resolve({
      handled: true,
      dirty: true,
      projectName: 'Demo',
    }));
  });

  assert.deepEqual(await dispatchProjectCloseRequest({ action: 'inspect' }, target), {
    handled: true,
    dirty: true,
    projectName: 'Demo',
  });
});

test('file-backed editors inspect dirty state and save before closing', async () => {
  const [generator, legacyFrame] = await Promise.all([
    readFile(new URL('../src/pages/GeneratorPage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LegacyPageFrame.vue', import.meta.url), 'utf8'),
  ]);

  for (const source of [generator, legacyFrame]) {
    assert.match(source, /coo-project-close-request/);
    assert.match(source, /request\.respondWith\(inspectProjectBeforeClose\(\)\)/);
    assert.match(source, /request\.respondWith\(saveProjectBeforeClose\(\)\)/);
  }
  assert.match(generator, /serializeProject\(\) !== savedFileSnapshot/);
  assert.match(legacyFrame, /snapshot !== savedFileSnapshot/);
  assert.match(generator, /const fileSnapshot = serializeProject\(\);[\s\S]*?text: JSON\.stringify\(JSON\.parse\(fileSnapshot\), null, 2\)[\s\S]*?savedFileSnapshot = fileSnapshot;/);
  assert.match(legacyFrame, /const fileSnapshot = JSON\.stringify\(filePayload\);[\s\S]*?const text = JSON\.stringify\(filePayload, null, 2\)[\s\S]*?savedFileSnapshot = fileSnapshot;/);
  assert.match(legacyFrame, /if \(activeProjectId\.value \|\| savedFileSnapshot\) return;/);
});
