'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');
const { writeTextFileAtomic } = require('./atomic-text-file');

const AUTO_SAVE_DIRECTORY = 'auto_save';
const DEFAULT_AUTO_SAVE_INTERVALS_MINUTES = Object.freeze([1, 5, 30, 60]);
const DEFAULT_MAX_TIMED_BACKUPS = 32;
const projectSaveQueues = new Map();

function normalizeProjectFilePath(rawPath) {
  const text = String(rawPath || '').trim();
  if (!text) throw new Error('未提供项目文件路径，无法创建自动备份。');
  return path.resolve(text);
}

function getProjectAutoSavePath(rawProjectFilePath) {
  const projectFilePath = normalizeProjectFilePath(rawProjectFilePath);
  const projectDirectory = path.dirname(projectFilePath);
  const inAutoSaveDirectory = path.basename(projectDirectory).toLowerCase() === AUTO_SAVE_DIRECTORY;
  const autoSaveDirectory = inAutoSaveDirectory ? projectDirectory : path.join(projectDirectory, AUTO_SAVE_DIRECTORY);
  const parsed = path.parse(projectFilePath);
  const fileName = inAutoSaveDirectory
    ? `${parsed.name}.autosave-current${parsed.ext || '.json'}`
    : path.basename(projectFilePath);
  return path.join(autoSaveDirectory, fileName);
}

function normalizeAutoSaveIntervals(rawIntervals) {
  const source = Array.isArray(rawIntervals)
    ? rawIntervals
    : DEFAULT_AUTO_SAVE_INTERVALS_MINUTES;
  const values = [];
  const seen = new Set();
  for (const raw of source) {
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) continue;
    const normalized = Math.round(minutes * 1000) / 1000;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values.sort((a, b) => a - b).slice(0, DEFAULT_MAX_TIMED_BACKUPS);
}

function getTimedBackupPath(currentPath, minutes) {
  const parsed = path.parse(currentPath);
  const label = Number.isInteger(minutes) ? String(minutes) : String(minutes).replace(/\.?0+$/, '');
  return path.join(parsed.dir, `${parsed.name}.autosave-${label}m${parsed.ext || '.json'}`);
}

function getProjectRecoveryPath(rawProjectFilePath, now = Date.now()) {
  const projectFilePath = normalizeProjectFilePath(rawProjectFilePath);
  const projectDirectory = path.dirname(projectFilePath);
  if (path.basename(projectDirectory).toLowerCase() !== AUTO_SAVE_DIRECTORY) return projectFilePath;
  const parsed = path.parse(projectFilePath);
  const stem = parsed.name.replace(/\.autosave-(?:current|[0-9]+(?:\.[0-9]+)?)m?$/i, '') || parsed.name;
  const stamp = Math.max(0, Math.trunc(Number(now) || 0));
  return path.join(path.dirname(projectDirectory), `${stem}.recovered-${stamp}${parsed.ext || '.json'}`);
}

function enqueueProjectSave(projectFilePath, operation) {
  const key = path.resolve(projectFilePath);
  const previous = projectSaveQueues.get(key) || Promise.resolve();
  const next = previous.then(operation, operation);
  const settled = next.finally(() => {
    if (projectSaveQueues.get(key) === settled) projectSaveQueues.delete(key);
  });
  projectSaveQueues.set(key, settled);
  return settled;
}

async function writeProjectAutoSave(rawProjectFilePath, text, options = {}) {
  const projectFilePath = normalizeProjectFilePath(rawProjectFilePath);
  const filePath = getProjectAutoSavePath(projectFilePath);
  const intervals = normalizeAutoSaveIntervals(options.intervals ?? options.intervalsMinutes);
  const currentBackupEnabled = options.currentBackupEnabled !== false;
  return enqueueProjectSave(projectFilePath, async () => {
    if (currentBackupEnabled) await writeTextFileAtomic(filePath, text);
    const now = Date.now();
    const timedBackups = [];
    for (const minutes of intervals) {
      const timedPath = getTimedBackupPath(filePath, minutes);
      let due = true;
      try {
        const stat = await fsp.stat(timedPath);
        due = now - stat.mtimeMs >= minutes * 60 * 1000;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (!due) continue;
      await writeTextFileAtomic(timedPath, text);
      timedBackups.push({ filePath: timedPath, name: path.basename(timedPath), minutes });
    }
    return {
      ok: true,
      filePath,
      name: path.basename(filePath),
      currentBackupEnabled,
      timedBackups,
      intervals,
    };
  });
}

module.exports = {
  AUTO_SAVE_DIRECTORY,
  DEFAULT_AUTO_SAVE_INTERVALS_MINUTES,
  normalizeAutoSaveIntervals,
  getProjectAutoSavePath,
  getTimedBackupPath,
  getProjectRecoveryPath,
  writeProjectAutoSave,
};
