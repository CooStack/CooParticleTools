'use strict';

const path = require('node:path');
const { writeTextFileAtomic } = require('./atomic-text-file');

const AUTO_SAVE_DIRECTORY = 'auto_save';

function normalizeProjectFilePath(rawPath) {
  const text = String(rawPath || '').trim();
  if (!text) throw new Error('未提供项目文件路径，无法创建自动备份。');
  return path.resolve(text);
}

function getProjectAutoSavePath(rawProjectFilePath) {
  const projectFilePath = normalizeProjectFilePath(rawProjectFilePath);
  const projectDirectory = path.dirname(projectFilePath);
  const autoSaveDirectory = path.basename(projectDirectory).toLowerCase() === AUTO_SAVE_DIRECTORY
    ? projectDirectory
    : path.join(projectDirectory, AUTO_SAVE_DIRECTORY);
  return path.join(autoSaveDirectory, path.basename(projectFilePath));
}

async function writeProjectAutoSave(rawProjectFilePath, text) {
  const filePath = getProjectAutoSavePath(rawProjectFilePath);
  await writeTextFileAtomic(filePath, text);
  return {
    ok: true,
    filePath,
    name: path.basename(filePath),
  };
}

module.exports = {
  AUTO_SAVE_DIRECTORY,
  getProjectAutoSavePath,
  writeProjectAutoSave,
};
