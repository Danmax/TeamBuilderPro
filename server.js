const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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
let persistTimer = null;
let feedbackPersistTimer = null;

const feedbackState = {
  feedback: [],
  config: {
    branding: {
      appName: 'Player Hub',
      tagline: 'Team building, games, and challenges - all in one place',
      accent: '#00d2d3'
    },
    preferences: {
      enableFeedbackHub: true
    }
  }
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
      feedbackState.config = {
        ...feedbackState.config,
        ...parsed.config,
        branding: {
          ...feedbackState.config.branding,
          ...(parsed.config.branding || {})
        },
        preferences: {
          ...feedbackState.config.preferences,
          ...(parsed.config.preferences || {})
        }
      };
    }
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
    config: feedbackState.config
  });
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
  res.json({ ok: true, config: feedbackState.config });
});

app.put('/api/admin/config', requireAdmin, (req, res) => {
  const branding = req.body?.branding || {};
  const preferences = req.body?.preferences || {};

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
    ...feedbackState.config.preferences,
    enableFeedbackHub: Boolean(preferences.enableFeedbackHub ?? feedbackState.config.preferences.enableFeedbackHub)
  };

  scheduleFeedbackPersist();
  res.json({ ok: true, config: feedbackState.config });
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

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Player Hub realtime server listening on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  if (persistTimer) clearTimeout(persistTimer);
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  persistStateToDisk();
  persistFeedbackStateToDisk();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (persistTimer) clearTimeout(persistTimer);
  if (feedbackPersistTimer) clearTimeout(feedbackPersistTimer);
  persistStateToDisk();
  persistFeedbackStateToDisk();
  process.exit(0);
});
