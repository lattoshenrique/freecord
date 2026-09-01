import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { RoomRegistry } from '../app/room-registry.js';
import { DESKTOP_CATALOG_TTL_MS, fetchDesktopCatalog } from '../app/desktop-catalog.js';
import { SignalingSession, parseClientMessage } from '../app/signaling.js';
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

const slugParam = z.object({
  slug: z.string().min(1).max(64),
});

const joinQuery = z.object({
  name: z
    .string()
    .min(1)
    .max(ROOM_LIMITS.guestNameMaxLength)
    .refine((value) => value.trim().length > 0, 'blank name'),
});

/**
 * Desktop app catalog in memory: the same route as the Cloudflare edge, with
 * the cache a single process has at hand. A failed read serves the stale
 * catalog — `latest/download` links do not expire (see domain/downloads.ts).
 */
let desktopCache: { catalog: DesktopCatalog; at: number } | null = null;

async function desktopCatalog(): Promise<DesktopCatalog> {
  if (desktopCache && Date.now() - desktopCache.at < DESKTOP_CATALOG_TTL_MS) {
    return desktopCache.catalog;
  }
  const catalog = await fetchDesktopCatalog();
  if (!catalog) {
    return desktopCache?.catalog ?? EMPTY_DESKTOP_CATALOG;
  }
  desktopCache = { catalog, at: Date.now() };
  return catalog;
}

export function registerRoutes(app: FastifyInstance, registry: RoomRegistry): void {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/api/rooms', async (request, reply) => {
    const body = createRoomBody.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    return reply.code(201).send(registry.createRoom(body.data.displayName));
  });

  app.get('/api/downloads', async (_request, reply) => {
    return reply.header('Cache-Control', 'public, max-age=300').send(await desktopCatalog());
  });

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

  app.get('/ws/rooms/:slug', { websocket: true }, (socket: WebSocket, request) => {
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

    let session: SignalingSession;
    try {
      session = new SignalingSession(
        registry,
        params.data.slug,
        query.data.name.trim(),
        channel,
      );
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

    socket.on('message', (raw: Buffer | string) => {
      const message = parseClientMessage(raw.toString());
      if (message) {
        session.handleMessage(message);
      }
    });
    socket.on('close', () => session.close());
    socket.on('error', () => session.close());
  });
}
