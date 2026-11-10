(function (root) {
  const core = root.TeamBuilderCommunityPlazaCore;
  const { escape, avatar, seedFor, status } = core;
  const ui = { accessOpen: false, reason: '' };
  function hostAccess() {
    if (APP.preferences.enableCommunityLobby === false || canCurrentUserCreateCommunityRooms()) return '';
    const request = normalizeCommunityHostRequests(APP.community.requests || [])[0], state = request?.status;
    if (state === 'pending' || state === 'approved') ui.reason = '';
    return `<details id="communityHostAccess" class="plaza-access" ${ui.accessOpen ? 'open' : ''}><summary><span>Want to bring everyone together?</span><span>${state === 'pending' ? 'Host request pending' : state === 'approved' ? 'Hosting approved' : 'Request host access'} ↗</span></summary><div class="plaza-access-body"><h3>Host your own room</h3><p>Anyone can join. To open a public room, request host access from an admin.</p>${APP.community.requestsLoading ? '<p role="status">Checking your request…</p>' : ''}${request ? `<p class="plaza-request-status">Latest request: <strong>${escape(state)}</strong>${request.adminNotes ? ` · ${escape(request.adminNotes)}` : ''}</p>` : ''}${state === 'pending' ? '<p>Your request is waiting for admin review. You can keep exploring the plaza.</p>' : state === 'approved' ? '<p>Your profile is approved. Refresh the plaza to update your hosting access.</p>' : `<label for="communityHostAccessReason">What would you like to host?</label><textarea id="communityHostAccessReason" class="plaza-input" maxlength="400" rows="3" placeholder="Tell us about the games or gatherings you have in mind.">${escape(ui.reason)}</textarea><button class="plaza-button" data-action="submit-community-host-access-request" ${APP.community.requestSubmitting ? 'disabled aria-busy="true"' : ''}>${APP.community.requestSubmitting ? 'Sending request…' : state === 'denied' ? 'Request again' : 'Send host request'}</button>`}</div></details>`;
  }
  function renderRoom(room) {
    const state = status(room), count = Math.max(0, Number(room.participantCount) || 0), max = Math.max(2, Number(room.maxParticipants) || 24);
    const available = Math.max(0, max - count), activity = ACTIVITY_QUEUE_ITEM_MAP[room.currentActivity];
    const preview = (room.avatarPreview || []).slice(0, 5), manage = canCurrentUserManageCommunityRoom(room), joining = APP.community.joiningCode === room.code;
    const current = APP.roomCode === room.code;
    const colors = ['mint', 'peach', 'lavender', 'sky']; const palette = colors[seedFor(room.code, room.host) % colors.length];
    return `<article class="plaza-room plaza-palette-${palette}" ${core.sceneAttributes(room.communityTheme)} aria-label="${escape(room.title)}">
      <div class="plaza-room-scene"><span class="plaza-room-status plaza-status-${state}"><i aria-hidden="true"></i>${state === 'open' ? 'Open · come on in' : state === 'full' ? 'Room full' : 'Game in progress'}</span>${room.voiceEnabled ? '<span class="plaza-voice">Voice on</span>' : ''}<div class="plaza-room-avatars" aria-hidden="true">${preview.length ? preview.map(person => avatar(person.seed, person.avatar, '', person.character)).join('') : count ? avatar(seedFor(room.code, room.host), '') : '<span class="plaza-empty-seat">A little room for your next big idea.</span>'}${count > preview.length && preview.length ? `<span class="plaza-more-people">+${count - preview.length}</span>` : ''}</div><div class="plaza-room-floor"></div></div>
      <div class="plaza-room-body"><div class="plaza-room-heading"><h3>${escape(room.title || `${room.host}’s room`)}</h3><span class="plaza-room-count" aria-label="${count} of ${max} people">${count}<span>/${max}</span></span></div><p class="plaza-host">Hosted by ${escape(room.host || 'a community host')}</p><p class="plaza-room-description">${escape(room.description || 'A place to meet, play, and see what happens next.')}</p><div class="plaza-room-tags">${room.communityTheme?.name ? `<span>${escape(room.communityTheme.name)}</span>` : ''}<span>${escape(activity?.icon || (room.currentActivity ? '🎮' : '☕'))} ${escape(activity?.label || (room.currentActivity ? 'Playing together' : 'Hanging out'))}</span>${room.queueLength ? `<span>${Number(room.queueLength)} games lined up</span>` : ''}</div><div class="plaza-capacity"><span aria-hidden="true"><i style="width:${Math.min(100, count / max * 100)}%"></i></span><small>${state === 'full' ? 'All seats taken' : `${available} ${available === 1 ? 'spot' : 'spots'} available`}</small></div>${state === 'in_game' ? '<p class="plaza-join-note">Join the room now; player seats depend on the game.</p>' : ''}<button class="plaza-button plaza-join" data-action="${current ? 'plaza-return' : 'join-community-room'}" data-room-code="${escape(room.code)}" ${(!current && state === 'full') || APP.community.joiningCode || APP.preferences.enableCommunityLobby === false ? 'disabled' : ''} ${joining ? 'aria-busy="true"' : ''} aria-label="${current ? 'Return to session:' : state === 'full' ? 'Room full:' : 'Join session:'} ${escape(room.title)}">${joining ? 'Joining…' : current ? 'Return to room' : state === 'full' ? 'Room full' : APP.roomCode ? 'Switch to session' : 'Join session'}<span aria-hidden="true">${state === 'full' ? '○' : '→'}</span></button>${manage ? `<details class="plaza-manage"><summary>Manage your room</summary><div><button class="plaza-text-button" data-action="plaza-edit-theme" data-room-code="${escape(room.code)}">Customize lobby</button><button class="plaza-text-button" data-action="edit-community-room" data-room-code="${escape(room.code)}">Edit room</button><button class="plaza-text-button" data-action="remove-community-room" data-room-code="${escape(room.code)}">Remove room</button><span>Code ${escape(room.code)}</span></div></details>` : ''}</div>
    </article>`;
  }
  function renderDirectory() {
    const state = APP.community, enabled = APP.preferences.enableCommunityLobby !== false, canHost = canCurrentUserCreateCommunityRooms();
    const rooms = enabled && Array.isArray(state.rooms) ? state.rooms : [], visible = core.filterRooms(rooms, state.filter, state.search, ACTIVITY_QUEUE_ITEM_MAP);
    const open = rooms.filter(room => status(room) === 'open').length, people = rooms.reduce((sum, room) => sum + (Number(room.participantCount) || 0), 0);
    const preview = rooms.flatMap(room => (room.avatarPreview || []).map(person => ({ ...person, roomCode: room.code }))).slice(0, 5);
    const ownAvatar = avatar(seedFor('plaza', APP.player.id), APP.player.avatar, 'plaza-avatar-you', APP.player.character);
    return `<section class="community-plaza" aria-label="Community Lobby"><nav class="plaza-nav" aria-label="Community navigation"><button class="plaza-back" data-action="go-screen" data-screen="dashboard">← My dashboard</button><span>Team Builder <span aria-hidden="true">/</span> Community</span><button class="plaza-refresh" data-action="refresh-community-rooms" ${state.loading || state.refreshing ? 'disabled aria-busy="true"' : ''}>${state.loading || state.refreshing ? 'Refreshing…' : '↻ Refresh'}</button></nav>
      <header class="plaza-hero"><div class="plaza-hero-copy"><p class="plaza-eyebrow">A little hello. A lot of possibility.</p><h1>Meet you <br>in the plaza.</h1><p>Find a room. Say hello. Make a little fun together.</p><div class="plaza-hero-actions"><button class="plaza-button" data-action="${canHost ? 'create-community-room' : 'plaza-host-access'}" ${!enabled ? 'disabled' : ''}>＋ Host a room</button><a href="#plazaSessions" class="plaza-browse" data-action="plaza-browse">Explore sessions ↓</a></div><button class="plaza-character-link" data-action="open-character-creator">${APP.player.character ? 'Edit your character' : 'Create your character'} →</button><div class="plaza-live-stats"><span><i aria-hidden="true"></i><strong>${open}</strong> open ${open === 1 ? 'room' : 'rooms'}</span><span><strong>${people}</strong> people in rooms</span></div></div><div class="plaza-hero-scene" aria-hidden="true"><span class="plaza-cloud plaza-cloud-one"></span><span class="plaza-cloud plaza-cloud-two"></span><div class="plaza-hello">${escape(preview.length ? 'Hey, come join us!' : 'Your next hello starts here.')}</div><div class="plaza-hero-floor"></div><div class="plaza-hero-friends">${preview.map((person, index) => `<div style="--friend:${index}">${avatar(person.seed, person.avatar, '', person.character)}</div>`).join('')}${ownAvatar}</div><span class="plaza-you-label">You’re here ✦</span></div></header>
      ${!enabled ? '<div class="plaza-notice" role="status">The community lobby is currently turned off by the admin.</div>' : ''}
      ${APP.roomCode && APP.room ? `<div class="plaza-current-room"><span>You have a seat in <strong>${escape(APP.room.communityTitle || APP.roomCode)}</strong>.</span><button class="plaza-text-button" data-action="plaza-return">Return to your room →</button></div>` : ''}
      <section id="plazaSessions" class="plaza-sessions" aria-label="Browse community sessions"><div class="plaza-section-heading"><div><p class="plaza-eyebrow">Find your next good time</p><h2>Open sessions</h2></div><span class="plaza-updated">${state.lastLoadedAt ? `Updated ${escape(new Date(state.lastLoadedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}` : 'Fresh faces welcome'}</span></div><div class="plaza-toolbar"><div class="plaza-filters" role="group" aria-label="Filter sessions">${[['all','All rooms'],['open','Ready to join'],['playing','Playing now'],['voice','Voice on']].map(([key, label]) => `<button data-action="plaza-filter" data-filter="${key}" aria-pressed="${(state.filter || 'all') === key}">${label}</button>`).join('')}</div><label class="plaza-search"><span aria-hidden="true">⌕</span><span class="plaza-sr-only">Search sessions by room, host, or game</span><input id="communitySearch" type="search" placeholder="Find a room, host, or game" value="${escape(state.search || '')}" autocomplete="off"></label></div>
      ${state.error ? `<div class="plaza-notice" role="alert">${escape(state.error)} <button class="plaza-text-button" data-action="refresh-community-rooms">Try again</button></div>` : ''}
      <p class="plaza-results-count" role="status" aria-live="polite">${state.loading && !rooms.length ? 'Finding your next room…' : `${visible.length} ${visible.length === 1 ? 'session' : 'sessions'}${state.search ? ` matching “${escape(state.search)}”` : ''}`}</p>
      <div class="plaza-room-grid">${state.loading && !rooms.length ? Array.from({ length: 3 }, () => '<div class="plaza-room plaza-skeleton" aria-hidden="true"><div></div><span></span><span></span></div>').join('') : visible.length ? visible.map(renderRoom).join('') : `<div class="plaza-empty">${ownAvatar}<h3>${rooms.length ? 'No rooms in this corner… yet.' : state.error ? 'We’ll save you a spot.' : 'A quiet plaza. Endless possibilities.'}</h3><p>${rooms.length ? 'Try another filter or search for a different host or game.' : state.error ? 'Refresh when you’re ready to try connecting again.' : 'There are no public sessions right now. Host the first hello, or check back soon.'}</p>${rooms.length ? '<button class="plaza-button" data-action="plaza-clear">Show all rooms</button>' : enabled ? `<button class="plaza-button" data-action="${canHost ? 'create-community-room' : 'plaza-host-access'}">${canHost ? 'Start a room' : 'Request host access'}</button>` : ''}</div>`}</div></section>
      <section class="plaza-how" aria-label="How community sessions work"><div><span>01</span><strong>Find your crowd</strong><p>Browse open rooms and see what everyone’s playing.</p></div><div><span>02</span><strong>Say your hello</strong><p>Join the room, chat, or hop on voice when it’s available.</p></div><div><span>03</span><strong>Make a little fun</strong><p>Your host starts a game. Everyone comes back to the same room.</p></div></section>${hostAccess()}</section>`;
  }
  function renderRoomPlaza(room) {
    const people = room.participants || [], theme = core.normalizeTheme(room.communityTheme);
    const scene = core.scenes.find(item => item.id === theme.scene);
    return `<section class="plaza-room-welcome" ${core.sceneAttributes(theme)} aria-label="People in this community room"><div><p class="plaza-eyebrow">You found your people</p><h2>${escape(theme.name || scene.label)}</h2><p>Say hello in chat. Your host will start the next game.</p></div><div class="plaza-scene-art" aria-hidden="true">${scene.icon}</div><div class="plaza-member-stage">${people.slice(0, 24).map(person => `<div class="plaza-member">${avatar(seedFor(room.code, person.id || person.name), person.avatar, '', person.character)}<strong>${escape(person.name)}</strong><small>${person.name === room.host ? 'Your host' : person.id === APP.player?.id ? 'That’s you!' : 'Ready to hang out'}</small></div>`).join('')}${people.length > 24 ? `<span class="plaza-more-people">+${people.length - 24}</span>` : ''}</div></section>`;
  }
  const registry = root.TEAM_BUILDER_ACTIVITY_REGISTRY;
  registry.registerAction('plaza-edit-theme', async ({ dataset }) => {
    const code = normalizeRoomCode(dataset.roomCode || APP.roomCode);
    const token = APP.roomCode === code ? (APP.roomAccessToken || '') : getStoredRoomAccessToken(code);
    try {
      const room = await RoomManager.loadRoom(code, token);
      if (!room || !canCurrentUserManageCommunityRoom(room)) { showError('Only the host or admin can customize this lobby.'); return; }
      document.getElementById('plazaThemeDialog')?.remove();
      const theme = core.normalizeTheme(room.communityTheme), brief = normalizeContentBrief(room.contentBrief);
      const games = ACTIVITY_QUEUE_ITEMS.filter(item => APP.preferences?.enabledActivities?.[item.id] !== false);
      const selected = Array.isArray(room.communityActivities) ? room.communityActivities : games.map(item => item.id);
      const dialog = document.createElement('dialog');
      dialog.id = 'plazaThemeDialog'; dialog.className = 'plaza-theme-dialog';
      dialog.setAttribute('aria-labelledby', 'plazaThemeTitle');
      dialog.innerHTML = `<form><h2 id="plazaThemeTitle">Customize lobby</h2><p class="studio-help">Set the scene and plan what your community will play.</p>
        <label class="form-label" for="plazaScene">Lobby scene</label><select class="form-input" id="plazaScene">${core.scenes.map(scene => `<option value="${scene.id}" ${theme.scene === scene.id ? 'selected' : ''}>${scene.icon} ${scene.label}</option>`).join('')}</select>
        <label class="form-label" for="plazaThemeName">Your theme name</label><input class="form-input" id="plazaThemeName" maxlength="60" value="${escape(theme.name)}" placeholder="Friday night space club">
        <label class="form-label" for="plazaAccent">Accent color</label><input id="plazaAccent" type="color" value="${theme.accent}">
        <div class="plaza-room-welcome plaza-theme-preview" ${core.sceneAttributes(theme)}><strong>${escape(theme.name || core.scenes.find(scene => scene.id === theme.scene).label)}</strong><div class="plaza-scene-art" aria-hidden="true">${core.scenes.find(scene => scene.id === theme.scene).icon}</div></div>
        <fieldset class="plaza-game-choices"><legend>Game selections</legend><p class="studio-help">Choose the activities available in this lobby.</p>${games.map(item => `<label><input type="checkbox" name="plazaGame" value="${escape(item.id)}" ${selected.includes(item.id) ? 'checked' : ''}> ${escape(item.label)}</label>`).join('')}</fieldset>
        <label class="form-label" for="plazaQuestionTheme">Question theme</label><input class="form-input" id="plazaQuestionTheme" maxlength="160" value="${escape(brief.customTopic || brief.themePreset)}" placeholder="Movies, space, team building…">
        <label class="form-label" for="plazaAudience">Audience</label><input class="form-input" id="plazaAudience" maxlength="120" value="${escape(brief.audience)}" placeholder="Families, new teammates, trivia fans…">
        <label class="form-label" for="plazaDifficulty">Question difficulty</label><select class="form-input" id="plazaDifficulty">${['easy', 'mixed', 'hard'].map(level => `<option ${brief.difficulty === level ? 'selected' : ''}>${level}</option>`).join('')}</select>
        <p class="studio-help">Use Create themed questions in the activity library to generate questions for this theme and audience.</p>
        <p class="plaza-theme-error" role="alert"></p><div class="plaza-theme-actions"><button type="button" class="btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn-primary">Save lobby options</button></div></form>`;
      const field = id => dialog.querySelector(`#${id}`);
      const readTheme = () => core.normalizeTheme({ scene: field('plazaScene').value, name: field('plazaThemeName').value, accent: field('plazaAccent').value });
      dialog.addEventListener('input', () => {
        const next = readTheme(), scene = core.scenes.find(item => item.id === next.scene), preview = dialog.querySelector('.plaza-theme-preview');
        preview.dataset.plazaScene = next.scene; preview.style.setProperty('--plaza-accent', next.accent);
        preview.querySelector('strong').textContent = next.name || scene.label; preview.querySelector('.plaza-scene-art').textContent = scene.icon;
      });
      dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault(); const save = dialog.querySelector('[type="submit"]'); save.disabled = true;
        try {
          const latest = await RoomManager.loadRoom(code, token);
          if (!latest || !canCurrentUserManageCommunityRoom(latest)) throw new Error('Only the host or admin can customize this lobby.');
          latest.communityTheme = readTheme();
          latest.communityActivities = Array.from(dialog.querySelectorAll('[name="plazaGame"]:checked'), input => input.value);
          latest.contentBrief = normalizeContentBrief({ ...latest.contentBrief, customTopic: field('plazaQuestionTheme').value, audience: field('plazaAudience').value, difficulty: field('plazaDifficulty').value });
          await RoomManager.updateRoom(code, latest, token);
          if (APP.roomCode === code) { APP.room = normalizeRoom(latest); APP.contentStudioDraft = null; }
          dialog.close();
          if (APP.screen === 'community') await loadCommunityRooms(); else render();
        } catch (error) { dialog.querySelector('.plaza-theme-error').textContent = error.message || 'Unable to save lobby options.'; save.disabled = false; }
      };
      document.body.appendChild(dialog); dialog.showModal();
    } catch (error) { showError(error.message || 'Unable to load lobby options.'); }
  });
  registry.registerAction('plaza-filter', ({ dataset }) => { APP.community.filter = dataset.filter; render(); });
  registry.registerAction('plaza-clear', () => { APP.community.search = ''; APP.community.filter = 'all'; const input = document.getElementById('communitySearch'); if (input) input.value = ''; render(); });
  registry.registerAction('plaza-host-access', () => { ui.accessOpen = true; render(); const panel = document.getElementById('communityHostAccess'); if (panel) { panel.open = true; panel.scrollIntoView({ block: 'center', behavior: root.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); panel.querySelector('textarea')?.focus({ preventScroll: true }); } });
  registry.registerAction('plaza-browse', ({ event }) => { event.preventDefault(); document.getElementById('plazaSessions')?.scrollIntoView({ block: 'start', behavior: root.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' }); });
  registry.registerAction('join-community-room', async ({ dataset }) => {
    if (APP.community.joiningCode || APP.preferences.enableCommunityLobby === false) return;
    const room = APP.community.rooms.find(item => item.code === dataset.roomCode);
    if (!room || status(room) === 'full') return;
    APP.community.joiningCode = room.code; render();
    const previousCode = APP.roomCode, previousToken = APP.roomAccessToken || '';
    try {
      await joinRoomByCode(room.code);
      if (APP.screen === 'lobby' && APP.roomCode === room.code && previousCode && previousCode !== room.code) {
        try { await RoomManager.leaveRoom(previousCode, previousToken); } catch (_) { /* The new room is already joined; a failed old-room cleanup must not undo it. */ }
      }
      if (APP.screen === 'community') await loadCommunityRooms({ silent: true });
    }
    finally { APP.community.joiningCode = ''; if (APP.screen === 'community') render(); }
  });
  registry.registerAction('plaza-return', async () => { if (APP.roomCode) await joinRoomByCode(APP.roomCode, APP.roomAccessToken || ''); });
  document.addEventListener('input', event => { if (event.target.id === 'communityHostAccessReason') ui.reason = event.target.value; if (event.target.id === 'communitySearch') { APP.community.search = event.target.value; render(); } });
  document.addEventListener('toggle', event => { if (event.target.id === 'communityHostAccess') ui.accessOpen = event.target.open; }, true);
  root.setInterval(() => { if (typeof APP !== 'undefined' && APP.screen === 'community' && !document.hidden && !APP.community.joiningCode) void loadCommunityRooms({ silent: true }); }, 15000);
  root.TeamBuilderCommunityPlaza = { renderDirectory, renderRoomPlaza };
})(window);
