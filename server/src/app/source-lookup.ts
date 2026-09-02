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
  providerEmbedFor,
  rankCandidates,
} from '../domain/sources.js';

export const LOOKUP_LIMITS = {
  /** One page, and at most one player page inside it. */
  maxPages: 2,
  /** Redirects followed per page, each re-checked as if freshly typed. */
  maxRedirects: 3,
  /** How long one request may take. */
  timeoutMs: 6_000,
  /**
   * How long the whole lookup may take, however it spends it. Without
   * this, a page that redirects three times and then embeds a player
   * that redirects three more could hold somebody's shelf for half a
   * minute, one honest six-second wait at a time.
   */
  totalMs: 14_000,
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
  /** It did not answer, was far too big, or took too long. */
  | 'unreachable'
  /**
   * It answered, and the answer was no. A site is allowed to refuse a
   * reader that names itself, and plenty do — which is a different thing
   * from being unreachable, and has a different way out: the page can
   * still be shown to the room as a frame, where each viewer arrives as
   * themselves.
   */
  | 'refused';

export type LookupResult = { ok: true; lookup: SourceLookup } | { ok: false; reason: LookupFailure };

/** Just enough of `fetch` to be swapped in a test. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface Fetched {
  url: string;
  html: string;
  framable: boolean;
  contentType: string;
  /** The site answered with something other than "here you go". */
  refused: boolean;
}

/** One GET, its redirects walked by hand so each hop is checked again. */
async function readPage(url: string, fetchImpl: FetchLike, deadline: number): Promise<Fetched | null> {
  let target = url;
  for (let hop = 0; hop <= LOOKUP_LIMITS.maxRedirects; hop += 1) {
    // Whatever is left of the whole lookup, and never more than one
    // request's share of it.
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return null;
    }
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
        signal: AbortSignal.timeout(Math.min(LOOKUP_LIMITS.timeoutMs, remaining)),
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
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    const framable = framingAllowed(
      response.headers.get('x-frame-options'),
      response.headers.get('content-security-policy'),
    );
    if (!response.ok) {
      // A refusal is still an answer, and it still carries the two
      // headers that say whether the page may be framed. That is worth
      // keeping: a site that turns a reader away at the door will often
      // let a person in, and the frame is how a person goes in.
      return { url: target, html: '', framable, contentType, refused: true };
    }
    if (!/html|xml|json|text\/plain/.test(contentType)) {
      // Not a page. It may still be the video itself — a link with no
      // extension whose server says `video/mp4` is a perfectly good
      // source, and the caller decides that from the type.
      return { url: target, html: '', framable, contentType, refused: false };
    }
    const html = await readCapped(response, contentType);
    return html === null
      ? null
      : { url: target, html, framable, contentType, refused: false };
  }
  return null; // went round in circles
}

/**
 * The first couple of megabytes and not a byte more. A page that keeps
 * talking is cut off mid-sentence, which is fine: everything worth
 * reading is in the head and the player's markup.
 *
 * The bytes are kept as bytes and decoded once at the end, for two
 * reasons. A chunk boundary can fall in the middle of a character, and
 * plenty of the web is still not UTF-8 — a page in windows-1252 decoded
 * as UTF-8 gives a title with a row of replacement characters in it,
 * which is then what the room reads on the stage.
 */
async function readCapped(response: Response, contentType: string): Promise<string | null> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > LOOKUP_LIMITS.maxBytes * 4) {
    return null;
  }
  const body = response.body;
  if (!body) {
    return '';
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }
      chunks.push(value);
      read += value.byteLength;
      if (read >= LOOKUP_LIMITS.maxBytes) {
        break;
      }
    }
  } catch {
    if (chunks.length === 0) {
      return null;
    }
  } finally {
    // Stop the download the moment we have what we came for.
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(read);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return decodeHtml(bytes, contentType);
}

const CHARSET = /charset\s*=\s*["']?([a-z0-9_-]{2,20})/i;

/**
 * The page's own idea of its encoding: the header first, then the `<meta>`
 * that says so — which survives a UTF-8 reading whatever the page really
 * is, because it is ASCII either way. An encoding this runtime does not
 * know falls back rather than throwing; a mangled title is a worse
 * answer than no answer only when it is the only answer.
 */
function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const utf8 = new TextDecoder().decode(bytes);
  const label = (
    CHARSET.exec(contentType)?.[1] ??
    CHARSET.exec(utf8.slice(0, 4096))?.[1] ??
    'utf-8'
  ).toLowerCase();
  if (label === 'utf-8' || label === 'utf8' || label === 'ascii' || label === 'us-ascii') {
    return utf8;
  }
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return utf8; // a runtime that ships only UTF-8 (some edges do)
  }
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

  const deadline = Date.now() + LOOKUP_LIMITS.totalMs;
  const page = await readPage(url, fetchImpl, deadline);
  if (!page) {
    return { ok: false, reason: 'unreachable' };
  }

  if (page.refused) {
    // Nothing to read, but the door may still open for a person.
    return page.framable
      ? {
          ok: true,
          lookup: {
            url: page.url,
            candidates: [{ play: 'frame', url: page.url, found: 'link', framable: true }],
            empty: false,
          },
        }
      : { ok: false, reason: 'refused' };
  }

  const typed = candidateFromType(page.url, page.contentType);
  if (typed) {
    return { ok: true, lookup: { url: page.url, candidates: [typed], empty: false } };
  }

  const candidates = candidatesFromHtml(page.html, page.url);
  // The player a big platform hands out for its own pages, alongside
  // whatever the page itself gave up.
  const embed = providerEmbedFor(page.url);
  if (embed && !candidates.some((candidate) => candidate.url === embed.url)) {
    candidates.push(embed);
  }

  // A player that lives one page further in. Very common, and the reason
  // a page can look empty while its video is right there.
  const nested = embedToFollow(candidates, page.url);
  if (nested) {
    const inner = await readPage(nested, fetchImpl, deadline);
    if (inner) {
      const innerTyped = candidateFromType(inner.url, inner.contentType);
      const found = innerTyped ? [innerTyped] : candidatesFromHtml(inner.html, inner.url);
      const host = new URL(nested).hostname.replace(/^www\./, '');
      for (const candidate of found) {
        candidates.push({ ...candidate, via: host });
      }
      // Now we know whether that player may be framed, which decides
      // whether offering it is a picture or an empty rectangle.
      for (const candidate of candidates) {
        if (candidate.url === nested) {
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
   *
   * It gets a slot RESERVED rather than a place in the queue: it sorts
   * last by design, so a page generous enough to offer a dozen files
   * would have pushed the one option that always works off the end of
   * the list.
   */
  const pageFrame: VideoCandidate | null =
    page.framable && !candidates.some((candidate) => candidate.url === page.url)
      ? { play: 'frame', url: page.url, found: 'link', framable: true }
      : null;

  // Ranked once more at the end: what came back from the second page has
  // to take its place among what the first one offered, and a frame we
  // now know is refused is not an option at all.
  const ranked = rankCandidates(
    candidates.filter((candidate) => candidate.play !== 'frame' || candidate.framable !== false),
  );
  const offered = pageFrame
    ? [...ranked.slice(0, SOURCE_LIMITS.maxCandidates - 1), pageFrame]
    : ranked;

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
