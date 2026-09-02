# Load and Worker validation

Use this guide for signaling storms, churn and memory soaks, room-capacity
stress, Worker alarms, Durable Object persistence, and restart/resume behavior.

## Safety boundary

The default target is the locally booted ephemeral Node edge. `TARGET` changes
the signaling load destination. Before using a non-loopback `TARGET`, obtain
explicit authorization for the exact environment, concurrency, duration, and
time window. Never infer permission to load production from permission to run
ordinary tests.

Start with a small smoke to verify the harness and file-descriptor limit:

```bash
ROOMS=5 PEERS=3 PING_SECONDS=10 CHAT_BURSTS=1 CAMERA_CYCLES=1 SCREEN_CYCLES=1 \
  npm run load:signaling --workspace e2e

DURATION_S=15 ROOMS_PER_SEC=1 PEERS=2 HOLD_MS=1000 RSS_SAMPLE_S=2 \
  npm run load:ramp --workspace e2e
```

Then use the repository defaults when the smoke is clean:

```bash
ulimit -n 4096
npm run load:signaling --workspace e2e
npm run load:ramp --workspace e2e
```

The signaling driver defaults to 50 rooms with 12 peers and sustained RTT,
chat fanout, camera-slot churn, and screen-slot churn. The ramp driver defaults
to two minutes of room creation, activity, departure, and server RSS sampling.
Read the current environment knobs in `e2e/README.md` and the driver before
changing scale.

Protocol/socket errors, unexpected closes, and lost messages are failures.
Latency budget overruns and RSS growth verdicts are warnings because local
hardware and garbage collection vary; record them with p50, p95, p99, maximum,
sample count, machine context, and comparison baseline rather than silently
calling the run green.

## Real Worker checks

Node E2E cannot prove Durable Object alarms, hibernation-safe storage, or
restart persistence. For screen-slot release, quick rejoin, zombie cleanup,
mute presence, and concurrent-screen limits, start a local Worker on port 8787
from `worker/`:

```bash
npx wrangler dev --port 8787
```

Then, from the repository root, run:

```bash
npm run check:worker --workspace e2e
```

Use `BASE` only for an explicitly authorized alternate local target. For the
restart/resume persistence scenario, build `web/dist` first and run the harness
that owns its two Worker lifecycles:

```bash
npm run build --workspace web
node e2e/worker/restart-resume.mjs
```

Do not point Worker probes at production and do not run `wrangler deploy` as a
test setup step.

## Load result record

Capture the commit SHA, exact command and environment variables, target,
machine/runtime versions, start time and duration, sockets/rooms/peers, error
tally, delivery counts, latency percentiles, RSS samples, warnings, and whether
cleanup completed. Compare equivalent runs; different hardware or scales are
not a regression baseline.
