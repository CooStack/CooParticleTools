import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('the app draws its own title bar instead of relying on native chrome', async () => {
  const source = await read('../src/components/AppTitleBar.vue');

  // Themed from the same tokens as the page, not from OS colours.
  assert.match(source, /background:\s*var\(--panel\)/);
  assert.match(source, /color:\s*var\(--text\)/);
  assert.match(source, /border-bottom:\s*1px solid var\(--line\)/);

  // The bar must be draggable, but the menu must not be.
  assert.match(source, /-webkit-app-region:\s*drag/);
  assert.match(source, /-webkit-app-region:\s*no-drag/);

  // Menu contents come from the shell, so the native menu and this one agree.
  assert.match(source, /getMenuModel/);
  assert.match(source, /runMenuCommand/);
  assert.match(source, /onMenuModel/);
});

test('the title bar only renders inside the desktop shell', async () => {
  const source = await read('../src/components/AppTitleBar.vue');
  assert.match(source, /chrome\.value\?\.customTitleBar/);
  assert.match(source, /if \(!shell\?\.getWindowChrome\) return;/);
});

test('full-height surfaces reserve room for the app chrome', async () => {
  const theme = await read('../src/assets/styles/theme.css');
  assert.match(theme, /--app-chrome-h:\s*0px/);
  assert.match(theme, /--app-vh:\s*calc\(100vh - var\(--app-chrome-h\)\)/);

  // A surface still pinned to a bare 100vh would overflow behind the title bar.
  for (const file of [
    '../src/assets/styles/layout.css',
    '../src/components/LegacyPageFrame.vue',
    '../src/pages/WorkbenchPage.vue',
    '../src/pages/PluginsPage.vue',
    '../src/pages/GeneratorPage.vue',
    '../src/components/AppShell.vue'
  ]) {
    const source = await read(file);
    const offenders = source
      .split('\n')
      .filter((line) => /(?:min-height|height):\s*100vh/.test(line));
    assert.deepEqual(offenders, [], `${file} still pins a full-height surface to 100vh`);
  }
});

test('the shell keeps the native overlay on the page colours', async () => {
  const shellSource = await read('../src/components/AppShell.vue');
  assert.match(shellSource, /setTitleBarTheme/);
  // The theme can change from inside an iframe or via an attribute, so a
  // one-shot read at mount is not enough.
  assert.match(shellSource, /MutationObserver/);
  assert.match(shellSource, /attributeFilter:\s*\['data-theme', 'data-generator-theme'\]/);

  const util = await read('../src/utils/window-chrome.js');
  // Glass panels are translucent; the overlay needs an opaque colour.
  assert.match(util, /compositeOver/);
  assert.match(util, /function toHex/);
});

test('builders tell the shell which theme they switched to', async () => {
  const builders = [
    '../public/legacy/assets/composition_builder/js/main.js',
    '../public/legacy/assets/points_builder/js/main.js',
    '../public/legacy/assets/shader_builder/js/settings.js',
    '../public/legacy/assets/emitter_generator/js/settings.js'
  ];
  for (const builder of builders) {
    const source = await read(builder);
    assert.match(source, /coo-legacy-theme/, `${builder} does not broadcast its theme`);
  }

  const frame = await read('../src/components/LegacyPageFrame.vue');
  assert.match(frame, /coo-legacy-theme/);
  assert.match(frame, /function applyHostTheme/);
  // Leaving a builder must not leave its theme on the workbench.
  assert.match(frame, /applyHostTheme\(''\)/);
});
