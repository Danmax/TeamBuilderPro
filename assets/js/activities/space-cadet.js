(function (root) {
  'use strict';
  const C = root.SpaceCadetCore, registry = root.TEAM_BUILDER_ACTIVITY_REGISTRY;
  let campaign, flight = null, mode = 'hub', owner = '', canvas, ctx, frame = 0, controller, previous = 0, paused = false, dialog = '', relayJob = null, training = null, dialogue = null, lastHud = '', lastSave = 0, saveFailed = false, banner = '', restoreFocus = false;
  const held = new Set(), pointerKeys = new Map();
  const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
  let celebration = null;
  function celebrate(title, detail) {
    celebration = { title, detail, expiresAt: Date.now() + 2600 };
    renderCelebration();
  }
  function renderCelebration() {
    const el = document.getElementById('scSuccess');
    if (!el) return;
    el.hidden = !celebration || Date.now() >= celebration.expiresAt;
    if (el.hidden) return;
    // All celebration copy is fixed game text. Keep it outside the canvas for announcements.
    el.innerHTML = `<span class="sc-success-mark" aria-hidden="true">✓</span><span><strong>${celebration.title}</strong><small>${celebration.detail}</small></span><span class="sc-success-pixels" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i style="--sc-particle:${i}"></i>`).join('')}</span>`;
  }
  const keyFor = () => `space-cadet:v1:${owner}`;
  function save() {
    try { localStorage.setItem(keyFor(), JSON.stringify(campaign)); saveFailed = false; }
    catch (_) { saveFailed = true; }
  }
  function load() {
    try { return C.restoreCampaign(JSON.parse(localStorage.getItem(keyFor()) || 'null')); }
    catch (_) { return C.createCampaign(); }
  }
  function prepare() {
    const id = String(APP.player?.id || '');
    if (owner === id && campaign) return;
    stop(); owner = id; campaign = load(); flight = null; mode = 'hub'; dialog = ''; banner = ''; paused = false; celebration = null; relayJob = null; training = null; dialogue = null;
  }
  function renderGame() {
    prepare();
    return `<section class="sc-game" aria-label="Space Cadet: First Launch"><header class="sc-header"><div><div class="sc-kicker">An Aurora frontier story</div><h2 class="sc-title">SPACE <span>CADET</span></h2></div><span class="sc-badge">FIRST LAUNCH · PREVIEW</span></header><div class="sc-layout"><div class="sc-play"><div class="sc-location"><strong id="scLocation">Crew quarters</strong><span id="scRank">RECRUIT / AURORA</span></div><div class="sc-stage"><canvas id="spaceCadetCanvas" width="480" height="270" tabindex="0" role="img" aria-label="Space Cadet game. Use arrow keys or WASD to move, E to interact, Space to fire, Shift for shield, and P to pause. On-screen controls are below."></canvas><div id="scSuccess" class="sc-success" role="status" aria-live="polite" aria-atomic="true" hidden></div></div><section class="sc-dialog" id="scDialog" aria-label="Crew conversation" hidden></section><div class="sc-status" id="scStatus" role="status" aria-live="polite"></div><div class="sc-controls"><div class="sc-pad" aria-label="Movement controls"><button type="button" data-sc-hold="up" aria-label="Move up">↑</button><button type="button" data-sc-hold="left" aria-label="Move left">←</button><button type="button" data-sc-hold="down" aria-label="Move down">↓</button><button type="button" data-sc-hold="right" aria-label="Move right">→</button></div><div class="sc-actions"><button type="button" class="sc-primary" data-sc-command="interact" id="scInteract">Interact · E</button><button type="button" class="sc-primary" data-sc-hold="fire" id="scFire" hidden>Fire · Space</button><button type="button" data-sc-hold="shield" id="scShield" hidden>Shield · Shift</button><button type="button" data-sc-command="pause" id="scPause">Pause</button></div></div><p class="sc-help">Select the scene to use <kbd>WASD</kbd> / <kbd>↑↓←→</kbd> · <kbd>E</kbd> interact · <kbd>Space</kbd> fire · <kbd>Shift</kbd> shield · <kbd>P</kbd> pause. Touch: hold the arrows to move while holding Fire or Shield.</p></div><aside class="sc-sidebar"><div class="sc-kicker">Personal mission journal</div><h3>01 / First Launch</h3><p id="scObjective"></p><ol class="sc-log" id="scChecklist"></ol><div class="sc-save" id="scSave"></div><div class="sc-tools"><button type="button" data-sc-command="home">Return to hangar</button><button type="button" data-sc-command="restart">New adventure</button></div></aside></div></section>`;
  }
  function active() { return APP.screen === 'lobby' && APP.room?.currentActivity === 'space-cadet' && !APP.editingProfile && !APP.characterEditorOpen; }
  function stop() {
    cancelAnimationFrame(frame); frame = 0; controller?.abort(); controller = null;
    held.clear(); pointerKeys.clear();
    if (campaign && owner) save();
    canvas = null; ctx = null;
  }
  function sync() {
    const next = document.getElementById('spaceCadetCanvas');
    if (!active() || !next) { celebration = null; if (canvas) { paused = true; stop(); } return; }
    if (next === canvas) return;
    const focusGame = restoreFocus; restoreFocus = false;
    prepare(); stop(); canvas = next; ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    controller = new AbortController(); const signal = controller.signal;
    const game = canvas.closest('.sc-game');
    game.addEventListener('click', event => { const command = event.target.closest('[data-sc-command]'); if (command) act(command.dataset.scCommand); }, { signal });
    game.addEventListener('pointerdown', event => {
      const button = event.target.closest('[data-sc-hold]');
      if (!button || button.disabled || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); pointerKeys.set(event.pointerId, button.dataset.scHold); held.add(button.dataset.scHold); canvas.focus({ preventScroll: true });
    }, { signal });
    const release = event => { const key = pointerKeys.get(event.pointerId); pointerKeys.delete(event.pointerId); if (![...pointerKeys.values()].includes(key)) held.delete(key); };
    game.addEventListener('pointerup', release, { signal }); game.addEventListener('pointercancel', release, { signal }); game.addEventListener('lostpointercapture', release, { signal });
    canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), { signal });
    // Browsers can synthesize contextmenu from a long touch even after pointerdown is prevented.
    game.addEventListener('contextmenu', event => {
      if (event.target === canvas || event.target.closest('.sc-controls')) event.preventDefault();
    }, { signal });
    root.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey || !game.contains(document.activeElement) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (document.activeElement?.tagName === 'BUTTON' && ['Space', 'Enter'].includes(event.code)) return;
      if (dialog && ['KeyE', 'Enter', 'Space'].includes(event.code)) { event.preventDefault(); if (!event.repeat) act('dialogue-next'); return; }
      const key = keyboardKey(event.code);
      if (key && !dialog) { event.preventDefault(); held.add(key); }
      if (event.repeat) return;
      if (event.code === 'KeyE' && !dialog) { event.preventDefault(); act('interact'); }
      if (event.code === 'KeyP') { event.preventDefault(); act('pause'); }
    }, { signal });
    root.addEventListener('keyup', event => { const key = keyboardKey(event.code); if (key) held.delete(key); }, { signal });
    root.addEventListener('blur', () => { paused = true; held.clear(); pointerKeys.clear(); updateHud(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { paused = true; held.clear(); pointerKeys.clear(); save(); updateHud(); } }, { signal });
    root.addEventListener('pagehide', save, { signal });
    game.addEventListener('focusout', event => { if (!game.contains(event.relatedTarget)) { held.clear(); pointerKeys.clear(); if (mode === 'flight') paused = true; } }, { signal });
    lastHud = ''; previous = 0; updateHud(); renderDialog(); renderCelebration();
    if (focusGame && !dialog) canvas.focus({ preventScroll: true });
    frame = requestAnimationFrame(loop);
  }
  function keyboardKey(code) { return ({ ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'fire', ShiftLeft: 'shield', ShiftRight: 'shield' })[code]; }
  function loop(now) {
    if (!canvas?.isConnected || !active()) { paused = true; stop(); return; }
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now;
    if (!paused && !dialog && !document.hidden) {
      if (mode === 'hub') {
        if (C.move(campaign, Number(held.has('right')) - Number(held.has('left')), Number(held.has('down')) - Number(held.has('up')), dt)) { banner = ''; save(); }
        if (now - lastSave > 3000) { save(); lastSave = now; }
      } else if (mode === 'training') {
        C.tickTraining(training, Object.fromEntries([...held].map(key => [key, true])), dt);
        if (training.status === 'complete') {
          const alreadyTrained = campaign.trained;
          if (C.completeTraining(campaign, training)) {
            if (!alreadyTrained) celebrate('Flight qualified', 'Navigation · Gunnery · Shields passed');
            mode = 'hub'; dialog = 'qualified'; save(); renderDialog();
          }
        }
      } else if (mode === 'flight') {
        const input = Object.fromEntries([...held].map(key => [key, true])); C.tickFlight(flight, input, dt);
        if (flight.event === 'rescue') { if (!campaign.rescued) celebrate('Rescue successful', 'Supply pod safely recovered'); campaign.rescued = true; banner = 'Supply pod recovered. The manifest mentions an illegal blockade.'; save(); }
        if (flight.boss && flight.rescued && campaign.checkpoint !== 'boss') { campaign.checkpoint = 'boss'; save(); banner = 'Scrap Maw incoming. Boss checkpoint saved.'; }
        if (flight.status !== 'playing') {
          mode = flight.status;
          campaign.bestScore = Math.max(campaign.bestScore, flight.score);
          if (mode === 'complete') { celebrate('Mission complete', campaign.completed ? 'Scrap Maw defeated · Crew safe' : 'Scrap Maw defeated · Ensign earned'); campaign.completed = true; campaign.checkpoint = 'hub'; }
          save(); dialog = mode; renderDialog();
        }
      }
    }
    if (celebration && Date.now() >= celebration.expiresAt) {
      celebration = null;
      const success = document.getElementById('scSuccess'); if (success) success.hidden = true;
      document.getElementById('scDialog')?.setAttribute('data-success', 'false');
    }
    updateDialogue(); draw(now / 1000); updateHud(); frame = requestAnimationFrame(loop);
  }
  function returnHome() { mode = 'hub'; flight = null; training = null; dialog = ''; paused = false; campaign.room = 'hangar'; campaign.x = 232; campaign.y = 220; save(); }
  function launch() { flight = C.createFlight(campaign); if (!flight) return; mode = 'flight'; dialog = ''; paused = false; campaign.checkpoint = campaign.checkpoint === 'boss' ? 'boss' : 'flight'; banner = ''; save(); }
  function act(command) {
    if (command === 'dialogue-next') {
      if (!dialogue) return;
      const page = dialogue.pages[dialogue.page];
      if (dialogueCount() < page.length) dialogue.revealed = true;
      else if (dialogue.page < dialogue.pages.length - 1) { dialogue.page++; dialogue.startedAt = Date.now(); dialogue.revealed = false; }
      renderDialog(); return;
    }
    if (command === 'pause') { paused = !paused; held.clear(); }
    else if (command === 'close') dialog = '';
    else if (command === 'home') { returnHome(); banner = 'Back aboard Aurora. Your qualifications and checkpoint are saved.'; }
    else if (command === 'restart') dialog = 'restart';
    else if (command === 'confirm-restart') { campaign = C.createCampaign(); flight = null; training = null; relayJob = null; dialogue = null; mode = 'hub'; dialog = ''; paused = false; banner = ''; celebration = null; renderCelebration(); save(); }
    else if (command === 'launch' || command === 'retry') launch();
    else if (command === 'start-training' && campaign.repaired) { training = C.createTraining(); mode = 'training'; dialog = ''; paused = false; banner = ''; }
    else if (command.startsWith('scan-')) { C.workRelay(relayJob, 'scan', Number(command.slice(5))); }
    else if (command === 'test-relay') {
      if (C.workRelay(relayJob, 'test')) { if (!campaign.repaired) celebrate('Power restored', 'All three circuits passed the load test'); campaign.repaired = true; save(); dialog = 'repaired'; }
    }
    else if (command.startsWith('relay-')) {
      C.workRelay(relayJob, 'switch', Number(command.slice(6)));
    } else if (command === 'interact' && mode === 'hub' && !paused && !dialog) {
      const station = C.nearby(campaign);
      if (!station) { banner = 'Walk toward a marked console or the Sparrow, then interact.'; }
      else { banner = ''; dialog = station.id; if (dialog === 'relay') { if (campaign.repaired) dialog = 'repaired'; else relayJob ||= C.createRelayJob(); } }
    }
    held.clear(); lastHud = ''; renderDialog(); updateHud();
    if (!dialog) canvas?.focus({ preventScroll: true });
  }
  function dialogueCount() {
    if (!dialogue) return 0;
    const length = dialogue.pages[dialogue.page].length;
    return reducedMotion.matches || dialogue.revealed ? length : Math.min(length, Math.floor((Date.now() - dialogue.startedAt) / 22));
  }
  function updateDialogue() {
    if (!dialog || !dialogue) return;
    const el = document.getElementById('scDialog'), line = el?.querySelector('[data-sc-message]');
    if (!line) return;
    const page = dialogue.pages[dialogue.page], count = dialogueCount(), finished = count >= page.length;
    const visible = page.slice(0, count);
    if (line.textContent !== visible) { line.textContent = visible; line.parentElement.scrollTop = reducedMotion.matches || dialogue.revealed ? 0 : line.parentElement.scrollHeight; }
    const next = el.querySelector('[data-sc-command="dialogue-next"]'), final = finished && dialogue.page === dialogue.pages.length - 1;
    const wasReading = document.activeElement === next;
    next.textContent = !finished ? 'Show full message ▸' : final ? 'Message received ✓' : 'Continue ▸';
    next.disabled = final;
    const finalPanel = el.querySelector('[data-sc-final]'); finalPanel.hidden = !final;
    if (final && wasReading) finalPanel.querySelector('button')?.focus({ preventScroll: true });
    line.parentElement.setAttribute('data-typing', String(!finished));
  }
  function renderDialog() {
    const el = document.getElementById('scDialog'); if (!el) return;
    el.setAttribute('data-success', String(Boolean(celebration && Date.now() < celebration.expiresAt && ['repaired', 'qualified', 'complete'].includes(dialog))));
    el.hidden = !dialog; if (!dialog) { el.innerHTML = ''; dialogue = null; return; }
    const button = (command, label, primary = false) => `<button type="button" data-sc-command="${command}" class="${primary ? 'sc-primary' : ''}">${label}</button>`;
    let title = '', speaker = 'AURORA', role = 'Ship intelligence', portrait = 'A', pages = [], actions = '', extra = '';
    if (dialog === 'journal') {
      title = 'Your first assignment'; speaker = 'ENGINEER VALE'; role = 'Chief engineer · Deck 02'; portrait = 'V';
      pages = ['Welcome aboard the Aurora, recruit. She may have a few dents, but there is no better ship to call home.', 'Our hangar has lost power. Take the right-hand door to engineering, scan the relay housings, and find the fault. Then we will see what you can do in the flight simulator.'];
    }
    if (dialog === 'relay') {
      speaker = 'ENGINEER VALE'; role = 'Maintenance channel'; portrait = 'V';
      title = relayJob.stage === 'inspect' ? 'Job 01 / Find the fault' : 'Job 01 / Reroute power';
      pages = relayJob.stage === 'inspect'
        ? ['Do not flip switches blindly, cadet. Use the scanner on each relay housing. A healthy relay returns a steady signal; a blown bypass will flag a fault.']
        : ['There it is—a blown bypass in relay C. We can get the ship moving by routing power around the damaged section.', 'Each switch changes linked circuits. A toggles life support and navigation. B toggles navigation and the hangar. C toggles life support. Light all three, then run a load test.'];
      extra = `<div class="sc-job"><div class="sc-job-heading"><span>01 SCAN</span><span class="${relayJob.stage !== 'inspect' ? 'sc-job-active' : ''}">02 REROUTE</span><span>03 LOAD TEST</span></div><div class="sc-relay-bank">${['A', 'B', 'C'].map((label, i) => `<div class="sc-relay-unit ${relayJob.inspected === i ? 'sc-relay-scanned' : ''}"><strong>RELAY ${label}</strong><span class="sc-signal ${relayJob.inspected === i && i === 2 ? 'sc-signal-fault' : ''}" aria-hidden="true">▂ ▄ ▆ ▄ ▂</span>${relayJob.stage === 'inspect' ? button(`scan-${i}`, `Scan ${label}`) : `<small>${i === 2 ? 'BYPASS FAULT' : 'SIGNAL STABLE'}</small>`}</div>`).join('')}</div>${relayJob.stage !== 'inspect' ? `<div class="sc-circuits">${['Life support', 'Navigation', 'Hangar'].map((label, i) => `<span class="${relayJob.mask & (1 << i) ? 'sc-on' : ''}">${label}<b>${relayJob.mask & (1 << i) ? 'ONLINE' : 'OFFLINE'}</b></span>`).join('')}</div>` : ''}<p class="sc-job-feedback" role="status">${relayJob.feedback}</p></div>`;
      if (relayJob.stage === 'route') actions = ['A', 'B', 'C'].map((label, i) => button(`relay-${i}`, `Switch ${label}`)).join('') + button('test-relay', 'Run load test', true);
    }
    if (dialog === 'repaired') {
      speaker = 'ENGINEER VALE'; role = 'Chief engineer · Power restored'; portrait = 'V'; title = 'That is how you fix a starship';
      pages = ['Listen to that hum. Life support is steady, navigation is awake, and the hangar doors have power again. Nice work, cadet.', 'The cyan simulator console is just to your right. No more theory: you will steer through beacons, take out practice targets, and catch a few harmless pulses on your shield.'];
    }
    if (dialog === 'training') {
      title = 'Job 02 / Flight qualification'; speaker = 'FLIGHT INSTRUCTOR'; role = 'Aurora training intelligence'; portrait = 'AI';
      pages = campaign.repaired ? ['Welcome to the simulator. Your ship is safe, the ammunition is simulated, and nobody is keeping score against you.', 'First, fly through three marked beacons. Next, line up and shoot three practice drones. Finally, hold your shield to absorb two incoming pulses. Use the same movement, Fire, and Shield controls as real flight.'] : ['The simulator is offline. Find the damaged engineering relay and pass its load test first, cadet.'];
      if (campaign.repaired) actions = button('start-training', campaign.trained ? 'Practice again' : 'Enter simulator', true);
    }
    if (dialog === 'qualified') {
      title = 'Cleared for your first launch'; speaker = 'FLIGHT INSTRUCTOR'; role = 'Qualification confirmed'; portrait = 'AI';
      pages = ['Navigation, gunnery, and defensive shielding—all passed. You have earned your place at the controls, Space Cadet.', 'Take the right-hand door into the hangar. The Sparrow is waiting. Recover the amber supply pod, then stop the salvage machine blocking our route. We will bring you home if anything goes wrong.'];
    }
    if (dialog === 'ship') {
      title = 'SP-01 / Sparrow trainer'; speaker = 'HANGAR CHIEF'; role = 'Launch control'; portrait = 'H';
      pages = campaign.trained ? ['She is small, but she will look after you. One hundred hull, a rechargeable shield, and a pulse laser. Your qualification is already loaded into her flight computer.', 'The supply pod is somewhere in the outer belt. Fly close to recover it, keep moving through hostile fire, and watch for Scrap Maw. Ready when you are, cadet.'] : ['Hold there, recruit. This ship needs a qualified pilot. Repair the relay and finish the simulator next door, then come back to me.'];
      if (campaign.trained) actions = button('launch', campaign.checkpoint === 'boss' ? 'Resume boss checkpoint' : 'Launch First Sortie', true);
    }
    if (dialog === 'failed') {
      title = 'You are safe, cadet'; speaker = 'RESCUE CONTROL'; role = 'Emergency retrieval complete'; portrait = 'R';
      pages = ['We have you. The rescue tug brought you and the Sparrow back in one piece. Take a breath—we can repair a ship.', `Your sortie score was ${flight?.score || 0}. ${campaign.checkpoint === 'boss' ? 'The pod is secure. We saved your approach to Scrap Maw, so you can resume at the boss.' : 'A fresh hull and a full shield are waiting for your next attempt.'}`];
      actions = button('retry', 'Try again', true) + button('home', 'Return to hangar');
    }
    if (dialog === 'complete') {
      title = 'First Launch / Mission complete'; speaker = 'COMMANDER SOL'; role = 'Aurora command'; portrait = 'S';
      pages = ['The supply crew is safe, and Scrap Maw is scrap metal. That was a fine first flight, Ensign.', `Your score: ${flight?.score || 0}. There is something strange in the recovered manifest—a blockade order with a forged signature. We will investigate that in the next chapter. For now, come home. Your progress is saved; this preview does not award wallet coins.`];
      actions = button('home', 'Return to the Aurora', true);
    }
    if (dialog === 'restart') {
      title = 'Begin a new adventure?'; role = 'Personal campaign record';
      pages = ['Starting over clears your Space Cadet preview progress on this device. Your character and wallet will stay as they are. Shall we reset your cadet record?'];
      actions = button('confirm-restart', 'Start over') + button('close', 'Keep playing', true);
    }
    if (!pages.length) pages = ['Standing by, cadet.'];
    const key = `${dialog}:${dialog === 'relay' ? relayJob.stage : ''}`;
    if (!dialogue || dialogue.key !== key) dialogue = { key, pages, page: 0, startedAt: Date.now(), revealed: false };
    const focusedCommand = el.contains(document.activeElement) ? document.activeElement?.dataset?.scCommand : '';
    el.innerHTML = `<div class="sc-message-header"><span class="sc-portrait" data-portrait="${portrait}" aria-hidden="true">${portrait}</span><div><div class="sc-message-speaker">${speaker}</div><small>${role}</small></div><span class="sc-message-counter">${dialogue.page + 1} / ${pages.length}</span></div><h3>${title}</h3><div class="sc-message-scroll" data-typing="true"><span data-sc-message aria-hidden="true"></span><span class="sc-reading-text" aria-live="polite" aria-atomic="true">${dialogue.pages[dialogue.page]}</span></div><div class="sc-message-footer"><span>TRANSMISSION / ${mode === 'hub' ? 'AURORA INTERNAL' : 'FLIGHT CHANNEL'}</span>${button('dialogue-next', 'Show full message ▸')}</div><div data-sc-final hidden>${extra}<div class="sc-dialog-actions">${actions}${!['failed', 'complete', 'restart'].includes(dialog) ? button('close', 'Back to game') : ''}</div></div>`;
    updateDialogue();
    const focus = focusedCommand ? el.querySelector(`[data-sc-command="${focusedCommand}"]:not(:disabled)`) : null;
    const next = el.querySelector('[data-sc-command="dialogue-next"]');
    (focus || (!next.disabled ? next : el.querySelector('[data-sc-final] button')))?.focus({ preventScroll: true });
  }
  function updateHud() {
    if (!canvas) return;
    const flying = mode !== 'hub', near = !flying ? C.nearby(campaign) : null;
    const drill = mode === 'training' ? ({ navigate: `Navigation drill · ${training.beacons}/3 beacons · Fly into the marked circle`, gunnery: `Gunnery drill · ${training.hits}/3 targets · Line up and hold Fire`, shield: `Shield drill · ${training.blocks}/2 pulses blocked · Hold Shield before impact` })[training.stage] : '';
    const status = paused ? 'Paused. Select Resume to continue.' : dialog && banner ? banner : drill || (flying ? (mode === 'flight' ? `${flight.boss ? 'SCRAP MAW' : 'FIRST SORTIE'} · Hull ${Math.ceil(flight.hull)} · Shield ${Math.ceil(flight.shield)} · ${flight.rescued ? 'Supply pod recovered' : 'Fly close to the amber supply pod'}${flight.rapid ? ' · RAPID FIRE' : ''}` : 'Mission debrief ready below the controls.') : near ? `E / Interact: ${near.label}` : (banner || 'Head through the marked doors. Approach a console to interact.'));
    const location = mode === 'training' ? 'Flight academy / Safe simulator' : flying ? 'Outer belt / First Sortie' : C.ROOMS[campaign.room].title;
    const signature = [status, location, campaign.repaired, campaign.trained, campaign.rescued, campaign.completed, dialog, saveFailed].join('|');
    if (signature === lastHud) return; lastHud = signature;
    canvas.closest('.sc-game')?.setAttribute?.('data-dialog', String(Boolean(dialog)));
    document.getElementById('scLocation').textContent = location;
    document.getElementById('scRank').textContent = `${campaign.completed ? 'ENSIGN' : campaign.trained ? 'CADET' : 'RECRUIT'} / AURORA`;
    // Numeric HUD updates are visual; do not announce hull changes every frame.
    const statusNode = document.getElementById('scStatus'); statusNode.setAttribute('aria-live', mode === 'flight' && !paused ? 'off' : 'polite'); statusNode.textContent = status;
    document.getElementById('scObjective').textContent = C.objective(campaign);
    document.getElementById('scChecklist').innerHTML = [['Power relay', campaign.repaired], ['Flight qualification', campaign.trained], ['Supply pod rescue', campaign.rescued], ['Scrap Maw defeated', campaign.completed]].map(([label, done], i) => `<li class="${done ? 'sc-done' : ''}"><span>${done ? '✓' : `0${i + 1}`}</span>${label}</li>`).join('');
    document.getElementById('scPause').textContent = paused ? 'Resume' : 'Pause';
    document.getElementById('scInteract').hidden = flying;
    document.getElementById('scFire').hidden = !flying;
    document.getElementById('scShield').hidden = !flying;
    document.getElementById('scSave').textContent = saveFailed ? 'Progress could not be saved. Allow browser storage to resume later.' : 'Personal progress saves on this device. Preview missions do not award or spend wallet coins.';
  }
  function r(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function text(value, x, y, color = '#bcdceb', size = 6) { ctx.fillStyle = color; ctx.font = `bold ${size}px monospace`; ctx.textAlign = 'left'; ctx.fillText(value, Math.round(x), Math.round(y)); }
  function panel(x, y, w, h, color = '#5b778e') { r(x, y, w, h, '#14273d'); r(x + 2, y + 2, w - 4, h - 4, color); r(x + 2, y + 2, w - 4, 2, '#accbda'); r(x + 3, y + h - 4, w - 6, 2, '#33495c'); }
  function screen(x, y, w, h) { panel(x, y, w, h, '#12334e'); r(x + 3, y + 3, w - 6, h - 6, '#12637f'); r(x + 5, y + 5, w - 12, 2, '#43dcf3'); for (let i = 0; i < 3; i++) r(x + 5, y + 10 + i * 4, Math.max(3, (w - 12) / (i + 1)), 1, '#80e9ed'); }
  function stars(t = 0, flightView = false) {
    r(0, 0, 480, 270, '#0b1330');
    for (let i = 0; i < 95; i++) { const x = (i * 137 + 19) % 480, y = ((i * 71) % 270 + (flightView ? t * (5 + i % 3 * 4) : 0)) % 270; r(x, y, i % 9 ? 1 : 2, 1, i % 3 ? '#6b87b3' : '#d2e4ed'); }
  }
  function plant(x, y) { r(x, y + 8, 11, 9, '#b36c39'); r(x + 1, y + 8, 9, 2, '#e1a65d'); r(x + 4, y, 3, 10, '#40885c'); r(x - 2, y + 2, 7, 5, '#6aa672'); r(x + 5, y - 2, 7, 6, '#92bb7b'); }
  function ship(x, y, scale = 1, heavy = false, time = 0) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
    const hull = heavy ? '#6387b8' : '#d7eaf0';
    r(-5, -21, 10, 34, '#182c48'); r(-3, -23, 6, 32, hull); r(-10, -8, 20, 24, hull); r(-17, 0, 8, 17, '#81a4bd'); r(9, 0, 8, 17, '#81a4bd'); r(-19, 9, 5, 11, '#d7eaf0'); r(14, 9, 5, 11, '#d7eaf0'); r(-3, -15, 6, 14, '#12647f'); r(-2, -14, 3, 9, '#53e5ed'); r(-12, 2, 3, 13, '#345573'); r(9, 2, 3, 13, '#345573'); r(-8, 9, 16, 3, '#ffbd59'); r(-13, 18, 5, 4, '#ff722b'); r(8, 18, 5, 4, '#ff722b');
    if (time) { const length = 5 + Math.floor(time * 13) % 4; r(-12, 22, 3, length, '#ffbd59'); r(9, 22, 3, length, '#ffbd59'); }
    ctx.restore();
  }
  function prop(p, t) {
    const { x, y, w, h, kind } = p;
    r(x + 3, y + h - 1, w, 5, '#283d50');
    if (kind === 'bunk') { panel(x, y, w, h, '#bcdceb'); r(x + 5, y + 5, w - 10, h - 12, '#1c6888'); r(x + 7, y + 7, w - 14, 15, '#d8eced'); r(x + 7, y + 28, w - 14, 19, '#2eaac0'); r(x + 7, y + 49, w - 14, 17, '#23839c'); r(x + 2, y + 15, 3, 50, '#405975'); r(x + 2, y + 34, 9, 3, '#bddae5'); r(x + 2, y + 49, 9, 3, '#bddae5'); }
    if (kind === 'desk' || kind === 'training') { panel(x, y + 14, w, h - 14, '#a4c6d7'); screen(x + 7, y, w / 2, 24); screen(x + w / 2 + 9, y + 3, w / 3 - 7, 20); r(x + 17, y + 28, 27, 5, '#26475e'); panel(x + w / 2 - 8, y + h - 9, 20, 19); }
    if (kind === 'kitchen') { panel(x, y, w, h, '#a6c4d3'); screen(x + w - 28, y + 4, 23, 28); r(x + 4, y + 4, 32, 18, '#304b62'); r(x + 9, y + 7, 8, 8, '#ec9b4f'); r(x + 24, y + 7, 8, 8, '#ec9b4f'); r(x + 45, y + 7, 29, 15, '#435c6d'); r(x + 51, y + 3, 3, 12, '#e5f2ed'); for (let i = 0; i < 3; i++) panel(x + 4 + i * 30, y + 25, 27, 13, '#68889d'); }
    if (kind === 'table') { panel(x, y, w, h, '#bdd8e1'); r(x + 15, y + 12, 16, 10, '#cf8a4d'); r(x + 18, y + 14, 11, 5, '#ffd77b'); r(x + 41, y + 9, 6, 8, '#fff1d0'); panel(x - 10, y + 5, 9, 19, '#b1514f'); panel(x + w + 1, y + 5, 9, 19, '#b1514f'); }
    if (kind === 'locker' || kind === 'crates') { for (let i = 0; i < 2; i++) { panel(x + i * (w / 2), y, w / 2 - 2, h, '#5e8095'); r(x + 7 + i * w / 2, y + 3, 4, h - 6, '#d2a258'); } }
    if (kind === 'relay') { panel(x, y, w, h, '#365a71'); for (let i = 0; i < 3; i++) { panel(x + 7 + i * 26, y + 7, 20, 34, '#243c50'); r(x + 11 + i * 26, y + 12, 12, 5, campaign.repaired ? '#73dfba' : '#d99051'); for (let j = 0; j < 3; j++) r(x + 12 + i * 26, y + 23 + j * 4, 10, 1, '#84a8b4'); } }
    if (kind === 'reactor') { panel(x, y, w, h, '#2b435b'); r(x + 9, y + 7, w - 18, h - 14, '#192d49'); r(x + 22, y + 12, 40, h - 24, '#24647a'); r(x + 32, y + 15, 20, h - 30, campaign.repaired ? '#53d8e1' : '#bd8351'); for (let i = 0; i < 4; i++) r(x + 12, y + 8 + i * 12, 61, 3, '#718da3'); }
    if (kind === 'ship') { r(x - 8, y - 7, w + 16, h + 14, '#466178'); r(x - 4, y - 3, w + 8, h + 6, '#294057'); for (let i = 0; i < 8; i++) r(x + i * 16, y + h, 8, 4, '#e6b254'); ship(x + w / 2, y + h / 2, 1.7, false, 0); text('SP-01  SPARROW', x + 16, y + h + 21, '#a2c1cf', 6); }
  }
  function cadet(x, y, time, character, facing, moving) {
    const c = character || {}, skin = c.skinColor || '#dba77e', hair = c.hairColor || '#362c31', suit = c.shirtColor || '#36a4b5';
    const step = moving && !reducedMotion.matches ? Math.floor(time * 10) % 2 * 2 : 0;
    x = Math.round(x); y = Math.round(y);
    r(x - 9, y - 1, 18, 3, '#2b4254'); r(x - 6, y - 9, 5, 9 - step, c.pantsColor || '#2d405c'); r(x + 1, y - 9, 5, 7 + step, c.pantsColor || '#2d405c'); r(x - 7, y - 2 - step, 6, 3, '#17273b'); r(x + 1, y - 2 + step, 6, 3, '#17273b'); r(x - 8, y - 22, 16, 14, '#1e3448'); r(x - 6, y - 21, 12, 12, suit); r(x - 10, y - 20, 4, 11, suit); r(x + 6, y - 20, 4, 11, suit); r(x - 10, y - 11, 4, 4, skin); r(x + 6, y - 11, 4, 4, skin); r(x - 4, y - 15, 3, 4, '#e1edf1'); r(x + 2, y - 19, 2, 3, '#ffbd59');
    r(x - 7, y - 34, 14, 13, '#182b3d'); r(x - 5, y - 32, 10, 11, skin);
    if (c.type === 'robot') { r(x - 6, y - 32, 12, 11, '#92afc3'); r(x - 4, y - 28, 8, 3, '#36d8f2'); }
    else { if (c.hair !== 'bald') { r(x - 6, y - 35, 12, 5, hair); r(x - 7, y - 31, 3, 6, hair); } if (facing !== 'up') { r(x + (facing === 'left' ? -4 : 1), y - 28, 2, 2, '#233348'); } else r(x - 5, y - 32, 10, 8, hair); }
    if (c.type === 'cat') { r(x - 7, y - 38, 4, 6, skin); r(x + 3, y - 38, 4, 6, skin); r(x + 10, y - 18, 3, 12, skin); }
    if (c.hat && c.hat !== 'none') { r(x - 6, y - 37, 12, 4, c.accessoryColor || '#e6ad5d'); r(x - 8, y - 34, 16, 2, c.accessoryColor || '#e6ad5d'); }
  }
  function drawHub(t) {
    stars(); r(12, 10, 456, 246, '#263b50'); r(16, 14, 448, 238, '#7895a9'); r(20, 18, 440, 230, '#506d84');
    for (let y = 110; y < 248; y += 24) for (let x = 20; x < 460; x += 24) { r(x, y, 23, 23, (x + y) % 48 ? '#536e83' : '#567288'); r(x + 1, y + 1, 22, 1, '#658196'); }
    r(20, 18, 440, 88, '#6b899e'); r(20, 18, 440, 4, '#233e56'); r(26, 25, 428, 3, '#db9350'); r(26, 28, 428, 2, '#ffc274'); r(20, 106, 440, 4, '#bed5dd'); r(20, 110, 440, 3, '#354f67');
    if (campaign.room === 'quarters') { panel(237, 42, 51, 43, '#1c3154'); for (let i = 0; i < 9; i++) r(242 + (i * 13) % 40, 49 + (i * 17) % 28, 1, 1, '#d7ebef'); plant(106, 79); plant(438, 94); text('AURORA / CREW 03', 32, 48, '#263d55', 7); }
    else if (campaign.room === 'engineering') { text('SYSTEMS / FLIGHT ACADEMY', 34, 46, '#d7edf0', 7); r(131, 83, 55, 5, campaign.repaired ? '#64c4bf' : '#b77c52'); r(286, 83, 56, 5, campaign.repaired ? '#64c4bf' : '#b77c52'); }
    else { text('AURORA / HANGAR 01', 32, 48, '#d6e7ee', 7); for (let i = 0; i < 12; i++) r(80 + i * 28, 235, 15, 4, '#ddaa56'); }
    const room = C.ROOMS[campaign.room];
    for (const door of room.doors) { const x = door.side === 'left' ? 12 : 453; r(x, 136, 15, 64, '#1c344b'); r(x + 3, 141, 9, 54, '#328098'); r(x + 5, 146, 3, 44, '#60cfdb'); text(door.side === 'left' ? '<' : '>', x + 4, 174, '#d4ffff', 8); text(door.label, door.side === 'left' ? 28 : 388, 211, '#c1dbe3', 5); }
    for (const p of room.props) if (p.y + p.h < campaign.y) prop(p, t);
    const moving = ['up', 'down', 'left', 'right'].some(k => held.has(k)) && !paused && !dialog;
    cadet(campaign.x, campaign.y, t, APP.player?.character, campaign.facing, moving);
    for (const p of room.props) if (p.y + p.h >= campaign.y) prop(p, t);
    const near = C.nearby(campaign);
    for (const station of room.stations) { const bright = near?.id === station.id; r(station.x - 5, station.y - 4, 10, 2, bright ? '#ffcf7a' : '#8cbdcf'); r(station.x - 5, station.y, 2, 3, bright ? '#ffcf7a' : '#8cbdcf'); r(station.x + 3, station.y, 2, 3, bright ? '#ffcf7a' : '#8cbdcf'); }
    if (near) { const w = Math.min(260, near.label.length * 4 + 28); r(240 - w / 2, 250, w, 15, '#0e2339'); text(`E  ${near.label.toUpperCase()}`, 248 - w / 2, 260, '#f7cf87', 6); }
  }
  function drawFlight(t) {
    stars(flight.time, !reducedMotion.matches);
    // A quiet, hard-edged planet stays behind the combat lanes.
    r(406, 224, 74, 46, '#183c6b'); r(422, 212, 58, 12, '#265b8b'); r(439, 207, 41, 5, '#5188ac'); r(420, 230, 20, 9, '#387c9d');
    for (const h of flight.hazards) {
      if (h.kind === 'asteroid') { r(h.x - 12, h.y - 9, 24, 18, '#4e596d'); r(h.x - 8, h.y - 14, 14, 27, '#637183'); r(h.x - 6, h.y - 8, 7, 6, '#86929d'); r(h.x + 4, h.y + 3, 7, 6, '#354358'); }
      else { r(h.x - 15, h.y - 6, 30, 8, '#9061b7'); r(h.x - 10, h.y - 3, 20, 15, '#5a4385'); r(h.x - 3, h.y - 10, 6, 23, '#c28cde'); r(h.x - 2, h.y - 4, 4, 8, '#61dce8'); }
    }
    for (const b of flight.bullets) { r(b.x - 1, b.y - 5, 3, 10, '#43d8ed'); r(b.x, b.y - 4, 1, 7, '#d6ffff'); }
    for (const b of flight.shots) { r(b.x - 2, b.y - 3, 5, 7, '#ff722b'); r(b.x - 1, b.y - 2, 3, 4, '#ffd477'); }
    if (flight.pod) { panel(flight.pod.x - 11, flight.pod.y - 9, 22, 18, '#c28e51'); r(flight.pod.x - 3, flight.pod.y - 11, 6, 22, '#ffe0a0'); text('RESCUE', flight.pod.x - 15, flight.pod.y + 20, '#ffe0a0', 5); }
    for (const p of flight.pickups) { panel(p.x - 7, p.y - 7, 14, 14, '#195a66'); text(p.kind === 'rapid' ? 'R' : '+', p.x - 3, p.y + 3, '#b3f9d6', 8); }
    if (flight.boss) {
      const b = flight.boss, x = Math.round(b.x), y = b.y;
      panel(x - 45, y - 24, 90, 40, '#55647b'); panel(x - 20, y - 33, 40, 55, '#6c8194'); r(x - 13, y - 25, 26, 7, '#d89e4e'); r(x - 8, y + 4, 16, 15, b.hp <= 0 ? '#23334a' : '#b477ec'); r(x - 4, y + 7, 8, 8, '#edbfff');
      for (const side of [-1, 1]) { r(x + side * 43 - 7, y - 7, 14, 38, '#8396a7'); r(x + side * 48 - 5, y + 16, 10, 22, '#db9250'); r(x + side * 39 - 7, y + 32, 14, 6, '#c7b17b'); }
      text('SCRAP MAW', 190, 12, '#d4bae8', 7); r(140, 16, 200, 4, '#273651'); r(140, 16, Math.max(0, b.hp) / 80 * 200, 4, '#a56bdd');
    }
    if (!flight.invulnerable || Math.floor(t * 12) % 2) ship(flight.x, flight.y, .7, false, t);
    if (flight.shieldActive) { ctx.strokeStyle = '#78e5ef'; ctx.lineWidth = 2; ctx.strokeRect(Math.round(flight.x - 18), Math.round(flight.y - 20), 36, 38); }
    text('HULL', 10, 12, '#bcdceb', 6); r(10, 17, 70, 4, '#28384e'); r(10, 17, flight.hull * .7, 4, '#ffbd59'); text('SHIELD', 10, 31, '#bcdceb', 6); r(10, 36, 70, 4, '#28384e'); r(10, 36, flight.shield * .7, 4, '#36d8f2');
    if (!flight.boss) text('RECOVER THE SUPPLY POD', 166, 14, '#ffcf86', 6);
  }
  function drawTraining(t) {
    r(0, 0, 480, 270, '#0b1d30');
    for (let x = 0; x < 480; x += 24) r(x, 32, 1, 238, '#15364b');
    for (let y = 32; y < 270; y += 24) r(0, y, 480, 1, '#15364b');
    const f = training;
    const title = { navigate: '01 / NAVIGATION', gunnery: '02 / GUNNERY', shield: '03 / DEFENSIVE SHIELDING' }[f.stage] || 'QUALIFIED';
    text(title, 16, 18, '#bceef4', 9); text('SAFE TRAINING · NO HULL DAMAGE', 290, 18, '#719eaf', 6);
    if (f.stage === 'navigate') {
      const beacon = C.TRAINING_BEACONS[f.beacons];
      ctx.strokeStyle = '#6fdbc7'; ctx.lineWidth = 2;
      ctx.strokeRect(beacon.x - 18, beacon.y - 18, 36, 36);
      r(beacon.x - 5, beacon.y - 1, 10, 2, '#b8f4d6'); r(beacon.x - 1, beacon.y - 5, 2, 10, '#b8f4d6');
      text(`BEACON ${f.beacons + 1}/3`, beacon.x - 21, beacon.y - 24, '#c6ffe1', 6);
    }
    for (const target of f.targets) {
      if (f.stage !== 'gunnery' || !target.hp) continue;
      panel(target.x - 13, target.y - 12, 26, 24, '#4c6a83');
      r(target.x - 7, target.y - 6, 14, 12, '#d4a95d'); r(target.x - 3, target.y - 2, 6, 4, '#fff0b9');
    }
    for (const b of f.bullets) r(b.x - 1, b.y - 5, 3, 9, '#65e5f2');
    for (const b of f.shots) { r(b.x - 4, b.y - 3, 8, 6, '#e4ad5b'); r(b.x - 2, b.y - 2, 4, 4, '#ffebbf'); }
    ship(f.x, f.y, .7, false, reducedMotion.matches ? 0 : t);
    if (f.shieldActive) { ctx.strokeStyle = '#78e5ef'; ctx.lineWidth = 2; ctx.strokeRect(Math.round(f.x - 18), Math.round(f.y - 20), 36, 38); }
    if (f.stage === 'shield') { text('SHIELD ENERGY', 16, 249, '#a1e8ed', 6); r(16, 254, 100, 4, '#2c4456'); r(16, 254, f.shield, 4, '#36d8f2'); text(`PULSES BLOCKED ${f.blocks}/2`, 310, 254, '#b8f4d6', 7); }
  }
  function draw(t) {
    if (mode === 'hub') drawHub(t); else if (mode === 'training') drawTraining(t); else drawFlight(t);
    if (paused) { r(120, 107, 240, 50, '#0e213a'); text('MISSION PAUSED', 176, 129, '#d7eef6', 12); text('SELECT RESUME TO CONTINUE', 170, 145, '#8daec9', 6); }
  }
  registry.registerActivity('space-cadet', { createInitialState: () => ({ chapter: 'first-launch', version: 1 }), render: renderGame });
  registry.registerAction('start-space-cadet', () => startActivityById('space-cadet'));
  root.SpaceCadet = { sync, stop, beforeRender() { restoreFocus = active() && document.activeElement === canvas; } };
})(window);
