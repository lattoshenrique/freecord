import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, expectSeatCount, joinMany, leaveRoom, occupiedTiles, type RoomPageHandle } from '../../helpers/pages';

test.describe('room smoke', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('three guests join and everyone sees the same occupancy', async ({ browser }) => {
    const { slug } = await createRoom('smoke');
    handles = await joinMany(browser, slug, 3);

    for (const { page } of handles) {
      await expectSeatCount(page, 3);
      // Three occupied tiles (self + two peers) on every screen.
      await expect(occupiedTiles(page)).toHaveCount(3, { timeout: 20_000 });
    }

    // Ghost/empty seats: not in the current UI; asserted only if the
    // parallel restyle lands them (defensive — see README brittleness notes).
    const ghosts = handles[0].page.locator('.tile-seat');
    if ((await ghosts.count()) > 0) {
      expect(await ghosts.count()).toBe(20 - 3);
    }

    // One guest leaves (navigation fires the pagehide goodbye); the
    // others converge to 2/20.
    const leaver = handles.pop()!;
    await leaveRoom(leaver);
    for (const { page } of handles) {
      await expectSeatCount(page, 2);
      await expect(occupiedTiles(page)).toHaveCount(2, { timeout: 20_000 });
    }
  });
});
