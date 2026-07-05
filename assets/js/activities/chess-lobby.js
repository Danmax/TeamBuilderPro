function getDefaultChessUiState() {
  return {
    selectedGameId: '',
    selectedSquare: '',
    pendingPromotion: null,
    lastSoundKey: '',
    timeControlSeconds: 600,
    computerDifficulty: 'normal'
  };
}

const CHESS_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CHESS_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const CHESS_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const CHESS_PIECES = {
  wp: '♙',
  wn: '♘',
  wb: '♗',
  wr: '♖',
  wq: '♕',
  wk: '♔',
  bp: '♟',
  bn: '♞',
  bb: '♝',
  br: '♜',
  bq: '♛',
  bk: '♚'
};
const CHESS_COMPUTER_PLAYER_ID = '__team_builder_chess_computer__';
const CHESS_COMPUTER_SEAT = {
  playerId: CHESS_COMPUTER_PLAYER_ID,
  playerName: 'Computer',
  avatar: '🤖'
};
const CHESS_SOUND_SOURCES = {
  move: '/Sounds/move.wav',
  capture: '/Sounds/capture.wav'
};
const CHESS_TIMER_OPTIONS = [
  { seconds: 0, label: 'No clock' },
  { seconds: 300, label: '5 min' },
  { seconds: 600, label: '10 min' },
  { seconds: 900, label: '15 min' }
];
const CHESS_DIFFICULTY_OPTIONS = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' }
];
const chessSoundPlayers = {};
let chessEngineModulePromise = null;
let chessClockRenderTimer = 0;
let chessClockExpireTimer = 0;

function playChessMoveSound(move) {
  if (!move || typeof Audio === 'undefined') return;
  const soundType = move.captured ? 'capture' : 'move';
  const source = CHESS_SOUND_SOURCES[soundType] || CHESS_SOUND_SOURCES.move;
  try {
    if (!chessSoundPlayers[soundType]) {
      chessSoundPlayers[soundType] = new Audio(source);
      chessSoundPlayers[soundType].preload = 'auto';
    }
    const audio = chessSoundPlayers[soundType];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_error) {
    // Browsers can block audio until user interaction; ignore that safely.
  }
}

function maybePlayChessLastMoveSound(game) {
  const move = game?.lastMove;
  const moveAt = Number(move?.at) || 0;
  if (!moveAt || Date.now() - moveAt > 3000) return;
  APP.chessUi = APP.chessUi && typeof APP.chessUi === 'object' ? APP.chessUi : getDefaultChessUiState();
  const soundKey = `${game.id}:${move.from}:${move.to}:${moveAt}:${move.captured || ''}`;
  if (APP.chessUi.lastSoundKey === soundKey) return;
  APP.chessUi.lastSoundKey = soundKey;
  playChessMoveSound(move);
}

function createChessSeat(participant = null, fallbackLabel = 'Player') {
  return {
    playerId: String(participant?.id || participant?.playerId || '').trim(),
    playerName: String(participant?.name || participant?.playerName || '').trim() || fallbackLabel,
    avatar: String(participant?.avatar || '').trim() || '👤'
  };
}

function normalizeChessTimeControlSeconds(value) {
  if (value === undefined || value === null || value === '') return 600;
  const seconds = Number(value) || 0;
  return CHESS_TIMER_OPTIONS.some(option => option.seconds === seconds) ? seconds : 600;
}

function normalizeChessDifficulty(value) {
  const id = String(value || '').trim().toLowerCase();
  return CHESS_DIFFICULTY_OPTIONS.some(option => option.id === id) ? id : 'normal';
}

function getChessSelectedTimeControlSeconds() {
  APP.chessUi = APP.chessUi && typeof APP.chessUi === 'object' ? APP.chessUi : getDefaultChessUiState();
  APP.chessUi.timeControlSeconds = normalizeChessTimeControlSeconds(APP.chessUi.timeControlSeconds);
  return APP.chessUi.timeControlSeconds;
}

function getChessSelectedComputerDifficulty() {
  APP.chessUi = APP.chessUi && typeof APP.chessUi === 'object' ? APP.chessUi : getDefaultChessUiState();
  APP.chessUi.computerDifficulty = normalizeChessDifficulty(APP.chessUi.computerDifficulty);
  return APP.chessUi.computerDifficulty;
}

function getChessTimerLabel(seconds) {
  const safeSeconds = normalizeChessTimeControlSeconds(seconds);
  return CHESS_TIMER_OPTIONS.find(option => option.seconds === safeSeconds)?.label || '10 min';
}

function createChessTimerState(seconds, now = Date.now(), status = 'active') {
  const initialSeconds = normalizeChessTimeControlSeconds(seconds);
  return {
    initialSeconds,
    remaining: {
      white: initialSeconds,
      black: initialSeconds
    },
    activeColor: 'white',
    lastTickAt: initialSeconds && status !== 'invited' ? now : 0
  };
}

function normalizeChessTimer(rawTimer, rawGame = {}) {
  const initialSeconds = normalizeChessTimeControlSeconds(rawTimer?.initialSeconds ?? rawGame.timeControlSeconds ?? '0');
  const remaining = rawTimer?.remaining && typeof rawTimer.remaining === 'object' ? rawTimer.remaining : {};
  return {
    initialSeconds,
    remaining: {
      white: Math.max(0, Number(remaining.white ?? initialSeconds) || 0),
      black: Math.max(0, Number(remaining.black ?? initialSeconds) || 0)
    },
    activeColor: rawTimer?.activeColor === 'black' ? 'black' : 'white',
    lastTickAt: Math.max(0, Number(rawTimer?.lastTickAt) || 0)
  };
}

function getParticipantById(participants, playerId) {
  const id = String(playerId || '').trim();
  if (!id) return null;
  return (Array.isArray(participants) ? participants : []).find(participant => String(participant?.id || '').trim() === id) || null;
}

