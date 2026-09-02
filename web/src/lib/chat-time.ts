/**
 * The day a message belongs to, in the reader's own words.
 *
 * A room can outlive a night, and a wall of times with no dates between them
 * is how "14:02" ends up meaning yesterday to one person and today to another.
 * The separator says which day it is, and says it the way the language does:
 * `Intl.RelativeTimeFormat` already knows "today" and "yesterday" in every
 * locale we ship, so no catalog key has to be invented — and none can go
 * missing in a translation.
 *
 * Everything here is local time on purpose: the boundary between two days is
 * the reader's midnight, not UTC's.
 */

/** `2026-09-02` in local time — what two timestamps share when they share a day. */
export function dayKey(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `now`'s midnight to `at`'s: 0 today, -1 yesterday. */
function daysApart(at: number, now: number): number {
  const midnight = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  return Math.round((midnight(at) - midnight(now)) / 86_400_000);
}

/**
 * "Today", "Yesterday", or the date written out. Capitalised at the front
 * because it heads a separator, and because most languages hand it over in
 * lower case ("hoje", "ayer").
 */
export function dayLabel(at: number, now: number, locale: string): string {
  const apart = daysApart(at, now);
  if (apart === 0 || apart === -1) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(apart, 'day');
    return capitalize(relative);
  }
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(at);
}

function capitalize(text: string): string {
  // `toLocaleUpperCase` and not `toUpperCase`: Turkish dotted i, one day.
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
