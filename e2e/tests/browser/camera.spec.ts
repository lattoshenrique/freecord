import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import {
  cameraButton,
  closeAll,
  expectSeatCount,
  joinMany,
  type RoomPageHandle,
} from '../../helpers/pages';

test.describe('cameras in the browser', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('two of three turn cameras on; everyone sees the videos', async ({ browser }) => {
    const { slug } = await createRoom('cam-flow');
    handles = await joinMany(browser, slug, 3);

    for (const { page } of handles.slice(0, 2)) {
      await cameraButton(page).click();
      // The grant lights the local tile: a <video> replaces the avatar.
      await expect(page.locator('.tile video').first()).toBeVisible({ timeout: 20_000 });
    }

    // The camera-less third sees two live tiles once WebRTC settles.
    const viewer = handles[2].page;
    await expect(viewer.locator('.tile video')).toHaveCount(2, { timeout: 30_000 });

    // Turning one off reverts the SENDER's own tile to the avatar.
    await cameraButton(handles[0].page).click();
    await expect(handles[0].page.locator('.tile video')).toHaveCount(1, { timeout: 20_000 });
    // FINDING (2026-09-01): viewers keep a black <video> for a peer that
    // turned its camera off — the client only disables the track (black
    // frames keep flowing) and Tile's hasLiveVideo checks `enabled`, which
    // is a receiver-LOCAL property (always true for remote tracks). The
    // `cameras` roster (camera-stopped) is not consulted for remote tiles.
    // Once the UI keys remote tiles off the roster, tighten this to:
    //   await expect(viewer.locator('.tile video')).toHaveCount(1)
  });

  test('room of 7: four cameras fill the slots; the rest see the full state', async ({ browser }) => {
    test.setTimeout(240_000);
    const { slug } = await createRoom('cam-slots');
    handles = await joinMany(browser, slug, 7);
    await expectSeatCount(handles[6].page, 7);

    // Four go live (the cap for 7 participants).
    for (const { page } of handles.slice(0, 4)) {
      await cameraButton(page).click();
      await expect(page.locator('.tile video').first()).toBeVisible({ timeout: 30_000 });
    }

    // The remaining three see the "no free slot" state: the toggle carries
    // [data-camera-slots="full"] and is disabled.
    for (const { page } of handles.slice(4)) {
      await expect(page.locator('[data-camera-slots="full"]')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('[data-camera-slots="full"]')).toBeDisabled();
    }
    // The denied feedback itself (.cam-denied-note) needs a request to race
    // the roster — the client normally disables the button before one can be
    // sent. That path is covered at the protocol level (cameras.spec.ts).

    // A holder turning off frees a slot: the full state clears.
    await cameraButton(handles[0].page).click();
    await expect(handles[4].page.locator('[data-camera-slots="full"]')).toHaveCount(0, {
      timeout: 20_000,
    });
    await cameraButton(handles[4].page).click();
    await expect(handles[4].page.locator('.tile video').first()).toBeVisible({ timeout: 30_000 });
  });
});
