import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { RoomRegistry } from '../src/app/room-registry.js';
import { buildServer } from '../src/http/server.js';

describe('HTTP routes', () => {
  let app: FastifyInstance;
  let registry: RoomRegistry;

  beforeEach(async () => {
    registry = new RoomRegistry();
    app = await buildServer({ registry, logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /api/rooms creates a room and returns the slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { displayName: 'Test room' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { slug: string; displayName: string };
    expect(body.displayName).toBe('Test room');
    expect(registry.summarize(body.slug).participantCount).toBe(0);
  });

  it('POST /api/rooms rejects a name over the limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { displayName: 'x'.repeat(61) },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/rooms/:slug returns 404 for a nonexistent room', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/rooms/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'room_not_found' });
  });

  it('GET /api/rooms/:slug returns the created room summary', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: {} });
    const { slug } = created.json() as { slug: string };
    const fetched = await app.inject({ method: 'GET', url: `/api/rooms/${slug}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual({
      slug,
      displayName: '',
      participantCount: 0,
    });
  });

  it('PATCH /api/rooms/:slug renames the room and trims the name', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: {} });
    const { slug } = created.json() as { slug: string };
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/rooms/${slug}`,
      payload: { displayName: '  Friday night  ' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toEqual({ slug, displayName: 'Friday night', participantCount: 0 });
    expect(registry.summarize(slug).displayName).toBe('Friday night');
  });

  it('PATCH /api/rooms/:slug rejects a name over the limit and an unknown room', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/rooms', payload: {} });
    const { slug } = created.json() as { slug: string };
    const tooLong = await app.inject({
      method: 'PATCH',
      url: `/api/rooms/${slug}`,
      payload: { displayName: 'x'.repeat(61) },
    });
    expect(tooLong.statusCode).toBe(400);
    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/rooms/does-not-exist',
      payload: { displayName: 'x' },
    });
    expect(missing.statusCode).toBe(404);
  });
});
