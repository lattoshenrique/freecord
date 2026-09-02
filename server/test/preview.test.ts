import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROOM_OG_IMAGE, roomPreviewHtml } from '../src/domain/preview.js';

const INDEX = fileURLToPath(new URL('../../web/index.html', import.meta.url));

describe('room link preview', () => {
  it('swaps every preview image for the invite card', async () => {
    const html = await readFile(INDEX, 'utf8');
    const room = roomPreviewHtml(html, 'https://freecord.example');

    // The real page is the fixture on purpose: this is the one thing that
    // silently stops working when someone reformats a meta tag.
    expect(html).toContain('/og.png');
    expect(room).not.toContain('/og.png');
    expect(room).toContain(`<meta property="og:image" content="https://freecord.example${ROOM_OG_IMAGE}" />`);
    expect(room).toContain(`<meta name="twitter:image" content="https://freecord.example${ROOM_OG_IMAGE}" />`);
  });

  it('says what the invite card shows, not what the front page shows', async () => {
    const html = await readFile(INDEX, 'utf8');
    const room = roomPreviewHtml(html, 'https://freecord.example');

    expect(room).toMatch(/<meta property="og:image:alt" content="An invitation to a Freecord room[^"]*" \/>/);
  });

  it('leaves the rest of the page alone', async () => {
    const html = await readFile(INDEX, 'utf8');
    const room = roomPreviewHtml(html, 'https://freecord.example');

    // The slug is the credential, so the invite says nothing more than the
    // front page does: same title, same description, same canonical. Only
    // the image lines may differ.
    const before = html.split('\n');
    const changed = room.split('\n').filter((line, index) => line !== before[index]);
    expect(changed).not.toHaveLength(0);
    for (const line of changed) {
      expect(line).toMatch(/og:image|twitter:image/);
    }
  });

  it('points the invite card at the origin the link was opened on', () => {
    const html = '<meta property="og:image" content="https://example.com/og.png" />';

    expect(roomPreviewHtml(html, 'http://localhost:5173')).toContain(
      'content="http://localhost:5173/og-room.png"',
    );
  });
});
