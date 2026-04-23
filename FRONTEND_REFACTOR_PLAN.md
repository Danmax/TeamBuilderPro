# Frontend Refactor Plan

## Goals

- Reduce `index.html` size and coupling.
- Separate static content from runtime logic.
- Make activities and screens independently maintainable.
- Create a path to lazy loading and optional bundling later.

## Phase 1: Static Data Extraction

Status: In progress

- Serve frontend assets from `/assets`.
- Move pure static datasets into external files.
- Keep the current app runtime intact by reading the extracted data from `window.TEAM_BUILDER_STATIC_DATA`.
- Start with low-risk content banks and presets:
  - avatars
  - reactions
  - quotes
  - trivia bank
  - jeopardy board
  - spin wheel presets
  - icebreakers
  - pulse questions
  - values
  - wordle words
  - word chain puzzles
  - emoji charades

## Phase 2: Split Remaining Static Configuration

- Move remaining pure constants out of `index.html`.
- Prioritize:
  - activity queue item metadata
  - battleship constants
  - bingo constants
  - backgammon constants
  - connect-4 constants
  - slides studio template presets
- Group by feature under `assets/js/data/` or `assets/js/features/<feature>/`.

## Phase 3: Extract Core Runtime Modules

- Move non-UI logic into plain browser modules or external scripts:
  - API helpers
  - socket/realtime client
  - navigation
  - app state defaults
  - storage/session helpers
  - room/player managers
- Keep the public app behavior unchanged during extraction.

## Phase 4: Split Screen Renderers

- Extract render functions by screen:
  - dashboard
  - lobby
  - admin
  - activity queue
  - feedback
  - schedule/load session
- Reduce direct access to global state where possible by passing the state slice each renderer needs.

## Phase 5: Split Activity Logic by Feature

- Move each activity into its own boundary:
  - renderers
  - state helpers
  - event handlers
  - feature constants
- Recommended order:
  1. lightning trivia
  2. icebreaker
  3. pulse check
  4. spin wheel
  5. wordle
  6. team jeopardy
  7. brainstorm
  8. heavier game modes

## Phase 6: Optional Build Step

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
