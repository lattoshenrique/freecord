import { describe, expect, it, vi } from 'vitest';
import { lookupSource, type FetchLike } from '../src/app/source-lookup.js';

/** A web made of whatever the test says it is made of. */
function web(pages: Record<string, { body?: string; status?: number; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    const page = pages[url];
    if (!page) {
      throw new Error(`nothing at ${url}`);
    }
    return new Response(page.status && page.status >= 300 && page.status < 400 ? null : (page.body ?? ''), {
      status: page.status ?? 200,
      headers: { 'content-type': 'text/html; charset=utf-8', ...page.headers },
    });
  };
  return { fetchImpl, calls };
}

describe('a link that is already a video', () => {
  it('is answered without opening anything in anybody’s name', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const result = await lookupSource('https://cdn.example.com/11.mp4', fetchImpl);
    expect(result).toMatchObject({ ok: true, lookup: { candidates: [{ play: 'file' }] } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('and so is a Twitch channel', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const result = await lookupSource('twitch.tv/gaules', fetchImpl);
    expect(result).toMatchObject({
      ok: true,
      lookup: { candidates: [{ play: 'twitch', twitch: { channel: 'gaules' }, live: true }] },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('a link we will not open at all', () => {
  it('is refused before the first request', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    for (const bad of ['javascript:alert(1)', 'http://127.0.0.1/a', 'https://x.example:9999/a', '']) {
      expect(await lookupSource(bad, fetchImpl)).toEqual({ ok: false, reason: 'invalid_url' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('reading the page', () => {
  it('offers what it found, and the page itself as the last resort', async () => {
    const { fetchImpl } = web({
      'https://site.example/ep/1': {
        body: '<meta property="og:video" content="https://cdn.example/1.mp4"><title>Episode 1</title>',
      },
    });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(result.ok && result.lookup.candidates.map((c) => [c.play, c.url])).toEqual([
      ['file', 'https://cdn.example/1.mp4'],
      ['frame', 'https://site.example/ep/1'],
    ]);
    expect(result.ok && result.lookup.title).toBe('Episode 1');
  });

  it('does not offer a page that refuses to be framed', async () => {
    const { fetchImpl } = web({
      'https://site.example/ep/1': { body: '<h1>nothing here</h1>', headers: { 'x-frame-options': 'SAMEORIGIN' } },
    });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(result).toMatchObject({ ok: true, lookup: { candidates: [], empty: true } });
  });

  it('follows the player one page in, and says where it came from', async () => {
    const { fetchImpl, calls } = web({
      'https://site.example/ep/1': { body: '<iframe src="https://player.example/e/abc"></iframe>' },
      'https://player.example/e/abc': { body: '<video src="https://cdn.example/abc.mp4"></video>' },
    });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(calls).toEqual(['https://site.example/ep/1', 'https://player.example/e/abc']);
    expect(result.ok && result.lookup.candidates[0]).toMatchObject({
      play: 'file',
      url: 'https://cdn.example/abc.mp4',
      via: 'player.example',
    });
  });

  it('stops at one hop, however many players are nested', async () => {
    const { fetchImpl, calls } = web({
      'https://site.example/ep/1': { body: '<iframe src="https://a.example/1"></iframe>' },
      'https://a.example/1': { body: '<iframe src="https://b.example/2"></iframe>' },
      'https://b.example/2': { body: '<video src="https://cdn.example/deep.mp4"></video>' },
    });
    await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(calls).toHaveLength(2);
  });

  it('takes a URL whose server says it is a video, extension or not', async () => {
    const { fetchImpl } = web({
      'https://cdn.example/stream': { body: '', headers: { 'content-type': 'video/mp4' } },
    });
    const result = await lookupSource('https://cdn.example/stream', fetchImpl);
    expect(result).toMatchObject({ ok: true, lookup: { candidates: [{ play: 'file' }] } });
  });
});

describe('redirects', () => {
  it('are followed, and the destination is the page that was read', async () => {
    const { fetchImpl } = web({
      'https://site.example/ep/1': { status: 302, headers: { location: 'https://site.example/ep/1/watch' } },
      'https://site.example/ep/1/watch': { body: '<video src="/v/1.mp4"></video>' },
    });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(result.ok && result.lookup.url).toBe('https://site.example/ep/1/watch');
    expect(result.ok && result.lookup.candidates[0]?.url).toBe('https://site.example/v/1.mp4');
  });

  it('are checked again at every hop — this is where an open redirect would walk us home', async () => {
    const { fetchImpl, calls } = web({
      'https://site.example/go': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
    });
    expect(await lookupSource('https://site.example/go', fetchImpl)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
    expect(calls).toEqual(['https://site.example/go']);
  });

  it('give up rather than go round in circles', async () => {
    const { fetchImpl, calls } = web({
      'https://site.example/a': { status: 302, headers: { location: 'https://site.example/b' } },
      'https://site.example/b': { status: 302, headers: { location: 'https://site.example/a' } },
    });
    expect(await lookupSource('https://site.example/a', fetchImpl)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
    expect(calls.length).toBeLessThanOrEqual(5);
  });
});

describe('when the page does not answer', () => {
  it('says so instead of throwing at the edge', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ETIMEDOUT');
    };
    expect(await lookupSource('https://site.example/ep/1', fetchImpl)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('and a page that answers with an error is no page at all', async () => {
    const { fetchImpl } = web({ 'https://site.example/ep/1': { status: 403, body: 'no' } });
    expect(await lookupSource('https://site.example/ep/1', fetchImpl)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('refuses a body far too big to be a page', async () => {
    const { fetchImpl } = web({
      'https://site.example/ep/1': { body: 'x', headers: { 'content-length': String(64 * 1024 * 1024) } },
    });
    expect(await lookupSource('https://site.example/ep/1', fetchImpl)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });
});
