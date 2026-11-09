const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEYS = new Set(['host-local-config', 'host-room-defaults', 'player-profile', 'session-plans', 'team-builder-saved-content-themes', 'surveyClashMuted', 'surveyClashVolume', 'spinWheelMuted']);
function allowedKey(key) {
  return KEYS.has(key) || /^spin-wheel-favorites:[A-Za-z0-9 _-]{1,100}$/.test(key);
}
function normalizePatch(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length > 40) throw new Error('Invalid settings.');
  const clean = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!allowedKey(key) || (value !== null && typeof value !== 'string')) throw new Error('Unsupported setting.');
    if (value !== null && Buffer.byteLength(value) > 200000) throw new Error('Setting is too large.');
    if (key === 'host-local-config' && value !== null) {
      const config = JSON.parse(value);
      // API credentials stay on the device or in server environment variables.
      clean[key] = JSON.stringify(Object.fromEntries(['aiProvider', 'aiEndpoint', 'aiModel', 'aiDefaultActivity', 'aiDefaultDifficulty', 'aiDefaultCount'].filter(field => config[field] !== undefined).map(field => [field, config[field]])));
    } else if (key === 'host-room-defaults' && value !== null) {
      const config = JSON.parse(value);
      const defaults = Object.fromEntries(['privateSession', 'enableAIGenerator', 'spinWheelAllowPlayerPicks', 'spinWheelFunMode', 'emojiCharadesAllowCloseAnswers'].filter(field => typeof config[field] === 'boolean').map(field => [field, config[field]]));
      const voice = config.voice || {};
      defaults.voice = Object.fromEntries(['enabled', 'participantMicPolicy', 'hideBlockedMicControls', 'transmissionMode'].filter(field => voice[field] !== undefined).map(field => [field, voice[field]]));
      clean[key] = JSON.stringify(defaults);
    } else clean[key] = value;
  }
  return clean;
}

function createPermanentSettingsStore({ database, databaseRequired, dataDir }) {
  const queues = new Map();
  const ownerKey = token => `user_settings:${crypto.createHash('sha256').update(token).digest('hex')}`;
  async function load(token) {
    const db = database();
    if (databaseRequired && !db) throw new Error('Settings database unavailable.');
    const key = ownerKey(token);
    if (db) {
      const stored = await db.load(key);
      if (stored) return stored;
    }
    if (!dataDir) return {};
    const file = path.join(dataDir, 'user-settings', `${key.slice(14)}.json`);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function patch(token, changes, onlyMissing = false) {
    const clean = normalizePatch(changes), key = ownerKey(token);
    const previous = queues.get(key) || Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      const settings = await load(token);
      for (const [name, value] of Object.entries(clean)) {
        if (onlyMissing && Object.hasOwn(settings, name)) continue;
        settings[name] = value; // Keep deletion markers so old caches cannot re-import removed settings.
      }
      if (Buffer.byteLength(JSON.stringify(settings)) > 750000) throw new Error('Saved settings are too large.');
      const db = database();
      if (db) await db.save(key, settings);
      else {
        const dir = path.join(dataDir, 'user-settings');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${key.slice(14)}.json`);
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(settings), { mode: 0o600 });
        fs.renameSync(`${file}.tmp`, file);
      }
      return settings;
    });
    queues.set(key, work);
    try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
  }
  return { load, patch };
}
module.exports = { allowedKey, normalizePatch, createPermanentSettingsStore };
