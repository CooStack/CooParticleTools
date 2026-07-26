'use strict';

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeTextFileAtomic } = require('../src/atomic-text-file');

test('atomic text writes replace existing content without leaving temporary files', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'coo-atomic-text-'));
  try {
    const filePath = path.join(root, 'project.json');
    await writeTextFileAtomic(filePath, '{"version":1}');
    await writeTextFileAtomic(filePath, '{"version":2}');

    assert.equal(await fsp.readFile(filePath, 'utf8'), '{"version":2}');
    assert.deepEqual(await fsp.readdir(root), ['project.json']);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
