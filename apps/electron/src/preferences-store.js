const fsp = require('node:fs/promises');
const path = require('node:path');

function normalizeKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!/^[a-zA-Z0-9_.:-]{1,96}$/.test(key)) {
    throw new Error('偏好设置键无效。');
  }
  return key;
}

function createPreferencesStore(options = {}) {
  const getFilePath = typeof options.filePath === 'function'
    ? options.filePath
    : () => String(options.filePath || '');
  let writeQueue = Promise.resolve();

  function resolveFilePath() {
    const filePath = path.resolve(String(getFilePath() || ''));
    if (!filePath) throw new Error('偏好设置文件路径无效。');
    return filePath;
  }

  async function readDocument() {
    try {
      const parsed = JSON.parse(await fsp.readFile(resolveFilePath(), 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return {};
      throw error;
    }
  }

  async function read(rawKey) {
    const key = normalizeKey(rawKey);
    await writeQueue;
    const document = await readDocument();
    return Object.hasOwn(document, key) ? document[key] : null;
  }

  function write(rawKey, value) {
    const key = normalizeKey(rawKey);
    const serializedValue = JSON.stringify(value);
    if (serializedValue === undefined) throw new Error('偏好设置内容无法序列化。');
    const normalizedValue = JSON.parse(serializedValue);
    const operation = writeQueue.then(async () => {
      const filePath = resolveFilePath();
      const document = await readDocument();
      document[key] = normalizedValue;
      const text = JSON.stringify(document, null, 2);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fsp.writeFile(tempPath, text, { encoding: 'utf8', mode: 0o600 });
        await fsp.rename(tempPath, filePath);
      } finally {
        await fsp.rm(tempPath, { force: true }).catch(() => {});
      }
      return normalizedValue;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return { read, write };
}

module.exports = { createPreferencesStore };
