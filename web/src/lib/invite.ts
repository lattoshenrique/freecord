/**
 * Recognizes an invite link pasted as text.
 *
 * "The link is the invite" — but the desktop app has no address bar to paste
 * it into, so the home field accepts it instead. Only a `/r/<slug>` path
 * counts as an invite: a bare slug is indistinguishable from a room *name*
 * (`reuniao-do-time` is a valid name and a valid-looking slug), and guessing
 * wrong would silently send someone to a room that does not exist.
 */

export interface ParsedInvite {
  slug: string;
  /** The link's fragment, carried verbatim so the chat key survives. */
  hash: string;
  /** Optional preview from an older named link. New links resolve it by slug. */
  roomName: string | null;
}

/** Slugs are 9 random bytes as base64url (12 chars); accept a generous range. */
const SLUG_PATH = /^\/r\/([A-Za-z0-9_-]{8,64})\/?$/;
/** 32 random bytes are exactly 43 base64url characters. */
const ROOM_KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const ROOM_NAME_MAX_LENGTH = 60;

function toUrl(text: string): URL | null {
  // A pasted invite arrives in three shapes: with the scheme, without it
  // (`host/r/slug`), or as a bare path (`/r/slug`). Normalize to a full URL —
  // the host is irrelevant, only path and fragment are read.
  const candidate = /^https?:\/\//i.test(text)
    ? text
    : text.startsWith('/')
      ? `https://invite.invalid${text}`
      : `https://${text}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/** The room path an invite navigates to, or null when the text is not one. */
export function parseInvite(text: string): ParsedInvite | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }
  const url = toUrl(trimmed);
  const slug = url?.pathname.match(SLUG_PATH)?.[1];
  if (!url || !slug) {
    return null;
  }
  const encodedName = new URLSearchParams(url.hash.slice(1)).get('n');
  const roomName = encodedName?.trim().slice(0, ROOM_NAME_MAX_LENGTH) || null;
  return { slug, hash: url.hash, roomName };
}

/**
 * The shortest lossless form of an invitation fragment. A random 256-bit key
 * cannot be compressed, but its parameter name can disappear. Named links
 * from older clients collapse too; unknown parameters survive for forwards
 * compatibility rather than being discarded by a client that predates them.
 */
export function compactInviteHash(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (ROOM_KEY_SHAPE.test(raw)) {
    return `#${raw}`;
  }

  const params = new URLSearchParams(raw);
  const key = params.get('k');
  const knownParameters = [...params.keys()].every((name) => name === 'k' || name === 'n');
  if (key && ROOM_KEY_SHAPE.test(key) && knownParameters) {
    return `#${key}`;
  }

  // Even a keyless or future-shaped link no longer needs the old name copy:
  // the home can resolve the authoritative name from the public room slug.
  params.delete('n');
  const encoded = params.toString();
  return encoded ? `#${encoded}` : '';
}

/** Returns the compact form of a complete invitation URL. */
export function compactInviteUrl(inviteUrl: string): string {
  const url = new URL(inviteUrl);
  url.hash = compactInviteHash(url.hash);
  return url.href;
}

/**
 * Text that was clearly *meant* as an invite but did not parse — a truncated
 * paste, usually. Creating a room named after a broken link would lose the
 * user's intent, so the caller shows an error instead.
 */
export function looksLikeInvite(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.includes('/r/');
}
