/**
 * Screen-share forwarding tree.
 *
 * In a pure mesh the screen is uploaded N−1 times by the sharer — the
 * quality ceiling drops as the room fills up. Here the sharer sends to at
 * most `SCREEN_FANOUT` peers and each of them forwards the received track
 * to at most `SCREEN_FANOUT` others: any participant's upload is capped at
 * `SCREEN_FANOUT` copies regardless of room size, and the server still
 * never touches media.
 *
 * The cost is one extra re-encode hop for anyone beyond the first level
 * (~100–200 ms and one compression generation) — with 8 participants the
 * maximum depth is 2.
 */

/** Maximum number of screen copies any peer uploads. */
export const SCREEN_FANOUT = 3;

export interface ScreenRoute {
  /** Who this peer sends the screen to. */
  children: string[];
  /** Who this peer receives the screen from (null for the sharer). */
  parentId: string | null;
}

/**
 * Computes the tree: BFS from the sharer, filling up to `fanout` children
 * per node. Remaining peers are taken in lexicographic id order —
 * deterministic across both edges (Node and Durable Object), regardless
 * of connection order.
 */
export function computeScreenTree(
  sharerId: string,
  peerIds: Iterable<string>,
  fanout: number = SCREEN_FANOUT,
): Map<string, ScreenRoute> {
  const viewers = [...peerIds].filter((id) => id !== sharerId).sort();
  const routes = new Map<string, ScreenRoute>();
  routes.set(sharerId, { children: [], parentId: null });

  const queue = [sharerId];
  let next = 0;
  while (queue.length > 0 && next < viewers.length) {
    const parentId = queue.shift()!;
    const children = viewers.slice(next, next + fanout);
    next += children.length;
    routes.get(parentId)!.children = children;
    for (const child of children) {
      routes.set(child, { children: [], parentId });
      queue.push(child);
    }
  }
  return routes;
}
