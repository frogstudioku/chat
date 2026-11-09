const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('app', {
  refocus: () => ipcRenderer.send('refocus'),
  setBadge: (url, n) => ipcRenderer.send('badge', url, n),
  flash: () => ipcRenderer.send('flash')
});
