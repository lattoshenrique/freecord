---
name: test-freecord
description: Plan, write, run, and diagnose automated Freecord tests across unit, protocol, browser E2E, Worker regression, and local load suites. Use for regression coverage, practical user-journey validation, load or soak testing, flaky-test diagnosis, and test automation; do not use for unrelated manual QA or unapproved production load.
---

# Test Freecord

Produce evidence for a concrete behavior or risk. Prefer the cheapest test layer
that exercises the real boundary where the behavior can fail, then add broader
coverage only when it proves something different.

## Required context

Read [`.ai/rules.md`](../../rules.md) completely before acting. For E2E,
Worker, or load work, also read [`e2e/README.md`](../../../e2e/README.md) and
inspect the current scripts in `e2e/package.json`; commands and test inventory
may evolve.

## Route the request

- For a bug regression, protocol behavior, browser journey, or flaky E2E, read
  [`references/regression-e2e.md`](references/regression-e2e.md).
- For concurrency, soak, signaling load, memory growth, Durable Object alarms,
  or Worker restart behavior, read
  [`references/load-worker.md`](references/load-worker.md).
- For practical acceptance coverage, suite design, CI gates, or recurring test
  automation, read
  [`references/practical-automation.md`](references/practical-automation.md).

Read every reference that applies, but do not load unrelated modes.

## Working method

1. State the claim being tested and the failure it guards against.
2. Locate the owning boundary: pure logic, shared server core, WebSocket
   protocol, browser/WebRTC journey, Worker-only lifecycle, or resource load.
3. Reproduce or measure the baseline before changing assertions when practical.
4. Add deterministic coverage at the selected layer. Reuse existing helpers and
   cleanup patterns instead of inventing another harness.
5. Run the focused test first, then the proportional regression gates described
   in the relevant reference.
6. Report commands, environment and build freshness, passed/failed/skipped
   counts, load metrics when applicable, and anything that remains unproved.

## Boundaries

- A request to inspect, run, or report tests is read-only. Do not fix product
  code unless the user also requested the fix.
- A request to add tests authorizes test and harness changes, not unrelated
  product changes or relaxed assertions.
- Never aim load at production or any shared remote environment without
  explicit authorization for that exact target and scale. Default to the local
  ephemeral edge.
- Do not turn failures into skips, inflate timeouts, add retries, or weaken an
  assertion merely to make a run green. Diagnose the failing boundary.
- Preserve intentional single-worker execution unless isolation and timing have
  been proven safe under parallelism.
- Do not deploy as part of testing unless deployment was explicitly requested.
- Preserve unrelated work in the shared tree and follow the commit window in
  `.ai/rules.md` for any test artifacts you own.
