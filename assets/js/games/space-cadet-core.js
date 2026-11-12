(function (root) {
  'use strict';
  const WIDTH = 480, HEIGHT = 270;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rect = (x, y, w, h, kind) => ({ x, y, w, h, kind });
  const ROOMS = {
    quarters: { title: 'Crew quarters', subtitle: 'Deck 03 · Relief vessel Aurora', props: [rect(36, 70, 62, 76, 'bunk'), rect(122, 62, 98, 40, 'desk'), rect(302, 62, 132, 42, 'kitchen'), rect(294, 171, 62, 34, 'table'), rect(38, 188, 44, 28, 'locker')], stations: [{ id: 'journal', x: 180, y: 114, label: 'Read your assignment' }], doors: [{ side: 'right', to: 'engineering', label: 'ENGINEERING' }] },
    engineering: { title: 'Engineering & training', subtitle: 'Deck 02 · Bring the Aurora back online', props: [rect(40, 62, 90, 50, 'relay'), rect(186, 62, 100, 44, 'training'), rect(342, 65, 84, 58, 'reactor'), rect(350, 187, 64, 29, 'crates')], stations: [{ id: 'relay', x: 85, y: 128, label: 'Repair the power relay' }, { id: 'training', x: 236, y: 122, label: 'Cadet flight briefing' }], doors: [{ side: 'left', to: 'quarters', label: 'QUARTERS' }, { side: 'right', to: 'hangar', label: 'HANGAR' }] },
    hangar: { title: 'Hangar 01', subtitle: 'Sparrow trainer · Your first launch awaits', props: [rect(172, 83, 120, 104, 'ship'), rect(38, 62, 68, 40, 'desk'), rect(370, 195, 60, 25, 'crates')], stations: [{ id: 'ship', x: 232, y: 208, label: 'Board the Sparrow' }], doors: [{ side: 'left', to: 'engineering', label: 'ENGINEERING' }] }
  };
  function createCampaign() { return { version: 1, room: 'quarters', x: 142, y: 176, facing: 'down', repaired: false, trained: false, rescued: false, completed: false, checkpoint: 'hub', bestScore: 0 }; }
  function validPosition(room, x, y) {
    return x >= 20 && x <= 460 && y >= 114 && y <= 246 && !ROOMS[room].props.some(p => x + 7 > p.x && x - 7 < p.x + p.w && y > p.y && y - 9 < p.y + p.h);
  }
  function restoreCampaign(raw) {
    const state = createCampaign();
    if (!raw || raw.version !== 1 || !ROOMS[raw.room]) return state;
    for (const key of ['repaired', 'trained', 'rescued', 'completed']) state[key] = raw[key] === true;
    state.trained = state.repaired && state.trained;
    state.rescued = state.trained && state.rescued;
    state.completed = state.rescued && state.completed;
    state.room = raw.room;
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y) && validPosition(state.room, raw.x, raw.y)) { state.x = raw.x; state.y = raw.y; }
    state.bestScore = clamp(Math.floor(Number(raw.bestScore) || 0), 0, 1000000);
    state.checkpoint = state.trained && ['flight', 'boss'].includes(raw.checkpoint) ? raw.checkpoint : 'hub';
    if (state.checkpoint === 'boss' && !state.rescued) state.checkpoint = 'flight';
    return state;
  }
  function move(state, dx, dy, dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    const magnitude = Math.hypot(dx, dy) || 1, step = 84 * Math.min(dt, .05);
    const x = state.x + dx / magnitude * step, y = state.y + dy / magnitude * step;
    if (Math.abs(dx) > Math.abs(dy)) state.facing = dx > 0 ? 'right' : 'left';
    else if (dy) state.facing = dy > 0 ? 'down' : 'up';
    if (validPosition(state.room, x, state.y)) state.x = x;
    if (validPosition(state.room, state.x, y)) state.y = y;
    const door = ROOMS[state.room].doors.find(d => state.y > 144 && state.y < 194 && (d.side === 'left' ? x < 23 : x > 457));
    if (door) { state.room = door.to; state.x = door.side === 'left' ? 448 : 32; state.y = 170; return true; }
    return false;
  }
  function nearby(state) {
    return ROOMS[state.room].stations.find(s => Math.hypot(state.x - s.x, state.y - s.y) < 36) || null;
  }
  function objective(state) {
    if (state.completed) return 'First Launch complete. Visit the hangar to fly again.';
    if (!state.repaired) return 'Find engineering and restore the three power circuits.';
    if (!state.trained) return 'Complete the cadet briefing at the cyan training console.';
    return state.checkpoint === 'boss' ? 'Disable Scrap Maw’s core. Your boss checkpoint is saved.' : 'Board the Sparrow. Rescue the supply pod and stop Scrap Maw.';
  }
  // Switches route power through linked circuits. Starting at 000, B then C solves it.
  function toggleRelay(mask, index) { return Number.isInteger(index) && index >= 0 && index < 3 ? (mask ^ [3, 6, 1][index]) & 7 : mask; }
  function completeTraining(state, answer) {
    if (!state.repaired || answer !== 'shield') return false;
    state.trained = true; return true;
  }
  function createFlight(campaign) {
    if (!campaign.trained) return null;
    const boss = campaign.checkpoint === 'boss';
    return { time: boss ? 31 : 0, x: 240, y: 226, hull: 100, shield: 100, shieldActive: false, invulnerable: 0, fireAt: 0, spawnAt: boss ? 9999 : 1, enemyAt: 0, bullets: [], hazards: [], shots: [], pickups: [], pod: boss || campaign.rescued ? null : { x: 240, y: -15 }, rescued: boss || campaign.rescued, boss: boss ? { hp: 80, x: 240, y: 52 } : null, bossShotAt: 0, rapid: 0, score: 0, status: 'playing', event: '' };
  }
  function circleHit(a, b, radius) { return Math.hypot(a.x - b.x, a.y - b.y) < radius; }
  function tickFlight(f, input, dt) {
    if (f.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05); f.time += dt; f.event = '';
    f.invulnerable = Math.max(0, f.invulnerable - dt); f.rapid = Math.max(0, f.rapid - dt);
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0), dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const length = Math.hypot(dx, dy) || 1;
    f.x = clamp(f.x + dx / length * 150 * dt, 18, 462); f.y = clamp(f.y + dy / length * 150 * dt, 110, 248);
    f.shieldActive = Boolean(input.shield) && f.shield > 0;
    f.shield = clamp(f.shield + (f.shieldActive ? -35 : 13) * dt, 0, 100);
    if (input.fire && f.time >= f.fireAt) { f.bullets.push({ x: f.x, y: f.y - 20 }); f.fireAt = f.time + (f.rapid ? .1 : .22); }
    if (!f.boss && f.time < 30 && f.time >= f.spawnAt) {
      const index = Math.floor(f.time / 1.5);
      f.hazards.push({ x: 32 + (index * 113) % 416, y: -14, hp: 2, kind: index % 3 ? 'drone' : 'asteroid', age: 0 });
      f.spawnAt = f.time + 1.5;
    }
    if (!f.boss && f.time >= 31) { f.boss = { hp: 80, x: 240, y: 52 }; f.event = 'boss'; }
    for (const h of f.hazards) { h.age += dt; h.y += (h.kind === 'drone' ? 40 : 29) * dt; }
    if (f.time >= f.enemyAt) {
      for (const h of f.hazards.filter(h => h.kind === 'drone' && h.y > 10 && h.y < 180)) f.shots.push({ x: h.x, y: h.y + 10, vx: 0, vy: 78 });
      f.enemyAt = f.time + 1.7;
    }
    if (f.boss) {
      f.boss.x = 240 + Math.sin(f.time * .7) * 135;
      if (f.boss.hp > 0 && f.time >= f.bossShotAt) {
        const spread = f.boss.hp < 40 ? [-55, -28, 0, 28, 55] : [-40, 0, 40];
        for (const vx of spread) f.shots.push({ x: f.boss.x, y: 76, vx, vy: 75 });
        f.bossShotAt = f.time + 1.3;
      }
    }
    for (const b of f.bullets) b.y -= 240 * dt;
    for (const b of f.shots) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const b of f.bullets) {
      const target = f.hazards.find(h => h.hp > 0 && circleHit(b, h, h.kind === 'asteroid' ? 17 : 14));
      if (target) {
        b.y = -100; target.hp--; f.score += 10;
        if (!target.hp && f.score % 40 === 0) f.pickups.push({ x: target.x, y: target.y, kind: f.score % 80 ? 'repair' : 'rapid' });
      } else if (f.boss && f.boss.hp > 0 && Math.abs(b.x - f.boss.x) < 27 && b.y < 75 && b.y > 25) { f.boss.hp--; b.y = -100; f.score += 5; }
    }
    const hit = f.shots.find(b => circleHit(b, f, 13)) || f.hazards.find(h => h.hp > 0 && circleHit(h, f, 24));
    if (hit && !f.invulnerable) { if (!f.shieldActive) f.hull = Math.max(0, f.hull - 20); hit.y = 300; f.invulnerable = .65; }
    if (f.pod) {
      f.pod.y = Math.min(175, f.pod.y + dt * 17);
      if (circleHit(f.pod, f, 29)) { f.pod = null; f.rescued = true; f.score += 100; f.event = 'rescue'; }
    }
    for (const p of f.pickups) {
      p.y += 28 * dt;
      if (circleHit(p, f, 23)) { if (p.kind === 'repair') f.hull = Math.min(100, f.hull + 20); else f.rapid = 8; p.y = 400; }
    }
    f.bullets = f.bullets.filter(b => b.y > -25);
    f.shots = f.shots.filter(b => b.y < 290 && b.x > -20 && b.x < 500);
    f.hazards = f.hazards.filter(h => h.y < 300 && h.hp > 0);
    f.pickups = f.pickups.filter(p => p.y < 290);
    if (!f.hull) f.status = 'failed';
    else if (f.boss && f.boss.hp <= 0 && f.rescued) { f.status = 'complete'; f.score += 500; }
  }
  const api = { WIDTH, HEIGHT, ROOMS, createCampaign, restoreCampaign, validPosition, move, nearby, objective, toggleRelay, completeTraining, createFlight, tickFlight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpaceCadetCore = api;
})(typeof window === 'undefined' ? globalThis : window);
