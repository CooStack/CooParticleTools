const STORAGE_KEY = 'blogs_local_projects_v1';

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `local_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function toMeta(item) {
  return {
    id: item.id,
    tool: item.tool,
    name: item.name,
    description: item.description,
    tags: Array.isArray(item.tags) ? item.tags : [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    storageMode: 'local'
  };
}

export function createLocalProjectRepository() {
  return {
    mode: 'local',
    async list({ tool = '', q = '' } = {}) {
      const keyword = String(q || '').trim().toLowerCase();
      return readAll()
        .filter((item) => !tool || item.tool === tool)
        .filter((item) => {
          if (!keyword) return true;
          return [item.name, item.description, item.tool].some((field) => String(field || '').toLowerCase().includes(keyword));
        })
        .map(toMeta)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    async recent(limit = 8) {
      const items = await this.list();
      return items.slice(0, limit);
    },
    async get(tool, id) {
      return readAll().find((item) => item.tool === tool && item.id === id) || null;
    },
    async save(input = {}) {
      const items = readAll();
      const id = String(input.id || makeId());
      const existing = items.find((item) => item.tool === input.tool && item.id === id);
      const entry = {
        id,
        tool: String(input.tool || '').trim(),
        name: String(input.name || 'Untitled Project').trim(),
        description: String(input.description || '').trim(),
        tags: Array.isArray(input.tags) ? input.tags : [],
        payload: input.payload || {},
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso(),
        storageMode: 'local'
      };
      const nextItems = items.filter((item) => !(item.tool === entry.tool && item.id === entry.id));
      nextItems.push(entry);
      writeAll(nextItems);
      return entry;
    },
    async remove(tool, id) {
      const items = readAll().filter((item) => !(item.tool === tool && item.id === id));
      writeAll(items);
      return { ok: true };
    }
  };
}
