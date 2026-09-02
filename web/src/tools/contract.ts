/**
 * The tool contract — what somebody else has to write to put a tool on
 * the room's shelf. The long version, with worked examples, is in
 * docs/tools.md; this file is the part the compiler checks.
 *
 * A tool is a folder that exports one `ToolDefinition`: an id, an icon,
 * its own strings, a way to check its own state, and one or two React
 * components — a panel in the shelf, and optionally what it puts on the
 * room's stage. Adding it to the build is one line in registry.ts.
 *
 * What a tool gets from the room (ToolViewProps):
 *
 *   state / setState  one shared value, opaque to the server, echoed to
 *                     everyone. Last word wins; nobody is the host.
 *   at                when that value was set, on THIS machine's clock,
 *                     already corrected for how long it spent in flight.
 *                     A tool that keeps time counts from here and never
 *                     compares its clock to anybody else's.
 *   mine / by         who set it — enough to leave the actor's own copy
 *                     alone, or to name them on screen.
 *   self / peers      who is in the room.
 *   speakerOn         the room's speakers are off: a tool that makes
 *                     sound is expected to go quiet.
 *   t                 the tool's own strings, in the viewer's language.
 *
 * What a tool does NOT get, on purpose: the WebRTC mesh, the media
 * tracks, the chat, the room key, or a line of server code. A tool that
 * needs more than one shared value needs a conversation, not a wider
 * contract — see the "Deliberate limits" section of docs/tools.md.
 */
import { useMemo, type ComponentType } from 'react';
import { useI18n } from '../i18n';
import { resolve, type Message, type Vars } from '../i18n/messages';
import type { PeerInfo } from '../lib/protocol';

/**
 * A tool's strings, by locale tag. `en-US` is required and is the
 * fallback for every key another locale does not translate. A value is a
 * plain string, plural forms, or a list of variants drawn at random —
 * the same shapes the app's own catalogs use.
 */
export interface ToolText {
  'en-US': Record<string, Message>;
  [locale: string]: Record<string, Message>;
}

export type ToolTranslate = (key: string, vars?: Vars) => string;

/** What every tool view is handed. See the note at the top of this file. */
export interface ToolViewProps<S> {
  /** The room's state for this tool; null while it is off. */
  state: S | null;
  /** Local clock (ms) when that state was set, in flight already paid. */
  at: number;
  /** This client set it: its own copy is already there. */
  mine: boolean;
  /** The peer that set it, or null while the tool is off. */
  by: string | null;
  /** Says what the state is, for everybody. `null` turns the tool off. */
  setState: (next: S | null) => void;
  self: PeerInfo | null;
  peers: readonly PeerInfo[];
  /** The room's speakers are off. A tool that makes sound must respect it. */
  speakerOn: boolean;
  /** This tool's own strings, in the viewer's language. */
  t: ToolTranslate;
}

/** The shelf panel gets one thing more: the shelf can be closed. */
export interface ToolShelfProps<S> extends ToolViewProps<S> {
  dismiss: () => void;
}

export interface ToolDefinition<S> {
  /**
   * Wire id and storage key: lowercase, dashed, 2–32 characters, and the
   * same forever — it is what a room's state is filed under. Third-party
   * tools are namespaced by convention (`acme-whiteboard`).
   */
  id: string;
  /** Drawn in the shelf and in the dock. 24×24, `currentColor`. */
  Icon: ComponentType;
  /** `name` and `summary` are read by the shelf; the rest is yours. */
  text: ToolText;
  /**
   * Turns whatever arrived off the wire into this tool's state, or null
   * to ignore it. The server never looks inside a state, so THIS is the
   * only thing standing between a peer's message and your components:
   * check every field, and never trust a number you did not clamp.
   */
  parseState: (raw: unknown) => S | null;
  /** The panel inside the shelf: how a person turns this tool on and off. */
  Shelf: ComponentType<ToolShelfProps<S>>;
  /**
   * What the tool puts on the room's stage while its state is not null.
   * A tool without one lives entirely in the shelf.
   */
  Stage?: ComponentType<ToolViewProps<S>>;
}

/**
 * A tool as the registry holds it: the state type is the tool's own
 * business, and erasing it here is what lets tools of different shapes
 * sit in one list. Every crossing back into a typed world goes through
 * `parseState`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegisteredTool = ToolDefinition<any>;

/**
 * The tool's strings in the viewer's language, falling back to `en-US`
 * key by key.
 *
 * The keys are namespaced by tool id before they reach the i18n
 * machinery: a variant list is drawn once per key and held for the life
 * of the page, and two tools that both call a key `summary` would
 * otherwise take turns redrawing each other's line on every render.
 */
export function useToolText(tool: RegisteredTool): ToolTranslate {
  const { locale } = useI18n();
  return useMemo(() => {
    const namespaced = (messages: Record<string, Message>): Record<string, Message> =>
      Object.fromEntries(Object.entries(messages).map(([key, value]) => [`${tool.id}.${key}`, value]));
    const fallback = namespaced(tool.text['en-US']);
    const catalog = tool.text[locale] ? namespaced(tool.text[locale]) : fallback;
    return (key, vars) => resolve(catalog, fallback, locale, `${tool.id}.${key}`, vars);
  }, [tool, locale]);
}
