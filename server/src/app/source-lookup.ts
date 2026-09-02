/**
 * Opening a page on somebody's behalf, once, to see what is playable in it.
 *
 * This is the only thing in the product where the server touches a
 * stranger's URL, so the shape of it is deliberate:
 *
 * - It reads MARKUP, never media. The page's own preview tags, its
 *   `<video>`, its player's configuration — the same bytes a chat app
 *   reads to draw a link preview. The video itself is fetched by each
 *   browser from wherever it lives, exactly as the YouTube tool does, and
 *   never through us. Proxying media would make one of this project's
 *   loudest promises false, and would turn a watch-together feature into
 *   a way around other people's access control.
 * - It keeps nothing. No log line with the URL in it, no cache, no
 *   per-room anything. The answer goes back on the same request and the
 *   edge forgets it happened.
 * - It is answerable to whoever it might be pointed at. A URL a guest
 *   typed is a request-forgery surface by definition, so the host is
 *   checked before the first fetch AND after every redirect, the scheme
 *   is http(s) only, the ports are the two that serve pages, the read is
 *   capped, and the whole thing is on a stopwatch.
 *
 * The parsing is in domain/sources.ts and has no idea any of this exists.
 *
 * One note on where the guard earns its keep. In production this runs on
 * the Worker, which reaches the open internet from Cloudflare's edge with
 * no private network of ours behind it, so the host blocklist is a belt
 * beside braces. But this repository still ships a Dockerfile and a Node
 * edge, and that path has been deployed for real (docs/architecture.md);
 * inside a cloud VPC, 169.254.169.254 is not a curiosity, it is the
 * metadata service. On that deployment the blocklist and the hand-walked
 * redirects are the only thing standing there.
 */
import {
  SOURCE_LIMITS,
  type SourceLookup,
  type VideoCandidate,
  candidateForUrl,
  candidatesFromHtml,
  embedToFollow,
  framingAllowed,
  normalizeSourceUrl,
  rankCandidates,
} from '../domain/sources.js';

export const LOOKUP_LIMITS = {
  /** One page, and at most one player page inside it. */
  maxPages: 2,
  /** Redirects followed per page, each re-checked as if freshly typed. */
  maxRedirects: 3,
  /** How long one request may take. */
  timeoutMs: 6_000,
  /** A page bigger than this is not a page we need to finish reading. */
  maxBytes: SOURCE_LIMITS.maxHtmlBytes,
} as const;

/**
 * Who we say we are. A reader that names itself can be refused on
 * purpose by a site that wants to be — which is the site's call to make,
 * and dressing up as somebody's Chrome to take it away from them is not
 * a thing this repository does.
 */
const USER_AGENT = 'FreecordLinkReader/1.0 (+https://github.com/lattoshenrique/freecord)';

export type LookupFailure =
  /** Not a link we will open at all (scheme, port, host, length). */
  | 'invalid_url'
  /** It did not answer, answered badly, was far too big, or took too long. */
  | 'unreachable';

export type LookupResult = { ok: true; lookup: SourceLookup } | { ok: false; reason: LookupFailure };

/** Just enough of `fetch` to be swapped in a test. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface Fetched {
  url: string;
  html: string;
  framable: boolean;
  contentType: string;
}

/** One GET, its redirects walked by hand so each hop is checked again. */
async function readPage(url: string, fetchImpl: FetchLike): Promise<Fetched | null> {
  let target = url;
  for (let hop = 0; hop <= LOOKUP_LIMITS.maxRedirects; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(target, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.5',
          'Accept-Language': '*',
        },
        signal: AbortSignal.timeout(LOOKUP_LIMITS.timeoutMs),
      });
    } catch {
      return null; // refused, timed out, DNS, TLS: all the same to us
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      // A redirect is a fresh URL from a stranger, and gets the same
      // treatment the typed one got — this is where an open redirect
      // would otherwise walk us into somewhere private.
      const next = location ? normalizeSourceUrl(new URL(location, target).toString()) : null;
      if (!next) {
        return null;
      }
      target = next;
      continue;
    }
    if (!response.ok) {
      return null;
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const framable = framingAllowed(
      response.headers.get('x-frame-options'),
      response.headers.get('content-security-policy'),
    );
    if (!/html|xml|json|text\/plain/.test(contentType)) {
      // Not a page. It may still be the video itself — a link with no
      // extension whose server says `video/mp4` is a perfectly good
      // source, and the caller decides that from the type.
      return { url: target, html: '', framable, contentType };
    }
    const html = await readCapped(response);
    return html === null
      ? null
      : { url: target, html, framable, contentType };
  }
  return null; // went round in circles
}

