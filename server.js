const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
let pg = null;
try {
  // Optional dependency for DATABASE_URL-backed config storage.
  // Falls back to file persistence if unavailable.
  pg = require('pg');
} catch (_error) {
  pg = null;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // Security Note: In production, replace '*' with specific frontend domain(s)
    origin: '*'
  }
});

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const state = new Map();
const DATA_DIR = path.join(__dirname, '.runtime-data');
const DATA_FILE = path.join(DATA_DIR, 'shared-state.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback-state.json');
const ROOM_META_FILE = path.join(DATA_DIR, 'room-meta.json');
const DJ_UPLOAD_DIR = path.join(DATA_DIR, 'dj-library');
const LEGACY_AI_API_KEY = String(process.env.CHAT_GPT_MINI_KEY || '').trim();
const LEGACY_AI_ENDPOINT = String(process.env.AI_QUESTION_ENDPOINT || '').trim();
const LEGACY_AI_MODEL = String(process.env.AI_QUESTION_MODEL || '').trim();
const AI_PROVIDER = normalizeAIProvider(process.env.AI_PROVIDER || process.env.AI_DEFAULT_PROVIDER || '');
const AI_API_KEY = String(process.env.AI_API_KEY || LEGACY_AI_API_KEY || '').trim();
const AI_ENDPOINT = String(process.env.AI_ENDPOINT || LEGACY_AI_ENDPOINT || getDefaultAIEndpoint(AI_PROVIDER)).trim();
const AI_MODEL = String(process.env.AI_MODEL || LEGACY_AI_MODEL || getDefaultAIModel(AI_PROVIDER)).trim();
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const IS_PRODUCTION = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const GLOBAL_CONFIG_DB_KEY = 'global_config';
const ALL_ACTIVITY_IDS = [
  'lightning-trivia',
  'emoji-charades',
  'icebreaker',
  'pulse-check',
  'values-vote',
  'wordle',
  'word-chain',
  'brainstorm-canvas',
  'uno',
  'regular-trivia',
  'tic-tac-toe-blitz',
  'team-jeopardy',
  'spin-wheel',
  'slides-studio',
  'dj-booth',
  'battleship',
  'bingo',
  'backgammon',
  'connect-4'
];
const FEATURE_FLAG_IDS = [
  'enableFeedbackHub',
  'enableActivityQueue',
  'enableScheduleMeeting',
  'enableLoadSession',
  'enableCommunityLobby',
  'enableAIGenerator',
  'enableSampleQuestions',
  'enableFooterQuotes',
  'autoRevealLightning',
  'allowAnswerChanges',
  'dynamicScoring'
];
let persistTimer = null;
let feedbackPersistTimer = null;
let roomMetaPersistTimer = null;
let configDb = null;
const roomSecrets = new Map();
const voiceRooms = new Map();

function normalizeAIProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['openai', 'openai-compatible', 'openai_compatible', 'compatible'].includes(normalized)) return 'openai-compatible';
  if (['anthropic', 'claude'].includes(normalized)) return 'anthropic';
  if (['google', 'gemini', 'google-gemini'].includes(normalized)) return 'google-gemini';
  return 'openai-compatible';
}

function getDefaultAIEndpoint(provider) {
  const normalized = normalizeAIProvider(provider);
  if (normalized === 'anthropic') return 'https://api.anthropic.com/v1/messages';
  if (normalized === 'google-gemini') return 'https://generativelanguage.googleapis.com/v1beta/models';
  return 'https://api.openai.com/v1/chat/completions';
}

function getDefaultAIModel(provider) {
  const normalized = normalizeAIProvider(provider);
  if (normalized === 'anthropic') return 'claude-3-5-haiku-latest';
  if (normalized === 'google-gemini') return 'gemini-1.5-flash';
  return 'gpt-4o-mini';
}

function getAISystemPrompt() {
  return 'You create accurate facilitator game content. Output strict JSON only.';
}

function buildAIProviderRequest({ provider, endpoint, apiKey, model, prompt, temperature }) {
  const normalizedProvider = normalizeAIProvider(provider);
  const safeEndpoint = String(endpoint || getDefaultAIEndpoint(normalizedProvider)).trim();
  const safeModel = String(model || getDefaultAIModel(normalizedProvider)).trim() || getDefaultAIModel(normalizedProvider);
  const safePrompt = String(prompt || '').trim();
  const safeTemperature = Number.isFinite(Number(temperature)) ? Math.max(0, Math.min(2, Number(temperature))) : 0.7;

  if (normalizedProvider === 'anthropic') {
    return {
      endpoint: safeEndpoint,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: {
        model: safeModel,
        system: getAISystemPrompt(),
        max_tokens: 4096,
        temperature: safeTemperature,
        messages: [
          { role: 'user', content: safePrompt }
        ]
      }
    };
  }

  if (normalizedProvider === 'google-gemini') {
    const endpointHasGenerate = /:generateContent(?:\?|$)/.test(safeEndpoint);
    const endpointWithModel = endpointHasGenerate
      ? safeEndpoint
      : `${safeEndpoint.replace(/\/$/, '')}/${encodeURIComponent(safeModel)}:generateContent`;
    const separator = endpointWithModel.includes('?') ? '&' : '?';
    return {
      endpoint: `${endpointWithModel}${separator}key=${encodeURIComponent(apiKey)}`,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        systemInstruction: {
          parts: [{ text: getAISystemPrompt() }]
        },
        generationConfig: {
          temperature: safeTemperature
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: safePrompt }]
          }
        ]
      }
    };
  }

  return {
    endpoint: safeEndpoint,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: {
      model: safeModel,
      messages: [
        { role: 'system', content: getAISystemPrompt() },
        { role: 'user', content: safePrompt }
      ],
      temperature: safeTemperature
    }
  };
}

