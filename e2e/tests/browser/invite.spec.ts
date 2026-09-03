import { expect, test } from '@playwright/test';
import { baseUrl } from '../../helpers/env';
import { createRoom } from '../../helpers/http';
import { closeAll, joinRoomPage, type RoomPageHandle } from '../../helpers/pages';

/** The share button must hand off the exact credential-bearing room URL. */
test.describe('room invitation', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('copies the complete link and opens its QR panel', async ({ browser }) => {
    const { slug } = await createRoom('share invite');
    const guest = await joinRoomPage(browser, slug, 'host');
    handles = [guest];
    await guest.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // A created room normally arrives with this fragment from the home page.
    // Put it on this HTTP-created fixture too: dropping it makes sealed chat
    // unreadable for the person who scans or pastes the invitation.
    const roomKey = '4qZp8bKx1jYv6tNc3mHs9dWr5fLg2aEu7iOo0sTxVPA';
    await guest.page.evaluate((key) => {
      history.replaceState(null, '', `${location.pathname}#k=${key}`);
    }, roomKey);
    const invitation = `${guest.page.url()}&n=share+invite`;

    const shareButton = guest.page.getByRole('button', { name: /^invite$/i });
    await shareButton.click();

    const panel = guest.page.getByRole('dialog', { name: /share this room/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('textbox', { name: /room link/i })).toHaveValue(invitation);
    expect(await guest.page.evaluate(() => navigator.clipboard.readText())).toBe(invitation);

    const qr = panel.getByRole('img', { name: /qr code for this room/i });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('data-qr-content', invitation);
    await expect(qr).toHaveAttribute('data-error-correction', 'H');
    await expect(qr.locator(':scope > path')).toHaveAttribute('d', /.+/);
    await expect(qr.locator('[data-qr-logo="true"]')).toHaveCount(1);

    await panel.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(guest.page.locator('.control-invite')).toBeFocused();
  });

  test('reveals the encoded room name when an invitation is pasted', async ({ browser }) => {
    const roomName = 'Sala do João 🎙️';
    const { slug } = await createRoom(roomName);
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    handles = [{ context, page, name: '' }];
    await page.goto(baseUrl());

    const params = new URLSearchParams({
      k: '4qZp8bKx1jYv6tNc3mHs9dWr5fLg2aEu7iOo0sTxVPA',
      n: roomName,
    });
    const invitation = `${baseUrl()}/r/${slug}#${params}`;
    const roomField = page.getByRole('textbox', { name: /room name/i });
    await roomField.fill(invitation);

    await expect(roomField).toHaveValue(roomName);
    await expect(page.getByRole('status')).toHaveText(`Invite found: ${roomName}`);
    await expect(page.locator('.start-prompt')).toHaveAttribute('data-named-invite', 'true');
    await expect(page.locator('.start-room-reveal')).toHaveText(roomName);
    expect(
      await page.locator('.start-room-reveal').evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('start-room-reveal');

    await page.getByRole('button', { name: /join room/i }).click();
    await expect(page).toHaveURL(new RegExp(`/r/${slug}#`));
    await expect(page.getByRole('textbox', { name: /rename the room/i })).toHaveValue(roomName);
  });
});
