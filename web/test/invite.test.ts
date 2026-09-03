import { describe, expect, it } from 'vitest';
import {
  compactInviteHash,
  compactInviteUrl,
  looksLikeInvite,
  parseInvite,
} from '../src/lib/invite';

const SLUG = 'AbCd12-_EfGh';

describe('parseInvite', () => {
  it('accepts the full link, with and without the chat key', () => {
    expect(parseInvite(`https://freecord.lattoshenrique.workers.dev/r/${SLUG}#k=abc123`)).toEqual({
      slug: SLUG,
      hash: '#k=abc123',
      roomName: null,
    });
    expect(parseInvite(`https://freecord.lattoshenrique.workers.dev/r/${SLUG}`)).toEqual({
      slug: SLUG,
      hash: '',
      roomName: null,
    });
  });

  it('accepts the link without a scheme and with a trailing slash', () => {
    expect(parseInvite(`freecord.lattoshenrique.workers.dev/r/${SLUG}/`)?.slug).toBe(SLUG);
    expect(parseInvite(`localhost:5173/r/${SLUG}#k=x`)).toEqual({
      slug: SLUG,
      hash: '#k=x',
      roomName: null,
    });
  });

  it('accepts a bare path', () => {
    expect(parseInvite(`/r/${SLUG}#k=abc`)).toEqual({
      slug: SLUG,
      hash: '#k=abc',
      roomName: null,
    });
    // Without the leading slash "r/…" is indistinguishable from a host.
    expect(parseInvite(`r/${SLUG}`)).toBeNull();
  });

  it('works for any origin: self-hosted instances', () => {
    expect(parseInvite(`http://my-server.local:8080/r/${SLUG}`)?.slug).toBe(SLUG);
  });

  it('ignores whitespace around a pasted link', () => {
    expect(parseInvite(`  https://example.com/r/${SLUG}  `)?.slug).toBe(SLUG);
  });

  it('never mistakes a room name for an invite', () => {
    expect(parseInvite('team-meeting')).toBeNull();
    expect(parseInvite('Sala do João')).toBeNull();
    expect(parseInvite('')).toBeNull();
    // Nor a bare slug: only the /r/ path marks an invite.
    expect(parseInvite(SLUG)).toBeNull();
  });

  it('rejects non-room links and malformed slugs', () => {
    expect(parseInvite('https://example.com/community')).toBeNull();
    expect(parseInvite('https://example.com/r/ab')).toBeNull();
    expect(parseInvite('https://example.com/r/abc!def')).toBeNull();
    expect(parseInvite(`https://example.com/r/${SLUG}/extra`)).toBeNull();
  });
});

describe('compact invite fragments', () => {
  const KEY = '4qZp8bKx1jYv6tNc3mHs9dWr5fLg2aEu7iOo0sTxVPA';

  it('still reads the Unicode preview carried by older named links', () => {
    const hash = `#k=${KEY}&n=Sala+do+Jo%C3%A3o+%F0%9F%8E%99%EF%B8%8F`;
    expect(parseInvite(`/r/${SLUG}${hash}`)).toEqual({
      slug: SLUG,
      hash,
      roomName: 'Sala do João 🎙️',
    });
  });

  it('compacts the key and Unicode room name into a locally decodable fragment', () => {
    const hash = compactInviteHash(`#k=${KEY}&n=Sala+do+Jo%C3%A3o+%F0%9F%8E%99%EF%B8%8F`);
    expect(hash).toBe(`#${KEY}~U2FsYSBkbyBKb8OjbyDwn46Z77iP`);
    expect(parseInvite(`/r/${SLUG}${hash}`)).toEqual({
      slug: SLUG,
      hash,
      roomName: 'Sala do João 🎙️',
    });
  });

  it('builds the named complete URL used by sharing controls', () => {
    expect(compactInviteUrl(`https://freecord.example/r/${SLUG}#k=${KEY}&n=Design+sync`)).toBe(
      `https://freecord.example/r/${SLUG}#${KEY}~RGVzaWduIHN5bmM`,
    );
  });

  it('can add or refresh the room name while preserving the key', () => {
    expect(compactInviteHash(`#${KEY}`, 'Design sync')).toBe(
      `#${KEY}~RGVzaWduIHN5bmM`,
    );
    expect(compactInviteHash(`#${KEY}~b2xk`, 'New name')).toBe(
      `#${KEY}~TmV3IG5hbWU`,
    );
    expect(compactInviteHash('', 'Keyless room')).toBe('');
  });

  it('preserves unknown future parameters and their legacy name metadata', () => {
    expect(compactInviteHash(`#k=${KEY}&n=Old+name&future=1`)).toBe(
      `#k=${KEY}&n=Old+name&future=1`,
    );
  });
});

describe('looksLikeInvite', () => {
  it('flags truncated pastes so they become an error, not a room name', () => {
    expect(looksLikeInvite('https://freecord.example/r/ab')).toBe(true);
    expect(looksLikeInvite('https://example.com')).toBe(true);
    expect(looksLikeInvite('example.com/r/ab')).toBe(true);
  });

  it('lets ordinary names through', () => {
    expect(looksLikeInvite('team-meeting')).toBe(false);
    expect(looksLikeInvite('Sala do João')).toBe(false);
  });
});
