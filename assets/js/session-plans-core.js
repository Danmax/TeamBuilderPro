const TEAM_BUILDER_SESSION_PLANS_CORE = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_SESSION_PLANS_CORE.normalizeSessionPlan = function normalizeSessionPlan(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normalizeTopic(raw.title || raw.name || '');
  const idBase = String(raw.id || title || `session-plan-${idx + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const queue = Array.isArray(raw.activityQueue)
    ? raw.activityQueue.filter(activityId => ALL_ACTIVITY_IDS.includes(activityId))
    : [];
  const queueSchedule = normalizeQueueSchedule(raw.queueSchedule, queue);
  return {
    id: idBase || `session-plan-${Date.now()}-${idx}`,
    title: title || `Session Plan ${idx + 1}`,
    date: String(raw.date || '').trim().slice(0, 32),
    time: String(raw.time || '').trim().slice(0, 32),
    zoomLink: normalizeSlidesStudioUrl(raw.zoomLink || raw.link || ''),
    details: String(raw.details || raw.description || '').replace(/\r/g, '').trim().slice(0, 2000),
    activityQueue: queueSchedule.map(item => item.activityId),
    queueSchedule,
    timedSessionEnabled: raw.timedSessionEnabled === true,
    contentBrief: normalizeContentBrief(raw.contentBrief),
    contentCollections: normalizeClientCollections(raw.contentCollections),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString())
  };
};

TEAM_BUILDER_SESSION_PLANS_CORE.loadSessionPlans = function loadSessionPlans() {
  const stored = safeParseJson(localStorage.getItem(SESSION_PLANS_STORAGE_KEY) || '');
  if (!Array.isArray(stored)) return [];
  return stored
    .map((plan, idx) => TEAM_BUILDER_SESSION_PLANS_CORE.normalizeSessionPlan(plan, idx))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

TEAM_BUILDER_SESSION_PLANS_CORE.persistSessionPlans = function persistSessionPlans(plans) {
  const normalized = Array.isArray(plans)
    ? plans.map((plan, idx) => TEAM_BUILDER_SESSION_PLANS_CORE.normalizeSessionPlan(plan, idx)).filter(Boolean)
    : [];
  localStorage.setItem(SESSION_PLANS_STORAGE_KEY, JSON.stringify(normalized));
  APP.sessionManager.plans = normalized;
};

TEAM_BUILDER_SESSION_PLANS_CORE.encodeSessionPlan = function encodeSessionPlan(plan) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(plan))));
  } catch (_error) {
    return '';
  }
};

TEAM_BUILDER_SESSION_PLANS_CORE.decodeSessionPlan = function decodeSessionPlan(payload) {
  try {
    return safeParseJson(decodeURIComponent(escape(atob(payload))));
  } catch (_error) {
    return null;
  }
};

TEAM_BUILDER_SESSION_PLANS_CORE.buildSessionPlanShareUrl = function buildSessionPlanShareUrl(plan) {
  const encoded = TEAM_BUILDER_SESSION_PLANS_CORE.encodeSessionPlan(plan);
  if (!encoded) return '';
  const url = new URL(window.location.href);
  url.searchParams.set('sessionPlan', encoded);
  return url.toString();
};

TEAM_BUILDER_SESSION_PLANS_CORE.getSessionPlanById = function getSessionPlanById(planId) {
  const id = String(planId || '').trim();
  return (APP.sessionManager.plans || []).find(plan => plan.id === id) || null;
};

TEAM_BUILDER_SESSION_PLANS_CORE.applySessionPlanToRoom = function applySessionPlanToRoom(room, plan) {
  const normalizedPlan = TEAM_BUILDER_SESSION_PLANS_CORE.normalizeSessionPlan(plan);
  if (!room || !normalizedPlan) return room;
  room.sessionPlan = {
    id: normalizedPlan.id,
    title: normalizedPlan.title,
    date: normalizedPlan.date,
    time: normalizedPlan.time,
    zoomLink: normalizedPlan.zoomLink,
    details: normalizedPlan.details,
    contentBrief: normalizedPlan.contentBrief,
    updatedAt: normalizedPlan.updatedAt
  };
  room.contentBrief = normalizedPlan.contentBrief;
  room.contentCollections = normalizeClientCollections(normalizedPlan.contentCollections || []);
  room.queueSchedule = normalizeQueueSchedule(normalizedPlan.queueSchedule, normalizedPlan.activityQueue);
  room.activityQueue = room.queueSchedule.map(item => item.activityId);
  room.queueIndex = 0;
  room.queueActive = false;
  room.queueTiming = {
    enabled: normalizedPlan.timedSessionEnabled === true,
    currentQueuePointer: -1,
    currentStartedAt: 0,
    currentEndsAt: 0
  };
  room.lastUpdate = Date.now();
  return room;
};

TEAM_BUILDER_SESSION_PLANS_CORE.editSessionPlan = function editSessionPlan(planId) {
  APP.sessionManager.editingPlanId = String(planId || '').trim();
  APP.screen = 'schedule-meeting';
  render();
};

TEAM_BUILDER_SESSION_PLANS_CORE.clearSessionPlanEditor = function clearSessionPlanEditor() {
  APP.sessionManager.editingPlanId = '';
  render();
};

TEAM_BUILDER_SESSION_PLANS_CORE.saveSessionPlan = async function saveSessionPlan() {
  const title = normalizeTopic(document.getElementById('meetingTitle')?.value || '');
  const date = String(document.getElementById('meetingDate')?.value || '').trim().slice(0, 32);
  const time = String(document.getElementById('meetingTime')?.value || '').trim().slice(0, 32);
  const zoomLink = normalizeSlidesStudioUrl(document.getElementById('zoomLink')?.value || '');
  const details = String(document.getElementById('meetingDetails')?.value || '').replace(/\r/g, '').trim().slice(0, 2000);
  const contentBrief = normalizeContentBrief({
    themePreset: document.getElementById('meetingThemePreset')?.value || 'Team Collaboration',
    customTopic: document.getElementById('meetingCustomTopic')?.value || '',
    audience: document.getElementById('meetingAudience')?.value || '',
    tone: document.getElementById('meetingTone')?.value || '',
    difficulty: document.getElementById('meetingDifficulty')?.value || 'mixed',
    count: document.getElementById('meetingContentCount')?.value || '8'
  });
  const activityQueue = Array.from(
    document.querySelectorAll('.activity-queue-checkbox:checked')
  ).map(cb => cb.value).filter(activityId => ALL_ACTIVITY_IDS.includes(activityId));
  const queueSchedule = activityQueue.map(activityId => ({
    activityId,
    durationMinutes: normalizeQueueDurationMinutes(
      document.querySelector(`.activity-queue-duration[data-activity-id="${activityId}"]`)?.value || `${DEFAULT_QUEUE_ACTIVITY_DURATION_MINUTES}`
    )
  }));
  const timedSessionEnabled = Boolean(document.getElementById('meetingTimedSessionEnabled')?.checked);
  if (!title) {
    showError('Please add a session title.');
    return;
  }
  const nowIso = new Date().toISOString();
  const editingId = String(APP.sessionManager.editingPlanId || '').trim();
  const existing = editingId ? TEAM_BUILDER_SESSION_PLANS_CORE.getSessionPlanById(editingId) : null;
  const plan = TEAM_BUILDER_SESSION_PLANS_CORE.normalizeSessionPlan({
    id: existing?.id || '',
    title,
    date,
    time,
    zoomLink,
    details,
    contentBrief,
    contentCollections: existing?.contentCollections || [],
    activityQueue,
    queueSchedule,
    timedSessionEnabled,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso
  });
  const plans = TEAM_BUILDER_SESSION_PLANS_CORE.loadSessionPlans().filter(item => item.id !== plan.id);
  plans.unshift(plan);
  TEAM_BUILDER_SESSION_PLANS_CORE.persistSessionPlans(plans);
  APP.sessionManager.editingPlanId = plan.id;
  showError(existing ? 'Session plan updated.' : 'Session plan saved.');
  render();
};

TEAM_BUILDER_SESSION_PLANS_CORE.deleteSessionPlan = function deleteSessionPlan(planId) {
  const id = String(planId || '').trim();
  if (!id) return;
  const plan = TEAM_BUILDER_SESSION_PLANS_CORE.getSessionPlanById(id);
  if (!plan) return;
  const confirmed = window.confirm(`Delete "${plan.title}"?`);
  if (!confirmed) return;
  const plans = TEAM_BUILDER_SESSION_PLANS_CORE.loadSessionPlans().filter(item => item.id !== id);
  TEAM_BUILDER_SESSION_PLANS_CORE.persistSessionPlans(plans);
  if (APP.sessionManager.editingPlanId === id) APP.sessionManager.editingPlanId = '';
  showError('Session plan deleted.');
  render();
};

TEAM_BUILDER_SESSION_PLANS_CORE.shareSessionPlan = async function shareSessionPlan(planId) {
  const plan = TEAM_BUILDER_SESSION_PLANS_CORE.getSessionPlanById(planId);
  if (!plan) return;
  const shareUrl = TEAM_BUILDER_SESSION_PLANS_CORE.buildSessionPlanShareUrl(plan);
  if (!shareUrl) {
    showError('Unable to build session share link.');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showError('Session plan link copied.');
      return;
    }
  } catch (_error) {
  }
  const fallback = document.createElement('textarea');
  fallback.value = shareUrl;
  fallback.setAttribute('readonly', 'true');
  fallback.style.position = 'fixed';
  fallback.style.left = '-9999px';
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  fallback.remove();
  showError('Session plan link copied.');
};

TEAM_BUILDER_SESSION_PLANS_CORE.exportSessionPlanIcs = function exportSessionPlanIcs(planId) {
  const plan = TEAM_BUILDER_SESSION_PLANS_CORE.getSessionPlanById(planId);
  if (!plan) return;
  const icsContent = generateMeetingICS({
    date: plan.date,
    time: plan.time,
    zoomLink: plan.zoomLink,
    details: plan.details,
    activityQueue: plan.activityQueue
  });
  triggerTextFileDownload(`${plan.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'team-session'}.ics`, 'text/calendar;charset=utf-8', icsContent);
  showError('Calendar invite downloaded.');
};
