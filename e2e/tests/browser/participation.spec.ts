import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, screenShareButton, type RoomPageHandle } from '../../helpers/pages';

/**
 * Refusing what the room sends, with real Chromium peers.
 *
 * The proof that matters is the asymmetry: one viewer who turned screens
 * off draws nothing while another viewer, in the same room and the same
 * share, is watching. Headless capture is the flaky part, so a share that
 * never lands for the WATCHING peer skips the test rather than failing it
 * — the same bargain screen.spec.ts makes.
 */
test.describe('taking part, or not', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('one viewer refuses screens; the other keeps watching the same share', async ({
    browser,
  }) => {
    const { slug } = await createRoom('participation');
    handles = await joinMany(browser, slug, 3);
    const [alice, bob, carol] = handles;

    // Bob steps out of screens, in the settings where the switch lives.
    await bob.page.getByRole('button', { name: 'Call settings' }).click();
    await bob.page.getByRole('tab', { name: 'General' }).click();
    const screensSwitch = bob.page.getByRole('switch', { name: "Other people's screens" });
    await expect(screensSwitch).toHaveAttribute('aria-checked', 'true');
    await screensSwitch.click();
    await expect(screensSwitch).toHaveAttribute('aria-checked', 'false');
    await bob.page.keyboard.press('Escape');

    await screenShareButton(alice.page).click();
    const landed = await carol.page
      .locator('.screen-video')
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!landed, 'headless display capture did not produce a stream');
    await expect(carol.page.locator('.screen-label')).toContainText(alice.name);

    // The room is watching; this one is not, and not as a hidden video
    // either — no screen element exists on his page at all.
    await expect(bob.page.locator('.screen-video')).toHaveCount(0);
    await expect(bob.page.locator('.tile-screen')).toHaveCount(0);
    // And he is still in the room: the stage fell back to a face.
    await expect(bob.page.locator('.stage-person')).toHaveCount(1);

    // The absent-screen watch must not quietly undo this. It hunts a
    // branch that named a source and received nothing — which is
    // exactly the shape of a refusal, on purpose — so it skips a tree
    // we asked to stop sending. Past its first ask (~6 s) and past the
    // ICE restart it would otherwise spend (~16 s), Bob still draws
    // nothing and Carol is still watching.
    await bob.page.waitForTimeout(18_000);
    await expect(bob.page.locator('.screen-video')).toHaveCount(0);
    await expect(bob.page.locator('.tile-screen')).toHaveCount(0);
    await expect(carol.page.locator('.screen-video')).toBeVisible();

    // The choice outlives the page: it is a preference, not a session
    // flag. (A reload here would land on the join screen, not the room —
    // so the durable part is asserted where it actually lives.)
    const stored = await bob.page.evaluate(() => localStorage.getItem('freecord:participation'));
    expect(stored && JSON.parse(stored)).toMatchObject({ screens: false });
  });
});
