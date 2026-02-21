const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
    origin: '*'
  }
});

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const state = new Map();
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'shared-state.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback-state.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me-admin-token';
const CHAT_GPT_MINI_KEY = String(process.env.CHAT_GPT_MINI_KEY || '').trim();
const AI_QUESTION_ENDPOINT = String(process.env.AI_QUESTION_ENDPOINT || 'https://api.openai.com/v1/chat/completions').trim();
const AI_QUESTION_MODEL = String(process.env.AI_QUESTION_MODEL || 'gpt-4o-mini').trim();
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
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
  'regular-trivia',
  'tic-tac-toe-blitz'
];
const FEATURE_FLAG_IDS = [
  'enableFeedbackHub',
  'enableActivityQueue',
  'enableScheduleMeeting',
  'enableLoadSession',
  'enableAIGenerator',
  'enableSampleQuestions'
];
let persistTimer = null;
let feedbackPersistTimer = null;
let configDb = null;

function getDefaultPreferences() {
  return {
    enableFeedbackHub: true,
    enableActivityQueue: true,
    enableScheduleMeeting: true,
    enableLoadSession: true,
    enableAIGenerator: true,
    enableSampleQuestions: true,
    enabledActivities: Object.fromEntries(ALL_ACTIVITY_IDS.map(activityId => [activityId, true]))
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
  const appName = String(existingBranding.appName || 'Player Hub').trim().slice(0, 64) || 'Player Hub';
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

const feedbackState = {
  feedback: [],
  config: normalizeConfig({}),
  collections: []
};

app.use(express.json({ limit: '1mb' }));

app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'player-hub-v1 (2).html'));
});

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
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load feedback state:', error.message);
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

async function initializeConfigDatabase() {
  if (!DATABASE_URL) return;
  if (!pg?.Pool) {
    // eslint-disable-next-line no-console
    console.warn('DATABASE_URL is set but pg is unavailable. Falling back to file config storage.');
    return;
  }
  try {
    configDb = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
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

function nowIso() {
  return new Date().toISOString();
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

function requireAdmin(req, res, next) {
  const token = String(req.header('x-admin-token') || '').trim();
  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  next();
}

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    config: feedbackState.config,
    collections: feedbackState.collections,
    ai: {
      serverKeyConfigured: Boolean(CHAT_GPT_MINI_KEY),
      model: AI_QUESTION_MODEL
    },
    storage: {
      configDatabaseConnected: Boolean(configDb)
    }
  });
});

app.post('/api/ai/generate', async (req, res) => {
  if (!CHAT_GPT_MINI_KEY) {
    res.status(503).json({ ok: false, error: 'AI server key is not configured (CHAT_GPT_MINI_KEY).' });
    return;
  }

  const prompt = String(req.body?.prompt || '').trim();
  const model = String(req.body?.model || AI_QUESTION_MODEL).trim() || AI_QUESTION_MODEL;
  const temperatureRaw = Number(req.body?.temperature);
  const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2, temperatureRaw)) : 0.7;

  if (!prompt) {
    res.status(400).json({ ok: false, error: 'Prompt is required.' });
    return;
  }

  try {
    const response = await fetch(AI_QUESTION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHAT_GPT_MINI_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You create accurate facilitator game content. Output strict JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(data?.error?.message || data?.error || response.statusText || 'Unknown AI error');
      res.status(502).json({ ok: false, error: `AI provider error: ${detail}` });
      return;
    }

    const content = String(data?.choices?.[0]?.message?.content || '').trim();
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
  res.json({ ok: true, config: feedbackState.config, collections: feedbackState.collections });
});

io.on('connection', socket => {
  socket.on('room:subscribe', key => {
    if (!isRoomKey(key)) return;
    socket.join(key);
  });

  socket.on('room:unsubscribe', key => {
    if (!isRoomKey(key)) return;
    socket.leave(key);
  });

  socket.on('shared:get', ({ key }, ack) => {
    if (!isRoomKey(key)) {
      ack?.({ ok: false, error: 'Invalid room key' });
      return;
    }
    const value = state.get(key) || null;
    ack?.({ ok: true, value });
  });

  socket.on('shared:set', ({ key, value }, ack) => {
    if (!isRoomKey(key)) {
      ack?.({ ok: false, error: 'Invalid room key' });
      return;
    }

    state.set(key, String(value ?? ''));
    schedulePersist();
    io.to(key).emit('shared:update', { key, value: state.get(key) });
    ack?.({ ok: true });
  });
});

loadStateFromDisk();
loadFeedbackStateFromDisk();
Promise.resolve()
  .then(() => initializeConfigDatabase())
  .then(() => loadConfigFromDatabase())
  .finally(() => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Player Hub realtime server listening on http://localhost:${PORT}`);
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
  persistStateToDisk();
  persistFeedbackStateToDisk();
  if (configDb) {
    configDb.end().catch(() => {});
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (persistTimer) clearTimeout(persistTimer);
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  persistStateToDisk();
  persistFeedbackStateToDisk();
  if (configDb) {
    configDb.end().catch(() => {});
  }
  process.exit(0);
});
