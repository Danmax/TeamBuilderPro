const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { validateSurveyQuestions, parseContentJSON, selectActivityContent } = require('../assets/js/theme-content-core');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Run the actual browser functions so these tests catch behavior regressions.
function loadFunction(name, nextName, context) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`\nfunction ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(html.slice(start, end), context);
}

const question = { prompt: 'Name something you take into space.', answers: [
  { text: 'Spacesuit', points: 60, aliases: ['suit'] },
  { text: 'Food', points: 40, aliases: [] }
] };

test('survey packs reject invalid totals, duplicate answers and malformed boards', () => {
  assert.deepEqual(validateSurveyQuestions([question]), [question]);
  assert.deepEqual(validateSurveyQuestions([{ ...question, answers: [{ text: 'A', points: 30 }, { text: 'B', points: 30 }] }]), []);
  assert.deepEqual(validateSurveyQuestions([{ ...question, answers: [{ text: 'A', points: 60 }, { text: 'a', points: 40 }] }]), []);
  assert.deepEqual(validateSurveyQuestions([{ ...question, answers: [{ text: 'A', points: 100 }] }]), []);
  assert.deepEqual(validateSurveyQuestions([null, {}, { prompt: 'Invalid', answers: [] }]), []);
});

test('AI replies accept plain and fenced JSON and reject incomplete replies', () => {
  const pack = { name: 'Space', activities: { 'survey-clash': [question] } };
  assert.deepEqual(parseContentJSON(JSON.stringify(pack)), pack);
  assert.deepEqual(parseContentJSON('```json\n' + JSON.stringify(pack) + '\n```'), pack);
  assert.throws(() => parseContentJSON('{"name":'));
});

test('live survey uses its shared question snapshot when the local content changes', () => {
  const context = vm.createContext({ SURVEY_CLASH_QUESTIONS: [{ ...question, prompt: 'Changed locally' }] });
  loadFunction('getSurveyClashQuestion', 'getSurveyClashMultiplier', context);
  const state = { roundIndex: 0, questionOrder: [0], questions: [question] };
  assert.equal(context.getSurveyClashQuestion(state).prompt, question.prompt);
});

test('survey answer matching supports aliases without accepting partial words', () => {
  const context = vm.createContext({});
  loadFunction('normalizeSurveyClashText', 'getSurveyClashQuestion', context);
  // The next function is async, so use its declaration boundary directly.
  const start = html.indexOf('function surveyClashAnswerMatches(');
  const end = html.indexOf('\nasync function surveyClashSubmitGuess(', start);
  vm.runInContext(html.slice(start, end), context);
  assert.equal(context.surveyClashAnswerMatches(question.answers[0], 'SUIT!'), true);
  assert.equal(context.surveyClashAnswerMatches(question.answers[0], 'suits'), true);
  assert.equal(context.surveyClashAnswerMatches(question.answers[0], 'space'), false);
});

test('all shipped browser scripts parse', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  const scripts = path.join(__dirname, '..', 'assets', 'js');
  function check(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) check(file);
      else if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    }
  }
  check(scripts);
});

test('survey reveal slots follow the randomly selected first question', () => {
  const otherQuestion = { prompt: 'Other round', answers: [
    { text: 'A', points: 50 }, { text: 'B', points: 30 }, { text: 'C', points: 20 }
  ] };
  const context = vm.createContext({
    SURVEY_CLASH_QUESTIONS: [question, otherQuestion],
    buildShuffledQuestionOrder: () => [1, 0]
  });
  loadFunction('createSurveyClashState', 'getSurveyClashBank', context);
  const state = context.createSurveyClashState([]);
  assert.equal(state.revealed.length, 3);
  assert.equal(state.questions[1].answers.length, 3);
  otherQuestion.answers.pop();
  assert.equal(state.questions[1].answers.length, 3, 'shared snapshot is a deep copy');
});

test('extracted Slides Studio and Backgammon modules register playable initial states', () => {
  const context = vm.createContext({
    window: {},
    safeParseJson: JSON.parse,
    randomAlphaNum: () => 'TEST123',
    normalizeTopic: value => String(value || '').trim()
  });
  for (const file of ['static-data.js', 'core/activity-registry.js', 'activities/slides-studio.js', 'activities/backgammon.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', file), 'utf8'), context);
  }
  const registry = context.window.TEAM_BUILDER_ACTIVITY_REGISTRY;
  for (const file of ['slides-studio', 'backgammon']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'activities', `${file}.js`), 'utf8');
    const actions = new Set(Array.from(source.matchAll(/data-action="([a-z-]+)"/g), match => match[1]));
    actions.delete('end-activity'); // Common session control, handled by the app.
    actions.add(`start-${file}`);
    for (const action of actions) assert.equal(typeof registry.getAction(action), 'function', `${action} must have a handler`);
  }

  const slides = registry.getActivity('slides-studio').createInitialState({});
  assert.ok(slides.slides.length > 0);
  assert.equal(typeof registry.getActivity('slides-studio').render, 'function');
  const players = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
  const board = registry.getActivity('backgammon').createInitialState({ participants: players });
  assert.equal(board.phase, 'playing');
  assert.equal(board.players.white.playerName, 'Alice');
  assert.equal(board.points.length, 24);
});

test('session themes take priority over global content and sample questions', () => {
  const validate = items => Array.isArray(items) ? items.filter(value => typeof value === 'string') : [];
  const samples = ['Default question'];
  const global = [{ activities: { icebreaker: ['Global question'] } }];
  const session = [{ activities: { icebreaker: ['Space question'] } }];
  assert.deepEqual(selectActivityContent(global, session, ['icebreaker'], validate, samples), ['Space question']);
  assert.deepEqual(selectActivityContent(global, [], ['icebreaker'], validate, samples), ['Global question']);
  assert.deepEqual(selectActivityContent([], [], ['icebreaker'], validate, samples), samples);
  assert.deepEqual(selectActivityContent(global, [{ activities: { icebreaker: [null] } }], ['icebreaker'], validate, samples), ['Global question']);
});
