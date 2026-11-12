const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../assets/js/games/space-cadet-core');

test('campaign saves normalize versions, positions, prerequisite unlocks and checkpoints', () => {
  assert.deepEqual(C.restoreCampaign({ version: 99 }), C.createCampaign());
  const corrupt = C.restoreCampaign({ version: 1, room: 'hangar', x: 220, y: 130, trained: true, completed: true, checkpoint: 'boss' });
  assert.equal(corrupt.trained, false);
  assert.equal(corrupt.completed, false);
  assert.equal(corrupt.checkpoint, 'hub');
  assert.ok(C.validPosition(corrupt.room, corrupt.x, corrupt.y));
  const saved = { ...C.createCampaign(), room: 'engineering', x: 165, y: 175, repaired: true, trained: true, rescued: true, checkpoint: 'boss', bestScore: 420 };
  assert.deepEqual(C.restoreCampaign(saved), saved);
});

test('walking obeys furniture collisions, bounded time steps and door connections', () => {
  const state = C.createCampaign();
  state.x = 315; state.y = 225;
  for (let i = 0; i < 100; i++) C.move(state, 0, -1, .05);
  assert.ok(state.y >= 205, 'cannot walk through the mess table');
  state.x = 450; state.y = 170;
  for (let i = 0; i < 10; i++) C.move(state, 1, 0, .05);
  assert.equal(state.room, 'engineering');
  state.x = 25; state.y = 170;
  C.move(state, -1, 0, .05);
  assert.equal(state.room, 'quarters');
  state.x = 142; state.y = 175;
  C.move(state, 1, 0, 100);
  assert.ok(state.x <= 146.2);
});

test('stations require proximity and repair puzzle has a discoverable solution', () => {
  const state = C.createCampaign();
  assert.equal(C.nearby(state), null);
  state.room = 'engineering'; state.x = 85; state.y = 128;
  assert.equal(C.nearby(state).id, 'relay');
  assert.equal(C.toggleRelay(C.toggleRelay(0, 1), 2), 7);
  assert.equal(C.toggleRelay(C.toggleRelay(0, 0), 0), 0);
  assert.equal(C.toggleRelay(2, 10), 2);
  assert.equal(C.completeTraining(state, 'shield'), false);
  state.repaired = true;
  assert.equal(C.completeTraining(state, 'laser'), false);
  assert.equal(C.completeTraining(state, 'shield'), false, 'a quiz answer no longer grants qualification');
  assert.equal(C.completeTraining(state, { status: 'complete', beacons: 3, hits: 3, blocks: 2 }), true);
  assert.ok(C.createFlight(state));
});

test('relay diagnosis, routing and load test must complete in order', () => {
  const job = C.createRelayJob();
  assert.equal(C.workRelay(job, 'test'), false);
  C.workRelay(job, 'switch', 1);
  assert.equal(job.mask, 0, 'cannot route before locating the damaged bypass');
  C.workRelay(job, 'scan', 0);
  assert.equal(job.stage, 'inspect');
  assert.match(job.feedback, /checks out/);
  C.workRelay(job, 'scan', 2);
  assert.equal(job.stage, 'route');
  assert.equal(C.workRelay(job, 'test'), false);
  assert.match(job.feedback, /failed safely/);
  C.workRelay(job, 'switch', 1); C.workRelay(job, 'switch', 2);
  assert.equal(job.mask, 7);
  assert.equal(job.stage, 'route', 'lit circuits still need a load test');
  assert.equal(C.workRelay(job, 'test'), true);
  assert.equal(job.stage, 'complete');
  assert.equal(C.workRelay(job, 'test'), false, 'completed jobs do not complete twice');
});

