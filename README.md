# UNO — Multiplayer Web App

A high-end, real-time multiplayer UNO game. No accounts, no installs — host a table, share a 4-letter code, and play with friends on any device.

## Features

- **Real-time multiplayer** — Node.js + Socket.IO, rooms with 4-letter codes
- **2–8 players**, any device on the same network (or deployed publicly)
- **Full UNO rules** — numbers, skips, reverses, draw-2, wilds, wild-draw-4, stacking
- **UNO call window** — players must call UNO before the turn comes back, otherwise caught opponents can punish with +2
- **Optional house rules** (host picks before the game starts):
  - Stack +4 on +2
  - 7 — swap hands with another player
  - 0 — rotate every player's hand
- **Scoreboard** when the game ends
- **Atlas-inspired design** — dark felt, gold accents, Playfair Display, smooth card animations

## Tech stack

- **Backend:** Node.js 18+, Express, Socket.IO 4
- **Frontend:** Vanilla HTML / CSS / JS (no build step, no framework)
- **Storage:** In-memory (rooms cleared on restart)

## Project structure

```
uno/
├── server.js          # Express + Socket.IO server, all game rules
├── package.json
├── Procfile           # For Heroku / Render / Railway
├── vercel.json        # For Vercel (frontend only)
├── .gitignore
└── public/            # Static frontend
    ├── index.html
    ├── styles.css
    ├── config.js      # Backend URL config
    └── app.js
```

## Local development

```bash
npm install
npm start
# → UNO server running on http://localhost:3000
```

Open two browser tabs to `http://localhost:3000` to test multiplayer. One creates a room, the other joins with the 4-letter code.

## Environment variables

- `PORT` — port to listen on (default `3000`)
- `HOST` — interface to bind (default `0.0.0.0`)

## Deployment

Vercel is great for the static frontend, but **Socket.IO needs a Node host with persistent WebSocket support** (Vercel serverless functions time out at 10s and don't keep WebSockets alive). The recommended setup:

- **Frontend on Vercel** — static files, global CDN, free
- **Backend on Render / Railway / Fly.io** — runs the Node + Socket.IO server

### 1. Deploy the backend to Render (free)

1. Push this folder to a GitHub repo.
2. Go to [render.com](https://render.com) → New → Web Service → connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Instance type: **Free** (sleeps after 15min of inactivity — upgrade to **Starter $7/mo** for always-on)
6. Copy the deployed URL (e.g. `https://uno-backend-xyz.onrender.com`).

### 2. Deploy the frontend to Vercel

**Option A — Vercel Dashboard:**
1. Go to [vercel.com](https://vercel.com) → New Project → import the same repo.
2. Framework preset: **Other** (it's just static files).
3. Vercel auto-serves `public/` as the web root (the `vercel.json` rewrites all routes to `index.html` for SPA routing).
4. Deploy.

**Option B — Vercel CLI:**
```bash
npm i -g vercel
vercel login
vercel --prod
```

### 3. Connect them

Tell the frontend where the backend lives. Edit `public/index.html` and uncomment the example line at the bottom, before `config.js` loads:

```html
<script>window.__UNO_BACKEND_URL__ = 'https://uno-backend-xyz.onrender.com';</script>
<script src="/config.js"></script>
```

Commit, push — Vercel auto-redeploys.

### Alternative: single-host deploy (no Vercel)

If you don't need Vercel specifically, deploy the whole thing to one host — simpler, no config:

- **Render / Railway / Heroku / Fly.io** — just push the repo. Both frontend and backend deploy together. `npm start` runs `node server.js` which serves `public/` and Socket.IO. No `BACKEND_URL` config needed.

See `Procfile` (Heroku/Render) — it points at `npm start`.

## How to play

1. Open the URL, enter a name, click **Create a room**.
2. Share the 4-letter code with friends.
3. As host, toggle any **house rules** you want.
4. Hit **Start game** (needs 2+ players).
5. Click a card in your hand to play it. Click the draw pile to draw.
6. When you're down to your last card, press the red **UNO!** button *before* the turn comes back to you, or other players can hit **CATCH! +2** on you.

## License

MIT
