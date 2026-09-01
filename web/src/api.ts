/**
 * Cliente fino da API HTTP. Em dev o Vite faz proxy de /api e /ws para o
 * servidor; em produção o mesmo processo Node serve API, WS e estáticos.
 */

export interface RoomSummary {
  slug: string;
  displayName: string;
  participantCount: number;
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
  const response = await fetch(path, {
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
