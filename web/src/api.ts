/**
 * Cliente fino da API HTTP.
 *
 * Sem `VITE_SIGNALING_ORIGIN` tudo é relativo: em dev o Vite faz proxy de
 * /api e /ws, e um processo Node único pode servir API, WS e estáticos.
 * Com a variável definida, API e WS vão para outra origem — é assim que a
 * página servida pela borda da Cloudflare fala com o servidor de salas em
 * São Paulo (ver docs/architecture.md).
 */
import type { DesktopTarget } from './lib/platform';

/** Origem do servidor de salas; vazio = mesma origem da página. */
export const SIGNALING_ORIGIN = (import.meta.env.VITE_SIGNALING_ORIGIN ?? '').replace(/\/$/, '');

export interface RoomSummary {
  slug: string;
  displayName: string;
  participantCount: number;
}

/** Mirror of the server's `DesktopAsset` (server/src/domain/downloads.ts). */
export interface DesktopAsset {
  target: DesktopTarget;
  os: 'mac' | 'windows' | 'linux';
  file: string;
  label: string;
  hint: string;
  url: string;
  size: number | null;
}

export interface DesktopCatalog {
  version: string | null;
  publishedAt: string | null;
  builds: DesktopAsset[];
  releasesUrl: string;
}

/**
 * Mirror of the server's `VideoCandidate` (server/src/domain/sources.ts):
 * one thing the room could watch, and everything a person needs to
 * choose between it and the next one.
 */
export interface VideoCandidate {
  /** How a client plays it — and how much of a shared clock that buys. */
  play: 'file' | 'hls' | 'dash' | 'twitch' | 'frame';
  url: string;
  found: 'link' | 'meta' | 'schema' | 'element' | 'embed' | 'script';
  label?: string;
  title?: string;
  poster?: string;
  twitch?: { channel?: string; video?: string; clip?: string };
  live?: boolean;
  framable?: boolean;
  /** Signed for whoever opened the page: it may play for nobody else. */
  personal?: boolean;
  /** Reached through this embed rather than from the page itself. */
  via?: string;
}

export interface SourceLookup {
  url: string;
  title?: string;
  candidates: VideoCandidate[];
  empty: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`api error ${status}: ${code}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SIGNALING_ORIGIN}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    let code = 'unknown_error';
    try {
      const body = (await response.json()) as { error?: string };
      code = body.error ?? code;
    } catch {
      // corpo não-JSON: mantém código genérico
    }
    throw new ApiError(response.status, code);
  }
  return (await response.json()) as T;
}

export function createRoom(displayName?: string): Promise<{ slug: string; displayName: string }> {
  return request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(displayName ? { displayName } : {}),
  });
}

export function getRoom(slug: string): Promise<RoomSummary> {
  return request(`/api/rooms/${encodeURIComponent(slug)}`);
}

/** Renames from the doorstep; an empty name means "unnamed" again. */
export function renameRoom(slug: string, displayName: string): Promise<RoomSummary> {
  return request(`/api/rooms/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

/**
 * The one public number about other people's rooms: how many of them held
 * company (two or more) past the twenty-minute mark. An aggregate and
 * nothing else — see server/src/domain/room-stats.ts.
 */
export function getStats(): Promise<{ rooms: number }> {
  return request('/api/stats');
}

/**
 * What is playable in a page somebody pasted, for the watch tool.
 *
 * The one call in this client that hands the server a stranger's URL. It
 * comes back with what the page says about its own video; the video
 * itself is always fetched by this browser, from wherever it lives, and
 * never through us (server/src/app/source-lookup.ts).
 *
 * A POST for a read, deliberately: the page goes in the body, because a
 * URL in a query string is written to both edges' request logs, and this
 * is the one call whose whole promise is that nothing is kept.
 */
export function lookupSources(url: string): Promise<SourceLookup> {
  return request('/api/sources', { method: 'POST', body: JSON.stringify({ url }) });
}

/** Desktop app catalog — the edge resolves which Release is the latest. */
export function getDownloads(): Promise<DesktopCatalog> {
  return request('/api/downloads');
}
