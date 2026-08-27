import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { APP_THEME_KEY, ALL_THEMES, normalizeTheme } from '../public/legacy/assets/shared/js/app-theme.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

/*
 * The emitter, points, composition and shader tools each kept their own theme in
 * their own localStorage key (pb_theme_v2 / pe_theme_v2 / sb_theme_v1 / CPB_...),
 * so every tool remembered a different theme. They now share one key, and because
 * the shell and the builder iframes are same-origin, a write raises a `storage`
 * event in the others -- that is the live sync.
 */

test('the shared store agrees with the Vue shell on key and theme list', async () => {
  assert.equal(APP_THEME_KEY, 'coo-particles:app-theme');
  const shellStore = await read('../src/modules/theme/app-theme.js');
  assert.ok(
    shellStore.includes("'coo-particles:app-theme'"),
    'the Vue shell must use the same storage key as the builders'
  );
  assert.equal(ALL_THEMES.length, 10);
});

test('retired and short theme ids normalize instead of blanking the picker', () => {
  assert.equal(normalizeTheme(''), 'dark-1');
  assert.equal(normalizeTheme(null), 'dark-1');
  assert.equal(normalizeTheme('nope'), 'dark-1');
  assert.equal(normalizeTheme('dark'), 'dark-1');
  assert.equal(normalizeTheme('light'), 'light-1');
  for (const legacy of ['light-2', 'light-3', 'light-pink']) {
    assert.equal(normalizeTheme(legacy), 'light-1');
  }
  for (const id of ALL_THEMES) assert.equal(normalizeTheme(id), id);
});

test('no builder keeps a private theme key any more', async () => {
  const files = {
    '../public/legacy/assets/points_builder/js/main.js': 'pb_theme_v2',
    '../public/legacy/assets/emitter_generator/js/settings.js': 'pe_theme_v2',
    '../public/legacy/assets/shader_builder/js/constants.js': 'sb_theme_v1'
  };
  for (const [file, retired] of Object.entries(files)) {
    const source = await read(file);
    assert.ok(
      !source.includes(`"${retired}"`),
      `${file} still declares its private theme key ${retired}`
    );
    assert.match(source, /APP_THEME_KEY/, `${file} should use the shared key`);
  }
});

test('every builder subscribes to remote theme changes', async () => {
  for (const file of [
    '../public/legacy/assets/points_builder/js/main.js',
    '../public/legacy/assets/emitter_generator/js/settings.js',
    '../public/legacy/assets/shader_builder/js/settings.js',
    '../public/legacy/assets/composition_builder/js/main.js'
  ]) {
    const source = await read(file);
    assert.match(source, /watchAppTheme\(/, `${file} must react to a theme change made elsewhere`);
  }
});

test('composition prefers the global store over the theme saved in the project', async () => {
  const source = await read('../public/legacy/assets/composition_builder/js/main.js');
  // Theme is a per-machine preference, not a property of the composition.
  assert.match(source, /localStorage\.getItem\(APP_THEME_KEY\)/);
  assert.match(source, /normalizeWorkbenchTheme\(stored \|\| this\.state\.settings\.theme\)/);
  // A project predating the global store seeds it rather than being ignored.
  assert.match(source, /if \(!stored\) writeAppTheme\(theme\)/);
  // The select publishes to the store, which applyTheme() then reads back.
  assert.match(source, /writeAppTheme\(normalizeWorkbenchTheme\(d\.themeSelect\.value\)\)/);
});

test('the shell picker follows a theme changed inside a builder', async () => {
  const workbench = await read('../src/pages/WorkbenchPage.vue');
  assert.match(workbench, /watchAppTheme\(/);
  // The hook disposes several subscriptions (theme watch, theme applied, glass
  // surface), so assert the disposer is called rather than pinning the arrow's
  // exact shape — the previous single-expression form went stale silently.
  assert.match(workbench, /onBeforeUnmount\(/);
  assert.match(workbench, /disposeThemeWatch\(\);/);
});

test('the flat backdrop does not !important over the glass field', async () => {
  /*
   * workbench-theme.css paints body's backdrop with `!important`, and every
   * legacy builder loads it. Unscoped, it overrode the glass colour field on all
   * four builders while the Vue shell (which does not load the file) looked
   * correct -- which is exactly why the builders read as flat panel stacks.
   */
  const css = await read('../public/legacy/assets/shared/css/workbench-theme.css');
  assert.match(css, /body:not\(\[data-theme\^="glass-"\]\) \{/);
  // The grain overlay is the frosted-looking texture; it must stay off glass too.
  assert.match(css, /body:not\(\[data-theme\^="glass-"\]\)::before \{/);

  // No remaining unscoped `body {` rule may set a background.
  const bare = css.match(/\nbody \{([\s\S]*?)\n\}/);
  assert.ok(bare, 'expected a bare body rule to still exist for typography');
  assert.doesNotMatch(bare[1], /background/, 'the bare body rule must not paint');
});

test('the shader builder prefers the shared store over its settings blob', async () => {
  /*
   * Shader kept a second copy of the theme inside sb_settings_v1 and that copy
   * won on load (`theme: saved?.theme || themeSaved`), so this tool ignored the
   * global choice entirely.
   */
  const source = await read('../public/legacy/assets/shader_builder/js/settings.js');
  assert.match(source, /const theme = themeSaved \|\| saved\?\.theme \|\| DEFAULT_SETTINGS\.theme;/);
  assert.doesNotMatch(source, /theme: saved\?\.theme \|\| themeSaved/);
});

test('the emitter page themes from the shared store, not the project file', async () => {
  const source = await read('../src/pages/GeneratorPage.vue');
  assert.match(source, /:data-theme="appTheme"/);
  assert.doesNotMatch(source, /:data-theme="project\.settings\.theme"/);
  assert.match(source, /const appTheme = ref\(readAppTheme\(\)\)/);
  assert.match(source, /watchAppTheme\(/);
  // The settings modal publishes upward rather than mutating the project.
  assert.match(source, /@update-theme="appTheme = \$event"/);

  const modal = await read('../src/components/GeneratorSettingsModal.vue');
  assert.match(modal, /:value="activeTheme"/);
  assert.doesNotMatch(modal, /v-model="project\.settings\.theme"/);
});
