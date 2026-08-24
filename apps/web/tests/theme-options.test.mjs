import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GENERATOR_THEME_OPTIONS,
  normalizeGeneratorProject
} from '../src/modules/generator/defaults.js';
import { GLASS_THEMES, normalizeWorkbenchTheme } from '../public/legacy/assets/composition_builder/js/theme.js';

const FLAT_THEMES = ['dark-1', 'light-1'];

test('generator exposes the flat themes plus every glass variant', () => {
  assert.deepEqual(
    GENERATOR_THEME_OPTIONS.map((theme) => theme.id),
    [...FLAT_THEMES, ...GLASS_THEMES]
  );
});

test('glass variants cover both modes across all four hues', () => {
  assert.equal(GLASS_THEMES.length, 8);
  for (const mode of ['dark', 'light']) {
    for (const hue of ['blue', 'green', 'violet', 'neutral']) {
      assert.ok(GLASS_THEMES.includes(`glass-${mode}-${hue}`), `missing glass-${mode}-${hue}`);
    }
  }
});

test('generator migrates removed theme ids', () => {
  for (const theme of ['light-1', 'light-2', 'light-3', 'light-pink']) {
    assert.equal(normalizeGeneratorProject({ settings: { theme } }).settings.theme, 'light-1');
  }
  for (const theme of ['dark-1', 'dark-2', 'dark-3', 'unknown']) {
    assert.equal(normalizeGeneratorProject({ settings: { theme } }).settings.theme, 'dark-1');
  }
  assert.equal(normalizeGeneratorProject({ settings: { theme: 'light-custom' } }).settings.theme, 'dark-1');
});

test('generator preserves glass themes through normalization', () => {
  for (const theme of GLASS_THEMES) {
    assert.equal(normalizeGeneratorProject({ settings: { theme } }).settings.theme, theme);
  }
});

test('composition theme selector offers the flat and glass themes', async () => {
  const html = await readFile(
    new URL('../public/legacy/composition_builder.html', import.meta.url),
    'utf8'
  );
  const select = html.match(/<select id="themeSelect"[\s\S]*?<\/select>/)?.[0] || '';
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, [...FLAT_THEMES, ...GLASS_THEMES]);
});

test('composition migrates only known legacy themes', () => {
  for (const theme of ['light-1', 'light-2', 'light-3', 'light-pink']) {
    assert.equal(normalizeWorkbenchTheme(theme), 'light-1');
  }
  for (const theme of ['dark-1', 'dark-2', 'dark-3', 'light-custom', 'unknown']) {
    assert.equal(normalizeWorkbenchTheme(theme), 'dark-1');
  }
  for (const theme of GLASS_THEMES) {
    assert.equal(normalizeWorkbenchTheme(theme), theme);
  }
});

test('every page that can select a glass theme also loads the glass stylesheet', async () => {
  const pages = [
    'bezier.html',
    'composition_builder.html',
    'composition_pointsbuilder.html',
    'generator.html',
    'pointsbuilder.html',
    'shader_builder.html',
    'assets/composition_builder/bezier_tool.html'
  ];
  for (const page of pages) {
    const html = await readFile(new URL(`../public/legacy/${page}`, import.meta.url), 'utf8');
    assert.match(html, /glass-theme\.css/, `${page} does not load glass-theme.css`);
  }
});

test('the glass stylesheet defines all eight variants', async () => {
  const css = await readFile(
    new URL('../public/legacy/assets/shared/css/glass-theme.css', import.meta.url),
    'utf8'
  );
  // Variants are composed from a mode block plus a hue block rather than eight
  // literal blocks, so assert the primitives exist.
  assert.match(css, /\[data-theme\^="glass-dark-"\]/);
  assert.match(css, /\[data-theme\^="glass-light-"\]/);
  for (const hue of ['blue', 'green', 'violet', 'neutral']) {
    assert.match(css, new RegExp(`\\[data-theme\\$="-${hue}"\\]`), `missing hue block for ${hue}`);
  }
  assert.match(css, /backdrop-filter:\s*blur\(/);
});

test('the pixel skin is gone and no page still links it', async () => {
  const pages = [
    'bezier.html',
    'composition_builder.html',
    'composition_pointsbuilder.html',
    'generator.html',
    'pointsbuilder.html',
    'shader_builder.html',
    'assets/composition_builder/bezier_tool.html'
  ];
  for (const page of pages) {
    const html = await readFile(new URL(`../public/legacy/${page}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /minecraft-theme\.css/, `${page} still links the pixel skin`);
    assert.doesNotMatch(html, /data-mc-theme/, `${page} still sets data-mc-theme`);
  }
});

test('preview colors survive the pixel skin removal', async () => {
  // --point-color / --grid-color are read at runtime by readCssColor() in
  // points_builder/js/main.js, so both themes must still define them now that
  // minecraft-theme.css no longer supplies a fallback.
  const css = await readFile(
    new URL('../public/legacy/assets/points_builder/css/style.css', import.meta.url),
    'utf8'
  );
  for (const theme of ['dark-1', 'light-1']) {
    const block = css.match(new RegExp(`body\\[data-theme="${theme}"\\][\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.match(block, /--point-color:/, `${theme} is missing --point-color`);
    assert.match(block, /--grid-color:/, `${theme} is missing --grid-color`);
  }

  // The glass variants supply them from their mode blocks instead.
  const glass = await readFile(
    new URL('../public/legacy/assets/shared/css/glass-theme.css', import.meta.url),
    'utf8'
  );
  for (const mode of ['dark', 'light']) {
    const block = glass.match(new RegExp(`\\[data-theme\\^="glass-${mode}-"\\][\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.match(block, /--point-color:/, `glass-${mode} is missing --point-color`);
    assert.match(block, /--grid-color:/, `glass-${mode} is missing --grid-color`);
  }
});

test('the glass token chain is complete and symmetric across modes', async () => {
  const css = await readFile(
    new URL('../public/legacy/assets/shared/css/glass-theme.css', import.meta.url),
    'utf8'
  );

  const blockFor = (selector) => {
    const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`));
    return match?.[1] || null;
  };
  const definedIn = (body) => new Set([...body.matchAll(/(--glass-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

  const dark = blockFor('[data-theme^="glass-dark-"]');
  const light = blockFor('[data-theme^="glass-light-"]');
  assert.ok(dark, 'dark mode block missing');
  assert.ok(light, 'light mode block missing');

  const darkDefs = definedIn(dark);
  const lightDefs = definedIn(light);

  // A primitive present in one mode but not the other yields a variant that
  // silently falls back to an unset value.
  const asymmetric = [...darkDefs].filter((k) => !lightDefs.has(k))
    .concat([...lightDefs].filter((k) => !darkDefs.has(k)));
  assert.deepEqual(asymmetric, [], `primitives defined in only one mode: ${asymmetric.join(', ')}`);

  let provided = new Set([...darkDefs, ...lightDefs]);
  for (const hue of ['blue', 'green', 'violet', 'neutral']) {
    const body = blockFor(`[data-theme^="glass-"][data-theme$="-${hue}"]`);
    assert.ok(body, `hue block missing for ${hue}`);
    for (const key of definedIn(body)) provided.add(key);
  }

  const referenced = new Set([...css.matchAll(/var\((--glass-[a-z0-9-]+)/g)].map((m) => m[1]));
  const undefinedRefs = [...referenced].filter((key) => !provided.has(key));
  assert.deepEqual(undefinedRefs, [], `referenced but never defined: ${undefinedRefs.join(', ')}`);
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
  assert.match(toolSource, /document\.body\.setAttribute\("data-theme", theme\)/);
});
