import {
  Fragment,
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
import { MOTION, useDeparting, useFlip, usePresence } from '../lib/motion';
import { playMessageChime } from '../lib/notification-sound';
import { useI18n, type MessageKey } from '../i18n';
import { desktopSystemAudio, isDesktopApp } from '../lib/platform';
import { MAX_PARTICIPANTS, MAX_SCREENS } from '../lib/protocol';
import { SCREEN_QUALITY_PRESETS } from '../lib/screen-quality';
import type { PeerLatency, ScreenStats } from '../lib/stats';
import { useRoomSession, type JoinOptions, type ScreenShare } from '../lib/use-room';
import { useSpeaking } from '../lib/use-speaking';
import Avatar from './Avatar';
import ChatComposer from './ChatComposer';
import ChatSearch from './ChatSearch';
import CopyButton from './CopyButton';
import FileTransferBubble from './FileTransferBubble';
import Highlight from './Highlight';
import { MAX_FILE_BYTES, formatBytes } from '../lib/file-transfer';
import { bodyBudget, excerptOf, type ChatQuote } from '../lib/chat-body';
import { mentionsAnyOf } from '../lib/mentions';
import { localeCodes, readLine, usageOf } from '../lib/chat-commands';
import { compactInviteUrl } from '../lib/invite';
import { matches, queryTerms } from '../lib/chat-search';
import { dayKey, dayLabel } from '../lib/chat-time';
import { buildTranscript, transcriptFilename, type TranscriptLine } from '../lib/chat-transcript';
import { copyText, downloadText } from '../lib/clipboard';
import InviteButton from './InviteButton';
import Logo from './Logo';
import Brand from './Brand';
import MeshBackground from './MeshBackground';
import MixerMenu from './MixerMenu';
import SettingsMenu from './SettingsMenu';
import ToolsMenu from './ToolsMenu';
import ToolStage from './ToolStage';
import { TOOLS, askTools, hasLiveTool, stagedToolOf } from '../tools/registry';
import { toolText, useToolText, type RegisteredTool } from '../tools/contract';
import { applySinkId } from '../lib/audio-devices';
import { setPlayback, type PlayingSource } from '../lib/audio-bus';
import { mixKey, useAudioMix } from '../lib/audio-mix';
import { takesPartInTool, toolDecision, type ToolChoice } from '../lib/participation';
import { useAmplifiedPlayback } from '../lib/playback-gain';
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
  SearchIcon,
  FadersIcon,
  SlidersIcon,
  ToolboxIcon,
  TranscriptIcon,
} from './icons';
import { SpeakerIcon, SpeakerOffIcon } from './icons';
import '../pages/state.css';

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

/**
 * The chip over a face says the one number everybody understands; hovering it
 * says the rest of that person's link. Technical tokens, like the HUD's, and
 * only the readings that exist — a link the report is quiet about adds nothing.
 */
