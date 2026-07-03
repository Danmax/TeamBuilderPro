function getDefaultBackgammonUiState() {
  return {
    selectedSource: null
  };
}

function cloneBackgammonStaticData(key, fallback) {
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

const BACKGAMMON_COLORS = cloneBackgammonStaticData('BACKGAMMON_COLORS', ['white', 'black']);
const BACKGAMMON_COLOR_META = cloneBackgammonStaticData('BACKGAMMON_COLOR_META', {});
const BACKGAMMON_INITIAL_POINTS = cloneBackgammonStaticData('BACKGAMMON_INITIAL_POINTS', []);
const BACKGAMMON_TOP_POINTS = cloneBackgammonStaticData('BACKGAMMON_TOP_POINTS', []);
const BACKGAMMON_BOTTOM_POINTS = cloneBackgammonStaticData('BACKGAMMON_BOTTOM_POINTS', []);

function createBackgammonSeat(participant = null, fallbackColor = 'white') {
  return {
    playerId: String(participant?.id || '').trim(),
    playerName: String(participant?.name || '').trim() || (fallbackColor === 'white' ? 'White' : 'Black'),
    avatar: String(participant?.avatar || '').trim() || '👤'
  };
}

function createBackgammonState(participants) {
  const players = Array.from(new Set((participants || [])
    .filter(participant => participant?.id || participant?.name)
    .map(participant => JSON.stringify({
      id: String(participant.id || '').trim(),
      name: String(participant.name || '').trim(),
      avatar: String(participant.avatar || '').trim()
    }))))
    .map(value => safeParseJson(value))
    .filter(Boolean)
    .slice(0, 2);
  const whiteSeat = createBackgammonSeat(players[0], 'white');
  const blackSeat = createBackgammonSeat(players[1], 'black');
  return {
    phase: players.length === 2 ? 'playing' : 'waiting',
    players: {
      white: whiteSeat,
      black: blackSeat
    },
    points: [...BACKGAMMON_INITIAL_POINTS],
    bar: { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 },
    turn: 'white',
    dice: [],
    remainingMoves: [],
    winner: '',
    lastAction: players.length === 2
      ? `${whiteSeat.playerName} opens the match. Roll the dice to begin.`
      : 'Waiting for two players.',
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function cloneBackgammonPosition(state) {
  return {
    points: Array.isArray(state?.points) ? state.points.map(value => Number(value) || 0) : [...BACKGAMMON_INITIAL_POINTS],
    bar: {
      white: Math.max(0, Number(state?.bar?.white) || 0),
      black: Math.max(0, Number(state?.bar?.black) || 0)
    },
    borneOff: {
      white: Math.max(0, Number(state?.borneOff?.white) || 0),
      black: Math.max(0, Number(state?.borneOff?.black) || 0)
    }
  };
}

function getBackgammonPlayerColor(state, player = APP.player) {
  const playerId = String(player?.id || '').trim();
  const playerName = String(player?.name || '').trim();
  if (!state?.players || (!playerId && !playerName)) return '';
  return BACKGAMMON_COLORS.find(color => {
    const seat = state.players[color] || {};
    return (playerId && seat.playerId === playerId) || (playerName && seat.playerName === playerName);
  }) || '';
}

function getBackgammonSeat(state, color) {
  return state?.players?.[color] || createBackgammonSeat(null, color);
}

function getBackgammonColorSign(color) {
  return color === 'black' ? -1 : 1;
}

function getBackgammonOpponentColor(color) {
  return color === 'white' ? 'black' : 'white';
}

function getBackgammonPointOwner(points, index) {
  const value = Number(points?.[index]) || 0;
  if (value > 0) return 'white';
  if (value < 0) return 'black';
  return '';
}

function getBackgammonPointCount(points, index) {
  return Math.abs(Number(points?.[index]) || 0);
}

function getBackgammonHomeRange(color) {
  return color === 'white' ? [0, 5] : [18, 23];
}

function isBackgammonHomeReady(position, color) {
  if ((position?.bar?.[color] || 0) > 0) return false;
  const [homeStart, homeEnd] = getBackgammonHomeRange(color);
  return (position?.points || []).every((value, index) => {
    if (getBackgammonPointOwner(position.points, index) !== color) return true;
    return index >= homeStart && index <= homeEnd;
  });
}

function getBackgammonEntryPoint(color, die) {
  return color === 'white' ? 24 - die : die - 1;
}

function canBackgammonOccupyPoint(points, index, color) {
  const owner = getBackgammonPointOwner(points, index);
  const count = getBackgammonPointCount(points, index);
  return !owner || owner === color || count === 1;
}

function getBackgammonMoveTarget(from, die, color) {
  if (from === 'bar') return getBackgammonEntryPoint(color, die);
  return color === 'white' ? from - die : from + die;
}

function canBackgammonBearOff(position, color, from, die) {
  if (!isBackgammonHomeReady(position, color)) return false;
  const target = getBackgammonMoveTarget(from, die, color);
  if (color === 'white') {
    if (target === -1) return true;
    if (target < -1) {
      for (let idx = from + 1; idx <= 5; idx++) {
        if (getBackgammonPointOwner(position.points, idx) === color) return false;
      }
      return true;
    }
    return false;
  }
  if (target === 24) return true;
  if (target > 24) {
    for (let idx = 18; idx < from; idx++) {
      if (getBackgammonPointOwner(position.points, idx) === color) return false;
    }
    return true;
  }
  return false;
}

function getBackgammonLegalMovesForDie(position, color, die) {
  const safeDie = Number(die) || 0;
  if (!safeDie || !BACKGAMMON_COLORS.includes(color)) return [];
  const moves = [];
  const barCount = Math.max(0, Number(position?.bar?.[color]) || 0);
  if (barCount > 0) {
    const entryPoint = getBackgammonEntryPoint(color, safeDie);
    if (entryPoint >= 0 && entryPoint < 24 && canBackgammonOccupyPoint(position.points, entryPoint, color)) {
      const owner = getBackgammonPointOwner(position.points, entryPoint);
      moves.push({
        from: 'bar',
        to: entryPoint,
        die: safeDie,
        hit: owner && owner !== color && getBackgammonPointCount(position.points, entryPoint) === 1
      });
    }
    return moves;
  }

  for (let index = 0; index < 24; index++) {
    if (getBackgammonPointOwner(position.points, index) !== color) continue;
    const target = getBackgammonMoveTarget(index, safeDie, color);
    if (target >= 0 && target < 24) {
      if (!canBackgammonOccupyPoint(position.points, target, color)) continue;
      const owner = getBackgammonPointOwner(position.points, target);
      moves.push({
        from: index,
        to: target,
        die: safeDie,
        hit: owner && owner !== color && getBackgammonPointCount(position.points, target) === 1
      });
      continue;
    }
    if (canBackgammonBearOff(position, color, index, safeDie)) {
      moves.push({
        from: index,
        to: 'off',
        die: safeDie,
        hit: false
      });
    }
  }
  return moves;
}

function applyBackgammonMoveToPosition(position, move, color) {
  const next = cloneBackgammonPosition(position);
  const sign = getBackgammonColorSign(color);
  const opponent = getBackgammonOpponentColor(color);
  if (move.from === 'bar') {
    next.bar[color] = Math.max(0, next.bar[color] - 1);
  } else if (Number.isInteger(move.from)) {
    next.points[move.from] = (Number(next.points[move.from]) || 0) - sign;
  }
  if (move.to === 'off') {
    next.borneOff[color] += 1;
    return next;
  }
  const targetOwner = getBackgammonPointOwner(next.points, move.to);
  const targetCount = getBackgammonPointCount(next.points, move.to);
  if (targetOwner === opponent && targetCount === 1) {
    next.points[move.to] = 0;
    next.bar[opponent] += 1;
  }
  next.points[move.to] = (Number(next.points[move.to]) || 0) + sign;
  return next;
}

function getBackgammonMoveSequences(position, color, remainingMoves) {
  if (!Array.isArray(remainingMoves) || !remainingMoves.length) return [[]];
  let usedAny = false;
  const sequences = [];
  const seenDice = new Set();
  remainingMoves.forEach((die, index) => {
    const dieValue = Number(die) || 0;
    if (!dieValue || seenDice.has(dieValue)) return;
    seenDice.add(dieValue);
    const legalMoves = getBackgammonLegalMovesForDie(position, color, dieValue);
    if (!legalMoves.length) return;
    usedAny = true;
    legalMoves.forEach(move => {
      const nextPosition = applyBackgammonMoveToPosition(position, move, color);
      const nextMoves = remainingMoves.filter((_, moveIndex) => moveIndex !== index);
      getBackgammonMoveSequences(nextPosition, color, nextMoves).forEach(trail => {
        sequences.push([move, ...trail]);
      });
    });
  });
  if (!usedAny) return [[]];
  return sequences;
}

function getBackgammonOptimalMoveSequences(position, color, remainingMoves) {
  const sequences = getBackgammonMoveSequences(position, color, remainingMoves);
  const maxLength = sequences.reduce((best, sequence) => Math.max(best, sequence.length), 0);
  let filtered = sequences.filter(sequence => sequence.length === maxLength);
  if (maxLength === 1 && Array.isArray(remainingMoves) && remainingMoves.length === 2 && remainingMoves[0] !== remainingMoves[1]) {
    const highestDie = filtered.reduce((best, sequence) => Math.max(best, Number(sequence[0]?.die) || 0), 0);
    filtered = filtered.filter(sequence => (Number(sequence[0]?.die) || 0) === highestDie);
  }
  return filtered;
}

function getBackgammonLegalFirstMoves(state, color) {
  const remainingMoves = Array.isArray(state?.remainingMoves) ? state.remainingMoves.map(value => Number(value) || 0).filter(Boolean) : [];
  if (!remainingMoves.length) return [];
  const sequences = getBackgammonOptimalMoveSequences(cloneBackgammonPosition(state), color, remainingMoves);
  const seen = new Set();
  return sequences
    .map(sequence => sequence[0])
    .filter(Boolean)
    .filter(move => {
      const key = `${move.from}:${move.to}:${move.die}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getBackgammonLegalMovesFromSource(state, color, source) {
  return getBackgammonLegalFirstMoves(state, color).filter(move => move.from === source);
}

function getBackgammonPipCount(position, color) {
  const sign = getBackgammonColorSign(color);
  let total = 0;
  (position?.points || []).forEach((value, index) => {
    if ((Number(value) || 0) * sign <= 0) return;
    const count = Math.abs(Number(value) || 0);
    total += count * (color === 'white' ? index + 1 : 24 - index);
  });
  total += (Math.max(0, Number(position?.bar?.[color]) || 0) * 25);
  return total;
}

function formatBackgammonMovePoint(point) {
  if (point === 'bar') return 'BAR';
  if (point === 'off') return 'OFF';
  const index = Number(point);
  return Number.isInteger(index) && index >= 0 && index < 24 ? String(index + 1) : '';
}

function setBackgammonSelectedSource(source = null) {
  APP.backgammonUi.selectedSource = source === 'bar'
    ? 'bar'
    : Number.isInteger(source)
      ? source
      : null;
  render();
}

function getBackgammonCurrentTurnColor(state) {
  const turn = String(state?.turn || '').trim().toLowerCase();
  return BACKGAMMON_COLORS.includes(turn) ? turn : 'white';
}

function advanceBackgammonTurn(state, actionLabel = '') {
  state.turn = getBackgammonOpponentColor(getBackgammonCurrentTurnColor(state));
  state.dice = [];
  state.remainingMoves = [];
  state.updatedAt = Date.now();
  if (actionLabel) state.lastAction = actionLabel;
}

async function rollBackgammonDice() {
  if (!APP.roomCode || !APP.room) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'backgammon') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBackgammonState(room.participants || []);
  if (state.phase !== 'playing' || state.winner) return;
  const playerColor = getBackgammonPlayerColor(state);
  if (!playerColor || getBackgammonCurrentTurnColor(state) !== playerColor) return;
  if (Array.isArray(state.remainingMoves) && state.remainingMoves.length) return;
  const dieA = 1 + Math.floor(Math.random() * 6);
  const dieB = 1 + Math.floor(Math.random() * 6);
  state.dice = [dieA, dieB];
  state.remainingMoves = dieA === dieB ? [dieA, dieA, dieA, dieA] : [dieA, dieB];
  const seat = getBackgammonSeat(state, playerColor);
  const legalMoves = getBackgammonLegalFirstMoves(state, playerColor);
  if (!legalMoves.length) {
    const nextColor = getBackgammonOpponentColor(playerColor);
    advanceBackgammonTurn(state, `${seat.playerName} rolled ${dieA} and ${dieB} but had no legal moves. ${getBackgammonSeat(state, nextColor).playerName} is up.`);
  } else {
    state.updatedAt = Date.now();
    state.lastAction = `${seat.playerName} rolled ${dieA} and ${dieB}.`;
  }
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  APP.backgammonUi = getDefaultBackgammonUiState();
  render();
}

async function backgammonHandlePointAction(pointValue) {
  if (!APP.roomCode || !APP.room) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'backgammon') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBackgammonState(room.participants || []);
  if (state.phase !== 'playing' || state.winner) return;
  const playerColor = getBackgammonPlayerColor(state);
  if (!playerColor || getBackgammonCurrentTurnColor(state) !== playerColor) return;
  const legalMoves = getBackgammonLegalFirstMoves(state, playerColor);
  if (!legalMoves.length) return;
  const selectedSource = APP.backgammonUi.selectedSource;
  const exactMove = legalMoves.find(move => move.from === selectedSource && move.to === pointValue)
    || legalMoves.find(move => move.from === pointValue);
  if (exactMove && exactMove.from === selectedSource && exactMove.to === pointValue) {
    const nextPosition = applyBackgammonMoveToPosition(state, exactMove, playerColor);
    state.points = nextPosition.points;
    state.bar = nextPosition.bar;
    state.borneOff = nextPosition.borneOff;
    const remainingMoves = Array.isArray(state.remainingMoves) ? [...state.remainingMoves] : [];
    const dieIndex = remainingMoves.findIndex(value => Number(value) === Number(exactMove.die));
    if (dieIndex >= 0) remainingMoves.splice(dieIndex, 1);
    state.remainingMoves = remainingMoves;
    state.updatedAt = Date.now();
    const seat = getBackgammonSeat(state, playerColor);
    state.lastAction = `${seat.playerName} moved ${formatBackgammonMovePoint(exactMove.from)} to ${formatBackgammonMovePoint(exactMove.to)} using ${exactMove.die}.`;
    if ((state.borneOff?.[playerColor] || 0) >= 15) {
      state.winner = playerColor;
      state.phase = 'finished';
      state.remainingMoves = [];
      state.dice = [];
      state.lastAction = `${seat.playerName} bore off the final checker and won the match.`;
    } else {
      const nextLegal = getBackgammonLegalFirstMoves(state, playerColor);
      if (!state.remainingMoves.length || !nextLegal.length) {
        const nextColor = getBackgammonOpponentColor(playerColor);
        advanceBackgammonTurn(state, nextLegal.length
          ? state.lastAction
          : `${seat.playerName} has no remaining legal moves. ${getBackgammonSeat(state, nextColor).playerName} is up.`);
      }
    }
    room.activityState = state;
    await RoomManager.updateRoom(APP.roomCode, room);
    APP.room = room;
    APP.backgammonUi = getDefaultBackgammonUiState();
    render();
    return;
  }
  const sourceMoves = legalMoves.filter(move => move.from === pointValue);
  if (sourceMoves.length) {
    setBackgammonSelectedSource(selectedSource === pointValue ? null : pointValue);
  }
}

async function backgammonHandleBarAction() {
  if (!APP.roomCode || !APP.room) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'backgammon') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createBackgammonState(room.participants || []);
  const playerColor = getBackgammonPlayerColor(state);
  if (!playerColor || getBackgammonCurrentTurnColor(state) !== playerColor) return;
  const legalMoves = getBackgammonLegalFirstMoves(state, playerColor).filter(move => move.from === 'bar');
  if (!legalMoves.length) return;
  setBackgammonSelectedSource(APP.backgammonUi.selectedSource === 'bar' ? null : 'bar');
}

async function restartBackgammonMatch() {
  if (!APP.roomCode || !APP.room || APP.room.host !== APP.player?.name) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'backgammon') return;
  room.activityState = createBackgammonState(room.participants || []);
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  APP.backgammonUi = getDefaultBackgammonUiState();
  render();
}

function renderBackgammon() {
  const isHost = APP.room.host === APP.player.name;
  const state = APP.room.activityState && typeof APP.room.activityState === 'object'
    ? APP.room.activityState
    : createBackgammonState(APP.room.participants || []);
  const safeRoomCode = escapeHtml(APP.roomCode);
  const myColor = getBackgammonPlayerColor(state);
  const activeColor = getBackgammonCurrentTurnColor(state);
  const activeSeat = getBackgammonSeat(state, activeColor);
  const whiteSeat = getBackgammonSeat(state, 'white');
  const blackSeat = getBackgammonSeat(state, 'black');
  const points = Array.isArray(state.points) ? state.points : [...BACKGAMMON_INITIAL_POINTS];
  const bar = state.bar || { white: 0, black: 0 };
  const borneOff = state.borneOff || { white: 0, black: 0 };
  const winnerColor = BACKGAMMON_COLORS.includes(state.winner) ? state.winner : '';
  const winnerSeat = winnerColor ? getBackgammonSeat(state, winnerColor) : null;
  const currentMoves = Array.isArray(state.remainingMoves) ? state.remainingMoves : [];
  const selectedSource = APP.backgammonUi?.selectedSource ?? null;
  const canInteract = state.phase === 'playing' && !winnerColor && myColor === activeColor;
  const legalFirstMoves = canInteract ? getBackgammonLegalFirstMoves(state, myColor) : [];
  const legalSourceKeys = new Set(legalFirstMoves.map(move => String(move.from)));
  const legalMovesFromSelected = selectedSource !== null
    ? legalFirstMoves.filter(move => move.from === selectedSource)
    : [];
  const legalTargetKeys = new Set(legalMovesFromSelected.map(move => String(move.to)));
  const canRoll = canInteract && currentMoves.length === 0;
  const canBearOff = legalTargetKeys.has('off');
  const topPipCount = getBackgammonPipCount(state, 'black');
  const bottomPipCount = getBackgammonPipCount(state, 'white');

  if (!whiteSeat.playerId || !blackSeat.playerId) {
    return `
      <div class="header">
        <h1 style="font-size:2rem;font-weight:700;">🎲 Backgammon</h1>
        <p class="tagline">Room: ${safeRoomCode}</p>
      </div>
      ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}
      <div style="max-width:780px;margin:28px auto 0;background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:28px;text-align:center;">
        <div style="font-family:'Fraunces',serif;font-size:1.5rem;margin-bottom:8px;">Backgammon needs two players.</div>
        <div style="color:var(--text-dim);">Invite one more player, then restart the activity.</div>
      </div>
    `;
  }

  const renderChecker = (color, index, totalCount, orientation = 'top') => {
    const colorMeta = BACKGAMMON_COLOR_META[color];
    return `
      <div class="backgammon-checker" style="
        width:32px;height:32px;border-radius:50%;
        background:radial-gradient(circle at 34% 32%, rgba(255,255,255,0.92), ${colorMeta.accent} 42%, color-mix(in srgb, ${colorMeta.accent} 76%, #111 24%) 100%);
        border:2px solid rgba(255,255,255,0.78);
        box-shadow:0 0 14px ${colorMeta.glow}, inset 0 -5px 10px rgba(0,0,0,0.18);
        color:${colorMeta.pipColor};
        font-size:0.68rem;font-weight:800;
        display:grid;place-items:center;
        margin-${orientation === 'top' ? 'top' : 'bottom'}:${index === 0 ? '0' : '-10px'};
      ">${index === Math.min(totalCount, 5) - 1 && totalCount > 5 ? escapeHtml(String(totalCount)) : ''}</div>
    `;
  };

  const renderPoint = (pointIndex, orientation = 'top', slotIndex = 0) => {
    const owner = getBackgammonPointOwner(points, pointIndex);
    const count = getBackgammonPointCount(points, pointIndex);
    const colorMeta = owner ? BACKGAMMON_COLOR_META[owner] : null;
    const isSelected = selectedSource === pointIndex;
    const isSource = legalSourceKeys.has(String(pointIndex));
    const isTarget = legalTargetKeys.has(String(pointIndex));
    const buttonAction = canInteract && (isSource || isTarget) ? 'backgammon-point' : '';
    const triangleColor = slotIndex % 2 === 0 ? 'rgba(255,205,144,0.76)' : 'rgba(140,80,41,0.74)';
    const triangleAccent = orientation === 'top'
      ? 'polygon(50% 100%, 8% 0, 92% 0)'
      : 'polygon(8% 100%, 92% 100%, 50% 0)';
    return `
      <button
        class="backgammon-point"
        type="button"
        data-action="${buttonAction}"
        data-index="${pointIndex}"
        ${buttonAction ? '' : 'disabled'}
        style="
          position:relative;min-height:205px;border:none;background:transparent;padding:0;cursor:${buttonAction ? 'pointer' : 'default'};
          display:flex;align-items:${orientation === 'top' ? 'flex-start' : 'flex-end'};justify-content:center;
          outline:${isSelected ? '2px solid #8af1ff' : isTarget ? '2px solid #ff8fa3' : 'none'};
          outline-offset:4px;border-radius:12px;
          filter:${isTarget ? 'drop-shadow(0 0 12px rgba(255,143,163,0.32))' : isSource ? 'drop-shadow(0 0 10px rgba(138,241,255,0.24))' : 'none'};
        "
        title="Point ${pointIndex + 1}"
      >
        <div style="position:absolute;inset:0;display:flex;align-items:${orientation === 'top' ? 'flex-start' : 'flex-end'};justify-content:center;padding:${orientation === 'top' ? '0 4px 14px' : '14px 4px 0'};">
          <div class="backgammon-point-triangle" style="width:100%;height:100%;max-width:64px;clip-path:${triangleAccent};background:${triangleColor};box-shadow:0 0 12px rgba(255,210,154,0.12), inset 0 0 0 1px rgba(255,255,255,0.12);"></div>
        </div>
        <div class="backgammon-point-label" style="position:absolute;${orientation === 'top' ? 'top' : 'bottom'}:10px;left:50%;transform:translateX(-50%);font-size:0.72rem;font-weight:800;color:${isSource || isTarget ? '#ffffff' : 'rgba(255,232,196,0.68)'};text-shadow:0 0 8px rgba(0,0,0,0.4);">
          ${pointIndex + 1}
        </div>
        <div class="backgammon-point-stack" style="position:relative;z-index:1;display:flex;flex-direction:${orientation === 'top' ? 'column' : 'column-reverse'};align-items:center;justify-content:${orientation === 'top' ? 'flex-start' : 'flex-end'};min-height:180px;padding:${orientation === 'top' ? '12px 0 26px' : '26px 0 12px'};">
          ${count ? Array.from({ length: Math.min(count, 5) }, (_, checkerIndex) => renderChecker(owner, checkerIndex, count, orientation)).join('') : ''}
        </div>
        ${count ? `<div style="position:absolute;${orientation === 'top' ? 'bottom' : 'top'}:36px;right:6px;padding:2px 6px;border-radius:999px;background:${colorMeta?.glow || 'rgba(255,255,255,0.08)'};font-size:0.68rem;font-weight:800;color:${colorMeta?.accent || '#fff'};">${count}</div>` : ''}
      </button>
    `;
  };

  const renderHalf = (pointIndexes, orientation) => `
    <div class="backgammon-half-grid" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;">
      ${pointIndexes.map((pointIndex, slotIndex) => renderPoint(pointIndex, orientation, slotIndex)).join('')}
    </div>
  `;

  const renderDie = (value, active = true, key = '') => `
    <div class="backgammon-die" style="
      width:54px;height:54px;border-radius:14px;background:linear-gradient(145deg,#fffdf8,#f0e7d3);
      border:2px solid rgba(90,50,22,0.22);box-shadow:${active ? '0 0 18px rgba(255,209,102,0.26)' : 'none'},0 10px 20px rgba(0,0,0,0.2);
      display:grid;place-items:center;font-size:1.4rem;font-weight:900;color:#5f331f;
      opacity:${active ? '1' : '0.55'};
    " title="${escapeHtml(String(key || value))}">${value}</div>
  `;

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">🎲 Backgammon</h1>
      <p class="tagline">Room: ${safeRoomCode} • ${winnerColor ? `${escapeHtml(winnerSeat?.playerName || 'Winner')} took the match` : `${escapeHtml(activeSeat.playerName)} to move`}</p>
    </div>

    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    ${winnerColor ? `
      <div style="max-width:1200px;margin:18px auto 0;padding:18px 20px;border-radius:24px;background:linear-gradient(135deg, rgba(44,18,112,0.86), rgba(140,33,91,0.74));border:2px solid rgba(152,229,255,0.68);box-shadow:0 0 28px rgba(112,209,255,0.16);text-align:center;">
        <div style="font-size:1.45rem;font-weight:800;margin-bottom:6px;">🏆 ${escapeHtml(winnerSeat?.playerName || 'Winner')} wins</div>
        <div style="color:rgba(236,233,225,0.8);">${escapeHtml(state.lastAction || '')}</div>
      </div>
    ` : ''}

    <div class="game-mobile-shell game-mobile-main" style="max-width:1320px;margin:24px auto 0;display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,0.85fr);gap:18px;align-items:start;">
      <div class="game-mobile-side" style="background:
        radial-gradient(circle at 50% 74%, rgba(255,82,138,0.18), transparent 24%),
        linear-gradient(180deg, rgba(48,23,10,0.96), rgba(28,14,8,0.98));
        border:1px solid rgba(255,216,169,0.18);border-radius:30px;padding:18px 18px 20px;box-shadow:0 26px 58px rgba(6,6,26,0.5), inset 0 0 0 1px rgba(255,255,255,0.04);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <div style="font-family:'Fraunces',serif;font-size:1.45rem;">Neon Board</div>
            <div style="font-size:0.84rem;color:rgba(255,232,196,0.7);">${escapeHtml(state.lastAction || 'Roll and race your checkers home.')}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${state.dice?.length ? state.dice.map((value, idx) => renderDie(value, currentMoves.includes(value) || currentMoves.filter(move => move === value).length > state.dice.slice(0, idx).filter(move => move === value).length, `die-${idx + 1}`)).join('') : '<div style="color:rgba(255,232,196,0.62);font-size:0.88rem;">Dice waiting</div>'}
          </div>
        </div>

        <div class="game-mobile-scroll">
          <div class="backgammon-grid">
            <div class="backgammon-board-shell" style="padding:0;">
              <div class="backgammon-board-layout" style="display:grid;grid-template-columns:minmax(0,1fr) 88px minmax(0,1fr);gap:12px;align-items:stretch;">
                <div style="display:grid;gap:10px;">
                  ${renderHalf(BACKGAMMON_TOP_POINTS.slice(0, 6), 'top')}
                  ${renderHalf(BACKGAMMON_BOTTOM_POINTS.slice(0, 6), 'bottom')}
                </div>

                <div style="display:grid;grid-template-rows:1fr auto 1fr;gap:12px;align-items:center;">
                  <div class="backgammon-bar-card" style="background:linear-gradient(180deg, rgba(24,12,54,0.94), rgba(14,8,30,0.98));border:1px solid rgba(255,143,163,0.14);border-radius:18px;padding:12px;display:grid;place-items:center;min-height:140px;">
                    <div style="text-align:center;">
                      <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,232,196,0.6);margin-bottom:8px;">Black Bar</div>
                      <div style="font-size:2rem;font-weight:900;color:#ff8fa3;">${bar.black || 0}</div>
                    </div>
                  </div>
                  <button class="backgammon-bar-btn" type="button" data-action="${canInteract && (bar[myColor] || 0) > 0 ? 'backgammon-bar' : ''}" ${canInteract && (bar[myColor] || 0) > 0 ? '' : 'disabled'} style="background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));border:${selectedSource === 'bar' ? '2px solid #8af1ff' : '1px solid rgba(255,255,255,0.08)'};border-radius:18px;padding:12px;min-height:88px;color:${selectedSource === 'bar' ? '#8af1ff' : 'rgba(255,232,196,0.8)'};font-weight:800;letter-spacing:0.08em;text-transform:uppercase;cursor:${canInteract && (bar[myColor] || 0) > 0 ? 'pointer' : 'default'};">
                    Enter<br>Bar
                  </button>
                  <div class="backgammon-bar-card" style="background:linear-gradient(180deg, rgba(24,12,54,0.94), rgba(14,8,30,0.98));border:1px solid rgba(138,241,255,0.14);border-radius:18px;padding:12px;display:grid;place-items:center;min-height:140px;">
                    <div style="text-align:center;">
                      <div style="font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,232,196,0.6);margin-bottom:8px;">White Bar</div>
                      <div style="font-size:2rem;font-weight:900;color:#8af1ff;">${bar.white || 0}</div>
                    </div>
                  </div>
                </div>

                <div style="display:grid;gap:10px;">
                  ${renderHalf(BACKGAMMON_TOP_POINTS.slice(7), 'top')}
                  ${renderHalf(BACKGAMMON_BOTTOM_POINTS.slice(7), 'bottom')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="game-mobile-side" style="display:grid;gap:18px;">
        <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">Match Status</div>
          <div style="display:grid;gap:10px;">
            ${BACKGAMMON_COLORS.map(color => {
              const seat = getBackgammonSeat(state, color);
              const colorMeta = BACKGAMMON_COLOR_META[color];
              const isTurn = activeColor === color && !winnerColor;
              const isWinner = winnerColor === color;
              return `
                <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:12px;">
                  <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
                    <div>
                      <div style="font-weight:800;color:${colorMeta.accent};">${escapeHtml(colorMeta.icon)} ${escapeHtml(seat.playerName)}</div>
                      <div style="font-size:0.8rem;color:var(--text-dim);">${escapeHtml(seat.avatar || '👤')} • ${escapeHtml(colorMeta.label)}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:0.82rem;color:${isWinner ? '#ffd166' : isTurn ? '#8af1ff' : 'var(--text-dim)'};font-weight:800;">${isWinner ? 'Winner' : isTurn ? 'Turn' : 'Waiting'}</div>
                      <div style="font-size:0.8rem;color:var(--text-dim);">${borneOff[color] || 0} off • ${bar[color] || 0} bar</div>
                    </div>
                  </div>
                  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;">
                    <div style="padding:8px 10px;border-radius:12px;background:rgba(255,255,255,0.04);">
                      <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">Pip count</div>
                      <div style="font-weight:800;color:${colorMeta.accent};">${color === 'white' ? bottomPipCount : topPipCount}</div>
                    </div>
                    <div style="padding:8px 10px;border-radius:12px;background:rgba(255,255,255,0.04);">
                      <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;">Checkers home</div>
                      <div style="font-weight:800;color:${colorMeta.accent};">${borneOff[color] || 0}/15</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">Controls</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button class="btn-primary" data-action="backgammon-roll" style="width:auto;padding:10px 16px;" ${canRoll ? '' : 'disabled'}>Roll Dice</button>
            <button class="btn-secondary" data-action="backgammon-bear-off" style="width:auto;padding:10px 16px;" ${canBearOff ? '' : 'disabled'}>Bear Off</button>
            ${isHost ? '<button class="btn-secondary" data-action="backgammon-restart" style="width:auto;padding:10px 16px;">Restart Match</button>' : ''}
          </div>
          <div style="display:grid;gap:10px;">
            <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(138,241,255,0.12), rgba(138,241,255,0.04));border:1px solid rgba(138,241,255,0.14);">
              <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Turn flow</div>
              <div style="font-size:0.92rem;color:rgba(236,233,225,0.82);">
                ${winnerColor
                  ? `${escapeHtml(winnerSeat?.playerName || 'Winner')} has finished bearing off all checkers.`
                  : canRoll
                    ? `${escapeHtml(activeSeat.playerName)} should roll to start this turn.`
                    : currentMoves.length
                      ? `${escapeHtml(activeSeat.playerName)} has ${currentMoves.length} move${currentMoves.length === 1 ? '' : 's'} left: ${currentMoves.join(', ')}`
                      : `${escapeHtml(activeSeat.playerName)} is preparing the next roll.`}
              </div>
            </div>
            <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(255,143,163,0.12), rgba(255,143,163,0.04));border:1px solid rgba(255,143,163,0.14);">
              <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Selection</div>
              <div style="font-size:0.92rem;color:rgba(236,233,225,0.82);">
                ${selectedSource === 'bar'
                  ? 'Bar selected. Choose a highlighted entry point.'
                  : Number.isInteger(selectedSource)
                    ? `Point ${selectedSource + 1} selected. Choose a highlighted destination.`
                    : legalFirstMoves.length
                      ? 'Choose one of the glowing source points to move.'
                      : 'No legal move selected.'}
              </div>
            </div>
            <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(255,209,102,0.12), rgba(255,209,102,0.04));border:1px solid rgba(255,209,102,0.14);">
              <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Move help</div>
              <div style="font-size:0.92rem;color:rgba(236,233,225,0.82);">
                Hit single blots, re-enter from the bar first, and bear off only when every checker is home.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
