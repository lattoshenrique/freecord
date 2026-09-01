import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import LiquidGlass from 'liquid-glass-react';
import { Link } from 'react-router-dom';
import type { RoomSummary } from '../api';
import { renderMarkdown } from '../lib/markdown';
import { playMessageChime } from '../lib/notification-sound';
import { useI18n } from '../i18n';
import { desktopSystemAudio, isDesktopApp } from '../lib/platform';
import { MAX_PARTICIPANTS } from '../lib/protocol';
import { SCREEN_QUALITY_PRESETS } from '../lib/screen-quality';
import type { ScreenStats } from '../lib/stats';
import { useRoomSession, type JoinOptions } from '../lib/use-room';
import { useSpeaking } from '../lib/use-speaking';
import Avatar from './Avatar';
import ChatComposer from './ChatComposer';
import FileTransferBubble from './FileTransferBubble';
import { MAX_FILE_BYTES, formatBytes } from '../lib/file-transfer';
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
  FullscreenIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  ScreenIcon,
  SlidersIcon,
} from './icons';

/** Faixas de latência: verde conversa bem, âmbar arrasta, vermelho atrapalha. */
function latencyGrade(ms: number): 'good' | 'fair' | 'poor' {
  return ms < 100 ? 'good' : ms < 250 ? 'fair' : 'poor';
}

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

