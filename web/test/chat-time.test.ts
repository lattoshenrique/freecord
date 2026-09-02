import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel } from '../src/lib/chat-time';

const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

describe('dayKey', () => {
  it('is the local calendar day, not UTC’s', () => {
    expect(dayKey(at(2026, 9, 2, 23, 59))).toBe('2026-09-02');
    expect(dayKey(at(2026, 9, 3, 0, 1))).toBe('2026-09-03');
  });
});

describe('dayLabel', () => {
  const now = at(2026, 9, 2, 15);

  it('says today and yesterday in the room’s language', () => {
    expect(dayLabel(at(2026, 9, 2, 9), now, 'en-US')).toBe('Today');
    expect(dayLabel(at(2026, 9, 1, 23), now, 'en-US')).toBe('Yesterday');
    expect(dayLabel(at(2026, 9, 2, 9), now, 'pt-BR')).toBe('Hoje');
  });

  it('counts the boundary as the reader’s midnight, not 24 hours back', () => {
    // 01:00 today and 23:00 yesterday are two hours apart and two days.
    expect(dayLabel(at(2026, 9, 2, 1), at(2026, 9, 2, 3), 'en-US')).toBe('Today');
    expect(dayLabel(at(2026, 9, 1, 23), at(2026, 9, 2, 1), 'en-US')).toBe('Yesterday');
  });

  it('writes the date out once it is older than that', () => {
    const older = dayLabel(at(2026, 8, 20), now, 'en-US');
    expect(older).toContain('Aug');
    expect(older).toContain('20');
    expect(dayLabel(at(2025, 12, 24), now, 'en-US')).toContain('2025');
  });
});
