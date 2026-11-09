const assert = require('node:assert/strict');
const test = require('node:test');
const F = require('../assets/js/games/family-face-off-core');
const people = [{ id: 'host', name: 'Host', isHost: true }, { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'a2', name: 'A2' }, { id: 'b2', name: 'B2' }];
const actor = id => ({ playerId: id, participant: people.find(player => player.id === id), isHost: id === 'host' });
const question = { prompt: 'Name a pet.', answers: [{ text: 'Cat', points: 30, aliases: ['kitten'] }, { text: 'Dog', points: 50 }, { text: 'Fish', points: 20 }] };
function setup() { return F.create({ questions: [question, question], questionOrder: [0, 1], roundCount: 2, activeTeam: 0, startedAt: 1000 }, people, 'game-1'); }
function act(game, id, action, payload = {}, now = 1000) { return F.action(game, actor(id), action, payload, people, now); }
function open() { return act(setup(), 'host', 'start-faceoff', { reps: ['a', 'b'], seconds: 5 }); }
function playing() { let game = act(open(), 'a', 'buzz'); game = act(game, 'a', 'answer', { text: 'dogs' }); return act(game, 'a', 'choose', { choice: 'play' }); }

test('setup validates teams and representatives and only the first nominated player can buzz', () => {
  const setupGame = setup();
  assert.deepEqual(setupGame.teams, { a: 0, b: 1, a2: 0, b2: 1 });
  assert.throws(() => act(setupGame, 'a', 'start-faceoff', { reps: ['a', 'b'] }), /host/);
  assert.throws(() => act(setupGame, 'host', 'start-faceoff', { reps: ['a', 'a2'] }), /each team/);
  assert.throws(() => act(open(), 'a2', 'buzz'), /two face-off/);
  const game = act(open(), 'a', 'buzz', {}, 2000);
  assert.equal(game.faceoff.deadline, 7000);
  assert.throws(() => act(game, 'b', 'buzz'), /first buzz/);
  assert.throws(() => act(game, 'b', 'answer', { text: 'Dog' }), /turn/);
  assert.throws(() => act(game, 'a', 'answer', { text: 'Dog' }, 7000), /Time is up/);
  assert.throws(() => act(game, 'a', 'team', { team: 1 }), /between rounds/);
});

test('highest-scoring answer wins immediately; lower answer gives opponent one chance to beat it', () => {
  let game = act(open(), 'a', 'buzz');
  game = act(game, 'a', 'answer', { text: 'kitten' });
  assert.equal(game.phase, 'answering'); assert.equal(game.faceoff.answeringTeam, 1);
  game = act(game, 'b', 'answer', { text: 'Dog' });
  assert.equal(game.phase, 'choice'); assert.equal(game.faceoff.winnerTeam, 1);
  assert.equal(F.bank(game), 80);
  assert.throws(() => act(game, 'a', 'choose', { choice: 'play' }), /winner/);
  game = act(game, 'b', 'choose', { choice: 'pass' });
  assert.equal(game.activeTeam, 0); assert.equal(game.phase, 'playing');
  let highest = act(open(), 'b', 'buzz'); highest = act(highest, 'b', 'answer', { text: 'Dog' });
  assert.equal(highest.phase, 'choice'); assert.equal(highest.faceoff.attempts.length, 1);
});

test('weaker or tied challenge keeps control with the first player', () => {
  let game = act(open(), 'a', 'buzz'); game = act(game, 'a', 'answer', { text: 'Cat' });
  game = act(game, 'b', 'answer', { text: 'Fish' }); assert.equal(game.faceoff.winnerTeam, 0);
  const tied = setup(); tied.questions = [{ ...question, answers: [{ text: 'Cat', points: 30 }, { text: 'Dog', points: 40 }, { text: 'Fish', points: 30 }] }]; tied.questionOrder = [0];
  let tie = act(tied, 'host', 'start-faceoff', { reps: ['a', 'b'] }); tie = act(tie, 'a', 'buzz'); tie = act(tie, 'a', 'answer', { text: 'Cat' }); tie = act(tie, 'b', 'answer', { text: 'Fish' });
  assert.equal(tie.faceoff.winnerTeam, 0);
});

test('timeouts pass the answer window to the opponent and reopen buzzers if both miss', () => {
  const game = act(open(), 'a', 'buzz');
  assert.equal(F.expire(game, 5999), game);
  const next = F.expire(game, 6000);
  assert.equal(next.faceoff.answeringTeam, 1); assert.equal(next.faceoff.deadline, 11000);
  const reset = F.expire(next, 11000);
  assert.equal(reset.phase, 'faceoff'); assert.equal(reset.strikes, 0);
  assert.equal(game.faceoff.attempts.length, 0, 'previous state stays immutable');
});

test('spoken and unmatched answers wait for host review without timing out', () => {
  let game = act(open(), 'a', 'buzz'); game = act(game, 'a', 'spoken');
  assert.equal(game.pendingAnswer.spoken, true); assert.equal(game.faceoff.deadline, 0);
  assert.equal(F.expire(game, 99999), game);
  assert.throws(() => act(game, 'b', 'judge', { index: 0 }), /host/);
  game = act(game, 'host', 'judge', { index: 0 }, 10000);
  assert.equal(game.faceoff.deadline, 15000);
  game = act(game, 'b', 'answer', { text: 'a puppy' }, 11000);
  assert.equal(game.pendingAnswer.text, 'a puppy');
  game = act(game, 'host', 'judge', { index: 1 }, 12000);
  assert.equal(game.faceoff.winnerTeam, 1);
});

test('team members can type on their turn; three strikes allow one steal and award the bank once', () => {
  for (const success of [true, false]) {
    let game = playing();
    assert.throws(() => act(game, 'b2', 'answer', { text: 'Cat' }), /turn/);
    game = act(game, 'a2', 'answer', { text: 'Cat' });
    for (let index = 0; index < 3; index++) { game = act(game, 'a2', 'answer', { text: 'Cow' }); game = act(game, 'host', 'judge', { index: null }); }
    assert.equal(game.phase, 'steal');
    game = act(game, 'b2', 'answer', { text: success ? 'Fish' : 'Cow' });
    if (!success) game = act(game, 'host', 'judge', { index: null });
    assert.equal(game.phase, 'round-over'); assert.equal(game.scores[success ? 1 : 0], success ? 100 : 80);
    assert.throws(() => act(game, 'host', 'award-bank'), /no bank/);
    assert.throws(() => act(game, 'host', 'restart-faceoff'), /next round/);
    game = act(game, 'host', 'next-round'); assert.equal(game.phase, 'setup'); assert.equal(game.roundIndex, 1);
  }
});
