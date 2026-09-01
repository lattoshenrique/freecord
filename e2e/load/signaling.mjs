/**
 * Signaling storm: R rooms x P peers against a real edge, then sustained
 * ping RTT, chat fanout bursts, camera-slot churn and screen lock churn.
 *
 * Hard-fails ONLY on errors (protocol errors, socket errors, unexpected
 * closes, lost chat messages). Latency budgets are printed, never fatal:
 * a slow laptop is not a broken protocol.
 *
 * Knobs (env):
 *   ROOMS=50 PEERS=12 JOIN_CONCURRENCY=50 PING_SECONDS=60
 *   PING_INTERVAL_MS=2000 CHAT_BURSTS=3 CAMERA_CYCLES=3 SCREEN_CYCLES=5
 *   BUDGET_P95_MS=50   local-loopback p95 budget for join + ping RTT
 *   TARGET=http://host:port   drive an already-running edge instead of booting one
 */
import { spawnSync } from 'node:child_process';
import { bootServer, ensureBuilds } from '../helpers/server-boot.mjs';
import { LoadClient, pooled } from './lib/client.mjs';
import { ErrorTally, Series, budgetLine } from './lib/metrics.mjs';

const env = (name, fallback) => Number(process.env[name] ?? fallback);
const ROOMS = env('ROOMS', 50);
const PEERS = env('PEERS', 12);
const JOIN_CONCURRENCY = env('JOIN_CONCURRENCY', 50);
const PING_SECONDS = env('PING_SECONDS', 60);
const PING_INTERVAL_MS = env('PING_INTERVAL_MS', 2000);
const CHAT_BURSTS = env('CHAT_BURSTS', 3);
const CAMERA_CYCLES = env('CAMERA_CYCLES', 3);
const SCREEN_CYCLES = env('SCREEN_CYCLES', 5);
const BUDGET_P95_MS = env('BUDGET_P95_MS', 50);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkFileDescriptors(needed) {
  const result = spawnSync('sh', ['-c', 'ulimit -n'], { encoding: 'utf8' });
  const limit = Number(result.stdout?.trim());
  if (Number.isFinite(limit) && limit < needed) {
    console.warn(
      `WARNING: ulimit -n is ${limit} but this run opens ~${needed} sockets. ` +
        `Run "ulimit -n ${Math.max(4096, needed * 2)}" first or joins will fail.`,
    );
  }
}

// --- metrics ---------------------------------------------------------------
const errors = new ErrorTally();
const createSeries = new Series('room create (HTTP)');
const joinSeries = new Series('join -> welcome');
const rttSeries = new Series('ping RTT');
const chatSeries = new Series('chat fanout delivery');
const cameraSeries = new Series('camera request -> decision');
const screenSeries = new Series('screen request -> route');

let chatExpected = 0;
let chatReceived = 0;
let cameraGranted = 0;
let cameraDenied = 0;

