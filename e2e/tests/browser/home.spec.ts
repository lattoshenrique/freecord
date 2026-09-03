import { expect, test, type Page } from '@playwright/test';
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

/** What the eye gets, not what the DOM has: no entrance to sit through. */
const opacity = (page: Page) =>
  page.locator(BUTTON).evaluate((node) => getComputedStyle(node).opacity);

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
    // Visible to Playwright is not visible to a person: `toBeVisible` ignores
    // opacity, and the entrance the other children play would hide this one
    // behind a 1.65s delay while passing the assertion above.
    await expect(opacity(page)).resolves.toBe('1');
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
    await expect(opacity(page)).resolves.toBe('1');
    await expect(page.locator(BUTTON)).toHaveAttribute('href', '/community');
  });
});

/**
 * The home does not play itself in. The brand keeps its entrance — the mark
 * arrives, walks left and writes the name (Brand.tsx, logo.css) — and it is
 * the only thing on the screen that arrives at all. Everything else is there
 * in the first frame: the field, the button, the download offer, the count,
 * the footer.
 */
test.describe('home entrance', () => {
  test('nothing but the brand animates on load', async ({ page }) => {
    await page.goto(`${baseUrl()}/`);
    await expect(page.locator('.start-form')).toBeVisible();

    // Finite CSS animations only: `getAnimations` also hands back transitions
    // and the caret's endless blink, and neither is an entrance.
    const entrances = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.start-center, .start-center *, .start-count, .start-foot, .start-foot *',
        ),
      ]
        .filter((node) => !node.closest('.brand'))
        .flatMap((node) =>
          node
            .getAnimations()
            .filter((one): one is CSSAnimation => 'animationName' in one)
            .filter((one) => one.effect?.getTiming().iterations !== Infinity)
            .map((one) => `${node.className}: ${one.animationName}`),
        ),
    );
    expect(entrances).toEqual([]);

    // And the brand still has its own — the exception is the point.
    const mark = await page.evaluate(
      () =>
        [...document.querySelectorAll('.brand *')].filter((node) =>
          node.getAnimations().some((one) => 'animationName' in one),
        ).length,
    );
    expect(mark).toBeGreaterThan(0);
  });
});
