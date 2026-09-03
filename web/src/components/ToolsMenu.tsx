/**
 * The tool shelf: what a room can bring in besides the people in it.
 *
 * The shelf knows no tool. It lists whatever the registry ships
 * (web/src/tools/), draws each row from that tool's own icon and strings,
 * and hands the open one its panel plus everything the contract promises
 * — the room's shared state for that tool, a way to change it for
 * everybody, who is here, and whether the speakers are on. Adding a tool
 * never touches this file.
 *
 * Every tool is shown the same way, and that is the point: one compact
 * row of a fixed shape — icon, name, whether the room has it going, and
 * a short hint while collapsed — plus the open panel. A tool decides what
 * goes inside the frame, never how its row looks, so a shelf with six
 * tools reads as one list instead of six designs.
 *
 * One key in a row is not the tool's at all: whether this viewer takes
 * part in what the room turned on. It closes a live for the person who
 * presses it and for nobody else, and it is where they come back in
 * (lib/participation.ts) — which is why it lives here, in the shelf the
 * room's tool key already lights, rather than over a player whose four
 * corners belong to whoever wrote it.
 *
 * It hangs off the footer instead of the glass dock (which clips its own
 * children) and closes on Escape, on the backdrop, and when a tool says
 * it is done.
 */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { PeerInfo } from '../lib/protocol';
import type { ToolRoomState } from '../lib/use-room';
import { useToolText, type RegisteredTool } from '../tools/contract';
import { TOOLS } from '../tools/registry';
import { CloseIcon } from './icons';
import './tools-menu.css';

