(function (root) {
  const configSelector = '[id^="adminBrand"], #adminColorTheme, [id^="adminEnable"], #adminAutoRevealLightning, #adminAllowAnswerChanges, #adminDynamicScoring, [id^="adminActivityEnabled-"]';
  let draft = {};
  let baseline = {};
  const valueOf = input => input.type === 'checkbox' ? input.checked : input.value;
  root.captureAdminSettingsDraft = function () {
    for (const input of document.querySelectorAll(configSelector)) {
      if (input.id.endsWith('Picker')) continue;
      const value = valueOf(input);
      if (value !== baseline[input.id]) draft[input.id] = value;
      else delete draft[input.id];
    }
    root.refreshAdminSettingsStatus();
  };
  root.restoreAdminSettingsDraft = function () {
    for (const input of document.querySelectorAll(configSelector)) {
      if (input.id.endsWith('Picker')) continue;
      if (!(input.id in draft)) baseline[input.id] = valueOf(input);
      if (input.id in draft) {
        if (input.type === 'checkbox') input.checked = draft[input.id];
        else input.value = draft[input.id];
      }
      const picker = document.getElementById(input.id + 'Picker');
      if (picker && /^#[a-f0-9]{6}$/i.test(input.value)) picker.value = input.value;
    }
    root.refreshAdminSettingsStatus();
  };
  root.resetAdminSettingsDraft = function () { draft = {}; baseline = {}; };
  root.refreshAdminSettingsStatus = function () {
    const dirty = Object.keys(draft).some(key => draft[key] !== baseline[key]);
    const bar = document.querySelector('.admin-save-bar');
    if (bar) bar.hidden = !dirty && bar.dataset.settingsSection !== 'true';
    const status = document.getElementById('adminSettingsStatus');
    if (status) status.textContent = dirty ? 'Unsaved settings — kept while you switch tabs' : 'Settings are up to date';
    const discard = document.querySelector('[data-action="admin-discard-settings"]');
    if (discard) discard.hidden = !dirty;
    const count = document.getElementById('adminActivityCount');
    if (count) count.textContent = `${document.querySelectorAll('[id^="adminActivityEnabled-"]:checked').length} activities enabled`;
  };
  for (const eventName of ['input', 'change']) document.addEventListener(eventName, event => {
    if (event.target.matches?.(configSelector)) {
      if (event.target.id.endsWith('Picker')) {
        const text = document.getElementById(event.target.id.replace(/Picker$/, ''));
        if (text) text.value = event.target.value;
      } else {
        const picker = document.getElementById(event.target.id + 'Picker');
        if (picker && /^#[a-f0-9]{6}$/i.test(event.target.value)) picker.value = event.target.value;
      }
      root.captureAdminSettingsDraft();
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id !== 'adminActivitySearch') return;
    const query = event.target.value.toLowerCase().trim();
    for (const row of document.querySelectorAll('[data-admin-activity]')) row.hidden = !row.textContent.toLowerCase().includes(query);
  });
  document.addEventListener('click', event => {
    const swatch = event.target.closest('[data-admin-color-target]');
    if (!swatch) return;
    const input = document.getElementById(swatch.dataset.adminColorTarget);
    if (input) {
      input.value = swatch.dataset.color;
      const picker = document.getElementById(input.id + 'Picker');
      if (picker) picker.value = input.value;
      root.captureAdminSettingsDraft();
    }
  });
})(window);
