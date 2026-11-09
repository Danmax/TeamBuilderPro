(function (root) {
  const DIRECTIONS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const LAYOUTS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
  const CAMPS = [
    { name: 'Rose', color: '#fb7185', symbol: '●' }, { name: 'Gold', color: '#facc15', symbol: '▲' },
    { name: 'Jade', color: '#34d399', symbol: '◆' }, { name: 'Blue', color: '#60a5fa', symbol: '■' },
    { name: 'Violet', color: '#c084fc', symbol: '★' }, { name: 'Orange', color: '#fb923c', symbol: '✚' }
  ];
  const key = (q, r) => `${q},${r}`;
  function rotate(q, r, times) { for (let index = 0; index < times; index++) [q, r] = [-r, q + r]; return [q, r]; }
  const cells = new Map();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4) cells.set(key(q, r), { q, r, camp: null });
  }
  for (let camp = 0; camp < 6; camp++) for (let r = -8; r <= -5; r++) for (let q = -r - 4; q <= 4; q++) {
    const [cq, cr] = rotate(q, r, camp); cells.set(key(cq, cr), { q: cq, r: cr, camp });
  }
  const HOLES = [...cells.values()].sort((a, b) => a.r - b.r || a.q - b.q).map(hole => ({ ...hole, id: key(hole.q, hole.r), x: 360 + 44 * (hole.q + hole.r / 2), y: 400 + 44 * Math.sqrt(3) / 2 * hole.r }));
  const BY_ID = Object.fromEntries(HOLES.map(hole => [hole.id, hole]));
  const CAMP_HOLES = CAMPS.map((_, camp) => HOLES.filter(hole => hole.camp === camp).map(hole => hole.id));
  function boardFor(count) { return Object.fromEntries(HOLES.map(hole => [hole.id, LAYOUTS[count].includes(hole.camp) ? hole.camp : null])); }
  function seatFor(player, camp) { return { playerId: player.id || player.playerId, name: String(player.name || 'Player').slice(0, 32), camp, goal: (camp + 3) % 6 }; }
  function createGame(participants = [], options = {}) {
    const playerCount = Object.hasOwn(LAYOUTS, options.playerCount) ? Number(options.playerCount) : 2;
    const host = participants.find(player => player.id === options.hostId) || participants[0];
    return { id: options.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, version: 0, playerCount, seats: LAYOUTS[playerCount].map((camp, index) => index === 0 && host?.id ? seatFor(host, camp) : null), board: boardFor(playerCount), phase: 'setup', paused: false, turnIndex: 0, jumpPath: [], moves: 0, consecutivePasses: 0, winner: null, drawReason: '', lastMove: null };
  }
  function join(game, player, seatIndex) {
    if (game.phase !== 'setup') throw new Error('Seats are locked until the next round.');
    if (game.seats.some(seat => seat?.playerId === player.id)) throw new Error('You already have a seat.');
    const index = seatIndex === undefined ? game.seats.findIndex(seat => !seat) : seatIndex;
    if (!Number.isInteger(index) || index < 0 || index >= game.playerCount || game.seats[index]) throw new Error('Choose an open seat.');
    const seats = [...game.seats]; seats[index] = seatFor(player, LAYOUTS[game.playerCount][index]);
    return { ...game, seats, version: game.version + 1 };
  }
  function leave(game, actorId) {
    if (game.phase !== 'setup') throw new Error('Seats are locked until the next round.');
    return { ...game, seats: game.seats.map(seat => seat?.playerId === actorId ? null : seat), version: game.version + 1 };
  }
  function configure(game, playerCount) {
    if (game.phase !== 'setup') throw new Error('Change the layout before starting a round.');
    if (![2, 3, 4, 6].includes(playerCount)) throw new Error('Choose 2, 3, 4, or 6 players.');
    const players = game.seats.filter(Boolean).slice(0, playerCount);
    return { ...game, playerCount, seats: LAYOUTS[playerCount].map((camp, index) => players[index] ? seatFor(players[index], camp) : null), board: boardFor(playerCount), version: game.version + 1 };
  }
  function start(game) {
    if (game.phase !== 'setup' || !game.seats.every(Boolean)) throw new Error('Fill every seat before starting.');
    return { ...game, phase: 'playing', version: game.version + 1 };
  }
  function legalMoves(game, from) {
    if (game.phase !== 'playing' || game.paused || !Object.hasOwn(BY_ID, from)) return [];
    const seat = game.seats[game.turnIndex];
    if (!seat || game.board[from] !== seat.camp) return [];
    const chain = game.jumpPath.length > 0;
    if (chain && from !== game.jumpPath[game.jumpPath.length - 1]) return [];
    const hole = BY_ID[from], visited = new Set(game.jumpPath);
    const moves = [];
    for (const [dq, dr] of DIRECTIONS) {
      const adjacent = key(hole.q + dq, hole.r + dr);
      if (!Object.hasOwn(BY_ID, adjacent)) continue;
      if (game.board[adjacent] === null) {
        if (!chain) moves.push({ from, to: adjacent, kind: 'step' });
      } else {
        const target = key(hole.q + dq * 2, hole.r + dr * 2);
        if (Object.hasOwn(BY_ID, target) && game.board[target] === null && !visited.has(target)) moves.push({ from, to: target, kind: 'hop' });
      }
    }
    return moves;
  }
  function allLegalMoves(game) { return HOLES.flatMap(hole => legalMoves(game, hole.id)); }
  function assertTurn(game, actorId) {
    if (game.phase !== 'playing') throw new Error('This round is not in progress.');
    if (game.paused) throw new Error('The host has paused this round.');
    if (game.seats[game.turnIndex]?.playerId !== actorId) throw new Error('It is not your turn.');
  }
  function progress(game, seat) { return seat ? CAMP_HOLES[seat.goal].filter(id => game.board[id] === seat.camp).length : 0; }
  function advance(game) { return { ...game, turnIndex: (game.turnIndex + 1) % game.playerCount, jumpPath: [], moves: game.moves + 1 }; }
  function move(game, actorId, from, to) {
    assertTurn(game, actorId);
    const choice = legalMoves(game, from).find(candidate => candidate.to === to);
    if (!choice) throw new Error('Choose a highlighted destination for your marble.');
    const seat = game.seats[game.turnIndex];
    const path = choice.kind === 'hop' ? [...(game.jumpPath.length ? game.jumpPath : [from]), to] : [from, to];
    let next = { ...game, board: { ...game.board, [from]: null, [to]: seat.camp }, version: game.version + 1, jumpPath: choice.kind === 'hop' ? path : [], consecutivePasses: 0, lastMove: { playerId: actorId, kind: choice.kind, path } };
    if (progress(next, seat) === 10) return { ...next, phase: 'finished', winner: actorId, jumpPath: [], moves: next.moves + 1 };
    if (choice.kind === 'step' || !legalMoves(next, to).length) next = advance(next);
    return next;
  }
  function endTurn(game, actorId) {
    assertTurn(game, actorId);
    if (game.jumpPath.length < 2) throw new Error('Make a move before ending your turn.');
    return advance({ ...game, version: game.version + 1 });
  }
  function pass(game, actorId) {
    assertTurn(game, actorId);
    if (game.jumpPath.length || allLegalMoves(game).length) throw new Error('Pass is available only when no legal move exists.');
    const next = advance({ ...game, consecutivePasses: game.consecutivePasses + 1, version: game.version + 1 });
    if (next.consecutivePasses >= game.playerCount) { next.phase = 'finished'; next.drawReason = 'No player has a legal move.'; }
    return next;
  }
  function pause(game, paused) {
    if (game.phase !== 'playing') throw new Error('Start the round before pausing.');
    return { ...game, paused: Boolean(paused), version: game.version + 1 };
  }
  const api = { HOLES, BY_ID, CAMP_HOLES, CAMPS, DIRECTIONS, LAYOUTS, rotate, createGame, join, leave, configure, start, legalMoves, allLegalMoves, progress, move, endTurn, pass, pause };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderChineseCheckers = api;
})(typeof window === 'undefined' ? globalThis : window);
