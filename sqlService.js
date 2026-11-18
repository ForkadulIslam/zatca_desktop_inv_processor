const { spawn } = require('child_process');
const path = require('path');

const CONNECTION_STRING = "Server=MASKAT\\SQLEXPRESS;Database=Unimarine;Trusted_Connection=True;Connection Timeout=30;Pooling=false;";

/**
 * Executes a query against the local SQL Server using Windows Trusted Connection
 * @param {string} query SQL query to execute
 * @returns {Promise<Array<object>>}
 */
function querySQL(query) {
  return new Promise((resolve, reject) => {
    // PowerShell script to execute query and format as JSON
    const psScript = `
      $connString = "${CONNECTION_STRING}"
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
          $dt | ConvertTo-Json -Depth 3 -Compress
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
        // If single row, convert to array
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
 * Tests connection to SQL Server
 */
async function testConnection() {
  try {
    const res = await querySQL('SELECT @@VERSION as version, DB_NAME() as database_name');
    return { success: true, data: res[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetches invoices from masterTrx
 * @param {number} limit 
 */
async function getInvoices(limit = 50) {
  try {
    const query = `
      SELECT TOP ${limit}
        msupcusname AS Name,
        MtrxdateA AS Date,
        Mdocnum AS Doc,
        vatno AS Vat,
        Invoice_qrcode,
        invoice_haskey
      FROM masterTrx
      ORDER BY Mdocnum DESC
    `;
    const rows = await querySQL(query);
    return { success: true, rows };
  } catch (error) {
    // If ORDER BY fails for any reason, retry without ORDER BY
    try {
      const fallbackQuery = `
        SELECT TOP ${limit}
          msupcusname AS Name,
          MtrxdateA AS Date,
          Mdocnum AS Doc,
          vatno AS Vat,
          Invoice_qrcode,
          invoice_hashkey
        FROM masterTrx
      `;
      const fallbackRows = await querySQL(fallbackQuery);
      return { success: true, rows: fallbackRows };
    } catch (fallbackError) {
      return { success: false, error: fallbackError.message, rows: [] };
    }
  }
}

module.exports = {
  querySQL,
  testConnection,
  getInvoices
};
