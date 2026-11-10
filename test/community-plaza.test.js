const assert = require('node:assert/strict');
const test = require('node:test');
const { avatar, seedFor, filterRooms, status } = require('../assets/js/community-plaza-core');
const rooms = [
  { code: 'FULL01', title: 'Big party', participantCount: 4, maxParticipants: 4, presenceStatus: 'full', lastUpdate: 30 },
  { code: 'PLAY01', title: 'Quiz club', host: 'Kim', currentActivity: 'lightning-trivia', participantCount: 3, maxParticipants: 12, voiceEnabled: true, lastUpdate: 20 },
  { code: 'OPEN01', title: 'Coffee corner', host: 'Alex', description: 'Come say hello', participantCount: 2, maxParticipants: 8, lastUpdate: 10 },
  { code: 'OPEN02', title: 'Friday crew', host: 'Sam', participantCount: 1, maxParticipants: 8, lastUpdate: 40 }
];

test('discovery prioritizes open rooms, keeps full rooms distinct and filters by readiness, game and voice', () => {
  assert.deepEqual(filterRooms(rooms).map(room => room.code), ['OPEN02', 'OPEN01', 'PLAY01', 'FULL01']);
  assert.deepEqual(filterRooms(rooms, 'open').map(room => room.code), ['OPEN02', 'OPEN01']);
  assert.deepEqual(filterRooms(rooms, 'playing').map(room => room.code), ['PLAY01']);
  assert.deepEqual(filterRooms(rooms, 'voice').map(room => room.code), ['PLAY01']);
  assert.equal(status({ ...rooms[1], participantCount: 12 }), 'full');
  assert.equal(status({ ...rooms[2], participantCount: 9, presenceStatus: 'open' }), 'full', 'capacity wins over a stale open label');
});

test('search matches names, host, description, code and visible game label without changing the source', () => {
  for (const query of ['COFFEE', ' Alex ', 'hello', 'OPEN01']) assert.deepEqual(filterRooms(rooms, 'all', query).map(room => room.code), ['OPEN01']);
  assert.deepEqual(filterRooms(rooms, 'all', 'Trivia', { 'lightning-trivia': { label: 'Lightning Trivia' } }).map(room => room.code), ['PLAY01']);
  assert.equal(filterRooms(rooms, 'open', 'Trivia', { 'lightning-trivia': { label: 'Lightning Trivia' } }).length, 0);
  assert.equal(rooms[0].code, 'FULL01');
});

test('avatars stay consistent within a room, keep the profile badge and escape supplied text', () => {
  const seed = seedFor('OPEN01', 'player-123');
  assert.equal(avatar(seed, '🦊'), avatar(seedFor('OPEN01', 'player-123'), '🦊'));
  assert.notEqual(seed, seedFor('OPEN02', 'player-123'));
  const output = avatar(seed, '<img src=x onerror=alert(1)>');
  assert.equal(output.includes('<img'), false);
  assert.ok(output.includes('&lt;img'));
  assert.ok(output.includes('aria-hidden="true"'));
  assert.ok(avatar(seed, '🦊').includes('🦊'));
});


test('community themes constrain scene and color values used in markup', () => {
  const { normalizeTheme, sceneAttributes } = require('../assets/js/community-plaza-core');
  assert.deepEqual(normalizeTheme(null), { scene: 'plaza', name: '', accent: '#37799b' });
  const theme = normalizeTheme({ scene: 'space', name: '  Friday   crew  ', accent: '#aBc123' });
  assert.deepEqual(theme, { scene: 'space', name: 'Friday crew', accent: '#aBc123' });
  assert.equal(normalizeTheme({ name: 'x'.repeat(100) }).name.length, 60);
  assert.equal(sceneAttributes({ scene: '\" onclick=bad', accent: 'red; background:url(bad)' }), 'data-plaza-scene="plaza" style="--plaza-accent:#37799b"');
});

test('community chat renders once below the scene and above games while private message boards stay below', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const context = {
    APP: { roomCode: 'PLAZA1', player: { id: 'host', name: 'Host' }, preferences: {}, voice: {}, room: { code: 'PLAZA1', host: 'Host', roomType: 'community', participants: [], communityChat: [], communityTheme: { scene: 'beach' } } },
    getRoomVoiceSettings: () => ({}), getVoiceFocusParticipant: () => null,
    isRoomPrivateSession: () => false, buildJoinUrl: () => 'https://example.test',
    canCurrentUserManageCommunityRoom: () => true,
    escapeHtml: require('../assets/js/community-plaza-core').escape,
    TeamBuilderCommunityPlazaCore: require('../assets/js/community-plaza-core'),
    TeamBuilderCommunityPlaza: { renderRoomPlaza: () => '<section id="test-scene"></section>' },
    ACTIVITY_QUEUE_ITEMS: [{ id: 'bingo' }], isActivityEnabled: () => false,
    getRoomHostSettings: () => ({}), COMMUNITY_CHAT_QUICK_EMOJIS: [],
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/room-renderers-core'), 'utf8'), context);
  const output = context.renderLobby();
  assert.equal((output.match(/id="communityChatInput"/g) || []).length, 1);
  assert.ok(output.indexOf('id="communityChatInput"') > output.indexOf('id="test-scene"'));
  assert.ok(output.indexOf('id="communityChatInput"') < output.indexOf('id="activityLibrary"'));
  assert.ok(output.includes('data-action="plaza-edit-theme"'));
  assert.match(output, /data-action="start-bingo"[^>]*display:none/);
  context.APP.room.roomType = 'private';
  const privateOutput = context.renderLobby();
  assert.ok(privateOutput.indexOf('id="communityChatInput"') > privateOutput.indexOf('id="activityLibrary"'));
  context.APP.preferences.enableMessageBoard = false;
  assert.equal(context.renderLobby().includes('id="communityChatInput"'), false);
});

