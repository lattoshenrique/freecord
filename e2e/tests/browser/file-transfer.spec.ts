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
    // Wider than the 1280px viewport: the viewer must scale it to fit.
    await alice.page.locator('.chat-panel input[type="file"]').setInputFiles({
      name: 'gradient.png',
      mimeType: 'image/png',
      buffer: pngOf(2000, 1400),
    });

    // The sender already holds the bytes: a thumbnail before anyone accepts.
    const sent = alice.page.locator('.chat-file');
    await expect(sent.locator('.chat-file-thumb img')).toBeVisible();
    await expect(sent.getByRole('link', { name: /save/i })).toHaveCount(0);

    // Images are taken without asking: no Accept step, straight to Received.
    const received = bob.page.locator('.chat-file');
    await expect(received).toContainText('Received', { timeout: 30_000 });
    await expect(received.getByRole('button', { name: 'Accept' })).toHaveCount(0);

    const thumb = received.locator('.chat-file-thumb img');
    await expect(thumb).toBeVisible();
    await expect
      .poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(2000);

    await received.locator('.chat-file-thumb').click();
    const viewer = bob.page.getByRole('dialog', { name: 'gradient.png' });
    await expect(viewer).toBeVisible();
    const full = viewer.locator('img.lightbox-image');
    // Real size capped by the screen: larger than the bubble's thumbnail,
    // never wider or taller than the viewport, aspect ratio kept.
    const box = await expect
      .poll(async () => full.evaluate((img) => {
        const r = img.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
      }))
      .toMatchObject({ vw: expect.any(Number) })
      .then(() => full.evaluate((img) => {
        const r = img.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
      }));
    expect(box.w).toBeLessThanOrEqual(box.vw);
    expect(box.h).toBeLessThanOrEqual(box.vh);
    expect(box.w).toBeGreaterThan(await thumb.evaluate((img) => img.getBoundingClientRect().width));
    expect(Math.abs(box.w / box.h - 2000 / 1400)).toBeLessThan(0.02);
    await bob.page.screenshot({ path: 'test-results/file-transfer-image-viewer.png' });

    // The viewer owns the keyboard: "m" must not reach the room's mic shortcut.
    await bob.page.keyboard.press('m');
    await expect(bob.page.getByRole('button', { name: /unmute microphone/i })).toBeVisible();

    await bob.page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('an incoming offer counts on the unread badge and rings the chime', async ({ browser }) => {
    const { slug } = await createRoom('files-unread');
    handles = await joinMany(browser, slug, 2);
    const [sender, watcher] = handles;

    // Spy on the oscillator so the chime is observable without audio output.
    await watcher.page.evaluate(() => {
      const spied = window as unknown as Window & { __tones: number[] };
      spied.__tones = [];
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function patched(this: AudioContext) {
        const oscillator = create.call(this);
        const setValue = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value: number, when: number) => {
          spied.__tones.push(value);
          return setValue(value, when);
        };
        return oscillator;
      };
    });

    // The watcher keeps the panel shut; only the sender opens it to attach.
    await sender.page.locator('button[data-key="C"]').click();
    await sender.page.locator('.chat-panel input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });

    const badge = watcher.page.locator('.chat-unread-badge');
    await expect(badge).toHaveText('1', { timeout: 20_000 });
    await expect(watcher.page.locator('button[data-key="C"]')).toHaveAttribute(
      'aria-label',
      /1 new message/i,
    );
    await expect
      .poll(() => watcher.page.evaluate(() => (window as unknown as { __tones: number[] }).__tones.length))
      .toBeGreaterThan(0);

    await watcher.page.locator('button[data-key="C"]').click();
    await expect(badge).toHaveCount(0);
    await expect(watcher.page.locator('.chat-file')).toContainText('notes.txt');
  });

  test('a file sent to a full room is one bubble for the sender', async ({ browser }) => {
    const { slug } = await createRoom('files-batch');
    handles = await joinMany(browser, slug, 3);
    const [sender, ...receivers] = handles;

    await sender.page.locator('button[data-key="C"]').click();
    await sender.page.locator('.chat-panel input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello room'),
    });

    // One bubble standing for two recipients, with a tally instead of a name.
    const bubble = sender.page.locator('.chat-file');
    await expect(bubble).toHaveCount(1);
    await expect(bubble).toHaveAttribute('data-batch-size', '2');
    await expect(bubble).toContainText('to 2 people');
    await expect(bubble).toContainText('Received by 0 of 2');

    for (const receiver of receivers) {
      await receiver.page.locator('button[data-key="C"]').click();
      const offered = receiver.page.locator('.chat-file');
      await expect(offered).toContainText('notes.txt', { timeout: 20_000 });
      await offered.getByRole('button', { name: 'Accept' }).click();
      await expect(offered).toContainText('Received', { timeout: 30_000 });
    }
    await expect(bubble).toContainText('Sent', { timeout: 30_000 });
    await expect(bubble).toHaveCount(1);
  });

  test('an image pasted into the field goes out as a transfer', async ({ browser }) => {
    const { slug } = await createRoom('files-paste');
    handles = await joinMany(browser, slug, 2);
    const [alice, bob] = handles;

    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();

    // A paste event carrying a PNG, the way a screenshot on the clipboard
    // arrives — no keyboard shortcut can reach the real clipboard headless.
    const png = pngOf(320, 200).toString('base64');
    await alice.page.locator('.chat-panel textarea').focus();
    await alice.page.locator('.chat-panel textarea').evaluate((area, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, png);

    // Named by the moment, not "image.png"; the field stays empty.
    const sent = alice.page.locator('.chat-file');
    await expect(sent).toContainText(/pasted-\d{8}-\d{6}\.png/);
    await expect(alice.page.locator('.chat-panel textarea')).toHaveValue('');

    const received = bob.page.locator('.chat-file');
    await expect(received).toContainText('Received', { timeout: 30_000 });
    await expect
      .poll(() => received.locator('.chat-file-thumb img').evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(320);
  });

  test('a pasted snippet becomes a code block, and a wall of text a file', async ({ browser }) => {
    const { slug } = await createRoom('files-paste-text');
    handles = await joinMany(browser, slug, 2);
    const [alice, bob] = handles;

    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();

    const area = alice.page.locator('.chat-panel textarea');
    // A synthetic paste event carries the clipboard but does not itself
    // insert anything — no keyboard shortcut can reach the real clipboard
    // headless. So what is asserted for a paste the composer does NOT take
    // over is that it left the event alone: `preventDefault` is the whole
    // difference between "the browser pastes this" and "we do".
    const paste = (text: string) =>
      area.evaluate((node, value) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', value);
        const event = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        node.dispatchEvent(event);
        return event.defaultPrevented;
      }, text);

    // Prose the field can hold is none of the composer's business: the
    // browser pastes it, and the browser's own undo still works.
    await area.focus();
    expect(
      await paste(
        'Vamos fechar a release hoje se o gate passar, e se nao passar eu aviso no chat ' +
          'para ninguem ficar esperando a tag aparecer sozinha.',
      ),
    ).toBe(false);
    await expect(area).toHaveValue('');

    // Code is read for what it is: fenced in the field with its language
    // named, and sent as the coloured block the viewer draws — never cut,
    // never shipped off as a nameless attachment.
    const snippet =
      'def sweep(peers, now):\n' +
      '    stale = [p for p in peers if now - p.last_seen > 35]\n' +
      '    for peer in stale:\n' +
      '        peers.remove(peer)\n' +
      '    return len(stale)';
    expect(await paste(snippet)).toBe(true);
    await expect(area).toHaveValue(new RegExp('^```python\\ndef sweep'));
    await area.press('Enter');

    const block = alice.page.locator('.chat-code[data-language="python"]').last();
    await expect(block).toContainText('def sweep(peers, now):');
    await expect(block.locator('.chat-code-lang')).toHaveText('Python');
    // Coloured by highlight.js, which only ever emits its own spans.
    await expect.poll(() => block.locator('code.hljs span').count()).toBeGreaterThan(0);
    await expect(bob.page.locator('.chat-code[data-language="python"]').last()).toContainText(
      'peers.remove(peer)',
    );

    // Past what a message may carry, and not code: the field stays empty and
    // the paste leaves as a file, whole.
    expect(await paste('x'.repeat(9_000))).toBe(true);
    const sent = alice.page.locator('.chat-file');
    await expect(sent).toContainText(/pasted-\d{8}-\d{6}\.txt/);
    await expect(area).toHaveValue('');
    await expect(alice.page.locator('.chat-file-note')).toContainText('as a file');

    const offered = bob.page.locator('.chat-file');
    await expect(offered).toContainText(/pasted-\d{8}-\d{6}\.txt/, { timeout: 20_000 });
    await offered.getByRole('button', { name: 'Accept' }).click();
    await expect(offered).toContainText('Received', { timeout: 30_000 });
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
