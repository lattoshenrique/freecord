/**
 * Browser-side helpers. The UI is being restyled in a parallel session, so
 * selectors prefer the stable hooks (.seat-count, .tile, [data-camera-slots],
 * .cam-denied-note, .screen-video, .screen-stats) plus roles/aria over text
 * or layout. Locale is pinned to en-US (context locale + localStorage) so
 * the few label-based lookups stay deterministic.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ROOM_LIMITS } from '../../server/src/domain/room.js';
import { baseUrl } from './env';

export interface RoomPageHandle {
  context: BrowserContext;
  page: Page;
  name: string;
}

/** Opens a fresh context, walks the prejoin form, and lands in the room. */
export async function joinRoomPage(browser: Browser, slug: string, name: string): Promise<RoomPageHandle> {
  const context = await browser.newContext({
    locale: 'en-US',
    permissions: ['camera', 'microphone'],
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('freecord:locale', 'en-US');
    } catch {
      // storage unavailable: the context locale still resolves to en-US
    }
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl()}/r/${slug}`);

  // Prejoin: the guest-name field by its label — the room title is a
  // textbox too now (click-to-rename), so "first textbox" would rename the
  // room instead of naming the guest. The join button likewise by name.
  const nameInput = page.getByRole('textbox', { name: /your name/i });
  await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
  await nameInput.fill(name);
  await page.getByRole('button', { name: /join the room/i }).click();

  // In the room once the seat counter renders.
  await page.locator('.seat-count').waitFor({ state: 'visible', timeout: 20_000 });
  return { context, page, name };
}

export async function joinMany(browser: Browser, slug: string, count: number, prefix = 'guest'): Promise<RoomPageHandle[]> {
  const handles: RoomPageHandle[] = [];
  for (let i = 0; i < count; i += 1) {
    handles.push(await joinRoomPage(browser, slug, `${prefix}-${i}`));
  }
  return handles;
}

/** "3/20" from the seat counter — the max is the server's own limit. */
export async function seatCount(page: Page): Promise<string> {
  return (await page.locator('.seat-count').innerText()).trim();
}

export async function expectSeatCount(
  page: Page,
  occupied: number,
  max = ROOM_LIMITS.maxParticipants,
): Promise<void> {
  await expect(page.locator('.seat-count')).toHaveText(`${occupied}/${max}`, { timeout: 20_000 });
}

/** Occupied participant tiles (ghost/empty seats, if the UI adds them, excluded). */
export function occupiedTiles(page: Page) {
  return page.locator('.tile');
}

/** The camera toggle in the dock, found by its en-US accessible names. */
export function cameraButton(page: Page) {
  return page.getByRole('button', {
    name: /turn camera on|turn camera off|camera seats are full/i,
  });
}

export function screenShareButton(page: Page) {
  return page.getByRole('button', { name: /share screen|stop sharing/i });
}

/**
 * Leaves for real: navigating away fires pagehide, whose handler sends the
 * protocol goodbye — a bare context.close() would strand the seat in the
 * 35 s resume grace and keep the counter up.
 */
export async function leaveRoom(handle: RoomPageHandle): Promise<void> {
  await handle.page.goto('about:blank').catch(() => {});
  await handle.context.close().catch(() => {});
}

export async function closeAll(handles: Iterable<RoomPageHandle>): Promise<void> {
  for (const handle of handles) {
    await leaveRoom(handle);
  }
}
