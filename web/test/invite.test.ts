import { describe, expect, it } from 'vitest';
import { looksLikeInvite, parseInvite } from '../src/lib/invite';

const SLUG = 'AbCd12-_EfGh';

describe('parseInvite', () => {
  it('accepts the full link, with and without the chat key', () => {
    expect(parseInvite(`https://freecord.lattoshenrique.workers.dev/r/${SLUG}#k=abc123`)).toEqual({
      slug: SLUG,
      hash: '#k=abc123',
    });
    expect(parseInvite(`https://freecord.lattoshenrique.workers.dev/r/${SLUG}`)).toEqual({
      slug: SLUG,
      hash: '',
    });
  });

  it('accepts the link without a scheme and with a trailing slash', () => {
    expect(parseInvite(`freecord.lattoshenrique.workers.dev/r/${SLUG}/`)?.slug).toBe(SLUG);
    expect(parseInvite(`localhost:5173/r/${SLUG}#k=x`)).toEqual({ slug: SLUG, hash: '#k=x' });
  });

  it('accepts a bare path', () => {
    expect(parseInvite(`/r/${SLUG}#k=abc`)).toEqual({ slug: SLUG, hash: '#k=abc' });
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
