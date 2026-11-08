(function (root) {
  const core = root.TeamBuilderMemory;
  let busy = false;
  let optionsId = '';
  let roundOptions = null;
  let optionsOpen = false;
  async function request(action, extra = {}) {
    if (busy || !APP.roomCode) return;
    busy = true;
    try {
      const key = `room:${APP.roomCode}`;
      const game = APP.room.activityState;
      const response = await socketEmitAck('memory:action', { key, action, ...getSharedActorPayload(key), authToken: APP.roomAccessToken || '', gameId: game.id, version: game.version, ...extra }, 4000);
      if (response.value) APP.room = normalizeRoom(JSON.parse(response.value));
    } catch (error) { showError(error.message); }
    finally { busy = false; render(); }
  }
  function renderMemory() {
    const game = APP.room.activityState;
    if (!Array.isArray(game?.cards)) return '<p>Waiting for the Memory board…</p>';
    if (optionsId !== game.id) { optionsId = game.id; roundOptions = { theme: game.theme, pairCount: game.pairCount }; optionsOpen = false; }
    else optionsOpen = document.getElementById('memoryOptions')?.open ?? optionsOpen;
    const host = APP.room.host === APP.player?.name;
    const playing = game.players.some(player => player.id === APP.player?.id);
    const myTurn = game.phase === 'playing' && game.turnId === APP.player?.id;
    const turnPlayer = game.players.find(player => player.id === game.turnId);
    const winners = game.players.filter(player => game.winnerIds.includes(player.id)).map(player => player.name);
    const status = game.phase === 'finished' ? `${winners.join(' & ')} ${winners.length > 1 ? 'tie for first!' : 'wins!'}` : game.flipped.length === 2 ? 'No match — remember these cards. The next turn starts shortly.' : game.phase === 'waiting' ? 'Waiting for a player to join this round.' : `${turnPlayer?.name || 'Player'}’s turn${myTurn ? ' · Your move' : ''}`;
    const cards = game.cards.map((card, index) => {
      const revealed = card.value !== null;
      const symbol = revealed ? core.THEMES[game.theme]?.symbols[card.value] || '?' : '';
      const enabled = myTurn && !busy && game.flipped.length < 2 && !revealed;
      return `<button type="button" class="memory-card ${revealed ? 'memory-revealed' : ''} ${card.matchedBy ? 'memory-matched' : ''}" data-action="memory-flip" data-index="${index}" aria-label="Card ${index + 1}${revealed ? `, ${symbol}${card.matchedBy ? ', matched' : ', revealed'}` : ', face down'}" ${enabled ? '' : 'disabled'}><span class="memory-card-symbol" aria-hidden="true">${revealed ? symbol : '✦'}</span><span class="memory-card-number" aria-hidden="true">${index + 1}${card.matchedBy ? ' ✓' : ''}</span></button>`;
    }).join('');
    return `<section class="memory-game" aria-label="Memory matching game">
      <div class="memory-heading"><div><h2>Memory</h2><p class="studio-help">Flip two cards and find a pair. Match to score a point and play again.</p></div><span class="memory-theme">${escapeHtml(core.THEMES[game.theme]?.label || 'Animals')} · ${game.pairCount} pairs</span>${host && game.phase === 'finished' ? '<button class="btn-primary" data-action="memory-restart" style="width:auto;">Play again</button>' : ''}</div>
      <div class="memory-status" role="status" aria-live="polite">${escapeHtml(status)}</div>
      <div class="memory-progress"><span>${game.pairsMatched} / ${game.pairCount} pairs found</span><span>${game.attempts} attempts</span></div>
      ${!playing && game.phase !== 'finished' ? '<button class="btn-primary" data-action="memory-join" style="margin-bottom:14px;">Join this round</button>' : ''}
      <div class="memory-layout"><div class="memory-board ${game.pairCount === 12 ? 'memory-board-large' : ''}" role="group" aria-label="Memory cards">${cards}</div><aside class="memory-sidebar">
        <h3>${game.players.length === 1 ? 'Solo practice' : 'Scoreboard'}</h3>
        ${[...game.players].sort((a, b) => b.score - a.score).map(player => `<div class="memory-player ${game.phase !== 'finished' && game.turnId === player.id ? 'memory-active-player' : ''}"><span>${escapeHtml(player.name)}${APP.room.participants.some(item => item.id === player.id) ? '' : ' · left'}</span><strong>${player.score} ${player.score === 1 ? 'pair' : 'pairs'}</strong></div>`).join('')}
        ${!playing ? '<p class="studio-help">You are watching this round.</p>' : ''}
        <details class="studio-details"><summary>How to play</summary><p class="studio-help">Take turns revealing two cards. A matching pair stays face up and earns one point; the same player continues. A mismatch turns back over after a short pause and play passes to the next player. Most pairs wins; equal scores tie. Play alone to practice, or invite teammates. New arrivals can join the current round with zero points.</p></details>
        ${host ? `<details id="memoryOptions" class="studio-details" ${optionsOpen ? 'open' : ''}><summary>New round & options</summary><label class="form-label" for="memoryTheme">Card theme</label><select id="memoryTheme" class="form-input">${Object.entries(core.THEMES).map(([id, theme]) => `<option value="${id}" ${roundOptions.theme === id ? 'selected' : ''}>${escapeHtml(theme.label)}</option>`).join('')}</select><label class="form-label" for="memoryPairs">Board size</label><select id="memoryPairs" class="form-input">${[6, 8, 12].map(count => `<option value="${count}" ${roundOptions.pairCount === count ? 'selected' : ''}>${count * 2} cards · ${count} pairs</option>`).join('')}</select><button class="btn-secondary" data-action="memory-restart" style="margin-top:12px;">${game.phase === 'finished' ? 'Play again' : 'Start a new round'}</button><p class="studio-help">A new round reshuffles the cards and resets all scores.</p></details>` : ''}
      </aside></div></section>`;
  }
  document.addEventListener('change', event => {
    if (!roundOptions) return;
    if (event.target.id === 'memoryTheme') roundOptions.theme = event.target.value;
    if (event.target.id === 'memoryPairs') roundOptions.pairCount = Number(event.target.value);
  });
  const registry = root.TEAM_BUILDER_ACTIVITY_REGISTRY;
  registry.registerActivity('memory', { createInitialState: room => core.createGame(room?.participants || []).game, render: renderMemory });
  registry.registerAction('start-memory', () => startActivityById('memory'));
  registry.registerAction('memory-flip', ({ parsed }) => request('flip', { index: parsed.index }));
  registry.registerAction('memory-join', () => request('join'));
  registry.registerAction('memory-restart', () => request('restart', { theme: document.getElementById('memoryTheme')?.value, pairCount: Number(document.getElementById('memoryPairs')?.value) }));
})(window);
