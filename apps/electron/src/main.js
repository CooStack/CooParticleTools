const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createProjectCloseGuard } = require('./project-close-guard');
const { createProjectPresetFileStore } = require('./project-preset-files');
const { createPreferencesStore } = require('./preferences-store');
const { writeTextFileAtomic } = require('./atomic-text-file');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const defaultWebRoot = path.join(repoRoot, 'apps', 'web');
const appName = 'CooParticlesAPI Tools';
const maxRecentProjects = 12;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const projectFilters = [
  { name: 'CooParticles 项目 JSON', extensions: ['json'] },
  { name: '所有文件', extensions: ['*'] },
];

const kotlinFilters = [
  { name: 'Kotlin 源文件', extensions: ['kt'] },
  { name: '所有文件', extensions: ['*'] },
];

let mainWindow = null;
let backendProcess = null;
let backendInfo = null;
let backendOutput = '';
let projectCloseRequestId = 0;
const pendingProjectCloseRequests = new Map();
const projectPresetFileStore = createProjectPresetFileStore({
  normalizeFilePath,
  getDataDir: () => backendInfo?.dataDir || app.getPath('userData'),
});
const preferencesStore = createPreferencesStore({
  filePath: () => userDataFile('preferences.json'),
});

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function appendBackendOutput(chunk) {
  backendOutput = `${backendOutput}${chunk}`;
  if (backendOutput.length > 12000) {
    backendOutput = backendOutput.slice(-12000);
  }
}

function getPythonCommand() {
  return process.env.COO_PARTICLES_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
}

function buildBackendArgs(port) {
  const args = [
    '-m',
    'coo_particles_client',
    '--headless',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ];

  const webRoot = process.env.COO_PARTICLES_WEB_ROOT || defaultWebRoot;
  if (webRoot) {
    args.push('--web-root', webRoot);
  }

  const nodeBinary = process.env.COO_PARTICLES_NODE;
  if (nodeBinary) {
    args.push('--node', nodeBinary);
  }

  if (isTruthy(process.env.COO_PARTICLES_REBUILD)) {
    args.push('--rebuild');
  } else {
    args.push('--skip-build');
  }

  return args;
}

function buildBackendEnv() {
  const delimiter = process.platform === 'win32' ? ';' : ':';
  const sourceRoot = path.join(repoRoot, 'src');
  const existingPythonPath = process.env.PYTHONPATH || '';
  return {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: existingPythonPath ? `${sourceRoot}${delimiter}${existingPythonPath}` : sourceRoot,
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 1000 }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('Timed out waiting for backend.'));
    });
    request.on('error', reject);
  });
}

async function waitForBackend(url, child, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Python backend exited early with code ${child.exitCode}.\n${backendOutput}`);
    }

    try {
      await requestJson(`${url}api/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for Python backend.\n${backendOutput}`);
}

async function startBackend() {
  if (backendProcess && backendProcess.exitCode === null && backendInfo) {
    return backendInfo;
  }

  const port = Number(process.env.COO_PARTICLES_PORT || 0) || await getFreePort();
  const url = `http://127.0.0.1:${port}/`;
  const command = getPythonCommand();
  const args = buildBackendArgs(port);

  backendProcess = spawn(command, args, {
    cwd: repoRoot,
    env: buildBackendEnv(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (chunk) => appendBackendOutput(chunk.toString()));
  backendProcess.stderr.on('data', (chunk) => appendBackendOutput(chunk.toString()));
  backendProcess.once('exit', (code, signal) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shell:backend-exit', { code, signal });
    }
  });

  await waitForBackend(url, backendProcess);
  let localStatus = null;
  let localStatusError = null;
  for (let attempt = 0; attempt < 3 && !localStatus; attempt += 1) {
    try {
      localStatus = await requestJson(`${url}api/local/status`);
    } catch (error) {
      localStatusError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!localStatus?.dataDir) {
    throw new Error(`无法读取本地项目数据目录：${localStatusError?.message || '响应缺少 dataDir'}`);
  }
  backendInfo = {
    url,
    port,
    command,
    args,
    repoRoot,
    dataDir: String(localStatus?.dataDir || ''),
    webRoot: process.env.COO_PARTICLES_WEB_ROOT || defaultWebRoot,
  };
  return backendInfo;
}

function killBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(backendProcess.pid), '/T', '/F'], { windowsHide: true });
    return;
  }

  backendProcess.kill('SIGTERM');
}

function userDataFile(name) {
  return path.join(app.getPath('userData'), name);
}

