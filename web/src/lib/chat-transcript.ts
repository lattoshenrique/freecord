/**
 * The transcript: the conversation as a markdown file, built in the browser.
 *
 * Chat here is deliberately ephemeral — sealed on the way out, never stored by
 * a server, gone when the room dies. That is the promise, and it has a cost:
 * the decision someone typed at 14:02 dies with it too. This is the honest
 * answer to that, and the only one that keeps the promise intact — the file is
 * assembled from what this browser already has in memory, saved by the person
 * who was in the room, on the machine they were in it from. Nothing is
 * uploaded, nothing is kept behind their back, and a message nobody saved is
 * still gone forever.
 *
 * What goes in: what was said, who said it, when. Explicitly NOT the room's
 * tool state — a shared video's URL can be a link minted for one viewer, and
 * a transcript is a file that leaves the room.
 *
 * The body is written as markdown because that is what people typed: a code
 * block pasted into chat comes back out of the file as a code block.
 */

export interface TranscriptLine {
  /** When it happened, epoch ms. */
  ts: number;
  /** Who said it, as the room knew them then. */
  author: string;
  /** What was said, still in markdown. Absent on a file line. */
  text?: string;
  /** The message this one answered, as the sender excerpted it. */
  quote?: { name: string; text: string } | null;
  /** File names, for a transfer line. */
  files?: readonly string[];
  /** Sealed for a key this client never held: there is nothing to write down. */
  unreadable?: boolean;
}

export interface TranscriptLabels {
  /** Title line, takes {room}. */
  title: string;
  /** Provenance line, takes {when}. */
  savedAt: string;
  /** A file transfer, takes {files}. */
  file: string;
  /** Stands in for a message this client could not read. */
  locked: string;
  /** Reply preamble, takes {name}. */
  replyTo: string;
}

/**
 * Renders the transcript. `formatDay` and `formatTime` come from the caller's
 * Intl formatters, so the file reads in the room's language and the visitor's
 * own clock — a transcript with someone else's timezone in it is a trap.
 */
export function buildTranscript({
  lines,
  room,
  savedAt,
  labels,
  formatDay,
  formatTime,
}: {
  lines: readonly TranscriptLine[];
  room: string;
  savedAt: number;
  labels: TranscriptLabels;
  formatDay: (at: number) => string;
  formatTime: (at: number) => string;
}): string {
  const out: string[] = [
    `# ${fill(labels.title, { room })}`,
    '',
    `_${fill(labels.savedAt, { when: `${formatDay(savedAt)} ${formatTime(savedAt)}` })}_`,
  ];
  let day = '';
  for (const line of [...lines].sort((a, b) => a.ts - b.ts)) {
    const today = formatDay(line.ts);
    if (today !== day) {
      day = today;
      out.push('', `## ${today}`);
    }
    out.push('', `**${formatTime(line.ts)} · ${line.author}**`);
    if (line.files?.length) {
      out.push('', fill(labels.file, { files: line.files.join(', ') }));
      continue;
    }
    if (line.unreadable) {
      out.push('', `_${labels.locked}_`);
      continue;
    }
    if (line.quote) {
      // The quote is one line by construction (chat-body.ts clamps it), so a
      // single `> ` prefix cannot leak into the message below it.
      out.push('', `> ${fill(labels.replyTo, { name: line.quote.name })}: ${line.quote.text}`);
    }
    out.push('', line.text ?? '');
  }
  // A trailing newline: a file without one annoys every tool that reads it.
  return `${out.join('\n').trimEnd()}\n`;
}

/**
 * `freecord-<room>-2026-09-02-1432.md`. The room name is whatever someone
 * typed into the rename box, so it is reduced to something every filesystem
 * accepts before it becomes a filename.
 */
export function transcriptFilename(room: string, savedAt: number): string {
  const at = new Date(savedAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const slug = room
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug ? `freecord-${slug}-${stamp}.md` : `freecord-${stamp}.md`;
}

/** The same `{name}` interpolation the catalogs use, on an already-translated string. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}
