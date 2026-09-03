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
  /** The link's fragment (`#k=…`), carried verbatim so the chat key survives. */
  hash: string;
  /** Optional room name carried in the fragment for a useful paste preview. */
  roomName: string | null;
}

/** Slugs are 9 random bytes as base64url (12 chars); accept a generous range. */
const SLUG_PATH = /^\/r\/([A-Za-z0-9_-]{8,64})\/?$/;
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
 * Adds the room's public name to an invite fragment without disturbing its
 * chat key. The fragment is deliberate: browsers do not send it in HTTP
 * requests, and old clients already preserve it as an opaque part of a link.
 */
export function inviteHashWithRoomName(hash: string, displayName: string): string {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const roomName = displayName.trim().slice(0, ROOM_NAME_MAX_LENGTH);
  if (roomName) {
    params.set('n', roomName);
  } else {
    params.delete('n');
  }
  const encoded = params.toString();
  return encoded ? `#${encoded}` : '';
}

/** Returns a full invitation URL whose fragment previews the current name. */
export function inviteUrlWithRoomName(inviteUrl: string, displayName: string): string {
  const url = new URL(inviteUrl);
  url.hash = inviteHashWithRoomName(url.hash, displayName);
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
