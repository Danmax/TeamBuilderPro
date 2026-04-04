const TEAM_BUILDER_ROOM_SESSION_CORE = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_ROOM_SESSION_CORE.persistActiveSessionSnapshot = function persistActiveSessionSnapshot() {
  if (!APP.player?.id || !APP.player?.name || !APP.roomCode) return;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify({
    roomCode: APP.roomCode,
    accessToken: APP.roomAccessToken || '',
    playerId: APP.player.id,
    playerName: APP.player.name
  }));
};

TEAM_BUILDER_ROOM_SESSION_CORE.clearActiveSessionSnapshot = function clearActiveSessionSnapshot() {
  localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
};

TEAM_BUILDER_ROOM_SESSION_CORE.exitUnavailableRoom = function exitUnavailableRoom(message = 'Room no longer available.') {
  stopRoomSync();
  ticTacToeFinalizePending = false;
  APP.room = null;
  APP.roomCode = null;
  APP.roomAccessToken = null;
  clearActiveSessionSnapshot();
  APP.showHostSettings = false;
  APP.screen = 'dashboard';
  resetWordChainFocusState();
  showError(message);
  render();
};

TEAM_BUILDER_ROOM_SESSION_CORE.startRoomRealtime = async function startRoomRealtime() {
  roomRealtimeEnabled = false;
  if (!APP.roomCode) return false;

  const sharedKey = `room:${APP.roomCode}`;

  const socket = await getSocketClient();
  if (socket && socket.connected) {
    socketRoomKey = sharedKey;
    const authToken = getRoomAccessTokenForKey(sharedKey, APP.roomAccessToken || '');
    socket.emit('room:subscribe', authToken ? { key: sharedKey, authToken } : { key: sharedKey });
    roomRealtimeEnabled = true;
    return true;
  }

  const client = await getSupabaseClient();
  if (!client) return false;

  if (roomChannel) {
    await client.removeChannel(roomChannel);
    roomChannel = null;
  }

  roomChannel = client
    .channel(`room-sync-${APP.roomCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_state',
        filter: `key=eq.${sharedKey}`
      },
      payload => {
        const value = payload.new?.value || payload.old?.value;
        const room = normalizeRoom(safeParseJson(value));
        if (room) {
          APP.room = room;
          void syncVoiceFeatureState();
          render();
        }
      }
    )
    .subscribe(status => {
      roomRealtimeEnabled = status === 'SUBSCRIBED';
    });

  return true;
};

TEAM_BUILDER_ROOM_SESSION_CORE.stopRoomRealtime = async function stopRoomRealtime() {
  await leaveVoiceSession();
  const socket = socketClient;
  if (socket && socket.connected && socketRoomKey) {
    socket.emit('room:unsubscribe', { key: socketRoomKey });
    socketRoomKey = null;
  }

  const client = await getSupabaseClient();
  if (client && roomChannel) {
    await client.removeChannel(roomChannel);
    roomChannel = null;
  }
  roomRealtimeEnabled = false;
};

TEAM_BUILDER_ROOM_SESSION_CORE.stopRoomSync = function stopRoomSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  stopRoomRealtime();
};

TEAM_BUILDER_ROOM_SESSION_CORE.restoreActiveSession = async function restoreActiveSession() {
  const snapshot = loadActiveSessionSnapshot();
  if (!snapshot || !APP.player?.id || !APP.player?.name) return false;
  if (snapshot.playerId !== APP.player.id || snapshot.playerName !== APP.player.name) {
    clearActiveSessionSnapshot();
    return false;
  }

  const accessToken = snapshot.accessToken || getStoredRoomAccessToken(snapshot.roomCode);
  const room = await RoomManager.loadRoom(snapshot.roomCode, accessToken);
  if (!room) {
    clearActiveSessionSnapshot();
    return false;
  }

  const participantMatch = Array.isArray(room.participants)
    && room.participants.some(player => player?.id === APP.player.id || player?.name === APP.player.name);
  const hostMatch = room.host === APP.player.name;
  if (!participantMatch && !hostMatch) {
    clearActiveSessionSnapshot();
    return false;
  }

  APP.room = room;
  APP.roomCode = snapshot.roomCode;
  APP.roomAccessToken = isRoomPrivateSession(room) ? accessToken : '';
  APP.screen = 'lobby';
  persistActiveSessionSnapshot();
  startRoomSync();
  return true;
};

TEAM_BUILDER_ROOM_SESSION_CORE.createRoomAndNavigate = async function createRoomAndNavigate(options = {}) {
  render();

  const { room, accessToken } = await RoomManager.createRoom(APP.player.id, APP.player.name, APP.player.avatar, options);
  APP.room = room;
  APP.roomCode = room.code;
  APP.roomAccessToken = isRoomPrivateSession(room) ? accessToken : '';
  APP.screen = 'lobby';
  persistActiveSessionSnapshot();

  startRoomSync();
  render();
};

TEAM_BUILDER_ROOM_SESSION_CORE.createCommunityRoomAndNavigate = async function createCommunityRoomAndNavigate() {
  if (APP.preferences.enableCommunityLobby === false) {
    showError('Community Lobby is disabled by admin.');
    return;
  }
  if (!canCurrentUserCreateCommunityRooms()) {
    showError('Admin access or host allowlist approval is required to create community rooms.');
    return;
  }
  await createRoomAndNavigate({
    roomType: 'community',
    communityTitle: `${APP.player?.name || 'Host'}'s Community Lobby`,
    communityDescription: 'Open lobby for drop-in games and social play.',
    maxParticipants: 24
  });
};

