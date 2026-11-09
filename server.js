const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Character = require('./assets/js/character-core');
const normalizeCharacter = value => value && typeof value === 'object' && !Array.isArray(value) ? Character.normalize(value) : null;
const CommunityPlaza = require('./assets/js/community-plaza-core');
const Checkers = require('./assets/js/games/checkers-core');
const ChineseCheckers = require('./assets/js/games/chinese-checkers-core');
const FamilyFaceOff = require('./assets/js/games/family-face-off-core');
const { validateSurveyQuestions } = require('./assets/js/theme-content-core');
const familyFaceOffTimers = new Map();
const SpinWheel = require('./assets/js/games/spin-wheel-core');
const spinWheelTimers = new Map();
const ChineseCheckersAI = require('./assets/js/games/chinese-checkers-ai');
const chineseCheckersTimers = new Map();
const Memory = require('./assets/js/games/memory-core');
const memoryTimers = new Map();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { openConfigDatabase } = require('./lib/config-database');

const app = express();
const server = http.createServer(app);
const configuredSocketOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    // Same-origin deployments do not need CORS. When a split frontend is
    // configured, allow only the explicitly listed origins.
    origin: String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
      ? (configuredSocketOrigins.length ? configuredSocketOrigins : false)
      : '*'
  },
  maxHttpBufferSize: 300000
});

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const state = new Map();
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(String(process.env.DATA_DIR))
  : path.join(__dirname, '.runtime-data');
const DATA_FILE = path.join(DATA_DIR, 'shared-state.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback-state.json');
const ROOM_META_FILE = path.join(DATA_DIR, 'room-meta.json');
const DJ_UPLOAD_DIR = path.join(DATA_DIR, 'dj-library');
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
  'presentation',
  'slides-studio',
  'dj-booth',
  'survey-clash',
  'battleship',
  'bingo',
  'backgammon',
  'connect-4',
  'checkers',
  'chinese-checkers',
  'memory',
  'rock-paper-scissors',
  'chess-lobby',
  'cosmos-bound'
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
  'enableMessageBoard',
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
const SESSION_TTL_MINUTES = 242;
const SESSION_TTL_MS = SESSION_TTL_MINUTES * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
const SHARED_STATE_MAX_BYTES = 250000;
const DJ_ROOM_MAX_BYTES = 200 * 1024 * 1024;
const DJ_ROOM_MAX_TRACKS = 48;
let sessionCleanupInterval = null;


function getAdminToken() {
  return String(process.env.ADMIN_TOKEN || '').trim();
}

function getAdminTempPassword() {
  return String(process.env.ADMIN_TEMP_PASSWORD || '').trim();
}

function getDevAdminPassword() {
  if (IS_PRODUCTION) return '';
  return String(process.env.DEV_ADMIN_PASSWORD || getAdminTempPassword() || '').trim();
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
    'survey-clash',
    'bingo',
    'chess-lobby',
    'checkers',
    'chinese-checkers',
    'memory'
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
    enableMessageBoard: true,
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
  const accentAltRaw = String(existingBranding.accentAlt || '').trim();
  const bgColorRaw = String(existingBranding.bgColor || '').trim();
  const validThemes = new Set(['default', 'servicenow']);
  const colorThemeRaw = String(existingBranding.colorTheme || 'default').trim().toLowerCase();
  return {
    branding: {
      appName,
      tagline,
      accent: isValidHexColor(accentRaw) ? accentRaw : '#00d2d3',
      accentAlt: isValidHexColor(accentAltRaw) ? accentAltRaw : '',
      bgColor: isValidHexColor(bgColorRaw) ? bgColorRaw : '',
      colorTheme: validThemes.has(colorThemeRaw) ? colorThemeRaw : 'default'
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
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.youtube.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      frameSrc: ['https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));

// Security: Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/sounds', express.static(path.join(__dirname, 'Sounds')));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.floor(process.uptime()) });
});

function sendFrontendFile(filename) {
  return (_req, res) => {
    res.sendFile(path.join(__dirname, filename));
  };
}

app.get('/', sendFrontendFile('index.html'));
app.get('/index.html', sendFrontendFile('index.html'));
app.get('/survey-clash.html', sendFrontendFile('survey-clash.html'));
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
        privateSession,
        actorTokens: normalizeActorTokens(meta?.actorTokens),
        memory: Memory.normalizeSecret(meta?.memory)
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
        privateSession: meta.privateSession === true,
        actorTokens: normalizeActorTokens(meta.actorTokens),
        memory: Memory.normalizeSecret(meta.memory)
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
  try { configDb = await openConfigDatabase(); }
  catch (error) {
    console.error(`Failed to initialize config database (${error.code || 'CONFIGURATION_ERROR'}). Using local file config storage.`);
    configDb = null;
  }
}

async function loadConfigFromDatabase() {
  if (!configDb) return;
  try {
    const stored = await configDb.load(GLOBAL_CONFIG_DB_KEY);
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
    await configDb.save(GLOBAL_CONFIG_DB_KEY, value);
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

function isValidActorToken(token) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(String(token || '').trim());
}

function normalizeActorTokens(rawTokens) {
  if (!rawTokens || typeof rawTokens !== 'object' || Array.isArray(rawTokens)) return {};
  return Object.fromEntries(Object.entries(rawTokens)
    .map(([playerId, token]) => [String(playerId || '').trim().slice(0, 64), String(token || '').trim()])
    .filter(([playerId, token]) => playerId && isValidActorToken(token))
    .slice(0, 100));
}

function safeTokenEqual(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected || ''));
  const providedBuffer = Buffer.from(String(provided || ''));
  return expectedBuffer.length > 0
    && expectedBuffer.length === providedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
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
  const token = String(req.header('x-user-token') || '').trim();
  return /^u_[A-Za-z0-9_-]{12,126}$/.test(token) ? token : '';
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

function hasExpectedMediaSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const firstFour = buffer.subarray(0, 4).toString('ascii');
  if (extension === '.mp3') {
    return buffer.subarray(0, 3).toString('ascii') === 'ID3'
      || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (extension === '.wav') return firstFour === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
  if (extension === '.ogg') return firstFour === 'OggS';
  if (extension === '.webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === '.m4a' || extension === '.aac') {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp'
      || (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0);
  }
  return false;
}

function getDjRoomDiskUsage(roomCode) {
  if (!fs.existsSync(DJ_UPLOAD_DIR)) return { bytes: 0, files: 0 };
  const prefix = `${roomCode}_`;
  return fs.readdirSync(DJ_UPLOAD_DIR).reduce((usage, fileName) => {
    if (!fileName.startsWith(prefix)) return usage;
    try {
      const stats = fs.statSync(path.join(DJ_UPLOAD_DIR, fileName));
      if (stats.isFile()) {
        usage.bytes += stats.size;
        usage.files += 1;
      }
    } catch (_error) {
      // A concurrent removal is harmless.
    }
    return usage;
  }, { bytes: 0, files: 0 });
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
  if (!req) return false;
  const rawHost = String(req.hostname || req.header('host') || '').trim().toLowerCase();
  const host = rawHost.replace(/:\d+$/, '');
  const remoteAddress = String(req.ip || req.socket?.remoteAddress || '').trim().replace(/^::ffff:/, '');
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  const isLoopbackIp = remoteAddress === '127.0.0.1' || remoteAddress === '::1';
  return !IS_PRODUCTION && (isLoopbackHost || isLoopbackIp);
}

function isValidAdminToken(token, req) {
  const normalizedToken = String(token || '').trim();
  const adminToken = getAdminToken();
  const devAdminPassword = getDevAdminPassword();
  if (!normalizedToken) return false;
  if (adminToken && safeTokenEqual(adminToken, normalizedToken)) return true;
  if (devAdminPassword && safeTokenEqual(devAdminPassword, normalizedToken) && !IS_PRODUCTION && isLocalDevRequest(req)) return true;
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

function getRoomParticipantCount(room) {
  if (!room || !Array.isArray(room.participants)) return 0;
  return room.participants.filter(participant => participant && typeof participant === 'object' && String(participant.name || '').trim()).length;
}

function getRoomLastActivityAt(key, room) {
  const metaCreatedAt = Number(roomSecrets.get(key)?.createdAt) || 0;
  return Math.max(
    Number(room?.lastUpdate) || 0,
    Number(room?.created) || 0,
    metaCreatedAt,
    0
  );
}

function isClosedRoomState(room) {
  if (!room || typeof room !== 'object') return true;
  const participantCount = getRoomParticipantCount(room);
  const hasHost = Boolean(String(room.host || '').trim());
  const hasActivity = Boolean(String(room.currentActivity || '').trim());
  return participantCount === 0 && !hasHost && !hasActivity;
}

function getRoomCleanupReason(key, room, now = Date.now()) {
  if (!room || typeof room !== 'object') return 'malformed';
  if (isClosedRoomState(room)) return 'closed';
  const lastActivityAt = getRoomLastActivityAt(key, room);
  if (!lastActivityAt) return 'stale_missing_timestamp';
  if (now - lastActivityAt >= SESSION_TTL_MS) return 'expired';
  return '';
}

function formatTimestamp(value) {
  const numeric = Number(value) || 0;
  return numeric ? new Date(numeric).toISOString() : null;
}

function getAdminRoomSummary(key, room, now = Date.now()) {
  if (!isRoomKey(key) || !room || typeof room !== 'object') return null;
  const participants = Array.isArray(room.participants)
    ? room.participants.filter(participant => participant && typeof participant === 'object' && String(participant.name || '').trim())
    : [];
  const roomType = String(room.roomType || '').trim().toLowerCase() === 'community' ? 'community' : 'private';
  const participantCount = participants.length;
  const maxParticipants = Math.max(2, Number(room.maxParticipants) || 24);
  const currentActivity = String(room.currentActivity || '').trim() || null;
  const lastActivityAt = getRoomLastActivityAt(key, room);
  const cleanupReason = getRoomCleanupReason(key, room, now);
  const isClosed = isClosedRoomState(room);
  const isExpired = cleanupReason === 'expired';
  const isAbandoned = isClosed || isExpired;
  return {
    key,
    code: String(room.code || key.replace(/^room:/, '')).trim(),
    roomType,
    title: roomType === 'community'
      ? String(room.communityTitle || `${room.host || 'Host'}'s Community Lobby`).trim().slice(0, 80)
      : String(room.title || room.sessionTitle || `${room.host || 'Host'}'s Session`).trim().slice(0, 80),
    host: String(room.host || '').trim(),
    participantCount,
    maxParticipants,
    participants: participants.map(participant => ({
      id: String(participant.id || '').trim().slice(0, 64),
      name: String(participant.name || '').trim().slice(0, 32),
      isHost: participant.name === room.host
    })),
    currentActivity,
    privateSession: room?.access?.privateSession === true || room?.hostSettings?.privateSession === true,
    createdAt: formatTimestamp(room.created),
    lastActivityAt: formatTimestamp(lastActivityAt),
    expiresAt: lastActivityAt ? formatTimestamp(lastActivityAt + SESSION_TTL_MS) : null,
    cleanupReason: cleanupReason || null,
    isClosed,
    isAbandoned
  };
}

function listAdminRooms() {
  const now = Date.now();
  return Array.from(state.entries())
    .map(([key, value]) => getAdminRoomSummary(key, safeParseJsonObject(value), now))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isAbandoned !== b.isAbandoned) return a.isAbandoned ? -1 : 1;
      return (Number(new Date(b.lastActivityAt || 0)) || 0) - (Number(new Date(a.lastActivityAt || 0)) || 0);
    });
}

