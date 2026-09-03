/**
 * Watching something together: the room's first tool, and the worked
 * example the contract is written against (docs/tools.md).
 *
 * It was two tools until it was one. The split ran along the line between
 * YouTube and everything else, and it was a line the product had drawn
 * and the person had not: they had a link, and which shelf it belonged on
 * was our problem being handed to them. So the two folders became this
 * one, the link is read once and told apart here (link.ts), and the queue
 * that used to be YouTube's alone now takes anything — a video, an
 * episode found in somebody's page, a Twitch VOD — in one list.
 *
 * Almost everything it needs is in this folder: its state and how it
 * checks it (state.ts), the queue's moves (queue.ts), the two sync rules
 * that tell a person from a slow connection (sync.ts), the three players
 * it drives (youtube.ts, media.ts, twitch.ts), its strings (text.ts), its
 * glyphs (icons.tsx) and its two views.
 *
 * Two imports from outside this folder, and they are the honest cost of
 * what this tool does. `../../api` because finding a video in a page means
 * reading that page, and CORS forbids a browser from reading another
 * origin — so an app route does it (server/src/app/source-lookup.ts), and
 * this is its client. `../../lib/desktop` because the app's shell can open
 * a page in a window of its own and watch what it plays, which is the only
 * real answer for a site that hands out nothing until somebody clicks.
 * Both are guarded: no route, no shell, and the tool still works on
 * everything else — including, entirely offline from the app's point of
 * view, on YouTube.
 */
import type { ToolAnswer, ToolAsk, ToolDefinition, ToolNow } from '../contract';
import Shelf from './Shelf';
import Stage from './Stage';
import { WatchIcon } from './icons';
import { directCandidate } from './link';
import { advance, carried, enqueue, hasRoomFor, startWith } from './queue';
import { parseState, type WatchState } from './state';
import { TEXT } from './text';

/**
 * What a line typed in the chat means here (`/play`, `/queue`, `/skip`).
 *
 * The rule is the same one the shelf's field follows: a link this tool
 * can read on sight goes on at once, and a PAGE is not answered from a
 * command at all. Reading a page means a round trip and then somebody
 * choosing between the three things it turned out to hold — a choice that
 * belongs to a person in front of the shelf, not to a chat line guessing
 * on their behalf. Null sends them there with the link in hand.
 */
function accept(ask: ToolAsk, { state, at }: ToolNow<WatchState>): ToolAnswer<WatchState> | null {
  if (ask.kind === 'skip') {
    // Nothing on, nothing to move on from — and answering anyway would
    // claim an ask that another tool might have something to say about.
    return state ? { next: advance(state) } : null;
  }
  const found = directCandidate(ask.input);
  if (!found) {
    return null;
  }
  if (ask.kind === 'play' || !state) {
    return { next: startWith(found.item) };
  }
  if (!hasRoomFor(state, found.item)) {
    // Said in this tool's own words, in the reader's language.
    return { refused: 'queueFull' };
  }
  // Lining something up does not move the video, so the position has to
  // be written through or the room seeks back to it (queue.ts).
  return { next: enqueue(carried(state, at), found.item) };
}

export const watchTool: ToolDefinition<WatchState> = {
  id: 'watch',
  Icon: WatchIcon,
  text: TEXT,
  parseState,
  Shelf,
  Stage,
  accept,
};
