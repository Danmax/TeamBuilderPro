const DJ_BOOTH_DECK_KEYS = Array.isArray(window.TEAM_BUILDER_STATIC_DATA?.DJ_BOOTH_DECK_KEYS)
  ? [...window.TEAM_BUILDER_STATIC_DATA.DJ_BOOTH_DECK_KEYS]
  : ['deckA', 'deckB'];
const DJ_BOOTH_TONE_IDS = Array.isArray(window.TEAM_BUILDER_STATIC_DATA?.DJ_BOOTH_TONE_IDS)
  ? [...window.TEAM_BUILDER_STATIC_DATA.DJ_BOOTH_TONE_IDS]
  : ['airhorn', 'laser'];
let djBoothApiPromise = null;
let djBoothPadAudioContext = null;
let djBoothProgressFrame = 0;
const djBoothPlayers = {
  deckA: null,
  deckB: null
};
const djBoothLocalDeckAudio = {
  deckA: null,
  deckB: null
};
const djBoothLocalDeckMeta = {
  deckA: null,
  deckB: null
};
let djBoothParkingLot = null;
let djBoothClipRecorder = null;
let djBoothClipRecorderStream = null;
let djBoothClipRecorderChunks = [];
let djBoothClipRecorderStartedAt = 0;
let djBoothClipRecorderTimer = 0;

function getDefaultDjBoothUiState() {
  return {
    lastPadTriggerAt: 0,
    recordingClip: false,
    recordingSeconds: 0,
    deckTitles: {
      deckA: '',
      deckB: ''
    },
    localDecks: {
      deckA: null,
      deckB: null
    }
  };
}


function getDefaultDjBoothPads() {
  return [
    { id: 'pad-1', label: 'Air Horn', emoji: '📣', tone: 'airhorn', color: '#ff6b6b' },
    { id: 'pad-2', label: 'Laser', emoji: '✨', tone: 'laser', color: '#7c3aed' },
    { id: 'pad-3', label: 'Clap', emoji: '👏', tone: 'clap', color: '#f59e0b' },
    { id: 'pad-4', label: 'Chime', emoji: '🔔', tone: 'chime', color: '#22c55e' },
    { id: 'pad-5', label: 'Bass Drop', emoji: '💥', tone: 'bass', color: '#0ea5e9' },
    { id: 'pad-6', label: 'Siren', emoji: '🚨', tone: 'siren', color: '#ef4444' },
    { id: 'pad-7', label: 'Sparkle', emoji: '🌟', tone: 'sparkle', color: '#facc15' },
    { id: 'pad-8', label: 'Hit', emoji: '🥁', tone: 'hit', color: '#14b8a6' }
  ];
}

function normalizeDjBoothPad(rawPad, idx = 0) {
  const fallback = getDefaultDjBoothPads()[idx] || { id: `pad-${idx + 1}`, label: `Pad ${idx + 1}`, emoji: '🎛️', tone: DJ_BOOTH_TONE_IDS[idx % DJ_BOOTH_TONE_IDS.length], color: '#00d2d3' };
  const tone = DJ_BOOTH_TONE_IDS.includes(String(rawPad?.tone || '').trim()) ? String(rawPad.tone).trim() : fallback.tone;
  return {
    id: String(rawPad?.id || fallback.id).trim() || fallback.id,
    label: String(rawPad?.label || fallback.label).replace(/\s+/g, ' ').trim().slice(0, 24) || fallback.label,
    emoji: normalizeEmoji(rawPad?.emoji || '') || fallback.emoji,
    tone,
    color: isValidHexColor(rawPad?.color || '') ? String(rawPad.color).trim() : fallback.color
  };
}

function normalizeDjBoothPads(rawPads) {
  const base = Array.isArray(rawPads) && rawPads.length ? rawPads : getDefaultDjBoothPads();
  return Array.from({ length: 8 }, (_, idx) => normalizeDjBoothPad(base[idx], idx));
}

function normalizeDjBoothTrack(rawTrack, idx = 0) {
  if (!rawTrack || typeof rawTrack !== 'object') return null;
  const id = String(rawTrack.id || `track-${idx + 1}`).trim().slice(0, 80);
  const name = String(rawTrack.name || rawTrack.sourceLabel || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const url = getAbsoluteApiUrl(String(rawTrack.url || rawTrack.sourceUrl || '').trim()).slice(0, 500);
  if (!id || !name || !url) return null;
  return {
    id,
    name,
    url,
    storageKey: String(rawTrack.storageKey || '').trim().slice(0, 180),
    contentType: String(rawTrack.contentType || '').trim().slice(0, 80),
    size: Math.max(0, Number(rawTrack.size) || 0),
    uploadedAt: String(rawTrack.uploadedAt || '').trim().slice(0, 80),
    uploadedBy: String(rawTrack.uploadedBy || '').replace(/\s+/g, ' ').trim().slice(0, 32)
  };
}

function normalizeDjBoothTrackLibrary(rawLibrary) {
  if (!Array.isArray(rawLibrary)) return [];
  return rawLibrary
    .map((track, idx) => normalizeDjBoothTrack(track, idx))
    .filter(Boolean)
    .slice(0, 48);
}

function parseYouTubeSource(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { sourceUrl: '', sourceType: 'none', videoId: '', playlistId: '', trackIndex: 0 };
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    let videoId = '';
    let playlistId = '';
    let trackIndex = Math.max(0, Number.parseInt(parsed.searchParams.get('index') || '0', 10) - 1);
    if (host === 'youtu.be') {
      videoId = parsed.pathname.replace(/\//g, '').trim();
      playlistId = parsed.searchParams.get('list') || '';
    } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
        playlistId = parsed.searchParams.get('list') || '';
      } else if (parsed.pathname === '/playlist') {
        playlistId = parsed.searchParams.get('list') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] || '';
        playlistId = parsed.searchParams.get('list') || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] || '';
      }
    }
    videoId = String(videoId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
    playlistId = String(playlistId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    return {
      sourceUrl: raw,
      sourceType: playlistId ? 'playlist' : videoId ? 'video' : 'none',
      videoId,
      playlistId,
      trackIndex: Math.max(0, trackIndex)
    };
  } catch (_error) {
    return { sourceUrl: raw, sourceType: 'none', videoId: '', playlistId: '', trackIndex: 0 };
  }
}

function createDjBoothDeckState(label = 'Deck') {
  return {
    label,
    sourceMode: 'youtube',
    sourceUrl: '',
    sourceType: 'none',
    sourceLabel: '',
    videoId: '',
    playlistId: '',
    trackIndex: 0,
    playing: false,
    volume: 82,
    positionSeconds: 0,
    lastActionAt: Date.now()
  };
}

