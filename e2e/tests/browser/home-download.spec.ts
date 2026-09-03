import { expect, test } from '@playwright/test';
import { baseUrl } from '../../helpers/env';

/**
 * The download offer on the home is drawn on the first paint, next to the
 * field and the button — not after `/api/downloads` answers.
 *
 * Both tests hold the catalog hostage on purpose: one never answers, the other
 * fails. Neither is a reason to hide the offer, because the visitor's system is
 * known from the user agent alone (see lib/platform.ts).
 */

const BUTTON = '.download-button';

test.describe('home download button', () => {
  test('shows the visitor’s system while the catalog is still in flight', async ({ page }) => {
    let released: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      released = resolve;
    });
    await page.route('**/api/downloads', async (route) => {
      await held;
      await route.continue();
    });

    await page.goto(`${baseUrl()}/`);
    // No waitFor: it is either in the first render or the test is right to fail.
    await expect(page.locator(BUTTON)).toBeVisible({ timeout: 3_000 });
    // Nothing was downloaded blindly — the link goes to the page that lists
    // every build until the catalog names one.
    await expect(page.locator(BUTTON)).toHaveAttribute('href', '/community');

    released!();
    // And when it lands, the same button becomes the installer itself.
    await expect(page.locator(BUTTON)).toHaveAttribute('href', /^https?:/, { timeout: 10_000 });
  });

  test('survives a catalog that fails outright', async ({ page }) => {
    await page.route('**/api/downloads', (route) => route.abort());
    await page.goto(`${baseUrl()}/`);
    await expect(page.locator(BUTTON)).toBeVisible({ timeout: 3_000 });
    await expect(page.locator(BUTTON)).toHaveAttribute('href', '/community');
  });
});
