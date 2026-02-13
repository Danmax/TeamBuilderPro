# TeamBuilderPro

TeamBuilderPro is a realtime team-engagement app for remote and hybrid teams.  
It combines collaborative games, pulse checks, and profile-based participation in a single web experience.

## Main Features

- Realtime multiplayer room flow:
  - Host creates a room code
  - Participants join with code
  - Shared room state updates live via Socket.IO
- Profile system:
  - Display name + emoji/avatar
  - In-session profile editing
  - Room-safe profile rename propagation
- Lightning Trivia:
  - Timed rounds with auto-reveal conditions
  - Dynamic/fixed scoring via Host Settings
  - Answer-change policy toggle
  - Live emoji reactions (Zoom-style)
- Trivia Battle:
  - Multi-question quiz mode
  - Per-player scoring
  - Randomized question order
- Team Pulse Check:
  - Randomized set of 5 prompts per session
  - End-of-run aggregate results screen
- Values Vote:
  - Team values prioritization with vote counts
- Icebreaker Roulette:
  - Prompted responses and shared answer feed
- Team Wordle:
  - Group suggestion + majority submission loop
- AI Question Generator:
  - Host-controlled generation of new trivia items
  - Topic, difficulty, count, endpoint/model/API key controls in Host Settings
- Host Settings menu:
  - Room-level behavior toggles
  - Host-local AI configuration

## Current Tech Stack

### Frontend
- HTML/CSS/Vanilla JavaScript (`index.html`)
- Socket.IO client (CDN)
- Local persistence via `localStorage` (for host-local settings and API key convenience)

### Backend
- Node.js
- Express
- Socket.IO
- File-based persistence for shared room state:
  - `data/shared-state.json`

### CI/CD
- GitHub Actions:
  - Syntax checks for frontend embedded scripts and backend server
- Vercel:
  - Static frontend hosting
- Render / Railway:
  - Realtime Socket.IO backend hosting

## Architecture

- Frontend is deployed as a static app (`index.html`).
- Backend is a long-running Socket.IO server (`server.js`) for room sync.
- Clients subscribe to room keys (`room:ABC123`) and receive shared updates.
- Backend writes shared state to disk so room data survives process restarts.

## Migration Notes

Project evolved through these major stages:

1. Single-file prototype with local/shared storage abstraction
2. Gameplay and UX expansion:
   - host tools, pulse results, dynamic scoring, reactions, expanded prompt banks
3. Realtime migration:
   - Introduced Socket.IO backend (`server.js`)
   - Added persistent shared state (`data/shared-state.json`)
4. Deployment split:
   - Frontend on Vercel
   - Backend on Render/Railway

## Local Development

Install and run backend:

```bash
npm install
npm start
```

Open:
- `http://localhost:3000`

## Deployment

See `DEPLOYMENT.md` for:
- Vercel frontend deployment
- Render/Railway backend deployment
- Frontend-to-backend connection setup

## Realtime Backend URL Configuration

By default, frontend uses current origin.  
To point frontend at a hosted backend:

```js
localStorage.setItem('socket-server-url', 'https://YOUR-SOCKET-SERVER-DOMAIN');
location.reload();
```

## Repository Structure

- `index.html` - primary frontend app
- `server.js` - realtime backend server
- `package.json` - backend dependencies/scripts
- `data/` - persisted shared room state
- `vercel.json` - Vercel static routing
- `render.yaml` - Render blueprint
- `railway.json` - Railway deployment config
- `.github/workflows/ci.yml` - CI checks
- `DEPLOYMENT.md` - deployment playbook
