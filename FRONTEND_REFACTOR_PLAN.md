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

Status: In progress

- Move shell-only code that does not depend on app state.
- Start with the canvas particle background in `assets/js/core/particles.js`.
- Keep script order explicit in `index.html`.
- Validation:
  - parse `index.html` script content
  - `node --check server.js`
  - smoke-load `/` and the new asset when running locally

## Phase 2: Activity Registry and Dispatcher

- Introduce a small `window.TEAM_BUILDER_ACTIVITY_REGISTRY`.
- Move activity start/render/action mappings out of the central switch incrementally.
- Keep existing `data-action` attributes working.

## Phase 3: Extract One Activity End-to-End

- Extract Chess Lobby first because it is new, self-contained, and has clear boundaries.
- Move:
  - `CHESS_*` constants
  - state helpers
  - computer move helpers
  - chess actions
  - chess renderers
- Register Chess through the activity registry.

## Phase 4: Extract Additional Board Games

- Move similar two-player board games after Chess:
  1. Connect 4
  2. Backgammon
  3. Bingo
  4. Battleship

## Phase 5: Extract Heavy Media/Simulation Activities

- DJ Booth, Slides Studio, and Cosmos Bound should move after the registry is proven.
- These have more DOM/audio/canvas lifecycle concerns, so extract them only after lighter games are stable.

## Phase 6: CSS Extraction

- Move base styles to `assets/css/base.css`.
- Move feature styles to `assets/css/activities/`.
- Keep CSS extraction separate from JS extraction to reduce review risk.

## Phase 7: Optional Build Step

- After the app is already modular, decide whether to adopt Vite.
- Use a build step only after the current file boundaries are stable.
- Benefits later:
  - code splitting
  - asset hashing
  - easier dependency management
  - better dev ergonomics

## Guardrails

- Keep each phase deployable.
- Avoid rewriting the entire frontend in one pass.
- Prefer moving code unchanged before redesigning it.
- Validate after each extraction with a targeted smoke test.
- Do not extract an activity unless its state helpers, handlers, and renderer can move together or through a temporary registry bridge.
