const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { testConnection, getInvoices } = require('./sqlService');

const isDev = !app.isPackaged;
const devServerUrl = 'http://localhost:5173';
const distIndexPath = path.join(__dirname, 'dist', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 850,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    // In dev / watch mode, wait and connect to Vite dev server for instant HMR
    loadDevServerWithRetry(win, devServerUrl, 30, 200);
  } else {
    // In production, load the built static files
    if (fs.existsSync(distIndexPath)) {
      win.loadFile(distIndexPath);
    } else {
      loadDevServerWithRetry(win, devServerUrl, 10, 200);
    }
  }
}

/**
 * Retries connecting to Vite dev server until it's ready, then loads the URL
 */
function loadDevServerWithRetry(win, url, maxRetries = 30, interval = 200) {
  let retries = 0;

  const tryConnect = () => {
    const req = http.get(url, (res) => {
      // Dev server is running! Load it for instant HMR
      win.loadURL(url);
    });

    req.on('error', () => {
      retries++;
      if (retries < maxRetries) {
        setTimeout(tryConnect, interval);
      } else {
        // If dev server never started, fall back to built dist/index.html
        if (fs.existsSync(distIndexPath)) {
          console.log('[Dev] Dev server not detected; loading dist/index.html');
          win.loadFile(distIndexPath);
        } else {
          console.error('[Dev] Could not connect to dev server and no dist/index.html found.');
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
              BrowserWindow.getAllWindows().forEach((w) => w.reload());
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

// SQL Server IPC Handlers
ipcMain.handle('sql:test-connection', async () => {
  return await testConnection();
});

ipcMain.handle('sql:get-invoices', async (event, limit = 50) => {
  return await getInvoices(limit);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
