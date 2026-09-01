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
  /** Quando definido, serve o build do web (produção single-process). */
  webDist?: string;
  logger?: boolean;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, { origin: options.corsOrigin ?? true });

  // Convidados não autenticados podem criar salas: rate limit é a
  // primeira linha de defesa contra abuso.
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  registerRoutes(app, options.registry);

  if (options.webDist) {
    await app.register(fastifyStatic, { root: options.webDist, wildcard: false });
    // SPA fallback: /r/:slug cai no index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}
