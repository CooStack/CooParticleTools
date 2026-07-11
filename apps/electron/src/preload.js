const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cooParticlesShell', {
  isElectron: true,
  getBackendInfo: () => ipcRenderer.invoke('shell:getBackendInfo'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openProjectFile: (options) => ipcRenderer.invoke('shell:openProjectFile', options || {}),
  readTextFile: (filePath, options) => ipcRenderer.invoke('shell:readTextFile', filePath, options || {}),
  saveProjectFile: (payload) => ipcRenderer.invoke('shell:saveProjectFile', payload || {}),
  saveTextFile: (payload) => ipcRenderer.invoke('shell:saveTextFile', payload || {}),
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
  onBackendExit: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('shell:backend-exit', listener);
    return () => ipcRenderer.removeListener('shell:backend-exit', listener);
  },
});
