function getDefaultBattleshipUiState() {
  return {
    selectedShipId: 'carrier',
    placementAxis: 'horizontal',
    dragShipId: '',
    lastTapShipId: '',
    lastTapAt: 0,
    lastShotSoundKey: ''
  };
}

function cloneBattleshipStaticData(key, fallback) {
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

const BATTLESHIP_BOARD_SIZE = Number(cloneBattleshipStaticData('BATTLESHIP_BOARD_SIZE', 10)) || 10;
const BATTLESHIP_SHIP_SET = cloneBattleshipStaticData('BATTLESHIP_SHIP_SET', []);
const BATTLESHIP_COLUMN_LABELS = cloneBattleshipStaticData('BATTLESHIP_COLUMN_LABELS', 'ABCDEFGHIJ'.split(''));
const BATTLESHIP_SOUND_SOURCES = {
  shot: '/Sounds/freesound_community-laser-gun-72558.mp3',
  hit: '/Sounds/capture.wav'
};
const battleshipSoundPlayers = {};

function playBattleshipSound(key = 'shot') {
  if (typeof Audio === 'undefined') return;
  const source = BATTLESHIP_SOUND_SOURCES[key] || BATTLESHIP_SOUND_SOURCES.shot;
  try {
    if (!battleshipSoundPlayers[key]) {
      battleshipSoundPlayers[key] = new Audio(source);
      battleshipSoundPlayers[key].preload = 'auto';
    }
    const audio = battleshipSoundPlayers[key];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_error) {
    // Browser audio can be blocked until a user gesture.
  }
}

function maybePlayBattleshipLastShotSound(state) {
  const shot = state?.lastShot;
  const shotAt = Number(shot?.at) || 0;
  if (!shotAt || Date.now() - shotAt > 3000) return;
  APP.battleshipUi = APP.battleshipUi && typeof APP.battleshipUi === 'object' ? APP.battleshipUi : getDefaultBattleshipUiState();
  const soundKey = `battleship:${shot.attacker}:${shot.defender}:${shot.row}:${shot.col}:${shot.result}:${shotAt}`;
  if (APP.battleshipUi.lastShotSoundKey === soundKey) return;
  APP.battleshipUi.lastShotSoundKey = soundKey;
  playBattleshipSound('shot');
  if (shot.result === 'hit') {
    window.setTimeout(() => playBattleshipSound('hit'), 110);
  }
}

function createBattleshipShipState(template) {
  return {
    id: template.id,
    label: template.label,
    role: template.role || '',
    accent: template.accent || '#8af1ff',
    length: template.length,
    horizontal: true,
    row: -1,
    col: -1,
    cells: []
  };
}

function createBattleshipPlayerState() {
  return {
    ready: false,
    ships: BATTLESHIP_SHIP_SET.map(createBattleshipShipState),
    shotsTaken: [],
    shotsReceived: []
  };
}

function createBattleshipState(participants, previousState = null) {
  const now = Date.now();
  const players = Array.from(new Set((participants || [])
    .map(player => String(player?.name || '').trim())
    .filter(Boolean)))
    .slice(0, 2);
  const previousBoards = previousState?.boards && typeof previousState.boards === 'object'
    ? previousState.boards
    : {};
  const boards = {};
  players.forEach(playerName => {
    const previousBoard = previousBoards[playerName];
    boards[playerName] = previousBoard && typeof previousBoard === 'object'
      ? previousBoard
      : createBattleshipPlayerState();
  });
  return {
    phase: 'setup',
    players,
    boards,
    turn: players[0] || '',
    winner: '',
    lastAction: '',
    startedAt: now,
    updatedAt: now
  };
}

function getBattleshipPlayers(state) {
  return Array.isArray(state?.players) ? state.players.filter(Boolean).slice(0, 2) : [];
}

function getBattleshipOpponent(state, playerName) {
  return getBattleshipPlayers(state).find(name => name !== playerName) || '';
}

function getBattleshipBoard(state, playerName) {
  const boards = state?.boards && typeof state.boards === 'object' ? state.boards : {};
  const board = boards[playerName];
  return board && typeof board === 'object' ? board : null;
}

function getBattleshipShipCells(row, col, length, horizontal) {
  return Array.from({ length }, (_, idx) => ({
    row: horizontal ? row : row + idx,
    col: horizontal ? col + idx : col
  }));
}

function normalizeBattleshipBoard(board) {
  const base = board && typeof board === 'object' ? board : {};
  return {
    ready: base.ready === true,
    ships: Array.isArray(base.ships) ? base.ships.map(ship => ({
      id: String(ship?.id || ''),
      label: String(ship?.label || ''),
      length: Number(ship?.length) || 0,
      horizontal: ship?.horizontal !== false,
      row: Number.isInteger(ship?.row) ? ship.row : -1,
      col: Number.isInteger(ship?.col) ? ship.col : -1,
      cells: Array.isArray(ship?.cells) ? ship.cells.map(cell => ({
        row: Number(cell?.row),
        col: Number(cell?.col)
      })).filter(cell => Number.isInteger(cell.row) && Number.isInteger(cell.col)) : []
    })) : BATTLESHIP_SHIP_SET.map(createBattleshipShipState),
    shotsTaken: Array.isArray(base.shotsTaken) ? base.shotsTaken.map(shot => ({
      row: Number(shot?.row),
      col: Number(shot?.col),
      result: String(shot?.result || 'miss'),
      shipId: String(shot?.shipId || ''),
      at: Number(shot?.at) || 0,
      attacker: String(shot?.attacker || ''),
      defender: String(shot?.defender || '')
    })).filter(shot => Number.isInteger(shot.row) && Number.isInteger(shot.col)) : [],
    shotsReceived: Array.isArray(base.shotsReceived) ? base.shotsReceived.map(shot => ({
      row: Number(shot?.row),
      col: Number(shot?.col),
      result: String(shot?.result || 'miss'),
      shipId: String(shot?.shipId || ''),
      at: Number(shot?.at) || 0,
      attacker: String(shot?.attacker || ''),
      defender: String(shot?.defender || '')
    })).filter(shot => Number.isInteger(shot.row) && Number.isInteger(shot.col)) : []
  };
}

function findBattleshipShip(board, shipId) {
  return normalizeBattleshipBoard(board).ships.find(ship => ship.id === shipId) || null;
}

function getBattleshipShipAtCell(board, row, col, excludeShipId = '') {
  const safeBoard = normalizeBattleshipBoard(board);
  for (const ship of safeBoard.ships) {
    if (excludeShipId && ship.id === excludeShipId) continue;
    if (ship.cells.some(cell => cell.row === row && cell.col === col)) {
      return ship;
    }
  }
  return null;
}

function canPlaceBattleshipShip(board, shipId, row, col, horizontal) {
  const safeBoard = normalizeBattleshipBoard(board);
  const ship = safeBoard.ships.find(entry => entry.id === shipId);
  if (!ship) return false;
  const cells = getBattleshipShipCells(row, col, ship.length, horizontal);
  if (cells.some(cell => cell.row < 0 || cell.col < 0 || cell.row >= BATTLESHIP_BOARD_SIZE || cell.col >= BATTLESHIP_BOARD_SIZE)) {
    return false;
  }
  return cells.every(cell => !getBattleshipShipAtCell(safeBoard, cell.row, cell.col, shipId));
}

function placeBattleshipShip(board, shipId, row, col, horizontal) {
  const safeBoard = normalizeBattleshipBoard(board);
  const ship = safeBoard.ships.find(entry => entry.id === shipId);
  if (!ship) return safeBoard;
  ship.horizontal = horizontal !== false;
  ship.row = row;
  ship.col = col;
  ship.cells = getBattleshipShipCells(row, col, ship.length, ship.horizontal);
  safeBoard.ready = false;
  return safeBoard;
}

function clearBattleshipBoard(board) {
  const safeBoard = normalizeBattleshipBoard(board);
  safeBoard.ready = false;
  safeBoard.ships = BATTLESHIP_SHIP_SET.map(createBattleshipShipState);
  safeBoard.shotsTaken = [];
  safeBoard.shotsReceived = [];
  return safeBoard;
}

function areBattleshipShipsPlaced(board) {
  return normalizeBattleshipBoard(board).ships.every(ship => Array.isArray(ship.cells) && ship.cells.length === ship.length);
}

function getBattleshipShotsByCell(shots) {
  const map = new Map();
  (Array.isArray(shots) ? shots : []).forEach(shot => {
    map.set(`${shot.row}:${shot.col}`, shot);
  });
  return map;
}

function isBattleshipShipSunk(board, ship) {
  if (!ship || !Array.isArray(ship.cells) || !ship.cells.length) return false;
  const receivedMap = getBattleshipShotsByCell(normalizeBattleshipBoard(board).shotsReceived);
  return ship.cells.every(cell => receivedMap.get(`${cell.row}:${cell.col}`)?.result === 'hit');
}

function areAllBattleshipShipsSunk(board) {
  const safeBoard = normalizeBattleshipBoard(board);
  return safeBoard.ships.length > 0 && safeBoard.ships.every(ship => isBattleshipShipSunk(safeBoard, ship));
}

function getBattleshipLivingShips(board) {
  return normalizeBattleshipBoard(board).ships.filter(ship => !isBattleshipShipSunk(board, ship)).length;
}

function randomizeBattleshipBoard(board) {
  let nextBoard = clearBattleshipBoard(board);
  for (const ship of nextBoard.ships) {
    let placed = false;
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const horizontal = Math.random() >= 0.5;
      const maxRow = horizontal ? BATTLESHIP_BOARD_SIZE - 1 : BATTLESHIP_BOARD_SIZE - ship.length;
      const maxCol = horizontal ? BATTLESHIP_BOARD_SIZE - ship.length : BATTLESHIP_BOARD_SIZE - 1;
      const row = Math.floor(Math.random() * (maxRow + 1));
      const col = Math.floor(Math.random() * (maxCol + 1));
      if (!canPlaceBattleshipShip(nextBoard, ship.id, row, col, horizontal)) continue;
      nextBoard = placeBattleshipShip(nextBoard, ship.id, row, col, horizontal);
      placed = true;
    }
  }
  return nextBoard;
}

