import { expect, test } from '@playwright/test';
import { baseUrl } from '../../helpers/env';
import { createRoom } from '../../helpers/http';

/**
 * The doorstep's offer to open this room in the desktop app.
 *
 * There is nothing to detect here — a browser cannot be asked whether an app
 * is installed — so what the product actually promises is a choice and a way
 * to take it back, and that is what this covers: the offer is on the
 * doorstep, pressing it is remembered, and the next visit says so and still
 * has a way out. The `freecord://` navigation itself goes nowhere in a test
 * browser, which is exactly what it does for anyone without the app
 * installed: the tab stays where it is.
 */

test.describe('opening a room in the desktop app', () => {
  test('offers the app on the doorstep, remembers the answer, and takes it back', async ({
    browser,
  }) => {
    const { slug } = await createRoom('deep link');
    const context = await browser.newContext({ locale: 'en-US' });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('freecord:locale', 'en-US');
      } catch {
        // storage unavailable: the context locale still resolves to en-US
      }
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl()}/r/${slug}`);

      const offer = page.getByRole('button', { name: /open this room in the desktop app/i });
      await expect(offer).toBeVisible({ timeout: 15_000 });

      // Nothing on this page is allowed to navigate away: the app either
      // comes forward or it does not, and the tab is what stays behind.
      await offer.click();
      await expect(page.getByText(/opening in the desktop app/i)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(`/r/${slug}`);

      // The choice outlives the visit — that is the whole point of it.
      await page.reload();
      const stay = page.getByRole('button', { name: /stay in the browser/i });
      await expect(stay).toBeVisible({ timeout: 15_000 });

      // ...and it is never a trap: the way out is on screen the whole time.
      await stay.click();
      await expect(offer).toBeVisible();
      await page.reload();
      await expect(offer).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test('the room is still joinable with the offer on screen', async ({ browser }) => {
    const { slug } = await createRoom('deep link join');
    const context = await browser.newContext({
      locale: 'en-US',
      permissions: ['camera', 'microphone'],
    });
    const page = await context.newPage();

    try {
      await page.goto(`${baseUrl()}/r/${slug}`);
      const nameInput = page.getByRole('textbox', { name: /your name/i });
      await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
      await nameInput.fill('Doorstep');
      // The offer sits inside the join form: a button in there that submitted
      // it would send someone into the room by accident.
      await page.getByRole('button', { name: /open this room in the desktop app/i }).click();
      expect(new URL(page.url()).pathname).toBe(`/r/${slug}`);
      await expect(page.locator('.seat-count')).toHaveCount(0);

      await page.getByRole('button', { name: /join the room/i }).click();
      await expect(page.locator('.seat-count')).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });
});
