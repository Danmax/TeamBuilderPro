function getDefaultBingoUiState() {
  return {
    lastAnimatedDrawStamp: null,
    selectedMarker: 'classic-cover',
    voiceEnabled: true,
    lastObservedRoundStamp: null,
    lastAnnouncedCallStamp: null,
    lastAnnouncedWinStamp: null
  };
}

function cloneBingoStaticData(key, fallback) {
  const source = window.TEAM_BUILDER_STATIC_DATA || {};
  const value = source[key];
  if (value === undefined) return fallback;
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return fallback;
    }
  }
  return value;
}

const BINGO_COLUMN_LABELS = cloneBingoStaticData('BINGO_COLUMN_LABELS', ['B', 'I', 'N', 'G', 'O']);
const BINGO_NUMBER_RANGES = cloneBingoStaticData('BINGO_NUMBER_RANGES', []);
const BINGO_PATTERN_OPTIONS = cloneBingoStaticData('BINGO_PATTERN_OPTIONS', []);
const BINGO_MARKER_OPTIONS = cloneBingoStaticData('BINGO_MARKER_OPTIONS', []);

function shuffleArray(items) {
  const arr = [...items];
  for (let idx = arr.length - 1; idx > 0; idx--) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
  }
  return arr;
}

function createBingoCard() {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
  BINGO_NUMBER_RANGES.forEach(([min, max], col) => {
    const values = shuffleArray(Array.from({ length: max - min + 1 }, (_, idx) => min + idx)).slice(0, 5);
    for (let row = 0; row < 5; row++) {
      grid[row][col] = values[row];
    }
  });
  grid[2][2] = 'FREE';
  return grid;
}

function createBingoMarkedGrid() {
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => row === 2 && col === 2));
}

function normalizeBingoMarkerType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return BINGO_MARKER_OPTIONS.some(option => option.id === normalized)
    ? normalized
    : BINGO_MARKER_OPTIONS[0].id;
}

function getBingoMarkerMeta(value) {
  const normalized = normalizeBingoMarkerType(value);
  return BINGO_MARKER_OPTIONS.find(option => option.id === normalized) || BINGO_MARKER_OPTIONS[0];
}

function createBingoMarkerGrid() {
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
    if (row === 2 && col === 2) return 'star-violet';
    return '';
  }));
}

function createBingoPlayerCard() {
  return {
    grid: createBingoCard(),
    marked: createBingoMarkedGrid(),
    markers: createBingoMarkerGrid()
  };
}

function normalizeBingoWinningPattern(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return BINGO_PATTERN_OPTIONS.some(option => option.id === normalized) ? normalized : 'line';
}

function getBingoWinningPatternMeta(value) {
  const normalized = normalizeBingoWinningPattern(value);
  return BINGO_PATTERN_OPTIONS.find(option => option.id === normalized) || BINGO_PATTERN_OPTIONS[0];
}

function createBingoState(participants, winningPattern = 'line') {
  const players = Array.from(new Set((participants || [])
    .map(player => String(player?.name || '').trim())
    .filter(Boolean)));
  const cards = {};
  players.forEach(playerName => {
    cards[playerName] = createBingoPlayerCard();
  });
  return {
    phase: 'playing',
    drawPool: shuffleArray(Array.from({ length: 75 }, (_, idx) => idx + 1)),
    calledNumbers: [],
    cards,
    winners: [],
    winningPattern: normalizeBingoWinningPattern(winningPattern),
    nextWinningPattern: normalizeBingoWinningPattern(winningPattern),
    lastCalled: null,
    lastCalledAt: null,
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function getBingoCard(state, playerName) {
  const cards = state?.cards && typeof state.cards === 'object' ? state.cards : {};
  const card = cards[playerName];
  return card && typeof card === 'object' ? card : null;
}

function normalizeBingoMarkedGrid(marked) {
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
    if (row === 2 && col === 2) return true;
    return Boolean(marked?.[row]?.[col]);
  }));
}

function normalizeBingoMarkerGrid(markers, marked) {
  const normalizedMarked = normalizeBingoMarkedGrid(marked);
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
    if (row === 2 && col === 2) {
      return normalizeBingoMarkerType(markers?.[row]?.[col] || 'star-violet');
    }
    if (!normalizedMarked[row][col]) return '';
    return normalizeBingoMarkerType(markers?.[row]?.[col] || BINGO_MARKER_OPTIONS[0].id);
  }));
}

