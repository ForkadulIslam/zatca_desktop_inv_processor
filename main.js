const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { testConnection, getInvoices } = require('./sqlService');

const isDev = !app.isPackaged;
const devServerUrl = 'http://localhost:5173';
const distIndexPath = path.join(__dirname, 'dist', 'index.html');
const trayIconPath = path.join(__dirname, 'trayIcon.png');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 850,
    minHeight: 600,
    icon: trayIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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
  tray.setToolTip('JATCA Invoice Processor (Running in Background)');

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
        const res = await testConnection();
        if (tray.displayBalloon) {
          tray.displayBalloon({
            title: 'SQL Server Status',
            content: res.success ? 'Connected to Unimarine' : `Error: ${res.error}`
          });
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

  // Single click toggles window
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Double click explicitly opens and focuses window
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

// Watch main process files (main.js, preload.js, sqlService.js) to auto-reload in development
if (isDev) {
  const watchFiles = ['main.js', 'preload.js', 'sqlService.js'];
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

// SQL Server IPC Handlers
ipcMain.handle('sql:test-connection', async () => {
  return await testConnection();
});

ipcMain.handle('sql:get-invoices', async (event, limit = 50) => {
  return await getInvoices(limit);
});

// Lifecycle
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

// Prevent exiting when windows close; keep alive in system tray
app.on('window-all-closed', () => {
  // Do nothing: tray icon keeps application running
});

// Explicit quit handler
app.on('before-quit', () => {
  isQuitting = true;
});
