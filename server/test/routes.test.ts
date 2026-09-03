import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  /**
   * A GET would put the pasted page in the query string, and both edges
   * write a request's URL to their logs — which would quietly break the
   * one thing this route promises. The method is part of the promise.
   */
  it('GET /api/sources is not a route: the page travels in the body', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/sources?url=https://example.com/a' });
    expect(get.statusCode).toBe(404);
    const post = await app.inject({ method: 'POST', url: '/api/sources', payload: { url: 'nope' } });
    expect(post.statusCode).toBe(400);
    expect(post.json()).toEqual({ error: 'invalid_url' });
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

describe('single-process web host', () => {
  let app: FastifyInstance;
  let temporaryDirectory: string;
  let webRoot: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'freecord-web-'));
    webRoot = join(temporaryDirectory, 'public');
    await mkdir(join(webRoot, 'assets'), { recursive: true });
    await writeFile(
      join(webRoot, 'index.html'),
      '<!doctype html><meta property="og:image" content="https://freecord.test/og.png"><main>Freecord SPA</main>',
    );
    await writeFile(join(webRoot, 'assets', 'app.js'), 'console.log("freecord");');
    await writeFile(join(temporaryDirectory, 'secret.txt'), 'must not be public');
    app = await buildServer({ registry: new RoomRegistry(), webDist: webRoot, logger: false });
  });

  afterEach(async () => {
    await app.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('serves a real asset with its content type and nosniff', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toBe('console.log("freecord");');
  });

  it('serves index.html at the root and for an SPA route', async () => {
    const root = await app.inject({ method: 'GET', url: '/' });
    const route = await app.inject({ method: 'GET', url: '/community' });
    expect(root.statusCode).toBe(200);
    expect(route.statusCode).toBe(200);
    expect(root.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(route.body).toContain('Freecord SPA');
  });

  it('rewrites room previews and keeps them out of search indexes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/r/test-room',
      headers: { host: 'rooms.freecord.test:3001' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.body).toContain('http://rooms.freecord.test:3001/og-room.png');
  });

  it('keeps unknown API paths as JSON 404s', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/unknown' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found' });
  });

  it('does not serve a file outside the configured web root', async () => {
    const response = await app.inject({ method: 'GET', url: '/%2e%2e/secret.txt' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Freecord SPA');
    expect(response.body).not.toContain('must not be public');
  });
});
