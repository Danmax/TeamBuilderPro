const assert = require('node:assert/strict');
const test = require('node:test');
const Checkers = require('../assets/js/games/checkers-core');
const players = [{ id: 'host', name: 'Host' }, { id: 'guest', name: 'Guest' }];
function position(pieces, overrides = {}) {
  const game = Checkers.createGame(players);
  game.board.fill('');
  for (const [square, piece] of Object.entries(pieces)) game.board[Number(square)] = piece;
  return Object.assign(game, { positions: {} }, overrides);
}

test('Checkers starts with twelve pieces per side on dark squares and seven opening moves', () => {
  const game = Checkers.createGame(players);
  assert.equal(game.phase, 'playing');
  assert.equal(game.board.filter(piece => piece === 'b').length, 12);
  assert.equal(game.board.filter(piece => piece === 'r').length, 12);
  game.board.forEach((piece, square) => { if (piece) assert.equal((Math.floor(square / 8) + square % 8) % 2, 1); });
  assert.equal(Checkers.legalMoves(game).length, 7);
  assert.equal(Checkers.createGame(players.slice(0, 1)).phase, 'waiting');
  assert.equal(Checkers.createGame([players[0], players[0]]).players.r, null);
});

test('moves alternate turns without mutating the previous board and reject illegal squares', () => {
  const game = Checkers.createGame(players);
  const move = Checkers.legalMoves(game)[0];
  const next = Checkers.applyMove(game, move.from, move.to);
  assert.equal(next.turn, 'r');
  assert.equal(game.board[move.from], 'b');
  assert.equal(next.board[move.from], '');
  assert.throws(() => Checkers.applyMove(game, 40, 39), /not legal/);
  assert.throws(() => Checkers.applyMove(game, '40', 33), /legal board square/);
});

test('captures are mandatory across the board and multi-jumps keep the same piece and turn', () => {
  const game = position({ 42: 'b', 40: 'b', 35: 'r', 21: 'r', 1: 'r' });
  assert.deepEqual(Checkers.legalMoves(game), [{ from: 42, to: 28, capture: 35 }]);
  assert.throws(() => Checkers.applyMove(game, 40, 33), /not legal/);
  const jump = Checkers.applyMove(game, 42, 28);
  assert.equal(jump.board[35], '');
  assert.equal(jump.turn, 'b');
  assert.equal(jump.forcedFrom, 28);
  assert.deepEqual(Checkers.legalMoves(jump), [{ from: 28, to: 14, capture: 21 }]);
  const complete = Checkers.applyMove(jump, 28, 14);
  assert.equal(complete.turn, 'r');
  assert.equal(complete.forcedFrom, null);
});

test('promotion crowns a king and ends a capture sequence', () => {
  const game = position({ 17: 'b', 10: 'r', 12: 'r', 55: 'r' });
  const promoted = Checkers.applyMove(game, 17, 3);
  assert.equal(promoted.board[3], 'B');
  assert.equal(promoted.turn, 'r');
  assert.equal(promoted.forcedFrom, null);
  assert.equal(promoted.lastMove.promoted, true);
});

test('regular pieces capture forward while kings also capture backward', () => {
  const game = position({ 28: 'b', 37: 'r', 1: 'r' });
  assert.equal(Checkers.legalMoves(game).some(move => move.to === 46), false);
  game.board[28] = 'B';
  assert.deepEqual(Checkers.legalMoves(game), [{ from: 28, to: 46, capture: 37 }]);
});

test('capturing the final piece or blocking every opponent move wins', () => {
  const captured = Checkers.applyMove(position({ 42: 'b', 35: 'r' }), 42, 28);
  assert.equal(captured.phase, 'finished');
  assert.equal(captured.winner, 'b');
  assert.deepEqual(Checkers.legalMoves(captured), []);
  const blocked = Checkers.applyMove(position({ 17: 'b', 56: 'r' }), 17, 8);
  assert.equal(blocked.winner, 'b');
});

