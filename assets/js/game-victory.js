(function (root) {
  const CELEBRATION_MS = 4500;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function createWinTracker(seen = new Set(), remember = () => {}) {
    const observations = new Map();
    return (result, now = Date.now()) => {
      if (!result?.key) return false;
      const previous = observations.get(result.key);
      observations.delete(result.key); observations.set(result.key, { finished: result.finished, at: now });
      if (observations.size > 128) observations.delete(observations.keys().next().value);
      if (!result.finished || (!result.winnerId && !['loss', 'push'].includes(result.outcome)) || seen.has(result.key)) return false;
      const finishedAt = Number(result.finishedAt) || 0;
      const recent = finishedAt ? now - finishedAt >= -1000 && now - finishedAt < 10000 : previous && !previous.finished && now - previous.at < 10000;
      seen.add(result.key); remember([...seen].slice(-128));
      if (seen.size > 128) seen.delete(seen.values().next().value);
      return Boolean(recent);
    };
  }
  function banner(result) {
    if (!result?.winnerId || !result?.winnerName) return '';
    return `<div class="board-victory-banner" role="status"><span aria-hidden="true">🏆</span><div><strong>${escape(result.winnerName)} wins!</strong><p>${escape(result.reason || 'A brilliant finish. Well played!')}</p></div><span class="board-victory-tag">${escape(result.kind)}</span></div>`;
  }
  function createController() {
    const storageKey = 'team-builder-match-celebrations';
    let stored = [];
    try { const value = JSON.parse(root.sessionStorage.getItem(storageKey) || '[]'); if (Array.isArray(value)) stored = value.filter(key => typeof key === 'string').slice(-128); } catch (_) { /* Memory deduplication still works if storage is unavailable. */ }
    const track = createWinTracker(new Set(stored), keys => { try { root.sessionStorage.setItem(storageKey, JSON.stringify(keys)); } catch (_) {} });
    let frameKey = '', overlay = null, overlayKey = '', timer = null, pendingKey = '', pendingTimer = null;
    function clear() { root.clearTimeout(timer); root.clearTimeout(pendingTimer); timer = null; pendingTimer = null; pendingKey = ''; overlay?.remove(); overlay = null; overlayKey = ''; }
    function show(result) {
      clear(); overlayKey = result.key;
      overlay = root.document.createElement('section'); overlay.className = 'game-victory-overlay'; overlay.setAttribute('aria-label', `${result.kind} victory celebration`);
      if (result.outcome === 'loss' || result.outcome === 'push') {
        const loss = result.outcome === 'loss';
        overlay.className += ' game-result-neutral';
        overlay.setAttribute('aria-label', `${result.kind} ${loss ? 'loss' : 'break-even'} result`);
        overlay.innerHTML = `<div class="victory-card" role="status"><span class="victory-kicker">${escape(result.kind)} · Hand complete</span><h2>${loss ? 'Not this hand' : 'Even this hand'}</h2><p class="victory-name">${loss ? `You lost ${escape(Math.abs(result.net).toLocaleString())} play chips.` : 'You broke even. Your chips are returned.'}</p><p class="victory-reason">${escape(result.reason)}</p><button type="button" class="victory-dismiss">Back to table <span aria-hidden="true">→</span></button></div>`;
        overlay.querySelector('button').addEventListener('click', clear);
        root.document.body.append(overlay);
        timer = root.setTimeout(clear, CELEBRATION_MS);
        return;
      }
      const mine = result.viewerId === result.winnerId;
      const palette = ['#ffda88', '#ab9af5', '#8de0c2', '#f79db3', '#93ccf0'];
      const confetti = Array.from({ length: 64 }, (_, index) => `<i style="left:${(index * 37) % 101}%;--party-color:${palette[index % palette.length]};--party-drift:${(index * 43) % 220 - 110}px;--party-delay:${index % 10 * 80}ms;--party-time:${2400 + index % 7 * 140}ms;"></i>`).join('');
      const person = result.winner || {};
      const avatar = root.TeamBuilderCharacter && person.character
        ? root.TeamBuilderCharacter.render({ ...person.character, hands: 'wave', mouth: 'grin', background: 'none' }, person.avatar || '')
        : root.TeamBuilderCommunityPlazaCore ? root.TeamBuilderCommunityPlazaCore.avatar(root.TeamBuilderCommunityPlazaCore.seedFor(result.key, result.winnerId), person.avatar || '🏆') : '<span class="victory-fallback" aria-hidden="true">♛</span>';
      overlay.innerHTML = `<div class="victory-confetti" aria-hidden="true">${confetti}</div><div class="victory-card"><span class="victory-kicker">${escape(result.kind)} · ${result.outcome ? 'Hand' : 'Match'} complete</span><div class="victory-podium" aria-hidden="true"><span class="victory-star victory-star-one">✦</span><span class="victory-star victory-star-two">✧</span><div class="victory-avatar">${avatar}</div><span class="victory-trophy">🏆</span></div><h2>${mine ? 'Victory!' : 'What a finish!'}</h2><p class="victory-name">${escape(result.winnerName)}${mine ? ', you did it!' : ' takes the win!'}</p><p class="victory-reason">${escape(result.reason || 'A brilliant finish. Well played!')}</p><button type="button" class="victory-dismiss">Back to ${result.outcome ? 'table' : 'board'} <span aria-hidden="true">→</span></button><div class="victory-lifetime" aria-hidden="true"></div></div>`;
      overlay.querySelector('button').addEventListener('click', clear);
      root.document.body.append(overlay);
      timer = root.setTimeout(clear, CELEBRATION_MS);
    }
    root.document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay) { event.preventDefault(); clear(); } });
    return {
      beginFrame() { frameKey = ''; },
      observe(result) {
        frameKey = result.key;
        if (!track(result)) return;
        const delay = Math.max(0, Math.min(5000, Number(result.delayMs) || 0));
        if (!delay) { show(result); return; }
        clear(); pendingKey = result.key;
        pendingTimer = root.setTimeout(() => { if (frameKey === result.key && pendingKey === result.key) show(result); }, delay);
      },
      endFrame() { if ((overlay && overlayKey !== frameKey) || (pendingKey && pendingKey !== frameKey)) clear(); },
      clear
    };
  }
  const api = { CELEBRATION_MS, createWinTracker, banner };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderGameVictory = { ...api, ...createController() };
})(typeof window === 'undefined' ? globalThis : window);
