// Drives the REAL Worker (Durable Object) through the screen-lock drop
// scenarios the Node edge cannot stand in for: alarms, detached seats and
// hibernation-safe storage only exist there. Needs `wrangler dev` running
// (`.claude/launch.json` has a `worker` entry, or: cd worker && npx wrangler
// dev --port 8787). Usage: node worker/screen-drop.mjs [acbd]  (default: all)
//
//   a  the sharer's socket dies: screen-stopped within the lock's grace,
//      and the next sharer is granted
//   c  the sharer drops and rejoins at once (new seat, same name): the
//      first request is denied, the release still lands at the grace —
//      the regression this guards: a join used to postpone the alarm
//   b  the sharer goes silent (zombie): released on the zombie clock
//   d  mute presence: peer-muted broadcast and `muted` in the welcome
//
// Exit code 1 on any failed expectation.
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');

async function createRoom(name) {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: name }),
  });
  if (res.status !== 201) throw new Error(`createRoom ${res.status}`);
  return (await res.json()).slug;
}

class Client {
  constructor(ws, name) {
    this.ws = ws;
    this.name = name;
    this.log = [];
    this.waiters = [];
    this.pinger = null;
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      msg.__at = Date.now();
      this.log.push(msg);
      for (const w of [...this.waiters]) w();
    });
    ws.on('close', () => { this.closed = true; for (const w of [...this.waiters]) w(); });
  }
  static async join(slug, name, { ping = true } = {}) {
    const ws = new WebSocket(`${WS}/ws/rooms/${slug}?name=${encodeURIComponent(name)}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const client = new Client(ws, name);
    client.welcome = await client.expect('welcome');
    if (ping) {
      client.pinger = setInterval(() => { try { ws.send(JSON.stringify({ t: 'ping', ts: Date.now() })); } catch {} }, 10_000);
    }
    return client;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async expect(t, timeoutMs = 8_000, from = 0) {
    const deadline = Date.now() + timeoutMs;
    let cursor = from;
    for (;;) {
      while (cursor < this.log.length) {
        const m = this.log[cursor++];
        if (m.t === t) return m;
      }
      if (this.closed) throw new Error(`${this.name}: closed while waiting for ${t}`);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`${this.name}: timeout waiting for ${t} (saw ${this.log.map((m) => m.t).join(',')})`);
      await new Promise((resolve) => {
        const timer = setTimeout(() => { this.waiters = this.waiters.filter((w) => w !== wake); resolve(); }, remaining);
        const wake = () => { clearTimeout(timer); this.waiters = this.waiters.filter((w) => w !== wake); resolve(); };
        this.waiters.push(wake);
      });
    }
  }
  terminate() { clearInterval(this.pinger); this.ws.terminate(); }
  leave() { clearInterval(this.pinger); try { this.send({ t: 'leave' }); } catch {} this.ws.close(); }
}

const stamp = (t0, at = Date.now()) => `${((at - t0) / 1000).toFixed(1)}s`;
/** The lock's grace (10 s) plus the slack a local alarm may add. */
const GRACE_BUDGET_MS = 12_000;
let failures = 0;
function check(ok, what) {
  if (!ok) {
    failures += 1;
    console.log('  FAIL:', what);
  }
}

async function scenarioAbruptDrop() {
  console.log('\n== A: sharer socket dies abruptly (terminate) ==');
  const slug = await createRoom('drop-a');
  const a = await Client.join(slug, 'ana');
  const b = await Client.join(slug, 'bia');
  const c = await Client.join(slug, 'caio');
  a.send({ t: 'screen-request', streamId: 'sA', quality: 'balanced' });
  const started = await b.expect('screen-started');
  console.log('B saw screen-started from', started.id === a.welcome.selfId ? 'ana' : started.id);
  const t0 = Date.now();
  a.terminate();
  const mark = b.log.length;
  const stopped = await b.expect('screen-stopped', 45_000, mark);
  console.log(`B got screen-stopped after ${stamp(t0, stopped.__at)}`);
  check(stopped.__at - t0 <= GRACE_BUDGET_MS, `release took longer than the grace budget (${GRACE_BUDGET_MS} ms)`);
  const mark2 = b.log.length;
  b.send({ t: 'screen-request', streamId: 'sB', quality: 'balanced' });
  const verdict = await Promise.race([
    b.expect('screen-started', 8_000, mark2).then((m) => `started (${m.id === b.welcome.selfId ? 'bia' : m.id})`),
    b.expect('screen-denied', 8_000, mark2).then(() => 'DENIED'),
  ]);
  console.log('B share after the drop ->', verdict);
  check(verdict.startsWith('started'), 'the next sharer was not granted');
  b.leave(); c.leave();
}

async function scenarioQuickRejoin() {
  console.log('\n== C: sharer drops and rejoins at once with the same name, tries to share ==');
  const slug = await createRoom('drop-c');
  const a = await Client.join(slug, 'ana');
  const b = await Client.join(slug, 'bia');
  a.send({ t: 'screen-request', streamId: 'sA', quality: 'balanced' });
  await b.expect('screen-started');
  const t0 = Date.now();
  a.terminate();
  const a2 = await Client.join(slug, 'ana');
  console.log(`ana rejoined at ${stamp(t0)}; welcome.screen =`, a2.welcome.screen, 'peers =', a2.welcome.peers.map((p) => p.name).join(','));
  let mark = a2.log.length;
  a2.send({ t: 'screen-request', streamId: 'sA2', quality: 'balanced' });
  let verdict = await Promise.race([
    a2.expect('screen-started', 5_000, mark).then(() => 'started'),
    a2.expect('screen-denied', 5_000, mark).then(() => 'denied'),
  ]);
  console.log(`first request at ${stamp(t0)} ->`, verdict);
  if (verdict === 'denied') {
    mark = a2.log.length;
    const stopped = await a2.expect('screen-stopped', 45_000, 0);
    console.log(`screen-stopped reached the rejoined ana at ${stamp(t0, stopped.__at)}`);
    check(stopped.__at - t0 <= GRACE_BUDGET_MS, `a rejoin postponed the release past the grace budget (${GRACE_BUDGET_MS} ms)`);
    mark = a2.log.length;
    a2.send({ t: 'screen-request', streamId: 'sA3', quality: 'balanced' });
    verdict = await Promise.race([
      a2.expect('screen-started', 5_000, mark).then(() => 'started'),
      a2.expect('screen-denied', 5_000, mark).then(() => 'DENIED'),
    ]);
    console.log(`second request at ${stamp(t0)} ->`, verdict);
    check(verdict === 'started', 'the rejoined sharer was not granted after the release');
  }
  const left = await b.expect('peer-left', 60_000, 0).catch(() => null);
  console.log(`B saw peer-left for the old seat at ${left ? stamp(t0, left.__at) : 'never'}`);
  a2.leave(); b.leave();
}

async function scenarioZombie() {
  console.log('\n== B: sharer goes silent (no pings, socket open) ==');
  const slug = await createRoom('drop-b');
  const a = await Client.join(slug, 'ana', { ping: false });
  const b = await Client.join(slug, 'bia');
  a.send({ t: 'screen-request', streamId: 'sA', quality: 'balanced' });
  await b.expect('screen-started');
  const t0 = Date.now();
  const mark = b.log.length;
  const stoppedZ = await b.expect('screen-stopped', 70_000, mark);
  console.log(`B got screen-stopped after ${stamp(t0, stoppedZ.__at)} (zombie sweep)`);
  const mark2 = b.log.length;
  b.send({ t: 'screen-request', streamId: 'sB', quality: 'balanced' });
  const verdict = await Promise.race([
    b.expect('screen-started', 8_000, mark2).then(() => 'started'),
    b.expect('screen-denied', 8_000, mark2).then(() => 'DENIED'),
  ]);
  console.log('B share after the zombie sweep ->', verdict);
  check(verdict === 'started', 'the next sharer was not granted after the zombie sweep');
  b.leave(); try { a.ws.terminate(); } catch {}
}

async function scenarioMutePresence() {
  console.log('\n== D: mute presence on the worker ==');
  const slug = await createRoom('mute');
  const a = await Client.join(slug, 'ana');
  const b = await Client.join(slug, 'bia');
  a.send({ t: 'mute', on: true });
  const m = await b.expect('peer-muted');
  console.log('B saw peer-muted', m.on, 'for ana:', m.id === a.welcome.selfId);
  const c = await Client.join(slug, 'caio');
  console.log('late joiner welcome.muted has ana:', c.welcome.muted?.includes(a.welcome.selfId), 'deafened:', c.welcome.deafened);
  check(m.on === true && m.id === a.welcome.selfId, 'peer-muted did not name the muted peer');
  check(c.welcome.muted?.includes(a.welcome.selfId) === true, 'welcome.muted misses the muted peer');
  a.leave(); b.leave(); c.leave();
}

const only = process.argv[2];
const scenarios = { a: scenarioAbruptDrop, c: scenarioQuickRejoin, b: scenarioZombie, d: scenarioMutePresence };
for (const [key, fn] of Object.entries(scenarios)) {
  if (!only || only.includes(key)) {
    try { await fn(); } catch (error) { failures += 1; console.log('FAILED:', error.message); }
  }
}
console.log(failures === 0 ? '\nall worker checks passed' : `\n${failures} worker check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
