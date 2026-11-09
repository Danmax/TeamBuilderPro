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
  const restarted = await action(host, 'restart', { rules: { flyingKings: true, mandatoryCaptures: false } });
  assert.equal(restarted.ok, true);
  room = JSON.parse(restarted.value);
  assert.equal(room.activityState.moveNumber, 0);
  assert.equal(room.activityState.board.filter(Boolean).length, 24);
  assert.deepEqual(room.activityState.rules, { flyingKings: true, mandatoryCaptures: false });
  const preserved = await action(host, 'restart');
  assert.equal(preserved.ok, true);
  room = JSON.parse(preserved.value);
  assert.deepEqual(room.activityState.rules, { flyingKings: true, mandatoryCaptures: false });

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

test('Memory keeps answers private, validates turns, hides mismatches, and recovers a pending reveal after server restart', async t => {
  const running = await startTestServer(t);
  const key = 'room:MEMORY';
  const host = { actorToken: 'memory_host_token_1234567890_abcdef', actorPlayerId: 'memory-host', actorPlayerName: 'Host' };
  const guest = { actorToken: 'memory_guest_token_1234567890_abcdef', actorPlayerId: 'memory-guest', actorPlayerName: 'Guest' };
  const connect = async port => {
    const client = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    t.after(() => client.close());
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
  };
  let socket = await connect(running.port);
  let room = { code: 'MEMORY', host: 'Host', roomType: 'private', participants: [{ id: 'memory-host', name: 'Host', isHost: true }], currentActivity: null, activityState: {}, activityQueue: [], queueIndex: 0, queueActive: false, hostSettings: {}, access: {}, created: Date.now() };
  const created = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify(room) });
  assert.equal(created.ok, true, created.error);
  room = JSON.parse(created.value);
  const started = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, currentActivity: 'memory', activityState: {} }) });
  assert.equal(started.ok, true, started.error);
  room = JSON.parse(started.value);
  assert.equal(room.activityState.cards.length, 16);
  assert.ok(room.activityState.cards.every(card => card.value === null));
  assert.equal('deck' in room.activityState, false);
  await new Promise(resolve => setTimeout(resolve, 350));
  const readSecret = () => JSON.parse(fs.readFileSync(path.join(running.dataDir, 'room-meta.json'), 'utf8'))[key].memory;
  const firstSecret = readSecret();
  assert.equal(firstSecret.gameId, room.activityState.id);
  const action = async (actor, name, extra = {}) => emitAck(socket, 'memory:action', { key, ...actor, action: name, gameId: room.activityState.id, version: room.activityState.version, ...extra });
  const pair = firstSecret.deck.flatMap((value, index) => value === firstSecret.deck[0] ? [index] : []);
  const flip = await action(host, 'flip', { index: pair[0] });
  assert.equal(flip.ok, true, flip.error);
  room = JSON.parse(flip.value);
  assert.equal(room.activityState.cards.filter(card => card.value !== null).length, 1);
  assert.equal((await action(host, 'flip', { index: pair[0] })).ok, false);
  assert.equal((await action(host, 'flip', { index: pair[1], version: 0 })).ok, false);
  const tamper = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, activityState: { ...room.activityState, pairsMatched: 8 } }) });
  assert.equal(tamper.ok, false);
  const joinedRoom = await emitAck(socket, 'room:join', { key, actorToken: guest.actorToken, playerId: guest.actorPlayerId, playerName: 'Guest' });
  room = JSON.parse(joinedRoom.value);
  const joinedRound = await action(guest, 'join');
  assert.equal(joinedRound.ok, true);
  room = JSON.parse(joinedRound.value);
  assert.equal(room.activityState.players[1].score, 0);
  assert.equal((await action(guest, 'flip', { index: pair[1] })).ok, false);
  assert.equal((await action(guest, 'restart')).ok, false);
  const matched = await action(host, 'flip', { index: pair[1] });
  assert.equal(matched.ok, true);
  room = JSON.parse(matched.value);
  assert.equal(room.activityState.players[0].score, 1);
  assert.equal(room.activityState.turnId, host.actorPlayerId);
  const remaining = firstSecret.deck.map((_, index) => index).filter(index => !pair.includes(index));
  const one = remaining[0], two = remaining.find(index => firstSecret.deck[index] !== firstSecret.deck[one]);
  room = JSON.parse((await action(host, 'flip', { index: one })).value);
  room = JSON.parse((await action(host, 'flip', { index: two })).value);
  assert.equal(room.activityState.flipped.length, 2);
  const waitForHidden = client => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.off('shared:update', listener); reject(new Error('Memory mismatch did not resolve')); }, 4000);
    const listener = payload => {
      const snapshot = JSON.parse(payload.value);
      if (payload.key !== key || snapshot.activityState?.flipped?.length !== 0) return;
      clearTimeout(timer); client.off('shared:update', listener); resolve(snapshot);
    };
    client.on('shared:update', listener);
  });
  socket.emit('room:subscribe', { key });
  room = await waitForHidden(socket);
  assert.equal(room.activityState.turnId, guest.actorPlayerId);
  assert.equal(room.activityState.cards[one].value, null);
  assert.equal(room.activityState.cards[pair[0]].matchedBy, host.actorPlayerId);
  room = JSON.parse((await action(guest, 'flip', { index: one })).value);
  const left = await emitAck(socket, 'room:leave', { key, ...guest });
  assert.equal(left.ok, true);
  room = JSON.parse((await emitAck(socket, 'shared:get', { key })).value);
  assert.equal(room.activityState.turnId, host.actorPlayerId);
  assert.equal(room.activityState.flipped.length, 0);
  const restarted = await action(host, 'restart', { theme: 'space', pairCount: 12 });
  assert.equal(restarted.ok, true);
  room = JSON.parse(restarted.value);
  assert.equal(room.activityState.cards.length, 24);
  assert.equal(room.activityState.theme, 'space');
  await new Promise(resolve => setTimeout(resolve, 350));
  const savedSecret = readSecret();
  const different = savedSecret.deck.findIndex(value => value !== savedSecret.deck[0]);
  room = JSON.parse((await action(host, 'flip', { index: 0 })).value);
  room = JSON.parse((await action(host, 'flip', { index: different })).value);
  const gameId = room.activityState.id;
  socket.close();
  const exited = new Promise(resolve => running.child.once('exit', resolve));
  running.child.kill('SIGTERM'); await exited;
  const resumed = await startTestServer(t, { dataDir: running.dataDir });
  socket = await connect(resumed.port);
  room = JSON.parse((await emitAck(socket, 'shared:get', { key })).value);
  assert.equal(room.activityState.id, gameId);
  socket.emit('room:subscribe', { key });
  if (room.activityState.flipped.length === 2) room = await waitForHidden(socket);
  assert.equal(room.activityState.flipped.length, 0);
  const resumedFlip = await action(host, 'flip', { index: 0 });
  assert.equal(resumedFlip.ok, true, resumedFlip.error);
  room = JSON.parse(resumedFlip.value);
  const queued = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, queueActive: true, activityQueue: ['memory'], queueIndex: 1, activityState: { theme: 'food', pairCount: 6 } }) });
  assert.equal(queued.ok, true, queued.error);
  room = JSON.parse(queued.value);
  assert.equal(room.activityState.cards.length, 12);
  assert.equal(room.activityState.theme, 'food');
  const ended = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, currentActivity: null, activityState: {} }) });
  assert.equal(ended.ok, true);
});

