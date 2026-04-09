const TEAM_BUILDER_NAV_CORE = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_NAV_CORE.goToScreen = function goToScreen(screen) {
  if (screen === 'community' && APP.preferences.enableCommunityLobby === false) {
    showError('Community Lobby is disabled by admin.');
    return;
  }
  if (screen === 'schedule-meeting' && APP.preferences.enableScheduleMeeting === false) {
    showError('Schedule Team Meeting is disabled by admin.');
    return;
  }
  if (screen === 'load-session' && APP.preferences.enableLoadSession === false) {
    showError('Load Saved Session is disabled by admin.');
    return;
  }
  if (screen === 'activity-queue' && APP.preferences.enableActivityQueue === false) {
    showError('Activity Queue is disabled by admin.');
    return;
  }
  if (screen === 'schedule-meeting' || screen === 'load-session') {
    APP.sessionManager.plans = loadSessionPlans();
  }
  const roomScreens = new Set(['lobby', 'activity-queue']);
  if (!roomScreens.has(screen)) {
    stopRoomSync();
    APP.showHostSettings = false;
    resetWordChainFocusState();
  }
  APP.showShortcutHelp = false;
  APP.screen = screen;

  if (screen === 'create-room') {
    createRoomAndNavigate();
  } else if (screen === 'community') {
    render();
    void loadCommunityDirectoryData();
  } else {
    render();
  }
};

TEAM_BUILDER_NAV_CORE.openAdminConsole = function openAdminConsole() {
  APP.showShortcutHelp = false;
  APP.admin.returnScreen = APP.roomCode && APP.screen === 'activity-queue' ? 'activity-queue' : (APP.roomCode ? 'lobby' : 'dashboard');
  APP.screen = 'admin';
  render();
};

TEAM_BUILDER_NAV_CORE.switchAdminConsoleTab = function switchAdminConsoleTab(tabId) {
  const allowed = new Set(['overview', 'features', 'ai', 'feedback']);
  APP.admin.activeTab = allowed.has(tabId) ? tabId : 'overview';
  render();
};

TEAM_BUILDER_NAV_CORE.toggleShortcutHelp = function toggleShortcutHelp(forceOpen = null) {
  APP.showShortcutHelp = typeof forceOpen === 'boolean' ? forceOpen : !APP.showShortcutHelp;
  render();
};

TEAM_BUILDER_NAV_CORE.isEditableTarget = function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

TEAM_BUILDER_NAV_CORE.isMacPlatform = function isMacPlatform() {
  const platform = String(navigator.platform || '');
  const userAgent = String(navigator.userAgent || '');
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS|iPhone|iPad|iPod/i.test(userAgent);
};

TEAM_BUILDER_NAV_CORE.getModifierLabel = function getModifierLabel() {
  return isMacPlatform() ? 'Option' : 'Alt';
};

TEAM_BUILDER_NAV_CORE.formatModifierShortcut = function formatModifierShortcut(key) {
  return `${getModifierLabel()}+${key}`;
};

TEAM_BUILDER_NAV_CORE.getShortcutHelpItems = function getShortcutHelpItems() {
  const items = [
    { keys: '?', label: 'Open keyboard shortcuts' },
    { keys: 'Esc', label: 'Close dialog or go back' }
  ];
  if (!APP.player) return items;
  items.push({ keys: formatModifierShortcut('H'), label: 'Go to dashboard' });
  items.push({ keys: formatModifierShortcut('N'), label: 'Host session' });
  items.push({ keys: formatModifierShortcut('J'), label: 'Join session' });
  if (APP.preferences.enableFeedbackHub !== false) {
    items.push({ keys: formatModifierShortcut('F'), label: 'Open Feedback Hub' });
  }
  items.push({ keys: formatModifierShortcut('A'), label: 'Open Admin Console' });
  if (APP.roomCode) {
    items.push({ keys: formatModifierShortcut('L'), label: 'Go to lobby' });
    items.push({ keys: formatModifierShortcut('P'), label: 'Toggle presentation mode' });
    if (APP.preferences.enableActivityQueue !== false && APP.room?.host === APP.player?.name) {
      items.push({ keys: formatModifierShortcut('Q'), label: 'Open Activity Queue' });
    }
    if (APP.room?.host === APP.player?.name) {
      items.push({ keys: formatModifierShortcut('S'), label: 'Open Host Settings' });
    }
  }
  return items;
};

TEAM_BUILDER_NAV_CORE.handleEscapeNavigation = function handleEscapeNavigation() {
  if (APP.showShortcutHelp) {
    toggleShortcutHelp(false);
    return true;
  }
  if (APP.showHostSettings) {
    closeHostSettings();
    return true;
  }
  if (APP.editingProfile) {
    cancelEditProfile();
    return true;
  }
  if (APP.screen === 'about' || APP.screen === 'join-room' || APP.screen === 'feedback' || APP.screen === 'schedule-meeting' || APP.screen === 'load-session') {
    goToScreen('dashboard');
    return true;
  }
  if (APP.screen === 'admin') {
    const adminBackScreen = APP.roomCode && (APP.admin?.returnScreen === 'lobby' || APP.admin?.returnScreen === 'activity-queue')
      ? APP.admin.returnScreen
      : 'dashboard';
    goToScreen(adminBackScreen);
    return true;
  }
  if (APP.screen === 'activity-queue' && APP.roomCode) {
    goToScreen('lobby');
    return true;
  }
  return false;
};

TEAM_BUILDER_NAV_CORE.handleGlobalKeyboardShortcuts = async function handleGlobalKeyboardShortcuts(event) {
  const activeElement = document.activeElement;
  const isEditing = isEditableTarget(activeElement);

  if (event.key === 'Escape') {
    if (handleEscapeNavigation()) {
      event.preventDefault();
    }
    return;
  }

  if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === '?' && !isEditing) {
    event.preventDefault();
    toggleShortcutHelp();
    return;
  }

  if (isEditing || event.ctrlKey || event.metaKey || !event.altKey) return;

  const code = String(event.code || '');
  if (code === 'KeyH' && APP.player) {
    event.preventDefault();
    goToScreen('dashboard');
    return;
  }
  if (code === 'KeyN' && APP.player) {
    event.preventDefault();
    goToScreen('create-room');
    return;
  }
  if (code === 'KeyJ' && APP.player) {
    event.preventDefault();
    goToScreen('join-room');
    return;
  }
  if (code === 'KeyF' && APP.player && APP.preferences.enableFeedbackHub !== false) {
    event.preventDefault();
    await openFeedbackHub();
    return;
  }
  if (code === 'KeyA' && APP.player) {
    event.preventDefault();
    openAdminConsole();
    return;
  }
  if (code === 'KeyL' && APP.player && APP.roomCode) {
    event.preventDefault();
    goToScreen('lobby');
    return;
  }
  if (code === 'KeyQ' && APP.player && APP.roomCode && APP.room?.host === APP.player?.name && APP.preferences.enableActivityQueue !== false) {
    event.preventDefault();
    goToScreen('activity-queue');
    return;
  }
  if (code === 'KeyS' && APP.room?.host === APP.player?.name) {
    event.preventDefault();
    openHostSettings();
    return;
  }
  if (code === 'KeyP' && APP.roomCode) {
    event.preventDefault();
    togglePresentation();
  }
};
