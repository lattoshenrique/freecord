import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import type { RoomSummary } from '../api';
import { renderMarkdown } from '../lib/markdown';
import { playMessageChime } from '../lib/notification-sound';
import { useI18n, type MessageKey } from '../i18n';
import { desktopSystemAudio, isDesktopApp } from '../lib/platform';
import { MAX_PARTICIPANTS, MAX_SCREENS } from '../lib/protocol';
import { SCREEN_QUALITY_PRESETS } from '../lib/screen-quality';
import type { ScreenStats } from '../lib/stats';
import { useRoomSession, type JoinOptions, type ScreenShare } from '../lib/use-room';
import { useSpeaking } from '../lib/use-speaking';
import Avatar from './Avatar';
import ChatComposer from './ChatComposer';
import FileTransferBubble from './FileTransferBubble';
import { MAX_FILE_BYTES, formatBytes } from '../lib/file-transfer';
import { bodyBudget, excerptOf, type ChatQuote } from '../lib/chat-body';
import InviteButton from './InviteButton';
import Logo from './Logo';
import SettingsMenu from './SettingsMenu';
import { applySinkId } from '../lib/audio-devices';
import {
  CamIcon,
  CamOffIcon,
  ChatIcon,
  CloseIcon,
  ExitFullscreenIcon,
  ExitPictureInPictureIcon,
  FullscreenIcon,
  PictureInPictureIcon,
  LeaveIcon,
  MicIcon,
  LayoutGridIcon,
  LayoutSpotlightIcon,
  MicOffIcon,
  PinIcon,
  ReplyIcon,
  ScreenIcon,
  SlidersIcon,
} from './icons';
import { SpeakerIcon, SpeakerOffIcon } from './icons';

/**
 * How this person sees the room. `spotlight`: one thing big on stage, the
 * rest in a strip; `grid`: everything equal. Stored per device.
 */
type Layout = 'spotlight' | 'grid';
/** What the person pinned on stage: a screen (by sharer) or a person. */
type Pinned = { kind: 'screen' | 'person'; id: string };
const LAYOUT_STORAGE_KEY = 'freecord:layout';

/** The selector's two halves, in the order they are drawn. */
const LAYOUT_OPTIONS: Array<{ value: Layout; labelKey: MessageKey; Icon: ComponentType }> = [
  { value: 'spotlight', labelKey: 'layout.spotlight', Icon: LayoutSpotlightIcon },
  { value: 'grid', labelKey: 'layout.grid', Icon: LayoutGridIcon },
];

function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'grid' ? 'grid' : 'spotlight';
  } catch {
    return 'spotlight';
  }
}

function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // storage unavailable: the choice lasts the session
  }
}

/** One shared screen with what the view knows about it. */
interface ScreenItem {
  share: ScreenShare;
  stream: MediaStream | null;
  mine: boolean;
  /** The sharer's name; null for our own screen. */
  name: string | null;
}

/** A screen in the strip or the grid: click to put it on stage. */
function ScreenTile({
  item,
  label,
  pinned,
  style,
  onSelect,
}: {
  item: ScreenItem;
  label: string;
  pinned: boolean;
  style?: React.CSSProperties;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="tile tile-screen"
      role="button"
      tabIndex={0}
      title={pinned ? t('room.pinned') : t('room.pinHint')}
      data-pinned={pinned ? 'true' : undefined}
      style={style}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {item.stream && <MediaView stream={item.stream} muted className="tile-video" />}
      <span className="tile-name">
        {pinned ? (
          <span className="tile-pin" title={t('room.pinned')}>
            <PinIcon />
          </span>
        ) : (
          <span className="tile-screen-badge" aria-hidden>
            <ScreenIcon />
          </span>
        )}
        {label}
      </span>
    </div>
  );
}

/** Faixas de latência: verde conversa bem, âmbar arrasta, vermelho atrapalha. */
function latencyGrade(ms: number): 'good' | 'fair' | 'poor' {
  return ms < 100 ? 'good' : ms < 250 ? 'fair' : 'poor';
}

/** The round-trip on one tile, in the corner: which pair is dragging. */
function LatencyChip({ ms, title }: { ms: number | null; title: string }) {
  if (ms === null) {
    return null;
  }
  return (
    <span className={`latency-chip latency-${latencyGrade(ms)}`} title={title}>
      {ms} ms
    </span>
  );
}

