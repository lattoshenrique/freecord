# AGENTS.md

Working agreement for humans and AI agents on **Freecord**. Read this before
touching the tree — several agents work here in parallel and the rules below
exist because we already paid for breaking them.

## What this project is

Guest-first rooms: anyone creates a room, shares the link, friends join with no
signup — voice, video, text chat and screen sharing (one person at a time).
Media is native WebRTC in a P2P mesh; the server only owns room state and
signaling. No media vendor, no third-party SDK, no external credentials.

Open source under the [MIT license](LICENSE).
Production: <https://freecord.lattoshenrique.workers.dev>.
Architecture: [docs/architecture.md](docs/architecture.md).

## Language policy (non-negotiable)

| Where | Language |
| --- | --- |
| Code — identifiers, comments, commit messages, test names | **English** |
| Docs — README, `docs/`, this file | **English** |
| Anything a user reads on screen | **Never hardcoded** — goes through i18n |

The project was born in Portuguese and is being converted. If you touch a file
that still has Portuguese comments, translate what you touch; don't leave a
mixed paragraph behind. Never translate a *protocol* value without changing all
edges at once (see below).

Shipping locales: `en-US` (source of truth), `pt-BR`, `es`, `zh-CN`, `ja`.
Language is auto-detected (`navigator.language`, system locale in Electron),
falls back to `en-US`, and a picker persists the choice.

## The shape of the system

```
web/       React + Vite client (the UI, the WebRTC mesh, i18n)
server/    Node/Fastify edge + THE SHARED CORE (domain/, app/)
worker/    Cloudflare edge: same core, Durable Object per room — THIS IS PRODUCTION
desktop/   Electron shell around the production page (screen picker, permissions)
```

**Two edges, one core.** `server/src/domain/` and `server/src/app/` know nothing
about transport. `server/` (Fastify) and `worker/` (Durable Objects) are two
skins over them. Consequences you must respect:

1. A new route or protocol message must be implemented in **both** edges. One
   edge only means "works in dev, missing in production" — production is the
   Worker.
2. Put the decision logic in `domain/`, so one test covers both edges.
   `server/test/` tests the core, not the Fastify transport.
3. Screen-share quality values (`nitida`/`equilibrada`/`fluida`), message types
   and `ROOM_LIMITS` are **wire protocol**. Renaming one is a coordinated
   change across `server/`, `worker/` and `web/` in a single deploy — never a
   drive-by rename.

## Before you commit or deploy

```bash
npm run typecheck   # server, web AND worker (worker imports from server/src)
npm test            # core: registry, signaling, routes, screen tree, downloads
npm run build       # production build of web + server
```

Never `git add -A`: several agents have uncommitted work in this tree. Commit
explicit paths, and only files you own.

`npm run deploy` (root) builds the web and publishes the Worker — it publishes
**the whole working tree**, including other agents' unfinished work. Ask the
other sessions before deploying.

Desktop app has its own lifecycle: `desktop/` is not an npm workspace (Electron
and electron-builder would weigh down every install), it has its own lockfile,
and its installers are built by GitHub Actions on a `desktop-v*` tag.

## Multi-agent rules

- Announce which files you're editing before you start; a file has one owner at
  a time. `ListAgents` + `SendMessage` are how you talk.
- Never "fix" a red typecheck in a file you don't own — it's probably another
  agent's work in progress. Publish from the last good commit instead.
- Adding to a file someone owns (a new export) is fine; changing an existing
  signature is not, without asking.

## Product rules that live in code

- Room dies alone: 15 min empty. Max **12 participants** — a P2P mesh limit
  priced honestly (each peer uploads N−1 copies): audio and screen keep full
  quality at any size, while **camera slots** shrink as the room grows (≤6:
  everyone; 7–9: four; 10–12: three, server-granted) and camera bitrate splits
  a fixed uplink budget across peers.
- Screen share: **one at a time**, locked on the server, released even on a
  dropped connection. The sharer picks the quality preset; screen video
  propagates through a **relay tree** (fanout 3), not a star.
- A peer with no heartbeat for 35 s is dropped by the server — without that,
  ghosts hold seats and rooms never expire.
- The room link is the credential: unguessable random slug, no accounts.
- Chat is ephemeral. Zero content storage, on purpose.

## Desktop app

The Electron app is a **shell around the production page**, not a copy of the
build: every Worker deploy reaches installed apps immediately. What it adds is
what a browser can't do — a native screen-source picker
(`setDisplayMediaRequestHandler`, which Electron requires or screen sharing
simply fails), system media permissions, and a real window.

Installers are too big for Cloudflare assets (25 MiB per file cap, ~130 MB per
installer), so they live in GitHub Releases with **fixed filenames** — that's
what makes `/releases/latest/download/<file>` a permanent link. The page detects
the visitor's OS (and Intel vs Apple Silicon) and offers exactly one build.
