const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const moduleSource = fs.readFileSync(path.join(__dirname, '../assets/js/activities/card-tables.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const renderStart = html.indexOf('function render() {');
const renderSource = html.slice(renderStart, html.indexOf('\nfunction renderWelcome()', renderStart));

function fixture(type) {
  const actions = new Map(), listeners = [], events = [], calls = [];
  const body = { tagName: 'BODY' };
  let oldContext = { roomCode: 'ABC123', playerId: 'p1', tableId: 'table', handId: 'hand', turnId: 'p1', street: 'preflop', phase: 'playing' };
  let targetContext = { ...oldContext }, targetField = true, field, markup = '';
  const table = { get dataset() { return oldContext; } };
  const actionButton = {}, help = {};
  const doc = {
    activeElement: body,
    addEventListener(name, fn) { if (name === 'input') listeners.push(fn); },
    querySelector(selector) { return selector === '.card-table-game' ? table : selector.includes('cards-raise') ? actionButton : null; },
    getElementById(id) { return id === 'app' ? app : id === 'cardRaiseAmount' ? field : id === 'cardRaiseHelp' ? help : null; }
  };
  const input = value => ({ id: 'cardRaiseAmount', type: 'number', tagName: 'INPUT', value, disabled: false,
    closest: () => table,
    focus() { doc.activeElement = this; events.push('focus'); },
    blur() { doc.activeElement = body; events.push('blur'); },
    dispatchEvent(event) { event.target = this; listeners.forEach(fn => fn(event)); },
    setSelectionRange() { throw new Error('Number inputs cannot set a selection range.'); },
    get selectionStart() { throw new Error('Number input selection must not be read.'); },
    get selectionEnd() { throw new Error('Number input selection must not be read.'); }
  });
  const app = { querySelector: () => null, set innerHTML(value) { markup = value; oldContext = { ...targetContext }; field = targetField ? input('40') : null; doc.activeElement = body; }, get innerHTML() { return markup; } };
  const noop = () => {};
  const context = vm.createContext({ document: doc, Event: class { constructor(type, options) { this.type=type; this.bubbles=options.bubbles; } },
    APP: { screen: 'lobby', roomCode: 'ABC123', room: { code: 'ABC123', revision: 1, currentActivity: type, host: 'Host', participants: [], activityState: { id: 'table', handId: 'hand', version: 1, turnId: 'p1', street: 'preflop', phase: 'playing', currentBet: 20 } }, player: { id: 'p1' }, admin: {} },
    TEAM_BUILDER_ACTIVITY_REGISTRY: { registerActivity() {}, registerAction: (id, fn) => actions.set(id, fn) },
    setInterval() {}, TeamBuilderGameVictory: { beginFrame: noop, endFrame: noop },
    getActiveCosmosBoundTextInput: () => null, syncActiveContentBanks: noop, preserveDjBoothPlayersBeforeRender: noop,
    renderLobby: () => `Rendered turn: ${context.APP.room.activityState.turnId}`, renderVoiceDock: () => '', renderFooter: () => '',
    fitUnoToViewport: noop, surveyClashFeedback: { clear: noop }, applyActivityFilters: noop,
    restoreDjBoothPlayersAfterRender: noop, updateVoiceMeterDom: noop, teardownDjBoothPlayers: noop,
    autoFocusWordChainActiveCell: noop, teardownCosmosBoundSimulation: noop, syncCommunityChatScroll: noop,
    getSharedActorPayload: () => ({}), createRoomActorToken: () => 'test-action-1234567890', showError: message => { throw new Error(message); },
    socketEmitAck: async (_name, payload) => { calls.push(payload); return {}; }
  });
  context.window = context;
  vm.runInContext(moduleSource, context); vm.runInContext(renderSource, context);
  field = input('80'); doc.activeElement = field;
  return { context, doc, app, actions, events, calls, get field() { return field; },
    target(changes, showField = true) { targetContext = { ...targetContext, ...changes }; targetField = showField; } };
}

for (const type of ['five-card-draw', 'texas-holdem']) {
  test(`${type}: a focused amount field cannot block live turn updates`, () => {
    const f = fixture(type);
    f.context.APP.room.activityState.turnId = 'p2'; f.target({ turnId: 'p2' }, false);
    f.context.render();
    assert.match(f.app.innerHTML, /Rendered turn: p2/);
    assert.equal(f.field, null);
    assert.equal(f.doc.activeElement.tagName, 'BODY');
  });
  test(`${type}: live redraws preserve the amount without numeric selection errors`, () => {
    const f = fixture(type); f.context.render();
    assert.equal(f.field.value, '80'); assert.equal(f.doc.activeElement, f.field);
    assert.ok(f.events.includes('focus'));
  });
  test(`${type}: the amount survives a private-hand loading frame but not a new betting street`, () => {
    const f = fixture(type); f.target({}, false); f.context.render(); assert.equal(f.field, null);
    f.target({}, true); f.context.render(); assert.equal(f.field.value, '80');
    f.target({ street: 'flop' }); f.context.APP.room.activityState.street = 'flop'; f.context.render();
    assert.equal(f.field.value, '40'); assert.equal(f.doc.activeElement.tagName, 'BODY');
  });
  test(`${type}: submitting a raise releases the input and retains the entered amount`, async () => {
    const f = fixture(type); f.context.TeamBuilderCardTables.captureInput(f.field);
    await f.actions.get('cards-raise')();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].amount, 80);
    assert.ok(f.events.includes('blur')); assert.equal(f.doc.activeElement.tagName, 'BODY');
  });
}
