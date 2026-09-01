/**
 * Cloudflare edge of the room server.
 *
 * Same HTTP API and same WS protocol as the Node server (server/src) — only
 * the transport and where state lives change: instead of one Map per
 * process, one Durable Object per slug. This is step 3 of the scaling path
 * described in docs/architecture.md (per-room sharding), with no UI change.
 */
import {
  ROOM_LIMITS,
  normalizeChatText,
  type IceServerConfig,
  type PeerInfo,
  type ScreenQuality,
  type ServerMessage,
} from '../../server/src/domain/room.js';
import { computeScreenTree } from '../../server/src/domain/screen-tree.js';
import {
  EMPTY_DESKTOP_CATALOG,
  desktopDownloadUrl,
  findDesktopBuild,
  type DesktopCatalog,
} from '../../server/src/domain/downloads.js';
import { parseClientMessage } from '../../server/src/app/signaling.js';
import { TurnCredentialProvider } from '../../server/src/app/turn.js';
import { fetchDesktopCatalog } from '../../server/src/app/desktop-catalog.js';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** Origin allowed by CORS (e.g. https://app.example.com). */
  CORS_ORIGIN?: string;
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /**
   * Cloudflare Realtime TURN credentials (secrets, set via `wrangler secret`).
   * Both unset is the credential-free default: joins get STUN only.
   */
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
}

/** Each WebSocket's attachment: survives Durable Object hibernation. */
interface PeerAttachment {
  peerId: string;
  name: string;
  /** Last ping — the basis for kicking zombie connections (see alarm). */
  lastSeen: number;
  /** Secret that lets a dropped connection reclaim this seat (same peerId). */
  resumeToken: string;
  /** Set right before a server-side close: suppresses the resume grace. */
  left?: boolean;
}

/**
 * A seat kept for a resume after its socket dropped — mirror of the Node
 * core's detached Peer. Lives in storage (keyed by resume token) because a
 * hibernated DO only remembers live sockets.
 */
interface DetachedPeer {
  peerId: string;
  name: string;
  resumeToken: string;
  /** Last ping before the drop: the seat expires on the zombie clock. */
  lastSeen: number;
  disconnectedAt: number;
}
type DetachedPeers = Record<string, DetachedPeer>;

/** ICE servers resolved by the outer Worker travel on an internal header. */
const ICE_HEADER = 'X-Ice-Servers';

function readIceServers(request: Request): IceServerConfig[] {
  try {
    const raw = request.headers.get(ICE_HEADER);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as IceServerConfig[]) : [];
  } catch {
    return [];
  }
}

interface RoomMeta {
  slug: string;
  displayName: string;
}

type ScreenLock = { id: string; streamId: string; quality: ScreenQuality } | null;
/** Screen-tree relays: relay peerId → forwarding streamId. */
type ScreenRelays = Record<string, string>;

/** Zombie-sweep cadence while the room has people in it. */
const SWEEP_INTERVAL_MS = Math.floor(ROOM_LIMITS.peerTimeoutMs / 2);

