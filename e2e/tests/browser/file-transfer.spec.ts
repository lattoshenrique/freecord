import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinMany, type RoomPageHandle } from '../../helpers/pages';

/** A valid RGB PNG of the given size, filled with a gradient — no fixture file needed. */
function pngOf(width: number, height: number): Buffer {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c;
  });
  const crc32 = (bytes: Buffer): number => {
    let c = -1;
    for (const byte of bytes) {
      c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = Math.floor((x / width) * 255);
      raw[at + 1] = Math.floor((y / height) * 255);
      raw[at + 2] = 128;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

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

  test('an image previews inline on both sides and opens at full size', async ({ browser }) => {
    const { slug } = await createRoom('files-image');
    handles = await joinMany(browser, slug, 2);
    const [alice, bob] = handles;

    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();
    await alice.page.locator('.chat-panel input[type="file"]').setInputFiles({
      name: 'gradient.png',
      mimeType: 'image/png',
      buffer: pngOf(640, 480),
    });

    // The sender already holds the bytes: a thumbnail before anyone accepts.
    const sent = alice.page.locator('.chat-file');
    await expect(sent.locator('.chat-file-thumb img')).toBeVisible();
    await expect(sent.getByRole('link', { name: /save/i })).toHaveCount(0);

    const received = bob.page.locator('.chat-file');
    await expect(received).toContainText('gradient.png', { timeout: 20_000 });
    await expect(received.locator('.chat-file-thumb')).toHaveCount(0);
    await received.getByRole('button', { name: 'Accept' }).click();
    await expect(received).toContainText('Received', { timeout: 30_000 });

    const thumb = received.locator('.chat-file-thumb img');
    await expect(thumb).toBeVisible();
    await expect
      .poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(640);

    await received.locator('.chat-file-thumb').click();
    const viewer = bob.page.getByRole('dialog', { name: 'gradient.png' });
    await expect(viewer).toBeVisible();
    const full = viewer.locator('img.lightbox-image');
    // Natural size, not the bubble's fit.
    await expect.poll(() => full.evaluate((img) => img.getBoundingClientRect().width)).toBe(640);
    await bob.page.screenshot({ path: 'test-results/file-transfer-image-viewer.png' });

    // The viewer owns the keyboard: "m" must not reach the room's mic shortcut.
    await bob.page.keyboard.press('m');
    await expect(bob.page.getByRole('button', { name: /unmute microphone/i })).toBeVisible();

    await bob.page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
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
