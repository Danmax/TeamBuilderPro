function getDefaultCosmosBoundUiState() {
  return {
    contextKey: '',
    coordDraft: { x: '', y: '', z: '' },
    broadcastDraft: '',
    allowImmediateRender: false
  };
}


// COSMOS BOUND — STATE & HELPERS
// ═══════════════════════════════════════════

const COSMOS_BOUND_ROLES = ['CDR', 'PLT', 'ENG', 'NAV', 'SCI', 'COM', 'MED'];
const COSMOS_BOUND_ROLE_LABELS = {
  CDR: 'Commander', PLT: 'Pilot', ENG: 'Engineer', NAV: 'Navigator',
  SCI: 'Science', COM: 'Comms', MED: 'Medical'
};
const COSMOS_BOUND_SYSTEM_OWNER = {
  'life-support': 'ENG', gyro: 'ENG', fuel: 'ENG',
  comms: 'COM', shields: 'MED'
};
const COSMOS_BOUND_PHASE_LABELS = ['PRE-FLIGHT', 'IGNITION', 'LAUNCH', 'ORBIT', 'NAVIGATE', 'LANDING', 'COMPLETE'];
const COSMOS_BOUND_PHASE_PCT = [0, 14, 28, 43, 57, 71, 100];
const COSMOS_BOUND_ENCOUNTERS = [
  {
    id: 'asteroids',
    label: 'ASTEROID SHOWER',
    subtitle: 'Incoming debris — fire lasers to clear a path!',
    icon: '☄️',
    color: '#ff6b2b',
    duration: 15000,
    resolve: 'Tap asteroids to destroy them. StarFox is assisting!',
    targetHits: 10
  },
  {
    id: 'alien',
    label: 'ALIEN VESSEL DETECTED',
    subtitle: 'Unknown ship on approach — hail them!',
    icon: '👽',
    color: '#00ff88',
    duration: 6000,
    resolve: 'COM: Send a greeting broadcast to make contact.',
    targetHits: 0
  },
  {
    id: 'deathstar',
    label: 'DEATH STAR DETECTED',
    subtitle: 'Aim for the exhaust port — fire the proton torpedo!',
    icon: '💀',
    color: '#ff2244',
    duration: 15000,
    resolve: 'Click the exhaust port (green circle) to fire the torpedo!',
    targetHits: 0
  }
];
const COSMOS_BOUND_DESTINATIONS = {
  moon: {
    label: 'The Moon',
    difficulty: 'Easy',
    icon: '🌙',
    color: '#c0c0c0',
    orbitAlt: 250,
    travelTime: 2500,
    minThrottle: 50,
    landThrottle: 40,
    description: 'A short hop to our nearest neighbor',
    coords: { x: '384.4', y: '0.0', z: '12.1' },
    planet: { c1: '#d4d4d4', c2: '#a0a0a0', c3: '#808080', c4: '#555', ring: false }
  },
  mars: {
    label: 'Mars',
    difficulty: 'Advanced',
    icon: '🔴',
    color: '#e05030',
    orbitAlt: 400,
    travelTime: 4000,
    minThrottle: 70,
    landThrottle: 30,
    description: 'The red planet awaits — a true test of coordination',
    coords: { x: '227.9', y: '1.85', z: '49.6' },
    planet: { c1: '#e8a070', c2: '#c0603a', c3: '#903020', c4: '#501810', ring: false }
  },
  eridani: {
    label: 'Epsilon Eridani',
    difficulty: 'Extreme',
    icon: '🟣',
    color: '#b44dff',
    orbitAlt: 600,
    travelTime: 6000,
    minThrottle: 85,
    landThrottle: 20,
    description: 'A distant star system — only the best crews survive',
    coords: { x: '653.7', y: '328.1', z: '871.4' },
    planet: { c1: '#c9a0dc', c2: '#7b5ea7', c3: '#4a3072', c4: '#1a1040', ring: true }
  }
};

function cosmosBoundAssignRoles(names) {
  const roles = {};
  const ROLES = COSMOS_BOUND_ROLES;
  if (names.length >= 7) {
    names.forEach((name, i) => {
      const role = ROLES[i % ROLES.length];
      if (!roles[name]) roles[name] = [];
      roles[name].push(role);
    });
  } else {
    const distributions = {
      2: [['CDR','ENG','MED'], ['PLT','NAV','COM','SCI']],
      3: [['CDR','MED'], ['PLT','ENG'], ['NAV','COM','SCI']],
      4: [['CDR'], ['PLT','ENG'], ['NAV','COM'], ['SCI','MED']],
      5: [['CDR'], ['PLT'], ['ENG','MED'], ['NAV'], ['COM','SCI']],
      6: [['CDR'], ['PLT'], ['ENG'], ['NAV'], ['COM','SCI'], ['MED']]
    };
    const dist = distributions[names.length] || distributions[2];
    names.forEach((name, i) => {
      roles[name] = dist[i] || dist[dist.length - 1];
    });
  }
  return roles;
}

