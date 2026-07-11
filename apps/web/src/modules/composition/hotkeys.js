import { eventToHotkey, hotkeyMatchEvent, hotkeyToHuman, shouldIgnoreHotkeys } from '../pointsbuilder/hotkeys.js';

export const COMPOSITION_HOTKEYS_STORAGE_KEY = 'blogs_composition_hotkeys_v1';

export const DEFAULT_COMPOSITION_HOTKEYS = {
  actions: {
    switchEditor: 'KeyE',
    switchCode: 'KeyC',
    newProject: 'Shift+KeyN',
    addCard: 'Shift+KeyA',
    undo: 'Mod+KeyZ',
    redo: 'Mod+Shift+KeyZ',
    settings: 'KeyH',
    hotkeys: 'Shift+KeyH',
    importProject: 'Mod+KeyO',
    exportProject: 'Mod+Shift+KeyS',
    generateCode: 'Mod+Enter',
    copyCode: 'Mod+Shift+KeyC',
    pausePreview: 'Space',
    replayPreview: 'Shift+KeyR',
    compileExpr: 'Shift+KeyP',
    jumpPreviewEnd: 'Shift+KeyJ',
    resetCamera: 'KeyR',
    fullscreen: 'KeyF'
  }
};

export const COMPOSITION_HOTKEY_DEFS = [
  { id: 'switchEditor', title: '切到编辑页', desc: '显示编辑页' },
  { id: 'switchCode', title: '切到代码页', desc: '显示 Kotlin 页' },
  { id: 'newProject', title: '新建项目', desc: '重置当前 Composition' },
  { id: 'addCard', title: '添加卡片', desc: '新增卡片' },
  { id: 'undo', title: '撤销', desc: '撤销最近修改' },
  { id: 'redo', title: '重做', desc: '恢复已撤销修改' },
  { id: 'settings', title: '设置', desc: '打开设置弹层' },
  { id: 'hotkeys', title: '快捷键', desc: '打开快捷键弹层' },
  { id: 'importProject', title: '导入项目', desc: '导入 JSON' },
  { id: 'exportProject', title: '导出项目', desc: '导出 JSON' },
  { id: 'generateCode', title: '生成代码', desc: '生成 Kotlin' },
  { id: 'copyCode', title: '复制代码', desc: '复制 Kotlin' },
  { id: 'pausePreview', title: '暂停预览', desc: '暂停或恢复预览' },
  { id: 'replayPreview', title: '重播预览', desc: '从头重播' },
  { id: 'compileExpr', title: '编译表达式', desc: '重新编译表达式' },
  { id: 'jumpPreviewEnd', title: '跳到末尾', desc: '跳到预览尾部' },
  { id: 'resetCamera', title: '重置镜头', desc: '重置预览镜头' },
  { id: 'fullscreen', title: '预览全屏', desc: '切换全屏' }
];

export function loadCompositionHotkeys() {
  try {
    const raw = localStorage.getItem(COMPOSITION_HOTKEYS_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_COMPOSITION_HOTKEYS));
    const parsed = JSON.parse(raw);
    return {
      actions: {
        ...DEFAULT_COMPOSITION_HOTKEYS.actions,
        ...(parsed?.actions || {})
      }
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_COMPOSITION_HOTKEYS));
  }
}

export function saveCompositionHotkeys(hotkeys) {
  localStorage.setItem(COMPOSITION_HOTKEYS_STORAGE_KEY, JSON.stringify(hotkeys));
}

export { eventToHotkey, hotkeyMatchEvent, hotkeyToHuman, shouldIgnoreHotkeys };