/**
 * The first couple of megabytes and not a byte more. A page that keeps
 * talking is cut off mid-sentence, which is fine: everything worth
 * reading is in the head and the player's markup.
 */
async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > LOOKUP_LIMITS.maxBytes * 4) {
    return null;
  }
  const body = response.body;
  if (!body) {
    return '';
  }
  const reader = body.getReader();
  // Bare, not configured: the Worker's TextDecoder types demand the whole
  // option bag, and the defaults (utf-8, replacement characters over
  // throwing) are exactly what a page of unknown encoding wants.
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      read += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
      if (read >= LOOKUP_LIMITS.maxBytes) {
        break;
      }
    }
  } catch {
    return chunks.length > 0 ? chunks.join('') : null;
  } finally {
    // Stop the download the moment we have what we came for.
    await reader.cancel().catch(() => undefined);
  }
  return chunks.join('');
}

/** A response that turned out to be the media itself. */
function candidateFromType(url: string, contentType: string): VideoCandidate | null {
  if (/^(video|audio)\//.test(contentType)) {
    return { play: 'file', url, found: 'link' };
  }
  if (/mpegurl/.test(contentType)) {
    return { play: 'hls', url, found: 'link' };
  }
  if (/dash\+xml/.test(contentType)) {
    return { play: 'dash', url, found: 'link' };
  }
  return null;
}

/**
 * What the room could watch, for a link somebody pasted.
 *
 * A link that is already a video — a file, a Twitch channel — is
 * answered without opening anything at all: there is nothing to learn
 * and no reason to make a request in somebody's name.
 */
export async function lookupSource(
  input: string,
  fetchImpl: FetchLike = fetch,
): Promise<LookupResult> {
  const url = normalizeSourceUrl(input);
  if (!url) {
    return { ok: false, reason: 'invalid_url' };
  }

  const direct = candidateForUrl(url);
  if (direct) {
    return { ok: true, lookup: { url, candidates: [direct], empty: false } };
  }

  const page = await readPage(url, fetchImpl);
  if (!page) {
    return { ok: false, reason: 'unreachable' };
  }

  const typed = candidateFromType(page.url, page.contentType);
  if (typed) {
    return { ok: true, lookup: { url: page.url, candidates: [typed], empty: false } };
  }

  const candidates = candidatesFromHtml(page.html, page.url);

  // A player that lives one page further in. Very common, and the reason
  // a page can look empty while its video is right there.
  const embed = embedToFollow(candidates, page.url);
  if (embed) {
    const inner = await readPage(embed, fetchImpl);
    if (inner) {
      const innerTyped = candidateFromType(inner.url, inner.contentType);
      const found = innerTyped ? [innerTyped] : candidatesFromHtml(inner.html, inner.url);
      const host = new URL(embed).hostname.replace(/^www\./, '');
      for (const candidate of found) {
        candidates.push({ ...candidate, via: host });
      }
      // Now we know whether that player may be framed, which decides
      // whether offering it is a picture or an empty rectangle.
      for (const candidate of candidates) {
        if (candidate.url === embed) {
          candidate.framable = inner.framable;
        }
      }
    }
  }

  /*
   * The page itself, last and almost always: whatever else was found,
   * the room can always be shown the page the person was watching. It is
   * the only thing that works on a site whose player is built by a click
   * — each viewer clicks in their own frame, with their own session and
   * their own address, which is exactly what a link signed for one
   * viewer needs. What it cannot give is a shared clock, and the tool
   * says so rather than pretending.
   */
  if (page.framable && !candidates.some((candidate) => candidate.url === page.url)) {
    candidates.push({ play: 'frame', url: page.url, found: 'link', framable: true });
  }

  // Ranked once more at the end: what came back from the second page has
  // to take its place among what the first one offered, and a frame we
  // now know is refused is not an option at all.
  const offered = rankCandidates(
    candidates.filter((candidate) => candidate.play !== 'frame' || candidate.framable !== false),
  );

  return {
    ok: true,
    lookup: {
      url: page.url,
      title: candidates.find((candidate) => candidate.title)?.title,
      candidates: offered,
      empty: offered.length === 0,
    },
  };
}
