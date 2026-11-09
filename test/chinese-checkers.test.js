const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../assets/js/games/chinese-checkers-core');
const players = Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, name: `Player ${index + 1}` }));
function started(count = 2) {
  let game = C.createGame(players, { playerCount: count, id: 'round-1' });
  for (let index = 1; index < count; index++) game = C.join(game, players[index], index);
  return C.start(game);
}
function position(pieces) {
  const game = started();
  game.board = Object.fromEntries(C.HOLES.map(hole => [hole.id, null]));
  Object.assign(game.board, pieces);
  return game;
}

test('star topology has 121 unique holes, six symmetric ten-hole camps and reversible neighbors', () => {
  assert.equal(C.HOLES.length, 121);
  assert.equal(new Set(C.HOLES.map(hole => hole.id)).size, 121);
  assert.equal(C.HOLES.filter(hole => hole.camp === null).length, 61);
  for (let camp = 0; camp < 6; camp++) {
    assert.equal(C.CAMP_HOLES[camp].length, 10);
    for (const id of C.CAMP_HOLES[camp]) {
      const hole = C.BY_ID[id];
      assert.ok(C.CAMP_HOLES[(camp + 3) % 6].includes(`${-hole.q},${-hole.r}`));
    }
  }
  for (const hole of C.HOLES) for (const [dq, dr] of C.DIRECTIONS) {
    const neighbor = C.BY_ID[`${hole.q + dq},${hole.r + dr}`];
    if (neighbor) assert.equal(C.BY_ID[`${neighbor.q - dq},${neighbor.r - dr}`].id, hole.id);
  }
});

test('layouts support 2, 3, 4 and 6 players with ten marbles each and no initial winner', () => {
  for (const count of [2, 3, 4, 6]) {
    const game = started(count);
    assert.equal(game.seats.length, count);
    assert.equal(new Set(game.seats.map(seat => seat.camp)).size, count);
    assert.equal(Object.values(game.board).filter(value => value !== null).length, count * 10);
    game.seats.forEach(seat => {
      assert.equal(seat.goal, (seat.camp + 3) % 6);
      assert.equal(C.progress(game, seat), 0);
    });
    assert.equal(game.winner, null);
  }
  assert.deepEqual(C.LAYOUTS[2], [0, 3]);
  assert.deepEqual(C.LAYOUTS[3], [0, 2, 4]);
  assert.deepEqual(C.LAYOUTS[4], [0, 1, 3, 4]);
});

test('setup prevents duplicate or occupied seats, requires full seating, and locks after start', () => {
  let game = C.createGame(players);
  assert.throws(() => C.start(game), /Fill every seat/);
  assert.throws(() => C.join(game, players[0], 1), /already/);
  assert.throws(() => C.join(game, players[1], 0), /open seat/);
  assert.throws(() => C.configure(game, 5), /2, 3, 4, or 6/);
  game = C.configure(game, 3);
  game = C.join(game, players[1], 1);
  game = C.join(game, players[2], 2);
  const smaller = C.configure(game, 2);
  assert.equal(smaller.seats[1].playerId, 'p1');
  assert.equal(C.leave(smaller, 'p1').seats[1], null);
  game = C.start(game);
  assert.throws(() => C.join(game, players[3]), /locked/);
  assert.throws(() => C.leave(game, 'p1'), /locked/);
  assert.throws(() => C.configure(game, 2), /before starting/);
});

test('steps move in all six directions, end the turn, and reject off-board or occupied destinations', () => {
  const game = position({ '0,0': 0, '3,0': 3 });
  assert.equal(C.legalMoves(game, '0,0').filter(move => move.kind === 'step').length, 6);
  const moved = C.move(game, 'p0', '0,0', '-1,1');
  assert.equal(moved.turnIndex, 1);
  assert.equal(moved.board['0,0'], null);
  assert.equal(game.board['0,0'], 0);
  assert.throws(() => C.move(game, 'p0', '0,0', '20,20'), /highlighted/);
  assert.throws(() => C.move(game, 'p1', '0,0', '1,0'), /not your turn/);
  assert.throws(() => C.move(game, 'p0', '0,0', '3,0'), /highlighted/);
  assert.deepEqual(C.legalMoves(game, '__proto__'), []);
});

