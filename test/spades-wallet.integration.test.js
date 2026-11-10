const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { io } = require('socket.io-client');

function emitAck(socket, eventName, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(3000).emit(eventName, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

function startTestServer(t, options = {}) {
  const dataDir = options.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'team-builder-test-'));
  const child = spawn(process.execPath, [...(options.preload ? ['--require', options.preload] : []), 'server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: '0',
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      ADMIN_TOKEN: 'integration-admin-token',
      ...options.env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  t.after(async () => {
    const exited = child.exitCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once('exit', resolve));
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 5000);
    const onData = chunk => {
      output += chunk.toString();
      const match = /listening on http:\/\/localhost:(\d+)/.exec(output);
      if (!match) return;
      clearTimeout(timer);
      resolve({ child, port: Number(match[1]), dataDir });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code !== null && code !== 0) reject(new Error(`Server exited with ${code}: ${output}`));
    });
  });
}

const { randomUUID } = require('node:crypto');
async function connection(t, port) {
  const client = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true }); t.after(() => client.close());
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); }); return client;
}
async function roomFixture(t) {
  const running = await startTestServer(t), socket = await connection(t, running.port), key = 'room:SPADE1';
  const host = { actorToken: 'spades_host_token_1234567890_abcdef', actorPlayerId: 'host', actorPlayerName: 'Host' };
  const room = { code: 'SPADE1', host: 'Host', roomType: 'private', participants: [{ id: 'host', name: 'Host', isHost: true }], currentActivity: null, activityState: {}, activityQueue: [], queueIndex: 0, queueActive: false, hostSettings: {}, access: { privateSession: false }, created: Date.now() };
  const response = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify(room) }); assert(response.ok, response.error);
  return { ...running, socket, key, host, room: JSON.parse(response.value) };
}
test('Spades socket setup, private dealing, stale actions, host control and pause survive restart', async t => {
  const f = await roomFixture(t); let room = f.room;
  const start = await emitAck(f.socket, 'shared:set', { key: f.key, ...f.host, value: JSON.stringify({ ...room, currentActivity: 'spades', activityState: { players: [{ hand: [{ rank: 14, suit: 'S' }] }] } }) }); assert(start.ok, start.error); room = JSON.parse(start.value); assert.equal(room.activityState.players.length, 0);
  let n = 0;
  const act = async (action, extra = {}) => { const r = await emitAck(f.socket, 'spades:action', { key: f.key, ...f.host, tableId: room.activityState.id, handId: room.activityState.handId, version: room.activityState.version, actionId: `action-${String(++n).padStart(16, '0')}`, action, ...extra }); if (r.value) room = JSON.parse(r.value); return r; };
  assert((await act('join', { position: 0 })).ok); assert((await act('computers')).ok); const tableId = room.activityState.id;
  assert((await act('new-match')).ok); assert.equal(room.activityState.id, tableId);
  assert((await act('join', { position: 0 })).ok); assert((await act('computers')).ok); assert((await act('configure', { amount: 250 })).ok); assert((await act('deal')).ok);
  const view = await emitAck(f.socket, 'spades:view', { key: f.key, ...f.host }); room = JSON.parse(view.value); assert.equal(view.private.cards.length, 13); assert(room.activityState.players.every(p => p.cardCount === 13 && !p.hand));
  const denied = await act('configure', { amount: 500 }); assert.equal(denied.ok, false);
  assert((await act('pause')).ok); const snapshot = room.activityState;
  const spoof = await emitAck(f.socket, 'shared:set', { key: f.key, ...f.host, value: JSON.stringify({ ...room, activityState: { ...snapshot, scores: [500, 0], phase: 'finished' } }) }); assert.equal(spoof.ok, false);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataDir, 'private-card-tables', 'SPADE1.json'))).players[0].hand.length, 13);
  const exited = new Promise(r => f.child.once('exit', r)); f.child.kill('SIGTERM'); await exited;
  const recovered = await startTestServer(t, { dataDir: f.dataDir }), reconnected = await connection(t, recovered.port);
  const resumed = await emitAck(reconnected, 'spades:view', { key: f.key, ...f.host }); assert(resumed.ok, resumed.error); assert.deepEqual(resumed.private.cards, view.private.cards); assert(JSON.parse(resumed.value).activityState.paused);
});
test('a verified Memory win earns points once, exchanges into coin chips, and refunds an interrupted table', async t => {
  const f = await roomFixture(t); let room = f.room;
  const auth = { walletId: randomUUID(), walletToken: 'a'.repeat(64) };
  assert((await emitAck(f.socket, 'wallet:open', auth)).ok);
  assert((await emitAck(f.socket, 'wallet:action', { ...auth, key: f.key, ...f.host, action: 'sync' })).ok);
  const guest = { actorToken: 'spades_guest_token_1234567890_abcdef', playerId: 'guest', playerName: 'Guest' };
  const joined = await emitAck(f.socket, 'room:join', { key: f.key, ...guest }); assert(joined.ok, joined.error);
  room = JSON.parse((await emitAck(f.socket, 'shared:get', { key: f.key })).value);
  const start = await emitAck(f.socket, 'shared:set', { key: f.key, ...f.host, value: JSON.stringify({ ...room, currentActivity: 'memory', activityState: { pairCount: 6 } }) }); assert(start.ok, start.error); room = JSON.parse(start.value);
  await new Promise(r => setTimeout(r, 350));
  const deck = JSON.parse(fs.readFileSync(path.join(f.dataDir, 'room-meta.json')))[f.key].memory.deck;
  for (let value = 0; value < 6; value++) for (const index of deck.flatMap((c, i) => c === value ? [i] : [])) {
    const r = await emitAck(f.socket, 'memory:action', { key: f.key, ...f.host, action: 'flip', gameId: room.activityState.id, version: room.activityState.version, index }); assert(r.ok, r.error); room = JSON.parse(r.value);
  }
  assert.equal(room.activityState.phase, 'finished');
  const sync = () => emitAck(f.socket, 'wallet:action', { ...auth, key: f.key, ...f.host, action: 'sync' });
  let wallet = (await sync()).wallet; assert.equal(wallet.points, 20); assert.equal((await sync()).wallet.points, 20);
  const exchange = { ...auth, action: 'exchange', amount: 20, actionId: 'exchange-0000000001' };
  assert.equal((await emitAck(f.socket, 'wallet:action', exchange)).wallet.coins, 20);
  assert.equal((await emitAck(f.socket, 'wallet:action', exchange)).wallet.coins, 20);
  const blackjack = await emitAck(f.socket, 'shared:set', { key: f.key, ...f.host, value: JSON.stringify({ ...room, currentActivity: 'blackjack', activityState: {} }) }); assert(blackjack.ok, blackjack.error); room = JSON.parse(blackjack.value);
  const cardAction = async (action, num) => { const r = await emitAck(f.socket, 'cards:action', { key: f.key, ...f.host, action, actionId: `card-action-${String(num).padStart(16, '0')}`, tableId: room.activityState.id, handId: room.activityState.handId, version: room.activityState.version }); if (r.value) room = JSON.parse(r.value); return r; };
  assert((await cardAction('funding', 1)).ok); assert(room.activityState.coinMode);
  const buy = { ...auth, key: f.key, ...f.host, action: 'buy-in', amount: 20, actionId: 'buyin-000000000001', tableId: room.activityState.id, version: room.activityState.version };
  const bought = await emitAck(f.socket, 'wallet:action', buy); assert(bought.ok, bought.error); room = JSON.parse(bought.value); assert.equal(bought.wallet.coins, 0); assert.equal(room.activityState.players[0].stack, 20);
  assert.equal((await emitAck(f.socket, 'wallet:action', buy)).wallet.coins, 0, 'retry must not double-debit');
  const exited = new Promise(r => f.child.once('exit', r)); f.child.kill('SIGTERM'); await exited;
  const restarted = await startTestServer(t, { dataDir: f.dataDir }); f.socket = await connection(t, restarted.port);
  const restored = await emitAck(f.socket, 'cards:view', { key: f.key, ...f.host }); assert(restored.ok, restored.error); room = JSON.parse(restored.value);
  assert(room.activityState.coinMode); assert.equal(room.activityState.players[0].stack, 20);
  assert.equal((await sync()).wallet.coins, 0, 'restart restores escrow without recrediting the wallet');
  assert.equal((await cardAction('reset', 2)).ok, false);
  assert.equal((await cardAction('add-chips', 3)).ok, false);
  assert((await cardAction('deal', 4)).ok);
  const total = room.activityState.players[0].stack + (room.activityState.phase === 'playing' ? room.activityState.players[0].total : 0);
  const closed = await emitAck(f.socket, 'shared:set', { key: f.key, ...f.host, value: JSON.stringify({ ...room, currentActivity: null, activityState: {} }) }); assert(closed.ok, closed.error);
  assert.equal((await sync()).wallet.coins, total);
  assert.equal((await sync()).wallet.points, 0);
  const denied = await emitAck(f.socket, 'wallet:action', { ...auth, walletToken: 'b'.repeat(64), action: 'exchange', amount: 1, actionId: 'forged-0000000001' }); assert.equal(denied.ok, false);
});
test('queued verified rewards survive activity removal and restart without duplicate credit', async t => {
  const f = await roomFixture(t), auth = { walletId: randomUUID(), walletToken: 'd'.repeat(64) };
  assert((await emitAck(f.socket, 'wallet:open', auth)).ok);
  const stop = async child => { const exited = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); await exited; };
  await stop(f.child);
  const outbox = { 'checkers:completed-match:host': { key: 'checkers:completed-match:host', playerId: 'host', walletId: auth.walletId, value: 30, label: 'Checkers win' } };
  const pendingFile = path.join(f.dataDir, 'coin-reward-outbox.json');
  // Represents an already-verified award queued before a storage interruption.
  fs.writeFileSync(pendingFile, JSON.stringify(outbox), { mode: 0o600 });
  let restarted = await startTestServer(t, { dataDir: f.dataDir }); let socket = await connection(t, restarted.port);
  assert.equal((await emitAck(socket, 'wallet:open', auth)).wallet.points, 30);
  assert.deepEqual(JSON.parse(fs.readFileSync(pendingFile)), {});
  await stop(restarted.child); fs.writeFileSync(pendingFile, JSON.stringify(outbox));
  restarted = await startTestServer(t, { dataDir: f.dataDir }); socket = await connection(t, restarted.port);
  assert.equal((await emitAck(socket, 'wallet:open', auth)).wallet.points, 30, 'replayed delivery cannot double-credit');
});
