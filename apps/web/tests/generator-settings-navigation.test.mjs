import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GENERATOR_HOTKEY_DEFAULTS,
  normalizeGeneratorProject
} from '../src/modules/generator/defaults.js';
import { hotkeyMatchEvent, hotkeyToHuman } from '../src/modules/pointsbuilder/hotkeys.js';

test('generator settings are a standalone modal opened from the settings tab', async () => {
  const pageSource = await readFile(
    new URL('../src/pages/GeneratorPage.vue', import.meta.url),
    'utf8'
  );
  const modalSource = await readFile(
    new URL('../src/components/GeneratorSettingsModal.vue', import.meta.url),
    'utf8'
  );
  const hotkeysModalSource = await readFile(
    new URL('../src/components/GeneratorHotkeysModal.vue', import.meta.url),
    'utf8'
  );

  assert.match(pageSource, /selectGeneratorTab\(tab\.id\)/);
  assert.match(pageSource, /@lifecycle-change="restartPreviewAfterRootLifecycleChange"/);
  assert.match(pageSource, /matchesHotkey\(event, 'toggleSettings'\)/);
  assert.match(pageSource, /hotkeyMatchEvent\(event, 'Mod\+Shift\+KeyZ'\)/);
  assert.doesNotMatch(pageSource, /settings-submenu|generator-workspace--settings/);
  assert.match(modalSource, /role="dialog" aria-modal="true"/);
  assert.match(modalSource, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(modalSource, /lifecycle-change/);
  assert.doesNotMatch(modalSource, /H 打开或关闭此窗口/);

  // Hotkeys moved out of the settings modal into their own dialog, matching the
  // Composition builder: the settings panel only links to it.
  assert.match(modalSource, /@click="\$emit\('open-hotkeys'\)"/);
  assert.doesNotMatch(modalSource, /captureHotkey/);
  assert.match(pageSource, /<GeneratorHotkeysModal/);
  assert.match(pageSource, /@start-capture="startHotkeyCapture"/);
  assert.match(hotkeysModalSource, /role="dialog"\s+aria-modal="true"/);
  assert.match(hotkeysModalSource, /placeholder="搜索快捷键"/);
  assert.match(hotkeysModalSource, /\$emit\('start-capture', item\.key\)/);
  assert.match(hotkeysModalSource, /\$emit\('clear-hotkey', item\.key\)/);
  assert.match(hotkeysModalSource, /\$emit\('reset-hotkeys'\)/);
});

test('generator settings modal exposes export and import like composition', async () => {
  const modalSource = await readFile(
    new URL('../src/components/GeneratorSettingsModal.vue', import.meta.url),
    'utf8'
  );
  const pageSource = await readFile(
    new URL('../src/pages/GeneratorPage.vue', import.meta.url),
    'utf8'
  );

  assert.match(modalSource, /导出设置/);
  assert.match(modalSource, /导入设置/);
  assert.match(modalSource, /accept="application\/json,\.json"/);
  assert.match(pageSource, /function exportGeneratorSettings/);
  assert.match(pageSource, /async function importGeneratorSettings/);
});

test('settings migration and configurable H hotkey are normalized', () => {
  assert.equal(GENERATOR_HOTKEY_DEFAULTS.toggleSettings, 'KeyH');
  const project = normalizeGeneratorProject({
    leftTab: 'settings',
    settings: { hotkeys: { toggleSettings: 'Mod+KeyH', clearParticles: '' } }
  });
  assert.equal(project.leftTab, 'emitters');
  assert.equal(project.settings.hotkeys.toggleSettings, 'Mod+KeyH');
  assert.equal(project.settings.hotkeys.clearParticles, '');
  assert.equal(project.settings.hotkeys.undo, 'Mod+KeyZ');
  assert.equal(project.settings.hotkeys.redo, 'Mod+Shift+KeyZ');
});

test('hotkey matching and labels retain modifiers', () => {
  assert.equal(
    hotkeyMatchEvent({ code: 'KeyH', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, 'Mod+KeyH'),
    true
  );
  assert.equal(hotkeyMatchEvent({ code: 'KeyH', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, 'Mod+KeyH'), false);
  assert.equal(hotkeyMatchEvent({ code: 'KeyZ', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }, 'Mod+Shift+KeyZ'), true);
  assert.equal(hotkeyToHuman('Mod+Shift+KeyZ'), 'Ctrl/Cmd + Shift + Z');
});
