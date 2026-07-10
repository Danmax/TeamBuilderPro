const RPS_CHOICES = [
  { id: 'rock', label: 'Rock', icon: '✊', beats: 'scissors', accent: '#8af1ff' },
  { id: 'paper', label: 'Paper', icon: '✋', beats: 'rock', accent: '#ffd166' },
  { id: 'scissors', label: 'Scissors', icon: '✌️', beats: 'paper', accent: '#ff8fa3' }
];
const RPS_CHANT = ['Rock', 'Paper', 'Scissors', 'Shoot'];
const RPS_CHOICE_MAP = Object.fromEntries(RPS_CHOICES.map(choice => [choice.id, choice]));

function createRockPaperScissorsState() {
  return {
    mode: 'multiplayer',
    phase: 'ready',
    chantIndex: 0,
    round: 0,
    choices: {},
    results: {},
    scores: {},
    roundSummary: '',
    lastAction: 'Press start and wait for Shoot.',
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function normalizeRockPaperScissorsState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  return {
    ...createRockPaperScissorsState(),
    ...state,
    mode: state.mode === 'bot' ? 'bot' : 'multiplayer',
    phase: ['ready', 'chant', 'choosing', 'revealed'].includes(state.phase) ? state.phase : 'ready',
    chantIndex: Math.max(0, Math.min(3, Number(state.chantIndex) || 0)),
    round: Number(state.round) || 0,
    choices: state.choices && typeof state.choices === 'object' ? state.choices : {},
    results: state.results && typeof state.results === 'object' ? state.results : {},
    scores: state.scores && typeof state.scores === 'object' ? state.scores : {}
  };
}

function getRockPaperScissorsPlayerKey(player = APP.player) {
  return String(player?.id || player?.name || '').trim();
}

function getRockPaperScissorsPlayerName(player = APP.player) {
  return String(player?.name || '').trim() || 'Player';
}

function getRockPaperScissorsParticipants(room = APP.room) {
  return (Array.isArray(room?.participants) ? room.participants : [])
    .filter(player => getRockPaperScissorsPlayerKey(player));
}

function getRockPaperScissorsChoiceResult(playerChoice, opponentChoice) {
  if (playerChoice === opponentChoice) return 'tie';
  return RPS_CHOICE_MAP[playerChoice]?.beats === opponentChoice ? 'win' : 'loss';
}

function getRockPaperScissorsComputerChoice() {
  return RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)]?.id || 'rock';
}

function getRockPaperScissorsState(room = APP.room) {
  return normalizeRockPaperScissorsState(room?.activityState);
}

function getRockPaperScissorsScore(state, playerKey) {
  const score = state?.scores?.[playerKey] || {};
  return {
    wins: Number(score.wins) || 0,
    losses: Number(score.losses) || 0,
    ties: Number(score.ties) || 0
  };
}

function updateRockPaperScissorsScore(state, playerKey, outcome) {
  const score = getRockPaperScissorsScore(state, playerKey);
  if (outcome === 'win') score.wins += 1;
  else if (outcome === 'loss') score.losses += 1;
  else score.ties += 1;
  state.scores[playerKey] = score;
}

function getRockPaperScissorsPendingPlayers(state, room = APP.room) {
  const choices = state?.choices && typeof state.choices === 'object' ? state.choices : {};
  return getRockPaperScissorsParticipants(room).filter(player => !choices[getRockPaperScissorsPlayerKey(player)]);
}

