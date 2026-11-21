const { spawn } = require('child_process');
const path = require('path');
const { getDbConnectionString, getTableName } = require('./config');

/**
 * Executes a query against the SQL Server using Windows Trusted Connection
 * @param {string} query SQL query to execute
 * @param {string} [connectionString] Optional dynamic connection string
 * @returns {Promise<Array<object>>}
 */
function querySQL(query, connectionString) {
  let connStr = (connectionString && connectionString.trim()) ? connectionString.trim() : getDbConnectionString();
  // Ensure Pooling=false is included if not specified to prevent AppContainer performance counter restrictions
  if (!/pooling\s*=/i.test(connStr)) {
    connStr = connStr.replace(/;?\s*$/, ';Pooling=false;');
  }

  return new Promise((resolve, reject) => {
    // PowerShell script to execute query and format as clean, flat JSON
    const psScript = `
      $connString = @"
${connStr.replace(/"/g, '`"')}
"@
      try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = @"
${query.replace(/"/g, '`"')}
"@
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
        $dt = New-Object System.Data.DataTable
        $adapter.Fill($dt) | Out-Null
        $conn.Close()

        if ($dt.Rows.Count -eq 0) {
          Write-Output "[]"
        } else {
          $rows = @()
          foreach ($r in $dt.Rows) {
            $item = [ordered]@{}
            foreach ($col in $dt.Columns) {
              $v = $r[$col]
              if ($null -eq $v -or $v -is [System.DBNull]) {
                $item[$col.ColumnName] = ""
              } elseif ($v -is [byte[]]) {
                $item[$col.ColumnName] = [System.Convert]::ToBase64String($v)
              } elseif ($v -is [System.DateTime]) {
                $item[$col.ColumnName] = $v.ToString("yyyy-MM-dd HH:mm:ss")
              } else {
                $item[$col.ColumnName] = [string]$v
              }
            }
            $rows += [PSCustomObject]$item
          }
          $rows | ConvertTo-Json -Compress
        }
      } catch {
        Write-Error $_.Exception.Message
        exit 1
      }
    `;

    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    ps.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ps.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ps.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
      }
      try {
        const cleaned = stdout.trim();
        if (!cleaned) {
          return resolve([]);
        }
        const parsed = JSON.parse(cleaned);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err) {
        reject(new Error(`Failed to parse SQL output as JSON: ${err.message}. Raw: ${stdout}`));
      }
    });

    ps.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Tests connection to SQL Server with dynamic connection string
 * @param {string} [connectionString]
 */
async function testConnection(connectionString) {
  try {
    const res = await querySQL('SELECT @@VERSION as version, DB_NAME() as database_name', connectionString);
    return {
      success: true,
      database: res[0]?.database_name || 'Connected',
      version: res[0]?.version,
      data: res[0]
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetches branch information and returns the zatca_post_effective date
 * @param {object} options
 * @param {string} [options.connString]
 * @param {string} [options.tableName]
 * @param {number} [options.limit]
 * @returns {Promise<{success: boolean, date?: string, rows?: Array<object>, error?: string}>}
 */
async function getBranchInfo({ connString, tableName = 'branch_info', limit = 1 } = {}) {
  const cleanTable = (tableName || 'branch_info').trim().replace(/[[\];]/g, '');

  try {
    const query = `
      SELECT TOP ${limit}
        zatca_post_effective AS EffectiveDate
      FROM [${cleanTable}]
      ORDER BY BTN_ID DESC
    `;
    const rows = await querySQL(query, connString);
    const date = rows && rows.length > 0 && rows[0].EffectiveDate ? rows[0].EffectiveDate : null;
    return { success: true, date, rows };
  } catch (error) {
    // Fallback if BTN_ID doesn't exist
    try {
      const fallbackQuery = `
        SELECT TOP ${limit}
          zatca_post_effective AS EffectiveDate
        FROM [${cleanTable}]
      `;
      const fallbackRows = await querySQL(fallbackQuery, connString);
      const date = fallbackRows && fallbackRows.length > 0 && fallbackRows[0].EffectiveDate ? fallbackRows[0].EffectiveDate : null;
      return { success: true, date, rows: fallbackRows };
    } catch (fallbackError) {
      return { success: false, error: fallbackError.message, date: null, rows: [] };
    }
  }
}

function formatToSqlDate(d) {
  if (!d) return null;
  const str = String(d).trim();
  // Match YYYY-MM-DD
  const ymd = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  // Match DD/MM/YYYY
  const dmy = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return str.split(' ')[0];
}

/**
 * Fetches unposted invoices from dynamic table using branch effective date filter
 * Grouped by Mdocnum where Mrefnumber, INVOICE_QRCODE, and INVOICE_HASHKEY are null
 * @param {object} options
 * @param {string} [options.connString]
 * @param {string} [options.tableName]
 * @param {number} [options.limit]
 * @param {string} [options.branchTable]
 * @param {string} [options.effectiveDate]
 */
async function getInvoices({
  connString,
  tableName,
  limit = 50,
  branchTable = 'branch_info',
  effectiveDate
} = {}) {
  const activeConn = connString || getDbConnectionString();
  const activeTable = tableName || getTableName();
  const cleanTable = activeTable.trim().replace(/[[\];]/g, '');

  // 1. Retrieve the effective date from getBranchInfo if not provided
  let targetDate = effectiveDate;
  if (!targetDate) {
    const branchRes = await getBranchInfo({ connString: activeConn, tableName: branchTable });
    if (branchRes.success && branchRes.date) {
      targetDate = branchRes.date;
    }
  }

  const formattedDate = formatToSqlDate(targetDate);

  // 2. Build WHERE conditions:
  // - MtrxdateA >= effectiveDate from getBranchInfo
  // - Mrefnumber, INVOICE_QRCODE, INVOICE_HASHKEY are null or empty
  const conditions = [];

  if (formattedDate) {
    conditions.push(`(
      CASE 
        WHEN MtrxdateA LIKE '__/__/____' THEN CONVERT(DATETIME, MtrxdateA, 103)
        WHEN ISDATE(MtrxdateA) = 1 THEN CONVERT(DATETIME, MtrxdateA)
        ELSE NULL
      END >= '${formattedDate}'
    )`);
  }

  conditions.push(`(Mrefnumber IS NULL OR LTRIM(RTRIM(Mrefnumber)) = '')`);
  conditions.push(`(INVOICE_QRCODE IS NULL OR LTRIM(RTRIM(INVOICE_QRCODE)) = '')`);

  // Query builder supporting both INVOICE_HASHKEY and invoice_haskey column naming
  const buildGroupedQuery = (hashCol) => `
    SELECT TOP ${limit}
      Mdocnum,
      MAX(MtrxdateA) AS MtrxdateA,
      MAX(MsupcusName) AS MsupcusName,
      MAX(vatno) AS vatno,
      MAX(INVOICE_QRCODE) AS INVOICE_QRCODE,
      MAX(${hashCol}) AS INVOICE_HASHKEY
    FROM [${cleanTable}]
    WHERE ${[...conditions, `(${hashCol} IS NULL OR LTRIM(RTRIM(${hashCol})) = '')`].join(' AND ')}
    GROUP BY Mdocnum
    ORDER BY Mdocnum DESC
  `;

  try {
    const query = buildGroupedQuery('INVOICE_HASHKEY');
    const rows = await querySQL(query, connString);
    return { success: true, effectiveDate: formattedDate || targetDate, rows };
  } catch (error) {
    // If table uses invoice_haskey spelling (without 'h')
    try {
      const altQuery = buildGroupedQuery('invoice_haskey');
      const altRows = await querySQL(altQuery, connString);
      return { success: true, effectiveDate: formattedDate || targetDate, rows: altRows };
    } catch (altError) {
      // Fallback query if hash column is omitted
      try {
        const fallbackQuery = `
          SELECT TOP ${limit}
            Mdocnum,
            MAX(MtrxdateA) AS MtrxdateA,
            MAX(MsupcusName) AS MsupcusName,
            MAX(vatno) AS vatno,
            MAX(INVOICE_QRCODE) AS INVOICE_QRCODE,
            '' AS INVOICE_HASHKEY
          FROM [${cleanTable}]
          WHERE (Mrefnumber IS NULL OR LTRIM(RTRIM(Mrefnumber)) = '')
            ${formattedDate ? `AND (CASE WHEN MtrxdateA LIKE '__/__/____' THEN CONVERT(DATETIME, MtrxdateA, 103) WHEN ISDATE(MtrxdateA) = 1 THEN CONVERT(DATETIME, MtrxdateA) ELSE NULL END >= '${formattedDate}')` : ''}
          GROUP BY Mdocnum
          ORDER BY Mdocnum DESC
        `;
        const fallbackRows = await querySQL(fallbackQuery, connString);
        return { success: true, effectiveDate: formattedDate || targetDate, rows: fallbackRows };
      } catch (fallbackError) {
        return { success: false, error: fallbackError.message, effectiveDate: formattedDate || targetDate, rows: [] };
      }
    }
  }
}

/**
 * Fetches invoice transaction line items for a specific Mdocnum
 * Selects Mtrxdate, MtrxdateA, SYSDATE, Mitemname, Outqty, Munitprice
 * @param {object} options
 * @param {string|number} options.docnum
 * @param {string} [options.connString]
 * @param {string} [options.tableName]
 * @returns {Promise<{success: boolean, rows?: Array<object>, error?: string}>}
 */
async function getInvoiceItems({ docnum, connString, tableName } = {}) {
  const activeConn = connString || getDbConnectionString();
  const activeTable = tableName || getTableName();
  const cleanTable = activeTable.trim().replace(/[[\];]/g, '');
  const cleanDocnum = String(docnum).replace(/'/g, "''").trim();

  try {
    const query = `
      SELECT 
        Mtrxdate,
        MtrxdateA,
        SYSDATE,
        Mitemname,
        Outqty,
        Munitprice
      FROM [${cleanTable}]
      WHERE Mdocnum = '${cleanDocnum}'
    `;
    const rows = await querySQL(query, activeConn);
    return { success: true, rows };
  } catch (error) {
    return { success: false, error: error.message, rows: [] };
  }
}

module.exports = {
  querySQL,
  testConnection,
  getInvoices,
  getBranchInfo,
  getInvoiceItems
};
