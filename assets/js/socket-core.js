const TEAM_BUILDER_SOCKET_CORE = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_SOCKET_CORE.socketEmitAck = function socketEmitAck(eventName, payload, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    if (!socketClient || !socketClient.connected) {
      reject(new Error('Socket unavailable'));
      return;
    }
    const timeout = setTimeout(() => reject(new Error('Socket timeout')), timeoutMs);
    socketClient.emit(eventName, payload, response => {
      clearTimeout(timeout);
      if (!response || response.ok === false) {
        reject(new Error(response?.error || `Socket ${eventName} failed`));
        return;
      }
      resolve(response);
    });
  });
};

TEAM_BUILDER_SOCKET_CORE.waitForSocketConnection = function waitForSocketConnection(timeoutMs = 1200) {
  return new Promise(resolve => {
    if (!socketClient) {
      resolve(false);
      return;
    }
    if (socketClient.connected) {
      resolve(true);
      return;
    }
    const done = connected => {
      clearTimeout(timer);
      socketClient.off('connect', onConnect);
      resolve(connected);
    };
    const onConnect = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    socketClient.on('connect', onConnect);
  });
};

TEAM_BUILDER_SOCKET_CORE.getSocketClient = async function getSocketClient() {
  if (!isSocketConfigured()) return null;
  if (!socketClient) {
    socketClient = TEAM_BUILDER_SOCKET_CORE.io(SOCKET_SERVER_URL, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: false,
      tryAllTransports: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
    socketClient.on('connect', () => {
      if (APP.roomCode) {
        socketRoomKey = `room:${APP.roomCode}`;
        const authToken = getRoomAccessTokenForKey(socketRoomKey, APP.roomAccessToken || '');
        socketClient.emit('room:subscribe', authToken ? { key: socketRoomKey, authToken } : { key: socketRoomKey });
        roomRealtimeEnabled = true;
        void syncVoiceFeatureState();
      }
    });
    socketClient.on('disconnect', () => {
      roomRealtimeEnabled = false;
      APP.voice.connected = false;
      APP.voice.joining = false;
      APP.voice.isTransmitting = false;
      syncVoiceTrackEnabled();
      render();
    });
    socketClient.on('connect_error', () => {
      roomRealtimeEnabled = false;
    });
  }
  if (!socketRealtimeBound) {
    socketClient.on('shared:update', payload => {
      const key = payload?.key;
      const value = payload?.value;
      if (!key || key !== socketRoomKey || !APP.roomCode) return;
      const room = normalizeRoom(safeParseJson(value));
      if (!room) {
        exitUnavailableRoom('This room has been removed.');
        return;
      }
      APP.room = room;
      void maybeClaimSpinWheelWinnerXp();
      roomRealtimeEnabled = true;
      void syncVoiceFeatureState();
      render();
    });
    socketRealtimeBound = true;
  }
  if (!voiceClientBound) {
    socketClient.on('voice:state', payload => {
      syncVoiceStateFromServer(payload);
    });
    socketClient.on('voice:signal', payload => {
      void handleIncomingVoiceSignal(payload);
    });
    voiceClientBound = true;
  }
  return socketClient;
};
