import { describe, expect, it } from 'vitest';
import { buildTranscript, transcriptFilename, type TranscriptLabels } from '../src/lib/chat-transcript';

const labels: TranscriptLabels = {
  title: 'Freecord — {room}',
  savedAt: 'Saved on {when}',
  file: 'Sent a file: {files}',
  locked: 'Encrypted, no key on this device',
  replyTo: 'to {name}',
};

const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const time = (at: number) => new Date(at).toISOString().slice(11, 16);

const build = (lines: Parameters<typeof buildTranscript>[0]['lines']) =>
  buildTranscript({
    lines,
    room: 'Sprint sync',
    savedAt: Date.parse('2026-09-02T18:30:00Z'),
    labels,
    formatDay: day,
    formatTime: time,
  });

describe('buildTranscript', () => {
  it('writes a heading, the provenance line and the messages', () => {
    const out = build([
      { ts: Date.parse('2026-09-02T14:02:00Z'), author: 'Ana', text: 'shipping **now**' },
      { ts: Date.parse('2026-09-02T14:03:00Z'), author: 'Bruno', text: 'go' },
    ]);
    expect(out).toBe(
      [
        '# Freecord — Sprint sync',
        '',
        '_Saved on 2026-09-02 18:30_',
        '',
        '## 2026-09-02',
        '',
        '**14:02 · Ana**',
        '',
        'shipping **now**',
        '',
        '**14:03 · Bruno**',
        '',
        'go',
        '',
      ].join('\n'),
    );
  });

  it('opens a new day heading when the room crosses midnight', () => {
    const out = build([
      { ts: Date.parse('2026-09-02T23:59:00Z'), author: 'Ana', text: 'still here' },
      { ts: Date.parse('2026-09-03T00:01:00Z'), author: 'Ana', text: 'happy monday' },
    ]);
    expect(out).toContain('## 2026-09-02');
    expect(out).toContain('## 2026-09-03');
  });

  it('sorts by time, whatever order the room handed them over in', () => {
    const out = build([
      { ts: Date.parse('2026-09-02T14:05:00Z'), author: 'Bruno', text: 'second' },
      { ts: Date.parse('2026-09-02T14:04:00Z'), author: 'Ana', text: 'first' },
    ]);
    expect(out.indexOf('first')).toBeLessThan(out.indexOf('second'));
  });

  it('keeps the reply, the file line and the unreadable message apart', () => {
    const out = build([
      {
        ts: Date.parse('2026-09-02T14:02:00Z'),
        author: 'Bruno',
        text: 'on it',
        quote: { name: 'Ana', text: 'who takes the deploy?' },
      },
      { ts: Date.parse('2026-09-02T14:03:00Z'), author: 'Ana', files: ['notes.txt', 'shot.png'] },
      { ts: Date.parse('2026-09-02T14:04:00Z'), author: 'Carol', unreadable: true },
    ]);
    expect(out).toContain('> to Ana: who takes the deploy?');
    expect(out).toContain('on it');
    expect(out).toContain('Sent a file: notes.txt, shot.png');
    expect(out).toContain('_Encrypted, no key on this device_');
  });

  it('ends with exactly one newline', () => {
    const out = build([{ ts: Date.parse('2026-09-02T14:02:00Z'), author: 'Ana', text: 'bye' }]);
    expect(out.endsWith('bye\n')).toBe(true);
  });

  it('is still a valid file with nothing said in the room', () => {
    expect(build([])).toBe('# Freecord — Sprint sync\n\n_Saved on 2026-09-02 18:30_\n');
  });
});

describe('transcriptFilename', () => {
  const at = new Date(2026, 8, 2, 14, 32).getTime();

  it('slugs the room name into something every filesystem takes', () => {
    expect(transcriptFilename('Sprint sync', at)).toBe('freecord-sprint-sync-2026-09-02-1432.md');
    expect(transcriptFilename('Reunião: café/2', at)).toBe('freecord-reuniao-cafe-2-2026-09-02-1432.md');
  });

  it('falls back to a name with no room in it', () => {
    expect(transcriptFilename('🎧🎧', at)).toBe('freecord-2026-09-02-1432.md');
    expect(transcriptFilename('', at)).toBe('freecord-2026-09-02-1432.md');
  });

  it('never grows a filename past what a room name can push', () => {
    const name = transcriptFilename('x'.repeat(200), at);
    expect(name).toBe(`freecord-${'x'.repeat(40)}-2026-09-02-1432.md`);
  });
});
