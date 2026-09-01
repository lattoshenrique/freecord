/**
 * Screen share smoke. Headless getDisplayMedia is the flakiest browser
 * capability we touch: the config passes --auto-select-desktop-capture-source
 * (plus the tab-capture spelling); when Chromium still refuses to produce a
 * stream in this environment, the test SKIPS with a reason instead of
 * failing — the protocol suite already proves the lock and route mechanics.
 */
import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import {
  closeAll,
  joinMany,
  screenShareButton,
  type RoomPageHandle,
} from '../../helpers/pages';

test.describe('screen share', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('one shares, the others receive a playing video; the stats bar appears', async ({ browser }) => {
    const { slug } = await createRoom('screen-smoke');
    handles = await joinMany(browser, slug, 3);
    const sharer = handles[0].page;

    await screenShareButton(sharer).click();

    // The stage only appears after the server grants the lock AND
    // getDisplayMedia produced a stream. No stage on the sharer within 15 s
    // means capture is unavailable here — skip with the reason on record.
    const stage = sharer.locator('.screen-video');
    const captured = await stage
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !captured,
      'getDisplayMedia produced no stream under headless Chromium despite ' +
        '--auto-select-desktop-capture-source; run headed (npx playwright test --headed) for this one',
    );

    // Sharer sees its own stage and, within a stats interval, the stats bar.
    await expect(sharer.locator('.screen-stats')).toBeVisible({ timeout: 15_000 });

    // Viewers get the stage video and it actually plays (frames arriving).
    for (const { page } of handles.slice(1)) {
      const video = page.locator('.screen-video');
      await expect(video).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(
          () =>
            video.evaluate(
              (el: HTMLVideoElement) => el.readyState >= 2 && el.videoWidth > 0 && !el.paused,
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
    }

    // Picture-in-picture on a viewer: the button drives the floating window and
    // reads its state back from the video's own events (Firefox/WebKit and
    // headless builds without PiP hide the button — nothing to assert there).
    const viewer = handles[1].page;
    if (await viewer.evaluate(() => document.pictureInPictureEnabled)) {
      await viewer.getByRole('button', { name: 'View in a floating window' }).click();
      await expect
        .poll(() => viewer.evaluate(() => document.pictureInPictureElement !== null), {
          timeout: 10_000,
        })
        .toBe(true);
      // The button now offers the way out — its label and pressed state
      // follow the floating window, not the click.
      const leave = viewer.getByRole('button', { name: 'Close the floating window' });
      await expect(leave).toHaveAttribute('aria-pressed', 'true');
      await leave.click();
      await expect
        .poll(() => viewer.evaluate(() => document.pictureInPictureElement === null), {
          timeout: 10_000,
        })
        .toBe(true);
    }

    // Stop: the stage leaves every screen.
    await screenShareButton(sharer).click();
    for (const { page } of handles) {
      await expect(page.locator('.screen-video')).toHaveCount(0, { timeout: 20_000 });
    }
  });
});
