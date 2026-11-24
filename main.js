const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const config = require('./config');
const { testConnection, getInvoices, getBranchInfo, getInvoiceItems, updateInvoiceRecord } = require('./sqlService');

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

// Handle second instance launch: bring window to focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

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
  } else if (fs.existsSync(distIndexPath)) {
    mainWindow.loadFile(distIndexPath);
  } else {
    loadDevServerWithRetry(mainWindow, devServerUrl, 10, 200);
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
        const activeCfg = config.getConfig();
        const res = await testConnection(activeCfg.connectionString);
        if (tray?.displayBalloon) {
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
 * Retries connecting to Vite dev server until ready
 */
function loadDevServerWithRetry(win, url, maxRetries = 30, interval = 200) {
  let retries = 0;
  const tryConnect = () => {
    const req = http.get(url, () => { win.loadURL(url); });
    req.on('error', () => {
      retries++;
      if (retries < maxRetries) {
        setTimeout(tryConnect, interval);
      } else if (fs.existsSync(distIndexPath)) {
        win.loadFile(distIndexPath);
      } else {
        win.loadURL(url);
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
            console.log(`[Watch] Detected change in ${file}. Reloading...`);
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

/**
 * Sends prepared invoice or credit note payload to ZATCA API
 * On success, updates INVOICE_QRCODE and INVOICE_HASHKEY in MasterTrx table
 */
async function sendZatcaInvoice(payload, endpointUrl, { docnum, connString, tableName, docType } = {}) {
  const endpoint = config.resolveZatcaEndpoint(endpointUrl, docType);
  console.log(`[ZATCA] Sending ${String(docType).toUpperCase() === 'RET' ? 'Credit Note' : 'Invoice'} to:`, endpoint);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

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
    } catch {
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

    // Pre-fetch QR image and embed as base64 Data URL to guarantee display in renderer
    if (data.qr_url) {
      try {
        let qrImgUrl = data.qr_url;
        if (qrImgUrl.startsWith('/')) {
          const origin = new URL(endpoint).origin;
          qrImgUrl = `${origin}${qrImgUrl}`;
        }
        const imgRes = await fetch(qrImgUrl, { signal: AbortSignal.timeout(6000) });
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          data.qr_image_data = `data:${contentType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
          console.log('[ZATCA] QR image embedded as data URL');
        }
      } catch (imgErr) {
        console.warn('[ZATCA] Failed to pre-fetch QR image data URL:', imgErr.message);
      }
    }

    // On success, update INVOICE_QRCODE and INVOICE_HASHKEY in MasterTrx
    // Note: Credit note returns credit_note_hash, invoice returns invoice_hash
    const hashKey = data.credit_note_hash || data.invoice_hash || '';
    const qrCode = data.qr_code || '';

    let dbUpdate = null;
    if (data.success && docnum && (qrCode || hashKey)) {
      dbUpdate = await updateInvoiceRecord({
        docnum,
        docType,
        qrCode,
        hashKey,
        connString,
        tableName
      });
      console.log('[ZATCA] Database update for Doc #', docnum, '(', docType, '):', dbUpdate);
    }

    return {
      success: data.success !== undefined ? data.success : true,
      status: response.status,
      data,
      dbUpdate
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

// Window & Tray Controls
ipcMain.on('window:minimize-to-tray', () => {
  if (mainWindow) mainWindow.hide();
});

// Centralized Configuration IPC Handlers
ipcMain.handle('config:get', () => config.getConfig());
ipcMain.handle('config:save', (event, newConfig) => config.saveConfig(newConfig));
ipcMain.handle('config:open-folder', () => {
  try {
    shell.showItemInFolder(config.configFilePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// SQL Server IPC Handlers
ipcMain.handle('sql:test-connection', (event, connStr) => testConnection(connStr));
ipcMain.handle('sql:get-invoices', (event, params) => getInvoices(params));
ipcMain.handle('sql:get-branch-info', (event, params) => getBranchInfo(params));
ipcMain.handle('sql:get-invoice-items', (event, params) => getInvoiceItems(params));
ipcMain.handle('sql:update-invoice', (event, params) => updateInvoiceRecord(params));

// Image Fetch IPC Handler (bypasses browser CORS / CSP)
ipcMain.handle('app:fetch-image-data', async (event, url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'image/png';
    return { success: true, dataUrl: `data:${type};base64,${buffer.toString('base64')}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ZATCA Issue-Invoice & Issue-Credit-Note IPC Handler
ipcMain.handle('zatca:issue-invoice', (event, { payload, endpoint, docnum, connString, tableName, docType }) =>
  sendZatcaInvoice(payload, endpoint, { docnum, connString, tableName, docType })
);

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
