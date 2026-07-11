export const PROJECT_NAME_KEY = 'pb_project_name_v1';
export const KOTLIN_END_KEY = 'pb_kotlin_end_v1';
export const HOTKEYS_STORAGE_KEY = 'pb_hotkeys_v2';

export function sanitizeFileBase(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return raw.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60).trim();
}

export function loadProjectName() {
  try {
    return sanitizeFileBase(localStorage.getItem(PROJECT_NAME_KEY) || '');
  } catch {
    return '';
  }
}

export function saveProjectName(name) {
  try {
    localStorage.setItem(PROJECT_NAME_KEY, name || '');
  } catch {
  }
}

export function loadKotlinEndMode() {
  try {
    const raw = localStorage.getItem(KOTLIN_END_KEY) || '';
    if (raw === 'list' || raw === 'clone' || raw === 'builder') return raw;
  } catch {
  }
  return 'builder';
}

export function saveKotlinEndMode(mode) {
  try {
    localStorage.setItem(KOTLIN_END_KEY, mode || 'builder');
  } catch {
  }
}

export function exportJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseJsonFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('未选择文件'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || '{}')));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}
