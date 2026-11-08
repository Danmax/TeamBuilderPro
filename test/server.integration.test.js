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

function startTestServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-builder-test-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: '0',
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      ADMIN_TOKEN: 'integration-admin-token'
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
      resolve({ child, port: Number(match[1]) });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code !== null && code !== 0) reject(new Error(`Server exited with ${code}: ${output}`));
    });
  });
}

test('room mutations require participant identity and host controls require the host', async t => {
  const { port } = await startTestServer(t);
  const baseUrl = `http://127.0.0.1:${port}`;
  const socket = io(baseUrl, { transports: ['websocket'], forceNew: true });
  t.after(() => socket.close());
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  const key = 'room:ABC123';
  const roomToken = 'room_access_token_1234567890';
  const hostToken = 'host_actor_token_1234567890_abcdef';
  const guestToken = 'guest_actor_token_1234567890_abcdef';
  const room = {
    code: 'ABC123',
    roomType: 'private',
    host: 'Host',
    participants: [{ id: 'host-1', name: 'Host', avatar: '🎯', isHost: true }],
    currentActivity: null,
    activityState: {},
    activityQueue: [],
    queueSchedule: [],
    queueIndex: 0,
    queueActive: false,
    queueTiming: {},
    access: { privateSession: false },
    hostSettings: { privateSession: false },
    created: Date.now(),
    lastUpdate: Date.now()
  };

  const created = await emitAck(socket, 'shared:set', {
    key,
    value: JSON.stringify(room),
    authToken: roomToken,
    actorToken: hostToken,
    actorPlayerId: 'host-1',
    actorPlayerName: 'Host',
    userToken: 'u_integrationhost123'
  });
  assert.equal(created.ok, true);

  const anonymousWrite = await emitAck(socket, 'shared:set', {
    key,
    value: JSON.stringify({ ...room, currentActivity: 'bingo' })
  });
  assert.equal(anonymousWrite.ok, false);

  const joined = await emitAck(socket, 'room:join', {
    key,
    actorToken: guestToken,
    playerId: 'guest-1',
    playerName: 'Guest',
    playerAvatar: '🙂'
  });
  assert.equal(joined.ok, true);
  const joinedRoom = JSON.parse(joined.value);

  const guestHostChange = await emitAck(socket, 'shared:set', {
    key,
    actorToken: guestToken,
    actorPlayerId: 'guest-1',
    value: JSON.stringify({ ...joinedRoom, currentActivity: 'bingo' })
  });
  assert.equal(guestHostChange.ok, false);

  const guestActivityUpdate = await emitAck(socket, 'shared:set', {
    key,
    actorToken: guestToken,
    actorPlayerId: 'guest-1',
    value: JSON.stringify({ ...joinedRoom, activityState: { answers: { Guest: 'A' } } })
  });
  assert.equal(guestActivityUpdate.ok, true);

  // The host starts a survey with session-scoped questions. Guests see the same
  // board but cannot reveal answers, change scores, or replace its content.
  const surveyState = {
    questions: [{ prompt: 'Name a planet.', answers: [{ text: 'Earth', points: 60 }, { text: 'Mars', points: 40 }] }],
    questionOrder: [0], roundIndex: 0, scores: [0, 0], revealed: [false, false]
  };
  const hostSurvey = await emitAck(socket, 'shared:set', {
    key, authToken: roomToken, actorToken: hostToken, actorPlayerId: 'host-1',
    value: JSON.stringify({ ...JSON.parse(guestActivityUpdate.value), currentActivity: 'survey-clash', activityState: surveyState })
  });
  assert.equal(hostSurvey.ok, true);
  const surveyRoom = JSON.parse(hostSurvey.value);
  const guestReveal = await emitAck(socket, 'shared:set', {
    key, actorToken: guestToken, actorPlayerId: 'guest-1',
    value: JSON.stringify({ ...surveyRoom, activityState: { ...surveyState, revealed: [true, true] } })
  });
  assert.equal(guestReveal.ok, false);
  const guestContentChange = await emitAck(socket, 'shared:set', {
    key, actorToken: guestToken, actorPlayerId: 'guest-1',
    value: JSON.stringify({ ...surveyRoom, contentCollections: [{ name: 'Replacement', activities: {} }] })
  });
  assert.equal(guestContentChange.ok, false);
  const hostReveal = await emitAck(socket, 'shared:set', {
    key, authToken: roomToken, actorToken: hostToken, actorPlayerId: 'host-1',
    value: JSON.stringify({ ...surveyRoom, activityState: { ...surveyState, revealed: [true, false] } })
  });
  assert.equal(hostReveal.ok, true);
  const guestView = await emitAck(socket, 'shared:get', { key });
  assert.deepEqual(JSON.parse(guestView.value).activityState.revealed, [true, false]);
  const returnToSession = await emitAck(socket, 'shared:set', {
    key, authToken: roomToken, actorToken: hostToken, actorPlayerId: 'host-1',
    value: JSON.stringify({ ...JSON.parse(hostReveal.value), currentActivity: null, activityState: {} })
  });
  assert.equal(returnToSession.ok, true);
  assert.equal(JSON.parse(returnToSession.value).participants.length, 2);

  const guestDelete = await emitAck(socket, 'shared:delete', {
    key,
    actorToken: guestToken,
    actorPlayerId: 'guest-1'
  });
  assert.equal(guestDelete.ok, false);

  const hostDelete = await emitAck(socket, 'shared:delete', {
    key,
    authToken: roomToken,
    actorToken: hostToken,
    actorPlayerId: 'host-1'
  });
  assert.equal(hostDelete.ok, true);

  const configResponse = await fetch(`${baseUrl}/api/config`, {
    headers: { 'x-user-token': 'u_integrationuser123' }
  });
  assert.equal(configResponse.status, 200);
  assert.equal(configResponse.headers.get('content-security-policy')?.includes("object-src 'none'"), true);
  const config = await configResponse.json();
  assert.equal('communityHostAllowlist' in config.config.preferences, false);
});


