/**
 * Protocolo de sinalização — espelho de server/src/domain/room.ts.
 * Mudou lá, muda aqui (e vice-versa).
 */

import type { ScreenQualityId } from './screen-quality';

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
  /**
   * Papel deste par na árvore de retransmissão da tela: para quem envio
   * (`children`) e de quem recebo (`source`; null para o sharer ou enquanto
   * o relay pai não reportou o stream de reencaminhamento).
   */
  | {
      t: 'screen-route';
      children: string[];
      source: { id: string; streamId: string } | null;
      quality: ScreenQualityId;
    }
  /** Eco do ping: o cliente mede a latência de sinalização com `ts`. */
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' };

export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string; quality: ScreenQualityId }
  | { t: 'screen-stop' }
  /** Relay da árvore de tela anuncia o stream que usa para reencaminhar. */
  | { t: 'screen-relay'; streamId: string }
  | { t: 'ping'; ts: number };