function getCommunityRoomSummary(key, room) {
  if (!isRoomKey(key) || !room || typeof room !== 'object') return null;
  const roomType = String(room.roomType || '').trim().toLowerCase();
  const isPrivate = room?.access?.privateSession === true || room?.hostSettings?.privateSession === true;
  if (roomType !== 'community' || isPrivate || getRoomCleanupReason(key, room)) return null;
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
    avatarPreview: participants.slice(0, 6).map(participant => ({
      seed: CommunityPlaza.seedFor(String(room.code || key.replace(/^room:/, '')), participant.id || participant.name),
      avatar: String(participant.avatar || '👤').replace(/[<>]/g, '').slice(0, 8),
      isHost: participant.name === room.host,
      character: normalizeCharacter(participant.character)
    })),
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
  clearFamilyFaceOffTimer(key);
  clearSpinWheelTimer(key);
  clearChineseCheckersTimer(key);
  clearMemoryTimer(key);
  if (!isRoomKey(key)) return false;
  const room = getRoomSnapshot(key);
  const library = Array.isArray(room?.activityState?.trackLibrary) ? room.activityState.trackLibrary : [];
  library.forEach((track, idx) => {
    const normalized = normalizeDjLibraryTrack(track, idx);
    if (!normalized?.storageKey) return;
    const filePath = path.join(DJ_UPLOAD_DIR, path.basename(normalized.storageKey));
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`Failed to remove DJ upload ${normalized.storageKey}:`, error.message);
    }
  });
  if (fs.existsSync(DJ_UPLOAD_DIR)) {
    const roomCodePrefix = `${key.replace(/^room:/, '')}_`;
    fs.readdirSync(DJ_UPLOAD_DIR).forEach(fileName => {
      if (!fileName.startsWith(roomCodePrefix)) return;
      try {
        fs.unlinkSync(path.join(DJ_UPLOAD_DIR, path.basename(fileName)));
      } catch (error) {
        console.error(`Failed to remove DJ upload ${fileName}:`, error.message);
      }
    });
  }
  const existed = state.delete(key);
  const hadRoomMeta = roomSecrets.delete(key);
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
  if (existed || hadRoomMeta) {
    schedulePersist();
    scheduleRoomMetaPersist();
  }
  return existed;
}

function removeRoomSession(key, reason = 'deleted') {
  const deleted = deleteRoomState(key);
  if (!deleted) return false;
  io.to(key).emit('shared:update', { key, value: null, reason });
  io.in(key).socketsLeave(key);
  return true;
}

function sweepExpiredRooms(options = {}) {
  const {
    log = false
  } = options;
  const now = Date.now();
  const removedKeys = [];
  let removedMetaEntries = 0;

  Array.from(state.entries()).forEach(([key, value]) => {
    if (!isRoomKey(key)) return;
    const room = safeParseJsonObject(value);
    const reason = getRoomCleanupReason(key, room, now);
    if (!reason) return;
    if (removeRoomSession(key, reason)) {
      removedKeys.push(`${key}:${reason}`);
    }
  });

  Array.from(roomSecrets.keys()).forEach(key => {
    if (state.has(key)) return;
    roomSecrets.delete(key);
    removedMetaEntries += 1;
  });

  if (removedKeys.length) {
    schedulePersist();
    scheduleRoomMetaPersist();
    if (log) {
      // eslint-disable-next-line no-console
      console.log(`Session cleanup removed ${removedKeys.length} room(s): ${removedKeys.join(', ')}`);
    }
  } else if (removedMetaEntries > 0) {
    scheduleRoomMetaPersist();
    if (log) {
      // eslint-disable-next-line no-console
      console.log(`Session cleanup removed ${removedMetaEntries} orphaned room metadata entr${removedMetaEntries === 1 ? 'y' : 'ies'}.`);
    }
  } else if (log) {
    // eslint-disable-next-line no-console
    console.log('Session cleanup found no expired or closed rooms.');
  }

  return removedKeys;
}

