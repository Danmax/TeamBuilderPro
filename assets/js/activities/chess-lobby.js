function getDefaultChessUiState() {
  return {
    selectedGameId: '',
    selectedSquare: '',
    pendingPromotion: null
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
let chessEngineModulePromise = null;

function createChessSeat(participant = null, fallbackLabel = 'Player') {
  return {
    playerId: String(participant?.id || participant?.playerId || '').trim(),
    playerName: String(participant?.name || participant?.playerName || '').trim() || fallbackLabel,
    avatar: String(participant?.avatar || '').trim() || '👤'
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
      status: ['invited', 'active', 'check', 'checkmate', 'stalemate', 'draw', 'resigned', 'abandoned'].includes(rawGame.status) ? rawGame.status : 'active',
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
  return ['checkmate', 'stalemate', 'draw', 'resigned', 'abandoned'].includes(String(game?.status || ''));
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
  const game = createChessGame(participants, playerId, CHESS_COMPUTER_PLAYER_ID, { createdByPlayerId: playerId });
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

function scoreChessComputerMove(chess, move, Chess) {
  const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const trial = new Chess(chess.fen());
  let applied = null;
  try {
    applied = trial.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  } catch (_error) {
    applied = null;
  }
  if (!applied) return Number.NEGATIVE_INFINITY;
  let score = Math.random() * 12;
  if (applied.captured) score += pieceValues[applied.captured] || 0;
  if (applied.promotion) score += pieceValues[applied.promotion] || 0;
  if (getChessGameStatusFromEngine(trial) === 'checkmate') score += 10000;
  if (getChessGameStatusFromEngine(trial) === 'check') score += 75;
  if (['d4', 'e4', 'd5', 'e5'].includes(applied.to)) score += 20;
  return score;
}

function chooseChessComputerMove(chess, Chess) {
  const moves = typeof chess.moves === 'function' ? chess.moves({ verbose: true }) : [];
  if (!Array.isArray(moves) || !moves.length) return null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMoves = [];
  moves.forEach(move => {
    const score = scoreChessComputerMove(chess, move, Chess);
    if (score > bestScore + 0.001) {
      bestScore = score;
      bestMoves = [move];
    } else if (Math.abs(score - bestScore) <= 0.001) {
      bestMoves.push(move);
    }
  });
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
      const game = createChessGame(room.participants || [], whiteId, blackId, { createdByPlayerId: myId });
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
      invitedPlayerId: targetId
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
        const chess = new Chess(game.fen || CHESS_START_FEN);
        const actionPrefix = result.playerMoveSan ? `${result.playerName || 'Player'} played ${result.playerMoveSan}.` : '';
        const computerMove = chooseChessComputerMove(chess, Chess);
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
                      <div style="font-size:0.82rem;color:var(--text-dim);">${escapeHtml(game.lastAction || 'Waiting for response.')}</div>
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
              return `
                <div style="border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:800;">${escapeHtml(getChessSeat(game, 'white').playerName)} vs ${escapeHtml(getChessSeat(game, 'black').playerName)}</div>
                    <div style="font-size:0.82rem;color:var(--text-dim);">${escapeHtml(getChessSeat(game, turnColor).playerName)} to move${game.status === 'check' ? ' • Check' : ''}</div>
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
        : game.status === 'draw'
          ? 'Draw'
          : game.status === 'check'
            ? 'Check'
            : 'Active';
  const winnerSeat = game.winnerPlayerId
    ? [getChessSeat(game, 'white'), getChessSeat(game, 'black')].find(seat => seat.playerId === game.winnerPlayerId)
    : null;

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

    ${isChessGameFinished(game) || game.status === 'check' ? `
      <div style="max-width:1180px;margin:0 auto 18px;padding:16px 18px;border-radius:22px;background:linear-gradient(135deg, rgba(255,209,102,0.16), rgba(0,210,211,0.08));border:1px solid rgba(255,209,102,0.26);">
        <div style="font-weight:900;font-size:1.1rem;margin-bottom:4px;">${escapeHtml(statusLabel)}</div>
        <div style="color:var(--text-mid);">${escapeHtml(game.lastAction || '')}</div>
      </div>
    ` : ''}

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
        <div style="background:linear-gradient(180deg,rgba(16,18,24,0.96),rgba(8,8,12,0.98));border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:18px;">
          <div style="font-family:'Fraunces',serif;font-size:1.25rem;margin-bottom:12px;">Match</div>
          ${['white', 'black'].map(color => {
            const seat = getChessSeat(game, color);
            const active = turnColor === color && !isChessGameFinished(game);
            return `
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px;border-radius:14px;background:${active ? 'rgba(0,210,211,0.1)' : 'rgba(255,255,255,0.04)'};border:1px solid ${active ? 'rgba(0,210,211,0.24)' : 'rgba(255,255,255,0.08)'};margin-bottom:10px;">
                <div>
                  <div style="font-weight:900;">${escapeHtml(seat.avatar)} ${escapeHtml(seat.playerName)}</div>
                  <div style="font-size:0.78rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;">${color}</div>
                </div>
                <div style="font-size:0.82rem;color:${active ? 'var(--accent)' : 'var(--text-dim)'};font-weight:800;">${active ? 'Turn' : winnerSeat?.playerId === seat.playerId ? 'Winner' : ''}</div>
              </div>
            `;
          }).join('')}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
            ${isPlayer && !isChessGameFinished(game) ? `<button class="btn-secondary" data-action="chess-offer-draw" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;">${game.drawOfferByPlayerId && game.drawOfferByPlayerId !== myId ? 'Accept Draw' : 'Offer Draw'}</button>` : ''}
            ${isPlayer && !isChessGameFinished(game) ? `<button class="btn-secondary" data-action="chess-resign" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;border-color:rgba(255,64,96,0.34);color:#ff9cac;">Resign</button>` : ''}
            ${isHost && !isChessGameFinished(game) ? `<button class="btn-secondary" data-action="chess-close-game" data-game-id="${escapeHtml(game.id)}" style="width:auto;padding:10px 14px;border-color:rgba(255,209,102,0.34);color:#ffd166;">Close Game</button>` : ''}
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
