const { connectionSettings } = require('../lib/config-database');
(async () => {
  let connection;
  try {
    const settings = connectionSettings();
    if (!settings || settings.kind !== 'mysql') throw new Error('Configure DB_HOST, DB_NAME, DB_USER and DB_PASSWORD, or a MySQL DATABASE_URL.');
    connection = await require('mysql2/promise').createConnection(settings.options);
    const [rows] = await connection.query('SELECT 1 AS connected, DATABASE() AS database_name, CURRENT_USER() AS authenticated_user, VERSION() AS server_version');
    const [tls] = await connection.query("SHOW STATUS LIKE 'Ssl_cipher'");
    console.log(JSON.stringify({ connected: true, host: settings.options.host, port: settings.options.port, database: rows[0].database_name, user: rows[0].authenticated_user, version: rows[0].server_version, encrypted: Boolean(tls[0]?.Value) }, null, 2));
  } catch (error) {
    console.error(`Database check failed (${error.code || 'CONFIGURATION_ERROR'}). Check the database settings and access permissions.`); process.exitCode = 1;
  } finally { if (connection) await connection.end(); }
})();
