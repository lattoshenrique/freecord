/**
 * Composition root for the rooms + signaling server.
 */
import { RoomRegistry } from './app/room-registry.js';
import { sweepStalePeers } from './app/signaling.js';
import { loadConfig } from './config.js';
import { buildServer } from './http/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const registry = new RoomRegistry();
  const app = await buildServer({
    registry,
    corsOrigin: config.CORS_ORIGIN,
    webDist: config.WEB_DIST,
  });

  // Two sweeps: zombie peers leave quickly so the room can empty out;
  // a room empty past the timeout ceases to exist.
  const sweeper = setInterval(() => {
    sweepStalePeers(registry);
    registry.sweepExpired();
  }, 10 * 1000);
  sweeper.unref();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
