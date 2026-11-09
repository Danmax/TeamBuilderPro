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

  const STRIKE_MS = 3000;
  function createFeedbackTracker() {
    let roomKey = null, stamp = 0;
    return (key, event, now = Date.now()) => {
      const nextStamp = Number(event?.stamp) || 0;
      if (roomKey !== key) { roomKey = key; stamp = nextStamp; return null; }
      if (!nextStamp || nextStamp <= stamp) return null;
      stamp = nextStamp;
      return now - nextStamp > STRIKE_MS || nextStamp - now > STRIKE_MS ? null : event.key;
    };
  }

  function createFeedback(preferences, sounds = {}) {
    const track = createFeedbackTracker();
    let context = null, overlay = null, timer = null;
    const players = new Map();
    function unlock() {
      try {
        const AudioContext = root.AudioContext || root.webkitAudioContext;
        if (!context && AudioContext) context = new AudioContext();
        if (context?.state === 'suspended') void context.resume().catch(() => {});
      } catch (_) { /* Browsers may require another user gesture. */ }
    }
    root.document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    root.document.addEventListener('keydown', unlock, { capture: true });
    function play(key) {
      const { muted, volume } = preferences();
      if (muted || !volume) return;
      if (['strike', 'correct', 'top'].includes(key)) {
        unlock();
        if (!context || context.state !== 'running') return;
        const start = context.currentTime;
        const notes = key === 'strike'
          ? [{ hz: 125, gain: .13, type: 'sawtooth', duration: .75 }, { hz: 147, gain: .08, type: 'square', duration: .75 }]
          : [{ hz: 1046.5, gain: .24, type: 'sine', duration: .85 }, { hz: 2093, gain: .09, type: 'sine', duration: .55 }, { hz: 3139.5, gain: .035, type: 'sine', duration: .35 }];
        notes.forEach(note => {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = note.type; oscillator.frequency.value = note.hz;
          gain.gain.setValueAtTime(.0001, start);
          gain.gain.exponentialRampToValueAtTime(note.gain * Math.max(.001, Math.min(1, volume)), start + .008);
          gain.gain.exponentialRampToValueAtTime(.0001, start + note.duration);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.start(start); oscillator.stop(start + note.duration + .02);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
      } else if (sounds[key]) {
        if (!players.has(key)) players.set(key, new root.Audio(sounds[key]));
        const audio = players.get(key); audio.volume = Math.max(0, Math.min(1, volume)); audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }
    function clear() {
      root.clearTimeout(timer); timer = null; overlay?.remove(); overlay = null;
    }
    function showStrike(count = 1) {
      clear();
      const strikes = Math.max(1, Math.min(3, Number(count) || 1));
      overlay = root.document.createElement('div');
      overlay.className = 'ff-strike-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `<div class="ff-strike-display" data-strikes="${strikes}">${Array.from({ length: strikes }, () => '<span class="ff-strike-tile"><span>✕</span></span>').join('')}</div>`;
      root.document.body.append(overlay);
      timer = root.setTimeout(clear, STRIKE_MS);
    }
    function update(key, state) {
      const event = track(key, state.lastSound);
      if (!event) return;
      if (event === 'strike') showStrike(state.strikes);
      play(event);
    }
    return { update, play, showStrike, clear, unlock };
  }

  const api = { REVEAL_MS, STRIKE_MS, createRevealTracker, createBoardRenderer, createFeedbackTracker, createFeedback };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamBuilderSurveyBoard = api;
})(typeof window === 'undefined' ? globalThis : window);
