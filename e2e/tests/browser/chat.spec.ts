import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * The unread badge on the chat button.
 *
 * It counts what arrived while the panel was shut, and clears the moment it
 * opens. Worth an end-to-end test because the counter shipped stuck at zero:
 * the increment read a ref that the same effect had already advanced, so the
 * badge never appeared and nothing in the unit-less UI said so.
 */
test.describe('chat unread badge', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('counts messages that land while the panel is shut, and clears on open', async ({ browser }) => {
    const { slug } = await createRoom('unread');
    handles = await joinMany(browser, slug, 2);
    const [watcher, sender] = handles;

    await sender.page.locator('button[data-key="C"]').click();
    const box = sender.page.locator('.chat-panel textarea');
    for (const text of ['one', 'two', 'three']) {
      await box.fill(text);
      await box.press('Enter');
    }

    const badge = watcher.page.locator('.chat-unread-badge');
    await expect(badge).toHaveText('3', { timeout: 20_000 });
    // The badge is decorative; the count has to reach a screen reader too.
    await expect(watcher.page.locator('button[data-key="C"]')).toHaveAttribute(
      'aria-label',
      /3 new messages/i,
    );

    await watcher.page.locator('button[data-key="C"]').click();
    await expect(badge).toHaveCount(0);
  });
});
