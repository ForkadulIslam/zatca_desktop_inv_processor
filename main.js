const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const config = require('./config');
const { testConnection, getInvoices, getBranchInfo, getInvoiceItems, updateInvoiceRecord, logInvoiceError } = require('./sqlService');

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
    {
      label: 'Check for Updates',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        triggerUpdateCheck();
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
async function sendZatcaInvoice(payload, endpointUrl, { docnum, connString, tableName, docType, branchId } = {}) {
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

    if (!response.ok || data.success === false) {
      // Store failure in E_INVOICE_ERROR table (E_INV_XML column)
      await logInvoiceError({
        docnum,
        docType,
        branchId,
        errorLog: data || `HTTP ${response.status}: ${response.statusText}`,
        connString
      });

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
    const errText = err.name === 'AbortError'
      ? 'Request timed out connecting to ZATCA server (20s).'
      : `Network Error: ${err.message}`;

    // Store failure in E_INVOICE_ERROR table (E_INV_XML column)
    await logInvoiceError({
      docnum,
      docType,
      branchId,
      errorLog: errText,
      connString
    });

    return {
      success: false,
      error: errText
    };
  }
}

/**
 * Sends branch product key to ZATCA match-branch API
 */
async function matchBranchProductKey(branchProductKey, endpointUrl) {
  const endpoint = config.resolveMatchBranchEndpoint(endpointUrl);
  console.log('[ZATCA] Matching branch product key at:', endpoint);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ branch_product_key: branchProductKey }),
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

    if (!response.ok || data.success === false) {
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
      id: data.id ?? data.data?.id ?? data.unit_id ?? data.data?.unit_id,
      custom_id: data.custom_id ?? data.data?.custom_id,
      branch_name: data.branch_name ?? data.data?.branch_name,
      vat_number: data.vat_number ?? data.data?.vat_number,
      message: data.message,
      data
    };
  } catch (err) {
    console.error('[ZATCA] match-branch request failed:', err);
    return {
      success: false,
      error: err.name === 'AbortError'
        ? 'Request timed out connecting to ZATCA server (15s).'
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
ipcMain.handle('sql:log-invoice-error', (event, params) => logInvoiceError(params));

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
ipcMain.handle('zatca:issue-invoice', (event, { payload, endpoint, docnum, connString, tableName, docType, branchId }) =>
  sendZatcaInvoice(payload, endpoint, { docnum, connString, tableName, docType, branchId })
);

// ZATCA Match-Branch IPC Handler
ipcMain.handle('zatca:match-branch', (event, { branchProductKey, endpoint }) =>
  matchBranchProductKey(branchProductKey, endpoint)
);

// =========================================================================
// AUTO-UPDATER CONFIGURATION (GitHub Releases via electron-updater)
// =========================================================================
let updateCheckInterval = null;

function sendUpdaterStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', payload);
  }
}

function triggerUpdateCheck() {
  if (isDev) {
    sendUpdaterStatus({
      status: 'dev-mode',
      message: 'Auto-updater is active only in installed production builds.'
    });
    return Promise.resolve({
      success: false,
      devMode: true,
      message: 'Auto-updater is active only in installed production builds.'
    });
  }
  return autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] Check failed:', err.message);
    return { success: false, error: err.message };
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
    sendUpdaterStatus({ status: 'checking', message: 'Checking for updates...' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    sendUpdaterStatus({
      status: 'available',
      version: info.version,
      message: `New version v${info.version} found. Downloading automatically...`
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] App is up to date:', info.version);
    sendUpdaterStatus({
      status: 'up-to-date',
      version: info.version,
      message: `You are running the latest version (v${info.version}).`
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    sendUpdaterStatus({
      status: 'downloading',
      percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      message: `Downloading update... ${percent}%`
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    sendUpdaterStatus({
      status: 'downloaded',
      version: info.version,
      message: `Version v${info.version} is ready to install.`
    });
    if (tray?.displayBalloon) {
      tray.displayBalloon({
        title: 'ZATCA Invoice Processor Update Ready',
        content: `Version v${info.version} has been downloaded. Open the app to restart & install.`
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    sendUpdaterStatus({
      status: 'error',
      message: err.message || 'Failed to check for updates.'
    });
  });

  if (!isDev) {
    // Initial check shortly after launch
    setTimeout(() => {
      triggerUpdateCheck();
    }, 3000);

    // Periodic check every 15 minutes so background/tray instances update promptly
    updateCheckInterval = setInterval(() => {
      triggerUpdateCheck();
    }, 15 * 60 * 1000);
  }
}

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('updater:check', () => triggerUpdateCheck());
ipcMain.handle('updater:install', () => {
  isQuitting = true;
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  autoUpdater.quitAndInstall(false, true);
  return { success: true };
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdater();

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
