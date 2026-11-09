(function (root) {
  function entries(state) {
    return (state.optionEntries || state.options || []).map(item => typeof item === 'string' ? { label: item } : item).filter(item => item?.label);
  }
  function segments(options) {
    const count = options.length * (options.length <= 6 ? 2 : 1);
    return Array.from({ length: count }, (_, index) => ({ id: `${index}:${options[index % options.length].label}`, label: options[index % options.length].label, entry: options[index % options.length], start: index * 360 / count, end: (index + 1) * 360 / count, center: (index + .5) * 360 / count, percent: 100 / count }));
  }
  function spin(state, spinner, now = Date.now(), random = Math.random) {
    if (state.isSpinning) throw new Error('Let this spin finish first.');
    const options = entries(state), slices = segments(options);
    if (options.length < 2) throw new Error('Add at least two choices before spinning.');
    const index = Math.floor(random() * slices.length);
    const rotation = Number(state.wheelRotation) || 0;
    const target = (360 - slices[index].center) % 360;
    const delta = (target - (rotation % 360) + 360) % 360;
    return { ...state, optionEntries: options, options: options.map(item => item.label), spinnerTurnPlayer: null, pendingSelectedIndex: index, selectedIndex: null, spinWinners: [], winnerXpClaimed: {}, currentResult: '', currentResultAction: null, currentResultPrompt: '', lastResult: '', lastSpinner: spinner, spinCount: (Number(state.spinCount) || 0) + 1, spinToken: (Number(state.spinToken) || 0) + 1, spinDurationMs: 4800, lastSpinAt: now, spinSettledAt: 0, isSpinning: true, prevWheelRotation: rotation, wheelRotation: rotation + (6 + Math.floor(random() * 3)) * 360 + delta };
  }
  function settle(state, now = Date.now()) {
    if (!state.isSpinning || now < Number(state.lastSpinAt) + Number(state.spinDurationMs || 4800)) return state;
    const slices = segments(entries(state));
    const index = state.pendingSelectedIndex, entry = slices[index]?.entry;
    if (!entry) return { ...state, isSpinning: false, pendingSelectedIndex: null };
    const winners = Object.entries(state.playerSelections || {}).filter(([, pick]) => slices[pick]?.label === entry.label).map(([name]) => name);
    const spinPoints = { ...(state.spinPoints || {}) };
    let prompt = entry.prompt || entry.action?.prompt || '';
    if (entry.action?.type === 'points' && state.lastSpinner) {
      spinPoints[state.lastSpinner] = (Number(spinPoints[state.lastSpinner]) || 0) + (Number(entry.action.points) || 0);
      prompt = `${state.lastSpinner} banks ${Number(entry.action.points) || 0} spin points.`;
    }
    const history = [{ label: entry.label, spinner: state.lastSpinner, spin: state.spinCount, at: now }, ...(state.history || [])].slice(0, 6);
    return { ...state, selectedIndex: index, currentResult: entry.label, currentResultAction: entry.action || null, currentResultPrompt: prompt, lastResult: entry.label, spinWinners: winners, spinPoints, history, playerSelections: {}, pendingSelectedIndex: null, isSpinning: false, spinSettledAt: now };
  }
  function timing(state, now = Date.now()) {
    const duration = Math.max(1500, Number(state.spinDurationMs) || 4800);
    const elapsed = Math.max(0, now - Number(state.lastSpinAt || now));
    return { duration, elapsed, animating: Boolean(state.isSpinning && elapsed < duration) };
  }
  const api = { entries, segments, spin, settle, timing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderSpinWheel = api;
})(typeof window === 'undefined' ? globalThis : window);
