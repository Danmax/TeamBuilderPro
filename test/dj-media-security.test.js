const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('private audio attaches access only to same-origin DJ media and never to external hosts', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/activities/dj-booth.js'), 'utf8');
  const start = source.indexOf('function ensureDjBoothSharedDeckAudio(');
  const end = source.indexOf('\nfunction ', start + 1);
  class Audio { constructor(url) { this.src = url; } addEventListener() {} }
  const context = vm.createContext({ URL, Audio, HTMLAudioElement: Audio, API_BASE_URL: 'https://game.example', APP: { room: {}, roomCode: 'PRIV12', roomAccessToken: 'private-secret' }, DJ_BOOTH_DECK_KEYS: ['deckA'], djBoothLocalDeckAudio: {}, djBoothLocalDeckMeta: {}, normalizeDjBoothDeckState: value => value, clearDjBoothLocalDeckAudio() {}, isRoomPrivateSession: () => true, getRoomAccessTokenForKey: () => 'private-secret' });
  vm.runInContext(source.slice(start, end), context);
  for (const url of ['https://outside.invalid/media/dj/track.mp3', 'https://game.example.outside.invalid/media/dj/track.mp3', 'https://game.example/other/track.mp3']) {
    context.djBoothLocalDeckAudio = {}; context.djBoothLocalDeckMeta = {};
    const audio = context.ensureDjBoothSharedDeckAudio('deckA', { sourceMode: 'shared', sourceUrl: url });
    assert.equal(new URL(audio.src).searchParams.has('roomToken'), false);
  }
  context.djBoothLocalDeckAudio = {}; context.djBoothLocalDeckMeta = {};
  const audio = context.ensureDjBoothSharedDeckAudio('deckA', { sourceMode: 'shared', sourceUrl: '/media/dj/PRIV12_dj_1700000000000_1234abcd.mp3' });
  assert.equal(new URL(audio.src).searchParams.get('roomToken'), 'private-secret');
});
