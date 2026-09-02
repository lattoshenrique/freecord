/**
 * Watching anything together: the room's second video tool, and the one
 * that takes a link to a PAGE instead of a link to a video.
 *
 * Its sibling next door plays YouTube, where the address of the video is
 * the address of the video. Everywhere else on the web it is not: what a
 * person has is the page they were watching, and the video inside it may
 * be a file, a stream, somebody else's player, or three qualities of the
 * same episode. So this tool has a step the other one does not — it asks
 * what the page holds, shows what came back, and lets a person choose
 * (Shelf.tsx) before the room is committed to anything.
 *
 * What it can promise depends on what was chosen, and it says which:
 *
 *   a file or a stream   our own <video>: play, pause and a position
 *                        shared by the room, the same as YouTube's
 *   Twitch               their player through their API: play, pause,
 *                        the live edge, and a volume the room's speaker
 *                        key can still reach
 *   the page itself      an iframe, and nothing more — everybody sees
 *                        the same thing and drives their own copy. The
 *                        humblest kind, and the one that carries the
 *                        sites whose player is only built after a click.
 *
 * Two imports from outside this folder, and they are the honest cost of
 * what this tool does. `../../api` because finding a video in a page
 * means reading that page, and CORS forbids a browser from reading
 * another origin — so an app route does it (server/src/app/source-lookup.ts),
 * and this is its client. `../../lib/desktop` because the app's shell can
 * open a page in a window of its own and watch what it plays, which is
 * the only real answer for a site that hands out nothing until somebody
 * clicks. Both are guarded: no route, no shell, and the tool still works
 * on everything else.
 */
import type { ToolDefinition } from '../contract';
import Shelf from './Shelf';
import Stage from './Stage';
import { VideoIcon } from './icons';
import { parseState, type VideoState } from './state';
import { TEXT } from './text';

export const videoTool: ToolDefinition<VideoState> = {
  id: 'video',
  Icon: VideoIcon,
  text: TEXT,
  parseState,
  Shelf,
  Stage,
};
