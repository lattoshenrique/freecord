/**
 * Per-source playback level: one knob for each thing the room can make
 * sound with.
 *
 * The speaker key is a room-wide instruction — off means this person is
 * not hearing the room, and everybody is told so (presence carries it).
 * This is the opposite kind of state: nobody else's business, never sent
 * anywhere, and about ONE source at a time. Somebody whose microphone
 * runs hot, a screen share whose game is louder than the people watching
 * it, a video the room is watching over conversation — each of them is a
 * separate complaint, and turning the whole room down is not the answer
 * to any of them.
 *
 * Three kinds of source, keyed by what the room already calls them:
 *
 *   person:<peerId>   somebody's voice (their microphone, and their
 *                     camera's track when the tile is showing video)
 *   screen:<peerId>   the system audio riding that person's screen share
 *   tool:<toolId>     whatever the shelf has playing for everybody
 *
 * Levels through 100% are applied as `HTMLMediaElement.volume`. A voice
 * or screen above that receives a Web Audio-amplified stream while the
 * sink remains the element that `setSinkId` points at. Embedded tools
 * stop at 100%: their vendor player owns the audio and exposes no output
 * track that our gain node can process.
 *
 * Only the tool level is persisted. Peer ids are per-session (the room
 * link is the only credential — there is no account to hang a saved
 * level on), so remembering one would restore a stranger's setting onto
 * whoever inherited the id. A tool id is a build constant, and "the
 * video is always too loud over people talking" is a lasting opinion.
 */
import { useSyncExternalStore } from 'react';

export type MixKind = 'person' | 'screen' | 'tool';

/** `${kind}:${id}` — the identity of one knob. */
export type MixKey = string & { readonly __mix?: unique symbol };

export interface MixLevel {
  /** 0 … the source's supported maximum, where 1 is untouched. */
  level: number;
  /** Silenced without forgetting where the slider was. */
  muted: boolean;
}

export const FULL_LEVEL: MixLevel = { level: 1, muted: false };
export const MAX_MIX_LEVEL = 2;
export const MAX_TOOL_MIX_LEVEL = 1;

export function mixKey(kind: MixKind, id: string): MixKey {
  return `${kind}:${id}` as MixKey;
}

export function mixKindOf(key: MixKey): MixKind | null {
  const kind = key.slice(0, key.indexOf(':'));
  return kind === 'person' || kind === 'screen' || kind === 'tool' ? kind : null;
}

/** Embedded tool players expose attenuation, but not amplification. */
export function maxMixLevelFor(key: MixKey): number {
  return mixKindOf(key) === 'tool' ? MAX_TOOL_MIX_LEVEL : MAX_MIX_LEVEL;
}

/** What the element should actually play at. */
export function effectiveLevel(mix: MixLevel | undefined): number {
  if (!mix || mix.muted) {
    return mix ? 0 : 1;
  }
  return clampLevel(mix.level);
}

/**
 * Pins a level to what the mixer accepts. Media elements still only
 * receive 0 … 1; playback-gain.ts splits this value between their own
 * volume and an amplified stream before it reaches one.
 *
 * Not everything downstream is this strict. The watch tool's own
 * `<video>` is the same element and the same trap; YouTube's and
 * Twitch's players clamp on their own side. The one that throws is the
 * one we own, which is the wrong way round for luck to hold.
 *
 * Non-finite reads as untouched rather than as silence: a corrupted
 * value should leave somebody audible, not quietly mute them.
 *
 * This generic clamp describes the media-stream path. AudioMix applies
 * the narrower per-source cap afterwards, so a vendor iframe never
 * stores a boost its API will silently discard.
 */
export function clampLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(MAX_MIX_LEVEL, Math.max(0, level)) : 1;
}

/** Nothing to show a slider for: this source is untouched. */
export function isDefaultLevel(mix: MixLevel | undefined): boolean {
  return !mix || (!mix.muted && mix.level === 1);
}

const STORAGE_KEY = 'freecord:audio-mix';

function isPersisted(key: MixKey): boolean {
  return mixKindOf(key) === 'tool';
}