function formatBitrate(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${kbps} kb/s`;
}

/**
 * Which way the screen is flowing — the word, and only the word: the numbers
 * behind it (res, fps, bitrate, rtt) are the HUD's job at the top of the
 * screen, and printing them twice made the stage read as a dashboard.
 */
function ScreenStatsBar({ stats }: { stats: ScreenStats }) {
  const { t } = useI18n();
  return (
    <span className="screen-stats">
      {stats.direction === 'sending' ? t('screen.sending') : t('screen.receiving')}
    </span>
  );
}

/**
 * Unread counter, pinned to the chat button's top-right corner.
 *
 * It lives OUTSIDE the glass dock: the library clips overflow and forces its
 * own font on children, so a badge nested inside the button would be cut off.
 * The corner is measured from the button, which slides as the dock changes
 * width. Decoration only — the count is announced on the button itself.
 */
function ChatUnreadBadge({ count, at }: { count: number; at: { left: number; top: number } }) {
  return (
    <span className="chat-unread-badge" style={at} aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Keeps a live element playing without a human hand.
 *
 * `autoPlay` only fires on load: once the browser pauses the element on
 * its own — power saving on a long-backgrounded tab, an OS sleep, a
 * decoder hiccup — nothing ever resumes it, and a stream someone left
 * running "for hours while doing other things" comes back as a frozen
 * frame that only F5 used to fix. There are no user-facing controls on
 * these elements, so every pause is the browser's, and resuming is always
 * right. A play() refused while the tab is hidden is retried when it
 * becomes visible again.
 */
function useResumePlayback(ref: RefObject<HTMLMediaElement | null>, stream: MediaStream) {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const resume = () => {
      if (element.paused) {
        void element.play().catch(() => {
          // autoplay refused while hidden: the visibility handler retries
        });
      }
    };
    const onVisible = () => {
      if (!document.hidden) {
        resume();
      }
    };
    element.addEventListener('pause', resume);
    document.addEventListener('visibilitychange', onVisible);
    resume();
    return () => {
      element.removeEventListener('pause', resume);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // ref is stable; the element exists from the first render on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);
}

function MediaView({
  stream,
  muted,
  className,
  videoRef,
  sinkId,
}: {
  stream: MediaStream;
  muted: boolean;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Playback device; remote cameras sound through the <video> itself. */
  sinkId?: string | null;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  useEffect(() => {
    if (ref.current && sinkId !== undefined) {
      void applySinkId(ref.current, sinkId);
    }
  }, [sinkId, stream]);
  useResumePlayback(ref, stream);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function AudioSink({
  stream,
  sinkId,
  muted,
}: {
  stream: MediaStream;
  sinkId?: string | null;
  /** Speakers off: the element stays wired so unmuting is instant. */
  muted?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  useEffect(() => {
    if (ref.current && sinkId !== undefined) {
      void applySinkId(ref.current, sinkId);
    }
  }, [sinkId, stream]);
  useResumePlayback(ref, stream);
  return <audio ref={ref} autoPlay muted={muted} />;
}

function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
}

/* WebKit prefixes: Safari (desktop and iOS) still lacks the standard API. */
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => unknown };
type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => unknown;
};
type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsFullscreen?: boolean;
};

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Fullscreen for the sharing stage.
 *
 * The CONTAINER goes fullscreen, not the <video>: that keeps the labels (who
 * is sharing, the stats) and the button itself on top of the picture. On
 * iPhone Safari, where only <video> can go fullscreen, it falls back to the
 * video's webkitEnterFullscreen — there the native player takes over.
 */
function useFullscreen(
  containerRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const [active, setActive] = useState(() => fullscreenElement() !== null);

  // Exit happens via Esc, the browser button, or the element going away (the
  // pessoa parou de compartilhar) — em todos os casos o estado vem do DOM.
  useEffect(() => {
    const sync = () => setActive(fullscreenElement() !== null);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const doc = document as WebkitDocument;
    if (fullscreenElement()) {
      void (document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.());
      return;
    }
    const container = containerRef.current as WebkitElement | null;
    if (container?.requestFullscreen) {
      void container.requestFullscreen().catch(() => undefined);
      return;
    }
    if (container?.webkitRequestFullscreen) {
      void container.webkitRequestFullscreen();
      return;
    }
    (videoRef.current as WebkitVideo | null)?.webkitEnterFullscreen?.();
  }, [containerRef, videoRef]);

  return { active, toggle };
}

/**
 * Picture-in-picture for the sharing stage.
 *
 * Unlike fullscreen this one takes the <video>, not the container: the floating
 * window is a browser (and Electron) player, so it carries only the picture —
 * the labels stay on the page. Safari on iPhone has no PiP for a
 * MediaStream-backed video, so the button hides itself where it cannot work.
 */
function usePictureInPicture(
  videoRef: RefObject<HTMLVideoElement | null>,
  /** The stage's stream: the <video> only exists while someone is sharing. */
  stream: MediaStream | null,
) {
  const supported = typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
  const [active, setActive] = useState(false);

  // Leaving happens via the floating window's own close button too, so the
  // state comes from the element's events, never from the click alone. The
  // stream is a dependency because the element it listens on is mounted with
  // the stage, after this component.
  useEffect(() => {
    const video = videoRef.current;
    if (!supported || !video) {
      setActive(false);
      return;
    }
    const enter = () => setActive(true);
    const leave = () => setActive(false);
    setActive(document.pictureInPictureElement === video);
    video.addEventListener('enterpictureinpicture', enter);
    video.addEventListener('leavepictureinpicture', leave);
    return () => {
      video.removeEventListener('enterpictureinpicture', enter);
      video.removeEventListener('leavepictureinpicture', leave);
    };
  }, [supported, stream, videoRef]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!supported || !video) {
      return;
    }
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
      return;
    }
    void video.requestPictureInPicture().catch(() => undefined);
  }, [supported, videoRef]);

  return { supported, active, toggle };
}

const TILE_GAP = 12;
const TILE_RATIO = 16 / 9;

/**
 * Computes the largest 16:9 tile size that fits `count` tiles in the
 * container (Meet style): tries every column count and keeps the best.
 */
function useTileGrid(count: number) {
  // Callback ref via estado: o contêiner só monta depois de "connecting",
  // so the effect must react to the element appearing, not just to count.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!el || count === 0) {
      return;
    }
    const compute = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (!width || !height) {
        return;
      }
      let best = { width: 0, height: 0 };
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        let w = (width - TILE_GAP * (cols - 1)) / cols;
        let h = w / TILE_RATIO;
        const maxH = (height - TILE_GAP * (rows - 1)) / rows;
        if (h > maxH) {
          h = maxH;
          w = h * TILE_RATIO;
        }
        if (w > best.width) {
          best = { width: w, height: h };
        }
      }
      setSize({ width: Math.floor(best.width), height: Math.floor(best.height) });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, count]);

  return { ref: setEl, size };
}

function Tile({
  name,
  isSelf,
  micOff,
  deafened,
  silenced,
  speaking,
  cameraOn,
  stream,
  latencyMs,
  latencyTitle,
  style,
  sinkId,
  onSelect,
  pinned,
}: {
  name: string;
  isSelf: boolean;
  micOff: boolean;
  /** This person's speakers are off: they are not hearing the room. */
  deafened: boolean;
  /** OUR speakers are off: this tile's audio is muted locally. */
  silenced?: boolean;
  speaking: boolean;
  /**
   * The room's word, not the track's: a remote track stays `enabled` on the
   * receiver even after the sender turns its camera off (black frames keep
   * flowing), so only the camera roster can say whether this tile has a face.
   */
  cameraOn: boolean;
  stream: MediaStream | null;
  /**
   * Round-trip time, measured here: on a peer's tile it is OUR link to them,
   * so one high reading is that pair's problem. The self tile carries the
   * middle of every link instead — when THAT climbs, the room is not the
   * problem, we are.
   */
  latencyMs?: number | null;
  latencyTitle?: string;
  style?: React.CSSProperties;
  /** Playback device for a remote peer's audio; self tiles pass none. */
  sinkId?: string | null;
  /** Click puts this person on stage (spotlight); absent on the stage tile itself. */
  onSelect?: () => void;
  /** Kept on stage by the viewer's choice. */
  pinned?: boolean;
}) {
  const { t } = useI18n();
  const showVideo = cameraOn && stream !== null && hasLiveVideo(stream);
  return (
    <div
      className="tile"
      data-speaking={speaking ? 'true' : undefined}
      data-pinned={pinned ? 'true' : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      title={onSelect ? (pinned ? t('room.pinned') : t('room.pinHint')) : undefined}
      style={style}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <LatencyChip ms={latencyMs ?? null} title={latencyTitle ?? ''} />
      {showVideo ? (
        <MediaView
          stream={stream}
          muted={isSelf || silenced === true}
          className={`tile-video ${isSelf ? 'mirrored' : ''}`}
          sinkId={isSelf ? undefined : sinkId}
        />
      ) : (
        <>
          <Avatar name={name} className="tile-avatar" />
          {!isSelf && stream && <AudioSink stream={stream} sinkId={sinkId} muted={silenced} />}
        </>
      )}
      <span className="tile-name">
        {pinned && (
          <span className="tile-pin" title={t('room.pinned')}>
            <PinIcon />
          </span>
        )}
        {micOff && (
          <span className="tile-mic-off" title={t('room.micMuted')}>
            <MicOffIcon />
          </span>
        )}
        {deafened && (
          <span className="tile-deafened" title={t('room.deafened')}>
            <SpeakerOffIcon />
          </span>
        )}
        {name}
        {isSelf && <span className="tile-you"> · {t('room.you')}</span>}
      </span>
    </div>
  );
}

export default function RoomView({
  room,
  options,
  onLeft,
}: {
  room: RoomSummary;
  options: JoinOptions;
  onLeft: () => void;
}) {
  const { t, locale } = useI18n();
  const session = useRoomSession(options);
  const speaking = useSpeaking(session);
  // Whoever spoke last, others before ourselves: the spotlight follows
  // them when no screen is shared and nothing is pinned.
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  useEffect(() => {
    const voices = [...speaking];
    const current = voices.find((id) => id !== session.selfId) ?? voices[0] ?? null;
    if (current !== null) {
      setLastSpeaker(current);
    }
  }, [speaking, session.selfId]);
  const [chatOpen, setChatOpen] = useState(false);
  // Layout and focus are this person's own view of the room: what they
  // pinned stays on stage; otherwise the stage follows the newest screen,
  // someone else's before our own. Grid gives everything equal area.
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const pickLayout = useCallback((next: Layout) => {
    saveLayout(next);
    setLayout(next);
  }, []);
  const switchLayout = useCallback(() => {
    setLayout((current) => {
      const next: Layout = current === 'grid' ? 'spotlight' : 'grid';
      saveLayout(next);
      return next;
    });
  }, []);
  /** Pin, or unpin when it is already the pinned one (the stage goes back to following). */
  const togglePin = useCallback((next: Pinned) => {
    setPinned((current) =>
      current && current.kind === next.kind && current.id === next.id ? null : next,
    );
  }, []);
  /** The message the next one replies to; cleared on send or cancel. */
  const [replyTo, setReplyTo] = useState<ChatQuote | null>(null);
  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Why the last attach went nowhere; cleared on the next attempt. */
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [badgeAt, setBadgeAt] = useState<{ left: number; top: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  // A callback ref, not a plain one: the dock only exists once the room is
  // connected (this component returns early before that), so the badge has to
  // be measured when the button actually lands, not on the first mount.
  const [chatButton, setChatButton] = useState<HTMLButtonElement | null>(null);

  const { status } = session;
  useEffect(() => {
    if (status.kind === 'ended' && status.reason === 'left') {
      onLeft();
    }
  }, [status, onLeft]);

  useEffect(() => {
    if (chatOpen) {
      setUnread(0);
      chatEndRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [session.chat, chatOpen]);

  const chatCount = session.chat.length;
  const seenCountRef = useRef(0);
  useEffect(() => {
    // The delta is taken BEFORE the ref moves: a state updater runs at render
    // time, so `n + (chatCount - seenCountRef.current)` read the ref after the
    // line below had already advanced it — every increment came out as zero
    // and the counter never left 0.
    const arrived = chatCount - seenCountRef.current;
    seenCountRef.current = chatCount;
    if (!chatOpen && arrived > 0) {
      setUnread((n) => n + arrived);
    }
  }, [chatCount, chatOpen]);

  // A file offered to us is a message too: it counts on the badge while the
  // panel is shut and rings the same chime. Keyed by transfer, not by list
  // length — dismissing a settled transfer must not turn into a phantom.
  const { transfers } = session;
  const noticedOffersRef = useRef(new Set<string>());
  useEffect(() => {
    let arrived = 0;
    for (const transfer of transfers) {
      if (transfer.direction === 'in' && !noticedOffersRef.current.has(transfer.key)) {
        noticedOffersRef.current.add(transfer.key);
        arrived++;
      }
    }
    if (arrived === 0) {
      return;
    }
    if (!chatOpen) {
      setUnread((n) => n + arrived);
    }
    playMessageChime();
  }, [transfers, chatOpen]);

  // Sound alert: only for someone else's message, chat open or not.
  const soundedCountRef = useRef(0);
  const { chat, selfId } = session;

  /** Text and files share one stream, ordered by when they happened. */
  const timeline = useMemo(() => {
    type Entry =
      | { kind: 'text'; key: string; ts: number; message: (typeof session.chat)[number] }
      | { kind: 'file'; key: string; ts: number; transfers: (typeof session.transfers)[number][] };
    const entries: Entry[] = session.chat.map((message, index) => ({
      kind: 'text',
      key: `${message.ts}-${index}`,
      ts: message.ts,
      message,
    }));
    // A file sent to the whole room is one bubble: every recipient's copy
    // shares the batch. Incoming files are one bubble each already.
    const batches = new Map<string, (typeof session.transfers)[number][]>();
    for (const transfer of session.transfers) {
      const group = batches.get(transfer.batch);
      if (group) {
        group.push(transfer);
      } else {
        batches.set(transfer.batch, [transfer]);
      }
    }
    for (const [batch, transfers] of batches) {
      entries.push({ kind: 'file', key: `file-${batch}`, ts: transfers[0]!.ts, transfers });
    }
    return entries.sort((a, b) => a.ts - b.ts);
  }, [session.chat, session.transfers]);

  // Names outlive seats: a transfer bubble still says who sent the file
  // after that person has left the room.
  const knownNamesRef = useRef(new Map<string, string>());
  for (const peer of session.peers) {
    knownNamesRef.current.set(peer.id, peer.name);
  }
  const peerName = useCallback(
    (peerId: string) =>
      session.peers.find((peer) => peer.id === peerId)?.name ??
      knownNamesRef.current.get(peerId) ??
      '…',
    [session.peers],
  );

  function sendFiles(files: File[]): void {
    setFileNote(null);
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        setFileNote(t('file.tooLarge', { max: formatBytes(MAX_FILE_BYTES, locale) }));
        continue;
      }
      if (session.sendFile(file) === 0) {
        setFileNote(t('file.noPeers'));
        return;
      }
    }
  }
  useEffect(() => {
    const fresh = chat.slice(soundedCountRef.current);
    soundedCountRef.current = chat.length;
    if (fresh.some((message) => message.from.id !== selfId)) {
      playMessageChime();
    }
  }, [chat, selfId]);

  // The badge rides the chat button's corner, and the button moves as the dock
  // changes width (screen button disabled, narrow screens) — hence the
  // measurement. The dock is watched too: it grows and shrinks on its own,
  // without the window ever being resized.
  useLayoutEffect(() => {
    const dock = chatButton?.parentElement;
    if (!chatButton || !dock) {
      return;
    }
    const measure = () => {
      const button = chatButton.getBoundingClientRect();
      const footer = footerRef.current?.getBoundingClientRect();
      if (!footer) {
        return;
      }
      const next = { left: button.right - footer.left, top: button.top - footer.top };
      setBadgeAt((current) =>
        current && current.left === next.left && current.top === next.top ? current : next,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [chatButton]);

  const stageRef = useRef<HTMLDivElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const fullscreen = useFullscreen(stageRef, screenVideoRef);

  // The listener registers once; the session object is a fresh literal per
  // render, so the handler reads the latest one through a ref.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          // A dialog owns the keyboard while it is open: "m" on a focused
          // settings button must not mute the call behind it.
          target.closest('[role="dialog"]') !== null)
      ) {
        return;
      }
      const current = sessionRef.current;
      switch (event.key.toLowerCase()) {
        case 'm':
          current.toggleMic();
          return;
        case 'd':
          current.toggleSpeaker();
          return;
        case 'v':
          // Same path as the button — the server's slot request flow,
          // never the track directly; mirrors the button's disabled state.
          if (!current.cameraSlotsFull) {
            current.toggleCam();
          }
          return;
        case 's': {
          const sharing = current.screens.some((share) => share.id === current.selfId);
          if (sharing) {
            current.stopScreenShare();
          } else if (current.screens.length < MAX_SCREENS) {
            void current.startScreenShare();
          }
          return;
        }
        case 'l':
          switchLayout();
          return;
        case 'c':
          // The composer takes focus as the panel opens; without this the
          // same keystroke would land in it as a typed "c".
          event.preventDefault();
          setChatOpen((open) => !open);
          return;
        case 'q': {
          // Only while sharing: cycling a preset nobody is sending is invisible.
          if (!current.screens.some((share) => share.id === current.selfId)) {
            return;
          }
          const index = SCREEN_QUALITY_PRESETS.findIndex((p) => p.id === current.screenQuality);
          const next = SCREEN_QUALITY_PRESETS[(index + 1) % SCREEN_QUALITY_PRESETS.length];
          if (next) {
            current.setScreenQuality(next.id);
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Computed on every render on purpose: remote streams arrive through a
  // mesh notification (a re-render with no React state change) — a useMemo
  // here would hand back the cached value and never see the stream. In the
  // relay tree a screen arrives from its PARENT (the source), which may be
  // a relay rather than the person sharing.
  const streamOfScreen = (share: ScreenShare): MediaStream | null => {
    if (share.id === session.selfId) {
      return session.localScreen;
    }
    const source = session.screenSources.get(share.id) ?? null;
    return source
      ? (session.mesh?.getPeerStreams(source.id).find((s) => s.id === source.streamId) ?? null)
      : null;
  };
  const screenItems: ScreenItem[] = session.screens.map((share) => ({
    share,
    stream: streamOfScreen(share),
    mine: share.id === session.selfId,
    name:
      share.id === session.selfId
        ? null
        : (session.peers.find((p) => p.id === share.id)?.name ?? t('room.someone')),
  }));
  // A pin outlives what it points at only until that leaves the room.
  const pinnedLive =
    pinned &&
    (pinned.kind === 'screen'
      ? screenItems.some((item) => item.share.id === pinned.id)
      : pinned.id === session.selfId || session.peers.some((p) => p.id === pinned.id))
      ? pinned
      : null;
  const cameraOn = (id: string) => (id === session.selfId ? session.camOn : session.cameras.has(id));
  // What the spotlight follows when nothing is pinned: the newest screen
  // (someone else's before our own, once its stream is here), else whoever
  // spoke last, else a face with the camera on (others first), else the
  // first other person, else ourselves — the stage is never empty.
  const withStream = [...screenItems].reverse().filter((item) => item.stream !== null);
  const followedScreen = withStream.find((item) => !item.mine) ?? withStream[0] ?? null;
  const speakerLive =
    lastSpeaker !== null &&
    (lastSpeaker === session.selfId || session.peers.some((p) => p.id === lastSpeaker))
      ? lastSpeaker
      : null;
  const followedPerson =
    speakerLive ??
    session.peers.find((p) => cameraOn(p.id))?.id ??
    (session.camOn ? session.selfId : null) ??
    session.peers[0]?.id ??
    session.selfId;
  const pinnedScreen =
    pinnedLive?.kind === 'screen'
      ? (screenItems.find((item) => item.share.id === pinnedLive.id) ?? null)
      : null;
  // A pinned screen whose stream has not arrived yet leaves the stage empty until it has.
  const stageScreen =
    layout === 'grid' ? null : pinnedLive ? (pinnedScreen?.stream ? pinnedScreen : null) : followedScreen;
  const stagePersonId =
    layout === 'grid'
      ? null
      : pinnedLive?.kind === 'person'
        ? pinnedLive.id
        : pinnedLive?.kind === 'screen' || followedScreen
          ? null
          : followedPerson;
  const stageStream = stageScreen?.stream ?? null;
  const onStage = stageScreen !== null || stagePersonId !== null;

  // The hook's stats and stall watch follow whatever screen is on stage.
  const watchedId = stageScreen?.share.id ?? null;
  const watchScreen = session.watchScreen;
  useEffect(() => {
    watchScreen(watchedId);
  }, [watchScreen, watchedId]);

  const pip = usePictureInPicture(screenVideoRef, stageStream);

  const participantCount = session.peers.length + 1;
  // Only real faces get grid area. Ghost seat tiles were tried and retired:
  // sizing the grid by all 12 seats shrank one person to a twelfth of the
  // screen in an empty room. Capacity lives in the header's seat counter.
  // With something on stage the tiles collapse to the strip; in the grid
  // layout the screens take tiles of their own.
  const grid = useTileGrid(
    onStage ? 0 : participantCount + (layout === 'grid' ? screenItems.length : 0),
  );

  if (status.kind === 'ended' && status.reason !== 'left') {
    const message =
      status.reason === 'room_full'
        ? t('room.endedFull')
        : status.reason === 'room_not_found'
          ? t('room.endedNotFound')
          : t('room.endedClosed');
    return (
      <main className="centered fade-in">
        <h1>{t('room.leftTitle')}</h1>
        <p>{message}</p>
        <Link to="/" className="button-link">
          {t('prejoin.backHome')}
        </Link>
      </main>
    );
  }

  if (status.kind === 'connecting') {
    // A espera carrega a marca, o nome da sala e o rosto de quem entra: são
    // as três coisas que vêm voando da soleira, e num spinner puro elas
    // chegavam ao nada. As classes -waiting- são estilizadas em hero.css.
    return (
      <main className="centered fade-in">
        <Logo size={44} className="room-waiting-mark" />
        <h1 className="room-waiting-name">{room.displayName || t('room.unnamed')}</h1>
        <Avatar name={options.name} className="room-waiting-avatar" />
        <div className="spinner" aria-hidden />
        <p>{t('room.connecting')}</p>
      </main>
    );
  }

  const iAmSharing = session.screens.some((share) => share.id === session.selfId);
  /** Every screen slot taken by others: the button waits for one to free up. */
  const screensFull = !iAmSharing && session.screens.length >= MAX_SCREENS;
  const sharerName = stageScreen && !stageScreen.mine ? stageScreen.name : null;
  // Received through a tree relay: the RTT shown is to it, not to the source.
  const stageSource =
    stageScreen && !stageScreen.mine ? (session.screenSources.get(stageScreen.share.id) ?? null) : null;
  const relayName =
    stageSource && stageScreen && stageSource.id !== stageScreen.share.id
      ? (session.peers.find((p) => p.id === stageSource.id)?.name ?? 'relay')
      : null;

  // System audio arrives straight from the SHARER (mesh, like the mic), in
  // the display stream announced by screen-started — even when the video
  // comes through a relay. The stage <video> is muted, so the audio needs
  // its own audible sink.
  // HUD telemetry: language-neutral technical tokens, deliberately not
  // i18n'd. Metrics without a reading yet are simply absent.
  const hudMetrics: { label: string; value: string }[] = [];
  const rtts = [...session.peerLatency.values()]
    .map((latency) => latency.rttMs)
    .filter((rtt): rtt is number => rtt !== null);
  if (rtts.length > 0) {
    // The worst pair: one number that still points at whoever the call drags for.
    hudMetrics.push({ label: 'rtt', value: `${Math.max(...rtts)} ms` });
  }
  // Our own reading has no peer to measure against — every link is ours. The
  // middle one is the honest summary: a single bad pair leaves it alone, and a
  // connection going bad on this end drags all of them, so it climbs.
  const sortedRtts = [...rtts].sort((a, b) => a - b);
  const selfRttMs = sortedRtts.length > 0 ? sortedRtts[Math.floor((sortedRtts.length - 1) / 2)] : null;
  const hudStats = session.screenStats;
  if (hudStats?.kbps != null) {
    hudMetrics.push({
      label: hudStats.direction === 'sending' ? '↑' : '↓',
      value: formatBitrate(hudStats.kbps),
    });
  }
  if (hudStats?.fps != null) {
    hudMetrics.push({ label: 'fps', value: `${Math.round(hudStats.fps)}` });
  }
  if (hudStats?.width != null && hudStats?.height != null) {
    hudMetrics.push({ label: 'res', value: `${hudStats.width}×${hudStats.height}` });
  }
  // Relaying ourselves: the forwarding mode; fed through a relay: its name.
  const hudRelay = stageScreen ? (hudStats?.relayMode ?? relayName) : null;
  if (hudRelay) {
    hudMetrics.push({ label: 'relay', value: hudRelay });
  }

  // System audio arrives straight from each SHARER (mesh, like the mic), in
  // the display stream announced by screen-started — even when the video
  // comes through a relay, and whichever screen is on stage. The stage
  // <video> is muted, so the audio needs its own audible sink, one per screen.
  const screenAudioStreams = screenItems.flatMap((item) => {
    if (item.mine) {
      return [];
    }
    const stream = session.mesh
      ?.getPeerStreams(item.share.id)
      .find((s) => s.id === item.share.streamId && s.getAudioTracks().length > 0);
    return stream ? [{ id: item.share.id, stream }] : [];
  });

  const tileStyle = !onStage && grid.size ? { width: grid.size.width, height: grid.size.height } : undefined;
  const selfPinned = pinnedLive?.kind === 'person' && pinnedLive.id === session.selfId;
  // Tiles in the strip and the grid: screens first (rendered before this
  // list), then faces with the camera on, then the rest; ourselves first
  // within each group.
  type Person = { id: string; name: string; self?: boolean };
  const people: Person[] = [
    { id: session.selfId ?? 'self', name: options.name, self: true },
    ...session.peers,
  ].sort((a, b) => Number(cameraOn(b.id)) - Number(cameraOn(a.id)));
  const selfTile = (onSelect: (() => void) | undefined, pinnedTile: boolean) => (
    <Tile
      key="self"
      name={options.name}
      isSelf
      micOff={!session.micOn}
      deafened={!session.speakerOn}
      speaking={session.selfId !== null && speaking.has(session.selfId)}
      cameraOn={session.camOn}
      stream={session.localMedia && session.camOn ? session.localMedia : null}
      latencyMs={selfRttMs}
      latencyTitle={t('latency.self')}
      style={onSelect ? tileStyle : undefined}
      onSelect={onSelect}
      pinned={pinnedTile}
    />
  );
  const peerTile = (peer: { id: string; name: string }, onSelect: (() => void) | undefined, pinnedTile: boolean) => {
    const streams = session.mesh?.getPeerStreams(peer.id) ?? [];
    const cameraStream = streams.find((stream) => !session.screenStreamIds.has(stream.id)) ?? null;
    return (
      <Tile
        key={peer.id}
        name={peer.name}
        isSelf={false}
        micOff={session.muted.has(peer.id)}
        deafened={session.deafened.has(peer.id)}
        silenced={!session.speakerOn}
        speaking={speaking.has(peer.id)}
        cameraOn={session.cameras.has(peer.id)}
        stream={cameraStream}
        latencyMs={session.peerLatency.get(peer.id)?.rttMs ?? null}
        latencyTitle={t('latency.peer', { name: peer.name })}
        style={onSelect ? tileStyle : undefined}
        sinkId={session.audioDevices.speakerId}
        onSelect={onSelect}
        pinned={pinnedTile}
      />
    );
  };

  return (
    <div className="room-layout">
      {screenAudioStreams.map(({ id, stream }) => (
        <AudioSink
          key={id}
          stream={stream}
          sinkId={session.audioDevices.speakerId}
          muted={!session.speakerOn}
        />
      ))}
      <header className="room-header">
        <div className="room-title">
          <Logo size={22} className="room-logo" />
          <h1>{room.displayName || t('room.unnamed')}</h1>
          <span className="room-count">
            {t('room.participants', { count: participantCount })}
          </span>
          <span
            className="seat-count"
            aria-label={t('room.seatsAria', { count: participantCount, max: MAX_PARTICIPANTS })}
          >
            {participantCount}/{MAX_PARTICIPANTS}
          </span>
        </div>
        {hudMetrics.length > 0 && (
          <div className="hud-bar">
            {hudMetrics.map((metric) => (
              <span key={metric.label} className="hud-metric">
                <b>{metric.label}</b>
                <i>{metric.value}</i>
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="room-body">
        <div className="stage-area">
          {stageStream && (
            <div
              className={`screen-stage fade-in ${fullscreen.active ? 'is-fullscreen' : ''}`}
              ref={stageRef}
              onDoubleClick={fullscreen.toggle}
            >
              <MediaView
                stream={stageStream}
                muted
                className="screen-video"
                videoRef={screenVideoRef}
              />
              <div className="screen-actions">
                <button
                  type="button"
                  className="screen-action screen-pin"
                  aria-pressed={pinnedLive !== null}
                  title={pinnedLive ? t('room.unpin') : t('room.pinHint')}
                  aria-label={pinnedLive ? t('room.unpin') : t('room.pinHint')}
                  onClick={() => stageScreen && togglePin({ kind: 'screen', id: stageScreen.share.id })}
                >
                  <PinIcon />
                </button>
                {pip.supported && (
                  <button
                    type="button"
                    className="screen-action"
                    aria-pressed={pip.active}
                    title={pip.active ? t('screen.exitPip') : t('screen.enterPip')}
                    aria-label={pip.active ? t('screen.exitPip') : t('screen.enterPip')}
                    onClick={pip.toggle}
                  >
                    {pip.active ? <ExitPictureInPictureIcon /> : <PictureInPictureIcon />}
                  </button>
                )}
                <button
                  type="button"
                  className="screen-action screen-fullscreen"
                  aria-pressed={fullscreen.active}
                  title={
                    fullscreen.active ? t('screen.exitFullscreen') : t('screen.enterFullscreen')
                  }
                  aria-label={
                    fullscreen.active ? t('screen.exitFullscreen') : t('screen.enterFullscreen')
                  }
                  onClick={fullscreen.toggle}
                >
                  {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                </button>
              </div>
              <div className="screen-overlay">
                <span className="screen-label">
                  {sharerName ? t('screen.of', { name: sharerName }) : t('screen.yours')}
                  {relayName && (
                    <span className="screen-relay-hint"> · {t('screen.via', { name: relayName })}</span>
                  )}
                </span>
                {session.screenStats && <ScreenStatsBar stats={session.screenStats} />}
              </div>
            </div>
          )}
          {stagePersonId !== null && (
            <div className="screen-stage stage-person fade-in">
              {stagePersonId === session.selfId
                ? selfTile(undefined, pinnedLive !== null)
                : (() => {
                    const peer = session.peers.find((p) => p.id === stagePersonId);
                    return peer ? peerTile(peer, undefined, pinnedLive !== null) : null;
                  })()}
              <div className="screen-actions">
                <button
                  type="button"
                  className="screen-action screen-pin"
                  aria-pressed={pinnedLive !== null}
                  title={pinnedLive ? t('room.unpin') : t('room.pinHint')}
                  aria-label={pinnedLive ? t('room.unpin') : t('room.pinHint')}
                  onClick={() => togglePin({ kind: 'person', id: stagePersonId })}
                >
                  <PinIcon />
                </button>
              </div>
            </div>
          )}
          <div className={onStage ? 'tiles tiles-strip' : 'tiles tiles-grid'} ref={grid.ref}>
            {screenItems
              .filter((item) => item !== stageScreen)
              .map((item) => (
                <ScreenTile
                  key={`screen-${item.share.id}`}
                  item={item}
                  label={item.name ? t('screen.of', { name: item.name }) : t('screen.yours')}
                  pinned={pinnedLive?.kind === 'screen' && pinnedLive.id === item.share.id}
                  style={tileStyle}
                  onSelect={() => togglePin({ kind: 'screen', id: item.share.id })}
                />
              ))}
            {people
              .filter((person) => person.id !== stagePersonId)
              .map((person) =>
                person.self
                  ? selfTile(
                      () => session.selfId && togglePin({ kind: 'person', id: session.selfId }),
                      selfPinned,
                    )
                  : peerTile(
                      person,
                      () => togglePin({ kind: 'person', id: person.id }),
                      pinnedLive?.kind === 'person' && pinnedLive.id === person.id,
                    ),
              )}
          </div>
        </div>

        {chatOpen && (
          <aside
            className="chat-panel"
            aria-label={t('chat.title')}
            onKeyDown={(event) => {
              // Escape shuts the panel; the composer swallows it first when a
              // reply is pending, so one press cancels the reply and the next closes.
              if (event.key === 'Escape') {
                event.preventDefault();
                setChatOpen(false);
              }
            }}
          >
            <header className="chat-header">
              <h2>{t('chat.title')}</h2>
              <button
                type="button"
                className="chat-close"
                aria-label={t('controls.closeChat')}
                onClick={() => setChatOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>
            <div className="chat-messages">
              {session.chat.length === 0 && session.transfers.length === 0 && (
                <p className="chat-empty">{t('chat.empty')}</p>
              )}
              {timeline.map((entry) => {
                if (entry.kind === 'file') {
                  return (
                    <FileTransferBubble
                      key={entry.key}
                      transfers={entry.transfers}
                      peerName={peerName}
                      onAccept={session.acceptTransfer}
                      onDecline={session.declineTransfer}
                      onCancel={session.cancelTransfer}
                      onDismiss={session.dismissTransfer}
                    />
                  );
                }
                const { message } = entry;
                const mine = message.from.id === session.selfId;
                return (
                  <div key={entry.key} className={`chat-bubble ${mine ? 'mine' : ''}`}>
                    {!mine && <span className="chat-author">{message.from.name}</span>}
                    {message.quote && (
                      <blockquote className="chat-quote">
                        <span className="chat-quote-name">{message.quote.name}</span>
                        <span className="chat-quote-text">{message.quote.text}</span>
                      </blockquote>
                    )}
                    {message.unreadable ? (
                      <p className="chat-locked">{t('chat.locked')}</p>
                    ) : (
                      <div className="chat-md">{renderMarkdown(message.text)}</div>
                    )}
                    {!message.unreadable && (
                      <button
                        type="button"
                        className="chat-reply-btn"
                        aria-label={t('chat.reply')}
                        title={t('chat.reply')}
                        onClick={() =>
                          setReplyTo({ name: message.from.name, text: excerptOf(message.text) })
                        }
                      >
                        <ReplyIcon />
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            {fileNote && (
              <p className="chat-file-note" role="status">
                {fileNote}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = '';
                sendFiles(files);
              }}
            />
            <ChatComposer
              value={draft}
              maxLength={bodyBudget(replyTo)}
              locked={session.chatLocked}
              quote={replyTo}
              onChange={setDraft}
              onSend={() => {
                const text = draft.trim();
                if (text) {
                  session.sendChat(text, replyTo);
                  setDraft('');
                  setReplyTo(null);
                }
              }}
              onAttach={() => fileInputRef.current?.click()}
              onPasteFiles={sendFiles}
              onCancelQuote={() => setReplyTo(null)}
            />
          </aside>
        )}
      </div>

      <footer className="room-footer" ref={footerRef}>
        {session.camDenied && (
          <p className="cam-denied-note" role="status">
            {t('room.camDenied')}
          </p>
        )}
        {!chatOpen && unread > 0 && badgeAt && <ChatUnreadBadge count={unread} at={badgeAt} />}
        {settingsOpen && (
          <SettingsMenu
            screenQuality={session.screenQuality}
            onScreenQuality={session.setScreenQuality}
            settings={session.mediaSettings}
            onSettings={session.updateMediaSettings}
            // In a browser the picker itself decides (Chromium offers tab or
            // system audio); only the desktop shell can rule it out upfront.
            screenAudioSupported={!isDesktopApp() || desktopSystemAudio()}
            audioDevices={session.audioDevices}
            onAudioDevices={session.updateAudioDevices}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        <div className="dock-glass">
          <div className="controls">
          {/* The link is the invite, so it sits with the other keys rather
              than as a chip in the corner: the first thing a host looks for. */}
          <InviteButton />
          <button
            type="button"
            className={`control ${session.micOn ? '' : 'control-off'}`}
            aria-pressed={!session.micOn}
            data-key="M"
            title={session.micOn ? t('controls.muteMic') : t('controls.unmuteMic')}
            onClick={session.toggleMic}
          >
            {session.micOn ? <MicIcon /> : <MicOffIcon />}
          </button>
          <button
            type="button"
            className={`control ${session.speakerOn ? '' : 'control-off'}`}
            aria-pressed={!session.speakerOn}
            data-key="D"
            title={session.speakerOn ? t('controls.muteSpeaker') : t('controls.unmuteSpeaker')}
            onClick={session.toggleSpeaker}
          >
            {session.speakerOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </button>
          {/* The "no slot" state is its own thing, not the off style: it is
              styled via [data-camera-slots="full"]. */}
          <button
            type="button"
            className={`control ${session.camOn || session.cameraSlotsFull ? '' : 'control-off'}`}
            aria-pressed={!session.camOn}
            disabled={session.cameraSlotsFull}
            data-key="V"
            data-camera-slots={session.cameraSlotsFull ? 'full' : undefined}
            title={
              session.cameraSlotsFull
                ? t('room.camSlotsFull')
                : session.camOn
                  ? t('controls.camOff')
                  : t('controls.camOn')
            }
            aria-label={
              session.cameraSlotsFull
                ? t('room.camSlotsFull')
                : session.camOn
                  ? t('controls.camOff')
                  : t('controls.camOn')
            }
            onClick={session.toggleCam}
          >
            {session.camOn ? <CamIcon /> : <CamOffIcon />}
          </button>
          <button
            type="button"
            className={`control ${iAmSharing ? 'control-active' : ''}`}
            aria-pressed={iAmSharing}
            disabled={screensFull}
            data-key="S"
            title={
              screensFull
                ? t('controls.screensFull')
                : iAmSharing
                  ? t('controls.stopSharing')
                  : t('controls.shareScreen')
            }
            onClick={() => {
              if (iAmSharing) {
                session.stopScreenShare();
              } else {
                void session.startScreenShare();
              }
            }}
          >
            <ScreenIcon />
          </button>
          <button
            type="button"
            className={`control ${settingsOpen ? 'control-active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            data-key="Q"
            title={t('controls.settings')}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <SlidersIcon />
          </button>
          {/*
            Both layouts on show, the one in use lit. A single key had to
            choose between drawing where you are and where you would go, and
            whichever it drew, half the room read it the other way.
          */}
          <div
            className="layout-select"
            role="group"
            data-key="L"
            aria-label={t('controls.layout', {
              name: t(layout === 'grid' ? 'layout.grid' : 'layout.spotlight'),
            })}
          >
            {LAYOUT_OPTIONS.map(({ value, labelKey, Icon }) => (
              <button
                key={value}
                type="button"
                className="layout-option"
                aria-pressed={layout === value}
                data-layout={value}
                title={t(labelKey)}
                aria-label={t(labelKey)}
                onClick={() => pickLayout(value)}
              >
                <Icon />
              </button>
            ))}
          </div>
          <button
            ref={setChatButton}
            type="button"
            className={`control ${chatOpen ? 'control-active' : ''}`}
            aria-pressed={chatOpen}
            data-key="C"
            title={chatOpen ? t('controls.closeChat') : t('controls.openChat')}
            // The badge is decorative, so the count is spoken here instead.
            aria-label={
              !chatOpen && unread > 0
                ? `${t('controls.openChat')} — ${unread} ${t('chat.unread', { count: unread })}`
                : undefined
            }
            onClick={() => setChatOpen((open) => !open)}
          >
            <ChatIcon />
          </button>
          <button
            type="button"
            className="control control-leave"
            title={t('controls.leave')}
            onClick={session.leave}
          >
            <LeaveIcon />
          </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
