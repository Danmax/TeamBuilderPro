# Team Builder

Team Builder is a realtime facilitation app for host-led team sessions. It combines room management, multiplayer activities, live voice, presentation tools, and session planning in one web app.

## What It Includes

- Realtime rooms with host-created room codes, join links, QR join, and optional private access tokens.
- Host controls for room settings, activity queue, moderation, and AI-assisted content generation.
- Push-to-talk voice broadcast with host moderation, participant approval, mute controls, and compact floating controls.
- Session planning and saved session plans with shareable links, launch-into-room flow, and downloadable calendar invites.
- Two presentation modes:
  - URL-based shared presentation viewer for slide decks and embeddable presentations.
  - `Slides Studio` for native in-app slide creation with templates, gradients, solid backgrounds, images, CTA links, source links, and AI slide generation from prompts.

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
- AI content generation for supported activities through the built-in backend endpoint.
- Export support for Brainstorm Canvas and Team Pulse Check.
- Keyboard shortcuts for hosting, joining, navigation, presentation mode, queue access, and host settings.

## Session Planning

Team Builder now supports planning sessions ahead of time:

- Save a session plan with title, date, time, meeting link, notes, and activity queue.
- Share a saved session plan as a URL.
- Import a shared session plan from the URL automatically.
- Launch a new live room directly from a saved plan.
- Download an `.ics` calendar invite from a saved plan.

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

Preferred mode:

- Server-side key via `CHAT_GPT_MINI_KEY`

Fallback mode:

- Host-provided browser API key stored locally in host settings

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
- `CHAT_GPT_MINI_KEY`
- `AI_QUESTION_ENDPOINT`
- `AI_QUESTION_MODEL`
- `DATABASE_URL`
- `PGSSL`

## Local Development

```bash
npm install
npm start
```

Open:

- `http://localhost:3000`

For local admin access you can use the configured dev password fallback:

- `TAS2026!`

Or override it:

```bash
DEV_ADMIN_PASSWORD=your-password npm start
```

## Repository Structure

- `index.html` - main frontend application
- `server.js` - realtime and API backend
- `package.json` - scripts and backend dependencies
- `.runtime-data/` - local persistence created at runtime
- `DEPLOYMENT.md` - deployment notes
