const TEAM_BUILDER_ADMIN_RUNTIME = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_ADMIN_RUNTIME.applyBranding = function applyBranding(config) {
  const branding = config?.branding || {};
  const preferences = normalizeAppPreferences(config?.preferences || {});
  const appName = String(branding.appName || APP.branding.appName).trim();
  const tagline = String(branding.tagline || APP.branding.tagline).trim();
  const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
  const accent = isHex(branding.accent) ? String(branding.accent).trim() : (APP.branding.accent || '#00d2d3');
  const accentAlt = isHex(branding.accentAlt) ? String(branding.accentAlt).trim() : (APP.branding.accentAlt || '');
  const bgColor = isHex(branding.bgColor) ? String(branding.bgColor).trim() : (APP.branding.bgColor || '');
  const validThemes = ['default', 'servicenow'];
  const colorTheme = validThemes.includes(String(branding.colorTheme || '').toLowerCase())
    ? String(branding.colorTheme).toLowerCase()
    : (APP.branding.colorTheme || 'default');

  APP.branding = {
    appName: appName || APP.branding.appName,
    tagline: tagline || APP.branding.tagline,
    accent,
    accentAlt,
    bgColor,
    colorTheme
  };
  APP.preferences = {
    ...APP.preferences,
    ...preferences
  };
  if (typeof applyColorTheme === 'function') {
    applyColorTheme(APP.branding);
  } else {
    document.documentElement.style.setProperty('--accent', APP.branding.accent);
  }
  syncFooterQuoteRotation();
};

