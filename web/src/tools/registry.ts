/**
 * The tools this build ships. Adding one is this line and nothing else —
 * no server change, no protocol change, no room state to teach anybody
 * about (docs/tools.md).
 *
 * The order is the order the shelf shows them in, and it also settles a
 * tie: if two tools want the stage at the same instant, the one whose
 * state changed last wins, and the one earlier in this list breaks the
 * draw.
 *
 * Tools are part of the BUILD, deliberately. A room's link is its only
 * credential and everything in the page can read everything in it — the
 * chat's key lives in the URL fragment — so a tool fetched at runtime
 * from somebody else's server would be a stranger with the keys to the
 * room. Whoever assembles a build vouches for what is in this list.
 */
import type { ToolRoomState } from '../lib/use-room';
import type { RegisteredTool } from './contract';
import { youtubeTool } from './youtube';

export const TOOLS: readonly RegisteredTool[] = [youtubeTool];

/**
 * Whether the room has any of THIS build's tools going. A peer on a
 * different build may have turned on something we do not ship: the room
 * carries its state all the same, and this build has nothing to show for
 * it, so it must not light a key that opens an empty shelf.
 */
export function hasLiveTool(tools: ReadonlyMap<string, ToolRoomState>): boolean {
  return TOOLS.some((tool) => {
    const room = tools.get(tool.id);
    return room !== undefined && tool.parseState(room.state) !== null;
  });
}

/**
 * Which tool is on the room's stage: the one that has something on, has
 * a stage to put there, and was touched most recently — with the order
 * of TOOLS breaking a tie. The stage holds one thing at a time, and the
 * newest is the one the room just chose to look at.
 */
export function stagedToolOf(
  tools: ReadonlyMap<string, ToolRoomState>,
): { tool: RegisteredTool; room: ToolRoomState } | null {
  let best: { tool: RegisteredTool; room: ToolRoomState } | null = null;
  for (const tool of TOOLS) {
    const room = tools.get(tool.id);
    if (!tool.Stage || !room || tool.parseState(room.state) === null) {
      continue;
    }
    if (!best || room.at > best.room.at) {
      best = { tool, room };
    }
  }
  return best;
}
