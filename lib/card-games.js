const { randomInt, randomUUID } = require('node:crypto');
const TYPES = Object.freeze(Object.assign(Object.create(null), { blackjack: { label: '21 / Blackjack', max: 6, min: 1 }, 'five-card-draw': { label: 'Five-Card Draw', max: 5, min: 2 }, 'texas-holdem': { label: 'Texas Hold’em', max: 8, min: 2 } }));
const TURN_MS = 60000, AWAY_MS = 60000;
const clone = value => structuredClone(value);
function check(condition, message) { if (!condition) throw new Error(message); }
function deck() {
  const cards = [];
  for (const suit of ['S', 'H', 'D', 'C']) for (let rank = 2; rank <= 14; rank++) cards.push({ rank, suit });
  for (let i = cards.length - 1; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}
function compare(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const delta = (a[i] || 0) - (b[i] || 0); if (delta) return Math.sign(delta); } return 0; }
function rankFive(cards) {
  check(cards.length === 5, 'Five cards required.');
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const counts = new Map(); ranks.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const straight = counts.size === 5 && (ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join(',') === '14,5,4,3,2' ? 5 : 0);
  if (straight && flush) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(g => g[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...groups.slice(0, 2).map(g => g[0]).sort((a, b) => b - a), groups[2][0]];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(g => g[0])];
  return [0, ...ranks];
}
function bestHand(cards) {
  check(cards.length >= 5 && cards.length <= 7, 'Five to seven cards required.');
  let best = null;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
    const hand = rankFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compare(hand, best) > 0) best = hand;
  }
  return best;
}
const HAND_NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
function blackjackValue(cards) { let total = 0, aces = 0; for (const card of cards) { if (card.rank === 14) { total += 11; aces++; } else total += Math.min(10, card.rank); } while (total > 21 && aces--) total -= 10; return total; }
function create(type, options = {}) {
  check(TYPES[type], 'Unknown card game.');
  return { id: options.id || randomUUID(), type, version: 0, handId: '', handNumber: 0, phase: 'waiting', settledAt: 0, street: '', players: [], handPlayers: [], dealerId: '', dealer: [], board: [], deck: [], discards: [], shown: {}, pot: 0, lastPot: 0, currentBet: 0, lastFullRaise: 20, bigBlind: 20, smallBlind: 10, pending: [], reopenAt: {}, turnId: '', deadline: 0, paused: false, remainingMs: 0, results: [], message: 'Take a seat to play. Each player starts with 1,000 play chips.', actionIds: {}, actorHashes: {} };
}
function seat(g, id) { return g.players.find(p => p.id === id); }
function live(g) { return g.handPlayers.map(id => seat(g, id)).filter(p => p && !p.folded); }
function active(g) { return g.phase === 'playing'; }
function clockwise(g, after, ids = g.handPlayers) {
  const all = g.players.map(p => p.id), start = all.indexOf(after);
  return [...all.slice(start + 1), ...all.slice(0, start + 1)].filter(id => ids.includes(id));
}
function setTurn(g, now) { g.turnId = g.pending[0] || ''; g.turnStartedAt = now; g.deadline = g.turnId ? now + TURN_MS : 0; }
function pay(g, p, amount) { amount = Math.min(p.stack, amount); check(Number.isSafeInteger(amount) && amount >= 0, 'Invalid chip amount.'); p.stack -= amount; p.bet += amount; p.total += amount; g.pot += amount; p.allIn = p.stack === 0; return amount; }
function sweep(g, now) { if (!active(g)) g.players = g.players.filter(p => !p.awaySince || now - p.awaySince < AWAY_MS); }
function clearHand(g) {
  for (const p of g.players) { p.hand = []; p.bet = 0; p.total = 0; p.folded = false; p.allIn = false; p.status = ''; }
  g.deck = deck(); g.discards = []; g.board = []; g.dealer = []; g.shown = {}; g.results = []; g.settledAt = 0; g.pot = 0; g.lastPot = 0; g.currentBet = 0; g.lastFullRaise = g.bigBlind; g.reopenAt = {}; g.paused = false; g.remainingMs = 0;
}
function deal(g, id, count) { const p = seat(g, id); for (let i = 0; i < count; i++) { check(g.deck.length, 'Deck exhausted.'); p.hand.push(g.deck.pop()); } }
function start(g, now) {
  check(!active(g), 'Finish this hand first.'); sweep(g, now);
  const eligible = g.players.filter(p => !p.awaySince && p.stack > 0 && (g.type !== 'blackjack' || p.stack >= p.nextBet));
  check(eligible.length >= TYPES[g.type].min, `Need ${TYPES[g.type].min} seated player${TYPES[g.type].min > 1 ? 's' : ''} with enough chips.`);
  const previousDealer = g.dealerId;
  clearHand(g); g.handNumber++; g.handId = randomUUID(); g.phase = 'playing'; g.handPlayers = eligible.map(p => p.id);
  g.dealerId = previousDealer ? clockwise(g, previousDealer)[0] : g.handPlayers[0];
  if (g.type === 'blackjack') {
    g.street = 'players';
    for (const p of eligible) pay(g, p, p.nextBet);
    for (let pass = 0; pass < 2; pass++) { for (const p of eligible) deal(g, p.id, 1); g.dealer.push(g.deck.pop()); }
    for (const p of eligible) if (blackjackValue(p.hand) === 21) p.status = 'blackjack';
    g.pending = eligible.filter(p => !p.status).map(p => p.id);
    if (blackjackValue(g.dealer) === 21 || !g.pending.length) return finishBlackjack(g);
  } else {
    g.street = 'preflop';
    const count = g.type === 'five-card-draw' ? 5 : 2;
    for (let pass = 0; pass < count; pass++) for (const id of clockwise(g, g.dealerId)) deal(g, id, 1);
    const sb = eligible.length === 2 ? g.dealerId : clockwise(g, g.dealerId)[0];
    const bb = clockwise(g, sb)[0];
    pay(g, seat(g, sb), g.smallBlind); pay(g, seat(g, bb), g.bigBlind);
    // A short blind does not reduce the full opening amount owed by other players.
    g.currentBet = g.bigBlind;
    g.pending = clockwise(g, bb).filter(id => !seat(g, id).allIn);
    progressPoker(g, now);
  }
  if (active(g)) setTurn(g, now);
  g.message = g.type === 'blackjack' ? 'Cards dealt. Beat the dealer without going over 21.' : 'Cards dealt. Blinds posted; betting is open.';
}
function finishBlackjack(g) {
  const players = live(g), dealerNatural = g.dealer.length === 2 && blackjackValue(g.dealer) === 21;
  if (!dealerNatural && players.some(p => p.status !== 'bust' && p.status !== 'blackjack')) while (blackjackValue(g.dealer) < 17) g.dealer.push(g.deck.pop());
  const dealerValue = blackjackValue(g.dealer); g.lastPot = g.pot;
  g.results = players.map(p => {
    const bet = p.total, natural = p.hand.length === 2 && blackjackValue(p.hand) === 21;
    let payout = 0, label;
    if (blackjackValue(p.hand) > 21) label = 'Bust';
    else if (dealerNatural) { payout = natural ? bet : 0; label = natural ? 'Push' : 'Dealer blackjack'; }
    else if (natural) { payout = bet * 2.5; label = 'Blackjack'; }
    else if (dealerValue > 21 || blackjackValue(p.hand) > dealerValue) { payout = bet * 2; label = 'Win'; }
    else if (blackjackValue(p.hand) === dealerValue) { payout = bet; label = 'Push'; }
    else label = 'Dealer wins';
    p.stack += payout; p.status = label; g.shown = { ...g.shown, [p.id]: clone(p.hand) };
    return { playerId: p.id, name: p.name, amount: payout, net: payout - bet, label };
  });
  g.phase = 'settled'; g.settledAt = Date.now(); g.pot = 0; g.pending = []; g.turnId = ''; g.deadline = 0;
  g.message = `Dealer has ${dealerValue}${dealerValue > 21 ? ' — bust!' : '.'} Review results, then deal the next hand.`;
}
function refundUncalled(g) {
  const contributions = g.handPlayers.map(id => seat(g, id)).sort((a, b) => b.total - a.total);
  if (contributions.length < 2 || contributions[0].total === contributions[1].total) return;
  const top = contributions[0], refund = top.total - contributions[1].total;
  top.total -= refund; top.bet = Math.max(0, top.bet - refund); top.stack += refund; g.pot -= refund;
}
function sidePots(players) {
  const levels = [...new Set(players.map(p => p.total).filter(n => n > 0))].sort((a, b) => a - b);
  let previous = 0;
  return levels.map(level => {
    const contributors = players.filter(p => p.total >= level);
    const pot = { amount: (level - previous) * contributors.length, eligible: contributors.filter(p => !p.folded).map(p => p.id) };
    previous = level; return pot;
  });
}
function finishPoker(g, byFold = false) {
  refundUncalled(g); g.lastPot = g.pot;
  const remaining = live(g), awards = new Map(), labels = new Map();
  for (const p of remaining) {
    g.shown = { ...g.shown, [p.id]: clone(p.hand) };
    labels.set(p.id, byFold ? 'Everyone else folded' : HAND_NAMES[bestHand([...p.hand, ...g.board])[0]]);
  }
  for (const pot of sidePots(g.handPlayers.map(id => seat(g, id)))) {
    check(pot.eligible.length, 'Pot has no eligible player.');
    let winners;
    if (pot.eligible.length === 1) winners = pot.eligible;
    else {
      const ranks = pot.eligible.map(id => [id, bestHand([...seat(g, id).hand, ...g.board])]);
      const best = ranks.reduce((a, b) => compare(a[1], b[1]) >= 0 ? a : b)[1];
      winners = ranks.filter(([, rank]) => compare(rank, best) === 0).map(([id]) => id);
    }
    const order = clockwise(g, g.dealerId, winners), each = Math.floor(pot.amount / winners.length); let odd = pot.amount % winners.length;
    for (const id of order) awards.set(id, (awards.get(id) || 0) + each + (odd-- > 0 ? 1 : 0));
  }
  g.results = [...awards].map(([id, amount]) => { const p = seat(g, id); p.stack += amount; return { playerId: id, name: p.name, amount, net: amount - p.total, label: labels.get(id) || 'Pot awarded' }; });
  g.phase = 'settled'; g.settledAt = Date.now(); g.street = 'showdown'; g.pot = 0; g.pending = []; g.turnId = ''; g.deadline = 0;
  g.message = g.results.map(r => `${r.name} wins ${r.amount} (${r.label})`).join(' · ');
}
function beginStreet(g, street, now) {
  g.street = street; g.currentBet = 0; g.lastFullRaise = g.bigBlind; g.reopenAt = {};
  for (const id of g.handPlayers) seat(g, id).bet = 0;
  g.pending = clockwise(g, g.dealerId).filter(id => !seat(g, id).folded && (street === 'draw' || !seat(g, id).allIn));
  setTurn(g, now);
}
function nextStreet(g, now) {
  if (g.type === 'five-card-draw') {
    if (g.street === 'preflop') return beginStreet(g, 'draw', now);
    if (g.street === 'draw') return beginStreet(g, 'postdraw', now);
    return finishPoker(g);
  }
  const next = { preflop: 'flop', flop: 'turn', turn: 'river' }[g.street];
  if (!next) return finishPoker(g);
  g.discards.push(g.deck.pop());
  for (let i = 0; i < (next === 'flop' ? 3 : 1); i++) g.board.push(g.deck.pop());
  beginStreet(g, next, now);
}
function progressPoker(g, now) {
  if (live(g).length === 1) return finishPoker(g, true);
  for (let guard = 0; guard < 6 && active(g); guard++) {
    const alive = live(g), actors = alive.filter(p => !p.allIn);
    g.pending = g.pending.filter(id => !seat(g, id).folded && (g.street === 'draw' || !seat(g, id).allIn));
    if (g.street !== 'draw' && actors.length <= 1) g.pending = g.pending.filter(id => seat(g, id).bet < g.currentBet);
    if (g.pending.length) { setTurn(g, now); return; }
    nextStreet(g, now);
  }
}
function pokerAction(g, p, action, data, now) {
  if (g.street === 'draw') {
    check(action === 'draw', 'Choose which cards to replace.');
    const indices = data.indices || [];
    check(Array.isArray(indices) && indices.length <= 5 && new Set(indices).size === indices.length && indices.every(i => Number.isInteger(i) && i >= 0 && i < 5), 'Choose up to five different cards.');
    for (const index of indices) { g.discards.push(p.hand[index]); check(g.deck.length, 'Deck exhausted.'); p.hand[index] = g.deck.pop(); }
    g.message = `${p.name} replaced ${indices.length} card${indices.length === 1 ? '' : 's'}.`;
  } else {
    const owed = Math.max(0, g.currentBet - p.bet);
    if (action === 'fold') { p.folded = true; p.status = 'Folded'; }
    else if (action === 'check') check(owed === 0, `Call ${owed} or fold.`);
    else if (action === 'call') { check(owed > 0, 'Nothing to call.'); pay(g, p, owed); }
    else if (action === 'raise') {
      const amount = data.amount, max = p.bet + p.stack;
      check(Number.isSafeInteger(amount) && amount > g.currentBet && amount <= max, 'Enter a valid total bet amount.');
      check(live(g).some(other => other.id !== p.id && !other.allIn), 'No opponent can call a raise.');
      check(!Object.hasOwn(g.reopenAt, p.id) || g.currentBet >= g.reopenAt[p.id], 'A short all-in did not reopen raising for you.');
      const increment = amount - g.currentBet;
      check(increment >= g.lastFullRaise || amount === max, `Minimum raise is to ${g.currentBet + g.lastFullRaise}.`);
      pay(g, p, amount - p.bet); g.currentBet = amount;
      if (increment >= g.lastFullRaise) g.lastFullRaise = increment;
      g.pending = clockwise(g, p.id).filter(id => !seat(g, id).folded && !seat(g, id).allIn && seat(g, id).bet < g.currentBet);
    } else throw new Error('Choose check, call, raise, or fold.');
    g.reopenAt = { ...g.reopenAt, [p.id]: g.currentBet + g.lastFullRaise };
    g.message = `${p.name}: ${action}${action === 'raise' ? ` to ${data.amount}` : ''}.`;
  }
  g.pending = g.pending.filter(id => id !== p.id);
  progressPoker(g, now);
}
function blackjackAction(g, p, action) {
  check(['hit', 'stand', 'double'].includes(action), 'Choose hit, stand, or double.');
  if (action === 'double') { check(p.hand.length === 2 && p.stack >= p.total, 'Double needs two cards and enough chips.'); pay(g, p, p.total); }
  if (action !== 'stand') deal(g, p.id, 1);
  const total = blackjackValue(p.hand);
  if (total > 21) p.status = 'bust';
  else if (action !== 'hit' || total === 21) p.status = 'stand';
  g.message = `${p.name}: ${action}${total > 21 ? ' — bust' : ''}.`;
  if (p.status) g.pending = g.pending.filter(id => id !== p.id);
  if (!g.pending.length) finishBlackjack(g);
}
function apply(game, actor, action, data = {}, now = Date.now()) {
  const g = clone(game); sweep(g, now);
  const p = seat(g, actor.id);
  if (action === 'join') {
    check(!p, 'You already have a seat.'); check(g.players.length < TYPES[g.type].max, 'The table is full.');
    g.players.push({ id: actor.id, name: String(actor.name).slice(0, 32), stack: 1000, nextBet: 20, hand: [], bet: 0, total: 0, folded: false, allIn: false, status: '', awaySince: 0, isHouse: false });
    g.message = `${actor.name} took a seat${active(g) ? ' and will join the next hand' : ''}.`;
  } else if (action === 'house') {
    check(actor.isHost && !active(g) && g.type !== 'blackjack', 'Only the host can start house poker between hands.');
    let human = seat(g, actor.id);
    const computer = g.players.find(player => player.isHouse);
    check(g.players.length + (human ? 0 : 1) + (computer ? 0 : 1) <= TYPES[g.type].max, 'Make room for a player and the house.');
    if (!human) {
      human = { id: actor.id, name: String(actor.name).slice(0, 32), stack: 1000, nextBet: 20, hand: [], bet: 0, total: 0, folded: false, allIn: false, status: '', awaySince: 0, isHouse: false };
      g.players.push(human);
    }
    human.awaySince = 0;
    check(human.stack > 0 && (!computer || computer.stack > 0), 'Reset the stacks before playing another house hand.');
    if (!computer) g.players.push({ id: `computer-cards-${randomUUID()}`, name: 'House', stack: 1000, nextBet: 20, hand: [], bet: 0, total: 0, folded: false, allIn: false, status: '', awaySince: 0, isHouse: true });
    start(g, now);
  } else if (action === 'leave') {
    check(p && !active(g), 'Leave your seat between hands.'); g.players = g.players.filter(player => player.id !== actor.id);
  } else if (action === 'bet') {
    check(p && !active(g) && g.type === 'blackjack', 'Set your bet between hands.');
    check(Number.isSafeInteger(data.amount) && data.amount >= 10 && data.amount % 10 === 0 && data.amount <= p.stack, 'Bet in increments of 10, within your stack.');
    p.nextBet = data.amount;
  } else if (action === 'configure') {
    check(actor.isHost && !active(g), 'Change table options between hands.');
    check([20, 50, 100].includes(data.amount), 'Choose a valid blind preset.');
    g.bigBlind = data.amount; g.smallBlind = data.amount / 2; g.lastFullRaise = data.amount;
    g.message = `Blinds set to ${g.smallBlind}/${g.bigBlind}.`;
  } else if (action === 'deal') { check(actor.isHost, 'Only the host can deal.'); start(g, now); }
  else if (action === 'reset') {
    check(actor.isHost && !active(g), 'Only the host can reset stacks between hands.');
    for (const player of g.players) { player.stack = 1000; player.nextBet = 20; player.hand = []; player.bet = 0; player.total = 0; player.status = ''; player.folded = false; player.allIn = false; }
    g.handPlayers = []; g.board = []; g.dealer = []; g.deck = []; g.discards = []; g.pot = 0; g.lastPot = 0; g.turnId = ''; g.deadline = 0;
    g.shown = {}; g.results = []; g.phase = 'waiting'; g.message = 'Stacks reset to 1,000 play chips.';
  } else if (action === 'remove') {
    check(actor.isHost && !active(g), 'Remove an idle seat between hands.');
    const target = seat(g, data.playerId); check(target && (target.awaySince || target.isHouse), 'That seat is not idle.');
    g.players = g.players.filter(player => player.id !== target.id);
  } else if (action === 'pause' || action === 'resume') {
    check(actor.isHost && active(g), 'Only the host can pause a hand.');
    if (action === 'pause') { check(!g.paused, 'Already paused.'); g.remainingMs = Math.max(0, g.deadline - now); g.deadline = 0; g.paused = true; }
    else { check(g.paused, 'Not paused.'); g.deadline = now + g.remainingMs; g.turnStartedAt = now; g.paused = false; }
  } else {
    check(active(g) && !g.paused, g.paused ? 'The hand is paused.' : 'Wait for the next deal.');
    check(p && g.turnId === actor.id, 'It is not your turn.');
    check(!g.deadline || now < g.deadline, 'Your turn expired.');
    if (g.type === 'blackjack') { blackjackAction(g, p, action); if (active(g)) setTurn(g, now); }
    else pokerAction(g, p, action, data, now);
  }
  g.version++; return g;
}
function expire(game, now = Date.now()) {
  if (!active(game) || game.paused || !game.deadline || now < game.deadline) return game;
  const g = clone(game), p = seat(g, g.turnId);
  if (g.type === 'blackjack') { blackjackAction(g, p, 'stand'); if (active(g)) setTurn(g, now); }
  else pokerAction(g, p, g.street === 'draw' ? 'draw' : p.bet >= g.currentBet ? 'check' : 'fold', { indices: [] }, now);
  g.version++; g.message = `Time expired. ${g.message}`; return g;
}
function legal(g, id) {
  const p = seat(g, id);
  if (!p || !active(g) || g.paused || g.turnId !== id) return {};
  if (g.type === 'blackjack') return { hit: true, stand: true, double: p.hand.length === 2 && p.stack >= p.total };
  if (g.street === 'draw') return { draw: true };
  const owed = Math.max(0, g.currentBet - p.bet);
  return { fold: true, check: owed === 0, call: owed > 0 ? Math.min(owed, p.stack) : 0, raise: p.bet + p.stack > g.currentBet && (!Object.hasOwn(g.reopenAt, id) || g.currentBet >= g.reopenAt[id]) && live(g).some(other => other.id !== id && !other.allIn), minRaiseTo: Math.min(g.currentBet + g.lastFullRaise, p.bet + p.stack), maxRaiseTo: p.bet + p.stack, currentBet: g.currentBet, ownBet: p.bet };
}
function publicView(g) {
  return { id: g.id, type: g.type, version: g.version, handId: g.handId, handNumber: g.handNumber, phase: g.phase, settledAt: g.settledAt, street: g.street, paused: g.paused, deadline: g.deadline, remainingMs: g.remainingMs, dealerId: g.dealerId, turnId: g.turnId, pot: g.pot, lastPot: g.lastPot, currentBet: g.currentBet, bigBlind: g.bigBlind, smallBlind: g.smallBlind, message: g.message, results: clone(g.results), board: clone(g.board), dealer: g.type === 'blackjack' ? (g.phase === 'settled' ? clone(g.dealer) : g.dealer.length ? [clone(g.dealer[0]), null] : []) : [], players: g.players.map(p => ({ id: p.id, name: p.name, isHouse: p.isHouse === true, stack: p.stack, nextBet: p.nextBet, bet: p.bet, total: p.total, folded: p.folded, allIn: p.allIn, status: p.status, away: Boolean(p.awaySince), cardCount: p.hand.length, inHand: g.handPlayers.includes(p.id), shownCards: clone(Object.hasOwn(g.shown, p.id) ? g.shown[p.id] : []) })) };
}
function privateView(g, id) { const p = seat(g, id); return { tableId: g.id, handId: g.handId, version: g.version, playerId: id, cards: clone(p?.hand || []), total: g.type === 'blackjack' && p ? blackjackValue(p.hand) : null, legal: legal(g, id) }; }
module.exports = { TYPES, TURN_MS, AWAY_MS, create, apply, expire, publicView, privateView, deck, rankFive, bestHand, compare, blackjackValue, sidePots, seat, active, sweep };