function normalizeDjBoothDeckState(rawDeck, fallbackLabel = 'Deck') {
  const requestedSourceMode = String(rawDeck?.sourceMode || '').trim();
  const sourceMode = ['local', 'shared'].includes(requestedSourceMode) ? requestedSourceMode : 'youtube';
  if (sourceMode === 'shared') {
    return {
      label: String(rawDeck?.label || fallbackLabel).replace(/\s+/g, ' ').trim().slice(0, 24) || fallbackLabel,
      sourceMode: 'shared',
      sourceUrl: String(rawDeck?.sourceUrl || '').trim().slice(0, 500),
      sourceType: 'audio',
      sourceLabel: String(rawDeck?.sourceLabel || `${fallbackLabel} shared track`).replace(/\s+/g, ' ').trim().slice(0, 80) || `${fallbackLabel} shared track`,
      videoId: '',
      playlistId: '',
      trackIndex: 0,
      playing: rawDeck?.playing === true,
      volume: Math.max(0, Math.min(100, Number.parseInt(rawDeck?.volume ?? 82, 10) || 82)),
      positionSeconds: Math.max(0, Number(rawDeck?.positionSeconds) || 0),
      lastActionAt: Number(rawDeck?.lastActionAt) || Date.now()
    };
  }
  if (sourceMode === 'local') {
    return {
      label: String(rawDeck?.label || fallbackLabel).replace(/\s+/g, ' ').trim().slice(0, 24) || fallbackLabel,
      sourceMode: 'local',
      sourceUrl: '',
      sourceType: 'local',
      sourceLabel: String(rawDeck?.sourceLabel || rawDeck?.label || `${fallbackLabel} local file`).replace(/\s+/g, ' ').trim().slice(0, 80) || `${fallbackLabel} local file`,
      videoId: '',
      playlistId: '',
      trackIndex: 0,
      playing: rawDeck?.playing === true,
      volume: Math.max(0, Math.min(100, Number.parseInt(rawDeck?.volume ?? 82, 10) || 82)),
      positionSeconds: Math.max(0, Number(rawDeck?.positionSeconds) || 0),
      lastActionAt: Number(rawDeck?.lastActionAt) || Date.now()
    };
  }
  const source = parseYouTubeSource(rawDeck?.sourceUrl || '');
  return {
    label: String(rawDeck?.label || fallbackLabel).replace(/\s+/g, ' ').trim().slice(0, 24) || fallbackLabel,
    sourceMode: 'youtube',
    sourceUrl: String(rawDeck?.sourceUrl || source.sourceUrl || '').trim().slice(0, 500),
    sourceType: source.sourceType,
    sourceLabel: String(rawDeck?.sourceLabel || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    videoId: String(source.videoId || '').trim(),
    playlistId: String(source.playlistId || '').trim(),
    trackIndex: Math.max(0, Number.parseInt(rawDeck?.trackIndex ?? source.trackIndex ?? 0, 10) || 0),
    playing: rawDeck?.playing === true,
    volume: Math.max(0, Math.min(100, Number.parseInt(rawDeck?.volume ?? 82, 10) || 82)),
    positionSeconds: Math.max(0, Number(rawDeck?.positionSeconds) || 0),
    lastActionAt: Number(rawDeck?.lastActionAt) || Date.now()
  };
}

function normalizeDjBoothState(rawState) {
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const lights = source.lights && typeof source.lights === 'object' ? source.lights : {};
  return {
    marqueeText: String(source.marqueeText || 'Broadcast live from the Team Builder DJ Booth').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Broadcast live from the Team Builder DJ Booth',
    masterVolume: Math.max(0, Math.min(100, Number.parseInt(source.masterVolume ?? 86, 10) || 86)),
    crossfader: Math.max(0, Math.min(100, Number.parseInt(source.crossfader ?? 50, 10) || 50)),
    micLive: source.micLive === true,
    deckA: normalizeDjBoothDeckState(source.deckA, 'Deck A'),
    deckB: normalizeDjBoothDeckState(source.deckB, 'Deck B'),
    trackLibrary: normalizeDjBoothTrackLibrary(source.trackLibrary),
    soundPads: normalizeDjBoothPads(source.soundPads),
    activePadId: String(source.activePadId || '').trim(),
    lastPadTriggerAt: Number(source.lastPadTriggerAt) || 0,
    lights: {
      enabled: lights.enabled !== false,
      mode: ['ambient', 'pulse', 'wave', 'strobe', 'party'].includes(String(lights.mode || '').trim()) ? String(lights.mode).trim() : 'pulse',
      speed: Math.max(10, Math.min(100, Number.parseInt(lights.speed ?? 55, 10) || 55)),
      intensity: Math.max(10, Math.min(100, Number.parseInt(lights.intensity ?? 75, 10) || 75)),
      colorA: isValidHexColor(lights.colorA || '') ? String(lights.colorA).trim() : '#00d2d3',
      colorB: isValidHexColor(lights.colorB || '') ? String(lights.colorB).trim() : '#ff4d8d',
      flashAt: Number(lights.flashAt) || 0
    },
    updatedAt: Number(source.updatedAt) || Date.now()
  };
}

function createDjBoothState() {
  return normalizeDjBoothState({
    deckA: createDjBoothDeckState('Deck A'),
    deckB: createDjBoothDeckState('Deck B'),
    trackLibrary: [],
    soundPads: getDefaultDjBoothPads(),
    marqueeText: 'Broadcast live from the Team Builder DJ Booth',
    masterVolume: 86,
    crossfader: 50,
    micLive: false,
    activePadId: '',
    lastPadTriggerAt: 0,
    lights: {
      enabled: true,
      mode: 'pulse',
      speed: 55,
      intensity: 75,
      colorA: '#00d2d3',
      colorB: '#ff4d8d',
      flashAt: 0
    },
    updatedAt: Date.now()
  });
}

function getDjBoothEffectiveDeckPosition(deck) {
  const safeDeck = normalizeDjBoothDeckState(deck, deck?.label || 'Deck');
  if (!safeDeck.playing) return safeDeck.positionSeconds;
  return Math.max(0, safeDeck.positionSeconds + ((Date.now() - safeDeck.lastActionAt) / 1000));
}

function computeDjBoothDeckEffectiveVolume(state, deckKey) {
  const safeState = normalizeDjBoothState(state);
  const deck = safeState[deckKey];
  if (!deck) return 0;
  const cross = Math.max(0, Math.min(100, Number(safeState.crossfader) || 50));
  const master = Math.max(0, Math.min(100, Number(safeState.masterVolume) || 0)) / 100;
  const deckVolume = Math.max(0, Math.min(100, Number(deck.volume) || 0)) / 100;
  const crossFactor = deckKey === 'deckA'
    ? Math.min(1, Math.max(0, (100 - cross) / 50))
    : Math.min(1, Math.max(0, cross / 50));
  return Math.round(deckVolume * crossFactor * master * 100);
}

function ensureDjBoothAudioContext() {
  if (djBoothPadAudioContext) return djBoothPadAudioContext;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  djBoothPadAudioContext = new AudioCtx();
  return djBoothPadAudioContext;
}

function scheduleDjBoothTone(ctx, { type = 'sine', frequency = 440, gain = 0.2, startOffset = 0, duration = 0.2, endFrequency = null }) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startOffset);
  if (endFrequency != null) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), ctx.currentTime + startOffset + duration);
  }
  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), ctx.currentTime + startOffset + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
  oscillator.connect(gainNode).connect(ctx.destination);
  oscillator.start(ctx.currentTime + startOffset);
  oscillator.stop(ctx.currentTime + startOffset + duration + 0.05);
}

function playDjBoothPadSound(pad) {
  const ctx = ensureDjBoothAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const tone = String(pad?.tone || '').trim();
  if (tone === 'airhorn') {
    scheduleDjBoothTone(ctx, { type: 'sawtooth', frequency: 520, endFrequency: 250, gain: 0.28, duration: 0.7 });
    scheduleDjBoothTone(ctx, { type: 'triangle', frequency: 780, endFrequency: 360, gain: 0.14, duration: 0.7 });
    return;
  }
  if (tone === 'laser') {
    scheduleDjBoothTone(ctx, { type: 'square', frequency: 900, endFrequency: 120, gain: 0.2, duration: 0.3 });
    scheduleDjBoothTone(ctx, { type: 'triangle', frequency: 1200, endFrequency: 180, gain: 0.08, startOffset: 0.04, duration: 0.28 });
    return;
  }
  if (tone === 'clap') {
    scheduleDjBoothTone(ctx, { type: 'square', frequency: 240, endFrequency: 90, gain: 0.08, duration: 0.08 });
    scheduleDjBoothTone(ctx, { type: 'square', frequency: 260, endFrequency: 100, gain: 0.08, startOffset: 0.05, duration: 0.08 });
    scheduleDjBoothTone(ctx, { type: 'square', frequency: 300, endFrequency: 110, gain: 0.08, startOffset: 0.1, duration: 0.08 });
    return;
  }
  if (tone === 'chime') {
    scheduleDjBoothTone(ctx, { type: 'sine', frequency: 660, gain: 0.12, duration: 0.34 });
    scheduleDjBoothTone(ctx, { type: 'sine', frequency: 990, gain: 0.11, startOffset: 0.08, duration: 0.34 });
    scheduleDjBoothTone(ctx, { type: 'triangle', frequency: 1320, gain: 0.07, startOffset: 0.16, duration: 0.28 });
    return;
  }
  if (tone === 'bass') {
    scheduleDjBoothTone(ctx, { type: 'sine', frequency: 120, endFrequency: 48, gain: 0.3, duration: 0.55 });
    scheduleDjBoothTone(ctx, { type: 'triangle', frequency: 60, endFrequency: 35, gain: 0.16, duration: 0.6 });
    return;
  }
  if (tone === 'siren') {
    scheduleDjBoothTone(ctx, { type: 'square', frequency: 520, endFrequency: 900, gain: 0.12, duration: 0.35 });
    scheduleDjBoothTone(ctx, { type: 'square', frequency: 900, endFrequency: 520, gain: 0.12, startOffset: 0.35, duration: 0.35 });
    return;
  }
  if (tone === 'sparkle') {
    [880, 1320, 1760, 1480].forEach((frequency, idx) => {
      scheduleDjBoothTone(ctx, { type: 'triangle', frequency, gain: 0.08, startOffset: idx * 0.05, duration: 0.16 });
    });
    return;
  }
  scheduleDjBoothTone(ctx, { type: 'triangle', frequency: 210, endFrequency: 90, gain: 0.18, duration: 0.22 });
}

function maybePlayDjBoothPadTrigger(state) {
  const safeState = normalizeDjBoothState(state);
  const stamp = Number(safeState.lastPadTriggerAt) || 0;
  if (stamp <= (Number(APP.djBoothUi.lastPadTriggerAt) || 0)) return;
  APP.djBoothUi.lastPadTriggerAt = stamp;
  const pad = safeState.soundPads.find(item => item.id === safeState.activePadId);
  if (pad) playDjBoothPadSound(pad);
}

function teardownDjBoothPlayers() {
  if (djBoothProgressFrame) {
    cancelAnimationFrame(djBoothProgressFrame);
    djBoothProgressFrame = 0;
  }
  if (djBoothClipRecorder || djBoothClipRecorderStream) {
    cleanupDjBoothClipRecorder();
  }
  DJ_BOOTH_DECK_KEYS.forEach(deckKey => {
    const player = djBoothPlayers[deckKey];
    if (player && typeof player.destroy === 'function') {
      try {
        player.destroy();
      } catch (_error) {
        // Ignore player teardown races during rerenders.
      }
    }
    djBoothPlayers[deckKey] = null;
  });
  DJ_BOOTH_DECK_KEYS.forEach(deckKey => {
    const audio = djBoothLocalDeckAudio[deckKey];
    if (audio instanceof HTMLAudioElement) {
      try {
        audio.pause();
      } catch (_error) {
        // Ignore audio teardown races.
      }
    }
    const meta = djBoothLocalDeckMeta[deckKey];
    if (meta?.objectUrl) {
      try {
        URL.revokeObjectURL(meta.objectUrl);
      } catch (_error) {
        // Ignore revoked URL races.
      }
    }
    djBoothLocalDeckAudio[deckKey] = null;
    djBoothLocalDeckMeta[deckKey] = null;
  });
}

function ensureDjBoothParkingLot() {
  if (djBoothParkingLot instanceof HTMLElement && document.body.contains(djBoothParkingLot)) {
    return djBoothParkingLot;
  }
  djBoothParkingLot = document.createElement('div');
  djBoothParkingLot.id = 'djBoothParkingLot';
  djBoothParkingLot.style.display = 'none';
  document.body.appendChild(djBoothParkingLot);
  return djBoothParkingLot;
}