function buildBingoCalledSet(state) {
  return new Set(Array.isArray(state?.calledNumbers) ? state.calledNumbers.map(value => Number(value)) : []);
}

function isBingoCellMarkAllowed(card, calledSet, row, col) {
  const value = card?.grid?.[row]?.[col];
  if (row === 2 && col === 2) return true;
  return calledSet.has(Number(value));
}

function getBingoWinningLines() {
  const rows = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => [row, col]));
  const cols = Array.from({ length: 5 }, (_, col) => Array.from({ length: 5 }, (_, row) => [row, col]));
  const diagA = Array.from({ length: 5 }, (_, idx) => [idx, idx]);
  const diagB = Array.from({ length: 5 }, (_, idx) => [idx, 4 - idx]);
  return [...rows, ...cols, diagA, diagB];
}

function validateBingoCardAgainstCalled(card, calledSet, winningPattern = 'line') {
  if (!card?.grid || !card?.marked) return false;
  const marked = normalizeBingoMarkedGrid(card.marked);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (!marked[row][col]) continue;
      if (!isBingoCellMarkAllowed(card, calledSet, row, col)) return false;
    }
  }
  const pattern = normalizeBingoWinningPattern(winningPattern);
  if (pattern === 'four_corners') {
    return [[0, 0], [0, 4], [4, 0], [4, 4]].every(([row, col]) => marked[row][col]);
  }
  if (pattern === 'full_card') {
    return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => marked[row][col]).every(Boolean)).every(Boolean);
  }
  return getBingoWinningLines().some(line => line.every(([row, col]) => marked[row][col]));
}

function formatBingoCall(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 75) return '';
  const col = num <= 15 ? 'B' : num <= 30 ? 'I' : num <= 45 ? 'N' : num <= 60 ? 'G' : 'O';
  return `${col}-${num}`;
}

function formatBingoVoiceCall(value) {
  const label = formatBingoCall(value);
  return label ? label.replace('-', ' ') : '';
}

function speakBingoAnnouncement(text) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('Bingo speech unavailable', error);
  }
}

function triggerBingoCelebration(winners) {
  if (typeof document === 'undefined' || !document.body) return;
  const prior = document.getElementById('bingo-celebration-overlay');
  if (prior) prior.remove();
  const winnerNames = Array.isArray(winners)
    ? winners.map(name => String(name || '').trim()).filter(Boolean)
    : [];
  const overlay = document.createElement('div');
  overlay.id = 'bingo-celebration-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2400;overflow:hidden;';
  overlay.innerHTML = `
    <div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);padding:14px 20px;border-radius:999px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,rgba(239,35,60,0.94),rgba(249,115,22,0.9));box-shadow:0 22px 48px rgba(15,23,42,0.34);color:#ffffff;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;backdrop-filter:blur(8px);">
      Bingo Confirmed${winnerNames.length ? ` • ${escapeHtml(winnerNames.join(', '))}` : ''}!
    </div>
    <div class="trivia-confetti" style="position:absolute;inset:0;z-index:0;">${buildCelebrationConfettiPieces(34)}</div>
  `;
  document.body.appendChild(overlay);
  window.setTimeout(() => {
    if (overlay.isConnected) overlay.remove();
  }, 2200);
}

function maybeHandleBingoAnnouncements(state, winners, drawStamp, winStamp) {
  APP.bingoUi = APP.bingoUi && typeof APP.bingoUi === 'object' ? APP.bingoUi : getDefaultBingoUiState();
  const ui = APP.bingoUi;
  if (typeof ui.voiceEnabled !== 'boolean') ui.voiceEnabled = true;
  const roundStamp = Number(state?.startedAt) || 0;
  if (ui.lastObservedRoundStamp !== roundStamp) {
    ui.lastObservedRoundStamp = roundStamp;
    ui.lastAnnouncedCallStamp = drawStamp;
    ui.lastAnnouncedWinStamp = winStamp;
    return;
  }
  if (drawStamp && ui.lastAnnouncedCallStamp !== drawStamp) {
    ui.lastAnnouncedCallStamp = drawStamp;
    if (ui.voiceEnabled) {
      speakBingoAnnouncement(formatBingoVoiceCall(state?.lastCalled));
    }
  }
  if (!drawStamp) ui.lastAnnouncedCallStamp = null;
  if (winStamp && ui.lastAnnouncedWinStamp !== winStamp) {
    ui.lastAnnouncedWinStamp = winStamp;
    triggerBingoCelebration(winners);
    if (ui.voiceEnabled) {
      const winnerNames = Array.isArray(winners) ? winners.filter(Boolean).join(', ') : '';
      speakBingoAnnouncement(winnerNames ? `Bingo confirmed. Winner ${winnerNames}.` : 'Bingo confirmed.');
    }
  }
  if (!winStamp) ui.lastAnnouncedWinStamp = null;
}

