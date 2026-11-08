const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const themeContent = require('../assets/js/theme-content-core');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('admin settings drafts survive replacement DOM fields and clear after saving', () => {
  let fields = [{ id: 'adminBrandAppName', type: 'text', value: 'Team Builder' }, { id: 'adminActivityEnabled-bingo', type: 'checkbox', checked: true }];
  const status = { textContent: '' };
  const context = vm.createContext({ document: {
    addEventListener() {}, querySelector() { return null; },
    querySelectorAll(selector) { return selector.endsWith(':checked') ? fields.filter(input => input.checked) : fields; },
    getElementById(id) { return id === 'adminSettingsStatus' ? status : null; }
  } });
  context.window = context;
  vm.runInContext(read('assets/js/admin-experience.js'), context);
  context.restoreAdminSettingsDraft();
  fields[0].value = 'Edited app'; fields[1].checked = false;
  context.captureAdminSettingsDraft();
  assert.match(status.textContent, /Unsaved/);
  fields = [{ id: 'adminBrandAppName', type: 'text', value: 'Team Builder' }, { id: 'adminActivityEnabled-bingo', type: 'checkbox', checked: true }];
  context.restoreAdminSettingsDraft();
  assert.equal(fields[0].value, 'Edited app');
  assert.equal(fields[1].checked, false);
  context.resetAdminSettingsDraft();
  fields[0].value = 'Saved app';
  context.restoreAdminSettingsDraft();
  assert.equal(fields[0].value, 'Saved app');
  assert.match(status.textContent, /up to date/);
});

test('saved themes store reusable options without importing replies or changing scope', () => {
  const storage = new Map();
  const app = { contentStudioDraft: { scope: 'admin', planId: '', themePreset: 'Space Exploration', customTopic: 'Team kickoff', audience: 'New hires', tone: 'Playful', count: 6, difficulty: 'easy', collectionJson: 'private draft reply' } };
  const context = vm.createContext({
    APP: app, document: { addEventListener() {}, getElementById: () => ({ value: 'Space kickoff' }) },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    captureContentStudioDraftFromInputs: () => app.contentStudioDraft,
    render() {}, showError(message) { throw new Error(message); }
  }); context.window = context;
  vm.runInContext(read('assets/js/content-themes.js'), context);
  context.saveContentStudioTheme();
  const saved = context.getSavedContentThemes()[0];
  assert.equal(saved.name, 'Space kickoff');
  assert.equal(saved.draft.audience, 'New hires');
  assert.equal(saved.draft.collectionJson, undefined);
  app.contentStudioDraft = { scope: 'room', planId: '', collectionJson: 'new room reply', selectedActivityIds: ['icebreaker'] };
  context.applyContentStudioTheme(`saved:${saved.id}`);
  assert.equal(app.contentStudioDraft.scope, 'room');
  assert.equal(app.contentStudioDraft.collectionJson, 'new room reply');
  assert.equal(app.contentStudioDraft.themePreset, 'Space Exploration');
  assert.equal(app.contentStudioDraft.count, 6);
  context.deleteContentStudioTheme();
  assert.equal(context.getSavedContentThemes().length, 0);
  storage.set('team-builder-saved-content-themes', '{broken');
  assert.equal(context.getSavedContentThemes().length, 0);
});

test('question preview accepts one activity array and rejects ambiguous or unsupported imports', () => {
  const draft = { selectedActivityIds: ['survey-clash'], packName: 'Space pack', themePreset: 'Space Exploration' };
  let reply = JSON.stringify([{ prompt: 'Name a planet.', answers: [{ text: 'Earth', points: 60 }, { text: 'Mars', points: 40 }] }]);
  const context = vm.createContext({
    ALL_ACTIVITY_IDS: ['survey-clash', 'icebreaker'], AI_GENERATION_TARGET_LABELS: { 'survey-clash': 'Survey Clash', icebreaker: 'Icebreaker' },
    document: { getElementById: () => ({ value: reply }) },
    captureContentStudioDraftFromInputs: () => draft,
    TeamBuilderThemeContent: themeContent,
    validateGeneratedContentForActivity: (_id, items) => themeContent.validateSurveyQuestions(items)
  }); context.window = context;
  vm.runInContext(read('assets/js/admin-runtime-core.js'), context);
  const html = read('index.html');
  const start = html.indexOf('function readContentStudioImport()');
  const end = html.indexOf('\nfunction previewContentStudioImport()', start);
  vm.runInContext(html.slice(start, end), context);
  const preview = context.readContentStudioImport();
  assert.equal(preview[0].name, 'Space pack');
  assert.equal(preview[0].activities['survey-clash'][0].prompt, 'Name a planet.');
  draft.selectedActivityIds.push('icebreaker');
  assert.throws(() => context.readContentStudioImport(), /exactly one activity/);
  reply = JSON.stringify({ name: 'Bad', activities: { unsupported: ['Question'] } });
  assert.throws(() => context.readContentStudioImport(), /Unsupported question activity/);
  reply = JSON.stringify({ name: 'Bad', activities: { 'survey-clash': [] } });
  assert.throws(() => context.readContentStudioImport(), /at least one item/);
});
