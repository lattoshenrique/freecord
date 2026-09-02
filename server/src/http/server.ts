import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RoomRegistry } from '../app/room-registry.js';
import { TurnCredentialProvider } from '../app/turn.js';
import { roomPreviewHtml } from '../domain/preview.js';
import { registerRoutes } from './routes.js';

export interface BuildServerOptions {
  registry: RoomRegistry;
  corsOrigin?: string;
  /** When set, serves the web build (single-process production). */
  webDist?: string;
  /** Unset = STUN-only joins (dev default, no external credential). */
  turn?: TurnCredentialProvider;
  logger?: boolean;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, { origin: options.corsOrigin ?? true });

  // Unauthenticated guests can create rooms: rate limiting is the
  // first line of defense against abuse.
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  registerRoutes(app, options.registry, options.turn ?? new TurnCredentialProvider(null));

  if (options.webDist) {
    await app.register(fastifyStatic, { root: options.webDist, wildcard: false });
    // Read once: the page a room link is answered with differs from the file
    // on disk only by its preview image, and re-reading it per request would
    // buy nothing (fastify-static caches the home page too).
    const index = await readFile(join(options.webDist, 'index.html'), 'utf8');
    // SPA fallback: /r/:slug lands on index.html.
    app.setNotFoundHandler((request, reply) => {
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        !request.url.startsWith('/api/')
      ) {
        // Room links stay out of search indexes (mirror of the Worker edge).
        if (request.url.startsWith('/r/')) {
          void reply.header('X-Robots-Tag', 'noindex, nofollow');
          // And they preview as an invite, not as the front page.
          // `host`, not `hostname`: the port is part of the origin a
          // self-hosted install is reached on.
          const origin = `${request.protocol}://${request.host}`;
          return reply.type('text/html; charset=utf-8').send(roomPreviewHtml(index, origin));
        }
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
