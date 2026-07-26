function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPreferences(adapter, storage) {
  try {
    const raw = storage?.getItem?.(adapter.preferencesStorageKey);
    if (!raw) return null;
    return adapter.preferencesFromDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

function mergePreferences(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!isRecord(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (!isRecord(value)) continue;
      const previous = isRecord(merged[key]) ? merged[key] : {};
      merged[key] = { ...previous, ...value };
      if (isRecord(previous.actions) || isRecord(value.actions)) {
        merged[key].actions = {
          ...(isRecord(previous.actions) ? previous.actions : {}),
          ...(isRecord(value.actions) ? value.actions : {})
        };
      }
    }
  }
  return Object.keys(merged).length ? merged : null;
}

function supportsPreferences(adapter) {
  return Boolean(
    adapter?.preferencesStorageKey
    && typeof adapter.preferencesFromDraft === 'function'
  );
}

export async function hydrateLegacyPreferences(adapter, storage, shell) {
  if (!supportsPreferences(adapter)) return null;
  const current = readPreferences(adapter, storage);
  if (typeof shell?.readPreferences !== 'function') return current;
  const result = await shell.readPreferences(adapter.preferencesStorageKey);
  if (result?.ok === false) throw new Error(result.message || '偏好设置读取失败。');
  const durable = adapter.preferencesFromDraft(result?.value);
  const preferences = mergePreferences(durable, current);
  if (preferences) {
    storage?.setItem?.(adapter.preferencesStorageKey, JSON.stringify(preferences));
  }
  if (
    current
    && typeof shell.writePreferences === 'function'
    && JSON.stringify(preferences) !== JSON.stringify(durable)
  ) {
    const migration = await shell.writePreferences(adapter.preferencesStorageKey, preferences);
    if (migration?.ok === false) throw new Error(migration.message || '偏好设置迁移失败。');
  }
  return preferences;
}

export async function persistLegacyPreferences(adapter, storage, shell) {
  if (!supportsPreferences(adapter) || typeof shell?.writePreferences !== 'function') return null;
  const preferences = readPreferences(adapter, storage);
  if (!preferences) return null;
  const result = await shell.writePreferences(adapter.preferencesStorageKey, preferences);
  if (result?.ok === false) throw new Error(result.message || '偏好设置保存失败。');
  return preferences;
}
