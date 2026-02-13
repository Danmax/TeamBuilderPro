# Deployment Guide

## 1) Frontend on Vercel

This repo is configured to deploy `index.html` as a static site.

### Steps
1. Push this folder to GitHub.
2. In Vercel, import the repo.
3. Framework preset: `Other`.
4. Build command: leave empty.
5. Output directory: leave empty.
6. Deploy.

`vercel.json` already routes `/` to `index.html`.

## 2) Realtime backend (Socket.IO)

Vercel is not ideal for persistent Socket.IO game state. Keep `server.js` on a long-running host:
- Render
- Railway
- Fly.io

### Backend run command
```bash
npm install
npm start
```

This starts the server on port `3000` (or `$PORT` from host).

### Option A: Render (recommended starter)

This repo includes `render.yaml`.

1. Push repo to GitHub.
2. In Render, click **New +** -> **Blueprint**.
3. Select your repo.
4. Render reads `render.yaml` and creates the web service.
5. Deploy and copy the backend URL (e.g. `https://team-builder-pro-socket.onrender.com`).

### Option B: Railway

This repo includes `railway.json`.

1. Push repo to GitHub.
2. In Railway, create **New Project** -> **Deploy from GitHub Repo**.
3. Select this repo.
4. Railway uses `npm start` from `railway.json`.
5. After deploy, copy the public domain URL.

## 3) Connect frontend to backend

Set the socket backend URL in browser before playing:

```js
localStorage.setItem('socket-server-url', 'https://YOUR-SOCKET-SERVER-DOMAIN');
location.reload();
```

Or set `window.SOCKET_SERVER_URL` before app script loads.

## 4) Persistence

`server.js` persists shared room state to:

`data/shared-state.json`

Ensure your backend host has writable disk if you want persistence across restarts.

## 5) Quick verification

1. Open Vercel frontend in two browsers/devices.
2. Set the same backend URL in both via `localStorage`.
3. Create a room in one browser and join in the other.
4. Start Lightning Trivia and verify answers sync live.
