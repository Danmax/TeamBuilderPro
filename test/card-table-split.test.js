const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Cards = require('../lib/card-games');

function fixture() {
  const actor = { id: 'a', name: 'A', isHost: true }, card = rank => ({ rank, suit: 'S' });
  let game = Cards.apply(Cards.create('blackjack'), actor, 'join', {}, 1000);
  Object.assign(game, { phase: 'playing', handId: 'hand', handPlayers: ['a'], pending: ['a'], turnId: 'a', deadline: Date.now() + 60000, pot: 20, dealer: [card(10),card(7)], deck: [card(10),card(9),card(10)] });
  Object.assign(game.players[0], { hand: [card(8),card(8)], total: 20, bet: 20, stack: 980 });
  const activities = {}, actions = {}, calls = [], victories = [];
  const room = () => ({ code: 'SPLIT1', host: 'A', revision: game.version, currentActivity: 'blackjack', participants: [{ id:'a', name:'A' }], activityState: Cards.publicView(game) });
  const context = { APP: { roomCode: 'SPLIT1', player: { id:'a', name:'A' }, room: room() },
    document: { addEventListener() {}, querySelector() {} }, setInterval() {}, render() {},
    escapeHtml: value => String(value ?? ''), normalizeRoom: value => value,
    getSharedActorPayload: () => ({}), createRoomActorToken: () => 'action-1234567890', showError: message => { throw Error(message); },
    TEAM_BUILDER_ACTIVITY_REGISTRY: { registerActivity: (key, value) => { activities[key] = value; }, registerAction: (key, value) => { actions[key] = value; } },
    TeamBuilderGameVictory: { observe: value => victories.push(value) },
    socketEmitAck: async (event, payload) => {
      calls.push({ event, ...payload });
      if (event === 'cards:action') game = Cards.apply(game, actor, payload.action);
      return { value: JSON.stringify(room()), private: Cards.privateView(game,'a') };
    }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/activities/card-tables'), 'utf8'),context);
  return { actions, calls, victories, render: () => activities.blackjack.render(), game: () => game };
}

test('21 controls submit split, mark each active hand and show separate results', async () => {
  const f = fixture(); f.render(); await new Promise(resolve => setImmediate(resolve));
  assert.match(f.render(), /data-action="cards-split"\s*>Split · 20 more/);
  await f.actions['cards-split']();
  let markup = f.render();
  assert.match(markup, /Your split hands/); assert.match(markup, /Hand 1 · 18/); assert.match(markup, /Hand 2 · 17/);
  assert.equal((markup.match(/aria-current="true"/g) || []).length,1);
  assert.match(markup, /Double · 20 more/); assert.doesNotMatch(markup, /Double · 40 more|undefined|NaN/);
  assert.equal(f.calls.find(call => call.action === 'split').tableId,f.game().id);
  await f.actions['cards-stand']();
  markup=f.render(); assert.match(markup, /Hand 2 · 17/);
  await f.actions['cards-hit']();
  markup=f.render();
  assert.match(markup, /A · Hand 1/); assert.match(markup, /A · Hand 2/);
  assert.match(markup, /Win · \+20/); assert.match(markup, /Bust · -20/);
  assert.equal(f.victories.at(-1).winnerId,undefined, 'one winning hand does not celebrate a player with no net win');
});
