import { expect, test, type Page } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinRoomPage, type RoomPageHandle } from '../../helpers/pages';

/**
 * The speaking ring, end to end: Chromium's fake microphone emits a tone,
 * so with two real peers in a room the use-speaking hook should light
 * `data-speaking` on the SELF tile (local analyser) and on the PEER tile
 * (analyser over the track that crossed the wire) — and mute must put the
 * tile out and keep it out, because a disabled track analyses as silence.
 *
 * The assertions target the attribute, not the CSS: the ring's visual rule
 * ships with the restyle track, and the attribute is the stable contract.
 */

/** The tile that belongs to `name` — its label carries the guest name. */
function tileOf(page: Page, name: string) {
  return page.locator('.tile').filter({ hasText: name });
}

test.describe('speaking indicator', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('tiles light while the fake mic beeps, and mute puts them out', async ({ browser }) => {
    const { slug } = await createRoom('speaking');
    const alice = await joinRoomPage(browser, slug, 'alice');
    const bob = await joinRoomPage(browser, slug, 'bob');
    handles = [alice, bob];

    // Prejoin defaults the mic to OFF, and off must mean dark: nobody's
    // tile may carry the attribute while both guests sit muted.
    await alice.page.waitForTimeout(1_500);
    await expect(alice.page.locator('.tile[data-speaking="true"]')).toHaveCount(0);

    // Open both mics — the dock button, not the prejoin, so the toggle
    // path (track.enabled) is the one under test.
    await alice.page.getByRole('button', { name: /unmute microphone/i }).click();
    await bob.page.getByRole('button', { name: /unmute microphone/i }).click();

    // Self path: alice's own analyser hears her fake mic. The tone pulses,
    // so the attribute may flap — the poll only needs to catch one window.
    await expect(tileOf(alice.page, 'alice')).toHaveAttribute('data-speaking', 'true', {
      timeout: 20_000,
    });
    // Remote path: bob's beeps crossed the wire and alice's analyser on the
    // received track heard them.
    await expect(tileOf(alice.page, 'bob')).toHaveAttribute('data-speaking', 'true', {
      timeout: 20_000,
    });

    // A lit frame for the visual record (the ring CSS ships with the
    // restyle track; when absent this still captures the grid, harmlessly).
    for (let i = 0; i < 20; i += 1) {
      if ((await alice.page.locator('.tile[data-speaking="true"]').count()) > 0) {
        break;
      }
      await alice.page.waitForTimeout(150);
    }
    await alice.page.screenshot({ path: 'test-results/speaking-ring.png' });

    // Mute alice. Her ring must go out on her own screen and on bob's —
    // and STAY out: the hold is 600 ms, so sampling well past it for a
    // while would catch any leak from a track that kept analysing loud.
    await alice.page.getByRole('button', { name: /mute microphone/i }).click();
    const selfTile = tileOf(alice.page, 'alice');
    const remoteTile = tileOf(bob.page, 'alice');
    await expect(selfTile).not.toHaveAttribute('data-speaking', 'true', { timeout: 5_000 });
    await expect(remoteTile).not.toHaveAttribute('data-speaking', 'true', { timeout: 5_000 });
    for (let i = 0; i < 8; i += 1) {
      await alice.page.waitForTimeout(250);
      await expect(selfTile).not.toHaveAttribute('data-speaking', 'true');
      await expect(remoteTile).not.toHaveAttribute('data-speaking', 'true');
    }

    // Unmute: the ring comes back — the analyser survived the toggle.
    await alice.page.getByRole('button', { name: /unmute microphone/i }).click();
    await expect(selfTile).toHaveAttribute('data-speaking', 'true', { timeout: 20_000 });
  });
});
