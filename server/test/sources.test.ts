import { describe, expect, it } from 'vitest';
import {
  SOURCE_LIMITS,
  candidateForUrl,
  candidatesFromHtml,
  embedToFollow,
  framingAllowed,
  isBlockedHost,
  looksPersonal,
  mediaPlayFor,
  normalizeSourceUrl,
  rankCandidates,
} from '../src/domain/sources.js';

const PAGE = 'https://example.com/watch/1';

describe('the link, before anything is fetched', () => {
  it('takes a bare host as https, the way a paste means it', () => {
    expect(normalizeSourceUrl('example.com/watch')).toBe('https://example.com/watch');
    expect(normalizeSourceUrl('  https://example.com/watch  ')).toBe('https://example.com/watch');
  });

  it('drops the fragment: it is the browser’s, never the fetcher’s', () => {
    expect(normalizeSourceUrl('https://example.com/watch#t=10')).toBe('https://example.com/watch');
  });

  it('refuses every scheme but http and https', () => {
    // These are the ones that would end up in an iframe src or a <video>.
    expect(normalizeSourceUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSourceUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeSourceUrl('blob:https://example.com/abc')).toBeNull();
    expect(normalizeSourceUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeSourceUrl('vbscript:msgbox')).toBeNull();
  });

  it('refuses credentials and odd ports — both are for talking a fetcher into something', () => {
    expect(normalizeSourceUrl('https://user:pass@example.com/')).toBeNull();
    expect(normalizeSourceUrl('https://example.com:8080/')).toBeNull();
    expect(normalizeSourceUrl('https://example.com:443/x')).toBe('https://example.com/x');
  });

  it('refuses a link long enough to be a payload', () => {
    expect(normalizeSourceUrl(`https://example.com/${'a'.repeat(SOURCE_LIMITS.maxUrlLength)}`)).toBeNull();
  });

  it('refuses what a room link must never reach', () => {
    for (const host of [
      'localhost',
      'app.local',
      'db.internal',
      'metadata.google.internal',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.4.4',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '[::1]',
      '[fd00::1]',
      '[fe80::1]',
      '[::ffff:127.0.0.1]',
    ]) {
      expect(isBlockedHost(host.replace(/^\[|\]$/g, '')), host).toBe(true);
      expect(normalizeSourceUrl(`https://${host}/video.mp4`), host).toBeNull();
    }
  });

  it('lets a public address through, literal or named', () => {
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(normalizeSourceUrl('https://8.8.8.8/a.mp4')).toBe('https://8.8.8.8/a.mp4');
  });

  it('refuses a single-label host: an intranet name, not a site', () => {
    expect(normalizeSourceUrl('https://intranet/video.mp4')).toBeNull();
  });
});

describe('what a link says about itself', () => {
  it('reads the play kind off the path', () => {
    expect(mediaPlayFor('https://cdn.example.com/a/b.mp4')).toBe('file');
    expect(mediaPlayFor('https://cdn.example.com/live/index.m3u8?x=1')).toBe('hls');
    expect(mediaPlayFor('https://cdn.example.com/s.mpd')).toBe('dash');
    expect(mediaPlayFor('https://example.com/watch')).toBeNull();
  });

  it('flags a link that was cut for one viewer', () => {
    // Straight from a real page: an episode signed with the watcher's own
    // address, which plays for whoever pasted it and 403s for the room.
    expect(looksPersonal('https://cdn.example.com/11.mp4?token=abc&expires=17&ip=203.0.113.4')).toBe(
      true,
    );
    expect(looksPersonal('https://cdn.example.com/11.mp4')).toBe(false);
  });

  it('knows a Twitch channel, video and clip apart', () => {
    expect(candidateForUrl('https://twitch.tv/gaules')).toMatchObject({
      play: 'twitch',
      twitch: { channel: 'gaules' },
      live: true,
    });
    expect(candidateForUrl('https://www.twitch.tv/videos/123456')).toMatchObject({
      play: 'twitch',
      twitch: { video: '123456' },
    });
    expect(candidateForUrl('https://www.twitch.tv/gaules/clip/FunnyMoment-abc')).toMatchObject({
      twitch: { clip: 'FunnyMoment-abc' },
    });
    expect(candidateForUrl('https://clips.twitch.tv/FunnyMoment-abc')).toMatchObject({
      twitch: { clip: 'FunnyMoment-abc' },
    });
    expect(candidateForUrl('https://player.twitch.tv/?channel=gaules&parent=x')).toMatchObject({
      twitch: { channel: 'gaules' },
    });
  });

  it('does not mistake Twitch’s own furniture for a channel', () => {
    expect(candidateForUrl('https://twitch.tv/directory')).toBeNull();
    expect(candidateForUrl('https://twitch.tv/settings')).toBeNull();
  });

  it('takes a media link as itself, with the file name as the label', () => {
    expect(candidateForUrl('https://cdn.example.com/films/Trailer%20HD.mp4')).toMatchObject({
      play: 'file',
      found: 'link',
      label: 'Trailer HD.mp4',
    });
  });

  it('has nothing to say about an ordinary page', () => {
    expect(candidateForUrl('https://example.com/watch/1')).toBeNull();
  });
});

