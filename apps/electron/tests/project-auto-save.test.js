'use strict';

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_AUTO_SAVE_INTERVALS_MINUTES,
  getProjectAutoSavePath,
  getProjectRecoveryPath,
  getTimedBackupPath,
  normalizeAutoSaveIntervals,
  writeProjectAutoSave,
} = require('../src/project-auto-save');

test('project auto-save keeps a current slot and independent timed slots', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-auto-save-'));
  try {
    const projectFilePath = path.join(root, 'Demo.json');
    const autoSaveDir = path.join(root, 'auto_save');
    const expectedPath = path.join(autoSaveDir, 'Demo.json');

    const first = await writeProjectAutoSave(projectFilePath, '{"version":1}');
    const second = await writeProjectAutoSave(projectFilePath, '{"version":2}');

    assert.equal(getProjectAutoSavePath(projectFilePath), expectedPath);
    assert.equal(first.filePath, expectedPath);
    assert.equal(second.filePath, expectedPath);
    assert.equal(await fsp.readFile(expectedPath, 'utf8'), '{"version":2}');
    assert.deepEqual(second.intervals, [...DEFAULT_AUTO_SAVE_INTERVALS_MINUTES]);
    assert.deepEqual((await fsp.readdir(autoSaveDir)).sort(), [
      'Demo.autosave-1m.json',
      'Demo.autosave-30m.json',
      'Demo.autosave-5m.json',
      'Demo.autosave-60m.json',
      'Demo.json'
    ]);
    assert.equal(await fsp.readFile(path.join(autoSaveDir, 'Demo.autosave-1m.json'), 'utf8'), '{"version":1}');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('timed slots update only after their interval expires and accept custom settings', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-auto-save-'));
  try {
    const projectFilePath = path.join(root, 'Demo.json');
    const first = await writeProjectAutoSave(projectFilePath, '{"version":1}', { intervals: [30, 1, 1, 0, 10081] });
    const oneMinutePath = getTimedBackupPath(first.filePath, 1);
    await fsp.utimes(oneMinutePath, new Date(Date.now() - 2 * 60 * 1000), new Date(Date.now() - 2 * 60 * 1000));
    const second = await writeProjectAutoSave(projectFilePath, '{"version":2}', { intervals: [30, 1] });

    assert.deepEqual(second.intervals, [1, 30]);
    assert.equal(await fsp.readFile(oneMinutePath, 'utf8'), '{"version":2}');
    assert.equal(await fsp.readFile(getTimedBackupPath(first.filePath, 30), 'utf8'), '{"version":1}');
    assert.deepEqual(normalizeAutoSaveIntervals([]), []);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('auto-save never uses the source file when the source is already in auto_save', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-auto-save-'));
  try {
    const projectFilePath = path.join(root, 'auto_save', 'Demo.json');
    const result = await writeProjectAutoSave(projectFilePath, '{"backup":true}', { intervals: [] });
    assert.equal(result.filePath, path.join(root, 'auto_save', 'Demo.autosave-current.json'));
    assert.equal(await fsp.readFile(projectFilePath, 'utf8').catch(() => null), null);
    assert.equal(await fsp.readFile(result.filePath, 'utf8'), '{"backup":true}');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('current backup can be disabled without disabling timed slots', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-auto-save-'));
  try {
    const projectFilePath = path.join(root, 'Demo.json');
    const result = await writeProjectAutoSave(projectFilePath, '{"version":1}', {
      currentBackupEnabled: false,
      intervals: [1]
    });
    assert.equal(result.currentBackupEnabled, false);
    assert.equal(await fsp.readFile(result.filePath, 'utf8').catch(() => null), null);
    assert.equal(await fsp.readFile(getTimedBackupPath(result.filePath, 1), 'utf8'), '{"version":1}');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('opening an auto-save file gets a separate writable recovery path', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-auto-save-'));
  try {
    const autoSavePath = path.join(root, 'auto_save', 'Demo.autosave-5m.json');
    assert.equal(
      getProjectRecoveryPath(autoSavePath, 123),
      path.join(root, 'Demo.recovered-123.json')
    );
    assert.equal(
      getProjectRecoveryPath(path.join(root, 'auto_save', 'Demo.autosave-current.json'), 123),
      path.join(root, 'Demo.recovered-123.json')
    );
    assert.equal(
      getProjectRecoveryPath(path.join(root, 'Demo.json'), 123),
      path.join(root, 'Demo.json')
    );
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('project auto-save rejects a missing project path', async () => {
  await assert.rejects(() => writeProjectAutoSave('', '{}'), /项目文件路径/);
});