function normalizeFilePath(rawPath) {
  const text = String(rawPath || '').trim();
  return text ? path.resolve(text) : '';
}

function readRecentProjects() {
  try {
    const raw = fs.readFileSync(userDataFile('recent-projects.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) {
      return [];
    }
    return items
      .map((item) => {
        const filePath = normalizeFilePath(typeof item === 'string' ? item : item?.filePath);
        if (!filePath) {
          return null;
        }
        return {
          filePath,
          name: String(item?.name || path.basename(filePath)),
          lastOpenedAt: String(item?.lastOpenedAt || ''),
        };
      })
      .filter(Boolean)
      .slice(0, maxRecentProjects);
  } catch {
    return [];
  }
}

function writeRecentProjects(items) {
  const filePath = userDataFile('recent-projects.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ items }, null, 2), 'utf8');
}

function rememberRecentProject(rawPath) {
  const filePath = normalizeFilePath(rawPath);
  if (!filePath) {
    return;
  }
  const next = [
    {
      filePath,
      name: path.basename(filePath),
      lastOpenedAt: new Date().toISOString(),
    },
    ...readRecentProjects().filter((item) => item.filePath.toLowerCase() !== filePath.toLowerCase()),
  ].slice(0, maxRecentProjects);
  writeRecentProjects(next);
  app.addRecentDocument(filePath);
  if (app.isReady()) {
    installMenu();
  }
}

function clearRecentProjects() {
  writeRecentProjects([]);
  app.clearRecentDocuments();
  installMenu();
}

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

function sendShellCommand(command) {
  const target = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!target || target.isDestroyed()) {
    return;
  }
  target.webContents.send('shell:command', command);
}

function requestProjectCloseAction(targetWindow, action) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return Promise.resolve({ handled: false, dirty: false });
  }
  const requestId = String(++projectCloseRequestId);
  const timeoutMs = action === 'save' ? 300000 : 5000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingProjectCloseRequests.delete(requestId);
      reject(new Error('等待项目页面响应超时。'));
    }, timeoutMs);
    pendingProjectCloseRequests.set(requestId, {
      webContents: targetWindow.webContents,
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
    });
    try {
      targetWindow.webContents.send('shell:project-close-request', { requestId, action });
    } catch (error) {
      clearTimeout(timer);
      pendingProjectCloseRequests.delete(requestId);
      reject(error);
    }
  });
}

function resolveProjectCloseRequest(event, payload = {}) {
  const requestId = String(payload.requestId || '');
  const pending = pendingProjectCloseRequests.get(requestId);
  if (!pending || pending.webContents !== event.sender) return;
  pendingProjectCloseRequests.delete(requestId);
  pending.resolve(payload.result && typeof payload.result === 'object' ? payload.result : {});
}

function clearProjectCloseRequests(webContents) {
  for (const [requestId, pending] of pendingProjectCloseRequests) {
    if (pending.webContents !== webContents) continue;
    pendingProjectCloseRequests.delete(requestId);
    pending.resolve({ ok: false, canceled: true });
  }
}

function projectCloseChoice(targetWindow, state = {}) {
  const projectName = String(state.projectName || '').trim() || '当前项目';
  const detail = state.filePath
    ? `项目文件：${state.filePath}`
    : '项目还没有保存到文件。';
  return dialog.showMessageBox(targetWindow, {
    type: 'warning',
    title: appName,
    message: `是否保存对“${projectName}”的更改？`,
    detail,
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }).then(({ response }) => ['save', 'discard', 'cancel'][response] || 'cancel');
}

function installProjectCloseGuard(targetWindow) {
  let allowClose = false;
  const guard = createProjectCloseGuard({
    inspect: () => requestProjectCloseAction(targetWindow, 'inspect'),
    prompt: (state) => projectCloseChoice(targetWindow, state),
    save: () => requestProjectCloseAction(targetWindow, 'save'),
    close: () => {
      if (targetWindow.isDestroyed()) return;
      allowClose = true;
      targetWindow.close();
    },
    reportError: (message) => {
      if (targetWindow.isDestroyed()) return;
      void dialog.showMessageBox(targetWindow, {
        type: 'error',
        title: '无法退出',
        message: '项目尚未保存，窗口会保持打开。',
        detail: String(message || '未知错误'),
        buttons: ['确定'],
      });
    },
  });

  targetWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    void guard.requestClose();
  });
}

function errorPayload(error) {
  return {
    ok: false,
    message: error?.message || String(error),
  };
}

