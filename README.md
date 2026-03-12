# TeamBuilderPro

TeamBuilderPro is a realtime team-engagement app for remote and hybrid teams.
It combines multiplayer activities, host controls, and lightweight facilitation tools in one web experience.

## Main Features

- Realtime multiplayer sessions with host-created room codes and tokenized invite links.
- Lobby invite tools with room code, secure share link copy, and host QR join.
- Profile system with editable display name and emoji/avatar.
- Responsive avatar picker for mobile-first initial setup and profile editing.
- Activity Queue with host-managed ordering and queue run controls.
- Lightning Trivia with timer, reveal flow, dynamic scoring, floating emoji/name reactions, and end confetti.
- Emoji Charades with round-based team guessing, host reveal flow, and scoreboard.
- Trivia Battle with randomized question order and per-player scoring.
- Team Pulse Check with randomized 5-question run, aggregate results, and JSON/CSV export.
- Values Vote with team value prioritization.
- Icebreaker Roulette with shared response feed.
- Team Wordle with suggestions, voting, and host typed-cell override.
- Team Word Chain with shared team progression, suggestions, voting, host typed-cell override, and scoring.
- Brainstorm Canvas activity with Start/Stop/Improve/Create lanes, sticky notes, votes, drag/move, lock, and JSON/CSV export.
- Feedback Hub for user-submitted issues/ideas plus Admin workflow and notes.
- Lobby quick access button for Feedback Hub submissions.
- Host Settings with tabbed sections, game toggles, and AI configuration.
- App-wide accessibility keyboard shortcuts with shortcut help modal, `Alt`/macOS `Option` support, and escape/back behavior.
- Admin Console sample-data controls with per-activity or generate-all content creation, including Spin Wheel sample clearing.
- AI Content Generator for multiple targets:
  - Lightning Trivia
  - Emoji Charades
  - Trivia Battle
  - Icebreaker
  - Team Pulse
  - Values Vote
  - Team Wordle
  - Word Chain
  - Brainstorm Canvas
  - Spin Wheel

## Default Enabled Activities

Fresh default preferences enable:

- Lightning Trivia
- Icebreakers
- Team Pulse
- Team Wordle
- Word Chain
- Spin Wheel

## Keyboard Shortcuts

- `?`: open keyboard shortcut help.
- `Esc`: close open dialogs or go back from secondary screens.
- `Alt+H` / `Option+H`: go to dashboard.
- `Alt+N` / `Option+N`: host session.
- `Alt+J` / `Option+J`: join session.
- `Alt+F` / `Option+F`: open Feedback Hub.
- `Alt+A` / `Option+A`: open Admin Console.
- `Alt+L` / `Option+L`: go to lobby when in a room.
- `Alt+P` / `Option+P`: toggle presentation mode.
- `Alt+Q` / `Option+Q`: open Activity Queue as host.
- `Alt+S` / `Option+S`: open Host Settings as host.

## AI Generation and Keys

- Preferred mode: server-side key using `CHAT_GPT_MINI_KEY`.
- Frontend calls backend endpoint `POST /api/ai/generate`.
- Server-side AI generation now requires valid admin auth or valid room access.
- Optional fallback: host can provide a local browser API key in Host Settings.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript (`index.html`).
- Realtime: Socket.IO client and server.
- Backend: Node.js + Express (`server.js`).
- API hardening: `helmet` secure headers and `express-rate-limit` API throttling.
- Persistence: file-based shared room state in `.runtime-data/shared-state.json`.
- Room metadata and invite tokens: `.runtime-data/room-meta.json`.
- Feedback/admin state: `.runtime-data/feedback-state.json`.
- CI/CD: GitHub Actions syntax checks.

## Progression Stats

- `Activities` increments when any activity session is ended.
- `Games` increments for game-type activities:
  - Lightning Trivia
  - Trivia Battle
  - Team Wordle
  - Team Word Chain
  - Emoji Charades

## Environment Variables

- `PORT`:
  - Backend port for `server.js`.
- `ADMIN_TOKEN`:
  - Required for Admin Console access. Admin login is disabled if unset.
- `CHAT_GPT_MINI_KEY`:
  - Server-side AI key for `/api/ai/generate`.
- `AI_QUESTION_ENDPOINT`:
  - Optional override for AI endpoint.
- `AI_QUESTION_MODEL`:
  - Optional override for AI model.
- `DATABASE_URL`:
  - Optional Postgres-backed config storage for global branding/preferences/collections.
- `PGSSL`:
  - Set to `disable` to turn off Postgres SSL when required by local environments.

## Local Development

Install dependencies and start backend:

```bash
npm install
npm start
```

Open:

- `http://localhost:3000`

Recommended for local admin testing:

```bash
ADMIN_TOKEN=your-local-admin-token npm start
```

## Deployment Notes

- Realtime backend should run on a long-lived host that supports Node and persistent WebSocket connections.
- API routes are rate-limited and secure headers are enabled via Helmet.
- Room state access is protected by room-scoped invite tokens. Share the full invite link, not just the room code.
- If you use the database-backed config store, ensure your Postgres provider supports the configured SSL mode.
- Configure frontend to backend if split-hosted:

```js
localStorage.setItem('socket-server-url', 'https://YOUR-SOCKET-SERVER-DOMAIN');
location.reload();
```

See `DEPLOYMENT.md` for full deployment steps.

## Repository Structure

- `index.html`:
  - Main frontend app.
- `player-hub-v1 (2).html`:
  - Mirrored frontend file.
- `server.js`:
  - Realtime + API backend.
- `package.json`:
  - Backend scripts and dependencies.
- `.runtime-data/`:
  - Runtime persistence directory created by the server.
- `.github/workflows/ci.yml`:
  - Syntax-check workflow.
- `DEPLOYMENT.md`:
  - Deployment guide.
