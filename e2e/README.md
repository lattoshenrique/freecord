# @freecord/e2e — end-to-end and load tests

Validates the signaling edge (`server/`) and the web app (`web/`) as really
deployed: a booted Node edge serving the built SPA, raw WebSocket clients
speaking the actual protocol, and headless Chromium contexts with fake media.

## Layout

```
boot/serve.mjs        test boot of the real server modules (see "How the server is booted")
setup/                Playwright global setup/teardown (boots the edge once per run)
helpers/              room HTTP client, raw protocol client, browser page helpers
tests/protocol/       protocol-level E2E — raw `ws`, no browser, fast and deterministic
tests/browser/        Playwright + Chromium with fake media
load/                 plain-Node load drivers (no framework)
```

## Prerequisites

```sh
npm install                       # repo root (installs this workspace too)
npx playwright install chromium   # once per machine
```

`server/` is rebuilt on every run (a stale `server/dist` tests yesterday's
rules; skip with `E2E_SKIP_SERVER_BUILD=1` if iterating on tests only). The
SPA is built only when `web/dist` is missing — after changing `web/src`,
force it fresh with `E2E_BUILD_WEB=1`.

## Running

```sh
# everything except the @heavy 12-context test
npm run test --workspace e2e

# individual suites
npm run test:protocol --workspace e2e     # ws-level: capacity, cameras, screen tree, resume
npm run test:browser  --workspace e2e     # 3-context smoke, camera flow, screen share
npm run test:heavy    --workspace e2e     # 12 headless contexts, full mesh (E2E_HEAVY=1)

# load
npm run load:signaling --workspace e2e                       # defaults: 50 rooms x 12 peers
ROOMS=5 PING_SECONDS=10 npm run load:signaling --workspace e2e   # small smoke
npm run load:ramp --workspace e2e                            # 2 min of room churn + RSS watch
```

Load knobs (env): `ROOMS PEERS JOIN_CONCURRENCY PING_SECONDS PING_INTERVAL_MS
CHAT_BURSTS CAMERA_CYCLES SCREEN_CYCLES BUDGET_P95_MS TARGET` (signaling) and
`DURATION_S ROOMS_PER_SEC PEERS HOLD_MS RSS_SAMPLE_S` (ramp). `TARGET=http://…`
points the signaling storm at an already-running edge instead of booting one.

For big storms raise the fd limit first: `ulimit -n 4096` (50×12 = 600 sockets;
the driver warns if the limit looks too low).

## How the server is booted

`boot/serve.mjs` composes the REAL compiled server modules from
`@freecord/server/dist` — the same `RoomRegistry`, `registerRoutes`,
`TurnCredentialProvider` and the same 10 s zombie/expiry sweeps as
`server/src/index.ts` — listening on an ephemeral port, serving `web/dist`
statically with the SPA fallback (the `@fastify/static` single-process
production shape).

One deliberate deviation: production's global anti-abuse rate limit
(60 req/min/IP) also counts WS upgrades and static assets, so any test run
from one loopback IP would trip it while proving nothing about signaling.
The boot keeps the same plugin with `RATE_LIMIT_MAX` env-tunable; tests run
it effectively off. The limit itself is exercised implicitly in production
config only.

Load budgets: p95 is printed against `BUDGET_P95_MS` (default 50 ms — a
deliberately generous local-loopback bound for a single-process edge; a
healthy laptop run sits well under 10 ms). Budgets warn; only real errors
(protocol errors, dropped sockets, lost messages) fail the run.

## Brittleness notes (UI is being restyled in parallel)

Browser tests avoid text and layout assertions and lean on these hooks —
if the restyle renames them, update `helpers/pages.ts` in one place:

- `.seat-count` — the "3/12" counter (also the "we are in the room" signal)
- `.tile` — an OCCUPIED participant tile; `.tile video` — its live camera
- `.tile-seat` — ghost/empty seats: not in the UI yet; the smoke test
  asserts them only if present
- `[data-camera-slots="full"]` + `disabled` on the camera toggle
- `.cam-denied-note` — denied feedback (protocol-tested; in the browser the
  client disables the button before a deniable request can be sent)
- `.screen-video`, `.screen-stats` — screen stage + stats bar
- Prejoin: the single `role=textbox` and `form button[type=submit]`
- Dock buttons found by en-US aria-labels ("Turn camera on/off",
  "Camera seats are full…", "Share screen"/"Stop sharing") — locale is
  pinned via context `locale: 'en-US'` plus `localStorage['freecord:locale']`

Screen-share capture headless relies on
`--auto-select-desktop-capture-source` (+ the tab-capture spelling). If this
Chromium build still refuses, the screen test skips itself with the reason
printed; run it headed with `npx playwright test --project=browser --headed`.

## Final full validation (owner's checklist)

```sh
ulimit -n 4096
npm install && npx playwright install chromium
E2E_BUILD_SERVER=1 E2E_BUILD_WEB=1 npm run test --workspace e2e
npm run test:heavy --workspace e2e
npm run load:signaling --workspace e2e          # 50 rooms x 12, 60 s RTT soak
npm run load:ramp --workspace e2e               # 2 min churn, RSS bounded
```
