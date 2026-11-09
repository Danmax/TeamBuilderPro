(function (root) {
  const fixedKeys = new Set(['host-local-config', 'host-room-defaults', 'player-profile', 'session-plans', 'team-builder-saved-content-themes', 'surveyClashMuted', 'surveyClashVolume', 'spinWheelMuted']);
  const pendingKey = 'permanent-settings-pending';
  const allowed = key => fixedKeys.has(key) || /^spin-wheel-favorites:[A-Za-z0-9 _-]{1,100}$/.test(key);
  const clean = (key, value) => {
    if (key !== 'host-local-config' || value === null) return value;
    const config = JSON.parse(value);
    return JSON.stringify(Object.fromEntries(['aiProvider', 'aiEndpoint', 'aiModel', 'aiDefaultActivity', 'aiDefaultDifficulty', 'aiDefaultCount'].filter(field => config[field] !== undefined).map(field => [field, config[field]])));
  };
  let pending = {};
  try {
    const stored = JSON.parse(localStorage.getItem(pendingKey) || '{}');
    for (const [key, value] of Object.entries(stored)) if (allowed(key)) pending[key] = clean(key, value);
  } catch (_) { /* Keep the local cache if an older pending record is invalid. */ }
  let ready = false, timer, inFlight, warned = false;
  function savePending() { localStorage.setItem(pendingKey, JSON.stringify(pending)); }
  function warn(error) {
    console.warn('Permanent settings sync failed:', error.message);
    if (!warned && typeof root.showError === 'function') root.showError('Your changes are saved on this device, but could not reach the database. We will retry.');
    warned = true;
  }
  function apply(settings) {
    for (const [key, value] of Object.entries(settings)) {
      if (!allowed(key)) continue;
      if (value === null) { localStorage.removeItem(key); continue; }
      if (typeof value !== 'string') continue;
      if (key === 'host-local-config') {
        const local = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...JSON.parse(value), aiApiKey: localStorage.getItem('ai-question-api-key') || local.aiApiKey || '' }));
      } else localStorage.setItem(key, value);
    }
  }
  async function flush() {
    if (!ready) await initialize();
    if (inFlight) { await inFlight; if (Object.keys(pending).length) return flush(); return; }
    if (!Object.keys(pending).length) return;
    const changes = { ...pending };
    inFlight = root.apiRequest('/api/user/settings', { method: 'PATCH', withUserToken: true, signal: AbortSignal.timeout(10000), body: { settings: changes } }).then(() => {
      for (const key of Object.keys(changes)) if (pending[key] === changes[key]) delete pending[key];
      savePending(); warned = false;
    });
    try { await inFlight; } finally { inFlight = null; }
    if (Object.keys(pending).length) return flush();
  }
  let initializing;
  async function initialize() {
    if (ready) return;
    if (initializing) return initializing;
    initializing = (async () => {
      const migration = {};
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (allowed(key) && !Object.hasOwn(pending, key)) migration[key] = clean(key, localStorage.getItem(key));
      }
      // Existing database values win over an older device cache during migration.
      const result = await root.apiRequest('/api/user/settings', { method: 'PATCH', withUserToken: true, signal: AbortSignal.timeout(10000), body: { settings: migration, onlyMissing: true } });
      apply({ ...result.settings, ...pending });
      ready = true;
    })();
    try { await initializing; } finally { initializing = null; }
  }
  function set(key, value) {
    if (!allowed(key)) throw new Error('Unsupported permanent setting.');
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    pending[key] = clean(key, value); savePending();
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(warn), 250);
  }
  root.PermanentSettings = { initialize, flush, set, allowed, get pending() { return Object.keys(pending).length > 0; } };
  root.addEventListener('online', () => flush().catch(warn));
  root.addEventListener('focus', () => { if (Object.keys(pending).length) flush().catch(warn); });
  // Pending changes also survive closing the tab before the request completes.
})(window);
