function connectionSettings(env = process.env) {
  const url = String(env.DATABASE_URL || '').trim();
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch (_) { throw new Error('DATABASE_URL must be a valid database URL.'); }
    if (['postgres:', 'postgresql:'].includes(parsed.protocol)) return { kind: 'postgres', options: { connectionString: url, ssl: env.PGSSL === 'disable' ? false : { rejectUnauthorized: true } } };
    if (!['mysql:', 'mariadb:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must use mysql, mariadb or postgres.');
    return mysqlSettings({ ...env, DB_HOST: parsed.hostname, DB_PORT: parsed.port || '3306', DB_NAME: decodeURIComponent(parsed.pathname.slice(1)), DB_USER: decodeURIComponent(parsed.username), DB_PASSWORD: decodeURIComponent(parsed.password) });
  }
  if (![env.DB_HOST, env.DB_NAME, env.DB_USER].some(Boolean)) return null;
  return mysqlSettings(env);
}
function mysqlSettings(env) {
  if (!env.DB_HOST || !env.DB_NAME || !env.DB_USER || env.DB_PASSWORD === undefined) throw new Error('MySQL needs DB_HOST, DB_NAME, DB_USER and DB_PASSWORD.');
  const host = String(env.DB_HOST).trim(), port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid port number.');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const mode = String(env.MYSQL_SSL_MODE || (local ? 'disable' : 'verify_identity')).toLowerCase();
  if (!['disable', 'verify_identity'].includes(mode)) throw new Error('MYSQL_SSL_MODE must be verify_identity or disable.');
  const ssl = mode === 'disable' ? undefined : { rejectUnauthorized: true, verifyIdentity: true, ...(env.DB_SSL_CA ? { ca: String(env.DB_SSL_CA).replace(/\\n/g, '\n') } : {}) };
  return { kind: 'mysql', options: { host, port, user: String(env.DB_USER).trim(), password: String(env.DB_PASSWORD), database: String(env.DB_NAME).trim(), charset: 'utf8mb4', connectTimeout: 10000, ...(ssl ? { ssl } : {}) } };
}
function decodeValue(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}
async function openConfigDatabase(env = process.env, drivers = {}) {
  const settings = connectionSettings(env);
  if (!settings) return null;
  let pool;
  try {
    if (settings.kind === 'mysql') {
      const mysql = drivers.mysql || require('mysql2/promise');
      pool = mysql.createPool({ ...settings.options, connectionLimit: 5, waitForConnections: true, queueLimit: 20, multipleStatements: false });
      await pool.query('CREATE TABLE IF NOT EXISTS app_config (`key` VARCHAR(191) PRIMARY KEY, value JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4');
      return {
        kind: 'MySQL', end: () => pool.end(),
        async load(key) { const [rows] = await pool.execute('SELECT value FROM app_config WHERE `key` = ? LIMIT 1', [key]); return rows[0] ? decodeValue(rows[0].value) : null; },
        async save(key, value) { const json = JSON.stringify(value); await pool.execute('INSERT INTO app_config (`key`, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP', [key, json, json]); }
      };
    }
    const pg = drivers.pg || require('pg'); pool = new pg.Pool(settings.options);
    await pool.query('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    return {
      kind: 'PostgreSQL', end: () => pool.end(),
      async load(key) { const result = await pool.query('SELECT value FROM app_config WHERE key = $1 LIMIT 1', [key]); return result.rows?.[0] ? decodeValue(result.rows[0].value) : null; },
      async save(key, value) { await pool.query('INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()', [key, JSON.stringify(value)]); }
    };
  } catch (error) { if (pool) await pool.end().catch(() => {}); throw error; }
}
module.exports = { connectionSettings, openConfigDatabase };
