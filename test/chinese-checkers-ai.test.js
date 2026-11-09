const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../assets/js/games/chinese-checkers-core');
const AI = require('../assets/js/games/chinese-checkers-ai');

function setup(count = 2) {
  let game = C.createGame([], { playerCount: count });
  for (let index = 0; index < count; index++) game = C.join(game, { id: `bot-${index}`, name: `Computer ${index}`, isComputer: true }, index);
  return game;
}

test('computer identity survives layout changes and paused and human turns are untouched', () => {
  const setupGame = C.configure(setup(), 3);
  assert.equal(setupGame.seats[1].isComputer, true);
  const game = C.start(setup());
  const paused = C.pause(game, true);
  assert.equal(AI.playTurn(paused), paused);
  const human = { ...game, seats: game.seats.map(seat => ({ ...seat, isComputer: false })) };
  assert.equal(AI.playTurn(human), human);
  assert.equal(AI.chooseTurn(paused), null);
});

test('computer follows legal complete turns, preserves pieces and finishes all supported layouts', () => {
  for (const count of [2, 3, 4, 6]) {
    let game = C.start(setup(count));
    for (let turn = 0; turn < 400 && game.phase === 'playing'; turn++) {
      const oldGame = game;
      const path = AI.chooseTurn(game);
      assert.ok(path && path.length >= 2);
      assert.equal(new Set(path).size, path.length, 'hop paths never revisit a hole');
      let verified = game;
      for (let index = 1; index < path.length; index++) verified = C.move(verified, oldGame.seats[oldGame.turnIndex].playerId, path[index - 1], path[index]);
      game = AI.playTurn(game);
      assert.equal(game.moves, oldGame.moves + 1);
      assert.deepEqual(game.board, verified.board);
      assert.deepEqual(game.jumpPath, []);
      for (const seat of game.seats) assert.equal(Object.values(game.board).filter(owner => owner === seat.camp).length, 10);
    }
    assert.equal(game.phase, 'finished', `${count}-player game should finish`);
    assert.equal(C.progress(game, game.seats.find(seat => seat.playerId === game.winner)), 10);
  }
});

test('computer recognizes an immediate win and passes when blocked', () => {
  const game = C.start(setup());
  game.board = Object.fromEntries(C.HOLES.map(hole => [hole.id, null]));
  const landing = C.CAMP_HOLES[3].map(id => C.BY_ID[id]).find(hole => C.DIRECTIONS.some(([q, r]) => C.BY_ID[`${hole.q + q},${hole.r + r}`]?.camp === null));
  const from = C.DIRECTIONS.map(([q, r]) => C.BY_ID[`${landing.q + q},${landing.r + r}`]).find(hole => hole?.camp === null);
  C.CAMP_HOLES[3].filter(id => id !== landing.id).forEach(id => { game.board[id] = 0; });
  game.board[from.id] = 0;
  assert.equal(AI.playTurn(game).winner, game.seats[0].playerId);
  const blocked = { ...game, board: Object.fromEntries(C.HOLES.map(hole => [hole.id, 0])) };
  assert.equal(AI.playTurn(blocked).consecutivePasses, 1);
});
