const assert = require('node:assert/strict');
const test = require('node:test');
const { connectionSettings, openConfigDatabase } = require('../lib/config-database');

test('database settings support MySQL and PostgreSQL without accepting incomplete or unsupported connections', () => {
  assert.equal(connectionSettings({}), null);
  const settings = connectionSettings({ DATABASE_URL: 'mysql://user:p%40ss%3Aword@db.example.com:3307/team' });
  assert.equal(settings.kind, 'mysql'); assert.equal(settings.options.password, 'p@ss:word'); assert.equal(settings.options.database, 'team');
  assert.equal(settings.options.port, 3307); assert.equal(settings.options.ssl.rejectUnauthorized, true); assert.equal(settings.options.ssl.verifyIdentity, true);
  const local = connectionSettings({ DB_HOST: '127.0.0.1', DB_NAME: 'team', DB_USER: 'user', DB_PASSWORD: ' secret ' });
  assert.equal(local.options.ssl, undefined); assert.equal(local.options.password, ' secret ');
  assert.equal(connectionSettings({ DATABASE_URL: 'postgres://user:secret@host/team', PGSSL: 'disable' }).options.ssl, false);
  assert.throws(() => connectionSettings({ DATABASE_URL: 'https://user:secret@host' }), /must use/);
  assert.throws(() => connectionSettings({ DB_HOST: 'host' }), /needs/);
});

test('MySQL settings save and load JSON with bound values and close failed pools', async () => {
  let stored = null, closed = false;
  const pool = { async query() {}, async execute(sql, params) { if (sql.startsWith('INSERT')) { stored = { key: params[0], value: params[1] }; return []; } return [[stored]]; }, async end() { closed = true; } };
  const env = { DB_HOST: 'remote.example', DB_NAME: 'team', DB_USER: 'user', DB_PASSWORD: 'secret' };
  const store = await openConfigDatabase(env, { mysql: { createPool: () => pool } });
  const value = { config: { branding: { appName: 'Team 🎉' } }, collections: [] };
  await store.save('global_config', value); assert.deepEqual(await store.load('global_config'), value);
  assert.equal(stored.key, 'global_config'); await store.end(); assert.equal(closed, true);
  closed = false;
  await assert.rejects(() => openConfigDatabase(env, { mysql: { createPool: () => ({ ...pool, async query() { throw new Error('Connection failed'); } }) } }), /Connection failed/);
  assert.equal(closed, true);
});

test('the PostgreSQL adapter preserves the existing settings payload', async () => {
  const value = { config: { preferences: { enableMessageBoard: true } }, collections: [] };
  let saved;
  class Pool { async query(sql, params) { if (sql.startsWith('INSERT')) saved = JSON.parse(params[1]); return { rows: sql.startsWith('SELECT') ? [{ value }] : [] }; } async end() {} }
  const store = await openConfigDatabase({ DATABASE_URL: 'postgres://user:secret@host/team', PGSSL: 'disable' }, { pg: { Pool } });
  await store.save('global_config', value); assert.deepEqual(saved, value); assert.deepEqual(await store.load('global_config'), value);
});