test('hops jump over any color without captures and can stop while further hops exist', () => {
  const game = position({ '-2,0': 0, '-1,0': 0, '1,0': 3, '0,2': 0 });
  const hop = C.move(game, 'p0', '-2,0', '0,0');
  assert.equal(hop.turnIndex, 0);
  assert.deepEqual(hop.jumpPath, ['-2,0', '0,0']);
  assert.equal(hop.board['-1,0'], 0);
  assert.ok(C.legalMoves(hop, '0,0').some(move => move.to === '2,0'));
  assert.equal(C.legalMoves(hop, '0,0').some(move => move.to === '-2,0'), false);
  assert.deepEqual(C.legalMoves(hop, '0,2'), []);
  assert.throws(() => C.move(hop, 'p0', '0,0', '0,-1'), /highlighted/);
  const stopped = C.endTurn(hop, 'p0');
  assert.equal(stopped.turnIndex, 1);
  assert.equal(stopped.board['0,0'], 0);
  assert.deepEqual(stopped.jumpPath, []);
  const continued = C.move(hop, 'p0', '0,0', '2,0');
  assert.equal(continued.turnIndex, 1, 'no further hops automatically ends the turn');
  assert.equal(continued.board['1,0'], 3);
});

test('available jumps never force a player to jump, and a hop chain can change direction', () => {
  const game = position({ '-2,0': 0, '-1,0': 3, '0,1': 0 });
  assert.ok(C.legalMoves(game, '-2,0').some(move => move.kind === 'step'));
  const hop = C.move(game, 'p0', '-2,0', '0,0');
  const turned = C.move(hop, 'p0', '0,0', '0,2');
  assert.equal(turned.board['0,2'], 0);
  assert.equal(turned.board['0,1'], 0);
  assert.equal(turned.turnIndex, 1);
});

test('pause preserves an intermediate jump and permits no moves until resumed', () => {
  const game = position({ '-2,0': 0, '-1,0': 3, '1,0': 3 });
  const hop = C.move(game, 'p0', '-2,0', '0,0');
  const paused = C.pause(hop, true);
  assert.deepEqual(paused.jumpPath, hop.jumpPath);
  assert.throws(() => C.endTurn(paused, 'p0'), /paused/);
  assert.throws(() => C.move(paused, 'p0', '0,0', '2,0'), /paused/);
  assert.deepEqual(C.legalMoves(paused, '0,0'), []);
  assert.equal(C.endTurn(C.pause(paused, false), 'p0').turnIndex, 1);
});

test('win requires all ten own marbles in the opposite camp', () => {
  const game = position({});
  const goal = C.CAMP_HOLES[3];
  const landing = goal.find(id => C.DIRECTIONS.some(([dq, dr]) => {
    const hole = C.BY_ID[id], adjacent = C.BY_ID[`${hole.q + dq},${hole.r + dr}`];
    return adjacent && adjacent.camp !== 3;
  }));
  const hole = C.BY_ID[landing];
  const from = C.DIRECTIONS.map(([dq, dr]) => C.BY_ID[`${hole.q + dq},${hole.r + dr}`]).find(neighbor => neighbor && neighbor.camp !== 3).id;
  goal.filter(id => id !== landing).forEach(id => { game.board[id] = 0; });
  game.board[from] = 0;
  const won = C.move(game, 'p0', from, landing);
  assert.equal(won.phase, 'finished');
  assert.equal(won.winner, 'p0');
  assert.equal(C.progress(won, won.seats[0]), 10);
  game.board[landing] = 3;
  assert.equal(C.progress(game, game.seats[0]), 9);
  assert.throws(() => C.move(game, 'p0', from, landing), /highlighted/);
  assert.throws(() => C.endTurn(won, 'p0'), /not in progress/);
});

test('six-player turns rotate and pass is allowed only when every move is blocked', () => {
  let game = started(6);
  assert.throws(() => C.pass(game, 'p0'), /only when no legal/);
  for (let index = 0; index < 6; index++) {
    assert.equal(game.turnIndex, index);
    const choice = C.allLegalMoves(game).find(move => move.kind === 'step');
    game = C.move(game, `p${index}`, choice.from, choice.to);
  }
  assert.equal(game.turnIndex, 0);
  assert.throws(() => C.endTurn(game, 'p0'), /Make a move/);
  game.board = Object.fromEntries(C.HOLES.map(hole => [hole.id, 0]));
  for (let index = 0; index < 6; index++) game = C.pass(game, `p${index}`);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, null);
  assert.match(game.drawReason, /No player/);
});