describe('whether a page may be framed', () => {
  it('believes the two headers that decide it', () => {
    expect(framingAllowed(null, null)).toBe(true);
    expect(framingAllowed('DENY', null)).toBe(false);
    expect(framingAllowed('SAMEORIGIN', null)).toBe(false);
    expect(framingAllowed(null, "frame-ancestors 'none'")).toBe(false);
    expect(framingAllowed(null, 'frame-ancestors https://friend.example')).toBe(false);
    expect(framingAllowed(null, 'default-src *; frame-ancestors *')).toBe(true);
    expect(framingAllowed(null, 'default-src *')).toBe(true);
  });
});

describe('reading a page', () => {
  it('takes the preview tags every chat app already reads', () => {
    const html = `
      <meta property="og:title" content="Episode 11">
      <meta property="og:image" content="/still.jpg">
      <meta property="og:video:secure_url" content="https://cdn.example.com/11.mp4">
    `;
    const [first] = candidatesFromHtml(html, PAGE);
    expect(first).toMatchObject({
      play: 'file',
      url: 'https://cdn.example.com/11.mp4',
      found: 'meta',
      title: 'Episode 11',
      poster: 'https://example.com/still.jpg',
    });
  });

  it('reads schema.org, including that it is a broadcast', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: 'The stream',
      isLiveBroadcast: true,
      contentUrl: 'https://cdn.example.com/live/index.m3u8',
      thumbnailUrl: 'https://example.com/t.jpg',
    })}</script>`;
    expect(candidatesFromHtml(html, PAGE)[0]).toMatchObject({
      play: 'hls',
      found: 'schema',
      live: true,
      title: 'The stream',
      poster: 'https://example.com/t.jpg',
    });
  });

  it('reads the elements, and keeps the quality each one was labelled with', () => {
    const html = `
      <video poster="/p.jpg" data-src="https://cdn.example.com/hd/11.mp4"></video>
      <video controls>
        <source src="https://cdn.example.com/720/11.mp4" type="video/mp4" label="720p">
        <source src="https://cdn.example.com/360/11.mp4" type="video/mp4" size="360">
      </video>
      <picture><source src="https://example.com/a.webp" type="image/webp"></picture>
    `;
    const found = candidatesFromHtml(html, PAGE);
    expect(found.map((candidate) => candidate.url)).toEqual([
      'https://cdn.example.com/hd/11.mp4',
      'https://cdn.example.com/720/11.mp4',
      'https://cdn.example.com/360/11.mp4',
    ]);
    expect(found.find((c) => c.url.includes('/720/'))?.label).toBe('720p');
    expect(found.find((c) => c.url.includes('/360/'))?.label).toBe('360p');
    // The <picture> source is not a video and was never offered.
    expect(found.some((candidate) => candidate.url.endsWith('.webp'))).toBe(false);
  });

  it('finds the player’s configuration, escaped slashes and all', () => {
    // How a real page carries it: JSON inside a script, `/` written `\/`.
    const html = `<script>var p = {"data":[{"src":"https:\\/\\/cdn.example.com\\/sd\\/11.mp4?token=a&expires=1&ip=203.0.113.4","label":"360p"}]};</script>`;
    const [candidate] = candidatesFromHtml(html, PAGE);
    expect(candidate).toMatchObject({
      play: 'file',
      url: 'https://cdn.example.com/sd/11.mp4?token=a&expires=1&ip=203.0.113.4',
      found: 'script',
      personal: true,
    });
  });

  it('offers somebody else’s player as a frame, and ours as itself', () => {
    const html = `
      <iframe src="https://www.blogger.com/video.g?token=AD6v5d" title="Player 1"></iframe>
      <iframe src="https://player.twitch.tv/?channel=gaules&amp;parent=x"></iframe>
    `;
    const found = candidatesFromHtml(html, PAGE);
    expect(found.find((c) => c.play === 'twitch')).toMatchObject({
      twitch: { channel: 'gaules' },
    });
    expect(found.find((c) => c.play === 'frame')).toMatchObject({
      url: 'https://www.blogger.com/video.g?token=AD6v5d',
      found: 'embed',
      title: 'Player 1',
    });
  });

  it('decodes entities before it believes a URL', () => {
    const html = `<meta property="og:video" content="https://cdn.example.com/a.mp4?x=1&amp;y=2">`;
    expect(candidatesFromHtml(html, PAGE)[0]?.url).toBe('https://cdn.example.com/a.mp4?x=1&y=2');
  });

  it('resolves a relative source against the page it came from', () => {
    const html = `<video src="/media/11.mp4"></video>`;
    expect(candidatesFromHtml(html, PAGE)[0]?.url).toBe('https://example.com/media/11.mp4');
  });

  it('refuses what a hostile page would like us to hand the room', () => {
    const html = `
      <meta property="og:video" content="javascript:alert(1)">
      <iframe src="data:text/html,<script>alert(1)</script>"></iframe>
      <video src="http://127.0.0.1:8080/secret.mp4"></video>
      <source src="https://192.168.0.1/a.mp4" type="video/mp4">
    `;
    expect(candidatesFromHtml(html, PAGE)).toEqual([]);
  });

  it('puts a real player ahead of a guess, and never repeats itself', () => {
    const html = `
      <script>var f = "https://cdn.example.com/11.mp4";</script>
      <meta property="og:video" content="https://cdn.example.com/11.mp4">
      <iframe src="https://embed.example.net/p/1"></iframe>
    `;
    const found = candidatesFromHtml(html, PAGE);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ url: 'https://cdn.example.com/11.mp4', found: 'meta' });
    expect(found[1]?.play).toBe('frame');
  });

  it('asks nobody to choose between more than a dozen things', () => {
    const html = Array.from(
      { length: 30 },
      (_, index) => `<source src="https://cdn.example.com/${index}.mp4" type="video/mp4">`,
    ).join('');
    expect(candidatesFromHtml(html, PAGE)).toHaveLength(SOURCE_LIMITS.maxCandidates);
  });

  it('tells two copies of the same episode apart by what the site calls them', () => {
    // The real shape: one URL per quality, no numbers anywhere, and a
    // label sitting beside each in the player's configuration.
    const html = `<script>{"data":[{"src":"https:\\/\\/cdn.example.com\\/sd\\/11.mp4","label":"360p"},{"src":"https:\\/\\/cdn.example.com\\/hd\\/11.mp4","label":"720p"}]}</script>`;
    expect(candidatesFromHtml(html, PAGE).map((candidate) => candidate.label)).toEqual([
      '360p',
      '720p',
    ]);
  });

  it('falls back to the tier in the path when nothing else names it', () => {
    const html = `<source src="https://cdn.example.com/sd/11.mp4" type="video/mp4">
      <source src="https://cdn.example.com/fullhd/11.mp4" type="video/mp4">`;
    expect(candidatesFromHtml(html, PAGE).map((candidate) => candidate.label)).toEqual([
      'SD',
      'Full HD',
    ]);
  });

  it('does not offer the login box, the consent frame or the ad slot', () => {
    const html = `
      <iframe src="https://accounts.google.com/ServiceLogin?service=youtube"></iframe>
      <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-1"></iframe>
      <iframe src="https://player.example.net/e/abc"></iframe>
    `;
    expect(candidatesFromHtml(html, PAGE).map((candidate) => candidate.url)).toEqual([
      'https://player.example.net/e/abc',
    ]);
  });

  it('warns about a signed link only where the signature is handed to a player', () => {
    const html = `
      <video src="https://cdn.example.com/11.mp4?token=a&amp;ip=203.0.113.4"></video>
      <iframe src="https://player.example.net/e?token=abc"></iframe>
    `;
    const found = candidatesFromHtml(html, PAGE);
    expect(found.find((candidate) => candidate.play === 'file')?.personal).toBe(true);
    // A frame is a page, opened by each browser in its own name — the
    // token in it is nobody's problem.
    expect(found.find((candidate) => candidate.play === 'frame')?.personal).toBeUndefined();
  });

  it('finds nothing in a page that has nothing', () => {
    expect(candidatesFromHtml('<h1>Hello</h1><img src="/a.png">', PAGE)).toEqual([]);
  });
});

describe('the second look', () => {
  it('follows the embed when the page itself gave up nothing playable', () => {
    const candidates = candidatesFromHtml(
      '<iframe src="https://embed.example.net/p/1"></iframe>',
      PAGE,
    );
    expect(embedToFollow(candidates, PAGE)).toBe('https://embed.example.net/p/1');
  });

  it('does not follow anything once something plays', () => {
    const candidates = candidatesFromHtml(
      '<video src="https://cdn.example.com/11.mp4"></video><iframe src="https://embed.example.net/p/1"></iframe>',
      PAGE,
    );
    expect(embedToFollow(candidates, PAGE)).toBeNull();
  });

  it('does not follow the page back into itself', () => {
    const candidates = candidatesFromHtml(`<iframe src="${PAGE}"></iframe>`, PAGE);
    expect(embedToFollow(candidates, PAGE)).toBeNull();
  });
});

describe('the order a person is offered', () => {
  it('puts a shared clock first and a frame last', () => {
    const ranked = rankCandidates([
      { play: 'frame', url: 'https://a.example/1', found: 'embed' },
      { play: 'twitch', url: 'https://twitch.tv/x', found: 'link' },
      { play: 'hls', url: 'https://a.example/s.m3u8', found: 'script' },
    ]);
    expect(ranked.map((candidate) => candidate.play)).toEqual(['hls', 'twitch', 'frame']);
  });
});
