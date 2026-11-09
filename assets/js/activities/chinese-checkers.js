(function (root) {
  const core = root.TeamBuilderChineseCheckers;
  const ui = { id: '', version: -1, selected: '', focus: '0,0', zoom: 1, scrollLeft: 0, scrollTop: 0, busy: false };
  const active = () => APP.room?.currentActivity === 'chinese-checkers';
  function focusHole(id) {
    const viewport = document.getElementById('ccViewport');
    const button = viewport?.querySelector(`[data-hole="${id}"]`);
    if (!button) return;
    viewport.querySelectorAll('.cc-hole').forEach(hole => { hole.tabIndex = -1; });
    ui.focus = id; button.tabIndex = 0; button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function layoutBoard(target = null) {
    const viewport = document.getElementById('ccViewport'), stage = document.getElementById('ccStage');
    if (!viewport || !stage) return;
    const oldWidth = stage.offsetWidth || viewport.clientWidth;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / oldWidth;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / (oldWidth / .9);
    const base = Math.min(viewport.clientWidth, viewport.clientHeight * .9);
    const width = base * ui.zoom;
    stage.style.width = `${width}px`;
    stage.style.margin = ui.zoom === 1 ? '0 auto' : '0';
    if (target?.type === 'fit') { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
    else if (target) {
      let x = centerX, y = centerY;
      if (target.camp !== undefined) {
        const holes = core.CAMP_HOLES[target.camp].map(id => core.BY_ID[id]);
        x = holes.reduce((sum, hole) => sum + hole.x, 0) / holes.length / 720;
        y = holes.reduce((sum, hole) => sum + hole.y, 0) / holes.length / 800;
      }
      viewport.scrollLeft = x * width - viewport.clientWidth / 2;
      viewport.scrollTop = y * width / .9 - viewport.clientHeight / 2;
    } else { viewport.scrollLeft = ui.scrollLeft; viewport.scrollTop = ui.scrollTop; }
    const label = document.getElementById('ccZoomLabel');
    if (label) label.textContent = `${Math.round(ui.zoom * 100)}%`;
  }
  async function request(action, extra = {}) {
    if (ui.busy || !active()) return;
    ui.busy = true;
    try {
      const game = APP.room.activityState, key = `room:${APP.roomCode}`;
      const response = await socketEmitAck('chinese-checkers:action', { key, action, ...getSharedActorPayload(key), authToken: APP.roomAccessToken || '', gameId: game.id, version: game.version, ...extra }, 4000);
      if (response.value) APP.room = normalizeRoom(JSON.parse(response.value));
      ui.selected = '';
    } catch (error) { showError(error.message); }
    finally { ui.busy = false; render(); }
  }
  const campLabel = camp => `${core.CAMPS[camp].name} ${core.CAMPS[camp].symbol}`;
  function renderBoard(game, ownSeat, canPlay) {
    const moves = ui.selected ? core.legalMoves(game, ui.selected) : [];
    const targets = new Set(moves.map(move => move.to));
    const path = game.jumpPath.length ? game.jumpPath : game.lastMove?.path || [];
    const lines = core.HOLES.flatMap(hole => core.DIRECTIONS.slice(0, 3).flatMap(([dq, dr]) => {
      const next = core.BY_ID[`${hole.q + dq},${hole.r + dr}`];
      return next ? [`<line x1="${hole.x}" y1="${hole.y}" x2="${next.x}" y2="${next.y}"/>`] : [];
    })).join('');
    const triangles = core.CAMPS.map((camp, index) => {
      const points = [[4, -8], [1, -5], [4, -5]].map(([q, r]) => {
        const rotated = core.rotate(q, r, index); const hole = core.BY_ID[rotated.join(',')]; return `${hole.x},${hole.y}`;
      }).join(' ');
      return `<polygon points="${points}" fill="${camp.color}" opacity="${ownSeat?.goal === index ? '.32' : '.12'}" stroke="${camp.color}" stroke-width="2"/>`;
    }).join('');
    const holes = core.HOLES.map(hole => {
      const owner = game.board[hole.id], marble = Number.isInteger(owner) ? core.CAMPS[owner] : null;
      const seat = game.seats.find(item => item?.camp === owner);
      const legal = targets.has(hole.id), selected = ui.selected === hole.id;
      const enabled = canPlay && (legal || (owner === game.seats[game.turnIndex]?.camp && (!game.jumpPath.length || hole.id === game.jumpPath.at(-1))));
      const goal = ownSeat?.goal === hole.camp;
      const color = marble?.color || (hole.camp !== null ? core.CAMPS[hole.camp].color : '#b9cad4');
      const description = `${hole.id}: ${marble ? `${seat?.name || marble.name}, ${marble.name} marble` : 'empty'}${legal ? ', legal destination' : ''}${selected ? ', selected' : ''}${goal ? ', your goal camp' : ''}`;
      return `<button type="button" class="cc-hole ${marble ? 'cc-occupied' : ''} ${legal ? 'cc-legal' : ''} ${selected ? 'cc-selected' : ''} ${goal ? 'cc-goal' : ''}" style="left:${hole.x / 720 * 100}%;top:${hole.y / 800 * 100}%;--cc-color:${color};" data-action="cc-hole" data-hole="${hole.id}" aria-label="${escapeHtml(description)}" aria-pressed="${selected}" aria-disabled="${!enabled}" tabindex="${ui.focus === hole.id ? '0' : '-1'}"><span aria-hidden="true">${marble ? marble.symbol : legal ? '○' : ''}</span></button>`;
    }).join('');
    return `<div class="cc-board-controls" role="group" aria-label="Board view"><button class="btn-secondary" data-action="cc-zoom-out" aria-label="Zoom out">−</button><span id="ccZoomLabel">${Math.round(ui.zoom * 100)}%</span><button class="btn-secondary" data-action="cc-zoom-in" aria-label="Zoom in">+</button><button class="btn-secondary" data-action="cc-fit">Fit board</button>${ownSeat ? '<button class="btn-secondary" data-action="cc-center">Center my camp</button>' : ''}</div>
      <div id="ccViewport" class="cc-viewport" role="group" aria-label="Chinese Checkers board; zoom in and scroll to pan"><div id="ccStage" class="cc-stage"><svg viewBox="0 0 720 800" class="cc-lines" aria-hidden="true">${triangles}<g stroke="#617789" stroke-width="1.5" opacity=".5">${lines}</g>${path.length > 1 ? `<polyline points="${path.map(id => `${core.BY_ID[id].x},${core.BY_ID[id].y}`).join(' ')}" fill="none" stroke="#99ffec" stroke-width="5" opacity=".8"/>` : ''}</svg>${holes}</div></div>
      <p class="studio-help cc-board-help">Zoom in for larger targets; scroll or swipe to pan. Arrow keys plus Home/End move focus along the six directions. Enter or Space selects a marble or destination.</p>`;
  }
  function renderChineseCheckers() {
    const game = APP.room.activityState;
    if (!game?.board || !game.seats) return '<p>Waiting for the Chinese Checkers board…</p>';
    const previous = document.getElementById('ccViewport');
    const focused = document.activeElement?.matches?.('.cc-hole') ? document.activeElement.dataset.hole : '';
    if (previous) { ui.scrollLeft = previous.scrollLeft; ui.scrollTop = previous.scrollTop; }
    const ownSeat = game.seats.find(seat => seat?.playerId === APP.player?.id);
    if (ui.id !== game.id) { ui.id = game.id; ui.version = -1; ui.zoom = 1; ui.scrollLeft = 0; ui.scrollTop = 0; ui.focus = ownSeat ? core.CAMP_HOLES[ownSeat.camp][0] : '0,0'; }
    if (ui.version !== game.version) { ui.version = game.version; ui.selected = ''; }
    if (game.jumpPath.length) ui.selected = game.jumpPath.at(-1);
    const isHost = APP.room.host === APP.player?.name;
    const turn = game.seats[game.turnIndex];
    const myTurn = game.phase === 'playing' && !game.paused && turn?.playerId === APP.player?.id;
    const canPlay = myTurn && !ui.busy;
    const winner = game.seats.find(seat => seat?.playerId === game.winner);
    const status = game.phase === 'setup' ? `${game.seats.filter(Boolean).length} of ${game.playerCount} seats filled · Join a camp to play` : game.phase === 'finished' ? winner ? `${winner.name} wins! All ten marbles are home.` : `Draw. ${game.drawReason}` : game.paused ? 'Round paused by the host' : `${turn?.name || 'Player'}’s turn · ${turn ? campLabel(turn.camp) : ''}${myTurn ? ' · Your move' : ''}`;
    const missing = game.phase === 'playing' && game.seats.filter(Boolean).filter(seat => !APP.room.participants.some(player => player.id === seat.playerId));
    queueMicrotask(() => { if (!active()) return; layoutBoard(); if (focused) focusHole(ui.focus); });
    return `<section class="cc-game" aria-label="Chinese Checkers"><div class="cc-heading"><div><h2>Chinese Checkers</h2><p class="studio-help">Race your ten marbles to the opposite camp. Hop over any color; every marble stays on the board.</p></div>${isHost && game.phase !== 'setup' ? '<button class="btn-secondary" data-action="cc-restart">New round</button>' : ''}</div>
      <div class="cc-status" role="status" aria-live="polite">${escapeHtml(status)}</div>
      ${ownSeat ? `<p class="cc-camp-route"><span style="color:${core.CAMPS[ownSeat.camp].color};">Your marbles: ${escapeHtml(campLabel(ownSeat.camp))}</span> → <span style="color:${core.CAMPS[ownSeat.goal].color};">Goal camp: ${escapeHtml(campLabel(ownSeat.goal))}</span></p>` : '<p class="studio-help">You are watching. Seats can be joined during setup.</p>'}
      ${missing?.length ? `<p class="cc-notice">${escapeHtml(missing.map(seat => seat.name).join(', '))} left the room. Their seat is reserved for reconnecting. The host can pause or start a new round.</p>` : ''}
      <div class="cc-turn-actions" role="group" aria-label="Turn controls"><span>${game.phase === 'finished' ? 'Round complete. Play again or return to the session.' : game.phase === 'playing' ? game.paused ? 'The host can resume the round when everyone is ready.' : game.jumpPath.length ? 'Keep hopping with this marble, or end your turn.' : 'Select a marble, then a highlighted destination.' : 'Choose a camp below before the host starts.'}</span>${canPlay && game.jumpPath.length ? '<button class="btn-primary" data-action="cc-end-turn">End turn</button>' : ''}${canPlay && !game.jumpPath.length && !core.allLegalMoves(game).length ? '<button class="btn-primary" data-action="cc-pass">Pass turn</button>' : ''}${isHost && game.phase === 'playing' ? `<button class="btn-secondary" data-action="cc-pause">${game.paused ? 'Resume round' : 'Pause round'}</button>` : ''}</div>
      <div class="cc-layout"><div class="cc-board-panel">${renderBoard(game, ownSeat, canPlay)}</div><aside class="cc-sidebar">
        ${game.phase === 'setup' && isHost ? `<label class="form-label" for="ccPlayerCount">Players</label><select class="form-input" id="ccPlayerCount" ${ui.busy ? 'disabled' : ''}>${[2, 3, 4, 6].map(count => `<option value="${count}" ${game.playerCount === count ? 'selected' : ''}>${count} players</option>`).join('')}</select><p class="studio-help">Choose a layout, fill the seats, then start. Changing layouts can release extra seats.</p>` : ''}
        <h3>${game.phase === 'setup' ? 'Choose a camp' : 'Marbles home'}</h3>
        ${game.seats.map((seat, index) => { const camp = core.LAYOUTS[game.playerCount][index]; return `<div class="cc-seat ${game.phase === 'playing' && index === game.turnIndex ? 'cc-active-seat' : ''}" style="--cc-color:${core.CAMPS[camp].color};"><span class="cc-seat-symbol" aria-hidden="true">${core.CAMPS[camp].symbol}</span><div><strong>${escapeHtml(seat?.name || `${core.CAMPS[camp].name} camp`)}</strong><p>${game.phase === 'setup' ? `${escapeHtml(campLabel(camp))} → ${escapeHtml(campLabel((camp + 3) % 6))}` : `${core.progress(game, seat)} / 10 home`}</p></div>${game.phase === 'setup' && !seat && !ownSeat ? `<button class="btn-secondary" data-action="cc-join" data-index="${index}" ${ui.busy ? 'disabled' : ''}>Join</button>` : ''}</div>`; }).join('')}
        ${game.phase === 'setup' && ownSeat ? '<button class="btn-secondary" data-action="cc-leave">Leave seat</button>' : ''}
        ${game.phase === 'setup' && isHost ? `<button class="btn-primary" data-action="cc-start" ${!game.seats.every(Boolean) || ui.busy ? 'disabled' : ''}>Start round</button>` : ''}
        ${game.phase === 'finished' && isHost ? '<button class="btn-primary" data-action="cc-restart">Play again</button>' : ''}
        <details class="studio-details"><summary>How to play</summary><p class="studio-help">Move one marble to a neighboring empty hole, or hop over an adjacent marble into the empty hole immediately beyond. Any color can be hopped, including your own. You may chain hops and change direction between hops; choose End turn whenever you want to stop. Jumps are optional and never capture pieces. A step ends your turn immediately. Reach the opposite camp with all ten marbles to win. If no legal move exists, pass. Seats lock when the round starts.</p></details>
      </aside></div></section>`;
  }
  document.addEventListener('change', event => { if (event.target.id === 'ccPlayerCount' && active()) void request('configure', { playerCount: Number(event.target.value) }); });
  document.addEventListener('keydown', event => {
    const button = event.target.closest?.('.cc-hole');
    if (!button || !active()) return;
    const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [1, -1], ArrowDown: [-1, 1], Home: [0, -1], End: [0, 1] };
    const direction = directions[event.key]; if (!direction) return;
    event.preventDefault(); event.stopPropagation();
    const hole = core.BY_ID[button.dataset.hole];
    focusHole(`${hole.q + direction[0]},${hole.r + direction[1]}`);
  });
  root.addEventListener('resize', () => { if (active()) layoutBoard(); });
  const registry = root.TEAM_BUILDER_ACTIVITY_REGISTRY;
  registry.registerActivity('chinese-checkers', { createInitialState: room => core.createGame(room?.participants || [], { hostId: room?.participants?.find(player => player.name === room.host)?.id }), render: renderChineseCheckers });
  registry.registerAction('start-chinese-checkers', () => startActivityById('chinese-checkers'));
  registry.registerAction('cc-join', ({ parsed }) => request('join', { seatIndex: parsed.index }));
  registry.registerAction('cc-leave', () => request('leave'));
  registry.registerAction('cc-start', () => request('start'));
  registry.registerAction('cc-restart', () => request('restart'));
  registry.registerAction('cc-pause', () => request('pause', { paused: !APP.room.activityState.paused }));
  registry.registerAction('cc-end-turn', () => request('end-turn'));
  registry.registerAction('cc-pass', () => request('pass'));
  registry.registerAction('cc-hole', ({ dataset }) => {
    if (ui.busy || !active()) return;
    const game = APP.room.activityState, hole = dataset.hole;
    ui.focus = hole;
    if (game.phase !== 'playing' || game.paused || game.seats[game.turnIndex]?.playerId !== APP.player?.id) return;
    if (ui.selected && core.legalMoves(game, ui.selected).some(move => move.to === hole)) return request('move', { from: ui.selected, to: hole });
    ui.selected = core.legalMoves(game, hole).length ? hole : '';
    render();
  });
  registry.registerAction('cc-zoom-in', () => { ui.zoom = Math.min(4, ui.zoom + .5); layoutBoard({ type: 'zoom' }); });
  registry.registerAction('cc-zoom-out', () => { ui.zoom = Math.max(1, ui.zoom - .5); layoutBoard({ type: 'zoom' }); });
  registry.registerAction('cc-fit', () => { ui.zoom = 1; layoutBoard({ type: 'fit' }); });
  registry.registerAction('cc-center', () => { const seat = APP.room.activityState.seats.find(item => item?.playerId === APP.player?.id); if (seat) { ui.zoom = 3; layoutBoard({ camp: seat.camp }); } });
})(window);
