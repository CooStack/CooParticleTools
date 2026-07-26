'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const builtinPresetDirectories = Object.freeze(['cards', 'nodes', 'shared']);
const builtinPresetDirectorySet = new Set(builtinPresetDirectories);
const presetFilePattern = /^(?! )(?!.*[. ]\.json$)[^<>:"/\\|?*\x00-\x1f]{1,80}\.json$/;
const presetDirectoryPattern = /^(?! )(?!.*[. ]$)[^<>:"/\\|?*\x00-\x1f]{1,80}$/;
const reservedPresetNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const maxPresetBytes = 2 * 1024 * 1024;
const maxPresetDescriptionLength = 240;

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function assertPathInside(rootPath, candidatePath, label) {
  if (!isPathInside(rootPath, candidatePath)) throw presetPathError(`${label}超出全局预设存储范围。`);
}

function presetPathError(message) {
  const error = new Error(message);
  error.code = 'INVALID_PRESET_PATH';
  return error;
}

async function lstatOrNull(filePath) {
  try {
    return await fsp.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function verifyManagedDirectory(directoryPath, label, create) {
  let stats = await lstatOrNull(directoryPath);
  if (!stats && create) {
    try {
      await fsp.mkdir(directoryPath);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    stats = await lstatOrNull(directoryPath);
  }
  if (!stats) return null;
  if (stats.isSymbolicLink()) throw presetPathError(`${label}不能是符号链接或目录联接。`);
  if (!stats.isDirectory()) throw presetPathError(`${label}必须是目录。`);
  return fsp.realpath(directoryPath);
}

function normalizePresetDirectory(rawDirectory) {
  const raw = String(rawDirectory || '');
  const directory = raw.trim();
  if (!directory || raw !== directory || !presetDirectoryPattern.test(directory)) {
    throw new Error('预设目录名称无效。');
  }
  if (directory === '.' || directory === '..' || reservedPresetNamePattern.test(directory)) {
    throw new Error('预设目录名称无效。');
  }
  const builtin = builtinPresetDirectories.find((item) => item.toLowerCase() === directory.toLowerCase());
  return builtin || directory;
}

function normalizePresetDescription(rawDescription) {
  const description = String(rawDescription || '').trim();
  if (description.length > maxPresetDescriptionLength) {
    throw new Error(`预设描述不能超过 ${maxPresetDescriptionLength} 个字符。`);
  }
  return description;
}

async function verifyPresetRoot(resolved, create) {
  if (create) await fsp.mkdir(resolved.projectRoot, { recursive: true });
  const projectStats = await lstatOrNull(resolved.projectRoot);
  if (!projectStats) return null;
  const projectRootReal = await fsp.realpath(resolved.projectRoot);
  const realProjectStats = await fsp.stat(projectRootReal);
  if (!realProjectStats.isDirectory()) throw presetPathError('全局预设数据目录无效。');

  const presetsRootReal = await verifyManagedDirectory(resolved.presetsRoot, 'presets 目录', create);
  if (!presetsRootReal) return null;
  assertPathInside(projectRootReal, presetsRootReal, 'presets 目录');
  return { projectRootReal, presetsRootReal };
}

async function verifyPresetDirectories(resolved, create) {
  const root = await verifyPresetRoot(resolved, create);
  if (!root) return null;

  const presetDirectoryReal = await verifyManagedDirectory(resolved.presetDirectory, '预设分类目录', create);
  if (!presetDirectoryReal) return null;
  assertPathInside(root.projectRootReal, presetDirectoryReal, '预设分类目录');
  assertPathInside(root.presetsRootReal, presetDirectoryReal, '预设分类目录');
  return { ...root, presetDirectoryReal };
}

async function verifyPresetFile(filePath, directories, allowMissing = false) {
  const stats = await lstatOrNull(filePath);
  if (!stats) {
    if (allowMissing) return null;
    const error = new Error('预设文件不存在。');
    error.code = 'ENOENT';
    throw error;
  }
  if (stats.isSymbolicLink()) throw presetPathError('预设文件不能是符号链接。');
  if (!stats.isFile()) throw presetPathError('预设文件无效。');
  const fileRealPath = await fsp.realpath(filePath);
  assertPathInside(directories.projectRootReal, fileRealPath, '预设文件');
  assertPathInside(directories.presetDirectoryReal, fileRealPath, '预设文件');
  return { stats, fileRealPath };
}

function validatePresetText(rawText, category, fileName = '') {
  const text = String(rawText || '');
  if (!text || Buffer.byteLength(text, 'utf8') > maxPresetBytes) {
    throw new Error('预设文件为空或超过 2 MiB。');
  }
  let preset;
  try {
    preset = JSON.parse(text);
  } catch (error) {
    throw new Error(`预设 JSON 无法解析：${error?.message || error}`);
  }
  if (!preset || Array.isArray(preset) || typeof preset !== 'object') {
    throw new Error('预设根节点必须是对象。');
  }
  if (preset.schemaVersion !== 1 || preset.kind !== 'coo-composition-preset') {
    throw new Error('预设 schemaVersion 或 kind 无效。');
  }
  if (!['card', 'node'].includes(preset.sourceKind)) {
    throw new Error('预设 sourceKind 无效。');
  }
  if (preset.description !== undefined) {
    if (typeof preset.description !== 'string' || preset.description !== normalizePresetDescription(preset.description)) {
      throw new Error('预设描述无效。');
    }
  }
  if (!preset.sections || Array.isArray(preset.sections) || typeof preset.sections !== 'object') {
    throw new Error('预设 sections 无效。');
  }
  const rawPresetName = String(preset.name || '');
  const presetName = rawPresetName.trim();
  if (presetName !== rawPresetName) throw new Error('预设名称无效。');
  if (!presetFilePattern.test(`${presetName}.json`) || reservedPresetNamePattern.test(presetName)) {
    throw new Error('预设名称无效。');
  }
  if (fileName && `${presetName}.json` !== fileName) {
    throw new Error('预设名称与文件名不一致。');
  }
  return text;
}

function isValidPresetFileName(fileName) {
  return presetFilePattern.test(fileName)
    && !reservedPresetNamePattern.test(fileName.replace(/\.json$/i, ''));
}

function createProjectPresetFileStore({
  normalizeFilePath = (value) => {
    const text = String(value || '').trim();
    return text ? path.resolve(text) : '';
  },
  getDataDir = () => '',
} = {}) {
  let mutationTail = Promise.resolve();

  function enqueueMutation(operation) {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.catch(() => {});
    return result;
  }

  function resolveProjectPresetRoot() {
    const projectRoot = normalizeFilePath(getDataDir());
    if (!projectRoot) throw new Error('全局预设目录不可用。');

    return {
      projectRoot,
      presetsRoot: path.join(projectRoot, 'presets'),
    };
  }

  function resolveProjectPresetPath(payload = {}) {
    const { projectRoot, presetsRoot } = resolveProjectPresetRoot(payload);
    const category = normalizePresetDirectory(payload.category);
    const presetDirectory = path.join(presetsRoot, category);
    if (path.dirname(presetDirectory) !== presetsRoot) throw new Error('预设目录路径越界。');
    const rawFileName = String(payload.fileName || '');
    if (!rawFileName.trim()) return { category, projectRoot, presetsRoot, presetDirectory, filePath: '' };
    if (rawFileName !== rawFileName.trim()) throw new Error('预设文件名无效。');
    if (!isValidPresetFileName(rawFileName) || path.basename(rawFileName) !== rawFileName) {
      throw new Error('预设文件名无效。');
    }
    const filePath = path.join(presetDirectory, rawFileName);
    if (path.dirname(filePath) !== presetDirectory) throw new Error('预设文件路径越界。');
    return { category, projectRoot, presetsRoot, presetDirectory, filePath };
  }

  async function listDirectories(payload = {}) {
    const resolved = resolveProjectPresetRoot(payload);
    const root = await verifyPresetRoot(resolved, false);
    if (!root) {
      return {
        ok: true,
        items: builtinPresetDirectories.map((name) => ({ name, builtin: true, count: 0 })),
      };
    }
    const found = new Map(builtinPresetDirectories.map((name) => [name.toLowerCase(), {
      name,
      builtin: true,
      count: 0,
    }]));
    const entries = await fsp.readdir(resolved.presetsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let directory;
      try {
        directory = normalizePresetDirectory(entry.name);
      } catch {
        continue;
      }
      const directoryPath = path.join(resolved.presetsRoot, entry.name);
      const realDirectory = await verifyManagedDirectory(directoryPath, '预设目录', false);
      if (!realDirectory) continue;
      assertPathInside(root.presetsRootReal, realDirectory, '预设目录');
      const children = await fsp.readdir(directoryPath, { withFileTypes: true });
      const count = children.filter((child) => child.isFile() && isValidPresetFileName(child.name)).length;
      found.set(directory.toLowerCase(), {
        name: directory,
        builtin: builtinPresetDirectorySet.has(directory),
        count,
      });
    }
    const items = Array.from(found.values());
    items.sort((left, right) => {
      const leftIndex = builtinPresetDirectories.indexOf(left.name);
      const rightIndex = builtinPresetDirectories.indexOf(right.name);
      if (leftIndex >= 0 || rightIndex >= 0) {
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex - rightIndex;
      }
      return left.name.localeCompare(right.name, 'zh-CN');
    });
    return { ok: true, items };
  }

  async function createDirectoryUnsafe(payload = {}) {
    const resolved = resolveProjectPresetPath({ ...payload, fileName: '' });
    if (builtinPresetDirectorySet.has(resolved.category)) {
      return { ok: false, exists: true, message: '内置预设目录已存在。' };
    }
    await verifyPresetRoot(resolved, true);
    const existing = await lstatOrNull(resolved.presetDirectory);
    if (existing) return { ok: false, exists: true, message: '同名预设目录已存在。' };
    try {
      await fsp.mkdir(resolved.presetDirectory);
    } catch (error) {
      if (error?.code === 'EEXIST') return { ok: false, exists: true, message: '同名预设目录已存在。' };
      throw error;
    }
    await verifyPresetDirectories(resolved, false);
    return { ok: true, name: resolved.category };
  }

  async function removeDirectoryUnsafe(payload = {}) {
    const resolved = resolveProjectPresetPath({ ...payload, fileName: '' });
    if (builtinPresetDirectorySet.has(resolved.category)) {
      throw new Error('内置预设目录不能删除。');
    }
    const directories = await verifyPresetDirectories(resolved, false);
    if (!directories) return { ok: false, notFound: true, message: '预设目录不存在。' };
    const entries = await fsp.readdir(resolved.presetDirectory);
    if (entries.length) {
      const error = new Error('请先移走或删除目录中的预设。');
      error.code = 'PRESET_DIRECTORY_NOT_EMPTY';
      throw error;
    }
    await fsp.rmdir(resolved.presetDirectory);
    return { ok: true, name: resolved.category };
  }

  async function list(payload = {}) {
    const resolved = resolveProjectPresetPath(payload);
    const directories = await verifyPresetDirectories(resolved, false);
    if (!directories) return { ok: true, items: [] };
    const entries = await fsp.readdir(resolved.presetDirectory, { withFileTypes: true });
    const items = [];
    const sourceKind = String(payload.sourceKind || '').trim();
    if (sourceKind && !['card', 'node'].includes(sourceKind)) throw new Error('预设 sourceKind 筛选无效。');
    for (const entry of entries) {
      if (!entry.isFile() || !isValidPresetFileName(entry.name)) continue;
      const filePath = path.join(resolved.presetDirectory, entry.name);
      let verified;
      try {
        verified = await verifyPresetFile(filePath, directories);
      } catch (error) {
        if (error?.code === 'INVALID_PRESET_PATH' || error?.code === 'ENOENT') continue;
        throw error;
      }
      if (verified.stats.size > maxPresetBytes) continue;
      let preset;
      try {
        const result = await read({ ...payload, category: resolved.category, fileName: entry.name });
        preset = JSON.parse(validatePresetText(result.text, resolved.category, entry.name));
      } catch {
        continue;
      }
      if (sourceKind && preset.sourceKind !== sourceKind) continue;
      items.push({
        fileName: entry.name,
        name: preset.name,
        description: normalizePresetDescription(preset.description),
        sourceKind: preset.sourceKind,
        size: verified.stats.size,
        modifiedAt: verified.stats.mtime.toISOString(),
      });
    }
    items.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    return { ok: true, items };
  }

  async function read(payload = {}) {
    const resolved = resolveProjectPresetPath(payload);
    if (!resolved.filePath) throw new Error('未提供预设文件名。');
    const directories = await verifyPresetDirectories(resolved, false);
    if (!directories) return { ok: false, notFound: true, message: '预设文件不存在。' };
    try {
      const verified = await verifyPresetFile(resolved.filePath, directories);
      if (verified.stats.size > maxPresetBytes) throw new Error('预设文件超过 2 MiB。');
      const noFollow = fs.constants.O_NOFOLLOW || 0;
      const handle = await fsp.open(resolved.filePath, fs.constants.O_RDONLY | noFollow);
      try {
        const openedStats = await handle.stat();
        if (!openedStats.isFile() || openedStats.size > maxPresetBytes) throw new Error('预设文件无效或超过 2 MiB。');
        if (openedStats.dev !== verified.stats.dev || openedStats.ino !== verified.stats.ino) {
          throw new Error('预设文件在读取期间发生变化。');
        }
        const buffer = Buffer.allocUnsafe(maxPresetBytes + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        if (offset > maxPresetBytes) throw new Error('预设文件超过 2 MiB。');
        return { ok: true, filePath: resolved.filePath, text: buffer.subarray(0, offset).toString('utf8') };
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return { ok: false, notFound: true, message: '预设文件不存在。' };
      throw error;
    }
  }

  async function writeTempFile(resolved, text) {
    const tempPath = path.join(
      resolved.presetDirectory,
      `.${path.basename(resolved.filePath)}.${process.pid}.${randomUUID()}.tmp`
    );
    const handle = await fsp.open(tempPath, 'wx', 0o600);
    let writeError = null;
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } catch (error) {
      writeError = error;
    } finally {
      try {
        await handle.close();
      } catch (error) {
        writeError ||= error;
      }
    }
    if (writeError) {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw writeError;
    }
    return tempPath;
  }

  async function writeUnsafe(payload = {}) {
    const resolved = resolveProjectPresetPath(payload);
    if (!resolved.filePath) throw new Error('未提供预设文件名。');
    const text = validatePresetText(payload.text, resolved.category, path.basename(resolved.filePath));
    const directories = await verifyPresetDirectories(resolved, true);
    const existing = await verifyPresetFile(resolved.filePath, directories, true);
    if (existing && payload.overwrite !== true) {
      return { ok: false, exists: true, message: '同名预设已存在。' };
    }

    const tempPath = await writeTempFile(resolved, text);
    try {
      const currentDirectories = await verifyPresetDirectories(resolved, false);
      if (!currentDirectories || currentDirectories.presetDirectoryReal !== directories.presetDirectoryReal) {
        throw new Error('预设目录在写入期间发生变化。');
      }
      const current = await verifyPresetFile(resolved.filePath, currentDirectories, true);
      if (payload.overwrite !== true) {
        if (current) return { ok: false, exists: true, message: '同名预设已存在。' };
        try {
          await fsp.link(tempPath, resolved.filePath);
        } catch (error) {
          if (error?.code === 'EEXIST') return { ok: false, exists: true, message: '同名预设已存在。' };
          if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EINVAL'].includes(error?.code)) throw error;
          try {
            await fsp.copyFile(tempPath, resolved.filePath, fs.constants.COPYFILE_EXCL);
          } catch (copyError) {
            if (copyError?.code === 'EEXIST') return { ok: false, exists: true, message: '同名预设已存在。' };
            throw copyError;
          }
          const copiedHandle = await fsp.open(resolved.filePath, 'r');
          try {
            await copiedHandle.sync();
          } finally {
            await copiedHandle.close();
          }
        }
      } else {
        await fsp.rename(tempPath, resolved.filePath);
      }
      return { ok: true, filePath: resolved.filePath, name: path.basename(resolved.filePath) };
    } finally {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
    }
  }

  async function removeUnsafe(payload = {}) {
    const resolved = resolveProjectPresetPath(payload);
    if (!resolved.filePath) throw new Error('未提供预设文件名。');
    const directories = await verifyPresetDirectories(resolved, false);
    if (!directories) return { ok: false, notFound: true, message: '预设文件不存在。' };
    try {
      await verifyPresetFile(resolved.filePath, directories);
      await fsp.unlink(resolved.filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return { ok: false, notFound: true, message: '预设文件不存在。' };
      throw error;
    }
    return { ok: true, filePath: resolved.filePath };
  }

  async function moveUnsafe(payload = {}) {
    const source = resolveProjectPresetPath({
      ...payload,
      category: payload.sourceCategory,
      fileName: payload.sourceFileName,
    });
    const target = resolveProjectPresetPath({
      ...payload,
      category: payload.targetCategory,
      fileName: payload.targetFileName || payload.sourceFileName,
    });
    const sourceResult = await read({
      ...payload,
      category: source.category,
      fileName: path.basename(source.filePath),
    });
    if (!sourceResult.ok) return sourceResult;

    const preset = JSON.parse(sourceResult.text);
    preset.name = path.basename(target.filePath).replace(/\.json$/i, '');
    if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
      preset.description = normalizePresetDescription(payload.description);
    }
    const text = validatePresetText(JSON.stringify(preset, null, 2), target.category, path.basename(target.filePath));
    const sourcePath = path.resolve(source.filePath);
    const targetPath = path.resolve(target.filePath);
    const samePath = sourcePath === targetPath
      || (process.platform === 'win32' && sourcePath.toLowerCase() === targetPath.toLowerCase());
    const writeResult = await writeUnsafe({
      ...payload,
      category: target.category,
      fileName: path.basename(target.filePath),
      text,
      overwrite: samePath,
    });
    if (!writeResult.ok || samePath) return writeResult;

    try {
      const currentSource = await read({
        ...payload,
        category: source.category,
        fileName: path.basename(source.filePath),
      });
      if (!currentSource.ok || currentSource.text !== sourceResult.text) {
        throw new Error('原预设在移动期间发生变化，请重试。');
      }
      const removeResult = await removeUnsafe({
        ...payload,
        category: source.category,
        fileName: path.basename(source.filePath),
      });
      if (!removeResult.ok) throw new Error(removeResult.message || '原预设文件不存在。');
    } catch (error) {
      await removeUnsafe({
        ...payload,
        category: target.category,
        fileName: path.basename(target.filePath),
      }).catch(() => {});
      throw error;
    }
    return {
      ok: true,
      category: target.category,
      name: preset.name,
      filePath: target.filePath,
    };
  }

  const createDirectory = (payload) => enqueueMutation(() => createDirectoryUnsafe(payload));
  const removeDirectory = (payload) => enqueueMutation(() => removeDirectoryUnsafe(payload));
  const write = (payload) => enqueueMutation(() => writeUnsafe(payload));
  const remove = (payload) => enqueueMutation(() => removeUnsafe(payload));
  const move = (payload) => enqueueMutation(() => moveUnsafe(payload));

  return Object.freeze({
    listDirectories,
    createDirectory,
    removeDirectory,
    list,
    read,
    write,
    remove,
    move,
    resolveProjectPresetPath,
  });
}

module.exports = {
  createProjectPresetFileStore,
  presetFilePattern,
  presetDirectoryPattern,
  validatePresetText,
};
