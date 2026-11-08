(function (root) {
  const THEMES = {
    animals: { label: 'Animals', symbols: ['🐶', '🐱', '🦊', '🐻', '🐼', '🐸', '🐵', '🦁', '🐨', '🐷', '🐙', '🦋'] },
    space: { label: 'Space', symbols: ['🚀', '🌍', '🌙', '⭐', '🪐', '☄️', '🛸', '👽', '🛰️', '🌌', '👩‍🚀', '☀️'] },
    food: { label: 'Food', symbols: ['🍎', '🍋', '🍇', '🍓', '🍉', '🥑', '🥕', '🍕', '🍩', '🍪', '🍒', '🌽'] }
  };
  const clone = game => ({ ...game, cards: game.cards.map(card => ({ ...card })), players: game.players.map(player => ({ ...player })), flipped: [...game.flipped] });
  const activeIds = (game, participants) => game.players.map(player => player.id).filter(id => participants.some(player => player.id === id));
  function nextTurn(game, participants) {
    const active = new Set(activeIds(game, participants));
    const start = game.players.findIndex(player => player.id === game.turnId);
    for (let offset = 1; offset <= game.players.length; offset++) {
      const player = game.players[(start + offset + game.players.length) % game.players.length];
      if (active.has(player.id)) return player.id;
    }
    return '';
  }
  function createGame(participants = [], options = {}, random = Math.random) {
    const theme = Object.hasOwn(THEMES, options.theme) ? options.theme : 'animals';
    const pairCount = [6, 8, 12].includes(options.pairCount) ? options.pairCount : 8;
    const deck = Array.from({ length: pairCount }, (_, index) => index).flatMap(value => [value, value]);
    for (let index = deck.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [deck[index], deck[other]] = [deck[other], deck[index]];
    }
    const unique = [...new Map(participants.filter(player => player?.id).map(player => [player.id, player])).values()].slice(0, 100);
    const game = { id: options.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, theme, pairCount, cards: deck.map(() => ({ value: null, matchedBy: '' })), flipped: [], players: unique.map(player => ({ id: player.id, name: String(player.name || 'Player').slice(0, 32), score: 0 })), turnId: unique[0]?.id || '', phase: unique.length ? 'playing' : 'waiting', version: 0, attempts: 0, pairsMatched: 0, hideAt: 0, winnerIds: [] };
    return { game, secret: { gameId: game.id, deck } };
  }
  function normalizeSecret(raw) {
    if (!raw || typeof raw.gameId !== 'string' || !Array.isArray(raw.deck) || ![12, 16, 24].includes(raw.deck.length)) return null;
    const count = raw.deck.length / 2;
    if (!raw.deck.every(value => Number.isInteger(value) && value >= 0 && value < count)) return null;
    if (!Array.from({ length: count }, (_, value) => raw.deck.filter(item => item === value).length === 2).every(Boolean)) return null;
    return { gameId: raw.gameId.slice(0, 100), deck: [...raw.deck] };
  }
  function flip(game, secret, actorId, index, now = Date.now()) {
    if (game.phase !== 'playing') throw new Error('This round is not in progress.');
    if (game.turnId !== actorId) throw new Error('It is not your turn.');
    if (game.flipped.length === 2) throw new Error('Wait for the cards to turn back over.');
    if (!Number.isInteger(index) || index < 0 || index >= game.cards.length || game.cards[index].matchedBy || game.flipped.includes(index)) throw new Error('Choose a face-down card.');
    if (secret?.gameId !== game.id || secret.deck?.length !== game.cards.length) throw new Error('The deck is unavailable. Ask the host to start a new round.');
    const next = clone(game);
    next.version++;
    next.cards[index].value = secret.deck[index];
    next.flipped.push(index);
    if (next.flipped.length === 1) return next;
    next.attempts++;
    const [first, second] = next.flipped;
    if (secret.deck[first] === secret.deck[second]) {
      next.cards[first].matchedBy = actorId; next.cards[second].matchedBy = actorId;
      next.players.find(player => player.id === actorId).score++;
      next.pairsMatched++;
      next.flipped = [];
      if (next.pairsMatched === next.pairCount) {
        next.phase = 'finished';
        const best = Math.max(...next.players.map(player => player.score));
        next.winnerIds = next.players.filter(player => player.score === best).map(player => player.id);
      }
    } else next.hideAt = now + 1400;
    return next;
  }
  function resolveMismatch(game, participants, now = Date.now()) {
    if (game.flipped.length !== 2 || !game.hideAt || now < game.hideAt) return game;
    const next = clone(game);
    next.flipped.forEach(index => { next.cards[index].value = null; });
    next.flipped = []; next.hideAt = 0; next.version++;
    next.turnId = nextTurn(game, participants);
    if (!next.turnId) next.phase = 'waiting';
    return next;
  }
  function reconcilePlayers(game, participants) {
    if (game.phase === 'finished' || game.flipped.length === 2 || participants.some(player => player.id === game.turnId)) return game;
    const next = clone(game);
    next.flipped.forEach(index => { next.cards[index].value = null; });
    next.flipped = []; next.hideAt = 0; next.version++;
    next.turnId = nextTurn(game, participants);
    next.phase = next.turnId ? 'playing' : 'waiting';
    return next;
  }
  function join(game, player) {
    if (game.phase === 'finished') throw new Error('This round has finished. Join the next round.');
    if (game.players.some(item => item.id === player.id)) throw new Error('You are already in this round.');
    if (game.players.length >= 100) throw new Error('This round is full. Join the next round.');
    const next = clone(game);
    next.players.push({ id: player.id, name: String(player.name || 'Player').slice(0, 32), score: 0 });
    next.version++;
    if (!next.turnId) { next.turnId = player.id; next.phase = 'playing'; }
    return next;
  }
  const api = { THEMES, createGame, normalizeSecret, flip, resolveMismatch, reconcilePlayers, join };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderMemory = api;
})(typeof window === 'undefined' ? globalThis : window);
