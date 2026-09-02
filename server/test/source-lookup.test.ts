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

describe('the players the big platforms hand out', () => {
  it('offers the embed alongside what the page itself gave up', async () => {
    // Vimeo's page yields real manifests, which give the room a shared
    // clock; the embed always works and gives none. Both, and the person
    // picks — which is what this tool is for.
    const { fetchImpl } = web({
      'https://vimeo.com/76979871': { body: '<video src="https://cdn.example/a.m3u8"></video>' },
    });
    const result = await lookupSource('https://vimeo.com/76979871', fetchImpl);
    const urls = result.ok ? result.lookup.candidates.map((c) => c.url) : [];
    expect(urls).toContain('https://cdn.example/a.m3u8');
    expect(urls).toContain('https://player.vimeo.com/video/76979871');
  });

  it('knows the shapes the platforms use', async () => {
    const cases: [string, string][] = [
      ['https://www.dailymotion.com/video/x8mnh4k', 'https://geo.dailymotion.com/player.html?video=x8mnh4k'],
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ];
    for (const [page, embed] of cases) {
      const { fetchImpl } = web({ [page]: { body: '<h1>nothing readable</h1>' } });
      const result = await lookupSource(page, fetchImpl);
      const urls = result.ok ? result.lookup.candidates.map((c) => c.url) : [];
      expect(urls, page).toContain(embed);
    }
  });
});

describe('the same stream signed four ways', () => {
  it('is offered once, because four identical rows are not a choice', async () => {
    const { fetchImpl } = web({
      'https://site.example/v': {
        body: `<script>
          var a = "https://cdn.example/exp=1~one/playlist.m3u8";
          var b = "https://cdn.example/exp=2~two/playlist.m3u8";
          var c = "https://other.example/exp=3~three/playlist.m3u8";
        </script>`,
      },
    });
    const result = await lookupSource('https://site.example/v', fetchImpl);
    const streams = result.ok ? result.lookup.candidates.filter((c) => c.play === 'hls') : [];
    expect(streams).toHaveLength(2);
    expect(streams.map((c) => c.label)).toEqual(['cdn.example', 'other.example']);
  });
});

describe('the fallback that always works', () => {
  it('keeps its place however generous the page was', async () => {
    // A page offering a dozen files would otherwise push the one option
    // that survives a click-gated site off the end of the list.
    const sources = Array.from(
      { length: 20 },
      (_, index) => `<source src="https://cdn.example/${index}.mp4" type="video/mp4">`,
    ).join('');
    const { fetchImpl } = web({ 'https://site.example/ep/1': { body: sources } });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    const candidates = result.ok ? result.lookup.candidates : [];
    expect(candidates).toHaveLength(12);
    expect(candidates[candidates.length - 1]).toMatchObject({
      play: 'frame',
      url: 'https://site.example/ep/1',
    });
  });
});

describe('a page that is not UTF-8', () => {
  it('is read in the encoding it says it is, not the one we hoped for', async () => {
    // windows-1252: 0xF3 is ó. Read as UTF-8 it is a replacement
    // character, and the room gets a title with a black diamond in it.
    const body = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="windows-1252"><title>Epis'),
      0xf3,
      ...new TextEncoder().encode('dio 11</title><video src="/11.mp4"></video>'),
    ]);
    const fetchImpl: FetchLike = async () =>
      new Response(body, { headers: { 'content-type': 'text/html' } });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(result.ok && result.lookup.title).toBe('Episódio 11');
  });

  it('falls back rather than throwing on an encoding this runtime lacks', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('<meta charset="x-nonsense-9000"><video src="/11.mp4"></video>', {
        headers: { 'content-type': 'text/html' },
      });
    const result = await lookupSource('https://site.example/ep/1', fetchImpl);
    expect(result.ok && result.lookup.candidates[0]?.url).toBe('https://site.example/11.mp4');
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

  it('turns a site that refuses a reader into a page a person can still open', async () => {
    // A site is allowed to turn away a reader that names itself, and
    // plenty do. The refusal still carries the headers that say whether
    // the page may be framed — and inside a frame each viewer arrives as
    // themselves, which is the whole point of that kind.
    const { fetchImpl } = web({ 'https://site.example/ep/1': { status: 403, body: 'no' } });
    expect(await lookupSource('https://site.example/ep/1', fetchImpl)).toMatchObject({
      ok: true,
      lookup: { candidates: [{ play: 'frame', url: 'https://site.example/ep/1' }] },
    });
  });

  it('says so plainly when the refusal closes that door too', async () => {
    const { fetchImpl } = web({
      'https://site.example/ep/1': { status: 403, body: 'no', headers: { 'x-frame-options': 'DENY' } },
    });
    expect(await lookupSource('https://site.example/ep/1', fetchImpl)).toEqual({
      ok: false,
      reason: 'refused',
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