function createCosmosBoundState(participants) {
  const names = Array.from(new Set(
    (participants || [])
      .map(p => String(p?.name || '').trim())
      .filter(Boolean)
  ));
  const roles = cosmosBoundAssignRoles(names);
  const crewVitals = {};
  names.forEach(n => { crewVitals[n] = 'nominal'; });
  return {
    phase: 0,
    destination: 'mars',
    roles,
    systems: { 'life-support': false, comms: false, shields: false, gyro: false, fuel: false },
    throttle: 0,
    coords: { x: '', y: '', z: '' },
    coordsLocked: false,
    altitude: 0,
    velocity: 0,
    maxAlt: 0,
    maxVel: 0,
    missionStartedAt: null,
    targetCoords: COSMOS_BOUND_DESTINATIONS.mars.coords,
    log: [],
    countdownValue: null,
    broadcast: '',
    crewVitals,
    medReady: false,
    sciScanComplete: false,
    starSpeed: 0,
    planetPhase: 0,
    planetSize: 0,
    encounter: null,
    landedAt: 0,
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

const COSMOS_BOUND_CREW_NAMES = ['ALPHA', 'BETA', 'GAMMA', 'DELTA'];
const COSMOS_BOUND_CREW_COLORS = ['#00d4ff', '#ff6b2b', '#b44dff', '#00ff88'];

function createCosmosBoundCrewMissionState(members, destId) {
  const dest = COSMOS_BOUND_DESTINATIONS[destId] || COSMOS_BOUND_DESTINATIONS.mars;
  const roles = cosmosBoundAssignRoles(members);
  const crewVitals = {};
  members.forEach(n => { crewVitals[n] = 'nominal'; });
  return {
    phase: 0,
    roles,
    systems: { 'life-support': false, comms: false, shields: false, gyro: false, fuel: false },
    throttle: 0,
    coords: { x: '', y: '', z: '' },
    coordsLocked: false,
    altitude: 0,
    velocity: 0,
    maxAlt: 0,
    maxVel: 0,
    missionStartedAt: null,
    targetCoords: dest.coords,
    log: [],
    countdownValue: null,
    broadcast: '',
    crewVitals,
    medReady: false,
    sciScanComplete: false,
    starSpeed: 0,
    planetPhase: 0,
    planetSize: 0
  };
}

function cosmosBoundAutoSplitCrews(names, destId) {
  // Split into crews of 4-7
  const crewSize = names.length <= 14 ? Math.ceil(names.length / 2) : Math.ceil(names.length / Math.ceil(names.length / 7));
  const crews = {};
  const crewAssignments = {};
  let crewIdx = 0;
  for (let i = 0; i < names.length; i++) {
    if (i > 0 && i % crewSize === 0) crewIdx++;
    const crewId = COSMOS_BOUND_CREW_NAMES[crewIdx] || ('CREW-' + (crewIdx + 1));
    if (!crews[crewId]) crews[crewId] = { name: crewId, members: [], color: COSMOS_BOUND_CREW_COLORS[crewIdx] || '#00d4ff' };
    crews[crewId].members.push(names[i]);
    crewAssignments[names[i]] = crewId;
  }
  // Create mission state per crew
  const crewStates = {};
  for (const [crewId, crew] of Object.entries(crews)) {
    crewStates[crewId] = { ...createCosmosBoundCrewMissionState(crew.members, destId), name: crew.name, color: crew.color, members: crew.members };
  }
  return { crewStates, crewAssignments };
}

function getCosmosBoundMyCrewId(state) {
  if (!state?.multiCrew) return null;
  return (state.crewAssignments || {})[APP.player?.name || ''] || null;
}

function getCosmosBoundMyCrewState(state) {
  if (!state?.multiCrew) return state;
  const crewId = getCosmosBoundMyCrewId(state);
  return crewId ? (state.crews || {})[crewId] || state : state;
}

function getCosmosBoundRoles(state, playerName) {
  const effectiveState = state?.multiCrew ? getCosmosBoundMyCrewState(state) : state;
  const entry = effectiveState?.roles?.[playerName];
  return Array.isArray(entry) ? entry : (typeof entry === 'string' ? [entry] : []);
}

function getCosmosBoundMyRoles(state) {
  return getCosmosBoundRoles(state, APP.player?.name || '');
}

function getCosmosBoundTextDraftContextKey(rootState = APP.room?.activityState) {
  const state = rootState && typeof rootState === 'object' ? rootState : null;
  const crewState = getCosmosBoundMyCrewState(state) || state || {};
  const crewId = state?.multiCrew ? (getCosmosBoundMyCrewId(state) || 'solo') : 'solo';
  return [
    APP.roomCode || '',
    APP.room?.currentActivity || '',
    String(state?.startedAt || 0),
    crewId,
    state?.destination || 'mars',
    crewState.coordsLocked ? 'locked' : 'open'
  ].join(':');
}

function ensureCosmosBoundUiDraft(rootState = APP.room?.activityState) {
  if (!APP.cosmosBoundUi || typeof APP.cosmosBoundUi !== 'object') {
    APP.cosmosBoundUi = getDefaultCosmosBoundUiState();
  }
  const crewState = getCosmosBoundMyCrewState(rootState) || rootState || {};
  const nextContextKey = getCosmosBoundTextDraftContextKey(rootState);
  if (APP.cosmosBoundUi.contextKey !== nextContextKey) {
    APP.cosmosBoundUi.contextKey = nextContextKey;
    APP.cosmosBoundUi.coordDraft = {
      x: String(crewState.coords?.x || ''),
      y: String(crewState.coords?.y || ''),
      z: String(crewState.coords?.z || '')
    };
    APP.cosmosBoundUi.broadcastDraft = '';
  }
  return APP.cosmosBoundUi;
}

function getActiveCosmosBoundTextInput() {
  const activeEl = document.activeElement;
  if (!(activeEl instanceof HTMLElement)) return null;
  if (APP.room?.currentActivity !== 'cosmos-bound') return null;
  if (activeEl.id === 'cosmosBoundCoordX' || activeEl.id === 'cosmosBoundCoordY' || activeEl.id === 'cosmosBoundCoordZ' || activeEl.id === 'cosmosBroadcastInput') {
    return activeEl;
  }
  return null;
}

function cosmosBoundPlayerHasRole(state, playerName, role) {
  return getCosmosBoundRoles(state, playerName).includes(role);
}

function canCosmosBoundInteract(state, role) {
  return cosmosBoundPlayerHasRole(state, APP.player?.name || '', role);
}

function getCosmosBoundDest(state) {
  const destId = state?.destination || APP.room?.activityState?.destination || 'mars';
  return COSMOS_BOUND_DESTINATIONS[destId] || COSMOS_BOUND_DESTINATIONS.mars;
}

function cosmosBoundPreflightReady(state) {
  const dest = getCosmosBoundDest(state);
  const allSys = Object.values(state.systems || {}).every(v => v);
  return allSys && (state.throttle || 0) >= dest.minThrottle && state.coordsLocked && state.medReady && state.sciScanComplete;
}

function getCosmosBoundNextSteps(state, myRoles) {
  const phase = state.phase || 0;
  const dest = getCosmosBoundDest(state);
  const systems = state.systems || {};
  const steps = [];

  if (phase === 0) {
    // Pre-flight: each role has tasks
    if (myRoles.includes('ENG')) {
      const offSystems = ['life-support', 'gyro', 'fuel'].filter(s => !systems[s]);
      if (offSystems.length) steps.push({ role: 'ENG', text: 'Activate ' + offSystems.map(s => s.replace(/-/g, ' ').toUpperCase()).join(', '), urgent: true });
      else steps.push({ role: 'ENG', text: 'All systems online', done: true });
    }
    if (myRoles.includes('COM')) {
      if (!systems.comms) steps.push({ role: 'COM', text: 'Activate COMMS ARRAY', urgent: true });
      else steps.push({ role: 'COM', text: 'Comms online — broadcast when ready', done: true });
    }
    if (myRoles.includes('MED')) {
      if (!systems.shields) steps.push({ role: 'MED', text: 'Activate HEAT SHIELDS', urgent: true });
      else if (!state.medReady) steps.push({ role: 'MED', text: 'Confirm crew vitals', urgent: true });
      else steps.push({ role: 'MED', text: 'Crew cleared for launch', done: true });
    }
    if (myRoles.includes('PLT')) {
      if ((state.throttle || 0) < dest.minThrottle) steps.push({ role: 'PLT', text: 'Set throttle to ' + dest.minThrottle + '%+', urgent: true });
      else steps.push({ role: 'PLT', text: 'Throttle nominal at ' + (state.throttle || 0) + '%', done: true });
    }
    if (myRoles.includes('NAV')) {
      if (!state.coordsLocked) steps.push({ role: 'NAV', text: 'Enter coordinates (' + dest.coords.x + ', ' + dest.coords.y + ', ' + dest.coords.z + ') and lock', urgent: true });
      else steps.push({ role: 'NAV', text: 'Coordinates locked', done: true });
    }
    if (myRoles.includes('SCI')) {
      if (!state.sciScanComplete) steps.push({ role: 'SCI', text: 'Run systems scan when checklist is ready', urgent: true });
      else steps.push({ role: 'SCI', text: 'Scan complete — all nominal', done: true });
    }
    if (myRoles.includes('CDR')) {
      if (cosmosBoundPreflightReady(state)) steps.push({ role: 'CDR', text: 'ALL SYSTEMS GO — press IGNITE ENGINES', urgent: true });
      else steps.push({ role: 'CDR', text: 'Waiting for crew to complete pre-flight checks' });
    }
  } else if (phase === 1) {
    if (myRoles.includes('CDR')) steps.push({ role: 'CDR', text: 'Engines firing — press LAUNCH when ready', urgent: true });
    else steps.push({ text: 'Engines firing — awaiting CDR to launch' });
  } else if (phase === 2) {
    steps.push({ text: 'Ascending to orbit — hold steady' });
  } else if (phase === 3) {
    if (myRoles.includes('CDR')) steps.push({ role: 'CDR', text: 'Stable orbit — press SET COURSE for ' + dest.label, urgent: true });
    else steps.push({ text: 'Stable orbit — awaiting CDR to set course' });
  } else if (phase === 4) {
    steps.push({ text: 'In transit to ' + dest.label + ' — hold steady' });
  } else if (phase === 5) {
    if (myRoles.includes('PLT') && (state.throttle || 0) > dest.landThrottle) {
      steps.push({ role: 'PLT', text: 'Reduce throttle below ' + dest.landThrottle + '% for landing', urgent: true });
    }
    if (myRoles.includes('CDR')) {
      if ((state.throttle || 0) <= dest.landThrottle) steps.push({ role: 'CDR', text: 'Throttle safe — press INITIATE LANDING', urgent: true });
      else steps.push({ role: 'CDR', text: 'Waiting for PLT to reduce throttle below ' + dest.landThrottle + '%' });
    }
    if (!myRoles.includes('CDR') && !myRoles.includes('PLT')) {
      steps.push({ text: 'Approaching ' + dest.label + ' — preparing for landing' });
    }
  } else if (phase >= 5.5 && phase < 6) {
    steps.push({ text: 'Landing in progress — hold steady' });
  } else if (phase === 6) {
    steps.push({ text: 'Mission complete — ' + dest.label + ' reached!', done: true });
  }
  return steps;
}

function cosmosBoundAddLog(state, msg) {
  const log = Array.isArray(state.log) ? state.log : [];
  log.push({ t: Date.now(), msg });
  if (log.length > 30) log.splice(0, log.length - 30);
  state.log = log;
}

// Drop resilience: redistribute roles from disconnected crew to active members
let cosmosBoundLastParticipantCheck = 0;

function cosmosBoundCheckCrewIntegrity() {
  if (APP.room?.host !== APP.player?.name) return; // only host checks
  if (APP.room?.currentActivity !== 'cosmos-bound') return;
  const now = Date.now();
  if (now - cosmosBoundLastParticipantCheck < 3000) return; // throttle to every 3s
  cosmosBoundLastParticipantCheck = now;

  const state = APP.room.activityState;
  if (!state || !state.roles) return;
  const currentNames = new Set((APP.room.participants || []).map(p => String(p?.name || '').trim()).filter(Boolean));
  const roleNames = Object.keys(state.roles);
  const orphanedRoles = [];

  // Find roles belonging to disconnected players
  for (const name of roleNames) {
    if (!currentNames.has(name)) {
      const roles = getCosmosBoundRoles(state, name);
      orphanedRoles.push(...roles);
    }
  }
  if (orphanedRoles.length === 0) return;

  // Redistribute orphaned roles to active players
  cosmosBoundUpdateState(s => {
    const active = Object.keys(s.roles).filter(n => currentNames.has(n));
    if (active.length === 0) return;
    // Remove disconnected players
    for (const name of Object.keys(s.roles)) {
      if (!currentNames.has(name)) {
        cosmosBoundAddLog(s, name.toUpperCase() + ' DISCONNECTED — REDISTRIBUTING ROLES');
        delete s.roles[name];
      }
    }
    // Distribute orphaned roles round-robin to active players (fewest roles first)
    for (const role of orphanedRoles) {
      const activeList = Object.keys(s.roles).filter(n => currentNames.has(n));
      activeList.sort((a, b) => (s.roles[a]?.length || 0) - (s.roles[b]?.length || 0));
      const target = activeList[0];
      if (target) {
        if (!Array.isArray(s.roles[target])) s.roles[target] = [];
        if (!s.roles[target].includes(role)) {
          s.roles[target].push(role);
          cosmosBoundAddLog(s, role + ' ROLE REASSIGNED TO ' + target.toUpperCase());
        }
      }
    }
    // Also update crewVitals
    const vitals = s.crewVitals || {};
    for (const name of Object.keys(vitals)) {
      if (!currentNames.has(name)) delete vitals[name];
    }
    s.crewVitals = vitals;
  });
}

// Also handle new participants joining mid-mission
function cosmosBoundCheckNewMembers() {
  if (APP.room?.host !== APP.player?.name) return;
  if (APP.room?.currentActivity !== 'cosmos-bound') return;
  const state = APP.room.activityState;
  if (!state || !state.roles) return;
  const currentNames = (APP.room.participants || []).map(p => String(p?.name || '').trim()).filter(Boolean);
  const roleNames = new Set(Object.keys(state.roles));
  const newMembers = currentNames.filter(n => !roleNames.has(n));
  if (newMembers.length === 0) return;

  cosmosBoundUpdateState(s => {
    for (const name of newMembers) {
      // Assign them the role with fewest holders
      const roleCounts = {};
      COSMOS_BOUND_ROLES.forEach(r => { roleCounts[r] = 0; });
      for (const roles of Object.values(s.roles)) {
        if (Array.isArray(roles)) roles.forEach(r => { roleCounts[r] = (roleCounts[r] || 0) + 1; });
      }
      const leastRole = COSMOS_BOUND_ROLES.reduce((a, b) => (roleCounts[a] || 0) <= (roleCounts[b] || 0) ? a : b);
      s.roles[name] = [leastRole];
      if (!s.crewVitals) s.crewVitals = {};
      s.crewVitals[name] = 'nominal';
      cosmosBoundAddLog(s, name.toUpperCase() + ' JOINED CREW AS ' + leastRole);
    }
  });
}

// Module-level canvas/simulation state
let cosmosBoundAnimFrame = null;
let cosmosBoundCanvasCtx = null;
let cosmosBoundBgStars = [];
let cosmosBoundSimInterval = null;
let cosmosBoundLeverDragging = false;
let cosmosBoundLocalThrottle = 0;
let cosmosBoundBannerTimeout = null;
let cosmosBoundLocalPlanetSize = 0;
let cosmosBoundEncounterAsteroids = [];
let cosmosBoundStarfoxX = -100;
let cosmosBoundEncounterTimeout = null;
let cosmosBoundLaserTrails = []; // { x1,y1,x2,y2,color,t }
let cosmosBoundCrosshairPos = { x: 0, y: 0, active: false };
let cosmosBoundDeathStarExplosion = 0;
let cosmosBoundOverlayDismissed = false;
let cosmosBoundRocketLiftY = 0; // 0 = on pad, increases as rocket lifts off
let cosmosBoundCockpitTransition = 0; // 0-1, fades from exterior to cockpit view
let cosmosBoundAudioAmbient = null;
let cosmosBoundAudioLaunch = null;
let cosmosBoundLastAudioPhase = -1;
const cosmosBoundSfxCache = {};

function cosmosBoundInitAudio() {
  if (!cosmosBoundAudioAmbient) {
    cosmosBoundAudioAmbient = new Audio('/sounds/space-ship-bridge-loop-104525.mp3');
    cosmosBoundAudioAmbient.loop = true;
    cosmosBoundAudioAmbient.volume = 0.25;
  }
  if (!cosmosBoundAudioLaunch) {
    cosmosBoundAudioLaunch = new Audio('/sounds/Rocket-launch-306441.mp3');
    cosmosBoundAudioLaunch.loop = false;
    cosmosBoundAudioLaunch.volume = 0.5;
  }
}

// Play a one-shot sound effect
function cosmosBoundPlaySfx(name, volume = 0.4) {
  const paths = {
    beep: '/sounds/beep-sound-short-237619.mp3',
    beep1: '/sounds/eaglaxle-electronic-beep-1-453381.mp3',
    beep2: '/sounds/eaglaxle-electronic-beep-2-453382.mp3',
    beep3: '/sounds/eaglaxle-electronic-beep-3-453383.mp3',
    warp: '/sounds/freesound_community-cinematic-glitch-transition-sfx-27806.mp3',
    info: '/sounds/lubecin123-info-computer-sound-299367.mp3'
  };
  const path = paths[name];
  if (!path) return;
  // Reuse or create audio element
  if (!cosmosBoundSfxCache[name]) {
    cosmosBoundSfxCache[name] = new Audio(path);
  }
  const sfx = cosmosBoundSfxCache[name];
  sfx.currentTime = 0;
  sfx.volume = volume;
  sfx.play().catch(() => {});
}

function cosmosBoundSyncAudio(phase) {
  const p = Math.floor(phase);
  if (p === cosmosBoundLastAudioPhase) return;
  const prevPhase = cosmosBoundLastAudioPhase;
  cosmosBoundLastAudioPhase = p;
  cosmosBoundInitAudio();

  // Ambient bridge hum: plays during pre-flight and orbit+
  if (p >= 0 && p !== 2) {
    if (cosmosBoundAudioAmbient.paused) {
      cosmosBoundAudioAmbient.currentTime = 0;
      cosmosBoundAudioAmbient.play().catch(() => {});
    }
    cosmosBoundAudioAmbient.volume = p === 0 ? 0.15 : p >= 4 ? 0.3 : 0.25;
  }
  // Duck ambient during launch ascent
  if (p === 2) {
    cosmosBoundAudioAmbient.volume = 0.08;
  }

  // Phase transition SFX
  if (p === 1 && prevPhase === 0) {
    // Ignition
    cosmosBoundPlaySfx('beep3', 0.5);
    cosmosBoundAudioLaunch.currentTime = 0;
    cosmosBoundAudioLaunch.volume = 0.5;
    cosmosBoundAudioLaunch.play().catch(() => {});
  }
  if (p === 2 && prevPhase === 1) {
    // Launch — countdown beeps handled separately
    cosmosBoundPlaySfx('beep3', 0.5);
  }
  if (p === 3 && prevPhase <= 2) {
    // Orbit achieved
    cosmosBoundPlaySfx('info', 0.5);
    // Fade out rocket
    if (!cosmosBoundAudioLaunch.paused) {
      cosmosBoundAudioLaunch.volume = 0.1;
      setTimeout(() => { cosmosBoundAudioLaunch.pause(); cosmosBoundAudioLaunch.currentTime = 0; }, 1500);
    }
  }
  if (p === 4 && prevPhase === 3) {
    // Warp / navigate
    cosmosBoundPlaySfx('warp', 0.6);
  }
  if (p === 5 && prevPhase === 4) {
    // Arrived at destination
    cosmosBoundPlaySfx('info', 0.5);
    cosmosBoundAudioLaunch.currentTime = 0;
    cosmosBoundAudioLaunch.volume = 0.25;
    cosmosBoundAudioLaunch.play().catch(() => {});
  }
  if (p === 6) {
    // Mission complete
    cosmosBoundPlaySfx('info', 0.6);
    if (cosmosBoundAudioAmbient) {
      cosmosBoundAudioAmbient.volume = 0.1;
      setTimeout(() => { cosmosBoundAudioAmbient.pause(); }, 2000);
    }
    if (cosmosBoundAudioLaunch && !cosmosBoundAudioLaunch.paused) {
      cosmosBoundAudioLaunch.pause();
    }
  }
}

function cosmosBoundStopAudio() {
  cosmosBoundLastAudioPhase = -1;
  if (cosmosBoundAudioAmbient) {
    cosmosBoundAudioAmbient.pause();
    cosmosBoundAudioAmbient.currentTime = 0;
  }
  if (cosmosBoundAudioLaunch) {
    cosmosBoundAudioLaunch.pause();
    cosmosBoundAudioLaunch.currentTime = 0;
  }
}


// COSMOS BOUND — ACTION HANDLERS
// ═══════════════════════════════════════════

async function cosmosBoundUpdateState(mutator) {
  if (!APP.roomCode || !APP.room) return null;
  const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
  if (!room || room.currentActivity !== 'cosmos-bound') return null;
  const state = room.activityState && typeof room.activityState === 'object' ? room.activityState : {};
  if (typeof mutator === 'function') mutator(state);
  state.updatedAt = Date.now();
  room.activityState = state;
  await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
  APP.room = room;
  render();
  return room;
}

// Crew-aware update: mutator receives the player's crew sub-state in multi-crew mode
async function cosmosBoundUpdateCrewState(mutator) {
  return cosmosBoundUpdateState(state => {
    if (state.multiCrew) {
      const crewId = (state.crewAssignments || {})[APP.player?.name || ''];
      const crew = crewId && state.crews ? state.crews[crewId] : null;
      if (crew && typeof mutator === 'function') mutator(crew);
    } else {
      if (typeof mutator === 'function') mutator(state);
    }
  });
}

async function cosmosBoundBeginMission() {
  if (APP.room?.host !== APP.player?.name) return;
  await cosmosBoundUpdateState(state => {
    state.missionStartedAt = Date.now();
    if (state.multiCrew && state.crews) {
      for (const crew of Object.values(state.crews)) {
        crew.missionStartedAt = Date.now();
        cosmosBoundAddLog(crew, 'CREW ' + (crew.name || '?') + ' — MISSION CONTROL ONLINE');
        cosmosBoundAddLog(crew, 'ACTIVATE ALL SYSTEMS TO BEGIN');
      }
    } else {
      cosmosBoundAddLog(state, 'COSMOS BOUND MISSION CONTROL ONLINE');
      cosmosBoundAddLog(state, 'CREW OF ' + Object.keys(state.roles || {}).length + ' STANDING BY');
      cosmosBoundAddLog(state, 'ACTIVATE ALL SYSTEMS TO BEGIN');
    }
  });
}

async function cosmosBoundSetDestination(destId) {
  if (APP.room?.host !== APP.player?.name) return;
  const dest = COSMOS_BOUND_DESTINATIONS[destId];
  if (!dest) return;
  await cosmosBoundUpdateState(state => {
    state.destination = destId;
    state.targetCoords = dest.coords;
    state.coords = { x: '', y: '', z: '' };
    state.coordsLocked = false;
    // Update multi-crew states too
    if (state.multiCrew && state.crews) {
      for (const crew of Object.values(state.crews)) {
        crew.targetCoords = dest.coords;
        crew.coords = { x: '', y: '', z: '' };
        crew.coordsLocked = false;
      }
    }
  });
}

async function cosmosBoundToggleMultiCrew() {
  if (APP.room?.host !== APP.player?.name) return;
  await cosmosBoundUpdateState(state => {
    if (state.multiCrew) {
      // Disable multi-crew — revert to single crew
      state.multiCrew = false;
      delete state.crews;
      delete state.crewAssignments;
      // Re-assign roles for all participants
      const allNames = (APP.room.participants || []).map(p => String(p?.name || '').trim()).filter(Boolean);
      state.roles = cosmosBoundAssignRoles(allNames);
      const crewVitals = {};
      allNames.forEach(n => { crewVitals[n] = 'nominal'; });
      state.crewVitals = crewVitals;
    } else {
      // Enable multi-crew — auto-split into teams
      const allNames = (APP.room.participants || []).map(p => String(p?.name || '').trim()).filter(Boolean);
      const destId = state.destination || 'mars';
      const { crewStates, crewAssignments } = cosmosBoundAutoSplitCrews(allNames, destId);
      state.multiCrew = true;
      state.crews = crewStates;
      state.crewAssignments = crewAssignments;
    }
  });
}

async function cosmosBoundAssignRoleTo(playerName, role) {
  if (APP.room?.host !== APP.player?.name) return;
  if (!playerName || !role || !COSMOS_BOUND_ROLES.includes(role)) return;
  await cosmosBoundUpdateState(state => {
    const roles = state.roles || {};
    // Remove this role from whoever currently has it
    for (const name of Object.keys(roles)) {
      const arr = Array.isArray(roles[name]) ? roles[name] : [];
      roles[name] = arr.filter(r => r !== role);
    }
    // Add to target player
    if (!Array.isArray(roles[playerName])) roles[playerName] = [];
    roles[playerName].push(role);
    state.roles = roles;
  });
}

async function cosmosBoundToggleSystem(systemId) {
  const ownerRole = COSMOS_BOUND_SYSTEM_OWNER[systemId];
  if (!ownerRole) return;
  await cosmosBoundUpdateCrewState(cs => {
    if (!canCosmosBoundInteract(APP.room?.activityState, ownerRole)) return;
    if ((cs.phase || 0) >= 2) return;
    const systems = cs.systems || {};
    systems[systemId] = !systems[systemId];
    cs.systems = systems;
    cosmosBoundAddLog(cs, systemId.replace(/-/g, ' ').toUpperCase() + ': ' + (systems[systemId] ? 'ONLINE' : 'OFFLINE'));
  });
  cosmosBoundPlaySfx('beep', 0.35);
}

async function cosmosBoundLockCoordinates() {
  const cosmosUi = ensureCosmosBoundUiDraft(APP.room?.activityState);
  const xEl = document.getElementById('cosmosBoundCoordX');
  const yEl = document.getElementById('cosmosBoundCoordY');
  const zEl = document.getElementById('cosmosBoundCoordZ');
  const x = String(xEl ? xEl.value : cosmosUi.coordDraft?.x || '').trim();
  const y = String(yEl ? yEl.value : cosmosUi.coordDraft?.y || '').trim();
  const z = String(zEl ? zEl.value : cosmosUi.coordDraft?.z || '').trim();
  if (!x || !y || !z) {
    cosmosUi.allowImmediateRender = true;
    showError('All three coordinates (X, Y, Z) are required.');
    cosmosUi.allowImmediateRender = false;
    return;
  }
  cosmosUi.allowImmediateRender = true;
  try {
    await cosmosBoundUpdateCrewState(cs => {
      if (!canCosmosBoundInteract(APP.room?.activityState, 'NAV')) return;
      if (cs.coordsLocked) return;
      cs.coords = { x, y, z };
      cs.coordsLocked = true;
      cosmosBoundAddLog(cs, 'COORDINATES LOCKED: [' + x + ', ' + y + ', ' + z + ']');
    });
    cosmosUi.coordDraft = { x, y, z };
    cosmosBoundPlaySfx('beep1', 0.4);
  } finally {
    cosmosUi.allowImmediateRender = false;
  }
}


async function cosmosBoundBroadcast() {
  const cosmosUi = ensureCosmosBoundUiDraft(APP.room?.activityState);
  const input = document.getElementById('cosmosBroadcastInput');
  const msg = String(input ? input.value : cosmosUi.broadcastDraft || '').trim();
  if (!msg) return;
  cosmosUi.allowImmediateRender = true;
  try {
    await cosmosBoundUpdateCrewState(cs => {
      if (!canCosmosBoundInteract(APP.room?.activityState, 'COM')) return;
      cs.broadcast = msg;
      cosmosBoundAddLog(cs, 'COM BROADCAST: ' + msg);
    });
    cosmosUi.broadcastDraft = '';
    cosmosBoundPlaySfx('beep2', 0.3);
  } finally {
    cosmosUi.allowImmediateRender = false;
  }
}

async function cosmosBoundConfirmVitals() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!canCosmosBoundInteract(APP.room?.activityState, 'MED')) return;
    if (cs.medReady) return;
    cs.medReady = true;
    cosmosBoundAddLog(cs, 'MED: CREW VITALS NOMINAL — ALL CLEAR');
  });
  cosmosBoundPlaySfx('info', 0.4);
}

