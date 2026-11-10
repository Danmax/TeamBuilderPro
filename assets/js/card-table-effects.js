(function (root) {
  const DEAL_MS = 480, STAGGER_MS = 75, RESULT_DELAY_MS = 3000;
  function createDealTracker() {
    const zones = new Map();
    return (key, cards, now = Date.now()) => {
      const previous = zones.get(key) || [];
      const next = cards.map((card, index) => {
        const signature = card ? `${card.rank}:${card.suit}` : 'hidden';
        const old = previous[index];
        if (old?.signature === signature) return old;
        return { signature, kind: old?.signature === 'hidden' && card ? 'reveal' : 'deal', start: now + index * STAGGER_MS };
      });
      zones.delete(key); zones.set(key, next);
      if (zones.size > 128) zones.delete(zones.keys().next().value);
      return next.map(effect => now < effect.start + DEAL_MS ? { kind: effect.kind, delay: effect.start - now } : null);
    };
  }
  const api = { DEAL_MS, STAGGER_MS, RESULT_DELAY_MS, createDealTracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderCardEffects = api;
})(typeof window === 'undefined' ? globalThis : window);
