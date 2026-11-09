(function (root) {
  const colorOf = piece => typeof piece === 'string' && /^[br]$/i.test(piece) ? piece.toLowerCase() : '';
  const other = color => color === 'b' ? 'r' : 'b';
  const onBoard = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;
  const positionKey = game => game.board.join('.') + ':' + game.turn;

  function normalizeRules(rules = {}) {
    return { flyingKings: rules?.flyingKings === true, mandatoryCaptures: rules?.mandatoryCaptures !== false };
  }

  function pieceMoves(board, from, capturesOnly = false, rules = {}) {
    const piece = board[from];
    const color = colorOf(piece);
    if (!color) return [];
    const row = Math.floor(from / 8), col = from % 8;
    const king = piece === piece.toUpperCase();
    const directions = king ? [-1, 1] : color === 'b' ? [-1] : [1];
    const moves = [];
    for (const dr of directions) for (const dc of [-1, 1]) {
      let r = row + dr, c = col + dc;
      if (king && rules.flyingKings) {
        let captured = null;
        while (onBoard(r, c)) {
          const index = r * 8 + c;
          if (board[index]) {
            if (colorOf(board[index]) !== other(color) || captured !== null) break;
            captured = index;
          } else if (captured !== null || !capturesOnly) {
            moves.push({ from, to: index, capture: captured });
          }
          r += dr; c += dc;
        }
        continue;
      }
      if (!onBoard(r, c)) continue;
      const next = r * 8 + c;
      if (!board[next] && !capturesOnly) moves.push({ from, to: next, capture: null });
      else if (colorOf(board[next]) === other(color)) {
        const landingRow = r + dr, landingCol = c + dc;
        if (onBoard(landingRow, landingCol) && !board[landingRow * 8 + landingCol]) {
          moves.push({ from, to: landingRow * 8 + landingCol, capture: next });
        }
      }
    }
    return moves;
  }

  function legalMoves(game) {
    if (game?.phase !== 'playing' || game.winner || !Array.isArray(game.board) || game.board.length !== 64) return [];
    const rules = normalizeRules(game.rules);
    const sources = Number.isInteger(game.forcedFrom) ? [game.forcedFrom] : game.board.map((_, index) => index);
    const moves = sources.filter(index => colorOf(game.board[index]) === game.turn)
      .flatMap(index => pieceMoves(game.board, index, Number.isInteger(game.forcedFrom), rules));
    const captures = moves.filter(move => move.capture !== null);
    return captures.length && (rules.mandatoryCaptures || Number.isInteger(game.forcedFrom)) ? captures : moves;
  }

  function createGame(participants = [], rules = {}) {
    const unique = new Map();
    for (const player of participants) if (player?.id && !unique.has(player.id)) unique.set(player.id, player);
    const seats = [...unique.values()].slice(0, 2).map(player => ({ playerId: player.id, name: String(player.name || 'Player').slice(0, 32) }));
    const board = Array(64).fill('');
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 && (row < 3 || row > 4)) board[row * 8 + col] = row < 3 ? 'r' : 'b';
    }
    const game = { board, rules: normalizeRules(rules), players: { b: seats[0] || null, r: seats[1] || null }, turn: 'b', phase: seats.length === 2 ? 'playing' : 'waiting', forcedFrom: null, winner: '', drawReason: '', halfMoves: 0, moveNumber: 0, lastMove: null, positions: {}, startedAt: Date.now() };
    game.positions[positionKey(game)] = 1;
    return game;
  }

  function applyMove(game, from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error('Choose a legal board square.');
    const move = legalMoves(game).find(item => item.from === from && item.to === to);
    if (!move) {
      const hint = Number.isInteger(game.forcedFrom) ? ' Continue jumping with the same piece.' : normalizeRules(game.rules).mandatoryCaptures ? ' Captures are required when available.' : '';
      throw new Error(`That move is not legal.${hint}`);
    }
    const next = { ...game, board: [...game.board], positions: { ...(game.positions || {}) }, lastMove: { ...move, color: game.turn } };
    const piece = next.board[from];
    next.board[from] = '';
    next.board[to] = piece;
    if (move.capture !== null) next.board[move.capture] = '';
    const promoted = piece === piece.toLowerCase() && (game.turn === 'b' ? to < 8 : to >= 56);
    if (promoted) next.board[to] = piece.toUpperCase();
    next.lastMove.promoted = promoted;
    next.moveNumber = (game.moveNumber || 0) + 1;
    next.halfMoves = move.capture !== null || promoted ? 0 : (game.halfMoves || 0) + 1;
    if (move.capture !== null || promoted) next.positions = {};
    const continuation = move.capture !== null && !promoted && pieceMoves(next.board, to, true, normalizeRules(game.rules)).length > 0;
    next.forcedFrom = continuation ? to : null;
    if (continuation) return next;
    next.turn = other(game.turn);
    if (!legalMoves(next).length) {
      next.phase = 'finished'; next.winner = game.turn;
      return next;
    }
    const key = positionKey(next);
    next.positions[key] = (next.positions[key] || 0) + 1;
    if (next.positions[key] >= 3 || next.halfMoves >= 80) {
      next.phase = 'finished';
      next.drawReason = next.positions[key] >= 3 ? 'The same position occurred three times.' : '80 moves without a capture or promotion.';
    }
    return next;
  }

  const api = { createGame, legalMoves, applyMove, colorOf, normalizeRules };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderCheckers = api;
})(typeof window === 'undefined' ? globalThis : window);
