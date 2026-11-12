const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

test('the game owns one animation loop, restores focus after app renders, and tears down on exit', () => {
  const records = new Map(), frames = new Set(), handlers = [], nodes = new Map();
  let activity, frameId = 0;
  const document = { activeElement: null, hidden: false, addEventListener() {}, getElementById: id => nodes.get(id) };
  const game = { addEventListener: (name, handler, options) => handlers.push({ name, handler, signal: options.signal }), contains: () => true };
  const createCanvas = () => ({ isConnected: true, getContext: () => ({}), closest: () => game, addEventListener() {}, focus() { document.activeElement = this; } });
  const canvas = createCanvas(); nodes.set('spaceCadetCanvas', canvas);
  for (const id of ['scDialog', 'scLocation', 'scRank', 'scStatus', 'scObjective', 'scChecklist', 'scPause', 'scInteract', 'scFire', 'scShield', 'scSave']) nodes.set(id, { setAttribute() {} });
  const context = {
    SpaceCadetCore: require('../assets/js/games/space-cadet-core'),
    TEAM_BUILDER_ACTIVITY_REGISTRY: { registerActivity: (_id, definition) => { activity = definition; }, registerAction() {} },
    APP: { player: { id: 'owner-a' }, screen: 'lobby', room: { currentActivity: 'space-cadet' } },
    document, AbortController,
    localStorage: { getItem: key => records.get(key), setItem: (key, value) => records.set(key, value) },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    requestAnimationFrame: () => { frames.add(++frameId); return frameId; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/activities/space-cadet'), 'utf8'), context);
  assert.match(activity.render(), /spaceCadetCanvas/);
  context.SpaceCadet.sync();
  assert.equal(frames.size, 1);
  const firstSignal = handlers[0].signal;
  document.activeElement = canvas;
  context.SpaceCadet.beforeRender();
  const replacement = createCanvas(); nodes.set('spaceCadetCanvas', replacement); document.activeElement = null;
  context.SpaceCadet.sync();
  assert.equal(frames.size, 1);
  assert.equal(firstSignal.aborted, true);
  assert.equal(document.activeElement, replacement);
  context.SpaceCadet.sync();
  assert.equal(frames.size, 1, 'unchanged DOM does not start another frame loop');
  context.APP.screen = 'dashboard';
  context.SpaceCadet.sync();
  assert.equal(frames.size, 0);
  assert.ok(handlers.every(({ signal }) => signal.aborted));
  assert.equal(JSON.parse(records.get('space-cadet:v1:owner-a')).room, 'quarters');
});
