import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * What the chat can do with what was said: copy it, find it again, take it
 * with you. All three live entirely in the browser, so the risk they carry is
 * wiring — a filtered list that drops the wrong bubble, a copy key that copies
 * the rendered text instead of the markdown, a transcript built from a
 * timeline the panel had already filtered.
 *
 * Nothing here matches on ambient copy: several catalog keys draw one of
 * several phrasings per page load. Roles, accessible names and counts only.
 */
test.describe('chat tools', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('searches without accents, copies the markdown, saves the transcript', async ({
    browser,
  }) => {
    const { slug } = await createRoom('chat-tools');
    handles = await joinMany(browser, slug, 1);
    const [alice] = handles;
    const page = alice!.page;

    await page.locator('button[data-key="C"]').click();
    const box = page.locator('.chat-panel textarea');
    for (const text of ['quem revisa o café?', 'run `npm test` before pushing', 'shipping now']) {
      await box.fill(text);
      await box.press('Enter');
    }
    await expect(page.locator('.chat-bubble')).toHaveCount(3);

    // A day separator opens the run: every message here is from today.
    await expect(page.locator('.chat-day')).toHaveCount(1);

    // Search: no accent typed, the accented message found and marked.
    await page.getByRole('button', { name: /search the messages/i }).click();
    const field = page.getByRole('searchbox', { name: /search the messages/i });
    await field.fill('cafe');
    await expect(page.locator('.chat-bubble')).toHaveCount(1);
    await expect(page.locator('.chat-hit')).toHaveText('café');
    await expect(page.locator('.chat-search-count')).toHaveText(/1 hit/i);

    // Nothing matches: no bubbles left, and the count says so in a word.
    await field.fill('nowhere');
    await expect(page.locator('.chat-bubble')).toHaveCount(0);
    await expect(page.locator('.chat-search-count')).toHaveText(/0 hits/i);

    // Escape closes the search first, not the panel.
    await field.press('Escape');
    await expect(page.locator('.chat-search')).toHaveCount(0);
    await expect(page.locator('.chat-panel')).toBeVisible();
    await expect(page.locator('.chat-bubble')).toHaveCount(3);

    // Copy: the clipboard gets the markdown as typed, backticks included.
    await alice!.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const second = page.locator('.chat-bubble').nth(1);
    await second.hover();
    await second.getByRole('button', { name: /copy the message/i }).click();
    await expect(second.getByRole('button', { name: /^copied$/i })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'run `npm test` before pushing',
    );

    // The transcript: a markdown file, named after the room, with every line
    // in it — including the one the search had hidden a moment ago.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /save the conversation/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^freecord-chat-tools-.*\.md$/);
    const file = await download.createReadStream();
    const transcript = (await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      file.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.on('end', () => resolve(Buffer.concat(chunks)));
      file.on('error', reject);
    })).toString('utf8');
    expect(transcript).toContain('quem revisa o café?');
    expect(transcript).toContain('run `npm test` before pushing');
    expect(transcript).toContain('shipping now');
  });
});
