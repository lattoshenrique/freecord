import { SIGNALING_ORIGIN } from '../api';
import type { ClientMessage, ServerMessage } from './protocol';

/** Base wss:// do servidor de salas — a origem configurada ou a da página. */
function signalingBase(): string {
  if (SIGNALING_ORIGIN) {
    return SIGNALING_ORIGIN.replace(/^http/, 'ws');
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}`;
}

export interface SignalingHandlers {
  onMessage: (message: ServerMessage) => void;
  /** Chamado quando a conexão cai ou é fechada pelo servidor. */
  onClose: () => void;
}

/** Cliente fino do WebSocket de sinalização. */
export class Signaling {
  private readonly ws: WebSocket;
  private closedByUs = false;

  constructor(slug: string, name: string, handlers: SignalingHandlers) {
    const url = `${signalingBase()}/ws/rooms/${encodeURIComponent(slug)}?name=${encodeURIComponent(name)}`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data as string) as ServerMessage);
      } catch {
        // mensagem fora do protocolo: ignora
      }
    };
    this.ws.onclose = () => {
      if (!this.closedByUs) {
        handlers.onClose();
      }
    };
  }

  send(message: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.closedByUs = true;
    this.ws.close();
  }
}
