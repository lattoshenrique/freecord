/**
 * Slash commands: the chat as a way to work the room.
 *
 * Everything a command does, the dock, the shelf or the chat's own
 * header already does with a key or a click. What a command adds is
 * REACH: hands that are already typing never have to find the button,
 * and everything the room can do is one list away from a person who has
 * never found half of it. The talking and the doing in the same box.
 *
 * This module is the part with no room in it. It knows what the commands
 * are, what a typed line means, and what should happen — never how to
 * make it happen, which is the view's business (RoomView.tsx runs the
 * plan; ChatComposer.tsx draws the menu). So it is a pure function of a
 * string, and its test file is the list of things a person might type.
 *
 * Three rules the shapes below come out of:
 *
 *   A command word is never translated. `/play` is `/play` in five
 *   locales, the way `git commit` is not translated either: the word is
 *   part of the app, the sentence explaining it is not. What IS
 *   translated is every line the menu shows about it.
 *
 *   Nothing typed here is ever sent to the room by accident. A line that
 *   opens with a slash and names nothing this build knows is refused with
 *   the text still in the field — the alternative is broadcasting a typo
 *   for `/play` to twenty people.
 *
 *   And a way out: `//` sends a message that begins with one slash, for
 *   whoever wants to talk about a command instead of running it.
 */
import { LOCALES, type Locale, type Translate } from '../i18n';
import type { MessageKey } from '../i18n/locales/en-US';

/** What a command takes after its word, when it takes anything. */
export interface CommandArg {
  /** What to call it in the menu: "link", "text", "code". */
  key: MessageKey;
  /** Without it, the command refuses rather than guessing. */
  required: boolean;
}

export interface ChatCommand {
  /** The word after the slash, lowercase, and the same in every language. */
  name: string;
  /** The line the menu shows under the word. */
  describe: MessageKey;
  arg?: CommandArg;
}

/**
 * The commands this build has, in the order the menu lists them: what
 * your own devices do first — the four a person reaches for mid-sentence
 * — then what the room is watching, then the chat's own business, and
 * the bit of theatre at the end.
 *
 * The order is also the order they are offered while typing, so the ones
 * a room reaches for most sit at the top of a bare `/`.
 */
export const COMMANDS: readonly ChatCommand[] = [
  { name: 'mic', describe: 'cmd.mic' },
  { name: 'cam', describe: 'cmd.cam' },
  { name: 'sound', describe: 'cmd.sound' },
  { name: 'share', describe: 'cmd.share' },
  { name: 'play', describe: 'cmd.play', arg: { key: 'cmd.arg.link', required: false } },
  { name: 'queue', describe: 'cmd.queue', arg: { key: 'cmd.arg.link', required: true } },
  { name: 'skip', describe: 'cmd.skip' },
  { name: 'stop', describe: 'cmd.stop' },
  { name: 'invite', describe: 'cmd.invite' },
  { name: 'file', describe: 'cmd.file' },
  { name: 'save', describe: 'cmd.save' },
  { name: 'search', describe: 'cmd.search', arg: { key: 'cmd.arg.text', required: false } },
  { name: 'lang', describe: 'cmd.lang', arg: { key: 'cmd.arg.code', required: true } },
  { name: 'me', describe: 'cmd.me', arg: { key: 'cmd.arg.text', required: true } },
  { name: 'shrug', describe: 'cmd.shrug', arg: { key: 'cmd.arg.text', required: false } },
  { name: 'leave', describe: 'cmd.leave' },
];

/**
 * What running a command comes to. Every one of these is something the
 * room view can already do by other means — which is the point: a command
 * is a second door onto the same feature, never a feature of its own.
 */
export type CommandPlan =
  /** Send this as an ordinary message (`/me`, `/shrug`). */
  | { kind: 'message'; text: string }
  /** Put this on for the room now, or line it up behind what is on. */
  | { kind: 'play'; link: string }
  | { kind: 'queue'; link: string }
  /** Move on to whatever is lined up next. */
  | { kind: 'skip' }
  /** Take what the room has on off the stage, for everybody. */
  | { kind: 'stop' }
  /**
   * Open the shelf, with this text handed to the panel that opens —
   * where a link nothing could play on sight goes to be looked at.
   */
  | { kind: 'shelf'; draft: string }
  | { kind: 'toggle'; what: 'mic' | 'cam' | 'sound' | 'share' }
  | { kind: 'invite' }
  | { kind: 'attach' }
  | { kind: 'save' }
  /** Open the search over the chat, on this text (empty opens it bare). */
  | { kind: 'search'; text: string }
  | { kind: 'lang'; locale: Locale }
  | { kind: 'leave' }
  /**
   * The command was understood and cannot run as typed: it wants an
   * argument, or the one it got is not a language this build has. The
   * view says which and keeps what was typed.
   */
  | { kind: 'refused'; why: 'usage' | 'noLang' };

/** What a line in the composer turns out to be. */
export type ChatLine =
  /** Not a command at all: send it as it stands. */
  | { kind: 'message'; text: string }
  /** It opened like a command and named nothing we have. */
  | { kind: 'unknown'; name: string }
  | { kind: 'command'; command: ChatCommand; plan: CommandPlan };

