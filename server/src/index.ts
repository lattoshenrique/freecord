/**
 * Raiz de composição do servidor de salas + sinalização.
 */
import { RoomRegistry } from './app/room-registry.js';
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

  const sweeper = setInterval(() => registry.sweepExpired(), 60 * 1000);
  sweeper.unref();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
