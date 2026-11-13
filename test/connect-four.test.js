const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/connect-four');
const { winningRewards } = require('../lib/coin-wallet');
const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];

test('Connect 4 enforces turns, gravity, full columns and completed matches', () => {
  let game = C.create(players);
  assert.throws(() => C.move(game, 'b', 0), /turn/);
  assert.throws(() => C.move(game, 'spectator', 0), /turn/);
  assert.throws(() => C.move(game, 'a', 7), /column/);
  const original = game;
  for (let i = 0; i < 6; i++) game = C.move(game, i % 2 ? 'b' : 'a', 0);
  assert.equal(original.board[5][0], '');
  assert.equal(game.board[5][0], 'red');
  assert.throws(() => C.move(game, 'a', 0), /full/);
  game = C.create(players);
  for (const col of [0, 1, 0, 1, 0, 1, 0]) game = C.move(game, game.players[game.turn].playerId, col);
  assert.equal(game.phase, 'finished'); assert.equal(game.winner, 'red');
  assert.equal(game.winningCells.length, 4);
  assert.throws(() => C.move(game, 'b', 2), /turn/);
  const rewards = winningRewards({ currentActivity: 'connect-4', activityState: game });
  assert.equal(rewards.length, 1); assert.equal(rewards[0].playerId, 'a'); assert.equal(rewards[0].value, 20);
  assert.notEqual(C.create(players).id, game.id);
});

test('Connect 4 detects horizontal and diagonal wins', () => {
  for (const columns of [[0, 0, 1, 1, 2, 2, 3], [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3]]) {
    let game = C.create(players);
    for (const col of columns) game = C.move(game, game.players[game.turn].playerId, col);
    assert.equal(game.winner, 'red');
  }
});

test('team rewards exclude tied and unopposed Family Face-Off games', () => {
  const game = { id: 'survey-match', rewardStartedAt: 1, phase: 'finished', finished: true, scores: [100, 20], teams: { a: 0, b: 1, c: 0 } };
  const rewards = state => winningRewards({ currentActivity: 'survey-clash', activityState: state });
  assert.deepEqual(rewards(game).map(r => [r.playerId, r.value]), [['a', 30], ['c', 30]]);
  assert.deepEqual(rewards({ ...game, scores: [20, 20] }), []);
  assert.deepEqual(rewards({ ...game, teams: { a: 0 } }), []);
  assert.deepEqual(rewards({ ...game, rewardStartedAt: null }), []);
});
