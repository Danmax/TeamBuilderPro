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
let persistTimer = null;

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

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStateToDisk();
  }, 150);
}

function isRoomKey(key) {
  return /^room:[A-Z0-9]{6}$/.test(key || '');
}

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

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Player Hub realtime server listening on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistStateToDisk();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistStateToDisk();
  process.exit(0);
});