function getCurrentBattleshipPlayerBoard() {
  if (APP.room?.currentActivity !== 'battleship') return null;
  const state = APP.room.activityState && typeof APP.room.activityState === 'object'
    ? APP.room.activityState
    : createBattleshipState(APP.room.participants || []);
  const me = APP.player?.name || '';
  if (!getBattleshipPlayers(state).includes(me)) return null;
  return normalizeBattleshipBoard(getBattleshipBoard(state, me));
}

function getNextBattleshipSelectableShip(board, currentShipId = '') {
  const safeBoard = normalizeBattleshipBoard(board);
  const ships = Array.isArray(safeBoard.ships) ? safeBoard.ships : [];
  if (!ships.length) return null;
  const unplacedShips = ships.filter(ship => ship.cells.length !== ship.length);
  if (unplacedShips.length) {
    const currentIndex = unplacedShips.findIndex(ship => ship.id === currentShipId);
    if (currentIndex >= 0) {
      return unplacedShips[(currentIndex + 1) % unplacedShips.length] || unplacedShips[0] || null;
    }
    return unplacedShips[0] || null;
  }
  const currentIndex = ships.findIndex(ship => ship.id === currentShipId);
  if (currentIndex >= 0) {
    return ships[(currentIndex + 1) % ships.length] || ships[0] || null;
  }
  return ships[0] || null;
}

function getNextUnplacedBattleshipShip(board, currentShipId = '') {
  const safeBoard = normalizeBattleshipBoard(board);
  const unplacedShips = (Array.isArray(safeBoard.ships) ? safeBoard.ships : []).filter(ship => ship.cells.length !== ship.length);
  if (!unplacedShips.length) return null;
  const currentIndex = unplacedShips.findIndex(ship => ship.id === currentShipId);
  if (currentIndex >= 0) {
    return unplacedShips[(currentIndex + 1) % unplacedShips.length] || unplacedShips[0] || null;
  }
  return unplacedShips[0] || null;
}

function selectBattleshipShip(shipId) {
  if (!shipId) return;
  APP.battleshipUi.selectedShipId = shipId;
  const board = getCurrentBattleshipPlayerBoard();
  const ship = board ? findBattleshipShip(board, shipId) : null;
  if (ship && ship.cells.length === ship.length) {
    APP.battleshipUi.placementAxis = ship.horizontal === false ? 'vertical' : 'horizontal';
  }
  render();
}

async function handleBattleshipShipSelection(shipId) {
  const normalizedShipId = String(shipId || '').trim();
  if (!normalizedShipId) return;
  const now = Date.now();
  const sameShipTapped = APP.battleshipUi.selectedShipId === normalizedShipId
    && APP.battleshipUi.lastTapShipId === normalizedShipId
    && (now - Number(APP.battleshipUi.lastTapAt || 0)) <= 400;
  APP.battleshipUi.lastTapShipId = normalizedShipId;
  APP.battleshipUi.lastTapAt = now;
  if (sameShipTapped && APP.room?.currentActivity === 'battleship') {
    APP.battleshipUi.lastTapShipId = '';
    APP.battleshipUi.lastTapAt = 0;
    await toggleBattleshipPlacementAxis();
    return;
  }
  selectBattleshipShip(normalizedShipId);
}

function selectNextBattleshipShip() {
  const board = getCurrentBattleshipPlayerBoard();
  if (!board) return;
  const nextShip = getNextBattleshipSelectableShip(board, APP.battleshipUi.selectedShipId || '');
  if (!nextShip?.id) return;
  selectBattleshipShip(nextShip.id);
}

function selectNextUnplacedBattleshipShip() {
  const board = getCurrentBattleshipPlayerBoard();
  if (!board) return;
  const nextShip = getNextUnplacedBattleshipShip(board, APP.battleshipUi.selectedShipId || '');
  if (!nextShip?.id) return;
  APP.battleshipUi.lastTapShipId = '';
  APP.battleshipUi.lastTapAt = 0;
  selectBattleshipShip(nextShip.id);
}

function setBattleshipPlacementAxis(axis) {
  APP.battleshipUi.placementAxis = axis === 'vertical' ? 'vertical' : 'horizontal';
  render();
}