function toggleBingoVoiceEnabled() {
  APP.bingoUi = APP.bingoUi && typeof APP.bingoUi === 'object' ? APP.bingoUi : getDefaultBingoUiState();
  APP.bingoUi.voiceEnabled = APP.bingoUi.voiceEnabled === false;
  if (!APP.bingoUi.voiceEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  render();
}

function getBingoBallMeta(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 75) return null;
  if (num <= 15) return { letter: 'B', number: num, color: '#ef233c' };
  if (num <= 30) return { letter: 'I', number: num, color: '#2563eb' };
  if (num <= 45) return { letter: 'N', number: num, color: '#16a34a' };
  if (num <= 60) return { letter: 'G', number: num, color: '#facc15', textColor: '#3f2200' };
  return { letter: 'O', number: num, color: '#f97316' };
}

async function bingoDrawNext() {
  if (!APP.roomCode || !APP.room || APP.room.host !== APP.player?.name) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'bingo') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBingoState(room.participants || []);
  if (state.phase !== 'playing') return;
  if (!Array.isArray(state.drawPool) || !state.drawPool.length) {
    showError('No more Bingo calls remain.');
    return;
  }
  const nextNumber = Number(state.drawPool.shift());
  const drawStamp = Date.now();
  state.calledNumbers = [...(Array.isArray(state.calledNumbers) ? state.calledNumbers : []), nextNumber];
  state.lastCalled = nextNumber;
  state.lastCalledAt = drawStamp;
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function bingoToggleMark(row, col) {
  if (!APP.roomCode || !Number.isInteger(row) || !Number.isInteger(col)) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'bingo') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBingoState(room.participants || []);
  if (state.phase !== 'playing') return;
  const me = APP.player?.name || '';
  const card = getBingoCard(state, me);
  if (!card) return;
  const calledSet = buildBingoCalledSet(state);
  if (!isBingoCellMarkAllowed(card, calledSet, row, col)) return;
  const marked = normalizeBingoMarkedGrid(card.marked);
  const markers = normalizeBingoMarkerGrid(card.markers, marked);
  if (!(row === 2 && col === 2)) {
    const nextMarked = !marked[row][col];
    marked[row][col] = nextMarked;
    markers[row][col] = nextMarked
      ? normalizeBingoMarkerType(APP.bingoUi?.selectedMarker || BINGO_MARKER_OPTIONS[0].id)
      : '';
  }
  state.cards[me] = {
    ...card,
    marked,
    markers
  };
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

function selectBingoMarker(markerId) {
  APP.bingoUi = APP.bingoUi && typeof APP.bingoUi === 'object' ? APP.bingoUi : getDefaultBingoUiState();
  APP.bingoUi.selectedMarker = normalizeBingoMarkerType(markerId);
  render();
}

async function bingoClaimWin() {
  if (!APP.roomCode) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'bingo') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBingoState(room.participants || []);
  if (state.phase !== 'playing') return;
  const me = APP.player?.name || '';
  const card = getBingoCard(state, me);
  if (!card) return;
  const calledSet = buildBingoCalledSet(state);
  if (!validateBingoCardAgainstCalled(card, calledSet, state.winningPattern)) {
    showError('That card is not a valid Bingo yet.');
    return;
  }
  state.phase = 'finished';
  state.winners = Array.from(new Set([...(Array.isArray(state.winners) ? state.winners : []), me]));
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function bingoSetNextPattern(pattern) {
  if (!APP.roomCode || !APP.room || APP.room.host !== APP.player?.name) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'bingo') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBingoState(room.participants || []);
  state.nextWinningPattern = normalizeBingoWinningPattern(pattern);
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function bingoStartNewRound() {
  if (!APP.roomCode || !APP.room || APP.room.host !== APP.player?.name) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'bingo') return;
  const previousState = room.activityState && typeof room.activityState === 'object' ? room.activityState : {};
  room.activityState = createBingoState(room.participants || [], previousState.nextWinningPattern || previousState.winningPattern || 'line');
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

