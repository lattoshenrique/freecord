/**
 * Borda Cloudflare do servidor de salas.
 *
 * Mesma API HTTP e mesmo protocolo WS do servidor Node (server/src) — muda só
 * o transporte e onde o estado vive: em vez de um Map por processo, uma
 * Durable Object por slug. É o passo 3 do caminho de escala descrito em
 * docs/architecture.md (sharding por sala), sem mudança na UI.
 */
import { ROOM_LIMITS, type PeerInfo, type ServerMessage } from '../../server/src/domain/room.js';
import { parseClientMessage } from '../../server/src/app/signaling.js';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** Origem permitida no CORS (ex.: https://app.exemplo.com). */
  CORS_ORIGIN?: string;
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/** Anexo de cada WebSocket: sobrevive à hibernação da Durable Object. */
interface PeerAttachment {
  peerId: string;
  name: string;
}

interface RoomMeta {
  slug: string;
  displayName: string;
}

type ScreenLock = { id: string; streamId: string } | null;

/** Id não adivinhável: o link É a credencial de descoberta da sala. */
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
 * Uma sala viva: dona dos participantes, do relay de sinalização, do chat e
 * do lock de tela. Usa WebSocket Hibernation — o estado reconstruível vem dos
 * anexos dos sockets, o resto (metadados, lock) do storage.
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
    // Sala nasce vazia: o relógio de expiração já começa a correr.
    await this.ctx.storage.setAlarm(Date.now() + ROOM_LIMITS.emptyTimeoutMs);
    return Response.json({ slug, displayName, participantCount: 0 });
  }

  private async summary(): Promise<Response> {
    const meta = await this.ctx.storage.get<RoomMeta>('meta');
    if (!meta) {
      return Response.json({ error: 'room_not_found' }, { status: 404 });
    }
    return Response.json({
      slug: meta.slug,
      displayName: meta.displayName,
      participantCount: this.ctx.getWebSockets().length,
    });
  }

  private async join(request: Request): Promise<Response> {
    const name = new URL(request.url).searchParams.get('name')!;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const meta = await this.ctx.storage.get<RoomMeta>('meta');
    const peers = this.ctx.getWebSockets();
    const rejection: 'room_not_found' | 'room_full' | null = !meta
      ? 'room_not_found'
      : peers.length >= ROOM_LIMITS.maxParticipants
        ? 'room_full'
        : null;

    if (rejection) {
      // Sem status HTTP útil do outro lado: a recusa vai no protocolo, como no Node.
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: rejection }));
      server.close();
      return new Response(null, { status: 101, webSocket: client });
    }

    const peerId = randomId(8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peerId, name } satisfies PeerAttachment);
    // Enquanto tem gente, a sala não expira.
    await this.ctx.storage.deleteAlarm();

    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    this.send(server, {
      t: 'welcome',
      selfId: peerId,
      room: { slug: meta!.slug, displayName: meta!.displayName },
      peers: peers.map((ws) => this.peerInfo(ws)),
      screen,
    });
    this.broadcast({ t: 'peer-joined', peer: { id: peerId, name } }, peerId);

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
    const { peerId, name } = this.attachment(ws);

    switch (message.t) {
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
        const text = message.text.trim().slice(0, ROOM_LIMITS.chatMessageMaxLength);
        if (text) {
          this.broadcast({ t: 'chat', from: { id: peerId, name }, text, ts: Date.now() });
        }
        return;
      }
      case 'screen-request': {
        // Regra de produto garantida no servidor: uma tela por vez.
        const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
        if (screen && screen.id !== peerId) {
          this.send(ws, { t: 'screen-denied' });
          return;
        }
        await this.ctx.storage.put('screen', { id: peerId, streamId: message.streamId });
        this.broadcast({ t: 'screen-started', id: peerId, streamId: message.streamId });
        return;
      }
      case 'screen-stop': {
        const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
        if (screen?.id === peerId) {
          await this.ctx.storage.delete('screen');
          this.broadcast({ t: 'screen-stopped' });
        }
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  /** Sala vazia há mais que o timeout deixa de existir — nada fica sem gente. */
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_LIMITS.emptyTimeoutMs);
      return;
    }
    await this.ctx.storage.deleteAll();
  }

  private async leave(ws: WebSocket): Promise<void> {
    const { peerId } = this.attachment(ws);
    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    // O lock de tela é liberado até em queda de conexão.
    if (screen?.id === peerId) {
      await this.ctx.storage.delete('screen');
      this.broadcast({ t: 'screen-stopped' }, peerId);
    }
    this.broadcast({ t: 'peer-left', id: peerId }, peerId);
    if (this.ctx.getWebSockets().filter((peer) => peer !== ws).length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_LIMITS.emptyTimeoutMs);
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
      // socket já fechado: o close handler cuida da saída
    }
  }

  private broadcast(message: ServerMessage, exceptId?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.attachment(ws).peerId !== exceptId) {
        this.send(ws, message);
      }
    }
  }
}

const API_ROOM = /^\/api\/rooms\/([^/]+)$/;
const WS_ROOM = /^\/ws\/rooms\/([^/]+)$/;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === '/healthz') {
    return json({ status: 'ok' }, 200, env);
  }

  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    // Convidados não autenticados criam salas: rate limit é a primeira
    // linha de defesa contra abuso.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: 'rate_limited' }, 429, env);
    }

    let displayName: string | undefined;
    try {
      const body = (await request.json().catch(() => ({}))) as { displayName?: unknown };
      if (body.displayName !== undefined) {
        if (typeof body.displayName !== 'string' || body.displayName.length > ROOM_LIMITS.displayNameMaxLength) {
          return json({ error: 'invalid_body' }, 400, env);
        }
        displayName = body.displayName;
      }
    } catch {
      return json({ error: 'invalid_body' }, 400, env);
    }

    const slug = randomId(9);
    const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
    const created = await room.fetch('https://room/create', {
      method: 'POST',
      body: JSON.stringify({ slug, displayName: displayName?.trim() || 'Sala sem nome' }),
    });
    return json(await created.json(), 201, env);
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
      if (!slug || slug.length > 64 || !name || name.length > ROOM_LIMITS.guestNameMaxLength) {
        return new Response('invalid request', { status: 400 });
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
      return room.fetch(`https://room/join?name=${encodeURIComponent(name)}`, request);
    }

    const api = await handleApi(request, env, url);
    if (api) {
      return api;
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404, env);
    }

    // SPA fallback: /r/:slug cai no index.html.
    if (request.method === 'GET') {
      return env.ASSETS.fetch(new Request(new URL('/', url), request));
    }
    return new Response('not found', { status: 404 });
  },
};