async function toggleBattleshipPlacementAxis() {
  const nextAxis = APP.battleshipUi.placementAxis === 'horizontal' ? 'vertical' : 'horizontal';
  APP.battleshipUi.placementAxis = nextAxis;
  const board = getCurrentBattleshipPlayerBoard();
  const selectedShipId = String(APP.battleshipUi.selectedShipId || '').trim();
  const ship = board && selectedShipId ? findBattleshipShip(board, selectedShipId) : null;
  if (!board || !ship || ship.cells.length !== ship.length || APP.room?.currentActivity !== 'battleship') {
    render();
    return;
  }
  const nextHorizontal = nextAxis !== 'vertical';
  if (!canPlaceBattleshipShip(board, ship.id, ship.row, ship.col, nextHorizontal)) {
    render();
    showError('Ship rotated for the next drop. Move it to a new slot to finish the turn.');
    return;
  }
  await placeBattleshipShipAt(ship.row, ship.col, ship.id);
}

async function placeBattleshipShipAt(row, col, explicitShipId = '') {
  if (!APP.roomCode || !Number.isInteger(row) || !Number.isInteger(col)) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'battleship') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBattleshipState(room.participants || []);
  if (state.phase !== 'setup') return;
  const players = getBattleshipPlayers(state);
  if (!players.includes(APP.player?.name || '')) return;
  const board = getBattleshipBoard(state, APP.player.name);
  if (!board) return;
  const shipId = String(explicitShipId || APP.battleshipUi.selectedShipId || '').trim();
  if (!shipId) {
    showError('Select a ship first.');
    return;
  }
  const currentShip = findBattleshipShip(board, shipId);
  const wasPlaced = Boolean(currentShip && currentShip.cells.length === currentShip.length);
  const horizontal = APP.battleshipUi.placementAxis !== 'vertical';
  if (!canPlaceBattleshipShip(board, shipId, row, col, horizontal)) {
    showError('That ship does not fit there.');
    return;
  }
  state.boards[APP.player.name] = placeBattleshipShip(board, shipId, row, col, horizontal);
  state.updatedAt = Date.now();
  const nextShip = normalizeBattleshipBoard(state.boards[APP.player.name]).ships.find(ship => ship.cells.length !== ship.length);
  APP.battleshipUi.selectedShipId = wasPlaced ? shipId : (nextShip?.id || shipId);
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function randomizeBattleshipFleet(ready = false) {
  if (!APP.roomCode) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'battleship') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBattleshipState(room.participants || []);
  if (state.phase !== 'setup') return;
  if (!getBattleshipPlayers(state).includes(APP.player?.name || '')) return;
  const board = randomizeBattleshipBoard(getBattleshipBoard(state, APP.player.name));
  board.ready = ready === true;
  state.boards[APP.player.name] = board;
  if (ready === true) {
    const players = getBattleshipPlayers(state);
    if (players.length === 2 && players.every(name => normalizeBattleshipBoard(getBattleshipBoard(state, name)).ready)) {
      state.phase = 'battle';
      state.turn = players[0];
      state.lastAction = `${players[0]} has the first shot.`;
    } else {
      state.lastAction = `${APP.player.name} placed a random fleet and is ready.`;
    }
  }
  state.updatedAt = Date.now();
  APP.battleshipUi.selectedShipId = '';
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function clearBattleshipFleet() {
  if (!APP.roomCode) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'battleship') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBattleshipState(room.participants || []);
  if (state.phase !== 'setup') return;
  if (!getBattleshipPlayers(state).includes(APP.player?.name || '')) return;
  state.boards[APP.player.name] = clearBattleshipBoard(getBattleshipBoard(state, APP.player.name));
  state.updatedAt = Date.now();
  APP.battleshipUi = getDefaultBattleshipUiState();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function setBattleshipReady(ready) {
  if (!APP.roomCode) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'battleship') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBattleshipState(room.participants || []);
  if (state.phase !== 'setup') return;
  if (!getBattleshipPlayers(state).includes(APP.player?.name || '')) return;
  const board = normalizeBattleshipBoard(getBattleshipBoard(state, APP.player.name));
  if (ready && !areBattleshipShipsPlaced(board)) {
    showError('Place all ships before marking ready.');
    return;
  }
  board.ready = ready === true;
  state.boards[APP.player.name] = board;
  const players = getBattleshipPlayers(state);
  if (players.length === 2 && players.every(name => normalizeBattleshipBoard(getBattleshipBoard(state, name)).ready)) {
    state.phase = 'battle';
    state.turn = players[0];
    state.lastAction = `${players[0]} has the first shot.`;
  }
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function attackBattleshipCell(row, col) {
  if (!APP.roomCode || !Number.isInteger(row) || !Number.isInteger(col)) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'battleship') return;
  const state = room.activityState || {};
  if (state.phase !== 'battle') return;
  const attacker = APP.player?.name || '';
  const players = getBattleshipPlayers(state);
  if (!players.includes(attacker)) return;
  if (state.turn !== attacker) return;
  const defender = getBattleshipOpponent(state, attacker);
  if (!defender) return;
  const attackerBoard = normalizeBattleshipBoard(getBattleshipBoard(state, attacker));
  const defenderBoard = normalizeBattleshipBoard(getBattleshipBoard(state, defender));
  if (attackerBoard.shotsTaken.some(shot => shot.row === row && shot.col === col)) return;

  const targetShip = getBattleshipShipAtCell(defenderBoard, row, col);
  const result = targetShip ? 'hit' : 'miss';
  const shot = { row, col, result, shipId: targetShip?.id || '', attacker, defender, at: Date.now() };
  attackerBoard.shotsTaken = [...attackerBoard.shotsTaken, shot];
  defenderBoard.shotsReceived = [...defenderBoard.shotsReceived, shot];

  let actionLabel = `${attacker} missed at ${BATTLESHIP_COLUMN_LABELS[col]}${row + 1}.`;
  if (targetShip) {
    const sunk = isBattleshipShipSunk(defenderBoard, targetShip);
    actionLabel = sunk
      ? `${attacker} sank ${defender}'s ${targetShip.label}.`
      : `${attacker} hit ${defender}'s fleet at ${BATTLESHIP_COLUMN_LABELS[col]}${row + 1}.`;
  }

  state.boards[attacker] = attackerBoard;
  state.boards[defender] = defenderBoard;
  state.lastAction = actionLabel;
  state.lastShot = shot;
  if (areAllBattleshipShipsSunk(defenderBoard)) {
    state.phase = 'finished';
    state.winner = attacker;
    state.turn = '';
  } else {
    state.turn = defender;
  }
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function restartBattleshipMatch() {
  if (!APP.roomCode || !APP.room || APP.room.host !== APP.player?.name) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'battleship') return;
  room.activityState = createBattleshipState(room.participants || [], room.activityState || null);
  APP.battleshipUi = getDefaultBattleshipUiState();
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

function getBattleshipOwnCellState(board, row, col) {
  const safeBoard = normalizeBattleshipBoard(board);
  const ship = getBattleshipShipAtCell(safeBoard, row, col);
  const shot = safeBoard.shotsReceived.find(entry => entry.row === row && entry.col === col) || null;
  return {
    ship,
    shot
  };
}

