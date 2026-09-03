import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * The technical area at the top of the room. It is where somebody goes to
 * ask how their own network is doing — the question the room used to answer
 * by interrupting them with a banner.
 */
test.describe('room HUD', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('carries a loss reading once there is a link to measure', async ({ browser }) => {
    const { slug } = await createRoom('hud');
    handles = await joinMany(browser, slug, 2);
    const [alice] = handles;

    // Loss needs two samples (~2 s apart) to exist at all: it is a delta.
    const loss = alice.page.locator('.hud-metric', { hasText: 'loss' });
    await expect(loss).toHaveCount(1, { timeout: 20_000 });
    // A local link loses nothing, and the reading says so rather than
    // hiding: a number you can go and check is the whole point.
    await expect(loss).toContainText(/%$/);
  });
});
