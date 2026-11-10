(function (root) {
  const TYPES = Object.freeze(Object.assign(Object.create(null), { blackjack: { label: '21 / Blackjack', max: 6, min: 1 }, 'five-card-draw': { label: 'Five-Card Draw', max: 5, min: 2 }, 'texas-holdem': { label: 'Texas Hold’em', max: 8, min: 2 } }));
  const dealEffects = root.TeamBuilderCardEffects?.createDealTracker() || (() => []);
  const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  let privateState = null, busy = false, reading = '', failedStamp = '', selected = new Set(), selectionHand = '', serverOffset = 0;
  let inputDraft = null;
  const bettingInputs = new Set(['cardRaiseAmount', 'cardBetAmount']);
  function inputContext(table) {
    return table ? ['roomCode', 'playerId', 'tableId', 'handId', 'turnId', 'street', 'phase'].map(key => table.dataset[key] || '').join(':') : '';
  }
  function captureInput(element) {
    if (!bettingInputs.has(element?.id)) return null;
    inputDraft = { id: element.id, value: element.value, context: inputContext(element.closest('.card-table-game')) };
    return { id: element.id, cardInput: true };
  }
  function restoreInput() {
    if (!inputDraft) return;
    const table = document.querySelector('.card-table-game');
    if (!table || inputContext(table) !== inputDraft.context) { inputDraft = null; return; }
    const replacement = document.getElementById(inputDraft.id);
    // A private snapshot may briefly replace controls with a loading message.
    if (!replacement || replacement.disabled) return;
    replacement.value = inputDraft.value;
    inputDraft = null;
    replacement.dispatchEvent(new Event('input', { bubbles: true }));
    replacement.focus({ preventScroll: true });
    // Number inputs do not support selectionStart or setSelectionRange.
  }
  root.TeamBuilderCardTables = { captureInput, restoreInput };
  const stamp = game => `${APP.roomCode}:${APP.player?.id}:${game.id}:${game.handId}:${game.version}`;
  function accept(response) {
    if (Number.isFinite(response.serverNow)) serverOffset = response.serverNow - Date.now();
    if (response.value) {
      const incoming = normalizeRoom(JSON.parse(response.value));
      if (incoming && incoming.code === APP.room?.code && Number(incoming.revision) >= Number(APP.room.revision)) APP.room = incoming;
    }
    if (response.private) privateState = response.private;
  }
  async function readPrivate() {
    const game = APP.room?.activityState;
    if (!TYPES[APP.room?.currentActivity] || !game?.id) return;
    const token = stamp(game);
    if (reading === token || failedStamp === token) return;
    reading = token;
    const playerId = APP.player?.id, code = APP.roomCode;
    try {
      const key = `room:${code}`;
      const response = await socketEmitAck('cards:view', { key, ...getSharedActorPayload(key), authToken: APP.roomAccessToken || '' }, 6000);
      if (APP.roomCode === code && APP.player?.id === playerId && APP.room?.activityState?.id === game.id) accept(response);
      failedStamp = '';
    } catch (error) { failedStamp = token; }
    finally { if (reading === token) reading = ''; if (APP.roomCode === code && APP.room?.activityState?.id === game.id) render(); }
  }
  async function request(action, extra = {}) {
    if (busy || !TYPES[APP.room?.currentActivity]) return;
    inputDraft = null;
    if (bettingInputs.has(document.activeElement?.id)) document.activeElement.blur();
    busy = true;
    render();
    const game = APP.room.activityState, code = APP.roomCode;
    try {
      const key = `room:${code}`;
      const response = await socketEmitAck('cards:action', { key, ...getSharedActorPayload(key), authToken: APP.roomAccessToken || '', tableId: game.id, handId: game.handId, version: game.version, actionId: createRoomActorToken(), action, ...extra }, 6000);
      if (APP.roomCode === code && APP.room?.activityState?.id === game.id) accept(response);
      selected.clear(); failedStamp = '';
    } catch (error) { showError(error.message); privateState = null; failedStamp = ''; }
    finally { busy = false; if (APP.roomCode === code) render(); }
  }
  function card(card, options = {}) {
    const effect = options.effect;
    const motion = effect ? ` ct-card-${effect.kind}` : '';
    const timing = effect ? `style="--ct-effect-delay:${Math.round(effect.delay)}ms"` : '';
    if (!card) return `<span class="ct-card ct-card-back${motion}" ${timing} aria-label="Hidden card"><span aria-hidden="true">✦</span></span>`;
    const rank = ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[card.rank] || String(card.rank);
    const suit = SUITS[card.suit] || '?', label = `${rank} ${suit}`;
    return `<${options.select ? 'button type="button"' : 'span'} class="ct-card ${['H', 'D'].includes(card.suit) ? 'ct-red' : ''} ${options.selected ? 'ct-selected' : ''}${motion}" ${timing} aria-label="${escapeHtml(label)}${options.select ? ', select to replace' : ''}" ${options.select ? `data-action="cards-select" data-index="${options.index}" aria-pressed="${options.selected ? 'true' : 'false'}"` : ''}><span class="ct-card-corner" aria-hidden="true">${escapeHtml(rank)}${suit}</span><span class="ct-card-suit" aria-hidden="true">${suit}</span><span class="ct-card-rank" aria-hidden="true">${escapeHtml(rank)}</span></${options.select ? 'button' : 'span'}>`;
  }
  function avatar(id) {
    if (APP.room.activityState.players?.some(p => p.id === id && p.isHouse)) return '🎩';
    const person = APP.room.participants.find(p => p.id === id);
    return root.TeamBuilderCharacter && person?.character ? root.TeamBuilderCharacter.render(person.character, person.avatar || '') : escapeHtml(person?.avatar || '👤');
  }
  function button(action, label, enabled = true, extra = '') { return `<button type="button" class="${action === 'fold' ? 'btn-secondary' : 'btn-primary'}" data-action="cards-${action}" ${enabled && !busy ? '' : 'disabled'} ${extra}>${label}</button>`; }
  function renderTable() {
    const game = APP.room?.activityState, type = TYPES[APP.room?.currentActivity];
    if (!game?.id || !Array.isArray(game.players)) return '<p role="status">Preparing the private card table…</p>';
    const host = APP.room.host === APP.player?.name, me = game.players.find(p => p.id === APP.player?.id), active = game.phase === 'playing';
    const current = game.players.find(p => p.id === game.turnId), mine = game.turnId === APP.player?.id;
    const valid = privateState?.playerId === APP.player?.id && privateState?.tableId === game.id && privateState?.handId === game.handId && privateState?.version === game.version;
    if (!valid) void readPrivate();
    const own = valid ? privateState : null, legal = own?.legal || {};
    if (selectionHand !== `${game.id}:${game.handId}`) { selectionHand = `${game.id}:${game.handId}`; selected = new Set(); }
    const drawTurn = legal.draw, seating = !active;
    const detailsOpen = document.querySelector('.ct-details')?.open === true;
    const tableCards = game.type === 'blackjack' ? game.dealer : game.board;
    const failed = failedStamp === stamp(game);
    const awards = [...game.results.reduce((map, result) => { const prior = map.get(result.playerId); map.set(result.playerId, prior ? { ...prior, amount: prior.amount + result.amount, net: prior.net + result.net, label: 'Split hands' } : { ...result }); return map; }, new Map()).values()];
    const winner = awards.filter(result => result.net > 0).sort((a, b) => b.amount - a.amount)[0];
    if (root.TeamBuilderGameVictory) root.TeamBuilderGameVictory.observe({ key: `cards:${game.id}:${game.handId}`, kind: type.label, finished: game.phase === 'settled' && (!me || !me.inHand || Boolean(own)), delayMs: root.TeamBuilderCardEffects?.RESULT_DELAY_MS || 3000, finishedAt: game.settledAt, winnerId: winner?.playerId, winnerName: winner?.name, viewerId: APP.player?.id, winner: APP.room.participants.find(p => p.id === winner?.playerId), reason: winner ? `${winner.label} · +${winner.net} play chips` : '' });
    const effectKey = `${APP.roomCode}:${APP.player.id}:${game.id}:${game.handId}`;
    const boardEffects = dealEffects(`${effectKey}:board`, tableCards);
    const handEffects = own ? dealEffects(`${effectKey}:hand`, own.cards) : [];
    const revealed = game.phase === 'settled' && game.type !== 'blackjack' ? game.results.map(result => ({ result, player: game.players.find(p => p.id === result.playerId) })).filter(entry => entry.player?.shownCards.length && entry.player.id !== APP.player.id) : [];
    const seatedCount = game.players.filter(p => !p.away && p.stack > 0 && (game.type !== 'blackjack' || p.stack >= p.nextBet)).length;
    const splitHands = own?.hands?.length > 1 ? `<div class="ct-split-hands" aria-label="Your split hands">${own.hands.map((hand, index) => {
      const playing = active && mine && index === own.activeHand;
      const effects = dealEffects(`${effectKey}:split:${index}`, hand.cards);
      return `<article class="ct-split-hand ${playing ? 'ct-active-hand' : ''}" ${playing ? 'aria-current="true"' : ''}><div class="ct-private-heading"><strong>Hand ${index + 1} · ${hand.total}</strong><span>${hand.bet} chips · ${playing ? 'Playing' : escapeHtml(hand.status || 'Waiting')}</span></div><div class="ct-hand">${hand.cards.map((c, i) => card(c, { effect: effects[i] })).join('')}</div></article>`;
    }).join('')}</div>` : '';
    let actions = '';
    if (!me) actions = button('join', `Take a seat · ${game.players.length}/${type.max}`, game.players.length < type.max);
    else if (seating) actions = `<div class="ct-between"><span>${me.stack ? 'Ready for the next hand' : 'Out of chips — ask the host to reset stacks'}</span>${button('leave', 'Leave seat')}</div>`;
    else if (game.paused) actions = '<p>The hand is paused by the host.</p>';
    else if (!me.inHand) actions = '<p>You are seated for the next hand.</p>';
    else if (!own) actions = '<p>Loading your private controls…</p>';
    else if (!mine) actions = `<p>${me.folded ? 'You folded. Your cards stay private.' : `Waiting for ${escapeHtml(current?.name || 'the next player')}.`}</p>`;
    else if (game.type === 'blackjack') actions = `<div class="ct-action-buttons">${button('hit', 'Hit', legal.hit)}${button('stand', 'Stand', legal.stand)}${button('double', `Double · ${legal.handBet ?? me.total} more`, legal.double)}${button('split', `Split · ${legal.handBet ?? me.total} more`, legal.split)}</div>`;
    else if (drawTurn) actions = button('draw', selected.size ? `Replace ${selected.size} selected card${selected.size === 1 ? '' : 's'}` : 'Keep all five cards');
    else actions = `<div class="ct-action-buttons">${button('fold', 'Fold')}${legal.check ? button('check', 'Check') : button('call', `Call ${legal.call}${legal.call === me.stack ? ' · all-in' : ''}`, Boolean(legal.call))}</div>${legal.raise ? `<div class="ct-raise"><label for="cardRaiseAmount">${game.currentBet ? 'Raise to' : 'Bet'} (total this round)</label><div><input id="cardRaiseAmount" class="form-input" type="number" inputmode="numeric" min="${legal.minRaiseTo}" max="${legal.maxRaiseTo}" step="1" value="${legal.minRaiseTo}" aria-describedby="cardRaiseHelp">${button('raise', `${game.currentBet ? 'Raise to' : 'Bet'} ${legal.minRaiseTo}`)}</div><small id="cardRaiseHelp">${me.bet} already in · add ${legal.minRaiseTo - me.bet} · maximum total ${legal.maxRaiseTo}</small></div>` : ''}`;
    return `<section class="card-table-game" aria-label="${type.label}" data-room-code="${escapeHtml(APP.roomCode)}" data-player-id="${escapeHtml(APP.player.id)}" data-table-id="${escapeHtml(game.id)}" data-hand-id="${escapeHtml(game.handId)}" data-turn-id="${escapeHtml(game.turnId)}" data-street="${escapeHtml(game.street)}" data-phase="${escapeHtml(game.phase)}">
      <header class="ct-heading"><div><h2>${type.label}</h2><p>Play chips · ${game.type === 'blackjack' ? 'Automated dealer · 3:2 blackjack' : `Blinds ${game.smallBlind}/${game.bigBlind}`}</p></div><span class="ct-hand-number">Hand ${game.handNumber || 1}</span></header>
      <div class="ct-status" role="status"><strong>${game.paused ? 'Paused' : active ? mine ? 'Your turn' : current?.isHouse ? 'House is thinking…' : `${escapeHtml(current?.name || 'Dealer')}’s turn` : game.phase === 'settled' ? 'Hand complete' : 'Take your seats'}</strong><span>${escapeHtml(game.street === 'draw' ? 'Replace cards' : game.street === 'postdraw' ? 'Final betting' : game.street || 'Waiting')} ${active ? '<span id="cardTurnClock" aria-label="Time remaining"></span>' : ''}</span></div>
      <div class="ct-felt"><div class="ct-pot">${game.type === 'blackjack' ? 'Table bets' : 'Pot'} <strong>${active ? game.pot : game.lastPot}</strong></div><div class="ct-board" aria-label="${game.type === 'blackjack' ? 'Dealer cards' : 'Community cards'}">${tableCards.length ? tableCards.map((c, index) => card(c, { effect: boardEffects[index] })).join('') : `<span class="ct-table-note">${game.type === 'five-card-draw' ? 'Five private cards. One chance to draw.' : 'Your table is ready.'}</span>`}</div>${game.type === 'blackjack' && game.phase === 'settled' ? `<p>Dealer total: ${game.dealer.reduce((sum, c) => sum + (c.rank === 14 ? 1 : Math.min(10, c.rank)), 0) + (game.dealer.some(c => c.rank === 14) && game.dealer.reduce((sum, c) => sum + (c.rank === 14 ? 1 : Math.min(10, c.rank)), 0) <= 11 ? 10 : 0)}</p>` : ''}<p class="ct-message" title="${escapeHtml(game.message)}">${escapeHtml(game.message)}</p></div>
      ${revealed.length ? `<section class="ct-showdown" aria-label="Revealed winning hands"><h3>Opponent’s winning hand</h3>${revealed.map(({ result, player }) => {
        const effects = dealEffects(`${effectKey}:shown:${player.id}`, player.shownCards);
        return `<article><div class="ct-reveal-heading"><strong>${escapeHtml(player.name)}${player.isHouse ? ' · Computer' : ''}</strong><span>${escapeHtml(result.label)}</span></div><div class="ct-hand ${player.shownCards.length === 5 ? 'ct-five' : ''}">${player.shownCards.map((c, index) => card(c, { effect: effects[index] })).join('')}</div></article>`;
      }).join('')}</section>` : ''}
      ${me ? `<section class="ct-private" aria-label="Your private hand"><div class="ct-private-heading"><strong>${splitHands ? 'Your split hands' : `Your hand${own?.total !== null && own?.total !== undefined ? ` · ${own.total}` : ''}`}</strong><span>${me.stack} chips${me.total ? ` · ${me.total} committed` : ''}</span></div>${drawTurn ? '<p class="ct-help">Tap cards to replace. Leave them unselected to keep them.</p>' : ''}${splitHands || `<div class="ct-hand ${own?.cards.length === 5 ? 'ct-five' : ''}">${own ? own.cards.length ? own.cards.map((c, index) => card(c, { select: drawTurn && !busy, index, selected: selected.has(index), effect: handEffects[index] })).join('') : '<span class="ct-help">Your cards arrive with the next deal.</span>' : '<span class="ct-help">Loading your cards privately…</span>'}</div>`}${failed ? '<p class="ct-help">Could not retrieve your hand. <button class="btn-secondary" data-action="cards-refresh">Retry</button></p>' : ''}</section>` : '<p class="ct-help">You are watching. Take an open seat to join the next deal.</p>'}
      <div class="ct-controls" aria-label="Card game controls">${actions}${host && seating && game.type !== 'blackjack' && !game.players.some(p => p.isHouse) ? button('house', 'Play vs house', game.players.length + (me ? 0 : 1) + 1 <= type.max) : ''}${host && seating ? button('deal', game.handNumber ? 'Deal next hand' : 'Deal first hand', seatedCount >= type.min) : ''}${host && active ? button(game.paused ? 'resume' : 'pause', game.paused ? 'Resume hand' : 'Pause hand') : ''}</div>
      ${game.results.length ? `<div class="ct-results" role="status">${game.results.map(r => `<div class="ct-result"><strong>${escapeHtml(r.name)}${Number.isInteger(r.handIndex) ? ` · Hand ${r.handIndex + 1}` : ''}</strong><span>${escapeHtml(r.label)} · ${r.net > 0 ? '+' : ''}${r.net}</span></div>`).join('')}</div>` : ''}
      <details class="ct-details" ${detailsOpen ? 'open' : ''}><summary>Seats, results & rules <span>${game.players.length}/${type.max}</span></summary><div class="ct-seats">${game.players.map(p => `<article class="ct-seat ${game.turnId === p.id ? 'ct-turn' : ''}"><div><span class="ct-avatar" aria-hidden="true">${avatar(p.id)}</span><strong>${escapeHtml(p.name)}${p.id === game.dealerId && game.type !== 'blackjack' ? ' · D' : ''}</strong><span>${p.stack} chips · ${p.total} committed</span><small>${p.away ? 'Reconnecting · seat reserved' : !p.inHand && active ? 'Next hand' : p.folded ? 'Folded' : p.allIn && active ? 'All-in' : escapeHtml(p.status || `${p.isHouse ? 'Computer · ' : ''}${p.cardCount} cards`)}</small></div><div class="ct-seat-cards" aria-label="${escapeHtml(p.name)}’s ${p.shownCards.length ? 'revealed hand' : 'hidden cards'}">${p.blackjackHands?.length ? p.blackjackHands.map((h, i) => `<div class="ct-seat-split"><small>Hand ${i + 1} · ${h.bet} chips · ${escapeHtml(h.status || 'Waiting')}</small><div>${h.cards.length ? h.cards.map(c => card(c)).join('') : Array.from({ length: Math.min(h.cardCount, 5) }, () => card(null)).join('')}</div></div>`).join('') : p.shownCards.length ? p.shownCards.map(c => card(c)).join('') : Array.from({ length: Math.min(p.cardCount, 5) }, () => card(null)).join('')}</div>${host && seating && (p.away || p.isHouse) ? button('remove', p.isHouse ? 'Remove house' : 'Remove idle seat', true, `data-player-id="${escapeHtml(p.id)}"`) : ''}</article>`).join('')}</div>
      <div class="ct-rules"><p>${game.type === 'blackjack' ? 'Aces count as 1 or 11. Dealer stands on all 17s. Natural blackjack pays 3:2; other wins pay 1:1; ties return your bet. Split two equal-value cards by matching the bet, up to four hands. Play each hand in order; doubling on any two-card hand is allowed. Split aces receive one card each and cannot be split again. A split 21 pays 1:1. No insurance or surrender.' : game.type === 'five-card-draw' ? 'Five private cards, betting, one draw of 0–5 cards, final betting, and showdown. Best hand wins. Blinds rotate with the dealer.' : 'Two private cards and five community cards. Bet before the flop, then on the flop, turn, and river. The best five-card hand wins.'}</p><p>${game.type !== 'blackjack' ? 'No-limit betting with all-ins, side pots, and split pots. A short all-in does not automatically reopen raising. ' : ''}60 seconds per decision. Timeouts ${game.type === 'blackjack' ? 'stand' : 'check when possible, otherwise fold; draw timeouts keep all cards'}. Late arrivals wait for the next deal. Disconnected seats are reserved for 60 seconds and released between hands.</p>
      ${me && seating && game.type === 'blackjack' ? `<label for="cardBetAmount">Your next bet (increments of 10)</label><div class="ct-bet-setting"><input id="cardBetAmount" class="form-input" type="number" inputmode="numeric" min="10" step="10" max="${me.stack}" value="${me.nextBet}">${button('bet', 'Save bet')}</div>` : ''}
      ${host && seating ? `<div class="ct-host-settings">${game.type !== 'blackjack' ? `<label for="cardBlindPreset">Blinds</label><select id="cardBlindPreset" class="form-input">${[20, 50, 100].map(big => `<option value="${big}" ${game.bigBlind === big ? 'selected' : ''}>${big / 2}/${big}</option>`).join('')}</select>${button('configure', 'Save blinds')}` : ''}${button('reset', 'Reset stacks to 1,000')}</div>` : ''}</div></details>
    </section>`;
  }
  for (const [id] of Object.entries(TYPES)) {
    root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerActivity(id, { createInitialState: () => ({ preparing: true }), render: renderTable });
    root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction(`start-${id}`, () => startActivityById(id));
  }
  for (const action of ['join', 'leave', 'deal', 'hit', 'stand', 'double', 'split', 'fold', 'check', 'call', 'pause', 'resume', 'reset', 'house']) root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction(`cards-${action}`, () => request(action));
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-raise', () => request('raise', { amount: Number(document.getElementById('cardRaiseAmount')?.value) }));
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-bet', () => request('bet', { amount: Number(document.getElementById('cardBetAmount')?.value) }));
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-configure', () => request('configure', { amount: Number(document.getElementById('cardBlindPreset')?.value) }));
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-remove', ({ dataset }) => request('remove', { playerId: dataset.playerId }));
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-draw', () => request('draw', { indices: [...selected] }));
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-select', ({ dataset }) => { const index = Number(dataset.index); if (selected.has(index)) selected.delete(index); else selected.add(index); render(); });
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('cards-refresh', () => { failedStamp = ''; void readPrivate(); });
  document.addEventListener('input', event => {
    if (event.target.id !== 'cardRaiseAmount') return;
    const legal = privateState?.legal || {}, amount = Number(event.target.value), label = APP.room?.activityState.currentBet ? 'Raise to' : 'Bet';
    const action = document.querySelector('[data-action="cards-raise"]');
    if (action) { action.textContent = `${label} ${amount}`; action.disabled = busy || !Number.isSafeInteger(amount) || amount < legal.minRaiseTo || amount > legal.maxRaiseTo; }
    const help = document.getElementById('cardRaiseHelp'); if (help) help.textContent = `${legal.ownBet} already in · add ${Math.max(0, amount - legal.ownBet)} · maximum total ${legal.maxRaiseTo}`;
  });
  setInterval(() => {
    const clock = document.getElementById('cardTurnClock'), game = APP.room?.activityState;
    if (clock && TYPES[APP.room?.currentActivity]) clock.textContent = game.paused ? '' : `${Math.max(0, Math.ceil((game.deadline - Date.now() - serverOffset) / 1000))}s`;
  }, 500);
})(window);
