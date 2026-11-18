// Preload script: safe bridge between renderer and main process
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  // SQL Server IPC methods
  testDbConnection: () => ipcRenderer.invoke('sql:test-connection'),
  getInvoices: (limit) => ipcRenderer.invoke('sql:get-invoices', limit),
  // Window / Tray controls
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray')
});
