const assert = require('node:assert/strict');
const test = require('node:test');
const C = require('../assets/js/character-core');
const Plaza = require('../assets/js/community-plaza-core');

test('character data accepts only known parts and safe colors and drops unknown payloads', () => {
  const character = C.normalize({ type: 'cat', eyes: 'happy', skinColor: '#ABCDEF', hat: '<script>', shirtColor: 'url(javascript:alert(1))', svg: '<script>', isHost: true, nested: { script: '<img>' } });
  assert.equal(character.type, 'cat'); assert.equal(character.eyes, 'happy'); assert.equal(character.skinColor, '#abcdef');
  assert.equal(character.hat, C.DEFAULT.hat); assert.equal(character.shirtColor, C.DEFAULT.shirtColor);
  assert.equal('svg' in character, false); assert.equal('isHost' in character, false); assert.equal('nested' in character, false);
  assert.deepEqual(C.normalize(null), C.DEFAULT); assert.deepEqual(C.normalize([]), C.DEFAULT);
});

test('every selectable part renders valid escaped markup and makes a distinct appearance', () => {
  const base = C.render(C.DEFAULT);
  for (const [key, options] of Object.entries(C.OPTIONS)) for (const value of options) {
    const character = { ...C.DEFAULT, [key]: value };
    const output = C.render(character, '<img src=x onerror=alert(1)>');
    assert.equal(output.includes('<img'), false); assert.ok(output.includes('&lt;img'));
    assert.ok(output.includes('<svg')); assert.ok(output.includes('</svg>'));
    if (value !== C.DEFAULT[key]) assert.notEqual(C.render(character), base, `${key}: ${value} changes the preview`);
  }
});

test('Surprise me produces complete valid characters and saved characters override generated plaza faces', () => {
  for (let index = 0; index < 100; index++) {
    const character = C.randomize(); assert.deepEqual(C.normalize(character), character);
    const restored = JSON.parse(JSON.stringify(character));
    assert.equal(C.render(restored), C.render(character));
    assert.equal(Plaza.avatar(123, '🦊', '', restored), C.render(character, '🦊'));
  }
  assert.deepEqual(C.randomize(() => 0).type, 'person'); assert.equal(C.randomize(() => 1).type, 'cat');
});

test('legacy characters receive neutral defaults and expanded looks survive storage', () => {
  const legacy = C.normalize({ type: 'person', hair: 'curly' });
  assert.equal(legacy.head, 'oval'); assert.equal(legacy.eyebrows, 'natural');
  assert.equal(legacy.style, 'classic'); assert.equal(legacy.features, 'none'); assert.equal(legacy.facialHair, 'none');
  const character = C.normalize({ head: 'heart', eyes: 'almond', eyebrows: 'arched', features: 'freckles', facialHair: 'goatee', hair: 'locs', accessories: 'hearingAid', style: 'pastel', shirt: 'overalls' });
  assert.deepEqual(C.normalize(JSON.parse(JSON.stringify(character))), character);
  const snapshot = { ...character };
  C.render(character);
  assert.deepEqual(character, snapshot, 'visual styles preserve saved colors');
  for (const type of C.OPTIONS.type) for (const [key, options] of Object.entries(C.OPTIONS)) {
    for (const value of options) assert.doesNotMatch(C.render({ ...character, type, [key]: value }), /undefined|NaN/);
  }
});

test('editor exposes expanded options and selections update the live preview', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const actions = {};
  const preview = { innerHTML: '', setAttribute() {} };
  const context = {
    APP: { player: { name: 'Player', avatar: '🦊', character: C.DEFAULT } }, render() {},
    document: { addEventListener() {}, getElementById: id => id === 'characterPreview' ? preview : null, querySelector() {}, querySelectorAll: () => [] },
    window: { TeamBuilderCharacter: C, TEAM_BUILDER_ACTIVITY_REGISTRY: { registerAction: (key, handler) => { actions[key] = handler; } } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/js/character-editor'), 'utf8'), context);
  actions['open-character-creator']();
  const seen = new Set();
  for (const category of ['character', 'face', 'details', 'hair', 'outfit', 'extras', 'scene']) {
    actions['character-tab']({ dataset: { category } });
    const markup = context.window.TeamBuilderCharacterEditor.render();
    for (const [, key, value] of markup.matchAll(/data-char-field="([^"]+)" data-char-value="([^"]+)"/g)) seen.add(`${key}:${value}`);
    assert.doesNotMatch(markup, /undefined|NaN/);
  }
  for (const [key, options] of Object.entries(C.OPTIONS)) for (const value of options) assert.ok(seen.has(`${key}:${value}`), `${key}: ${value} is reachable`);
  actions['character-choose']({ dataset: { charField: 'head', charValue: 'diamond' } });
  assert.equal(preview.innerHTML, C.render({ ...C.DEFAULT, head: 'diamond' }, '🦊'));
});
