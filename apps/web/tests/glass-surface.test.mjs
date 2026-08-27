import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_GLASS_SURFACE,
  GLASS_SURFACE_KEY,
  GLASS_SURFACE_LIMITS,
  normalizeGlassSurface
} from '../public/legacy/assets/shared/js/glass-surface.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const readGlassCss = () => read('../public/legacy/assets/shared/css/glass-theme.css');

const LEGACY_PAGES = [
  'composition_builder.html',
  'composition_pointsbuilder.html',
  'generator.html',
  'pointsbuilder.html',
  'shader_builder.html'
];

const PAGE_ENTRIES = [
  'composition-builder.page.js',
  'composition-pointsbuilder.page.js',
  'generator.page.js',
  'pointsbuilder.page.js',
  'shader-builder.page.js'
];

/**
 * Strips CSS comments, so an assertion cannot be fooled by prose that mentions
 * the very declaration it is documenting as removed.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Slices a declaration block by the selector that opens it. */
function ruleFor(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `missing rule for ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  assert.ok(open !== -1 && close !== -1, `unterminated rule for ${selector}`);
  return css.slice(open, close);
}

test('blur and frost clamp to their limits and survive junk', () => {
  assert.deepEqual(normalizeGlassSurface(null), DEFAULT_GLASS_SURFACE);
  assert.deepEqual(normalizeGlassSurface('not json'), DEFAULT_GLASS_SURFACE);
  assert.deepEqual(normalizeGlassSurface({}), DEFAULT_GLASS_SURFACE);
  assert.deepEqual(normalizeGlassSurface({ blur: 'x', frost: null }), DEFAULT_GLASS_SURFACE);

  // Out of range in both directions, on both axes.
  assert.deepEqual(normalizeGlassSurface({ blur: -40, frost: -1 }), { blur: 0, frost: 0 });
  assert.deepEqual(normalizeGlassSurface({ blur: 9000, frost: 9000 }), {
    blur: GLASS_SURFACE_LIMITS.blur.max,
    frost: GLASS_SURFACE_LIMITS.frost.max
  });

  // A JSON string is accepted, because that is what localStorage hands back.
  assert.deepEqual(normalizeGlassSurface('{"blur":12,"frost":40}'), { blur: 12, frost: 40 });
  // Partial input keeps the other axis on its default rather than going NaN.
  assert.deepEqual(normalizeGlassSurface({ blur: 12 }), {
    blur: 12,
    frost: DEFAULT_GLASS_SURFACE.frost
  });
});

test('the runtime knobs are registered so the pointer light cannot invalidate subtrees', async () => {
  const css = await readGlassCss();

  /*
   * --cp-glass-mx/my are written per hovered surface on every pointermove. If
   * they inherited, each write would invalidate style for that surface's whole
   * subtree — which on a panel holding hundreds of cards is exactly the kind of
   * cost this change set out to remove.
   */
  for (const axis of ['mx', 'my']) {
    const block = ruleFor(css, `@property --cp-glass-${axis}`);
    assert.match(block, /inherits:\s*false/, `--cp-glass-${axis} must not inherit`);
    // The off-screen initial value is how "not hovered" is expressed.
    assert.match(block, /initial-value:\s*-9999px/, `--cp-glass-${axis} needs an off-screen default`);
  }

  // These two are set once on <html>, so they do have to inherit.
  for (const knob of ['blur', 'frost']) {
    const block = ruleFor(css, `@property --cp-glass-${knob}`);
    assert.match(block, /inherits:\s*true/, `--cp-glass-${knob} must inherit`);
  }
});

test('the stylesheet defaults match the module defaults', async () => {
  const css = await readGlassCss();

  /*
   * The stylesheet renders before any script runs, so its @property
   * initial-values are what the first paint uses. If they drifted from the
   * module's defaults, a user who has never touched the sliders would see the
   * glass change the moment the script loaded.
   */
  const blur = ruleFor(css, '@property --cp-glass-blur');
  assert.match(blur, new RegExp(`initial-value:\\s*${DEFAULT_GLASS_SURFACE.blur}px`));

  const frost = ruleFor(css, '@property --cp-glass-frost');
  assert.match(frost, new RegExp(`initial-value:\\s*${DEFAULT_GLASS_SURFACE.frost / 100}`));
});

test('blur and frost actually reach the material', async () => {
  const css = await readGlassCss();

  for (const mode of ['dark', 'light']) {
    const block = ruleFor(css, `[data-theme^="glass-${mode}-"] {`);

    // The knobs have to be wired into the theme's own tokens, not just declared.
    assert.match(block, /--glass-frost:\s*var\(--cp-glass-frost\)/, `glass-${mode} frost not wired`);
    assert.match(block, /--glass-blur-radius:\s*var\(--cp-glass-blur\)/, `glass-${mode} blur not wired`);

    // ...and the blur radius must be what backdrop-filter uses.
    assert.match(
      block,
      /--glass-blur:\s*blur\(var\(--glass-blur-radius\)\)/,
      `glass-${mode} --glass-blur must use the tunable radius`
    );

    // Frost is the readability lever, so every fill tier has to respond to it.
    for (const tier of ['--glass-fill', '--glass-fill-2', '--glass-fill-3', '--glass-sunken']) {
      const declaration = block.match(new RegExp(`${tier}:\\s*([^;]+);`))?.[1] ?? '';
      assert.match(
        declaration,
        /var\(--glass-frost\)/,
        `glass-${mode} ${tier} should scale with frost, got "${declaration}"`
      );
    }
  }
});

test('small repeated controls never get their own backdrop-filter', async () => {
  // Comments stripped: the prose below each rule explains what was removed, and
  // an assertion that reads it would pass no matter what the CSS actually does.
  const bare = stripComments(await readGlassCss());

  /*
   * This is the regression guard for the reported stall. Putting a
   * backdrop-filter on .btn/.tab/.iconbtn gives every one of them its own
   * compositing layer resampling the page behind it, and the composition builder
   * renders roughly 130 of them (48 in markup, 84 generated in main.js). Opening
   * a native <select> then forces that whole stack to re-composite, which is why
   * the theme dropdown took seconds and first painted as a black rectangle.
   */
  const controls = ruleFor(bare, '[data-theme^="glass-"] .btn,');
  assert.doesNotMatch(
    controls,
    /backdrop-filter/,
    'buttons and tabs must not blur their own backdrop — they sit on an already-blurred panel'
  );

  // Cards are just as numerous, for the same reason.
  const cards = ruleFor(bare, '[data-theme^="glass-"] .card,');
  assert.doesNotMatch(cards, /backdrop-filter/, 'cards must not blur their own backdrop');

  // A nested surface stacking blur on an already-blurred parent buys nothing.
  const nested = ruleFor(bare, '[data-theme^="glass-"] .settings-panel,\n[data-theme^="glass-"] .code-panel {');
  assert.match(nested, /backdrop-filter:\s*none/, '.settings-panel sits inside .modal and must opt out');

  // The big surfaces are the ones that should still blur.
  assert.match(bare, /backdrop-filter:\s*var\(--glass-blur\)/);
});

test('the page backdrop is not on the fixed-attachment slow path', async () => {
  const css = await readGlassCss();
  /*
   * <body> is `overflow: hidden` in every builder, so a fixed attachment bought
   * no visual difference at all while forcing Chromium to re-rasterise a
   * viewport-sized background underneath every backdrop-filter above it.
   */
  assert.doesNotMatch(stripComments(css), /background-attachment:\s*fixed/);
});

test('native select popups get a literal, opaque surface', async () => {
  const css = await readGlassCss();
  /*
   * The popup renders in its own compositing context, where a translucent or
   * color-mix() background is unreliable — that is what made the theme dropdown
   * paint as an empty black slab. Both tokens must be plain colours.
   */
  for (const mode of ['dark', 'light']) {
    const block = ruleFor(css, `[data-theme^="glass-${mode}-"] {`);
    const bg = block.match(/--input-option-bg:\s*([^;]+);/)?.[1]?.trim();
    assert.ok(bg, `glass-${mode} needs --input-option-bg`);
    assert.match(bg, /^#[0-9a-fA-F]{6}$/, `glass-${mode} --input-option-bg must be literal, got "${bg}"`);

    const fg = block.match(/--input-option-text:\s*([^;]+);/)?.[1]?.trim();
    assert.match(fg, /^#[0-9a-fA-F]{6}$/, `glass-${mode} --input-option-text must be literal, got "${fg}"`);
  }
});

test('the lens rim is a gradient border, not a flat hairline', async () => {
  const css = await readGlassCss();

  // The refracted edge needs three stops to be asymmetric: a bright catch, a
  // shadowed run, and a weaker bounce on the far corner.
  for (const mode of ['dark', 'light']) {
    const block = ruleFor(css, `[data-theme^="glass-${mode}-"] {`);
    for (const stop of ['--glass-rim-hi', '--glass-rim-lo', '--glass-rim-mid']) {
      assert.match(block, new RegExp(`${stop}:`), `glass-${mode} needs ${stop}`);
    }
  }

  /*
   * The rim is painted with the background-clip trick rather than a
   * pseudo-element: these class names are shared with a large legacy stylesheet
   * full of absolutely-positioned descendants, so introducing ::before/::after
   * and `position: relative` on .panel / .card would risk moving them.
   */
  const panel = ruleFor(css, '[data-theme^="glass-"] .topbar,');
  assert.match(panel, /border:\s*1px solid transparent/, 'the rim needs a transparent border to live in');
  assert.match(panel, /padding-box/, 'fills must clip to the padding box');
  assert.match(panel, /border-box/, 'the rim gradient must clip to the border box');
  assert.doesNotMatch(
    stripComments(css),
    /\.panel::(before|after)\s*[,{]/,
    'the rim must not need a pseudo-element on .panel'
  );
});

test('the pointer rim light is driven from the accent, per surface', async () => {
  const css = await readGlassCss();

  for (const mode of ['dark', 'light']) {
    const block = ruleFor(css, `[data-theme^="glass-${mode}-"] {`);
    for (const token of ['--glass-reveal-face', '--glass-reveal-soft', '--glass-reveal-faint', '--glass-reveal-rim']) {
      const declaration = block.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1] ?? '';
      assert.match(declaration, /var\(--accent\)/, `glass-${mode} ${token} should be the theme accent`);
    }
  }

  /*
   * The light has to land on the rim as well as the face, or it reads as a plain
   * hover tint rather than the 轮廓光 it is meant to be. That pairing lives on the
   * unblurred tiers, where painting a gradient costs nothing extra; the blurred
   * surfaces get a transform-driven layer instead — see the frame-cost test.
   */
  const card = ruleFor(css, '[data-theme^="glass-"] .card,');
  assert.match(card, /var\(--glass-reveal-rim\) 0%/, 'the rim must carry the pointer light');
  assert.match(card, /var\(--glass-reveal-face\) 0%/, 'the face must carry the pointer light');
  assert.match(card, /border-box/);
  assert.match(card, /padding-box/);
});

test('the pointer light falls off softly rather than as a hard disc', async () => {
  /*
   * A two-stop radial ramps at a constant rate, so the eye reads the end stop as
   * an edge — a visible disc tracking the cursor, which is what "光源太硬了"
   * described. Every face gradient must therefore carry the intermediate -soft
   * and -faint stops and die out at 100%, not short of it.
   */
  const bare = stripComments(await readGlassCss());
  /*
   * Anchored on the face token so the match cannot run past the end of one
   * gradient and swallow the rim gradient that follows it. Five tiers carry the
   * light — settings-panel/code-panel, cards, card hover, buttons, button hover —
   * which is every unblurred tier there is.
   */
  const faceGradients = bare.match(
    /radial-gradient\(\d+px circle at var\(--cp-glass-mx\) var\(--cp-glass-my\),\s*var\(--glass-reveal-face\) 0%,[^;]*?transparent 100%\)/g
  ) || [];
  assert.ok(faceGradients.length >= 5, `expected the face light on every unblurred tier, found ${faceGradients.length}`);

  for (const gradient of faceGradients) {
    assert.match(gradient, /var\(--glass-reveal-soft\) \d+%/, `missing the soft stop in: ${gradient.slice(0, 70)}`);
    assert.match(gradient, /var\(--glass-reveal-faint\) \d+%/, `missing the faint stop in: ${gradient.slice(0, 70)}`);
  }

  // The rim light gets the same treatment: a mid stop and a full fade-out.
  const rimGradients = bare.match(
    /radial-gradient\(\d+px circle at var\(--cp-glass-mx\) var\(--cp-glass-my\),\s*var\(--glass-reveal-rim\) 0%,[^;]*?transparent 100%\) border-box/g
  ) || [];
  assert.equal(
    rimGradients.length,
    faceGradients.length,
    'every tier that gets a face glow should also get the rim light that pairs with it'
  );

  // A hard two-stop gradient anywhere is the regression this guards.
  assert.doesNotMatch(
    bare,
    /var\(--glass-reveal-(?:face|rim)\), transparent/,
    'a two-stop gradient is the hard-edged form that was reported'
  );
});

test('no blurred surface has its paint tied to the pointer', async () => {
  /*
   * This is the frame-rate guard.
   *
   * A custom property used in `background` invalidates the element's paint when it
   * changes, and re-painting an element that carries a backdrop-filter forces the
   * filter to be re-evaluated. At the 48px the slider allows, once per
   * pointermove, that measured p95 4.3ms -> 8.5ms on an *idle* page, and was far
   * worse with the three.js preview already using the GPU — the reported
   * "移动时超级掉帧".
   *
   * So no rule that sets a backdrop-filter may reference the pointer position.
   * On those surfaces the light is a transform on its own layer instead, which
   * the compositor moves without repainting anything.
   */
  const sources = [
    ['glass-theme.css', stripComments(await readGlassCss())],
    ['WorkbenchPage.vue', stripComments(await read('../src/pages/WorkbenchPage.vue'))],
    ['PluginsPage.vue', stripComments(await read('../src/pages/PluginsPage.vue'))]
  ];

  let checked = 0;
  for (const [name, source] of sources) {
    // Innermost brace pairs are rule bodies; good enough with no nested at-rules.
    for (const [, body] of source.matchAll(/\{([^{}]*)\}/g)) {
      /*
       * Read the declared values rather than pattern-matching the property name.
       * `/backdrop-filter:\s*(?!none)/` looks right but is not: \s* backtracks to
       * zero width, so the lookahead then compares against " none" and passes.
       */
      const filters = [...body.matchAll(/[-\w]*backdrop-filter:\s*([^;]+)/g)].map((m) => m[1].trim());
      if (!filters.length || filters.every((value) => value === 'none')) continue;
      checked += 1;
      assert.doesNotMatch(
        body,
        /--cp-glass-m[xy]/,
        `${name}: a blurred surface's background follows the pointer, which re-runs its blur every frame`
      );
    }
  }
  assert.ok(checked >= 3, `expected to find blurred rules to check, found ${checked}`);
});