/** Unguessable id: the link IS the room's discovery credential. */
function randomId(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.CORS_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

/**
 * One live room: owner of the participants, the signaling relay, the chat
 * and the screen lock. Uses WebSocket Hibernation — reconstructible state
 * comes from the sockets' attachments, the rest (metadata, lock, `emptyAt`)
 * from storage.
 */
export class RoomDurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/create':
        return this.create(request);
      case '/summary':
        return this.summary();
      case '/join':
        return this.join(request);
      default:
        return new Response('not found', { status: 404 });
    }
  }

  private async create(request: Request): Promise<Response> {
    const { slug, displayName } = (await request.json()) as RoomMeta;
    await this.ctx.storage.put('meta', { slug, displayName } satisfies RoomMeta);
    // A room is born empty: the expiration clock starts immediately.
    await this.markEmptyFrom(Date.now());
    return Response.json({ slug, displayName, participantCount: 0 });
  }

  private async summary(): Promise<Response> {
    const meta = await this.ctx.storage.get<RoomMeta>('meta');
    if (!meta) {
      return Response.json({ error: 'room_not_found' }, { status: 404 });
    }
    const detached = await this.detachedPeers();
    return Response.json({
      slug: meta.slug,
      displayName: meta.displayName,
      participantCount: this.ctx.getWebSockets().length + Object.keys(detached).length,
    });
  }

  private async join(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const resume = url.searchParams.get('resume');
    const ice = readIceServers(request);
    if (resume) {
      return this.resumeSeat(resume, ice);
    }

    const name = url.searchParams.get('name')!;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const meta = await this.ctx.storage.get<RoomMeta>('meta');
    const peers = this.ctx.getWebSockets();
    const detached = await this.detachedPeers();
    // Detached peers still hold seats: a full room stays full during a grace.
    const seats = peers.length + Object.keys(detached).length;
    const rejection: 'room_not_found' | 'room_full' | null = !meta
      ? 'room_not_found'
      : seats >= ROOM_LIMITS.maxParticipants
        ? 'room_full'
        : null;

    if (rejection) {
      // No useful HTTP status on the other side: the refusal travels in the protocol, as in Node.
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: rejection }));
      server.close();
      return new Response(null, { status: 101, webSocket: client });
    }

    const peerId = randomId(8);
    const resumeToken = randomId(16);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      peerId,
      name,
      lastSeen: Date.now(),
      resumeToken,
    } satisfies PeerAttachment);
    // With people inside, the expiration clock stops and the zombie sweep begins.
    await this.ctx.storage.delete('emptyAt');
    await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);

    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    this.send(server, {
      t: 'welcome',
      selfId: peerId,
      resumeToken,
      ice,
      room: { slug: meta!.slug, displayName: meta!.displayName },
      peers: [
        ...peers.map((ws) => this.peerInfo(ws)),
        ...Object.values(detached).map((seat) => ({ id: seat.peerId, name: seat.name })),
      ],
      screen: screen ? { id: screen.id, streamId: screen.streamId } : null,
    });
    this.broadcast({ t: 'peer-joined', peer: { id: peerId, name } }, peerId);
    // Screen share in progress: the newcomer needs a route, and the tree changes.
    await this.broadcastScreenRoutes();

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * A dropped connection reclaims its seat by resume token — mirror of
   * SignalingSession.resume on the Node edge. Also covers the half-dead
   * case where this side never saw the old socket close: the stale socket
   * is replaced and told to go.
   */
  private async resumeSeat(token: string, ice: IceServerConfig[]): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const meta = await this.ctx.storage.get<RoomMeta>('meta');
    const detached = await this.detachedPeers();
    const record = detached[token] ?? null;
    const stale = record
      ? null
      : (this.ctx.getWebSockets().find((ws) => this.attachment(ws).resumeToken === token) ?? null);

    if (!meta || (!record && !stale)) {
      // Unknown token: the seat was already swept. The client starts over.
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: 'resume_invalid' } satisfies ServerMessage));
      server.close();
      return new Response(null, { status: 101, webSocket: client });
    }

    const identity = record ?? this.attachment(stale!);
    if (record) {
      delete detached[token];
      await this.putDetachedPeers(detached);
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      peerId: identity.peerId,
      name: identity.name,
      lastSeen: Date.now(),
      resumeToken: token,
    } satisfies PeerAttachment);
    if (stale) {
      this.markLeft(stale);
      try {
        stale.close(1000, 'replaced by resume');
      } catch {
        // the socket is already gone
      }
    }
    await this.ctx.storage.delete('emptyAt');
    await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);

    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    const others = this.ctx.getWebSockets().filter((ws) => ws !== server);
    this.send(server, {
      t: 'welcome',
      selfId: identity.peerId,
      resumeToken: token,
      ice,
      room: { slug: meta.slug, displayName: meta.displayName },
      peers: [
        ...others
          .filter((ws) => this.attachment(ws).peerId !== identity.peerId)
          .map((ws) => this.peerInfo(ws)),
        ...Object.values(detached).map((seat) => ({ id: seat.peerId, name: seat.name })),
      ],
      screen: screen ? { id: screen.id, streamId: screen.streamId } : null,
    });
    // The seat was never vacated: no peer-joined. The tree may have changed
    // shape during the absence, so routes are re-emitted.
    await this.broadcastScreenRoutes();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 64 * 1024) {
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      return;
    }
    const attachment = this.attachment(ws);
    const { peerId, name } = attachment;

    switch (message.t) {
      case 'ping': {
        // Proof of life + latency measure: the client times the echo.
        ws.serializeAttachment({ ...attachment, lastSeen: Date.now() } satisfies PeerAttachment);
        this.send(ws, { t: 'pong', ts: message.ts });
        return;
      }
      case 'signal': {
        const target = this.ctx
          .getWebSockets()
          .find((peer) => this.attachment(peer).peerId === message.to);
        if (target) {
          this.send(target, { t: 'signal', from: peerId, data: message.data });
        }
        return;
      }
      case 'chat': {
        const text = normalizeChatText(message.text);
        if (text) {
          this.broadcast({ t: 'chat', from: { id: peerId, name }, text, ts: Date.now() });
        }
        return;
      }
      case 'screen-request': {
        // Product rule enforced on the server: one screen at a time.
        const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
        if (screen && screen.id !== peerId) {
          this.send(ws, { t: 'screen-denied' });
          return;
        }
        // A re-send by the sharer itself = live quality change.
        if (screen?.streamId !== message.streamId) {
          await this.ctx.storage.delete('screenRelays');
        }
        await this.ctx.storage.put('screen', {
          id: peerId,
          streamId: message.streamId,
          quality: message.quality,
        } satisfies NonNullable<ScreenLock>);
        this.broadcast({ t: 'screen-started', id: peerId, streamId: message.streamId });
        await this.broadcastScreenRoutes();
        return;
      }
      case 'screen-relay': {
        // Only relays in the current tree may announce a forwarding stream.
        const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
        if (!screen || screen.id === peerId) {
          return;
        }
        const peerIds = this.ctx.getWebSockets().map((peer) => this.attachment(peer).peerId);
        const tree = computeScreenTree(screen.id, peerIds);
        if ((tree.get(peerId)?.children.length ?? 0) === 0) {
          return;
        }
        const relays = (await this.ctx.storage.get<ScreenRelays>('screenRelays')) ?? {};
        relays[peerId] = message.streamId;
        await this.ctx.storage.put('screenRelays', relays);
        await this.broadcastScreenRoutes();
        return;
      }
      case 'screen-stop': {
        const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
        if (screen?.id === peerId) {
          await this.ctx.storage.delete('screen');
          await this.ctx.storage.delete('screenRelays');
          this.broadcast({ t: 'screen-stopped' });
        }
        return;
      }
      case 'leave': {
        // Deliberate goodbye: vacate the seat now, no resume grace.
        await this.leave([ws]);
        try {
          ws.close(1000, 'left');
        } catch {
          // the socket is already gone
        }
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.detach(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.detach(ws);
  }

  /**
   * Transport dropped without a goodbye: keep the seat for a resume.
   *
   * The media mesh is P2P, so an intact WebRTC path keeps flowing while
   * the signaling reconnects. No `peer-left` goes out here; if no resume
   * arrives, the alarm announces it on the same clock as a zombie.
   */
  private async detach(ws: WebSocket): Promise<void> {
    const attachment = this.attachment(ws);
    // A deliberate leave, or a socket already replaced by a resume, gets no grace.
    if (attachment.left) {
      return;
    }
    const replaced = this.ctx
      .getWebSockets()
      .some((peer) => peer !== ws && this.attachment(peer).peerId === attachment.peerId);
    if (replaced) {
      return;
    }
    const detached = await this.detachedPeers();
    detached[attachment.resumeToken] = {
      peerId: attachment.peerId,
      name: attachment.name,
      resumeToken: attachment.resumeToken,
      lastSeen: attachment.lastSeen,
      disconnectedAt: Date.now(),
    };
    await this.putDetachedPeers(detached);
    // The screen lock's grace is shorter than the sweep cadence: wake up
    // early enough to release an abandoned lock on time.
    await this.ensureAlarmWithin(ROOM_LIMITS.screenLockGraceMs);
  }

  /**
   * Periodic sweep: drops whoever stopped showing signs of life and kills
   * a room that stayed empty past the timeout.
   *
   * Without the zombie part the room never empties — a network drop with
   * no FIN (laptop lid closed, wi-fi vanishing) fires no close event, and
   * the ghost socket would hold the room alive forever.
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    const detached = await this.detachedPeers();

    // The screen lock's grace is shorter than the seat's: a sharer that
    // dropped and did not resume in time frees the room's screen first.
    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    if (screen) {
      const holder = Object.values(detached).find((seat) => seat.peerId === screen.id);
      if (holder && now - holder.disconnectedAt >= ROOM_LIMITS.screenLockGraceMs) {
        await this.ctx.storage.delete('screen');
        await this.ctx.storage.delete('screenRelays');
        this.broadcast({ t: 'screen-stopped' });
      }
    }

    // Detached seats expire on the zombie clock: no ping past the timeout.
    const expired = Object.values(detached).filter(
      (seat) => now - seat.lastSeen > ROOM_LIMITS.peerTimeoutMs,
    );
    if (expired.length > 0) {
      const relays = (await this.ctx.storage.get<ScreenRelays>('screenRelays')) ?? {};
      for (const seat of expired) {
        delete detached[seat.resumeToken];
        delete relays[seat.peerId];
      }
      await this.putDetachedPeers(detached);
      await this.ctx.storage.put('screenRelays', relays);
      for (const seat of expired) {
        this.broadcast({ t: 'peer-left', id: seat.peerId });
      }
      await this.broadcastScreenRoutes();
    }

    const zombies = this.ctx
      .getWebSockets()
      .filter((ws) => now - this.attachment(ws).lastSeen > ROOM_LIMITS.peerTimeoutMs);

    if (zombies.length > 0) {
      await this.leave(zombies);
      for (const ws of zombies) {
        this.markLeft(ws);
        try {
          ws.close(1001, 'no sign of life');
        } catch {
          // the socket is already gone
        }
      }
      return;
    }

    await this.rescheduleSweep([]);
  }

  /** One or more peers leaving: tells the rest and re-evaluates the room's end. */
  private async leave(leaving: WebSocket[]): Promise<void> {
    // Their close events must not resurrect them as detached seats.
    for (const ws of leaving) {
      this.markLeft(ws);
    }
    const gone = new Set(leaving.map((ws) => this.attachment(ws).peerId));
    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    // The screen lock is released even on a dropped connection.
    if (screen && gone.has(screen.id)) {
      await this.ctx.storage.delete('screen');
      await this.ctx.storage.delete('screenRelays');
      this.broadcast({ t: 'screen-stopped' }, undefined, leaving);
    } else if (screen) {
      // A relay or a leaf left: the screen tree changes shape.
      const relays = (await this.ctx.storage.get<ScreenRelays>('screenRelays')) ?? {};
      for (const peerId of gone) {
        delete relays[peerId];
      }
      await this.ctx.storage.put('screenRelays', relays);
    }
    for (const peerId of gone) {
      this.broadcast({ t: 'peer-left', id: peerId }, undefined, leaving);
    }
    await this.broadcastScreenRoutes(leaving);
    await this.rescheduleSweep(leaving);
  }

  /**
   * (Re)distributes the screen-forwarding tree roles — mirror of the Node
   * server's logic (broadcastScreenRoutes in app/signaling.ts).
   */
  private async broadcastScreenRoutes(excluded: WebSocket[] = []): Promise<void> {
    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    if (!screen) {
      return;
    }
    const sockets = this.remaining(excluded);
    const relays = (await this.ctx.storage.get<ScreenRelays>('screenRelays')) ?? {};
    // Detached seats stay in the tree: their P2P legs may still be flowing,
    // and yanking them would reroute everyone below for a blip that resumes.
    const detached = await this.detachedPeers();
    const tree = computeScreenTree(screen.id, [
      ...sockets.map((ws) => this.attachment(ws).peerId),
      ...Object.values(detached).map((seat) => seat.peerId),
    ]);
    for (const ws of sockets) {
      const route = tree.get(this.attachment(ws).peerId);
      if (!route) {
        continue;
      }
      const source =
        route.parentId === null
          ? null
          : route.parentId === screen.id
            ? { id: screen.id, streamId: screen.streamId }
            : relays[route.parentId]
              ? { id: route.parentId, streamId: relays[route.parentId]! }
              : null;
      this.send(ws, { t: 'screen-route', children: route.children, source, quality: screen.quality });
    }
  }

  private async rescheduleSweep(excluded: WebSocket[]): Promise<void> {
    const now = Date.now();
    const detachedCount = Object.keys(await this.detachedPeers()).length;
    // A seat held for a resume still counts as occupancy.
    if (this.remaining(excluded).length + detachedCount > 0) {
      await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
      return;
    }
    const emptyAt = (await this.ctx.storage.get<number>('emptyAt')) ?? now;
    if (now - emptyAt >= ROOM_LIMITS.emptyTimeoutMs) {
      // A room with nobody past the timeout: it ceases to exist.
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.markEmptyFrom(emptyAt);
  }

  private async markEmptyFrom(emptyAt: number): Promise<void> {
    await this.ctx.storage.put('emptyAt', emptyAt);
    await this.ctx.storage.setAlarm(emptyAt + ROOM_LIMITS.emptyTimeoutMs);
  }

  private remaining(excluded: WebSocket[]): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => !excluded.includes(ws));
  }

  private async detachedPeers(): Promise<DetachedPeers> {
    return (await this.ctx.storage.get<DetachedPeers>('detached')) ?? {};
  }

  private async putDetachedPeers(detached: DetachedPeers): Promise<void> {
    if (Object.keys(detached).length === 0) {
      await this.ctx.storage.delete('detached');
    } else {
      await this.ctx.storage.put('detached', detached);
    }
  }

  private markLeft(ws: WebSocket): void {
    try {
      ws.serializeAttachment({ ...this.attachment(ws), left: true } satisfies PeerAttachment);
    } catch {
      // the socket is already gone
    }
  }

  /** Moves the alarm earlier when needed; never postpones an existing one. */
  private async ensureAlarmWithin(delayMs: number): Promise<void> {
    const at = Date.now() + delayMs;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) {
      await this.ctx.storage.setAlarm(at);
    }
  }

  private attachment(ws: WebSocket): PeerAttachment {
    return ws.deserializeAttachment() as PeerAttachment;
  }

  private peerInfo(ws: WebSocket): PeerInfo {
    const { peerId, name } = this.attachment(ws);
    return { id: peerId, name };
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket already closed: the close handler deals with the exit
    }
  }

  private broadcast(message: ServerMessage, exceptId?: string, excluded: WebSocket[] = []): void {
    for (const ws of this.remaining(excluded)) {
      if (this.attachment(ws).peerId !== exceptId) {
        this.send(ws, message);
      }
    }
  }
}

