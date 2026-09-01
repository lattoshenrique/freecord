<div align="center">

<img src="web/public/favicon.svg" width="88" alt="Freecord logo" />

# Freecord

**Guest-first** conversation rooms: anyone creates a room, shares the link, and
friends join with no signup — **voice, video, text chat and screen sharing
(one person at a time)**.

[![License: MIT](https://img.shields.io/badge/license-MIT-5865f2)](LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A5%2020-a855f7)](#running-locally)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-38bdf8)](CONTRIBUTING.md)

**[freecord.lattoshenrique.workers.dev](https://freecord.lattoshenrique.workers.dev)**

</div>

**Fully self-owned**: native browser WebRTC in a P2P mesh plus our own
room/signaling server. No media vendor, no third-party SDK, no external
credentials. See [docs/architecture.md](docs/architecture.md).

Open source under the [MIT license](LICENSE). Contributions welcome — start
with [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

| Piece | Technology | Why |
| --- | --- | --- |
| Media | Native WebRTC (P2P mesh) | Voice/video/screen flow straight between browsers; server cost ~zero |
| Signaling | Our own WebSocket (closed protocol) | Rooms, SDP/ICE relay, chat and screen lock in one place |
| API/server | Node 20+ / Fastify / TypeScript | A single process serves the API, the WS and the built frontend |
| Web | React + Vite | Our own UI; the room bundle is ~14 kB |
| Desktop | Electron shell around the production page | Native screen picker and system media permissions |

## Running locally

Prerequisite: Node 20+. **No account, no external credential.**

```bash
npm install

# terminal 1 — server (port 3001)
npm run dev:server

# terminal 2 — web (port 5173, proxying /api and /ws)
npm run dev:web
```

Open http://localhost:5173, create a room and share the link (`/r/<slug>`) —
open it in a private window to simulate a guest.

## Quality

```bash
npm run typecheck   # tsc across every workspace
npm test            # vitest: room registry, signaling, HTTP routes
npm run build       # production build (server + web)
```

## Deploy

Live at **https://freecord.lattoshenrique.workers.dev** (Cloudflare Workers +
Durable Objects, entirely on free plans — including the `workers.dev` DNS).

```bash
npm run deploy   # web build + wrangler deploy
```

`worker/` is the Cloudflare edge: same HTTP API and same WS protocol as the
Node server, with each room's state living in a Durable Object per slug (see
[docs/architecture.md](docs/architecture.md)).

### Alternative: a single Node process

The Fastify server remains the dev/test target and runs anywhere Node runs — it
serves the web build when `WEB_DIST` points at it:

```bash
npm run build
PORT=3001 WEB_DIST=$(pwd)/web/dist node server/dist/index.js
```

Put it behind a TLS proxy (Caddy/nginx) — WebRTC requires HTTPS outside
localhost. `CORS_ORIGIN` restricts the origin in production.

## Product rules that live in the code

- A room expires on its own after 15 min empty; **12 participants** max (both
  a technical and a product limit of the P2P mesh — see the architecture).
  Audio and screen sharing keep full quality at any room size; cameras adapt —
  fewer slots and less bitrate each as the room fills.
- Screen sharing: **one person at a time**, enforced on the server (a room
  lock, released even on a dropped connection). The sharer picks the preset —
  **Sharp** (text/code), **Balanced**, **Smooth** (video/games) — and the
  switch takes effect immediately.
- A peer with no sign of life for 35 s is **dropped by the server**: without
  that, rooms would be held by ghosts and never expire.
- Latency in plain sight: direct RTT with each person, plus the real
  resolution/fps/bitrate of the shared screen.
- The room link is the access credential: an unguessable random slug.
- Chat is sealed in the browser with a key that lives only in the room link's
  fragment, so the server relays text it cannot read, and never persists it —
  zero content storage. The seal covers message text, not metadata: sender
  names, timestamps and membership are signaling and visible to the server,
  there is no forward secrecy, and whoever holds the link holds the key.
- Files go **peer to peer**: attach one in the chat and it streams over the
  same WebRTC connection as the media (a data channel), never through a
  server. The other side accepts first; both must be online, and when NAT
  forces a TURN relay it forwards ciphertext it cannot read. Up to 1 GB.
