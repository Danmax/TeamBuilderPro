const TEAM_BUILDER_ROOM_RENDERERS = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_ROOM_RENDERERS.renderLobby = function renderLobby() {
  const isHost = APP.room.host === APP.player.name;
  const voiceSettings = getRoomVoiceSettings(APP.room);
  const connectedVoiceIds = new Set((APP.voice.members || []).map(member => member?.playerId).filter(Boolean));
  const approvedVoiceIds = new Set(APP.voice.approvedSpeakerIds || []);
  const raisedVoiceIds = new Set(APP.voice.raisedHands || []);
  const liveVoiceIds = new Set(APP.voice.liveSpeakerIds || []);
  const raisedHandParticipants = (APP.room?.participants || []).filter(participant => Array.isArray(APP.voice.raisedHands) && APP.voice.raisedHands.includes(participant?.id));
  const raisedHandCount = raisedHandParticipants.length;
  const focusedVoiceParticipant = getVoiceFocusParticipant(APP.room);
  const focusedVoiceParticipantId = String(focusedVoiceParticipant?.id || '').trim();
  const showFeedback = APP.preferences.enableFeedbackHub !== false;
  const safeRoomCode = escapeHtml(APP.roomCode);
  const privateSession = isRoomPrivateSession(APP.room);
  const joinUrl = buildJoinUrl(APP.roomCode || '', APP.roomAccessToken || '', privateSession);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
  const safeJoinUrl = escapeHtml(joinUrl);
  const showLobbyPlaylistSection = false;
  const enabledActivities = APP.preferences?.enabledActivities || {};
  const voicePolicyLabel = voiceSettings.participantMicPolicy === 'open'
    ? 'Everyone can speak'
    : voiceSettings.participantMicPolicy === 'host_only'
      ? 'Host only'
      : 'Host-approved participants';
  const voiceModeLabel = voiceSettings.transmissionMode === 'open' ? 'Open mic' : 'Push to talk';
  const isCommunityRoom = APP.room?.roomType === 'community';
  const canManageCommunity = isCommunityRoom && canCurrentUserManageCommunityRoom(APP.room);
  const communityChat = Array.isArray(APP.room?.communityChat) ? APP.room.communityChat.slice(-50) : [];
  const lobbyTitle = isCommunityRoom
    ? escapeHtml(APP.room.communityTitle || `${APP.room.host || 'Host'}'s Community Lobby`)
    : 'Session Lobby';
  
  if (APP.room.currentActivity) {
    return renderActivity();
  }
  
  return `
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
      <button class="btn-secondary" data-action="edit-profile" style="font-size:0.78rem;padding:6px 10px;">✏️ Profile</button>
      ${showFeedback ? '<button class="btn-secondary" data-action="open-feedback" style="font-size:0.78rem;padding:6px 10px;">🗣️ Feedback</button>' : ''}
      ${isHost ? '<button class="btn-secondary" data-action="open-admin-console" style="font-size:0.78rem;padding:6px 10px;">🛠️ Admin</button>' : ''}
      <button class="btn-secondary" data-action="leave-session" style="font-size:0.78rem;padding:6px 10px;">🚪 Leave</button>
      ${(isHost && APP.preferences.enableActivityQueue !== false) ? '<button class="btn-secondary" data-action="go-screen" data-screen="activity-queue" aria-keyshortcuts="Alt+Q" style="font-size:0.78rem;padding:6px 10px;">🗂️ Queue</button>' : ''}
      ${isHost ? `<button class="btn-secondary" data-action="toggle-host-voice" aria-label="${voiceSettings.enabled ? 'Turn off room voice' : 'Turn on room voice'}" title="${voiceSettings.enabled ? 'Turn off room voice' : 'Turn on room voice'}" style="font-size:0.78rem;padding:6px 10px;border-color:${voiceSettings.enabled ? 'rgba(122,245,159,0.45)' : 'var(--border)'};color:${voiceSettings.enabled ? '#7af59f' : 'var(--text)'};">${voiceSettings.enabled ? '🎙️ Voice' : '🔇 Voice'}</button>` : ''}
      ${isHost ? `<button class="btn-secondary" data-action="open-host-settings" aria-keyshortcuts="Alt+S" style="font-size:0.78rem;padding:6px 10px;border-color:${raisedHandCount ? 'rgba(255,209,102,0.45)' : 'var(--border)'};color:${raisedHandCount ? '#ffd166' : 'var(--text)'};">⚙️ Settings${raisedHandCount ? ` (${raisedHandCount} ✋)` : ''}</button>` : ''}
    </div>

    <div class="header">
      <h1 class="logo">${lobbyTitle}</h1>
      <p class="tagline">Room: ${safeRoomCode}${isCommunityRoom ? ' • Community Lobby' : ''}</p>
    </div>

    ${canManageCommunity ? `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
        <button class="btn-secondary" data-action="edit-community-room" style="width:auto;">✏️ Edit Community</button>
        <button class="btn-secondary" data-action="remove-community-room" style="width:auto;border-color:rgba(255,107,107,0.3);color:#ff9c9c;">🗑️ Remove Community</button>
      </div>
    ` : ''}

    ${isHost && voiceSettings.enabled && (raisedHandCount || focusedVoiceParticipant) ? `
      <div style="background:rgba(255,209,102,0.08);border:1px solid rgba(255,209,102,0.32);border-radius:var(--radius);padding:14px 16px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-weight:800;margin-bottom:4px;">${raisedHandCount ? `${raisedHandCount} participant${raisedHandCount === 1 ? '' : 's'} raised a hand` : '1:1 conversation is active'}</div>
            <div style="font-size:0.84rem;color:var(--text-dim);">
              ${raisedHandCount
                ? `${escapeHtml(raisedHandParticipants.map(participant => participant?.name || '').filter(Boolean).join(', '))} ${raisedHandCount === 1 ? 'is' : 'are'} waiting for host attention.`
                : ''}
              ${focusedVoiceParticipant ? `${raisedHandCount ? ' ' : ''}Current 1:1 focus: ${escapeHtml(focusedVoiceParticipant.name || 'selected participant')}.` : ''}
            </div>
          </div>
          <button class="btn-secondary" data-action="open-host-settings" style="width:auto;padding:10px 14px;border-color:rgba(255,209,102,0.45);color:#ffd166;">
            Open Voice Moderation
          </button>
        </div>
      </div>
    ` : ''}
    
    <div style="background:rgba(0,210,211,0.05);border:2px solid var(--accent);
      border-radius:var(--radius);padding:24px;margin-bottom:24px;">
      <div class="qr-grid" style="display:grid;grid-template-columns:${isHost ? '1.4fr 1fr' : '1fr'};gap:18px;align-items:center;">
        <div style="text-align:center;">
          <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
            Room Code
          </div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:3rem;font-weight:700;
            letter-spacing:12px;color:var(--accent);margin:10px 0;">
            ${safeRoomCode}
          </div>
          <div style="font-size:0.85rem;color:var(--text-dim);">Share with your team</div>
          ${isHost ? `
            <div style="margin-top:10px;color:var(--text-dim);font-size:0.82rem;word-break:break-all;">
              ${safeJoinUrl}
            </div>
            <div style="margin-top:8px;color:var(--text-dim);font-size:0.82rem;">
              Access: <strong>${privateSession ? 'Private session (token required)' : 'Open session (room code only)'}</strong>
            </div>
            <button class="btn-secondary" data-action="copy-join-link" style="margin-top:10px;">Copy Join Link</button>
          ` : ''}
        </div>
        ${isHost ? `
          <div style="text-align:center;">
            <div style="font-weight:700;margin-bottom:10px;">Scan to Join</div>
            <img src="${qrImageUrl}" alt="QR code to join session" width="220" height="220"
              style="width:220px;height:220px;max-width:100%;border-radius:12px;border:1px solid var(--border);background:#fff;padding:8px;">
          </div>
        ` : ''}
      </div>
    </div>
    <div style="text-align:center;margin:-10px 0 22px;color:var(--text-dim);font-size:0.84rem;">
      Keyboard: <strong>${escapeHtml(formatModifierShortcut('L'))}</strong> lobby, <strong>${escapeHtml(formatModifierShortcut('P'))}</strong> presentation, <strong>${escapeHtml(formatModifierShortcut('S'))}</strong> host settings, <strong>?</strong> shortcuts
    </div>

    <div style="display:none;">
    </div>
    
    <div style="background:var(--surface-solid);border:1px solid var(--border);
      border-radius:var(--radius);padding:24px;margin-bottom:30px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <h3 style="font-weight:600;display:flex;align-items:center;gap:10px;">
          <div style="width:8px;height:8px;background:var(--success);border-radius:50%;animation:pulse 2s ease-in-out infinite;"></div>
          ${APP.room.participants.length} ${APP.room.participants.length === 1 ? 'person' : 'people'} in room
        </h3>
        ${isHost ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            <span style="padding:6px 10px;border-radius:999px;background:${voiceSettings.enabled ? 'rgba(122,245,159,0.12)' : 'rgba(255,255,255,0.06)'};border:1px solid ${voiceSettings.enabled ? 'rgba(122,245,159,0.28)' : 'rgba(255,255,255,0.08)'};font-size:0.74rem;font-weight:700;color:${voiceSettings.enabled ? '#7af59f' : 'var(--text-dim)'};">
              ${voiceSettings.enabled ? 'Voice Enabled' : 'Voice Off'}
            </span>
            ${voiceSettings.enabled ? `
              <span style="padding:6px 10px;border-radius:999px;background:rgba(0,210,211,0.08);border:1px solid rgba(0,210,211,0.22);font-size:0.74rem;font-weight:700;color:var(--accent);">
                Session default: ${escapeHtml(voiceModeLabel)}
              </span>
              <span style="padding:6px 10px;border-radius:999px;background:rgba(255,209,102,0.08);border:1px solid rgba(255,209,102,0.22);font-size:0.74rem;font-weight:700;color:#ffd166;">
                ${escapeHtml(voicePolicyLabel)}
              </span>
            ` : ''}
          </div>
        ` : ''}
      </div>
      
      ${APP.room.participants.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;
          background:${isHost && focusedVoiceParticipantId === p.id ? 'rgba(0,210,211,0.08)' : 'var(--surface-2)'};border:${isHost && focusedVoiceParticipantId === p.id ? '1px solid rgba(0,210,211,0.26)' : '1px solid transparent'};border-radius:10px;padding:14px;margin-bottom:10px;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;">
            <div style="font-size:1.8rem;">${escapeHtml(p.avatar)}</div>
            <div>
              <div style="font-weight:600;">${escapeHtml(p.name)}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
                ${p.isHost ? '<span style="background:var(--accent);color:var(--bg);padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:700;">HOST</span>' : ''}
                ${voiceSettings.enabled && connectedVoiceIds.has(p.id) ? '<span style="background:rgba(122,245,159,0.12);color:#7af59f;padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:700;">VOICE</span>' : ''}
                ${voiceSettings.enabled && raisedVoiceIds.has(p.id) ? '<span style="background:rgba(255,209,102,0.12);color:#ffd166;padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:700;">HAND RAISED</span>' : ''}
                ${voiceSettings.enabled && !p.isHost && approvedVoiceIds.has(p.id) ? '<span style="background:rgba(0,210,211,0.1);color:var(--accent);padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:700;">MIC ALLOWED</span>' : ''}
                ${voiceSettings.enabled && liveVoiceIds.has(p.id) ? '<span style="background:rgba(255,64,96,0.12);color:var(--danger);padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:700;">LIVE MIC</span>' : ''}
                ${isHost && focusedVoiceParticipantId === p.id ? '<span style="background:rgba(0,210,211,0.12);color:var(--accent);padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:700;">1:1 FOCUS</span>' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto;">
            ${isHost && voiceSettings.enabled && !p.isHost ? `
              ${raisedVoiceIds.has(p.id) ? `
                <button class="btn-secondary" data-action="voice-lower-hand" data-player-id="${escapeHtml(p.id)}" style="width:auto;padding:8px 12px;border-color:rgba(255,209,102,0.45);color:#ffd166;">
                  Lower Hand
                </button>
              ` : ''}
              <button class="btn-secondary" data-action="${focusedVoiceParticipantId === p.id ? 'voice-end-focus' : 'voice-start-focus'}" data-player-id="${escapeHtml(p.id)}" style="width:auto;padding:8px 12px;border-color:${focusedVoiceParticipantId === p.id ? 'rgba(0,210,211,0.45)' : 'var(--border)'};color:${focusedVoiceParticipantId === p.id ? 'var(--accent)' : 'var(--text)'};">
                ${focusedVoiceParticipantId === p.id ? 'End 1:1' : 'Talk 1:1'}
              </button>
              ${liveVoiceIds.has(p.id) ? `
                <button class="btn-secondary" data-action="voice-force-stop" data-player-id="${escapeHtml(p.id)}" style="width:auto;padding:8px 12px;border-color:var(--danger);color:var(--danger);">
                  Mute Live
                </button>
              ` : ''}
              <button class="btn-secondary" data-action="${approvedVoiceIds.has(p.id) ? 'voice-revoke-talk' : 'voice-grant-talk'}" data-player-id="${escapeHtml(p.id)}" style="width:auto;padding:8px 12px;">
                ${approvedVoiceIds.has(p.id) ? 'Mute Person' : 'Allow Voice'}
              </button>
            ` : ''}
            <div style="color:var(--success);">✓</div>
          </div>
        </div>
      `).join('')}
    </div>

    ${APP.preferences?.enableMessageBoard !== false ? `
      <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:30px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
          <h3 style="font-weight:700;">${isCommunityRoom ? '💬 Community Chat' : '📋 Session Message Board'}</h3>
          <div style="font-size:0.82rem;color:var(--text-dim);">${isCommunityRoom ? 'Lobby-wide messages and emoji reactions' : 'Share notes, links, or reactions with the team'}</div>
        </div>

        <div data-community-chat-list="1" style="display:grid;gap:10px;max-height:420px;overflow:auto;padding-right:4px;">
          ${communityChat.length ? communityChat.map(message => {
            const isOwnMessage = message.playerId === APP.player?.id || normalizeName(message.playerName || '') === normalizeName(APP.player?.name || '');
            return `
              <div style="display:flex;justify-content:${isOwnMessage ? 'flex-end' : 'flex-start'};">
                <div style="background:${isOwnMessage ? 'rgba(0,210,211,0.12)' : 'var(--surface-2)'};border:1px solid ${isOwnMessage ? 'rgba(0,210,211,0.24)' : 'var(--border)'};border-radius:14px;padding:12px 14px;max-width:min(82%, 620px);">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                    <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex-direction:${isOwnMessage ? 'row-reverse' : 'row'};">
                      ${isOwnMessage ? '' : `<div style="font-size:1.3rem;line-height:1;">${escapeHtml(message.avatar || '💬')}</div>`}
                      <div style="min-width:0;text-align:${isOwnMessage ? 'right' : 'left'};">
                        <div style="font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:${isOwnMessage ? 'flex-end' : 'flex-start'};">
                          <span>${escapeHtml(message.playerName || 'Guest')}</span>
                          <span style="font-size:0.75rem;color:var(--text-dim);font-weight:600;">${escapeHtml(formatCommunityChatTime(message.ts))}</span>
                        </div>
                        <div style="color:var(--text-mid);line-height:1.5;word-break:break-word;margin-top:4px;">${escapeHtml(message.text || '')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('') : `
            <div style="background:var(--surface-2);border:1px dashed var(--border);border-radius:14px;padding:18px;color:var(--text-dim);text-align:center;">
              ${isCommunityRoom ? 'No messages yet. Start the conversation or drop an emoji.' : 'No messages yet. Share a link, note, or quick reaction with the team.'}
            </div>
          `}
        </div>

        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div class="form-group" style="margin:0 0 10px;">
            <label class="form-label" for="communityChatInput">Message</label>
            <input id="communityChatInput" class="form-input" maxlength="280" placeholder="${isCommunityRoom ? 'Say hi, react, or coordinate the next game' : 'Share a message, link, or note with the team'}">
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="position:relative;">
              <details style="position:relative;">
                <summary class="btn-secondary" style="list-style:none;width:auto;padding:10px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;">
                  <span style="font-size:1rem;">😊</span>
                  <span>React</span>
                </summary>
                <div style="position:absolute;left:0;bottom:calc(100% + 10px);z-index:4;min-width:220px;padding:10px;border-radius:16px;background:rgba(8,12,29,0.96);border:1px solid var(--border);box-shadow:0 18px 36px rgba(0,0,0,0.32);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">
                  ${COMMUNITY_CHAT_QUICK_EMOJIS.map(emoji => `
                    <button class="btn-secondary" data-action="community-chat-emoji" data-emoji="${escapeHtml(emoji)}" style="width:auto;padding:10px 0;font-size:1rem;">${escapeHtml(emoji)}</button>
                  `).join('')}
                </div>
              </details>
            </div>
            <button class="btn-primary" data-action="send-community-chat" style="width:auto;padding:12px 18px;">Send</button>
          </div>
        </div>
      </div>
    ` : ''}

    ${isHost ? `
      <h3 style="text-align:center;font-family:'Fraunces',serif;font-size:1.5rem;margin-bottom:20px;">
        Choose Activity
      </h3>
      
      <div class="grid-2">
        <button type="button" class="card" data-action="start-lightning-trivia" aria-label="Start Lightning Trivia" style="${enabledActivities['lightning-trivia'] === false ? 'display:none;' : ''}">
          <div class="card-icon">⚡</div>
          <h3 class="card-title">Lightning Trivia</h3>
          <p class="card-desc">Kahoot-style quiz with 20s timer & speed scoring</p>
        </button>

        <button type="button" class="card" data-action="start-emoji-charades" aria-label="Start Emoji Charades" style="${enabledActivities['emoji-charades'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🎭</div>
          <h3 class="card-title">Emoji Charades</h3>
          <p class="card-desc">Guess the phrase behind each emoji clue</p>
        </button>
        
        <button type="button" class="card" data-action="start-icebreaker" aria-label="Start Icebreaker Roulette" style="${enabledActivities['icebreaker'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🎲</div>
          <h3 class="card-title">Icebreaker Roulette</h3>
          <p class="card-desc">Fun questions to spark great conversations</p>
        </button>
        
        <button type="button" class="card" data-action="start-pulse-check" aria-label="Start Team Pulse Check" style="${enabledActivities['pulse-check'] === false ? 'display:none;' : ''}">
          <div class="card-icon">📊</div>
          <h3 class="card-title">Team Pulse Check</h3>
          <p class="card-desc">Quick polls to gauge team sentiment</p>
        </button>
        
        <button type="button" class="card" data-action="start-values-vote" aria-label="Start Values Vote" style="${enabledActivities['values-vote'] === false ? 'display:none;' : ''}">
          <div class="card-icon">⭐</div>
          <h3 class="card-title">Values Vote</h3>
          <p class="card-desc">Discover what matters most to your team</p>
        </button>
        
        <button type="button" class="card" data-action="start-wordle" aria-label="Start Team Wordle" style="${enabledActivities['wordle'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🎯</div>
          <h3 class="card-title">Team Wordle</h3>
          <p class="card-desc">Guess the 5-letter word together</p>
        </button>

        <button type="button" class="card" data-action="start-word-chain" aria-label="Start Word Chain" style="${enabledActivities['word-chain'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🔗</div>
          <h3 class="card-title">Word Chain</h3>
          <p class="card-desc">Solve 5 hidden compound words with the fewest tries</p>
        </button>

        <button type="button" class="card" data-action="start-brainstorm-canvas" aria-label="Start Brainstorm Canvas" style="${enabledActivities['brainstorm-canvas'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🧩</div>
          <h3 class="card-title">Brainstorm Canvas</h3>
          <p class="card-desc">Add sticky notes and vote in Start / Stop / Improve / Create</p>
        </button>

        <button type="button" class="card" data-action="start-uno" aria-label="Start UNO Showdown" style="${enabledActivities.uno === false ? 'display:none;' : ''}">
          <div class="card-icon">🃏</div>
          <h3 class="card-title">UNO Showdown</h3>
          <p class="card-desc">Match colors and numbers, play action cards, and race to clear your hand</p>
        </button>

        <!-- Activity Queue button removed from Choose Activity menu -->
        
        <button type="button" class="card" data-action="start-regular-trivia" aria-label="Start Trivia Battle" style="${enabledActivities['regular-trivia'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🧠</div>
          <h3 class="card-title">Trivia Battle</h3>
          <p class="card-desc">Compete with classic trivia questions</p>
        </button>

        <button type="button" class="card" data-action="start-tic-tac-toe-blitz" aria-label="Start Tic-Tac-Toe Blitz Arena" style="${enabledActivities['tic-tac-toe-blitz'] === false ? 'display:none;' : ''}">
          <div class="card-icon">❌</div>
          <h3 class="card-title">Tic-Tac-Toe Blitz Arena</h3>
          <p class="card-desc">Auto-matched 1v1 games with a 2-minute round timer</p>
        </button>

        <button type="button" class="card" data-action="start-team-jeopardy" aria-label="Start Team Jeopardy" style="${enabledActivities['team-jeopardy'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🏆</div>
          <h3 class="card-title">Team Jeopardy</h3>
          <p class="card-desc">Pick a category and value, then race to answer and score points</p>
        </button>

        <button type="button" class="card" data-action="start-spin-wheel" aria-label="Start Spin Wheel" style="${enabledActivities['spin-wheel'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🎡</div>
          <h3 class="card-title">Spin Wheel</h3>
          <p class="card-desc">Customize options, spin the wheel, and let chance pick the next move</p>
        </button>

        <button type="button" class="card" data-action="start-presentation" aria-label="Start Presentation" style="${enabledActivities.presentation === false ? 'display:none;' : ''}">
          <div class="card-icon">📽️</div>
          <h3 class="card-title">Presentation</h3>
          <p class="card-desc">Display a shared PowerPoint or slide deck inside the room for everyone to follow along</p>
        </button>

        <button type="button" class="card" data-action="start-slides-studio" aria-label="Start Slides Studio" style="${enabledActivities['slides-studio'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🎞️</div>
          <h3 class="card-title">Slides Studio</h3>
          <p class="card-desc">Create live slides with gradients, images, rounded cards, and presenter controls directly inside the room</p>
        </button>

        <button type="button" class="card" data-action="start-dj-booth" aria-label="Start DJ Booth" style="${enabledActivities['dj-booth'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🎚️</div>
          <h3 class="card-title">DJ Booth</h3>
          <p class="card-desc">Load two YouTube decks, blend them live, fire sound pads, and broadcast a scrolling DJ banner</p>
        </button>

        <button type="button" class="card" data-action="start-battleship" aria-label="Start Battleship" style="${enabledActivities.battleship === false ? 'display:none;' : ''}">
          <div class="card-icon">🚢</div>
          <h3 class="card-title">Battleship</h3>
          <p class="card-desc">Place ships on a 10x10 ocean, take turns firing, and sink the other fleet first</p>
        </button>

        <button type="button" class="card" data-action="start-bingo" aria-label="Start Bingo" style="${enabledActivities.bingo === false ? 'display:none;' : ''}">
          <div class="card-icon">🎟️</div>
          <h3 class="card-title">Bingo</h3>
          <p class="card-desc">Get a unique 5x5 card, mark called numbers, and race to complete a line</p>
        </button>

        <button type="button" class="card" data-action="start-backgammon" aria-label="Start Backgammon" style="${enabledActivities.backgammon === false ? 'display:none;' : ''}">
          <div class="card-icon">🎲</div>
          <h3 class="card-title">Backgammon</h3>
          <p class="card-desc">Roll dice, move around the board, hit blots, and bear off all fifteen checkers first</p>
        </button>

        <button type="button" class="card" data-action="start-connect-4" aria-label="Start Connect 4" style="${enabledActivities['connect-4'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🟡</div>
          <h3 class="card-title">Connect 4</h3>
          <p class="card-desc">Drop glowing discs into a neon grid and connect four before your opponent does</p>
        </button>

        <button type="button" class="card" data-action="start-cosmos-bound" aria-label="Start Cosmos Bound" style="${enabledActivities['cosmos-bound'] === false ? 'display:none;' : ''}">
          <div class="card-icon">🚀</div>
          <h3 class="card-title">Cosmos Bound</h3>
          <p class="card-desc">Crew up and pilot a spacecraft through a full mission — each role controls a different station</p>
        </button>
      </div>
    ` : `
      <div style="text-align:center;padding:60px 20px;">
        <div style="width:48px;height:48px;margin:0 auto 20px;border:4px solid var(--surface-2);
          border-top:4px solid var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>
        <p style="color:var(--text-dim);">Waiting for host to start an activity...</p>
      </div>
    `}
  `;
};

TEAM_BUILDER_ROOM_RENDERERS.renderActivityQueue = function renderActivityQueue() {
  const isHost = APP.room.host === APP.player.name;
  const safeRoomCode = escapeHtml(APP.roomCode);
  const queueFeatureEnabled = APP.preferences.enableActivityQueue !== false;
  const availableQueueItems = getEnabledActivityItems();
  const activityQueue = Array.isArray(APP.room.activityQueue) ? APP.room.activityQueue : [];
  const queueAiActivities = getQueueEligibleAIActivityIds(activityQueue);
  const localCollections = normalizeClientCollections(APP.admin.collections || []);
  const queueIndex = Number.isInteger(APP.room.queueIndex) ? APP.room.queueIndex : 0;
  const queueActive = Boolean(APP.room.queueActive);
  const queueRemaining = activityQueue.slice(queueIndex);
  const queueSchedule = normalizeQueueSchedule(APP.room.queueSchedule, activityQueue);
  const timedQueueEnabled = APP.room.queueTiming?.enabled === true;
  const timedRemainingMs = getTimedQueueRemainingMs(APP.room);
  const timedEntry = getCurrentQueuedScheduleEntry(APP.room);

  if (!queueFeatureEnabled) {
    return `
      <div class="header">
        <h1 class="logo">Activity Queue</h1>
        <p class="tagline">Room: ${safeRoomCode}</p>
      </div>
      <button class="btn-secondary" data-action="go-screen" data-screen="lobby">← Back to Lobby</button>
      <div style="margin-top:20px;color:var(--text-dim);">Activity Queue is disabled by admin.</div>
    `;
  }

  return `
    <div class="header">
      <h1 class="logo">Activity Queue</h1>
      <p class="tagline">Room: ${safeRoomCode}</p>
    </div>

    <button class="btn-secondary" data-action="go-screen" data-screen="lobby">← Back to Lobby</button>

    <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:16px;">
      <h3 style="font-weight:700;margin-bottom:12px;">Queued Activities</h3>
      ${activityQueue.length ? `
        <div style="margin-bottom:12px;">
          ${activityQueue.map((activityId, idx) => {
            const item = ACTIVITY_QUEUE_ITEM_MAP[activityId];
            if (!item) return '';
            const isCurrentPointer = queueActive && idx === queueIndex;
            const isDone = idx < queueIndex;
            const bg = isDone ? 'rgba(0,210,106,0.06)' : (isCurrentPointer ? 'rgba(0,210,211,0.08)' : 'var(--surface-2)');
            const border = isCurrentPointer ? 'var(--accent)' : 'var(--border)';
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;background:${bg};
                border:1px solid ${border};border-radius:10px;padding:10px 12px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-weight:700;min-width:20px;">${idx + 1}.</span>
                  <span>${item.icon}</span>
                  <span>${escapeHtml(item.label)}</span>
                  <span style="font-size:0.75rem;color:var(--text-dim);">${queueSchedule[idx]?.durationMinutes || DEFAULT_QUEUE_ACTIVITY_DURATION_MINUTES} min</span>
                  ${isCurrentPointer ? '<span style="font-size:0.75rem;color:var(--accent);font-weight:700;">UP NEXT</span>' : ''}
                  ${isDone ? '<span style="font-size:0.75rem;color:var(--success);font-weight:700;">DONE</span>' : ''}
                </div>
                ${isHost ? `<button class="btn-secondary" data-action="queue-remove" data-queue-index="${idx}" style="padding:6px 10px;">Remove</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="color:var(--text-dim);margin-bottom:12px;">No activities queued yet.</div>
      `}
      <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:10px;">
        ${queueActive
          ? (queueRemaining.length ? `${queueRemaining.length} remaining in queue` : 'Queue will complete after this activity')
          : 'Queue is paused'}
      </div>
      ${timedQueueEnabled ? `
        <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:12px;">
          ${timedEntry
            ? `Timed run active: ${escapeHtml(ACTIVITY_QUEUE_ITEM_MAP[timedEntry.activityId]?.label || timedEntry.activityId)} ends in ${escapeHtml(formatClockFromMs(timedRemainingMs))}`
            : 'Timed run is enabled for this queue.'}
        </div>
      ` : ''}

      ${isHost ? `
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px;">
          ${availableQueueItems.map(item => `
            <button class="btn-secondary" data-action="queue-add" data-activity="${item.id}" style="padding:10px 12px;">
              ${item.icon} ${escapeHtml(item.label)}
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-primary" data-action="queue-start" style="width:auto;padding:10px 14px;">Start Queue</button>
          <button class="btn-secondary" data-action="queue-toggle-timed" style="width:auto;padding:10px 14px;">${timedQueueEnabled ? 'Timed Run On' : 'Timed Run Off'}</button>
          <button class="btn-secondary" data-action="queue-next">Next in Queue</button>
          <button class="btn-secondary" data-action="queue-clear">Clear Queue</button>
        </div>
      ` : ''}
    </div>

    ${isHost ? `
      ${queueAiActivities.length
        ? renderAIContentStudioSection('queue')
        : `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-top:16px;color:var(--text-dim);font-size:0.9rem;">
            Add AI-supported activities like Trivia, Icebreaker, Team Jeopardy, Spin Wheel, or Word Chain to unlock queue content generation.
          </div>
        `}
    ` : ''}
  `;
};