const DOWNLOAD_ROUTE = /^\/download\/([a-z0-9-]+)$/;

/**
 * Desktop app catalog, with two cache tiers in the colo.
 *
 * The warm one (30 min) keeps us under the GitHub API's 60 req/h quota; the
 * cold one (24 h) is only read when the fetch fails — serving yesterday's
 * catalog, whose `latest/download` links are still valid, beats dropping the
 * download button because GitHub blinked.
 */
const CATALOG_FRESH = 'https://desktop-catalog.freecord/fresh';
const CATALOG_STALE = 'https://desktop-catalog.freecord/stale';

async function desktopCatalog(env: Env): Promise<DesktopCatalog> {
  const cache = caches.default;
  const hit = await cache.match(CATALOG_FRESH);
  if (hit) {
    return (await hit.json()) as DesktopCatalog;
  }

  const catalog = await fetchDesktopCatalog();
  if (!catalog) {
    const stale = await cache.match(CATALOG_STALE);
    return stale ? ((await stale.json()) as DesktopCatalog) : EMPTY_DESKTOP_CATALOG;
  }

  const body = JSON.stringify(catalog);
  // "No release yet" is a state that flips the moment a release lands, so it
  // is held for a minute, not half an hour — otherwise the download button
  // would stay missing in this colo long after the binaries existed.
  const ttl = catalog.builds.length > 0 ? 1800 : 60;
  await cache.put(
    CATALOG_FRESH,
    new Response(body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` },
    }),
  );
  if (catalog.builds.length > 0) {
    // Only a catalog with builds is worth falling back to.
    await cache.put(
      CATALOG_STALE,
      new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' } }),
    );
  }
  return catalog;
}

const API_ROOM = /^\/api\/rooms\/([^/]+)$/;
const WS_ROOM = /^\/ws\/rooms\/([^/]+)$/;

/** One credential set per isolate: every room shares the 6h cache. */
let turnProvider: TurnCredentialProvider | null = null;

function turnIceServers(env: Env): Promise<IceServerConfig[]> {
  turnProvider ??= new TurnCredentialProvider(
    env.TURN_KEY_ID && env.TURN_API_TOKEN
      ? { keyId: env.TURN_KEY_ID, apiToken: env.TURN_API_TOKEN }
      : null,
  );
  return turnProvider.iceServers();
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === '/healthz') {
    return json({ status: 'ok' }, 200, env);
  }

  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    // Unauthenticated guests create rooms: rate limiting is the first
    // line of defense against abuse.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: 'rate_limited' }, 429, env);
    }

    let displayName: string | undefined;
    const body = (await request.json().catch(() => ({}))) as { displayName?: unknown };
    if (body.displayName !== undefined) {
      if (
        typeof body.displayName !== 'string' ||
        body.displayName.length > ROOM_LIMITS.displayNameMaxLength
      ) {
        return json({ error: 'invalid_body' }, 400, env);
      }
      displayName = body.displayName;
    }

    const slug = randomId(9);
    const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
    const created = await room.fetch('https://room/create', {
      method: 'POST',
      // Empty default on purpose: the client renders the localized label.
      body: JSON.stringify({ slug, displayName: displayName?.trim() ?? '' }),
    });
    return json(await created.json(), 201, env);
  }

  if (url.pathname === '/api/downloads' && request.method === 'GET') {
    const catalog = await desktopCatalog(env);
    return new Response(JSON.stringify(catalog), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Short browser cache; the heavy lifting is the colo cache above.
        'Cache-Control': 'public, max-age=300',
        ...corsHeaders(env),
      },
    });
  }

  const summary = url.pathname.match(API_ROOM);
  if (summary && request.method === 'GET') {
    const slug = decodeURIComponent(summary[1]);
    if (slug.length > 64) {
      return json({ error: 'invalid_slug' }, 400, env);
    }
    const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
    const response = await room.fetch('https://room/summary');
    return json(await response.json(), response.status, env);
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const ws = url.pathname.match(WS_ROOM);
    if (ws) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const slug = decodeURIComponent(ws[1]);
      const name = url.searchParams.get('name')?.trim() ?? '';
      const resume = url.searchParams.get('resume')?.trim() ?? '';
      const invalid = resume
        ? resume.length > 64
        : !name || name.length > ROOM_LIMITS.guestNameMaxLength;
      if (!slug || slug.length > 64 || invalid) {
        return new Response('invalid request', { status: 400 });
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
      const query = resume
        ? `resume=${encodeURIComponent(resume)}`
        : `name=${encodeURIComponent(name)}`;
      // ICE is resolved out here so every room shares the credential cache.
      const forwarded = new Request(`https://room/join?${query}`, request);
      forwarded.headers.set(ICE_HEADER, JSON.stringify(await turnIceServers(env)));
      return room.fetch(forwarded);
    }

    // Short shareable link: /download/mac-arm64 → the Release asset.
    const download = url.pathname.match(DOWNLOAD_ROUTE);
    if (download && request.method === 'GET') {
      const build = findDesktopBuild(download[1]);
      if (build) {
        return Response.redirect(desktopDownloadUrl(build.file), 302);
      }
    }

    const api = await handleApi(request, env, url);
    if (api) {
      return api;
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404, env);
    }

    // SPA fallback: /r/:slug lands on index.html. HEAD included — preview
    // bots and uptime monitors probe with it, and a 404 there reads as a
    // dead link (the runtime drops the body on its own).
    if (request.method === 'GET' || request.method === 'HEAD') {
      const response = await env.ASSETS.fetch(new Request(new URL('/', url), request));
      // The room link is the credential: an indexed slug would be a
      // world-readable room. The header reaches crawlers that never run
      // our JS — unlike the meta tag — and does not rely on robots.txt
      // being honored.
      if (url.pathname.startsWith('/r/')) {
        const headers = new Headers(response.headers);
        headers.set('X-Robots-Tag', 'noindex, nofollow');
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    }
    return new Response('not found', { status: 404 });
  },
};
