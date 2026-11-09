const assert = require('node:assert/strict');
const test = require('node:test');
const wheel = require('../assets/js/games/spin-wheel-core');

const initial = () => ({ optionEntries: [{ label: 'Bonus', action: { type: 'points', points: 100 } }, { label: 'Shoutout', prompt: 'Thank a teammate.' }], playerSelections: {}, spinToken: 0, spinCount: 0, wheelRotation: 0 });

test('every spin lands its chosen slice under the top pointer after multiple rotations', () => {
  let state = initial();
  const slices = wheel.segments(state.optionEntries);
  for (let index = 0; index < slices.length; index++) {
    const spun = wheel.spin(state, 'Host', 1000, () => (index + .1) / slices.length);
    assert.equal(spun.pendingSelectedIndex, index);
    const pointer = (360 - spun.wheelRotation % 360) % 360;
    assert.ok(Math.abs(pointer - slices[index].center) < .001);
    assert.ok(spun.wheelRotation - state.wheelRotation >= 2160);
    assert.throws(() => wheel.spin(spun, 'Host'), /finish/);
    state = wheel.settle(spun, 5800);
  }
});

test('settlement waits for the animation, credits either copy of a predicted choice and is idempotent', () => {
  const state = initial(); state.playerSelections = { Guest: 2, Host: 1 };
  const spun = wheel.spin(state, 'Host', 1000, () => 0);
  assert.equal(wheel.settle(spun, 5799), spun);
  const result = wheel.settle(spun, 5800);
  assert.deepEqual(result.spinWinners, ['Guest']);
  assert.equal(result.spinPoints.Host, 100);
  assert.equal(result.currentResult, 'Bonus');
  assert.equal(result.history[0].spinner, 'Host');
  assert.deepEqual(result.playerSelections, {}, 'each new spin gets fresh predictions');
  assert.equal(wheel.settle(result, 9999), result, 'points cannot be awarded twice');
  assert.deepEqual(state.playerSelections, { Guest: 2, Host: 1 }, 'spin does not mutate the previous board');
});

test('late renders use elapsed animation time and persisted spins can settle after restart', () => {
  const spun = wheel.spin(initial(), 'Guest', 1000, () => .4);
  assert.deepEqual(wheel.timing(spun, 3000), { duration: 4800, elapsed: 2000, animating: true });
  assert.equal(wheel.timing(spun, 5801).animating, false);
  const restored = JSON.parse(JSON.stringify(spun));
  assert.equal(wheel.settle(restored, 6000).isSpinning, false);
  assert.equal(wheel.settle(restored, 6000).currentResultPrompt, 'Thank a teammate.');
  assert.throws(() => wheel.spin({ options: ['Only one'] }, 'Host'), /two choices/);
});
