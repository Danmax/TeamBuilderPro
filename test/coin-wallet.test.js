const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createCoinWalletStore, winningRewards } = require('../lib/coin-wallet');
const C = require('../lib/table-games');
function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-test-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const options = { dataDir, database: () => null, databaseRequired: false };
  return { store: createCoinWalletStore(options), options, id: randomUUID(), token: 'a'.repeat(64) };
}
test('wallets authenticate, reward once, exchange once, and survive a new store', async t => {
  const { store, options, id, token } = fixture(t);
  assert.equal((await store.open(id, token)).coins, 0);
  await assert.rejects(store.get(id, 'b'.repeat(64)), /access denied/);
  assert(await store.award(id, 'match:a', 30, 'Checkers win')); assert.equal(await store.award(id, 'match:a', 30, 'Retry'), false);
  await assert.rejects(store.award(id, 'bad', 100, 'Invalid'), /Invalid reward/);
  const key = 'exchange-0000000001';
  assert.equal((await store.exchange(id, token, 20, key)).coins, 20);
  assert.equal((await store.exchange(id, token, 20, key)).coins, 20);
  await assert.rejects(store.exchange(id, token, 21, key), /identifier/);
  await assert.rejects(store.exchange(id, token, 11, 'exchange-0000000002'), /Not enough/);
  const loaded = await createCoinWalletStore(options).get(id, token); assert.equal(loaded.points, 10); assert.equal(loaded.coins, 20);
  assert.equal(fs.statSync(path.join(options.dataDir, 'coin-wallets.json')).mode & 0o777, 0o600);
});
test('atomic buy-ins, zero-stack exits, voided hands and repeated table closure conserve coins', async t => {
  const { store, id, token } = fixture(t); await store.open(id, token); await store.award(id, 'match1', 99, 'Win'); await store.exchange(id, token, 99, 'exchange-0000000001');
  const g = C.create('blackjack'); g.coinMode = true; await store.saveTable('room:COINS1', g);
  const transfer = { id, token, key: 'room:COINS1', tableId: g.id, playerId: 'a', value: 30, direction: 'buy-in', actionId: 'buyin-000000000001', game: current => { const next = C.apply(current, { id: 'a', name: 'A' }, 'join'); next.players[0].stack = 0; next.players[0].buyIn = 0; return next; } };
  let r = await store.transfer(transfer); assert.equal(r.wallet.coins, 69); assert.equal(r.game.players[0].stack, 30);
  assert.equal((await store.transfer(transfer)).wallet.coins, 69);
  r.game.phase = 'playing'; r.game.players[0].stack = 10; r.game.players[0].total = 20; await store.saveTable(transfer.key, r.game);
  await assert.rejects(store.transfer({ ...transfer, direction: 'return', value: 10, actionId: 'return-00000000001' }), /between hands/);
  await store.closeTable(transfer.key, g.id); await store.closeTable(transfer.key, g.id); assert.equal((await store.get(id, token)).coins, 99);
  assert.equal(await store.loadTable(transfer.key), null);
  await store.saveTable(transfer.key, g); r = await store.transfer({ ...transfer, value: 20, actionId: 'buyin-000000000003' });
  const released = await store.releaseSeat(transfer.key, g.id, 'a'); assert.equal(released.players.length, 0);
  await store.releaseSeat(transfer.key, g.id, 'a'); assert.equal((await store.get(id, token)).coins, 99);
  await store.saveTable(transfer.key, g); r = await store.transfer({ ...transfer, actionId: 'buyin-000000000002' }); r.game.players[0].stack = 0; await store.saveTable(transfer.key, r.game);
  const exit = await store.transfer({ ...transfer, direction: 'return', value: 0, actionId: 'return-00000000002' }); assert.equal(exit.game.players.length, 0);
});
test('concurrent exchanges cannot overspend and persistence failure does not credit memory', async t => {
  const { store, id, token } = fixture(t); await store.open(id, token); await store.award(id, 'match1', 30, 'Win');
  const attempts = await Promise.allSettled([store.exchange(id, token, 20, 'exchange-0000000001'), store.exchange(id, token, 20, 'exchange-0000000002')]);
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1); assert.equal((await store.get(id, token)).points, 10);
  let saved, fail = false;
  const db = { load: async () => saved, save: async (_, next) => { if (fail) throw new Error('database unavailable'); saved = structuredClone(next); } };
  const backed = createCoinWalletStore({ database: () => db, databaseRequired: true, dataDir: os.tmpdir() }); await backed.open(id, token); fail = true;
  await assert.rejects(backed.award(id, 'match2', 20, 'Win'), /unavailable/); assert.equal((await backed.get(id, token)).points, 0);
});
test('only supported completed wins produce fixed rewards; no client winner or raw score is accepted', () => {
  const base = { rewardStartedAt: 1, phase: 'finished', id: 'match1' };
  assert.deepEqual(winningRewards({ currentActivity: 'uno', activityState: { ...base, winner: 'A' } }), []);
  assert.equal(winningRewards({ currentActivity: 'memory', activityState: { ...base, winnerIds: ['a'], players: [{ id: 'a' }] } }).length, 0);
  const result = winningRewards({ currentActivity: 'spades', activityState: { ...base, matchId: 'm1', rewardPoints: 50, winnerTeam: 0, players: [{ id: 'a', position: 0 }, { id: 'b', position: 2 }, { id: 'computer-bot', position: 1, isHouse: true }] } });
  assert.equal(result.length, 2); assert(result.every(r => r.value === 50));
  assert.equal(winningRewards({ currentActivity: 'checkers', activityState: { phase: 'finished', winner: 'b' } }).length, 0);
});
