/**
 * Ramp: rooms created, lived-in and abandoned continuously, watching the
 * server process RSS the whole time.
 *
 * Note on "destroyed": peers leave for real (protocol `leave`), but the
 * server keeps an EMPTY room object for 15 minutes by design
 * (ROOM_LIMITS.emptyTimeoutMs) — so over a 2-minute run the room COUNT
 * grows linearly on purpose. What must stay bounded is the per-room cost
 * after its peers left: RSS should grow far slower than the connection
 * churn, and never unbounded. Hard-fails on protocol/socket errors; RSS
 * growth prints a verdict (warn) since GC timing makes a hard byte
 * threshold flaky.
 *
 * Knobs (env):
 *   DURATION_S=120 ROOMS_PER_SEC=2 PEERS=3 HOLD_MS=3000 RSS_SAMPLE_S=5
 */
import { spawnSync } from 'node:child_process';
import { bootServer, ensureBuilds } from '../helpers/server-boot.mjs';
import { LoadClient } from './lib/client.mjs';
import { ErrorTally, Series } from './lib/metrics.mjs';

const env = (name, fallback) => Number(process.env[name] ?? fallback);
const DURATION_S = env('DURATION_S', 120);
const ROOMS_PER_SEC = env('ROOMS_PER_SEC', 2);
const PEERS = env('PEERS', 3);
const HOLD_MS = env('HOLD_MS', 3000);
const RSS_SAMPLE_S = env('RSS_SAMPLE_S', 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rssMb(pid) {
  // Coarse is fine: `ps` RSS in KB on macOS and Linux alike.
  const result = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
  const kb = Number(result.stdout?.trim());
  return Number.isFinite(kb) ? kb / 1024 : null;
}

async function run() {
  await ensureBuilds({ withWeb: false });
  const server = await bootServer({});
  const base = `http://127.0.0.1:${server.port}`;
  const wsBase = base.replace(/^http/, 'ws');

  const errors = new ErrorTally();
  const lifecycleSeries = new Series('room lifecycle (create->left)');
  const rssSamples = [];
  let started = 0;
  let completed = 0;

  console.log(
    `ramp: ${ROOMS_PER_SEC} rooms/s x ${DURATION_S}s, ${PEERS} peers each, held ${HOLD_MS}ms (pid ${server.child.pid})`,
  );

  const rssTimer = setInterval(() => {
    const mb = rssMb(server.child.pid);
    if (mb !== null) {
      rssSamples.push({ at: Date.now(), mb });
    }
  }, RSS_SAMPLE_S * 1000);
  rssSamples.push({ at: Date.now(), mb: rssMb(server.child.pid) ?? 0 });

  const inFlight = new Set();

  async function roomLifecycle(index) {
    const start = Date.now();
    try {
      const response = await fetch(`${base}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: `ramp-${index}` }),
      });
      if (response.status !== 201) {
        errors.bump('create-room', `status ${response.status}`);
        return;
      }
      const { slug } = await response.json();

      const clients = [];
      for (let p = 0; p < PEERS; p += 1) {
        const client = new LoadClient(
          `${wsBase}/ws/rooms/${encodeURIComponent(slug)}?name=ramp${index}p${p}`,
          errors,
          `ramp${index}p${p}`,
        );
        clients.push(client);
      }
      await Promise.all(clients.map((c) => c.waitForWelcome()));

      // A little life: a chat line and a heartbeat each.
      for (const client of clients) {
        client.send({ t: 'chat', text: `hello from ${client.label}` });
        client.send({ t: 'ping', ts: Date.now() });
      }
      await sleep(HOLD_MS);

      for (const client of clients) {
        client.leave();
      }
      completed += 1;
      lifecycleSeries.record(Date.now() - start);
    } catch (error) {
      errors.bump('lifecycle', error.message);
    }
  }

  const endAt = Date.now() + DURATION_S * 1000;
  const interval = 1000 / ROOMS_PER_SEC;
  while (Date.now() < endAt) {
    started += 1;
    const task = roomLifecycle(started).finally(() => inFlight.delete(task));
    inFlight.add(task);
    await sleep(interval);
  }
  await Promise.all([...inFlight]);
  clearInterval(rssTimer);
  const finalRss = rssMb(server.child.pid);
  if (finalRss !== null) {
    rssSamples.push({ at: Date.now(), mb: finalRss });
  }
  await server.stop();

  console.log('\n=== ramp report ===');
  console.log(`lifecycles: started=${started} completed=${completed}`);
  console.log(lifecycleSeries.summary());
  const first = rssSamples[0]?.mb ?? null;
  const max = rssSamples.length ? Math.max(...rssSamples.map((s) => s.mb)) : null;
  const last = rssSamples.at(-1)?.mb ?? null;
  console.log(
    `server RSS: start=${first?.toFixed(1)}MB max=${max?.toFixed(1)}MB end=${last?.toFixed(1)}MB ` +
      `(${rssSamples.length} samples over ${DURATION_S}s)`,
  );
  if (first && last) {
    const growth = last / first;
    const verdict =
      growth <= 3 ? 'BOUNDED' : 'SUSPICIOUS GROWTH (warn — empty rooms persist 15min by design, but check for a leak)';
    console.log(`RSS growth: ${growth.toFixed(2)}x — ${verdict}`);
  }
  console.log(errors.summary());
  if (errors.total > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