async function cosmosBoundSciScan() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!canCosmosBoundInteract(APP.room?.activityState, 'SCI')) return;
    if (cs.sciScanComplete) return;
    cs.sciScanComplete = true;
    cosmosBoundAddLog(cs, 'SCI: SYSTEMS SCAN COMPLETE — ALL NOMINAL');
  });
  cosmosBoundPlaySfx('info', 0.4);
}

async function cosmosBoundIgnite() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!canCosmosBoundInteract(APP.room?.activityState, 'CDR')) return;
    if ((cs.phase || 0) !== 0) return;
    if (!cosmosBoundPreflightReady(cs)) return;
    cs.phase = 1;
    cs.starSpeed = 0;
    cosmosBoundAddLog(cs, 'ENGINE IGNITION SEQUENCE INITIATED');
  });
  // After 2s, update to allow launch
  if (APP.room?.host === APP.player?.name) {
    setTimeout(async () => {
      await cosmosBoundUpdateCrewState(cs => {
        if (cs.phase !== 1) return;
        cosmosBoundAddLog(cs, 'ENGINE THRUST NOMINAL — LAUNCH AUTHORIZED');
      });
    }, 2000);
  }
}

async function cosmosBoundLaunch() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!canCosmosBoundInteract(APP.room?.activityState, 'CDR')) return;
    if (cs.phase !== 1) return;
    cs.phase = 2;
    cs.countdownValue = 5;
    cosmosBoundAddLog(cs, 'COUNTDOWN INITIATED: T-5');
  });
  // Host drives countdown
  if (APP.room?.host === APP.player?.name) {
    cosmosBoundRunCountdown();
  }
}

async function cosmosBoundRunCountdown() {
  let count = 4;
  const tick = async () => {
    await cosmosBoundUpdateCrewState(cs => {
      if (cs.phase !== 2) return;
      cs.countdownValue = count;
      if (count > 0) {
        cosmosBoundAddLog(cs, 'T-' + count);
        cosmosBoundPlaySfx(count <= 2 ? 'beep3' : 'beep2', count <= 2 ? 0.55 : 0.45);
      }
    });
    count--;
    if (count >= 0) {
      setTimeout(tick, 1000);
    } else {
      cosmosBoundActualLaunch();
    }
  };
  setTimeout(tick, 1000);
}

async function cosmosBoundActualLaunch() {
  await cosmosBoundUpdateCrewState(cs => {
    cs.countdownValue = null;
    cs.starSpeed = 3;
    cosmosBoundAddLog(cs, 'LIFTOFF! WE HAVE LIFTOFF!');
  });
  cosmosBoundPlaySfx('beep3', 0.6);
  // Boost rocket launch audio for liftoff
  cosmosBoundInitAudio();
  if (cosmosBoundAudioLaunch) {
    cosmosBoundAudioLaunch.currentTime = 0;
    cosmosBoundAudioLaunch.volume = 0.7;
    cosmosBoundAudioLaunch.play().catch(() => {});
  }
  cosmosBoundPlaySfx('warp', 0.4);
  // Start ascent simulation (host only)
  cosmosBoundStartAscent();
}

function cosmosBoundStartAscent() {
  if (APP.room?.host !== APP.player?.name) return;
  cosmosBoundClearSimInterval();
  cosmosBoundSimInterval = setInterval(async () => {
    const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
    if (!room || room.currentActivity !== 'cosmos-bound') { cosmosBoundClearSimInterval(); return; }
    const rootState = room.activityState;
    // Get the crew state to simulate (multi-crew: find the CDR's crew, single: use root)
    const cs = rootState.multiCrew
      ? (rootState.crews || {})[getCosmosBoundMyCrewId(rootState)] || null
      : rootState;
    if (!cs || cs.phase !== 2) { cosmosBoundClearSimInterval(); return; }
    cs.altitude = (cs.altitude || 0) + Math.random() * 15 + 5;
    cs.velocity = (cs.velocity || 0) + Math.random() * 200 + 100;
    cs.maxAlt = Math.max(cs.maxAlt || 0, cs.altitude);
    cs.maxVel = Math.max(cs.maxVel || 0, cs.velocity);
    const orbitAlt = getCosmosBoundDest(rootState).orbitAlt;
    if (cs.altitude >= orbitAlt) {
      cs.phase = 3;
      cs.starSpeed = 0.8;
      cosmosBoundAddLog(cs, 'STABLE ORBIT ACHIEVED — ALT ' + Math.round(cs.altitude) + ' km');
      cosmosBoundClearSimInterval();
    }
    rootState.updatedAt = Date.now();
    room.activityState = rootState;
    await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
    APP.room = room;
    render();
  }, 300);
}

async function cosmosBoundNavigate() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!canCosmosBoundInteract(APP.room?.activityState, 'CDR')) return;
    if (cs.phase !== 3) return;
    cs.phase = 4;
    cs.starSpeed = 6;
    cs.planetPhase = 1;
    cs.planetSize = 0;
    cosmosBoundAddLog(cs, 'COURSE SET FOR ' + getCosmosBoundDest(APP.room?.activityState).label.toUpperCase() + ' — ENGAGING MAIN DRIVE');
  });
  if (APP.room?.host === APP.player?.name) {
    cosmosBoundStartTravel();
  }
}

// ═══════════════════════════════════════════
// COSMOS BOUND — SPACE ENCOUNTERS
// ═══════════════════════════════════════════

function cosmosBoundTriggerEncounter() {
  if (APP.room?.host !== APP.player?.name) return;
  const enc = COSMOS_BOUND_ENCOUNTERS[Math.floor(Math.random() * COSMOS_BOUND_ENCOUNTERS.length)];
  cosmosBoundUpdateCrewState(cs => {
    if (cs.phase !== 4) return;
    cs.encounter = {
      id: enc.id,
      startedAt: Date.now(),
      hits: 0,
      resolved: false,
      asteroidPositions: enc.id === 'asteroids'
        ? Array.from({ length: 12 }, (_, i) => ({ id: i, x: Math.random() * 80 + 10, y: Math.random() * 60 + 10, alive: true, size: Math.random() * 18 + 14 }))
        : []
    };
    cosmosBoundAddLog(cs, enc.icon + ' ' + enc.label + ' — ' + enc.subtitle);
  });
  cosmosBoundPlaySfx('warp', 0.5);
  // Initialize local asteroid state
  cosmosBoundEncounterAsteroids = [];
  cosmosBoundStarfoxX = -100;
}

async function cosmosBoundHitAsteroid(asteroidId) {
  await cosmosBoundUpdateCrewState(cs => {
    if (!cs.encounter || cs.encounter.id !== 'asteroids' || cs.encounter.resolved) return;
    const ast = (cs.encounter.asteroidPositions || []).find(a => a.id === Number(asteroidId));
    if (!ast || !ast.alive) return;
    ast.alive = false;
    cs.encounter.hits = (cs.encounter.hits || 0) + 1;
    const enc = COSMOS_BOUND_ENCOUNTERS.find(e => e.id === 'asteroids');
    if (cs.encounter.hits >= (enc?.targetHits || 8)) {
      cs.encounter.resolved = true;
      cosmosBoundAddLog(cs, 'ALL CLEAR — ASTEROID FIELD NEUTRALIZED');
    }
  });
  cosmosBoundPlaySfx('beep3', 0.4);
}

async function cosmosBoundHailAlien() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!cs.encounter || cs.encounter.id !== 'alien' || cs.encounter.resolved) return;
    if (!canCosmosBoundInteract(APP.room?.activityState, 'COM')) return;
    cs.encounter.resolved = true;
    cosmosBoundAddLog(cs, 'COM: HAILING FREQUENCY OPEN — ALIEN VESSEL RESPONDS PEACEFULLY');
    cosmosBoundAddLog(cs, 'ALIEN: "SAFE TRAVELS, HUMANS. MAY THE STARS GUIDE YOU."');
  });
  cosmosBoundPlaySfx('info', 0.5);
}

async function cosmosBoundEvadeDeathStar() {
  await cosmosBoundUpdateCrewState(cs => {
    if (!cs.encounter || cs.encounter.id !== 'deathstar' || cs.encounter.resolved) return;
    if (!canCosmosBoundInteract(APP.room?.activityState, 'CDR')) return;
    cs.encounter.resolved = true;
    cosmosBoundAddLog(cs, 'DIRECT HIT ON EXHAUST PORT — TORPEDO AWAY!');
    cosmosBoundAddLog(cs, 'DEATH STAR DESTROYED! GREAT SHOT!');
  });
  cosmosBoundPlaySfx('beep3', 0.55);
}

// StarFox auto-assists by shooting random alive asteroids
function cosmosBoundStarfoxAutoShoot(cs) {
  if (!cs?.encounter || cs.encounter.id !== 'asteroids' || cs.encounter.resolved) return;
  const alive = (cs.encounter.asteroidPositions || []).filter(a => a.alive);
  if (alive.length === 0) return;
  // StarFox shoots one random asteroid every ~2s (called from sim interval)
  if (Math.random() < 0.15) {
    const target = alive[Math.floor(Math.random() * alive.length)];
    target.alive = false;
    cs.encounter.hits = (cs.encounter.hits || 0) + 1;
    cosmosBoundAddLog(cs, 'STARFOX: "I GOT ONE! KEEP FIRING!"');
    const enc = COSMOS_BOUND_ENCOUNTERS.find(e => e.id === 'asteroids');
    if (cs.encounter.hits >= (enc?.targetHits || 8)) {
      cs.encounter.resolved = true;
      cosmosBoundAddLog(cs, 'ALL CLEAR — ASTEROID FIELD NEUTRALIZED');
    }
  }
}

// Auto-resolve encounter after duration expires
function cosmosBoundCheckEncounterTimeout(cs) {
  if (!cs?.encounter || cs.encounter.resolved) return;
  const enc = COSMOS_BOUND_ENCOUNTERS.find(e => e.id === cs.encounter.id);
  if (!enc) return;
  if (Date.now() - cs.encounter.startedAt > enc.duration) {
    cs.encounter.resolved = true;
    if (cs.encounter.id === 'asteroids') {
      cosmosBoundAddLog(cs, 'STARFOX: "AREA CLEAR! LET\'S MOVE!"');
    } else if (cs.encounter.id === 'alien') {
      cosmosBoundAddLog(cs, 'ALIEN VESSEL PASSED — NO RESPONSE SENT');
    } else if (cs.encounter.id === 'deathstar') {
      cosmosBoundAddLog(cs, 'DEATH STAR MOVED ON — NARROW ESCAPE!');
    }
  }
}

function cosmosBoundStartTravel() {
  if (APP.room?.host !== APP.player?.name) return;
  cosmosBoundClearSimInterval();
  let travelTime = 0;
  cosmosBoundSimInterval = setInterval(async () => {
    const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
    if (!room || room.currentActivity !== 'cosmos-bound') { cosmosBoundClearSimInterval(); return; }
    const rootState = room.activityState;
    const cs = rootState.multiCrew
      ? (rootState.crews || {})[getCosmosBoundMyCrewId(rootState)] || null
      : rootState;
    if (!cs || cs.phase !== 4) { cosmosBoundClearSimInterval(); return; }
    travelTime += 300;
    cs.altitude = (cs.altitude || 0) + Math.random() * 100;
    cs.velocity = (cs.velocity || 0) + Math.random() * 500;
    cs.maxAlt = Math.max(cs.maxAlt || 0, cs.altitude);
    cs.maxVel = Math.max(cs.maxVel || 0, cs.velocity);
    // Encounter logic
    if (!cs.encounter && travelTime >= 1500 && travelTime < 2000) {
      // Trigger a random encounter mid-travel
      const enc = COSMOS_BOUND_ENCOUNTERS[Math.floor(Math.random() * COSMOS_BOUND_ENCOUNTERS.length)];
      cs.encounter = {
        id: enc.id,
        startedAt: Date.now(),
        hits: 0,
        resolved: false,
        asteroidPositions: enc.id === 'asteroids'
          ? Array.from({ length: 12 }, (_, i) => ({ id: i, x: Math.random() * 80 + 10, y: Math.random() * 60 + 10, alive: true, size: Math.random() * 18 + 14 }))
          : []
      };
      cosmosBoundAddLog(cs, enc.icon + ' ' + enc.label + ' — ' + enc.subtitle);
    }
    if (cs.encounter && !cs.encounter.resolved) {
      cosmosBoundStarfoxAutoShoot(cs);
      cosmosBoundCheckEncounterTimeout(cs);
    }
    rootState.updatedAt = Date.now();
    const dest = getCosmosBoundDest(rootState);
    if (travelTime >= dest.travelTime && (!cs.encounter || cs.encounter.resolved)) {
      cs.encounter = null;
      cs.phase = 5;
      cs.starSpeed = 0.5;
      cs.planetPhase = 2;
      cs.velocity = Math.max((cs.velocity || 0) - 3000, 800);
      cosmosBoundAddLog(cs, dest.label.toUpperCase() + ' REACHED — PREPARE FOR LANDING');
      cosmosBoundAddLog(cs, 'REDUCE THROTTLE TO <' + dest.landThrottle + '% FOR LANDING');
      cosmosBoundClearSimInterval();
    }
    room.activityState = rootState;
    await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
    APP.room = room;
    render();
  }, 300);
}

async function cosmosBoundLand() {
  const rootState = APP.room?.activityState;
  if (!rootState) return;
  const cs = getCosmosBoundMyCrewState(rootState);
  if (!cs || cs.phase !== 5) return;
  const landThrottle = getCosmosBoundDest(rootState).landThrottle;
  if ((cs.throttle || 0) > landThrottle) {
    showError('Throttle too high for landing — PLT must reduce to below ' + landThrottle + '%.');
    return;
  }
  await cosmosBoundUpdateCrewState(crew => {
    if (!canCosmosBoundInteract(APP.room?.activityState, 'CDR')) return;
    crew.phase = 5.5;
    crew.planetPhase = 3;
    cosmosBoundAddLog(crew, 'LANDING SEQUENCE INITIATED — HOLD STEADY');
  });
  if (APP.room?.host === APP.player?.name) {
    cosmosBoundStartDescent();
  }
}

