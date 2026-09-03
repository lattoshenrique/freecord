import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RoomRegistry } from '../app/room-registry.js';
import { DESKTOP_CATALOG_TTL_MS, fetchDesktopCatalog } from '../app/desktop-catalog.js';
import { SignalingSession, parseClientMessage } from '../app/signaling.js';
import { lookupSource } from '../app/source-lookup.js';
import type { TurnCredentialProvider } from '../app/turn.js';
import { SOURCE_LIMITS } from '../domain/sources.js';
import { EMPTY_DESKTOP_CATALOG, type DesktopCatalog } from '../domain/downloads.js';
import {
  ROOM_LIMITS,
  RoomFullError,
  RoomNotFoundError,
  type PeerChannel,
} from '../domain/room.js';

const createRoomBody = z.object({
  displayName: z.string().max(ROOM_LIMITS.displayNameMaxLength).optional(),
});

const renameRoomBody = z.object({
  displayName: z.string().max(ROOM_LIMITS.displayNameMaxLength),
});

const slugParam = z.object({
  slug: z.string().min(1).max(64),
});

/**
 * The pasted page travels in the BODY, never in the query string. A URL
 * in a query string is written to this server's request log by Fastify's
 * own serializer, and to Cloudflare's on the other edge — so a GET would
 * have quietly kept the one thing this route promises not to keep.
 */
const sourceBody = z.object({
  url: z.string().min(1).max(SOURCE_LIMITS.maxUrlLength),
});

/** A join carries a guest name; a reconnection carries a resume token instead. */
const joinQuery = z
  .object({
    name: z
      .string()
      .min(1)
      .max(ROOM_LIMITS.guestNameMaxLength)
      .refine((value) => value.trim().length > 0, 'blank name')
      .optional(),
    resume: z.string().min(1).max(64).optional(),
  })
  .refine((query) => query.name !== undefined || query.resume !== undefined, 'name or resume');

/**
 * Desktop app catalog in memory: the same route as the Cloudflare edge, with
 * the cache a single process has at hand. A failed read serves the stale
 * catalog — `latest/download` links do not expire (see domain/downloads.ts).
 */
let desktopCache: { catalog: DesktopCatalog; until: number } | null = null;

async function desktopCatalog(): Promise<DesktopCatalog> {
  if (desktopCache && Date.now() < desktopCache.until) {
    return desktopCache.catalog;
  }
  const catalog = await fetchDesktopCatalog();
  if (!catalog) {
    return desktopCache?.catalog ?? EMPTY_DESKTOP_CATALOG;
  }
  // "No release yet" flips the moment a release lands: hold it for a minute,
  // not half an hour.
  const ttl = catalog.builds.length > 0 ? DESKTOP_CATALOG_TTL_MS : 60_000;
  desktopCache = { catalog, until: Date.now() + ttl };
  return catalog;
}

export function registerRoutes(
  app: FastifyInstance,
  registry: RoomRegistry,
  turn: TurnCredentialProvider,
): void {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/api/rooms', async (request, reply) => {
    const body = createRoomBody.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    return reply.code(201).send(registry.createRoom(body.data.displayName));
  });

  /**
   * The one public number: rooms that held company long enough to count
   * (domain/room-stats.ts). An aggregate and nothing else — no slug, no
   * name, no timestamp — because a room still leaves no trace behind it.
   */
  app.get('/api/stats', async (_request, reply) => {
    return reply
      .header('Cache-Control', 'public, max-age=60')
      .send({ rooms: registry.countedRooms });
  });

  app.get('/api/downloads', async (_request, reply) => {
    return reply.header('Cache-Control', 'public, max-age=300').send(await desktopCatalog());
  });

  /**
   * What is playable in a page somebody pasted, for the watch tool
   * (app/source-lookup.ts). The one place the server opens a stranger's
   * URL, so it is worth saying what it is and is not:
   *
   * It reads the page's markup and hands back what it found. It never
   * touches a media byte — the video is fetched by each browser from
   * wherever it lives, the way a YouTube link has always worked — and
   * it stores nothing: no cache, no log line with the URL in it (which
   * is why the page arrives in the body and not in the query string —
   * see sourceBody), and `no-store` on the way out, because what
   * somebody is about to watch is not ours to keep or to leave in a
   * proxy.
   *
   * Tighter than the global limit: every call here is an outbound
   * request in our name.
   */
  app.post(
    '/api/sources',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = sourceBody.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: 'invalid_url' });
      }
      const result = await lookupSource(body.data.url);
      if (!result.ok) {
        // A link we will not open is the caller's mistake; a page that
        // would not answer is not ours either.
        return reply
          .code(result.reason === 'invalid_url' ? 400 : 502)
          .send({ error: result.reason });
      }
      return reply.header('Cache-Control', 'no-store').send(result.lookup);
    },
  );

  app.get('/api/rooms/:slug', async (request, reply) => {
    const params = slugParam.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_slug' });
    }
    try {
      return registry.summarize(params.data.slug);
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        return reply.code(404).send({ error: 'room_not_found' });
      }
      throw error;
    }
  });

  app.patch('/api/rooms/:slug', async (request, reply) => {
    const params = slugParam.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_slug' });
    }
    const body = renameRoomBody.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    try {
      return registry.renameRoom(params.data.slug, body.data.displayName);
    } catch (error) {
      if (error instanceof RoomNotFoundError) {
        return reply.code(404).send({ error: 'room_not_found' });
      }
      throw error;
    }
  });

  app.get('/ws/rooms/:slug', { websocket: true }, async (socket, request) => {
    const params = slugParam.safeParse(request.params);
    const query = joinQuery.safeParse(request.query);
    if (!params.success || !query.success) {
      socket.send(JSON.stringify({ t: 'error', code: 'invalid_name' }));
      socket.close();
      return;
    }

    const channel: PeerChannel = {
      send: (message) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      },
      close: () => socket.close(),
    };

    // Cached after the first join; the client sends nothing before `welcome`,
    // so nothing is missed while this resolves.
    const ice = await turn.iceServers();

    let session: SignalingSession | null;
    try {
      session = query.data.resume
        ? SignalingSession.resume(registry, params.data.slug, query.data.resume, channel, ice)
        : SignalingSession.join(registry, params.data.slug, query.data.name!.trim(), channel, ice);
    } catch (error) {
      const code =
        error instanceof RoomNotFoundError
          ? 'room_not_found'
          : error instanceof RoomFullError
            ? 'room_full'
            : null;
      if (!code) {
        throw error;
      }
      socket.send(JSON.stringify({ t: 'error', code }));
      socket.close();
      return;
    }
    if (!session) {
      // Unknown resume token: the seat was already swept. The client
      // starts over with a fresh join instead of retrying.
      socket.send(JSON.stringify({ t: 'error', code: 'resume_invalid' }));
      socket.close();
      return;
    }
    const live = session;

    socket.on('message', (raw: Buffer | string) => {
      const message = parseClientMessage(raw.toString());
      if (message) {
        live.handleMessage(message);
      }
    });
    socket.on('close', () => live.close());
    socket.on('error', () => live.close());
  });
}
