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
  cameraSlotsFor,
  enqueueSignal,
  normalizeChatText,
  type IceServerConfig,
  type PeerInfo,
  type ScreenQuality,
  type ServerMessage,
} from '../../server/src/domain/room.js';
import {
  NO_COMPANY,
  countable,
  withPeerCount,
  type RoomCompany,
} from '../../server/src/domain/room-stats.js';
import { computeScreenTree } from '../../server/src/domain/screen-tree.js';
import {
  canControlTool,
  clearToolState,
  projectTool,
  projectTools,
  setToolState,
  type ToolStates,
} from '../../server/src/domain/tools.js';
import {
  EMPTY_DESKTOP_CATALOG,
  desktopDownloadUrl,
  findDesktopBuild,
  type DesktopCatalog,
} from '../../server/src/domain/downloads.js';
import { roomPreviewHtml } from '../../server/src/domain/preview.js';
import { SOURCE_LIMITS } from '../../server/src/domain/sources.js';
import { parseClientMessage } from '../../server/src/app/signaling.js';
import { lookupSource } from '../../server/src/app/source-lookup.js';
import { TurnCredentialProvider } from '../../server/src/app/turn.js';
import { fetchDesktopCatalog } from '../../server/src/app/desktop-catalog.js';

export interface Env {
  ROOMS: DurableObjectNamespace;
  /** The one global counter (see StatsDurableObject) — a single instance. */
  STATS: DurableObjectNamespace;
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
  /** Directed parents this receiver persistently sees as a poor media path. */
  poorLinks?: string[];
  /** Last ping — the basis for kicking zombie connections (see alarm). */
  lastSeen: number;
  /** Secret that lets a dropped connection reclaim this seat (same peerId). */
  resumeToken: string;
  /**
   * Set right before a server-side close: suppresses the resume grace,
   * and takes the socket out of the room's head count for good (`live`)
   * — a close that is ordered is not a close that has happened.
   */
  left?: boolean;
}

/**
 * A seat in the room, keyed by its resume token.
 *
 * Written from the moment of the join and not only when a socket drops,
 * because a Durable Object restarted under the room — a deploy, an
 * eviction — comes back with no sockets and no memory of who was in it.
 * What it does come back with is storage: these seats, and so the tokens
 * that reclaim them. Without them a new version of the Worker refused
 * every resume, and every browser in every room was thrown out of a call
 * that was still going on without us.
 */
interface Seat {
  peerId: string;
  name: string;
  resumeToken: string;
  /** Link verdicts survive hibernation and a signaling resume. */
  poorLinks?: string[];
  /** Last ping this side saw: the seat expires on the zombie clock. */
  lastSeen: number;
  /** When its socket dropped; absent while somebody is sitting in it. */
  disconnectedAt?: number;
}
type Seats = Record<string, Seat>;

/** A seat whose socket is gone, held for a resume — mirror of the Node core's detached Peer. */
type DetachedPeer = Seat & { disconnectedAt: number };
type DetachedPeers = Record<string, DetachedPeer>;

/**
 * Signals held for a detached seat live under their own key, one per
 * peer: a queue is bounded at 96 KiB (ROOM_LIMITS.detachedSignalMaxBytes)
 * and a storage value at 128 KiB, so several queues cannot share the
 * `detached` record.
 */
function pendingKey(peerId: string): string {
  return `pending:${peerId}`;
}

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

/** One live screen share; storage key 'screens' holds them in start order. */
type ScreenShare = { id: string; streamId: string; quality: ScreenQuality };
type Screens = ScreenShare[];
/** Screen-tree relays per screen: sharer peerId → (relay peerId → forwarding streamId). */
type ScreenRelays = Record<string, Record<string, string>>;
/** Peers holding a camera slot — storage, so it survives hibernation. */
type Cameras = string[];
/** Peers with their speakers off (`deafen`) — same storage discipline. */
type Deafened = string[];
/** Peers with their microphone off (`mute`) — same storage discipline. */
type Muted = string[];
/**
 * What each tool on the shelf has going — storage key 'tools', absent
 * until the first one is turned on (server/src/domain/tools.ts). The
 * states are opaque here as everywhere on this side of the wire.
 */
type Tools = ToolStates;

/**
 * Name of the one instance of StatsDurableObject. A single object holds the
 * whole counter: a room writes to it once in its life, so there is nothing
 * here to shard.
 */
