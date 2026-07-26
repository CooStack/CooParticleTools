'use strict';

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProjectPresetFileStore } = require('../src/project-preset-files');

function presetText(name, sourceKind = 'card', marker = '') {
  return JSON.stringify({
    schemaVersion: 1,
    kind: 'coo-composition-preset',
    name,
    sourceKind,
    sections: { marker },
  }, null, 2);
}

async function withTempProject(run) {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-preset-files-'));
  try {
    const dataDir = path.join(tempRoot, 'global-data');
    const projectRoot = path.join(tempRoot, 'project');
    await fsp.mkdir(projectRoot);
    const projectFilePath = path.join(projectRoot, 'effect.composition.json');
    const store = createProjectPresetFileStore({ getDataDir: () => dataDir });
    await run({ tempRoot, dataDir, projectRoot, projectFilePath, store });
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

test('global preset files round-trip, overwrite atomically, and delete', async () => {
  await withTempProject(async ({ dataDir, projectFilePath, store }) => {
    const payload = { projectFilePath, category: 'cards', fileName: '.hidden.json' };
    assert.equal((await store.write({ ...payload, text: presetText('.hidden', 'card', 'first') })).ok, true);
    assert.deepEqual((await store.list(payload)).items.map((item) => item.name), ['.hidden']);
    assert.equal(JSON.parse((await store.read(payload)).text).sections.marker, 'first');

    const exists = await store.write({ ...payload, text: presetText('.hidden', 'card', 'second') });
    assert.equal(exists.exists, true);
    await store.write({ ...payload, text: presetText('.hidden', 'card', 'second'), overwrite: true });
    assert.equal(JSON.parse((await store.read(payload)).text).sections.marker, 'second');

    const entries = await fsp.readdir(path.join(dataDir, 'presets', 'cards'));
    assert.deepEqual(entries, ['.hidden.json']);
    assert.equal((await store.remove(payload)).ok, true);
    assert.equal((await store.read(payload)).notFound, true);
  });
});

test('global preset files reject invalid paths while allowing mixed source types', async () => {
  await withTempProject(async ({ projectFilePath, store }) => {
    await assert.rejects(
      () => store.write({ projectFilePath, category: 'cards', fileName: '../escape.json', text: presetText('escape') }),
      /文件名无效/
    );
    await assert.rejects(
      () => store.write({ projectFilePath, category: 'cards', fileName: 'CON.txt.json', text: presetText('CON.txt') }),
      /文件名无效/
    );
    await assert.rejects(
      () => store.write({ projectFilePath, category: 'cards', fileName: ' upper.json', text: presetText('upper') }),
      /文件名无效/
    );
    await assert.rejects(
      () => store.write({ projectFilePath, category: 'cards', fileName: 'upper.JSON', text: presetText('upper') }),
      /文件名无效/
    );
    await assert.rejects(
      () => store.write({ projectFilePath, category: 'cards', fileName: 'other.json', text: presetText('inside') }),
      /名称与文件名不一致/
    );
    assert.equal((await store.write({
      projectFilePath,
      category: 'cards',
      fileName: 'node.json',
      text: presetText('node', 'node')
    })).ok, true);
    assert.equal(JSON.parse((await store.read({
      projectFilePath,
      category: 'cards',
      fileName: 'node.json'
    })).text).sourceKind, 'node');
    await assert.rejects(
      () => store.write({ projectFilePath, category: 'shared', fileName: 'broken.json', text: '{broken' }),
      /JSON 无法解析/
    );
  });
});

test('different projects share one global preset directory', async () => {
  await withTempProject(async ({ dataDir, store }) => {
    const firstProject = { projectId: 'project-42', projectType: 'composition' };
    const secondProject = { projectFilePath: 'D:\\other\\effect.composition.json' };
    await store.write({
      ...firstProject,
      category: 'nodes',
      fileName: 'node.json',
      text: presetText('node', 'node')
    });
    await store.write({
      ...firstProject,
      category: 'shared',
      fileName: 'shared.json',
      text: presetText('shared', 'card')
    });

    assert.deepEqual((await store.list({ ...secondProject, category: 'nodes' })).items.map((item) => item.name), ['node']);
    assert.deepEqual((await store.list({ ...secondProject, category: 'shared' })).items.map((item) => item.name), ['shared']);
    const expectedRoot = path.join(dataDir, 'presets');
    assert.equal(JSON.parse(await fsp.readFile(path.join(expectedRoot, 'nodes', 'node.json'), 'utf8')).sourceKind, 'node');
    assert.equal(JSON.parse(await fsp.readFile(path.join(expectedRoot, 'shared', 'shared.json'), 'utf8')).sourceKind, 'card');
  });
});

test('custom folders support move, rename, description updates, and empty-only deletion', async () => {
  await withTempProject(async ({ dataDir, store }) => {
    assert.deepEqual(
      (await store.listDirectories()).items.map((item) => item.name),
      ['cards', 'nodes', 'shared']
    );
    assert.equal((await store.createDirectory({ category: '常用' })).ok, true);
    await store.write({
      category: 'cards',
      fileName: 'wind.json',
      text: presetText('wind', 'card', 'moving')
    });

    const moved = await store.move({
      sourceCategory: 'cards',
      sourceFileName: 'wind.json',
      targetCategory: '常用',
      targetFileName: '随机风场.json',
      description: '用于环境风场'
    });
    assert.equal(moved.ok, true);
    assert.equal((await store.read({ category: 'cards', fileName: 'wind.json' })).notFound, true);
    const saved = JSON.parse((await store.read({ category: '常用', fileName: '随机风场.json' })).text);
    assert.equal(saved.name, '随机风场');
    assert.equal(saved.description, '用于环境风场');
    assert.deepEqual(
      (await store.list({ category: '常用', sourceKind: 'card' })).items.map((item) => item.description),
      ['用于环境风场']
    );
    assert.deepEqual((await store.list({ category: '常用', sourceKind: 'node' })).items, []);
    await assert.rejects(() => store.removeDirectory({ category: '常用' }), /移走或删除/);

    await store.move({
      sourceCategory: '常用',
      sourceFileName: '随机风场.json',
      targetCategory: 'shared',
      targetFileName: '随机风场.json'
    });
    assert.equal((await store.removeDirectory({ category: '常用' })).ok, true);
    assert.equal(JSON.parse(await fsp.readFile(
      path.join(dataDir, 'presets', 'shared', '随机风场.json'),
      'utf8'
    )).name, '随机风场');
  });
});

test('global preset mutations serialize description updates before moves', async () => {
  await withTempProject(async ({ store }) => {
    await store.write({
      category: 'cards',
      fileName: 'wind.json',
      text: presetText('wind', 'card', 'moving')
    });

    const updateDescription = store.move({
      sourceCategory: 'cards',
      sourceFileName: 'wind.json',
      targetCategory: 'cards',
      targetFileName: 'wind.json',
      description: '多个窗口共享的最新描述'
    });
    const moveToShared = store.move({
      sourceCategory: 'cards',
      sourceFileName: 'wind.json',
      targetCategory: 'shared',
      targetFileName: 'wind.json'
    });

    assert.equal((await updateDescription).ok, true);
    assert.equal((await moveToShared).ok, true);
    const moved = JSON.parse((await store.read({
      category: 'shared',
      fileName: 'wind.json'
    })).text);
    assert.equal(moved.description, '多个窗口共享的最新描述');
    assert.equal((await store.read({ category: 'cards', fileName: 'wind.json' })).notFound, true);
  });
});

test('project preset files reject a linked presets directory or category directory', async () => {
  await withTempProject(async ({ tempRoot, dataDir, projectFilePath, store }) => {
    const external = path.join(tempRoot, 'external');
    await fsp.mkdir(external);
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.symlink(external, path.join(dataDir, 'presets'), linkType);
    await assert.rejects(() => store.list({ projectFilePath, category: 'cards' }), /链接|目录联接/);
    await fsp.unlink(path.join(dataDir, 'presets'));

    await fsp.mkdir(path.join(dataDir, 'presets'));
    await fsp.symlink(external, path.join(dataDir, 'presets', 'cards'), linkType);
    await assert.rejects(() => store.list({ projectFilePath, category: 'cards' }), /链接|目录联接/);
  });
});

test('project preset files reject linked JSON files', async (t) => {
  await withTempProject(async ({ tempRoot, dataDir, projectFilePath, store }) => {
    const seed = { projectFilePath, category: 'cards', fileName: 'seed.json', text: presetText('seed') };
    await store.write(seed);
    const externalFile = path.join(tempRoot, 'external.json');
    await fsp.writeFile(externalFile, presetText('linked'), 'utf8');
    const linkedFile = path.join(dataDir, 'presets', 'cards', 'linked.json');
    try {
      await fsp.symlink(externalFile, linkedFile, 'file');
    } catch (error) {
      if (error?.code === 'EPERM') {
        t.skip('当前 Windows 配置不允许创建文件符号链接。');
        return;
      }
      throw error;
    }
    await assert.rejects(
      () => store.read({ projectFilePath, category: 'cards', fileName: 'linked.json' }),
      /符号链接/
    );
    await assert.rejects(
      () => store.remove({ projectFilePath, category: 'cards', fileName: 'linked.json' }),
      /符号链接/
    );
  });
});
