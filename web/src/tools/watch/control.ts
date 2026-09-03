import type { PeerInfo } from '../../lib/protocol';

/** The starter is the controller for as long as this watch state exists. */
export function isWatchController(by: string | null, self: PeerInfo | null): boolean {
  return by !== null && self?.id === by;
}

/** The controller's current display name, when they are still in the roster. */
export function watchControllerName(
  by: string | null,
  self: PeerInfo | null,
  peers: readonly PeerInfo[],
): string | null {
  if (!by) {
    return null;
  }
  if (self?.id === by) {
    return self.name;
  }
  return peers.find((peer) => peer.id === by)?.name ?? null;
}
