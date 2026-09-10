const TEAM_BUILDER_STORAGE_RUNTIME = typeof window !== 'undefined' ? window : globalThis;

function getSharedActorPayload(key) {
  const actorToken = getRoomActorTokenForKey(key);
  const player = typeof APP !== 'undefined' ? APP.player : null;
  return {
    ...(actorToken ? { actorToken } : {}),
    actorPlayerId: String(player?.id || '').trim(),
    actorPlayerName: String(player?.name || '').trim(),
    userToken: getFeedbackUserToken(),
    adminToken: String(typeof APP !== 'undefined' ? APP.admin?.token || '' : '').trim()
  };
}

TEAM_BUILDER_STORAGE_RUNTIME.getSupabaseClient = async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClient) {
    supabaseClient = TEAM_BUILDER_STORAGE_RUNTIME.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
};

TEAM_BUILDER_STORAGE_RUNTIME.TeamBuilderStorage = {
  get: async function(key, shared = false, accessToken = '') {
    try {
      if (shared) {
        if (!isValidSharedKey(key)) return null;
        const authToken = getRoomAccessTokenForKey(key, accessToken);
        const socket = await getSocketClient();
        if (socket && (socket.connected || await waitForSocketConnection())) {
          const response = await socketEmitAck('shared:get', authToken ? { key, authToken } : { key });
          return response.value === null || response.value === undefined ? null : { value: response.value };
        }
        return null;
      }
      if (TEAM_BUILDER_STORAGE_RUNTIME.storage?.get) {
        return await TEAM_BUILDER_STORAGE_RUNTIME.storage.get(key, shared);
      }
      const value = localStorage.getItem(key);
      return value === null ? null : { value };
    } catch (e) {
      console.log('Storage get failed:', e.message);
      return null;
    }
  },

  set: async function(key, value, shared = false, accessToken = '') {
    try {
      if (shared) {
        if (!isValidSharedKey(key)) return null;
        const authToken = getRoomAccessTokenForKey(key, accessToken);
        const socket = await getSocketClient();
        if (socket && (socket.connected || await waitForSocketConnection())) {
          const response = await socketEmitAck('shared:set', {
            key,
            value,
            ...(authToken ? { authToken } : {}),
            ...getSharedActorPayload(key)
          });
          return { key, value: response?.value ?? value };
        }
        return null;
      }
      if (TEAM_BUILDER_STORAGE_RUNTIME.storage?.set) {
        return await TEAM_BUILDER_STORAGE_RUNTIME.storage.set(key, value, shared);
      }
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      console.error('Storage set failed:', e.message);
      return null;
    }
  },

  remove: async function(key, shared = false, accessToken = '') {
    try {
      if (shared) {
        if (!isValidSharedKey(key)) return null;
        const authToken = getRoomAccessTokenForKey(key, accessToken);
        const socket = await getSocketClient();
        if (socket && (socket.connected || await waitForSocketConnection())) {
          await socketEmitAck('shared:delete', {
            key,
            ...(authToken ? { authToken } : {}),
            ...getSharedActorPayload(key)
          });
          return { key };
        }
        return null;
      }
      if (TEAM_BUILDER_STORAGE_RUNTIME.storage?.remove) {
        return await TEAM_BUILDER_STORAGE_RUNTIME.storage.remove(key, shared);
      }
      localStorage.removeItem(key);
      return { key };
    } catch (e) {
      console.error('Storage remove failed:', e.message);
      return null;
    }
  }
};
