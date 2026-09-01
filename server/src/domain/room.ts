/**
 * Modelo de domínio das salas. Mídia flui P2P entre navegadores (WebRTC
 * mesh); o servidor é dono do estado das salas, da sinalização e das
 * regras de produto (lotação, uma tela por vez, expiração).
 */

export interface PeerInfo {
  id: string;
  name: string;
}

/**
 * Canal de saída de um participante — abstrai o WebSocket (testável).
 * Precisa saber desligar: um par sem sinal de vida é expulso pelo servidor.
 */
export interface PeerChannel {
  send(message: ServerMessage): void;
  close(): void;
}

export interface Peer {
  name: string;
  channel: PeerChannel;
  /** Último ping recebido — base para expulsar conexões zumbis. */
  lastSeen: number;
}

/** Preset de qualidade escolhido por quem compartilha — os relays o replicam. */
export type ScreenQuality = 'nitida' | 'equilibrada' | 'fluida';

export interface Room {
  slug: string;
  displayName: string;
  peers: Map<string, Peer>;
  /** Quem detém o lock de compartilhamento de tela, se alguém. */
  screenSharer: { id: string; streamId: string; quality: ScreenQuality } | null;
  /**
   * Streams de retransmissão reportados pelos relays da árvore de tela:
   * peerId do relay → streamId que ele usa para reencaminhar aos filhos.
   */
  screenRelays: Map<string, string>;
  /** Marca de quando a sala ficou vazia, para expiração. */
  emptyAt: number | null;
}

export const ROOM_LIMITS = {
  /**
   * Mesh P2P: cada par mantém conexão com todos. Com vídeo, acima de ~8
   * o upload dos participantes vira o gargalo — limite de produto E técnico.
   */
  maxParticipants: 8,
  /** Sala vazia expira depois disso (ms) — dá tempo do link circular. */
  emptyTimeoutMs: 15 * 60 * 1000,
  /** Cadência do ping do cliente: mede latência e prova que ainda está vivo. */
  heartbeatIntervalMs: 10 * 1000,
  /**
   * Sem ping nesse tempo, o par é considerado morto e removido.
   *
   * Queda de rede sem FIN (tampa do notebook, wi-fi que some) não gera
   * evento de close: sem isso a sala fica ocupada por fantasmas e nunca
   * chega a ficar vazia — logo, nunca expira.
   */
  peerTimeoutMs: 35 * 1000,
  displayNameMaxLength: 60,
  guestNameMaxLength: 40,
  chatMessageMaxLength: 500,
} as const;

export class RoomNotFoundError extends Error {
  constructor(slug: string) {
    super(`room not found: ${slug}`);
    this.name = 'RoomNotFoundError';
  }
}

export class RoomFullError extends Error {
  constructor(slug: string) {
    super(`room full: ${slug}`);
    this.name = 'RoomFullError';
  }
}

/** Mensagens servidor → cliente. Espelhadas em web/src/lib/protocol.ts. */
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
   * Papel deste par na árvore de retransmissão da tela.
   *
   * `children`: para quem devo enviar a tela (o sharer envia a original;
   * um relay reencaminha o track recebido). `source`: de quem eu recebo
   * (null para o sharer, ou enquanto o relay pai ainda não reportou o
   * stream de retransmissão). Reemitida a cada mudança na árvore.
   */
  | {
      t: 'screen-route';
      children: string[];
      source: { id: string; streamId: string } | null;
      quality: ScreenQuality;
    }
  /** Eco do ping: o cliente mede a latência de sinalização com `ts`. */
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' };

/** Mensagens cliente → servidor. Espelhadas em web/src/lib/protocol.ts. */
export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string; quality: ScreenQuality }
  | { t: 'screen-stop' }
  /** Relay da árvore de tela anuncia o stream que usa para reencaminhar. */
  | { t: 'screen-relay'; streamId: string }
  | { t: 'ping'; ts: number };