function preserveDjBoothPlayersBeforeRender() {
  if (APP.room?.currentActivity !== 'dj-booth') return;
  const parkingLot = ensureDjBoothParkingLot();
  DJ_BOOTH_DECK_KEYS.forEach(deckKey => {
    const player = djBoothPlayers[deckKey];
    if (!player || typeof player.getIframe !== 'function') return;
    try {
      const iframe = player.getIframe();
      if (iframe instanceof HTMLElement) parkingLot.appendChild(iframe);
    } catch (_error) {
      // Ignore stale iframe references during rerender.
    }
  });
}

function restoreDjBoothPlayersAfterRender() {
  if (APP.room?.currentActivity !== 'dj-booth') return;
  DJ_BOOTH_DECK_KEYS.forEach(deckKey => {
    const player = djBoothPlayers[deckKey];
    if (!player || typeof player.getIframe !== 'function') return;
    try {
      const iframe = player.getIframe();
      const container = document.getElementById(`djBoothPlayer-${deckKey}`);
      if (iframe instanceof HTMLElement && container instanceof HTMLElement && !container.contains(iframe)) {
        container.innerHTML = '';
        container.appendChild(iframe);
      }
    } catch (_error) {
      // Ignore stale iframe references during rerender.
    }
  });
}

function setDjBoothLocalDeckAudio(deckKey, file) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey) || !(file instanceof File)) return null;
  clearDjBoothLocalDeckAudio(deckKey);
  const objectUrl = URL.createObjectURL(file);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';
  audio.loop = false;
  audio.addEventListener('ended', () => {
    void updateDjBoothState(state => {
      const deck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
      deck.playing = false;
      deck.positionSeconds = Number.isFinite(audio.duration) ? audio.duration : deck.positionSeconds;
      deck.lastActionAt = Date.now();
      state[deckKey] = deck;
    });
  });
  djBoothLocalDeckAudio[deckKey] = audio;
  djBoothLocalDeckMeta[deckKey] = {
    sourceMode: 'local',
    sourceUrl: objectUrl,
    fileName: file.name,
    objectUrl,
    size: file.size
  };
  APP.djBoothUi = APP.djBoothUi && typeof APP.djBoothUi === 'object' ? APP.djBoothUi : getDefaultDjBoothUiState();
  APP.djBoothUi.localDecks = {
    ...(APP.djBoothUi.localDecks || {}),
    [deckKey]: {
      fileName: file.name,
      size: file.size
    }
  };
  return audio;
}

function clearDjBoothLocalDeckAudio(deckKey) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  const existingAudio = djBoothLocalDeckAudio[deckKey];
  if (existingAudio instanceof HTMLAudioElement) {
    try {
      existingAudio.pause();
    } catch (_error) {
      // Ignore teardown races.
    }
  }
  const existingMeta = djBoothLocalDeckMeta[deckKey];
  if (existingMeta?.objectUrl) {
    try {
      URL.revokeObjectURL(existingMeta.objectUrl);
    } catch (_error) {
      // Ignore revoked URL races.
    }
  }
  djBoothLocalDeckAudio[deckKey] = null;
  djBoothLocalDeckMeta[deckKey] = null;
  APP.djBoothUi = APP.djBoothUi && typeof APP.djBoothUi === 'object' ? APP.djBoothUi : getDefaultDjBoothUiState();
  APP.djBoothUi.localDecks = {
    ...(APP.djBoothUi.localDecks || {}),
    [deckKey]: null
  };
}

function resetDjBoothClipRecorderUi() {
  APP.djBoothUi = APP.djBoothUi && typeof APP.djBoothUi === 'object' ? APP.djBoothUi : getDefaultDjBoothUiState();
  APP.djBoothUi.recordingClip = false;
  APP.djBoothUi.recordingSeconds = 0;
}

function cleanupDjBoothClipRecorder() {
  if (djBoothClipRecorderTimer) {
    clearInterval(djBoothClipRecorderTimer);
    djBoothClipRecorderTimer = 0;
  }
  if (djBoothClipRecorderStream) {
    djBoothClipRecorderStream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (_error) {
        // Ignore track stop races.
      }
    });
  }
  djBoothClipRecorder = null;
  djBoothClipRecorderStream = null;
  djBoothClipRecorderChunks = [];
  djBoothClipRecorderStartedAt = 0;
  resetDjBoothClipRecorderUi();
}

async function startDjBoothClipRecording() {
  if (djBoothClipRecorder || APP.room?.host !== APP.player?.name) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showError('This browser does not support mic clip recording.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported?.('audio/webm') ? 'audio/webm' : '');
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    djBoothClipRecorder = recorder;
    djBoothClipRecorderStream = stream;
    djBoothClipRecorderChunks = [];
    djBoothClipRecorderStartedAt = Date.now();
    APP.djBoothUi = APP.djBoothUi && typeof APP.djBoothUi === 'object' ? APP.djBoothUi : getDefaultDjBoothUiState();
    APP.djBoothUi.recordingClip = true;
    APP.djBoothUi.recordingSeconds = 0;
    recorder.addEventListener('dataavailable', event => {
      if (event.data && event.data.size > 0) djBoothClipRecorderChunks.push(event.data);
    });
    recorder.start(250);
    djBoothClipRecorderTimer = window.setInterval(() => {
      if (!djBoothClipRecorderStartedAt) return;
      APP.djBoothUi.recordingSeconds = Math.max(0, Math.floor((Date.now() - djBoothClipRecorderStartedAt) / 1000));
      render();
    }, 500);
    render();
  } catch (error) {
    cleanupDjBoothClipRecorder();
    showError(error.message || 'Unable to access the microphone for recording.');
  }
}

async function stopDjBoothClipRecording() {
  if (!djBoothClipRecorder) return;
  const recorder = djBoothClipRecorder;
  const mimeType = recorder.mimeType || 'audio/webm';
  const stopped = new Promise((resolve, reject) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.addEventListener('error', event => reject(event.error || new Error('Recording failed.')), { once: true });
  });
  try {
    recorder.stop();
    await stopped;
    const blob = new Blob(djBoothClipRecorderChunks, { type: mimeType });
    if (!blob.size) throw new Error('Recorded clip is empty.');
    const clipStamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s+/g, '');
    const defaultName = `DJ Clip ${clipStamp}`;
    const requestedName = prompt('Name this recorded clip', defaultName);
    cleanupDjBoothClipRecorder();
    if (requestedName === null) return;
    const safeName = String(requestedName || '').replace(/\s+/g, ' ').trim().slice(0, 64) || defaultName;
    const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : 'webm';
    const file = new File([blob], `${safeName}.${extension}`, { type: mimeType });
    await addDjBoothSharedTrack(file);
  } catch (error) {
    cleanupDjBoothClipRecorder();
    showError(error.message || 'Unable to finish the recorded clip.');
  }
}

function ensureDjBoothSharedDeckAudio(deckKey, deck) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return null;
  const safeDeck = normalizeDjBoothDeckState(deck, deckKey === 'deckA' ? 'Deck A' : 'Deck B');
  if (safeDeck.sourceMode !== 'shared' || !safeDeck.sourceUrl) return null;
  const existingAudio = djBoothLocalDeckAudio[deckKey];
  const existingMeta = djBoothLocalDeckMeta[deckKey];
  if (
    existingAudio instanceof HTMLAudioElement
    && existingMeta?.sourceMode === 'shared'
    && existingMeta?.sourceUrl === safeDeck.sourceUrl
  ) {
    return existingAudio;
  }
  clearDjBoothLocalDeckAudio(deckKey);
  const audio = new Audio(safeDeck.sourceUrl);
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.loop = false;
  audio.addEventListener('ended', () => {
    void updateDjBoothState(state => {
      const nextDeck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
      if (nextDeck.sourceMode !== 'shared' || nextDeck.sourceUrl !== safeDeck.sourceUrl) return;
      nextDeck.playing = false;
      nextDeck.positionSeconds = Number.isFinite(audio.duration) ? audio.duration : nextDeck.positionSeconds;
      nextDeck.lastActionAt = Date.now();
      state[deckKey] = nextDeck;
    });
  });
  djBoothLocalDeckAudio[deckKey] = audio;
  djBoothLocalDeckMeta[deckKey] = {
    sourceMode: 'shared',
    sourceUrl: safeDeck.sourceUrl,
    fileName: safeDeck.sourceLabel,
    objectUrl: ''
  };
  return audio;
}

function isDjBoothDeckFinished(deckKey, deck) {
  const safeDeck = normalizeDjBoothDeckState(deck, deckKey === 'deckA' ? 'Deck A' : 'Deck B');
  if (safeDeck.sourceMode === 'local' || safeDeck.sourceMode === 'shared') {
    const audio = djBoothLocalDeckAudio[deckKey];
    if (!(audio instanceof HTMLAudioElement)) return safeDeck.positionSeconds > 0;
    const duration = Number(audio.duration) || 0;
    const currentTime = Number(audio.currentTime) || 0;
    return duration > 0 && currentTime >= Math.max(0, duration - 0.35);
  }
  const player = djBoothPlayers[deckKey];
  if (player && typeof player.getDuration === 'function' && typeof player.getCurrentTime === 'function') {
    try {
      const duration = Number(player.getDuration()) || 0;
      const currentTime = Number(player.getCurrentTime()) || 0;
      const playerState = typeof player.getPlayerState === 'function' ? player.getPlayerState() : null;
      return (playerState === window.YT?.PlayerState?.ENDED) || (duration > 0 && currentTime >= Math.max(0, duration - 1));
    } catch (_error) {
      return false;
    }
  }
  return false;
}

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (djBoothApiPromise) return djBoothApiPromise;
  djBoothApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    if (document.getElementById('youtube-iframe-api')) return;
    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load YouTube API'));
    document.head.appendChild(script);
  });
  return djBoothApiPromise;
}

