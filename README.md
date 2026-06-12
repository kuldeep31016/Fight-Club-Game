# 🥊 FightCam

**A browser-based, real-time multiplayer fighting game controlled entirely by your body.**

Stand in front of your webcam, throw real punches, step toward the camera to advance and away to retreat. No keyboard. No controller. Just you versus a friend, anywhere in the world.

---

## Contents

- [How it plays](#how-it-plays)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start (local development)](#quick-start-local-development)
- [Deployment](#deployment)
  - [Backend → Render](#backend--render)
  - [Backend → Railway](#backend--railway)
  - [Frontend → Vercel](#frontend--vercel)
- [Webcam permissions guide](#webcam-permissions-guide)
- [Architecture](#architecture)
  - [Server-authoritative combat](#server-authoritative-combat)
  - [Networking protocol](#networking-protocol)
  - [Motion detection](#motion-detection)
  - [Reconnection handling](#reconnection-handling)
- [Gameplay tuning](#gameplay-tuning)
- [Troubleshooting](#troubleshooting)

---

## How it plays

1. Open the site, enter a nickname.
2. **Player 1** creates a room and gets a 6-character code (e.g. `A7F9K2`).
3. **Player 2** joins with the code.
4. Both press **Ready** in the lobby.
5. Each player calibrates: stand naturally ~2 m from the camera while the game records your baseline pose (~2 seconds).
6. A 3-second countdown, then **FIGHT!**
7. Controls — all physical:
   - **Punch** — throw a fast, full-extension punch at the camera.
   - **Move forward** — step toward the camera.
   - **Move backward** — step away from the camera.
8. Each player has ❤ ❤ ❤. A landed punch (validated by the server) removes one heart. Three hits = knockout.
9. Winner banner, **Play Again** for an instant rematch, or **Return to Lobby**.

If a player drops mid-fight, the match pauses for 10 seconds to let them reconnect; if they don't return, the opponent wins.

## Tech stack

| Layer           | Technology                                              |
| --------------- | ------------------------------------------------------- |
| Frontend        | React 18 + TypeScript + Vite                            |
| Rendering       | Phaser 3 (procedurally drawn fighters & dojo, 60 FPS)   |
| Motion tracking | TensorFlow.js + MoveNet (SinglePose Lightning, on-device) |
| Networking      | Socket.IO (WebSocket with polling fallback)             |
| Backend         | Node.js + Express + Socket.IO server                    |
| Audio           | Web Audio API (all SFX & music synthesized — zero asset files) |
| Database        | None — rooms live in memory                             |

## Project structure

```
fightcam/
├── shared/                 # Protocol shared by client & server
│   └── src/
│       ├── events/         # Every Socket.IO event name (single source of truth)
│       ├── constants/      # All gameplay + motion tuning values
│       └── types/          # Payload & state interfaces
├── backend/
│   └── src/
│       ├── socket/         # Socket.IO event wiring & session tracking
│       ├── rooms/          # Room + RoomManager (codes, lifecycle, expiry)
│       ├── game/           # GameEngine — the authoritative simulation
│       ├── controllers/    # HTTP health endpoints
│       └── types/          # Server-internal types
└── frontend/
    └── src/
        ├── pages/          # MainMenu, Lobby, Calibration, Game
        ├── components/     # VideoFeed, HealthHearts, AudioControls
        ├── hooks/          # useGameRoom — socket state machine for React
        ├── vision/         # PoseEngine, MotionAnalyzer, calibration, skeleton
        ├── game/           # Phaser scene, Fighter, audio engine
        ├── network/        # Socket singleton + typed event bus
        └── types/          # Client types
```

The repo is an **npm workspaces monorepo**. `shared` is built once and consumed by both sides, so the protocol can never drift.

## Quick start (local development)

**Prerequisites:** Node.js ≥ 18, a webcam, and a Chromium-based browser or Firefox.

```bash
# 1. Install everything (also builds the shared package)
npm install

# 2. Terminal A — start the backend on http://localhost:3001
npm run dev:backend

# 3. Terminal B — start the frontend on http://localhost:5173
npm run dev:frontend
```

Open `http://localhost:5173` in **two browser windows** (or two devices on the same network) to play against yourself. Each window needs camera access — if your OS only lets one app use the camera, test with a second device or a virtual camera.

> **Note:** browsers only expose the camera on `localhost` or HTTPS. `http://192.168.x.x:5173` from a phone will *not* get camera access — use the deployed HTTPS version for cross-device play, or a tool like `ngrok`.

### All scripts

| Command                  | What it does                                   |
| ------------------------ | ---------------------------------------------- |
| `npm install`            | Installs all workspaces, builds `shared`       |
| `npm run dev:backend`    | Backend with hot reload (tsx)                  |
| `npm run dev:frontend`   | Vite dev server                                |
| `npm run build`          | Builds shared + backend + frontend             |
| `npm run build:backend`  | Builds shared, then compiles the server        |
| `npm run build:frontend` | Builds shared, type-checks & bundles the client |

## Deployment

Deploy the **backend first** (you need its URL for the frontend env var).

### Backend → Render

The repo ships with a [`render.yaml`](./render.yaml) Blueprint.

1. Push the repo to GitHub.
2. On [render.com](https://render.com) → **New → Blueprint** → pick the repo.
3. Render reads `render.yaml` and creates the `fightcam-backend` web service automatically.
4. After the first deploy, copy the service URL (e.g. `https://fightcam-backend.onrender.com`).
5. Once the frontend is live, set the `CLIENT_ORIGIN` env var on the service to your Vercel URL (e.g. `https://fightcam.vercel.app`) and redeploy. Multiple origins are comma-separated.

Manual alternative (no Blueprint): **New → Web Service**, root directory = repo root, build command `npm install && npm run build:backend`, start command `npm start --workspace backend`, health check path `/health`.

> Render's free tier sleeps after inactivity — the first connection after a sleep takes ~30 s.

### Backend → Railway

1. On [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Settings → **Build Command**: `npm install && npm run build:backend`
3. Settings → **Start Command**: `npm start --workspace backend`
4. Variables → add `CLIENT_ORIGIN=https://your-app.vercel.app` (Railway injects `PORT` automatically).
5. Settings → **Networking → Generate Domain** and copy the public URL.

### Frontend → Vercel

The repo ships with a [`vercel.json`](./vercel.json) that builds the frontend workspace from the repo root.

1. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. Leave the **Root Directory as the repo root** (do *not* set it to `frontend/` — the monorepo needs the root `package.json`).
3. Vercel picks up `vercel.json` (build command, output dir) automatically.
4. Add an environment variable:
   - `VITE_SERVER_URL` = your backend URL, e.g. `https://fightcam-backend.onrender.com` (no trailing slash).
5. Deploy. Then go back to the backend and set `CLIENT_ORIGIN` to the Vercel URL.

That's it — share the Vercel link with a friend and fight.

## Webcam permissions guide

- The browser will prompt for camera access when you reach the **Calibration** screen. Click **Allow**.
- Cameras are only available on **HTTPS** or **localhost** (a browser security rule).
- If you blocked it by accident:
  - **Chrome / Edge:** click the camera icon (or padlock) in the address bar → *Site settings* → Camera → **Allow** → reload.
  - **Firefox:** click the camera icon in the address bar → clear the block → reload.
  - **Safari:** Safari → Settings → Websites → Camera → set the site to **Allow**.
- Only one app can usually use the camera at a time — close Zoom/Meet/OBS if the feed won't start.
- No video ever leaves your machine. Pose estimation runs **entirely in your browser**, and only abstract actions (`PUNCH`, `MOVE_FORWARD`, …) are sent over the network.

## Architecture

```
┌─────────────────────────── Browser (per player) ───────────────────────────┐
│  Webcam ─▶ MoveNet (TF.js) ─▶ MotionAnalyzer ─▶ derived actions only        │
│                                                  │ PUNCH / MOVE_* (Socket.IO)│
│  Phaser scene ◀─ typed event bus ◀─ snapshots ◀──┘                          │
└──────────────────────────────────────────────────────────────────────────────┘
                                   ▲ 15 Hz snapshots / hit events
                                   ▼ actions
┌────────────────────────────── Node server ──────────────────────────────────┐
│  RoomManager ─▶ Room ─▶ GameEngine (20 Hz authoritative simulation)          │
│  positions · punch validation · damage · stun · knockback · winner           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Server-authoritative combat

Clients are treated as untrusted input devices. They may only send three things during a fight: `punch`, `movement-update`, and lifecycle events. The server's `GameEngine` ticks at 20 Hz and is the **only** place where:

- positions integrate (movement intents × speed × dt, clamped to the arena, with a minimum gap so fighters can't overlap),
- punches are validated — a punch lands only if the attacker isn't stunned/KO'd, the cooldown (500 ms) has expired, and the opponent is within range (175 arena units),
- health is deducted (1 of 3 per landed hit), hit-stun (600 ms) and knockback are applied,
- the winner is decided (KO at 0 health, or forfeit on disconnect timeout).

A hacked client spamming `punch` 100×/sec gains nothing: the server drops everything inside the cooldown window and out of range. Health, positions, and results are broadcast *from* the server at 15 Hz — clients render whatever they're told.

### Networking protocol

All event names and payload types live in [`shared/src`](./shared/src), imported by both sides — a typo is a compile error, not a silent bug.

Client → server: `create-room`, `join-room`, `rejoin-room`, `player-ready`, `calibration-complete`, `movement-update`, `punch`, `play-again`, `return-to-lobby`, `leave-room`.

Server → client: `room-created`, `room-joined`, `room-error`, `lobby-update`, `match-countdown`, `match-start`, `state-update` (snapshots), `punch-thrown`, `player-hit`, `health-update`, `match-end`, `match-paused`, `match-resumed`, `player-disconnected`, `player-reconnected`.

**Bandwidth:** raw pose landmarks (17 keypoints × 20 fps) never touch the network. Movement is edge-triggered — the client sends `MOVE_FORWARD` once when you start moving and `IDLE` once when you stop, not a stream. Snapshots are small flat JSON at 15 Hz.

### Motion detection

Runs fully client-side in [`frontend/src/vision`](./frontend/src/vision):

**Calibration** collects 40 valid frames (~2 s) where nose, shoulders, hips and wrists are all confidently visible, and averages the apparent **shoulder width** — the depth reference for everything that follows.

**Punch detection** — a wrist must *simultaneously*:
1. move faster than **3.6 shoulder-widths/second** (normalizing by shoulder width makes the threshold independent of your distance from the camera), measured over a ~100–260 ms window so a single noisy frame can't trigger it;
2. be extended at least **0.95 shoulder-widths** away from its own shoulder — this kills false positives from face-scratching, waving, and small gestures;
3. respect a **500 ms cooldown** (enforced client-side *and* server-side).

**Depth movement** — your apparent shoulder width grows as you approach the camera. The live width / calibration baseline ratio is **EMA-smoothed** (α = 0.25) and passed through a **hysteresis band**: forward starts at ratio ≥ 1.12 and ends at ≤ 1.07; backward starts at ≤ 0.88 and ends at ≥ 0.93. The dead zone between thresholds is what makes movement feel stable instead of jittery.

**Performance:** pose inference is throttled to 20 Hz inside a `requestAnimationFrame` loop; Phaser renders at 60 FPS independently and interpolates fighter positions between server snapshots.

### Reconnection handling

- Every browser stores `{ playerId, roomCode }` in `sessionStorage` the moment it joins a room.
- On any socket (re)connect, the client silently emits `rejoin-room`.
- Server-side, a disconnect during a fight **pauses** the match and starts a 10-second grace timer. If the player returns, they're handed the current lobby state plus a live snapshot, a fresh 3-second countdown runs, and the fight resumes. If they don't, the opponent wins by `DISCONNECT`.
- Empty or idle rooms are swept after 10 minutes.

## Gameplay tuning

Every gameplay and motion threshold is a named constant in [`shared/src/constants/index.ts`](./shared/src/constants/index.ts) — arena size, move speed, punch range/cooldown, stun, knockback, tick rates, countdown length, reconnect grace, punch velocity/extension thresholds, hysteresis ratios, calibration length. Tweak there; both client and server pick the change up on the next build.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Camera prompt never appears | You're on plain HTTP. Use `localhost` or the deployed HTTPS URL. |
| “Camera permission denied” | Re-allow it via the address-bar camera/padlock icon, then reload. |
| Black video / “Could not start the camera” | Another app holds the camera — close Zoom/Meet/OBS and retry. |
| Calibration bar stuck | Step back so head, shoulders, hips **and wrists** are in frame; improve lighting; avoid backlight. |
| Punches not registering | Punch *toward the camera*, fast and to full extension. Slow or half-extended arm movements are filtered on purpose. |
| Fighter won't move forward/back | Take a real step, not a lean. If you calibrated at the wrong distance, leave to the lobby and recalibrate. |
| Two windows on one PC: second has no video | Most OSes share one camera fine in two tabs of the same browser; otherwise use a second device or a virtual camera. |
| “Connecting to server…” forever | Backend down or `VITE_SERVER_URL` wrong. Hit `https://<backend>/health` — it should return JSON. On Render free tier, the first hit after sleep takes ~30 s. |
| CORS errors in console | Set `CLIENT_ORIGIN` on the backend to your exact frontend origin (scheme + host, no trailing slash). |
| Lag / rubber-banding | Free-tier servers far from both players add latency. Pick a region near you on Render/Railway. |
| Low FPS on old laptops | Close other tabs; the pose model uses the GPU via WebGL. Chrome tends to perform best. |

---

Built with React, Phaser, TensorFlow.js and Socket.IO. All art is drawn procedurally and all audio is synthesized in-browser — the repo contains zero binary assets.
# Fight-Club-Game
