const TEAM_BUILDER_STORAGE_RUNTIME = typeof window !== 'undefined' ? window : globalThis;

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
        const client = await TEAM_BUILDER_STORAGE_RUNTIME.getSupabaseClient();
        if (client) {
          const { data, error } = await client
            .from('shared_state')
            .select('value')
            .eq('key', key)
            .maybeSingle();
          if (error) throw error;
          return data ? { value: data.value } : null;
        }
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
          await socketEmitAck('shared:set', authToken ? { key, value, authToken } : { key, value });
          return { key, value };
        }
        const client = await TEAM_BUILDER_STORAGE_RUNTIME.getSupabaseClient();
        if (client) {
          const { error } = await client
            .from('shared_state')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
          if (error) throw error;
          return { key, value };
        }
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
          await socketEmitAck('shared:delete', authToken ? { key, authToken } : { key });
          return { key };
        }
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
