/**
 * Watching a video together: the room's first tool, and the worked
 * example the contract is written against (docs/tools.md).
 *
 * Everything it needs is in this folder — its state and how it checks it
 * (state.ts), the sync rule that tells a person from a slow connection
 * (sync.ts), YouTube's player wrapped in the little of it we use
 * (player.ts), its strings (text.ts), its glyphs (icons.tsx) and its two
 * views. It imports nothing from the app but the contract's types.
 */
import type { ToolDefinition } from '../contract';
import Shelf from './Shelf';
import Stage from './Stage';
import { YouTubeIcon } from './icons';
import { parseState, type WatchState } from './state';
import { TEXT } from './text';

export const youtubeTool: ToolDefinition<WatchState> = {
  id: 'youtube',
  Icon: YouTubeIcon,
  text: TEXT,
  parseState,
  Shelf,
  Stage,
};
