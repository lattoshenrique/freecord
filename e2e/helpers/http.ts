import { baseUrl } from './env';

export interface RoomSummary {
  slug: string;
  displayName: string;
  participantCount: number;
}

export async function createRoom(displayName?: string): Promise<{ slug: string; displayName: string }> {
  const response = await fetch(`${baseUrl()}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(displayName ? { displayName } : {}),
  });
  if (response.status !== 201) {
    throw new Error(`createRoom failed: ${response.status}`);
  }
  return (await response.json()) as { slug: string; displayName: string };
}

export async function getRoom(slug: string): Promise<RoomSummary> {
  const response = await fetch(`${baseUrl()}/api/rooms/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    throw new Error(`getRoom failed: ${response.status}`);
  }
  return (await response.json()) as RoomSummary;
}
