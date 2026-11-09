(function (root) {
  const REVEAL_MS = 850;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  function createRevealTracker() {
    let roundKey = null, previous = [], starts = [];
    return (key, revealed, now = Date.now()) => {
      if (key !== roundKey) { roundKey = key; previous = revealed.map(Boolean); starts = []; }
      const elapsed = revealed.map((value, index) => {
        if (value && !previous[index]) starts[index] = now;
        if (!value) starts[index] = undefined;
        return value && starts[index] !== undefined && now - starts[index] < REVEAL_MS ? Math.max(0, now - starts[index]) : null;
      });
      previous = revealed.map(Boolean);
      return elapsed;
    };
  }

  function createBoardRenderer() {
    const track = createRevealTracker();
    return (question, revealed, canReveal, roundKey, now = Date.now()) => {
      const elapsed = track(roundKey, revealed, now);
      return Array.from({ length: 8 }, (_, index) => {
        const answer = question.answers[index];
        const position = `grid-row:${index % 4 + 1};grid-column:${Math.floor(index / 4) + 1};`;
        if (!answer) return `<div class="ff-answer ff-empty" style="${position}" aria-hidden="true"></div>`;
        const shown = Boolean(revealed[index]);
        const animating = elapsed[index] !== null && elapsed[index] !== undefined;
        const label = shown ? `${index + 1}. ${answer.text}, ${Number(answer.points) || 0} points` : `Answer ${index + 1}, hidden${canReveal ? '. Reveal answer' : ''}`;
        return `<button type="button" class="ff-answer ${shown ? 'ff-revealed' : ''} ${animating ? 'ff-revealing' : ''}" style="${position}--ff-delay:-${elapsed[index] || 0}ms;" data-action="survey-clash-reveal-answer" data-index="${index}" aria-label="${escape(label)}" ${shown || !canReveal ? 'disabled' : ''}>
          <span class="ff-flipper" aria-hidden="true"><span class="ff-face ff-front"><span class="ff-number">${index + 1}</span></span><span class="ff-face ff-back"><span class="ff-answer-text">${shown ? escape(answer.text) : ''}</span><span class="ff-points">${shown ? Number(answer.points) || 0 : ''}</span></span></span>
        </button>`;
      }).join('');
    };
  }

  const api = { REVEAL_MS, createRevealTracker, createBoardRenderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderSurveyBoard = api;
})(typeof window === 'undefined' ? globalThis : window);
