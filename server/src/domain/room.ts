/**
 * Modelo de domínio das salas. Mídia flui P2P entre navegadores (WebRTC
 * mesh); o servidor é dono do estado das salas, da sinalização e das
 * regras de produto (lotação, uma tela por vez, expiração).
 */

export interface PeerInfo {
  id: string;
  name: string;
}

/** Canal de saída de um participante — abstrai o WebSocket (testável). */
export type PeerSender = (message: ServerMessage) => void;

export interface Room {
  slug: string;
  displayName: string;
  peers: Map<string, { name: string; send: PeerSender }>;
  /** Quem detém o lock de compartilhamento de tela, se alguém. */
  screenSharer: { id: string; streamId: string } | null;
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
  | { t: 'error'; code: 'room_not_found' | 'room_full' | 'invalid_name' };

/** Mensagens cliente → servidor. Espelhadas em web/src/lib/protocol.ts. */
export type ClientMessage =
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'chat'; text: string }
  | { t: 'screen-request'; streamId: string }
  | { t: 'screen-stop' };