test('simulator requires navigation, aimed target hits and actual shield interceptions', () => {
  const f = C.createTraining();
  for (let i = 0; i < 100; i++) C.tickTraining(f, { fire: true, shield: true }, 1 / 60);
  assert.equal(f.stage, 'navigate');
  assert.equal(f.hits, 0);
  for (const b of C.TRAINING_BEACONS) {
    for (let i = 0; i < 600 && f.stage === 'navigate'; i++) {
      C.tickTraining(f, { left: f.x > b.x + 3, right: f.x < b.x - 3, up: f.y > b.y + 3, down: f.y < b.y - 3 }, 1 / 60);
      if (f.beacons > C.TRAINING_BEACONS.indexOf(b)) break;
    }
  }
  assert.equal(f.beacons, 3);
  assert.equal(f.stage, 'gunnery');
  for (const target of f.targets) {
    for (let i = 0; i < 800 && target.hp; i++) C.tickTraining(f, { left: f.x > target.x + 3, right: f.x < target.x - 3, fire: true }, 1 / 60);
  }
  assert.equal(f.stage, 'shield');
  assert.equal(f.hits, 3);
  for (let i = 0; i < 180; i++) C.tickTraining(f, {}, 1 / 60);
  assert.equal(f.blocks, 0, 'unshielded pulses do not pass the drill');
  for (let i = 0; i < 300 && f.status === 'playing'; i++) C.tickTraining(f, { shield: true }, 1 / 60);
  assert.equal(f.status, 'complete');
  const campaign = C.createCampaign();
  assert.equal(C.completeTraining(campaign, f), false, 'repair qualification is still required');
  campaign.repaired = true;
  assert.equal(C.completeTraining(campaign, f), true);
});

function launch(boss = false) { return C.createFlight({ trained: true, rescued: boss, checkpoint: boss ? 'boss' : 'flight' }); }
function step(f, input = {}, seconds = 1) { for (let i = 0; i < Math.ceil(seconds * 60); i++) C.tickFlight(f, input, 1 / 60); }

test('flight requires qualification, normalizes diagonal speed and limits firing', () => {
  assert.equal(C.createFlight(C.createCampaign()), null);
  const f = launch(); f.y = 180;
  C.tickFlight(f, { right: true, down: true, fire: true }, .05);
  assert.ok(Math.abs(Math.hypot(f.x - 240, f.y - 180) - 7.5) < .001);
  step(f, { fire: true }, .2);
  assert.ok(f.bullets.length <= 2);
  step(f, { right: true, down: true }, 3);
  assert.ok(f.x <= 462 && f.y <= 248);
});

test('shield absorbs a hit, drains, and recharges when released', () => {
  const f = launch();
  f.shots.push({ x: f.x, y: f.y, vx: 0, vy: 0 });
  C.tickFlight(f, { shield: true }, .05);
  assert.equal(f.hull, 100);
  assert.ok(f.shield < 100);
  step(f, {}, .3);
  assert.equal(f.shield, 100);
  f.invulnerable = 0; f.shots.push({ x: f.x, y: f.y, vx: 0, vy: 0 });
  C.tickFlight(f, {}, .05);
  assert.equal(f.hull, 80);
});

test('rescue requires reaching the pod, and surviving a timer alone does not win', () => {
  const f = launch(); f.time = 30.99;
  C.tickFlight(f, {}, .02);
  assert.ok(f.boss);
  f.boss.hp = 0;
  C.tickFlight(f, {}, .02);
  assert.equal(f.status, 'playing');
  f.y = 175; f.pod = { x: f.x, y: f.y };
  C.tickFlight(f, {}, .02);
  assert.equal(f.rescued, true);
  assert.equal(f.status, 'complete');
});

test('boss checkpoint restores hull, boss patterns escalate and hits can win the encounter', () => {
  const f = launch(true);
  assert.equal(f.hull, 100);
  assert.equal(f.pod, null);
  assert.equal(f.boss.hp, 80);
  f.boss.hp = 1; f.bullets.push({ x: 240 + Math.sin((f.time + .01) * .7) * 135, y: 60 });
  C.tickFlight(f, {}, .01);
  assert.equal(f.status, 'complete');
  assert.ok(f.shots.length >= 5);
  const score = f.score;
  step(f, { fire: true }, 1);
  assert.equal(f.score, score, 'finished simulations do not repeat completion');
});

test('zero hull fails the mission and replay starts with a fresh hull', () => {
  const f = launch(true); f.hull = 20;
  f.shots.push({ x: f.x, y: f.y, vx: 0, vy: 0 });
  C.tickFlight(f, {}, .02);
  assert.equal(f.status, 'failed');
  assert.equal(launch(true).hull, 100);
});
