const { contextBridge, ipcRenderer } = require('electron');

let projectCloseHandler = null;

ipcRenderer.on('shell:project-close-request', async (_event, payload = {}) => {
  let result;
  try {
    result = projectCloseHandler
      ? await projectCloseHandler(payload)
      : { handled: false, dirty: false };
  } catch (error) {
    result = {
      handled: true,
      dirty: true,
      ok: false,
      message: error?.message || String(error),
    };
  }
  ipcRenderer.send('shell:project-close-response', {
    requestId: String(payload.requestId || ''),
    result: result && typeof result === 'object' ? result : {},
  });
});

contextBridge.exposeInMainWorld('cooParticlesShell', {
  isElectron: true,
  getBackendInfo: () => ipcRenderer.invoke('shell:getBackendInfo'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openProjectFile: (options) => ipcRenderer.invoke('shell:openProjectFile', options || {}),
  chooseProjectFile: (options) => ipcRenderer.invoke('shell:chooseProjectFile', options || {}),
  readTextFile: (filePath, options) => ipcRenderer.invoke('shell:readTextFile', filePath, options || {}),
  saveProjectFile: (payload) => ipcRenderer.invoke('shell:saveProjectFile', payload || {}),
  autoSaveProjectFile: (payload) => ipcRenderer.invoke('shell:autoSaveProjectFile', payload || {}),
  saveTextFile: (payload) => ipcRenderer.invoke('shell:saveTextFile', payload || {}),
  listProjectPresetFolders: (payload) => ipcRenderer.invoke('shell:listProjectPresetFolders', payload || {}),
  createProjectPresetFolder: (payload) => ipcRenderer.invoke('shell:createProjectPresetFolder', payload || {}),
  deleteProjectPresetFolder: (payload) => ipcRenderer.invoke('shell:deleteProjectPresetFolder', payload || {}),
  listProjectPresets: (payload) => ipcRenderer.invoke('shell:listProjectPresets', payload || {}),
  readProjectPreset: (payload) => ipcRenderer.invoke('shell:readProjectPreset', payload || {}),
  writeProjectPreset: (payload) => ipcRenderer.invoke('shell:writeProjectPreset', payload || {}),
  moveProjectPreset: (payload) => ipcRenderer.invoke('shell:moveProjectPreset', payload || {}),
  deleteProjectPreset: (payload) => ipcRenderer.invoke('shell:deleteProjectPreset', payload || {}),
  readPreferences: (key) => ipcRenderer.invoke('shell:readPreferences', key),
  writePreferences: (key, value) => ipcRenderer.invoke('shell:writePreferences', key, value),
  getRecentProjects: () => ipcRenderer.invoke('shell:getRecentProjects'),
  revealInFolder: (filePath) => ipcRenderer.invoke('shell:revealInFolder', filePath),
  onCommand: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:command', listener);
    return () => ipcRenderer.removeListener('shell:command', listener);
  },
  onProjectCloseRequest: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    projectCloseHandler = handler;
    return () => {
      if (projectCloseHandler === handler) projectCloseHandler = null;
    };
  },
  onBackendExit: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:backend-exit', listener);
    return () => ipcRenderer.removeListener('shell:backend-exit', listener);
  },
});
