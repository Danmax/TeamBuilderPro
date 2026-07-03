function getDefaultSlidesStudioUiState() {
  return {
    aiPrompt: '',
    aiCount: 5,
    generateExpanded: true,
    editorExpanded: true
  };
}

function cloneSlidesStudioStaticData(key, fallback) {
  const source = window.TEAM_BUILDER_STATIC_DATA || {};
  const value = source[key];
  if (value === undefined) return fallback;
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return fallback;
    }
  }
  return value;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeHexColor(value, fallback = '#0f172a') {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

const SLIDES_STUDIO_TEMPLATE_OPTIONS = cloneSlidesStudioStaticData('SLIDES_STUDIO_TEMPLATE_OPTIONS', []);

function normalizeSlidesStudioTemplate(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SLIDES_STUDIO_TEMPLATE_OPTIONS.some(option => option.id === normalized) ? normalized : 'hero';
}

function getSlidesStudioTemplateMeta(value) {
  const normalized = normalizeSlidesStudioTemplate(value);
  return SLIDES_STUDIO_TEMPLATE_OPTIONS.find(option => option.id === normalized) || SLIDES_STUDIO_TEMPLATE_OPTIONS[0];
}

function normalizeSlidesStudioTextField(source, key, fallback = '') {
  const hasOwn = source && Object.prototype.hasOwnProperty.call(source, key);
  const rawValue = hasOwn ? source[key] : fallback;
  return String(rawValue || '').replace(/\s+/g, ' ').trim();
}

function normalizeSlidesStudioParagraphField(source, key, fallback = '') {
  const hasOwn = source && Object.prototype.hasOwnProperty.call(source, key);
  const rawValue = hasOwn ? source[key] : fallback;
  return String(rawValue || '').replace(/\r/g, '').trim();
}

function getSlidesStudioDescriptionItems(value) {
  return String(value || '')
    .split('\n')
    .map(line => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);
}

function validateAISlidesStudioSlides(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item && typeof item === 'object')
    .map((item, index) => createSlidesStudioSlide(index, {
      tag: item.tag || '',
      tagPosition: item.tagPosition || 'top',
      title: item.title || '',
      subtitle: item.subtitle || '',
      description: item.description || '',
      template: item.template || 'hero',
      contentVertical: item.contentVertical || 'bottom',
      contentHorizontal: item.contentHorizontal || 'left',
      backgroundMode: item.backgroundMode || 'gradient',
      solidColor: item.solidColor || '#111827',
      gradientFrom: item.gradientFrom || '#4f46e5',
      gradientTo: item.gradientTo || '#0ea5e9',
      backgroundImageUrl: item.backgroundImageUrl || '',
      imageStyle: item.imageStyle || 'background',
      imageRadius: item.imageRadius,
      imageFade: item.imageFade,
      buttonLabel: item.buttonLabel || '',
      buttonUrl: item.buttonUrl || '',
      sourceLabel: item.sourceLabel || '',
      sourceUrl: item.sourceUrl || ''
    }))
    .filter(slide => slide.title || slide.subtitle || slide.description || slide.backgroundImageUrl)
    .slice(0, 12);
}

function buildAISlidesStudioPrompt(promptText, count = 5) {
  const slideCount = Math.max(3, Math.min(10, Number(count) || 5));
  const topic = normalizeTopic(promptText || 'team presentation') || 'team presentation';
  const templateList = SLIDES_STUDIO_TEMPLATE_OPTIONS.map(option => option.id).join(', ');
  return `Create ${slideCount} presentation slides for this topic: "${topic}".
Return only valid JSON as an array of slide objects.

Each object may include:
{
  "tag": "short optional tag",
  "tagPosition": "top or bottom",
  "title": "slide heading",
  "subtitle": "short optional subtitle",
  "description": "1 to 4 short lines separated by \\n",
  "template": "one of: ${templateList}",
  "contentVertical": "top, center, or bottom",
  "contentHorizontal": "left, center, or right",
  "backgroundMode": "gradient or solid",
  "solidColor": "#112233",
  "gradientFrom": "#112233",
  "gradientTo": "#445566",
  "backgroundImageUrl": "",
  "imageStyle": "background or card",
  "imageRadius": 24,
  "imageFade": 68,
  "buttonLabel": "",
  "buttonUrl": "",
  "sourceLabel": "",
  "sourceUrl": ""
}

Rules:
- Make the deck presentation-ready and varied across slides.
- Use different templates when appropriate.
- Keep colors visually strong and readable.
- Leave URL fields empty unless a source or CTA is clearly useful.
- Output strict JSON only with no markdown fences.`;
}

