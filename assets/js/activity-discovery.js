(function (root) {
  const state = root.TEAM_BUILDER_DISCOVERY = { query: '', category: 'All' };
  const categories = {
    'Warm-ups': ['icebreaker', 'pulse-check', 'values-vote', 'emoji-charades', 'spin-wheel'],
    'Team games': ['lightning-trivia', 'regular-trivia', 'survey-clash', 'wordle', 'word-chain', 'team-jeopardy', 'cosmos-bound', 'space-cadet', 'bingo', 'memory'],
    'Card games': ['uno', 'blackjack', 'five-card-draw', 'texas-holdem', 'spades'],
    'Board games': [ 'tic-tac-toe-blitz', 'battleship', 'backgammon', 'checkers', 'chinese-checkers', 'connect-4', 'chess-lobby', 'rock-paper-scissors'],
    'Present & create': ['presentation', 'slides-studio', 'dj-booth', 'brainstorm-canvas']
  };
  root.applyActivityFilters = function () {
    const library = document.getElementById('activityLibrary');
    if (!library) return;
    let shown = 0;
    for (const card of library.querySelectorAll('[data-action]')) {
      const id = card.dataset.action.replace(/^start-/, '');
      const matches = (!categories[state.category] || categories[state.category].includes(id))
        && card.textContent.toLowerCase().includes(state.query.toLowerCase().trim());
      card.hidden = !matches;
      if (matches && card.style.display !== 'none') shown++;
    }
    const status = document.getElementById('activityFilterStatus');
    if (status) status.textContent = `${shown} ${shown === 1 ? 'activity' : 'activities'} available`;
    const empty = document.getElementById('activityEmptyState');
    if (empty) empty.hidden = shown > 0;
    for (const button of document.querySelectorAll('[data-activity-filter]')) {
      button.setAttribute('aria-pressed', String(button.dataset.activityFilter === state.category));
    }
  };
  document.addEventListener('input', event => {
    if (event.target.id !== 'activitySearch') return;
    state.query = event.target.value;
    root.applyActivityFilters();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-activity-filter]');
    if (!button) return;
    state.category = button.dataset.activityFilter;
    root.applyActivityFilters();
  });
})(window);
