# Freecord AI working agreement

This is the canonical instruction file for every AI agent working in this
repository. The policy governing AI-specific files lives in
[`.ai/README.md`](README.md). Provider-specific adapters must point here and
must not contain independent project rules.

Working agreement for humans and AI agents on **Freecord**. Read this before
touching the tree — several agents work here in parallel and the rules below
exist because we already paid for breaking them.

## What this project is

Guest-first rooms: anyone creates a room, shares the link, friends join with no
signup — voice, video, text chat, peer-to-peer files and screen sharing (up to
three screens at once). Media, chat and files are native WebRTC in a P2P mesh;
the server only owns room state, presence and signaling. No media vendor, no
third-party SDK, no external credentials.

Open source under the [MIT license](../LICENSE).
Production: <https://freecord.lattoshenrique.workers.dev>.
Architecture: [docs/architecture.md](../docs/architecture.md).

## Language policy (non-negotiable)

| Where | Language |
| --- | --- |
| Code — identifiers, comments, commit messages, test names | **English** |
| Docs — README, `docs/`, `.ai/`, this file | **English** |
| Anything a user reads on screen | **Never hardcoded** — goes through i18n |

The project was born in Portuguese and is being converted. If you touch a file
that still has Portuguese comments, translate what you touch; don't leave a
mixed paragraph behind. Never translate a *protocol* value without changing all
edges at once (see below).

Shipping locales: `en-US` (source of truth), `pt-BR`, `es`, `zh-CN`, `ja`.
Language is auto-detected (`navigator.language`, system locale in Electron),
falls back to `en-US`, and a picker persists the choice.

## Project skills

Versioned, provider-neutral workflows live in `.ai/skills/<name>/SKILL.md`.
Use the frontmatter name and description for discovery. When a user names a
project skill, or the request clearly matches its description, read that
`SKILL.md` completely before acting and follow its routing instructions. Read
supporting references only when the skill routes the current task to them. Do
not copy project skills into a provider-specific tracked directory.

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
3. Screen-share quality values (`sharp`/`balanced`/`smooth`), message types
   and `ROOM_LIMITS` are **wire protocol**. Renaming one is a coordinated
   change across `server/`, `worker/` and `web/` in a single deploy — never a
   drive-by rename.
4. The Worker's Durable Object runs every sweep on **one alarm**. A join or a
   resume may move that alarm earlier, never later — setting it outright once
   postponed a dropped sharer's slot release indefinitely. Check DO timing
   with `npm run check:worker --workspace e2e` against `wrangler dev`.

## Before you commit or deploy

```bash
npm run typecheck   # server, web AND worker (worker imports from server/src)
npm test            # every workspace: core (registry, signaling, routes, screen
                    # trees, downloads), web unit tests AND the e2e Playwright suite
npm run build       # production build of web + server
```

