'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  RECENT_PREFIX,
  buildMenuModel,
  collectMenuIds,
  isRecentProjectId,
  recentProjectPath,
} = require('../src/app-menu');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');

test('menu model keeps the original three top-level menus', () => {
  const model = buildMenuModel();
  assert.deepEqual(model.map((menu) => menu.label), ['文件', '扩展', '视图']);
  assert.deepEqual(model.map((menu) => menu.id), ['file', 'extensions', 'view']);
});

test('recent projects become their own submenu entries', () => {
  const model = buildMenuModel({
    recentProjects: [
      { name: 'Alpha', filePath: 'C:\\p\\alpha.json' },
      { name: 'Beta', filePath: 'C:\\p\\beta.json' },
    ],
  });
  const recent = model[0].items.find((item) => item.id === 'recent-projects');
  assert.ok(recent, 'recent submenu missing');

  const entries = recent.items.filter((item) => isRecentProjectId(item.id));
  assert.deepEqual(entries.map((item) => item.label), ['Alpha', 'Beta']);
  assert.deepEqual(entries.map((item) => recentProjectPath(item.id)), ['C:\\p\\alpha.json', 'C:\\p\\beta.json']);
  assert.ok(recent.items.some((item) => item.id === 'clear-recent-projects'));
});

test('an empty recent list renders a single disabled placeholder', () => {
  const recent = buildMenuModel().find((menu) => menu.id === 'file')
    .items.find((item) => item.id === 'recent-projects');
  assert.equal(recent.items.length, 1);
  assert.equal(recent.items[0].enabled, false);
  // Disabled entries must not be offered as runnable commands.
  assert.ok(!collectMenuIds(buildMenuModel()).includes('recent-empty'));
});

test('the accelerators that existed before the custom title bar are preserved', () => {
  const model = buildMenuModel();
  const accelerators = new Map();
  const walk = (items) => {
    for (const item of items || []) {
      if (!item || item.type === 'separator') continue;
      if (Array.isArray(item.items)) walk(item.items);
      else if (item.accelerator) accelerators.set(item.id, item.accelerator);
    }
  };
  walk(model);

  assert.equal(accelerators.get('new-project'), 'CommandOrControl+N');
  assert.equal(accelerators.get('open-project'), 'CommandOrControl+O');
  assert.equal(accelerators.get('save-project'), 'CommandOrControl+S');
  assert.equal(accelerators.get('save-as-project'), 'CommandOrControl+Shift+S');
  assert.equal(accelerators.get('export-kotlin'), 'CommandOrControl+E');
  assert.equal(accelerators.get('open-preferences'), 'CommandOrControl+,');
});

test('runMenuCommand handles every actionable id in the model', () => {
  // The in-page menu can only act through runMenuCommand, so an id the switch
  // does not cover would render as a dead menu entry.
  const ids = collectMenuIds(buildMenuModel({
    recentProjects: [{ name: 'Alpha', filePath: 'C:\\p\\alpha.json' }],
  }));
  const runner = mainSource.slice(mainSource.indexOf('function runMenuCommand'));
  const body = runner.slice(0, runner.indexOf('\nfunction toNativeMenuTemplate'));

  for (const id of ids) {
    if (id.startsWith(RECENT_PREFIX)) {
      assert.match(body, /isRecentProjectId\(id\)/, 'recent ids are not routed');
      continue;
    }
    assert.ok(body.includes(`'${id}'`), `runMenuCommand does not handle ${id}`);
  }
});

test('the window is frameless with a themeable overlay and a hidden native menu bar', () => {
  assert.match(mainSource, /titleBarStyle:\s*'hidden'/);
  assert.match(mainSource, /titleBarOverlay:\s*\{/);
  assert.match(mainSource, /setMenuBarVisibility\(false\)/);
  // The native Menu must still be installed, or the accelerators above stop working.
  assert.match(mainSource, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate/);
});

test('a second Electron launch refreshes the running single instance from current sources', () => {
  assert.match(mainSource, /requestSingleInstanceLock\(\{[\s\S]*reloadFromSource: true/);
  assert.match(mainSource, /async function reloadApplicationFromSource/);
  assert.match(mainSource, /webContents\.session\.clearCache\(\)/);
  assert.match(mainSource, /additionalData\?\.reloadFromSource/);
});

test('the shell exposes the title bar bridge to the renderer', () => {
  for (const channel of [
    'shell:getMenuModel',
    'shell:runMenuCommand',
    'shell:getWindowChrome',
    'shell:setTitleBarTheme',
  ]) {
    assert.ok(mainSource.includes(`'${channel}'`), `main.js does not handle ${channel}`);
    assert.ok(preloadSource.includes(`'${channel}'`), `preload.js does not expose ${channel}`);
  }
  assert.match(preloadSource, /onMenuModel:/);
  assert.match(mainSource, /webContents\.send\('shell:menu-model'/);
});

test('title bar overlay colours are validated before reaching Electron', () => {
  assert.match(mainSource, /function normalizeHexColor/);
  assert.match(mainSource, /\^#\[0-9a-f\]\{6\}\$/i);
});
