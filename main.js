const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const config = require('./config');
const { testConnection, getInvoices, getBranchInfo, getInvoiceItems } = require('./sqlService');

// Disable GPU disk cache to eliminate "Unable to move the cache: Access is denied" errors
app.commandLine.appendSwitch('disable-gpu-cache');

const isDev = !app.isPackaged;

// In production, ensure single instance lock so background tray instances don't collide
if (!isDev) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    process.exit(0);
  }
}

const devServerUrl = 'http://localhost:5173';
const distIndexPath = path.join(__dirname, 'dist', 'index.html');
const trayIconPath = path.join(__dirname, 'trayIcon.png');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Handle second instance launch
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/**
 * Loads persisted configuration using centralized config module
 */
function loadConfig() {
  return config.getConfig();
}

/**
 * Persists configuration to file using centralized config module
 */
function saveConfig(newConfig) {
  return config.saveConfig(newConfig);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1150,
    height: 780,
    minWidth: 850,
    minHeight: 600,
    icon: trayIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Automatically open Chrome DevTools for inspection in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Intercept window close (X button): hide to system tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  if (isDev) {
    loadDevServerWithRetry(mainWindow, devServerUrl, 30, 200);
  } else {
    if (fs.existsSync(distIndexPath)) {
      mainWindow.loadFile(distIndexPath);
    } else {
      loadDevServerWithRetry(mainWindow, devServerUrl, 10, 200);
    }
  }
}

/**
 * Creates and configures the system tray icon and context menu
 */
function createTray() {
  if (tray) return;

  tray = new Tray(trayIconPath);
  tray.setToolTip('ZATCA Invoice Processor (Running in Background)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Check SQL Connection',
      click: async () => {
        const config = loadConfig();
        const res = await testConnection(config.connectionString);
        if (tray && tray.displayBalloon) {
          tray.displayBalloon({
            title: 'SQL Server Status',
            content: res.success ? `Connected to ${res.database || 'Database'}` : `Error: ${res.error}`
          });
        }
      }
    },
    {
      label: 'Toggle Developer Tools (Console)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.toggleDevTools();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Application',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * Retries connecting to Vite dev server until it's ready, then loads the URL
 */
function loadDevServerWithRetry(win, url, maxRetries = 30, interval = 200) {
  let retries = 0;

  const tryConnect = () => {
    const req = http.get(url, (res) => {
      win.loadURL(url);
    });

    req.on('error', () => {
      retries++;
      if (retries < maxRetries) {
        setTimeout(tryConnect, interval);
      } else {
        if (fs.existsSync(distIndexPath)) {
          win.loadFile(distIndexPath);
        } else {
          win.loadURL(url);
        }
      }
    });
  };

  tryConnect();
}

// Watch main process files to auto-reload in development
if (isDev) {
  const watchFiles = ['main.js', 'preload.js', 'sqlService.js', 'config.js'];
  let reloadTimeout = null;

  watchFiles.forEach((file) => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      fs.watch(fullPath, (eventType) => {
        if (eventType === 'change') {
          clearTimeout(reloadTimeout);
          reloadTimeout = setTimeout(() => {
            console.log(`[Watch] Detected change in ${file}. Restarting application...`);
            if (file === 'preload.js') {
              if (mainWindow) mainWindow.reload();
            } else {
              app.relaunch();
              app.exit(0);
            }
          }, 300);
        }
      });
    }
  });
}

// Window / Tray IPC Controls
ipcMain.on('window:minimize-to-tray', () => {
  if (mainWindow) mainWindow.hide();
});

// Config Persistence IPC Handlers
ipcMain.handle('config:get', async () => {
  return loadConfig();
});

ipcMain.handle('config:save', async (event, newConfig) => {
  return saveConfig(newConfig);
});

ipcMain.handle('config:open-folder', async () => {
  try {
    const curConfig = config.getConfig();
    if (curConfig.configFilePath) {
      shell.showItemInFolder(curConfig.configFilePath);
      return { success: true };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// SQL Server IPC Handlers with dynamic parameters
ipcMain.handle('sql:test-connection', async (event, connectionString) => {
  return await testConnection(connectionString);
});

ipcMain.handle('sql:get-invoices', async (event, params) => {
  return await getInvoices(params);
});

/**
 * Sends prepared invoice payload to ZATCA issue-invoice API
 * @param {object} payload
 * @param {string} [endpointUrl]
 */
async function sendZatcaInvoice(payload, endpointUrl) {
  const endpoint = config.getZatcaEndpoint(endpointUrl);
  console.log('[ZATCA] Sending invoice to:', endpoint);
  console.log('[ZATCA] Payload:', JSON.stringify(payload, null, 2));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }

    if (!response.ok && !data.success) {
      return {
        success: false,
        status: response.status,
        error: data.message || `HTTP ${response.status}: ${response.statusText}`,
        data
      };
    }

    return {
      success: data.success !== undefined ? data.success : true,
      status: response.status,
      data
    };
  } catch (err) {
    console.error('[ZATCA] Request failed:', err);
    return {
      success: false,
      error: err.name === 'AbortError'
        ? 'Request timed out connecting to ZATCA server (20s).'
        : `Network Error: ${err.message}`
    };
  }
}

ipcMain.handle('sql:get-branch-info', async (event, params) => {
  return await getBranchInfo(params);
});

ipcMain.handle('sql:get-invoice-items', async (event, params) => {
  return await getInvoiceItems(params);
});

ipcMain.handle('zatca:issue-invoice', async (event, { payload, endpoint }) => {
  return await sendZatcaInvoice(payload, endpoint);
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep alive in system tray
});

app.on('before-quit', () => {
  isQuitting = true;
});
