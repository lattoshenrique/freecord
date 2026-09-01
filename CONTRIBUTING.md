# Contributing to Freecord

Thanks for being here. Freecord is a small, opinionated codebase — a
guest-first rooms app with no accounts, no media vendor and no third-party
SDKs. That constraint is the point, so most of the guidance below is about
keeping it true.

If you are an AI agent working in this repository, read
[AGENTS.md](AGENTS.md) as well — it carries the coordination rules.

## Getting set up

Prerequisite: **Node 20+**. Nothing else — no account, no API key, no external
credential.

```bash
npm install

npm run dev:server   # terminal 1 — Fastify on :3001
npm run dev:web      # terminal 2 — Vite on :5173, proxying /api and /ws
```

Open <http://localhost:5173>, create a room, and open the `/r/<slug>` link in a
second (private) window to play both sides of a call. Screen sharing and camera
need permissions from your OS; on Chrome, `localhost` counts as a secure
origin, so no TLS setup is required for local work.

## Before you open a pull request

```bash
npm run typecheck   # server, web and worker
npm test            # the core: registry, signaling, routes, screen tree
npm run build       # production build of web + server
```

All three must pass. There is no CI gate that will catch it for you on the way
in, so please run them.

## Things that will get a PR sent back

**Language.** Code — identifiers, comments, commit messages, test names — and
docs are in **English**. Anything a user reads on screen is **never
hardcoded**: it goes through the i18n layer in `web/src/i18n/`. Shipping
locales are `en-US` (source of truth), `pt-BR`, `es`, `zh-CN` and `ja`.

**Two edges, one core.** `server/src/domain/` and `server/src/app/` know
nothing about transport. `server/` (Fastify) and `worker/` (Cloudflare Durable
Objects) are two skins over them, and **the Worker is production**. A new route
or protocol message must land in *both* edges in the same change — one edge
only means "works in dev, missing in production". Put the decision logic in
`domain/` so a single test covers both.

**The wire protocol is not yours to rename.** Screen-quality values
(`nitida` / `equilibrada` / `fluida`), message types and `ROOM_LIMITS` are on
the wire. Renaming one is a coordinated change across `server/`, `worker/` and
`web/` shipped in a single deploy — never a drive-by rename. (Yes, those three
values are Portuguese. They are protocol strings, not user-facing text; the
labels the user sees are translated in the i18n layer.)

**No new dependency without a reason that survives a question.** "It's only
2 kB" is not one. The whole protocol lives in this repository on purpose.

## Where things live

```
web/       React + Vite client — the UI, the WebRTC mesh, i18n
server/    Node/Fastify edge + THE SHARED CORE (domain/, app/)
worker/    Cloudflare edge: same core, one Durable Object per room — PRODUCTION
desktop/   Electron shell around the production page (screen picker, permissions)
docs/      architecture.md — read this before a structural change
```

`desktop/` has its own lifecycle: it is not an npm workspace (Electron and
electron-builder would weigh down every install), it has its own lockfile, and
its installers are built by GitHub Actions on a `desktop-v*` tag.

## Tests

`server/test/` tests the **core**, not the Fastify transport — that is what
makes one test cover both edges. `SignalingSession` takes a `PeerSender`
function, so it is tested with fakes and no real WebSocket. If you are adding
behaviour to a room, the test belongs there.

Web tests are Vitest under `web/test/`.

## Commits and pull requests

- Commit messages in English, imperative mood, explaining *why* when the *what*
  is not obvious from the diff.
- One concern per PR. A refactor bundled with a feature is two PRs.
- If your change touches the protocol, the screen relay tree, or room
  lifetimes, say so explicitly in the PR description and update
  [docs/architecture.md](docs/architecture.md) in the same PR.
- Never `git add -A` in this repository — several people (and agents) may have
  uncommitted work in the tree. Commit explicit paths.

## Reporting bugs and requesting features

Open an issue: <https://github.com/lattoshenrique/freecord/issues>.

A good bug report for a real-time app is mostly context, because the failure is
usually about the network path, not the code path. Please include:

- What you did, what you expected, what happened instead.
- Browser and OS (and whether you were on the desktop app).
- How many people were in the room, and whether anyone was sharing a screen.
- Whether the two peers were on the same network, and whether either was on a
  corporate VPN or a mobile carrier — there is no TURN server yet, so a small
  fraction of restrictive networks simply cannot connect media (chat still
  works over the WebSocket; that asymmetry is a useful clue).
- Anything in the browser console.

For a feature request, describe the situation you were in rather than the
solution you have in mind — it usually leads somewhere better.

## Security

Please do not open a public issue for a vulnerability. Report it privately
through GitHub's security advisories on the repository, or by email to the
maintainer.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the
[MIT license](LICENSE) that covers this project.