function extractAITextContent(provider, data) {
  const normalizedProvider = normalizeAIProvider(provider);
  if (normalizedProvider === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks
      .map(block => (block && typeof block === 'object' ? String(block.text || '').trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (normalizedProvider === 'google-gemini') {
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
      : [];
    return parts
      .map(part => (part && typeof part === 'object' ? String(part.text || '').trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

function extractAIErrorDetail(provider, data, response) {
  const normalizedProvider = normalizeAIProvider(provider);
  if (normalizedProvider === 'google-gemini') {
    return String(data?.error?.message || data?.error?.status || response.statusText || 'Unknown AI error');
  }
  return String(data?.error?.message || data?.error?.type || data?.error || response.statusText || 'Unknown AI error');
}

function getAdminToken() {
  return String(process.env.ADMIN_TOKEN || '').trim();
}

function getAdminTempPassword() {
  return String(process.env.ADMIN_TEMP_PASSWORD || '').trim();
}

function getDevAdminPassword() {
  if (IS_PRODUCTION) return '';
  return String(process.env.DEV_ADMIN_PASSWORD || getAdminTempPassword() || 'TAS2026!').trim();
}

function maskConfiguredSecret(secret) {
  const normalized = String(secret || '').trim();
  if (!normalized) return 'missing';
  if (normalized.length <= 4) return `${'*'.repeat(normalized.length)} (len=${normalized.length})`;
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-2)} (len=${normalized.length})`;
}

function getDefaultPreferences() {
  const enabledByDefault = new Set([
    'lightning-trivia',
    'icebreaker',
    'pulse-check',
    'wordle',
    'word-chain',
    'spin-wheel',
    'slides-studio',
    'battleship',
    'bingo'
  ]);
  return {
    enableFeedbackHub: true,
    enableActivityQueue: true,
    enableScheduleMeeting: true,
    enableLoadSession: true,
    enableCommunityLobby: true,
    enableAIGenerator: true,
    enableSampleQuestions: true,
    enableFooterQuotes: false,
    autoRevealLightning: true,
    allowAnswerChanges: true,
    dynamicScoring: true,
    enabledActivities: Object.fromEntries(ALL_ACTIVITY_IDS.map(activityId => [activityId, enabledByDefault.has(activityId)]))
  };
}

function normalizeEnabledActivities(raw) {
  const defaults = getDefaultPreferences().enabledActivities;
  if (!raw || typeof raw !== 'object') return defaults;
  return Object.fromEntries(ALL_ACTIVITY_IDS.map(activityId => [
    activityId,
    Boolean(raw[activityId] ?? defaults[activityId])
  ]));
}

function normalizePreferences(raw) {
  const defaults = getDefaultPreferences();
  const source = raw && typeof raw === 'object' ? raw : {};
  const normalized = { ...defaults };
  FEATURE_FLAG_IDS.forEach(flag => {
    normalized[flag] = Boolean(source[flag] ?? defaults[flag]);
  });
  normalized.communityHostAllowlist = Array.isArray(source.communityHostAllowlist)
    ? source.communityHostAllowlist
      .map(name => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 32))
      .filter(Boolean)
      .filter((name, index, arr) => arr.indexOf(name) === index)
      .slice(0, 100)
    : [];
  normalized.enabledActivities = normalizeEnabledActivities(source.enabledActivities);
  return normalized;
}

function normalizeCollection(rawCollection, idx = 0) {
  if (!rawCollection || typeof rawCollection !== 'object') return null;
  const idBase = String(rawCollection.id || rawCollection.name || `collection_${idx + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const id = idBase || `collection_${Date.now()}_${idx}`;
  const name = String(rawCollection.name || rawCollection.id || `Collection ${idx + 1}`).trim().slice(0, 80) || `Collection ${idx + 1}`;
  const description = String(rawCollection.description || '').trim().slice(0, 240);
  const activitiesRaw = rawCollection.activities && typeof rawCollection.activities === 'object' ? rawCollection.activities : {};
  const activities = {};
  Object.entries(activitiesRaw).forEach(([activityId, items]) => {
    if (!ALL_ACTIVITY_IDS.includes(activityId)) return;
    if (!Array.isArray(items)) return;
    activities[activityId] = items.slice(0, 200);
  });
  if (!Object.keys(activities).length) return null;
  return {
    id,
    name,
    description,
    activities
  };
}

function normalizeCollections(rawCollections) {
  if (!Array.isArray(rawCollections)) return [];
  const seen = new Set();
  const normalized = [];
  rawCollections.forEach((raw, idx) => {
    const collection = normalizeCollection(raw, idx);
    if (!collection) return;
    if (seen.has(collection.id)) return;
    seen.add(collection.id);
    normalized.push(collection);
  });
  return normalized;
}

function normalizeConfig(rawConfig) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const existingBranding = source.branding && typeof source.branding === 'object' ? source.branding : {};
  const appName = String(existingBranding.appName || 'Team Builder').trim().slice(0, 64) || 'Team Builder';
  const tagline = String(existingBranding.tagline || 'Team building, games, and challenges - all in one place').trim().slice(0, 140)
    || 'Team building, games, and challenges - all in one place';
  const accentRaw = String(existingBranding.accent || '#00d2d3').trim();
  return {
    branding: {
      appName,
      tagline,
      accent: isValidHexColor(accentRaw) ? accentRaw : '#00d2d3'
    },
    preferences: normalizePreferences(source.preferences)
  };
}

function normalizeCommunityHostRequest(rawRequest, idx = 0) {
  if (!rawRequest || typeof rawRequest !== 'object') return null;
  const userName = String(rawRequest.userName || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const reason = String(rawRequest.reason || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const userToken = String(rawRequest.userToken || '').trim().slice(0, 80);
  if (!userName || !userToken) return null;
  const status = String(rawRequest.status || 'pending').trim().toLowerCase();
  return {
    id: String(rawRequest.id || `community-host-request-${idx + 1}`).trim().slice(0, 80),
    userToken,
    userId: String(rawRequest.userId || '').trim().slice(0, 64),
    userName,
    reason,
    status: ['pending', 'approved', 'denied'].includes(status) ? status : 'pending',
    adminNotes: String(rawRequest.adminNotes || '').trim().slice(0, 400),
    createdAt: String(rawRequest.createdAt || nowIso()),
    updatedAt: String(rawRequest.updatedAt || rawRequest.createdAt || nowIso()),
    resolvedAt: rawRequest.resolvedAt ? String(rawRequest.resolvedAt) : null
  };
}

function normalizeCommunityHostRequests(rawRequests) {
  if (!Array.isArray(rawRequests)) return [];
  return rawRequests
    .map((item, idx) => normalizeCommunityHostRequest(item, idx))
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, 500);
}

const feedbackState = {
  feedback: [],
  config: normalizeConfig({}),
  collections: [],
  communityHostRequests: []
};

app.use(express.json({ limit: '1mb' }));
app.use('/media/dj', express.static(DJ_UPLOAD_DIR, {
  fallthrough: false,
  index: false,
  setHeaders: res => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// Security: Add Helmet for secure headers
app.use(helmet({
  contentSecurityPolicy: false // Disabled for simplicity with inline scripts in single-file frontend
}));

// Security: Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

function sendFrontendFile(filename) {
  return (_req, res) => {
    res.sendFile(path.join(__dirname, filename));
  };
}

app.get('/', sendFrontendFile('index.html'));
app.get('/index.html', sendFrontendFile('index.html'));
app.get('/player-hub-v1 (2).html', sendFrontendFile('player-hub-v1 (2).html'));

function loadStateFromDisk() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    Object.entries(parsed).forEach(([key, value]) => {
      state.set(key, String(value ?? ''));
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load persisted state:', error.message);
  }
}

function loadFeedbackStateFromDisk() {
  try {
    if (!fs.existsSync(FEEDBACK_FILE)) return;
    const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (Array.isArray(parsed.feedback)) {
      feedbackState.feedback = parsed.feedback;
    }
    if (parsed.config && typeof parsed.config === 'object') {
      feedbackState.config = normalizeConfig({
        ...feedbackState.config,
        ...parsed.config,
        branding: {
          ...(feedbackState.config.branding || {}),
          ...(parsed.config.branding || {})
        },
        preferences: {
          ...(feedbackState.config.preferences || {}),
          ...(parsed.config.preferences || {})
        }
      });
    }
    feedbackState.collections = normalizeCollections(parsed.collections || []);
    feedbackState.communityHostRequests = normalizeCommunityHostRequests(parsed.communityHostRequests || []);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load feedback state:', error.message);
  }
}

function loadRoomMetaFromDisk() {
  try {
    if (!fs.existsSync(ROOM_META_FILE)) return;
    const raw = fs.readFileSync(ROOM_META_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    Object.entries(parsed).forEach(([key, meta]) => {
      const token = String(meta?.token || '').trim();
      if (!isRoomKey(key)) return;
      if (token && !isValidRoomToken(token)) return;
      const roomPrivacy = getRoomPrivacyFromState(key);
      const privateSession = roomPrivacy === null
        ? (meta?.privateSession === undefined ? Boolean(token) : Boolean(meta?.privateSession))
        : roomPrivacy;
      roomSecrets.set(key, {
        token,
        createdAt: Number(meta?.createdAt) || Date.now(),
        privateSession
      });
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load room metadata:', error.message);
  }
}

function persistStateToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const snapshot = Object.fromEntries(state.entries());
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist state:', error.message);
  }
}

function persistFeedbackStateToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${FEEDBACK_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(feedbackState, null, 2), 'utf8');
    fs.renameSync(tempFile, FEEDBACK_FILE);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist feedback state:', error.message);
  }
}

function persistRoomMetaToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const snapshot = Object.fromEntries(Array.from(roomSecrets.entries()).map(([key, meta]) => [
      key,
      {
        token: meta.token,
        createdAt: meta.createdAt,
        privateSession: meta.privateSession === true
      }
    ]));
    const tempFile = `${ROOM_META_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
    fs.renameSync(tempFile, ROOM_META_FILE);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist room metadata:', error.message);
  }
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStateToDisk();
  }, 150);
}

function scheduleFeedbackPersist() {
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  feedbackPersistTimer = setTimeout(() => {
    feedbackPersistTimer = null;
    persistFeedbackStateToDisk();
  }, 150);
}

function scheduleRoomMetaPersist() {
  if (roomMetaPersistTimer) clearTimeout(roomMetaPersistTimer);
  roomMetaPersistTimer = setTimeout(() => {
    roomMetaPersistTimer = null;
    persistRoomMetaToDisk();
  }, 150);
}

async function initializeConfigDatabase() {
  if (!DATABASE_URL) return;
  if (!pg?.Pool) {
    // eslint-disable-next-line no-console
    console.warn('DATABASE_URL is set but pg is unavailable. Falling back to file config storage.');
    return;
  }
  try {
    // Security: Enforce stricter SSL in production if supported by provider
    const sslConfig = process.env.PGSSL === 'disable' 
      ? false 
      : { rejectUnauthorized: true }; 

    configDb = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: sslConfig
    });
    await configDb.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize config database:', error.message);
    configDb = null;
  }
}

async function loadConfigFromDatabase() {
  if (!configDb) return;
  try {
    const result = await configDb.query(
      'SELECT value FROM app_config WHERE key = $1 LIMIT 1',
      [GLOBAL_CONFIG_DB_KEY]
    );
    const stored = result.rows?.[0]?.value;
    if (!stored || typeof stored !== 'object') return;
    feedbackState.config = normalizeConfig(stored.config || {});
    feedbackState.collections = normalizeCollections(stored.collections || []);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load config from database:', error.message);
  }
}

async function persistConfigToDatabase() {
  if (!configDb) return;
  const value = {
    config: feedbackState.config,
    collections: feedbackState.collections
  };
  try {
    await configDb.query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [GLOBAL_CONFIG_DB_KEY, JSON.stringify(value)]
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to persist config to database:', error.message);
  }
}

function isRoomKey(key) {
  return /^room:[A-Z0-9]{6}$/.test(key || '');
}

function isValidRoomToken(token) {
  return /^[A-Za-z0-9_-]{20,128}$/.test(String(token || '').trim());
}

function nowIso() {
  return new Date().toISOString();
}

function ensureRuntimeDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createFeedbackId() {
  return `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getUserToken(req) {
  return String(req.header('x-user-token') || '').trim();
}

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());
}

function sanitizeDjFileName(value) {
  return String(value || '')
    .replace(/\+/g, ' ')
    .trim()
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function getDjUploadExtension(fileName = '', contentType = '') {
  const extFromName = path.extname(String(fileName || '').trim()).toLowerCase();
  const allowedExts = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']);
  if (allowedExts.has(extFromName)) return extFromName;
  const type = String(contentType || '').trim().toLowerCase();
  if (type.includes('mpeg')) return '.mp3';
  if (type.includes('wav')) return '.wav';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return '.m4a';
  if (type.includes('ogg')) return '.ogg';
  if (type.includes('webm')) return '.webm';
  return '';
}

function isAllowedDjUpload(contentType = '', fileName = '') {
  const type = String(contentType || '').trim().toLowerCase();
  const baseType = type.split(';')[0].trim();
  const ext = getDjUploadExtension(fileName, contentType);
  const allowedMime = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/mp4a-latm',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'video/mp4',
    'video/webm'
  ]);
  return Boolean(ext) && (
    allowedMime.has(baseType)
    || baseType === 'application/octet-stream'
    || baseType.startsWith('audio/')
    || baseType === 'video/mp4'
    || baseType === 'video/webm'
  );
}

function normalizeDjLibraryTrack(rawTrack, idx = 0) {
  if (!rawTrack || typeof rawTrack !== 'object') return null;
  const id = String(rawTrack.id || `track_${idx + 1}`).trim().slice(0, 80);
  const name = String(rawTrack.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const url = String(rawTrack.url || '').trim().slice(0, 500);
  const storageKey = String(rawTrack.storageKey || '').trim().slice(0, 180);
  if (!id || !name || !url) return null;
  return {
    id,
    name,
    url,
    storageKey,
    contentType: String(rawTrack.contentType || '').trim().slice(0, 80),
    size: Math.max(0, Number(rawTrack.size) || 0),
    uploadedAt: String(rawTrack.uploadedAt || nowIso()),
    uploadedBy: String(rawTrack.uploadedBy || '').replace(/\s+/g, ' ').trim().slice(0, 32)
  };
}

function isLocalDevRequest(req) {
  const rawHost = String(req.hostname || req.header('host') || '').trim().toLowerCase();
  const host = rawHost.replace(/:\d+$/, '');
  const forwardedFor = String(req.header('x-forwarded-for') || '').split(',')[0].trim();
  const remoteAddress = String(forwardedFor || req.ip || req.socket?.remoteAddress || '').trim().replace(/^::ffff:/, '');
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  const isLoopbackIp = remoteAddress === '127.0.0.1' || remoteAddress === '::1';
  return !IS_PRODUCTION && (isLoopbackHost || isLoopbackIp);
}

function isValidAdminToken(token, req) {
  const normalizedToken = String(token || '').trim();
  const adminToken = getAdminToken();
  const devAdminPassword = getDevAdminPassword();
  if (!normalizedToken) return false;
  if (adminToken && normalizedToken === adminToken) return true;
  if (devAdminPassword && normalizedToken === devAdminPassword && !IS_PRODUCTION) return true;
  return false;
}

function hasAdminAccessConfigured(req) {
  return Boolean(getAdminToken() || (!IS_PRODUCTION && getDevAdminPassword()));
}

function requireAdmin(req, res, next) {
  if (!hasAdminAccessConfigured(req)) {
    res.status(503).json({ ok: false, error: 'Admin access is not configured on this server.' });
    return;
  }
  const token = String(req.header('x-admin-token') || '').trim();
  if (!isValidAdminToken(token, req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
}

function getRequestRoomToken(source) {
  return String(source?.authToken || source?.roomToken || source?.['x-room-token'] || '').trim();
}

function safeParseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function extractRoomPrivacyFromValue(value) {
  const room = safeParseJsonObject(value);
  if (!room) return false;
  return room?.access?.privateSession === true || room?.hostSettings?.privateSession === true;
}

function getRoomPrivacyFromState(key) {
  if (!isRoomKey(key)) return null;
  if (!state.has(key)) return null;
  return extractRoomPrivacyFromValue(state.get(key));
}

function getCommunityRoomSummary(key, room) {
  if (!isRoomKey(key) || !room || typeof room !== 'object') return null;
  const roomType = String(room.roomType || '').trim().toLowerCase();
  const isPrivate = room?.access?.privateSession === true || room?.hostSettings?.privateSession === true;
  if (roomType !== 'community' || isPrivate) return null;
  const participants = Array.isArray(room.participants)
    ? room.participants.filter(participant => participant && typeof participant === 'object' && String(participant.name || '').trim())
    : [];
  const maxParticipants = Math.max(2, Number(room.maxParticipants) || 24);
  const participantCount = participants.length;
  return {
    code: String(room.code || key.replace(/^room:/, '')).trim(),
    title: String(room.communityTitle || room.title || `${room.host || 'Host'}'s Community Lobby`).trim().slice(0, 80),
    description: String(room.communityDescription || '').trim().slice(0, 220),
    roomType: 'community',
    host: String(room.host || '').trim(),
    participantCount,
    maxParticipants,
    currentActivity: String(room.currentActivity || '').trim() || null,
    queueLength: Array.isArray(room.activityQueue) ? room.activityQueue.length : 0,
    voiceEnabled: room?.hostSettings?.voice?.enabled === true,
    created: Number(room.created) || 0,
    lastUpdate: Number(room.lastUpdate) || Number(room.created) || 0,
    presenceStatus: participantCount >= maxParticipants
      ? 'full'
      : room.currentActivity
        ? 'in_game'
        : 'open'
  };
}

function listCommunityRooms() {
  return Array.from(state.entries())
    .map(([key, value]) => getCommunityRoomSummary(key, safeParseJsonObject(value)))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.presenceStatus !== b.presenceStatus) {
        if (a.presenceStatus === 'open') return -1;
        if (b.presenceStatus === 'open') return 1;
      }
      return (b.lastUpdate || 0) - (a.lastUpdate || 0);
    });
}

function deleteRoomState(key) {
  if (!isRoomKey(key)) return false;
  const existed = state.delete(key);
  roomSecrets.delete(key);
  if (voiceRooms.has(key)) {
    const voiceState = voiceRooms.get(key);
    voiceState?.sockets?.forEach((_member, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(key);
        socket.data.voiceKey = null;
      }
    });
    voiceRooms.delete(key);
  }
  if (existed) {
    schedulePersist();
    scheduleRoomMetaPersist();
  }
  return existed;
}

function getRoomAccessMeta(key) {
  if (!isRoomKey(key)) return null;
  const existing = roomSecrets.get(key);
  const roomPrivacy = getRoomPrivacyFromState(key);
  if (existing) {
    if (roomPrivacy !== null && existing.privateSession !== roomPrivacy) {
      existing.privateSession = roomPrivacy;
      scheduleRoomMetaPersist();
    }
    return existing;
  }
  const room = safeParseJsonObject(state.get(key));
  if (!room) return null;
  const inferred = {
    token: '',
    createdAt: Number(room?.created) || Date.now(),
    privateSession: room?.access?.privateSession === true || room?.hostSettings?.privateSession === true
  };
  roomSecrets.set(key, inferred);
  scheduleRoomMetaPersist();
  return inferred;
}

function hasValidRoomAccess(key, authToken) {
  const expected = getRoomAccessMeta(key)?.token;
  if (!expected || !authToken) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(authToken);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function ensureRoomAccess(key, authToken, desiredPrivateSession = false) {
  if (!isRoomKey(key)) return false;
  const normalizedPrivateSession = desiredPrivateSession === true;
  const normalizedToken = isValidRoomToken(authToken) ? authToken : '';
  const existing = getRoomAccessMeta(key);

  if (!existing) {
    if (normalizedPrivateSession && !normalizedToken) return false;
    roomSecrets.set(key, {
      token: normalizedToken,
      createdAt: Date.now(),
      privateSession: normalizedPrivateSession
    });
    scheduleRoomMetaPersist();
    return true;
  }

  if (existing.privateSession || normalizedPrivateSession) {
    const expectedToken = existing.token || normalizedToken;
    if (!expectedToken || !normalizedToken) return false;
    const tokenMatches = existing.token ? hasValidRoomAccess(key, normalizedToken) : true;
    if (!tokenMatches) return false;
    existing.token = expectedToken;
    existing.privateSession = normalizedPrivateSession;
    scheduleRoomMetaPersist();
    return true;
  }

  if (normalizedToken && !existing.token) {
    existing.token = normalizedToken;
    scheduleRoomMetaPersist();
  }
  existing.privateSession = false;
  return true;
}

function isAuthorizedForRoom(key, authToken) {
  if (!isRoomKey(key)) return false;
  const meta = getRoomAccessMeta(key);
  if (!meta) return false;
  if (!meta.privateSession) return true;
  if (!isValidRoomToken(authToken)) return false;
  return hasValidRoomAccess(key, authToken);
}

function getDefaultVoiceSettings() {
  return {
    enabled: false,
    participantMicPolicy: 'approved',
    hideBlockedMicControls: true,
    transmissionMode: 'ptt',
    focusParticipantId: ''
  };
}

function normalizeVoiceMicPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['host_only', 'approved', 'open'].includes(normalized) ? normalized : 'approved';
}

function normalizeVoiceTransmissionMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['ptt', 'open'].includes(normalized) ? normalized : 'ptt';
}

function getRoomSnapshot(key) {
  return safeParseJsonObject(state.get(key));
}

function getRoomVoiceSettings(room) {
  const merged = {
    ...getDefaultVoiceSettings(),
    ...(room?.hostSettings?.voice || {})
  };
  merged.participantMicPolicy = normalizeVoiceMicPolicy(merged.participantMicPolicy);
  merged.hideBlockedMicControls = merged.hideBlockedMicControls !== false;
  merged.transmissionMode = normalizeVoiceTransmissionMode(merged.transmissionMode);
  merged.focusParticipantId = String(merged.focusParticipantId || '').trim().slice(0, 64);
  return merged;
}

function getParticipantStableId(participant) {
  const explicitId = String(participant?.id || '').trim();
  if (explicitId) return explicitId;
  const fallbackName = String(participant?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return fallbackName ? `legacy-${fallbackName}` : '';
}

function getOrCreateVoiceRoomState(key) {
  const existing = voiceRooms.get(key);
  if (existing) return existing;
  const created = {
    sockets: new Map(),
    approvedSpeakerIds: new Set(),
    raisedHands: new Set(),
    liveSpeakerIds: new Set(),
    activeSpeakerId: '',
    activeSpeakerName: ''
  };
  voiceRooms.set(key, created);
  return created;
}

function getRoomParticipant(room, playerId = '', playerName = '') {
  if (!room || !Array.isArray(room.participants)) return null;
  return room.participants.find(participant => {
    if (!participant || typeof participant !== 'object') return false;
    if (playerId && getParticipantStableId(participant) === playerId) return true;
    return Boolean(playerName) && participant.name === playerName;
  }) || null;
}

function isRoomHostParticipant(room, playerId = '', playerName = '') {
  const participant = getRoomParticipant(room, playerId, playerName);
  if (!participant) return false;
  return participant.name === room?.host;
}

function isVoiceParticipantAllowed(room, voiceState, playerId = '', playerName = '') {
  if (!room) return false;
  const voiceSettings = getRoomVoiceSettings(room);
  if (voiceSettings.enabled !== true) return false;
  if (isRoomHostParticipant(room, playerId, playerName)) return true;
  const participant = getRoomParticipant(room, playerId, playerName);
  if (!participant?.id) return false;
  if (voiceSettings.focusParticipantId) {
    return participant.id === voiceSettings.focusParticipantId;
  }
  if (voiceSettings.participantMicPolicy === 'open') return true;
  if (voiceSettings.participantMicPolicy === 'host_only') return false;
  return voiceState.approvedSpeakerIds.has(participant.id);
}

function listVoiceMembers(voiceState, room = null) {
  const participantsById = new Map(
    Array.isArray(room?.participants)
      ? room.participants
        .map(participant => [getParticipantStableId(participant), participant])
        .filter(([participantId]) => participantId)
      : []
  );
  const byPlayerId = new Map();
  voiceState.sockets.forEach(member => {
    if (!member?.playerId) return;
    const participant = participantsById.get(member.playerId) || null;
    if (!byPlayerId.has(member.playerId)) {
      byPlayerId.set(member.playerId, {
        playerId: member.playerId,
        playerName: participant?.name || member.playerName || '',
        avatar: participant?.avatar || member.avatar || '',
        socketCount: 1
      });
      return;
    }
    const existing = byPlayerId.get(member.playerId);
    existing.socketCount += 1;
    if (!existing.playerName && (participant?.name || member.playerName)) existing.playerName = participant?.name || member.playerName;
    if (!existing.avatar && (participant?.avatar || member.avatar)) existing.avatar = participant?.avatar || member.avatar;
  });
  return Array.from(byPlayerId.values()).sort((a, b) => a.playerName.localeCompare(b.playerName));
}

function syncVoiceLiveSpeakerState(voiceState, room = null) {
  if (!voiceState) return;
  const roomSnapshot = room || null;
  voiceState.liveSpeakerIds.forEach(playerId => {
    if (!isVoiceParticipantAllowed(roomSnapshot, voiceState, playerId, '')) {
      voiceState.liveSpeakerIds.delete(playerId);
    }
  });
  if (voiceState.activeSpeakerId && voiceState.liveSpeakerIds.has(voiceState.activeSpeakerId)) {
    const activeParticipant = getRoomParticipant(roomSnapshot, voiceState.activeSpeakerId, voiceState.activeSpeakerName);
    voiceState.activeSpeakerName = activeParticipant?.name || voiceState.activeSpeakerName || '';
    return;
  }
  const nextLiveSpeakerId = Array.from(voiceState.liveSpeakerIds)[0] || '';
  if (!nextLiveSpeakerId) {
    voiceState.activeSpeakerId = '';
    voiceState.activeSpeakerName = '';
    return;
  }
  const nextParticipant = getRoomParticipant(roomSnapshot, nextLiveSpeakerId, '');
  voiceState.activeSpeakerId = nextLiveSpeakerId;
  voiceState.activeSpeakerName = nextParticipant?.name || voiceState.activeSpeakerName || '';
}

function pruneVoiceRoomState(key, room = null) {
  const voiceState = voiceRooms.get(key);
  if (!voiceState) return null;
  const roomSnapshot = room || getRoomSnapshot(key);
  const voiceSettings = getRoomVoiceSettings(roomSnapshot);
  const participantIds = new Set(
    Array.isArray(roomSnapshot?.participants)
      ? roomSnapshot.participants
        .map(participant => getParticipantStableId(participant))
        .filter(Boolean)
      : []
  );

  voiceState.sockets.forEach((member, socketId) => {
    if (!member?.playerId || participantIds.has(member.playerId)) return;
    voiceState.sockets.delete(socketId);
  });
  voiceState.approvedSpeakerIds.forEach(playerId => {
    if (!participantIds.has(playerId)) {
      voiceState.approvedSpeakerIds.delete(playerId);
    }
  });
  voiceState.raisedHands.forEach(playerId => {
    if (!participantIds.has(playerId)) {
      voiceState.raisedHands.delete(playerId);
    }
  });
  voiceState.liveSpeakerIds.forEach(playerId => {
    if (!participantIds.has(playerId)) {
      voiceState.liveSpeakerIds.delete(playerId);
    }
  });

  if (voiceSettings.enabled !== true) {
    voiceState.liveSpeakerIds.clear();
    voiceState.activeSpeakerId = '';
    voiceState.activeSpeakerName = '';
    voiceState.raisedHands.clear();
  } else {
    if (
      voiceSettings.focusParticipantId
      && !participantIds.has(voiceSettings.focusParticipantId)
    ) {
      voiceSettings.focusParticipantId = '';
    }
    syncVoiceLiveSpeakerState(voiceState, roomSnapshot);
  }

  if (!voiceState.sockets.size && !voiceState.approvedSpeakerIds.size && !voiceState.raisedHands.size && !voiceState.liveSpeakerIds.size) {
    voiceRooms.delete(key);
    return null;
  }
  return voiceState;
}

function buildVoiceStatePayload(key, room = null) {
  if (!isRoomKey(key)) return null;
  const roomSnapshot = room || getRoomSnapshot(key);
  const voiceState = pruneVoiceRoomState(key, roomSnapshot) || getOrCreateVoiceRoomState(key);
  const voiceSettings = getRoomVoiceSettings(roomSnapshot);
  const activeParticipant = getRoomParticipant(roomSnapshot, voiceState.activeSpeakerId, voiceState.activeSpeakerName);
  return {
    key,
    enabled: voiceSettings.enabled === true,
    participantMicPolicy: normalizeVoiceMicPolicy(voiceSettings.participantMicPolicy),
    hideBlockedMicControls: voiceSettings.hideBlockedMicControls !== false,
    transmissionMode: normalizeVoiceTransmissionMode(voiceSettings.transmissionMode),
    focusParticipantId: voiceSettings.focusParticipantId || '',
    approvedSpeakerIds: Array.from(voiceState.approvedSpeakerIds),
    raisedHands: Array.from(voiceState.raisedHands),
    liveSpeakerIds: Array.from(voiceState.liveSpeakerIds),
    activeSpeakerId: voiceState.activeSpeakerId || '',
    activeSpeakerName: activeParticipant?.name || voiceState.activeSpeakerName || '',
    members: listVoiceMembers(voiceState, roomSnapshot),
    updatedAt: Date.now()
  };
}

function emitVoiceState(key, room = null) {
  const payload = buildVoiceStatePayload(key, room);
  if (!payload) return;
  io.to(key).emit('voice:state', payload);
}

function getVoiceMemberForSocket(socket) {
  const key = socket?.data?.voiceKey;
  if (!key) return null;
  const voiceState = voiceRooms.get(key);
  return voiceState?.sockets.get(socket.id) || null;
}

function removeSocketFromVoiceRoom(socket, emitUpdate = true) {
  const key = socket?.data?.voiceKey;
  if (!isRoomKey(key)) return;
  const voiceState = voiceRooms.get(key);
  if (!voiceState) {
    socket.data.voiceKey = null;
    return;
  }
  const member = voiceState.sockets.get(socket.id);
  voiceState.sockets.delete(socket.id);
  if (member?.playerId) {
    const hasAnotherSocket = Array.from(voiceState.sockets.values()).some(entry => entry?.playerId === member.playerId);
    if (!hasAnotherSocket) {
      voiceState.liveSpeakerIds.delete(member.playerId);
      syncVoiceLiveSpeakerState(voiceState, getRoomSnapshot(key));
    }
  }
  socket.data.voiceKey = null;
  const pruned = pruneVoiceRoomState(key);
  if (emitUpdate && pruned) {
    emitVoiceState(key);
  }
}

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    config: feedbackState.config,
    collections: feedbackState.collections,
    ai: {
      serverKeyConfigured: Boolean(AI_API_KEY),
      provider: AI_PROVIDER,
      model: AI_MODEL,
      endpointConfigured: Boolean(AI_ENDPOINT)
    },
    storage: {
      configDatabaseConnected: Boolean(configDb)
    }
  });
});

