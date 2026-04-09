const TEAM_BUILDER_DOMAIN_MANAGERS = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_DOMAIN_MANAGERS.PlayerManager = {
  async createProfile(name, avatar) {
    const profile = {
      id: 'player-' + Date.now(),
      name: normalizeName(name),
      avatar: avatar,
      level: 1,
      xp: 0,
      stats: {
        gamesPlayed: 0,
        activitiesCompleted: 0,
        participationInputs: 0
      },
      badges: [],
      created: Date.now()
    };

    await Storage.set('player-profile', JSON.stringify(profile), false);
    return profile;
  },

  async loadProfile() {
    const result = await Storage.get('player-profile', false);
    return result ? safeParseJson(result.value) : null;
  },

  async updateProfile(profile) {
    await Storage.set('player-profile', JSON.stringify(profile), false);
  },

  getXpForNextLevel(level) {
    const base = 1000;
    const growth = 1.22;
    const safeLevel = Math.max(1, Number(level) || 1);
    return Math.round(base * Math.pow(growth, safeLevel - 1));
  },

  async awardXP(amount, reason) {
    const profile = await this.loadProfile();
    if (!profile) return;

    profile.xp += amount;

    let leveledUp = false;
    while (profile.xp >= this.getXpForNextLevel(profile.level)) {
      const xpForNextLevel = this.getXpForNextLevel(profile.level);
      profile.level++;
      profile.xp = profile.xp - xpForNextLevel;
      leveledUp = true;
    }
    if (leveledUp) {
      console.log('🎉 Level up!', profile.level);
      showLevelUp(profile.level);
    }

    await this.updateProfile(profile);
    return profile;
  },

  async incrementGames() {
    const profile = await this.loadProfile();
    if (!profile) return;

    profile.stats.gamesPlayed = (profile.stats.gamesPlayed || 0) + 1;
    await this.updateProfile(profile);
  }
};

TEAM_BUILDER_DOMAIN_MANAGERS.awardParticipationInput = async function awardParticipationInput(room, actionKey, points = 5) {
  if (!room || !APP.player?.name || !actionKey) return;
  room.activityState = room.activityState || {};
  const awards = room.activityState.participationAwards || {};
  if (awards[actionKey]) return;
  awards[actionKey] = Date.now();
  room.activityState.participationAwards = awards;

  const updatedProfile = await TEAM_BUILDER_DOMAIN_MANAGERS.PlayerManager.awardXP(points, `participation:${actionKey}`);
  if (!updatedProfile) return;
  updatedProfile.stats = updatedProfile.stats || {};
  updatedProfile.stats.participationInputs = (updatedProfile.stats.participationInputs || 0) + 1;
  await TEAM_BUILDER_DOMAIN_MANAGERS.PlayerManager.updateProfile(updatedProfile);
  APP.player = updatedProfile;
};

TEAM_BUILDER_DOMAIN_MANAGERS.RoomManager = {
  generateCode() {
    return randomAlphaNum(6);
  },

  generateAccessToken() {
    return randomAlphaNum(24);
  },

  async createRoom(hostId, hostName, hostAvatar, options = {}) {
    const code = this.generateCode();
    const accessToken = this.generateAccessToken();
    const createdAt = Date.now();
    const roomType = String(options.roomType || '').trim().toLowerCase() === 'community' ? 'community' : 'private';
    const communityTitle = roomType === 'community'
      ? String(options.communityTitle || `${normalizeName(hostName || 'Host') || 'Host'}'s Community Lobby`).replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
    const communityDescription = roomType === 'community'
      ? String(options.communityDescription || 'Open lobby for drop-in games and social play.').replace(/\s+/g, ' ').trim().slice(0, 220)
      : '';
    const maxParticipants = Math.max(2, Math.min(MAX_ROOM_PARTICIPANTS, Number(options.maxParticipants) || 24));
    const room = normalizeRoom({
      code: code,
      roomType,
      communityTitle,
      communityDescription,
      maxParticipants,
      host: hostName,
      participants: [createRoomParticipant(hostId, hostName, hostAvatar, true)],
      currentActivity: null,
      activityState: {},
      activityQueue: [],
      queueSchedule: [],
      queueIndex: 0,
      queueActive: false,
      queueTiming: {
        enabled: false,
        currentQueuePointer: -1,
        currentStartedAt: 0,
        currentEndsAt: 0
      },
      access: {
        privateSession: false
      },
      hostSettings: getDefaultRoomHostSettings(),
      created: createdAt,
      lastUpdate: createdAt
    });

    await Storage.set(`room:${code}`, JSON.stringify(room), true, accessToken);
    setStoredRoomAccessToken(code, accessToken);
    return { room, accessToken };
  },

  async joinRoom(code, playerId, playerName, playerAvatar, accessToken = '') {
    const normalizedToken = normalizeRoomAccessToken(accessToken);
    const result = await Storage.get(`room:${code}`, true, normalizedToken);
    if (!result) return null;

    const room = normalizeRoom(safeParseJson(result.value));
    if (!room) return null;

    const existingParticipant = room.participants.find(p => p.id === playerId || p.name === playerName);
    if (!existingParticipant) {
      const maxParticipants = Math.max(2, Math.min(MAX_ROOM_PARTICIPANTS, Number(room.maxParticipants) || 24));
      if ((room.participants?.length || 0) >= maxParticipants) {
        throw new Error(`This room is full (${maxParticipants} participants max).`);
      }
      room.participants.push(createRoomParticipant(playerId, playerName, playerAvatar, false));
      room.participants = normalizeRoomParticipants(room.participants, room.host);
      room.lastUpdate = Date.now();
      await Storage.set(`room:${code}`, JSON.stringify(room), true, normalizedToken);
    } else if (existingParticipant.id !== playerId || existingParticipant.avatar !== playerAvatar || existingParticipant.name !== playerName) {
      room.participants = normalizeRoomParticipants(room.participants.map(participant => {
        if (participant.id !== existingParticipant.id) return participant;
        return {
          ...participant,
          id: normalizeParticipantId(playerId, playerName),
          name: playerName,
          avatar: playerAvatar
        };
      }), room.host);
      room.lastUpdate = Date.now();
      await Storage.set(`room:${code}`, JSON.stringify(room), true, normalizedToken);
    }

    if (normalizedToken) {
      setStoredRoomAccessToken(code, normalizedToken);
    }
    return room;
  },

  async loadRoom(code, accessToken = '') {
    const result = await Storage.get(`room:${code}`, true, accessToken);
    return result ? normalizeRoom(safeParseJson(result.value)) : null;
  },

  async updateRoom(code, room, accessToken = '') {
    const normalizedRoom = normalizeRoom({
      ...(room || {}),
      lastUpdate: Date.now()
    });
    await Storage.set(`room:${code}`, JSON.stringify(normalizedRoom), true, accessToken);
  }
};
