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
