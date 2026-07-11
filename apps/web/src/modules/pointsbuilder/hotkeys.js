import { HOTKEYS_STORAGE_KEY } from './io.js';

export const DEFAULT_HOTKEYS = {
  version: 1,
  actions: {
    openImport: 'Mod+KeyO',
    exportJson: 'Mod+Shift+KeyS',
    exportKotlin: 'Mod+KeyS',
    newProject: 'Shift+KeyN',
    undo: 'Mod+KeyZ',
    redo: 'Mod+Shift+KeyZ',
    toggleFullscreen: 'KeyF',
    resetCamera: 'Shift+KeyR',
    toggleSettings: 'KeyH',
    toggleHotkeys: 'Shift+KeyH',
    saveProject: 'Mod+Enter'
  }
};

function normalizeHotkey(hotkey) {
  if (!hotkey || typeof hotkey !== 'string') return '';
  const parts = hotkey.split('+').map((item) => item.trim()).filter(Boolean);
  const hasMod = parts.includes('Mod');
  const hasShift = parts.includes('Shift');
  const hasAlt = parts.includes('Alt');
  const main = parts.find((item) => item !== 'Mod' && item !== 'Shift' && item !== 'Alt') || '';
  const result = [];
  if (hasMod) result.push('Mod');
  if (hasShift) result.push('Shift');
  if (hasAlt) result.push('Alt');
  if (main) result.push(main);
  return result.join('+');
}

export function eventToHotkey(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('Mod');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');

  const code = event.code || '';
  const isModifier = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code);
  if (code && !isModifier) parts.push(code);
  return normalizeHotkey(parts.join('+'));
}

export function hotkeyToHuman(hotkey) {
  const normalized = normalizeHotkey(hotkey);
  if (!normalized) return '未设置';
  return normalized.split('+').map((part) => {
    if (part === 'Mod') return 'Ctrl/Cmd';
    if (part === 'Shift') return 'Shift';
    if (part === 'Alt') return 'Alt';
    if (part.startsWith('Key')) return part.slice(3).toUpperCase();
    if (part.startsWith('Digit')) return part.slice(5);
    if (part === 'Backspace') return 'Backspace';
    if (part === 'Enter') return 'Enter';
    return part;
  }).join(' + ');
}

export function hotkeyMatchEvent(event, hotkey) {
  const expected = normalizeHotkey(hotkey);
  if (!expected) return false;
  return eventToHotkey(event) === expected;
}

export function loadHotkeys() {
  try {
    const raw = localStorage.getItem(HOTKEYS_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
    const parsed = JSON.parse(raw);
    return {
      version: DEFAULT_HOTKEYS.version,
      actions: {
        ...DEFAULT_HOTKEYS.actions,
        ...(parsed?.actions || {})
      }
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_HOTKEYS));
  }
}

export function saveHotkeys(hotkeys) {
  try {
    localStorage.setItem(HOTKEYS_STORAGE_KEY, JSON.stringify(hotkeys));
  } catch {
  }
}

export function shouldIgnoreHotkeys(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return Boolean(target.isContentEditable);
}

export const HOTKEY_ACTION_DEFS = [
  { id: 'newProject', title: '新建项目', desc: '重置当前项目草稿' },
  { id: 'saveProject', title: '保存到仓库', desc: '调用当前仓库模式保存项目' },
  { id: 'openImport', title: '导入 JSON', desc: '打开本地 JSON 文件' },
  { id: 'exportJson', title: '导出 JSON', desc: '导出当前项目 JSON' },
  { id: 'exportKotlin', title: '导出 Kotlin', desc: '导出当前 Kotlin 代码' },
  { id: 'undo', title: '撤销', desc: '恢复上一状态' },
  { id: 'redo', title: '重做', desc: '重做已撤销操作' },
  { id: 'toggleFullscreen', title: '预览全屏', desc: '切换预览区域全屏' },
  { id: 'resetCamera', title: '重置镜头', desc: '重置 Three.js 相机' },
  { id: 'toggleSettings', title: '设置', desc: '打开或关闭设置面板' },
  { id: 'toggleHotkeys', title: '快捷键', desc: '打开或关闭快捷键面板' }
];
