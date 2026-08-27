import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

/*
 * On first launch the page rendered underneath the native title bar, and only
 * corrected itself after a route change. Cause: the title bar resolves its
 * visibility and height asynchronously over IPC, but AppShell read that once at
 * mount (plus a next-tick timeout) and hardcoded 34px. The timeout fired before
 * the IPC handshake resolved, so --app-chrome-h stayed 0 and nothing reserved the
 * space; the later route change re-ran the same code once the value existed.
 */

test('the title bar publishes the height the shell must reserve', async () => {
  const source = await read('../src/components/AppTitleBar.vue');
  assert.match(source, /const reservedHeight = computed\(/);
  // 0 until the handshake resolves, then the real native height.
  assert.match(source, /visible\.value \? barHeight\.value : 0/);
  assert.match(source, /defineExpose\(\{\s*visible,\s*reservedHeight\s*\}\)/);
});

test('the shell reserves chrome height reactively, not on a mount-time guess', async () => {
  const source = await read('../src/components/AppShell.vue');

  // Reads the published value rather than assuming a constant.
  assert.match(source, /titleBarRef\.value\?\.reservedHeight/);
  assert.doesNotMatch(
    source,
    /titleBarRef\.value\?\.visible \? 34 : 0/,
    'must not hardcode the title bar height'
  );

  // Watched with immediate, so the value lands as soon as IPC resolves.
  assert.match(source, /watch\(\s*\(\) => titleBarRef\.value\?\.reservedHeight/);
  assert.match(source, /immediate: true/);

  // The setTimeout race is what caused the bug; it must not come back.
  assert.doesNotMatch(
    source,
    /setTimeout\(\s*\(\)\s*=>\s*\{\s*applyChromeHeight\(\)/,
    'chrome height must not be applied from a timeout'
  );
});
