# Regression and E2E testing

Use this guide for bug reproductions, deterministic regressions, protocol
coverage, browser journeys, and flaky-test diagnosis.

## Choose the boundary

| Layer | Use it to prove | Existing location |
| --- | --- | --- |
| Unit/domain | parsing, state transitions, policies, pure helpers | `server/test/`, `web/test/`, colocated tool tests, `relay/test/` |
| Protocol E2E | room lifecycle and wire behavior through the real Node edge | `e2e/tests/protocol/` |
| Browser E2E | user-visible journeys crossing the built SPA, WebSocket, WebRTC, and multiple peers | `e2e/tests/browser/` |
| Worker probe | alarms, Durable Object storage, hibernation, and restart behavior | `e2e/worker/` |

Do not use a browser to prove a pure function. Do not stop at a unit test when
the regression existed only across a transport, browser permission, media
connection, or production Worker lifecycle.

## Write a regression that lasts

- Make the test fail for the original defect or capture the failing baseline
  before the fix. A passing test written only after the implementation is weak
  evidence unless its counterfactual is clear.
- Name the observable behavior and the condition that caused the regression.
  Avoid names tied to the implementation chosen to fix it.
- Drive public behavior: domain APIs, HTTP/WebSocket messages, accessible UI,
  media state, or documented metrics. Inspect internals only at a lower unit
  layer where they are the contract.
- Give every test a fresh room and clean up every socket, browser context,
  process, timer, and temporary artifact. Use the existing helpers.
- In browser tests, use separate browser contexts for separate people. A second
  tab in one context does not faithfully model independent permissions or
  storage.
- Prefer roles, accessible names, and stable semantic hooks. Put repeated or
  brittle selectors in `e2e/helpers/pages.ts`; do not assert styling or layout
  unless the layout itself is the behavior.
- Wait for events or poll observable state. Fixed sleeps are reserved for
  deliberate silence windows, grace periods, and timing contracts, and should
  explain why elapsed time is the behavior.
- Keep locale deterministic when assertions use copy. Follow the existing
  `en-US` browser-context setup.
- A skipped capability is not a pass. Screen capture may skip under headless
  Chromium; report that separately and run the focused scenario headed when
  the environment can support it.

## Run focused, then broad

Examples below assume the repository root. Confirm the current package scripts
before running them.

```bash
# Focused unit files
npm test --workspace server -- test/signaling.test.ts
npm test --workspace web -- test/file-transfer.test.ts
npm test --workspace relay -- test/policy.test.ts

# Protocol and browser projects
npm run test:protocol --workspace e2e
E2E_BUILD_WEB=1 npm run test:browser --workspace e2e

# Default E2E excludes the @heavy full-room scenario
E2E_BUILD_WEB=1 npm test --workspace e2e

# Run the 20-context mesh explicitly when capacity or fanout is in scope
E2E_BUILD_WEB=1 npm run test:heavy --workspace e2e
```

The E2E harness rebuilds the server by default. Force a fresh web build after
any `web/src` change with `E2E_BUILD_WEB=1`; otherwise an existing `web/dist`
can make a browser pass test stale code.

After focused coverage is green, apply the repository gates proportionate to
the change. UI changes require the fresh browser project. Protocol changes
require core tests plus protocol E2E. Worker timing and screen-slot changes also
require the Worker probe described in `load-worker.md`.

## Diagnose flakes

Classify the failure before editing the test: stale build, missing browser
capability, leaked peer or process, selector drift, unobserved async state,
timing contract, port collision, or real product race. Preserve logs and the
first failing trace/output. Re-run the smallest scenario enough times to test a
hypothesis; do not add retries or sleeps as a diagnosis.