/** What is actually going out or coming in — not what was asked for. */
function ScreenStatsBar({ stats }: { stats: ScreenStats }) {
  const { t } = useI18n();
  const parts: string[] = [];
  if (stats.width && stats.height) {
    parts.push(`${stats.width}×${stats.height}`);
  }
  if (stats.fps !== null) {
    parts.push(`${Math.round(stats.fps)} fps`);
  }
  if (stats.kbps !== null) {
    parts.push(formatBitrate(stats.kbps));
  }
  if (stats.relayMode !== null) {
    // Debug telemetry, not copy: which forwarding path this relay's
    // children ride (encoded passthrough vs re-encode).
    parts.push(stats.relayMode);
  }
  if (parts.length === 0 && stats.rttMs === null) {
    return null;
  }
  return (
    <span className="screen-stats">
      {stats.direction === 'sending' ? t('screen.sending') : t('screen.receiving')}
      {parts.length > 0 && ` · ${parts.join(' · ')}`}
      {stats.rttMs !== null && (
        <>
          {' · '}
          <span className={`latency-dot latency-${latencyGrade(stats.rttMs)}`} aria-hidden />
          {stats.rttMs} ms
        </>
      )}
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

function AudioSink({ stream, sinkId }: { stream: MediaStream; sinkId?: string | null }) {
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
  return <audio ref={ref} autoPlay />;
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
  speaking,
  cameraOn,
  stream,
  latencyMs,
  latencyTitle,
  style,
  sinkId,
}: {
  name: string;
  isSelf: boolean;
  micOff: boolean;
  speaking: boolean;
  /**
   * The room's word, not the track's: a remote track stays `enabled` on the
   * receiver even after the sender turns its camera off (black frames keep
   * flowing), so only the camera roster can say whether this tile has a face.
   */
  cameraOn: boolean;
  stream: MediaStream | null;
  latencyMs: number | null;
  latencyTitle: string;
  style?: React.CSSProperties;
  /** Playback device for a remote peer's audio; self tiles pass none. */
  sinkId?: string | null;
}) {
  const { t } = useI18n();
  const showVideo = cameraOn && stream !== null && hasLiveVideo(stream);
  return (
    <div className="tile" data-speaking={speaking ? 'true' : undefined} style={style}>
      <LatencyChip ms={latencyMs} title={latencyTitle} />
      {showVideo ? (
        <MediaView
          stream={stream}
          muted={isSelf}
          className={`tile-video ${isSelf ? 'mirrored' : ''}`}
          sinkId={isSelf ? undefined : sinkId}
        />
      ) : (
        <>
          <Avatar name={name} className="tile-avatar" />
          {!isSelf && stream && <AudioSink stream={stream} sinkId={sinkId} />}
        </>
      )}
      <span className="tile-name">
        {micOff && (
          <span className="tile-mic-off" title={t('room.micMuted')}>
            <MicOffIcon />
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
  const [chatOpen, setChatOpen] = useState(false);
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

  // Sound alert: only for someone else's message, chat open or not.
  const soundedCountRef = useRef(0);
  const { chat, selfId } = session;

  /** Text and files share one stream, ordered by when they happened. */
  const timeline = useMemo(() => {
    type Entry =
      | { kind: 'text'; key: string; ts: number; message: (typeof session.chat)[number] }
      | { kind: 'file'; key: string; ts: number; transfer: (typeof session.transfers)[number] };
    const entries: Entry[] = session.chat.map((message, index) => ({
      kind: 'text',
      key: `${message.ts}-${index}`,
      ts: message.ts,
      message,
    }));
    for (const transfer of session.transfers) {
      entries.push({ kind: 'file', key: transfer.key, ts: transfer.ts, transfer });
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
        case 'v':
          // Same path as the button — the server's slot request flow,
          // never the track directly; mirrors the button's disabled state.
          if (!current.cameraSlotsFull) {
            current.toggleCam();
          }
          return;
        case 's': {
          const sharing = current.screen !== null && current.screen.id === current.selfId;
          if (sharing) {
            current.stopScreenShare();
          } else if (current.screen === null) {
            void current.startScreenShare();
          }
          return;
        }
        case 'c':
          setChatOpen((open) => !open);
          return;
        case 'q': {
          // Only while sharing: cycling a preset nobody is sending is invisible.
          if (current.screen === null || current.screen.id !== current.selfId) {
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

  // Computado a cada render de propósito: streams remotos chegam por
  // a mesh notification (a re-render with no React state change) — a
  // useMemo aqui devolveria o valor cacheado e nunca veria o stream.
  // In the relay tree the screen arrives from the PARENT (screenSource), which
  // may be a relay rather than the person sharing.
  const screenStream = !session.screen
    ? null
    : session.screen.id === session.selfId
      ? session.localScreen
      : session.screenSource
        ? (session.mesh
            ?.getPeerStreams(session.screenSource.id)
            .find((stream) => stream.id === session.screenSource?.streamId) ?? null)
        : null;

  const participantCount = session.peers.length + 1;
  // Only real faces get grid area. Ghost seat tiles were tried and retired:
  // sizing the grid by all 12 seats shrank one person to a twelfth of the
  // screen in an empty room. Capacity lives in the header's seat counter.
  // With a screen on stage the tiles collapse to the strip.
  const grid = useTileGrid(screenStream ? 0 : participantCount);

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
    return (
      <main className="centered fade-in">
        <div className="spinner" aria-hidden />
        <p>{t('room.connecting')}</p>
      </main>
    );
  }

  const iAmSharing = session.screen !== null && session.screen.id === session.selfId;
  const someoneElseSharing = session.screen !== null && session.screen.id !== session.selfId;
  const sharerName = someoneElseSharing
    ? (session.peers.find((p) => p.id === session.screen?.id)?.name ?? t('room.someone'))
    : null;
  // Received through a tree relay: the RTT shown is to it, not to the source.
  const relayName =
    someoneElseSharing && session.screenSource && session.screenSource.id !== session.screen?.id
      ? (session.peers.find((p) => p.id === session.screenSource?.id)?.name ?? 'relay')
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
  const hudRelay = session.screen ? (hudStats?.relayMode ?? relayName) : null;
  if (hudRelay) {
    hudMetrics.push({ label: 'relay', value: hudRelay });
  }

  const screenAudioStream = someoneElseSharing
    ? (session.mesh
        ?.getPeerStreams(session.screen!.id)
        .find(
          (stream) => stream.id === session.screen?.streamId && stream.getAudioTracks().length > 0,
        ) ?? null)
    : null;

  const tileStyle = !screenStream && grid.size ? { width: grid.size.width, height: grid.size.height } : undefined;

  return (
    <div className="room-layout">
      {screenAudioStream && (
        <AudioSink stream={screenAudioStream} sinkId={session.audioDevices.speakerId} />
      )}
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
      </header>

      <div className="room-body">
        <div className="stage-area">
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
          {screenStream && (
            <div
              className={`screen-stage fade-in ${fullscreen.active ? 'is-fullscreen' : ''}`}
              ref={stageRef}
              onDoubleClick={fullscreen.toggle}
            >
              <MediaView
                stream={screenStream}
                muted
                className="screen-video"
                videoRef={screenVideoRef}
              />
              <button
                type="button"
                className="screen-fullscreen"
                aria-pressed={fullscreen.active}
                title={fullscreen.active ? t('screen.exitFullscreen') : t('screen.enterFullscreen')}
                aria-label={
                  fullscreen.active ? t('screen.exitFullscreen') : t('screen.enterFullscreen')
                }
                onClick={fullscreen.toggle}
              >
                {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
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
          <div
            className={screenStream ? 'tiles tiles-strip' : 'tiles tiles-grid'}
            ref={grid.ref}
          >
            <Tile
              name={options.name}
              isSelf
              micOff={!session.micOn}
              speaking={session.selfId !== null && speaking.has(session.selfId)}
              cameraOn={session.camOn}
              stream={session.localMedia && session.camOn ? session.localMedia : null}
              latencyMs={session.signalRttMs}
              latencyTitle={t('latency.signal')}
              style={tileStyle}
            />
            {session.peers.map((peer) => {
              const streams = session.mesh?.getPeerStreams(peer.id) ?? [];
              const cameraStream =
                streams.find(
                  (stream) =>
                    stream.id !== session.screen?.streamId &&
                    stream.id !== session.screenSource?.streamId,
                ) ?? null;
              return (
                <Tile
                  key={peer.id}
                  name={peer.name}
                  isSelf={false}
                  micOff={false}
                  speaking={speaking.has(peer.id)}
                  cameraOn={session.cameras.has(peer.id)}
                  stream={cameraStream}
                  latencyMs={session.peerLatency.get(peer.id)?.rttMs ?? null}
                  latencyTitle={t('latency.peer', { name: peer.name })}
                  style={tileStyle}
                  sinkId={session.audioDevices.speakerId}
                />
              );
            })}
          </div>
        </div>

        {chatOpen && (
          <aside className="chat-panel">
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
                  const { transfer } = entry;
                  return (
                    <FileTransferBubble
                      key={transfer.key}
                      transfer={transfer}
                      peerName={peerName(transfer.peerId)}
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
                    {message.unreadable ? (
                      <p className="chat-locked">{t('chat.locked')}</p>
                    ) : (
                      <div className="chat-md">{renderMarkdown(message.text)}</div>
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
              maxLength={500}
              locked={session.chatLocked}
              onChange={setDraft}
              onSend={() => {
                const text = draft.trim();
                if (text) {
                  session.sendChat(text);
                  setDraft('');
                }
              }}
              onAttach={() => fileInputRef.current?.click()}
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
        <LiquidGlass
          cornerRadius={999}
          padding="8px 12px"
          displacementScale={44}
          blurAmount={0.06}
          saturation={160}
          aberrationIntensity={2}
          elasticity={0}
          className="dock-glass"
        >
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
            disabled={someoneElseSharing}
            data-key="S"
            title={
              someoneElseSharing
                ? t('controls.someoneSharing')
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
        </LiquidGlass>
      </footer>
    </div>
  );
}
