/**
 * Composition root for the rooms + signaling server.
 */
import { RoomRegistry } from './app/room-registry.js';
import { sweepStalePeers } from './app/signaling.js';
import { TurnCredentialProvider } from './app/turn.js';
import { loadConfig } from './config.js';
import { buildServer } from './http/server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const registry = new RoomRegistry();
  const turn = new TurnCredentialProvider(
    config.TURN_KEY_ID && config.TURN_API_TOKEN
      ? { keyId: config.TURN_KEY_ID, apiToken: config.TURN_API_TOKEN }
      : null,
  );
  const app = await buildServer({
    registry,
    corsOrigin: config.CORS_ORIGIN,
    webDist: config.WEB_DIST,
    turn,
  });

  // Three sweeps: zombie peers leave quickly so the room can empty out;
  // a long conversation crosses the mark that makes it count; a room
  // empty past the timeout ceases to exist.
  const sweeper = setInterval(() => {
    sweepStalePeers(registry);
    registry.tallyCompany();
    registry.sweepExpired();
  }, 10 * 1000);
  sweeper.unref();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