function linkDetail(title: string, link: PeerLatency | null): string {
  if (!link) {
    return title;
  }
  const parts = [
    link.lossRate !== null ? `loss ${formatLoss(link.lossRate)}` : null,
    link.jitterMs !== null ? `jitter ${link.jitterMs} ms` : null,
    link.jitterBufferMs !== null ? `jbuf ${link.jitterBufferMs} ms` : null,
    link.path,
    link.codec,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `${title} · ${parts.join(' · ')}` : title;
}

function formatBitrate(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${kbps} kb/s`;
}

/**
 * Loss as a figure somebody can act on: a tenth of a percent matters down
 * where voice starts breaking up, and nobody needs a decimal at 12%.
 */
function formatLoss(rate: number): string {
  const percent = rate * 100;
  if (percent === 0) {
    return '0%';
  }
  return percent < 9.95 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;
}

/**
 * The middle reading of the links we hold, for a number that is about OUR
 * network rather than any one pair. Every link is ours, so a single bad
 * peer leaves the middle alone while a connection going bad on this end
 * drags all of them and moves it. The lower middle on an even count: with
 * two links the kinder one is the one we cannot blame on the other side.
 */
/** The readings that exist, out of one per link — a link with none is not a zero. */
function present<T>(values: readonly (T | null)[]): T[] {
  return values.filter((value): value is T => value !== null);
}

function middleOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
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
function ChatUnreadBadge({
  count,
  at,
  leaving,
}: {
  count: number;
  at: { left: number; top: number };
  leaving?: boolean;
}) {
  return (
    <span
      className="chat-unread-badge"
      style={at}
      data-leaving={leaving ? 'true' : undefined}
      aria-hidden="true"
    >
      {/* Keyed by what it says: a count that goes up is a new badge, so it
          pops again instead of the digit changing under the eye. */}
      <span key={count}>{count > 99 ? '99+' : count}</span>
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
  volume,
}: {
  stream: MediaStream;
  muted: boolean;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Playback device; remote cameras sound through the <video> itself. */
  sinkId?: string | null;
  /** This source's own level, 0 … 2 (audio-mix.ts). */
  volume?: number;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;
  const playback = useAmplifiedPlayback(stream, volume);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== playback.stream) {
      ref.current.srcObject = playback.stream;
    }
  }, [playback.stream]);
  useEffect(() => {
    if (ref.current && sinkId !== undefined) {
      void applySinkId(ref.current, sinkId);
    }
  }, [sinkId, playback.stream]);
  useEffect(() => {
    if (ref.current) {
      ref.current.volume = playback.elementVolume;
    }
  }, [playback.elementVolume, playback.stream]);
  useResumePlayback(ref, playback.stream);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function AudioSink({
  stream,
  sinkId,
  muted,
  volume,
}: {
  stream: MediaStream;
  sinkId?: string | null;
  /** Speakers off: the element stays wired so unmuting is instant. */
  muted?: boolean;
  /** This source's own level, 0 … 2 (audio-mix.ts). */
  volume?: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const playback = useAmplifiedPlayback(stream, volume);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== playback.stream) {
      ref.current.srcObject = playback.stream;
    }
  }, [playback.stream]);
  useEffect(() => {
    if (ref.current && sinkId !== undefined) {
      void applySinkId(ref.current, sinkId);
    }
  }, [sinkId, playback.stream]);
  useEffect(() => {
    if (ref.current) {
      ref.current.volume = playback.elementVolume;
    }
  }, [playback.elementVolume, playback.stream]);
  useResumePlayback(ref, playback.stream);
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
  level,
  cameraOn,
  stream,
  latencyMs,
  latencyTitle,
  style,
  sinkId,
  volume,
  onSelect,
  pinned,
  leaving,
}: {
  name: string;
  isSelf: boolean;
  micOff: boolean;
  /** This person's speakers are off: they are not hearing the room. */
  deafened: boolean;
  /** OUR speakers are off: this tile's audio is muted locally. */
  silenced?: boolean;
  speaking: boolean;
  /** This person's loudness right now (see useSpeaking): the avatar's mouth. */
  level?: () => number;
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
  /** How loudly this person is played here, 0 … 1 (audio-mix.ts). */
  volume?: number;
  /** Click puts this person on stage (spotlight); absent on the stage tile itself. */
  onSelect?: () => void;
  /** Kept on stage by the viewer's choice. */
  pinned?: boolean;
  /**
   * They have left the room and this is the last frame of them: the tile is
   * drawn for as long as it takes to fade (lib/motion.ts, useDeparting), so
   * a seat empties instead of blinking out from under the eye.
   */
  leaving?: boolean;
}) {
  const { t } = useI18n();
  const showVideo = cameraOn && stream !== null && hasLiveVideo(stream);
  // The mouth follows the voice. While this person is speaking and the
  // avatar is the face, a frame loop reads their loudness and writes it to
  // the drawing as --mouth (0 shut, 1 wide), which the mouth's transform
  // in CSS scales by. It goes straight to the element: sixty writes a
  // second are nothing to the DOM and far too many for a React state.
  // The level attacks at once and lets go slowly, so a syllable opens the
  // mouth and the gap after it closes it without a flicker.
  const avatarRef = useRef<SVGSVGElement>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  useEffect(() => {
    const avatar = avatarRef.current;
    if (!speaking || showVideo || !avatar) return;
    let frame = 0;
    let mouth = 0;
    const loop = () => {
      const raw = levelRef.current?.() ?? 0;
      mouth = raw > mouth ? raw : mouth * 0.82;
      avatar.style.setProperty('--mouth', mouth.toFixed(3));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      avatar.style.removeProperty('--mouth');
    };
  }, [speaking, showVideo]);
  return (
    <div
      className="tile"
      data-speaking={speaking ? 'true' : undefined}
      data-pinned={pinned ? 'true' : undefined}
      data-leaving={leaving ? 'true' : undefined}
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
          volume={isSelf ? undefined : volume}
        />
      ) : (
        <>
          <Avatar
            ref={avatarRef}
            name={name}
            className="tile-avatar"
            micOff={micOff}
            deafened={deafened}
          />
          {!isSelf && stream && (
            <AudioSink stream={stream} sinkId={sinkId} muted={silenced} volume={volume} />
          )}
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

/**
 * The stage, for somebody who is not taking part in the tool that is on.
 * It names what is playing right now — a standing refusal outlives the
 * source, and nobody should have to accept blind what they said no to
 * yesterday — and the way in is for this tool only, until it goes off.
 */
function DeclinedPlace({ tool, onJoin }: { tool: RegisteredTool; onJoin: () => void }) {
  const { t } = useI18n();
  const toolText = useToolText(tool);
  return (
    <div className="screen-stage stage-declined fade-in">
      <div className="declined-place">
        <tool.Icon />
        <h2>{t('participation.toolOffTitle')}</h2>
        <p>{t('participation.toolOffBody', { tool: toolText('name') })}</p>
        <button type="button" className="state-cta" onClick={onJoin}>
          {t('participation.toolJoinOnce', { tool: toolText('name') })}
        </button>
      </div>
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
  const { t, locale, setLocale } = useI18n();
  const session = useRoomSession(options);
  const { speaking, levelOf } = useSpeaking(session);
  // Per-source levels. Read here once and handed down, so a slider moved
  // in the mixer reaches the element that plays that source and nothing
  // else re-decides what it means.
  const mix = useAudioMix();
  const [mixerOpen, setMixerOpen] = useState(false);
  /*
   * What the echo guard subtracts from a screen capture: exactly the
   * streams this page's sinks are playing, at exactly the levels they are
   * playing them. Anything else and it would be modelling a machine that
   * never made that sound.
   *
   * High up here, above the waiting and ended screens, because those
   * return early — a hook after them runs on some renders and not others,
   * which React counts and refuses. It reads the session directly rather
   * than the screen list assembled further down for the same reason.
   *
   * No dependency list on purpose: the list is rebuilt every render
   * anyway, and the call is a no-op until somebody shares WITH sound.
   */
  useEffect(() => {
    const audible = session.speakerOn ? 1 : 0;
    const playing: PlayingSource[] = [];
    for (const peer of session.peers) {
      const voice = (session.mesh?.getPeerStreams(peer.id) ?? []).find(
        (stream) => !session.screenStreamIds.has(stream.id),
      );
      if (voice) {
        playing.push({
          key: mixKey('person', peer.id),
          stream: voice,
          volume: audible * mix.volumeOf(mixKey('person', peer.id)),
        });
      }
    }
    for (const share of session.screens) {
      if (share.id === session.selfId) {
        continue;
      }
      const stream = session.mesh
        ?.getPeerStreams(share.id)
        .find((one) => one.id === share.streamId && one.getAudioTracks().length > 0);
      if (stream) {
        playing.push({
          key: mixKey('screen', share.id),
          stream,
          volume: audible * mix.volumeOf(mixKey('screen', share.id)),
        });
      }
    }
    setPlayback(playing);
  });
  // Leaving the room leaves nothing playing behind it.
  useEffect(() => () => setPlayback([]), []);
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
  /** The search over what was said here; empty string = the row is open, filtering nothing. */
  const [search, setSearch] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Why the last attach went nowhere; cleared on the next attempt. */
  const [fileNote, setFileNote] = useState<string | null>(null);
  /**
   * What the last slash command had to say: why it would not run, or what
   * it did where nothing on screen would have shown it. Cleared by the
   * next keystroke, so it reads as an answer to what was just typed.
   */
  const [commandNote, setCommandNote] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * The telemetry strip opened by a tap. Hover already opens it, and hover is
   * the whole gesture on a mouse — this is the phone's way in, where there is
   * no pointer to rest anywhere.
   */
  const [hudOpen, setHudOpen] = useState(false);
  /** The tool shelf over the dock; what it opens is the room's, not ours. */
  const [toolsOpen, setToolsOpen] = useState(false);
  /**
   * A link the shelf was opened WITH: `/play` handed it something no tool
   * could play on sight, and the panel starts on it instead of on an
   * empty field. Cleared as the shelf closes, so pressing T is pressing T.
   */
  const [toolDraft, setToolDraft] = useState('');
  const [badgeAt, setBadgeAt] = useState<{ left: number; top: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  // Whether the reader is at the bottom of the chat. Reading up the history
  // and being yanked down by every new line is the oldest chat annoyance
  // there is: the list follows only while it was already at the end, and
  // otherwise says there is more below (see the jump pill).
  const atBottomRef = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
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
    if (!chatOpen) {
      // The panel unmounts with its scroll: the next opening starts at the end.
      atBottomRef.current = true;
      setNewBelow(false);
      return;
    }
    setUnread(0);
    // Our own message always lands in view: nobody sends a line and wants to
    // stay up in last week's history.
    const last = session.chat[session.chat.length - 1];
    if (atBottomRef.current || last?.from.id === session.selfId) {
      chatEndRef.current?.scrollIntoView({ block: 'end' });
      setNewBelow(false);
    } else {
      setNewBelow(true);
    }
  }, [session.chat, session.transfers, chatOpen, session.selfId]);

  const onMessagesScroll = useCallback(() => {
    const list = messagesRef.current;
    if (!list) {
      return;
    }
    const gap = list.scrollHeight - list.scrollTop - list.clientHeight;
    atBottomRef.current = gap < 48;
    if (atBottomRef.current) {
      setNewBelow(false);
    }
  }, []);

  const jumpToLatest = useCallback(() => {
    atBottomRef.current = true;
    setNewBelow(false);
    chatEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, []);

  // Closing hands the keyboard back to the key that opened it, so a screen
  // reader is not dropped on the page body with no idea where it is.
  const closeChat = useCallback(() => {
    setChatOpen(false);
    chatButton?.focus();
  }, [chatButton]);

  // The clock on each bubble, in the room's language.
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale],
  );
  // The date a saved conversation is filed under, written out in full: the
  // separators in the panel say "Today", and a file read next month cannot.
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
    [locale],
  );
  const roomTitle = room.displayName || t('room.unnamed');

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

  const terms = useMemo(() => queryTerms(search ?? ''), [search]);

  /**
   * What the list actually draws: the timeline, filtered by the search, with
   * the day written in wherever it turns over. The separator is computed on
   * the filtered list on purpose — a search that leaves two lines from two
   * different weeks has to say so, or they read as one conversation.
   */
  const shown = useMemo(() => {
    const now = Date.now();
    const kept = timeline.filter((entry) =>
      terms.length === 0
        ? true
        : entry.kind === 'text'
          ? matches(
              [entry.message.text, entry.message.from.name, entry.message.quote?.text ?? ''],
              terms,
            )
          : matches(
              entry.transfers.map((transfer) => transfer.name),
              terms,
            ),
    );
    let day = '';
    return kept.map((entry) => {
      const key = dayKey(entry.ts);
      const opensDay = key !== day;
      day = key;
      return { entry, day: opensDay ? dayLabel(entry.ts, now, locale) : null };
    });
  }, [timeline, terms, locale]);

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

  /**
   * Saves the conversation as a markdown file. Everything is read from what
   * this browser is already holding — the room's chat never lived anywhere
   * else — and the whole timeline goes in, not the search's results: someone
   * saving a conversation wants the conversation.
   */
  function saveTranscript(): void {
    const lines: TranscriptLine[] = timeline.map((entry) =>
      entry.kind === 'text'
        ? {
            ts: entry.ts,
            author: entry.message.from.name,
            text: entry.message.text,
            quote: entry.message.quote ?? null,
            unreadable: entry.message.unreadable,
          }
        : {
            ts: entry.ts,
            author:
              entry.transfers[0]!.direction === 'out'
                ? t('room.you')
                : peerName(entry.transfers[0]!.peerId),
            files: [...new Set(entry.transfers.map((transfer) => transfer.name))],
          },
    );
    const savedAt = Date.now();
    downloadText(
      transcriptFilename(roomTitle, savedAt),
      buildTranscript({
        lines,
        room: roomTitle,
        savedAt,
        labels: {
          title: t('chat.transcript.title'),
          savedAt: t('chat.transcript.savedAt'),
          file: t('chat.transcript.file'),
          locked: t('chat.locked'),
          replyTo: t('chat.transcript.replyTo'),
        },
        formatDay: (at) => dayFormat.format(at),
        formatTime: (at) => timeFormat.format(at),
      }),
      'text/markdown',
    );
  }

  function sendFiles(files: File[], overflow = false): void {
    setFileNote(overflow ? t('file.pastedText') : null);
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

  // The header and the dock float over the stage, which reserves room for
  // them through --header-clear and --dock-clear. The stylesheet guesses
  // one row each; on a phone the keys wrap to two and the telemetry drops
  // under the title, and the guess left the composer hidden behind the
  // dock. Measured instead, on the room's own box, so the reservation is
  // whatever they actually take — notch and home bar included.
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const header = headerRef.current;
    const footer = footerRef.current;
    if (!layout || !header || !footer) {
      return;
    }
    const measure = () => {
      const box = layout.getBoundingClientRect();
      const headerBottom = header.getBoundingClientRect().bottom - box.top;
      const dockTop = box.bottom - footer.getBoundingClientRect().top;
      layout.style.setProperty('--header-clear', `${Math.ceil(headerBottom)}px`);
      layout.style.setProperty('--dock-clear', `calc(${Math.ceil(dockTop)}px + var(--room-pad))`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(footer);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [status.kind]);

  // A tool taking the stage clears whatever this viewer had pinned: the
  // pin was a choice made when the tool was not there yet, and keeping it
  // would leave one person staring at a tile while the room watches
  // something else — with nothing on screen to say why.
  // Us, as a tool sees us: the roster's shape, so a tool can name people
  // without learning the room hook.
  const selfPeer = session.selfId ? { id: session.selfId, name: options.name } : null;
  const liveTool = stagedToolOf(session.tools);
  /**
   * What this viewer said about the tool that is on, if they said
   * anything: closed it here without touching it for the room, or came
   * in past a standing refusal. It names the tool because the room can
   * change what is playing underneath it — nobody should have to accept
   * blind what they said no to yesterday, and nobody should be dropped
   * out of something they had joined (participation.ts).
   */
  const [toolChoice, setToolChoice] = useState<ToolChoice | null>(null);
  const liveToolId = liveTool?.tool.id ?? null;
  const toolChosen = toolDecision(toolChoice, liveToolId);
  const toolRefused =
    liveTool !== null && !takesPartInTool(session.participation, toolChoice, liveToolId);
  // The refusal is this viewer's: the tool stays on for the room, and the
  // shelf key keeps its light (hasLiveTool, below, sees the whole room) so
  // the way back in is where it always is.
  const stagedTool = toolRefused ? null : liveTool;
  const stagedToolId = stagedTool?.tool.id ?? null;
  /**
   * Somebody else's live, and whether this viewer is in it — what the
   * shelf turns into a key that steps out of it and back in.
   *
   * The way OUT is not offered for the one this client is driving.
   * Whoever holds the room's remote has "close it for everyone" instead,
   * and a Watch Together whose controller walked off the stage would
   * leave the room with a queue nobody advances — a refusal that costs
   * the room something is not the refusal this is (participation.ts).
   *
   * The way BACK is offered to anybody standing outside, whoever last
   * touched the state: a door that locks from the far side is the one
   * thing this must never become.
   */
  const toolPart =
    liveTool && (toolRefused || !liveTool.room.mine)
      ? { tool: liveTool.tool.id, joined: !toolRefused }
      : null;
  useEffect(() => {
    if (toolChoice !== null && !session.tools.has(toolChoice.tool)) {
      setToolChoice(null);
    }
  }, [session.tools, toolChoice]);
  useEffect(() => {
    if (stagedToolId) {
      setPinned(null);
    }
  }, [stagedToolId]);

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
        case 't':
          // The shelf takes the keyboard as it opens (its field is the
          // only thing to type into), so the key must not be typed into it.
          event.preventDefault();
          setToolsOpen((open) => !open);
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
  // A refused screen is not drawn — and its bytes were already turned away
  // at the source (participation.ts). Our own capture is not a screen we
  // receive, so sharing keeps working while refusing.
  const shownScreens = session.participation.screens
    ? session.screens
    : session.screens.filter((share) => share.id === session.selfId);
  const screenItems: ScreenItem[] = shownScreens.map((share) => ({
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
  // A tool owns the stage while it is on: of everything in here, it is
  // the one thing somebody deliberately put on for everyone. A pin is
  // what overrules it — "I want to look at that instead" — and it is
  // turned off for the room from the shelf or the tool's own key.
  const watchOnStage = stagedTool !== null && pinnedLive === null;
  // A pinned screen whose stream has not arrived yet leaves the stage empty until it has.
  const stageScreen =
    watchOnStage || layout === 'grid'
      ? null
      : pinnedLive
        ? (pinnedScreen?.stream ? pinnedScreen : null)
        : followedScreen;
  const stagePersonId =
    watchOnStage || layout === 'grid'
      ? null
      : pinnedLive?.kind === 'person'
        ? pinnedLive.id
        : pinnedLive?.kind === 'screen' || followedScreen
          ? null
          : followedPerson;
  const stageStream = stageScreen?.stream ?? null;
  /**
   * The place that says why the stage is not showing the tool. It only
   * appears when nothing else wants the stage: a screen or a pin is real
   * content this person did not refuse, and covering it would be worse
   * than the silence it explains.
   *
   * And only for a refusal nobody made just now. A standing switch needs
   * explaining — it was set some other day, about some other thing —
   * while somebody who closed this live a moment ago knows exactly where
   * it went, and asked for the room back rather than for a notice in its
   * place. The way in for them is the key in the shelf that closed it.
   */
  const toolDeclined =
    toolRefused && toolChosen === null && layout !== 'grid' && stageScreen === null && !pinnedLive;
  const onStage = watchOnStage || stageScreen !== null || stagePersonId !== null;

  // The hook's stats and stall watch follow whatever screen is on stage.
  const watchedId = stageScreen?.share.id ?? null;
  const watchScreen = session.watchScreen;
  useEffect(() => {
    watchScreen(watchedId);
  }, [watchScreen, watchedId]);

  const pip = usePictureInPicture(screenVideoRef, stageStream);

  // Tiles in the strip and the grid: screens first (rendered before this
  // list), then faces with the camera on, then the rest; ourselves first
  // within each group. Whoever has just left is still in the row, marked
  // `leaving`, until their tile has finished fading — only the tiles are
  // told; the seat counter and the mesh already know they are gone.
  type Person = { id: string; name: string; self?: boolean; leaving?: boolean };
  const peersOnScreen = useDeparting(session.peers, MOTION.pop);
  const people: Person[] = [
    { id: session.selfId ?? 'self', name: options.name, self: true },
    ...peersOnScreen,
  ].sort((a, b) => Number(cameraOn(b.id)) - Number(cameraOn(a.id)));

  const participantCount = session.peers.length + 1;
  /**
   * The names the chat knows: everyone seated, ourselves included. They
   * are what an `@` completes in the composer and what turns into a face
   * in a message (lib/mentions.ts) — a mention is only a mention when the
   * room actually has somebody by that name.
   */
  const chatPeople = [options.name, ...session.peers.map((peer) => peer.name)];

  // Only real faces get grid area. Ghost seat tiles were tried and retired:
  // sizing the grid by all 12 seats shrank one person to a twelfth of the
  // screen in an empty room. Capacity lives in the header's seat counter.
  // With something on stage the tiles collapse to the strip; in the grid
  // layout the screens take tiles of their own.
  const grid = useTileGrid(
    onStage ? 0 : people.length + (layout === 'grid' ? screenItems.length : 0),
  );
  // Every tile that moves because another one arrived or went is put back
  // where it was and let go (lib/motion.ts): the row slides, it never cuts.
  const flipTiles = useFlip<HTMLDivElement>();
  // The chat, the shelf, the settings and the unread badge all close by
  // being taken out of the page. Each is kept for the length of its own way
  // out, marked `data-leaving`, which is what the stylesheet animates.
  const chatPresence = usePresence(chatOpen, MOTION.panel);
  const toolsPresence = usePresence(toolsOpen, MOTION.quick);
  const mixerPresence = usePresence(mixerOpen, MOTION.quick);
  const settingsPresence = usePresence(settingsOpen, MOTION.panel);
  const jumpPresence = usePresence(newBelow, MOTION.quick);
  const badgeOn = !chatOpen && unread > 0 && badgeAt !== null;
  const badgePresence = usePresence(badgeOn, MOTION.quick);
  // What the badge says on its way out: `unread` is already zero by then,
  // and a badge that shrinks away showing "0" is worse than none.
  const badgeShown = useRef<{ count: number; at: { left: number; top: number } } | null>(null);
  if (badgeOn && badgeAt) {
    badgeShown.current = { count: unread, at: badgeAt };
  }
  const tilesRef = useCallback(
    (el: HTMLDivElement | null) => {
      grid.ref(el);
      flipTiles(el);
    },
    [grid.ref, flipTiles],
  );

  if (status.kind === 'ended' && status.reason !== 'left') {
    const message =
      status.reason === 'room_full'
        ? t('room.endedFull')
        : status.reason === 'room_not_found'
          ? t('room.endedNotFound')
          : t('room.endedClosed');
    // A room that dropped is the one dead end you can walk back out of: the
    // link still works, so the lit button reloads it and the way home is the
    // line of text under it. A full or vanished room has nothing to retry.
    const dropped = status.reason !== 'room_full' && status.reason !== 'room_not_found';
    return (
      <main className="state">
        {/* The same mesh, mark and button as the other two dead ends of the
            way in (pages/state.css) — an ended call is one more of them. */}
        <MeshBackground />
        <div className="state-center">
          <Brand className="home-logo" size={44} name={false} />
          <h1>{t('room.leftTitle')}</h1>
          <p>{message}</p>
          {dropped ? (
            <button
              type="button"
              className="state-cta"
              onClick={() => window.location.reload()}
            >
              {t('room.endedRetry')}
            </button>
          ) : (
            <Link to="/" className="state-cta">
              {t('prejoin.createNew')}
            </Link>
          )}
          {dropped ? (
            <Link to="/" className="state-back">
              {t('prejoin.backHome')}
            </Link>
          ) : null}
        </div>
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
        {/* What is coming in with you, still saying what it said on the
            doorstep and in the same two pills, so each one has its own key
            in the dock to fly to. Decoration only: the choice was made on
            the doorstep, and the real controls are a moment away. */}
        <div className="room-waiting-devices" aria-hidden="true">
          <span className={`room-waiting-device ${options.micEnabled ? 'on' : ''}`} data-device="mic">
            {options.micEnabled ? <MicIcon /> : <MicOffIcon />}
            <span>{t('prejoin.mic')}</span>
          </span>
          <span className={`room-waiting-device ${options.camEnabled ? 'on' : ''}`} data-device="cam">
            {options.camEnabled ? <CamIcon /> : <CamOffIcon />}
            <span>{t('prejoin.cam')}</span>
          </span>
        </div>
        <div className="spinner" aria-hidden />
        <p role="status">{t('room.connecting')}</p>
      </main>
    );
  }

  const iAmSharing = session.screens.some((share) => share.id === session.selfId);
  /** Every screen slot taken by others: the button waits for one to free up. */
  const screensFull = !iAmSharing && session.screens.length >= MAX_SCREENS;
  // Phones cannot share a screen (no getDisplayMedia on iOS Safari or on
  // Android Chrome): a key that can only fail is a key that should not be
  // there. Feature-detected, not width-detected — a small window on a
  // laptop still can.
  const canShareScreen =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const micLabel = session.micOn ? t('controls.muteMic') : t('controls.unmuteMic');
  const speakerLabel = session.speakerOn ? t('controls.muteSpeaker') : t('controls.unmuteSpeaker');
  const camLabel = session.cameraSlotsFull
    ? t('room.camSlotsFull')
    : session.camOn
      ? t('controls.camOff')
      : t('controls.camOn');
  const screenLabel = screensFull
    ? t('controls.screensFull')
    : iAmSharing
      ? t('controls.stopSharing')
      : t('controls.shareScreen');
  const chatLabel = chatOpen ? t('controls.closeChat') : t('controls.openChat');

  /**
   * A line typed in the chat, done.
   *
   * Everything below is a second door onto a key that is already in the
   * dock, the shelf or the chat's own header, which is the deal slash
   * commands were built on: the reader (lib/chat-commands.ts) decides what
   * a line MEANS with no room around it, and this decides nothing at all —
   * it just does what the plan says with the room it happens to have.
   *
   * A line that could not run keeps the field: a refused command is
   * usually a half-typed one, and clearing it would cost the retype.
   */
  function runLine(text: string): void {
    setCommandNote(null);
    const line = readLine(text);
    if (line.kind === 'unknown') {
      setCommandNote(t('cmd.unknown', { name: line.name }));
      return;
    }
    if (line.kind === 'message') {
      send(line.text);
      return;
    }
    const { plan } = line;
    switch (plan.kind) {
      case 'message':
        send(plan.text);
        return;
      case 'toggle':
        if (plan.what === 'mic') {
          session.toggleMic();
        } else if (plan.what === 'sound') {
          session.toggleSpeaker();
        } else if (plan.what === 'cam') {
          // The dock's key is disabled when the seats are full; here the
          // line has to say so, since there is no greyed-out key to see.
          if (session.cameraSlotsFull) {
            setCommandNote(t('room.camSlotsFull'));
            return;
          }
          session.toggleCam();
        } else if (iAmSharing) {
          session.stopScreenShare();
        } else if (!canShareScreen) {
          setCommandNote(t('cmd.noScreen'));
          return;
        } else if (screensFull) {
          setCommandNote(t('controls.screensFull'));
          return;
        } else {
          void session.startScreenShare();
        }
        break;
      case 'play':
      case 'queue': {
        // The app holds the text and the tools hold the knowledge: the
        // shelf is asked, in its own order, and the first tool that makes
        // something of the link answers (tools/registry.ts).
        const asked = askTools(session.tools, { kind: plan.kind, input: plan.link });
        if (!asked) {
          // Nobody could play it on sight, which for a PAGE is the honest
          // answer rather than a failure: reading it is a round trip, and
          // what comes back is a choice. The shelf opens holding the link.
          setToolDraft(plan.link);
          setToolsOpen(true);
          setCommandNote(t('cmd.toShelf'));
          break;
        }
        if ('refused' in asked.answer) {
          // The tool's own words, out of the tool's own catalog.
          setCommandNote(toolText(asked.tool, locale)(asked.answer.refused));
          return;
        }
        session.setToolState(asked.tool.id, asked.answer.next);
        break;
      }
      case 'skip': {
        const asked = askTools(session.tools, { kind: 'skip' });
        if (!asked) {
          setCommandNote(t('cmd.nothingOn'));
          return;
        }
        if ('refused' in asked.answer) {
          setCommandNote(toolText(asked.tool, locale)(asked.answer.refused));
          return;
        }
        session.setToolState(asked.tool.id, asked.answer.next);
        break;
      }
      case 'shelf':
        setToolDraft(plan.draft);
        setToolsOpen(true);
        break;
      case 'stop': {
        // Whatever the room has on the stage, off — the same thing the
        // tool's own panel does, from a keyboard that is already typing.
        const staged = stagedToolOf(session.tools);
        if (!staged) {
          setCommandNote(t('cmd.nothingOn'));
          return;
        }
        session.setToolState(staged.tool.id, null);
        break;
      }
      case 'invite': {
        // Nothing on screen changes, so this one says what it did.
        const invitation = compactInviteUrl(window.location.href);
        void copyText(invitation).then((copied) =>
          setCommandNote(
            copied
              ? t('invite.copied')
              : `${t('invite.manualCopy')} ${invitation}`,
          ),
        );
        break;
      }
      case 'attach':
        fileInputRef.current?.click();
        break;
      case 'save':
        if (timeline.length === 0) {
          setCommandNote(t('cmd.nothingYet'));
          return;
        }
        saveTranscript();
        break;
      case 'search':
        setSearch(plan.text);
        break;
      case 'lang':
        setLocale(plan.locale);
        break;
      case 'leave':
        session.leave();
        break;
      case 'refused':
        setCommandNote(
          plan.why === 'usage'
            ? t('cmd.usage', { usage: usageOf(line.command, t) })
            : t('cmd.noLang', { codes: localeCodes() }),
        );
        return;
    }
    // It ran: the field is clear for the next thing, and a reply that was
    // pending is still pending — a command is not an answer to anybody.
    setDraft('');
  }

  /** A message, and the reply it was an answer to, both let go of. */
  function send(text: string): void {
    if (!text) {
      return;
    }
    session.sendChat(text, replyTo);
    setDraft('');
    setReplyTo(null);
  }
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
  /**
   * The strip carries two kinds of reading. The few that answer "is the call
   * all right" stay on screen; the rest — the ones you go looking for once
   * the answer is no — wait behind a hover, so a room at rest shows three
   * numbers instead of nine.
   */
  const hudMetrics: { label: string; value: string; detail?: boolean }[] = [];
  const rtts = [...session.peerLatency.values()]
    .map((latency) => latency.rttMs)
    .filter((rtt): rtt is number => rtt !== null);
  if (rtts.length > 0) {
    // The worst pair: one number that still points at whoever the call drags for.
    hudMetrics.push({ label: 'rtt', value: `${Math.max(...rtts)} ms` });
  }
  // Our own reading has no peer to measure against (middleOf, above).
  const selfRttMs = middleOf(rtts);
  /**
   * How this person's own network is holding up, said where the numbers
   * live instead of in a banner over the room: the share of what was sent
   * to us that never arrived, middled across the links we hold. It stays
   * on screen at 0% — a reading you can go and check is the point, and one
   * that only appears when things are bad is the interruption we removed.
   */
  const selfLoss = middleOf(
    [...session.peerLatency.values()]
      .map((latency) => latency.lossRate)
      .filter((rate): rate is number => rate !== null),
  );
  if (selfLoss !== null) {
    hudMetrics.push({ label: 'loss', value: formatLoss(selfLoss) });
  }
  const links = [...session.peerLatency.values()];
  if (links.length > 0) {
    // How many of the links we hold are actually up: a mesh is one connection
    // per person, and a peer stuck connecting is the room's real problem long
    // before any of the numbers below start looking wrong.
    const up = links.filter((latency) => latency.state === 'connected').length;
    hudMetrics.push({ label: 'links', value: `${up}/${links.length}`, detail: true });
  }
  // The wobble in the voice arriving, and what the buffer is holding back to
  // hide it. RTT can sit still while these two go up, and that is the pair
  // that explains a call that sounds late without ever sounding slow.
  const selfJitter = middleOf(present(links.map((latency) => latency.jitterMs)));
  if (selfJitter !== null) {
    hudMetrics.push({ label: 'jitter', value: `${selfJitter} ms`, detail: true });
  }
  const selfBuffer = middleOf(present(links.map((latency) => latency.jitterBufferMs)));
  if (selfBuffer !== null) {
    hudMetrics.push({ label: 'jbuf', value: `${selfBuffer} ms`, detail: true });
  }
  // The dearest path any link is on: one relayed peer is the thing worth
  // knowing, so the worst rung wins rather than the commonest.
  const worstPath = (['turn', 'stun', 'host'] as const).find((path) =>
    links.some((latency) => latency.path === path),
  );
  if (worstPath) {
    hudMetrics.push({ label: 'path', value: worstPath, detail: true });
  }
  const codecs = [...new Set(present(links.map((latency) => latency.codec)))];
  if (codecs.length > 0) {
    hudMetrics.push({ label: 'codec', value: codecs.join('/'), detail: true });
  }
  const hudStats = session.screenStats;
  if (hudStats?.kbps != null) {
    hudMetrics.push({
      label: hudStats.direction === 'sending' ? '↑' : '↓',
      value: formatBitrate(hudStats.kbps),
    });
  }
  if (hudStats?.fps != null) {
    hudMetrics.push({ label: 'fps', value: `${Math.round(hudStats.fps)}`, detail: true });
  }
  if (hudStats?.width != null && hudStats?.height != null) {
    hudMetrics.push({ label: 'res', value: `${hudStats.width}×${hudStats.height}`, detail: true });
  }
  // How much of the room the echo guard is taking back out of our own
  // capture. Absent until it is actually doing something — a capture we
  // are not in has no reading worth a slot in the bar, and neither does
  // the second and a half before it has found us.
  const guard = session.screenAudioGuard;
  if (guard?.active && guard.erleDb >= 1) {
    hudMetrics.push({ label: 'echo', value: `−${Math.round(guard.erleDb)} dB`, detail: true });
  }
  // Relaying ourselves: the forwarding mode; fed through a relay: its name.
  const hudRelay = stageScreen ? (hudStats?.relayMode ?? relayName) : null;
  if (hudRelay) {
    hudMetrics.push({ label: 'relay', value: hudRelay, detail: true });
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

  // The mixer's rows, for the two kinds it cannot work out for itself.
  // A screen only earns a knob once it is actually carrying sound, and a
  // tool only once the room has it going.
  const audibleScreens = screenAudioStreams.map(({ id }) => ({
    id,
    name: session.peers.find((peer) => peer.id === id)?.name ?? t('room.unnamed'),
  }));
  const liveTools = TOOLS.filter((tool) => {
    const room = session.tools.get(tool.id);
    return room !== undefined && tool.parseState(room.state) !== null;
  });

  const tileStyle = !onStage && grid.size ? { width: grid.size.width, height: grid.size.height } : undefined;
  const selfPinned = pinnedLive?.kind === 'person' && pinnedLive.id === session.selfId;
  const selfTile = (onSelect: (() => void) | undefined, pinnedTile: boolean) => (
    <Tile
      key="self"
      name={options.name}
      isSelf
      micOff={!session.micOn}
      deafened={!session.speakerOn}
      speaking={session.selfId !== null && speaking.has(session.selfId)}
      level={() => (session.selfId === null ? 0 : levelOf(session.selfId))}
      cameraOn={session.camOn}
      stream={session.localMedia && session.camOn ? session.localMedia : null}
      latencyMs={selfRttMs}
      latencyTitle={t('latency.self')}
      style={onSelect ? tileStyle : undefined}
      onSelect={onSelect}
      pinned={pinnedTile}
    />
  );
  const peerTile = (
    peer: { id: string; name: string; leaving?: boolean },
    onSelect: (() => void) | undefined,
    pinnedTile: boolean,
  ) => {
    const link = session.peerLatency.get(peer.id) ?? null;
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
        level={() => levelOf(peer.id)}
        cameraOn={session.cameras.has(peer.id)}
        stream={cameraStream}
        latencyMs={link?.rttMs ?? null}
        latencyTitle={linkDetail(t('latency.peer', { name: peer.name }), link)}
        style={onSelect ? tileStyle : undefined}
        sinkId={session.audioDevices.speakerId}
        volume={mix.volumeOf(mixKey('person', peer.id))}
        onSelect={onSelect}
        pinned={pinnedTile}
        leaving={peer.leaving}
      />
    );
  };

  return (
    <div className="room-layout" ref={layoutRef}>
      {screenAudioStreams.map(({ id, stream }) => (
        <AudioSink
          key={id}
          stream={stream}
          sinkId={session.audioDevices.speakerId}
          muted={!session.speakerOn}
          volume={mix.volumeOf(mixKey('screen', id))}
        />
      ))}
      <header className="room-header" ref={headerRef}>
        <div className="room-title">
          <Logo size={22} className="room-logo" />
          <h1>{room.displayName || t('room.unnamed')}</h1>
          <span
            className="seat-count"
            aria-label={t('room.seatsAria', { count: participantCount, max: MAX_PARTICIPANTS })}
          >
            {t('room.seats', { count: participantCount, max: MAX_PARTICIPANTS })}
          </span>
        </div>
        {hudMetrics.length > 0 && (
          /* Focus opens it too: the keyboard's hover. Every reading stays in
             the DOM either way, so nothing is hidden from a screen reader. */
          <div
            className="hud-bar"
            role="group"
            tabIndex={0}
            aria-label={t('hud.aria')}
            data-open={hudOpen ? 'true' : undefined}
            onClick={() => setHudOpen((open) => !open)}
          >
            {hudMetrics.map((metric) => (
              <span
                key={metric.label}
                className={metric.detail ? 'hud-metric hud-detail' : 'hud-metric'}
              >
                <span className="hud-reading">
                  <b>{metric.label}</b>
                  <i>{metric.value}</i>
                </span>
              </span>
            ))}
          </div>
        )}
      </header>

      {/* The stage is the page's main content: a landmark to jump to. */}
      <main className="room-body">
        <div className="stage-area">
          {watchOnStage && stagedTool && (
            <ToolStage
              tool={stagedTool.tool}
              room={stagedTool.room}
              self={selfPeer}
              peers={session.peers}
              speakerOn={session.speakerOn}
              speakerLevel={mix.volumeOf(mixKey('tool', stagedTool.tool.id))}
              onSetState={(state) => session.setToolState(stagedTool.tool.id, state)}
            />
          )}
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
          {toolDeclined && liveTool && (
            <DeclinedPlace
              tool={liveTool.tool}
              onJoin={() => setToolChoice({ tool: liveTool.tool.id, join: true })}
            />
          )}
          {stagePersonId !== null && !toolDeclined && (
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
          <div className={onStage ? 'tiles tiles-strip' : 'tiles tiles-grid'} ref={tilesRef}>
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

        {chatPresence.mounted && (
          <aside
            className="chat-panel"
            data-leaving={chatPresence.leaving ? 'true' : undefined}
            aria-label={t('chat.title')}
            onKeyDown={(event) => {
              // Escape shuts the panel; the composer swallows it first when a
              // reply is pending, so one press cancels the reply and the next closes.
              if (event.key === 'Escape') {
                event.preventDefault();
                closeChat();
              }
            }}
          >
            <header className="chat-header">
              <h2>{t('chat.title')}</h2>
              <div className="chat-header-tools">
                <button
                  type="button"
                  className={`chat-close ${search !== null ? 'chat-tool-on' : ''}`}
                  aria-label={t('chat.search')}
                  aria-pressed={search !== null}
                  title={t('chat.search')}
                  onClick={() => setSearch((current) => (current === null ? '' : null))}
                >
                  <SearchIcon />
                </button>
                {timeline.length > 0 && (
                  <button
                    type="button"
                    className="chat-close"
                    aria-label={t('chat.save')}
                    title={`${t('chat.save')} · ${t('chat.saveNote')}`}
                    onClick={saveTranscript}
                  >
                    <TranscriptIcon />
                  </button>
                )}
                <button
                  type="button"
                  className="chat-close"
                  aria-label={t('controls.closeChat')}
                  onClick={closeChat}
                >
                  <CloseIcon />
                </button>
              </div>
            </header>
            {search !== null && (
              <ChatSearch
                value={search}
                hits={shown.length}
                onChange={setSearch}
                onClose={() => setSearch(null)}
              />
            )}
            {/* A log: what arrives is read out as it comes, without
                stealing the focus from wherever the reader is. */}
            <div
              className="chat-messages"
              role="log"
              aria-label={t('chat.title')}
              ref={messagesRef}
              onScroll={onMessagesScroll}
            >
              {session.chat.length === 0 && session.transfers.length === 0 && (
                <p className="chat-empty">{t('chat.empty')}</p>
              )}
              {terms.length > 0 && shown.length === 0 && (
                <p className="chat-empty">{t('chat.searchNone')}</p>
              )}
              {shown.map(({ entry, day }) => {
                // The day heading and the bubble are siblings in the list, so
                // the flex column keeps spacing them the same way.
                const separator = day && (
                  <p className="chat-day" key={`day-${entry.key}`}>
                    <span>{day}</span>
                  </p>
                );
                if (entry.kind === 'file') {
                  return (
                    <Fragment key={entry.key}>
                      {separator}
                      <FileTransferBubble
                        transfers={entry.transfers}
                        peerName={peerName}
                        onAccept={session.acceptTransfer}
                        onDecline={session.declineTransfer}
                        onCancel={session.cancelTransfer}
                        onDismiss={session.dismissTransfer}
                      />
                    </Fragment>
                  );
                }
                const { message } = entry;
                const mine = message.from.id === session.selfId;
                // Somebody said our name: the bubble keeps a rail so it is
                // findable while scrolling past, and says so in a word for
                // anyone who is listening rather than looking.
                const namesMe = !mine && !message.unreadable && mentionsAnyOf(message.text, [options.name]);
                return (
                  <Fragment key={entry.key}>
                    {separator}
                    <div
                      className={`chat-bubble ${mine ? 'mine' : ''} ${namesMe ? 'mentions-me' : ''}`}
                    >
                      {namesMe && <span className="visually-hidden">{t('chat.mentionsYou')}</span>}
                      {mine ? (
                        // Said by the colour of the bubble to the eye; said in a word here.
                        <span className="visually-hidden">{t('room.you')}</span>
                      ) : (
                        <span className="chat-author">{message.from.name}</span>
                      )}
                      {message.quote && (
                        <blockquote className="chat-quote">
                          <span className="chat-quote-name">{message.quote.name}</span>
                          <span className="chat-quote-text">{message.quote.text}</span>
                        </blockquote>
                      )}
                      {message.unreadable ? (
                        <p className="chat-locked">{t('chat.locked')}</p>
                      ) : terms.length > 0 ? (
                        <p className="chat-md chat-plain">
                          <Highlight text={message.text} terms={terms} />
                        </p>
                      ) : (
                        <div className="chat-md">
                          {renderMarkdown(
                            message.text,
                            { copy: t('chat.copyCode'), copied: t('chat.copied') },
                            { names: chatPeople, self: options.name },
                          )}
                        </div>
                      )}
                      <time className="chat-time" dateTime={new Date(message.ts).toISOString()}>
                        {timeFormat.format(message.ts)}
                      </time>
                      {!message.unreadable && (
                        <div className="chat-actions">
                          <CopyButton
                            text={message.text}
                            label={t('chat.copy')}
                            doneLabel={t('chat.copied')}
                            className="chat-action"
                          />
                          <button
                            type="button"
                            className="chat-action"
                            aria-label={t('chat.reply')}
                            title={t('chat.reply')}
                            onClick={() =>
                              setReplyTo({ name: message.from.name, text: excerptOf(message.text) })
                            }
                          >
                            <ReplyIcon />
                          </button>
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })}
              <div ref={chatEndRef} />
              {jumpPresence.mounted && (
                <button
                  type="button"
                  className="chat-jump"
                  data-leaving={jumpPresence.leaving ? 'true' : undefined}
                  onClick={jumpToLatest}
                >
                  {t('chat.jumpToLatest')}
                  <span aria-hidden="true">↓</span>
                </button>
              )}
            </div>
            {fileNote && (
              <p className="chat-file-note" role="status">
                {fileNote}
              </p>
            )}
            {commandNote && (
              <p className="chat-file-note" role="status">
                {commandNote}
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
              people={chatPeople}
              onChange={(text) => {
                setCommandNote(null);
                setDraft(text);
              }}
              // A command picked out of the menu arrives as its own text:
              // the field never held it (ChatComposer.tsx).
              onSend={(picked) => runLine(picked ?? draft)}
              onAttach={() => fileInputRef.current?.click()}
              onPasteFiles={(files, overflow) => sendFiles(files, overflow)}
              onCancelQuote={() => setReplyTo(null)}
            />
          </aside>
        )}
      </main>

      <footer className="room-footer" ref={footerRef} aria-label={t('controls.dock')}>
        {/* The room's server went away; the mesh did not. Said here
            because the room otherwise looks perfectly normal while
            nothing it sends is reaching anyone. */}
        {session.reconnecting && (
          <p className="reconnecting-note" role="status">
            {t('room.reconnecting')}
          </p>
        )}
        {session.camDenied && (
          <p className="cam-denied-note" role="status">
            {t('room.camDenied')}
          </p>
        )}
        {badgePresence.mounted && badgeShown.current && (
          <ChatUnreadBadge
            count={badgeShown.current.count}
            at={badgeShown.current.at}
            leaving={badgePresence.leaving}
          />
        )}
        {/* The badge is decoration; this is what a screen reader hears when
            a message lands while the panel is shut. */}
        <span className="visually-hidden" role="status">
          {!chatOpen && unread > 0 ? `${unread} ${t('chat.unread', { count: unread })}` : ''}
        </span>
        {toolsPresence.mounted && (
          <ToolsMenu
            leaving={toolsPresence.leaving}
            tools={session.tools}
            denied={session.toolDenied}
            self={selfPeer}
            peers={session.peers}
            speakerOn={session.speakerOn}
            speakerLevel={(toolId) => mix.volumeOf(mixKey('tool', toolId))}
            part={toolPart}
            onPart={(joined) => {
              if (toolPart) {
                setToolChoice({ tool: toolPart.tool, join: joined });
              }
            }}
            draft={toolDraft}
            onSetState={session.setToolState}
            onDismiss={() => {
              setToolsOpen(false);
              setToolDraft('');
            }}
          />
        )}
        {mixerPresence.mounted && (
          <MixerMenu
            leaving={mixerPresence.leaving}
            peers={session.peers}
            screens={audibleScreens}
            tools={liveTools}
            speakerOn={session.speakerOn}
            onDismiss={() => setMixerOpen(false)}
          />
        )}
        {settingsPresence.mounted && (
          <SettingsMenu
            leaving={settingsPresence.leaving}
            screenQuality={session.screenQuality}
            onScreenQuality={session.setScreenQuality}
            settings={session.mediaSettings}
            onSettings={session.updateMediaSettings}
            participation={session.participation}
            onParticipation={session.updateParticipation}
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
          <span className="dock-sep" aria-hidden="true" />
          <button
            type="button"
            className={`control ${session.micOn ? '' : 'control-off'}`}
            aria-pressed={!session.micOn}
            aria-label={micLabel}
            aria-keyshortcuts="m"
            data-key="M"
            // Where the doorstep's mic pill lands (web/src/hero.css).
            data-device="mic"
            // The tooltip is where the shortcut is taught: the name stays
            // clean for whoever hears it instead of reading it.
            title={`${micLabel} · M`}
            onClick={session.toggleMic}
          >
            {session.micOn ? <MicIcon /> : <MicOffIcon />}
          </button>
          <button
            type="button"
            className={`control ${session.speakerOn ? '' : 'control-off'}`}
            aria-pressed={!session.speakerOn}
            aria-label={speakerLabel}
            aria-keyshortcuts="d"
            data-key="D"
            title={`${speakerLabel} · D`}
            onClick={session.toggleSpeaker}
          >
            {session.speakerOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </button>
          {/* Beside the speaker key, because it answers the question that
              key cannot: not "do I want to hear this room" but "do I want
              this much of THAT". */}
          <button
            type="button"
            className={`control ${mixerOpen ? 'control-active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={mixerOpen}
            aria-label={t('controls.mixer')}
            title={t('controls.mixer')}
            onClick={() => setMixerOpen((open) => !open)}
          >
            <FadersIcon />
          </button>
          {/* The "no slot" state is its own thing, not the off style: it is
              styled via [data-camera-slots="full"]. */}
          <button
            type="button"
            className={`control ${session.camOn || session.cameraSlotsFull ? '' : 'control-off'}`}
            aria-pressed={!session.camOn}
            disabled={session.cameraSlotsFull}
            aria-keyshortcuts="v"
            data-key="V"
            data-device="cam"
            data-camera-slots={session.cameraSlotsFull ? 'full' : undefined}
            title={`${camLabel} · V`}
            aria-label={camLabel}
            onClick={session.toggleCam}
          >
            {session.camOn ? <CamIcon /> : <CamOffIcon />}
          </button>
          <span className="dock-sep" aria-hidden="true" />
          {canShareScreen && (
            <button
              type="button"
              className={`control ${iAmSharing ? 'control-active' : ''}`}
              aria-pressed={iAmSharing}
              aria-label={screenLabel}
              aria-keyshortcuts="s"
              disabled={screensFull}
              data-key="S"
              title={`${screenLabel} · S`}
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
          )}
          {/* The shelf sits with the screen key: both are things you put
              INTO the room, as opposed to what your own devices do. */}
          <button
            type="button"
            className={`control ${toolsOpen || hasLiveTool(session.tools) ? 'control-active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={toolsOpen}
            aria-label={t('controls.tools')}
            aria-keyshortcuts="t"
            data-key="T"
            title={`${t('controls.tools')} · T`}
            onClick={() => {
              setToolDraft('');
              setToolsOpen((open) => !open);
            }}
          >
            <ToolboxIcon />
          </button>
          <button
            type="button"
            className={`control ${settingsOpen ? 'control-active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            aria-label={t('controls.settings')}
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
          <span className="dock-sep" aria-hidden="true" />
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
          <span className="dock-sep" aria-hidden="true" />
          <button
            ref={setChatButton}
            type="button"
            className={`control ${chatOpen ? 'control-active' : ''}`}
            aria-pressed={chatOpen}
            aria-keyshortcuts="c"
            data-key="C"
            title={`${chatLabel} · C`}
            // The badge is decorative, so the count is spoken here instead.
            aria-label={
              !chatOpen && unread > 0
                ? `${chatLabel} — ${unread} ${t('chat.unread', { count: unread })}`
                : chatLabel
            }
            onClick={() => setChatOpen((open) => !open)}
          >
            <ChatIcon />
          </button>
          <span className="dock-sep" aria-hidden="true" />
          <button
            type="button"
            className="control control-leave"
            aria-label={t('controls.leave')}
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
