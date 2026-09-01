/**
 * Test boot for the rooms + signaling edge.
 *
 * Mirrors server/src/index.ts + server/src/http/server.ts using the REAL
 * compiled server modules (@freecord/server dist): same registry, same
 * routes, same sweeps, same plugin set and options — with ONE deliberate
 * deviation: the anti-abuse rate limit max is env-tunable. Production
 * pins 60 req/min/IP globally, which also gates WS upgrades and static
 * assets; a test/load run from one loopback IP would trip it immediately
 * while telling us nothing about the signaling under test.
 *
 * Env:
 *   PORT             port to listen on (default 0 = ephemeral)
 *   WEB_DIST         absolute path of the web build to serve (optional)
 *   RATE_LIMIT_MAX   requests/min/IP (default 60 — the production value)
 *   LOG              "1" enables fastify logging
 *
 * Prints one line when ready:  E2E_SERVER_LISTENING {"port":12345}
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { RoomRegistry } from '@freecord/server/dist/app/room-registry.js';
import { sweepStalePeers } from '@freecord/server/dist/app/signaling.js';
import { TurnCredentialProvider } from '@freecord/server/dist/app/turn.js';
import { registerRoutes } from '@freecord/server/dist/http/routes.js';

async function main() {
  const registry = new RoomRegistry();
  const app = Fastify({ logger: process.env.LOG === '1' });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 60),
    timeWindow: '1 minute',
  });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  registerRoutes(app, registry, new TurnCredentialProvider(null));

  const webDist = process.env.WEB_DIST;
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (
        (request.method === 'GET' || request.method === 'HEAD') &&
        !request.url.startsWith('/api/')
      ) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  // Same two sweeps as production, on the same clock.
  const sweeper = setInterval(() => {
    sweepStalePeers(registry);
    registry.sweepExpired();
  }, 10 * 1000);
  sweeper.unref();

  await app.listen({ port: Number(process.env.PORT ?? 0), host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : Number(process.env.PORT);
  console.log(`E2E_SERVER_LISTENING ${JSON.stringify({ port })}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
