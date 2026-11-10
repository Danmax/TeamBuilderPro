(function (root) {
  const suits = { C: '♣', D: '♦', H: '♥', S: '♠' };
  let own = null, loading = '', failure = '', busy = false, selected = '', bid = 1;
  const stamp = () => { const g = APP.room?.activityState; return `${APP.roomCode}:${APP.player?.id}:${g?.id}:${g?.handId}:${g?.version}`; };
  function accept(response) {
    if (response.value) { const room = normalizeRoom(JSON.parse(response.value)); if (room?.code === APP.room?.code && Number(room.revision) >= Number(APP.room.revision)) APP.room = room; }
    if (response.private) own = response.private;
  }
  async function request(action, data = {}) {
    if (busy || APP.room?.currentActivity !== 'spades') return;
    const g = APP.room.activityState, token = stamp(), code = APP.roomCode;
    busy = true;
    try {
      const key = `room:${code}`;
      const result = await socketEmitAck(action ? 'spades:action' : 'spades:view', { key, ...getSharedActorPayload(key), authToken: APP.roomAccessToken || '', tableId: g.id, handId: g.handId, version: g.version, actionId: createRoomActorToken(), action, ...data }, 6000);
      if (APP.roomCode === code && APP.room?.activityState?.id === g.id) { accept(result); selected = ''; failure = ''; }
    } catch (e) { failure = token; if (action) showError(e.message); }
    finally { busy = false; loading = ''; if (APP.roomCode === code && APP.room?.currentActivity === 'spades') render(); }
  }
  const keyFor = c => `${c.suit}:${c.rank}`;
  function card(c, playable = false, chosen = false) {
    const rank = ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[c.rank] || c.rank, suit = suits[c.suit];
    return `<${playable ? 'button type="button"' : 'span'} class="ct-card ${['D', 'H'].includes(c.suit) ? 'ct-red' : ''} ${chosen ? 'ct-selected' : ''}" ${playable ? `data-action="spades-select" data-card="${keyFor(c)}" aria-pressed="${chosen}"` : ''} aria-label="${rank} ${suit}"><span class="ct-card-corner">${rank}<span>${suit}</span></span><span class="ct-card-suit">${suit}</span><span class="ct-card-rank">${rank}</span></${playable ? 'button' : 'span'}>`;
  }
  const button = (action, label, enabled = true, data = '') => `<button type="button" class="btn-primary" data-action="spades-${action}" ${data} ${busy || !enabled ? 'disabled' : ''}>${label}</button>`;
  function renderSpades() {
    const g = APP.room.activityState;
    if (!g?.id) return '<p>Preparing the Spades table…</p>';
    const me = g.players.find(p => p.id === APP.player.id), host = APP.room.host === APP.player.name;
    const valid = own?.playerId === APP.player.id && own?.tableId === g.id && own?.handId === g.handId && own?.version === g.version;
    if (!valid && !busy && loading !== stamp() && failure !== stamp()) { loading = stamp(); void request(); }
    const hand = valid ? own.cards : [], mine = g.turnId === APP.player.id && !g.paused;
    const legal = new Set(valid ? own.legal.cards.map(keyFor) : []);
    const myTeam = me?.position % 2;
    const winner = g.phase === 'finished' ? g.players.find(p => p.position % 2 === g.winnerTeam && !p.isHouse) : null;
    if (winner) root.TeamBuilderGameVictory?.observe({ key: `spades:${g.matchId}:${APP.player.id}`, kind: 'Spades', finished: true, finishedAt: g.finishedAt, winnerId: me && myTeam === g.winnerTeam ? me.id : winner.id, winnerName: `Team ${g.winnerTeam + 1}`, viewerId: APP.player.id, reason: `${g.scores[0]} – ${g.scores[1]} · Match complete` });
    const seats = [0, 1, 2, 3].map(position => {
      const p = g.players.find(p => p.position === position), relative = (position - (me?.position || 0) + 4) % 4;
      const person = APP.room.participants.find(s => s.id === p?.id);
      const avatar = person?.character && root.TeamBuilderCharacter ? root.TeamBuilderCharacter.render(person.character, person.avatar || '') : escapeHtml(p?.isHouse ? '🤖' : person?.avatar || '👤');
      return `<article class="sp-seat sp-position-${relative} ${g.turnId === p?.id ? 'sp-current' : ''}"><div class="ct-seat-portrait"><span class="ct-avatar" aria-hidden="true">${avatar}</span>${g.dealerPosition === position ? '<span class="ct-dealer-badge" aria-label="Dealer">D</span>' : ''}</div><strong>${p ? escapeHtml(p.name) : 'Open seat'}${p?.id === me?.id && me ? ' · You' : ''}</strong><small>Team ${position % 2 + 1}${me && p?.position === (me.position + 2) % 4 ? ' · Partner' : ''}</small>${p ? `<span>Bid ${p.bid === null ? '—' : p.bid === 0 ? 'Nil' : p.bid} · ${p.tricks} tricks</span><small>${p.isHouse ? 'Computer' : p.awaySince ? 'Reconnecting · automatic play' : `${p.cardCount} cards`}</small>` : button('join', 'Take seat', !g.startedAt, `data-position="${position}"`)}${p?.isHouse && !['bidding', 'playing', 'review'].includes(g.phase) && !me ? button('join', 'Replace computer', true, `data-position="${position}"`) : ''}</article>`;
    }).join('');
    const trick = g.trick.map(play => {
      const p = g.players.find(p => p.id === play.playerId), pos = (p.position - (me?.position || 0) + 4) % 4;
      return `<div class="sp-play sp-position-${pos}">${card(play.card)}<small>${escapeHtml(p.name)}</small></div>`;
    }).join('');
    let controls = '';
    if (g.paused) controls = '<p>The host paused the match.</p>';
    else if (mine && g.phase === 'bidding') controls = `<label for="spadesBid">Your bid</label><div class="sp-bid"><select class="form-input" id="spadesBid">${Array.from({ length: 14 }, (_, i) => `<option value="${i}" ${i === bid ? 'selected' : ''}>${i === 0 ? 'Nil · take no tricks (±100)' : `${i} trick${i === 1 ? '' : 's'}`}</option>`).join('')}</select>${button('bid', 'Submit bid')}</div>`;
    else if (mine && g.phase === 'playing') controls = `<p>${selected ? 'Selected card ready to play.' : 'Select a highlighted card, then confirm.'}</p>${button('play', 'Play selected card', legal.has(selected))}`;
    else if (g.turnId) controls = `<p>Waiting for ${escapeHtml(g.players.find(p => p.id === g.turnId)?.name || 'the next player')}.</p>`;
    return `<section class="card-table-game sp-game" aria-label="Spades"><header class="ct-heading"><div><h2>Spades <span aria-hidden="true">♠</span></h2><p>Partners · First to ${g.target} · Hand ${g.handNumber || 1}</p></div>${root.TeamBuilderWallet?.button() || ''}</header><div class="sp-scoreboard">${[0, 1].map(team => { const players = g.players.filter(p => p.position % 2 === team), contract = players.reduce((s, p) => s + (p.bid || 0), 0), tricks = players.filter(p => p.bid > 0).reduce((s, p) => s + p.tricks, 0); return `<article><span>Team ${team + 1}${myTeam === team ? ' · Our team' : ''}</span><strong>${g.scores[team]}</strong><small>${g.bags[team]} bags · Contract ${tricks} / ${contract}</small></article>`; }).join('')}</div><div class="ct-status" role="status"><strong>${mine ? 'Your turn' : g.phase.replace('-', ' ')}</strong><span>${g.broken ? '♠ Spades broken' : 'Spades unbroken'} · Trick ${Math.min(g.trickNumber + (g.phase === 'review' ? 0 : 1), 13)} / 13</span></div><div class="ct-arena"><div class="ct-felt sp-felt"><div class="sp-playfield">${seats}<div class="sp-trick">${trick || '<p>Bid, then play a card.<br>Follow the led suit.</p>'}</div></div><p class="ct-message" role="status">${escapeHtml(g.message)}</p>${me ? `<section class="ct-private sp-private" aria-label="Your private hand"><div class="ct-private-heading"><strong>Your hand</strong><span>${mine && g.phase === 'playing' ? 'Highlighted cards are legal' : `${hand.length} cards`}</span></div><div class="ct-hand">${hand.map(c => `<span class="${mine && g.phase === 'playing' && !legal.has(keyFor(c)) ? 'sp-illegal' : ''}">${card(c, mine && legal.has(keyFor(c)) && !busy, selected === keyFor(c))}</span>`).join('') || '<p class="ct-help">Your cards arrive with the next deal.</p>'}</div>${failure === stamp() ? button('refresh', 'Retry private hand') : ''}</section>` : '<p class="ct-help">Watch the table or take an available seat.</p>'}</div></div><div class="ct-controls sp-controls">${controls}${host && !g.startedAt ? `<label for="spadesTarget">Match target</label><select class="form-input" id="spadesTarget"><option value="500" ${g.target === 500 ? 'selected' : ''}>500 points · 75 reward points per winner</option><option value="250" ${g.target === 250 ? 'selected' : ''}>250 points · 50 reward points per winner</option></select>${button('target', 'Save target')}${button('computers', 'Fill open seats with computers', g.players.length < 4)}` : ''}${host && ['waiting', 'hand-complete'].includes(g.phase) ? button('deal', g.handNumber ? 'Deal next hand' : 'Start match', g.players.length === 4) : ''}${host && ['bidding', 'playing', 'review'].includes(g.phase) ? button(g.paused ? 'resume' : 'pause', g.paused ? 'Resume match' : 'Pause match') : ''}${host && ['hand-complete', 'finished'].includes(g.phase) ? button('new-match', 'New match · reset teams and scores') : ''}${me && !g.startedAt ? button('leave', 'Leave seat') : ''}</div>${g.lastTrick.length ? `<details class="ct-details"><summary>Last trick · ${escapeHtml(g.players.find(p => p.id === g.trickWinner)?.name || '')}</summary><div class="ct-hand sp-last">${g.lastTrick.map(p => card(p.card)).join('')}</div></details>` : ''}<details class="ct-details" ${g.phase === 'hand-complete' || g.phase === 'finished' ? 'open' : ''}><summary>Score history & rules</summary><div class="ct-rules">${g.history.map(h => `<p>Hand ${h.hand}: ${h.teams.map((t, i) => `Team ${i + 1}: ${t.points >= 0 ? '+' : ''}${t.points} (${t.contractPoints} contract, ${t.nilPoints} Nil, ${t.extra} bags, −${t.penalties} penalty) → ${h.scores[i]}`).join(' · ')}</p>`).join('')}<p>Follow suit if possible. Spades trump all other suits. Lead spades only after they are broken or when holding only spades. The trick winner leads next. Make your team's bid for 10 points per bid trick, plus 1 per extra trick. Miss it and lose 10 per bid trick. Every 10 bags costs 100 points. Nil earns +100 for zero tricks, otherwise −100; failed-Nil tricks count as bags, not toward your partner's contract. No blind Nil or jokers. Ties at the target continue another hand.</p><p>60 seconds per decision; timeouts bid or play automatically. Disconnected seats stay reserved for the match. Match wins earn fixed reward points; individual tricks and hands do not.</p></div></details></section>`;
  }
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerActivity('spades', { createInitialState: () => ({ preparing: true }), render: renderSpades });
  const register = (name, fn) => root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction(`spades-${name}`, fn);
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('start-spades', () => startActivityById('spades'));
  for (const action of ['deal', 'computers', 'pause', 'resume', 'new-match', 'leave']) register(action, () => request(action));
  register('join', ({ dataset }) => request('join', { position: Number(dataset.position) }));
  register('target', () => request('configure', { amount: Number(document.getElementById('spadesTarget').value) }));
  register('bid', () => { bid = Number(document.getElementById('spadesBid').value); return request('bid', { amount: bid }); });
  register('select', ({ dataset }) => { selected = dataset.card; render(); });
  register('play', () => { const [suit, rank] = selected.split(':'); return request('play', { card: { suit, rank: Number(rank) } }); });
  register('refresh', () => { failure = ''; return request(); });
})(window);
