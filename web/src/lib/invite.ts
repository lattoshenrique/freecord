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
  /** Optional preview carried by the invite, decoded entirely on the client. */
  roomName: string | null;
}

/** Slugs are 9 random bytes as base64url (12 chars); accept a generous range. */
const SLUG_PATH = /^\/r\/([A-Za-z0-9_-]{8,64})\/?$/;
/** 32 random bytes are exactly 43 base64url characters. */
const ROOM_KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;
/** `~` cannot occur in base64url, so it separates the key from the name. */
const COMPACT_FRAGMENT = /^([A-Za-z0-9_-]{43})(?:~([A-Za-z0-9_-]+))?$/;
const ROOM_NAME_MAX_LENGTH = 60;

function encodeRoomName(roomName: string): string {
  const bytes = new TextEncoder().encode(roomName);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeRoomName(encoded: string): string | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(`${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function normalizedRoomName(roomName: string | null | undefined): string | null {
  return roomName?.trim().slice(0, ROOM_NAME_MAX_LENGTH) || null;
}

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
  const rawHash = url.hash.slice(1);
  const compact = rawHash.match(COMPACT_FRAGMENT);
  const legacyName = compact ? null : new URLSearchParams(rawHash).get('n');
  const roomName = normalizedRoomName(
    compact?.[2] ? decodeRoomName(compact[2]) : legacyName,
  );
  return { slug, hash: url.hash, roomName };
}

/**
 * The compact invitation fragment is `<key>~<base64url UTF-8 name>`. A random
 * 256-bit key cannot be compressed, but parameter names and percent encoding
 * can disappear. Carrying the name makes a pasted invitation resolve locally
 * and immediately, without making the home wait for a metadata request.
 * Unknown parameters survive for forwards compatibility.
 */
export function compactInviteHash(hash: string, roomName?: string | null): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const compact = raw.match(COMPACT_FRAGMENT);
  if (compact) {
    const name = normalizedRoomName(
      roomName === undefined
        ? compact[2]
          ? decodeRoomName(compact[2])
          : null
        : roomName,
    );
    return `#${compact[1]}${name ? `~${encodeRoomName(name)}` : ''}`;
  }

  const params = new URLSearchParams(raw);
  const key = params.get('k');
  const knownParameters = [...params.keys()].every((name) => name === 'k' || name === 'n');
  if (key && ROOM_KEY_SHAPE.test(key) && knownParameters) {
    const name = normalizedRoomName(roomName === undefined ? params.get('n') : roomName);
    return `#${key}${name ? `~${encodeRoomName(name)}` : ''}`;
  }

  // A future-shaped fragment stays future-shaped. When a current room name
  // is available, refresh its legacy field without touching unknown fields.
  if (roomName !== undefined && raw) {
    const name = normalizedRoomName(roomName);
    if (name) {
      params.set('n', name);
    } else {
      params.delete('n');
    }
  }
  const encoded = params.toString();
  return encoded ? `#${encoded}` : '';
}

/** Returns the compact form of a complete invitation URL. */
export function compactInviteUrl(inviteUrl: string, roomName?: string | null): string {
  const url = new URL(inviteUrl);
  url.hash = compactInviteHash(url.hash, roomName);
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