app.get('/api/community/rooms', (_req, res) => {
  res.json({
    ok: true,
    rooms: listCommunityRooms()
  });
});

app.post('/api/dj/library/upload', express.raw({ type: () => true, limit: '30mb' }), (req, res) => {
  const roomCode = String(req.query?.roomCode || '').trim().toUpperCase();
  const roomKey = isRoomKey(`room:${roomCode}`) ? `room:${roomCode}` : '';
  const roomToken = String(req.header('x-room-token') || '').trim();
  const playerName = String(req.header('x-player-name') || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const rawFileName = sanitizeDjFileName(decodeURIComponent(String(req.header('x-file-name') || 'track').trim()));
  const fileName = rawFileName || 'track';
  const contentType = String(req.header('content-type') || 'application/octet-stream').trim().toLowerCase();
  const room = roomKey ? getRoomSnapshot(roomKey) : null;

  if (!roomKey || !room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }
  if (!isAuthorizedForRoom(roomKey, roomToken)) {
    res.status(401).json({ ok: false, error: 'Unauthorized room access.' });
    return;
  }
  if (!playerName || room.host !== playerName) {
    res.status(403).json({ ok: false, error: 'Only the host can upload DJ tracks.' });
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ ok: false, error: 'Audio file is required.' });
    return;
  }
  if (!isAllowedDjUpload(contentType, fileName)) {
    res.status(400).json({ ok: false, error: 'Unsupported audio format. Use mp3, wav, m4a, ogg, or webm audio.' });
    return;
  }

  try {
    ensureRuntimeDir(DJ_UPLOAD_DIR);
    const extension = getDjUploadExtension(fileName, contentType);
    const trackId = `dj_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storageKey = `${trackId}${extension}`;
    const filePath = path.join(DJ_UPLOAD_DIR, storageKey);
    fs.writeFileSync(filePath, req.body);
    res.json({
      ok: true,
      track: normalizeDjLibraryTrack({
        id: trackId,
        name: fileName.replace(/\.[^.]+$/, '') || fileName,
        url: `/media/dj/${storageKey}`,
        storageKey,
        contentType,
        size: req.body.length,
        uploadedAt: nowIso(),
        uploadedBy: playerName
      })
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: `Upload failed: ${error.message}` });
  }
});

app.delete('/api/dj/library/:trackId', (req, res) => {
  const roomCode = String(req.query?.roomCode || '').trim().toUpperCase();
  const roomKey = isRoomKey(`room:${roomCode}`) ? `room:${roomCode}` : '';
  const roomToken = String(req.header('x-room-token') || '').trim();
  const playerName = String(req.header('x-player-name') || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const room = roomKey ? getRoomSnapshot(roomKey) : null;
  const trackId = String(req.params?.trackId || '').trim();

  if (!roomKey || !room) {
    res.status(404).json({ ok: false, error: 'Room not found.' });
    return;
  }
  if (!isAuthorizedForRoom(roomKey, roomToken)) {
    res.status(401).json({ ok: false, error: 'Unauthorized room access.' });
    return;
  }
  if (!playerName || room.host !== playerName) {
    res.status(403).json({ ok: false, error: 'Only the host can remove DJ tracks.' });
    return;
  }

  const activityState = room.activityState && typeof room.activityState === 'object' ? room.activityState : {};
  const library = Array.isArray(activityState.trackLibrary) ? activityState.trackLibrary : [];
  const match = library
    .map((item, idx) => normalizeDjLibraryTrack(item, idx))
    .find(item => item?.id === trackId);

  if (!match) {
    res.status(404).json({ ok: false, error: 'Track not found.' });
    return;
  }

  try {
    if (match.storageKey) {
      const filePath = path.join(DJ_UPLOAD_DIR, path.basename(match.storageKey));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: `Unable to remove track: ${error.message}` });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  if (!AI_API_KEY) {
    res.status(503).json({ ok: false, error: 'AI server key is not configured. Set AI_API_KEY or the legacy CHAT_GPT_MINI_KEY.' });
    return;
  }

  const roomCode = String(req.body?.roomCode || '').trim().toUpperCase();
  const roomKey = isRoomKey(`room:${roomCode}`) ? `room:${roomCode}` : '';
  const adminToken = String(req.header('x-admin-token') || '').trim();
  const roomToken = String(req.header('x-room-token') || '').trim();
  const isAdminRequest = isValidAdminToken(adminToken, req);
  const isRoomAuthorized = roomKey ? isAuthorizedForRoom(roomKey, roomToken) : false;
  if (!isAdminRequest && !isRoomAuthorized) {
    res.status(401).json({ ok: false, error: 'Unauthorized AI request.' });
    return;
  }

  const prompt = String(req.body?.prompt || '').trim();
  const provider = normalizeAIProvider(req.body?.provider || AI_PROVIDER);
  const model = String(req.body?.model || AI_MODEL).trim() || AI_MODEL;
  const temperatureRaw = Number(req.body?.temperature);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2, temperatureRaw)) : 0.7;

  if (!prompt) {
    res.status(400).json({ ok: false, error: 'Prompt is required.' });
    return;
  }

  try {
    const requestConfig = buildAIProviderRequest({
      provider,
      endpoint: AI_ENDPOINT,
      apiKey: AI_API_KEY,
      model,
      prompt,
      temperature
    });
    const response = await fetch(requestConfig.endpoint, {
      method: 'POST',
      headers: requestConfig.headers,
      body: JSON.stringify(requestConfig.body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = extractAIErrorDetail(provider, data, response);
      res.status(502).json({ ok: false, error: `AI provider error: ${detail}` });
      return;
    }

    const content = extractAITextContent(provider, data);
    if (!content) {
      res.status(502).json({ ok: false, error: 'AI provider returned empty content.' });
      return;
    }

    res.json({ ok: true, content });
  } catch (error) {
    res.status(502).json({ ok: false, error: `AI request failed: ${error.message}` });
  }
});

app.post('/api/feedback', (req, res) => {
  const userToken = getUserToken(req);
  if (!userToken) {
    res.status(400).json({ ok: false, error: 'Missing user token' });
    return;
  }

  const type = String(req.body?.type || 'idea').trim().toLowerCase();
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const details = String(req.body?.details || '').trim().slice(0, 2000);
  const userName = String(req.body?.userName || 'Anonymous').trim().slice(0, 64);
  const userId = String(req.body?.userId || '').trim().slice(0, 64);

  if (!title || !details) {
    res.status(400).json({ ok: false, error: 'Title and details are required' });
    return;
  }

  const feedback = {
    id: createFeedbackId(),
    userToken,
    userId,
    userName,
    type: ['ui', 'idea', 'bug', 'general'].includes(type) ? type : 'general',
    title,
    details,
    status: 'open',
    adminNotes: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    resolvedAt: null
  };

  feedbackState.feedback.unshift(feedback);
  scheduleFeedbackPersist();

  res.json({ ok: true, feedback });
});

app.get('/api/feedback/mine', (req, res) => {
  const userToken = getUserToken(req);
  if (!userToken) {
    res.status(400).json({ ok: false, error: 'Missing user token' });
    return;
  }

  const mine = feedbackState.feedback.filter(item => item.userToken === userToken);
  res.json({ ok: true, feedback: mine });
});

app.get('/api/community/host-access-request/mine', (req, res) => {
  const userToken = getUserToken(req);
  if (!userToken) {
    res.status(400).json({ ok: false, error: 'Missing user token' });
    return;
  }
  const requests = normalizeCommunityHostRequests(feedbackState.communityHostRequests)
    .filter(item => item.userToken === userToken);
  res.json({ ok: true, requests });
});

app.post('/api/community/host-access-request', (req, res) => {
  const userToken = getUserToken(req);
  if (!userToken) {
    res.status(400).json({ ok: false, error: 'Missing user token' });
    return;
  }
  const userName = String(req.body?.userName || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const userId = String(req.body?.userId || '').trim().slice(0, 64);
  const reason = String(req.body?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!userName) {
    res.status(400).json({ ok: false, error: 'Your player name is required.' });
    return;
  }
  if (!reason) {
    res.status(400).json({ ok: false, error: 'Please include a short reason for access.' });
    return;
  }

  const allowlist = normalizePreferences(feedbackState.config.preferences).communityHostAllowlist || [];
  if (allowlist.includes(userName)) {
    res.json({
      ok: true,
      request: normalizeCommunityHostRequest({
        id: `community-host-access-approved-${userName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        userToken,
        userId,
        userName,
        reason,
        status: 'approved',
        adminNotes: 'Already approved through the community host allowlist.',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        resolvedAt: nowIso()
      })
    });
    return;
  }

  const existingPending = feedbackState.communityHostRequests.find(item => item.userToken === userToken && item.status === 'pending');
  if (existingPending) {
    existingPending.userId = userId || existingPending.userId;
    existingPending.userName = userName;
    existingPending.reason = reason;
    existingPending.updatedAt = nowIso();
    scheduleFeedbackPersist();
    res.json({ ok: true, request: existingPending });
    return;
  }

  const request = normalizeCommunityHostRequest({
    id: createFeedbackId(),
    userToken,
    userId,
    userName,
    reason,
    status: 'pending',
    adminNotes: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    resolvedAt: null
  });
  feedbackState.communityHostRequests.unshift(request);
  feedbackState.communityHostRequests = normalizeCommunityHostRequests(feedbackState.communityHostRequests);
  scheduleFeedbackPersist();
  res.json({ ok: true, request });
});

