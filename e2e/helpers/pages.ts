/**
 * Browser-side helpers. The UI is being restyled in a parallel session, so
 * selectors prefer the stable hooks (.seat-count, .tile, [data-camera-slots],
 * .cam-denied-note, .screen-video, .screen-stats) plus roles/aria over text
 * or layout. Locale is pinned to en-US (context locale + localStorage) so
 * the few label-based lookups stay deterministic.
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
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

  // Prejoin: the only textbox is the guest name; the submit joins.
  const nameInput = page.getByRole('textbox').first();
  await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
  await nameInput.fill(name);
  await page.locator('form button[type="submit"]').click();

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

/** "3/12" from the seat counter. */
export async function seatCount(page: Page): Promise<string> {
  return (await page.locator('.seat-count').innerText()).trim();
}

export async function expectSeatCount(page: Page, occupied: number, max = 12): Promise<void> {
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
