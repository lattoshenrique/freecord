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
 * Reconnection backoff: quick first retries for the blip case, then a
 * ceiling. Each delay is drawn from the top half of its window because a
 * server that comes back finds every browser of every room knocking on
 * the same second — the jitter is what spreads that out.
 */
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5_000;

/**
 * How long a room keeps knocking. Generous on purpose: the media is P2P,
 * so while the signaling is away the voices keep flowing, and a server
 * being redeployed is no reason to end a call that is still happening.
 * Past this, whatever we would come back to has expired anyway — an
 * unattended room closes fifteen minutes after its last seat.
 */
const RECONNECT_BUDGET_MS = 5 * 60 * 1000;

/** The delay to actually wait: somewhere in the top half of the window. */
function withJitter(delay: number): number {
  return delay * (0.5 + Math.random() * 0.5);
}

/**
 * Signals written while the transport is down are held for the resume
 * (see send). Bounded per outage: an ICE restart trickles a few dozen
 * candidates at most, and older ones are the least likely to still apply.
 */
const OUTBOX_MAX = 64;

/** What a `signal` envelope may carry — mirror of mesh.ts's payload. */
interface SignalPayload {
  description?: { type?: string };
}

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
 * same peerId — the P2P media mesh never notices.
 *
 * And when the seat itself is gone — the server was away long enough for
 * it to be swept — the room is still not over: the browsers already know
 * each other, so this knocks again as a NEWCOMER rather than hanging up
 * on a call that never stopped. Once the door has opened, the only ways
 * out are the room refusing us, the budget running out, and `close`.
 */
export class Signaling {
  private readonly slug: string;
  private readonly name: string;
  private readonly handlers: SignalingHandlers;
  private ws: WebSocket | null = null;
  private resumeToken: string | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Nothing left to try: we said goodbye, or the room refused us. */
  private finished = false;
  /** The door opened at least once — from here on a drop is an outage. */
  private welcomed = false;
  /** When the current outage started; null while the transport is up. */
  private outageAt: number | null = null;
  /** Our peerId from the last welcome — decides whether a resume kept the seat. */
  private selfId: string | null = null;
  /** Signals held while the transport was down; flushed on a same-seat welcome. */
  private outbox: ClientMessage[] = [];

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
    if (this.finished || this.reconnectTimer !== null) {
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
          this.outageAt = null;
          this.welcomed = true;
        }
        if (message.t === 'error') {
          if (message.code === 'resume_invalid') {
            // The seat was swept while we were away. The room was not:
            // whoever we can still hear is proof of that, so we go back
            // to the door and come in again, as somebody new. The app is
            // told nothing — it hears a `welcome` with a fresh id, which
            // is the one thing it needs to know.
            this.resumeToken = null;
            this.outbox = [];
            // The server is plainly answering: the outage is over as far
            // as knocking goes, so the fresh join leaves at once.
            this.attempts = 0;
            this.reconnectNow();
            return;
          }
          // Gone, full, refused: asking again would only be told the same.
          this.finished = true;
        }
        this.handlers.onMessage(message);
        if (message.t === 'welcome') {
          // After the handler, on purpose: the room reconciles its mesh on
          // the welcome (rolling back what the outage broke), and the held
          // answers and candidates are only worth sending to the SAME seat
          // — a fresh one starts a fresh mesh, where they mean nothing.
          const held = this.outbox;
          this.outbox = [];
          if (this.selfId === message.selfId) {
            for (const pending of held) {
              this.send(pending);
            }
          }
          this.selfId = message.selfId;
        }
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
    if (this.finished) {
      return;
    }
    if (!this.welcomed) {
      // The door never opened: this is a join that failed, and the way
      // in has its own way of saying so. Nothing to hold on to yet.
      this.handlers.onClose();
      return;
    }
    const now = Date.now();
    this.outageAt ??= now;
    if (now - this.outageAt > RECONNECT_BUDGET_MS) {
      this.handlers.onClose();
      return;
    }
    this.handlers.onReconnecting?.();
    const ceiling = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.finished) {
        this.connect();
      }
    }, withJitter(ceiling));
  }

  /**
   * Sends now, or — for a signal written while the transport is down and
   * a resume is still possible — holds it for the same seat's welcome. A
   * dropped candidate or answer used to leave the mesh's negotiation
   * hanging on the other side; an OFFER is never held, though: by the
   * time the transport is back the mesh's own watchdog may have rolled it
   * back and reoffered, and a stale offer arriving after the fresh one
   * would put the peer on an ICE generation that no longer exists.
   */
  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return;
    }
    if (
      message.t !== 'signal' ||
      this.finished ||
      !this.resumeToken ||
      isOffer(message.data)
    ) {
      return;
    }
    this.outbox.push(message);
    if (this.outbox.length > OUTBOX_MAX) {
      this.outbox.shift();
    }
  }

  close(): void {
    this.finished = true;
    this.outbox = [];
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

function isOffer(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as SignalPayload).description?.type === 'offer'
  );
}