function renderBingo() {
  const isHost = APP.room.host === APP.player.name;
  const state = APP.room.activityState && typeof APP.room.activityState === 'object'
    ? APP.room.activityState
    : createBingoState(APP.room.participants || []);
  const me = APP.player?.name || '';
  const card = getBingoCard(state, me);
  const calledSet = buildBingoCalledSet(state);
  const winners = Array.isArray(state.winners) ? state.winners : [];
  const winningPatternMeta = getBingoWinningPatternMeta(state.winningPattern);
  const nextWinningPatternMeta = getBingoWinningPatternMeta(state.nextWinningPattern || state.winningPattern);
  const hasWinningCard = card ? validateBingoCardAgainstCalled(card, calledSet, state.winningPattern) : false;
  const lastCallLabel = formatBingoCall(state.lastCalled);
  const lastBallMeta = getBingoBallMeta(state.lastCalled);
  const drawAnimationStamp = Number(state.lastCalledAt) || null;
  APP.bingoUi = APP.bingoUi && typeof APP.bingoUi === 'object' ? APP.bingoUi : getDefaultBingoUiState();
  APP.bingoUi.selectedMarker = normalizeBingoMarkerType(APP.bingoUi.selectedMarker || BINGO_MARKER_OPTIONS[0].id);
  APP.bingoUi.voiceEnabled = APP.bingoUi.voiceEnabled !== false;
  const shouldAnimateBall = drawAnimationStamp !== null && APP.bingoUi.lastAnimatedDrawStamp !== drawAnimationStamp;
  APP.bingoUi.lastAnimatedDrawStamp = drawAnimationStamp;
  const winStamp = state.phase === 'finished' && winners.length
    ? (Number(state.updatedAt) || Number(state.lastCalledAt) || Date.now())
    : null;
  maybeHandleBingoAnnouncements(state, winners, drawAnimationStamp, winStamp);
  const calledNumbers = Array.isArray(state.calledNumbers) ? state.calledNumbers : [];
  const priorCalls = state.lastCalled != null ? calledNumbers.slice(0, -1) : calledNumbers;
  const recentCalls = [...priorCalls].slice(-9).reverse();
  const fullHistoryCalls = [...calledNumbers].reverse();
  const participantNames = (APP.room.participants || []).map(player => player?.name).filter(Boolean);
  const bingoHeaderColors = ['#ef233c', '#2563eb', '#16a34a', '#facc15', '#f97316'];
  const cardMarkers = card ? normalizeBingoMarkerGrid(card.markers, card.marked) : null;
  const voiceButtonLabel = APP.bingoUi.voiceEnabled ? '🔊 Bingo Voice On' : '🔇 Bingo Voice Off';
  const canHostDraw = isHost && state.phase === 'playing' && Array.isArray(state.drawPool) && state.drawPool.length > 0;
  const numbersRemaining = Array.isArray(state.drawPool) ? state.drawPool.length : 0;

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">🎟️ Bingo</h1>
      <p class="tagline">Room: ${escapeHtml(APP.roomCode)} • ${state.phase === 'finished' ? `Round finished • ${escapeHtml(winningPatternMeta.label)}` : `Classic 75-ball Bingo • ${escapeHtml(winningPatternMeta.label)}`}</p>
    </div>

    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    <div class="game-mobile-shell game-mobile-main" style="max-width:1220px;margin:24px auto 0;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,0.9fr);gap:18px;align-items:start;">
      <div class="game-mobile-side" style="display:grid;gap:18px;">
        ${isHost ? `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
              <div>
                <div style="font-family:'Fraunces',serif;font-size:1.35rem;">Last Numbers Called</div>
                <div style="font-size:0.84rem;color:var(--text-dim);">${calledNumbers.length} of 75 numbers drawn</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
                <button
                  type="button"
                  class="btn-secondary"
                  data-action="bingo-toggle-voice"
                  style="width:auto;padding:9px 14px;white-space:nowrap;"
                  aria-pressed="${APP.bingoUi.voiceEnabled ? 'true' : 'false'}"
                >${voiceButtonLabel}</button>
                <div style="font-weight:800;font-size:1.05rem;color:${lastCallLabel ? 'var(--warning)' : 'var(--text-dim)'};">${lastCallLabel || 'Waiting for first draw'}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;margin-bottom:14px;border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));border:1px solid var(--border);">
              <div>
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Live Call Ball Action</div>
                <div style="font-family:'Fraunces',serif;font-size:1.2rem;">${lastCallLabel || 'Waiting for draw'}</div>
                <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">Click the live ball to draw the next number.</div>
              </div>
              <button
                type="button"
                data-action="${canHostDraw ? 'bingo-draw-next' : ''}"
                class="bingo-call-ball ${lastBallMeta ? '' : 'bingo-call-ball-faint'} ${shouldAnimateBall ? 'bingo-call-ball-animate' : ''}"
                style="${lastBallMeta ? `--ball-color:${lastBallMeta.color};` : '--ball-color:rgba(255,255,255,0.18);'}flex-shrink:0;cursor:${canHostDraw ? 'pointer' : 'default'};border:none;"
                aria-label="${escapeHtml(canHostDraw ? `Draw next Bingo number. Current call ${lastCallLabel || 'waiting for first draw'}` : (lastCallLabel || 'Waiting for first draw'))}"
                title="${escapeHtml(canHostDraw ? `Click to draw next number${lastCallLabel ? ` • Current ${lastCallLabel}` : ''}` : (lastCallLabel || 'Waiting for first draw'))}"
                ${canHostDraw ? '' : 'disabled'}
              >
                <div style="display:grid;place-items:center;line-height:1;">
                  <div style="font-size:0.86rem;font-weight:900;letter-spacing:0.18em;color:${lastBallMeta?.textColor || '#ffffff'};margin-bottom:3px;">${escapeHtml(lastBallMeta?.letter || 'B')}</div>
                  <div style="font-size:2rem;font-weight:900;color:${lastBallMeta?.textColor || '#ffffff'};letter-spacing:-0.05em;">${escapeHtml(lastBallMeta ? String(lastBallMeta.number) : '00')}</div>
                </div>
              </button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${recentCalls.length ? recentCalls.map(value => `
                <div style="padding:8px 12px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-weight:800;">
                  ${escapeHtml(formatBingoCall(value))}
                </div>
              `).join('') : '<div style="color:var(--text-dim);">No calls yet.</div>'}
            </div>
          </div>
        ` : ''}
        <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
            <div>
              <div style="font-family:'Fraunces',serif;font-size:1.45rem;">Your Card</div>
              <div style="font-size:0.84rem;color:var(--text-dim);">
                ${card ? 'Tap called numbers to mark them. Free space is already marked.' : 'This round started before you joined, so you are spectating this card set.'}
              </div>
            </div>
            ${state.phase === 'finished' && winners.length ? `<div style="font-weight:800;color:var(--warning);">Winner: ${escapeHtml(winners.join(', '))}</div>` : ''}
          </div>
          ${state.phase === 'finished' && winners.length ? `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,0.18);background:linear-gradient(135deg,rgba(239,35,60,0.18),rgba(249,115,22,0.16));box-shadow:0 14px 28px rgba(15,23,42,0.16);">
              <div>
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);margin-bottom:4px;">Bingo Confirmed</div>
                <div style="font-family:'Fraunces',serif;font-size:1.2rem;">${escapeHtml(winners.join(', '))} locked in the ${escapeHtml(winningPatternMeta.label)} win.</div>
              </div>
              <div style="font-size:2rem;line-height:1;">🎉</div>
            </div>
          ` : ''}

          ${card ? `
            <div class="game-mobile-scroll">
            <div class="bingo-card-frame bingo-card-grid" style="background:#ffffff;border:8px solid #ef233c;border-radius:24px;padding:12px 12px 14px;box-shadow:0 18px 42px rgba(0,0,0,0.18);margin-bottom:14px;">
              <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-bottom:6px;">
                ${BINGO_COLUMN_LABELS.map((label, idx) => `
                  <div class="bingo-card-header-cell" style="display:grid;place-items:center;padding:12px 0;border-radius:10px 10px 0 0;background:${bingoHeaderColors[idx]};border:2px solid ${bingoHeaderColors[idx]};font-weight:900;letter-spacing:0.18em;font-size:1.55rem;color:${idx === 3 ? '#3f2200' : '#ffffff'};text-shadow:${idx === 3 ? 'none' : '0 1px 0 rgba(0,0,0,0.18)'};">
                    ${escapeHtml(label)}
                  </div>
                `).join('')}
              </div>
              <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;">
              ${Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => {
                const value = card.grid[row][col];
                const marked = normalizeBingoMarkedGrid(card.marked)[row][col];
                const markerType = cardMarkers?.[row]?.[col] || '';
                const markerMeta = getBingoMarkerMeta(markerType || APP.bingoUi.selectedMarker);
                const callable = isBingoCellMarkAllowed(card, calledSet, row, col);
                const canToggle = state.phase === 'playing' && callable && !(row === 2 && col === 2);
                const isFree = value === 'FREE';
                const cellBackground = marked
                  ? `linear-gradient(135deg,${markerMeta.fill},rgba(255,255,255,0.92))`
                  : isFree
                    ? 'linear-gradient(135deg,#fef3c7,#dcfce7)'
                    : '#ffffff';
                const cellColor = marked
                  ? '#220312'
                  : isFree
                    ? '#5b2400'
                    : '#220312';
                const borderColor = marked
                  ? markerMeta.border
                  : callable
                    ? '#651226'
                    : '#a78b95';
                const markerOverlayShadow = markerMeta.kind === 'chip'
                  ? `inset 0 0 0 4px ${markerMeta.border}, 0 10px 18px ${markerMeta.glow}`
                  : markerMeta.kind === 'dauber'
                    ? `0 0 0 2px ${markerMeta.border}, inset 0 0 26px rgba(255,255,255,0.12)`
                    : 'none';
                const markerOverlayFilter = markerMeta.kind === 'icon'
                  ? `drop-shadow(0 6px 10px ${markerMeta.glow})`
                  : 'none';
                const markerOverlay = marked && markerMeta.kind !== 'cover' ? `
                  <span
                    aria-hidden="true"
                    style="position:absolute;inset:8px;border-radius:${markerMeta.kind === 'chip' ? '999px' : '18px'};display:grid;place-items:center;pointer-events:none;color:${markerMeta.accent};background:${markerMeta.kind === 'dauber' ? markerMeta.fill : 'transparent'};box-shadow:${markerOverlayShadow};filter:${markerOverlayFilter};font-size:${markerMeta.kind === 'icon' ? '2.15rem' : '3rem'};font-weight:900;line-height:1;opacity:${markerMeta.kind === 'dauber' ? '0.98' : '1'};"
                  >${escapeHtml(markerMeta.icon)}</span>
                ` : '';
                return `
                  <button
                    type="button"
                    class="bingo-card-cell ${isFree ? 'bingo-card-cell-free' : ''}"
                    data-action="${canToggle ? 'bingo-toggle-mark' : ''}"
                    data-bs-row="${row}"
                    data-bs-col="${col}"
                    style="position:relative;overflow:hidden;isolation:isolate;aspect-ratio:1/1;border-radius:0;border:2px solid ${borderColor};background:${cellBackground};color:${cellColor};display:grid;place-items:center;padding:10px;cursor:${canToggle ? 'pointer' : 'default'};font-weight:900;font-size:${isFree ? '0.98rem' : '3rem'};line-height:${isFree ? '1.05' : '0.95'};box-shadow:${marked ? `inset 0 0 0 2px rgba(255,255,255,0.36), 0 10px 24px ${markerMeta.glow}` : 'none'};letter-spacing:${isFree ? '0.02em' : '-0.05em'};">
                    ${markerOverlay}
                    <span style="position:relative;z-index:1;text-shadow:${marked && markerMeta.kind !== 'icon' ? '0 1px 0 rgba(255,255,255,0.2)' : 'none'};">${isFree ? 'FREE SPACE' : escapeHtml(String(value))}</span>
                  </button>
                `;
              }).join('')).join('')}
              </div>
            </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button class="btn-primary" data-action="bingo-claim" style="width:auto;padding:10px 16px;" ${(state.phase !== 'playing' || !hasWinningCard) ? 'disabled' : ''}>Claim Bingo</button>
              ${state.phase === 'playing' && !hasWinningCard ? `<div style="font-size:0.84rem;color:var(--text-dim);align-self:center;">${escapeHtml(winningPatternMeta.description)}</div>` : ''}
            </div>
          ` : `
            <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:24px;text-align:center;color:var(--text-dim);">
              No card assigned for this round. Wait for the host to start a new round.
            </div>
          `}
        </div>
        ${card ? `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-family:'Fraunces',serif;font-size:1.2rem;">Marker Settings</div>
                <div style="font-size:0.84rem;color:var(--text-dim);margin-top:4px;">Pick a token type or classic cover color before tapping a called square.</div>
              </div>
              <div style="font-size:0.8rem;font-weight:800;color:var(--text);">${escapeHtml(getBingoMarkerMeta(APP.bingoUi.selectedMarker).label)}</div>
            </div>
            <div style="margin-top:12px;">
              <div style="font-size:0.62rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;">Token Type</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${BINGO_MARKER_OPTIONS.map(option => {
                  const isSelected = APP.bingoUi.selectedMarker === option.id;
                  const markerLabel = escapeHtml(option.label);
                  return `
                    <button
                      type="button"
                      data-action="bingo-select-marker"
                      data-marker="${escapeHtml(option.id)}"
                      aria-pressed="${isSelected ? 'true' : 'false'}"
                      title="${markerLabel}"
                      style="width:38px;height:38px;padding:0;border-radius:12px;border:1px solid ${isSelected ? option.border : 'var(--border)'};background:${isSelected ? `linear-gradient(135deg,${option.fill},rgba(255,255,255,0.16))` : 'rgba(255,255,255,0.04)'};box-shadow:${isSelected ? `0 8px 18px ${option.glow}` : 'none'};color:${isSelected ? option.accent : 'var(--text)'};font:inherit;cursor:pointer;display:grid;place-items:center;flex:0 0 auto;"
                    >
                      <span style="font-size:${option.kind === 'icon' ? '1.05rem' : '1.2rem'};font-weight:900;line-height:1;color:${option.accent};">${escapeHtml(option.icon)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        ` : ''}
        ${isHost ? `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
              <div>
                <div style="font-family:'Fraunces',serif;font-size:1.2rem;">Full Number History Log</div>
                <div style="font-size:0.84rem;color:var(--text-dim);">Complete draw history for this round.</div>
              </div>
              <div style="font-size:0.8rem;font-weight:800;color:var(--text-dim);">${fullHistoryCalls.length} calls</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:220px;overflow:auto;padding-right:4px;">
              ${fullHistoryCalls.length ? fullHistoryCalls.map(value => `
                <div style="padding:8px 12px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-weight:800;">
                  ${escapeHtml(formatBingoCall(value))}
                </div>
              `).join('') : '<div style="color:var(--text-dim);">No numbers have been drawn yet.</div>'}
            </div>
          </div>
        ` : ''}

        ${!isHost ? `
        <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
            <div>
              <div style="font-family:'Fraunces',serif;font-size:1.35rem;">Recent Calls</div>
              <div style="font-size:0.84rem;color:var(--text-dim);">${calledNumbers.length} of 75 numbers drawn • Spoken on this device</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
              <button
                type="button"
                class="btn-secondary"
                data-action="bingo-toggle-voice"
                style="width:auto;padding:9px 14px;white-space:nowrap;"
                aria-pressed="${APP.bingoUi.voiceEnabled ? 'true' : 'false'}"
              >${voiceButtonLabel}</button>
              <div style="font-weight:800;font-size:1.15rem;color:${lastCallLabel ? 'var(--warning)' : 'var(--text-dim)'};">${lastCallLabel || 'Waiting for first draw'}</div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${recentCalls.length ? recentCalls.map(value => `
              <div style="padding:8px 12px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-weight:800;">
                ${escapeHtml(formatBingoCall(value))}
              </div>
            `).join('') : '<div style="color:var(--text-dim);">No calls yet.</div>'}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="game-mobile-side" style="display:grid;gap:18px;">
        ${isHost ? `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Host Settings</div>
            <div style="display:grid;gap:12px;">
              <div style="padding:14px 16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));border:1px solid var(--border);">
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Host</div>
                <div style="font-weight:800;">${escapeHtml(APP.room.host || '')}</div>
                <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">Voice announcements are local to each device. Use the live ball to keep the game moving.</div>
              </div>
              <div style="padding:14px 16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));border:1px solid var(--border);">
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Round Status</div>
                <div style="font-weight:800;">${state.phase === 'finished' ? 'Round finished' : 'Round live'}</div>
                <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">${numbersRemaining} numbers remain in the cage.</div>
              </div>
            </div>
          </div>
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Game Settings</div>
            <div style="margin-bottom:14px;">
              <div style="font-size:0.8rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:8px;">Next round game type</div>
              <div style="display:grid;gap:8px;">
                ${BINGO_PATTERN_OPTIONS.map(option => {
                  const isActive = nextWinningPatternMeta.id === option.id;
                  return `
                    <button
                      type="button"
                      data-action="bingo-set-pattern"
                      data-pattern="${escapeHtml(option.id)}"
                      style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;border:1px solid ${isActive ? 'rgba(255,255,255,0.24)' : 'var(--border)'};background:${isActive ? 'linear-gradient(135deg,rgba(37,99,235,0.36),rgba(34,197,94,0.26))' : 'var(--surface-2)'};color:var(--text);font:inherit;text-align:left;cursor:pointer;"
                    >
                      <span style="font-weight:800;">${escapeHtml(option.label)}</span>
                      <span style="font-size:0.8rem;color:${isActive ? 'rgba(255,255,255,0.86)' : 'var(--text-dim)'};">${escapeHtml(option.shortLabel)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
            <div style="font-size:0.84rem;color:var(--text-dim);">
              Current card target: ${escapeHtml(winningPatternMeta.shortLabel)}.
            </div>
          </div>
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Controls</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
              <button class="btn-primary" data-action="bingo-draw-next" style="width:auto;padding:10px 16px;" ${(state.phase !== 'playing' || !state.drawPool?.length) ? 'disabled' : ''}>Draw Next</button>
              <button class="btn-secondary" data-action="bingo-new-round" style="width:auto;padding:10px 16px;">New ${escapeHtml(nextWinningPatternMeta.label)}</button>
            </div>
            <div style="font-size:0.84rem;color:var(--text-dim);">
              ${state.phase === 'finished'
                ? (winners.length ? `${escapeHtml(winners.join(', '))} called Bingo.` : 'Round finished.')
                : `${numbersRemaining} numbers remain in the cage.`}
            </div>
          </div>
        ` : ''}
        ${!isHost ? `
          <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));">
              <div>
                <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px;">Live call</div>
                <div style="font-family:'Fraunces',serif;font-size:1.2rem;">${lastCallLabel || 'Waiting for draw'}</div>
                <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">The latest number appears here for everyone.</div>
              </div>
              <div
                class="bingo-call-ball ${lastBallMeta ? '' : 'bingo-call-ball-faint'} ${shouldAnimateBall ? 'bingo-call-ball-animate' : ''}"
                style="${lastBallMeta ? `--ball-color:${lastBallMeta.color};` : '--ball-color:rgba(255,255,255,0.18);'}flex-shrink:0;"
                aria-label="${escapeHtml(lastCallLabel || 'Waiting for first draw')}"
                title="${escapeHtml(lastCallLabel || 'Waiting for first draw')}"
              >
                <div style="display:grid;place-items:center;line-height:1;">
                  <div style="font-size:0.86rem;font-weight:900;letter-spacing:0.18em;color:${lastBallMeta?.textColor || '#ffffff'};margin-bottom:3px;">${escapeHtml(lastBallMeta?.letter || 'B')}</div>
                  <div style="font-size:2rem;font-weight:900;color:${lastBallMeta?.textColor || '#ffffff'};letter-spacing:-0.05em;">${escapeHtml(lastBallMeta ? String(lastBallMeta.number) : '00')}</div>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div style="background:var(--surface-solid);border:1px solid var(--border);border-radius:18px;padding:18px;">
          <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Players</div>
          <div style="display:grid;gap:8px;">
            ${participantNames.map(playerName => {
              const playerCard = getBingoCard(state, playerName);
              const playerHasBingo = playerCard ? validateBingoCardAgainstCalled(playerCard, calledSet, state.winningPattern) : false;
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:10px 12px;">
                  <strong>${escapeHtml(playerName)}</strong>
                  <span style="font-size:0.82rem;color:${winners.includes(playerName) ? 'var(--warning)' : playerHasBingo ? 'var(--accent)' : 'var(--text-dim)'};">
                    ${winners.includes(playerName) ? 'Winner' : playerHasBingo ? 'Ready to claim' : playerCard ? 'Playing' : 'Spectating'}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}
