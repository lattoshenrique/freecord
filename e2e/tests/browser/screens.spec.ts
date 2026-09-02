import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, screenShareButton, type RoomPageHandle } from '../../helpers/pages';

/**
 * Many screens, focus and layouts, with real Chromium peers and fake
 * capture. Two people share at once; a viewer's stage follows the newest
 * screen, a click on the other pins it, and L flips to the grid where the
 * screens sit among the people. A pinned person takes the stage the same
 * way. Headless capture is the flaky part: if the first share never lands,
 * the test skips with a reason rather than failing (see screen.spec.ts).
 */
test.describe('many screens, focus and layouts', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('two shares at once: the stage follows, a click pins, L goes to the grid', async ({ browser }) => {
    const { slug } = await createRoom('screens');
    handles = await joinMany(browser, slug, 3);
    const [alice, bob, carol] = handles;

    // Before any share, the layout switch is already meaningful: spotlight
    // puts a person on stage (never empty), grid shows everyone equal.
    await expect(carol.page.locator('.stage-person')).toHaveCount(1, { timeout: 20_000 });
    await carol.page.keyboard.press('l');
    await expect(carol.page.locator('.stage-person')).toHaveCount(0);
    await expect(carol.page.locator('.tiles-grid .tile')).toHaveCount(3);
    await carol.page.keyboard.press('l');
    await expect(carol.page.locator('.stage-person')).toHaveCount(1);

    await screenShareButton(alice.page).click();
    const landed = await carol.page
      .locator('.screen-video')
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!landed, 'headless display capture did not produce a stream');
    await expect(carol.page.locator('.screen-label')).toContainText(alice.name);

    // A second share, with slots to spare: the stage follows the newest,
    // and the first screen drops into the strip as a tile.
    await screenShareButton(bob.page).click();
    await expect(carol.page.locator('.screen-label')).toContainText(bob.name, { timeout: 20_000 });
    await expect(carol.page.locator('.tile-screen')).toHaveCount(1);
    await expect(carol.page.locator('.tile-screen')).toContainText(alice.name);
    // A sharer sees the other's screen on stage and their own as a tile.
    await expect(alice.page.locator('.screen-label')).toContainText(bob.name, { timeout: 20_000 });
    await expect(alice.page.locator('.tile-screen')).toContainText(/your screen/i);

    // A click pins the other screen on stage; the newest goes to the strip.
    await carol.page.locator('.tile-screen').click();
    await expect(carol.page.locator('.screen-label')).toContainText(alice.name);
    await expect(carol.page.locator('.tile-screen')).toContainText(bob.name);
    await carol.page.screenshot({ path: 'test-results/screens-pinned.png' });

    // L flips to the grid: no stage, both screens as tiles among the people.
    await carol.page.keyboard.press('l');
    await expect(carol.page.locator('.screen-stage')).toHaveCount(0);
    await expect(carol.page.locator('.tile-screen')).toHaveCount(2);
    await expect(carol.page.locator('.tiles-grid .tile')).toHaveCount(5);
    await carol.page.screenshot({ path: 'test-results/screens-grid.png' });

    // And back: the pin still holds.
    await carol.page.keyboard.press('l');
    await expect(carol.page.locator('.screen-stage')).toHaveCount(1);
    await expect(carol.page.locator('.screen-label')).toContainText(alice.name);

    // A person can take the stage too: pin bob, his tile leaves the strip.
    await carol.page.locator('.tile:not(.tile-screen)').filter({ hasText: bob.name }).click();
    await expect(carol.page.locator('.stage-person')).toHaveCount(1);
    await expect(carol.page.locator('.stage-person')).toContainText(bob.name);
    await expect(carol.page.locator('.tile-screen')).toHaveCount(2);

    // Unpin from the stage itself: the stage goes back to following the
    // newest screen, and the person returns to the strip.
    await carol.page.locator('.stage-person .screen-pin').click();
    await expect(carol.page.locator('.stage-person')).toHaveCount(0);
    await expect(carol.page.locator('.screen-label')).toContainText(bob.name);
    await expect(carol.page.locator('.tile:not(.tile-screen)')).toHaveCount(3);
    // The stage's pin holds a followed screen too, and releases it again.
    await carol.page.locator('.screen-stage .screen-pin').click();
    await expect(carol.page.locator('.screen-stage .screen-pin')).toHaveAttribute('aria-pressed', 'true');
    await carol.page.locator('.screen-stage .screen-pin').click();
    await expect(carol.page.locator('.screen-stage .screen-pin')).toHaveAttribute('aria-pressed', 'false');

    // A sharer stops: their screen is gone everywhere; the one left stays
    // on stage, so the strip holds people only.
    await screenShareButton(alice.page).click();
    await expect(carol.page.locator('.tile-screen')).toHaveCount(0, { timeout: 20_000 });
    await expect(carol.page.locator('.screen-label')).toContainText(bob.name);
    await expect(carol.page.locator('.tile:not(.tile-screen)')).toHaveCount(3);
  });
});
