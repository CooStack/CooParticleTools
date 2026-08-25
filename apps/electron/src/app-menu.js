'use strict';

/*
 * Single source of truth for the application menu.
 *
 * The same model drives two consumers:
 *   1. the native Electron Menu, which exists purely so keyboard accelerators
 *      keep working (its menu *bar* is hidden — see createWindow)
 *   2. the in-page title bar in the renderer, which draws the themed menu
 *
 * Keeping one model means the two can never drift. Every actionable entry has an
 * `id`; main.js maps ids to behaviour in runMenuCommand().
 */

const SEPARATOR = Object.freeze({ type: 'separator' });

const RECENT_PREFIX = 'open-recent:';

function recentSubmenu(recentProjects) {
  if (!Array.isArray(recentProjects) || !recentProjects.length) {
    return [{ id: 'recent-empty', label: '暂无最近项目', enabled: false }];
  }
  return [
    ...recentProjects.map((item) => ({
      id: `${RECENT_PREFIX}${item.filePath}`,
      label: String(item.name || item.filePath || ''),
      sublabel: String(item.filePath || ''),
    })),
    SEPARATOR,
    { id: 'clear-recent-projects', label: '清空最近项目' },
  ];
}

function buildMenuModel({ recentProjects = [] } = {}) {
  return [
    {
      id: 'file',
      label: '文件',
      items: [
        { id: 'new-project', label: '新建项目', accelerator: 'CommandOrControl+N' },
        { id: 'open-project', label: '打开项目...', accelerator: 'CommandOrControl+O' },
        { id: 'recent-projects', label: '最近项目', items: recentSubmenu(recentProjects) },
        SEPARATOR,
        { id: 'save-project', label: '保存', accelerator: 'CommandOrControl+S' },
        { id: 'save-as-project', label: '另存为...', accelerator: 'CommandOrControl+Shift+S' },
        { id: 'export-kotlin', label: '导出 Kotlin...', accelerator: 'CommandOrControl+E' },
        SEPARATOR,
        { id: 'goto-workbench', label: '项目' },
        SEPARATOR,
        { id: 'quit', label: '退出', role: 'quit' },
      ],
    },
    {
      id: 'extensions',
      label: '扩展',
      items: [
        { id: 'goto-plugins', label: '插件' },
      ],
    },
    {
      id: 'view',
      label: '视图',
      items: [
        { id: 'reload', label: '重新加载', role: 'reload' },
        { id: 'toggle-devtools', label: '切换开发者工具', role: 'toggleDevTools' },
        SEPARATOR,
        { id: 'zoom-reset', label: '重置缩放', role: 'resetZoom' },
        { id: 'zoom-in', label: '放大', role: 'zoomIn' },
        { id: 'zoom-out', label: '缩小', role: 'zoomOut' },
        SEPARATOR,
        { id: 'toggle-fullscreen', label: '切换全屏', role: 'togglefullscreen' },
      ],
    },
  ];
}

/** Every actionable id in the model, depth-first. Used by main.js and by tests. */
function collectMenuIds(model) {
  const ids = [];
  const walk = (items) => {
    for (const item of items || []) {
      if (!item || item.type === 'separator') continue;
      if (Array.isArray(item.items)) {
        walk(item.items);
        continue;
      }
      if (item.id && item.enabled !== false) ids.push(item.id);
    }
  };
  walk(model);
  return ids;
}

function isRecentProjectId(id) {
  return String(id || '').startsWith(RECENT_PREFIX);
}

function recentProjectPath(id) {
  const text = String(id || '');
  return isRecentProjectId(text) ? text.slice(RECENT_PREFIX.length) : '';
}

module.exports = {
  RECENT_PREFIX,
  buildMenuModel,
  collectMenuIds,
  isRecentProjectId,
  recentProjectPath,
};
