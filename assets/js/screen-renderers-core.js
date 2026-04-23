const TEAM_BUILDER_SCREEN_RENDERERS = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_SCREEN_RENDERERS.renderDashboard = function renderDashboard() {
  const safePlayerName = escapeHtml(APP.player.name);
  const safeAppName = escapeHtml(APP.branding.appName);
  const showFeedback = APP.preferences.enableFeedbackHub !== false;
  const scheduleEnabled = APP.preferences.enableScheduleMeeting !== false;
  const loadEnabled = APP.preferences.enableLoadSession !== false;
  const communityEnabled = APP.preferences.enableCommunityLobby !== false;
  const savedPlans = (APP.sessionManager?.plans?.length ? APP.sessionManager.plans : loadSessionPlans()) || [];
  const hasSavedPlans = savedPlans.length > 0;
  const sessionSetupTitle = hasSavedPlans ? 'Plan Session' : 'Session Setup';
  const sessionSetupDescription = hasSavedPlans
    ? 'Set up a session ahead of time with title, agenda, link, and activity queue'
    : 'Create your first session plan with agenda, theme, link, and activity queue';
  return `
    <div class="header">
      <h1 class="logo">${safeAppName}</h1>
    </div>
    
    <div class="player-card">
      <div class="avatar-circle">${APP.player.avatar}</div>
      <div class="player-info">
        <div class="player-name">${safePlayerName}</div>
        <div class="player-stats">
          <span class="stat">⭐ Level ${APP.player.level}</span>
          <span class="stat">✦ ${APP.player.xp} XP</span>
          <span class="stat">🎮 ${APP.player.stats.gamesPlayed} games</span>
        </div>
      </div>
      <div class="level-badge">Level ${APP.player.level}</div>
    </div>
    
    <div class="grid-2">
      <button type="button" class="card" data-action="go-screen" data-screen="create-room" aria-label="Host Session" aria-keyshortcuts="Alt+N">
        <div class="card-icon">👑</div>
        <h3 class="card-title">Host Session</h3>
        <p class="card-desc">Create a room and choose activities for your team</p>
      </button>
      
      <button type="button" class="card" data-action="go-screen" data-screen="join-room" aria-label="Join Session" aria-keyshortcuts="Alt+J">
        <div class="card-icon">🎮</div>
        <h3 class="card-title">Join Session</h3>
        <p class="card-desc">Enter a room code to join your team</p>
      </button>

      ${communityEnabled ? `
        <button type="button" class="card" data-action="go-screen" data-screen="community" aria-label="Community Lobby">
          <div class="card-icon">🌐</div>
          <h3 class="card-title">Community Lobby</h3>
          <p class="card-desc">Browse open public lobbies, join drop-in games, or host a community room</p>
        </button>
      ` : ''}

      ${scheduleEnabled ? `
        <button type="button" class="card" data-action="go-screen" data-screen="schedule-meeting" aria-label="Plan Session">
          <div class="card-icon">🗓️</div>
          <h3 class="card-title">${sessionSetupTitle}</h3>
          <p class="card-desc">${sessionSetupDescription}</p>
        </button>
      ` : ''}

      ${loadEnabled && hasSavedPlans ? `
        <button type="button" class="card" data-action="go-screen" data-screen="load-session" aria-label="Manage Sessions">
          <div class="card-icon">🗂️</div>
          <h3 class="card-title">Manage Sessions</h3>
          <p class="card-desc">Open, share, edit, or launch a saved session plan into a new room</p>
        </button>
      ` : ''}
    </div>
    
    <div style="text-align:center;margin-top:40px;">
      <button class="btn-secondary" data-action="view-stats">ℹ️ About App</button>
      <button class="btn-secondary" data-action="edit-profile" style="margin-left:10px;">✏️ Edit Profile</button>
      ${showFeedback ? '<button class="btn-secondary" data-action="open-feedback" style="margin-left:10px;" aria-keyshortcuts="Alt+F">🗣️ Feedback Hub</button>' : ''}
      <button class="btn-secondary" data-action="open-admin-console" style="margin-left:10px;" aria-keyshortcuts="Alt+A">🛠️ Admin Console</button>
    </div>
    <div style="text-align:center;margin-top:14px;color:var(--text-dim);font-size:0.85rem;">
      Keyboard: <strong>${escapeHtml(formatModifierShortcut('N'))}</strong> host, <strong>${escapeHtml(formatModifierShortcut('J'))}</strong> join, <strong>?</strong> shortcuts
    </div>
  `;
};

