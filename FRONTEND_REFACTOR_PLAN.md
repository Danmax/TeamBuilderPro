# Frontend Split Migration Plan

## Goals

- Reduce `index.html` size and coupling.
- Separate static content from runtime logic.
- Make activities and screens independently maintainable.
- Create a path to lazy loading and optional bundling later.
- Keep every migration step deployable and easy to review.

## Current State

- `index.html` still owns the page shell, global app state, the central action dispatcher, voice/WebRTC runtime, activity engines, and most activity renderers.
- `assets/js/` already contains extracted browser scripts that attach APIs to `window`.
- The safest short-term migration strategy is to continue that pattern before introducing ES modules or a bundler.

## Target Shape

```text
assets/js/core/
  app-state.js
  particles.js
  activity-registry.js
  action-dispatcher.js

assets/js/activities/
  chess-lobby.js
  connect-4.js
  backgammon.js
  bingo.js
  battleship.js
  dj-booth.js
  slides-studio.js
  cosmos-bound.js

assets/css/
  base.css
  activities/*.css
```

## Phase 1: Shell Extraction

Status: Complete

- Move shell-only code that does not depend on app state.
- Start with the canvas particle background in `assets/js/core/particles.js`.
- Keep script order explicit in `index.html`.
- Validation:
  - parse `index.html` script content
  - `node --check server.js`
  - smoke-load `/` and the new asset when running locally

## Phase 2: Activity Registry and Dispatcher

Status: Complete

- Introduce a small `window.TEAM_BUILDER_ACTIVITY_REGISTRY`.
- Move activity start/render/action mappings out of the central switch incrementally.
- Keep existing `data-action` attributes working.

### Phase 2A: Registry Skeleton

Status: Complete

Create `assets/js/core/activity-registry.js` and load it before the main inline app script.

Target API:

```js
window.TEAM_BUILDER_ACTIVITY_REGISTRY = {
  activities: {},
  actions: {},
  registerActivity(activityId, definition) {},
  registerAction(actionId, handler) {},
  getActivity(activityId) {},
  getAction(actionId) {}
};
```

Activity definition shape:

```js
{
  id: 'chess-lobby',
  label: 'Chess Lobby',
  start: async () => {},
  createInitialState: room => ({}),
  meetsRoomRequirements: room => true,
  getRequirementMessage: room => '',
  render: () => ''
}
```

Action handler shape:

```js
async function handler({ target, dataset, parsed }) {}
```

### Phase 2B: Bridge Existing Code

Status: Complete

- Keep all current functions in `index.html`.
- Register wrapper entries that call existing functions.
- Add registry lookups as a fallback before the giant `switch` default path.
- Do not remove existing `case` branches yet.

Bridge pattern:

```js
const registeredAction = TEAM_BUILDER_ACTIVITY_REGISTRY.getAction(action);
if (registeredAction) {
  await registeredAction({ target, dataset: target.dataset, parsed });
  return;
}
```

### Phase 2C: Route One Activity Through Registry

Status: Complete

- Route `chess-lobby` start/render/actions through the registry while its functions still live in `index.html`.
- Keep behavior unchanged.
- Validate that:
  - the Chess Lobby card starts the activity
  - solo computer play works
  - quick match still queues
  - invites still accept/decline
  - active games still render

### Phase 2D: Acceptance Checks

Status: Complete

- `node --check server.js`
- `node --check assets/js/core/activity-registry.js`
- parse inline `index.html` script with `new Function(...)`
- smoke-load `/`
- smoke-load `/assets/js/core/activity-registry.js`

## Phase 3: Extract One Activity End-to-End

Status: Complete

- Extract Chess Lobby first because it is new, self-contained, and has clear boundaries.
- Move:
  - `CHESS_*` constants
  - state helpers
  - computer move helpers
  - chess actions
  - chess renderers
- Register Chess through the activity registry.

### Phase 3A: Extract Chess Without Behavior Changes

Status: Complete

Create `assets/js/activities/chess-lobby.js`.

Move in this order:

1. Pure constants and helpers:
   - `CHESS_START_FEN`
   - `CHESS_FILES`
   - `CHESS_RANKS`
   - `CHESS_PIECES`
   - `buildChessBoardMapFromFen`
   - `getChessPieceGlyph`
