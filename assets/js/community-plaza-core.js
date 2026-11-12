(function (root) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function hash(value) { let number = 2166136261; for (const char of String(value)) number = Math.imul(number ^ char.charCodeAt(0), 16777619); return number >>> 0; }
  function seedFor(code, playerId) { return hash(`${code}:${playerId}`); }
  function avatar(seed, emoji = '', className = '', character = null) {
    if (character) { const characterCore = typeof module !== 'undefined' && module.exports ? require('./character-core') : root.TeamBuilderCharacter; return characterCore.render(character, emoji, className); }
    const number = hash(seed), skin = ['#f4c5a0', '#dba77e', '#b87d57', '#895636', '#f8dbbf', '#603d2d'][(number >>> 3) % 6];
    const hair = ['#362c31', '#503c2c', '#a66535', '#d8b56c', '#303141'][(number >>> 7) % 5];
    const shirt = ['#7cb9cf', '#c787a3', '#e6ad5d', '#80b69e', '#9592c9', '#cb876e'][(number >>> 11) % 6];
    const hairstyles = [
      'M25 60Q17 26 48 26Q81 22 77 61L69 49Q47 54 35 43Z',
      'M24 65Q14 23 48 25Q84 20 78 69L70 56L68 42Q56 49 34 44L31 68Z',
      'M25 55Q20 31 35 30L34 22L46 27L55 19L60 27Q80 28 77 58L66 45L38 43Z',
      'M24 65Q12 22 49 23Q90 22 77 77L72 95L68 55Q46 51 37 39L30 81L24 86Z'
    ];
    return `<span class="plaza-avatar ${escape(className)}" aria-hidden="true"><svg viewBox="0 0 100 150" focusable="false"><ellipse cx="50" cy="141" rx="29" ry="5" fill="#315267" opacity=".13"/><path d="M40 121L39 137M59 121L61 137" stroke="#444453" stroke-width="11" stroke-linecap="round"/><path d="M32 139H44M58 139H70" stroke="#343b4b" stroke-width="9" stroke-linecap="round"/><path d="M34 98L25 117M67 98L76 117" stroke="${shirt}" stroke-width="12" stroke-linecap="round"/><circle cx="24" cy="119" r="6" fill="${skin}"/><circle cx="77" cy="119" r="6" fill="${skin}"/><path d="M36 92Q50 86 64 92L70 124Q50 133 30 124Z" fill="${shirt}"/><path d="M40 94Q50 102 60 94" fill="none" stroke="#fff" opacity=".35" stroke-width="3"/><path d="M44 83H56V94Q50 100 44 94Z" fill="${skin}"/><ellipse cx="25" cy="63" rx="6" ry="9" fill="${skin}"/><ellipse cx="75" cy="63" rx="6" ry="9" fill="${skin}"/><ellipse cx="50" cy="61" rx="25" ry="32" fill="${skin}"/><ellipse cx="37" cy="72" rx="5" ry="3" fill="#d96c70" opacity=".23"/><ellipse cx="63" cy="72" rx="5" ry="3" fill="#d96c70" opacity=".23"/><path d="M35 54Q40 51 45 54M55 54Q60 51 65 54" fill="none" stroke="${hair}" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="41" cy="61" rx="2.5" ry="3.5" fill="#2c2930"/><ellipse cx="59" cy="61" rx="2.5" ry="3.5" fill="#2c2930"/><path d="M49 63L47 69L52 69" fill="none" stroke="#81503a" opacity=".45" stroke-width="1.5" stroke-linecap="round"/><path d="M43 77Q50 84 58 76" fill="none" stroke="#663f38" stroke-width="2" stroke-linecap="round"/><path d="${hairstyles[number % 4]}" fill="${hair}"/>${number % 5 === 0 ? '<g fill="none" stroke="#48434b" stroke-width="1.8"><rect x="32" y="56" width="15" height="11" rx="4"/><rect x="53" y="56" width="15" height="11" rx="4"/><path d="M47 60H53"/></g>' : ''}</svg>${emoji ? `<span class="plaza-avatar-badge">${escape(emoji)}</span>` : ''}</span>`;
  }
  // Small, stable offsets keep movement inside each person's grid space.
  function walkingStyle(code, playerId, now = Date.now()) {
    const seed = seedFor(code, playerId), duration = 32000 + seed % 16000;
    const points = Array.from({ length: 4 }, (_, index) => {
      const point = hash(`${seed}:walk:${index}`);
      return `--walk-x${index}:${point % 17 - 8}px;--walk-y${index}:${(point >>> 8) % 9 - 4}px`;
    });
    return `${points.join(';')};--walk-duration:${duration}ms;--walk-delay:-${now % duration}ms`;
  }
  function latestSpeech(messages, person, now = Date.now()) {
    return (messages || []).filter(message => {
      const age = now - Number(message.ts);
      return message.text && age >= 0 && age < 14000 && (message.playerId
        ? message.playerId === person.id
        : String(message.playerName || '').trim().toLowerCase() === String(person.name || '').trim().toLowerCase());
    }).sort((a, b) => Number(b.ts) - Number(a.ts))[0] || null;
  }
  function status(room) {
    if (room.presenceStatus === 'full' || Number(room.participantCount) >= Number(room.maxParticipants || 24)) return 'full';
    return room.currentActivity ? 'in_game' : 'open';
  }
  function filterRooms(rooms, filter = 'all', query = '', activityLabels = {}) {
    const search = String(query).trim().toLowerCase();
    return rooms.filter(room => {
      const state = status(room);
      if (filter === 'open' && state !== 'open') return false;
      if (filter === 'playing' && state !== 'in_game') return false;
      if (filter === 'voice' && !room.voiceEnabled) return false;
      return !search || [room.title, room.host, room.description, room.code, activityLabels[room.currentActivity]?.label || room.currentActivity].some(value => String(value || '').toLowerCase().includes(search));
    }).sort((a, b) => ({ open: 0, in_game: 1, full: 2 }[status(a)] - { open: 0, in_game: 1, full: 2 }[status(b)]) || (Number(b.lastUpdate) || 0) - (Number(a.lastUpdate) || 0));
  }
  const scenes = [
    { id: 'plaza', label: 'Community plaza', icon: '⛲' },
    { id: 'tokyo', label: 'Tokyo night plaza', icon: '🌃' },
    { id: 'rustic', label: 'Rustic town square', icon: '🏘️' },
    { id: 'beach', label: 'Beach day', icon: '🏖️', surface: 'water' },
    { id: 'ocean', label: 'Ocean lagoon', icon: '🌊', surface: 'water' },
    { id: 'forest', label: 'Forest retreat', icon: '🌲', surface: 'grass' },
    { id: 'cafe', label: 'Cozy café', icon: '☕', surface: 'wood' },
    { id: 'space', label: 'Space station', icon: '🪐', surface: 'deck' }
  ];
  function movementFor(sceneId, code, playerId) {
    const scene = scenes.find(item => item.id === sceneId);
    if (scene?.surface === 'water') return seedFor(code, playerId) % 2 ? 'swim' : 'float';
    return sceneId === 'space' ? 'float' : 'walk';
  }
  function normalizeTheme(value) {
    const theme = value && typeof value === 'object' ? value : {};
    return {
      scene: scenes.some(scene => scene.id === theme.scene) ? theme.scene : 'plaza',
      name: String(theme.name || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      accent: /^#[0-9a-f]{6}$/i.test(theme.accent) ? theme.accent : '#37799b'
    };
  }
  function sceneAttributes(value) {
    const theme = normalizeTheme(value);
    return `data-plaza-scene="${theme.scene}" style="--plaza-accent:${theme.accent}"`;
  }
  const api = { avatar, seedFor, filterRooms, status, escape, scenes, normalizeTheme, sceneAttributes, walkingStyle, latestSpeech, movementFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderCommunityPlazaCore = api;
})(typeof window === 'undefined' ? globalThis : window);