/**
 * A line that opens with a slash and one word. The word is deliberately
 * narrow — letters, digits and dashes — so that a path (`/etc/hosts`),
 * a fraction (`/2`) or an emoticon never reads as a command and never
 * costs anybody their message.
 */
const LINE = /^\/([a-z][a-z0-9-]{0,15})(?:\s+([\s\S]*))?$/i;

/** The word being typed after a bare slash, before any argument. */
const TYPING = /^\/([a-z0-9-]{0,16})$/i;

/**
 * How a command is written out: the word, and what it wants after it in
 * the reader's own language. The menu shows this, and so does the line
 * that says a command cannot run without its argument — the same
 * sentence in both places, so one teaches the other.
 */
export function usageOf(command: ChatCommand, t: Translate): string {
  return command.arg ? `/${command.name} <${t(command.arg.key)}>` : `/${command.name}`;
}

export function findCommand(name: string): ChatCommand | null {
  const wanted = name.toLowerCase();
  return COMMANDS.find((command) => command.name === wanted) ?? null;
}

/**
 * The commands to offer for what is in the field, or null when the field
 * is not asking for any — which is the difference between `/pl` (still
 * naming a command) and `/play something` (past that, and typing an
 * argument now). A bare `/` offers everything, which is how somebody who
 * has never read this file finds out the commands exist.
 */
export function commandMatches(draft: string): readonly ChatCommand[] | null {
  const typed = TYPING.exec(draft);
  if (!typed) {
    return null;
  }
  const prefix = (typed[1] ?? '').toLowerCase();
  return COMMANDS.filter((command) => command.name.startsWith(prefix));
}

/**
 * The locale a `/lang` argument names: the tag itself (`pt-BR`), the
 * language under it (`pt`, which lands on pt-BR the way a browser's
 * language list does), or null for anything else. Case is forgiven; a
 * guess is not made.
 */
export function matchLocale(input: string): Locale | null {
  const wanted = input.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const exact = LOCALES.find((locale) => locale.id.toLowerCase() === wanted);
  if (exact) {
    return exact.id;
  }
  const base = LOCALES.find((locale) => locale.id.split('-')[0] === wanted.split('-')[0]);
  return base ? base.id : null;
}

/** Every language code this build answers to, for the line that says so. */
export function localeCodes(): string {
  return LOCALES.map((locale) => locale.id).join(', ');
}

/**
 * The shrug, and the one thing standing between it and the markdown
 * renderer: `_(ツ)_` is emphasis to any renderer that reads underscores,
 * ours included, so the glyph the room gets has to survive the trip
 * (lib/markdown.tsx leaves a backslashed underscore alone for exactly
 * this reason).
 */
const SHRUG = '¯\\_(ツ)_/¯';

function planFor(command: ChatCommand, rest: string): CommandPlan {
  if (command.arg?.required && !rest) {
    return { kind: 'refused', why: 'usage' };
  }
  switch (command.name) {
    case 'play':
      // With nothing after it, the shelf: `/play` is then the long way
      // round to pressing T, and the choosing happens there.
      return rest ? { kind: 'play', link: rest } : { kind: 'shelf', draft: '' };
    case 'queue':
      return { kind: 'queue', link: rest };
    case 'skip':
      return { kind: 'skip' };
    case 'stop':
      return { kind: 'stop' };
    case 'mic':
    case 'cam':
    case 'sound':
    case 'share':
      return { kind: 'toggle', what: command.name };
    case 'invite':
      return { kind: 'invite' };
    case 'file':
      return { kind: 'attach' };
    case 'save':
      return { kind: 'save' };
    case 'search':
      return { kind: 'search', text: rest };
    case 'lang': {
      const locale = matchLocale(rest);
      return locale ? { kind: 'lang', locale } : { kind: 'refused', why: 'noLang' };
    }
    case 'me':
      // Italics, which is what every chat has meant by /me since IRC. The
      // name is already on the bubble, so the line is the action alone.
      return { kind: 'message', text: `*${rest}*` };
    case 'shrug':
      return { kind: 'message', text: rest ? `${rest} ${SHRUG}` : SHRUG };
    case 'leave':
      return { kind: 'leave' };
    default:
      // A command in the table with nothing planned for it here. Nothing
      // is sent to the room on a shrug: it is refused like a typo.
      return { kind: 'refused', why: 'usage' };
  }
}

/**
 * What the composer is holding: a message, a command to run, or a slash
 * followed by a word this build does not have.
 */
export function readLine(draft: string): ChatLine {
  const text = draft.trim();
  // `//anything` is the escape hatch: one slash is eaten and the rest is
  // talk, so a room can discuss `/play` without playing anything.
  if (text.startsWith('//')) {
    return { kind: 'message', text: text.slice(1) };
  }
  const line = LINE.exec(text);
  if (!line) {
    return { kind: 'message', text };
  }
  const name = line[1]!.toLowerCase();
  const command = findCommand(name);
  if (!command) {
    return { kind: 'unknown', name };
  }
  return { kind: 'command', command, plan: planFor(command, (line[2] ?? '').trim()) };
}