TEAM_BUILDER_SCREEN_RENDERERS.renderCommunityDirectory = function renderCommunityDirectory() {
  const rooms = Array.isArray(APP.community.rooms) ? APP.community.rooms : [];
  const canCreate = canCurrentUserCreateCommunityRooms();
  const communityEnabled = APP.preferences.enableCommunityLobby !== false;
  const latestRequest = normalizeCommunityHostRequests(APP.community.requests || [])[0] || null;
  const latestRequestStatus = latestRequest?.status || '';
  const requestStatusColor = latestRequestStatus === 'approved'
    ? 'var(--success)'
    : latestRequestStatus === 'denied'
      ? 'var(--danger)'
      : 'var(--warning)';
  return `
    <div class="header">
      <h1 class="logo">Community Lobby</h1>
      <p class="tagline">Public drop-in rooms built on the same lobby flow as hosted sessions</p>
    </div>

    <button class="btn-secondary" data-action="go-screen" data-screen="dashboard">← Back</button>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">
      <button class="btn-primary" data-action="create-community-room" style="width:auto;" ${(communityEnabled && canCreate) ? '' : 'disabled'}>🌐 Host Community Lobby</button>
      <button class="btn-secondary" data-action="refresh-community-rooms" style="width:auto;">↻ Refresh</button>
    </div>

    ${!communityEnabled ? `
      <div style="background:rgba(255,209,102,0.08);border:1px solid rgba(255,209,102,0.24);border-radius:16px;padding:14px 16px;margin-top:16px;color:#ffd166;">
        Community Lobby is currently disabled by admin.
      </div>
    ` : !canCreate ? `
      <div style="background:rgba(138,241,255,0.08);border:1px solid rgba(138,241,255,0.22);border-radius:16px;padding:14px 16px;margin-top:16px;color:var(--text-mid);">
        Admin access or host allowlist approval is required to create community rooms. You can still browse and join open lobbies, or request community host access below.
      </div>
    ` : ''}

    ${communityEnabled && !canCreate ? `
      <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-top:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <div>
            <h3 style="font-family:'Fraunces',serif;font-size:1.2rem;margin-bottom:4px;">Request Community Host Access</h3>
            <div style="font-size:0.84rem;color:var(--text-dim);">Ask an admin to allow your player profile to create public community lobbies.</div>
          </div>
          ${latestRequest ? `
            <span style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid var(--border);font-size:0.76rem;font-weight:800;color:${requestStatusColor};text-transform:uppercase;">
              ${escapeHtml(latestRequestStatus || 'pending')}
            </span>
          ` : ''}
        </div>
        ${latestRequest ? `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:12px;">
            <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:6px;">
              Latest request • ${escapeHtml(latestRequest.updatedAt || latestRequest.createdAt || '')}
            </div>
            <div style="color:var(--text-mid);margin-bottom:${latestRequest.adminNotes ? '8px' : '0'};">${escapeHtml(latestRequest.reason || '')}</div>
            ${latestRequest.adminNotes ? `<div style="font-size:0.84rem;color:var(--text-dim);">Admin notes: ${escapeHtml(latestRequest.adminNotes)}</div>` : ''}
          </div>
        ` : ''}
        ${APP.community.requestsLoading ? `
          <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:10px;">Loading your request status...</div>
        ` : ''}
        ${latestRequestStatus === 'pending' ? `
          <div style="font-size:0.84rem;color:var(--text-dim);">Your request is pending admin review.</div>
        ` : latestRequestStatus === 'approved' ? `
          <div style="font-size:0.84rem;color:var(--success);">Your profile is approved. Refreshing config or reopening this screen should enable community hosting for you.</div>
        ` : `
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" for="communityHostAccessReason">Why do you want community host access?</label>
            <textarea id="communityHostAccessReason" class="form-input" rows="4" maxlength="400" placeholder="Example: I run weekly drop-in game rooms and need to host public lobbies for the team."></textarea>
          </div>
          <button class="btn-secondary" data-action="submit-community-host-access-request" ${APP.community.requestSubmitting ? 'disabled aria-busy="true"' : ''} style="width:auto;">
            ${APP.community.requestSubmitting ? 'Sending...' : (latestRequestStatus === 'denied' ? 'Request Access Again' : 'Request Access')}
          </button>
        `}
      </div>
    ` : ''}

    <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:20px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:10px;">How It Works</h3>
      <div style="display:grid;gap:8px;color:var(--text-mid);line-height:1.5;">
        <div>• Join an open community lobby and hang out in the shared room.</div>
        <div>• Hosts can launch full-room games like Bingo, Trivia, Brainstorm, and Spin Wheel.</div>
        <div>• When a game ends, everyone returns to the same lobby.</div>
      </div>
    </div>

    <div style="margin-top:20px;display:grid;gap:14px;">
      ${APP.community.loading ? `
        <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:24px;color:var(--text-dim);text-align:center;">
          Loading public lobbies...
        </div>
      ` : rooms.length ? rooms.map(room => {
        const activityLabel = room.currentActivity
          ? (ACTIVITY_QUEUE_ITEM_MAP[room.currentActivity]?.label || room.currentActivity)
          : 'Lobby Open';
        const presenceLabel = room.presenceStatus === 'full'
          ? 'Full'
          : room.presenceStatus === 'in_game'
            ? 'In Game'
            : 'Open';
        const canManage = canCurrentUserManageCommunityRoom(room);
        return `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;display:grid;gap:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-family:'Fraunces',serif;font-size:1.2rem;">${escapeHtml(room.title || `${room.host || 'Host'}'s Community Lobby`)}</div>
                <div style="font-size:0.84rem;color:var(--text-dim);margin-top:4px;">Host: ${escapeHtml(room.host || 'Unknown')} • Code: ${escapeHtml(room.code || '')}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                <span style="padding:6px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:0.76rem;font-weight:800;">${escapeHtml(presenceLabel)}</span>
                <span style="padding:6px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:0.76rem;font-weight:800;">${escapeHtml(activityLabel)}</span>
                ${room.voiceEnabled ? '<span style="padding:6px 10px;border-radius:999px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.24);font-size:0.76rem;font-weight:800;color:#86efac;">Voice On</span>' : ''}
              </div>
            </div>
            ${room.description ? `<div style="color:var(--text-mid);line-height:1.5;">${escapeHtml(room.description)}</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <div style="font-size:0.84rem;color:var(--text-dim);">${escapeHtml(String(room.participantCount || 0))}/${escapeHtml(String(room.maxParticipants || 24))} players • ${escapeHtml(String(room.queueLength || 0))} queued activities</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                <button class="btn-primary" data-action="join-community-room" data-room-code="${escapeHtml(room.code || '')}" style="width:auto;" ${room.presenceStatus === 'full' ? 'disabled' : ''}>Join Lobby</button>
                ${canManage ? `<button class="btn-secondary" data-action="edit-community-room" data-room-code="${escapeHtml(room.code || '')}" style="width:auto;">Edit</button>` : ''}
                ${canManage ? `<button class="btn-secondary" data-action="remove-community-room" data-room-code="${escapeHtml(room.code || '')}" style="width:auto;border-color:rgba(255,107,107,0.3);color:#ff9c9c;">Remove</button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('') : `
        <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:24px;color:var(--text-dim);text-align:center;">
          No public community lobbies are open right now. Start one and it will appear here.
        </div>
      `}
    </div>
  `;
};

TEAM_BUILDER_SCREEN_RENDERERS.renderAboutApp = function renderAboutApp() {
  const safeAppName = escapeHtml(APP.branding.appName || 'Team Builder');
  const safeVersion = escapeHtml(APP_VERSION);
  return `
    <div class="header">
      <h1 class="logo">About App</h1>
      <p class="tagline">${safeAppName} • Version ${safeVersion}</p>
    </div>

    <button class="btn-secondary" data-action="go-screen" data-screen="dashboard">← Back</button>

    <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:20px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:10px;">General Purpose</h3>
      <p style="color:var(--text-mid);line-height:1.6;">
        A host-led team facilitation app for running collaborative sessions in one shared room, with realtime activities, voice, presentations, and lightweight planning tools.
      </p>
    </div>

    <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:16px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:10px;">Core Features</h3>
      <div style="display:grid;gap:10px;color:var(--text-mid);line-height:1.5;">
        <div>• Activity library with trivia, charades, brainstorming, card and board games, presentation tools, and queue-based facilitation.</div>
        <div>• Moderated room voice with push-to-talk, open mic, raise hand, and host controls.</div>
        <div>• Session planning with saved session plans, shareable plan links, launch-into-room flow, and downloadable calendar invites.</div>
        <div>• Presentation support through shared slide-deck URLs and the native Slides Studio slide builder.</div>
        <div>• AI generation for supported activities and prompt-based slide creation inside Slides Studio.</div>
        <div>• Export and reporting tools for activities like Brainstorm Canvas and Team Pulse Check.</div>
      </div>
    </div>

    <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:16px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:10px;">Current Experiences</h3>
      <div style="display:grid;gap:10px;color:var(--text-mid);line-height:1.5;">
        <div>• Team play: Lightning Trivia, Trivia Battle, Emoji Charades, Icebreaker Roulette, Team Pulse Check, Values Vote, Team Wordle, Word Chain, Brainstorm Canvas, Team Jeopardy, and Spin Wheel.</div>
        <div>• Competitive games: UNO Showdown, Tic-Tac-Toe Blitz Arena, Battleship, Bingo, Backgammon, and Connect 4.</div>
        <div>• Presentation flow: shared presentation viewer plus Slides Studio with templates, gradients, images, CTA links, and AI-generated slides.</div>
        <div>• Session UX: editable profile, secure room join flow, keyboard shortcuts, shortcut help, admin controls, and feedback capture.</div>
      </div>
    </div>
  `;
};

TEAM_BUILDER_SCREEN_RENDERERS.renderJoinRoom = function renderJoinRoom() {
  const prefillCode = escapeHtml(normalizeRoomCode(APP.pendingJoinCode || ''));
  const prefillToken = escapeHtml(normalizeRoomAccessToken(APP.pendingJoinToken || getStoredRoomAccessToken(APP.pendingJoinCode || '')));
  return `
    <div class="header">
      <h1 class="logo">Join Session</h1>
    </div>
    
    <button class="btn-secondary" data-action="go-screen" data-screen="dashboard">← Back</button>
    
    <div class="form-container" style="margin-top:20px;">
      <div class="form-group">
        <label class="form-label" for="joinCode">Room Code</label>
        <input type="text" id="joinCode" class="form-input" 
          style="text-align:center;font-size:2rem;letter-spacing:8px;text-transform:uppercase;"
          maxlength="6" value="${prefillCode}" placeholder="ABC123" autocapitalize="characters" inputmode="text">
      </div>
      <div class="form-group">
        <label class="form-label" for="joinToken">Private Access Token (Optional)</label>
        <input type="password" id="joinToken" class="form-input" value="${prefillToken}" placeholder="Only needed for private sessions or full invite links" autocomplete="off" spellcheck="false">
      </div>
      ${prefillCode ? `<div style="color:var(--text-dim);font-size:0.9rem;margin-bottom:10px;">Invite link detected. Tap <strong>Join Room</strong>.</div>` : '<div style="color:var(--text-dim);font-size:0.9rem;margin-bottom:10px;">Public sessions only need the room code. Private sessions also require the token.</div>'}
      
      <button class="btn-primary" data-action="join-room">Join Room</button>
    </div>
  `;
};

TEAM_BUILDER_SCREEN_RENDERERS.renderFeedbackHub = function renderFeedbackHub() {
  const entries = APP.feedback || [];
  const loading = APP.feedbackLoading;
  const statusColor = {
    open: 'var(--warning)',
    in_review: 'var(--accent)',
    resolved: 'var(--success)'
  };

  return `
    <div class="header">
      <h1 class="logo">Feedback Hub</h1>
      <p class="tagline">Report UI issues and share ideas. You only see your own submissions.</p>
    </div>
    <button class="btn-secondary" data-action="go-screen" data-screen="dashboard">← Back</button>

    <div class="form-container" style="margin-top:20px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:14px;">Submit Feedback</h3>
      <div class="form-group">
        <label class="form-label" for="feedbackType">Type</label>
        <select id="feedbackType" class="form-input">
          <option value="ui">UI Issue</option>
          <option value="idea">Idea</option>
          <option value="bug">Bug</option>
          <option value="general">General</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="feedbackTitle">Title</label>
        <input id="feedbackTitle" class="form-input" maxlength="120" placeholder="Short title">
      </div>
      <div class="form-group">
        <label class="form-label" for="feedbackDetails">Details</label>
        <textarea id="feedbackDetails" class="form-input" rows="4" maxlength="2000" placeholder="Describe the issue or idea"></textarea>
      </div>
      <button class="btn-primary" data-action="submit-feedback">Submit</button>
      <button class="btn-secondary" data-action="refresh-feedback" style="margin-top:10px;">Refresh My Feedback</button>
    </div>

    <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:20px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:14px;">My Feedback</h3>
      ${loading ? '<div style="color:var(--text-dim);">Loading...</div>' : ''}
      ${!loading && entries.length === 0 ? '<div style="color:var(--text-dim);">No feedback submitted yet.</div>' : ''}
      ${entries.map(item => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;">
            <strong>${escapeHtml(item.title || '')}</strong>
            <span style="font-size:0.8rem;text-transform:uppercase;color:${statusColor[item.status] || 'var(--text-mid)'};">${escapeHtml((item.status || 'open').replace('_', ' '))}</span>
          </div>
          <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:8px;">
            ${escapeHtml((item.type || 'general').toUpperCase())} • ${escapeHtml(item.createdAt || '')}
          </div>
          <div style="margin-bottom:8px;color:var(--text-mid);">${escapeHtml(item.details || '')}</div>
          ${item.adminNotes ? `<div style="padding:10px;border-radius:8px;background:rgba(0,210,211,0.06);border:1px solid var(--accent);font-size:0.9rem;"><strong>Admin Notes:</strong> ${escapeHtml(item.adminNotes)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
};

TEAM_BUILDER_SCREEN_RENDERERS.renderAdminConsole = function renderAdminConsole() {
  const admin = APP.admin || {};
  const safeToken = escapeHtml(admin.token || '');
  const safeAppName = escapeHtml(APP.branding.appName || '');
  const safeTagline = escapeHtml(APP.branding.tagline || '');
  const safeAccent = escapeHtml(APP.branding.accent || '#00d2d3');
  const safeAccentAlt = escapeHtml(APP.branding.accentAlt || '');
  const safeBgColor = escapeHtml(APP.branding.bgColor || '');
  const safeColorTheme = escapeHtml(APP.branding.colorTheme || 'default');
  const backScreen = APP.roomCode && (admin.returnScreen === 'lobby' || admin.returnScreen === 'activity-queue')
    ? admin.returnScreen
    : 'dashboard';
  const backLabel = backScreen === 'dashboard'
    ? '← Back'
    : backScreen === 'activity-queue'
      ? '← Back to Activity Queue'
      : '← Back to Session';
  const preferences = normalizeAppPreferences(APP.preferences || {});
  const enabledActivities = preferences.enabledActivities || {};
  const collections = Array.isArray(admin.collections) ? admin.collections : [];
  const dbConnected = Boolean(admin.configDatabaseConnected);
  const feedback = admin.feedback || [];
  const sessions = Array.isArray(admin.sessions) ? admin.sessions : [];
  const abandonedSessions = sessions.filter(item => item?.isAbandoned);
  const communityHostRequests = normalizeCommunityHostRequests(admin.communityHostRequests || []);
  const pendingCommunityHostRequests = communityHostRequests.filter(item => item.status === 'pending');
  const statusColor = {
    open: 'var(--warning)',
    in_review: 'var(--accent)',
    resolved: 'var(--success)'
  };

  if (!admin.authenticated) {
    return `
      <div class="header">
        <h1 class="logo">Admin Console</h1>
        <p class="tagline">${IS_LOCAL_DEV_CLIENT ? 'Sign in with the admin credentials configured for this environment.' : 'Sign in with the admin token from your server environment.'}</p>
      </div>
      <button class="btn-secondary" data-action="go-screen" data-screen="${backScreen}">${backLabel}</button>
      <div class="form-container" style="margin-top:20px;">
        <div class="form-group">
          <label class="form-label" for="adminToken">Admin Token</label>
          <input id="adminToken" class="form-input" value="${safeToken}" type="password" placeholder="${IS_LOCAL_DEV_CLIENT ? 'Enter admin token or password' : 'x-admin-token'}">
        </div>
        <button class="btn-primary" data-action="admin-login">Login</button>
      </div>
    `;
  }

  const activeTab = ['overview', 'features', 'ai', 'feedback'].includes(admin.activeTab) ? admin.activeTab : 'overview';
  return `
    <div class="header">
      <h1 class="logo">Admin Console</h1>
      <p class="tagline">Manage branding, feature controls, datasets, and facilitator feedback from one place.</p>
    </div>
    <button class="btn-secondary" data-action="go-screen" data-screen="${backScreen}">${backLabel}</button>
    <button class="btn-secondary" data-action="admin-logout" style="margin-left:10px;">Log Out</button>

    <div class="form-container" style="margin-top:20px;">
      <div class="host-tabs" role="tablist" aria-label="Admin console sections" style="margin-bottom:18px;">
        <button class="host-tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-action="admin-console-tab" data-tab="overview" role="tab" aria-selected="${activeTab === 'overview' ? 'true' : 'false'}">Overview</button>
        <button class="host-tab-btn ${activeTab === 'features' ? 'active' : ''}" data-action="admin-console-tab" data-tab="features" role="tab" aria-selected="${activeTab === 'features' ? 'true' : 'false'}">Features</button>
        <button class="host-tab-btn ${activeTab === 'ai' ? 'active' : ''}" data-action="admin-console-tab" data-tab="ai" role="tab" aria-selected="${activeTab === 'ai' ? 'true' : 'false'}">AI Studio</button>
        <button class="host-tab-btn ${activeTab === 'feedback' ? 'active' : ''}" data-action="admin-console-tab" data-tab="feedback" role="tab" aria-selected="${activeTab === 'feedback' ? 'true' : 'false'}">Feedback</button>
      </div>
      <div data-tab-panel="overview" class="host-tab-panel" ${activeTab !== 'overview' ? 'hidden' : ''}>
        <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:14px;">Branding & Overview</h3>
        <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:12px;">
          Config storage: <strong>${dbConnected ? 'Database connected' : 'Local file fallback'}</strong>
        </div>
        <div class="form-group">
          <label class="form-label" for="adminBrandAppName">App Name</label>
          <input id="adminBrandAppName" class="form-input" value="${safeAppName}" maxlength="64">
        </div>
        <div class="form-group">
          <label class="form-label" for="adminBrandTagline">Tagline</label>
          <input id="adminBrandTagline" class="form-input" value="${safeTagline}" maxlength="140">
        </div>
        <div style="margin-bottom:18px;padding:16px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;">
          <div style="font-weight:700;margin-bottom:12px;">Color Theme</div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" for="adminColorTheme">Theme Preset</label>
            <select id="adminColorTheme" class="form-input">
              <option value="default" ${safeColorTheme === 'default' ? 'selected' : ''}>Default (Dark)</option>
              <option value="servicenow" ${safeColorTheme === 'servicenow' ? 'selected' : ''}>ServiceNow Branded</option>
            </select>
          </div>
          <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:12px;">
            Customize individual colors below. Leave blank to use theme defaults.
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label" for="adminBrandAccent">Primary Accent</label>
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="color" id="adminBrandAccentPicker" value="${safeAccent.startsWith('#') ? safeAccent : '#00d2d3'}" style="width:36px;height:36px;border:none;background:none;padding:0;cursor:pointer;border-radius:6px;overflow:hidden;" oninput="document.getElementById('adminBrandAccent').value=this.value">
                <input id="adminBrandAccent" class="form-input" value="${safeAccent}" maxlength="7" placeholder="#00d2d3" style="flex:1;" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value))document.getElementById('adminBrandAccentPicker').value=this.value">
              </div>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" for="adminBrandAccentAlt">Secondary Accent</label>
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="color" id="adminBrandAccentAltPicker" value="${safeAccentAlt.startsWith('#') ? safeAccentAlt : '#c56cf0'}" style="width:36px;height:36px;border:none;background:none;padding:0;cursor:pointer;border-radius:6px;overflow:hidden;" oninput="document.getElementById('adminBrandAccentAlt').value=this.value">
                <input id="adminBrandAccentAlt" class="form-input" value="${safeAccentAlt}" maxlength="7" placeholder="Theme default" style="flex:1;" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value))document.getElementById('adminBrandAccentAltPicker').value=this.value">
              </div>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" for="adminBrandBgColor">Background</label>
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="color" id="adminBrandBgColorPicker" value="${safeBgColor.startsWith('#') ? safeBgColor : '#07070d'}" style="width:36px;height:36px;border:none;background:none;padding:0;cursor:pointer;border-radius:6px;overflow:hidden;" oninput="document.getElementById('adminBrandBgColor').value=this.value">
                <input id="adminBrandBgColor" class="form-input" value="${safeBgColor}" maxlength="7" placeholder="Theme default" style="flex:1;" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value))document.getElementById('adminBrandBgColorPicker').value=this.value">
              </div>
            </div>
          </div>
          <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <div title="ServiceNow Green" style="width:24px;height:24px;border-radius:6px;background:#62D84E;cursor:pointer;border:2px solid rgba(255,255,255,0.2);" onclick="document.getElementById('adminBrandAccent').value='#62D84E';document.getElementById('adminBrandAccentPicker').value='#62D84E';"></div>
              <div title="ServiceNow Teal" style="width:24px;height:24px;border-radius:6px;background:#00C7B1;cursor:pointer;border:2px solid rgba(255,255,255,0.2);" onclick="document.getElementById('adminBrandAccentAlt').value='#00C7B1';document.getElementById('adminBrandAccentAltPicker').value='#00C7B1';"></div>
              <div title="ServiceNow Navy" style="width:24px;height:24px;border-radius:6px;background:#00182D;cursor:pointer;border:2px solid rgba(255,255,255,0.2);" onclick="document.getElementById('adminBrandBgColor').value='#00182D';document.getElementById('adminBrandBgColorPicker').value='#00182D';"></div>
              <div title="Default Cyan" style="width:24px;height:24px;border-radius:6px;background:#00d2d3;cursor:pointer;border:2px solid rgba(255,255,255,0.2);" onclick="document.getElementById('adminBrandAccent').value='#00d2d3';document.getElementById('adminBrandAccentPicker').value='#00d2d3';"></div>
              <div title="Default Purple" style="width:24px;height:24px;border-radius:6px;background:#c56cf0;cursor:pointer;border:2px solid rgba(255,255,255,0.2);" onclick="document.getElementById('adminBrandAccentAlt').value='#c56cf0';document.getElementById('adminBrandAccentAltPicker').value='#c56cf0';"></div>
            </div>
            <span style="font-size:0.75rem;color:var(--text-dim);align-self:center;">Quick colors</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;">
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Collections</div>
            <div style="font-size:1.28rem;font-weight:800;">${collections.length}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;">
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Enabled Activities</div>
            <div style="font-size:1.28rem;font-weight:800;">${Object.values(enabledActivities).filter(Boolean).length}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;">
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Open Feedback Items</div>
            <div style="font-size:1.28rem;font-weight:800;">${feedback.filter(item => (item.status || 'open') !== 'resolved').length}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;">
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Live Sessions</div>
            <div style="font-size:1.28rem;font-weight:800;">${sessions.length}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;">
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Abandoned Sessions</div>
            <div style="font-size:1.28rem;font-weight:800;">${abandonedSessions.length}</div>
          </div>
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;">
            <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Pending Host Requests</div>
            <div style="font-size:1.28rem;font-weight:800;">${pendingCommunityHostRequests.length}</div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
            <div>
              <div style="font-weight:700;">Session Management</div>
              <div style="font-size:0.82rem;color:var(--text-dim);">Sessions expire after 242 minutes. Admin can refresh, close one session, or clean up abandoned sessions immediately.</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn-secondary" data-action="refresh-admin-sessions" style="width:auto;" ${admin.sessionsLoading ? 'disabled aria-busy="true"' : ''}>${admin.sessionsLoading ? 'Refreshing...' : 'Refresh Sessions'}</button>
              <button class="btn-primary" data-action="cleanup-admin-abandoned-sessions" style="width:auto;" ${(admin.sessionActionPending === 'cleanup-abandoned' || !abandonedSessions.length) ? 'disabled aria-busy="true"' : ''}>${admin.sessionActionPending === 'cleanup-abandoned' ? 'Closing...' : `Close Abandoned (${abandonedSessions.length})`}</button>
            </div>
          </div>
          ${!sessions.length ? `
            <div style="font-size:0.84rem;color:var(--text-dim);">No live sessions found.</div>
          ` : sessions.map(session => {
            const closePending = admin.sessionActionPending === `close:${session.code}`;
            const badgeColor = session.isAbandoned ? 'var(--warning)' : 'var(--accent)';
            const badgeLabel = session.cleanupReason ? String(session.cleanupReason).replace(/_/g, ' ') : (session.currentActivity ? 'active' : 'open');
            return `
              <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
                  <div>
                    <div style="font-weight:700;">${escapeHtml(session.title || session.code || 'Session')}</div>
                    <div style="font-size:0.82rem;color:var(--text-dim);">
                      ${escapeHtml(session.code || '')} • ${escapeHtml(session.roomType || 'private')} • ${escapeHtml(session.privateSession ? 'private access' : 'open access')}
                    </div>
                  </div>
                  <span style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid var(--border);font-size:0.76rem;font-weight:800;color:${badgeColor};text-transform:uppercase;">
                    ${escapeHtml(badgeLabel)}
                  </span>
                </div>
                <div style="font-size:0.84rem;color:var(--text-mid);margin-bottom:8px;">
                  Host: <strong>${escapeHtml(session.host || 'Unassigned')}</strong> • Participants: <strong>${escapeHtml(String(session.participantCount || 0))}/${escapeHtml(String(session.maxParticipants || 24))}</strong> • Activity: <strong>${escapeHtml(session.currentActivity || 'Lobby')}</strong>
                </div>
                <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:10px;">
                  Created: ${escapeHtml(session.createdAt || 'Unknown')}<br>
                  Last activity: ${escapeHtml(session.lastActivityAt || 'Unknown')}<br>
                  Expires: ${escapeHtml(session.expiresAt || 'Unknown')}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                  <div style="font-size:0.82rem;color:var(--text-dim);">
                    ${session.participants?.length ? escapeHtml(session.participants.map(item => item.name || 'Unknown').join(', ')) : 'No active participants tracked.'}
                  </div>
                  <button class="btn-secondary" data-action="close-admin-session" data-room-code="${escapeHtml(session.code || '')}" style="width:auto;border-color:rgba(255,107,107,0.3);color:#ff9c9c;" ${closePending ? 'disabled aria-busy="true"' : ''}>${closePending ? 'Closing...' : 'Close Session'}</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div data-tab-panel="features" class="host-tab-panel" ${activeTab !== 'features' ? 'hidden' : ''}>
        <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:14px;">Feature Flags & Rules</h3>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableFeedbackHub" type="checkbox" ${preferences.enableFeedbackHub !== false ? 'checked' : ''}>
          Enable user Feedback Hub
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableActivityQueue" type="checkbox" ${preferences.enableActivityQueue !== false ? 'checked' : ''}>
          Enable Activity Queue
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableScheduleMeeting" type="checkbox" ${preferences.enableScheduleMeeting !== false ? 'checked' : ''}>
          Enable Plan Session
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableLoadSession" type="checkbox" ${preferences.enableLoadSession !== false ? 'checked' : ''}>
          Enable Manage Sessions
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableCommunityLobby" type="checkbox" ${preferences.enableCommunityLobby !== false ? 'checked' : ''}>
          Enable Community Lobby
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableAIGenerator" type="checkbox" ${preferences.enableAIGenerator !== false ? 'checked' : ''}>
          Enable AI Content Generator
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableSampleQuestions" type="checkbox" ${preferences.enableSampleQuestions !== false ? 'checked' : ''}>
          Include built-in sample question sets
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableFooterQuotes" type="checkbox" ${preferences.enableFooterQuotes === true ? 'checked' : ''}>
          Enable inspiring team quote footer
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input id="adminEnableMessageBoard" type="checkbox" ${preferences.enableMessageBoard !== false ? 'checked' : ''}>
          Enable Message Board in session lobby (all rooms)
        </label>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-weight:700;margin-bottom:10px;">Global Game Rules</div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <input id="adminAutoRevealLightning" type="checkbox" ${preferences.autoRevealLightning !== false ? 'checked' : ''}>
            Auto-reveal Lightning answers when everyone answers or the timer ends
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <input id="adminAllowAnswerChanges" type="checkbox" ${preferences.allowAnswerChanges !== false ? 'checked' : ''}>
            Allow answer changes before reveal
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <input id="adminDynamicScoring" type="checkbox" ${preferences.dynamicScoring !== false ? 'checked' : ''}>
            Use dynamic time-based scoring
          </label>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-weight:700;margin-bottom:8px;">Community Room Creators</div>
          <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:8px;">
            Admins can always create community rooms. Add approved host names below, one per line.
          </div>
          <textarea id="adminCommunityHostAllowlist" class="form-input" rows="5" placeholder="Alex Smith&#10;Jordan Lee">${escapeHtml((preferences.communityHostAllowlist || []).join('\n'))}</textarea>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="font-weight:700;">Community Host Access Requests</div>
            <div style="font-size:0.82rem;color:var(--text-dim);">${pendingCommunityHostRequests.length} pending</div>
          </div>
          ${communityHostRequests.length ? communityHostRequests.map(item => `
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
                <div>
                  <div style="font-weight:700;">${escapeHtml(item.userName)}</div>
                  <div style="font-size:0.82rem;color:var(--text-dim);">${escapeHtml(item.createdAt || '')}${item.userId ? ` • ${escapeHtml(item.userId)}` : ''}</div>
                </div>
                <span style="padding:6px 10px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid var(--border);font-size:0.76rem;font-weight:800;color:${item.status === 'approved' ? 'var(--success)' : item.status === 'denied' ? 'var(--danger)' : 'var(--warning)'};text-transform:uppercase;">
                  ${escapeHtml(item.status)}
                </span>
              </div>
              <div style="color:var(--text-mid);margin-bottom:10px;">${escapeHtml(item.reason || '')}</div>
              <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;">
                <input id="community-request-notes-${item.id}" class="form-input" value="${escapeHtml(item.adminNotes || '')}" maxlength="400" placeholder="Admin notes">
                <button class="btn-secondary" data-action="review-community-host-request" data-request-id="${item.id}" data-request-status="pending" style="width:auto;">Mark Pending</button>
                <button class="btn-secondary" data-action="review-community-host-request" data-request-id="${item.id}" data-request-status="denied" style="width:auto;border-color:rgba(255,107,107,0.3);color:#ff9c9c;">Deny</button>
                <button class="btn-primary" data-action="review-community-host-request" data-request-id="${item.id}" data-request-status="approved" style="width:auto;">Approve</button>
              </div>
            </div>
          `).join('') : `
            <div style="font-size:0.84rem;color:var(--text-dim);">No community host access requests yet.</div>
          `}
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-weight:700;margin-bottom:8px;">Enable Activities in Main Menu</div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">
            ${ACTIVITY_QUEUE_ITEMS.map(item => `
              <label style="display:flex;align-items:center;gap:8px;">
                <input id="adminActivityEnabled-${item.id}" type="checkbox" ${enabledActivities[item.id] !== false ? 'checked' : ''}>
                <span>${escapeHtml(item.icon)} ${escapeHtml(item.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <div data-tab-panel="ai" class="host-tab-panel" ${activeTab !== 'ai' ? 'hidden' : ''}>
        ${renderAIContentStudioSection('admin')}
      </div>

      <div data-tab-panel="feedback" class="host-tab-panel" ${activeTab !== 'feedback' ? 'hidden' : ''}>
        <h3 style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">All Feedback</h3>
        <button class="btn-secondary" data-action="refresh-admin-feedback" style="margin-bottom:12px;">Refresh</button>
        ${admin.loading ? '<div style="color:var(--text-dim);">Loading...</div>' : ''}
        ${!admin.loading && feedback.length === 0 ? '<div style="color:var(--text-dim);">No feedback available.</div>' : ''}
        ${feedback.map(item => `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;">
              <strong>${escapeHtml(item.title || '')}</strong>
              <span style="font-size:0.8rem;color:${statusColor[item.status] || 'var(--text-mid)'};text-transform:uppercase;">${escapeHtml((item.status || 'open').replace('_', ' '))}</span>
            </div>
            <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:8px;">
              ${escapeHtml(item.userName || 'Anonymous')} • ${escapeHtml(item.type || 'general')} • ${escapeHtml(item.createdAt || '')}
            </div>
            <div style="color:var(--text-mid);margin-bottom:10px;">${escapeHtml(item.details || '')}</div>
            <div style="display:grid;grid-template-columns:180px 1fr auto;gap:10px;">
              <select id="admin-status-${item.id}" class="form-input">
                <option value="open" ${(item.status || '') === 'open' ? 'selected' : ''}>Open</option>
                <option value="in_review" ${(item.status || '') === 'in_review' ? 'selected' : ''}>In Review</option>
                <option value="resolved" ${(item.status || '') === 'resolved' ? 'selected' : ''}>Resolved</option>
              </select>
              <input id="admin-notes-${item.id}" class="form-input" value="${escapeHtml(item.adminNotes || '')}" maxlength="2000" placeholder="Admin notes">
              <button class="btn-primary" data-action="save-admin-feedback-item" data-feedback-id="${item.id}">Save</button>
            </div>
          </div>
        `).join('')}
      </div>

      <button class="btn-primary" data-action="save-admin-config" ${admin.savingConfig ? 'disabled aria-busy="true"' : ''} style="margin-top:18px;">
        ${admin.savingConfig ? 'Saving...' : 'Save Admin Settings'}
      </button>
    </div>
  `;
};
