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
 * maximum depth is 2. A viewer may also report a persistently poor WebRTC
 * link: the tree avoids that exact parent → child edge whenever another
 * parent at the same depth is available.
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
 * child peerId → parents whose media arrives poorly at that child.
 *
 * Direction matters: WebRTC stats are read at the receiving end, and an
 * asymmetric path can be healthy one way and lossy the other. Missing means
 * "not known to be poor", so old clients and fresh connections keep working.
 */
export type PoorScreenLinks = ReadonlyMap<string, ReadonlySet<string>>;

/** A small, runtime-independent hash: stable in Node and the Worker. */
function stableRank(seed: string, id: string): number {
  let hash = 0x811c9dc5;
  const value = `${seed}\0${id}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function poorEdge(links: PoorScreenLinks, parentId: string, childId: string): boolean {
  return links.get(childId)?.has(parentId) ?? false;
}

function sameRank(seed: string, left: string, right: string): number {
  return (
    stableRank(seed, left) - stableRank(seed, right) ||
    (left < right ? -1 : left > right ? 1 : 0)
  );
}

/**
 * Computes a breadth-first tree with at most `fanout` children per node.
 *
 * Each level is assigned as a group, which lets a child choose another
 * parent at the same depth when one link is known to be poor. Peers that can
 * reach more of the remaining room cleanly are promoted earlier, so a weak
 * peer becomes a leaf before it becomes a bottleneck. Equal choices use a
 * hash seeded by the sharer: deterministic across both edges, but different
 * screens do not make the same few peers relay every tree.
 */
export function computeScreenTree(
  sharerId: string,
  peerIds: Iterable<string>,
  fanout: number = SCREEN_FANOUT,
  poorLinks: PoorScreenLinks = new Map(),
): Map<string, ScreenRoute> {
  const viewers = [...new Set(peerIds)].filter((id) => id !== sharerId);
  const routes = new Map<string, ScreenRoute>();
  routes.set(sharerId, { children: [], parentId: null });

  let remaining = viewers;
  let parents = [sharerId];
  while (remaining.length > 0 && parents.length > 0) {
    const cleanParents = (childId: string): number =>
      parents.reduce(
        (count, parentId) => count + (poorEdge(poorLinks, parentId, childId) ? 0 : 1),
        0,
      );
    const poorReach = (candidateId: string): number =>
      remaining.reduce(
        (count, childId) =>
          count +
          (childId !== candidateId && poorEdge(poorLinks, candidateId, childId) ? 1 : 0),
        0,
      );
    // One bad pair should move that child, not evict an otherwise healthy
    // relay and renegotiate a whole level. Two independent receivers are
    // enough evidence that the candidate itself is the common weak side.
    const relayBurden = (candidateId: string): number => {
      const reports = poorReach(candidateId);
      return reports >= 2 ? reports : 0;
    };

    // The peers put on this level may relay the next one. Prefer candidates
    // that have a clean edge from here and clean reach into what remains.
    const capacity = parents.length * fanout;
    const ranked = [...remaining].sort(
      (left, right) =>
        Number(cleanParents(right) > 0) - Number(cleanParents(left) > 0) ||
        relayBurden(left) - relayBurden(right) ||
        sameRank(sharerId, left, right),
    );
    const clean = ranked.filter((id) => cleanParents(id) > 0);
    // If a clean peer can relay the next level, do not spend a slot on a
    // known-poor direct edge merely to preserve minimum depth. When every
    // remaining edge is poor there is no better information, so progress.
    const level = (clean.length > 0 ? clean : ranked).slice(0, capacity);
    const levelIds = new Set(level);
    remaining = remaining.filter((id) => !levelIds.has(id));

    const loads = new Map(parents.map((id) => [id, 0]));
    // Assign the constrained children first. A child with only one clean
    // parent must claim that slot before an easy child consumes it.
    level.sort(
      (left, right) =>
        cleanParents(left) - cleanParents(right) ||
        poorReach(left) - poorReach(right) ||
        sameRank(`${sharerId}:child`, left, right),
    );
    for (const childId of level) {
      const parentId = [...parents]
        .filter((id) => (loads.get(id) ?? 0) < fanout)
        .sort(
          (left, right) =>
            Number(poorEdge(poorLinks, left, childId)) -
              Number(poorEdge(poorLinks, right, childId)) ||
            (loads.get(left) ?? 0) - (loads.get(right) ?? 0) ||
            sameRank(`${sharerId}:${childId}`, left, right),
        )[0]!;
      routes.get(parentId)!.children.push(childId);
      routes.set(childId, { children: [], parentId });
      loads.set(parentId, (loads.get(parentId) ?? 0) + 1);
    }
    parents = level;
  }
  return routes;
}