test('room game selections constrain activity availability without overriding admin settings', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const source = html.slice(html.indexOf('function isActivityEnabled('), html.indexOf('function canCurrentUserCreateCommunityRooms('));
  const context = { APP: { preferences: { enabledActivities: { bingo: false } }, room: { roomType: 'community', communityActivities: ['bingo', 'memory'] } } };
  vm.runInNewContext(source, context);
  assert.equal(context.isActivityEnabled('bingo'), false);
  assert.equal(context.isActivityEnabled('memory'), true);
  assert.equal(context.isActivityEnabled('uno'), false);
  context.APP.room.communityActivities = [];
  assert.equal(context.isActivityEnabled('memory'), false);
  delete context.APP.room.communityActivities;
  assert.equal(context.isActivityEnabled('memory'), true);
  context.APP.room = null;
  assert.equal(context.isActivityEnabled('uno'), true);
});

test('walking routes remain continuous across renders and differ between participants', () => {
  const { walkingStyle } = require('../assets/js/community-plaza-core');
  const first = walkingStyle('PLAZA1', 'alice', 1000);
  assert.equal(first, walkingStyle('PLAZA1', 'alice', 1000));
  assert.notEqual(first, walkingStyle('PLAZA1', 'bob', 1000));
  assert.equal(first.replace(/--walk-delay:.*/, ''), walkingStyle('PLAZA1', 'alice', 2000).replace(/--walk-delay:.*/, ''));
  assert.match(first, /--walk-delay:-1000ms/);
});

test('speech selects the latest recent message by sender ID and expires after fourteen seconds', () => {
  const { latestSpeech } = require('../assets/js/community-plaza-core');
  const person = { id: 'alice', name: 'Alice' }, now = 50000;
  const messages = [
    { playerId: 'alice', text: 'old', ts: now - 14000 },
    { playerId: 'alice', text: 'hello', ts: now - 5000 },
    { playerId: 'bob', playerName: 'Alice', text: 'other person', ts: now },
    { playerId: 'alice', text: 'newest', ts: now - 1000 }
  ];
  assert.equal(latestSpeech(messages, person, now).text, 'newest');
  assert.equal(latestSpeech(messages, person, now + 14000), null);
  assert.equal(latestSpeech([{ playerName: 'Alice', text: 'legacy', ts: now }], person, now).text, 'legacy');
});

test('plaza renders transparent characters and escaped speech without changing profile settings', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const character = { background: 'sky' };
  const context = {
    TeamBuilderCommunityPlazaCore: require('../assets/js/community-plaza-core'),
    TeamBuilderCharacter: require('../assets/js/character-core'),
    TEAM_BUILDER_ACTIVITY_REGISTRY: { registerAction() {} },
    APP: { player: { id: 'alice' }, preferences: {} },
    document: { addEventListener() {} }, setInterval() {}
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/community-plaza'), 'utf8'), context);
  const room = { code: 'PLAZA1', participants: [{ id: 'alice', name: 'Alice', character }], communityChat: [{ playerId: 'alice', text: '<hello>', ts: Date.now() - 10 }] };
  const output = context.TeamBuilderCommunityPlaza.renderRoomPlaza(room);
  assert.ok(output.includes('plaza-walk-area'));
  assert.ok(output.includes('&lt;hello&gt;'));
  assert.ok(output.includes('data-plaza-speech-until'));
  assert.equal(output.includes('<rect x="2" y="2"'), false);
  assert.equal(character.background, 'sky');
  context.APP.preferences.enableMessageBoard = false;
  assert.equal(context.TeamBuilderCommunityPlaza.renderRoomPlaza(room).includes('data-plaza-speech-until'), false);
});

test('scene surfaces select walking, swimming and floating consistently', () => {
  const { scenes, movementFor, normalizeTheme } = require('../assets/js/community-plaza-core');
  assert.equal(normalizeTheme({ scene: 'ocean' }).scene, 'ocean');
  for (const scene of scenes) {
    const motions = new Set(Array.from({ length: 24 }, (_, id) => movementFor(scene.id, 'PLAZA1', `player-${id}`)));
    if (scene.surface === 'water') {
      assert.deepEqual([...motions].sort(), ['float', 'swim']);
    } else {
      assert.deepEqual([...motions], [scene.id === 'space' ? 'float' : 'walk']);
    }
    assert.equal(movementFor(scene.id, 'PLAZA1', 'alice'), movementFor(scene.id, 'PLAZA1', 'alice'));
  }
});
