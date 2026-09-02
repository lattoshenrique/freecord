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
 * Every tool is shown the same way, and that is the point: one row of a
 * fixed shape — icon, name, whether the room has it going, two lines of
 * what it is for — and, under the open one, a panel in a frame the shelf
 * owns. A tool decides what goes inside the frame, never how its row
 * looks, so a shelf with six tools reads as one list instead of six
 * designs.
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
            t={toolText}
            dismiss={onDismiss}
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
        {/* Two lines at most, whatever the tool wrote and whatever the
            language does to it: the row's height is the shelf's to keep,
            not the copywriter's. */}
        <span className="tool-hint">{text('summary')}</span>
      </span>
      {/* Always the same corner, so the eye finds what the room has going
          without reading a single name. */}
      {live && <span className="tool-live">{t('tools.on')}</span>}
    </>
  );
}
