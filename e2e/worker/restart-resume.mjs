// Drives the REAL Worker through the one thing only it can be asked: the
// object under a live room restarting, the way a deploy restarts it. The
// seats live in Durable Object storage from the moment of the join, so a
// new instance still honours the resume tokens the browsers are holding
// — same peerId, same roster, nobody thrown out of a call that never
// stopped (the media is P2P and kept flowing the whole time).
//
// Spawns its own `wrangler dev` twice on the same port, sharing
// worker/.wrangler/state between the runs; needs web/dist built.
// Usage: node e2e/worker/restart-resume.mjs
//
// Exit code 1 on any failed expectation.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const PORT = Number(process.env.PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = BASE.replace(/^http/, 'ws');
const WORKER_DIR = new URL('../../worker/', import.meta.url).pathname;

let failures = 0;
function check(ok, what) {
  if (!ok) {
    failures += 1;
    console.log('  FAIL:', what);
  } else {
    console.log('  ok:', what);
  }
}

async function bootWorker(label) {
  const child = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], {
    cwd: WORKER_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`${label}: wrangler dev never answered on ${PORT}`);
    }
    try {
      const res = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1_500) });
      if (res.status < 500) break;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  console.log(`  ${label}: up on ${PORT}`);
  return child;
}

async function stopWorker(child) {
  const ended = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGINT');
  const raced = await Promise.race([ended, delay(8_000).then(() => 'timeout')]);
  if (raced === 'timeout') {
    child.kill('SIGKILL');
    await ended;
  }
}

async function createRoom(name) {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: name }),
  });
  if (res.status !== 201) throw new Error(`createRoom ${res.status}`);
  return (await res.json()).slug;
}

/** A room member: opens a socket, keeps every frame it was told. */
class Client {
  constructor(ws, name) {
    this.ws = ws;
    this.name = name;
    this.log = [];
    this.waiters = [];
    this.closed = false;
    ws.on('message', (raw) => {
      this.log.push(JSON.parse(raw.toString()));
      for (const wake of [...this.waiters]) wake();
    });
    ws.on('close', () => {
      this.closed = true;
      for (const wake of [...this.waiters]) wake();
    });
  }
  static async open(url, name) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const client = new Client(ws, name);
    client.first = await client.expect(['welcome', 'error']);
    return client;
  }
  static join(slug, name) {
    return Client.open(`${WS}/ws/rooms/${slug}?name=${encodeURIComponent(name)}`, name);
  }
  static resume(slug, token, name) {
    return Client.open(`${WS}/ws/rooms/${slug}?resume=${encodeURIComponent(token)}`, name);
  }
  async expect(kinds, timeoutMs = 8_000) {
    const wanted = Array.isArray(kinds) ? kinds : [kinds];
    const deadline = Date.now() + timeoutMs;
    let cursor = 0;
    for (;;) {
      while (cursor < this.log.length) {
        const message = this.log[cursor++];
        if (wanted.includes(message.t)) return message;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`${this.name}: nothing of ${wanted} arrived`);
      if (this.closed && cursor >= this.log.length) {
        throw new Error(`${this.name}: closed before ${wanted}`);
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 500));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
  async expectWhere(predicate, label) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const message = this.log.find(predicate); if (message) return message;
      await delay(20);
    }
    throw new Error(`${this.name}: ${label} did not arrive`);
  }
  close() {
    try {
      this.ws.close();
    } catch {
      // already gone
    }
  }
}