function startSessionCleanupLoop() {
  if (sessionCleanupInterval) clearInterval(sessionCleanupInterval);
  sessionCleanupInterval = setInterval(() => {
    sweepExpiredRooms();
  }, SESSION_CLEANUP_INTERVAL_MS);
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
    privateSession: room?.access?.privateSession === true || room?.hostSettings?.privateSession === true,
    actorTokens: {}
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
      privateSession: normalizedPrivateSession,
      actorTokens: {}
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

function getRoomActor(key, payload, room = getRoomSnapshot(key), options = {}) {
  const playerId = String(payload?.actorPlayerId || payload?.playerId || '').trim().slice(0, 64);
  const actorToken = String(payload?.actorToken || '').trim();
  if (!playerId || playerId.startsWith('computer-') || !isValidActorToken(actorToken) || !room) return null;
  const participant = getRoomParticipant(room, playerId, '');
  if (!participant) return null;
  const meta = getRoomAccessMeta(key);
  if (!meta) return null;
  meta.actorTokens = normalizeActorTokens(meta.actorTokens);
  const expectedToken = meta.actorTokens[playerId];
  if (!expectedToken) {
    if (options.allowLegacyClaim !== true || !hasValidRoomAccess(key, getRequestRoomToken(payload))) return null;
    meta.actorTokens[playerId] = actorToken;
    scheduleRoomMetaPersist();
  } else if (!safeTokenEqual(expectedToken, actorToken)) {
    return null;
  }
  return {
    playerId,
    participant,
    isHost: participant.name === room.host
  };
}

function isApprovedCommunityHost(userToken, playerName) {
  const normalizedUserToken = String(userToken || '').trim();
  const normalizedName = String(playerName || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!normalizedUserToken || !normalizedName) return false;
  return feedbackState.communityHostRequests.some(request => (
    request.status === 'approved'
    && request.userToken === normalizedUserToken
    && request.userName === normalizedName
  ));
}

const HOST_CONTROLLED_ROOM_FIELDS = [
  'host',
  'participants',
  'hostSettings',
  'access',
  'roomType',
  'communityTitle',
  'communityDescription',
  'maxParticipants',
  'currentActivity',
  'activityQueue',
  'queueSchedule',
  'queueIndex',
  'queueActive',
  'queueTiming',
  'contentCollections',
  'contentBrief'
];

function participantCanApplyRoomUpdate(currentRoom, nextRoom, actorPlayerId) {
  if (!currentRoom || !nextRoom) return false;
  if (['survey-clash', 'checkers', 'memory', 'chinese-checkers', 'spin-wheel'].includes(currentRoom.currentActivity)
    && JSON.stringify(currentRoom.activityState) !== JSON.stringify(nextRoom.activityState)) return false;
  const fixedFieldsUnchanged = HOST_CONTROLLED_ROOM_FIELDS
    .filter(field => field !== 'participants')
    .every(field => (
    JSON.stringify(currentRoom[field] ?? null) === JSON.stringify(nextRoom[field] ?? null)
  ));
  if (!fixedFieldsUnchanged) return false;
  const currentParticipants = Array.isArray(currentRoom.participants) ? currentRoom.participants : [];
  const nextParticipants = Array.isArray(nextRoom.participants) ? nextRoom.participants : [];
  if (currentParticipants.length !== nextParticipants.length) return false;
  const names = new Set();
  return currentParticipants.every(currentParticipant => {
    const participantId = getParticipantStableId(currentParticipant);
    const nextParticipant = nextParticipants.find(item => getParticipantStableId(item) === participantId);
    if (!nextParticipant) return false;
    const normalizedName = String(nextParticipant.name || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (!normalizedName || names.has(normalizedName)) return false;
    names.add(normalizedName);
    if (participantId !== actorPlayerId) {
      return JSON.stringify(currentParticipant) === JSON.stringify(nextParticipant);
    }
    const { name: _oldName, avatar: _oldAvatar, character: _oldCharacter, ...currentRest } = currentParticipant;
    const { name: _newName, avatar: _newAvatar, character: _newCharacter, ...nextRest } = nextParticipant;
    return JSON.stringify(currentRest) === JSON.stringify(nextRest);
  });
}

function containsUnsafeMarkup(value, depth = 0) {
  if (depth > 12) return true;
  if (typeof value === 'string') {
    return /<\s*\/?\s*(?:script|iframe|object|embed|svg|math|style|link|meta)\b/i.test(value)
      || /\bon[a-z]+\s*=/i.test(value)
      || /javascript\s*:/i.test(value);
  }
  if (Array.isArray(value)) return value.some(item => containsUnsafeMarkup(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(item => containsUnsafeMarkup(item, depth + 1));
}

function normalizeServerParticipant(rawParticipant, isHost = false) {
  if (!rawParticipant || typeof rawParticipant !== 'object') return null;
  const id = String(rawParticipant.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const name = String(rawParticipant.name || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!id || !name) return null;
  return {
    ...rawParticipant,
    id,
    name,
    avatar: String(rawParticipant.avatar || '👤').replace(/[<>]/g, '').trim().slice(0, 8) || '👤',
    score: Number.isFinite(Number(rawParticipant.score)) ? Number(rawParticipant.score) : 0,
    isComputer: false,
    character: normalizeCharacter(rawParticipant.character),
    isHost,
    ready: rawParticipant.ready !== false
  };
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

app.get('/api/config', (req, res) => {
  const { communityHostAllowlist: _privateAllowlist, ...publicPreferences } = feedbackState.config.preferences;
  const userToken = getUserToken(req);
  const communityHostApproved = feedbackState.communityHostRequests.some(request => (
    request.status === 'approved' && request.userToken === userToken
  ));
  res.json({
    ok: true,
    config: {
      ...feedbackState.config,
      preferences: {
        ...publicPreferences,
        communityHostApproved
      }
    },
    collections: feedbackState.collections,
    ai: {
      serverKeyConfigured: false,
      provider: '',
      model: '',
      endpointConfigured: false
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
  const actorPlayerId = String(req.header('x-player-id') || '').trim().slice(0, 64);
  const actorToken = String(req.header('x-actor-token') || '').trim();
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
  const actor = getRoomActor(roomKey, { actorPlayerId, actorToken }, room);
  if (!actor?.isHost || actor.participant.name !== playerName) {
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
  const extension = getDjUploadExtension(fileName, contentType);
  if (!hasExpectedMediaSignature(req.body, extension)) {
    res.status(400).json({ ok: false, error: 'The uploaded file does not match its declared audio format.' });
    return;
  }
  const diskUsage = getDjRoomDiskUsage(roomCode);
  if (diskUsage.files >= DJ_ROOM_MAX_TRACKS || diskUsage.bytes + req.body.length > DJ_ROOM_MAX_BYTES) {
    res.status(413).json({ ok: false, error: 'This room has reached its shared DJ library quota.' });
    return;
  }

  try {
    ensureRuntimeDir(DJ_UPLOAD_DIR);
    const trackId = `dj_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storageKey = `${roomCode}_${trackId}${extension}`;
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
  const actorPlayerId = String(req.header('x-player-id') || '').trim().slice(0, 64);
  const actorToken = String(req.header('x-actor-token') || '').trim();
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
  const actor = getRoomActor(roomKey, { actorPlayerId, actorToken }, room);
  if (!actor?.isHost || actor.participant.name !== playerName) {
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

// AI generate endpoint removed — content creation uses prompt-copy + manual import workflow

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
  feedbackState.feedback = feedbackState.feedback.slice(0, 1000);
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
    sessions: listAdminRooms(),
    storage: {
      configDatabaseConnected: Boolean(configDb)
    }
  });
});

app.get('/api/admin/sessions', requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    sessions: listAdminRooms(),
    sessionTtlMinutes: SESSION_TTL_MINUTES
  });
});

app.delete('/api/admin/sessions/:roomCode', requireAdmin, (req, res) => {
  const roomCode = String(req.params?.roomCode || '').trim().toUpperCase();
  const key = isRoomKey(`room:${roomCode}`) ? `room:${roomCode}` : '';
  if (!key) {
    res.status(400).json({ ok: false, error: 'Invalid room code.' });
    return;
  }
  const deleted = removeRoomSession(key, 'admin_closed');
  if (!deleted) {
    res.status(404).json({ ok: false, error: 'Session not found.' });
    return;
  }
  res.json({
    ok: true,
    closedRoomCode: roomCode,
    sessions: listAdminRooms()
  });
});

app.post('/api/admin/sessions/cleanup-abandoned', requireAdmin, (_req, res) => {
  const removed = sweepExpiredRooms({ log: true });
  res.json({
    ok: true,
    removed,
    sessions: listAdminRooms(),
    sessionTtlMinutes: SESSION_TTL_MINUTES
  });
});

app.put('/api/admin/config', requireAdmin, async (req, res) => {
  const branding = req.body?.branding || {};
  const preferences = req.body?.preferences || {};
  const collections = normalizeCollections(req.body?.collections || feedbackState.collections);

  const appName = String(branding.appName ?? feedbackState.config.branding.appName).trim().slice(0, 64);
  const tagline = String(branding.tagline ?? feedbackState.config.branding.tagline).trim().slice(0, 140);
  const accent = String(branding.accent ?? feedbackState.config.branding.accent).trim();
  const accentAlt = String(branding.accentAlt ?? (feedbackState.config.branding.accentAlt || '')).trim();
  const bgColor = String(branding.bgColor ?? (feedbackState.config.branding.bgColor || '')).trim();
  const colorThemeRaw = String(branding.colorTheme ?? (feedbackState.config.branding.colorTheme || 'default')).trim().toLowerCase();
  const normalizedAccent = isValidHexColor(accent) ? accent : feedbackState.config.branding.accent;
  const normalizedAccentAlt = isValidHexColor(accentAlt) ? accentAlt : '';
  const normalizedBgColor = isValidHexColor(bgColor) ? bgColor : '';
  const normalizedColorTheme = ['default', 'servicenow'].includes(colorThemeRaw) ? colorThemeRaw : 'default';

  feedbackState.config.branding = {
    appName: appName || feedbackState.config.branding.appName,
    tagline: tagline || feedbackState.config.branding.tagline,
    accent: normalizedAccent,
    accentAlt: normalizedAccentAlt,
    bgColor: normalizedBgColor,
    colorTheme: normalizedColorTheme
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
    communityHostRequests: feedbackState.communityHostRequests,
    sessions: listAdminRooms()
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

  feedbackState.communityHostRequests = normalizeCommunityHostRequests(feedbackState.communityHostRequests);
  scheduleFeedbackPersist();
  await persistConfigToDatabase();
  res.json({
    ok: true,
    request,
    config: feedbackState.config,
    communityHostRequests: feedbackState.communityHostRequests,
    sessions: listAdminRooms()
  });
});

function clearMemoryTimer(key) {
  if (memoryTimers.has(key)) clearTimeout(memoryTimers.get(key));
  memoryTimers.delete(key);
}

function publishGameRoom(key, room) {
  room.lastUpdate = Date.now();
  room.revision = (Number(room.revision) || 0) + 1;
  const value = JSON.stringify(room);
  state.set(key, value);
  schedulePersist();
  io.to(key).emit('shared:update', { key, value });
  return value;
}

function scheduleMemoryReveal(key, game) {
  clearMemoryTimer(key);
  if (game?.flipped?.length !== 2 || !game.hideAt) return;
  const id = game.id;
  const timer = setTimeout(() => {
    memoryTimers.delete(key);
    const room = getRoomSnapshot(key);
    if (room?.currentActivity !== 'memory' || room.activityState?.id !== id) return;
    const resolved = Memory.resolveMismatch(room.activityState, room.participants);
    if (resolved !== room.activityState) {
      room.activityState = resolved;
      publishGameRoom(key, room);
    } else scheduleMemoryReveal(key, room.activityState);
  }, Math.max(0, game.hideAt - Date.now()));
  timer.unref();
  memoryTimers.set(key, timer);
}

function startMemoryRound(key, room, options = {}) {
  clearMemoryTimer(key);
  const { game, secret } = Memory.createGame(room.participants, { theme: options.theme, pairCount: options.pairCount, id: crypto.randomUUID() }, () => crypto.randomInt(0, 0x100000000) / 0x100000000);
  room.activityState = game;
  getRoomAccessMeta(key).memory = secret;
  scheduleRoomMetaPersist();
}

function clearFamilyFaceOffTimer(key) {
  clearTimeout(familyFaceOffTimers.get(key)); familyFaceOffTimers.delete(key);
}

function createFamilyFaceOffRound(room, source = {}) {
  const questions = validateSurveyQuestions(source.questions || []);
  if (!questions.length) throw new Error('Add a valid survey question pack before starting Family Face-Off.');
  const requestedOrder = Array.isArray(source.questionOrder) ? source.questionOrder : [];
  const order = requestedOrder.filter((index, position) => Number.isInteger(index) && index >= 0 && index < questions.length && requestedOrder.indexOf(index) === position);
  const questionOrder = [...order, ...questions.map((_, index) => index).filter(index => !order.includes(index))];
  return FamilyFaceOff.create({ ...source, questions, questionOrder, roundCount: Math.max(1, Math.min(questions.length, Number(source.roundCount) || 4)), startedAt: Date.now() }, room.participants.map(player => ({ ...player, isHost: player.name === room.host })), crypto.randomUUID());
}

function scheduleFamilyFaceOff(key, game) {
  clearFamilyFaceOffTimer(key);
  if (game?.phase !== 'answering' || !game.faceoff?.deadline || game.pendingAnswer) return;
  const timer = setTimeout(() => {
    familyFaceOffTimers.delete(key);
    const room = getRoomSnapshot(key);
    if (room?.currentActivity !== 'survey-clash' || room.activityState?.id !== game.id || room.activityState.version !== game.version) return;
    room.activityState = FamilyFaceOff.expire(room.activityState);
    publishGameRoom(key, room);
    scheduleFamilyFaceOff(key, room.activityState);
  }, Math.max(0, game.faceoff.deadline - Date.now()) + 10);
  timer.unref(); familyFaceOffTimers.set(key, timer);
}

function clearSpinWheelTimer(key) {
  clearTimeout(spinWheelTimers.get(key));
  spinWheelTimers.delete(key);
}

function scheduleSpinWheel(key, game) {
  clearSpinWheelTimer(key);
  if (!game?.isSpinning) return;
  const timer = setTimeout(() => {
    spinWheelTimers.delete(key);
    const room = getRoomSnapshot(key);
    if (room?.currentActivity !== 'spin-wheel' || room.activityState?.spinToken !== game.spinToken || room.activityState?.lastSpinAt !== game.lastSpinAt) return;
    room.activityState = SpinWheel.settle(room.activityState);
    publishGameRoom(key, room);
  }, Math.max(0, Number(game.lastSpinAt) + Number(game.spinDurationMs || 4800) - Date.now()) + 20);
  timer.unref();
  spinWheelTimers.set(key, timer);
}

function clearChineseCheckersTimer(key) {
  clearTimeout(chineseCheckersTimers.get(key));
  chineseCheckersTimers.delete(key);
}

function scheduleChineseCheckersTurn(key, game) {
  clearChineseCheckersTimer(key);
  if (game?.phase !== 'playing' || game.paused || !game.seats[game.turnIndex]?.isComputer) return;
  const timer = setTimeout(() => {
    chineseCheckersTimers.delete(key);
    const room = getRoomSnapshot(key);
    if (room?.currentActivity !== 'chinese-checkers' || room.activityState?.id !== game.id || room.activityState.version !== game.version) return;
    room.activityState = ChineseCheckersAI.playTurn(room.activityState);
    publishGameRoom(key, room);
    scheduleChineseCheckersTurn(key, room.activityState);
  }, 700);
  timer.unref();
  chineseCheckersTimers.set(key, timer);
}

function fillChineseCheckersComputers(game) {
  if (game.phase !== 'setup') throw new Error('Add computers before starting the round.');
  let next = game;
  game.seats.forEach((seat, index) => {
    if (!seat) next = ChineseCheckers.join(next, { id: `computer-${crypto.randomUUID()}`, name: `Computer ${index + 1}`, isComputer: true }, index);
  });
  return next;
}

function createChineseCheckersRound(room, playerCount = 2, previousSeats = null) {
  const host = room.participants.find(player => player.name === room.host);
  let game = ChineseCheckers.createGame(previousSeats ? [] : room.participants, { playerCount, hostId: host?.id, id: crypto.randomUUID() });
  if (previousSeats) previousSeats.forEach((seat, index) => {
    const player = seat?.isComputer ? { id: seat.playerId, name: seat.name, isComputer: true } : room.participants.find(person => person.id === seat?.playerId);
    if (player && index < game.playerCount) game = ChineseCheckers.join(game, player, index);
  });
  return game;
}

io.on('connection', socket => {
  let eventWindowStartedAt = Date.now();
  let eventCount = 0;
  socket.use((_packet, next) => {
    const now = Date.now();
    if (now - eventWindowStartedAt >= 10000) {
      eventWindowStartedAt = now;
      eventCount = 0;
    }
    eventCount += 1;
    if (eventCount > 200) {
      next(new Error('Realtime event rate limit exceeded'));
      return;
    }
    next();
  });

  socket.on('room:join', (payload, ack) => {
    const key = payload?.key;
    const authToken = getRequestRoomToken(payload);
    const actorToken = String(payload?.actorToken || '').trim();
    const playerId = String(payload?.playerId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const playerName = String(payload?.playerName || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
    const playerAvatar = String(payload?.playerAvatar || '👤').replace(/[<>]/g, '').trim().slice(0, 8) || '👤';
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, authToken)) {
      ack?.({ ok: false, error: 'Room not found or access denied' });
      return;
    }
    if (!playerId || playerId.startsWith('computer-') || !playerName || !isValidActorToken(actorToken)) {
      ack?.({ ok: false, error: 'Invalid participant identity' });
      return;
    }
    const room = getRoomSnapshot(key);
    const meta = getRoomAccessMeta(key);
    if (!room || !meta) {
      ack?.({ ok: false, error: 'Room not found' });
      return;
    }
    meta.actorTokens = normalizeActorTokens(meta.actorTokens);
    const existingById = getRoomParticipant(room, playerId, '');
    const existingByName = getRoomParticipant(room, '', playerName);
    if (existingById) {
      const expectedToken = meta.actorTokens[playerId];
      if (expectedToken && !safeTokenEqual(expectedToken, actorToken)) {
        ack?.({ ok: false, error: 'Participant identity is already in use' });
        return;
      }
    } else if (existingByName) {
      ack?.({ ok: false, error: 'That display name is already in use in this room' });
      return;
    } else {
      const maxParticipants = Math.max(2, Math.min(100, Number(room.maxParticipants) || 24));
      if ((room.participants?.length || 0) >= maxParticipants) {
        ack?.({ ok: false, error: `This room is full (${maxParticipants} participants max).` });
        return;
      }
      room.participants = Array.isArray(room.participants) ? room.participants : [];
      room.participants.push(normalizeServerParticipant({
        id: playerId,
        name: playerName,
        avatar: playerAvatar,
        character: normalizeCharacter(payload?.playerCharacter),
        ready: true
      }, false));
    }
    meta.actorTokens[playerId] = actorToken;
    if (existingById) {
      existingById.name = playerName;
      existingById.avatar = playerAvatar;
      if (Object.hasOwn(payload, 'playerCharacter')) existingById.character = normalizeCharacter(payload.playerCharacter);
    }
    if (room.currentActivity === 'memory') room.activityState = Memory.reconcilePlayers(room.activityState, room.participants);
    room.lastUpdate = Date.now();
    room.revision = Math.max(0, Number(room.revision) || 0) + 1;
    state.set(key, JSON.stringify(room));
    schedulePersist();
    scheduleRoomMetaPersist();
    socket.join(key);
    io.to(key).emit('shared:update', { key, value: state.get(key) });
    ack?.({ ok: true, value: state.get(key) });
  });

  socket.on('room:character', (payload, ack) => {
    const key = payload?.key;
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, getRequestRoomToken(payload))) { ack?.({ ok: false, error: 'Room access denied.' }); return; }
    const room = getRoomSnapshot(key), actor = getRoomActor(key, payload, room);
    if (!actor) { ack?.({ ok: false, error: 'Participant authentication required.' }); return; }
    const character = normalizeCharacter(payload.character);
    if (!character) { ack?.({ ok: false, error: 'Choose a valid character.' }); return; }
    actor.participant.character = character;
    const value = publishGameRoom(key, room);
    ack?.({ ok: true, value });
  });

  socket.on('room:leave', (payload, ack) => {
    const key = payload?.key;
    const authToken = getRequestRoomToken(payload);
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, authToken)) {
      ack?.({ ok: false, error: 'Room access denied' });
      return;
    }
    const room = getRoomSnapshot(key);
    const actor = getRoomActor(key, payload, room);
    if (!room || !actor) {
      ack?.({ ok: false, error: 'Participant authentication required' });
      return;
    }
    room.participants = (Array.isArray(room.participants) ? room.participants : [])
      .filter(participant => getParticipantStableId(participant) !== actor.playerId);
    const meta = getRoomAccessMeta(key);
    if (meta?.actorTokens) delete meta.actorTokens[actor.playerId];
    if (!room.participants.length) {
      room.host = '';
      room.currentActivity = null;
      room.activityState = {};
    } else if (actor.isHost) {
      room.host = room.participants[0].name;
    }
    room.participants = room.participants.map(participant => normalizeServerParticipant(
      participant,
      participant.name === room.host
    )).filter(Boolean);
    if (room.currentActivity === 'chinese-checkers' && room.activityState.phase === 'setup'
      && room.activityState.seats.some(seat => seat?.playerId === actor.playerId)) {
      room.activityState = ChineseCheckers.leave(room.activityState, actor.playerId);
    }
    if (room.currentActivity === 'memory') {
      room.activityState = Memory.reconcilePlayers(room.activityState, room.participants);
      scheduleMemoryReveal(key, room.activityState);
    } else if (!room.participants.length) {
      clearFamilyFaceOffTimer(key);
      clearSpinWheelTimer(key);
      clearChineseCheckersTimer(key);
      clearMemoryTimer(key);
      if (meta) meta.memory = null;
    }
    room.lastUpdate = Date.now();
    room.revision = Math.max(0, Number(room.revision) || 0) + 1;
    state.set(key, JSON.stringify(room));
    schedulePersist();
    scheduleRoomMetaPersist();
    socket.leave(key);
    io.to(key).emit('shared:update', { key, value: state.get(key) });
    ack?.({ ok: true });
  });

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

  socket.on('memory:action', (payload, ack) => {
    const key = payload?.key;
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, getRequestRoomToken(payload))) {
      ack?.({ ok: false, error: 'Room access denied.' }); return;
    }
    const room = getRoomSnapshot(key);
    const actor = getRoomActor(key, payload, room);
    if (!actor || room?.currentActivity !== 'memory') {
      ack?.({ ok: false, error: 'Join the room before playing Memory.' }); return;
    }
    try {
      const game = room.activityState;
      if (payload.gameId !== game.id || payload.version !== game.version) throw new Error('The cards changed. Choose again.');
      if (payload.action === 'restart') {
        if (!actor.isHost) throw new Error('Only the host can start a new round.');
        startMemoryRound(key, room, { theme: payload.theme, pairCount: payload.pairCount });
      } else if (payload.action === 'join') {
        room.activityState = Memory.join(game, actor.participant);
      } else if (payload.action === 'flip') {
        room.activityState = Memory.flip(game, getRoomAccessMeta(key)?.memory, actor.playerId, payload.index);
      } else throw new Error('Unknown Memory action.');
      const value = publishGameRoom(key, room);
      scheduleMemoryReveal(key, room.activityState);
      ack?.({ ok: true, value });
    } catch (error) { ack?.({ ok: false, error: error.message }); }
  });

  socket.on('family-face-off:action', (payload, ack) => {
    const key = payload?.key;
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, getRequestRoomToken(payload))) { ack?.({ ok: false, error: 'Room access denied.' }); return; }
    const room = getRoomSnapshot(key), actor = getRoomActor(key, payload, room);
    if (!actor || room?.currentActivity !== 'survey-clash') { ack?.({ ok: false, error: 'Join the room before playing Family Face-Off.' }); return; }
    try {
      const game = room.activityState;
      const expired = FamilyFaceOff.expire(game);
      if (expired !== game) {
        room.activityState = expired; publishGameRoom(key, room); scheduleFamilyFaceOff(key, expired);
        throw new Error('Time is up. The next answer turn has started.');
      }
      if (payload.gameId !== game.id || payload.roundIndex !== game.roundIndex) throw new Error('The round changed. Try again.');
      if (payload.action !== 'buzz' && payload.version !== game.version) throw new Error('The game changed. Try again.');
      room.activityState = FamilyFaceOff.action(game, actor, payload.action, payload, room.participants);
      const value = publishGameRoom(key, room);
      scheduleFamilyFaceOff(key, room.activityState);
      ack?.({ ok: true, value });
    } catch (error) { ack?.({ ok: false, error: error.message }); }
  });

  socket.on('spin-wheel:action', (payload, ack) => {
    const key = payload?.key;
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, getRequestRoomToken(payload))) { ack?.({ ok: false, error: 'Room access denied.' }); return; }
    const room = getRoomSnapshot(key), actor = getRoomActor(key, payload, room);
    if (!actor || room?.currentActivity !== 'spin-wheel') { ack?.({ ok: false, error: 'Join this room before playing.' }); return; }
    try {
      const game = room.activityState;
      if (payload.spinToken !== (Number(game.spinToken) || 0) || payload.startedAt !== game.startedAt) throw new Error('The wheel changed. Try again.');
      const name = actor.participant.name;
      const assigned = room.participants.some(player => player.name === game.spinnerTurnPlayer && player.name !== room.host) ? game.spinnerTurnPlayer : '';
      let claimed = false;
      if (payload.action === 'spin') {
        if (assigned ? assigned !== name : !actor.isHost) throw new Error('Wait for your turn to spin.');
        room.activityState = SpinWheel.spin(game, name, Date.now(), () => crypto.randomInt(0, 0x100000000) / 0x100000000);
      } else if (payload.action === 'pick') {
        if (game.isSpinning) throw new Error('Picks are locked while the wheel spins.');
        if (room.hostSettings?.spinWheelAllowPlayerPicks === false) throw new Error('Predictions are turned off for this wheel.');
        const slices = SpinWheel.segments(SpinWheel.entries(game));
        if (!Number.isInteger(payload.index) || !slices[payload.index]) throw new Error('Choose an option on this wheel.');
        game.playerSelections = { ...(game.playerSelections || {}), [name]: payload.index };
      } else if (payload.action === 'assign') {
        if (!actor.isHost || game.isSpinning) throw new Error('The host can change turns between spins.');
        if (payload.player && !room.participants.some(player => player.name === payload.player && player.name !== room.host)) throw new Error('Choose a participant in this room.');
        game.spinnerTurnPlayer = payload.player || null;
      } else if (payload.action === 'picks-enabled') {
        if (!actor.isHost || game.isSpinning) throw new Error('The host can change predictions between spins.');
        room.hostSettings = { ...(room.hostSettings || {}), spinWheelAllowPlayerPicks: payload.enabled === true };
        if (!payload.enabled) game.playerSelections = {};
      } else if (payload.action === 'claim-winner') {
        if (!game.isSpinning && game.spinWinners?.includes(name) && !game.winnerXpClaimed?.[name]) {
          game.winnerXpClaimed = { ...(game.winnerXpClaimed || {}), [name]: true }; claimed = true;
        }
      } else throw new Error('Unknown wheel action.');
      const value = publishGameRoom(key, room);
      scheduleSpinWheel(key, room.activityState);
      ack?.({ ok: true, value, claimed });
    } catch (error) { ack?.({ ok: false, error: error.message }); }
  });

  socket.on('chinese-checkers:action', (payload, ack) => {
    const key = payload?.key;
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, getRequestRoomToken(payload))) {
      ack?.({ ok: false, error: 'Room access denied.' }); return;
    }
    const room = getRoomSnapshot(key);
    const actor = getRoomActor(key, payload, room);
    if (!actor || room?.currentActivity !== 'chinese-checkers') {
      ack?.({ ok: false, error: 'Join the room before playing Chinese Checkers.' }); return;
    }
    try {
      const game = room.activityState;
      if (payload.gameId !== game.id || payload.version !== game.version) throw new Error('The board changed. Choose again.');
      if (['configure', 'start', 'pause', 'restart', 'fill-computers', 'play-computer', 'remove-computer'].includes(payload.action) && !actor.isHost) throw new Error('Only the host can change round controls.');
      let next;
      switch (payload.action) {
        case 'join': next = ChineseCheckers.join(game, actor.participant, payload.seatIndex); break;
        case 'leave': next = ChineseCheckers.leave(game, actor.playerId); break;
        case 'configure': next = ChineseCheckers.configure(game, payload.playerCount); break;
        case 'fill-computers': next = fillChineseCheckersComputers(game); break;
        case 'remove-computer': {
          const seat = game.seats[payload.seatIndex];
          if (!seat?.isComputer) throw new Error('Choose a computer seat.');
          next = ChineseCheckers.leave(game, seat.playerId); break;
        }
        case 'play-computer':
        case 'start':
          if (game.seats.some(seat => seat && !seat.isComputer && !room.participants.some(player => player.id === seat.playerId))) throw new Error('A seated player has left. Wait for them to return or start a new round.');
          next = ChineseCheckers.start(payload.action === 'play-computer' ? fillChineseCheckersComputers(game) : game); break;
        case 'pause': next = ChineseCheckers.pause(game, payload.paused); break;
        case 'restart': next = createChineseCheckersRound(room, game.playerCount, game.seats); break;
        case 'move': next = ChineseCheckers.move(game, actor.playerId, payload.from, payload.to); break;
        case 'end-turn': next = ChineseCheckers.endTurn(game, actor.playerId); break;
        case 'pass': next = ChineseCheckers.pass(game, actor.playerId); break;
        default: throw new Error('Unknown Chinese Checkers action.');
      }
      room.activityState = next;
      scheduleChineseCheckersTurn(key, next);
      room.lastUpdate = Date.now();
      room.revision = (Number(room.revision) || 0) + 1;
      const value = JSON.stringify(room);
      state.set(key, value); schedulePersist();
      io.to(key).emit('shared:update', { key, value });
      ack?.({ ok: true, value });
    } catch (error) { ack?.({ ok: false, error: error.message }); }
  });

  socket.on('checkers:action', (payload, ack) => {
    const key = payload?.key;
    if (!isRoomKey(key) || !isAuthorizedForRoom(key, getRequestRoomToken(payload))) {
      ack?.({ ok: false, error: 'Room access denied.' }); return;
    }
    const room = getRoomSnapshot(key);
    const actor = getRoomActor(key, payload, room);
    if (!actor || room?.currentActivity !== 'checkers') {
      ack?.({ ok: false, error: 'Join the room before playing Checkers.' }); return;
    }
    try {
      const game = room.activityState;
      if (payload.gameId !== game.startedAt || payload.moveNumber !== game.moveNumber) throw new Error('The board changed. Choose your move again.');
      if (payload.action === 'restart') {
        if (!actor.isHost) throw new Error('Only the host can start a new match.');
        room.activityState = Checkers.createGame(room.participants, payload.rules ?? game.rules);
      } else if (payload.action === 'join') {
        if (game.phase !== 'waiting') throw new Error('This match already has two players.');
        if (Object.values(game.players).some(seat => seat?.playerId === actor.playerId)) throw new Error('You already have a seat.');
        const side = !game.players.b ? 'b' : 'r';
        game.players[side] = { playerId: actor.playerId, name: actor.participant.name };
        if (game.players.b && game.players.r) game.phase = 'playing';
      } else if (payload.action === 'move') {
        if (game.players?.[game.turn]?.playerId !== actor.playerId) throw new Error('It is not your turn.');
        room.activityState = Checkers.applyMove(game, payload.from, payload.to);
      } else throw new Error('Unknown Checkers action.');
      room.lastUpdate = Date.now();
      room.revision = (Number(room.revision) || 0) + 1;
      const value = JSON.stringify(room);
      state.set(key, value);
      schedulePersist();
      io.to(key).emit('shared:update', { key, value });
      ack?.({ ok: true, value });
    } catch (error) { ack?.({ ok: false, error: error.message }); }
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
    if (Buffer.byteLength(strValue, 'utf8') > SHARED_STATE_MAX_BYTES) {
      ack?.({ ok: false, error: 'Payload too large' });
      return;
    }

    const nextRoom = safeParseJsonObject(strValue);
    if (!nextRoom || containsUnsafeMarkup(nextRoom)) {
      ack?.({ ok: false, error: 'Invalid or unsafe room payload' });
      return;
    }
    const roomCode = key.replace(/^room:/, '');
    if (String(nextRoom.code || '').trim().toUpperCase() !== roomCode) {
      ack?.({ ok: false, error: 'Room code does not match storage key' });
      return;
    }
    const desiredPrivateSession = extractRoomPrivacyFromValue(strValue);
    const existingRoom = getRoomSnapshot(key);
    let initializeMemory = false;
    if (!ensureRoomAccess(key, authToken, desiredPrivateSession)) {
      ack?.({ ok: false, error: 'Unauthorized room write' });
      return;
    }

    const meta = getRoomAccessMeta(key);
    const actorToken = String(payload?.actorToken || '').trim();
    const actorPlayerId = String(payload?.actorPlayerId || '').trim().slice(0, 64);
    if (!existingRoom) {
      const hostParticipant = getRoomParticipant(nextRoom, actorPlayerId, '');
      const actorName = String(payload?.actorPlayerName || '').trim();
      if (!isValidActorToken(actorToken) || !hostParticipant || hostParticipant.name !== nextRoom.host || hostParticipant.name !== actorName) {
        deleteRoomState(key);
        ack?.({ ok: false, error: 'Valid host identity required to create room' });
        return;
      }
      if (
        String(nextRoom.roomType || '').trim().toLowerCase() === 'community'
        && !isApprovedCommunityHost(payload?.userToken, hostParticipant.name)
        && !isValidAdminToken(payload?.adminToken, null)
      ) {
        deleteRoomState(key);
        ack?.({ ok: false, error: 'Approved community-host access is required' });
        return;
      }
      meta.actorTokens = { [actorPlayerId]: actorToken };
      nextRoom.revision = 1;
      scheduleRoomMetaPersist();
    } else {
      const adminActor = isValidAdminToken(payload?.adminToken, null);
      const actor = adminActor ? null : getRoomActor(key, payload, existingRoom, { allowLegacyClaim: true });
      if (!adminActor && !actor) {
        ack?.({ ok: false, error: 'Participant authentication required' });
        return;
      }
      if (!adminActor && !actor.isHost && !participantCanApplyRoomUpdate(existingRoom, nextRoom, actor.playerId)) {
        ack?.({ ok: false, error: 'Only the host can change room controls' });
        return;
      }
      const queuedFamilyFaceOff = nextRoom.queueActive === true && Number(nextRoom.queueIndex) > Number(existingRoom.queueIndex)
        && nextRoom.activityQueue?.[Number(nextRoom.queueIndex) - 1] === 'survey-clash';
      if (nextRoom.currentActivity === 'survey-clash' && (existingRoom.currentActivity !== 'survey-clash' || queuedFamilyFaceOff
        || (Number.isFinite(nextRoom.activityState?.startedAt) && nextRoom.activityState.startedAt !== existingRoom.activityState?.startedAt && !nextRoom.activityState?.id))) {
        try { nextRoom.activityState = createFamilyFaceOffRound(existingRoom, nextRoom.activityState); }
        catch (error) { ack?.({ ok: false, error: error.message }); return; }
      } else if (existingRoom.currentActivity === 'survey-clash' && nextRoom.currentActivity === 'survey-clash'
        && JSON.stringify(existingRoom.activityState) !== JSON.stringify(nextRoom.activityState)) {
        ack?.({ ok: false, error: 'Use Family Face-Off controls to update this game.' }); return;
      }
      if (existingRoom.currentActivity === 'spin-wheel' && nextRoom.currentActivity === 'spin-wheel' && existingRoom.activityState?.isSpinning
        && JSON.stringify(existingRoom.activityState) !== JSON.stringify(nextRoom.activityState)) {
        ack?.({ ok: false, error: 'Wait for the spin to finish before changing the wheel.' }); return;
      }
      const queuedChineseCheckers = nextRoom.queueActive === true
        && Number(nextRoom.queueIndex) > Number(existingRoom.queueIndex)
        && nextRoom.activityQueue?.[Number(nextRoom.queueIndex) - 1] === 'chinese-checkers';
      if (nextRoom.currentActivity === 'chinese-checkers' && (existingRoom.currentActivity !== 'chinese-checkers' || queuedChineseCheckers)) {
        nextRoom.activityState = createChineseCheckersRound(existingRoom, nextRoom.activityState?.playerCount);
      } else if (existingRoom.currentActivity === 'chinese-checkers' && nextRoom.currentActivity === 'chinese-checkers'
        && JSON.stringify(existingRoom.activityState) !== JSON.stringify(nextRoom.activityState)) {
        ack?.({ ok: false, error: 'Use Chinese Checkers controls to update the board.' }); return;
      }
      const queuedMemoryRestart = nextRoom.queueActive === true
        && Number(nextRoom.queueIndex) > Number(existingRoom.queueIndex)
        && nextRoom.activityQueue?.[Number(nextRoom.queueIndex) - 1] === 'memory';
      if (nextRoom.currentActivity === 'memory' && (existingRoom.currentActivity !== 'memory' || queuedMemoryRestart)) {
        initializeMemory = true;
      } else if (existingRoom.currentActivity === 'memory' && nextRoom.currentActivity === 'memory'
        && JSON.stringify(existingRoom.activityState) !== JSON.stringify(nextRoom.activityState)) {
        ack?.({ ok: false, error: 'Use Memory controls to update the cards.' }); return;
      }
      const queuedCheckersRestart = nextRoom.queueActive === true
        && Number(nextRoom.queueIndex) > Number(existingRoom.queueIndex)
        && nextRoom.activityQueue?.[Number(nextRoom.queueIndex) - 1] === 'checkers';
      if (nextRoom.currentActivity === 'checkers' && (existingRoom.currentActivity !== 'checkers' || queuedCheckersRestart)) {
        nextRoom.activityState = Checkers.createGame(existingRoom.participants, nextRoom.activityState?.rules);
      } else if (existingRoom.currentActivity === 'checkers' && nextRoom.currentActivity === 'checkers'
        && JSON.stringify(existingRoom.activityState) !== JSON.stringify(nextRoom.activityState)) {
        ack?.({ ok: false, error: 'Use Checkers controls to update the board.' }); return;
      }
      if (Number(nextRoom.revision) !== Number(existingRoom.revision)) {
        ack?.({ ok: false, error: 'Room changed before this update was saved. Please retry.' });
        return;
      }
      nextRoom.revision = Math.max(0, Number(existingRoom.revision) || 0) + 1;
    }

    nextRoom.participants = (Array.isArray(nextRoom.participants) ? nextRoom.participants : [])
      .map(participant => normalizeServerParticipant(participant, participant?.name === nextRoom.host))
      .filter(Boolean)
      .slice(0, 100);

    if (!existingRoom && nextRoom.currentActivity === 'survey-clash') {
      try { nextRoom.activityState = createFamilyFaceOffRound(nextRoom, nextRoom.activityState); }
      catch (error) { deleteRoomState(key); ack?.({ ok: false, error: error.message }); return; }
    }
    if (!existingRoom && nextRoom.currentActivity === 'chinese-checkers') nextRoom.activityState = createChineseCheckersRound(nextRoom, nextRoom.activityState?.playerCount);
    if (nextRoom.currentActivity === 'memory' && (!existingRoom || initializeMemory)) {
      startMemoryRound(key, nextRoom, nextRoom.activityState || {});
    } else if (existingRoom?.currentActivity === 'memory' && nextRoom.currentActivity !== 'memory') {
      clearMemoryTimer(key);
      getRoomAccessMeta(key).memory = null;
      scheduleRoomMetaPersist();
    }
    state.set(key, JSON.stringify(nextRoom));
    scheduleFamilyFaceOff(key, nextRoom.currentActivity === 'survey-clash' ? nextRoom.activityState : null);
    scheduleSpinWheel(key, nextRoom.currentActivity === 'spin-wheel' ? nextRoom.activityState : null);
    scheduleChineseCheckersTurn(key, nextRoom.currentActivity === 'chinese-checkers' ? nextRoom.activityState : null);
    schedulePersist();
    io.to(key).emit('shared:update', { key, value: state.get(key) });
    emitVoiceState(key, safeParseJsonObject(strValue));
    ack?.({ ok: true, value: state.get(key) });
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
    const adminActor = isValidAdminToken(payload?.adminToken, null);
    const actor = adminActor ? null : getRoomActor(key, payload, getRoomSnapshot(key), { allowLegacyClaim: true });
    if (!adminActor && !actor?.isHost) {
      ack?.({ ok: false, error: 'Only the host can remove a room' });
      return;
    }
    const deleted = removeRoomSession(key, 'deleted');
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
    const actor = getRoomActor(key, {
      actorPlayerId: participantId,
      actorToken: payload?.actorToken,
      authToken
    }, room, { allowLegacyClaim: true });
    if (!participantId || !actor || actor.playerId !== participantId) {
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
for (const [key, value] of state) {
  const room = safeParseJsonObject(value);
  if (room?.currentActivity === 'survey-clash') {
    if (!room.activityState?.id) {
      try {
        const legacy = room.activityState;
        const upgraded = createFamilyFaceOffRound(room, legacy);
        upgraded.scores = Array.isArray(legacy.scores) ? legacy.scores.slice(0, 2).map(value => Number(value) || 0) : [0, 0];
        upgraded.roundIndex = Math.max(0, Math.min(upgraded.roundCount - 1, Number(legacy.roundIndex) || 0));
        upgraded.revealed = FamilyFaceOff.question(upgraded).answers.map((_, index) => Boolean(legacy.revealed?.[index]));
        upgraded.strikes = Math.max(0, Math.min(3, Number(legacy.strikes) || 0));
        upgraded.roundAwarded = legacy.roundAwarded === true;
        upgraded.phase = legacy.finished ? 'finished' : upgraded.roundAwarded ? 'round-over' : upgraded.strikes === 3 ? 'steal' : upgraded.revealed.some(Boolean) || upgraded.strikes ? 'playing' : 'setup';
        upgraded.finished = legacy.finished === true;
        room.activityState = upgraded; state.set(key, JSON.stringify(room)); schedulePersist();
      }
      catch (_) { continue; }
    }
    scheduleFamilyFaceOff(key, room.activityState);
  }
  if (room?.currentActivity === 'spin-wheel') scheduleSpinWheel(key, room.activityState);
  if (room?.currentActivity === 'memory') scheduleMemoryReveal(key, room.activityState);
  if (room?.currentActivity === 'chinese-checkers') scheduleChineseCheckersTurn(key, room.activityState);
}
sweepExpiredRooms({ log: true });
Promise.resolve()
  .then(() => initializeConfigDatabase())
  .then(() => loadConfigFromDatabase())
  .finally(() => {
    startSessionCleanupLoop();
    server.listen(PORT, () => {
      const listeningPort = server.address()?.port || PORT;
      // eslint-disable-next-line no-console
      console.log(`Team Builder realtime server listening on http://localhost:${listeningPort}`);
      // eslint-disable-next-line no-console
      console.log(`Environment: NODE_ENV=${process.env.NODE_ENV || 'undefined'} ADMIN_TOKEN=${maskConfiguredSecret(getAdminToken())}`);
      if (configDb) {
        // eslint-disable-next-line no-console
        console.log(`Global config storage: ${configDb.kind}`);
      } else {
        // eslint-disable-next-line no-console
        console.log('Global config storage: Local file');
      }
      // eslint-disable-next-line no-console
      console.log(`Session TTL: ${SESSION_TTL_MINUTES} minutes; cleanup sweep every ${Math.round(SESSION_CLEANUP_INTERVAL_MS / 1000)}s`);
    });
  });

process.on('SIGINT', () => {
  if (persistTimer) clearTimeout(persistTimer);
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  if (roomMetaPersistTimer) clearTimeout(roomMetaPersistTimer);
  if (sessionCleanupInterval) clearInterval(sessionCleanupInterval);
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
  if (sessionCleanupInterval) clearInterval(sessionCleanupInterval);
  persistStateToDisk();
  persistFeedbackStateToDisk();
  persistRoomMetaToDisk();
  if (configDb) {
    configDb.end().catch(() => {});
  }
  process.exit(0);
});
