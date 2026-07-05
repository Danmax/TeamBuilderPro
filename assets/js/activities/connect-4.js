function cloneConnect4StaticData(key, fallback) {
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

const CONNECT4_ROWS = Number(cloneConnect4StaticData('CONNECT4_ROWS', 6)) || 6;
const CONNECT4_COLS = Number(cloneConnect4StaticData('CONNECT4_COLS', 7)) || 7;
const CONNECT4_COLORS = cloneConnect4StaticData('CONNECT4_COLORS', ['red', 'yellow']);
const CONNECT4_COLOR_META = cloneConnect4StaticData('CONNECT4_COLOR_META', {});
const CONNECT4_SOUND_SOURCES = {
  move: '/Sounds/move.wav'
};
const connect4SoundPlayers = {};

function playConnect4Sound(key = 'move') {
  if (typeof Audio === 'undefined') return;
  const source = CONNECT4_SOUND_SOURCES[key] || CONNECT4_SOUND_SOURCES.move;
  try {
    if (!connect4SoundPlayers[key]) {
      connect4SoundPlayers[key] = new Audio(source);
      connect4SoundPlayers[key].preload = 'auto';
    }
    const audio = connect4SoundPlayers[key];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_error) {
    // Browser audio can be blocked until a user gesture.
  }
}

function maybePlayConnect4LastMoveSound(state) {
  const move = state?.lastMove;
  const moveAt = Number(move?.at) || 0;
  if (!moveAt || Date.now() - moveAt > 3000) return;
  const soundKey = `connect4:${move.row}:${move.col}:${move.color}:${moveAt}`;
  if (APP.connect4LastSoundKey === soundKey) return;
  APP.connect4LastSoundKey = soundKey;
  playConnect4Sound('move');
}

function createConnect4Seat(participant = null, fallbackColor = 'red') {
  return {
    playerId: String(participant?.id || '').trim(),
    playerName: String(participant?.name || '').trim() || (fallbackColor === 'red' ? 'Red Player' : 'Yellow Player'),
    avatar: String(participant?.avatar || '').trim() || '👤'
  };
}

function createConnect4Board() {
  return Array.from({ length: CONNECT4_ROWS }, () => Array(CONNECT4_COLS).fill(''));
}

function createConnect4State(participants) {
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
  const redSeat = createConnect4Seat(players[0], 'red');
  const yellowSeat = createConnect4Seat(players[1], 'yellow');
  return {
    phase: players.length === 2 ? 'playing' : 'waiting',
    players: {
      red: redSeat,
      yellow: yellowSeat
    },
    board: createConnect4Board(),
    turn: 'red',
    winner: '',
    winningCells: [],
    lastMove: null,
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function getConnect4Seat(state, color) {
  return state?.players?.[color] || createConnect4Seat(null, color);
}

function getConnect4PlayerColor(state, player = APP.player) {
  const playerId = String(player?.id || '').trim();
  const playerName = String(player?.name || '').trim();
  if (!state?.players || (!playerId && !playerName)) return '';
  return CONNECT4_COLORS.find(color => {
    const seat = state.players[color] || {};
    return (playerId && seat.playerId === playerId) || (playerName && seat.playerName === playerName);
  }) || '';
}

function getConnect4Cell(board, row, col) {
  return String(board?.[row]?.[col] || '').trim().toLowerCase();
}

function getConnect4DropRow(board, col) {
  if (!Number.isInteger(col) || col < 0 || col >= CONNECT4_COLS) return -1;
  for (let row = CONNECT4_ROWS - 1; row >= 0; row--) {
    if (!getConnect4Cell(board, row, col)) return row;
  }
  return -1;
}

function getConnect4Winner(board) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  for (let row = 0; row < CONNECT4_ROWS; row++) {
    for (let col = 0; col < CONNECT4_COLS; col++) {
      const color = getConnect4Cell(board, row, col);
      if (!color) continue;
      for (const [deltaRow, deltaCol] of directions) {
        const cells = [{ row, col }];
        let matched = true;
        for (let step = 1; step < 4; step++) {
          const nextRow = row + (deltaRow * step);
          const nextCol = col + (deltaCol * step);
          if (nextRow < 0 || nextRow >= CONNECT4_ROWS || nextCol < 0 || nextCol >= CONNECT4_COLS || getConnect4Cell(board, nextRow, nextCol) !== color) {
            matched = false;
            break;
          }
          cells.push({ row: nextRow, col: nextCol });
        }
        if (matched) {
          return { color, cells };
        }
      }
    }
  }
  return null;
}

function isConnect4BoardFull(board) {
  return Array.isArray(board) && board.every(row => Array.isArray(row) && row.every(cell => Boolean(String(cell || '').trim())));
}

async function dropConnect4Disc(col) {
  if (!APP.roomCode || !Number.isInteger(col)) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'connect-4') return;
  const state = room.activityState && typeof room.activityState === 'object'
    ? room.activityState
    : createConnect4State(room.participants || []);
  if (state.phase !== 'playing' || state.winner) return;
  const myColor = getConnect4PlayerColor(state);
  if (!myColor || state.turn !== myColor) return;
  const board = Array.isArray(state.board) ? state.board.map(row => Array.isArray(row) ? [...row] : Array(CONNECT4_COLS).fill('')) : createConnect4Board();
  const row = getConnect4DropRow(board, col);
  if (row < 0) return;
  board[row][col] = myColor;
  state.board = board;
  state.lastMove = { row, col, color: myColor, at: Date.now() };
  state.updatedAt = Date.now();
  const winner = getConnect4Winner(board);
  if (winner) {
    state.winner = winner.color;
    state.winningCells = winner.cells;
    state.phase = 'finished';
    state.lastAction = `${getConnect4Seat(state, myColor).playerName} connected four and won the round.`;
  } else if (isConnect4BoardFull(board)) {
    state.winner = 'draw';
    state.winningCells = [];
    state.phase = 'finished';
    state.lastAction = 'The board filled up. Match drawn.';
  } else {
    state.turn = myColor === 'red' ? 'yellow' : 'red';
    state.lastAction = `${getConnect4Seat(state, myColor).playerName} dropped into column ${col + 1}. ${getConnect4Seat(state, state.turn).playerName} is up.`;
  }
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

async function restartConnect4Match() {
  if (!APP.roomCode || !APP.room || APP.room.host !== APP.player?.name) return;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'connect-4') return;
  room.activityState = createConnect4State(room.participants || []);
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
}

function renderConnect4() {
  const isHost = APP.room.host === APP.player.name;
  const state = APP.room.activityState && typeof APP.room.activityState === 'object'
    ? APP.room.activityState
    : createConnect4State(APP.room.participants || []);
  const safeRoomCode = escapeHtml(APP.roomCode);
  const redSeat = getConnect4Seat(state, 'red');
  const yellowSeat = getConnect4Seat(state, 'yellow');
  const board = Array.isArray(state.board) ? state.board : createConnect4Board();
  const myColor = getConnect4PlayerColor(state);
  const activeColor = CONNECT4_COLORS.includes(state.turn) ? state.turn : 'red';
  const activeSeat = getConnect4Seat(state, activeColor);
  const winnerColor = state.winner === 'red' || state.winner === 'yellow' ? state.winner : '';
  const isDraw = state.winner === 'draw';
  const winningKeySet = new Set((Array.isArray(state.winningCells) ? state.winningCells : []).map(cell => `${cell.row}:${cell.col}`));
  const canDrop = state.phase === 'playing' && !winnerColor && !isDraw && myColor === activeColor;
  maybePlayConnect4LastMoveSound(state);

  if (!redSeat.playerId || !yellowSeat.playerId) {
    return `
      <div class="header">
        <h1 style="font-size:2rem;font-weight:700;">🟡 Connect 4</h1>
        <p class="tagline">Room: ${safeRoomCode}</p>
      </div>
      ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}
      <div style="max-width:780px;margin:28px auto 0;background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:28px;text-align:center;">
        <div style="font-family:'Fraunces',serif;font-size:1.5rem;margin-bottom:8px;">Connect 4 needs two players.</div>
        <div style="color:var(--text-dim);">Invite one more player, then restart the activity.</div>
      </div>
    `;
  }

  const columnButtons = Array.from({ length: CONNECT4_COLS }, (_, col) => {
    const dropRow = getConnect4DropRow(board, col);
    const enabled = canDrop && dropRow >= 0;
    return `
      <button
        class="connect4-column-btn"
        type="button"
        data-action="${enabled ? 'connect4-drop' : ''}"
        data-index="${col}"
        ${enabled ? '' : 'disabled'}
        style="
          border:none;border-radius:16px;padding:10px 0;
          background:${enabled ? 'linear-gradient(135deg, rgba(145,196,255,0.22), rgba(255,107,135,0.18))' : 'rgba(255,255,255,0.04)'};
          color:${enabled ? '#fdf4ff' : 'rgba(236,233,225,0.42)'};
          font-weight:900;font-size:0.86rem;letter-spacing:0.12em;text-transform:uppercase;
          cursor:${enabled ? 'pointer' : 'default'};
          box-shadow:${enabled ? '0 0 20px rgba(145,196,255,0.16)' : 'none'};
        "
        title="Drop in column ${col + 1}"
      >
        ↓
      </button>
    `;
  }).join('');

  const boardMarkup = Array.from({ length: CONNECT4_ROWS }, (_, row) => `
    ${Array.from({ length: CONNECT4_COLS }, (_, col) => {
      const color = getConnect4Cell(board, row, col);
      const colorMeta = color ? CONNECT4_COLOR_META[color] : null;
      const isWinningCell = winningKeySet.has(`${row}:${col}`);
      const isLastMoveCell = Number(state.lastMove?.row) === row && Number(state.lastMove?.col) === col && Date.now() - (Number(state.lastMove?.at) || 0) < 3000;
      return `
        <div class="connect4-cell" style="
          aspect-ratio:1/1;
          border-radius:22px;
          background:linear-gradient(180deg, rgba(33,15,92,0.92), rgba(14,8,43,0.98));
          border:1px solid rgba(255,255,255,0.08);
          display:grid;place-items:center;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,0.04), ${isWinningCell ? '0 0 22px rgba(255,255,255,0.14)' : 'none'};
        ">
          <div class="connect4-disc ${isLastMoveCell ? 'game-move-pop' : ''}" style="
            width:78%;height:78%;border-radius:50%;
            background:${colorMeta
              ? `radial-gradient(circle at 34% 32%, rgba(255,255,255,0.94), ${colorMeta.accent} 42%, color-mix(in srgb, ${colorMeta.accent} 76%, #171717 24%) 100%)`
              : 'radial-gradient(circle at 34% 32%, rgba(10,12,28,0.92), rgba(4,6,18,0.98) 100%)'};
            border:2px solid ${colorMeta ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.06)'};
            box-shadow:${colorMeta ? `0 0 18px ${colorMeta.glow}, inset 0 -8px 12px rgba(0,0,0,0.18)` : 'inset 0 6px 12px rgba(255,255,255,0.02)'};
            transform:${isWinningCell ? 'scale(1.06)' : 'scale(1)'};
          "></div>
        </div>
      `;
    }).join('')}
  `).join('');

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:700;">🟡 Connect 4</h1>
      <p class="tagline">Room: ${safeRoomCode} • ${winnerColor ? `${escapeHtml(getConnect4Seat(state, winnerColor).playerName)} connected four` : isDraw ? 'Match drawn' : `${escapeHtml(activeSeat.playerName)} to drop`}</p>
    </div>

    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    ${(winnerColor || isDraw) ? `
      <div style="max-width:1180px;margin:18px auto 0;padding:18px 20px;border-radius:24px;background:linear-gradient(135deg, rgba(44,18,112,0.86), rgba(140,33,91,0.74));border:2px solid rgba(152,229,255,0.68);box-shadow:0 0 28px rgba(112,209,255,0.16);text-align:center;">
        <div style="font-size:1.45rem;font-weight:800;margin-bottom:6px;">${winnerColor ? `🏆 ${escapeHtml(getConnect4Seat(state, winnerColor).playerName)} wins` : '🤝 Board full - draw'}</div>
        <div style="color:rgba(236,233,225,0.8);">${escapeHtml(state.lastAction || '')}</div>
      </div>
    ` : ''}

    <div class="game-mobile-shell game-mobile-main" style="max-width:1280px;margin:24px auto 0;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(300px,0.85fr);gap:18px;align-items:start;">
      <div class="game-mobile-side" style="background:
        radial-gradient(circle at 50% 76%, rgba(255,82,138,0.18), transparent 28%),
        linear-gradient(180deg, rgba(23,10,74,0.98) 0%, rgba(13,9,45,0.98) 52%, rgba(8,7,26,0.99) 100%);
        border:1px solid rgba(174,118,255,0.42);
        box-shadow:0 24px 56px rgba(6,6,26,0.52), inset 0 0 0 1px rgba(255,255,255,0.05), 0 0 28px rgba(114,80,255,0.14);
        border-radius:30px;padding:18px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <div style="font-family:'Fraunces',serif;font-size:1.45rem;">Neon Grid</div>
            <div style="font-size:0.84rem;color:rgba(236,233,225,0.72);">${escapeHtml(state.lastAction || 'Drop a disc and race to four in a row.')}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${CONNECT4_COLORS.map(color => {
              const seat = getConnect4Seat(state, color);
              const colorMeta = CONNECT4_COLOR_META[color];
              const isTurn = activeColor === color && !winnerColor && !isDraw;
              return `
                <div style="padding:10px 12px;border-radius:16px;background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid ${isTurn ? colorMeta.accent : 'rgba(255,255,255,0.08)'};min-width:150px;">
                  <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:${colorMeta.accent};margin-bottom:4px;">${escapeHtml(colorMeta.label)}</div>
                  <div style="font-weight:800;">${escapeHtml(seat.playerName)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="game-mobile-scroll">
          <div class="connect4-grid">
            <div class="connect4-column-grid" style="display:grid;grid-template-columns:repeat(${CONNECT4_COLS}, minmax(0,1fr));gap:8px;margin-bottom:10px;">
              ${columnButtons}
            </div>

            <div class="connect4-board-shell" style="padding:16px;border-radius:28px;background:linear-gradient(180deg, rgba(24,53,143,0.94), rgba(14,30,103,0.98));border:1px solid rgba(145,196,255,0.22);box-shadow:0 20px 48px rgba(6,6,26,0.45), inset 0 0 0 1px rgba(255,255,255,0.04);">
              <div class="connect4-board-grid" style="display:grid;grid-template-columns:repeat(${CONNECT4_COLS}, minmax(0,1fr));gap:10px;">
                ${boardMarkup}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="game-mobile-side" style="display:grid;gap:18px;">
        <div style="background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);border-radius:24px;padding:18px;box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.3rem;margin-bottom:12px;">Match Status</div>
          <div style="display:grid;gap:10px;">
            ${CONNECT4_COLORS.map(color => {
              const seat = getConnect4Seat(state, color);
              const colorMeta = CONNECT4_COLOR_META[color];
              const isTurn = activeColor === color && !winnerColor && !isDraw;
              const isWinner = winnerColor === color;
              return `
                <div style="background:linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:12px;">
                  <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
                    <div>
                      <div style="font-weight:800;color:${colorMeta.accent};">${escapeHtml(seat.avatar || '👤')} ${escapeHtml(seat.playerName)}</div>
                      <div style="font-size:0.8rem;color:var(--text-dim);">${escapeHtml(colorMeta.label)} discs</div>
                    </div>
                    <div style="font-size:0.82rem;color:${isWinner ? '#ffd166' : isTurn ? colorMeta.accent : 'var(--text-dim)'};font-weight:800;">
                      ${isWinner ? 'Winner' : isTurn ? 'Turn' : 'Waiting'}
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
            ${isHost ? '<button class="btn-secondary" data-action="connect4-restart" style="width:auto;padding:10px 16px;">Restart Match</button>' : ''}
          </div>
          <div style="display:grid;gap:10px;">
            <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(145,196,255,0.12), rgba(145,196,255,0.04));border:1px solid rgba(145,196,255,0.14);">
              <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Turn flow</div>
              <div style="font-size:0.92rem;color:rgba(236,233,225,0.82);">
                ${winnerColor
                  ? `${escapeHtml(getConnect4Seat(state, winnerColor).playerName)} finished with a four-in-a-row.`
                  : isDraw
                    ? 'No more moves remain. This round ended in a draw.'
                    : canDrop
                      ? `Choose a glowing arrow and drop into an open column as ${escapeHtml(CONNECT4_COLOR_META[myColor].label)}.`
                      : `${escapeHtml(activeSeat.playerName)} is currently dropping as ${escapeHtml(CONNECT4_COLOR_META[activeColor].label)}.`}
              </div>
            </div>
            <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(255,224,102,0.12), rgba(255,224,102,0.04));border:1px solid rgba(255,224,102,0.14);">
              <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Board tip</div>
              <div style="font-size:0.92rem;color:rgba(236,233,225,0.82);">
                Horizontal, vertical, and diagonal lines all count. Filled columns lock automatically.
              </div>
            </div>
            ${state.lastMove ? `
              <div style="padding:12px 14px;border-radius:16px;background:linear-gradient(135deg, rgba(255,107,135,0.12), rgba(255,224,102,0.04));border:1px solid rgba(255,107,135,0.14);">
                <div style="font-size:0.74rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(236,233,225,0.58);margin-bottom:4px;">Last drop</div>
                <div style="font-size:0.92rem;color:rgba(236,233,225,0.82);">
                  Row ${Number(state.lastMove.row) + 1}, column ${Number(state.lastMove.col) + 1} by ${escapeHtml(getConnect4Seat(state, state.lastMove.color).playerName)}.
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}
