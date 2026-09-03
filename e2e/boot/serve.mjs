/**
 * Test boot for the rooms + signaling edge.
 *
 * Boots the REAL compiled Node edge (@freecord/server dist): same server,
 * registry, routes, sweeps and static host — with ONE deliberate deviation:
 * the anti-abuse rate limit max is env-tunable. Production
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
import { RoomRegistry } from '@freecord/server/dist/app/room-registry.js';
import { sweepStalePeers } from '@freecord/server/dist/app/signaling.js';
import { buildServer } from '@freecord/server/dist/http/server.js';

async function main() {
  const registry = new RoomRegistry();
  const app = await buildServer({
    registry,
    webDist: process.env.WEB_DIST,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 60),
    logger: process.env.LOG === '1',
  });

  // Same three sweeps as production, on the same clock.
  const sweeper = setInterval(() => {
    sweepStalePeers(registry);
    registry.tallyCompany();
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
