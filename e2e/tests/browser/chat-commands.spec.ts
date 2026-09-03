import { expect, test } from '@playwright/test';
import { baseUrl } from '../../helpers/env';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * Slash commands: the chat as a second door onto the dock and the chat's
 * own header.
 *
 * The risk here is wiring, and it points two ways. A command that does not
 * run is a key that went missing; a line that runs when it should not is
 * worse — somebody's message swallowed, or a room muted by a message about
 * muting. So both directions are checked, and the last case is the one
 * that matters most: a path (`/etc/hosts`) is a message, not a command.
 *
 * Nothing here matches on ambient copy. The command WORDS are not
 * translated and are safe to type; what is asserted is structure — how
 * many rows the list has, what the dock's keys say about themselves, what
 * ended up in a bubble.
 */
test.describe('chat commands', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('lists, completes and runs; leaves ordinary lines alone', async ({ browser }) => {
    const { slug } = await createRoom('chat-commands');
    handles = await joinMany(browser, slug, 1);
    const page = handles[0]!.page;

    await page.locator('button[data-key="C"]').click();
    const box = page.locator('.chat-panel textarea');
    const menu = page.getByRole('listbox');

    // A bare slash offers everything the build has, and says so to a
    // screen reader through the field rather than by taking the focus.
    await box.fill('/');
    await expect(menu).toBeVisible();
    const all = await menu.getByRole('option').count();
    expect(all).toBeGreaterThan(8);
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await expect(box).toBeFocused();

    // Typing narrows it; the highlight is the first row and moves with the
    // arrow keys, which the field reports as the active descendant.
    await box.fill('/s');
    const narrowed = await menu.getByRole('option').count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(all);
    const first = await box.getAttribute('aria-activedescendant');
    await box.press('ArrowDown');
    expect(await box.getAttribute('aria-activedescendant')).not.toBe(first);

    // Escape puts the list away and keeps both the text and the panel.
    await box.press('Escape');
    await expect(menu).toBeHidden();
    await expect(box).toHaveValue('/s');
    await expect(page.locator('.chat-panel')).toBeVisible();

    // Tab completes to the word and waits where the argument goes.
    await box.fill('/sea');
    await box.press('Tab');
    await expect(box).toHaveValue('/search ');

    // A command that takes nothing runs on the key that picks it: the
    // speaker key in the dock is the room's own answer for whether it did.
    const speaker = page.locator('button[aria-keyshortcuts="d"]');
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');
    await box.fill('/sou');
    await box.press('Enter');
    await expect(speaker).toHaveAttribute('aria-pressed', 'true');
    await expect(box).toHaveValue('');
    await box.fill('/sound');
    await box.press('Enter');
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');

    // /me is a message in the end, and lands in a bubble as emphasis.
    await box.fill('/me waves at the room');
    await box.press('Enter');
    await expect(page.locator('.chat-bubble em')).toHaveText('waves at the room');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);

    // /search opens the chat's own search on what came after it.
    await box.fill('/search waves');
    await box.press('Enter');
    await expect(page.getByRole('searchbox', { name: /search the messages/i })).toHaveValue('waves');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);
    await page.getByRole('searchbox', { name: /search the messages/i }).press('Escape');

    // A slash and a word nobody has: said so, nothing sent, text kept.
    await box.fill('/paly something');
    await box.press('Enter');
    await expect(page.locator('.chat-panel [role="status"]').last()).toBeVisible();
    await expect(box).toHaveValue('/paly something');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);

    // And the line that must never be read as a command: a path goes out
    // as what it is, as does a message that opens with a double slash.
    await box.fill('/etc/hosts is a file');
    await box.press('Enter');
    await box.fill('//sound is how you mute the room');
    await box.press('Enter');
    await expect(page.locator('.chat-bubble')).toHaveCount(3);
    await expect(page.locator('.chat-bubble').nth(1)).toContainText('/etc/hosts is a file');
    await expect(page.locator('.chat-bubble').nth(2)).toContainText('/sound is how you mute');
    // The speakers were never touched by a line that talks about them.
    await expect(speaker).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * The three that reach a tool. Nothing here leaves the machine: the two
   * addresses are on this run's own server and the page URL is never
   * fetched at all, which is the point of it.
   *
   * Both media addresses 404, so the tool swaps its player for its own
   * "this did not play here" line — which is the right thing for it to do
   * and none of this test's business. What is asserted is the state the
   * ROOM agreed on: the stage is up, the queue has one, the queue is
   * empty again, the stage is gone.
   */
  test('plays, queues and skips through the shelf, and hands a page back to it', async ({
    browser,
  }) => {
    const { slug } = await createRoom('chat-commands-watch');
    handles = await joinMany(browser, slug, 1);
    const page = handles[0]!.page;

    await page.locator('button[data-key="C"]').click();
    const box = page.locator('.chat-panel textarea');
    const tools = page.locator('button[data-key="T"]');

    // Nothing is on, so there is nothing to skip or to take off.
    await box.fill('/skip');
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(0);
    await box.fill('/stop');
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(0);

    // A media address is read here, in the browser, and goes on at once.
    await box.fill(`/play ${baseUrl()}/one.mp4`);
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(1);
    await expect(tools).toHaveClass(/control-active/);
    await expect(box).toHaveValue('');

    // The next one lines up behind it, and the strip says how many.
    await box.fill(`/queue ${baseUrl()}/two.mp4`);
    await box.press('Enter');
    await expect(page.locator('.watch-queued')).toBeVisible();

    // Skipping empties the queue and leaves the room watching.
    await box.fill('/skip');
    await box.press('Enter');
    await expect(page.locator('.watch-queued')).toHaveCount(0);
    await expect(page.locator('.watch-frame')).toHaveCount(1);

    // And off, for everybody.
    await box.fill('/stop');
    await box.press('Enter');
    await expect(page.locator('.watch-frame')).toHaveCount(0);
    await expect(tools).not.toHaveClass(/control-active/);

    // A PAGE is nobody's to play from a chat line: the shelf opens with
    // the link already in its field, and the person reads it from there.
    await box.fill('/play https://example.com/an/episode');
    await box.press('Enter');
    await expect(page.locator('.tools-menu')).toBeVisible();
    await expect(page.locator('.tools-menu .tool-field')).toHaveValue(
      'https://example.com/an/episode',
    );
    await expect(page.locator('.watch-frame')).toHaveCount(0);
  });
});