function getBattleshipTargetCellState(board, row, col) {
  const safeBoard = normalizeBattleshipBoard(board);
  return safeBoard.shotsTaken.find(entry => entry.row === row && entry.col === col) || null;
}

function getBattleshipShipHits(board, ship) {
  if (!ship) return 0;
  const safeBoard = normalizeBattleshipBoard(board);
  const receivedMap = getBattleshipShotsByCell(safeBoard.shotsReceived);
  return (ship.cells || []).filter(cell => receivedMap.has(`${cell.row},${cell.col}`)).length;
}

function formatBattleshipShipPosition(ship) {
  if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== ship.length) return 'Awaiting deployment';
  return `${ship.horizontal ? 'Horizontal' : 'Vertical'} • ${BATTLESHIP_COLUMN_LABELS[ship.col]}${ship.row + 1}`;
}

function renderBattleshipGridLabelCell(content, extraStyle = '') {
  return `<div class="battleship-grid-label" style="display:grid;place-items:center;font-size:0.78rem;font-weight:800;color:rgba(236,233,225,0.72);text-shadow:0 0 10px rgba(138,241,255,0.2);${extraStyle}">${content}</div>`;
}

function renderBattleship() {
  const isHost = APP.room.host === APP.player.name;
  const state = APP.room.activityState && typeof APP.room.activityState === 'object'
    ? APP.room.activityState
    : createBattleshipState(APP.room.participants || []);
  const players = getBattleshipPlayers(state);
  const safeRoomCode = escapeHtml(APP.roomCode);
  const me = APP.player?.name || '';
  const isBattlePlayer = players.includes(me);
  const opponent = getBattleshipOpponent(state, me);
  const myBoard = isBattlePlayer ? normalizeBattleshipBoard(getBattleshipBoard(state, me)) : null;
  const opponentBoard = opponent ? normalizeBattleshipBoard(getBattleshipBoard(state, opponent)) : null;
  const selectedShipId = APP.battleshipUi.selectedShipId || '';
  const placementAxis = APP.battleshipUi.placementAxis === 'vertical' ? 'vertical' : 'horizontal';
  const selectedShip = myBoard && selectedShipId ? findBattleshipShip(myBoard, selectedShipId) : null;
  const setupReadyCount = players.filter(name => normalizeBattleshipBoard(getBattleshipBoard(state, name)).ready).length;
  const turnName = String(state.turn || '');
  const winnerName = String(state.winner || '');
  const spectators = (APP.room.participants || []).map(participant => participant?.name).filter(name => name && !players.includes(name));
  const phaseLabel = state.phase === 'setup' ? 'Setup Fleet' : state.phase === 'battle' ? 'Battle' : 'Finished';
  const myShipsPlaced = myBoard ? areBattleshipShipsPlaced(myBoard) : false;
  const myPlacedShipCount = myBoard ? myBoard.ships.filter(ship => ship.cells.length === ship.length).length : 0;
  const shipsRemainingToPlace = myBoard ? Math.max(0, myBoard.ships.length - myPlacedShipCount) : 0;
  const myRemainingShips = myBoard ? getBattleshipLivingShips(myBoard) : 0;
  const opponentRemainingShips = opponentBoard ? getBattleshipLivingShips(opponentBoard) : 0;
  const myHitCount = myBoard ? myBoard.shotsTaken.filter(shot => shot.result === 'hit').length : 0;
  const myMissCount = myBoard ? myBoard.shotsTaken.filter(shot => shot.result === 'miss').length : 0;
  const receivedHitCount = myBoard ? myBoard.shotsReceived.filter(shot => shot.result === 'hit').length : 0;
  const statusAccent = state.phase === 'finished'
    ? '#ffd166'
    : state.phase === 'battle'
      ? '#8af1ff'
      : '#7af59f';
  const nextPlacementShip = myBoard ? getNextBattleshipSelectableShip(myBoard, selectedShipId) : null;
  const nextUnplacedShip = myBoard ? getNextUnplacedBattleshipShip(myBoard, selectedShipId) : null;
  const canAdvancePlacementShip = state.phase === 'setup' && Boolean(nextPlacementShip?.id) && nextPlacementShip.id !== selectedShipId;
  const canSelectNextUnplacedShip = state.phase === 'setup' && Boolean(nextUnplacedShip?.id) && nextUnplacedShip.id !== selectedShipId;
  maybePlayBattleshipLastShotSound(state);
  const readyButtonLabel = myBoard?.ready
    ? 'Fleet Ready'
    : myShipsPlaced
      ? 'Ready Up Fleet'
      : `Deploy ${shipsRemainingToPlace} More`;
  const readyButtonAccent = myBoard?.ready
    ? 'linear-gradient(135deg,#22c55e,#15803d)'
    : myShipsPlaced
      ? 'linear-gradient(135deg,#8af1ff,#2563eb)'
      : 'linear-gradient(135deg,#334155,#1e293b)';
  const readyButtonCursor = (state.phase === 'setup' && myShipsPlaced && !myBoard?.ready) ? 'pointer' : 'default';
  const editFleetLabel = myBoard?.ready ? 'Unlock Fleet' : 'Editing Fleet';
  const editFleetAccent = myBoard?.ready
    ? 'linear-gradient(135deg,rgba(255,209,102,0.22),rgba(255,143,163,0.16))'
    : 'linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))';
  const mapReadyToggleMarkup = isBattlePlayer && state.phase === 'setup' ? `
    <button
      type="button"
      class="btn-secondary"
      data-action="battleship-ready"
      data-ready-state="${myBoard?.ready ? 'false' : 'true'}"
      aria-label="${myBoard?.ready ? 'Unlock fleet' : myShipsPlaced ? 'Ready fleet' : 'Finish placing ships before readying up'}"
      title="${myBoard?.ready ? 'Unlock Fleet' : myShipsPlaced ? 'Ready Up Fleet' : 'Place all ships before readying up'}"
      style="width:48px;height:48px;padding:0;border-radius:999px;display:grid;place-items:center;font-size:1.2rem;border:${myBoard?.ready ? '1px solid rgba(34,197,94,0.42)' : myShipsPlaced ? '1px solid rgba(138,241,255,0.32)' : '1px solid rgba(255,255,255,0.1)'};background:${myBoard?.ready ? 'linear-gradient(135deg,rgba(34,197,94,0.22),rgba(21,128,61,0.14))' : myShipsPlaced ? 'linear-gradient(135deg,rgba(138,241,255,0.18),rgba(37,99,235,0.14))' : 'linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))'};color:${myBoard?.ready ? '#7af59f' : myShipsPlaced ? '#8af1ff' : 'rgba(236,233,225,0.58)'};box-shadow:${myBoard?.ready ? '0 0 22px rgba(34,197,94,0.18)' : myShipsPlaced ? '0 0 18px rgba(138,241,255,0.14)' : 'none'};cursor:${myShipsPlaced || myBoard?.ready ? 'pointer' : 'not-allowed'};opacity:${myShipsPlaced || myBoard?.ready ? '1' : '0.7'};"
      ${(state.phase !== 'setup' || (!myShipsPlaced && !myBoard?.ready)) ? 'disabled' : ''}
    >${myBoard?.ready ? '✓' : '⚓'}</button>
  ` : '';

  const shipTray = myBoard ? `
    <div style="display:grid;gap:8px;">
      ${myBoard.ships.map(ship => {
        const placed = ship.cells.length === ship.length;
        const sunk = isBattleshipShipSunk(myBoard, ship);
        const isSelected = selectedShipId === ship.id;
        const hitCount = getBattleshipShipHits(myBoard, ship);
        const integrity = Math.max(0, ship.length - hitCount);
        const integrityLabel = sunk ? 'Sunk' : placed ? `${integrity}/${ship.length} hull` : 'Not deployed';
        return `
          <button
            type="button"
            class="btn-secondary"
            data-action="battleship-select-ship"
            data-ship-id="${escapeHtml(ship.id)}"
            draggable="${state.phase === 'setup' ? 'true' : 'false'}"
            data-battleship-ship-id="${escapeHtml(ship.id)}"
            style="margin:0;width:100%;padding:12px 14px;text-align:left;border:${isSelected ? `2px solid ${ship.accent}` : '1px solid rgba(255,255,255,0.08)'};background:${isSelected ? `linear-gradient(135deg, color-mix(in srgb, ${ship.accent} 18%, rgba(17,17,24,0.96) 82%), rgba(18,11,62,0.94))` : 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))'};box-shadow:${isSelected ? `0 0 20px color-mix(in srgb, ${ship.accent} 24%, transparent)` : 'none'};opacity:${sunk ? '0.7' : '1'};backdrop-filter:blur(8px);">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
              <div>
                <strong style="display:block;font-size:0.98rem;">${escapeHtml(ship.label)}</strong>
                <span style="display:block;margin-top:2px;font-size:0.76rem;letter-spacing:0.08em;text-transform:uppercase;color:${ship.accent};">${escapeHtml(ship.role || 'Fleet unit')}</span>
              </div>
              <span style="font-size:0.78rem;color:rgba(236,233,225,0.72);">${ship.length} cells</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;font-size:0.78rem;color:rgba(236,233,225,0.74);">
              <span>${escapeHtml(formatBattleshipShipPosition(ship))}</span>
              <span style="color:${sunk ? '#ff8fa3' : ship.accent};font-weight:800;">${escapeHtml(integrityLabel)}</span>
            </div>
            <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">
              ${Array.from({ length: ship.length }, (_, idx) => `
                <span style="width:calc((100% - ${(ship.length - 1) * 4}px)/${ship.length});min-width:18px;height:8px;border-radius:999px;background:${idx < integrity ? ship.accent : 'rgba(255,95,126,0.34)'};box-shadow:${idx < integrity ? `0 0 12px color-mix(in srgb, ${ship.accent} 45%, transparent)` : 'none'};"></span>
              `).join('')}
            </div>
          </button>
        `;
      }).join('')}
    </div>
  ` : '';

  const ownBoardMarkup = `
    <div class="game-mobile-scroll">
    <div class="battleship-board-shell battleship-grid" style="padding:16px;border-radius:24px;background:
      radial-gradient(circle at 50% 115%, rgba(255,78,182,0.18), transparent 32%),
      linear-gradient(180deg, rgba(16,10,58,0.98), rgba(8,10,30,0.98));
      border:1px solid rgba(141,232,255,0.22);
      box-shadow:0 22px 54px rgba(6,6,26,0.5), inset 0 0 0 1px rgba(255,255,255,0.05);
      position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;pointer-events:none;opacity:0.26;background:
        repeating-linear-gradient(to right, rgba(141,232,255,0.22) 0 1px, transparent 1px 10%),
        repeating-linear-gradient(to bottom, rgba(141,232,255,0.18) 0 1px, transparent 1px 10%);"></div>
    <div class="battleship-board-grid" style="display:grid;grid-template-columns:28px repeat(${BATTLESHIP_BOARD_SIZE}, minmax(0, 1fr));gap:4px;align-items:stretch;position:relative;z-index:1;">
      ${renderBattleshipGridLabelCell('')}
      ${BATTLESHIP_COLUMN_LABELS.map(label => renderBattleshipGridLabelCell(escapeHtml(label))).join('')}
      ${Array.from({ length: BATTLESHIP_BOARD_SIZE }, (_, row) => `
        ${renderBattleshipGridLabelCell(String(row + 1))}
        ${Array.from({ length: BATTLESHIP_BOARD_SIZE }, (_, col) => {
        const ownCell = myBoard ? getBattleshipOwnCellState(myBoard, row, col) : { ship: null, shot: null };
          const isLatestShotCell = Number(state.lastShot?.row) === row && Number(state.lastShot?.col) === col && state.lastShot?.defender === me && Date.now() - (Number(state.lastShot?.at) || 0) < 3000;
          const shipId = ownCell.ship?.id || '';
          const isPlacedShipCell = state.phase === 'setup' && Boolean(ownCell.ship);
          const isSelectedShipCell = Boolean(selectedShipId && ownCell.ship?.id === selectedShipId);
          const canPlace = state.phase === 'setup' && isBattlePlayer && !ownCell.ship && Boolean(selectedShipId);
          const cellAction = isPlacedShipCell ? 'battleship-select-ship' : (canPlace ? 'battleship-place-ship' : '');
          const background = ownCell.shot?.result === 'hit'
            ? 'linear-gradient(135deg,#ff8aa0,#b31244)'
            : ownCell.shot?.result === 'miss'
              ? 'linear-gradient(135deg,#9dd9ff,#2563eb)'
              : ownCell.ship
                ? `linear-gradient(135deg, color-mix(in srgb, ${ownCell.ship.accent || '#7af59f'} 36%, #14304d 64%), #0b203a)`
                : 'linear-gradient(135deg,#101739,#183b73)';
          const borderColor = isSelectedShipCell
            ? ownCell.ship?.accent || '#8af1ff'
            : 'rgba(255,255,255,0.1)';
          const boxShadow = ownCell.shot?.result === 'hit'
            ? '0 0 18px rgba(255,85,126,0.35)'
            : ownCell.shot?.result === 'miss'
              ? '0 0 16px rgba(97,190,255,0.2)'
              : isSelectedShipCell
                ? `0 0 0 2px color-mix(in srgb, ${ownCell.ship?.accent || '#8af1ff'} 32%, rgba(255,255,255,0.18)), 0 0 20px color-mix(in srgb, ${ownCell.ship?.accent || '#8af1ff'} 36%, transparent)`
                : ownCell.ship
                  ? '0 0 14px rgba(122,245,159,0.14)'
                  : 'none';
          const cellCursor = isPlacedShipCell
            ? 'grab'
            : canPlace
              ? 'pointer'
              : 'default';
          return `
            <button
              type="button"
              class="battleship-cell ${isLatestShotCell ? (ownCell.shot?.result === 'hit' ? 'battleship-hit-burst' : 'battleship-shot-splash') : ''}"
              data-action="${cellAction}"
              data-bs-row="${row}"
              data-bs-col="${col}"
              data-ship-id="${escapeHtml(shipId || selectedShipId)}"
              ${isPlacedShipCell ? `draggable="${state.phase === 'setup' ? 'true' : 'false'}" data-battleship-ship-id="${escapeHtml(shipId)}"` : ''}
              title="${isPlacedShipCell ? `${escapeHtml(ownCell.ship?.label || shipId)} • drag to move` : `${BATTLESHIP_COLUMN_LABELS[col]}${row + 1}`}"
              style="aspect-ratio:1/1;border:1px solid ${borderColor};border-radius:10px;background:${background};box-shadow:${boxShadow};color:#fff;display:grid;place-items:center;font-size:${isSelectedShipCell ? '0.88rem' : '0.8rem'};font-weight:800;cursor:${cellCursor};padding:0;text-shadow:0 0 14px rgba(255,255,255,0.22);transform:${isSelectedShipCell ? 'translateY(-1px)' : 'none'};">
              ${ownCell.shot?.result === 'hit' ? '✕' : ownCell.shot?.result === 'miss' ? '•' : ownCell.ship ? escapeHtml(shipId.slice(0, 1).toUpperCase()) : ''}
            </button>
          `;
        }).join('')}
      `).join('')}
    </div>
    </div>
    </div>
  `;

  const targetBoardMarkup = isBattlePlayer && opponentBoard ? `
    <div class="game-mobile-scroll">
    <div class="battleship-board-shell battleship-grid" style="padding:16px;border-radius:24px;background:
      radial-gradient(circle at 50% 115%, rgba(255,95,126,0.16), transparent 32%),
      linear-gradient(180deg, rgba(20,10,58,0.98), rgba(6,9,26,0.98));
      border:1px solid rgba(255,143,163,0.22);
      box-shadow:0 22px 54px rgba(6,6,26,0.5), inset 0 0 0 1px rgba(255,255,255,0.05);
      position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;pointer-events:none;opacity:0.22;background:
        repeating-linear-gradient(to right, rgba(255,143,163,0.22) 0 1px, transparent 1px 10%),
        repeating-linear-gradient(to bottom, rgba(255,143,163,0.18) 0 1px, transparent 1px 10%);"></div>
    <div class="battleship-board-grid" style="display:grid;grid-template-columns:28px repeat(${BATTLESHIP_BOARD_SIZE}, minmax(0, 1fr));gap:4px;align-items:stretch;position:relative;z-index:1;">
      ${renderBattleshipGridLabelCell('')}
      ${BATTLESHIP_COLUMN_LABELS.map(label => renderBattleshipGridLabelCell(escapeHtml(label))).join('')}
      ${Array.from({ length: BATTLESHIP_BOARD_SIZE }, (_, row) => `
        ${renderBattleshipGridLabelCell(String(row + 1))}
        ${Array.from({ length: BATTLESHIP_BOARD_SIZE }, (_, col) => {
          const shot = getBattleshipTargetCellState(myBoard, row, col);
          const isLatestShotCell = Number(state.lastShot?.row) === row && Number(state.lastShot?.col) === col && state.lastShot?.attacker === me && Date.now() - (Number(state.lastShot?.at) || 0) < 3000;
          const canAttack = state.phase === 'battle' && turnName === me && !winnerName && !shot;
          const background = shot?.result === 'hit'
            ? 'linear-gradient(135deg,#ff8aa0,#b31244)'
            : shot?.result === 'miss'
              ? 'linear-gradient(135deg,#9dd9ff,#2563eb)'
              : 'linear-gradient(135deg,#101739,#1c2f62)';
          return `
            <button
              type="button"
              class="battleship-cell ${isLatestShotCell ? (shot?.result === 'hit' ? 'battleship-hit-burst' : 'battleship-shot-splash') : ''}"
              data-action="${canAttack ? 'battleship-attack' : ''}"
              data-bs-row="${row}"
              data-bs-col="${col}"
              title="${BATTLESHIP_COLUMN_LABELS[col]}${row + 1}"
              style="aspect-ratio:1/1;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:${background};box-shadow:${shot?.result === 'hit' ? '0 0 18px rgba(255,85,126,0.35)' : shot?.result === 'miss' ? '0 0 16px rgba(97,190,255,0.2)' : canAttack ? '0 0 14px rgba(255,143,163,0.08)' : 'none'};color:#fff;display:grid;place-items:center;font-size:0.85rem;font-weight:800;cursor:${canAttack ? 'crosshair' : 'default'};padding:0;text-shadow:0 0 14px rgba(255,255,255,0.22);">
              ${shot?.result === 'hit' ? '✕' : shot?.result === 'miss' ? '•' : ''}
            </button>
          `;
        }).join('')}
      `).join('')}
    </div>
    </div>
    </div>
  ` : `
    <div style="background:linear-gradient(180deg,rgba(18,11,62,0.96),rgba(8,8,28,0.98));border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:20px;color:var(--text-dim);text-align:center;">
      ${players.length < 2 ? 'Battleship is waiting for a second player.' : isBattlePlayer ? 'Target grid will unlock after both captains are ready.' : 'Spectators watch from the side panel while the two captains battle.'}
    </div>
  `;

  const spectatorBoards = !isBattlePlayer && players.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
      ${players.map(playerName => {
        const board = normalizeBattleshipBoard(getBattleshipBoard(state, playerName));
        return `
          <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:20px;padding:14px;">
            <div style="font-weight:800;margin-bottom:10px;">${escapeHtml(playerName)} • ${getBattleshipLivingShips(board)} ships left</div>
            <div class="game-mobile-scroll">
            <div class="battleship-board-grid-spectator battleship-grid" style="display:grid;grid-template-columns:24px repeat(${BATTLESHIP_BOARD_SIZE}, minmax(0, 1fr));gap:3px;">
              ${renderBattleshipGridLabelCell('', 'font-size:0.7rem;')}
              ${BATTLESHIP_COLUMN_LABELS.map(label => renderBattleshipGridLabelCell(escapeHtml(label), 'font-size:0.7rem;')).join('')}
              ${Array.from({ length: BATTLESHIP_BOARD_SIZE }, (_, row) => `
                ${renderBattleshipGridLabelCell(String(row + 1), 'font-size:0.7rem;')}
                ${Array.from({ length: BATTLESHIP_BOARD_SIZE }, (_, col) => {
                  const shot = board.shotsReceived.find(entry => entry.row === row && entry.col === col) || null;
                  const background = shot?.result === 'hit'
                    ? 'linear-gradient(135deg,#ff8aa0,#b31244)'
                    : shot?.result === 'miss'
                      ? 'linear-gradient(135deg,#9dd9ff,#2563eb)'
                      : 'linear-gradient(135deg,#101739,#1c2f62)';
                  return `<div class="battleship-cell battleship-cell-spectator" style="aspect-ratio:1/1;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:${background};display:grid;place-items:center;color:#fff;font-size:0.72rem;font-weight:700;">${shot?.result === 'hit' ? '✕' : shot?.result === 'miss' ? '•' : ''}</div>`;
                }).join('')}
              `).join('')}
            </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">🚢 Battleship</h1>
      <p class="tagline">Room: ${safeRoomCode} • ${escapeHtml(phaseLabel)}</p>
    </div>

    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    <div class="game-mobile-shell game-mobile-main" style="max-width:1280px;margin:24px auto 0;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,0.95fr);gap:18px;align-items:start;">
      <div class="game-mobile-side" style="display:grid;gap:18px;">
        <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
            <div>
              <div style="font-family:'Fraunces',serif;font-size:1.4rem;">${isBattlePlayer ? 'Your Fleet' : 'Battle Overview'}</div>
              <div style="font-size:0.84rem;color:rgba(236,233,225,0.72);">${state.lastAction ? escapeHtml(state.lastAction) : state.phase === 'setup' ? 'Place ships, rotate, then lock your fleet.' : turnName ? `${escapeHtml(turnName)} is up.` : 'Match complete.'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${state.phase === 'setup' && isBattlePlayer ? `
                <button
                  type="button"
                  class="btn-secondary"
                  data-action="battleship-quick-random"
                  aria-label="Randomly place ships and ready fleet"
                  title="Randomly place ships and ready fleet"
                  style="width:48px;height:48px;padding:0;border-radius:999px;display:grid;place-items:center;font-size:1.15rem;border:1px solid rgba(255,209,102,0.32);background:linear-gradient(135deg,rgba(255,209,102,0.2),rgba(255,143,163,0.13));color:#ffd166;box-shadow:0 0 18px rgba(255,209,102,0.13);"
                >⚡</button>
              ` : ''}
              ${state.phase === 'setup' && isBattlePlayer ? `
                <div style="font-size:0.76rem;color:${myBoard?.ready ? '#7af59f' : myShipsPlaced ? '#8af1ff' : 'rgba(236,233,225,0.58)'};font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
                  ${myBoard?.ready ? 'Ready' : myShipsPlaced ? 'Ready Up' : `${shipsRemainingToPlace} Left`}
                </div>
              ` : ''}
              ${state.phase === 'setup' && isBattlePlayer ? `
                <button
                  type="button"
                  class="btn-secondary"
                  data-action="battleship-select-next-unplaced-ship"
                  aria-label="${escapeHtml(canSelectNextUnplacedShip ? `Add next vessel: ${nextUnplacedShip?.label || 'next ship'}` : 'All vessels already selected or placed')}"
                  title="${escapeHtml(canSelectNextUnplacedShip ? `Add next vessel: ${nextUnplacedShip?.label || 'next ship'}` : 'All vessels already selected or placed')}"
                  style="width:48px;height:48px;padding:0;border-radius:999px;display:grid;place-items:center;font-size:1.2rem;border:${canSelectNextUnplacedShip ? '1px solid rgba(138,241,255,0.36)' : '1px solid rgba(255,255,255,0.1)'};background:${canSelectNextUnplacedShip ? 'linear-gradient(135deg,rgba(138,241,255,0.18),rgba(37,99,235,0.14))' : 'linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))'};color:${canSelectNextUnplacedShip ? '#8af1ff' : 'rgba(236,233,225,0.58)'};box-shadow:${canSelectNextUnplacedShip ? '0 0 18px rgba(138,241,255,0.14)' : 'none'};cursor:${canSelectNextUnplacedShip ? 'pointer' : 'not-allowed'};opacity:${canSelectNextUnplacedShip ? '1' : '0.7'};"
                  ${canSelectNextUnplacedShip ? '' : 'disabled'}
                >➕</button>
              ` : ''}
              ${mapReadyToggleMarkup}
              ${state.phase === 'finished' && isHost ? '<button class="btn-primary" data-action="battleship-restart" style="width:auto;padding:10px 16px;">Restart Match</button>' : ''}
            </div>
          </div>
          ${isBattlePlayer ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
              <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(138,241,255,0.14), rgba(138,241,255,0.04));border:1px solid rgba(138,241,255,0.18);">
                <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Fleet remaining</div>
                <div style="font-size:1.25rem;font-weight:800;color:#8af1ff;">${myRemainingShips}</div>
              </div>
              <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(255,143,163,0.14), rgba(255,143,163,0.04));border:1px solid rgba(255,143,163,0.18);">
                <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Enemy hulls</div>
                <div style="font-size:1.25rem;font-weight:800;color:#ff8fa3;">${opponentRemainingShips}</div>
              </div>
              <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(122,245,159,0.14), rgba(122,245,159,0.04));border:1px solid rgba(122,245,159,0.18);">
                <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Hits landed</div>
                <div style="font-size:1.25rem;font-weight:800;color:#7af59f;">${myHitCount}</div>
              </div>
              <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(255,209,102,0.14), rgba(255,209,102,0.04));border:1px solid rgba(255,209,102,0.18);">
                <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Hull damage</div>
                <div style="font-size:1.25rem;font-weight:800;color:#ffd166;">${receivedHitCount}</div>
              </div>
            </div>
          ` : ''}
          ${isBattlePlayer ? ownBoardMarkup : spectatorBoards}
        </div>

        <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
            <div>
              <div style="font-family:'Fraunces',serif;font-size:1.4rem;">${isBattlePlayer && opponent ? `Target ${escapeHtml(opponent)}` : 'Observers'}</div>
              <div style="font-size:0.84rem;color:rgba(236,233,225,0.72);">
                ${isBattlePlayer ? (state.phase === 'battle' ? 'Click a square to fire. Hits are marked with ✕ and misses with •.' : 'Targeting unlocks after both fleets are ready.') : `${spectators.length} spectator${spectators.length === 1 ? '' : 's'} in room.`}
              </div>
            </div>
            ${isBattlePlayer ? `
              <div style="padding:10px 12px;border-radius:14px;background:linear-gradient(135deg, rgba(255,143,163,0.16), rgba(255,143,163,0.04));border:1px solid rgba(255,143,163,0.18);min-width:120px;text-align:center;">
                <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);">Salvo record</div>
                <div style="font-size:1.1rem;font-weight:800;color:#ff8fa3;">${myHitCount}-${myMissCount}</div>
              </div>
            ` : ''}
          </div>
          ${targetBoardMarkup}
        </div>
      </div>

      <div class="game-mobile-side" style="display:grid;gap:18px;">
        <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">Match Status</div>
          <div style="display:grid;gap:10px;">
            <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:12px;">
              <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:4px;">Captains</div>
              <div style="display:grid;gap:8px;">
                ${players.map(playerName => {
                  const board = normalizeBattleshipBoard(getBattleshipBoard(state, playerName));
                  return `
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                      <strong>${escapeHtml(playerName)}</strong>
                      <span style="font-size:0.8rem;color:${winnerName === playerName ? '#ffd166' : turnName === playerName ? '#8af1ff' : 'var(--text-dim)'};">
                        ${winnerName === playerName ? 'Winner' : state.phase === 'setup' ? (board.ready ? 'Ready' : areBattleshipShipsPlaced(board) ? 'Placed' : 'Placing') : turnName === playerName ? 'Turn' : `${getBattleshipLivingShips(board)} ships left`}
                      </span>
                    </div>
                  `;
                }).join('') || '<div style="color:var(--text-dim);">Need two players to start.</div>'}
              </div>
            </div>
            <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:12px;">
              <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:4px;">Phase</div>
              <div style="font-weight:800;color:${statusAccent};text-shadow:0 0 16px color-mix(in srgb, ${statusAccent} 40%, transparent);">${escapeHtml(phaseLabel)}</div>
              <div style="font-size:0.82rem;color:var(--text-dim);margin-top:6px;">
                ${state.phase === 'setup' ? `${setupReadyCount}/${players.length} captains ready` : winnerName ? `${escapeHtml(winnerName)} sank the last ship.` : turnName ? `Waiting for ${escapeHtml(turnName)} to fire.` : 'Preparing match.'}
              </div>
            </div>
            <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:12px;">
              <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:4px;">Spectators</div>
              <div style="font-weight:800;color:#c4a1ff;">${spectators.length}</div>
              <div style="font-size:0.82rem;color:var(--text-dim);margin-top:6px;">${spectators.length ? escapeHtml(spectators.join(', ')) : 'No spectators yet.'}</div>
            </div>
          </div>
        </div>

        ${isBattlePlayer ? `
          <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
            <div style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">Fleet Controls</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
              <button class="btn-secondary" data-action="battleship-toggle-axis" style="width:auto;padding:10px 14px;">Rotate: ${placementAxis === 'horizontal' ? 'Horizontal' : 'Vertical'}</button>
              <button class="btn-secondary" data-action="battleship-select-next-ship" style="width:auto;padding:10px 14px;display:inline-flex;align-items:center;gap:8px;" ${(state.phase !== 'setup' || !canAdvancePlacementShip) ? 'disabled' : ''}>
                <span aria-hidden="true">⏭</span>
                <span>Next Vessel</span>
              </button>
              <button class="btn-secondary" data-action="battleship-randomize" style="width:auto;padding:10px 14px;" ${state.phase !== 'setup' ? 'disabled' : ''}>Randomize</button>
              <button class="btn-secondary" data-action="battleship-quick-random" style="width:auto;padding:10px 14px;" ${state.phase !== 'setup' ? 'disabled' : ''}>Random + Ready</button>
              <button class="btn-secondary" data-action="battleship-clear" style="width:auto;padding:10px 14px;" ${state.phase !== 'setup' ? 'disabled' : ''}>Clear</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px;">
              <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(138,241,255,0.12), rgba(37,99,235,0.08));border:1px solid rgba(138,241,255,0.18);">
                <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Deployment</div>
                <div style="font-size:1.15rem;font-weight:800;color:#8af1ff;">${myPlacedShipCount}/${myBoard.ships.length}</div>
                <div style="font-size:0.8rem;color:var(--text-dim);margin-top:4px;">${myShipsPlaced ? 'All ships positioned' : `${shipsRemainingToPlace} ship${shipsRemainingToPlace === 1 ? '' : 's'} left`}</div>
              </div>
              <div style="padding:12px 14px;border-radius:16px;background:${myBoard.ready ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(21,128,61,0.1))' : 'linear-gradient(135deg, rgba(255,209,102,0.12), rgba(255,143,163,0.08))'};border:1px solid ${myBoard.ready ? 'rgba(34,197,94,0.24)' : 'rgba(255,209,102,0.18)'};">
                <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Fleet status</div>
                <div style="font-size:1.15rem;font-weight:800;color:${myBoard.ready ? '#7af59f' : '#ffd166'};">${myBoard.ready ? 'Locked In' : 'Editing'}</div>
                <div style="font-size:0.8rem;color:var(--text-dim);margin-top:4px;">${myBoard.ready ? 'Ready for battle start' : selectedShip ? `${escapeHtml(selectedShip.label)} selected` : 'Place or move ships'}</div>
              </div>
            </div>
            ${selectedShip ? `
              <div style="margin-bottom:12px;padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, color-mix(in srgb, ${selectedShip.accent || '#8af1ff'} 14%, rgba(255,255,255,0.04) 86%), rgba(255,255,255,0.03));border:1px solid color-mix(in srgb, ${selectedShip.accent || '#8af1ff'} 36%, rgba(255,255,255,0.08));">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
                  <div>
                    <div style="font-size:0.76rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.6);margin-bottom:4px;">Selected ship</div>
                    <div style="font-weight:800;color:${selectedShip.accent || '#8af1ff'};">${escapeHtml(selectedShip.label)}</div>
                  </div>
                  ${canAdvancePlacementShip ? `
                    <button
                      type="button"
                      class="btn-secondary"
                      data-action="battleship-select-next-ship"
                      title="Select next vessel"
                      aria-label="Select next vessel"
                      style="width:42px;height:42px;padding:0;border-radius:999px;display:grid;place-items:center;font-size:1rem;flex:0 0 auto;"
                    >⏭</button>
                  ` : ''}
                </div>
                <div style="font-size:0.82rem;color:var(--text-dim);margin-top:4px;">${selectedShip.cells.length === selectedShip.length ? 'Highlighted on your board. Drag any glowing segment, or tap a new empty cell to move it.' : 'Tap a board cell to deploy it, or drag from the tray on desktop.'}</div>
                ${canAdvancePlacementShip ? `<div style="font-size:0.78rem;color:rgba(236,233,225,0.62);margin-top:8px;">Next vessel: ${escapeHtml(nextPlacementShip?.label || '')}</div>` : ''}
                ${canSelectNextUnplacedShip ? `<div style="font-size:0.78rem;color:rgba(138,241,255,0.78);margin-top:6px;">Map add mode available: use ➕ in the fleet header to arm ${escapeHtml(nextUnplacedShip?.label || 'the next vessel')}.</div>` : ''}
              </div>
            ` : ''}
            ${shipTray}
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              <button class="btn-primary" data-action="battleship-ready" data-ready-state="true" style="width:auto;padding:10px 16px;background:${readyButtonAccent};border:none;cursor:${readyButtonCursor};opacity:${(state.phase !== 'setup' || (!myShipsPlaced && !myBoard.ready)) ? '0.72' : '1'};" ${(state.phase !== 'setup' || !myShipsPlaced || myBoard.ready) ? 'disabled' : ''}>${readyButtonLabel}</button>
              <button class="btn-secondary" data-action="battleship-ready" data-ready-state="false" style="width:auto;padding:10px 16px;background:${editFleetAccent};border:${myBoard.ready ? '1px solid rgba(255,209,102,0.28)' : '1px solid rgba(255,255,255,0.08)'};color:${myBoard.ready ? '#ffd166' : 'var(--text)'};box-shadow:${myBoard.ready ? '0 0 18px rgba(255,209,102,0.12)' : 'none'};" ${(state.phase !== 'setup' || !myBoard.ready) ? 'disabled' : ''}>${editFleetLabel}</button>
            </div>
            <div style="font-size:0.82rem;color:var(--text-dim);margin-top:10px;">
              ${myBoard.ready
                ? 'Your fleet is locked. Choose Unlock Fleet if you want to move ships again before the match starts.'
                : 'Drag ships from the tray or from the board itself on desktop. On touch devices, tap a ship to highlight it, rotate if needed, then tap a new empty square to reposition it.'}
            </div>
          </div>
        ` : `
          <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
            <div style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">Spectator View</div>
            <div style="font-size:0.86rem;color:var(--text-dim);line-height:1.5;">
              Battleship currently assigns the first two people in the room as captains. Everyone else watches the public hit and miss markers until the match ends.
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}
