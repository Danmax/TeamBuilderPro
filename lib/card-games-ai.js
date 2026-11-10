const { randomInt } = require('node:crypto');
const Cards = require('./card-games');
const HOUSE_THINK_MS = 1200;
// Only the same private hand and public information available to a human enter here.
function chooseAction({ type, cards, board = [], legal, pot = 0, stack = 0 }, random = () => randomInt(1000000) / 1000000) {
  if (legal.draw) {
    const rank = Cards.rankFive(cards);
    if (rank[0] >= 4) return { action: 'draw', indices: [] };
    const counts = new Map(); cards.forEach(c => counts.set(c.rank, (counts.get(c.rank) || 0) + 1));
    if (rank[0] >= 1) return { action: 'draw', indices: cards.map((c, i) => counts.get(c.rank) === 1 ? i : -1).filter(i => i >= 0) };
    const suits = new Map(); cards.forEach(c => suits.set(c.suit, (suits.get(c.suit) || 0) + 1));
    const flushSuit = [...suits].find(([, count]) => count === 4)?.[0];
    return { action: 'draw', indices: cards.map((c, i) => flushSuit ? c.suit !== flushSuit ? i : -1 : c.rank < 13 ? i : -1).filter(i => i >= 0) };
  }
  let strength;
  if (cards.length + board.length >= 5) strength = Cards.bestHand([...cards, ...board])[0] / 8;
  else {
    const [a, b] = cards;
    strength = a.rank === b.rank ? .45 + a.rank / 30 : Math.max(a.rank, b.rank) / 40 + (a.suit === b.suit ? .1 : 0);
  }
  const call = legal.call || 0;
  if (call && strength < .24 && call > Math.max(pot * .35, stack * .15) && random() < .65) return { action: 'fold' };
  if (legal.raise && random() < .12 + strength * .35) {
    const desired = Math.max(legal.minRaiseTo, legal.currentBet + Math.floor(pot * (.3 + strength * .5)));
    return { action: 'raise', amount: Math.min(legal.maxRaiseTo, desired) };
  }
  if (legal.check) return { action: 'check' };
  if (call) return { action: 'call' };
  return { action: 'fold' };
}
module.exports = { HOUSE_THINK_MS, chooseAction };
