import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_THEME_ID,
  FLAT_THEME_IDS,
  GLASS_THEME_IDS,
  THEME_OPTIONS,
  groupThemeOptions,
  isGlassTheme,
  normalizeThemeId
} from '../src/modules/theme/options.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('the canonical list is the flat themes followed by every glass variant', () => {
  assert.deepEqual(THEME_OPTIONS.map((item) => item.id), [...FLAT_THEME_IDS, ...GLASS_THEME_IDS]);
  assert.equal(GLASS_THEME_IDS.length, 8);
});

test('unknown and retired ids normalize to a usable theme', () => {
  assert.equal(normalizeThemeId(''), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId(null), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId('nope'), DEFAULT_THEME_ID);
  assert.equal(normalizeThemeId('dark-2'), DEFAULT_THEME_ID);
  for (const legacy of ['light-2', 'light-3', 'light-pink']) {
    assert.equal(normalizeThemeId(legacy), 'light-1');
  }
  for (const id of [...FLAT_THEME_IDS, ...GLASS_THEME_IDS]) {
    assert.equal(normalizeThemeId(id), id);
  }
});

test('glass detection matches the id prefix', () => {
  for (const id of GLASS_THEME_IDS) assert.ok(isGlassTheme(id), id);
  for (const id of FLAT_THEME_IDS) assert.ok(!isGlassTheme(id), id);
});

test('options group into flat plus one group per glass mode', () => {
  const groups = groupThemeOptions();
  assert.deepEqual(groups.map((group) => group.name), ['扁平', '玻璃拟态 · 深色', '玻璃拟态 · 浅色']);
  assert.deepEqual(groups.map((group) => group.items.length), [2, 4, 4]);
});

test('the generator reuses the canonical list rather than its own copy', async () => {
  const source = await read('../src/modules/generator/defaults.js');
  assert.match(source, /from '\.\.\/theme\/options\.js'/);
  assert.match(source, /GENERATOR_THEME_OPTIONS = THEME_OPTIONS/);
});

test('the app shell can pick and persist its own theme', async () => {
  const appTheme = await read('../src/modules/theme/app-theme.js');
  assert.match(appTheme, /localStorage/);
  assert.match(appTheme, /document\.body\.dataset\.theme = theme/);
  assert.match(appTheme, /export function restoreAppTheme/);

  // Applied before mount so the shell does not flash the default first.
  const main = await read('../src/main.js');
  assert.match(main, /applyAppTheme\(\)/);

  const workbench = await read('../src/pages/WorkbenchPage.vue');
  assert.match(workbench, /rail-theme-select/);
  assert.match(workbench, /writeAppTheme/);

  // Leaving a builder must hand the shell its own theme back, not clear it.
  const frame = await read('../src/components/LegacyPageFrame.vue');
  assert.match(frame, /restoreAppTheme\(\)/);
});

