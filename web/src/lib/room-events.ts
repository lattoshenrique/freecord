import type { PeerInfo } from './protocol';
export type RoomEventKind = 'joined' | 'left' | 'connectionLost' | 'connectionRestored' |
  'screenStarted' | 'screenStopped' | 'voiceFallback';
export interface RoomEvent { kind: RoomEventKind; peer: PeerInfo; ts: number }

/** Local, bounded chat events. No history or names are sent to a logging service. */
export class RoomEvents {
  private readonly peers = new Map<string, PeerInfo>();
  private readonly disconnected = new Set<string>();
  constructor(private readonly now = Date.now) {}
  remember(peers: PeerInfo[]): void {
    // A welcome is a current roster, not a historical event stream. Prune
    // absences missed offline without inventing their departure times.
    const live = new Set(peers.map(peer => peer.id));
    for (const id of this.peers.keys()) if (!live.has(id)) { this.peers.delete(id); this.disconnected.delete(id); }
    for (const peer of peers) this.peers.set(peer.id, peer);
  }
  peer(id: string): PeerInfo | undefined { return this.peers.get(id); }
  join(peer: PeerInfo): RoomEvent | null {
    const known = this.peers.has(peer.id); this.peers.set(peer.id, peer);
    return known ? null : this.event('joined', peer.id);
  }
  leave(id: string): RoomEvent | null {
    const event = this.event('left', id); this.peers.delete(id); this.disconnected.delete(id); return event;
  }
  connection(id: string, connected: boolean): RoomEvent | null {
    if (!this.peers.has(id) || this.disconnected.has(id) === !connected) return null;
    if (connected) this.disconnected.delete(id); else this.disconnected.add(id);
    return this.event(connected ? 'connectionRestored' : 'connectionLost', id);
  }
  event(kind: RoomEventKind, id: string): RoomEvent | null {
    const peer = this.peers.get(id); return peer ? { kind, peer, ts: this.now() } : null;
  }
}