test('admin Message Board preference persists and is returned to clients', async t => {
  const { port } = await startTestServer(t);
  const baseUrl = `http://127.0.0.1:${port}`;
  const response = await fetch(`${baseUrl}/api/admin/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'integration-admin-token' },
    body: JSON.stringify({ preferences: { enableMessageBoard: false } })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).config.preferences.enableMessageBoard, false);
  const publicResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal((await publicResponse.json()).config.preferences.enableMessageBoard, false);
});

test('Checkers supports late seating and validates turns, moves, stale requests, and host controls', async t => {
  const Checkers = require('../assets/js/games/checkers-core');
  const { port } = await startTestServer(t);
  const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
  t.after(() => socket.close());
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  const key = 'room:CHECK1';
  const host = { actorToken: 'checkers_host_token_1234567890_abcdef', actorPlayerId: 'host-check', actorPlayerName: 'Host' };
  const guest = { actorToken: 'checkers_guest_token_1234567890_abcdef', actorPlayerId: 'guest-check', actorPlayerName: 'Guest' };
  const spectator = { actorToken: 'checkers_spectator_token_1234567890', actorPlayerId: 'watch-check', actorPlayerName: 'Watcher' };
  let room = { code: 'CHECK1', host: 'Host', roomType: 'private', participants: [{ id: 'host-check', name: 'Host', isHost: true }], currentActivity: null, activityState: {}, activityQueue: [], queueSchedule: [], queueIndex: 0, queueActive: false, queueTiming: {}, hostSettings: {}, access: {}, created: Date.now() };
  const created = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify(room) });
  assert.equal(created.ok, true, created.error);
  room = JSON.parse(created.value);
  const started = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, currentActivity: 'checkers', activityState: {} }) });
  assert.equal(started.ok, true);
  assert.equal(JSON.parse(started.value).activityState.phase, 'waiting');
  const join = await emitAck(socket, 'room:join', { key, actorToken: guest.actorToken, playerId: guest.actorPlayerId, playerName: 'Guest' });
  assert.equal(join.ok, true);
  room = JSON.parse(join.value);
  const action = (actor, name, extra = {}) => emitAck(socket, 'checkers:action', { key, ...actor, action: name, gameId: room.activityState.startedAt, moveNumber: room.activityState.moveNumber, ...extra });
  const seated = await action(guest, 'join');
  assert.equal(seated.ok, true, seated.error);
  room = JSON.parse(seated.value);
  assert.equal(room.activityState.players.r.playerId, guest.actorPlayerId);
  assert.equal(room.activityState.phase, 'playing');
  const watched = await emitAck(socket, 'room:join', { key, actorToken: spectator.actorToken, playerId: spectator.actorPlayerId, playerName: 'Watcher' });
  room = JSON.parse(watched.value);
  assert.equal((await action(guest, 'move', { from: 17, to: 24 })).ok, false);
  assert.equal((await action(spectator, 'move', { from: 40, to: 33 })).ok, false);
  assert.equal((await action(host, 'move', { from: 40, to: 39 })).ok, false);
  const move = Checkers.legalMoves(room.activityState)[0];
  const before = room.activityState.moveNumber;
  socket.emit('room:subscribe', { key });
  const update = new Promise(resolve => socket.once('shared:update', resolve));
  const moved = await action(host, 'move', move);
  assert.equal(moved.ok, true, moved.error);
  assert.equal(JSON.parse((await update).value).activityState.board[move.to], 'b');
  room = JSON.parse(moved.value);
  assert.equal(room.activityState.turn, 'r');
  const stale = await action(host, 'move', { ...move, moveNumber: before });
  assert.equal(stale.ok, false);
  assert.match(stale.error, /board changed/);
  assert.equal((await action(guest, 'restart')).ok, false);
  const tamper = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, activityState: { ...room.activityState, winner: 'b' } }) });
  assert.equal(tamper.ok, false);
  const redMove = Checkers.legalMoves(room.activityState)[0];
  const replied = await action(guest, 'move', redMove);
  assert.equal(replied.ok, true, replied.error);
  room = JSON.parse(replied.value);
  const restarted = await action(host, 'restart');
  assert.equal(restarted.ok, true);
  room = JSON.parse(restarted.value);
  assert.equal(room.activityState.moveNumber, 0);
  assert.equal(room.activityState.board.filter(Boolean).length, 24);
  const queuedRestart = await emitAck(socket, 'shared:set', {
    key, ...host, value: JSON.stringify({ ...room, queueActive: true, queueIndex: 1, activityQueue: ['checkers'], activityState: {} })
  });
  assert.equal(queuedRestart.ok, true, queuedRestart.error);
  room = JSON.parse(queuedRestart.value);
  assert.equal(room.activityState.board.filter(Boolean).length, 24);

  const ended = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, currentActivity: null, activityState: {} }) });
  assert.equal(ended.ok, true);
  assert.equal(JSON.parse(ended.value).participants.length, 3);
});
