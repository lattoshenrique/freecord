/**
 * Ephemeral TURN credentials from Cloudflare's Realtime TURN service.
 *
 * TURN is the escape hatch for the ~10–20% of peers (symmetric CGNAT,
 * restrictive corporate networks) that cannot connect P2P directly. The
 * service is anycast, so a peer in São Paulo relays through a nearby PoP,
 * and the relayed media stays DTLS-SRTP encrypted end to end — the relay
 * moves bytes it cannot read.
 *
 * One place knows how to talk to the API; both edges reuse it (memory
 * cache on Node, per-isolate cache on the Worker). Unset credentials mean
 * STUN-only — the dev default, no external credential required — and a
 * failed fetch is a first-class `null`: callers hand out the stale set or
 * an empty list instead of blocking a join because Cloudflare blinked.
 */
import type { IceServerConfig } from '../domain/room.js';

export interface TurnServiceConfig {
  keyId: string;
  apiToken: string;
}

/** Lifetime requested for each credential set (seconds). */
export const TURN_CREDENTIAL_TTL_S = 24 * 60 * 60;

/** How long one credential set is handed to new joins before refreshing. */
export const TURN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class TurnCredentialProvider {
  private readonly config: TurnServiceConfig | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cache: { servers: IceServerConfig[]; at: number } | null = null;
  private inFlight: Promise<IceServerConfig[] | null> | null = null;

  constructor(
    config: TurnServiceConfig | null,
    fetchImpl: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  /** ICE servers for a joining peer; [] when TURN is unconfigured or unreachable. */
  async iceServers(): Promise<IceServerConfig[]> {
    if (!this.config) {
      return [];
    }
    if (this.cache && this.now() - this.cache.at < TURN_CACHE_TTL_MS) {
      return this.cache.servers;
    }
    // A burst of simultaneous joins shares one request.
    this.inFlight ??= this.fetchFresh().finally(() => {
      this.inFlight = null;
    });
    const fresh = await this.inFlight;
    if (!fresh) {
      // Yesterday's credentials (TTL 24h) beat none at all.
      return this.cache?.servers ?? [];
    }
    this.cache = { servers: fresh, at: this.now() };
    return fresh;
  }

  private async fetchFresh(): Promise<IceServerConfig[] | null> {
    const { keyId, apiToken } = this.config!;
    try {
      const response = await this.fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_S }),
        },
      );
      if (!response.ok) {
        return null;
      }
      return parseIceServers(await response.json());
    } catch {
      return null;
    }
  }
}

/** Defensive parse of the API response: only well-formed servers get through. */
export function parseIceServers(body: unknown): IceServerConfig[] | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const raw = (body as { iceServers?: unknown }).iceServers;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const servers: IceServerConfig[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const candidate = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls]).filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    );
    if (urls.length === 0) {
      continue;
    }
    servers.push({
      urls,
      ...(typeof candidate.username === 'string' ? { username: candidate.username } : {}),
      ...(typeof candidate.credential === 'string' ? { credential: candidate.credential } : {}),
    });
  }
  return servers.length > 0 ? servers : null;
}