function syncDjBoothProgressLoop() {
  if (djBoothProgressFrame) cancelAnimationFrame(djBoothProgressFrame);
  const tick = () => {
    if (APP.room?.currentActivity !== 'dj-booth') return;
    const activityState = normalizeDjBoothState(APP.room?.activityState || {});
    DJ_BOOTH_DECK_KEYS.forEach(deckKey => {
      const deckState = normalizeDjBoothDeckState(activityState[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
      const localAudio = djBoothLocalDeckAudio[deckKey];
      const player = djBoothPlayers[deckKey];
      const titleNode = document.querySelector(`[data-dj-track-title="${deckKey}"]`);
      const timeNode = document.querySelector(`[data-dj-track-time="${deckKey}"]`);
      const sliderNode = document.getElementById(`djBoothSeek-${deckKey}`);
      let currentTime = 0;
      let duration = 0;
      let liveTitle = deckState.sourceLabel || (deckKey === 'deckA' ? 'Deck A ready' : 'Deck B ready');
      if ((deckState.sourceMode === 'local' || deckState.sourceMode === 'shared') && localAudio instanceof HTMLAudioElement) {
        currentTime = Number(localAudio.currentTime) || 0;
        duration = Number(localAudio.duration) || 0;
      } else if (player && typeof player.getCurrentTime === 'function') {
        currentTime = Number(player.getCurrentTime()) || 0;
        duration = Number(player.getDuration()) || 0;
        liveTitle = String(player.getVideoData?.().title || '').trim() || liveTitle;
      } else {
        currentTime = getDjBoothEffectiveDeckPosition(deckState);
      }
      APP.djBoothUi = APP.djBoothUi && typeof APP.djBoothUi === 'object' ? APP.djBoothUi : getDefaultDjBoothUiState();
      APP.djBoothUi.deckTitles = {
        ...(APP.djBoothUi.deckTitles || {}),
        [deckKey]: liveTitle
      };
      if (titleNode instanceof HTMLElement) {
        titleNode.textContent = liveTitle;
      }
      if (timeNode instanceof HTMLElement) {
        timeNode.textContent = `${formatClockFromMs(currentTime * 1000)} / ${formatClockFromMs(duration * 1000)}`;
      }
      if (sliderNode instanceof HTMLInputElement && document.activeElement !== sliderNode) {
        sliderNode.max = String(Math.max(1, Math.round(duration || 1)));
        sliderNode.value = String(Math.max(0, Math.min(Number(sliderNode.max) || 1, Math.round(currentTime))));
      }
    });
    djBoothProgressFrame = requestAnimationFrame(tick);
  };
  djBoothProgressFrame = requestAnimationFrame(tick);
}

async function syncDjBoothPlayers() {
  if (APP.room?.currentActivity !== 'dj-booth') {
    teardownDjBoothPlayers();
    return;
  }
  const state = normalizeDjBoothState(APP.room.activityState || {});
  maybePlayDjBoothPadTrigger(state);
  try {
    await loadYouTubeIframeApi();
  } catch (_error) {
    return;
  }
  for (const deckKey of DJ_BOOTH_DECK_KEYS) {
    const deck = state[deckKey];
    const containerId = `djBoothPlayer-${deckKey}`;
    const container = document.getElementById(containerId);
    if (!(container instanceof HTMLElement)) continue;
    if (deck.sourceMode === 'local' || deck.sourceMode === 'shared') {
      const player = djBoothPlayers[deckKey];
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (_error) {
          // Ignore rerender teardown races.
        }
      }
      djBoothPlayers[deckKey] = null;
      const localAudio = deck.sourceMode === 'shared'
        ? ensureDjBoothSharedDeckAudio(deckKey, deck)
        : djBoothLocalDeckAudio[deckKey];
      if (localAudio instanceof HTMLAudioElement) {
        const expectedPosition = Math.max(0, getDjBoothEffectiveDeckPosition(deck));
        try {
          localAudio.volume = Math.max(0, Math.min(1, computeDjBoothDeckEffectiveVolume(state, deckKey) / 100));
          if (Math.abs((Number(localAudio.currentTime) || 0) - expectedPosition) > 1.5) {
            localAudio.currentTime = expectedPosition;
          }
          if (deck.playing && localAudio.paused) {
            localAudio.play().catch(() => {});
          } else if (!deck.playing && !localAudio.paused) {
            localAudio.pause();
          }
        } catch (_error) {
          // Ignore local audio sync races.
        }
        container.innerHTML = `<div style="display:grid;place-items:center;width:100%;height:100%;min-height:240px;border-radius:18px;background:linear-gradient(135deg,rgba(0,210,211,0.12),rgba(197,108,240,0.08));border:1px solid rgba(255,255,255,0.1);color:var(--text);padding:24px;text-align:center;"><div><div style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:8px;">${escapeHtml(deck.sourceLabel || deck.label)}</div><div style="font-size:0.84rem;color:var(--text-dim);">${escapeHtml(deck.sourceMode === 'shared' ? 'Shared room track streaming on this device' : (APP.room?.host === APP.player?.name ? 'Local file loaded on this device' : 'Host is playing a local file on this deck'))}</div></div></div>`;
      } else {
        container.innerHTML = `<div style="display:grid;place-items:center;width:100%;height:100%;min-height:240px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));border:1px dashed rgba(255,255,255,0.16);color:var(--text-dim);padding:24px;text-align:center;">${escapeHtml(deck.sourceMode === 'shared' ? 'Shared track is loading on this device' : (APP.room?.host === APP.player?.name ? 'Load a local audio file on this deck' : 'Host local file source is not available on this device'))}</div>`;
      }
      continue;
    }
    if (djBoothLocalDeckAudio[deckKey] instanceof HTMLAudioElement || djBoothLocalDeckMeta[deckKey]) {
      clearDjBoothLocalDeckAudio(deckKey);
    }
    const player = djBoothPlayers[deckKey];
    let liveStartAt = Math.max(0, Math.floor(getDjBoothEffectiveDeckPosition(deck)));
    if (player && typeof player.getCurrentTime === 'function') {
      try {
        liveStartAt = Math.max(0, Math.floor(Number(player.getCurrentTime()) || liveStartAt));
      } catch (_error) {
        // Ignore stale player time reads during rerender.
      }
    }
    if (deck.sourceType === 'none' || (!deck.videoId && !deck.playlistId)) {
      if (player && typeof player.destroy === 'function') {
        try {
          player.destroy();
        } catch (_error) {
          // Ignore rerender teardown races.
        }
      }
      djBoothPlayers[deckKey] = null;
      container.innerHTML = `<div style="display:grid;place-items:center;width:100%;height:100%;min-height:240px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));border:1px dashed rgba(255,255,255,0.16);color:var(--text-dim);padding:24px;text-align:center;">Load a YouTube video or playlist on ${escapeHtml(deck.label)}</div>`;
      continue;
    }
    const metaKey = JSON.stringify({
      sourceType: deck.sourceType,
      videoId: deck.videoId,
      playlistId: deck.playlistId,
      trackIndex: deck.trackIndex
    });
    const mountedIframe = player && typeof player.getIframe === 'function'
      ? player.getIframe()
      : null;
    const playerStillMounted = mountedIframe instanceof HTMLElement && container.contains(mountedIframe);
    if (player && player.__djMetaKey === metaKey && playerStillMounted) {
      try {
        const duration = Number(player.getDuration?.()) || 0;
        const livePosition = Number(player.getCurrentTime?.()) || 0;
        const expectedPosition = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, getDjBoothEffectiveDeckPosition(deck)));
        player.setVolume(computeDjBoothDeckEffectiveVolume(state, deckKey));
        if (Math.abs(livePosition - expectedPosition) > 2.5) {
          player.seekTo(expectedPosition, true);
        }
        const playerState = typeof player.getPlayerState === 'function' ? player.getPlayerState() : null;
        if (deck.playing && playerState !== window.YT.PlayerState.PLAYING) {
          player.playVideo();
        } else if (!deck.playing && playerState === window.YT.PlayerState.PLAYING) {
          player.pauseVideo();
        }
      } catch (_error) {
        // Ignore transient player state errors.
      }
      continue;
    }
    if (player && typeof player.destroy === 'function') {
      try {
        player.destroy();
      } catch (_error) {
        // Ignore rerender teardown races.
      }
    }
    djBoothPlayers[deckKey] = null;
    const startAt = liveStartAt;
    const createdPlayer = new window.YT.Player(containerId, {
      width: '100%',
      height: '260',
      videoId: deck.videoId || undefined,
      playerVars: {
        autoplay: deck.playing ? 1 : 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        start: startAt,
        listType: deck.playlistId ? 'playlist' : undefined,
        list: deck.playlistId || undefined
      },
      events: {
        onReady: event => {
          const readyPlayer = event.target;
          try {
            if (deck.playlistId) {
              if (deck.playing) {
                readyPlayer.loadPlaylist({ listType: 'playlist', list: deck.playlistId, index: deck.trackIndex, startSeconds: startAt });
              } else {
                readyPlayer.cuePlaylist({ listType: 'playlist', list: deck.playlistId, index: deck.trackIndex, startSeconds: startAt });
              }
            } else if (deck.videoId) {
              if (deck.playing) {
                readyPlayer.loadVideoById({ videoId: deck.videoId, startSeconds: startAt });
              } else {
                readyPlayer.cueVideoById({ videoId: deck.videoId, startSeconds: startAt });
              }
            }
          } catch (_error) {
            // Ignore early player API timing races.
          }
          setTimeout(() => {
            try {
              readyPlayer.setVolume(computeDjBoothDeckEffectiveVolume(state, deckKey));
              if (!deck.playing) readyPlayer.pauseVideo();
            } catch (_error) {
              // Ignore player volume races.
            }
          }, 160);
        },
        onStateChange: event => {
          const ytState = event.data;
          const playerTarget = event.target;
          if (!window.YT?.PlayerState) return;
          if (ytState === window.YT.PlayerState.PLAYING || ytState === window.YT.PlayerState.CUED) {
            if (!deck.playlistId || typeof playerTarget.getPlaylistIndex !== 'function') return;
            const currentPlaylistIndex = Number(playerTarget.getPlaylistIndex());
            if (!Number.isInteger(currentPlaylistIndex) || currentPlaylistIndex < 0 || currentPlaylistIndex === deck.trackIndex) return;
            void updateDjBoothState(state => {
              const nextDeck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
              if (nextDeck.sourceMode !== 'youtube' || nextDeck.playlistId !== deck.playlistId) return;
              nextDeck.trackIndex = currentPlaylistIndex;
              nextDeck.positionSeconds = Math.max(0, Number(playerTarget.getCurrentTime?.()) || 0);
              nextDeck.lastActionAt = Date.now();
              state[deckKey] = nextDeck;
            });
            return;
          }
          if (ytState !== window.YT.PlayerState.ENDED) return;
          const playlistIndex = deck.playlistId && typeof playerTarget.getPlaylistIndex === 'function'
            ? Math.max(0, Number(playerTarget.getPlaylistIndex()) || deck.trackIndex)
            : deck.trackIndex;
          const duration = Math.max(0, Number(playerTarget.getDuration?.()) || 0);
          void updateDjBoothState(state => {
            const nextDeck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
            if (nextDeck.sourceMode !== 'youtube') return;
            if (nextDeck.playlistId) {
              nextDeck.trackIndex = Math.max(playlistIndex + 1, nextDeck.trackIndex + 1);
              nextDeck.positionSeconds = 0;
              nextDeck.playing = true;
            } else {
              nextDeck.playing = false;
              nextDeck.positionSeconds = duration;
            }
            nextDeck.lastActionAt = Date.now();
            state[deckKey] = nextDeck;
          });
        }
      }
    });
    createdPlayer.__djMetaKey = metaKey;
    djBoothPlayers[deckKey] = createdPlayer;
  }
  syncDjBoothProgressLoop();
}