app.post('/api/admin/login', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/admin/feedback', requireAdmin, (_req, res) => {
  res.json({ ok: true, feedback: feedbackState.feedback });
});

app.patch('/api/admin/feedback/:id', requireAdmin, (req, res) => {
  const item = feedbackState.feedback.find(f => f.id === req.params.id);
  if (!item) {
    res.status(404).json({ ok: false, error: 'Feedback not found' });
    return;
  }

  const status = String(req.body?.status || item.status).trim().toLowerCase();
  const adminNotes = String(req.body?.adminNotes ?? item.adminNotes).slice(0, 2000);
  if (!['open', 'in_review', 'resolved'].includes(status)) {
    res.status(400).json({ ok: false, error: 'Invalid status' });
    return;
  }

  item.status = status;
  item.adminNotes = adminNotes;
  item.updatedAt = nowIso();
  item.resolvedAt = status === 'resolved' ? nowIso() : null;
  scheduleFeedbackPersist();

  res.json({ ok: true, feedback: item });
});

app.get('/api/admin/config', requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    config: feedbackState.config,
    collections: feedbackState.collections,
    communityHostRequests: feedbackState.communityHostRequests,
    storage: {
      configDatabaseConnected: Boolean(configDb)
    }
  });
});

app.put('/api/admin/config', requireAdmin, async (req, res) => {
  const branding = req.body?.branding || {};
  const preferences = req.body?.preferences || {};
  const collections = normalizeCollections(req.body?.collections || feedbackState.collections);

  const appName = String(branding.appName ?? feedbackState.config.branding.appName).trim().slice(0, 64);
  const tagline = String(branding.tagline ?? feedbackState.config.branding.tagline).trim().slice(0, 140);
  const accent = String(branding.accent ?? feedbackState.config.branding.accent).trim();
  const normalizedAccent = isValidHexColor(accent) ? accent : feedbackState.config.branding.accent;

  feedbackState.config.branding = {
    appName: appName || feedbackState.config.branding.appName,
    tagline: tagline || feedbackState.config.branding.tagline,
    accent: normalizedAccent
  };

  feedbackState.config.preferences = {
    ...normalizePreferences(feedbackState.config.preferences),
    ...normalizePreferences({
      ...feedbackState.config.preferences,
      ...preferences,
      enabledActivities: preferences.enabledActivities ?? feedbackState.config.preferences.enabledActivities
    })
  };
  feedbackState.collections = collections;

  scheduleFeedbackPersist();
  await persistConfigToDatabase();
  res.json({
    ok: true,
    config: feedbackState.config,
    collections: feedbackState.collections,
    communityHostRequests: feedbackState.communityHostRequests
  });
});

