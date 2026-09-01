import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/**
 * A file crosses the room peer-to-peer: the sender picks it in the chat, the
 * receiver accepts, and the bytes travel on the mesh's data channel — the
 * signaling socket carries only the SDP that set the channel up. The test
 * proves the full path with two real Chromium peers, then the decline path,
 * and that the received blob is byte-for-byte the offered file.
 */
test.describe('peer-to-peer file transfer', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('sends a multi-chunk file that the receiver accepts and can save', async ({ browser }) => {
    const { slug } = await createRoom('files');
    handles = await joinMany(browser, slug, 2);
    const [alice, bob] = handles;

    // 3 MiB of a known pattern: hundreds of 16 KiB chunks, and a checksum
    // the receiver can be held to.
    const size = 3 * 1024 * 1024;
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i += 1) {
      buffer[i] = (i * 7) % 251;
    }

    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();

    await alice.page.locator('.chat-panel input[type="file"]').setInputFiles({
      name: 'pattern.bin',
      mimeType: 'application/octet-stream',
      buffer,
    });

    const offered = bob.page.locator('.chat-file');
    await expect(offered).toContainText('pattern.bin', { timeout: 20_000 });
    await expect(offered).toContainText('wants to send you a file');
    await expect(offered).toContainText('3.1 MB');

    await offered.getByRole('button', { name: 'Accept' }).click();

    await expect(offered).toContainText('Received', { timeout: 30_000 });
    await expect(alice.page.locator('.chat-file')).toContainText('Sent', { timeout: 30_000 });

    // The save link carries the original name and a blob of the same bytes.
    const save = offered.getByRole('link', { name: /save/i });
    await expect(save).toHaveAttribute('download', 'pattern.bin');
    const href = await save.getAttribute('href');
    expect(href).toMatch(/^blob:/);
    const digest = await bob.page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let mismatch = -1;
      for (let i = 0; i < bytes.length; i += 1) {
        if (bytes[i] !== (i * 7) % 251) {
          mismatch = i;
          break;
        }
      }
      return { length: bytes.length, mismatch };
    }, href!);
    expect(digest).toEqual({ length: size, mismatch: -1 });

    await bob.page.screenshot({ path: 'test-results/file-transfer-received.png' });
  });

  test('a declined offer settles on both sides', async ({ browser }) => {
    const { slug } = await createRoom('files-decline');
    handles = await joinMany(browser, slug, 2);
    const [alice, bob] = handles;

    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();
    await alice.page.locator('.chat-panel input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });

    const offered = bob.page.locator('.chat-file');
    await expect(offered).toContainText('notes.txt', { timeout: 20_000 });
    await offered.getByRole('button', { name: 'Decline' }).click();

    await expect(offered).toContainText('Declined');
    await expect(alice.page.locator('.chat-file')).toContainText('Declined', { timeout: 20_000 });
  });
});
