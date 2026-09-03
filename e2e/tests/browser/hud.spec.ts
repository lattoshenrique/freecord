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

  test('says how the links are doing, not just how fast they are', async ({ browser }) => {
    const { slug } = await createRoom('hud-peers');
    handles = await joinMany(browser, slug, 2);
    const [alice] = handles;

    // One link, up: the count is the first thing that goes wrong in a mesh.
    const links = alice.page.locator('.hud-metric', { hasText: 'links' });
    await expect(links).toHaveCount(1, { timeout: 20_000 });
    await expect(links).toContainText('1/1');

    // Two browsers on one machine find each other on the same network.
    const path = alice.page.locator('.hud-metric', { hasText: 'path' });
    await expect(path).toContainText('host', { timeout: 20_000 });

    // The voice numbers behind an RTT that looks fine.
    await expect(alice.page.locator('.hud-metric', { hasText: 'jitter' })).toContainText(/ms$/, {
      timeout: 20_000,
    });
    await expect(alice.page.locator('.hud-metric', { hasText: 'codec' })).toContainText('opus', {
      timeout: 20_000,
    });
  });
});