function createChessLobbyState(_participants = []) {
  return {
    phase: 'lobby',
    games: {},
    quickMatchQueue: [],
    selectedGameIdByPlayer: {},
    recentResults: [],
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function normalizeChessLobbyState(state, participants = []) {
  const source = state && typeof state === 'object' ? state : createChessLobbyState(participants);
  const games = {};
  Object.entries(source.games && typeof source.games === 'object' ? source.games : {}).forEach(([id, rawGame]) => {
    if (!rawGame || typeof rawGame !== 'object') return;
    const gameId = String(rawGame.id || id || '').trim();
    if (!gameId) return;
    const whiteParticipant = getParticipantById(participants, rawGame.players?.white?.playerId || rawGame.whitePlayerId);
    const blackParticipant = getParticipantById(participants, rawGame.players?.black?.playerId || rawGame.blackPlayerId);
    games[gameId] = {
      id: gameId,
      status: ['invited', 'active', 'check', 'checkmate', 'stalemate', 'draw', 'resigned', 'abandoned', 'timeout'].includes(rawGame.status) ? rawGame.status : 'active',
      players: {
        white: createChessSeat(rawGame.players?.white || whiteParticipant, 'White'),
        black: createChessSeat(rawGame.players?.black || blackParticipant, 'Black')
      },
      createdByPlayerId: String(rawGame.createdByPlayerId || rawGame.players?.white?.playerId || '').trim(),
      invitedPlayerId: String(rawGame.invitedPlayerId || '').trim(),
      fen: String(rawGame.fen || CHESS_START_FEN).trim() || CHESS_START_FEN,
      pgn: String(rawGame.pgn || ''),
      turn: String(rawGame.turn || 'w') === 'b' ? 'b' : 'w',
      moves: Array.isArray(rawGame.moves) ? rawGame.moves.slice(-240) : [],
      timer: normalizeChessTimer(rawGame.timer, rawGame),
      computerDifficulty: normalizeChessDifficulty(rawGame.computerDifficulty),
      lastMove: rawGame.lastMove && typeof rawGame.lastMove === 'object'
        ? { ...rawGame.lastMove, at: Number(rawGame.lastMove.at) || Number(rawGame.updatedAt) || 0 }
        : null,
      winnerPlayerId: String(rawGame.winnerPlayerId || '').trim(),
      drawOfferByPlayerId: String(rawGame.drawOfferByPlayerId || '').trim(),
      lastAction: String(rawGame.lastAction || '').trim(),
      createdAt: Number(rawGame.createdAt) || Date.now(),
      updatedAt: Number(rawGame.updatedAt) || Date.now(),
      finishedAt: Number(rawGame.finishedAt) || 0
    };
  });
  const participantIds = new Set((participants || []).map(participant => String(participant?.id || '').trim()).filter(Boolean));
  return {
    phase: 'lobby',
    games,
    quickMatchQueue: Array.isArray(source.quickMatchQueue)
      ? source.quickMatchQueue.map(id => String(id || '').trim()).filter(id => participantIds.has(id)).filter((id, index, arr) => arr.indexOf(id) === index)
      : [],
    selectedGameIdByPlayer: source.selectedGameIdByPlayer && typeof source.selectedGameIdByPlayer === 'object' ? { ...source.selectedGameIdByPlayer } : {},
    recentResults: Array.isArray(source.recentResults) ? source.recentResults.slice(0, 12) : [],
    startedAt: Number(source.startedAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now()
  };
}

function getChessPlayerColor(game, player = APP.player) {
  const playerId = String(player?.id || '').trim();
  if (!game?.players || !playerId) return '';
  if (game.players.white?.playerId === playerId) return 'white';
  if (game.players.black?.playerId === playerId) return 'black';
  return '';
}

function getChessSeat(game, color) {
  return game?.players?.[color] || createChessSeat(null, color === 'black' ? 'Black' : 'White');
}

function isChessGameFinished(game) {
  return ['checkmate', 'stalemate', 'draw', 'resigned', 'abandoned', 'timeout'].includes(String(game?.status || ''));
}

function getChessOpenGameForPlayer(state, playerId) {
  const id = String(playerId || '').trim();
  if (!id) return null;
  return Object.values(state?.games || {}).find(game => {
    if (!game || isChessGameFinished(game)) return false;
    return game.players?.white?.playerId === id || game.players?.black?.playerId === id;
  }) || null;
}

function createChessGame(participants, whitePlayerId, blackPlayerId, options = {}) {
  const whiteParticipant = getParticipantById(participants, whitePlayerId);
  const blackParticipant = getParticipantById(participants, blackPlayerId);
  const now = Date.now();
  const id = `chess_${now}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    status: options.status || 'active',
    players: {
      white: createChessSeat(whiteParticipant, 'White'),
      black: createChessSeat(blackParticipant, 'Black')
    },
    createdByPlayerId: String(options.createdByPlayerId || whitePlayerId || '').trim(),
    invitedPlayerId: String(options.invitedPlayerId || '').trim(),
    fen: CHESS_START_FEN,
    pgn: '',
    turn: 'w',
    moves: [],
    timer: createChessTimerState(options.timerSeconds, now, options.status || 'active'),
    computerDifficulty: normalizeChessDifficulty(options.computerDifficulty),
    lastMove: null,
    winnerPlayerId: '',
    drawOfferByPlayerId: '',
    lastAction: options.status === 'invited'
      ? `${whiteParticipant?.name || 'Player'} invited ${blackParticipant?.name || 'another player'} to play.`
      : `${whiteParticipant?.name || 'White'} vs ${blackParticipant?.name || 'Black'} started.`,
    createdAt: now,
    updatedAt: now,
    finishedAt: 0
  };
}

function createChessComputerGame(participants, playerId) {
  const game = createChessGame(participants, playerId, CHESS_COMPUTER_PLAYER_ID, {
    createdByPlayerId: playerId,
    timerSeconds: getChessSelectedTimeControlSeconds(),
    computerDifficulty: getChessSelectedComputerDifficulty()
  });
  game.players.black = { ...CHESS_COMPUTER_SEAT };
  game.lastAction = `${game.players.white.playerName} started a game against the computer. ${game.players.white.playerName} moves first.`;
  return game;
}

async function loadChessEngine() {
  if (!chessEngineModulePromise) {
    chessEngineModulePromise = import('/assets/vendor/chess.js');
  }
  const mod = await chessEngineModulePromise;
  return mod.Chess;
}

function scoreChessComputerMove(chess, move, Chess, difficulty = 'normal') {
  const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const trial = new Chess(chess.fen());
  let applied = null;
  try {
    applied = trial.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  } catch (_error) {
    applied = null;
  }
  if (!applied) return Number.NEGATIVE_INFINITY;
  const safeDifficulty = normalizeChessDifficulty(difficulty);
  let score = Math.random() * (safeDifficulty === 'hard' ? 2 : 12);
  if (applied.captured) score += pieceValues[applied.captured] || 0;
  if (applied.promotion) score += pieceValues[applied.promotion] || 0;
  if (getChessGameStatusFromEngine(trial) === 'checkmate') score += 10000;
  if (getChessGameStatusFromEngine(trial) === 'check') score += 75;
  if (['d4', 'e4', 'd5', 'e5'].includes(applied.to)) score += 20;
  return score;
}

function chooseChessComputerMove(chess, Chess, difficulty = 'normal') {
  const moves = typeof chess.moves === 'function' ? chess.moves({ verbose: true }) : [];
  if (!Array.isArray(moves) || !moves.length) return null;
  const safeDifficulty = normalizeChessDifficulty(difficulty);
  if (safeDifficulty === 'easy') {
    const shuffled = moves.slice().sort(() => Math.random() - 0.5);
    return shuffled.find(move => !move.san?.includes('#')) || shuffled[0] || null;
  }
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMoves = [];
  moves.forEach(move => {
    const score = scoreChessComputerMove(chess, move, Chess, safeDifficulty);
    if (score > bestScore + 0.001) {
      bestScore = score;
      bestMoves = [move];
    } else if (Math.abs(score - bestScore) <= 0.001) {
      bestMoves.push(move);
    }
  });
  if (safeDifficulty === 'hard') {
    return bestMoves[0] || moves[0] || null;
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || moves[Math.floor(Math.random() * moves.length)] || null;
}

function syncChessGameFromEngine(game, chess, move, moverColor, state, actionPrefix = '') {
  const now = Date.now();
  game.fen = chess.fen();
  game.pgn = typeof chess.pgn === 'function' ? chess.pgn() : game.pgn;
  game.turn = typeof chess.turn === 'function' ? chess.turn() : (getChessTurnColorFromFen(game.fen) === 'black' ? 'b' : 'w');
  game.lastMove = { from: move.from, to: move.to, san: move.san, color: move.color, piece: move.piece, captured: move.captured || '', promotion: move.promotion || '', at: now };
  game.moves = [...(Array.isArray(game.moves) ? game.moves : []), game.lastMove].slice(-240);
  game.drawOfferByPlayerId = '';
  game.status = getChessGameStatusFromEngine(chess);
  game.updatedAt = now;
  const moverSeat = getChessSeat(game, moverColor);
  if (game.status === 'checkmate') {
    game.winnerPlayerId = moverSeat.playerId;
    game.finishedAt = Date.now();
    game.lastAction = `${moverSeat.playerName} delivered checkmate.`;
    recordChessResult(state, game, `${moverSeat.playerName} won by checkmate`);
  } else if (game.status === 'stalemate') {
    game.finishedAt = Date.now();
    game.lastAction = 'Stalemate. The game is drawn.';
    recordChessResult(state, game, 'Draw by stalemate');
  } else if (game.status === 'draw') {
    game.finishedAt = Date.now();
    game.lastAction = 'The game ended in a draw.';
    recordChessResult(state, game, 'Draw');
  } else {
    updateChessClockAfterMove(game, now);
    const nextColor = getChessTurnColorFromFen(game.fen);
    const prefix = actionPrefix ? `${actionPrefix} ` : '';
    game.lastAction = `${prefix}${moverSeat.playerName} played ${move.san}. ${getChessSeat(game, nextColor).playerName} is up${game.status === 'check' ? ' in check' : ''}.`;
  }
}

function getChessGameStatusFromEngine(chess) {
  if (typeof chess.isCheckmate === 'function' && chess.isCheckmate()) return 'checkmate';
  if (typeof chess.isStalemate === 'function' && chess.isStalemate()) return 'stalemate';
  if (typeof chess.isDraw === 'function' && chess.isDraw()) return 'draw';
  if (typeof chess.in_checkmate === 'function' && chess.in_checkmate()) return 'checkmate';
  if (typeof chess.in_stalemate === 'function' && chess.in_stalemate()) return 'stalemate';
  if (typeof chess.in_draw === 'function' && chess.in_draw()) return 'draw';
  if (typeof chess.isCheck === 'function' && chess.isCheck()) return 'check';
  if (typeof chess.in_check === 'function' && chess.in_check()) return 'check';
  return 'active';
}

function getChessTurnColorFromFen(fen) {
  return String(fen || '').split(/\s+/)[1] === 'b' ? 'black' : 'white';
}

function formatChessClock(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function getChessTimerSnapshot(game, now = Date.now()) {
  const timer = normalizeChessTimer(game?.timer, game || {});
  if (!timer.initialSeconds) return { ...timer, running: false };
  const snapshot = {
    initialSeconds: timer.initialSeconds,
    remaining: { ...timer.remaining },
    activeColor: timer.activeColor,
    lastTickAt: timer.lastTickAt,
    running: !isChessGameFinished(game) && game?.status !== 'invited'
  };
  if (!snapshot.running || !snapshot.lastTickAt) return snapshot;
  const elapsedSeconds = Math.max(0, (now - snapshot.lastTickAt) / 1000);
  snapshot.remaining[snapshot.activeColor] = Math.max(0, snapshot.remaining[snapshot.activeColor] - elapsedSeconds);
  return snapshot;
}

function finishChessGameOnTime(game, state, flaggedColor, now = Date.now()) {
  const safeColor = flaggedColor === 'black' ? 'black' : 'white';
  const winnerColor = safeColor === 'white' ? 'black' : 'white';
  const winnerSeat = getChessSeat(game, winnerColor);
  const flaggedSeat = getChessSeat(game, safeColor);
  game.status = 'timeout';
  game.winnerPlayerId = winnerSeat.playerId;
  game.finishedAt = now;
  game.updatedAt = now;
  game.drawOfferByPlayerId = '';
  game.lastAction = `${flaggedSeat.playerName} ran out of time. ${winnerSeat.playerName} wins.`;
  if (game.timer?.remaining) game.timer.remaining[safeColor] = 0;
  recordChessResult(state, game, `${winnerSeat.playerName} won on time`);
  return true;
}

function applyChessClockTick(game, state, now = Date.now()) {
  if (!game?.timer?.initialSeconds || isChessGameFinished(game) || game.status === 'invited') return false;
  game.timer = normalizeChessTimer(game.timer, game);
  const activeColor = game.timer.activeColor === 'black' ? 'black' : 'white';
  const lastTickAt = Number(game.timer.lastTickAt) || now;
  const elapsedSeconds = Math.max(0, (now - lastTickAt) / 1000);
  if (elapsedSeconds > 0) {
    game.timer.remaining[activeColor] = Math.max(0, game.timer.remaining[activeColor] - elapsedSeconds);
    game.timer.lastTickAt = now;
  }
  if (game.timer.remaining[activeColor] <= 0) {
    return finishChessGameOnTime(game, state, activeColor, now);
  }
  return false;
}

function updateChessClockAfterMove(game, now = Date.now()) {
  if (!game?.timer?.initialSeconds || isChessGameFinished(game)) return;
  game.timer = normalizeChessTimer(game.timer, game);
  game.timer.activeColor = getChessTurnColorFromFen(game.fen);
  game.timer.lastTickAt = now;
}

async function chessExpireClock(gameId) {
  const safeGameId = String(gameId || '').trim();
  if (!safeGameId) return;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || isChessGameFinished(game)) return;
    applyChessClockTick(game, state);
  });
}

function scheduleChessClockTimers(game) {
  clearTimeout(chessClockRenderTimer);
  clearTimeout(chessClockExpireTimer);
  const snapshot = getChessTimerSnapshot(game);
  if (!snapshot.running || !snapshot.initialSeconds) return;
  chessClockRenderTimer = setTimeout(() => {
    if (APP.room?.currentActivity === 'chess-lobby' && APP.chessUi?.selectedGameId === game.id) render();
  }, 1000);
  const activeRemainingMs = Math.max(0, snapshot.remaining[snapshot.activeColor] * 1000);
  chessClockExpireTimer = setTimeout(() => {
    if (APP.room?.currentActivity === 'chess-lobby') chessExpireClock(game.id);
  }, activeRemainingMs + 150);
}

function getChessPieceGlyph(piece) {
  if (!piece || typeof piece !== 'object') return '';
  return CHESS_PIECES[`${piece.color}${piece.type}`] || '';
}

function isChessPromotionMove(game, from, to) {
  const safeFrom = String(from || '').trim();
  const safeTo = String(to || '').trim();
  if (!/^[a-h][1-8]$/.test(safeFrom) || !/^[a-h][1-8]$/.test(safeTo)) return false;
  const boardMap = buildChessBoardMapFromFen(game?.fen || CHESS_START_FEN);
  const piece = boardMap.get(safeFrom);
  if (!piece || piece.type !== 'p') return false;
  return (piece.color === 'w' && safeTo[1] === '8') || (piece.color === 'b' && safeTo[1] === '1');
}

function buildChessBoardMapFromFen(fen) {
  const map = new Map();
  const placement = String(fen || CHESS_START_FEN).split(/\s+/)[0] || CHESS_START_FEN.split(' ')[0];
  const pieceMap = {
    p: { color: 'b', type: 'p' },
    n: { color: 'b', type: 'n' },
    b: { color: 'b', type: 'b' },
    r: { color: 'b', type: 'r' },
    q: { color: 'b', type: 'q' },
    k: { color: 'b', type: 'k' },
    P: { color: 'w', type: 'p' },
    N: { color: 'w', type: 'n' },
    B: { color: 'w', type: 'b' },
    R: { color: 'w', type: 'r' },
    Q: { color: 'w', type: 'q' },
    K: { color: 'w', type: 'k' }
  };
  placement.split('/').forEach((rankText, rankIndex) => {
    let fileIndex = 0;
    for (const char of rankText) {
      if (/\d/.test(char)) {
        fileIndex += Number(char) || 0;
        continue;
      }
      const file = CHESS_FILES[fileIndex];
      const rank = CHESS_RANKS[rankIndex];
      const piece = pieceMap[char];
      if (file && rank && piece) map.set(`${file}${rank}`, { ...piece });
      fileIndex++;
    }
  });
  return map;
}

function recordChessResult(state, game, label) {
  state.recentResults = [
    {
      id: game.id,
      label,
      white: game.players.white?.playerName || 'White',
      black: game.players.black?.playerName || 'Black',
      finishedAt: Date.now()
    },
    ...(Array.isArray(state.recentResults) ? state.recentResults : [])
  ].slice(0, 12);
}

async function updateChessLobbyState(mutator) {
  if (!APP.roomCode || !APP.room) return null;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'chess-lobby') return null;
  const state = normalizeChessLobbyState(room.activityState, room.participants || []);
  const result = await mutator(state, room);
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
  return result;
}

async function chessQuickMatch() {
  const myId = String(APP.player?.id || '').trim();
  if (!myId) return;
  await updateChessLobbyState((state, room) => {
    if (getChessOpenGameForPlayer(state, myId)) return;
    state.quickMatchQueue = state.quickMatchQueue.filter(id => id !== myId && !getChessOpenGameForPlayer(state, id));
    const opponentId = state.quickMatchQueue.find(id => id && id !== myId && !getChessOpenGameForPlayer(state, id));
    if (opponentId) {
      state.quickMatchQueue = state.quickMatchQueue.filter(id => id !== opponentId);
      const whiteId = Math.random() >= 0.5 ? myId : opponentId;
      const blackId = whiteId === myId ? opponentId : myId;
      const game = createChessGame(room.participants || [], whiteId, blackId, {
        createdByPlayerId: myId,
        timerSeconds: getChessSelectedTimeControlSeconds()
      });
      state.games[game.id] = game;
      APP.chessUi.selectedGameId = game.id;
      APP.chessUi.selectedSquare = '';
      return;
    }
    state.quickMatchQueue.push(myId);
    APP.chessUi.selectedSquare = '';
  });
}

async function chessCancelQuickMatch() {
  const myId = String(APP.player?.id || '').trim();
  if (!myId) return;
  await updateChessLobbyState(state => {
    state.quickMatchQueue = state.quickMatchQueue.filter(id => id !== myId);
  });
}

async function chessPlayComputer() {
  const myId = String(APP.player?.id || '').trim();
  if (!myId) return;
  await updateChessLobbyState((state, room) => {
    if (getChessOpenGameForPlayer(state, myId)) return;
    state.quickMatchQueue = state.quickMatchQueue.filter(id => id !== myId);
    const game = createChessComputerGame(room.participants || [], myId);
    state.games[game.id] = game;
    APP.chessUi.selectedGameId = game.id;
    APP.chessUi.selectedSquare = '';
    APP.chessUi.pendingPromotion = null;
  });
}

async function chessInvitePlayer(invitedPlayerId) {
  const myId = String(APP.player?.id || '').trim();
  const targetId = String(invitedPlayerId || '').trim();
  if (!myId || !targetId || myId === targetId) return;
  await updateChessLobbyState((state, room) => {
    if (getChessOpenGameForPlayer(state, myId) || getChessOpenGameForPlayer(state, targetId)) return;
    const hasPending = Object.values(state.games).some(game =>
      game.status === 'invited'
      && game.createdByPlayerId === myId
      && game.invitedPlayerId === targetId
    );
    if (hasPending) return;
    const game = createChessGame(room.participants || [], myId, targetId, {
      status: 'invited',
      createdByPlayerId: myId,
      invitedPlayerId: targetId,
      timerSeconds: getChessSelectedTimeControlSeconds()
    });
    state.games[game.id] = game;
  });
}

async function chessAcceptInvite(gameId) {
  const myId = String(APP.player?.id || '').trim();
  const safeGameId = String(gameId || '').trim();
  if (!myId || !safeGameId) return;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || game.status !== 'invited' || game.invitedPlayerId !== myId) return;
    const existingGame = getChessOpenGameForPlayer(state, myId);
    if (existingGame && existingGame.id !== safeGameId) return;
    game.status = 'active';
    game.invitedPlayerId = '';
    if (game.timer?.initialSeconds) {
      game.timer.activeColor = 'white';
      game.timer.lastTickAt = Date.now();
    }
    game.lastAction = `${getChessSeat(game, 'black').playerName} accepted. ${getChessSeat(game, 'white').playerName} moves first.`;
    game.updatedAt = Date.now();
    APP.chessUi.selectedGameId = game.id;
    APP.chessUi.selectedSquare = '';
  });
}

async function chessDeclineInvite(gameId) {
  const myId = String(APP.player?.id || '').trim();
  const safeGameId = String(gameId || '').trim();
  if (!myId || !safeGameId) return;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || game.status !== 'invited' || game.invitedPlayerId !== myId) return;
    delete state.games[safeGameId];
  });
}

async function chessCancelInvite(gameId) {
  const myId = String(APP.player?.id || '').trim();
  const safeGameId = String(gameId || '').trim();
  if (!myId || !safeGameId) return;
  const isHost = APP.room?.host === APP.player?.name;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || game.status !== 'invited') return;
    if (!isHost && game.createdByPlayerId !== myId) return;
    delete state.games[safeGameId];
  });
}

function chessSelectGame(gameId = '') {
  APP.chessUi.selectedGameId = String(gameId || '').trim();
  APP.chessUi.selectedSquare = '';
  APP.chessUi.pendingPromotion = null;
  render();
}

function setChessTimeControl(seconds) {
  APP.chessUi = APP.chessUi && typeof APP.chessUi === 'object' ? APP.chessUi : getDefaultChessUiState();
  APP.chessUi.timeControlSeconds = normalizeChessTimeControlSeconds(seconds);
  render();
}

function setChessComputerDifficulty(difficulty) {
  APP.chessUi = APP.chessUi && typeof APP.chessUi === 'object' ? APP.chessUi : getDefaultChessUiState();
  APP.chessUi.computerDifficulty = normalizeChessDifficulty(difficulty);
  render();
}

async function chessHandleSquare(gameId, square) {
  const safeGameId = String(gameId || '').trim();
  const safeSquare = String(square || '').trim();
  if (!safeGameId || !/^[a-h][1-8]$/.test(safeSquare)) return;
  const state = normalizeChessLobbyState(APP.room?.activityState, APP.room?.participants || []);
  const game = state.games[safeGameId];
  if (!game || game.status !== 'active' && game.status !== 'check') return;
  const myColor = getChessPlayerColor(game);
  if (!myColor || getChessTurnColorFromFen(game.fen) !== myColor) return;
  const selectedSquare = String(APP.chessUi.selectedSquare || '').trim();
  const boardMap = buildChessBoardMapFromFen(game.fen);
  const clickedPiece = boardMap.get(safeSquare);
  const myPieceColor = myColor === 'white' ? 'w' : 'b';
  if (!selectedSquare) {
    if (clickedPiece?.color === myPieceColor) {
      APP.chessUi.selectedGameId = safeGameId;
      APP.chessUi.selectedSquare = safeSquare;
      render();
    }
    return;
  }
  if (selectedSquare === safeSquare) {
    APP.chessUi.selectedSquare = '';
    APP.chessUi.pendingPromotion = null;
    render();
    return;
  }
  if (clickedPiece?.color === myPieceColor) {
    APP.chessUi.selectedSquare = safeSquare;
    APP.chessUi.pendingPromotion = null;
    render();
    return;
  }
  if (isChessPromotionMove(game, selectedSquare, safeSquare)) {
    APP.chessUi.pendingPromotion = { gameId: safeGameId, from: selectedSquare, to: safeSquare };
    render();
    return;
  }
  await chessMakeMove(safeGameId, selectedSquare, safeSquare);
}

async function chessMakeMove(gameId, from, to, promotion = 'q') {
  const safeGameId = String(gameId || '').trim();
  const safeFrom = String(from || '').trim();
  const safeTo = String(to || '').trim();
  if (!safeGameId || !/^[a-h][1-8]$/.test(safeFrom) || !/^[a-h][1-8]$/.test(safeTo)) return;
  const Chess = await loadChessEngine();
  const result = await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || !['active', 'check'].includes(game.status)) return;
    const myColor = getChessPlayerColor(game);
    if (!myColor || getChessTurnColorFromFen(game.fen) !== myColor) return;
    if (applyChessClockTick(game, state)) return;
    const chess = new Chess(game.fen || CHESS_START_FEN);
    let move = null;
    try {
      move = chess.move({ from: safeFrom, to: safeTo, promotion: String(promotion || 'q').slice(0, 1).toLowerCase() || 'q' });
    } catch (_error) {
      move = null;
    }
    if (!move) return;
    syncChessGameFromEngine(game, chess, move, myColor, state);
    const shouldPlayComputer = !isChessGameFinished(game) && getChessSeat(game, getChessTurnColorFromFen(game.fen)).playerId === CHESS_COMPUTER_PLAYER_ID;
    const playerName = getChessSeat(game, myColor).playerName;
    APP.chessUi.selectedSquare = '';
    APP.chessUi.pendingPromotion = null;
    APP.chessUi.selectedGameId = safeGameId;
    return { shouldPlayComputer, playerName, playerMoveSan: move.san };
  });
  if (result?.shouldPlayComputer) {
    setTimeout(() => {
      updateChessLobbyState(state => {
        const game = state.games[safeGameId];
        if (!game || !['active', 'check'].includes(game.status) || isChessGameFinished(game)) return;
        const computerColor = getChessTurnColorFromFen(game.fen);
        if (getChessSeat(game, computerColor).playerId !== CHESS_COMPUTER_PLAYER_ID) return;
        if (applyChessClockTick(game, state)) return;
        const chess = new Chess(game.fen || CHESS_START_FEN);
        const actionPrefix = result.playerMoveSan ? `${result.playerName || 'Player'} played ${result.playerMoveSan}.` : '';
        const computerMove = chooseChessComputerMove(chess, Chess, game.computerDifficulty);
        if (computerMove) {
          const appliedComputerMove = chess.move({
            from: computerMove.from,
            to: computerMove.to,
            promotion: computerMove.promotion || 'q'
          });
          if (appliedComputerMove) {
            syncChessGameFromEngine(game, chess, appliedComputerMove, computerColor, state, actionPrefix);
          }
        }
        APP.chessUi.selectedSquare = '';
        APP.chessUi.pendingPromotion = null;
        APP.chessUi.selectedGameId = safeGameId;
      }).catch(error => console.error('Computer chess move failed', error));
    }, 520);
  }
}

async function chessResign(gameId) {
  const safeGameId = String(gameId || '').trim();
  const myId = String(APP.player?.id || '').trim();
  if (!safeGameId || !myId) return;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || isChessGameFinished(game)) return;
    const myColor = getChessPlayerColor(game);
    if (!myColor) return;
    const winnerColor = myColor === 'white' ? 'black' : 'white';
    const winnerSeat = getChessSeat(game, winnerColor);
    const resigningSeat = getChessSeat(game, myColor);
    game.status = 'resigned';
    game.winnerPlayerId = winnerSeat.playerId;
    game.finishedAt = Date.now();
    game.updatedAt = Date.now();
    game.lastAction = `${resigningSeat.playerName} resigned. ${winnerSeat.playerName} wins.`;
    recordChessResult(state, game, `${winnerSeat.playerName} won by resignation`);
  });
}

async function chessOfferDraw(gameId) {
  const safeGameId = String(gameId || '').trim();
  const myId = String(APP.player?.id || '').trim();
  if (!safeGameId || !myId) return;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || isChessGameFinished(game) || !getChessPlayerColor(game)) return;
    if (game.drawOfferByPlayerId && game.drawOfferByPlayerId !== myId) {
      game.status = 'draw';
      game.finishedAt = Date.now();
      game.updatedAt = Date.now();
      game.lastAction = 'Draw agreed.';
      game.drawOfferByPlayerId = '';
      recordChessResult(state, game, 'Draw by agreement');
      return;
    }
    game.drawOfferByPlayerId = myId;
    game.updatedAt = Date.now();
    game.lastAction = `${APP.player?.name || 'Player'} offered a draw.`;
  });
}

async function chessRematch(gameId) {
  const safeGameId = String(gameId || '').trim();
  const myId = String(APP.player?.id || '').trim();
  if (!safeGameId || !myId) return;
  await updateChessLobbyState((state, room) => {
    const sourceGame = state.games[safeGameId];
    if (!sourceGame || !isChessGameFinished(sourceGame) || !getChessPlayerColor(sourceGame)) return;
    if (getChessOpenGameForPlayer(state, myId)) return;
    const timerSeconds = sourceGame.timer?.initialSeconds || 0;
    let game = null;
    if (sourceGame.players?.black?.playerId === CHESS_COMPUTER_PLAYER_ID || sourceGame.players?.white?.playerId === CHESS_COMPUTER_PLAYER_ID) {
      game = createChessComputerGame(room.participants || [], myId);
      game.timer = createChessTimerState(timerSeconds, Date.now(), 'active');
      game.computerDifficulty = normalizeChessDifficulty(sourceGame.computerDifficulty);
    } else {
      const whiteId = sourceGame.players?.black?.playerId || '';
      const blackId = sourceGame.players?.white?.playerId || '';
      if (!whiteId || !blackId) return;
      game = createChessGame(room.participants || [], whiteId, blackId, {
        createdByPlayerId: myId,
        timerSeconds
      });
    }
    game.lastAction = `Rematch started from ${sourceGame.players.white?.playerName || 'White'} vs ${sourceGame.players.black?.playerName || 'Black'}.`;
    state.games[game.id] = game;
    APP.chessUi.selectedGameId = game.id;
    APP.chessUi.selectedSquare = '';
    APP.chessUi.pendingPromotion = null;
  });
}

function getChessResultCode(game) {
  if (['stalemate', 'draw'].includes(game?.status)) return '1/2-1/2';
  if (!game?.winnerPlayerId) return '*';
  if (game.players?.white?.playerId === game.winnerPlayerId) return '1-0';
  if (game.players?.black?.playerId === game.winnerPlayerId) return '0-1';
  return '*';
}

function buildChessMoveText(game) {
  const moves = Array.isArray(game?.moves) ? game.moves : [];
  if (!moves.length) return '*';
  const parts = [];
  for (let index = 0; index < moves.length; index += 2) {
    const moveNumber = Math.floor(index / 2) + 1;
    const whiteMove = moves[index]?.san || `${moves[index]?.from || ''}-${moves[index]?.to || ''}`;
    const blackMove = moves[index + 1]?.san || '';
    parts.push(`${moveNumber}. ${whiteMove}${blackMove ? ` ${blackMove}` : ''}`);
  }
  return `${parts.join(' ')} ${getChessResultCode(game)}`.trim();
}

function buildChessPgn(game) {
  const playedAt = new Date(Number(game?.createdAt) || Date.now());
  const date = `${playedAt.getFullYear()}.${String(playedAt.getMonth() + 1).padStart(2, '0')}.${String(playedAt.getDate()).padStart(2, '0')}`;
  const result = getChessResultCode(game);
  const escapePgn = value => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const headers = [
    ['Event', 'Team Builder Chess'],
    ['Site', APP.roomCode || 'Team Builder Pro'],
    ['Date', date],
    ['White', getChessSeat(game, 'white').playerName],
    ['Black', getChessSeat(game, 'black').playerName],
    ['Result', result],
    ['TimeControl', game?.timer?.initialSeconds ? `${game.timer.initialSeconds}` : '-'],
    ['Termination', game?.lastAction || game?.status || '*']
  ].map(([key, value]) => `[${key} "${escapePgn(value)}"]`).join('\n');
  const moveText = String(game?.pgn || '').trim() || buildChessMoveText(game);
  return `${headers}\n\n${moveText || result}\n`;
}

function downloadChessPgn(gameId) {
  const safeGameId = String(gameId || '').trim();
  const state = normalizeChessLobbyState(APP.room?.activityState, APP.room?.participants || []);
  const game = state.games[safeGameId];
  if (!game) return;
  const text = buildChessPgn(game);
  const filename = `team-builder-chess-${safeGameId}.pgn`;
  const blob = new Blob([text], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function chessClearFinishedGames() {
  if (APP.room?.host !== APP.player?.name) return;
  await updateChessLobbyState(state => {
    Object.entries(state.games).forEach(([id, game]) => {
      if (isChessGameFinished(game)) delete state.games[id];
    });
    APP.chessUi.selectedGameId = '';
    APP.chessUi.selectedSquare = '';
  });
}

async function chessCloseGame(gameId) {
  if (APP.room?.host !== APP.player?.name) return;
  const safeGameId = String(gameId || '').trim();
  if (!safeGameId) return;
  await updateChessLobbyState(state => {
    const game = state.games[safeGameId];
    if (!game || isChessGameFinished(game)) return;
    game.status = 'abandoned';
    game.finishedAt = Date.now();
    game.updatedAt = Date.now();
    game.drawOfferByPlayerId = '';
    game.lastAction = 'Host closed this game.';
    recordChessResult(state, game, 'Closed by host');
  });
}

async function chessResetLobby() {
  if (APP.room?.host !== APP.player?.name) return;
  await updateChessLobbyState((state, room) => {
    const fresh = createChessLobbyState(room.participants || []);
    state.games = fresh.games;
    state.quickMatchQueue = fresh.quickMatchQueue;
    state.selectedGameIdByPlayer = {};
    state.recentResults = [];
    APP.chessUi = getDefaultChessUiState();
  });
}

function renderChessLobby() {
  const isHost = APP.room.host === APP.player.name;
  const state = normalizeChessLobbyState(APP.room.activityState, APP.room.participants || []);
  const safeRoomCode = escapeHtml(APP.roomCode);
  const myId = String(APP.player?.id || '').trim();
  const games = Object.values(state.games).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const selectedGameRaw = state.games[APP.chessUi?.selectedGameId || ''] || null;
  const selectedGame = selectedGameRaw?.status === 'invited' ? null : selectedGameRaw;
  if (selectedGame) return renderChessGameView(state, selectedGame);
  const selectedTimeControl = getChessSelectedTimeControlSeconds();
  const selectedDifficulty = getChessSelectedComputerDifficulty();
  const timeControlOptions = CHESS_TIMER_OPTIONS.map(option => `
    <option value="${option.seconds}" ${option.seconds === selectedTimeControl ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
  const difficultyOptions = CHESS_DIFFICULTY_OPTIONS.map(option => `
    <option value="${escapeHtml(option.id)}" ${option.id === selectedDifficulty ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');

  const activeGames = games.filter(game => !isChessGameFinished(game) && game.status !== 'invited');
  const pendingInvites = games.filter(game => game.status === 'invited');
  const myActiveGame = activeGames.find(game => getChessPlayerColor(game));
  const isQueued = state.quickMatchQueue.includes(myId);
  const busyPlayerIds = new Set();
  games.forEach(game => {
    if (isChessGameFinished(game)) return;
    if (game.players?.white?.playerId) busyPlayerIds.add(game.players.white.playerId);
    if (game.players?.black?.playerId) busyPlayerIds.add(game.players.black.playerId);
  });

  const playerCards = (APP.room.participants || []).map(participant => {
    const participantId = String(participant?.id || '').trim();
    const isMe = participantId === myId;
    const isBusy = busyPlayerIds.has(participantId);
    const queued = state.quickMatchQueue.includes(participantId);
    const canInvite = !isMe && !myActiveGame && !isBusy && !queued;
    return `
      <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div style="font-size:1.45rem;">${escapeHtml(participant.avatar || '👤')}</div>
          <div style="min-width:0;">
            <div style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(participant.name || 'Player')}${isMe ? ' (You)' : ''}</div>
            <div style="font-size:0.78rem;color:${isBusy ? '#ffd166' : queued ? 'var(--accent)' : 'var(--text-dim)'};">${isBusy ? 'In game' : queued ? 'Waiting for quick match' : 'Available'}</div>
          </div>
        </div>
        ${canInvite ? `<button class="btn-secondary" data-action="chess-invite" data-player-id="${escapeHtml(participantId)}" style="width:auto;padding:8px 12px;">Invite</button>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">♟️ Chess Lobby</h1>
      <p class="tagline">Room: ${safeRoomCode} • Play solo against the computer or run multiple player boards at once</p>
    </div>

    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
      ${isHost ? '<button class="btn-secondary" data-action="end-activity" style="width:auto;">← End Activity</button>' : '<div></div>'}
      ${isHost ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary" data-action="chess-clear-finished" style="width:auto;padding:10px 14px;">Clear Finished</button>
          <button class="btn-secondary" data-action="chess-reset-lobby" style="width:auto;padding:10px 14px;border-color:rgba(255,64,96,0.34);color:#ff9cac;">Reset Lobby</button>
        </div>
      ` : ''}
    </div>

    <div class="game-mobile-main" style="max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(300px,0.9fr) minmax(0,1.35fr);gap:18px;align-items:start;">
      <div class="game-mobile-side" style="display:grid;gap:18px;">
        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:20px;box-shadow:0 24px 54px rgba(0,0,0,0.38);">
          <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:10px;">Find a Match</div>
          <div style="color:var(--text-dim);font-size:0.9rem;line-height:1.5;margin-bottom:16px;">Play the computer now, queue for a quick match, or invite an available player directly.</div>
          ${myActiveGame ? `
            <button class="btn-primary" data-action="chess-select-game" data-game-id="${escapeHtml(myActiveGame.id)}">Open My Game</button>
          ` : isQueued ? `
            <button class="btn-secondary" data-action="chess-cancel-quick-match" style="border-color:rgba(255,209,102,0.36);color:#ffd166;">Cancel Quick Match</button>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px;">
              <label style="display:grid;gap:6px;font-size:0.78rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.07em;">
                Timer
                <select onchange="setChessTimeControl(this.value)" style="width:100%;border:1px solid rgba(255,255,255,0.14);border-radius:12px;background:rgba(255,255,255,0.06);color:var(--text);padding:10px 12px;font:inherit;text-transform:none;letter-spacing:0;">
                  ${timeControlOptions}
                </select>
              </label>
              <label style="display:grid;gap:6px;font-size:0.78rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.07em;">
                Computer
                <select onchange="setChessComputerDifficulty(this.value)" style="width:100%;border:1px solid rgba(255,255,255,0.14);border-radius:12px;background:rgba(255,255,255,0.06);color:var(--text);padding:10px 12px;font:inherit;text-transform:none;letter-spacing:0;">
                  ${difficultyOptions}
                </select>
              </label>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button class="btn-primary" data-action="chess-quick-match" style="width:auto;flex:1 1 160px;">Quick Match</button>
              <button class="btn-secondary" data-action="chess-play-computer" style="width:auto;flex:1 1 160px;">Play Computer</button>
            </div>
          `}
        </div>

        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(0,0,0,0.38);">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Players</div>
          <div style="display:grid;gap:10px;">${playerCards}</div>
        </div>
      </div>

      <div class="game-mobile-side" style="display:grid;gap:18px;">
        ${pendingInvites.length ? `
          <div style="background:linear-gradient(180deg,rgba(28,21,8,0.96),rgba(11,9,5,0.98));border:1px solid rgba(255,209,102,0.24);border-radius:24px;padding:18px;">
            <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Pending Invites</div>
            <div style="display:grid;gap:10px;">
              ${pendingInvites.map(game => {
                const isMine = game.invitedPlayerId === myId;
                const canCancel = isHost || game.createdByPlayerId === myId;
                return `
                  <div style="border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                    <div>
                      <div style="font-weight:800;">${escapeHtml(getChessSeat(game, 'white').playerName)} invited ${escapeHtml(getChessSeat(game, 'black').playerName)}</div>
                      <div style="font-size:0.82rem;color:var(--text-dim);">${escapeHtml(game.lastAction || 'Waiting for response.')} • ${escapeHtml(getChessTimerLabel(game.timer?.initialSeconds || 0))}</div>
                    </div>
                    ${isMine ? `
                      <div style="display:flex;gap:8px;">
                        <button class="btn-primary" data-action="chess-accept-invite" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:8px 12px;">Accept</button>
                        <button class="btn-secondary" data-action="chess-decline-invite" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:8px 12px;">Decline</button>
                      </div>
                    ` : canCancel ? `
                      <button class="btn-secondary" data-action="chess-cancel-invite" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:8px 12px;">Cancel</button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(0,0,0,0.38);">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Active Games</div>
          <div style="display:grid;gap:10px;">
            ${activeGames.length ? activeGames.map(game => {
              const turnColor = getChessTurnColorFromFen(game.fen);
              const timerSnapshot = getChessTimerSnapshot(game);
              const clockLabel = timerSnapshot.initialSeconds
                ? `${formatChessClock(timerSnapshot.remaining.white)} / ${formatChessClock(timerSnapshot.remaining.black)}`
                : 'No clock';
              return `
                <div style="border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:800;">${escapeHtml(getChessSeat(game, 'white').playerName)} vs ${escapeHtml(getChessSeat(game, 'black').playerName)}</div>
                    <div style="font-size:0.82rem;color:var(--text-dim);">${escapeHtml(getChessSeat(game, turnColor).playerName)} to move${game.status === 'check' ? ' • Check' : ''} • ${escapeHtml(clockLabel)}</div>
                  </div>
                  <button class="btn-secondary" data-action="chess-select-game" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:8px 12px;">${getChessPlayerColor(game) ? 'Play' : 'Spectate'}</button>
                </div>
              `;
            }).join('') : `
              <div style="border:1px dashed rgba(255,255,255,0.14);border-radius:16px;padding:20px;text-align:center;color:var(--text-dim);">No active chess games yet.</div>
            `}
          </div>
        </div>

        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Recent Results</div>
          <div style="display:grid;gap:8px;">
            ${state.recentResults.length ? state.recentResults.map(result => `
              <div style="font-size:0.9rem;color:var(--text-mid);padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.04);">${escapeHtml(result.label || 'Finished game')} • ${escapeHtml(result.white || 'White')} vs ${escapeHtml(result.black || 'Black')}</div>
            `).join('') : '<div style="color:var(--text-dim);font-size:0.9rem;">Finished games will appear here.</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderChessGameView(state, game) {
  maybePlayChessLastMoveSound(game);
  scheduleChessClockTimers(game);
  const myColor = getChessPlayerColor(game);
  const myId = String(APP.player?.id || '').trim();
  const isPlayer = Boolean(myColor);
  const isHost = APP.room.host === APP.player.name;
  const turnColor = getChessTurnColorFromFen(game.fen);
  const canMove = isPlayer && !isChessGameFinished(game) && turnColor === myColor;
  const boardMap = buildChessBoardMapFromFen(game.fen);
  const selectedSquare = APP.chessUi?.selectedSquare || '';
  const orientation = myColor === 'black' ? 'black' : 'white';
  const files = orientation === 'black' ? [...CHESS_FILES].reverse() : CHESS_FILES;
  const ranks = orientation === 'black' ? [...CHESS_RANKS].reverse() : CHESS_RANKS;
  const lastMoveSquares = new Set([game.lastMove?.from, game.lastMove?.to].filter(Boolean));
  const lastMoveAgeMs = Date.now() - (Number(game.lastMove?.at) || 0);
  const shouldAnimateLastMove = lastMoveAgeMs >= 0 && lastMoveAgeMs < 1800;
  const getDisplayPosition = square => ({
    fileIndex: files.indexOf(String(square || '').slice(0, 1)),
    rankIndex: ranks.indexOf(String(square || '').slice(1, 2))
  });
  const lastMoveFromPosition = getDisplayPosition(game.lastMove?.from);
  const lastMoveToPosition = getDisplayPosition(game.lastMove?.to);
  const canAnimateLastMove = shouldAnimateLastMove
    && lastMoveFromPosition.fileIndex >= 0
    && lastMoveFromPosition.rankIndex >= 0
    && lastMoveToPosition.fileIndex >= 0
    && lastMoveToPosition.rankIndex >= 0;
  const pendingPromotion = APP.chessUi?.pendingPromotion;
  const capturedByWhite = (game.moves || []).filter(move => move.color === 'w' && move.captured).map(move => ({ color: 'b', type: move.captured }));
  const capturedByBlack = (game.moves || []).filter(move => move.color === 'b' && move.captured).map(move => ({ color: 'w', type: move.captured }));
  const statusLabel = game.status === 'checkmate'
    ? 'Checkmate'
    : game.status === 'stalemate'
      ? 'Stalemate'
      : game.status === 'resigned'
        ? 'Resigned'
        : game.status === 'timeout'
          ? 'Timeout'
          : game.status === 'draw'
            ? 'Draw'
            : game.status === 'check'
              ? 'Check'
              : 'Active';
  const winnerSeat = game.winnerPlayerId
    ? [getChessSeat(game, 'white'), getChessSeat(game, 'black')].find(seat => seat.playerId === game.winnerPlayerId)
    : null;
  const timerSnapshot = getChessTimerSnapshot(game);
  const statusAlertMarkup = isChessGameFinished(game) || game.status === 'check' ? `
    <div style="padding:16px 18px;border-radius:22px;background:linear-gradient(135deg, rgba(255,209,102,0.16), rgba(0,210,211,0.08));border:1px solid rgba(255,209,102,0.26);">
      <div style="font-weight:900;font-size:1.1rem;margin-bottom:4px;">${escapeHtml(statusLabel)}</div>
      <div style="color:var(--text-mid);">${escapeHtml(game.lastAction || '')}</div>
    </div>
  ` : '';

  const boardMarkup = ranks.map(rank => files.map(file => {
    const square = `${file}${rank}`;
    const piece = boardMap.get(square);
    const isLight = (CHESS_FILES.indexOf(file) + Number(rank)) % 2 === 1;
    const isSelected = selectedSquare === square;
    const isLastMove = lastMoveSquares.has(square);
    const isLastMoveFrom = game.lastMove?.from === square;
    const isLastMoveTo = game.lastMove?.to === square;
    const moveClass = [
      isLastMoveFrom ? 'chess-square-move-from' : '',
      isLastMoveTo ? 'chess-square-move-to' : '',
      isLastMoveTo && canAnimateLastMove ? 'chess-square-animate-move' : ''
    ].filter(Boolean).join(' ');
    const moveStyle = isLastMoveTo && canAnimateLastMove
      ? `--chess-move-x:${(lastMoveFromPosition.fileIndex - lastMoveToPosition.fileIndex) * 100}%;--chess-move-y:${(lastMoveFromPosition.rankIndex - lastMoveToPosition.rankIndex) * 100}%;`
      : '';
    return `
      <button
        type="button"
        class="chess-square ${moveClass}"
        data-action="chess-square"
        data-game-id="${escapeHtml(game.id)}"
        data-square="${escapeHtml(square)}"
        ${canMove ? '' : 'disabled'}
        style="
          aspect-ratio:1/1;
          border:0;
          display:grid;
          place-items:center;
          font-size:clamp(1.6rem, 6vw, 3.3rem);
          line-height:1;
          cursor:${canMove ? 'pointer' : 'default'};
          background:${isSelected ? 'linear-gradient(135deg,#f6d365,#fda085)' : isLastMove ? 'linear-gradient(135deg,rgba(0,210,211,0.34),rgba(255,209,102,0.28))' : isLight ? '#e8d8bd' : '#6d4b35'};
          color:${piece?.color === 'w' ? '#f8f3e7' : '#15110c'};
          text-shadow:${piece?.color === 'w' ? '0 2px 6px rgba(0,0,0,0.5)' : '0 1px 3px rgba(255,255,255,0.18)'};
          box-shadow:${isSelected ? 'inset 0 0 0 4px rgba(0,0,0,0.28)' : 'inset 0 0 0 1px rgba(0,0,0,0.12)'};
          ${moveStyle}
        "
        title="${escapeHtml(square)}"
      >
        ${piece ? `<span class="chess-piece-glyph">${escapeHtml(getChessPieceGlyph(piece))}</span>` : ''}
      </button>
    `;
  }).join('')).join('');

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">♟️ ${escapeHtml(getChessSeat(game, 'white').playerName)} vs ${escapeHtml(getChessSeat(game, 'black').playerName)}</h1>
      <p class="tagline">${isPlayer ? `You are ${myColor}` : 'Spectating'} • ${winnerSeat ? `${escapeHtml(winnerSeat.playerName)} wins` : `${escapeHtml(getChessSeat(game, turnColor).playerName)} to move`}</p>
    </div>

    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
      <button class="btn-secondary" data-action="chess-back-lobby" style="width:auto;">← Chess Lobby</button>
      ${isHost ? '<button class="btn-secondary" data-action="end-activity" style="width:auto;">End Activity</button>' : ''}
    </div>

    <div class="game-mobile-main" style="max-width:1280px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,0.7fr);gap:18px;align-items:start;">
      <div class="game-mobile-side" style="background:linear-gradient(180deg,rgba(18,17,14,0.98),rgba(8,8,8,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(0,0,0,0.45);">
        <div class="game-mobile-scroll">
          <div class="chess-board" style="min-width:320px;max-width:720px;margin:0 auto;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));border-radius:18px;overflow:hidden;border:10px solid #2a1d15;box-shadow:0 24px 44px rgba(0,0,0,0.44);">
            ${boardMarkup}
          </div>
        </div>
        ${pendingPromotion && pendingPromotion.gameId === game.id ? `
          <div style="margin:16px auto 0;max-width:720px;padding:14px;border-radius:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
            <div style="font-weight:800;">Choose promotion</div>
            <div style="display:flex;gap:8px;">
              ${['q', 'r', 'b', 'n'].map(piece => `<button class="btn-secondary" data-action="chess-promote" data-promotion="${piece}" style="width:auto;padding:8px 12px;text-transform:uppercase;">${piece}</button>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="game-mobile-side" style="display:grid;gap:18px;">
        ${statusAlertMarkup}
        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Match</div>
          ${['white', 'black'].map(color => {
            const seat = getChessSeat(game, color);
            const active = turnColor === color && !isChessGameFinished(game);
            const clock = timerSnapshot.initialSeconds ? formatChessClock(timerSnapshot.remaining[color]) : '';
            return `
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px;border-radius:14px;background:${active ? 'rgba(0,210,211,0.1)' : 'rgba(255,255,255,0.04)'};border:1px solid ${active ? 'rgba(0,210,211,0.24)' : 'rgba(255,255,255,0.08)'};margin-bottom:10px;">
                <div>
                  <div style="font-weight:900;">${escapeHtml(seat.avatar)} ${escapeHtml(seat.playerName)}</div>
                  <div style="font-size:0.78rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;">${color}${clock ? ` • ${escapeHtml(getChessTimerLabel(timerSnapshot.initialSeconds))}` : ''}</div>
                </div>
                <div style="text-align:right;">
                  ${clock ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:1.2rem;font-weight:900;color:${active ? 'var(--accent)' : 'var(--text)'};">${escapeHtml(clock)}</div>` : ''}
                  <div style="font-size:0.82rem;color:${active ? 'var(--accent)' : 'var(--text-dim)'};font-weight:800;">${active ? 'Turn' : winnerSeat?.playerId === seat.playerId ? 'Winner' : ''}</div>
                </div>
              </div>
            `;
          }).join('')}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${isPlayer && !isChessGameFinished(game) ? `<button class="btn-secondary" data-action="chess-offer-draw" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;">${game.drawOfferByPlayerId && game.drawOfferByPlayerId !== myId ? 'Accept Draw' : 'Offer Draw'}</button>` : ''}
            ${isPlayer && !isChessGameFinished(game) ? `<button class="btn-secondary" data-action="chess-resign" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;border-color:rgba(255,64,96,0.34);color:#ff9cac;">Resign</button>` : ''}
            ${isHost && !isChessGameFinished(game) ? `<button class="btn-secondary" data-action="chess-close-game" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;border-color:rgba(255,209,102,0.34);color:#ffd166;">Close Game</button>` : ''}
            ${isPlayer && isChessGameFinished(game) ? `<button class="btn-primary" data-action="chess-rematch" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;">Rematch</button>` : ''}
            ${(game.moves || []).length ? `<button class="btn-secondary" data-action="chess-export-pgn" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;">Export PGN</button>` : ''}
          </div>
        </div>

        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Captured</div>
          <div style="display:grid;gap:10px;">
            <div style="padding:10px;border-radius:12px;background:rgba(255,255,255,0.04);"><strong>White:</strong> ${capturedByWhite.map(getChessPieceGlyph).join(' ') || '<span style="color:var(--text-dim);">None</span>'}</div>
            <div style="padding:10px;border-radius:12px;background:rgba(255,255,255,0.04);"><strong>Black:</strong> ${capturedByBlack.map(getChessPieceGlyph).join(' ') || '<span style="color:var(--text-dim);">None</span>'}</div>
          </div>
        </div>

        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Moves</div>
          <div style="max-height:260px;overflow:auto;display:grid;gap:6px;">
            ${(game.moves || []).length ? game.moves.map((move, idx) => `
              <div style="display:grid;grid-template-columns:44px 1fr;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.04);font-family:'IBM Plex Mono',monospace;font-size:0.84rem;">
                <span style="color:var(--text-dim);">${idx + 1}</span>
                <span>${escapeHtml(move.san || `${move.from}-${move.to}`)}</span>
              </div>
            `).join('') : '<div style="color:var(--text-dim);font-size:0.9rem;">No moves yet.</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function registerChessLobbyActivity() {
  const registry = window.TEAM_BUILDER_ACTIVITY_REGISTRY;
  if (!registry || typeof registry.registerActivity !== 'function' || typeof registry.registerAction !== 'function') return;
  registry.registerActivity('chess-lobby', {
    label: 'Chess Lobby',
    createInitialState: room => createChessLobbyState(room?.participants || []),
    render: () => renderChessLobby()
  });
  registry.registerAction('start-chess-lobby', () => startActivityById('chess-lobby'));
  registry.registerAction('chess-quick-match', () => chessQuickMatch());
  registry.registerAction('chess-cancel-quick-match', () => chessCancelQuickMatch());
  registry.registerAction('chess-play-computer', () => chessPlayComputer());
  registry.registerAction('chess-invite', ({ dataset }) => chessInvitePlayer(dataset.playerId));
  registry.registerAction('chess-accept-invite', ({ dataset }) => chessAcceptInvite(dataset.gameId));
  registry.registerAction('chess-decline-invite', ({ dataset }) => chessDeclineInvite(dataset.gameId));
  registry.registerAction('chess-cancel-invite', ({ dataset }) => chessCancelInvite(dataset.gameId));
  registry.registerAction('chess-select-game', ({ dataset }) => chessSelectGame(dataset.gameId));
  registry.registerAction('chess-back-lobby', () => chessSelectGame(''));
  registry.registerAction('chess-square', ({ dataset }) => chessHandleSquare(dataset.gameId, dataset.square));
  registry.registerAction('chess-promote', ({ dataset }) => {
    const promotion = APP.chessUi?.pendingPromotion;
    if (!promotion) return;
    return chessMakeMove(promotion.gameId, promotion.from, promotion.to, dataset.promotion || 'q');
  });
  registry.registerAction('chess-resign', ({ dataset }) => chessResign(dataset.gameId));
  registry.registerAction('chess-offer-draw', ({ dataset }) => chessOfferDraw(dataset.gameId));
  registry.registerAction('chess-rematch', ({ dataset }) => chessRematch(dataset.gameId));
  registry.registerAction('chess-export-pgn', ({ dataset }) => downloadChessPgn(dataset.gameId));
  registry.registerAction('chess-clear-finished', () => chessClearFinishedGames());
  registry.registerAction('chess-close-game', ({ dataset }) => chessCloseGame(dataset.gameId));
  registry.registerAction('chess-reset-lobby', () => chessResetLobby());
}

registerChessLobbyActivity();
