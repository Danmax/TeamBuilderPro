const TEAM_BUILDER_STORAGE_API = typeof window !== 'undefined' ? window : globalThis;

const STORAGE_FEEDBACK_USER_TOKEN_KEY = 'feedback-user-token';
const STORAGE_ROOM_ACCESS_TOKEN_KEY_PREFIX = 'room-access-token:';
const STORAGE_ACTIVE_SESSION_STORAGE_KEY = 'active-session';
const STORAGE_SESSION_PLANS_STORAGE_KEY = 'session-plans';

TEAM_BUILDER_STORAGE_API.TEAM_BUILDER_STORAGE_KEYS = {
  FEEDBACK_USER_TOKEN_KEY: STORAGE_FEEDBACK_USER_TOKEN_KEY,
  ROOM_ACCESS_TOKEN_KEY_PREFIX: STORAGE_ROOM_ACCESS_TOKEN_KEY_PREFIX,
  ACTIVE_SESSION_STORAGE_KEY: STORAGE_ACTIVE_SESSION_STORAGE_KEY,
  SESSION_PLANS_STORAGE_KEY: STORAGE_SESSION_PLANS_STORAGE_KEY
};

TEAM_BUILDER_STORAGE_API.TEAM_BUILDER_ENDPOINTS = (() => {
  const socketServerOverride = TEAM_BUILDER_STORAGE_API.SOCKET_SERVER_URL || localStorage.getItem('socket-server-url') || '';
  const host = String(TEAM_BUILDER_STORAGE_API.location?.hostname || '').toLowerCase();
  const port = String(TEAM_BUILDER_STORAGE_API.location?.port || '');
  const protocol = String(TEAM_BUILDER_STORAGE_API.location?.protocol || 'http:');
  const hostname = String(TEAM_BUILDER_STORAGE_API.location?.hostname || 'localhost');
  const origin = String(TEAM_BUILDER_STORAGE_API.location?.origin || `${protocol}//${hostname}`);
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const isLikelyStaticLiveServerPort = /^55\d{2}$/.test(port);
  const fallbackOrigin = isLocalHost && isLikelyStaticLiveServerPort
    ? `${protocol}//${hostname}:3000`
    : origin;

  return {
    SOCKET_SERVER_OVERRIDE: socketServerOverride,
    SOCKET_SERVER_URL: socketServerOverride || fallbackOrigin,
    API_BASE_URL: TEAM_BUILDER_STORAGE_API.APP_API_BASE_URL || fallbackOrigin
  };
})();

TEAM_BUILDER_STORAGE_API.normalizeRoomAccessToken = function normalizeRoomAccessToken(token) {
  const normalized = String(token || '').trim();
  return /^[A-Za-z0-9_-]{20,128}$/.test(normalized) ? normalized : '';
};

TEAM_BUILDER_STORAGE_API.getRoomAccessStorageKey = function getRoomAccessStorageKey(code) {
  const normalizedCode = normalizeRoomCode(code || '');
  return normalizedCode ? `${STORAGE_ROOM_ACCESS_TOKEN_KEY_PREFIX}${normalizedCode}` : '';
};

TEAM_BUILDER_STORAGE_API.getStoredRoomAccessToken = function getStoredRoomAccessToken(code) {
  const storageKey = getRoomAccessStorageKey(code);
  if (!storageKey) return '';
  return normalizeRoomAccessToken(localStorage.getItem(storageKey) || '');
};

TEAM_BUILDER_STORAGE_API.setStoredRoomAccessToken = function setStoredRoomAccessToken(code, token) {
  const storageKey = getRoomAccessStorageKey(code);
  const normalizedToken = normalizeRoomAccessToken(token);
  if (!storageKey || !normalizedToken) return;
  localStorage.setItem(storageKey, normalizedToken);
};

TEAM_BUILDER_STORAGE_API.getRoomAccessTokenForKey = function getRoomAccessTokenForKey(key, overrideToken = '') {
  const normalizedOverride = normalizeRoomAccessToken(overrideToken);
  if (normalizedOverride) return normalizedOverride;
  const match = /^room:([A-Z0-9]{6})$/.exec(String(key || ''));
  if (!match) return '';
  return getStoredRoomAccessToken(match[1]);
};

TEAM_BUILDER_STORAGE_API.getFeedbackUserToken = function getFeedbackUserToken() {
  let token = localStorage.getItem(STORAGE_FEEDBACK_USER_TOKEN_KEY) || '';
  if (!token) {
    token = `u_${randomAlphaNum(18)}`;
    localStorage.setItem(STORAGE_FEEDBACK_USER_TOKEN_KEY, token);
  }
  return token;
};

TEAM_BUILDER_STORAGE_API.loadActiveSessionSnapshot = function loadActiveSessionSnapshot() {
  const stored = safeParseJson(localStorage.getItem(STORAGE_ACTIVE_SESSION_STORAGE_KEY) || '');
  if (!stored || typeof stored !== 'object') return null;
  const roomCode = normalizeRoomCode(stored.roomCode || '');
  const accessToken = normalizeRoomAccessToken(stored.accessToken || '');
  const playerId = String(stored.playerId || '').trim();
  const playerName = normalizeName(stored.playerName || '');
  if (!roomCode || !playerId || !playerName) return null;
  return { roomCode, accessToken, playerId, playerName };
};

TEAM_BUILDER_STORAGE_API.getAbsoluteApiUrl = function getAbsoluteApiUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, TEAM_BUILDER_STORAGE_API.TEAM_BUILDER_ENDPOINTS.API_BASE_URL).toString();
  } catch (_error) {
    return raw;
  }
};

TEAM_BUILDER_STORAGE_API.apiRequest = async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.withUserToken) headers['x-user-token'] = getFeedbackUserToken();
  if (options.adminToken) headers['x-admin-token'] = options.adminToken;
  if (options.roomToken) headers['x-room-token'] = options.roomToken;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${TEAM_BUILDER_STORAGE_API.TEAM_BUILDER_ENDPOINTS.API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }
  return data;
};
