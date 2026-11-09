(function (root) {
  const OPTIONS = {
    type: ['person', 'robot', 'cat'], body: ['classic', 'slim', 'round', 'tall'],
    eyes: ['round', 'bright', 'happy', 'sleepy'], nose: ['button', 'small', 'wide'], mouth: ['smile', 'grin', 'small', 'wow'],
    hair: ['short', 'side', 'curly', 'long', 'bun', 'bald'], shirt: ['tee', 'stripes', 'hoodie', 'jacket'],
    pants: ['straight', 'shorts', 'wide'], shoes: ['sneakers', 'boots', 'slipons'], hands: ['relaxed', 'wave', 'peace', 'mittens'],
    hat: ['none', 'cap', 'beanie', 'crown'], accessories: ['none', 'glasses', 'sunglasses', 'earrings', 'headphones', 'scarf'],
    background: ['none', 'sky', 'mint', 'sunset', 'lavender', 'confetti']
  };
  const PALETTES = {
    skinColor: ['#f4c5a0', '#f8dbbf', '#dba77e', '#b87d57', '#895636', '#603d2d', '#89b9cf', '#a7c79a'],
    eyeColor: ['#37313b', '#42699b', '#50755e', '#8a603e', '#8c6ab1'],
    hairColor: ['#362c31', '#6b4630', '#a66535', '#d8b56c', '#d5d8de', '#c686ac', '#689aa7', '#9070be'],
    shirtColor: ['#7cb9cf', '#c787a3', '#e6ad5d', '#80b69e', '#9592c9', '#cb876e', '#f0e8d7', '#394b67'],
    pantsColor: ['#435673', '#66556e', '#55776a', '#b59a72', '#363941', '#d5dce2'],
    shoesColor: ['#f0eee6', '#343b4b', '#9d6657', '#5d8795', '#b99a54', '#ce88a0'],
    hatColor: ['#7598bb', '#b87f9e', '#d4b45f', '#648c7a', '#e8d7be', '#525265'],
    accessoryColor: ['#53495f', '#c59743', '#759aa3', '#b96e76', '#c4c5ce', '#5c816e'],
    backgroundColor: ['#e7f2fa', '#e5f1e6', '#fbecd9', '#eee6f4', '#f8e5e9', '#e5eded']
  };
  const DEFAULT = { version: 1, type: 'person', body: 'classic', eyes: 'round', nose: 'button', mouth: 'smile', hair: 'side', shirt: 'tee', pants: 'straight', shoes: 'sneakers', hands: 'relaxed', hat: 'none', accessories: 'none', background: 'sky' };
  Object.entries(PALETTES).forEach(([key, values]) => { DEFAULT[key] = values[0]; });
  function normalize(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const result = { ...DEFAULT };
    for (const [key, choices] of Object.entries(OPTIONS)) if (choices.includes(source[key])) result[key] = source[key];
    for (const key of Object.keys(PALETTES)) if (typeof source[key] === 'string' && /^#[0-9a-f]{6}$/i.test(source[key])) result[key] = source[key].toLowerCase();
    return result;
  }
  function randomize(random = Math.random) {
    const result = { ...DEFAULT };
    const pick = list => list[Math.max(0, Math.min(list.length - 1, Math.floor(random() * list.length)))];
    for (const [key, choices] of Object.entries(OPTIONS)) result[key] = pick(choices);
    for (const [key, choices] of Object.entries(PALETTES)) result[key] = pick(choices);
    return result;
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function render(raw, emoji = '', className = '') {
    const c = normalize(raw), skin = c.skinColor, hair = c.hairColor;
    const width = { classic: 24, slim: 18, round: 31, tall: 22 }[c.body];
    const top = 113, bottom = c.body === 'tall' ? 158 : 164, shoeY = c.shoes === 'boots' ? 180 : 186;
    const background = c.background === 'none' ? '' : `<rect x="2" y="2" width="156" height="202" rx="35" fill="${c.backgroundColor}"/>${c.background === 'sky' ? '<path d="M15 47Q14 37 27 37Q29 22 43 31Q60 27 59 45Z" fill="white" opacity=".7"/><circle cx="132" cy="31" r="12" fill="#fff9da" opacity=".8"/>' : c.background === 'mint' ? '<path d="M3 164Q45 117 89 157Q130 114 158 148V170H3Z" fill="#afcebb" opacity=".5"/>' : c.background === 'sunset' ? '<circle cx="118" cy="69" r="32" fill="#f1c999" opacity=".65"/><path d="M3 164Q50 137 158 159" stroke="#d9a787" stroke-width="8" opacity=".3"/>' : c.background === 'lavender' ? '<circle cx="34" cy="42" r="18" fill="#b8a3d1" opacity=".3"/><circle cx="139" cy="130" r="23" fill="#cbb9dc" opacity=".3"/>' : '<g fill="#c8a762"><circle cx="24" cy="35" r="3"/><circle cx="137" cy="69" r="3"/><path d="M21 127l5-8 3 9M126 25l4-7 3 8"/></g><g fill="#b393bd"><path d="M27 74l5-3 3 5-5 3M130 115l5-3 3 5-5 3"/></g>'}`;
    const hands = c.hands === 'wave' || c.hands === 'peace'
      ? `<path d="M${80 + width - 2} 120Q126 114 129 88" fill="none" stroke="${c.shirtColor}" stroke-width="12" stroke-linecap="round"/><circle cx="130" cy="83" r="7" fill="${skin}"/>${c.hands === 'peace' ? `<path d="M127 81L124 69M132 81L137 70" stroke="${skin}" stroke-width="5" stroke-linecap="round"/>` : `<path d="M127 81L122 73M131 79L131 69M135 82L140 76" stroke="${skin}" stroke-width="4" stroke-linecap="round"/>`}`
      : `<path d="M${80 + width - 2} 120L${80 + width + 10} 152" stroke="${c.shirtColor}" stroke-width="12" stroke-linecap="round"/><circle cx="${80 + width + 11}" cy="156" r="7" fill="${c.hands === 'mittens' ? c.accessoryColor : skin}"/>`;
    const pants = c.pants === 'shorts' ? `<path d="M${80 - width + 2} ${bottom - 8}H${80 + width - 2}L${80 + width - 2} 175H83V168H77V175H${80 - width + 2}Z" fill="${c.pantsColor}"/><path d="M68 175V185M92 175V185" stroke="${skin}" stroke-width="12"/>` : `<path d="M${80 - width + 2} ${bottom - 9}H${80 + width - 2}L${c.pants === 'wide' ? 104 : 99} 190H85L80 170L75 190H${c.pants === 'wide' ? 56 : 61}Z" fill="${c.pantsColor}"/>`;
    const eye = x => c.eyes === 'happy' ? `<path d="M${x - 5} 75Q${x} 68 ${x + 5} 75" fill="none" stroke="${c.eyeColor}" stroke-width="3" stroke-linecap="round"/>` : c.eyes === 'sleepy' ? `<path d="M${x - 5} 73H${x + 5}" stroke="${c.eyeColor}" stroke-width="3"/><ellipse cx="${x}" cy="76" rx="2.7" ry="3" fill="${c.eyeColor}"/>` : `<ellipse cx="${x}" cy="74" rx="${c.eyes === 'bright' ? 4.5 : 3}" ry="${c.eyes === 'bright' ? 6 : 4}" fill="${c.eyeColor}"/>${c.eyes === 'bright' ? `<circle cx="${x - 1}" cy="72" r="1.6" fill="white"/>` : ''}`;
    const mouths = { smile: '<path d="M69 94Q80 105 92 93" fill="none" stroke="#744943" stroke-width="2.6" stroke-linecap="round"/>', grin: '<path d="M68 92Q80 112 93 92Z" fill="#714844"/><path d="M71 93H90" stroke="white" stroke-width="4"/>', small: '<path d="M75 96H86" stroke="#744943" stroke-width="2.5" stroke-linecap="round"/>', wow: '<ellipse cx="80" cy="97" rx="5" ry="7" fill="#744943"/>' };
    const hairs = { short: 'M47 65Q39 27 77 27Q120 24 113 66L103 50Q78 57 59 46Z', side: 'M46 74Q32 24 77 25Q122 19 114 76L105 61L103 42Q80 59 57 46L55 78Z', curly: 'M46 67Q34 56 43 44Q36 31 54 29Q54 14 70 23Q82 11 94 24Q111 14 116 32Q131 39 119 51Q127 66 111 69L103 50L57 51Z', long: 'M46 80Q28 22 78 23Q132 19 117 93L123 124L105 124L102 57Q80 55 62 39L57 118L38 118Z', bun: 'M48 65Q36 27 77 27Q122 24 113 68L105 49Q80 56 57 46ZM64 29Q54 6 77 6Q106 3 98 29Z', bald: '' };
    const hats = { none: '', cap: `<path d="M43 51Q45 15 80 15Q113 15 116 51Z" fill="${c.hatColor}"/><path d="M43 50Q79 42 126 50Q129 61 104 58L43 58Z" fill="${c.hatColor}" stroke="#000" stroke-opacity=".1"/>`, beanie: `<path d="M44 53Q43 12 80 13Q118 12 117 53Z" fill="${c.hatColor}"/><rect x="42" y="45" width="77" height="14" rx="5" fill="${c.hatColor}" stroke="white" stroke-opacity=".25"/><circle cx="81" cy="12" r="9" fill="${c.hatColor}"/>`, crown: `<path d="M48 47L43 18L63 31L80 12L98 31L117 18L111 47Z" fill="${c.hatColor}" stroke="#a37c3c" stroke-width="2"/><circle cx="80" cy="35" r="4" fill="#e08e9e"/>` };
    const accessories = { none: '', glasses: `<g fill="none" stroke="${c.accessoryColor}" stroke-width="2.7"><rect x="55" y="66" width="20" height="16" rx="5"/><rect x="85" y="66" width="20" height="16" rx="5"/><path d="M75 72H85"/></g>`, sunglasses: `<g fill="${c.accessoryColor}" stroke="${c.accessoryColor}" stroke-width="3"><rect x="54" y="66" width="22" height="16" rx="5"/><rect x="84" y="66" width="22" height="16" rx="5"/><path d="M76 72H84"/></g><path d="M59 70L66 75M90 70L97 75" stroke="white" opacity=".45" stroke-width="2"/>`, earrings: `<g fill="none" stroke="${c.accessoryColor}" stroke-width="3"><ellipse cx="44" cy="89" rx="4" ry="7"/><ellipse cx="116" cy="89" rx="4" ry="7"/></g>`, headphones: `<path d="M41 78V59Q44 19 80 20Q117 18 120 59V78" fill="none" stroke="${c.accessoryColor}" stroke-width="8"/><rect x="36" y="65" width="11" height="24" rx="5" fill="${c.accessoryColor}"/><rect x="113" y="65" width="11" height="24" rx="5" fill="${c.accessoryColor}"/>`, scarf: `<path d="M63 108Q80 120 98 108V119Q83 129 63 118ZM84 121L102 151L90 156L76 122Z" fill="${c.accessoryColor}"/>` };
    const face = c.type === 'robot' ? `<rect x="45" y="35" width="70" height="71" rx="17" fill="${skin}" stroke="#52667b" stroke-opacity=".25" stroke-width="2"/><path d="M80 35V20" stroke="${c.accessoryColor}" stroke-width="4"/><circle cx="80" cy="17" r="5" fill="${c.hatColor}"/><path d="M54 91H59M101 91H106" stroke="white" opacity=".6" stroke-width="3"/>` : `<ellipse cx="45" cy="76" rx="7" ry="10" fill="${skin}"/><ellipse cx="115" cy="76" rx="7" ry="10" fill="${skin}"/>${c.type === 'cat' ? `<path d="M46 56L43 23L67 39M94 39L117 23L114 58" fill="${skin}"/><path d="M49 45L48 33L60 42M100 43L112 33L110 47" fill="#d99c9e"/>` : ''}<ellipse cx="80" cy="70" rx="34" ry="41" fill="${skin}"/><ellipse cx="61" cy="88" rx="6" ry="3" fill="#d96c70" opacity=".2"/><ellipse cx="100" cy="88" rx="6" ry="3" fill="#d96c70" opacity=".2"/>`;
    const nose = c.nose === 'small' ? '<path d="M80 78L77 86L83 86" fill="none" stroke="#8e6251" stroke-width="1.8" opacity=".6"/>' : c.nose === 'wide' ? '<ellipse cx="80" cy="85" rx="7" ry="4" fill="#855846" opacity=".45"/>' : '<ellipse cx="80" cy="84" rx="4" ry="3.5" fill="#a27159" opacity=".4"/>';
    return `<span class="plaza-avatar character-avatar ${escape(className)}" aria-hidden="true"><svg viewBox="0 0 160 210" focusable="false">${background}<ellipse cx="80" cy="197" rx="37" ry="5" fill="#315267" opacity=".13"/>${pants}<path d="M57 ${shoeY}H75V195H54Q50 190 57 ${shoeY}ZM86 ${shoeY}H102Q111 189 108 195H85Z" fill="${c.shoesColor}"/>${c.shoes === 'sneakers' ? '<path d="M57 188H72M89 188H103" stroke="white" opacity=".6" stroke-width="2"/>' : ''}<path d="M${80 - width + 2} 120L${80 - width - 10} 152" stroke="${c.shirtColor}" stroke-width="12" stroke-linecap="round"/><circle cx="${80 - width - 11}" cy="156" r="7" fill="${c.hands === 'mittens' ? c.accessoryColor : skin}"/>${hands}<path d="M${80 - width} ${top}Q80 104 ${80 + width} ${top}L${80 + width + 4} ${bottom}Q80 ${bottom + 9} ${80 - width - 4} ${bottom}Z" fill="${c.shirtColor}"/>${c.shirt === 'stripes' ? `<path d="M${80 - width} 129H${80 + width}M${80 - width - 1} 142H${80 + width + 1}M${80 - width - 2} 155H${80 + width + 2}" stroke="white" opacity=".38" stroke-width="5"/>` : c.shirt === 'hoodie' ? '<path d="M68 117L72 135M92 117L88 135M66 146Q80 154 96 146L94 157H68Z" fill="none" stroke="white" opacity=".32" stroke-width="2"/>' : c.shirt === 'jacket' ? '<path d="M69 112L78 129L80 162L83 129L93 112" fill="none" stroke="white" opacity=".5" stroke-width="3"/>' : '<path d="M67 114Q80 124 94 114" fill="none" stroke="white" opacity=".4" stroke-width="3"/>'}<path d="M72 103H88V116Q80 122 72 116Z" fill="${skin}"/>${face}<path d="M60 64Q67 60 74 63M87 63Q94 60 101 64" fill="none" stroke="${hair}" stroke-width="2" stroke-linecap="round"/>${eye(67)}${eye(93)}${nose}${mouths[c.mouth]}${c.type === 'cat' ? '<path d="M55 86L34 81M55 91L32 93M105 86L126 81M105 91L128 93" stroke="#786252" opacity=".5" stroke-width="1.5"/>' : ''}<path d="${hairs[c.hair]}" fill="${hair}"/>${hats[c.hat]}${accessories[c.accessories]}</svg>${emoji ? `<span class="plaza-avatar-badge">${escape(emoji)}</span>` : ''}</span>`;
  }
  const api = { OPTIONS, PALETTES, DEFAULT, normalize, randomize, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderCharacter = api;
})(typeof window === 'undefined' ? globalThis : window);
