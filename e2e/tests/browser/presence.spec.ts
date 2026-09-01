import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, joinRoomPage, type RoomPageHandle } from '../../helpers/pages';

/**
 * Mic and speakers are presence: what one person switches off shows on
 * their tile in everyone else's room, and a late joiner sees it from the
 * welcome roster. The mic case is the one that needs the server's word —
 * a disabled track keeps flowing as silence, so nothing on the mesh says
 * the mic is off.
 */
test.describe('mute and deafen presence', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('mic off and speakers off show on the other side, and to a late joiner', async ({ browser }) => {
    const { slug } = await createRoom('presence');
    handles = await joinMany(browser, slug, 2);
    const [alice, bob] = handles;
    const aliceOnBob = bob.page.locator('.tile').filter({ hasText: alice.name });
    await expect(aliceOnBob).toHaveCount(1, { timeout: 20_000 });
    // The prejoin joins with the mic off: that is announced with the seat.
    await expect(aliceOnBob.locator('.tile-mic-off')).toHaveCount(1, { timeout: 15_000 });
    await expect(aliceOnBob.locator('.tile-deafened')).toHaveCount(0);

    // Mic on, then off again: the others follow each switch.
    await alice.page.locator('button[data-key="M"]').click();
    await expect(aliceOnBob.locator('.tile-mic-off')).toHaveCount(0, { timeout: 15_000 });
    await alice.page.locator('button[data-key="M"]').click();
    await expect(aliceOnBob.locator('.tile-mic-off')).toHaveCount(1, { timeout: 15_000 });

    // Speakers off: the others see that too (the mic was already off).
    await alice.page.locator('button[data-key="D"]').click();
    await expect(aliceOnBob.locator('.tile-deafened')).toHaveCount(1, { timeout: 15_000 });
    await expect(aliceOnBob.locator('.tile-mic-off')).toHaveCount(1);

    // A late joiner learns both from the welcome roster.
    const carol = await joinRoomPage(browser, slug, 'carol');
    handles.push(carol);
    const aliceOnCarol = carol.page.locator('.tile').filter({ hasText: alice.name });
    await expect(aliceOnCarol.locator('.tile-deafened')).toHaveCount(1, { timeout: 15_000 });
    await expect(aliceOnCarol.locator('.tile-mic-off')).toHaveCount(1);
    await carol.page.screenshot({ path: 'test-results/presence-late-joiner.png' });

    // Speakers back: the mic was off before, so it stays off.
    await alice.page.locator('button[data-key="D"]').click();
    await expect(aliceOnBob.locator('.tile-deafened')).toHaveCount(0, { timeout: 15_000 });
    await expect(aliceOnBob.locator('.tile-mic-off')).toHaveCount(1);

    // Mic back on clears the last indicator for everyone.
    await alice.page.locator('button[data-key="M"]').click();
    await expect(aliceOnBob.locator('.tile-mic-off')).toHaveCount(0, { timeout: 15_000 });
    await expect(aliceOnCarol.locator('.tile-mic-off')).toHaveCount(0, { timeout: 15_000 });
  });
});
