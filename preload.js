// Preload script: safe bridge between renderer and main process
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
  node: process.versions.node,
  chrome: process.versions.chrome,
  // SQL Server IPC methods with dynamic connection string & table name
  testDbConnection: (connString) => ipcRenderer.invoke('sql:test-connection', connString),
  getInvoices: (params) => ipcRenderer.invoke('sql:get-invoices', params),
  getBranchInfo: (params) => ipcRenderer.invoke('sql:get-branch-info', params),
  // Configuration persistence
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  // Window / Tray controls
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray')
});
