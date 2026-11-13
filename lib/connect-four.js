const { randomUUID } = require('node:crypto');

function create(participants) {
  const seats = [...new Map(participants.filter(p => p.id).map(p => [p.id, p])).values()].slice(0, 2);
  const now = Date.now();
  return {
    id: randomUUID(), version: 0, rewardStartedAt: now, startedAt: now, updatedAt: now,
    phase: seats.length === 2 ? 'playing' : 'waiting',
    players: Object.fromEntries(['red', 'yellow'].map((color, i) => [color, { playerId: seats[i]?.id || '', playerName: seats[i]?.name || `${color} player`, avatar: seats[i]?.avatar || '👤' }])),
    board: Array.from({ length: 6 }, () => Array(7).fill('')), turn: 'red', winner: '', winningCells: [], lastMove: null
  };
}

function move(source, playerId, col) {
  if (source.phase !== 'playing' || source.players[source.turn]?.playerId !== playerId) throw new Error('It is not your turn.');
  if (!Number.isInteger(col) || col < 0 || col > 6) throw new Error('Choose a column.');
  const row = source.board.findLastIndex(cells => !cells[col]);
  if (row < 0) throw new Error('This column is full.');
  const game = structuredClone(source), color = game.turn, now = Date.now();
  game.board[row][col] = color;
  game.lastMove = { row, col, color, at: now };
  game.updatedAt = now; game.version++;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [{ row, col }];
    for (const sign of [-1, 1]) {
      for (let step = 1; step < 4; step++) {
        const r = row + sign * step * dr, c = col + sign * step * dc;
        if (game.board[r]?.[c] !== color) break;
        cells.push({ row: r, col: c });
      }
    }
    if (cells.length >= 4) { game.winner = color; game.winningCells = cells; break; }
  }
  if (!game.winner && game.board.every(cells => cells.every(Boolean))) game.winner = 'draw';
  if (game.winner) {
    game.phase = 'finished'; game.finishedAt = now;
    game.lastAction = game.winner === 'draw' ? 'The board filled up. Match drawn.' : `${game.players[color].playerName} connected four and won the round.`;
  } else {
    game.turn = color === 'red' ? 'yellow' : 'red';
    game.lastAction = `${game.players[color].playerName} dropped into column ${col + 1}. ${game.players[game.turn].playerName} is up.`;
  }
  return game;
}

module.exports = { create, move };
