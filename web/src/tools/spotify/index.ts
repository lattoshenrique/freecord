/**
 * Listening together: the room's third tool, and the one that promises
 * the least on purpose.
 *
 * Its two neighbours drive a player. This one does not, and cannot: it
 * touches nothing of Spotify's — no data API, no key, no iframe API, no
 * account — and Spotify's embed is the only thing it puts on the stage.
 * So what the room shares is the RECORD, not the needle: the same link
 * reaches everybody at once, with a lineup behind it anyone may add to,
 * jump down or take off, and each person presses play on their own copy.
 * It is somebody saying "listen to this" and passing it round, which is
 * what the room was doing anyway.
 *
 * What that buys, and what it costs, both belong in the open:
 *
 *   bought   nothing to sign in to, nothing to ask a vendor for, no
 *            server code, no protocol change, and a `parseState` that
 *            can refuse everything because the state is two fields
 *   cost     no shared position and no shared play button — the room
 *            agrees on what is on, not on the second it is at, and how
 *            much of it each person hears is Spotify's decision about
 *            that person (text.ts, `ownPlay` and `account`)
 *
 * One rough edge, and it belongs to the stage rather than to this tool:
 * the player lives in the stage's frame, so a viewer who pins a person,
 * or another tool that takes the stage, takes the music away from THAT
 * viewer as well (docs/tools.md, "The stage holds one thing at a time").
 * The room keeps it on and unpinning brings it back — from the top,
 * because nothing here remembers where anybody was.
 *
 * Everything it needs is in this folder: its state and how it checks it
 * (state.ts), what a pasted link turns out to be and the two addresses
 * built from it (link.ts), the moves on the lineup (queue.ts), its
 * strings (text.ts), its glyphs (icons.tsx) and its two views. It
 * imports nothing from the app but the contract's types.
 */
import type { ToolDefinition } from '../contract';
import Shelf from './Shelf';
import Stage from './Stage';
import { ListenIcon } from './icons';
import { parseState, type ListenState } from './state';
import { TEXT } from './text';

export const spotifyTool: ToolDefinition<ListenState> = {
  id: 'spotify',
  Icon: ListenIcon,
  text: TEXT,
  parseState,
  Shelf,
  Stage,
};