A UI change is not green until the browser project has run against a fresh
build (`E2E_BUILD_WEB=1 npm run test:browser --workspace e2e`): a stale
`web/dist` makes a passing suite lie about what it tested. Anything touching
the Worker's alarm or the screen slots also runs `npm run check:worker
--workspace e2e`.

Never `git add -A`: several agents have uncommitted work in this tree. Commit
explicit paths, and only files you own.

`npm run deploy` (root) builds the web and publishes the Worker — it publishes
**the whole working tree**, including other agents' unfinished work. Ask the
other sessions before deploying.

Desktop app has its own lifecycle: `desktop/` is not an npm workspace (Electron
and electron-builder would weigh down every install), it has its own lockfile,
and its installers are built by GitHub Actions on a `desktop-v*` tag.

## Multi-agent rules

- **Commit small and push at once.** As soon as a step is green (typecheck plus
  the tests it touches), commit it by explicit path and `git push origin main`
  in the same breath, then mirror develop **by the SHA you just pushed**
  (`git push origin <sha>:develop`) — `main:develop` pushes whatever local main
  is at that instant, which in a shared tree may already be a peer's newer
  commit. Work that only exists in the working tree has been lost here before —
  one session's whole-file write silently erased another's edits, and a deploy
  once shipped someone's half-done WIP. A commit on main is the only durable
  place; do not hold work back "for review".
- **The index is one per repo, shared by every session.** A commit
  photographs whatever is staged at that instant, including hunks a peer
  staged a second ago. So commits go through an announced **window**: message
  the coordinator "requesting window" with your path/hunk list, wait for
  "window yours", check `git diff --cached` is empty and `HEAD == origin/main`,
  stage by explicit path (or by hunk in shared files — locale catalogs,
  styles.css, RoomView.tsx, icons.tsx), verify `git show --stat` after the
  commit, push, mirror develop by SHA, and announce "released". One window at
  a time; re-diff shared files if main moved while you held it.
- Announce which files you're editing before you start; a file has one owner at
  a time. `ListAgents` + `SendMessage` are how you talk.
- Never "fix" a red typecheck in a file you don't own — it's probably another
  agent's work in progress. Publish from the last good commit instead.
- Adding to a file someone owns (a new export) is fine; changing an existing
  signature is not, without asking.

## Product rules that live in code

- Room dies alone: 15 min empty. Max **20 participants** — a P2P mesh limit
  priced honestly (each peer uploads N−1 copies): audio and screen keep full
  quality at any size, while **camera slots** shrink as the room grows (≤6:
  everyone; 7–9: four; 10–16: three; 17–20: two, server-granted) and camera
  bitrate splits a fixed uplink budget across peers.
- Screen share: **up to three at once** (`ROOM_LIMITS.maxScreens`), slots
  granted on the server in start order and released even on a dropped
  connection (a dropped sharer's slot frees at a 10 s grace, ahead of the
  seat). The sharer picks the quality preset; each screen propagates through
  a **relay tree** of its own (fanout 3), not a star, and a peer may be a leaf
  in one tree and a relay in another.
- Presence is server state: mic and speaker mutes are broadcast and listed in
  `welcome`, because a muted track still flows as silence and the mesh cannot
  tell.
- A peer with no heartbeat for 35 s is dropped by the server — without that,
  ghosts hold seats and rooms never expire. Signals addressed to a peer
  inside that grace are **held, not dropped** (both edges), and the client
  mesh has a watchdog that rolls back a negotiation left open and retries a
  dead ICE path: a frozen tile must heal without F5.
- The room link is the credential: unguessable random slug, no accounts.
  Anyone in the room can rename it (`PATCH /api/rooms/:slug`, both edges).
- The tool shelf in the dock is **room state, not a private window**: a
  video someone opens plays for everybody, but only the person who starts
  Watch Together controls it until they close it for the room — the same
  ownership shape as a screen share. Other tools remain last-word-wins.
  Tools are a **plugin contract** (`docs/tools.md`): the edges carry one
  opaque JSON value per tool id (`domain/tools.ts`), so a new tool is a folder under
  `web/src/tools/` plus a line in its registry, and never a protocol
  change. Because the server cannot validate a state it does not
  understand, every tool checks its own on arrival (`parseState`) — that
  function is a security boundary, not a formality.
- Chat is ephemeral and sealed, and it rides the mesh: text goes peer to peer
  on its own data channel, and through the server only for a seat whose
  channel is not up (joining, resuming, or a peer that can never connect
  directly). One path per message, no dedup. Files go peer to peer on a
  second data channel, up to 1 GB, never through a server. Zero content
  storage, on purpose.

## Desktop app

The Electron app is a **shell around the production page**, not a copy of the
build: every Worker deploy reaches installed apps immediately. What it adds is
what a browser can't do — a screen-source picker of our own
(`setDisplayMediaRequestHandler`, which Electron requires or screen sharing
simply fails), system media permissions, and a real window.

Its windows are **frameless**, and the page draws the title bar
(`web/src/components/TitleBar.tsx` ↔ `desktop/src/window-chrome.ts`). Two rules
follow. The height the bar costs is `--titlebar-h`, subtracted once into
`--app-h`: a full-height screen measures itself against that token and never
writes `100dvh` again. And both sides fail safe — the page draws no bar unless
the shell declares the `windowChrome` capability, and a shell whose page never
reports one back puts the menu bar in, because a frameless window nobody can
close is the one outcome neither side may ship.

Installers are too big for Cloudflare assets (25 MiB per file cap, ~130 MB per
installer), so they live in GitHub Releases with **fixed filenames** — that's
what makes `/releases/latest/download/<file>` a permanent link. The page detects
the visitor's OS (and Intel vs Apple Silicon) and offers exactly one build, on
the home and again inside the call settings dialog. The shell polls the same
`/api/downloads` catalog and offers to update itself, one prompt per version.

The `desktop-v*` tag is the release: CI builds the installers on the tag push
and **clobbers** anything uploaded to that release by hand, so a local build is
for testing only. Push the tag before creating the GitHub release, never the
other way round.