export default function ToolsMenu({
  tools,
  denied,
  self,
  peers,
  speakerOn,
  speakerLevel,
  part,
  onPart,
  draft,
  onSetState,
  onDismiss,
  leaving,
}: {
  /** What each tool has going right now, by tool id. */
  tools: ReadonlyMap<string, ToolRoomState>;
  /** A tool the room had no room for, if one was just refused. */
  denied: string | null;
  self: PeerInfo | null;
  peers: readonly PeerInfo[];
  speakerOn: boolean;
  /** This viewer's level for the open tool, 0 … 1 (lib/audio-mix.ts). */
  speakerLevel: (toolId: string) => number;
  /**
   * The tool this viewer may step out of — the one the room has on,
   * started by somebody else — and whether they are in it right now.
   * Null when there is nothing of the sort to decide about.
   */
  part: { tool: string; joined: boolean } | null;
  /**
   * Says whether this viewer takes part in that tool. Local and this
   * viewer's alone (lib/participation.ts): it changes nothing about the
   * tool, which stays on for the room either way.
   */
  onPart: (joined: boolean) => void;
  /**
   * What the shelf was opened WITH, when something else opened it: a link
   * typed after `/play` that no tool could take on its own. Handed to
   * every panel, so it is there whichever one is opened.
   */
  draft?: string;
  onSetState: (tool: string, state: unknown) => void;
  onDismiss: () => void;
  /** On its way out: drawn for the length of the animation, and inert. */
  leaving?: boolean;
}) {
  const { t } = useI18n();
  // With more than one tool the shelf opens on whichever is already
  // running, else on the first.
  const [selectedId, setSelectedId] = useState(
    () => TOOLS.find((tool) => tools.has(tool.id))?.id ?? TOOLS[0]?.id ?? null,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <>
      {/*
        Anywhere else on the page closes the shelf. A click catcher, not a
        control: the keyboard closes it with Escape or the key beside the
        title, and a second "close menu" in the tree only makes those two
        harder to tell apart.
      */}
      {/* Inert the moment the shelf starts to leave: for those few frames
          the backdrop is over the dock with nothing left to dismiss. */}
      <div
        className="menu-backdrop"
        data-leaving={leaving ? 'true' : undefined}
        aria-hidden
        onClick={onDismiss}
      />
      <div
        className="tools-menu"
        role="dialog"
        aria-label={t('tools.title')}
        data-leaving={leaving ? 'true' : undefined}
      >
        <header className="tools-header">
          <h2 className="tools-title">{t('tools.title')}</h2>
          <button
            type="button"
            className="tools-close"
            aria-label={t('controls.closeMenu')}
            onClick={onDismiss}
          >
            <CloseIcon />
          </button>
        </header>

        {TOOLS.length === 0 ? (
          <p className="tools-empty">{t('tools.empty')}</p>
        ) : (
          <div className="tool-list">
            {TOOLS.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                room={tools.get(tool.id) ?? null}
                open={tool.id === selectedId}
                only={TOOLS.length === 1}
                denied={denied === tool.id}
                self={self}
                peers={peers}
                speakerOn={speakerOn}
                speakerLevel={speakerLevel(tool.id)}
                part={part?.tool === tool.id ? part.joined : null}
                onPart={onPart}
                draft={draft}
                onSelect={() => setSelectedId(tool.id)}
                onSetState={(state) => onSetState(tool.id, state)}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** One row on the shelf, plus the tool's own panel when it is the open one. */
function ToolCard({
  tool,
  room,
  open,
  only,
  denied,
  self,
  peers,
  speakerOn,
  speakerLevel,
  part,
  onPart,
  draft,
  onSelect,
  onSetState,
  onDismiss,
}: {
  tool: RegisteredTool;
  room: ToolRoomState | null;
  open: boolean;
  only: boolean;
  denied: boolean;
  self: PeerInfo | null;
  peers: readonly PeerInfo[];
  speakerOn: boolean;
  speakerLevel: number;
  /** In this tool, out of it, or null when it is not this viewer's to decide. */
  part: boolean | null;
  onPart: (joined: boolean) => void;
  draft?: string;
  onSelect: () => void;
  onSetState: (state: unknown) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const toolText = useToolText(tool);
  const Panel = tool.Shelf;
  // Never the raw wire value: a tool sees its state only after its own
  // check, so a peer cannot hand it something it never expected.
  const state = room ? tool.parseState(room.state) : null;
  const head = <ToolHead tool={tool} text={toolText} live={state !== null} />;

  return (
    <section
      className={[
        'tool-card',
        open ? 'is-open' : '',
        only ? 'is-only' : '',
        state !== null ? 'is-live' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* With one tool there is nothing to choose between: the row is a
          heading rather than a button nobody needs to press. Same box
          either way, so the shelf does not change shape when a second
          tool ships. */}
      {only ? (
        <div className="tool-head">{head}</div>
      ) : (
        <button type="button" className="tool-head" aria-expanded={open} onClick={onSelect}>
          {head}
        </button>
      )}
      {/*
        Whether this viewer takes part in what the room put on — a key of
        the app's, not of the tool's, and the reason it sits under the row
        instead of inside the panel below. It moves nothing for anybody
        else: the tool is on either way, and this only says whether it is
        drawn here (lib/participation.ts). It stays where it is once
        pressed, so the way back in is the key that let you out.
      */}
      {part !== null && (
        <div className="tool-part">
          <button
            type="button"
            className="tool-part-key"
            /* The name says what pressing it does, so it is not also a
               pressed/unpressed toggle: "Join Watch together, pressed"
               is a sentence nobody can act on. The state is drawn from
               the same fact instead. */
            data-out={part ? undefined : 'true'}
            onClick={() => onPart(!part)}
          >
            {part
              ? t('participation.sitOut')
              : t('participation.comeBack', { tool: toolText('name') })}
          </button>
          <span className="tool-part-note">{t('participation.sitOutHint')}</span>
        </div>
      )}
      {open && (
        /* The frame every tool's controls sit in. A tool fills it with
           the shelf's own kit — .tool-label, .tool-field, .tool-row,
           .tool-actions, .tool-open, .tool-stop, .tool-error — so two
           tools written by two people still line up. */
        <div className="tool-panel">
          <Panel
            state={state}
            at={room?.at ?? 0}
            mine={room?.mine ?? false}
            by={room?.by ?? null}
            setState={onSetState}
            self={self}
            peers={peers}
            speakerOn={speakerOn}
            speakerLevel={speakerLevel}
            t={toolText}
            dismiss={onDismiss}
            draft={draft}
          />
          {denied && (
            <p className="tool-error" role="alert">
              {t('tools.full')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ToolHead({
  tool,
  text,
  live,
}: {
  tool: RegisteredTool;
  text: (key: string) => string;
  live: boolean;
}) {
  const { t } = useI18n();
  const Icon = tool.Icon;
  return (
    <>
      <span className="tool-icon" aria-hidden>
        <Icon />
      </span>
      <span className="tool-text">
        <span className="tool-name">{text('name')}</span>
        {/* The open panel already explains itself. Its summary is useful
            only while choosing between collapsed tools. */}
        <span className="tool-hint">{text('summary')}</span>
      </span>
      {/* Always the same corner, so the eye finds what the room has going
          without reading a single name. */}
      {live && <span className="tool-live">{t('tools.on')}</span>}
    </>
  );
}
