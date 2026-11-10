const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/spades');
const T = require('../lib/table-games');
const host = { id: 'a', name: 'A', isHost: true };
function setup() {
  let g = S.apply(S.create(), host, 'join', { position: 0 });
  for (let i = 1; i < 4; i++) g = S.apply(g, { id: `p${i}`, name: `P${i}` }, 'join', { position: i });
  return g;
}
test('Spades deals 52 unique private cards, locks partnerships, and rotates dealer', () => {
  const initial = setup(); let g = S.apply(initial, host, 'deal', {}, 1000);
  assert.equal(new Set(g.players.flatMap(p => p.hand.map(c => c.suit + c.rank))).size, 52);
  assert(g.players.every(p => p.hand.length === 13));
  const pub = S.publicView(g); assert(pub.players.every(p => !('hand' in p)));
  assert(!('actorHashes' in pub)); assert(!('actionIds' in pub));
  assert.equal(S.privateView(g, 'watcher').cards.length, 0);
  assert.equal(S.privateView(g, 'a').cards.length, 13);
  assert.throws(() => S.apply(g, { id: 'late' }, 'join'), /Join|seat/);
  const position = g.dealerPosition;
  while (S.active(g)) g = S.expire(g, g.deadline);
  assert.equal(g.phase, 'hand-complete'); assert.equal(g.trickNumber, 13);
  g = S.apply(g, host, 'deal'); assert.equal(g.dealerPosition, (position + 1) % 4);
  assert.throws(() => S.apply(g, host, 'configure', { amount: 250 }), /before/);
});
test('Spades enforces following suit, broken spades, trump, order, and card ownership', () => {
  const g = setup(); g.phase = 'playing'; g.turnId = 'a';
  S.seat(g, 'a').hand = [{ rank: 2, suit: 'H' }, { rank: 14, suit: 'S' }];
  assert.deepEqual(S.legalCards(g, S.seat(g, 'a')), [{ rank: 2, suit: 'H' }]);
  assert.throws(() => S.apply(g, host, 'play', { card: { rank: 14, suit: 'S' } }), /legal card/);
  g.trick = [{ playerId: 'p3', card: { rank: 14, suit: 'H' } }];
  assert.equal(S.legalCards(g, S.seat(g, 'a')).length, 1);
  S.seat(g, 'a').hand = [{ rank: 2, suit: 'S' }];
  const next = S.apply(g, host, 'play', { card: { rank: 2, suit: 'S' } }); assert(next.broken);
  assert.equal(S.trickWinner(next.trick), 'a');
  assert.throws(() => S.apply(g, { id: 'p1' }, 'play', { card: { rank: 2, suit: 'S' } }), /turn/);
  g.trick = []; assert.equal(S.legalCards(g, S.seat(g, 'a')).length, 1, 'all-spades hand can lead');
});
test('Spades contract scoring, nil variants, bag rollover and negative points are exact', () => {
  const team = (a, b, x, y) => [{ bid: a, tricks: x }, { bid: b, tricks: y }];
  assert.equal(S.scoreTeam(team(3, 3, 4, 4)).points, 62);
  assert.equal(S.scoreTeam(team(3, 3, 3, 2)).points, -60);
  assert.deepEqual([S.scoreTeam(team(3, 3, 4, 4), 9).points, S.scoreTeam(team(3, 3, 4, 4), 9).bags], [-38, 1]);
  assert.equal(S.scoreTeam(team(0, 4, 0, 4)).points, 140);
  assert.equal(S.scoreTeam(team(0, 4, 2, 3)).points, -138, 'failed Nil cannot make partner contract');
  assert.equal(S.scoreTeam(team(0, 0, 0, 0)).points, 200);
  assert.equal(S.scoreTeam(team(0, 0, 6, 7)).points, -287);
  assert.equal(S.scoreTeam(team(1, 1, 6, 7), 9).penalties, 200);
});
test('Spades pauses a review deadline, scores once, and resolves ties only after a hand', () => {
  let g = setup(); g = S.apply(g, host, 'deal', {}, 1000);
  while (g.phase !== 'review') g = S.expire(g, g.deadline);
  const original = g.deadline;
  g = S.apply(g, host, 'pause', {}, original - 500); assert.equal(S.expire(g, original + 10000), g);
  g = S.apply(g, host, 'resume', {}, 100000); assert.equal(g.deadline, 100500);
  while (S.active(g)) g = S.expire(g, g.deadline);
  assert.equal(g.history.length, 1); assert.equal(S.expire(g, Infinity), g);
  g.target = 1; g.scores = [1000, 1000];
  g = S.apply(g, host, 'deal');
  while (S.active(g)) g = S.expire(g, g.deadline);
  assert.equal(g.phase, g.scores[0] === g.scores[1] ? 'hand-complete' : 'finished');
});
test('limited-information computer decisions complete repeated matches and preserve all cards', () => {
  for (let run = 0; run < 15; run++) {
    let g = S.apply(S.create(), host, 'join'); g = S.apply(g, host, 'computers'); g = S.apply(g, host, 'configure', { amount: 250 });
    for (let steps = 0; g.phase !== 'finished' && steps < 20000; steps++) {
      if (!S.active(g)) g = S.apply(g, host, 'deal');
      else {
        const inHand = g.players.reduce((n, p) => n + p.hand.length, 0);
        assert.equal(inHand + 4 * g.trickNumber + (g.phase === 'review' ? 0 : g.trick.length), 52);
        g = S.expire(g, g.deadline);
      }
    }
    assert.equal(g.phase, 'finished'); assert(g.history.every(h => h.players.reduce((n, p) => n + p.tricks, 0) === 13));
  }
  assert(T.TYPES.spades); assert.equal(T.publicView(T.create('spades')).type, 'spades');
});

test('Spades continues a tied target and awards the higher total only after all scoring', () => {
  const g = setup(); Object.assign(g, { phase: 'review', trickNumber: 13, deadline: 100, target: 250, scores: [310, 300], handNumber: 1 });
  for (const p of g.players) { p.bid = p.position === 3 ? 4 : 3; p.tricks = p.bid; }
  const tied = S.expire(g, 100); assert.deepEqual(tied.scores, [370, 370]); assert.equal(tied.phase, 'hand-complete');
  g.scores = [310, 301]; const won = S.expire(g, 100); assert.equal(won.phase, 'finished'); assert.equal(won.winnerTeam, 1);
});

test('a fresh Spades match preserves the table identity and cannot change finished winners', () => {
  const g = setup(); g.phase = 'hand-complete'; g.startedAt = 1000; g.scores = [100, 50];
  const next = S.apply(g, host, 'new-match'); assert.equal(next.id, g.id); assert.notEqual(next.matchId, g.matchId);
  assert.deepEqual(next.scores, [0, 0]); assert.equal(next.players.length, 0); assert.equal(next.phase, 'waiting');
  g.phase = 'finished'; g.players[2].isHouse = true;
  assert.throws(() => S.apply(g, { id: 'late', name: 'Late' }, 'join', { position: 2 }), /new match/);
});
