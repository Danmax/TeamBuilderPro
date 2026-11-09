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
