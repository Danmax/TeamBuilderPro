(function (root) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function matches(answer, guess) {
    const text = normalize(guess), singular = value => value.endsWith('s') ? value.slice(0, -1) : value;
    return Boolean(text) && [answer.text, ...(answer.aliases || [])].some(value => singular(normalize(value)) === singular(text));
  }
  function question(game) { return game.questions[game.questionOrder[game.roundIndex % game.questionOrder.length]]; }
  function sound(game, key, now) { game.lastSound = { key, stamp: Math.max(now, (Number(game.lastSound?.stamp) || 0) + 1) }; }
  function bank(game) { return game.roundAwarded ? 0 : question(game).answers.reduce((sum, answer, index) => sum + (game.revealed[index] ? answer.points : 0), 0); }
  function roundSetup(game) {
    game.phase = 'setup'; game.strikes = 0; game.roundAwarded = false; game.pendingAnswer = null;
    game.revealed = question(game).answers.map(() => false);
    game.faceoff = { reps: [null, null], firstTeam: null, answeringTeam: null, attempts: [], deadline: 0, seconds: game.faceoffSeconds || 8, winnerTeam: null };
    game.message = 'Choose teams and one face-off player from each team. The host opens the buzzers.';
    return game;
  }
  function create(source, participants, id) {
    const game = JSON.parse(JSON.stringify(source));
    game.id = id; game.version = 0; game.roundIndex = 0; game.scores = [0, 0]; game.teamNames = ['Team 1', 'Team 2']; game.teams = {};
    participants.filter(player => !player.isHost).forEach((player, index) => { game.teams[player.id] = index % 2; });
    game.faceoffSeconds = 8; game.finished = false;
    return roundSetup(game);
  }
  function award(game, team, now, cue = 'win') {
    const points = bank(game); game.scores[team] += points; game.roundAwarded = true; game.phase = 'round-over'; game.pendingAnswer = null; game.faceoff.deadline = 0;
    game.message = `${game.teamNames[team]} wins the round and banks ${points} points.`; sound(game, cue, now);
  }
  function control(game, team) {
    game.phase = 'choice'; game.activeTeam = team; game.faceoff.winnerTeam = team; game.faceoff.deadline = 0; game.pendingAnswer = null;
    game.message = `${game.teamNames[team]} wins the face-off! Choose Play or Pass.`;
  }
  function resolveFaceoff(game, index, now) {
    const team = game.faceoff.answeringTeam, answer = question(game).answers[index];
    const points = answer ? answer.points : 0;
    if (answer) { game.revealed[index] = true; sound(game, 'correct', now); }
    else sound(game, 'strike', now);
    game.pendingAnswer = null;
    game.faceoff.attempts.push({ team, index: answer ? index : null, points });
    if (game.faceoff.attempts.length === 1 && points < Math.max(...question(game).answers.map(item => item.points))) {
      game.faceoff.answeringTeam = 1 - team; game.faceoff.deadline = now + game.faceoff.seconds * 1000;
      game.message = `${points ? `${answer.text}: ${points} points.` : 'No answer on the board.'} ${game.teamNames[1 - team]} can beat it. ${game.faceoff.seconds} seconds!`;
      return;
    }
    const [first, second] = game.faceoff.attempts;
    if (!first.points && !second?.points) {
      game.phase = 'faceoff'; game.faceoff.attempts = []; game.faceoff.firstTeam = null; game.faceoff.answeringTeam = null; game.faceoff.deadline = 0;
      game.message = 'Neither answer scored. Both face-off players can buzz again.'; return;
    }
    control(game, second && second.points > first.points ? second.team : first.team);
  }
  function resolve(game, index, now) {
    if (index !== null && (!Number.isInteger(index) || !question(game).answers[index] || game.revealed[index])) throw new Error('Choose an unrevealed answer.');
    if (game.phase === 'answering') { resolveFaceoff(game, index, now); return; }
    if (!['playing', 'steal'].includes(game.phase)) throw new Error('There is no answer to judge right now.');
    const stealing = game.phase === 'steal';
    game.pendingAnswer = null;
    if (index !== null) {
      const answer = question(game).answers[index]; game.revealed[index] = true; sound(game, 'correct', now);
      game.message = `${answer.text} is on the board. ${answer.points} points!`;
      if (stealing) award(game, 1 - game.activeTeam, now, 'correct');
      else if (game.revealed.every(Boolean)) award(game, game.activeTeam, now, 'correct');
    } else if (stealing) award(game, game.activeTeam, now, 'strike');
    else {
      game.strikes = Math.min(3, game.strikes + 1); sound(game, 'strike', now);
      game.message = `Strike ${game.strikes}.`;
      if (game.strikes === 3) { game.phase = 'steal'; game.message = `${game.teamNames[1 - game.activeTeam]} gets one answer to steal the bank!`; }
    }
  }
  function expire(source, now = Date.now()) {
    if (source.phase !== 'answering' || !source.faceoff.deadline || source.pendingAnswer || now < source.faceoff.deadline) return source;
    const game = JSON.parse(JSON.stringify(source)); resolveFaceoff(game, null, now); game.version++;
    return game;
  }
  const HOST_ACTIONS = ['start-faceoff', 'assign-team', 'names', 'judge', 'host-answer', 'reveal', 'strike', 'clear-strike', 'switch-team', 'award-bank', 'award-steal', 'next-round', 'restart-faceoff', 'finish', 'sound', 'timer'];
  function action(source, actor, type, payload, participants, now = Date.now()) {
    const game = JSON.parse(JSON.stringify(source));
    if (HOST_ACTIONS.includes(type) && !actor.isHost) throw new Error('Only the host can use this control.');
    if (game.finished) throw new Error('This game is finished.');
    const team = Object.hasOwn(game.teams, actor.playerId) ? game.teams[actor.playerId] : undefined;
    const answerTeam = game.phase === 'answering' ? game.faceoff.answeringTeam : game.phase === 'steal' ? 1 - game.activeTeam : game.activeTeam;
    const canAnswer = ['answering', 'playing', 'steal'].includes(game.phase) && team === answerTeam && (game.phase !== 'answering' || game.faceoff.reps[team] === actor.playerId);
    switch (type) {
      case 'team': case 'assign-team': {
        if (game.phase !== 'setup') throw new Error('Teams can change between rounds.');
        const playerId = type === 'team' ? actor.playerId : payload.playerId;
        if (!participants.some(player => player.id === playerId) || ![0, 1, null].includes(payload.team)) throw new Error('Choose a valid player and team.');
        if (payload.team === null) delete game.teams[playerId]; else game.teams[playerId] = payload.team;
        break;
      }
      case 'names':
        if (game.phase !== 'setup') throw new Error('Rename teams between rounds.');
        game.teamNames = [0, 1].map(index => String(payload.names?.[index] || `Team ${index + 1}`).replace(/[<>]/g, '').trim().slice(0, 28) || `Team ${index + 1}`); break;
      case 'start-faceoff': {
        if (game.phase !== 'setup') throw new Error('The face-off has already started.');
        const reps = payload.reps;
        if (!Array.isArray(reps) || reps.length !== 2 || !reps.every((id, index) => game.teams[id] === index && participants.some(player => player.id === id))) throw new Error('Choose one player from each team.');
        game.faceoffSeconds = [5, 8, 10, 15].includes(payload.seconds) ? payload.seconds : 8;
        game.faceoff = { ...game.faceoff, reps, seconds: game.faceoffSeconds };
        game.phase = 'faceoff'; game.message = 'Buzzers open! First face-off player to buzz gets the first answer.'; sound(game, 'round', now); break;
      }
      case 'buzz':
        if (game.phase !== 'faceoff') throw new Error('The buzzer is locked. The first buzz already won.');
        if (![0, 1].includes(team) || game.faceoff.reps[team] !== actor.playerId) throw new Error('Only the two face-off players can buzz.');
        game.phase = 'answering'; game.faceoff.firstTeam = team; game.faceoff.answeringTeam = team; game.faceoff.deadline = now + game.faceoff.seconds * 1000;
        game.message = `${actor.participant.name} buzzed first! Answer in ${game.faceoff.seconds} seconds.`; sound(game, 'timer', now); break;
      case 'answer': case 'spoken': case 'host-answer': {
        if (type !== 'host-answer' && !canAnswer) throw new Error('Wait for your team’s turn to answer.');
        if (!['answering', 'playing', 'steal'].includes(game.phase)) throw new Error('Wait for an answer turn.');
        if (game.pendingAnswer) throw new Error('The host is reviewing an answer.');
        if (game.phase === 'answering' && now >= game.faceoff.deadline) throw new Error('Time is up.');
        const text = type === 'spoken' ? 'Answered out loud' : String(payload.text || '').replace(/[<>]/g, '').trim().slice(0, 80);
        if (!text) throw new Error('Type an answer first.');
        const index = type === 'spoken' ? -1 : question(game).answers.findIndex((answer, index) => !game.revealed[index] && matches(answer, text));
        if (index >= 0) resolve(game, index, now);
        else {
          game.pendingAnswer = { playerId: actor.playerId, team: answerTeam, text, spoken: type === 'spoken', at: now };
          game.faceoff.deadline = 0;
          game.message = `${text === 'Answered out loud' ? 'Spoken answer' : `“${text}”`} — host, select its matching answer or mark Not on the board.`;
        }
        break;
      }
      case 'judge':
        if (!game.pendingAnswer && game.phase !== 'answering') throw new Error('There is no answer waiting for review.');
        resolve(game, payload.index, now); break;
      case 'reveal': {
        const index = Number.isInteger(payload.index) ? payload.index : game.revealed.findIndex(value => !value);
        if (game.phase === 'answering' || game.pendingAnswer || ['playing', 'steal'].includes(game.phase)) resolve(game, index, now);
        else throw new Error('Open the face-off before revealing answers.');
        break;
      }
      case 'choose':
        if (game.phase !== 'choice' || (!actor.isHost && team !== game.faceoff.winnerTeam)) throw new Error('The face-off winner chooses Play or Pass.');
        if (!['play', 'pass'].includes(payload.choice)) throw new Error('Choose Play or Pass.');
        game.activeTeam = payload.choice === 'pass' ? 1 - game.faceoff.winnerTeam : game.faceoff.winnerTeam;
        game.phase = 'playing'; game.message = `${game.teamNames[game.activeTeam]} plays. Three strikes gives the other team one chance to steal.`;
        if (game.revealed.every(Boolean)) award(game, game.activeTeam, now);
        break;
      case 'strike': resolve(game, null, now); break;
      case 'clear-strike':
        if (!['playing', 'steal'].includes(game.phase)) throw new Error('There is no round strike to clear.');
        game.strikes = Math.max(0, game.strikes - 1); game.phase = 'playing'; game.pendingAnswer = null; game.message = 'Strike cleared.'; break;
      case 'switch-team':
        if (game.phase !== 'playing') throw new Error('Finish the face-off before switching control.');
        game.activeTeam = 1 - game.activeTeam; game.strikes = 0; game.pendingAnswer = null; game.message = `${game.teamNames[game.activeTeam]} has control.`; break;
      case 'award-bank': case 'award-steal':
        if (!['playing', 'steal'].includes(game.phase) || game.roundAwarded) throw new Error('There is no bank to award.');
        award(game, type === 'award-steal' ? 1 - game.activeTeam : game.activeTeam, now); break;
      case 'next-round':
        if (game.phase !== 'round-over') throw new Error('Finish this round before moving on.');
        if (game.roundIndex + 1 >= game.roundCount) { game.finished = true; game.phase = 'finished'; game.message = game.scores[0] === game.scores[1] ? 'Game over. It’s a tie!' : `Game over. ${game.teamNames[game.scores[0] > game.scores[1] ? 0 : 1]} wins.`; }
        else { game.roundIndex++; roundSetup(game); }
        sound(game, 'round', now); break;
      case 'restart-faceoff':
        if (game.roundAwarded) throw new Error('Start the next round after awarding points.');
        roundSetup(game); break;
      case 'finish': game.message = game.scores[0] === game.scores[1] ? 'Game over. It’s a tie!' : `Game over. ${game.teamNames[game.scores[0] > game.scores[1] ? 0 : 1]} wins.`; game.finished = true; game.phase = 'finished'; game.pendingAnswer = null; game.faceoff.deadline = 0; sound(game, 'win', now); break;
      case 'sound':
        if (!['correct', 'top', 'strike', 'win', 'timer', 'round'].includes(payload.key)) throw new Error('Unknown sound.');
        sound(game, payload.key, now); break;
      case 'timer': game.timerSeconds = Math.max(1, Math.min(90, Number(payload.seconds) || 20)); game.timerStartedAt = now; sound(game, 'timer', now); break;
      default: throw new Error('Unknown Family Face-Off action.');
    }
    game.version++;
    return game;
  }
  const api = { create, action, expire, question, bank, matches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderFamilyFaceOff = api;
})(typeof window === 'undefined' ? globalThis : window);
