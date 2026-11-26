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
  getInvoiceItems: (params) => ipcRenderer.invoke('sql:get-invoice-items', params),
  // ZATCA API Integration
  sendZatcaInvoice: (params) => ipcRenderer.invoke('zatca:issue-invoice', params),
  matchBranch: (params) => ipcRenderer.invoke('zatca:match-branch', params),
  updateInvoiceRecord: (params) => ipcRenderer.invoke('sql:update-invoice', params),
  logInvoiceError: (params) => ipcRenderer.invoke('sql:log-invoice-error', params),
  fetchImageData: (url) => ipcRenderer.invoke('app:fetch-image-data', url),
  // Configuration persistence
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  openConfigFolder: () => ipcRenderer.invoke('config:open-folder'),
  // Window / Tray controls
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray')
});