function sanitize(key: MixKey, value: unknown): MixLevel | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<MixLevel>;
  if (typeof raw.level !== 'number' || !Number.isFinite(raw.level)) {
    return null;
  }
  return {
    level: Math.min(maxMixLevelFor(key), clampLevel(raw.level)),
    muted: raw.muted === true,
  };
}

/**
 * The knobs, and who is watching them.
 *
 * A store rather than React state because the same level is read from
 * three unrelated places — the tile that plays a peer, the sink that
 * plays a screen's audio, and a tool's own player deep inside the shelf
 * — and threading a level through the tool contract would make every
 * tool that never makes a sound carry it.
 */
export class AudioMix {
  private readonly levels = new Map<MixKey, MixLevel>();
  private readonly listeners = new Set<() => void>();
  /** Bumped on every change: the snapshot React compares. */
  private revision = 0;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.restore();
  }

  get(key: MixKey): MixLevel {
    return this.levels.get(key) ?? FULL_LEVEL;
  }

  /** The requested playback level, up to this source's supported maximum. */
  volumeOf(key: MixKey): number {
    return effectiveLevel(this.levels.get(key));
  }

  set(key: MixKey, next: Partial<MixLevel>): void {
    const current = this.get(key);
    const merged: MixLevel = {
      level:
        next.level === undefined
          ? current.level
          : Math.min(maxMixLevelFor(key), clampLevel(next.level)),
      muted: next.muted === undefined ? current.muted : next.muted,
    };
    if (merged.level === current.level && merged.muted === current.muted) {
      return;
    }
    if (isDefaultLevel(merged)) {
      this.levels.delete(key);
    } else {
      this.levels.set(key, merged);
    }
    this.persist();
    this.changed();
  }

  setLevel(key: MixKey, level: number): void {
    // Dragging a muted slider is how somebody asks to hear it again.
    this.set(key, { level, muted: level === 0 });
  }

  toggleMuted(key: MixKey): void {
    const current = this.get(key);
    // Unmuting something dragged to zero has nowhere to go back to.
    this.set(key, {
      muted: !current.muted,
      level: current.muted && current.level === 0 ? 1 : current.level,
    });
  }

  /** Forgets one source — a peer who left has no knob to leave behind. */
  forget(key: MixKey): void {
    if (this.levels.delete(key)) {
      this.persist();
      this.changed();
    }
  }

  /** Everything that is not at its default, for the panel to list. */
  entries(): [MixKey, MixLevel][] {
    return [...this.levels.entries()];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Changes identity on every change; stable otherwise (useSyncExternalStore). */
  snapshot(): number {
    return this.revision;
  }

  private changed(): void {
    this.revision += 1;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  private restore(): void {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        const mixKey = key as MixKey;
        const level = sanitize(mixKey, value);
        if (level && isPersisted(mixKey) && !isDefaultLevel(level)) {
          this.levels.set(mixKey, level);
        }
      }
    } catch {
      // unreadable storage: everything starts where it was built
    }
  }

  private persist(): void {
    if (!this.storage) {
      return;
    }
    const saved: Record<string, MixLevel> = {};
    for (const [key, level] of this.levels) {
      if (isPersisted(key)) {
        saved[key] = level;
      }
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // private browsing: the choice lasts only this session
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage disabled outright
  }
}

/**
 * The page's knobs. One per document, like the room itself: a second
 * mixer would be a second opinion about how loud somebody is.
 */
export const audioMix = new AudioMix();

/**
 * Subscribes a component to the mixer. The snapshot is a revision
 * counter, so every reader re-renders on any change and then asks for
 * the one level it cares about — there are a handful of knobs and a
 * handful of readers, and a per-key subscription would be bookkeeping
 * for a saving nobody can measure.
 */
export function useAudioMix(mix: AudioMix = audioMix): AudioMix {
  useSyncExternalStore(
    (listener) => mix.subscribe(listener),
    () => mix.snapshot(),
    () => mix.snapshot(),
  );
  return mix;
}

/** One source's playback level, live. */
export function useMixVolume(key: MixKey, mix: AudioMix = audioMix): number {
  return useAudioMix(mix).volumeOf(key);
}
