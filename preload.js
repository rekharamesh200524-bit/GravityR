const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  watchDirectory: (path) => ipcRenderer.send('watch-directory', path),
  onWorkspaceChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('workspace-changed', handler);
    // Return unsubscribe callback
    return () => {
      ipcRenderer.removeListener('workspace-changed', handler);
    };
  }
});