test('Chinese Checkers validates six-player setup and turns and restores a paused hop chain after restart', async t => {
  const C = require('../assets/js/games/chinese-checkers-core');
  const running = await startTestServer(t);
  const key = 'room:STAR66';
  const actors = Array.from({ length: 7 }, (_, index) => ({ actorToken: `chinese_actor_token_${index}_1234567890_abcdef`, actorPlayerId: `star-${index}`, actorPlayerName: index ? `Guest ${index}` : 'Host' }));
  const connect = async port => {
    const client = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    t.after(() => client.close());
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
  };
  let socket = await connect(running.port);
  let room = { code: 'STAR66', host: 'Host', roomType: 'private', participants: [{ id: 'star-0', name: 'Host', isHost: true }], currentActivity: null, activityState: {}, activityQueue: [], queueIndex: 0, queueActive: false, hostSettings: {}, access: {}, created: Date.now() };
  const created = await emitAck(socket, 'shared:set', { key, ...actors[0], value: JSON.stringify(room) });
  assert.equal(created.ok, true, created.error); room = JSON.parse(created.value);
  const launched = await emitAck(socket, 'shared:set', { key, ...actors[0], value: JSON.stringify({ ...room, currentActivity: 'chinese-checkers', activityState: {} }) });
  assert.equal(launched.ok, true, launched.error); room = JSON.parse(launched.value);
  assert.equal(room.activityState.phase, 'setup');
  assert.equal(Object.keys(room.activityState.board).length, 121);
  const action = async (actor, name, extra = {}) => {
    const result = await emitAck(socket, 'chinese-checkers:action', { key, ...actor, action: name, gameId: room.activityState.id, version: room.activityState.version, ...extra });
    if (result.ok) room = JSON.parse(result.value);
    return result;
  };
  assert.equal((await action(actors[0], 'start')).ok, false);
  assert.equal((await action(actors[0], 'configure', { playerCount: 6 })).ok, true);
  for (let index = 1; index < actors.length; index++) {
    const actor = actors[index];
    const joined = await emitAck(socket, 'room:join', { key, actorToken: actor.actorToken, playerId: actor.actorPlayerId, playerName: actor.actorPlayerName });
    assert.equal(joined.ok, true); room = JSON.parse(joined.value);
    if (index < 6) assert.equal((await action(actor, 'join', { seatIndex: index })).ok, true);
  }
  assert.equal((await action(actors[6], 'join', { seatIndex: 0 })).ok, false);
  assert.equal((await action(actors[1], 'start')).ok, false);
  assert.equal((await action(actors[0], 'start')).ok, true);
  assert.equal((await action(actors[6], 'join')).ok, false);
  assert.equal((await action(actors[0], 'configure', { playerCount: 2 })).ok, false);
  assert.equal((await action(actors[0], 'pass')).ok, false);
  const first = C.allLegalMoves(room.activityState).find(move => move.kind === 'step');
  assert.equal((await action(actors[1], 'move', first)).ok, false);
  assert.equal((await action(actors[6], 'move', first)).ok, false);
  const tampered = await emitAck(socket, 'shared:set', { key, ...actors[0], value: JSON.stringify({ ...room, activityState: { ...room.activityState, winner: actors[0].actorPlayerId } }) });
  assert.equal(tampered.ok, false);
  const oldVersion = room.activityState.version;
  for (let index = 0; index < 6; index++) {
    assert.equal(room.activityState.turnIndex, index);
    const choice = C.allLegalMoves(room.activityState).find(move => move.kind === 'step');
    assert.equal((await action(actors[index], 'move', choice)).ok, true);
  }
  assert.equal(room.activityState.turnIndex, 0);
  assert.equal((await action(actors[0], 'move', { ...first, version: oldVersion })).ok, false);
  let chain = null;
  const last = {};
  for (let attempt = 0; attempt < 80 && !chain; attempt++) {
    const game = room.activityState, index = game.turnIndex;
    const choices = C.allLegalMoves(game);
    chain = choices.find(move => C.move(game, actors[index].actorPlayerId, move.from, move.to).jumpPath.length);
    if (chain) break;
    const camp = C.CAMP_HOLES[game.seats[index].goal].map(id => C.BY_ID[id]);
    const q = camp.reduce((sum, hole) => sum + hole.q, 0) / 10, r = camp.reduce((sum, hole) => sum + hole.r, 0) / 10;
    const distance = id => { const hole = C.BY_ID[id], dq = hole.q - q, dr = hole.r - r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
    const score = move => distance(move.from) - distance(move.to) - (last[index] === move.to ? 3 : 0);
    choices.sort((a, b) => score(b) - score(a)); last[index] = choices[0].from;
    assert.equal((await action(actors[index], 'move', choices[0])).ok, true);
  }
  assert.ok(chain, 'a reachable multi-hop position must be exercised');
  const activeIndex = room.activityState.turnIndex;
  assert.equal((await action(actors[activeIndex], 'move', chain)).ok, true);
  const path = room.activityState.jumpPath;
  assert.ok(path.length >= 2);
  assert.equal((await action(actors[(activeIndex + 1) % 6], 'end-turn')).ok, false);
  assert.equal((await action(actors[1], 'pause', { paused: true })).ok, false);
  assert.equal((await action(actors[0], 'pause', { paused: true })).ok, true);
  assert.equal((await action(actors[activeIndex], 'end-turn')).ok, false);
  socket.close();
  const exited = new Promise(resolve => running.child.once('exit', resolve)); running.child.kill('SIGTERM'); await exited;
  const resumed = await startTestServer(t, { dataDir: running.dataDir });
  socket = await connect(resumed.port);
  room = JSON.parse((await emitAck(socket, 'shared:get', { key })).value);
  assert.deepEqual(room.activityState.jumpPath, path);
  assert.equal(room.activityState.paused, true);
  assert.equal((await action(actors[0], 'pause', { paused: false })).ok, true);
  assert.equal((await action(actors[activeIndex], 'end-turn')).ok, true);
  assert.equal(room.activityState.turnIndex, (activeIndex + 1) % 6);
  assert.deepEqual(room.activityState.jumpPath, []);
  const previousId = room.activityState.id;
  assert.equal((await action(actors[1], 'restart')).ok, false);
  assert.equal((await action(actors[0], 'restart')).ok, true);
  assert.notEqual(room.activityState.id, previousId);
  assert.equal(room.activityState.phase, 'setup');
  assert.equal(room.activityState.seats.filter(Boolean).length, 6);
  const queued = await emitAck(socket, 'shared:set', { key, ...actors[0], value: JSON.stringify({ ...room, queueActive: true, queueIndex: 1, activityQueue: ['chinese-checkers'], activityState: { playerCount: 3 } }) });
  assert.equal(queued.ok, true, queued.error); room = JSON.parse(queued.value);
  assert.equal(room.activityState.playerCount, 3);
  assert.equal(room.activityState.seats.filter(Boolean).length, 1);
  const ended = await emitAck(socket, 'shared:set', { key, ...actors[0], value: JSON.stringify({ ...room, currentActivity: null, activityState: {} }) });
  assert.equal(ended.ok, true);
});

test('Chinese Checkers computers are host managed and take server turns across pause, restart and rematch', async t => {
  const C = require('../assets/js/games/chinese-checkers-core');
  const running = await startTestServer(t);
  const connect = async port => {
    const client = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    t.after(() => client.close());
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
  };
  let socket = await connect(running.port);
  const key = 'room:BOT123';
  const host = { actorToken: 'computer_host_token_1234567890_abcdef', actorPlayerId: 'bot-host', actorPlayerName: 'Host' };
  const guest = { actorToken: 'computer_guest_token_1234567890_abcdef', actorPlayerId: 'bot-guest', actorPlayerName: 'Guest' };
  let room = { code: 'BOT123', host: 'Host', roomType: 'private', participants: [{ id: host.actorPlayerId, name: 'Host', isHost: true, isComputer: true }], currentActivity: 'chinese-checkers', activityState: {}, activityQueue: [], queueIndex: 0, queueActive: false, hostSettings: {}, access: {}, created: Date.now() };
  const created = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify(room) });
  assert.equal(created.ok, true, created.error); room = JSON.parse(created.value);
  assert.equal(room.activityState.seats[0].isComputer, false, 'clients cannot mark real participants as computers');
  const action = async (actor, name, extra = {}) => {
    const response = await emitAck(socket, 'chinese-checkers:action', { key, ...actor, action: name, gameId: room.activityState.id, version: room.activityState.version, ...extra });
    if (response.ok) room = JSON.parse(response.value);
    return response;
  };
  const joined = await emitAck(socket, 'room:join', { key, actorToken: guest.actorToken, playerId: guest.actorPlayerId, playerName: guest.actorPlayerName });
  room = JSON.parse(joined.value);
  assert.equal((await action(guest, 'fill-computers')).ok, false);
  assert.equal((await action(host, 'remove-computer', { seatIndex: 0 })).ok, false);
  assert.equal((await action(host, 'fill-computers')).ok, true);
  const botId = room.activityState.seats[1].playerId;
  assert.equal((await emitAck(socket, 'room:join', { key, actorToken: guest.actorToken, playerId: botId, playerName: 'Imposter' })).ok, false);
  assert.equal((await action(guest, 'remove-computer', { seatIndex: 1 })).ok, false);
  assert.equal((await action(host, 'remove-computer', { seatIndex: 1 })).ok, true);
  assert.equal(room.activityState.seats[1], null);
  assert.equal((await action(host, 'play-computer')).ok, true);
  assert.equal(room.activityState.phase, 'playing');
  assert.equal((await action(host, 'remove-computer', { seatIndex: 1 })).ok, false);
  const humanMove = C.allLegalMoves(room.activityState).find(move => move.kind === 'step');
  assert.equal((await action(host, 'move', humanMove)).ok, true);
  assert.equal(room.activityState.turnIndex, 1);
  assert.equal((await action(guest, 'move', C.allLegalMoves(room.activityState)[0])).ok, false);
  assert.equal((await action(host, 'pause', { paused: true })).ok, true);
  const pausedVersion = room.activityState.version;
  await new Promise(resolve => setTimeout(resolve, 900));
  const snapshot = await emitAck(socket, 'shared:get', { key });
  assert.equal(JSON.parse(snapshot.value).activityState.version, pausedVersion);
  // Persist while a computer owns the next turn, then resume on a new server.
  await new Promise(resolve => { running.child.once('exit', resolve); running.child.kill('SIGTERM'); });
  socket.close();
  const restarted = await startTestServer(t, { dataDir: running.dataDir });
  socket = await connect(restarted.port);
  const rejoined = await emitAck(socket, 'room:join', { key, actorToken: host.actorToken, playerId: host.actorPlayerId, playerName: host.actorPlayerName });
  assert.equal(rejoined.ok, true); room = JSON.parse(rejoined.value);
  const finishedTurn = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Computer did not complete its turn')), 5000);
    const listener = update => {
      if (update.key !== key) return;
      const nextRoom = JSON.parse(update.value);
      if (nextRoom.activityState.moves !== 2) return;
      clearTimeout(timer); socket.off('shared:update', listener); resolve(nextRoom);
    };
    socket.on('shared:update', listener);
  });
  assert.equal((await action(host, 'pause', { paused: false })).ok, true);
  room = await finishedTurn;
  assert.equal(room.activityState.turnIndex, 0);
  assert.deepEqual(room.activityState.jumpPath, []);
  assert.equal(room.activityState.lastMove.playerId, room.activityState.seats[1].playerId);
  const oldId = room.activityState.id;
  assert.equal((await action(host, 'restart')).ok, true);
  assert.notEqual(room.activityState.id, oldId);
  assert.equal(room.activityState.seats[1].isComputer, true);
  assert.equal(room.activityState.moves, 0);
});