function revealRockPaperScissorsMultiplayerRound(state, room = APP.room) {
  const participants = getRockPaperScissorsParticipants(room);
  const played = participants
    .map(player => {
      const playerKey = getRockPaperScissorsPlayerKey(player);
      const choice = state.choices?.[playerKey];
      return RPS_CHOICE_MAP[choice] ? { player, playerKey, choice } : null;
    })
    .filter(Boolean);

  if (!played.length) return;

  const uniqueChoices = Array.from(new Set(played.map(entry => entry.choice)));
  let winningChoice = '';
  let losingChoice = '';
  if (uniqueChoices.length === 2) {
    const [first, second] = uniqueChoices;
    if (RPS_CHOICE_MAP[first]?.beats === second) {
      winningChoice = first;
      losingChoice = second;
    } else {
      winningChoice = second;
      losingChoice = first;
    }
  }

  state.results = {};
  played.forEach(entry => {
    const outcome = uniqueChoices.length !== 2
      ? 'tie'
      : entry.choice === winningChoice
        ? 'win'
        : entry.choice === losingChoice
          ? 'loss'
          : 'tie';
    updateRockPaperScissorsScore(state, entry.playerKey, outcome);
    state.results[entry.playerKey] = {
      playerName: getRockPaperScissorsPlayerName(entry.player),
      playerChoice: entry.choice,
      outcome,
      at: Date.now()
    };
  });

  const winners = played
    .filter(entry => state.results[entry.playerKey]?.outcome === 'win')
    .map(entry => getRockPaperScissorsPlayerName(entry.player));
  state.phase = 'revealed';
  state.roundSummary = winners.length
    ? `${winners.join(', ')} won the throw.`
    : 'No winner this throw.';
  state.lastAction = state.roundSummary;
}

async function updateRockPaperScissorsState(mutator) {
  if (!APP.roomCode) return null;
  const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
  if (!room || room.currentActivity !== 'rock-paper-scissors') return null;
  const state = getRockPaperScissorsState(room);
  await mutator(state, room);
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
  APP.room = room;
  render();
  return state;
}

async function setRockPaperScissorsChantStep(round, chantIndex, phase = 'chant') {
  await updateRockPaperScissorsState(state => {
    if (state.round !== round || state.phase === 'ready' || state.phase === 'revealed') return;
    state.phase = phase;
    state.chantIndex = chantIndex;
    state.lastAction = phase === 'choosing' ? 'Shoot. Pick fast.' : `${RPS_CHANT[chantIndex]}...`;
  });
}

function scheduleRockPaperScissorsChant(round) {
  [0, 1, 2, 3].forEach((step, idx) => {
    window.setTimeout(() => {
      setRockPaperScissorsChantStep(round, step, step === 3 ? 'choosing' : 'chant');
    }, idx * 650);
  });
}

async function startRockPaperScissorsRound() {
  const nextState = await updateRockPaperScissorsState(state => {
    state.phase = 'chant';
    state.chantIndex = 0;
    state.round = (Number(state.round) || 0) + 1;
    state.choices = {};
    state.results = {};
    state.roundSummary = '';
    state.lastAction = 'Rock...';
  });
  if (nextState) scheduleRockPaperScissorsChant(nextState.round);
}

async function setRockPaperScissorsMode(mode) {
  const nextMode = mode === 'bot' ? 'bot' : 'multiplayer';
  await updateRockPaperScissorsState(state => {
    state.mode = nextMode;
    state.phase = 'ready';
    state.chantIndex = 0;
    state.choices = {};
    state.results = {};
    state.roundSummary = '';
    state.lastAction = nextMode === 'bot'
      ? 'Bot mode selected. Each player throws against the bot.'
      : 'Multiplayer selected. Everyone throws at the same time.';
  });
}

async function revealRockPaperScissorsRound() {
  await updateRockPaperScissorsState((state, room) => {
    if (state.mode !== 'multiplayer' || state.phase !== 'choosing') return;
    revealRockPaperScissorsMultiplayerRound(state, room);
  });
}

async function chooseRockPaperScissors(choiceId) {
  if (!RPS_CHOICE_MAP[choiceId]) return;
  const playerKey = getRockPaperScissorsPlayerKey();
  const playerName = getRockPaperScissorsPlayerName();
  if (!playerKey) return;

  await updateRockPaperScissorsState((state, room) => {
    if (state.phase !== 'choosing') {
      state.lastAction = 'Wait for Shoot before picking.';
      return;
    }
    if (state.choices?.[playerKey]) return;

    state.choices[playerKey] = choiceId;

    if (state.mode === 'bot') {
      const computerChoice = getRockPaperScissorsComputerChoice();
      const outcome = getRockPaperScissorsChoiceResult(choiceId, computerChoice);
      updateRockPaperScissorsScore(state, playerKey, outcome);
      state.results[playerKey] = {
        playerName,
        playerChoice: choiceId,
        computerChoice,
        outcome,
        at: Date.now()
      };
      state.lastAction = `${playerName} picked ${RPS_CHOICE_MAP[choiceId].label}.`;
      return;
    }

    state.results[playerKey] = {
      playerName,
      playerChoice: choiceId,
      outcome: 'pending',
      at: Date.now()
    };

    const pending = getRockPaperScissorsPendingPlayers(state, room);
    if (pending.length === 0) {
      revealRockPaperScissorsMultiplayerRound(state, room);
    } else {
      state.lastAction = `${playerName} locked a throw. Waiting on ${pending.length} player${pending.length === 1 ? '' : 's'}.`;
    }
  });
}

