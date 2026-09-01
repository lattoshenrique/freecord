import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { RoomRegistry } from '../src/app/room-registry.js';
import { buildServer } from '../src/http/server.js';

describe('rotas HTTP', () => {
  let app: FastifyInstance;
  let registry: RoomRegistry;

  beforeEach(async () => {
    registry = new RoomRegistry();
    app = await buildServer({ registry, logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/rooms cria sala e devolve slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { displayName: 'Sala teste' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { slug: string; displayName: string };
    expect(body.displayName).toBe('Sala teste');
    expect(registry.summarize(body.slug).participantCount).toBe(0);
  });

  it('POST /api/rooms rejeita nome acima do limite', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { displayName: 'x'.repeat(61) },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/rooms/:slug devolve 404 para sala inexistente', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/rooms/nao-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'room_not_found' });
  });

  it('GET /api/rooms/:slug devolve resumo da sala criada', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: {} });
    const { slug } = created.json() as { slug: string };
    const fetched = await app.inject({ method: 'GET', url: `/api/rooms/${slug}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual({
      slug,
      displayName: 'Sala sem nome',
      participantCount: 0,
    });
  });
});