test('repetition and eighty moves without capture or promotion produce a draw', () => {
  let game = position({ 56: 'B', 7: 'R' });
  game.positions[game.board.join('.') + ':b'] = 1;
  for (const [from, to] of [[56, 49], [7, 14], [49, 56], [14, 7], [56, 49], [7, 14], [49, 56], [14, 7]]) game = Checkers.applyMove(game, from, to);
  assert.equal(game.phase, 'finished');
  assert.match(game.drawReason, /three times/);
  const quiet = Checkers.applyMove(position({ 56: 'B', 7: 'R' }, { halfMoves: 79 }), 56, 49);
  assert.equal(quiet.phase, 'finished');
  assert.equal(quiet.winner, '');
  assert.match(quiet.drawReason, /80 moves/);
});

test('flying kings move along open diagonals while regular pieces keep short moves', () => {
  const game = position({ 42: 'B', 7: 'r' }, { rules: { flyingKings: true, mandatoryCaptures: false } });
  assert.ok(Checkers.legalMoves(game).some(move => move.to === 24 && move.capture === null));
  assert.ok(Checkers.legalMoves(game).some(move => move.to === 60 && move.capture === null));
  assert.equal(Checkers.applyMove(game, 42, 24).board[24], 'B');
  game.board[42] = 'b';
  assert.equal(Checkers.legalMoves(game).some(move => move.to === 24 || move.to === 60), false);
});

test('flying captures offer every empty landing beyond one opponent and respect blockers', () => {
  const rules = { flyingKings: true, mandatoryCaptures: true };
  const game = position({ 42: 'B', 28: 'r' }, { rules });
  assert.deepEqual(Checkers.legalMoves(game), [21, 14, 7].map(to => ({ from: 42, to, capture: 28 })));
  const landed = Checkers.applyMove(game, 42, 14);
  assert.equal(landed.board[28], '');
  assert.equal(landed.board[14], 'B');
  game.board[14] = 'r';
  assert.deepEqual(Checkers.legalMoves(game), [{ from: 42, to: 21, capture: 28 }]);
  assert.throws(() => Checkers.applyMove(game, 42, 7), /not legal/);
  game.board[28] = 'b';
  assert.equal(Checkers.legalMoves(game).some(move => move.from === 42 && [21, 14, 7].includes(move.to)), false);
});

test('flying kings continue a distant multi-jump with the same piece', () => {
  const game = position({ 42: 'B', 28: 'r', 12: 'r', 1: 'r' }, { rules: { flyingKings: true, mandatoryCaptures: false } });
  const first = Checkers.applyMove(game, 42, 21);
  assert.equal(first.turn, 'b');
  assert.equal(first.forcedFrom, 21);
  assert.deepEqual(Checkers.legalMoves(first), [{ from: 21, to: 3, capture: 12 }]);
  assert.throws(() => Checkers.applyMove(first, 21, 30), /Continue jumping/);
  const second = Checkers.applyMove(first, 21, 3);
  assert.equal(second.turn, 'r');
  assert.equal(second.forcedFrom, null);
  assert.equal(second.board[12], '');
});

test('optional captures permit another free piece to move but still finish a started multi-jump', () => {
  const game = position({ 42: 'b', 40: 'b', 35: 'r', 21: 'r', 1: 'r' }, { rules: { flyingKings: false, mandatoryCaptures: false } });
  const moves = Checkers.legalMoves(game);
  assert.ok(moves.some(move => move.from === 42 && move.to === 28));
  assert.ok(moves.some(move => move.from === 40 && move.to === 33));
  assert.equal(Checkers.applyMove(game, 40, 33).turn, 'r');
  const jumping = Checkers.applyMove(game, 42, 28);
  assert.equal(jumping.forcedFrom, 28);
  assert.deepEqual(Checkers.legalMoves(jumping), [{ from: 28, to: 14, capture: 21 }]);
});

test('rules normalize safely and older matches keep their original movement and capture rules', () => {
  assert.deepEqual(Checkers.createGame(players).rules, { flyingKings: false, mandatoryCaptures: true });
  assert.deepEqual(Checkers.normalizeRules({ flyingKings: 'true', mandatoryCaptures: 'false' }), { flyingKings: false, mandatoryCaptures: true });
  const legacy = position({ 42: 'B', 28: 'r', 1: 'r' });
  delete legacy.rules;
  assert.equal(Checkers.legalMoves(legacy).some(move => move.to === 21), false);
  const forced = position({ 42: 'b', 40: 'b', 35: 'r', 1: 'r' });
  delete forced.rules;
  assert.deepEqual(Checkers.legalMoves(forced), [{ from: 42, to: 28, capture: 35 }]);
});
