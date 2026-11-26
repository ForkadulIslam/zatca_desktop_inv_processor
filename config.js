/**
 * Centralized Application Configuration
 * Single source of truth for database and ZATCA API settings.
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_CONFIG = {
  connectionString: "Server=MASKAT\\SQLEXPRESS;Database=Unimarine;Trusted_Connection=True;Connection Timeout=30;",
  tableName: "masterTrx",
  zatcaEndpoint: "http://10.172.105.65:8000/api/zatca/issue-invoice",
  vatIncludedPrice: false,
  branchProductKey: "",
  unitId: null,
  branchInfo: null
};

function resolveConfigFilePath() {
  try {
    const { app } = require('electron');
    if (app?.getPath) {
      return path.join(app.getPath('userData'), 'zatca-config.json');
    }
  } catch (e) {
    // Standalone node environment fallback
  }

  const baseDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'zatca-invoice-processor')
    : __dirname;
  return path.join(baseDir, 'zatca-config.json');
}

const configFilePath = resolveConfigFilePath();

/**
 * Normalizes any ZATCA URL (base /api or full endpoint) to the issue-invoice or issue-credit-note endpoint
 */
function resolveZatcaEndpoint(url, docType = 'INV') {
  let base = (url || DEFAULT_CONFIG.zatcaEndpoint).trim().replace(/\/+$/, '');
  base = base.replace(/\/zatca\/(issue-invoice|issue-credit-note|match-branch)$/i, '');
  base = base.replace(/\/api$/i, '');

  const isReturn = String(docType || '').trim().toUpperCase() === 'RET';
  const path = isReturn ? '/api/zatca/issue-credit-note' : '/api/zatca/issue-invoice';
  return `${base}${path}`;
}

/**
 * Normalizes any ZATCA URL to the match-branch endpoint
 */
function resolveMatchBranchEndpoint(url) {
  let base = (url || DEFAULT_CONFIG.zatcaEndpoint).trim().replace(/\/+$/, '');
  base = base.replace(/\/zatca\/(issue-invoice|issue-credit-note|match-branch)$/i, '');
  base = base.replace(/\/api$/i, '');
  return `${base}/api/zatca/match-branch`;
}

let activeConfig = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    if (fs.existsSync(configFilePath)) {
      const data = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
      activeConfig = { ...DEFAULT_CONFIG, ...data };
    }
  } catch (err) {
    console.error('[Config] Failed to load config from disk, using defaults:', err.message);
    activeConfig = { ...DEFAULT_CONFIG };
  }

  activeConfig.zatcaEndpoint = resolveZatcaEndpoint(activeConfig.zatcaEndpoint);
  return { ...activeConfig, configFilePath };
}

function saveConfig(updates = {}) {
  try {
    const dir = path.dirname(configFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (updates.zatcaEndpoint) {
      updates.zatcaEndpoint = resolveZatcaEndpoint(updates.zatcaEndpoint);
    }

    activeConfig = { ...activeConfig, ...updates };
    fs.writeFileSync(configFilePath, JSON.stringify(activeConfig, null, 2), 'utf-8');
    return { success: true, config: { ...activeConfig }, configFilePath };
  } catch (err) {
    console.error('[Config] Failed to save config:', err.message);
    return { success: false, error: err.message, configFilePath };
  }
}

// Initial load
loadConfig();

module.exports = {
  DEFAULT_CONFIG,
  configFilePath,
  getConfig: () => ({ ...activeConfig, configFilePath }),
  saveConfig,
  resolveZatcaEndpoint,
  resolveMatchBranchEndpoint
};
