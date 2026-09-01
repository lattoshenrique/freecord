/** Where the booted edge lives (set by setup/global-setup.ts). */
export function port(): number {
  const value = process.env.E2E_PORT;
  if (!value) {
    throw new Error('E2E_PORT is not set — the Playwright global setup did not run');
  }
  return Number(value);
}

export function baseUrl(): string {
  return `http://127.0.0.1:${port()}`;
}

export function joinUrl(slug: string, name: string): string {
  return `ws://127.0.0.1:${port()}/ws/rooms/${encodeURIComponent(slug)}?name=${encodeURIComponent(name)}`;
}

export function resumeUrl(slug: string, token: string): string {
  return `ws://127.0.0.1:${port()}/ws/rooms/${encodeURIComponent(slug)}?resume=${encodeURIComponent(token)}`;
}