function cosmosBoundStartDescent() {
  if (APP.room?.host !== APP.player?.name) return;
  cosmosBoundClearSimInterval();
  let landTime = 0;
  cosmosBoundSimInterval = setInterval(async () => {
    const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
    if (!room || room.currentActivity !== 'cosmos-bound') { cosmosBoundClearSimInterval(); return; }
    const rootState = room.activityState;
    const cs = rootState.multiCrew
      ? (rootState.crews || {})[getCosmosBoundMyCrewId(rootState)] || null
      : rootState;
    if (!cs || cs.phase !== 5.5) { cosmosBoundClearSimInterval(); return; }
    landTime += 300;
    cs.altitude = Math.max((cs.altitude || 0) - 50, 0);
    cs.velocity = Math.max((cs.velocity || 0) - 100, 0);
    rootState.updatedAt = Date.now();
    if (landTime >= 4000) {
      cs.phase = 6;
      cs.altitude = 0;
      cs.velocity = 0;
      cs.starSpeed = 0;
      cs.landedAt = Date.now();
      const landDest = getCosmosBoundDest(rootState);
      cosmosBoundAddLog(cs, 'TOUCHDOWN ON ' + landDest.label.toUpperCase() + ' — MISSION COMPLETE');
      cosmosBoundClearSimInterval();
    }
    room.activityState = rootState;
    await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
    APP.room = room;
    render();
  }, 300);
}

async function cosmosBoundRestart() {
  if (APP.room?.host !== APP.player?.name) return;
  cosmosBoundClearSimInterval();
  const room = await RoomManager.loadRoom(APP.roomCode, APP.roomAccessToken || '');
  if (!room || room.currentActivity !== 'cosmos-bound') return;
  room.activityState = createCosmosBoundState(room.participants || []);
  await RoomManager.updateRoom(APP.roomCode, room, APP.roomAccessToken || '');
  APP.room = room;
  cosmosBoundBgStars = [];
  render();
}

async function cosmosBoundSyncThrottle() {
  if (!APP.roomCode) return;
  await cosmosBoundUpdateCrewState(cs => {
    cs.throttle = cosmosBoundLocalThrottle;
  });
}

function cosmosBoundClearSimInterval() {
  if (cosmosBoundSimInterval) {
    clearInterval(cosmosBoundSimInterval);
    cosmosBoundSimInterval = null;
  }
}

// ═══════════════════════════════════════════
// COSMOS BOUND — CANVAS & POST-RENDER
// ═══════════════════════════════════════════

function teardownCosmosBoundSimulation() {
  if (cosmosBoundAnimFrame) {
    cancelAnimationFrame(cosmosBoundAnimFrame);
    cosmosBoundAnimFrame = null;
  }
  cosmosBoundClearSimInterval();
  cosmosBoundCanvasCtx = null;
  cosmosBoundBgStars = [];
  cosmosBoundLocalPlanetSize = 0;
  if (cosmosBoundBannerTimeout) {
    clearTimeout(cosmosBoundBannerTimeout);
    cosmosBoundBannerTimeout = null;
  }
  cosmosBoundStopAudio();
}

function initCosmosBoundPostRender() {
  if (APP.room?.currentActivity !== 'cosmos-bound') return;
  // Check crew integrity (host only, throttled)
  cosmosBoundCheckCrewIntegrity();
  cosmosBoundCheckNewMembers();
  // Sync audio to current phase
  const crewState = getCosmosBoundMyCrewState(APP.room?.activityState) || APP.room?.activityState || {};
  if (crewState.missionStartedAt) {
    cosmosBoundSyncAudio(crewState.phase || 0);
  }
  // Re-render after 5s to show mission complete overlay (landing scene plays first)
  if (crewState.phase === 6 && crewState.landedAt && (Date.now() - crewState.landedAt < 5500)) {
    const remaining = 5100 - (Date.now() - crewState.landedAt);
    if (remaining > 0) setTimeout(() => render(), remaining);
  }
  const canvas = document.getElementById('cosmosBoundCanvas');
  if (!canvas) return;

  const container = canvas.parentElement;
  if (container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }

  cosmosBoundCanvasCtx = canvas.getContext('2d');

  // Asteroid click handler
  if (!canvas.dataset.cbClickBound) {
    canvas.dataset.cbClickBound = 'true';
    // Crosshair tracking
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      cosmosBoundCrosshairPos = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    });
    canvas.addEventListener('mouseleave', () => { cosmosBoundCrosshairPos.active = false; });
    // Shooting: asteroids + death star exhaust port
    canvas.addEventListener('click', (e) => {
      const crewState = getCosmosBoundMyCrewState(APP.room?.activityState) || {};
      const enc = crewState.encounter;
      if (!enc || enc.resolved) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const canvasX = px * (canvas.width / rect.width);
      const canvasY = py * (canvas.height / rect.height);

      if (enc.id === 'asteroids') {
        const cx = px / rect.width * 100;
        const cy = py / rect.height * 100;
        const hit = (enc.asteroidPositions || []).find(a => a.alive && Math.hypot(a.x - cx, a.y - cy) < (a.size / 100 * 80 + 4));
        const laserColor = Math.random() > 0.5 ? '#00ff66' : '#ff3344';
        cosmosBoundLaserTrails.push({ x1: canvas.width / 2, y1: canvas.height - 20, x2: canvasX, y2: canvasY, color: laserColor, t: Date.now() });
        cosmosBoundPlaySfx('beep1', 0.3);
        if (hit) cosmosBoundHitAsteroid(hit.id);
      } else if (enc.id === 'deathstar') {
        // Check if click is on the exhaust port (superlaser dish area)
        const dsX = canvas.width * 0.5 - 65 * 0.35;
        const dsY = canvas.height * 0.38 - 65 * 0.25;
        const dist = Math.hypot(canvasX - dsX, canvasY - dsY);
        // Fire torpedo trail
        cosmosBoundLaserTrails.push({ x1: canvas.width / 2, y1: canvas.height - 20, x2: canvasX, y2: canvasY, color: '#00ff66', t: Date.now() });
        cosmosBoundPlaySfx('beep1', 0.35);
        if (dist < 25) {
          // Direct hit on exhaust port!
          cosmosBoundDeathStarExplosion = Date.now();
          cosmosBoundPlaySfx('warp', 0.7);
          cosmosBoundEvadeDeathStar();
        }
      }
    });
  }
  // Set crosshair cursor during shooting encounters
  const crewSt = getCosmosBoundMyCrewState(APP.room?.activityState) || {};
  const isShootingEnc = crewSt.encounter && !crewSt.encounter.resolved && (crewSt.encounter.id === 'asteroids' || crewSt.encounter.id === 'deathstar');
  canvas.style.cursor = isShootingEnc ? 'crosshair' : 'default';

  if (cosmosBoundBgStars.length === 0) {
    cosmosBoundBgStars = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5 + 0.3,
      speed: Math.random() * 2 + 0.5,
      brightness: Math.random() * 0.5 + 0.5
    }));
  }

  if (cosmosBoundAnimFrame) cancelAnimationFrame(cosmosBoundAnimFrame);
  drawCosmosBoundSpace();
  attachCosmosBoundLeverListeners();
}

