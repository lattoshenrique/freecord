import { describe, expect, it } from 'vitest';
import {
  generateRoomKey,
  importRoomKey,
  openChat,
  roomKeyFromHash,
  sealChat,
} from '../src/lib/chat-crypto';

/** Mirror of ROOM_LIMITS.chatEnvelopeMaxLength (server/src/domain/room.ts). */
const ENVELOPE_WIRE_CAP = 2800;

async function keyPair() {
  const encoded = generateRoomKey()!;
  const key = (await importRoomKey(encoded))!;
  return { encoded, key };
}

describe('chat-crypto', () => {
  it('seals and opens a message round-trip', async () => {
    const { key } = await keyPair();
    const sealed = await sealChat(key, 'olá **mundo** 👋');
    expect(sealed).toMatch(/^e2e:[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(await openChat(key, sealed)).toEqual({ text: 'olá **mundo** 👋', unreadable: false });
  });

  it('a wrong key opens to unreadable, never to garbage', async () => {
    const { key } = await keyPair();
    const { key: other } = await keyPair();
    const sealed = await sealChat(key, 'secret');
    expect(await openChat(other, sealed)).toEqual({ text: '', unreadable: true });
  });

  it('an envelope without any key is unreadable', async () => {
    const { key } = await keyPair();
    const sealed = await sealChat(key, 'secret');
    expect(await openChat(null, sealed)).toEqual({ text: '', unreadable: true });
  });

  it('plaintext passes through, with or without a key', async () => {
    const { key } = await keyPair();
    expect(await openChat(null, 'plain hi')).toEqual({ text: 'plain hi', unreadable: false });
    expect(await openChat(key, 'plain hi')).toEqual({ text: 'plain hi', unreadable: false });
  });

  it('a mangled envelope is unreadable, not an exception', async () => {
    const { key } = await keyPair();
    const sealed = await sealChat(key, 'secret');
    expect(await openChat(key, sealed.slice(0, -4))).toEqual({ text: '', unreadable: true });
  });

  it('the worst-case 500-char plaintext seals under the wire cap', async () => {
    const { key } = await keyPair();
    // U+FFFF is 3 bytes of UTF-8 per UTF-16 unit — the densest a
    // composer-legal message gets.
    const sealed = await sealChat(key, '￿'.repeat(500));
    expect(sealed.length).toBeLessThanOrEqual(ENVELOPE_WIRE_CAP);
  });

  it('extracts the room key from a location hash', () => {
    const encoded = generateRoomKey()!;
    expect(roomKeyFromHash(`#${encoded}`)).toBe(encoded);
    expect(roomKeyFromHash(`#${encoded}~U2FsYSBkbyBKb8OjbyDwn46Z77iP`)).toBe(encoded);
    expect(roomKeyFromHash(`#k=${encoded}`)).toBe(encoded);
    expect(roomKeyFromHash(`k=${encoded}`)).toBe(encoded);
    expect(roomKeyFromHash('')).toBeNull();
    expect(roomKeyFromHash('#k=too-short')).toBeNull();
    expect(roomKeyFromHash('#other=x')).toBeNull();
  });
});
