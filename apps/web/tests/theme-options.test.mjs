import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GENERATOR_THEME_OPTIONS,
  normalizeGeneratorProject
} from '../src/modules/generator/defaults.js';
import {
  minecraftThemeFor,
  normalizeWorkbenchTheme
} from '../public/legacy/assets/composition_builder/js/theme.js';

test('generator exposes only the supported pink themes', () => {
  assert.deepEqual(
    GENERATOR_THEME_OPTIONS.map((theme) => theme.id),
    ['dark-1', 'light-pink']
  );
});

test('generator migrates removed theme ids', () => {
  for (const theme of ['light-1', 'light-2', 'light-3', 'light-pink']) {
    assert.equal(normalizeGeneratorProject({ settings: { theme } }).settings.theme, 'light-pink');
  }
  for (const theme of ['dark-1', 'dark-2', 'dark-3', 'unknown']) {
    assert.equal(normalizeGeneratorProject({ settings: { theme } }).settings.theme, 'dark-1');
  }
  assert.equal(normalizeGeneratorProject({ settings: { theme: 'light-custom' } }).settings.theme, 'dark-1');
});

test('composition theme selector contains only supported themes', async () => {
  const html = await readFile(
    new URL('../public/legacy/composition_builder.html', import.meta.url),
    'utf8'
  );
  const select = html.match(/<select id="themeSelect"[\s\S]*?<\/select>/)?.[0] || '';
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, ['dark-1', 'light-pink']);
});

test('composition migrates only known legacy themes', () => {
  for (const theme of ['light-1', 'light-2', 'light-3', 'light-pink']) {
    assert.equal(normalizeWorkbenchTheme(theme), 'light-pink');
    assert.equal(minecraftThemeFor(theme), 'light-pink');
  }
  for (const theme of ['dark-1', 'dark-2', 'dark-3', 'light-custom', 'unknown']) {
    assert.equal(normalizeWorkbenchTheme(theme), 'dark-1');
    assert.equal(minecraftThemeFor(theme), 'deep-pink');
  }
});

test('deep pink preview keeps unselected particles white', async () => {
  const css = await readFile(
    new URL('../public/legacy/assets/shared/css/minecraft-theme.css', import.meta.url),
    'utf8'
  );
  const deepPinkBlock = css.match(/body\[data-mc-theme="deep-pink"\][\s\S]*?\n\}/)?.[0] || '';
  assert.match(deepPinkBlock, /--point-color:\s*#ffffff;/i);
  assert.match(deepPinkBlock, /--point-focus:\s*var\(--mc-gold\);/);
});

test('composition Bezier tool inherits the active workbench theme', async () => {
  const [mainSource, toolSource] = await Promise.all([
    readFile(
      new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../public/legacy/assets/src/js/pages/composition-bezier-tool.page.js', import.meta.url),
      'utf8'
    )
  ]);

  assert.match(mainSource, /theme:\s*normalizeWorkbenchTheme\(this\.state\.settings\.theme\)/);
  assert.match(mainSource, /mcTheme:\s* minecraftThemeFor\(this\.state\.settings\.theme\)/);
  assert.match(toolSource, /document\.body\.setAttribute\("data-theme", theme\)/);
  assert.match(toolSource, /document\.body\.setAttribute\("data-mc-theme", mcTheme\)/);
});
