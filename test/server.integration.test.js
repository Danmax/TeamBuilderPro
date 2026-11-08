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
