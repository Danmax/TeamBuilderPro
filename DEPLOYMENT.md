# Deployment Guide

## 1) Recommended deployment

This app now runs most cleanly as a single long-lived Node service.
Serve the frontend from `index.html` and the realtime/API backend from `server.js` on the same host.

### Steps
1. Push this folder to GitHub.
2. Deploy it to a long-lived Node host of your choice.
3. Use `npm install` during build/setup.
4. Use `npm start` as the run command.
5. Set required environment variables such as `CHAT_GPT_MINI_KEY` and, for deployed admin access, `ADMIN_TOKEN`.
6. Deploy and open the generated domain.

## 2) Backend run command

```bash
npm install
npm start
```

This starts the server on port `3000` (or `$PORT` from host).

For deployed admin access, set `ADMIN_TOKEN`. For local-only testing on loopback, you can use `ADMIN_TEMP_PASSWORD` instead.

Example:

```bash
ADMIN_TEMP_PASSWORD=replace-me CHAT_GPT_MINI_KEY=replace-me npm start
```

`ADMIN_TEMP_PASSWORD` is accepted only for non-production loopback requests. Use `ADMIN_TOKEN` for any deployed environment.

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
- Admin routes require `x-admin-token`.
- Production admin access should use `ADMIN_TOKEN`.
- Local development may use `ADMIN_TEMP_PASSWORD`, but only from loopback requests and only when not running in production.
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
5. Confirm the Admin Console works with `ADMIN_TOKEN`, or with `ADMIN_TEMP_PASSWORD` when testing locally on loopback.