function drawCosmosBoundSpace() {
  const ctx = cosmosBoundCanvasCtx;
  if (!ctx) return;
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const rootState = APP.room?.activityState || {};
  const state = getCosmosBoundMyCrewState(rootState) || rootState;
  const starSpeed = state.starSpeed || 0;
  const phase = state.phase || 0;
  const planetPhase = state.planetPhase || 0;
  if (planetPhase === 0) cosmosBoundLocalPlanetSize = 0;

  ctx.clearRect(0, 0, w, h);

  // Helper: draw sky + ground + clouds + tower scene
  function drawEarthScene(groundOffset) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#1a3a6a');
    skyGrad.addColorStop(0.3, '#3a7abf');
    skyGrad.addColorStop(0.6, '#6ab4e8');
    skyGrad.addColorStop(0.85, '#a8d8f0');
    skyGrad.addColorStop(1, '#c8e8f8');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);
    // Clouds
    const t = Date.now() / 4000;
    for (let i = 0; i < 5; i++) {
      const cx = ((t * 8 + i * 200) % (w + 200)) - 100;
      const cy = h * 0.15 + i * h * 0.1 + groundOffset * 0.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 60 + i * 10, 16 + i * 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 30, cy - 6, 40, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const gy = h - 50 + groundOffset;
    // Ground
    ctx.fillStyle = '#3a5030';
    ctx.fillRect(0, gy, w, h - gy + 50);
    // Concrete pad
    ctx.fillStyle = '#606060';
    ctx.fillRect(w / 2 - 60, gy, 120, h - gy + 50);
    ctx.fillStyle = '#888';
    ctx.fillRect(w / 2 - 40, gy + 2, 80, 3);
    // Launch tower
    ctx.fillStyle = '#777';
    ctx.fillRect(w / 2 + 50, gy - 90, 8, 140);
    ctx.fillRect(w / 2 + 42, gy - 90, 24, 6);
    ctx.fillRect(w / 2 + 42, gy - 50, 20, 4);
    ctx.fillStyle = '#999';
    ctx.fillRect(w / 2 + 20, gy - 65, 32, 3);
  }

  // Helper: draw the rocket ship
  function drawRocket(rx, ry, scale) {
    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(scale, scale);
    // Nose cone
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.bezierCurveTo(-8, -35, -10, -20, -10, 0);
    ctx.lineTo(10, 0);
    ctx.bezierCurveTo(10, -20, 8, -35, 0, -50);
    ctx.closePath();
    const noseGrad = ctx.createLinearGradient(-10, -50, 10, 0);
    noseGrad.addColorStop(0, '#ff4444');
    noseGrad.addColorStop(1, '#cc2222');
    ctx.fillStyle = noseGrad;
    ctx.fill();
    // Body
    ctx.beginPath();
    ctx.rect(-10, 0, 20, 55);
    const bodyGrad = ctx.createLinearGradient(-10, 0, 10, 0);
    bodyGrad.addColorStop(0, '#e0e0e0');
    bodyGrad.addColorStop(0.3, '#ffffff');
    bodyGrad.addColorStop(0.7, '#f0f0f0');
    bodyGrad.addColorStop(1, '#c0c0c0');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    // Window
    ctx.beginPath();
    ctx.arc(0, 15, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#3399ff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 15, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Stripe
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(-10, 35, 20, 4);
    // Fins
    ctx.beginPath();
    ctx.moveTo(-10, 40);
    ctx.lineTo(-22, 60);
    ctx.lineTo(-10, 55);
    ctx.closePath();
    ctx.fillStyle = '#dd3333';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, 40);
    ctx.lineTo(22, 60);
    ctx.lineTo(10, 55);
    ctx.closePath();
    ctx.fillStyle = '#dd3333';
    ctx.fill();
    // Engine nozzle
    ctx.beginPath();
    ctx.moveTo(-7, 55);
    ctx.lineTo(-9, 62);
    ctx.lineTo(9, 62);
    ctx.lineTo(7, 55);
    ctx.closePath();
    ctx.fillStyle = '#555';
    ctx.fill();
    ctx.restore();
  }

  // ── PHASE 0-1: EARTH — ROCKET ON PAD ──
  if (phase <= 1) {
    cosmosBoundRocketLiftY = 0;
    cosmosBoundCockpitTransition = 0;
    drawEarthScene(0);
    // Dim high-altitude stars
    cosmosBoundBgStars.forEach(s => {
      if (s.y > h * 0.25) return;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.brightness * 0.08})`;
      ctx.fill();
    });
    // Rocket on the pad
    drawRocket(w / 2, h - 112, 1);
  }

  // ── PHASE 2: LAUNCH — ROCKET LIFTS OFF, THEN CAMERA SWITCHES TO COCKPIT VIEW ──
  if (phase === 2) {
    const alt = state.altitude || 0;
    // Phase 2 has two stages:
    // Stage A (alt 0-80): exterior view — rocket lifts off the pad, ground scrolls down
    // Stage B (alt 80-200): transition to cockpit — rocket zooms toward camera, fade to cockpit space view
    // Stage C (alt 200+): full cockpit space view
    const extEnd = 80;
    const transEnd = 200;

    if (alt < extEnd) {
      // Stage A: exterior liftoff
      cosmosBoundRocketLiftY = alt * 3;
      const groundOffset = cosmosBoundRocketLiftY * 0.5;
      drawEarthScene(groundOffset);
      // Rocket rising
      const rocketY = (h - 112) - cosmosBoundRocketLiftY;
      drawRocket(w / 2, rocketY, 1);
      // Exhaust from rocket
      const ex = w / 2;
      const ey2 = rocketY + 62;
      for (let i = 0; i < 4; i++) {
        const len = 30 + Math.random() * 40;
        const spread = 8;
        ctx.beginPath();
        ctx.moveTo(ex - spread, ey2);
        ctx.lineTo(ex + spread, ey2);
        ctx.lineTo(ex + (Math.random() - 0.5) * 6, ey2 + len);
        ctx.closePath();
        const fg = ctx.createLinearGradient(ex, ey2, ex, ey2 + len);
        fg.addColorStop(0, `rgba(255,${160 + Math.random() * 80},50,.8)`);
        fg.addColorStop(0.5, 'rgba(255,100,20,.4)');
        fg.addColorStop(1, 'rgba(255,50,0,0)');
        ctx.fillStyle = fg;
        ctx.fill();
      }
      // Ground smoke
      const t = Date.now() / 1000;
      for (let i = 0; i < 8; i++) {
        const age = (t * 1.2 + i * 0.5) % 2.5;
        const sx = w / 2 + Math.sin(t * 2 + i * 1.7) * (30 + age * 50);
        const sy = h - 20 + groundOffset - age * 10;
        const sr = 15 + age * 25;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,170,160,${Math.max(0, 0.3 - age * 0.12)})`;
        ctx.fill();
      }
    } else if (alt < transEnd) {
      // Stage B: transition — rocket approaching camera + fade to cockpit
      const blend = (alt - extEnd) / (transEnd - extEnd); // 0 to 1
      cosmosBoundCockpitTransition = blend;
      // Draw darkening sky behind
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, `rgba(${Math.round(26 * (1 - blend))},${Math.round(58 * (1 - blend))},${Math.round(106 * (1 - blend) + 14 * blend)},1)`);
      skyGrad.addColorStop(1, `rgba(${Math.round(168 * (1 - blend))},${Math.round(216 * (1 - blend))},${Math.round(240 * (1 - blend))},1)`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);
      // Stars fading in
      cosmosBoundBgStars.forEach(s => {
        s.y += s.speed * starSpeed;
        if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${s.brightness * blend})`;
        ctx.fill();
      });
      // Rocket zooming toward camera (growing bigger, moving to center)
      const rocketScale = 1 + blend * 6;
      const rocketY = h * 0.5 - blend * h * 0.3;
      if (blend < 0.7) {
        drawRocket(w / 2, rocketY, rocketScale);
        // Big exhaust
        const ey2 = rocketY + 62 * rocketScale;
        for (let i = 0; i < 3; i++) {
          const len = (40 + Math.random() * 30) * rocketScale;
          const spread = 10 * rocketScale;
          ctx.beginPath();
          ctx.moveTo(w / 2 - spread, ey2);
          ctx.lineTo(w / 2 + spread, ey2);
          ctx.lineTo(w / 2 + (Math.random() - 0.5) * spread, ey2 + len);
          ctx.closePath();
          const fg = ctx.createLinearGradient(w / 2, ey2, w / 2, ey2 + len);
          fg.addColorStop(0, `rgba(255,${160 + Math.random() * 80},50,.7)`);
          fg.addColorStop(1, 'rgba(255,50,0,0)');
          ctx.fillStyle = fg;
          ctx.fill();
        }
      }
      // Earth receding below
      const earthSize = Math.max(300 - alt, 80);
      const ey = h + alt * 0.8;
      ctx.beginPath();
      ctx.arc(w / 2, ey, earthSize, 0, Math.PI * 2);
      const eg = ctx.createRadialGradient(w / 2, ey, earthSize * 0.2, w / 2, ey, earthSize);
      eg.addColorStop(0, '#1a5fb4');
      eg.addColorStop(0.4, '#26a269');
      eg.addColorStop(0.7, '#1a5fb4');
      eg.addColorStop(1, '#0d2b5e');
      ctx.fillStyle = eg;
      ctx.fill();
      // White flash at full transition
      if (blend > 0.85) {
        ctx.fillStyle = `rgba(255,255,255,${(blend - 0.85) / 0.15 * 0.6})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      // Stage C: full cockpit space view — ascending
      cosmosBoundCockpitTransition = 1;
      cosmosBoundBgStars.forEach(s => {
        s.y += s.speed * starSpeed;
        if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,220,255,${s.brightness})`;
        ctx.fill();
      });
      // Earth below receding
      const earthSize = Math.max(400 - alt * 0.6, 60);
      const ey = h + alt * 0.5;
      ctx.beginPath();
      ctx.arc(w / 2, ey, earthSize, 0, Math.PI * 2);
      const eg = ctx.createRadialGradient(w / 2, ey, earthSize * 0.2, w / 2, ey, earthSize);
      eg.addColorStop(0, '#1a5fb4');
      eg.addColorStop(0.4, '#26a269');
      eg.addColorStop(0.7, '#1a5fb4');
      eg.addColorStop(1, '#0d2b5e');
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w / 2, ey, earthSize + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,180,255,.15)';
      ctx.lineWidth = 12;
      ctx.stroke();
    }
  }

  // ── DEEP SPACE (phases 3+) ──
  if (phase >= 3) {
    cosmosBoundCockpitTransition = 1;
    cosmosBoundBgStars.forEach(s => {
      s.y += s.speed * starSpeed;
      if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
      if (s.y < 0) { s.y = h; s.x = Math.random() * w; }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${s.brightness * (starSpeed > 0.5 ? 1 : 0.6)})`;
      ctx.fill();
    });
    // Small Earth in distance during orbit
    if (phase === 3) {
      ctx.beginPath();
      ctx.arc(w / 2, h + 30, 50, 0, Math.PI * 2);
      const eg = ctx.createRadialGradient(w / 2, h + 30, 10, w / 2, h + 30, 50);
      eg.addColorStop(0, '#1a5fb4');
      eg.addColorStop(0.5, '#26a269');
      eg.addColorStop(0.8, '#1a5fb4');
      eg.addColorStop(1, '#0d2b5e');
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w / 2, h + 30, 56, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,180,255,.12)';
      ctx.lineWidth = 8;
      ctx.stroke();
    }
  }

  // Destination planet
  if (planetPhase >= 1) {
    if (planetPhase === 1) cosmosBoundLocalPlanetSize = Math.min(cosmosBoundLocalPlanetSize + 0.3, 120);
    else if (planetPhase === 2 && cosmosBoundLocalPlanetSize < 120) cosmosBoundLocalPlanetSize = Math.min(cosmosBoundLocalPlanetSize + 0.5, 120);
    else if (planetPhase === 3) cosmosBoundLocalPlanetSize = Math.min(cosmosBoundLocalPlanetSize + 1, Math.max(w, h) * 1.5);
    const ps = Math.max(cosmosBoundLocalPlanetSize, 1);
    const py = planetPhase === 3 ? h / 2 : h * 0.3;
    ctx.beginPath();
    ctx.arc(w / 2, py, ps, 0, Math.PI * 2);
    const pg = ctx.createRadialGradient(w / 2 - ps * 0.3, py - ps * 0.3, ps * 0.1, w / 2, py, ps);
    const destPlanet = (COSMOS_BOUND_DESTINATIONS[rootState.destination] || COSMOS_BOUND_DESTINATIONS.mars).planet;
    pg.addColorStop(0, destPlanet.c1);
    pg.addColorStop(0.3, destPlanet.c2);
    pg.addColorStop(0.7, destPlanet.c3);
    pg.addColorStop(1, destPlanet.c4);
    ctx.fillStyle = pg;
    ctx.fill();
    if (destPlanet.ring && ps > 20) {
      ctx.beginPath();
      ctx.ellipse(w / 2, py, ps * 1.6, ps * 0.3, -0.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180,140,220,.25)';
      ctx.lineWidth = ps * 0.08;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(w / 2, py, ps + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(180,140,255,.12)';
    ctx.lineWidth = 10;
    ctx.stroke();
  }

  // Engine ignition smoke (phase 1) — smoke around rocket on pad
  if (phase === 1) {
    const ex = w / 2;
    const ey2 = h - 50; // rocket engine nozzle position on pad
    const t = Date.now() / 1000;
    // Smoke clouds billowing from rocket base
    for (let i = 0; i < 10; i++) {
      const age = (t * 0.8 + i * 0.35) % 3;
      const sx = ex + Math.sin(t * 1.2 + i * 2.3) * (15 + age * 30) + (Math.random() - 0.5) * 8;
      const sy = ey2 - age * 30;
      const sr = 8 + age * 20;
      const alpha = Math.max(0, 0.4 - age * 0.13);
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,190,180,${alpha})`;
      ctx.fill();
    }
    // Engine glow under rocket
    for (let i = 0; i < 2; i++) {
      const len = 10 + Math.random() * 12;
      ctx.beginPath();
      ctx.moveTo(ex - 4, ey2);
      ctx.lineTo(ex + 4, ey2);
      ctx.lineTo(ex + (Math.random() - 0.5) * 3, ey2 + len);
      ctx.closePath();
      const fg = ctx.createLinearGradient(ex, ey2, ex, ey2 + len);
      fg.addColorStop(0, `rgba(255,${180 + Math.random() * 60},80,.7)`);
      fg.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = fg;
      ctx.fill();
    }
    // Heat haze on pad
    ctx.fillStyle = `rgba(255,120,40,${0.04 + Math.sin(t * 3) * 0.02})`;
    ctx.fillRect(w / 2 - 60, h - 52, 120, 4);
  }

  // ── LANDING DESTINATION SCENES (phase 6) ──
  if (phase === 6) {
    const destId = rootState.destination || 'mars';
    const t = Date.now() / 1000;

    if (destId === 'moon') {
      // Moon surface + astronaut playing golf
      // Surface
      ctx.fillStyle = '#c0bbb0';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      // Craters
      for (let i = 0; i < 6; i++) {
        const cx = w * 0.1 + i * w * 0.16;
        const cy = h * 0.78 + (i % 2) * 15;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 20 + i * 5, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#a8a498';
        ctx.fill();
      }
      // Earth in sky
      ctx.beginPath();
      ctx.arc(w * 0.8, h * 0.18, 30, 0, Math.PI * 2);
      const eg = ctx.createRadialGradient(w * 0.8, h * 0.18, 6, w * 0.8, h * 0.18, 30);
      eg.addColorStop(0, '#3388dd'); eg.addColorStop(0.5, '#22aa66'); eg.addColorStop(1, '#1155aa');
      ctx.fillStyle = eg; ctx.fill();
      // Astronaut
      const ax = w * 0.45;
      const ay = h * 0.65;
      // Body (white suit)
      ctx.fillStyle = '#eee';
      ctx.fillRect(ax - 8, ay, 16, 20);
      // Helmet
      ctx.beginPath(); ctx.arc(ax, ay - 2, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#eee'; ctx.fill();
      // Visor
      ctx.beginPath(); ctx.arc(ax + 2, ay - 3, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700'; ctx.fill();
      // Legs
      ctx.fillStyle = '#ddd';
      ctx.fillRect(ax - 7, ay + 20, 5, 12);
      ctx.fillRect(ax + 2, ay + 20, 5, 12);
      // Waving arm
      const waveAngle = Math.sin(t * 3) * 0.3;
      ctx.save(); ctx.translate(ax + 8, ay + 4); ctx.rotate(-0.8 + waveAngle);
      ctx.fillStyle = '#eee'; ctx.fillRect(0, -2, 14, 4);
      // Glove
      ctx.fillStyle = '#ccc'; ctx.fillRect(12, -3, 5, 6);
      ctx.restore();
      // Golf club in other hand
      ctx.save(); ctx.translate(ax - 8, ay + 8); ctx.rotate(0.3);
      ctx.fillStyle = '#888'; ctx.fillRect(-2, 0, 2, 25);
      ctx.fillStyle = '#aaa'; ctx.fillRect(-4, 24, 8, 3);
      ctx.restore();
      // Golf ball
      ctx.beginPath(); ctx.arc(ax - 20, h * 0.72, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      // Flag in distance
      ctx.fillStyle = '#888'; ctx.fillRect(w * 0.7, h * 0.62, 2, 30);
      ctx.fillStyle = '#ff3333'; ctx.fillRect(w * 0.7 + 2, h * 0.62, 12, 8);

    } else if (destId === 'mars') {
      // Mars surface + astronaut on potato farm
      // Red surface
      const marsGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
      marsGrad.addColorStop(0, '#c0603a'); marsGrad.addColorStop(1, '#8a3a20');
      ctx.fillStyle = marsGrad;
      ctx.fillRect(0, h * 0.68, w, h * 0.32);
      // Red mountains background
      ctx.beginPath(); ctx.moveTo(0, h * 0.68);
      ctx.lineTo(w * 0.15, h * 0.55); ctx.lineTo(w * 0.3, h * 0.65);
      ctx.lineTo(w * 0.5, h * 0.52); ctx.lineTo(w * 0.7, h * 0.62);
      ctx.lineTo(w * 0.85, h * 0.50); ctx.lineTo(w, h * 0.60);
      ctx.lineTo(w, h * 0.68); ctx.closePath();
      ctx.fillStyle = '#904828'; ctx.fill();
      // Potato rows
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
          const px = w * 0.15 + col * w * 0.09;
          const py = h * 0.76 + row * 22;
          // Plant
          ctx.fillStyle = '#4a8030';
          ctx.fillRect(px - 1, py - 8, 3, 8);
          ctx.beginPath(); ctx.arc(px, py - 10, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#5a9040'; ctx.fill();
          // Mound
          ctx.beginPath(); ctx.ellipse(px, py + 2, 8, 4, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#a85838'; ctx.fill();
        }
      }
      // Habitat dome in background
      ctx.beginPath(); ctx.arc(w * 0.82, h * 0.66, 28, Math.PI, 0);
      ctx.fillStyle = 'rgba(200,200,200,.3)'; ctx.fill();
      ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.stroke();
      // Astronaut
      const ax = w * 0.4;
      const ay = h * 0.63;
      // Boots
      ctx.fillStyle = '#885533';
      ctx.fillRect(ax - 7, ay + 32, 6, 5);
      ctx.fillRect(ax + 2, ay + 32, 6, 5);
      // Legs (suit is more orange-tinted for Mars)
      ctx.fillStyle = '#e08050';
      ctx.fillRect(ax - 6, ay + 20, 5, 12);
      ctx.fillRect(ax + 2, ay + 20, 5, 12);
      // Body
      ctx.fillStyle = '#e08050';
      ctx.fillRect(ax - 8, ay, 16, 20);
      // Helmet
      ctx.beginPath(); ctx.arc(ax, ay - 2, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#eee'; ctx.fill();
      // Visor
      ctx.beginPath(); ctx.arc(ax + 2, ay - 3, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#3399ff'; ctx.fill();
      // Waving arm
      const wv = Math.sin(t * 2.5) * 0.35;
      ctx.save(); ctx.translate(ax + 8, ay + 4); ctx.rotate(-0.9 + wv);
      ctx.fillStyle = '#e08050'; ctx.fillRect(0, -2, 14, 4);
      ctx.fillStyle = '#ccc'; ctx.fillRect(12, -3, 5, 6);
      ctx.restore();
      // Other arm holding potato
      ctx.save(); ctx.translate(ax - 8, ay + 6); ctx.rotate(0.4);
      ctx.fillStyle = '#e08050'; ctx.fillRect(-2, 0, 4, 10);
      ctx.fillStyle = '#b8884a';
      ctx.beginPath(); ctx.ellipse(0, 13, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (destId === 'eridani') {
      // Alien world + rocky creature (4-legged stone golem with green bioluminescence)
      // Alien terrain
      const alienGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      alienGrad.addColorStop(0, '#2a1040'); alienGrad.addColorStop(1, '#1a0828');
      ctx.fillStyle = alienGrad;
      ctx.fillRect(0, h * 0.65, w, h * 0.35);
      // Strange rock formations
      for (let i = 0; i < 5; i++) {
        const rx = w * 0.1 + i * w * 0.2;
        const rh = 30 + Math.sin(i * 2.1) * 20;
        ctx.beginPath();
        ctx.moveTo(rx - 8, h * 0.65);
        ctx.lineTo(rx - 3, h * 0.65 - rh);
        ctx.lineTo(rx + 3, h * 0.65 - rh + 5);
        ctx.lineTo(rx + 10, h * 0.65);
        ctx.closePath();
        ctx.fillStyle = '#3a2050';
        ctx.fill();
      }
      // Glowing pools
      for (let i = 0; i < 3; i++) {
        const gx = w * 0.2 + i * w * 0.3;
        const gy = h * 0.8 + i * 8;
        ctx.beginPath(); ctx.ellipse(gx, gy, 18, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,136,${0.15 + Math.sin(t * 2 + i) * 0.05})`;
        ctx.fill();
      }
      // Alien nebula in sky
      ctx.beginPath(); ctx.arc(w * 0.3, h * 0.2, 60, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,80,255,.06)'; ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.7, h * 0.15, 40, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,200,255,.04)'; ctx.fill();

      // Rocky alien creature — 4-legged stone golem with green glow
      const cx = w * 0.5;
      const cy = h * 0.6;
      const bobY = Math.sin(t * 1.5) * 3;
      // Four legs
      const legPositions = [[-35, 25], [-18, 30], [18, 30], [35, 25]];
      legPositions.forEach(([lx, ly], i) => {
        const legWalk = Math.sin(t * 2 + i * 1.5) * 3;
        // Leg segments
        ctx.beginPath();
        ctx.moveTo(cx + lx * 0.5, cy + bobY);
        ctx.quadraticCurveTo(cx + lx * 0.8, cy + ly * 0.6 + bobY, cx + lx, cy + ly + legWalk);
        ctx.lineTo(cx + lx + 5, cy + ly + legWalk);
        ctx.quadraticCurveTo(cx + lx * 0.8 + 4, cy + ly * 0.6 + bobY, cx + lx * 0.5 + 6, cy + bobY);
        ctx.closePath();
        const lg = ctx.createLinearGradient(cx + lx * 0.5, cy, cx + lx, cy + ly);
        lg.addColorStop(0, '#8a7a60'); lg.addColorStop(0.5, '#6a5a40'); lg.addColorStop(1, '#4a3a28');
        ctx.fillStyle = lg; ctx.fill();
        // Green glow spots on legs
        ctx.beginPath();
        ctx.arc(cx + lx * 0.7, cy + ly * 0.4 + bobY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,136,${0.4 + Math.sin(t * 3 + i * 2) * 0.3})`;
        ctx.fill();
        // Foot pad
        ctx.beginPath();
        ctx.ellipse(cx + lx, cy + ly + legWalk + 2, 7, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2a18'; ctx.fill();
      });
      // Main body — large rounded stone torso
      ctx.beginPath();
      ctx.ellipse(cx, cy - 8 + bobY, 28, 20, 0, 0, Math.PI * 2);
      const bodyGrad = ctx.createRadialGradient(cx - 8, cy - 14 + bobY, 4, cx, cy - 8 + bobY, 28);
      bodyGrad.addColorStop(0, '#a09080'); bodyGrad.addColorStop(0.4, '#7a6a55');
      bodyGrad.addColorStop(0.8, '#5a4a38'); bodyGrad.addColorStop(1, '#3a2a1a');
      ctx.fillStyle = bodyGrad; ctx.fill();
      // Stone cracks on body
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx - 12, cy - 16 + bobY); ctx.lineTo(cx - 5, cy + 2 + bobY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 8, cy - 18 + bobY); ctx.lineTo(cx + 14, cy - 2 + bobY); ctx.stroke();
      // Head bump
      ctx.beginPath();
      ctx.ellipse(cx, cy - 26 + bobY, 14, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#8a7a65'; ctx.fill();
      // Green glow spots on body
      const glowSpots = [[- 10, -14], [12, -10], [-5, 2], [8, 4], [0, -28], [-16, -4], [18, -6]];
      glowSpots.forEach(([gx, gy], i) => {
        const pulse = 0.3 + Math.sin(t * 2.5 + i * 1.3) * 0.4;
        ctx.beginPath();
        ctx.arc(cx + gx, cy + gy + bobY, 2.5 + Math.sin(t * 3 + i) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,136,${pulse})`;
        ctx.fill();
        // Glow aura
        ctx.beginPath();
        ctx.arc(cx + gx, cy + gy + bobY, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,136,${pulse * 0.15})`;
        ctx.fill();
      });
    }
  }

  // ── ENCOUNTER RENDERING ──
  const encounter = state.encounter;
  if (encounter && !encounter.resolved) {
    if (encounter.id === 'asteroids') {
      // Draw asteroids
      (encounter.asteroidPositions || []).forEach(ast => {
        if (!ast.alive) return;
        const ax = (ast.x / 100) * w;
        const ay = (ast.y / 100) * h;
        const sz = ast.size || 16;
        ctx.beginPath();
        ctx.arc(ax, ay, sz, 0, Math.PI * 2);
        const ag = ctx.createRadialGradient(ax - sz * 0.3, ay - sz * 0.3, sz * 0.1, ax, ay, sz);
        ag.addColorStop(0, '#9a8060');
        ag.addColorStop(0.6, '#6b5030');
        ag.addColorStop(1, '#3a2810');
        ctx.fillStyle = ag;
        ctx.fill();
        // Crater detail
        ctx.beginPath();
        ctx.arc(ax + sz * 0.2, ay - sz * 0.1, sz * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fill();
      });
      // Draw StarFox arwing
      cosmosBoundStarfoxX += 1.5;
      if (cosmosBoundStarfoxX > w + 50) cosmosBoundStarfoxX = -50;
      const sfx = cosmosBoundStarfoxX;
      const sfy = h * 0.75 + Math.sin(Date.now() / 300) * 10;
      // Arwing body
      ctx.beginPath();
      ctx.moveTo(sfx + 20, sfy);
      ctx.lineTo(sfx - 12, sfy - 8);
      ctx.lineTo(sfx - 8, sfy);
      ctx.lineTo(sfx - 12, sfy + 8);
      ctx.closePath();
      ctx.fillStyle = '#8af1ff';
      ctx.fill();
      // Wings
      ctx.beginPath();
      ctx.moveTo(sfx - 6, sfy - 6);
      ctx.lineTo(sfx - 16, sfy - 16);
      ctx.lineTo(sfx - 12, sfy - 5);
      ctx.closePath();
      ctx.fillStyle = '#5bc0de';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sfx - 6, sfy + 6);
      ctx.lineTo(sfx - 16, sfy + 16);
      ctx.lineTo(sfx - 12, sfy + 5);
      ctx.closePath();
      ctx.fillStyle = '#5bc0de';
      ctx.fill();
      // Engine glow
      ctx.beginPath();
      ctx.arc(sfx - 14, sfy, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,212,255,${0.5 + Math.random() * 0.5})`;
      ctx.fill();
      // StarFox laser bolt (occasionally)
      if (Math.random() < 0.1) {
        const targetAst = (encounter.asteroidPositions || []).find(a => a.alive);
        if (targetAst) {
          const tx = (targetAst.x / 100) * w;
          const ty = (targetAst.y / 100) * h;
          ctx.beginPath();
          ctx.moveTo(sfx + 20, sfy);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = 'rgba(0,255,100,.8)';
          ctx.lineWidth = 2;
          ctx.stroke();
          // Impact flash
          ctx.beginPath();
          ctx.arc(tx, ty, 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,255,100,.4)';
          ctx.fill();
        }
      }
      // Player laser trails
      const now = Date.now();
      cosmosBoundLaserTrails = cosmosBoundLaserTrails.filter(l => now - l.t < 400);
      cosmosBoundLaserTrails.forEach(l => {
        const age = (now - l.t) / 400;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1);
        ctx.lineTo(l.x2, l.y2);
        ctx.strokeStyle = l.color === '#00ff66'
          ? `rgba(0,255,102,${0.9 - age * 0.8})`
          : `rgba(255,51,68,${0.9 - age * 0.8})`;
        ctx.lineWidth = 3 - age * 2;
        ctx.stroke();
        // Impact flash at target
        if (age < 0.3) {
          ctx.beginPath();
          ctx.arc(l.x2, l.y2, 8 - age * 20, 0, Math.PI * 2);
          ctx.fillStyle = l.color === '#00ff66' ? 'rgba(0,255,102,.5)' : 'rgba(255,51,68,.5)';
          ctx.fill();
        }
      });
      // Crosshair
      if (cosmosBoundCrosshairPos.active) {
        const chx = cosmosBoundCrosshairPos.x * (w / canvas.clientWidth);
        const chy = cosmosBoundCrosshairPos.y * (h / canvas.clientHeight);
        ctx.strokeStyle = 'rgba(0,255,102,.6)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(chx - 12, chy); ctx.lineTo(chx - 4, chy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx + 4, chy); ctx.lineTo(chx + 12, chy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx, chy - 12); ctx.lineTo(chx, chy - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx, chy + 4); ctx.lineTo(chx, chy + 12); ctx.stroke();
        ctx.beginPath(); ctx.arc(chx, chy, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,255,102,.3)';
        ctx.stroke();
      }
    } else if (encounter.id === 'alien') {
      // Draw alien saucer
      const ax = w * 0.5 + Math.sin(Date.now() / 600) * 40;
      const ay = h * 0.35 + Math.cos(Date.now() / 400) * 15;
      // Saucer body
      ctx.beginPath();
      ctx.ellipse(ax, ay, 50, 16, 0, 0, Math.PI * 2);
      const sg = ctx.createRadialGradient(ax, ay - 5, 5, ax, ay, 50);
      sg.addColorStop(0, '#88ffaa');
      sg.addColorStop(0.5, '#226644');
      sg.addColorStop(1, '#0a3320');
      ctx.fillStyle = sg;
      ctx.fill();
      // Dome
      ctx.beginPath();
      ctx.arc(ax, ay - 12, 18, Math.PI, 0);
      ctx.fillStyle = 'rgba(100,255,180,.3)';
      ctx.fill();
      // Lights
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(ax + i * 12, ay + 8, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = (Date.now() / 200 + i) % 3 < 1 ? '#00ff88' : '#004422';
        ctx.fill();
      }
      // Beam
      ctx.beginPath();
      ctx.moveTo(ax - 15, ay + 16);
      ctx.lineTo(ax + 15, ay + 16);
      ctx.lineTo(ax + 40, ay + 90);
      ctx.lineTo(ax - 40, ay + 90);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,255,136,.06)';
      ctx.fill();
    } else if (encounter.id === 'deathstar') {
      const dx = w * 0.5;
      const dy = h * 0.38;
      const dr = 65;
      const exploding = cosmosBoundDeathStarExplosion > 0;
      const explodeAge = exploding ? (Date.now() - cosmosBoundDeathStarExplosion) / 1000 : 0;

      if (!exploding || explodeAge < 2.5) {
        // Draw Death Star (shaking if exploding)
        const shake = exploding ? (Math.random() - 0.5) * explodeAge * 8 : 0;
        const shakeY = exploding ? (Math.random() - 0.5) * explodeAge * 8 : 0;
        const ddx = dx + shake;
        const ddy = dy + shakeY;
        ctx.beginPath();
        ctx.arc(ddx, ddy, dr, 0, Math.PI * 2);
        const dg = ctx.createRadialGradient(ddx - dr * 0.3, ddy - dr * 0.3, dr * 0.1, ddx, ddy, dr);
        dg.addColorStop(0, '#888'); dg.addColorStop(0.5, '#555'); dg.addColorStop(1, '#222');
        ctx.fillStyle = dg; ctx.fill();
        // Equatorial trench
        ctx.beginPath();
        ctx.ellipse(ddx, ddy + 2, dr, dr * 0.08, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.stroke();
        // Surface detail panels
        for (let i = 0; i < 8; i++) {
          const px = ddx + Math.cos(i * 0.8) * dr * 0.5;
          const py = ddy + Math.sin(i * 0.8) * dr * 0.4;
          ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 0.5;
          ctx.strokeRect(px - 4, py - 3, 8, 6);
        }
        // Superlaser dish (exhaust port — THE TARGET)
        const portX = ddx - dr * 0.35;
        const portY = ddy - dr * 0.25;
        ctx.beginPath();
        ctx.arc(portX, portY, dr * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#2a2a2a'; ctx.fill();
        // Pulsing target — green exhaust port
        const targetPulse = 0.3 + Math.sin(Date.now() / 200) * 0.25;
        ctx.beginPath();
        ctx.arc(portX, portY, dr * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,0,${targetPulse})`; ctx.fill();
        // Target ring indicator
        ctx.beginPath();
        ctx.arc(portX, portY, dr * 0.18, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,255,100,${0.3 + Math.sin(Date.now() / 150) * 0.2})`;
        ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        // "AIM HERE" label
        if (!exploding) {
          ctx.font = '8px Orbitron, sans-serif';
          ctx.fillStyle = 'rgba(0,255,100,.6)';
          ctx.textAlign = 'center';
          ctx.fillText('EXHAUST PORT', portX, portY + dr * 0.3 + 10);
          ctx.fillText('▼ AIM HERE ▼', portX, portY + dr * 0.3 + 20);
        }
        // Danger glow
        ctx.beginPath();
        ctx.arc(ddx, ddy, dr + 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,34,68,${0.15 + Math.sin(Date.now() / 200) * 0.1})`;
        ctx.lineWidth = 4; ctx.stroke();

        // Explosion fire blooming from port if hit
        if (exploding) {
          for (let i = 0; i < 6; i++) {
            const eRad = explodeAge * 30 + i * 8;
            const ex = portX + (Math.random() - 0.5) * explodeAge * 30;
            const ey = portY + (Math.random() - 0.5) * explodeAge * 30;
            ctx.beginPath();
            ctx.arc(ex, ey, eRad, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0
              ? `rgba(255,${100 + Math.random() * 100},0,${0.6 - explodeAge * 0.2})`
              : `rgba(255,255,${Math.random() * 100},${0.5 - explodeAge * 0.15})`;
            ctx.fill();
          }
        }
      }

      // Full explosion — Death Star destroyed
      if (exploding && explodeAge >= 1.5) {
        const blastRad = (explodeAge - 1.5) * 120;
        // Expanding fireball
        for (let ring = 0; ring < 4; ring++) {
          const r = blastRad - ring * 15;
          if (r <= 0) continue;
          ctx.beginPath();
          ctx.arc(dx, dy, r, 0, Math.PI * 2);
          const colors = ['rgba(255,200,50,.4)', 'rgba(255,100,20,.3)', 'rgba(255,50,0,.2)', 'rgba(200,0,0,.1)'];
          ctx.fillStyle = colors[ring] || colors[3];
          ctx.fill();
        }
        // Debris particles
        for (let i = 0; i < 15; i++) {
          const angle = i * 0.42 + explodeAge * 0.3;
          const dist = explodeAge * 40 + i * 5;
          const debX = dx + Math.cos(angle) * dist;
          const debY = dy + Math.sin(angle) * dist;
          ctx.beginPath();
          ctx.arc(debX, debY, 2 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${150 + Math.random() * 100},${80 + Math.random() * 80},${Math.random() * 50},${Math.max(0, 0.8 - explodeAge * 0.2)})`;
          ctx.fill();
        }
        // Flash
        if (explodeAge < 2) {
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.3 - (explodeAge - 1.5) * 0.6)})`;
          ctx.fillRect(0, 0, w, h);
        }
        // Reset after explosion completes
        if (explodeAge > 3.5) {
          cosmosBoundDeathStarExplosion = 0;
        }
      }

      // Laser trails + crosshair (reuse from asteroids)
      const now = Date.now();
      cosmosBoundLaserTrails = cosmosBoundLaserTrails.filter(l => now - l.t < 400);
      cosmosBoundLaserTrails.forEach(l => {
        const age = (now - l.t) / 400;
        ctx.beginPath();
        ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2);
        ctx.strokeStyle = `rgba(0,255,102,${0.9 - age * 0.8})`;
        ctx.lineWidth = 3 - age * 2; ctx.stroke();
        if (age < 0.3) {
          ctx.beginPath(); ctx.arc(l.x2, l.y2, 8 - age * 20, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,255,102,.5)'; ctx.fill();
        }
      });
      // Crosshair
      if (cosmosBoundCrosshairPos.active) {
        const chx = cosmosBoundCrosshairPos.x * (w / canvas.clientWidth);
        const chy = cosmosBoundCrosshairPos.y * (h / canvas.clientHeight);
        ctx.strokeStyle = 'rgba(255,50,50,.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(chx - 14, chy); ctx.lineTo(chx - 5, chy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx + 5, chy); ctx.lineTo(chx + 14, chy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx, chy - 14); ctx.lineTo(chx, chy - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(chx, chy + 5); ctx.lineTo(chx, chy + 14); ctx.stroke();
        ctx.beginPath(); ctx.arc(chx, chy, 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,50,50,.3)'; ctx.stroke();
      }
    }
  }

  cosmosBoundAnimFrame = requestAnimationFrame(drawCosmosBoundSpace);
}

function attachCosmosBoundLeverListeners() {
  const track = document.getElementById('cosmosBoundLeverTrack');
  if (!track || track.dataset.cbBound === 'true') return;
  track.dataset.cbBound = 'true';

  const onStart = (e) => {
    const state = APP.room?.activityState;
    if (!state || !canCosmosBoundInteract(state, 'PLT')) return;
    const phase = state.phase || 0;
    if (phase >= 2 && phase !== 5 && phase !== 5.5) return;
    cosmosBoundLeverDragging = true;
    cosmosBoundLocalThrottle = state.throttle || 0;
    cosmosBoundMoveLever(e);

    const onMove = (ev) => { cosmosBoundMoveLever(ev); ev.preventDefault(); };
    const onEnd = () => {
      cosmosBoundLeverDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      cosmosBoundSyncThrottle();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  track.addEventListener('mousedown', onStart);
  track.addEventListener('touchstart', onStart);
}

function cosmosBoundMoveLever(e) {
  if (!cosmosBoundLeverDragging) return;
  const track = document.getElementById('cosmosBoundLeverTrack');
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const clientY = (e.touches ? e.touches[0] : e).clientY;
  let pct = 1 - (clientY - rect.top) / rect.height;
  pct = Math.max(0, Math.min(1, pct));
  cosmosBoundLocalThrottle = Math.round(pct * 100);

  // Update DOM directly for responsiveness
  const fill = track.querySelector('.cb-lever-fill');
  const handle = track.querySelector('.cb-lever-handle');
  const valEl = track.parentElement?.querySelector('.cb-lever-value');
  if (fill) fill.style.height = cosmosBoundLocalThrottle + '%';
  if (handle) handle.style.bottom = `calc(${cosmosBoundLocalThrottle}% - 6px)`;
  if (valEl) valEl.textContent = cosmosBoundLocalThrottle + '%';
}

function cosmosBoundShowBanner(text, sub) {
  const banner = document.getElementById('cosmosBoundBanner');
  const textEl = document.getElementById('cosmosBoundBannerText');
  const subEl = document.getElementById('cosmosBoundBannerSub');
  if (!banner || !textEl) return;
  textEl.textContent = text;
  if (subEl) subEl.textContent = sub || '';
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  if (cosmosBoundBannerTimeout) clearTimeout(cosmosBoundBannerTimeout);
  cosmosBoundBannerTimeout = setTimeout(() => banner.classList.remove('show'), 2500);
}


function renderCosmosBound() {
  const isHost = APP.room.host === APP.player.name;
  const state = APP.room.activityState && typeof APP.room.activityState === 'object'
    ? APP.room.activityState
    : createCosmosBoundState(APP.room.participants || []);
  const me = APP.player?.name || '';
  const participants = APP.room.participants || [];

  // Multi-crew: show assignment or cockpit for player's crew
  if (state.multiCrew) {
    if (!state.missionStartedAt) {
      const allNames = (participants).map(p => String(p?.name || '').trim()).filter(Boolean);
      return renderCosmosBoundCrewAssignment(state, isHost, me, allNames, participants);
    }
    const crewState = getCosmosBoundMyCrewState(state);
    const myRoles = getCosmosBoundMyRoles(state);
    const names = Object.keys(crewState.roles || {});
    const phase = crewState.phase || 0;
    const cockpit = renderCosmosBoundCockpit(crewState, isHost, me, myRoles, phase, names,
      myRoles.includes('CDR'), myRoles.includes('PLT'), myRoles.includes('ENG'),
      myRoles.includes('NAV'), myRoles.includes('SCI'), myRoles.includes('COM'), myRoles.includes('MED'));
    const scoreboard = renderCosmosBoundScoreboard(state);
    return scoreboard + cockpit;
  }

  // Single crew mode
  const myRoles = getCosmosBoundMyRoles(state);
  const phase = state.phase || 0;
  const names = Object.keys(state.roles || {});

  if (phase === 0 && !state.missionStartedAt) {
    return renderCosmosBoundCrewAssignment(state, isHost, me, names, participants);
  }
  return renderCosmosBoundCockpit(state, isHost, me, myRoles, phase, names,
    myRoles.includes('CDR'), myRoles.includes('PLT'), myRoles.includes('ENG'),
    myRoles.includes('NAV'), myRoles.includes('SCI'), myRoles.includes('COM'), myRoles.includes('MED'));
}

function renderCosmosBoundScoreboard(state) {
  const crews = state.crews || {};
  const myCrewId = getCosmosBoundMyCrewId(state);
  const cards = Object.entries(crews).map(([crewId, crew]) => {
    const isMe = crewId === myCrewId;
    const phase = crew.phase || 0;
    const phaseLbl = COSMOS_BOUND_PHASE_LABELS[Math.min(Math.floor(phase), 6)] || 'STANDBY';
    const pct = COSMOS_BOUND_PHASE_PCT[Math.min(Math.floor(phase), 6)] || 0;
    const color = crew.color || '#00d4ff';
    return `
      <div style="flex:1;min-width:120px;padding:8px 10px;background:${isMe ? 'rgba(255,255,255,.04)' : 'var(--cb-hull)'};
        border:1px solid ${isMe ? color : 'var(--cb-panel-edge)'};border-radius:8px;text-align:center">
        <div style="font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:${color}">
          CREW ${crew.name || crewId}${isMe ? ' (YOU)' : ''}
        </div>
        <div style="font-size:9px;color:var(--cb-text-dim);margin:3px 0">${(crew.members || []).length} members</div>
        <div style="height:3px;background:var(--cb-panel-edge);border-radius:2px;overflow:hidden;margin:4px 0">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .5s"></div>
        </div>
        <div style="font-family:'Orbitron',sans-serif;font-size:7px;letter-spacing:1px;color:${phase >= 6 ? 'var(--cb-glow-green)' : 'var(--cb-text-mid)'}">
          ${phase >= 6 ? 'MISSION COMPLETE' : phaseLbl}
        </div>
      </div>
    `;
  }).join('');
  return `<div class="cosmos-bound" style="margin-bottom:8px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">${cards}</div>
  </div>`;
}

function renderCosmosBoundCrewAssignment(state, isHost, me, names, participants) {
  const roleOptions = COSMOS_BOUND_ROLES.map(r =>
    `<option value="${r}">${r} — ${COSMOS_BOUND_ROLE_LABELS[r]}</option>`
  ).join('');

  const crewRows = names.map(name => {
    const roles = getCosmosBoundRoles(state, name);
    const isMe = name === me;
    const badges = roles.map(r =>
      `<span class="cb-role-badge cb-role-${r}">${r}</span>`
    ).join(' ');
    const avatar = (participants.find(p => p.name === name) || {}).avatar || '';
    return `
      <div class="cb-crew-row${isMe ? ' is-me' : ''}">
        <span style="font-size:20px">${escapeHtml(avatar)}</span>
        <span class="cb-crew-name">${escapeHtml(name)}${isMe ? ' <span style="color:var(--cb-glow-blue);font-size:9px">(YOU)</span>' : ''}</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${badges}</div>
        ${isHost ? `<select class="cb-role-select" data-action="cosmos-assign-role" data-player="${escapeHtml(name)}"
          onchange="this.setAttribute('data-role', this.value); this.click()">
          <option value="">+ Role</option>${roleOptions}</select>` : ''}
      </div>
    `;
  }).join('');

  const currentDest = state.destination || 'mars';
  const destCards = Object.entries(COSMOS_BOUND_DESTINATIONS).map(([id, dest]) => {
    const selected = id === currentDest;
    const diffColors = { Easy: 'var(--cb-glow-green)', Advanced: 'var(--cb-glow-orange)', Extreme: 'var(--cb-glow-red)' };
    const diffColor = diffColors[dest.difficulty] || 'var(--cb-text-mid)';
    return `
      <div class="cb-dest-card${selected ? ' selected' : ''}" data-action="cosmos-set-destination" data-destination="${id}"
        style="flex:1;min-width:140px;padding:12px;background:${selected ? 'rgba(255,255,255,.04)' : 'var(--cb-hull)'};
        border:2px solid ${selected ? dest.color : 'var(--cb-panel-edge)'};border-radius:10px;cursor:${isHost ? 'pointer' : 'default'};
        text-align:center;transition:.3s;${selected ? 'box-shadow:0 0 20px ' + dest.color + '33;' : ''}
        ${!isHost ? 'pointer-events:none;' : ''}">
        <div style="font-size:28px;margin-bottom:4px">${dest.icon}</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:${selected ? dest.color : 'var(--cb-text-bright)'}">
          ${dest.label.toUpperCase()}
        </div>
        <div style="font-family:'Orbitron',sans-serif;font-size:8px;letter-spacing:1px;color:${diffColor};margin-top:4px;
          border:1px solid ${diffColor};display:inline-block;padding:2px 8px;border-radius:3px">
          ${dest.difficulty.toUpperCase()}
        </div>
        <div style="font-size:10px;color:var(--cb-text-dim);margin-top:6px;line-height:1.4">${dest.description}</div>
        <div style="font-size:8px;color:var(--cb-text-dim);margin-top:4px">
          THROTTLE ${dest.minThrottle}% MIN &middot; LAND &lt;${dest.landThrottle}%
        </div>
      </div>
    `;
  }).join('');

  // Multi-crew section for 8+ participants
  const isMulti = state.multiCrew;
  const totalParticipants = participants.length;
  const multiCrewToggle = totalParticipants >= 8 && isHost ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px;padding:10px;background:var(--cb-hull);border:1px solid var(--cb-panel-edge);border-radius:8px">
      <span style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:var(--cb-text-mid)">
        ${totalParticipants} CREW MEMBERS DETECTED
      </span>
      <button style="padding:6px 14px;border:1px solid ${isMulti ? 'var(--cb-glow-green)' : 'var(--cb-glow-blue)'};background:${isMulti ? 'rgba(0,255,136,.08)' : 'transparent'};
        color:${isMulti ? 'var(--cb-glow-green)' : 'var(--cb-glow-blue)'};font-family:'Orbitron',sans-serif;font-size:8px;letter-spacing:1px;
        border-radius:4px;cursor:pointer" data-action="cosmos-toggle-multi">
        ${isMulti ? 'MULTI-CREW: ON — ' + Object.keys(state.crews || {}).length + ' CREWS' : 'ENABLE MULTI-CREW MODE'}
      </button>
    </div>
  ` : '';

  // In multi-crew mode, show crew assignments instead of individual roles
  let crewSection = '';
  if (isMulti && state.crews) {
    crewSection = Object.entries(state.crews).map(([crewId, crew]) => {
      const members = (crew.members || []).map(name => {
        const isMe = name === me;
        const roles = (crew.roles || {})[name] || [];
        const badges = roles.map(r => `<span class="cb-role-badge cb-role-${r}">${r}</span>`).join(' ');
        const avatar = (participants.find(p => p.name === name) || {}).avatar || '';
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0">
          <span style="font-size:16px">${escapeHtml(avatar)}</span>
          <span style="font-size:11px;color:${isMe ? 'var(--cb-glow-blue)' : 'var(--cb-text-bright)'};flex:1">${escapeHtml(name)}${isMe ? ' (YOU)' : ''}</span>
          <div style="display:flex;gap:3px">${badges}</div>
        </div>`;
      }).join('');
      return `
        <div style="background:var(--cb-panel);border:1px solid ${crew.color || 'var(--cb-panel-edge)'};border-radius:8px;padding:10px;margin-bottom:8px">
          <div style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;color:${crew.color || 'var(--cb-glow-blue)'};margin-bottom:6px">
            CREW ${crew.name} — ${(crew.members || []).length} MEMBERS
          </div>
          ${members}
        </div>
      `;
    }).join('');
  }

  return `
    <div class="cosmos-bound">
      <div class="cb-assign-shell">
        <div class="cb-assign-title">COSMOS BOUND</div>
        <div class="cb-assign-sub">SELECT DESTINATION</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">${destCards}</div>
        ${multiCrewToggle}
        ${isMulti ? `<div class="cb-assign-sub">CREW ASSIGNMENTS</div>${crewSection}` : `<div class="cb-assign-sub">CREW ROLE ASSIGNMENT</div><div class="cb-crew-list">${crewRows}</div>`}
        ${isHost
          ? `<button class="cb-begin-btn" data-action="cosmos-begin-mission">COMMENCE MISSION${isMulti ? ' — ALL CREWS' : ''}</button>`
          : `<div style="text-align:center;font-size:11px;color:var(--cb-text-dim);letter-spacing:2px;padding:10px">AWAITING COMMANDER TO BEGIN MISSION...</div>`
        }
      </div>
    </div>
  `;
}

function renderCosmosBoundCockpit(state, isHost, me, myRoles, phase, names, canCDR, canPLT, canENG, canNAV, canSCI, canCOM, canMED) {
  const systems = state.systems || {};
  const throttle = cosmosBoundLeverDragging ? cosmosBoundLocalThrottle : (state.throttle || 0);
  const coords = state.coords || { x: '', y: '', z: '' };
  const cosmosUi = ensureCosmosBoundUiDraft(APP.room?.activityState);
  const coordDraft = coordsLockedValue => coordsLockedValue ? {
    x: String(coords.x || ''),
    y: String(coords.y || ''),
    z: String(coords.z || '')
  } : {
    x: String(cosmosUi.coordDraft?.x || ''),
    y: String(cosmosUi.coordDraft?.y || ''),
    z: String(cosmosUi.coordDraft?.z || '')
  };
  const targetCoords = state.targetCoords || { x: '0', y: '0', z: '0' };
  const altitude = Math.round(state.altitude || 0);
  const velocity = Math.round(state.velocity || 0);
  const log = Array.isArray(state.log) ? state.log.slice(-4) : [];
  const countdownValue = state.countdownValue;
  const allSys = Object.values(systems).every(v => v);
  const preflight = cosmosBoundPreflightReady(state);
  const dest = getCosmosBoundDest(state);
  const phaseLabel = COSMOS_BOUND_PHASE_LABELS[Math.min(Math.floor(phase), 6)] || 'STANDBY';
  const phasePct = COSMOS_BOUND_PHASE_PCT[Math.min(Math.floor(phase), 6)] || 0;

  // Header crew dots
  const crewDots = names.map(name => {
    const roles = getCosmosBoundRoles(state, name);
    const isMe = name === me;
    return `<span class="cb-crew-dot${isMe ? ' me' : ''}" title="${escapeHtml(name)}: ${roles.join(', ')}">${roles.join('/')}</span>`;
  }).join('');

  // Status dots
  const commsOn = systems.comms ? 'on' : '';
  const engOn = allSys ? 'on' : '';
  const navOn = state.coordsLocked ? 'on' : '';

  // Left panel: systems + throttle
  const systemRows = Object.entries(COSMOS_BOUND_SYSTEM_OWNER).map(([sysId, ownerRole]) => {
    const isOn = systems[sysId];
    const canToggle = canCosmosBoundInteract(state, ownerRole) && phase < 2;
    const label = sysId.replace(/-/g, ' ').toUpperCase();
    return `
      <div class="cb-switch${isOn ? ' on' : ''}${!canToggle ? ' disabled' : ''}"
           data-action="cosmos-toggle-system" data-system="${sysId}">
        <div>
          <div class="cb-switch-label">${label}</div>
          <div class="cb-switch-status" style="color:${isOn ? 'var(--cb-glow-green)' : 'var(--cb-text-dim)'}">${isOn ? 'ONLINE' : 'OFFLINE'}</div>
          <div class="cb-switch-owner">${ownerRole} STATION</div>
        </div>
        <div class="cb-toggle"></div>
      </div>
    `;
  }).join('');

  const leverDisabled = !canPLT || (phase >= 2 && phase !== 5);

  // Right panel: coordinates + data
  const coordsLocked = state.coordsLocked;
  const coordDisabled = !canNAV || coordsLocked || phase >= 2;
  const visibleCoords = coordDraft(coordsLocked);
  const broadcastDraft = String(cosmosUi.broadcastDraft || '');

  // COM broadcast section
  const comSection = `
    <div class="cb-panel-title" style="margin-top:6px">COM STATION</div>
    <div style="background:var(--cb-hull);border:1px solid var(--cb-panel-edge);border-radius:8px;padding:8px">
      <div style="font-size:9px;color:var(--cb-text-mid);margin-bottom:4px">BROADCAST MESSAGE</div>
      <div style="display:flex;gap:4px">
        <input class="cb-broadcast-input" id="cosmosBroadcastInput" type="text" value="${escapeHtml(broadcastDraft)}" placeholder="${canCOM ? 'Enter message...' : 'COM only'}" maxlength="80" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${canCOM ? '' : 'disabled'}>
        <button class="cb-broadcast-btn" data-action="cosmos-broadcast" ${canCOM ? '' : 'disabled'}>SEND</button>
      </div>
      ${state.broadcast ? `<div style="font-size:9px;color:#ff8fa3;margin-top:4px;opacity:.7">LAST: ${escapeHtml(state.broadcast)}</div>` : ''}
    </div>
  `;

  // MED vitals section
  const crewVitals = state.crewVitals || {};
  const vitalsRows = names.map(name => {
    const vital = crewVitals[name] || 'nominal';
    return `
      <div class="cb-vitals-row">
        <span class="cb-vital-name">${escapeHtml(name)}</span>
        <span class="cb-vital-status ${vital}">${vital.toUpperCase()}</span>
      </div>
    `;
  }).join('');
  const medSection = `
    <div class="cb-panel-title" style="margin-top:6px">MED STATION</div>
    <div style="background:var(--cb-hull);border:1px solid var(--cb-panel-edge);border-radius:8px;padding:8px">
      <div style="font-size:9px;color:var(--cb-text-mid);margin-bottom:2px">CREW VITALS</div>
      ${vitalsRows}
      <button class="cb-med-confirm-btn${state.medReady ? ' confirmed' : ''}"
        data-action="cosmos-confirm-vitals" ${canMED && !state.medReady && phase === 0 ? '' : 'disabled'}>
        ${state.medReady ? 'CREW FIT — CONFIRMED' : 'CONFIRM CREW FIT'}
      </button>
    </div>
  `;

  // SCI scan section
  const sciChecks = [
    { label: 'SYSTEMS', ok: allSys },
    { label: 'THROTTLE ≥' + dest.minThrottle + '%', ok: throttle >= dest.minThrottle },
    { label: 'COORDS LOCKED', ok: coordsLocked },
    { label: 'MED CLEARED', ok: state.medReady },
    { label: 'SCI SCAN', ok: state.sciScanComplete }
  ];
  const sciSection = `
    <div class="cb-panel-title" style="margin-top:6px">SCI STATION</div>
    <div style="background:var(--cb-hull);border:1px solid var(--cb-panel-edge);border-radius:8px;padding:8px">
      <div style="font-size:9px;color:var(--cb-text-mid);margin-bottom:2px">PRE-FLIGHT CHECKLIST</div>
      <div class="cb-sci-checklist">
        ${sciChecks.map(c => `<div class="${c.ok ? 'ok' : ''}">${c.ok ? '■' : '□'} ${c.label}</div>`).join('')}
      </div>
      <button class="cb-sci-scan-btn${state.sciScanComplete ? ' scanned' : ''}"
        data-action="cosmos-sci-scan" ${canSCI && !state.sciScanComplete && phase === 0 ? '' : 'disabled'}>
        ${state.sciScanComplete ? 'SCAN COMPLETE' : 'RUN SYSTEMS SCAN'}
      </button>
    </div>
  `;

  // Log lines
  const logHtml = log.map(entry => {
    const d = new Date(entry.t);
    const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    return `<div class="cb-log-line">[${ts}] ${escapeHtml(entry.msg)}</div>`;
  }).join('');

  // Phase action buttons
  const igniteReady = phase === 0 && preflight;
  const launchReady = phase === 1;
  const navReady = phase === 3;
  const landReady = phase === 5;

  // HUD label
  const hudLabels = { 0: 'LAUNCH PAD', 1: 'ENGINES FIRING', 2: 'ASCENDING', 3: 'STABLE ORBIT', 4: 'IN TRANSIT', 5: 'DESTINATION', 6: 'LANDED' };
  const hudText = hudLabels[Math.floor(phase)] || 'STANDBY';

  // Progress labels
  const progressLabels = COSMOS_BOUND_PHASE_LABELS.map((lbl, i) => {
    const cls = i < Math.floor(phase) ? 'done' : i === Math.floor(phase) ? 'current' : '';
    return `<span class="${cls}">${lbl}</span>`;
  }).join('');

  // Mission complete overlay
  // Show landing scene for 5 seconds before overlay appears
  const landedAt = state.landedAt || 0;
  const showOverlay = phase === 6 && landedAt && (Date.now() - landedAt > 5000) && !cosmosBoundOverlayDismissed;
  const missionCompleteHtml = phase === 6 ? (showOverlay ? `
    <div class="cb-complete-overlay">
      <div class="cb-mc-title">MISSION COMPLETE</div>
      <div class="cb-mc-sub">${dest.icon} LANDED ON ${dest.label.toUpperCase()} — ${dest.difficulty.toUpperCase()} MODE</div>
      <div class="cb-mc-stats">
        <div class="cb-mc-stat">
          <div class="cb-mc-stat-val">${state.missionStartedAt ? (() => { const e = Date.now() - state.missionStartedAt; const m = Math.floor(e/60000); const s = Math.floor((e%60000)/1000); return m + ':' + String(s).padStart(2,'0'); })() : '0:00'}</div>
          <div class="cb-mc-stat-lbl">MISSION TIME</div>
        </div>
        <div class="cb-mc-stat">
          <div class="cb-mc-stat-val">${Math.round(state.maxAlt || 0)} km</div>
          <div class="cb-mc-stat-lbl">MAX ALTITUDE</div>
        </div>
        <div class="cb-mc-stat">
          <div class="cb-mc-stat-val">${Math.round(state.maxVel || 0)} m/s</div>
          <div class="cb-mc-stat-lbl">MAX VELOCITY</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap;justify-content:center">
        <button class="cb-begin-btn" style="max-width:220px" data-action="cosmos-dismiss-overlay">VIEW LANDING</button>
        ${isHost ? '<button class="cb-begin-btn" style="max-width:220px" data-action="cosmos-restart">FLY AGAIN</button>' : ''}
      </div>
    </div>
  ` : `
    <div style="position:absolute;bottom:40px;left:50%;transform:translateX(-50%);z-index:20">
      <button class="cb-action-btn cb-btn-navigate" data-action="cosmos-show-overlay" style="min-width:auto;padding:8px 16px;font-size:9px">SHOW RESULTS</button>
      ${isHost ? '<button class="cb-action-btn cb-btn-land" data-action="cosmos-restart" style="min-width:auto;padding:8px 16px;font-size:9px;margin-left:8px">FLY AGAIN</button>' : ''}
    </div>
  `) : '';

  return `
    <div class="cosmos-bound">
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:6px">
        ${isHost ? '<button class="btn-secondary" data-action="end-activity" style="font-size:11px;padding:6px 12px">End Activity</button>' : ''}
      </div>
      <div class="cb-cockpit${phase === 2 ? ' cb-rumble' : ''}" style="position:relative">
        <!-- HEADER -->
        <div class="cb-hdr">
          <span class="cb-hdr-title">COSMOS BOUND</span>
          <span class="cb-mission-badge" style="border-color:${dest.color};color:${dest.color}">${dest.icon} ${dest.label.toUpperCase()} — ${dest.difficulty.toUpperCase()}</span>
          <div class="cb-crew-dots">${crewDots}</div>
          <div class="cb-status-bar">
            <div class="cb-status-item"><span class="cb-dot ${commsOn}"></span>COMMS</div>
            <div class="cb-status-item"><span class="cb-dot ${engOn}"></span>ENGINE</div>
            <div class="cb-status-item"><span class="cb-dot ${navOn}"></span>NAV</div>
          </div>
        </div>

        <!-- NEXT STEPS GUIDE -->
        ${(() => {
          const steps = getCosmosBoundNextSteps(state, myRoles);
          if (!steps.length) return '';
          return '<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;padding:6px 12px;background:rgba(0,212,255,.03);border-bottom:1px solid var(--cb-panel-edge)">' +
            steps.map(s => {
              const color = s.done ? 'var(--cb-glow-green)' : s.urgent ? 'var(--cb-glow-orange)' : 'var(--cb-text-mid)';
              const icon = s.done ? '■' : s.urgent ? '▸' : '·';
              const roleTag = s.role ? '<span style="font-family:Orbitron,sans-serif;font-size:7px;letter-spacing:1px;padding:1px 5px;border:1px solid ' + color + ';border-radius:3px;margin-right:4px;color:' + color + '">' + s.role + '</span>' : '';
              return '<div style="font-size:10px;color:' + color + ';display:flex;align-items:center;gap:3px">' + icon + ' ' + roleTag + s.text + '</div>';
            }).join('') +
          '</div>';
        })()}

        <!-- LEFT PANEL -->
        <div class="cb-left">
          <div class="cb-panel-title">SYSTEMS CONTROL</div>
          ${systemRows}

          <div class="cb-panel-title" style="margin-top:6px">THROTTLE</div>
          <div class="cb-lever-container">
            <div class="cb-lever-track${leverDisabled ? ' disabled' : ''}" id="cosmosBoundLeverTrack">
              <div class="cb-lever-fill" style="height:${throttle}%"></div>
              <div class="cb-lever-handle" style="bottom:calc(${throttle}% - 6px)"></div>
            </div>
            <div class="cb-lever-value">${throttle}%</div>
            <div class="cb-lever-label">MAIN THROTTLE · PLT</div>
          </div>

          ${comSection}
        </div>

        <!-- VIEWPORT -->
        <div class="cb-viewport">
          <div class="cb-viewport-frame"></div>
          <div class="cb-viewport-hud">${hudText}</div>
          <canvas id="cosmosBoundCanvas"></canvas>
          <div class="cb-phase-banner" id="cosmosBoundBanner"><span id="cosmosBoundBannerText"></span><div class="cb-phase-sub" id="cosmosBoundBannerSub"></div></div>
          <div class="cb-countdown-overlay${countdownValue != null ? ' show' : ''}" id="cosmosBoundCountdown">
            <div class="cb-countdown-num">${countdownValue != null ? countdownValue : ''}</div>
          </div>
          ${(() => {
            const enc = state.encounter;
            if (!enc || enc.resolved) return '';
            const encDef = COSMOS_BOUND_ENCOUNTERS.find(e => e.id === enc.id);
            if (!encDef) return '';
            const elapsed = Date.now() - (enc.startedAt || Date.now());
            const remaining = Math.max(0, Math.ceil((encDef.duration - elapsed) / 1000));
            let actionBtn = '';
            if (enc.id === 'asteroids') {
              const alive = (enc.asteroidPositions || []).filter(a => a.alive).length;
              actionBtn = '<div style="font-size:10px;margin-top:4px">TAP ASTEROIDS ON SCREEN TO FIRE — ' + alive + ' remaining</div>';
            } else if (enc.id === 'alien') {
              actionBtn = canCOM ? '<button class="cb-action-btn cb-btn-land cb-btn-glow" data-action="cosmos-hail-alien" style="margin-top:6px;min-width:auto;padding:8px 16px">HAIL ALIEN VESSEL</button>'
                : '<div style="font-size:10px;margin-top:4px;color:var(--cb-glow-orange)">COM must send a hailing broadcast</div>';
            } else if (enc.id === 'deathstar') {
              actionBtn = '<div style="font-size:10px;margin-top:4px;color:var(--cb-glow-red)">AIM AT THE GREEN EXHAUST PORT AND FIRE!</div>';
            }
            return '<div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:8;text-align:center;pointer-events:auto">' +
              '<div style="background:rgba(0,0,0,.75);border:2px solid ' + encDef.color + ';border-radius:12px;padding:10px 18px;box-shadow:0 0 30px ' + encDef.color + '44">' +
              '<div style="font-family:Orbitron,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;color:' + encDef.color + '">' + encDef.icon + ' ' + encDef.label + '</div>' +
              '<div style="font-size:9px;color:var(--cb-text-mid);margin-top:3px">' + encDef.subtitle + '</div>' +
              '<div style="font-family:Orbitron,sans-serif;font-size:18px;font-weight:700;color:' + encDef.color + ';margin-top:4px">' + remaining + 's</div>' +
              actionBtn +
              '</div></div>';
          })()}
          <div class="cb-log-strip">${logHtml}</div>
          ${missionCompleteHtml}
        </div>

        <!-- RIGHT PANEL -->
        <div class="cb-right">
          <div class="cb-panel-title">NAVIGATION · NAV</div>
          <div class="cb-coord-group">
            <div style="font-size:9px;color:var(--cb-text-mid);margin-bottom:3px">TARGET COORDINATES</div>
            <div class="cb-coord-row"><label>X</label><input class="cb-coord-input${coordsLocked ? ' locked' : ''}" id="cosmosBoundCoordX" type="text" value="${escapeHtml(visibleCoords.x)}" placeholder="${targetCoords.x}" inputmode="decimal" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${coordDisabled ? 'disabled' : ''}></div>
            <div class="cb-coord-row"><label>Y</label><input class="cb-coord-input${coordsLocked ? ' locked' : ''}" id="cosmosBoundCoordY" type="text" value="${escapeHtml(visibleCoords.y)}" placeholder="${targetCoords.y}" inputmode="decimal" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${coordDisabled ? 'disabled' : ''}></div>
            <div class="cb-coord-row"><label>Z</label><input class="cb-coord-input${coordsLocked ? ' locked' : ''}" id="cosmosBoundCoordZ" type="text" value="${escapeHtml(visibleCoords.z)}" placeholder="${targetCoords.z}" inputmode="decimal" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${coordDisabled ? 'disabled' : ''}></div>
            <button class="cb-coord-lock-btn${coordsLocked ? ' locked' : ''}" data-action="cosmos-lock-coords" ${coordDisabled ? 'disabled' : ''}>
              ${coordsLocked ? 'LOCKED' : 'LOCK COORDINATES'}
            </button>
          </div>

          <div class="cb-panel-title" style="margin-top:6px">ALTITUDE</div>
          <div class="cb-dial-container">
            <div class="cb-data-display" style="color:var(--cb-glow-yellow)">${altitude} km</div>
            <div class="cb-dial-label">CURRENT ALTITUDE</div>
          </div>

          <div class="cb-panel-title" style="margin-top:6px">VELOCITY</div>
          <div class="cb-dial-container">
            <div class="cb-data-display" style="color:var(--cb-glow-purple)">${velocity} m/s</div>
            <div class="cb-dial-label">ORBITAL VELOCITY</div>
          </div>

          ${medSection}
          ${sciSection}
        </div>

        <!-- BOTTOM CONSOLE -->
        <div class="cb-console">
          <div class="cb-progress" style="width:100%;margin-bottom:6px">
            <div class="cb-progress-track"><div class="cb-progress-fill" style="width:${phasePct}%"></div></div>
            <div class="cb-progress-labels">${progressLabels}</div>
          </div>
          <button class="cb-action-btn cb-btn-ignite${igniteReady && canCDR ? ' cb-btn-glow' : ''}" data-action="cosmos-ignite" ${igniteReady && canCDR ? '' : 'disabled'}>IGNITE ENGINES</button>
          <button class="cb-action-btn cb-btn-launch${launchReady && canCDR ? ' cb-btn-glow' : ''}" data-action="cosmos-launch" ${launchReady && canCDR ? '' : 'disabled'}>LAUNCH</button>
          <button class="cb-action-btn cb-btn-navigate${navReady && canCDR ? ' cb-btn-glow' : ''}" data-action="cosmos-navigate" ${navReady && canCDR ? '' : 'disabled'}>SET COURSE</button>
          <button class="cb-action-btn cb-btn-land${landReady && canCDR ? ' cb-btn-glow' : ''}" data-action="cosmos-land" ${landReady && canCDR ? '' : 'disabled'}>INITIATE LANDING</button>
        </div>
      </div>
    </div>
  `;
}



function registerCosmosBoundActivity() {
  const registry = window.TEAM_BUILDER_ACTIVITY_REGISTRY;
  if (!registry || typeof registry.registerActivity !== 'function' || typeof registry.registerAction !== 'function') return;

  registry.registerActivity('cosmos-bound', {
    label: 'Cosmos Bound',
    start: () => startActivityById('cosmos-bound'),
    createInitialState: room => createCosmosBoundState(room?.participants || []),
    meetsRoomRequirements: room => (room?.participants || []).length >= 2,
    getRequirementMessage: () => 'Cosmos Bound needs at least 2 crew members.',
    render: () => renderCosmosBound()
  });

  registry.registerAction('start-cosmos-bound', () => startActivityById('cosmos-bound'));
  registry.registerAction('cosmos-begin-mission', () => cosmosBoundBeginMission());
  registry.registerAction('cosmos-set-destination', ({ dataset }) => {
    if (dataset.destination) return cosmosBoundSetDestination(dataset.destination);
    return null;
  });
  registry.registerAction('cosmos-toggle-multi', () => cosmosBoundToggleMultiCrew());
  registry.registerAction('cosmos-assign-role', ({ dataset }) => {
    if (dataset.player && dataset.role) return cosmosBoundAssignRoleTo(dataset.player, dataset.role);
    return null;
  });
  registry.registerAction('cosmos-toggle-system', ({ dataset }) => {
    if (dataset.system) return cosmosBoundToggleSystem(dataset.system);
    return null;
  });
  registry.registerAction('cosmos-lock-coords', () => cosmosBoundLockCoordinates());
  registry.registerAction('cosmos-ignite', () => cosmosBoundIgnite());
  registry.registerAction('cosmos-launch', () => cosmosBoundLaunch());
  registry.registerAction('cosmos-navigate', () => cosmosBoundNavigate());
  registry.registerAction('cosmos-land', () => cosmosBoundLand());
  registry.registerAction('cosmos-restart', async () => {
    cosmosBoundOverlayDismissed = false;
    await cosmosBoundRestart();
  });
  registry.registerAction('cosmos-dismiss-overlay', () => {
    cosmosBoundOverlayDismissed = true;
    render();
  });
  registry.registerAction('cosmos-show-overlay', () => {
    cosmosBoundOverlayDismissed = false;
    render();
  });
  registry.registerAction('cosmos-hail-alien', () => cosmosBoundHailAlien());
  registry.registerAction('cosmos-evade-deathstar', () => cosmosBoundEvadeDeathStar());
  registry.registerAction('cosmos-broadcast', () => cosmosBoundBroadcast());
  registry.registerAction('cosmos-confirm-vitals', () => cosmosBoundConfirmVitals());
  registry.registerAction('cosmos-sci-scan', () => cosmosBoundSciScan());
}

registerCosmosBoundActivity();
