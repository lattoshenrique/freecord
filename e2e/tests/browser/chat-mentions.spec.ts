import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * Naming someone in the chat.
 *
 * The unit tests own the matching (web/test/mentions.test.ts); what only a
 * real room can show is the round trip: a half-typed `@` opens a list of
 * the people actually in this room, picking one completes the name in the
 * field, and what arrives on the OTHER screen is a chip with that person's
 * face on it — the same mascot their tile draws — marked as being about
 * the reader.
 */
test.describe('chat mentions', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('completes a name from the room and delivers it with a face', async ({ browser }) => {
    const { slug } = await createRoom('mentions');
    handles = await joinMany(browser, slug, 2);
    const [sender, receiver] = handles;

    await sender.page.locator('button[data-key="C"]').click();
    const box = sender.page.locator('.chat-panel textarea');
    await box.fill('@gu');

    // The list offers the room: ourselves first, then the other guest.
    const options = sender.page.locator('.mention-menu .mention-option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(1)).toContainText(receiver.name);
    // Every row wears the face it belongs to, not just the name.
    await expect(options.nth(1).locator('svg[data-avatar]')).toHaveCount(1);

    // Down to the other guest, Enter to take it: the name lands complete,
    // with the space that keeps it a mention when the sentence goes on.
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(box).toHaveValue(`@${receiver.name} `);

    await box.type('bom dia');
    await box.press('Enter');

    await receiver.page.locator('button[data-key="C"]').click();
    const mention = receiver.page.locator('.chat-panel .chat-mention');
    await expect(mention).toHaveText(`@${receiver.name}`, { timeout: 20_000 });
    await expect(mention.locator('svg[data-avatar]')).toHaveCount(1);
    // Said about the reader: louder chip, and a bubble marked for scrolling past.
    await expect(mention).toHaveAttribute('data-self', '');
    await expect(receiver.page.locator('.chat-bubble.mentions-me')).toHaveCount(1);

    // The sender's own copy names somebody else: no rail, no louder chip.
    await expect(sender.page.locator('.chat-bubble.mentions-me')).toHaveCount(0);
    await expect(sender.page.locator('.chat-panel .chat-mention')).toHaveText(
      `@${receiver.name}`,
    );
  });
});
