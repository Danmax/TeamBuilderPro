# Team Builder

Team Builder is a realtime facilitation app for host-led team sessions. It combines room management, multiplayer activities, live voice, presentation tools, and session planning in one web app.

## What It Includes

- Realtime rooms with host-created room codes, join links, QR join, and optional private access tokens.
- Host controls for room settings, activity queue, moderation, and AI-assisted content generation.
- Voice chat with push-to-talk or open-mic room modes, host moderation, participant approval, raise-hand flow, 1:1 voice focus, mute controls, and compact floating controls.
- Session planning and saved session plans with shareable links, launch-into-room flow, downloadable calendar invites, and session-scoped content planning.
- Two presentation modes:
  - URL-based shared presentation viewer for slide decks and embeddable presentations.
  - `Slides Studio` for native in-app slide creation with templates, gradients, solid backgrounds, images, CTA links, source links, and AI slide generation from prompts.
- Admin Console tabs for overview, feature flags, AI Studio, and feedback review.

## Activity Library

- Lightning Trivia
- Trivia Battle
- Emoji Charades
- Icebreaker Roulette
- Team Pulse Check
- Values Vote
- Team Wordle
- Word Chain
- Brainstorm Canvas
- UNO Showdown
- Tic-Tac-Toe Blitz Arena
- Team Jeopardy
- Spin Wheel
- Presentation
- Slides Studio
- Battleship
- Bingo
- Backgammon
- Connect 4

## Notable Features

- Editable player profile with display name and emoji/avatar selection.
- Activity Queue for preloading and running activities in sequence.
- Feedback Hub plus Admin Console workflow.
- Shared AI content workflow across Admin, Host Settings, Activity Queue, and Session Planning.
- Theme-aware AI generation for reusable activity content and planned sessions.
- Export support for Brainstorm Canvas and Team Pulse Check.
- Keyboard shortcuts for hosting, joining, navigation, presentation mode, queue access, and host settings.
- Mobile-friendly board game layouts for Battleship, Bingo, Backgammon, and Connect 4.
- Battleship fleet setup with drag-and-drop placement, board re-selection, quick rotate, double-tap rotate, and in-map ready controls.
- Bingo cards with multiple marker styles such as daubers, chips, and icon markers.

## Session Planning

Team Builder now supports planning sessions ahead of time:

- Save a session plan with title, date, time, meeting link, notes, activity queue, and content brief details.
- Share a saved session plan as a URL.
- Import a shared session plan from the URL automatically.
- Launch a new live room directly from a saved plan.
- Download an `.ics` calendar invite from a saved plan.
- Carry planned content and activity context into the live room when the session starts.

## Voice Controls

Voice controls support both participant and host moderation flows:

- Local mic input meter for the active speaker.
- Host-selectable `push-to-talk` or `open mic` room defaults.
- Raise-hand indicator for participants.
- Host-side hand alerts in the lobby and moderation panels.
- Per-user allow voice, mute/unmute, lower hand, and 1:1 conversation controls.
- Movable/collapsible voice dock similar to the playlist dock.

## Slides Studio

Slides Studio is the native slide-builder activity inside the app.

It supports:

- Multiple slides in one presentation
- Template styles such as Title, Hero, Two Column, About, Features, Problem, Resolution, Looking Forward, and Did You Know?
- Solid or gradient backgrounds
- Background image or image-card layout
- Adjustable image radius and fade-to-black
- Optional tag placement at the top or bottom
- Text positioning controls
- CTA button links and source links
- AI-generated slide decks from a prompt

## AI

AI generation uses the existing backend endpoint:

- `POST /api/ai/generate`

Supported providers:

- OpenAI-compatible chat completion APIs
- Anthropic Messages API
- Google Gemini Generate Content API

Supported workflows:

- Global content generation from Admin AI Studio.
- Room-level generation from Host Settings.
- Queue-aware generation for selected activities.
- Session-plan generation tied to a saved content brief.

Preferred auth mode:

- Server-side provider config via `AI_PROVIDER`, `AI_API_KEY`, `AI_ENDPOINT`, and `AI_MODEL`

Fallback mode:

- Host-provided browser API key stored locally in host settings
- Host-local provider selection for direct fallback requests

Notes:

- The server keeps backward compatibility with `CHAT_GPT_MINI_KEY`, `AI_QUESTION_ENDPOINT`, and `AI_QUESTION_MODEL`.
- Browser fallback is best for providers that support direct API-key requests. Providers that require OAuth or custom server-side auth should use the server configuration path.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Realtime: Socket.IO
- Persistence: local runtime JSON files in `.runtime-data/`
- Security: `helmet` and `express-rate-limit`

## Environment Variables

- `PORT`
- `ADMIN_TOKEN`
- `DEV_ADMIN_PASSWORD`
- `ADMIN_TEMP_PASSWORD`
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_ENDPOINT`
- `AI_MODEL`
- `CHAT_GPT_MINI_KEY` (legacy fallback)
- `AI_QUESTION_ENDPOINT` (legacy fallback)
- `AI_QUESTION_MODEL` (legacy fallback)
- `DATABASE_URL`
- `PGSSL`

## Local Development

```bash
npm install
npm start
```

Open:

- `http://localhost:3000`

## Repository Structure

- `index.html` - main frontend application
- `server.js` - realtime and API backend
- `package.json` - scripts and backend dependencies
- `.runtime-data/` - local persistence created at runtime
- `DEPLOYMENT.md` - deployment notes
