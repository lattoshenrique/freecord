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

/** Desktop app catalog — the edge resolves which Release is the latest. */
export function getDownloads(): Promise<DesktopCatalog> {
  return request('/api/downloads');
}