async function updateDjBoothState(mutator) {
  if (!APP.roomCode || !APP.room) return null;
  const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
  if (!room || room.currentActivity !== 'dj-booth') return null;
  if (room.host !== APP.player?.name) return room;
  const state = normalizeDjBoothState(room.activityState || {});
  if (typeof mutator === 'function') mutator(state);
  state.updatedAt = Date.now();
  room.activityState = normalizeDjBoothState(state);
  await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
  APP.room = room;
  render();
  return room;
}

async function loadDjBoothDeckSource(deckKey, rawSource = '') {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  const input = document.getElementById(`djBoothSource-${deckKey}`);
  const parsed = parseYouTubeSource(rawSource || input?.value || draftDjBoothSource[deckKey] || '');
  delete draftDjBoothSource[deckKey];
  if (parsed.sourceType === 'none') {
    showError('Enter a valid YouTube video or playlist URL.');
    return;
  }
  clearDjBoothLocalDeckAudio(deckKey);
  await updateDjBoothState(state => {
    state[deckKey] = {
      ...state[deckKey],
      sourceMode: 'youtube',
      ...parsed,
      sourceLabel: '',
      playing: false,
      positionSeconds: 0,
      lastActionAt: Date.now()
    };
  });
}

async function loadDjBoothLocalDeckFile(deckKey, file) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey) || !(file instanceof File)) return;
  const audio = setDjBoothLocalDeckAudio(deckKey, file);
  if (!audio) return;
  await updateDjBoothState(state => {
    state[deckKey] = {
      ...state[deckKey],
      sourceMode: 'local',
      sourceType: 'local',
      sourceUrl: '',
      sourceLabel: String(file.name || `${deckKey === 'deckA' ? 'Deck A' : 'Deck B'} local track`).trim().slice(0, 80),
      videoId: '',
      playlistId: '',
      trackIndex: 0,
      playing: false,
      positionSeconds: 0,
      lastActionAt: Date.now()
    };
  });
}

async function uploadDjBoothSharedTrack(file) {
  if (!(file instanceof File)) return null;
  if (!APP.roomCode || !APP.room) throw new Error('Join a room before uploading DJ tracks.');
  if (APP.room.host !== APP.player?.name) throw new Error('Only the host can upload shared DJ tracks.');
  const response = await fetch(`${API_BASE_URL}/api/dj/library/upload?roomCode=${encodeURIComponent(APP.roomCode)}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-room-token': APP.roomAccessToken || '',
      'x-player-name': APP.player?.name || '',
      'x-file-name': encodeURIComponent(file.name || 'track')
    },
    body: file
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Upload failed: ${response.status}`);
  }
  return normalizeDjBoothTrack(data.track);
}

async function addDjBoothSharedTrack(file) {
  const track = await uploadDjBoothSharedTrack(file);
  if (!track) return;
  await updateDjBoothState(state => {
    const library = normalizeDjBoothTrackLibrary(state.trackLibrary);
    const withoutSame = library.filter(item => item.id !== track.id);
    state.trackLibrary = [track, ...withoutSame].slice(0, 48);
  });
}

async function loadDjBoothSharedTrack(deckKey, trackId) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  const library = normalizeDjBoothTrackLibrary(APP.room?.activityState?.trackLibrary);
  const track = library.find(item => item.id === String(trackId || '').trim());
  if (!track) {
    showError('Shared track not found.');
    return;
  }
  clearDjBoothLocalDeckAudio(deckKey);
  await updateDjBoothState(state => {
    state[deckKey] = {
      ...state[deckKey],
      sourceMode: 'shared',
      sourceType: 'audio',
      sourceUrl: track.url,
      sourceLabel: track.name,
      videoId: '',
      playlistId: '',
      trackIndex: 0,
      playing: false,
      positionSeconds: 0,
      lastActionAt: Date.now()
    };
  });
}

