# Practical automated testing

Use this guide to design acceptance coverage, recurring regression gates, or
CI automation that reflects how Freecord is actually used.

## Practical means real seams

A practical automated test proves a user or operator outcome through the
smallest realistic stack:

- Browser journeys use the built SPA, real signaling edge, separate people in
  separate contexts, and observable WebRTC/media/data-channel outcomes.
- Protocol journeys use real HTTP and WebSocket frames rather than calling a
  transport handler directly.
- Worker-only behavior runs against local `wrangler dev`, not a Node substitute.
- Load tests create real rooms and sockets and verify delivery, lifecycle, and
  resource behavior instead of measuring a mocked loop.

Fake camera/microphone devices and auto-approved permissions are acceptable
environment controls; replacing the behavior under test with a mock is not.
Avoid pixel-perfect assertions unless pixels are the product requirement.

## Gate by changed surface

| Changed surface | Minimum useful automation |
| --- | --- |
| Pure web helper or tool state | focused web/unit test and web typecheck |
| Shared domain decision | focused server test and server typecheck |
| HTTP route or WebSocket message | core test plus protocol E2E; cover Node and Worker parity |
| Room UI or user journey | focused web test where useful plus fresh-build browser E2E |
| WebRTC media, chat, or files | multi-context browser E2E and the owning lower-layer tests |
| Worker alarm, resume, or screen slots | core/protocol regression plus local Worker probe |
| Relay codec or policy | relay unit suite, typecheck, and build when package output changes |
| Desktop shell | desktop typecheck/build and a focused shell check when available |
| Capacity or resource behavior | small load smoke, then authorized full load/soak |

Documentation-only and AI-skill changes need structural/link validation rather
than an unrelated full browser run.

## Automation design

- Keep a fast deterministic gate separate from heavy capacity, load, soak, and
  local Worker jobs. Make the expensive job explicit instead of hiding it in a
  retry loop.
- Preserve Playwright's one-worker setting until the shared-server timing model
  is deliberately redesigned and proven under parallelism.
- Install Chromium once per environment and fail clearly when prerequisites
  are absent. Do not silently downgrade an intended browser test to a unit test.
- Build the server fresh for E2E and force the web build with
  `E2E_BUILD_WEB=1` after UI changes.
- Give every job a bounded timeout and reliable teardown. On interruption,
  terminate only the processes created by that job.
- Keep secrets and production URLs out of tracked test configuration. Remote
  targets and credentials must come from the authorized runtime environment.
- Preserve actionable output: failing scenario, first causal error, relevant
  logs, skip reasons, and load metrics. Do not reduce failures to a single red
  status with no evidence.

For a full local release-confidence pass, use the current commands required by
`.ai/rules.md`, then add fresh E2E, heavy, Worker, and load runs only when their
risk areas are in scope. Never treat a skipped `@heavy` case or headless screen
capture as executed coverage.

## Handoff format

Report:

1. the behavior and risk covered;
2. files or suites added or changed;
3. exact commands and relevant environment;
4. pass, fail, and skip counts;
5. metrics and baselines for load work;
6. remaining gaps, especially browser capabilities or Worker scenarios not run.
