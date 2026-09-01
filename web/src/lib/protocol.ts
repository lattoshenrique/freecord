/**
 * Protocolo de sinalização — espelho de server/src/domain/room.ts.
 * Mudou lá, muda aqui (e vice-versa).
 */

export interface PeerInfo {
  id: string;
  name: string;
}

export type ServerMessage =
  | {
      t: 'welcome';
      selfId: string;
      room: { slug: string; displayName: string };
      peers: PeerInfo[];
      screen: { id: string; streamId: string } | null;
    }
  | { t: 'peer-joined'; peer: PeerInfo }
  | { t: 'peer-left'; id: string }
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'chat'; from: PeerInfo; text: string; ts: number }
  | { t: 'screen-started'; id: string; streamId: string }
  | { t: 'screen-stopped' }
  | { t: 'screen-denied' }
  /** Eco do ping: o cliente mede a latência de sinalização com `ts`. */
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' };

export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string }
  | { t: 'screen-stop' }
  | { t: 'ping'; ts: number };