async function removeDjBoothSharedTrack(trackId) {
  const requestedId = String(trackId || '').trim();
  if (!requestedId || !APP.roomCode || !APP.room) return;
  const library = normalizeDjBoothTrackLibrary(APP.room?.activityState?.trackLibrary);
  const track = library.find(item => item.id === requestedId);
  if (!track) return;
  const response = await fetch(`${API_BASE_URL}/api/dj/library/${encodeURIComponent(requestedId)}?roomCode=${encodeURIComponent(APP.roomCode)}`, {
    method: 'DELETE',
    headers: {
      'x-room-token': APP.roomAccessToken || '',
      'x-player-name': APP.player?.name || ''
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Remove failed: ${response.status}`);
  }
  await updateDjBoothState(state => {
    state.trackLibrary = normalizeDjBoothTrackLibrary(state.trackLibrary).filter(item => item.id !== requestedId);
    DJ_BOOTH_DECK_KEYS.forEach(deckKey => {
      const deck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
      if (deck.sourceMode === 'shared' && deck.sourceUrl === track.url) {
        state[deckKey] = {
          ...deck,
          sourceMode: 'youtube',
          sourceType: 'none',
          sourceUrl: '',
          sourceLabel: '',
          playing: false,
          positionSeconds: 0,
          lastActionAt: Date.now()
        };
      }
    });
  });
}

async function toggleDjBoothDeckPlayback(deckKey) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  await updateDjBoothState(state => {
    const deck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
    const now = Date.now();
    const currentPosition = getDjBoothEffectiveDeckPosition(deck);
    const nextPlaying = !deck.playing;
    if (nextPlaying && isDjBoothDeckFinished(deckKey, deck)) {
      if (deck.playlistId) {
        deck.trackIndex = Math.max(0, deck.trackIndex + 1);
      }
      deck.positionSeconds = 0;
    } else {
      deck.positionSeconds = currentPosition;
    }
    deck.playing = nextPlaying;
    deck.lastActionAt = now;
    state[deckKey] = deck;
  });
}

async function shiftDjBoothDeckTrack(deckKey, direction = 1) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  await updateDjBoothState(state => {
    const fallbackLabel = deckKey === 'deckA' ? 'Deck A' : 'Deck B';
    const deck = normalizeDjBoothDeckState(state[deckKey], fallbackLabel);
    if (deck.sourceMode === 'local') {
      deck.positionSeconds = 0;
      deck.lastActionAt = Date.now();
      state[deckKey] = deck;
      return;
    }
    const movingForward = Number(direction) >= 0;
    deck.positionSeconds = 0;
    deck.lastActionAt = Date.now();
    if (deck.playlistId) {
      deck.trackIndex = Math.max(0, deck.trackIndex + (movingForward ? 1 : -1));
    }
    state[deckKey] = deck;
  });
}

async function restartDjBoothDeck(deckKey) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  await updateDjBoothState(state => {
    const deck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
    deck.positionSeconds = 0;
    deck.lastActionAt = Date.now();
    state[deckKey] = deck;
  });
}

async function setDjBoothDeckSeek(deckKey, seconds) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  await updateDjBoothState(state => {
    const deck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
    deck.positionSeconds = safeSeconds;
    deck.lastActionAt = Date.now();
    state[deckKey] = deck;
  });
}

async function setDjBoothDeckVolume(deckKey, volume) {
  if (!DJ_BOOTH_DECK_KEYS.includes(deckKey)) return;
  const safeVolume = Math.max(0, Math.min(100, Number.parseInt(volume, 10) || 0));
  await updateDjBoothState(state => {
    const deck = normalizeDjBoothDeckState(state[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
    deck.volume = safeVolume;
    state[deckKey] = deck;
  });
}

async function setDjBoothMixerValue(key, value) {
  const allowedKeys = new Set(['crossfader', 'masterVolume']);
  if (!allowedKeys.has(key)) return;
  const safeValue = Math.max(0, Math.min(100, Number.parseInt(value, 10) || 0));
  await updateDjBoothState(state => {
    state[key] = safeValue;
  });
}

async function setDjBoothLightValue(key, value) {
  const numericKeys = new Set(['speed', 'intensity']);
  const modeKeys = new Set(['mode']);
  await updateDjBoothState(state => {
    const lights = state.lights && typeof state.lights === 'object' ? state.lights : normalizeDjBoothState({}).lights;
    if (numericKeys.has(key)) {
      lights[key] = Math.max(10, Math.min(100, Number.parseInt(value, 10) || 10));
    } else if (modeKeys.has(key)) {
      lights[key] = ['ambient', 'pulse', 'wave', 'strobe', 'party'].includes(String(value || '').trim()) ? String(value).trim() : 'pulse';
    } else if (key === 'enabled') {
      lights.enabled = value === true || value === 'true' || value === 1 || value === '1';
    }
    state.lights = lights;
  });
}

async function fadeDjBoothCrossfader(target) {
  const presets = {
    left: 0,
    center: 50,
    right: 100
  };
  if (!(target in presets)) return;
  await setDjBoothMixerValue('crossfader', presets[target]);
}

async function saveDjBoothMarquee() {
  const input = document.getElementById('djBoothMarqueeInput');
  const nextValue = String(input?.value || draftDjBoothMarquee || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  draftDjBoothMarquee = null;
  await updateDjBoothState(state => {
    state.marqueeText = nextValue || 'Broadcast live from the Team Builder DJ Booth';
  });
}

async function toggleDjBoothMicLive() {
  await updateDjBoothState(state => {
    state.micLive = state.micLive !== true;
    if (state.micLive) {
      state.lights = {
        ...(state.lights || normalizeDjBoothState({}).lights),
        flashAt: Date.now()
      };
    }
  });
}

async function triggerDjBoothPad(padId) {
  const requestedId = String(padId || '').trim();
  if (!requestedId) return;
  await updateDjBoothState(state => {
    const pad = normalizeDjBoothPads(state.soundPads).find(item => item.id === requestedId);
    if (!pad) return;
    state.activePadId = requestedId;
    state.lastPadTriggerAt = Date.now();
    state.lights = {
      ...(state.lights || normalizeDjBoothState({}).lights),
      flashAt: Date.now()
    };
  });
}

async function editDjBoothPad(padId) {
  const requestedId = String(padId || '').trim();
  if (!requestedId) return;
  const state = normalizeDjBoothState(APP.room?.activityState || {});
  const padIndex = state.soundPads.findIndex(item => item.id === requestedId);
  if (padIndex < 0) return;
  const currentPad = state.soundPads[padIndex];
  const label = prompt('Pad label', currentPad.label || '');
  if (label === null) return;
  const emoji = prompt('Pad emoji', currentPad.emoji || '');
  if (emoji === null) return;
  const tone = prompt(`Pad tone (${DJ_BOOTH_TONE_IDS.join(', ')})`, currentPad.tone || '');
  if (tone === null) return;
  const color = prompt('Pad color (hex)', currentPad.color || '');
  if (color === null) return;
  await updateDjBoothState(nextState => {
    const pads = normalizeDjBoothPads(nextState.soundPads);
    pads[padIndex] = normalizeDjBoothPad({
      ...pads[padIndex],
      label,
      emoji,
      tone,
      color
    }, padIndex);
    nextState.soundPads = pads;
  });
}


let draftDjBoothMarquee = null;
const draftDjBoothSource = {};

function renderDjBoothLightRig(state) {
  const safeState = normalizeDjBoothState(state);
  const playingBoostA = safeState.deckA.playing ? 1 : 0.56;
  const playingBoostB = safeState.deckB.playing ? 1 : 0.56;
  const leftWeight = (100 - safeState.crossfader) / 100;
  const rightWeight = safeState.crossfader / 100;
  const pulseSpeed = Math.max(0.55, 2.6 - (safeState.lights.speed / 40));
  return Array.from({ length: 12 }, (_, idx) => {
    const bias = idx < 6 ? leftWeight * playingBoostA : rightWeight * playingBoostB;
    const color = idx < 6 ? safeState.lights.colorA : safeState.lights.colorB;
    const height = Math.max(24, Math.round(28 + (safeState.lights.intensity * 0.74) + (idx % 4) * 8 + (bias * 34)));
    const opacity = safeState.lights.enabled ? 0.46 + (bias * 0.5) : 0.16;
    const modeMultiplier = safeState.lights.mode === 'strobe' ? 0.42 : safeState.lights.mode === 'party' ? 0.8 : safeState.lights.mode === 'wave' ? 1.3 : 1;
    return `
      <div
        class="dj-booth-light"
        style="height:${height}px;background:linear-gradient(180deg,color-mix(in srgb, ${color} 92%, #ffffff 8%),color-mix(in srgb, ${color} 54%, #080b1f 46%));opacity:${opacity};animation-duration:${(pulseSpeed * modeMultiplier).toFixed(2)}s;animation-delay:${(idx * 0.08).toFixed(2)}s;"
      ></div>
    `;
  }).join('');
}

function renderDjBoothDeckMeter(state, deckKey) {
  const safeState = normalizeDjBoothState(state);
  const deck = safeState[deckKey];
  const bars = Array.from({ length: 9 }, (_, idx) => {
    const activeLevel = ((idx + 1) / 9) * 100;
    const effective = computeDjBoothDeckEffectiveVolume(safeState, deckKey);
    const lit = effective >= activeLevel;
    const baseColor = deckKey === 'deckA' ? safeState.lights.colorA : safeState.lights.colorB;
    return `
      <div
        class="dj-booth-meter-bar"
        style="height:${18 + (idx * 6)}px;background:${lit ? `linear-gradient(180deg,color-mix(in srgb, ${baseColor} 88%, #ffffff 12%),color-mix(in srgb, ${baseColor} 56%, #060711 44%))` : 'rgba(255,255,255,0.08)'};opacity:${lit ? 1 : 0.28};animation-delay:${(idx * 0.05).toFixed(2)}s;"
      ></div>
    `;
  }).join('');
  return `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">${escapeHtml(deck.label)} level</div>
        <div style="font-family:'IBM Plex Mono',monospace;color:var(--text-mid);font-size:0.84rem;">${computeDjBoothDeckEffectiveVolume(safeState, deckKey)}%</div>
      </div>
      <div class="dj-booth-meter">${bars}</div>
    </div>
  `;
}

function renderDjBoothDeck(state, deckKey, isHost) {
  const safeState = normalizeDjBoothState(state);
  const deck = normalizeDjBoothDeckState(safeState[deckKey], deckKey === 'deckA' ? 'Deck A' : 'Deck B');
  const isLocalDeck = deck.sourceMode === 'local';
  const isSharedDeck = deck.sourceMode === 'shared';
  const activePosition = Math.round(getDjBoothEffectiveDeckPosition(deck));
  const sourceSummary = isLocalDeck
    ? `${APP.room?.host === APP.player?.name ? 'Local audio loaded on this device' : 'Host local audio source'}`
    : isSharedDeck
      ? 'Shared room track loaded for all participants'
    : deck.sourceType === 'playlist'
    ? `Playlist loaded • track ${deck.trackIndex + 1}`
    : deck.sourceType === 'video'
      ? 'Single video loaded'
      : 'No source loaded yet';
  const timeLabel = `${formatClockFromMs(activePosition * 1000)} / --:--`;
  const titleLabel = (isLocalDeck ? deck.sourceLabel : APP.djBoothUi?.deckTitles?.[deckKey]) || `${deck.label} ready`;
  const playLabel = deck.playing ? 'Pause' : 'Play';
  return `
    <div class="dj-booth-panel">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
        <div>
          <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:0.74rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">
            <span>${escapeHtml(deck.label)}</span>
            <span style="color:${deck.playing ? '#7af59f' : 'var(--text-dim)'};">${deck.playing ? 'LIVE' : 'CUED'}</span>
          </div>
          <div data-dj-track-title="${deckKey}" style="font-family:'Fraunces',serif;font-size:1.4rem;line-height:1.05;">${escapeHtml(titleLabel)}</div>
          <div style="font-size:0.84rem;color:var(--text-dim);margin-top:6px;">${escapeHtml(sourceSummary)}</div>
        </div>
        <div style="text-align:right;">
          <div data-dj-track-time="${deckKey}" style="font-family:'IBM Plex Mono',monospace;font-size:0.9rem;color:var(--text-mid);">${escapeHtml(timeLabel)}</div>
          <div style="font-size:0.76rem;color:var(--text-dim);margin-top:6px;">Volume ${deck.volume}%</div>
        </div>
      </div>

      <div class="dj-booth-player-frame" id="djBoothPlayer-${deckKey}"></div>

      <div style="margin-top:14px;display:grid;gap:12px;">
        ${isHost ? `
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <input id="djBoothSource-${deckKey}" class="form-input" value="${escapeHtml(draftDjBoothSource[deckKey] !== undefined ? draftDjBoothSource[deckKey] : (deck.sourceUrl || ''))}" placeholder="Paste YouTube playlist or video URL" style="flex:1;min-width:220px;" oninput="draftDjBoothSource[this.id.replace('djBoothSource-','')]=this.value" autocomplete="off">
            <button class="btn-primary" data-action="dj-booth-load-source" data-deck-key="${deckKey}" style="width:auto;padding:12px 16px;">Load</button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;">Local File Deck</div>
              <div style="font-size:0.84rem;color:var(--text-dim);">${escapeHtml(isLocalDeck ? (deck.sourceLabel || 'Local file selected') : 'Load MP3 / WAV / M4A from this device')}</div>
            </div>
            <label class="btn-secondary" style="width:auto;padding:10px 14px;cursor:pointer;">
              Load Local File
              <input id="djBoothLocalFile-${deckKey}" type="file" accept="audio/*" style="display:none;">
            </label>
          </div>
        ` : ''}

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">Playhead</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:0.84rem;color:var(--text-mid);">${escapeHtml(formatClockFromMs(activePosition * 1000))}</div>
          </div>
          <input
            id="djBoothSeek-${deckKey}"
            class="dj-booth-range"
            type="range"
            min="0"
            max="${Math.max(1, activePosition + 1)}"
            value="${activePosition}"
            ${isHost ? '' : 'disabled'}
            data-dj-output-id="djBoothSeekOut-${deckKey}"
            data-dj-suffix="s"
          >
          <div id="djBoothSeekOut-${deckKey}" style="margin-top:6px;font-size:0.76rem;color:var(--text-dim);">Drag to scrub ${escapeHtml(deck.label.toLowerCase())}</div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">${escapeHtml(deck.label)} volume</div>
            <div id="djBoothVolumeOut-${deckKey}" style="font-family:'IBM Plex Mono',monospace;font-size:0.84rem;color:var(--text-mid);">${deck.volume}%</div>
          </div>
          <input
            id="djBoothVolume-${deckKey}"
            class="dj-booth-range"
            type="range"
            min="0"
            max="100"
            value="${deck.volume}"
            ${isHost ? '' : 'disabled'}
            data-dj-output-id="djBoothVolumeOut-${deckKey}"
            data-dj-suffix="%"
          >
        </div>

        ${renderDjBoothDeckMeter(safeState, deckKey)}

        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;">
          <button class="btn-secondary" data-action="dj-booth-prev-track" data-deck-key="${deckKey}" ${(isHost && !isLocalDeck && !isSharedDeck) ? '' : 'disabled'} style="padding:10px 12px;">⏮</button>
          <button class="btn-primary" data-action="dj-booth-toggle-play" data-deck-key="${deckKey}" ${isHost ? '' : 'disabled'} style="padding:10px 12px;">${escapeHtml(playLabel)}</button>
          <button class="btn-secondary" data-action="dj-booth-restart-track" data-deck-key="${deckKey}" ${isHost ? '' : 'disabled'} style="padding:10px 12px;">↺</button>
          <button class="btn-secondary" data-action="dj-booth-next-track" data-deck-key="${deckKey}" ${(isHost && !isLocalDeck && !isSharedDeck) ? '' : 'disabled'} style="padding:10px 12px;">⏭</button>
        </div>
      </div>
    </div>
  `;
}

function renderDjBooth() {
  const isHost = APP.room.host === APP.player.name;
  const state = normalizeDjBoothState(APP.room.activityState || {});
  const voiceSettings = getRoomVoiceSettings(APP.room);
  const bannerCopy = escapeHtml(state.marqueeText || 'Broadcast live from the Team Builder DJ Booth');
  const participants = (APP.room.participants || []).map(player => player?.name).filter(Boolean);
  const activePadId = String(state.activePadId || '').trim();
  const activePadFresh = Date.now() - (Number(state.lastPadTriggerAt) || 0) < 1400;
  const lightModeLabel = state.lights.mode.charAt(0).toUpperCase() + state.lights.mode.slice(1);
  const boothStatus = state.micLive
    ? (voiceSettings.enabled ? 'DJ mic is live in the room voice mix.' : 'DJ mic is armed. Turn room voice on to broadcast it.')
    : 'Deck-only performance mode is active.';
  const crossfaderSide = state.crossfader < 45 ? 'Deck A' : state.crossfader > 55 ? 'Deck B' : 'Centered';
  const sharedTracks = normalizeDjBoothTrackLibrary(state.trackLibrary);
  const recordingClip = APP.djBoothUi?.recordingClip === true;
  const recordingLabel = formatClockFromMs((Number(APP.djBoothUi?.recordingSeconds) || 0) * 1000);

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">🎚️ DJ Booth</h1>
      <p class="tagline">Two YouTube decks, live mixer controls, sound pads, and broadcast visuals for the whole room.</p>
    </div>

    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    <div class="dj-booth-shell">
      <div class="dj-booth-banner">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="padding:8px 12px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:0.74rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--warning);">Broadcast Banner</span>
            <span style="font-size:0.82rem;color:var(--text-dim);">${escapeHtml(lightModeLabel)} lights • ${escapeHtml(crossfaderSide)} lead</span>
          </div>
          <div style="font-size:0.82rem;color:var(--text-dim);">Audience: ${participants.length}</div>
        </div>
        <div style="overflow:hidden;">
          <div class="dj-booth-banner-track">
            <div class="dj-booth-banner-copy">${bannerCopy}</div>
            <div class="dj-booth-banner-copy">${bannerCopy}</div>
          </div>
        </div>
      </div>

      <div class="dj-booth-light-rig">
        ${renderDjBoothLightRig(state)}
      </div>

      <div class="dj-booth-layout">
        ${renderDjBoothDeck(state, 'deckA', isHost)}

        <div class="dj-booth-mixer">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <div>
              <div style="font-family:'Fraunces',serif;font-size:1.5rem;">Mixer</div>
              <div style="font-size:0.84rem;color:var(--text-dim);">Blend both decks, fire pads, and steer the broadcast.</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn-secondary" data-action="dj-booth-fade" data-fade-target="left" ${isHost ? '' : 'disabled'} style="width:auto;padding:10px 14px;">Fade A</button>
              <button class="btn-secondary" data-action="dj-booth-fade" data-fade-target="center" ${isHost ? '' : 'disabled'} style="width:auto;padding:10px 14px;">Center</button>
              <button class="btn-secondary" data-action="dj-booth-fade" data-fade-target="right" ${isHost ? '' : 'disabled'} style="width:auto;padding:10px 14px;">Fade B</button>
            </div>
          </div>

          <div class="dj-booth-status-card" style="margin-bottom:14px;background:linear-gradient(135deg,rgba(0,210,211,0.1),rgba(197,108,240,0.06));">
            <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;">Broadcast Status</div>
            <div style="font-family:'Fraunces',serif;font-size:1.2rem;margin-bottom:8px;">${escapeHtml(boothStatus)}</div>
            <div style="font-size:0.84rem;color:var(--text-dim);">Crossfader ${state.crossfader}% • Master ${state.masterVolume}% • ${state.lights.enabled ? 'Lights live' : 'Lights dimmed'}</div>
          </div>

          <div style="display:grid;gap:14px;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">Crossfader</div>
                <div id="djBoothCrossfaderOut" style="font-family:'IBM Plex Mono',monospace;font-size:0.84rem;color:var(--text-mid);">${state.crossfader}%</div>
              </div>
              <input id="djBoothCrossfader" class="dj-booth-range" type="range" min="0" max="100" value="${state.crossfader}" ${isHost ? '' : 'disabled'} data-dj-output-id="djBoothCrossfaderOut" data-dj-suffix="%">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;font-size:0.76rem;color:var(--text-dim);">
                <span>Deck A</span><span>Blend</span><span>Deck B</span>
              </div>
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;">
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">Master Volume</div>
                <div id="djBoothMasterVolumeOut" style="font-family:'IBM Plex Mono',monospace;font-size:0.84rem;color:var(--text-mid);">${state.masterVolume}%</div>
              </div>
              <input id="djBoothMasterVolume" class="dj-booth-range" type="range" min="0" max="100" value="${state.masterVolume}" ${isHost ? '' : 'disabled'} data-dj-output-id="djBoothMasterVolumeOut" data-dj-suffix="%">
            </div>

            <div class="dj-booth-status-card">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">DJ Mic</div>
                <button class="btn-primary" data-action="dj-booth-toggle-mic" ${isHost ? '' : 'disabled'} style="width:auto;padding:10px 14px;background:${state.micLive ? 'linear-gradient(135deg,var(--danger),#ff7b7b)' : 'linear-gradient(135deg,var(--accent),var(--accent-2))'};">
                  ${state.micLive ? 'Mic Live' : 'Mic Standby'}
                </button>
              </div>
              <div style="font-size:0.84rem;color:var(--text-dim);margin-bottom:12px;">Use the existing room voice controls for the actual mic path. This booth toggle announces when the DJ mic should be considered live.</div>
              <button class="btn-secondary" data-action="dj-booth-open-voice" ${isHost ? '' : 'disabled'} style="width:100%;">Open Voice Controls</button>
            </div>

            <div class="dj-booth-status-card">
              <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:12px;">Lighting Control</div>
              <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <input id="djBoothLightsEnabled" type="checkbox" ${state.lights.enabled ? 'checked' : ''} ${isHost ? '' : 'disabled'}>
                <span>Show booth lights</span>
              </label>
              <div class="form-group" style="margin-bottom:12px;">
                <label>Mode</label>
                <select id="djBoothLightMode" class="form-input" ${isHost ? '' : 'disabled'}>
                  ${['ambient', 'pulse', 'wave', 'strobe', 'party'].map(mode => `<option value="${mode}" ${state.lights.mode === mode ? 'selected' : ''}>${escapeHtml(mode.charAt(0).toUpperCase() + mode.slice(1))}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom:12px;">
                <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span>Speed</span><span id="djBoothLightSpeedOut">${state.lights.speed}%</span></label>
                <input id="djBoothLightSpeed" class="dj-booth-range" type="range" min="10" max="100" value="${state.lights.speed}" ${isHost ? '' : 'disabled'} data-dj-output-id="djBoothLightSpeedOut" data-dj-suffix="%">
              </div>
              <div class="form-group" style="margin:0;">
                <label style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span>Intensity</span><span id="djBoothLightIntensityOut">${state.lights.intensity}%</span></label>
                <input id="djBoothLightIntensity" class="dj-booth-range" type="range" min="10" max="100" value="${state.lights.intensity}" ${isHost ? '' : 'disabled'} data-dj-output-id="djBoothLightIntensityOut" data-dj-suffix="%">
              </div>
            </div>

            <div class="dj-booth-status-card">
              <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;">Broadcast Message</div>
              <input id="djBoothMarqueeInput" class="form-input" maxlength="140" value="${escapeHtml(draftDjBoothMarquee !== null ? draftDjBoothMarquee : (state.marqueeText || 'Broadcast live from the Team Builder DJ Booth'))}" ${isHost ? '' : 'disabled'} placeholder="Type a scrolling room message" oninput="draftDjBoothMarquee=this.value" autocomplete="off">
              <button class="btn-primary" data-action="dj-booth-save-marquee" ${isHost ? '' : 'disabled'} style="margin-top:10px;">Update Banner</button>
            </div>
          </div>
        </div>

        ${renderDjBoothDeck(state, 'deckB', isHost)}
      </div>

      <div class="dj-booth-status-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <div style="font-family:'Fraunces',serif;font-size:1.38rem;">Shared Track Library</div>
            <div style="font-size:0.84rem;color:var(--text-dim);">Upload a room track once, record live clips, then load them onto either deck for everyone.</div>
          </div>
          ${isHost ? `
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <label class="btn-primary" style="width:auto;padding:10px 16px;cursor:pointer;">
                Upload Shared Track
                <input id="djBoothLibraryUpload" type="file" accept="audio/*" style="display:none;">
              </label>
              <button class="btn-secondary" data-action="${recordingClip ? 'dj-booth-stop-recording' : 'dj-booth-start-recording'}" style="width:auto;padding:10px 16px;border-color:${recordingClip ? 'rgba(255,107,107,0.45)' : 'rgba(0,210,211,0.35)'};color:${recordingClip ? '#ff9c9c' : 'var(--accent)'};">
                ${recordingClip ? `Stop Recording ${escapeHtml(recordingLabel)}` : 'Record Clip'}
              </button>
            </div>
          ` : `<div style="font-size:0.82rem;color:var(--text-dim);">Host-managed shared audio library</div>`}
        </div>
        ${isHost && recordingClip ? `
          <div style="margin-bottom:12px;padding:12px 14px;border-radius:16px;background:linear-gradient(135deg,rgba(255,64,96,0.12),rgba(255,255,255,0.03));border:1px solid rgba(255,64,96,0.24);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#ff9c9c;margin-bottom:4px;">Recording Clip</div>
              <div style="font-size:0.9rem;">Mic capture is live. Stop when the clip is ready to upload.</div>
            </div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:1rem;color:#ffd7de;">${escapeHtml(recordingLabel)}</div>
          </div>
        ` : ''}
        ${sharedTracks.length ? `
          <div style="display:grid;gap:10px;">
            ${sharedTracks.map(track => `
              <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);">
                <div style="min-width:0;">
                  <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(track.name)}</div>
                  <div style="font-size:0.8rem;color:var(--text-dim);margin-top:4px;">${escapeHtml(formatFileSize(track.size))}${track.uploadedBy ? ` • uploaded by ${escapeHtml(track.uploadedBy)}` : ''}</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                  <button class="btn-secondary" data-action="dj-booth-load-shared-track" data-deck-key="deckA" data-track-id="${escapeHtml(track.id)}" ${isHost ? '' : 'disabled'} style="width:auto;padding:8px 12px;">Load A</button>
                  <button class="btn-secondary" data-action="dj-booth-load-shared-track" data-deck-key="deckB" data-track-id="${escapeHtml(track.id)}" ${isHost ? '' : 'disabled'} style="width:auto;padding:8px 12px;">Load B</button>
                  ${isHost ? `<button class="btn-secondary" data-action="dj-booth-remove-shared-track" data-track-id="${escapeHtml(track.id)}" style="width:auto;padding:8px 12px;border-color:rgba(255,107,107,0.3);color:#ff9c9c;">Remove</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<div style="font-size:0.84rem;color:var(--text-dim);padding:6px 0 2px;">No shared tracks uploaded yet.</div>`}
      </div>

      <div class="dj-booth-pad-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <div style="font-family:'Fraunces',serif;font-size:1.45rem;">Sound Pads</div>
            <div style="font-size:0.84rem;color:var(--text-dim);">Eight custom triggers for drops, stingers, and crowd moments.</div>
          </div>
          <div style="font-size:0.82rem;color:var(--text-dim);">${isHost ? 'Tap a pad to trigger it. Use Edit to retune the pad.' : 'Watch for host-triggered pads to light up live.'}</div>
        </div>
        <div class="dj-booth-pad-grid">
          ${state.soundPads.map((pad, idx) => {
            const isActive = activePadFresh && activePadId === pad.id;
            return `
              <div>
                <button
                  class="dj-booth-pad ${isActive ? 'dj-booth-pad-active' : ''}"
                  data-action="dj-booth-trigger-pad"
                  data-pad-id="${escapeHtml(pad.id)}"
                  ${isHost ? '' : 'disabled'}
                  style="background:linear-gradient(160deg,color-mix(in srgb, ${pad.color} 88%, #ffffff 12%),color-mix(in srgb, ${pad.color} 42%, #080916 58%));--pad-glow:${pad.color};"
                >
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
                    <div style="font-size:1.5rem;line-height:1;">${escapeHtml(pad.emoji)}</div>
                    <div style="padding:6px 8px;border-radius:999px;background:rgba(0,0,0,0.18);font-size:0.68rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">P${idx + 1}</div>
                  </div>
                  <div style="font-weight:800;font-size:1rem;line-height:1.15;">${escapeHtml(pad.label)}</div>
                  <div style="margin-top:6px;font-size:0.76rem;color:rgba(255,255,255,0.82);text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(pad.tone)}</div>
                </button>
                ${isHost ? `<button class="btn-secondary" data-action="dj-booth-edit-pad" data-pad-id="${escapeHtml(pad.id)}" style="margin-top:8px;padding:8px 12px;width:100%;">Edit Pad</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}



function registerDjBoothActivity() {
  const registry = window.TEAM_BUILDER_ACTIVITY_REGISTRY;
  if (!registry || typeof registry.registerActivity !== 'function' || typeof registry.registerAction !== 'function') return;

  registry.registerActivity('dj-booth', {
    label: 'DJ Booth',
    start: () => startActivityById('dj-booth'),
    createInitialState: () => createDjBoothState(),
    meetsRoomRequirements: () => true,
    getRequirementMessage: () => '',
    render: () => renderDjBooth()
  });

  registry.registerAction('start-dj-booth', () => startActivityById('dj-booth'));
  registry.registerAction('dj-booth-load-source', ({ dataset }) => {
    if (dataset.deckKey) return loadDjBoothDeckSource(dataset.deckKey);
    return null;
  });
  registry.registerAction('dj-booth-toggle-play', ({ dataset }) => {
    if (dataset.deckKey) return toggleDjBoothDeckPlayback(dataset.deckKey);
    return null;
  });
  registry.registerAction('dj-booth-prev-track', ({ dataset }) => {
    if (dataset.deckKey) return shiftDjBoothDeckTrack(dataset.deckKey, -1);
    return null;
  });
  registry.registerAction('dj-booth-next-track', ({ dataset }) => {
    if (dataset.deckKey) return shiftDjBoothDeckTrack(dataset.deckKey, 1);
    return null;
  });
  registry.registerAction('dj-booth-restart-track', ({ dataset }) => {
    if (dataset.deckKey) return restartDjBoothDeck(dataset.deckKey);
    return null;
  });
  registry.registerAction('dj-booth-fade', ({ dataset }) => {
    if (dataset.fadeTarget) return fadeDjBoothCrossfader(dataset.fadeTarget);
    return null;
  });
  registry.registerAction('dj-booth-save-marquee', () => saveDjBoothMarquee());
  registry.registerAction('dj-booth-toggle-mic', () => toggleDjBoothMicLive());
  registry.registerAction('dj-booth-open-voice', () => {
    if (APP.room?.host === APP.player?.name) openHostSettings();
  });
  registry.registerAction('dj-booth-load-shared-track', ({ dataset }) => {
    if (dataset.deckKey && dataset.trackId) return loadDjBoothSharedTrack(dataset.deckKey, dataset.trackId);
    return null;
  });
  registry.registerAction('dj-booth-start-recording', () => startDjBoothClipRecording());
  registry.registerAction('dj-booth-stop-recording', () => stopDjBoothClipRecording());
  registry.registerAction('dj-booth-remove-shared-track', async ({ dataset }) => {
    if (!dataset.trackId) return null;
    try {
      await removeDjBoothSharedTrack(dataset.trackId);
    } catch (error) {
      showError(error.message || 'Unable to remove shared track.');
    }
    return null;
  });
  registry.registerAction('dj-booth-trigger-pad', ({ dataset }) => {
    if (dataset.padId) return triggerDjBoothPad(dataset.padId);
    return null;
  });
  registry.registerAction('dj-booth-edit-pad', ({ dataset }) => {
    if (dataset.padId) return editDjBoothPad(dataset.padId);
    return null;
  });
}

registerDjBoothActivity();
