(function (root) {
  const C = root.TeamBuilderCharacter;
  const ui = { draft: null, tab: 'character', busy: false };
  const labels = { type: 'Character type', body: 'Body', head: 'Head & face shape', style: 'Visual style', eyebrows: 'Eyebrows', features: 'Face details', facialHair: 'Facial hair', skinColor: 'Skin, fur or shell color', eyes: 'Eyes', eyeColor: 'Eye color', nose: 'Nose', mouth: 'Mouth', hair: 'Hair type', hairColor: 'Hair color', shirt: 'Shirt', shirtColor: 'Shirt color', pants: 'Pants', pantsColor: 'Pants color', shoes: 'Shoes', shoesColor: 'Shoe color', hands: 'Hands', hat: 'Hat', hatColor: 'Hat color', accessories: 'Accessories', accessoryColor: 'Accessory color', background: 'Background', backgroundColor: 'Background color' };
  const tabs = { character: { label: 'Character', icon: '✦', fields: ['type', 'body', 'skinColor', 'style'] }, face: { label: 'Face', icon: '☺', fields: ['head', 'eyes', 'eyeColor', 'eyebrows', 'nose', 'mouth'] }, details: { label: 'Details', icon: '✧', fields: ['features', 'facialHair'] }, hair: { label: 'Hair', icon: '〰', fields: ['hair', 'hairColor'] }, outfit: { label: 'Outfit', icon: '♧', fields: ['shirt', 'shirtColor', 'pants', 'pantsColor', 'shoes', 'shoesColor'] }, extras: { label: 'Extras', icon: '☆', fields: ['hands', 'hat', 'hatColor', 'accessories', 'accessoryColor'] }, scene: { label: 'Background', icon: '☀', fields: ['background', 'backgroundColor'] } };
  const names = { person: 'Person', robot: 'Robot', cat: 'Cat', side: 'Side sweep', curly: 'Curls', bun: 'Top knot', bald: 'No hair', tee: 'T-shirt', slipons: 'Slip-ons', none: 'None', oval: 'Oval', natural: 'Natural', beautySpot: 'Beauty spot', facePaint: 'Face paint', rosy: 'Rosy cheeks', roundGlasses: 'Round glasses', hearingAid: 'Hearing aid', locs: 'Locs', collared: 'Collared shirt', classic: 'Classic', pastel: 'Soft pastel', vivid: 'Vivid', monochrome: 'Monochrome' };
  const title = value => names[value] || value[0].toUpperCase() + value.slice(1).replace(/([A-Z])/g, ' $1');
  function escape(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function open() {
    if (!APP.player) return;
    ui.draft = C.normalize(APP.player.character); ui.tab = 'character'; ui.busy = false;
    APP.characterEditorOpen = true; document.activeElement?.blur(); render();
  }
  function close() { if (ui.busy) return; APP.characterEditorOpen = false; ui.draft = null; render(); }
  function paint() {
    const preview = document.getElementById('characterPreview');
    if (preview) { preview.innerHTML = C.render(ui.draft, APP.player.avatar); preview.setAttribute('aria-label', `${title(ui.draft.type)} character preview`); }
    document.querySelectorAll('[data-char-field]').forEach(button => {
      const selected = ui.draft[button.dataset.charField] === button.dataset.charValue;
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-character-color]').forEach(input => { input.value = ui.draft[input.dataset.characterColor]; });
    document.querySelectorAll('[data-character-hex]').forEach(label => { label.textContent = ui.draft[label.dataset.characterHex].toUpperCase(); });
    const status = document.getElementById('characterStatus'); if (status) status.textContent = 'Preview updated. Save when it feels like you.';
  }
  function choose(field, value) {
    if (ui.busy || !APP.characterEditorOpen || !Object.hasOwn(C.OPTIONS, field) && !Object.hasOwn(C.PALETTES, field)) return;
    ui.draft = C.normalize({ ...ui.draft, [field]: value }); paint();
  }
  function field(key) {
    const value = ui.draft[key];
    if (C.PALETTES[key]) return `<fieldset class="character-field" ${ui.busy ? 'disabled' : ''}><legend>${labels[key]}</legend><div class="character-colors">${C.PALETTES[key].map(color => `<button class="character-swatch" style="--swatch:${color}" data-action="character-choose" data-char-field="${key}" data-char-value="${color}" aria-label="${labels[key]} ${color}" aria-pressed="${value === color}"></button>`).join('')}<label class="character-custom-color"><input type="color" data-character-color="${key}" value="${value}" aria-label="Custom ${labels[key].toLowerCase()}"><span>Custom</span></label></div><span class="character-hex" data-character-hex="${key}">${value.toUpperCase()}</span></fieldset>`;
    return `<fieldset class="character-field" ${ui.busy ? 'disabled' : ''}><legend>${labels[key]}</legend><div class="character-options">${C.OPTIONS[key].map(option => `<button class="character-option" data-action="character-choose" data-char-field="${key}" data-char-value="${option}" aria-pressed="${value === option}">${key === 'type' ? `<span aria-hidden="true">${{ person: '🧑', robot: '🤖', cat: '🐱' }[option]}</span>` : ''}${title(option)}</button>`).join('')}</div></fieldset>`;
  }
  function renderEditor() {
    ui.draft ||= C.normalize(APP.player.character);
    return `<section class="character-studio" aria-label="Character creator"><header class="character-heading"><div><p class="character-kicker">A little character. A lot of you.</p><h1>Create your character</h1><p>Start with a type. Make every little detail your own.</p></div><button class="character-close" data-action="character-cancel" ${ui.busy ? 'disabled' : ''}>← Back</button></header><div class="character-layout"><aside class="character-preview-panel"><div class="character-preview-label">LIVE PREVIEW <span aria-hidden="true">✦</span></div><div id="characterPreview" class="character-preview" role="img" aria-label="${title(ui.draft.type)} character preview">${C.render(ui.draft, APP.player.avatar)}</div><h2>${escape(APP.player.name)}</h2><p>Your next hello starts here.</p><button class="character-surprise" data-action="character-surprise" ${ui.busy ? 'disabled' : ''}><span aria-hidden="true">⚄</span> Surprise me</button><p id="characterStatus" class="character-status" role="status" aria-live="polite">Try a few looks. Your changes stay in preview until you save.</p></aside><div class="character-controls"><nav class="character-tabs" aria-label="Character categories">${Object.entries(tabs).map(([key, tab]) => `<button data-action="character-tab" data-category="${key}" aria-pressed="${ui.tab === key}" ${ui.busy ? 'disabled' : ''}><span aria-hidden="true">${tab.icon}</span>${tab.label}</button>`).join('')}</nav><div class="character-fields" aria-label="${tabs[ui.tab].label} options"><h2>${tabs[ui.tab].label}</h2>${tabs[ui.tab].fields.map(field).join('')}</div><footer class="character-save-bar"><span>Looking good? Make it yours.</span><div><button class="character-secondary" data-action="character-cancel" ${ui.busy ? 'disabled' : ''}>Cancel</button><button class="character-save" data-action="character-save" ${ui.busy ? 'disabled aria-busy="true"' : ''}>${ui.busy ? 'Saving…' : 'Save character'} <span aria-hidden="true">→</span></button></div></footer></div></div></section>`;
  }
  async function save() {
    if (ui.busy || !APP.player || !ui.draft) return;
    const character = C.normalize(ui.draft);
    ui.busy = true; document.activeElement?.blur(); render();
    try {
      if (APP.roomCode) {
        const key = `room:${APP.roomCode}`;
        const response = await socketEmitAck('room:character', { key, ...getSharedActorPayload(key), authToken: APP.roomAccessToken || '', character }, 5000);
        if (response.value) APP.room = normalizeRoom(JSON.parse(response.value));
      }
      const profile = { ...APP.player, character };
      const saved = await Storage.set('player-profile', JSON.stringify(profile), false);
      if (!saved) throw new Error('Your character couldn’t be saved on this device. Please try again.');
      APP.player = profile;
      if (APP.roomCode) persistActiveSessionSnapshot();
      APP.characterEditorOpen = false; ui.draft = null;
    } catch (error) { showError(error.message); }
    finally { ui.busy = false; render(); }
  }
  const registry = root.TEAM_BUILDER_ACTIVITY_REGISTRY;
  registry.registerAction('open-character-creator', open);
  registry.registerAction('character-cancel', close);
  registry.registerAction('character-tab', ({ dataset }) => { if (!ui.busy && tabs[dataset.category]) { ui.tab = dataset.category; render(); document.querySelector(`[data-action="character-tab"][data-category="${ui.tab}"]`)?.focus({ preventScroll: true }); } });
  registry.registerAction('character-choose', ({ dataset }) => choose(dataset.charField, dataset.charValue));
  registry.registerAction('character-surprise', () => { if (ui.busy) return; ui.draft = C.randomize(); render(); document.querySelector('[data-action=character-surprise]')?.focus({ preventScroll: true }); const status = document.getElementById('characterStatus'); if (status) status.textContent = 'A fresh look! Keep tweaking, or save this character.'; });
  registry.registerAction('character-save', save);
  document.addEventListener('input', event => { if (event.target.dataset?.characterColor) choose(event.target.dataset.characterColor, event.target.value); });
  root.TeamBuilderCharacterEditor = { render: renderEditor };
})(window);
