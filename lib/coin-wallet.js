const fs = require('node:fs');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const REWARDS = Object.freeze({ checkers: 30, 'chinese-checkers': 30, memory: 20, spades: 75, 'connect-4': 20, 'survey-clash': 30 });
const check = (ok, message) => { if (!ok) throw new Error(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function credentials(id, token) { check(typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id) && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'Wallet credentials are required.'); }
function amount(value) { check(Number.isSafeInteger(value) && value > 0 && value <= 1000000000, 'Enter a positive whole amount up to 1,000,000,000.'); return value; }
function receipt(account, entry) { account.history.push({ ...entry, at: Date.now() }); account.history = account.history.slice(-100); }
function view(account) { return { points: account.points, coins: account.coins, history: structuredClone(account.history).reverse(), rewards: REWARDS, rate: 1 }; }
function createCoinWalletStore({ database, databaseRequired, dataDir }) {
  let current, tail = Promise.resolve();
  const file = path.join(dataDir, 'coin-wallets.json');
  async function load() {
    if (current) return current;
    const db = database(); check(!databaseRequired || db, 'Wallet database is unavailable.');
    if (db) current = await db.load('private_coin_wallets');
    else { try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    current ||= { accounts: {}, awards: {}, tables: {} }; return current;
  }
  async function write(next) {
    const db = database(); check(!databaseRequired || db, 'Wallet database is unavailable.');
    if (db) await db.save('private_coin_wallets', next);
    else { fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 }); fs.writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); }
    current = next;
  }
  function transact(fn) {
    const work = tail.catch(() => {}).then(async () => { const next = structuredClone(await load()); const result = fn(next); await write(next); return result; });
    tail = work; return work;
  }
  function accountIn(state, id, token, create = false) {
    credentials(id, token);
    if (!Object.hasOwn(state.accounts, id)) { check(create, 'Wallet not found.'); state.accounts[id] = { secret: hash(token), points: 0, coins: 0, history: [], actions: {} }; }
    const a = state.accounts[id]; check(safeEqual(a.secret, hash(token)), 'Wallet access denied.'); return a;
  }
  function once(a, actionId, signature, fn) {
    check(typeof actionId === 'string' && /^[a-zA-Z0-9_-]{16,128}$/.test(actionId), 'An action identifier is required.');
    if (Object.hasOwn(a.actions, actionId)) { check(a.actions[actionId] === signature, 'This action identifier was already used.'); return; }
    fn(); a.actions[actionId] = signature;
  }
  return {
    transact,
    async open(id, token) { return transact(s => view(accountIn(s, id, token, true))); },
    async get(id, token) { await tail.catch(() => {}); return view(accountIn(await load(), id, token)); },
    async exchange(id, token, value, actionId) { return transact(s => { const a = accountIn(s, id, token); amount(value); once(a, actionId, `exchange:${value}`, () => { check(a.points >= value, 'Not enough reward points.'); check(a.coins + value <= Number.MAX_SAFE_INTEGER, 'Wallet balance limit reached.'); a.points -= value; a.coins += value; receipt(a, { kind: 'exchange', points: -value, coins: value, label: 'Points exchanged for coins' }); }); return view(a); }); },
    async award(id, awardKey, value, label) { return transact(s => { check(Number.isInteger(value) && value >= 1 && value <= 99, 'Invalid reward.'); if (Object.hasOwn(s.awards, awardKey)) return false; check(Object.hasOwn(s.accounts, id), 'Wallet not found.'); const a = s.accounts[id]; check(Number.isSafeInteger(a.points + value), 'Wallet balance limit reached.'); a.points += value; s.awards[awardKey] = { walletId: id, value }; receipt(a, { kind: 'win', awardKey, points: value, coins: 0, label }); return true; }); },
    async listTables() { await tail.catch(() => {}); return Object.entries((await load()).tables).map(([key, g]) => ({ key, id: g.id, type: g.type })); },
    async replay(id, token, actionId, signature) { await tail.catch(() => {}); const a = accountIn(await load(), id, token); if (!Object.hasOwn(a.actions, actionId || '')) return false; check(a.actions[actionId] === signature, 'This action identifier was already used.'); return true; },
    async loadTable(key) { await tail.catch(() => {}); return structuredClone((await load()).tables[key] || null); },
    async saveTable(key, game) { return transact(s => { s.tables[key] = structuredClone(game); }); },
    async transfer({ id, token, key, tableId, playerId, value, direction, actionId, game }) {
      return transact(s => {
        const a = accountIn(s, id, token);
        if (direction === 'return') check(Number.isSafeInteger(value) && value >= 0, 'Invalid chip return.'); else amount(value);
        let result;
        once(a, actionId, `${direction}:${key}:${tableId}:${playerId}:${value}`, () => {
          const g = structuredClone(s.tables[key]);
          check(g?.id === tableId && g.coinMode, 'The coin table changed.');
          check(g.phase !== 'playing', 'Transfer chips between hands.');
          check(direction === 'buy-in' || direction === 'return', 'Invalid transfer.');
          if (direction === 'buy-in') {
            check(a.coins >= value, 'Not enough coins. Win games and exchange reward points first.');
            const old = g.players.find(p => p.id === playerId);
            check(!old || g.walletOwners?.[playerId] === id, 'These chips belong to another wallet.');
            const next = game(g); const p = next.players.find(p => p.id === playerId);
            check(p && p.stack + value <= 1000000000, 'Table chip limit reached.');
            p.stack += value; p.buyIn += value; next.walletOwners = { ...next.walletOwners, [playerId]: id };
            next.chipBalances = { ...next.chipBalances, [playerId]: { name: p.name, stack: p.stack, buyIn: p.buyIn } };
            a.coins -= value; s.tables[key] = next; result = next;
          } else {
            const p = g.players.find(p => p.id === playerId);
            check(p && g.walletOwners?.[playerId] === id && value === p.stack, 'Return your entire uncommitted stack between hands.');
            check(Number.isSafeInteger(a.coins + value), 'Wallet balance limit reached.');
            g.players = g.players.filter(p => p.id !== playerId); delete g.chipBalances[playerId]; delete g.walletOwners[playerId]; g.version++;
            a.coins += value; s.tables[key] = g; result = g;
          }
          receipt(a, { kind: direction, points: 0, coins: direction === 'buy-in' ? -value : value, label: direction === 'buy-in' ? 'Table buy-in' : 'Chips returned to wallet' });
        });
        return { wallet: view(a), game: result || structuredClone(s.tables[key]) };
      });
    },
    async releaseSeat(key, tableId, playerId) { return transact(s => {
      const g = s.tables[key]; check(g?.id === tableId && g.phase !== 'playing', 'Return chips between hands.');
      const p = g.players.find(p => p.id === playerId), owner = g.walletOwners?.[playerId];
      if (!p || !owner) return structuredClone(g);
      const a = s.accounts[owner]; check(a && Number.isSafeInteger(a.coins + p.stack), 'Wallet unavailable.');
      a.coins += p.stack; receipt(a, { kind: 'return', points: 0, coins: p.stack, label: 'Reserved seat released · chips returned' });
      g.players = g.players.filter(p => p.id !== playerId); delete g.chipBalances[playerId]; delete g.walletOwners[playerId]; g.version++;
      return structuredClone(g);
    }); },
    async closeTable(key, tableId) { return transact(s => {
      const g = s.tables[key]; if (!g || g.id !== tableId) return;
      for (const p of g.players) {
        const owner = g.walletOwners?.[p.id]; if (!owner || !Object.hasOwn(s.accounts, owner)) continue;
        // An interrupted hand is voided; return both stack and committed chips.
        const value = p.stack + (g.phase === 'playing' ? p.total : 0), a = s.accounts[owner];
        check(Number.isSafeInteger(a.coins + value), 'Wallet balance limit reached.'); a.coins += value;
        receipt(a, { kind: 'return', points: 0, coins: value, label: g.phase === 'playing' ? 'Unfinished table closed · chips refunded' : 'Table closed · chips returned' });
      }
      delete s.tables[key];
    }); }
  };
}
function winningRewards(room) {
  const g = room.activityState;
  if (!g?.rewardStartedAt || g.phase !== 'finished') return [];
  const activity = room.currentActivity;
  let winners = [], matchId = g.id || g.startedAt, value = REWARDS[activity];
  if (activity === 'spades') { winners = g.players.filter(p => !p.isHouse && p.position % 2 === g.winnerTeam).map(p => p.id); matchId = g.matchId; value = g.rewardPoints; }
  else if (activity === 'connect-4' && ['red', 'yellow'].includes(g.winner)) winners = [g.players[g.winner]?.playerId];
  else if (activity === 'survey-clash' && g.finished && g.scores[0] !== g.scores[1]) {
    const team = g.scores[0] > g.scores[1] ? 0 : 1;
    if (Object.values(g.teams).includes(0) && Object.values(g.teams).includes(1)) winners = Object.keys(g.teams).filter(id => g.teams[id] === team);
  }
  else if (activity === 'checkers' && g.winner) winners = [g.players[g.winner]?.playerId];
  else if (activity === 'chinese-checkers' && g.winner) winners = [g.winner];
  else if (activity === 'memory' && g.winnerIds?.length === 1 && g.players.length > 1) winners = g.winnerIds;
  return value ? winners.filter(id => id && !id.startsWith('computer-')).map(playerId => ({ playerId, value, key: `${activity}:${matchId}:${playerId}`, label: `${activity === 'spades' ? 'Spades match' : activity === 'connect-4' ? 'Connect 4' : activity === 'survey-clash' ? 'Family Face-Off' : activity} win` })) : [];
}
module.exports = { createCoinWalletStore, winningRewards, REWARDS };
