/**
 * End-to-end chat encryption.
 *
 * The room key is a random AES-GCM-256 key that travels in the invite
 * link's fragment (#k=…) — browsers never send the fragment over the
 * network, so the server only ever relays sealed envelopes it cannot
 * read. Media needs none of this: WebRTC already encrypts peer-to-peer
 * (DTLS-SRTP).
 *
 * A message without a key (a pre-key room, or a link that lost its
 * fragment) still flows as plaintext; an envelope received without the
 * key renders as a locked placeholder instead of garbage.
 */

/** Sealed envelope on the wire: `e2e:<iv base64url>.<ciphertext base64url>`. */
const ENVELOPE = /^e2e:([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/;

const KEY_BYTES = 32;
const IV_BYTES = 12;

/** What an incoming wire payload opened into. */
export interface OpenedChat {
  text: string;
  /** Sealed for a key this client does not hold (or holds wrong). */
  unreadable: boolean;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) {
    bin += String.fromCharCode(byte);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): Uint8Array | null {
  try {
    const bin = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** WebCrypto only exists in secure contexts (https, localhost). */
function subtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
}

/**
 * A fresh room key, encoded for the URL fragment. Null when the page
 * cannot encrypt (insecure context): a key nobody can use would only
 * make the room's chat unreadable to its own creator.
 */
export function generateRoomKey(): string | null {
  if (!subtle()) {
    return null;
  }
  return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

/** Extracts the room key from a location hash (`#k=…`), if one is there. */
export function roomKeyFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const key = params.get('k');
  return key && ENVELOPE_KEY_SHAPE.test(key) ? key : null;
}

/** 32 bytes of base64url are exactly 43 chars. */
const ENVELOPE_KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export async function importRoomKey(encoded: string): Promise<CryptoKey | null> {
  const api = subtle();
  const raw = fromBase64Url(encoded);
  if (!api || !raw || raw.byteLength !== KEY_BYTES) {
    return null;
  }
  try {
    return await api.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    return null;
  }
}

export async function sealChat(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await subtle()!.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text),
  );
  return `e2e:${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function openChat(key: CryptoKey | null, wire: string): Promise<OpenedChat> {
  const match = ENVELOPE.exec(wire);
  if (!match) {
    // Plaintext from a keyless or pre-key participant.
    return { text: wire, unreadable: false };
  }
  const api = subtle();
  const iv = fromBase64Url(match[1]!);
  const ciphertext = fromBase64Url(match[2]!);
  if (!key || !api || !iv || !ciphertext) {
    return { text: '', unreadable: true };
  }
  try {
    const plain = await api.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return { text: new TextDecoder().decode(plain), unreadable: false };
  } catch {
    // Wrong key, or an envelope mangled in transit: GCM refuses to lie.
    return { text: '', unreadable: true };
  }
}
