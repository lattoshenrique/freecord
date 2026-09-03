// A connection that dies without a FIN, and what the room does about it.
//
// The one case only the real Worker can be asked: a socket the room has
// already ordered closed, whose browser is never coming back to answer
// the close frame. The runtime keeps listing it; the room must not keep
// counting it. Otherwise the zombie sweep finds the same dead socket
// every seventeen seconds and says goodbye again — a farewell chime with
// no end to it — and the next person to reload gets a roster of ghosts.
//
// The ghost here is a raw TCP socket: it does the WebSocket handshake
// (the join rides in the URL, so nothing else has to be said), then never
// pings, never answers, never closes. Which is exactly what a laptop lid
// closing looks like from here.
//
// Spawns its own `wrangler dev`; needs web/dist built.
// Usage: node e2e/worker/ghost-sweep.mjs
//
// Exit code 1 on any failed expectation. Takes about two minutes.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const PORT = Number(process.env.PORT ?? 8797);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = BASE.replace(/^http/, 'ws');
const WORKER_DIR = new URL('../../worker/', import.meta.url).pathname;
/**
 * Long enough for the sweep (peerTimeoutMs / 2 = 17.5 s) to come round twice
 * after the first goodbye, which lands at ~53 s: one departure is a
 * departure, a second is the bug. Raise WATCH_MS to watch it for longer.
 */
const WATCH_MS = Number(process.env.WATCH_MS ?? 95_000);

let failures = 0;
function check(ok, what) {
  if (!ok) {
    failures += 1;
    console.log('  FAIL:', what);
  } else {
    console.log('  ok:', what);
  }
}

async function bootWorker() {
  // Its own storage: another `wrangler dev` on this machine sharing
  // worker/.wrangler/state would be a second object under the same room.
  const state = mkdtempSync(join(tmpdir(), 'freecord-ghost-'));
  const child = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state],
    { cwd: WORKER_DIR, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Whatever the Worker itself complains about is worth seeing here.
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (/error|exception|throw|reject|restart|detected changes/i.test(line)) {
          console.log(`    worker: ${line.trim()}`);
        }
      }
    });
  }
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`wrangler dev never answered on ${PORT}`);
    }
    try {
      const res = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1_500) });
      if (res.status < 500) break;
    } catch {
      // not up yet
    }
    await delay(500);
  }
  console.log(`  wrangler dev: up on ${PORT}`);
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

/** A room member that answers pings, the way a browser does. */
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
    // Proof of life, on the room's own cadence (heartbeatIntervalMs).
    this.beat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'ping', ts: Date.now() }));
      }
    }, 10_000);
  }
  static async join(slug, name) {
    const ws = new WebSocket(`${WS}/ws/rooms/${slug}?name=${encodeURIComponent(name)}`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const client = new Client(ws, name);
    client.first = await client.expect(['welcome', 'error']);
    return client;
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
  close() {
    clearInterval(this.beat);
    try {
      this.ws.close();
    } catch {
      // already gone
    }
  }
}

/**
 * The vanished one: in the room over a raw socket, then silent forever.
 * It never answers a ping, a close frame or anything else — the bytes go
 * nowhere, as they do when the wi-fi is gone.
 */
function openGhost(slug, name) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, '127.0.0.1', () => {
      socket.write(
        `GET /ws/rooms/${slug}?name=${encodeURIComponent(name)} HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${PORT}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      );
    });
    socket.once('error', reject);
    socket.once('data', (chunk) => {
      const head = chunk.toString('latin1');
      if (!head.startsWith('HTTP/1.1 101')) {
        reject(new Error(`the door did not open: ${head.split('\r\n')[0]}`));
        return;
      }
      // From here on everything the room says falls on the floor.
      socket.resume();
      resolve(socket);
    });
  });
}

const run = async () => {
  const worker = await bootWorker();
  try {
    const slug = await createRoom('ghost-sweep');
    const ana = await Client.join(slug, 'ana');
    check(ana.first.t === 'welcome', 'ana is in the room');

    const ghost = await openGhost(slug, 'sumido');
    const joined = await ana.expect('peer-joined');
    const ghostId = joined.peer.id;
    console.log(`  room ${slug}: ana=${ana.first.selfId}, the vanished one=${ghostId}`);

    console.log(`  watching for ${Math.round(WATCH_MS / 1000)}s while nobody answers for it...`);
    const seen = [];
    const startedAt = Date.now();
    const deadline = startedAt + WATCH_MS;
    let cursor = ana.log.length;
    while (Date.now() < deadline) {
      while (cursor < ana.log.length) {
        const message = ana.log[cursor++];
        if (message.t === 'peer-left' && message.id === ghostId) {
          seen.push(Math.round((Date.now() - startedAt) / 1000));
          console.log(`    peer-left at +${seen[seen.length - 1]}s`);
        }
      }
      await delay(500);
    }

    // If this one fails the run proved nothing: the Worker restarted under
    // it (a reload, or another `wrangler dev` on the same state) and took
    // every socket with it.
    check(!ana.closed, 'ana was in the room the whole time');
    check(seen.length > 0, `the room noticed the vanished one (${seen.length} peer-left)`);
    check(
      seen.length <= 1,
      `it said so exactly once — got ${seen.length} at [${seen.join(', ')}]s`,
    );

    // Somebody reloads the page: a fresh join, and the roster it is handed.
    const bia = await Client.join(slug, 'bia');
    check(bia.first.t === 'welcome', 'bia got in');
    const roster = (bia.first.peers ?? []).map((peer) => peer.id);
    check(
      !roster.includes(ghostId),
      `a reload does not inherit the ghost (roster: ${roster.length} people)`,
    );
    check(
      roster.includes(ana.first.selfId),
      'and still sees the person who is really there',
    );

    const summary = await (await fetch(`${BASE}/api/rooms/${slug}`)).json();
    check(
      summary.participantCount === 2,
      `the room counts the two who are in it (got ${summary.participantCount})`,
    );

    ghost.destroy();
    ana.close();
    bia.close();
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
