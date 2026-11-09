(function (root) {
  const key = 'team-builder-saved-content-themes';
  root.TEAM_BUILDER_CONTENT_THEMES = [
    { group: 'Team & work', label: 'Team Collaboration', tone: 'Friendly and inclusive' },
    { group: 'Team & work', label: 'New Team Icebreakers', tone: 'Welcoming and low-pressure' },
    { group: 'Team & work', label: 'Leadership & Communication', tone: 'Thoughtful and practical' },
    { group: 'Team & work', label: 'Team Wins & Retrospective', tone: 'Reflective and encouraging' },
    { group: 'Fun & discovery', label: 'Space Exploration', tone: 'Playful and curious' },
    { group: 'Fun & discovery', label: 'Movies & Pop Culture', tone: 'Lighthearted and fun' },
    { group: 'Fun & discovery', label: 'Travel & World Cultures', tone: 'Curious and respectful' },
    { group: 'Fun & discovery', label: 'Science & Nature', tone: 'Accessible and surprising' },
    { group: 'Fun & discovery', label: 'Sports & Games', tone: 'Energetic and friendly' },
    { group: 'Events', label: 'Holiday Celebration', tone: 'Festive and inclusive' },
    { group: 'Events', label: 'Company Kickoff', tone: 'Optimistic and motivating' },
    { group: 'Technology', label: 'AI & Technology', tone: 'Clear and approachable' },
    { group: 'Technology', label: 'ServiceNow', tone: 'Practical and engaging' },
    { group: 'Technology', label: 'JavaScript & Software', tone: 'Clear and engaging' }
  ];
  root.getSavedContentThemes = function () {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.draft && typeof item.draft === 'object').slice(0, 20) : [];
    } catch (_error) { return []; }
  };
  root.getContentThemeChoice = function (value) {
    if (String(value).startsWith('saved:')) return root.getSavedContentThemes().find(item => `saved:${item.id}` === value)?.draft || {};
    return { themePreset: value || '' };
  };
  root.applyContentStudioTheme = function (value) {
    const draft = captureContentStudioDraftFromInputs();
    const selected = root.getContentThemeChoice(value);
    if (String(value).startsWith('saved:')) Object.assign(draft, selected, { scope: draft.scope, planId: draft.planId, collectionJson: draft.collectionJson });
    const preset = root.TEAM_BUILDER_CONTENT_THEMES.find(item => item.label === value);
    draft.themePreset = selected.themePreset || '';
    draft.themeSelection = value;
    if (preset && !draft.tone) draft.tone = preset.tone;
    APP.contentStudioLastPrompt = null;
    APP.contentStudioPreview = null;
    render();
  };
  root.saveContentStudioTheme = function () {
    const draft = captureContentStudioDraftFromInputs();
    const name = String(document.getElementById('contentStudioSavedThemeName')?.value || draft.packName || draft.themePreset || draft.customTopic).trim().slice(0, 60);
    if (!name) { showError('Name the theme before saving it.'); return; }
    const themes = root.getSavedContentThemes();
    const existing = themes.find(item => item.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id || `theme-${Date.now().toString(36)}`;
    const settings = Object.fromEntries(['themePreset', 'customTopic', 'audience', 'tone', 'difficulty', 'count'].map(field => [field, draft[field]]));
    try {
      root.PermanentSettings.set(key, JSON.stringify([{ id, name, draft: settings }, ...themes.filter(item => item.id !== id)].slice(0, 20)));
      draft.themeSelection = `saved:${id}`;
      APP.contentStudioStatus = `Saved “${name}” and queued for database sync. Reuse it from the theme menu.`;
      render();
    } catch (_error) { showError('This browser could not save the theme.'); }
  };
  root.deleteContentStudioTheme = function () {
    const draft = captureContentStudioDraftFromInputs();
    const id = String(draft.themeSelection || '').replace(/^saved:/, '');
    try {
      root.PermanentSettings.set(key, JSON.stringify(root.getSavedContentThemes().filter(item => item.id !== id)));
      draft.themeSelection = draft.themePreset;
      APP.contentStudioStatus = 'Saved theme removed.';
      render();
    } catch (_error) { showError('This browser could not remove the theme.'); }
  };
  const draftFields = new Set(['contentStudioCustomTopic', 'contentStudioPackName', 'contentStudioAudience', 'contentStudioTone', 'contentStudioCount', 'contentStudioDifficulty', 'contentStudioCollectionJson']);
  document.addEventListener('change', event => {
    if (event.target.id === 'contentStudioThemePreset') root.applyContentStudioTheme(event.target.value);
  });
  for (const name of ['input', 'change']) document.addEventListener(name, event => {
    if (!draftFields.has(event.target.id) && !event.target.id?.startsWith('contentStudioActivity-')) return;
    captureContentStudioDraftFromInputs();
    if (APP.contentStudioPreview) {
      APP.contentStudioPreview = null;
      APP.contentStudioStatus = 'Reply or options changed. Review the questions again before saving.';
      document.getElementById('contentStudioImportPreview')?.replaceChildren();
      const status = document.getElementById('contentStudioStatus');
      if (status) status.textContent = APP.contentStudioStatus;
    }
  });
})(window);
