const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function browser(overrides = {}) {
  const tokens = new Map();
  const context = {
    APP: { player: { id: 'guest' } },
    normalizeRoomAccessToken: token => token,
    getSocketClient: async () => ({ connected: true }),
    getStoredRoomActorToken: code => tokens.get(code) || '',
    setStoredRoomActorToken: (code, token) => tokens.set(code, token),
    createRoomActorToken: () => 'new-actor-token',
    setStoredRoomAccessToken() {},
    normalizeRoom: room => room,
    safeParseJson: JSON.parse,
    socketEmitAck: async () => ({ value: JSON.stringify({ code: 'PLAZA1' }) }),
    ...overrides
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/domain-managers'), 'utf8'), context);
  return context.RoomManager;
}

test('a QR visitor waits for the initial connection and joins through the server', async () => {
  let waited = false;
  const manager = browser({
    getSocketClient: async () => ({ connected: false }),
    waitForSocketConnection: async timeout => {
      assert.equal(timeout, 10000);
      waited = true;
      return true;
    },
    socketEmitAck: async (event, payload) => {
      assert.equal(waited, true);
      assert.equal(event, 'room:join');
      assert.equal(payload.key, 'room:PLAZA1');
      assert.equal(payload.playerId, 'guest');
      assert.equal('authToken' in payload, false);
      return { value: JSON.stringify({ code: 'PLAZA1' }) };
    }
  });
  assert.equal((await manager.joinRoom('PLAZA1', 'guest', 'Guest', '🙂')).code, 'PLAZA1');
});

test('a failed connection reports a connection error without attempting a shared room write', async () => {
  const manager = browser({
    getSocketClient: async () => ({ connected: false }),
    waitForSocketConnection: async () => false,
    Storage: { get: () => assert.fail('must not use the shared-storage fallback') }
  });
  await assert.rejects(manager.joinRoom('PLAZA1', 'guest', 'Guest', '🙂'), /Unable to connect to the lobby server/);
});

test('retrying after a lost join reply uses the same participant credential', async () => {
  let firstToken;
  let attempts = 0;
  const manager = browser({
    createRoomActorToken: () => `actor-token-${attempts}`,
    socketEmitAck: async (_event, payload) => {
      attempts++;
      assert.equal(payload.authToken, 'private-invite-token');
      if (attempts === 1) {
        firstToken = payload.actorToken;
        throw new Error('Socket timeout');
      }
      assert.equal(payload.actorToken, firstToken);
      return { value: JSON.stringify({ code: 'PLAZA1' }) };
    }
  });
  const join = () => manager.joinRoom('PLAZA1', 'guest', 'Guest', '🙂', 'private-invite-token');
  await assert.rejects(join(), /Socket timeout/);
  assert.equal((await join()).code, 'PLAZA1');
});
