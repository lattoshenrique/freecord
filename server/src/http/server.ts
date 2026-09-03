import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { RoomRegistry } from '../app/room-registry.js';
import { TurnCredentialProvider } from '../app/turn.js';
import { registerRoutes } from './routes.js';
import { registerWeb } from './web.js';

export interface BuildServerOptions {
  registry: RoomRegistry;
  /** When set, serves the web build (single-process production). */
  webDist?: string;
  /** Unset = STUN-only joins (dev default, no external credential). */
  turn?: TurnCredentialProvider;
  logger?: boolean;
  /** Test/load override; production always uses the default. */
  rateLimitMax?: number;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  // Unauthenticated guests can create rooms: rate limiting is the
  // first line of defense against abuse.
  await app.register(rateLimit, { max: options.rateLimitMax ?? 60, timeWindow: '1 minute' });

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  registerRoutes(app, options.registry, options.turn ?? new TurnCredentialProvider(null));

  if (options.webDist) {
    await registerWeb(app, options.webDist);
  }

  return app;
}
