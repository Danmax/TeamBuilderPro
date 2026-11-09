const assert = require('node:assert/strict');
const test = require('node:test');
const { REVEAL_MS, createRevealTracker, createBoardRenderer } = require('../assets/js/survey-board');

test('answer flips begin only on a new reveal and retain progress across repeated live renders', () => {
  const track = createRevealTracker();
  assert.deepEqual(track('round-1', [false, true], 100), [null, null], 'joining a board does not replay its reveals');
  assert.deepEqual(track('round-1', [true, true], 200), [0, null]);
  assert.deepEqual(track('round-1', [true, true], 500), [300, null], 'timer and score updates continue the same animation');
  assert.deepEqual(track('round-1', [true, true], 200 + REVEAL_MS), [null, null]);
  assert.deepEqual(track('round-2', [false, false], 1200), [null, null]);
  assert.deepEqual(track('round-2', [false, true], 1300), [null, 0]);
  assert.deepEqual(track('other-room', [true, true], 1400), [null, null]);
});

test('answer boards keep hidden text out of the DOM, disable guest controls and escape revealed content', () => {
  const render = createBoardRenderer();
  const question = { answers: [{ text: '<img src=x onerror=alert(1)>', points: 60 }, { text: 'Other', points: 40 }] };
  const hidden = render(question, [false, false], false, 'round', 0);
  assert.equal(hidden.includes('<img'), false);
  assert.equal(hidden.includes('&lt;img'), false);
  assert.equal((hidden.match(/ disabled/g) || []).length, 2);
  const shown = render(question, [true, false], true, 'round', 100);
  assert.ok(shown.includes('ff-revealing'));
  assert.ok(shown.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(shown.includes('60 points'));
  assert.equal((shown.match(/ disabled/g) || []).length, 1);
  assert.equal((shown.match(/ff-empty/g) || []).length, 6);
  const settled = render(question, [true, false], true, 'round', 1000);
  assert.equal(settled.includes('ff-revealing'), false);
  assert.ok(settled.includes('ff-revealed'));
});

test('strike and correct effects play once, ignore saved events on reconnect and expire stale events', () => {
  const { STRIKE_MS, createFeedbackTracker } = require('../assets/js/survey-board');
  const track = createFeedbackTracker();
  assert.equal(track('room-a:game-1', { key: 'strike', stamp: 1000 }, 1200), null);
  assert.equal(track('room-a:game-1', { key: 'strike', stamp: 1300 }, 1400), 'strike');
  assert.equal(track('room-a:game-1', { key: 'strike', stamp: 1300 }, 1800), null);
  assert.equal(track('room-a:game-1', { key: 'correct', stamp: 1800 }, 1900), 'correct');
  assert.equal(track('room-a:game-1', { key: 'strike', stamp: 1900 }, 1900 + STRIKE_MS + 1), null);
  assert.equal(track('room-b:game-1', { key: 'strike', stamp: 6000 }, 6000), null);
  assert.equal(track('room-b:game-1', { key: 'top', stamp: 6100 }, 6100), 'top');
});
