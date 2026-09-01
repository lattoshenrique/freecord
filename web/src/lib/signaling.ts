import { SIGNALING_ORIGIN } from '../api';
import type { ClientMessage, ServerMessage } from './protocol';

/** wss:// base of the rooms server — the configured origin, or the page's own. */
function signalingBase(): string {
  if (SIGNALING_ORIGIN) {
    return SIGNALING_ORIGIN.replace(/^http/, 'ws');
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}`;
}

/**
 * Reconnection backoff: quick first retries for the blip case, capped so
 * the whole run stays inside the server's resume grace (the seat expires
 * on the 35 s zombie clock).
 */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5_000;
const RECONNECT_MAX_ATTEMPTS = 6;

export interface SignalingHandlers {
  onMessage: (message: ServerMessage) => void;
  /** Called when the session is really over: closed by us, or resume gave up. */
  onClose: () => void;
  /** Transport dropped and a resume is being attempted with backoff. */
  onReconnecting?: () => void;
}

/**
 * Signaling client with automatic resume.
 *
 * A dropped WebSocket is an accident, not a goodbye: with a resume token
 * (from `welcome`) the socket reconnects with backoff and reclaims the
 * same peerId — the P2P media mesh never notices. `onClose` only fires
 * when there is genuinely no way back.
 */
export class Signaling {
  private readonly slug: string;
  private readonly name: string;
  private readonly handlers: SignalingHandlers;
  private ws: WebSocket | null = null;
  private resumeToken: string | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;

  constructor(slug: string, name: string, handlers: SignalingHandlers) {
    this.slug = slug;
    this.name = name;
    this.handlers = handlers;
    this.connect();
  }

  /** Handed by the server in `welcome`; arms the reconnection path. */
  setResumeToken(token: string): void {
    this.resumeToken = token;
  }

  /**
   * The transport looks dead (e.g. no pong): drop it and go through the
   * resume path instead of waiting for a close frame that may never come.
   */
  reconnectNow(): void {
    if (this.closedByUs || this.reconnectTimer !== null) {
      return;
    }
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // the socket is already gone
    }
    this.handleDrop();
  }

  private connect(): void {
    const base = `${signalingBase()}/ws/rooms/${encodeURIComponent(this.slug)}`;
    const url = this.resumeToken
      ? `${base}?resume=${encodeURIComponent(this.resumeToken)}`
      : `${base}?name=${encodeURIComponent(this.name)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (event) => {
      if (ws !== this.ws) {
        return;
      }
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.t === 'welcome') {
          this.attempts = 0;
        }
        this.handlers.onMessage(message);
      } catch {
        // message outside the protocol: ignore it
      }
    };
    ws.onclose = () => {
      if (ws !== this.ws) {
        return;
      }
      this.ws = null;
      this.handleDrop();
    };
  }

  private handleDrop(): void {
    if (this.closedByUs) {
      return;
    }
    if (!this.resumeToken || this.attempts >= RECONNECT_MAX_ATTEMPTS) {
      this.handlers.onClose();
      return;
    }
    this.handlers.onReconnecting?.();
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUs) {
        this.connect();
      }
    }, delay);
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.closedByUs = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
