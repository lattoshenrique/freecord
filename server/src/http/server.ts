import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RoomRegistry } from '../app/room-registry.js';
import { registerRoutes } from './routes.js';

export interface BuildServerOptions {
  registry: RoomRegistry;
  corsOrigin?: string;
  /** When set, serves the web build (single-process production). */
  webDist?: string;
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

  registerRoutes(app, options.registry);

  if (options.webDist) {
    await app.register(fastifyStatic, { root: options.webDist, wildcard: false });
    // SPA fallback: /r/:slug lands on index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
