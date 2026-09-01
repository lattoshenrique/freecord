/**
 * Peer-to-peer chat over RTCDataChannel.
 *
 * Text rides a `chat` data channel of its own on every peer connection —
 * next to the `files` channel (file-transfer.ts), never on it: that one is
 * ordered and may hold a megabyte of chunks in its queue, and a line of
 * text stuck behind a transfer would arrive late. Both sides create the
 * channel with the same stream id, so it exists the moment the
 * connection does.
 *
 * Delivery rule — one path per message: text goes peer to peer only when
 * EVERY seat in the room has an open channel to us; otherwise it goes
 * through the signaling server, which relays it to everyone as it always
 * has. Nobody ever receives a message twice, so there is no message id
 * and no dedup. The moments that fall back are short: someone joining
 * (their channel is not up yet) or a leg the mesh is still healing.
 *
 * The payload is the same wire text the server would relay — a sealed
 * envelope (chat-crypto.ts) or plaintext in a keyless room — so the
 * end-to-end key stays the only thing that can read it. Under TURN the
 * relay forwards DTLS ciphertext, as it does for media and files.
 *
 * Wire format: JSON strings, `{ k: 'chat', name, text }`. The sender's id
 * is the channel's peer and never a field — a peer cannot speak as
 * another. The name is a fallback for a channel that opened ahead of the
 * roster; the roster's name wins whenever it knows the peer.
 */

import { isSealedEnvelope } from './chat-crypto';

/** Mirror of ROOM_LIMITS.chatMessageMaxLength (server/src/domain/room.ts). */
export const CHAT_TEXT_MAX_LENGTH = 500;
/** Mirror of ROOM_LIMITS.chatEnvelopeMaxLength. */
export const CHAT_ENVELOPE_MAX_LENGTH = 2800;
/** A name longer than this is nobody's; the roster has the real one anyway. */
const NAME_MAX_LENGTH = 64;

/** What the channel code needs of an RTCDataChannel (a fake stands in for tests). */
export interface ChatChannel {
  readonly readyState: RTCDataChannelState;
  send(data: string): void;
  addEventListener(type: 'message' | 'close' | 'error', listener: (event: MessageEvent) => void): void;
}

export interface IncomingChat {
  /** The peer the channel belongs to — bound by the transport, not claimed. */
  peerId: string;
  /** The sender's name as they said it; see the note on the wire format. */
  name: string;
  /** Wire text: a sealed envelope, or plaintext in a keyless room. */
  text: string;
}

/**
 * What of a wire payload may be shown — mirror of the server's
 * normalizeChatText, applied by the receiver since no server sits in
 * between. Null means drop the message.
 */
export function normalizeChatText(raw: string): string | null {
  if (isSealedEnvelope(raw)) {
    return raw.length <= CHAT_ENVELOPE_MAX_LENGTH ? raw : null;
  }
  const text = raw.trim().slice(0, CHAT_TEXT_MAX_LENGTH);
  return text.length > 0 ? text : null;
}

export function encodeChatFrame(name: string, text: string): string {
  return JSON.stringify({ k: 'chat', name, text });
}

/** A frame off the channel, or null for anything that is not a valid message. */
export function parseChatFrame(raw: unknown): { name: string; text: string } | null {
  if (typeof raw !== 'string') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const frame = parsed as Record<string, unknown>;
  if (frame.k !== 'chat' || typeof frame.text !== 'string') {
    return null;
  }
  const text = normalizeChatText(frame.text);
  if (!text) {
    return null;
  }
  const name = typeof frame.name === 'string' ? frame.name.trim().slice(0, NAME_MAX_LENGTH) : '';
  return { name, text };
}

/**
 * Every peer's chat channel. One instance per mesh; a fresh mesh (a new
 * seat) gets a fresh instance.
 */
export class ChatChannels {
  private readonly links = new Map<string, ChatChannel>();
  private closed = false;
  /** Set once, before the first attach; frames arriving earlier are dropped. */
  onMessage: ((message: IncomingChat) => void) | null = null;

  /** Wires a peer's channel. Replaces a previous one for the same peer. */
  attach(peerId: string, channel: ChatChannel): void {
    if (this.closed) {
      return;
    }
    this.links.set(peerId, channel);
    channel.addEventListener('message', (event) => {
      if (this.links.get(peerId) !== channel) {
        return; // a replaced channel still draining
      }
      const frame = parseChatFrame(event.data);
      if (frame) {
        this.onMessage?.({ peerId, name: frame.name, text: frame.text });
      }
    });
    const drop = () => {
      if (this.links.get(peerId) === channel) {
        this.links.delete(peerId);
      }
    };
    channel.addEventListener('close', drop);
    channel.addEventListener('error', drop);
  }

  detach(peerId: string): void {
    this.links.delete(peerId);
  }

  /** Whether this peer can be reached over the mesh right now. */
  isOpen(peerId: string): boolean {
    return this.links.get(peerId)?.readyState === 'open';
  }

  /**
   * Sends `text` to every peer in `peerIds` over the mesh — all of them or
   * none: false means at least one seat has no open channel and the
   * caller should relay through the server instead. An empty roster is
   * trivially reachable (alone in the room).
   */
  sendToAll(peerIds: Iterable<string>, name: string, text: string): boolean {
    if (this.closed) {
      return false;
    }
    const targets: ChatChannel[] = [];
    for (const peerId of peerIds) {
      const channel = this.links.get(peerId);
      if (!channel || channel.readyState !== 'open') {
        return false;
      }
      targets.push(channel);
    }
    const frame = encodeChatFrame(name, text);
    for (const channel of targets) {
      try {
        channel.send(frame);
      } catch {
        // closed between the check and the send: that peer's leg is going
        // down and the mesh is about to heal it; the others got the line
      }
    }
    return true;
  }

  close(): void {
    this.closed = true;
    this.links.clear();
  }
}