function getRockPaperScissorsOutcomeLabel(outcome) {
  if (outcome === 'win') return 'Win';
  if (outcome === 'loss') return 'Loss';
  if (outcome === 'tie') return 'Tie';
  return 'Locked';
}

function getRockPaperScissorsOutcomeColor(outcome) {
  if (outcome === 'win') return '#7af59f';
  if (outcome === 'loss') return '#ff8fa3';
  if (outcome === 'tie') return '#ffd166';
  return 'var(--accent)';
}

function renderRockPaperScissorsScoreboard(state) {
  const participants = getRockPaperScissorsParticipants();
  const scoredKeys = new Set(Object.keys(state.scores || {}));
  participants.forEach(player => scoredKeys.add(getRockPaperScissorsPlayerKey(player)));
  return Array.from(scoredKeys).filter(Boolean).map(playerKey => {
    const participant = participants.find(player => getRockPaperScissorsPlayerKey(player) === playerKey);
    const name = participant?.name || state.results?.[playerKey]?.playerName || 'Player';
    const avatar = participant?.avatar || '👤';
    const score = getRockPaperScissorsScore(state, playerKey);
    const last = state.results?.[playerKey];
    const choice = RPS_CHOICE_MAP[last?.playerChoice];
    const botChoice = RPS_CHOICE_MAP[last?.computerChoice];
    return `
      <div style="padding:14px;border-radius:18px;background:rgba(255,255,255,0.055);border:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="font-weight:900;">${escapeHtml(avatar)} ${escapeHtml(name)}</div>
          <div style="font-size:0.78rem;color:${getRockPaperScissorsOutcomeColor(last?.outcome)};">${escapeHtml(getRockPaperScissorsOutcomeLabel(last?.outcome))}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
          <div><strong style="color:#7af59f;">${score.wins}</strong><div style="font-size:0.72rem;color:var(--text-dim);">Wins</div></div>
          <div><strong style="color:#ff8fa3;">${score.losses}</strong><div style="font-size:0.72rem;color:var(--text-dim);">Losses</div></div>
          <div><strong style="color:#ffd166;">${score.ties}</strong><div style="font-size:0.72rem;color:var(--text-dim);">Ties</div></div>
        </div>
        ${choice ? `
          <div style="margin-top:10px;font-size:0.84rem;color:rgba(236,233,225,0.78);">
            ${state.phase === 'revealed' || state.mode === 'bot' ? `${choice.icon} ${escapeHtml(choice.label)}` : 'Throw locked'}
            ${botChoice ? ` vs ${botChoice.icon} ${escapeHtml(botChoice.label)}` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('') || '<div style="color:var(--text-dim);">Scores appear after the first throw.</div>';
}

function renderRockPaperScissorsThrowPanel(state, myResult) {
  if (!myResult) {
    return `
      <div style="padding:16px;border-radius:18px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:var(--text-dim);">
        ${state.phase === 'choosing' ? 'Pick rock, paper, or scissors before the reveal.' : 'Wait for Shoot, then pick your move.'}
      </div>
    `;
  }

  const playerChoice = RPS_CHOICE_MAP[myResult.playerChoice];
  const computerChoice = RPS_CHOICE_MAP[myResult.computerChoice];
  return `
    <div style="display:grid;grid-template-columns:1fr ${computerChoice ? '1fr' : ''};gap:10px;text-align:center;margin-bottom:12px;">
      <div style="padding:14px;border-radius:18px;background:rgba(138,241,255,0.08);border:1px solid rgba(138,241,255,0.16);">
        <div style="font-size:2.3rem;">${playerChoice?.icon || '?'}</div>
        <div style="font-weight:900;">You</div>
      </div>
      ${computerChoice ? `
        <div style="padding:14px;border-radius:18px;background:rgba(255,143,163,0.08);border:1px solid rgba(255,143,163,0.16);">
          <div style="font-size:2.3rem;">${computerChoice.icon}</div>
          <div style="font-weight:900;">Bot</div>
        </div>
      ` : ''}
    </div>
    <div style="font-size:1.15rem;font-weight:900;color:${getRockPaperScissorsOutcomeColor(myResult.outcome)};">
      ${escapeHtml(getRockPaperScissorsOutcomeLabel(myResult.outcome))}
    </div>
  `;
}

function renderRockPaperScissors() {
  const isHost = APP.room?.host === APP.player?.name;
  const state = getRockPaperScissorsState();
  const playerKey = getRockPaperScissorsPlayerKey();
  const myResult = state.results?.[playerKey] || null;
  const canChoose = state.phase === 'choosing' && !state.choices?.[playerKey];
  const chantText = state.phase === 'ready' ? 'Ready?' : RPS_CHANT[state.chantIndex] || 'Shoot';
  const pendingPlayers = getRockPaperScissorsPendingPlayers(state);
  const statusLabel = myResult
    ? getRockPaperScissorsOutcomeLabel(myResult.outcome)
    : state.phase === 'choosing'
      ? 'Throw now'
      : state.phase === 'revealed'
        ? 'Round revealed'
        : 'Make your move';
  const statusColor = myResult ? getRockPaperScissorsOutcomeColor(myResult.outcome) : '#ffd166';
  const modeLabel = state.mode === 'bot' ? 'Bot Mode' : 'Multiplayer';

  return `
    <div class="header">
      <h1 style="font-size:2rem;font-weight:800;">✊✋✌️ Rock Paper Scissors</h1>
      <p class="tagline">Room: ${escapeHtml(APP.roomCode)} • ${escapeHtml(modeLabel)} • Rock, paper, scissors, shoot</p>
    </div>
    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    <div class="game-mobile-shell rps-shell" style="max-width:1180px;margin:22px auto 0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(290px,0.75fr);gap:18px;align-items:start;">
      <div class="rps-stage" style="position:relative;overflow:hidden;border-radius:30px;padding:24px;background:
        radial-gradient(circle at 16% 16%, rgba(138,241,255,0.24), transparent 28%),
        radial-gradient(circle at 82% 22%, rgba(255,143,163,0.2), transparent 30%),
        linear-gradient(145deg, rgba(15,16,34,0.98), rgba(8,8,20,0.98));
        border:1px solid rgba(255,255,255,0.1);box-shadow:0 24px 64px rgba(0,0,0,0.42);">
        <div class="rps-topbar" style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:22px;">
          <div>
            <div style="font-size:0.78rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);font-weight:900;">Round ${Number(state.round) || 0}</div>
            <div class="rps-chant" style="font-family:'Fraunces',serif;font-size:clamp(2.3rem,7vw,5.4rem);line-height:0.95;margin-top:8px;">${escapeHtml(chantText)}</div>
          </div>
          <div class="rps-status" style="padding:12px 16px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);text-align:right;">
            <div style="font-size:0.76rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;">Status</div>
            <div style="font-weight:900;color:${statusColor};">${escapeHtml(statusLabel)}</div>
          </div>
        </div>

        <div class="rps-choice-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:22px;">
          ${RPS_CHOICES.map(choice => `
            <button class="rps-choice-btn" type="button" data-action="rps-choice" data-choice="${choice.id}" ${canChoose ? '' : 'disabled'} style="
              min-height:170px;border-radius:22px;border:1px solid ${canChoose ? choice.accent : 'rgba(255,255,255,0.08)'};
              background:linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.028));
              color:var(--text);cursor:${canChoose ? 'pointer' : 'default'};opacity:${canChoose ? '1' : '0.58'};
              box-shadow:${canChoose ? `0 0 28px color-mix(in srgb, ${choice.accent} 28%, transparent)` : 'none'};
              display:grid;place-items:center;padding:18px;transition:transform 160ms ease,border-color 160ms ease;">
              <span class="rps-choice-icon" style="font-size:clamp(2.8rem,8vw,5.2rem);line-height:1;">${choice.icon}</span>
              <span class="rps-choice-label" style="font-weight:900;font-size:1.05rem;">${choice.label}</span>
            </button>
          `).join('')}
        </div>

        <div class="rps-actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          ${isHost ? `<button class="btn-primary" data-action="rps-start-round" style="width:auto;padding:12px 18px;">${state.phase === 'ready' ? 'Start Round' : 'Next Throw'}</button>` : ''}
          ${isHost && state.mode === 'multiplayer' && state.phase === 'choosing' ? '<button class="btn-secondary" data-action="rps-reveal" style="width:auto;padding:12px 18px;">Reveal Now</button>' : ''}
          <div style="color:rgba(236,233,225,0.72);font-size:0.92rem;">${escapeHtml(state.lastAction || '')}</div>
        </div>
      </div>

      <div class="rps-side" style="display:grid;gap:18px;">
        <div class="rps-panel" style="border-radius:24px;padding:18px;background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Mode</div>
          <div class="rps-mode-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <button class="btn-secondary" data-action="rps-set-mode" data-mode="multiplayer" ${!isHost ? 'disabled' : ''} style="padding:10px;border-color:${state.mode === 'multiplayer' ? 'var(--accent)' : 'var(--border)'};">Multiplayer</button>
            <button class="btn-secondary" data-action="rps-set-mode" data-mode="bot" ${!isHost ? 'disabled' : ''} style="padding:10px;border-color:${state.mode === 'bot' ? 'var(--accent)' : 'var(--border)'};">Bot</button>
          </div>
          <div style="font-size:0.9rem;color:var(--text-dim);line-height:1.45;">
            ${state.mode === 'multiplayer'
              ? `${pendingPlayers.length ? `${pendingPlayers.length} player${pendingPlayers.length === 1 ? '' : 's'} still need to throw.` : 'All throws are in or the round is idle.'}`
              : 'Each player throws against the bot and tracks their own score.'}
          </div>
        </div>

        <div class="rps-panel" style="border-radius:24px;padding:18px;background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Your Throw</div>
          ${renderRockPaperScissorsThrowPanel(state, myResult)}
          ${state.roundSummary ? `<div style="margin-top:10px;color:rgba(236,233,225,0.78);font-size:0.9rem;">${escapeHtml(state.roundSummary)}</div>` : ''}
        </div>

        <div class="rps-panel" style="border-radius:24px;padding:18px;background:linear-gradient(180deg,rgba(20,12,68,0.96),rgba(8,8,28,0.98));border:1px solid rgba(152,115,255,0.34);box-shadow:0 24px 54px rgba(6,6,26,0.45);">
          <div style="font-family:'Fraunces',serif;font-size:1.35rem;margin-bottom:12px;">Scoreboard</div>
          <div style="display:grid;gap:10px;">${renderRockPaperScissorsScoreboard(state)}</div>
        </div>
      </div>
    </div>
  `;
}

(function registerRockPaperScissorsActivity() {
  const registry = window.TEAM_BUILDER_ACTIVITY_REGISTRY;
  if (!registry || typeof registry.registerActivity !== 'function' || typeof registry.registerAction !== 'function') return;
  registry.registerActivity('rock-paper-scissors', {
    label: 'Rock Paper Scissors',
    createInitialState: () => createRockPaperScissorsState(),
    render: () => renderRockPaperScissors()
  });
  registry.registerAction('start-rock-paper-scissors', () => startActivityById('rock-paper-scissors'));
  registry.registerAction('rps-start-round', () => startRockPaperScissorsRound());
  registry.registerAction('rps-set-mode', ({ dataset }) => setRockPaperScissorsMode(dataset.mode));
  registry.registerAction('rps-reveal', () => revealRockPaperScissorsRound());
  registry.registerAction('rps-choice', ({ dataset }) => chooseRockPaperScissors(dataset.choice));
})();
