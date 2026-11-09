const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { normalizePatch, createPermanentSettingsStore } = require('../lib/permanent-settings');

test('permanent settings exclude credentials and session-specific host focus', () => {
  const clean = normalizePatch({ 'host-local-config': JSON.stringify({ aiProvider: 'openai', aiDefaultCount: 12, aiApiKey: 'secret', adminToken: 'secret' }), 'host-room-defaults': JSON.stringify({ privateSession: true, voice: { enabled: true, focusParticipantId: 'old-session-player' } }) });
  assert.deepEqual(JSON.parse(clean['host-local-config']), { aiProvider: 'openai', aiDefaultCount: 12 });
  assert.deepEqual(JSON.parse(clean['host-room-defaults']), { privateSession: true, voice: { enabled: true } });
  assert.throws(() => normalizePatch({ 'admin-token': 'secret' }));
  assert.throws(() => normalizePatch({ 'room-access-token:ABC123': 'secret' }));
  assert.throws(() => normalizePatch({ 'session-plans': 'x'.repeat(200001) }));
});

test('database settings isolate owners, merge concurrent saves, preserve existing values on migration and propagate failures', async () => {
  const records = new Map(); let fail = false;
  const db = { async load(key) { return records.has(key) ? JSON.parse(records.get(key)) : null; }, async save(key, value) { if (fail) throw new Error('Database failed'); records.set(key, JSON.stringify(value)); } };
  const store = createPermanentSettingsStore({ database: () => db, databaseRequired: true });
  await Promise.all([store.patch('owner-a', { spinWheelMuted: 'false' }), store.patch('owner-a', { 'session-plans': '["plan"]' })]);
  assert.deepEqual(await store.load('owner-a'), { spinWheelMuted: 'false', 'session-plans': '["plan"]' });
  assert.deepEqual(await store.load('owner-b'), {});
  assert.ok([...records.keys()].every(key => !key.includes('owner-a')));
  await store.patch('owner-a', { spinWheelMuted: 'true', surveyClashVolume: '0.3' }, true);
  assert.equal((await store.load('owner-a')).spinWheelMuted, 'false');
  await store.patch('owner-a', { 'session-plans': null });
  await store.patch('owner-a', { 'session-plans': '["stale"]' }, true);
  assert.equal((await store.load('owner-a'))['session-plans'], null);
  fail = true;
  await assert.rejects(store.patch('owner-a', { spinWheelMuted: 'true' }), /Database failed/);
  assert.equal((await store.load('owner-a')).spinWheelMuted, 'false');
  const unavailable = createPermanentSettingsStore({ database: () => null, databaseRequired: true });
  await assert.rejects(unavailable.load('owner-a'), /unavailable/);
});

test('file-only development settings survive restarting the store', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'permanent-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = { database: () => null, databaseRequired: false, dataDir: dir };
  await createPermanentSettingsStore(options).patch('owner-a', { spinWheelMuted: 'false' });
  assert.deepEqual(await createPermanentSettingsStore(options).load('owner-a'), { spinWheelMuted: 'false' });
});

function browser(remote, initial = {}) {
  const storage = new Map(Object.entries(initial)), events = {}, timers = [];
  let failed = false;
  const context = vm.createContext({ console, AbortSignal, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key), key: i => [...storage.keys()][i], get length() { return storage.size; } },
    addEventListener: (name, fn) => { events[name] = fn; },
    apiRequest: async (_url, options) => {
      if (failed) throw new Error('offline');
      const patch = normalizePatch(options.body.settings);
      for (const [key, value] of Object.entries(patch)) if (!options.body.onlyMissing || !Object.hasOwn(remote, key)) remote[key] = value;
      return { settings: { ...remote } };
    }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/permanent-settings.js'), 'utf8'), context);
  return { api: context.PermanentSettings, storage, setFailed: value => { failed = value; } };
}

test('browser migrates old settings, restores database values and retries pending saves after reload without transmitting API keys', async () => {
  const remote = { spinWheelMuted: 'false' };
  const first = browser(remote, { spinWheelMuted: 'true', 'host-local-config': JSON.stringify({ aiApiKey: 'private', aiModel: 'model' }) });
  await first.api.initialize();
  assert.equal(first.storage.get('spinWheelMuted'), 'false');
  assert.equal(JSON.parse(remote['host-local-config']).aiApiKey, undefined);
  assert.equal(JSON.parse(first.storage.get('host-local-config')).aiApiKey, 'private');
  first.setFailed(true);
  first.api.set('surveyClashVolume', '0.2');
  await assert.rejects(first.api.flush(), /offline/);
  assert.equal(first.api.pending, true);
  const second = browser(remote, Object.fromEntries(first.storage));
  await second.api.initialize(); await second.api.flush();
  assert.equal(remote.surveyClashVolume, '0.2');
  assert.equal(second.api.pending, false);
  const restored = browser(remote);
  await restored.api.initialize();
  assert.equal(restored.storage.get('surveyClashVolume'), '0.2');
  restored.api.set('session-plans', null); await restored.api.flush();
  assert.equal(remote['session-plans'], null);
});
