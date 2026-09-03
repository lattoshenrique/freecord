import { describe, expect, it } from 'vitest';
import { COMMANDS, commandMatches, matchLocale, readLine } from '../src/lib/chat-commands';

/**
 * The list of things a person might type into a chat box, and what the
 * room is allowed to make of them.
 *
 * Half of these are about what is NOT a command: a path, a fraction, a
 * date, an emoticon. A chat where `/etc/hosts` costs somebody their
 * message is worse than a chat with no commands at all, so the ones that
 * must go through untouched come first.
 */
describe('reading a line', () => {
  it('sends ordinary text as it stands', () => {
    expect(readLine('hello room')).toEqual({ kind: 'message', text: 'hello room' });
    expect(readLine('  spaced out  ')).toEqual({ kind: 'message', text: 'spaced out' });
  });

  it('leaves anything that only looks like a command alone', () => {
    for (const text of ['/etc/hosts', '/2 of us', '/', '/-', '/9front', 'and /then', '/ mic']) {
      expect(readLine(text)).toEqual({ kind: 'message', text: text.trim() });
    }
  });

  it('eats one slash of a double one, so a room can talk about commands', () => {
    expect(readLine('//mic is how you mute')).toEqual({
      kind: 'message',
      text: '/mic is how you mute',
    });
  });

  it('refuses a slash it does not know instead of broadcasting the typo', () => {
    expect(readLine('/mci')).toEqual({ kind: 'unknown', name: 'mci' });
    expect(readLine('/mci now')).toEqual({ kind: 'unknown', name: 'mci' });
  });

  it('reads a command whatever case it was typed in', () => {
    const line = readLine('/MIC');
    expect(line.kind).toBe('command');
    expect(line.kind === 'command' && line.command.name).toBe('mic');
    expect(line.kind === 'command' && line.plan).toEqual({ kind: 'toggle', what: 'mic' });
  });

  it('plans the four device keys', () => {
    for (const what of ['mic', 'cam', 'sound', 'share'] as const) {
      expect(readLine(`/${what}`)).toMatchObject({ plan: { kind: 'toggle', what } });
    }
  });

  it('plans what the room watches', () => {
    expect(readLine('/play https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
      plan: { kind: 'play', link: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    expect(readLine('/queue https://example.com/film.mp4')).toMatchObject({
      plan: { kind: 'queue', link: 'https://example.com/film.mp4' },
    });
    expect(readLine('/skip')).toMatchObject({ plan: { kind: 'skip' } });
    // A queue needs to know what to line up; /play on its own does not,
    // and opens the shelf for somebody to choose from.
    expect(readLine('/queue')).toMatchObject({ plan: { kind: 'refused', why: 'usage' } });
    expect(readLine('/play')).toMatchObject({ plan: { kind: 'shelf', draft: '' } });
  });

  it('plans the room and the chat keys', () => {
    expect(readLine('/stop')).toMatchObject({ plan: { kind: 'stop' } });
    expect(readLine('/invite')).toMatchObject({ plan: { kind: 'invite' } });
    expect(readLine('/file')).toMatchObject({ plan: { kind: 'attach' } });
    expect(readLine('/save')).toMatchObject({ plan: { kind: 'save' } });
    expect(readLine('/leave')).toMatchObject({ plan: { kind: 'leave' } });
  });

  it('opens the search bare or on what came after it', () => {
    expect(readLine('/search')).toMatchObject({ plan: { kind: 'search', text: '' } });
    expect(readLine('/search  the café  ')).toMatchObject({
      plan: { kind: 'search', text: 'the café' },
    });
  });

  it('asks for the argument a command cannot do without', () => {
    expect(readLine('/me')).toMatchObject({ plan: { kind: 'refused', why: 'usage' } });
    expect(readLine('/lang')).toMatchObject({ plan: { kind: 'refused', why: 'usage' } });
  });

  it('takes a language by tag or by the language under it', () => {
    expect(readLine('/lang pt-BR')).toMatchObject({ plan: { kind: 'lang', locale: 'pt-BR' } });
    expect(readLine('/lang pt')).toMatchObject({ plan: { kind: 'lang', locale: 'pt-BR' } });
    expect(readLine('/lang JA')).toMatchObject({ plan: { kind: 'lang', locale: 'ja' } });
    expect(readLine('/lang klingon')).toMatchObject({ plan: { kind: 'refused', why: 'noLang' } });
  });

  it('writes an action in italics and leaves the name to the bubble', () => {
    expect(readLine('/me waves at everyone')).toMatchObject({
      plan: { kind: 'message', text: '*waves at everyone*' },
    });
  });

  it('shrugs on its own or after what was said', () => {
    expect(readLine('/shrug')).toMatchObject({ plan: { kind: 'message', text: '¯\\_(ツ)_/¯' } });
    expect(readLine('/shrug works here')).toMatchObject({
      plan: { kind: 'message', text: 'works here ¯\\_(ツ)_/¯' },
    });
  });
});

describe('offering commands while typing', () => {
  it('offers everything to a bare slash', () => {
    expect(commandMatches('/')).toHaveLength(COMMANDS.length);
  });

  it('narrows to the prefix, case and all', () => {
    expect(commandMatches('/s')?.map((command) => command.name)).toEqual([
      'sound',
      'share',
      'skip',
      'stop',
      'save',
      'search',
      'shrug',
    ]);
    expect(commandMatches('/SE')?.map((command) => command.name)).toEqual(['search']);
    expect(commandMatches('/zzz')).toEqual([]);
  });

  it('stops offering once the word is done and an argument is being typed', () => {
    expect(commandMatches('/search cafe')).toBeNull();
    expect(commandMatches('/mic ')).toBeNull();
    expect(commandMatches('hello')).toBeNull();
    expect(commandMatches('')).toBeNull();
  });
});

describe('matching a language', () => {
  it('knows the ones this build ships and nothing else', () => {
    expect(matchLocale('en-US')).toBe('en-US');
    expect(matchLocale('  ZH-cn ')).toBe('zh-CN');
    expect(matchLocale('zh-TW')).toBe('zh-CN');
    expect(matchLocale('de')).toBeNull();
    expect(matchLocale('')).toBeNull();
  });
});