function normalizeSlidesStudioChoice(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeSlidesStudioUrl(value) {
  const raw = String(value || '').trim().slice(0, 1400);
  if (!raw) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`;
  return '';
}

function createSlidesStudioSlide(index = 0, source = {}) {
  const safeIndex = Number(index) || 0;
  const title = normalizeSlidesStudioTextField(source, 'title', `Slide ${safeIndex + 1}`).slice(0, 80);
  const subtitle = normalizeSlidesStudioTextField(source, 'subtitle', '').slice(0, 120);
  const description = normalizeSlidesStudioParagraphField(source, 'description', '').slice(0, 600);
  return {
    id: String(source.id || `slide-${Date.now().toString(36)}-${randomAlphaNum(6).toLowerCase()}`),
    tag: normalizeSlidesStudioTextField(source, 'tag', '').slice(0, 40),
    tagPosition: normalizeSlidesStudioChoice(source.tagPosition, ['top', 'bottom'], 'top'),
    title,
    subtitle,
    description,
    template: normalizeSlidesStudioTemplate(source.template),
    contentVertical: normalizeSlidesStudioChoice(source.contentVertical, ['top', 'center', 'bottom'], 'bottom'),
    contentHorizontal: normalizeSlidesStudioChoice(source.contentHorizontal, ['left', 'center', 'right'], 'left'),
    backgroundMode: String(source.backgroundMode || '').trim().toLowerCase() === 'solid' ? 'solid' : 'gradient',
    solidColor: normalizeHexColor(source.solidColor, '#111827'),
    gradientFrom: normalizeHexColor(source.gradientFrom, '#4f46e5'),
    gradientTo: normalizeHexColor(source.gradientTo, '#0ea5e9'),
    backgroundImageUrl: String(source.backgroundImageUrl || '').trim().slice(0, 1400),
    imageStyle: String(source.imageStyle || '').trim().toLowerCase() === 'card' ? 'card' : 'background',
    imageRadius: clampNumber(source.imageRadius, 0, 48, 24),
    imageFade: clampNumber(source.imageFade, 0, 90, 68),
    buttonLabel: normalizeSlidesStudioTextField(source, 'buttonLabel', '').slice(0, 32),
    buttonUrl: normalizeSlidesStudioUrl(source.buttonUrl),
    sourceLabel: normalizeSlidesStudioTextField(source, 'sourceLabel', '').slice(0, 40),
    sourceUrl: normalizeSlidesStudioUrl(source.sourceUrl)
  };
}

function normalizeSlidesStudioState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const slides = Array.isArray(source.slides) && source.slides.length
    ? source.slides.map((slide, index) => createSlidesStudioSlide(index, slide))
    : [createSlidesStudioSlide(0)];
  let activeSlideId = String(source.activeSlideId || '').trim();
  if (!slides.some(slide => slide.id === activeSlideId)) activeSlideId = slides[0].id;
  return {
    title: normalizeTopic(source.title || 'Slides Studio') || 'Slides Studio',
    slides,
    activeSlideId,
    startedAt: Number(source.startedAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now()
  };
}

function createSlidesStudioState() {
  return normalizeSlidesStudioState({
    title: 'Slides Studio',
    slides: [
      {
        template: 'hero',
        title: 'Kickoff the room',
        subtitle: 'Build a quick presentation together inside Team Builder',
        description: 'Use solid colors or gradients, add a background image, then tune the image radius and bottom fade.\nCreate multiple slides and present them live to everyone in the room.',
        tag: 'Welcome',
        tagPosition: 'top',
        backgroundMode: 'gradient',
        gradientFrom: '#0f172a',
        gradientTo: '#7c3aed',
        solidColor: '#111827',
        contentVertical: 'bottom',
        contentHorizontal: 'left',
        imageStyle: 'background',
        imageRadius: 24,
        imageFade: 72,
        buttonLabel: 'Open Agenda',
        buttonUrl: 'https://example.com',
        sourceLabel: 'Source deck',
        sourceUrl: 'https://example.com'
      }
    ],
    startedAt: Date.now(),
    updatedAt: Date.now()
  });
}

function getSlidesStudioActiveSlideIndex(state) {
  const normalized = normalizeSlidesStudioState(state);
  const idx = normalized.slides.findIndex(slide => slide.id === normalized.activeSlideId);
  return idx >= 0 ? idx : 0;
}

function getSlidesStudioActiveSlide(state) {
  const normalized = normalizeSlidesStudioState(state);
  return normalized.slides[getSlidesStudioActiveSlideIndex(normalized)] || normalized.slides[0];
}

function formatSlidesStudioText(value) {
  return escapeHtml(String(value || '').trim()).replace(/\n+/g, '<br>');
}

async function updateSlidesStudioState(mutator) {
  if (!APP.roomCode || !APP.room) return null;
  const room = await RoomManager.loadRoom(APP.roomCode);
  if (!room || room.currentActivity !== 'slides-studio') return null;
  if (room.host !== APP.player?.name) return room;
  const nextState = normalizeSlidesStudioState(room.activityState);
  if (typeof mutator === 'function') mutator(nextState);
  const normalized = normalizeSlidesStudioState({
    ...nextState,
    updatedAt: Date.now()
  });
  room.activityState = normalized;
  await RoomManager.updateRoom(APP.roomCode, room);
  APP.room = room;
  render();
  return room;
}

async function slidesStudioSelectSlide(slideId) {
  const requestedId = String(slideId || '').trim();
  if (!requestedId) return;
  await updateSlidesStudioState(state => {
    if (state.slides.some(slide => slide.id === requestedId)) {
      state.activeSlideId = requestedId;
    }
  });
}

async function slidesStudioAddSlide() {
  await updateSlidesStudioState(state => {
    const newSlide = createSlidesStudioSlide(state.slides.length, {
      template: 'hero',
      title: `Slide ${state.slides.length + 1}`,
      subtitle: 'New slide subtitle',
      description: 'Add a short description or talking points for this slide.',
      tag: '',
      tagPosition: 'top',
      backgroundMode: 'gradient',
      gradientFrom: '#1d4ed8',
      gradientTo: '#7c3aed',
      solidColor: '#111827',
      contentVertical: 'bottom',
      contentHorizontal: 'left',
      imageStyle: 'background',
      imageRadius: 24,
      imageFade: 68,
      buttonLabel: '',
      buttonUrl: '',
      sourceLabel: '',
      sourceUrl: ''
    });
    state.slides.push(newSlide);
    state.activeSlideId = newSlide.id;
  });
}

async function slidesStudioDuplicateSlide(slideId) {
  const requestedId = String(slideId || '').trim();
  await updateSlidesStudioState(state => {
    const idx = state.slides.findIndex(slide => slide.id === requestedId);
    if (idx < 0) return;
    const source = state.slides[idx];
    const duplicate = createSlidesStudioSlide(idx + 1, {
      ...source,
      id: '',
      title: source.title ? `${source.title} Copy` : ''
    });
    state.slides.splice(idx + 1, 0, duplicate);
    state.activeSlideId = duplicate.id;
  });
}

async function slidesStudioRemoveSlide(slideId) {
  const requestedId = String(slideId || '').trim();
  await updateSlidesStudioState(state => {
    if (state.slides.length <= 1) {
      state.slides = [createSlidesStudioSlide(0)];
      state.activeSlideId = state.slides[0].id;
      return;
    }
    const idx = state.slides.findIndex(slide => slide.id === requestedId);
    if (idx < 0) return;
    state.slides.splice(idx, 1);
    const nextIdx = Math.max(0, Math.min(idx, state.slides.length - 1));
    state.activeSlideId = state.slides[nextIdx]?.id || state.slides[0].id;
  });
}

async function slidesStudioNavigate(delta = 0) {
  const step = Number(delta) || 0;
  if (!step) return;
  await updateSlidesStudioState(state => {
    const currentIndex = getSlidesStudioActiveSlideIndex(state);
    const nextIndex = Math.max(0, Math.min(state.slides.length - 1, currentIndex + step));
    state.activeSlideId = state.slides[nextIndex]?.id || state.activeSlideId;
  });
}

async function slidesStudioSaveCurrentSlide() {
  const deckTitle = normalizeTopic(document.getElementById('slidesStudioDeckTitle')?.value || 'Slides Studio') || 'Slides Studio';
  const title = String(document.getElementById('slidesStudioSlideTitle')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const subtitle = String(document.getElementById('slidesStudioSlideSubtitle')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const description = String(document.getElementById('slidesStudioSlideDescription')?.value || '').replace(/\r/g, '').trim().slice(0, 600);
  const tag = String(document.getElementById('slidesStudioSlideTag')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const tagPosition = normalizeSlidesStudioChoice(document.getElementById('slidesStudioTagPosition')?.value || 'top', ['top', 'bottom'], 'top');
  const template = normalizeSlidesStudioTemplate(document.getElementById('slidesStudioTemplate')?.value || 'hero');
  const contentVertical = normalizeSlidesStudioChoice(document.getElementById('slidesStudioContentVertical')?.value || 'bottom', ['top', 'center', 'bottom'], 'bottom');
  const contentHorizontal = normalizeSlidesStudioChoice(document.getElementById('slidesStudioContentHorizontal')?.value || 'left', ['left', 'center', 'right'], 'left');
  const backgroundMode = String(document.getElementById('slidesStudioBackgroundMode')?.value || '').trim().toLowerCase() === 'solid' ? 'solid' : 'gradient';
  const solidColor = normalizeHexColor(document.getElementById('slidesStudioSolidColor')?.value, '#111827');
  const gradientFrom = normalizeHexColor(document.getElementById('slidesStudioGradientFrom')?.value, '#4f46e5');
  const gradientTo = normalizeHexColor(document.getElementById('slidesStudioGradientTo')?.value, '#0ea5e9');
  const backgroundImageUrl = String(document.getElementById('slidesStudioBackgroundImageUrl')?.value || '').trim().slice(0, 1400);
  const imageStyle = String(document.getElementById('slidesStudioImageStyle')?.value || '').trim().toLowerCase() === 'card' ? 'card' : 'background';
  const imageRadius = clampNumber(document.getElementById('slidesStudioImageRadius')?.value, 0, 48, 24);
  const imageFade = clampNumber(document.getElementById('slidesStudioImageFade')?.value, 0, 90, 68);
  const buttonLabel = String(document.getElementById('slidesStudioButtonLabel')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  const buttonUrl = normalizeSlidesStudioUrl(document.getElementById('slidesStudioButtonUrl')?.value || '');
  const sourceLabel = String(document.getElementById('slidesStudioSourceLabel')?.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const sourceUrl = normalizeSlidesStudioUrl(document.getElementById('slidesStudioSourceUrl')?.value || '');

  await updateSlidesStudioState(state => {
    state.title = deckTitle;
    const activeSlide = state.slides.find(slide => slide.id === state.activeSlideId);
    if (!activeSlide) return;
    Object.assign(activeSlide, createSlidesStudioSlide(state.slides.indexOf(activeSlide), {
      ...activeSlide,
      tag,
      tagPosition,
      title,
      subtitle,
      description,
      template,
      contentVertical,
      contentHorizontal,
      backgroundMode,
      solidColor,
      gradientFrom,
      gradientTo,
      backgroundImageUrl,
      imageStyle,
      imageRadius,
      imageFade,
      buttonLabel,
      buttonUrl,
      sourceLabel,
      sourceUrl
    }));
  });
}

async function generateSlidesStudioFromPrompt() {
  if (!APP.roomCode || !APP.room || APP.room.currentActivity !== 'slides-studio') return;
  if (APP.room.host !== APP.player?.name) return;
  const promptText = String(document.getElementById('slidesStudioAIPrompt')?.value || '').trim();
  const requestedCount = Math.max(3, Math.min(10, Number.parseInt(document.getElementById('slidesStudioAICount')?.value || '5', 10) || 5));
  APP.slidesStudioUi.aiPrompt = promptText;
  APP.slidesStudioUi.aiCount = requestedCount;
  const apiKeyInput = String(document.getElementById('slidesStudioAIApiKey')?.value || '').trim();
  const apiKey = apiKeyInput || HOST_LOCAL_CONFIG.aiApiKey || localStorage.getItem('ai-question-api-key') || '';
  if (!promptText) {
    showError('Add a prompt to generate slides.');
    return;
  }

  APP.aiGenerating = true;
  APP.aiStatus = `Generating ${requestedCount} slide${requestedCount === 1 ? '' : 's'}...`;
  render();

  try {
    if (apiKeyInput) {
      HOST_LOCAL_CONFIG.aiApiKey = apiKeyInput;
      localStorage.setItem('ai-question-api-key', apiKeyInput);
      saveHostLocalConfig(HOST_LOCAL_CONFIG);
    }
    const generated = await requestAIGeneratedArray(buildAISlidesStudioPrompt(promptText, requestedCount), apiKey);
    const slides = validateAISlidesStudioSlides(generated);
    if (!slides.length) {
      throw new Error('AI returned no valid slides.');
    }
    await updateSlidesStudioState(state => {
      state.title = normalizeTopic(document.getElementById('slidesStudioDeckTitle')?.value || promptText) || state.title || 'Slides Studio';
      state.slides = slides;
      state.activeSlideId = slides[0].id;
    });
    APP.aiStatus = `Generated ${slides.length} slide${slides.length === 1 ? '' : 's'} from prompt.`;
  } catch (error) {
    APP.aiStatus = error?.message || 'Slide generation failed.';
    showError(APP.aiStatus);
  } finally {
    APP.aiGenerating = false;
    render();
  }
}

function getSlidesStudioSlideBackground(slide) {
  return slide.backgroundMode === 'solid'
    ? `background:${slide.solidColor};`
    : `background:linear-gradient(135deg, ${slide.gradientFrom}, ${slide.gradientTo});`;
}

function renderSlidesStudioCanvas(slide, options = {}) {
  const safeSlide = createSlidesStudioSlide(0, slide || {});
  const variant = options.variant === 'thumb' ? 'thumb' : 'main';
  const template = normalizeSlidesStudioTemplate(safeSlide.template);
  const templateMeta = getSlidesStudioTemplateMeta(template);
  const descriptionItems = getSlidesStudioDescriptionItems(safeSlide.description);
  const hasImage = Boolean(safeSlide.backgroundImageUrl);
  const prefersCardLayout = ['two-column', 'about', 'features'].includes(template) || safeSlide.imageStyle === 'card';
  const hasCard = hasImage && prefersCardLayout;
  const safeTitle = formatSlidesStudioText(safeSlide.title);
  const safeSubtitle = formatSlidesStudioText(safeSlide.subtitle);
  const safeDescription = formatSlidesStudioText(safeSlide.description);
  const safeTag = escapeHtml(safeSlide.tag || '');
  const safeButtonLabel = escapeHtml(safeSlide.buttonLabel || '');
  const safeButtonUrl = escapeHtml(safeSlide.buttonUrl || '');
  const safeSourceLabel = escapeHtml(safeSlide.sourceLabel || '');
  const safeSourceUrl = escapeHtml(safeSlide.sourceUrl || '');
  const verticalAlign = safeSlide.contentVertical === 'top'
    ? 'start'
    : safeSlide.contentVertical === 'center'
      ? 'center'
      : 'end';
  const horizontalAlign = safeSlide.contentHorizontal === 'right'
    ? 'end'
    : safeSlide.contentHorizontal === 'center'
      ? 'center'
      : 'start';
  const textAlign = safeSlide.contentHorizontal === 'right'
    ? 'right'
    : safeSlide.contentHorizontal === 'center'
      ? 'center'
      : 'left';
  const stageClass = [
    'slides-studio-stage',
    variant === 'thumb' ? 'slides-studio-stage-thumb' : '',
    hasCard ? 'slides-studio-stage-has-card' : '',
    template === 'title' ? 'slides-studio-template-center' : '',
    ['problem', 'resolution', 'looking-forward', 'did-you-know'].includes(template) ? 'slides-studio-template-panel' : ''
  ].filter(Boolean).join(' ');
  let bodyMarkup = '';
  if (template === 'features') {
    bodyMarkup = descriptionItems.length ? `
      <div class="slides-studio-feature-grid">
        ${descriptionItems.slice(0, 6).map(item => `<div class="slides-studio-feature-card">${escapeHtml(item)}</div>`).join('')}
      </div>
    ` : '';
  } else if (template === 'did-you-know' && safeDescription) {
    bodyMarkup = `<div class="slides-studio-fact-card">${safeDescription}</div>`;
  } else if (safeDescription) {
    bodyMarkup = `<div class="slides-studio-description">${safeDescription}</div>`;
  }
  const tagMarkup = safeTag
    ? `<div class="slides-studio-kicker" style="border-color:color-mix(in srgb, var(--slides-template-accent) 48%, rgba(255,255,255,0.12));color:color-mix(in srgb, var(--slides-template-accent) 76%, white 24%);">${safeTag}</div>`
    : '';
  const actionsMarkup = (safeButtonLabel && safeButtonUrl) || (safeSourceLabel && safeSourceUrl)
    ? `
      <div class="slides-studio-actions" style="justify-content:${textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start'};">
        ${safeButtonLabel && safeButtonUrl ? `<a class="slides-studio-link-button" href="${safeButtonUrl}" target="_blank" rel="noopener noreferrer">${safeButtonLabel}</a>` : ''}
        ${safeSourceLabel && safeSourceUrl ? `<a class="slides-studio-source-link" href="${safeSourceUrl}" target="_blank" rel="noopener noreferrer">Source: ${safeSourceLabel}</a>` : ''}
      </div>
    `
    : '';
  return `
    <div class="${stageClass}" style="${getSlidesStudioSlideBackground(safeSlide)};--slide-fade-strength:${Math.max(0, Math.min(0.9, safeSlide.imageFade / 100)).toFixed(2)};--slides-template-accent:${templateMeta.accent};">
      ${hasImage && !hasCard ? `
        <div class="slides-studio-stage-bg-image" style="background-image:url('${escapeHtml(safeSlide.backgroundImageUrl)}');"></div>
        <div class="slides-studio-stage-bg-fade"></div>
      ` : ''}
      <div class="slides-studio-stage-shell">
        <div class="slides-studio-stage-copy" style="align-self:${verticalAlign};justify-self:${horizontalAlign};text-align:${textAlign};">
          ${safeSlide.tagPosition === 'top' ? tagMarkup : ''}
          ${safeTitle ? `<h2 class="slides-studio-title">${safeTitle}</h2>` : ''}
          ${safeSubtitle ? `<div class="slides-studio-subtitle">${safeSubtitle}</div>` : ''}
          ${bodyMarkup}
          ${safeSlide.tagPosition === 'bottom' ? tagMarkup : ''}
          ${actionsMarkup}
        </div>
        ${hasCard ? `
          <div class="slides-studio-stage-card" style="border-radius:${safeSlide.imageRadius}px;">
            <div class="slides-studio-stage-card-image" style="background-image:url('${escapeHtml(safeSlide.backgroundImageUrl)}');"></div>
            <div class="slides-studio-stage-card-fade"></div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function toggleSlidesStudioGeneratePanel() {
  APP.slidesStudioUi = APP.slidesStudioUi && typeof APP.slidesStudioUi === 'object' ? APP.slidesStudioUi : getDefaultSlidesStudioUiState();
  APP.slidesStudioUi.generateExpanded = APP.slidesStudioUi.generateExpanded === false;
  render();
}

function toggleSlidesStudioEditorPanel() {
  APP.slidesStudioUi = APP.slidesStudioUi && typeof APP.slidesStudioUi === 'object' ? APP.slidesStudioUi : getDefaultSlidesStudioUiState();
  APP.slidesStudioUi.editorExpanded = APP.slidesStudioUi.editorExpanded === false;
  render();
}

function renderSlidesStudio() {
  const isHost = APP.room.host === APP.player.name;
  const state = normalizeSlidesStudioState(APP.room?.activityState || {});
  const activeIndex = getSlidesStudioActiveSlideIndex(state);
  const activeSlide = state.slides[activeIndex] || state.slides[0];
  const activeTemplate = getSlidesStudioTemplateMeta(activeSlide?.template);
  const safeRoomCode = escapeHtml(APP.roomCode);
  const rawDeckTitle = String(state.title || 'Slides Studio').trim();
  const showDeckTitle = isHost || (rawDeckTitle && rawDeckTitle.toLowerCase() !== 'slides studio');
  const safeDeckTitle = escapeHtml(rawDeckTitle || 'Slides Studio');
  const safeSlideTitle = escapeHtml(activeSlide?.title || '');
  const safeSlideSubtitle = escapeHtml(activeSlide?.subtitle || '');
  const safeSlideDescription = escapeHtml(activeSlide?.description || '');
  const safeSlideTag = escapeHtml(activeSlide?.tag || '');
  const safeImageUrl = escapeHtml(activeSlide?.backgroundImageUrl || '');
  const safeButtonLabel = escapeHtml(activeSlide?.buttonLabel || '');
  const safeButtonUrl = escapeHtml(activeSlide?.buttonUrl || '');
  const safeSourceLabel = escapeHtml(activeSlide?.sourceLabel || '');
  const safeSourceUrl = escapeHtml(activeSlide?.sourceUrl || '');
  const backgroundMode = activeSlide?.backgroundMode === 'solid' ? 'solid' : 'gradient';
  const imageStyle = activeSlide?.imageStyle === 'card' ? 'card' : 'background';
  const aiDraftPrompt = escapeHtml(APP.slidesStudioUi.aiPrompt || '');
  const aiDefaultCount = Math.max(3, Math.min(10, Number(APP.slidesStudioUi.aiCount) || Number(HOST_LOCAL_CONFIG.aiDefaultCount) || 5));
  const generateExpanded = APP.slidesStudioUi.generateExpanded !== false;
  const editorExpanded = APP.slidesStudioUi.editorExpanded !== false;

  const hostSidebar = `
    <div class="slides-studio-sidebar">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;">
        <div style="font-weight:800;font-size:1.05rem;">Deck Slides</div>
        <div class="slides-studio-chip">${state.slides.length} total</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px;">
        <button class="btn-secondary" data-action="slides-studio-prev" ${activeIndex <= 0 ? 'disabled' : ''} style="padding:10px 12px;width:100%;">← Prev</button>
        <button class="btn-secondary" data-action="slides-studio-next" ${activeIndex >= state.slides.length - 1 ? 'disabled' : ''} style="padding:10px 12px;width:100%;">Next →</button>
        <button class="btn-primary" data-action="slides-studio-add" style="padding:10px 12px;width:100%;">+ Add</button>
      </div>
      <div class="slides-studio-filmstrip">
        ${state.slides.map((slide, index) => `
          <button class="slides-studio-thumb ${slide.id === state.activeSlideId ? 'slides-studio-thumb-active' : ''}" data-action="slides-studio-select" data-slide-id="${escapeHtml(slide.id)}">
            ${renderSlidesStudioCanvas(slide, { variant: 'thumb' })}
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;">
              <div style="min-width:0;">
                <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(slide.title || `${getSlidesStudioTemplateMeta(slide.template).label} ${index + 1}`)}</div>
                <div style="font-size:0.76rem;color:var(--text-dim);">${escapeHtml(getSlidesStudioTemplateMeta(slide.template).label)} • Slide ${index + 1}</div>
              </div>
              <div class="slides-studio-chip">#${index + 1}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  const hostEditor = `
    <div class="slides-studio-panel" style="margin-top:18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <div>
          <div style="font-weight:800;font-size:1.08rem;">Create Slides From Prompt</div>
          <div style="color:var(--text-dim);font-size:0.84rem;">Generate a fresh deck using the same AI setup used elsewhere in Team Builder.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn-secondary" data-action="slides-studio-toggle-generate" aria-label="${generateExpanded ? 'Collapse generate slides panel' : 'Expand generate slides panel'}" title="${generateExpanded ? 'Collapse generate slides panel' : 'Expand generate slides panel'}" style="width:auto;padding:10px 14px;min-width:46px;font-size:1.05rem;line-height:1;">
            ${generateExpanded ? '▴' : '▾'}
          </button>
          <button class="btn-primary" data-action="slides-studio-generate" ${APP.aiGenerating ? 'disabled' : ''} style="width:auto;padding:10px 18px;">
            ${APP.aiGenerating ? 'Generating...' : 'Generate Slides'}
          </button>
        </div>
      </div>
      ${generateExpanded ? `
        <div class="slides-studio-editor-grid">
          <div class="form-group form-group-full">
            <label class="form-label" for="slidesStudioAIPrompt">Prompt</label>
            <textarea id="slidesStudioAIPrompt" style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:14px 16px;border-radius:12px;font-size:0.96rem;font-family:'Outfit',sans-serif;outline:none;resize:vertical;min-height:110px;" placeholder="Create a 5-slide presentation for a team kickoff about Q2 priorities, wins, risks, and next steps.">${aiDraftPrompt}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioAICount">Slide count</label>
            <input id="slidesStudioAICount" class="form-input" type="number" min="3" max="10" value="${aiDefaultCount}">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioAIApiKey">API key (optional fallback)</label>
            <input id="slidesStudioAIApiKey" class="form-input" type="password" value="${escapeHtml(HOST_LOCAL_CONFIG.aiApiKey || '')}" placeholder="Uses server provider config when available">
          </div>
        </div>
      ` : ''}
      ${APP.aiStatus ? `<div role="status" aria-live="polite" style="margin-top:${generateExpanded ? '10px' : '0'};color:var(--text-mid);font-size:0.88rem;">${escapeHtml(APP.aiStatus)}</div>` : ''}
    </div>

    <div class="slides-studio-panel" style="margin-top:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <div>
          <div style="font-weight:800;font-size:1.08rem;">Slide Editor</div>
          <div style="color:var(--text-dim);font-size:0.84rem;">Edit the live slide and save changes for everyone in the room.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary" data-action="slides-studio-toggle-editor" aria-label="${editorExpanded ? 'Collapse slide editor panel' : 'Expand slide editor panel'}" title="${editorExpanded ? 'Collapse slide editor panel' : 'Expand slide editor panel'}" style="width:auto;padding:10px 14px;min-width:46px;font-size:1.05rem;line-height:1;">
            ${editorExpanded ? '▴' : '▾'}
          </button>
          <button class="btn-secondary" data-action="slides-studio-duplicate" data-slide-id="${escapeHtml(activeSlide.id)}" aria-label="Duplicate slide" title="Duplicate slide" style="width:auto;padding:10px 14px;min-width:46px;font-size:1.05rem;line-height:1;">⧉</button>
          <button class="btn-secondary" data-action="slides-studio-remove" data-slide-id="${escapeHtml(activeSlide.id)}" aria-label="Remove slide" title="Remove slide" style="width:auto;padding:10px 14px;min-width:46px;font-size:1.05rem;line-height:1;">🗑</button>
          <button class="btn-primary" data-action="slides-studio-save" style="width:auto;padding:10px 18px;">Save Slide</button>
        </div>
      </div>
      ${editorExpanded ? `
        <div class="slides-studio-editor-grid">
          <div class="form-group form-group-full">
            <label class="form-label" for="slidesStudioDeckTitle">Presentation title</label>
            <input id="slidesStudioDeckTitle" class="form-input" maxlength="80" value="${safeDeckTitle}" placeholder="Quarterly Kickoff">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioSlideTag">Tag</label>
            <input id="slidesStudioSlideTag" class="form-input" maxlength="40" value="${safeSlideTag}" placeholder="Optional tag">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioSlideTitle">Heading title</label>
            <input id="slidesStudioSlideTitle" class="form-input" maxlength="80" value="${safeSlideTitle}" placeholder="Heading title">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioSlideSubtitle">Subtitle</label>
            <input id="slidesStudioSlideSubtitle" class="form-input" maxlength="120" value="${safeSlideSubtitle}" placeholder="Subtitle">
          </div>
          <div class="form-group form-group-full">
            <label class="form-label" for="slidesStudioSlideDescription">Description</label>
            <textarea id="slidesStudioSlideDescription" style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:14px 16px;border-radius:12px;font-size:0.96rem;font-family:'Outfit',sans-serif;outline:none;resize:vertical;min-height:110px;" placeholder="Add the main message or talking points for this slide.">${safeSlideDescription}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioTemplate">Slide template</label>
            <select id="slidesStudioTemplate" class="form-input">
              ${SLIDES_STUDIO_TEMPLATE_OPTIONS.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === activeTemplate.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioTagPosition">Tag position</label>
            <select id="slidesStudioTagPosition" class="form-input">
              <option value="top" ${activeSlide?.tagPosition === 'bottom' ? '' : 'selected'}>Top</option>
              <option value="bottom" ${activeSlide?.tagPosition === 'bottom' ? 'selected' : ''}>Bottom</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioContentVertical">Text vertical position</label>
            <select id="slidesStudioContentVertical" class="form-input">
              <option value="top" ${activeSlide?.contentVertical === 'top' ? 'selected' : ''}>Top</option>
              <option value="center" ${activeSlide?.contentVertical === 'center' ? 'selected' : ''}>Center</option>
              <option value="bottom" ${activeSlide?.contentVertical === 'top' || activeSlide?.contentVertical === 'center' ? '' : 'selected'}>Bottom</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioContentHorizontal">Text horizontal position</label>
            <select id="slidesStudioContentHorizontal" class="form-input">
              <option value="left" ${activeSlide?.contentHorizontal === 'center' || activeSlide?.contentHorizontal === 'right' ? '' : 'selected'}>Left</option>
              <option value="center" ${activeSlide?.contentHorizontal === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${activeSlide?.contentHorizontal === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioBackgroundMode">Background style</label>
            <select id="slidesStudioBackgroundMode" class="form-input">
              <option value="gradient" ${backgroundMode === 'gradient' ? 'selected' : ''}>Gradient</option>
              <option value="solid" ${backgroundMode === 'solid' ? 'selected' : ''}>Solid Color</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioImageStyle">Image placement</label>
            <select id="slidesStudioImageStyle" class="form-input">
              <option value="background" ${imageStyle === 'background' ? 'selected' : ''}>Background image</option>
              <option value="card" ${imageStyle === 'card' ? 'selected' : ''}>Image card</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioSolidColor">Solid color</label>
            <input id="slidesStudioSolidColor" type="color" class="form-input" value="${escapeHtml(activeSlide.solidColor)}" style="padding:6px 8px;min-height:52px;">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioGradientFrom">Gradient start</label>
            <input id="slidesStudioGradientFrom" type="color" class="form-input" value="${escapeHtml(activeSlide.gradientFrom)}" style="padding:6px 8px;min-height:52px;">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioGradientTo">Gradient end</label>
            <input id="slidesStudioGradientTo" type="color" class="form-input" value="${escapeHtml(activeSlide.gradientTo)}" style="padding:6px 8px;min-height:52px;">
          </div>
          <div class="form-group form-group-full">
            <label class="form-label" for="slidesStudioBackgroundImageUrl">Background image URL</label>
            <input id="slidesStudioBackgroundImageUrl" class="form-input" maxlength="1400" value="${safeImageUrl}" placeholder="https://images.unsplash.com/...">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioButtonLabel">Button label</label>
            <input id="slidesStudioButtonLabel" class="form-input" maxlength="32" value="${safeButtonLabel}" placeholder="Learn more">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioButtonUrl">Button link</label>
            <input id="slidesStudioButtonUrl" class="form-input" maxlength="1400" value="${safeButtonUrl}" placeholder="https://example.com">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioSourceLabel">Source label</label>
            <input id="slidesStudioSourceLabel" class="form-input" maxlength="40" value="${safeSourceLabel}" placeholder="Company report">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioSourceUrl">Source link</label>
            <input id="slidesStudioSourceUrl" class="form-input" maxlength="1400" value="${safeSourceUrl}" placeholder="https://example.com/source">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioImageRadius">Image radius: ${Math.round(Number(activeSlide.imageRadius) || 24)}px</label>
            <input id="slidesStudioImageRadius" type="range" min="0" max="48" step="1" value="${escapeHtml(String(Math.round(Number(activeSlide.imageRadius) || 24)))}" class="slides-studio-range">
          </div>
          <div class="form-group">
            <label class="form-label" for="slidesStudioImageFade">Fade to black: ${Math.round(Number(activeSlide.imageFade) || 68)}%</label>
            <input id="slidesStudioImageFade" type="range" min="0" max="90" step="1" value="${escapeHtml(String(Math.round(Number(activeSlide.imageFade) || 68)))}" class="slides-studio-range">
          </div>
        </div>
      ` : ''}
    </div>
  `;

  return `
    ${showDeckTitle ? `
      <div class="header">
        <h1 style="font-size:2rem;font-weight:700;">🎞️ ${safeDeckTitle}</h1>
        <p class="tagline">Room: ${safeRoomCode}</p>
      </div>
    ` : `
      <div style="margin-bottom:14px;color:var(--text-dim);font-size:0.88rem;text-align:center;">Room: ${safeRoomCode}</div>
    `}

    ${isHost ? '<button class="btn-secondary" data-action="end-activity">← End Activity</button>' : ''}

    <div style="margin-top:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <div class="slides-studio-chip">Slide ${activeIndex + 1} of ${state.slides.length}</div>
          <div class="slides-studio-chip">${isHost ? 'Host editing live' : 'Live presentation'}</div>
          <div class="slides-studio-chip">${escapeHtml(activeTemplate.label)}</div>
        </div>
        ${isHost ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn-secondary" data-action="slides-studio-prev" ${activeIndex <= 0 ? 'disabled' : ''} style="width:auto;padding:10px 16px;">← Previous</button>
            <button class="btn-secondary" data-action="slides-studio-next" ${activeIndex >= state.slides.length - 1 ? 'disabled' : ''} style="width:auto;padding:10px 16px;">Next →</button>
          </div>
        ` : ''}
      </div>

      <div class="${isHost ? 'slides-studio-layout' : ''}">
        ${isHost ? hostSidebar : ''}
        <div>
          <div class="slides-studio-panel">
            ${renderSlidesStudioCanvas(activeSlide)}
          </div>
          ${isHost ? hostEditor : `
            <div class="slides-studio-audience-strip">
              ${state.slides.map((slide, index) => `
                <div class="slides-studio-panel" style="padding:10px;border-color:${index === activeIndex ? 'rgba(0,210,211,0.4)' : 'var(--border)'};">
                  ${renderSlidesStudioCanvas(slide, { variant: 'thumb' })}
                  <div style="margin-top:8px;font-size:0.82rem;color:${index === activeIndex ? 'var(--text)' : 'var(--text-dim)'};font-weight:${index === activeIndex ? '700' : '500'};">
                    Slide ${index + 1}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}
