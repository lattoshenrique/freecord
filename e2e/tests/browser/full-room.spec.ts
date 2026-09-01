/**
 * @heavy — a real full room, one browser context per seat. Skipped unless
 * E2E_HEAVY=1 (twenty headless pages × a 20-peer WebRTC mesh is a
 * workstation-sized job):
 *   npm run test:heavy --workspace e2e
 */
import { expect, test } from '@playwright/test';
import { ROOM_LIMITS } from '../../../server/src/domain/room.js';
import { createRoom, getRoom } from '../../helpers/http';
import {
  closeAll,
  expectSeatCount,
  joinMany,
  occupiedTiles,
  type RoomPageHandle,
} from '../../helpers/pages';

const MAX = ROOM_LIMITS.maxParticipants;

test.describe('full room @heavy', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test(`${MAX} guests fill the room and it tears down clean`, async ({ browser }) => {
    test.skip(!process.env.E2E_HEAVY, `set E2E_HEAVY=1 to run the ${MAX}-context room`);
    test.setTimeout(600_000);

    const { slug } = await createRoom('full-house');
    handles = await joinMany(browser, slug, MAX);

    // Everyone agrees the room is full.
    for (const { page } of handles) {
      await expectSeatCount(page, MAX);
      await expect(occupiedTiles(page)).toHaveCount(MAX, { timeout: 120_000 });
    }
    expect((await getRoom(slug)).participantCount).toBe(MAX);

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
