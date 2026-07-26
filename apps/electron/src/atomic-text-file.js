'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

let temporaryFileSequence = 0;

async function writeTextFileAtomic(filePath, text) {
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const sequence = ++temporaryFileSequence;
  const temporaryPath = path.join(
    directory,
    `.${baseName}.${process.pid}.${Date.now()}.${sequence}.tmp`
  );

  await fsp.mkdir(directory, { recursive: true });
  try {
    await fsp.writeFile(temporaryPath, String(text || ''), { encoding: 'utf8', flag: 'wx' });
    await fsp.rename(temporaryPath, filePath);
  } catch (error) {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { writeTextFileAtomic };