test('scoped glass rules keep their descendant selector', async () => {
  /*
   * Vue's scoped-CSS compiler silently drops the descendant half of
   * `:global(a) .b`, turning it into a bare `a { ... }` — which would put
   * backdrop-filter and box-shadow on <body> itself. The whole selector has to
   * live inside :global().
   */
  for (const file of ['../src/pages/WorkbenchPage.vue', '../src/pages/PluginsPage.vue']) {
    const source = await read(file);
    const offenders = source
      .split('\n')
      .map((line) => line.trim())
      // Skip comment lines — the note above deliberately spells out the bad form.
      .filter((line) => !line.startsWith('*') && !line.startsWith('/*') && !line.startsWith('//'))
      .filter((line) => /:global\([^)]*\)\s*[.#\w[]/.test(line));
    assert.deepEqual(offenders, [], `${file} has a :global(ancestor) descendant selector`);
  }
});

test('scene tokens read by builder JS are literal colors, never color-mix()', async () => {
  // The builders read these out of getComputedStyle() and pass them to
  // THREE.Color. The computed value of a custom property keeps color-mix()
  // unevaluated, so a color-mix() here reaches THREE as an unparseable string
  // and silently breaks the 3D preview's grid / point colours.
  const css = await read('../public/legacy/assets/shared/css/glass-theme.css');
  const JS_READ = [
    '--grid-color',
    '--point-color',
    '--point-focus',
    '--point-sync',
    '--point-offset',
    '--wb-preview-scene'
  ];

  for (const token of JS_READ) {
    const pattern = new RegExp(String.raw`${token}\s*:\s*([^;]+);`, 'g');
    const declarations = [...css.matchAll(pattern)].map((match) => match[1].trim());
    assert.ok(declarations.length > 0, `${token} should be declared in the glass theme`);
    for (const value of declarations) {
      assert.doesNotMatch(
        value,
        /color-mix\(/,
        `${token} must be a literal colour for THREE.Color, got "${value}"`
      );
      assert.match(
        value,
        /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/,
        `${token} must be a parseable colour, got "${value}"`
      );
    }
  }
});

test('every glass variant defines its own scene tokens', async () => {
  const css = await read('../public/legacy/assets/shared/css/glass-theme.css');
  // Each hue needs a per-mode override for the hue-dependent scene tokens, and
  // -neutral intentionally inherits the mode block's default.
  for (const hue of ['blue', 'green', 'violet']) {
    for (const mode of ['dark', 'light']) {
      const selector = `[data-theme^="glass-${mode}-"][data-theme$="-${hue}"]`;
      assert.ok(css.includes(selector), `missing scene overrides for glass-${mode}-${hue}`);
    }
  }
  for (const mode of ['dark', 'light']) {
    // Slice the mode block by hand rather than building a RegExp out of CSS
    // selector punctuation.
    const opener = `[data-theme^="glass-${mode}-"] {`;
    const start = css.indexOf(opener);
    assert.notEqual(start, -1, `missing the glass-${mode} mode block`);
    const end = css.indexOf('\n}', start);
    const block = css.slice(start, end);
    assert.match(block, /--wb-preview-scene:\s*#[0-9a-fA-F]{6}/, `glass-${mode}-neutral needs a scene default`);
    assert.match(block, /--grid-color:\s*#[0-9a-fA-F]{6}/, `glass-${mode}-neutral needs a grid default`);
    assert.match(block, /--point-sync:\s*#[0-9a-fA-F]{6}/, `glass-${mode}-neutral needs a point-sync default`);
  }
});

test('the chrome colour parser understands color(srgb ...)', async () => {
  const source = await read('../src/utils/window-chrome.js');
  assert.ok(
    source.includes('color\\(\\s*srgb'),
    "parseCssColor should match Chromium's color(srgb ...) serialization of color-mix()"
  );
});

test('every theme defines a scrim and an accent ink', async () => {
  // Both are mode-dependent: a hardcoded dark scrim goes murky on light themes,
  // and a hardcoded ink fails WCAG AA on one mode or the other. Measured
  // contrast of ink-on-accent is >= 4.5 for all ten themes; these assertions
  // guard the tokens' existence so a new variant cannot silently omit them.
  const glass = await read('../public/legacy/assets/shared/css/glass-theme.css');
  const theme = await read('../src/assets/styles/theme.css');

  for (const mode of ['dark', 'light']) {
    const opener = `[data-theme^="glass-${mode}-"] {`;
    const start = glass.indexOf(opener);
    assert.notEqual(start, -1, `missing the glass-${mode} mode block`);
    const block = glass.slice(start, glass.indexOf('\n}', start));
    assert.match(block, /--accent-ink:\s*#[0-9a-fA-F]{3,8}/, `glass-${mode} needs --accent-ink`);
    assert.match(block, /--scrim:\s*(rgba?\(|#)/, `glass-${mode} needs --scrim`);
  }

  // The flat dark default supplies both; light-1 deliberately inherits the dark
  // ink (its accent is desaturated enough) and only overrides the scrim.
  assert.match(theme, /--accent-ink:\s*#[0-9a-fA-F]{3,8}/);
  assert.match(theme, /--scrim:\s*rgba?\(/);
});

test('live modal scrims and primary-button ink go through the tokens', async () => {
  for (const file of [
    '../src/components/GeneratorSettingsModal.vue',
    '../src/components/GeneratorHotkeysModal.vue',
    '../src/pages/WorkbenchPage.vue'
  ]) {
    const source = await read(file);
    assert.match(source, /var\(--scrim/, `${file} should tint its overlay with --scrim`);
    assert.match(source, /var\(--accent-ink/, `${file} should ink primary buttons with --accent-ink`);
  }
});

test('secondary text meets WCAG AA in every theme family', async () => {
  /*
   * --muted drives all secondary text (nav, hints, section subtitles, the
   * runtime status). It used to be an rgba() with alpha, which composited to
   * 3.89 on dark-1, 2.63 on light-1 and 3.32 on glass-light -- all below AA.
   * Solid values are used so the contrast is predictable; these assertions stop
   * a well-meaning revert to a translucent value.
   */
  const theme = await read('../src/assets/styles/theme.css');
  const glass = await read('../public/legacy/assets/shared/css/glass-theme.css');

  const solid = /^#[0-9a-fA-F]{6}$/;
  const mutedIn = (css, marker) => {
    const start = marker ? css.indexOf(marker) : 0;
    assert.notEqual(start, -1, `missing block ${marker}`);
    const slice = css.slice(start);
    return slice.match(/--(?:glass-)?muted:\s*([^;]+);/)?.[1]?.trim();
  };

  assert.match(mutedIn(theme, ':root {'), solid, 'dark default --muted must be solid');
  assert.match(mutedIn(theme, "body[data-theme='light-1']"), solid, 'light-1 --muted must be solid');
  assert.match(
    mutedIn(glass, '[data-theme^="glass-light-"] {'),
    solid,
    'glass light --muted must be solid'
  );
});

test('the chrome colour resolver is not tied to specific colour syntaxes', async () => {
  /*
   * The composition builder genuinely produces oklab() for a themed background
   * (its active .btn resolves to oklab(0.465 0.049 -0.127 / 0.82)). A regex that
   * only knows rgb()/color(srgb ...) returns null for that, and readChromeColors
   * returning null leaves the native title bar on the previous theme's colours.
   * A 1x1 canvas resolves whatever the engine can parse — verified in Chromium
   * against rgb/rgba/color(srgb)/oklab/oklch/hwb/lab/hex/keyword.
   */
  const source = await read('../src/utils/window-chrome.js');
  assert.match(source, /getContext\('2d'/);
  assert.match(source, /getImageData\(0, 0, 1, 1\)/);
  // Canvas first, regex kept only as a fallback.
  assert.match(source, /function resolveColor/);
  assert.match(source, /canvasResolveColor\(text\) \|\| parseCssColor\(text\)/);
  assert.match(source, /return resolveColor\(raw\);/);
  // An unparseable value must be reported as a failure, not as opaque black.
  assert.match(source, /const SENTINEL = '#010203';/);
  assert.match(source, /ctx\.fillStyle === SENTINEL/);
});

test('the theme is app-global: nothing writes a project-derived theme to the shared key', async () => {
  /*
   * Two reported bugs had one cause: composition's seedBuilderSandbox() wrote
   * `this.state.settings.theme || "dark-1"` into the shared theme key when the
   * embedded PointsBuilder opened. That clobbered the user's choice with the
   * project default, which then persisted -- so the theme also "reset to the
   * first one" on the next launch.
   */
  const main = await read('../public/legacy/assets/composition_builder/js/main.js');

  const seedStart = main.indexOf('seedBuilderSandbox(');
  assert.notEqual(seedStart, -1, 'seedBuilderSandbox should still exist');
  const seedBody = main.slice(seedStart, seedStart + 1400);
  assert.doesNotMatch(
    seedBody,
    /setItem\(\s*(CPB_THEME_KEY|APP_THEME_KEY)/,
    'seeding the builder sandbox must not write the global theme key'
  );

  // The retired alias should be gone rather than lying around to be reused.
  assert.doesNotMatch(main, /CPB_THEME_KEY/, 'CPB_THEME_KEY should be removed');

  // applyTheme must treat the shared store as the source of truth, with the
  // project value only as a migration fallback.
  const applyStart = main.indexOf('applyTheme() {');
  assert.notEqual(applyStart, -1);
  const applyBody = main.slice(applyStart, applyStart + 900);
  assert.match(applyBody, /getItem\(APP_THEME_KEY\)/, 'applyTheme should read the global key');
});

test('every builder shares one theme key and one normalizer', async () => {
  const shared = await read('../public/legacy/assets/shared/js/app-theme.js');
  // The single list the normalizer validates against must cover all ten themes.
  for (const id of [...FLAT_THEME_IDS, ...GLASS_THEME_IDS]) {
    assert.ok(shared.includes(`'${id}'`) || shared.includes(`"${id}"`), `shared list missing ${id}`);
  }

  for (const file of [
    '../public/legacy/assets/points_builder/js/main.js',
    '../public/legacy/assets/emitter_generator/js/settings.js',
    '../public/legacy/assets/shader_builder/js/settings.js',
    '../public/legacy/assets/composition_builder/js/main.js'
  ]) {
    const source = await read(file);
    assert.match(source, /shared\/js\/app-theme\.js/, `${file} should use the shared theme module`);
  }

  // No tool may keep its own private theme key any more.
  for (const [file, retired] of [
    ['../public/legacy/assets/points_builder/js/main.js', 'pb_theme_v2'],
    ['../public/legacy/assets/emitter_generator/js/settings.js', 'pe_theme_v2']
  ]) {
    const source = await read(file);
    assert.doesNotMatch(source, new RegExp(`["'\`]${retired}["'\`]`), `${file} still defines ${retired}`);
  }
});
