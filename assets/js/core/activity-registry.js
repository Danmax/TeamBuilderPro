(function () {
  const existing = window.TEAM_BUILDER_ACTIVITY_REGISTRY;
  const activities = existing?.activities && typeof existing.activities === 'object'
    ? existing.activities
    : {};
  const actions = existing?.actions && typeof existing.actions === 'object'
    ? existing.actions
    : {};

  function assertId(id, type) {
    const safeId = String(id || '').trim();
    if (!safeId) throw new Error(`${type} id is required.`);
    return safeId;
  }

  function assertHandler(handler, type, id) {
    if (typeof handler !== 'function') {
      throw new Error(`${type} "${id}" must be a function.`);
    }
  }

  window.TEAM_BUILDER_ACTIVITY_REGISTRY = {
    activities,
    actions,
    registerActivity(activityId, definition) {
      const id = assertId(activityId, 'Activity');
      if (!definition || typeof definition !== 'object') {
        throw new Error(`Activity "${id}" definition is required.`);
      }
      activities[id] = { ...definition, id };
      return activities[id];
    },
    registerAction(actionId, handler) {
      const id = assertId(actionId, 'Action');
      assertHandler(handler, 'Action', id);
      actions[id] = handler;
      return actions[id];
    },
    getActivity(activityId) {
      return activities[String(activityId || '').trim()] || null;
    },
    getAction(actionId) {
      return actions[String(actionId || '').trim()] || null;
    }
  };
})();
