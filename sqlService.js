const { spawn } = require('child_process');
const config = require('./config');

/**
 * Executes a query against SQL Server using Windows Trusted Connection
 * @param {string} query SQL query to execute
 * @param {string} [connectionString] Optional dynamic connection string
 * @returns {Promise<Array<object>>}
 */
function querySQL(query, connectionString) {
  let connStr = (connectionString && connectionString.trim())
    ? connectionString.trim()
    : config.getConfig().connectionString;

  if (!/pooling\s*=/i.test(connStr)) {
    connStr = connStr.replace(/;?\s*$/, ';Pooling=false;');
  }

  return new Promise((resolve, reject) => {
    const psScript = `
      $connString = @"
${connStr.replace(/"/g, '`"')}
"@
      try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = @"
${query.replace(/[`$"]/g, '`$&')}
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

    ps.stdout.on('data', (d) => { stdout += d.toString(); });
    ps.stderr.on('data', (d) => { stderr += d.toString(); });

    ps.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
      }
      try {
        const cleaned = stdout.trim();
        if (!cleaned) return resolve([]);
        const parsed = JSON.parse(cleaned);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (err) {
        reject(new Error(`Failed to parse SQL output as JSON: ${err.message}`));
      }
    });

    ps.on('error', reject);
  });
}

/**
 * Tests connection to SQL Server
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
 * Normalizes any date string (YYYY-MM-DD or DD/MM/YYYY) to SQL format YYYY-MM-DD
 */
function normalizeDate(d) {
  if (!d) return null;
  const str = String(d).trim();
  const ymd = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const dmy = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return str.split(' ')[0];
}

/**
 * Fetches branch effective posting date
 */
async function getBranchInfo({ connString, tableName = 'branch_info', limit = 1 } = {}) {
  const cleanTable = tableName.trim().replace(/[[\];]/g, '');
  try {
    const query = `
      SELECT TOP ${limit}
        CONVERT(VARCHAR(10), ZATCA_POST_EFFECTIVE, 120) AS EffectiveDate
      FROM [${cleanTable}]
      ORDER BY ZATCA_POST_EFFECTIVE DESC
    `;
    const rows = await querySQL(query, connString);
    const date = rows?.[0]?.EffectiveDate || null;
    return { success: true, date, rows };
  } catch (error) {
    return { success: false, error: error.message, date: null, rows: [] };
  }
}

/**
 * Fetches unposted invoices grouped by Mdocnum filtered by branch effective date.
 * Mtrxdate of MasterTrx table must be equal or greater than effectiveDate of BRANCH_INFO.
 */
async function getInvoices({
  connString,
  tableName,
  limit = 50,
  branchTable = 'branch_info',
  effectiveDate
} = {}) {
  const activeConn = connString || config.getConfig().connectionString;
  const activeTable = (tableName || config.getConfig().tableName).trim().replace(/[[\];]/g, '');

  let targetDate = effectiveDate;
  if (!targetDate) {
    const branchRes = await getBranchInfo({ connString: activeConn, tableName: branchTable });
    if (branchRes.success && branchRes.date) {
      targetDate = branchRes.date;
    }
  }

  const formattedDate = normalizeDate(targetDate);
  const dateFilter = formattedDate
    ? `AND CAST(Mtrxdate AS DATE) >= '${formattedDate}'`
    : '';

  const query = `
    SELECT TOP ${limit}
      Mdocnum,
      MAX(Mtrxdate) AS Mtrxdate,
      MAX(MtrxdateA) AS MtrxdateA,
      MAX(MsupcusName) AS MsupcusName,
      MAX(vatno) AS vatno,
      MAX(INVOICE_QRCODE) AS INVOICE_QRCODE,
      MAX(INVOICE_HASHKEY) AS INVOICE_HASHKEY
    FROM [${activeTable}]
    WHERE (Mrefnumber IS NULL OR LTRIM(RTRIM(Mrefnumber)) = '')
      AND (INVOICE_QRCODE IS NULL OR LTRIM(RTRIM(INVOICE_QRCODE)) = '')
      AND (INVOICE_HASHKEY IS NULL OR LTRIM(RTRIM(INVOICE_HASHKEY)) = '')
      ${dateFilter}
    GROUP BY Mdocnum
    ORDER BY Mdocnum DESC
  `;

  try {
    const rows = await querySQL(query, activeConn);
    return { success: true, effectiveDate: formattedDate || targetDate, rows };
  } catch (error) {
    return { success: false, error: error.message, effectiveDate: formattedDate || targetDate, rows: [] };
  }
}

/**
 * Fetches line items for a specific Mdocnum.
 * Formats TrxDate (YYYY-MM-DD), TrxTime (HH:mm:ss), and TrxYear (YYYY) directly in SQL.
 */
async function getInvoiceItems({ docnum, connString, tableName } = {}) {
  const activeConn = connString || config.getConfig().connectionString;
  const activeTable = (tableName || config.getConfig().tableName).trim().replace(/[[\];]/g, '');
  const cleanDocnum = String(docnum).replace(/'/g, "''").trim();

  const query = `
    SELECT 
      Mitemname,
      Outqty,
      Munitprice,
      CONVERT(VARCHAR(10), Mtrxdate, 120) AS TrxDate,
      CONVERT(VARCHAR(8), SYSDATE, 108) AS TrxTime,
      YEAR(Mtrxdate) AS TrxYear
    FROM [${activeTable}]
    WHERE Mdocnum = '${cleanDocnum}'
  `;

  try {
    const rows = await querySQL(query, activeConn);
    return { success: true, rows };
  } catch (error) {
    return { success: false, error: error.message, rows: [] };
  }
}

/**
 * Updates INVOICE_QRCODE and INVOICE_HASHKEY for all rows with the given Mdocnum
 */
async function updateInvoiceRecord({ docnum, qrCode, hashKey, connString, tableName } = {}) {
  const activeConn = connString || config.getConfig().connectionString;
  const activeTable = (tableName || config.getConfig().tableName).trim().replace(/[[\];]/g, '');
  const cleanDocnum = String(docnum).replace(/'/g, "''").trim();
  const cleanQr = String(qrCode || '').replace(/'/g, "''");
  const cleanHash = String(hashKey || '').replace(/'/g, "''");

  const query = `
    UPDATE [${activeTable}]
    SET INVOICE_QRCODE = '${cleanQr}',
        INVOICE_HASHKEY = '${cleanHash}'
    WHERE Mdocnum = '${cleanDocnum}'
  `;

  try {
    await querySQL(query, activeConn);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  querySQL,
  testConnection,
  getInvoices,
  getBranchInfo,
  getInvoiceItems,
  updateInvoiceRecord
};
