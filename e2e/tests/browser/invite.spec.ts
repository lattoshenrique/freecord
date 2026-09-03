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
    const roomName = 'share invite';
    const { slug } = await createRoom(roomName);
    const guest = await joinRoomPage(browser, slug, 'host');
    handles = [guest];
    await guest.context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // A created room normally arrives with this fragment from the home page.
    // Put it on this HTTP-created fixture too: dropping it makes sealed chat
    // unreadable for the person who scans or pastes the invitation.
    const roomKey = '4qZp8bKx1jYv6tNc3mHs9dWr5fLg2aEu7iOo0sTxVPA';
    const encodedName = Buffer.from(roomName, 'utf8').toString('base64url');
    await guest.page.evaluate(({ key, name }) => {
      history.replaceState(null, '', `${location.pathname}#${key}~${name}`);
    }, { key: roomKey, name: encodedName });
    const invitation = `${guest.page.url().split('#')[0]}#${roomKey}~${encodedName}`;

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

  test('puts the room name in the compact link when a room is created', async ({ browser }) => {
    const roomName = 'Product sync 🚀';
    const encodedName = Buffer.from(roomName, 'utf8').toString('base64url');
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    handles = [{ context, page, name: '' }];
    await page.goto(baseUrl());

    await page.getByRole('textbox', { name: /room name/i }).fill(roomName);
    await page.getByRole('button', { name: /create room/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`/r/[A-Za-z0-9_-]{8,64}#[A-Za-z0-9_-]{43}~${encodedName}$`),
    );
  });

  test('decodes and reveals the room name immediately when an invitation is pasted', async ({ browser }) => {
    const roomName = 'Sala do João 🎙️';
    const { slug } = await createRoom(roomName);
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();
    handles = [{ context, page, name: '' }];
    await page.goto(baseUrl());

    const roomKey = '4qZp8bKx1jYv6tNc3mHs9dWr5fLg2aEu7iOo0sTxVPA';
    const encodedName = Buffer.from(roomName, 'utf8').toString('base64url');
    const invitation = `${baseUrl()}/r/${slug}#${roomKey}~${encodedName}`;
    const roomField = page.getByRole('textbox', { name: /room name/i });

    // The name is carried by the fragment. Prove the paste experience does
    // not wait for or depend on public room metadata.
    await page.route(`**/api/rooms/${slug}`, (route) => route.abort());
    await roomField.fill(invitation);

    await expect(roomField).toHaveValue(roomName);
    await expect(page.getByRole('status')).toHaveText(`Invite found: ${roomName}`);
    await expect(page.locator('.start-prompt')).toHaveAttribute('data-named-invite', 'true');
    await expect(page.locator('.start-prompt-sign')).toHaveCSS('color', 'rgb(110, 231, 183)');
    await expect(page.locator('.start-room-reveal')).toHaveText(roomName);
    expect(
      await page.locator('.start-room-reveal').evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('start-room-reveal');

    await page.unroute(`**/api/rooms/${slug}`);
    await page.getByRole('button', { name: /join room/i }).click();
    await expect(page).toHaveURL(new RegExp(`/r/${slug}#`));
    await expect(page.getByRole('textbox', { name: /rename the room/i })).toHaveValue(roomName);
  });
});
