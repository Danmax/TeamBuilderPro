# TeamBuilderPro

TeamBuilderPro is a realtime team-engagement app for remote and hybrid teams.
It combines multiplayer activities, host controls, and lightweight facilitation tools in one web experience.

## Main Features

- Realtime multiplayer sessions with host-created room codes.
- Lobby invite tools with room code, share link copy, and host QR join.
- Profile system with editable display name and emoji/avatar.
- Activity Queue with host-managed ordering and queue run controls.
- Lightning Trivia with timer, reveal flow, reaction bar, dynamic scoring, and end confetti.
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

## AI Generation and Keys

- Preferred mode: server-side key using `CHAT_GPT_MINI_KEY`.
- Frontend calls backend endpoint `POST /api/ai/generate`.
- Optional fallback: host can provide a local browser API key in Host Settings.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript (`index.html`).
- Realtime: Socket.IO client and server.
- Backend: Node.js + Express (`server.js`).
- Persistence: file-based shared room state in `data/shared-state.json`.
- CI/CD: GitHub Actions + Vercel (frontend) + Render/Railway (backend).

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
  - Admin console auth token.
- `CHAT_GPT_MINI_KEY`:
  - Server-side AI key for `/api/ai/generate`.
- `AI_QUESTION_ENDPOINT`:
  - Optional override for AI endpoint.
- `AI_QUESTION_MODEL`:
  - Optional override for AI model.

## Local Development

Install dependencies and start backend:

```bash
npm install
npm start
```

Open:

- `http://localhost:3000`

## Deployment Notes

- `vercel.json` deploys static frontend routing.
- Realtime backend should run on a long-lived host (Render/Railway/Fly/etc).
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
- `data/`:
  - Persisted runtime state.
- `vercel.json`:
  - Vercel routing.
- `render.yaml`:
  - Render blueprint.
- `railway.json`:
  - Railway config.
- `.github/workflows/ci.yml`:
  - Syntax-check workflow.
- `DEPLOYMENT.md`:
  - Deployment guide.