const STATS_SINGLETON = 'global';

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
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
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
  /** Kept for the room's one report to the global counter (settleCompany). */
  private readonly env: Env;
  /** This instance has looked at the seats it woke up holding (adoptOrphanSeats). */
  private adopted = false;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    await this.adoptOrphanSeats();
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/create':
        return this.create(request);
      case '/summary':
        return this.summary();
      case '/rename':
        return this.rename(request);
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
      participantCount: this.live().length + Object.keys(detached).length,
    });
  }

  /** Mirror of RoomRegistry.renameRoom: the outer Worker validates the body. */
  private async rename(request: Request): Promise<Response> {
    const meta = await this.ctx.storage.get<RoomMeta>('meta');
    if (!meta) {
      return Response.json({ error: 'room_not_found' }, { status: 404 });
    }
    const { displayName } = (await request.json()) as { displayName: string };
    const renamed = { slug: meta.slug, displayName: displayName.trim() } satisfies RoomMeta;
    await this.ctx.storage.put('meta', renamed);
    const detached = await this.detachedPeers();
    return Response.json({
      ...renamed,
      participantCount: this.live().length + Object.keys(detached).length,
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
    const peers = this.live();
    const detached = await this.detachedPeers();
    // Detached peers still hold seats: a full room stays full during a grace.
    const taken = peers.length + Object.keys(detached).length;
    const rejection: 'room_not_found' | 'room_full' | null = !meta
      ? 'room_not_found'
      : taken >= ROOM_LIMITS.maxParticipants
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
      poorLinks: [],
      lastSeen: Date.now(),
      resumeToken,
    } satisfies PeerAttachment);
    // The seat goes to storage now, not when the socket drops: what a
    // restarted object knows about this room is what is written down.
    const seats = await this.seats();
    seats[resumeToken] = { peerId, name, resumeToken, poorLinks: [], lastSeen: Date.now() };
    await this.putSeats(seats);
    // With people inside, the expiration clock stops and the zombie sweep
    // begins — without postponing one already due: a seat that just
    // dropped set the alarm for its screen lock's grace, and a join must
    // not push that back (it did: every join or resume delayed the
    // release by a sweep interval, so a sharer who dropped and came
    // straight back found the room unable to share for 17 s or more).
    await this.ctx.storage.delete('emptyAt');
    await this.ensureAlarmWithin(SWEEP_INTERVAL_MS);
    // Someone arrived: this may be the second person, and the room's clock.
    await this.settleCompany();

    const screens = await this.screens();
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
      screens: screens.map(({ id, streamId }) => ({ id, streamId })),
      cameras: await this.cameras(),
      deafened: await this.deafened(),
      muted: await this.muted(),
      // Late to the film: each tool's state goes out with its age, so a
      // newcomer catches up on a video already playing without asking.
      tools: projectTools(await this.tools(), Date.now()),
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
    const seats = await this.seats();
    const seat = seats[token] ?? null;
    // A seat with a socket still on it is the half-dead case: this side
    // never saw that socket close, and the resume replaces it.
    const stale = seat
      ? (this.live().find((ws) => this.attachment(ws).resumeToken === token) ?? null)
      : null;
    const record = seat && !stale ? seat : null;

    if (!meta || !seat) {
      // Unknown token: the seat was already swept. The client starts over.
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: 'resume_invalid' } satisfies ServerMessage));
      server.close();
      return new Response(null, { status: 101, webSocket: client });
    }

    const identity = seat;
    // Signals that arrived during the absence: delivered after `welcome`,
    // in order, then forgotten (the key is read before the seat is marked
    // taken again, and cleared whether or not anything was held).
    const pendingKeyOf = pendingKey(identity.peerId);
    const pending = record
      ? ((await this.ctx.storage.get<ServerMessage[]>(pendingKeyOf)) ?? [])
      : [];
    // Somebody is sitting here again: the seat stops counting down.
    delete seat.disconnectedAt;
    seat.lastSeen = Date.now();
    await this.putSeats(seats);
    if (record) {
      await this.ctx.storage.delete(pendingKeyOf);
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      peerId: identity.peerId,
      name: identity.name,
      poorLinks: identity.poorLinks ?? [],
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
    await this.ensureAlarmWithin(SWEEP_INTERVAL_MS);

    const screens = await this.screens();
    const others = this.live([server]);
    // Seats still held for a resume — ours is no longer one of them.
    const detached = Object.values(seats).filter((held) => held.disconnectedAt !== undefined);
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
        ...detached.map((held) => ({ id: held.peerId, name: held.name })),
      ],
      screens: screens.map(({ id, streamId }) => ({ id, streamId })),
      cameras: await this.cameras(),
      deafened: await this.deafened(),
      muted: await this.muted(),
      // Late to the film: each tool's state goes out with its age, so a
      // newcomer catches up on a video already playing without asking.
      tools: projectTools(await this.tools(), Date.now()),
    });
    for (const held of pending) {
      this.send(server, held);
    }
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
    // Told to go, and talking anyway: the close was ordered and never
    // landed (see `live`). Its seat is vacated and the room has stopped
    // counting it, so answering would make it a guest only this side can
    // see. Shut it again instead — the client's resume path knows what
    // to do with a seat that is gone: come back to the door as somebody new.
    if (attachment.left) {
      try {
        ws.close(1001, 'no sign of life');
      } catch {
        // the socket is already gone
      }
      return;
    }
    const { peerId, name } = attachment;

    switch (message.t) {
      case 'ping': {
        // Proof of life + latency measure: the client times the echo.
        ws.serializeAttachment({ ...attachment, lastSeen: Date.now() } satisfies PeerAttachment);
        this.send(ws, { t: 'pong', ts: message.ts });
        return;
      }
      case 'signal': {
        const envelope = { t: 'signal', from: peerId, data: message.data } as const;
        const target = this.live().find((peer) => this.attachment(peer).peerId === message.to);
        if (target) {
          this.send(target, envelope);
          return;
        }
        // Transport down, seat kept: hold the signal for the resume instead
        // of dropping it (enqueueSignal) — mirror of the Node edge.
        const detached = await this.detachedPeers();
        const seat = Object.values(detached).find((held) => held.peerId === message.to);
        if (seat) {
          const key = pendingKey(seat.peerId);
          const queue = (await this.ctx.storage.get<ServerMessage[]>(key)) ?? [];
          await this.ctx.storage.put(key, enqueueSignal(queue, envelope));
        }
        return;
      }
      case 'peer-link': {
        if (message.peerId === peerId) {
          return;
        }
        const seats = await this.seats();
        if (!Object.values(seats).some((seat) => seat.peerId === message.peerId)) {
          return;
        }
        const poorLinks = new Set(attachment.poorLinks ?? []);
        if (poorLinks.has(message.peerId) === message.poor) {
          return;
        }
        if (message.poor) {
          poorLinks.add(message.peerId);
        } else {
          poorLinks.delete(message.peerId);
        }
        const nextPoorLinks = [...poorLinks];
        const ownSeat = seats[attachment.resumeToken];
        if (ownSeat) {
          ownSeat.poorLinks = nextPoorLinks;
          await this.putSeats(seats);
        }
        ws.serializeAttachment({
          ...attachment,
          poorLinks: nextPoorLinks,
        } satisfies PeerAttachment);
        // The browser only reports a hysteretic transition, not every
        // stats sample, so an active tree can be healed immediately.
        await this.broadcastScreenRoutes();
        return;
      }
      case 'chat': {
        const text = normalizeChatText(message.text);
        if (text) {
          this.broadcast({ t: 'chat', from: { id: peerId, name }, text, ts: Date.now() });
        }
        return;
      }
      case 'tool-state': {
        const now = Date.now();
        const states = await this.tools();
        if (!canControlTool(states, message.tool, peerId)) {
          // Mirror of the Node edge: restore an older or modified client
          // to the controller's canonical state.
          const current = projectTool(message.tool, states[message.tool], now);
          if (current) {
            this.send(ws, { t: 'tool-state', ...current });
          }
          return;
        }
        if (message.state === null) {
          await this.putTools(clearToolState(states, message.tool));
          this.broadcast({ t: 'tool-state', tool: message.tool, state: null, by: peerId, age: 0 });
          return;
        }
        const next = setToolState(states, message.tool, { state: message.state, by: peerId, at: now });
        if (!next) {
          // As many tools as the room may carry are already on: only the
          // one that asked hears it, nothing changed for the others.
          this.send(ws, { t: 'tool-denied', tool: message.tool });
          return;
        }
        await this.putTools(next);
        this.broadcast({ t: 'tool-state', ...projectTool(message.tool, next[message.tool], now)! });
        return;
      }
      case 'screen-request': {
        // Product rule enforced on the server: at most maxScreens at once;
        // a holder re-requesting (quality change, resume) never counts.
        const screens = await this.screens();
        const mine = screens.find((share) => share.id === peerId);
        if (!mine && screens.length >= ROOM_LIMITS.maxScreens) {
          this.send(ws, { t: 'screen-denied' });
          return;
        }
        if (mine?.streamId !== message.streamId) {
          // A new stream id restarts this screen's tree of relays.
          const relays = await this.relays();
          delete relays[peerId];
          await this.putRelays(relays);
        }
        const share: ScreenShare = { id: peerId, streamId: message.streamId, quality: message.quality };
        await this.putScreens(
          mine ? screens.map((s) => (s.id === peerId ? share : s)) : [...screens, share],
        );
        this.broadcast({ t: 'screen-started', id: peerId, streamId: message.streamId });
        await this.broadcastScreenRoutes();
        return;
      }
      case 'screen-relay': {
        // Only relays in THAT screen's current tree may announce a
        // forwarding stream — never the sharer itself.
        const screens = await this.screens();
        const sharer = screens.find((share) => share.id === message.of);
        if (!sharer || sharer.id === peerId) {
          return;
        }
        const sockets = this.live();
        const detached = await this.detachedPeers();
        const peerIds = [
          ...sockets.map((peer) => this.attachment(peer).peerId),
          ...Object.values(detached).map((seat) => seat.peerId),
        ];
        const poorLinks = this.poorScreenLinks(sockets);
        for (const seat of Object.values(detached)) {
          poorLinks.set(seat.peerId, new Set(seat.poorLinks ?? []));
        }
        const tree = computeScreenTree(
          sharer.id,
          peerIds,
          undefined,
          poorLinks,
        );
        if ((tree.get(peerId)?.children.length ?? 0) === 0) {
          return;
        }
        const relays = await this.relays();
        relays[sharer.id] = { ...(relays[sharer.id] ?? {}), [peerId]: message.streamId };
        await this.putRelays(relays);
        await this.broadcastScreenRoutes();
        return;
      }
      case 'screen-stop': {
        const screens = await this.screens();
        if (screens.some((share) => share.id === peerId)) {
          await this.putScreens(screens.filter((share) => share.id !== peerId));
          const relays = await this.relays();
          delete relays[peerId];
          await this.putRelays(relays);
          this.broadcast({ t: 'screen-stopped', id: peerId });
        }
        return;
      }
      case 'camera-request': {
        // Product rule enforced on the server, like the screen lock: live
        // cameras are capped by room size. Only NEW activations count —
        // a camera granted before the room grew keeps its slot
        // (grandfathering). Detached seats still count as participants.
        const cameras = await this.cameras();
        const detached = await this.detachedPeers();
        const seats = this.live().length + Object.keys(detached).length;
        if (!cameras.includes(peerId) && cameras.length >= cameraSlotsFor(seats)) {
          this.send(ws, { t: 'camera-denied' });
          return;
        }
        // A re-request by a holder (e.g. after a resume) is re-granted.
        if (!cameras.includes(peerId)) {
          await this.putCameras([...cameras, peerId]);
        }
        this.broadcast({ t: 'camera-started', id: peerId });
        return;
      }
      case 'camera-stop': {
        const cameras = await this.cameras();
        if (cameras.includes(peerId)) {
          await this.putCameras(cameras.filter((id) => id !== peerId));
          this.broadcast({ t: 'camera-stopped', id: peerId });
        }
        return;
      }
      case 'mute': {
        // Same presence rule as deafen (below).
        const muted = await this.muted();
        if (muted.includes(peerId) === message.on) {
          return;
        }
        await this.putMuted(message.on ? [...muted, peerId] : muted.filter((id) => id !== peerId));
        this.broadcast({ t: 'peer-muted', id: peerId, on: message.on });
        return;
      }
      case 'deafen': {
        // Presence, not a resource: no cap, no grant, and it survives a
        // resume (the client re-sends on welcome anyway). Repeats are quiet.
        const deafened = await this.deafened();
        const was = deafened.includes(peerId);
        if (was === message.on) {
          return;
        }
        await this.putDeafened(
          message.on ? [...deafened, peerId] : deafened.filter((id) => id !== peerId),
        );
        this.broadcast({ t: 'peer-deafened', id: peerId, on: message.on });
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
    const replaced = this.live([ws]).some(
      (peer) => this.attachment(peer).peerId === attachment.peerId,
    );
    if (replaced) {
      return;
    }
    const seats = await this.seats();
    seats[attachment.resumeToken] = {
      peerId: attachment.peerId,
      name: attachment.name,
      resumeToken: attachment.resumeToken,
      poorLinks: attachment.poorLinks ?? [],
      lastSeen: attachment.lastSeen,
      disconnectedAt: Date.now(),
    };
    await this.putSeats(seats);
    // The camera slot gets no grace, unlike the screen lock: a slot held
    // through an outage blocks someone else's camera for nothing, while
    // the resumer only pays a re-request (its welcome roster says the
    // slot is gone). If that re-request is denied, the client turns the
    // camera off then.
    const cameras = await this.cameras();
    if (cameras.includes(attachment.peerId)) {
      await this.putCameras(cameras.filter((id) => id !== attachment.peerId));
      this.broadcast({ t: 'camera-stopped', id: attachment.peerId });
    }
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
    await this.adoptOrphanSeats();
    const now = Date.now();
    const detached = await this.detachedPeers();

    // The screen lock's grace is shorter than the seat's: a sharer that
    // dropped and did not resume in time frees its screen first.
    const screens = await this.screens();
    const abandoned = screens.filter((share) => {
      const holder = Object.values(detached).find((seat) => seat.peerId === share.id);
      return holder !== undefined && now - holder.disconnectedAt >= ROOM_LIMITS.screenLockGraceMs;
    });
    if (abandoned.length > 0) {
      await this.putScreens(screens.filter((share) => !abandoned.includes(share)));
      const relays = await this.relays();
      for (const share of abandoned) {
        delete relays[share.id];
      }
      await this.putRelays(relays);
      for (const share of abandoned) {
        this.broadcast({ t: 'screen-stopped', id: share.id });
      }
    }

    // Detached seats expire on the zombie clock: no ping past the timeout.
    const expired = Object.values(detached).filter(
      (seat) => now - seat.lastSeen > ROOM_LIMITS.peerTimeoutMs,
    );
    if (expired.length > 0) {
      const relays = await this.relays();
      const seats = await this.seats();
      for (const seat of expired) {
        delete seats[seat.resumeToken];
        this.forgetRelay(relays, seat.peerId);
      }
      await this.putSeats(seats);
      // Nobody is coming back for these signals.
      await this.ctx.storage.delete(expired.map((seat) => pendingKey(seat.peerId)));
      await this.putRelays(relays);
      for (const seat of expired) {
        this.broadcast({ t: 'peer-left', id: seat.peerId });
      }
      await this.forgetPoorLinks(new Set(expired.map((seat) => seat.peerId)));
      await this.broadcastScreenRoutes();
    }

    const zombies = this.live().filter(
      (ws) => now - this.attachment(ws).lastSeen > ROOM_LIMITS.peerTimeoutMs,
    );

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

    // The twenty minutes are far longer than this cadence, so the crossing
    // is noticed here — no alarm of its own, nothing else postponed.
    await this.settleCompany();
    await this.rescheduleSweep([]);
  }

  /** One or more peers leaving: tells the rest and re-evaluates the room's end. */
  private async leave(leaving: WebSocket[]): Promise<void> {
    // Their close events must not resurrect them as detached seats.
    for (const ws of leaving) {
      this.markLeft(ws);
    }
    // And the seats themselves go: a token nobody may come back with is
    // an empty chair the room would otherwise keep counting as a person.
    const seats = await this.seats();
    let vacated = false;
    for (const ws of leaving) {
      const token = this.attachment(ws).resumeToken;
      if (seats[token]) {
        delete seats[token];
        vacated = true;
      }
    }
    if (vacated) {
      await this.putSeats(seats);
    }
    const gone = new Set(leaving.map((ws) => this.attachment(ws).peerId));
    const screens = await this.screens();
    // A leaver's screen is released even on a dropped connection; in every
    // other tree it was at most a relay.
    if (screens.length > 0) {
      const stopped = screens.filter((share) => gone.has(share.id));
      await this.putScreens(screens.filter((share) => !gone.has(share.id)));
      const relays = await this.relays();
      for (const peerId of gone) {
        this.forgetRelay(relays, peerId);
      }
      await this.putRelays(relays);
      for (const share of stopped) {
        this.broadcast({ t: 'screen-stopped', id: share.id }, undefined, leaving);
      }
    }
    // Camera slots free with the seat; `peer-left` prunes the clients' rosters.
    const cameras = await this.cameras();
    if (cameras.some((id) => gone.has(id))) {
      await this.putCameras(cameras.filter((id) => !gone.has(id)));
    }
    const deafened = await this.deafened();
    if (deafened.some((id) => gone.has(id))) {
      await this.putDeafened(deafened.filter((id) => !gone.has(id)));
    }
    const muted = await this.muted();
    if (muted.some((id) => gone.has(id))) {
      await this.putMuted(muted.filter((id) => !gone.has(id)));
    }
    for (const peerId of gone) {
      this.broadcast({ t: 'peer-left', id: peerId }, undefined, leaving);
    }
    await this.forgetPoorLinks(gone);
    await this.broadcastScreenRoutes(leaving);
    await this.settleCompany(leaving);
    await this.rescheduleSweep(leaving);
  }

  /**
   * (Re)distributes the screen-forwarding tree roles — mirror of the Node
   * server's logic (broadcastScreenRoutes in app/signaling.ts).
   */
  private async broadcastScreenRoutes(excluded: WebSocket[] = []): Promise<void> {
    const screens = await this.screens();
    if (screens.length === 0) {
      return;
    }
    const sockets = this.live(excluded);
    const relays = await this.relays();
    // Detached seats stay in the tree: their P2P legs may still be flowing,
    // and yanking them would reroute everyone below for a blip that resumes.
    const detached = await this.detachedPeers();
    const peerIds = [
      ...sockets.map((ws) => this.attachment(ws).peerId),
      ...Object.values(detached).map((seat) => seat.peerId),
    ];
    const poorLinks = this.poorScreenLinks(sockets);
    for (const seat of Object.values(detached)) {
      poorLinks.set(seat.peerId, new Set(seat.poorLinks ?? []));
    }
    // One tree per screen: a peer may be a child in one and a relay in another.
    for (const screen of screens) {
      const tree = computeScreenTree(screen.id, peerIds, undefined, poorLinks);
      const forwarding = relays[screen.id] ?? {};
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
              : forwarding[route.parentId]
                ? { id: route.parentId, streamId: forwarding[route.parentId]! }
                : null;
        this.send(ws, {
          t: 'screen-route',
          of: screen.id,
          children: route.children,
          source,
          quality: screen.quality,
        });
      }
    }
  }

  /**
   * Folds the room's head count into its company clock, and reports the
   * room to the global counter the first time it is due.
   *
   * Called where the head count changes and on every sweep. It never
   * schedules anything: the mark is twenty minutes away and the sweep runs
   * every seventeen seconds while anyone is here, so the crossing is found
   * by an alarm that was already coming — moving that alarm to serve a
   * counter would delay a screen lock's release for a number on a page.
   */
  private async settleCompany(excluded: WebSocket[] = []): Promise<void> {
    const before = (await this.ctx.storage.get<RoomCompany>('company')) ?? NO_COMPANY;
    if (before.counted) {
      return;
    }
    const now = Date.now();
    // Detached seats count as people: their media may still be flowing.
    const detached = Object.keys(await this.detachedPeers()).length;
    const state = withPeerCount(before, this.live(excluded).length + detached, now);
    if (!countable(state, now)) {
      if (state !== before) {
        await this.ctx.storage.put('company', state);
      }
      return;
    }
    // Marked before the report and rolled back if it fails: a room missing
    // from the total is a smaller lie than a room counted twice, and the
    // next sweep tries again.
    await this.ctx.storage.put('company', { ...state, counted: true });
    try {
      const stats = this.env.STATS.get(this.env.STATS.idFromName(STATS_SINGLETON));
      const response = await stats.fetch('https://stats/count', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`stats replied ${response.status}`);
      }
    } catch {
      await this.ctx.storage.put('company', state);
    }
  }

  private async rescheduleSweep(excluded: WebSocket[]): Promise<void> {
    const now = Date.now();
    const detachedCount = Object.keys(await this.detachedPeers()).length;
    // A seat held for a resume still counts as occupancy.
    if (this.live(excluded).length + detachedCount > 0) {
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

  /**
   * The sockets that still count as people in this room.
   *
   * A socket the room has already said goodbye to (`left`) is not one of
   * them, even while the runtime keeps listing it. A connection that
   * vanished without a FIN — wi-fi gone, lid shut — sits in
   * `getWebSockets()` long after its close was ordered, waiting for a
   * close frame nobody is coming back to send; counting it as a person is
   * what made the same guest leave again on every sweep (a farewell chime
   * with no end to it) and put ghosts in the roster the next arrival gets.
   */
  private live(excluded: WebSocket[] = []): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => !excluded.includes(ws) && !this.attachment(ws).left);
  }

  /**
   * A restart is not a goodbye either.
   *
   * An object that comes back — a new version of the Worker, an eviction
   * — finds its seats in storage and its sockets gone. Nobody left: the
   * media is P2P, so the room is still talking to itself while every
   * browser in it knocks on this door. Each seat with no socket on it is
   * marked as dropped NOW (the ping it last answered was told to an
   * object that no longer exists), which buys it the same grace a dropped
   * socket gets and arms the sweep to end the ones nobody comes back for.
   */
  private async adoptOrphanSeats(): Promise<void> {
    if (this.adopted) {
      return;
    }
    this.adopted = true;
    const seats = await this.seats();
    const attached = new Set(this.live().map((ws) => this.attachment(ws).peerId));
    const now = Date.now();
    let orphans = false;
    for (const seat of Object.values(seats)) {
      if (seat.disconnectedAt === undefined && !attached.has(seat.peerId)) {
        seat.disconnectedAt = now;
        seat.lastSeen = now;
        orphans = true;
      }
    }
    if (orphans) {
      await this.putSeats(seats);
      await this.ensureAlarmWithin(SWEEP_INTERVAL_MS);
    }
  }

  private async seats(): Promise<Seats> {
    return (await this.ctx.storage.get<Seats>('seats')) ?? {};
  }

  private async putSeats(seats: Seats): Promise<void> {
    if (Object.keys(seats).length === 0) {
      await this.ctx.storage.delete('seats');
    } else {
      await this.ctx.storage.put('seats', seats);
    }
  }

  /** The seats nobody is sitting in right now, still held for a resume. */
  private async detachedPeers(): Promise<DetachedPeers> {
    const held: DetachedPeers = {};
    for (const [token, seat] of Object.entries(await this.seats())) {
      if (seat.disconnectedAt !== undefined) {
        held[token] = seat as DetachedPeer;
      }
    }
    return held;
  }

  private async cameras(): Promise<Cameras> {
    return (await this.ctx.storage.get<Cameras>('cameras')) ?? [];
  }

  private async putCameras(cameras: Cameras): Promise<void> {
    if (cameras.length === 0) {
      await this.ctx.storage.delete('cameras');
    } else {
      await this.ctx.storage.put('cameras', cameras);
    }
  }

  private async deafened(): Promise<Deafened> {
    return (await this.ctx.storage.get<Deafened>('deafened')) ?? [];
  }

  private async putDeafened(deafened: Deafened): Promise<void> {
    if (deafened.length === 0) {
      await this.ctx.storage.delete('deafened');
    } else {
      await this.ctx.storage.put('deafened', deafened);
    }
  }

  private async screens(): Promise<Screens> {
    return (await this.ctx.storage.get<Screens>('screens')) ?? [];
  }

  private async putScreens(screens: Screens): Promise<void> {
    if (screens.length === 0) {
      await this.ctx.storage.delete('screens');
    } else {
      await this.ctx.storage.put('screens', screens);
    }
  }

  private async relays(): Promise<ScreenRelays> {
    return (await this.ctx.storage.get<ScreenRelays>('screenRelays')) ?? {};
  }

  private async putRelays(relays: ScreenRelays): Promise<void> {
    if (Object.keys(relays).length === 0) {
      await this.ctx.storage.delete('screenRelays');
    } else {
      await this.ctx.storage.put('screenRelays', relays);
    }
  }

  /** A peer is gone from every tree: its own screen's relays and its relay seat elsewhere. */
  private forgetRelay(relays: ScreenRelays, peerId: string): void {
    delete relays[peerId];
    for (const sharerId of Object.keys(relays)) {
      delete relays[sharerId]![peerId];
    }
  }

  private async tools(): Promise<Tools> {
    return (await this.ctx.storage.get<Tools>('tools')) ?? {};
  }
  private async putTools(tools: Tools): Promise<void> {
    if (Object.keys(tools).length === 0) {
      await this.ctx.storage.delete('tools');
    } else {
      await this.ctx.storage.put('tools', tools);
    }
  }

  private async muted(): Promise<Muted> {
    return (await this.ctx.storage.get<Muted>('muted')) ?? [];
  }

  private async putMuted(muted: Muted): Promise<void> {
    if (muted.length === 0) {
      await this.ctx.storage.delete('muted');
    } else {
      await this.ctx.storage.put('muted', muted);
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

  private poorScreenLinks(sockets: WebSocket[]): Map<string, ReadonlySet<string>> {
    return new Map(
      sockets.map((ws) => {
        const attachment = this.attachment(ws);
        return [attachment.peerId, new Set(attachment.poorLinks ?? [])] as const;
      }),
    );
  }

  /** A departed id must not occupy every surviving attachment forever. */
  private async forgetPoorLinks(gone: ReadonlySet<string>): Promise<void> {
    const attachmentUpdates = this.live().flatMap((ws) => {
      const attachment = this.attachment(ws);
      const poorLinks = (attachment.poorLinks ?? []).filter((id) => !gone.has(id));
      return poorLinks.length === (attachment.poorLinks ?? []).length
        ? []
        : [{ ws, attachment, poorLinks }];
    });
    const seats = await this.seats();
    let changed = false;
    for (const seat of Object.values(seats)) {
      const poorLinks = (seat.poorLinks ?? []).filter((id) => !gone.has(id));
      if (poorLinks.length !== (seat.poorLinks ?? []).length) {
        seat.poorLinks = poorLinks;
        changed = true;
      }
    }
    if (changed) {
      await this.putSeats(seats);
    }
    for (const { ws, attachment, poorLinks } of attachmentUpdates) {
      ws.serializeAttachment({ ...attachment, poorLinks } satisfies PeerAttachment);
    }
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
    for (const ws of this.live(excluded)) {
      if (this.attachment(ws).peerId !== exceptId) {
        this.send(ws, message);
      }
    }
  }
}

/**
 * The whole durable memory this product keeps about rooms: one integer.
 *
 * A room reports itself here once, after twenty minutes with company in it
 * (server/src/domain/room-stats.ts), so this object takes one write per real
 * conversation — small enough that a single instance is the whole story. It
 * stores no slug, no name and no timestamp: a room that ends still leaves
 * nothing behind, and this number cannot be read back into one.
 */
export class StatsDurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const rooms = (await this.ctx.storage.get<number>('rooms')) ?? 0;
    if (new URL(request.url).pathname === '/count') {
      await this.ctx.storage.put('rooms', rooms + 1);
      return Response.json({ rooms: rooms + 1 });
    }
    return Response.json({ rooms });
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

/**
 * The counter, remembered per isolate for a minute.
 *
 * Every home page asks for this number and it lives in a single Durable
 * Object: without a cache in front, a page that goes around would point the
 * whole internet at one object. A minute late is fine for a total that moves
 * a few times an hour.
 */
let statsCache: { rooms: number; until: number } | null = null;
const STATS_TTL_MS = 60_000;

async function countedRooms(env: Env): Promise<number> {
  if (statsCache && Date.now() < statsCache.until) {
    return statsCache.rooms;
  }
  try {
    const stats = env.STATS.get(env.STATS.idFromName(STATS_SINGLETON));
    const response = await stats.fetch('https://stats/value');
    const body = (await response.json()) as { rooms?: unknown };
    const rooms = typeof body.rooms === 'number' ? body.rooms : 0;
    statsCache = { rooms, until: Date.now() + STATS_TTL_MS };
    return rooms;
  } catch {
    // The home page is not worth a 500: last known number, or none yet.
    return statsCache?.rooms ?? 0;
  }
}

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

  if (url.pathname === '/api/stats' && request.method === 'GET') {
    // An aggregate and nothing else — no slug, no name, no timestamp.
    return new Response(JSON.stringify({ rooms: await countedRooms(env) }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
        ...corsHeaders(env),
      },
    });
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

  /**
   * What is playable in a page somebody pasted, for the video tool
   * (server/src/app/source-lookup.ts) — same route, same answers as the
   * Node edge.
   *
   * The only place this server opens a stranger's URL. It reads markup
   * and never a media byte: the video is fetched by each browser from
   * wherever it lives, as the YouTube tool has always done. Nothing is
   * kept — no cache, no log (hence the body rather than the query
   * string), and `no-store` on the way out, because what somebody is
   * about to watch is not ours to hold or to leave in a proxy. Rate limited like room creation: every call is an outbound
   * request made in our name.
   */
  if (url.pathname === '/api/sources' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: `sources:${ip}` });
    if (!success) {
      return json({ error: 'rate_limited' }, 429, env);
    }
    // In the body, never the query string: Cloudflare's request log — and
    // `wrangler tail`, and any Logpush — records a URL with its query, so
    // a GET would have kept the one thing this route promises not to.
    const body = (await request.json().catch(() => ({}))) as { url?: unknown };
    const target = typeof body.url === 'string' ? body.url : '';
    if (!target || target.length > SOURCE_LIMITS.maxUrlLength) {
      return json({ error: 'invalid_url' }, 400, env);
    }
    const result = await lookupSource(target);
    if (!result.ok) {
      return json({ error: result.reason }, result.reason === 'invalid_url' ? 400 : 502, env);
    }
    return new Response(JSON.stringify(result.lookup), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
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

  if (summary && request.method === 'PATCH') {
    const slug = decodeURIComponent(summary[1]);
    if (slug.length > 64) {
      return json({ error: 'invalid_slug' }, 400, env);
    }
    const body = (await request.json().catch(() => ({}))) as { displayName?: unknown };
    if (
      typeof body.displayName !== 'string' ||
      body.displayName.length > ROOM_LIMITS.displayNameMaxLength
    ) {
      return json({ error: 'invalid_body' }, 400, env);
    }
    const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
    const response = await room.fetch('https://room/rename', {
      method: 'POST',
      body: JSON.stringify({ displayName: body.displayName }),
    });
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
      const room = url.pathname.startsWith('/r/');
      // A room answer rewrites the body, so it must not be a 304: ask the
      // assets layer for the page itself, not for a revalidation of the
      // home page the bot may already have cached.
      const index = new Request(new URL('/', url), request);
      if (room) {
        index.headers.delete('if-none-match');
        index.headers.delete('if-modified-since');
      }
      const response = await env.ASSETS.fetch(index);
      if (!room) {
        return response;
      }
      // The room link is the credential: an indexed slug would be a
      // world-readable room. The header reaches crawlers that never run
      // our JS — unlike the meta tag — and does not rely on robots.txt
      // being honored.
      const headers = new Headers(response.headers);
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      // The invite card instead of the front page's. Same reason as the
      // header: the bot that draws the preview never runs RouteMeta.
      const html = roomPreviewHtml(await response.text(), url.origin);
      // The body is no longer the asset the assets layer validated.
      headers.delete('etag');
      headers.delete('content-length');
      return new Response(html, { status: response.status, headers });
    }
    return new Response('not found', { status: 404 });
  },
};
