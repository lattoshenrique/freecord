/**
 * @heavy — a real 12-context full room. Skipped unless E2E_HEAVY=1
 * (12 headless pages × a 12-peer WebRTC mesh is a workstation-sized job):
 *   npm run test:heavy --workspace e2e
 */
import { expect, test } from '@playwright/test';
import { createRoom, getRoom } from '../../helpers/http';
import {
  closeAll,
  expectSeatCount,
  joinMany,
  occupiedTiles,
  type RoomPageHandle,
} from '../../helpers/pages';

test.describe('full room @heavy', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('12 guests fill the room and it tears down clean', async ({ browser }) => {
    test.skip(!process.env.E2E_HEAVY, 'set E2E_HEAVY=1 to run the 12-context room');
    test.setTimeout(600_000);

    const { slug } = await createRoom('full-house');
    handles = await joinMany(browser, slug, 12);

    // Everyone agrees the room is full.
    for (const { page } of handles) {
      await expectSeatCount(page, 12);
      await expect(occupiedTiles(page)).toHaveCount(12, { timeout: 60_000 });
    }
    expect((await getRoom(slug)).participantCount).toBe(12);

    // Nobody crashed getting here.
    for (const { page } of handles) {
      expect(page.isClosed()).toBe(false);
      await expect(page.locator('.seat-count')).toBeVisible();
    }

    // Teardown: closing contexts sends the pagehide goodbye; the room empties.
    await closeAll(handles);
    handles = [];
    await expect
      .poll(async () => (await getRoom(slug)).participantCount, { timeout: 60_000 })
      .toBe(0);
  });
});
