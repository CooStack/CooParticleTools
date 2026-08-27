'use strict';

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  getProjectAutoSavePath,
  writeProjectAutoSave,
} = require('../src/project-auto-save');

test('project auto-save writes the latest backup beside the project', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-auto-save-'));
  try {
    const projectFilePath = path.join(root, 'Demo.json');
    const expectedPath = path.join(root, 'auto_save', 'Demo.json');

    const first = await writeProjectAutoSave(projectFilePath, '{"version":1}');
    const second = await writeProjectAutoSave(projectFilePath, '{"version":2}');

    assert.equal(getProjectAutoSavePath(projectFilePath), expectedPath);
    assert.equal(first.filePath, expectedPath);
    assert.equal(second.filePath, expectedPath);
    assert.equal(await fsp.readFile(expectedPath, 'utf8'), '{"version":2}');
    assert.deepEqual(await fsp.readdir(path.join(root, 'auto_save')), ['Demo.json']);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('project auto-save rejects a missing project path', async () => {
  await assert.rejects(() => writeProjectAutoSave('', '{}'), /项目文件路径/);
});
