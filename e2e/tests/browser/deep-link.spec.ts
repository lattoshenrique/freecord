import { expect, test } from '@playwright/test';
import { baseUrl } from '../../helpers/env';
import { createRoom } from '../../helpers/http';

/**
 * The doorstep's offer to open this room in the desktop app.
 *
 * There is nothing to detect here — a browser cannot be asked whether an app
 * is installed — so what the product actually promises is a genuine protocol
 * link activated by a click and a way to try it again. A script replayed on
 * mount is deliberately not the contract: browsers block external protocols
 * without user activation. The `freecord://` navigation itself goes nowhere
 * in the headless test browser, which is exactly what it does for anyone
 * without the app installed: the tab stays where it is.
 */

test.describe('opening a room in the desktop app', () => {
  test('offers a directly activated app link and lets the visitor try it again', async ({
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

      const offer = page.getByRole('link', { name: /open this room in the desktop app/i });
      await expect(offer).toBeVisible({ timeout: 15_000 });
      await expect(offer).toHaveAttribute('href', `freecord://r/${slug}#n=deep+link`);

      // Nothing on this page is allowed to navigate away: the app either
      // comes forward or it does not, and the tab is what stays behind.
      await offer.click();
      await expect(page.getByText(/opening in the desktop app/i)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(`/r/${slug}`);

      // A reload needs a new click. Replaying a custom protocol from an effect
      // would be blocked by the browser while falsely claiming it was opening.
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
      await page.getByRole('link', { name: /open this room in the desktop app/i }).click();
      expect(new URL(page.url()).pathname).toBe(`/r/${slug}`);
      await expect(page.locator('.seat-count')).toHaveCount(0);

      await page.getByRole('button', { name: /join the room/i }).click();
      await expect(page.locator('.seat-count')).toBeVisible({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });
});