TEAM_BUILDER_ROOM_SESSION_CORE.createRoomFromSessionPlan = async function createRoomFromSessionPlan(planId) {
  const plan = getSessionPlanById(planId);
  if (!plan || !APP.player?.id) return;
  render();
  const created = await RoomManager.createRoom(APP.player.id, APP.player.name, APP.player.avatar);
  const room = applySessionPlanToRoom(created.room, plan);
  await RoomManager.updateRoom(room.code, room, created.accessToken);
  APP.room = normalizeRoom(room);
  APP.roomCode = room.code;
  APP.roomAccessToken = created.accessToken;
  APP.screen = 'lobby';
  persistActiveSessionSnapshot();
  startRoomSync();
  render();
};

TEAM_BUILDER_ROOM_SESSION_CORE.joinRoom = async function joinRoom() {
  const code = normalizeRoomCode(document.getElementById('joinCode')?.value || '');
  const accessToken = normalizeRoomAccessToken(
    document.getElementById('joinToken')?.value
    || APP.pendingJoinToken
    || getStoredRoomAccessToken(code)
  );
  if (!/^[A-Z0-9]{6}$/.test(code || '')) {
    showError('Please enter a valid 6-digit room code');
    return;
  }

  let room = null;
  try {
    room = await RoomManager.joinRoom(code, APP.player.id, APP.player.name, APP.player.avatar, accessToken);
  } catch (e) {
    showError(e.message || 'Unable to join this room.');
    return;
  }
  if (!room) {
    showError('Room not found, or this private session requires a valid access token.');
    return;
  }

  APP.room = room;
  APP.roomCode = code;
  APP.roomAccessToken = isRoomPrivateSession(room) ? accessToken : '';
  APP.pendingJoinCode = '';
  APP.pendingJoinToken = '';
  APP.screen = 'lobby';
  persistActiveSessionSnapshot();

  startRoomSync();
  render();
};

TEAM_BUILDER_ROOM_SESSION_CORE.joinRoomByCode = async function joinRoomByCode(code, accessToken = '') {
  const normalizedCode = normalizeRoomCode(code);
  let room = null;
  try {
    room = await RoomManager.joinRoom(normalizedCode, APP.player.id, APP.player.name, APP.player.avatar, normalizeRoomAccessToken(accessToken));
  } catch (e) {
    showError(e.message || 'Unable to join that lobby.');
    return;
  }
  if (!room) {
    showError('Unable to join that lobby.');
    return;
  }
  APP.room = room;
  APP.roomCode = normalizedCode;
  APP.roomAccessToken = isRoomPrivateSession(room) ? normalizeRoomAccessToken(accessToken) : '';
  APP.pendingJoinCode = '';
  APP.pendingJoinToken = '';
  APP.screen = 'lobby';
  persistActiveSessionSnapshot();
  startRoomSync();
  render();
};