TEAM_BUILDER_ADMIN_RUNTIME.normalizeClientCollections = function normalizeClientCollections(rawCollections) {
  if (!Array.isArray(rawCollections)) return [];
  const seen = new Set();
  const normalized = [];
  rawCollections.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    const idBase = String(raw.id || raw.name || `collection_${idx + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const id = idBase || `collection_${Date.now()}_${idx}`;
    if (seen.has(id)) return;
    seen.add(id);
    const activities = raw.activities && typeof raw.activities === 'object' ? raw.activities : {};
    const filtered = {};
    Object.entries(activities).forEach(([activityId, items]) => {
      if (!ALL_ACTIVITY_IDS.includes(activityId)) return;
      if (!Array.isArray(items) || !items.length) return;
      filtered[activityId] = items;
    });
    if (!Object.keys(filtered).length) return;
    normalized.push({
      id,
      name: String(raw.name || id).trim().slice(0, 80) || id,
      description: String(raw.description || '').trim().slice(0, 240),
      activities: filtered
    });
  });
  return normalized;
};

TEAM_BUILDER_ADMIN_RUNTIME.applyConfigPayload = function applyConfigPayload(data) {
  const config = data?.config || {};
  TEAM_BUILDER_ADMIN_RUNTIME.applyBranding(config);
  const collections = TEAM_BUILDER_ADMIN_RUNTIME.normalizeClientCollections(data?.collections || []);
  APP.admin.collections = collections;
  APP.admin.communityHostRequests = normalizeCommunityHostRequests(data?.communityHostRequests || APP.admin.communityHostRequests || []);
  APP.admin.sessions = Array.isArray(data?.sessions) ? data.sessions : (APP.admin.sessions || []);
  APP.admin.configDatabaseConnected = Boolean(data?.storage?.configDatabaseConnected);
  APP.preferences = normalizeAppPreferences(config?.preferences || APP.preferences || {});
  rehydrateActivityBanksFromConfig(collections);
};

TEAM_BUILDER_ADMIN_RUNTIME.getDefaultHostLocalConfig = function getDefaultHostLocalConfig() {
  const provider = normalizeAIProvider(window.AI_PROVIDER || window.AI_DEFAULT_PROVIDER || 'openai-compatible');
  return {
    aiProvider: provider,
    aiEndpoint: window.AI_ENDPOINT || window.AI_QUESTION_ENDPOINT || getDefaultAIEndpoint(provider),
    aiModel: window.AI_MODEL || window.AI_QUESTION_MODEL || getDefaultAIModel(provider),
    aiDefaultActivity: 'lightning-trivia',
    aiDefaultDifficulty: 'mixed',
    aiDefaultCount: 8,
    aiApiKey: localStorage.getItem('ai-question-api-key') || ''
  };
};

TEAM_BUILDER_ADMIN_RUNTIME.loadHostLocalConfig = function loadHostLocalConfig() {
  const defaults = TEAM_BUILDER_ADMIN_RUNTIME.getDefaultHostLocalConfig();
  const stored = safeParseJson(localStorage.getItem('host-local-config') || '');
  if (!stored || typeof stored !== 'object') return defaults;
  const merged = { ...defaults, ...stored };
  merged.aiProvider = normalizeAIProvider(merged.aiProvider || defaults.aiProvider);
  merged.aiEndpoint = String(merged.aiEndpoint || '').trim() || getDefaultAIEndpoint(merged.aiProvider);
  merged.aiModel = String(merged.aiModel || '').trim() || getDefaultAIModel(merged.aiProvider);
  const validActivities = new Set([
    'lightning-trivia',
    'emoji-charades',
    'regular-trivia',
    'icebreaker',
    'pulse-check',
    'values-vote',
    'wordle',
    'word-chain',
    'brainstorm-canvas'
  ]);
  if (!validActivities.has(merged.aiDefaultActivity)) {
    merged.aiDefaultActivity = defaults.aiDefaultActivity;
  }
  return merged;
};

TEAM_BUILDER_ADMIN_RUNTIME.saveHostLocalConfig = function saveHostLocalConfig(config) {
  localStorage.setItem('host-local-config', JSON.stringify(config));
};

TEAM_BUILDER_ADMIN_RUNTIME.loadCommunityRooms = async function loadCommunityRooms() {
  APP.community.loading = true;
  render();
  try {
    const data = await apiRequest('/api/community/rooms');
    APP.community.rooms = Array.isArray(data?.rooms) ? data.rooms : [];
  } catch (_error) {
    APP.community.rooms = [];
    showError('Unable to load community lobbies right now.');
  } finally {
    APP.community.loading = false;
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.refreshCommunityHostAccessRequests = async function refreshCommunityHostAccessRequests() {
  APP.community.requestsLoading = true;
  render();
  try {
    const data = await apiRequest('/api/community/host-access-request/mine', { withUserToken: true });
    APP.community.requests = normalizeCommunityHostRequests(data?.requests || []);
  } catch (_error) {
    APP.community.requests = [];
  } finally {
    APP.community.requestsLoading = false;
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.loadCommunityDirectoryData = async function loadCommunityDirectoryData() {
  void loadGlobalConfig();
  await Promise.all([
    TEAM_BUILDER_ADMIN_RUNTIME.loadCommunityRooms(),
    TEAM_BUILDER_ADMIN_RUNTIME.refreshCommunityHostAccessRequests()
  ]);
};

TEAM_BUILDER_ADMIN_RUNTIME.submitCommunityHostAccessRequest = async function submitCommunityHostAccessRequest() {
  if (APP.community.requestSubmitting) return;
  const playerName = normalizeName(APP.player?.name || '');
  if (!playerName) {
    showError('Set your player name before requesting host access.');
    return;
  }
  const reason = String(document.getElementById('communityHostAccessReason')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!reason) {
    showError('Add a short reason for requesting community host access.');
    return;
  }
  APP.community.requestSubmitting = true;
  render();
  try {
    await apiRequest('/api/community/host-access-request', {
      method: 'POST',
      withUserToken: true,
      body: {
        userName: playerName,
        userId: APP.player?.id || '',
        reason
      }
    });
    const input = document.getElementById('communityHostAccessReason');
    if (input) input.value = '';
    await TEAM_BUILDER_ADMIN_RUNTIME.refreshCommunityHostAccessRequests();
    await loadGlobalConfig();
    showError('Community host access request sent.');
  } catch (e) {
    showError(e.message);
  } finally {
    APP.community.requestSubmitting = false;
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.saveCommunityHostAccessRequest = async function saveCommunityHostAccessRequest(requestId, status) {
  if (!APP.admin.authenticated || !requestId) return;
  const normalizedStatus = ['pending', 'approved', 'denied'].includes(String(status || '').trim().toLowerCase())
    ? String(status).trim().toLowerCase()
    : 'pending';
  const adminNotes = String(document.getElementById(`community-request-notes-${requestId}`)?.value || '').trim();
  try {
    const data = await apiRequest(`/api/admin/community-host-requests/${requestId}`, {
      method: 'PATCH',
      adminToken: APP.admin.token,
      body: {
        status: normalizedStatus,
        adminNotes
      }
    });
    TEAM_BUILDER_ADMIN_RUNTIME.applyConfigPayload(data);
    render();
  } catch (e) {
    showError(e.message);
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.loadPublicConfig = async function loadPublicConfig() {
  try {
    const data = await apiRequest('/api/config');
    TEAM_BUILDER_ADMIN_RUNTIME.applyConfigPayload(data);
  } catch (e) {
    console.warn('Failed to load config:', e.message);
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.loadGlobalConfig = async function loadGlobalConfig() {
  return TEAM_BUILDER_ADMIN_RUNTIME.loadPublicConfig();
};

TEAM_BUILDER_ADMIN_RUNTIME.openFeedbackHub = async function openFeedbackHub() {
  if (APP.preferences.enableFeedbackHub === false) {
    showError('Feedback Hub is currently disabled by admin.');
    return;
  }
  APP.showShortcutHelp = false;
  APP.screen = 'feedback';
  APP.feedbackLoading = true;
  APP.feedback = [];
  render();
  await TEAM_BUILDER_ADMIN_RUNTIME.refreshMyFeedback();
};

TEAM_BUILDER_ADMIN_RUNTIME.refreshMyFeedback = async function refreshMyFeedback() {
  APP.feedbackLoading = true;
  render();
  try {
    const data = await apiRequest('/api/feedback/mine', { withUserToken: true });
    APP.feedback = Array.isArray(data.feedback) ? data.feedback : [];
  } catch (e) {
    showError(e.message);
  } finally {
    APP.feedbackLoading = false;
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.submitFeedback = async function submitFeedback() {
  const type = String(document.getElementById('feedbackType')?.value || 'general');
  const title = String(document.getElementById('feedbackTitle')?.value || '').trim();
  const details = String(document.getElementById('feedbackDetails')?.value || '').trim();
  if (!title || !details) {
    showError('Title and details are required.');
    return;
  }
  try {
    await apiRequest('/api/feedback', {
      method: 'POST',
      withUserToken: true,
      body: {
        type,
        title,
        details,
        userName: APP.player?.name || 'Anonymous',
        userId: APP.player?.id || ''
      }
    });
    const titleInput = document.getElementById('feedbackTitle');
    const detailsInput = document.getElementById('feedbackDetails');
    if (titleInput) titleInput.value = '';
    if (detailsInput) detailsInput.value = '';
    await TEAM_BUILDER_ADMIN_RUNTIME.refreshMyFeedback();
  } catch (e) {
    showError(e.message);
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.adminLogin = async function adminLogin() {
  const tokenInput = document.getElementById('adminToken');
  const token = String(tokenInput?.value || APP.admin.token || '').trim();
  if (!token) {
    showError('Admin token is required.');
    return;
  }
  APP.admin.token = token;
  if (token) localStorage.setItem('admin-token', token);
  else localStorage.removeItem('admin-token');
  try {
    await apiRequest('/api/admin/login', {
      method: 'POST',
      adminToken: token
    });
    APP.admin.authenticated = true;
    await TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminConfig();
    await TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminFeedback();
    await TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminSessions();
  } catch (e) {
    APP.admin.authenticated = false;
    showError(e.message);
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.adminLogout = function adminLogout() {
  APP.admin.authenticated = false;
  APP.admin.activeTab = 'overview';
  APP.admin.feedback = [];
  APP.admin.sessions = [];
  APP.admin.loading = false;
  APP.admin.sessionsLoading = false;
  APP.admin.sessionActionPending = '';
  APP.admin.savingConfig = false;
  APP.admin.generatingContent = false;
  APP.admin.generationStatus = null;
  localStorage.removeItem('admin-token');
  APP.admin.token = '';
  render();
};

TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminConfig = async function refreshAdminConfig() {
  if (!APP.admin.authenticated) return;
  try {
    const data = await apiRequest('/api/admin/config', { adminToken: APP.admin.token });
    TEAM_BUILDER_ADMIN_RUNTIME.applyConfigPayload(data);
    render();
  } catch (e) {
    showError(e.message);
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminFeedback = async function refreshAdminFeedback() {
  if (!APP.admin.authenticated) return;
  APP.admin.loading = true;
  render();
  try {
    const data = await apiRequest('/api/admin/feedback', { adminToken: APP.admin.token });
    APP.admin.feedback = Array.isArray(data.feedback) ? data.feedback : [];
  } catch (e) {
    showError(e.message);
  } finally {
    APP.admin.loading = false;
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminSessions = async function refreshAdminSessions() {
  if (!APP.admin.authenticated) return;
  APP.admin.sessionsLoading = true;
  render();
  try {
    const data = await apiRequest('/api/admin/sessions', { adminToken: APP.admin.token });
    APP.admin.sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  } catch (e) {
    showError(e.message);
  } finally {
    APP.admin.sessionsLoading = false;
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.closeAdminSession = async function closeAdminSession(roomCode) {
  if (!APP.admin.authenticated || !roomCode) return;
  APP.admin.sessionActionPending = `close:${roomCode}`;
  render();
  try {
    const data = await apiRequest(`/api/admin/sessions/${encodeURIComponent(roomCode)}`, {
      method: 'DELETE',
      adminToken: APP.admin.token
    });
    APP.admin.sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  } catch (e) {
    showError(e.message);
  } finally {
    APP.admin.sessionActionPending = '';
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.cleanupAbandonedAdminSessions = async function cleanupAbandonedAdminSessions() {
  if (!APP.admin.authenticated) return;
  APP.admin.sessionActionPending = 'cleanup-abandoned';
  render();
  try {
    const data = await apiRequest('/api/admin/sessions/cleanup-abandoned', {
      method: 'POST',
      adminToken: APP.admin.token
    });
    APP.admin.sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  } catch (e) {
    showError(e.message);
  } finally {
    APP.admin.sessionActionPending = '';
    render();
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.saveAdminFeedbackItem = async function saveAdminFeedbackItem(feedbackId) {
  if (!feedbackId || !APP.admin.authenticated) return;
  const status = String(document.getElementById(`admin-status-${feedbackId}`)?.value || 'open');
  const adminNotes = String(document.getElementById(`admin-notes-${feedbackId}`)?.value || '');
  try {
    await apiRequest(`/api/admin/feedback/${feedbackId}`, {
      method: 'PATCH',
      adminToken: APP.admin.token,
      body: { status, adminNotes }
    });
    await TEAM_BUILDER_ADMIN_RUNTIME.refreshAdminFeedback();
  } catch (e) {
    showError(e.message);
  }
};

TEAM_BUILDER_ADMIN_RUNTIME.saveAdminConfig = async function saveAdminConfig() {
  if (!APP.admin.authenticated || APP.admin.savingConfig) return;
  const appName = String(document.getElementById('adminBrandAppName')?.value || '').trim();
  const tagline = String(document.getElementById('adminBrandTagline')?.value || '').trim();
  const accent = String(document.getElementById('adminBrandAccent')?.value || '').trim();
  const accentAlt = String(document.getElementById('adminBrandAccentAlt')?.value || '').trim();
  const bgColor = String(document.getElementById('adminBrandBgColor')?.value || '').trim();
  const colorTheme = String(document.getElementById('adminColorTheme')?.value || 'default').trim();
  const enableFeedbackHub = Boolean(document.getElementById('adminEnableFeedbackHub')?.checked);
  const enableActivityQueue = Boolean(document.getElementById('adminEnableActivityQueue')?.checked);
  const enableScheduleMeeting = Boolean(document.getElementById('adminEnableScheduleMeeting')?.checked);
  const enableLoadSession = Boolean(document.getElementById('adminEnableLoadSession')?.checked);
  const enableCommunityLobby = Boolean(document.getElementById('adminEnableCommunityLobby')?.checked);
  const enableAIGenerator = Boolean(document.getElementById('adminEnableAIGenerator')?.checked);
  const enableSampleQuestions = Boolean(document.getElementById('adminEnableSampleQuestions')?.checked);
  const enableFooterQuotes = Boolean(document.getElementById('adminEnableFooterQuotes')?.checked);
  const autoRevealLightning = Boolean(document.getElementById('adminAutoRevealLightning')?.checked);
  const allowAnswerChanges = Boolean(document.getElementById('adminAllowAnswerChanges')?.checked);
  const dynamicScoring = Boolean(document.getElementById('adminDynamicScoring')?.checked);
  const enableMessageBoard = Boolean(document.getElementById('adminEnableMessageBoard')?.checked);
  const communityHostAllowlist = String(document.getElementById('adminCommunityHostAllowlist')?.value || '')
    .split('\n')
    .map(name => normalizeName(name))
    .filter(Boolean)
    .filter((name, index, arr) => arr.indexOf(name) === index)
    .slice(0, 100);
  const enabledActivities = Object.fromEntries(
    ACTIVITY_QUEUE_ITEMS.map(item => [item.id, Boolean(document.getElementById(`adminActivityEnabled-${item.id}`)?.checked)])
  );
  const saveButton = document.querySelector('[data-action="save-admin-config"]');
  APP.admin.savingConfig = true;
  setAsyncButtonState(saveButton, true, 'Save Branding & Preferences', 'Saving...');

  try {
    const data = await apiRequest('/api/admin/config', {
      method: 'PUT',
      adminToken: APP.admin.token,
      body: {
        branding: { appName, tagline, accent, accentAlt, bgColor, colorTheme },
        preferences: {
          enableFeedbackHub,
          enableActivityQueue,
          enableScheduleMeeting,
          enableLoadSession,
          enableCommunityLobby,
          enableAIGenerator,
          enableSampleQuestions,
          enableFooterQuotes,
          autoRevealLightning,
          allowAnswerChanges,
          dynamicScoring,
          enableMessageBoard,
          communityHostAllowlist,
          enabledActivities
        },
        collections: TEAM_BUILDER_ADMIN_RUNTIME.normalizeClientCollections(APP.admin.collections || [])
      }
    });
    APP.admin.savingConfig = false;
    TEAM_BUILDER_ADMIN_RUNTIME.applyConfigPayload(data);
    render();
  } catch (e) {
    APP.admin.savingConfig = false;
    setAsyncButtonState(saveButton, false, 'Save Branding & Preferences', 'Saving...');
    showError(e.message);
  }
};
