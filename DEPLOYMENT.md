# Deployment Guide

## 1) Recommended deployment

This app now runs most cleanly as a single long-lived Node service.
Serve the frontend from `index.html` and the realtime/API backend from `server.js` on the same host.

### Steps
1. Push this folder to GitHub.
2. Deploy it to a long-lived Node host of your choice.
3. Use `npm install` during build/setup.
4. Use `npm start` as the run command.
5. Set required environment variables such as `ADMIN_TOKEN` and `CHAT_GPT_MINI_KEY`.
6. Deploy and open the generated domain.

## 2) Backend run command

```bash
npm install
npm start
```

This starts the server on port `3000` (or `$PORT` from host).

For admin access in any environment, set `ADMIN_TOKEN`.

Example:

```bash
ADMIN_TOKEN=replace-me CHAT_GPT_MINI_KEY=replace-me npm start
```

## 3) Connect frontend to backend

If you deploy the frontend and backend separately, set the socket backend URL in browser before playing:

```js
localStorage.setItem('socket-server-url', 'https://YOUR-SOCKET-SERVER-DOMAIN');
location.reload();
```

Or set `window.SOCKET_SERVER_URL` before app script loads.

## 4) Security model

- Room access is protected by a room-scoped invite token.
- Hosts should share the full invite link generated in the lobby, not only the six-character room code.
- Admin routes require `x-admin-token` and are unavailable if `ADMIN_TOKEN` is missing.
- Server-side AI generation requires either admin auth or a valid room token.

## 5) Persistence

`server.js` persists shared room state to:

`.runtime-data/shared-state.json`

Additional runtime files:

- `.runtime-data/feedback-state.json`
- `.runtime-data/room-meta.json`

Ensure your backend host has writable disk if you want persistence across restarts.

## 6) Quick verification

1. Open the deployed app in two browsers/devices.
2. If split-hosted, set the same backend URL in both via `localStorage`.
3. Create a room in one browser and use the generated invite link to join in the other.
4. Start Lightning Trivia and verify answers sync live.
5. Confirm the Admin Console only works when `ADMIN_TOKEN` is configured.
