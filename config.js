/**
 * Centralized Application Configuration & Global Variables
 * 
 * Manages defaults and persisted configuration for:
 * - Database Connection String
 * - Invoice Table Name
 * - ZATCA API Base URL & Issue-Invoice Endpoint
 */

const path = require('path');
const fs = require('fs');

// Global Default Configuration Values
const DEFAULT_CONFIG = {
  connectionString: "Server=MASKAT\\SQLEXPRESS;Database=Unimarine;Trusted_Connection=True;Connection Timeout=30;",
  tableName: "masterTrx",
  zatcaApiBase: "http://10.105.114.65:8000/api",
  zatcaEndpoint: "http://10.105.114.65:8000/api/zatca/issue-invoice"
};

/**
 * Resolves the configuration file location.
 * In Electron, saves to app.getPath('userData').
 * In Node.js / dev fallback, saves to APPDATA or local project directory.
 */
function resolveConfigFile() {
  try {
    const electron = require('electron');
    const app = electron.app || (electron.remote && electron.remote.app);
    if (app && typeof app.getPath === 'function') {
      const userDir = app.getPath('userData');
      return path.join(userDir, 'zatca-config.json');
    }
  } catch (e) {
    // Not running inside Electron main process
  }

  if (process.env.APPDATA) {
    const fallbackDir = path.join(process.env.APPDATA, 'zatca-invoice-processor');
    return path.join(fallbackDir, 'zatca-config.json');
  }

  return path.join(__dirname, 'zatca-config.json');
}

const configFilePath = resolveConfigFile();

/**
 * Normalizes any ZATCA URL (base or full endpoint) to the issue-invoice endpoint
 * @param {string} [url]
 * @returns {string}
 */
function resolveZatcaEndpoint(url) {
  const base = (url || DEFAULT_CONFIG.zatcaEndpoint).trim().replace(/\/+$/, '');
  if (base.endsWith('/zatca/issue-invoice')) {
    return base;
  }
  return `${base}/zatca/issue-invoice`;
}

// Active in-memory global configuration state
let globalConfig = { ...DEFAULT_CONFIG };

/**
 * Loads configuration from file on disk and merges with defaults.
 * Also checks for legacy db-config.json and migrates automatically.
 */
function loadConfig() {
  try {
    // 1. Try loading primary zatca-config.json
    if (fs.existsSync(configFilePath)) {
      const raw = fs.readFileSync(configFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      globalConfig = { ...DEFAULT_CONFIG, ...parsed };
    } else {
      // 2. Fallback check for legacy db-config.json
      const legacyPath = path.join(path.dirname(configFilePath), 'db-config.json');
      if (fs.existsSync(legacyPath)) {
        const rawLegacy = fs.readFileSync(legacyPath, 'utf-8');
        const parsedLegacy = JSON.parse(rawLegacy);
        globalConfig = { ...DEFAULT_CONFIG, ...parsedLegacy };
        // Save to modern config file
        saveConfig(globalConfig);
      }
    }

    // Auto-migrate any expired IP (e.g. 10.186.138.65) to current default
    if (globalConfig.zatcaEndpoint && globalConfig.zatcaEndpoint.includes('10.186.138.65')) {
      globalConfig.zatcaEndpoint = DEFAULT_CONFIG.zatcaEndpoint;
      globalConfig.zatcaApiBase = DEFAULT_CONFIG.zatcaApiBase;
      saveConfig(globalConfig);
    }

    // Ensure zatcaEndpoint is normalized
    globalConfig.zatcaEndpoint = resolveZatcaEndpoint(globalConfig.zatcaEndpoint);
    if (!globalConfig.zatcaApiBase) {
      globalConfig.zatcaApiBase = globalConfig.zatcaEndpoint.replace(/\/zatca\/issue-invoice\/?$/, '');
    }

  } catch (err) {
    console.error('[Config] Error loading config file:', err);
    globalConfig = { ...DEFAULT_CONFIG };
  }

  return { ...globalConfig, configFilePath };
}

/**
 * Saves updated configuration to in-memory global state and writes to JSON file
 * @param {object} updates Partial or complete configuration updates
 * @returns {{success: boolean, config?: object, configFilePath?: string, error?: string}}
 */
function saveConfig(updates = {}) {
  try {
    const dir = path.dirname(configFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Normalize endpoint if passed
    if (updates.zatcaEndpoint) {
      updates.zatcaEndpoint = resolveZatcaEndpoint(updates.zatcaEndpoint);
      if (!updates.zatcaApiBase) {
        updates.zatcaApiBase = updates.zatcaEndpoint.replace(/\/zatca\/issue-invoice\/?$/, '');
      }
    } else if (updates.zatcaApiBase) {
      updates.zatcaEndpoint = resolveZatcaEndpoint(updates.zatcaApiBase);
    }

    globalConfig = {
      ...globalConfig,
      ...updates
    };

    // Write formatted JSON to disk
    fs.writeFileSync(configFilePath, JSON.stringify(globalConfig, null, 2), 'utf-8');
    console.log('[Config] Successfully persisted configuration to:', configFilePath);

    return {
      success: true,
      config: { ...globalConfig },
      configFilePath
    };
  } catch (err) {
    console.error('[Config] Failed to save configuration to disk:', err);
    return {
      success: false,
      error: err.message,
      configFilePath
    };
  }
}

// Initial load on require
loadConfig();

module.exports = {
  DEFAULT_CONFIG,
  configFilePath,
  loadConfig,
  getConfig: () => ({ ...globalConfig, configFilePath }),
  saveConfig,
  resolveZatcaEndpoint,
  getDbConnectionString: () => globalConfig.connectionString || DEFAULT_CONFIG.connectionString,
  getTableName: () => globalConfig.tableName || DEFAULT_CONFIG.tableName,
  getZatcaEndpoint: (overrideUrl) => resolveZatcaEndpoint(overrideUrl || globalConfig.zatcaEndpoint),
  getZatcaApiBase: () => globalConfig.zatcaApiBase || DEFAULT_CONFIG.zatcaApiBase
};
