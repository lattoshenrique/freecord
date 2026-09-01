import type { ClientMessage, ServerMessage } from './protocol';

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
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${scheme}://${window.location.host}/ws/rooms/${encodeURIComponent(slug)}?name=${encodeURIComponent(name)}`;
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