app.patch('/api/admin/community-host-requests/:id', requireAdmin, async (req, res) => {
  const request = feedbackState.communityHostRequests.find(item => item.id === req.params.id);
  if (!request) {
    res.status(404).json({ ok: false, error: 'Community host request not found' });
    return;
  }
  const status = String(req.body?.status || request.status).trim().toLowerCase();
  const adminNotes = String(req.body?.adminNotes ?? request.adminNotes).trim().slice(0, 400);
  if (!['pending', 'approved', 'denied'].includes(status)) {
    res.status(400).json({ ok: false, error: 'Invalid request status' });
    return;
  }

  request.status = status;
  request.adminNotes = adminNotes;
  request.updatedAt = nowIso();
  request.resolvedAt = status === 'pending' ? null : nowIso();

  if (status === 'approved') {
    const preferences = normalizePreferences(feedbackState.config.preferences);
    const userName = String(request.userName || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (!userName) {
      res.status(400).json({ ok: false, error: 'Approved request must include a valid user name' });
      return;
    }
    feedbackState.config.preferences = {
      ...preferences,
      communityHostAllowlist: Array.from(new Set([...(preferences.communityHostAllowlist || []), userName]))
    };
  }

  feedbackState.communityHostRequests = normalizeCommunityHostRequests(feedbackState.communityHostRequests);
  scheduleFeedbackPersist();
  await persistConfigToDatabase();
  res.json({
    ok: true,
    request,
    config: feedbackState.config,
    communityHostRequests: feedbackState.communityHostRequests
  });
});

io.on('connection', socket => {
  socket.on('room:subscribe', payload => {
    const key = typeof payload === 'string' ? payload : payload?.key;
    const authToken = getRequestRoomToken(payload);
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, authToken)) return;
    socket.join(key);
  });

  socket.on('room:unsubscribe', payload => {
    const key = typeof payload === 'string' ? payload : payload?.key;
    if (!isRoomKey(key)) return;
    if (socket.data.voiceKey === key) {
      removeSocketFromVoiceRoom(socket);
    }
    socket.leave(key);
  });

  socket.on('shared:get', (payload, ack) => {
    const key = payload?.key;
    const authToken = getRequestRoomToken(payload);
    if (!isRoomKey(key)) {
      ack?.({ ok: false, error: 'Invalid room key' });
      return;
    }
    if (!isAuthorizedForRoom(key, authToken)) {
      ack?.({ ok: false, error: 'Unauthorized room access' });
      return;
    }
    const value = state.get(key) || null;
    ack?.({ ok: true, value });
  });

  socket.on('shared:set', (payload, ack) => {
    const key = payload?.key;
    const value = payload?.value;
    const authToken = getRequestRoomToken(payload);
    if (!isRoomKey(key)) {
      ack?.({ ok: false, error: 'Invalid room key' });
      return;
    }
    const strValue = String(value ?? '');
    if (strValue.length > 20000) {
      ack?.({ ok: false, error: 'Payload too large' });
      return;
    }

    const desiredPrivateSession = extractRoomPrivacyFromValue(strValue);
    if (!ensureRoomAccess(key, authToken, desiredPrivateSession)) {
      ack?.({ ok: false, error: 'Unauthorized room write' });
      return;
    }

    state.set(key, strValue);
    schedulePersist();
    io.to(key).emit('shared:update', { key, value: state.get(key) });
    emitVoiceState(key, safeParseJsonObject(strValue));
    ack?.({ ok: true });
  });

  socket.on('shared:delete', (payload, ack) => {
    const key = payload?.key;
    const authToken = getRequestRoomToken(payload);
    if (!isRoomKey(key)) {
      ack?.({ ok: false, error: 'Invalid room key' });
      return;
    }
    if (!isAuthorizedForRoom(key, authToken)) {
      ack?.({ ok: false, error: 'Unauthorized room access' });
      return;
    }
    const deleted = deleteRoomState(key);
    io.to(key).emit('shared:update', { key, value: null });
    io.in(key).socketsLeave(key);
    ack?.({ ok: deleted });
  });

  socket.on('voice:join', (payload, ack) => {
    const key = payload?.key;
    const authToken = getRequestRoomToken(payload);
    const playerId = String(payload?.playerId || '').trim();
    const playerName = String(payload?.playerName || '').trim();
    const avatar = String(payload?.avatar || '').trim();
    if (!isRoomKey(key)) {
      ack?.({ ok: false, error: 'Invalid room key' });
      return;
    }
    if (!isAuthorizedForRoom(key, authToken)) {
      ack?.({ ok: false, error: 'Unauthorized room access' });
      return;
    }
    const room = getRoomSnapshot(key);
    const participant = getRoomParticipant(room, playerId, playerName);
    const participantId = getParticipantStableId(participant);
    if (!participantId) {
      ack?.({ ok: false, error: 'Player is not in this room' });
      return;
    }

    if (socket.data.voiceKey && socket.data.voiceKey !== key) {
      removeSocketFromVoiceRoom(socket);
    }
    socket.join(key);
    socket.data.voiceKey = key;
    const voiceState = getOrCreateVoiceRoomState(key);
    voiceState.sockets.set(socket.id, {
      playerId: participantId,
      playerName: participant.name || playerName,
      avatar: participant.avatar || avatar
    });
    pruneVoiceRoomState(key, room);
    emitVoiceState(key, room);
    ack?.({ ok: true, state: buildVoiceStatePayload(key, room) });
  });

  socket.on('voice:leave', (_payload, ack) => {
    removeSocketFromVoiceRoom(socket);
    ack?.({ ok: true });
  });

  socket.on('voice:request-talk', (_payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const room = getRoomSnapshot(key);
    if (!isRoomKey(key) || !member?.playerId || !room) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    if (!isVoiceParticipantAllowed(room, voiceState, member.playerId, member.playerName)) {
      voiceState.raisedHands.add(member.playerId);
    }
    emitVoiceState(key, room);
    ack?.({ ok: true });
  });

  socket.on('voice:toggle-hand', (payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const room = getRoomSnapshot(key);
    if (!isRoomKey(key) || !member?.playerId || !room) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    const isHost = isRoomHostParticipant(room, member.playerId, member.playerName);
    const requestedTargetId = String(payload?.targetPlayerId || '').trim();
    const targetPlayerId = isHost && requestedTargetId ? requestedTargetId : member.playerId;
    if (!targetPlayerId) {
      ack?.({ ok: false, error: 'Participant not found' });
      return;
    }
    const targetParticipant = getRoomParticipant(room, targetPlayerId, '');
    if (!targetParticipant && targetPlayerId !== member.playerId) {
      ack?.({ ok: false, error: 'Participant not found' });
      return;
    }
    if (!isHost && targetPlayerId !== member.playerId) {
      ack?.({ ok: false, error: 'Only host can change another participant hand state' });
      return;
    }
    if (!isHost && targetPlayerId === member.playerId && isRoomHostParticipant(room, targetPlayerId, member.playerName)) {
      ack?.({ ok: false, error: 'Host does not use raise hand' });
      return;
    }
    const requestedRaised = payload?.raised;
    const shouldRaise = typeof requestedRaised === 'boolean'
      ? requestedRaised
      : !voiceState.raisedHands.has(targetPlayerId);
    if (shouldRaise) {
      voiceState.raisedHands.add(targetPlayerId);
    } else {
      voiceState.raisedHands.delete(targetPlayerId);
    }
    emitVoiceState(key, room);
    ack?.({ ok: true, raised: shouldRaise });
  });

  socket.on('voice:grant-talk', (payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const room = getRoomSnapshot(key);
    const targetPlayerId = String(payload?.targetPlayerId || '').trim();
    if (!isRoomKey(key) || !member?.playerId || !room || !targetPlayerId) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    if (!isRoomHostParticipant(room, member.playerId, member.playerName)) {
      ack?.({ ok: false, error: 'Only host can grant talk access' });
      return;
    }
    const targetParticipant = getRoomParticipant(room, targetPlayerId, '');
    const targetParticipantId = getParticipantStableId(targetParticipant);
    if (!targetParticipantId) {
      ack?.({ ok: false, error: 'Participant not found' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    voiceState.approvedSpeakerIds.add(targetParticipantId);
    voiceState.raisedHands.delete(targetParticipantId);
    emitVoiceState(key, room);
    ack?.({ ok: true });
  });

  socket.on('voice:revoke-talk', (payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const room = getRoomSnapshot(key);
    const targetPlayerId = String(payload?.targetPlayerId || '').trim();
    if (!isRoomKey(key) || !member?.playerId || !room || !targetPlayerId) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    if (!isRoomHostParticipant(room, member.playerId, member.playerName)) {
      ack?.({ ok: false, error: 'Only host can revoke talk access' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    voiceState.approvedSpeakerIds.delete(targetPlayerId);
    voiceState.raisedHands.delete(targetPlayerId);
    voiceState.liveSpeakerIds.delete(targetPlayerId);
    syncVoiceLiveSpeakerState(voiceState, room);
    emitVoiceState(key, room);
    ack?.({ ok: true });
  });

  socket.on('voice:force-stop', (payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const room = getRoomSnapshot(key);
    const targetPlayerId = String(payload?.targetPlayerId || '').trim();
    if (!isRoomKey(key) || !member?.playerId || !room || !targetPlayerId) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    if (!isRoomHostParticipant(room, member.playerId, member.playerName)) {
      ack?.({ ok: false, error: 'Only host can stop the speaker' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    if (voiceState.liveSpeakerIds.has(targetPlayerId)) {
      voiceState.liveSpeakerIds.delete(targetPlayerId);
      syncVoiceLiveSpeakerState(voiceState, room);
      emitVoiceState(key, room);
    }
    ack?.({ ok: true });
  });

  socket.on('voice:ptt:start', (_payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const room = getRoomSnapshot(key);
    if (!isRoomKey(key) || !member?.playerId || !room) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    if (!isVoiceParticipantAllowed(room, voiceState, member.playerId, member.playerName)) {
      ack?.({ ok: false, error: 'Host has not allowed you to speak' });
      return;
    }
    const voiceSettings = getRoomVoiceSettings(room);
    if (
      voiceSettings.transmissionMode !== 'open'
      && voiceState.liveSpeakerIds.size
      && !voiceState.liveSpeakerIds.has(member.playerId)
    ) {
      ack?.({ ok: false, error: 'Another speaker is live' });
      return;
    }
    voiceState.liveSpeakerIds.add(member.playerId);
    voiceState.activeSpeakerId = member.playerId;
    voiceState.activeSpeakerName = member.playerName || '';
    voiceState.raisedHands.delete(member.playerId);
    emitVoiceState(key, room);
    ack?.({ ok: true });
  });

  socket.on('voice:ptt:stop', (_payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    if (!isRoomKey(key) || !member?.playerId) {
      ack?.({ ok: false, error: 'Voice session unavailable' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    if (voiceState.liveSpeakerIds.has(member.playerId)) {
      voiceState.liveSpeakerIds.delete(member.playerId);
      syncVoiceLiveSpeakerState(voiceState, getRoomSnapshot(key));
      emitVoiceState(key);
    }
    ack?.({ ok: true });
  });

  socket.on('voice:signal', (payload, ack) => {
    const key = socket.data.voiceKey;
    const member = getVoiceMemberForSocket(socket);
    const targetPlayerId = String(payload?.targetPlayerId || '').trim();
    const signal = payload?.signal;
    if (!isRoomKey(key) || !member?.playerId || !targetPlayerId || !signal || typeof signal !== 'object') {
      ack?.({ ok: false, error: 'Invalid voice signal payload' });
      return;
    }
    const voiceState = getOrCreateVoiceRoomState(key);
    let delivered = 0;
    voiceState.sockets.forEach((targetMember, targetSocketId) => {
      if (targetMember?.playerId !== targetPlayerId) return;
      io.to(targetSocketId).emit('voice:signal', {
        key,
        fromPlayerId: member.playerId,
        fromPlayerName: member.playerName || '',
        signal
      });
      delivered += 1;
    });
    ack?.({ ok: delivered > 0, error: delivered > 0 ? undefined : 'Target is offline' });
  });

  socket.on('disconnect', () => {
    removeSocketFromVoiceRoom(socket);
  });
});

loadStateFromDisk();
loadFeedbackStateFromDisk();
loadRoomMetaFromDisk();
Promise.resolve()
  .then(() => initializeConfigDatabase())
  .then(() => loadConfigFromDatabase())
  .finally(() => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Team Builder realtime server listening on http://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`Environment: NODE_ENV=${process.env.NODE_ENV || 'undefined'} ADMIN_TOKEN=${maskConfiguredSecret(getAdminToken())}`);
      if (configDb) {
        // eslint-disable-next-line no-console
        console.log('Global config storage: PostgreSQL');
      } else {
        // eslint-disable-next-line no-console
        console.log('Global config storage: Local file');
      }
    });
  });

process.on('SIGINT', () => {
  if (persistTimer) clearTimeout(persistTimer);
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  if (roomMetaPersistTimer) clearTimeout(roomMetaPersistTimer);
  persistStateToDisk();
  persistFeedbackStateToDisk();
  persistRoomMetaToDisk();
  if (configDb) {
    configDb.end().catch(() => {});
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (persistTimer) clearTimeout(persistTimer);
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  if (roomMetaPersistTimer) clearTimeout(roomMetaPersistTimer);
  persistStateToDisk();
  persistFeedbackStateToDisk();
  persistRoomMetaToDisk();
  if (configDb) {
    configDb.end().catch(() => {});
  }
  process.exit(0);
});
