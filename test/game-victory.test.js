const assert = require('node:assert/strict');
const test = require('node:test');
const { createWinTracker, banner } = require('../assets/js/game-victory');

test('a new win celebrates once across repeated renders and a rematch can celebrate again', () => {
  const saved = []; const track = createWinTracker(new Set(), keys => saved.push(keys));
  const active = { key: 'room:player:checkers:1', finished: false, winnerId: '' };
  assert.equal(track(active, 1000), false);
  const result = { ...active, finished: true, winnerId: 'player', finishedAt: 2000 };
  assert.equal(track(result, 2000), true); assert.equal(track(result, 2100), false);
  const reloaded = createWinTracker(new Set(saved.at(-1)));
  assert.equal(reloaded(result, 2200), false, 'refreshing does not replay the same celebration');
  assert.equal(track({ ...result, key: 'room:player:checkers:2', finishedAt: 2300 }, 2300), true);
});

test('draws and archived results do not trigger a win animation', () => {
  const track = createWinTracker();
  assert.equal(track({ key: 'draw', finished: true, winnerId: '', finishedAt: 2000 }, 2000), false);
  assert.equal(track({ key: 'archive', finished: true, winnerId: 'other', finishedAt: 1000 }, 30000), false);
  assert.equal(track({ key: 'old-checkers', finished: true, winnerId: 'other' }, 30000), false);
  track({ key: 'legacy-live', finished: false, winnerId: '' }, 30000);
  assert.equal(track({ key: 'legacy-live', finished: true, winnerId: 'player' }, 30010), true, 'a live legacy match still works without a finish timestamp');
});

test('winner banners escape names and reasons and omit non-winning results', () => {
  const output = banner({ kind: 'Chess', winnerId: 'p1', winnerName: '<img src=x onerror=alert(1)>', reason: '<script>oops</script>' });
  assert.equal(output.includes('<img'), false); assert.equal(output.includes('<script>'), false);
  assert.ok(output.includes('&lt;img')); assert.ok(output.includes('wins!'));
  assert.equal(banner({ kind: 'Checkers', winnerName: 'No winner' }), '');
});
