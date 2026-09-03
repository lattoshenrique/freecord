import { describe, expect, it } from 'vitest';
import { detectCode, languageLabel, languageOfFileName } from '../src/lib/code-detect';
import { markup } from '../src/lib/highlight';

const LOREM = `What is Lorem Ipsum?
Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem
Ipsum has been the industry's standard dummy text ever since 1966, when designers
at Letraset and James Mosley, the librarian at St Bride Printing Library in
London, took a 1914 Cicero translation and scrambled it to make dummy text for
Letraset's Body Type sheets.`;

describe('detectCode', () => {
  it('reads JSON by parsing it, not by guessing', async () => {
    const detected = await detectCode('{\n  "room": "guest",\n  "peers": [1, 2, 3],\n  "locked": false\n}');
    expect(detected?.language).toBe('json');
    expect(detected?.extension).toBe('json');
  });

  it('places the languages a room actually pastes', async () => {
    const samples: Array<[RegExp, string]> = [
      [
        // hljs reads a small annotated snippet as either half of the pair;
        // both colour it the same, so both are a pass.
        /^(?:type|java)script$/,
        'export function bodyBudget(quote: ChatQuote | null, budget = 2000): number {\n' +
          '  return quote ? Math.max(0, budget - encodeChatBody("", quote).length) : budget;\n}',
      ],
      [
        /^python$/,
        'def sweep(peers, now):\n' +
          '    stale = [p for p in peers if now - p.last_seen > 35]\n' +
          '    for peer in stale:\n        peers.remove(peer)\n    return len(stale)',
      ],
      [
        /^css$/,
        '.chat-code {\n  position: relative;\n  border-radius: 12px;\n' +
          '  background: var(--surface-2);\n  overflow-x: auto;\n}',
      ],
      [
        /^xml$/,
        '<section class="room">\n  <h1>Freecord</h1>\n' +
          '  <button type="button" data-key="C">Chat</button>\n</section>',
      ],
    ];
    for (const [language, source] of samples) {
      const detected = await detectCode(source);
      expect(detected?.language ?? '', source.slice(0, 30)).toMatch(language);
    }
  });

  it('leaves prose alone — a paragraph is not code for having keywords in it', async () => {
    expect(await detectCode(LOREM)).toBeNull();
    expect(
      await detectCode(
        'Vamos fechar a release hoje se o gate passar, e se não passar eu aviso ' +
          'no chat para ninguém ficar esperando a tag aparecer sozinha.',
      ),
    ).toBeNull();
  });

  it('leaves a short line alone, whatever it looks like', async () => {
    expect(await detectCode('a = 1;')).toBeNull();
  });

  it('names languages for people, and reads them back off a file name', () => {
    expect(languageLabel('typescript')).toBe('TypeScript');
    expect(languageLabel('nothing')).toBeNull();
    expect(languageOfFileName('pasted-20260903-021453.json')).toBe('json');
    expect(languageOfFileName('notes.txt')).toBeNull();
  });
});

describe('markup', () => {
  it('escapes the code it is given — the only reason it may be set as HTML', () => {
    const html = markup('<script>alert(document.cookie)</script>', 'xml');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;');
    // Every tag it does emit is one of its own spans.
    for (const tag of html.match(/<[^>]+>/g) ?? []) {
      expect(tag).toMatch(/^<\/?span(?: class="[a-z0-9_ -]+")?>$/);
    }
  });
});
