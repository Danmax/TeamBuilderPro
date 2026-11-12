const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

test('welcome name is saved by a delegated listener and survives an unfocused render', () => {
  class Input {}
  const input = Object.assign(new Input(), { id: 'playerName', value: 'Taylor' });
  let onInput;
  const context = vm.createContext({
    HTMLInputElement: Input,
    APP: { screen: 'welcome', branding: {} },
    draftPlayerName: '', selectedAvatar: '🙂', AVATAR_OPTIONS: ['🙂'],
    escapeHtml: value => String(value || '').replaceAll('<', '&lt;'),
    document: {
      addEventListener: (_event, listener) => { onInput = listener; },
      getElementById: id => id === 'playerName' ? input : {}
    }
  });
  vm.runInContext(section("document.addEventListener('input', event => {", "document.addEventListener('focusout'"), context);
  onInput({ target: input });
  assert.equal(context.draftPlayerName, 'Taylor');
  vm.runInContext(section('function renderWelcome()', 'function renderEditProfile()'), context);
  assert.match(context.renderWelcome(), /value="Taylor"/);
  assert.doesNotMatch(context.renderWelcome(), /oninput=/);
  // Autofill may change a field without dispatching input. Capture it before replacing the DOM.
  input.value = 'Taylor Smith';
  vm.runInContext(section('function render() {', '  const unoHandScroll') + '\n}', context);
  context.render();
  assert.match(context.renderWelcome(), /value="Taylor Smith"/);
});

function onboarding({ invite = true, fail = false } = {}) {
  const input = { value: 'Taylor' };
  let blurred = false;
  const context = vm.createContext({
    APP: { pendingJoinCode: invite ? 'PLAZA1' : '', pendingJoinToken: 'invite-token' },
    document: { getElementById: () => input, activeElement: { blur: () => { blurred = true; } } },
    draftPlayerName: 'Taylor', selectedAvatar: '🙂', AVATAR_OPTIONS: ['🙂'],
    normalizeName: name => name.trim(), normalizeRoomCode: code => code,
    normalizeRoomAccessToken: token => token,
    PlayerManager: { createProfile: async name => ({ id: 'guest', name }) },
    RoomManager: { joinRoom: async (code, id, name, avatar, token) => {
      assert.equal(code, 'PLAZA1'); assert.equal(name, 'Taylor'); assert.equal(token, 'invite-token');
      if (fail) throw new Error('Room is full');
      return { code, roomType: 'community' };
    } },
    isRoomPrivateSession: () => false,
    persistActiveSessionSnapshot() {}, startRoomSync() {},
    render: () => { assert.equal(blurred, true); },
    showError: message => { context.error = message; }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(require.resolve('../assets/js/room-session-core'), 'utf8'), context);
  context.persistActiveSessionSnapshot = () => {};
  context.startRoomSync = () => {};
  vm.runInContext(section('async function createPlayer()', 'async function copyJoinLink()'), context);
  return context;
}

test('Continue creates the profile and joins the community room from the QR invite', async () => {
  const context = onboarding();
  await context.createPlayer();
  assert.equal(context.APP.screen, 'lobby');
  assert.equal(context.APP.roomCode, 'PLAZA1');
  assert.equal(context.APP.pendingJoinCode, '');
});

test('a rejected invite keeps the join screen and room code available for retry', async () => {
  const context = onboarding({ fail: true });
  await context.createPlayer();
  assert.equal(context.APP.screen, 'join-room');
  assert.equal(context.APP.pendingJoinCode, 'PLAZA1');
  assert.equal(context.error, 'Room is full');
});

test('creating a profile without an invite still opens the dashboard', async () => {
  const context = onboarding({ invite: false });
  await context.createPlayer();
  assert.equal(context.APP.screen, 'dashboard');
});