async function withIpcErrors(task) {
  try {
    return await task();
  } catch (error) {
    return errorPayload(error);
  }
}

async function openProjectFile(event, options = {}) {
  const result = await dialog.showOpenDialog(getSenderWindow(event), {
    title: String(options.title || '打开项目'),
    properties: ['openFile'],
    filters: Array.isArray(options.filters) ? options.filters : projectFilters,
  });
  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true };
  }
  const filePath = result.filePaths[0];
  const text = await fsp.readFile(filePath, 'utf8');
  rememberRecentProject(filePath);
  return {
    ok: true,
    filePath,
    name: path.basename(filePath),
    text,
  };
}

async function readTextFile(rawPath, options = {}) {
  const filePath = normalizeFilePath(rawPath);
  if (!filePath) {
    return { ok: false, message: '未提供文件路径。' };
  }
  const text = await fsp.readFile(filePath, 'utf8');
  if (options.addToRecent !== false) {
    rememberRecentProject(filePath);
  }
  return {
    ok: true,
    filePath,
    name: path.basename(filePath),
    text,
  };
}

async function saveTextFile(event, payload = {}, defaultFilters = projectFilters) {
  let filePath = normalizeFilePath(payload.filePath);
  const forceDialog = Boolean(payload.forceDialog);
  if (!filePath || forceDialog) {
    const result = await dialog.showSaveDialog(getSenderWindow(event), {
      title: String(payload.title || '保存文件'),
      defaultPath: payload.defaultPath ? String(payload.defaultPath) : undefined,
      filters: Array.isArray(payload.filters) ? payload.filters : defaultFilters,
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    filePath = result.filePath;
  }

  await writeTextFileAtomic(filePath, payload.text);
  if (payload.addToRecent !== false) {
    rememberRecentProject(filePath);
  }
  return {
    ok: true,
    filePath,
    name: path.basename(filePath),
  };
}

async function chooseProjectFile(event, options = {}) {
  const result = await dialog.showSaveDialog(getSenderWindow(event), {
    title: String(options.title || '选择项目位置'),
    defaultPath: options.defaultPath ? String(options.defaultPath) : undefined,
    filters: Array.isArray(options.filters) ? options.filters : projectFilters,
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }
  return {
    ok: true,
    filePath: result.filePath,
    name: path.basename(result.filePath),
  };
}

const listProjectPresetFolders = (payload) => projectPresetFileStore.listDirectories(payload);
const createProjectPresetFolder = (payload) => projectPresetFileStore.createDirectory(payload);
const deleteProjectPresetFolder = (payload) => projectPresetFileStore.removeDirectory(payload);
const listProjectPresets = (payload) => projectPresetFileStore.list(payload);
const readProjectPreset = (payload) => projectPresetFileStore.read(payload);
const writeProjectPreset = (payload) => projectPresetFileStore.write(payload);
const moveProjectPreset = (payload) => projectPresetFileStore.move(payload);
const deleteProjectPreset = (payload) => projectPresetFileStore.remove(payload);
const readPreferences = async (key) => ({ ok: true, value: await preferencesStore.read(key) });
const writePreferences = async (key, value) => ({ ok: true, value: await preferencesStore.write(key, value) });

function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function shouldOpenExternally(rawUrl) {
  if (!backendInfo) {
    return false;
  }
  try {
    const target = new URL(rawUrl);
    const backend = new URL(backendInfo.url);
    return target.origin !== backend.origin;
  } catch {
    return false;
  }
}

function installMenu() {
  const recentProjects = readRecentProjects();
  const recentSubmenu = recentProjects.length
    ? [
        ...recentProjects.map((item) => ({
          label: item.name,
          sublabel: item.filePath,
          click: () => sendShellCommand({ type: 'open-recent-project', filePath: item.filePath }),
        })),
        { type: 'separator' },
        { label: '清空最近项目', click: clearRecentProjects },
      ]
    : [{ label: '暂无最近项目', enabled: false }];

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建项目', accelerator: 'CommandOrControl+N', click: () => sendShellCommand({ type: 'new-project' }) },
        { label: '打开项目...', accelerator: 'CommandOrControl+O', click: () => sendShellCommand({ type: 'open-project' }) },
        { label: '最近项目', submenu: recentSubmenu },
        { type: 'separator' },
        { label: '保存', accelerator: 'CommandOrControl+S', click: () => sendShellCommand({ type: 'save-project' }) },
        { label: '另存为...', accelerator: 'CommandOrControl+Shift+S', click: () => sendShellCommand({ type: 'save-as-project' }) },
        { label: '导出 Kotlin...', accelerator: 'CommandOrControl+E', click: () => sendShellCommand({ type: 'export-kotlin' }) },
        { type: 'separator' },
        { label: '项目', click: () => sendShellCommand({ type: 'navigate', routeName: 'workbench' }) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '扩展',
      submenu: [
        { label: '插件', click: () => sendShellCommand({ type: 'navigate', routeName: 'plugins' }) },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function launchUrl(baseUrl) {
  const startPath = '/workbench';
  try {
    return new URL(startPath, baseUrl).toString();
  } catch {
    return new URL('/workbench', baseUrl).toString();
  }
}

async function createWindow() {
  const info = await startBackend();
  installMenu();

  mainWindow = new BrowserWindow({
    title: appName,
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#101418',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  installProjectCloseGuard(mainWindow);
  const windowWebContents = mainWindow.webContents;

  mainWindow.on('closed', () => {
    clearProjectCloseRequests(windowWebContents);
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isSafeExternalUrl(url)) {
      return { action: 'deny' };
    }
    if (shouldOpenExternally(url)) {
      shell.openExternal(url);
    } else {
      void mainWindow.loadURL(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!shouldOpenExternally(url)) {
      return;
    }
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(launchUrl(info.url));
}

ipcMain.handle('shell:getBackendInfo', () => backendInfo);
ipcMain.on('shell:project-close-response', resolveProjectCloseRequest);
ipcMain.handle('shell:openExternal', async (_event, rawUrl) => {
  if (!isSafeExternalUrl(rawUrl)) {
    return { ok: false };
  }
  await shell.openExternal(rawUrl);
  return { ok: true };
});
ipcMain.handle('shell:openProjectFile', (event, options) => withIpcErrors(() => openProjectFile(event, options)));
ipcMain.handle('shell:chooseProjectFile', (event, options) => withIpcErrors(() => chooseProjectFile(event, options)));
ipcMain.handle('shell:readTextFile', (_event, filePath, options) => withIpcErrors(() => readTextFile(filePath, options)));
ipcMain.handle('shell:saveProjectFile', (event, payload = {}) => withIpcErrors(() => saveTextFile(event, {
  ...payload,
  addToRecent: payload.addToRecent !== false,
}, projectFilters)));
ipcMain.handle('shell:saveTextFile', (event, payload) => withIpcErrors(() => saveTextFile(event, payload, kotlinFilters)));
ipcMain.handle('shell:listProjectPresetFolders', (_event, payload) => withIpcErrors(() => listProjectPresetFolders(payload)));
ipcMain.handle('shell:createProjectPresetFolder', (_event, payload) => withIpcErrors(() => createProjectPresetFolder(payload)));
ipcMain.handle('shell:deleteProjectPresetFolder', (_event, payload) => withIpcErrors(() => deleteProjectPresetFolder(payload)));
ipcMain.handle('shell:listProjectPresets', (_event, payload) => withIpcErrors(() => listProjectPresets(payload)));
ipcMain.handle('shell:readProjectPreset', (_event, payload) => withIpcErrors(() => readProjectPreset(payload)));
ipcMain.handle('shell:writeProjectPreset', (_event, payload) => withIpcErrors(() => writeProjectPreset(payload)));
ipcMain.handle('shell:moveProjectPreset', (_event, payload) => withIpcErrors(() => moveProjectPreset(payload)));
ipcMain.handle('shell:deleteProjectPreset', (_event, payload) => withIpcErrors(() => deleteProjectPreset(payload)));
ipcMain.handle('shell:readPreferences', (_event, key) => withIpcErrors(() => readPreferences(key)));
ipcMain.handle('shell:writePreferences', (_event, key, value) => withIpcErrors(() => writePreferences(key, value)));
ipcMain.handle('shell:getRecentProjects', () => ({ ok: true, items: readRecentProjects() }));
ipcMain.handle('shell:revealInFolder', (_event, rawPath) => {
  const filePath = normalizeFilePath(rawPath);
  if (!filePath) {
    return { ok: false };
  }
  shell.showItemInFolder(filePath);
  return { ok: true };
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch((error) => {
    dialog.showErrorBox(appName, error?.stack || error?.message || String(error));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        dialog.showErrorBox(appName, error?.stack || error?.message || String(error));
      });
    }
  });

  app.on('will-quit', killBackend);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