async function run() {
  checkFileDescriptors(ROOMS * PEERS + 64);

  let base = process.env.TARGET?.replace(/\/$/, '');
  let server = null;
  if (!base) {
    await ensureBuilds({ withWeb: false });
    server = await bootServer({});
    base = `http://127.0.0.1:${server.port}`;
  }
  const wsBase = base.replace(/^http/, 'ws');
  console.log(
    `target=${base}  rooms=${ROOMS} peers=${PEERS} ` +
      `ping=${PING_SECONDS}s@${PING_INTERVAL_MS}ms bursts=${CHAT_BURSTS} camera=${CAMERA_CYCLES} screen=${SCREEN_CYCLES}`,
  );

  // --- phase 1: create rooms + join storm ---------------------------------
  const t0 = Date.now();
  const slugs = await pooled(
    Array.from({ length: ROOMS }, (_, i) => async () => {
      const start = Date.now();
      const response = await fetch(`${base}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: `load-${i}` }),
      });
      createSeries.record(Date.now() - start);
      if (response.status !== 201) {
        errors.bump('create-room', `status ${response.status}`);
        return null;
      }
      return (await response.json()).slug;
    }),
    10,
  );

  /** rooms[i] = array of LoadClients for room i */
  const rooms = slugs.map(() => []);
  const joinTasks = [];
  slugs.forEach((slug, roomIndex) => {
    if (!slug) {
      return;
    }
    for (let p = 0; p < PEERS; p += 1) {
      joinTasks.push(async () => {
        const label = `r${roomIndex}p${p}`;
        const start = Date.now();
        const client = new LoadClient(
          `${wsBase}/ws/rooms/${encodeURIComponent(slug)}?name=${label}`,
          errors,
          label,
        );
        client.roomIndex = roomIndex;
        try {
          await client.waitForWelcome();
          joinSeries.record(Date.now() - start);
          rooms[roomIndex].push(client);
        } catch (error) {
          errors.bump('join', error.message);
        }
      });
    }
  });
  await pooled(joinTasks, JOIN_CONCURRENCY);
  const clients = rooms.flat();
  console.log(`joined ${clients.length}/${ROOMS * PEERS} in ${Date.now() - t0}ms`);

  // Message hooks: RTT + chat fanout accounting ride every phase.
  for (const client of clients) {
    client.onMessage = (message) => {
      if (message.t === 'pong') {
        rttSeries.record(Date.now() - message.ts);
      } else if (message.t === 'chat' && typeof message.text === 'string' && message.text.startsWith('lc:')) {
        const sentAt = Number(message.text.split(':')[3]);
        if (Number.isFinite(sentAt)) {
          chatSeries.record(Date.now() - sentAt);
          chatReceived += 1;
        }
      }
    };
  }

  // Heartbeat/RTT loop for everyone, alive through all phases (also keeps
  // seats from the zombie sweep, exactly like the real client's ping).
  const pingTimer = setInterval(() => {
    const ts = Date.now();
    for (const client of clients) {
      client.send({ t: 'ping', ts });
    }
  }, PING_INTERVAL_MS);

  // --- phase 2: sustained RTT ---------------------------------------------
  console.log(`sustained ping for ${PING_SECONDS}s...`);
  await sleep(PING_SECONDS * 1000);

  // --- phase 3: chat fanout bursts ----------------------------------------
  console.log(`chat: ${CHAT_BURSTS} bursts...`);
  for (let burst = 0; burst < CHAT_BURSTS; burst += 1) {
    for (const room of rooms) {
      chatExpected += room.length * room.length; // every member hears every sender
      for (const client of room) {
        client.send({ t: 'chat', text: `lc:${client.roomIndex}:${client.label}:${Date.now()}` });
      }
    }
    // Let each burst drain before the next (fanout is R x P^2 messages).
    const deadline = Date.now() + 15_000;
    while (chatReceived < chatExpected && Date.now() < deadline) {
      await sleep(50);
    }
  }
  if (chatReceived < chatExpected) {
    errors.bump('chat-missing', `${chatExpected - chatReceived} of ${chatExpected} not delivered`);
  }

  // --- phase 4: camera-slot churn -----------------------------------------
  console.log(`camera churn: ${CAMERA_CYCLES} cycles x ${clients.length} peers...`);
  await pooled(
    clients.map((client) => async () => {
      for (let cycle = 0; cycle < CAMERA_CYCLES; cycle += 1) {
        const start = Date.now();
        client.send({ t: 'camera-request' });
        try {
          const decision = await client.waitFor(
            (m) =>
              (m.t === 'camera-started' && m.id === client.welcome.selfId) || m.t === 'camera-denied',
            15_000,
            'camera decision',
          );
          cameraSeries.record(Date.now() - start);
          if (decision.t === 'camera-started') {
            cameraGranted += 1;
            client.send({ t: 'camera-stop' });
            await client.waitFor(
              (m) => m.t === 'camera-stopped' && m.id === client.welcome.selfId,
              15_000,
              'camera-stopped',
            );
          } else {
            cameraDenied += 1;
          }
        } catch (error) {
          errors.bump('camera-churn', error.message);
          return;
        }
      }
    }),
    200,
  );

  // --- phase 5: screen lock churn -----------------------------------------
  console.log(`screen churn: ${SCREEN_CYCLES} cycles per room...`);
  await pooled(
    rooms
      .filter((room) => room.length > 0)
      .map((room) => async () => {
        const sharer = room[0];
        for (let cycle = 0; cycle < SCREEN_CYCLES; cycle += 1) {
          const start = Date.now();
          sharer.send({ t: 'screen-request', streamId: `s-${cycle}`, quality: 'balanced' });
          try {
            await sharer.waitFor(
              (m) => m.t === 'screen-route' && m.quality === 'balanced' && m.source === null,
              15_000,
              'screen-route',
            );
            screenSeries.record(Date.now() - start);
            sharer.send({ t: 'screen-stop' });
            await sharer.waitFor((m) => m.t === 'screen-stopped', 15_000, 'screen-stopped');
          } catch (error) {
            errors.bump('screen-churn', error.message);
            return;
          }
        }
      }),
    50,
  );

  // --- teardown ------------------------------------------------------------
  clearInterval(pingTimer);
  await pooled(
    clients.map((client) => async () => client.leave()),
    100,
  );
  await sleep(500);
  if (server) {
    await server.stop();
  }

  // --- report --------------------------------------------------------------
  console.log('\n=== signaling load report ===');
  for (const series of [createSeries, joinSeries, rttSeries, chatSeries, cameraSeries, screenSeries]) {
    console.log(series.summary());
  }
  console.log(`camera decisions: granted=${cameraGranted} denied=${cameraDenied} (denials are the cap working, not errors)`);
  console.log(`chat delivery: ${chatReceived}/${chatExpected}`);
  console.log(budgetLine('join p95', joinSeries.percentile(95), BUDGET_P95_MS));
  console.log(budgetLine('ping RTT p95', rttSeries.percentile(95), BUDGET_P95_MS));
  console.log(errors.summary());

  if (errors.total > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
