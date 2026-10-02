# ADR-0021: Host on Fly.io, one container serving client and server

- **Status:** Accepted
- **Date:** 2026-10-01

## Context

Combat, classes and maps are in, so it's time to play from two houses (Phase 3.5). Until now the client ran on Vite (5173) and the room server on 8787, on the same machine or Wi-Fi. Rooms and matches live in the server's memory (ADR-0005), so the host must run one always-on process with low latency to both pilots (Hard rule 1).

## Decision

- **Fly.io**, one Docker container (`Dockerfile`, `node:26-slim`) that runs the room server and also serves the built client (`dist/client`) on the **same port** (8080 inside, HTTPS outside). The client connects back to its own origin (`wss://<app>.fly.dev`): no CORS, one URL to share.
- **Exactly one machine.** Rooms are in memory, so a second machine would split players. Deploy with `npm run deploy` (`fly deploy --ha=false`).
- **Never auto-stopped** (`auto_stop_machines = "off"`, `min_machines_running = 1`): a cold start would drop players.
- Region **`ord`** (Chicago), closest to us (US Central). Changing region is one line in `fly.toml`.
- `GET /healthz` for Fly's health check. VM: `shared-cpu-1x`, 256 MB (about $2/month).

## Alternatives considered

- **Free tunnel (ngrok / cloudflared) from a home computer:** free, but that computer must be on and running both servers, and it adds a hop.
- **Free tiers that sleep (Render, Railway…):** cold starts drop matches.
- **Static host for the client plus a separate server host:** two deploys, CORS, two URLs.

## Consequences

- `server/src/index.ts` serves HTTP (static client, `/healthz`) and the WebSocket on one port; `SERVE_CLIENT=1` turns on static serving (`npm start`).
- Production builds connect to the same origin; dev still uses Vite on 5173 and the server on 8787. `VITE_SERVER_URL` still overrides both.
- `tsx` is a runtime dependency (the server runs TypeScript directly).
- Scaling past one machine would need shared room state or room-to-machine routing. Out of scope (2-player rooms).
