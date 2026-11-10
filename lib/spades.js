const { randomInt, randomUUID } = require('node:crypto');
const TURN_MS = 60000, REVIEW_MS = 1800;
const check = (ok, message) => { if (!ok) throw new Error(message); };
const seat = (g, id) => g.players.find(p => p.id === id);
const at = (g, index) => g.players.find(p => p.position === index);
const active = g => ['bidding', 'playing', 'review'].includes(g.phase);
function create(options = {}) {
  return { type: 'spades', id: randomUUID(), matchId: randomUUID(), handId: '', version: 0, phase: 'waiting', target: 500, players: [], dealerPosition: randomInt(4), turnId: '', handNumber: 0, trick: [], lastTrick: [], history: [], scores: [0, 0], bags: [0, 0], broken: false, trickNumber: 0, paused: false, deadline: 0, actionIds: {}, actorHashes: {}, chipBalances: options.chipBalances || {}, rewardPoints: 75, startedAt: 0, rewardStartedAt: Date.now(), message: 'Take a seat. Partners sit opposite each other.' };
}
function turn(g, position, now) { g.turnId = at(g, position)?.id || ''; g.turnStartedAt = now; g.deadline = now + TURN_MS; }
function legalCards(g, p) {
  if (!p || g.phase !== 'playing' || g.turnId !== p.id || g.paused) return [];
  const led = g.trick[0]?.card.suit;
  const follow = led && p.hand.some(c => c.suit === led);
  return p.hand.filter(c => follow ? c.suit === led : !led && !g.broken && p.hand.some(c => c.suit !== 'S') ? c.suit !== 'S' : true);
}
function trickWinner(trick) {
  const lead = trick[0].card.suit;
  return trick.reduce((best, play) => {
    const power = c => (c.suit === 'S' ? 100 : c.suit === lead ? 50 : 0) + c.rank;
    return power(play.card) > power(best.card) ? play : best;
  }).playerId;
}
function scoreTeam(players, bags = 0) {
  const contract = players.reduce((sum, p) => sum + p.bid, 0);
  const contractTricks = players.filter(p => p.bid > 0).reduce((sum, p) => sum + p.tricks, 0);
  const nilTricks = players.filter(p => p.bid === 0).reduce((sum, p) => sum + p.tricks, 0);
  const extra = Math.max(0, contractTricks - contract) + nilTricks;
  const contractPoints = contractTricks >= contract ? 10 * contract : -10 * contract;
  const nilPoints = players.filter(p => p.bid === 0).reduce((sum, p) => sum + (p.tricks === 0 ? 100 : -100), 0);
  const penalties = Math.floor((bags + extra) / 10) * 100;
  return { contract, tricks: contractTricks, extra, contractPoints, nilPoints, penalties, points: contractPoints + nilPoints + extra - penalties, bags: (bags + extra) % 10 };
}
function finishHand(g, now) {
  const teams = [0, 1].map(team => scoreTeam(g.players.filter(p => p.position % 2 === team), g.bags[team]));
  teams.forEach((r, team) => { g.scores[team] += r.points; g.bags[team] = r.bags; });
  g.history.push({ hand: g.handNumber, teams, scores: [...g.scores], players: g.players.map(p => ({ id: p.id, name: p.name, bid: p.bid, tricks: p.tricks })) });
  g.phase = Math.max(...g.scores) >= g.target && g.scores[0] !== g.scores[1] ? 'finished' : 'hand-complete';
  g.winnerTeam = g.phase === 'finished' ? (g.scores[0] > g.scores[1] ? 0 : 1) : null;
  g.finishedAt = now; g.turnId = ''; g.deadline = 0;
  g.message = g.phase === 'finished' ? `Team ${g.winnerTeam + 1} wins the match!` : 'Hand complete. Review the scores, then deal again.';
}
function advance(g, now) {
  if (g.trickNumber === 13) return finishHand(g, now);
  g.trick = []; g.phase = 'playing'; turn(g, seat(g, g.trickWinner).position, now);
}
function deal(g, now) {
  check(g.players.length === 4, 'Four seats are required. Fill open seats with computers.');
  const deck = [];
  for (const suit of ['C', 'D', 'H', 'S']) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  for (let i = 51; i > 0; i--) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  g.players.forEach(p => { p.hand = []; p.bid = null; p.tricks = 0; });
  for (let i = 0; i < 52; i++) at(g, (g.dealerPosition + 1 + i) % 4).hand.push(deck[i]);
  g.players.forEach(p => p.hand.sort((a, b) => ['C', 'D', 'H', 'S'].indexOf(a.suit) - ['C', 'D', 'H', 'S'].indexOf(b.suit) || b.rank - a.rank));
  g.handNumber++; g.handId = randomUUID(); g.broken = false; g.trick = []; g.lastTrick = []; g.trickNumber = 0; g.phase = 'bidding'; g.startedAt ||= now;
  turn(g, (g.dealerPosition + 1) % 4, now); g.message = 'Bid the number of tricks you expect to win. Nil means zero.';
}
function apply(game, actor, action, data = {}, now = Date.now()) {
  const g = structuredClone(game), p = seat(g, actor.id);
  if (action === 'join') {
    check(!p, 'You already have a seat.');
    const position = Number.isInteger(data.position) ? data.position : [0, 1, 2, 3].find(i => !at(g, i));
    check(position >= 0 && position < 4, 'Choose an open seat.');
    const previous = at(g, position);
    check(!active(g) && (!g.startedAt || previous?.isHouse), 'Join an open seat before the match or replace a computer between hands.');
    check(!previous || previous.isHouse, 'This seat is occupied.');
    g.players = g.players.filter(s => s.position !== position);
    g.players.push({ id: actor.id, name: String(actor.name).slice(0, 32), position, hand: [], bid: null, tricks: 0, awaySince: 0, isHouse: false });
  } else if (action === 'leave') {
    check(p && !g.startedAt, 'Seats are reserved for the match. Start a fresh match to change teams.');
    g.players = g.players.filter(s => s.id !== p.id);
  } else if (action === 'computers') {
    check(actor.isHost && !g.startedAt, 'Fill seats before starting the match.');
    for (let i = 0; i < 4; i++) if (!at(g, i)) g.players.push({ id: `computer-spades-${randomUUID()}`, name: `Computer ${i + 1}`, position: i, hand: [], bid: null, tricks: 0, isHouse: true });
  } else if (action === 'configure') {
    check(actor.isHost && !g.startedAt && [250, 500].includes(data.amount), 'Choose 250 or 500 before the match.');
    g.target = data.amount; g.rewardPoints = data.amount === 250 ? 50 : 75;
  } else if (action === 'deal') {
    check(actor.isHost && ['waiting', 'hand-complete'].includes(g.phase), 'Only the host can deal between hands.');
    if (g.handNumber) g.dealerPosition = (g.dealerPosition + 1) % 4;
    deal(g, now);
  } else if (action === 'new-match') {
    check(actor.isHost && !active(g), 'Start a fresh match between hands.');
    const next = create({ chipBalances: g.chipBalances }); next.version = g.version + 1; return next;
  } else if (action === 'pause' || action === 'resume') {
    check(actor.isHost && active(g), 'Only the host can pause or resume.');
    if (action === 'pause') { check(!g.paused, 'Already paused.'); g.remainingMs = Math.max(0, g.deadline - now); g.paused = true; g.deadline = 0; }
    else { check(g.paused, 'The match is not paused.'); g.paused = false; g.deadline = now + g.remainingMs; g.turnStartedAt = now; }
  } else {
    check(!g.paused && p && g.turnId === p.id, 'Wait for your turn.');
    if (action === 'bid') {
      check(g.phase === 'bidding' && p.bid === null && Number.isInteger(data.amount) && data.amount >= 0 && data.amount <= 13, 'Bid Nil or 1–13 tricks.');
      p.bid = data.amount;
      if (g.players.every(s => s.bid !== null)) { g.phase = 'playing'; turn(g, (g.dealerPosition + 1) % 4, now); g.message = 'Follow suit. Spades are trump.'; }
      else turn(g, (p.position + 1) % 4, now);
    } else if (action === 'play') {
      const c = legalCards(g, p).find(c => c.rank === data.card?.rank && c.suit === data.card?.suit);
      check(c, 'Play a legal card: follow suit, and do not lead unbroken spades.');
      p.hand = p.hand.filter(v => v.rank !== c.rank || v.suit !== c.suit);
      g.trick.push({ playerId: p.id, card: c }); if (c.suit === 'S') g.broken = true;
      if (g.trick.length === 4) {
        g.trickWinner = trickWinner(g.trick); seat(g, g.trickWinner).tricks++; g.trickNumber++; g.lastTrick = structuredClone(g.trick);
        g.phase = 'review'; g.turnId = ''; g.deadline = now + REVIEW_MS; g.message = `${seat(g, g.trickWinner).name} takes trick ${g.trickNumber}.`;
      } else turn(g, (p.position + 1) % 4, now);
    } else throw new Error('Unknown Spades action.');
  }
  g.version++; return g;
}
// The decision function receives only a private view and public information.
function chooseAction(view) {
  if (view.phase === 'bidding') {
    const estimate = view.cards.reduce((n, c) => n + (c.rank === 14 ? 1 : c.rank === 13 ? .6 : c.suit === 'S' && c.rank >= 10 ? .5 : 0), 0);
    return { action: 'bid', amount: Math.max(1, Math.min(13, Math.round(estimate))) };
  }
  const cards = [...view.legal.cards].sort((a, b) => (a.suit === 'S' ? 100 : 0) + a.rank - ((b.suit === 'S' ? 100 : 0) + b.rank));
  if (!cards.length) throw new Error('No legal card.');
  const me = view.table.players.find(p => p.id === view.playerId);
  const partner = view.table.players.find(p => p.position === (me.position + 2) % 4);
  const currentWinner = view.table.trick.length ? trickWinner(view.table.trick) : '';
  const nil = me.bid === 0;
  let chosen = cards[0];
  if (nil) chosen = [...cards].reverse().find(c => view.table.trick.length && trickWinner([...view.table.trick, { playerId: me.id, card: c }]) !== me.id) || chosen;
  else if (currentWinner !== partner?.id) chosen = cards.find(c => !view.table.trick.length || trickWinner([...view.table.trick, { playerId: me.id, card: c }]) === me.id) || chosen;
  return { action: 'play', card: chosen };
}
function expire(game, now = Date.now()) {
  if (!active(game) || game.paused || now < game.deadline) return game;
  if (game.phase === 'review') { const g = structuredClone(game); advance(g, now); g.version++; return g; }
  const decision = chooseAction(privateView(game, game.turnId));
  const g = apply(game, { id: game.turnId }, decision.action, decision, now); g.message = `Automatic action. ${g.message}`; return g;
}
function publicView(g) {
  const { actorHashes, actionIds, chipBalances, ...rest } = g;
  return { ...structuredClone(rest), players: g.players.map(({ hand, ...p }) => ({ ...p, cardCount: hand.length })) };
}
function privateView(g, id) { const p = seat(g, id); return { playerId: id, tableId: g.id, handId: g.handId, version: g.version, phase: g.phase, cards: structuredClone(p?.hand || []), legal: { cards: structuredClone(legalCards(g, p)) }, table: publicView(g) }; }
module.exports = { create, apply, publicView, privateView, active, expire, seat, legalCards, trickWinner, scoreTeam, chooseAction, TURN_MS };