2. State helpers:
   - `createChessLobbyState`
   - `normalizeChessLobbyState`
   - `createChessGame`
   - `createChessComputerGame`
3. Engine helpers:
   - `loadChessEngine`
   - `chooseChessComputerMove`
   - `syncChessGameFromEngine`
4. Actions:
   - quick match
   - cancel quick match
   - play computer
   - invite/accept/decline/cancel
   - move/promote/resign/draw/close/reset
5. Renderers:
   - `renderChessLobby`
   - `renderChessGameView`

Keep the file loaded before the inline app script until more of the runtime is extracted.

### Phase 3B: Remove Inline Chess Code

Status: Complete

- Delete the moved Chess code from `index.html`.
- Keep only registry wiring and generic dispatch in `index.html`.
- Verify `index.html` line count drops meaningfully.

## Phase 4: Extract Additional Board Games

Status: In progress

- Move similar two-player board games after Chess:
  1. Connect 4
  2. Backgammon
  3. Bingo
  4. Battleship

### Phase 4A: Extract Connect 4

Status: Complete

- Move Connect 4 constants, state helpers, action handlers, and renderer to `assets/js/activities/connect-4.js`.
- Register `connect-4` through the activity registry.
- Remove Connect 4-specific start/action/render fallbacks from the central dispatcher.

### Phase 4B: Extract Backgammon

Status: Complete

- Move Backgammon constants, move helpers, action handlers, and renderer to `assets/js/activities/backgammon.js`.
- Register `backgammon` through the activity registry.
- Remove Backgammon-specific start/action/render fallbacks from the central dispatcher.

### Phase 4C: Extract Bingo

Status: Complete

- Move Bingo constants, card helpers, action handlers, and renderer to `assets/js/activities/bingo.js`.
- Register `bingo` through the activity registry.
- Remove Bingo-specific start/action/render fallbacks from the central dispatcher.

### Phase 4D: Extract Battleship

Status: Complete

- Move Battleship constants, board helpers, action handlers, and renderer to `assets/js/activities/battleship.js`.
- Register `battleship` through the activity registry.
- Remove Battleship-specific start/action/render fallbacks from the central dispatcher.

## Phase 4 Result

Status: Complete

- Chess Lobby, Connect 4, Backgammon, Bingo, and Battleship now live in activity modules.
- The central activity dispatcher now uses registry-owned renderers/actions for the extracted board games.

## Phase 5: Extract Heavy Media/Simulation Activities

Status: In progress

- DJ Booth, Slides Studio, and Cosmos Bound should move after the registry is proven.
- These have more DOM/audio/canvas lifecycle concerns, so extract them only after lighter games are stable.
- Slides Studio has been moved to `assets/js/activities/slides-studio.js` and registered through the activity registry.
- Remaining heavy activities should be migrated and browser-tested independently:
  - DJ Booth: YouTube players, local/shared audio, microphone recorder, animation sync.
  - Cosmos Bound: canvas animation loop, timers, audio, mission simulation state.

## Phase 6: CSS Extraction

Status: Complete

- Move base styles to `assets/css/base.css`.
- Move feature styles to `assets/css/activities/`.
- Keep CSS extraction separate from JS extraction to reduce review risk.
- Current implementation moved the inline stylesheet to `assets/css/base.css` unchanged, preserving deployable behavior.
- Per-activity CSS files remain an optional follow-up once JS module boundaries settle.

## Phase 7: Optional Build Step

Status: Complete

- After the app is already modular, decide whether to adopt Vite.
- Use a build step only after the current file boundaries are stable.
- Benefits later:
  - code splitting
  - asset hashing
  - easier dependency management
  - better dev ergonomics
- Decision: defer Vite for now. The app still runs as static HTML plus plain JS/CSS modules, keeping deployment simple while extraction continues.

## Guardrails

- Keep each phase deployable.
- Avoid rewriting the entire frontend in one pass.
- Prefer moving code unchanged before redesigning it.
- Validate after each extraction with a targeted smoke test.
- Do not extract an activity unless its state helpers, handlers, and renderer can move together or through a temporary registry bridge.