test('the pointer light never lands on a surface that would re-blur', async () => {
  const css = await readGlassCss();

  /*
   * A transformed ::after layer was tried for the blurred surfaces so the light
   * could move on the compositor. It cannot work: --cp-glass-mx/my are registered
   * `inherits: false` — which they must be, or a card would inherit its panel's
   * coordinate and light up in the wrong place — and a pseudo-element does not
   * inherit a non-inheriting property from its originating element, so the layer
   * resolved to the initial off-screen value and never moved.
   *
   * So there must be no pointer-driven pseudo-element pretending to do this.
   */
  assert.doesNotMatch(
    stripComments(css),
    /::after[^{]*\{[^}]*--cp-glass-m[xy]/,
    'a pseudo-element cannot read a non-inheriting property from its host'
  );

  // The unblurred tiers are where the light actually lives.
  const card = ruleFor(css, '[data-theme^="glass-"] .card,');
  assert.match(card, /--cp-glass-mx/, 'cards should still carry the pointer light');
  const nested = ruleFor(css, '[data-theme^="glass-"] .settings-panel,\n[data-theme^="glass-"] .code-panel {');
  assert.match(nested, /--cp-glass-mx/, '.settings-panel should still carry the pointer light');
  assert.match(nested, /backdrop-filter:\s*none/, '...precisely because it does not blur');
});

test('the pointer listener does not force a layout on every frame', async () => {
  /*
   * getBoundingClientRect() after writing a custom property forces a synchronous
   * layout flush. Measuring on every frame of a pointermove therefore makes the
   * whole document's layout the cost of moving the mouse, on top of the paint.
   * The geometry cannot change while the pointer stays over the same elements, so
   * it is cached and only re-read when the surfaces change or a scroll/resize
   * marks it dirty.
   */
  for (const file of [
    '../public/legacy/assets/shared/js/glass-surface.js',
    '../src/modules/theme/glass-surface.js'
  ]) {
    const source = await read(file);
    assert.match(source, /rectsDirty/, `${file} should cache surface geometry`);
    assert.match(source, /const unchanged = !rectsDirty/, `${file} should skip re-measuring unchanged surfaces`);
    assert.match(source, /addEventListener\('scroll', onGeometryChange/, `${file} should invalidate on scroll`);
    assert.match(source, /addEventListener\('resize', onGeometryChange/, `${file} should invalidate on resize`);
    // The rect read must sit behind the cache check, not in the per-frame loop.
    // Comments stripped first: the note explaining the cache names the very call
    // being counted.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const paintBody = code.slice(code.indexOf('const paint ='), code.indexOf('const onMove ='));
    const rectReads = (paintBody.match(/getBoundingClientRect\(\)/g) || []).length;
    assert.equal(rectReads, 1, `${file}: expected exactly one guarded rect read, found ${rectReads}`);
  }
});

test('every tool that can pick a theme can also tune the glass', async () => {
  for (const page of LEGACY_PAGES) {
    const html = await read(`../public/legacy/${page}`);
    assert.match(html, /data-glass-pref="blur"/, `${page} is missing the blur slider`);
    assert.match(html, /data-glass-pref="frost"/, `${page} is missing the frost slider`);
    // The row is hidden under the flat themes, which is what this class keys off.
    assert.match(html, /class="[^"]*glass-pref-row/, `${page} slider rows need .glass-pref-row`);
  }

  const css = await readGlassCss();
  assert.match(
    css,
    /\[data-theme\]:not\(\[data-theme\^="glass-"\]\) \.glass-pref-row/,
    'the sliders tune the glass only, so they must be hidden under the flat themes'
  );
});

test('every legacy page installs the shared glass runtime', async () => {
  for (const entry of PAGE_ENTRIES) {
    const source = await read(`../public/legacy/assets/src/js/pages/${entry}`);
    assert.match(source, /shared\/js\/glass-surface\.js/, `${entry} should import the shared module`);
    assert.match(source, /installGlassSurface\(\)/, `${entry} should install it`);
  }
});

test('the Vue copy of the store agrees with the legacy one', async () => {
  /*
   * Two copies exist for the same reason the theme has two: the legacy builders
   * live under public/ and cannot import from src/. They must agree, or the same
   * slider would clamp differently depending on which tool you opened.
   */
  const vue = await read('../src/modules/theme/glass-surface.js');

  assert.ok(vue.includes(`'${GLASS_SURFACE_KEY}'`), 'the Vue copy must use the same storage key');
  assert.match(
    vue,
    new RegExp(`blur:\\s*${DEFAULT_GLASS_SURFACE.blur},\\s*frost:\\s*${DEFAULT_GLASS_SURFACE.frost}`),
    'the Vue copy must use the same defaults'
  );
  for (const [axis, { min, max }] of Object.entries(GLASS_SURFACE_LIMITS)) {
    assert.match(
      vue,
      new RegExp(`${axis}:\\s*Object\\.freeze\\(\\{\\s*min:\\s*${min},\\s*max:\\s*${max}\\s*\\}\\)`),
      `the Vue copy must use the same ${axis} limits`
    );
  }

  // The shell is the only document with the Electron bridge, so it is what makes
  // a change made inside a builder iframe survive a restart.
  assert.match(vue, /writePreferences/);
  assert.match(vue, /export async function hydrateGlassSurface/);

  const main = await read('../src/main.js');
  assert.match(main, /applyGlassSurface\(\)/, 'the shell must apply the cached values before paint');
  assert.match(main, /hydrateGlassSurface\(\)/, 'the shell must reconcile with the durable copy');
  assert.match(main, /watchGlassSurface\(\)/, 'the shell must carry iframe changes into the durable store');
  assert.match(main, /installGlassReveal\(\)/);
});

const SHELL_PAGES = ['../src/pages/WorkbenchPage.vue', '../src/pages/PluginsPage.vue'];

test('the Vue shell only references glass tokens that exist', async () => {
  /*
   * The shell repeats the material in :global() blocks, so a token renamed in
   * glass-theme.css goes stale here silently: an unresolvable var() makes the
   * whole declaration invalid at computed-value time, and the surface simply
   * loses its rim with no error anywhere. That is exactly what happened when the
   * flat --glass-rim-top/side/bottom trio was replaced by the lens stops.
   */
  const defined = new Set(
    [...(await readGlassCss()).matchAll(/(--glass-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
  );

  for (const file of SHELL_PAGES) {
    const referenced = new Set(
      [...(await read(file)).matchAll(/var\((--glass-[a-z0-9-]+)/g)].map((m) => m[1])
    );
    const missing = [...referenced].filter((token) => !defined.has(token));
    assert.deepEqual(missing, [], `${file} references glass tokens that no longer exist`);
  }
});

test('the primary action keeps its accent fill under glass', async () => {
  /*
   * `body[attr] .workbench-page button` outranks a bare `.primary-action`, so the
   * blanket button rule repainted 新建项目 with --glass-fill-2 while it kept the
   * near-black ink meant for an accent fill — a measured contrast of 1.15, i.e.
   * unreadable. The blanket rule has to exclude it, and the accent has to be
   * restored with a selector that also outranks Vue's scoped styles.
   */
  const workbench = await read('../src/pages/WorkbenchPage.vue');

  assert.match(
    workbench,
    /\.workbench-page button:not\(\.primary-action\)/,
    'the blanket button rule must exclude the primary action'
  );
  assert.match(
    workbench,
    /button\.primary-action\)\s*\{[\s\S]*?var\(--accent\)/,
    'the primary action must be repainted with the accent'
  );
  assert.match(
    workbench,
    /button\.primary-action\)\s*\{[\s\S]*?color:\s*var\(--accent-ink\)/,
    'the primary action must be inked with --accent-ink, which is solved per mode'
  );
  // The old hand-rolled inks are what produced dark-on-dark; they must be gone.
  assert.doesNotMatch(
    workbench,
    /\.primary-action\)\s*\{\s*color:\s*color-mix\(in srgb, var\(--glass-base\)/,
    'the near-black hand-rolled ink must not come back'
  );
});

test('the theme picker is the same control as every other select', async () => {
  const css = await readGlassCss();

  /*
   * The theme picker is the only select in the app with <optgroup>s. An
   * optgroup's background defaults to transparent and the native popup paints
   * transparent as WHITE, so it came out as dark rows interrupted by bright
   * bands while every other dropdown looked uniform — the reported
   * "和项目选择框用的不是同一个东西". Both option and optgroup need the surface.
   */
  const optgroup = ruleFor(css, '[data-theme^="glass-"] select optgroup,');
  assert.match(optgroup, /background-color:\s*var\(--input-option-bg\)/, 'optgroup bands need the popup surface');
  assert.match(optgroup, /color:\s*var\(/, 'optgroup labels need a themed colour');

  // ...and the shell's picker must use the shared select fill, not the button one.
  const workbench = await read('../src/pages/WorkbenchPage.vue');
  assert.match(
    workbench,
    /rail-theme-select\)\s*\{[\s\S]*?var\(--glass-sunken\)/,
    'the rail theme select must use the same sunken fill as every other select'
  );
});

test('the Vue shell does not blur every button either', async () => {
  // Same compositing cost as in the builders — see the .btn guard above.
  for (const file of SHELL_PAGES) {
    const source = stripComments(await read(file));
    for (const [rule, body] of source.matchAll(/:global\([^{]*button[^{]*\)\s*\{([^}]*)\}/g)) {
      assert.doesNotMatch(body, /backdrop-filter/, `${file} blurs a button: ${rule.slice(0, 60)}`);
    }
  }
});

/* ------------------------------------------------- theme picker / theme sync */

test('every tool offers exactly the canonical theme list', async () => {
  /*
   * Reported as "PointsBuilder 的主题选择器似乎没和现在的主题同步".
   *
   * Four of the five pickers had drifted. Three still offered dark-2 / dark-3 /
   * light-2 / light-3, which the shared normalizer collapses to dark-1 /
   * light-1 — so picking 深潮 silently applied 夜岚 — and
   * composition_pointsbuilder.html offered no glass variants at all, so with a
   * glass theme active its <select> matched no option and touching it wrote a
   * flat theme over the user's choice.
   */
  const { THEME_OPTIONS } = await import('../src/modules/theme/options.js');
  const canonical = THEME_OPTIONS.map((theme) => theme.id);

  for (const page of LEGACY_PAGES) {
    const html = await read(`../public/legacy/${page}`);
    const at = html.indexOf('id="themeSelect"');
    assert.notEqual(at, -1, `${page} has no #themeSelect`);
    const block = html.slice(at, html.indexOf('</select>', at));
    const offered = [...block.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(offered, canonical, `${page} offers a stale theme list`);
  }
});

test('no tool keeps its own theme id list', async () => {
  /*
   * points_builder/main.js, shader_builder/constants.js and
   * emitter_generator/settings.js each kept a private THEMES array. They are what
   * let the retired ids survive: the local lists treated dark-2 as valid, so a
   * builder would write it into the shared key and every other tool would read it
   * back as dark-1. One list, in the shared module.
   */
  for (const file of [
    '../public/legacy/assets/points_builder/js/main.js',
    '../public/legacy/assets/shader_builder/js/constants.js',
    '../public/legacy/assets/shader_builder/js/settings.js',
    '../public/legacy/assets/emitter_generator/js/settings.js'
  ]) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /(?:const|let|var)\s+THEMES\s*=/,
      `${file} still defines its own theme list`
    );
    for (const retired of ['dark-2', 'dark-3', 'light-2', 'light-3']) {
      // Comments may name them; declarations may not.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      assert.ok(!code.includes(`"${retired}"`) && !code.includes(`'${retired}'`),
        `${file} still references the retired id ${retired}`);
    }
  }
});

test('the two normalizers agree on every input', async () => {
  /*
   * The shell and the builders each have their own copy (public/ cannot import
   * from src/). If they disagree for any input, the tools disagree about what the
   * current theme is — which is exactly the reported sync failure. 'light' used to
   * be such an input: light-1 in a builder, dark-1 in the shell.
   */
  const [{ normalizeTheme, ALL_THEMES }, { normalizeThemeId, THEME_OPTIONS }] = await Promise.all([
    import('../public/legacy/assets/shared/js/app-theme.js'),
    import('../src/modules/theme/options.js')
  ]);

  assert.deepEqual(
    [...ALL_THEMES],
    THEME_OPTIONS.map((theme) => theme.id),
    'the two copies must list the same themes in the same order'
  );

  const inputs = [
    ...ALL_THEMES,
    'dark', 'light', 'dark-2', 'dark-3', 'light-2', 'light-3', 'light-pink',
    '', '   ', 'nonsense', 'glass-', 'glass-dark-teal', null, undefined
  ];
  for (const input of inputs) {
    assert.equal(
      normalizeTheme(input),
      normalizeThemeId(input),
      `the normalizers disagree on ${JSON.stringify(input)}`
    );
  }
});

test('no tool overrides the global theme with its own saved settings', async () => {
  /*
   * The reported "PointsBuilder 的主题选择器没和现在的主题同步".
   *
   * applySettingsPayload() applied payload.theme unconditionally and wrote it back
   * into the shared key. DEFAULT_SETTINGS_PAYLOAD.theme is "dark-1", so any
   * profile that had saved settings once opened PointsBuilder on dark-1 while
   * every other tool showed the real choice — and the write-back destroyed the
   * choice rather than merely ignoring it. Same shape as the composition bug
   * guarded in app-theme.test.mjs: the theme is a device preference, so a payload
   * value may only be a fallback for a profile that has no global value yet.
   */
  const source = await read('../public/legacy/assets/points_builder/js/main.js');
  const at = source.indexOf('if (payload.theme)');
  assert.notEqual(at, -1, 'the payload theme branch should still exist');
  const branch = source.slice(at, at + 1200);

  assert.match(branch, /getItem\(THEME_KEY\)/, 'it must consult the global key first');
  assert.match(branch, /if \(!storedTheme\)/, 'it may only act when there is no global value');

  // The write-back must sit inside that guard, not before it.
  const guardAt = branch.indexOf('if (!storedTheme)');
  const writeAt = branch.indexOf('localStorage.setItem(THEME_KEY');
  assert.ok(writeAt > guardAt, 'the write-back must be guarded, or it clobbers the global theme');
});

test('hovering a select can never repaint its caret across the whole control', async () => {
  /*
   * The builders draw their dropdown caret from two
   * `linear-gradient(45deg, transparent 50%, var(--input-arrow) 50%)` layers,
   * sized and placed with background-size / background-position, and their :hover
   * and :focus rules re-declare `background-image` ALONE.
   *
   * A `background` SHORTHAND for select in the glass theme resets
   * background-size to `auto`, background-position to `0 0` and
   * background-repeat to `repeat`. Nothing else re-declares those, so the resets
   * survived into :hover — and the caret gradient was painted across the entire
   * control. --input-arrow resolves to --glass-text (near-white), so half the
   * field filled with white and left a dark triangular wedge: the reported
   * "hover it and everything disappears".
   *
   * The glass theme must therefore never use the `background` shorthand on a
   * select; longhands only, leaving the host tool's caret layers untouched.
   */
  const bare = stripComments(await readGlassCss());

  for (const [, body] of bare.matchAll(/\[data-theme\^="glass-"\][^{]*\bselect\b[^{]*\{([^}]*)\}/g)) {
    assert.doesNotMatch(
      body,
      /(^|[;\s])background\s*:/,
      `a select rule uses the background shorthand, which resets the caret's size/position: ${body.trim().slice(0, 90)}`
    );
  }

  // The text-field rule may use the shorthand, but must then exclude selects.
  assert.match(
    bare,
    /\.input:not\(select\)/,
    'the field rule must exclude selects so it cannot reset their caret layers'
  );
});

test('field fills are opaque so nothing shows through the text', async () => {
  /*
   * --glass-sunken is translucent, and at the shipped frost it passes over half of
   * whatever is behind it. With the pointer light painted on the panel underneath,
   * a translucent field let the glow through the value text. Fields use an opaque
   * token instead.
   */
  const css = await readGlassCss();
  for (const mode of ['dark', 'light']) {
    const block = ruleFor(css, `[data-theme^="glass-${mode}-"] {`);
    const value = block.match(/--glass-field-bg:\s*([^;]+);/)?.[1]?.trim();
    assert.ok(value, `glass-${mode} needs --glass-field-bg`);
    assert.match(
      value,
      /^(#[0-9a-fA-F]{6}|rgb\([^)]*\))$/,
      `glass-${mode} --glass-field-bg must be fully opaque, got "${value}"`
    );
  }
});

test('the custom dropdown keeps the native select contract', async () => {
  /*
   * The native popup is drawn by the OS and cannot be themed — an <optgroup>'s
   * transparent background is painted white, which is why the theme picker showed
   * bright bands. The replacement is a progressive enhancement: every tool still
   * drives the theme through `themeSelect.value` plus a 'change' listener, so the
   * original <select> has to stay in the DOM and keep emitting change.
   */
  const source = await read('../public/legacy/assets/shared/js/custom-select.js');

  // A programmatic .value assignment does not fire change; it must be dispatched.
  assert.match(source, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  // The tools also assign .value themselves, so the label has to mirror that back.
  assert.match(source, /select\.addEventListener\('change'/);
  assert.ok(!/select\.remove\(\)|removeChild\(select\)/.test(source), 'the native select must not be removed');

  /*
   * Scroll must REPOSITION, not close. Clicking the trigger focuses it, the
   * browser scrolls the enclosing modal to reveal the focused control, and that
   * scroll lands one frame after the panel opens — closing on scroll made the
   * dropdown open and vanish before it could be seen.
   */
  const scrollHandler = source.slice(source.indexOf("addEventListener('scroll'"));
  assert.match(scrollHandler.slice(0, 400), /openInstance\.place\(\)/, 'scroll must reposition the panel');

  // Fixed positioning is what escapes the panels' `overflow: hidden`.
  const css = await read('../public/legacy/assets/shared/css/custom-select.css');
  assert.match(css, /\.cp-select-panel\s*\{[^}]*position:\s*fixed/);
  // The modal itself is transformed, so a fixed descendant would use the modal
  // as its containing block. Portal the panel to <body> and keep clicks on the
  // portaled panel from being treated as outside clicks.
  assert.match(source, /document\.body\.appendChild\(panel\)/);
  assert.match(source, /openInstance\.root\.contains\(event\.target\)\s*\|\|\s*openInstance\.panel\.contains\(event\.target\)/);

  // Every page that offers a theme must load the stylesheet.
  for (const page of LEGACY_PAGES) {
    const html = await read(`../public/legacy/${page}`);
    assert.match(html, /custom-select\.css/, `${page} does not load custom-select.css`);
  }
});

test('every tool offers exactly the canonical theme list', async () => {
  /*
   * Four of the five pickers had drifted. Three still offered dark-2 / dark-3 /
   * light-2 / light-3 — ids the shared normalizer collapses to dark-1 / light-1,
   * so picking 深潮 silently applied 夜岚 — and composition_pointsbuilder.html
   * offered no glass variants at all, so with a glass theme active its select
   * matched nothing and touching it wrote a flat theme over the user's choice.
   */
  const { ALL_THEMES } = await import('../public/legacy/assets/shared/js/app-theme.js');

  for (const page of LEGACY_PAGES) {
    const html = await read(`../public/legacy/${page}`);
    const at = html.indexOf('id="themeSelect"');
    assert.notEqual(at, -1, `${page} has no #themeSelect`);
    const block = html.slice(at, html.indexOf('</select>', at));
    const values = [...block.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

    assert.deepEqual(values, [...ALL_THEMES], `${page} offers a stale theme list`);
  }

  // And no tool may keep a private list that could drift again.
  for (const file of [
    '../public/legacy/assets/points_builder/js/main.js',
    '../public/legacy/assets/shader_builder/js/constants.js',
    '../public/legacy/assets/emitter_generator/js/settings.js'
  ]) {
    const source = stripComments(await read(file));
    assert.doesNotMatch(source, /['"]dark-2['"]/, `${file} still lists a retired theme id`);
    assert.doesNotMatch(source, /['"]light-3['"]/, `${file} still lists a retired theme id`);
    assert.match(source, /ALL_THEMES/, `${file} should take the list from the shared store`);
  }
});
