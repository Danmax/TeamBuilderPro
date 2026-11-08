const assert = require('node:assert/strict');
const test = require('node:test');
const Memory = require('../assets/js/games/memory-core');
const players = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
function round(people = players, options = {}) { return Memory.createGame(people, { id: 'test-memory', ...options }, () => .4); }
function pairIndices(secret, value = secret.deck[0]) { return secret.deck.flatMap((card, index) => card === value ? [index] : []); }

test('Memory creates supported sizes and themes with paired private cards and a hidden public board', () => {
  for (const pairCount of [6, 8, 12]) {
    const { game, secret } = round(players, { pairCount, theme: 'space' });
    assert.equal(game.cards.length, pairCount * 2);
    assert.equal(game.theme, 'space');
    assert.ok(game.cards.every(card => card.value === null));
    assert.equal('deck' in game, false);
    assert.ok(Memory.normalizeSecret(secret));
    for (let value = 0; value < pairCount; value++) assert.equal(secret.deck.filter(item => item === value).length, 2);
  }
  const fallback = round([], { pairCount: 100, theme: 'unknown' }).game;
  assert.equal(fallback.pairCount, 8);
  assert.equal(fallback.theme, 'animals');
  assert.equal(fallback.phase, 'waiting');
  assert.equal(round(players.slice(0, 1)).game.phase, 'playing');
  assert.equal(Memory.normalizeSecret({ gameId: 'bad', deck: Array(16).fill(0) }), null);
});

test('matching reveals only the chosen cards, scores one pair, and retains the turn', () => {
  const { game, secret } = round();
  const [first, second] = pairIndices(secret);
  const one = Memory.flip(game, secret, 'a', first, 100);
  assert.equal(game.cards[first].value, null, 'previous state remains unchanged');
  assert.equal(one.cards.filter(card => card.value !== null).length, 1);
  const match = Memory.flip(one, secret, 'a', second, 200);
  assert.equal(match.players[0].score, 1);
  assert.equal(match.pairsMatched, 1);
  assert.equal(match.attempts, 1);
  assert.equal(match.turnId, 'a');
  assert.equal(match.cards[first].matchedBy, 'a');
  assert.deepEqual(match.flipped, []);
  assert.throws(() => Memory.flip(match, secret, 'a', first), /face-down/);
});

test('mismatches stay visible until their deadline, block further flips, then rotate turns', () => {
  const { game, secret } = round();
  const first = 0, second = secret.deck.findIndex(value => value !== secret.deck[first]);
  const one = Memory.flip(game, secret, 'a', first, 100);
  const mismatch = Memory.flip(one, secret, 'a', second, 200);
  assert.equal(mismatch.hideAt, 1600);
  assert.equal(Memory.resolveMismatch(mismatch, players, 1599), mismatch);
  assert.throws(() => Memory.flip(mismatch, secret, 'a', 3), /Wait/);
  const hidden = Memory.resolveMismatch(mismatch, players, 1600);
  assert.equal(hidden.cards[first].value, null);
  assert.equal(hidden.cards[second].value, null);
  assert.equal(hidden.turnId, 'b');
  assert.equal(hidden.hideAt, 0);
});

test('Memory rejects other players, duplicate flips, invalid indices and the wrong secret', () => {
  const { game, secret } = round();
  assert.throws(() => Memory.flip(game, secret, 'b', 0), /not your turn/);
  assert.throws(() => Memory.flip(game, secret, 'a', -1), /face-down/);
  assert.throws(() => Memory.flip(game, secret, 'a', '0'), /face-down/);
  assert.throws(() => Memory.flip(game, { gameId: 'old' }, 'a', 0), /unavailable/);
  const one = Memory.flip(game, secret, 'a', 0);
  assert.throws(() => Memory.flip(one, secret, 'a', 0), /face-down/);
});

test('late arrivals join with zero points and leaving skips turns without erasing scores', () => {
  const { game, secret } = round();
  const one = Memory.flip(game, secret, 'a', 0);
  const skipped = Memory.reconcilePlayers(one, [players[1]]);
  assert.equal(skipped.turnId, 'b');
  assert.equal(skipped.cards[0].value, null);
  assert.equal(skipped.players.length, 2);
  const joined = Memory.join(skipped, { id: 'c', name: 'Chris' });
  assert.equal(joined.players[2].score, 0);
  assert.equal(joined.turnId, 'b');
  assert.throws(() => Memory.join(joined, players[1]), /already/);
  const waiting = Memory.reconcilePlayers(joined, []);
  assert.equal(waiting.phase, 'waiting');
  const returned = Memory.reconcilePlayers(waiting, players);
  assert.equal(returned.phase, 'playing');
  assert.equal(returned.turnId, 'a');
});

test('solo play returns the turn to the same player after a mismatch', () => {
  const solo = players.slice(0, 1);
  const { game, secret } = round(solo);
  const different = secret.deck.findIndex(value => value !== secret.deck[0]);
  const mismatch = Memory.flip(Memory.flip(game, secret, 'a', 0, 0), secret, 'a', different, 0);
  assert.equal(Memory.resolveMismatch(mismatch, solo, 1400).turnId, 'a');
});

test('clearing the board finishes the round and supports a tie', () => {
  let { game, secret } = round(players, { pairCount: 6 });
  for (let value = 0; value < 6; value++) {
    const actor = value < 3 ? 'a' : 'b';
    game = { ...game, turnId: actor };
    for (const index of pairIndices(secret, value)) game = Memory.flip(game, secret, actor, index);
  }
  assert.equal(game.phase, 'finished');
  assert.deepEqual(game.winnerIds, ['a', 'b']);
  assert.equal(game.cards.filter(card => card.matchedBy).length, 12);
  assert.throws(() => Memory.flip(game, secret, 'b', 0), /not in progress/);
  assert.throws(() => Memory.join(game, { id: 'c' }), /finished/);
});
