/**
 * Borda Cloudflare do servidor de salas.
 *
 * Mesma API HTTP e mesmo protocolo WS do servidor Node (server/src) — muda só
 * o transporte e onde o estado vive: em vez de um Map por processo, uma
 * Durable Object por slug. É o passo 3 do caminho de escala descrito em
 * docs/architecture.md (sharding por sala), sem mudança na UI.
 */
import {
  ROOM_LIMITS,
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
import { fetchDesktopCatalog } from '../../server/src/app/desktop-catalog.js';

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
  /** Último ping — base para expulsar conexões zumbis (ver alarm). */
  lastSeen: number;
}

interface RoomMeta {
  slug: string;
  displayName: string;
}

type ScreenLock = { id: string; streamId: string; quality: ScreenQuality } | null;
/** Relays da árvore de tela: peerId → streamId de reencaminhamento. */
type ScreenRelays = Record<string, string>;

/** Cadência da varredura de zumbis enquanto há gente na sala. */
const SWEEP_INTERVAL_MS = Math.floor(ROOM_LIMITS.peerTimeoutMs / 2);

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
 * anexos dos sockets, o resto (metadados, lock, `emptyAt`) do storage.
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
    await this.markEmptyFrom(Date.now());
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
    server.serializeAttachment({ peerId, name, lastSeen: Date.now() } satisfies PeerAttachment);
    // Com gente dentro, o relógio de expiração para e a varredura de zumbis começa.
    await this.ctx.storage.delete('emptyAt');
    await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL_MS);

    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    this.send(server, {
      t: 'welcome',
      selfId: peerId,
      room: { slug: meta!.slug, displayName: meta!.displayName },
      peers: peers.map((ws) => this.peerInfo(ws)),
      screen: screen ? { id: screen.id, streamId: screen.streamId } : null,
    });
    this.broadcast({ t: 'peer-joined', peer: { id: peerId, name } }, peerId);
    // Tela em andamento: quem chega precisa de rota, e a árvore muda.
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
        // Prova de vida + medida de latência: o cliente cronometra o eco.
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
        // Reenvio do próprio sharer = troca de qualidade ao vivo.
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
        // Só relays da árvore atual podem anunciar stream de reencaminhamento.
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
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leave([ws]);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave([ws]);
  }

  /**
   * Varredura periódica: derruba quem parou de dar sinal de vida e mata a
   * sala que ficou vazia além do timeout.
   *
   * Sem a parte dos zumbis a sala nunca esvazia — queda de rede sem FIN
   * (tampa do notebook, wi-fi que some) não gera evento de close, e o socket
   * fantasma seguraria a sala viva para sempre.
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    const zombies = this.ctx
      .getWebSockets()
      .filter((ws) => now - this.attachment(ws).lastSeen > ROOM_LIMITS.peerTimeoutMs);

    if (zombies.length > 0) {
      await this.leave(zombies);
      for (const ws of zombies) {
        try {
          ws.close(1001, 'sem sinal de vida');
        } catch {
          // socket já foi embora
        }
      }
      return;
    }

    await this.rescheduleSweep([]);
  }

  /** Saída de um ou mais pares: avisa quem ficou e reavalia o fim da sala. */
  private async leave(leaving: WebSocket[]): Promise<void> {
    const gone = new Set(leaving.map((ws) => this.attachment(ws).peerId));
    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    // O lock de tela é liberado até em queda de conexão.
    if (screen && gone.has(screen.id)) {
      await this.ctx.storage.delete('screen');
      await this.ctx.storage.delete('screenRelays');
      this.broadcast({ t: 'screen-stopped' }, undefined, leaving);
    } else if (screen) {
      // Saiu um relay ou uma folha: a árvore de tela muda de forma.
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
   * (Re)distribui os papéis da árvore de retransmissão da tela — espelho da
   * lógica do server Node (broadcastScreenRoutes em app/signaling.ts).
   */
  private async broadcastScreenRoutes(excluded: WebSocket[] = []): Promise<void> {
    const screen = (await this.ctx.storage.get<ScreenLock>('screen')) ?? null;
    if (!screen) {
      return;
    }
    const sockets = this.remaining(excluded);
    const relays = (await this.ctx.storage.get<ScreenRelays>('screenRelays')) ?? {};
    const tree = computeScreenTree(
      screen.id,
      sockets.map((ws) => this.attachment(ws).peerId),
    );
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
    if (this.remaining(excluded).length > 0) {
      await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
      return;
    }
    const emptyAt = (await this.ctx.storage.get<number>('emptyAt')) ?? now;
    if (now - emptyAt >= ROOM_LIMITS.emptyTimeoutMs) {
      // Sala sem ninguém além do timeout: deixa de existir.
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
  await cache.put(
    CATALOG_FRESH,
    new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=1800' } }),
  );
  await cache.put(
    CATALOG_STALE,
    new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' } }),
  );
  return catalog;
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
      body: JSON.stringify({ slug, displayName: displayName?.trim() || 'Sala sem nome' }),
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
      if (!slug || slug.length > 64 || !name || name.length > ROOM_LIMITS.guestNameMaxLength) {
        return new Response('invalid request', { status: 400 });
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(slug));
      return room.fetch(`https://room/join?name=${encodeURIComponent(name)}`, request);
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

    // SPA fallback: /r/:slug cai no index.html.
    if (request.method === 'GET') {
      return env.ASSETS.fetch(new Request(new URL('/', url), request));
    }
    return new Response('not found', { status: 404 });
  },
};
