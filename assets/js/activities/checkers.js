(function (root) {
  let selected = null;
  let busy = false;
  let selectionVersion = '';
  let optionsGameId = null;
  let optionsDraft = null;
  let optionsOpen = false;
  const core = root.TeamBuilderCheckers;
  const label = color => color === 'b' ? 'Black' : 'Red';
  const squareName = square => `${'ABCDEFGH'[square % 8]}${8 - Math.floor(square / 8)}`;

  async function request(action, extra = {}) {
    if (busy || !APP.roomCode) return;
    busy = true;
    try {
      const key = `room:${APP.roomCode}`;
      const result = await socketEmitAck('checkers:action', { key, action, authToken: APP.roomAccessToken || '', ...getSharedActorPayload(key), gameId: APP.room?.activityState?.startedAt, moveNumber: APP.room?.activityState?.moveNumber, ...extra }, 4000);
      if (!result?.ok) throw new Error(result?.error || 'The move could not be saved.');
      if (result.value) APP.room = normalizeRoom(JSON.parse(result.value));
      selected = null;
    } catch (error) { showError(error.message); }
    finally { busy = false; render(); }
  }

  function renderCheckers() {
    const game = APP.room.activityState;
    if (!Array.isArray(game?.board)) return '<p>Waiting for the Checkers board…</p>';
    const rules = core.normalizeRules(game.rules);
    if (optionsGameId !== game.startedAt) { optionsGameId = game.startedAt; optionsDraft = { ...rules }; optionsOpen = false; }
    else optionsOpen = document.getElementById('checkersOptions')?.open ?? optionsOpen;
    const version = `${game.startedAt}:${game.moveNumber}`;
    if (version !== selectionVersion) { selected = null; selectionVersion = version; }
    const color = ['b', 'r'].find(side => game.players?.[side]?.playerId === APP.player?.id) || '';
    const isHost = APP.room.host === APP.player?.name;
    const canMove = game.phase === 'playing' && game.turn === color && !busy;
    const moves = core.legalMoves(game);
    if (Number.isInteger(game.forcedFrom)) selected = game.forcedFrom;
    const destinations = new Set(moves.filter(move => move.from === selected).map(move => move.to));
    const sources = new Set(moves.map(move => move.from));
    const counts = side => game.board.filter(piece => core.colorOf(piece) === side).length;
    const turnName = game.players?.[game.turn]?.name || label(game.turn);
    const status = game.phase === 'finished'
      ? game.winner ? `${game.players[game.winner]?.name || label(game.winner)} wins!` : `Draw. ${game.drawReason}`
      : game.phase === 'waiting' ? 'Waiting for a second player' : `${turnName}’s turn · ${label(game.turn)}`;
    const winner = game.winner ? game.players[game.winner] : null;
    const victory = { key: `${APP.roomCode}:${APP.player?.id}:checkers:${game.startedAt}`, kind: 'Checkers', finished: game.phase === 'finished', finishedAt: game.finishedAt, winnerId: winner?.playerId || '', winnerName: winner?.name || '', viewerId: APP.player?.id, winner: APP.room.participants.find(player => player.id === winner?.playerId), reason: 'The board is yours. Brilliant moves!' };
    root.TeamBuilderGameVictory.observe(victory);
    const missingPlayer = ['b', 'r'].some(side => game.players[side] && !APP.room.participants.some(player => player.id === game.players[side].playerId));
    const cells = Array.from({ length: 64 }, (_, displayIndex) => {
      const index = color === 'r' ? 63 - displayIndex : displayIndex;
      const row = Math.floor(index / 8), col = index % 8;
      if ((row + col) % 2 === 0) return '<div class="checkers-light" aria-hidden="true"></div>';
      const piece = game.board[index];
      const pieceColor = core.colorOf(piece);
      const king = piece && piece === piece.toUpperCase();
      const legal = canMove && destinations.has(index);
      const enabled = canMove && (sources.has(index) || legal);
      return `<button type="button" class="checkers-square ${canMove && sources.has(index) ? 'checkers-movable' : ''} ${index === selected ? 'checkers-selected' : ''} ${legal ? 'checkers-legal' : ''} ${game.lastMove?.to === index ? 'checkers-last' : ''}" data-action="checkers-square" data-index="${index}" aria-label="${squareName(index)}${piece ? `, ${label(pieceColor)} ${king ? 'king' : 'piece'}` : ', empty'}${legal ? ', legal destination' : ''}${index === selected ? ', selected' : ''}" aria-pressed="${index === selected}" ${enabled ? '' : 'disabled'}>${piece ? `<span class="checkers-piece checkers-${pieceColor}">${king ? '<span aria-hidden="true">♛</span>' : ''}</span>` : legal ? '<span class="checkers-target" aria-hidden="true"></span>' : ''}<span class="checkers-coordinate" aria-hidden="true">${squareName(index)}</span></button>`;
    }).join('');
    return `<section class="checkers-game" aria-label="Checkers">
      <div class="checkers-heading"><div><h2>Checkers</h2><p class="studio-help">${color ? `You play ${label(color)}. Select a piece, then a highlighted square.` : 'Watch the match live.'}</p></div>${isHost ? '<button class="btn-secondary" data-action="checkers-restart">New match</button>' : ''}</div>
      ${winner && game.phase === 'finished' ? root.TeamBuilderGameVictory.banner(victory) : `<div class="checkers-status" role="status" aria-live="polite">${escapeHtml(status)}</div>`}
      <p class="studio-help" id="checkersRulesSummary">${rules.flyingKings ? 'Flying kings' : 'Single-step kings'} · ${rules.mandatoryCaptures ? 'Required captures' : 'Optional captures'}</p>
      ${missingPlayer ? '<p class="studio-help">A player has left the room. The host can start a new match with the current players.</p>' : ''}
      ${game.phase === 'waiting' && !color ? '<button class="btn-primary" data-action="checkers-join">Join match</button>' : ''}
      <div class="checkers-layout"><div class="checkers-board" role="group" aria-label="Checkers board">${cells}</div><aside class="checkers-sidebar">
        ${['b', 'r'].map(side => `<div class="checkers-seat ${game.phase === 'playing' && game.turn === side ? 'checkers-active-seat' : ''}"><span class="checkers-piece checkers-${side}" aria-hidden="true"></span><div><strong>${escapeHtml(game.players[side]?.name || 'Open seat')}</strong><p>${label(side)} · ${counts(side)} pieces</p></div></div>`).join('')}
        <p class="studio-help">${game.phase === 'waiting' ? 'Invite another participant. They can join this match from their screen.' : game.phase === 'finished' ? 'The host can start a new match or return to the session.' : Number.isInteger(game.forcedFrom) ? 'Continue jumping with the same piece.' : moves.some(move => move.capture !== null) ? rules.mandatoryCaptures ? 'Capture required. Choose a highlighted piece to jump.' : 'A capture is available. You can jump or move another free piece.' : canMove ? 'Your move.' : color ? 'Waiting for your opponent.' : 'Spectating — the two seated players control the board.'}</p>
        <details class="studio-details"><summary>How to play</summary><p class="studio-help">Black moves first. Pieces move and capture diagonally forward; kings move and capture in either direction. ${rules.flyingKings ? 'Flying kings can slide along an open diagonal and capture one opposing piece from a distance, landing on any empty square beyond it. They cannot pass over friendly pieces or two pieces in one jump.' : 'Kings move one diagonal square at a time, or jump an adjacent opposing piece.'} ${rules.mandatoryCaptures ? 'Captures are required when available.' : 'Captures are optional: a free move is allowed even when a capture is available.'} Once you start capturing, continue any further jumps with the same piece. Reaching the far edge crowns a king and ends that turn. Win by capturing every opposing piece or blocking all opposing moves. A repeated position three times, or 80 moves without a capture or promotion, ends in a draw.</p></details>
        ${isHost ? `<details id="checkersOptions" class="studio-details" ${optionsOpen ? 'open' : ''}><summary>Match rules</summary><label class="form-label" for="checkersKingMovement">King movement</label><select id="checkersKingMovement" class="form-input"><option value="single" ${!optionsDraft.flyingKings ? 'selected' : ''}>One square at a time</option><option value="flying" ${optionsDraft.flyingKings ? 'selected' : ''}>Flying kings — any diagonal distance</option></select><label style="display:flex;align-items:center;gap:10px;margin:14px 0;"><input id="checkersOptionalCaptures" type="checkbox" ${!optionsDraft.mandatoryCaptures ? 'checked' : ''}>Allow free moves when a capture is available</label><p class="studio-help">Rules apply to a new match. Starting one resets the board. Multiple jumps must still be completed once a capture starts.</p><button class="btn-primary" data-action="checkers-apply-rules">Apply rules & start new match</button></details>` : ''}
      </aside></div></section>`;
  }

  document.addEventListener('change', event => {
    if (!optionsDraft) return;
    if (event.target.id === 'checkersKingMovement') optionsDraft.flyingKings = event.target.value === 'flying';
    if (event.target.id === 'checkersOptionalCaptures') optionsDraft.mandatoryCaptures = !event.target.checked;
  });
  const registry = root.TEAM_BUILDER_ACTIVITY_REGISTRY;
  registry.registerActivity('checkers', { createInitialState: room => core.createGame(room?.participants || []), render: renderCheckers });
  registry.registerAction('start-checkers', () => startActivityById('checkers'));
  registry.registerAction('checkers-restart', () => request('restart'));
  registry.registerAction('checkers-apply-rules', () => request('restart', { rules: { flyingKings: document.getElementById('checkersKingMovement')?.value === 'flying', mandatoryCaptures: !document.getElementById('checkersOptionalCaptures')?.checked } }));
  registry.registerAction('checkers-join', () => request('join'));
  registry.registerAction('checkers-square', ({ parsed }) => {
    if (busy) return;
    const game = APP.room?.activityState;
    if (game?.phase !== 'playing' || game.players?.[game.turn]?.playerId !== APP.player?.id) return;
    const moves = core.legalMoves(game);
    if (moves.some(move => move.from === selected && move.to === parsed.index)) return request('move', { from: selected, to: parsed.index });
    selected = moves.some(move => move.from === parsed.index) ? parsed.index : null;
    selectionVersion = `${game.startedAt}:${game.moveNumber}`;
    render();
  });
})(window);