test('wheel locks predictions and permissions and settles after the spinner disconnects and server restarts', async t => {
  const running = await startTestServer(t);
  const connect = async port => {
    const client = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    t.after(() => client.close());
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
    return client;
  };
  let socket = await connect(running.port);
  const key = 'room:WHEEL9';
  const host = { actorToken: 'wheel_host_token_1234567890_abcdef', actorPlayerId: 'wheel-host', actorPlayerName: 'Host' };
  const guest = { actorToken: 'wheel_guest_token_1234567890_abcdef', actorPlayerId: 'wheel-guest', actorPlayerName: 'Guest' };
  let room = { code: 'WHEEL9', host: 'Host', participants: [{ id: host.actorPlayerId, name: 'Host' }], currentActivity: 'spin-wheel', activityState: { startedAt: 123, spinToken: 0, optionEntries: [{ label: 'Bonus', action: { type: 'points', points: 100 } }, { label: 'Cheers' }], wheelRotation: 0 }, activityQueue: [], queueIndex: 0, hostSettings: {}, access: {}, created: Date.now() };
  const created = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify(room) });
  assert.equal(created.ok, true, created.error); room = JSON.parse(created.value);
  const joined = await emitAck(socket, 'room:join', { key, actorToken: guest.actorToken, playerId: guest.actorPlayerId, playerName: guest.actorPlayerName });
  room = JSON.parse(joined.value);
  const action = async (actor, action, extra = {}) => {
    const result = await emitAck(socket, 'spin-wheel:action', { key, ...actor, action, startedAt: room.activityState.startedAt, spinToken: Number(room.activityState.spinToken) || 0, ...extra });
    if (result.ok) room = JSON.parse(result.value);
    return result;
  };
  assert.equal((await action(guest, 'spin')).ok, false);
  assert.equal((await action(guest, 'assign', { player: 'Guest' })).ok, false);
  assert.equal((await action(host, 'picks-enabled', { enabled: false })).ok, true);
  assert.equal((await action(guest, 'pick', { index: 0 })).ok, false);
  assert.equal((await action(host, 'picks-enabled', { enabled: true })).ok, true);
  assert.equal((await action(guest, 'pick', { index: 50 })).ok, false);
  assert.equal((await action(guest, 'pick', { index: 2 })).ok, true);
  assert.equal((await action(host, 'assign', { player: 'Guest' })).ok, true);
  assert.equal((await action(host, 'spin')).ok, false);
  assert.equal((await action(guest, 'spin')).ok, true);
  const spinToken = room.activityState.spinToken;
  assert.equal((await action(guest, 'pick', { index: 1 })).ok, false);
  assert.equal((await action(host, 'assign', { player: '' })).ok, false);
  assert.equal((await action(host, 'spin')).ok, false);
  const forged = await emitAck(socket, 'shared:set', { key, ...guest, value: JSON.stringify({ ...room, activityState: { ...room.activityState, currentResult: 'Forged' } }) });
  assert.equal(forged.ok, false);
  const edited = await emitAck(socket, 'shared:set', { key, ...host, value: JSON.stringify({ ...room, activityState: { ...room.activityState, title: 'Changed mid-spin' } }) });
  assert.equal(edited.ok, false);
  socket.close();
  await new Promise(resolve => { running.child.once('exit', resolve); running.child.kill('SIGTERM'); });
  const restarted = await startTestServer(t, { dataDir: running.dataDir });
  socket = await connect(restarted.port);
  for (let attempt = 0; attempt < 60; attempt++) {
    const read = await emitAck(socket, 'shared:get', { key }); room = JSON.parse(read.value);
    if (!room.activityState.isSpinning) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(room.activityState.isSpinning, false);
  assert.equal(room.activityState.spinToken, spinToken);
  assert.equal(room.activityState.history.length, 1);
  assert.equal(room.activityState.lastSpinner, 'Guest');
  assert.ok(['Bonus', 'Cheers'].includes(room.activityState.currentResult));
  assert.equal((await action(host, 'spin', { spinToken: spinToken - 1 })).ok, false);
  const firstClaim = await action(guest, 'claim-winner');
  assert.equal(firstClaim.claimed, room.activityState.currentResult === 'Bonus');
  assert.equal((await action(guest, 'claim-winner')).claimed, false);
});