const run = async () => {
  let worker = await bootWorker('first run');
  let slug;
  let ana;
  let bia;
  let audioPlan;
  try {
    slug = await createRoom('restart-resume');
    ana = await Client.join(slug, 'ana');
    bia = await Client.join(slug, 'bia');
    check(ana.first.t === 'welcome' && bia.first.t === 'welcome', 'both got in');
    for (const client of [ana, bia]) client.ws.send(JSON.stringify({ t: 'audio-capability',
      capability: { publicKey: 'B'.repeat(87), streamId: client.first.selfId } }));
    audioPlan = (await ana.expectWhere(m => m.t === 'audio-plan' && m.plan.mode === 'sparse', 'sparse preparation')).plan;
    ana.ws.send(JSON.stringify({ t: 'audio-ready', generation: audioPlan.generation }));
    await delay(100);
    check(!ana.log.some(m => m.t === 'audio-commit' && m.generation === audioPlan.generation), 'Worker waits for all ready seats');
    bia.ws.send(JSON.stringify({ t: 'audio-ready', generation: audioPlan.generation }));
    await ana.expectWhere(m => m.t === 'audio-commit' && m.generation === audioPlan.generation, 'sparse commit');
    check(true, 'Worker activates the authenticated route generation');
  } finally {
    await stopWorker(worker);
  }
  console.log('  the object under the room is gone (deploy)');
  check(ana.closed && bia.closed, 'both sockets were closed by the restart');

  worker = await bootWorker('second run');
  try {
    // The browsers come back holding what they were handed before.
    const ana2 = await Client.resume(slug, ana.first.resumeToken, 'ana');
    check(ana2.first.t === 'welcome', 'ana was let back in after the restart');
    check(ana2.first.selfId === ana.first.selfId, 'ana kept her peerId, so the mesh never noticed');
    check(
      (ana2.first.peers ?? []).some((peer) => peer.id === bia.first.selfId),
      'bia is still in the room ana came back to',
    );

    const bia2 = await Client.resume(slug, bia.first.resumeToken, 'bia');
    check(bia2.first.t === 'welcome', 'bia was let back in too');
    check(bia2.first.selfId === bia.first.selfId, 'bia kept her peerId');
    check(
      (bia2.first.peers ?? []).some((peer) => peer.id === ana.first.selfId),
      'and each of them still sees the other',
    );

    const restoredPlan = await ana2.expect('audio-plan');
    check(JSON.stringify(restoredPlan.plan) === JSON.stringify(audioPlan), 'audio routes and ephemeral public keys survive Worker restart');
    check((await ana2.expect('audio-commit')).generation === audioPlan.generation, 'audio commit generation survives Worker restart');
    bia2.close();
    await ana2.expectWhere(m => m.t === 'peer-connection' && m.id === bia.first.selfId && !m.connected, 'connection interruption');
    // Real browsers start automatic resume from onclose. A server-side
    // interruption alone does not prove the close handshake finished.
    const closeDeadline = Date.now() + 2_000;
    while (!bia2.closed && Date.now() < closeDeadline) await delay(20);
    check(bia2.closed, 'Worker completes the close handshake before the browser resume deadline');
    const bia3 = await Client.resume(slug, bia.first.resumeToken, 'bia');
    await ana2.expectWhere(m => m.t === 'peer-connection' && m.id === bia.first.selfId && m.connected, 'connection restoration');
    check(ana2.log.filter(m => m.t === 'peer-connection' && m.id === bia.first.selfId && !m.connected).length === 1,
      'Worker emits one interruption and restores the same seat');
    ana2.close();
    await bia3.expectWhere(m => m.t === 'peer-connection' && m.id === ana.first.selfId && !m.connected, 'second interruption');
    bia3.ws.send(JSON.stringify({ t: 'signal', to: ana.first.selfId, data: { candidate: 'held-after-restart' } }));
    const mark = Date.now(); bia3.ws.send(JSON.stringify({ t: 'ping', ts: mark }));
    await bia3.expectWhere(m => m.t === 'pong' && m.ts === mark, 'held signal storage barrier');
    const ana3 = await Client.resume(slug, ana.first.resumeToken, 'ana');
    await ana3.expect('signal');
    check(ana3.log.findIndex(m => m.t === 'audio-plan') < ana3.log.findIndex(m => m.t === 'signal'),
      'restored route generation precedes held SDP/ICE, matching the Node edge');
    ana3.close(); bia3.close();

    const stranger = await Client.resume(slug, 'not-a-token', 'ghost');
    check(
      stranger.first.t === 'error' && stranger.first.code === 'resume_invalid',
      'a token from nowhere is still refused',
    );
    stranger.close();

    const summary = await (await fetch(`${BASE}/api/rooms/${slug}`)).json();
    check(summary.participantCount === 2, `the room counts two people (got ${summary.participantCount})`);
    ana2.close();
    bia2.close();
  } finally {
    await stopWorker(worker);
  }
};

run().then(
  () => {
    console.log(failures === 0 ? '\nall good' : `\n${failures} failed`);
    process.exit(failures === 0 ? 0 : 1);
  },
  (error) => {
    console.error('\nharness error:', error.message);
    process.exit(1);
  },
);
