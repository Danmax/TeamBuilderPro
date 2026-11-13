(function (root) {
  let credentials = null, owner = '', wallet = null, busy = false, ready = false, lastSync = '', overlay = null, message = '', pending = null, returnFocus = null;
  function identity() {
    if (!APP.player?.id) throw new Error('Create a player profile first.');
    if (owner === APP.player.id && credentials) return credentials;
    owner = APP.player.id; ready = false; wallet = null;
    const key = `team-builder-wallet:${owner}`;
    try { credentials = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { credentials = null; }
    if (!credentials?.walletId || !credentials?.walletToken) {
      const bytes = root.crypto.getRandomValues(new Uint8Array(32));
      const token = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
      const idHex = [...root.crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
      const id = `${idHex.slice(0, 8)}-${idHex.slice(8, 12)}-4${idHex.slice(13, 16)}-a${idHex.slice(17, 20)}-${idHex.slice(20, 32)}`;
      credentials = { walletId: id, walletToken: token }; localStorage.setItem(key, JSON.stringify(credentials));
    }
    return credentials;
  }
  function roomPayload() { const key = APP.roomCode && APP.room ? `room:${APP.roomCode}` : ''; return key ? { key, authToken: APP.roomAccessToken || '', ...getSharedActorPayload(key) } : {}; }
  let rewardNotices = new Set();
  try { rewardNotices = new Set(JSON.parse(sessionStorage.getItem('coin-reward-notices') || '[]')); } catch (_) {}
  function update() {
    const reward = wallet?.history.find(r => r.kind === 'win' && r.awardKey && Date.now() - r.at < 10000 && !rewardNotices.has(r.awardKey));
    if (reward) {
      rewardNotices.add(reward.awardKey);
      try { sessionStorage.setItem('coin-reward-notices', JSON.stringify([...rewardNotices].slice(-100))); } catch (_) {}
      document.querySelector('.wallet-reward-notice')?.remove();
      const notice = document.createElement('div'); notice.className = 'wallet-reward-notice'; notice.setAttribute('role', 'status'); notice.textContent = `Victory! +${reward.points} reward points`;
      document.body.append(notice); setTimeout(() => notice.remove(), 6000);
    }
    document.querySelectorAll('[data-wallet-label]').forEach(el => { el.textContent = wallet ? `◉ ${wallet.coins.toLocaleString()} coins · ${wallet.points.toLocaleString()} points` : '◉ Wallet'; });
    if (overlay) draw();
  }
  async function sync() {
    if (busy || !APP.player?.id) return;
    busy = true;
    try {
      const auth = identity(), playerId = APP.player.id, context = roomPayload();
      if (!ready) { const result = await socketEmitAck('wallet:open', auth, 6000); wallet = result.wallet; ready = true; }
      if (APP.player?.id !== playerId) return;
      const result = await socketEmitAck('wallet:action', { ...auth, ...context, action: 'sync' }, 6000);
      if (APP.player?.id !== playerId) return;
      wallet = result.wallet; message = '';
    } catch (e) { message = e.message; }
    finally { busy = false; update(); }
  }
  async function action(action, amount) {
    if (busy) return;
    busy = true;
    const g = APP.room?.activityState;
    const signature = `${action}:${amount}:${APP.roomCode}:${g?.id}`;
    if (pending?.signature !== signature) pending = { signature, actionId: createRoomActorToken() };
    try {
      const auth = identity(), playerId = APP.player.id, context = roomPayload();
      if (!ready) { const result = await socketEmitAck('wallet:open', auth, 6000); wallet = result.wallet; ready = true; }
      if (APP.player?.id !== playerId) return;
      const result = await socketEmitAck('wallet:action', { ...auth, ...context, action, amount, actionId: pending.actionId, tableId: g?.id, version: g?.version }, 6000);
      if (APP.player?.id !== playerId) return;
      wallet = result.wallet; pending = null; message = action === 'exchange' ? `Exchanged ${amount} points for ${amount} coins.` : action === 'buy-in' ? `${amount} coins moved to your table stack.` : 'Chips returned to your wallet.';
      if (result.value) { const room = normalizeRoom(JSON.parse(result.value)); if (room?.code === APP.room?.code && room.revision >= APP.room.revision) APP.room = room; }
      if (action !== 'exchange') { if (document.activeElement?.id === 'walletAmount') document.activeElement.blur(); render(); }
    } catch (e) { message = e.message; }
    finally { busy = false; update(); }
  }
  const button = () => `<button type="button" class="btn-secondary wallet-open" data-action="open-wallet"><span data-wallet-label>${wallet ? `◉ ${wallet.coins.toLocaleString()} coins · ${wallet.points.toLocaleString()} points` : '◉ Wallet'}</span></button>`;
  function close() { overlay?.remove(); overlay = null; if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); returnFocus = null; }
  function draw() {
    if (!overlay) return;
    const keepFocus = document.activeElement?.id === 'walletAmount';
    const draft = overlay.querySelector('#walletAmount')?.value ?? '10';
    const g = APP.room?.activityState, me = g?.players?.find?.(p => p.id === APP.player.id);
    const coinTable = g?.coinMode && ['blackjack', 'texas-holdem', 'five-card-draw'].includes(APP.room?.currentActivity);
    const tableOpen = coinTable && g.phase !== 'playing';
    overlay.innerHTML = `<div class="wallet-panel"><div class="wallet-title"><h2>Your wallet</h2><button type="button" data-wallet-close aria-label="Close wallet">✕</button></div><p class="wallet-description">Win games. Earn points. Exchange them for coins to play at card tables.</p><div class="wallet-balances"><div><span>Reward points</span><strong>${wallet?.points.toLocaleString() || '0'}</strong></div><div><span>Available coins</span><strong>${wallet?.coins.toLocaleString() || '0'}</strong></div></div>${coinTable ? `<p class="wallet-description">At this table: ${me?.stack || 0} chips${me?.total ? ` · ${me.total} in play` : ''}. Leave between hands to return chips.</p>` : ''}<label for="walletAmount">Amount · 1 point = 1 coin = 1 chip</label><input class="form-input" id="walletAmount" type="number" inputmode="numeric" min="1" max="1000000000" step="1" value="10"><p class="wallet-description" data-wallet-preview></p><div class="wallet-buttons"><button class="btn-primary" type="button" data-wallet-exchange ${busy || !wallet?.points ? 'disabled' : ''}>Exchange points → coins</button>${tableOpen ? `<button class="btn-primary" type="button" data-wallet-buyin ${busy || !wallet?.coins ? 'disabled' : ''}>Buy chips · transfer amount above</button>${me ? `<button class="btn-secondary" type="button" data-wallet-return ${busy ? 'disabled' : ''}>Return all ${me.stack} chips & leave seat</button>` : ''}` : ''}</div><p class="wallet-message" role="status">${escapeHtml(message || (busy ? 'Updating wallet…' : ''))}</p><details><summary>How to earn points</summary><p>Connect 4: 20 · Checkers: 30 · Chinese Checkers: 30 · Memory: 20 · Family Face-Off: 30 per winning teammate · Spades: 50 (short match) or 75 (full match).</p><p>Rewards are fixed per completed win. Each winning human on a Spades or Family Face-Off team earns points. Ties, draws, practice chip wins, and unfinished games earn no reward points.</p></details><details><summary>Recent activity</summary>${wallet?.history.length ? wallet.history.slice(0, 15).map(r => `<p>${escapeHtml(r.label)} <strong>${r.points ? `${r.points > 0 ? '+' : ''}${r.points} points` : ''}${r.coins ? ` ${r.coins > 0 ? '+' : ''}${r.coins} coins` : ''}</strong></p>`).join('') : '<p>No rewards yet. Win a supported game to get started.</p>'}</details><p class="wallet-footnote">Your wallet is linked to this browser profile. Keep this browser’s saved data to retain access. Coins stay inside the app.</p></div>`;
    const field = overlay.querySelector('#walletAmount'); field.value = draft;
    field.oninput = () => {
      const value = Number(field.value), valid = Number.isSafeInteger(value) && value > 0 && value <= 1000000000;
      const canExchange = valid && !busy && wallet?.points >= value;
      overlay.querySelector('[data-wallet-exchange]').disabled = !canExchange;
      const buyButton = overlay.querySelector('[data-wallet-buyin]'); if (buyButton) buyButton.disabled = !valid || busy || wallet?.coins < value;
      overlay.querySelector('[data-wallet-preview]').textContent = !valid ? 'Enter a positive whole amount.' : canExchange ? `After exchange: ${wallet.points - value} points · ${wallet.coins + value} coins.` : `Exchange ${value} points for ${value} coins. ${tableOpen ? `Buy-in transfers ${value} coins to ${value} chips.` : ''}`;
    };
    field.oninput(); if (keepFocus) field.focus({ preventScroll: true });
    overlay.querySelector('[data-wallet-close]').onclick = close;
    const amount = () => Number(overlay.querySelector('#walletAmount').value);
    overlay.querySelector('[data-wallet-exchange]').onclick = () => action('exchange', amount());
    const buy = overlay.querySelector('[data-wallet-buyin]'); if (buy) buy.onclick = () => action('buy-in', amount());
    const leave = overlay.querySelector('[data-wallet-return]'); if (leave) leave.onclick = () => action('return', me.stack);
  }
  function open() {
    if (!overlay) { returnFocus = document.activeElement; overlay = document.createElement('section'); overlay.className = 'wallet-overlay'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Your wallet'); document.body.append(overlay); overlay.addEventListener('click', e => { if (e.target === overlay) close(); }); }
    draw(); overlay.querySelector('[data-wallet-close]').focus(); void sync();
  }
  document.addEventListener('keydown', e => {
    if (!overlay) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { const nodes = [...overlay.querySelectorAll('button:not(:disabled), input, summary')].filter(e => e.getClientRects().length); const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
  root.TeamBuilderWallet = { button, open, sync, observe() {
    if (!APP.player?.id) return;
    const g = APP.room?.activityState;
    const token = `${APP.player.id}:${APP.roomCode}:${APP.room?.currentActivity}:${g?.id || g?.startedAt}:${g?.phase === 'finished' ? 'finished' : 'active'}`;
    if (lastSync !== token) { lastSync = token; void sync(); }
  } };
  root.TEAM_BUILDER_ACTIVITY_REGISTRY.registerAction('open-wallet', open);
  setInterval(() => { if (typeof APP !== 'undefined' && APP.player?.id && (APP.room || overlay)) void sync(); }, 5000);
})(window);
