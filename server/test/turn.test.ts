import { describe, expect, it, vi } from 'vitest';
import {
  TURN_CACHE_TTL_MS,
  TurnCredentialProvider,
  parseIceServers,
} from '../src/app/turn.js';

const CONFIG = { keyId: 'key-1', apiToken: 'secret' };

function okResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

const CF_BODY = {
  iceServers: [
    {
      urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp'],
      username: 'user',
      credential: 'pass',
    },
  ],
};

describe('TurnCredentialProvider', () => {
  it('unconfigured means STUN-only: empty list, no network call', async () => {
    const fetchImpl = vi.fn();
    const provider = new TurnCredentialProvider(null, fetchImpl);

    expect(await provider.iceServers()).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches once and serves the cache within the TTL', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => okResponse(CF_BODY));
    const provider = new TurnCredentialProvider(CONFIG, fetchImpl as typeof fetch, () => clock);

    const first = await provider.iceServers();
    clock = TURN_CACHE_TTL_MS - 1;
    const second = await provider.iceServers();

    expect(first).toEqual(CF_BODY.iceServers);
    expect(second).toEqual(CF_BODY.iceServers);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/turn/keys/key-1/credentials/generate-ice-servers');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
  });

  it('past the TTL it refreshes; on failure the stale set still serves', async () => {
    let clock = 0;
    let fail = false;
    const fetchImpl = vi.fn(async () => {
      if (fail) throw new Error('network down');
      return okResponse(CF_BODY);
    });
    const provider = new TurnCredentialProvider(CONFIG, fetchImpl as typeof fetch, () => clock);

    await provider.iceServers();
    clock = TURN_CACHE_TTL_MS + 1;
    fail = true;

    // Yesterday's credentials (asked with a 24h lifetime) beat none at all.
    expect(await provider.iceServers()).toEqual(CF_BODY.iceServers);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('a failed first fetch degrades to STUN-only instead of blocking the join', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response);
    const provider = new TurnCredentialProvider(CONFIG, fetchImpl as typeof fetch);

    expect(await provider.iceServers()).toEqual([]);
  });
});

describe('parseIceServers', () => {
  it('accepts the documented list shape and a single-object shape', () => {
    expect(parseIceServers(CF_BODY)).toEqual(CF_BODY.iceServers);
    expect(parseIceServers({ iceServers: CF_BODY.iceServers[0] })).toEqual(CF_BODY.iceServers);
  });

  it('drops malformed entries and rejects bodies with nothing usable', () => {
    expect(
      parseIceServers({ iceServers: [{ urls: [] }, { username: 'no-urls' }, 42, null] }),
    ).toBeNull();
    expect(parseIceServers({ iceServers: [{ urls: 'stun:one.example.com' }] })).toEqual([
      { urls: ['stun:one.example.com'] },
    ]);
    expect(parseIceServers('not-an-object')).toBeNull();
    expect(parseIceServers(null)).toBeNull();
  });
});