TEAM_BUILDER_ROOM_SESSION_CORE.leaveSession = async function leaveSession() {
  if (!APP.roomCode || !APP.player?.name) {
    APP.room = null;
    APP.roomCode = null;
    APP.roomAccessToken = null;
    clearActiveSessionSnapshot();
    APP.showHostSettings = false;
    APP.screen = 'dashboard';
    stopRoomSync();
    resetWordChainFocusState();
    render();
    return;
  }

  const room = await RoomManager.loadRoom(APP.roomCode);
  if (room) {
    room.participants = (room.participants || []).filter(p => p.id !== APP.player.id && p.name !== APP.player.name);
    if (room.participants.length > 0) {
      if (room.host === APP.player.name) {
        room.host = room.participants[0].name;
      }
      room.participants = normalizeRoomParticipants(room.participants.map(p => ({
        ...p,
        isHost: p.name === room.host
      })), room.host);
    } else {
      room.host = null;
      room.currentActivity = null;
      room.activityState = {};
    }
    await RoomManager.updateRoom(APP.roomCode, room);
  }

  stopRoomSync();
  ticTacToeFinalizePending = false;
  APP.room = null;
  APP.roomCode = null;
  APP.roomAccessToken = null;
  clearActiveSessionSnapshot();
  APP.showHostSettings = false;
  APP.screen = 'dashboard';
  resetWordChainFocusState();
  render();
};

TEAM_BUILDER_ROOM_SESSION_CORE.startRoomSync = function startRoomSync() {
  if (syncInterval) clearInterval(syncInterval);
  startRoomRealtime();
  syncInterval = setInterval(async () => {
    if (!APP.roomCode) return;
    if (!roomRealtimeEnabled) {
      const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
      if (!room) {
        exitUnavailableRoom('This room has been removed.');
        return;
      }
      if (room.lastUpdate !== APP.room?.lastUpdate) {
        APP.room = room;
        void maybeClaimSpinWheelWinnerXp();
        void syncVoiceFeatureState();
        render();
      }
    }

    if (APP.room?.currentActivity === 'lightning-trivia' && !APP.room?.activityState?.revealed) {
      const state = APP.room.activityState || {};
      const hostSettings = getRoomHostSettings(APP.room);
      const answersCount = Object.keys(state.answers || {}).length;
      const participantCount = APP.room.participants?.length || 0;
      const allAnswered = participantCount > 0 && answersCount >= participantCount;
      const startTime = state.startTime || Date.now();
      const timedOut = Date.now() - startTime >= 20000;
      const isHost = APP.room.host === APP.player?.name;

      if (hostSettings.autoRevealLightning && isHost && !lightningAutoRevealPending && (allAnswered || timedOut)) {
        lightningAutoRevealPending = true;
        try {
          await revealAnswer();
        } finally {
          lightningAutoRevealPending = false;
        }
      }
      render();
    }

    if (APP.room?.currentActivity === 'tic-tac-toe-blitz') {
      const state = APP.room.activityState || {};
      const isHost = APP.room.host === APP.player?.name;
      const timedOut = !state.roundClosed && Date.now() >= (Number(state.roundEndsAt) || 0);
      if (timedOut && isHost && !ticTacToeFinalizePending) {
        ticTacToeFinalizePending = true;
        try {
          await closeTicTacToeRound();
        } finally {
          ticTacToeFinalizePending = false;
        }
      }
      render();
    }

    if (APP.room?.queueActive && APP.room?.queueTiming?.enabled) {
      await maybeAdvanceTimedQueue();
      render();
    }
  }, ROOM_SYNC_MS);
};
