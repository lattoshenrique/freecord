/**
 * What the desktop shell hands back from the picker window, checked.
 *
 * It arrives over our own bridge, from our own shell — and it is still
 * checked here, because the shell and the page ship separately and
 * neither gets to assume the other's version. What it carries is also,
 * by construction, whatever a third-party page decided to load: the
 * shell watched a stranger's requests and wrote down the addresses. That
 * is data from a page, not from us.
 */
import type { VideoCandidate } from '../../api';

const PLAYS = new Set(['file', 'hls', 'dash']);
const MAX = 12;

function playableUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The sources a picker window saw, in the order it saw them. Anything
 * malformed is dropped rather than repaired: a shorter list is a
 * perfectly good answer, and an empty one has its own message.
 */
export function parsePicked(raw: unknown): VideoCandidate[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const found: VideoCandidate[] = [];
  for (const item of raw.slice(0, MAX * 2)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const { play, url, label, live } = item as Record<string, unknown>;
    const href = playableUrl(url);
    if (!href || typeof play !== 'string' || !PLAYS.has(play)) {
      continue;
    }
    const candidate: VideoCandidate = {
      play: play as VideoCandidate['play'],
      url: href,
      // It was found by watching the page play it, which is a stronger
      // claim than anything markup makes.
      found: 'element',
    };
    if (typeof label === 'string' && label.trim()) {
      candidate.label = label.trim().slice(0, 60);
    }
    if (live === true) {
      candidate.live = true;
    }
    found.push(candidate);
    if (found.length >= MAX) {
      break;
    }
  }
  return found;
}
